// auraOrbs — floating aura orbs drifting across the stream that people TAP to collect.
//
// The orbs are drawn onto the PUBLISHED frame, so every viewer sees the same orbs without any
// replicated game state. The broadcaster's engine is the single referee: a tap (the host's own, or
// a viewer's, sent as a normalized x/y event) is hit-tested here, and the first tap to land wins the orb.
// Collecting pops a ring + sparks + a floating "+N name" into the video, and ranks the collector on a
// small leaderboard that is also drawn into the video.
//
// All positions are normalized (0..1 of the frame) so a canvas resize (orientation, camera flip) never
// strands an orb.

import { EMOTIONS, EMOTION_IDS, type EmotionId } from './emotion';

export interface Orb {
  id: number; emo: EmotionId; value: number;
  x: number; y: number;          // centre, normalized
  vx: number; vy: number;        // normalized units / s
  r: number;                     // radius as a fraction of frame WIDTH
  born: number; phase: number;   // bob phase
}
interface Pop { kind: 'ring' | 'spark' | 'text'; x: number; y: number; vx: number; vy: number; born: number; ttl: number; hue: EmotionId; text?: string }

export interface Collect { who: string; orb: Orb }

export class AuraOrbs {
  orbs: Orb[] = [];
  private pops: Pop[] = [];
  private nextId = 1;
  private nextSpawn = 0;
  private scores = new Map<string, number>();
  onCollect?: (c: Collect) => void;
  /** The most recent collected orb's emotion + when — the engine briefly tints the aura with it. */
  lastCollect: { emo: EmotionId; at: number } | null = null;

  reset() { this.orbs = []; this.pops = []; this.scores.clear(); this.lastCollect = null; this.nextSpawn = 0; }

  leaderboard(n = 3): { who: string; pts: number }[] {
    return [...this.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([who, pts]) => ({ who, pts }));
  }
  totalFor(who: string) { return this.scores.get(who) ?? 0; }

  private spawn(now: number) {
    const fromLeft = Math.random() < 0.5;
    const gold = Math.random() < 0.1;
    this.orbs.push({
      id: this.nextId++, emo: EMOTION_IDS[(Math.random() * EMOTION_IDS.length) | 0], value: gold ? 5 : 1,
      x: fromLeft ? -0.08 : 1.08, y: 0.16 + Math.random() * 0.62,
      vx: (fromLeft ? 1 : -1) * (0.05 + Math.random() * 0.07), vy: (Math.random() - 0.5) * 0.02,
      r: gold ? 0.085 : 0.058 + Math.random() * 0.02, born: now, phase: Math.random() * Math.PI * 2,
    });
  }

  update(dt: number, now: number) {
    if (now >= this.nextSpawn && this.orbs.length < 5) { this.spawn(now); this.nextSpawn = now + 1400 + Math.random() * 2200; }
    for (const o of this.orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt + Math.sin((now - o.born) / 700 + o.phase) * 0.012 * dt * 6;   // gentle bob
    }
    this.orbs = this.orbs.filter(o => o.x > -0.14 && o.x < 1.14 && o.y > -0.1 && o.y < 1.1);
    this.pops = this.pops.filter(p => now - p.born < p.ttl);
    for (const p of this.pops) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'spark') p.vy += 0.4 * dt; }
  }

  /** Hit-test a tap (normalized frame coords). `aspect` = frame W/H so the hit radius is round in pixels. */
  tap(nx: number, ny: number, who: string, aspect: number, now: number): boolean {
    let best: Orb | null = null, bd = Infinity;
    for (const o of this.orbs) {
      const dx = (nx - o.x), dy = (ny - o.y) / aspect;                 // r is relative to width, so scale y by H/W
      const d = Math.hypot(dx, dy), reach = o.r * 1.45;                // generous: these are thumbs on glass
      if (d <= reach && d < bd) { bd = d; best = o; }
    }
    if (!best) return false;
    this.orbs = this.orbs.filter(o => o.id !== best!.id);
    this.scores.set(who, (this.scores.get(who) ?? 0) + best.value);
    this.lastCollect = { emo: best.emo, at: now };
    this.pops.push({ kind: 'ring', x: best.x, y: best.y, vx: 0, vy: 0, born: now, ttl: 650, hue: best.emo });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.15 + Math.random() * 0.25;
      this.pops.push({ kind: 'spark', x: best.x, y: best.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.1, born: now, ttl: 700 + Math.random() * 400, hue: best.emo });
    }
    this.pops.push({ kind: 'text', x: best.x, y: best.y - 0.03, vx: 0, vy: -0.07, born: now, ttl: 1500, hue: best.emo, text: `+${best.value} ${who.split(' ')[0]}` });
    this.onCollect?.({ who, orb: best });
    return true;
  }

  private rgb(emo: EmotionId, which: 'a' | 'b', alpha: number) {
    const c = EMOTIONS[emo][which];
    return `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${alpha})`;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number) {
    ctx.save();
    for (const o of this.orbs) {
      const px = o.x * W, py = o.y * H, r = o.r * W;
      const pulse = 1 + Math.sin((now - o.born) / 380 + o.phase) * 0.06;
      const R = r * pulse;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(px, py, R * 0.4, px, py, R * 2.6);   // outer glow
      halo.addColorStop(0, this.rgb(o.emo, 'a', 0.55)); halo.addColorStop(1, this.rgb(o.emo, 'b', 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, R * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const body = ctx.createRadialGradient(px - R * 0.3, py - R * 0.35, R * 0.1, px, py, R);
      body.addColorStop(0, 'rgba(255,255,255,0.95)'); body.addColorStop(0.35, this.rgb(o.emo, 'a', 0.95)); body.addColorStop(1, this.rgb(o.emo, 'b', 0.9));
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, R * 0.07); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
      ctx.font = `${Math.round(R * 1.05)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(EMOTIONS[o.emo].icon, px, py + R * 0.04);
      if (o.value > 1) {                                       // golden orbs wear a spinning sparkle ring
        ctx.strokeStyle = 'rgba(255,225,120,0.9)'; ctx.lineWidth = Math.max(2, R * 0.08); ctx.setLineDash([R * 0.25, R * 0.2]);
        ctx.lineDashOffset = -now / 40; ctx.beginPath(); ctx.arc(px, py, R * 1.35, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const p of this.pops) {
      const t = (now - p.born) / p.ttl, px = p.x * W, py = p.y * H;
      ctx.globalAlpha = Math.max(0, 1 - t);
      if (p.kind === 'ring') {
        ctx.strokeStyle = this.rgb(p.hue, 'a', 1); ctx.lineWidth = W * 0.012 * (1 - t);
        ctx.beginPath(); ctx.arc(px, py, W * (0.05 + t * 0.14), 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = this.rgb(p.hue, 'a', 1); ctx.beginPath(); ctx.arc(px, py, W * 0.008 * (1 - t * 0.6), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.font = `800 ${Math.round(W * 0.05)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = W * 0.008; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(p.text!, px, py);
        ctx.fillStyle = '#fff'; ctx.fillText(p.text!, px, py);
      }
    }
    ctx.globalAlpha = 1;
    const lb = this.leaderboard(3);
    if (lb.length) {                                           // baked-in leaderboard so viewers see the race
      const fs = Math.round(W * 0.03), x = Math.round(W * 0.04), y0 = Math.round(H * 0.1);
      ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const rows = lb.map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${e.who.split(' ')[0].slice(0, 12)}  ${e.pts}`);
      const w = Math.max(...rows.map(r => ctx.measureText(r).width)) + fs;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - fs * 0.5, y0 - fs * 0.4, w, rows.length * fs * 1.35 + fs * 0.6);
      ctx.fillStyle = '#fff'; rows.forEach((r, i) => ctx.fillText(r, x, y0 + i * fs * 1.35));
    }
    ctx.restore();
  }
}

/**
 * Map a pointer event on an element showing the frame (object-fit: cover or contain) to normalized FRAME coords
 * (null when the tap lands on a letterbox bar or outside the frame).
 * `mirrored` = the element is CSS-flipped (the host's selfie preview), so x must be un-flipped.
 */
export function tapToFrame(e: { clientX: number; clientY: number }, el: HTMLVideoElement, mirrored: boolean, fit: 'cover' | 'contain' = 'cover'): { x: number; y: number } | null {
  const vw = el.videoWidth, vh = el.videoHeight;
  if (!vw || !vh) return null;
  const r = el.getBoundingClientRect();
  let lx = e.clientX - r.left;
  if (mirrored) lx = r.width - lx;
  const ly = e.clientY - r.top;
  const s = fit === 'cover' ? Math.max(r.width / vw, r.height / vh) : Math.min(r.width / vw, r.height / vh);
  const x = (lx - (r.width - vw * s) / 2) / (vw * s);
  const y = (ly - (r.height - vh * s) / 2) / (vh * s);
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}
