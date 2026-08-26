// worksheetArtLibrary — clean vector clip-art keyed by semantic label, for re-illustration.
//
// Roadmap #4: once the pipeline names an artwork region ("apple", "book bag", "star" — from the
// Florence naming pack), this offers to REPLACE the region's traced-from-a-photo artwork with a
// crisp, consistent, editable library illustration. A child's rough apple becomes a clean apple; a
// scanned pencil becomes a sharp one — the AI-upgrade beyond faithful tracing. Every replacement is
// still native, editable Tela vectors, and the teacher can toggle it off to keep the original.
//
// Assets are authored in a 0–100 space from simple primitives (perfect ellipses, crisp polygons),
// then fitted into the recognized region's box. Everything is emitted as Tela PATH objects (absolute
// coords) so it renders identically in the reconstruction preview and in the Tela editor.

import type { TelaVectorObject } from '../types';

type Prim =
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; stroke?: string; sw?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; sw?: number }
  | { t: 'poly'; pts: Array<[number, number]>; fill: string; stroke?: string; sw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number };

export interface LibraryAsset { label: string; synonyms: string[]; prims: Prim[]; }

const INK = '#221d28';

// A compact, high-value library — the decorations that actually recur on classroom worksheets.
export const ART_LIBRARY: LibraryAsset[] = [
  { label: 'apple', synonyms: ['apple', 'fruit'], prims: [
    { t: 'ellipse', cx: 38, cy: 60, rx: 26, ry: 30, fill: '#d23b3b' },
    { t: 'ellipse', cx: 62, cy: 60, rx: 26, ry: 30, fill: '#d23b3b' },
    { t: 'ellipse', cx: 50, cy: 58, rx: 30, ry: 32, fill: '#e0463f' },
    { t: 'rect', x: 48, y: 20, w: 4, h: 14, fill: '#6b4a2b' },
    { t: 'ellipse', cx: 66, cy: 24, rx: 13, ry: 7, fill: '#3f9e4d' },
  ] },
  { label: 'star', synonyms: ['star', 'sparkle'], prims: [
    { t: 'poly', fill: '#f6c945', pts: star(50, 52, 44, 18, 5, -90) },
  ] },
  { label: 'pencil', synonyms: ['pencil', 'pen'], prims: [
    { t: 'poly', fill: '#f2b400', pts: [[20, 26], [76, 26], [76, 40], [20, 40]] },      // body
    { t: 'poly', fill: '#f0d9a8', pts: [[76, 26], [92, 33], [76, 40]] },                // wood tip
    { t: 'poly', fill: INK, pts: [[86, 30], [92, 33], [86, 36]] },                       // graphite
    { t: 'rect', x: 12, y: 26, w: 10, h: 14, fill: '#e98ea6' },                          // eraser
    { t: 'rect', x: 21, y: 26, w: 3, h: 14, fill: '#c0c4c9' },                           // ferrule
  ] },
  { label: 'ruler', synonyms: ['ruler', 'measure'], prims: [
    { t: 'rect', x: 18, y: 40, w: 64, h: 20, fill: '#f2c14e' },
    ...Array.from({ length: 7 }, (_, i): Prim => ({ t: 'line', x1: 24 + i * 9, y1: 40, x2: 24 + i * 9, y2: i % 2 ? 47 : 51, stroke: INK, sw: 1.4 })),
  ] },
  { label: 'book', synonyms: ['book', 'reading', 'textbook'], prims: [
    { t: 'poly', fill: '#5aa9e6', pts: [[18, 26], [50, 32], [50, 78], [18, 72]] },
    { t: 'poly', fill: '#4a90d9', pts: [[82, 26], [50, 32], [50, 78], [82, 72]] },
    { t: 'line', x1: 50, y1: 32, x2: 50, y2: 78, stroke: '#ffffff', sw: 2 },
    { t: 'line', x1: 26, y1: 40, x2: 44, y2: 44, stroke: '#ffffff', sw: 1.4 },
    { t: 'line', x1: 26, y1: 50, x2: 44, y2: 54, stroke: '#ffffff', sw: 1.4 },
  ] },
  { label: 'notebook', synonyms: ['notebook', 'notepad', 'journal'], prims: [
    { t: 'rect', x: 28, y: 20, w: 46, h: 60, fill: '#ffffff', stroke: INK, sw: 2 },
    { t: 'rect', x: 28, y: 20, w: 8, h: 60, fill: '#e05a5a' },
    ...Array.from({ length: 5 }, (_, i): Prim => ({ t: 'line', x1: 42, y1: 32 + i * 10, x2: 68, y2: 32 + i * 10, stroke: '#b9c0c8', sw: 1.2 })),
    ...Array.from({ length: 4 }, (_, i): Prim => ({ t: 'ellipse', cx: 32, cy: 28 + i * 15, rx: 3, ry: 3, fill: INK })),
  ] },
  { label: 'backpack', synonyms: ['backpack', 'book bag', 'bookbag', 'bag', 'schoolbag'], prims: [
    { t: 'rect', x: 26, y: 34, w: 48, h: 52, fill: '#7a5cc0', stroke: INK, sw: 2 },
    { t: 'poly', fill: '#8a6cd0', pts: [[26, 46], [26, 40], [34, 32], [66, 32], [74, 40], [74, 46]] }, // top flap
    { t: 'rect', x: 38, y: 58, w: 24, h: 22, fill: '#6a4cb0', stroke: INK, sw: 1.6 },                  // pocket
    { t: 'line', x1: 36, y1: 34, x2: 40, y2: 20, stroke: INK, sw: 3 },
    { t: 'line', x1: 64, y1: 34, x2: 60, y2: 20, stroke: INK, sw: 3 },
  ] },
  { label: 'heart', synonyms: ['heart', 'love'], prims: [
    { t: 'ellipse', cx: 37, cy: 40, rx: 18, ry: 17, fill: '#e0466b' },
    { t: 'ellipse', cx: 63, cy: 40, rx: 18, ry: 17, fill: '#e0466b' },
    { t: 'poly', fill: '#e0466b', pts: [[21, 46], [79, 46], [50, 82]] },
  ] },
  { label: 'sun', synonyms: ['sun', 'sunshine', 'weather'], prims: [
    ...Array.from({ length: 8 }, (_, i): Prim => { const a = i * Math.PI / 4; return { t: 'line', x1: 50 + Math.cos(a) * 30, y1: 50 + Math.sin(a) * 30, x2: 50 + Math.cos(a) * 44, y2: 50 + Math.sin(a) * 44, stroke: '#f5a623', sw: 3.4 }; }),
    { t: 'ellipse', cx: 50, cy: 50, rx: 24, ry: 24, fill: '#f6c945' },
  ] },
  { label: 'cake', synonyms: ['cake', 'birthday'], prims: [
    { t: 'rect', x: 24, y: 54, w: 52, h: 26, fill: '#f4a6c0', stroke: INK, sw: 1.6 },
    { t: 'rect', x: 24, y: 46, w: 52, h: 10, fill: '#fff3f7', stroke: INK, sw: 1.4 },
    { t: 'rect', x: 48, y: 30, w: 4, h: 14, fill: '#7ec4e6' },
    { t: 'ellipse', cx: 50, cy: 27, rx: 4, ry: 6, fill: '#f5a623' },
  ] },
];

/** 5-point star polygon points. */
function star(cx: number, cy: number, outer: number, inner: number, points: number, startDeg: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (startDeg + (i * 180) / points) * Math.PI / 180;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();

/** Match a recognized label to a library asset by exact/synonym/substring, or null. */
export function matchLibraryAsset(label: string): LibraryAsset | null {
  const l = norm(label);
  if (!l) return null;
  const words = new Set(l.split(/\s+/));
  let best: { asset: LibraryAsset; score: number; synLen: number } | null = null;
  for (const asset of ART_LIBRARY) {
    for (const syn of asset.synonyms) {
      const s = norm(syn);
      let score = 0;
      if (l === s) score = 100;
      else if (l.includes(s) || s.includes(l)) score = 70;
      else if (s.split(/\s+/).some(w => words.has(w))) score = 50;
      // longer synonym = more specific: "book bag" beats "book" at the same base score.
      if (score && (!best || score > best.score || (score === best.score && s.length > best.synLen))) best = { asset, score, synLen: s.length };
    }
  }
  return best && best.score >= 50 ? best.asset : null;
}

/** Fit an asset's 0–100 art into a region box (contain, centred) and emit editable Tela PATH objects. */
export function instantiateAsset(asset: LibraryAsset, box: { x: number; y: number; w: number; h: number }, idPrefix: string): TelaVectorObject[] {
  const fill = 0.94;
  const scale = Math.min(box.w, box.h) / 100 * fill;
  const ox = box.x + (box.w - 100 * scale) / 2, oy = box.y + (box.h - 100 * scale) / 2;
  const P = (px: number, py: number): [number, number] => [ox + px * scale, oy + py * scale];
  const round = (n: number) => Math.round(n * 100) / 100;

  return asset.prims.map((prim, i) => {
    let d = '', bx = 0, by = 0, bw = 1, bh = 1;
    if (prim.t === 'ellipse') {
      const [cx, cy] = P(prim.cx, prim.cy); const rx = prim.rx * scale, ry = prim.ry * scale;
      d = `M ${round(cx - rx)} ${round(cy)} A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${round(cy)} A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${round(cy)} Z`;
      bx = cx - rx; by = cy - ry; bw = Math.max(1, 2 * rx); bh = Math.max(1, 2 * ry);
    } else if (prim.t === 'rect') {
      const [x, y] = P(prim.x, prim.y); const w = prim.w * scale, h = prim.h * scale;
      d = `M ${round(x)} ${round(y)} H ${round(x + w)} V ${round(y + h)} H ${round(x)} Z`;
      bx = x; by = y; bw = Math.max(1, w); bh = Math.max(1, h);
    } else if (prim.t === 'poly') {
      const placed = prim.pts.map(p => P(p[0], p[1]));
      d = 'M ' + placed.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ') + ' Z';
      const xs = placed.map(p => p[0]), ys = placed.map(p => p[1]);
      bx = Math.min(...xs); by = Math.min(...ys); bw = Math.max(1, Math.max(...xs) - bx); bh = Math.max(1, Math.max(...ys) - by);
    } else { // line
      const [x1, y1] = P(prim.x1, prim.y1), [x2, y2] = P(prim.x2, prim.y2);
      d = `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`;
      bx = Math.min(x1, x2); by = Math.min(y1, y2); bw = Math.max(1, Math.abs(x2 - x1)); bh = Math.max(1, Math.abs(y2 - y1));
    }
    const stroke = prim.t === 'line' ? prim.stroke : (prim.stroke || 'none');
    const strokeWidth = prim.t === 'line' ? prim.sw : (prim.sw || 0);
    return {
      id: `${idPrefix}_prim_${i}`, kind: 'PATH', x: bx, y: by, w: bw, h: bh,
      fill: prim.t === 'line' ? 'none' : (prim as any).fill, stroke, strokeWidth: strokeWidth * scale, rotation: 0, opacity: 1,
      svgPathData: d, pathOriginX: bx, pathOriginY: by, pathOriginW: bw, pathOriginH: bh, pathClosed: prim.t !== 'line',
      semanticRole: 'ARTWORK', reconstructionLayer: 'ARTWORK', detectedLabel: asset.label,
      objectLabel: `Clean artwork · ${asset.label} · ${prim.t} ${i + 1}`,
    } as TelaVectorObject;
  });
}

export interface ReillustrateResult { objects: TelaVectorObject[]; replaced: Array<{ regionId: string; label: string }>; }

/**
 * Replace each traced artwork region that matches the library with a clean library illustration,
 * preserving z-order and leaving text, layout, fields, and UNMATCHED artwork untouched. Regions are
 * grouped by `parentRegionId`; the group's `detectedLabel` drives the match and its bounding box the
 * placement. The result is still all editable Tela vectors.
 */
export function reillustrateArtwork(objects: TelaVectorObject[]): ReillustrateResult {
  const groups = new Map<string, TelaVectorObject[]>();
  for (const o of objects) {
    if (o.reconstructionLayer === 'ARTWORK' && o.parentRegionId) groups.set(o.parentRegionId, [...(groups.get(o.parentRegionId) || []), o]);
  }
  const replacement = new Map<string, TelaVectorObject[]>();
  const replaced: Array<{ regionId: string; label: string }> = [];
  for (const [regionId, group] of groups) {
    const asset = matchLibraryAsset(group[0].detectedLabel || '');
    if (!asset) continue;
    const x = Math.min(...group.map(o => o.x)), y = Math.min(...group.map(o => o.y));
    const w = Math.max(...group.map(o => o.x + o.w)) - x, h = Math.max(...group.map(o => o.y + o.h)) - y;
    const clean = instantiateAsset(asset, { x, y, w, h }, `reart_${regionId}`).map(o => ({ ...o, parentRegionId: regionId }));
    replacement.set(regionId, clean);
    replaced.push({ regionId, label: asset.label });
  }
  const out: TelaVectorObject[] = [];
  const emitted = new Set<string>();
  for (const o of objects) {
    const rid = o.reconstructionLayer === 'ARTWORK' ? o.parentRegionId : undefined;
    if (rid && replacement.has(rid)) {
      if (!emitted.has(rid)) { out.push(...replacement.get(rid)!); emitted.add(rid); }
    } else out.push(o);
  }
  return { objects: out, replaced };
}
