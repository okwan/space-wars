// Making a zone: the map seed, the pilots, and launching a ship from the safe zone.
// Free-for-all: every pilot is against every other (decision #36, Oscar's pick).

import { rand } from './math';
import { NAV, SAFE, TILE, tileAt, zoneMap } from './map';
import { seedSalvage } from './salvage';
import { HULLS, UPGRADES, type Hull, type MapStyle, type Ship, type Tuning, type World } from './types';

/** Bot call signs: the game's own, chosen to read as people. */
export const BOT_NAMES = ['Rook', 'Vex', 'Sable', 'Quill', 'Juno', 'Brisk', 'Talon', 'Moss', 'Pike', 'Wren', 'Cinder',
  'Hollis', 'Ash', 'Fennel', 'Kestrel', 'Ober', 'Lumen', 'Dace', 'Marrow', 'Tansy', 'Corvo', 'Ivo', 'Zell', 'Brannock',
  'Petra', 'Hask', 'Orrin', 'Sorrel', 'Tamsin', 'Vane', 'Wick', 'Yarrow', 'Ember', 'Glint', 'Harrow', 'Isla', 'Jory', 'Knell'];

/** A random hull from the world's rng. */
export function randomHull(w: { seed: number }): Hull { return HULLS[Math.floor(rand(w) * HULLS.length)]; }

function newShip(id: number, name: string): Ship {
  return {
    id, name, human: false, hull: 'lancer', nextHull: 'lancer',
    x: 0, y: 0, vx: 0, vy: 0, a: 0, energy: 0, alive: false, respawn: 0, cool: 0, bombCool: 0, mineCool: 0, abilityCool: 0, shield: 0,
    thrusting: false, burning: false, flash: 0, kills: 0, deaths: 0, lastHitBy: -1,
    up: UPGRADES.map(() => 0), bounty: 0, points: 0,
    brain: {
      think: 0, aimA: 0, wobble: 0, target: -1, path: [], replan: 0, goalX: 0, goalY: 0, stuck: 0,
      wantThrust: false, wantRev: false, wantBurn: false, wantFire: false, wantBomb: false, wantMine: false,
    },
  };
}

/** Options for a new zone. */
export interface WorldOptions {
  seed: number;
  /** The map's seed (default: the same as `seed`). */
  mapSeed?: number;
  /** Ship ids that start as human seats (default: ship 0). */
  humans?: number[];
  /** The map's layout (default: the arena). */
  mapStyle?: MapStyle;
}

/**
 * A new zone: the map, half its salvage, and `pilots` ships, every one launched. Every seat is a
 * bot except the ones in `humans`; a person joining later takes a bot's seat with {@link takeSeat}.
 */
export function newWorld(tune: Tuning, opts: WorldOptions): World {
  const tiles = tune.map_tiles;
  const w: World = {
    seed: opts.seed | 0, mapSeed: (opts.mapSeed ?? opts.seed) | 0, tiles, size: tiles * TILE, t: 0,
    ships: [], shots: [], mines: [], events: [], salvage: [], nextSalvage: 0, salvageClock: 0,
  };
  if (opts.mapStyle && opts.mapStyle !== 'arena') w.mapStyle = opts.mapStyle;
  const names = BOT_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand(w) * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const humans = opts.humans ?? [0];
  for (let i = 0; i < tune.pilots; i++) {
    const sh = newShip(i, 'BOT ' + (names.pop() ?? `Unit ${i}`));
    if (humans.includes(i)) { sh.human = true; sh.name = 'You'; }
    else sh.nextHull = randomHull(w);
    w.ships.push(sh);
  }
  seedSalvage(w, tune);
  for (const sh of w.ships) launch(w, sh, tune, !sh.human);
  return w;
}

/**
 * Launches a ship: a fresh hull at a random spot in the safe zone (or, with `out`, for bots at
 * the start of a zone, anywhere open in the map so the zone is busy from the first second).
 */
export function launch(w: World, sh: Ship, tune: Tuning, out = false): void {
  const m = zoneMap(w.mapSeed, w.tiles, w.mapStyle);
  sh.hull = sh.nextHull;
  let x = m.centre * TILE, y = m.centre * TILE;
  for (let tries = 0; tries < 60; tries++) {
    if (out) {
      const cx = Math.floor(rand(w) * m.navN), cy = Math.floor(rand(w) * m.navN);
      if (!m.nav[cy * m.navN + cx]) continue;
      x = (cx + 0.5) * NAV * TILE; y = (cy + 0.5) * NAV * TILE; break;
    }
    const a = rand(w) * Math.PI * 2, r = Math.sqrt(rand(w)) * (m.safeR - 2) * TILE;
    const px = m.centre * TILE + Math.cos(a) * r, py = m.centre * TILE + Math.sin(a) * r;
    if (tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)) === SAFE) { x = px; y = py; break; }
  }
  sh.x = x; sh.y = y; sh.vx = 0; sh.vy = 0; sh.a = rand(w) * Math.PI * 2;
  sh.up = UPGRADES.map(() => 0); sh.bounty = tune.bounty_start; // a fresh ship: no salvage, base bounty
  sh.energy = tune[`${sh.hull}_energy`]; sh.alive = true; sh.cool = 0.3; sh.bombCool = 0.5; sh.mineCool = 0.5; sh.abilityCool = 1;
  sh.flash = 0; sh.respawn = 0; sh.shield = out ? 0 : tune.spawn_shield;
  sh.brain.path = []; sh.brain.replan = 0;
}

/**
 * A person takes a seat: the bot flying it steps out and the seat becomes human, keeping its
 * ship where it is. Returns the ship id, or -1 when every seat is taken.
 */
export function takeSeat(w: World, name: string): number {
  const sh = w.ships.find(s => !s.human);
  if (!sh) return -1;
  sh.human = true; sh.name = name;
  return sh.id;
}
/** A person leaves: a bot takes the seat back. */
export function leaveSeat(w: World, id: number): void {
  const sh = w.ships[id];
  if (!sh) return;
  sh.human = false; sh.name = 'BOT ' + BOT_NAMES[id % BOT_NAMES.length];
}
