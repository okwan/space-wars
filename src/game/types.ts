// Beacon Wars: the simulation's types. Plain data only, so a world can be copied, sent over a
// network or compared in a test. No DOM, no Pixi, no clock. The map's tiles are not kept here:
// they come from the map seed (see map.ts).

import type config from '../../data/config.json';

/** Every tuning value by name (data/config.json without its ranges). */
export type TuneKey = Exclude<keyof typeof config, 'seed'>;
/** The values the rules read. */
export type Tuning = Record<TuneKey, number>;

export type Hull = 'dart' | 'lancer' | 'bulwark';
export const HULLS: readonly Hull[] = ['dart', 'lancer', 'bulwark'];
/** Each hull's signature move: a forward dash, a ring of shrapnel, a push that turns fire away. */
export type Ability = 'dash' | 'scatter' | 'repulse';
export const HULL_ABILITY: Record<Hull, Ability> = { dart: 'dash', lancer: 'scatter', bulwark: 'repulse' };
/** Salvage upgrades, in the order a ship's `up` levels are kept and sent. */
export const UPGRADES = ['cells', 'regen', 'engine', 'turn', 'guns', 'bombs', 'bounce', 'multi', 'mines'] as const;
export type Upgrade = typeof UPGRADES[number];
/** Collision radius of each hull, px. A shape constant, not a tuning value. */
export const HULL_RADIUS: Record<Hull, number> = { dart: 11, lancer: 13, bulwark: 15 };
/** What a shot is: a gun bullet, or a bomb that bursts with splash damage. */
export type ShotKind = 'bullet' | 'bomb';

/** What one pilot, human or bot, is pressing this step. */
export interface ShipInput {
  left: boolean; right: boolean; thrust: boolean; rev: boolean;
  burn: boolean; fire: boolean; bomb: boolean; mine: boolean;
  /** The hull to launch with next (applies at respawn). */
  hull?: Hull;
  /** The hull's signature move (dart: dash, lancer: scatter, bulwark: repulse). */
  ability?: boolean;
}
export const NO_INPUT: ShipInput = { left: false, right: false, thrust: false, rev: false, burn: false, fire: false, bomb: false, mine: false };

export interface BotBrain {
  think: number; aimA: number; wobble: number;
  target: number; // ship id, or -1
  /** The route being flown: waypoints in px, and when to plan it again. */
  path: { x: number; y: number }[]; replan: number; goalX: number; goalY: number;
  /** Seconds spent barely moving while trying to fly; past a limit the bot backs off a wall. */
  stuck: number;
  wantThrust: boolean; wantRev: boolean; wantBurn: boolean; wantFire: boolean; wantBomb: boolean; wantMine: boolean; wantAbility?: boolean;
}

export interface Ship {
  id: number; name: string;
  /** Who flies it: a bot, or a human seat (the bot steps out while a person holds it). */
  human: boolean;
  hull: Hull; nextHull: Hull;
  x: number; y: number; vx: number; vy: number; a: number;
  energy: number; alive: boolean; respawn: number;
  /** Cooldowns: guns, bombs, mines, the hull's ability. Seconds. */
  cool: number; bombCool: number; mineCool: number; abilityCool: number;
  /** Seconds of spawn protection left (no damage taken, none dealt). */
  shield: number;
  thrusting: boolean; burning: boolean; flash: number;
  kills: number; deaths: number; lastHitBy: number;
  /** Salvage upgrade levels, indexed like UPGRADES. Lost on death. */
  up: number[];
  /** What this ship is worth to whoever downs it; grows with salvage and kills, resets on death. */
  bounty: number;
  /** Personal points: the bounties this pilot has collected. */
  points: number;
  brain: BotBrain;
}

export interface Shot {
  owner: number; kind: ShotKind; level: number;
  x: number; y: number; vx: number; vy: number; life: number; bounces: number;
}
/** A salvage pod resting in the zone: fly over it for a random upgrade. */
export interface Salvage { id: number; x: number; y: number; age: number }
export interface Mine { owner: number; x: number; y: number; age: number; level: number }

/** Things that happened this step, for sound, the kill feed and effects. */
export type GameEvent =
  | { type: 'shot'; ship: number; kind: ShotKind }
  | { type: 'hit'; ship: number; by: number; amount: number }
  | { type: 'kill'; ship: number; by: number; bounty: number }
  | { type: 'burst'; x: number; y: number; n: number; speed: number; owner: number }
  | { type: 'blast'; x: number; y: number; r: number; owner: number }
  | { type: 'bounce'; ship: number }
  | { type: 'mine'; ship: number }
  | { type: 'ability'; ship: number; kind: Ability }
  | { type: 'salvage'; ship: number; kind: Upgrade; level: number };

/** The whole zone. Everything the rules need, nothing the screen needs. */
/** How the zone's map is laid out: the walled arena, or a wide open world of named regions. */
export type MapStyle = 'arena' | 'open';

export interface World {
  seed: number; // the rng's running state
  /** The map: its seed and its size in tiles; `size` is the same in px. */
  mapSeed: number; tiles: number; size: number;
  /** The map's layout; absent means the arena. */
  mapStyle?: MapStyle;
  t: number;
  ships: Ship[]; shots: Shot[]; mines: Mine[];
  salvage: Salvage[]; nextSalvage: number; salvageClock: number;
  events: GameEvent[];
}
