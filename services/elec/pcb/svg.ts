// 2D board view as SVG (millimetre units): outline, bottom then top copper, holes, silkscreen,
// ratsnest and DRC markers, each layer switchable. Used by the Board tab and for documents.

import { ratsnest, type DrcItem } from './drc';
import { silkscreen } from './silk';
import type { Board, Layer } from './types';

export interface BoardLayers { top: boolean; bottom: boolean; silk: boolean; drills: boolean; ratsnest: boolean; drc: boolean }
export const ALL_LAYERS: BoardLayers = { top: true, bottom: true, silk: true, drills: true, ratsnest: true, drc: true };
export const COPPER = { top: '#e8a33d', bottom: '#4f8fe8' };

const f = (v: number) => +v.toFixed(3);
export function boardSvg(b: Board, o: { layers?: Partial<BoardLayers>; drc?: DrcItem[]; highlight?: number; pad?: number; fit?: boolean; focus?: [number, number] } = {}): string {
  const L = { ...ALL_LAYERS, ...(o.layers ?? {}) }; const m = o.pad ?? 2;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${f(b.W + 2 * m)} ${f(b.H + 2 * m)}" ${o.fit ? 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"' : `width="${f((b.W + 2 * m) * 4)}" height="${f((b.H + 2 * m) * 4)}"`}>`,
    `<rect x="0" y="0" width="${f(b.W)}" height="${f(b.H)}" rx="0.5" fill="#0f3d25" stroke="#d9e2d0" stroke-width="0.15"/>`];
  const copper = (layer: Layer) => {
    const c = COPPER[layer]; const op = layer === 'bottom' ? 0.85 : 0.95; const g: string[] = [`<g fill="${c}" stroke="${c}" opacity="${op}" data-layer="${layer}">`];
    for (const t of b.tracks) if (t.layer === layer) g.push(`<line x1="${f(t.a[0])}" y1="${f(t.a[1])}" x2="${f(t.b[0])}" y2="${f(t.b[1])}" stroke-width="${f(t.w)}" stroke-linecap="round"${o.highlight === t.net ? ' stroke="#fff"' : ''}/>`);
    for (const p of b.pads) if (p.layers.includes(layer)) g.push(p.shape === 'circle' ? `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.w / 2)}" stroke="none"/>` : `<rect x="${f(p.x - p.w / 2)}" y="${f(p.y - p.h / 2)}" width="${f(p.w)}" height="${f(p.h)}" stroke="none"/>`);
    for (const v of b.vias) g.push(`<circle cx="${f(v.x)}" cy="${f(v.y)}" r="${f(v.d / 2)}" stroke="none"/>`);
    g.push('</g>'); return g.join('');
  };
  if (L.bottom) out.push(copper('bottom'));
  if (L.top) out.push(copper('top'));
  if (L.drills) {
    const g = ['<g fill="#0b0c10">'];
    for (const p of b.pads) if (p.drill) g.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.drill / 2)}"/>`);
    for (const v of b.vias) g.push(`<circle cx="${f(v.x)}" cy="${f(v.y)}" r="${f(v.drill / 2)}"/>`);
    for (const h of b.holes) g.push(`<circle cx="${f(h.x)}" cy="${f(h.y)}" r="${f(h.d / 2)}" stroke="#d9e2d0" stroke-width="0.1"/>`);
    g.push('</g>'); out.push(g.join(''));
  }
  if (L.silk) out.push(`<g stroke="#f4f4f0" stroke-width="0.15" stroke-linecap="round" fill="none">${silkscreen(b).map(s => `<line x1="${f(s[0])}" y1="${f(s[1])}" x2="${f(s[2])}" y2="${f(s[3])}"/>`).join('')}</g>`);
  if (L.ratsnest) out.push(`<g stroke="#f0f" stroke-width="0.15" stroke-dasharray="0.6 0.4">${ratsnest(b).map(r => `<line x1="${f(r.a[0])}" y1="${f(r.a[1])}" x2="${f(r.b[0])}" y2="${f(r.b[1])}"/>`).join('')}</g>`);
  if (L.drc && o.drc) out.push(`<g fill="none" stroke="#ff4d4d" stroke-width="0.25">${o.drc.filter(d => d.level === 'error' && d.at).map(d => `<circle cx="${f(d.at![0])}" cy="${f(d.at![1])}" r="1.5"/>`).join('')}</g>`);
  if (o.focus) out.push(`<circle cx="${f(o.focus[0])}" cy="${f(o.focus[1])}" r="2.5" fill="none" stroke="#fbbf24" stroke-width="0.35"/>`);
  out.push('</svg>'); return out.join('');
}
