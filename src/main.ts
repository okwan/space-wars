// The page: input, sound, scenes, camera and HUD, drawn with PixiJS. The rules are in game/
// (pure, deterministic, server-ready); the look is in render/art.ts; what the checks drive is
// in hook.ts. Implements design/game-brief.md.

import { Application, BlurFilter, Container, Graphics, RenderTexture, RendererType, Sprite, Text, type TextStyleFontWeight } from 'pixi.js';
import config from '../data/config.json';
import { Sound } from './audio';
import { aimTurn, readPad, type PadState } from './gamepad';
import { NetSession } from './net/client';
import { apply, load, save, SKILL_NAMES, type Settings } from './settings';
import { dist, wd, wrap } from './game/math';
import { skipBreak, startRound, step as simStep, STEP } from './game/sim';
import { tuningFrom } from './game/tuning';
import { maxEnergy } from './game/salvage';
import { HULL_RADIUS, HULLS, UPGRADES, WEAPONS, type Upgrade, type GameEvent, type Ship, type ShipInput, type Team, type World } from './game/types';
import { gate, newWorld } from './game/world';
import { clock, install, manual, params, seedFrom } from './hook';
import {
  arrow, blip, dashedPoly, dashedRing, drawTrail, look, diamond, drawBeacon, pts, TEAM_GLYPH,
  HULL_NAME, HULL_ROLE, INK, ownerColor, ownerCss, TEAM, WEAPON_NAME, WEAPON_ROLE,
} from './render/art';
import { Backdrop, beaconSprite, boomSprite, loadArt, mineSprite, PanelPool, rockSprite, shipSprite, shotSprite, SpritePool, type ShipSpriteLook } from './render/sprites';

const base = tuningFrom(config);
let settings: Settings = load(base);
let tune = apply(base, settings);
const W = 1280, H = 720;
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';
const TITLE = 'Beacon Wars';
let ME = 0; // the local player's ship id (online, the seat the server gave)
let net: NetSession | null = null;
const CONTROLS = [
  'Left / Right (or A / D): turn     Up (or W): thrust     Down (or S): reverse',
  'Space: fire     Shift: afterburn     E: drop a mine',
  'While respawning: 1 / 2 / 3 pick a hull, Z / X / C pick a weapon',
  'Tab: scoreboard     P: pause     M: mute',
];

// ---- Input: keys by position (event.code), OS key repeat ignored ------------------------
const down = new Set<string>(), hit = new Set<string>();
const pressed = (code: string): boolean => hit.has(code);
addEventListener('keydown', e => { if (e.code === 'Tab') e.preventDefault(); });
const held = (...codes: string[]): boolean => codes.some(c => down.has(c));
const sound = new Sound(settings.volume);
let typing: ((key: string) => void) | null = null; // a text field taking keys
addEventListener('keydown', e => {
  sound.start();
  if (typing) { typing(e.key); e.preventDefault(); return; }
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('pointerup', () => sound.start());
addEventListener('blur', () => down.clear());

// ---- The session: the zone plus what only this screen needs ------------------------------
interface Spark { x: number; y: number; vx: number; vy: number; life: number; team: Team }
interface Fx { kind: 'boom' | 'impact'; x: number; y: number; age: number; life: number; size: number; team: Team }
interface FeedLine { a: string; at: Team; b: string; bt: Team | -1; t: number }
/** One frame of the death replay: where ships and shots were (ships: id, x, y, a, alive, team, hull index, thrust). */
interface TapeFrame { ships: number[][]; shots: { x: number; y: number; vx: number; vy: number; team: Team; kind: Ship['weapon'] }[] }
/** A word that floats up from a ship: a pickup or a bounty paid. */
interface Pop { text: string; x: number; y: number; t: number; color: string }
/** What each salvage upgrade is called on screen. */
const UP_NAME: Record<Upgrade, string> = { cells: 'Energy cells', regen: 'Recharge', engine: 'Engines', turn: 'Thrusters', guns: 'Gun power', bounce: 'Bouncing shots', spread: 'Side guns', mines: 'Extra mine' };
const UP_SHORT: Record<Upgrade, string> = { cells: 'CEL', regen: 'RCH', engine: 'ENG', turn: 'THR', guns: 'GUN', bounce: 'BNC', spread: 'SID', mines: 'MIN' };
const GOLD = '#ffd88a';
interface View {
  cam: { x: number; y: number }; shake: number; sparks: Spark[]; fx: Fx[]; feed: FeedLine[]; pops: Pop[];
  tape: TapeFrame[]; tapeT: number; replay: { frames: TapeFrame[]; t: number; at: { x: number; y: number }; by: number } | null;
  banner: { text: string; t: number; team?: Team } | null;
  hint: number; hintT: number; lowHint: number; lowTaught: boolean; thrustTime: number; turned: boolean;
  loadout: { hull: Ship['hull']; weapon: Ship['weapon'] };
}
let scene = '', world: World, view: View;
const log: GameEvent[] = []; // window.game.events
function newView(): void {
  const me = world.ships[ME];
  view = {
    cam: { x: me.x, y: me.y }, shake: 0, sparks: [], fx: [], feed: [], pops: [], tape: [], tapeT: 0, replay: null, banner: { text: tune.rounds ? 'Round 1: take the beacons' : 'Grab salvage, take beacons, collect bounties', t: 3 },
    hint: settings.taught ? 4 : 0, hintT: 0, lowHint: 0, lowTaught: false, thrustTime: 0, turned: false, loadout: { hull: me.hull, weapon: me.weapon },
  };
}
/** A new offline zone: you and bots. */
function reset(): void {
  net?.close(); net = null; ME = 0;
  tune = apply(base, settings);
  world = newWorld(tune, { seed: seedFrom(config.seed), humans: [ME] });
  startRound(world, tune);
  world.events = [];
  newView();
}
const me = (): Ship => world.ships[ME];
/** The live ship with the biggest bounty (at least four times the starting bounty), or -1. */
function mostWanted(): number {
  let best = -1, top = tune.bounty_start * 4 - 1;
  for (const sh of world.ships) if (sh.alive && sh.bounty > top) { top = sh.bounty; best = sh.id; }
  return best;
}

let padWas: PadState | null = null;
function myInput(): ShipInput {
  const l = view.loadout;
  for (const [i, k] of ['Digit1', 'Digit2', 'Digit3'].entries()) if (pressed(k)) l.hull = HULLS[i];
  for (const [i, k] of ['KeyZ', 'KeyX', 'KeyC'].entries()) if (pressed(k)) l.weapon = WEAPONS[i];
  const pad = readPad(), was = padWas;
  padWas = pad;
  if (pad) {
    if (pad.x && !was?.x) l.hull = HULLS[(HULLS.indexOf(l.hull) + 1) % 3];
    if (pad.y && !was?.y) l.weapon = WEAPONS[(WEAPONS.indexOf(l.weapon) + 1) % 3];
  }
  const p = pad && !me().alive ? null : pad; // while respawning, X and Y pick the loadout
  let padL = !!p?.left, padR = !!p?.right;
  if (p && settings.aimSteer && p.mag > tune.pad_aim_dead) { // aim-steer: the nose turns toward where the stick points, at the hull's normal turn rate
    ({ left: padL, right: padR } = aimTurn(me().a, p.sx, p.sy, tune.pad_aim_slack));
  }
  return {
    left: held('ArrowLeft', 'KeyA') || padL, right: held('ArrowRight', 'KeyD') || padR,
    thrust: held('ArrowUp', 'KeyW') || !!p?.thrust, rev: held('ArrowDown', 'KeyS') || !!p?.rev,
    fire: held('Space') || !!p?.fire, burn: held('ShiftLeft', 'ShiftRight') || !!p?.burn,
    mine: pressed('KeyE') || (!!p?.mine && !was?.mine),
    hull: l.hull, weapon: l.weapon,
  };
}

/** Turns the zone's events into sound, sparks, the kill feed and banners. */
function react(events: GameEvent[]): void {
  const p = me(), near = (x: number, y: number, r: number) => Math.hypot(wd(p.x, x, world.size), wd(p.y, y, world.size)) < r;
  for (const e of events) {
    log.push(e);
    switch (e.type) {
      case 'shot': { const s = world.ships[e.ship]; if (e.ship === ME || near(s.x, s.y, 700)) (e.kind === 'bolt' ? sound.shoot() : sound.heavy()); break; }
      case 'hit': if (e.ship === ME) { if (!settings.calm) view.shake = Math.min(10, view.shake + e.amount / 40); sound.hit(); } break;
      case 'burst':
        if (e.n >= 30) view.fx.push({ kind: 'boom', x: e.x, y: e.y, age: 0, life: 0.55, size: 90, team: e.team }); // a mine going off
        else if (e.n <= 4) view.fx.push({ kind: 'impact', x: e.x, y: e.y, age: 0, life: 0.16, size: 30, team: e.team });
        for (let i = 0; i < e.n; i++) { // sparks are only for the eye, so they use Math.random
          const a = Math.random() * Math.PI * 2, s = e.speed * (0.3 + Math.random() * 0.7);
          view.sparks.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, team: e.team });
        }
        break;
      case 'kill': {
        const v = world.ships[e.ship], k = e.by >= 0 ? world.ships[e.by] : undefined;
        if (e.ship === ME && view.tape.length > 4) view.replay = { frames: view.tape.slice(), t: 0, at: { x: v.x, y: v.y }, by: e.by };
        view.fx.push({ kind: 'boom', x: v.x, y: v.y, age: 0, life: 0.7, size: 70 + HULL_RADIUS[v.hull] * 4, team: v.team });
        if (near(v.x, v.y, 900)) sound.boom();
        if (e.by === ME) sound.kill();
        if (k && e.bounty > 0 && (e.by === ME || near(v.x, v.y, 900))) view.pops.push({ text: `+${e.bounty} bounty`, x: v.x, y: v.y, t: 1.6, color: GOLD });
        view.feed.unshift(k ? { a: k.name, at: k.team, b: v.name, bt: v.team, t: 5 } : { a: v.name, at: v.team, b: 'the rocks', bt: -1, t: 5 });
        view.feed.length = Math.min(view.feed.length, 5);
        break;
      }
      case 'mine': if (e.ship === ME) sound.mine(); break;
      case 'salvage': {
        const sh = world.ships[e.ship];
        if (e.ship === ME) sound.pickup();
        if (e.ship === ME || near(sh.x, sh.y, 700)) view.pops.push({ text: e.level < 0 ? 'Fully upgraded' : `${UP_NAME[e.kind]} ${e.level}`, x: sh.x, y: sh.y, t: 1.4, color: e.ship === ME ? '#ffffff' : TEAM[sh.team].css });
        break;
      }
      case 'capture': {
        const b = world.beacons[e.beacon];
        if (e.team === me().team) { sound.capture(); view.banner = { text: `${b.label} is ours`, t: 2.2, team: me().team }; }
        else if (e.from === me().team) { sound.lost(); view.banner = { text: `${b.label} lost`, t: 2.2, team: (1 - me().team) as Team }; }
        break;
      }
      case 'group': view.banner = { text: `The ${TEAM[e.team].short.toLowerCase()} fleet is moving as one`, t: 3, team: e.team }; break;
      case 'round': (e.winner === me().team ? sound.win() : sound.lost()); break;
      case 'roundStart': view.banner = { text: `Round ${e.round}: go`, t: 3 }; break;
    }
  }
}

let wasLow = false;
function updatePlay(dt: number): void {
  const input = myInput();
  sound.engine(me().alive && input.thrust, input.burn);
  if (input.left || input.right) view.turned = true;
  if (input.thrust && me().alive) view.thrustTime += dt;
  if (net) {
    net.step(input, dt);
    if (net.world) world = net.world;
    react(net.drain());
    if (net.status === 'closed') { scene = 'net'; return; }
  } else {
    if (pressed('Enter')) skipBreak(world, tune);
    simStep(world, new Map([[ME, input]]), tune, dt);
    react(world.events); world.events = [];
  }
  // first-minute hints, taught by doing
  const p = me();
  const isLow = p.alive && p.energy < maxEnergy(p, tune) * tune.low_energy_warn;
  if (isLow && !wasLow) { sound.warn(); if (!view.lowTaught) { view.lowTaught = true; view.lowHint = 6; } }
  view.lowHint = Math.max(0, view.lowHint - dt);
  wasLow = isLow;
  view.hintT += dt;
  if (view.hint === 0 && view.thrustTime > 1.2 && view.turned) { view.hint = 1; view.hintT = 0; }
  if (view.hint === 1 && (world.beacons.some(b => dist(p, b, world.size) < 450) || view.hintT > 25)) { view.hint = 2; view.hintT = 0; }
  if (view.hint === 2 && (world.beacons.some(b => b.owner === p.team && dist(p, b, world.size) < tune.beacon_radius) || view.hintT > 35)) { view.hint = 3; view.hintT = 0; }
  if (view.hint === 3 && view.hintT > 9) { view.hint = 4; if (!settings.taught) { settings.taught = true; save(settings); } }
  for (const f of view.feed) f.t -= dt;
  view.feed = view.feed.filter(f => f.t > 0);
  if (view.banner) { view.banner.t -= dt; if (view.banner.t <= 0) view.banner = null; }
  view.shake = Math.max(0, view.shake - dt * 30);
  for (const s of view.sparks) { s.life -= dt; s.x = wrap(s.x + s.vx * dt, world.size); s.y = wrap(s.y + s.vy * dt, world.size); s.vx *= 0.96; s.vy *= 0.96; }
  view.sparks = view.sparks.filter(s => s.life > 0);
  // the death replay: a rolling tape of the last few seconds, played back while you wait to relaunch
  view.tapeT += dt;
  if (view.tapeT >= 1 / tune.replay_fps && p.alive) {
    view.tapeT = 0;
    view.tape.push({ ships: world.ships.map(sh => [sh.id, sh.x, sh.y, sh.a, sh.alive ? 1 : 0, sh.team, HULLS.indexOf(sh.hull), sh.thrusting ? 1 : 0]),
      shots: world.shots.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, team: b.team, kind: b.kind })) });
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
  // the camera follows you, leaning toward where you drift
  const lx = wrap(p.x + (p.alive ? p.vx : 0) * 0.35, world.size), ly = wrap(p.y + (p.alive ? p.vy : 0) * 0.35, world.size);
  const k = Math.min(1, dt * 4);
  view.cam.x = wrap(view.cam.x + wd(view.cam.x, lx, world.size) * k, world.size);
  view.cam.y = wrap(view.cam.y + wd(view.cam.y, ly, world.size) * k, world.size);
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
const SETTINGS_ROWS = ['Volume', 'Camera zoom', 'Bot skill', 'Fleet size (offline)', 'Call sign (online)', 'Zone address (online)', 'Reduce flashing', 'Gamepad steering', 'Back'] as const;
function settingText(i: number): string {
  const s = settings;
  return [`${Math.round(s.volume * 100)}%`, `${s.zoom.toFixed(2)}x`, SKILL_NAMES[s.skill], `${s.fleet} a side`, s.name, s.server, s.calm ? 'On' : 'Off', s.aimSteer ? 'Aim: point the stick' : 'Turn: stick left / right', ''][i];
}
function changeSetting(i: number, d: number): void {
  const s = settings, c = config;
  const step2 = (v: number, e: { min: number; max: number; step: number }) => Math.round(Math.min(e.max, Math.max(e.min, v + d * e.step)) * 1000) / 1000;
  if (i === 0) { s.volume = step2(s.volume, c.volume); sound.volume = s.volume; sound.setMuted(sound.muted); }
  if (i === 1) s.zoom = step2(s.zoom, c.zoom);
  if (i === 2) s.skill = Math.min(2, Math.max(0, s.skill + d)) as Settings['skill'];
  if (i === 3) s.fleet = step2(s.fleet, { ...c.fleet_size, min: 2, max: 20 });
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
      if (k.ok && setAt === 6) changeSetting(6, 1);
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

// a fixed starfield in three parallax layers (background only, so it does not touch the zone's rng)
const stars: { x: number; y: number; layer: number; b: number }[] = [];
{ let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 90; i++) stars.push({ x: r() * 1600, y: r() * 1600, layer, b: 0.3 + r() * 0.7 }); }

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const app = new Application();
  await app.init({ canvas, width: W, height: H, background: '#03040b', resolution: Math.min(2, devicePixelRatio || 1), autoDensity: false, antialias: true, autoStart: false });
  const art = await loadArt();
  // Layers, back to front: the backdrop (tiled stars, nebula, planets), ground light (washes,
  // trails, gates), the sprites (rocks, stations, mines, ships), the lit layer (rings, shots,
  // flames, explosions), marks over ships, then the bloom of the lit layer, then the HUD.
  const back = new Backdrop(art, W, H);
  const gb = new Graphics(), spriteLayer = new Container(), lit = new Container(), g = new Graphics(), fxLayer = new Container();
  const go = new Graphics(), panelLayer = new Container(), hud = new Graphics(), top = new Graphics(), topPanels = new Container(), topSprites = new Container();
  const textLayer = new Container(), topText = new Container();
  lit.addChild(g, fxLayer);
  const S = new SpritePool(spriteLayer, art), F = new SpritePool(fxLayer, art), TS = new SpritePool(topSprites, art), P = new PanelPool(panelLayer, art), TP = new PanelPool(topPanels, art);
  /** A HUD panel: Kenney's notched glass panel, tinted to the dark navy of the instrument frame. */
  const panel = (pool: PanelPool, x: number, y: number, w: number, h: number, alpha = 0.9, tint = 0x26345c) => pool.put('panel', x, y, w, h, tint, alpha);
  /** A gauge: a dark track and a glossy fill in team colour (red when low). */
  const gauge = (x: number, y: number, w: number, h: number, f: number, kind: 'bar0' | 'bar1' | 'barLow') => {
    P.put('barTrack', x, y, w, h, 0x3a4466, 0.9);
    if (w * f >= 24) P.put(kind, x, y, w * f, h);
    else if (f > 0) hud.rect(x + 2, y + 3, Math.max(2, w * f - 2), h - 6).fill(kind === 'barLow' ? 0xff5a6a : TEAM[kind === 'bar0' ? 0 : 1].main);
  };
  // One bloom pass (art bible §8): only the lit layer is drawn again, at half resolution, blurred
  // and added on top, so shots, flames and rings glow and the ships' paintwork stays crisp.
  const glowRT = RenderTexture.create({ width: W, height: H, resolution: 0.5 });
  const bloom = new Sprite(glowRT); bloom.scale.set(1);
  bloom.filters = [new BlurFilter({ strength: 8, quality: 3 })];
  bloom.blendMode = 'add';
  // the Canvas 2D fallback (no WebGL) skips filters, so an unblurred copy would only double every colour
  bloom.visible = app.renderer.type !== RendererType.CANVAS;
  app.stage.addChild(back.layer, gb, spriteLayer, lit, go, bloom, panelLayer, hud, textLayer, top, topPanels, topSprites, topText);
  const L = new Labels(textLayer), T = new Labels(topText);

  /** A ship sprite plus the marks drawn over it: team pip, your chevron, the low-energy ring. */
  function ship(pool: SpritePool, fx: SpritePool, marks: Graphics, hull: Ship['hull'], team: Team, X: number, Y: number, a: number, r: number, o: ShipSpriteLook & { you?: boolean } = {}): void {
    shipSprite(pool, fx, hull, team, X, Y, a, r, { ...o, calm: settings.calm });
    const px = X - Math.cos(a) * r * 1.55, py = Y - Math.sin(a) * r * 1.55; // team pip behind the hull (cyan triangle, amber diamond)
    marks.poly(pts(TEAM_GLYPH[team], px, py, a, 4.5), true).fill(TEAM[team].main).stroke({ width: 1, color: INK });
    if (o.you) marks.poly(pts([[-2.2, 0.75], [-1.85, 0], [-2.2, -0.75]], X, Y, a, r), false).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    if (o.low) { // low energy: a dashed ring in team colour round the hull (a backup for the red HUD bar)
      const ring: number[] = []; for (let i = 0; i < 20; i++) ring.push(X + Math.cos(i * Math.PI / 10) * r * 1.9, Y + Math.sin(i * Math.PI / 10) * r * 1.9);
      dashedPoly(marks, ring, 5, 5, TEAM[team].main, 2, settings.calm || Math.sin((o.t ?? 0) * 28) > -0.3 ? 0.9 : 0.3);
    }
  }
  /** A beacon: wash on the ground layer, ring on the lit layer, the station sprite between. */
  function beacon(b: { owner: -1 | Team; progress: number; phase: number }, X: number, Y: number, R: number, s: number, t: number): void {
    beaconSprite(S, b.owner, X, Y, s, t, b.phase);
    drawBeacon(g, b, X, Y, R, s, t, { under: gb, core: false });
  }

  const z = (): number => tune.zoom;
  const toScreen = (x: number, y: number): [number, number] => {
    const sx = view.shake ? Math.sin(world.t * 90) * view.shake : 0;
    return [W / 2 + wd(view.cam.x, x, world.size) * z() + sx, H / 2 + wd(view.cam.y, y, world.size) * z()];
  };
  const on = (X: number, Y: number, m: number): boolean => X > -m && X < W + m && Y > -m && Y < H + m;

  function drawStars(cx: number, cy: number): void {
    back.update(cx, cy, world.size);
    for (const st of stars) {
      const par = [0.15, 0.3, 0.5][st.layer];
      const x = (((st.x - cx * par) % 1600) + 1600) % 1600 - 160, y = (((st.y - cy * par) % 1600) + 1600) % 1600 - 440;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const sz = st.layer + 1;
      gb.rect(x, y, sz, sz).fill({ color: [0xaabeff, 0xc8d2ff, 0xe6e6ff][st.layer], alpha: st.b * (0.25 + st.layer * 0.2) });
    }
  }

  function drawZone(): void {
    const t = world.t, s = z();
    drawStars(view.cam.x, view.cam.y);
    for (const team of [0, 1] as Team[]) { // fleet gates: brackets where each fleet launches
      const gt = gate(team, world.size), [X, Y] = toScreen(gt.x, gt.y);
      if (!on(X, Y, 300)) continue;
      const dir = team === 0 ? 1 : -1;
      for (const sy of [-1, 1]) {
        const path = () => gb.moveTo(X - dir * 60 * s, Y + sy * 150 * s).lineTo(X - dir * 110 * s, Y + sy * 150 * s).lineTo(X - dir * 110 * s, Y + sy * 40 * s);
        path(); gb.stroke({ width: 9, color: TEAM[team].main, alpha: 0.2 }); path(); gb.stroke({ width: 3, color: TEAM[team].dim });
      }
      L.put(team === 0 ? 'Cyan gate' : 'Amber gate', X - dir * 85 * s, Y - 175 * s, 16, TEAM[team].css);
    }
    for (const b of world.beacons) {
      const [X, Y] = toScreen(b.x, b.y);
      if (!on(X, Y, tune.beacon_radius * s * 2.3)) continue;
      beacon(b, X, Y, tune.beacon_radius * s, s, t);
      L.put(b.label, X, Y - tune.beacon_radius * s - 30, 18, ownerCss(b.owner), 'center', true);
    }
    if (world.roundOver > 0 && world.winner !== -1) { // round won: a shockwave rolls out of each of the winner's beacons
      const e = tune.round_break - world.roundOver, col = TEAM[world.winner].main;
      for (const b of world.beacons) {
        if (b.owner !== world.winner) continue;
        const [X, Y] = toScreen(b.x, b.y);
        for (let k = 0; k < 3; k++) {
          const ek = e - k * 0.7; if (ek <= 0 || ek > 2.4) continue;
          const R = tune.beacon_radius * s * (1 + ek * 3), al = 1 - ek / 2.4;
          if (on(X, Y, R + 20)) g.circle(X, Y, R).stroke({ width: 6 * al + 1, color: col, alpha: al * 0.8 });
        }
      }
    }
    world.asteroids.forEach((a, i) => { const [X, Y] = toScreen(a.x, a.y); if (on(X, Y, a.r * s * 1.3 + 10)) rockSprite(S, a, X, Y, s, i); });
    for (const v of world.salvage) { // salvage: a slowly turning pod; it blinks for its last five seconds
      const [X, Y] = toScreen(v.x, v.y); if (!on(X, Y, 40)) continue;
      const fading = tune.salvage_life - v.age < 5 && Math.sin(t * 14) < 0;
      F.put('glint', X, Y, 0, 66 * s * (0.85 + 0.15 * Math.sin(t * 4 + v.id)), { add: true, tint: 0xc9a2ff, alpha: settings.calm ? 0.5 : 0.75 });
      S.put('salvage', X, Y, t * 0.6 + v.id, 38 * s, { alpha: fading ? 0.35 : 1 });
    }
    for (const m of world.mines) { const [X, Y] = toScreen(m.x, m.y); if (on(X, Y, 30)) mineSprite(S, F, m.team, m.age >= tune.mine_arm, X, Y, s, t, settings.calm); }
    for (const b of world.shots) {
      const [X, Y] = toScreen(b.x, b.y); if (!on(X, Y, 30)) continue;
      g.moveTo(X, Y).lineTo(X - b.vx * 0.045 * s, Y - b.vy * 0.045 * s).stroke({ width: b.kind === 'rico' ? 3 : 2, color: TEAM[b.team].main, alpha: 0.45, cap: 'round' }); // a short tail: it reads as a shot, not a star
      shotSprite(F, b.team, b.kind, b.vx, b.vy, X, Y, s, tune[`${b.kind}_life`] - b.life < 0.07, t); }
    for (const f of view.fx) {
      const [X, Y] = toScreen(f.x, f.y); if (!on(X, Y, f.size)) continue;
      if (f.kind === 'boom') boomSprite(F, X, Y, f.size * s * 1.4, f.age, f.life);
      else F.put(`impact_${f.team}`, X, Y, f.age * 8, f.size * s * (1 - f.age / f.life * 0.5), { add: true, alpha: 1 - f.age / f.life });
    }
    for (const p of view.sparks) {
      const [X, Y] = toScreen(p.x, p.y); if (!on(X, Y, 10)) continue;
      g.moveTo(X, Y).lineTo(X - p.vx * 0.05 * s, Y - p.vy * 0.05 * s).stroke({ width: 2.5, color: p.life > 0.5 ? 0xffffff : TEAM[p.team].main, alpha: Math.min(1, p.life * 1.6), cap: 'round' });
    }
    const p = me();
    let tag: Ship | undefined, td = 700; // the nearest enemy gets a name tag: who it is, and that it is a bot
    for (const sh of world.ships) if (sh.alive && sh.team !== p.team) { const d = dist(p, sh, world.size); if (d < td) { td = d; tag = sh; } }
    const wanted = mostWanted();
    for (const sh of world.ships) {
      if (!sh.alive) continue;
      const [X, Y] = toScreen(sh.x, sh.y);
      if (!on(X, Y, 60)) continue;
      const r = HULL_RADIUS[sh.hull] * s * 1.25;
      drawTrail(gb, sh.team, X, Y, sh.vx, sh.vy, s);
      const maxE = maxEnergy(sh, tune);
      ship(S, F, go, sh.hull, sh.team, X, Y, sh.a, r, { thrust: sh.thrusting, burn: sh.burning, t, you: sh.id === ME, flash: sh.flash > 0, low: sh.energy < maxE * tune.low_energy_warn });
      if (sh.id !== ME && sh.energy < maxE * 0.98) {
        const w = 34 * s;
        go.rect(X - w / 2, Y + r * 1.9, w, 3).fill({ color: 0x000000, alpha: 0.5 });
        go.rect(X - w / 2, Y + r * 1.9, w * Math.max(0, sh.energy / maxE), 3).fill(TEAM[sh.team].main);
      }
      if (sh === tag) L.put(`${sh.name} · ${HULL_NAME[sh.hull]}${sh.bounty >= tune.bounty_start * 4 ? ` · bounty ${sh.bounty}` : ''}`, X, Y - r * 1.9 - 6, 14, TEAM[sh.team].css);
      else if (sh.id !== ME && sh.id === wanted && sh.team !== p.team) L.put(`Wanted · ${sh.bounty}`, X, Y - r * 1.9 - 6, 14, GOLD, 'center', true);
    }
    for (const q of view.pops) { const [X, Y] = toScreen(q.x, q.y); if (on(X, Y, 80)) L.put(q.text, X, Y - 40, 16, q.color, 'center', true, Math.min(1, q.t * 2)); }
    for (const b of world.beacons) { // off-screen beacons point in from the screen edge
      const [X, Y] = toScreen(b.x, b.y);
      if (on(X, Y, -40)) continue;
      const a = Math.atan2(Y - H / 2, X - W / 2);
      const k = Math.min((W / 2 - 40) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 110) / Math.abs(Math.sin(a) || 1e-6));
      arrow(hud, W / 2 + Math.cos(a) * k, H / 2 + 20 + Math.sin(a) * k, a, 16, ownerColor(b.owner));
    }
  }

  function drawHUD(): void {
    const p = me(), bw = 520, bx = W / 2 - bw / 2, by = 18;
    panel(P, 8, 6, 226, 84);
    panel(P, bx - 112, by - 10, bw + 264, 90);
    if (view.feed.length) panel(P, W - 304, 6, 296, view.feed.length * 24 + 14);
    const lead = Math.max(1, world.scores[0], world.scores[1]);
    for (const t of [0, 1] as Team[]) { // rounds: both fleets racing to the target; open zone: the fleets against each other
      const y = by + t * 22, f = Math.min(1, world.scores[t] / (tune.rounds ? tune.target_score : lead));
      gauge(bx, y - 2, bw, 16, f, t === 0 ? 'bar0' : 'bar1');
      L.put(`${TEAM[t].short} ${Math.floor(world.scores[t])}`, bx - 12, y + 6, 16, TEAM[t].css, 'right', true);
    }
    L.put(tune.rounds ? `to ${tune.target_score}  ·  round ${world.round}` : 'fleet score', bx + bw + 12, by + 17, 15, '#aab4d4', 'left');
    world.beacons.forEach((b, i) => diamond(hud, W / 2 - 60 + i * 60, by + 62, 12, ownerColor(b.owner)));
    const fleetLine = (t: Team) => {
      const ships = world.ships.filter(s => s.team === t), people = ships.filter(s => s.human).length;
      return people ? `${people} ${people === 1 ? 'pilot' : 'pilots'} + ${ships.length - people} bots` : `${ships.length} bots`;
    };
    L.put(`${fleetLine(p.team)}  vs  ${fleetLine((1 - p.team) as Team)}`, 20, 24, 15, '#aab4d4', 'left');
    L.put(`Kills ${p.kills}  ·  deaths ${p.deaths}`, 20, 46, 15, '#aab4d4', 'left');
    L.put(`Bounty ${p.alive ? p.bounty : 0}  ·  points ${p.points}`, 20, 70, 16, GOLD, 'left', true);
    view.feed.forEach((f, i) => { // who downed who, in each pilot's fleet colour
      const y = 26 + i * 24, x = W - 20, al = Math.min(1, f.t);
      const mid = f.bt < 0 ? ' crashed into ' : ' downed ';
      const wb = L.width(f.b, 15), wm = L.width(mid, 15);
      L.put(f.b, x, y, 15, f.bt === -1 ? '#aab4d4' : TEAM[f.bt].css, 'right', false, al);
      L.put(mid, x - wb, y, 15, '#d8deef', 'right', false, al);
      L.put(f.a, x - wb - wm, y, 15, TEAM[f.at].css, 'right', true, al);
    });
    const ew = 360, ex = W / 2 - ew / 2, ey = H - 40; // energy: your shield and your ammo
    const maxE = maxEnergy(p, tune), ef = p.alive ? Math.max(0, p.energy / maxE) : 0, low = p.alive && ef < tune.low_energy_warn;
    panel(P, ex - 150, ey - 14, ew + 340, 42);
    if (p.alive) panel(P, ex - 150, ey - 58, ew + 340, 36, 0.85);
    if (low) { // low energy is never colour alone: a hatched fill, a threshold tick and a warning glyph
      gauge(ex, ey - 2, ew, 18, ef, 'barLow');
      for (let hx = ex - 14; hx < ex + ew * ef; hx += 7) {
        const x0 = Math.max(ex, hx), x1 = Math.min(ex + ew * ef, hx + 14);
        if (x1 > x0) hud.moveTo(x0, ey + 14 - (x0 - hx)).lineTo(x1, ey + 14 - (x1 - hx));
      }
      hud.stroke({ width: 2, color: 0xff5a6a });
      const gx = ex + ew + 14, gy = ey - 4; // warning glyph: a triangle with a bar and a dot
      hud.poly([gx, gy + 20, gx + 11, gy, gx + 22, gy + 20], true).stroke({ width: 2, color: 0xff5a6a, join: 'miter' });
      hud.moveTo(gx + 11, gy + 7).lineTo(gx + 11, gy + 13).stroke({ width: 2, color: 0xff5a6a });
      hud.rect(gx + 10, gy + 15, 2, 2).fill(0xff5a6a);
    } else gauge(ex, ey - 2, ew, 18, ef, p.team === 0 ? 'bar0' : 'bar1');
    if (p.alive) UPGRADES.forEach((k, i) => { // upgrades this life: a short label and one pip per level
      const lv = p.up[i] ?? 0, cap = tune[`up_${k}_max`], x0 = ex - 140 + i * 80, y0 = ey - 40;
      L.put(UP_SHORT[k], x0, y0, 12, lv ? GOLD : '#59628a', 'left', lv > 0);
      for (let j = 0; j < cap; j++) hud.rect(x0 + 30 + j * 8, y0 - 4, 6, 8).fill({ color: j < lv ? 0xffd88a : 0x2f3757 });
    });
    const tx = ex + ew * tune.low_energy_warn; // the threshold tick
    hud.moveTo(tx, ey - 4).lineTo(tx, ey + 18).stroke({ width: 2, color: low ? 0xff5a6a : 0x8590b4 });
    L.put(`Energy ${Math.max(0, Math.round(p.energy))}`, ex - 12, ey + 7, 15, low ? '#ff5a6a' : TEAM[p.team].css, 'right', true);
    L.put(`${HULL_NAME[p.hull]} · ${WEAPON_NAME[p.weapon]}`, ex + ew + (low ? 46 : 12), ey + 7, 15, '#aab4d4', 'left');
    // the minimap: the whole zone
    const size = 170, mx = W - size - 16, my = H - size - 16, k = size / world.size;
    panel(P, mx - 8, my - 8, size + 16, size + 16, 0.92);
    hud.rect(mx, my, size, size).fill({ color: 0x03040b, alpha: 0.7 });
    for (const a of world.asteroids) hud.rect(mx + a.x * k - 2, my + a.y * k - 2, 4, 4).fill(0x2f3757);
    for (const b of world.beacons) dashedRing(hud, mx + b.x * k, my + b.y * k, tune.beacon_radius * k + 2, ownerColor(b.owner), 1, 2);
    for (const v of world.salvage) hud.rect(mx + v.x * k - 1, my + v.y * k - 1, 2, 2).fill(0xc9a2ff);
    const wanted = mostWanted();
    if (wanted >= 0) { const w = world.ships[wanted]; hud.circle(mx + w.x * k, my + w.y * k, 7).stroke({ width: 1.5, color: 0xffd88a }); }
    for (const sh of world.ships) if (sh.alive && sh.id !== ME) blip(hud, mx + sh.x * k, my + sh.y * k, sh.a, 3.2, TEAM[sh.team].main);
    if (p.alive) blip(hud, mx + p.x * k, my + p.y * k, p.a, 5.5, 0xffffff);
    const vw = (W / z()) * k, vh = (H / z()) * k;
    hud.rect(mx + view.cam.x * k - vw / 2, my + view.cam.y * k - vh / 2, vw, vh).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
    // the first-minute hint
    const hints = [
      'Left / Right to turn, Up to thrust. You drift: turn around and thrust to slow down.',
      'Follow the arrows to a beacon. Space fires, and every shot spends energy.',
      'Sit inside the ring to take it. Beacons you hold score for your fleet while they drift.',
      'Shift afterburns, E drops a mine behind you. Lead your shots: aim where they will be.',
    ];
    const hs = view.lowHint > 0 ? 'Low energy: ease off the trigger to recharge. At zero your ship is destroyed.' : hints[view.hint];
    if (hs && !world.roundOver && p.alive) {
      const w = L.width(hs, 17) + 36;
      panel(P, W / 2 - w / 2, H - 156, w, 40);
      L.put(hs, W / 2, H - 136, 17, '#e6f6ff');
    }
    if (sound.muted) L.put('Muted', W - 100, H - 200, 14, '#8590b4');
  }

  /** The death replay: the last seconds before you went down, slowed, centred where it happened. */
  function drawReplay(r: NonNullable<View['replay']>): void {
    const f = r.frames[Math.min(r.frames.length - 1, Math.floor(r.t * tune.replay_fps * tune.replay_speed))];
    const k = z() * 0.85, cx = r.at.x, cy = r.at.y;
    const at = (x: number, y: number): [number, number] => [W / 2 + wd(cx, x, world.size) * k, H / 2 + wd(cy, y, world.size) * k];
    top.rect(0, 0, W, H).fill({ color: 0x03040b, alpha: 0.97 });
    world.asteroids.forEach((a, i) => { const [X, Y] = at(a.x, a.y); if (on(X, Y, a.r * k * 1.3)) rockSprite(TS, a, X, Y, k, i); });
    for (const b of f.shots) { const [X, Y] = at(b.x, b.y); if (on(X, Y, 20)) shotSprite(TS, b.team, b.kind, b.vx, b.vy, X, Y, k, false, simT); }
    for (const row of f.ships) {
      const [id, x, y, a, alive, team, hull, thr] = row;
      if (!alive) continue;
      const [X, Y] = at(x, y); if (!on(X, Y, 60)) continue;
      const h = HULLS[hull], who = world.ships[id];
      ship(TS, TS, top, h, team as Team, X, Y, a, HULL_RADIUS[h] * k * 1.25, { thrust: thr === 1, t: simT, you: id === ME });
      if (id === r.by || id === ME) T.put(id === ME ? 'You' : who.name, X, Y - 44 * k, 15, id === ME ? '#ffffff' : TEAM[team as Team].css, 'center', true);
    }
    const by = r.by >= 0 ? world.ships[r.by] : undefined;
    T.put('Replay', W / 2, 60, 30, '#ffffff', 'center', true);
    T.put(by ? `${by.name} downed you (${HULL_NAME[by.hull]}, ${WEAPON_NAME[by.weapon]})` : 'The rocks got you', W / 2, 96, 18, '#d8deef');
    T.put(`Next launch: ${HULL_NAME[view.loadout.hull]} with ${WEAPON_NAME[view.loadout.weapon]}  ·  1 2 3 / Z X C to change  ·  Enter for the full loadout`, W / 2, H - 40, 16, '#aab4d4');
    const fr = (r.t * tune.replay_fps * tune.replay_speed) / r.frames.length;
    top.rect(W / 2 - 160, H - 70, 320, 4).fill({ color: 0x2f3757 });
    top.rect(W / 2 - 160, H - 70, 320 * Math.min(1, fr), 4).fill({ color: 0xffffff, alpha: 0.8 });
  }

  function drawOverlays(): void {
    const p = me();
    if (world.roundOver) {
      top.rect(0, H / 2 - 110, W, 220).fill({ color: 0x03040b, alpha: 0.7 });
      const win = world.winner === 0 ? 0 : 1;
      T.put(`${TEAM[win].name} ${win === p.team ? 'wins the round' : 'takes the round'}`, W / 2, H / 2 - 50, 48, TEAM[win].css, 'center', true);
      T.put(`Rounds won: Cyan ${world.roundsWon[0]}  ·  Amber ${world.roundsWon[1]}`, W / 2, H / 2 + 6, 20, '#d8deef');
      T.put(`Next round in ${Math.ceil(world.roundOver)} s, right here (Enter to skip)`, W / 2, H / 2 + 46, 18, '#aab4d4');
      return;
    }
    if (view.banner && p.alive) {
      const b = view.banner;
      T.put(b.text, W / 2, 128, 28, b.team === undefined ? '#ffffff' : TEAM[b.team].css, 'center', true, Math.min(1, b.t * 2));
    }
    if (p.alive) return;
    if (view.replay) { drawReplay(view.replay); return; }
    top.rect(0, 0, W, H).fill({ color: 0x03040b, alpha: 0.72 });
    T.put('Destroyed', W / 2, 150, 44, TEAM[p.team].css, 'center', true);
    const by = p.lastHitBy >= 0 ? world.ships[p.lastHitBy] : undefined;
    T.put(by ? `by ${by.name} flying a ${HULL_NAME[by.hull]} with ${WEAPON_NAME[by.weapon]}` : 'by the rocks', W / 2, 196, 18, '#d8deef');
    T.put(`Relaunch in ${Math.max(0, p.respawn).toFixed(1)} s  ·  pick your loadout`, W / 2, 236, 20, '#aab4d4');
    HULLS.forEach((h, i) => {
      const x = W / 2 - 300 + i * 300, y = 340, sel = view.loadout.hull === h;
      panel(TP, x - 120, y - 70, 240, 140, 0.95, sel ? (p.team === 0 ? 0x1f6a86 : 0x8a5a1c) : 0x26345c);
      ship(TS, TS, top, h, p.team, x, y - 14, -Math.PI / 2, HULL_RADIUS[h] * 1.9, { t: simT, thrust: sel });
      T.put(`${i + 1}  ${HULL_NAME[h]}`, x, y + 40, 18, sel ? '#ffffff' : '#aab4d4', 'center', true);
      T.put(HULL_ROLE[h], x, y + 60, 14, '#8590b4');
    });
    WEAPONS.forEach((wp, i) => {
      const x = W / 2 - 300 + i * 300, y = 500, sel = view.loadout.weapon === wp;
      panel(TP, x - 120, y - 46, 240, 92, 0.95, sel ? (p.team === 0 ? 0x1f6a86 : 0x8a5a1c) : 0x26345c);
      const demo = { team: p.team, kind: wp, vx: 1, vy: 0 };
      for (const dy of wp === 'scatter' ? [-14, 0, 14] : [0]) shotSprite(TS, demo.team, wp, 1, 0, x + 30, y - 18 + dy, 1.2, false, simT);
      T.put(`${'ZXC'[i]}  ${WEAPON_NAME[wp]}`, x, y + 10, 18, sel ? '#ffffff' : '#aab4d4', 'center', true);
      T.put(WEAPON_ROLE[wp], x, y + 30, 14, '#8590b4');
    });
  }

  function drawTitle(): void {
    const t = simT;
    drawStars(t * 30, t * 8);
    ship(S, F, go, 'lancer', 0, W / 2 - 330, 150, 0.2 + Math.sin(t) * 0.1, 26, { thrust: true, t });
    ship(S, F, go, 'bulwark', 1, W / 2 + 330, 150, Math.PI - 0.2 + Math.sin(t) * 0.1, 22, { thrust: true, t });
    beacon({ owner: -1, progress: 0.4 + 0.3 * Math.sin(t), phase: 0 }, W / 2, 160, tune.beacon_radius * 0.42, 0.42, t);
    L.put(TITLE, W / 2, 268, 72, '#ffffff', 'center', true);
    L.put('Two fleets. Drifting beacons, salvage to grab, bounties to collect. One huge open zone.', W / 2, 324, 20, '#aab4d4');
    MENU.forEach((m, i) => {
      const y = 410 + i * 50, sel = i === menuAt;
      panel(P, W / 2 - 300, y - 22, 600, 44, sel ? 0.95 : 0.55, sel ? 0x1f6a86 : 0x26345c);
      if (sel) arrow(hud, W / 2 - 280, y, 0, 10, TEAM[0].main);
      L.put(m, W / 2, y, 24, sel ? '#ffffff' : '#aab4d4', 'center', sel);
    });
    L.put('Up / Down to choose, Enter to go  ·  a gamepad works too', W / 2, H - 70, 16, '#8590b4');
    L.put('Every other ship is a bot, named as a bot, until people join.', W / 2, H - 40, 16, '#8590b4');
  }

  function drawFigures(): void {
    const t = simT;
    drawStars(0, 0);
    L.put('Beacon Wars: every figure', W / 2, 40, 26, '#ffffff', 'center', true);
    HULLS.forEach((h, i) => {
      for (const team of [0, 1] as Team[]) {
        const x = 160 + i * 190, y = 140 + team * 165;
        ship(S, F, go, h, team, x, y, -Math.PI / 2, HULL_RADIUS[h] * 2.2, { t, thrust: true });
        L.put(`${HULL_NAME[h]} (${team ? 'amber' : 'cyan'})`, x, y + (h === 'bulwark' ? 70 : 60), 15, TEAM[team].css);
      }
    });
    ship(S, F, go, 'lancer', 0, 760, 150, -Math.PI / 2, HULL_RADIUS.lancer * 2.2, { you: true, t });
    L.put('You (white chevron)', 760, 216, 15, '#ffffff');
    ship(S, F, go, 'dart', 1, 760, 320, -Math.PI / 2, HULL_RADIUS.dart * 2.2, { t, low: true });
    L.put('Low energy (dashed)', 760, 380, 15, TEAM[1].css);
    const bs = 0.4, bR = tune.beacon_radius * bs;
    beacon({ owner: 0, progress: 1, phase: 0 }, 960, 180, bR, bs, t);
    L.put('Beacon (held)', 960, 180 - bR - 22, 15, TEAM[0].css, 'center', true);
    beacon({ owner: 1, progress: -0.45, phase: 2 }, 1160, 180, bR, bs, t);
    L.put('Beacon (being taken)', 1160, 180 - bR - 22, 15, TEAM[1].css, 'center', true);
    beacon({ owner: -1, progress: 0, phase: 1 }, 1060, 470, bR, bs, t);
    L.put('Beacon (neutral)', 1060, 470 - bR - 22, 15, '#9aa4c4', 'center', true);
    const shape: [number, number][] = []; let s2 = 3;
    for (let i = 0; i < 11; i++) { s2 = (s2 * 16807) % 2147483647; shape.push([(i / 11) * Math.PI * 2, 0.8 + (s2 / 2147483647) * 0.3]); }
    rockSprite(S, { x: 0, y: 0, r: 60, shape, cracks: [], spin: 0 }, 160, 490, 1, 0);
    L.put('Asteroid', 160, 570, 15, '#aab4d4');
    mineSprite(S, F, 1, true, 350, 490, 2, t, settings.calm); L.put('Mine', 350, 570, 15, TEAM[1].css);
    WEAPONS.forEach((k, i) => {
      const team = (i === 2 ? 1 : 0) as Team;
      shotSprite(F, team, k, 1, 0, 540 + i * 140, 490, 1.6, false, t);
      L.put(WEAPON_NAME[k], 520 + i * 140, 570, 15, TEAM[team].css);
    });
  }

  function drawSettings(): void {
    drawStars(simT * 20, 0);
    L.put('Settings', W / 2, 90, 48, '#ffffff', 'center', true);
    SETTINGS_ROWS.forEach((r, i) => {
      const y = 170 + i * 54, sel = i === setAt;
      panel(P, W / 2 - 380, y - 24, 760, 48, sel ? 0.95 : 0.5, sel ? 0x1f6a86 : 0x26345c);
      L.put(r, W / 2 - 350, y, 22, sel ? '#ffffff' : '#aab4d4', 'left', sel);
      const v = settingText(i) + (typing && sel ? '_' : '');
      L.put(v, W / 2 + 350, y, 22, sel ? TEAM[0].css : '#d8deef', 'right', true);
    });
    const tip = typing ? 'Type, then Enter to keep it' : setAt >= 4 && setAt <= 5 ? 'Enter to type' : 'Left / Right to change  ·  Esc to go back';
    L.put(tip, W / 2, H - 50, 18, '#8590b4');
  }
  function drawHelp(): void {
    drawStars(simT * 20, 0);
    L.put('How to play', W / 2, 70, 44, '#ffffff', 'center', true);
    const lines = [
      'Your ship drifts: it keeps moving the way it was going until you thrust another way.',
      'Turn to face somewhere new and thrust to change course; turn around and thrust to stop.',
      'Energy is your shield and your ammo. Shots, afterburn and mines spend it; it refills when you ease off.',
      'A ship at zero energy is destroyed and relaunches from its gate a few seconds later.',
      'Three beacons drift through the zone. Sit inside a ring with more ships than the other fleet to take it.',
      'Every second a beacon is held, its fleet scores. Kills score too. The zone never closes: drop in any time.',
      'Fly over glowing salvage pods for upgrades: energy, recharge, engines, guns, bouncing shots and more.',
      'Pickups and kills raise your bounty. Whoever downs you collects it, and your upgrades are lost.',
      'While you wait to relaunch, pick a hull (1 2 3) and a weapon (Z X C). The edges wrap around.',
    ];
    lines.forEach((l, i) => L.put(l, W / 2, 140 + i * 36, 18, '#d8deef'));
    CONTROLS.forEach((c, i) => L.put(c, W / 2, 460 + i * 32, 17, '#aab4d4'));
    L.put('Gamepad: point the stick to steer, A thrusts, X fires, LB afterburns, B drops a mine; respawning, X and Y pick the loadout', W / 2, 600, 16, '#8590b4');
    L.put('Art: Kenney (kenney.nl), CC0', W / 2, 640, 14, '#8590b4');
    L.put('Enter to go back', W / 2, H - 50, 20, TEAM[0].css, 'center', true);
  }
  function drawNet(): void {
    drawStars(simT * 20, 0);
    L.put('Online zone', W / 2, 200, 44, '#ffffff', 'center', true);
    if (!net || net.status === 'closed') {
      L.put(net?.reason || 'Not connected.', W / 2, 300, 22, '#ff8a96');
      L.put('Start a zone with "npm run server", or set its address in Settings.', W / 2, 350, 18, '#aab4d4');
      L.put('Enter to go back', W / 2, H - 80, 22, TEAM[0].css, 'center', true);
    } else {
      L.put(`Connecting to ${settings.server} as ${settings.name}...`, W / 2, 300, 22, '#d8deef');
      L.put('Esc to cancel', W / 2, H - 80, 20, '#8590b4');
    }
  }
  function drawScoreboard(): void {
    panel(TP, W / 2 - 430, 110, 860, 480, 0.96);
    T.put('Scoreboard', W / 2, 140, 26, '#ffffff', 'center', true);
    for (const team of [0, 1] as Team[]) {
      const x = W / 2 - 410 + team * 430;
      T.put(`${TEAM[team].name}  ${Math.floor(world.scores[team])}${tune.rounds ? `  ·  rounds ${world.roundsWon[team]}` : ''}`, x, 180, 18, TEAM[team].css, 'left', true);
      T.put('Pilot', x, 210, 14, '#8590b4', 'left'); T.put('Ship', x + 170, 210, 14, '#8590b4', 'left');
      T.put('Pts', x + 250, 210, 14, '#8590b4', 'left'); T.put('Bounty', x + 295, 210, 14, '#8590b4', 'left');
      T.put('K', x + 355, 210, 14, '#8590b4', 'left'); T.put('D', x + 385, 210, 14, '#8590b4', 'left');
      world.ships.filter(sh => sh.team === team).sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths).forEach((sh, i) => {
        const y = 236 + i * 22, c = sh.id === ME ? '#ffffff' : sh.human ? '#e6f6ff' : '#aab4d4';
        T.put(sh.name, x, y, 15, c, 'left', sh.id === ME); T.put(HULL_NAME[sh.hull], x + 170, y, 15, c, 'left');
        T.put(`${sh.points}`, x + 250, y, 15, c, 'left'); T.put(sh.alive ? `${sh.bounty}` : '-', x + 295, y, 15, sh.alive && sh.bounty >= tune.bounty_start * 4 ? GOLD : c, 'left');
        T.put(`${sh.kills}`, x + 355, y, 15, c, 'left'); T.put(`${sh.deaths}`, x + 385, y, 15, c, 'left');
      });
    }
  }

  function draw(): void {
    look.calm = settings.calm;
    let glowK = 1; // Round won is the only state with full bloom; Round lost drains it (art bible §2)
    if ((scene === 'play' || scene === 'pause') && world.roundOver > 0 && world.winner !== -1) {
      const e = Math.min(1, (tune.round_break - world.roundOver) / 0.6);
      glowK = world.winner === me().team ? 1 + 0.6 * e : 1 - 0.55 * e;
    }
    bloom.alpha = (settings.calm ? 0.45 : 0.9) * (settings.calm ? Math.min(1, glowK) : glowK);
    g.clear(); gb.clear(); go.clear(); hud.clear(); top.clear(); L.begin(); T.begin(); S.begin(); F.begin(); TS.begin(); P.begin(); TP.begin();
    if (scene === 'title') drawTitle();
    else if (scene === 'settings') drawSettings();
    else if (scene === 'help') drawHelp();
    else if (scene === 'net') drawNet();
    else if (scene === 'figures') drawFigures();
    else {
      drawZone(); drawHUD(); drawOverlays();
      if (scene === 'pause') {
        top.rect(0, 0, W, H).fill({ color: 0x03040b, alpha: 0.6 });
        T.put('Paused', W / 2, H / 2 - 20, 48, '#ffffff', 'center', true);
        T.put(net ? 'P to carry on (the zone keeps going)  ·  Q to leave the zone  ·  M to mute' : 'P to carry on  ·  Q to quit to the menu  ·  M to mute', W / 2, H / 2 + 30, 20, '#aab4d4');
      }
      if (held('Tab') && scene === 'play') drawScoreboard();
      if (net && scene === 'play') L.put(`online  ·  ${net.ping} ms`, 20, 102, 14, '#8590b4', 'left');
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
