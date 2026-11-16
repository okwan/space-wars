// Vitest: a bot-only balance smoke for the open zone. Twenty bots fly five minutes on four seeds;
// neither fleet may run away with the score, and kills, pickups and bounty payouts must all happen.
// A broken tuning change shows up here first.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { startRound, step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { newWorld } from '../../src/game/world';

const SEEDS = [1, 2, 3, 4], MINUTES = 5;

describe('bot-only balance', () => {
  it('shares the score fairly between the fleets, with fights, pickups and bounties in every zone', () => {
    const tune = tuningFrom(config), totals = [0, 0];
    for (const seed of SEEDS) {
      const w = newWorld(tune, { seed, humans: [] }); startRound(w, tune);
      let kills = 0, pickups = 0, paid = 0;
      while (w.t < MINUTES * 60) {
        step(w, new Map(), tune, STEP);
        for (const e of w.events) {
          if (e.type === 'kill') { kills++; paid += e.bounty; }
          if (e.type === 'salvage') pickups++;
        }
        w.events = [];
      }
      totals[0] += w.scores[0]; totals[1] += w.scores[1];
      expect(kills).toBeGreaterThan(10);
      expect(pickups).toBeGreaterThan(20);
      expect(paid).toBeGreaterThan(0);
    }
    expect(Math.min(...totals) / (totals[0] + totals[1])).toBeGreaterThan(0.35);
  }, 300000);
});
