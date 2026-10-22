// Worksheet → native Tela document. Each page is a LETTER frame holding a VECTOR device (the designed page: theme
// header and motif, numbered items, visuals drawn as real vector shapes, answer guides) and a FORM device positioned
// over it, writing into one shared BASE device whose fields carry the answer key as validation. So the same document
// prints beautifully, fills in on a tablet, auto-checks numeric and multiple-choice answers, and stays fully editable in
// Tela. A final teacher frame carries the key and the plain-language list of adaptations.
import type { TelaDoc, TelaDevice, TelaField, TelaFrame, TelaVectorObject, TelaBaseDevice, TelaFormDevice, TelaVectorDevice } from '../../types';
import type { Visual, Worksheet, WsItem, WsSection, Passage } from './types';
import { GRADE_LABEL, gradeNum } from './types';
import { resolveTheme, type WorksheetTheme, type Motif } from './worksheetThemes';
import { makeRng } from './rng';
import { answerKey } from './worksheetBuilder';
import { passageById } from '../../data/yearCurriculum/passages';

export const PAGE_W = 816;
export const PAGE_H = 1056;
const M = 48;
const CONTENT_W = PAGE_W - 2 * M;
const FOOT = 52;

export interface LaidPage { id: string; objects: TelaVectorObject[]; fields: TelaField[]; teacher?: boolean }

// ── primitives ───────────────────────────────────────────────────────────────
let seq = 0;
const nid = (p: string) => `${p}${(seq++).toString(36)}`;
const base = (kind: TelaVectorObject['kind'], x: number, y: number, w: number, h: number, extra: Partial<TelaVectorObject> = {}): TelaVectorObject =>
  ({ id: nid('o'), kind, x, y, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, ...extra });
const rect = (x: number, y: number, w: number, h: number, e: Partial<TelaVectorObject> = {}) => base('RECT', x, y, w, h, e);
const ellipse = (cx: number, cy: number, rx: number, ry: number, e: Partial<TelaVectorObject> = {}) => base('ELLIPSE', cx - rx, cy - ry, rx * 2, ry * 2, e);
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1, e: Partial<TelaVectorObject> = {}) =>
  base('LINE', Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) || 1, Math.abs(y2 - y1) || 1, { points: [x1, y1, x2, y2], stroke, strokeWidth: sw, ...e });
const poly = (pts: number[], e: Partial<TelaVectorObject> = {}) => {
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs), y = Math.min(...ys);
  return base('PATH', x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y), { points: pts, pathClosed: true, ...e });
};
const svgPath = (d: string, x: number, y: number, w: number, h: number, e: Partial<TelaVectorObject> = {}) =>
  base('PATH', x, y, w, h, { svgPathData: d, pathOriginX: x, pathOriginY: y, pathOriginW: w, pathOriginH: h, ...e });

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

interface Type { body: string; head: string; size: number; lh: number; charW: number }

function text(x: number, y: number, w: number, s: string, t: Type, e: Partial<TelaVectorObject> & { size?: number } = {}): TelaVectorObject {
  const size = e.size ?? t.size;
  const h = measure(s, w, { ...t, size }) + 2;
  const { size: _s, ...rest } = e;
  // Tela draws text boxes at least 80px wide; widen narrow labels around their anchor so centred and right-aligned
  // text lands where it was placed.
  if (w < 80) { x -= e.textAlign === 'center' ? (80 - w) / 2 : e.textAlign === 'right' ? 80 - w : 0; w = 80; }
  return base('TEXT', x, y, w, h, { text: plain(s), blocks: [{ id: nid('b'), kind: 'p', text: plain(s) }], fontSize: size, fontFamily: t.body, fill: '#222', wrap: true, padding: 0, lineHeight: t.lh, ...rest });
}

function measure(s: string, w: number, t: Type): number {
  const cpl = Math.max(8, Math.floor(w / (t.size * t.charW)));
  const lines = plain(s).split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / cpl)), 0);
  return lines * t.size * t.lh + t.size * 0.4;
}

// ── motifs ──────────────────────────────────────────────────────────────────
function motif(kind: Motif, x: number, y: number, w: number, h: number, th: WorksheetTheme, seed: string, density = 1): TelaVectorObject[] {
  const r = makeRng(seed);
  const o: TelaVectorObject[] = [];
  const cols = [th.accent, th.accent2];
  const n = (k: number) => Math.max(1, Math.round(k * density));
  switch (kind) {
    case 'leaves':
      for (let i = 0; i < n(14); i++) { const s = r.int(14, 30); o.push(svgPath('M0,10 Q10,0 20,10 Q10,20 0,10 Z', x + r.int(0, w - 30), y + r.int(0, h - 24), s, s / 2, { fill: r.pick(cols), opacity: 0.28 + r.next() * 0.3, rotation: r.int(-60, 60) })); }
      break;
    case 'waves':
      for (let k = 0; k < 4; k++) { const pts: number[] = []; const yy = y + h * (0.3 + k * 0.17); for (let xx = 0; xx <= w; xx += 16) pts.push(x + xx, yy + Math.sin((xx / w) * Math.PI * 4 + k) * 7); o.push(base('PATH', x, yy - 8, w, 16, { points: pts, stroke: k % 2 ? th.accent2 : th.accent, strokeWidth: 2.5 - k * 0.4, opacity: 0.55 - k * 0.1 })); }
      break;
    case 'kente': {
      const band = Math.min(26, h);
      const palette = [th.accent2, th.accent, '#1F7A3A', th.ink];
      for (let xx = 0, i = 0; xx < w; xx += 22, i++) {
        const bw = Math.min(22, w - xx);
        o.push(rect(x + xx, y, bw, band, { fill: palette[i % 4], opacity: 0.85 }));
        if (i % 2 === 0 && bw >= 18) for (let k = 0; k < 3; k++) o.push(rect(x + xx + 4, y + 4 + k * 7, 14, 3, { fill: palette[(i + 2) % 4] }));
      }
      break;
    }
    case 'seigaiha':
      for (let row = 0; row * 14 < h; row++) for (let xx = (row % 2) * 16; xx < w; xx += 32)
        for (const rr of [15, 10, 5]) o.push(svgPath(`M0,${rr} A${rr},${rr} 0 0 1 ${rr * 2},${rr}`, x + xx + 15 - rr, y + row * 14 + 15 - rr, rr * 2, rr, { stroke: th.accent, strokeWidth: 1.2, opacity: 0.35 }));
      break;
    case 'stars':
      for (let i = 0; i < n(16); i++) {
        const cx = x + r.int(10, w - 10), cy = y + r.int(8, h - 8), R = r.int(4, 10);
        const pts: number[] = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rr = k % 2 ? R * 0.45 : R; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        o.push(poly(pts, { fill: r.pick(cols), opacity: 0.35 + r.next() * 0.4 }));
      }
      for (let i = 0; i < n(24); i++) o.push(ellipse(x + r.int(0, w), y + r.int(0, h), 1.6, 1.6, { fill: th.accent, opacity: 0.5 }));
      break;
    case 'circuit':
      for (let i = 0; i < n(9); i++) {
        const sx = x + r.int(0, w - 80), sy = y + r.int(6, h - 6), l1 = r.int(30, 90), dy = r.int(-20, 20);
        o.push(base('PATH', sx, Math.min(sy, sy + dy), l1 + 40, Math.abs(dy) + 1, { points: [sx, sy, sx + l1, sy, sx + l1 + 14, sy + dy, sx + l1 + 40, sy + dy], stroke: r.pick(cols), strokeWidth: 1.6, opacity: 0.5 }));
        o.push(ellipse(sx + l1 + 40, sy + dy, 3.5, 3.5, { fill: th.paper, stroke: th.accent, strokeWidth: 1.6, opacity: 0.8 }));
      }
      break;
    case 'confetti':
      for (let i = 0; i < n(26); i++) {
        const c = r.pick([...cols, '#F2C14E', '#5B8DEF']);
        o.push(r.chance(0.5) ? rect(x + r.int(0, w - 10), y + r.int(0, h - 6), r.int(6, 12), 4, { fill: c, rotation: r.int(0, 180), opacity: 0.7 }) : ellipse(x + r.int(4, w - 4), y + r.int(4, h - 4), 3, 3, { fill: c, opacity: 0.7 }));
      }
      break;
    case 'halftone':
      for (let gx = 0; gx < w; gx += 12) for (let gy = 0; gy < h; gy += 12) { const rr = 4.5 * (1 - gx / w) * (0.4 + 0.6 * (gy / h)); if (rr > 0.6) o.push(ellipse(x + gx, y + gy, rr, rr, { fill: th.accent, opacity: 0.55 })); }
      break;
    case 'botanical':
      for (let f = 0; f < n(3); f++) {
        const sx = x + 20 + f * (w / 3), sy = y + h - 4, len = h * 0.9;
        o.push(line(sx, sy, sx + 10, sy - len, th.accent, 1.4, { opacity: 0.55 }));
        for (let k = 1; k < 8; k++) { const t = k / 8; const px = sx + 10 * t, py = sy - len * t; for (const side of [-1, 1]) o.push(ellipse(px + side * 9 * (1 - t * 0.5), py, 9 * (1 - t * 0.5), 3, { fill: th.accent, opacity: 0.3, rotation: side * -25 })); }
      }
      break;
    case 'flourish': {
      const cx = x + w / 2, cy = y + h / 2;
      for (const s of [-1, 1]) {
        o.push(svgPath(`M0,10 C20,-6 40,26 60,10 C80,-6 100,26 120,10`, s < 0 ? cx - 150 : cx + 30, cy - 10, 120, 20, { stroke: th.accent2, strokeWidth: 1.6, opacity: 0.8 }));
      }
      o.push(poly([cx, cy - 8, cx + 8, cy, cx, cy + 8, cx - 8, cy], { fill: th.accent, opacity: 0.85 }));
      break;
    }
    case 'zellige':
      for (let gx = 12; gx < w; gx += 40) for (let gy = 12; gy < h; gy += 40) {
        const s = 11;
        o.push(rect(x + gx - s, y + gy - s, s * 2, s * 2, { fill: th.accent, opacity: 0.22 }));
        o.push(rect(x + gx - s, y + gy - s, s * 2, s * 2, { fill: th.accent2, opacity: 0.22, rotation: 45 }));
      }
      break;
    case 'bauhaus': {
      const u = Math.min(h, 90);
      o.push(ellipse(x + w - u * 0.6, y + u * 0.5, u * 0.42, u * 0.42, { fill: th.accent, opacity: 0.85 }));
      o.push(rect(x + w - u * 1.5, y + u * 0.15, u * 0.6, u * 0.6, { fill: th.accent2, opacity: 0.85 }));
      o.push(poly([x + w - u * 2.3, y + u * 0.8, x + w - u * 1.8, y + u * 0.05, x + w - u * 1.3, y + u * 0.8], { fill: '#E8B923', opacity: 0.9 }));
      break;
    }
  }
  return o.map(x => ({ ...x, templateRole: 'ORNAMENT' as const }));
}

// ── visuals ─────────────────────────────────────────────────────────────────
function visual(v: Visual, x: number, y: number, th: WorksheetTheme, t: Type): { objs: TelaVectorObject[]; h: number } {
  const o: TelaVectorObject[] = [];
  const ink = th.ink, acc = th.accent, acc2 = th.accent2;
  const label = (lx: number, ly: number, s: string, size = 12, w = 40, align: 'left' | 'center' = 'center') => o.push(text(lx - (align === 'center' ? w / 2 : 0), ly, w, s, t, { size, fill: ink, textAlign: align }));
  switch (v.type) {
    case 'dots': {
      const cols = v.cols || 5, sp = 24;
      const draw = (n: number, ox: number, c: string) => { for (let i = 0; i < n; i++) o.push(ellipse(ox + (i % cols) * sp + 10, y + Math.floor(i / cols) * sp + 10, 9, 9, { fill: c })); };
      draw(v.n, x, acc);
      const rows = Math.ceil(v.n / cols);
      if (v.second) { draw(v.second, x + cols * sp + 30, acc2); return { objs: o, h: Math.max(rows, Math.ceil(v.second / cols)) * sp + 6 }; }
      return { objs: o, h: rows * sp + 6 };
    }
    case 'tenframe': {
      const c = 30;
      for (let f = 0; f < (v.frames || 1); f++) for (let i = 0; i < 10; i++) {
        const cx = x + f * (5 * c + 20) + (i % 5) * c, cy = y + Math.floor(i / 5) * c;
        o.push(rect(cx, cy, c, c, { stroke: ink, strokeWidth: 1.5, fill: th.paper }));
        if (f * 10 + i < v.n) o.push(ellipse(cx + c / 2, cy + c / 2, 10, 10, { fill: acc }));
      }
      return { objs: o, h: 2 * c + 8 };
    }
    case 'numberline': {
      const w = 520, n = Math.round((v.max - v.min) / v.step);
      o.push(line(x, y + 16, x + w, y + 16, ink, 2));
      for (let i = 0; i <= n; i++) {
        const px = x + (i / n) * w, val = v.min + i * v.step;
        o.push(line(px, y + 9, px, y + 23, ink, 1.5));
        const showAll = v.labels === 'all' && n <= 24;
        if (showAll || ((v.labels ?? 'ends') === 'ends' && (i === 0 || i === n))) label(px, y + 26, v.fractionDen && i > 0 && i < n ? `${i}/${v.fractionDen}` : String(+val.toFixed(3)), 12);
      }
      for (const m of v.marks || []) { const px = x + ((m - v.min) / (v.max - v.min)) * w; o.push(ellipse(px, y + 16, 6, 6, { fill: acc2 })); }
      return { objs: o, h: 48 };
    }
    case 'fraction': {
      if (v.shape === 'circle') {
        const R = 40, cx = x + R, cy = y + R;
        o.push(ellipse(cx, cy, R, R, { fill: th.paper, stroke: ink, strokeWidth: 1.5 }));
        for (let i = 0; i < v.parts; i++) {
          const a0 = -Math.PI / 2 + (i / v.parts) * 2 * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / v.parts) * 2 * Math.PI;
          const p = (a: number) => `${(R + Math.cos(a) * R).toFixed(2)},${(R + Math.sin(a) * R).toFixed(2)}`;
          o.push(svgPath(`M${R},${R} L${p(a0)} A${R},${R} 0 ${1 / v.parts > 0.5 ? 1 : 0} 1 ${p(a1)} Z`, x, y, R * 2, R * 2, { fill: i < v.shaded ? acc : 'none', stroke: ink, strokeWidth: 1.2, opacity: 1 }));
        }
        return { objs: o, h: R * 2 + 6 };
      }
      const w = Math.min(360, v.parts * 48), cw = w / v.parts;
      for (let i = 0; i < v.parts; i++) o.push(rect(x + i * cw, y, cw, 34, { fill: i < v.shaded ? acc : th.paper, stroke: ink, strokeWidth: 1.5 }));
      return { objs: o, h: 40 };
    }
    case 'array': {
      const sp = 18;
      for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) o.push(ellipse(x + c * sp + 7, y + r * sp + 7, 6, 6, { fill: acc }));
      return { objs: o, h: v.rows * sp + 6 };
    }
    case 'shape': {
      const s = 70, cx = x + s / 2, cy = y + s / 2;
      const reg = (k: number, rot = -Math.PI / 2) => { const pts: number[] = []; for (let i = 0; i < k; i++) { const a = rot + (i * 2 * Math.PI) / k; pts.push(cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48); } return poly(pts, { fill: th.wash, stroke: acc, strokeWidth: 2.5 }); };
      const st = { fill: th.wash, stroke: acc, strokeWidth: 2.5 };
      switch (v.shape) {
        case 'circle': o.push(ellipse(cx, cy, s * 0.48, s * 0.48, st)); break;
        case 'square': o.push(rect(x + 4, y + 4, s - 8, s - 8, st)); break;
        case 'rectangle': o.push(rect(x, y + 14, s + 30, s - 28, st)); break;
        case 'triangle': o.push(reg(3)); break;
        case 'pentagon': o.push(reg(5)); break;
        case 'hexagon': o.push(reg(6, 0)); break;
        case 'rhombus': o.push(poly([cx, y, x + s, cy, cx, y + s, x, cy], st)); break;
        case 'trapezoid': o.push(poly([x + 18, y + 12, x + s - 4, y + 12, x + s + 14, y + s - 12, x, y + s - 12], st)); break;
        case 'cube': o.push(rect(x, y + 18, 50, 50, st), poly([x, y + 18, x + 18, y, x + 68, y, x + 50, y + 18], { ...st, fill: th.paper }), poly([x + 50, y + 18, x + 68, y, x + 68, y + 50, x + 50, y + 68], { ...st, fill: th.paper })); break;
        case 'cylinder': o.push(rect(x + 5, y + 10, 60, 50, { fill: th.wash }), line(x + 5, y + 10, x + 5, y + 60, acc, 2.5), line(x + 65, y + 10, x + 65, y + 60, acc, 2.5), ellipse(cx, y + 60, 30, 9, st), ellipse(cx, y + 10, 30, 9, st)); break;
        case 'cone': o.push(poly([cx, y, x + 65, y + 60, x + 5, y + 60], st), ellipse(cx, y + 60, 30, 9, st)); break;
        case 'sphere': o.push(ellipse(cx, cy, 34, 34, st), ellipse(cx, cy, 34, 9, { stroke: acc, strokeWidth: 1.2, strokeDash: [4, 3] })); break;
      }
      return { objs: o, h: s + 6 };
    }
    case 'clock': {
      const R = 52, cx = x + R, cy = y + R;
      o.push(ellipse(cx, cy, R, R, { fill: th.paper, stroke: ink, strokeWidth: 2.5 }));
      for (let k = 1; k <= 12; k++) { const a = (k / 12) * 2 * Math.PI - Math.PI / 2; label(cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13) - 8, String(k), 12, 22); }
      for (let k = 0; k < 60; k += 5) { const a = (k / 60) * 2 * Math.PI; o.push(line(cx + Math.sin(a) * (R - 3), cy - Math.cos(a) * (R - 3), cx + Math.sin(a) * (R - 1), cy - Math.cos(a) * (R - 1), ink, 1)); }
      const ma = (v.m / 60) * 2 * Math.PI, ha = (((v.h % 12) + v.m / 60) / 12) * 2 * Math.PI;
      o.push(line(cx, cy, cx + Math.sin(ha) * R * 0.5, cy - Math.cos(ha) * R * 0.5, ink, 4));
      o.push(line(cx, cy, cx + Math.sin(ma) * R * 0.8, cy - Math.cos(ma) * R * 0.8, acc, 2.5));
      o.push(ellipse(cx, cy, 3.5, 3.5, { fill: ink }));
      return { objs: o, h: R * 2 + 6 };
    }
    case 'base10': {
      let cx = x;
      for (let i = 0; i < v.hundreds; i++) { o.push(rect(cx, y, 60, 60, { fill: th.wash, stroke: acc, strokeWidth: 1.5 })); for (let k = 1; k < 10; k++) { o.push(line(cx + k * 6, y, cx + k * 6, y + 60, acc, 0.6), line(cx, y + k * 6, cx + 60, y + k * 6, acc, 0.6)); } cx += 66; }
      for (let i = 0; i < v.tens; i++) { o.push(rect(cx, y, 7, 60, { fill: th.wash, stroke: acc, strokeWidth: 1.2 })); cx += 11; }
      cx += 6;
      for (let i = 0; i < v.ones; i++) { o.push(rect(cx + (i % 5) * 10, y + 40 + Math.floor(i / 5) * 10, 7, 7, { fill: th.wash, stroke: acc, strokeWidth: 1.2 })); }
      return { objs: o, h: 66 };
    }
    case 'coins': {
      const R: Record<string, number> = { quarter: 20, nickel: 17, penny: 15, dime: 13 };
      const V: Record<string, string> = { quarter: '25¢', nickel: '5¢', penny: '1¢', dime: '10¢' };
      let cx = x;
      for (const c of v.coins) { const r = R[c]; o.push(ellipse(cx + r, y + 22, r, r, { fill: c === 'penny' ? '#E7B48A' : '#DADDE2', stroke: ink, strokeWidth: 1.2 })); label(cx + r, y + 14, V[c], 11, 34); cx += r * 2 + 8; }
      return { objs: o, h: 48 };
    }
    case 'gridRect': {
      const c = Math.min(26, 260 / Math.max(v.w, v.h));
      o.push(rect(x, y, v.w * c, v.h * c, { fill: th.wash, stroke: acc, strokeWidth: 2 }));
      if (v.showGrid) { for (let i = 1; i < v.w; i++) o.push(line(x + i * c, y, x + i * c, y + v.h * c, acc, 0.8)); for (let j = 1; j < v.h; j++) o.push(line(x, y + j * c, x + v.w * c, y + j * c, acc, 0.8)); }
      return { objs: o, h: v.h * c + 6 };
    }
    case 'coord': {
      const n = v.size, c = Math.min(22, 220 / n);
      for (let i = 0; i <= n; i++) { o.push(line(x + i * c, y, x + i * c, y + n * c, '#C9CED6', 0.8), line(x, y + i * c, x + n * c, y + i * c, '#C9CED6', 0.8)); }
      o.push(line(x, y + n * c, x + n * c, y + n * c, ink, 2), line(x, y, x, y + n * c, ink, 2));
      for (let i = 0; i <= n; i += n > 8 ? 2 : 1) { label(x + i * c, y + n * c + 3, String(i), 10, 20); label(x - 12, y + (n - i) * c - 7, String(i), 10, 20); }
      for (const [px, py, l] of v.points) { o.push(ellipse(x + px * c, y + (n - py) * c, 5, 5, { fill: acc2 })); if (l) label(x + px * c + 12, y + (n - py) * c - 18, l, 13, 20); }
      return { objs: o, h: n * c + 22 };
    }
    case 'barModel': {
      const tot = v.parts.reduce((s, p) => s + p.size, 0) || 1, w = 380;
      let cx = x;
      v.parts.forEach((p, i) => { const pw = Math.max(36, (p.size / tot) * w); o.push(rect(cx, y + 22, pw, 30, { fill: i % 2 ? th.paper : th.wash, stroke: acc, strokeWidth: 1.6 })); label(cx + pw / 2, y + 28, p.label, 13, pw); cx += pw; });
      if (v.total) { o.push(line(x, y + 12, cx, y + 12, ink, 1.2), line(x, y + 8, x, y + 16, ink, 1.2), line(cx, y + 8, cx, y + 16, ink, 1.2)); label((x + cx) / 2, y - 6, v.total, 13, 60); }
      return { objs: o, h: 58 };
    }
    case 'tally': {
      let cx = x;
      for (let g = 0; g < Math.ceil(v.n / 5); g++) { const k = Math.min(5, v.n - g * 5); for (let i = 0; i < Math.min(4, k); i++) o.push(line(cx + i * 8, y, cx + i * 8, y + 30, ink, 2.2)); if (k === 5) o.push(line(cx - 4, y + 24, cx + 28, y + 6, acc, 2.2)); cx += 46; }
      return { objs: o, h: 36 };
    }
    case 'barChart': {
      const H = 120, bw = 54, max = Math.max(...v.values, v.scale);
      const top = Math.ceil(max / v.scale) * v.scale;
      o.push(line(x + 30, y, x + 30, y + H, ink, 1.5), line(x + 30, y + H, x + 30 + v.labels.length * (bw + 22) + 10, y + H, ink, 1.5));
      for (let t2 = 0; t2 <= top; t2 += v.scale * Math.max(1, Math.round(top / v.scale / 6))) { const py = y + H - (t2 / top) * H; o.push(line(x + 26, py, x + 30 + v.labels.length * (bw + 22) + 10, py, '#D5D9DF', 0.7)); label(x + 10, py - 7, String(t2), 10, 26); }
      v.values.forEach((val, i) => { const bh = (val / top) * H; const bx = x + 44 + i * (bw + 22); o.push(rect(bx, y + H - bh, bw, bh, { fill: i % 2 ? acc2 : acc, opacity: 0.85 })); label(bx + bw / 2, y + H + 4, v.labels[i], 11, bw + 16); });
      return { objs: o, h: H + 26 };
    }
    case 'angle': {
      const vx = x + (v.degrees > 90 ? 100 : 10), vy = y + 70, L = 90, a = (v.degrees * Math.PI) / 180;
      o.push(line(vx, vy, vx + L, vy, ink, 2.5), line(vx, vy, vx + Math.cos(a) * L, vy - Math.sin(a) * L, ink, 2.5));
      const r = 22, end = `${(r + Math.cos(a) * r).toFixed(2)},${(r - Math.sin(a) * r).toFixed(2)}`;
      o.push(svgPath(`M${r * 2},${r} A${r},${r} 0 ${v.degrees > 180 ? 1 : 0} 0 ${end}`, vx - r, vy - r, r * 2, r * 2, { stroke: acc, strokeWidth: 2 }));
      return { objs: o, h: 80 };
    }
    case 'rightTriangle': {
      o.push(poly([x, y + 90, x + 130, y + 90, x, y], { fill: th.wash, stroke: acc, strokeWidth: 2 }), rect(x, y + 78, 12, 12, { stroke: ink, strokeWidth: 1 }));
      label(x - 18, y + 38, v.a, 13, 30); label(x + 65, y + 94, v.b, 13, 40); label(x + 78, y + 30, v.c, 13, 40);
      return { objs: o, h: 114 };
    }
    case 'prism': {
      const s = Math.min(14, 150 / Math.max(v.l, v.h, v.w)), L = v.l * s, Hh = v.h * s, D = v.w * s * 0.5;
      o.push(rect(x, y + D, L, Hh, { fill: th.wash, stroke: acc, strokeWidth: 2 }), poly([x, y + D, x + D, y, x + L + D, y, x + L, y + D], { fill: th.paper, stroke: acc, strokeWidth: 2 }), poly([x + L, y + D, x + L + D, y, x + L + D, y + Hh, x + L, y + D + Hh], { fill: th.paper, stroke: acc, strokeWidth: 2 }));
      label(x + L / 2, y + D + Hh + 2, `${v.l}`, 12, 30); label(x + L + D + 16, y + Hh / 2, `${v.h}`, 12, 30); label(x + L + D / 2 + 12, y + D / 2 - 14, `${v.w}`, 12, 30);
      return { objs: o, h: D + Hh + 22 };
    }
  }
  return { objs: o, h: 0 };
}

// ── page composition ────────────────────────────────────────────────────────

const intlLine = (ws: Worksheet) => {
  const short = (c: string) => c.replace(/^CCSS\.(MATH\.CONTENT|ELA-LITERACY)\./, '');
  return [`CCSS ${ws.ccss.slice(0, 3).map(short).join(', ')}`, ws.intl.uk && `England ${ws.intl.uk}`, ws.intl.cambridge && `Cambridge ${ws.intl.cambridge}`, ws.intl.ib && ws.intl.ib, ws.intl.singapore && `Singapore ${ws.intl.singapore}`].filter(Boolean).join('  ·  ').slice(0, 250);
};

const TIER_MARK = { support: '●', core: '◆', stretch: '▲' } as const;

export interface LayoutResult { doc: TelaDoc; pages: LaidPage[]; theme: WorksheetTheme }

export function worksheetToTela(ws: Worksheet, opts: { ownerId?: string; includeKey?: boolean; now?: number } = {}): LayoutResult {
  seq = 0;
  const th = resolveTheme(ws);
  const s = ws.profile.supports || {};
  const ids = new Set(ws.profile.identities || []);
  const g = gradeNum(ws.grade);
  const dys = ids.has('dyslexic');
  const baseSize = (g <= 1 ? 19 : g <= 3 ? 16 : g <= 5 ? 14.5 : 13.5) + (s.textSize === 2 ? 4 : s.textSize === 1 ? 2 : 0) + (s.easyRead || dys ? 1.5 : 0);
  const t: Type = { body: dys ? 'Lexend, Verdana, sans-serif' : `${th.bodyFont}, Inter, sans-serif`, head: `${th.headFont}, Outfit, sans-serif`, size: baseSize, lh: s.easyRead || dys ? 1.7 : 1.42, charW: dys ? 0.58 : 0.53 };
  const listen = !!(s.readQuestions || s.readAloud || dys);
  const showHints = ws.profile.tier === 'support' && !/assess/i.test(ws.lessonId) && !/Assessment|Unit Check/.test(ws.title);
  const docId = `ws_${ws.id.replace(/[^a-z0-9]/gi, '_')}`;
  const pages: LaidPage[] = [];
  let page: LaidPage, y = 0, itemNo = 0;
  const totalSections = ws.sections.filter(x => x.kind !== 'reflect').length;
  let sectionIdx = 0;

  const startPage = (first: boolean) => {
    page = { id: `${docId}_p${pages.length + 1}`, objects: [], fields: [] };
    pages.push(page);
    const o = page.objects;
    o.push(rect(0, 0, PAGE_W, PAGE_H, { fill: th.paper, templateRole: 'GROUND' }));
    if (first) {
      const hh = 176;
      if (th.header === 'band') { o.push(rect(0, 0, PAGE_W, hh, { fill: th.wash, templateRole: 'GROUND' })); o.push(...motif(th.motif, PAGE_W * 0.52, 8, PAGE_W * 0.46, hh - 70, th, ws.id, s.calm ? 0.4 : 1)); }
      else if (th.header === 'arch') { o.push(svgPath(`M0,0 L${PAGE_W},0 L${PAGE_W},${hh - 40} Q${PAGE_W / 2},${hh + 30} 0,${hh - 40} Z`, 0, 0, PAGE_W, hh, { fill: th.wash })); o.push(...motif(th.motif, 20, 6, PAGE_W - 40, 60, th, ws.id, s.calm ? 0.4 : 1)); }
      else if (th.header === 'ribbon') { o.push(...motif(th.motif, 0, 0, PAGE_W, 26, th, ws.id, s.calm ? 0.4 : 1)); o.push(rect(M - 8, 40, 260, 24, { fill: th.accent, rx: 4 })); }
      else { o.push(rect(16, 16, PAGE_W - 32, PAGE_H - 32, { stroke: th.accent, strokeWidth: 2.5, rx: 6 }), rect(22, 22, PAGE_W - 44, PAGE_H - 44, { stroke: th.accent2, strokeWidth: 0.8, rx: 4 })); o.push(...motif(th.motif, PAGE_W * 0.55, 30, PAGE_W * 0.4, 70, th, ws.id, s.calm ? 0.4 : 1)); }
      const kickColor = th.header === 'ribbon' ? '#FFFFFF' : th.accent;
      o.push(text(M, 44, 520, `${GRADE_LABEL[ws.grade].toUpperCase()} · ${ws.subject === 'math' ? 'MATHEMATICS' : 'ENGLISH LANGUAGE ARTS'}`, t, { size: 10.5, fill: kickColor, fontWeight: 700, letterSpacing: 0.12, fontFamily: t.head, templateRole: 'KICKER' }));
      const titleSize = ws.title.length > 52 ? 22 : g <= 2 ? 30 : 27;
      const title = text(M, 66, CONTENT_W - 150, ws.title, { ...t, charW: 0.6, lh: 1.12 }, { size: titleSize, fill: th.ink, fontWeight: 700, fontFamily: t.head, lineHeight: 1.12, templateRole: 'HEADLINE' });
      o.push(title);
      o.push(text(M, Math.min(150, title.y + title.h + 2), CONTENT_W - 150, ws.kicker, t, { size: 11.5, fill: th.ink, opacity: 0.7, templateRole: 'DECK' }));
      // Tier is a quiet shape, never a word on the student copy: the class sees one worksheet, not three groups.
      o.push(text(PAGE_W - M - 28, 46, 28, TIER_MARK[ws.profile.tier], t, { size: 14, fill: th.accent, textAlign: 'right' }));
      y = hh + 4;
      o.push(text(M, y, 50, 'Name', t, { size: 12, fill: th.ink, fontWeight: 600 }), line(M + 44, y + 16, M + 360, y + 16, th.ink, 1));
      o.push(text(M + 390, y, 50, 'Date', t, { size: 12, fill: th.ink, fontWeight: 600 }), line(M + 430, y + 16, PAGE_W - M, y + 16, th.ink, 1));
      y += 34;
      const target = text(M + 14, y + 9, CONTENT_W - 28, `Today’s target: ${ws.objective}`, t, { size: Math.max(13, t.size - 1), fill: th.ink, fontWeight: 600 });
      o.push(rect(M, y, CONTENT_W, target.h + 16, { fill: th.wash, rx: 10, stroke: th.accent, strokeWidth: 1.2 }), target);
      y += target.h + 26;
      const badges = [listen ? '🔊 Listen to any question' : '', s.untimed ? '⏳ Untimed' : ws.minutes ? `⏱ About ${ws.minutes} min` : '', s.retryFree ? '↺ Try-again boxes' : ''].filter(Boolean).join('     ');
      if (badges) { o.push(text(M, y, CONTENT_W, badges, t, { size: 11, fill: th.ink, opacity: 0.75 })); y += 22; }
    } else {
      o.push(rect(0, 0, PAGE_W, 44, { fill: th.wash }));
      o.push(text(M, 14, 480, ws.title, t, { size: 12, fill: th.ink, fontWeight: 700, fontFamily: t.head }));
      o.push(text(PAGE_W - M - 230, 14, 50, 'Name', t, { size: 11, fill: th.ink }), line(PAGE_W - M - 190, 28, PAGE_W - M, 28, th.ink, 0.8));
      y = 64;
    }
    if (s.chunk || ids.has('adhd')) {
      for (let i = 0; i < totalSections; i++) o.push(ellipse(PAGE_W - M - (totalSections - i) * 16 + 6, first ? 72 : 52, 5, 5, { fill: i < sectionIdx ? th.accent : 'none', stroke: th.accent, strokeWidth: 1.4 }));
    }
  };

  const room = (h: number) => y + h <= PAGE_H - FOOT - 8;
  const ensure = (h: number) => { if (!room(h)) startPage(false); };
  const field = (f: Omit<TelaField, 'layout'>, x: number, yy: number, w: number, h: number) =>
    page.fields.push({ ...f, layout: { x: (x / PAGE_W) * 100, y: (yy / PAGE_H) * 100, w: (w / PAGE_W) * 100, h: (h / PAGE_H) * 100, pageId: page.id } });

  const sectionHead = (sec: WsSection) => {
    const dir = text(M, 0, CONTENT_W, sec.directions, t, { size: Math.max(12, t.size - 2), fill: th.ink, opacity: 0.8, fontStyle: 'italic' });
    ensure(40 + dir.h + 100); // keep the heading with at least its first item
    const label = sec.title;
    const pillW = Math.min(CONTENT_W, 24 + label.length * 8.6);
    page.objects.push(rect(M, y, pillW, 28, { fill: sec.kind === 'challenge' ? th.accent2 : th.accent, rx: 14 }));
    page.objects.push(text(M + 12, y + 6, pillW - 16, label, t, { size: 13.5, fill: '#FFFFFF', fontWeight: 700, fontFamily: t.head }));
    if (listen) page.objects.push(text(M + pillW + 8, y + 5, 24, '🔊', t, { size: 14 }));
    y += 36;
    dir.y = y; page.objects.push(dir); y += dir.h + 6;
  };

  const passageBlock = (p: Passage) => {
    const paras = p.text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    const isPoem = p.genre === 'poetry';
    const pt: Type = { ...t, size: t.size + (g <= 1 ? 2 : 0.5), lh: t.lh + 0.08 };
    ensure(80);
    page.objects.push(text(M, y, CONTENT_W, `${p.origin}`, t, { size: 10.5, fill: th.accent, fontStyle: 'italic' }));
    y += 20;
    for (const para of paras) {
      const heading = /^##\s+/.test(para);
      const body = para.replace(/^##\s+/, '');
      const txt = text(M + 18, 0, CONTENT_W - 36, isPoem ? body : body.replace(/\n/g, ' '), pt, { fill: th.ink, fontWeight: heading ? 700 : 400, fontFamily: heading ? t.head : pt.body });
      if (isPoem) { txt.blocks = body.split('\n').map(l => ({ id: nid('b'), kind: 'p' as const, text: l })); txt.h = body.split('\n').length * pt.size * pt.lh * 1.25 + 6; }
      ensure(txt.h + 10);
      page.objects.push(rect(M, y - 4, 4, txt.h + 6, { fill: th.accent2, opacity: 0.6 }));
      txt.y = y; page.objects.push(txt); y += txt.h + 8;
    }
    if (p.vocab.length) {
      const gl = text(M + 12, 0, CONTENT_W - 24, `Words to know: ${p.vocab.map(([w, d]) => `${w} — ${d}`).join('   ·   ')}`, t, { size: Math.max(11.5, t.size - 2.5), fill: th.ink });
      ensure(gl.h + 22);
      page.objects.push(rect(M, y, CONTENT_W, gl.h + 14, { fill: th.wash, rx: 8 })); gl.y = y + 7; page.objects.push(gl); y += gl.h + 24;
    }
  };

  const organizer = (labels: string[]) => {
    const cols = labels.length > 3 ? 2 : labels.length;
    const bw = (CONTENT_W - (cols - 1) * 12) / cols, bh = g <= 1 ? 110 : 92;
    const rows = Math.ceil(labels.length / cols);
    ensure(rows * (bh + 12));
    labels.forEach((l, i) => {
      const bx = M + (i % cols) * (bw + 12), by = y + Math.floor(i / cols) * (bh + 12);
      page.objects.push(rect(bx, by, bw, bh, { stroke: th.accent, strokeWidth: 1.4, rx: 10, fill: th.paper }));
      page.objects.push(text(bx + 10, by + 8, bw - 20, l, t, { size: 12, fill: th.accent, fontWeight: 700 }));
      field({ id: `${docId}_org${i}_${pages.length}`, name: l, type: 'TEXT', semanticRole: 'RESPONSE', validation: { mode: 'MANUAL' } }, bx + 6, by + 26, bw - 12, bh - 32);
    });
    y += rows * (bh + 12) + 4;
  };

  const workedBox = (sec: WsSection) => {
    const ex = sec.example!;
    const lines = [ex.prompt, ...ex.steps.map((st, i) => `${i + 1}. ${st}`)];
    const objs = lines.map((l, i) => text(M + 16, 0, CONTENT_W - 32, l, t, { size: t.size - (i ? 0.5 : 0), fill: th.ink, fontWeight: i ? 400 : 700 }));
    const vis = ex.visual ? visual(ex.visual, M + 16, 0, th, t) : null;
    const h = objs.reduce((n, o) => n + o.h + 2, 0) + (vis ? vis.h + 10 : 0) + 22;
    ensure(h);
    page.objects.push(rect(M, y, CONTENT_W, h, { fill: th.wash, rx: 12, stroke: th.accent, strokeWidth: 1, strokeDash: [5, 4] }));
    let yy = y + 11;
    objs.forEach((o, i) => { o.y = yy; page.objects.push(o); yy += o.h + 2; if (i === 0 && vis) { const v2 = visual(ex.visual!, M + 16, yy + 2, th, t); page.objects.push(...v2.objs); yy += v2.h + 8; } });
    y += h + 12;
  };

  const compactGrid = (sec: WsSection) => sec.items.length >= 4 && sec.items.every(it => it.kind === 'answer' && !it.visual && plain(it.prompt).length <= 34 && !it.lines);

  const itemBlock = (it: WsItem, x: number, w: number, compact: boolean): number => {
    // Measure first, then place: returns the height used.
    const n = ++itemNo;
    const prompt = text(x + 34, 0, w - 34 - (compact ? 130 : 0), it.prompt, t, { fill: th.ink });
    // Support pages print the hint under the question; other tiers keep hints for the digital copy and the teacher.
    const hint = showHints && it.hint && !compact ? text(x + 40, 0, w - 40, `Hint: ${it.hint}`, t, { size: Math.max(11, t.size - 2.5), fill: th.accent, fontStyle: 'italic' }) : null;
    const vis = it.visual ? visual(it.visual, x + 40, 0, th, t) : null;
    const choiceRows = it.kind === 'choice' || it.kind === 'sort' ? layoutChoices(it, w - 40) : null;
    const writeLines = it.kind === 'write' ? Math.max(1, it.lines || 2) : 0;
    const lineGap = t.size * 2.05;
    const answerH = it.kind === 'answer' || it.kind === 'fill' ? (compact ? 0 : t.size * 2.4) : 0;
    const h = Math.max(prompt.h, 26) + (hint ? hint.h + 2 : 0) + (vis ? vis.h + 10 : 0) + (choiceRows ? choiceRows.h + 4 : 0) + writeLines * lineGap + answerH + (s.retryFree && answerH ? 0 : 0) + 12;
    if (!compact) ensure(h);
    const top = compact ? y : y;
    const o = page.objects;
    if (s.lineFocus && n % 2 === 0) o.push(rect(x - 6, top - 4, w + 12, h - 2, { fill: th.wash, opacity: 0.55, rx: 6 }));
    o.push(ellipse(x + 13, top + 12, 12.5, 12.5, { fill: it.level === 3 ? th.accent2 : th.accent }));
    o.push(text(x + 1, top + 4, 24, String(n), t, { size: 12, fill: '#FFFFFF', fontWeight: 700, textAlign: 'center', fontFamily: t.head }));
    prompt.y = top + 2; prompt.semanticRole = 'QUESTION'; o.push(prompt);
    let yy = top + Math.max(prompt.h, 26) + 4;
    if (hint) { hint.y = yy - 2; o.push(hint); yy += hint.h; }
    if (vis) { const v2 = visual(it.visual!, x + 40, yy + 2, th, t); o.push(...v2.objs); yy += v2.h + 10; }
    const fid = `${docId}_${it.id}_${n}`;
    const validation: TelaField['validation'] = it.kind === 'write' ? { mode: 'MANUAL' } : it.kind === 'choice' ? { mode: 'CHOICE', expected: it.answer } : it.numeric ? { mode: 'NUMERIC_TOLERANCE', expected: it.answer, tolerance: it.tolerance || 0 } : { mode: 'EXACT', expected: it.answer };
    if (it.kind === 'answer' || it.kind === 'fill') {
      const bw = compact ? 110 : Math.min(220, Math.max(120, it.answer.length * 12 + 40));
      const bx = compact ? x + w - bw : x + 40, by = compact ? top + 1 : yy;
      o.push(rect(bx, by, bw, t.size * 1.9, { stroke: th.ink, strokeWidth: 1.2, rx: 6, fill: '#FFFFFF', semanticRole: 'RESPONSE_GUIDE', assignmentFieldId: fid }));
      field({ id: fid, name: `${n}. ${plain(it.prompt).slice(0, 60)}`, type: it.numeric ? 'NUMBER' : 'TEXT', semanticRole: 'RESPONSE', validation }, bx, by, bw, t.size * 1.9);
      if (s.retryFree) { o.push(rect(bx + bw + 10, by, 90, t.size * 1.9, { stroke: th.ink, strokeWidth: 0.8, strokeDash: [4, 3], rx: 6 })); o.push(text(bx + bw + 14, by - 13, 90, 'try again', t, { size: 9.5, fill: th.ink, opacity: 0.6 })); }
      yy += compact ? 0 : t.size * 2.4;
    } else if (choiceRows) {
      choiceRows.place(x + 40, yy, o);
      field({ id: fid, name: `${n}. ${plain(it.prompt).slice(0, 60)}`, type: it.kind === 'sort' ? 'TEXT' : 'SELECT', options: it.kind === 'sort' ? undefined : it.choices, semanticRole: 'RESPONSE', validation }, x + 40, yy, w - 40, choiceRows.h);
      yy += choiceRows.h + 4;
    } else if (writeLines) {
      for (let i = 0; i < writeLines; i++) { const ly = yy + (i + 1) * lineGap - 6; o.push(line(x + 40, ly, x + w, ly, '#9AA3AE', 0.9)); if (g <= 2) o.push(line(x + 40, ly - lineGap / 2 + 2, x + w, ly - lineGap / 2 + 2, '#C9D2DC', 0.6, { strokeDash: [3, 4] })); }
      o.push(rect(x + 40, yy, w - 40, writeLines * lineGap, { semanticRole: 'RESPONSE_GUIDE', assignmentFieldId: fid }));
      field({ id: fid, name: `${n}. ${plain(it.prompt).slice(0, 60)}`, type: 'TEXT', semanticRole: 'RESPONSE', validation }, x + 40, yy, w - 40, writeLines * lineGap);
      yy += writeLines * lineGap;
    }
    return compact ? Math.max(prompt.h, t.size * 1.9) + 14 : yy - top + 10;
  };

  function layoutChoices(it: WsItem, w: number) {
    const choices = it.choices || [];
    const letters = 'ABCDE';
    const short = choices.every(c => c.length <= 16) && choices.length <= 5;
    const cw = short ? Math.min(w / choices.length, 170) : w;
    const rowH = t.size * t.lh + 8;
    const labels = choices.map(c => text(0, 0, cw - 34, c, t, { fill: th.ink }));
    const heights = labels.map(l => Math.max(rowH, l.h + 6));
    const h = short ? Math.max(...heights) : heights.reduce((a, b) => a + b, 0);
    return {
      h,
      place: (x0: number, y0: number, o: TelaVectorObject[]) => {
        let yy = y0;
        choices.forEach((c, i) => {
          const cx = short ? x0 + i * cw : x0, cy = short ? y0 : yy;
          if (it.kind === 'sort') o.push(rect(cx, cy + 2, 20, 20, { stroke: th.ink, strokeWidth: 1.3, rx: 3, fill: '#FFFFFF' }));
          else { o.push(ellipse(cx + 10, cy + 12, 10, 10, { stroke: th.accent, strokeWidth: 1.6, fill: '#FFFFFF' })); o.push(text(cx + 2, cy + 4, 16, letters[i], t, { size: 10, fill: th.accent, fontWeight: 700, textAlign: 'center' })); }
          const l = labels[i]; l.x = cx + 28; l.y = cy + 2; o.push(l);
          if (!short) yy += heights[i];
        });
      },
    };
  }

  startPage(true);
  for (const sec of ws.sections) {
    if (sec.ownPage && pages.length && y > 330) startPage(false);
    sectionHead(sec);
    if (sec.kind === 'worked' && sec.example) workedBox(sec);
    if (sec.passageId) { const p = passageById(sec.passageId); if (p) passageBlock(p); }
    if (sec.organizer) organizer(sec.organizer);
    if (compactGrid(sec)) {
      const colW = (CONTENT_W - 24) / 2;
      for (let i = 0; i < sec.items.length; i += 2) {
        const rowH = t.size * 1.9 + 16;
        ensure(rowH);
        const h1 = itemBlock(sec.items[i], M, colW, true);
        const h2 = sec.items[i + 1] ? itemBlock(sec.items[i + 1], M + colW + 24, colW, true) : 0;
        y += Math.max(h1, h2);
      }
    } else for (const it of sec.items) { const used = itemBlock(it, M, CONTENT_W, false); y += used; } // itemBlock may start a new page (resets y), so read y after it
    if (sec.checkpoint) { ensure(30); page!.objects.push(text(M, y, CONTENT_W, `✓ ${sec.checkpoint}`, t, { size: 12, fill: th.accent, fontWeight: 600 })); y += 26; }
    if (sec.kind !== 'reflect') sectionIdx++;
    y += 10;
  }

  // Footers, once page count is known.
  pages.forEach((p, i) => {
    p.objects.push(line(M, PAGE_H - FOOT + 6, PAGE_W - M, PAGE_H - FOOT + 6, th.accent, 0.8, { opacity: 0.5 }));
    p.objects.push(text(M, PAGE_H - FOOT + 12, CONTENT_W - 150, intlLine(ws), { ...t, lh: 1.25, charW: 0.5 }, { size: 8, fill: th.ink, opacity: 0.65, templateRole: 'FOOTNOTE' }));
    p.objects.push(text(PAGE_W - M - 60, PAGE_H - FOOT + 14, 60, `${i + 1} / ${pages.length}`, t, { size: 9.5, fill: th.ink, opacity: 0.7, textAlign: 'right', templateRole: 'FOLIO' }));
    p.objects.push(text(PAGE_W - M - 150, PAGE_H - FOOT + 30, 150, 'Plajah Academia', t, { textAlign: 'right', size: 8.5, fill: th.accent, fontWeight: 700, letterSpacing: 0.1 }));  });

  if (opts.includeKey !== false) pages.push(keyPage(ws, th, t, docId));
  return { doc: assemble(ws, pages, th, docId, opts), pages, theme: th };
}

function keyPage(ws: Worksheet, th: WorksheetTheme, t: Type, docId: string): LaidPage {
  const o: TelaVectorObject[] = [rect(0, 0, PAGE_W, PAGE_H, { fill: '#FFFFFF' }), rect(0, 0, PAGE_W, 64, { fill: th.ink })];
  const kt: Type = { ...t, body: 'Inter, sans-serif', size: 11.5, lh: 1.35, charW: 0.52 };
  o.push(text(M, 20, 600, `Teacher key · ${ws.title}`, kt, { size: 17, fill: '#FFFFFF', fontWeight: 700 }));
  let y = 82;
  const ad = ws.adaptations.length ? ws.adaptations : ['On-level version, no individual adaptations.'];
  o.push(text(M, y, CONTENT_W, 'This version', kt, { size: 12, fontWeight: 700, fill: th.accent })); y += 20;
  for (const a of ad) { const tx = text(M + 12, y, CONTENT_W - 12, `• ${a}`, kt, { fill: '#333' }); o.push(tx); y += tx.h; }
  y += 10;
  o.push(text(M, y, CONTENT_W, 'Answers', kt, { size: 12, fontWeight: 700, fill: th.accent })); y += 22;
  const rows = answerKey(ws);
  const colW = (CONTENT_W - 20) / 2;
  let col = 0, colTop = y;
  for (const r of rows) {
    const tx = text(M + col * (colW + 20), y, colW, `${r.n}. ${r.answer}`, kt, { fill: '#222' });
    if (y + tx.h > PAGE_H - 40) { if (col === 1) break; col = 1; y = colTop; tx.x = M + colW + 20; }
    tx.y = y; o.push(tx); y += tx.h + 1;
  }
  return { id: `${docId}_key`, objects: o, fields: [], teacher: true };
}

function assemble(ws: Worksheet, pages: LaidPage[], th: WorksheetTheme, docId: string, opts: { ownerId?: string; now?: number }): TelaDoc {
  const now = opts.now ?? Date.now();
  const devices: Record<string, TelaDevice> = {};
  const frames: TelaFrame[] = [];
  const baseId = `${docId}_answers`;
  const allFields = pages.flatMap(p => p.fields);
  const baseDev: TelaBaseDevice = { id: baseId, type: 'BASE', name: `${ws.title} — answers`, fields: allFields, rows: [] };
  devices[baseId] = baseDev;
  pages.forEach((p, i) => {
    const vid = `${p.id}_art`;
    const vec: TelaVectorDevice = { id: vid, type: 'VECTOR', name: p.teacher ? 'Teacher key' : `Page ${i + 1}`, width: PAGE_W, height: PAGE_H, objects: p.objects };
    devices[vid] = vec;
    const deviceIds = [vid];
    if (p.fields.length) {
      const fid = `${p.id}_form`;
      const form: TelaFormDevice = { id: fid, type: 'FORM', baseDeviceId: baseId, title: ws.title, presentation: 'POSITIONED', pageDeviceId: vid };
      devices[fid] = form; deviceIds.push(fid);
    }
    frames.push({ id: p.id, kind: 'PAPER', preset: 'LETTER', x: 80 + i * (PAGE_W + 80), y: 80, w: PAGE_W, h: PAGE_H, deviceIds, label: p.teacher ? 'Teacher key' : `${ws.title} · page ${i + 1}`, orientation: 'PORTRAIT' });
  });
  return { id: docId, ownerId: opts.ownerId || 'plajah-academia', title: `${ws.title} (${GRADE_LABEL[ws.grade]})`, frames, devices, bindings: [], createdAt: now, updatedAt: now };
}

/** The day's lesson plan as a Tela Writer document (teacher-facing, editable). */
export function lessonPlanToTela(l: import('./types').DayLesson, ownerId = 'plajah-academia'): TelaDoc {
  const id = `plan_${l.id}`;
  const b = (kind: 'h1' | 'h2' | 'p' | 'li', text: string, i: number) => ({ id: `${id}_${i}`, kind, text });
  let i = 0;
  const blocks = [
    b('h1', l.title, i++), b('p', `${GRADE_LABEL[l.grade]} · ${l.subject === 'math' ? 'Math' : 'ELA'} · ${l.unitTitle} · Week ${l.week}, Day ${l.day} · ${l.minutes} min`, i++),
    b('p', `Target: ${l.objective}`, i++), b('p', `Standards: ${l.ccss.join(', ')}${l.intl.uk ? ` · England ${l.intl.uk}` : ''}${l.intl.cambridge ? ` · Cambridge ${l.intl.cambridge}` : ''}${l.intl.ib ? ` · ${l.intl.ib}` : ''}${l.intl.singapore ? ` · Singapore ${l.intl.singapore}` : ''}`, i++),
    b('h2', 'Warm-up', i++), b('p', l.warmUp, i++),
    b('h2', 'Mini-lesson', i++), b('li', `I do: ${l.miniLesson.iDo}`, i++), b('li', `We do: ${l.miniLesson.weDo}`, i++), b('li', `You do: ${l.miniLesson.youDo}`, i++),
    b('h2', 'Discussion', i++), b('p', l.discussion, i++), b('h2', 'Exit ticket', i++), b('p', l.exitTicket, i++),
    b('h2', 'Materials', i++), ...l.materials.map(m => b('li', m, i++)), b('h2', 'Vocabulary', i++), b('p', l.vocab.join(', '), i++),
  ];
  const wid = `${id}_writer`;
  return { id, ownerId, title: `Lesson plan · ${l.title}`, createdAt: 0, updatedAt: 0, devices: { [wid]: { id: wid, type: 'WRITER', mode: 'DOCUMENT', blocks } }, frames: [{ id: `${id}_frame`, kind: 'PAPER', preset: 'LETTER', x: 80, y: 80, w: PAGE_W, h: PAGE_H, deviceIds: [wid], label: l.title }] };
}
