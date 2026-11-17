// Player settings, kept in this browser between visits. Never gameplay state: a setting that
// changes play (bot skill, fleet size) only scales the tuning a new zone starts with.

import type { Tuning } from './game/types';

export interface Settings {
  volume: number;       // 0..1
  zoom: number;         // camera scale
  skill: 0 | 1 | 2;     // bot skill: easy, normal, hard
  fleet: number;        // pilots in an offline zone, you included
  server: string;       // the online zone's address
  name: string;         // your call sign online
  calm: boolean;        // Reduce flashing: caps flash brightness and bloom, no screen shake
  taught: boolean;      // the first-minute hints have been seen once
  aimSteer: boolean;    // gamepad: the nose turns toward the stick's direction (default), or the stick turns left/right
}
export const SKILL_NAMES = ['Easy', 'Normal', 'Hard'] as const;
const KEY = 'beacon-wars-settings-v3'; // v3: the free-for-all maze zone (new zoom and pilot count)

export function defaults(t: Tuning): Settings {
  return { volume: t.volume, zoom: t.zoom, skill: 1, fleet: t.pilots, server: 'ws://localhost:8787', name: 'Pilot', calm: false, taught: false, aimSteer: true };
}
export function load(t: Tuning): Settings {
  const d = defaults(t);
  try { return { ...d, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }; } catch { return d; }
}
export function save(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: settings last this visit only */ }
}
/** The tuning a zone starts with under these settings. */
export function apply(base: Tuning, s: Settings): Tuning {
  const t = { ...base, zoom: s.zoom, volume: s.volume, pilots: s.fleet };
  const k = [base.skill_easy, 1, base.skill_hard][s.skill]; // aim wobble and reaction time scale by skill
  t.bot_aim_error *= k; t.bot_reaction *= k;
  return t;
}
