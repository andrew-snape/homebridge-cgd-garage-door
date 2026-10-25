import type { Logging } from 'homebridge';

// Reads an optional numeric config value, falling back to the default (with a
// single warning) when it isn't a valid number in range.
export function readNumber(
  log: Logging,
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  { min, integer = false }: { min: number; integer?: boolean },
): number {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    log.warn(`Ignoring invalid "${key}" (${JSON.stringify(value)}): expected ${integer ? 'a whole number' : 'a number'} of at least ${min}. Using ${fallback}.`);
    return fallback;
  }

  return value;
}
