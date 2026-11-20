// PROTOTYPE - NOT FOR PRODUCTION
// The zone's walls as geometry. The real map's wall tiles (collision is unchanged) are drawn as
// rocky asteroid ridges, not steel boxes: each tile's height grows with how far it is from open
// space, plus a little jitter, so a wall becomes a stepped mound with low edges and a high spine.
// The two-tile border around the map is not drawn at all: the renderer shows it as a soft energy
// field (resolve), so the zone fades into space instead of ending at a box.
// Runs of tiles with the same heights are merged (greedy along rows and columns) and binned by
// chunk, so a frame only walks the chunks the camera can see.
//
// Render space is right-handed with z up: X = sim x, Y = -sim y. Every face is wound
// counter-clockwise seen from outside, which the rasteriser uses to skip back faces.

import { SAFE, TILE, WALL, tileAt, type ZoneMap } from '../../../src/game/map';
import { hash2 } from './noise';

/** Highest rock top and lowest rock underside in world px (bounds for culling), and the deck. */
export const WALL_TOP = 40, WALL_BOTTOM = -40, DECK_Z = -2;
/** Tiles of map border that are shown as the zone's edge field, not as rock. */
export const BORDER = 2;
/** Tiles per chunk side. */
export const CHUNK = 32;

/** Face kinds, which the renderer turns into surface patterns. */
export const TOP = 0, SIDE_N = 1, SIDE_S = 2, SIDE_E = 3, SIDE_W = 4, DECK = 5;

/** The quads of one chunk: 12 floats (4 corners) per quad, and each quad's kind. */
export interface Chunk { cx: number; cy: number; verts: Float32Array; kinds: Uint8Array; n: number }

/** Per-tile edge bits for the surface patterns: open to the north, south, west, east; deep inside. */
export const OPEN_N = 1, OPEN_S = 2, OPEN_W = 4, OPEN_E = 8, DEEP = 16;

export interface WallMesh { chunks: Chunk[]; per: number; info: Uint8Array; n: number }

/** Builds the mesh and the per-tile edge info for a map. */
export function buildWalls(m: ZoneMap): WallMesh {
  const n = m.n, per = Math.ceil(n / CHUNK);
  const lists: { v: number[]; k: number[] }[] = Array.from({ length: per * per }, () => ({ v: [], k: [] }));
  const border = (x: number, y: number): boolean => x < BORDER || y < BORDER || x >= n - BORDER || y >= n - BORDER;
  const isWall = (x: number, y: number): boolean => tileAt(m, x, y) === WALL;
  const isRock = (x: number, y: number): boolean => isWall(x, y) && !border(x, y);

  // distance (in tiles, Chebyshev, capped at 4) from each rock tile to open space
  const dist = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) dist[i] = isWall(i % n, (i / n) | 0) ? 4 : 0;
  for (let pass = 1; pass < 4; pass++) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (dist[y * n + x] <= pass) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < n && yy < n && dist[yy * n + xx] === pass - 1) { near = true; break; }
      }
      if (near) dist[y * n + x] = pass;
    }
  }
  const top = new Int8Array(n * n), bot = new Int8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (!isRock(x, y)) continue;
    const d = dist[i], j = hash2(x, y, 21) - 0.5;
    top[i] = Math.min(WALL_TOP, Math.max(8, Math.round((8 + d * 7 + j * 7) / 2) * 2));
    bot[i] = -Math.min(-WALL_BOTTOM, 10 + d * 7);
  }
  const topAt = (x: number, y: number): number => (isRock(x, y) ? top[y * n + x] : -999);

  const add = (tx: number, ty: number, kind: number, q: number[]): void => {
    const c = lists[Math.floor(ty / CHUNK) * per + Math.floor(tx / CHUNK)];
    c.v.push(...q); c.k.push(kind);
  };
  /** Runs of equal keys along a line (null = nothing); breaks at chunk edges. */
  const runs = (len: number, key: (i: number) => string | null, emit: (a: number, z: number, k: string) => void): void => {
    let a = -1, ka = '';
    for (let i = 0; i <= len; i++) {
      const k = i < len ? key(i) : null;
      const same = k !== null && a >= 0 && k === ka && i % CHUNK !== 0;
      if (same) continue;
      if (a >= 0) emit(a, i, ka);
      if (k !== null) { a = i; ka = k; } else a = -1;
    }
  };
  /** The side between a rock tile and its neighbour: from the lower of (neighbour top, own underside) up to the top. */
  const side = (x: number, y: number, nx: number, ny: number): string | null => {
    if (!isRock(x, y)) return null;
    const t = top[y * n + x], nt = topAt(nx, ny), b = nt > -999 ? Math.max(nt, bot[y * n + x]) : bot[y * n + x];
    return b < t ? `${b},${t}` : null;
  };
  const T = TILE;
  for (let ty = 0; ty < n; ty++) {
    const y1 = -ty * T, y0 = -(ty + 1) * T;
    runs(n, tx => (isRock(tx, ty) ? `${top[ty * n + tx]}` : null), (a, z, k) => {
      const t = +k; add(a, ty, TOP, [a * T, y0, t, z * T, y0, t, z * T, y1, t, a * T, y1, t]);
    });
    runs(n, tx => (tileAt(m, tx, ty) === SAFE ? 'd' : null), (a, z) => add(a, ty, DECK, [a * T, y0, DECK_Z, z * T, y0, DECK_Z, z * T, y1, DECK_Z, a * T, y1, DECK_Z]));
    runs(n, tx => side(tx, ty, tx, ty - 1), (a, z, k) => {
      const [b, t] = k.split(',').map(Number); add(a, ty, SIDE_N, [z * T, y1, b, a * T, y1, b, a * T, y1, t, z * T, y1, t]);
    });
    runs(n, tx => side(tx, ty, tx, ty + 1), (a, z, k) => {
      const [b, t] = k.split(',').map(Number); add(a, ty, SIDE_S, [a * T, y0, b, z * T, y0, b, z * T, y0, t, a * T, y0, t]);
    });
  }
  for (let tx = 0; tx < n; tx++) {
    const x0 = tx * T, x1 = (tx + 1) * T;
    runs(n, ty => side(tx, ty, tx + 1, ty), (a, z, k) => {
      const [b, t] = k.split(',').map(Number), y1 = -a * T, y0 = -z * T;
      add(tx, a, SIDE_E, [x1, y0, b, x1, y1, b, x1, y1, t, x1, y0, t]);
    });
    runs(n, ty => side(tx, ty, tx - 1, ty), (a, z, k) => {
      const [b, t] = k.split(',').map(Number), y1 = -a * T, y0 = -z * T;
      add(tx, a, SIDE_W, [x0, y1, b, x0, y0, b, x0, y0, t, x0, y1, t]);
    });
  }
  const chunks: Chunk[] = lists.map((l, i) => ({
    cx: i % per, cy: Math.floor(i / per), verts: Float32Array.from(l.v), kinds: Uint8Array.from(l.k), n: l.k.length,
  }));
  // edge info for the surface patterns: a rim where the next tile is lower or open
  const info = new Uint8Array(n * n);
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    if (!isRock(tx, ty)) continue;
    const t = top[ty * n + tx];
    let v = 0;
    if (topAt(tx, ty - 1) < t - 6) v |= OPEN_N;
    if (topAt(tx, ty + 1) < t - 6) v |= OPEN_S;
    if (topAt(tx - 1, ty) < t - 6) v |= OPEN_W;
    if (topAt(tx + 1, ty) < t - 6) v |= OPEN_E;
    if (dist[ty * n + tx] >= 3) v |= DEEP;
    info[ty * n + tx] = v;
  }
  return { chunks, per, info, n };
}
