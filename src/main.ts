// The page: input, sound, scenes, camera and HUD, drawn with PixiJS. The rules are in game/
// (pure, deterministic, server-ready); the look is in render/; what the checks drive is in
// hook.ts. Implements design/game-brief.md: a free-for-all in one big walled zone.

import { Application, BlurFilter, Container, Graphics, RenderTexture, RendererType, Sprite, Text, type Texture, type TextStyleFontWeight } from 'pixi.js';
import config from '../data/config.json';
import { Sound } from './audio';
import { aimTurn, readPad, type PadState } from './gamepad';
import { NetSession } from './net/client';
import { apply, load, save, SKILL_NAMES, type Settings } from './settings';
import { inSafe, TILE, zoneMap } from './game/map';
import { step as simStep, STEP } from './game/sim';
import { tuningFrom } from './game/tuning';
import { maxEnergy } from './game/salvage';
import { HULL_RADIUS, HULLS, UPGRADES, type GameEvent, type Hull, type Ship, type ShipInput, type ShotKind, type Upgrade, type World } from './game/types';
import { newWorld } from './game/world';
import { clock, install, manual, params, seedFrom } from './hook';
import {
  blip, BOMB_COL, BULLET_COL, dashedPoly, DIM_CSS, GOLD, GOLD_CSS, HULL_NAME, HULL_ROLE, look, PAINT, SAFE_COL, SAFE_CSS, TEXT_CSS,
} from './render/art';
import { boomSprite, loadArt, mineSprite, PanelPool, shipSprite, SpritePool, type Paint, type ShipSpriteLook } from './render/sprites';
import { radarTexture, TileLayer } from './render/tiles';

const base = tuningFrom(config);
let settings: Settings = load(base);
let tune = apply(base, settings);
const W = 1280, H = 720;
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';
const TITLE = 'Beacon Wars';
let ME = 0; // the local player's ship id (online, the seat the server gave)
let net: NetSession | null = null;
const CONTROLS = [
  'Left / Right (or A / D): turn     Up (or W): thrust     Down (or S): reverse     Shift: afterburner',
  'Space: guns     F or B: bomb     E: lay a mine',
  'Tab: scoreboard     V: full map     P: pause     M: mute     While relaunching: 1 / 2 / 3 pick a hull',
];

// ---- Input: keys by position (event.code), OS key repeat ignored ------------------------
const down = new Set<string>(), hit = new Set<string>();
const pressed = (code: string): boolean => hit.has(code);
const held = (...codes: string[]): boolean => codes.some(c => down.has(c));
const sound = new Sound(settings.volume);
let typing: ((key: string) => void) | null = null; // a text field taking keys
addEventListener('keydown', e => {
  sound.start();
  if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  if (typing) { typing(e.key); e.preventDefault(); return; }
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('pointerup', () => sound.start());
addEventListener('blur', () => down.clear());

// ---- The session: the zone plus what only this screen needs ------------------------------
interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: number }
interface Fx { kind: 'boom' | 'blast'; x: number; y: number; age: number; life: number; size: number; col: number }
/** A line in the message feed, bottom left: kills and your pickups. */
interface FeedLine { parts: [string, string][]; t: number }
/** One frame of the death replay: ships (id, x, y, a, alive, hull index, thrust) and shots. */
interface TapeFrame { ships: number[][]; shots: { x: number; y: number; vx: number; vy: number; kind: ShotKind; level: number }[] }
/** A word that floats up from a ship: a pickup or a bounty paid. */
interface Pop { text: string; x: number; y: number; t: number; color: string }
/** What each salvage upgrade is called on screen, and its short HUD label. */
const UP_NAME: Record<Upgrade, string> = {
  cells: 'Energy cells', regen: 'Recharge', engine: 'Engines', turn: 'Thrusters', guns: 'Gun level',
  bombs: 'Bomb level', bounce: 'Bouncing bullets', multi: 'Multi-fire', mines: 'Extra mine',
};
const UP_SHORT: Record<Upgrade, string> = { cells: 'Cells', regen: 'Recharge', engine: 'Engine', turn: 'Turning', guns: 'Guns', bombs: 'Bombs', bounce: 'Bounce', multi: 'Multi', mines: 'Mines' };
interface View {
  cam: { x: number; y: number }; shake: number; sparks: Spark[]; fx: Fx[]; feed: FeedLine[]; pops: Pop[];
  tape: TapeFrame[]; tapeT: number; replay: { frames: TapeFrame[]; t: number; at: { x: number; y: number }; by: number } | null;
  banner: { text: string; t: number; color?: string } | null;
  hint: number; hintT: number; lowHint: number; lowTaught: boolean; thrustTime: number; turned: boolean; picked: boolean;
  hull: Hull; bigMap: boolean;
}
let scene = '', world: World, view: View;
const log: GameEvent[] = []; // window.game.events
function newView(): void {
  const me = world.ships[ME];
  view = {
    cam: { x: me.x, y: me.y }, shake: 0, sparks: [], fx: [], feed: [], pops: [], tape: [], tapeT: 0, replay: null,
    banner: { text: 'Free-for-all: everyone is a target', t: 3 },
    hint: settings.taught ? 4 : 0, hintT: 0, lowHint: 0, lowTaught: false, thrustTime: 0, turned: false, picked: false,
    hull: me.nextHull, bigMap: false,
  };
}
/** A new offline zone: you and bots. */
function reset(): void {
  net?.close(); net = null; ME = 0;
  tune = apply(base, settings);
  world = newWorld(tune, { seed: seedFrom(config.seed), humans: [ME] });
  world.events = [];
  newView();
}
const me = (): Ship => world.ships[ME];
const map = () => zoneMap(world.mapSeed, world.tiles);
/** The live ship with the biggest bounty (at least four times the starting bounty), or -1. */
function mostWanted(): number {
  let best = -1, top = tune.bounty_start * 4 - 1;
  for (const sh of world.ships) if (sh.alive && sh.bounty > top) { top = sh.bounty; best = sh.id; }
  return best;
}
/** Free-for-all paint: your ship is blue, every other ship orange. */
const paintOf = (id: number): Paint => (id === ME ? 0 : 1);
const nameOf = (id: number): string => (id === ME ? 'You' : world.ships[id]?.name ?? '?');

let padWas: PadState | null = null;
function myInput(): ShipInput {
  for (const [i, k] of ['Digit1', 'Digit2', 'Digit3'].entries()) if (pressed(k)) view.hull = HULLS[i];
  const pad = readPad(), was = padWas;
  padWas = pad;
  if (pad && !me().alive && pad.x && !was?.x) view.hull = HULLS[(HULLS.indexOf(view.hull) + 1) % 3];
  const p = pad && !me().alive ? null : pad; // while relaunching, X picks the hull
  let padL = !!p?.left, padR = !!p?.right;
  if (p && settings.aimSteer && p.mag > tune.pad_aim_dead) { // aim-steer: the nose turns toward where the stick points
    ({ left: padL, right: padR } = aimTurn(me().a, p.sx, p.sy, tune.pad_aim_slack));
  }
  return {
    left: held('ArrowLeft', 'KeyA') || padL, right: held('ArrowRight', 'KeyD') || padR,
    thrust: held('ArrowUp', 'KeyW') || !!p?.thrust, rev: held('ArrowDown', 'KeyS') || !!p?.rev,
    fire: held('Space') || !!p?.fire, bomb: held('KeyF', 'KeyB') || !!p?.bomb,
    burn: held('ShiftLeft', 'ShiftRight') || !!p?.burn,
    mine: pressed('KeyE') || (!!p?.mine && !was?.mine),
    hull: view.hull,
  };
}

function feed(parts: [string, string][]): void {
  view.feed.unshift({ parts, t: 7 });
  view.feed.length = Math.min(view.feed.length, 6);
}

/** Turns the zone's events into sound, sparks, the message feed and banners. */
function react(events: GameEvent[]): void {
  const p = me(), near = (x: number, y: number, r: number) => Math.hypot(p.x - x, p.y - y) < r;
  for (const e of events) {
    log.push(e);
    switch (e.type) {
      case 'shot': { const s = world.ships[e.ship]; if (e.ship === ME || near(s.x, s.y, 700)) (e.kind === 'bullet' ? sound.shoot() : sound.heavy()); break; }
      case 'hit': if (e.ship === ME) { if (!settings.calm) view.shake = Math.min(8, view.shake + e.amount / 60); sound.hit(); } break;
      case 'bounce': if (e.ship === ME) sound.bounce(); break;
      case 'burst':
        for (let i = 0; i < e.n; i++) { // sparks are only for the eye, so they use Math.random
          const a = Math.random() * Math.PI * 2, s = e.speed * (0.3 + Math.random() * 0.7);
          view.sparks.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * (e.n > 10 ? 0.7 : 0.25), col: PAINT[paintOf(e.owner)].main });
        }
        break;
      case 'blast':
        view.fx.push({ kind: 'blast', x: e.x, y: e.y, age: 0, life: 0.35, size: e.r, col: e.owner === ME ? PAINT[0].main : 0xffb070 });
        view.fx.push({ kind: 'boom', x: e.x, y: e.y, age: 0, life: 0.5, size: e.r * 1.6, col: 0 });
        if (near(e.x, e.y, 800)) sound.blast();
        break;
      case 'kill': {
        const v = world.ships[e.ship];
        if (e.ship === ME && view.tape.length > 4) view.replay = { frames: view.tape.slice(), t: 0, at: { x: v.x, y: v.y }, by: e.by };
        view.fx.push({ kind: 'boom', x: v.x, y: v.y, age: 0, life: 0.7, size: 50 + HULL_RADIUS[v.hull] * 4, col: 0 });
        if (near(v.x, v.y, 900)) sound.boom();
        if (e.by === ME) sound.kill();
        if (e.by >= 0 && e.bounty > 0 && (e.by === ME || near(v.x, v.y, 900))) view.pops.push({ text: `+${e.bounty}`, x: v.x, y: v.y, t: 1.6, color: GOLD_CSS });
        const col = (id: number) => (id === ME ? PAINT[0].css : world.ships[id].human ? '#ffffff' : PAINT[1].css);
        if (e.by >= 0) feed([[nameOf(e.by), col(e.by)], [' downed ', DIM_CSS], [nameOf(e.ship), col(e.ship)], [`  (${e.bounty})`, GOLD_CSS]]);
        else feed([[nameOf(e.ship), col(e.ship)], [' blew up', DIM_CSS]]);
        break;
      }
      case 'mine': if (e.ship === ME) sound.mine(); break;
      case 'salvage': {
        const sh = world.ships[e.ship];
        if (e.ship === ME) {
          sound.pickup(); view.picked = true;
          feed([[e.level < 0 ? 'Salvage: fully upgraded' : `Salvage: ${UP_NAME[e.kind]} ${e.level}`, '#c9a2ff']]);
        }
        if (e.ship === ME || near(sh.x, sh.y, 600)) view.pops.push({ text: e.level < 0 ? 'Full' : `${UP_SHORT[e.kind]} ${e.level}`, x: sh.x, y: sh.y, t: 1.2, color: e.ship === ME ? '#ffffff' : PAINT[1].css });
        break;
      }
    }
  }
}

let wasLow = false;
function updatePlay(dt: number): void {
  const input = myInput();
  sound.engine(me().alive && (input.thrust || input.rev), input.burn);
  if (input.left || input.right) view.turned = true;
  if (input.thrust && me().alive) view.thrustTime += dt;
  if (pressed('KeyV')) view.bigMap = !view.bigMap;
  if (net) {
    net.step(input, dt);
    if (net.world) world = net.world;
    react(net.drain());
    if (net.status === 'closed') { scene = 'net'; return; }
  } else {
    simStep(world, new Map([[ME, input]]), tune, dt);
    react(world.events); world.events = [];
  }
  // first-minute hints, taught by doing
  const p = me(), safe = inSafe(map(), p.x, p.y);
  const isLow = p.alive && p.energy < maxEnergy(p, tune) * tune.low_energy_warn;
  if (isLow && !wasLow) { sound.warn(); if (!view.lowTaught) { view.lowTaught = true; view.lowHint = 6; } }
  view.lowHint = Math.max(0, view.lowHint - dt);
  wasLow = isLow;
  view.hintT += dt;
  if (view.hint === 0 && view.thrustTime > 1.2 && view.turned) { view.hint = 1; view.hintT = 0; }
  if (view.hint === 1 && ((!safe && p.alive) || view.hintT > 25)) { view.hint = 2; view.hintT = 0; }
  if (view.hint === 2 && (view.picked || view.hintT > 35)) { view.hint = 3; view.hintT = 0; }
  if (view.hint === 3 && view.hintT > 10) { view.hint = 4; if (!settings.taught) { settings.taught = true; save(settings); } }
  for (const f of view.feed) f.t -= dt;
  view.feed = view.feed.filter(f => f.t > 0);
  if (view.banner) { view.banner.t -= dt; if (view.banner.t <= 0) view.banner = null; }
  view.shake = Math.max(0, view.shake - dt * 30);
  for (const s of view.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.95; s.vy *= 0.95; }
  view.sparks = view.sparks.filter(s => s.life > 0);
  // the death replay: a rolling tape of the last few seconds, played back while you wait to relaunch
  view.tapeT += dt;
  if (view.tapeT >= 1 / tune.replay_fps && p.alive) {
    view.tapeT = 0;
    view.tape.push({ ships: world.ships.map(sh => [sh.id, sh.x, sh.y, sh.a, sh.alive ? 1 : 0, HULLS.indexOf(sh.hull), sh.thrusting ? 1 : 0]),
      shots: world.shots.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, kind: b.kind, level: b.level })) });
    if (view.tape.length > tune.replay_seconds * tune.replay_fps) view.tape.shift();
  }
  if (view.replay) {
    view.replay.t += dt;
    if (p.alive || view.replay.t > view.replay.frames.length / tune.replay_fps / tune.replay_speed + 0.6 || pressed('Enter')) { view.replay = null; view.tape = []; }
  }
  for (const q of view.pops) { q.t -= dt; q.y -= dt * 40; }
  view.pops = view.pops.filter(q => q.t > 0);
  for (const f of view.fx) f.age += dt;
  view.fx = view.fx.filter(f => f.age < f.life);
  // the camera sits on your ship: you see as far ahead as behind
  if (p.alive) { view.cam.x = p.x; view.cam.y = p.y; }
}

/** The title menu, the settings list and the online join flow. */
const MENU = ['Play the zone offline (you and bots)', 'Join an online zone', 'Settings', 'How to play'] as const;
let menuAt = 0, setAt = 0, padMenuWas: PadState | null = null;
/** Menu keys from the keyboard or a pad: up, down, left, right, choose, back. */
function menuKeys(): { up: boolean; down: boolean; left: boolean; right: boolean; ok: boolean; back: boolean } {
  const p = readPad(), w = padMenuWas; padMenuWas = p;
  const edge = (k: keyof PadState) => !!p?.[k] && !w?.[k];
  return {
    up: pressed('ArrowUp') || pressed('KeyW') || edge('up'), down: pressed('ArrowDown') || pressed('KeyS') || edge('down'),
    left: pressed('ArrowLeft') || pressed('KeyA') || edge('left'), right: pressed('ArrowRight') || pressed('KeyD') || edge('right'),
    ok: pressed('Enter') || pressed('Space') || edge('a') || edge('start'), back: pressed('Escape') || pressed('Backspace') || edge('b'),
  };
}
const SETTINGS_ROWS = ['Volume', 'Camera zoom', 'Bot skill', 'Pilots (offline)', 'Call sign (online)', 'Zone address (online)', 'Reduce flashing', 'Gamepad steering', 'Back'] as const;
function settingText(i: number): string {
  const s = settings;
  return [`${Math.round(s.volume * 100)}%`, `${s.zoom.toFixed(2)}x`, SKILL_NAMES[s.skill], `${s.fleet} pilots`, s.name, s.server, s.calm ? 'On' : 'Off', s.aimSteer ? 'Aim: point the stick' : 'Turn: stick left / right', ''][i];
}
function changeSetting(i: number, d: number): void {
  const s = settings, c = config;
  const step2 = (v: number, e: { min: number; max: number; step: number }) => Math.round(Math.min(e.max, Math.max(e.min, v + d * e.step)) * 1000) / 1000;
  if (i === 0) { s.volume = step2(s.volume, c.volume); sound.volume = s.volume; sound.setMuted(sound.muted); }
  if (i === 1) s.zoom = step2(s.zoom, c.zoom);
  if (i === 2) s.skill = Math.min(2, Math.max(0, s.skill + d)) as Settings['skill'];
  if (i === 3) s.fleet = step2(s.fleet, c.pilots);
  if (i === 6) s.calm = !s.calm;
  if (i === 7) s.aimSteer = !s.aimSteer;
  save(s);
}
function editText(field: 'name' | 'server', max: number): void {
  typing = key => {
    if (key === 'Enter' || key === 'Escape') { typing = null; hit.clear(); save(settings); return; }
    if (key === 'Backspace') settings[field] = settings[field].slice(0, -1);
    else if (key.length === 1 && settings[field].length < max) settings[field] += key;
  };
}
function joinOnline(): void {
  net?.close();
  net = new NetSession(settings.server, settings.name);
  scene = 'net';
}

let simT = 0; // seconds since the page started, on the fixed step (drives title and figure animation)
const scenes: Record<string, { update(dt: number): void }> = {
  title: {
    update() {
      const k = menuKeys();
      if (k.up) menuAt = (menuAt + MENU.length - 1) % MENU.length;
      if (k.down) menuAt = (menuAt + 1) % MENU.length;
      if (!k.ok) return;
      if (menuAt === 0) { reset(); scene = 'play'; }
      else if (menuAt === 1) joinOnline();
      else if (menuAt === 2) { setAt = 0; scene = 'settings'; }
      else scene = 'help';
    },
  },
  settings: {
    update() {
      if (typing) return;
      const k = menuKeys();
      if (k.up) setAt = (setAt + SETTINGS_ROWS.length - 1) % SETTINGS_ROWS.length;
      if (k.down) setAt = (setAt + 1) % SETTINGS_ROWS.length;
      if (k.left) changeSetting(setAt, -1);
      if (k.right) changeSetting(setAt, 1);
      if (k.ok && (setAt === 6 || setAt === 7)) changeSetting(setAt, 1);
      else if (k.ok && setAt === 4) editText('name', 16);
      else if (k.ok && setAt === 5) editText('server', 80);
      else if (k.back || (k.ok && setAt === SETTINGS_ROWS.length - 1)) scene = 'title';
    },
  },
  help: { update() { const k = menuKeys(); if (k.ok || k.back) scene = 'title'; } },
  net: {
    update() {
      const k = menuKeys();
      if (!net || net.status === 'closed') { if (k.ok || k.back) { net?.close(); net = null; scene = 'title'; } return; }
      if (k.back) { net.close(); net = null; scene = 'title'; return; }
      if (net.status === 'online' && net.world && net.tune) {
        world = net.world; tune = { ...net.tune, zoom: settings.zoom, volume: settings.volume }; ME = net.you; newView(); scene = 'play';
      }
    },
  },
  play: {
    update(dt) {
      if (pressed('KeyP') || pressed('Escape') || (readPad()?.start && !padWas?.start)) { scene = 'pause'; return; }
      updatePlay(dt);
    },
  },
  pause: {
    update(dt) {
      if (net) updatePlay(dt); // an online zone never stops: you are still in it
      if (pressed('KeyP') || pressed('Escape')) scene = 'play';
      if (pressed('KeyQ')) { net?.close(); net = null; scene = 'title'; }
    },
  },
  figures: { update() { /* a still sheet of every figure */ } },
};
function step(): void {
  if (pressed('KeyM')) sound.setMuted(!sound.muted);
  simT += STEP;
  if (scene !== 'play') sound.engine(false, false);
  sound.ambient(scene === 'play' || scene === 'pause');
  scenes[scene].update(STEP);
  hit.clear();
}

// ---- Drawing --------------------------------------------------------------------------------
/** Text objects, reused frame to frame: each frame asks for what it shows, the rest hide. */
class Labels {
  private pool: Text[] = [];
  private used = 0;
  constructor(private layer: Container) {}
  begin(): void { this.used = 0; }
  end(): void { for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; }
  put(s: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right' = 'center', bold = false, alpha = 1): Text {
    let t = this.pool[this.used];
    if (!t) { t = new Text({ text: '', style: { fontFamily: FONT, fontSize: size, fill: color } }); this.layer.addChild(t); this.pool.push(t); }
    this.used++;
    if (t.text !== s) t.text = s;
    const weight: TextStyleFontWeight = bold ? 'bold' : 'normal';
    if (t.style.fontSize !== size) t.style.fontSize = size;
    if (t.style.fill !== color) t.style.fill = color;
    if (t.style.fontWeight !== weight) t.style.fontWeight = weight;
    t.anchor.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    t.position.set(Math.round(x), Math.round(y)); t.alpha = alpha; t.visible = true;
    return t;
  }
  width(s: string, size: number, bold = false): number { // measured with a scratch Text
    const t = this.put(s, -9999, -9999, size, '#000', 'left', bold); return t.width;
  }
}

// a fixed starfield in two parallax layers on black (background only, so it never touches the zone's rng)
const stars: { x: number; y: number; layer: number; b: number }[] = [];
{ let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 140; i++) stars.push({ x: r() * 1600, y: r() * 1600, layer, b: 0.35 + r() * 0.65 }); }

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const app = new Application();
  await app.init({ canvas, width: W, height: H, background: '#000000', resolution: Math.min(2, devicePixelRatio || 1), autoDensity: false, antialias: true, autoStart: false });
  const art = await loadArt();
  // Layers, back to front: stars, the tile walls, ground marks (trails, safe ring), the sprites
  // (pods, mines, ships), the lit layer (fire, flames, explosions), marks over ships, the bloom of
  // the lit layer, then the HUD (panels, radar, lines, text), then the overlays on top.
  const gb = new Graphics(), tiles = new TileLayer(), spriteLayer = new Container(), lit = new Container(), g = new Graphics(), fxLayer = new Container();
  const go = new Graphics(), panelLayer = new Container(), hud = new Graphics(), top = new Graphics(), topPanels = new Container(), topSprites = new Container();
  const textLayer = new Container(), topText = new Container(), topMarks = new Graphics();
  lit.addChild(g, fxLayer);
  const S = new SpritePool(spriteLayer, art), F = new SpritePool(fxLayer, art), TS = new SpritePool(topSprites, art), P = new PanelPool(panelLayer, art), TP = new PanelPool(topPanels, art);
  // the radar: the map picture, cropped to a square round you by a mask; and the full map overlay
  const radarBox = new Container(), radarPic = new Sprite(), radarMask = new Graphics();
  radarBox.addChild(radarPic); radarBox.mask = radarMask;
  const bigPic = new Sprite();
  let radarKey = '', radarTex: Texture | null = null;
  const radarFor = (): Texture => {
    const key = `${world.mapSeed}:${world.tiles}`;
    if (key !== radarKey) { radarTex?.destroy(true); radarTex = radarTexture(map()); radarKey = key; }
    return radarTex!;
  };
  /** A HUD panel: Kenney's notched glass panel, tinted to a dark steel. */
  const panel = (pool: PanelPool, x: number, y: number, w: number, h: number, alpha = 0.94, tint = 0x1c2440) => pool.put('panel', x, y, w, h, tint, alpha);
  // One bloom pass (art bible §8): only the lit layer is drawn again, at half resolution, blurred
  // and added on top, so fire, flames and blasts glow and the hulls stay crisp.
  const glowRT = RenderTexture.create({ width: W, height: H, resolution: 0.5 });
  const bloom = new Sprite(glowRT);
  bloom.filters = [new BlurFilter({ strength: 6, quality: 3 })];
  bloom.blendMode = 'add';
  // the Canvas 2D fallback (no WebGL) skips filters, so an unblurred copy would only double every colour
  bloom.visible = app.renderer.type !== RendererType.CANVAS;
  const radarBack = new Graphics();
  app.stage.addChild(gb, tiles.layer, spriteLayer, lit, go, bloom, panelLayer, radarBack, radarBox, radarMask, hud, textLayer, top, topPanels, bigPic, topMarks, topSprites, topText);
  const L = new Labels(textLayer), T = new Labels(topText);

  /** A ship sprite plus the marks over it: the low-energy ring. */
  function ship(pool: SpritePool, fx: SpritePool, marks: Graphics, hull: Hull, paint: Paint, X: number, Y: number, a: number, r: number, o: ShipSpriteLook = {}): void {
    shipSprite(pool, fx, hull, paint, X, Y, a, r, { ...o, calm: settings.calm });
    if (o.low) { // low energy: a dashed ring round the hull (a backup for the red HUD number)
      const ring: number[] = []; for (let i = 0; i < 16; i++) ring.push(X + Math.cos(i * Math.PI / 8) * r * 1.8, Y + Math.sin(i * Math.PI / 8) * r * 1.8);
      dashedPoly(marks, ring, 4, 4, 0xff5a6a, 1.5, settings.calm || Math.sin((o.t ?? 0) * 28) > -0.3 ? 0.9 : 0.3);
    }
  }

  /** Where the camera is, and how big the world is drawn. */
  let cam = { x: 0, y: 0, s: 1 };
  const toScreen = (x: number, y: number): [number, number] => {
    const sx = view.shake ? Math.sin(world.t * 90) * view.shake : 0;
    return [W / 2 + (x - cam.x) * cam.s + sx, H / 2 + (y - cam.y) * cam.s];
  };
  const on = (X: number, Y: number, m: number): boolean => X > -m && X < W + m && Y > -m && Y < H + m;

  function drawStars(cx: number, cy: number): void {
    for (const st of stars) {
      const par = [0.2, 0.45][st.layer];
      const x = (((st.x - cx * par) % 1600) + 1600) % 1600 - 160, y = (((st.y - cy * par) % 1600) + 1600) % 1600 - 440;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const sz = st.layer + 1;
      gb.rect(x, y, sz, sz).fill({ color: st.layer ? 0xe0e4ff : 0x8a96c8, alpha: st.b * (st.layer ? 0.8 : 0.5) });
    }
  }
  function drawMap(): void {
    drawStars(cam.x, cam.y);
    tiles.draw(map(), `${world.mapSeed}:${world.tiles}`, cam.x, cam.y, cam.s, W, H, W / 2 + (view.shake ? Math.sin(world.t * 90) * view.shake : 0), H / 2);
  }

  /** Bullets: bright pinpoints with a short tail, coloured by gun level. Bombs: glowing orbs. */
  function shot(kind: ShotKind, level: number, x: number, y: number, vx: number, vy: number, s: number, t: number): void {
    if (kind === 'bullet') {
      const col = BULLET_COL[level] ?? BULLET_COL[1];
      g.moveTo(x, y).lineTo(x - vx * 0.022 * s, y - vy * 0.022 * s).stroke({ width: 2, color: col, alpha: 0.55, cap: 'round' });
      g.circle(x, y, 2.2 * s).fill(0xffffff);
      F.put('glint', x, y, 0, 12 * s, { add: true, tint: col, alpha: 0.9 });
    } else {
      const col = BOMB_COL[level] ?? BOMB_COL[1], pulse = 0.85 + 0.15 * Math.sin(t * 30);
      F.put('glint', x, y, t * 6, 30 * s * pulse, { add: true, tint: col });
      g.circle(x, y, 4 * s).fill(col); g.circle(x, y, 2 * s).fill(0xffffff);
    }
  }

  function drawZone(): void {
    const t = world.t, s = cam.s, m = map();
    drawMap();
    { // the safe zone's edge: a slow dashed ring, so you can tell where shots stop
      const [X, Y] = toScreen((m.centre + 0.5) * TILE, (m.centre + 0.5) * TILE), R = m.safeR * TILE * s;
      if (on(X, Y, R + 20)) {
        const ring: number[] = []; for (let i = 0; i < 48; i++) ring.push(X + Math.cos(i * Math.PI / 24 + t * 0.05) * R, Y + Math.sin(i * Math.PI / 24 + t * 0.05) * R);
        dashedPoly(gb, ring, 8, 10, SAFE_COL, 1.5, 0.35);
      }
    }
    for (const v of world.salvage) { // salvage: a slowly turning pod; it blinks for its last five seconds
      const [X, Y] = toScreen(v.x, v.y); if (!on(X, Y, 30)) continue;
      const fading = tune.salvage_life - v.age < 5 && Math.sin(t * 14) < 0;
      F.put('glint', X, Y, 0, 40 * s * (0.85 + 0.15 * Math.sin(t * 4 + v.id)), { add: true, tint: 0xb98cff, alpha: settings.calm ? 0.5 : 0.75 });
      S.put('salvage', X, Y, t * 0.6 + v.id, 22 * s, { alpha: fading ? 0.35 : 1 });
    }
    for (const mn of world.mines) { const [X, Y] = toScreen(mn.x, mn.y); if (on(X, Y, 30)) mineSprite(S, F, paintOf(mn.owner), mn.age >= tune.mine_arm, X, Y, s, t, settings.calm); }
    for (const b of world.shots) { const [X, Y] = toScreen(b.x, b.y); if (on(X, Y, 30)) shot(b.kind, b.level, X, Y, b.vx, b.vy, s, t); }
    for (const f of view.fx) {
      const [X, Y] = toScreen(f.x, f.y); if (!on(X, Y, f.size * s * 2)) continue;
      const k = f.age / f.life;
      if (f.kind === 'boom') boomSprite(F, X, Y, f.size * s, f.age, f.life);
      else { // a blast: the splash radius flashes as a ring, so you learn how far a bomb reaches
        g.circle(X, Y, f.size * s * (0.4 + 0.6 * k)).stroke({ width: 3 * (1 - k) + 1, color: f.col, alpha: 0.8 * (1 - k) });
        if (!settings.calm) g.circle(X, Y, f.size * s * 0.5 * (1 - k)).fill({ color: 0xffffff, alpha: 0.25 * (1 - k) });
      }
    }
    for (const p of view.sparks) {
      const [X, Y] = toScreen(p.x, p.y); if (!on(X, Y, 10)) continue;
      g.moveTo(X, Y).lineTo(X - p.vx * 0.03 * s, Y - p.vy * 0.03 * s).stroke({ width: 1.5, color: p.life > 0.3 ? 0xffffff : p.col, alpha: Math.min(1, p.life * 2), cap: 'round' });
    }
    const wanted = mostWanted();
    for (const sh of world.ships) {
      if (!sh.alive) continue;
      const [X, Y] = toScreen(sh.x, sh.y);
      if (!on(X, Y, 60)) continue;
      const r = HULL_RADIUS[sh.hull] * s, maxE = maxEnergy(sh, tune);
      ship(S, F, go, sh.hull, paintOf(sh.id), X, Y, sh.a, r, { thrust: sh.thrusting, burn: sh.burning, t, flash: sh.flash > 0, shield: sh.shield > 0, low: sh.energy < maxE * tune.low_energy_warn });
      if (sh.id === ME) continue;
      // the name tag under every other ship: who, and what it is worth
      const col = sh.id === wanted ? GOLD_CSS : sh.human ? '#ffffff' : '#ffc79a';
      L.put(`${sh.name} (${sh.bounty})`, X, Y + r * 2 + 8, 12, col, 'center', sh.id === wanted);
    }
    for (const q of view.pops) { const [X, Y] = toScreen(q.x, q.y); if (on(X, Y, 80)) L.put(q.text, X, Y - 30, 14, q.color, 'center', true, Math.min(1, q.t * 2)); }
  }

  /** A grid sector name for a spot (columns A to T, rows 1 to 20), to call out where things are. */
  const sector = (x: number, y: number) => `${String.fromCharCode(65 + Math.min(19, Math.floor((x / world.size) * 20)))}${Math.min(20, Math.floor((y / world.size) * 20) + 1)}`;

  function drawRadar(): void {
    const R = 220, rx = W - R - 14, ry = H - R - 14, span = 2600, k = R / span, p = me();
    panel(P, rx - 6, ry - 30, R + 12, R + 36, 0.9);
    radarBack.rect(rx, ry, R, R).fill({ color: 0x000000, alpha: 0.85 });
    radarPic.texture = radarFor(); radarPic.visible = true;
    radarPic.scale.set(k * TILE);
    radarPic.position.set(rx + R / 2 - cam.x * k, ry + R / 2 - cam.y * k);
    radarMask.clear().rect(rx, ry, R, R).fill(0xffffff);
    const inR = (x: number, y: number) => x >= rx && x <= rx + R && y >= ry && y <= ry + R;
    const at = (x: number, y: number): [number, number] => [rx + R / 2 + (x - cam.x) * k, ry + R / 2 + (y - cam.y) * k];
    for (const v of world.salvage) { const [X, Y] = at(v.x, v.y); if (inR(X, Y)) hud.rect(X - 1, Y - 1, 2, 2).fill(0xc9a2ff); }
    const wanted = mostWanted();
    for (const sh of world.ships) {
      if (!sh.alive || sh.id === ME) continue;
      const [X, Y] = at(sh.x, sh.y); if (!inR(X, Y)) continue;
      hud.rect(X - 1.5, Y - 1.5, 3, 3).fill(sh.human ? 0xffffff : PAINT[1].main);
      if (sh.id === wanted) hud.circle(X, Y, 5).stroke({ width: 1, color: GOLD });
    }
    if (p.alive) blip(hud, rx + R / 2, ry + R / 2, p.a, 5, PAINT[0].main);
    hud.rect(rx + R / 2 - (W / cam.s) * k / 2, ry + R / 2 - (H / cam.s) * k / 2, (W / cam.s) * k, (H / cam.s) * k).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
    L.put(sector(p.x, p.y), rx, ry - 15, 14, TEXT_CSS, 'left', true);
    L.put('V: full map', rx + R, ry - 15, 12, DIM_CSS, 'right');
  }

  function drawBigMap(): void {
    const S2 = 600, mx = W / 2 - S2 / 2, my = H / 2 - S2 / 2 + 10, k = S2 / world.size, p = me();
    panel(TP, mx - 12, my - 40, S2 + 24, S2 + 52, 0.95);
    top.rect(mx, my, S2, S2).fill({ color: 0x000000, alpha: 0.95 });
    bigPic.texture = radarFor(); bigPic.visible = true;
    bigPic.scale.set(S2 / world.tiles); bigPic.position.set(mx, my);
    const at = (x: number, y: number): [number, number] => [mx + x * k, my + y * k];
    for (let i = 1; i < 20; i++) { // the sector grid
      topMarks.moveTo(mx + (S2 * i) / 20, my).lineTo(mx + (S2 * i) / 20, my + S2).moveTo(mx, my + (S2 * i) / 20).lineTo(mx + S2, my + (S2 * i) / 20);
    }
    topMarks.stroke({ width: 1, color: 0xffffff, alpha: 0.06 });
    for (const v of world.salvage) { const [X, Y] = at(v.x, v.y); topMarks.rect(X - 1, Y - 1, 2, 2).fill(0xc9a2ff); }
    const wanted = mostWanted();
    for (const sh of world.ships) {
      if (!sh.alive || sh.id === ME) continue;
      const [X, Y] = at(sh.x, sh.y);
      topMarks.rect(X - 2, Y - 2, 4, 4).fill(sh.human ? 0xffffff : PAINT[1].main);
      if (sh.id === wanted) { topMarks.circle(X, Y, 7).stroke({ width: 1.5, color: GOLD }); T.put(`${sh.name} ${sh.bounty}`, X + 9, Y, 12, GOLD_CSS, 'left', true); }
    }
    if (p.alive) { const [X, Y] = at(p.x, p.y); blip(topMarks, X, Y, p.a, 7, PAINT[0].main); }
    T.put(`Zone map  ·  you are in ${sector(p.x, p.y)}`, mx, my - 20, 16, '#ffffff', 'left', true);
    T.put('V to close', mx + S2, my - 20, 14, DIM_CSS, 'right');
  }

  function drawHUD(): void {
    const p = me(), m = map();
    // top right: energy, big, with its bar; bounty and points under it
    const ew = 230, ex = W - ew - 18, ey = 14;
    const maxE = maxEnergy(p, tune), ef = p.alive ? Math.max(0, p.energy / maxE) : 0, low = p.alive && ef < tune.low_energy_warn;
    panel(P, ex - 12, ey - 6, ew + 24, 112);
    L.put('ENERGY', ex, ey + 16, 13, DIM_CSS, 'left', true);
    L.put(`${Math.max(0, Math.round(p.alive ? p.energy : 0))}`, ex + ew, ey + 16, 30, low ? '#ff5a6a' : '#cdeeff', 'right', true);
    hud.rect(ex, ey + 38, ew, 8).fill(0x0d1224);
    hud.rect(ex, ey + 38, ew * ef, 8).fill(low ? 0xff5a6a : PAINT[0].main);
    const tx = ex + ew * tune.low_energy_warn; // the low-energy mark
    hud.moveTo(tx, ey + 35).lineTo(tx, ey + 49).stroke({ width: 1.5, color: low ? 0xff5a6a : 0x6a7498 });
    L.put(`Bounty ${p.alive ? p.bounty : 0}`, ex, ey + 64, 16, GOLD_CSS, 'left', true);
    L.put(HULL_NAME[p.hull], ex + ew, ey + 64, 15, TEXT_CSS, 'right');
    L.put(`Points ${p.points}   Kills ${p.kills}   Deaths ${p.deaths}`, ex, ey + 88, 13, DIM_CSS, 'left');
    // right column: this life's salvage, one row per upgrade
    if (p.alive) {
      const ux = W - 168, uy = ey + 122;
      panel(P, ux - 10, uy - 4, 160, UPGRADES.length * 19 + 12);
      UPGRADES.forEach((k, i) => {
        const lv = p.up[i] ?? 0, cap = tune[`up_${k}_max`], y0 = uy + 12 + i * 19;
        L.put(UP_SHORT[k], ux, y0, 12, lv ? '#e8d8ff' : '#535c80', 'left', lv > 0);
        for (let j = 0; j < cap; j++) hud.rect(ux + 70 + j * 13, y0 - 4, 10, 8).fill({ color: j < lv ? 0xb98cff : 0x262d48 });
      });
    }
    // top left: the zone
    const people = world.ships.filter(s => s.human).length;
    panel(P, 8, 6, 300, 52);
    L.put(`${TITLE}  ·  free-for-all`, 20, 22, 15, '#ffffff', 'left', true);
    L.put(`${world.ships.length} pilots, ${people} ${people === 1 ? 'person' : 'people'}  ·  Tab: scores`, 20, 42, 13, DIM_CSS, 'left');
    if (net) L.put(`online  ·  ${net.ping} ms`, 20, 72, 13, DIM_CSS, 'left');
    // in the safe zone: say so, it explains why nothing fires
    if (p.alive && inSafe(m, p.x, p.y)) L.put('SAFE ZONE  ·  no fire in or out  ·  energy refills', W / 2, 26, 15, SAFE_CSS, 'center', true);
    else if (p.alive && p.shield > 0) L.put(`Spawn shield ${p.shield.toFixed(1)} s`, W / 2, 26, 15, SAFE_CSS, 'center', true);
    // bottom left: the message feed, newest at the bottom
    view.feed.slice().reverse().forEach((f, i, all) => {
      const y = H - 24 - (all.length - 1 - i) * 20, al = Math.min(1, f.t);
      let x = 16;
      for (const [s, c] of f.parts) { L.put(s, x, y, 14, c, 'left', c !== DIM_CSS, al); x += L.width(s, 14, c !== DIM_CSS); }
    });
    drawRadar();
    // the first-minute hint
    const hints = [
      'Arrows or W A S D: turn and thrust. Nothing slows you: turn around and thrust to stop.',
      'Leave the safe zone through a gap in its wall. Space fires guns, F or B fires a bomb.',
      'Fly over glowing salvage for upgrades. Pickups and kills raise your bounty.',
      'Shift afterburns, E lays a mine. Tab shows scores, V the full map. The safe zone stops all fire.',
    ];
    const hs = view.lowHint > 0 ? 'Low energy: ease off the trigger, or fly back to the safe zone to recharge.' : hints[view.hint];
    if (hs && p.alive) {
      const w = L.width(hs, 16) + 36;
      panel(P, W / 2 - w / 2, H - 112, w, 36);
      L.put(hs, W / 2, H - 94, 16, '#e6f6ff');
    }
    if (sound.muted) L.put('Muted', W - 20, H - 268, 13, DIM_CSS, 'right');
  }

  /** The death replay: the last seconds before you went down, slowed, centred where it happened. */
  function drawReplay(r: NonNullable<View['replay']>): void {
    const f = r.frames[Math.min(r.frames.length - 1, Math.floor(r.t * tune.replay_fps * tune.replay_speed))];
    for (const b of f.shots) { const [X, Y] = toScreen(b.x, b.y); if (on(X, Y, 20)) shot(b.kind, b.level, X, Y, b.vx, b.vy, cam.s, simT); }
    for (const row of f.ships) {
      const [id, x, y, a, alive, hull, thr] = row;
      if (!alive) continue;
      const [X, Y] = toScreen(x, y); if (!on(X, Y, 60)) continue;
      const h = HULLS[hull], r2 = HULL_RADIUS[h] * cam.s;
      ship(S, F, go, h, paintOf(id), X, Y, a, r2, { thrust: thr === 1, t: simT });
      if (id === r.by || id === ME) L.put(nameOf(id), X, Y + r2 * 2 + 10, 13, id === ME ? PAINT[0].css : PAINT[1].css, 'center', true);
    }
    const by = r.by >= 0 ? world.ships[r.by] : undefined;
    top.rect(0, 0, W, 120).fill({ color: 0x000000, alpha: 0.6 });
    top.rect(0, H - 90, W, 90).fill({ color: 0x000000, alpha: 0.6 });
    T.put('Replay', W / 2, 44, 28, '#ffffff', 'center', true);
    T.put(by ? `${by.name} downed you (${HULL_NAME[by.hull]})` : 'You blew up', W / 2, 82, 18, TEXT_CSS);
    T.put(`Next launch: ${HULL_NAME[view.hull]}  ·  1 2 3 to change  ·  Enter to skip`, W / 2, H - 36, 16, '#aab4d4');
    const fr = (r.t * tune.replay_fps * tune.replay_speed) / r.frames.length;
    top.rect(W / 2 - 160, H - 66, 320, 4).fill({ color: 0x2f3757 });
    top.rect(W / 2 - 160, H - 66, 320 * Math.min(1, fr), 4).fill({ color: 0xffffff, alpha: 0.8 });
  }

  function drawOverlays(): void {
    const p = me();
    if (view.banner && p.alive && !held('Tab')) {
      const b = view.banner;
      T.put(b.text, W / 2, 140, 26, b.color ?? '#ffffff', 'center', true, Math.min(1, b.t * 2));
    }
    if (p.alive) { if (view.bigMap) drawBigMap(); return; }
    if (view.replay) return; // drawn as the zone itself
    top.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.7 });
    T.put('Destroyed', W / 2, 150, 44, PAINT[0].css, 'center', true);
    const by = p.lastHitBy >= 0 && p.lastHitBy !== ME ? world.ships[p.lastHitBy] : undefined;
    T.put(by ? `by ${by.name}, flying a ${HULL_NAME[by.hull]}` : 'by your own hand', W / 2, 196, 18, TEXT_CSS);
    T.put(`Relaunch in ${Math.max(0, p.respawn).toFixed(1)} s from the safe zone  ·  pick your hull`, W / 2, 236, 20, '#aab4d4');
    HULLS.forEach((h, i) => {
      const x = W / 2 - 300 + i * 300, y = 380, sel = view.hull === h;
      panel(TP, x - 130, y - 80, 260, 170, 0.95, sel ? 0x1f5a86 : 0x1c2440);
      ship(TS, TS, top, h, 0, x, y - 20, -Math.PI / 2, HULL_RADIUS[h] * 2.2, { t: simT, thrust: sel });
      T.put(`${i + 1}  ${HULL_NAME[h]}`, x, y + 44, 18, sel ? '#ffffff' : '#aab4d4', 'center', true);
      T.put(HULL_ROLE[h], x, y + 66, 13, DIM_CSS);
    });
  }

  function drawTitle(): void {
    const t = simT, m = map();
    // behind the menu: the zone itself, drifting slowly past
    const c = (m.centre + 0.5) * TILE;
    cam = { x: c + Math.cos(t * 0.03) * 1400, y: c + Math.sin(t * 0.023) * 900, s: 0.75 };
    drawMap();
    top.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });
    TS.put('ship_lancer_0', W / 2 - 300, 150, 0.6 + Math.sin(t) * 0.08, 64);
    TS.put('ship_bulwark_1', W / 2 + 300, 150, -0.6 + Math.sin(t * 1.3) * 0.08, 64);
    T.put(TITLE, W / 2, 230, 72, '#ffffff', 'center', true);
    T.put('Every pilot for themselves. Grab salvage, run up a bounty, collect everyone else\'s.', W / 2, 286, 20, '#aab4d4');
    MENU.forEach((mn, i) => {
      const y = 380 + i * 54, sel = i === menuAt;
      panel(TP, W / 2 - 300, y - 23, 600, 46, sel ? 0.95 : 0.7, sel ? 0x1f5a86 : 0x1c2440);
      T.put(mn, W / 2, y, 23, sel ? '#ffffff' : '#aab4d4', 'center', sel);
    });
    T.put('Up / Down to choose, Enter to go  ·  a gamepad works too', W / 2, H - 70, 16, DIM_CSS);
    T.put('Every other ship is a bot, named as a bot, until people join.', W / 2, H - 42, 16, DIM_CSS);
  }

  function drawFigures(): void {
    const t = simT;
    cam = { x: 0, y: 0, s: 1 };
    drawStars(0, 0);
    L.put('Beacon Wars: every figure', W / 2, 40, 26, '#ffffff', 'center', true);
    HULLS.forEach((h, i) => {
      for (const pt of [0, 1] as Paint[]) {
        const x = 140 + i * 150, y = 150 + pt * 150;
        ship(S, F, go, h, pt, x, y, -Math.PI / 2, HULL_RADIUS[h] * 2, { t, thrust: true });
        L.put(`${HULL_NAME[h]} (${pt ? 'foe' : 'you'})`, x, y + 56, 14, PAINT[pt].css);
      }
    });
    ship(S, F, go, 'dart', 1, 640, 150, -Math.PI / 2, HULL_RADIUS.dart * 2, { t, low: true });
    L.put('Low energy', 640, 206, 14, PAINT[1].css);
    ship(S, F, go, 'lancer', 0, 640, 300, -Math.PI / 2, HULL_RADIUS.lancer * 2, { t, shield: true });
    L.put('Spawn shield', 640, 356, 14, SAFE_CSS);
    S.put('salvage', 800, 150, t * 0.6, 30); F.put('glint', 800, 150, 0, 52, { add: true, tint: 0xb98cff, alpha: 0.75 });
    L.put('Salvage pod', 800, 206, 14, '#c9a2ff');
    mineSprite(S, F, 1, true, 800, 300, 1.6, t, settings.calm); L.put('Mine', 800, 356, 14, PAINT[1].css);
    for (let lv = 1; lv <= 3; lv++) {
      shot('bullet', lv, 960 + lv * 60, 150, 470, 0, 1.6, t);
      shot('bomb', lv, 960 + lv * 60, 300, 400, 0, 1.6, t);
    }
    L.put('Bullets, levels 1 to 3', 1080, 206, 14, TEXT_CSS);
    L.put('Bombs, levels 1 to 3', 1080, 356, 14, TEXT_CSS);
  }

  function drawSettings(): void {
    drawStars(simT * 20, 0);
    L.put('Settings', W / 2, 90, 48, '#ffffff', 'center', true);
    SETTINGS_ROWS.forEach((r, i) => {
      const y = 170 + i * 54, sel = i === setAt;
      panel(P, W / 2 - 380, y - 24, 760, 48, sel ? 0.95 : 0.5, sel ? 0x1f5a86 : 0x1c2440);
      L.put(r, W / 2 - 350, y, 22, sel ? '#ffffff' : '#aab4d4', 'left', sel);
      const v = settingText(i) + (typing && sel ? '_' : '');
      L.put(v, W / 2 + 350, y, 22, sel ? PAINT[0].css : TEXT_CSS, 'right', true);
    });
    const tip = typing ? 'Type, then Enter to keep it' : setAt >= 4 && setAt <= 5 ? 'Enter to type' : 'Left / Right to change  ·  Esc to go back';
    L.put(tip, W / 2, H - 50, 18, DIM_CSS);
  }
  function drawHelp(): void {
    drawStars(simT * 20, 0);
    L.put('How to play', W / 2, 64, 44, '#ffffff', 'center', true);
    const lines = [
      'Your ship drifts: nothing slows it. Turn to face somewhere new and thrust; turn around and thrust to stop.',
      'Walls bounce you off, a little slower. Guns fire small fast bullets; bombs burst and hurt everyone near.',
      'Energy is your shield and your ammo. Guns, bombs, mines and the afterburner spend it; it refills on its own.',
      'At zero energy you are destroyed, and you relaunch from the safe zone in the middle a few seconds later.',
      'In the safe zone nobody can shoot or be shot. Leave it through the gaps in its wall.',
      'It is a free-for-all: every other ship is a target. Fly over glowing salvage pods for upgrades.',
      'Pickups and kills raise your bounty. Whoever downs you collects it as points, and your upgrades are lost.',
    ];
    lines.forEach((l, i) => L.put(l, W / 2, 130 + i * 36, 17, TEXT_CSS));
    CONTROLS.forEach((c, i) => L.put(c, W / 2, 420 + i * 32, 16, '#aab4d4'));
    L.put('Gamepad: point the stick to steer, A thrusts, X fires, RB fires a bomb, LB afterburns, B lays a mine', W / 2, 540, 15, DIM_CSS);
    L.put('Ship and effect art: our own and Kenney (kenney.nl), CC0', W / 2, 600, 14, DIM_CSS);
    L.put('Enter to go back', W / 2, H - 50, 20, PAINT[0].css, 'center', true);
  }
  function drawNet(): void {
    drawStars(simT * 20, 0);
    L.put('Online zone', W / 2, 200, 44, '#ffffff', 'center', true);
    if (!net || net.status === 'closed') {
      L.put(net?.reason || 'Not connected.', W / 2, 300, 22, '#ff8a96');
      L.put('Start a zone with "npm run server", or set its address in Settings.', W / 2, 350, 18, '#aab4d4');
      L.put('Enter to go back', W / 2, H - 80, 22, PAINT[0].css, 'center', true);
    } else {
      L.put(`Connecting to ${settings.server} as ${settings.name}...`, W / 2, 300, 22, TEXT_CSS);
      L.put('Esc to cancel', W / 2, H - 80, 20, DIM_CSS);
    }
  }
  /** Everyone in one list, by points: the free-for-all table. Long lists split into two columns. */
  function drawScoreboard(): void {
    const rows = world.ships.slice().sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths);
    const per = 18, cols = rows.length > per ? 2 : 1, cw = 520, w = cols * cw + 40, x0 = W / 2 - w / 2;
    panel(TP, x0, 90, w, 110 + Math.min(per, rows.length) * 24, 0.96);
    T.put('Scores', W / 2, 118, 24, '#ffffff', 'center', true);
    for (let c = 0; c < cols; c++) {
      const x = x0 + 24 + c * cw;
      const head: [string, number][] = [['#', 0], ['Pilot', 30], ['Ship', 220], ['Points', 300], ['Bounty', 370], ['K', 445], ['D', 480]];
      for (const [h, dx] of head) T.put(h, x + dx, 156, 13, DIM_CSS, 'left');
      rows.slice(c * per, (c + 1) * per).forEach((sh, i) => {
        const y = 182 + i * 24, n = c * per + i + 1, mine = sh.id === ME, col = mine ? PAINT[0].css : sh.human ? '#ffffff' : '#aab4d4';
        if (mine) topMarks.rect(x - 8, y - 11, cw - 20, 22).fill({ color: PAINT[0].main, alpha: 0.12 });
        T.put(`${n}`, x, y, 14, col, 'left');
        T.put(mine ? `${sh.name}` : sh.name, x + 30, y, 14, col, 'left', mine);
        T.put(HULL_NAME[sh.hull], x + 220, y, 14, col, 'left');
        T.put(`${sh.points}`, x + 300, y, 14, col, 'left', true);
        T.put(sh.alive ? `${sh.bounty}` : '-', x + 370, y, 14, sh.alive && sh.bounty >= tune.bounty_start * 4 ? GOLD_CSS : col, 'left');
        T.put(`${sh.kills}`, x + 445, y, 14, col, 'left'); T.put(`${sh.deaths}`, x + 480, y, 14, col, 'left');
      });
    }
  }

  function draw(): void {
    look.calm = settings.calm;
    bloom.alpha = settings.calm ? 0.4 : 0.85;
    g.clear(); gb.clear(); go.clear(); hud.clear(); radarBack.clear(); top.clear(); topMarks.clear(); radarMask.clear();
    L.begin(); T.begin(); S.begin(); F.begin(); TS.begin(); P.begin(); TP.begin();
    radarPic.visible = false; bigPic.visible = false; tiles.hide();
    if (scene === 'title') drawTitle();
    else if (scene === 'settings') drawSettings();
    else if (scene === 'help') drawHelp();
    else if (scene === 'net') drawNet();
    else if (scene === 'figures') drawFigures();
    else {
      const r = !me().alive ? view.replay : null;
      if (r) { // the replay: the zone as it was, round where you went down
        cam = { x: r.at.x, y: r.at.y, s: tune.zoom };
        drawMap(); drawReplay(r);
      } else {
        cam = { x: view.cam.x, y: view.cam.y, s: tune.zoom };
        drawZone(); drawHUD();
      }
      drawOverlays();
      if (scene === 'pause') {
        top.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
        T.put('Paused', W / 2, H / 2 - 20, 48, '#ffffff', 'center', true);
        T.put(net ? 'P to carry on (the zone keeps going)  ·  Q to leave the zone  ·  M to mute' : 'P to carry on  ·  Q to quit to the menu  ·  M to mute', W / 2, H / 2 + 30, 20, '#aab4d4');
      }
      if (held('Tab') && scene === 'play') drawScoreboard();
    }
    L.end(); T.end(); S.end(); F.end(); TS.end(); P.end(); TP.end();
    if (bloom.visible) app.renderer.render({ container: lit, target: glowRT, clear: true });
  }
  function fit(): void {
    const k = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${Math.round(W * k)}px`; canvas.style.height = `${Math.round(H * k)}px`;
    canvas.style.marginTop = `${Math.max(0, Math.floor((innerHeight - H * k) / 2))}px`;
  }

  // ---- Loop: PixiJS's ticker, fixed step, frame time clamped --------------------------------
  let acc = 0, lastFrame = clock.now();
  app.ticker.add(t => {
    lastFrame = clock.now();
    if (!manual) {
      acc += Math.min(t.deltaMS / 1000, 0.25); // a stall never fast-forwards the game
      while (acc >= STEP) { step(); acc -= STEP; }
    }
    draw();
  });
  install({
    get scene() { return scene; },
    get state() { return world; },
    press(code) { hit.add(code); },
    hold(code, on2) { if (on2) down.add(code); else down.delete(code); },
    get events() { return log; },
    step(n = 1) {
      // the steps run back to back and the screen is drawn once at the end: the bloom pass is the
      // slow part of a frame on a software renderer, and a check only looks at the last one
      for (let i = 0; i < n; i++) step();
      draw(); app.render();
    },
  });
  addEventListener('resize', fit); fit();
  draw(); app.render();
  if (manual) return;
  app.ticker.start();
  setInterval(() => {
    if (document.visibilityState === 'visible' && clock.now() - lastFrame > 0.1) app.ticker.update();
  }, 50);
}

reset();
const asked = params.get('scene');
scene = asked && asked in scenes ? asked : 'title';
void start();
