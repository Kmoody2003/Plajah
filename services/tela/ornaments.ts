// ornaments — procedural vector motifs for Tela templates.
//
// Two shapes of helper: PATH generators return an SVG `d` string drawn inside a
// 0..100 box (scale it with x/y/w/h on a PATH object), and OBJECT generators
// return ready TelaVectorObjects (dot fields, stripes, tessellations…) so the
// pieces stay individually editable in the studio. Everything is deterministic
// — seeded — so a template renders identically every time.
import type { TelaVectorObject } from '../../types';

// ── Seeded randomness ─────────────────────────────────────────────────────────
export function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const f = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number) => `${f(x)} ${f(y)}`;

// ── Path generators (0..100 box) ──────────────────────────────────────────────

export function polygonPath(sides: number, rotation = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) { const a = (rotation + i * 360 / sides) * Math.PI / 180; pts.push(pt(50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a))); }
  return `M${pts.join(' L')} Z`;
}

export function starPath(points = 5, inner = .42, rotation = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) { const r = i % 2 ? 50 * inner : 50; const a = (rotation + i * 180 / points) * Math.PI / 180; pts.push(pt(50 + r * Math.cos(a), 50 + r * Math.sin(a))); }
  return `M${pts.join(' L')} Z`;
}

/** Islamic 8-point star (two rotated squares) — the seed of most girih patterns. */
export function eightStarPath(): string {
  const a = polygonPath(4, -90), b = polygonPath(4, -45);
  return `${a} ${b}`;
}

/** Radiating wedges from the bottom-centre — the Deco / Soviet sunburst. */
export function sunburstPath(rays = 9, spread = 180, thickness = .55, cx = 50, cy = 100, r = 100): string {
  const parts: string[] = [];
  const start = -90 - spread / 2;
  const step = spread / rays;
  for (let i = 0; i < rays; i++) {
    const a0 = (start + i * step) * Math.PI / 180, a1 = (start + i * step + step * thickness) * Math.PI / 180;
    parts.push(`M${pt(cx, cy)} L${pt(cx + r * Math.cos(a0), cy + r * Math.sin(a0))} L${pt(cx + r * Math.cos(a1), cy + r * Math.sin(a1))} Z`);
  }
  return parts.join(' ');
}

/** Closed zigzag band (Deco frieze, Memphis edge, Aztec border). */
export function zigzagPath(teeth = 8, amp = 50): string {
  const step = 100 / teeth;
  let d = `M0 ${f(amp)}`;
  for (let i = 0; i < teeth; i++) d += ` L${pt(i * step + step / 2, 0)} L${pt((i + 1) * step, amp)}`;
  d += ` L100 100 L0 100 Z`;
  return d;
}

/** Smooth sine ribbon with thickness (Nouveau wave, Memphis squiggle, water). */
export function wavePath(waves = 3, amp = 30, thickness = 22, phase = 0): string {
  const n = 48; const top: string[] = [], bottom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n * 100; const y = 50 + amp * Math.sin(phase + x / 100 * waves * Math.PI * 2);
    top.push(pt(x, y - thickness / 2)); bottom.unshift(pt(x, y + thickness / 2));
  }
  return `M${top.join(' L')} L${bottom.join(' L')} Z`;
}

/** A single stroke-friendly sine (open) — use with fill 'none'. */
export function sineOpenPath(waves = 3, amp = 30, phase = 0): string {
  const n = 48; const pts: string[] = [];
  for (let i = 0; i <= n; i++) { const x = i / n * 100; pts.push(pt(x, 50 + amp * Math.sin(phase + x / 100 * waves * Math.PI * 2))); }
  return `M${pts.join(' L')}`;
}

/** Semicircular arch band (Roman / Byzantine arcade). thickness in % of radius. */
export function archPath(thickness = .2): string {
  const t = 50 * thickness;
  return `M0 100 L0 50 A50 50 0 0 1 100 50 L100 100 L${f(100 - t)} 100 L${f(100 - t)} 50 A${f(50 - t)} ${f(50 - t)} 0 0 0 ${f(t)} 50 L${f(t)} 100 Z`;
}

/** Gothic pointed arch (two-centred). */
export function pointedArchPath(thickness = .16): string {
  const t = 100 * thickness;
  return `M0 100 L0 45 Q0 0 50 0 Q100 0 100 45 L100 100 L${f(100 - t)} 100 L${f(100 - t)} 47 Q${f(100 - t)} ${f(t)} 50 ${f(t * .9)} Q${f(t)} ${f(t)} ${f(t)} 47 L${f(t)} 100 Z`;
}

/** Ogee (S-curved) arch — Mughal / Venetian Gothic. */
export function ogeeArchPath(): string {
  return `M0 100 L0 52 C0 30 22 26 32 18 C42 10 46 4 50 0 C54 4 58 10 68 18 C78 26 100 30 100 52 L100 100 Z`;
}

export function quatrefoilPath(): string {
  return `M50 25 A25 25 0 1 1 75 50 A25 25 0 1 1 50 75 A25 25 0 1 1 25 50 A25 25 0 1 1 50 25 Z`;
}
export function trefoilPath(): string {
  return `M50 30 A22 22 0 1 1 72 62 A22 22 0 1 1 28 62 A22 22 0 1 1 50 30 Z`;
}

/** Egyptian lotus — three petals on a stem. */
export function lotusPath(): string {
  return `M50 100 L50 62 C34 68 16 60 12 38 C26 44 40 46 50 40 C60 46 74 44 88 38 C84 60 66 68 50 62 Z M50 40 C42 30 38 12 50 0 C62 12 58 30 50 40 Z M12 38 C6 26 10 10 22 4 C26 18 22 30 12 38 Z M88 38 C94 26 90 10 78 4 C74 18 78 30 88 38 Z`;
}

/** Nouveau whiplash — a tapering S-curve leaf tendril. */
export function whiplashPath(): string {
  return `M6 96 C10 60 40 58 50 38 C58 22 40 8 30 14 C22 20 28 32 38 30 C50 28 56 12 70 6 C86 0 100 12 96 26 C93 36 82 38 78 30 C74 22 84 16 88 22 C90 26 86 30 82 28 C88 22 82 14 76 18 C66 26 64 44 52 52 C40 60 18 70 12 100 Z`;
}

/** A simple leaf / fleuron. */
export function leafPath(): string { return `M50 100 C5 70 8 20 50 0 C92 20 95 70 50 100 Z M50 8 L50 92`; }

/** Deco fan — quarter-sunburst of stepped wedges. */
export function fanPath(blades = 7): string {
  const parts: string[] = [];
  for (let i = 0; i < blades; i++) {
    const a0 = (180 + i * 180 / blades) * Math.PI / 180, a1 = (180 + (i + .62) * 180 / blades) * Math.PI / 180;
    parts.push(`M50 100 L${pt(50 + 50 * Math.cos(a0), 100 + 50 * Math.sin(a0))} L${pt(50 + 50 * Math.cos(a1), 100 + 50 * Math.sin(a1))} Z`);
  }
  return parts.join(' ');
}

/** Scalloped edge (bunting, Rococo, retro sign). */
export function scallopPath(count = 6): string {
  const step = 100 / count; let d = `M0 100 L0 40`;
  for (let i = 0; i < count; i++) d += ` A${f(step / 2)} ${f(step / 2)} 0 0 1 ${pt((i + 1) * step, 40)}`;
  return d + ` L100 100 Z`;
}

/** Stepped pyramid / ziggurat (Deco, Mesoamerican). */
export function stepPyramidPath(steps = 4): string {
  let d = `M0 100`; const h = 100 / steps, w = 50 / steps;
  for (let i = 0; i < steps; i++) d += ` L${pt(i * w, 100 - i * h)} L${pt(i * w, 100 - (i + 1) * h)}`;
  d += ` L${pt(50, 0)}`;
  for (let i = steps - 1; i >= 0; i--) d += ` L${pt(100 - i * w, 100 - (i + 1) * h)} L${pt(100 - i * w, 100 - i * h)}`;
  return d + ' Z';
}

/** Chevron band (single). */
export function chevronPath(depth = 35): string { return `M0 0 L${f(100 - depth)} 0 L100 50 L${f(100 - depth)} 100 L0 100 L${f(depth)} 50 Z`; }

/** Organic blob — smooth closed curve with seeded lumps. */
export function blobPath(seed = 1, lumps = 6, variance = .22): string {
  const r = rng(seed); const pts: [number, number][] = [];
  for (let i = 0; i < lumps; i++) { const a = i / lumps * Math.PI * 2; const rad = 50 * (1 - variance + r() * variance * 2) * .92; pts.push([50 + rad * Math.cos(a), 50 + rad * Math.sin(a)]); }
  let d = `M${pt(pts[0][0], pts[0][1])}`;
  for (let i = 0; i < lumps; i++) {
    const p0 = pts[(i - 1 + lumps) % lumps], p1 = pts[i], p2 = pts[(i + 1) % lumps], p3 = pts[(i + 2) % lumps];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${pt(c1x, c1y)} ${pt(c2x, c2y)} ${pt(p2[0], p2[1])}`;
  }
  return d + ' Z';
}

/** Mid-century boomerang. */
export function boomerangPath(): string { return `M4 96 C0 60 30 20 70 4 C88 -2 100 10 96 22 C90 40 60 40 44 56 C30 70 26 90 12 100 Z`; }

/** Speech balloon with tail at bottom-left. */
export function balloonPath(tailX = 22): string { return `M10 0 L90 0 Q100 0 100 10 L100 66 Q100 76 90 76 L${f(tailX + 14)} 76 L${f(tailX)} 100 L${f(tailX + 4)} 76 L10 76 Q0 76 0 66 L0 10 Q0 0 10 0 Z`; }

/** Jagged burst (comic SFX) with seeded irregular spikes. */
export function burstPath(spikes = 14, seed = 3): string {
  const r = rng(seed); const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) { const rad = i % 2 ? 26 + r() * 10 : 44 + r() * 6; const a = (i * 180 / spikes - 90) * Math.PI / 180; pts.push(pt(50 + rad * Math.cos(a), 50 + rad * Math.sin(a))); }
  return `M${pts.join(' L')} Z`;
}

/** Torn paper edge — a rectangle whose top edge is ripped (punk / collage). */
export function tornEdgePath(seed = 7, roughness = 12): string {
  const r = rng(seed); let d = `M0 ${f(roughness)}`;
  for (let i = 1; i <= 14; i++) d += ` L${pt(i * 100 / 14, r() * roughness)}`;
  d += ` L100 100 L0 100 Z`;
  return d;
}

/** Brush-stroke ribbon (ink, Ukiyo-e, Harlem Renaissance gestural). */
export function brushStrokePath(seed = 5): string {
  const r = rng(seed); const top: string[] = [], bottom: string[] = [];
  for (let i = 0; i <= 10; i++) { const x = i * 10; const t = 34 + Math.sin(i * .9) * 8 + r() * 6; const b = 66 + Math.sin(i * 1.3 + 1) * 8 + r() * 6; top.push(pt(x, t)); bottom.unshift(pt(x, b)); }
  return `M${top.join(' L')} L${bottom.join(' L')} Z`;
}

/** Circuit / grid frame corner — a bracket (brutalist, HUD, Y2K). */
export function bracketPath(thick = 14, arm = 100): string { return `M0 0 L${f(arm)} 0 L${f(arm)} ${f(thick)} L${f(thick)} ${f(thick)} L${f(thick)} ${f(arm)} L0 ${f(arm)} Z`; }

/** Rococo C-scroll (use mirrored pairs). */
export function cScrollPath(): string { return `M84 12 C50 -8 4 20 8 56 C11 86 44 100 62 88 C74 80 70 62 58 60 C48 58 42 68 48 76 C36 74 30 56 42 46 C56 34 82 40 84 12 Z`; }

// ── Object generators ─────────────────────────────────────────────────────────

let seq = 0;
export const oid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export interface ObjOpts { opacity?: number; rotation?: number; label?: string; role?: TelaVectorObject['templateRole'] }
const base = (kind: TelaVectorObject['kind'], x: number, y: number, w: number, h: number, fill: string, o: ObjOpts & { stroke?: string; strokeWidth?: number } = {}): TelaVectorObject =>
  ({ id: oid(kind.toLowerCase()), kind, x, y, w, h, fill, stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, objectLabel: o.label || 'Ornament', templateRole: o.role || 'ORNAMENT' });

/** A field of dots — optionally graded in size along x or y (halftone). */
export function dotField(x: number, y: number, w: number, h: number, spacing: number, color: string, opts: ObjOpts & { rMin?: number; rMax?: number; grade?: 'x' | 'y' | 'none'; stagger?: boolean } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const rMin = opts.rMin ?? spacing * .12, rMax = opts.rMax ?? spacing * .42;
  const cols = Math.max(1, Math.floor(w / spacing)), rows = Math.max(1, Math.floor(h / spacing));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = opts.grade === 'y' ? r / Math.max(1, rows - 1) : opts.grade === 'x' ? c / Math.max(1, cols - 1) : .5;
    const rad = rMin + (rMax - rMin) * t;
    const cx = x + c * spacing + spacing / 2 + (opts.stagger && r % 2 ? spacing / 2 : 0), cy = y + r * spacing + spacing / 2;
    if (cx + rad > x + w) continue;
    out.push(base('ELLIPSE', cx - rad, cy - rad, rad * 2, rad * 2, color, { opacity: opts.opacity, label: opts.label || 'Dot field', role: opts.role }));
  }
  return out;
}

/** Parallel stripes filling a box (angle rotates each stripe about its centre). */
export function stripes(x: number, y: number, w: number, h: number, count: number, thickness: number, color: string, opts: ObjOpts & { vertical?: boolean } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  for (let i = 0; i < count; i++) {
    if (opts.vertical) { const sx = x + (i + .5) * (w / count) - thickness / 2; out.push(base('RECT', sx, y, thickness, h, color, { ...opts, label: opts.label || 'Stripe' })); }
    else { const sy = y + (i + .5) * (h / count) - thickness / 2; out.push(base('RECT', x, sy, w, thickness, color, { ...opts, label: opts.label || 'Stripe' })); }
  }
  return out;
}

/** Straight rules radiating from a centre (Constructivist rays, atomic bursts). */
export function radialLines(cx: number, cy: number, r0: number, r1: number, count: number, color: string, width = 2, opts: { spread?: number; start?: number; opacity?: number; label?: string } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const spread = opts.spread ?? 360, start = opts.start ?? -90;
  for (let i = 0; i < count; i++) {
    const a = (start + i * spread / (spread === 360 ? count : Math.max(1, count - 1))) * Math.PI / 180;
    out.push({ id: oid('line'), kind: 'LINE', x: cx, y: cy, w: 0, h: 0, points: [cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)], fill: 'none', stroke: color, strokeWidth: width, rotation: 0, opacity: opts.opacity ?? 1, objectLabel: opts.label || 'Ray', templateRole: 'ORNAMENT' });
  }
  return out;
}

/** Concentric rings (orbit diagrams, Byzantine halos, targets). */
export function rings(cx: number, cy: number, radii: number[], color: string, width = 2, opts: ObjOpts = {}): TelaVectorObject[] {
  return radii.map(r => base('ELLIPSE', cx - r, cy - r, r * 2, r * 2, 'none', { stroke: color, strokeWidth: width, opacity: opts.opacity, label: opts.label || 'Ring' }));
}

/** Checkerboard. */
export function checker(x: number, y: number, w: number, h: number, cell: number, color: string, opts: ObjOpts = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) out.push(base('RECT', x + c * cell, y + r * cell, cell, cell, color, { ...opts, label: opts.label || 'Checker' }));
  return out;
}

/** Islamic star-and-cross tessellation: 8-point stars with the interstitial crosses implied. */
export function starTessellation(x: number, y: number, w: number, h: number, cell: number, starColor: string, crossColor?: string, opts: ObjOpts = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const star = eightStarPath();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const px = x + c * cell, py = y + r * cell;
    if (px + cell > x + w + .5 || py + cell > y + h + .5) continue;
    if (crossColor) out.push({ ...base('RECT', px + cell * .5 - cell * .12, py, cell * .24, cell, crossColor, { ...opts, label: 'Cross' }) });
    if (crossColor) out.push({ ...base('RECT', px, py + cell * .5 - cell * .12, cell, cell * .24, crossColor, { ...opts, label: 'Cross' }) });
    out.push({ ...base('PATH', px + cell * .1, py + cell * .1, cell * .8, cell * .8, starColor, { ...opts, label: opts.label || 'Eight-point star' }), svgPathData: star, pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: true });
  }
  return out;
}

/** Roman mosaic — a grid of tesserae with seeded colour jitter and small grout gaps. */
export function mosaic(x: number, y: number, w: number, h: number, tile: number, colors: string[], seed = 1, opts: ObjOpts = {}): TelaVectorObject[] {
  const r = rng(seed); const out: TelaVectorObject[] = []; const cols = Math.floor(w / tile), rows = Math.floor(h / tile);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const color = colors[Math.floor(r() * colors.length)];
    out.push(base('RECT', x + col * tile + 1, y + row * tile + 1, tile - 2, tile - 2, color, { rotation: (r() - .5) * 6, opacity: opts.opacity ?? .92, label: 'Tessera', role: opts.role }));
  }
  return out;
}

/** One-point perspective floor grid (Vaporwave, Tron). Returns LINE objects. */
export function perspectiveGrid(x: number, y: number, w: number, h: number, color: string, opts: { columns?: number; rows?: number; width?: number; opacity?: number } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const cols = opts.columns ?? 9, rows = opts.rows ?? 6; const cx = x + w / 2;
  for (let i = 0; i <= cols; i++) { const bx = x + i * w / cols; out.push({ id: oid('line'), kind: 'LINE', x: 0, y: 0, w: 0, h: 0, points: [cx + (bx - cx) * .08, y, bx, y + h], fill: 'none', stroke: color, strokeWidth: opts.width ?? 1.5, rotation: 0, opacity: opts.opacity ?? 1, objectLabel: 'Perspective line', templateRole: 'ORNAMENT' }); }
  for (let i = 1; i <= rows; i++) { const t = Math.pow(i / rows, 2.2); const ly = y + t * h; const half = (w / 2) * (.08 + .92 * t); out.push({ id: oid('line'), kind: 'LINE', x: 0, y: 0, w: 0, h: 0, points: [cx - half, ly, cx + half, ly], fill: 'none', stroke: color, strokeWidth: opts.width ?? 1.5, rotation: 0, opacity: opts.opacity ?? 1, objectLabel: 'Perspective line', templateRole: 'ORNAMENT' }); }
  return out;
}

/** Memphis-style confetti: seeded squiggles, dots, triangles and dashes. */
export function confetti(x: number, y: number, w: number, h: number, count: number, colors: string[], seed = 2, scale = 1): TelaVectorObject[] {
  const r = rng(seed); const out: TelaVectorObject[] = [];
  for (let i = 0; i < count; i++) {
    const px = x + r() * w, py = y + r() * h, color = colors[i % colors.length], kind = i % 4, s = (14 + r() * 18) * scale, rot = r() * 360;
    if (kind === 0) out.push(base('ELLIPSE', px, py, s, s, color, { label: 'Confetti dot' }));
    else if (kind === 1) out.push(base('RECT', px, py, s * 2.2, s * .38, color, { rotation: rot, label: 'Confetti dash' }));
    else if (kind === 2) out.push({ ...base('PATH', px, py, s, s, color, { rotation: rot, label: 'Confetti triangle' }), svgPathData: polygonPath(3), pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: true });
    else out.push({ ...base('PATH', px, py, s * 2.4, s * .9, 'none', { rotation: rot, stroke: color, strokeWidth: 3 * scale, label: 'Confetti squiggle' }), svgPathData: sineOpenPath(2, 40), pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: false });
  }
  return out;
}

/** Corner brackets for a frame (four PATH objects). */
export function frameCorners(x: number, y: number, w: number, h: number, size: number, color: string, thick = 14): TelaVectorObject[] {
  const d = bracketPath(thick);
  const mk = (px: number, py: number, rot: number) => ({ ...base('PATH', px, py, size, size, color, { rotation: rot, label: 'Frame corner' }), svgPathData: d, pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: true });
  return [mk(x, y, 0), mk(x + w - size, y, 90), mk(x + w - size, y + h - size, 180), mk(x, y + h - size, 270)];
}

/** Repeated glyph PATH along a horizontal band (friezes, borders). */
export function frieze(x: number, y: number, w: number, size: number, d: string, color: string, gap = 0, opts: ObjOpts & { alternate?: string } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const n = Math.max(1, Math.floor(w / (size + gap)));
  const start = x + (w - n * (size + gap) + gap) / 2;
  for (let i = 0; i < n; i++) out.push({ ...base('PATH', start + i * (size + gap), y, size, size, opts.alternate && i % 2 ? opts.alternate : color, { opacity: opts.opacity, label: opts.label || 'Frieze motif', role: opts.role }), svgPathData: d, pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: true });
  return out;
}

/** Distressed marks — small seeded rectangles/specks for grunge or photocopy texture. */
export function specks(x: number, y: number, w: number, h: number, count: number, color: string, seed = 4, opacity = .5): TelaVectorObject[] {
  const r = rng(seed); const out: TelaVectorObject[] = [];
  for (let i = 0; i < count; i++) { const s = 1 + r() * 4; out.push(base(r() > .5 ? 'RECT' : 'ELLIPSE', x + r() * w, y + r() * h, s * (1 + r() * 6), s, color, { rotation: r() * 180, opacity: opacity * (0.4 + r() * .6), label: 'Speck' })); }
  return out;
}
