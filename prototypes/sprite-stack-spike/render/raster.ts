// PROTOTYPE - NOT FOR PRODUCTION
// The software renderer: no WebGL, no 3D engine. Everything is drawn into a small frame buffer
// (480 x 270) on the CPU and scaled up with nearest-neighbour, so every pixel stays crisp.
//
// It is deferred: pass one fills a G-buffer (albedo, sun term, depth, flags, object id) from
//   - wall quads, rasterised as triangles with a depth buffer, and
//   - sprite stacks, splatted voxel by voxel (each surface voxel of each slice becomes one
//     depth-tested square), which is sprite stacking done with a real camera: it works from
//     straight above, at an isometric tilt and from behind the ship, and through any blend.
// Pass two lights it (sun, point lights from shots and engines, glow halos), patterns the walls,
// draws stars, nebula and drifting cloud wisps where nothing was drawn, fogs the distance, and
// snaps every pixel to the palette through an ordered dither. Pass three inks the outlines.

import { fbmTexture, hash2 } from './noise';
import { buildLut, PALETTE } from './palette';
import type { Model } from './models';
import {
  BORDER, CHUNK, DECK, DECK_Z, DEEP, METAL, OPEN_E, OPEN_N, OPEN_S, OPEN_W, TOP, WALL_BOTTOM, WALL_TOP, type WallMesh,
} from './walls';

/** Flags per pixel. */
export const F_EMIT = 1, F_WALL = 2, F_SIDE = 4, F_DECK = 8, F_OBJ = 16;

/** A point light: world position, radius (world px), colour (0..1 per channel, may exceed 1), halo. */
export interface Light { x: number; y: number; z: number; r: number; cr: number; cg: number; cb: number; halo: number }

/** The camera: looks at a target from `dist` away, `yaw` around z, `pitch` down from level. */
export interface CameraState { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number; scale: number }

const NEAR = 3;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
const INK = 0xff1a0d0a; // ABGR of 0x0a0d1a

export class Renderer {
  readonly albedo: Uint32Array; readonly sun: Float32Array; readonly depth: Float32Array;
  readonly flags: Uint8Array; readonly obj: Uint16Array;
  readonly accR: Float32Array; readonly accG: Float32Array; readonly accB: Float32Array;
  readonly image: ImageData; readonly out: Uint32Array;
  private readonly lut = buildLut(PALETTE);
  private readonly cloud = fbmTexture(256, 4, 5, 911);
  private readonly tint = fbmTexture(128, 3, 3, 4242);
  /** Sun direction (towards the light), normalised. From the upper left in the default view. */
  readonly L = norm(-0.45, 0.5, 0.75);
  // camera, derived each frame
  cx = 0; cy = 0; cz = 0; fx = 0; fy = 0; fz = 0; rx = 0; ry = 0; ux = 0; uy = 0; uz = 0; focal = 1; camDist = 1;
  far = 2000;
  /** Centre of the safe zone in sim px (the deck's pulse runs out from it). */
  deckCentre = 0;
  /** Seconds, for animated surfaces. */
  time = 0;
  stats = { quads: 0, voxels: 0, lights: 0 };
  /**
   * Output scale: the final picture is F times the world's resolution, matched to the screen's
   * real pixels so the browser never stretches it. Ships are drawn at this full detail.
   */
  F = 2;
  hiW = 0; hiH = 0;
  hiDepth = new Float32Array(0); hiAlb = new Uint32Array(0); hiSun = new Float32Array(0);
  hiFlag = new Uint8Array(0); hiObj = new Uint16Array(0);
  hiImage!: ImageData; hiOut = new Uint32Array(0);
  /** Detail column -> world column, and detail row -> world row start. */
  private lowX = new Int32Array(0); private lowRow = new Int32Array(0);
  /**
   * Sub-pixel camera offset, in output pixels: the world is drawn with the camera snapped to
   * whole world pixels (so edges never crawl), then the finished picture is slid by this much,
   * so motion stays smooth at the screen's full resolution.
   */
  shiftX = 0; shiftY = 0;
  /** The picture to put on screen (the composite, slid by the shift). */
  finalImage!: ImageData; private finalOut = new Uint32Array(0);
  /** Screen rectangles the ships were drawn into this frame: x0, y0, x1, y1 (inclusive). */
  private rects: number[] = [];
  /** The HUD, at world resolution: 0 = see-through. Drawn over everything at the end. */
  readonly hud: Uint32Array;
  private flames: number[] = [];

  constructor(readonly W: number, readonly H: number) {
    const n = W * H;
    this.albedo = new Uint32Array(n); this.sun = new Float32Array(n); this.depth = new Float32Array(n);
    this.flags = new Uint8Array(n); this.obj = new Uint16Array(n);
    this.accR = new Float32Array(n); this.accG = new Float32Array(n); this.accB = new Float32Array(n);
    this.image = new ImageData(W, H);
    this.out = new Uint32Array(this.image.data.buffer);
    this.hud = new Uint32Array(n);
    this.setScale(2);
  }

  /** Sets the output scale (whole numbers, 1..4) and sizes the detail buffers for it. */
  setScale(F: number): void {
    F = Math.max(1, Math.min(4, Math.round(F)));
    if (F === this.F && this.hiW) return;
    this.F = F; this.hiW = this.W * F; this.hiH = this.H * F;
    const m = this.hiW * this.hiH;
    this.hiDepth = new Float32Array(m).fill(Infinity); this.hiAlb = new Uint32Array(m); this.hiSun = new Float32Array(m);
    this.hiFlag = new Uint8Array(m); this.hiObj = new Uint16Array(m);
    this.hiImage = new ImageData(this.hiW, this.hiH);
    this.hiOut = new Uint32Array(this.hiImage.data.buffer);
    this.finalImage = new ImageData(this.hiW, this.hiH);
    this.finalOut = new Uint32Array(this.finalImage.data.buffer);
    this.lowX = Int32Array.from({ length: this.hiW }, (_, x) => Math.floor(x / F));
    this.lowRow = Int32Array.from({ length: this.hiH }, (_, y) => Math.floor(y / F) * this.W);
    this.rects.length = 0;
  }

  /** Sets the camera for this frame. */
  setCamera(c: CameraState): void {
    const ch = Math.cos(c.yaw), sh = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    this.fx = cp * ch; this.fy = cp * sh; this.fz = -sp;
    this.rx = sh; this.ry = -ch;
    this.ux = ch * sp; this.uy = sh * sp; this.uz = cp;
    this.cx = c.tx - this.fx * c.dist; this.cy = c.ty - this.fy * c.dist; this.cz = c.tz - this.fz * c.dist;
    this.focal = c.scale * c.dist; this.camDist = c.dist;
    this.far = c.dist + 1300;
  }

  /** Lifts the camera, keeping its target, so it is never inside a wall. */
  get camPos(): [number, number, number] { return [this.cx, this.cy, this.cz]; }
  nudgeCamera(dz: number): void { this.cz += dz; }

  /** Empties the G-buffer. */
  begin(time: number): void {
    this.time = time;
    this.depth.fill(Infinity); this.flags.fill(0); this.obj.fill(0);
    // the detail layer is only ever written near ships: clear just those rectangles
    const r = this.rects, W2 = this.hiW;
    for (let i = 0; i < r.length; i += 4) for (let y = r[i + 1]; y <= r[i + 3]; y++) {
      const a = y * W2 + r[i], b = y * W2 + r[i + 2] + 1;
      this.hiDepth.fill(Infinity, a, b); this.hiFlag.fill(0, a, b); this.hiObj.fill(0, a, b);
    }
    r.length = 0;
    this.hud.fill(0);
    this.flames.length = 0;
    this.stats.quads = 0; this.stats.voxels = 0; this.stats.lights = 0;
  }

  /** World point to screen: [sx, sy, depth], or null behind the near plane. */
  project(x: number, y: number, z: number): [number, number, number] | null {
    const px = x - this.cx, py = y - this.cy, pz = z - this.cz;
    const zc = px * this.fx + py * this.fy + pz * this.fz;
    if (zc < NEAR) return null;
    const xc = px * this.rx + py * this.ry, yc = px * this.ux + py * this.uy + pz * this.uz, k = this.focal / zc;
    return [this.W / 2 + xc * k, this.H / 2 - yc * k, zc];
  }

  // ---- walls: quads to triangles --------------------------------------------------------------

  /** Draws the wall chunks the camera can see. */
  drawWalls(mesh: WallMesh): void {
    // the frustum's footprint: where the corner rays cross the wall band, out to the far plane
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    const hw = this.W / 2 / this.focal, hh = this.H / 2 / this.focal;
    for (const a of [-hw, hw]) for (const b of [-hh, hh]) {
      const dx = this.fx + this.rx * a + this.ux * b, dy = this.fy + this.ry * a + this.uy * b, dz = this.fz + this.uz * b;
      for (const zp of [WALL_TOP, WALL_BOTTOM]) {
        let t = dz < -1e-4 ? (zp - this.cz) / dz : this.far;
        if (t < 0) t = this.far;
        t = Math.min(t, this.far);
        grow(this.cx + dx * t, this.cy + dy * t);
      }
      grow(this.cx + dx * NEAR, this.cy + dy * NEAR);
    }
    const span = CHUNK * 16;
    const c0 = Math.max(0, Math.floor(x0 / span)), c1 = Math.min(mesh.per - 1, Math.floor(x1 / span));
    // render Y = -sim y, so chunk rows come from -y
    const r0 = Math.max(0, Math.floor(-y1 / span)), r1 = Math.min(mesh.per - 1, Math.floor(-y0 / span));
    const L = this.L;
    const lightOf = [L[2], L[1], -L[1], L[0], -L[0], L[2]];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const ch = mesh.chunks[cy * mesh.per + cx];
      if (!ch.n) continue;
      // skip a chunk wholly behind the camera
      const mx = (cx + 0.5) * span - this.cx, my = -(cy + 0.5) * span - this.cy, mz = 0 - this.cz;
      if (mx * this.fx + my * this.fy + mz * this.fz < -span) continue;
      const v = ch.verts;
      for (let q = 0; q < ch.n; q++) {
        const k = ch.kinds[q];
        if (k === DECK) continue; // the safe deck is a see-through grid, drawn in resolve()
        const fl = k === TOP ? F_WALL : k === DECK ? F_DECK : F_SIDE | (k << 5);
        this.quad(v, q * 12, 0x2a3b68, Math.max(0, lightOf[k]), fl);
      }
    }
  }

  private readonly qx = new Float64Array(10); private readonly qy = new Float64Array(10); private readonly qz = new Float64Array(10);
  private readonly sx = new Float64Array(10); private readonly sy = new Float64Array(10); private readonly sw = new Float64Array(10);

  /** One quad (4 corners at v[o..o+11]) clipped to the near plane and drawn as a triangle fan. */
  private quad(v: Float32Array, o: number, col: number, sun: number, fl: number): void {
    const { qx, qy, qz } = this;
    let behind = 0;
    for (let i = 0; i < 4; i++) {
      const px = v[o + i * 3] - this.cx, py = v[o + i * 3 + 1] - this.cy, pz = v[o + i * 3 + 2] - this.cz;
      qx[i] = px * this.rx + py * this.ry;
      qy[i] = px * this.ux + py * this.uy + pz * this.uz;
      qz[i] = px * this.fx + py * this.fy + pz * this.fz;
      if (qz[i] < NEAR) behind++;
    }
    if (behind === 4) return;
    let n = 4;
    if (behind) n = this.clip(n);
    if (qz[0] > this.far && qz[1] > this.far && qz[2] > this.far && qz[3] > this.far) return;
    const { sx, sy, sw } = this, hw = this.W / 2, hh = this.H / 2;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) {
      const k = this.focal / qz[i];
      sx[i] = hw + qx[i] * k; sy[i] = hh - qy[i] * k; sw[i] = 1 / qz[i];
      minx = Math.min(minx, sx[i]); maxx = Math.max(maxx, sx[i]); miny = Math.min(miny, sy[i]); maxy = Math.max(maxy, sy[i]);
    }
    if (maxx < 0 || maxy < 0 || minx >= this.W || miny >= this.H) return;
    this.stats.quads++;
    for (let i = 1; i < n - 1; i++) this.tri(sx[0], sy[0], sw[0], sx[i], sy[i], sw[i], sx[i + 1], sy[i + 1], sw[i + 1], col, sun, fl);
  }

  /** Sutherland-Hodgman against z = NEAR, in place on qx/qy/qz. Returns the new corner count. */
  private clip(n: number): number {
    const ox: number[] = [], oy: number[] = [], oz: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ai = this.qz[i] >= NEAR, aj = this.qz[j] >= NEAR;
      if (ai) { ox.push(this.qx[i]); oy.push(this.qy[i]); oz.push(this.qz[i]); }
      if (ai !== aj) {
        const t = (NEAR - this.qz[i]) / (this.qz[j] - this.qz[i]);
        ox.push(this.qx[i] + (this.qx[j] - this.qx[i]) * t); oy.push(this.qy[i] + (this.qy[j] - this.qy[i]) * t); oz.push(NEAR);
      }
    }
    for (let i = 0; i < ox.length; i++) { this.qx[i] = ox[i]; this.qy[i] = oy[i]; this.qz[i] = oz[i]; }
    return ox.length;
  }

  /** A triangle with perspective-correct depth. Front faces are clockwise on screen. */
  private tri(x0: number, y0: number, w0: number, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number,
    col: number, sun: number, fl: number): void {
    let area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (area >= 0) return; // back face
    // swap 1 and 2 so the area is positive
    let t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; t = w1; w1 = w2; w2 = t;
    area = -area;
    const W = this.W, H = this.H;
    const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(W - 1, Math.floor(Math.max(x0, x1, x2)));
    const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(H - 1, Math.floor(Math.max(y0, y1, y2)));
    if (minx > maxx || miny > maxy) return;
    const inv = 1 / area;
    const a0 = -(y2 - y1), a1 = -(y0 - y2), a2 = -(y1 - y0);
    const { depth, albedo, flags, obj } = this, sunBuf = this.sun;
    for (let y = miny; y <= maxy; y++) {
      const py = y + 0.5, px = minx + 0.5;
      let e0 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
      let e1 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2);
      let e2 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
      let i = y * W + minx;
      for (let x = minx; x <= maxx; x++, i++, e0 += a0, e1 += a1, e2 += a2) {
        if (e0 < 0 || e1 < 0 || e2 < 0) continue;
        const z = 1 / ((e0 * w0 + e1 * w1 + e2 * w2) * inv);
        if (z >= depth[i]) continue;
        depth[i] = z; albedo[i] = col; sunBuf[i] = sun; flags[i] = fl; obj[i] = 0;
      }
    }
  }

  // ---- sprite stacks: voxel splats ------------------------------------------------------------

  /**
   * Draws a sprite stack at a world position. `scale` is world px per voxel; yaw turns it about
   * z (0 = nose along +X), roll banks it about its nose, pitch tips the nose up.
   */
  drawModel(m: Model, x: number, y: number, z: number, yaw: number, scale: number, id: number, roll = 0, pitch = 0, flash = 0): void {
    // model -> world rotation R = Rz(yaw) * Ry(-pitch) * Rx(roll)
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const r00 = cyw * cp, r01 = cyw * sp * sr - syw * cr, r02 = cyw * sp * cr + syw * sr;
    const r10 = syw * cp, r11 = syw * sp * sr + cyw * cr, r12 = syw * sp * cr - cyw * sr;
    const r20 = -sp, r21 = cp * sr, r22 = cp * cr;
    // camera-space position of the origin, and model axes in camera space (scaled)
    const px = x - this.cx, py = y - this.cy, pz = z - this.cz;
    const oz = px * this.fx + py * this.fy + pz * this.fz;
    if (oz < NEAR - m.radius * scale || oz > this.far) return;
    const ox = px * this.rx + py * this.ry, oy = px * this.ux + py * this.uy + pz * this.uz;
    const k0 = this.focal / Math.max(NEAR, oz);
    const sxc = this.W / 2 + ox * k0, syc = this.H / 2 - oy * k0, rad = m.radius * scale * k0 + 2;
    if (oz > NEAR + m.radius * scale && (sxc + rad < 0 || sxc - rad > this.W || syc + rad < 0 || syc - rad > this.H)) return;
    const ax = (r00 * this.rx + r10 * this.ry) * scale, ay = (r00 * this.ux + r10 * this.uy + r20 * this.uz) * scale, az = (r00 * this.fx + r10 * this.fy + r20 * this.fz) * scale;
    const bx = (r01 * this.rx + r11 * this.ry) * scale, by = (r01 * this.ux + r11 * this.uy + r21 * this.uz) * scale, bz = (r01 * this.fx + r11 * this.fy + r21 * this.fz) * scale;
    const cx = (r02 * this.rx + r12 * this.ry) * scale, cy = (r02 * this.ux + r12 * this.uy + r22 * this.uz) * scale, cz = (r02 * this.fx + r12 * this.fy + r22 * this.fz) * scale;
    // the sun in model space, for the per-voxel diffuse term
    const L = this.L;
    const lx = r00 * L[0] + r10 * L[1] + r20 * L[2], ly = r01 * L[0] + r11 * L[1] + r21 * L[2], lz = r02 * L[0] + r12 * L[1] + r22 * L[2];
    const lod = m.lods[k0 * scale < 0.75 && m.lods.length > 1 ? 1 : 0];
    const W = this.W, H = this.H, hw = W / 2, hh = H / 2, f = this.focal;
    const { depth, albedo, flags, obj } = this, sunBuf = this.sun;
    const unit = lod.unit * scale * 1.04;
    const fl = F_OBJ;
    for (let i = 0; i < lod.n; i++) {
      const vx = lod.x[i], vy = lod.y[i], vz = lod.z[i];
      const zc = oz + vx * az + vy * bz + vz * cz;
      if (zc < NEAR) continue;
      const k = f / zc;
      const sx = hw + (ox + vx * ax + vy * bx + vz * cx) * k, sy = hh - (oy + vx * ay + vy * by + vz * cy) * k;
      const size = unit * k, side = size <= 1 ? 1 : Math.ceil(size);
      const xa = Math.round(sx - side / 2), ya = Math.round(sy - side / 2);
      if (xa >= W || ya >= H || xa + side <= 0 || ya + side <= 0) continue;
      const emit = lod.emit[i];
      const d = lod.nx[i] * lx + lod.ny[i] * ly + lod.nz[i] * lz;
      const s = emit ? 0 : Math.max(0, (d + 0.25) / 1.25);
      const col = flash > 0 ? mixRgb(lod.col[i], 0xffffff, flash) : lod.col[i];
      const fv = fl | (emit ? F_EMIT : 0);
      const x1 = Math.min(W, xa + side), y1 = Math.min(H, ya + side), xs = Math.max(0, xa);
      for (let yy = Math.max(0, ya); yy < y1; yy++) {
        let p = yy * W + xs;
        for (let xx = xs; xx < x1; xx++, p++) {
          if (zc >= depth[p]) continue;
          depth[p] = zc; albedo[p] = col; sunBuf[p] = s; flags[p] = fv; obj[p] = id;
        }
      }
    }
    this.stats.voxels += lod.n;
  }

  /** A single glowing voxel (shot, spark, flame): a square `size` world px across. */
  drawPoint(x: number, y: number, z: number, col: number, size: number, id = 0): void {
    const p = this.project(x, y, z);
    if (!p) return;
    const [sx, sy, zc] = p, s = size * this.focal / zc, side = s <= 1 ? 1 : Math.ceil(s);
    const xa = Math.round(sx - side / 2), ya = Math.round(sy - side / 2);
    for (let yy = Math.max(0, ya); yy < Math.min(this.H, ya + side); yy++) for (let xx = Math.max(0, xa); xx < Math.min(this.W, xa + side); xx++) {
      const i = yy * this.W + xx;
      if (zc >= this.depth[i]) continue;
      this.depth[i] = zc; this.albedo[i] = col; this.sun[i] = 0; this.flags[i] = F_EMIT; this.obj[i] = id;
    }
  }

  // ---- the ship layer: twice the detail, composited over the pixel world ----------------------

  /**
   * Draws a sprite stack into the detail layer (ships): same projection, F times the pixels, and
   * hidden by anything nearer in the world layer. `scale` is world px per voxel of this model.
   */
  drawModelHi(m: Model, x: number, y: number, z: number, yaw: number, scale: number, id: number, roll = 0, flash = 0): void {
    const F = this.F, W = this.hiW, H = this.hiH;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    const r00 = cyw, r01 = -syw * cr, r02 = syw * sr;
    const r10 = syw, r11 = cyw * cr, r12 = -cyw * sr;
    const r20 = 0, r21 = sr, r22 = cr;
    const px = x - this.cx, py = y - this.cy, pz = z - this.cz;
    const oz = px * this.fx + py * this.fy + pz * this.fz;
    if (oz < NEAR || oz > this.far) return;
    const ox = px * this.rx + py * this.ry, oy = px * this.ux + py * this.uy + pz * this.uz;
    const f = this.focal * F, k0 = f / oz;
    const sxc = W / 2 + ox * k0, syc = H / 2 - oy * k0, rad = m.radius * scale * k0 + 2;
    if (sxc + rad < 0 || sxc - rad > W || syc + rad < 0 || syc - rad > H) return;
    const ax = (r00 * this.rx + r10 * this.ry) * scale, ay = (r00 * this.ux + r10 * this.uy + r20 * this.uz) * scale, az = (r00 * this.fx + r10 * this.fy + r20 * this.fz) * scale;
    const bx = (r01 * this.rx + r11 * this.ry) * scale, by = (r01 * this.ux + r11 * this.uy + r21 * this.uz) * scale, bz = (r01 * this.fx + r11 * this.fy + r21 * this.fz) * scale;
    const cx = (r02 * this.rx + r12 * this.ry) * scale, cy = (r02 * this.ux + r12 * this.uy + r22 * this.uz) * scale, cz = (r02 * this.fx + r12 * this.fy + r22 * this.fz) * scale;
    const L = this.L;
    const lx = r00 * L[0] + r10 * L[1] + r20 * L[2], ly = r01 * L[0] + r11 * L[1] + r21 * L[2], lz = r02 * L[0] + r12 * L[1] + r22 * L[2];
    const lod = m.lods[k0 * scale < 0.75 && m.lods.length > 1 ? 1 : 0];
    const unit = lod.unit * scale * 1.04, hw = W / 2, hh = H / 2;
    const { hiDepth, hiAlb, hiSun, hiFlag, hiObj, depth, lowX, lowRow } = this;
    let rx0 = W, ry0 = H, rx1 = -1, ry1 = -1;
    for (let i = 0; i < lod.n; i++) {
      const vx = lod.x[i], vy = lod.y[i], vz = lod.z[i];
      const zc = oz + vx * az + vy * bz + vz * cz;
      if (zc < NEAR) continue;
      const k = f / zc;
      const sx = hw + (ox + vx * ax + vy * bx + vz * cx) * k, sy = hh - (oy + vx * ay + vy * by + vz * cy) * k;
      const size = unit * k, side = size <= 1 ? 1 : Math.ceil(size);
      const xa = Math.round(sx - side / 2), ya = Math.round(sy - side / 2);
      if (xa >= W || ya >= H || xa + side <= 0 || ya + side <= 0) continue;
      const emit = lod.emit[i];
      const d = lod.nx[i] * lx + lod.ny[i] * ly + lod.nz[i] * lz;
      const sh = emit ? 0 : Math.max(0, (d + 0.35) / 1.35);
      const col = flash > 0 ? mixRgb(lod.col[i], 0xffffff, flash) : lod.col[i];
      const x1 = Math.min(W, xa + side), y1 = Math.min(H, ya + side), xs = Math.max(0, xa), ys = Math.max(0, ya);
      if (xs < rx0) rx0 = xs; if (ys < ry0) ry0 = ys; if (x1 - 1 > rx1) rx1 = x1 - 1; if (y1 - 1 > ry1) ry1 = y1 - 1;
      for (let yy = ys; yy < y1; yy++) {
        let p = yy * W + xs;
        const lrow = lowRow[yy];
        for (let xx = xs; xx < x1; xx++, p++) {
          if (zc >= hiDepth[p] || zc >= depth[lrow + lowX[xx]]) continue;
          hiDepth[p] = zc; hiAlb[p] = col; hiSun[p] = sh; hiFlag[p] = emit ? 2 : 1; hiObj[p] = id;
        }
      }
    }
    // remember where this ship went (one pixel of margin for its outline)
    if (rx1 >= 0) this.rects.push(Math.max(0, rx0 - 1), Math.max(0, ry0 - 1), Math.min(W - 1, rx1 + 1), Math.min(H - 1, ry1 + 1));
    this.stats.voxels += lod.n;
  }

  /** A soft additive glow in the detail layer (engine flames): radius in world px, colour 0..1. */
  glow(x: number, y: number, z: number, r: number, cr: number, cg: number, cb: number): void { this.flames.push(x, y, z, r, cr, cg, cb); }

  /**
   * Builds the final picture: the world layer scaled up F times, ships lit on top (sun and the
   * same point lights), a thin soft outline round each ship, the flames, then the HUD.
   */
  composite(lights: Light[]): void {
    const F = this.F, W = this.hiW, H = this.hiH, LW = this.W, LH = this.H, f = this.focal * F, hw = W / 2, hh = H / 2;
    const { hiDepth, hiAlb, hiSun, hiFlag, hiObj, hiOut, out, hud, lowX, lowRow } = this;
    // 1. the world, scaled up by whole pixels: widen each row once, then copy it down
    for (let ly = 0; ly < LH; ly++) {
      const row0 = ly * F * W, src = ly * LW;
      let p = row0;
      for (let lx = 0; lx < LW; lx++) { const v = out[src + lx]; for (let k = 0; k < F; k++) hiOut[p++] = v; }
      for (let r = 1; r < F; r++) hiOut.copyWithin(row0 + r * W, row0, row0 + W);
    }
    // 2. ships, lit by the sun and the same point lights, only inside the rectangles they used
    const amb = [0.32, 0.34, 0.44], sunc = [0.82, 0.8, 0.74];
    const fogStart = this.camDist + 250, fogLen = 900, R = this.rects;
    const near: Light[] = [];
    for (let ri = 0; ri < R.length; ri += 4) {
      // only the lights whose reach overlaps this ship on screen
      near.length = 0;
      for (const l of lights) {
        const p = this.project(l.x, l.y, l.z);
        if (!p) continue;
        const sx = p[0] * F, sy = p[1] * F, rr = (l.r * f) / p[2];
        if (sx + rr >= R[ri] && sx - rr <= R[ri + 2] && sy + rr >= R[ri + 1] && sy - rr <= R[ri + 3]) near.push(l);
      }
      for (let y = R[ri + 1]; y <= R[ri + 3]; y++) {
      const b = -(y + 0.5 - hh) / f;
      for (let x = R[ri]; x <= R[ri + 2]; x++) {
        const p = y * W + x, fl = hiFlag[p];
        if (fl !== 1 && fl !== 2) continue;
        hiFlag[p] = fl | 4; // done (rectangles can overlap)
        const c = hiAlb[p];
        let r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255;
        if (fl === 1) {
          const s = hiSun[p];
          let lr = amb[0] + sunc[0] * s, lg = amb[1] + sunc[1] * s, lb = amb[2] + sunc[2] * s;
          const z = hiDepth[p], a = (x + 0.5 - hw) / f;
          const wx = this.cx + (this.fx + this.rx * a + this.ux * b) * z, wy = this.cy + (this.fy + this.ry * a + this.uy * b) * z, wz = this.cz + (this.fz + this.uz * b) * z;
          for (let i = 0; i < near.length; i++) {
            const l = near[i], dx = wx - l.x, dy = wy - l.y, dz = wz - l.z, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= l.r * l.r) continue;
            const att = 1 - Math.sqrt(d2) / l.r, gk = att * att * 1.2;
            lr += l.cr * gk; lg += l.cg * gk; lb += l.cb * gk;
          }
          r *= lr; g *= lg; bl *= lb;
        }
        const fog = Math.min(1, Math.max(0, (hiDepth[p] - fogStart) / fogLen));
        if (fog > 0) { const k = 1 - fog * fog * (3 - 2 * fog); r *= k; g = g * k + 6 * (1 - k); bl = bl * k + 14 * (1 - k); }
        hiOut[p] = 0xff000000 | (clamp255(bl) << 16) | (clamp255(g) << 8) | clamp255(r);
      }
      }
    }
    // 3. a thin soft outline: one detail pixel round each ship, darkening what is behind it
    for (let ri = 0; ri < R.length; ri += 4) for (let y = Math.max(1, R[ri + 1]); y <= Math.min(H - 2, R[ri + 3]); y++) {
      for (let x = Math.max(1, R[ri]); x <= Math.min(W - 2, R[ri + 2]); x++) {
        const p = y * W + x;
        if (hiObj[p] || hiFlag[p] & 8) continue;
        if (!(hiObj[p - 1] || hiObj[p + 1] || hiObj[p - W] || hiObj[p + W])) continue;
        hiFlag[p] |= 8;
        const c = hiOut[p];
        hiOut[p] = 0xff000000 | ((((c >> 16) & 255) * 0.35) << 16) | ((((c >> 8) & 255) * 0.35) << 8) | ((c & 255) * 0.35 + 10);
      }
    }
    // 4. flames: soft additive light, hidden only by what is clearly in front of them
    const fl = this.flames, depth = this.depth;
    for (let i = 0; i < fl.length; i += 7) {
      const px = fl[i] - this.cx, py = fl[i + 1] - this.cy, pz = fl[i + 2] - this.cz;
      const zc = px * this.fx + py * this.fy + pz * this.fz;
      if (zc < NEAR) continue;
      const k = f / zc, sx = hw + (px * this.rx + py * this.ry) * k, sy = hh - (px * this.ux + py * this.uy + pz * this.uz) * k;
      const rad = Math.max(1.2, fl[i + 3] * k), cr = fl[i + 4], cg = fl[i + 5], cb = fl[i + 6];
      const xa = Math.max(0, Math.floor(sx - rad)), xb = Math.min(W - 1, Math.ceil(sx + rad));
      const ya = Math.max(0, Math.floor(sy - rad)), yb = Math.min(H - 1, Math.ceil(sy + rad));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const ex = x + 0.5 - sx, ey = y + 0.5 - sy, d = Math.sqrt(ex * ex + ey * ey) / rad;
        if (d >= 1) continue;
        const p = y * W + x, front = Math.min(hiDepth[p], depth[lowRow[y] + lowX[x]]);
        if (front < zc - 6) continue;
        const g = (1 - d) * (1 - d) * 255, c = hiOut[p];
        hiOut[p] = 0xff000000 | (clamp255(((c >> 16) & 255) + g * cb) << 16) | (clamp255(((c >> 8) & 255) + g * cg) << 8) | clamp255((c & 255) + g * cr);
      }
    }
    // 5. the HUD on top, each HUD pixel F x F
    for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
      const h = hud[ly * LW + lx];
      if (!h) continue;
      const a = h >>> 24;
      if (a === 255) { for (let dy = 0; dy < F; dy++) hiOut.fill(h, (ly * F + dy) * W + lx * F, (ly * F + dy) * W + lx * F + F); continue; }
      // a see-through HUD pixel (panels, edge glows): blend over the picture
      const k = a / 255, r = (h & 255) * k, g = ((h >> 8) & 255) * k, b = ((h >> 16) & 255) * k, j = 1 - k;
      for (let dy = 0; dy < F; dy++) for (let dx = 0, p = (ly * F + dy) * W + lx * F; dx < F; dx++, p++) {
        const c = hiOut[p];
        hiOut[p] = 0xff000000 | (((((c >> 16) & 255) * j + b) | 0) << 16) | (((((c >> 8) & 255) * j + g) | 0) << 8) | (((c & 255) * j + r) | 0);
      }
    }
  }

  /** Slides the composite by the sub-pixel shift into the final picture (edges repeat). */
  present(): ImageData {
    const ox = this.shiftX | 0, oy = this.shiftY | 0;
    if (!ox && !oy) return this.hiImage;
    const W = this.hiW, H = this.hiH, src = this.hiOut, dst = this.finalOut;
    for (let y = 0; y < H; y++) {
      const sy = Math.min(H - 1, Math.max(0, y + oy)), s0 = sy * W, d0 = y * W;
      if (ox >= 0) { dst.set(src.subarray(s0 + ox, s0 + W), d0); dst.fill(src[s0 + W - 1], d0 + W - ox, d0 + W); }
      else { dst.set(src.subarray(s0, s0 + W + ox), d0 - ox); dst.fill(src[s0], d0, d0 - ox); }
    }
    return this.finalImage;
  }

  // ---- lighting and the picture -----------------------------------------------------------------

  /** Lights, background and palette: the G-buffer becomes the image. */
  resolve(lights: Light[], wallInfo: Uint8Array, tiles: Uint8Array, mapN: number, opt: { outline: boolean; dither: boolean; palette: boolean }): void {
    const W = this.W, H = this.H, f = this.focal, hw = W / 2, hh = H / 2;
    const { accR, accG, accB, depth, albedo, flags, out, lut } = this, sunBuf = this.sun;
    accR.fill(0); accG.fill(0); accB.fill(0);
    // point lights: walk each light's screen rectangle
    for (const l of lights) {
      const p = this.project(l.x, l.y, l.z);
      if (!p) continue;
      const [lsx, lsy, lz] = p, rs = (l.r * f) / lz, hr = (l.halo * f) / lz;
      const reach = Math.max(rs, hr);
      const xa = Math.max(0, Math.floor(lsx - reach)), xb = Math.min(W - 1, Math.ceil(lsx + reach));
      const ya = Math.max(0, Math.floor(lsy - reach)), yb = Math.min(H - 1, Math.ceil(lsy + reach));
      if (xa > xb || ya > yb) continue;
      this.stats.lights++;
      const r2 = l.r * l.r;
      for (let y = ya; y <= yb; y++) {
        const b = -(y + 0.5 - hh) / f;
        for (let x = xa; x <= xb; x++) {
          const i = y * W + x, a = (x + 0.5 - hw) / f;
          // halo: a soft disc on screen, in front of whatever is behind the light
          if (hr > 0) {
            const ex = x + 0.5 - lsx, ey = y + 0.5 - lsy, ds = Math.sqrt(ex * ex + ey * ey) / hr;
            if (ds < 1 && depth[i] > lz - 6) { const g = (1 - ds) * (1 - ds) * 0.9; accR[i] += l.cr * g; accG[i] += l.cg * g; accB[i] += l.cb * g; }
          }
          const z = depth[i];
          if (z === Infinity || flags[i] & F_EMIT) continue;
          const wx = this.cx + (this.fx + this.rx * a + this.ux * b) * z - l.x;
          const wy = this.cy + (this.fy + this.ry * a + this.uy * b) * z - l.y;
          const wz = this.cz + (this.fz + this.uz * b) * z - l.z;
          const d2 = wx * wx + wy * wy + wz * wz;
          if (d2 >= r2) continue;
          const att = 1 - Math.sqrt(d2) / l.r, g = att * att * 1.6;
          accR[i] += l.cr * g; accG[i] += l.cg * g; accB[i] += l.cb * g;
        }
      }
    }

    const amb = [0.2, 0.23, 0.34], sunc = [0.95, 0.9, 0.82];
    const t = this.time, fogStart = this.camDist + 250, fogLen = 900;
    const nebZ = -2600, starLo = -6000, starHi = 6000; // far away, so they drift slowly
    const ditherAmp = opt.dither ? 10 : 0;
    this.planetsVis = [];
    for (const P of this.planets) {
      const q = this.project(P.x, P.y, P.z);
      if (!q) continue;
      const sr = (P.r * 1.15 * f) / q[2] + 2;
      if (q[0] + sr < 0 || q[0] - sr > W || q[1] + sr < 0 || q[1] - sr > H) continue;
      this.planetsVis.push({ ...P, sx: q[0], sy: q[1], sr2: sr * sr });
    }
    const nebAct = this.nebulae.filter(nb => Math.hypot(nb.x - this.cx, nb.y - this.cy) < nb.r * 1.25 + this.far);
    for (let y = 0; y < H; y++) {
      const b = -(y + 0.5 - hh) / f;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, a = (x + 0.5 - hw) / f;
        const dx = this.fx + this.rx * a + this.ux * b, dy = this.fy + this.ry * a + this.uy * b, dz = this.fz + this.uz * b;
        const z = depth[i];
        let r: number, g: number, bl: number;
        if (z === Infinity) {
          this.pxX = x + 0.5; this.pxY = y + 0.5;
          this.background(dx, dy, dz, t, starLo, starHi, nebZ, f); r = this.bgR; g = this.bgG; bl = this.bgB;
        } else {
          const fl = flags[i];
          let c = albedo[i];
          const wx = this.cx + dx * z, wy = this.cy + dy * z, wz = this.cz + dz * z;
          let emit = (fl & F_EMIT) !== 0;
          if (fl & F_WALL) { const s = this.wallTop(wx, wy, wz, wallInfo, mapN); c = s & 0xffffff; emit = s > 0xffffff; }
          else if (fl & F_SIDE) { const s = this.wallSide(wx, wy, wz, (fl >> 5) & 7, wallInfo, mapN); c = s & 0xffffff; emit = s > 0xffffff; }
          else if (fl & F_DECK) { const s = this.deck(wx, wy); c = s & 0xffffff; emit = s > 0xffffff; }
          r = (c >> 16) & 255; g = (c >> 8) & 255; bl = c & 255;
          if (!emit) {
            const s = sunBuf[i];
            r *= amb[0] + sunc[0] * s + accR[i]; g *= amb[1] + sunc[1] * s + accG[i]; bl *= amb[2] + sunc[2] * s + accB[i];
          } else { r *= 1 + accR[i] * 0.3; g *= 1 + accG[i] * 0.3; bl *= 1 + accB[i] * 0.3; }
          // distance fog into the void
          const fog = Math.min(1, Math.max(0, (z - fogStart) / fogLen));
          if (fog > 0) { const k = 1 - fog * fog * (3 - 2 * fog); r *= k; g = g * k + 6 * (1 - k); bl = bl * k + 14 * (1 - k); }
        }
        // halos on top of empty space too
        if (z === Infinity) { r += accR[i] * 150; g += accG[i] * 150; bl += accB[i] * 150; }
        // the safe zone's deck: a see-through green grid plane just under the ships
        if (dz < -1e-4) {
          const td = (DECK_Z - this.cz) / dz;
          if (td > 0 && td < z) {
            const px = this.cx + dx * td, py = -(this.cy + dy * td), tx = Math.floor(px / 16), ty = Math.floor(py / 16);
            if (tx >= 0 && ty >= 0 && tx < mapN && ty < mapN && tiles[ty * mapN + tx] === 2) {
              // a calm green tint with faint grid lines, no checkerboard and no pulse
              const line = this.deck(px, py) === 0x168058;
              const k = line ? 0.22 : 0.13;
              r += (20 - r) * k; g += (110 - g) * k; bl += (80 - bl) * k;
            }
          }
        }
        // the zone's edge: no wall, a soft violet energy field that brightens towards the boundary
        if (dz < -1e-4) {
          const te = (6 - this.cz) / dz;
          if (te > 0 && te < z) {
            const px = this.cx + dx * te, py = -(this.cy + dy * te), S = mapN * 16, B = BORDER * 16;
            const e = Math.min(px, py, S - px, S - py) - B;
            const near = Math.max(0, Math.min(1, 1 - (te - 500) / 900)); // fades out with distance: no line on the horizon
            if (e < 240 && near > 0) {
              const pix = te / f; // world px per screen pixel there
              let k = e < 0 ? 0.2 : (1 - e / 240) * (1 - e / 240) * 0.22;
              if (Math.abs(e) < pix * 1.2) k = 0.6; // the boundary line itself
              else if (e < 0 && (Math.abs(px % 64) < pix || Math.abs(py % 64) < pix)) k += 0.1; // a faint field grid
              k *= near;
              r += (120 - r) * k; g += (96 - g) * k; bl += (255 - bl) * k;
            }
          }
        }
        // nebula regions: a soft coloured haze over that part of the zone, thickest in its middle
        if (nebAct.length && dz < -1e-4) {
          const tq = Math.min(z, (0 - this.cz) / dz);
          if (tq > 0) {
            const px = this.cx + dx * tq, py = this.cy + dy * tq;
            for (const nb of nebAct) {
              const d = Math.hypot(px - nb.x, py - nb.y) / nb.r;
              if (d >= 1.25) continue;
              const fall = d < 0.6 ? 1 : 1 - (d - 0.6) / 0.65, den = sampleSmooth(this.cloud, 256, px * 0.0005, py * 0.0005);
              const k = fall * fall * (0.35 + den * 0.65) * 0.42;
              r += ((nb.c >> 16) & 255) * k; g += ((nb.c >> 8) & 255) * k; bl += (nb.c & 255) * k;
            }
          }
        }
        if (opt.palette) {
          const dd = ditherAmp ? BAYER[(y & 3) * 4 + (x & 3)] * ditherAmp : 0;
          const R = clamp255(r + dd), G = clamp255(g + dd), B = clamp255(bl + dd);
          out[i] = lut[((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3)];
        } else {
          out[i] = 0xff000000 | (clamp255(bl) << 16) | (clamp255(g) << 8) | clamp255(r);
        }
      }
    }
    if (opt.outline) this.outline();
  }

  /** Stars on two far planes (below and above, so every view has them) and the nebula floor. */
  private bgR = 0; private bgG = 0; private bgB = 0;
  /** Far planets: real spheres a long way below the zone, so they drift slowly and look right from any view. */
  nebulae: { x: number; y: number; r: number; c: number }[] = [];
  planets: { x: number; y: number; z: number; r: number; a: number; b: number; ring: boolean; seed: number }[] = [];
  /** This frame's planets that reach the screen, with their screen circle (for a quick reject per pixel). */
  private planetsVis: (Renderer['planets'][number] & { sx: number; sy: number; sr2: number })[] = [];
  private pxX = 0; private pxY = 0;
  private background(dx: number, dy: number, dz: number, _t: number, lo: number, hi: number, nebZ: number, f: number): void {
    let r = 4, g = 6, b = 14;
    const d2 = dx * dx + dy * dy + dz * dz;
    for (const P of this.planetsVis) {
      const ex = this.pxX - P.sx, ey = this.pxY - P.sy;
      if (ex * ex + ey * ey > P.sr2) continue; // not near this planet on screen
      const ox = this.cx - P.x, oy = this.cy - P.y, oz = this.cz - P.z;
      const bq = ox * dx + oy * dy + oz * dz;
      if (bq > 0) continue; // behind the camera
      const cq = ox * ox + oy * oy + oz * oz - P.r * P.r, disc = bq * bq - d2 * cq;
      const perp = Math.sqrt(Math.max(0, cq + P.r * P.r - (bq * bq) / d2)); // closest distance of the ray to the centre
      if (disc > 0) {
        const t = (-bq - Math.sqrt(disc)) / d2;
        const nx = (ox + dx * t) / P.r, ny = (oy + dy * t) / P.r, nz = (oz + dz * t) / P.r;
        const lam = Math.max(0, -0.5 * nx + 0.45 * ny + 0.74 * nz) * 0.75 + 0.25 * (nz * 0.5 + 0.5); // wrapped: never a black disc
        const band = Math.sin(ny * 7 + Math.sin(nx * 4 + P.seed) * 1.4 + P.seed) * 0.5 + 0.5;
        const ca = P.a, cb = P.b, k = (0.1 + lam * 0.8) * 0.6;
        r = (((ca >> 16) & 255) * band + ((cb >> 16) & 255) * (1 - band)) * k;
        g = (((ca >> 8) & 255) * band + ((cb >> 8) & 255) * (1 - band)) * k;
        b = ((ca & 255) * band + (cb & 255) * (1 - band)) * k;
        const rim = Math.pow(1 - Math.abs(nx * dx + ny * dy + nz * dz) / Math.sqrt(d2), 3) * lam; // thin lit atmosphere
        r += 60 * rim; g += 90 * rim; b += 130 * rim;
        this.bgR = r; this.bgG = g; this.bgB = b;
        return;
      }
      if (perp < P.r * 1.12) { // a soft halo of atmosphere around the edge
        const k = 1 - (perp - P.r) / (P.r * 0.12);
        r += 14 * k * k; g += 22 * k * k; b += 40 * k * k;
      }
    }
    // nebula floor far below, coloured by a second noise
    if (dz < -1e-4) {
      const tn = (nebZ - this.cz) / dz;
      const u = (this.cx + dx * tn) * 0.0002, v = (this.cy + dy * tn) * 0.0002;
      const d = sampleSmooth(this.cloud, 256, u, v), mixv = sample(this.tint, 128, u * 0.6, v * 0.6);
      // a dim, smooth glow far below: depth without noise competing with the ships
      const k = Math.max(0, d - 0.45) * 0.5 * Math.min(1, 4000 / tn);
      r += k * (40 + 50 * mixv); g += k * (24 + 40 * (1 - mixv)); b += k * (80 + 30 * mixv);
    }
    const zp = dz < 0 ? lo : hi;
    if (Math.abs(dz) > 1e-4) {
      const ts = (zp - this.cz) / dz;
      if (ts > 0) {
        const px = this.cx + dx * ts, py = this.cy + dy * ts, G = 46;
        const gx = Math.floor(px / G), gy = Math.floor(py / G), h = hash2(gx, gy, 77);
        // keep the same stars per screen pixel at any angle: a grazing plane packs many cells
        // into a pixel, so the chance a cell holds a star shrinks with its screen footprint
        const nz = Math.abs(dz) / Math.sqrt(dx * dx + dy * dy + dz * dz), cellPx = (G * f) / ts;
        const pStar = Math.min(0.12, (cellPx * cellPx * nz) / 520);
        if (h < pStar) {
          const sx = (gx + hash2(gx, gy, 78)) * G, sy = (gy + hash2(gx, gy, 79)) * G;
          const pixel = ts / f; // world px per screen pixel on that plane
          const ex = px - sx, ey = py - sy, dd = Math.sqrt(ex * ex + ey * ey) / pixel;
          const big = h < pStar * 0.06 ? 1.3 : 0.62;
          if (dd < big) {
            const tw = 0.55; // steady: twinkling single pixels read as flicker
            const kind = hash2(gx, gy, 80), lum = (120 + 135 * (h / pStar)) * tw;
            r += lum * (kind < 0.2 ? 1 : 0.85); g += lum * (kind < 0.2 ? 0.9 : 0.9); b += lum * (kind < 0.2 ? 0.6 : 1.05);
          }
        }
      }
    }
    this.bgR = r; this.bgG = g; this.bgB = b;
  }

  /** Wall tops: blue steel plates, a seam grid every two tiles, rivets, lit and shadowed rims. */
  /** Rock tops: cool grey stone in broad patches, a lit rim where the ground steps down, rare glowing crystals. */
  private wallTop(wx: number, wy: number, wz: number, info: Uint8Array, n: number): number {
    const sx = wx, sy = -wy, tx = Math.floor(sx / 16), ty = Math.floor(sy / 16);
    if (tx < 0 || ty < 0 || tx >= n || ty >= n) return 0x3b4152;
    const e = info[ty * n + tx], lx = sx - tx * 16, ly = sy - ty * 16, v = hash2(tx, ty, 5);
    if (e & METAL) { // a derelict's steel deck plates
      if ((e & OPEN_N && ly < 2) || (e & OPEN_W && lx < 2)) return 0xa6c0e0;
      if ((e & OPEN_S && ly > 14) || (e & OPEN_E && lx > 14)) return 0x17203c;
      if ((tx % 2 === 0 && lx < 1) || (ty % 2 === 0 && ly < 1)) return 0x17203c;
      if (v > 0.8 && lx >= 7 && lx < 9 && ly >= 7 && ly < 9) return 0x1000000 | 0xffb050; // a working light
      return v > 0.7 ? 0x2c3e6c : 0x2a3b68;
    }
    if (v > 0.965 && lx >= 6 && lx < 10 && ly >= 6 && ly < 9) return 0x1000000 | (v > 0.985 ? 0xb488ff : 0x5fd0ff); // a crystal
    if ((e & OPEN_N && ly < 1.5) || (e & OPEN_W && lx < 1.5)) return 0x7c8496;
    if ((e & OPEN_S && ly > 14.5) || (e & OPEN_E && lx > 14.5)) return 0x22252f;
    // broad patches (8 px), not per-pixel speckle: calm to look at
    const p = hash2(Math.floor(sx / 8), Math.floor(sy / 8), 9), lift = 0.8 + Math.min(1, Math.max(0, (wz - 10) / 30)) * 0.35;
    const base = e & DEEP ? 0x3f4456 : p < 0.33 ? 0x3a3f50 : p < 0.66 ? 0x424758 : 0x46454f;
    return shade(base, lift);
  }
  /** Rock faces: soft strata that wander a little, darker towards the underside. */
  private wallSide(wx: number, wy: number, wz: number, kind: number, info: Uint8Array, n: number): number {
    const along = kind === 1 || kind === 2 ? wx : wy;
    let metal = false;
    for (const [ox, oy] of [[0.5, 0.5], [-0.5, -0.5]]) {
      const tx = Math.floor((wx + ox) / 16), ty = Math.floor((-wy + oy) / 16);
      if (tx >= 0 && ty >= 0 && tx < n && ty < n && info[ty * n + tx] & METAL) metal = true;
    }
    if (metal) {
      const panel = Math.floor(along / 32), lp = along - panel * 32;
      if (wz > 12 && wz < 14.5) return panel & 1 ? 0x1000000 | 0x1d6eb0 : 0x10162a;
      if (lp < 1.2) return 0x0a0d1a;
      return wz > 0 ? 0x2a3b68 : 0x1f2c52;
    }
    const cell = Math.floor(along / 12), wob = (hash2(cell, kind, 3) - 0.5) * 5;
    const band = Math.floor((wz + wob) / 6), h = hash2(cell >> 1, band, 4);
    if (h > 0.992 && wz > 0) return 0x1000000 | 0x3a9cc8; // a faint vein of crystal
    const base = band & 1 ? 0x33374a : h < 0.5 ? 0x2c3040 : 0x2f3242;
    return shade(base, 0.55 + Math.min(1, Math.max(0, (wz + 40) / 80)) * 0.55);
  }


  /** The safe deck: dark green plates with a bright grid, and a slow pulse running outwards. */
  private deck(wx: number, wy: number): number {
    const gx = ((wx % 32) + 32) % 32, gy = ((wy % 32) + 32) % 32;
    if (gx < 1.5 || gy < 1.5) return 0x168058;
    return 0x0c4a34;
  }

  /** A dark one-pixel outline around sprite stacks, drawn on the far side of their edge. */
  private outline(): void {
    const { W, H, obj, depth, flags, out } = this;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, me = obj[i], dz = depth[i];
      for (let n = 0; n < 4; n++) {
        const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - W : i + W, o = obj[j];
        if (o && o !== me && flags[j] & F_OBJ && depth[j] < dz - 4) { out[i] = INK; break; }
      }
    }
  }
}

function norm(x: number, y: number, z: number): [number, number, number] { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
/** A colour scaled by k (0..2), clamped. */
function shade(c: number, k: number): number {
  return (clamp255(((c >> 16) & 255) * k) << 16) | (clamp255(((c >> 8) & 255) * k) << 8) | clamp255((c & 255) * k);
}
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** Nearest sample of a size x size tiling texture at (u, v) in texture repeats. */
function sample(tex: Float32Array, size: number, u: number, v: number): number {
  const x = Math.floor(u * size) & (size - 1), y = Math.floor(v * size) & (size - 1);
  return tex[y * size + x];
}
/** Bilinear sample: soft gradients instead of blocky texels that shimmer as the view moves. */
function sampleSmooth(tex: Float32Array, size: number, u: number, v: number): number {
  const fx = u * size - 0.5, fy = v * size - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  const m = size - 1, x1 = (x0 + 1) & m, y1 = (y0 + 1) & m, xa = x0 & m, ya = y0 & m;
  const a = tex[ya * size + xa], b = tex[ya * size + x1], c = tex[y1 * size + xa], d = tex[y1 * size + x1];
  return a + (b - a) * ax + (c - a) * ay + (a - b - c + d) * ax * ay;
}
function mixRgb(a: number, b: number, k: number): number {
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k, g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}
