import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CGDGarageDoor } from '../../src/CGDGarageDoor.js';
import HealthSummary from '../../src/health.js';
import { captureLog, installFakeDevice } from './helpers.js';

const make = (options: ConstructorParameters<typeof CGDGarageDoor>[2] = {}) => {
  const { log, lines } = captureLog();
  const door = new CGDGarageDoor(log, { deviceHostname: 'device.test', deviceLocalKey: 'test-key' }, {
    autoPoll: false,
    timings: { retryDelayMs: 1, confirmIntervalMs: 5 },
    ...options,
  });
  const refresh = () => (door as unknown as { refreshStatus: () => Promise<void> }).refreshStatus();
  return { door, lines, refresh };
};

test('the door event log fires on change only', async () => {
  const device = installFakeDevice({ door: 'Closed by transmitter No.3' });
  try {
    const { lines, refresh } = make();

    await refresh();
    await refresh();
    device.state.door = 'Opening by WiFi';
    device.state.dt = '2026-10-24 22:07:40';
    await refresh();
    await refresh();

    assert.deepEqual(lines.filter((l) => l.includes('Door:')), [
      'info: Door: Closed by transmitter No.3 (2026-10-24 22:07:33)',
      'info: Door: Opening by WiFi (2026-10-24 22:07:40)',
    ]);
  } finally {
    device.restore();
  }
});

test('an unknown door text warns once, and intruder text warns per change', async () => {
  const device = installFakeDevice({ door: 'Wibble' });
  try {
    const { lines, refresh } = make();

    await refresh();
    await refresh();
    device.state.door = 'Closed';
    await refresh();
    device.state.door = 'Wibble';
    await refresh();
    device.state.door = 'Opened. Intruder Alert';
    await refresh();
    device.state.door = 'Closed';
    await refresh();
    device.state.door = 'Opened. Intruder Alert';
    await refresh();

    assert.equal(lines.filter((l) => l.startsWith('warn: Unrecognised door text')).length, 1);
    assert.equal(lines.filter((l) => l.startsWith('warn: Door reported an intruder alert')).length, 2);
  } finally {
    device.restore();
  }
});

test('each distinct non-zero error code is logged once', async () => {
  const device = installFakeDevice();
  try {
    const { lines, refresh } = make();

    await refresh();
    device.state.error = '3';
    await refresh();
    await refresh();
    device.state.error = '0';
    await refresh();
    device.state.error = '3';
    await refresh();

    assert.equal(lines.filter((l) => l.includes('Device reported error code 3')).length, 1);
  } finally {
    device.restore();
  }
});

test('the health summary aggregates the window and resets', () => {
  let clock = 0;
  const health = new HealthSummary(() => clock);

  assert.equal(health.summarize(), undefined, 'no polls, no summary');

  health.recordSuccess(100, -60, '10');
  health.recordSuccess(300, -72, '11');
  health.recordFailure('fetch failed');
  health.recordSuccess(200, -66, '12');
  clock = 10 * 60000;

  const line = health.summarize();
  assert.equal(line, 'Health (last 10 min): polls 3 ok / 1 failed (75% success), latency avg 200 ms, max 300 ms, '
    + 'Wi-Fi min -72 dBm, latest -66 dBm, cycles 12, last error: fetch failed');

  assert.equal(health.summarize(), undefined, 'counters reset');
  clock = 20 * 60000;
  health.recordSuccess(50, -50, '12');
  assert.match(health.summarize()!, /polls 1 ok \/ 0 failed \(100% success\), latency avg 50 ms, max 50 ms, Wi-Fi min -50 dBm, latest -50 dBm, cycles 12$/);
});

test('the door logs a health line on the injected interval', async () => {
  const device = installFakeDevice();
  try {
    const { lines, refresh } = make({ timings: { healthIntervalMs: 40 } });

    await refresh();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.ok(lines.some((l) => l.startsWith('info: Health (last 0 min): polls 1 ok / 0 failed (100% success)')));
  } finally {
    device.restore();
  }
});

test('the device key never reaches the logs or the health line, even for a malformed hostname', async () => {
  const device = installFakeDevice();
  try {
    const { log, lines } = captureLog();
    const door = new CGDGarageDoor(log, { deviceHostname: 'bad host name', deviceLocalKey: 'secret-key-123' }, {
      autoPoll: false,
      timings: { retryDelayMs: 1, confirmIntervalMs: 5, healthIntervalMs: 30 },
    });

    await (door as unknown as { refreshStatus: () => Promise<void> }).refreshStatus();
    await door.setLightbulb(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.ok(lines.some((l) => l.includes('Health (')), 'a health line was logged');
    assert.ok(lines.some((l) => l.startsWith('error:')), 'failures were logged');
    assert.ok(lines.every((l) => !l.includes('secret-key-123')), lines.join('\n'));
  } finally {
    device.restore();
  }
});

test('the health line reports only status-poll failures as the last error', async () => {
  const device = installFakeDevice();
  try {
    const { log, lines } = captureLog();
    const door = new CGDGarageDoor(log, { deviceHostname: 'device.test', deviceLocalKey: 'k' }, {
      autoPoll: false,
      timings: { retryDelayMs: 1, confirmIntervalMs: 5, healthIntervalMs: 80 },
    });
    const refresh = () => (door as unknown as { refreshStatus: () => Promise<void> }).refreshStatus();

    await refresh();
    device.failWhen = (request) => request.startsWith('lamp=');
    await door.setLightbulb(true);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = lines.find((l) => l.includes('Health ('));
    assert.ok(health && !health.includes('last error'), health);
  } finally {
    device.restore();
  }
});
