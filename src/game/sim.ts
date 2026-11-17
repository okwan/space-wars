// One fixed step of the zone: flight against the tile walls, guns, bombs, mines, salvage.
// Free-for-all: every pilot is against every other. Implements design/game-brief.md (Core loop).
// Pure and deterministic: the same world, inputs and tuning always give the same next world.

import { think } from './bots';
import { inSafe, hitsWall, tileAtPx, WALL, zoneMap, type ZoneMap } from './map';
import { angDiff, dist, wd } from './math';
import {
  bombDamage, bombLevel, bombRadius, gunDamage, gunLevel, lvl, maxEnergy, mineMax, payBounty, regen, thrust, topSpeed, turnRate, updateSalvage,
} from './salvage';
import { launch, randomHull } from './world';
import { HULL_RADIUS, NO_INPUT, type Ship, type ShipInput, type Shot, type Tuning, type World } from './types';

/** Simulation step in seconds: motion is per second, never per frame. */
export const STEP = 1 / 60;
/** Longest move per collision sub-step, px: shorter than a tile, so nothing passes through a wall. */
const SUB = 6;

/** Input a bot is giving this step, from its brain. */
export function botInput(sh: Ship, tune: Tuning): ShipInput {
  const b = sh.brain, err = angDiff(sh.a, b.aimA);
  const aimed = Math.abs(err) < tune.bot_fire_angle;
  return {
    left: err < -0.03, right: err > 0.03, thrust: b.wantThrust, rev: b.wantRev, burn: b.wantBurn,
    fire: b.wantFire && aimed, bomb: b.wantBomb && aimed, mine: b.wantMine,
  };
}

/** Moves a body by its velocity with tile collision, axis by axis, bouncing off walls. */
function moveBody(m: ZoneMap, o: { x: number; y: number; vx: number; vy: number }, r: number, dt: number, k: number,
  onWall?: (axis: 'x' | 'y') => boolean): boolean {
  const n = Math.max(1, Math.ceil((Math.hypot(o.vx, o.vy) * dt) / SUB));
  let hit = false;
  for (let i = 0; i < n; i++) {
    const nx = o.x + (o.vx * dt) / n;
    if (r > 0 ? hitsWall(m, nx, o.y, r) : tileAtPx(m, nx, o.y) === WALL) {
      hit = true;
      if (onWall && !onWall('x')) return true;
      o.vx = -o.vx * k; o.vy *= k;
    } else o.x = nx;
    const ny = o.y + (o.vy * dt) / n;
    if (r > 0 ? hitsWall(m, o.x, ny, r) : tileAtPx(m, o.x, ny) === WALL) {
      hit = true;
      if (onWall && !onWall('y')) return true;
      o.vy = -o.vy * k; o.vx *= k;
    } else o.y = ny;
  }
  return hit;
}

function fireGuns(w: World, m: ZoneMap, sh: Ship, tune: Tuning): void {
  const level = gunLevel(sh), multi = lvl(sh, 'multi') > 0;
  const cost = tune.gun_cost + (level - 1) * tune.gun_cost_level + (multi ? tune.multi_cost : 0);
  if (sh.cool > 0 || sh.energy <= cost + 1 || inSafe(m, sh.x, sh.y)) return;
  sh.energy -= cost; sh.cool = tune[`${sh.hull}_gun_interval`];
  const r = HULL_RADIUS[sh.hull], c = Math.cos(sh.a), s = Math.sin(sh.a);
  const barrels = tune[`${sh.hull}_barrels`] > 1 ? [-0.55, 0.55] : [0];
  const shots: [number, number][] = barrels.map(off => [off, 0]); // [side offset in radii, angle]
  if (multi) shots.push([0, -tune.multi_angle], [0, tune.multi_angle]);
  for (const [off, da] of shots) {
    const a = sh.a + da;
    w.shots.push({
      owner: sh.id, kind: 'bullet', level,
      x: sh.x + c * r - s * off * r, y: sh.y + s * r + c * off * r,
      vx: sh.vx + Math.cos(a) * tune.gun_speed, vy: sh.vy + Math.sin(a) * tune.gun_speed,
      life: tune.gun_life, bounces: lvl(sh, 'bounce') ? 1 : 0,
    });
  }
  w.events.push({ type: 'shot', ship: sh.id, kind: 'bullet' });
}

function fireBomb(w: World, m: ZoneMap, sh: Ship, tune: Tuning): void {
  const level = bombLevel(sh, tune), cost = tune.bomb_cost + (level - 1) * tune.bomb_cost_level;
  if (sh.bombCool > 0 || sh.energy <= cost + 1 || inSafe(m, sh.x, sh.y)) return;
  sh.energy -= cost; sh.bombCool = tune.bomb_interval;
  const r = HULL_RADIUS[sh.hull], c = Math.cos(sh.a), s = Math.sin(sh.a);
  w.shots.push({
    owner: sh.id, kind: 'bomb', level, x: sh.x + c * r, y: sh.y + s * r,
    vx: sh.vx + c * tune.bomb_speed, vy: sh.vy + s * tune.bomb_speed, life: tune.bomb_life, bounces: tune[`${sh.hull}_bomb_bounces`],
  });
  sh.vx -= c * tune.bomb_recoil; sh.vy -= s * tune.bomb_recoil; // a bomb kicks the ship back a little
  w.events.push({ type: 'shot', ship: sh.id, kind: 'bomb' });
}

function dropMine(w: World, m: ZoneMap, sh: Ship, tune: Tuning): void {
  const live = w.mines.filter(x => x.owner === sh.id).length;
  if (sh.mineCool > 0 || live >= mineMax(sh, tune) || sh.energy <= tune.mine_cost + 1 || inSafe(m, sh.x, sh.y)) return;
  sh.energy -= tune.mine_cost; sh.mineCool = tune.mine_cooldown;
  w.mines.push({ owner: sh.id, x: sh.x, y: sh.y, age: 0, level: bombLevel(sh, tune) });
  w.events.push({ type: 'mine', ship: sh.id });
}

/** Can this ship be hurt right now? Not while spawn-shielded or inside the safe zone. */
export function exposed(w: World, sh: Ship): boolean {
  return sh.alive && sh.shield <= 0 && !inSafe(zoneMap(w.mapSeed, w.tiles), sh.x, sh.y);
}

/** Takes energy from a ship; at zero it is destroyed. Exposed for tests. */
export function damage(w: World, target: Ship, amount: number, by: number, tune: Tuning): void {
  if (!exposed(w, target)) return;
  target.energy -= amount; target.flash = 0.12; target.lastHitBy = by;
  w.events.push({ type: 'hit', ship: target.id, by, amount });
  if (target.energy <= 0) destroy(w, target, by, tune);
}

function destroy(w: World, sh: Ship, by: number, tune: Tuning): void {
  sh.alive = false; sh.respawn = tune.respawn_time; sh.deaths++; sh.energy = 0;
  w.events.push({ type: 'burst', x: sh.x, y: sh.y, n: 26, speed: 220, owner: sh.id });
  const killer = by >= 0 && by !== sh.id ? w.ships[by] : undefined;
  let paid = 0;
  if (killer) { killer.kills++; paid = payBounty(killer, sh, tune); }
  w.events.push({ type: 'kill', ship: sh.id, by: killer ? by : -1, bounty: paid });
  sh.bounty = 0; sh.up = sh.up.map(() => 0); // the wreck keeps nothing
  w.mines = w.mines.filter(x => x.owner !== sh.id);
  if (!sh.human) sh.nextHull = randomHull(w);
}

/** A bomb or mine bursts: splash damage falling off from the centre, to everyone but its owner. */
function blast(w: World, x: number, y: number, level: number, owner: number, tune: Tuning): void {
  const R = bombRadius(level, tune), dmg = bombDamage(level, tune);
  w.events.push({ type: 'blast', x, y, r: R, owner });
  for (const sh of w.ships) {
    if (sh.id === owner || !sh.alive) continue;
    const d = dist(sh, { x, y }, w.size) - HULL_RADIUS[sh.hull];
    if (d < R) damage(w, sh, dmg * (1 - (0.6 * Math.max(0, d)) / R), owner, tune);
  }
}

/** One ship's flight for a step, given what its pilot is pressing. */
export function fly(w: World, sh: Ship, c: ShipInput, tune: Tuning, dt: number): void {
  if (!sh.alive) {
    if (c.hull) sh.nextHull = c.hull;
    sh.respawn -= dt;
    if (sh.respawn <= 0) launch(w, sh, tune);
    return;
  }
  const m = zoneMap(w.mapSeed, w.tiles);
  const turn = turnRate(sh, tune);
  if (c.left) sh.a -= turn * dt;
  if (c.right) sh.a += turn * dt;
  const canBurn = c.burn && (c.thrust || c.rev) && sh.energy > tune.burn_drain * dt + 20;
  sh.burning = canBurn;
  const acc = thrust(sh, tune) * (canBurn ? tune.burn_thrust : 1);
  sh.thrusting = c.thrust || c.rev;
  if (c.thrust) { sh.vx += Math.cos(sh.a) * acc * dt; sh.vy += Math.sin(sh.a) * acc * dt; }
  else if (c.rev) { sh.vx -= Math.cos(sh.a) * acc * dt; sh.vy -= Math.sin(sh.a) * acc * dt; }
  // no friction at all: a ship keeps whatever it has, up to its top speed (higher on the burner)
  const cap = topSpeed(sh, tune) * (canBurn ? tune.burn_speed : 1), sp = Math.hypot(sh.vx, sh.vy);
  if (sp > cap) { sh.vx *= cap / sp; sh.vy *= cap / sp; }
  const fast = sp > 90;
  if (moveBody(m, sh, HULL_RADIUS[sh.hull], dt, tune.bounce) && fast) w.events.push({ type: 'bounce', ship: sh.id });
  if (canBurn) sh.energy -= tune.burn_drain * dt;
  else sh.energy = Math.min(maxEnergy(sh, tune), sh.energy + regen(sh, tune) * dt);
  sh.cool -= dt; sh.bombCool -= dt; sh.mineCool -= dt; sh.flash -= dt; sh.shield -= dt;
  if (sh.shield > 0 && (c.fire || c.bomb || c.mine)) sh.shield = 0; // firing drops spawn protection
  if (c.fire) fireGuns(w, m, sh, tune);
  if (c.bomb) fireBomb(w, m, sh, tune);
  if (c.mine) dropMine(w, m, sh, tune);
}

function updateShots(w: World, tune: Tuning, dt: number): void {
  const m = zoneMap(w.mapSeed, w.tiles), size = w.size;
  const done = (b: Shot) => {
    b.life = 0;
    if (b.kind === 'bomb') blast(w, b.x, b.y, b.level, b.owner, tune);
    else w.events.push({ type: 'burst', x: b.x, y: b.y, n: 3, speed: 70, owner: b.owner });
  };
  for (const b of w.shots) {
    b.life -= dt;
    if (b.life <= 0) { if (b.kind === 'bomb') done(b); continue; }
    moveBody(m, b, 0, dt, 1, () => {
      if (b.bounces > 0) { b.bounces--; return true; }
      done(b); return false;
    });
    if (b.life <= 0) continue;
    if (inSafe(m, b.x, b.y)) { b.life = 0; continue; } // the safe zone swallows fire
    const reach = b.kind === 'bomb' ? 6 : 2;
    for (const sh of w.ships) {
      if (sh.id === b.owner || !sh.alive || sh.shield > 0) continue;
      if (Math.hypot(wd(b.x, sh.x, size), wd(b.y, sh.y, size)) < HULL_RADIUS[sh.hull] + reach) {
        if (b.kind === 'bomb') { done(b); break; }
        b.life = 0;
        w.events.push({ type: 'burst', x: b.x, y: b.y, n: 4, speed: 110, owner: b.owner });
        damage(w, sh, gunDamage(b.level, tune), b.owner, tune); break;
      }
    }
  }
  w.shots = w.shots.filter(b => b.life > 0);
  const gone = new Set<number>();
  w.mines.forEach((mn, i) => {
    mn.age += dt;
    if (mn.age > tune.mine_life) { gone.add(i); return; }
    if (mn.age < tune.mine_arm) return;
    for (const sh of w.ships) if (sh.alive && sh.id !== mn.owner && sh.shield <= 0 && dist(sh, mn, size) < tune.mine_trigger + HULL_RADIUS[sh.hull]) {
      gone.add(i); blast(w, mn.x, mn.y, mn.level, mn.owner, tune); break;
    }
  });
  if (gone.size) w.mines = w.mines.filter((_, i) => !gone.has(i));
}

/**
 * Advances the zone by dt. `inputs` holds what each human seat is pressing, by ship id; bots
 * decide for themselves. Events from this step are appended to `w.events` (the caller empties it).
 */
export function step(w: World, inputs: ReadonlyMap<number, ShipInput>, tune: Tuning, dt: number): void {
  w.t += dt;
  for (const sh of w.ships) if (!sh.human) think(w, sh, tune, dt);
  for (const sh of w.ships) fly(w, sh, sh.human ? inputs.get(sh.id) ?? NO_INPUT : botInput(sh, tune), tune, dt);
  updateShots(w, tune, dt);
  updateSalvage(w, tune, dt);
}
