// Vitest: the zone map's 'open' layout (sprite-stack spike, open-world round), run headless.
import { describe, expect, it } from 'vitest';
import { findPath, SAFE, TILE, tileAt, zoneMap } from '../../src/game/map';

const SEED = 4, SIZE = 512;

describe('open zone map', () => {
  it('is the same for the same seed', () => {
    const a = zoneMap(SEED, SIZE, 'open'), b = zoneMap(SEED, SIZE, 'open');
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.regions).toEqual(b.regions);
  });

  it('has a safe hub and named regions of every kind', () => {
    const m = zoneMap(SEED, SIZE, 'open');
    expect(tileAt(m, m.centre, m.centre)).toBe(SAFE);
    const kinds = new Set(m.regions.map(r => r.kind));
    for (const k of ['hub', 'field', 'derelict', 'nebula'] as const) expect(kinds.has(k)).toBe(true);
    expect(m.regions.every(r => r.name.length > 0)).toBe(true);
  });

  it('can be flown from the hub to a far derelict', () => {
    const m = zoneMap(SEED, SIZE, 'open');
    const far = m.regions.filter(r => r.kind === 'derelict')
      .sort((p, q) => Math.hypot(q.x - m.centre, q.y - m.centre) - Math.hypot(p.x - m.centre, p.y - m.centre))[0];
    // aim just outside the derelict's ring, on the side facing the hub
    const d = Math.hypot(m.centre - far.x, m.centre - far.y), k = (far.r + 4) / d;
    const gx = (far.x + (m.centre - far.x) * k) * TILE, gy = (far.y + (m.centre - far.y) * k) * TILE;
    const c = (m.centre + 0.5) * TILE;
    const path = findPath(m, c, c, gx, gy, 200000);
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - gx, end.y - gy)).toBeLessThan(TILE * 8);
  });

  it('leaves the arena layout without regions', () => {
    expect(zoneMap(SEED, 256).regions).toEqual([]);
  });
});
