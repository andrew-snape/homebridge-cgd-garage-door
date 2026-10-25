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
    transitionStartedAt?: number;
    consecutiveFailures: number;
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
    device.doorResponds = false;
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
    assert.equal(internals.consecutiveFailures, 1);
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

test('a door command that is confirmed is sent once and shows the device-reported state', async () => {
  const device = installFakeDevice({ door: 'Closed' });
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    await door.setTargetDoorState(0);
    await settle();

    assert.equal(device.requests.filter((r) => r === 'door=open').length, 1);
    assert.equal(internals.status?.door, 'Opening');
    assert.equal(internals.updatingCount, 0);
  } finally {
    device.restore();
  }
});

test('a superseded queued door command is never sent', async () => {
  const device = installFakeDevice({ door: 'Closed' });
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    const first = door.setTargetDoorState(0);
    const second = door.setTargetDoorState(1);
    const third = door.setTargetDoorState(0);
    await Promise.all([first, second, third]);
    await settle();

    assert.equal(device.requests.filter((r) => r === 'door=close').length, 0);
    assert.equal(device.requests.filter((r) => r === 'door=open').length, 2);
    assert.equal(internals.updatingCount, 0);
  } finally {
    device.restore();
  }
});

test('a door command whose reply was lost is not re-sent if the door already moved', async () => {
  const device = installFakeDevice({ door: 'Closed' });
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    let first = true;
    device.onRequest = (request) => {
      if (request === 'door=open' && first) {
        device.state.door = 'Opening';
      }
    };
    device.failWhen = (request) => {
      const fail = request === 'door=open' && first;
      first = first && request !== 'door=open';
      return fail;
    };

    await door.setTargetDoorState(0);
    await settle();

    assert.equal(device.requests.filter((r) => r === 'door=open').length, 1);
    assert.equal(internals.status?.door, 'Opening');
  } finally {
    device.restore();
  }
});

test('a failed poll during a transition leaves the transition watchdog intact', async () => {
  const device = installFakeDevice({ door: 'Opening' });
  try {
    const { internals } = make();
    await internals.refreshStatus();
    const startedAt = internals.transitionStartedAt;
    assert.ok(startedAt);

    device.failWhen = () => true;
    await internals.refreshStatus();
    assert.equal(internals.transitionStartedAt, startedAt);
    assert.equal(internals.status?.door, 'Opening');

    // The door is stuck reporting Opening: once the timeout has passed the watchdog fires.
    device.failWhen = undefined;
    internals.transitionStartedAt = Date.now() - 61000;
    await internals.refreshStatus();
    assert.equal(internals.status?.door, 'Stopped');
  } finally {
    device.restore();
  }
});

test('a poll queued before a command yields to it', async () => {
  const device = installFakeDevice();
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    const poll = internals.refreshStatus();
    const command = door.setLightbulb(true);
    await Promise.all([poll, command]);
    await settle();

    assert.equal(device.requests[0], 'lamp=on');
    assert.equal(internals.consecutiveFailures, 0);
  } finally {
    device.restore();
  }
});

test('opening a Stopped door re-sends after a failed send and waits for Opening', async () => {
  const device = installFakeDevice({ door: 'Stopped' });
  try {
    const { door, internals } = make();
    await internals.refreshStatus();
    device.requests.length = 0;

    let failures = 1;
    device.failWhen = (request) => request === 'door=open' && failures-- > 0;

    await door.setTargetDoorState(0);
    await settle();

    assert.equal(device.requests.filter((r) => r === 'door=open').length, 2);
    assert.equal(internals.status?.door, 'Opening');
  } finally {
    device.restore();
  }
});

test('a listener registered after the first poll is called once straight away', async () => {
  const device = installFakeDevice();
  try {
    const { door, internals } = make();
    await internals.refreshStatus();

    let calls = 0;
    door.onStatusUpdate(() => calls++);

    assert.equal(calls, 1);
  } finally {
    device.restore();
  }
});
