// Salvage and bounty: pods rest on open floor around the zone; a ship that flies over one gets a
// random upgrade and a little bounty. Upgrades and bounty are lost on death, and whoever downs a
// ship collects its bounty. Also the stat helpers every rule reads a ship's numbers through.
// Pure and deterministic, like the rest of game/.

import { dist, rand } from './math';
import { inSafe, OPEN, TILE, tileAt, zoneMap } from './map';
import { HULL_RADIUS, UPGRADES, type Ship, type Tuning, type Upgrade, type World } from './types';

export const lvl = (sh: Ship, k: Upgrade): number => sh.up[UPGRADES.indexOf(k)] ?? 0;

/** A ship's stats with its upgrades applied. */
export const maxEnergy = (sh: Ship, t: Tuning): number => t[`${sh.hull}_energy`] * (1 + lvl(sh, 'cells') * t.up_cells);
export const regen = (sh: Ship, t: Tuning): number => t[`${sh.hull}_regen`] * (1 + lvl(sh, 'regen') * t.up_regen);
export const thrust = (sh: Ship, t: Tuning): number => t[`${sh.hull}_thrust`] * (1 + lvl(sh, 'engine') * t.up_engine);
export const topSpeed = (sh: Ship, t: Tuning): number => t[`${sh.hull}_speed`] * (1 + lvl(sh, 'engine') * t.up_engine);
export const turnRate = (sh: Ship, t: Tuning): number => t[`${sh.hull}_turn`] * (1 + lvl(sh, 'turn') * t.up_turn);
/** Gun level 1..3 and bomb level 1..3 (hull base plus upgrades). */
export const gunLevel = (sh: Ship): number => 1 + lvl(sh, 'guns');
export const bombLevel = (sh: Ship, t: Tuning): number => Math.min(3, t[`${sh.hull}_bomb_level`] + lvl(sh, 'bombs'));
export const mineMax = (sh: Ship, t: Tuning): number => t.mine_max + lvl(sh, 'mines');
export const gunDamage = (level: number, t: Tuning): number => t.gun_damage + (level - 1) * t.gun_damage_level;
export const bombDamage = (level: number, t: Tuning): number => t.bomb_damage + (level - 1) * t.bomb_damage_level;
export const bombRadius = (level: number, t: Tuning): number => t.bomb_radius + (level - 1) * t.bomb_radius_level;
const cap = (k: Upgrade, t: Tuning): number => t[`up_${k}_max`];

/** Drops a new pod on a random open tile, away from the safe zone. */
export function spawnSalvage(w: World, t: Tuning): void {
  const m = zoneMap(w.mapSeed, w.tiles), mid = w.size / 2;
  for (let tries = 0; tries < 20; tries++) {
    const tx = Math.floor(rand(w) * w.tiles), ty = Math.floor(rand(w) * w.tiles);
    if (tileAt(m, tx, ty) !== OPEN || tileAt(m, tx + 1, ty) !== OPEN || tileAt(m, tx, ty + 1) !== OPEN || tileAt(m, tx - 1, ty) !== OPEN || tileAt(m, tx, ty - 1) !== OPEN) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (Math.hypot(x - mid, y - mid) < t.salvage_safe_gap) continue;
    w.salvage.push({ id: w.nextSalvage++, x, y, age: 0 });
    return;
  }
}

/** Fills a new zone with half its pods, so there is something to fly to from the start. */
export function seedSalvage(w: World, t: Tuning): void {
  let n = 0;
  while (w.salvage.length < t.salvage_max / 2 && n++ < t.salvage_max * 4) spawnSalvage(w, t);
  for (const s of w.salvage) s.age = rand(w) * t.salvage_life * 0.5;
}

/** Gives a ship one random upgrade it has room for; returns it, or null when all are full. */
export function grantUpgrade(w: World, sh: Ship, t: Tuning): Upgrade | null {
  const open = UPGRADES.filter(k => lvl(sh, k) < cap(k, t) && !(k === 'bombs' && bombLevel(sh, t) >= 3));
  if (!open.length) return null;
  const k = open[Math.floor(rand(w) * open.length)];
  sh.up[UPGRADES.indexOf(k)]++;
  return k;
}

/** One step of salvage: age out, spawn more, and pickups by any live ship outside the safe zone. */
export function updateSalvage(w: World, t: Tuning, dt: number): void {
  w.salvageClock += dt * t.salvage_rate;
  while (w.salvageClock >= 1) { w.salvageClock -= 1; if (w.salvage.length < t.salvage_max) spawnSalvage(w, t); }
  for (const s of w.salvage) s.age += dt;
  const m = zoneMap(w.mapSeed, w.tiles);
  w.salvage = w.salvage.filter(s => {
    if (s.age > t.salvage_life) return false;
    for (const sh of w.ships) {
      if (!sh.alive || dist(sh, s, w.size) > t.salvage_radius + HULL_RADIUS[sh.hull] || inSafe(m, sh.x, sh.y)) continue;
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
