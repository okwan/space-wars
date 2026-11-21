// The zone's map: a square grid of 16 px tiles with walls, open space and the safe zone in the
// middle. Generated from a seed (our own layout rules, no map from any other game), mirrored four
// ways so no side is favoured. Pure and deterministic; a map is cached per seed, so the World can
// stay plain data (it keeps only the seed and the size).

import { makeRng } from './math';
import type { MapStyle } from './types';

/** Tile kinds. */
export const OPEN = 0, WALL = 1, SAFE = 2;
/** Tile size in px. A grid constant, not a tuning value. */
export const TILE = 16;

/** A generated map: n x n tiles, row-major. */
export interface ZoneMap {
  n: number; tiles: Uint8Array;
  /** Tile centres of the beacon outposts, the safe zone's centre and its radius in tiles. */
  outposts: { x: number; y: number }[]; centre: number; safeR: number;
  /** Navigation grid for bots: cells of NAV tiles; 1 = a ship fits there with room to spare. */
  nav: Uint8Array; navN: number;
  /** Named places (open style only): asteroid fields, derelicts, nebulae, the hub. Tile units. */
  regions: Region[];
}
/** A named place on an open map, in tile coords. Nebulae are only looks; the rest are rock. */
export interface Region { kind: 'hub' | 'field' | 'derelict' | 'nebula' | 'belt'; name: string; x: number; y: number; r: number }
/** Tiles per navigation cell. */
export const NAV = 2;

const cache = new Map<string, ZoneMap>();

/**
 * The map for a seed, size and style, generated once and cached. `arena` (the default) is the
 * walled free-for-all zone; `open` is a wide open-world map of named regions.
 */
export function zoneMap(seed: number, n: number, style: MapStyle = 'arena'): ZoneMap {
  const key = `${seed}:${n}:${style}`;
  let m = cache.get(key);
  if (!m) { m = generate(seed, n, style); cache.set(key, m); if (cache.size > 8) cache.delete(cache.keys().next().value!); }
  return m;
}

/** The tile at tile coords (outside the map counts as wall). */
export function tileAt(m: ZoneMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= m.n || ty >= m.n) return WALL;
  return m.tiles[ty * m.n + tx];
}
/** The tile under a point in px. */
export function tileAtPx(m: ZoneMap, x: number, y: number): number { return tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE)); }
/** True when a circle of radius r at (x, y) overlaps a wall tile. */
export function hitsWall(m: ZoneMap, x: number, y: number, r: number): boolean {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tileAt(m, tx, ty) !== WALL) continue;
    const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
    if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
  }
  return false;
}
/** True when the straight line between two points crosses no wall (sampled every 8 px). */
export function clearLine(m: ZoneMap, ax: number, ay: number, bx: number, by: number, r = 0): boolean {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    if (r ? hitsWall(m, x, y, r) : tileAtPx(m, x, y) === WALL) return false;
  }
  return true;
}
/** True when a point is inside the safe zone. */
export const inSafe = (m: ZoneMap, x: number, y: number): boolean => tileAtPx(m, x, y) === SAFE;

function generate(seed: number, n: number, style: MapStyle): ZoneMap {
  const t = new Uint8Array(n * n);
  const lay = style === 'open' ? openLayout(seed, n, t) : arenaLayout(seed, n, t);
  const c = lay.centre;
  // The border: two tiles of wall all round.
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) { t[k * n + i] = 1; t[(n - 1 - k) * n + i] = 1; t[i * n + k] = 1; t[i * n + n - 1 - k] = 1; }

  // Navigation cells, then fill any open pocket a ship cannot reach from the centre.
  const navN = Math.floor(n / NAV), nav = new Uint8Array(navN * navN);
  const navFill = () => {
    for (let cy = 0; cy < navN; cy++) for (let cx = 0; cx < navN; cx++) {
      let ok = 1;
      for (let y = cy * NAV - 1; y < cy * NAV + NAV + 1 && ok; y++) for (let x = cx * NAV - 1; x < cx * NAV + NAV + 1; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n || t[y * n + x] === 1) { ok = 0; break; }
      }
      nav[cy * navN + cx] = ok;
    }
  };
  navFill();
  const seen = new Uint8Array(navN * navN), q = [Math.floor(c / NAV) * navN + Math.floor(c / NAV)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!, x = i % navN, y = (i - x) / navN;
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ax, ny = y + ay, j = ny * navN + nx;
      if (nx < 0 || ny < 0 || nx >= navN || ny >= navN || seen[j] || !nav[j]) continue;
      seen[j] = 1; q.push(j);
    }
  }
  for (let cy = 0; cy < navN; cy++) for (let cx = 0; cx < navN; cx++) {
    const i = cy * navN + cx;
    if (seen[i]) continue;
    // a cell nobody can reach: wall over its open tiles unless a reachable cell touches them
    let near = false;
    for (let y = cy - 1; y <= cy + 1 && !near; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < navN && y < navN && seen[y * navN + x]) { near = true; break; }
    if (!near) for (let y = cy * NAV; y < cy * NAV + NAV; y++) for (let x = cx * NAV; x < cx * NAV + NAV; x++) if (t[y * n + x] === 0) t[y * n + x] = 1;
  }
  navFill();
  for (let i = 0; i < nav.length; i++) if (!seen[i]) nav[i] = 0;
  return { n, tiles: t, outposts: lay.outposts, centre: c, safeR: lay.safeR, nav, navN, regions: lay.regions };
}

interface Layout { centre: number; safeR: number; outposts: { x: number; y: number }[]; regions: Region[] }

/** The arena: structures drawn in one quadrant and stamped four ways round the safe zone. */
function arenaLayout(seed: number, n: number, t: Uint8Array): Layout {
  const rnd = makeRng(seed * 7919 + n);
  const h = n / 2, c = Math.floor(h);
  // Everything is drawn in one quadrant (x >= c, y < c, measured from the centre) and stamped
  // four ways by rotation, so every direction out of the safe zone looks the same.
  const put = (dx: number, dy: number, v: number) => {
    for (const [x, y] of [[c + dx, c + dy], [c - dy, c + dx], [c - dx, c - dy], [c + dy, c - dx]]) {
      if (x >= 0 && y >= 0 && x < n && y < n) t[y * n + x] = v;
    }
  };
  const rect = (x0: number, y0: number, w: number, hh: number, v = 1) => { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) put(x, y, v); };
  const keep: [number, number, number][] = []; // circles (dx, dy, r) that stay open
  const safeR = Math.max(8, Math.round(n * 0.022)), ringR = safeR + 5;
  const outR = Math.round(h * 0.55), plaza = Math.max(10, Math.round(n * 0.03));
  keep.push([0, 0, ringR + 7], [outR, 0, plaza]);
  const kept = (x: number, y: number, pad: number) => keep.some(([kx, ky, kr]) => Math.hypot(x - kx, y - ky) < kr + pad)
    || keep.some(([kx, ky, kr]) => Math.hypot(-y - kx, x - ky) < kr + pad);

  // Structures in the quadrant: solid blocks, walled rooms with doorways, and long baffles.
  const area = h * h, blocks = Math.round(area / 900), rooms = Math.round(area / 5200), baffles = Math.round(area / 2600);
  for (let i = 0; i < blocks; i++) {
    const w = 3 + Math.floor(rnd() * 9), hh = 3 + Math.floor(rnd() * 9);
    const x = Math.floor(rnd() * (h - w)), y = -Math.floor(rnd() * (h - hh)) - hh;
    if (kept(x + w / 2, y + hh / 2, Math.max(w, hh))) continue;
    rect(x, y, w, hh);
  }
  for (let i = 0; i < rooms; i++) {
    const w = 18 + Math.floor(rnd() * 22), hh = 18 + Math.floor(rnd() * 22), th = 2;
    const x = Math.floor(rnd() * (h - w)), y = -Math.floor(rnd() * (h - hh)) - hh;
    if (kept(x + w / 2, y + hh / 2, Math.max(w, hh) * 0.75)) continue;
    rect(x, y, w, th); rect(x, y + hh - th, w, th); rect(x, y, th, hh); rect(x + w - th, y, th, hh);
    const door = 7; // two doorways on opposite sides, each wide enough for a heavy ship
    const dx = x + 4 + Math.floor(rnd() * (w - door - 8)), dy = y + 4 + Math.floor(rnd() * (hh - door - 8));
    rect(dx, y, door, th, 0); rect(x + w - door - (dx - x), y + hh - th, door, th, 0);
    rect(x, dy, th, door, 0); rect(x + w - th, y + hh - door - (dy - y), th, door, 0);
  }
  for (let i = 0; i < baffles; i++) {
    const long = 16 + Math.floor(rnd() * 30), horiz = rnd() < 0.5;
    const w = horiz ? long : 2, hh = horiz ? 2 : long;
    const x = Math.floor(rnd() * (h - w)), y = -Math.floor(rnd() * (h - hh)) - hh;
    if (kept(x + w / 2, y + hh / 2, long * 0.6)) continue;
    rect(x, y, w, hh);
  }
  // Clear the plazas, then the safe zone and its ring: a wall circle with four wide gates.
  for (let dy = -h; dy < h; dy++) for (let dx = -h; dx < h; dx++) {
    const r = Math.hypot(dx, dy), x = c + dx, y = c + dy;
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    if (r < ringR + 6) t[y * n + x] = 0;
    for (const [kx, ky, kr] of [[outR, 0], [0, outR], [-outR, 0], [0, -outR]].map(([a, b]) => [a, b, plaza])) if (Math.hypot(dx - kx, dy - ky) < kr) t[y * n + x] = 0;
  }
  for (let dy = -ringR - 2; dy <= ringR + 2; dy++) for (let dx = -ringR - 2; dx <= ringR + 2; dx++) {
    const r = Math.hypot(dx, dy), x = c + dx, y = c + dy;
    const gate = Math.min(Math.abs(dx), Math.abs(dy)) < 4;
    if (r >= ringR && r < ringR + 2 && !gate) t[y * n + x] = 1;
    if (r < safeR) t[y * n + x] = 2;
  }
  const outposts = [[outR, 0], [0, outR], [-outR, 0], [0, -outR]].map(([dx, dy]) => ({ x: c + dx, y: c + dy }));
  return { centre: c, safeR, outposts, regions: [] };
}

/**
 * A* over the navigation grid from one point to another (px). Returns waypoints in px, the
 * first being the next one to fly to. Out of budget, the route leads as close to the goal as the
 * search got; [] when the start or goal has no open cell near it.
 */
export function findPath(m: ZoneMap, ax: number, ay: number, bx: number, by: number, budget = 6000): { x: number; y: number }[] {
  const N = m.navN, S = TILE * NAV;
  const cell = (x: number, y: number) => Math.max(0, Math.min(N - 1, Math.floor(y / S))) * N + Math.max(0, Math.min(N - 1, Math.floor(x / S)));
  const start = nearestOpen(m, cell(ax, ay), ax, ay), goal = nearestOpen(m, cell(bx, by), bx, by);
  if (start < 0 || goal < 0) return [];
  const gx = goal % N, gy = (goal - gx) / N;
  const sc = scratch(N * N), g = sc.g, from = sc.from, stamp = sc.stamp, run = ++sc.run;
  const G = (i: number) => (stamp[i] === run ? g[i] : Infinity);
  stamp[start] = run; g[start] = 0;
  const heap: number[] = [start], f = sc.f; f[start] = 0;
  const up = (k: number) => { while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let s2 = k; if (l < heap.length && f[heap[l]] < f[heap[s2]]) s2 = l; if (r < heap.length && f[heap[r]] < f[heap[s2]]) s2 = r; if (s2 === k) break; [heap[s2], heap[k]] = [heap[k], heap[s2]]; k = s2; } } return top; };
  let found = start === goal, spent = 0, best = start, bestH = Infinity;
  while (heap.length && !found && spent++ < budget) {
    const i = pop(), x = i % N, y = (i - x) / N, gi = g[i];
    const hh = Math.hypot(x - gx, y - gy);
    if (hh < bestH) { bestH = hh; best = i; }
    for (let ay2 = -1; ay2 <= 1; ay2++) for (let ax2 = -1; ax2 <= 1; ax2++) {
      if (!ax2 && !ay2) continue;
      const nx = x + ax2, ny = y + ay2;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (!m.nav[j] || (ax2 && ay2 && (!m.nav[y * N + nx] || !m.nav[ny * N + x]))) continue;
      const ng = gi + (ax2 && ay2 ? 1.414 : 1);
      if (ng >= G(j) - 1e-6) continue; // no re-opening a cell for a rounding-level gain: that loops
      stamp[j] = run; g[j] = ng; from[j] = i;
      if (j === goal) { found = true; break; }
      f[j] = ng + Math.hypot(nx - gx, ny - gy) * 1.2; heap.push(j); up(heap.length - 1);
    }
  }
  // out of budget: go as far as the search got toward the goal (the next search carries on)
  const end = found ? goal : best;
  const out: { x: number; y: number }[] = [];
  for (let i = end; i !== start; i = from[i]) { const x = i % N; out.push({ x: (x + 0.5) * S, y: ((i - x) / N + 0.5) * S }); }
  return out.reverse();
}

let sc0: { g: Float64Array; f: Float64Array; from: Int32Array; stamp: Uint32Array; run: number } | null = null;
/** Search buffers reused between calls (a pathfinding scratchpad, not game state). */
function scratch(len: number) {
  if (!sc0 || sc0.g.length !== len) sc0 = { g: new Float64Array(len), f: new Float64Array(len), from: new Int32Array(len), stamp: new Uint32Array(len), run: 0 };
  return sc0;
}

/** The nearest open navigation cell to cell i that is in plain sight of the point (px, py). */
function nearestOpen(m: ZoneMap, i: number, px: number, py: number): number {
  if (m.nav[i]) return i;
  const N = m.navN, S = NAV * TILE, x0 = i % N, y0 = (i - x0) / N;
  for (let r = 1; r < 6; r++) for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N || (Math.abs(x - x0) !== r && Math.abs(y - y0) !== r)) continue;
    if (m.nav[y * N + x] && clearLine(m, px, py, (x + 0.5) * S, (y + 0.5) * S)) return y * N + x;
  }
  return -1;
}

// ---- the open world --------------------------------------------------------------------------
// Our own layout rules: a safe hub in the middle, then named asteroid fields and derelict
// rings scattered with long empty stretches between them, lone rocks drifting in the gaps,
// nebula regions (looks only), and a thickening asteroid belt at the rim instead of a wall.

const FIELD_NAMES = ['CINDER DRIFT', 'THE SHOALS', 'GLASS REACH', 'THE HOLLOWS', 'THE TEETH', 'SALT RUN', 'KESTREL FIELD', 'BRAMBLE', 'SLAG REACH', 'THE SCATTER', 'IRONWOOD', 'GRAVEL SEA', 'MOTH FIELD', 'THE ANVILS'];
const DERELICT_NAMES = ['OLD RELAY', 'DRY DOCK', 'WARDEN RING', 'THE LANTERN', 'BONEYARD', 'QUIET SPIRE', 'HALO NINE'];
const NEBULA_NAMES = ['VIOLET VEIL', 'EMBER CLOUD', 'TIDEGLASS', 'THE MURK', 'PALE RIVER', 'ROSE DRIFT'];

function openLayout(seed: number, n: number, t: Uint8Array): Layout {
  const rnd = makeRng(seed * 104729 + n * 7);
  const c = Math.floor(n / 2), rim = Math.round(n * 0.06);
  const regions: Region[] = [];
  const hash = (x: number, y: number): number => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const set = (x: number, y: number, v: number): void => { if (x >= 0 && y >= 0 && x < n && y < n) t[y * n + x] = v; };
  /** One rock: a lumpy disc, its outline wobbling with angle, its edge roughened per tile. */
  const rock = (bx: number, by: number, r: number): void => {
    const a1 = rnd() * 6.28, a2 = rnd() * 6.28, R = Math.ceil(r * 1.35) + 1;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const ang = Math.atan2(y, x), d = Math.hypot(x, y) / r;
      const edge = 1 + Math.sin(ang * 3 + a1) * 0.17 + Math.sin(ang * 5 + a2) * 0.09 + (hash(bx + x, by + y) - 0.5) * 0.16;
      if (d < edge) set(Math.round(bx + x), Math.round(by + y), 1);
    }
  };
  const free = (x: number, y: number, r: number, pad: number, kinds: Region['kind'][]): boolean =>
    regions.every(g => !kinds.includes(g.kind) || Math.hypot(g.x - x, g.y - y) > g.r + r + pad);
  const spot = (r: number, pad: number, kinds: Region['kind'][]): [number, number] | null => {
    for (let k = 0; k < 80; k++) {
      const x = rim + r + rnd() * (n - 2 * (rim + r)), y = rim + r + rnd() * (n - 2 * (rim + r));
      if (free(x, y, r, pad, kinds)) return [Math.round(x), Math.round(y)];
    }
    return null;
  };
  const pick = (names: string[]): string => names.splice(Math.floor(rnd() * names.length), 1)[0] ?? 'UNCHARTED';
  const fNames = FIELD_NAMES.slice(), dNames = DERELICT_NAMES.slice(), nNames = NEBULA_NAMES.slice();

  const safeR = Math.max(8, Math.round(n * 0.014)), ringR = safeR + 5;
  regions.push({ kind: 'hub', name: 'HAVEN', x: c, y: c, r: ringR + 36 });
  // asteroid fields
  const fields = Math.round((n * n) / 90000);
  for (let i = 0; i < fields; i++) {
    const r = 26 + Math.floor(rnd() * 36), at = spot(r, 34, ['hub', 'field', 'derelict']);
    if (!at) continue;
    regions.push({ kind: 'field', name: pick(fNames), x: at[0], y: at[1], r });
    const count = Math.round(Math.PI * r * r * 0.0042);
    for (let k = 0; k < count; k++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r;
      rock(at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d, 1.5 + rnd() * rnd() * 7);
    }
  }
  // derelict rings: a broken hoop with four gaps, a core and a few spokes
  const derelicts = Math.max(3, Math.round((n * n) / 220000));
  const outposts: { x: number; y: number }[] = [];
  for (let i = 0; i < derelicts; i++) {
    const r = 12 + Math.floor(rnd() * 9), at = spot(r, 40, ['hub', 'field', 'derelict']);
    if (!at) continue;
    regions.push({ kind: 'derelict', name: pick(dNames), x: at[0], y: at[1], r: r + 4 });
    outposts.push({ x: at[0], y: at[1] });
    const turn = rnd() * 6.28;
    for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
      const d = Math.hypot(x, y), ang = Math.atan2(y, x) - turn;
      const gap = Math.abs(Math.sin(ang * 2)) < 4.5 / r; // four doorways, each about 8 tiles wide
      if (d >= r && d < r + 2 && !gap) set(at[0] + x, at[1] + y, 1);
      if (Math.max(Math.abs(x), Math.abs(y)) < 3) set(at[0] + x, at[1] + y, 1); // the core
    }
    for (let s = 0; s < 3; s++) { // spokes from the hoop inwards
      const a = turn + Math.PI / 4 + (s * Math.PI * 2) / 3;
      for (let d = r - 6; d < r; d++) for (let w = -1; w <= 0; w++) set(Math.round(at[0] + Math.cos(a) * d - Math.sin(a) * w), Math.round(at[1] + Math.sin(a) * d + Math.cos(a) * w), 1);
    }
  }
  // lone rocks drifting in the open
  const lone = Math.round((n * n) / 6500);
  for (let i = 0; i < lone; i++) {
    const x = rim + rnd() * (n - 2 * rim), y = rim + rnd() * (n - 2 * rim);
    if (Math.hypot(x - c, y - c) < ringR + 40) continue;
    rock(x, y, 1 + rnd() * 2.5);
  }
  // the rim: rocks thicken towards the edge into a ragged crust, so the zone has no straight wall
  const beltRocks = Math.round(n * rim * 0.32);
  for (let i = 0; i < beltRocks; i++) {
    const e = rim * (1 - Math.sqrt(rnd())), along = rnd() * n, side = Math.floor(rnd() * 4);
    const [x, y] = side === 0 ? [along, e] : side === 1 ? [along, n - 1 - e] : side === 2 ? [e, along] : [n - 1 - e, along];
    rock(x, y, 1.5 + rnd() * 4.5 * (1 - e / rim));
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const e = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (e < 5 + hash(x >> 2, y >> 2) * 6) t[y * n + x] = 1;
  }
  regions.push({ kind: 'belt', name: 'THE OUTER BELT', x: c, y: c, r: rim });
  // nebulae: looks only, so they may lie over fields; never over the hub
  for (let i = 0; i < 5; i++) {
    const r = 60 + Math.floor(rnd() * 60), at = spot(r, 10, ['hub', 'nebula']);
    if (at) regions.push({ kind: 'nebula', name: pick(nNames), x: at[0], y: at[1], r });
  }
  // the hub: cleared, with the safe zone inside a wall ring with four wide gates
  for (let dy = -ringR - 30; dy <= ringR + 30; dy++) for (let dx = -ringR - 30; dx <= ringR + 30; dx++) {
    if (Math.hypot(dx, dy) < ringR + 30) set(c + dx, c + dy, 0);
  }
  for (let dy = -ringR - 2; dy <= ringR + 2; dy++) for (let dx = -ringR - 2; dx <= ringR + 2; dx++) {
    const r = Math.hypot(dx, dy), gate = Math.min(Math.abs(dx), Math.abs(dy)) < 4;
    if (r >= ringR && r < ringR + 2 && !gate) set(c + dx, c + dy, 1);
    if (r < safeR) set(c + dx, c + dy, 2);
  }
  return { centre: c, safeR, outposts, regions };
}
