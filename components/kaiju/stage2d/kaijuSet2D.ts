// kaijuSet2D — everything that is not a dancer in the 2D Kaiju disco, drawn on a canvas in stage space
// (1600×900 world): the club wall + LED equaliser, the glowing Plajah mark, the perspective light-up tile
// floor (with glossy reflections handled by the stage), moving-head beams, the descending disco ball with
// light dots, lasers, confetti cannons, speaker stacks and the quiet-time spotlight + dim.
//
// It reads one mutable runtime (Set2DRuntime) filled each frame by the stage, and the StageState produced
// by the shared StageDirector — so the same energy logic drives the 2D and 3D versions. All glow is done
// with pre-rendered soft sprites + additive blending (no shadowBlur / filters in the frame loop).

import type { KaijuStyle } from '../kaijuAudio';
import type { StageState } from '../stage3d/kaijuStageDirector';

export const W = 1600, H = 900;
export interface Set2DRuntime {
  t: number; dt: number; beats: number; beatPhase: number; beatCount: number; beat: boolean;
  kick: number; bass: number; treble: number; level: number; onset: number;
  bands: Float32Array; palette: RGB[]; style: KaijuStyle; st: StageState;
  feet: [{ x: number; y: number }, { x: number; y: number }];
  spot: { x: number; y: number };
  reduced: boolean;
  /** 0 full · 1 lean · 2 minimal — fewer draw ops (see STAGE2D_LEVELS) */
  detail?: number;
}
export type RGB = [number, number, number];

export const PALETTES: Record<KaijuStyle, RGB[]> = {
  edm: [[255, 46, 154], [0, 194, 255], [255, 212, 0], [138, 43, 255]],
  rock: [[255, 106, 42], [212, 0, 85], [255, 176, 0], [122, 0, 255]],
  ballet: [[255, 158, 199], [231, 176, 75], [201, 155, 255], [255, 233, 243]],
  zen: [[127, 224, 196], [156, 136, 232], [156, 214, 255], [255, 196, 221]],
};
const WHITE_RGB: RGB = [255, 255, 255];
const BRAND: RGB[] = [[107, 0, 153], [212, 0, 85], [255, 140, 0]];

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a = 1, g = 1) => `rgba(${Math.min(255, (c[0] * g) | 0)},${Math.min(255, (c[1] * g) | 0)},${Math.min(255, (c[2] * g) | 0)},${a.toFixed(3)})`;

// floor geometry: tiles sit on a perspective plane running from y0 (back, under the wall) to beyond the bottom edge
export const FLOOR = { y0: 640, y1: 1060, cols: 16, rows: 8, wBack: 1180, wFront: 3400, cx: 800 };
const rowY = (i: number) => FLOOR.y0 + (FLOOR.y1 - FLOOR.y0) * Math.pow(i / FLOOR.rows, 1.55);
const halfW = (y: number) => { const t = (y - FLOOR.y0) / (FLOOR.y1 - FLOOR.y0); return (FLOOR.wBack + (FLOOR.wFront - FLOOR.wBack) * t) / 2; };
const colX = (j: number, y: number) => FLOOR.cx + ((j / FLOOR.cols) - 0.5) * 2 * halfW(y);
/** Where a stage-space point sits on the floor grid (fractional col,row) — for the under-dancer glow. */
export function floorCell(x: number, y: number) {
  let row = 0; for (let i = 0; i < FLOOR.rows; i++) if (y >= rowY(i)) row = i + (y - rowY(i)) / (rowY(i + 1) - rowY(i));
  return { col: ((x - FLOOR.cx) / (2 * halfW(y)) + 0.5) * FLOOR.cols, row };
}

type Confetto = { on: boolean; x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; c: string; w: number; flip: number };

export class KaijuSet2D {
  private glow!: HTMLCanvasElement;        // soft white blob (tinted by drawing with globalCompositeOperation lighter)
  private logo!: HTMLCanvasElement;
  private logoReady = false;
  private conf: Confetto[] = Array.from({ length: 260 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, life: 0, c: '#fff', w: 8, flip: 0 }));
  private cc = 0;
  private flipBeat = 0; private lastBeatCount = -1; private chase = 0; private rings: number[] = []; private lastKick = 0;
  private sparkle = new Float32Array(FLOOR.cols * FLOOR.rows);
  private pat = { a: 'spectrum', b: 'ripple', mix: 1, n: -1 };
  private ballRot = 0;
  private tint: HTMLCanvasElement | null = null;

  constructor() {
    const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.glow = mk(128, 128);
    const g = this.glow.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.logo = mk(900, 520);
    this.paintLogo();
    // the wordmark uses a web font that may arrive late — repaint once it has
    try { (document as any).fonts?.ready?.then(() => this.paintLogo()); } catch { /* ignore */ }
  }

  private paintLogo() {
    const c = this.logo, g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
    g.save(); g.translate(450, 190); g.scale(3.2, 3.2); g.translate(-50, -50);
    const gr = g.createLinearGradient(30, 20, 70, 80); gr.addColorStop(0, '#6B0099'); gr.addColorStop(0.5, '#D40055'); gr.addColorStop(1, '#FF8C00');
    g.strokeStyle = gr; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(30, 20); g.lineTo(70, 50); g.lineTo(30, 80); g.stroke(); g.restore();
    g.font = "800 150px 'Outfit','Poppins','Nunito','Segoe UI',system-ui,sans-serif"; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const tg = g.createLinearGradient(150, 400, 750, 440); tg.addColorStop(0, '#9B2BD6'); tg.addColorStop(1, '#FF5A9A');
    g.fillStyle = tg; g.fillText('Plajah', 450, 470);
    this.logoReady = true;
  }

  /** Blow a coloured soft blob (the shared glow sprite) — additive. */
  private blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
    if (a < 0.01) return;
    if (!this.tint) { this.tint = document.createElement('canvas'); this.tint.width = this.tint.height = 128; }
    // tint once per colour via a tiny cache keyed on the rounded colour
    const key = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    let t = this.tintCache.get(key);
    if (!t) {
      t = document.createElement('canvas'); t.width = t.height = 128; const g = t.getContext('2d')!;
      g.drawImage(this.glow, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgb(${key})`; g.fillRect(0, 0, 128, 128);
      if (this.tintCache.size > 160) this.tintCache.clear();
      this.tintCache.set(key, t);
    }
    const prev = ctx.globalAlpha; ctx.globalAlpha = clamp(a); ctx.drawImage(t, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = prev;
  }
  private tintCache = new Map<string, HTMLCanvasElement>();
  private readonly bloom = new Float32Array(FLOOR.cols * FLOOR.rows * 8);
  private readonly glints = new Float32Array(9 * 18 * 4);

  spawnConfetti(n: number, pal: RGB[]) {
    for (let k = 0; k < n; k++) {
      const p = this.conf[this.cc++ % this.conf.length], side = k % 2 ? 1 : -1;
      p.on = true; p.life = 0; p.x = 800 + side * 760; p.y = 880;
      p.vx = -side * (260 + Math.random() * 620); p.vy = -(900 + Math.random() * 700); p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 18;
      p.c = rgba(mixRGB(pal[Math.floor(Math.random() * pal.length)], [255, 255, 255], Math.random() * 0.35), 1, 1.15); p.w = 7 + Math.random() * 7; p.flip = Math.random() * 6;
    }
  }

  // ------------------------------------------------------------------------------------------------ back layers
  drawBack(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const { st } = rt, dim = st.dim;
    // wall
    const wall = ctx.createLinearGradient(0, -200, 0, FLOOR.y0 + 40);
    wall.addColorStop(0, '#05030a'); wall.addColorStop(0.6, '#0e0719'); wall.addColorStop(1, '#190c2c');
    ctx.fillStyle = wall; ctx.fillRect(-400, -300, W + 800, FLOOR.y0 + 340);

    ctx.globalCompositeOperation = 'lighter';
    this.led(ctx, rt);
    this.logoDraw(ctx, rt);
    ctx.globalCompositeOperation = 'source-over';

    this.floor(ctx, rt);
    ctx.globalCompositeOperation = 'lighter';
    this.beams(ctx, rt);
    this.ball(ctx, rt);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    this.speakers(ctx, rt);
    ctx.globalAlpha = 1;
    void dim;
  }

  private led(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const { st, bands, palette } = rt, d = rt.detail ?? 0, N = d >= 2 ? 26 : 52, k = 1 - 0.9 * st.dim;
    const baseY = FLOOR.y0 - 6;
    for (let i = 0; i < N; i++) {
      const x = -60 + (i + 0.5) * ((W + 120) / N);
      const mid = Math.abs(i - (N - 1) / 2) / (N / 2);
      const band = bands[Math.min(31, Math.floor(mid * 32))];
      const h = 36 + band * 330 * (0.5 + 0.5 * st.floor);
      const c = mixRGB(palette[i % palette.length], palette[(i + 1) % palette.length], 0.5);
      const a = (0.12 + band * 0.75) * k;
      const bw = d >= 2 ? 44 : 22;
      ctx.fillStyle = rgba(c, a, 1.0); ctx.fillRect(x - bw / 2, baseY - h, bw, h);
      if (d >= 1) continue;
      ctx.fillStyle = rgba(c, a * 0.35, 1.0); ctx.fillRect(x - 17, baseY - h - 6, 34, h + 6);       // cheap halo
      ctx.fillStyle = rgba(WHITE_RGB, a * 0.8, 1); ctx.fillRect(x - 11, baseY - h, 22, 4);    // bright cap
    }
  }

  private logoDraw(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    if (!this.logoReady) return;
    const { st, kick } = rt, k = 1 - 0.85 * st.dim, s = 0.82 * (1 + 0.07 * kick);
    ctx.save(); ctx.globalAlpha = 0.9 * k; ctx.translate(800, 250); ctx.scale(s, s);
    // glow underlay
    const c = BRAND[1];
    this.blob(ctx, 0, -20, 430, c, 0.28 * k);
    ctx.globalAlpha = 0.9 * k; ctx.drawImage(this.logo, -450, -190);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  private patterns(rt: Set2DRuntime) {
    const { st, f } = { st: rt.st, f: rt }, dt = rt.dt;
    if (rt.beat && rt.beatCount !== this.lastBeatCount) { this.lastBeatCount = rt.beatCount; this.flipBeat ^= (rt.beatCount % 2); }
    this.chase = (this.chase + dt * (st.tier === 'peak' ? 9 : 4)) % FLOOR.cols;
    if (f.kick > 0.9 && rt.t - this.lastKick > 0.28) { this.lastKick = rt.t; this.rings.push(0); if (this.rings.length > 4) this.rings.shift(); }
    this.rings = this.rings.map(a => a + dt).filter(a => a < 2);
    if (rt.onset > 0.5) for (let i = 0; i < 3 + (st.tier === 'peak' ? 4 : 0); i++) this.sparkle[Math.floor(Math.random() * this.sparkle.length)] = 1;
    const dec = Math.exp(-dt * 5); for (let i = 0; i < this.sparkle.length; i++) this.sparkle[i] *= dec;
    const every = st.tier === 'quiet' || st.tier === 'silent' ? 16 : 8, blk = Math.floor(rt.beats / every);
    if (blk !== this.pat.n) {
      this.pat.n = blk;
      const order = st.tier === 'peak' ? ['checker', 'chase', 'sparkle', 'spectrum', 'ripple'] : st.tier === 'groove' ? ['spectrum', 'ripple', 'chase', 'rainbow', 'checker', 'sparkle'] : ['ripple', 'rainbow', 'spectrum'];
      this.pat.a = this.pat.b; this.pat.b = order[Math.floor(Math.random() * order.length)]; this.pat.mix = 0;
    }
    this.pat.mix = Math.min(1, this.pat.mix + dt / 0.6);
  }

  private cell(name: string, c: number, r: number, rt: Set2DRuntime): number {
    const C = FLOOR.cols, R = FLOOR.rows;
    switch (name) {
      case 'spectrum': { const band = rt.bands[Math.min(31, Math.floor((c / C) * 32))]; return clamp(band * R * 1.15 - (R - 1 - r) + 0.15); }
      case 'checker': return (((c + r + this.flipBeat) & 1) ? 1 : 0.14) * (0.65 + 0.35 * rt.kick);
      case 'ripple': { const d = Math.hypot((c - (C - 1) / 2) * 0.62, (r - (R - 1) / 2)); let v = 0.06; for (const a of this.rings) { const Rr = a * 5.2; v += Math.exp(-((d - Rr) ** 2) / 0.9) * Math.max(0, 1 - a / 1.9); } return clamp(v); }
      case 'chase': { let v = 0.08; const dc = ((this.chase - c) % C + C) % C; if (dc < 4) v = Math.max(v, 1 - dc / 4); const dr = (((C - this.chase) * (R / C) - r) % R + R) % R; if (dr < 2.5) v = Math.max(v, 0.85 - dr / 3.2); return v; }
      case 'sparkle': return this.sparkle[r * C + c];
      default: return 0.35 + 0.45 * Math.sin((c + r) * 0.55 - rt.t * 2.2) ** 2;
    }
  }

  private floor(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    this.patterns(rt);
    const { st, palette } = rt, C = FLOOR.cols, R = FLOOR.rows, bright = st.floor * (1 - 0.55 * st.dim);
    // dark glossy base
    const base = ctx.createLinearGradient(0, FLOOR.y0, 0, FLOOR.y1); base.addColorStop(0, '#0b0614'); base.addColorStop(1, '#060309');
    ctx.fillStyle = base; ctx.fillRect(-400, FLOOR.y0 - 2, W + 800, H - FLOOR.y0 + 400);
    const cells = [floorCell(rt.feet[0].x, rt.feet[0].y), floorCell(rt.feet[1].x, rt.feet[1].y)];
    const pa = this.pat.a, pb = this.pat.b, m = this.pat.mix;
    let nb = 0; const bl = this.bloom;   // deferred bloom rects: x, y, w, h, alpha, r, g, b
    for (let r = 0; r < R; r++) {
      const ya = rowY(r), yb = rowY(r + 1), wa = halfW(ya), wb = halfW(yb);
      const gapY = (yb - ya) * 0.045;
      for (let c = 0; c < C; c++) {
        let v = this.cell(pa, c, r, rt) * (1 - m) + this.cell(pb, c, r, rt) * m;
        const u = (c / C + r * 0.07 + rt.t * 0.05) % 1, ci = Math.floor(u * palette.length);
        let col = mixRGB(palette[ci % palette.length], palette[(ci + 1) % palette.length], (u * palette.length) % 1);
        let under = 0;
        for (let d = 0; d < 2; d++) { const q = cells[d]; const dd = Math.hypot((c + 0.5 - q.col) * 0.8, (r + 0.5 - q.row) * 1.15); under = Math.max(under, Math.pow(clamp(1 - dd / 2.4), 2)); }
        if (under > 0.01) { v = Math.max(v, under * 0.95); col = mixRGB(col, palette[(c + r + 1) % palette.length], under * 0.4); }
        const lit = 0.04 + v * 1.05 * bright;
        const x0a = FLOOR.cx + ((c / C) - 0.5) * 2 * wa, x1a = FLOOR.cx + (((c + 1) / C) - 0.5) * 2 * wa;
        const x0b = FLOOR.cx + ((c / C) - 0.5) * 2 * wb, x1b = FLOOR.cx + (((c + 1) / C) - 0.5) * 2 * wb;
        const gx0 = (x1a - x0a) * 0.022, gx1 = (x1b - x0b) * 0.022;
        ctx.fillStyle = rgba(col, clamp(0.35 + lit * 0.65), clamp(lit, 0, 1.25) * 1.0);
        ctx.beginPath(); ctx.moveTo(x0a + gx0, ya + gapY); ctx.lineTo(x1a - gx0, ya + gapY); ctx.lineTo(x1b - gx1, yb - gapY); ctx.lineTo(x0b + gx1, yb - gapY); ctx.closePath(); ctx.fill();
        if (v > 0.5 && (rt.detail ?? 0) === 0) {   // lit tiles bloom upward a little (drawn after the loop in one additive pass)
          const o = nb * 8; nb++;
          bl[o] = x0a; bl[o + 1] = ya - (yb - ya) * 0.35; bl[o + 2] = x1a - x0a; bl[o + 3] = (yb - ya) * 0.35; bl[o + 4] = (v - 0.5) * 0.28 * bright; bl[o + 5] = col[0]; bl[o + 6] = col[1]; bl[o + 7] = col[2];
        }
      }
    }
    if (nb) {
      ctx.globalCompositeOperation = 'lighter'; const c3: RGB = [0, 0, 0];
      for (let i = 0; i < nb; i++) { const o = i * 8; c3[0] = bl[o + 5]; c3[1] = bl[o + 6]; c3[2] = bl[o + 7]; ctx.fillStyle = rgba(c3, bl[o + 4], 1); ctx.fillRect(bl[o], bl[o + 1], bl[o + 2], bl[o + 3]); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // horizon line glow
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(palette[1], 0.18 * (1 - st.dim * 0.8), 1); ctx.fillRect(-400, FLOOR.y0 - 3, W + 800, 6);
    ctx.globalCompositeOperation = 'source-over';
    void BRAND;
  }

  private beams(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const { st, palette } = rt, v = st.prop.heads * Math.min(1, st.prop.truss + 0.2); if (v < 0.02) return;
    const beat = rt.beats, hit = rt.kick, k = v * (1 - 0.75 * st.dim);
    for (let i = 0; i < 4; i++) {
      const ox = 260 + i * 360, oy = -30 + 30 * (1 - st.prop.truss);
      const ph = i * 1.57 + beat * (st.tier === 'peak' ? 0.5 : 0.25);
      const ang = Math.sin(ph) * 0.62 * (i % 2 ? -1 : 1) + (i < 2 ? -0.12 : 0.12) * hit + Math.sin(ph * 1.3 + 1) * 0.08;
      const len = 980, spread = 0.085 + 0.02 * rt.treble;
      const c = palette[i % palette.length];
      const dx = Math.sin(ang), dy = Math.cos(ang);
      const ex = ox + dx * len, ey = oy + dy * len;
      const nx = dy, ny = -dx;
      const g = ctx.createLinearGradient(ox, oy, ex, ey);
      g.addColorStop(0, rgba(c, 0.5 * k * (0.6 + 0.6 * hit), 1)); g.addColorStop(1, rgba(c, 0, 1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - nx * 6, oy - ny * 6); ctx.lineTo(ox + nx * 6, oy + ny * 6);
      ctx.lineTo(ex + nx * len * spread, ey + ny * len * spread); ctx.lineTo(ex - nx * len * spread, ey - ny * len * spread); ctx.closePath(); ctx.fill();
      this.blob(ctx, ex * 0.9 + ox * 0.1, ey * 0.9 + oy * 0.1, 120, c, 0.25 * k);
    }
    ctx.globalAlpha = 1;
  }

  private ball(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const { st, palette } = rt, v = st.prop.ball; if (v < 0.01) return;
    const e = v * v * (3 - 2 * v), R = 74, cx = 800, cy = -300 + 520 * e;
    this.ballRot += rt.dt * (0.55 + 0.9 * st.eFast);
    const a = clamp(v * 1.2) * (1 - 0.5 * st.dim);
    // cable + glow
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(160,160,180,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, -400); ctx.lineTo(cx, cy - R); ctx.stroke();
    this.blob(ctx, cx, cy, 240, [255, 255, 255], 0.18 * a);
    // facets: latitude rings × longitudes, shaded by a moving key light, glints on the ones facing it
    const rows = (rt.detail ?? 0) >= 1 ? 7 : 9, cols = (rt.detail ?? 0) >= 1 ? 12 : 18;
    ctx.save(); ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'source-over';
    let ng = 0; const gl = this.glints;
    ctx.fillStyle = '#17171f'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    for (let r = 0; r < rows; r++) {
      const lat0 = -Math.PI / 2 + (r / rows) * Math.PI, lat1 = -Math.PI / 2 + ((r + 1) / rows) * Math.PI;
      for (let c = 0; c < cols; c++) {
        const lon0 = (c / cols) * Math.PI * 2 + this.ballRot, lon1 = ((c + 1) / cols) * Math.PI * 2 + this.ballRot;
        const lm = (lon0 + lon1) / 2, latm = (lat0 + lat1) / 2;
        const nz = Math.cos(latm) * Math.cos(lm);            // >0 faces the viewer
        if (nz <= 0.02) continue;
        const px = (lat: number, lon: number): [number, number] => [R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat)];
        const p00 = px(lat0, lon0), p01 = px(lat0, lon1), p11 = px(lat1, lon1), p10 = px(lat1, lon0);
        const lit = clamp(0.25 + 0.55 * (Math.cos(latm) * Math.sin(lm) * -0.4 + Math.sin(latm) * -0.55 + nz * 0.6) + 0.3 * Math.sin(r * 3.1 + c * 1.7 + rt.t * 1.4));
        const tint = palette[(r + c) % palette.length];
        const col = mixRGB([150, 152, 170], tint, 0.25);
        ctx.fillStyle = rgba(col, 1, 0.35 + lit * 0.95);
        ctx.beginPath(); ctx.moveTo(p00[0], p00[1]); ctx.lineTo(p01[0], p01[1]); ctx.lineTo(p11[0], p11[1]); ctx.lineTo(p10[0], p10[1]); ctx.closePath(); ctx.fill();
        if (lit > 0.85) { const o = ng * 4; ng++; gl[o] = (p00[0] + p11[0]) / 2; gl[o + 1] = (p00[1] + p11[1]) / 2; gl[o + 2] = 16 + 10 * lit; }
      }
    }
    // rim light
    const rim = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';   // all the glints in one additive pass (they sit in the ball's translated space)
    for (let i = 0; i < ng; i++) this.blob(ctx, gl[i * 4], gl[i * 4 + 1], gl[i * 4 + 2], WHITE_RGB, 0.9 * a);
    ctx.restore();
    // the light dots it throws: rotating rings on the wall + the floor
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const ang = this.ballRot * 1.1 + i * 2.399;
      const ring = 0.25 + ((i * 0.6180339) % 1) * 0.75;
      const wx = cx + Math.cos(ang) * 880 * ring, wy = 300 + Math.sin(ang) * 250 * ring + (i % 3) * 20;
      const c = palette[i % palette.length];
      this.blob(ctx, wx, wy, 20 + 10 * Math.sin(i + rt.t * 3), mixRGB(c, [255, 255, 255], 0.5), 0.55 * a);
      if (i % 2) {
        const fx = cx + Math.cos(ang + 1.3) * 1100 * ring, fy = 760 + Math.sin(ang + 1.3) * 140 * ring + 80;
        this.blob(ctx, fx, fy, 24, mixRGB(c, [255, 255, 255], 0.5), 0.5 * a);
      }
    }
  }

  private speakers(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const v = rt.st.prop.speakers; if (v < 0.01) return;
    const e = v * v * (3 - 2 * v), kick = rt.kick, bass = rt.bass;
    for (const s of [-1, 1]) {
      const x = s < 0 ? lerp(-260, 110, e) : lerp(1860, 1490, e);
      for (let k = 0; k < 3; k++) {
        const y = 868 - (k + 1) * 150;
        ctx.fillStyle = '#0d0c12'; ctx.strokeStyle = '#2a2838'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x - 78, y, 156, 146, 10); ctx.fill(); ctx.stroke();
        const r = 46 * (1 + 0.12 * kick + 0.05 * bass);
        const g = ctx.createRadialGradient(x, y + 78, 2, x, y + 78, r); g.addColorStop(0, '#2b2a38'); g.addColorStop(0.7, '#14131c'); g.addColorStop(1, '#0a0910');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 78, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(BRAND[1], 0.5 + 0.5 * kick, 1); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + 78, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(BRAND[1], 0.9, 1); ctx.fillRect(x - 56, y + 14, 112, 4);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ front layers
  drawFront(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    this.lasers(ctx, rt); this.confetti(ctx, rt);
  }

  private lasers(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const v = rt.st.prop.lasers; if (v < 0.02) return;
    const t = rt.t, N = 14, cols: RGB[] = [[0, 255, 157], [255, 46, 154], [0, 194, 255]];
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const fan = (i / (N - 1) - 0.5) * 2;
      const ang = fan * (0.95 + 0.35 * Math.sin(t * 0.9)) + Math.sin(t * 2.2 + i) * 0.06 + Math.sin(rt.beatPhase * Math.PI * 2) * 0.04;
      const ox = 800 + fan * 40, oy = -20, len = 1500;
      const ex = ox + Math.sin(ang) * len, ey = oy + Math.cos(ang) * len * (0.8 + 0.2 * Math.sin(t * 1.3 + i * 0.4));
      const a = v * (0.5 + 0.5 * ((i + Math.floor(rt.beats * 2)) % 2)) * (1 - 0.6 * rt.st.dim), c = cols[i % 3];
      ctx.strokeStyle = rgba(c, a * 0.18, 1); ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = rgba(mixRGB(c, [255, 255, 255], 0.5), a * 0.9, 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  private confetti(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const dt = rt.dt;
    if (rt.st.confetti > 0) this.spawnConfetti(Math.min(160, rt.st.confetti), rt.palette);
    for (const p of this.conf) {
      if (!p.on) continue;
      p.life += dt; p.vy += 1100 * dt; p.vx *= 1 - dt * 0.9; p.vy = Math.min(p.vy, 190 + 80 * Math.sin(p.life * 3 + p.flip));
      p.x += (p.vx + Math.sin(p.life * 4 + p.flip) * 55) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > 960 || p.life > 9) { p.on = false; continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.life * 7 + p.flip));
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx.restore();
    }
  }

  /** After the dancers: the quiet-time dim with a follow-spot hole, the cone, the drop flash and a vignette. */
  drawDim(ctx: CanvasRenderingContext2D, rt: Set2DRuntime) {
    const { st } = rt;
    if (st.dim > 0.01 || st.spot > 0.01) {
      const sx = rt.spot.x, sy = rt.spot.y, hole = 360 + 40 * st.spot;
      // cone from above
      if (st.spot > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const top = { x: sx * 0.35 + 800 * 0.65, y: -80 };
        const g = ctx.createLinearGradient(top.x, top.y, sx, sy + 40); g.addColorStop(0, `rgba(255,241,220,${0.34 * st.spot})`); g.addColorStop(1, `rgba(255,241,220,${0.05 * st.spot})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(top.x - 26, top.y); ctx.lineTo(top.x + 26, top.y); ctx.lineTo(sx + 190, sy + 70); ctx.lineTo(sx - 190, sy + 70); ctx.closePath(); ctx.fill();
        this.blob(ctx, sx, sy + 60, 260, [255, 241, 220], 0.28 * st.spot); ctx.restore();
      }
      const g = ctx.createRadialGradient(sx, sy, hole * 0.35, sx, sy, hole * (1.6 + 0.4 * (1 - st.spot)));
      const dark = clamp(st.dim * 0.8);   // never so dark that the dancer outside the spot disappears
      g.addColorStop(0, `rgba(2,1,6,${(dark * (1 - st.spot) * 0.6).toFixed(3)})`); g.addColorStop(1, `rgba(2,1,6,${dark.toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(-400, -300, W + 800, H + 600);
    }
    const f = Math.max(st.flash * 0.35, st.prop.strobe * 0.5);
    if (f > 0.01 && !rt.reduced) { ctx.fillStyle = `rgba(255,255,255,${f.toFixed(3)})`; ctx.fillRect(-400, -300, W + 800, H + 600); }
  }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
