// Vitest: a bot-only balance smoke. Twenty bots play three rounds on six seeds; neither fleet may
// dominate, and rounds must land in a sane length. A broken tuning change shows up here first.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { startRound, step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { newWorld } from '../../src/game/world';

const SEEDS = [1, 2, 3, 4, 5, 6], ROUNDS = 3;

describe('bot-only balance', () => {
  it('splits rounds fairly between the fleets, with rounds of two to five and a half minutes', () => {
    const tune = tuningFrom(config), wins = [0, 0], lengths: number[] = [];
    for (const seed of SEEDS) {
      const w = newWorld(tune, { seed, humans: [] }); startRound(w, tune);
      let rounds = 0;
      while (rounds < ROUNDS && w.t < 1200) {
        step(w, new Map(), tune, STEP);
        for (const e of w.events) if (e.type === 'round') { wins[e.winner]++; lengths.push(w.roundT); rounds++; }
        w.events = [];
      }
    }
    expect(wins[0] + wins[1]).toBe(SEEDS.length * ROUNDS);
    expect(Math.min(...wins)).toBeGreaterThanOrEqual(SEEDS.length * ROUNDS * 0.3);
    expect(Math.min(...lengths)).toBeGreaterThan(120);
    expect(Math.max(...lengths)).toBeLessThan(330);
  }, 120000);
});
