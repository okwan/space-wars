// The online zone's wire format. Pure functions over plain data, shared by the server and the
// browser, so a test can round-trip a world without a socket. JSON on a WebSocket; see
// docs/architecture/adr-0001-online-zone.md. The map is not sent: both sides build it from its seed.

import { HULLS, type GameEvent, type Hull, type ShipInput, type Tuning, type World } from '../game/types';

/** Bumped whenever a message changes shape; a mismatched client is turned away. */
export const PROTOCOL = 4;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  /** What the pilot is pressing, numbered so the server can say which it has applied. */
  | { t: 'in'; seq: number; bits: number; hull: number }
  | { t: 'bye' };

export type ServerMsg =
  | { t: 'welcome'; v: number; you: number; tune: Tuning; mapSeed: number; tiles: number }
  | { t: 'full'; reason: string }
  | Snapshot;

/** The zone as everyone sees it, a few times a second. Positions rounded to 0.1 px. */
export interface Snapshot {
  t: 'snap'; tick: number; ack: number; time: number;
  names: string[];
  /** id, human, hull, x, y, vx, vy, a, energy, alive, respawn, flash, thrust, burn, kills, deaths, lastHitBy, nextHull, bounty, points, shield, ...upgrade levels */
  ships: number[][];
  /** owner, kind (0 bullet, 1 bomb), level, x, y, vx, vy, life, bounces */
  shots: number[][];
  /** owner, x, y, age, level */
  mines: number[][];
  /** id, x, y, age */
  salvage: number[][];
  events: GameEvent[];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

const BITS = ['left', 'right', 'thrust', 'rev', 'burn', 'fire', 'bomb', 'mine'] as const;
/** Packs an input's buttons into one number. */
export function packInput(i: ShipInput): number { return BITS.reduce((n, k, b) => n | (i[k] ? 1 << b : 0), 0); }
/** Unpacks an input message. */
export function unpackInput(bits: number, hull: number): ShipInput {
  const o = {} as ShipInput;
  BITS.forEach((k, b) => { o[k] = (bits & (1 << b)) !== 0; });
  o.hull = HULLS[hull] ?? 'lancer';
  return o;
}

/** The snapshot of a world for one client (ack is that client's last applied input). */
export function snapshot(w: World, tick: number, ack: number, events: GameEvent[]): Snapshot {
  return {
    t: 'snap', tick, ack, time: r3(w.t),
    names: w.ships.map(s => s.name),
    ships: w.ships.map(s => [s.id, s.human ? 1 : 0, HULLS.indexOf(s.hull), r1(s.x), r1(s.y), r1(s.vx), r1(s.vy), r3(s.a),
      r1(s.energy), s.alive ? 1 : 0, r3(s.respawn), s.flash > 0 ? 1 : 0, s.thrusting ? 1 : 0, s.burning ? 1 : 0, s.kills, s.deaths, s.lastHitBy,
      HULLS.indexOf(s.nextHull), s.bounty, s.points, r3(Math.max(0, s.shield)), ...s.up]),
    shots: w.shots.map(b => [b.owner, b.kind === 'bomb' ? 1 : 0, b.level, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), r3(b.life), b.bounces]),
    mines: w.mines.map(m => [m.owner, r1(m.x), r1(m.y), r3(m.age), m.level]),
    salvage: w.salvage.map(v => [v.id, r1(v.x), r1(v.y), r3(v.age)]),
    events,
  };
}

/** Writes a snapshot into a client's copy of the world (the map stays as it is). */
export function applySnapshot(w: World, s: Snapshot): void {
  w.t = s.time;
  for (const row of s.ships) {
    const sh = w.ships[row[0]];
    if (!sh) continue;
    sh.name = s.names[row[0]] ?? sh.name;
    sh.human = row[1] === 1; sh.hull = HULLS[row[2]] as Hull;
    [sh.x, sh.y, sh.vx, sh.vy, sh.a, sh.energy] = row.slice(3, 9);
    sh.alive = row[9] === 1; sh.respawn = row[10]; sh.flash = row[11] ? 0.1 : 0; sh.thrusting = row[12] === 1; sh.burning = row[13] === 1;
    sh.kills = row[14]; sh.deaths = row[15]; sh.lastHitBy = row[16]; sh.nextHull = HULLS[row[17]] as Hull;
    sh.bounty = row[18]; sh.points = row[19]; sh.shield = row[20]; sh.up = row.slice(21);
  }
  w.shots = s.shots.map(r => ({ owner: r[0], kind: r[1] ? 'bomb' : 'bullet', level: r[2], x: r[3], y: r[4], vx: r[5], vy: r[6], life: r[7], bounces: r[8] }));
  w.mines = s.mines.map(r => ({ owner: r[0], x: r[1], y: r[2], age: r[3], level: r[4] }));
  w.salvage = s.salvage.map(r => ({ id: r[0], x: r[1], y: r[2], age: r[3] }));
}
