// Vitest: the online wire format round-trips a zone.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { applySnapshot, packInput, snapshot, unpackInput } from '../../src/net/protocol';
import { step, STEP } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { NO_INPUT } from '../../src/game/types';
import { newWorld } from '../../src/game/world';

const tune = tuningFrom(config);

describe('the wire format', () => {
  it('packs and unpacks inputs', () => {
    const i = { ...NO_INPUT, thrust: true, bomb: true, mine: true };
    expect(unpackInput(packInput(i), 2)).toEqual({ ...i, hull: 'bulwark' });
  });
  it('a snapshot written into a fresh copy reproduces the zone', () => {
    const w = newWorld(tune, { seed: 4, humans: [] });
    for (let i = 0; i < 600; i++) step(w, new Map(), tune, STEP);
    const copy = newWorld(tune, { seed: 99, mapSeed: 4, humans: [] });
    applySnapshot(copy, JSON.parse(JSON.stringify(snapshot(w, 600, 0, []))));
    for (const [i, s] of w.ships.entries()) {
      const c = copy.ships[i];
      expect([c.name, c.hull, c.alive, c.kills]).toEqual([s.name, s.hull, s.alive, s.kills]);
      expect(c.x).toBeCloseTo(s.x, 0); expect(c.energy).toBeCloseTo(s.energy, 0);
    }
    expect(copy.shots.length).toBe(w.shots.length);
    expect(copy.salvage.map(v => v.id)).toEqual(w.salvage.map(v => v.id));
    expect(copy.mines.length).toBe(w.mines.length);
    expect(copy.ships.map(s => [s.bounty, s.points, ...s.up])).toEqual(w.ships.map(s => [s.bounty, s.points, ...s.up]));
  });
});
