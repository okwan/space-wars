// Beacon Wars: the simulation's types. Plain data only, so a world can be copied, sent over a
// network or compared in a test. No DOM, no Pixi, no clock.

import type config from '../../data/config.json';

/** Every tuning value by name (data/config.json without its ranges). */
export type TuneKey = Exclude<keyof typeof config, 'seed'>;
/** The values the rules read. */
export type Tuning = Record<TuneKey, number>;

export type Team = 0 | 1;
export type Hull = 'dart' | 'lancer' | 'bulwark';
export type Weapon = 'bolt' | 'rico' | 'scatter';
export const HULLS: readonly Hull[] = ['dart', 'lancer', 'bulwark'];
export const WEAPONS: readonly Weapon[] = ['bolt', 'rico', 'scatter'];
/** Collision radius of each hull, px. A shape constant, not a tuning value. */
export const HULL_RADIUS: Record<Hull, number> = { dart: 12, lancer: 15, bulwark: 20 };

/** What one pilot, human or bot, is pressing this step. */
export interface ShipInput {
  left: boolean; right: boolean; thrust: boolean; rev: boolean;
  burn: boolean; fire: boolean; mine: boolean;
  /** The loadout to launch with next (applies at respawn). */
  hull?: Hull; weapon?: Weapon;
}
export const NO_INPUT: ShipInput = { left: false, right: false, thrust: false, rev: false, burn: false, fire: false, mine: false };

export interface BotBrain {
  think: number; aimA: number; wobble: number; home: number;
  target: number; // ship id, or -1
  wantThrust: boolean; wantRev: boolean; wantBurn: boolean; wantFire: boolean; wantMine: boolean;
}

export interface Ship {
  id: number; team: Team; name: string;
  /** Who flies it: a bot, or a human seat (the bot steps out while a person holds it). */
  human: boolean;
  hull: Hull; weapon: Weapon; nextHull: Hull; nextWeapon: Weapon;
  x: number; y: number; vx: number; vy: number; a: number;
  energy: number; alive: boolean; respawn: number; cool: number; mineCool: number;
  thrusting: boolean; burning: boolean; flash: number;
  kills: number; deaths: number; lastHitBy: number;
  slot: number; // position in its fleet, for the launch formation
  brain: BotBrain;
}

export interface Shot {
  team: Team; owner: number; kind: Weapon;
  x: number; y: number; vx: number; vy: number; life: number; dmg: number; bounces: number;
}
export interface Mine { team: Team; owner: number; x: number; y: number; age: number }
export interface Asteroid {
  x: number; y: number; r: number; spin: number;
  /** Outline: [angle, radius factor] pairs. */
  shape: [number, number][];
  /** Surface cracks: [x, y, size] in units of r. */
  cracks: [number, number, number][];
}
export interface Beacon {
  label: string; x: number; y: number; vx: number; vy: number;
  /** -1 neutral, else the holding team. */
  owner: -1 | Team;
  /** -1 (amber) .. 1 (cyan). */
  progress: number; phase: number;
}

/** Things that happened this step, for sound, the kill feed and effects. */
export type GameEvent =
  | { type: 'shot'; ship: number; kind: Weapon }
  | { type: 'hit'; ship: number; by: number; amount: number }
  | { type: 'kill'; ship: number; by: number }
  | { type: 'burst'; x: number; y: number; team: Team; n: number; speed: number }
  | { type: 'mine'; ship: number }
  | { type: 'capture'; beacon: number; team: -1 | Team; from: -1 | Team }
  | { type: 'group' }
  | { type: 'round'; winner: Team }
  | { type: 'roundStart'; round: number };

/** The whole zone. Everything the rules need, nothing the screen needs. */
export interface World {
  seed: number; // the rng's running state
  size: number;
  t: number; roundT: number; round: number;
  scores: [number, number]; roundsWon: [number, number];
  /** Seconds left of the break between rounds; 0 while a round is on. */
  roundOver: number; winner: -1 | Team;
  grouped: boolean; groupTarget: number;
  asteroids: Asteroid[]; beacons: Beacon[]; ships: Ship[]; shots: Shot[]; mines: Mine[];
  events: GameEvent[];
}
