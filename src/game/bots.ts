// Bot pilots: they take every seat no person holds. They decide after a human-like delay, aim
// with a wobble that tightens as the round goes on, go for beacons, brake inside rings, fight
// what is near, run when low, and dodge rocks. Implements design/game-brief.md (bots, Challenge).

import { angDiff, dist, rand, wd } from './math';
import type { Ship, Tuning, World } from './types';

/** Updates one bot's brain. Between decisions it keeps its plan, but its aim keeps tracking. */
export function think(w: World, sh: Ship, tune: Tuning, dt: number): void {
  const b = sh.brain, size = w.size;
  b.think -= dt;
  if (!sh.alive) return;
  const ramp = Math.min(1, w.roundT / tune.bot_ramp_time);
  const aimErr = tune.bot_aim_error + (tune.bot_aim_error_late - tune.bot_aim_error) * ramp;
  const tg = b.target >= 0 ? w.ships[b.target] : undefined;
  if (tg && tg.alive) { // lead the target: aim where it will be when the shot gets there
    const sp = tune[`${sh.weapon}_speed`];
    const dx = wd(sh.x, tg.x, size), dy = wd(sh.y, tg.y, size), tt = Math.hypot(dx, dy) / sp;
    b.aimA = Math.atan2(dy + (tg.vy - sh.vy) * tt, dx + (tg.vx - sh.vx) * tt) + b.wobble;
  }
  if (b.think > 0) return;
  b.think = tune.bot_reaction * (0.8 + rand(w) * 0.4);
  b.wobble = (rand(w) - 0.5) * 2 * aimErr;
  const maxE = tune[`${sh.hull}_energy`], low = sh.energy < maxE * tune.bot_retreat_energy;
  // the nearest enemy in range
  let foe: Ship | undefined, fd = tune.bot_engage_range;
  for (const o of w.ships) if (o.alive && o.team !== sh.team) { const d = dist(sh, o, size); if (d < fd) { fd = d; foe = o; } }
  // which beacon to work on
  let goal = w.beacons[b.home];
  const grouped = sh.team === 1 && w.grouped && (sh.slot % 10) / 10 < tune.group_share;
  if (grouped && w.groupTarget >= 0) goal = w.beacons[w.groupTarget];
  else if (goal.owner === sh.team && Math.abs(goal.progress) >= 1) {
    let best = goal, bd = Infinity; // home is safe: help the nearest beacon that is not ours
    for (const bc of w.beacons) if (bc.owner !== sh.team) { const d = dist(sh, bc, size); if (d < bd) { bd = d; best = bc; } }
    if (rand(w) < 0.6) goal = best;
  }
  b.wantMine = false; b.wantRev = false;
  if (foe && !low) {
    b.target = foe.id; b.wantFire = true;
    b.wantThrust = fd > tune.bot_keep_range; b.wantBurn = fd > tune.bot_keep_range * 1.6 && sh.energy > maxE * 0.7;
    b.wantRev = fd < tune.bot_keep_range * 0.5;
    if (fd < tune.bot_keep_range * 0.75 && rand(w) < tune.bot_mine_chance) b.wantMine = true;
    return;
  }
  b.target = -1; b.wantFire = false;
  let tx = wd(sh.x, goal.x, size), ty = wd(sh.y, goal.y, size);
  if (low && foe) { // run, and maybe drop a mine behind
    tx = -wd(sh.x, foe.x, size); ty = -wd(sh.y, foe.y, size);
    b.wantMine = rand(w) < tune.bot_mine_chance;
  }
  const d = Math.hypot(tx, ty), sp = Math.hypot(sh.vx, sh.vy), R = tune.beacon_radius;
  if (!low && d < R * 0.7 && sp > 90) {
    // inside the ring and still moving: brake by turning against the drift and thrusting
    b.aimA = Math.atan2(-sh.vy, -sh.vx); b.wantThrust = true; b.wantBurn = false;
  } else {
    // steer for the goal, correcting sideways drift
    const want = Math.atan2(ty, tx), vAlong = (sh.vx * tx + sh.vy * ty) / (d || 1);
    const side = angDiff(want, Math.atan2(sh.vy, sh.vx));
    b.aimA = want - (sp > 80 ? side * 0.5 : 0);
    b.wantThrust = d > R * 0.4 && (vAlong < tune[`${sh.hull}_speed`] * 0.85 || Math.abs(side) > 0.4);
    b.wantBurn = low && !!foe;
    if (d < R * 1.8 && vAlong > 220) { b.aimA = Math.atan2(-sh.vy, -sh.vx); b.wantThrust = true; }
  }
  // rocks ahead: turn off the line
  const sp2 = Math.max(sp, 1);
  for (const a of w.asteroids) {
    const ax = wd(sh.x, a.x, size), ay = wd(sh.y, a.y, size), along = (ax * sh.vx + ay * sh.vy) / sp2;
    if (along > 0 && along < 260 + a.r) {
      const perp = (ax * sh.vy - ay * sh.vx) / sp2;
      if (Math.abs(perp) < a.r + 40) { b.aimA = Math.atan2(sh.vy, sh.vx) + (perp > 0 ? -1.2 : 1.2); b.wantThrust = true; break; }
    }
  }
}
