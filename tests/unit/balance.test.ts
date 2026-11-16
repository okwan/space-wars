// Vitest: a bot-only balance smoke for the free-for-all zone. A full zone of bots flies five
// minutes on four seeds; kills, pickups and bounty payouts must all happen, and no single hull may
// run away with the points. A broken tuning change shows up here first.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { HULLS } from '../../src/game/types';
import { newWorld } from '../../src/game/world';

const SEEDS = [1, 2, 3, 4], MINUTES = 5;

describe('bot-only balance', () => {
  it('has fights, pickups and bounties in every zone, and no hull takes most of the kills', () => {
    const tune = tuningFrom(config), byHull: Record<string, number> = { dart: 0, lancer: 0, bulwark: 0 };
    for (const seed of SEEDS) {
      const w = newWorld(tune, { seed, humans: [] });
      let kills = 0, pickups = 0, paid = 0;
      while (w.t < MINUTES * 60) {
        step(w, new Map(), tune, STEP);
        for (const e of w.events) {
          if (e.type === 'kill') { kills++; paid += e.bounty; if (e.by >= 0) byHull[w.ships[e.by].hull]++; }
          if (e.type === 'salvage') pickups++;
        }
        w.events = [];
      }
      expect(kills).toBeGreaterThan(30);
      expect(pickups).toBeGreaterThan(60);
      expect(paid).toBeGreaterThan(0);
    }
    const all = HULLS.reduce((a, h) => a + byHull[h], 0);
    for (const h of HULLS) expect(byHull[h] / all).toBeLessThan(0.6);
  }, 300000);
});
