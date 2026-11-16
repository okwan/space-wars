// Bot pilots: they take every seat no person holds. Free-for-all: each one picks the best target
// in sight (a fat bounty draws it from further away), fights it with lead aim, guns and bombs,
// grabs salvage, runs to the safe zone when low, and otherwise roams near the real pilots.
// They route round the walls with the map's navigation grid. Deterministic: decisions use the
// world's rng. Implements design/game-brief.md (bots, Challenge).

import { clearLine, findPath, TILE, zoneMap, NAV, type ZoneMap } from './map';
import { angDiff, dist, rand, wd } from './math';
import { maxEnergy, topSpeed } from './salvage';
import { exposed } from './sim';
import { HULL_RADIUS, type Ship, type Tuning, type World } from './types';

/** Points the bot at a place it can fly to, routing round walls when the straight line is blocked. */
function steerTo(w: World, m: ZoneMap, sh: Ship, gx: number, gy: number, tune: Tuning, slow = false): void {
  const b = sh.brain, r = HULL_RADIUS[sh.hull] + 3;
  let tx = gx, ty = gy;
  if (!clearLine(m, sh.x, sh.y, gx, gy, r)) {
    const moved = Math.hypot(gx - b.goalX, gy - b.goalY) > 160;
    if (b.replan <= 0 || moved || !b.path.length) {
      b.path = findPath(m, sh.x, sh.y, gx, gy, tune.bot_path_budget);
      b.replan = tune.bot_replan; b.goalX = gx; b.goalY = gy;
    }
    while (b.path.length > 1 && Math.hypot(b.path[0].x - sh.x, b.path[0].y - sh.y) < NAV * TILE * 1.5) b.path.shift();
    // fly at the furthest waypoint (a few ahead) that is in plain sight: smooths the grid's corners
    let pick = b.path[0];
    for (let i = Math.min(b.path.length - 1, 8); i > 0; i--) if (clearLine(m, sh.x, sh.y, b.path[i].x, b.path[i].y, r)) { pick = b.path[i]; break; }
    if (pick) { tx = pick.x; ty = pick.y; }
    else { b.goalX = 0; b.goalY = 0; b.think = 0; b.wantThrust = false; b.wantFire = false; b.wantBomb = false; return; } // no route: pick another goal next step
  } else b.path = [];
  // seek: aim the nose along the velocity change needed to fly at the target at full speed
  const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy) || 1;
  const want = topSpeed(sh, tune) * (slow ? Math.min(1, d / 260) : 1);
  const ax = (dx / d) * want - sh.vx, ay = (dy / d) * want - sh.vy;
  b.aimA = Math.atan2(ay, ax);
  b.wantThrust = Math.hypot(ax, ay) > 25 && Math.abs(angDiff(sh.a, b.aimA)) < 0.7;
  b.wantRev = false; b.wantFire = false; b.wantBomb = false; b.wantBurn = false;
}

/** Updates one bot's brain. Between decisions it keeps its plan, but its aim keeps tracking. */
export function think(w: World, sh: Ship, tune: Tuning, dt: number): void {
  const b = sh.brain;
  b.think -= dt; b.replan -= dt;
  if (!sh.alive) { b.stuck = 0; return; }
  // wedged on a wall: back straight off it for a moment, then plan again
  b.stuck = b.wantThrust && Math.hypot(sh.vx, sh.vy) < 25 ? b.stuck + dt : Math.max(0, b.stuck - dt * 2);
  if (b.stuck > 1.2) {
    b.aimA = sh.a + Math.PI * (0.6 + rand(w) * 0.8); b.wantThrust = true; b.wantRev = false; b.path = []; b.goalX = 0; b.goalY = 0;
    b.stuck = 0; b.think = 0.5; return;
  }
  const m = zoneMap(w.mapSeed, w.tiles), size = w.size;
  const tg = b.target >= 0 ? w.ships[b.target] : undefined;
  const maxE = maxEnergy(sh, tune), low = sh.energy < maxE * tune.bot_retreat_energy;
  if (tg && tg.alive && b.wantFire) { // lead the target: aim where it will be when the shot gets there
    const sp = tune.gun_speed, dx = wd(sh.x, tg.x, size), dy = wd(sh.y, tg.y, size), tt = Math.hypot(dx, dy) / sp;
    b.aimA = Math.atan2(dy + (tg.vy - sh.vy) * tt, dx + (tg.vx - sh.vx) * tt) + b.wobble;
  }
  if (b.think > 0) return;
  b.think = tune.bot_reaction * (0.8 + rand(w) * 0.4);
  b.wobble = (rand(w) - 0.5) * 2 * tune.bot_aim_error;
  b.wantMine = false;

  // the best target in sight: near, and a fat bounty draws a bot from further away; bots look
  // further for people than for each other, so the fights come to the people in the zone
  let foe: Ship | undefined, fd = Infinity, fscore = Infinity;
  for (const o of w.ships) {
    if (o === sh || !exposed(w, o)) continue;
    const d = dist(sh, o, size), reach = tune.bot_engage_range * (1 + Math.min(2, (o.bounty / 60) * tune.bot_bounty_reach)) * (o.human ? 1 : tune.bot_bot_reach);
    if (d > reach || d / reach >= fscore || !clearLine(m, sh.x, sh.y, o.x, o.y)) continue;
    fscore = d / reach; fd = d; foe = o;
  }
  const rookie = !!foe && foe.human && foe.kills + foe.deaths < tune.bot_rookie_fights;
  if (rookie) b.wobble *= tune.bot_rookie_aim; // a new pilot meets looser aim and no mines

  if (low) { // run home to the safe zone to recharge
    b.target = -1;
    steerTo(w, m, sh, m.centre * TILE, m.centre * TILE, tune, true);
    b.wantBurn = !!foe && sh.energy > maxE * 0.12;
    if (foe && fd < 160 && !rookie && rand(w) < tune.bot_mine_chance * 3) b.wantMine = true;
    return;
  }
  if (foe) {
    b.target = foe.id; b.wantFire = true; b.path = [];
    const dx = wd(sh.x, foe.x, size), dy = wd(sh.y, foe.y, size), tt = fd / tune.gun_speed;
    b.aimA = Math.atan2(dy + (foe.vy - sh.vy) * tt, dx + (foe.vx - sh.vx) * tt) + b.wobble;
    const closing = -((dx * (foe.vx - sh.vx) + dy * (foe.vy - sh.vy)) / (fd || 1));
    b.wantThrust = fd > tune.bot_keep_range * 1.25 && closing < 140;
    b.wantRev = fd < tune.bot_keep_range * 0.6 || closing > 260;
    if (b.wantRev) b.wantThrust = false;
    b.wantBurn = false;
    b.wantBomb = fd < tune.bot_bomb_range && fd > 90 && sh.energy > maxE * 0.6 && rand(w) < 0.5;
    if (!rookie && fd < tune.bot_keep_range && rand(w) < tune.bot_mine_chance) b.wantMine = true;
    return;
  }
  b.target = -1;
  // salvage nearby: go and grab it
  let pod: { x: number; y: number } | undefined, pd = tune.bot_salvage_range;
  for (const s of w.salvage) { const d = dist(sh, s, size); if (d < pd) { pd = d; pod = s; } }
  if (pod) { steerTo(w, m, sh, pod.x, pod.y, tune, true); return; }
  // otherwise: most bots keep company with the nearest real pilot; the rest roam
  let home: { x: number; y: number } = sh, span = 1400;
  if ((sh.id % 10) / 10 < tune.bot_company_share) {
    let pal: Ship | undefined, pl = Infinity;
    for (const o of w.ships) if (o.human && o.alive) { const d = dist(sh, o, size); if (d < pl) { pl = d; pal = o; } }
    if (pal && pl > tune.bot_company_range * 0.5) { steerTo(w, m, sh, pal.x, pal.y, tune); return; }
    if (pal) { home = pal; span = tune.bot_company_range * 0.5; } // close by: roam round the pilot, not away
  }
  const goalOff = Math.hypot(b.goalX - home.x, b.goalY - home.y) > span * 1.5;
  if (Math.hypot(b.goalX - sh.x, b.goalY - sh.y) < 120 || (b.goalX === 0 && b.goalY === 0) || goalOff || rand(w) < 0.02) {
    for (let tries = 0; tries < 30; tries++) { // a new spot to roam to: open, not too far from home
      const cx = Math.floor(((home.x + (rand(w) * 2 - 1) * span) / (NAV * TILE))), cy = Math.floor(((home.y + (rand(w) * 2 - 1) * span) / (NAV * TILE)));
      if (cx < 0 || cy < 0 || cx >= m.navN || cy >= m.navN || !m.nav[cy * m.navN + cx]) continue;
      b.goalX = (cx + 0.5) * NAV * TILE; b.goalY = (cy + 0.5) * NAV * TILE; b.replan = 0; break;
    }
  }
  steerTo(w, m, sh, b.goalX, b.goalY, tune);
}
