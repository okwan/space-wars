// The look of the zone (design/game-brief.md, Look; design/art/art-bible.md): small ships on
// black space, steel tile walls, bright pinpoint fire. Names, colours and small vector marks
// shared by the screen; the walls and the radar picture are drawn in render/tiles.ts.

import type { Graphics } from 'pixi.js';
import type { Hull } from '../game/types';

/** Paint colours: 0 is your ship (blue), 1 every other ship (orange). */
export const PAINT = [
  { main: 0x46c8ff, css: '#46c8ff' },
  { main: 0xff9a3c, css: '#ff9a3c' },
] as const;
export const GOLD = 0xffd060, GOLD_CSS = '#ffd060';
export const SAFE_CSS = '#6dffb4', SAFE_COL = 0x6dffb4;
export const DIM_CSS = '#8a94b4', TEXT_CSS = '#d8deef';
export const HULL_NAME: Record<Hull, string> = { dart: 'Dart', lancer: 'Lancer', bulwark: 'Bulwark' };
export const HULL_ROLE: Record<Hull, string> = {
  dart: 'light: fastest, one gun',
  lancer: 'medium: twin guns, bombs bounce once',
  bulwark: 'heavy: tough, level 2 bombs',
};
/** Bullet colour by gun level 1..3, bomb colour by bomb level 1..3 (index 0 unused). */
export const BULLET_COL = [0, 0x9fe4ff, 0xffe27a, 0xff86e0];
export const BOMB_COL = [0, 0xff8a3a, 0xff4fb0, 0xb07dff];

/** Look switches the page sets: `calm` is the Reduce flashing setting (no white flashes or blinking). */
export const look = { calm: false };

/** Points of an outline turned by a and scaled by s around (x, y), as a flat array. */
export function pts(shape: readonly [number, number][], x: number, y: number, a: number, s: number): number[] {
  const c = Math.cos(a), sn = Math.sin(a), out: number[] = [];
  for (const [px, py] of shape) out.push(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s);
  return out;
}

/** A closed outline drawn as dashes. */
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

/** A small arrow, for menus. */
export function arrow(g: Graphics, x: number, y: number, a: number, s: number, color: number): void {
  g.poly(pts([[1, 0], [-0.7, 0.7], [-0.3, 0], [-0.7, -0.7]], x, y, a, s), true).fill(color);
}
/** A heading blip, for the radar. */
export function blip(g: Graphics, x: number, y: number, a: number, s: number, color: number): void {
  g.poly(pts([[1, 0], [-0.7, 0.7], [-0.7, -0.7]], x, y, a, s), true).fill(color);
}
