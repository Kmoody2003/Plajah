// kaijuFaceExtras — the little "emotes" around a 3D kaiju's head (tear, sweat, anger vein, hearts, sparkle, zzz, notes, !, ?)
// as one shared procedural canvas atlas (crisp, Plajah-style: thick plum outline + bright fill + white glint) and the
// pure animation curves that float / pop them. No DOM in the curves, so they are unit-testable.

import type { Extra } from './kaijuFaceDecals';

export const EXTRA_CELLS = 128;
export const EXTRA_COLS = 4, EXTRA_ROWS = 3;
export const OUTLINE = '#3B1A5C';
/** glyph name → cell index in the atlas */
export const GLYPH: Record<string, number> = { tear: 0, sweat: 1, anger: 2, heart: 3, sparkle: 4, zzz: 5, note: 6, exclaim: 7, question: 8, blush: 9, blushBig: 10, star: 11 };

type Ctx = CanvasRenderingContext2D;
function outlined(g: Ctx, path: () => void, fill: string, lw = 9) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); path(); g.lineWidth = lw; g.strokeStyle = OUTLINE; g.stroke(); g.fillStyle = fill; g.fill();
}
const glint = (g: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.5) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(); };

const PAINT: Record<number, (g: Ctx) => void> = {
  0: g => { outlined(g, () => { g.moveTo(64, 14); g.bezierCurveTo(88, 52, 98, 70, 98, 84); g.arc(64, 84, 34, 0, Math.PI, false); g.bezierCurveTo(30, 70, 40, 52, 64, 14); }, '#7fd0ff'); glint(g, 50, 82, 7, 13); },
  1: g => { outlined(g, () => { g.moveTo(64, 12); g.bezierCurveTo(90, 50, 100, 68, 100, 82); g.arc(64, 82, 36, 0, Math.PI, false); g.bezierCurveTo(28, 68, 38, 50, 64, 12); }, '#bfe9ff'); glint(g, 49, 80, 7, 14); },
  2: g => {   // the manga anger vein: four curved wedges around an empty centre
    const wedge = (a: number) => { g.save(); g.translate(64, 64); g.rotate(a); outlined(g, () => { g.moveTo(8, -8); g.quadraticCurveTo(46, -10, 50, -44); g.quadraticCurveTo(24, -34, 8, 8); g.closePath(); }, '#ff3b4d', 8); g.restore(); };
    for (let k = 0; k < 4; k++) wedge(k * Math.PI / 2);
  },
  3: g => { outlined(g, () => { g.moveTo(64, 108); g.bezierCurveTo(8, 70, 14, 22, 44, 22); g.bezierCurveTo(56, 22, 62, 30, 64, 38); g.bezierCurveTo(66, 30, 72, 22, 84, 22); g.bezierCurveTo(114, 22, 120, 70, 64, 108); }, '#ff3d7f'); glint(g, 38, 44, 10, 6); },
  4: g => { outlined(g, () => { g.moveTo(64, 8); g.quadraticCurveTo(68, 58, 120, 64); g.quadraticCurveTo(68, 70, 64, 120); g.quadraticCurveTo(60, 70, 8, 64); g.quadraticCurveTo(60, 58, 64, 8); }, '#fff3a6', 7); },
  5: g => { g.font = '900 104px Outfit, "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = OUTLINE; g.strokeText('Z', 64, 70); g.fillStyle = '#b9a4ff'; g.fillText('Z', 64, 70); },
  6: g => { outlined(g, () => { g.ellipse(44, 94, 20, 15, -0.4, 0, Math.PI * 2); }, '#ffb000'); outlined(g, () => { g.moveTo(58, 90); g.lineTo(58, 22); g.quadraticCurveTo(80, 30, 96, 52); g.lineTo(96, 42); g.quadraticCurveTo(86, 20, 58, 14); g.closePath(); }, '#ffb000', 8); },
  7: g => { outlined(g, () => { g.moveTo(50, 12); g.lineTo(78, 12); g.lineTo(72, 78); g.lineTo(56, 78); g.closePath(); }, '#ffd400'); outlined(g, () => { g.arc(64, 104, 11, 0, Math.PI * 2); }, '#ffd400', 8); },
  8: g => { g.font = '900 112px Outfit, "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = OUTLINE; g.strokeText('?', 64, 68); g.fillStyle = '#7fe0c4'; g.fillText('?', 64, 68); },
  9: g => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 54); gr.addColorStop(0, 'rgba(255,92,140,0.85)'); gr.addColorStop(0.6, 'rgba(255,92,140,0.55)'); gr.addColorStop(1, 'rgba(255,92,140,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 56, 40, 0, 0, Math.PI * 2); g.fill(); },
  10: g => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 58); gr.addColorStop(0, 'rgba(255,70,120,1)'); gr.addColorStop(0.55, 'rgba(255,70,120,0.7)'); gr.addColorStop(1, 'rgba(255,70,120,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 60, 44, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(214,40,100,0.55)'; g.lineWidth = 5; g.lineCap = 'round'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(44 + k * 16, 78); g.lineTo(52 + k * 16, 52); g.stroke(); } },
  11: g => { outlined(g, () => { for (let k = 0; k < 10; k++) { const r = k % 2 ? 22 : 54, a = -Math.PI / 2 + k * Math.PI / 5; g[k ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } g.closePath(); }, '#ffd400', 8); },
};

/** Paint the shared atlas (browser only). */
export function paintExtrasAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = EXTRA_CELLS * EXTRA_COLS; c.height = EXTRA_CELLS * EXTRA_ROWS;
  const g = c.getContext('2d')!;
  for (const [idx, fn] of Object.entries(PAINT)) {
    const i = +idx; g.save(); g.translate((i % EXTRA_COLS) * EXTRA_CELLS, Math.floor(i / EXTRA_COLS) * EXTRA_CELLS); g.beginPath(); g.rect(0, 0, EXTRA_CELLS, EXTRA_CELLS); g.clip(); fn(g); g.restore();
  }
  return c;
}

/** Atlas rect of a glyph in texture space with flipY=true: [offsetX, offsetY, repeatX, repeatY]. */
export function glyphRect(glyph: number): [number, number, number, number] {
  const col = glyph % EXTRA_COLS, row = Math.floor(glyph / EXTRA_COLS);
  return [col / EXTRA_COLS, 1 - (row + 1) / EXTRA_ROWS, 1 / EXTRA_COLS, 1 / EXTRA_ROWS];
}

// ------------------------------------------------------------------------------------------------ motion
export interface SpriteState { x: number; y: number; z: number; size: number; alpha: number; rot: number }
/** where an extra lives, in units of head-local metres relative to an origin the rig chooses */
export type Anchor = 'top' | 'eyeL' | 'eyeR' | 'browR' | 'browL';
export interface ExtraDef { glyph: number; count: number; period: number; anchor: Anchor; tint?: string; sprite(phase: number, i: number, t: number, w: number, out: SpriteState): void }

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const popIn = (p: number) => { const x = sat(p / 0.22); return x < 1 ? 1.25 * Math.sin(x * Math.PI * 0.5) + (x * x - x) * 0.0 : 1; };
const fadeEnd = (p: number, from = 0.7) => 1 - sat((p - from) / (1 - from));

/** Motion curves per extra kind. `phase` loops 0..1; i = sprite index; w = presence weight 0..1. Values relative to the anchor. */
export const EXTRA_DEFS: Partial<Record<Extra, ExtraDef>> = {
  heart: { glyph: GLYPH.heart, count: 3, period: 1.9, anchor: 'top', sprite: (p, i, t, w, o) => { o.x = (i - 1) * 0.07 + Math.sin(t * 2 + i * 2) * 0.012; o.y = 0.02 + p * 0.16; o.z = 0.03; o.size = 0.06 * popIn(p) * (0.85 + 0.15 * i / 2) * w; o.alpha = fadeEnd(p, 0.6) * w; o.rot = Math.sin(t * 3 + i) * 0.2; } },
  sparkle: { glyph: GLYPH.sparkle, count: 3, period: 1.2, anchor: 'top', sprite: (p, i, t, w, o) => { const q = (p + 0.33 * i) % 1; const sx = [-0.1, 0.11, 0.0][i], sy = [0.03, 0.0, 0.13][i]; o.x = sx; o.y = sy; o.z = 0.04; const tw = Math.sin(Math.PI * q); o.size = 0.055 * tw * w; o.alpha = sat(tw * 1.6) * w; o.rot = q * 2; } },
  zzz: { glyph: GLYPH.zzz, count: 3, period: 2.6, anchor: 'top', sprite: (p, i, t, w, o) => { const q = (p + i / 3) % 1; o.x = 0.1 + q * 0.07 + Math.sin(q * 6.28) * 0.01; o.y = 0.02 + q * 0.17; o.z = 0.02; o.size = (0.035 + q * 0.04) * w; o.alpha = sat(q * 5) * fadeEnd(q, 0.7) * w; o.rot = -0.2 + q * 0.2; } },
  notes: { glyph: GLYPH.note, count: 3, period: 2.4, anchor: 'top', sprite: (p, i, t, w, o) => { const q = (p + i / 3) % 1; o.x = (i - 1) * 0.1 + Math.sin(q * 6.28 + i * 2) * 0.03; o.y = 0.0 + q * 0.2; o.z = 0.03; o.size = 0.06 * w; o.alpha = sat(q * 6) * fadeEnd(q, 0.65) * w; o.rot = Math.sin(q * 6.28 + i) * 0.35; } },
  exclaim: { glyph: GLYPH.exclaim, count: 1, period: 1.0, anchor: 'top', sprite: (p, i, t, w, o) => { const b = Math.abs(Math.sin(t * 7)) * 0.012 * w; o.x = 0.0; o.y = 0.04 + b; o.z = 0.03; o.size = 0.1 * popIn(Math.min(1, w * 1.2)) * w; o.alpha = w; o.rot = Math.sin(t * 9) * 0.06; } },
  question: { glyph: GLYPH.question, count: 1, period: 1.0, anchor: 'top', sprite: (p, i, t, w, o) => { o.x = 0.0; o.y = 0.045 + Math.sin(t * 3) * 0.008; o.z = 0.03; o.size = 0.1 * popIn(Math.min(1, w * 1.2)) * w; o.alpha = w; o.rot = Math.sin(t * 2.4) * 0.18; } },
  anger: { glyph: GLYPH.anger, count: 1, period: 0.8, anchor: 'top', sprite: (p, i, t, w, o) => { const pulse = 1 + 0.18 * Math.max(0, Math.sin(t * 9)); o.x = 0.13; o.y = 0.045; o.z = 0.035; o.size = 0.075 * pulse * w; o.alpha = w; o.rot = 0.25; } },
  sweat: { glyph: GLYPH.sweat, count: 1, period: 2.2, anchor: 'browL', sprite: (p, i, t, w, o) => { o.x = 0.055; o.y = 0.04 - p * 0.085; o.z = 0.02; o.size = 0.045 * w * (0.8 + 0.2 * Math.sin(p * 20)); o.alpha = sat(p * 8) * fadeEnd(p, 0.75) * w; o.rot = 0; } },
  tear: { glyph: GLYPH.tear, count: 2, period: 1.5, anchor: 'eyeL', sprite: (p, i, t, w, o) => { const q = (p + i * 0.5) % 1; o.x = 0.012 * (i ? -1 : 1); o.y = -0.05 - q * 0.1; o.z = 0.02; o.size = 0.04 * (0.7 + 0.3 * sat(q * 4)) * w; o.alpha = sat(q * 10) * fadeEnd(q, 0.6) * w; o.rot = 0; } },
  tear_streams: { glyph: GLYPH.tear, count: 2, period: 1.1, anchor: 'eyeR', sprite: (p, i, t, w, o) => { const q = (p + i * 0.5) % 1; o.x = 0.012 * (i ? -1 : 1); o.y = -0.05 - q * 0.12; o.z = 0.02; o.size = 0.042 * (0.7 + 0.3 * sat(q * 4)) * w; o.alpha = sat(q * 10) * fadeEnd(q, 0.6) * w; o.rot = 0; } },
};
