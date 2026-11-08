// Schematic rendering to SVG markup, shared by the editor (per-part symbols) and the Tela export
// (a whole sheet). One grid unit is GRID pixels; text stays upright when a part rotates.

import { type Stroke, type Pt, compByKind, ledColor, parseSi, rotPt } from './components';
import { type Circuit, type CPart, pinPos } from './circuit';

export const GRID = 20;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const n = (v: number) => +v.toFixed(2);

/** One stroke of a part's symbol, in sheet pixels. */
export function strokeSvg(s: Stroke, p: Pick<CPart, 'x' | 'y' | 'rot'>, color: string): string {
  const P = (q: Pt) => { const r = rotPt(q, p.rot); return [n((p.x + r[0]) * GRID), n((p.y + r[1]) * GRID)] as const; };
  const sw = `stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  switch (s.kind) {
    case 'line': { const [x1, y1] = P(s.a), [x2, y2] = P(s.b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${sw}/>`; }
    case 'circle': { const [cx, cy] = P(s.c); return `<circle cx="${cx}" cy="${cy}" r="${n(s.r * GRID)}" ${sw} fill="${s.fill ? color : 'none'}"/>`; }
    case 'poly': return `<${s.closed ? 'polygon' : 'polyline'} points="${s.pts.map(q => P(q).join(',')).join(' ')}" ${sw} fill="${s.fill ? color : 'none'}"/>`;
    case 'arc': {
      const off = (((p.rot % 4) + 4) % 4) * 90; const a0 = (s.start + off) * Math.PI / 180, a1 = (s.end + off) * Math.PI / 180;
      const [cx, cy] = P(s.c); const r = s.r * GRID; const large = ((s.end - s.start + 360) % 360) > 180 ? 1 : 0;
      return `<path d="M${n(cx + r * Math.cos(a0))},${n(cy + r * Math.sin(a0))} A${n(r)},${n(r)} 0 ${large} 1 ${n(cx + r * Math.cos(a1))},${n(cy + r * Math.sin(a1))}" ${sw} fill="none"/>`;
    }
    case 'text': { const [x, y] = P(s.at); return `<text x="${x}" y="${y}" fill="${color}" font-size="${n((s.size ?? 0.8) * GRID)}" text-anchor="${s.anchor ?? 'middle'}" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif">${esc(s.text)}</text>`; }
  }
}

/** Where a part's reference and value labels go: beside the symbol, away from its pins. */
export function labelAt(p: CPart): { x: number; y: number; anchor: 'start' | 'middle' } {
  const def = compByKind(p.kind); if (!def) return { x: p.x, y: p.y, anchor: 'middle' };
  const xs: number[] = [], ys: number[] = [];
  for (const s of def.symbol) { const pts: Pt[] = s.kind === 'line' ? [s.a, s.b] : s.kind === 'poly' ? s.pts : s.kind === 'circle' || s.kind === 'arc' ? [[s.c[0] - s.r, s.c[1] - s.r], [s.c[0] + s.r, s.c[1] + s.r]] : []; for (const q of pts) { const r = rotPt(q, p.rot); xs.push(r[0]); ys.push(r[1]); } }
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  return w >= h ? { x: p.x + (Math.min(...xs) + Math.max(...xs)) / 2, y: p.y + Math.min(...ys) - 0.9, anchor: 'middle' } : { x: p.x + Math.max(...xs) + 0.5, y: p.y - 0.3, anchor: 'start' };
}

export function partSvg(p: CPart, color: string, opts: { glow?: number; labels?: boolean } = {}): string {
  const def = compByKind(p.kind); if (!def) return '';
  let out = '';
  if (p.kind === 'led' && (opts.glow ?? 0) > 0.02) { const hex = ledColor(String(p.params.color)).hex; out += `<circle cx="${p.x * GRID}" cy="${p.y * GRID}" r="${GRID * 1.6}" fill="${hex}" opacity="${n(Math.min(0.85, 0.15 + opts.glow! * 0.7))}" filter="url(#elec-glow)"/>`; }
  out += def.symbol.map(s => strokeSvg(s, p, p.kind === 'led' ? ledColor(String(p.params.color)).hex : color)).join('');
  if (opts.labels !== false && p.kind !== 'ground') {
    const l = labelAt(p); const val = def.label?.(p.params) ?? '';
    out += `<text x="${n(l.x * GRID)}" y="${n(l.y * GRID)}" fill="${color}" font-size="11" font-weight="700" text-anchor="${l.anchor}" font-family="Inter,system-ui,sans-serif">${esc(p.ref)}<tspan fill-opacity=".65" font-weight="500" dx="4">${esc(val)}</tspan></text>`;
  }
  return out;
}

export function bounds(c: Circuit): { x0: number; y0: number; x1: number; y1: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const p of c.parts) { const def = compByKind(p.kind); if (!def) continue; for (const pin of def.pins) { const q = pinPos(p, pin.at); xs.push(q[0]); ys.push(q[1]); } xs.push(p.x - 2, p.x + 3); ys.push(p.y - 3, p.y + 3); }
  for (const w of c.wires) for (const q of w.pts) { xs.push(q[0]); ys.push(q[1]); }
  if (!xs.length) return { x0: -10, y0: -8, x1: 10, y1: 8 };
  return { x0: Math.min(...xs) - 2, y0: Math.min(...ys) - 2, x1: Math.max(...xs) + 4, y1: Math.max(...ys) + 2 };
}

/** Junction dots: points where three or more wire ends/pins meet. */
export function junctions(c: Circuit): Pt[] {
  const count = new Map<string, number>(); const k = (q: Pt) => `${q[0]},${q[1]}`;
  const bump = (q: Pt, by = 1) => count.set(k(q), (count.get(k(q)) ?? 0) + by);
  for (const w of c.wires) { w.pts.forEach((q, i) => bump(q, i === 0 || i === w.pts.length - 1 ? 1 : 2)); }
  for (const p of c.parts) { const def = compByKind(p.kind); for (const pin of def?.pins ?? []) { const q = pinPos(p, pin.at); if (count.has(k(q))) bump(q); } }
  // A wire end landing mid-segment of another wire is a junction too.
  for (const w of c.wires) for (const end of [w.pts[0], w.pts[w.pts.length - 1]]) for (const o of c.wires) if (o !== w) for (let i = 0; i + 1 < o.pts.length; i++) {
    const [a, b] = [o.pts[i], o.pts[i + 1]]; const inX = end[0] > Math.min(a[0], b[0]) && end[0] < Math.max(a[0], b[0]), inY = end[1] > Math.min(a[1], b[1]) && end[1] < Math.max(a[1], b[1]);
    if ((a[1] === b[1] && end[1] === a[1] && inX) || (a[0] === b[0] && end[0] === a[0] && inY)) bump(end, 2);
  }
  return [...count.entries()].filter(([, v]) => v >= 3).map(([s]) => s.split(',').map(Number) as Pt);
}

/** The whole sheet as a standalone SVG (light paper style for documents). */
export function circuitSvg(c: Circuit, o: { glow?: Record<string, number>; title?: string; dark?: boolean } = {}): { svg: string; width: number; height: number } {
  const b = bounds(c); const pad = o.title ? 34 : 0;
  const width = Math.round((b.x1 - b.x0) * GRID), height = Math.round((b.y1 - b.y0) * GRID) + pad;
  const ink = o.dark ? '#e7e9ee' : '#1d2433', wire = o.dark ? '#7dd3fc' : '#0f5c8a', bg = o.dark ? '#0f1117' : '#ffffff';
  const body = [
    ...c.wires.map(w => `<polyline points="${w.pts.map(q => `${q[0] * GRID},${q[1] * GRID}`).join(' ')}" fill="none" stroke="${wire}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`),
    ...junctions(c).map(q => `<circle cx="${q[0] * GRID}" cy="${q[1] * GRID}" r="3" fill="${wire}"/>`),
    ...c.parts.map(p => partSvg(p, ink, { glow: o.glow?.[p.id] })),
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="elec-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="100%" height="100%" fill="${bg}"/>${o.title ? `<text x="14" y="22" font-size="14" font-weight="800" fill="${ink}" font-family="Inter,system-ui,sans-serif">${esc(o.title)}</text>` : ''}<g transform="translate(${-b.x0 * GRID},${-b.y0 * GRID + pad})">${body}</g></svg>`;
  return { svg, width, height };
}

/** LED brightness 0..1 from a simulated current. */
export const ledGlow = (p: CPart, i: number) => Math.max(0, Math.min(1, i / (parseSi(p.params.If ?? '20m') || 0.02)));
