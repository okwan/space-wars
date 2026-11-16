// Vitest: salvage, upgrades and bounty (design/game-brief.md, Core loop), run headless.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { grantUpgrade, maxEnergy, payBounty, seedSalvage, topSpeed, updateSalvage } from '../../src/game/salvage';
import { damage, step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { UPGRADES, type Tuning, type World } from '../../src/game/types';
import { newWorld } from '../../src/game/world';

const tune: Tuning = tuningFrom(config);
function zone(seed = 11): World {
  const w = newWorld(tune, { seed }); w.events = []; return w;
}

describe('salvage', () => {
  it('a new zone starts with half its salvage', () => {
    const w = zone();
    expect(w.salvage.length).toBeGreaterThanOrEqual(tune.salvage_max / 2);
  });
  it('flying over salvage removes it, grants one upgrade and adds bounty', () => {
    const w = zone(), sh = w.ships[0];
    w.salvage = []; seedSalvage(w, tune); w.salvage.length = 1;
    const piece = w.salvage[0], b0 = sh.bounty;
    sh.x = piece.x; sh.y = piece.y;
    updateSalvage(w, tune, STEP);
    expect(w.salvage.find(s => s.id === piece.id)).toBeUndefined();
    expect(sh.up.reduce((a, b) => a + b, 0)).toBe(1);
    expect(sh.bounty).toBe(b0 + tune.bounty_salvage);
    expect(w.events.some(e => e.type === 'salvage' && e.ship === sh.id)).toBe(true);
  });
  it('upgrades stop at their caps', () => {
    const w = zone(), sh = w.ships[0];
    let n = 0;
    while (grantUpgrade(w, sh, tune)) n++;
    const caps = UPGRADES.reduce((a, k) => a + tune[`up_${k}_max`], 0);
    expect(n).toBe(caps);
    expect(grantUpgrade(w, sh, tune)).toBeNull();
  });
  it('upgrades raise the stats they name', () => {
    const w = zone(), sh = w.ships[0];
    const e0 = maxEnergy(sh, tune), v0 = topSpeed(sh, tune);
    sh.up[UPGRADES.indexOf('cells')] = 2; sh.up[UPGRADES.indexOf('engine')] = 1;
    expect(maxEnergy(sh, tune)).toBeCloseTo(e0 * (1 + 2 * tune.up_cells));
    expect(topSpeed(sh, tune)).toBeCloseTo(v0 * (1 + tune.up_engine));
  });
  it('salvage ages out after its life', () => {
    const w = zone();
    for (const s of w.salvage) s.age = tune.salvage_life + 1;
    const ids = new Set(w.salvage.map(s => s.id));
    for (const sh of w.ships) sh.alive = false;
    updateSalvage(w, tune, STEP);
    expect(w.salvage.some(s => ids.has(s.id))).toBe(false);
  });
});

describe('bounty', () => {
  it('a kill pays the victim bounty as points and raises the killer bounty', () => {
    const w = zone(), killer = w.ships[0], victim = w.ships[1];
    victim.bounty = 40; killer.bounty = 5;
    const paid = payBounty(killer, victim, tune);
    expect(paid).toBe(40);
    expect(killer.points).toBe(40);
    expect(killer.bounty).toBe(5 + Math.max(tune.bounty_kill_min, Math.round(40 * tune.bounty_kill_share)));
  });
  it('dying loses the bounty and every upgrade', () => {
    const w = zone(), killer = w.ships[0], victim = w.ships[1], pod = w.salvage[0];
    Object.assign(victim, { x: pod.x, y: pod.y, shield: 0 }); // out in the open, where it can be hurt
    victim.bounty = 30; victim.up = victim.up.map(() => 1);
    damage(w, victim, 1e9, killer.id, tune);
    expect(victim.alive).toBe(false);
    expect(victim.bounty).toBe(0);
    expect(victim.up.every(v => v === 0)).toBe(true);
    expect(killer.points).toBe(30);
    expect(w.events.some(e => e.type === 'kill' && e.bounty === 30)).toBe(true);
  });
  it('the open zone stays deterministic with salvage in play', () => {
    const run = () => { const w = zone(5); for (let i = 0; i < 1800; i++) step(w, new Map(), tune, STEP); return JSON.stringify([w.ships.map(s => [s.x, s.bounty, s.points, s.up]), w.salvage]); };
    expect(run()).toBe(run());
  });
});

describe('bots around people', () => {
  const nearby = (share: number) => {
    const t2 = { ...tune, bot_company_share: share }, w = newWorld(t2, { seed: 9, humans: [0] });
    const me = w.ships[0], spot = { x: w.salvage[0].x, y: w.salvage[0].y }; // an open spot away from the safe zone
    let sum = 0, n = 0;
    for (let i = 0; i < 60 * 90; i++) {
      me.x = spot.x; me.y = spot.y; me.vx = me.vy = 0; me.energy = 1e6; step(w, new Map(), t2, STEP);
      if (i >= 60 * 30 && i % 30 === 0) { // the average over the last minute, within a couple of screens
        sum += w.ships.filter(s => !s.human && s.alive && Math.hypot(s.x - me.x, s.y - me.y) < tune.bot_company_range * 2).length; n++;
      }
    }
    return sum / n;
  };
  it('keep more bots within a couple of screens of a lone pilot than bots left to themselves', () => {
    const a = nearby(tune.bot_company_share), b = nearby(0);
    expect(a).toBeGreaterThan(b);
    expect(a).toBeGreaterThanOrEqual(6); // the research target: six to ten ships near each person
  }, 60000);
});
