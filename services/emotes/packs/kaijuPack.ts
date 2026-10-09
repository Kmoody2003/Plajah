// kaijuPack — Lorik & Lumi as animated emotes.
//
// Every emote is a pose clip for the REAL canvas puppet (kaijuEmoteBaker draws it with KaijuCanvasFigure),
// so the likeness can't drift: Lorik (music — purple/magenta, mic + LORIK book) and Lumi (vision/light —
// navy → orange, glowing eyes, camera) look exactly as they do on stage. Faces reuse FACE_2D, the same
// expression partials the stage's emotion director uses. Only the glyphs around them (hearts, zzz, notes,
// steam, speed lines, "GG") are drawn here, in 0..128 emote space.
//
// Writing a clip: a pose is a function of u = t / duration (0..1, looping). Everything must be periodic in u
// — keyframes start and end on the same value (kf), oscillators use whole cycles (osc(u, n) with integer n).
// Clips are short (0.8–1.6 s) and staged like the core faces: anticipation → hit (with overshoot) → settle,
// with the expressive beat landing around 35–40% in, which is where the picker's poster frame is taken.

import type { ChorusEvolution, EmoteDef, EmoteMotion, KaijuActor, KaijuArt } from '../emoteTypes';
import { type Pose, REST, pose, mirrorPose } from '../../../components/kaiju/kaijuPose';
import { FACE_2D } from '../../../components/kaiju/stage2d/kaijuExpression2D';
import { INK, shade } from '../emoteRig';

/** Character-space square each framing crops (centre + edge). Shared with the baker so overlays line up.
 *  bust: x −128..128, y −310..−54 — the frill spans ≈ ±120 and the crest reaches ≈ −268 (more on a roar's head
 *        zoom), so this is the tightest square that never clips them; eyes (≈ −165) sit a touch above centre.
 *  full: x −160..160, y −300..20 — the whole body with jump headroom (scale the actor ≤ 0.9 for big jumps). */
export const KAIJU_FRAMES = {
  bust: { cx: 0, cy: -182, side: 256 },
  full: { cx: 0, cy: -140, side: 320 },
} as const;

const LORIK = '#B04BFF', LORIK_HOT = '#D1287F', LUMI = '#FF8A2A';
const NECK_Y = -112, HEAD_SCALE = 1.1;   // KaijuFigure geometry (duplicated: importing it would pull React into the registry)

// ── clip math ────────────────────────────────────────────────────────────────────────────────────────
type P = Partial<Pose>;
type Expr = keyof typeof FACE_2D;
const TAU = Math.PI * 2;
const wrap = (u: number) => u - Math.floor(u);
/** Periodic sine: whole cycles per loop. */
const osc = (u: number, n = 1, off = 0) => Math.sin(TAU * (n * u + off));
/** Eased keyframes over u ∈ 0..1 — first and last values must match for a seamless loop. */
function kf(u: number, k: readonly (readonly [number, number])[]): number {
  u = wrap(u);
  for (let i = 0; i < k.length - 1; i++) {
    const [a, va] = k[i], [b, vb] = k[i + 1];
    if (u <= b) { const s = b > a ? (u - a) / (b - a) : 1; return va + (vb - va) * s * s * (3 - 2 * s); }
  }
  return k[k.length - 1][1];
}
/** 0 outside a..b, a sine hump inside. */
const hump = (u: number, a: number, b: number) => (u <= a || u >= b ? 0 : Math.sin(Math.PI * (u - a) / (b - a)));
/** A FACE_2D expression at strength w (lerped from REST, so w = 0 is the sheet's default face). */
function face(e: Expr, w = 1): P {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(FACE_2D[e])) { const r = REST[k as keyof Pose]; o[k] = r + ((v as number) - r) * w; }
  return o as P;
}
/** Crossfade two partial faces/poses (missing channels read as REST). */
function mix(a: P, b: P, w: number): P {
  const o: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Pose>) { const va = a[k] ?? REST[k], vb = b[k] ?? REST[k]; o[k] = va + (vb - va) * w; }
  return o as P;
}
/** Canonical (stage-left, Lorik-facing-right) pose → the partner on the right. */
const mir = (p: P): P => mirrorPose(pose(p));

// ── emote-space helpers for overlays ─────────────────────────────────────────────────────────────────
type Frame = keyof typeof KAIJU_FRAMES;
/** Character → emote (0..128) for an actor at offset ax, ay / scale s. */
function toE(fr: Frame, x: number, y: number, ax = 0, s = 1, ay = 0): [number, number] {
  const b = KAIJU_FRAMES[fr], k = 128 / b.side;
  return [64 + (ax + x * s - b.cx) * k, 64 + (ay + y * s - b.cy) * k];
}
/** A point on the face (head-art space, e.g. eyes ±26,−160 · mouth 0,−137 · crown 0,−245) under a pose. */
function headPt(p: P, hx: number, hy: number): [number, number] {
  const hs = (p.headScale ?? 1) * HEAD_SCALE;
  return [(p.x ?? 0) + (p.headX ?? 0) + hx * hs, (p.y ?? 0) + (p.headY ?? 0) + NECK_Y + (hy - NECK_Y) * hs];
}
// Path2D is built lazily: this module is imported by the registry, which also loads where there's no canvas.
let paths: { heart: Path2D; drop: Path2D } | null = null;
const P2 = () => (paths ??= {
  heart: new Path2D('M 0 7 C -14 -4 -9 -14 0 -7 C 9 -14 14 -4 0 7 Z'),
  drop: new Path2D('M 0 -7 C 5 0 6 3 6 5 C 6 9 3 11 0 11 C -3 11 -6 9 -6 5 C -6 3 -5 0 0 -7 Z'),
});
const FONT = "'Arial Black','Segoe UI Black','Helvetica Neue',Impact,sans-serif";

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1, col = '#FF2E63') {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.translate(x, y); g.scale(s / 24, s / 24);
  g.lineWidth = 3.4; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(P2().heart);
  const gr = g.createLinearGradient(-8, -10, 8, 8); gr.addColorStop(0, shade(col, 22)); gr.addColorStop(1, shade(col, -14));
  g.fillStyle = gr; g.fill(P2().heart);
  g.fillStyle = 'rgba(255,244,224,0.85)'; g.beginPath(); g.ellipse(-4.5, -5, 2.6, 1.7, -0.6, 0, TAU); g.fill();
  g.restore();
}
function drop(g: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1, col = '#8FD3FF', rot = 0) {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.translate(x, y); g.rotate(rot); g.scale(s / 18, s / 18);
  g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke(P2().drop); g.fillStyle = col; g.fill(P2().drop);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-2, 3, 1.6, 0, TAU); g.fill();
  g.restore();
}
/** Bold display type (outline + lit vertical gradient), the core pack's litText in canvas form. */
function word(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, a = 1, rot = 0) {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.translate(x, y); g.rotate(rot);
  g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.24); g.strokeStyle = INK; g.strokeText(s, 0, 0);
  const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, shade(col, 26)); gr.addColorStop(1, shade(col, -12));
  g.fillStyle = gr; g.fillText(s, 0, 0);
  g.restore();
}
function spark(g: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1, col = '#FFF4E0') {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.translate(x, y); g.fillStyle = col;
  g.beginPath(); g.moveTo(0, -s);
  for (const [px, py] of [[s, 0], [0, s], [-s, 0], [0, -s]] as const) g.quadraticCurveTo(px === 0 ? 0 : px * 0.16, py === 0 ? 0 : py * 0.16, px, py);
  g.fill(); g.restore();
}
function note(g: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1, col = '#FF6FD0', double = false) {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.translate(x, y); g.scale(s / 20, s / 20);
  const shape = () => {
    g.beginPath(); g.ellipse(-4, 6, 5, 3.6, -0.45, 0, TAU);
    if (double) g.ellipse(9, 3, 5, 3.6, -0.45, 0, TAU);
    g.rect(0, -12, 2.4, 18); if (double) { g.rect(13, -15, 2.4, 18); g.moveTo(0, -12); g.lineTo(15.4, -15); g.lineTo(15.4, -10); g.lineTo(0, -7); }
    else { g.moveTo(2.4, -12); g.quadraticCurveTo(10, -9, 9, -1); g.quadraticCurveTo(7, -6, 2.4, -6); }
  };
  shape(); g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); g.fillStyle = col; g.fill();
  g.restore();
}
/** Radial burst lines (impacts, flashes, "!" jolts). */
function burst(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, a: number, col = '#FFF4E0', w = 2.6, rot = 0) {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < n; i++) { const t = rot + (i / n) * TAU; g.moveTo(x + Math.cos(t) * r0, y + Math.sin(t) * r0); g.lineTo(x + Math.cos(t) * r1, y + Math.sin(t) * r1); }
  g.stroke(); g.restore();
}
function puff(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  if (a <= 0.01) return;
  g.save(); g.globalAlpha = Math.min(1, a);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = 'rgba(42,20,48,0.55)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x + r * 0.8, y + r * 0.3, r * 0.7, 0, TAU); g.arc(x - r * 0.7, y + r * 0.35, r * 0.6, 0, TAU);
  g.stroke(); g.fill(); g.restore();
}

// ── builders ─────────────────────────────────────────────────────────────────────────────────────────
const actor = (who: KaijuActor['who'], D: number, fn: (u: number) => P, o: Omit<KaijuActor, 'who' | 'pose'> = {}): KaijuActor =>
  ({ who, pose: t => fn(t / D), ...o });
function art(D: number, frame: Frame, actors: KaijuActor[], overlay?: (g: CanvasRenderingContext2D, u: number) => void): KaijuArt {
  return { kind: 'kaiju', duration: D, frame, actors, ...(overlay ? { overlay: (g, t) => overlay(g, wrap(t / D)) } : {}) };
}
function def(code: string, name: string, gel: string, motion: EmoteMotion, tags: string[], a: KaijuArt, evolution?: ChorusEvolution): EmoteDef {
  return { id: `kaiju.${code}`, code, name, pack: 'kaiju', tags: ['kaiju', ...tags], gel, motion, art: a, ...(evolution ? { evolution } : {}) };
}

// ── the clips ────────────────────────────────────────────────────────────────────────────────────────

// :roar: — Lorik rears back, then lunges into a frill-flared ROAR with claws up and a shaking head.
const roarP = (u: number): P => {
  const pre = kf(u, [[0, 0], [0.22, 1], [0.3, 0], [1, 0]]);
  const roar = kf(u, [[0, 0], [0.22, 0], [0.3, 1.12], [0.38, 1], [0.72, 1], [0.88, 0], [1, 0]]);
  const sh = roar * osc(u, 21);
  return {
    ...mix(face('grumpy'), face('shout'), roar), mouth: 0.1 * pre + roar, mouthW: 0.6 + 0.4 * roar, smile: -0.8,
    brow: 0.5 * pre + 1.15 * roar, browY: 0.3 * pre + 0.5 * roar, eyeScale: 1 + 0.12 * roar, eyeOpen: 1 - 0.35 * pre,
    headY: -9 * pre + 5 * roar, headRot: -5 * pre + 2.5 * sh, headX: 3 * sh, headScale: 1 - 0.03 * pre + 0.07 * roar,
    rot: -2.5 * pre + 1.5 * roar, mane: 0.2 * pre + roar, armL: 15 + 25 * pre + 105 * roar, armR: 15 + 25 * pre + 105 * roar,
    sy: 1 - 0.03 * pre + 0.03 * roar, y: 3 * pre, blush: 0.1,
  };
};
const roarO = (g: CanvasRenderingContext2D, u: number) => {
  const roar = kf(u, [[0, 0], [0.24, 0], [0.32, 1], [0.72, 1], [0.86, 0], [1, 0]]);
  if (roar < 0.02) return;
  const [mx, my] = toE('bust', ...headPt(roarP(u), 0, -137));
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    // shockwave rings rolling out past the frill, only on the flanks so they never cross the face
    const f = wrap(u * 5 + i / 3), r = 46 + f * 26, a = roar * (1 - f);
    for (const side of [-1, 1]) {
      g.globalAlpha = a; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.arc(mx, my - 14, r, side < 0 ? Math.PI - 0.5 : -0.5, side < 0 ? Math.PI + 0.5 : 0.5); g.stroke();
      g.strokeStyle = '#FFE9A8'; g.lineWidth = 2.6; g.stroke();
    }
  }
  g.restore();
};

// :rawr: — Lumi's tiny "scary" rawr: claws up, head tilt, pleased with herself.
const rawrP = (u: number): P => {
  const up = kf(u, [[0, 0], [0.2, 1.1], [0.28, 1], [0.7, 1], [0.86, 0], [1, 0]]), w = up * osc(u, 4);
  return {
    ...mix(face('calm'), face('excited'), up), mouth: 0.15 + 0.5 * up, smile: 0.6 * up, brow: 0.4 * up, browY: 0.2,
    armL: 15 + 140 * up + 8 * w, armR: 15 + 140 * up - 8 * w, headRot: 9 * up + 2 * w, headY: -4 * up, rot: 2 * up, mane: 0.5 * up, blush: 0.9,
  };
};
const rawrO = (g: CanvasRenderingContext2D, u: number) => {
  const up = kf(u, [[0, 0], [0.24, 0], [0.32, 1.15], [0.38, 1], [0.7, 1], [0.84, 0], [1, 0]]);
  word(g, 'rawr!', 100, 24, 17 * up, LUMI, Math.min(1, up * 1.4), 0.22);
};

// :kaijuhype: — Lorik squats, launches with arms up, lands in a squash. One big jump per loop.
const hypeP = (u: number): P => {
  const crouch = kf(u, [[0, 0.3], [0.16, 1], [0.24, -0.2], [0.62, 0], [0.7, 1], [0.84, -0.1], [1, 0.3]]);
  const air = hump(u, 0.2, 0.66), up = kf(u, [[0, 0.2], [0.16, 0], [0.22, 1], [0.62, 1], [0.74, 0.3], [1, 0.2]]);
  return {
    ...mix(face('joy'), face('excited'), up), y: -58 * Math.pow(air, 0.8) + 8 * Math.max(0, crouch),
    sy: 1 - 0.12 * Math.max(0, crouch) + 0.08 * air, sx: 1 + 0.1 * Math.max(0, crouch) - 0.04 * air,
    armL: 25 + 145 * up + 10 * osc(u, 6) * air, armR: 25 + 145 * up - 10 * osc(u, 6) * air,
    legL: 14 * air, legR: 14 * air, liftL: -10 * air, liftR: -10 * air, mane: 0.2 + 0.8 * air, tail: 22 * air,
    headY: 5 * Math.max(0, crouch) - 3 * air, mouth: 0.25 + 0.6 * air, blush: 0.9, glow: 0.35 * air,
  };
};
const hypeO = (g: CanvasRenderingContext2D, u: number) => {
  const air = hump(u, 0.2, 0.66);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4, f = wrap(u * 2 + i * 0.17), r = 30 + f * 26;
    spark(g, 64 + Math.cos(a) * r, 46 + Math.sin(a) * r * 0.8, 5 * (1 - f), air * (1 - f), i % 2 ? '#FFE680' : '#FF8BF0');
  }
  // dust puffs on the landing
  const land = hump(u, 0.64, 0.86);
  puff(g, 40 - land * 8, 116, 4 + land * 3, land * 0.8); puff(g, 88 + land * 8, 116, 4 + land * 3, land * 0.8);
};

// :kaijulove: — Lumi in love: heart eyes, swaying, hearts floating up.
const loveP = (u: number): P => ({
  ...face('love'), headRot: 7 * osc(u), headX: 3 * osc(u), headY: -2 * Math.abs(osc(u, 2)), rot: 1.5 * osc(u),
  headScale: 1 + 0.03 * Math.abs(osc(u, 2)), armL: -32, armR: -32, mane: 0.25 + 0.15 * osc(u, 2), blush: 1, glow: 0.2,
});
const loveO = (g: CanvasRenderingContext2D, u: number) => {
  for (let i = 0; i < 3; i++) {
    const f = wrap(u + i / 3), x = [22, 104, 92][i] + 5 * osc(f, 1, i * 0.3), y = 96 - f * 82;
    heart(g, x, y, 13 + 6 * Math.sin(Math.PI * f), Math.min(1, Math.sin(Math.PI * f) * 1.8), i === 1 ? '#FF4F8B' : '#FF2E63');
  }
};

// :kaijulol: — Lorik cracking up: squeezed-shut laugh, head thrown back on every "HA", bouncing.
const lolP = (u: number): P => {
  const ha = Math.pow(Math.abs(Math.sin(Math.PI * 3 * u)), 0.6);   // three HAs per loop
  return {
    ...face('laugh'), mouth: 0.5 + 0.5 * ha, headY: -6 * ha, headRot: -6 + 5 * osc(u, 3, 0.25) , rot: -3 * ha, y: -4 * ha,
    sy: 1 + 0.03 * ha, headScale: 1 + 0.03 * ha, mane: 0.3 * ha, armL: -30 - 8 * ha, armR: -30 - 8 * ha, tear: 0.6,
  };
};
const lolO = (g: CanvasRenderingContext2D, u: number) => {
  const k = Math.floor(wrap(u) * 3), f = wrap(u * 3), a = Math.min(1, Math.sin(Math.PI * f) * 2);
  const pos: [number, number, number][] = [[20, 30, -0.3], [106, 26, 0.28], [24, 70, -0.15]];
  const [x, y, r] = pos[k];
  word(g, 'HA', x, y - f * 6, 15 + 4 * f, '#FFD23A', a, r);
};

// :kaijucry: — Lumi sobbing, two comedic waterfalls of tears arcing out of her eyes.
const cryP = (u: number): P => {
  const sob = Math.pow(Math.abs(Math.sin(Math.PI * 2 * u)), 2);
  return {
    ...face('sad'), tear: 0, eyeOpen: 0.55, closed: 0.35, mouth: 0.35 + 0.25 * sob, mouthW: 0.7, smile: -1,
    headY: 3 * sob, headRot: 3 * osc(u, 2, 0.1), sy: 1 - 0.025 * sob, y: 2 * sob, armL: -20, armR: -20, blush: 0.5, mane: -0.1,
  };
};
const cryO = (g: CanvasRenderingContext2D, u: number) => {
  const p = cryP(u);
  g.save(); g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const [ex, ey] = toE('bust', ...headPt(p, side * 27, -150));
    // the stream: a parabola out of the eye, drawn as dashes marching outward
    const path = new Path2D();
    path.moveTo(ex, ey);
    path.quadraticCurveTo(ex + side * 26, ey - 10, ex + side * 34, 128);
    g.lineWidth = 9; g.strokeStyle = INK; g.globalAlpha = 0.9; g.stroke(path);
    g.lineWidth = 6; g.strokeStyle = '#7CCBFF'; g.stroke(path);
    g.setLineDash([5, 7]); g.lineDashOffset = -wrap(u * 3) * 12; g.lineWidth = 2.6; g.strokeStyle = '#E6F6FF'; g.stroke(path); g.setLineDash([]);
    // splash where it lands
    for (let i = 0; i < 3; i++) { const f = wrap(u * 3 + i / 3); drop(g, ex + side * (34 + f * 12 * (i - 1)), 122 - Math.sin(Math.PI * f) * 10, 5, 1 - f, '#9FD8FF'); }
  }
  g.restore();
};

// :kaijusleep: — Lorik dozing: drooped head, slow breath, snore bubble mouth, Zzz drifting up.
const sleepP = (u: number): P => ({
  ...face('sleep'), headRot: 10 + 3 * osc(u), headY: 4 + 3 * osc(u), headX: 2 * osc(u), rot: 1.5, sy: 1 + 0.02 * osc(u, 1, 0.25),
  mouth: 0.08 + 0.12 * (0.5 + 0.5 * osc(u, 1, 0.25)), mouthW: 0.2, mane: -0.1, armL: 4, armR: 4, blush: 0.55,
});
const sleepO = (g: CanvasRenderingContext2D, u: number) => {
  for (let i = 0; i < 3; i++) {
    const f = wrap(u + i / 3), a = Math.min(1, Math.sin(Math.PI * f) * 1.8);
    word(g, 'Z', 94 + f * 16 + 3 * osc(f, 1), 52 - f * 44, 9 + f * 12, '#B8A8FF', a, 0.25 - f * 0.4);
  }
};

// :kaijurage: — Lumi fuming: furious brows, trembling, steam blasting from both sides of her head.
const rageP = (u: number): P => {
  const puffK = Math.pow(Math.abs(Math.sin(Math.PI * 2 * u)), 3), sh = osc(u, 16);
  return {
    ...face('angry'), mouth: 0.3 + 0.35 * puffK, mouthW: 1, brow: 1.25, browY: 0.8, headX: 2.4 * sh, headRot: 1.5 * sh,
    headScale: 1 + 0.04 * puffK, sy: 1 + 0.03 * puffK, sx: 1 + 0.02 * puffK, armL: 22, armR: 22, mane: 0.5 + 0.5 * puffK, blush: 0.1, glow: 0.2 * puffK,
  };
};
const rageO = (g: CanvasRenderingContext2D, u: number) => {
  const p = rageP(u);
  for (const side of [-1, 1]) {
    const [x, y] = toE('bust', ...headPt(p, side * 70, -200));
    for (let i = 0; i < 3; i++) {
      const f = wrap(u * 2 + i / 3);
      puff(g, x + side * f * 20, y - f * 26, 4 + f * 6, (1 - f) * 0.95);
    }
  }
  // anger vein in the corner
  const v = 0.85 + 0.15 * osc(u, 4);
  g.save(); g.translate(98, 30); g.scale(v, v); g.strokeStyle = '#FF2E3A'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath();
  for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { g.moveTo(Math.cos(r + 0.4) * 3, Math.sin(r + 0.4) * 3); g.quadraticCurveTo(Math.cos(r) * 4, Math.sin(r) * 4, Math.cos(r - 0.4) * 9, Math.sin(r - 0.4) * 9); }
  g.stroke(); g.restore();
};

// :kaijushock: — Lumi jolts back: eyes huge, hands up, an "!" pops — then slowly recovers.
const shockP = (u: number): P => {
  const j = kf(u, [[0, 0], [0.14, 0], [0.2, 1.15], [0.27, 1], [0.66, 1], [0.86, 0], [1, 0]]), tr = j * osc(u, 18);
  return {
    ...mix(face('calm'), face('surprised'), j), eyeScale: 1 + 0.36 * j, headY: -12 * j, headScale: 1 + 0.07 * j, rot: -3 * j,
    armL: 15 + 115 * j, armR: 15 + 115 * j, headX: 1.2 * tr, mane: 0.9 * j, y: -3 * j, sweat: 0.6 * j,
  };
};
const shockO = (g: CanvasRenderingContext2D, u: number) => {
  const j = kf(u, [[0, 0], [0.16, 0], [0.22, 1.2], [0.28, 1], [0.66, 1], [0.82, 0], [1, 0]]);
  word(g, '!', 108, 22, 26 * j, '#FFD23A', Math.min(1, j * 1.5), 0.18);
  burst(g, 64, 50, 52, 62, 10, hump(u, 0.17, 0.4), '#FFF4E0', 3);
};

// :kaijusmug: — Lorik's eyebrow waggle: half-lidded, sly side-eye, head cocked.
const smugP = (u: number): P => {
  const wag = hump(u, 0.25, 0.65) * osc(u, 5);
  return {
    ...face('smug'), browAsym: 0.2 + 0.9 * wag, lookX: 0.7, headRot: 7 + 2 * osc(u), headX: 2, smile: 0.95, eyeOpen: 0.48,
    headY: -2 * hump(u, 0.25, 0.65), armL: -30, armR: -30, mane: 0.1,
  };
};
const smugO = (g: CanvasRenderingContext2D, u: number) => spark(g, 92, 84, 6 * hump(u, 0.3, 0.6), hump(u, 0.3, 0.6) * 1.4, '#FFE680');

// :kaijucool: — Lumi drops her shades, nods, a glint skates across the lenses.
const coolP = (u: number): P => {
  const sh = kf(u, [[0, 0], [0.12, 0], [0.26, 1], [0.84, 1], [0.96, 0], [1, 0]]);
  return {
    ...face('smug'), shades: sh, smile: 0.9, eyeOpen: 0.6, headY: 3 * Math.max(0, osc(u, 3, 0.2)) * sh, headRot: -5 * sh + 1.5 * osc(u, 3),
    rot: -1.5 * sh, armL: -26, armR: -26, mane: 0.2,
  };
};
const coolO = (g: CanvasRenderingContext2D, u: number) => {
  const gl = hump(u, 0.34, 0.56); if (gl < 0.02) return;
  const f = (u - 0.34) / 0.22, [x, y] = toE('bust', ...headPt(coolP(u), -48 + 96 * f, -176));
  spark(g, x, y, 9 * gl, gl, '#FFFFFF');
};

// :kaijuwink: — Lumi winks; a little star twinkles off the closed eye.
const winkP = (u: number): P => {
  const w = kf(u, [[0, 0], [0.18, 0], [0.28, 1], [0.62, 1], [0.74, 0], [1, 0]]);
  return {
    ...mix(face('calm'), face('wink'), w), happy: 0, eyeR: 1 - 0.95 * w, browAsym: -0.6 * w, headRot: 8 * w, headX: 2 * w,
    smile: 0.6 + 0.35 * w, tongue: 0.5 * w, blush: 0.9, armL: -20, armR: 30 + 30 * w, mane: 0.15,
  };
};
const winkO = (g: CanvasRenderingContext2D, u: number) => {
  const s = hump(u, 0.26, 0.6), [x, y] = toE('bust', ...headPt(winkP(u), 52, -175));
  spark(g, x + 6 + s * 6, y - 4 - s * 8, 9 * s, s * 1.3, '#FFE680');
  spark(g, x + 16, y + 6 - s * 4, 4.5 * s, s, '#FFFFFF');
};

// :kaijuwave: — Lorik's friendly "hi!": paw up, waggling, big happy face.
const waveP = (u: number): P => {
  const up = kf(u, [[0, 0.75], [0.1, 1], [0.9, 1], [1, 0.75]]), w = osc(u, 3);
  return {
    ...face('joy'), armR: 30 + 78 * up + 16 * w,   // ≈ 92..124: paw out beside the head — past ~140 it lands on the cheek
    armL: -18, headRot: 5 + 4 * w, rot: 2, headY: -2 * Math.abs(w), mane: 0.15 + 0.1 * w, blush: 0.9,
  };
};
const waveO = (g: CanvasRenderingContext2D, u: number) => {
  const a = 0.5 + 0.5 * osc(u, 3, 0.25);
  g.save(); g.globalAlpha = 0.85; g.strokeStyle = '#FFF4E0'; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.arc(104, 74, 14, -1.3 + a * 0.3, -0.5 + a * 0.3); g.stroke(); g.beginPath(); g.arc(104, 74, 20, -1.2 + a * 0.3, -0.6 + a * 0.3); g.stroke(); g.restore();
  word(g, 'hi!', 26, 22, 17, '#FFD23A', 1, -0.15 + 0.08 * osc(u, 3));
};

// :kaijuclap: — Lumi applauding, two claps per loop, bouncing on her toes.
const clapP = (u: number): P => {
  const c = Math.pow(0.5 + 0.5 * Math.cos(TAU * 2 * u), 1.6);   // 1 = hands together
  return {
    ...face('joy'), armL: 32 - 88 * c, armR: 32 - 88 * c, y: -6 * (1 - c), sy: 1 - 0.03 * c, headY: 2 * c, headRot: 4 * osc(u),
    mane: 0.25 * c, tail: 10 * osc(u, 2), blush: 0.9, mouth: 0.3 + 0.2 * c,
  };
};
const clapO = (g: CanvasRenderingContext2D, u: number) => {
  const hit = Math.pow(0.5 + 0.5 * Math.cos(TAU * 2 * u), 8);
  const [x, y] = toE('full', 0, -72, 0, 1.12, 12);   // where the paws meet (actor scale 1.12, y +12)
  burst(g, x, y, 12, 14 + 14 * hit, 10, hit * 1.2, '#FFE680', 3.2, 0.2);
  spark(g, x, y, 10 * hit, hit, '#FFFFFF');
};

// :headbang: — Lorik headbanging, horns up, frill flaring on every hit. Two hits per loop.
const bangP = (u: number): P => {
  const ph = wrap(u * 2), p = Math.exp(-ph * 4.5), alt = u < 0.5 ? 1 : -1;
  return {
    headRot: 4 + 10 * p + 6 * p * alt, headY: 13 * p, headScale: 1 + 0.05 * p, rot: 3 + 4 * p, mane: p,
    armL: 22 + 18 * p, armR: 22 + 18 * p,   // arms stay low: any raised paw is drawn over the tilted face sy: 1 - 0.06 * p, y: 4 * p, closed: 0.7, mouth: 0.25 + 0.55 * p, mouthW: 0.8, smile: -0.6, brow: 0.6,
  };
};
const bangO = (g: CanvasRenderingContext2D, u: number) => {
  const p = Math.exp(-wrap(u * 2) * 4.5);
  g.save(); g.globalAlpha = p; g.strokeStyle = '#FFF4E0'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); for (const [x, y] of [[18, 26], [12, 44], [20, 62]]) { g.moveTo(x, y); g.lineTo(x - 8, y + 4); }
  g.stroke(); g.restore();
  spark(g, 30, 18, 6 * p, p, '#FF8BF0');
};

// :flash: — Lumi lifts her camera… SNAP. Flash bloom off the lens, then a satisfied grin.
const flashP = (u: number): P => {
  const cam = kf(u, [[0, 0], [0.22, 1], [0.7, 1], [0.86, 0], [1, 0]]), snap = hump(u, 0.36, 0.5);
  return {
    ...mix(face('calm'), face('excited'), cam), camUp: cam, armL: 15 + 25 * cam, armR: 15 + 25 * cam, headY: -2 * cam + 2 * snap,
    headRot: -4 * cam, rot: -1.5 * snap, eyeR: 1 - 0.9 * cam, mane: 0.2 + 0.6 * snap,
  };
};
const flashO = (g: CanvasRenderingContext2D, u: number) => {
  const f = u < 0.38 ? 0 : Math.exp(-(u - 0.38) * 14);
  if (f < 0.01) return;
  const cam = kf(u, [[0, 0], [0.22, 1], [0.7, 1], [0.86, 0], [1, 0]]);
  const [x, y] = toE('bust', 0, -74 - 93 * cam);
  g.save(); g.globalCompositeOperation = 'lighter';
  const r = g.createRadialGradient(x, y, 0, x, y, 70); r.addColorStop(0, `rgba(255,255,255,${f})`); r.addColorStop(0.3, `rgba(255,240,200,${0.7 * f})`); r.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); g.restore();
  burst(g, x, y, 16, 16 + 34 * f, 12, f, '#FFFFFF', 3, 0.13);
  spark(g, x, y, 22 * f, f, '#FFFFFF');
};

// :sing: — Lorik belting into his mic, swaying, notes streaming out.
const singP = (u: number): P => {
  const syl = Math.abs(Math.sin(Math.PI * 4 * u)), long = hump(u, 0.55, 0.95);
  return {
    ...face('sing'), mic: 1, armL: -105 + 5 * osc(u, 2), armR: 40 + 70 * long, mouth: 0.15 + 0.75 * Math.max(syl * (1 - long), long * 0.9),
    mouthW: 0.55, happy: 0.5 * (1 - long), closed: 0.8 * long, headRot: 7 * osc(u), headY: -4 * long, blush: 0.75, mane: 0.15 + 0.5 * long,
  };
};
const singO = (g: CanvasRenderingContext2D, u: number) => {
  for (let i = 0; i < 3; i++) {
    const f = wrap(u + i / 3), a = Math.min(1, Math.sin(Math.PI * f) * 1.8);
    note(g, 86 + f * 30, 70 - f * 56 + 4 * osc(f, 2), 12 + 4 * f, a, ['#FF6FD0', '#FFD23A', '#B98BFF'][i], i === 1);
  }
};

// :study: — Lorik reading his LORIK book… a lightbulb pops — EUREKA — then back to the page.
const studyP = (u: number): P => {
  const idea = kf(u, [[0, 0], [0.44, 0], [0.5, 1.1], [0.56, 1], [0.8, 1], [0.9, 0], [1, 0]]), read = 1 - Math.min(1, idea);
  return {
    ...mix(face('calm'), face('excited'), idea), book: 1, armL: -20 + 165 * idea, armR: -40, lookY: read, lookX: 0.3 * read * osc(u, 2),
    eyeOpen: 0.7 + 0.3 * idea, headY: 4 * read - 6 * idea, headRot: 3 * read * osc(u), y: -10 * hump(u, 0.46, 0.62), mane: 0.7 * idea, tail: 8 * osc(u),
  };
};
const studyO = (g: CanvasRenderingContext2D, u: number) => {
  const idea = kf(u, [[0, 0], [0.45, 0], [0.5, 1.2], [0.56, 1], [0.8, 1], [0.88, 0], [1, 0]]);
  if (idea < 0.02) return;
  const x = 84, y = 22, s = idea;
  g.save(); g.translate(x, y); g.scale(s, s);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 22); r.addColorStop(0, 'rgba(255,233,140,0.8)'); r.addColorStop(1, 'rgba(255,233,140,0)');
  g.fillStyle = r; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
  g.lineWidth = 3; g.strokeStyle = INK; g.fillStyle = '#FFE680';
  g.beginPath(); g.arc(0, -2, 9, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(4, 9); g.lineTo(-4, 9); g.closePath(); g.stroke(); g.fill();
  g.fillStyle = '#8A7BA8'; g.fillRect(-4.5, 9, 9, 5); g.strokeRect(-4.5, 9, 9, 5);
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(-3, -5, 2.4, 0, TAU); g.fill();
  g.restore();
  burst(g, x, y - 2, 15 * s, 21 * s, 8, Math.min(1, idea), '#FFE680', 2.4);
};

// :peek: — Lumi rises from below the edge, glowing eyes darting left… right… and ducks.
const peekP = (u: number): P => ({
  ...face('calm'), smile: 0.1, eyeScale: 1.12,
  y: kf(u, [[0, 200], [0.1, 200], [0.28, 46], [0.33, 56], [0.38, 50], [0.76, 50], [0.92, 200], [1, 200]]),
  lookX: kf(u, [[0, 0], [0.38, 0], [0.44, -1], [0.54, -1], [0.6, 1], [0.7, 1], [0.76, 0], [1, 0]]), lookY: 0.2,
  headRot: kf(u, [[0, 0], [0.4, 0], [0.46, -5], [0.56, -5], [0.62, 5], [0.72, 5], [0.78, 0], [1, 0]]), armL: 150, armR: 150, mane: 0.1,
});
const peekO = (g: CanvasRenderingContext2D, _u: number) => {
  // the ledge she peeks over (hides the crop line so she's clearly BEHIND something)
  const gr = g.createLinearGradient(0, 106, 0, 128); gr.addColorStop(0, '#4A3A66'); gr.addColorStop(1, '#2A1F3F');
  g.save(); g.fillStyle = gr; g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.roundRect(4, 108, 120, 26, 6); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,170,80,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 110.5); g.lineTo(118, 110.5); g.stroke();
  g.restore();
};

// :kaijusweat: — Lumi nervous: worried brows, eyes darting, a gulp, sweat flying.
const sweatP = (u: number): P => {
  const gulp = hump(u, 0.45, 0.6);
  return {
    ...face('worried'), lookX: kf(u, [[0, -0.8], [0.2, -0.8], [0.26, 0.8], [0.44, 0.8], [0.5, -0.8], [1, -0.8]]),
    headX: 1.2 * osc(u, 12), mouth: 0.08 + 0.2 * gulp, mouthW: 0.3, headY: 3 * gulp, sy: 1 - 0.02 * gulp, armL: -38, armR: -38, eyeScale: 1.08, blush: 0.2,
  };
};
const sweatO = (g: CanvasRenderingContext2D, u: number) => {
  for (let i = 0; i < 2; i++) {
    const f = wrap(u * 2 + i * 0.5), side = i ? 1 : -1;
    drop(g, 64 + side * (36 + f * 22), 40 - Math.sin(Math.PI * f) * 16 + f * 18, 13, 1 - f, '#9FD8FF', side * (0.3 + f));
  }
};

// :dab: — Lorik winds up, then snaps into a dab (and holds it, very pleased).
const dabP = (u: number): P => {
  const d = kf(u, [[0, 0], [0.22, -0.15], [0.3, 1.1], [0.36, 1], [0.76, 1], [0.9, 0], [1, 0]]), bob = (1 - Math.min(1, Math.max(0, d))) * Math.abs(osc(u, 2));
  return {
    ...mix(face('grumpy'), face('sleep'), Math.max(0, d)), smile: -0.4 + 1.2 * Math.max(0, d),
    armL: 18 + 120 * d, armR: 18 - 150 * d, headRot: -22 * d, headX: 10 * d, headY: 6 * d, rot: -5 * d, legL: 6 + 10 * d, legR: 6, y: -6 * bob, mane: 0.4 * d, tail: 18 * d,
  };
};
const dabO = (g: CanvasRenderingContext2D, u: number) => {
  const s = hump(u, 0.26, 0.5);
  g.save(); g.globalAlpha = s; g.strokeStyle = '#FFF4E0'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); for (const [x, y] of [[14, 30], [22, 20], [10, 44]]) { g.moveTo(x, y); g.lineTo(x - 9, y - 5); } g.stroke(); g.restore();
  spark(g, 24, 16, 7 * s, s, '#FFE680');
};

// ── duos ─────────────────────────────────────────────────────────────────────────────────────────────
const DUO_X = 76, DUO_S = 0.72;   // far enough apart that the frills only kiss, near enough for the high-five

// :kaijugg: — Lorik and Lumi wind up and slap a high-five; "GG" drops in.
const ggP = (u: number): P => {
  const wind = kf(u, [[0, 0], [0.2, 1], [0.3, 0], [1, 0]]), hi = kf(u, [[0, 0], [0.22, 0], [0.32, 1.1], [0.38, 1], [0.66, 1], [0.86, 0], [1, 0]]);
  return {
    ...mix(face('calm'), face('excited'), Math.max(wind, hi)), armR: 20 + 40 * wind + 132 * hi, armL: 12 + 18 * hi,
    rot: -6 * wind + 13 * hi, y: -12 * hump(u, 0.26, 0.44), sy: 1 - 0.06 * wind, lookX: 0.8, mane: 0.8 * hump(u, 0.28, 0.6), tail: -14 * hi,
  };
};
const ggO = (g: CanvasRenderingContext2D, u: number) => {
  const hit = hump(u, 0.3, 0.5), [x, y] = toE('full', 0, -112);
  burst(g, x, y, 8, 10 + 18 * hit, 10, hit * 1.3, '#FFE680', 3);
  spark(g, x, y, 14 * hit, hit, '#FFFFFF');
  const gg = kf(u, [[0, 0], [0.32, 0], [0.4, 1.2], [0.46, 1], [0.8, 1], [0.9, 0], [1, 0]]);
  word(g, 'GG', 64, 20, 26 * gg, '#FFD23A', Math.min(1, gg * 1.4));
};

// :kaijuhug: — cheek-to-cheek squeeze in a bust two-shot (a full-body hug reads as one blob at 28 px), hearts rising.
const hugP = (u: number): P => {
  const sq = 0.5 + 0.5 * osc(u, 2);
  return {
    ...face('joy'), armR: 100 + 10 * sq, armL: 40, rot: 3 + 1.5 * sq + 1.5 * osc(u), headRot: 15 + 3 * osc(u), headX: 6, sy: 1 - 0.02 * sq,
    blush: 1, mane: 0.2 * sq, tail: 10 * osc(u),
  };
};
const hugO = (g: CanvasRenderingContext2D, u: number) => {
  for (let i = 0; i < 3; i++) {
    const f = wrap(u + i / 3);
    heart(g, 64 + 8 * osc(f, 1, i * 0.33), 40 - f * 34, 10 + 6 * Math.sin(Math.PI * f), Math.min(1, Math.sin(Math.PI * f) * 2), i % 2 ? '#FF4F8B' : '#FF2E63');
  }
};

// :danceoff: — Lorik busts a pump-hop, then Lumi answers with a spin. Each watches (arms crossed) while the other goes.
const goP = (v: number): P => {   // v ∈ 0..1 over this dancer's turn
  const on = hump(v, 0, 1), hop = Math.abs(Math.sin(Math.PI * 2 * v));
  return { ...mix(face('smug'), face('excited'), on), y: -26 * hop * on, armL: 30 + 135 * on * (0.5 + 0.5 * osc(v, 2)), armR: 30 + 135 * on * (0.5 - 0.5 * osc(v, 2)),
    legL: 12 * hop * on, legR: 12 * hop * on, sy: 1 + 0.05 * hop * on, mane: on * hop, tail: 20 * osc(v, 2) * on, rot: 5 * osc(v, 2) * on };
};
const spinP = (v: number): P => {
  const on = hump(v, 0, 1);
  return { ...mix(face('smug'), face('joy'), on), spin: Math.cos(TAU * 2 * v * on), y: -18 * on, armL: 30 + 135 * on, armR: 30 + 135 * on, legR: -20 * on, liftR: -14 * on, mane: 0.8 * on, glow: 0.4 * on };
};
const watchP = (u: number): P => ({ ...face('smug'), armL: -42, armR: -42, lookX: 0.8, headRot: 4 * osc(u, 4), y: -2 * Math.abs(osc(u, 4)) });
const danceLorik = (u: number): P => (u < 0.5 ? goP(u / 0.5) : watchP(u));
const danceLumi = (u: number): P => mir(u >= 0.5 ? spinP((u - 0.5) / 0.5) : watchP(u));
const danceO = (g: CanvasRenderingContext2D, u: number) => {
  const left = u < 0.5, v = wrap(u * 2), on = hump(v, 0, 1);
  const cx = 64 + (left ? -1 : 1) * DUO_X * (128 / KAIJU_FRAMES.full.side);
  for (let i = 0; i < 4; i++) { const f = wrap(v * 2 + i / 4), a = (i / 4) * TAU + v * 3; spark(g, cx + Math.cos(a) * (20 + 8 * f), 30 + Math.sin(a) * 10 - f * 8, 5 * (1 - f), on * (1 - f), left ? '#FF8BF0' : '#FFD27A'); }
  word(g, 'VS', 64, 112, 13, '#FFF4E0', 0.9);
};

// ── the pack ─────────────────────────────────────────────────────────────────────────────────────────
export const KAIJU_EMOTES: EmoteDef[] = [
  def('roar', 'Kaiju Roar', LORIK, 'stomp', ['lorik', 'roar', 'hype', 'loud', 'rawr'],
    art(1.4, 'bust', [actor('lorik', 1.4, roarP)], roarO), 'summon'),
  def('kaijuhype', 'Kaiju Hype', LORIK, 'bounce', ['lorik', 'hype', 'jump', 'letsgo', 'party'],
    art(0.9, 'full', [actor('lorik', 0.9, hypeP, { scale: 0.9 })], hypeO), 'summon'),
  def('kaijulove', 'Lumi Love', '#FF4F8B', 'float', ['lumi', 'love', 'heart', 'cute', 'crush'],
    art(1.6, 'bust', [actor('lumi', 1.6, loveP)], loveO)),
  def('kaijulol', 'Lorik LOL', LORIK, 'bounce', ['lorik', 'lol', 'laugh', 'funny', 'lmao'],
    art(1.2, 'bust', [actor('lorik', 1.2, lolP)], lolO)),
  def('kaijucry', 'Lumi Sob', '#5BB8FF', 'rain', ['lumi', 'cry', 'sad', 'tears', 'sob'],
    art(1.2, 'bust', [actor('lumi', 1.2, cryP)], cryO)),
  def('kaijusleep', 'Lorik Snooze', '#8A7BFF', 'float', ['lorik', 'sleep', 'tired', 'zzz', 'bored'],
    art(1.6, 'bust', [actor('lorik', 1.6, sleepP)], sleepO)),
  def('kaijurage', 'Lumi Fuming', '#FF3B2E', 'shake', ['lumi', 'rage', 'angry', 'mad', 'steam'],
    art(1.0, 'bust', [actor('lumi', 1.0, rageP)], rageO)),
  def('kaijushock', 'Lumi Shook', '#FFD23A', 'pop', ['lumi', 'shock', 'surprised', 'omg', 'wow'],
    art(1.3, 'bust', [actor('lumi', 1.3, shockP)], shockO)),
  def('kaijusmug', 'Lorik Smug', LORIK, 'pop', ['lorik', 'smug', 'sly', 'heh', 'sus'],
    art(1.4, 'bust', [actor('lorik', 1.4, smugP)], smugO)),
  def('kaijucool', 'Lumi Shades', LUMI, 'pop', ['lumi', 'cool', 'shades', 'deal with it', 'swag'],
    art(1.4, 'bust', [actor('lumi', 1.4, coolP)], coolO)),
  def('kaijuwink', 'Lumi Wink', LUMI, 'pop', ['lumi', 'wink', 'flirt', 'cute', 'tongue'],
    art(1.2, 'bust', [actor('lumi', 1.2, winkP)], winkO)),
  def('kaijuwave', 'Lorik Hi', LORIK, 'pop', ['lorik', 'wave', 'hi', 'hello', 'bye'],
    art(1.0, 'bust', [actor('lorik', 1.0, waveP)], waveO)),
  def('kaijuclap', 'Lumi Applause', LUMI, 'pulse', ['lumi', 'clap', 'applause', 'bravo', 'gg'],
    art(0.8, 'full', [actor('lumi', 0.8, clapP, { scale: 1.12, y: 12 })], clapO)),
  def('headbang', 'Lorik Headbang', LORIK_HOT, 'shake', ['lorik', 'headbang', 'rock', 'metal', 'music'],
    art(0.8, 'bust', [actor('lorik', 0.8, bangP)], bangO), 'summon'),
  def('flash', 'Lumi Snap', '#FFE9A8', 'pop', ['lumi', 'flash', 'camera', 'photo', 'clip', 'snap'],
    art(1.4, 'bust', [actor('lumi', 1.4, flashP)], flashO), 'firework'),
  def('sing', 'Lorik Sings', LORIK_HOT, 'float', ['lorik', 'sing', 'music', 'mic', 'karaoke'],
    art(1.6, 'bust', [actor('lorik', 1.6, singP)], singO)),
  def('study', 'Lorik Eureka', '#FFD23A', 'pop', ['lorik', 'study', 'read', 'book', 'idea', 'think'],
    art(1.6, 'full', [actor('lorik', 1.6, studyP, { scale: 1.05, y: 8 })], studyO)),
  def('peek', 'Lumi Peek', LUMI, 'pop', ['lumi', 'peek', 'lurk', 'hide', 'shy'],
    art(1.6, 'bust', [actor('lumi', 1.6, peekP)], peekO)),
  def('kaijusweat', 'Lumi Nervous', '#9FD8FF', 'shake', ['lumi', 'sweat', 'nervous', 'yikes', 'awkward'],
    art(1.2, 'bust', [actor('lumi', 1.2, sweatP)], sweatO)),
  def('dab', 'Lorik Dab', LORIK, 'pop', ['lorik', 'dab', 'flex', 'win', 'silly'],
    art(1.2, 'full', [actor('lorik', 1.2, dabP, { scale: 1.05, y: 8 })], dabO)),
  def('rawr', 'Lumi Rawr', LUMI, 'pop', ['lumi', 'rawr', 'roar', 'cute', 'scary'],
    art(1.2, 'bust', [actor('lumi', 1.2, rawrP)], rawrO)),
  def('kaijugg', 'Kaiju High-Five', '#FFD23A', 'pop', ['duo', 'gg', 'highfive', 'win', 'teamwork'],
    art(1.4, 'full', [actor('lorik', 1.4, ggP, { x: -DUO_X, scale: DUO_S }), actor('lumi', 1.4, u => mir(ggP(u)), { x: DUO_X, scale: DUO_S })], ggO), 'firework'),
  def('kaijuhug', 'Kaiju Hug', '#FF4F8B', 'pulse', ['duo', 'hug', 'love', 'friends', 'wholesome'],
    art(1.6, 'bust', [actor('lorik', 1.6, hugP, { x: -62, y: -40, scale: 0.8 }), actor('lumi', 1.6, u => mir(hugP(u)), { x: 62, y: -40, scale: 0.8 })], hugO)),
  def('danceoff', 'Dance-Off', '#FF4FD8', 'bounce', ['duo', 'dance', 'party', 'vs', 'battle', 'hype'],
    art(1.6, 'full', [actor('lorik', 1.6, danceLorik, { x: -DUO_X, scale: DUO_S }), actor('lumi', 1.6, danceLumi, { x: DUO_X, scale: DUO_S })], danceO), 'summon'),
];
