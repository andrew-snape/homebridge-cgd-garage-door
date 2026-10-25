import type { Logging } from 'homebridge';

// Reads an optional numeric config value, falling back to the default (with a
// single warning) when it isn't a valid number in range.
export function readNumber(
  log: Logging,
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): number {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    log.warn(`Ignoring invalid "${key}" (${JSON.stringify(value)}): expected ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}. Using ${fallback}.`);
    return fallback;
  }

  return value;
}
