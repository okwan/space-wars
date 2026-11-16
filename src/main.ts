// The page: input, sound, scenes, camera and HUD, drawn with PixiJS. The rules are in game/
// (pure, deterministic, server-ready); the look is in render/art.ts; what the checks drive is
// in hook.ts. Implements design/game-brief.md.

import { Application, Container, Graphics, Text, type TextStyleFontWeight } from 'pixi.js';
import config from '../data/config.json';
import { Sound } from './audio';
import { dist, wd, wrap } from './game/math';
import { skipBreak, startRound, step as simStep, STEP } from './game/sim';
import { tuningFrom } from './game/tuning';
import { HULL_RADIUS, HULLS, WEAPONS, type GameEvent, type Ship, type ShipInput, type Team, type World } from './game/types';
import { gate, newWorld } from './game/world';
import { clock, install, manual, params, seedFrom } from './hook';
import {
  arrow, blip, dashedRing, diamond, drawAsteroid, drawBeacon, drawMine, drawShip, drawShot,
  HULL_NAME, HULL_ROLE, INK, ownerColor, ownerCss, TEAM, WEAPON_NAME, WEAPON_ROLE,
} from './render/art';

const tune = tuningFrom(config);
const W = 1280, H = 720;
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';
const TITLE = 'Beacon Wars';
const ME = 0; // the local player's ship id
const CONTROLS = [
  'Left / Right (or A / D): turn     Up (or W): thrust     Down (or S): reverse',
  'Space: fire     Shift: afterburn     E: drop a mine',
  'While respawning: 1 / 2 / 3 pick a hull, Z / X / C pick a weapon',
  'P: pause     M: mute',
];

// ---- Input: keys by position (event.code), OS key repeat ignored ------------------------
const down = new Set<string>(), hit = new Set<string>();
const pressed = (code: string): boolean => hit.has(code);
const held = (...codes: string[]): boolean => codes.some(c => down.has(c));
const sound = new Sound(config.volume.value);
addEventListener('keydown', e => {
  sound.start();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('pointerup', () => sound.start());
addEventListener('blur', () => down.clear());

// ---- The session: the zone plus what only this screen needs ------------------------------
interface Spark { x: number; y: number; vx: number; vy: number; life: number; team: Team }
interface FeedLine { a: string; at: Team; b: string; bt: Team | -1; t: number }
interface View {
  cam: { x: number; y: number }; shake: number; sparks: Spark[]; feed: FeedLine[];
  banner: { text: string; t: number; team?: Team } | null;
  hint: number; hintT: number; thrustTime: number; turned: boolean;
  loadout: { hull: Ship['hull']; weapon: Ship['weapon'] };
}
let scene = '', world: World, view: View;
const log: GameEvent[] = []; // window.game.events
function reset(): void {
  world = newWorld(tune, { seed: seedFrom(config.seed), humans: [ME] });
  startRound(world, tune);
  world.events = [];
  const me = world.ships[ME];
  view = {
    cam: { x: me.x, y: me.y }, shake: 0, sparks: [], feed: [], banner: { text: 'Round 1: take the beacons', t: 3 },
    hint: 0, hintT: 0, thrustTime: 0, turned: false, loadout: { hull: me.hull, weapon: me.weapon },
  };
}
const me = (): Ship => world.ships[ME];

function myInput(): ShipInput {
  const l = view.loadout;
  for (const [i, k] of ['Digit1', 'Digit2', 'Digit3'].entries()) if (pressed(k)) l.hull = HULLS[i];
  for (const [i, k] of ['KeyZ', 'KeyX', 'KeyC'].entries()) if (pressed(k)) l.weapon = WEAPONS[i];
  return {
    left: held('ArrowLeft', 'KeyA'), right: held('ArrowRight', 'KeyD'), thrust: held('ArrowUp', 'KeyW'),
    rev: held('ArrowDown', 'KeyS'), fire: held('Space'), burn: held('ShiftLeft', 'ShiftRight'), mine: pressed('KeyE'),
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
      case 'hit': if (e.ship === ME) { view.shake = Math.min(10, view.shake + e.amount / 40); sound.hit(); } break;
      case 'burst':
        for (let i = 0; i < e.n; i++) { // sparks are only for the eye, so they use Math.random
          const a = Math.random() * Math.PI * 2, s = e.speed * (0.3 + Math.random() * 0.7);
          view.sparks.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, team: e.team });
        }
        break;
      case 'kill': {
        const v = world.ships[e.ship], k = e.by >= 0 ? world.ships[e.by] : undefined;
        if (near(v.x, v.y, 900)) sound.boom();
        if (e.by === ME) sound.kill();
        view.feed.unshift(k ? { a: k.name, at: k.team, b: v.name, bt: v.team, t: 5 } : { a: v.name, at: v.team, b: 'the rocks', bt: -1, t: 5 });
        view.feed.length = Math.min(view.feed.length, 5);
        break;
      }
      case 'mine': if (e.ship === ME) sound.mine(); break;
      case 'capture': {
        const b = world.beacons[e.beacon];
        if (e.team === 0) { sound.capture(); view.banner = { text: `${b.label} is ours`, t: 2.2, team: 0 }; }
        else if (e.from === 0) { sound.lost(); view.banner = { text: `${b.label} lost`, t: 2.2, team: 1 }; }
        break;
      }
      case 'group': view.banner = { text: 'The amber fleet is moving as one', t: 3, team: 1 }; break;
      case 'round': (e.winner === 0 ? sound.win() : sound.lost()); break;
      case 'roundStart': view.banner = { text: `Round ${e.round}: go`, t: 3 }; break;
    }
  }
}

function updatePlay(dt: number): void {
  const input = myInput();
  if (input.left || input.right) view.turned = true;
  if (input.thrust && me().alive) view.thrustTime += dt;
  if (pressed('Enter')) skipBreak(world, tune);
  simStep(world, new Map([[ME, input]]), tune, dt);
  react(world.events); world.events = [];
  // first-minute hints, taught by doing
  const p = me();
  view.hintT += dt;
  if (view.hint === 0 && view.thrustTime > 1.2 && view.turned) { view.hint = 1; view.hintT = 0; }
  if (view.hint === 1 && (world.beacons.some(b => dist(p, b, world.size) < 450) || view.hintT > 25)) { view.hint = 2; view.hintT = 0; }
  if (view.hint === 2 && (world.beacons.some(b => b.owner === 0 && dist(p, b, world.size) < tune.beacon_radius) || view.hintT > 35)) { view.hint = 3; view.hintT = 0; }
  if (view.hint === 3 && view.hintT > 9) view.hint = 4;
  for (const f of view.feed) f.t -= dt;
  view.feed = view.feed.filter(f => f.t > 0);
  if (view.banner) { view.banner.t -= dt; if (view.banner.t <= 0) view.banner = null; }
  view.shake = Math.max(0, view.shake - dt * 30);
  for (const s of view.sparks) { s.life -= dt; s.x = wrap(s.x + s.vx * dt, world.size); s.y = wrap(s.y + s.vy * dt, world.size); s.vx *= 0.96; s.vy *= 0.96; }
  view.sparks = view.sparks.filter(s => s.life > 0);
  // the camera follows you, leaning toward where you drift
  const lx = wrap(p.x + (p.alive ? p.vx : 0) * 0.35, world.size), ly = wrap(p.y + (p.alive ? p.vy : 0) * 0.35, world.size);
  const k = Math.min(1, dt * 4);
  view.cam.x = wrap(view.cam.x + wd(view.cam.x, lx, world.size) * k, world.size);
  view.cam.y = wrap(view.cam.y + wd(view.cam.y, ly, world.size) * k, world.size);
}

let simT = 0; // seconds since the page started, on the fixed step (drives title and figure animation)
const scenes: Record<string, { update(dt: number): void }> = {
  title: { update() { if (pressed('Enter') || pressed('Space')) { reset(); scene = 'play'; } } },
  play: {
    update(dt) {
      if (pressed('KeyP') || pressed('Escape')) { scene = 'pause'; return; }
      updatePlay(dt);
    },
  },
  pause: { update() { if (pressed('KeyP') || pressed('Escape')) scene = 'play'; } },
  figures: { update() { /* a still sheet of every figure */ } },
};
function step(): void {
  if (pressed('KeyM')) sound.setMuted(!sound.muted);
  simT += STEP;
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
  const g = new Graphics(), hud = new Graphics(), top = new Graphics(), textLayer = new Container(), topText = new Container();
  app.stage.addChild(g, hud, textLayer, top, topText);
  const L = new Labels(textLayer), T = new Labels(topText);

  const z = (): number => tune.zoom;
  const toScreen = (x: number, y: number): [number, number] => {
    const sx = view.shake ? Math.sin(world.t * 90) * view.shake : 0;
    return [W / 2 + wd(view.cam.x, x, world.size) * z() + sx, H / 2 + wd(view.cam.y, y, world.size) * z()];
  };
  const on = (X: number, Y: number, m: number): boolean => X > -m && X < W + m && Y > -m && Y < H + m;

  function drawStars(cx: number, cy: number): void {
    for (const st of stars) {
      const par = [0.15, 0.3, 0.5][st.layer];
      const x = (((st.x - cx * par) % 1600) + 1600) % 1600 - 160, y = (((st.y - cy * par) % 1600) + 1600) % 1600 - 440;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const sz = st.layer + 1;
      g.rect(x, y, sz, sz).fill({ color: [0xaabeff, 0xc8d2ff, 0xe6e6ff][st.layer], alpha: st.b * (0.35 + st.layer * 0.25) });
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
        const path = () => g.moveTo(X - dir * 60 * s, Y + sy * 150 * s).lineTo(X - dir * 110 * s, Y + sy * 150 * s).lineTo(X - dir * 110 * s, Y + sy * 40 * s);
        path(); g.stroke({ width: 9, color: TEAM[team].main, alpha: 0.2 }); path(); g.stroke({ width: 3, color: TEAM[team].dim });
      }
      L.put(team === 0 ? 'Cyan gate' : 'Amber gate', X - dir * 85 * s, Y - 175 * s, 16, TEAM[team].css);
    }
    for (const b of world.beacons) {
      const [X, Y] = toScreen(b.x, b.y);
      if (!on(X, Y, 250)) continue;
      drawBeacon(g, b, X, Y, tune.beacon_radius * s, s, t);
      L.put(b.label, X, Y - tune.beacon_radius * s - 16, 18, ownerCss(b.owner), 'center', true);
    }
    for (const a of world.asteroids) { const [X, Y] = toScreen(a.x, a.y); if (on(X, Y, a.r * s + 10)) drawAsteroid(g, a, X, Y, s); }
    for (const m of world.mines) { const [X, Y] = toScreen(m.x, m.y); if (on(X, Y, 30)) drawMine(g, m, m.age >= tune.mine_arm, X, Y, s, t); }
    for (const b of world.shots) { const [X, Y] = toScreen(b.x, b.y); if (on(X, Y, 30)) drawShot(g, b, X, Y, s); }
    for (const p of view.sparks) {
      const [X, Y] = toScreen(p.x, p.y); if (!on(X, Y, 10)) continue;
      g.moveTo(X, Y).lineTo(X - p.vx * 0.04 * s, Y - p.vy * 0.04 * s).stroke({ width: 2, color: p.life > 0.5 ? 0xffffff : TEAM[p.team].main });
    }
    const p = me();
    let tag: Ship | undefined, td = 700; // the nearest enemy gets a name tag: who it is, and that it is a bot
    for (const sh of world.ships) if (sh.alive && sh.team !== p.team) { const d = dist(p, sh, world.size); if (d < td) { td = d; tag = sh; } }
    for (const sh of world.ships) {
      if (!sh.alive) continue;
      const [X, Y] = toScreen(sh.x, sh.y);
      if (!on(X, Y, 60)) continue;
      const r = HULL_RADIUS[sh.hull] * s * 1.25;
      drawShip(g, sh.hull, sh.team, X, Y, sh.a, r, { thrust: sh.thrusting, burn: sh.burning, t, you: sh.id === ME, flash: sh.flash > 0 });
      const maxE = tune[`${sh.hull}_energy`];
      if (sh.id !== ME && sh.energy < maxE * 0.98) {
        const w = 34 * s;
        g.rect(X - w / 2, Y + r * 1.6, w, 3).fill({ color: 0xffffff, alpha: 0.15 });
        g.rect(X - w / 2, Y + r * 1.6, w * Math.max(0, sh.energy / maxE), 3).fill(TEAM[sh.team].main);
      }
      if (sh === tag) L.put(`${sh.name} · ${HULL_NAME[sh.hull]}`, X, Y - r * 1.9 - 6, 14, TEAM[sh.team].css);
    }
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
    hud.rect(10, 8, 220, 52).fill({ color: 0x03040b, alpha: 0.75 });
    hud.rect(bx - 110, by - 6, bw + 260, 84).fill({ color: 0x03040b, alpha: 0.75 });
    if (view.feed.length) hud.rect(W - 300, 10, 290, view.feed.length * 24 + 6).fill({ color: 0x03040b, alpha: 0.75 });
    for (const t of [0, 1] as Team[]) { // both fleets racing to the target
      const y = by + t * 22, f = Math.min(1, world.scores[t] / tune.target_score);
      hud.rect(bx, y, bw, 12).fill({ color: 0xffffff, alpha: 0.08 });
      hud.rect(bx, y, bw * f, 12).fill(TEAM[t].main);
      L.put(`${TEAM[t].short} ${Math.floor(world.scores[t])}`, bx - 12, y + 6, 16, TEAM[t].css, 'right', true);
    }
    L.put(`to ${tune.target_score}  ·  round ${world.round}`, bx + bw + 12, by + 17, 15, '#aab4d4', 'left');
    world.beacons.forEach((b, i) => diamond(hud, W / 2 - 60 + i * 60, by + 62, 12, ownerColor(b.owner)));
    const humans = world.ships.filter(s => s.human).length, n = tune.fleet_size;
    L.put(`You + ${n - humans} bots  vs  ${n} bots`, 20, 24, 15, '#aab4d4', 'left');
    L.put(`Your kills ${p.kills}  ·  deaths ${p.deaths}`, 20, 46, 15, '#aab4d4', 'left');
    view.feed.forEach((f, i) => { // who downed who, in each pilot's fleet colour
      const y = 26 + i * 24, x = W - 20, al = Math.min(1, f.t);
      const mid = f.bt < 0 ? ' crashed into ' : ' downed ';
      const wb = L.width(f.b, 15), wm = L.width(mid, 15);
      L.put(f.b, x, y, 15, f.bt === -1 ? '#aab4d4' : TEAM[f.bt].css, 'right', false, al);
      L.put(mid, x - wb, y, 15, '#d8deef', 'right', false, al);
      L.put(f.a, x - wb - wm, y, 15, TEAM[f.at].css, 'right', true, al);
    });
    const ew = 360, ex = W / 2 - ew / 2, ey = H - 40; // energy: your shield and your ammo
    const maxE = tune[`${p.hull}_energy`], ef = p.alive ? Math.max(0, p.energy / maxE) : 0, low = ef < 0.3;
    hud.rect(ex, ey, ew, 14).fill({ color: 0xffffff, alpha: 0.08 });
    hud.rect(ex, ey, ew * ef, 14).fill(low ? 0xff5a6a : TEAM[0].main);
    hud.rect(ex, ey, ew, 14).stroke({ width: 1, color: TEAM[0].dim });
    L.put(`Energy ${Math.max(0, Math.round(p.energy))}`, ex - 12, ey + 7, 15, low ? '#ff5a6a' : TEAM[0].css, 'right', true);
    L.put(`${HULL_NAME[p.hull]} · ${WEAPON_NAME[p.weapon]}`, ex + ew + 12, ey + 7, 15, '#aab4d4', 'left');
    // the minimap: the whole zone
    const size = 170, mx = W - size - 16, my = H - size - 16, k = size / world.size;
    hud.rect(mx, my, size, size).fill({ color: 0x060a18, alpha: 0.82 }).stroke({ width: 1, color: 0x2a3354 });
    for (const a of world.asteroids) hud.rect(mx + a.x * k - 2, my + a.y * k - 2, 4, 4).fill(0x2f3757);
    for (const b of world.beacons) dashedRing(hud, mx + b.x * k, my + b.y * k, tune.beacon_radius * k + 2, ownerColor(b.owner), 1, 2);
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
    const hs = hints[view.hint];
    if (hs && !world.roundOver && p.alive) {
      const w = L.width(hs, 17) + 36;
      hud.rect(W / 2 - w / 2, H - 112, w, 36).fill({ color: 0x060a18, alpha: 0.85 }).stroke({ width: 1, color: TEAM[0].dim });
      L.put(hs, W / 2, H - 94, 17, '#e6f6ff');
    }
    if (sound.muted) L.put('Muted', W - 100, H - 200, 14, '#8590b4');
  }

  function drawOverlays(): void {
    const p = me();
    if (world.roundOver) {
      top.rect(0, H / 2 - 110, W, 220).fill({ color: 0x03040b, alpha: 0.7 });
      const win = world.winner === 0 ? 0 : 1;
      T.put(win === 0 ? 'Cyan fleet wins the round' : 'Amber fleet takes the round', W / 2, H / 2 - 50, 48, TEAM[win].css, 'center', true);
      T.put(`Rounds won: Cyan ${world.roundsWon[0]}  ·  Amber ${world.roundsWon[1]}`, W / 2, H / 2 + 6, 20, '#d8deef');
      T.put(`Next round in ${Math.ceil(world.roundOver)} s, right here (Enter to skip)`, W / 2, H / 2 + 46, 18, '#aab4d4');
      return;
    }
    if (view.banner) {
      const b = view.banner;
      T.put(b.text, W / 2, 128, 28, b.team === undefined ? '#ffffff' : TEAM[b.team].css, 'center', true, Math.min(1, b.t * 2));
    }
    if (p.alive) return;
    top.rect(0, 0, W, H).fill({ color: 0x03040b, alpha: 0.72 });
    T.put('Destroyed', W / 2, 150, 44, TEAM[0].css, 'center', true);
    const by = p.lastHitBy >= 0 ? world.ships[p.lastHitBy] : undefined;
    T.put(by ? `by ${by.name} flying a ${HULL_NAME[by.hull]} with ${WEAPON_NAME[by.weapon]}` : 'by the rocks', W / 2, 196, 18, '#d8deef');
    T.put(`Relaunch in ${Math.max(0, p.respawn).toFixed(1)} s  ·  pick your loadout`, W / 2, 236, 20, '#aab4d4');
    HULLS.forEach((h, i) => {
      const x = W / 2 - 300 + i * 300, y = 340, sel = view.loadout.hull === h;
      top.rect(x - 120, y - 70, 240, 140).fill({ color: INK, alpha: 0.6 }).stroke({ width: sel ? 2 : 1, color: sel ? TEAM[0].main : 0x2a3354 });
      drawShip(top, h, 0, x, y - 14, -Math.PI / 2, HULL_RADIUS[h] * 1.9, { t: simT });
      T.put(`${i + 1}  ${HULL_NAME[h]}`, x, y + 40, 18, sel ? '#ffffff' : '#aab4d4', 'center', true);
      T.put(HULL_ROLE[h], x, y + 60, 14, '#8590b4');
    });
    WEAPONS.forEach((wp, i) => {
      const x = W / 2 - 300 + i * 300, y = 500, sel = view.loadout.weapon === wp;
      top.rect(x - 120, y - 46, 240, 92).fill({ color: INK, alpha: 0.6 }).stroke({ width: sel ? 2 : 1, color: sel ? TEAM[0].main : 0x2a3354 });
      const demo = { team: 0 as Team, kind: wp, vx: 1, vy: 0 };
      for (const dy of wp === 'scatter' ? [-14, 0, 14] : [0]) drawShot(top, demo, x + 30, y - 18 + dy, 1.4);
      T.put(`${'ZXC'[i]}  ${WEAPON_NAME[wp]}`, x, y + 10, 18, sel ? '#ffffff' : '#aab4d4', 'center', true);
      T.put(WEAPON_ROLE[wp], x, y + 30, 14, '#8590b4');
    });
  }

  function drawTitle(): void {
    const t = simT;
    drawStars(t * 30, 0);
    drawShip(g, 'lancer', 0, W / 2 - 330, 150, 0.2 + Math.sin(t) * 0.1, 30, { thrust: true, t });
    drawShip(g, 'bulwark', 1, W / 2 + 330, 150, Math.PI - 0.2 + Math.sin(t) * 0.1, 28, { thrust: true, t });
    drawBeacon(g, { owner: -1, progress: 0.4 + 0.3 * Math.sin(t), phase: 0 }, W / 2, 160, tune.beacon_radius * 0.42, 0.42, t);
    L.put(TITLE, W / 2, 268, 72, '#ffffff', 'center', true);
    L.put('Two fleets. Three drifting beacons. One wrap-around asteroid zone.', W / 2, 324, 20, '#aab4d4');
    CONTROLS.forEach((c, i) => L.put(c, W / 2, 400 + i * 34, 18, '#d8deef'));
    L.put('Every other ship is a bot, named as a bot, until people join.', W / 2, 560, 16, '#8590b4');
    L.put('Enter to launch', W / 2, H - 80, 30, TEAM[0].css, 'center', true);
  }

  function drawFigures(): void {
    const t = simT;
    drawStars(0, 0);
    L.put('Beacon Wars: every figure', W / 2, 40, 26, '#ffffff', 'center', true);
    HULLS.forEach((h, i) => {
      for (const team of [0, 1] as Team[]) {
        const x = 160 + i * 190, y = 140 + team * 165;
        drawShip(g, h, team, x, y, -Math.PI / 2, HULL_RADIUS[h] * 2.2, { t });
        L.put(`${HULL_NAME[h]} (${team ? 'amber' : 'cyan'})`, x, y + (h === 'bulwark' ? 70 : 60), 15, TEAM[team].css);
      }
    });
    drawShip(g, 'lancer', 0, 760, 150, -Math.PI / 2, HULL_RADIUS.lancer * 2.2, { you: true, t });
    L.put('You (white chevron)', 760, 216, 15, '#ffffff');
    drawBeacon(g, { owner: 0, progress: 1, phase: 0 }, 1050, 210, tune.beacon_radius * 0.55, 0.55, t);
    L.put('Beacon (held)', 1050, 104, 15, TEAM[0].css, 'center', true);
    drawBeacon(g, { owner: -1, progress: 0, phase: 1 }, 1050, 480, tune.beacon_radius * 0.55, 0.55, t);
    L.put('Beacon (neutral)', 1050, 374, 15, '#9aa4c4', 'center', true);
    const shape: [number, number][] = []; let s2 = 3;
    for (let i = 0; i < 11; i++) { s2 = (s2 * 16807) % 2147483647; shape.push([(i / 11) * Math.PI * 2, 0.8 + (s2 / 2147483647) * 0.3]); }
    drawAsteroid(g, { x: 0, y: 0, r: 60, shape, cracks: [[-0.2, -0.1, 0.18], [0.25, 0.2, 0.14]], spin: 0 }, 160, 490, 1);
    L.put('Asteroid', 160, 570, 15, '#aab4d4');
    drawMine(g, { team: 1 }, true, 350, 490, 2, t); L.put('Mine', 350, 570, 15, TEAM[1].css);
    WEAPONS.forEach((k, i) => {
      const team = (i === 2 ? 1 : 0) as Team;
      drawShot(g, { team, kind: k, vx: 1, vy: 0 }, 540 + i * 140, 490, 2);
      L.put(WEAPON_NAME[k], 520 + i * 140, 570, 15, TEAM[team].css);
    });
  }

  function draw(): void {
    g.clear(); hud.clear(); top.clear(); L.begin(); T.begin();
    if (scene === 'title') drawTitle();
    else if (scene === 'figures') drawFigures();
    else {
      drawZone(); drawHUD(); drawOverlays();
      if (scene === 'pause') {
        top.rect(0, 0, W, H).fill({ color: 0x03040b, alpha: 0.6 });
        T.put('Paused', W / 2, H / 2 - 20, 48, '#ffffff', 'center', true);
        T.put('P to carry on  ·  M to mute', W / 2, H / 2 + 30, 20, '#aab4d4');
      }
    }
    L.end(); T.end();
  }
  function fit(): void {
    const k = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${Math.round(W * k)}px`; canvas.style.height = `${Math.round(H * k)}px`;
    canvas.style.marginTop = `${Math.max(0, Math.floor((innerHeight - H * k) / 2))}px`;
  }

  // ---- Loop: PixiJS's ticker, fixed step, frame time clamped --------------------------------
  let acc = 0, lastFrame = clock.now(), stepping = false;
  app.ticker.add(t => {
    lastFrame = clock.now();
    if (manual) { if (stepping) step(); }
    else {
      acc += Math.min(t.deltaMS / 1000, 0.25); // a stall never fast-forwards the game
      while (acc >= STEP) { step(); acc -= STEP; }
    }
    draw();
  });
  let tickerTime = 0;
  install({
    get scene() { return scene; },
    get state() { return world; },
    press(code) { hit.add(code); },
    hold(code, on2) { if (on2) down.add(code); else down.delete(code); },
    get events() { return log; },
    step(n = 1) {
      stepping = true;
      try { for (let i = 0; i < n; i++) { tickerTime += STEP * 1000; app.ticker.update(tickerTime); } }
      finally { stepping = false; }
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
