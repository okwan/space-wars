// Sprite art (art bible §8, v2): Kenney's CC0 space packs packed into one atlas by
// tools/art/build-atlas.py. Every sprite faces up (nose to -y); the game's angle has nose to +x,
// so a sprite turns by angle + 90°. Pools hand out sprites per frame, like Labels does for text.

import { Container, NineSliceSprite, Sprite, Spritesheet, Texture } from 'pixi.js';
import atlasData from '../../assets/sprites/atlas.json';
import type { Hull } from '../game/types';

/** A ship's paint: 0 is yours (blue), 1 is everyone else's (orange). Free-for-all: every other ship is a foe. */
export type Paint = 0 | 1;

// Each URL is written out in full: Vite inlines or hashes only `new URL('literal', import.meta.url)`.
const ATLAS = new URL('../../assets/sprites/atlas.png', import.meta.url).href;
const UI = {
  panel: new URL('../../assets/vendor/kenney-ui/panel_glass_notches.png', import.meta.url).href,
  tab: new URL('../../assets/vendor/kenney-ui/panel_glass_tab_blade.png', import.meta.url).href,
  bar0: new URL('../../assets/vendor/kenney-ui/bar_blue.png', import.meta.url).href,
  bar1: new URL('../../assets/vendor/kenney-ui/bar_yellow.png', import.meta.url).href,
  barLow: new URL('../../assets/vendor/kenney-ui/bar_red.png', import.meta.url).href,
  barTrack: new URL('../../assets/vendor/kenney-ui/bar_grey.png', import.meta.url).href,
};

/** Every texture the game draws with. */
export interface Art {
  frame: Record<string, Texture>;
  ui: Record<keyof typeof UI, Texture>;
}

async function image(src: string): Promise<Texture> {
  const img = new Image(); img.src = src; await img.decode();
  return Texture.from(img);
}

/** Loads the atlas and the HUD pieces. */
export async function loadArt(): Promise<Art> {
  const [atlas, ...ui] = await Promise.all([image(ATLAS), ...Object.values(UI).map(image)]);
  const sheet = new Spritesheet(atlas, atlasData as never);
  const frame = await sheet.parse();
  const names = Object.keys(UI) as (keyof typeof UI)[];
  return { frame, ui: Object.fromEntries(names.map((k, i) => [k, ui[i]])) as Art['ui'] };
}

export interface Put { tint?: number; alpha?: number; add?: boolean; ax?: number; ay?: number }

/** A pool of sprites on one layer, handed out each frame and hidden when not used. */
export class SpritePool {
  private pool: Sprite[] = [];
  private used = 0;
  constructor(private layer: Container, private art: Art) {}
  begin(): void { this.used = 0; }
  end(): void { for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; }
  /** Draws atlas frame `name` centred on (x, y), turned by rot, `size` px across its longer side. */
  put(name: string, x: number, y: number, rot: number, size: number, o: Put = {}): Sprite {
    let s = this.pool[this.used];
    if (!s) { s = new Sprite(); this.layer.addChild(s); this.pool.push(s); }
    this.used++;
    const tex = this.art.frame[name];
    if (s.texture !== tex) s.texture = tex;
    s.anchor.set(o.ax ?? 0.5, o.ay ?? 0.5);
    s.position.set(x, y); s.rotation = rot;
    s.scale.set(size / Math.max(tex.width, tex.height));
    s.tint = o.tint ?? 0xffffff; s.alpha = o.alpha ?? 1; s.blendMode = o.add ? 'add' : 'normal';
    s.visible = true;
    return s;
  }
}

/** A pool of nine-slice HUD pieces: panels and bars that stretch without blurring their corners. */
export class PanelPool {
  private pool: NineSliceSprite[] = [];
  private used = 0;
  constructor(private layer: Container, private art: Art) {}
  begin(): void { this.used = 0; }
  end(): void { for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; }
  put(kind: keyof Art['ui'], x: number, y: number, w: number, h: number, tint = 0xffffff, alpha = 1): NineSliceSprite {
    let s = this.pool[this.used];
    const tex = this.art.ui[kind], edge = kind.startsWith('bar') ? 12 : 16;
    if (!s) { s = new NineSliceSprite({ texture: tex, leftWidth: edge, rightWidth: edge, topHeight: edge, bottomHeight: edge }); this.layer.addChild(s); this.pool.push(s); }
    this.used++;
    if (s.texture !== tex) s.texture = tex;
    s.leftWidth = s.rightWidth = edge; s.topHeight = s.bottomHeight = kind.startsWith('bar') ? Math.min(edge, h / 2) : edge;
    s.position.set(Math.round(x), Math.round(y)); s.width = Math.max(edge * 2, w); s.height = h;
    s.tint = tint; s.alpha = alpha; s.visible = true;
    return s;
  }
}

// ---- What each figure looks like ----------------------------------------------------------

/** The sprite frame for a hull in a paint (our own art): yours blue, everyone else's orange. */
export const shipFrame = (hull: Hull, paint: Paint): string => `ship_${hull}_${paint}`;
/** Sprite size per hull, as a multiple of the hull's collision radius: small ships, a wide view. */
export const SHIP_SIZE: Record<Hull, number> = { dart: 3.1, lancer: 3.0, bulwark: 2.7 };
/** Where the engines sit, in units of the hull radius, nose to +x. */
const ENGINES: Record<Hull, [number, number][]> = { dart: [[-1.0, 0]], lancer: [[-0.95, 0.38], [-0.95, -0.38]], bulwark: [[-1.0, 0.5], [-1.0, -0.5]] };

export interface ShipSpriteLook { thrust?: boolean; burn?: boolean; t?: number; flash?: boolean; low?: boolean; alpha?: number; calm?: boolean; shield?: boolean }

/** A ship: engine flames behind, the hull sprite, a shimmer when hit or spawn-shielded. `r` is the hull radius on screen. */
export function shipSprite(S: SpritePool, F: SpritePool, hull: Hull, paint: Paint, x: number, y: number, a: number, r: number, o: ShipSpriteLook = {}): void {
  const t = o.t ?? 0, c = Math.cos(a), sn = Math.sin(a);
  if (o.thrust) {
    for (const [ex, ey] of ENGINES[hull]) {
      const len = (o.burn ? 2.0 : 1.2) * (0.85 + 0.15 * Math.sin(t * 45 + ey * 9));
      const px = x + (ex * c - ey * sn) * r, py = y + (ex * sn + ey * c) * r;
      const fl = F.put(o.burn ? 'flame_burn' : `flame_${paint}`, px, py, a + Math.PI / 2, r * len, { add: true, ay: 0 });
      fl.scale.x *= 1.2;
    }
  }
  let alpha = o.alpha ?? 1;
  if (o.low && !o.calm && Math.sin(t * 28) < -0.3) alpha *= 0.45; // low energy: the hull flickers
  S.put(shipFrame(hull, paint), x, y, a + Math.PI / 2, r * SHIP_SIZE[hull], { alpha });
  if (o.flash && !o.calm) F.put('shield', x, y, a + Math.PI / 2, r * 3.4, { add: true, tint: 0xffffff, alpha: 0.8 });
  else if (o.shield) F.put('shield', x, y, t * 2, r * 3.4, { add: true, tint: 0x8affc8, alpha: 0.35 + 0.15 * Math.sin(t * 9) });
}

/** A mine: a small saucer in its layer's paint; an armed one blinks a bright core. */
export function mineSprite(S: SpritePool, F: SpritePool, paint: Paint, live: boolean, x: number, y: number, scale: number, t: number, calm: boolean): void {
  S.put(`mine_${paint}`, x, y, t * 1.5, 20 * scale, { alpha: live ? 1 : 0.55 });
  if (live && (calm || Math.sin(t * 10) > 0)) F.put('glint', x, y, 0, 22 * scale, { add: true, tint: paint === 0 ? 0x9ffcff : 0xffb080 });
}

/** One frame of the explosion: 9 frames over `life` seconds. */
export function boomSprite(F: SpritePool, x: number, y: number, size: number, age: number, life: number): void {
  const k = Math.min(8, Math.floor((age / life) * 9));
  F.put(`boom_${k}`, x, y, 0, size, { alpha: k > 5 ? 1 - (k - 5) / 4 : 1 });
}
