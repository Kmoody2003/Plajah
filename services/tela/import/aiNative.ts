// import/aiNative — Illustrator's own art format, for files with no usable PDF body:
// Illustrator EPS, .ai saved without PDF compatibility, and legacy PostScript .ai (3 through 8).
//
// Illustrator EPS carries the document twice: printing PostScript that needs a full interpreter,
// and a private copy of the native art (%AI9_PrivateData) that is plain operators once decoded:
// ASCII85 over Zstandard (CC 2020+) or deflate. The native copy has what printing PostScript lost:
// layer names, groups, compound paths, swatch gradients.
import { decompress as zstdDecompress } from 'fzstd';
import { inflateSync, unzlibSync } from 'fflate';
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath, Paint, PaintStop, SubPath, FillRule, LineCap, LineJoin } from '../geometry/model';
import { pathToObject } from '../geometry/tela';
import { toPathData } from '../geometry/pathData';
import { cmykToRgb8 } from './psdChannels';
import { ReportBuilder, type ImportEnv, type ImportedDocument } from './types';
import type { StudioGroup } from '../studio/model';

const latin1 = (b: Uint8Array, start = 0, end = b.length) => { let s = ''; const CH = 32768; for (let i = start; i < end; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(end, i + CH)) as unknown as number[]); return s; };

export function ascii85(text: string): Uint8Array {
  const out = new Uint8Array(Math.ceil(text.length * 4 / 5) + 8); let n = 0, acc = 0, cnt = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 32) continue;
    if (c === 122 && cnt === 0) { n += 4; continue; } // z = four zero bytes
    if (c === 126) break; // ~> ends the stream
    acc = acc * 85 + (c - 33);
    if (++cnt === 5) { out[n++] = (acc / 16777216) & 255; out[n++] = (acc >>> 16) & 255; out[n++] = (acc >>> 8) & 255; out[n++] = acc & 255; acc = 0; cnt = 0; }
  }
  if (cnt > 1) { const pad = 5 - cnt; for (let k = 0; k < pad; k++) acc = acc * 85 + 84; for (let k = 0; k < cnt - 1; k++) out[n++] = k === 0 ? (acc / 16777216) & 255 : (acc >>> (24 - 8 * k)) & 255; }
  return out.subarray(0, n);
}

const inflate = (b: Uint8Array): Uint8Array => {
  if (b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd) return zstdDecompress(b);
  try { return unzlibSync(b); } catch { return inflateSync(b); }
};

/** The native art text from an EPS or a legacy .ai, or null when there is none. */
export function extractNativeArt(bytes: Uint8Array): string | null {
  let start = 0, end = bytes.length;
  // DOS EPS binary header: PostScript offset and length, little-endian.
  if (bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) { const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); start = v.getUint32(4, true); end = start + v.getUint32(8, true); }
  const text = latin1(bytes, start, end);
  const priv = text.indexOf('%AI9_PrivateDataBegin');
  if (priv >= 0) {
    const m = /%AI\d+_(?:DataStream|ZStandard_Data|CompressedData)[^\r\n]*[\r\n]+/.exec(text.slice(priv));
    if (m) {
      const from = priv + m.index + m[0].length, to = text.indexOf('%AI9_PrivateDataEnd', from);
      const body = text.slice(from, to < 0 ? undefined : to).replace(/^%/gm, '');
      const raw = /^\s*[!-u\s]+$/.test(body.slice(0, 256)) ? ascii85(body) : bytes.subarray(start + from, start + (to < 0 ? text.length : to));
      try { return latin1(inflate(raw)); } catch { /* fall through to plain art */ }
    } else return text.slice(priv);
  }
  if (text.includes('%AI5_BeginLayer') || /%%Creator:.*Illustrator/.test(text)) return text;
  return null;
}

interface PathState { subs: SubPath[]; cur: SubPath | null; last: { x: number; y: number } | null }
const TOKEN = /\((?:\\.|[^\\)])*\)|\[[^\]]*\]|<[^>]*>|[^\s()[\]<>]+/g;

export async function importAiNative(bytes: Uint8Array, o: { fileName: string; format: 'ai' | 'eps'; env: ImportEnv }): Promise<ImportedDocument | null> {
  const art = extractNativeArt(bytes); if (!art) return null;
  const report = new ReportBuilder();
  const crop = /%AI3_Cropmarks:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(art) || /%%HiResBoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(art) || /%%BoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(art);
  if (!crop) return null;
  const [cx0, cy0, cx1, cy1] = crop.slice(1, 5).map(Number); const W = Math.abs(cx1 - cx0), H = Math.abs(cy1 - cy0);
  const tx = (x: number) => x - Math.min(cx0, cx1), ty = (y: number) => Math.max(cy0, cy1) - y;

  // Swatch gradients: %AI5_BeginGradient: (name) ... (name) type count Bd  [ ... %_Br ...
  const gradients = new Map<string, { radial: boolean; stops: PaintStop[] }>();
  const gradRe = /%AI5_BeginGradient: \(((?:\\.|[^\\)])*)\)[\s\S]*?\(\1\) (\d) (\d+) Bd\b([\s\S]*?)%AI5_EndGradient/g; let gm: RegExpExecArray | null;
  while ((gm = gradRe.exec(art))) gradients.set(gm[1], { radial: gm[2] === '1', stops: gradientStopsOf(gm[4]) });

  const objects: TelaVectorObject[] = []; const groups: Record<string, StudioGroup> = {};
  let fill: Paint | 'none' = '#000000', stroke: Paint | 'none' = '#000000', lw = 1, cap: LineCap = 'butt', join: LineJoin = 'miter', miter = 10, dash: number[] = [];
  const groupStack: string[] = []; let layerGroup: string | undefined; let layerHidden = false; let path: PathState = { subs: [], cur: null, last: null };
  let compound = 0; let compoundPaths: SubPath[] = []; let compoundPaint: { fill: Paint | 'none'; stroke: Paint | 'none' } | null = null;
  const clipStack: Array<string | undefined> = []; let clip: string | undefined; let pendingClipPath = false;
  let inText = 0; let idN = 0; let gradientPending: { paint: Paint } | null = null; let gradientBlock = false;
  const color = (c: number, m: number, y: number, k: number) => { const t = [0, 0, 0]; cmykToRgb8(c * 255, m * 255, y * 255, k * 255, t); return `#${t.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`; };
  const rgb = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  const newSub = (x: number, y: number) => { path.cur = { closed: false, anchors: [{ x: tx(x), y: ty(y) }] }; path.subs.push(path.cur); path.last = { x, y }; };
  const lineTo = (x: number, y: number) => { path.cur?.anchors.push({ x: tx(x), y: ty(y) }); path.last = { x, y }; };
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => { const A = path.cur?.anchors; if (!A) return; A[A.length - 1].hout = { x: tx(x1), y: ty(y1) }; A.push({ x: tx(x3), y: ty(y3), hin: { x: tx(x2), y: ty(y2) } }); path.last = { x: x3, y: y3 }; };
  const close = () => { const s = path.cur; if (!s) return; s.closed = true; const A = s.anchors, a = A[0], b = A[A.length - 1]; if (A.length > 1 && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3) { if (b.hin) a.hin = b.hin; A.pop(); } };
  const emit = (subs: SubPath[], doFill: boolean, doStroke: boolean, rule: FillRule) => {
    const live = subs.filter(s => s.anchors.length > 1); if (!live.length) return;
    if (clip === undefined && !doFill && !doStroke) return;
    const c: CompoundPath = { fillRule: rule, subpaths: live };
    const obj = pathToObject(c, { fill: doFill ? (gradientPending?.paint ?? fill) : 'none', stroke: doStroke ? stroke : 'none', strokeWidth: doStroke ? lw : 0, strokeStyle: doStroke ? { cap, join, miterLimit: miter, dash: dash.length ? dash : undefined } : undefined, clip: clip ? { d: clip, fillRule: 'nonzero' } : undefined, label: 'Path', groupId: groupStack[groupStack.length - 1] ?? layerGroup, hidden: layerHidden }, `aipn_${Date.now().toString(36)}${(idN++).toString(36)}`);
    (obj.geom ||= { v: 1 }).imported = { source: o.format, kind: 'shape' };
    objects.push(obj); report.note('Vector paths', 'live', 'real Bézier anchors');
  };
  const paintPath = (doFill: boolean, doStroke: boolean, doClose: boolean) => {
    if (doClose) close();
    if (pendingClipPath) { const live = path.subs.filter(s => s.anchors.length > 1); if (live.length) clip = toPathData({ fillRule: 'nonzero', subpaths: live }); pendingClipPath = false; report.note('Clipping groups', 'live'); }
    else if (compound > 0) { compoundPaths.push(...path.subs); compoundPaint = { fill: doFill ? fill : 'none', stroke: doStroke ? stroke : 'none' }; }
    else emit(path.subs, doFill, doStroke, 'nonzero');
    path = { subs: [], cur: null, last: null };
  };

  const begin = art.indexOf('%AI5_BeginLayer'); const body = begin >= 0 ? art.slice(begin) : art;
  const lines = body.split(/\r\n?|\n/);
  const stack: string[] = [];
  const n = (i: number) => parseFloat(stack[stack.length - i]);
  o.env.progress?.('Reading Illustrator art', 0, 1);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line === '%AI5_BeginLayer') { groupStack.length = 0; continue; }
    if (line === '%AI5_EndLayer--' || line.startsWith('%AI5_EndLayer')) { layerGroup = undefined; layerHidden = false; continue; }
    if (line.startsWith('%AI9_PrivateDataEnd')) break;
    if (line[0] === '%') continue;
    if (line.startsWith('/AI11Text')) { inText++; report.note('Type in EPS or non-PDF files', 'dropped', 'open the .ai or a PDF-compatible save to keep type'); continue; }
    if (line[0] === '/') { continue; }
    TOKEN.lastIndex = 0; let tm: RegExpExecArray | null; stack.length = 0;
    while ((tm = TOKEN.exec(line))) {
      const t = tm[0];
      switch (t) {
        case 'm': newSub(n(2), n(1)); stack.length = 0; break;
        case 'L': case 'l': lineTo(n(2), n(1)); stack.length = 0; break;
        case 'C': case 'c': curve(n(6), n(5), n(4), n(3), n(2), n(1)); stack.length = 0; break;
        case 'V': case 'v': { const l = path.last; if (l) curve(l.x, l.y, n(4), n(3), n(2), n(1)); stack.length = 0; break; }
        case 'Y': case 'y': curve(n(4), n(3), n(2), n(1), n(2), n(1)); stack.length = 0; break;
        case 'N': case 'n': paintPath(false, false, t === 'n'); stack.length = 0; break;
        case 'F': case 'f': paintPath(true, false, t === 'f'); stack.length = 0; break;
        case 'S': case 's': paintPath(false, true, t === 's'); stack.length = 0; break;
        case 'B': case 'b': paintPath(true, true, t === 'b'); stack.length = 0; break;
        case '*': { const s = stack[stack.length - 1] || ''; const op = s.replace(/[()]/g, ''); paintPath(/[fFbB]/.test(op), /[sSbB]/.test(op), /^[fbs]$/.test(op)); stack.length = 0; break; }
        case 'W': pendingClipPath = true; stack.length = 0; break;
        case 'g': fill = rgb(n(1), n(1), n(1)); gradientPending = null; stack.length = 0; break;
        case 'G': stroke = rgb(n(1), n(1), n(1)); stack.length = 0; break;
        case 'k': fill = color(n(4), n(3), n(2), n(1)); gradientPending = null; stack.length = 0; break;
        case 'K': stroke = color(n(4), n(3), n(2), n(1)); stack.length = 0; break;
        case 'x': case 'Xk': { const s = stack; const tint = parseFloat(s[s.length - 2]); const nums = s.slice(-(t === 'x' ? 7 : 7)).map(parseFloat); fill = color(nums[0] * (1 - 0), nums[1], nums[2], nums[3]); void tint; gradientPending = null; stack.length = 0; break; }
        case 'X': case 'XK': { const s = stack; const nums = s.slice(-7).map(parseFloat); stroke = color(nums[0], nums[1], nums[2], nums[3]); stack.length = 0; break; }
        case 'Xa': fill = rgb(n(3), n(2), n(1)); gradientPending = null; stack.length = 0; break;
        case 'XA': stroke = rgb(n(3), n(2), n(1)); stack.length = 0; break;
        case 'w': lw = n(1); stack.length = 0; break;
        case 'J': cap = (['butt', 'round', 'square'] as LineCap[])[n(1)] ?? 'butt'; stack.length = 0; break;
        case 'j': join = (['miter', 'round', 'bevel'] as LineJoin[])[n(1)] ?? 'miter'; stack.length = 0; break;
        case 'M': miter = n(1); stack.length = 0; break;
        case 'd': { const arr = (stack[stack.length - 2] || '').replace(/[[\]]/g, '').trim(); dash = arr ? arr.split(/\s+/).map(Number) : []; stack.length = 0; break; }
        case 'Lb': { layerHidden = stack[stack.length - 14] === '0'; stack.length = 0; break; }
        case 'Ln': {
          const name = (stack[stack.length - 1] || '(Layer)').replace(/^\(|\)$/g, '').replace(/\\([()\\])/g, '$1');
          const id = `ain_${Date.now().toString(36)}${(idN++).toString(36)}`; groups[id] = { id, name }; layerGroup = id; report.note('Layers', 'live'); stack.length = 0; break;
        }
        case 'u': { const id = `ain_${Date.now().toString(36)}${(idN++).toString(36)}`; groups[id] = { id, name: 'Group', parent: groupStack[groupStack.length - 1] ?? layerGroup }; groupStack.push(id); report.note('Groups', 'live'); stack.length = 0; break; }
        case 'U': groupStack.pop(); stack.length = 0; break;
        case '*u': compound++; compoundPaths = []; stack.length = 0; break;
        case '*U': if (--compound <= 0) { compound = 0; if (compoundPaint) { const saved = { f: fill, s: stroke }; fill = compoundPaint.fill === 'none' ? fill : compoundPaint.fill; stroke = compoundPaint.stroke === 'none' ? stroke : compoundPaint.stroke; emit(compoundPaths, compoundPaint.fill !== 'none', compoundPaint.stroke !== 'none', 'evenodd'); fill = saved.f; stroke = saved.s; compoundPaint = null; report.note('Compound paths', 'live'); } compoundPaths = []; } stack.length = 0; break;
        case 'q': clipStack.push(clip); stack.length = 0; break;
        case 'Q': clip = clipStack.pop(); stack.length = 0; break;
        case 'Bb': gradientBlock = true; stack.length = 0; break;
        case 'BB': gradientBlock = false; gradientPending = null; stack.length = 0; break;
        case 'Bg': {
          // flag (name) xOrigin yOrigin angle length a b c d tx ty Bg
          const N = stack.length; const name = (stack[N - 11] || '').replace(/^\(|\)$/g, ''); const def = gradients.get(name);
          if (def) {
            const x0 = parseFloat(stack[N - 10]), y0 = parseFloat(stack[N - 9]), ang = parseFloat(stack[N - 8]) * Math.PI / 180, len = parseFloat(stack[N - 7]);
            const a = parseFloat(stack[N - 6]), b = parseFloat(stack[N - 5]), c = parseFloat(stack[N - 4]), d = parseFloat(stack[N - 3]), ex = parseFloat(stack[N - 2]), ey = parseFloat(stack[N - 1]);
            const p = (x: number, y: number) => ({ x: tx(a * x + c * y + ex), y: ty(b * x + d * y + ey) });
            const p0 = p(x0, y0), p1 = p(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
            gradientPending = { paint: def.radial ? { type: 'radial', cx: p0.x, cy: p0.y, r: Math.hypot(p1.x - p0.x, p1.y - p0.y), stops: def.stops } : { type: 'linear', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, stops: def.stops } };
            report.note('Gradients', 'live');
          } else report.note('Gradients', 'approx', 'flat colour: the swatch definition was not found');
          stack.length = 0; break;
        }
        default: stack.push(t);
      }
    }
  }
  void gradientBlock; void inText;
  if (!objects.length) return null;
  report.warn('EPS and non-PDF Illustrator files keep paths, layers and gradients. Placed images and live type need the PDF-compatible .ai.');
  const name = o.fileName.replace(/\.[^.]+$/, '');
  return { pages: [{ name, width: W, height: H, objects, studio: { v: 1, groups: Object.keys(groups).length ? groups : undefined } }], report: { fileName: o.fileName, format: o.format, width: W, height: H, layers: Object.keys(groups).length, features: report.features(), fonts: [], warnings: report.warnings, smartObjects: [] } };
}

/** Bd body: hex ramps of 256-step samples per ink, then stop headers. We sample each ramp's ends through CMYK. */
function gradientStopsOf(body: string): PaintStop[] {
  // Every segment is "[ <C..> <M..> <Y..> [<K..>] ... %_Br"; sampling the hex bands yields the ramp.
  const hex = [...body.matchAll(/<\s*([0-9A-Fa-f\s]+)\s*>/g)].map(m => m[1].replace(/\s/g, ''));
  const stops: PaintStop[] = []; const segs: string[][] = [];
  let i = 0; const parts = body.split(/%_Br/);
  for (const part of parts) { const hx = [...part.matchAll(/<\s*([0-9A-Fa-f\s]+)\s*>/g)].map(m => m[1].replace(/\s/g, '')); if (hx.length) segs.push(hx); i += hx.length; }
  void i; void hex;
  const css = (c: number, m: number, y: number, k: number) => { const t = [0, 0, 0]; cmykToRgb8(c, m, y, k, t); return `#${t.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`; };
  const byte = (s: string, at: number) => s.length >= 2 ? parseInt(s.substr(Math.max(0, Math.min(s.length - 2, at * 2)), 2), 16) : 0;
  const count = segs.reduce((n, s) => n + (s[0]?.length || 0) / 2, 0) || 1; let run = 0;
  for (const s of segs) {
    const len = (s[0]?.length || 0) / 2; if (!len) continue;
    const at = (k: number) => ({ c: byte(s[0] || '', k), m: byte(s[1] || '', k), y: byte(s[2] || '', k), kk: byte(s[3] || '', k) });
    const a = at(0), b = at(len - 1);
    if (!stops.length || stops[stops.length - 1].offset < run / count) stops.push({ offset: run / count, color: css(a.c, a.m, a.y, a.kk) });
    run += len;
    stops.push({ offset: run / count, color: css(b.c, b.m, b.y, b.kk) });
  }
  return stops.length ? stops.sort((p, q) => p.offset - q.offset) : [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }];
}
