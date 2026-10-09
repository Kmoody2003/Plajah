// eraPlates — one procedurally-drawn evite plate per Tela design-history era. Zero image credits.
//
// Each era is drawn from its Tela designer (services/tela/designs/eras), its palette and the shared ornament vocabulary
// (services/tela/ornaments), recomposed for a 2:3 phone invitation:
//   • the top ~60% carries the era's structure and ornament; the lower ~40% stays calm for the live text overlay
//   • nothing here is text: names, dates and venues are live text in EviteCard (council rule)
//   • every era declares ONE cantus firmus — a structural constant (golden section, modular unit, diagonal angle,
//     depth-plane ratio…) exported as data in ERA_PLATES[id].cf — and the composition is measured from it
//   • a plate is a stack of LAYERS with a depth (0 far … 1 near); eraEvites.ts turns the same stack into the grayscale
//     depth map, so the living-card parallax and pop-up reveal follow the era's own planes
//   • texture is shader-only (EviteStage): no grain, speckle or noise is drawn here
//
// Pure: no DOM, deterministic (seeded). Serialised and tested via services/evite/eraEvites.ts.
import type { TelaVectorObject, TelaGradientPaint } from '../../types';
import { rect, circle, line, path, mix } from '../tela/templateKit';
import * as orn from '../tela/ornaments';
import type { FontKey } from '../tela/telaFonts';

type Obj = TelaVectorObject;
type Pt = [number, number];

export const PLATE_W = 816;
export const PLATE_H = 1224;
/** Below this line the plate stays calm: the live headline, date and venue sit there. */
export const CALM_Y = Math.round(PLATE_H * 0.6);
const W = PLATE_W, H = PLATE_H, CX = W / 2, PHI = (1 + Math.sqrt(5)) / 2;

/** The era's one structural law. `kind` decides how the optional "design law" overlay draws it. */
export interface CantusFirmus {
  kind: 'golden' | 'module' | 'diagonal' | 'dots' | 'planes' | 'radial' | 'canon' | 'axis';
  /** golden: φ · module: columns across the plate · diagonal: degrees · dots: pitch px · radial: folds · canon: divisions · axis: bays · planes: unused (see ratios) */
  value: number;
  /** planes: fractions of the art field, top to bottom */
  ratios?: number[];
  /** radial / golden: where the construction is centred, plate px */
  origin?: Pt;
  /** human label, e.g. "Golden section 1 : 1.618" */
  label: string;
  /** what the constant governs in this composition */
  governs: string;
}

export interface Layer { depth: number; objects: Obj[] }

export interface PlateCtx {
  paper: string; ink: string; accent: string; secondary: string;
  seed: number; r: () => number; cf: CantusFirmus;
  /** the era designer's page, text and photo wells removed */
  designer: (page?: number) => Obj[];
}

export interface EraPlateSpec {
  cf: CantusFirmus;
  /** ONE foil colour per era (EviteStage shimmer) and its strength (light grounds stay low so paper never turns gold) */
  foil: string; foilStrength: number;
  /** CTA / eyebrow accent for the live text */
  cta: string;
  /** live headline face (open licence) and CSS weight/style */
  font: FontKey; fontStyle: string;
  /** relief-print history: the plate arrives as a letterpress pull (280 ms wipe + 120 ms ink bloom) */
  relief?: boolean;
  /** text block sits on a light ground (dark ink on a paper wash) */
  light: boolean;
  build: (c: PlateCtx) => Layer[];
}

// ── geometry ──────────────────────────────────────────────────────────────────
const f = (n: number) => Math.round(n * 100) / 100;
const pj = (p: Pt[]) => p.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L');
const polyD = (p: Pt[], close = true) => `M${pj(p)}${close ? ' Z' : ''}`;
const circD = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
const ringD = (cx: number, cy: number, r0: number, r1: number) => `${circD(cx, cy, r1)} ${circD(cx, cy, r0)}`;
const rad = (d: number) => d * Math.PI / 180;
const polar = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];

/** Absolute-coordinate PATH: `d` is written in plate pixels. */
function P(d: string, fill: string, o: { stroke?: string; strokeWidth?: number; opacity?: number; gradient?: TelaGradientPaint; blend?: Obj['blendMode']; blur?: number; label?: string; dash?: number[] } = {}): Obj {
  return path(0, 0, W, H, d, fill, { ...o, origin: { x: 0, y: 0, w: W, h: H } });
}
const S = (d: string, color: string, width: number, opacity = 1, label?: string) => P(d, 'none', { stroke: color, strokeWidth: width, opacity, label });

const lg = (angle: number, ...stops: Array<[number, string, number?]>): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: stops.map(([offset, color, opacity]) => ({ offset, color, opacity })) });
const rg = (...stops: Array<[number, string, number?]>): TelaGradientPaint => ({ kind: 'RADIAL', stops: stops.map(([offset, color, opacity]) => ({ offset, color, opacity })) });

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
/** A chain of cubic segments sharing end points. */
function chain(segs: Array<[Pt, Pt, Pt, Pt]>, n = 24): Pt[] { return segs.flatMap((s, i) => bez(...s, n).slice(i ? 1 : 0)); }
/** A tapering ribbon along a polyline (whiplash stems, brush strokes, palm trunks). */
function ribbonD(pts: Pt[], w0: number, w1: number): string {
  const L: Pt[] = [], R: Pt[] = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = (w0 + (w1 - w0) * i / Math.max(1, n - 1)) / 2;
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); R.unshift([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  return polyD([...L, ...R]);
}
/** Radiating wedges (sunbursts, rays, halos). */
function raysD(cx: number, cy: number, r0: number, r1: number, n: number, start: number, spread: number, duty = .5): string {
  const step = spread / n; const out: string[] = [];
  for (let i = 0; i < n; i++) { const a0 = start + i * step, a1 = a0 + step * duty; out.push(polyD([polar(cx, cy, r0, a0), polar(cx, cy, r1, a0), polar(cx, cy, r1, a1), polar(cx, cy, r0, a1)])); }
  return out.join(' ');
}
/** Closed wobbling circle (psychedelic ripples, organic blobs). */
function wobbleD(cx: number, cy: number, R: number, waves: Array<[number, number, number]>, n = 120): string {
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const k = 1 + waves.reduce((s, [fq, amp, ph]) => s + amp * Math.sin(fq * a + ph), 0); p.push([cx + R * k * Math.cos(a), cy + R * k * Math.sin(a)]); }
  return polyD(p);
}
/** Archimedean spiral, open. */
function spiralPts(cx: number, cy: number, r0: number, r1: number, turns: number, start: number, n = 90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(polar(cx, cy, r0 + (r1 - r0) * t, start + t * turns * 360)); }
  return out;
}
const starD = (cx: number, cy: number, R: number, r: number, n: number, rot = -90) => polyD(Array.from({ length: n * 2 }, (_, i) => polar(cx, cy, i % 2 ? r : R, rot + i * 180 / n)));
const rot = ([x, y]: Pt, c: Pt, deg: number): Pt => { const a = rad(deg), dx = x - c[0], dy = y - c[1]; return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };
/** Rectangle given by centre, size and rotation, as an absolute polygon. */
const boxD = (cx: number, cy: number, w: number, h: number, deg = 0) => polyD(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => rot([cx + x, cy + y], [cx, cy], deg)));

/** Two strands woven over-under (Insular knot bands, Roman guilloche). */
function interlace(a0: number, a1: number, c: number, amp: number, period: number, width: number, colA: string, colB: string, casing: string, vertical = false): Obj[] {
  const at = (t: number, ph: number): Pt => { const v = c + amp * Math.sin((t - a0) / period * Math.PI * 2 + ph); return vertical ? [v, t] : [t, v]; };
  const run = (t0: number, t1: number, ph: number) => { const n = Math.max(2, Math.ceil((t1 - t0) / 4)); return polyD(Array.from({ length: n + 1 }, (_, i) => at(t0 + (t1 - t0) * i / n, ph)), false); };
  const out: Obj[] = [S(run(a0, a1, 0), colA, width)];
  const crossings: number[] = []; for (let t = a0; t <= a1 + .1; t += period / 2) crossings.push(t);
  crossings.forEach((t, k) => { if (k % 2 === 0) out.push(S(run(Math.max(a0, t - period / 7), Math.min(a1, t + period / 7), Math.PI), casing, width + 7)); });
  out.push(S(run(a0, a1, Math.PI), colB, width));
  crossings.forEach((t, k) => { if (k % 2 === 1) { out.push(S(run(Math.max(a0, t - period / 7), Math.min(a1, t + period / 7), 0), casing, width + 7)); out.push(S(run(Math.max(a0, t - period / 5), Math.min(a1, t + period / 5), 0), colA, width)); } });
  return out;
}

/** Greek key (meander) band between two rails, as one open stroke path per unit plus the rails. */
function meander(x0: number, y0: number, w: number, h: number, color: string, width: number): Obj[] {
  const u = h; const n = Math.floor(w / u); const xs = x0 + (w - n * u) / 2; const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = xs + i * u, s = u / 10;
    parts.push(polyD([[x, y0 + 10 * s], [x, y0 + 2 * s], [x + 7 * s, y0 + 2 * s], [x + 7 * s, y0 + 7.5 * s], [x + 3.5 * s, y0 + 7.5 * s], [x + 3.5 * s, y0 + 4.8 * s]], false));
  }
  return [S(parts.join(' '), color, width), line(x0, y0, x0 + w, y0, color, width), line(x0, y0 + h, x0 + w, y0 + h, color, width)];
}

/** Paper-rough edge band between yTop and yBot (punk, grunge). */
function tornBandD(x0: number, x1: number, yTop: number, yBot: number, rough: number, seed: number, tilt = 0): string {
  const r = orn.rng(seed); const n = 22; const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; const dy = (x - CX) * Math.tan(rad(tilt)); top.push([x, yTop + dy + (r() - .5) * rough]); bot.unshift([x, yBot + dy + (r() - .5) * rough]); }
  return polyD([...top, ...bot]);
}

const byLabel = (objs: Obj[], re: RegExp) => objs.filter(o => re.test(o.objectLabel || ''));
const without = (objs: Obj[], re: RegExp) => objs.filter(o => !re.test(o.objectLabel || ''));
/** Move/scale designer objects (about ox, oy). */
function xf(objs: Obj[], dx: number, dy: number, s = 1, ox = CX, oy = 0): Obj[] {
  const X = (x: number) => ox + (x - ox) * s + dx, Y = (y: number) => oy + (y - oy) * s + dy;
  return objs.map(o => ({ ...o, x: X(o.x), y: Y(o.y), w: o.w * s, h: o.h * s, strokeWidth: o.strokeWidth * s, points: o.points ? o.points.map((v, i) => i % 2 ? Y(v) : X(v)) : undefined }));
}

const ground = (c: PlateCtx, color = c.paper, g?: TelaGradientPaint) => rect(0, 0, W, H, color, { gradient: g, label: 'Ground', role: 'GROUND' });
const L = (depth: number, ...objects: Array<Obj | Obj[]>): Layer => ({ depth, objects: objects.flat() });

// ── the eras ──────────────────────────────────────────────────────────────────

const classical: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [CX, 400], label: 'Golden section 1 : 1.618', governs: 'Column height = temple width ÷ φ; intercolumniation = column diameter × φ; entablature = column ÷ φ³.' },
  foil: '#E2C27A', foilStrength: .14, cta: '#A65B36', font: 'cinzel', fontStyle: 'normal 600', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const phi = c.cf.value;
    const TW = 700, x0 = CX - TW / 2, stepTop = 690;
    const colH = TW / phi, entH = colH / phi ** 3, pedH = TW / phi ** 4.6;
    const colTop = stepTop - colH, entTop = colTop - entH, apexY = entTop - pedH;
    const n = 6, span = TW - 40, d = span / (n + (n - 1) * phi), gap = d * phi;
    const cols: Obj[] = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + 20 + i * (d + gap);
      cols.push(rect(x, colTop + 16, d, colH - 32, mix(P0, -.05), { gradient: lg(0, [0, mix(P0, -.14)], [.45, mix(P0, .35)], [1, mix(P0, -.18)]), stroke: I, strokeWidth: 1.4, label: 'Column shaft' }));
      for (let k = 1; k < 4; k++) cols.push(line(x + d * k / 4, colTop + 20, x + d * k / 4, stepTop - 20, I, .8, { opacity: .45, label: 'Fluting' }));
      cols.push(rect(x - d * .3, colTop + 4, d * 1.6, 12, P0, { stroke: I, strokeWidth: 1.4, label: 'Capital' }));
      cols.push(circle(x - d * .3, colTop + 14, 6, P0, { stroke: I, strokeWidth: 1.2, label: 'Volute' }), circle(x + d * 1.3, colTop + 14, 6, P0, { stroke: I, strokeWidth: 1.2, label: 'Volute' }));
      cols.push(rect(x - d * .22, stepTop - 16, d * 1.44, 16, P0, { stroke: I, strokeWidth: 1.4, label: 'Base' }));
    }
    const ent: Obj[] = [
      rect(x0 - 16, entTop, TW + 32, entH * .22, I, { label: 'Cornice' }),
      rect(x0, entTop + entH * .22, TW, entH * .42, A, { stroke: I, strokeWidth: 1.2, label: 'Frieze' }),
      ...meander(x0 + 10, entTop + entH * .22 + 6, TW - 20, entH * .42 - 12, P0, 2.6),
      rect(x0, entTop + entH * .64, TW, entH * .36, P0, { stroke: I, strokeWidth: 1.2, label: 'Architrave' }),
      line(x0, entTop + entH * .82, x0 + TW, entTop + entH * .82, I, .8, { opacity: .6 }),
    ];
    const ped: Obj[] = [
      P(polyD([[x0 - 16, entTop], [CX, apexY], [x0 + TW + 16, entTop]]), mix(P0, -.04), { stroke: I, strokeWidth: 2, label: 'Pediment' }),
      P(polyD([[x0 + 26, entTop - 7], [CX, apexY + 14], [x0 + TW - 26, entTop - 7]]), 'none', { stroke: I, strokeWidth: .9, label: 'Tympanum' }),
      path(CX - 26, apexY - 30, 52, 30, orn.fanPath(7), A, { label: 'Acroterion' }),
      path(x0 - 34, entTop - 26, 36, 26, orn.fanPath(5), A, { label: 'Acroterion' }),
      path(x0 + TW - 2, entTop - 26, 36, 26, orn.fanPath(5), A, { label: 'Acroterion' }),
    ];
    const steps = [0, 1, 2].map(k => rect(x0 - 10 - k * 14, stepTop + k * 14, TW + 20 + k * 28, 14, mix(P0, -.02 - k * .02), { stroke: I, strokeWidth: 1.2, label: 'Step' }));
    return [
      L(.08, ground(c), ellipse0(CX, 300, 460, 420, Sg, .55)),
      L(.3, line(x0 - 40, stepTop + 42, x0 + TW + 40, stepTop + 42, I, 1.2, { opacity: .7, label: 'Ground line' })),
      L(.16, rect(26, 26, W - 52, H - 52, 'none', { stroke: I, strokeWidth: 1, opacity: .55 }), rect(34, 34, W - 68, H - 68, 'none', { stroke: I, strokeWidth: .6, opacity: .4 })),
      L(.5, steps), L(.58, cols), L(.64, ent), L(.68, ped),
    ];
  },
};
/** soft radial glow */
function ellipse0(cx: number, cy: number, rx: number, ry: number, color: string, op: number): Obj {
  return { ...circle(cx, cy, 1, color), x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, gradient: rg([0, color, op], [1, color, 0]), objectLabel: 'Glow' };
}

const egyptian: EraPlateSpec = {
  cf: { kind: 'module', value: 12, label: 'Canon grid of 18 rows (68 px squares)', governs: 'Every height — sun disc, pylon, portal, cornice — is a whole number of grid squares, as in the Egyptian canon of proportion.' },
  foil: '#D7B65B', foilStrength: .38, cta: '#D7B65B', font: 'forum', fontStyle: 'normal 400', light: false,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value; // 68
    const D = c.designer(0);
    const wings: Obj[] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
      const y = 2.6 * u + k * 13 - 30, inner = CX + s * (u * .95 + 8), len = 4.4 * u - k * 34;
      const outer = inner + s * len;
      wings.push(P(polyD([[inner, y], [outer - s * 18, y - 10 + k * 3], [outer, y - 4 + k * 3], [outer - s * 6, y + 8], [inner, y + 9]]), k % 2 ? Sg : A, { label: 'Wing feathers' }));
    }
    const sunY = 2.6 * u;
    const pylon = (s: number): Obj[] => {
      const bx0 = CX + s * .8 * u, bx1 = CX + s * 4.9 * u, tx0 = CX + s * .8 * u, tx1 = CX + s * 4.5 * u, top = 5 * u, base = 10.5 * u;
      const out: Obj[] = [P(polyD([[bx0, base], [bx1, base], [tx1, top], [tx0, top]]), mix(P0, .07), { stroke: A, strokeWidth: 1.4, label: 'Pylon' })];
      for (let y = top + u / 2; y < base; y += u / 2) { const t = (y - top) / (base - top); out.push(line(tx0, y, tx1 + (bx1 - tx1) * t, y, I, .8, { opacity: .14, label: 'Course' })); }
      out.push(P(polyD([[tx0, top], [tx1 - s * 4, top], [tx1 + s * 10, top - 22], [tx0, top - 22]]), A, { label: 'Cavetto cornice' }));
      out.push(...orn.frieze(Math.min(tx0, tx1) + 10, top + 8, Math.abs(tx1 - tx0) - 20, 30, orn.lotusPath(), A, 6, { alternate: Sg, label: 'Lotus frieze' }));
      return out;
    };
    const portal: Obj[] = [
      rect(CX - .8 * u, 7 * u, 1.6 * u, 3.5 * u, mix(P0, -.35), { stroke: A, strokeWidth: 1.4, label: 'Portal' }),
      rect(CX - 1.1 * u, 6.65 * u, 2.2 * u, .35 * u, A, { label: 'Portal lintel' }),
      circle(CX, 6.82 * u, 9, P0, { label: 'Lintel disc' }),
    ];
    return [
      L(.06, ground(c, P0, lg(90, [0, mix(P0, .06)], [.6, P0], [1, mix(P0, -.4)]))),
      L(.14, byLabel(D, /^(Outer frame|Inner frame|Papyrus stem rhythm \(head\))$/)),
      L(.22, P(polyD([[CX - 26, sunY + 60], [CX + 26, sunY + 60], [CX + .8 * u, 10.5 * u], [CX - .8 * u, 10.5 * u]]), A, { gradient: lg(90, [0, A, .5], [1, A, 0]), label: 'Light beam' })),
      L(.34, circle(CX, sunY, u * 1.15, A, { gradient: rg([0, A, .35], [1, A, 0]), label: 'Sun glow' }), wings),
      L(.42, circle(CX, sunY, u * .95, A, { label: 'Sun disc' }), circle(CX, sunY, u * .95 + 9, 'none', { stroke: A, strokeWidth: 2.4, label: 'Sun ring' }), circle(CX, sunY, u * .55, mix(A, .25), { opacity: .6 })),
      L(.6, pylon(-1), pylon(1)),
      L(.5, portal),
      L(.3, line(1.2 * u, 10.5 * u, W - 1.2 * u, 10.5 * u, A, 2, { label: 'Ground line' }), byLabel(D, /^Papyrus stem rhythm \(foot\)$/)),
    ];
  },
};

const romanMosaic: EraPlateSpec = {
  cf: { kind: 'module', value: 34, label: 'Tessera module 24 px (34 across)', governs: 'Every tile, band and ring radius is a whole number of tesserae.' },
  foil: '#C48A45', foilStrength: .12, cta: '#6D3025', font: 'marcellus', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value; const r = c.r;
    const tile = (x: number, y: number, col: string, deg = 0) => rect(x + 1.2, y + 1.2, u - 2.4, u - 2.4, col, { rotation: deg, label: 'Tessera' });
    const border: Obj[] = [];
    const cols = c.cf.value, rows = Math.floor(H / u);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const ring = Math.min(i, j, cols - 1 - i, rows - 1 - j); if (ring > 2) continue;
      const col = ring === 1 ? ((i + j) % 2 ? A : Sg) : ring === 0 ? I : mix(P0, -.12);
      border.push(tile(i * u, j * u + (H - rows * u) / 2, col, (r() - .5) * 4));
    }
    const ox = CX, oy = 15 * u; const rings: Obj[] = [];
    const bandCol = [I, Sg, Sg, A, mix(P0, -.14), A, I, Sg, mix(P0, -.08), I];
    for (let k = 3; k <= 12; k++) {
      const R = k * u, n = Math.floor(2 * Math.PI * R / u);
      for (let i = 0; i < n; i++) { const a = i / n * 360; const [x, y] = polar(ox, oy, R, a); rings.push(rect(x - u / 2 + 1.2, y - u / 2 + 1.2, u - 2.4, u - 2.4, k === 7 && i % 2 ? I : bandCol[k - 3], { rotation: a, label: 'Ring tessera' })); }
    }
    const rosette: Obj[] = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const x = ox + i * u, y = oy + j * u, d = Math.hypot(i, j); if (d > 2.6) continue;
      const a = Math.atan2(j, i); const petal = 1.1 + 1.5 * Math.abs(Math.cos(2 * a));
      rosette.push(rect(x - u / 2 + 1.2, y - u / 2 + 1.2, u - 2.4, u - 2.4, d < .5 ? Sg : d <= petal ? A : mix(P0, -.05), { label: 'Rosette tessera' }));
    }
    const panel = 13.5 * u; const corners: Obj[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Pt[]) {
      const cx = ox + sx * panel * .86, cy = oy + sy * panel * .86;
      corners.push(path(cx - 30, cy - 30, 60, 60, orn.leafPath(), A, { rotation: 45 + (sx * sy > 0 ? 0 : 90), label: 'Ivy leaf' }));
    }
    return [
      L(.08, ground(c)),
      L(.3, border),
      L(.4, rect(ox - panel, oy - panel, panel * 2, panel * 2, mix(P0, .18), { stroke: I, strokeWidth: 3, label: 'Emblema panel' }), interlace(ox - panel + 18, ox + panel - 18, oy - panel - 26, 8, 2 * u, 5, A, I, P0), corners),
      L(.55, rings),
      L(.7, rosette),
    ];
  },
};

const byzantine: EraPlateSpec = {
  cf: { kind: 'radial', value: 12, origin: [CX, 450], label: 'Halo construction in 12 folds', governs: 'Halo rings, the arch and the jewelled star are struck from one centre at 30° steps.' },
  foil: '#E9C46A', foilStrength: .42, cta: '#E9C46A', font: 'cinzel', fontStyle: 'normal 700', light: false,
  build: c => {
    const D = c.designer(0); const [ox, oy] = c.cf.origin!;
    const keep = without(D, /^(Foot rule|Foot jewel)$/);
    const ground0 = byLabel(keep, /^Ground$/);
    const rest = keep.filter(o => !ground0.includes(o));
    const depthOf = (o: Obj) => /Gold field|border/i.test(o.objectLabel || '') ? .34 : /shimmer/i.test(o.objectLabel || '') ? .4 : /Halo/i.test(o.objectLabel || '') ? .48 : /Round-arched/.test(o.objectLabel || '') ? .62 : .56;
    const groups = new Map<number, Obj[]>(); for (const o of rest) { const d = depthOf(o); groups.set(d, [...(groups.get(d) || []), o]); }
    return [
      L(.06, ground0, rect(0, 720, W, H - 720, c.ink, { gradient: lg(90, [0, c.ink, 0], [1, mix(c.ink, -.45), 1]) })),
      ...[...groups].sort((a, b) => a[0] - b[0]).map(([d, objs]) => L(d, objs)),
      L(.72, P(starD(ox, oy, 92, 40, 8, -90), c.secondary, { opacity: .95, label: 'Jewelled star' }), P(raysD(ox, oy, 100, 150, 12, -90, 360, .18), c.secondary, { opacity: .55, label: 'Star rays' }), circle(ox, oy, 16, c.accent, { stroke: c.secondary, strokeWidth: 3, label: 'Centre jewel' })),
    ];
  },
};

const insular: EraPlateSpec = {
  cf: { kind: 'module', value: 15, label: 'Carpet-page grid of 54 px units', governs: 'The knot period, band width and roundel radii are whole units of the page grid.' },
  foil: '#C89432', foilStrength: .12, cta: '#9A3B2E', font: 'uncial', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value; // 54.4
    const x0 = 1.5 * u, x1 = W - 1.5 * u, y0 = 1.5 * u, y1 = 13 * u, band = u;
    const frame = [rect(x0, y0, x1 - x0, y1 - y0, mix(P0, .25), { stroke: I, strokeWidth: 4, label: 'Carpet panel' }), rect(x0 + band, y0 + band, x1 - x0 - 2 * band, y1 - y0 - 2 * band, mix(P0, -.03), { stroke: I, strokeWidth: 2.5, label: 'Panel field' })];
    const knots = [
      ...interlace(x0 + 10, x1 - 10, y0 + band / 2, band * .26, u, 7, I, A, mix(P0, .25)),
      ...interlace(x0 + 10, x1 - 10, y1 - band / 2, band * .26, u, 7, I, A, mix(P0, .25)),
      ...interlace(y0 + band, y1 - band, x0 + band / 2, band * .26, u, 7, I, Sg, mix(P0, .25), true),
      ...interlace(y0 + band, y1 - band, x1 - band / 2, band * .26, u, 7, I, Sg, mix(P0, .25), true),
    ];
    const cx = CX, cy = (y0 + y1) / 2, R = 3.6 * u;
    const triskele = (tx: number, ty: number, rr: number, w: number, col: string): Obj[] => {
      const out: Obj[] = [];
      for (let k = 0; k < 3; k++) {
        const a = -90 + k * 120; const [sx, sy] = polar(tx, ty, rr * .52, a);
        const pts = spiralPts(sx, sy, rr * .46, 2, 1.6, a + 180);
        out.push(S(polyD(pts, false), P0, w + 6), S(polyD(pts, false), col, w));
      }
      return out;
    };
    const dotsOn = (pts: Pt[]) => pts.map(([x, y]) => circle(x, y, 2.6, A, { label: 'Red dotting' }));
    const ringDots: Pt[] = Array.from({ length: 72 }, (_, i) => polar(cx, cy, R + 12, i * 5));
    const edgeDots: Pt[] = []; for (let x = x0 + band + 14; x < x1 - band - 8; x += 14) edgeDots.push([x, y0 + band + 10], [x, y1 - band - 10]);
    const corners: Obj[] = []; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Pt[]) corners.push(...triskele(cx + sx * 3.9 * u, cy + sy * 3.95 * u, u * 1.05, 4, sy < 0 ? A : Sg));
    return [
      L(.08, ground(c)),
      L(.3, frame), L(.5, knots),
      L(.42, circle(cx, cy, R, mix(Sg, .55), { stroke: I, strokeWidth: 3, label: 'Roundel' }), circle(cx, cy, R - 14, 'none', { stroke: A, strokeWidth: 1.5 }), dotsOn(ringDots), dotsOn(edgeDots)),
      L(.62, corners),
      L(.72, triskele(cx, cy, R * .92, 11, I)),
      L(.2, dotsOn(Array.from({ length: 23 }, (_, i) => [CX - 11 * 14 + i * 14, y1 + 26] as Pt))),
    ];
  },
};

const gothic: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 60, label: 'Ad triangulum: the 60° equilateral', governs: 'Lancet pitch and tracery are struck from equilateral triangles; the light shafts fall at the same angle.' },
  foil: '#D8B55B', foilStrength: .4, cta: '#D8B55B', font: 'unifraktur', fontStyle: 'normal 400', light: false,
  build: c => {
    const D = without(c.designer(0), /^(Foot rule|Quatrefoil)$/);
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /^Ground/.test(l) ? .05 : /Tracery light/.test(l) ? .25 : /Jewel pane/.test(l) ? .42 : /Quatrefoil|Rose/.test(l) ? .6 : /Tracery frame/.test(l) ? .62 : /Pier|Sill|Arcade/.test(l) ? .7 : .5; };
    const by = new Map<number, Obj[]>(); for (const o of D) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const panes = byLabel(D, /^Jewel pane$/); const cols = [...new Set(panes.map(p => p.fill))].slice(0, 3);
    const shafts: Obj[] = [];
    const t = Math.tan(rad(90 - c.cf.value));
    [[144, 300], [354, 462], [516, 672]].forEach(([a, b], i) => {
      const y = 626, y2 = 1060; const dx = (y2 - y) * t * .35;
      shafts.push(P(polyD([[a, y], [b, y], [b + dx + 40, y2], [a + dx - 40, y2]]), cols[i % cols.length] || c.secondary, { gradient: lg(90, [0, cols[i % cols.length] || c.secondary, .32], [1, cols[i % cols.length] || c.secondary, 0]), label: 'Coloured light on the floor' }));
    });
    return [...[...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o)), L(.18, shafts)];
  },
};

const renaissance: EraPlateSpec = {
  cf: { kind: 'canon', value: 9, label: 'Van de Graaf canon (ninths)', governs: 'The arch spans the canon text block; the vanishing point sits on the canon diagonal crossing.' },
  foil: '#C9A45C', foilStrength: .12, cta: '#8C3F2B', font: 'cormorant', fontStyle: 'italic 600', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const n = c.cf.value;
    const ax0 = W / n * 1.6, ax1 = W - W / n * 1.6, aw = ax1 - ax0, spring = 372, base = 744;
    const vp: Pt = [CX, 486];
    const opening = `M${f(ax0)} ${base} L${f(ax0)} ${spring} A${f(aw / 2)} ${f(aw / 2)} 0 0 1 ${f(ax1)} ${spring} L${f(ax1)} ${base} Z`;
    const floor: Layer[] = [];
    const rows = 9, cw = 60; const yAt = (k: number) => vp[1] + (base - vp[1]) * (1 / (1 + (rows - k) * .38)) ** 1.0;
    for (let k = 0; k < rows; k++) {
      const ya = yAt(k), yb = yAt(k + 1); const objs: Obj[] = [];
      for (let i = -6; i < 6; i++) {
        const xb0 = CX + i * cw, xb1 = xb0 + cw; const lerp = (xb: number, y: number) => vp[0] + (xb - vp[0]) * (y - vp[1]) / (base - vp[1]);
        const q: Pt[] = [[lerp(xb0, ya), ya], [lerp(xb1, ya), ya], [lerp(xb1, yb), yb], [lerp(xb0, yb), yb]];
        if (q[2][0] > ax1 + 1 || q[3][0] < ax0 - 1) continue;
        const cl = (p: Pt): Pt => [Math.max(ax0, Math.min(ax1, p[0])), p[1]];
        objs.push(P(polyD(q.map(cl)), (i + k) % 2 ? mix(Sg, .1) : mix(P0, .2), { label: 'Pavement tile' }));
      }
      floor.push(L(.2 + .36 * k / rows, objs));
    }
    const temple: Obj[] = [
      rect(CX - 54, vp[1] - 58, 108, 58, mix(P0, .3), { stroke: I, strokeWidth: 1.2, label: 'Tempietto drum' }),
      P(`M${CX - 46} ${vp[1] - 58} A46 46 0 0 1 ${CX + 46} ${vp[1] - 58} Z`, mix(P0, .3), { stroke: I, strokeWidth: 1.2, label: 'Dome' }),
      ...[-36, -18, 0, 18, 36].map(dx => line(CX + dx, vp[1] - 52, CX + dx, vp[1] - 4, I, 1, { opacity: .7, label: 'Colonnade' })),
      rect(CX - 62, vp[1] - 4, 124, 6, I, { opacity: .8 }),
    ];
    const hills = P(`M${f(ax0)} ${vp[1]} C ${f(ax0 + 90)} ${vp[1] - 40} ${f(ax0 + 170)} ${vp[1] - 18} ${CX - 80} ${vp[1] - 6} L ${CX + 80} ${vp[1] - 6} C ${f(ax1 - 170)} ${vp[1] - 30} ${f(ax1 - 80)} ${vp[1] - 46} ${f(ax1)} ${vp[1] - 12} L ${f(ax1)} ${vp[1]} Z`, mix(Sg, .25), { label: 'Hills' });
    const pil = (x: number): Obj[] => [rect(x, spring - 10, 34, base - spring + 10, mix(P0, -.04), { stroke: I, strokeWidth: 1.4, label: 'Pilaster' }), line(x + 11, spring + 14, x + 11, base - 12, I, .8, { opacity: .5 }), line(x + 23, spring + 14, x + 23, base - 12, I, .8, { opacity: .5 }), rect(x - 6, spring - 22, 46, 12, P0, { stroke: I, strokeWidth: 1.4, label: 'Impost' })];
    const archivolt = `M${f(ax0 - 22)} ${spring} A${f(aw / 2 + 22)} ${f(aw / 2 + 22)} 0 0 1 ${f(ax1 + 22)} ${spring} L${f(ax1)} ${spring} A${f(aw / 2)} ${f(aw / 2)} 0 0 0 ${f(ax0)} ${spring} Z`;
    return [
      L(.08, ground(c)),
      L(.1, P(opening, Sg, { gradient: lg(90, [0, mix(Sg, .55)], [.62, mix(P0, .45)], [1, mix(P0, .3)]), label: 'Sky' })),
      L(.16, hills), L(.24, temple), ...floor,
      L(.78, P(archivolt, A, { stroke: I, strokeWidth: 1.4, label: 'Archivolt' }), P(`M${CX - 16} ${spring - aw / 2 - 22} L${CX + 16} ${spring - aw / 2 - 22} L${CX + 11} ${spring - aw / 2 + 4} L${CX - 11} ${spring - aw / 2 + 4} Z`, P0, { stroke: I, strokeWidth: 1.4, label: 'Keystone' }), pil(ax0 - 34), pil(ax1)),
      L(.7, rect(54, 54, W - 108, 18, I, { label: 'Entablature' }), circle(104, 190, 44, mix(Sg, .4), { stroke: A, strokeWidth: 4, label: 'Tondo' }), circle(W - 104, 190, 44, mix(Sg, .4), { stroke: A, strokeWidth: 4, label: 'Tondo' })),
      L(.2, line(54, base, W - 54, base, I, 1.6), line(54, base + 8, W - 54, base + 8, I, .6, { opacity: .6 })),
    ];
  },
};

const baroque: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 8, label: 'The 8° diagonal', governs: 'The crimson band, the drape and the fall of light all lean at the same 8°.' },
  foil: '#E0B865', foilStrength: .45, cta: '#E0B865', font: 'playfair', fontStyle: 'italic 700', light: false,
  build: c => {
    const D = c.designer(0); const { ink: I, accent: A } = c;
    const top = (o: Obj) => o.y < 640;
    const scrolls = byLabel(D, /^C-scroll/).filter(top);
    const t = Math.tan(rad(c.cf.value));
    const drape: Obj[] = []; const sagY = (x: number) => 40 + x * t * .4;
    for (let i = 0; i < 2; i++) {
      const xa = i * W / 2, xb = xa + W / 2, ya = sagY(xa), yb = sagY(xb), dip = 150;
      drape.push(P(`M${xa} ${ya - 60} L${xb} ${yb - 60} L${xb} ${yb} Q${(xa + xb) / 2} ${(ya + yb) / 2 + dip} ${xa} ${ya} Z`, I, { gradient: lg(90, [0, mix(I, -.25)], [.7, I], [1, mix(I, .18)]), label: 'Velvet swag' }));
      for (let k = 1; k < 4; k++) drape.push(S(`M${xa + 40 * k} ${ya - 50} Q${(xa + xb) / 2} ${(ya + yb) / 2 + dip * (k / 4)} ${xb - 40 * k} ${yb - 50}`, mix(I, -.35), 2, .6));
      drape.push(S(`M${xa} ${ya} Q${(xa + xb) / 2} ${(ya + yb) / 2 + dip} ${xb} ${yb}`, A, 4, .95));
    }
    const tassel = (x: number, y: number): Obj[] => [line(x, y, x, y + 70, A, 2), P(`M${x - 9} ${y + 70} L${x + 9} ${y + 70} L${x + 14} ${y + 112} L${x - 14} ${y + 112} Z`, A, { label: 'Tassel' }), circle(x, y + 66, 8, A)];
    return [
      L(.05, byLabel(D, /^Ground$/)),
      L(.12, byLabel(D, /^Chiaroscuro light$/)),
      L(.18, byLabel(D, /^Light ray$/), byLabel(D, /^Hairline frame$/)),
      L(.5, byLabel(D, /^Diagonal band$/)),
      L(.68, scrolls),
      L(.86, drape, tassel(0 + 2, sagY(0)), tassel(W / 2, sagY(W / 2)), tassel(W - 2, sagY(W))),
    ];
  },
};

const rococo: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [W / PHI - 80, 400], label: 'Golden section, off-centre', governs: 'The cartouche sits on the golden vertical, never the axis; the shell crowns it at the next φ step.' },
  foil: '#D5A85A', foilStrength: .14, cta: '#6D536B', font: 'cormorant', fontStyle: 'italic 500', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const [ox, oy] = c.cf.origin!; const r = c.r;
    const rx = 252, ry = rx * PHI * .72;
    const sky = [{ ...circle(0, 0, 1, A), x: ox - rx, y: oy - ry, w: rx * 2, h: ry * 2, gradient: rg([0, mix(P0, .5)], [.55, mix(A, .45)], [1, mix(A, .15)]), objectLabel: 'Pastel sky' }];
    const clouds = [0, 1, 2].map(i => path(ox - 190 + i * 120, oy + 60 + (i % 2) * 50, 170, 70, orn.blobPath(c.seed + i, 7, .25), '#FFFFFF', { opacity: .55, label: 'Cloud' }));
    const frame = [{ ...circle(0, 0, 1, 'none'), x: ox - rx, y: oy - ry, w: rx * 2, h: ry * 2, stroke: Sg, strokeWidth: 7, objectLabel: 'Gilt cartouche' }, { ...circle(0, 0, 1, 'none'), x: ox - rx + 12, y: oy - ry + 12, w: rx * 2 - 24, h: ry * 2 - 24, stroke: I, strokeWidth: 1.2, opacity: .6, objectLabel: 'Inner bead' }];
    const scrolls = [
      path(ox + rx - 120, oy - ry - 40, 190, 190, orn.cScrollPath(), Sg, { rotation: 20, label: 'C-scroll' }),
      path(ox - rx + 140, oy + ry - 190, -170, 170, orn.cScrollPath(), Sg, { rotation: -10, label: 'C-scroll' }),
      path(ox - rx - 20, oy - 40, 120, 120, orn.cScrollPath(), Sg, { rotation: 160, label: 'C-scroll' }),
      path(ox + rx - 10, oy + 120, 110, 110, orn.cScrollPath(), mix(Sg, -.1), { rotation: 70, label: 'C-scroll' }),
    ];
    const shellC: Pt = [ox + rx * .55, oy - ry + 6];
    const shell = [P(raysD(shellC[0], shellC[1] + 40, 14, 108, 11, -170, 160, .62), Sg, { label: 'Rocaille shell' }), P(raysD(shellC[0], shellC[1] + 40, 14, 92, 11, -170, 160, .3), mix(Sg, .35), { label: 'Shell ribs' })];
    const sprays: Obj[] = [];
    const spray = (x: number, y: number, s: number) => { for (let k = 0; k < 5; k++) { const [px, py] = polar(x, y, 11 * s, k * 72 + r() * 20); sprays.push(circle(px, py, 8 * s, k % 2 ? mix(I, .55) : mix(A, -.1), { label: 'Blossom' })); } sprays.push(circle(x, y, 5 * s, Sg)); for (let k = 0; k < 2; k++) sprays.push(path(x + (k ? 6 : -40) * s, y + 8 * s, 34 * s, 18 * s, orn.leafPath(), mix(A, -.3), { rotation: k ? 30 : -30, label: 'Leaf' })); };
    spray(ox - rx + 30, oy - ry + 70, 1.1); spray(ox + rx + 20, oy + 40, .9); spray(ox - rx + 70, oy + ry - 10, 1); spray(shellC[0] + 120, shellC[1] + 30, .8);
    const trail: Obj[] = []; for (let i = 0; i < 9; i++) { const t = i / 8; trail.push(circle(ox + rx * .7 + t * 170, oy - ry + 120 + t * 330 + Math.sin(t * 7) * 18, 4 + 3 * (1 - t), Sg, { opacity: .85, label: 'Gilt bead' })); }
    return [L(.08, ground(c)), L(.16, sky), L(.24, clouds), L(.58, frame), L(.66, scrolls, trail), L(.74, shell), L(.82, sprays)];
  },
};

const neoclassical: EraPlateSpec = {
  cf: { kind: 'axis', value: 6, label: 'One axis, six bays of 136 px', governs: 'Medallion, swag anchors and ribbon drops fall on bay lines either side of the central axis.' },
  foil: '#D8C08A', foilStrength: .14, cta: '#A43E35', font: 'bodoni', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const bay = W / c.cf.value;
    const my = 300, R = 150;
    const medal = [circle(CX, my, R + 14, Sg, { label: 'Gilt rim' }), circle(CX, my, R, I, { label: 'Jasper medallion' }), P(raysD(CX, my, 34, R - 26, 24, -90, 360, .55), P0, { opacity: .92, label: 'Patera' }), circle(CX, my, 30, P0, { label: 'Boss' }), circle(CX, my, 18, I, { opacity: .25 }),
      ...Array.from({ length: 48 }, (_, i) => { const [x, y] = polar(CX, my, R - 12, i * 7.5); return circle(x, y, 3.2, P0, { label: 'Bead' }); })];
    const swag = (s: number): Obj[] => {
      const a: Pt = [CX + s * 2.5 * bay, 210], b: Pt = [CX + s * (R + 18), my - 20]; const out: Obj[] = [];
      const pts = bez(a, [a[0], a[1] + 170], [b[0], b[1] + 150], b, 26);
      out.push(S(polyD(pts, false), mix(Sg, -.2), 3));
      pts.forEach(([x, y], i) => { if (i % 2) return; const t = i / pts.length, sz = 26 + 18 * Math.sin(t * Math.PI); out.push(path(x - sz / 2, y - sz / 2, sz, sz * .6, orn.leafPath(), i % 4 ? mix(I, .25) : Sg, { rotation: (i * 37) % 360, label: 'Laurel leaf' })); });
      out.push(P(`M${a[0] - 14} ${a[1] - 8} Q${a[0]} ${a[1] - 30} ${a[0] + 14} ${a[1] - 8} Q${a[0]} ${a[1] + 8} ${a[0] - 14} ${a[1] - 8} Z`, A, { label: 'Bow' }));
      out.push(S(`M${a[0]} ${a[1]} C${a[0] + s * 12} ${a[1] + 80} ${a[0] - s * 14} ${a[1] + 150} ${a[0] + s * 4} ${a[1] + 240}`, A, 3.5, .9, 'Ribbon tail'));
      return out;
    };
    const eggDart = (y: number): Obj[] => { const out: Obj[] = [rect(bay * .5, y - 2, W - bay, 2, I, { opacity: .7 }), rect(bay * .5, y + 34, W - bay, 2, I, { opacity: .7 })]; for (let x = bay * .5 + 14; x < W - bay * .5 - 14; x += 28) { out.push({ ...circle(0, 0, 1, mix(P0, -.08)), x: x - 9, y: y + 4, w: 18, h: 26, stroke: I, strokeWidth: 1, objectLabel: 'Egg' }); out.push(P(`M${x + 14} ${y + 4} L${x + 17} ${y + 20} L${x + 14} ${y + 30} L${x + 11} ${y + 20} Z`, I, { label: 'Dart' })); } return out; };
    const beadReel = (y: number): Obj[] => { const out: Obj[] = []; for (let x = bay * .5 + 10, i = 0; x < W - bay * .5 - 10; x += i % 2 ? 12 : 20, i++) out.push(i % 2 ? circle(x, y, 4, I, { label: 'Bead' }) : { ...circle(0, 0, 1, mix(P0, -.1)), x: x - 8, y: y - 5, w: 16, h: 10, stroke: I, strokeWidth: .8, objectLabel: 'Reel' }); return out; };
    return [
      L(.08, ground(c)),
      L(.14, rect(28, 28, W - 56, H - 56, 'none', { stroke: I, strokeWidth: 1.2, opacity: .6 }), rect(38, 38, W - 76, H - 76, 'none', { stroke: A, strokeWidth: .8, opacity: .5 })),
      L(.4, line(CX, 64, CX, my - R - 14, A, 3, { label: 'Ribbon on the axis' }), eggDart(70), beadReel(640)),
      L(.56, swag(-1), swag(1)),
      L(.72, medal),
    ];
  },
};

const victorian: EraPlateSpec = {
  cf: { kind: 'module', value: 34, label: 'Pica rhythm: 24 px leading', governs: 'Rules, borders and the cartouche step down the page on a 24 px typographic leading.' },
  foil: '#C18D32', foilStrength: .14, cta: '#8A3034', font: 'abril', fontStyle: 'normal 400', relief: true, light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value;
    const fr = [rect(36, 36, W - 72, H - 72, 'none', { stroke: I, strokeWidth: 5, label: 'Outer border' }), rect(46, 46, W - 92, H - 92, 'none', { stroke: I, strokeWidth: 1.2, label: 'Inner border' }),
      ...([[46, 46], [W - 46, 46], [46, H - 46], [W - 46, H - 46]] as Pt[]).map(([x, y]) => rect(x - 7, y - 7, 14, 14, I, { rotation: 45, label: 'Corner diamond' }))];
    const canopy = path(80, 66 + 2 * u, W - 160, -2 * u, orn.scallopPath(18), I, { label: 'Scalloped canopy' });
    const ox = CX, oy = 16.5 * u, rx = 9.5 * u, ry = 11 * u;
    const ell = (k: number, col: string, w: number) => ({ ...circle(0, 0, 1, 'none'), x: ox - rx - k, y: oy - ry - k, w: (rx + k) * 2, h: (ry + k) * 2, stroke: col, strokeWidth: w, objectLabel: 'Cartouche rule' });
    const rays: Obj[] = []; for (let i = 0; i < 72; i++) { const a = rad(i * 5); rays.push(line(ox + 34 * Math.cos(a), oy + 34 * Math.sin(a), ox + (rx - 10) * Math.cos(a), oy + (ry - 10) * Math.sin(a), i % 2 ? A : I, i % 2 ? 3.4 : 1, { opacity: i % 2 ? .85 : .55, label: 'Engraved ray' })); }
    // negative widths mirror the scroll, so the flourish on each side faces the cartouche
    const flour = (s: number): Obj[] => [path(ox + s * (rx - 30), oy - 160, s * 130, 140, orn.cScrollPath(), I, { label: 'Flourish' }), path(ox + s * (rx - 24), oy + 150, s * 110, -120, orn.cScrollPath(), A, { label: 'Flourish' })];
    const divider = [line(CX - 6 * u, 29.5 * u, CX + 6 * u, 29.5 * u, I, 3), line(CX - 6 * u, 29.5 * u + 7, CX + 6 * u, 29.5 * u + 7, I, .8), ...[-24, 0, 24].map(dx => rect(CX + dx - 5, 29.5 * u + 14, 10, 10, A, { rotation: 45, label: 'Diamond' }))];
    return [
      L(.08, ground(c)), L(.18, fr), L(.4, canopy),
      L(.48, { ...circle(0, 0, 1, mix(Sg, .55)), x: ox - rx, y: oy - ry, w: rx * 2, h: ry * 2, objectLabel: 'Cartouche field' }, rays),
      L(.62, ell(0, I, 4), ell(9, Sg, 2), ell(16, I, 1), P(starD(ox, oy, 46, 20, 8), A, { label: 'Star' }), circle(ox, oy, 12, Sg)),
      L(.7, flour(-1), flour(1)), L(.3, divider),
    ];
  },
};

const TULIP = 'M46 100 L46 60 L54 60 L54 100 Z M50 58 C30 58 14 44 12 18 C24 30 38 36 42 46 L50 6 L58 46 C62 36 76 30 88 18 C86 44 70 58 50 58 Z';
const artsCrafts: EraPlateSpec = {
  cf: { kind: 'module', value: 7, label: 'Pattern repeat of 6 stems in a 7-unit page', governs: 'Stem spacing, leaf size and the border glyph pitch are fractions of one repeat.' },
  foil: '#C49A4B', foilStrength: .12, cta: '#A34E35', font: 'alegreya', fontStyle: 'normal 700', relief: true, light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const r = c.r;
    const fr0 = 40, band = 44, in0 = fr0 + band;
    const glyph = (x: number, y: number, s: number, d: string, col: string, deg = 0) => path(x, y, s, s, d, col, { rotation: deg, label: 'Border glyph' });
    const border: Obj[] = [rect(fr0, fr0, W - 2 * fr0, H - 2 * fr0, 'none', { stroke: I, strokeWidth: 7, label: 'Woodcut frame' }), rect(in0, in0, W - 2 * in0, H - 2 * in0, 'none', { stroke: I, strokeWidth: 1.5 })];
    const g = 28, step = 38;
    for (let x = in0 + 6, i = 0; x < W - in0 - g; x += step, i++) { border.push(glyph(x, fr0 + 8, g, i % 2 ? orn.leafPath() : TULIP, i % 2 ? I : A), glyph(x, H - fr0 - 8 - g, g, i % 2 ? orn.leafPath() : TULIP, i % 2 ? I : A, 180)); }
    for (let y = in0 + 6, i = 0; y < H - in0 - g; y += step, i++) { border.push(glyph(fr0 + 8, y, g, i % 2 ? TULIP : orn.leafPath(), i % 2 ? A : I, -90), glyph(W - fr0 - 8 - g, y, g, i % 2 ? TULIP : orn.leafPath(), i % 2 ? A : I, 90)); }
    for (const [x, y] of [[fr0 + 4, fr0 + 4], [W - in0 + 4, fr0 + 4], [fr0 + 4, H - in0 + 4], [W - in0 + 4, H - in0 + 4]] as Pt[]) border.push(rect(x, y, band - 8, band - 8, Sg), rect(x + 9, y + 9, band - 26, band - 26, I, { rotation: 45 }));
    const px0 = in0 + 26, px1 = W - in0 - 26, py0 = in0 + 26, py1 = CALM_Y - 30; const unit = (px1 - px0) / 6;
    const panel = [rect(px0, py0, px1 - px0, py1 - py0, I, { label: 'Pattern ground' })];
    const stems: Obj[] = [], leaves: Obj[] = [], blooms: Obj[] = [];
    for (let s = 0; s < 6; s++) {
      const sx = px0 + unit * (s + .5), ph = s % 2 ? Math.PI : 0; const pts: Pt[] = [];
      for (let y = py0 + 8; y <= py1 - 8; y += 8) pts.push([sx + unit * .28 * Math.sin((y - py0) / 120 + ph), y]);
      stems.push(S(polyD(pts, false), mix(I, .3), 4, 1, 'Stem'));
      for (let k = 0; k < pts.length; k += 7) { const [x, y] = pts[k]; const side = (k / 7) % 2 ? 1 : -1; leaves.push(path(x + (side > 0 ? 2 : -34), y - 22, 32, 46, orn.leafPath(), (k / 7) % 3 ? mix(I, .42) : Sg, { rotation: side * 48, label: 'Leaf' })); }
      for (let k = 18; k < pts.length; k += 26) { const [x, y] = pts[k]; blooms.push(path(x - 22, y - 30, 44, 50, TULIP, A, { label: 'Tulip' }), circle(x, y - 14, 4, P0)); }
    }
    for (let i = 0; i < 30; i++) blooms.push(circle(px0 + r() * (px1 - px0), py0 + r() * (py1 - py0), 3.2, Sg, { opacity: .9, label: 'Berry' }));
    return [L(.08, ground(c)), L(.3, border), L(.34, panel, rect(px0 + 6, py0 + 6, px1 - px0 - 12, py1 - py0 - 12, 'none', { stroke: Sg, strokeWidth: 1.5 })), L(.48, stems), L(.6, leaves), L(.72, blooms)];
  },
};

const artNouveau: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [CX + 40, 320], label: 'Golden spiral', governs: 'The whiplash is laid on the golden spiral; the halo sits on its eye.' },
  foil: '#C49A45', foilStrength: .14, cta: '#A76A76', font: 'yeseva', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const [hx, hy] = c.cf.origin!;
    const R = 236;
    const halo = [circle(hx, hy, R, mix(Sg, .5), { label: 'Halo' }), P(raysD(hx, hy, 152, R - 14, 40, -90, 360, .5), Sg, { opacity: .55, label: 'Halo mosaic' }), circle(hx, hy, R, 'none', { stroke: I, strokeWidth: 2.4 }), circle(hx, hy, R - 14, 'none', { stroke: A, strokeWidth: 1.2 }), circle(hx, hy, 150, mix(P0, .3), { stroke: I, strokeWidth: 1.4 }), circle(hx, hy, 110, 'none', { stroke: Sg, strokeWidth: 1, opacity: .8 })];
    const arch = `M92 ${CALM_Y + 20} L92 220 Q92 70 ${CX} 62 Q${W - 92} 70 ${W - 92} 220 L${W - 92} ${CALM_Y + 20}`;
    const stem = chain([[[56, H - 30], [150, 980], [120, 820], [70, 640]], [[70, 640], [24, 470], [90, 300], [210, 190]], [[210, 190], [330, 90], [520, 60], [600, 150]], [[600, 150], [650, 210], [610, 270], [560, 240]]]);
    const branch = chain([[[70, 640], [180, 600], [230, 520], [200, 450]], [[200, 450], [180, 400], [230, 380], [250, 420]]]);
    const leaves: Obj[] = []; [[80, 760, -30], [40, 540, 30], [130, 300, -50], [330, 110, 70], [180, 560, 20], [470, 70, 100]].forEach(([x, y, d], i) => leaves.push(path(x - 30, y - 50, 60, 100, orn.leafPath(), i % 2 ? mix(I, .3) : I, { rotation: d, label: 'Leaf' })));
    const lily = (x: number, y: number, deg: number): Obj[] => [0, 1, 2].map(k => { const [px, py] = polar(x, y, 44, deg - 90 + (k - 1) * 38); return path(px - 30, py - 56, 60, 112, orn.leafPath(), k === 1 ? '#FFFDF4' : mix(P0, .45), { rotation: deg + (k - 1) * 38, stroke: I, strokeWidth: 2.2, label: 'Lily petal' }); }).concat([circle(x, y, 9, A, { label: 'Lily heart' }), circle(x - 10, y - 14, 4, Sg), circle(x + 10, y - 14, 4, Sg)]);
    return [
      L(.08, ground(c, P0, lg(90, [0, mix(P0, .25)], [1, P0]))),
      L(.24, halo),
      L(.4, S(arch, I, 3, 1, 'Organic frame'), S(arch.replace(/92/g, '104').replace(/62/, '74'), A, 1.2, .8)),
      L(.7, P(ribbonD(stem, 26, 4), I, { label: 'Whiplash' }), P(ribbonD(branch, 12, 3), mix(I, .2), { label: 'Tendril' }), leaves),
      L(.82, lily(560, 236, 200), lily(250, 418, 0), lily(204, 186, -40)),
    ];
  },
};

const vienna: EraPlateSpec = {
  cf: { kind: 'module', value: 17, label: 'The 48 px square', governs: 'Chequer, gold field, motif cells and margins are all whole or quarter squares.' },
  foil: '#D9B65A', foilStrength: .3, cta: '#8C6E22', font: 'federo', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value; const r = c.r;
    const chq: Obj[] = []; const cs = u / 4;
    for (let y = u, j = 0; y < H - u; y += cs, j++) for (let k = 0; k < 2; k++) { if ((j + k) % 2) continue; chq.push(rect(u * .5 + k * cs, y, cs, cs, I, { label: 'Chequer' }), rect(W - u * .5 - (k + 1) * cs, y, cs, cs, I, { label: 'Chequer' })); }
    const fx = 2.5 * u, fy = 1.5 * u, fw = 12 * u, fh = 13 * u;
    const field = [rect(fx, fy, fw, fh, A, { gradient: lg(120, [0, mix(A, .25)], [.5, A], [1, mix(A, -.18)]), label: 'Gold field' }), rect(fx, fy, fw, fh, 'none', { stroke: I, strokeWidth: 3 }), rect(fx + 8, fy + 8, fw - 16, fh - 16, 'none', { stroke: I, strokeWidth: .8 })];
    const black = [rect(fx + u, fy + u, 3 * u, 11 * u, I, { label: 'Black panel' })];
    for (let j = 0; j < 22; j++) for (let k = 0; k < 6; k++) if ((j + k) % 2 === 0) black.push(rect(fx + u + k * u / 2 + u / 8, fy + u + j * u / 2 + u / 8, u / 4, u / 4, P0, { label: 'Quadratl' }));
    const eyes: Obj[] = [];
    for (let j = 0; j < 12; j++) for (let k = 0; k < 7; k++) {
      if (r() < .35) continue; const x = fx + 4.6 * u + k * u + u / 2, y = fy + u + j * u + u / 2; const t = r();
      if (t < .5) eyes.push(circle(x, y, u * .36, 'none', { stroke: I, strokeWidth: 1.6, label: 'Eye' }), circle(x, y, u * .2, mix(A, .4), { stroke: I, strokeWidth: 1.2 }), circle(x, y, u * .07, I));
      else if (t < .8) eyes.push(rect(x - u * .3, y - u * .3, u * .6, u * .6, I, { label: 'Square' }), rect(x - u * .12, y - u * .12, u * .24, u * .24, A));
      else eyes.push(S(polyD(spiralPts(x, y, 1, u * .34, 2.2, 0), false), I, 1.6, 1, 'Spiral'));
    }
    const sq: Obj[] = []; for (let x = fx; x <= fx + fw - 10; x += 16) sq.push(rect(x, fy - u * .6, 8, 8, I, { label: 'Square rule' }));
    return [L(.08, ground(c)), L(.24, chq, sq), L(.42, field), L(.56, black), L(.66, eyes), L(.3, rect(CX - 1.5 * cs, 15.6 * u, cs * 3, cs * 3, Sg, { label: 'Quiet square' }))];
  },
};

const artDeco: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [CX, 806], label: 'Golden section setbacks', governs: 'Each tower setback is the one below ÷ √φ; ray and frieze spacing follow the same ratio.' },
  foil: '#E8C45A', foilStrength: .48, cta: '#D4AF37', font: 'limelight', fontStyle: 'normal 400', light: false,
  build: c => {
    const D = c.designer(0); const { paper: P0, ink: G, accent: A, secondary: Sg } = c; const phi = c.cf.value;
    const tiers: Obj[] = []; let w = 300, y = CALM_Y, h = 168;
    for (let k = 0; k < 4; k++) {
      const x = CX - w / 2; tiers.push(rect(x, y - h, w, h, mix(P0, .07), { stroke: G, strokeWidth: 1.6, label: 'Setback' }));
      for (let p = 1; p < 8; p++) tiers.push(line(x + w * p / 8, y - h + 10, x + w * p / 8, y - 6, G, p % 2 ? .8 : 2, { opacity: p % 2 ? .45 : .85, label: 'Pier' }));
      y -= h; w = w / Math.sqrt(phi); h = h / Math.sqrt(phi);
    }
    const crownW = w * 1.1, crownY = y;
    const crown = [
      ...[0, 1, 2, 3].map(k => P(`M${CX - crownW / 2 + k * 9} ${crownY} A${crownW / 2 - k * 9} ${crownW / 2 - k * 9} 0 0 1 ${CX + crownW / 2 - k * 9} ${crownY}`, 'none', { stroke: k % 2 ? A : G, strokeWidth: 3, label: 'Crown arch' })),
      P(raysD(CX, crownY, 8, crownW / 2 - 40, 7, -180, 180, .35), G, { opacity: .9, label: 'Crown sunburst' }),
      P(polyD([[CX - 9, crownY - crownW / 2 + 10], [CX + 9, crownY - crownW / 2 + 10], [CX, crownY - crownW / 2 - 150]]), G, { label: 'Spire' }),
    ];
    return [
      L(.05, byLabel(D, /^Black ground$/)),
      L(.18, byLabel(D, /^Sunburst$/)), L(.24, byLabel(D, /^Sunburst \(bright rays\)$/)),
      L(.48, byLabel(D, /^(Zigzag frieze|Head hairline|Foot hairline|Fan )/)),
      L(.7, tiers), L(.78, crown),
      L(.3, rect(0, CALM_Y, W, 3, G, { opacity: .8, label: 'Plinth line' }), rect(CX - 160, CALM_Y + 10, 320, 2, Sg, { opacity: .9 })),
    ];
  },
};

const bauhaus: EraPlateSpec = {
  cf: { kind: 'module', value: 9, label: 'Nine-unit module (90.7 px)', governs: 'Every plane, circle radius and rule sits on or spans whole units.' },
  foil: '#E8B923', foilStrength: .12, cta: '#D93A2F', font: 'archivoBlack', fontStyle: 'normal 400', light: true,
  build: c => {
    const { ink: I, accent: A, secondary: B } = c; const u = W / c.cf.value; const Y = '#E8B923';
    return [
      L(.1, ground(c)),
      L(.42, P(`M${u} ${5 * u} L${u} ${2 * u} A${3 * u} ${3 * u} 0 0 1 ${4 * u} ${5 * u} Z`, B, { label: 'Blue quarter' })),
      L(.5, rect(u, 5 * u, 7 * u, u * .2, I, { label: 'Bar' }), rect(7.6 * u - 2, 3.8 * u, 4, 4.4 * u, I, { label: 'Rule' })),
      L(.62, circle(6 * u, 2.6 * u, 1.7 * u, A, { label: 'Red circle' })),
      L(.7, P(polyD([[4.25 * u, 5 * u], [5.75 * u, 5 * u], [5 * u, 3.7 * u]]), Y, { label: 'Yellow triangle' }), rect(7.2 * u, .8 * u, .6 * u, .6 * u, I, { label: 'Black square' }), P(`M${5.2 * u} ${5.2 * u} A${.9 * u} ${.9 * u} 0 0 0 ${7 * u} ${5.2 * u} Z`, I, { label: 'Half disc' })),
      L(.3, circle(1.5 * u, 6.5 * u, .25 * u, A, { label: 'Point' }), line(u, 7 * u, 3 * u, 7 * u, I, 3)),
    ];
  },
};

const constructivist: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 18, label: 'The 18° diagonal', governs: 'The wedge, the bars, the band and the rays all lean at exactly 18°.' },
  foil: '#E04A3A', foilStrength: .1, cta: '#C9252D', font: 'anton', fontStyle: 'normal 400', relief: true, light: true,
  build: c => {
    const { ink: I, accent: A, secondary: Sg, paper: P0 } = c; const th = c.cf.value; const dir: Pt = [Math.cos(rad(-th)), Math.sin(rad(-th))];
    const along = (o: Pt, t: number): Pt => [o[0] + dir[0] * t, o[1] + dir[1] * t];
    const circ: Pt = [548, 312];
    const rays: Obj[] = []; for (let i = 0; i < 22; i++) { const a = 180 - th + 6 + i * 8.2; const [x, y] = polar(circ[0], circ[1], 1300, a); rays.push(line(circ[0], circ[1], x, y, I, 1, { opacity: .22, label: 'Ray' })); }
    const band = (o: Pt, len: number, w: number) => { const nx = -dir[1] * w / 2, ny = dir[0] * w / 2; const a = along(o, -len / 2), b = along(o, len / 2); return polyD([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]); };
    const tip: Pt = [circ[0] - 40, circ[1] + 12]; const baseC = along(tip, -560); const nrm: Pt = [-dir[1], dir[0]];
    const wedge = polyD([tip, [baseC[0] + nrm[0] * 150, baseC[1] + nrm[1] * 150], [baseC[0] - nrm[0] * 150, baseC[1] - nrm[1] * 150]]);
    const chevrons: Obj[] = []; for (let k = 0; k < 3; k++) { const o = along([150, 610], k * 70); chevrons.push(P(polyD([[0, 0], [34, 0], [60, 22], [34, 44], [0, 44], [26, 22]].map(([x, y]) => rot([o[0] + x, o[1] + y], o, -th))), k === 1 ? A : I, { label: 'Chevron' })); }
    return [
      L(.08, ground(c)), L(.14, rays),
      L(.28, P(band([300, 470], 900, 150), Sg, { opacity: .35, label: 'Grey plane' })),
      L(.46, circle(circ[0], circ[1], 196, I, { label: 'Black circle' }), circle(circ[0], circ[1], 150, 'none', { stroke: P0, strokeWidth: 1, opacity: .25 }), circle(circ[0] + 70, circ[1] - 60, 22, A, { label: 'Red point' })),
      L(.56, P(band([420, 560], 760, 22), I, { label: 'Bar' }), P(band([330, 640], 520, 9), I, { label: 'Bar' }), P(band([560, 676], 340, 40), A, { label: 'Red bar' }), chevrons),
      L(.82, P(wedge, A, { label: 'Red wedge' })),
      L(.3, rect(64, CALM_Y + 16, 54, 54, A, { rotation: -th, label: 'Red square' }), rect(128, CALM_Y + 30, 30, 30, I, { rotation: -th, label: 'Black square' })),
    ];
  },
};

const deStijl: EraPlateSpec = {
  cf: { kind: 'module', value: 12, label: 'Twelve-unit lattice (68 px)', governs: 'Every black rule and colour plane falls on a 68 px line; the lowest cell is the largest, and holds the words.' },
  foil: '#F2C42B', foilStrength: .1, cta: '#1D4E9E', font: 'archivo', fontStyle: 'normal 800', light: true,
  build: c => {
    const { ink: I, accent: R0, secondary: B } = c; const u = W / c.cf.value; const Y = '#F2C42B'; const t = 14;
    const vr = (x: number, y0: number, y1: number) => rect(x - t / 2, y0, t, y1 - y0, I, { label: 'Rule' });
    const hr = (y: number, x0: number, x1: number) => rect(x0, y - t / 2, x1 - x0, t, I, { label: 'Rule' });
    const yLow = 10.6 * u;
    return [
      L(.12, ground(c)),
      L(.55, rect(0, 0, 3 * u, 4 * u, R0, { label: 'Red plane' })),
      L(.45, rect(9 * u, 4 * u, 2 * u, 3 * u, B, { label: 'Blue plane' })),
      L(.6, rect(11 * u, 0, u, 1.6 * u, Y, { label: 'Yellow plane' }), rect(11 * u, H - 1.8 * u, u, 1.8 * u, Y, { label: 'Yellow plane' })),
      L(.5, rect(3 * u, 7 * u, 1.5 * u, yLow - 7 * u, I, { label: 'Black plane' })),
      L(.72, vr(3 * u, 0, yLow), vr(9 * u, 0, yLow), vr(11 * u, 0, H), hr(4 * u, 0, W), hr(7 * u, 3 * u, 11 * u), hr(yLow, 0, 11 * u), hr(1.6 * u, 11 * u, W), hr(H - 1.8 * u, 11 * u, W)),
    ];
  },
};

const dada: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 11, label: 'Chance, edited: tilts in steps of 11°', governs: 'Every slip and slab is turned by a multiple of 11°; nothing else about it is planned.' },
  foil: '#C9B48A', foilStrength: .1, cta: '#A92C2B', font: 'abril', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const a = c.cf.value;
    const gear = (cx: number, cy: number, R: number, teeth: number, col: string): Obj[] => {
      const pts: Pt[] = []; for (let i = 0; i < teeth * 4; i++) { const k = i % 4; pts.push(polar(cx, cy, k < 2 ? R : R * .84, (i + (k === 1 || k === 3 ? .1 : 0)) * 90 / teeth)); }
      return [P(`${polyD(pts)} ${circD(cx, cy, R * .3)}`, col, { label: 'Gear' }), circle(cx, cy, R * .62, 'none', { stroke: P0, strokeWidth: 3, opacity: .5, label: 'Gear rim' })];
    };
    const shadow = { x: 6, y: 8, blur: 10, color: 'rgba(0,0,0,.18)' };
    return [
      L(.08, ground(c)),
      L(.24, rect(70, 86, 420, 260, mix(P0, .45), { rotation: -a, shadow, label: 'Paper slip' }), rect(468, 520, 280, 160, mix(P0, -.08), { rotation: 2 * a, label: 'Paper slip' })),
      L(.36, ...orn.dotField(90, 120, 300, 190, 15, I, { rMin: 1, rMax: 6.5, grade: 'x', label: 'Halftone' }).map(o => ({ ...o, rotation: 0 }))),
      L(.5, gear(600, 250, 136, 14, I), gear(430, 400, 70, 9, A)),
      L(.62, rect(46, 430, 560, 100, I, { rotation: -a, label: 'Black slab' }), rect(330, 612, 400, 38, Sg, { rotation: 2 * a, label: 'Teal strip' })),
      L(.74, circle(170, 610, 64, 'none', { stroke: A, strokeWidth: 14, label: 'Target' }), circle(170, 610, 26, A), P(polyD([[560, 90], [740, 90], [740, 66], [790, 110], [740, 154], [740, 130], [560, 130]].map(p => rot(p as Pt, [670, 110], 3 * a))), A, { label: 'Arrow' }), rect(110, 380, 150, 26, mix(P0, .6), { rotation: -2 * a, shadow, label: 'Tape' })),
    ];
  },
};

const surrealist: EraPlateSpec = {
  cf: { kind: 'planes', value: 0, ratios: [.62, .38], label: 'Horizon at 62 / 38', governs: 'Sky and plain divide the art field at the golden ratio; every shadow meets the horizon’s light.' },
  foil: '#E9D8B0', foilStrength: .1, cta: '#8A3048', font: 'instrumentSerif', fontStyle: 'italic 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const hz = Math.round(CALM_Y * c.cf.ratios![0]);
    const door = { x: 156, w: 132, top: hz - 230 };
    return [
      L(.04, ground(c, P0, lg(90, [0, mix(Sg, -.25)], [.3, mix(Sg, .25)], [hz / H, mix(P0, .3)], [1, P0]))),
      L(.1, P(`M90 120 A60 60 0 1 0 150 200 A48 48 0 1 1 90 120 Z`, mix(P0, .6), { label: 'Moon' })),
      L(.22, rect(0, hz, W, H - hz, P0, { gradient: lg(90, [0, mix(P0, -.08)], [1, mix(P0, -.2)]), label: 'Plain' }), line(0, hz, W, hz, I, 1, { opacity: .35 })),
      L(.3, P(polyD([[door.x, hz], [door.x + door.w, hz], [door.x - 20, 980], [door.x - 200, 980]]), I, { opacity: .16, label: 'Long shadow' }), { ...circle(0, 0, 1, I), x: 470, y: hz + 170, w: 210, h: 26, opacity: .22, objectLabel: 'Sphere shadow' }),
      L(.42, path(560, 70, 220, 110, orn.blobPath(c.seed, 7, .2), '#FFFFFF', { opacity: .9, shadow: { x: 0, y: 14, blur: 18, color: 'rgba(0,0,0,.12)' }, label: 'Cloud' })),
      L(.56, rect(door.x, door.top, door.w, hz - door.top, I, { gradient: lg(90, [0, '#0b1030'], [1, mix(I, .1)]), label: 'Night through the door' }), ...[[190, door.top + 40], [240, door.top + 90], [210, door.top + 150], [262, door.top + 30]].map(([x, y]) => circle(x, y, 2.2, '#FFFFFF')), P(`M232 ${door.top + 60} A22 22 0 1 0 252 ${door.top + 92} A17 17 0 1 1 232 ${door.top + 60} Z`, '#F4ECD0', { label: 'Second moon' }), rect(door.x - 9, door.top - 9, door.w + 18, hz - door.top + 9, 'none', { stroke: mix(P0, -.35), strokeWidth: 10, label: 'Door frame' })),
      L(.74, circle(560, 300, 74, A, { gradient: rg([0, mix(A, .55)], [.55, A], [1, mix(A, -.45)]), label: 'Floating sphere' })),
    ];
  },
};

const swiss: EraPlateSpec = {
  cf: { kind: 'module', value: 8, label: 'Eight-column grid (102 px)', governs: 'Ring radii step by half a column; the red square and the rule hang from grid lines.' },
  foil: '#E12D2D', foilStrength: .06, cta: '#E12D2D', font: 'inter', fontStyle: 'normal 900', light: true,
  build: c => {
    const { ink: I, accent: A, secondary: Sg } = c; const u = W / c.cf.value; const o: Pt = [W - u * .5, u * .5];
    const arcs: Obj[] = []; for (let k = 1; k <= 11; k++) { const r = u * .58 * k; const w = k === 6 ? 30 : k % 3 === 0 ? 18 : 6; arcs.push(S(`M${f(o[0])} ${f(o[1] + r)} A${f(r)} ${f(r)} 0 0 1 ${f(o[0] - r)} ${f(o[1])}`, k === 6 ? A : k % 3 === 0 ? I : Sg, w, 1, 'Ring')); }
    return [L(.1, ground(c)), L(.62, arcs), L(.72, rect(u * .5, 4.5 * u, u, u, A, { label: 'Red square' })), L(.4, rect(u * .5, 6.4 * u, 6.5 * u, 4, I, { label: 'Rule' }), rect(u * .5, 6.4 * u + 12, 2 * u, 1.5, Sg))];
  },
};

const midcentury: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [W / PHI, 300], label: 'Golden section placement', governs: 'The kidney, boomerangs and starbursts are hung on the φ verticals and horizontals.' },
  foil: '#E8A55A', foilStrength: .12, cta: '#D65A3A', font: 'outfit', fontStyle: 'normal 800', light: true,
  build: c => {
    const { ink: I, accent: T, secondary: O, paper: P0 } = c; const gx = W / PHI, gy = CALM_Y / PHI;
    const burst = (x: number, y: number, r: number, n: number): Obj[] => [...orn.radialLines(x, y, 8, r, n, I, 2.2), ...Array.from({ length: n }, (_, i) => { const [px, py] = polar(x, y, r, -90 + i * 360 / n); return circle(px, py, 6, [T, O, I][i % 3]); }), circle(x, y, 8, I)];
    const balls: Obj[] = []; [[90, 70, 200, O], [150, 60, 150, T], [210, 80, 230, I], [270, 64, 170, O]].forEach(([x, y, l, col]) => { balls.push(line(x as number, y as number, (x as number) + 30, (y as number) + (l as number), I, 2), circle((x as number) + 30, (y as number) + (l as number), 16, col as string)); });
    return [
      L(.08, ground(c)),
      L(.32, path(70, gy - 120, 560, 330, orn.blobPath(c.seed + 3, 6, .3), T, { rotation: -14, label: 'Kidney' })),
      L(.46, path(gx - 40, 60, 300, 230, orn.boomerangPath(), O, { rotation: 18, label: 'Boomerang' }), path(170, gy + 150, 210, 150, orn.boomerangPath(), I, { rotation: -32, label: 'Boomerang' })),
      L(.6, burst(gx + 120, gy + 160, 86, 12), burst(gx - 80, gy - 40, 46, 8), rect(560, 120, 26, 26, P0, { rotation: 45, stroke: I, strokeWidth: 2 }), rect(120, 380, 18, 18, O, { rotation: 45 })),
      L(.74, balls, line(70, 70, 300, 60, I, 3, { label: 'Hang rail' })),
    ];
  },
};

const spaceAge: EraPlateSpec = {
  cf: { kind: 'radial', value: 3, origin: [620, 400], label: 'Orbits in 3 : 2 steps', governs: 'Each orbit is 1.5× the one inside it, all struck from the planet’s centre.' },
  foil: '#9FDDE6', foilStrength: .35, cta: '#EF603B', font: 'michroma', fontStyle: 'normal 400', light: false,
  build: c => {
    const D = without(c.designer(0), /^(Capsule label|Data rule)$/);
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /ground/i.test(l) ? .05 : /^Star/.test(l) ? .12 : /Far orbit/.test(l) ? .2 : /Tilted/.test(l) ? .56 : /^Orbit/.test(l) ? .3 : /planet/i.test(l) ? .62 : .74; };
    const by = new Map<number, Obj[]>(); for (const o of D) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const capsule = [P(`M150 470 L210 330 L250 330 L310 470 Z`, c.ink, { gradient: lg(0, [0, '#9aa6b8'], [.5, '#f4f6fa'], [1, '#7c879a']), label: 'Capsule' }), rect(205, 300, 50, 32, c.ink, { rx: 6, gradient: lg(0, [0, '#9aa6b8'], [.5, '#ffffff'], [1, '#7c879a']) }), circle(230, 400, 18, c.secondary, { stroke: c.paper, strokeWidth: 3, label: 'Porthole' }), P(`M175 470 L285 470 L270 500 L190 500 Z`, c.accent, { label: 'Heat shield' })];
    return [...[...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o)), L(.84, xf(capsule, -40, -120, .9, 230, 400).map(o => ({ ...o, rotation: o.rotation }))), L(.5, circle(620, 400, 150, 'none', { stroke: c.secondary, strokeWidth: 1, opacity: .4 }))];
  },
};

const psychedelic: EraPlateSpec = {
  cf: { kind: 'radial', value: 12, origin: [CX, 330], label: 'Twelve concentric ripples, 48 px apart', governs: 'Every ripple is the last one plus 48 px; the colour order repeats every four.' },
  foil: '#F7C62F', foilStrength: .3, cta: '#F7C62F', font: 'shrikhand', fontStyle: 'normal 400', light: false,
  build: c => {
    const { paper: V, ink: Pk, accent: Yw, secondary: Tl } = c; const [ox, oy] = c.cf.origin!; const n = c.cf.value;
    const cols = [Pk, Yw, Tl, V];
    const rings: Layer[] = [];
    for (let k = n + 6; k >= 1; k--) rings.push(L(.16 + .5 * (1 - k / (n + 6)), P(wobbleD(ox, oy, 30 + k * 48, [[5, .05, k * .7], [9, .025, -k * .5]], 160), cols[k % 4], { label: 'Ripple' })));
    const pool = `M0 ${CALM_Y - 40} C 140 ${CALM_Y - 110} 260 ${CALM_Y + 30} 408 ${CALM_Y - 30} C 560 ${CALM_Y - 90} 680 ${CALM_Y + 20} 816 ${CALM_Y - 60} L816 1224 L0 1224 Z`;
    const petals: Obj[] = []; for (let i = 0; i < 12; i++) { const [x, y] = polar(ox, oy, 52, i * 30); petals.push({ ...circle(0, 0, 1, i % 2 ? Yw : Pk), x: x - 18, y: y - 44, w: 36, h: 88, rotation: i * 30 + 90, objectLabel: 'Petal' }); }
    return [L(.06, ground(c)), ...rings, L(.46, P(pool, V, { label: 'Violet pool' }), S(pool.split(' L816')[0].replace(/(\d+) (\d+)/g, (_, a, b) => `${a} ${+b + 26}`), Pk, 5, .9), S(pool.split(' L816')[0].replace(/(\d+) (\d+)/g, (_, a, b) => `${a} ${+b + 50}`), Yw, 3, .7)), L(.86, petals, circle(ox, oy, 26, V, { stroke: Tl, strokeWidth: 6, label: 'Eye' }))];
  },
};

const punk: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 4, label: 'Nothing square: 4° off', governs: 'Band, tape and cut-outs are all knocked 4° (or twice that) off the grid.' },
  foil: '#D71920', foilStrength: .06, cta: '#D71920', font: 'permanentMarker', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const a = c.cf.value; const r = c.r;
    const hc: Pt = [520, 470], hr = 180; const dots: Obj[] = [];
    for (let y = hc[1] - hr; y <= hc[1] + hr; y += 13) for (let x = hc[0] - hr; x <= hc[0] + hr; x += 13) { const d = Math.hypot(x - hc[0], y - hc[1]); if (d > hr) continue; const tone = .5 + .5 * Math.sin((x - y) / 90) * Math.cos(d / 60); dots.push(circle(x, y, 1 + 5.4 * tone, I, { label: 'Xerox halftone' })); }
    const tape = (x: number, y: number, w: number, deg: number) => rect(x, y, w, 34, mix(P0, -.12), { rotation: deg, opacity: .82, label: 'Tape' });
    const cut: Obj[] = []; for (let i = 0; i < 9; i++) { const x = 70 + i * 74, y = 360 + (i % 3) * 14; cut.push(rect(x, y, 52, 64, [I, A, mix(P0, .6), Sg][i % 4], { rotation: (i % 2 ? a : -2 * a), stroke: I, strokeWidth: i % 4 === 2 ? 2 : 0, label: 'Ransom cut-out' })); }
    const pin: Pt = [140, 600];
    return [
      L(.08, ground(c)),
      L(.42, P(tornBandD(-20, W + 20, 70, 300, 26, c.seed, -a), I, { label: 'Torn black band' })),
      L(.36, dots),
      L(.6, cut),
      L(.7, circle(hc[0] + 60, hc[1] - 40, 112, 'none', { stroke: A, strokeWidth: 16, opacity: .92, label: 'Stencil ring' }), P(boxD(hc[0] + 60, hc[1] - 40, 300, 18, 40), A, { label: 'Slash' })),
      L(.86, tape(40, 52, 150, -2 * a), tape(620, 270, 170, 3 * a), tape(330, 640, 140, -a), S(`M${pin[0]} ${pin[1]} L${pin[0] + 230} ${pin[1] - 40} M${pin[0] + 4} ${pin[1] + 14} L${pin[0] + 222} ${pin[1] - 24}`, Sg, 5, 1, 'Safety pin'), circle(pin[0] - 6, pin[1] + 8, 13, 'none', { stroke: Sg, strokeWidth: 5 }), rect(pin[0] + 214, pin[1] - 50, 30, 34, Sg, { rotation: -10, rx: 6 })),
      L(.2, ...Array.from({ length: 6 }, () => rect(60 + r() * 680, CALM_Y + 10 + r() * 40, 10 + r() * 30, 4, I, { rotation: (r() - .5) * 20, opacity: .7 }))),
    ];
  },
};

const newWave: EraPlateSpec = {
  cf: { kind: 'module', value: 7, label: 'Elastic 7-unit grid (116 px)', governs: 'Columns are 1, 2, 3 and 1 units wide; the stair, the band and the screens break on unit lines.' },
  foil: '#E34877', foilStrength: .08, cta: '#E34877', font: 'syne', fontStyle: 'normal 800', light: true,
  build: c => {
    const { ink: I, accent: Pk, secondary: Tl } = c; const u = W / c.cf.value;
    return [
      L(.08, ground(c)),
      L(.3, rect(5 * u, 0, 1.3 * u, CALM_Y, Tl, { label: 'Teal band' }), ...[1, 2, 3, 4].map(k => line(0, k * u * 1.4, k * u, k * u * 1.4, I, 1, { opacity: .35 }))),
      L(.42, orn.dotField(2.4 * u, .6 * u, 2.6 * u, 2.2 * u, 14, I, { rMin: .8, rMax: 6, grade: 'x', label: 'Dot screen' })),
      L(.52, rect(.7 * u, 2.8 * u, 1.8 * u, 1.8 * u, Pk, { label: 'Pink square' }), rect(2 * u, 3.6 * u, 2.8 * u, 1.4 * u, Tl, { opacity: .6, blend: 'multiply', label: 'Overlap' }), rect(3.3 * u, 2 * u, 1.6 * u, 2.6 * u, Pk, { opacity: .55, blend: 'multiply', label: 'Overlap' })),
      L(.66, S(`M${.4 * u} ${u} H${1.9 * u} V${1.7 * u} H${3.3 * u} V${2.4 * u} H${4.5 * u} V${3.3 * u} H${6.6 * u}`, I, 4, 1, 'Stair line'), circle(5.6 * u, 1.5 * u, u * .95, 'none', { stroke: I, strokeWidth: 2, label: 'Circle' }), P(polyD([[.6 * u, 5.5 * u], [1.4 * u, 5.5 * u], [u, 4.9 * u]]), I, { label: 'Triangle' }), rect(6.2 * u, 4.6 * u, .3 * u, .3 * u, Pk)),
    ];
  },
};

const memphis: EraPlateSpec = {
  cf: { kind: 'dots', value: 24, label: '24 px dot grid', governs: 'Every squiggle, block, stripe and corner starts on a 24 px grid point.' },
  foil: '#FFFFFF', foilStrength: .08, cta: '#EF5C79', font: 'rubikMono', fontStyle: 'normal 400', light: true,
  build: c => {
    const { ink: I, accent: Pk, secondary: Tl } = c; const g = c.cf.value; const r = c.r;
    const squig: Obj[] = [rect(2 * g, 2 * g, 14 * g, 10 * g, '#FFFFFF', { stroke: I, strokeWidth: 4, label: 'Bacterio panel' })];
    for (let i = 0; i < 46; i++) squig.push(path(2.5 * g + r() * 12 * g, 2.4 * g + r() * 9 * g, 26, 12, orn.sineOpenPath(2, 40), 'none', { stroke: I, strokeWidth: 2.4, rotation: r() * 180, open: true, label: 'Squiggle' }));
    const chk: Obj[] = [rect(22 * g, 3 * g, 9 * g, 6 * g, '#FFFFFF', { stroke: I, strokeWidth: 3 }), ...orn.checker(22 * g, 3 * g, 9 * g, 6 * g, g, I, { label: 'Checker' })];
    const zig = S(polyD(Array.from({ length: 15 }, (_, i) => [2 * g + i * 2 * g, (i % 2 ? 26 : 28.5) * g] as Pt), false), I, 6, 1, 'Zigzag');
    const stripes: Obj[] = []; for (let i = 0; i < 6; i++) stripes.push(line(18 * g + i * g, 17 * g, 23 * g + i * g, 12 * g, I, 4, { label: 'Stripe' }));
    return [
      L(.1, ground(c)),
      L(.34, P(`M${19 * g} ${24 * g} A${7 * g} ${7 * g} 0 0 1 ${33 * g} ${24 * g} Z`, Pk, { label: 'Pink semicircle' })),
      L(.44, squig), L(.5, chk, stripes),
      L(.62, P(polyD([[6 * g, 21 * g], [14 * g, 21 * g], [10 * g, 14 * g]]), Tl, { stroke: I, strokeWidth: 3, label: 'Teal triangle' }), circle(28 * g, 13 * g, 2.5 * g, Pk, { stroke: I, strokeWidth: 4, label: 'Pink circle' }), zig),
      L(.8, orn.confetti(g, g, W - 2 * g, 22 * g, 26, [I, Pk, Tl, '#FFFFFF'], c.seed, 1)),
    ];
  },
};

const grunge: EraPlateSpec = {
  cf: { kind: 'diagonal', value: 6, label: 'Misregistration at 6°', governs: 'Strokes cross at ±6°; the second impression of every ring is offset 8 px down-right.' },
  foil: '#C9B98E', foilStrength: .1, cta: '#C26A45', font: 'specialElite', fontStyle: 'normal 400', light: false,
  build: c => {
    const { paper: P0, ink: I, accent: R0, secondary: O } = c; const a = c.cf.value; const r = c.r;
    const scratches: Obj[] = []; for (let i = 0; i < 34; i++) { const x = r() * W, y = 40 + r() * (CALM_Y - 80), l = 30 + r() * 140, d = (r() - .5) * 2 * a + (r() < .3 ? 90 : 0); const [x2, y2] = polar(x, y, l, d); scratches.push(line(x, y, x2, y2, I, .8 + r() * 1.2, { opacity: .35 + r() * .35, label: 'Scratch' })); }
    return [
      L(.06, ground(c, P0, lg(90, [0, mix(P0, .06)], [.55, P0], [1, mix(P0, -.55)]))),
      L(.24, path(-60, 90, 900, 190, orn.brushStrokePath(c.seed), R0, { rotation: -a, opacity: .92, label: 'Rust stroke' }), path(-20, 330, 880, 150, orn.brushStrokePath(c.seed + 4), O, { rotation: a, opacity: .9, label: 'Olive stroke' })),
      L(.34, scratches),
      L(.5, P(tornBandD(-20, W + 20, -40, 54, 30, c.seed + 9), I, { label: 'Torn head' }), path(60, 500, 640, 70, orn.brushStrokePath(c.seed + 7), I, { rotation: -a / 2, label: 'Black stroke' })),
      L(.66, circle(590, 290, 118, 'none', { stroke: R0, strokeWidth: 12, opacity: .85, label: 'First impression' }), circle(598, 298, 118, 'none', { stroke: I, strokeWidth: 5, opacity: .8, label: 'Second impression' })),
      L(.8, rect(30, 600, 210, 40, mix(O, .3), { rotation: -2 * a, opacity: .85, label: 'Duct tape' }), P(boxD(220, 230, 230, 16, 45), I, { label: 'Cross stroke' }), P(boxD(220, 230, 230, 16, -45), I, { label: 'Cross stroke' })),
    ];
  },
};

const brutalist: EraPlateSpec = {
  cf: { kind: 'module', value: 12, label: 'Exposed 68 px structural grid', governs: 'The frame, the slab and the blue bay are whole bays of the grid that stays on show.' },
  foil: '#0047FF', foilStrength: .06, cta: '#0047FF', font: 'spaceMono', fontStyle: 'normal 700', light: true,
  build: c => {
    const { ink: I, accent: B, secondary: R0, paper: P0 } = c; const u = W / c.cf.value;
    const grid: Obj[] = []; for (let x = 4 * u; x < W; x += 4 * u) grid.push(line(x, 24, x, H - 24, I, 1, { opacity: .14, label: 'Structural line' })); for (let y = 4 * u; y < H; y += 4 * u) grid.push(line(24, y, W - 24, y, I, 1, { opacity: .14, label: 'Structural line' }));
    const cross = (x: number, y: number): Obj[] => [circle(x, y, 16, 'none', { stroke: I, strokeWidth: 2, label: 'Registration' }), line(x - 26, y, x + 26, y, I, 2), line(x, y - 26, x, y + 26, I, 2)];
    const bars: Obj[] = []; let x = 24 + u; [6, 2, 2, 10, 2, 4, 2, 2, 8, 2, 6, 2, 2, 4, 12, 2, 2, 6].forEach((w, i) => { if (i % 2 === 0) bars.push(rect(x, 6.4 * u, w, 1.3 * u, I, { label: 'Data bar' })); x += w + 4; });
    return [
      L(.08, ground(c)), L(.16, grid),
      L(.5, rect(24, 24, 6 * u, 5 * u, I, { label: 'Concrete slab' }), rect(24 + u, 24 + u, 2 * u, 2 * u, 'none', { stroke: P0, strokeWidth: 1.5 })),
      L(.62, rect(6 * u + 24, 3 * u, 4 * u, 2 * u, B, { label: 'Blue bay' })),
      L(.7, circle(10.4 * u, 1.4 * u, .5 * u, R0, { label: 'Red point' }), cross(2 * u, 8.4 * u), cross(10 * u, 8.4 * u), bars),
      L(.76, rect(12, 12, W - 24, H - 24, 'none', { stroke: I, strokeWidth: 12, label: 'Frame' })),
    ];
  },
};

const minimalist: EraPlateSpec = {
  cf: { kind: 'golden', value: PHI, origin: [W / PHI, CALM_Y / PHI], label: 'Golden section, and nothing else', governs: 'The stack hangs on the φ vertical; the single red square sits on the φ horizontal.' },
  foil: '#D9D6CE', foilStrength: .06, cta: '#9A3E35', font: 'manrope', fontStyle: 'normal 300', light: true,
  build: c => {
    const { ink: I, accent: G, secondary: R0 } = c; const gx = W / PHI, gy = CALM_Y / PHI;
    const stack: Obj[] = []; for (let i = 0; i < 7; i++) { const y = 84 + i * 80; stack.push(rect(gx - 90, y, 180, 40, G, { label: 'Unit' }), rect(gx - 90, y + 36, 180, 4, mix(G, -.22))); }
    return [L(.1, ground(c)), L(.6, stack), L(.72, rect(W / PHI ** 2 - 20 - 120, gy - 20, 40, 40, R0, { label: 'Red square' })), L(.2, line(64, CALM_Y + 40, W - 64, CALM_Y + 40, I, .8, { opacity: .35 }))];
  },
};

const postmodern: EraPlateSpec = {
  cf: { kind: 'axis', value: 4, label: 'Quoted axis, four bays', governs: 'The pediment, columns and plinth are stretched across four equal bays of the classical axis.' },
  foil: '#C34E62', foilStrength: .08, cta: '#C34E62', font: 'dmSerif', fontStyle: 'italic 400', light: true,
  build: c => {
    const D = without(c.designer(0), /^Colour chip$/);
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /ground/i.test(l) ? .08 : /shadow/i.test(l) ? .36 : /column|Fluting|capital|base/i.test(l) ? .56 : /Plinth|Step/.test(l) ? .48 : .64; };
    const by = new Map<number, Obj[]>(); for (const o of D) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const conf = orn.confetti(60, 60, W - 120, 640, 10, [c.accent, c.secondary, c.ink], c.seed, .9).filter(o => o.x < 150 || o.x > W - 170);
    const layers = [...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o));
    return [layers[0], L(.14, circle(CX, 260, 236, c.accent, { opacity: .22, label: 'Pink sun' })), ...layers.slice(1), L(.76, conf)];
  },
};

const vaporwave: EraPlateSpec = {
  cf: { kind: 'planes', value: 0, ratios: [.49, .51], label: 'One vanishing point at 49%', governs: 'The horizon, the sun’s cut lines and the floor grid all converge on one point.' },
  foil: '#61DCEB', foilStrength: .4, cta: '#F66BC5', font: 'audiowide', fontStyle: 'normal 400', light: false,
  build: c => {
    const D = without(c.designer(0), /^Deck rule$/);
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /Sky ground/.test(l) ? .05 : /Star/.test(l) ? .1 : /sun|Sun cut/i.test(l) ? .24 : /Floor/.test(l) ? .3 : /Perspective/.test(l) ? .42 : /Horizon/.test(l) ? .3 : /Glitch/.test(l) ? .6 : .4; };
    const by = new Map<number, Obj[]>(); for (const o of D) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const palm = (x: number, s: number): Obj[] => {
      const trunk = chain([[[x, 760], [x + s * 10, 640], [x + s * 40, 520], [x + s * 70, 420]]]);
      const top = trunk[trunk.length - 1]; const out: Obj[] = [P(ribbonD(trunk, 20, 9), '#120a28', { label: 'Palm trunk' })];
      [-160, -120, -75, -30, 15, 55, 100].forEach((d, i) => { const a = d + (s < 0 ? 180 : 0) * 0; const end = polar(top[0], top[1], 150 + (i % 2) * 30, a); const mid = polar(top[0], top[1], 80, a - 12); out.push(P(ribbonD(bez(top, mid, [mid[0], mid[1] + 20], [end[0], end[1] + 40], 16), 22, 2), '#120a28', { label: 'Frond' })); });
      return out;
    };
    return [...[...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o)), L(.8, palm(70, 1), palm(W - 70, -1))];
  },
};

const y2k: EraPlateSpec = {
  cf: { kind: 'radial', value: 8, origin: [560, 300], label: 'Bubble scale in 8 steps of √2', governs: 'Bubbles and the chrome ring grow by √2 from one optical centre.' },
  foil: '#C9D4FF', foilStrength: .14, cta: '#4D68FF', font: 'unbounded', fontStyle: 'normal 700', light: true,
  build: c => {
    const { paper: P0, ink: B, accent: M, secondary: Pu } = c; const [ox, oy] = c.cf.origin!;
    const chrome = lg(60, [0, '#FFFFFF'], [.25, '#AEB8D8'], [.5, '#FFFFFF'], [.72, '#6E7BA8'], [1, '#E6EBFF']);
    const bubble = (x: number, y: number, r: number): Obj[] => [circle(x, y, r, '#FFFFFF', { opacity: .18, stroke: '#FFFFFF', strokeWidth: 2, label: 'Bubble' }), { ...circle(0, 0, 1, '#FFFFFF'), x: x - r * .55, y: y - r * .62, w: r * .5, h: r * .3, rotation: -30, opacity: .85, objectLabel: 'Glint' }];
    const sparkle = (x: number, y: number, s: number) => P(starD(x, y, s, s * .16, 4, -90), '#FFFFFF', { label: 'Sparkle' });
    const bubbles: Obj[] = []; for (let k = 0; k < 8; k++) { const r = 10 * Math.SQRT2 ** k; const [x, y] = polar(ox, oy, 120 + r * 1.6, 200 + k * 47); bubbles.push(...bubble(x, y, r * .7)); }
    return [
      L(.06, ground(c, P0, lg(90, [0, mix(P0, .5)], [.6, P0], [1, mix(Pu, .7)]))),
      L(.14, circle(160, 220, 260, M, { opacity: .5, blur: 50, label: 'Iridescence' }), circle(640, 560, 240, Pu, { opacity: .25, blur: 60 }), circle(ox, oy, 220, B, { opacity: .14, blur: 50 })),
      L(.66, path(110, 360, 420, 300, orn.blobPath(c.seed + 2, 7, .28), '#FFFFFF', { gradient: chrome, shadow: { x: 0, y: 18, blur: 26, color: 'rgba(60,70,140,.28)' }, label: 'Chrome blob' })),
      L(.78, P(ringD(ox, oy, 70, 128), '#FFFFFF', { gradient: chrome, label: 'Chrome torus' }), { ...circle(0, 0, 1, 'none'), x: ox - 230, y: oy - 60, w: 460, h: 120, rotation: -16, stroke: B, strokeWidth: 3, opacity: .8, objectLabel: 'Orbit' }),
      L(.88, bubbles, sparkle(330, 140, 34), sparkle(720, 120, 22), sparkle(120, 640, 26), sparkle(470, 690, 16)),
    ];
  },
};

const solarpunk: EraPlateSpec = {
  cf: { kind: 'planes', value: 0, ratios: [.5, .32, .18], label: 'Sky / settlement / garden, 50 : 32 : 18', governs: 'Sun and turbine live in the sky half; the dome in the middle band; leaves own the foreground.' },
  foil: '#F2B84B', foilStrength: .14, cta: '#24705A', font: 'fraunces', fontStyle: 'normal 600', light: true,
  build: c => {
    const { paper: P0, ink: G, accent: Sun, secondary: Lf } = c; const r = c.r; const [a, b] = c.cf.ratios!; const y1 = CALM_Y * a, y2 = CALM_Y * (a + b);
    const dc: Pt = [330, y2 + 20], dr = 210; const dome: Obj[] = [P(`M${dc[0] - dr} ${dc[1]} A${dr} ${dr} 0 0 1 ${dc[0] + dr} ${dc[1]} Z`, Lf, { opacity: .22, stroke: G, strokeWidth: 3, label: 'Glasshouse dome' })];
    for (let k = 1; k < 4; k++) { const yy = dc[1] - dr * Math.sin(rad(k * 22.5)), hw = dr * Math.cos(rad(k * 22.5)); dome.push(line(dc[0] - hw, yy, dc[0] + hw, yy, G, 1.6)); }
    for (let k = 1; k < 8; k++) { const ang = 180 + k * 22.5; const [ex, ey] = polar(dc[0], dc[1], dr, ang); dome.push(line(dc[0] + (ex - dc[0]) * .0, dc[1] - dr, ex, ey, G, 1.4, { opacity: .8 })); }
    const turbine: Obj[] = [line(680, y2 + 40, 680, y1 - 120, G, 6, { label: 'Turbine mast' }), ...[0, 120, 240].map(d => { const [ex, ey] = polar(680, y1 - 120, 120, d - 70); return P(ribbonD([[680, y1 - 120], [ex, ey]], 16, 4), '#FFFFFF', { stroke: G, strokeWidth: 1.5, label: 'Blade' }); }), circle(680, y1 - 120, 10, G)];
    const panels: Obj[] = [0, 1, 2].map(i => P(polyD([[520 + i * 70, y2 + 10], [580 + i * 70, y2 + 10], [570 + i * 70, y2 - 30], [516 + i * 70, y2 - 30]]), G, { opacity: .9, label: 'Solar panel' }));
    const hills = [P(`M0 ${y2 + 30} C 200 ${y2 - 40} 420 ${y2 + 60} 816 ${y2 - 10} L816 ${CALM_Y + 40} L0 ${CALM_Y + 40} Z`, Lf, { label: 'Hill' }), P(`M0 ${CALM_Y - 10} C 260 ${y2 + 10} 520 ${CALM_Y + 10} 816 ${y2 + 60} L816 ${CALM_Y + 60} L0 ${CALM_Y + 60} Z`, mix(G, .2), { label: 'Terrace' })];
    const leaves: Obj[] = []; for (let i = 0; i < 26; i++) { const x = r() * W, y = y2 + r() * (CALM_Y - y2); leaves.push(path(x - 18, y - 30, 36, 60, orn.leafPath(), i % 3 ? G : Lf, { rotation: (r() - .5) * 120, label: 'Leaf' })); }
    const vine: Obj[] = []; const vp = chain([[[40, CALM_Y], [10, 500], [80, 300], [40, 80]]]); vine.push(S(polyD(vp, false), G, 3)); vp.forEach(([x, y], i) => { if (i % 3) return; vine.push(path(x + (i % 2 ? 0 : -30), y - 20, 30, 40, orn.leafPath(), i % 6 ? Lf : G, { rotation: i % 2 ? 50 : -50, label: 'Climbing leaf' })); });
    return [
      L(.06, ground(c, P0, lg(90, [0, mix(Sun, .7)], [.5, P0], [1, P0]))),
      L(.14, circle(600, 170, 190, Sun, { opacity: .3, blur: 30, label: 'Sun glow' }), circle(600, 170, 100, Sun, { label: 'Sun' })),
      L(.3, turbine), L(.44, dome, panels), L(.56, hills), L(.74, leaves), L(.82, vine),
    ];
  },
};

const afrofuturist: EraPlateSpec = {
  cf: { kind: 'radial', value: 12, origin: [CX, 400], label: 'Twelve-fold radiance', governs: 'Rays, crown rings and chevrons are struck from one centre in 30° steps.' },
  foil: '#E6B84A', foilStrength: .45, cta: '#E6B84A', font: 'orbitron', fontStyle: 'normal 800', light: false,
  build: c => {
    const D = without(c.designer(0), /^(Title rule|Deck rule|Drum ring)$/);
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /ground/i.test(l) ? .05 : /Radiance/.test(l) ? .12 : /Star/.test(l) ? .16 : /ray/i.test(l) ? .24 : /teal/.test(l) ? .5 : /Crown ring/.test(l) ? .42 : /Chevron/.test(l) ? .7 : .4; };
    const by = new Map<number, Obj[]>(); for (const o of D) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const [ox, oy] = c.cf.origin!;
    const planet = [P(`M-40 ${CALM_Y + 30} Q ${CX} ${CALM_Y - 120} ${W + 40} ${CALM_Y + 30} L${W + 40} ${H} L-40 ${H} Z`, mix(c.paper, -.3), { label: 'Planet horizon' }), S(`M-40 ${CALM_Y + 30} Q ${CX} ${CALM_Y - 120} ${W + 40} ${CALM_Y + 30}`, c.secondary, 3, .9)];
    return [...[...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o)), L(.6, P(starD(ox, oy, 70, 28, 12), c.accent, { opacity: .95, label: 'Twelve-point star' }), circle(ox, oy, 24, c.paper, { stroke: c.secondary, strokeWidth: 4 })), L(.32, planet)];
  },
};

const harlem: EraPlateSpec = {
  cf: { kind: 'radial', value: 6, origin: [600, 150], label: 'Six concentric light bands', governs: 'Light falls in six concentric bands from one source; the city and the rhythm bars stand in them.' },
  foil: '#D8B35E', foilStrength: .12, cta: '#9D3A30', font: 'gloock', fontStyle: 'normal 400', relief: true, light: true,
  build: c => {
    const { paper: P0, ink: I, accent: A, secondary: Sg } = c; const [ox, oy] = c.cf.origin!; const r = c.r; const n = c.cf.value;
    const bands: Obj[] = []; for (let k = n; k >= 1; k--) bands.push(circle(ox, oy, 110 * k, k % 2 ? Sg : mix(Sg, .3), { opacity: .16 + .03 * (n - k), label: 'Light band' }));
    const shafts = [P(polyD([[ox, oy], [40, CALM_Y], [200, CALM_Y]]), P0, { opacity: .3, label: 'Light shaft' }), P(polyD([[ox, oy], [330, CALM_Y], [430, CALM_Y]]), P0, { opacity: .22, label: 'Light shaft' })];
    const city: Obj[] = []; let x = 0;
    while (x < W) { const w = 46 + r() * 70, h = 90 + r() * 170; const top = CALM_Y - h; city.push(rect(x, top, w + 1, h, I, { label: 'Building' })); for (let wy = top + 14; wy < CALM_Y - 16; wy += 20) for (let wx = x + 8; wx < x + w - 10; wx += 14) if (r() < .45) city.push(rect(wx, wy, 6, 9, A, { opacity: .55 + r() * .4, label: 'Lit window' })); if (r() < .35) city.push(rect(x + w / 2 - 12, top - 34, 24, 26, I, { label: 'Water tower' }), P(polyD([[x + w / 2 - 15, top - 34], [x + w / 2 + 15, top - 34], [x + w / 2, top - 52]]), I), line(x + w / 2 - 9, top - 8, x + w / 2 - 9, top, I, 2), line(x + w / 2 + 9, top - 8, x + w / 2 + 9, top, I, 2)); x += w; }
    const bars: Obj[] = []; let bx = 56; [14, 6, 22, 6, 10, 30, 6, 14, 6, 18].forEach((w, i) => { bars.push(rect(bx, 120 + (i % 3) * 18, w, 300 - (i % 4) * 30, i % 3 === 1 ? A : I, { label: 'Rhythm bar' })); bx += w + 8; });
    return [L(.06, ground(c)), L(.14, bands), L(.22, shafts), L(.46, bars), L(.66, city), L(.3, rect(0, CALM_Y, W, 4, A, { label: 'Kerb' }))];
  },
};

const ukiyoe: EraPlateSpec = {
  cf: { kind: 'planes', value: 0, ratios: [.6, .3, .1], label: 'Three planes, 60 : 30 : 10', governs: 'Sky field, middle-ground water and the cropped foreground branch take 60, 30 and 10% of the art field.' },
  foil: '#E9C77A', foilStrength: .1, cta: '#B94335', font: 'shippori', fontStyle: 'normal 700', relief: true, light: true,
  build: c => {
    const { paper: P0, ink: Ind, accent: R0, secondary: Gd } = c; const [a, b] = c.cf.ratios!; const y1 = CALM_Y * a, y2 = CALM_Y * (a + b);
    const mist = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, P0, { rx: h / 2, opacity: .94, label: 'Kasumi mist' });
    const water: Obj[] = [rect(0, y1, W, y2 - y1 + 4, mix(Ind, .55), { gradient: lg(90, [0, mix(Ind, .35)], [1, mix(Ind, .7)]), label: 'Water' })];
    for (let k = 0; k < 7; k++) { const y = y1 + 18 + k * (y2 - y1 - 20) / 7; water.push(path(-20, y - 8, W + 40, 16, orn.sineOpenPath(9 + k, 30, k), 'none', { stroke: k % 2 ? mix(Ind, -.1) : P0, strokeWidth: 2, open: true, opacity: .7, label: 'Ripple line' })); }
    const pk: Pt = [440, y1 - 210];
    const mountain = [P(polyD([[150, y1 + 2], [pk[0] - 30, pk[1] + 10], pk, [pk[0] + 40, pk[1] + 14], [W - 40, y1 + 2]]), mix(Ind, .2), { label: 'Distant mountain' }), P(polyD([[pk[0] - 30, pk[1] + 10], pk, [pk[0] + 40, pk[1] + 14], [pk[0] + 70, pk[1] + 66], [pk[0] + 40, pk[1] + 52], [pk[0] + 18, pk[1] + 74], [pk[0] - 6, pk[1] + 50], [pk[0] - 32, pk[1] + 70], [pk[0] - 60, pk[1] + 60]]), P0, { label: 'Snow' })];
    const branch = chain([[[-30, 70], [120, 40], [250, 120], [420, 110]], [[420, 110], [500, 105], [560, 150], [610, 140]]]);
    const needles: Obj[] = []; branch.forEach(([x, y], i) => { if (i % 5) return; for (let k = 0; k < 9; k++) { const [ex, ey] = polar(x, y, 36 + (k % 3) * 8, 200 + k * 18 + (i % 2) * 9); needles.push(line(x, y, ex, ey, mix(Ind, -.35), 2.2, { label: 'Pine needles' })); } });
    return [
      L(.06, ground(c)),
      L(.08, rect(0, 0, W, y1, Ind, { gradient: lg(90, [0, Ind], [.62, mix(Ind, .5), .6], [1, P0, 0]), label: 'Bokashi sky' })),
      L(.14, circle(600, 210, 66, R0, { label: 'Sun' })),
      L(.22, mountain), L(.3, mist(-40, y1 - 70, 520, 34), mist(380, y1 - 30, 520, 26), mist(-60, 250, 340, 24)),
      L(.4, water),
      L(.54, rect(0, y2, W, 6, Gd, { label: 'Shore line' }), P(`M0 ${y2} Q ${CX} ${y2 + 30} ${W} ${y2} L${W} ${y2 + 8} Q ${CX} ${y2 + 38} 0 ${y2 + 8} Z`, mix(Gd, .3), { label: 'Sandbar' })),
      L(.86, P(ribbonD(branch, 30, 8), mix(Ind, -.45), { label: 'Pine branch' }), needles),
    ];
  },
};

const islamic: EraPlateSpec = {
  cf: { kind: 'radial', value: 8, origin: [CX, 438], label: 'Eight-fold star on a square grid', governs: 'One eight-point star, rotated in 45° steps, generates the bands, the rosette and the corners.' },
  foil: '#D9AE4E', foilStrength: .14, cta: '#155A63', font: 'amiri', fontStyle: 'normal 700', light: true,
  build: c => {
    const D = without(c.designer(0), /^(Title rule|Base star)$/);
    const centre = /^(Interlaced ring|Inner ring|Eight-point star field|Rotated inner star|Apex star)$/;
    const motif = xf(byLabel(D, centre), 0, -70);
    const rest = D.filter(o => !centre.test(o.objectLabel || ''));
    const dep = (o: Obj) => { const l = o.objectLabel || ''; return /^Paper$/.test(l) ? .06 : /band|tessellation|Cross/i.test(l) ? .36 : /frame|hairline/i.test(l) ? .2 : .5; };
    const by = new Map<number, Obj[]>(); for (const o of rest) by.set(dep(o), [...(by.get(dep(o)) || []), o]);
    const [ox, oy] = c.cf.origin!;
    return [...[...by].sort((a, b) => a[0] - b[0]).map(([d, o]) => L(d, o)), L(.62, motif), L(.74, P(starD(ox, oy, 64, 46, 8, -90 + 22.5), c.secondary, { stroke: c.ink, strokeWidth: 2, label: 'Heart star' }), circle(ox, oy, 18, c.accent))];
  },
};

const mughal: EraPlateSpec = {
  cf: { kind: 'axis', value: 8, label: 'Axial niche on an 8-bay page', governs: 'Border rules step in eighths of a bay; the niche, the plant and its blooms sit on the one axis.' },
  foil: '#D2A84A', foilStrength: .14, cta: '#9D3A32', font: 'ebGaramond', fontStyle: 'italic 500', light: true,
  build: c => {
    const { paper: P0, ink: G, accent: R0, secondary: Gd } = c;
    const rules: Obj[] = [rect(26, 26, W - 52, H - 52, 'none', { stroke: G, strokeWidth: 1 }), rect(34, 34, W - 68, H - 68, 'none', { stroke: Gd, strokeWidth: 12, label: 'Gold band' }), rect(46, 46, W - 92, H - 92, 'none', { stroke: G, strokeWidth: 1 }), rect(54, 54, W - 108, H - 108, 'none', { stroke: R0, strokeWidth: .8 }), rect(62, 62, W - 124, H - 124, 'none', { stroke: G, strokeWidth: 2.5 })];
    const rosettes: Obj[] = []; for (let x = 60; x < W - 40; x += 40) rosettes.push(circle(x, 40, 3, R0), circle(x, H - 40, 3, R0)); for (let y = 80; y < H - 60; y += 40) rosettes.push(circle(40, y, 3, R0), circle(W - 40, y, 3, R0));
    const nx0 = 170, nx1 = W - 170, ntop = 108, nbase = CALM_Y - 20, sp = 330;
    const niche = `M${nx0} ${nbase} L${nx0} ${sp} C${nx0} ${sp - 90} ${CX - 120} ${sp - 120} ${CX - 40} ${ntop + 70} C${CX - 14} ${ntop + 44} ${CX - 6} ${ntop + 20} ${CX} ${ntop} C${CX + 6} ${ntop + 20} ${CX + 14} ${ntop + 44} ${CX + 40} ${ntop + 70} C${CX + 120} ${sp - 120} ${nx1} ${sp - 90} ${nx1} ${sp} L${nx1} ${nbase} Z`;
    const spandrel = [P(`M70 70 L${W - 70} 70 L${W - 70} ${nbase} L${nx1} ${nbase} L${nx1} ${sp} C${nx1} ${sp - 90} ${CX + 120} ${sp - 120} ${CX + 40} ${ntop + 70} C${CX + 14} ${ntop + 44} ${CX + 6} ${ntop + 20} ${CX} ${ntop} C${CX - 6} ${ntop + 20} ${CX - 14} ${ntop + 44} ${CX - 40} ${ntop + 70} C${CX - 120} ${sp - 120} ${nx0} ${sp - 90} ${nx0} ${sp} L${nx0} ${nbase} L70 ${nbase} Z`, Gd, { opacity: .3, label: 'Spandrel' })];
    const stem = chain([[[CX, nbase - 30], [CX - 10, 520], [CX + 10, 380], [CX, 250]]]);
    const leaves: Obj[] = []; for (let i = 0; i < 6; i++) { const [x, y] = stem[Math.round(4 + i * 3.4)]; leaves.push(path(x - 62, y - 22, 60, 30, orn.leafPath(), i % 2 ? G : mix(G, .25), { rotation: -70, label: 'Leaf' }), path(x + 2, y - 22, 60, 30, orn.leafPath(), i % 2 ? mix(G, .25) : G, { rotation: 70, label: 'Leaf' })); }
    const bloom = (x: number, y: number, s: number): Obj[] => [...[0, 1, 2, 3, 4].map(k => { const [px, py] = polar(x, y, 18 * s, -90 + k * 72); return circle(px, py, 15 * s, R0, { label: 'Poppy petal' }); }), circle(x, y, 10 * s, Gd), circle(x, y, 4 * s, G)];
    const side = (s: number) => { const pts = bez([CX, 470], [CX + s * 40, 440], [CX + s * 90, 420], [CX + s * 110, 360], 12); return [S(polyD(pts, false), G, 3), ...bloom(CX + s * 110, 352, .8)]; };
    return [
      L(.08, ground(c)), L(.24, rules, rosettes), L(.3, spandrel),
      L(.36, P(niche, mix(P0, .3), { stroke: G, strokeWidth: 2.4, label: 'Niche' }), P(niche.replace(/170/g, '182'), 'none', { stroke: Gd, strokeWidth: 1.2 })),
      L(.5, P(`M${CX - 90} ${nbase - 10} Q ${CX} ${nbase - 70} ${CX + 90} ${nbase - 10} Z`, mix(G, .2), { label: 'Mound' })),
      L(.62, S(polyD(stem, false), G, 4, 1, 'Stem'), leaves, side(-1), side(1)),
      L(.76, bloom(CX, 236, 1.25)),
    ];
  },
};

const mexicanModern: EraPlateSpec = {
  cf: { kind: 'module', value: 8, label: 'Papel picado flag of 102 px', governs: 'Flag width, sun rays and agave leaves are measured in flags; the sun is three flags across.' },
  foil: '#F2B83A', foilStrength: .1, cta: '#D9396A', font: 'bigShoulders', fontStyle: 'normal 900', relief: true, light: true,
  build: c => {
    const { paper: P0, ink: Pk, accent: T, secondary: K } = c; const u = W / c.cf.value; const Yl = '#E9A43B';
    const flags: Obj[] = []; const cols = [Pk, T, Yl, mix(Pk, .45), T];
    for (const [row, y0, sag] of [[0, 34, 26], [1, 176, 34]] as Array<[number, number, number]>) {
      flags.push(S(`M-10 ${y0} Q ${CX} ${y0 + sag * 2} ${W + 10} ${y0}`, K, 2, 1, 'String'));
      for (let i = 0; i < 8; i++) {
        const x = i * u + 4 + (row ? u / 2 : 0); if (x + u - 8 > W + u / 2) continue; const t = (x + u / 2) / W; const y = y0 + sag * 4 * t * (1 - t) + 2; const w = u - 10, h = 120;
        const zig: Pt[] = [[x, y], [x + w, y], [x + w, y + h - 12]]; for (let k = 6; k >= 0; k--) zig.push([x + w * k / 6, y + h - (k % 2 ? 0 : 12)]);
        const col = cols[(i + row * 2) % cols.length];
        flags.push(P(polyD(zig), col, { label: 'Papel picado' }));
        flags.push(P(`${starD(x + w / 2, y + h / 2 - 4, 20, 9, 6)} ${circD(x + 16, y + 20, 5)} ${circD(x + w - 16, y + 20, 5)} ${polyD([[x + w / 2, y + 12], [x + w / 2 + 6, y + 20], [x + w / 2, y + 28], [x + w / 2 - 6, y + 20]])} ${circD(x + 16, y + h - 34, 4)} ${circD(x + w - 16, y + h - 34, 4)}`, P0, { label: 'Cut-outs' }));
      }
    }
    const sc: Pt = [CX, 470], sr = 1.5 * u;
    const sun = [P(raysD(sc[0], sc[1], sr + 10, sr + 90, 24, -90, 360, .5), K, { label: 'Woodcut rays' }), P(raysD(sc[0], sc[1], sr + 10, sr + 54, 24, -90 + 7.5, 360, .5), K), circle(sc[0], sc[1], sr, K, { label: 'Sun block' }), P(raysD(sc[0], sc[1], sr * .55, sr - 10, 36, 0, 360, .22), P0, { label: 'Gouge marks' }), circle(sc[0], sc[1], sr * .52, Pk, { stroke: T, strokeWidth: 8, label: 'Sun face' })];
    const agave = (x: number, s: number): Obj[] => [-70, -48, -26, -8, 8, 26, 48, 70].map((d, i) => { const [ex, ey] = polar(x, CALM_Y - 6, 150 + (i % 3) * 30, -90 + d); return P(polyD([[x - 10, CALM_Y - 6], [x + 10, CALM_Y - 6], [ex, ey]]), i % 2 ? T : mix(T, -.3), { stroke: K, strokeWidth: 2, label: 'Agave leaf' }); });
    return [
      L(.08, ground(c)),
      L(.26, sun),
      L(.44, P(`M0 ${CALM_Y - 50} Q ${CX} ${CALM_Y - 110} ${W} ${CALM_Y - 50} L${W} ${CALM_Y + 12} L0 ${CALM_Y + 12} Z`, T, { label: 'Hill' })),
      L(.62, agave(120, 1), agave(W - 120, -1)),
      L(.82, flags),
    ];
  },
};

const tropicalModern: EraPlateSpec = {
  cf: { kind: 'module', value: 12, label: 'Breeze-block module (68 px)', governs: 'Blocks, fin spacing and the shadow throw are whole or half modules.' },
  foil: '#E6A25A', foilStrength: .1, cta: '#D47A32', font: 'tenor', fontStyle: 'normal 400', light: true,
  build: c => {
    const { paper: P0, ink: G, accent: O, secondary: N } = c; const u = W / c.cf.value;
    const bx0 = .8 * u, by0 = 1.2 * u, cols = 6, rows = 8;
    const blocks: Obj[] = [rect(bx0, by0, cols * u, rows * u, N, { label: 'Shadow behind the screen' })];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = bx0 + i * u, y = by0 + j * u; const hole = (i + j) % 2 ? circD(x + u / 2, y + u / 2, u * .32) : polyD([[x + u / 2, y + u * .14], [x + u * .86, y + u / 2], [x + u / 2, y + u * .86], [x + u * .14, y + u / 2]]); blocks.push(P(`${polyD([[x, y], [x + u, y], [x + u, y + u], [x, y + u]])} ${hole}`, mix(P0, -.04), { stroke: mix(P0, -.2), strokeWidth: 1, label: 'Breeze block' })); }
    const fins: Obj[] = [], shadows: Obj[] = []; const fx0 = 7.6 * u;
    for (let k = 0; k < 6; k++) { const x = fx0 + k * u / 2; fins.push(rect(x, .6 * u, u * .22, 9.4 * u, G, { label: 'Louvre fin' })); shadows.push(P(polyD([[x, 10 * u], [x + u * .22, 10 * u], [x - 2.6 * u, CALM_Y + 60], [x - 2.9 * u, CALM_Y + 60]]), N, { opacity: .13, label: 'Fin shadow' })); }
    const frond = chain([[[W + 20, -20], [700, 120], [620, 180], [520, 220]]]);
    const leaflets: Obj[] = []; frond.forEach(([x, y], i) => { if (i % 2 || i < 3) return; const l = 90 - i * 2.2; for (const s of [-1, 1]) { const [ex, ey] = polar(x, y, l, 150 + s * 50 - i * 1.5); leaflets.push(P(ribbonD([[x, y], [(x + ex) / 2, (y + ey) / 2 + 6], [ex, ey]], 10, 1), G, { label: 'Leaflet' })); } });
    return [
      L(.06, ground(c)),
      L(.14, circle(8.9 * u, 2.1 * u, 1.55 * u, O, { label: 'Sun' }), circle(8.9 * u, 2.1 * u, 2.4 * u, O, { opacity: .18, label: 'Sun halo' })),
      L(.22, shadows),
      L(.46, blocks), L(.6, fins),
      L(.84, P(ribbonD(frond, 10, 3), G, { label: 'Palm rib' }), leaflets),
      L(.3, rect(0, 10 * u, W, 6, G, { opacity: .5, label: 'Floor line' })),
    ];
  },
};

/** The era evites, keyed by era id. Every key is also in eraIds.ERA_EVITE_IDS (tests/eviteEras.test.ts). */
export const ERA_PLATES: Record<string, EraPlateSpec> = {
  classical, 'egyptian-revival': egyptian, 'roman-mosaic': romanMosaic, byzantine, insular, gothic, renaissance, baroque, rococo, neoclassical,
  victorian, 'arts-crafts': artsCrafts, 'art-nouveau': artNouveau, 'vienna-secession': vienna, 'art-deco': artDeco, bauhaus, constructivist, 'de-stijl': deStijl, dada, surrealist,
  swiss, midcentury, 'space-age': spaceAge, psychedelic, punk, 'new-wave': newWave, memphis, grunge, brutalist, minimalist,
  postmodern, vaporwave, y2k, solarpunk, afrofuturist, harlem, ukiyoe, 'islamic-geometry': islamic, mughal, 'mexican-modern': mexicanModern,
  'tropical-modern': tropicalModern,
};

/** Faint drawing of the era's structural law (the host's "Show the design law" option). */
export function lawObjects(cf: CantusFirmus, color: string): Obj[] {
  const o = { opacity: .3 };
  const out: Obj[] = [];
  const hl = (y: number) => out.push(line(0, y, W, y, color, 1.2, o));
  const vl = (x: number) => out.push(line(x, 0, x, H, color, 1.2, o));
  switch (cf.kind) {
    case 'golden': {
      // golden rectangle of plate height, subdivided into squares with the spiral's quarter arcs
      let w = H / PHI, h = H, x = (W - w) / 2, y = 0; out.push(rect(x, y, w, h, 'none', { stroke: color, strokeWidth: 1.2, opacity: .3 }));
      // squares peel off bottom → left → top → right; each carries one quarter of the spiral
      for (let i = 0; i < 8; i++) {
        const dir = i % 4; let sx = x, sy = y, s: number, d: string;
        if (dir === 0) { s = w; sy = y + h - s; d = `M${f(sx)} ${f(sy)} A${f(s)} ${f(s)} 0 0 0 ${f(sx + s)} ${f(sy + s)}`; h -= s; }
        else if (dir === 1) { s = h; d = `M${f(sx)} ${f(sy + s)} A${f(s)} ${f(s)} 0 0 1 ${f(sx + s)} ${f(sy)}`; x += s; w -= s; }
        else if (dir === 2) { s = w; d = `M${f(sx)} ${f(sy)} A${f(s)} ${f(s)} 0 0 1 ${f(sx + s)} ${f(sy + s)}`; y += s; h -= s; }
        else { s = h; sx = x + w - s; d = `M${f(sx + s)} ${f(sy)} A${f(s)} ${f(s)} 0 0 1 ${f(sx)} ${f(sy + s)}`; w -= s; }
        out.push(S(d, color, 1.4, .34), rect(sx, sy, s, s, 'none', { stroke: color, strokeWidth: 1, opacity: .22 }));
      }
      break;
    }
    case 'module': { const u = W / cf.value; for (let x = u; x < W - 1; x += u) vl(x); for (let y = u; y < H - 1; y += u) hl(y); break; }
    case 'axis': { const b = W / cf.value; vl(CX); out.push(line(CX, 0, CX, H, color, 2, o)); for (let k = 1; k < cf.value / 2 + 1; k++) { vl(CX - k * b); vl(CX + k * b); } break; }
    case 'diagonal': { const t = Math.tan(rad(cf.value)); const step = 68; for (let k = -40; k < 40; k++) { const x0 = k * step; out.push(line(x0, H, x0 + H / Math.max(.05, t), 0, color, 1, { opacity: .26 })); } break; }
    case 'dots': { for (let y = cf.value; y < H; y += cf.value) for (let x = cf.value; x < W; x += cf.value) out.push(circle(x, y, 1.7, color, { opacity: .34 })); break; }
    case 'planes': { let acc = 0; for (const r of cf.ratios || []) { acc += r; hl(CALM_Y * acc); } break; }
    case 'radial': { const [ox, oy] = cf.origin || [CX, H / 3]; for (let i = 0; i < cf.value * 2; i++) { const [x, y] = polar(ox, oy, 1400, i * 180 / cf.value); out.push(line(ox, oy, x, y, color, 1, { opacity: .24 })); } for (let k = 1; k <= 6; k++) out.push(circle(ox, oy, k * 90, 'none', { stroke: color, strokeWidth: 1, opacity: .26 })); break; }
    case 'canon': { const n = cf.value; out.push(line(0, 0, W, H, color, 1.2, o), line(W, 0, 0, H, color, 1.2, o), line(0, 0, W, H / 2, color, 1, o), line(W, 0, 0, H / 2, color, 1, o)); out.push(rect(W / n, H / n, W * (n - 3) / n, H * (n - 3) / n, 'none', { stroke: color, strokeWidth: 1.2, opacity: .3 })); for (let k = 1; k < n; k++) { vl(W * k / n); hl(H * k / n); } out.forEach(x => { if (x.opacity === .3 && x.kind === 'LINE' && (x.points![0] === x.points![2] || x.points![1] === x.points![3])) x.opacity = .12; }); break; }
  }
  return out.map(x => ({ ...x, objectLabel: 'Design law' }));
}
