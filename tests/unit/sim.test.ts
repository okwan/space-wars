// Vitest: the zone's rules, run headless (design/game-brief.md, Core loop): the walled map, flight
// with no drag and a speed cap, wall bounces, guns, bombs, the safe zone, and the bots.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { clearLine, findPath, hitsWall, inSafe, NAV, SAFE, TILE, tileAt, WALL, zoneMap } from '../../src/game/map';
import { maxEnergy, topSpeed } from '../../src/game/salvage';
import { damage, exposed, step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { NO_INPUT, type Ship, type ShipInput, type Tuning, type World } from '../../src/game/types';
import { newWorld } from '../../src/game/world';

const tune: Tuning = tuningFrom(config);
function zone(seed = 7, humans: number[] = [0]): World {
  const w = newWorld(tune, { seed, humans }); w.events = []; return w;
}
const input = (o: Partial<ShipInput>): ShipInput => ({ ...NO_INPUT, ...o });
/** An open spot outside the safe zone with no wall within r px (the first one in a fixed scan). */
function openSpot(w: World, r: number, skip = 0): { x: number; y: number } {
  const m = zoneMap(w.mapSeed, w.tiles);
  for (let cy = 4; cy < m.navN - 4; cy += 3) for (let cx = 4; cx < m.navN - 4; cx += 3) {
    const x = (cx + 0.5) * NAV * TILE, y = (cy + 0.5) * NAV * TILE;
    if (!hitsWall(m, x, y, r) && !inSafe(m, x, y) && Math.hypot(x - w.size / 2, y - w.size / 2) > 900 && skip-- <= 0) return { x, y };
  }
  throw new Error('no open spot');
}
/** Puts every ship but `keep` out of play, so a test sees only the ships it sets up. */
function alone(w: World, ...keep: Ship[]): void {
  for (const sh of w.ships) if (!keep.includes(sh)) { sh.alive = false; sh.respawn = 1e9; }
  w.salvage = []; w.shots = []; w.mines = [];
}
/** Steps the zone n times with the human seat 0 pressing `c`. */
function run(w: World, n: number, c: ShipInput = NO_INPUT): void {
  for (let i = 0; i < n; i++) { step(w, new Map([[0, c]]), tune, STEP); }
}

describe('the map', () => {
  it('is the same for the same seed, walled at the border, with a safe zone in the middle', () => {
    const a = zoneMap(42, tune.map_tiles), b = zoneMap(42, tune.map_tiles);
    expect(a.tiles).toEqual(b.tiles);
    expect(tileAt(a, 0, 5)).toBe(WALL);
    expect(tileAt(a, a.n - 1, a.n - 1)).toBe(WALL);
    expect(tileAt(a, a.centre, a.centre)).toBe(SAFE);
    expect(zoneMap(43, tune.map_tiles).tiles).not.toEqual(a.tiles);
  });
  it('has mostly open floor, and a route from the safe zone to far corners', () => {
    const m = zoneMap(7, tune.map_tiles);
    const open = m.nav.reduce((s, v) => s + v, 0) / m.nav.length;
    expect(open).toBeGreaterThan(0.5);
    const c = (m.centre + 0.5) * TILE;
    let cell = Math.floor(m.navN * 0.85); // the open nav cell nearest the far corner, on the diagonal
    while (!m.nav[cell * m.navN + cell]) cell--;
    const far = (cell + 0.5) * NAV * TILE;
    const path = findPath(m, c, c, far, far, 1e6);
    expect(path.length).toBeGreaterThan(5);
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - far, end.y - far)).toBeLessThan(NAV * TILE * 4);
    for (let i = 1; i < path.length; i++) expect(clearLine(m, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)).toBe(true);
  });
});

describe('flight', () => {
  it('has no drag: a ship coasting in open space keeps its speed', () => {
    const w = zone(), me = w.ships[0], at = openSpot(w, 240);
    alone(w, me);
    Object.assign(me, at, { vx: 120, vy: 0, a: 0 });
    run(w, 60);
    expect(Math.hypot(me.vx, me.vy)).toBeCloseTo(120, 5);
    expect(me.x).toBeCloseTo(at.x + 120, 0);
  });
  it('caps speed at the hull top speed, and the afterburner raises the cap', () => {
    const w = zone(), me = w.ships[0];
    alone(w, me);
    const cap = topSpeed(me, tune);
    // thrust from a standstill for a few seconds, re-centred each step so no wall is ever met
    const at = openSpot(w, 300);
    for (let i = 0; i < 240; i++) { me.x = at.x; me.y = at.y; me.energy = 1e6; run(w, 1, input({ thrust: true })); }
    expect(Math.hypot(me.vx, me.vy)).toBeCloseTo(cap, 3);
    for (let i = 0; i < 240; i++) { me.x = at.x; me.y = at.y; me.energy = 1e6; run(w, 1, input({ thrust: true, burn: true })); }
    expect(Math.hypot(me.vx, me.vy)).toBeGreaterThan(cap * 1.2);
  });
  it('bounces off a wall, slower than it hit', () => {
    const w = zone(), me = w.ships[0], m = zoneMap(w.mapSeed, w.tiles);
    alone(w, me);
    // fly right from an open spot until a wall
    const at = openSpot(w, 60);
    Object.assign(me, at, { vx: 200, vy: 0, a: 0 });
    let t = 0;
    while (me.vx > 0 && t++ < 60 * 30) run(w, 1);
    expect(me.vx).toBeLessThan(0);
    expect(-me.vx).toBeCloseTo(200 * tune.bounce, 3);
    expect(hitsWall(m, me.x, me.y, 13)).toBe(false);
    expect(w.events.some(e => e.type === 'bounce' && e.ship === 0)).toBe(true);
  });
  it('never leaves the map or ends up inside a wall, at any speed', () => {
    const w = zone(3), m = zoneMap(w.mapSeed, w.tiles);
    for (let i = 0; i < 60 * 30; i++) {
      step(w, new Map([[0, input({ thrust: true, burn: i % 300 < 150, right: i % 97 < 20 })]]), tune, STEP);
      for (const sh of w.ships) if (sh.alive) expect(hitsWall(m, sh.x, sh.y, 1)).toBe(false);
    }
  });
});

describe('weapons', () => {
  it('bullets carry the ship\'s own velocity, and cost energy', () => {
    const w = zone(), me = w.ships[0], at = openSpot(w, 200);
    alone(w, me);
    Object.assign(me, at, { vx: 0, vy: 150, a: 0, shield: 0, cool: 0 });
    const e0 = me.energy;
    run(w, 1, input({ fire: true }));
    const b = w.shots.find(s => s.owner === 0 && s.kind === 'bullet')!;
    expect(b).toBeDefined();
    expect(b.vx).toBeCloseTo(tune.gun_speed, 3);
    expect(b.vy).toBeCloseTo(150, 3);
    expect(me.energy).toBeLessThan(e0);
  });
  it('a bullet hit takes energy; a ship at zero is destroyed and its killer collects the bounty', () => {
    const w = zone(), me = w.ships[0], foe = w.ships[1], at = openSpot(w, 200);
    alone(w, me, foe);
    Object.assign(me, at, { vx: 0, vy: 0, a: 0, shield: 0, cool: 0 });
    Object.assign(foe, { x: at.x + 120, y: at.y, vx: 0, vy: 0, shield: 0, energy: maxEnergy(foe, tune), human: true, bounty: 25 });
    run(w, 20, input({ fire: true }));
    expect(foe.energy).toBeLessThan(maxEnergy(foe, tune));
    foe.energy = 1;
    run(w, 30, input({ fire: true }));
    expect(foe.alive).toBe(false);
    expect(me.kills).toBe(1);
    expect(me.points).toBe(25);
  });
  it('a bomb bursts with splash damage that falls off with distance and never hurts its owner', () => {
    const w = zone(), me = w.ships[0], near = w.ships[1], far = w.ships[2], at = openSpot(w, 260);
    alone(w, me, near, far);
    const e0 = 1000; // well below every hull's full energy, so any loss shows
    for (const s of [me, near, far]) Object.assign(s, { hull: 'lancer', vx: 0, vy: 0, shield: 0, human: true, energy: e0 });
    Object.assign(me, at); Object.assign(near, { x: at.x + 30, y: at.y }); Object.assign(far, { x: at.x, y: at.y + 70 });
    w.shots.push({ owner: 0, kind: 'bomb', level: 1, x: at.x + 1, y: at.y, vx: 0, vy: 0, life: STEP / 2, bounces: 0 });
    run(w, 1);
    expect(w.events.some(e => e.type === 'blast')).toBe(true);
    expect(me.energy).toBeGreaterThanOrEqual(e0);
    expect(near.energy).toBeLessThan(e0 - 100);
    expect(far.energy).toBeLessThan(e0 - 100);
    expect(near.energy).toBeLessThan(far.energy);
  });
  it('the safe zone: no firing inside it, and nothing inside it can be hurt', () => {
    const w = zone(), me = w.ships[0], m = zoneMap(w.mapSeed, w.tiles);
    alone(w, me);
    Object.assign(me, { x: (m.centre + 0.5) * TILE, y: (m.centre + 0.5) * TILE, vx: 0, vy: 0, shield: 0, cool: 0, bombCool: 0 });
    run(w, 5, input({ fire: true, bomb: true, mine: true }));
    expect(w.shots.length + w.mines.length).toBe(0);
    expect(exposed(w, me)).toBe(false);
    const e0 = me.energy;
    damage(w, me, 500, 1, tune);
    expect(me.energy).toBe(e0);
  });
  it('a fresh launch is shielded until it fires', () => {
    const w = zone(), me = w.ships[0], at = openSpot(w, 100);
    alone(w, me);
    Object.assign(me, at, { shield: tune.spawn_shield, vx: 0, vy: 0 });
    const e0 = me.energy;
    damage(w, me, 300, 1, tune);
    expect(me.energy).toBe(e0);
    run(w, 1, input({ fire: true }));
    expect(me.shield).toBeLessThanOrEqual(0);
    damage(w, me, 300, 1, tune);
    expect(me.energy).toBeLessThan(e0);
  });
});

describe('the zone', () => {
  it('is deterministic: the same seed and inputs give the same zone', () => {
    const go = () => { const w = zone(5); run(w, 60 * 20, input({ thrust: true, fire: true })); return JSON.stringify([w.ships.map(s => [s.x, s.y, s.energy, s.kills]), w.shots.length, w.seed]); };
    expect(go()).toBe(go());
  });
  it('relaunches a downed pilot in the safe zone with the hull it picked', () => {
    const w = zone(), me = w.ships[0], m = zoneMap(w.mapSeed, w.tiles);
    const at = openSpot(w, 60);
    Object.assign(me, at, { shield: 0 });
    damage(w, me, 1e9, 1, tune);
    expect(me.alive).toBe(false);
    run(w, Math.ceil(tune.respawn_time / STEP) + 2, input({ hull: 'bulwark' }));
    expect(me.alive).toBe(true);
    expect(me.hull).toBe('bulwark');
    expect(inSafe(m, me.x, me.y)).toBe(true);
  });
  it('bots in the zone fight, collect salvage and earn bounty within two minutes', () => {
    const w = zone(4, []);
    let kills = 0, pickups = 0;
    while (w.t < 120) {
      step(w, new Map(), tune, STEP);
      for (const e of w.events) { if (e.type === 'kill') kills++; if (e.type === 'salvage') pickups++; }
      w.events = [];
    }
    expect(kills).toBeGreaterThan(5);
    expect(pickups).toBeGreaterThan(20);
    expect(w.ships.some(s => s.points > 0)).toBe(true);
  }, 60000);
});
