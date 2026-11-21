// Vitest: hull abilities and soft overspeed (sprite-stack spike, ship classes round), run headless.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { hitsWall, inSafe, NAV, TILE, zoneMap } from '../../src/game/map';
import { topSpeed } from '../../src/game/salvage';
import { step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { NO_INPUT, type Hull, type Ship, type ShipInput, type Tuning, type World } from '../../src/game/types';
import { newWorld } from '../../src/game/world';

const base: Tuning = tuningFrom(config);
const input = (o: Partial<ShipInput>): ShipInput => ({ ...NO_INPUT, ...o });

/** A zone with only ship 0 (and optionally ship 1) in play, at an open spot. */
function setup(hull: Hull, tune: Tuning, withFoe = false): { w: World; me: Ship; foe: Ship; at: { x: number; y: number } } {
  const w = newWorld(tune, { seed: 7, humans: [0] }); w.events = [];
  const m = zoneMap(w.mapSeed, w.tiles);
  let at = { x: 0, y: 0 };
  scan: for (let cy = 4; cy < m.navN - 4; cy += 3) for (let cx = 4; cx < m.navN - 4; cx += 3) {
    const x = (cx + 0.5) * NAV * TILE, y = (cy + 0.5) * NAV * TILE;
    if (!hitsWall(m, x, y, 300) && !inSafe(m, x, y) && Math.hypot(x - w.size / 2, y - w.size / 2) > 900) { at = { x, y }; break scan; }
  }
  const me = w.ships[0], foe = w.ships[1];
  for (const sh of w.ships) if (sh !== me && !(withFoe && sh === foe)) { sh.alive = false; sh.respawn = 1e9; }
  w.salvage = []; w.shots = []; w.mines = [];
  Object.assign(me, at, { hull, vx: 0, vy: 0, a: 0, shield: 0, abilityCool: 0, energy: tune[`${hull}_energy`] });
  if (withFoe) Object.assign(foe, { x: at.x + 120, y: at.y, vx: 0, vy: 0, shield: 0, human: true });
  return { w, me, foe, at };
}
const go = (w: World, c: ShipInput, n = 1, c1: ShipInput = NO_INPUT) => { for (let i = 0; i < n; i++) step(w, new Map([[0, c], [1, c1]]), tunes.get(w) ?? base, STEP); };
const tunes = new WeakMap<World, Tuning>();

describe('hull abilities', () => {
  it('dart dash pushes past top speed, and soft overspeed eases it back instead of cutting it', () => {
    const tune = { ...base, overspeed_decel: 100 };
    const { w, me } = setup('dart', tune); tunes.set(w, tune);
    go(w, input({ ability: true }));
    const cap = topSpeed(me, tune), sp = Math.hypot(me.vx, me.vy);
    expect(sp).toBeCloseTo(tune.dash_speed, 0);
    me.vx = cap + 200; me.vy = 0;
    go(w, NO_INPUT, 60); // one second
    expect(me.vx).toBeCloseTo(cap + 100, 0);
    expect(w.events.some(e => e.type === 'ability' && e.kind === 'dash')).toBe(true);
  });

  it('without overspeed_decel, speed over the cap is cut at once (the main game as before)', () => {
    const { w, me } = setup('dart', base); tunes.set(w, base);
    const cap = topSpeed(me, base);
    me.vx = cap + 200;
    go(w, NO_INPUT, 1);
    expect(me.vx).toBeCloseTo(cap, 5);
  });

  it('an ability waits for its cooldown and costs energy', () => {
    const { w, me } = setup('lancer', base); tunes.set(w, base);
    const e0 = me.energy;
    go(w, input({ ability: true }));
    expect(w.shots.length).toBe(base.scatter_shots);
    expect(me.energy).toBeLessThan(e0 - base.scatter_cost + 1);
    go(w, input({ ability: true }), 10);
    expect(w.events.filter(e => e.type === 'ability').length).toBe(1);
  });

  it('bulwark repulse turns an incoming bullet around and makes it its own', () => {
    const { w, me, foe } = setup('bulwark', base, true); tunes.set(w, base);
    w.shots.push({ owner: foe.id, kind: 'bullet', level: 1, x: me.x + 60, y: me.y, vx: -400, vy: 0, life: 1, bounces: 0 });
    go(w, input({ ability: true }));
    const b = w.shots[0];
    expect(b.owner).toBe(me.id);
    expect(b.vx).toBeGreaterThan(0);
    expect(foe.vx).toBeGreaterThan(0); // the foe is pushed away too
  });

  it('dash_time turns the dash into a timed burn: forward thrust and a higher cap, then the normal cap', () => {
    const tune = { ...base, dash_time: 1, dash_top: 600, dash_thrust: 400 };
    const { w, me } = setup('dart', tune); tunes.set(w, tune);
    const cap = topSpeed(me, tune);
    me.vx = cap; me.vy = 0; // already at top speed, flying along the heading
    go(w, input({ ability: true }), 30); // half a second of boost, no thrust key held
    expect(me.vx).toBeGreaterThan(cap + 150);
    go(w, NO_INPUT, 45); // the boost runs out: back to the cap at once
    expect(Math.hypot(me.vx, me.vy)).toBeCloseTo(cap, 3);
  });
});

describe('movement order and burn options', () => {
  it('turn_after_thrust thrusts along the heading the step started with', () => {
    const tune = { ...base, turn_after_thrust: 1 };
    const { w, me } = setup('lancer', tune); tunes.set(w, tune);
    me.a = 0;
    go(w, input({ thrust: true, right: true }));
    expect(me.vy).toBeCloseTo(0, 6); // pushed straight along x, then turned
    expect(me.a).toBeGreaterThan(0);
  });

  it('burn_regen keeps recharging while the afterburner drains', () => {
    const on = { ...base, burn_regen: 1 }, off = { ...base, burn_regen: 0 };
    const a = setup('lancer', on), b = setup('lancer', off);
    tunes.set(a.w, on); tunes.set(b.w, off);
    a.me.energy = 1000; b.me.energy = 1000;
    go(a.w, input({ thrust: true, burn: true }), 60);
    go(b.w, input({ thrust: true, burn: true }), 60);
    expect(b.me.energy).toBeCloseTo(1000 - off.burn_drain, 0);
    expect(a.me.energy).toBeCloseTo(1000 - on.burn_drain + on.lancer_regen, 0);
  });

  it('with soft overspeed, holding thrust over the cap never builds speed beyond where it was', () => {
    const tune = { ...base, overspeed_decel: 45 };
    const { w, me, at } = setup('dart', tune); tunes.set(w, tune);
    const cap = topSpeed(me, tune);
    me.a = 0; me.vx = cap + 200; me.vy = 0;
    for (let i = 0; i < 120; i++) { go(w, input({ thrust: true })); me.x = at.x; me.y = at.y; }
    expect(me.vx).toBeLessThanOrEqual(cap + 200 - 2 * 45 + 1);
    expect(me.vx).toBeGreaterThan(cap);
  });

  it('heading_steps 40: thrust and guns use the last of 40 fixed directions the ship has reached', () => {
    const tune = { ...base, heading_steps: 40 };
    const { w, me } = setup('lancer', tune); tunes.set(w, tune);
    const step = Math.PI * 2 / 40;
    me.a = step * 0.9; // nearly one step round: still pushes straight along x
    go(w, input({ thrust: true }));
    expect(me.vy).toBeCloseTo(0, 6);
    expect(me.vx).toBeGreaterThan(0);
    me.vx = 0; me.vy = 0; me.a = step * 1.1; // just past it: pushes along the next direction
    go(w, input({ thrust: true }));
    expect(Math.atan2(me.vy, me.vx)).toBeCloseTo(step, 6);
  });
});
