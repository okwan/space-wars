// PROTOTYPE - NOT FOR PRODUCTION
// Question: does Beacon Wars look and play better as 2.5D sprite stacks in a software pixel
// renderer, with a camera that blends top-down, isometric and a chase view without a cut?
// Date: 2026-11-19
//
// The real rules fly underneath: src/game (the free-for-all zone, its map, bots, guns, bombs,
// mines and salvage) runs unchanged. Only the picture is new.

import config from '../../data/config.json';
import { SAFE, TILE, WALL, tileAt, zoneMap } from '../../src/game/map';
import { STEP, step as simStep } from '../../src/game/sim';
import { maxEnergy } from '../../src/game/salvage';
import { tuningFrom } from '../../src/game/tuning';
import { HULL_RADIUS, type Ship, type ShipInput } from '../../src/game/types';
import { newWorld } from '../../src/game/world';
import { abgr, drawText, textWidth } from './render/font';
import { buildModels, type Model } from './render/models';
import { Renderer, type CameraState, type Light } from './render/raster';
import { buildWalls, WALL_TOP } from './render/walls';

// ---- setup --------------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const W = 480, H = 270;
const tune = tuningFrom(config);
const seed = Number(params.get('seed') ?? config.seed);
const world = newWorld(tune, { seed, humans: params.has('bot') ? [] : [0] });
const ME = 0;
const map = zoneMap(world.mapSeed, world.tiles);
const mesh = buildWalls(map);
const models = buildModels();
const R = new Renderer(W, H);
R.deckCentre = map.centre * TILE;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d')!;

/** Render space: X = sim x, Y = -sim y, z up. Ships hover at this height between the walls. */
const SHIP_Z = 10;
const VOX = 2; // world px per voxel
const BULLET = [0, 0x9fe4ff, 0xffe27a, 0xff86e0], BOMB = [0, 0xff8a3a, 0xff4fb0, 0xb07dff];

function fit(): void {
  const k = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = `${W * k}px`; canvas.style.height = `${H * k}px`;
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
  const tx = camX + Math.cos(cam.yaw) * cam.lead, ty = camY + Math.sin(cam.yaw) * cam.lead;
  let dist = Math.exp(cam.logDist);
  const tz = SHIP_Z + cam.lift;
  // keep the chase camera out of the walls: walk back from the target, stop short of a wall
  const fx = Math.cos(cam.pitch) * Math.cos(cam.yaw), fy = Math.cos(cam.pitch) * Math.sin(cam.yaw), fz = -Math.sin(cam.pitch);
  for (let s = 8; s < dist; s += 4) {
    const px = tx - fx * s, py = ty - fy * s, pz = tz - fz * s;
    if (pz > WALL_TOP + 4) break;
    if (tileAt(map, Math.floor(px / TILE), Math.floor(-py / TILE)) === WALL) { dist = Math.max(20, s - 6); break; }
  }
  const scale = Math.exp(cam.logScale) * Math.exp(cam.logDist) / dist; // same picture size when pulled in
  // straight down and square to the map, move the camera in whole screen pixels: the walls and
  // stacks then step cleanly instead of their edges crawling between pixels as you fly
  let sx = tx, sy = ty;
  if (cam.pitch > 1.5 && Math.abs(angTo(cam.yaw, Math.PI / 2)) < 0.01) { const px = 1 / scale; sx = Math.round(tx / px) * px; sy = Math.round(ty / px) * px; }
  return { tx: sx, ty: sy, tz, yaw: cam.yaw, pitch: cam.pitch, dist, scale };
}

// ---- input ------------------------------------------------------------------------------------
const down = new Set<string>();
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
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
canvas.addEventListener('pointerdown', e => { dragX = e.clientX; });
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
const roll = new Map<number, number>(), lastA = new Map<number, number>();
const rnd = Math.random;
function burst(x: number, y: number, n: number, speed: number, cols: number[]): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 1.4, s = speed * (0.3 + rnd() * 0.7);
    bits.push({ x, y, z: SHIP_Z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(a) * Math.cos(e) * s, vz: Math.sin(e) * s,
      life: 0, max: 0.5 + rnd() * 0.9, col: cols[i % cols.length], size: 1.6 + rnd() * 2.4 });
  }
}
function effects(): void {
  for (const ev of world.events) {
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
const rocks = Array.from({ length: 260 }, (_, i) => ({
  x: rnd() * world.size, y: -rnd() * world.size, z: -90 - rnd() * 240, m: `rock${i % 5}`,
  yaw: rnd() * 6.28, spin: (rnd() - 0.5) * 0.12, tilt: rnd() * 6.28,
}));

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
    const prev = lastA.get(sh.id) ?? sh.a, turn = angTo(prev, sh.a) / Math.max(dt, 1e-3);
    lastA.set(sh.id, sh.a);
    const rl = (roll.get(sh.id) ?? 0) * 0.85 + Math.max(-0.6, Math.min(0.6, turn * 0.13)) * 0.15;
    roll.set(sh.id, rl);
    const side = sh.id === ME ? 0 : 1, m = models.get(`${sh.hull}:${side}`)!;
    const x = sh.x, y = -sh.y, yaw = -sh.a, z = SHIP_Z; // no bob: a moving voxel grid shimmers
    R.drawModel(m, x, y, z, yaw, VOX, 1000 + sh.id, rl, 0, sh.flash > 0 ? 0.7 : 0);
    const c = Math.cos(yaw), s = Math.sin(yaw), back = HULL_RADIUS[sh.hull] + 2;
    const paint = side === 0 ? [0.5, 1.0, 1.6] : [1.6, 0.8, 0.3];
    if (sh.thrusting) {
      const len = sh.burning ? 6 : 3;
      for (let k = 0; k < len; k++) {
        const d = back + k * 2.6 + Math.sin(time * 9 + k + sh.id) * 0.6, j = 0;
        const col = sh.burning ? (k < 2 ? 0xffffff : 0xa8e6ff) : (k === 0 ? (side ? 0xffc47a : 0xa8e6ff) : side ? 0xff9a3c : 0x62c6ff);
        R.drawPoint(x - c * d - s * j, y - s * d + c * j, z, col, 3.2 - k * 0.35);
      }
      lights.push({ x: x - c * back * 1.4, y: y - s * back * 1.4, z: z + 2, r: sh.burning ? 90 : 60, cr: paint[0], cg: paint[1], cb: paint[2], halo: sh.burning ? 12 : 7 });
    }
    if (sh.shield > 0) {
      for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2 + time; R.drawPoint(x + Math.cos(a) * 22, y + Math.sin(a) * 22, z, 0x6dffb4, 1.6); }
    }
  }
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
  return cs;
}

// ---- HUD (drawn into the same pixel buffer) ---------------------------------------------------------
const C_TEXT = abgr(0xd2e2f2), C_DIM = abgr(0x7f9fcc), C_BLUE = abgr(0x62c6ff), C_ORANGE = abgr(0xffc47a), C_GOLD = abgr(0xffd060), C_SAFE = abgr(0x6dffb4);
let radarImg: Uint32Array | null = null;
const RADAR = 64, RSTEP = 3; // radar: 64 px square, one px per three tiles
function hud(fps: number): void {
  const out = R.out, me = world.ships[ME];
  // name tags over ships
  for (const sh of world.ships) {
    if (!sh.alive || sh.id === ME) continue;
    const p = R.project(sh.x, -sh.y, SHIP_Z + 14);
    if (!p || p[2] > R.camDist + 500) continue;
    const name = sh.name.replace('BOT ', '');
    drawText(out, W, H, name, Math.round(p[0] - textWidth(name) / 2), Math.round(p[1] - 10), C_ORANGE);
  }
  drawText(out, W, H, 'BEACON WARS  SPRITE-STACK PROTOTYPE', 4, 4, C_TEXT);
  drawText(out, W, H, `VIEW ${VIEW_NAME[view]}  (1 2 3 OR C)`, 4, 12, C_BLUE);
  if (showStats) drawText(out, W, H, `${fps.toFixed(0)} FPS  ${R.stats.quads} QUADS  ${(R.stats.voxels / 1000).toFixed(1)}K VOXELS  ${R.stats.lights} LIGHTS`, 4, 20, C_DIM);
  const e = `${Math.max(0, Math.round(me.energy))}`;
  drawText(out, W, H, 'ENERGY', W - 4 - textWidth('ENERGY'), 4, C_DIM);
  drawText(out, W, H, e, W - 4 - textWidth(e), 11, me.energy < maxEnergy(me, tune) * 0.3 ? abgr(0xff6a5a) : C_TEXT);
  const kb = `KILLS ${me.kills}  BOUNTY ${me.bounty}`;
  drawText(out, W, H, kb, W - 4 - textWidth(kb), 19, C_GOLD);
  if (!me.alive) { const s = `RELAUNCHING IN ${Math.ceil(me.respawn)}`; drawText(out, W, H, s, (W - textWidth(s)) >> 1, H / 2 - 20, C_TEXT); }
  drawText(out, W, H, 'ARROWS FLY  SHIFT BURN  SPACE GUNS  F BOMB  E MINE  DRAG TURN VIEW  L STACKS  H HUD', 4, H - 8, C_DIM);
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
}

/** The slice viewer: your hull's stack laid out slice by slice, and drawn the classic way. */
function stackPanel(time: number): void {
  const me = world.ships[ME], m: Model = models.get(`${me.hull}:0`)!, s = m.stack, out = R.out;
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
let acc = 0, last = performance.now(), fps = 60, simTime = 0, frames = 0;
const warm = Number(params.get('warm') ?? 0); // seconds of zone to run before the first frame
for (let i = 0; i < warm / STEP; i++) { simStep(world, new Map(), tune, STEP); world.events.length = 0; }

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  acc += dt;
  const input = readInput();
  while (acc >= STEP) {
    simStep(world, new Map([[ME, input]]), tune, STEP);
    effects();
    world.events.length = 0;
    acc -= STEP; simTime += STEP;
  }
  render(dt);
  frames++;
  requestAnimationFrame(frame);
}
function render(dt: number): void {
  draw(simTime, dt);
  if (showHud) hud(fps);
  if (showStack) stackPanel(simTime);
  ctx.putImageData(R.image, 0, 0);
}

/** What a check (Playwright) can drive: views, steps and frames without the clock. */
(window as unknown as { proto: unknown }).proto = {
  world, setView(v: View) { view = v; }, get view() { return view; },
  /** Runs the zone n steps and draws one frame per `every` steps (camera glides at 60 fps). */
  run(n: number, every = 1) {
    for (let i = 0; i < n; i++) {
      simStep(world, new Map([[ME, readInput()]]), tune, STEP); effects(); world.events.length = 0; simTime += STEP;
      if ((i + 1) % every === 0 || i === n - 1) render(STEP * every);
    }
  },
  hold(code: string, on: boolean) { if (on) down.add(code); else down.delete(code); },
  set(o: Partial<typeof opt>) { Object.assign(opt, o); },
  toggleStack(on: boolean) { showStack = on; },
  timeFrame() { const t = performance.now(); render(1 / 60); return performance.now() - t; },
};
if (!params.has('manual')) requestAnimationFrame(frame); else render(1 / 60);
void frames;
