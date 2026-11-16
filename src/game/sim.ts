// One fixed step of the zone: flight, weapons, mines, beacons and rounds.
// Implements design/game-brief.md (Features: flight, energy, beacons, fleets, loadouts, rounds).
// Pure and deterministic: the same world, inputs and tuning always give the same next world.

import { think } from './bots';
import { angDiff, dist, rand, wd, wrap } from './math';
import { gate, launch, makeBeacons, randomLoadout } from './world';
import { HULL_RADIUS, NO_INPUT, type Ship, type ShipInput, type Team, type Tuning, type World } from './types';

/** Simulation step in seconds: motion is per second, never per frame. */
export const STEP = 1 / 60;

/** Starts a round: scores and beacons reset, every ship launches from its gate. */
export function startRound(w: World, tune: Tuning): void {
  w.scores = [0, 0]; w.roundT = 0; w.roundOver = 0; w.winner = -1; w.grouped = false; w.groupTarget = -1; w.groupTeam = 1;
  w.beacons = makeBeacons(w.size, tune.beacon_drift); w.shots = []; w.mines = [];
  for (const sh of w.ships) launch(w, sh, tune, sh.human ? 0 : 0.55 + rand(w) * 0.25);
  w.events.push({ type: 'roundStart', round: w.round });
}

/** Input a bot is giving this step, from its brain. */
export function botInput(sh: Ship, tune: Tuning): ShipInput {
  const b = sh.brain, err = angDiff(sh.a, b.aimA);
  return {
    left: err < -0.04, right: err > 0.04, thrust: b.wantThrust, rev: b.wantRev, burn: b.wantBurn,
    fire: b.wantFire && Math.abs(err) < tune.bot_fire_angle, mine: b.wantMine,
  };
}

function fire(w: World, sh: Ship, tune: Tuning): void {
  const k = sh.weapon, cost = tune[`${k}_cost`];
  if (sh.cool > 0 || sh.energy <= cost + 1) return;
  sh.energy -= cost; sh.cool = tune[`${k}_interval`];
  const sp = tune[`${k}_speed`], r = HULL_RADIUS[sh.hull];
  const angles = k === 'scatter' ? [-tune.scatter_spread, 0, tune.scatter_spread] : [0];
  for (const da of angles) {
    const a = sh.a + da;
    w.shots.push({
      team: sh.team, owner: sh.id, kind: k,
      x: wrap(sh.x + Math.cos(a) * r * 1.6, w.size), y: wrap(sh.y + Math.sin(a) * r * 1.6, w.size),
      vx: sh.vx + Math.cos(a) * sp, vy: sh.vy + Math.sin(a) * sp,
      life: tune[`${k}_life`], dmg: tune[`${k}_damage`], bounces: k === 'rico' ? tune.rico_bounces : 0,
    });
  }
  w.events.push({ type: 'shot', ship: sh.id, kind: k });
}

function dropMine(w: World, sh: Ship, tune: Tuning): void {
  const live = w.mines.filter(m => m.owner === sh.id).length;
  if (sh.mineCool > 0 || live >= tune.mine_max || sh.energy <= tune.mine_cost + 1) return;
  sh.energy -= tune.mine_cost; sh.mineCool = tune.mine_cooldown;
  const r = HULL_RADIUS[sh.hull];
  w.mines.push({ team: sh.team, owner: sh.id, x: wrap(sh.x - Math.cos(sh.a) * r * 2, w.size), y: wrap(sh.y - Math.sin(sh.a) * r * 2, w.size), age: 0 });
  w.events.push({ type: 'mine', ship: sh.id });
}

/** Takes energy from a ship; at zero it is destroyed. Exposed for tests. */
export function damage(w: World, target: Ship, amount: number, by: number, tune: Tuning): void {
  if (!target.alive) return;
  target.energy -= amount; target.flash = 0.12; target.lastHitBy = by;
  w.events.push({ type: 'hit', ship: target.id, by, amount });
  if (target.energy <= 0) destroy(w, target, by, tune);
}

function destroy(w: World, sh: Ship, by: number, tune: Tuning): void {
  sh.alive = false; sh.respawn = tune.respawn_time; sh.deaths++; sh.energy = 0;
  w.events.push({ type: 'burst', x: sh.x, y: sh.y, team: sh.team, n: 26, speed: 260 });
  const killer = by >= 0 ? w.ships[by] : undefined;
  if (killer && killer.team !== sh.team) {
    killer.kills++;
    if (!w.roundOver) w.scores[killer.team] += tune.kill_points;
  }
  w.events.push({ type: 'kill', ship: sh.id, by: killer && killer.team !== sh.team ? by : -1 });
  if (!sh.human) { const l = randomLoadout(w); sh.nextHull = l.hull; sh.nextWeapon = l.weapon; }
}

/** Pushes a body out of any asteroid it overlaps and bounces its velocity. */
function collideRocks(w: World, o: { x: number; y: number; vx: number; vy: number }, r: number, tune: Tuning,
  onHit?: () => boolean): boolean {
  for (const a of w.asteroids) {
    const dx = wd(a.x, o.x, w.size), dy = wd(a.y, o.y, w.size), d = Math.hypot(dx, dy), min = a.r * 0.92 + r;
    if (d < min && d > 0.001) {
      const nx = dx / d, ny = dy / d, vn = o.vx * nx + o.vy * ny;
      o.x = wrap(a.x + nx * min, w.size); o.y = wrap(a.y + ny * min, w.size);
      if (vn < 0) {
        if (onHit && !onHit()) return true;
        const k = tune.bounce;
        o.vx -= (1 + k) * vn * nx; o.vy -= (1 + k) * vn * ny;
      }
      return true;
    }
  }
  return false;
}

/** One ship's flight for a step, given what its pilot is pressing. */
export function fly(w: World, sh: Ship, c: ShipInput, tune: Tuning, dt: number): void {
  if (!sh.alive) {
    if (c.hull) sh.nextHull = c.hull;
    if (c.weapon) sh.nextWeapon = c.weapon;
    sh.respawn -= dt;
    if (sh.respawn <= 0 && !w.roundOver) launch(w, sh, tune);
    return;
  }
  const h = sh.hull;
  if (c.left) sh.a -= tune[`${h}_turn`] * dt;
  if (c.right) sh.a += tune[`${h}_turn`] * dt;
  const canBurn = c.burn && (c.thrust || c.rev) && sh.energy > tune.burn_drain * dt + 20;
  sh.burning = canBurn;
  const acc = tune[`${h}_thrust`] * (canBurn ? tune.burn_thrust : 1);
  sh.thrusting = c.thrust || c.rev;
  if (c.thrust) { sh.vx += Math.cos(sh.a) * acc * dt; sh.vy += Math.sin(sh.a) * acc * dt; }
  if (c.rev) { sh.vx -= Math.cos(sh.a) * acc * tune.reverse_thrust * dt; sh.vy -= Math.sin(sh.a) * acc * tune.reverse_thrust * dt; }
  // tiny drag, so ships drift; speed over the cap bleeds off, so an afterburn fades after the burn
  sh.vx *= 1 - tune.drag * dt; sh.vy *= 1 - tune.drag * dt;
  const cap = tune[`${h}_speed`] * (canBurn ? tune.burn_speed : 1), sp = Math.hypot(sh.vx, sh.vy);
  if (sp > cap) { const k = Math.max(cap / sp, 1 - tune.overspeed_bleed * dt); sh.vx *= k; sh.vy *= k; }
  sh.x = wrap(sh.x + sh.vx * dt, w.size); sh.y = wrap(sh.y + sh.vy * dt, w.size);
  collideRocks(w, sh, HULL_RADIUS[h] * 0.8, tune);
  // energy: the afterburn drains it, otherwise it refills
  if (canBurn) sh.energy -= tune.burn_drain * dt;
  else sh.energy = Math.min(tune[`${h}_energy`], sh.energy + tune[`${h}_regen`] * dt);
  sh.cool -= dt; sh.mineCool -= dt; sh.flash -= dt;
  if (c.fire) fire(w, sh, tune);
  if (c.mine) dropMine(w, sh, tune);
}

function updateShots(w: World, tune: Tuning, dt: number): void {
  const size = w.size;
  for (const b of w.shots) {
    b.life -= dt;
    b.x = wrap(b.x + b.vx * dt, size); b.y = wrap(b.y + b.vy * dt, size);
    collideRocks(w, b, 2, tune, () => {
      if (b.bounces > 0) { b.bounces--; return true; }
      w.events.push({ type: 'burst', x: b.x, y: b.y, team: b.team, n: 3, speed: 80 });
      b.life = 0; return false;
    });
    if (b.life <= 0) continue;
    for (const sh of w.ships) {
      if (!sh.alive || sh.team === b.team) continue;
      if (Math.hypot(wd(b.x, sh.x, size), wd(b.y, sh.y, size)) < HULL_RADIUS[sh.hull] + 3) {
        b.life = 0;
        w.events.push({ type: 'burst', x: b.x, y: b.y, team: b.team, n: 4, speed: 120 });
        damage(w, sh, b.dmg, b.owner, tune); break;
      }
    }
  }
  w.shots = w.shots.filter(b => b.life > 0);
  const dead = new Set<number>();
  w.mines.forEach((m, i) => {
    m.age += dt;
    if (m.age < tune.mine_arm) return;
    let boom = m.age > tune.mine_life;
    for (const sh of w.ships) if (sh.alive && sh.team !== m.team && dist(sh, m, size) < tune.mine_trigger + HULL_RADIUS[sh.hull]) boom = true;
    if (!boom) return;
    dead.add(i);
    w.events.push({ type: 'burst', x: m.x, y: m.y, team: m.team, n: 30, speed: 340 });
    for (const sh of w.ships) if (sh.alive && sh.team !== m.team) {
      const d = dist(sh, m, size);
      if (d < tune.mine_radius) damage(w, sh, tune.mine_damage * (1 - (0.5 * d) / tune.mine_radius), m.owner, tune);
    }
  });
  w.mines = w.mines.filter((_, i) => !dead.has(i));
}

/** Counts ships in each ring, moves capture progress, and scores held beacons. */
export function updateBeacons(w: World, tune: Tuning, dt: number): void {
  for (const [i, b] of w.beacons.entries()) {
    b.x = wrap(b.x + b.vx * dt, w.size); b.y = wrap(b.y + b.vy * dt, w.size);
    collideRocks(w, b, 30, tune); // beacons bounce off rocks, so their drift wanders the zone
    const sp = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / sp) * tune.beacon_drift; b.vy = (b.vy / sp) * tune.beacon_drift;
    if (w.roundOver) continue;
    const count = [0, 0];
    for (const sh of w.ships) if (sh.alive && dist(sh, b, w.size) < tune.beacon_radius) count[sh.team]++;
    const net = count[0] - count[1];
    if (net !== 0) {
      const before = b.owner;
      b.progress = Math.max(-1, Math.min(1, b.progress + Math.sign(net) * Math.min(tune.capture_max_ships, Math.abs(net)) * tune.capture_rate * dt));
      if (b.progress >= 1) b.owner = 0;
      else if (b.progress <= -1) b.owner = 1;
      else if ((b.owner === 0 && b.progress < 0) || (b.owner === 1 && b.progress > 0)) b.owner = -1;
      if (before !== b.owner) w.events.push({ type: 'capture', beacon: i, team: b.owner, from: before });
    }
    if (b.owner !== -1) w.scores[b.owner] += tune.beacon_points * dt;
  }
  // after a while the fleet that is behind (amber on a tie) picks one enemy-held beacon and goes
  // for it together: a comeback push that works the same for either side
  if (w.roundT > tune.group_time && !w.roundOver) {
    const team: Team = w.scores[0] < w.scores[1] ? 0 : 1, foe = (1 - team) as Team;
    const lead = w.ships.find(x => x.team === team && x.alive) ?? gate(team, w.size);
    let best = -1, bd = Infinity;
    w.beacons.forEach((b, i) => {
      const d = dist(lead, b, w.size) + (b.owner === foe ? 0 : w.size);
      if (d < bd) { bd = d; best = i; }
    });
    w.groupTarget = best;
    if (!w.grouped || w.groupTeam !== team) { w.grouped = true; w.groupTeam = team; w.events.push({ type: 'group', team }); }
  }
}

/**
 * Advances the zone by dt. `inputs` holds what each human seat is pressing, by ship id; bots
 * decide for themselves. Events from this step are appended to `w.events` (the caller empties it).
 */
export function step(w: World, inputs: ReadonlyMap<number, ShipInput>, tune: Tuning, dt: number): void {
  w.t += dt;
  if (!w.roundOver) w.roundT += dt;
  for (const sh of w.ships) if (!sh.human) think(w, sh, tune, dt);
  for (const sh of w.ships) fly(w, sh, sh.human ? inputs.get(sh.id) ?? NO_INPUT : botInput(sh, tune), tune, dt);
  updateShots(w, tune, dt);
  updateBeacons(w, tune, dt);
  // the round: first fleet to the target wins; after a short break the next starts in place
  if (!w.roundOver) {
    for (const t of [0, 1] as Team[]) if (w.scores[t] >= tune.target_score) {
      w.roundOver = tune.round_break; w.winner = t; w.roundsWon[t]++;
      w.events.push({ type: 'round', winner: t });
      break;
    }
  } else {
    w.roundOver -= dt;
    if (w.roundOver <= 0) { w.round++; startRound(w, tune); }
  }
}

/** Ends the break early (the player pressed Enter). */
export function skipBreak(w: World, tune: Tuning): void {
  if (w.roundOver > 0) { w.round++; startRound(w, tune); }
}
