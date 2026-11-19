// PROTOTYPE - NOT FOR PRODUCTION
// Sprite stacks: every object is a stack of 2D pixel-art slices (a voxel grid, one slice per
// layer). The models are drawn here in code, for this game: three hulls, salvage pods, mines,
// the station and drifting rocks. `compile` turns a stack into the list of surface voxels the
// renderer splats, with a normal and baked ambient occlusion for each, plus a half-size LOD.

import { hash3, noise3 } from './noise';

/** Flag bits in a stack cell: set = filled; EMIT = glows (skips lighting). */
const FILLED = 0x01000000, EMIT = 0x02000000;

/** A voxel grid being drawn: x is the model's nose (+x forward), y its left side, z up. */
export class Stack {
  readonly cells: Uint32Array;
  constructor(readonly w: number, readonly d: number, readonly h: number) { this.cells = new Uint32Array(w * d * h); }
  /** Sets one cell to a colour (0xRRGGBB); `emit` makes it glow. Out-of-range is ignored. */
  set(x: number, y: number, z: number, col: number, emit = false): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.cells[(z * this.d + y) * this.w + x] = (col & 0xffffff) | FILLED | (emit ? EMIT : 0);
  }
  clear(x: number, y: number, z: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.cells[(z * this.d + y) * this.w + x] = 0;
  }
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return 0;
    return this.cells[(z * this.d + y) * this.w + x];
  }
  filled(x: number, y: number, z: number): boolean { return (this.get(x, y, z) & FILLED) !== 0; }
  /** One horizontal slice (layer z) as 0xRRGGBB, 0 = empty: what a classic sprite stack stores. */
  slice(z: number): Uint32Array {
    const out = new Uint32Array(this.w * this.d);
    for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
      const c = this.get(x, y, z);
      out[y * this.w + x] = c & FILLED ? (c & 0xffffff) | 0xff000000 : 0;
    }
    return out;
  }
}

/** The surface voxels of a stack, ready to splat: positions relative to the model's origin. */
export interface Lod {
  n: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  nx: Float32Array; ny: Float32Array; nz: Float32Array;
  /** Colour with ambient occlusion baked in, 0xRRGGBB. */
  col: Uint32Array;
  emit: Uint8Array;
  /** Voxel edge length in model units (1 for full detail, 2 for the half-size LOD). */
  unit: number;
}

/** A compiled model: the stack (for the slice viewer) and its LODs. */
export interface Model {
  name: string; stack: Stack; lods: Lod[];
  /** Bounding radius in voxels around the origin, for culling. */
  radius: number;
}

const scale = (c: number, k: number): number => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
};

function surface(s: Stack, unit: number, ox: number, oy: number, oz: number): Lod {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [], nxs: number[] = [], nys: number[] = [], nzs: number[] = [];
  const cols: number[] = [], ems: number[] = [];
  for (let z = 0; z < s.h; z++) for (let y = 0; y < s.d; y++) for (let x = 0; x < s.w; x++) {
    const c = s.get(x, y, z);
    if (!(c & FILLED)) continue;
    // a surface voxel has at least one empty face neighbour
    if (s.filled(x + 1, y, z) && s.filled(x - 1, y, z) && s.filled(x, y + 1, z) && s.filled(x, y - 1, z)
      && s.filled(x, y, z + 1) && s.filled(x, y, z - 1)) continue;
    // normal: points away from the filled neighbours; occlusion: how open the upper half is
    let nx = 0, ny = 0, nz = 0, open = 0, total = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const f = s.filled(x + dx, y + dy, z + dz);
      if (f) { nx -= dx; ny -= dy; nz -= dz; }
      if (dz >= 0) { total++; if (!f) open++; }
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 0.01) { nz = 1; } else { nx /= l; ny /= l; nz /= l; }
    const ao = 0.55 + 0.45 * (open / total);
    const lift = 0.86 + 0.14 * (z / Math.max(1, s.h - 1)); // stylised: lower layers a touch darker
    xs.push((x + 0.5) * unit - ox); ys.push((y + 0.5) * unit - oy); zs.push((z + 0.5) * unit - oz);
    nxs.push(nx); nys.push(ny); nzs.push(nz);
    const emit = (c & EMIT) !== 0;
    cols.push(emit ? c & 0xffffff : scale(c & 0xffffff, ao * lift * 1.12));
    ems.push(emit ? 1 : 0);
  }
  return {
    n: xs.length, unit,
    x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs),
    nx: Float32Array.from(nxs), ny: Float32Array.from(nys), nz: Float32Array.from(nzs),
    col: Uint32Array.from(cols), emit: Uint8Array.from(ems),
  };
}

/** Halves a stack: a cell is filled when two or more of its eight children are (top colour wins). */
function half(s: Stack): Stack {
  const o = new Stack(Math.ceil(s.w / 2), Math.ceil(s.d / 2), Math.ceil(s.h / 2));
  for (let z = 0; z < o.h; z++) for (let y = 0; y < o.d; y++) for (let x = 0; x < o.w; x++) {
    let n = 0, pick = 0;
    for (let dz = 1; dz >= 0; dz--) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = s.get(x * 2 + dx, y * 2 + dy, z * 2 + dz);
      if (c & FILLED) { n++; if (!pick || (c & EMIT)) pick = c; }
    }
    if (n >= 2) o.cells[(z * o.d + y) * o.w + x] = pick;
  }
  return o;
}

/**
 * Doubles a stack's detail with smoothing: each fine cell takes the trilinear blend of the
 * coarse cells around it and is filled above one half, so stair-step diagonals and corners come
 * out rounder. Colour comes from the nearest filled coarse cell.
 */
export function upsample(s: Stack): Stack {
  const o = new Stack(s.w * 2, s.d * 2, s.h * 2);
  for (let z = 0; z < o.h; z++) for (let y = 0; y < o.d; y++) for (let x = 0; x < o.w; x++) {
    const cx = (x + 0.5) / 2 - 0.5, cy = (y + 0.5) / 2 - 0.5, cz = (z + 0.5) / 2 - 0.5;
    const x0 = Math.floor(cx), y0 = Math.floor(cy), z0 = Math.floor(cz), fx = cx - x0, fy = cy - y0, fz = cz - z0;
    let occ = 0, best = 0, bw = -1;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
      const wgt = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      const c = s.get(x0 + dx, y0 + dy, z0 + dz);
      if (c & FILLED) { occ += wgt; if (wgt > bw) { bw = wgt; best = c; } }
    }
    if (occ > 0.5) o.cells[(z * o.d + y) * o.w + x] = best;
  }
  return o;
}

/** Compiles a stack around an origin (in voxels; default: the centre of its footprint, z = 0). */
export function compile(name: string, s: Stack, oz = 0): Model {
  const ox = s.w / 2, oy = s.d / 2;
  const lods = [surface(s, 1, ox, oy, oz), surface(half(s), 2, ox, oy, oz)];
  return { name, stack: s, lods, radius: Math.hypot(s.w / 2, s.d / 2, Math.max(oz, s.h - oz)) };
}

// ---- The models ------------------------------------------------------------------------------

/** Paint for one side: your ship (blue) or theirs (orange). */
export interface Paint { dark: number; main: number; light: number; glow: number }
export const BLUE: Paint = { dark: 0x14467a, main: 0x2f9ce0, light: 0x62c6ff, glow: 0xa8e6ff };
export const ORANGE: Paint = { dark: 0x6e2a0e, main: 0xe06c22, light: 0xff9a3c, glow: 0xffc47a };
const WHITE = 0xbcc2d0, WHITE2 = 0x9aa0b0, GREY = 0x6a6a7a, INK = 0x30303e, GLASS = 0x1d6eb0, GLASS_HI = 0xa8e6ff;

/** Dart: a slim arrowhead with forward canards and one engine. */
function dart(p: Paint): Stack {
  const s = new Stack(16, 13, 6), cy = 6;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 13; y++) {
    const dy = Math.abs(y - cy);
    const spine = x < 13 ? 1.6 : (15.5 - x) * 0.65;
    const wing = x >= 2 && x <= 9 ? 6.2 - (x - 2) * 0.78 : 0;
    const canard = x >= 10 && x <= 12 ? 3.6 - (x - 10) : 0;
    for (let z = 0; z < 6; z++) {
      if (dy <= spine && z >= 1 && z <= (x > 3 && x < 12 ? 4 : 3)) s.set(x, y, z, z === 1 ? WHITE2 : WHITE);
      else if (dy <= wing && z >= 1 && z <= 2) s.set(x, y, z, dy >= wing - 1.6 ? p.main : z === 1 ? WHITE2 : WHITE);
      else if (dy <= canard && z === 2) s.set(x, y, z, p.light);
    }
  }
  for (let x = 4; x <= 8; x++) s.set(x, cy, 4, p.main); // spine stripe
  for (let x = 9; x <= 11; x++) for (let y = cy - 1; y <= cy + 1; y++) s.set(x, y, 4, y === cy && x === 11 ? GLASS_HI : GLASS);
  s.set(10, cy, 5, GLASS_HI);
  for (let y = cy - 1; y <= cy + 1; y++) for (let z = 2; z <= 3; z++) s.set(0, y, z, y === cy ? p.glow : p.light, true);
  for (let y = cy - 1; y <= cy + 1; y++) s.set(1, y, 1, INK);
  return s;
}

/** Lancer: a long lance nose, swept wings, wingtip pods and twin engines. */
function lancer(p: Paint): Stack {
  const s = new Stack(20, 17, 6), cy = 8;
  for (let x = 0; x < 20; x++) for (let y = 0; y < 17; y++) {
    const dy = Math.abs(y - cy);
    const body = x >= 1 && x <= 13 ? 2.2 : x > 13 ? 1 : 0;
    const wing = x >= 1 && x <= 10 ? 1 + (10 - x) * 0.72 : 0;
    for (let z = 0; z < 6; z++) {
      if (x > 13 && dy <= 0.5 && z >= 2 && z <= 3) s.set(x, y, z, x >= 18 ? p.light : WHITE);
      else if (dy <= body && z >= 1 && z <= 4) s.set(x, y, z, z === 1 ? WHITE2 : WHITE);
      else if (dy <= wing && z === 2) s.set(x, y, z, (x + dy) % 4 === 0 ? WHITE2 : WHITE);
    }
    // wingtip pods
    if (dy >= 6.5 && dy <= 7.5 && x >= 1 && x <= 8) for (let z = 1; z <= 3; z++) s.set(x, y, z, x >= 7 ? p.light : p.main);
  }
  for (let x = 3; x <= 11; x += 2) { s.set(x, cy - 2, 4, p.main); s.set(x, cy + 2, 4, p.main); }
  for (let x = 10; x <= 12; x++) for (let y = cy - 1; y <= cy + 1; y++) s.set(x, y, 5, x === 12 ? GLASS_HI : GLASS);
  for (const ey of [cy - 2, cy + 2]) for (let z = 2; z <= 3; z++) { s.set(0, ey, z, p.glow, true); s.set(0, ey + (ey < cy ? -1 : 1), z, p.light, true); }
  return s;
}

/** Bulwark: a broad armoured block with shoulder plates and three engines. */
function bulwark(p: Paint): Stack {
  const s = new Stack(18, 19, 7), cy = 9;
  for (let x = 0; x < 18; x++) for (let y = 0; y < 19; y++) {
    const dy = Math.abs(y - cy);
    const body = x >= 2 && x <= 14 ? 5.4 : x > 14 ? 5 - (x - 14) * 1.4 : 0;
    for (let z = 0; z < 7; z++) {
      if (dy <= body && z >= 1 && z <= (x > 14 ? 4 : 5)) s.set(x, y, z, z === 1 ? GREY : dy > body - 1 ? WHITE2 : WHITE);
      if (dy >= 6 && dy <= 8.5 && x >= 4 && x <= 12 && z >= 2 && z <= 4) s.set(x, y, z, x === 4 || x === 12 ? p.dark : p.main);
    }
  }
  for (const sx of [5, 6, 10, 11]) for (let y = cy - 4; y <= cy + 4; y++) s.set(sx, y, 5, p.main);
  for (let x = 11; x <= 13; x++) for (let y = cy - 1; y <= cy + 1; y++) s.set(x, y, 6, x === 13 ? GLASS_HI : GLASS);
  for (const ey of [cy - 4, cy, cy + 4]) for (let z = 2; z <= 4; z++) {
    s.set(1, ey, z, p.glow, true); s.set(1, ey - 1, z, p.light, true); s.set(1, ey + 1, z, p.light, true);
    s.set(0, ey, z, p.light, true);
  }
  return s;
}

/** A salvage pod: a white-gold crate with a violet glowing core showing through its windows. */
function pod(): Stack {
  const s = new Stack(7, 7, 7);
  for (let z = 0; z < 7; z++) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const edge = (x === 0 || x === 6 ? 1 : 0) + (y === 0 || y === 6 ? 1 : 0) + (z === 0 || z === 6 ? 1 : 0);
    if (edge === 0) { s.set(x, y, z, 0xc690ff, true); continue; }
    const window = edge === 1 && (x === 3 || y === 3 || z === 3) && (x > 1 && x < 5 || y > 1 && y < 5) && (z > 1 && z < 5 || edge === 1 && (z === 0 || z === 6));
    if (window && edge === 1) s.set(x, y, z, 0xe8c8ff, true);
    else s.set(x, y, z, edge >= 2 ? 0xffd060 : 0xd8a020);
  }
  return s;
}

/** A mine: a dark disc with four red spikes and a red eye. */
function mine(): Stack {
  const s = new Stack(9, 9, 4);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const r = Math.hypot(x - 4, y - 4);
    if (r <= 2.6) for (let z = 1; z <= 2; z++) s.set(x, y, z, r < 1.2 && z === 2 ? 0xff6a5a : INK, r < 1.2 && z === 2);
    if ((x === 4 || y === 4) && r > 2.6 && r <= 4.2) s.set(x, y, 1, 0xd42c2c);
  }
  s.set(4, 4, 3, 0xff6a5a, true);
  return s;
}

/** The station turning over the safe zone: a hex core, a lit ring, four arms and panel wings. */
function station(): Stack {
  const R = 30, s = new Stack(R * 2 + 1, R * 2 + 1, 16), c = R;
  const hex = (dx: number, dy: number): number => Math.max(Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5, Math.abs(dy));
  for (let y = 0; y <= R * 2; y++) for (let x = 0; x <= R * 2; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), hx = hex(dx, dy), a = Math.atan2(dy, dx);
    // core: stepped hex tower
    if (hx <= 9) for (let z = 1; z <= (hx <= 5 ? 13 : 10); z++) {
      const band = z === 10 || z === 13 ? 0x7f9fcc : z % 3 === 0 ? 0x48639c : 0x5f7fb6;
      s.set(x, y, z, hx > 8 && z % 3 === 1 && Math.round(a * 6) % 2 === 0 ? 0x62c6ff : band, hx > 8 && z % 3 === 1 && Math.round(a * 6) % 2 === 0);
    }
    // ring
    if (r >= 17 && r <= 20) for (let z = 5; z <= 8; z++) {
      const lit = z === 7 && r > 19.4 && Math.floor((a + Math.PI) * 8) % 3 === 0;
      s.set(x, y, z, lit ? 0xffd060 : z === 8 ? 0xa6c0e0 : 0x48639c, lit);
    }
    // arms: four spokes core -> ring, then panel wings past the ring on the diagonals
    const along = Math.abs(dx) < 2 || Math.abs(dy) < 2;
    if (along && r > 8 && r < 18) for (let z = 6; z <= 7; z++) s.set(x, y, z, 0x7f9fcc);
    const diag = Math.abs(Math.abs(dx) - Math.abs(dy)) < 5 && r > 21 && r <= R;
    if (diag) s.set(x, y, 6, (x + y) % 4 === 0 ? 0x2a3b68 : 0x1f2c52);
    if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 1 && r > 19 && r <= R) s.set(x, y, 7, 0x7f9fcc);
  }
  for (let z = 14; z <= 15; z++) s.set(c, c, z, z === 15 ? 0xff6a5a : 0xa6c0e0, z === 15);
  return s;
}

/** A drifting rock: a lumpy ball of dark stone with craters and the odd violet crystal. */
function rock(r: number, seed: number): Stack {
  const n = Math.ceil(r * 2) + 2, c = n / 2, s = new Stack(n, n, n);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = (z + 0.5 - c) * 1.15, d = Math.hypot(dx, dy, dz);
    const bump = (noise3(x * 0.35, y * 0.35, z * 0.35, seed) - 0.5) * r * 0.55;
    if (d > r + bump) continue;
    const crater = noise3(x * 0.6 + 9, y * 0.6, z * 0.6, seed + 3) > 0.72;
    // broad patches, not per-voxel speckle (speckle shimmers as the rock turns)
    const h = noise3(x * 0.25 + 4, y * 0.25, z * 0.25, seed + 7);
    const col = crater ? 0x3a3a48 : h < 0.45 ? 0x4a4a5a : 0x58586a;
    s.set(x, y, z, col);
  }
  // a few crystals on the surface
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash3(i, 1, 2, seed) * n), y = Math.floor(hash3(i, 3, 4, seed) * n);
    for (let z = n - 1; z >= 0; z--) if (s.filled(x, y, z)) { s.set(x, y, z, 0x9a5ad8, true); s.set(x, y, z + 1, 0xc690ff, true); break; }
  }
  return s;
}

/** Engine nozzles of each hull in coarse voxels from the model origin: [back x, side y] pairs. */
export const ENGINES: Record<string, [number, number][]> = {
  dart: [[-8, 0]],
  lancer: [[-10, -2.5], [-10, 2.5]],
  bulwark: [[-9, -4], [-9, 0], [-9, 4]],
};

/** All models the prototype draws, by name. Ships come in both paints: `dart:0` is yours. */
export function buildModels(): Map<string, Model> {
  const m = new Map<string, Model>();
  const paints = [BLUE, ORANGE];
  // ships at double detail (drawn at half a world voxel each, in the renderer's detail layer)
  paints.forEach((p, i) => {
    // (the slice viewer keeps showing the hand-drawn coarse stack)
    const fine = (name: string, st: Stack, oz: number): Model => ({ ...compile(name, upsample(st), oz * 2), stack: st });
    m.set(`dart:${i}`, fine('Dart', dart(p), 3));
    m.set(`lancer:${i}`, fine('Lancer', lancer(p), 3));
    m.set(`bulwark:${i}`, fine('Bulwark', bulwark(p), 3.5));
  });
  m.set('pod', compile('Salvage pod', pod(), 3.5));
  m.set('mine', compile('Mine', mine(), 2));
  m.set('station', compile('Station', station(), 8));
  for (let i = 0; i < 5; i++) {
    const s = rock(5 + i * 2.5, 17 + i * 11);
    m.set(`rock${i}`, compile('Rock', s, s.h / 2));
  }
  return m;
}
