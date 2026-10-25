import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CGDGarageDoor } from '../../src/CGDGarageDoor.js';
import { installFakeDevice, silentLog } from './helpers.js';

const TIMINGS = { retryDelayMs: 1, confirmIntervalMs: 5, confirmDoorTimeoutMs: 60, confirmSwitchTimeoutMs: 60 };

const make = () => {
  const door = new CGDGarageDoor(silentLog, { deviceHostname: 'device.test', deviceLocalKey: 'test-key' }, {
    autoPoll: false,
    timings: TIMINGS,
  });
  // Private members are reachable at runtime; tests drive them directly.
  const internals = door as unknown as {
    refreshStatus: () => Promise<void>;
    updatingCount: number;
    status?: Record<string, string>;
  };
  return { door, internals };
};

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

test('a command is sent once even if the expected state never shows up', async () => {
  const device = installFakeDevice({ door: 'Closed' });
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    // Stop on an already-closed door: the device never reports Stopped.
    await door.triggerStop();
    await settle();

    assert.equal(device.requests.filter((r) => r === 'door=stop').length, 1);
    assert.ok(device.requests.some((r) => r === 'status=json'), 'polled status while confirming');
    assert.equal(internals.updatingCount, 0);
    // Optimistic state reverted after the confirmation timeout.
    assert.equal(internals.status?.door, 'Closed');
  } finally {
    device.restore();
  }
});

test('a command is re-sent only when the send fails, then confirmed without re-sending', async () => {
  const device = installFakeDevice();
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    let failures = 2;
    device.failWhen = (request) => request === 'lamp=on' && failures-- > 0;

    await door.setLightbulb(true);
    await settle();

    assert.equal(device.requests.filter((r) => r === 'lamp=on').length, 3);
    assert.equal(internals.status?.lamp, 'on');
    assert.equal(internals.updatingCount, 0);
  } finally {
    device.restore();
  }
});

test('a status poll makes a single attempt and records the failure', async () => {
  const device = installFakeDevice();
  try {
    const { internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;
    device.failWhen = () => true;

    await internals.refreshStatus();

    assert.deepEqual(device.requests, ['status=json']);
    assert.equal((internals as unknown as { consecutiveFailures: number }).consecutiveFailures, 1);
  } finally {
    device.restore();
  }
});

test('a superseded queued command settles without running and the updating counter returns to 0', async () => {
  const device = installFakeDevice();
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    // First lamp command runs; second and third queue behind it, third supersedes second.
    const first = door.setLightbulb(true);
    const second = door.setLightbulb(false);
    const third = door.setLightbulb(true);

    assert.equal(internals.updatingCount, 3);

    await Promise.all([first, second, third]);
    await settle();

    assert.equal(internals.updatingCount, 0, 'counter returned to zero');
    // `first` ran, `second` was superseded (never sent), `third` ran.
    assert.equal(device.requests.filter((r) => r === 'lamp=off').length, 0);
    assert.equal(device.requests.filter((r) => r === 'lamp=on').length, 2);
  } finally {
    device.restore();
  }
});

test('the updating counter does not leak when a command fails outright', async () => {
  const device = installFakeDevice();
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.failWhen = (request) => request.startsWith('vacation=');

    await door.setVacation(true);
    await settle();

    assert.equal(internals.updatingCount, 0);
    assert.equal(internals.status?.vacation, 'off', 'optimistic state reverted');
  } finally {
    device.restore();
  }
});

test('getters return undefined for unknown state instead of -1', () => {
  const { door } = make();

  assert.equal(door.getCurrentDoorState(), undefined);
  assert.equal(door.getTargetDoorState(), undefined);
  assert.equal(door.getLightbulb(), undefined);
  assert.equal(door.getVacation(), undefined);
});
