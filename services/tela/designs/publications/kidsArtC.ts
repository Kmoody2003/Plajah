// kidsArtC — shared procedural-illustration kit for the art-driven picture books
// (story-city, story-folktale). Everything is built from shapes with single-line
// string literals; one PATH object may hold many sub-paths so a whole window grid
// or ornament border is ONE editable object, not 80.
import type { TelaVectorObject } from '../../../../types';
import { path, text, ellipse, circle, type ShapeOpts } from '../../templateKit';
import { oid, rng } from '../../ornaments';
import type { FontKey } from '../../telaFonts';

export type Pt = [number, number];
export const PW = 1024;
export const PH = 768;
const r1 = (n: number) => Math.round(n * 10) / 10;

// ── geometry ──────────────────────────────────────────────────────────────────
export function bboxOf(subs: Pt[][]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subs) for (const [x, y] of s) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** Any polygon / polyline / many sub-shapes as ONE path object, positioned at its own bounding box. */
export function shape(subs: Pt[][], fill: string, o: ShapeOpts & { open?: boolean } = {}): TelaVectorObject {
  const b = bboxOf(subs);
  const d = subs.map(s => 'M' + s.map(p => `${r1(p[0])} ${r1(p[1])}`).join(' L') + (o.open ? '' : ' Z')).join(' ');
  return path(b.x, b.y, b.w, b.h, d, fill, { ...o, origin: { x: b.x, y: b.y, w: b.w, h: b.h } });
}
export const poly = (pts: Pt[], fill: string, o: ShapeOpts = {}) => shape([pts], fill, o);
export const tri = (x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts = {}) => poly([[x + w / 2, y], [x + w, y + h], [x, y + h]], fill, o);
export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
/** Many rectangles in one object (a window grid, a stripe set). */
export const rectsObj = (rs: Array<[number, number, number, number]>, fill: string, o: ShapeOpts = {}) => shape(rs.map(r => rectPts(r[0], r[1], r[2], r[3])), fill, o);
export function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
/** A thick or thin open stroke through points. */
export const stroke = (pts: Pt[], color: string, width: number, o: ShapeOpts = {}) => shape([pts], 'none', { ...o, stroke: color, strokeWidth: width, open: true });
/** Many circles in one object (halftone dots, rivets, beads). */
export function dots(list: Array<[number, number, number]>, fill: string, o: ShapeOpts = {}): TelaVectorObject {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; let d = '';
  for (const [x, y, r] of list) {
    x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r);
    d += `M${r1(x - r)} ${r1(y)} a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0 a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0 Z `;
  }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  return path(x0, y0, w, h, d, fill, { ...o, origin: { x: x0, y: y0, w, h } });
}
/** Halftone field, dot radius graded across the box (dense one side, empty the other). */
export function halftone(x: number, y: number, w: number, h: number, step: number, rMax: number, fill: string, dir: 'up' | 'down' | 'left' | 'right', o: ShapeOpts = {}): TelaVectorObject {
  const list: Array<[number, number, number]> = [];
  const cols = Math.floor(w / step), rows = Math.floor(h / step);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = dir === 'down' ? r / Math.max(1, rows - 1) : dir === 'up' ? 1 - r / Math.max(1, rows - 1) : dir === 'right' ? c / Math.max(1, cols - 1) : 1 - c / Math.max(1, cols - 1);
    const rad = rMax * (1 - t);
    if (rad < .8) continue;
    list.push([x + c * step + step / 2 + (r % 2 ? step / 2 : 0), y + r * step + step / 2, rad]);
  }
  return dots(list.length ? list : [[x, y, 1]], fill, { ...o, label: o.label || 'Halftone dots' });
}
/** Copy of an object printed slightly out of register in another ink (multiply). */
export function ghost(obj: TelaVectorObject, dx: number, dy: number, color: string, opacity = .75): TelaVectorObject {
  return { ...obj, id: oid('ghost'), x: obj.x + dx, y: obj.y + dy, fill: color, gradient: undefined, stroke: 'none', strokeWidth: 0, shadow: undefined, blendMode: 'multiply', opacity, objectLabel: 'Off-register ink', templateRole: 'ORNAMENT' };
}
/** Paper-fibre speckle in a colour (wax resist / paper tooth). */
export function speckle(x: number, y: number, w: number, h: number, n: number, color: string, seed: number, rMax = 2.4, opacity = .6): TelaVectorObject {
  const r = rng(seed); const list: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) list.push([x + r() * w, y + r() * h, .6 + r() * rMax]);
  return dots(list, color, { opacity, label: 'Paper speckle' });
}

// ── lettering ─────────────────────────────────────────────────────────────────
export type AdvTable = Record<string, number>;
// Measured with Chrome canvas at 100px (advance width, hundredths of an em).
export const BUNGEE_ADV: AdvTable = { '0': 73, '1': 60, '2': 64, '3': 64, '4': 71, '5': 65, '6': 69, '7': 63, '8': 71, '9': 69, 'A': 73, 'B': 72, 'C': 63, 'D': 75, 'E': 65, 'F': 62, 'G': 71, 'H': 76, 'I': 60, 'J': 69, 'K': 75, 'L': 69, 'M': 85, 'N': 75, 'O': 74, 'P': 68, 'Q': 74, 'R': 74, 'S': 65, 'T': 66, 'U': 75, 'V': 73, 'W': 83, 'X': 74, 'Y': 70, 'Z': 66, '!': 42, '?': 66, "'": 36, ' ': 22, '&': 77, '.': 38, ',': 38, '-': 42 };
export const ALMENDRA_ADV: AdvTable = { '0': 46, '1': 32, '2': 42, '3': 38, '4': 43, '5': 39, '6': 43, '7': 39, '8': 43, '9': 43, 'A': 72, 'B': 69, 'C': 49, 'D': 73, 'E': 55, 'F': 47, 'G': 53, 'H': 70, 'I': 36, 'J': 41, 'K': 58, 'L': 46, 'M': 96, 'N': 70, 'O': 61, 'P': 56, 'Q': 61, 'R': 62, 'S': 49, 'T': 52, 'U': 69, 'V': 67, 'W': 93, 'X': 65, 'Y': 63, 'Z': 47, 'a': 53, 'b': 48, 'c': 40, 'd': 52, 'e': 43, 'f': 31, 'g': 50, 'h': 56, 'i': 24, 'j': 23, 'k': 51, 'l': 24, 'm': 83, 'n': 57, 'o': 48, 'p': 54, 'q': 49, 'r': 38, 's': 39, 't': 33, 'u': 56, 'v': 53, 'w': 77, 'x': 48, 'y': 56, 'z': 38, '!': 21, '?': 33, "'": 18, ' ': 18, '&': 61, '.': 21, ',': 21, '-': 36 };
const adv = (t: AdvTable, ch: string) => (t[ch] ?? t[ch.toUpperCase()] ?? 60) / 100;
export function measureRow(str: string, size: number, t: AdvTable, track = 0): number {
  let w = 0; for (const ch of str) w += adv(t, ch) * size + track; return w - track;
}

export interface LetterOpts {
  font: FontKey; adv: AdvTable; size: number; colors: string[]; stroke: string; sw: number; bounce?: number; rot?: number;
  shadow?: { x: number; y: number; color: string }; align?: 'left' | 'center'; track?: number; seed?: number; ghostColor?: string; weight?: number; label?: string; fat?: number;
}
/** Hand-lettered title: every letter its own object, bounced, tilted, coloured, outlined, shadowed. */
export function letterRow(str: string, x: number, y: number, o: LetterOpts): { objs: TelaVectorObject[]; w: number } {
  const r = rng(o.seed ?? 5); const objs: TelaVectorObject[] = [];
  const track = o.track ?? 0; const total = measureRow(str, o.size, o.adv, track);
  let cx = o.align === 'center' ? x - total / 2 : x; let ci = 0;
  for (const ch of str) {
    const aw = adv(o.adv, ch) * o.size;
    if (ch !== ' ') {
      const dy = ((ci % 2 ? 1 : -1) * (o.bounce ?? 0)) * (.5 + r() * .5);
      const rot = ((r() - .5) * 2) * (o.rot ?? 0);
      const color = o.colors[ci % o.colors.length];
      const boxW = aw + 6;
      const t = text(cx - 3, y + dy, boxW, ch, { size: o.size, font: o.font, weight: o.weight ?? 400, color, stroke: o.stroke, strokeWidth: o.sw, rotation: rot, align: 'center', wrap: false, shadow: o.shadow ? { x: o.shadow.x, y: o.shadow.y, blur: 0, color: o.shadow.color } : undefined, label: o.label || 'Title letter', role: 'HEADLINE' });
      if (o.ghostColor) objs.push(ghost(t, 5, 4, o.ghostColor, .7));
      if (o.fat) {
        // faux-bold for thin calligraphic faces: a dark fat silhouette (outline + shadow) under a fat coloured face
        const back = { ...t, id: oid('text'), fill: o.stroke, stroke: o.stroke, strokeWidth: o.sw + o.fat * 2, objectLabel: 'Title letter outline' };
        const front = { ...t, id: oid('text'), stroke: color, strokeWidth: o.fat, shadow: undefined, objectLabel: 'Title letter' };
        objs.push(back, front);
      } else objs.push(t);
      ci++;
    }
    cx += aw + track;
  }
  return { objs, w: total };
}

export function polylineLength(pts: Pt[]): number { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
export function pointAt(pts: Pt[], dist: number): { p: Pt; ang: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= dist || i === pts.length - 1) {
      const t = seg ? Math.min(1, (dist - acc) / seg) : 0;
      return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t], ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI };
    }
    acc += seg;
  }
  return { p: pts[pts.length - 1], ang: 0 };
}
/** Words riding a path: each letter sits on the line and turns with it. `lift` raises the baseline off the path. */
export function textOnPath(str: string, pts: Pt[], startDist: number, o: { font: FontKey; adv: AdvTable; size: number; color: string; weight?: number; stroke?: string; sw?: number; track?: number; lift?: number; label?: string; role?: TelaVectorObject['templateRole']; shadow?: { x: number; y: number; color: string } }): { objs: TelaVectorObject[]; end: number } {
  const objs: TelaVectorObject[] = []; let d = startDist; const track = o.track ?? 0;
  for (const ch of str) {
    const aw = adv(o.adv, ch) * o.size;
    if (ch !== ' ') {
      const { p, ang } = pointAt(pts, d + aw / 2);
      const rad = ang * Math.PI / 180;
      // box centre must sit half a size above the baseline point, rotated with the path
      const off = o.size * .5 + (o.lift ?? 0);
      const cx = p[0] + Math.sin(rad) * off, cy = p[1] - Math.cos(rad) * off;
      objs.push(text(cx - (aw + 6) / 2, cy - o.size / 2, aw + 6, ch, { size: o.size, font: o.font, weight: o.weight ?? 400, color: o.color, stroke: o.stroke, strokeWidth: o.sw, rotation: ang, align: 'center', wrap: false, shadow: o.shadow ? { x: o.shadow.x, y: o.shadow.y, blur: 0, color: o.shadow.color } : undefined, label: o.label || 'Text on path', role: o.role || 'BODY' }));
    }
    d += aw + track;
  }
  return { objs, end: d };
}

// ── faces ─────────────────────────────────────────────────────────────────────
/** A cartoon eye: white, outlined, a pupil that looks somewhere, a highlight. */
export function eye(cx: number, cy: number, r: number, ink: string, look: [number, number] = [0, 0], white = '#FFFFFF', lid = 0): TelaVectorObject[] {
  const px = cx + look[0] * r * .38, py = cy + look[1] * r * .38;
  const out: TelaVectorObject[] = [circle(cx, cy, r, white, { stroke: ink, strokeWidth: Math.max(2, r * .16), label: 'Eye' }), circle(px, py, r * .52, ink, { label: 'Pupil' }), circle(px - r * .16, py - r * .2, r * .17, '#FFFFFF', { label: 'Eye shine' })];
  if (lid > 0) out.push(shape([[[cx - r - 2, cy - r - 2], [cx + r + 2, cy - r - 2], [cx + r + 2, cy - r + 2 * r * lid], [cx - r - 2, cy - r + 2 * r * lid]]], white === '#FFFFFF' ? '#FFFFFF' : white, { label: 'Eyelid' }));
  return out;
}
/** Smile / frown: curve = +1 smile, -1 frown. */
export function smile(cx: number, cy: number, w: number, curve: number, ink: string, sw: number): TelaVectorObject {
  const pts: Pt[] = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([cx - w / 2 + w * t, cy + Math.sin(t * Math.PI) * w * .28 * curve]); }
  return stroke(pts, ink, sw, { label: curve >= 0 ? 'Smile' : 'Frown' });
}
/** Open mouth (a D shape) with a tongue. */
export function openMouth(cx: number, cy: number, w: number, h: number, ink: string, tongue: string): TelaVectorObject[] {
  const half = arcPts(cx, cy, w / 2, h, 0, 180, 18);
  return [poly(half, ink, { label: 'Open mouth' }), ellipse(cx - w * .24, cy + h * .5, w * .48, h * .5, tongue, { label: 'Tongue' })];
}
export const blush = (cx: number, cy: number, r: number, color: string) => ellipse(cx - r, cy - r * .62, r * 2, r * 1.24, color, { opacity: .8, label: 'Cheek' });
export const ANDIKA_ADV: AdvTable = { '0': 61, '1': 61, '2': 61, '3': 61, '4': 61, '5': 61, '6': 61, '7': 61, '8': 61, '9': 61, 'A': 73, 'B': 68, 'C': 68, 'D': 73, 'E': 59, 'F': 59, 'G': 72, 'H': 74, 'I': 51, 'J': 50, 'K': 70, 'L': 55, 'M': 91, 'N': 75, 'O': 73, 'P': 62, 'Q': 75, 'R': 67, 'S': 61, 'T': 62, 'U': 73, 'V': 72, 'W': 104, 'X': 67, 'Y': 67, 'Z': 61, 'a': 61, 'b': 59, 'c': 50, 'd': 62, 'e': 54, 'f': 39, 'g': 58, 'h': 60, 'i': 31, 'j': 33, 'k': 56, 'l': 31, 'm': 86, 'n': 61, 'o': 57, 'p': 60, 'q': 59, 'r': 49, 's': 51, 't': 43, 'u': 61, 'v': 54, 'w': 77, 'x': 58, 'y': 54, 'z': 52, '!': 38, '?': 53, "'": 31, ' ': 27, '&': 66, '.': 35, ',': 32, '-': 44 };
