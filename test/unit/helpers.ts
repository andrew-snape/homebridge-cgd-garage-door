import type { Logging } from 'homebridge';

export const silentLog = Object.assign(() => undefined, {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  success: () => undefined,
  log: () => undefined,
}) as unknown as Logging;

export interface FakeDevice {
  // Every request's "cmd=value" query part, in order.
  requests: string[];
  state: { door: string; lamp: string; vacation: string; dt: string; error: string; cycles: string; wdBm: string };
  // Called for each request; return true to make it fail with a network error.
  failWhen?: (request: string) => boolean;
  // Called for each request before failWhen, e.g. to model a command that took effect but whose reply was lost.
  onRequest?: (request: string) => void;
  // When false, door commands are accepted but the door never moves.
  doorResponds: boolean;
  restore: () => void;
}

// Replaces global fetch with a fake device speaking the local API.
export function installFakeDevice(initial: Partial<FakeDevice['state']> = {}): FakeDevice {
  const original = globalThis.fetch;
  const device: FakeDevice = {
    requests: [],
    state: { door: 'Closed', lamp: 'off', vacation: 'off', dt: '2026-10-24 22:07:33', error: '0', cycles: '100', wdBm: '-50', ...initial },
    doorResponds: true,
    restore: () => {
      globalThis.fetch = original;
    },
  };

  globalThis.fetch = (async (input: string | URL | Request) => {
    const request = new URL(String(input)).search.replace(/^\?key=[^&]*&/, '');
    device.requests.push(request);

    device.onRequest?.(request);

    if (device.failWhen?.(request)) {
      throw new TypeError('fetch failed');
    }

    const [cmd, value] = request.split('=');
    if (cmd === 'lamp' || cmd === 'vacation') {
      device.state[cmd] = value;
    }
    if (cmd === 'door' && device.doorResponds) {
      device.state.door = { open: 'Opening', close: 'Closing', stop: 'Stopped' }[value] ?? device.state.door;
    }

    return new Response(JSON.stringify({ ...device.state, status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return device;
}

// A logger that records "level: message" lines.
export function captureLog() {
  const lines: string[] = [];
  const record = (level: string) => (message: string) => void lines.push(`${level}: ${message}`);
  const log = Object.assign(record('log'), {
    info: record('info'), warn: record('warn'), error: record('error'),
    debug: () => undefined, success: record('success'), log: record('log'),
  }) as unknown as Logging;
  return { log, lines };
}
