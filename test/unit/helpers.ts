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
  state: { door: string; lamp: string; vacation: string };
  // Called for each request; return false to make it fail with a network error.
  failWhen?: (request: string) => boolean;
  restore: () => void;
}

// Replaces global fetch with a fake device speaking the local API.
export function installFakeDevice(initial: Partial<FakeDevice['state']> = {}): FakeDevice {
  const original = globalThis.fetch;
  const device: FakeDevice = {
    requests: [],
    state: { door: 'Closed', lamp: 'off', vacation: 'off', ...initial },
    restore: () => {
      globalThis.fetch = original;
    },
  };

  globalThis.fetch = (async (input: string | URL | Request) => {
    const request = new URL(String(input)).search.replace(/^\?key=[^&]*&/, '');
    device.requests.push(request);

    if (device.failWhen?.(request)) {
      throw new TypeError('fetch failed');
    }

    const [cmd, value] = request.split('=');
    if (cmd === 'lamp' || cmd === 'vacation') {
      device.state[cmd] = value;
    }

    return new Response(JSON.stringify({ ...device.state, wdBm: '-50', error: '0', status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return device;
}
