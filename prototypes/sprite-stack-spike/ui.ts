// PROTOTYPE - NOT FOR PRODUCTION
// The HUD and the game's feedback: an energy bar with a damage trail, ability slots with icons
// and cooldowns, score / bounty / kills badges, a kill feed, hit markers and the kill moment
// (hit-stop, camera kick, a banner, coins pouring into your score, a gold edge glow, a fanfare).
// Everything is drawn into the renderer's 480 x 270 HUD layer, so it is as crisp as the game.

import { inSafe, type ZoneMap } from '../../src/game/map';
import { bombLevel, gunLevel, lvl, maxEnergy, mineMax } from '../../src/game/salvage';
import type { GameEvent, Ship, Tuning, Upgrade, World } from '../../src/game/types';
import { drawText, textWidth } from './render/font';
import type { Renderer } from './render/raster';
import type { Sfx } from './sfx';

/** 0xRRGGBB plus alpha as an ABGR word. */
const col = (rgb: number, a = 255): number => ((a << 24) | ((rgb & 255) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 255)) >>> 0;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const GOLD = 0xffd060, WHITE = 0xf2f6ff, DIM = 0x7f9fcc, CYAN = 0x5fd8ff, RED = 0xff5a4a, ORANGE = 0xffa040, VIOLET = 0xc690ff, GREEN = 0x6dffb4, PANEL = 0x0a1020;

// ---- pixel icons (# = colour, + = white highlight) -----------------------------------------------
const ICON: Record<string, string[]> = {
  guns: [
    '..+...+..', '..#...#..', '.###.###.', '.###.###.', '.###.###.', '.###.###.', '.........', '..#...#..', '.........', '..#...#..', '.........',
  ],
  bomb: [
    '.......#.', '......#.#', '...###...', '..#####..', '.##+####.', '.#+#####.', '.#######.', '.#######.', '..#####..', '...###...', '.........',
  ],
  mine: [
    '....#....', '.#..#..#.', '..#####..', '..#+###..', '#########', '..#####..', '..#####..', '.#..#..#.', '....#....', '.........', '.........',
  ],
  burn: [
    '....#....', '...##....', '...###...', '..####...', '..##+##..', '.###+##..', '.##+++##.', '.##+++##.', '..#+++#..', '...###...', '.........',
  ],
  gem: ['...#...', '..###..', '.##+##.', '##+####', '.#####.', '..###..', '...#...'],
  sight: ['...#...', '...#...', '.......', '##.#.##', '.......', '...#...', '...#...'],
  coin: ['..###..', '.##+##.', '##+####', '#######', '#######', '.#####.', '..###..'],
  bolt: ['...##', '..##.', '.##..', '####.', '..##.', '.##..', '##...'],
  flame: ['..#..', '.##..', '.###.', '##+##', '#+++#', '.###.'],
};

const UPGRADE_NAME: Record<Upgrade, string> = {
  cells: 'ENERGY CELLS', regen: 'RECHARGE', engine: 'ENGINE', turn: 'TURNING', guns: 'GUNS',
  bombs: 'BOMBS', bounce: 'BOUNCING SHOTS', multi: 'SPREAD SHOT', mines: 'MINES',
};

interface Coin { x: number; y: number; vx: number; vy: number; age: number; go: number; sx: number; sy: number; val: number; i: number; homing: boolean }
interface Banner { text: string; sub: string; top: string; c: number; t: number; max: number }
interface Feed { a: string; b: string; ac: number; bc: number; t: number }
interface Mark { id: number; t: number; kill: boolean; x: number; y: number }
interface Pop { x: number; y: number; text: string; c: number; t: number; max: number }

export interface UiDeps { W: number; H: number; R: Renderer; world: World; tune: Tuning; map: ZoneMap; me: number; shipZ: number; sfx: Sfx }

export class Ui {
  /** Seconds the game should freeze (the kill's hit-stop); the loop reads and spends this. */
  hitStop = 0;
  private buf!: Uint32Array;
  private readonly W: number; private readonly H: number;
  private t = 0;
  private chipE = -1; private chipHold = 0;
  private scoreShown = 0; private scorePop = 0; private bountyPop = 0; private killsPop = 0; private lastBounty = 0;
  private streak = 0; private multi = 0; private lastKillT = -99; private kickT = 99; private shakeT = 99;
  private deadMax = 1;
  private coins: Coin[] = []; private banner: Banner | null = null; private feed: Feed[] = [];
  private marks: Mark[] = []; private pops: Pop[] = []; private toast: Pop | null = null;
  private edge = { c: GOLD, a: 0, t: 0, max: 1 };
  private slotFlash = [0, 0, 0, 0];
  private lastHit = new Map<number, number>();

  constructor(private d: UiDeps) { this.W = d.W; this.H = d.H; this.scoreShown = d.world.ships[d.me].points; }

  // ---- drawing primitives on the HUD layer ------------------------------------------------------
  private put(x: number, y: number, c: number): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x, a = c >>> 24, dst = this.buf[i];
    if (a === 255 || !dst) { this.buf[i] = c; return; }
    const k = a / 255, j = 1 - k, da = dst >>> 24;
    const r = (dst & 255) * j + (c & 255) * k, g = ((dst >> 8) & 255) * j + ((c >> 8) & 255) * k, b = ((dst >> 16) & 255) * j + ((c >> 16) & 255) * k;
    this.buf[i] = ((Math.min(255, a + da * j) << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
  }
  private rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.put(x + xx, y + yy, c);
  }
  private frame(x: number, y: number, w: number, h: number, c: number): void {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y + 1, 1, h - 2, c); this.rect(x + w - 1, y + 1, 1, h - 2, c);
  }
  /** A see-through panel with a lit top edge. */
  private panel(x: number, y: number, w: number, h: number, accent: number, a = 215): void {
    this.rect(x, y, w, h, col(PANEL, a));
    this.rect(x + 1, y, w - 2, 1, col(accent, 200));
    this.rect(x, y + h, w, 1, col(0x000000, 90));
  }
  private icon(name: string, x: number, y: number, c: number, k = 1, a = 255): void {
    const rows = ICON[name];
    for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
      const ch = rows[r][q];
      if (ch === '.') continue;
      this.rect(x + q * k, y + r * k, k, k, col(ch === '+' ? WHITE : c, a));
    }
  }
  private text(s: string, x: number, y: number, c: number, k = 1, a = 255): void {
    drawText(this.buf, this.W, this.H, s, Math.round(x), Math.round(y), col(c, a), col(0x05060c, Math.round(a * 0.85)), k);
  }
  private textC(s: string, cx: number, y: number, c: number, k = 1, a = 255): void { this.text(s, cx - textWidth(s, k) / 2, y, c, k, a); }

  private screen(x: number, y: number): [number, number] | null {
    const p = this.d.R.project(x, -y, this.d.shipZ);
    return p ? [p[0], p[1]] : null;
  }

  // ---- layout -----------------------------------------------------------------------------------
  private get scoreAt(): [number, number] { return [this.W / 2 - 20, 9]; }

  // ---- reacting to the game ---------------------------------------------------------------------
  /** Feed the step's events in (call once per sim step, before they are cleared). */
  events(evs: readonly GameEvent[]): void {
    const { world, me, sfx } = this.d, ships = world.ships, mine = ships[me];
    for (const ev of evs) {
      if (ev.type === 'shot' && ev.ship === me) {
        this.slotFlash[ev.kind === 'bullet' ? 0 : 1] = 0.14;
        if (ev.kind === 'bullet') sfx.shoot(); else sfx.bomb();
      } else if (ev.type === 'mine' && ev.ship === me) { this.slotFlash[2] = 0.14; sfx.mine(); }
      else if (ev.type === 'hit') {
        const target = ships[ev.ship];
        if (ev.by === me && ev.ship !== me) {
          this.lastHit.set(ev.ship, this.t);
          this.marks.push({ id: ev.ship, t: 0, kill: false, x: target.x, y: target.y });
          this.pops.push({ x: target.x + (Math.random() - 0.5) * 10, y: target.y, text: `${Math.round(ev.amount)}`, c: WHITE, t: 0, max: 0.7 });
          sfx.hitConfirm(target.energy < maxEnergy(target, this.d.tune) * 0.3);
        } else if (ev.ship === me) {
          this.flashEdge(RED, Math.min(0.45, 0.12 + ev.amount / maxEnergy(mine, this.d.tune) * 1.6), 0.3);
          this.chipHold = 0.3;
          sfx.hurt();
        }
      } else if (ev.type === 'kill') {
        const victim = ships[ev.ship], killer = ev.by >= 0 ? ships[ev.by] : null;
        const nm = (s: Ship): string => (s.id === me ? 'YOU' : s.name.replace('BOT ', ''));
        this.feed.unshift({ a: killer ? nm(killer) : 'THE ZONE', b: nm(victim), ac: killer?.id === me ? CYAN : ORANGE, bc: victim.id === me ? CYAN : ORANGE, t: 0 });
        if (this.feed.length > 4) this.feed.length = 4;
        if (ev.by === me && ev.ship !== me) this.onKill(victim, ev.bounty);
        if (ev.ship === me) {
          this.streak = 0; this.multi = 0;
          this.deadMax = this.d.tune.respawn_time;
          this.banner = { text: 'DOWNED', sub: killer ? `BY ${nm(killer)}` : '', top: '', c: RED, t: 0, max: this.deadMax };
          this.flashEdge(RED, 0.5, 0.6);
          sfx.downed();
        }
      } else if (ev.type === 'salvage' && ev.ship === me) {
        const name = UPGRADE_NAME[ev.kind];
        this.toast = { x: 0, y: 0, text: ev.level < 0 ? 'SALVAGE: ALL MAXED' : `+ ${name}${ev.level > 1 ? ` ${ev.level}` : ''}`, c: VIOLET, t: 0, max: 1.8 };
        sfx.salvage();
      }
    }
  }

  private flashEdge(c: number, a: number, max: number): void {
    if (this.edge.t < this.edge.max && this.edge.a * (1 - this.edge.t / this.edge.max) > a && this.edge.c === GOLD) return;
    this.edge = { c, a, t: 0, max };
  }

  /** The kill moment: freeze a beat, kick the camera, banner, coins to the score, fanfare. */
  private onKill(victim: Ship, paid: number): void {
    this.streak++;
    this.multi = this.t - this.lastKillT < 4 ? this.multi + 1 : 1;
    this.lastKillT = this.t;
    this.hitStop = 0.075; this.kickT = 0; this.shakeT = 0; this.killsPop = 0.3;
    this.marks.push({ id: victim.id, t: 0, kill: true, x: victim.x, y: victim.y });
    const MULTI = ['', '', 'DOUBLE!', 'TRIPLE!', 'QUADRUPLE!'];
    const name = victim.name.replace('BOT ', '');
    this.banner = {
      text: 'TARGET DOWN', sub: `${name}  +${paid}`,
      top: this.multi >= 2 ? (MULTI[this.multi] ?? `${this.multi} IN A ROW!`) : this.streak >= 3 ? `STREAK ${this.streak}` : '',
      c: GOLD, t: 0, max: 1.7,
    };
    this.flashEdge(GOLD, 0.32, 0.45);
    this.d.sfx.kill(Math.max(this.multi, Math.min(this.streak, 3)));
    // coins burst from the wreck and pour into the score
    const at = this.screen(victim.x, victim.y) ?? [this.W / 2, this.H / 2];
    const n = Math.max(6, Math.min(16, 5 + Math.round(paid / 4)));
    let left = paid;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.floor(paid / n); left -= v;
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 90;
      this.coins.push({ x: at[0], y: at[1], vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, age: 0, go: 0.28 + i * 0.045, sx: 0, sy: 0, val: v, i, homing: false });
    }
  }

  /** The camera's zoom kick on a kill (a multiplier on the view's scale). */
  get zoomKick(): number { return this.kickT < 0.4 ? 1 + 0.045 * Math.sin(Math.PI * this.kickT / 0.4) : 1; }
  /** The kill's screen shake, in world-sized pixels (small and quick: eye strain matters). */
  get shake(): [number, number] {
    if (this.shakeT > 0.25) return [0, 0];
    const k = 1 - this.shakeT / 0.25, a = 1.6 * k * k;
    return [Math.sin(this.shakeT * 95) * a, Math.cos(this.shakeT * 71) * a];
  }

  update(dt: number): void {
    const me = this.d.world.ships[this.d.me];
    this.t += dt; this.kickT += dt; this.shakeT += dt;
    this.scorePop = Math.max(0, this.scorePop - dt); this.bountyPop = Math.max(0, this.bountyPop - dt); this.killsPop = Math.max(0, this.killsPop - dt);
    for (let i = 0; i < 4; i++) this.slotFlash[i] = Math.max(0, this.slotFlash[i] - dt);
    if (me.bounty > this.lastBounty) this.bountyPop = 0.35;
    this.lastBounty = me.bounty;
    // the damage trail: the lost part of the bar waits a moment, then drains away
    if (this.chipE < me.energy || !me.alive) this.chipE = me.energy;
    else if ((this.chipHold -= dt) <= 0) this.chipE = Math.max(me.energy, this.chipE - maxEnergy(me, this.d.tune) * 0.9 * dt);
    this.edge.t += dt;
    if (this.banner && (this.banner.t += dt) > this.banner.max) this.banner = null;
    if (this.toast && (this.toast.t += dt) > this.toast.max) this.toast = null;
    for (const f of this.feed) f.t += dt;
    this.feed = this.feed.filter(f => f.t < 6);
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter(m => m.t < (m.kill ? 0.5 : 0.22));
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < p.max);
    const [tx, ty] = this.scoreAt;
    for (const c of this.coins) {
      c.age += dt;
      if (c.age < c.go) { c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-dt * 6); c.vy = c.vy * Math.exp(-dt * 6) + 60 * dt; continue; }
      if (!c.homing) { c.homing = true; c.sx = c.x; c.sy = c.y; }
      const p = clamp01((c.age - c.go) / 0.42), e = p * p * (3 - 2 * p) * p;
      c.x = c.sx + (tx - c.sx) * e; c.y = c.sy + (ty - c.sy) * e - Math.sin(Math.PI * p) * 22;
      if (p >= 1) { c.val = -1 - c.val; this.scoreShown += -1 - c.val; this.scorePop = 0.16; this.d.sfx.coin(c.i); }
    }
    this.coins = this.coins.filter(c => c.val >= 0);
    if (!this.coins.length) this.scoreShown = me.points; // in step with the game once the coins are in
  }

  // ---- drawing ----------------------------------------------------------------------------------
  draw(buf: Uint32Array): void {
    this.buf = buf;
    this.edgeGlow();
    this.tags();
    this.markers();
    this.badges();
    this.killFeed();
    this.bottom();
    this.bannerDraw();
    for (const c of this.coins) {
      for (let k = 1; k <= 2 && c.homing; k++) this.rect(c.x - 1, c.y + k * 2, 2, 2, col(GOLD, 120 / k));
      this.icon('coin', Math.round(c.x) - 3, Math.round(c.y) - 3, GOLD);
    }
  }

  /** A soft glow around the screen's edge: gold on a kill, red when you are hit. */
  private edgeGlow(): void {
    const e = this.edge;
    if (e.t >= e.max) return;
    const k = 1 - e.t / e.max, A = e.a * k * k * 255, T = 18;
    for (let d = 0; d < T; d++) {
      const a = Math.round(A * (1 - d / T) * (1 - d / T));
      if (a < 2) break;
      const c = col(e.c, a);
      this.rect(d, d, this.W - 2 * d, 1, c); this.rect(d, this.H - 1 - d, this.W - 2 * d, 1, c);
      this.rect(d, d + 1, 1, this.H - 2 * d - 2, c); this.rect(this.W - 1 - d, d + 1, 1, this.H - 2 * d - 2, c);
    }
  }

  /** Names, bounty and an energy bar over every other ship. */
  private tags(): void {
    const { world, me, tune } = this.d;
    for (const sh of world.ships) {
      if (!sh.alive || sh.id === me) continue;
      const p = this.d.R.project(sh.x, -sh.y, this.d.shipZ + 14);
      if (!p || p[2] > this.d.R.camDist + 500) continue;
      const name = sh.name.replace('BOT ', ''), b = `${sh.bounty}`;
      const w = textWidth(name) + 4 + textWidth(b), x = Math.round(p[0] - w / 2), y = Math.round(p[1] - 14);
      if (x < -40 || x > this.W + 40 || y < -20 || y > this.H + 20) continue;
      this.text(name, x, y, 0xffc47a);
      this.text(b, x + textWidth(name) + 4, y, GOLD);
      const f = clamp01(sh.energy / maxEnergy(sh, tune)), bw = 18, bx = Math.round(p[0] - bw / 2), by = y + 7;
      const recent = this.t - (this.lastHit.get(sh.id) ?? -9) < 0.25;
      this.rect(bx - 1, by - 1, bw + 2, 4, col(0x05060c, 200));
      this.rect(bx, by, Math.max(1, Math.round(bw * f)), 2, col(recent ? WHITE : f > 0.6 ? 0x7dff9a : f > 0.3 ? GOLD : RED));
      if (sh.shield > 0) this.text('SHIELD', Math.round(p[0] - textWidth('SHIELD') / 2), by + 4, GREEN, 1, 180);
    }
  }

  /** Hit markers on targets you hit, a red cross on a kill, and the damage numbers. */
  private markers(): void {
    const { world } = this.d;
    for (const m of this.marks) {
      const sh = world.ships[m.id];
      const at = m.kill ? this.screen(m.x, m.y) : this.screen(sh.x, sh.y);
      if (!at) continue;
      const k = m.t / (m.kill ? 0.5 : 0.22), r0 = m.kill ? 5 + k * 6 : 4 + k * 3, len = m.kill ? 5 : 3;
      const c = col(m.kill ? RED : WHITE, Math.round(255 * (1 - k * k)));
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        for (let i = 0; i < len; i++) { this.put(at[0] + sx * (r0 + i), at[1] + sy * (r0 + i), c); if (m.kill) this.put(at[0] + sx * (r0 + i) + 1, at[1] + sy * (r0 + i), c); }
      }
    }
    for (const p of this.pops) {
      const at = this.screen(p.x, p.y);
      if (!at) continue;
      const k = p.t / p.max;
      this.textC(p.text, at[0] + 10, at[1] - 12 - k * 14, k < 0.15 ? WHITE : 0xffe2a0, 1, Math.round(255 * (1 - k * k)));
    }
  }

  /** Kills, score and bounty as three badges at the top. */
  private badges(): void {
    const me = this.d.world.ships[this.d.me], cx = this.W / 2;
    const badge = (x: number, w: number, icon: string, ic: number, value: string, caption: string, vc: number, pop: number): void => {
      this.panel(x, 4, w, 22, ic);
      if (pop > 0) this.frame(x, 4, w, 22, col(ic, Math.round(200 * pop / 0.35)));
      this.icon(icon, x + 4, 9, ic);
      this.text(value, x + 14, 7 - (pop > 0.2 ? 1 : 0), pop > 0.05 ? WHITE : vc, 2);
      this.text(caption, x + 14, 19, DIM);
    };
    badge(cx - 106, 62, 'sight', 0xe8eef8, `${me.kills}`, 'KILLS', WHITE, this.killsPop);
    badge(cx - 40, 80, 'coin', GOLD, `${this.scoreShown}`, 'SCORE', GOLD, this.scorePop * 2);
    badge(cx + 44, 62, 'gem', ORANGE, `${me.bounty}`, 'BOUNTY', ORANGE, this.bountyPop);
    if (this.streak >= 2 && me.alive) {
      const s = `STREAK ${this.streak}`, w = textWidth(s) + 10;
      this.icon('flame', cx - w / 2, 30, ORANGE);
      this.text(s, cx - w / 2 + 8, 31, ORANGE);
    }
  }

  private killFeed(): void {
    let y = 4;
    for (const f of this.feed) {
      const a = Math.round(255 * clamp01((6 - f.t) / 1)), mid = ' > ';
      const w = textWidth(f.a + mid + f.b), x = this.W - 6 - w;
      this.rect(x - 3, y - 2, w + 6, 9, col(PANEL, Math.round(a * 0.55)));
      this.text(f.a, x, y, f.ac, 1, a);
      this.text(mid, x + textWidth(f.a) + 1, y, DIM, 1, a);
      this.text(f.b, x + textWidth(f.a + mid) + 1, y, f.bc, 1, a);
      y += 10;
    }
  }

  /** Ability slots and the energy bar, bottom centre. */
  private bottom(): void {
    const { world, me, tune, map } = this.d, sh = world.ships[me], W = this.W, H = this.H;
    if (!sh.alive) {
      const f = clamp01(1 - sh.respawn / this.deadMax), bw = 120, bx = (W - bw) / 2, by = H - 20;
      this.panel(bx - 4, by - 12, bw + 8, 22, RED);
      this.textC(`RELAUNCHING IN ${Math.ceil(sh.respawn)}`, W / 2, by - 8, WHITE);
      this.rect(bx, by, bw, 4, col(0x1a2238, 230));
      this.rect(bx, by, Math.round(bw * f), 4, col(CYAN));
      return;
    }
    const maxE = maxEnergy(sh, tune), E = Math.max(0, sh.energy), frac = clamp01(E / maxE);
    const safe = inSafe(map, sh.x, sh.y);
    const gl = gunLevel(sh), multi = lvl(sh, 'multi') > 0, bl = bombLevel(sh, tune);
    const gunCost = tune.gun_cost + (gl - 1) * tune.gun_cost_level + (multi ? tune.multi_cost : 0);
    const bombCost = tune.bomb_cost + (bl - 1) * tune.bomb_cost_level;
    const live = world.mines.filter(m => m.owner === me).length, mmax = mineMax(sh, tune);
    const slots = [
      { icon: 'guns', key: 'SPACE', c: CYAN, cool: 0, ok: E > gunCost + 1, pips: gl, pipMax: Math.max(gl, 3), weapon: true, on: false },
      { icon: 'bomb', key: 'F', c: 0xff7ac0, cool: Math.max(0, sh.bombCool) / tune.bomb_interval, ok: E > bombCost + 1, pips: bl, pipMax: 3, weapon: true, on: false },
      { icon: 'mine', key: 'E', c: RED, cool: live >= mmax ? 1 : Math.max(0, sh.mineCool) / tune.mine_cooldown, ok: E > tune.mine_cost + 1 && live < mmax, pips: mmax - live, pipMax: mmax, weapon: true, on: false },
      { icon: 'burn', key: 'SHIFT', c: ORANGE, cool: 0, ok: E > 40, pips: 0, pipMax: 0, weapon: false, on: sh.burning },
    ];
    // one low row: slots on the left, the energy bar on the right, so the chase view keeps your ship clear
    const S = 22, gap = 4, bw = 170, rowW = slots.length * S + (slots.length - 1) * gap + 16 + bw + 26;
    const x0 = Math.round(W / 2 - rowW / 2), y0 = H - 33;
    if (safe) this.textC('SAFE ZONE  WEAPONS OFF', W / 2, y0 - 16, GREEN);
    slots.forEach((s, i) => {
      const x = x0 + i * (S + gap), off = (s.weapon && safe) || !s.ok, flash = this.slotFlash[i];
      this.rect(x, y0, S, S, col(PANEL, 190));
      // icon: full colour when ready, grey when unavailable
      this.icon(s.icon, x + 2, y0 + 1, off ? 0x4a5670 : s.on ? 0xffe0a0 : s.c, 2, off ? 200 : 255);
      // cooldown: a dark shutter that rises as it recharges
      if (s.cool > 0) { const h = Math.round(S * clamp01(s.cool)); this.rect(x + 1, y0 + S - h, S - 2, h, col(0x02040a, 170)); }
      const border = flash > 0 ? WHITE : s.on ? ORANGE : off ? 0x2a3550 : s.c;
      this.frame(x, y0, S, S, col(border, s.on || flash > 0 ? 255 : off ? 200 : 170));
      if (s.on) this.frame(x - 1, y0 - 1, S + 2, S + 2, col(ORANGE, Math.round(110 + 80 * Math.sin(this.t * 8))));
      // level or ammo pips above the slot
      for (let p = 0; p < s.pipMax; p++) this.rect(x + S / 2 - s.pipMax * 2 + p * 4, y0 - 4, 3, 2, col(p < s.pips ? s.c : 0x2a3550));
      this.textC(s.key, x + S / 2, y0 + S + 3, off ? 0x4a5670 : DIM);
    });
    // energy bar: your life and your ammo in one, so it gets the most room
    const bh = 10, bx = x0 + slots.length * (S + gap) - gap + 16, by = y0 + 6;
    const c = frac > 0.6 ? CYAN : frac > 0.3 ? GOLD : RED;
    const low = frac <= 0.3, pulse = low ? 0.75 + 0.25 * Math.sin(this.t * 7) : 1;
    this.rect(bx - 2, by - 2, bw + 4, bh + 4, col(PANEL, 200));
    this.frame(bx - 2, by - 2, bw + 4, bh + 4, col(low ? RED : 0x2f4a78, low ? Math.round(255 * pulse) : 255));
    const fw = Math.round(bw * frac), cw = Math.round(bw * clamp01(this.chipE / maxE));
    if (cw > fw) this.rect(bx + fw, by, cw - fw, bh, col(0xff9a80, 190)); // what you just lost, draining away
    this.rect(bx, by, fw, bh, col(c, Math.round(255 * pulse)));
    this.rect(bx, by, fw, 2, col(WHITE, 90)); // a glassy highlight
    for (let k = 1; k < 10; k++) this.rect(bx + Math.round(bw * k / 10), by, 1, bh, col(PANEL, 140));
    if (sh.burning) for (let k = 0; k < 3; k++) this.rect(bx + fw - 2 - k * 3, by + 2, 1, bh - 4, col(WHITE, 200 - k * 60));
    this.icon('bolt', bx - 11, by + 1, c);
    this.text('ENERGY', bx, by + bh + 4, DIM);
    this.text(`${Math.round(E)}`, bx + bw + 6, by + 3, low ? RED : WHITE);
    if (low && Math.sin(this.t * 7) > -0.3) this.textC('LOW ENERGY', bx + bw / 2, by - 16, RED);
    // salvage toast
    if (this.toast) {
      const k = this.toast.t / this.toast.max, a = Math.round(255 * clamp01((1 - k) * 4));
      this.textC(this.toast.text, W / 2, y0 - 20 - (safe ? 10 : 0) - k * 6, k < 0.1 ? WHITE : VIOLET, 1, a);
    }
  }

  private bannerDraw(): void {
    const b = this.banner;
    if (!b) return;
    const k = b.t / b.max, a = Math.round(255 * clamp01((1 - k) / 0.25)), cx = this.W / 2, y = 70;
    const big = b.t < 0.07 ? 4 : 3, c = b.t < 0.1 ? WHITE : b.c;
    if (b.c === GOLD && b.t < 0.3) { // a quick light streak behind the words
      const w = Math.round(textWidth(b.text, 3) * (0.6 + b.t * 3));
      this.rect(cx - w / 2, y + 17, w, 2, col(GOLD, Math.round(200 * (1 - b.t / 0.3))));
    }
    this.textC(b.text, cx, y - (big - 3) * 2, c, big, a);
    if (b.sub) this.textC(b.sub, cx, y + 21, b.c === GOLD ? WHITE : 0xffb0a8, 2, a);
    if (b.top) this.textC(b.top, cx, y - 16, ORANGE, 2, a);
  }
}
