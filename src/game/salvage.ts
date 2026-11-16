// Salvage and bounty: the open-zone loop. Salvage drifts in the zone; a ship that flies over a
// piece gets one random upgrade and a little bounty. Upgrades and bounty are lost on death, and
// whoever downs a ship collects its bounty. Pure and deterministic, like the rest of game/.

import { dist, rand, wrap } from './math';
import { HULL_RADIUS, UPGRADES, type Ship, type Tuning, type Upgrade, type World } from './types';

const lvl = (sh: Ship, k: Upgrade): number => sh.up[UPGRADES.indexOf(k)] ?? 0;

/** A ship's stats with its upgrades applied. Every rule that reads a hull stat goes through these. */
export const maxEnergy = (sh: Ship, t: Tuning): number => t[`${sh.hull}_energy`] * (1 + lvl(sh, 'cells') * t.up_cells);
export const regen = (sh: Ship, t: Tuning): number => t[`${sh.hull}_regen`] * (1 + lvl(sh, 'regen') * t.up_regen);
export const thrust = (sh: Ship, t: Tuning): number => t[`${sh.hull}_thrust`] * (1 + lvl(sh, 'engine') * t.up_engine);
export const topSpeed = (sh: Ship, t: Tuning): number => t[`${sh.hull}_speed`] * (1 + lvl(sh, 'engine') * t.up_engine);
export const turnRate = (sh: Ship, t: Tuning): number => t[`${sh.hull}_turn`] * (1 + lvl(sh, 'turn') * t.up_turn);
export const gunDamage = (sh: Ship, t: Tuning): number => t[`${sh.weapon}_damage`] * (1 + lvl(sh, 'guns') * t.up_guns);
export const extraBounces = (sh: Ship): number => lvl(sh, 'bounce');
export const hasSpread = (sh: Ship): boolean => lvl(sh, 'spread') > 0;
export const mineMax = (sh: Ship, t: Tuning): number => t.mine_max + lvl(sh, 'mines');
const cap = (k: Upgrade, t: Tuning): number => t[`up_${k}_max`];

/** Drops a new piece of salvage somewhere clear of rocks. */
export function spawnSalvage(w: World, t: Tuning): void {
  for (let tries = 0; tries < 12; tries++) {
    const x = rand(w) * w.size, y = rand(w) * w.size;
    if (w.asteroids.some(a => dist(a, { x, y }, w.size) < a.r + 40)) continue;
    const a = rand(w) * Math.PI * 2;
    w.salvage.push({ id: w.nextSalvage++, x, y, vx: Math.cos(a) * t.salvage_drift, vy: Math.sin(a) * t.salvage_drift, age: 0 });
    return;
  }
}

/** Fills a new zone with half its salvage, so there is something to fly to from the start. */
export function seedSalvage(w: World, t: Tuning): void {
  while (w.salvage.length < t.salvage_max / 2) spawnSalvage(w, t);
}

/** Gives a ship one random upgrade it has room for; returns it, or null when all are full. */
export function grantUpgrade(w: World, sh: Ship, t: Tuning): Upgrade | null {
  const open = UPGRADES.filter(k => lvl(sh, k) < cap(k, t));
  if (!open.length) return null;
  const k = open[Math.floor(rand(w) * open.length)];
  sh.up[UPGRADES.indexOf(k)]++;
  return k;
}

/** One step of salvage: drift, age out, spawn more, and pickups by any live ship. */
export function updateSalvage(w: World, t: Tuning, dt: number): void {
  w.salvageClock += dt * t.salvage_rate;
  while (w.salvageClock >= 1) { w.salvageClock -= 1; if (w.salvage.length < t.salvage_max) spawnSalvage(w, t); }
  for (const s of w.salvage) { s.age += dt; s.x = wrap(s.x + s.vx * dt, w.size); s.y = wrap(s.y + s.vy * dt, w.size); }
  w.salvage = w.salvage.filter(s => {
    if (s.age > t.salvage_life) return false;
    for (const sh of w.ships) {
      if (!sh.alive || dist(sh, s, w.size) > t.salvage_radius + HULL_RADIUS[sh.hull]) continue;
      const k = grantUpgrade(w, sh, t);
      sh.bounty += t.bounty_salvage;
      if (k === 'cells') sh.energy = Math.min(maxEnergy(sh, t), sh.energy + t[`${sh.hull}_energy`] * t.up_cells);
      w.events.push({ type: 'salvage', ship: sh.id, kind: k ?? 'cells', level: k ? sh.up[UPGRADES.indexOf(k)] : -1 });
      return false;
    }
    return true;
  });
}

/** A kill: the killer collects the victim's bounty as points, and its own bounty grows. */
export function payBounty(killer: Ship, victim: Ship, t: Tuning): number {
  const paid = victim.bounty;
  killer.points += paid;
  killer.bounty += Math.max(t.bounty_kill_min, Math.round(paid * t.bounty_kill_share));
  return paid;
}
