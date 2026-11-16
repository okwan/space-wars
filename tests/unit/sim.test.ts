// Vitest: the zone's rules in src/game/, run in Node with no browser.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { dist, makeRng, wd, wrap } from '../../src/game/math';
import { damage, fly, startRound, step, STEP, updateBeacons } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { NO_INPUT, type Tuning, type World } from '../../src/game/types';
import { leaveSeat, newWorld, takeSeat } from '../../src/game/world';

const tune: Tuning = tuningFrom(config);
function zone(seed = 7, humans?: number[]): World {
  const w = newWorld(tune, { seed, humans }); startRound(w, tune); w.events = []; return w;
}
const input = (o: Partial<typeof NO_INPUT>) => ({ ...NO_INPUT, ...o });

describe('wrap-around geometry', () => {
  it('takes the short way across the edge', () => {
    expect(wd(3900, 100, 4000)).toBe(200);
    expect(wd(100, 3900, 4000)).toBe(-200);
    expect(wrap(-10, 4000)).toBe(3990);
    expect(dist({ x: 10, y: 10 }, { x: 3990, y: 3990 }, 4000)).toBeCloseTo(Math.hypot(20, 20));
  });
  it('repeats random numbers for the same seed', () => {
    const a = makeRng(3), b = makeRng(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('a new zone', () => {
  it('has two full fleets, one human seat, mirrored rocks and three beacons', () => {
    const w = zone();
    expect(w.ships.length).toBe(tune.fleet_size * 2);
    expect(w.ships.filter(s => s.human).map(s => s.id)).toEqual([0]);
    expect(w.ships.filter(s => s.team === 0).length).toBe(tune.fleet_size);
    expect(w.beacons.length).toBe(3);
    for (let i = 0; i < w.asteroids.length; i += 2) {
      expect(w.asteroids[i].x + w.asteroids[i + 1].x).toBeCloseTo(w.size);
      expect(w.asteroids[i].y).toBe(w.asteroids[i + 1].y);
    }
  });
});

describe('flight', () => {
  it('drifts: speed stays almost the same with no thrust', () => {
    const w = zone(), sh = w.ships[0];
    sh.vx = 200; sh.vy = 0; sh.x = 1000; sh.y = 1000; w.asteroids = [];
    for (let i = 0; i < 60; i++) fly(w, sh, NO_INPUT, tune, STEP);
    expect(Math.hypot(sh.vx, sh.vy)).toBeGreaterThan(200 * (1 - tune.drag) - 1);
  });
  it('never goes over the hull top speed for long', () => {
    const w = zone(), sh = w.ships[0]; w.asteroids = [];
    for (let i = 0; i < 600; i++) fly(w, sh, input({ thrust: true }), tune, STEP);
    expect(Math.hypot(sh.vx, sh.vy)).toBeLessThanOrEqual(tune[`${sh.hull}_speed`] + 1e-6);
  });
  it('afterburn is faster and drains energy', () => {
    const w = zone(), sh = w.ships[0]; w.asteroids = [];
    const e0 = sh.energy;
    for (let i = 0; i < 120; i++) fly(w, sh, input({ thrust: true, burn: true }), tune, STEP);
    expect(Math.hypot(sh.vx, sh.vy)).toBeGreaterThan(tune[`${sh.hull}_speed`]);
    expect(sh.energy).toBeLessThan(e0);
  });
});

describe('energy is shield and ammo', () => {
  it('firing spends energy and makes shots', () => {
    const w = zone(), sh = w.ships[0], e0 = sh.energy;
    fly(w, sh, input({ fire: true }), tune, STEP);
    sh.cool = 0; // past the launch cooldown
    fly(w, sh, input({ fire: true }), tune, STEP);
    expect(w.shots.length).toBeGreaterThan(0);
    expect(sh.energy).toBeLessThan(e0);
  });
  it('a ship is destroyed at zero energy and the killer scores', () => {
    const w = zone(), target = w.ships[tune.fleet_size], killer = w.ships[0];
    damage(w, target, target.energy + 1, killer.id, tune);
    expect(target.alive).toBe(false);
    expect(killer.kills).toBe(1);
    expect(w.scores[0]).toBe(tune.kill_points);
    expect(w.events.some(e => e.type === 'kill')).toBe(true);
  });
  it('respawns with the loadout picked while waiting', () => {
    const w = zone(), sh = w.ships[0];
    damage(w, sh, 1e9, -1, tune);
    for (let i = 0; i * STEP < tune.respawn_time + 0.1; i++) fly(w, sh, input({ hull: 'bulwark', weapon: 'scatter' }), tune, STEP);
    expect(sh.alive).toBe(true);
    expect([sh.hull, sh.weapon]).toEqual(['bulwark', 'scatter']);
    expect(sh.energy).toBe(tune.bulwark_energy);
  });
});

describe('beacons', () => {
  it('a lone ship inside the ring captures it, then it scores', () => {
    const w = zone(); const b = w.beacons[1];
    for (const s of w.ships) s.alive = false;
    const sh = w.ships[0]; sh.alive = true; b.vx = 0; b.vy = 0; sh.x = b.x; sh.y = b.y;
    const secs = 1 / tune.capture_rate + 0.1;
    for (let i = 0; i * STEP < secs; i++) updateBeacons(w, tune, STEP);
    expect(b.owner).toBe(0);
    expect(w.events.some(e => e.type === 'capture' && e.team === 0)).toBe(true);
    const s0 = w.scores[0];
    for (let i = 0; i < 60; i++) updateBeacons(w, tune, STEP);
    expect(w.scores[0] - s0).toBeCloseTo(tune.beacon_points, 3);
  });
  it('equal numbers inside hold the ring still', () => {
    const w = zone(); const b = w.beacons[1];
    for (const s of w.ships) s.alive = false;
    const a = w.ships[0], e = w.ships[tune.fleet_size];
    for (const s of [a, e]) { s.alive = true; s.x = b.x; s.y = b.y; }
    b.vx = b.vy = 0;
    for (let i = 0; i < 120; i++) updateBeacons(w, tune, STEP);
    expect(b.progress).toBe(0);
  });
});

describe('rounds and the zone', () => {
  it('with rounds on, a fleet at the target wins the round, and the next round starts in place', () => {
    const rt = { ...tune, rounds: 1 }, w = zone();
    w.scores[1] = rt.target_score;
    step(w, new Map(), rt, STEP);
    expect(w.winner).toBe(1);
    expect(w.roundsWon[1]).toBe(1);
    for (let i = 0; i * STEP < rt.round_break + 0.1; i++) step(w, new Map(), rt, STEP);
    expect(w.round).toBe(2);
    expect(w.scores).toEqual([0, 0]);
  });
  it('in the open zone (rounds off) a fleet past the target keeps playing', () => {
    const w = zone();
    w.scores[1] = tune.target_score * 2;
    step(w, new Map(), tune, STEP);
    expect(tune.rounds).toBe(0);
    expect(w.roundOver).toBe(0);
    expect(w.round).toBe(1);
  });
  it('a joining person takes a bot seat, and a bot takes it back on leaving', () => {
    const w = zone();
    const id = takeSeat(w, 1, 'Ada');
    expect(id).toBeGreaterThanOrEqual(0);
    expect(w.ships[id].human).toBe(true);
    leaveSeat(w, id);
    expect(w.ships[id].human).toBe(false);
  });
  it('is deterministic: the same seed and inputs give the same zone', () => {
    const run = () => {
      const w = zone(11);
      for (let i = 0; i < 60 * 40; i++) { step(w, new Map([[0, input({ thrust: i % 120 < 60, fire: true, right: i % 50 < 10 })]]), tune, STEP); w.events = []; }
      return JSON.stringify(w);
    };
    expect(run()).toBe(run());
  });
  it('bots in the open zone fight, collect salvage and earn bounty within three minutes', () => {
    const w = zone(5, []);
    let pickups = 0;
    for (let i = 0; i < 60 * 180; i++) { step(w, new Map(), tune, STEP); pickups += w.events.filter(e => e.type === 'salvage').length; w.events = []; }
    expect(w.ships.some(s => s.kills > 0)).toBe(true);
    expect(pickups).toBeGreaterThan(5);
    expect(w.ships.some(s => s.points > 0)).toBe(true);
  }, 60000);
});
