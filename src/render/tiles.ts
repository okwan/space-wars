// The zone's walls on screen (our own procedural art, art bible §6): steel plates with a lit
// rim where they face open space, a faint green deck in the safe zone. The map is drawn in
// square chunks onto canvases the first time they come into view, and kept while nearby.
// Also the radar picture: the whole map at one pixel per tile.

import { Container, Sprite, Texture } from 'pixi.js';
import { SAFE, TILE, WALL, tileAt, type ZoneMap } from '../game/map';

/** Tiles per chunk side. */
const CH = 32;
/** Chunks kept drawn at most; the furthest from the camera go first. */
const KEEP = 48;

/** A small hash for per-tile variation (look only, never the zone's rng). */
const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Draws one chunk of the map onto a canvas, `CH` tiles square at `TILE` px a tile. */
function drawChunk(m: ZoneMap, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CH * TILE;
  const c = cv.getContext('2d')!;
  const T = TILE;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const tx = cx * CH + i, ty = cy * CH + j, k = tileAt(m, tx, ty), x = i * T, y = j * T;
    if (k === SAFE) { // the safe deck: a faint green floor with a fine grid
      c.fillStyle = 'rgba(40,120,90,0.16)'; c.fillRect(x, y, T, T);
      c.fillStyle = 'rgba(109,255,180,0.10)'; c.fillRect(x, y, T, 1); c.fillRect(x, y, 1, T);
      continue;
    }
    if (k !== WALL) continue;
    const n = tileAt(m, tx, ty - 1) !== WALL, s = tileAt(m, tx, ty + 1) !== WALL;
    const w = tileAt(m, tx - 1, ty) !== WALL, e = tileAt(m, tx + 1, ty) !== WALL;
    const inner = !n && !s && !w && !e, v = hash(tx, ty);
    // the plate: deep blue steel, a shade darker inside a wall mass
    const base = inner ? 26 + v * 6 : 38 + v * 8;
    c.fillStyle = `rgb(${base * 0.62 | 0},${base * 0.72 | 0},${base * 1.18 | 0})`;
    c.fillRect(x, y, T, T);
    // plate seams on a two-tile grid, and a rivet on some plates
    c.fillStyle = 'rgba(0,0,0,0.35)';
    if (tx % 2 === 0) c.fillRect(x, y, 1, T);
    if (ty % 2 === 0) c.fillRect(x, y, T, 1);
    if (v > 0.82) { c.fillStyle = 'rgba(170,190,240,0.35)'; c.fillRect(x + 7, y + 7, 2, 2); }
    // the rim: lit on the top and left where open space is, shadowed on the bottom and right
    if (n) { c.fillStyle = '#8fa8e8'; c.fillRect(x, y, T, 2); c.fillStyle = 'rgba(120,150,230,0.25)'; c.fillRect(x, y + 2, T, 2); }
    if (w) { c.fillStyle = '#7690d4'; c.fillRect(x, y, 2, T); }
    if (s) { c.fillStyle = '#0a0e1c'; c.fillRect(x, y + T - 3, T, 3); c.fillStyle = '#5068a8'; c.fillRect(x, y + T - 1, T, 1); }
    if (e) { c.fillStyle = '#0a0e1c'; c.fillRect(x + T - 3, y, 3, T); c.fillStyle = '#4a60a0'; c.fillRect(x + T - 1, y, 1, T); }
  }
  return cv;
}

/** The map's chunks as sprites on one layer, drawn on demand around the camera. */
export class TileLayer {
  readonly layer = new Container();
  private chunks = new Map<string, Sprite>();
  private key = '';

  /**
   * Shows the part of map `m` that a camera at (camX, camY), scale `s`, sees on a `W` × `H`
   * screen with its centre at (ox, oy).
   */
  draw(m: ZoneMap, mapKey: string, camX: number, camY: number, s: number, W: number, H: number, ox = W / 2, oy = H / 2): void {
    if (mapKey !== this.key) { this.clear(); this.key = mapKey; }
    const span = CH * TILE, N = Math.ceil(m.n / CH);
    const x0 = camX - ox / s, y0 = camY - oy / s, x1 = camX + (W - ox) / s, y1 = camY + (H - oy) / s;
    const c0 = Math.max(0, Math.floor(x0 / span)), c1 = Math.min(N - 1, Math.floor(x1 / span));
    const r0 = Math.max(0, Math.floor(y0 / span)), r1 = Math.min(N - 1, Math.floor(y1 / span));
    for (const sp of this.chunks.values()) sp.visible = false;
    const sx = (wx: number) => Math.round(ox + (wx - camX) * s), sy = (wy: number) => Math.round(oy + (wy - camY) * s);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const k = `${cx},${cy}`;
      let sp = this.chunks.get(k);
      if (!sp) { sp = new Sprite(Texture.from(drawChunk(m, cx, cy))); this.layer.addChild(sp); this.chunks.set(k, sp); }
      // whole-pixel edges, sized from neighbour to neighbour, so no seam shows between chunks
      const X = sx(cx * span), Y = sy(cy * span);
      sp.position.set(X, Y); sp.width = sx((cx + 1) * span) - X; sp.height = sy((cy + 1) * span) - Y;
      sp.visible = true;
    }
    if (this.chunks.size > KEEP) { // forget the chunks furthest from the camera
      const far = [...this.chunks.entries()].filter(([, sp]) => !sp.visible)
        .map(([k, sp]) => ({ k, sp, d: Math.hypot(sp.x - ox, sp.y - oy) })).sort((a, b) => b.d - a.d);
      for (const f of far.slice(0, this.chunks.size - KEEP)) { f.sp.destroy({ texture: true, textureSource: true }); this.chunks.delete(f.k); }
    }
  }
  /** Hides every chunk (scenes with no zone in view). */
  hide(): void { for (const sp of this.chunks.values()) sp.visible = false; }
  private clear(): void { for (const sp of this.chunks.values()) sp.destroy({ texture: true, textureSource: true }); this.chunks.clear(); }
}

/** The radar picture: one pixel per tile, walls in steel grey, the safe zone green, open space clear. */
export function radarTexture(m: ZoneMap): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = m.n;
  const c = cv.getContext('2d')!, img = c.createImageData(m.n, m.n);
  for (let i = 0; i < m.n * m.n; i++) {
    const k = m.tiles[i], o = i * 4;
    if (k === WALL) { img.data[o] = 150; img.data[o + 1] = 166; img.data[o + 2] = 210; img.data[o + 3] = 255; }
    else if (k === SAFE) { img.data[o] = 40; img.data[o + 1] = 150; img.data[o + 2] = 100; img.data[o + 3] = 230; }
  }
  c.putImageData(img, 0, 0);
  const t = Texture.from(cv);
  t.source.scaleMode = 'nearest';
  return t;
}
