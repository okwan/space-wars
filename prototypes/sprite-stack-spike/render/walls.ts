// PROTOTYPE - NOT FOR PRODUCTION
// The zone's walls as geometry: the real map's wall tiles become raised steel blocks floating
// over the void, and the safe zone a deck plate. Runs of tiles are merged (greedy along rows and
// columns) and binned by chunk, so a frame only walks the chunks the camera can see.
//
// Render space is right-handed with z up: X = sim x, Y = -sim y. Every face is wound
// counter-clockwise seen from outside, which the rasteriser uses to skip back faces.

import { SAFE, TILE, WALL, tileAt, type ZoneMap } from '../../../src/game/map';

/** Heights in world px: wall tops, wall bottoms (deep, so they read as slabs) and the safe deck. */
export const WALL_TOP = 26, WALL_BOTTOM = -34, DECK_Z = -2;
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
  const isWall = (x: number, y: number): boolean => tileAt(m, x, y) === WALL;
  const add = (tx: number, ty: number, kind: number, q: number[]): void => {
    const c = lists[Math.floor(ty / CHUNK) * per + Math.floor(tx / CHUNK)];
    c.v.push(...q); c.k.push(kind);
  };
  const T = TILE, t = WALL_TOP, b = WALL_BOTTOM;
  // rows: tops, deck, north and south faces
  for (let ty = 0; ty < n; ty++) {
    const y1 = -ty * T, y0 = -(ty + 1) * T;
    const runs = (test: (tx: number) => boolean, emit: (a: number, z: number) => void): void => {
      let a = -1;
      for (let tx = 0; tx <= n; tx++) {
        const on = tx < n && test(tx) && !(a >= 0 && tx % CHUNK === 0);
        if (on && a < 0) a = tx;
        if (!on && a >= 0) { emit(a, tx); a = tx < n && test(tx) ? tx : -1; }
      }
    };
    runs(tx => isWall(tx, ty), (a, z) => add(a, ty, TOP, [a * T, y0, t, z * T, y0, t, z * T, y1, t, a * T, y1, t]));
    runs(tx => tileAt(m, tx, ty) === SAFE, (a, z) => add(a, ty, DECK, [a * T, y0, DECK_Z, z * T, y0, DECK_Z, z * T, y1, DECK_Z, a * T, y1, DECK_Z]));
    runs(tx => isWall(tx, ty) && !isWall(tx, ty - 1), (a, z) => add(a, ty, SIDE_N, [z * T, y1, b, a * T, y1, b, a * T, y1, t, z * T, y1, t]));
    runs(tx => isWall(tx, ty) && !isWall(tx, ty + 1), (a, z) => add(a, ty, SIDE_S, [a * T, y0, b, z * T, y0, b, z * T, y0, t, a * T, y0, t]));
  }
  // columns: east and west faces
  for (let tx = 0; tx < n; tx++) {
    const x0 = tx * T, x1 = (tx + 1) * T;
    const runs = (test: (ty: number) => boolean, emit: (a: number, z: number) => void): void => {
      let a = -1;
      for (let ty = 0; ty <= n; ty++) {
        const on = ty < n && test(ty) && !(a >= 0 && ty % CHUNK === 0);
        if (on && a < 0) a = ty;
        if (!on && a >= 0) { emit(a, ty); a = ty < n && test(ty) ? ty : -1; }
      }
    };
    runs(ty => isWall(tx, ty) && !isWall(tx + 1, ty), (a, z) => {
      const y1 = -a * T, y0 = -z * T;
      add(tx, a, SIDE_E, [x1, y0, b, x1, y1, b, x1, y1, t, x1, y0, t]);
    });
    runs(ty => isWall(tx, ty) && !isWall(tx - 1, ty), (a, z) => {
      const y1 = -a * T, y0 = -z * T;
      add(tx, a, SIDE_W, [x0, y1, b, x0, y0, b, x0, y0, t, x0, y1, t]);
    });
  }
  const chunks: Chunk[] = lists.map((l, i) => ({
    cx: i % per, cy: Math.floor(i / per), verts: Float32Array.from(l.v), kinds: Uint8Array.from(l.k), n: l.k.length,
  }));
  // edge info for the patterns
  const info = new Uint8Array(n * n);
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    if (!isWall(tx, ty)) continue;
    let v = 0;
    if (!isWall(tx, ty - 1)) v |= OPEN_N;
    if (!isWall(tx, ty + 1)) v |= OPEN_S;
    if (!isWall(tx - 1, ty)) v |= OPEN_W;
    if (!isWall(tx + 1, ty)) v |= OPEN_E;
    let deep = true;
    for (let dy = -2; dy <= 2 && deep; dy++) for (let dx = -2; dx <= 2; dx++) if (!isWall(tx + dx, ty + dy)) { deep = false; break; }
    if (deep) v |= DEEP;
    info[ty * n + tx] = v;
  }
  return { chunks, per, info, n };
}
