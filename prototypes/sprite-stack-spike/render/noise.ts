// PROTOTYPE - NOT FOR PRODUCTION
// Look-only noise: integer hashes, value noise and a tileable fbm texture. Never used by the
// rules (the simulation has its own seeded rng), so it can change without touching gameplay.

/** A hash of two integers to [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A hash of three integers to [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  return hash2(x, Math.imul(y | 0, 31) ^ Math.imul(z | 0, 1013904223), seed);
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Value noise on a lattice that repeats every `period` cells. */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Plain value noise in 3D (no period), for shaping rocks. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const l = (dz: number): number => {
    const a = hash3(xi, yi, zi + dz, seed), b = hash3(xi + 1, yi, zi + dz, seed);
    const c = hash3(xi, yi + 1, zi + dz, seed), d = hash3(xi + 1, yi + 1, zi + dz, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const lo = l(0), hi = l(1);
  return lo + (hi - lo) * fz;
}

/**
 * A size x size fbm texture that tiles seamlessly, values 0..1. Sampled per pixel for nebula
 * clouds and wall grime, so the per-pixel cost is one array read.
 */
export function fbmTexture(size: number, baseCells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let norm = 0;
  for (let o = 0, amp = 1; o < octaves; o++, amp *= 0.5) norm += amp;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 1, cells = baseCells;
    for (let o = 0; o < octaves; o++) {
      v += amp * periodicNoise((x / size) * cells, (y / size) * cells, cells, seed + o * 101);
      amp *= 0.5; cells *= 2;
    }
    out[y * size + x] = v / norm;
  }
  return out;
}
