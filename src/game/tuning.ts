// Reads data/config.json into the flat Tuning the rules use.

import type { TuneKey, Tuning } from './types';

/** One config entry: a value with the range the tweak panel offers. */
export interface ConfigEntry { value: number; min: number; max: number; step: number }

/** Takes every `{ value }` entry of a config object into a Tuning, by name. */
export function tuningFrom(cfg: Record<string, unknown>): Tuning {
  const out: Partial<Tuning> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v && typeof v === 'object' && 'value' in v) out[k as TuneKey] = (v as ConfigEntry).value;
  }
  return out as Tuning;
}
