// DXF: our own reader (ASCII, R12 through 2018) and an R12 writer. The DXF reference is
// public, so this needs no outside code. Binary DXF is detected and refused with a reason.
//
// Reads: HEADER units, LAYER table, BLOCKS, and LINE, LWPOLYLINE, POLYLINE (2D, 3D,
// polyface), CIRCLE, ARC, ELLIPSE, SPLINE, TEXT, MTEXT, POINT, 3DFACE, SOLID, HATCH,
// INSERT, DIMENSION (drawn from its block), LEADER. Anything else is counted in warnings.

import { type CadModel, type CadEntity2D, type CadLayer, type CadBlock, type Vec3, type CadUnit, emptyModel, emptyBounds, growBounds, boundsValid } from './model';

// ── ACI colours ─────────────────────────────────────────────────────────────

const ACI_BASE: Record<number, string> = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0' };

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

function hsv(h: number, s: number, v: number) {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return hex(f(5) * 255, f(3) * 255, f(1) * 255);
}

/** AutoCAD Color Index to hex. 10-249 follow the ACI wheel: 24 hues x (5 values x full/pale). */
export function aciToHex(i: number): string {
  i = Math.abs(i);
  if (ACI_BASE[i]) return ACI_BASE[i];
  if (i >= 250 && i <= 255) { const g = [51, 91, 132, 173, 214, 255][i - 250]; return hex(g, g, g); }
  if (i >= 10 && i <= 249) {
    const hue = Math.floor((i - 10) / 10) * 15; const k = (i - 10) % 10;
    const value = [1, 0.8, 0.6, 0.5, 0.3][Math.floor(k / 2)]; const sat = k % 2 === 0 ? 1 : 0.5;
    return hsv(hue, sat, value);
  }
  return '#ffffff';
}

export function hexToAci(color: string | undefined): number {
  if (!color) return 7;
  const m = /^#?([0-9a-f]{6})$/i.exec(color); if (!m) return 7;
  const n = parseInt(m[1], 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  let best = 7, bestD = Infinity;
  for (let i = 1; i <= 255; i++) {
    const c = parseInt(aciToHex(i).slice(1), 16); const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const INSUNITS: Record<number, CadUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
const UNIT_CODE: Record<CadUnit, number> = { unitless: 0, in: 1, ft: 2, mm: 4, cm: 5, m: 6 };

// ── Group reader ────────────────────────────────────────────────────────────

type Pair = [number, string];

function readPairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/); const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) { i -= 1; continue; } // resync on a stray blank line
    out.push([code, lines[i + 1].replace(/\s+$/, '')]);
  }
  return out;
}

/** One entity's groups, with helpers. */
class Rec {
  constructor(public type: string, public g: Pair[]) {}
  str(code: number, d = '') { const p = this.g.find(x => x[0] === code); return p ? p[1].trim() : d; }
  num(code: number, d = 0) { const p = this.g.find(x => x[0] === code); const v = p ? parseFloat(p[1]) : NaN; return Number.isFinite(v) ? v : d; }
  all(code: number) { return this.g.filter(x => x[0] === code).map(x => parseFloat(x[1])); }
  pt(base: number): Vec3 { return [this.num(base), this.num(base + 10), this.num(base + 20)]; }
}

function splitRecords(pairs: Pair[], from: number, to: number): Rec[] {
  const recs: Rec[] = []; let cur: Rec | null = null;
  for (let i = from; i < to; i++) {
    const [c, v] = pairs[i];
    if (c === 0) { cur = new Rec(v.trim(), []); recs.push(cur); } else if (cur) cur.g.push([c, v]);
  }
  return recs;
}

// ── MTEXT cleanup ───────────────────────────────────────────────────────────

export function cleanMText(s: string): string {
  return s
    .replace(/\\P/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\[ACcFfHhQTWp][^;]*;/g, '') // font, height, width, colour... codes end in ;
    .replace(/\\S([^;]*)[#^/]([^;]*);/g, '$1/$2') // stacked fractions
    .replace(/\\[LlOoKk]/g, '')
    .replace(/[{}]/g, '').replace(/\\\\/g, '\\')
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
}

// ── Reader ──────────────────────────────────────────────────────────────────

export function parseDxf(input: string | Uint8Array, name = 'drawing.dxf'): CadModel {
  const m = emptyModel(name, 'dxf', 'plajah-dxf'); m.is2D = true;
  let text: string;
  if (typeof input === 'string') text = input;
  else {
    const head = new TextDecoder('latin1').decode(input.subarray(0, 22));
    if (head.startsWith('AutoCAD Binary DXF')) { m.warnings.push('Binary DXF is not read yet. Save as ASCII DXF.'); return m; }
    text = new TextDecoder('utf-8').decode(input);
    if (text.includes('�')) text = new TextDecoder('latin1').decode(input); // pre-2007 files are ANSI
  }
  const pairs = readPairs(text);
  const sections: Record<string, [number, number]> = {};
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      const nameS = pairs[i + 1][1].trim(); let j = i + 2;
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1].trim() === 'ENDSEC')) j++;
      sections[nameS] = [i + 2, j]; i = j;
    }
  }

  // Header
  const hs = sections.HEADER;
  if (hs) for (let i = hs[0]; i < hs[1]; i++) {
    if (pairs[i][0] !== 9) continue;
    const v = pairs[i][1].trim(); const val = pairs[i + 1]?.[1]?.trim() ?? '';
    if (v === '$INSUNITS') m.units = INSUNITS[parseInt(val, 10)] ?? 'unitless';
    if (v === '$ACADVER') m.meta.version = val;
  }

  // Layers
  const ts = sections.TABLES;
  if (ts) for (const r of splitRecords(pairs, ts[0], ts[1])) if (r.type === 'LAYER') {
    const aci = r.num(62, 7); const flags = r.num(70, 0);
    const tc = r.g.find(x => x[0] === 420);
    m.layers.push({ name: r.str(2, '0'), color: tc ? '#' + (parseInt(tc[1], 10) & 0xffffff).toString(16).padStart(6, '0') : aciToHex(aci), visible: aci >= 0, frozen: (flags & 1) === 1, lineType: r.str(6) || undefined });
  }
  const layerMap = new Map(m.layers.map(l => [l.name, l]));
  const skipped: Record<string, number> = {}; let paperSpace = 0; let construction = 0;
  const ensureLayer = (n: string) => { if (!layerMap.has(n)) { const l: CadLayer = { name: n, color: '#ffffff', visible: true }; layerMap.set(n, l); m.layers.push(l); } };

  const convert = (recs: Rec[]): CadEntity2D[] => {
    const out: CadEntity2D[] = [];
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      // Paper-space entities (67=1) belong to layouts, not the model; invisible ones (60=1) are hidden.
      if (r.num(67) === 1 || r.num(60) === 1) {
        if (r.type === 'POLYLINE') while (recs[i + 1] && (recs[i + 1].type === 'VERTEX' || recs[i + 1].type === 'SEQEND')) i++;
        if (r.num(67) === 1) paperSpace++;
        continue;
      }
      const layer = r.str(8, '0'); ensureLayer(layer);
      const tc = r.g.find(x => x[0] === 420); const aci = r.num(62, 256);
      const color = tc ? '#' + (parseInt(tc[1], 10) & 0xffffff).toString(16).padStart(6, '0') : aci > 0 && aci < 256 ? aciToHex(aci) : undefined;
      const base = { layer, ...(color ? { color } : {}) };
      switch (r.type) {
        case 'LINE': out.push({ ...base, type: 'line', a: r.pt(10), b: r.pt(11) }); break;
        case 'LWPOLYLINE': {
          const pts: Vec3[] = []; const bulges: number[] = []; const elev = r.num(38, 0);
          for (const [c, v] of r.g) {
            if (c === 10) { pts.push([parseFloat(v), 0, elev]); bulges.push(0); }
            else if (c === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v);
            else if (c === 42 && pts.length) bulges[bulges.length - 1] = parseFloat(v);
          }
          out.push({ ...base, type: 'polyline', points: pts, bulges: bulges.some(b => b) ? bulges : undefined, closed: (r.num(70) & 1) === 1, width: r.num(43, 0) || undefined });
          break;
        }
        case 'POLYLINE': {
          const flags = r.num(70); const verts: Rec[] = [];
          while (recs[i + 1] && recs[i + 1].type === 'VERTEX') verts.push(recs[++i]);
          if (recs[i + 1]?.type === 'SEQEND') i++;
          if (flags & 64) { // polyface mesh
            const coords = verts.filter(v => (v.num(70) & 64) === 64).map(v => v.pt(10));
            for (const f of verts.filter(v => (v.num(70) & 192) === 128)) {
              const idx = [71, 72, 73, 74].map(c => Math.abs(f.num(c))).filter(n => n > 0);
              if (idx.length >= 3) out.push({ ...base, type: 'face', points: idx.map(n => coords[n - 1]).filter(Boolean) });
            }
          } else if (flags & 16) { // polygon mesh: draw the vertex grid rows as polylines
            const mCount = r.num(71), nCount = r.num(72); const p = verts.map(v => v.pt(10));
            for (let a = 0; a < mCount; a++) out.push({ ...base, type: 'polyline', points: p.slice(a * nCount, (a + 1) * nCount), closed: (flags & 32) === 32 });
          } else {
            const pts = verts.map(v => v.pt(10)); const bulges = verts.map(v => v.num(42, 0));
            out.push({ ...base, type: 'polyline', points: pts, bulges: bulges.some(b => b) ? bulges : undefined, closed: (flags & 1) === 1 });
          }
          break;
        }
        case 'CIRCLE': out.push({ ...base, type: 'circle', c: r.pt(10), r: r.num(40) }); break;
        case 'ARC': out.push({ ...base, type: 'arc', c: r.pt(10), r: r.num(40), start: r.num(50), end: r.num(51) }); break;
        case 'ELLIPSE': out.push({ ...base, type: 'ellipse', c: r.pt(10), major: r.pt(11), ratio: r.num(40, 1), start: r.num(41, 0), end: r.num(42, Math.PI * 2) }); break;
        case 'SPLINE': {
          const fit: Vec3[] = []; const ctrl: Vec3[] = [];
          for (const [c, v] of r.g) {
            if (c === 10) ctrl.push([parseFloat(v), 0, 0]); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v); else if (c === 30 && ctrl.length) ctrl[ctrl.length - 1][2] = parseFloat(v);
            if (c === 11) fit.push([parseFloat(v), 0, 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v); else if (c === 31 && fit.length) fit[fit.length - 1][2] = parseFloat(v);
          }
          const useFit = fit.length >= 2;
          out.push({ ...base, type: 'spline', points: useFit ? fit : ctrl, degree: r.num(71, 3), closed: (r.num(70) & 1) === 1, fit: useFit });
          break;
        }
        case 'TEXT': case 'ATTRIB': {
          const h = r.num(72, 0); const aligned = h !== 0 || r.num(73, 0) !== 0;
          out.push({ ...base, type: 'text', at: aligned && r.g.some(x => x[0] === 11) ? r.pt(11) : r.pt(10), height: r.num(40, 1), rotation: r.num(50, 0), text: cleanMText(r.str(1)), align: h === 1 || h === 4 ? 'center' : h === 2 ? 'right' : 'left' });
          break;
        }
        case 'MTEXT': {
          const chunks = r.g.filter(x => x[0] === 3).map(x => x[1]).join('') + r.str(1);
          let rot = r.num(50, 0);
          if (r.g.some(x => x[0] === 11)) { const d = r.pt(11); rot = Math.atan2(d[1], d[0]) * 180 / Math.PI; }
          const ap = r.num(71, 1); // attachment: 1-3 top row, column = (ap-1)%3
          out.push({ ...base, type: 'text', at: r.pt(10), height: r.num(40, 1), rotation: rot, text: cleanMText(chunks), align: (ap - 1) % 3 === 1 ? 'center' : (ap - 1) % 3 === 2 ? 'right' : 'left' });
          break;
        }
        case 'POINT': out.push({ ...base, type: 'point', at: r.pt(10) }); break;
        case '3DFACE': { const p = [r.pt(10), r.pt(11), r.pt(12), r.pt(13)]; out.push({ ...base, type: 'face', points: samePt(p[2], p[3]) ? p.slice(0, 3) : p }); break; }
        case 'SOLID': case 'TRACE': { const p = [r.pt(10), r.pt(11), r.pt(13), r.pt(12)]; out.push({ ...base, type: 'hatch', loops: [samePt(p[2], p[3]) ? p.slice(0, 3) : p], pattern: 'SOLID', solid: true }); break; }
        case 'HATCH': out.push({ ...base, type: 'hatch', loops: hatchLoops(r), pattern: r.str(2, 'SOLID'), solid: r.num(70) === 1 }); break;
        case 'INSERT': out.push({ ...base, type: 'insert', block: r.str(2), at: r.pt(10), scale: [r.num(41, 1), r.num(42, 1), r.num(43, 1)], rotation: r.num(50, 0) }); break;
        case 'DIMENSION': { const b = r.str(2); if (b) out.push({ ...base, type: 'insert', block: b, at: [0, 0, 0], scale: [1, 1, 1], rotation: 0 }); break; }
        case 'LEADER': {
          const pts: Vec3[] = [];
          for (const [c, v] of r.g) { if (c === 10) pts.push([parseFloat(v), 0, 0]); else if (c === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v); }
          if (pts.length > 1) out.push({ ...base, type: 'polyline', points: pts, closed: false });
          break;
        }
        case 'MLINE': { // the centre line; style offsets come later
          const pts: Vec3[] = [];
          for (const [c, v] of r.g) { if (c === 11) pts.push([parseFloat(v), 0, 0]); else if (c === 21 && pts.length) pts[pts.length - 1][1] = parseFloat(v); else if (c === 31 && pts.length) pts[pts.length - 1][2] = parseFloat(v); }
          if (pts.length > 1) out.push({ ...base, type: 'polyline', points: pts, closed: (r.num(71) & 2) === 2 });
          break;
        }
        case 'MULTILEADER': out.push(...multileader(r, base)); break;
        case 'TOLERANCE': out.push({ ...base, type: 'text', at: r.pt(10), height: r.num(40, 2.5) || 2.5, rotation: 0, text: cleanMText(r.str(1)).replace(/%%v/gi, ' | '), align: 'left' }); break;
        case 'MESH': {
          const verts: Vec3[] = []; let k = r.g.findIndex(x => x[0] === 92);
          const nv = k >= 0 ? parseInt(r.g[k][1], 10) : 0;
          for (let j = k + 1; j < r.g.length && verts.length < nv; j++) if (r.g[j][0] === 10) verts.push([parseFloat(r.g[j][1]), parseFloat(r.g[j + 1]?.[1] ?? '0'), parseFloat(r.g[j + 2]?.[1] ?? '0')]);
          k = r.g.findIndex(x => x[0] === 93);
          if (k >= 0) { const list = r.g.slice(k + 1).filter(x => x[0] === 90).map(x => parseInt(x[1], 10)); for (let j = 0; j < list.length;) { const n = list[j++]; const face = list.slice(j, j + n).map(q => verts[q]).filter(Boolean); j += n; if (face.length >= 3) out.push({ ...base, type: 'face', points: face }); } }
          break;
        }
        case 'XLINE': case 'RAY': construction++; break;
        case 'VERTEX': case 'SEQEND': case 'ATTDEF': case 'ENDBLK': case 'VIEWPORT': break;
        default: skipped[r.type] = (skipped[r.type] || 0) + 1;
      }
    }
    return out;
  };

  const bs = sections.BLOCKS;
  if (bs) {
    const recs = splitRecords(pairs, bs[0], bs[1]);
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].type !== 'BLOCK') continue;
      const head = recs[i]; const body: Rec[] = [];
      while (recs[i + 1] && recs[i + 1].type !== 'ENDBLK') body.push(recs[++i]);
      const blk: CadBlock = { name: head.str(2), base: head.pt(10), entities: convert(body) };
      m.blocks.push(blk);
    }
  }
  const es = sections.ENTITIES;
  if (es) m.entities = convert(splitRecords(pairs, es[0], es[1]));
  else m.warnings.push('No ENTITIES section found.');

  const WHY: Record<string, string> = { '3DSOLID': 'ACIS solid', REGION: 'ACIS region', BODY: 'ACIS body', IMAGE: 'linked image', PDFUNDERLAY: 'linked PDF', DWFUNDERLAY: 'linked DWF', DGNUNDERLAY: 'linked DGN', OLE2FRAME: 'embedded object' };
  for (const [t, n] of Object.entries(skipped)) m.warnings.push(`${n} ${t}${WHY[t] ? ` (${WHY[t]})` : ''} not drawn yet`);
  if (construction) m.warnings.push(`${construction} construction line${construction > 1 ? 's' : ''} (XLINE/RAY) hidden`);
  if (paperSpace) m.meta.paperSpaceEntities = String(paperSpace);
  if (!m.layers.some(l => l.name === '0')) m.layers.unshift({ name: '0', color: '#ffffff', visible: true });
  m.bounds = paths2DBounds(flatten2D(m));
  return m;
}

/** MULTILEADER: its text (304 + 12/22/32 + 41 height) and each LEADER_LINE's vertices. */
function multileader(r: Rec, base: { layer: string; color?: string }): CadEntity2D[] {
  const out: CadEntity2D[] = []; const g = r.g; let line: Vec3[] | null = null; let landing: Vec3 | null = null; let inLeader = false;
  for (let i = 0; i < g.length; i++) {
    const [c, v] = g[i]; const t = v.trim();
    if (c === 302 && t === 'LEADER{') { inLeader = true; landing = null; continue; }
    if (c === 303 && t === '}') { inLeader = false; continue; }
    if (c === 304 && t === 'LEADER_LINE{') { line = []; continue; }
    if (c === 305 && t === '}') { if (line && line.length) { const pts = landing ? [...line, landing] : line; if (pts.length > 1) out.push({ ...base, type: 'polyline', points: pts, closed: false }); } line = null; continue; }
    if (c === 10) { const p: Vec3 = [parseFloat(v), parseFloat(g[i + 1]?.[1] ?? '0'), parseFloat(g[i + 2]?.[1] ?? '0')]; if (line) line.push(p); else if (inLeader) landing = p; }
  }
  const text = g.find(x => x[0] === 304 && !/^LEADER_LINE\{$/.test(x[1].trim()));
  if (text && text[1].trim()) {
    const at = g.findIndex(x => x[0] === 12);
    const pos: Vec3 = at >= 0 ? [parseFloat(g[at][1]), parseFloat(g[at + 1]?.[1] ?? '0'), 0] : [0, 0, 0];
    const h = g.find(x => x[0] === 41); out.push({ ...base, type: 'text', at: pos, height: h ? parseFloat(h[1]) || 2.5 : 2.5, rotation: 0, text: cleanMText(text[1]), align: 'left' });
  }
  return out;
}

const samePt = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;

/** HATCH boundary paths, read in group order (the codes repeat per path and per edge). */
function hatchLoops(r: Rec): Vec3[][] {
  const g = r.g; const loops: Vec3[][] = []; let i = g.findIndex(x => x[0] === 91);
  if (i < 0) return loops;
  const nPaths = parseInt(g[i][1], 10); i++;
  const next = (code: number) => { while (i < g.length && g[i][0] !== code) i++; return i < g.length ? parseFloat(g[i++][1]) : 0; };
  for (let p = 0; p < nPaths && i < g.length; p++) {
    const flags = next(92); const loop: Vec3[] = [];
    if (flags & 2) { // polyline path
      const hasBulge = next(72); next(73); const n = next(93); const pts: Vec3[] = []; const bul: number[] = [];
      for (let k = 0; k < n; k++) { const x = next(10), y = next(20); pts.push([x, y, 0]); bul.push(hasBulge ? next(42) : 0); }
      loop.push(...bulgePoints(pts, bul, true));
    } else {
      const nEdges = next(93);
      for (let k = 0; k < nEdges; k++) {
        const t = next(72);
        if (t === 1) { const a: Vec3 = [next(10), next(20), 0]; const b: Vec3 = [next(11), next(21), 0]; if (!loop.length) loop.push(a); loop.push(b); }
        else if (t === 2) { const c: Vec3 = [next(10), next(20), 0]; const rad = next(40); let s = next(50), e = next(51); const ccw = next(73);
          if (!ccw) { [s, e] = [360 - s, 360 - e]; } loop.push(...arcPoints(c, rad, s, e, !ccw)); }
        else if (t === 3) { const c: Vec3 = [next(10), next(20), 0]; const mj: Vec3 = [next(11), next(21), 0]; const ratio = next(40); const s = next(50), e = next(51); next(73);
          loop.push(...ellipsePoints(c, mj, ratio, s * Math.PI / 180, e * Math.PI / 180)); }
        else if (t === 4) { next(94); const nk = next(95), nc = next(96); for (let q = 0; q < nk; q++) next(40); for (let q = 0; q < nc; q++) loop.push([next(10), next(20), 0]); }
      }
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

// ── Flatten to drawable paths ───────────────────────────────────────────────

export interface Path2D { layer: string; color: string; pts: Array<[number, number]>; closed: boolean; fill?: boolean }
export interface Text2D { layer: string; color: string; at: [number, number]; height: number; rotation: number; text: string; align: 'left' | 'center' | 'right' }
export interface Flat2D { paths: Path2D[]; texts: Text2D[] }

type M2 = [number, number, number, number, number, number]; // x' = a x + c y + e, y' = b x + d y + f
const I2: M2 = [1, 0, 0, 1, 0, 0];
const mul = (m: M2, n: M2): M2 => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: M2, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function arcPoints(c: Vec3, r: number, startDeg: number, endDeg: number, cw = false): Vec3[] {
  const s = startDeg * Math.PI / 180; let e = endDeg * Math.PI / 180;
  if (cw) { while (e >= s) e -= Math.PI * 2; } else { while (e <= s) e += Math.PI * 2; }
  const n = Math.max(4, Math.ceil(Math.abs(e - s) / (Math.PI / 32)));
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) { const t = s + (e - s) * k / n; pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), 0]); }
  return pts;
}

function ellipsePoints(c: Vec3, major: Vec3, ratio: number, s: number, e: number): Vec3[] {
  const a = Math.hypot(major[0], major[1]); const rot = Math.atan2(major[1], major[0]); const b = a * ratio;
  while (e <= s) e += Math.PI * 2;
  const n = Math.max(8, Math.ceil((e - s) / (Math.PI / 32))); const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) { const t = s + (e - s) * k / n; const x = a * Math.cos(t), y = b * Math.sin(t); pts.push([c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot), 0]); }
  return pts;
}

/** Expand bulged polyline vertices into arc points. */
export function bulgePoints(pts: Vec3[], bulges: number[] | undefined, closed: boolean): Vec3[] {
  if (!bulges || !bulges.some(b => b)) return pts;
  const out: Vec3[] = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]; out.push(p);
    if (i === n - 1 && !closed) break;
    const q = pts[(i + 1) % n]; const b = bulges[i] || 0;
    if (!b) continue;
    const theta = 4 * Math.atan(b); const dx = q[0] - p[0], dy = q[1] - p[1]; const chord = Math.hypot(dx, dy);
    if (chord < 1e-12) continue;
    const r = chord / (2 * Math.sin(theta / 2));
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; const h = r * Math.cos(theta / 2);
    const cx = mx - h * dy / chord, cy = my + h * dx / chord;
    const a0 = Math.atan2(p[1] - cy, p[0] - cx); const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 32)));
    for (let k = 1; k < steps; k++) { const t = a0 + theta * k / steps; out.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t), p[2]]); }
  }
  return out;
}

/** Catmull-Rom through fit points, or uniform B-spline over control points. */
function splinePoints(pts: Vec3[], degree: number, fit: boolean, closed: boolean): Vec3[] {
  if (pts.length < 3) return pts;
  const out: Vec3[] = []; const seg = 12;
  if (fit) {
    const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t; const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      out.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)) as Vec3);
    }
    out.push(closed ? pts[0] : pts[pts.length - 1]);
    return out;
  }
  if (degree < 2) return pts;
  // Clamped cubic-ish: de Boor on an open uniform knot vector.
  const p = Math.min(degree, pts.length - 1); const n = pts.length; const knots: number[] = [];
  for (let i = 0; i <= n + p; i++) knots.push(i <= p ? 0 : i >= n ? n - p : i - p);
  const kmax = n - p; const total = seg * n;
  for (let s = 0; s <= total; s++) {
    const u = Math.min(kmax - 1e-9, kmax * s / total);
    let k = p; while (k < n - 1 && knots[k + 1] <= u) k++;
    const d = pts.slice(k - p, k + 1).map(v => [...v]) as number[][];
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = k - p + j; const den = knots[i + p - r + 1] - knots[i]; const a = den ? (u - knots[i]) / den : 0;
      for (let q = 0; q < 3; q++) d[j][q] = (1 - a) * d[j - 1][q] + a * d[j][q];
    }
    out.push(d[p] as Vec3);
  }
  return out;
}

/** Every entity (blocks expanded, curves tessellated) as polylines and text, in model units. */
export function flatten2D(m: Pick<CadModel, 'entities' | 'blocks' | 'layers'>, opts: { hiddenLayers?: Set<string> } = {}): Flat2D {
  const blocks = new Map(m.blocks.map(b => [b.name, b])); const layers = new Map(m.layers.map(l => [l.name, l]));
  const out: Flat2D = { paths: [], texts: [] };
  const walk = (ents: CadEntity2D[], mt: M2, depth: number, inheritLayer?: string, inheritColor?: string) => {
    for (const e of ents) {
      const layerName = e.layer === '0' && inheritLayer ? inheritLayer : e.layer;
      const L = layers.get(layerName);
      if (opts.hiddenLayers?.has(layerName) || (L && (!L.visible || L.frozen))) continue;
      const color = e.color || (e.layer === '0' && inheritColor) || L?.color || '#ffffff';
      const push = (pts: Vec3[], closed: boolean, fill = false) => { if (pts.length) out.paths.push({ layer: layerName, color, pts: pts.map(p => ap(mt, p[0], p[1])), closed, fill }); };
      switch (e.type) {
        case 'line': push([e.a, e.b], false); break;
        case 'polyline': push(bulgePoints(e.points, e.bulges, e.closed), e.closed); break;
        case 'circle': push(arcPoints(e.c, e.r, 0, 360), true); break;
        case 'arc': push(arcPoints(e.c, e.r, e.start, e.end), false); break;
        case 'ellipse': push(ellipsePoints(e.c, e.major, e.ratio, e.start, e.end), Math.abs(e.end - e.start - Math.PI * 2) < 1e-6); break;
        case 'spline': push(splinePoints(e.points, e.degree, e.fit, e.closed), e.closed); break;
        case 'point': push([e.at], false); break;
        case 'face': push(e.points, true); break;
        case 'hatch': for (const l of e.loops) push(l, true, e.solid); break;
        case 'text': {
          const [x, y] = ap(mt, e.at[0], e.at[1]); const sx = Math.hypot(mt[0], mt[1]);
          const rot = e.rotation + Math.atan2(mt[1], mt[0]) * 180 / Math.PI;
          out.texts.push({ layer: layerName, color, at: [x, y], height: e.height * sx, rotation: rot, text: e.text, align: e.align || 'left' });
          break;
        }
        case 'insert': {
          const b = blocks.get(e.block); if (!b || depth > 8) break;
          const r = e.rotation * Math.PI / 180; const cs = Math.cos(r), sn = Math.sin(r);
          const local: M2 = [cs * e.scale[0], sn * e.scale[0], -sn * e.scale[1], cs * e.scale[1], e.at[0], e.at[1]];
          const shift: M2 = [1, 0, 0, 1, -b.base[0], -b.base[1]];
          walk(b.entities, mul(mt, mul(local, shift)), depth + 1, layerName, color);
          break;
        }
      }
    }
  };
  walk(m.entities, I2, 0);
  return out;
}

export function paths2DBounds(f: Flat2D) {
  const b = emptyBounds();
  for (const p of f.paths) for (const [x, y] of p.pts) growBounds(b, x, y, 0);
  for (const t of f.texts) {
    const lines = t.text.split('\n'); const w = t.height * Math.max(...lines.map(l => l.length)) * 0.6;
    const x0 = t.align === 'center' ? t.at[0] - w / 2 : t.align === 'right' ? t.at[0] - w : t.at[0];
    growBounds(b, x0, t.at[1] - (lines.length - 1) * t.height * 1.4, 0); growBounds(b, x0 + w, t.at[1] + t.height, 0);
  }
  return boundsValid(b) ? b : { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3 };
}

// ── SVG ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Plot the drawing to SVG (y flipped so up is up). `background` null leaves it transparent. */
/** The plotted sheet in model units: SVG x = x - x0, SVG y = y1 - y. Viewers use it to map clicks back. */
export function drawingFrame(f: Flat2D) {
  const b = paths2DBounds(f); const w = Math.max(1e-6, b.max[0] - b.min[0]), h = Math.max(1e-6, b.max[1] - b.min[1]);
  const pad = Math.max(w, h) * 0.03;
  return { x0: b.min[0] - pad, y1: b.max[1] + pad, spanX: w + 2 * pad, spanY: h + 2 * pad };
}

export function drawingToSvg(m: CadModel, opts: { width?: number; background?: string | null; hiddenLayers?: Set<string>; mono?: string } = {}): string {
  const f = flatten2D(m, { hiddenLayers: opts.hiddenLayers });
  const b = paths2DBounds(f); const w = Math.max(1e-6, b.max[0] - b.min[0]), h = Math.max(1e-6, b.max[1] - b.min[1]);
  const pad = Math.max(w, h) * 0.03; const W = opts.width ?? 1600; const H = Math.round(W * (h + 2 * pad) / (w + 2 * pad));
  const sw = (w + 2 * pad) / W; // one pixel in model units
  const X = (x: number) => +(x - b.min[0] + pad).toFixed(4); const Y = (y: number) => +(b.max[1] - y + pad).toFixed(4);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${+(w + 2 * pad).toFixed(4)} ${+(h + 2 * pad).toFixed(4)}">`);
  if (opts.background !== null) parts.push(`<rect width="100%" height="100%" fill="${opts.background ?? '#101014'}"/>`);
  const col = (c: string) => opts.mono ?? c;
  for (const p of f.paths) {
    if (p.pts.length < 2 && !p.fill) { const [x, y] = p.pts[0]; parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${sw * 1.5}" fill="${col(p.color)}"/>`); continue; }
    const d = p.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)} ${Y(y)}`).join('') + (p.closed ? 'Z' : '');
    parts.push(p.fill ? `<path d="${d}" fill="${col(p.color)}" fill-opacity="0.55" stroke="none"/>` : `<path d="${d}" fill="none" stroke="${col(p.color)}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  for (const t of f.texts) {
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
    t.text.split('\n').forEach((line, k) => parts.push(`<text x="${X(t.at[0])}" y="${Y(t.at[1] - k * t.height * 1.4)}" font-size="${t.height}" font-family="Arial, sans-serif" fill="${col(t.color)}" text-anchor="${anchor}"${t.rotation ? ` transform="rotate(${-t.rotation} ${X(t.at[0])} ${Y(t.at[1])})"` : ''}>${esc(line)}</text>`));
  }
  parts.push('</svg>');
  return parts.join('');
}

// ── Writer (R12, opens in every CAD program) ────────────────────────────────

export function writeDxf(m: CadModel): string {
  const o: string[] = []; const g = (c: number, v: string | number) => { o.push(String(c), typeof v === 'number' ? fmt(v) : v); };
  const fmt = (n: number) => Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(10));
  const pt = (base: number, p: Vec3 | [number, number]) => { g(base, p[0]); g(base + 10, p[1]); g(base + 20, (p as Vec3)[2] ?? 0); };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, String(UNIT_CODE[m.units]));
  g(9, '$EXTMIN'); pt(10, m.bounds.min); g(9, '$EXTMAX'); pt(10, m.bounds.max); g(0, 'ENDSEC');
  const layers = m.layers.length ? m.layers : [{ name: '0', color: '#ffffff', visible: true }];
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, String(layers.length));
  for (const l of layers) { g(0, 'LAYER'); g(2, l.name); g(70, String(l.frozen ? 1 : 0)); g(62, String((l.visible ? 1 : -1) * hexToAci(l.color))); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const blocks = new Map(m.blocks.map(b => [b.name, b]));
  const head = (type: string, e: CadEntity2D) => { g(0, type); g(8, e.layer); if (e.color) g(62, String(hexToAci(e.color))); };
  const poly = (e: CadEntity2D, pts: Vec3[], closed: boolean, bulges?: number[]) => {
    head('POLYLINE', e); g(66, '1'); pt(10, [0, 0, 0]); g(70, String(closed ? 1 : 0));
    pts.forEach((p, i) => { g(0, 'VERTEX'); g(8, e.layer); pt(10, p); if (bulges?.[i]) g(42, bulges[i]); });
    g(0, 'SEQEND'); g(8, e.layer);
  };
  const emit = (ents: CadEntity2D[], depth: number) => {
    for (const e of ents) switch (e.type) {
      case 'line': head('LINE', e); pt(10, e.a); pt(11, e.b); break;
      case 'polyline': poly(e, e.points, e.closed, e.bulges); break;
      case 'circle': head('CIRCLE', e); pt(10, e.c); g(40, e.r); break;
      case 'arc': head('ARC', e); pt(10, e.c); g(40, e.r); g(50, e.start); g(51, e.end); break;
      case 'ellipse': poly(e, ellipsePoints(e.c, e.major, e.ratio, e.start, e.end), false); break;
      case 'spline': poly(e, splinePoints(e.points, e.degree, e.fit, e.closed), e.closed); break;
      case 'text': head('TEXT', e); pt(10, e.at); g(40, e.height); g(1, e.text.replace(/\n/g, ' ')); if (e.rotation) g(50, e.rotation);
        if (e.align && e.align !== 'left') { g(72, e.align === 'center' ? '1' : '2'); pt(11, e.at); } break;
      case 'point': head('POINT', e); pt(10, e.at); break;
      case 'face': { head('3DFACE', e); const p = e.points; [0, 1, 2, 3].forEach(k => pt(10 + k, p[Math.min(k, p.length - 1)])); break; }
      case 'hatch': for (const l of e.loops) poly(e, l, true); break;
      case 'insert': { // exploded: R12 blocks would need the BLOCKS section and anonymous names
        const b = blocks.get(e.block); if (!b || depth > 8) break;
        const sub = flatten2D({ entities: [e], blocks: m.blocks, layers: m.layers });
        for (const p of sub.paths) poly({ ...e, layer: p.layer, color: p.color } as CadEntity2D, p.pts.map(([x, y]) => [x, y, 0] as Vec3), p.closed);
        for (const t of sub.texts) { head('TEXT', { ...e, layer: t.layer, color: t.color } as CadEntity2D); pt(10, [t.at[0], t.at[1], 0]); g(40, t.height); g(1, t.text.replace(/\n/g, ' ')); if (t.rotation) g(50, t.rotation); }
        break;
      }
    }
  };
  emit(m.entities, 0);
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
