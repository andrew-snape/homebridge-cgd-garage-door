// Camera snapshots are rarely requested but expensive on a single-connection
// device, so keep the last frame and share one capture between callers.
const SNAPSHOT_TTL_MS = 10000;

export default class SnapshotCache {
  private last?: { buffer: Buffer; at: number; width: number; height: number };
  private readonly inFlight = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly capture: (width: number, height: number) => Promise<Buffer>,
    // While a door/lamp/vacation command is pending, don't compete with it for the device.
    private readonly isBusy: () => boolean,
    private readonly ttlMs = SNAPSHOT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get = (width: number, height: number): Promise<Buffer> => {
    const last = this.last;

    if (last && last.width === width && last.height === height && this.now() - last.at < this.ttlMs) {
      return Promise.resolve(last.buffer);
    }

    // A stale frame of any size beats queueing behind a command.
    if (last && this.isBusy()) {
      return Promise.resolve(last.buffer);
    }

    const key = `${width}x${height}`;
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.capture(width, height)
        .then((buffer) => {
          this.last = { buffer, at: this.now(), width, height };
          return buffer;
        })
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }

    return pending;
  };
}
