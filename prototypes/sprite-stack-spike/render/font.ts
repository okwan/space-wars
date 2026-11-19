// PROTOTYPE - NOT FOR PRODUCTION
// A 3x5 pixel font of our own for the HUD, drawn straight into the frame buffer so text is as
// crisp as everything else.

const G: Record<string, string> = {
  "A": '.#.#.#####.##.#',
  "B": '##.#.###.#.###.',
  "C": '.###..#..#...##',
  "D": '##.#.##.##.###.',
  "E": '####..##.#..###',
  "F": '####..##.#..#..',
  "G": '.###..#.##.#.##',
  "H": '#.##.#####.##.#',
  "I": '###.#..#..#.###',
  "J": '..#..#..##.#.#.',
  "K": '#.##.###.#.##.#',
  "L": '#..#..#..#..###',
  "M": '#.########.##.#',
  "N": '##.#.##.##.##.#',
  "O": '.#.#.##.##.#.#.',
  "P": '##.#.###.#..#..',
  "Q": '.#.#.##.###..##',
  "R": '##.#.###.#.##.#',
  "S": '.###...#...###.',
  "T": '###.#..#..#..#.',
  "U": '#.##.##.##.####',
  "V": '#.##.##.##.#.#.',
  "W": '#.##.########.#',
  "X": '#.##.#.#.#.##.#',
  "Y": '#.##.#.#..#..#.',
  "Z": '###..#.#.#..###',
  "0": '####.##.##.####',
  "1": '.#.##..#..#.###',
  "2": '##...#.#.#..###',
  "3": '##...#.#...###.',
  "4": '#.##.####..#..#',
  "5": '####..##...###.',
  "6": '.###..####.####',
  "7": '###..#.#..#..#.',
  "8": '####.#####.####',
  "9": '####.####..###.',
  ".": '.............#.',
  ",": '..........#.#..',
  ":": '....#.....#....',
  "/": '..#..#.#.#..#..',
  "-": '......###......',
  "+": '....#.###.#....',
  "!": '.#..#..#.....#.',
  "?": '##...#.#.....#.',
  "(": '.#.#..#..#...#.',
  ")": '.#...#..#..#.#.',
  "'": '.#..#..........',
  ">": '#...#...#.#.#..',
  "<": '..#.#.#...#...#',
  "=": '...###...###...',
  "[": '##.#..#..#..##.',
  "]": '.##..#..#..#.##',
  "%": '#.#..#.#.#..#.#',
  "*": '#.#.#.#.#......',
  "#": '#.#####.#####.#',
};

/** Width in pixels of a line of text. */
export const textWidth = (s: string): number => s.length * 4 - 1;

/**
 * Draws text into a 32-bit frame buffer (ABGR words) at (x, y), with a dark drop shadow so it
 * reads over anything.
 */
export function drawText(buf: Uint32Array, W: number, H: number, s: string, x: number, y: number, abgr: number, shadow = 0xff0a0605): void {
  const up = s.toUpperCase();
  for (let pass = 0; pass < 2; pass++) {
    const col = pass === 0 ? shadow : abgr, ox = pass === 0 ? 1 : 0, oy = pass === 0 ? 1 : 0;
    for (let i = 0; i < up.length; i++) {
      const g = G[up[i]];
      if (!g) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c] !== '#') continue;
        const px = x + i * 4 + c + ox, py = y + r + oy;
        if (px >= 0 && py >= 0 && px < W && py < H) buf[py * W + px] = col;
      }
    }
  }
}

/** A 0xRRGGBB colour as an opaque ABGR word for ImageData. */
export const abgr = (c: number): number => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
