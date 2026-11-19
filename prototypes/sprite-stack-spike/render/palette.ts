// PROTOTYPE - NOT FOR PRODUCTION
// The prototype's palette: our own ramps, hue-shifted the way pixel art does it (shadows lean
// blue-violet, lights lean warm). Every final pixel is snapped to one of these colours through a
// 32x32x32 lookup table, after ordered dithering, which is what keeps the picture crisp and retro.

const HEX = [
  // void and steel (navy to pale steel)
  '05060c', '0a0d1a', '10162a', '17203c', '1f2c52', '2a3b68', '374d82', '48639c', '5f7fb6', '7f9fcc', 'a6c0e0', 'd2e2f2',
  // neutral greys for hull metal
  '1c1c26', '30303e', '4a4a5a', '6a6a7a', '8e8e9c', 'b4b4c0', 'd8d8e0', 'f4f4f8',
  // your paint: ice blue
  '0e2a4a', '14467a', '1d6eb0', '2f9ce0', '62c6ff', 'a8e6ff',
  // their paint: ember orange
  '3a1408', '6e2a0e', 'a84616', 'e06c22', 'ff9a3c', 'ffc47a',
  // gold (salvage, bounty)
  '5a3a08', '9a6a12', 'd8a020', 'ffd060', 'fff0a8',
  // violet (salvage cores, level-3 fire, nebula)
  '1c0e30', '2e1650', '4a2278', '6e34a8', '9a5ad8', 'c690ff', 'e8c8ff',
  // magenta / pink (level-2 bombs, nebula highlights)
  '4a0e3a', '82185e', 'c42e86', 'ff5fb0', 'ffa8d8',
  // safe-zone green
  '06261c', '0c4a34', '168058', '2ec488', '6dffb4', 'c4ffe2',
  // teal nebula
  '082a32', '0e4a56', '187a84', '34b0b0',
  // reds (damage, mines)
  '4a0a10', '8a1620', 'd42c2c', 'ff6a5a',
];

/** The palette as 0xRRGGBB. */
export const PALETTE: number[] = HEX.map(h => parseInt(h, 16));

/** Packs r, g, b (0..255) into 0xRRGGBB. */
export const rgb = (r: number, g: number, b: number): number => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);

/**
 * Nearest palette entry for every 5-bit-per-channel colour, as ImageData-ready ABGR words.
 * Distance is "redmean" weighted, which matches the eye better than plain RGB distance.
 */
export function buildLut(palette: number[]): Uint32Array {
  const lut = new Uint32Array(32 * 32 * 32);
  const pr = palette.map(c => (c >> 16) & 255), pg = palette.map(c => (c >> 8) & 255), pb = palette.map(c => c & 255);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4;
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const rm = (R + pr[i]) / 2, dr = R - pr[i], dg = G - pg[i], db = B - pb[i];
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
      if (d < bd) { bd = d; best = i; }
    }
    lut[(r << 10) | (g << 5) | b] = 0xff000000 | (pb[best] << 16) | (pg[best] << 8) | pr[best];
  }
  return lut;
}
