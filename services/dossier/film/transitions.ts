/**
 * The Council's transition kit. Breath Cut is the default (about 65% of cuts); everything else has to earn its place.
 * Every transition is a pure function of the local time since the incoming shot began; the outgoing shot is drawn
 * frozen on its last frame, so shots never overlap on the timeline.
 *
 * Reduced motion: each transition has an authored cut-list form (a hold and a 150 ms fade, never an animation).
 */
import type { Box, CouncilTheme, TransitionName } from './councilTypes';
import { DH, DW } from './councilTypes';
import { clamp, ease, lerp, noise1, span } from './motion';

const F = 1 / 30;

export interface KitEntry {
  /** Seconds the transition occupies at the head of the incoming shot. */
  dur: number;
  /** Seconds into the transition when the incoming shot replaces the outgoing one. */
  swap: number;
  /** Foley the transition owns, on its impact frame (placed on the hold frame, not the first frame of the move). */
  foley?: { at: number; kind: 'tap' | 'thunk' | 'pluck' | 'scratch' };
}

export const KIT: Record<TransitionName, KitEntry> = {
  breath: { dur: 0, swap: 0 },
  // 6 frames in, 4 hold (the one-frame hold on impact is inside), 6 out; plate swaps under it on frame 7.
  stampSlam: { dur: 16 * F, swap: 7 * F, foley: { at: 6 * F, kind: 'tap' } },
  // Four hairlines close over 10 frames, hold 6, open over 10; old plate drops out on frame 5.
  formeLock: { dur: 26 * F, swap: 5 * F, foley: { at: 10 * F, kind: 'thunk' } },
  // A single plucked string at the start of the line only.
  roadLine: { dur: 24 * F, swap: 12 * F, foley: { at: 0, kind: 'pluck' } },
  // Pencil scratch while the line is drawn, otherwise silence.
  madderRule: { dur: 24 * F, swap: 9 * F, foley: { at: 1 * F, kind: 'scratch' } },
  // Bare ground 10 frames, the stamp is set first (identical thunk every time), the painting fades up over 12.
  reconGate: { dur: 22 * F, swap: 0, foley: { at: 3 * F, kind: 'thunk' } },
  silenceHold: { dur: 0, swap: 0 },
  groundDip: { dur: 24 * F, swap: 12 * F },
};

/** Frames of the Reconstruction Gate, exported so the plate painter and the compiler agree. */
export const GATE = { stampAt: 3 * F, fadeFrom: 10 * F, fadeTo: 22 * F };

export interface TrCtx {
  ctx: CanvasRenderingContext2D;
  theme: CouncilTheme;
  reduced: boolean;
  /** Seconds since the incoming shot began. */
  local: number;
  drawOut(): void;
  drawIn(): void;
  /** The incoming plate's rectangle (Forme Lock closes on it). */
  rect?: Box;
  /** Text set in the Stamp Slam bar. */
  label?: string;
  seed: number;
  /** Madder Rule: x where the line is drawn (the margin hairline's own x), default the frame's centre. */
  lineX?: number;
  /** Road Line: the ghost script behind the seam (the stele's characters, drifting slower than the images). */
  ghost?: { text: string; font: string; size: number };
}

/** Draws the transition frame. The caller has already cleared to the ground colour. */
export function drawTransition(name: TransitionName, c: TrCtx): void {
  const { ctx, local, reduced } = c;
  const k = KIT[name];
  if (name === 'breath' || name === 'silenceHold' || local >= k.dur) { c.drawIn(); return; }

  if (reduced) {
    // Authored reduced-motion cut list: hold the outgoing frame, then a 150 ms fade to the incoming one.
    // The Reconstruction Gate keeps its label-first order: the shot paints stamp, then picture.
    if (name === 'reconGate') { c.drawIn(); return; }
    const a = span(local, 0, 0.15);
    c.drawOut();
    ctx.save(); ctx.globalAlpha = a; c.drawIn(); ctx.restore();
    return;
  }

  switch (name) {
    case 'reconGate': c.drawIn(); return;   // the shot owns the gate: bare ground, stamp, then the fade-up
    case 'stampSlam': return stampSlam(c);
    case 'formeLock': return formeLock(c);
    case 'roadLine': return roadLine(c);
    case 'madderRule': return madderRule(c);
    case 'groundDip': return groundDip(c);
  }
}

function stampSlam(c: TrCtx) {
  const { ctx, theme, local } = c;
  const f = local / F;
  if (f < 7) c.drawOut(); else c.drawIn();
  // The bar: 160 px tall, slams across in 6 frames, holds 4, strikes out in 6.
  const left = f < 6 ? lerp(-DW, 0, ease('in', f / 6)) : f < 10 ? 0 : lerp(0, DW, ease('in', (f - 10) / 6));
  const y = DH / 2 - 80;
  ctx.save();
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, y, DW, 160);
  if (c.label) {
    ctx.fillStyle = theme.bg;
    ctx.font = `400 128px ${theme.display}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(theme.upper ? c.label.toUpperCase() : c.label, left + DW / 2, y + 128);
  }
  ctx.restore();
}

function formeLock(c: TrCtx) {
  const { ctx, theme, local } = c;
  const f = local / F;
  if (f < 5) c.drawOut(); else c.drawIn();
  const r: Box = c.rect ?? { x: 96, y: 56, w: 1120, h: 652 };
  // 0..10 close with a one-frame overshoot, 10..16 hold, 16..26 open.
  const p = f < 10 ? ease('out', f / 10) : f < 11 ? 1.02 : f < 16 ? 1 : 1 - ease('in', (f - 16) / 10);
  ctx.save();
  ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
  const line = (x0: number, y0: number, x1: number, y1: number) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  line(lerp(0, r.x, p), 0, lerp(0, r.x, p), DH);
  line(lerp(DW, r.x + r.w, p), 0, lerp(DW, r.x + r.w, p), DH);
  line(0, lerp(0, r.y, p), DW, lerp(0, r.y, p));
  line(0, lerp(DH, r.y + r.h, p), DW, lerp(DH, r.y + r.h, p));
  ctx.restore();
}

function roadLine(c: TrCtx) {
  const { ctx, theme, local } = c;
  const p = ease('inOut', span(local, 0, 24 * F));
  const seam = lerp(DW, 0, p);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, seam, DH); ctx.clip();
  ctx.translate(seam - DW, 0); c.drawOut();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(seam, 0, DW - seam, DH); ctx.clip();
  ctx.translate(seam, 0); c.drawIn();
  ctx.restore();
  if (c.ghost) {   // the stele's characters drift at 0.3 of the seam's speed, in the empty third only, under the line
    ctx.save(); ctx.beginPath(); ctx.rect(1344, 0, DW - 1344, DH); ctx.clip();
    ctx.globalAlpha = 0.10; ctx.fillStyle = theme.ink; ctx.font = `400 ${Math.round(c.ghost.size * 0.8)}px ${c.ghost.font}`;
    const drift = (DW - seam) * 0.3 - 120;
    Array.from(c.ghost.text).forEach((ch, i) => ctx.fillText(ch, 1420 + drift, 380 + i * 330));
    ctx.restore();
  }
  ctx.save(); ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(seam, 0); ctx.lineTo(seam, DH); ctx.stroke(); ctx.restore();
}

function madderRule(c: TrCtx) {
  const { ctx, theme, local } = c;
  const f = local / F;
  // The image on the left of the line changes first; the right side follows 6 frames later.
  const x = c.lineX ?? DW / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, DH); ctx.clip();
  f < 9 ? c.drawOut() : c.drawIn(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(x, 0, DW - x, DH); ctx.clip();
  f < 15 ? c.drawOut() : c.drawIn(); ctx.restore();
  // A 4 px line drawn top to bottom in 18 frames with a hand's irregularity.
  const head = ease('inOut', clamp(f / 18)) * DH;
  ctx.save(); ctx.strokeStyle = theme.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = 0; y <= head; y += 8) {
    const px = x + (noise1(y * 0.02 + c.seed, 3) - 0.5) * 10;
    y === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
  }
  ctx.stroke(); ctx.restore();
}

function groundDip(c: TrCtx) {
  const { ctx, theme, local } = c;
  const f = local / F;
  if (f < 12) c.drawOut(); else c.drawIn();
  // To the exhibit's own ground colour and back; never black, never white.
  const a = f < 12 ? f / 12 : 1 - (f - 12) / 12;
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, DW, DH); ctx.restore();
}
