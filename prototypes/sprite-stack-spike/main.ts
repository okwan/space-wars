// PROTOTYPE - NOT FOR PRODUCTION
// Question: does Beacon Wars look and play better as 2.5D sprite stacks in a software pixel
// renderer, with a camera that blends top-down, isometric and a chase view without a cut?
// Date: 2026-11-19
//
// The real rules fly underneath: src/game (the free-for-all zone, its map, bots, guns, bombs,
// mines and salvage) runs unchanged. Only the picture is new.

import config from '../../data/config.json';
import { SAFE, TILE, WALL, tileAt, zoneMap, type Region } from '../../src/game/map';
import { STEP, step as simStep } from '../../src/game/sim';
import { tuningFrom } from '../../src/game/tuning';
import { inSafe } from '../../src/game/map';
import { HULL_RADIUS, type Ship, type ShipInput } from '../../src/game/types';
import { newWorld } from '../../src/game/world';
import { abgr, drawText } from './render/font';
import { buildModels, ENGINES, type Model } from './render/models';
import { Renderer, type CameraState, type Light } from './render/raster';
import { buildWalls, WALL_TOP } from './render/walls';
import { Sfx } from './sfx';
import { Ui } from './ui';

// ---- setup --------------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const W = 480, H = 270;
const tune = tuningFrom(config);
// Gentler bots for this prototype (Oscar: "I die instantly"): slower to react, looser aim, fire
// only when well lined up, notice you from nearer, fewer bombs and mines, a longer spawn shield,
// fewer pilots, and a longer "new pilot" grace where their aim is looser still.
if (!params.has('hardbots')) Object.assign(tune, {
  pilots: 12, spawn_shield: 5,
  bot_reaction: 0.55, bot_aim_error: 0.24, bot_fire_angle: 0.06, bot_engage_range: 420,
  bot_bomb_range: 260, bot_mine_chance: 0.015, bot_bounty_reach: 0.2,
  bot_rookie_fights: 20, bot_rookie_aim: 3.5,
});
// Snappier combat for this prototype (Oscar: "kinda hard to kill someone, hard to aim"): bullets
// twice as fast as a ship so they fly nearly straight out of the nose, a slightly wider bullet
// hitbox, quicker turning, and fewer hits to kill. ?classic restores the shared numbers.
if (!params.has('classic')) Object.assign(tune, {
  gun_speed: 780, gun_life: 1.05, gun_reach: 6, gun_damage: 220, gun_damage_level: 80,
  dart_turn: 5.4, lancer_turn: 4.7, bulwark_turn: 4.0,
});
// The open world (Oscar: "should almost feel like open world"): a map four times the arena's area,
// made of named regions with long empty stretches between them. ?arena restores the arena map.
const openWorld = !params.has('arena');
if (openWorld) Object.assign(tune, {
  map_tiles: 1024, salvage_max: 220, salvage_rate: tune.salvage_rate * 2.5, bot_company_share: 0.3, pilots: 18,
});
const seed = Number(params.get('seed') ?? config.seed);
const world = newWorld(tune, { seed, humans: params.has('bot') ? [] : [0], mapStyle: openWorld ? 'open' : 'arena' });
const ME = 0;
const map = zoneMap(world.mapSeed, world.tiles, world.mapStyle);
const mesh = buildWalls(map);
const models = buildModels();

const R = new Renderer(W, H);
R.deckCentre = map.centre * TILE;
// a few far planets, deep below the zone (render space: Y = -sim y), placed round the middle
{
  const c = map.centre * TILE, looks: [number, number, boolean][] = [[0x5fb8c8, 0x2a4a8a, false], [0xd08a5a, 0x7a3e3a, false], [0x9a86e0, 0x4a3c86, true], [0x7ac8a0, 0x2c5a6a, false]];
  const ring = openWorld ? [2600, 6200] : [2600];
  R.planets = ring.flatMap((rad, k) => [0.4, 1.9, 3.3, 4.7].map((ang, i) => ({
    x: c + Math.cos(ang + k * 0.8) * rad, y: -c + Math.sin(ang + k * 0.8) * rad, z: -2200 - ((i + k) % 4) * 300, r: 520 + ((i + k) % 2) * 300,
    a: looks[(i + k) % 4][0], b: looks[(i + k) % 4][1], ring: looks[(i + k) % 4][2], seed: i * 1.7 + k,
  })));
  // nebula regions: coloured haze over that part of the zone
  const NEB = [0x8a5cff, 0xff7a3c, 0x3cc8c0, 0x5a8a4a, 0x8ab8ff, 0xff6aa8];
  R.nebulae = map.regions.filter(g => g.kind === 'nebula').map((g, i) => ({ x: g.x * TILE, y: -g.y * TILE, r: g.r * TILE, c: NEB[i % NEB.length] }));
}
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const sfx = new Sfx();

/** Render space: X = sim x, Y = -sim y, z up. Ships hover at this height between the walls. */
const SHIP_Z = 10;
const VOX = 2; // world px per voxel
const ui = new Ui({ W, H, R, world, tune, map, me: ME, shipZ: SHIP_Z, sfx });
// first launch: the controls and tips card (once per browser; ?tips shows it again)
ui.tips = !params.has('manual') && !params.has('bot') && (params.has('tips') || (() => {
  try { return !localStorage.getItem('bw-proto-tips'); } catch { return true; }
})());
const BULLET = [0, 0x9fe4ff, 0xffe27a, 0xff86e0], BOMB = [0, 0xff8a3a, 0xff4fb0, 0xb07dff];

/**
 * Sizes the canvas to the screen's real pixels: the page is a whole multiple k of the world's
 * 480 x 270 in CSS pixels, and the canvas holds k x devicePixelRatio pixels per world pixel, so
 * the browser shows it 1:1 and never stretches (which smears pixel art when it moves).
 */
function fit(): void {
  const k = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  R.setScale(Math.min(4, k * (devicePixelRatio || 1)));
  canvas.width = R.hiW; canvas.height = R.hiH;
  const css = R.hiW / (devicePixelRatio || 1);
  canvas.style.width = `${css}px`; canvas.style.height = `${css * H / W}px`;
}
addEventListener('resize', fit); fit();

// ---- the views and the blended camera -----------------------------------------------------------
type View = 'top' | 'iso' | 'chase';
const VIEWS: View[] = ['top', 'iso', 'chase'];
const VIEW_NAME: Record<View, string> = { top: 'TOP-DOWN', iso: 'ISOMETRIC', chase: 'THIRD-PERSON' };
let view: View = (VIEWS as string[]).includes(params.get('view') ?? '') ? params.get('view') as View : 'top';
let isoTurn = 0; // extra yaw the player dialled in for the top and iso views
let zoom = 1;
interface Cam { yaw: number; pitch: number; logDist: number; logScale: number; lead: number; lift: number }
function camGoal(sh: Ship): Cam {
  const yawShip = -sh.a;
  if (view === 'top') return { yaw: Math.PI / 2 + isoTurn, pitch: Math.PI / 2, logDist: Math.log(700), logScale: Math.log(0.5 * zoom), lead: 0, lift: 0 };
  if (view === 'iso') return { yaw: Math.PI / 2 + Math.PI / 4 + isoTurn, pitch: 0.66, logDist: Math.log(700), logScale: Math.log(0.56 * zoom), lead: 0, lift: 0 };
  return { yaw: yawShip, pitch: 0.34, logDist: Math.log(130), logScale: Math.log(1.35 * zoom), lead: 60, lift: 12 };
}
let cam: Cam | null = null;
let camX = 0, camY = 0;
// look-ahead for racing: the view drifts a little ahead of where you are flying, smoothly
let aheadX = 0, aheadY = 0;
const angTo = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function updateCamera(dt: number, sh: Ship): CameraState {
  const goal = camGoal(sh);
  if (!cam || params.has('snap')) cam = { ...goal };
  // exponential approach: every parameter glides, nothing ever cuts
  const k = 1 - Math.exp(-dt * 3.2), ky = 1 - Math.exp(-dt * (view === 'chase' ? 7 : 3.2));
  cam.yaw += angTo(cam.yaw, goal.yaw) * ky;
  cam.pitch += (goal.pitch - cam.pitch) * k;
  cam.logDist += (goal.logDist - cam.logDist) * k;
  cam.logScale += (goal.logScale - cam.logScale) * k;
  cam.lead += (goal.lead - cam.lead) * k;
  cam.lift += (goal.lift - cam.lift) * k;
  camX = sh.x; camY = -sh.y;
  {
    let gx = sh.vx * 0.28, gy = -sh.vy * 0.28;
    const gl = Math.hypot(gx, gy); if (gl > 110) { gx *= 110 / gl; gy *= 110 / gl; }
    if (!sh.alive) { gx = 0; gy = 0; }
    const ka = 1 - Math.exp(-dt * 2.2);
    aheadX += (gx - aheadX) * ka; aheadY += (gy - aheadY) * ka;
  }
  const wAhead = Math.max(0, Math.min(1, (cam.pitch - 0.34) / 0.32)); // top and iso only; chase leads on its own
  const tx = camX + Math.cos(cam.yaw) * cam.lead + aheadX * wAhead, ty = camY + Math.sin(cam.yaw) * cam.lead + aheadY * wAhead;
  let dist = Math.exp(cam.logDist);
  const tz = SHIP_Z + cam.lift;
  // keep the chase camera out of the walls: walk back from the target, stop short of a wall
  const fx = Math.cos(cam.pitch) * Math.cos(cam.yaw), fy = Math.cos(cam.pitch) * Math.sin(cam.yaw), fz = -Math.sin(cam.pitch);
  for (let s = 8; s < dist && cam.pitch < 0.5; s += 4) { // only the low chase view can end up in a rock
    const px = tx - fx * s, py = ty - fy * s, pz = tz - fz * s;
    if (pz > WALL_TOP + 4) break;
    if (tileAt(map, Math.floor(px / TILE), Math.floor(-py / TILE)) === WALL) { dist = Math.max(20, s - 6); break; }
  }
  const scale = Math.exp(cam.logScale) * Math.exp(cam.logDist) / dist * ui.zoomKick; // same picture size when pulled in
  // straight down and square to the map, move the camera in whole screen pixels: the walls and
  // stacks then step cleanly instead of their edges crawling between pixels as you fly
  let sx = tx, sy = ty;
  R.shiftX = 0; R.shiftY = 0;
  if (cam.pitch > 1.5 && Math.abs(angTo(cam.yaw, Math.PI / 2)) < 0.01) {
    const px = 1 / scale; sx = Math.round(tx / px) * px; sy = Math.round(ty / px) * px;
    // ...and slide the finished picture by the remainder, in the screen's own pixels
    R.shiftX = Math.round((tx - sx) * scale * R.F); R.shiftY = Math.round(-(ty - sy) * scale * R.F);
  }
  const [qx, qy] = ui.shake; // the kill's little shake, in screen pixels
  R.shiftX += Math.round(qx * R.F); R.shiftY += Math.round(qy * R.F);
  return { tx: sx, ty: sy, tz, yaw: cam.yaw, pitch: cam.pitch, dist, scale };
}

// ---- input ------------------------------------------------------------------------------------
const down = new Set<string>();
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  sfx.start();
  if (e.repeat) return;
  if (ui.tips) { // any key closes the card (and is not also flown with)
    ui.tips = false; try { localStorage.setItem('bw-proto-tips', '1'); } catch { /* private mode */ }
    e.preventDefault(); return;
  }
  if (e.code === 'KeyT') { ui.tips = true; down.clear(); return; }
  down.add(e.code);
  if (e.code === 'KeyM') sfx.toggle();
  if (e.code === 'Digit1') view = 'top';
  if (e.code === 'Digit2') view = 'iso';
  if (e.code === 'Digit3') view = 'chase';
  if (e.code === 'KeyC') view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  if (e.code === 'KeyL') showStack = !showStack;
  if (e.code === 'KeyH') showHud = !showHud;
  if (e.code === 'KeyI') showStats = !showStats;
  if (e.code === 'KeyO') opt.outline = !opt.outline;
  if (e.code === 'KeyP') opt.palette = !opt.palette;
  if (e.code === 'KeyG') opt.dither = !opt.dither;
  if (e.code === 'Equal') zoom = Math.min(2, zoom * 1.25);
  if (e.code === 'Minus') zoom = Math.max(0.5, zoom / 1.25);
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => down.clear());
let dragX: number | null = null;
canvas.addEventListener('pointerdown', e => {
  dragX = e.clientX; sfx.start();
  if (ui.tips) { ui.tips = false; try { localStorage.setItem('bw-proto-tips', '1'); } catch { /* private mode */ } }
});
addEventListener('pointerup', () => { dragX = null; });
addEventListener('pointermove', e => { if (dragX !== null && view !== 'chase') { isoTurn -= (e.clientX - dragX) * 0.01; dragX = e.clientX; } });
const held = (...c: string[]): boolean => c.some(k => down.has(k));
function readInput(): ShipInput {
  return {
    left: held('ArrowLeft', 'KeyA'), right: held('ArrowRight', 'KeyD'), thrust: held('ArrowUp', 'KeyW'), rev: held('ArrowDown', 'KeyS'),
    burn: held('ShiftLeft', 'ShiftRight'), fire: held('Space'), bomb: held('KeyF', 'KeyB'), mine: held('KeyE'),
  };
}
const opt = { outline: true, palette: false, dither: false };
let showStack = params.has('stack'), showHud = !params.has('nohud'), showStats = params.has('debug');

// ---- effects (look only) --------------------------------------------------------------------------
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; col: number; size: number }
interface Flash { x: number; y: number; z: number; r: number; life: number; max: number; cr: number; cg: number; cb: number; ring: number }
const bits: Bit[] = [], flashes: Flash[] = [];
// Banking: each ship leans into its turn on a soft spring (a little settle when you let go). The
// lean follows how fast the ship is actually turning, measured per game step, so it never jitters.
const MAX_BANK = 0.78; // radians, about 45 degrees at full turn rate
const bank = new Map<number, { r: number; v: number }>(), simA = new Map<number, number>(), turnRateOf = new Map<number, number>();
const rnd = Math.random;
function burst(x: number, y: number, n: number, speed: number, cols: number[]): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 1.4, s = speed * (0.3 + rnd() * 0.7);
    bits.push({ x, y, z: SHIP_Z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(a) * Math.cos(e) * s, vz: Math.sin(e) * s,
      life: 0, max: 0.5 + rnd() * 0.9, col: cols[i % cols.length], size: 1.6 + rnd() * 2.4 });
  }
}
/** Fight numbers for checks: volleys fired, bullet hits and kills, everyone counted. */
const fightStats = { volleys: 0, hits: 0, kills: 0 };
function effects(): void {
  ui.events(world.events);
  for (const sh of world.ships) { // turn rate this step, for the banking
    const prev = simA.get(sh.id) ?? sh.a;
    turnRateOf.set(sh.id, sh.alive ? angTo(prev, sh.a) / STEP : 0);
    simA.set(sh.id, sh.a);
  }
  for (const ev of world.events) {
    if (ev.type === 'shot' && ev.kind === 'bullet') fightStats.volleys++;
    else if (ev.type === 'hit') fightStats.hits++;
    else if (ev.type === 'kill' && ev.by >= 0) fightStats.kills++;
    if (ev.type === 'kill' && ev.by === ME && ev.ship !== ME) { // your kill: a gold shock ring and sparks
      const v = world.ships[ev.ship];
      flashes.push({ x: v.x, y: -v.y, z: SHIP_Z + 8, r: 240, life: 0, max: 0.7, cr: 1.8, cg: 1.4, cb: 0.5, ring: 90 });
      burst(v.x, -v.y, 34, 220, [0xffd060, 0xfff2b0, 0xffffff, 0xffa040]);
    }
    if (ev.type === 'burst') {
      const big = ev.n > 10;
      burst(ev.x, -ev.y, ev.n * (big ? 2 : 1), ev.speed * (big ? 1 : 0.8), big ? [0xd8d8e0, 0xff9a3c, 0xffd060, 0xe06c22, 0x6a6a7a] : [0xffe27a, 0xffffff]);
      flashes.push({ x: ev.x, y: -ev.y, z: SHIP_Z + 6, r: big ? 180 : 40, life: 0, max: big ? 0.6 : 0.15, cr: 1.6, cg: 0.9, cb: 0.4, ring: big ? 60 : 0 });
    } else if (ev.type === 'blast') {
      flashes.push({ x: ev.x, y: -ev.y, z: SHIP_Z + 4, r: ev.r * 2.2, life: 0, max: 0.45, cr: 1.4, cg: 0.7, cb: 1.2, ring: ev.r });
      burst(ev.x, -ev.y, 18, 160, [0xff5fb0, 0xffa8d8, 0xff8a3a]);
    } else if (ev.type === 'hit') {
      const s = world.ships[ev.ship];
      burst(s.x, -s.y, 5, 90, [0xffffff, 0x9fe4ff]);
    }
  }
}

// ---- drawing a frame ----------------------------------------------------------------------------
// a few rocks, all deep down at about the same depth: one slow layer, not many fast ones
const rocks = Array.from({ length: openWorld ? 360 : 110 }, (_, i) => ({
  x: rnd() * world.size, y: -rnd() * world.size, z: -300 - rnd() * 60, m: `rock${i % 5}`,
  yaw: rnd() * 6.28, spin: (rnd() - 0.5) * 0.12, tilt: rnd() * 6.28,
}));

let lastLights: Light[] = [];
function draw(time: number, dt: number): CameraState {
  const me = world.ships[ME];
  const cs = updateCamera(dt, me);
  R.setCamera(cs);
  R.begin(time);
  R.drawWalls(mesh);
  const lights: Light[] = [];
  const centre = map.centre * TILE;
  R.drawModel(models.get('station')!, centre, -centre, -96, time * 0.08, 2.4, 1);
  lights.push({ x: centre, y: -centre, z: -70, r: 260, cr: 0.15, cg: 0.5, cb: 0.4, halo: 0 });
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    R.drawModel(models.get(r.m)!, r.x, r.y, r.z, r.yaw + time * r.spin, VOX, 2 + i, r.tilt);
  }
  // salvage pods: turning, bobbing, glowing violet
  for (const p of world.salvage) {
    const blink = p.age > tune.salvage_life - 5 && Math.floor(time * 2) % 2 === 0;
    if (blink) continue;
    R.drawModel(models.get('pod')!, p.x, -p.y, SHIP_Z, time * 0.6 + p.id, 1.6, 500 + (p.id % 400));
    lights.push({ x: p.x, y: -p.y, z: SHIP_Z + 6, r: 60, cr: 0.7, cg: 0.35, cb: 1.2, halo: 10 });
  }
  for (const mn of world.mines) {
    R.drawModel(models.get('mine')!, mn.x, -mn.y, SHIP_Z - 2, time * 0.5, VOX, 900);
    if (Math.floor(time + mn.x) % 2 === 0) lights.push({ x: mn.x, y: -mn.y, z: SHIP_Z + 4, r: 40, cr: 1.2, cg: 0.2, cb: 0.15, halo: 6 });
  }
  // ships
  for (const sh of world.ships) {
    if (!sh.alive) continue;
    const b = bank.get(sh.id) ?? { r: 0, v: 0 };
    const full = tune[`${sh.hull}_turn`], target = Math.max(-1, Math.min(1, (turnRateOf.get(sh.id) ?? 0) / full)) * MAX_BANK;
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 120) { // spring: w 13/s, damping 0.72
      const h = Math.min(left, 1 / 120), W0 = 13;
      b.v += ((target - b.r) * W0 * W0 - 2 * 0.72 * W0 * b.v) * h; b.r += b.v * h;
    }
    bank.set(sh.id, b);
    const rl = b.r;
    const side = sh.id === ME ? 0 : 1, m = models.get(`${sh.hull}:${side}`)!;
    const x = sh.x, y = -sh.y, yaw = -sh.a, z = SHIP_Z; // no bob: a moving voxel grid shimmers
    R.drawModelHi(m, x, y, z, yaw, VOX / 2, 1000 + sh.id, rl, sh.flash > 0 ? 0.6 : 0);
    // thrusters: a soft plume from every nozzle, steady with a slow shimmer, longer on the burner
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const glowCol = side === 0 ? [0.35, 0.75, 1.0] : [1.0, 0.6, 0.25];
    ENGINES[sh.hull].forEach(([ex, ey], n) => {
      const nx = x + (ex * c - ey * s) * VOX, ny = y + (ex * s + ey * c) * VOX;
      R.glow(nx, ny, z, 2.2, glowCol[0] * 0.5, glowCol[1] * 0.5, glowCol[2] * 0.5); // pilot light, always on
      if (!sh.thrusting) return;
      const L = (sh.burning ? 34 : 22) * (1 + 0.05 * Math.sin(time * 11 + n * 2 + sh.id));
      for (let k = 0; k < 8; k++) {
        const t = k / 7, d = t * L, rr = (sh.burning ? 5.5 : 4.5) * (1 - t * 0.6);
        const hot = Math.max(0, 1 - t * 3); // white-hot near the nozzle
        const fade = (1 - t) * 0.55;
        R.glow(nx - c * d, ny - s * d, z, rr, (glowCol[0] + hot) * fade, (glowCol[1] + hot) * fade, (glowCol[2] + hot) * fade);
      }
    });
    if (sh.thrusting) {
      const back = HULL_RADIUS[sh.hull] + 6;
      lights.push({ x: x - c * back, y: y - s * back, z: z + 2, r: sh.burning ? 90 : 60, cr: glowCol[0], cg: glowCol[1], cb: glowCol[2], halo: 0 });
    }
    if (sh.shield > 0) {
      for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2 + time; R.drawPoint(x + Math.cos(a) * 22, y + Math.sin(a) * 22, z, 0x6dffb4, 1.6); }
    }
  }
  aimGuide(me);
  // fire
  for (const sh of world.shots) {
    const x = sh.x, y = -sh.y, vx = sh.vx, vy = -sh.vy, sp = Math.hypot(vx, vy) || 1;
    if (sh.kind === 'bullet') {
      const col = BULLET[sh.level] ?? 0xffffff;
      R.drawPoint(x, y, SHIP_Z, 0xffffff, 3.4);
      for (let k = 1; k <= 3; k++) R.drawPoint(x - (vx / sp) * k * 3.5, y - (vy / sp) * k * 3.5, SHIP_Z, col, 3 - k * 0.5);
      lights.push({ x, y, z: SHIP_Z + 3, r: 46, cr: ((col >> 16) & 255) / 160, cg: ((col >> 8) & 255) / 160, cb: (col & 255) / 160, halo: 7 });
    } else {
      const col = BOMB[sh.level] ?? 0xff8a3a, pulse = 4.5 + Math.sin(time * 20) * 1;
      R.drawPoint(x, y, SHIP_Z, col, pulse);
      R.drawPoint(x, y, SHIP_Z + 0.5, 0xffffff, pulse * 0.45);
      lights.push({ x, y, z: SHIP_Z + 4, r: 80, cr: ((col >> 16) & 255) / 130, cg: ((col >> 8) & 255) / 130, cb: (col & 255) / 130, halo: 16 });
    }
  }
  // debris and flashes
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.life += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vx *= 0.985; b.vy *= 0.985; b.vz *= 0.985;
    if (b.life > b.max) { bits.splice(i, 1); continue; }
    R.drawPoint(b.x, b.y, b.z, b.col, b.size * (1 - (b.life / b.max) * 0.6));
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.life += dt;
    if (f.life > f.max) { flashes.splice(i, 1); continue; }
    const k = 1 - f.life / f.max;
    lights.push({ x: f.x, y: f.y, z: f.z, r: f.r, cr: f.cr * k, cg: f.cg * k, cb: f.cb * k, halo: f.r * 0.25 * k });
    if (f.ring) {
      const rr = f.ring * (0.3 + 0.7 * (f.life / f.max)), nseg = Math.max(16, Math.round(rr * 0.6));
      for (let s = 0; s < nseg; s++) { const a = (s / nseg) * Math.PI * 2; R.drawPoint(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, SHIP_Z, k > 0.5 ? 0xffd060 : 0xff5fb0, 2.2); }
    }
  }
  R.resolve(lights, mesh.info, map.tiles, map.n, opt);
  lastLights = lights;
  return cs;
}

/**
 * The aim line: where your bullets would go if you fired now (they carry your ship's speed), as
 * a row of faint dots from the nose. It turns warm, and the target gets brackets, when a shot
 * fired now would meet an enemy that keeps its course. A hint only: nothing steers your shots.
 */
function aimGuide(me: Ship): void {
  ui.lockId = -1; ui.aimPts.length = 0;
  if (!me.alive || inSafe(map, me.x, me.y)) return;
  const c = Math.cos(me.a), s = Math.sin(me.a), r = HULL_RADIUS[me.hull];
  const bvx = me.vx + c * tune.gun_speed, bvy = me.vy + s * tune.gun_speed;
  const ox = me.x + c * r, oy = me.y + s * r;
  let best = Infinity;
  for (const e of world.ships) {
    if (e.id === ME || !e.alive || e.shield > 0) continue;
    const rx = e.x - ox, ry = e.y - oy, vx = e.vx - bvx, vy = e.vy - bvy, v2 = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(tune.gun_life, -(rx * vx + ry * vy) / (v2 || 1)));
    const dx = rx + vx * t, dy = ry + vy * t, rr = HULL_RADIUS[e.hull] + tune.gun_reach;
    if (dx * dx + dy * dy < rr * rr && t < best) { best = t; ui.lockId = e.id; }
  }
  const n = 22, span = Math.min(best, 0.4);
  for (let k = 1; k <= n; k++) {
    const t = (k / n) * span, x = ox + bvx * t, y = oy + bvy * t;
    if (tileAt(map, Math.floor(x / TILE), Math.floor(y / TILE)) === WALL) break;
    ui.aimPts.push(x, y);
  }
}

// ---- HUD (drawn into the same pixel buffer) ---------------------------------------------------------
const C_TEXT = abgr(0xd2e2f2), C_DIM = abgr(0x7f9fcc), C_BLUE = abgr(0x62c6ff), C_ORANGE = abgr(0xffc47a), C_SAFE = abgr(0x6dffb4);
let radarImg: Uint32Array | null = null;
const RADAR = 64, RSTEP = 4; // radar: 64 px square, one px per four tiles
function hud(fps: number): void {
  const out = R.hud, me = world.ships[ME];
  drawText(out, W, H, `VIEW ${VIEW_NAME[view]}  (1 2 3 OR C)`, 4, 4, C_BLUE);
  drawText(out, W, H, `M SOUND ${sfx.muted ? 'OFF' : 'ON'}  H HUD  L STACKS`, 4, 12, C_DIM);
  drawText(out, W, H, openWorld ? 'HOLD TAB FOR THE MAP' : 'DRAG TURNS THE VIEW', 4, 19, C_DIM);
  if (openWorld) drawText(out, W, H, `IN ${hereName}`, 4, 28, abgr(hereColour));
  if (showStats) drawText(out, W, H, `${fps.toFixed(0)} FPS  ${R.stats.quads} QUADS  ${(R.stats.voxels / 1000).toFixed(1)}K VOXELS  ${R.stats.lights} LIGHTS`, 4, 36, C_DIM);
  // radar
  if (!radarImg) {
    const n = Math.ceil(map.n / RSTEP);
    radarImg = new Uint32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let wall = 0, safe = 0;
      for (let j = 0; j < RSTEP; j++) for (let i = 0; i < RSTEP; i++) { const t = tileAt(map, x * RSTEP + i, y * RSTEP + j); if (t === WALL) wall++; if (t === SAFE) safe++; }
      radarImg[y * n + x] = safe ? abgr(0x0c4a34) : wall > 4 ? abgr(0x374d82) : wall ? abgr(0x1f2c52) : abgr(0x05060c);
    }
  }
  const n = Math.ceil(map.n / RSTEP), ox = W - RADAR - 4, oy = H - RADAR - 12;
  const mx = Math.floor(me.x / TILE / RSTEP) - RADAR / 2, my = Math.floor(me.y / TILE / RSTEP) - RADAR / 2;
  for (let y = 0; y < RADAR; y++) for (let x = 0; x < RADAR; x++) {
    const sx = mx + x, sy = my + y;
    out[(oy + y) * W + ox + x] = sx >= 0 && sy >= 0 && sx < n && sy < n ? radarImg[sy * n + sx] : abgr(0x05060c);
  }
  for (let i = -1; i <= RADAR; i++) { out[(oy - 1) * W + ox + i] = C_DIM; out[(oy + RADAR) * W + ox + i] = C_DIM; out[(oy + i) * W + ox - 1] = C_DIM; out[(oy + i) * W + ox + RADAR] = C_DIM; }
  const dot = (wx: number, wy: number, c: number) => {
    const x = Math.floor(wx / TILE / RSTEP) - mx, y = Math.floor(wy / TILE / RSTEP) - my;
    if (x >= 0 && y >= 0 && x < RADAR && y < RADAR) out[(oy + y) * W + ox + x] = c;
  };
  for (const p of world.salvage) dot(p.x, p.y, abgr(0xc690ff));
  for (const sh of world.ships) if (sh.alive) dot(sh.x, sh.y, sh.id === ME ? C_SAFE : C_ORANGE);
  ui.draw(out);
  if (openWorld && down.has('Tab')) worldMap(out, me);
}

// ---- the open world: where you are, and the map --------------------------------------------------
const KIND_LABEL: Record<Region['kind'], string> = { hub: 'SAFE HUB', field: 'ASTEROID FIELD', derelict: 'DERELICT STATION', nebula: 'NEBULA', belt: 'THE RIM: NO WAY THROUGH' };
const KIND_COLOUR: Record<Region['kind'], number> = { hub: 0x6dffb4, field: 0xd2d6e0, derelict: 0x8fb8ff, nebula: 0xc9a0ff, belt: 0xa0a4b0 };
/** The region at a point (sim px): the rim first, then a field, derelict or the hub, then a nebula. */
function regionAt(px: number, py: number): Region | null {
  const tx = px / TILE, ty = py / TILE, e = Math.min(tx, ty, map.n - tx, map.n - ty);
  let best: Region | null = null;
  for (const g of map.regions) {
    if (g.kind === 'belt') { if (e < g.r) return g; continue; }
    if (Math.hypot(tx - g.x, ty - g.y) < g.r && (!best || (best.kind === 'nebula' && g.kind !== 'nebula'))) best = g;
  }
  return best;
}
let hereName = 'DEEP SPACE', hereColour = 0x7f9fcc, hereClock = 0;
function trackRegion(dt: number): void {
  if ((hereClock -= dt) > 0 || !openWorld) return;
  hereClock = 0.3;
  const me = world.ships[ME];
  if (!me.alive) return;
  const g = regionAt(me.x, me.y), name = g ? g.name : 'DEEP SPACE';
  if (name !== hereName) ui.announce(name, g ? KIND_LABEL[g.kind] : 'OPEN SPACE', g ? KIND_COLOUR[g.kind] : 0x7f9fcc);
  hereName = name; hereColour = g ? KIND_COLOUR[g.kind] : 0x7f9fcc;
}

const MS = 230; // the world map's size in HUD pixels
let mapImg: Uint32Array | null = null;
function worldMap(out: Uint32Array, me: Ship): void {
  const n = map.n, k = n / MS, nebs = map.regions.filter(q => q.kind === 'nebula');
  if (!mapImg) {
    mapImg = new Uint32Array(MS * MS);
    for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
      let wall = 0, safe = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const t = tileAt(map, Math.floor((x + i / 4) * k), Math.floor((y + j / 4) * k));
        if (t === WALL) wall++; else if (t === SAFE) safe++;
      }
      const rimDist = Math.min(x, y, MS - 1 - x, MS - 1 - y) * k;
      let c = safe ? 0x0c5a3c : wall > 8 ? (rimDist < 14 ? 0x1c2030 : 0x4a5068) : wall > 2 ? 0x2a2e40 : 0x070910;
      nebs.forEach((g, i) => {
        const d = Math.hypot(x * k - g.x, y * k - g.y) / g.r;
        if (d < 1) c = mix(c, R.nebulae[i]?.c ?? 0x8a5cff, (1 - d) * 0.35);
      });
      mapImg[y * MS + x] = abgr(c);
    }
  }
  const ox = (W - MS) >> 1, oy = ((H - MS) >> 1) + 6;
  for (let i = 0; i < W * H; i++) out[i] = 0xd0000000 | (out[i] && (out[i] >>> 24) === 255 ? 0x100804 : 0x100804); // dim everything under the map
  for (let y = -12; y < MS + 3; y++) for (let x = -3; x < MS + 3; x++) out[(oy + y) * W + ox + x] = abgr(0x0a1020);
  for (let y = 0; y < MS; y++) out.set(mapImg.subarray(y * MS, y * MS + MS), (oy + y) * W + ox);
  drawText(out, W, H, 'ZONE MAP', ox, oy - 9, C_TEXT);
  const placed: number[][] = []; // labels nudged down until they don't overlap
  for (const g of map.regions) {
    if (g.kind === 'belt') continue;
    const name = g.name, w = name.length * 4 - 1;
    const x = Math.max(ox, Math.min(ox + MS - w - 1, ox + Math.round(g.x / k - w / 2)));
    let y = oy + Math.round(g.y / k - 2);
    for (let tries = 0; tries < 6 && placed.some(([a, b, c2]) => x < a + c2 + 3 && a < x + w + 3 && Math.abs(b - y) < 7); tries++) y += 7;
    placed.push([x, y, w]);
    drawText(out, W, H, name, x, y, abgr(KIND_COLOUR[g.kind]));
  }
  const dot = (wx: number, wy: number, c: number, s = 1) => {
    const x = ox + Math.floor(wx / TILE / k), y = oy + Math.floor(wy / TILE / k);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) out[(y + j) * W + x + i] = c;
  };
  for (const p of world.salvage) dot(p.x, p.y, abgr(0xc690ff));
  for (const sh of world.ships) if (sh.alive && sh.id !== ME) dot(sh.x, sh.y, C_ORANGE, 2);
  if (me.alive && Math.floor(performance.now() / 250) % 2 === 0) dot(me.x - TILE * k, me.y - TILE * k, abgr(0x6dffb4), 3);
}
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The slice viewer: your hull's stack laid out slice by slice, and drawn the classic way. */
function stackPanel(time: number): void {
  const me = world.ships[ME], m: Model = models.get(`${me.hull}:0`)!, s = m.stack, out = R.hud;
  const px = 6, py = 30, pw = Math.max(8 + s.h * (s.w + 3), 130), ph = s.d + 92;
  for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) out[y * W + x] = abgr(0x0a0d1a);
  drawText(out, W, H, `${m.name} AS ${s.h} SLICES`, px + 3, py + 3, C_TEXT);
  for (let z = 0; z < s.h; z++) {
    const sl = s.slice(z), x0 = px + 4 + z * (s.w + 3), y0 = py + 12;
    for (let y = 0; y < s.d; y++) for (let x = 0; x < s.w; x++) {
      const c = sl[y * s.w + x];
      out[(y0 + y) * W + x0 + x] = c ? abgr(c & 0xffffff) : abgr(0x10162a);
    }
  }
  // classic sprite stacking: draw each slice turned, one pixel higher than the one below
  const cx = px + pw / 2, cy = py + ph - 26, a = time * 0.8, ca = Math.cos(a), sa = Math.sin(a), K = 3;
  for (let z = 0; z < s.h; z++) {
    const sl = s.slice(z);
    for (let y = 0; y < s.d; y++) for (let x = 0; x < s.w; x++) {
      const c = sl[y * s.w + x];
      if (!c) continue;
      const lx = (x + 0.5 - s.w / 2) * K, ly = (y + 0.5 - s.d / 2) * K;
      for (let oy = -1.5; oy <= 1.5; oy += 0.75) for (let ox = -1.5; ox <= 1.5; ox += 0.75) {
        const rx = (lx + ox) * ca - (ly + oy) * sa, ry = (lx + ox) * sa + (ly + oy) * ca;
        for (let k = 0; k < K; k++) {
          const sx = Math.round(cx + rx), sy = Math.round(cy + ry * 0.55 - z * K - k);
          out[sy * W + sx] = abgr(c & 0xffffff);
        }
      }
    }
  }
  drawText(out, W, H, 'DRAWN THE CLASSIC WAY:', px + 3, py + s.d + 18, C_DIM);
}

// ---- the loop -----------------------------------------------------------------------------------
// ---- smooth motion: draw between the last two game steps ------------------------------------
// The rules step 60 times a second; screens refresh at 60, 120, 144 Hz or stutter below. Drawing
// the ships and shots part way between their last two positions makes motion glide on any of them.
const prevShip = new Map<number, [number, number, number]>(), prevShot = new Map<object, [number, number]>();
function snapshot(): void {
  for (const sh of world.ships) prevShip.set(sh.id, [sh.x, sh.y, sh.a]);
  prevShot.clear();
  for (const s of world.shots) prevShot.set(s, [s.x, s.y]);
}
const saved: number[] = [];
/** Moves everything to where it is `t` of the way from the last step to this one (for drawing only). */
function blendIn(t: number): void {
  saved.length = 0;
  for (const sh of world.ships) {
    saved.push(sh.x, sh.y, sh.a);
    const p = prevShip.get(sh.id);
    if (!p || Math.hypot(sh.x - p[0], sh.y - p[1]) > 80) continue; // a relaunch: no gliding
    sh.x = p[0] + (sh.x - p[0]) * t; sh.y = p[1] + (sh.y - p[1]) * t; sh.a = p[2] + angTo(p[2], sh.a) * t;
  }
  for (const s of world.shots) {
    saved.push(s.x, s.y);
    const p = prevShot.get(s);
    if (p) { s.x = p[0] + (s.x - p[0]) * t; s.y = p[1] + (s.y - p[1]) * t; }
  }
}
/** Puts everything back where the rules left it. */
function blendOut(): void {
  let i = 0;
  for (const sh of world.ships) { sh.x = saved[i++]; sh.y = saved[i++]; sh.a = saved[i++]; }
  for (const s of world.shots) { s.x = saved[i++]; s.y = saved[i++]; }
}

let acc = 0, last = performance.now(), fps = 60, simTime = 0, frames = 0;
const warm = Number(params.get('warm') ?? 0); // seconds of zone to run before the first frame
for (let i = 0; i < warm / STEP; i++) { simStep(world, new Map(), tune, STEP); world.events.length = 0; }

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  if (ui.hitStop > 0) ui.hitStop -= dt; // the kill's freeze-frame: the zone holds its breath
  else if (!ui.tips) acc += dt; // the zone waits while the tips card is up
  ui.update(dt);
  trackRegion(dt);
  const input = readInput();
  while (acc >= STEP) {
    snapshot();
    simStep(world, new Map([[ME, input]]), tune, STEP);
    effects();
    world.events.length = 0;
    acc -= STEP; simTime += STEP;
  }
  blendIn(acc / STEP);
  render(dt);
  blendOut();
  frames++;
  requestAnimationFrame(frame);
}
function render(dt: number): void {
  draw(simTime, dt);
  if (showHud) hud(fps);
  if (showStack) stackPanel(simTime);
  R.composite(lastLights);
  ctx.putImageData(R.present(), 0, 0);
}

/** What a check (Playwright) can drive: views, steps and frames without the clock. */
(window as unknown as { proto: unknown }).proto = {
  world, setView(v: View) { view = v; }, get view() { return view; },
  /** Runs the zone n steps and draws one frame per `every` steps (camera glides at 60 fps). */
  run(n: number, every = 1) {
    for (let i = 0; i < n; i++) {
      simStep(world, new Map([[ME, readInput()]]), tune, STEP); effects(); world.events.length = 0; simTime += STEP;
      ui.update(STEP); ui.hitStop = 0; trackRegion(STEP);
      if ((i + 1) % every === 0 || i === n - 1) render(STEP * every);
    }
  },
  stats: fightStats,
  locked() { return ui.lockId; },
  showTips(on: boolean) { ui.tips = on; },
  regions: map.regions,
  aim() { return ui.aimPts; },
  hold(code: string, on: boolean) { if (on) down.add(code); else down.delete(code); },
  set(o: Partial<typeof opt>) { Object.assign(opt, o); },
  toggleStack(on: boolean) { showStack = on; },
  timeFrame() { const t = performance.now(); render(1 / 60); return performance.now() - t; },
};
if (!params.has('manual')) requestAnimationFrame(frame); else render(1 / 60);
void frames;
