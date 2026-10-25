import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CGDGarageDoor } from '../../src/CGDGarageDoor.js';
import { readNumber } from '../../src/config.js';
import { CGDCameraPlatform } from '../../src/platform.js';
import { captureLog, installFakeDevice } from './helpers.js';

interface Internals {
  refreshStatus: () => Promise<void>;
  nextPollDelay: () => number;
  lastRawDoorValue?: string;
  updatingCount: number;
  consecutiveFailures: number;
  transitionStartedAt?: number;
  status?: Record<string, string>;
}

const make = (config: Record<string, unknown> = {}) => {
  const { log, lines } = captureLog();
  const door = new CGDGarageDoor(log, { deviceHostname: 'device.test', deviceLocalKey: 'test-key', ...config }, {
    autoPoll: false,
    timings: { retryDelayMs: 1, confirmIntervalMs: 5, healthIntervalMs: 0 },
  });
  const internals = door as unknown as Internals;
  return { door, internals, lines, refresh: () => internals.refreshStatus() };
};

test('nextPollDelay is fast while moving or updating, slow when idle, and backs off after failures', () => {
  const { internals } = make();

  internals.lastRawDoorValue = 'Closed by WiFi';
  assert.equal(internals.nextPollDelay(), 10000);

  internals.lastRawDoorValue = 'Opening by WiFi';
  assert.equal(internals.nextPollDelay(), 1500);

  internals.lastRawDoorValue = 'Closed by WiFi';
  internals.updatingCount = 1;
  assert.equal(internals.nextPollDelay(), 1500);
  internals.updatingCount = 0;

  const delays = [1, 2, 3, 4, 5].map((failures) => {
    internals.consecutiveFailures = failures;
    return internals.nextPollDelay();
  });
  assert.deepEqual(delays, [10000, 20000, 40000, 60000, 60000]);
});

test('poll intervals and the failure threshold come from config', () => {
  const { internals } = make({ pollIntervalSeconds: 30, pollIntervalMovingSeconds: 2 });

  assert.equal(internals.nextPollDelay(), 30000);
  internals.lastRawDoorValue = 'Closing by WiFi';
  assert.equal(internals.nextPollDelay(), 2000);
});

test('the device is unreachable after 3 failed polls and recovers on the next success', async () => {
  const device = installFakeDevice();
  try {
    const { door, refresh } = make();
    let updates = 0;
    door.onStatusUpdate(() => updates++);

    await refresh();
    updates = 0;
    device.failWhen = () => true;

    await refresh();
    await refresh();
    assert.equal(door.isDeviceUnreachable(), false);
    assert.equal(updates, 0);
    await refresh();
    assert.equal(door.isDeviceUnreachable(), true);
    assert.equal(updates, 1);

    device.failWhen = undefined;
    await refresh();
    assert.equal(door.isDeviceUnreachable(), false);
    assert.equal(updates, 2);
  } finally {
    device.restore();
  }
});

test('unreachableAfterFailures is configurable', async () => {
  const device = installFakeDevice();
  try {
    const { door, refresh } = make({ unreachableAfterFailures: 1 });
    await refresh();
    device.failWhen = () => true;
    await refresh();
    assert.equal(door.isDeviceUnreachable(), true);
  } finally {
    device.restore();
  }
});

test('the transition watchdog sticks, clears when the raw value changes, and can be disabled', async () => {
  const device = installFakeDevice({ door: 'Opening by WiFi' });
  try {
    const { internals, refresh } = make();
    await refresh();

    // Not yet timed out: the real value is shown.
    assert.equal(internals.status?.door, 'Opening by WiFi');

    internals.transitionStartedAt = Date.now() - 61000;
    await refresh();
    assert.equal(internals.status?.door, 'Stopped', 'fires after the timeout');

    await refresh();
    await refresh();
    assert.equal(internals.status?.door, 'Stopped', 'sticks while the raw value is unchanged');

    device.state.door = 'Opened by WiFi';
    await refresh();
    assert.equal(internals.status?.door, 'Opened by WiFi', 'clears when the raw value changes');
    assert.equal(internals.transitionStartedAt, undefined);
  } finally {
    device.restore();
  }
});

test('the transition watchdog is disabled when the timeout is 0', async () => {
  const device = installFakeDevice({ door: 'Opening by WiFi' });
  try {
    const { internals, refresh } = make({ transitionTimeoutSeconds: 0 });
    await refresh();
    internals.transitionStartedAt = Date.now() - 600000;
    await refresh();

    assert.equal(internals.status?.door, 'Opening by WiFi');
  } finally {
    device.restore();
  }
});

test('weak Wi-Fi signal warns once and only recovers above the hysteresis threshold', async () => {
  const device = installFakeDevice({ wdBm: '-80' });
  try {
    const { lines, refresh } = make();
    const weak = () => lines.filter((l) => l.includes('Weak Wi-Fi signal')).length;
    const recovered = () => lines.filter((l) => l.includes('signal at the door controller recovered')).length;

    await refresh();
    await refresh();
    assert.equal(weak(), 1);

    device.state.wdBm = '-72';
    await refresh();
    assert.equal(recovered(), 0, 'between -75 and -70 is not recovered');

    device.state.wdBm = '-65';
    await refresh();
    assert.equal(recovered(), 1);

    device.state.wdBm = '-80';
    await refresh();
    assert.equal(weak(), 2);
  } finally {
    device.restore();
  }
});

test('readNumber falls back to the default with one warning on invalid values', () => {
  const { log, lines } = captureLog();
  const opts = { min: 1, max: 100 };

  assert.equal(readNumber(log, {}, 'k', 10, opts), 10);
  assert.equal(readNumber(log, { k: 5 }, 'k', 10, opts), 5);
  assert.equal(lines.length, 0);

  assert.equal(readNumber(log, { k: -3 }, 'k', 10, opts), 10);
  assert.equal(readNumber(log, { k: 'fast' }, 'k', 10, opts), 10);
  assert.equal(readNumber(log, { k: 0.5 }, 'k', 10, { min: 1, max: 100, integer: true }), 10);
  assert.equal(readNumber(log, { k: Infinity }, 'k', 10, opts), 10);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((l) => l.startsWith('warn:')));
  assert.equal(readNumber(log, { k: 0 }, 'k', 10, { min: 0, max: 100 }), 0);
  assert.equal(readNumber(log, { k: 101 }, 'k', 10, opts), 10, 'above the maximum');
});

test('the platform reports unknown state to HomeKit as a communication failure', () => {
  class HapStatusError extends Error {
    constructor(public hapStatus: number) {
      super('hap');
    }
  }
  const api = { hap: { HapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 } } };
  const { log } = captureLog();
  // Without a hostname/key the constructor stops early, so no Homebridge harness is needed.
  const platform = new CGDCameraPlatform(log, { platform: 'CGDGarageDoor' } as never, api as never);
  const knownOrThrow = (platform as unknown as { knownOrThrow: (v: number | undefined) => number }).knownOrThrow.bind(platform);

  assert.equal(knownOrThrow(0), 0);
  assert.equal(knownOrThrow(3), 3);
  assert.throws(() => knownOrThrow(undefined), (error: HapStatusError) => error instanceof HapStatusError && error.hapStatus === -70402);
});
