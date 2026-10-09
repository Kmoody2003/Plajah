// emoteStage — draws live emotes onto a 2D canvas: bursts, chorus evolutions, kaiju summons, the
// chorus banner and the Crowd Light rim.
//
// One renderer, three hosts:
//   • the broadcast composer (services/liveComposer.ts) draws it into the PUBLISHED frame, after the
//     colour grade, so everything the audience does is part of the stream (and the recording);
//   • the viewer's overlay (components/emotes/EmoteOverlay.tsx) draws the viewer's own taps instantly
//     on a transparent canvas, so tapping feels immediate despite stream latency;
//   • the emote lab simulator.
//
// Positions are normalised (0..1 of the frame) so the same motion reads the same at any resolution;
// sizes are a fraction of the frame's short side.

import type { ChorusEvolution, EmoteDef, EmoteMotion } from './emoteTypes';
import { frameAt, getEmoteAsset, peekEmoteAsset, type EmoteAsset } from './emoteAssets';
import type { CrowdLightState } from './emoteEngine';

interface P {
  def: EmoteDef;
  motion: EmoteMotion | 'giant' | 'march' | 'shell' | 'spark' | 'summon';
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number;
  s: number;            // size, fraction of the short side
  life: number; ttl: number;
  seed: number;
  bounces?: number;
  big?: boolean;        // request the large bake
  onDone?: (p: P) => void;
}

interface Banner { def: EmoteDef; text: string; tier: number; life: number; ttl: number }
interface Ring { x: number; y: number; life: number; ttl: number; color: string; max: number }

const MAX_PARTS = 170;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutBack = (t: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const DEFAULT_EVOLUTION: Record<EmoteMotion, ChorusEvolution> = {
  float: 'storm', rain: 'storm', spin: 'storm', orbit: 'storm', pulse: 'storm',
  pop: 'firework', beam: 'firework', bounce: 'firework',
  shake: 'shockwave', stomp: 'shockwave',
};

export interface EmoteStageOptions {
  reducedMotion?: boolean;
  /** Pixel size to bake normal emotes at (≈ their on-screen size). */
  px?: number;
}

export class EmoteStage {
  private parts: P[] = [];
  private banners: Banner[] = [];
  private rings: Ring[] = [];
  private flash = { a: 0, color: '#ffffff' };
  private light: CrowdLightState | null = null;
  private glowCache = new Map<string, HTMLCanvasElement>();
  private t = 0;
  reducedMotion: boolean;
  px: number;
  /** Turn individual layers off (stream settings). */
  layers = { crowdLight: true, chorus: true, summons: true };

  constructor(o: EmoteStageOptions = {}) {
    this.reducedMotion = o.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.px = o.px ?? 96;
  }

  get busy() { return this.parts.length > 0 || this.banners.length > 0 || this.rings.length > 0 || this.flash.a > 0.01 || (this.light?.intensity ?? 0) > 0.01; }

  // ── input ──────────────────────────────────────────────────────────────────────────────────────
  /** Spawn an emote. `n` taps become up to 6 particles (more taps = slightly bigger, not more clutter). */
  spawn(def: EmoteDef, n = 1, o: { x?: number } = {}) {
    void getEmoteAsset(def, this.px);
    const count = Math.max(1, Math.min(6, Math.round(Math.sqrt(n) * 1.6)));
    const grow = 1 + Math.min(0.35, Math.log2(Math.max(1, n)) * 0.08);
    for (let i = 0; i < count; i++) this.parts.push(this.make(def, def.motion, grow, o.x));
    this.trim();
  }

  /** A chorus tier was crossed. */
  chorus(def: EmoteDef, tier: 1 | 2 | 3, count: number) {
    if (!this.layers.chorus) { this.spawn(def, count); return; }
    void getEmoteAsset(def, this.px);
    // a kaiju chorus may end in a summon: start the big bake at tier 1 so it's ready by tier 3
    if (def.art.kind === 'kaiju' && this.layers.summons) void getEmoteAsset(def, this.px * 4);
    const label = tier === 3 ? `FULL CHORUS ×${count}` : tier === 2 ? `CHORUS ×${count}` : `×${count}`;
    this.banners = this.banners.filter(b => b.def.id !== def.id);
    this.banners.push({ def, text: label, tier, life: 0, ttl: tier === 3 ? 3.4 : 2.4 });
    if (tier === 1) { for (let i = 0; i < 8; i++) this.parts.push(this.make(def, def.motion, 1.1)); this.trim(); return; }
    if (!this.reducedMotion) { this.flash.a = tier === 3 ? 0.26 : 0.16; this.flash.color = def.gel; }
    if (tier === 2) { this.wall(def, 1); this.trim(); return; }
    let evo = def.evolution ?? DEFAULT_EVOLUTION[def.motion];
    if (evo === 'summon' && (def.art.kind !== 'kaiju' || !this.layers.summons)) evo = 'storm';
    switch (evo) {
      case 'storm':
        for (let i = 0; i < 36; i++) this.parts.push({ ...this.make(def, 'rain', rnd(0.7, 1.1)), y: rnd(-0.6, -0.05) });
        this.giant(def);
        break;
      case 'wall': this.wall(def, 1); this.wall(def, -1, 0.42); this.giant(def); break;
      case 'firework':
        for (let i = 0; i < 3; i++) {
          const p = this.make(def, 'shell', 0.9);
          p.x = 0.25 + i * 0.25 + rnd(-0.05, 0.05); p.y = 1.05; p.vy = -rnd(1.05, 1.3); p.ttl = rnd(0.75, 0.95);
          p.onDone = q => { for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const s = this.make(def, 'spark', 0.7); s.x = q.x; s.y = q.y; s.vx = Math.cos(a) * 0.32; s.vy = Math.sin(a) * 0.32; this.parts.push(s); } this.ring(q.x, q.y, def.gel, 0.35); };
          this.parts.push(p);
        }
        break;
      case 'shockwave': {
        const g = this.giant(def); g.motion = 'giant'; g.y = 0.62;
        this.ring(0.5, 0.82, def.gel, 1.1); this.ring(0.5, 0.82, '#ffffff', 0.8);
        break;
      }
      case 'summon': this.summon(def); break;
    }
    this.trim();
  }

  setCrowdLight(s: CrowdLightState | null) { this.light = s; }

  clear() { this.parts = []; this.banners = []; this.rings = []; this.flash.a = 0; }

  // ── builders ───────────────────────────────────────────────────────────────────────────────────
  private make(def: EmoteDef, motion: P['motion'], grow = 1, atX?: number): P {
    const p: P = { def, motion, x: atX ?? rnd(0.12, 0.88), y: 1.06, vx: 0, vy: 0, rot: 0, vr: 0, s: 0.085 * grow * rnd(0.85, 1.15), life: 0, ttl: 3, seed: Math.random() * 1000 };
    switch (motion) {
      case 'float': p.vy = -rnd(0.3, 0.45); p.vx = rnd(-0.04, 0.04); p.ttl = rnd(3, 3.8); p.rot = rnd(-0.25, 0.25); break;
      case 'spin': p.vy = -rnd(0.32, 0.45); p.vr = rnd(3, 5) * (Math.random() < 0.5 ? -1 : 1); p.ttl = 3.4; break;
      case 'beam': p.vy = -rnd(1.0, 1.35); p.ttl = 1.5; p.x = atX ?? rnd(0.15, 0.85); break;
      case 'rain': p.y = -0.08; p.vy = rnd(0.32, 0.5); p.vr = rnd(-0.8, 0.8); p.ttl = 3.6; break;
      case 'bounce': p.y = -0.08; p.vy = rnd(0.1, 0.3); p.vx = rnd(-0.12, 0.12); p.ttl = 2.8; p.bounces = 0; break;
      case 'pop': case 'shake': p.y = rnd(0.28, 0.78); p.ttl = 1.7; p.s *= 1.15; break;
      case 'pulse': p.y = rnd(0.45, 0.82); p.ttl = 2.2; p.s *= 1.1; break;
      case 'stomp': p.y = rnd(0.72, 0.84); p.ttl = 1.7; p.s *= 1.25; this.ring(p.x, p.y + p.s * 0.55, def.gel, 0.22); break;
      case 'orbit': p.ttl = 3.2; p.vr = (Math.random() < 0.5 ? -1 : 1) * rnd(1.6, 2.4); p.rot = rnd(0, Math.PI * 2); break;
      default: break;
    }
    return p;
  }
  private giant(def: EmoteDef): P {
    const p = this.make(def, 'giant'); p.x = 0.5; p.y = 0.5; p.s = 0.42; p.ttl = 2.4; p.big = true;
    void getEmoteAsset(def, this.px * 3);
    this.parts.push(p);
    return p;
  }
  private wall(def: EmoteDef, dir: 1 | -1, y = 0.8) {
    for (let i = 0; i < 9; i++) {
      const p = this.make(def, 'march', 1.15);
      p.x = dir > 0 ? -0.08 - i * 0.11 : 1.08 + i * 0.11; p.y = y; p.vx = 0.55 * dir; p.ttl = 3.8;
      this.parts.push(p);
    }
  }
  private summon(def: EmoteDef) {
    const p = this.make(def, 'summon'); p.big = true;
    const fromLeft = Math.random() < 0.5;
    p.x = fromLeft ? -0.3 : 1.3; p.vx = fromLeft ? 1 : -1; p.y = 0.62; p.s = 0.6; p.ttl = 5.2;
    void getEmoteAsset(def, this.px * 4);
    this.parts.push(p);
    this.ring(0.5, 0.95, def.gel, 0.9);
  }
  private ring(x: number, y: number, color: string, max: number) {
    if (this.reducedMotion) return;
    // small stomp rings are garnish — keep a few; chorus rings (max ≥ 0.3) always go out
    if (max < 0.3 && this.rings.filter(r => r.max < 0.3).length >= 3) return;
    this.rings.push({ x, y, life: 0, ttl: 0.9, color, max });
  }
  private trim() { if (this.parts.length > MAX_PARTS) this.parts.splice(0, this.parts.length - MAX_PARTS); }

  // ── frame ──────────────────────────────────────────────────────────────────────────────────────
  /** Advance by dt seconds and draw into ctx (already sized W×H, identity transform). */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, dt: number) {
    this.t += dt;
    const S = Math.min(W, H);
    if (this.layers.crowdLight) this.drawCrowdLight(ctx, W, H);
    if (this.flash.a > 0.004) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = this.flash.a;
      ctx.fillStyle = this.flash.color; ctx.fillRect(0, 0, W, H); ctx.restore();
      this.flash.a *= Math.exp(-dt * 3.2);
    }
    this.drawRings(ctx, W, H, S, dt);
    const keep: P[] = [];
    const done: P[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.ttl) { if (p.onDone) done.push(p); continue; }
      this.stepP(p, dt);
      if (p.motion !== 'summon' && (p.y < -0.3 || p.y > 1.3 || p.x < -0.4 || p.x > 1.4) && p.motion !== 'march' && p.motion !== 'rain' && p.motion !== 'bounce') continue;
      this.drawP(ctx, p, W, H, S);
      keep.push(p);
    }
    this.parts = keep;
    for (const p of done) p.onDone!(p);
    this.drawBanners(ctx, W, H, S, dt);
  }

  private stepP(p: P, dt: number) {
    switch (p.motion) {
      case 'float': case 'spin': p.vy += 0.03 * dt; break;
      case 'beam': case 'shell': p.vy += 0.45 * dt; break;
      case 'spark': p.vy += 0.25 * dt; p.vx *= Math.exp(-dt * 1.5); p.vy *= Math.exp(-dt * 1.2); break;
      case 'bounce':
        p.vy += 2.3 * dt;
        if (p.y > 0.86 && p.vy > 0) { p.y = 0.86; p.vy *= -0.55; p.bounces = (p.bounces ?? 0) + 1; if (Math.abs(p.vy) < 0.12) p.vy = 0; }
        break;
      case 'summon': {
        // walk in, stop centre-ish, perform, walk out
        const tIn = 1.1, tOut = p.ttl - 1.1;
        const dir = Math.sign(p.vx) || 1;
        const startX = dir > 0 ? -0.3 : 1.3, mid = 0.5, endX = dir > 0 ? 1.3 : -0.3;
        p.x = p.life < tIn ? startX + (mid - startX) * (1 - Math.pow(1 - p.life / tIn, 3))
          : p.life < tOut ? mid : mid + (endX - mid) * Math.pow((p.life - tOut) / 1.1, 2);
        return;
      }
      default: break;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }

  private drawP(ctx: CanvasRenderingContext2D, p: P, W: number, H: number, S: number) {
    const asset = this.assetFor(p);
    const k = p.life / p.ttl;
    let scale = 1, alpha = 1, rot = p.rot, ox = 0, oy = 0, sy = 1;
    const fadeIn = clamp01(p.life / 0.15), fadeOut = clamp01((p.ttl - p.life) / 0.45);
    alpha = Math.min(fadeIn, fadeOut);
    const sway = Math.sin(this.t * 2.3 + p.seed) * 0.018;
    switch (p.motion) {
      case 'float': ox = sway * W; rot = p.rot + Math.sin(this.t * 1.7 + p.seed) * 0.12; break;
      case 'rain': ox = sway * 0.5 * W; break;
      case 'pop': scale = p.life < 0.38 ? easeOutBack(p.life / 0.38) : 1; alpha = fadeOut; break;
      case 'shake': {
        scale = p.life < 0.3 ? easeOutBack(p.life / 0.3) : 1; alpha = fadeOut;
        if (!this.reducedMotion) { const j = 0.006 * (1 - k); ox = Math.sin(this.t * 61 + p.seed) * j * S; oy = Math.cos(this.t * 53 + p.seed) * j * S; rot = Math.sin(this.t * 40 + p.seed) * 0.12 * (1 - k); }
        break;
      }
      case 'pulse': { const hb = Math.pow(Math.max(0, Math.sin(this.t * 7 + p.seed)), 8); scale = (p.life < 0.3 ? easeOutBack(p.life / 0.3) : 1) * (1 + hb * 0.22); break; }
      case 'stomp': {
        const d = 0.22;
        if (p.life < d) { const q = p.life / d; scale = 1.6 - 0.6 * q * q; oy = -(1 - q * q) * 0.25 * H; alpha = q; }
        else { const q = clamp01((p.life - d) / 0.3); sy = 1 - 0.3 * Math.sin(q * Math.PI) ; }
        break;
      }
      case 'orbit': { const a = p.rot + p.life * p.vr; p.x = 0.5 + Math.cos(a) * 0.3 * (S / W); p.y = 0.5 + Math.sin(a) * 0.3 * (S / H); rot = 0; break; }
      case 'beam': rot = 0; break;
      case 'giant': scale = p.life < 0.5 ? easeOutBack(p.life / 0.5) : 1 + Math.sin(p.life * 4) * 0.02; alpha = fadeOut; break;
      case 'march': { const hop = Math.abs(Math.sin(p.life * 9 + p.seed)); oy = -hop * 0.03 * H; rot = Math.sin(p.life * 9 + p.seed) * 0.15; alpha = 1; break; }
      case 'spark': scale = 1 - k * 0.5; break;
      case 'summon': alpha = 1; break;
      default: break;
    }
    if (alpha <= 0.01) return;
    const size = p.s * S * scale;
    const cx = p.x * W + ox, cy = p.y * H + oy;
    // gel glow behind the emote (pre-rendered sprite, additive)
    if (p.motion !== 'summon') {
      const glow = this.glowSprite(p.def.gel);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (p.motion === 'giant' ? 0.55 : 0.32);
      ctx.drawImage(glow, cx - size * 0.95, cy - size * 0.95, size * 1.9, size * 1.9); ctx.restore();
    } else {
      this.drawSpot(ctx, cx, H, size, p.def.gel, clamp01(p.life / 0.6) * fadeOut);
    }
    if (!asset) return;
    const img = frameAt(asset, p.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, sy);
    if (p.motion === 'beam' || p.motion === 'shell') {
      // light trail: ghost copies down the path
      for (let i = 3; i >= 1; i--) { ctx.globalAlpha = alpha * 0.12 * (4 - i); ctx.drawImage(img, -size / 2, -size / 2 + i * size * 0.32, size, size); }
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private assetFor(p: P): EmoteAsset | null {
    const want = p.big ? this.px * (p.motion === 'summon' ? 4 : 3) : this.px;
    return peekEmoteAsset(p.def, want) ?? peekEmoteAsset(p.def, this.px);
  }

  private glowSprite(gel: string): HTMLCanvasElement {
    let c = this.glowCache.get(gel);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, gel + 'cc'); r.addColorStop(0.45, gel + '55'); r.addColorStop(1, gel + '00');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    this.glowCache.set(gel, c);
    return c;
  }

  /** The follow-spot a summoned kaiju performs in: a soft cone from above + a pool on the floor. */
  private drawSpot(ctx: CanvasRenderingContext2D, x: number, H: number, size: number, gel: string, a: number) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a * 0.5;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,244,224,0.0)'); g.addColorStop(0.5, 'rgba(255,244,224,0.35)'); g.addColorStop(1, 'rgba(255,244,224,0.6)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - size * 0.1, 0); ctx.lineTo(x + size * 0.1, 0); ctx.lineTo(x + size * 0.62, H); ctx.lineTo(x - size * 0.62, H); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = a * 0.7;
    const pool = ctx.createRadialGradient(x, H * 0.97, 0, x, H * 0.97, size * 0.7);
    pool.addColorStop(0, gel + 'aa'); pool.addColorStop(1, gel + '00');
    ctx.fillStyle = pool; ctx.fillRect(x - size, H * 0.8, size * 2, H * 0.2);
    ctx.restore();
  }

  private drawRings(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, dt: number) {
    if (!this.rings.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    this.rings = this.rings.filter(r => {
      r.life += dt;
      if (r.life >= r.ttl) return false;
      const k = r.life / r.ttl, rad = (0.05 + r.max * (1 - Math.pow(1 - k, 3))) * S;
      ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(2, S * 0.012 * (1 - k));
      ctx.beginPath(); ctx.ellipse(r.x * W, r.y * H, rad, rad * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      return true;
    });
    ctx.restore();
  }

  /** Crowd Light: the audience's gels as a rim light around the frame + a footlight glow. */
  private drawCrowdLight(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const L = this.light;
    if (!L || L.intensity < 0.01) return;
    const a = Math.min(0.5, L.intensity * 0.5);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, L.hex + '00'); g.addColorStop(0.7, L.hex + '55'); g.addColorStop(1, L.hex + 'ee');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const f = ctx.createLinearGradient(0, H, 0, H * 0.72);
    f.addColorStop(0, L.hex + 'cc'); f.addColorStop(1, L.hex + '00');
    ctx.globalAlpha = a * 0.8; ctx.fillStyle = f; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.restore();
  }

  private drawBanners(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, dt: number) {
    if (!this.banners.length) return;
    let y = H * 0.09;
    this.banners = this.banners.filter(b => {
      b.life += dt;
      if (b.life >= b.ttl) return false;
      const inK = easeOutBack(clamp01(b.life / 0.35)), out = clamp01((b.ttl - b.life) / 0.35);
      const fs = Math.round(S * (b.tier === 3 ? 0.056 : 0.045));
      ctx.save();
      ctx.font = `900 ${fs}px 'Arial Black','Segoe UI Black',system-ui,sans-serif`;
      const tw = ctx.measureText(b.text).width, icon = fs * 1.5, pad = fs * 0.55;
      const bw = icon + pad * 3 + tw, bh = fs * 1.9;
      ctx.globalAlpha = out;
      ctx.translate(W / 2, y + bh / 2); ctx.scale(inK, inK);
      // pill: dark glass + gel rim
      ctx.fillStyle = 'rgba(14,8,22,0.72)';
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeStyle = b.def.gel; ctx.stroke();
      const asset = peekEmoteAsset(b.def, this.px);
      if (asset) ctx.drawImage(frameAt(asset, b.life), -bw / 2 + pad, -icon / 2, icon, icon);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.shadowColor = b.def.gel; ctx.shadowBlur = fs * 0.6;
      ctx.fillText(b.text, -bw / 2 + pad * 2 + icon, fs * 0.04);
      ctx.restore();
      y += bh * 1.15;
      return true;
    });
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
