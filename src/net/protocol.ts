// The online zone's wire format. Pure functions over plain data, shared by the server and the
// browser, so a test can round-trip a world without a socket. JSON on a WebSocket; see
// docs/architecture/adr-0001-online-zone.md.

import { HULLS, WEAPONS, type GameEvent, type Hull, type ShipInput, type Tuning, type Weapon, type World } from '../game/types';

/** Bumped whenever a message changes shape; a mismatched client is turned away. */
export const PROTOCOL = 3;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  /** What the pilot is pressing, numbered so the server can say which it has applied. */
  | { t: 'in'; seq: number; bits: number; hull: number; weapon: number }
  | { t: 'bye' };

export type ServerMsg =
  | { t: 'welcome'; v: number; you: number; tune: Tuning; size: number; asteroids: World['asteroids'] }
  | { t: 'full'; reason: string }
  | Snapshot;

/** The zone as everyone sees it, a few times a second. Positions rounded to 0.1 px. */
export interface Snapshot {
  t: 'snap'; tick: number; ack: number;
  clock: [number, number, number, number, number, number]; // t, roundT, round, roundOver, winner, groupTarget
  /** 0: no push; 1 or 2: the cyan or amber fleet is pushing together. */
  grouped: number;
  scores: [number, number]; won: [number, number];
  names: string[];
  /** id, human, hull, weapon, x, y, vx, vy, a, energy, alive, respawn, flash, thrust, burn, kills, deaths, lastHitBy, nextHull, nextWeapon, bounty, points, ...upgrade levels */
  ships: number[][];
  /** team, owner, kind, x, y, vx, vy, life, bounces */
  shots: number[][];
  /** team, owner, x, y, age */
  mines: number[][];
  /** x, y, vx, vy, owner, progress */
  beacons: number[][];
  /** id, x, y, vx, vy, age */
  salvage: number[][];
  events: GameEvent[];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

const BITS = ['left', 'right', 'thrust', 'rev', 'burn', 'fire', 'mine'] as const;
/** Packs an input's buttons into one number. */
export function packInput(i: ShipInput): number { return BITS.reduce((n, k, b) => n | (i[k] ? 1 << b : 0), 0); }
/** Unpacks an input message. */
export function unpackInput(bits: number, hull: number, weapon: number): ShipInput {
  const o = {} as ShipInput;
  BITS.forEach((k, b) => { o[k] = (bits & (1 << b)) !== 0; });
  o.hull = HULLS[hull] ?? 'lancer'; o.weapon = WEAPONS[weapon] ?? 'bolt';
  return o;
}

/** The snapshot of a world for one client (ack is that client's last applied input). */
export function snapshot(w: World, tick: number, ack: number, events: GameEvent[]): Snapshot {
  return {
    t: 'snap', tick, ack,
    clock: [r3(w.t), r3(w.roundT), w.round, r3(w.roundOver), w.winner, w.groupTarget], grouped: w.grouped ? w.groupTeam + 1 : 0,
    scores: [r3(w.scores[0]), r3(w.scores[1])], won: [...w.roundsWon],
    names: w.ships.map(s => s.name),
    ships: w.ships.map(s => [s.id, s.human ? 1 : 0, HULLS.indexOf(s.hull), WEAPONS.indexOf(s.weapon), r1(s.x), r1(s.y), r1(s.vx), r1(s.vy), r3(s.a),
      r1(s.energy), s.alive ? 1 : 0, r3(s.respawn), s.flash > 0 ? 1 : 0, s.thrusting ? 1 : 0, s.burning ? 1 : 0, s.kills, s.deaths, s.lastHitBy,
      HULLS.indexOf(s.nextHull), WEAPONS.indexOf(s.nextWeapon), s.bounty, s.points, ...s.up]),
    shots: w.shots.map(b => [b.team, b.owner, WEAPONS.indexOf(b.kind), r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), r3(b.life), b.bounces]),
    mines: w.mines.map(m => [m.team, m.owner, r1(m.x), r1(m.y), r3(m.age)]),
    beacons: w.beacons.map(b => [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.owner, r3(b.progress)]),
    salvage: w.salvage.map(v => [v.id, r1(v.x), r1(v.y), r1(v.vx), r1(v.vy), r3(v.age)]),
    events,
  };
}

/** Writes a snapshot into a client's copy of the world (asteroids and labels stay as they are). */
export function applySnapshot(w: World, s: Snapshot): void {
  [w.t, w.roundT, w.round, w.roundOver] = s.clock;
  w.winner = s.clock[4] as World['winner']; w.groupTarget = s.clock[5]; w.grouped = s.grouped > 0; if (w.grouped) w.groupTeam = (s.grouped - 1) as World['groupTeam'];
  w.scores = [...s.scores]; w.roundsWon = [...s.won];
  for (const row of s.ships) {
    const sh = w.ships[row[0]];
    if (!sh) continue;
    sh.name = s.names[row[0]] ?? sh.name;
    sh.human = row[1] === 1; sh.hull = HULLS[row[2]] as Hull; sh.weapon = WEAPONS[row[3]] as Weapon;
    [sh.x, sh.y, sh.vx, sh.vy, sh.a, sh.energy] = row.slice(4, 10);
    sh.alive = row[10] === 1; sh.respawn = row[11]; sh.flash = row[12] ? 0.1 : 0; sh.thrusting = row[13] === 1; sh.burning = row[14] === 1;
    sh.kills = row[15]; sh.deaths = row[16]; sh.lastHitBy = row[17];
    sh.nextHull = HULLS[row[18]] as Hull; sh.nextWeapon = WEAPONS[row[19]] as Weapon;
    sh.bounty = row[20]; sh.points = row[21]; sh.up = row.slice(22);
  }
  w.shots = s.shots.map(r => ({ team: r[0] as 0 | 1, owner: r[1], kind: WEAPONS[r[2]] as Weapon, x: r[3], y: r[4], vx: r[5], vy: r[6], life: r[7], dmg: 0, bounces: r[8] }));
  w.mines = s.mines.map(r => ({ team: r[0] as 0 | 1, owner: r[1], x: r[2], y: r[3], age: r[4] }));
  w.salvage = s.salvage.map(r => ({ id: r[0], x: r[1], y: r[2], vx: r[3], vy: r[4], age: r[5] }));
  s.beacons.forEach((r, i) => {
    const b = w.beacons[i];
    if (!b) return;
    [b.x, b.y, b.vx, b.vy] = r; b.owner = r[4] as -1 | 0 | 1; b.progress = r[5];
  });
}
