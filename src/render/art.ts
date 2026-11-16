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
/** Look switches the page sets: `calm` is the Reduce flashing setting (no white flashes or blinking). */
export const look = { calm: false };

/** Team glyphs, the shape backup for cyan and amber (art bible §3, §4): cyan a triangle, amber a diamond. */
export const TEAM_GLYPH: readonly (readonly [number, number][])[] = [
  [[1, 0], [-0.75, 0.85], [-0.75, -0.85]],
  [[1, 0], [0, 0.8], [-1, 0], [0, -0.8]],
];

/**
 * A neon line: the bright core, plus a wide soft halo when `halo` is set. The screen-wide bloom pass
 * lights every line, so only beacons and your own ship ask for their own halo (art bible §8).
 */
export function glow(g: Graphics, path: () => void, color: number, width: number, halo = false): void {
  if (halo) { path(); g.stroke({ width: width * 3.2, color, alpha: 0.28, join: 'round', cap: 'round' }); }
  path(); g.stroke({ width, color, join: 'round', cap: 'round' });
}

/** A closed outline drawn as dashes: what a hull looks like when its energy runs low. */
export function dashedPoly(g: Graphics, p: number[], dash: number, gap: number, color: number, width: number, alpha = 1): void {
  for (let i = 0; i < p.length; i += 2) {
    const x0 = p[i], y0 = p[i + 1], x1 = p[(i + 2) % p.length], y1 = p[(i + 3) % p.length];
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / (len || 1), uy = (y1 - y0) / (len || 1);
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e);
    }
  }
  g.stroke({ width, color, alpha, cap: 'round' });
}

export interface ShipLook { thrust?: boolean; burn?: boolean; t?: number; you?: boolean; flash?: boolean; alpha?: number; low?: boolean }

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
  const edge = o.flash && !look.calm ? 0xffffff : col;
  if (o.low) { // low energy: the hull line breaks into dashes and flickers (a backup for the red HUD bar)
    const on = look.calm || Math.sin(t * 28) > -0.3;
    dashedPoly(g, body, 5, 4, edge, 2, on ? 1 : 0.35);
  } else glow(g, () => g.poly(body, true), edge, 2, o.you);
  g.poly(pts([[0.6, 0], [0.15, 0]], x, y, a, s), false).stroke({ width: 2, color: col, cap: 'round' }); // nose stripe: the heading reads at a glance
  g.poly(pts(TEAM_GLYPH[team], x, y, a, s * 0.3).map((v, i) => v + (i % 2 ? -Math.sin(a) : -Math.cos(a)) * s * 0.35), true).fill(col); // team pip
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

/**
 * A beacon (art bible §3, §4): a segmented ring of 8 arcs round a core glyph, with a flat wash of
 * team colour on the void around it. Neutral: thin grey arcs and a hollow core. Held: the owner's
 * arcs, wash and glyph. Being taken from its owner: the arcs alternate colours and the wash splits.
 */
export function drawBeacon(g: Graphics, b: Pick<Beacon, 'owner' | 'progress' | 'phase'>, x: number, y: number, R: number, scale: number, t: number): void {
  const col = ownerColor(b.owner);
  // a held beacon sits at full progress for its owner; anything less means the other fleet is draining it
  const draining = b.owner !== -1 && Math.abs(b.progress) < 0.999;
  const taker: -1 | Team = draining ? (1 - b.owner) as Team : b.progress > 0 ? 0 : b.progress < 0 ? 1 : -1;
  const contested = taker !== -1 && taker !== b.owner;
  // one slow rhythm nothing else shares: a long pulse, then a long gap
  const pulse = Math.pow(Math.max(0, Math.sin(t * 1.1 + b.phase)), 6);
  // the wash: the only coloured ground light in the game, a flat radial fall-off
  const wash = (color: number, a0: number, a1: number, k: number) => {
    for (let i = 0; i < 9; i++) {
      const r = R * (2.2 - i * 0.2);
      if (a1 - a0 >= Math.PI * 2) g.circle(x, y, r); else g.moveTo(x, y).arc(x, y, r, a0, a1).closePath();
      g.fill({ color, alpha: 0.022 * k });
    }
  };
  if (contested && b.owner !== -1) {
    const seam = Math.PI / 2 + Math.sin(t * 2.3 + b.phase) * 0.35;
    wash(col, seam, seam + Math.PI, 1);
    wash(TEAM[taker as Team].main, seam + Math.PI, seam + Math.PI * 2, Math.abs(b.progress) + 0.3);
  } else if (b.owner !== -1) wash(col, 0, Math.PI * 2, 1 + pulse * 0.6);
  else if (taker !== -1) wash(TEAM[taker].main, 0, Math.PI * 2, Math.abs(b.progress));
  // the ring: 8 arcs turning slowly
  const spin = t * 0.15 + b.phase, seg = (Math.PI * 2) / 8;
  for (let i = 0; i < 8; i++) {
    const a0 = spin + i * seg, a1 = a0 + seg * 0.68;
    const c = contested && i % 2 ? TEAM[taker as Team].main : col;
    g.moveTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R).arc(x, y, R, a0, a1)
      .stroke({ width: b.owner === -1 && !contested ? 2 : 3.5, color: c, alpha: b.owner === -1 && !contested ? 0.45 : 0.85, cap: 'butt' });
  }
  if (b.progress !== 0 && Math.abs(b.progress) < 0.999) { // the capture fill, just outside the ring: who is ahead, and how far
    const a0 = -Math.PI / 2, Rf = R + 9 * scale;
    g.moveTo(x + Math.cos(a0) * Rf, y + Math.sin(a0) * Rf).arc(x, y, Rf, a0, a0 + Math.PI * 2 * Math.abs(b.progress))
      .stroke({ width: 5, color: TEAM[b.progress > 0 ? 0 : 1].main });
  }
  const hex = pts(HEX, x, y, t * 0.4 + b.phase, 30 * scale);
  g.poly(hex, true).fill({ color: INK, alpha: 0.9 });
  glow(g, () => g.poly(hex, true), col, 2, true);
  if (b.owner === -1) { // neutral: a hollow core
    g.poly(pts(DIAMOND, x, y, -t * 0.6, 13 * scale), true).stroke({ width: 2, color: col });
  } else { // held: the owner's glyph, lit on the pulse
    g.poly(pts(TEAM_GLYPH[b.owner], x, y, -Math.PI / 2, (13 + 5 * pulse) * scale), true).fill(col);
  }
}

export function drawMine(g: Graphics, m: Pick<Mine, 'team'>, live: boolean, x: number, y: number, scale: number, t: number): void {
  const p = pts(STAR8, x, y, t * 1.5, 11 * scale);
  g.poly(p, true).fill({ color: INK, alpha: 0.9 });
  glow(g, () => g.poly(p, true), live && !look.calm && Math.sin(t * 10) > 0 ? 0xffffff : TEAM[m.team].main, 1.6);
  if (live && look.calm) g.circle(x, y, 3 * scale).fill(TEAM[m.team].main); // armed, shown without blinking
}

/** The hot core of a team colour: a pale tint for muzzle flashes and impacts, a few frames only (art bible §4). */
export function hotTint(color: number): number {
  const mix = (c: number) => Math.round(c + (255 - c) * 0.65);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

/** A shot: a streak in team colour, with a hot pale core while `hot` (its first few frames). */
export function drawShot(g: Graphics, b: Pick<Shot, 'team' | 'kind' | 'vx' | 'vy'>, x: number, y: number, scale: number, hot = false): void {
  const sp = Math.hypot(b.vx, b.vy) || 1, col = TEAM[b.team].main;
  const len = (b.kind === 'rico' ? 26 : b.kind === 'scatter' ? 12 : 18) * scale;
  const ux = b.vx / sp, uy = b.vy / sp;
  glow(g, () => g.moveTo(x, y).lineTo(x - ux * len, y - uy * len), b.kind === 'rico' ? 0xffffff : col, b.kind === 'rico' ? 3 : 2.2);
  if (hot) {
    g.moveTo(x, y).lineTo(x - ux * len * 0.6, y - uy * len * 0.6).stroke({ width: 4, color: hotTint(col), cap: 'round' });
    if (!look.calm) g.circle(x, y, 4 * scale).fill({ color: hotTint(col), alpha: 0.8 });
  }
  if (b.kind === 'rico') g.poly(pts([[1, 0], [0, 1], [-1, 0], [0, -1]], x, y, 0, 4 * scale), true).fill(col);
}

/** A short drift trail along a ship's velocity, fading toward the tail: motion told by light (art bible §5). */
export function drawTrail(g: Graphics, team: Team, x: number, y: number, vx: number, vy: number, scale: number): void {
  const sp = Math.hypot(vx, vy);
  if (sp < 40) return;
  const len = Math.min(140, sp * 0.16) * scale, ux = vx / sp, uy = vy / sp, n = 5;
  for (let i = 0; i < n; i++) {
    const a = len * (i / n), b2 = len * ((i + 1) / n);
    g.moveTo(x - ux * a, y - uy * a).lineTo(x - ux * b2, y - uy * b2)
      .stroke({ width: 3.5 - i * 0.5, color: TEAM[team].main, alpha: 0.55 * (1 - i / n) });
  }
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
