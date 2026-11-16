// The look: glowing neon vector figures on deep black space (design/game-brief.md, Look).
// Every figure is drawn from its own outline; no emoji, no plain circles for figures.

import type { Graphics } from 'pixi.js';
import type { Asteroid, Beacon, Hull, Mine, Shot, Team, Weapon } from '../game/types';

export const TEAM = [
  { name: 'Cyan fleet', short: 'Cyan', main: 0x2ef2ff, dim: 0x0f5a66, css: '#2ef2ff' },
  { name: 'Amber fleet', short: 'Amber', main: 0xffb030, dim: 0x6a4612, css: '#ffb030' },
] as const;
export const NEUTRAL = 0x9aa4c4;
export const INK = 0x04081a;
export const HULL_NAME: Record<Hull, string> = { dart: 'Dart', lancer: 'Lancer', bulwark: 'Bulwark' };
export const HULL_ROLE: Record<Hull, string> = { dart: 'light: quick, fragile', lancer: 'medium: all-round', bulwark: 'heavy: slow, tough' };
export const WEAPON_NAME: Record<Weapon, string> = { bolt: 'Bolts', rico: 'Ricochet', scatter: 'Scatter' };
export const WEAPON_ROLE: Record<Weapon, string> = { bolt: 'rapid fire', rico: 'bounces off rock', scatter: 'three-shot spread' };

/** Ship outlines, nose toward +x, in units of the hull radius. Each hull its own silhouette. */
const SHAPES: Record<Hull, [number, number][]> = {
  dart: [[1.5, 0], [-0.4, 0.45], [-1.1, 1.2], [-0.7, 0.25], [-0.9, 0], [-0.7, -0.25], [-1.1, -1.2], [-0.4, -0.45]],
  lancer: [[1.7, 0], [0.6, 0.22], [0.1, 0.95], [-0.5, 1.0], [-0.55, 0.45], [-1.0, 0.45], [-1.0, -0.45], [-0.55, -0.45], [-0.5, -1.0], [0.1, -0.95], [0.6, -0.22]],
  bulwark: [[1.25, 0.35], [0.75, 0.35], [0.9, 0.8], [0.1, 1.05], [-0.85, 0.85], [-1.05, 0.3], [-1.05, -0.3], [-0.85, -0.85], [0.1, -1.05], [0.9, -0.8], [0.75, -0.35], [1.25, -0.35]],
};
const ENGINES: Record<Hull, [number, number][]> = { dart: [[-0.9, 0]], lancer: [[-1.0, 0.25], [-1.0, -0.25]], bulwark: [[-1.05, 0.5], [-1.05, -0.5], [-1.05, 0]] };
const DIAMOND: [number, number][] = [[1, 0], [0, 0.6], [-1, 0], [0, -0.6]];
const HEX: [number, number][] = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as [number, number]);
const STAR8: [number, number][] = Array.from({ length: 8 }, (_, i) => { const k = i % 2 ? 0.45 : 1; return [Math.cos((i * Math.PI) / 4) * k, Math.sin((i * Math.PI) / 4) * k] as [number, number]; });

/** Points of an outline turned by a and scaled by s around (x, y), as a flat array. */
export function pts(shape: readonly [number, number][], x: number, y: number, a: number, s: number): number[] {
  const c = Math.cos(a), sn = Math.sin(a), out: number[] = [];
  for (const [px, py] of shape) out.push(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s);
  return out;
}
/** A neon line: a wide soft pass, then the bright core. `path` draws the shape again for each pass. */
export function glow(g: Graphics, path: () => void, color: number, width: number): void {
  path(); g.stroke({ width: width * 3.2, color, alpha: 0.28, join: 'round', cap: 'round' });
  path(); g.stroke({ width, color, join: 'round', cap: 'round' });
}

export interface ShipLook { thrust?: boolean; burn?: boolean; t?: number; you?: boolean; flash?: boolean; alpha?: number }

export function drawShip(g: Graphics, hull: Hull, team: Team, x: number, y: number, a: number, s: number, o: ShipLook = {}): void {
  const col = TEAM[team].main, t = o.t ?? 0;
  if (o.thrust) {
    for (const [ex, ey] of ENGINES[hull]) {
      const len = (o.burn ? 1.6 : 0.9) * (0.75 + 0.25 * Math.sin(t * 50 + ey * 9));
      const p = pts([[ex, ey + 0.16], [ex - len, ey], [ex, ey - 0.16]], x, y, a, s);
      glow(g, () => g.poly(p, true), o.burn ? 0xffffff : col, 1.4);
    }
  }
  const body = pts(SHAPES[hull], x, y, a, s);
  g.poly(body, true).fill({ color: INK, alpha: 0.85 });
  glow(g, () => g.poly(body, true), o.flash ? 0xffffff : col, 2);
  g.poly(pts([[0.55, 0], [0.05, 0.16], [0.05, -0.16]], x, y, a, s), true).fill(col); // cockpit stripe: the nose reads at a glance
  if (o.you) { // your ship wears a white chevron behind it
    g.poly(pts([[-1.6, 0.5], [-1.35, 0], [-1.6, -0.5]], x, y, a, s), false).stroke({ width: 2, color: 0xffffff });
  }
}

export function drawAsteroid(g: Graphics, r: Asteroid, x: number, y: number, scale: number): void {
  const p: number[] = [];
  for (const [ang, k] of r.shape) p.push(x + Math.cos(ang + r.spin) * r.r * k * scale, y + Math.sin(ang + r.spin) * r.r * k * scale);
  g.poly(p, true).fill(0x0b0e18).stroke({ width: 2, color: 0x5d6684, join: 'round' });
  for (const [cx, cy, cr] of r.cracks) { // surface cracks: short jagged lines
    const L = cr * r.r * scale * 2.2, X0 = x + cx * r.r * scale, Y0 = y + cy * r.r * scale, a0 = r.spin + cx * 5;
    g.moveTo(X0 - Math.cos(a0) * L, Y0 - Math.sin(a0) * L)
      .lineTo(X0 + Math.cos(a0 + 0.9) * L * 0.3, Y0 + Math.sin(a0 + 0.9) * L * 0.3)
      .lineTo(X0 + Math.cos(a0 - 0.2) * L, Y0 + Math.sin(a0 - 0.2) * L)
      .stroke({ width: 1.5, color: 0x3a4260 });
  }
}

/** A dashed ring, drawn as short arcs. */
export function dashedRing(g: Graphics, x: number, y: number, R: number, color: number, alpha: number, width: number): void {
  const n = Math.max(12, Math.round((R * 2 * Math.PI) / 24));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / n) * 0.58;
    g.moveTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R).arc(x, y, R, a0, a1).stroke({ width, color, alpha });
  }
}

export function drawBeacon(g: Graphics, b: Pick<Beacon, 'owner' | 'progress' | 'phase'>, x: number, y: number, R: number, scale: number, t: number): void {
  const col = ownerColor(b.owner);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + b.phase);
  dashedRing(g, x, y, R, col, b.owner < 0 ? 0.35 : 0.45, 3);
  if (b.progress !== 0) { // the ring fills with the colour of whoever is taking it
    const team = b.progress > 0 ? 0 : 1, a0 = -Math.PI / 2;
    g.moveTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R).arc(x, y, R, a0, a0 + Math.PI * 2 * Math.abs(b.progress))
      .stroke({ width: 5, color: TEAM[team].main });
  }
  const hex = pts(HEX, x, y, t * 0.4 + b.phase, 30 * scale);
  g.poly(hex, true).fill({ color: INK, alpha: 0.9 });
  glow(g, () => g.poly(hex, true), col, 2);
  g.poly(pts(DIAMOND, x, y, -t * 1.3, (14 + 5 * pulse) * scale), true).fill(col);
}

export function drawMine(g: Graphics, m: Pick<Mine, 'team'>, live: boolean, x: number, y: number, scale: number, t: number): void {
  const p = pts(STAR8, x, y, t * 1.5, 11 * scale);
  g.poly(p, true).fill({ color: INK, alpha: 0.9 });
  glow(g, () => g.poly(p, true), live && Math.sin(t * 10) > 0 ? 0xffffff : TEAM[m.team].main, 1.6);
}

export function drawShot(g: Graphics, b: Pick<Shot, 'team' | 'kind' | 'vx' | 'vy'>, x: number, y: number, scale: number): void {
  const sp = Math.hypot(b.vx, b.vy) || 1, col = TEAM[b.team].main;
  const len = (b.kind === 'rico' ? 26 : b.kind === 'scatter' ? 12 : 18) * scale;
  glow(g, () => g.moveTo(x, y).lineTo(x - (b.vx / sp) * len, y - (b.vy / sp) * len), b.kind === 'rico' ? 0xffffff : col, b.kind === 'rico' ? 3 : 2.2);
  if (b.kind === 'rico') g.poly(pts([[1, 0], [0, 1], [-1, 0], [0, -1]], x, y, 0, 4 * scale), true).fill(col);
}

/** A small arrow, for off-screen beacons and the minimap. */
export function arrow(g: Graphics, x: number, y: number, a: number, s: number, color: number): void {
  g.poly(pts([[1, 0], [-0.7, 0.7], [-0.3, 0], [-0.7, -0.7]], x, y, a, s), true).fill(color);
}
export function blip(g: Graphics, x: number, y: number, a: number, s: number, color: number): void {
  g.poly(pts([[1, 0], [-0.7, 0.7], [-0.7, -0.7]], x, y, a, s), true).fill(color);
}
export function diamond(g: Graphics, x: number, y: number, s: number, color: number): void {
  g.poly(pts(DIAMOND, x, y, 0, s), true).fill(color);
}

/** The colour of whoever holds something: neutral grey, cyan or amber. */
export function ownerColor(owner: -1 | Team): number { return owner === -1 ? NEUTRAL : TEAM[owner].main; }
export function ownerCss(owner: -1 | Team): string { return owner === -1 ? '#9aa4c4' : TEAM[owner].css; }
