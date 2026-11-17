// Wrap-around geometry and the seeded random generator. Pure functions.

/** Shortest wrapped delta from a to b on a ring of the given size. */
export function wd(a: number, b: number, size: number): number {
  return ((b - a + size * 1.5) % size + size) % size - size / 2;
}
/** A coordinate folded back into [0, size). */
export function wrap(v: number, size: number): number { return ((v % size) + size) % size; }
/** Wrapped distance between two points. */
export function dist(a: { x: number; y: number }, b: { x: number; y: number }, size: number): number {
  return Math.hypot(wd(a.x, b.x, size), wd(a.y, b.y, size));
}
/** Signed smallest angle from a to b, radians. */
export function angDiff(a: number, b: number): number { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** mulberry32 on a state object, so the state is plain data that a world carries. */
export function rand(s: { seed: number }): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), s.seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** A stand-alone seeded generator. */
export function makeRng(seed: number): () => number { const s = { seed }; return () => rand(s); }
