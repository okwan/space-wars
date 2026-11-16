// Sprite art (art bible §8, v2): Kenney's CC0 space packs packed into one atlas by
// tools/art/build-atlas.py. Every sprite faces up (nose to -y); the game's angle has nose to +x,
// so a sprite turns by angle + 90°. Pools hand out sprites per frame, like Labels does for text.

import { Container, NineSliceSprite, Sprite, Spritesheet, Texture, TilingSprite } from 'pixi.js';
import atlasData from '../../assets/sprites/atlas.json';
import type { Asteroid, Hull, Team, Weapon } from '../game/types';

// Each URL is written out in full: Vite inlines or hashes only `new URL('literal', import.meta.url)`.
const ATLAS = new URL('../../assets/sprites/atlas.png', import.meta.url).href;
const NEBULA = new URL('../../assets/sprites/nebula.png', import.meta.url).href;
const SPACE = new URL('../../assets/sprites/space.png', import.meta.url).href;
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
  nebula: Texture; space: Texture;
  ui: Record<keyof typeof UI, Texture>;
}

async function image(src: string): Promise<Texture> {
  const img = new Image(); img.src = src; await img.decode();
  return Texture.from(img);
}

/** Loads the atlas, the background tiles and the HUD pieces. */
export async function loadArt(): Promise<Art> {
  const [atlas, nebula, space, ...ui] = await Promise.all([image(ATLAS), image(NEBULA), image(SPACE), ...Object.values(UI).map(image)]);
  const sheet = new Spritesheet(atlas, atlasData as never);
  const frame = await sheet.parse();
  const names = Object.keys(UI) as (keyof typeof UI)[];
  return { frame, nebula, space, ui: Object.fromEntries(names.map((k, i) => [k, ui[i]])) as Art['ui'] };
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

/** The scrolling backdrop: a tiled starfield and a nebula at two parallax depths, plus two far planets. */
export class Backdrop {
  readonly layer = new Container();
  private space: TilingSprite; private nebula: TilingSprite; private planets: Sprite[];
  constructor(art: Art, private w: number, private h: number) {
    this.space = new TilingSprite({ texture: art.space, width: w, height: h });
    this.nebula = new TilingSprite({ texture: art.nebula, width: w, height: h });
    this.nebula.tileScale.set(2.6); this.nebula.blendMode = 'add'; this.nebula.alpha = 1;
    this.space.tint = 0x8a8aa0; // the tile darkened toward the void colour, #03040b
    this.planets = ['planet_a', 'planet_b'].map(f => { const s = new Sprite(art.frame[f]); s.anchor.set(0.5); s.alpha = 0.4; s.tint = 0x9098b0; return s; });
    this.planets[0].scale.set(0.7); this.planets[1].scale.set(0.35);
    this.layer.addChild(this.space, this.nebula, ...this.planets);
  }
  /** Moves the backdrop for a camera at (cx, cy); `size` is the zone's width, for wrapping. */
  update(cx: number, cy: number, size: number): void {
    this.space.tilePosition.set(-cx * 0.08, -cy * 0.08);
    this.nebula.tilePosition.set(-cx * 0.16, -cy * 0.16);
    const spots: [number, number, number][] = [[0.3, 0.25, 0.04], [0.78, 0.7, 0.07]];
    this.planets.forEach((p, i) => {
      const [fx, fy, par] = spots[i], span = size * par + this.w * 1.6;
      const x = (((fx * span - cx * par) % span) + span) % span - this.w * 0.3;
      const y = (((fy * span - cy * par) % span) + span) % span - this.h * 0.3;
      p.position.set(x, y);
    });
  }
}

// ---- What each figure looks like ----------------------------------------------------------

/** The sprite frame for a hull in a fleet's colours: cyan ships are blue, amber ships orange. */
export const shipFrame = (hull: Hull, team: Team): string => `ship_${hull}_${team}`;
/** Sprite size per hull, as a multiple of the hull's collision radius. */
export const SHIP_SIZE: Record<Hull, number> = { dart: 3.0, lancer: 2.9, bulwark: 2.35 };
/** Where the engines sit, in units of the hull radius, nose to +x. */
const ENGINES: Record<Hull, [number, number][]> = { dart: [[-1.2, 0]], lancer: [[-1.05, 0.42], [-1.05, -0.42]], bulwark: [[-1.15, 0.55], [-1.15, -0.55]] };

export interface ShipSpriteLook { thrust?: boolean; burn?: boolean; t?: number; flash?: boolean; low?: boolean; alpha?: number; calm?: boolean }

/** A ship: engine flames behind, the hull sprite, a shield flicker when hit. `r` is the hull radius on screen. */
export function shipSprite(S: SpritePool, F: SpritePool, hull: Hull, team: Team, x: number, y: number, a: number, r: number, o: ShipSpriteLook = {}): void {
  const t = o.t ?? 0, c = Math.cos(a), sn = Math.sin(a);
  if (o.thrust) {
    for (const [ex, ey] of ENGINES[hull]) {
      const len = (o.burn ? 1.9 : 1.15) * (0.85 + 0.15 * Math.sin(t * 45 + ey * 9));
      const px = x + (ex * c - ey * sn) * r, py = y + (ex * sn + ey * c) * r;
      const fl = F.put(o.burn ? 'flame_burn' : `flame_${team}`, px, py, a + Math.PI / 2, r * len, { add: true, ay: 0 });
      fl.scale.x *= 1.25;
    }
  }
  let alpha = o.alpha ?? 1;
  if (o.low && !o.calm && Math.sin(t * 28) < -0.3) alpha *= 0.45; // low energy: the hull flickers
  S.put(shipFrame(hull, team), x, y, a + Math.PI / 2, r * SHIP_SIZE[hull], { alpha });
  if (o.flash && !o.calm) F.put('shield', x, y, a + Math.PI / 2, r * 3.6, { add: true, tint: team === 0 ? 0x7ff8ff : 0xffd080, alpha: 0.85 });
}

/** A rock: a grey meteor sprite sized to its collision radius, turning with its spin. */
export function rockSprite(S: SpritePool, rock: Asteroid, x: number, y: number, scale: number, index: number): void {
  const name = rock.r > 55 ? `rock_big${(index % 4) + 1}` : `rock_med${(index % 2) + 1}`;
  S.put(name, x, y, rock.spin + index, rock.r * scale * 2.25, { tint: 0xc4c9d6 });
}

/** A beacon's station: a slowly turning satellite in its holder's colours (grey when neutral). */
export function beaconSprite(S: SpritePool, owner: -1 | Team, x: number, y: number, scale: number, t: number, phase: number): void {
  S.put(owner === -1 ? 'beacon_n' : `beacon_${owner}`, x, y, t * 0.25 + phase, 230 * scale);
}

/** A mine: a small saucer in its fleet's colours; an armed one blinks a bright core. */
export function mineSprite(S: SpritePool, F: SpritePool, team: Team, live: boolean, x: number, y: number, scale: number, t: number, calm: boolean): void {
  S.put(`mine_${team}`, x, y, t * 1.5, 26 * scale);
  if (live && (calm || Math.sin(t * 10) > 0)) F.put('glint', x, y, 0, 26 * scale, { add: true, tint: team === 0 ? 0x9ffcff : 0xffe0a0 });
}

const SHOT_FRAME: Record<Weapon, string> = { bolt: 'shot_bolt', scatter: 'shot_scatter', rico: 'shot_rico' };
const SHOT_SIZE: Record<Weapon, number> = { bolt: 34, scatter: 22, rico: 22 };
/** A shot: a laser sprite along its flight, with a bright flare in its first frames. */
export function shotSprite(F: SpritePool, team: Team, kind: Weapon, vx: number, vy: number, x: number, y: number, scale: number, hot: boolean, t: number): void {
  const a = Math.atan2(vy, vx);
  F.put(`${SHOT_FRAME[kind]}_${team}`, x, y, kind === 'rico' ? t * 12 : a + Math.PI / 2, SHOT_SIZE[kind] * Math.max(0.8, scale), { add: true });
  if (hot) F.put('glint', x, y, 0, 26 * scale, { add: true, tint: team === 0 ? 0xbffcff : 0xffe6b0, alpha: 0.9 });
}

/** One frame of the explosion: 9 frames over `life` seconds. */
export function boomSprite(F: SpritePool, x: number, y: number, size: number, age: number, life: number): void {
  const k = Math.min(8, Math.floor((age / life) * 9));
  F.put(`boom_${k}`, x, y, 0, size, { alpha: k > 5 ? 1 - (k - 5) / 4 : 1 });
}
