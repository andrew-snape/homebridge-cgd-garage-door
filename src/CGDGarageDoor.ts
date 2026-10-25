import type { CharacteristicValue, Logging } from 'homebridge';
import Mutex from './mutex.js';
import parseDoorState, { DoorState } from './parseDoorState.js';
import retry, { RETRY_DELAY_MS } from './retry.js';

interface Status {
  lamp: 'on' | 'off';
  door: string;
  dt: string;
  vacation: 'on' | 'off';
  cycles: string;
  wdBm: string;
  error: string;
  camera: string;
  status: string;
}

interface Config {
  deviceHostname: string;
  deviceLocalKey: string;
  transitionTimeoutSeconds?: number;
}

type StatusUpdateListener = () => void;

// Injectable so tests don't have to wait out real device timings.
export interface Timings {
  // Gap between attempts when re-sending a command that failed on the network/HTTP level.
  retryDelayMs: number;
  // Gap between status checks while waiting to see a sent command take effect.
  confirmIntervalMs: number;
  // How long to wait for the expected state before giving up (the door takes
  // ~19s to open and ~13s to close, but the accepted states include the
  // transitional Opening/Closing, so it normally shows within a few seconds).
  confirmDoorTimeoutMs: number;
  confirmSwitchTimeoutMs: number;
}

export interface Options {
  timings?: Partial<Timings>;
  // Tests turn the background poll loop off.
  autoPoll?: boolean;
}

const DEFAULT_TIMINGS: Timings = {
  retryDelayMs: RETRY_DELAY_MS,
  confirmIntervalMs: 1500,
  confirmDoorTimeoutMs: 10000,
  confirmSwitchTimeoutMs: 5000,
};

// Poll quickly while the door is moving so HomeKit tracks it, slowly when idle
// to go easy on a device that only handles one connection at a time, and back
// off exponentially while it isn't answering.
const POLL_TRANSITION_MS = 1500;
const POLL_IDLE_MS = 10000;
const POLL_BACKOFF_MAX_MS = 60000;
// Consecutive failed polls (the next poll is the retry) before HomeKit shows "No Response".
const UNREACHABLE_AFTER_FAILURES = 3;
const WEAK_SIGNAL_DBM = -75;
// Hysteresis so a signal hovering around the threshold doesn't log on every poll.
const SIGNAL_RECOVERED_DBM = -70;

// The device's documented local API command set (see the CGD app's "Local API" screen):
// status=json, door=[open|stop|close], lamp=[on|off], vacation=[on|off]
type ApiCall =
  | { cmd: 'status'; value: 'json' }
  | { cmd: 'door'; value: 'open' | 'stop' | 'close' }
  | { cmd: 'lamp'; value: 'on' | 'off' }
  | { cmd: 'vacation'; value: 'on' | 'off' };

export class CGDGarageDoor {
  private readonly log: Logging;
  private config: Config;
  private status?: Status;
  private statusUpdateListener?: StatusUpdateListener;
  // A count rather than a flag: overlapping commands each hold it, so the first
  // to finish can't clear it while others are still pending.
  private updatingCount = 0;
  private runQ: { name: string; fn: () => Promise<unknown>; supersede: () => void }[] = [];
  private transitionStartedAt?: number;
  // The raw door value last reported by the device, tracked separately from
  // `status.door` (which the transition watchdog below may override to
  // 'Stopped' for display). Without this, a device stuck reporting the same
  // Opening/Closing value forever would look "freshly transitional" again on
  // every poll once its displayed state got overridden, and the watchdog
  // would flap instead of sticking.
  private lastRawDoorValue?: string;
  // The device only reliably handles one connection at a time — this
  // serializes our own HTTP calls against each other and, via
  // withDeviceLock, against the camera snapshot ffmpeg calls too.
  private deviceMutex = new Mutex();
  private consecutiveFailures = 0;
  private unreachable = false;
  private weakSignalWarned = false;
  private readonly timings: Timings;

  constructor(log: Logging, config: Config, options: Options = {}) {
    this.log = log;
    this.config = config;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };

    if (options.autoPoll ?? true) {
      this.poolStatus();
    }
  }

  private get isUpdating() {
    return this.updatingCount > 0;
  }

  private withRunQ = async (key: string, fn: () => Promise<unknown>) => new Promise((resolve, reject) => {
    this.log.debug('Adding to queue');

    // The first item may already be running, so leave it alone; any later item
    // for the same key is stale. Settle it (without running it, so its revert
    // never fires) so its caller doesn't wait forever.
    const [running, ...waiting] = this.runQ;
    if (running) {
      this.runQ = [running, ...waiting.filter((item) => {
        if (item.name !== key) {
          return true;
        }
        this.log.debug(`Superseding queued ${key} command`);
        item.supersede();
        return false;
      })];
    }

    this.runQ.push({
      name: key,
      supersede: () => resolve(undefined),
      fn: async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
    });

    if (this.runQ.length === 1) {
      this.log.debug('Start RunQ');
      this.processRunQ();
    }
  });

  private processRunQ = async () => {
    this.log.debug('Start Processing RunQ', this.runQ.length);
    if (this.runQ.length === 0) {
      this.log.debug('Queue is empty');
      return;
    }

    const item = this.runQ[0];

    try {
      await item.fn();
    } finally {
      this.runQ.shift();
      this.log.debug('Finished Processing RunQ');
      this.processRunQ();
    }
  };

  // A single, bare HTTP round-trip to the device — no mutex, no retry. Callers
  // that need serialization against other device traffic (camera snapshots,
  // other commands) must wrap this in deviceMutex.runExclusive themselves;
  // see the note on `confirmState` below for why the mutex can't just be baked in here.
  private fetchDevice = async (cmd: string, value: string): Promise<unknown> => {
    this.log.debug(`Running command: ${cmd}=${value}`);

    const { deviceHostname, deviceLocalKey } = this.config;
    // Node's built-in fetch (undici) keeps connections alive by default,
    // so no custom keep-alive agent is required.
    const response = await fetch(`http://${deviceHostname}/api?key=${deviceLocalKey}&${cmd}=${value}`, {
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json();

    const level = response.ok ? 'debug' : 'error';
    this.log[level](response.status.toString());
    this.log[level](JSON.stringify(data));

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}, ${JSON.stringify(data)}`);
    }

    return data;
  };

  private run = async ({
    cmd, value,
    softValue = value,
    confirm,
  }: ApiCall & {
    softValue?: string;
    // The expected state to wait for once the command has been sent.
    confirm?: { check: (status: Status) => boolean; timeoutMs: number };
  }): Promise<unknown> => {
    const fn = async () => {
      this.log.debug(`Setting ${cmd} to ${softValue}`);
      let oldStatus: Status | undefined;

      if (this.status?.[cmd]) {
        oldStatus = { ...this.status };
        // softValue is an optimistic placeholder for whichever field `cmd` names,
        // not necessarily one of that field's real device values (e.g. 'Opening').
        (this.status as unknown as Record<string, string>)[cmd] = softValue;

        if (!this.isStatusEqual(oldStatus)) {
          this.log.debug(`Updating ${cmd} to ${softValue}`);

          // Start the transition watchdog when we optimistically enter a transitional state.
          if (cmd === 'door') {
            const doorState = parseDoorState(softValue);
            if (doorState === DoorState.Opening || doorState === DoorState.Closing) {
              this.transitionStartedAt = Date.now();
              this.log.debug(`Transitional state started (optimistic): ${softValue}`);
            } else {
              this.transitionStartedAt = undefined;
            }
          }

          this.statusUpdateListener?.();
        }
      }

      const revert = () => {
        if (oldStatus) {
          this.log.debug(`Reverting ${cmd}`);
          this.status = oldStatus;
          this.transitionStartedAt = undefined;
          this.statusUpdateListener?.();
        }
      };

      return this.deviceMutex.runExclusive(async () => {
        let failed = false;

        // Only the send is retried, and only when it fails outright. A status
        // poll gets a single attempt: the next poll is its retry, and holding
        // the mutex through several slow attempts would block door commands.
        const data = await retry(() => this.fetchDevice(cmd, value), {
          retries: cmd === 'status' ? 0 : 3,
          delayMs: this.timings.retryDelayMs,
          onRetry: (error, retries) => {
            this.log.warn(`Failed to run command [${retries} retries]: ${cmd}=${value}`);
            if (error instanceof Error) {
              this.log.warn(`Error: ${error.message}`);
              if (error.cause) {
                this.log.warn(`Cause: ${String(error.cause)}`);
              }
            }
          },
          onRecover: (retries) => {
            this.log.info(`Recovered to run command [${retries} retries]: ${cmd}=${value}`);
          },
          onFail: (error) => {
            failed = true;
            this.log.error(`Failed to run command: ${cmd}=${value}`);
            if (error instanceof Error) {
              this.log.error(`Error: ${error.message}`);
              if (error.cause) {
                this.log.error(`Cause: ${String(error.cause)}`);
              }
            }

            revert();
          },
        });

        if (!failed && confirm && !await this.confirmState(confirm.check, confirm.timeoutMs)) {
          // Don't re-send: the command was accepted, the device is just slow
          // (or ignored it). Show the real state again; the regular poll
          // will correct it if it was merely late.
          this.log.warn(`Did not see the expected state after ${cmd}=${value} within ${confirm.timeoutMs / 1000}s`);
          revert();
        }

        return data;
      });
    };

    if (confirm) {
      return this.withRunQ(cmd, fn);
    }

    return fn();
  };

  private withIsUpdating = async <T>(fn: () => Promise<T>): Promise<void> => {
    this.updatingCount++;
    this.log.debug('Updating is in progress...');

    try {
      await fn();
    } finally {
      this.updatingCount--;
      this.log.debug('Updating is finished');
    }
  };

  // Polls status for the expected state after a command has been sent. This
  // runs *inside* the deviceMutex.runExclusive section already executing for
  // the in-flight door/lamp/vacation command (see `run` above). deviceMutex
  // isn't reentrant — it's just a promise chain — so calling back into
  // deviceMutex.runExclusive from here (as going through the normal
  // getStatus()/run() path would) would queue behind that very command's own
  // still-pending promise and deadlock the whole device forever, hanging
  // isUpdating as true until Homebridge is restarted. Since we're already
  // serialized against other device traffic by virtue of running inside that
  // command's exclusive section, check status directly.
  private confirmState = async (check: (status: Status) => boolean, timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, this.timings.confirmIntervalMs));

      let status: Status | undefined;
      try {
        status = await this.fetchDevice('status', 'json') as Status;
      } catch (error) {
        this.log.warn(`Failed to check status while waiting: ${error}`);
      }

      this.log.debug(`Checking status... ${JSON.stringify(status)}`);

      if (status && check(status)) {
        return true;
      }
    }

    return false;
  };

  private doorConfirm = (check: (status: Status) => boolean) => ({ check, timeoutMs: this.timings.confirmDoorTimeoutMs });

  private switchConfirm = (check: (status: Status) => boolean) => ({ check, timeoutMs: this.timings.confirmSwitchTimeoutMs });

  private getStatus = async (): Promise<Status | undefined> => {
    this.log.debug('Getting status...');

    const data = await this.run({
      cmd: 'status', value: 'json',
      softValue: (new Date()).toLocaleString(),
    });

    if (!data) {
      this.log.error('Can not get status!');

      return;
    }

    return data as Status;
  };

  private refreshStatus = async () => {
    this.log.debug(`Refreshing status... ${this.isUpdating}`);
    if (this.isUpdating) {
      this.log.debug('Skip refreshing status because it is updating');

      return;
    }

    const status = await this.getStatus();
    if (!status) {
      // A failed poll (network hiccup, device busy, etc.) is not the same as
      // the door having no state — keep displaying the last known-good status
      // rather than wiping it out from under the accessory.
      this.recordPollFailure();

      return;
    }

    if (this.isUpdating) {
      this.log.info('Skip updating status because it is updating');
      return;
    }

    this.recordPollSuccess(status);

    // Track continuity of the *real* device-reported door value, independent of
    // whatever we end up displaying (the watchdog below may override it to
    // 'Stopped'). Comparing against the displayed value instead would make a
    // device that's genuinely stuck reporting the same Opening/Closing value
    // look "freshly transitional" again on every poll once overridden, so the
    // watchdog would flap between Stopped and Opening/Closing forever instead
    // of sticking.
    const rawDoorChanged = status.door !== this.lastRawDoorValue;
    this.lastRawDoorValue = status.door;

    const doorState = parseDoorState(status.door);
    const isTransitional = doorState === DoorState.Opening || doorState === DoorState.Closing;

    if (rawDoorChanged) {
      if (isTransitional) {
        this.transitionStartedAt = Date.now();
        this.log.debug(`Transitional state started: ${status.door}`);
      } else {
        this.transitionStartedAt = undefined;
      }
    }

    const displayStatus = this.applyTransitionTimeout(status, isTransitional);

    if (this.isStatusEqual(displayStatus)) {
      this.log.debug('Skip updating status because it is equal');

      return;
    }

    this.status = displayStatus;

    if (this.hasDeviceError()) {
      this.log.warn(`CGD device reported error code ${this.status?.error}`);
    }

    this.statusUpdateListener?.();
  };

  // Once a transitional state has persisted too long, override the displayed
  // door value to 'Stopped' so a device stuck reporting Opening/Closing
  // forever doesn't leave HomeKit spinning indefinitely. The override sticks
  // (elapsed only grows) until the device reports a different raw door value,
  // which clears transitionStartedAt above and lets the real value through.
  private applyTransitionTimeout = (status: Status, isTransitional: boolean): Status => {
    if (!isTransitional || !this.transitionStartedAt) {
      return status;
    }

    const configuredSeconds = this.config.transitionTimeoutSeconds ?? 60;
    if (configuredSeconds === 0) {
      return status;
    }

    const elapsed = Date.now() - this.transitionStartedAt;
    if (elapsed < configuredSeconds * 1000) {
      return status;
    }

    if (this.status?.door !== 'Stopped') {
      this.log.warn(
        `Door has been in transitional state (${status.door}) for ${Math.round(elapsed / 1000)}s — resetting to Stopped`,
      );
    }

    return { ...status, door: 'Stopped' };
  };

  private isStatusEqual = (data?: Status) => {
    const values = ['lamp', 'door', 'vacation', 'error'];
    return values.every((value) => this.status?.[value] === data?.[value]);
  };

  private recordPollFailure = () => {
    this.consecutiveFailures++;

    const lastSignal = this.status?.wdBm;
    this.log.error(
      `Skip updating status because the device did not respond [${this.consecutiveFailures} in a row]`
      + (lastSignal ? ` (last reported Wi-Fi signal ${lastSignal} dBm)` : ''),
    );

    if (!this.unreachable && this.consecutiveFailures >= UNREACHABLE_AFTER_FAILURES) {
      this.unreachable = true;
      this.log.warn(`Device unreachable after ${this.consecutiveFailures} failed polls — reporting No Response`);
      this.statusUpdateListener?.();
    }
  };

  private recordPollSuccess = (status: Status) => {
    if (this.unreachable) {
      this.log.info(`Device reachable again after ${this.consecutiveFailures} failed polls`);
      this.unreachable = false;
      // The regular update below only fires when displayed values changed, so
      // clear the "No Response" state explicitly.
      this.statusUpdateListener?.();
    }
    this.consecutiveFailures = 0;

    this.checkSignal(Number(status.wdBm));
  };

  private checkSignal = (dBm: number) => {
    if (Number.isNaN(dBm)) {
      return;
    }

    if (dBm < WEAK_SIGNAL_DBM && !this.weakSignalWarned) {
      this.weakSignalWarned = true;
      this.log.warn(`Weak Wi-Fi signal at the door controller: ${dBm} dBm (below ${WEAK_SIGNAL_DBM})`);
    } else if (dBm > SIGNAL_RECOVERED_DBM && this.weakSignalWarned) {
      this.weakSignalWarned = false;
      this.log.info(`Wi-Fi signal at the door controller recovered: ${dBm} dBm`);
    }
  };

  private nextPollDelay = (): number => {
    if (this.consecutiveFailures > 0) {
      return Math.min(POLL_IDLE_MS * 2 ** (this.consecutiveFailures - 1), POLL_BACKOFF_MAX_MS);
    }

    const doorState = parseDoorState(this.lastRawDoorValue);
    const moving = doorState === DoorState.Opening || doorState === DoorState.Closing;

    return moving || this.isUpdating ? POLL_TRANSITION_MS : POLL_IDLE_MS;
  };

  private poolStatus = async () => {
    await this.refreshStatus();
    setTimeout(this.poolStatus, this.nextPollDelay());
  };

  public onStatusUpdate = (listener: StatusUpdateListener) => {
    this.statusUpdateListener = listener;
  };

  // Lets other consumers of the same device (the camera snapshot delegate)
  // serialize their requests against ours instead of racing them.
  public withDeviceLock = <T>(fn: () => Promise<T>): Promise<T> => this.deviceMutex.runExclusive(fn);

  public isDeviceUnreachable = (): boolean => this.unreachable;

  public hasDeviceError = (): boolean => !!this.status?.error && this.status.error !== '0';

  public getDeviceErrorCode = (): string | undefined => this.status?.error;

  public waitForStatus = () => new Promise<void>((resolve) => {
    this.log.info('Pulse - Ping...');
    const interval = setInterval(() => {
      if (this.status) {
        this.log.info('Pulse - Pong!');
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });

  // Getters return undefined when the state is unknown; HAP rejects any value
  // outside a characteristic's range, so callers must not pass that through.
  public getCurrentDoorState = (): number | undefined => {
    const doorState = parseDoorState(this.status?.door);

    // export declare class CurrentDoorState extends Characteristic {
    //   static readonly UUID: string;
    //   static readonly OPEN = 0;
    //   static readonly CLOSED = 1;
    //   static readonly OPENING = 2;
    //   static readonly CLOSING = 3;
    //   static readonly STOPPED = 4;
    //   constructor();
    // }

    if (doorState === DoorState.Error) {
      this.log.error(`[getDoorCurrentState] Unknown door state: ${doorState}`);
      return undefined;
    }

    return {
      [DoorState.Opened]: 0,
      [DoorState.Closed]: 1,
      [DoorState.Opening]: 2,
      [DoorState.Closing]: 3,
      [DoorState.Stopped]: 4,
    }[doorState];
  };

  public getTargetDoorState = (): number | undefined => {
    const doorState = parseDoorState(this.status?.door);

    // export declare class TargetDoorState extends Characteristic {
    //   static readonly UUID: string;
    //   static readonly OPEN = 0;
    //   static readonly CLOSED = 1;
    //   constructor();
    // }

    if (doorState === DoorState.Error) {
      this.log.error(`[getDoorTargetState] Unknown door state: ${doorState}`);
      return undefined;
    }

    return {
      [DoorState.Opened]: 0,
      [DoorState.Opening]: 0,
      [DoorState.Stopped]: 0,
      [DoorState.Closed]: 1,
      [DoorState.Closing]: 1,
    }[doorState];
  };

  public setTargetDoorState = async (value: number): Promise<void> => {
    this.withIsUpdating(async () => {
      if (value === 0) {
        this.log.debug('Opening door...');
        await this.run({
          cmd: 'door', value: 'open',
          softValue: 'Opening',
          confirm: this.doorConfirm((status) => [DoorState.Opened, DoorState.Opening, DoorState.Stopped].includes(parseDoorState(status.door))),
        });
        this.log.debug('Opened door!');
      }

      if (value === 1) {
        this.log.debug('Closing door...');
        await this.run({
          cmd: 'door', value: 'close',
          softValue: 'Closing',
          confirm: this.doorConfirm((status) => [DoorState.Closed, DoorState.Closing, DoorState.Stopped].includes(parseDoorState(status.door))),
        });
        this.log.debug('Closed door!');
      }
    }).catch((error) => this.log.error(`Unexpected error setting target door state: ${error}`));
  };

  public triggerStop = async (): Promise<void> => {
    this.withIsUpdating(async () => {
      this.log.debug('Stopping door...');
      await this.run({
        cmd: 'door', value: 'stop',
        softValue: 'Stopped',
        confirm: this.doorConfirm((status) => parseDoorState(status.door) === DoorState.Stopped),
      });
      this.log.debug('Stopped door!');
    }).catch((error) => this.log.error(`Unexpected error stopping door: ${error}`));
  };

  public getLightbulb = (): number | undefined => {
    const lampState = this.status?.lamp;

    if (!lampState) {
      this.log.error(`[getLightbulb] Unknown lamp state: ${lampState}`);
      return undefined;
    }

    return {
      on: 1,
      off: 0,
    }[lampState];
  };

  public setLightbulb = async (value: CharacteristicValue): Promise<void> => {
    this.withIsUpdating(async () => {
      if (value) {
        this.log.debug('Turning on lightbulb...');
        await this.run({
          cmd: 'lamp', value: 'on',
          confirm: this.switchConfirm((status) => status.lamp === 'on'),
        });
        this.log.debug('Turned on lightbulb!');
      }

      if (!value) {
        this.log.debug('Turning off lightbulb...');
        await this.run({
          cmd: 'lamp', value: 'off',
          confirm: this.switchConfirm((status) => status.lamp === 'off'),
        });
        this.log.debug('Turned off lightbulb!');
      }
    }).catch((error) => this.log.error(`Unexpected error setting lightbulb: ${error}`));
  };

  public getVacation = (): number | undefined => {
    const vacationState = this.status?.vacation;

    if (!vacationState) {
      this.log.error(`[getVacation] Unknown vacation state: ${vacationState}`);
      return undefined;
    }

    return {
      on: 1,
      off: 0,
    }[vacationState];
  };

  public setVacation = async (value: CharacteristicValue): Promise<void> => {
    this.withIsUpdating(async () => {
      if (value) {
        this.log.debug('Turning on vacation...');
        await this.run({
          cmd: 'vacation', value: 'on',
          confirm: this.switchConfirm((status) => status.vacation === 'on'),
        });
        this.log.debug('Turned on vacation!');
      }

      if (!value) {
        this.log.debug('Turning off vacation...');
        await this.run({
          cmd: 'vacation', value: 'off',
          confirm: this.switchConfirm((status) => status.vacation === 'off'),
        });
        this.log.debug('Turned off vacation!');
      }
    }).catch((error) => this.log.error(`Unexpected error setting vacation mode: ${error}`));
  };
}
