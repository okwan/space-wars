// Making a zone: the mirrored asteroid field, the beacons, the fleets and their gates.

import { dist, rand, wd, wrap } from './math';
import {
  HULLS, WEAPONS, type Asteroid, type Beacon, type Hull, type Ship, type Team, type Tuning, type Weapon, type World,
} from './types';

/** Bot call signs: the game's own, chosen to read as people. */
export const BOT_NAMES = ['Rook', 'Vex', 'Sable', 'Quill', 'Juno', 'Brisk', 'Talon', 'Moss', 'Pike', 'Wren', 'Cinder',
  'Hollis', 'Ash', 'Fennel', 'Kestrel', 'Ober', 'Lumen', 'Dace', 'Marrow', 'Tansy', 'Corvo', 'Ivo', 'Zell', 'Brannock',
  'Petra', 'Hask', 'Orrin', 'Sorrel', 'Tamsin', 'Vane', 'Wick', 'Yarrow', 'Ember', 'Glint', 'Harrow', 'Isla', 'Jory', 'Knell'];

/** Where a fleet launches: a quarter of the zone in from the middle, on the horizontal line. */
export function gate(team: Team, size: number): { x: number; y: number } {
  return { x: team === 0 ? size / 4 : (size * 3) / 4, y: size / 2 };
}

/** The asteroid field: generated on one half, mirrored onto the other, so neither fleet is favoured. */
export function makeAsteroids(w: { seed: number }, size: number, count: number): Asteroid[] {
  const out: Asteroid[] = [];
  const keepClear: [number, number, number][] = [
    [size / 4, size / 2, 420], [(size * 3) / 4, size / 2, 420], [size / 2, size / 2, 300], [0, size / 2, 300], [size / 2, 0, 300],
  ];
  let tries = 0;
  while (out.length < count && tries++ < 2000) {
    const r = 45 + rand(w) * 85, x = rand(w) * (size / 2 - 60) + 30, y = rand(w) * size;
    const p = { x, y };
    if (keepClear.some(([cx, cy, cr]) => dist(p, { x: cx, y: cy }, size) < cr + r)) continue;
    if (out.some(o => dist(p, o, size) < o.r + r + 90)) continue;
    const n = 9 + Math.floor(rand(w) * 4), shape: [number, number][] = [];
    for (let i = 0; i < n; i++) shape.push([(i / n) * Math.PI * 2, 0.8 + rand(w) * 0.3]);
    const cracks: [number, number, number][] = [];
    for (let i = 0; i < 2; i++) cracks.push([(rand(w) - 0.5) * 0.9, (rand(w) - 0.5) * 0.9, 0.12 + rand(w) * 0.12]);
    const spin = rand(w) * 6.28;
    out.push({ x, y, r, shape, cracks, spin });
    out.push({
      x: size - x, y, r, spin: -spin,
      shape: shape.map(([a, k]) => [Math.PI - a, k] as [number, number]),
      cracks: cracks.map(([cx, cy, cr]) => [-cx, cy, cr] as [number, number, number]),
    });
  }
  return out;
}

/** Three beacons on the zone's axis of symmetry, each with its own drift. */
export function makeBeacons(size: number, drift: number): Beacon[] {
  const base: [string, number, number, number, number][] = [
    ['Beacon North', size / 2, 0, 1, 0],
    ['Beacon Core', size / 2, size / 2, 0, 1],
    ['Beacon Rim', 0, size / 2, 0, -1],
  ];
  return base.map(([label, x, y, dx, dy], i) => ({
    label, x, y, vx: dx * drift, vy: dy * drift, owner: -1, progress: 0, phase: i * 2.1,
  }));
}

/** A random loadout from the world's rng. */
export function randomLoadout(w: { seed: number }): { hull: Hull; weapon: Weapon } {
  return { hull: HULLS[Math.floor(rand(w) * 3)], weapon: WEAPONS[Math.floor(rand(w) * 3)] };
}

function newShip(id: number, team: Team, slot: number, name: string): Ship {
  return {
    id, team, slot, name, human: false,
    hull: 'lancer', weapon: 'bolt', nextHull: 'lancer', nextWeapon: 'bolt',
    x: 0, y: 0, vx: 0, vy: 0, a: 0, energy: 0, alive: false, respawn: 0, cool: 0, mineCool: 0,
    thrusting: false, burning: false, flash: 0, kills: 0, deaths: 0, lastHitBy: -1,
    brain: {
      think: 0, aimA: 0, wobble: 0, home: slot % 3, target: -1,
      wantThrust: false, wantRev: false, wantBurn: false, wantFire: false, wantMine: false,
    },
  };
}

/** Options for a new zone. */
export interface WorldOptions {
  seed: number;
  /** Ship ids that start as human seats (default: ship 0, the first cyan ship). */
  humans?: number[];
}

/**
 * A new zone: asteroids, beacons and two full fleets. Every seat is a bot except the ones in
 * `humans`; a person joining later takes a bot's seat with {@link takeSeat}.
 */
export function newWorld(tune: Tuning, opts: WorldOptions): World {
  const size = tune.world_size;
  const w: World = {
    seed: opts.seed | 0, size, t: 0, roundT: 0, round: 1, scores: [0, 0], roundsWon: [0, 0],
    roundOver: 0, winner: -1, grouped: false, groupTarget: -1,
    asteroids: [], beacons: [], ships: [], shots: [], mines: [], events: [],
  };
  w.asteroids = makeAsteroids(w, size, tune.asteroids);
  w.beacons = makeBeacons(size, tune.beacon_drift);
  const names = BOT_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand(w) * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const n = tune.fleet_size, humans = opts.humans ?? [0];
  for (let team = 0 as Team; team < 2; team = (team + 1) as Team) {
    for (let i = 0; i < n; i++) {
      const sh = newShip(w.ships.length, team, i, 'BOT ' + (names.pop() ?? `Unit ${w.ships.length}`));
      if (humans.includes(sh.id)) { sh.human = true; sh.name = 'You'; }
      else { const l = randomLoadout(w); sh.nextHull = l.hull; sh.nextWeapon = l.weapon; }
      w.ships.push(sh);
    }
  }
  return w;
}

/** Puts a ship back at its fleet's gate (or, with head > 0, part-way to its home beacon). */
export function launch(w: World, sh: Ship, tune: Tuning, head = 0): void {
  const size = w.size, g = gate(sh.team, size);
  sh.hull = sh.nextHull; sh.weapon = sh.nextWeapon;
  const spread = ((sh.slot % 5) - 2) * 46, row = Math.floor(sh.slot / 5) * 46;
  sh.x = wrap(g.x + (sh.team ? row : -row), size); sh.y = wrap(g.y + spread, size);
  sh.a = sh.team === 0 ? 0 : Math.PI;
  sh.vx = Math.cos(sh.a) * 120; sh.vy = Math.sin(sh.a) * 120;
  if (head > 0 && !sh.human) { // bots start part-way out, so the zone is already busy
    const b = w.beacons[sh.brain.home];
    sh.x = wrap(sh.x + wd(sh.x, b.x, size) * head + (rand(w) - 0.5) * 200, size);
    sh.y = wrap(sh.y + wd(sh.y, b.y, size) * head + (rand(w) - 0.5) * 200, size);
    sh.a = Math.atan2(wd(sh.y, b.y, size), wd(sh.x, b.x, size));
    sh.vx = Math.cos(sh.a) * 160; sh.vy = Math.sin(sh.a) * 160;
  }
  sh.energy = tune[`${sh.hull}_energy`]; sh.alive = true; sh.cool = 0.3; sh.flash = 0; sh.respawn = 0;
}

/**
 * A person takes a seat: the bot flying it steps out and the seat becomes human, keeping its
 * ship where it is. Returns the ship id, or -1 when the team has no bot seat left.
 */
export function takeSeat(w: World, team: Team, name: string): number {
  const sh = w.ships.find(s => s.team === team && !s.human);
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
