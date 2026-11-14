// import/pdfVector — Illustrator .ai (PDF-compatible, the default save) and PDF → editable vectors.
//
// A PDF-compatible .ai is a PDF whose optional content groups are Illustrator's layers, so we
// interpret pdf.js's operator list directly rather than rasterizing it:
//   paths           real Bézier PATH objects with fill, stroke, dash, caps, joins, fill rule
//   gradients       axial and radial shadings as engine paints (matrix kept)
//   clipping        geometric, intersected through the boolean engine
//   text            TEXT objects: the words stay editable, the font's own outlines draw them
//                   exactly (embedded subsets cannot set new letters, so editing switches to
//                   the resolved font) — pdf.js hands us those outlines as SVG path data
//   images          IMAGE objects with their soft masks, placed by their matrix
//   layers          nested studio groups named after Illustrator's layers; hidden stays hidden
//   artboards       one page per PDF page
// Opacity masks and mesh shadings have no vector equivalent here and are reported.
import type { TelaVectorObject, TelaBlendMode } from '../../../types';
import type { CompoundPath, Matrix, Paint, PaintStop, SubPath, FillRule, LineCap, LineJoin, TelaGeomExt } from '../geometry/model';
import { pathToObject } from '../geometry/tela';
import { parsePathData, toPathData } from '../geometry/pathData';
import { pathBounds } from '../geometry/bezier';
import { boolean as pathBoolean } from '../geometry/boolean';
import { ReportBuilder, type ImportEnv, type ImportedDocument, type ImportedPage, type ResolvedFont, type RgbaImage } from './types';
import type { StudioGroup } from '../studio/model';

type M = number[];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ap = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const meanScale = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

interface GS {
  ctm: M; fill: Paint | 'none'; stroke: Paint | 'none'; lw: number; cap: LineCap; join: LineJoin; miter: number; dash: number[]; dashPhase: number; fa: number; sa: number; blend: TelaBlendMode | undefined; clip: CompoundPath | null;
  font: any; fontSize: number; charSp: number; wordSp: number; hScale: number; rise: number; textMode: number; tm: M; lm: M; smask: boolean;
}
const BM: Record<string, TelaBlendMode> = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };
let idSeq = 0;
const oid = (p: string) => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** pdf.js's constructPath buffer: 0 M, 1 L, 2 C, 3 Z (pdf.js 5 DrawOPS). */
function bufferToPath(data: ArrayLike<number>, m: M, rule: FillRule): CompoundPath {
  const subs: SubPath[] = []; let cur: SubPath | null = null; let i = 0, n = data.length;
  while (i < n) {
    const op = data[i++];
    if (op === 0) { const p = ap(m, data[i], data[i + 1]); i += 2; cur = { closed: false, anchors: [{ x: p.x, y: p.y }] }; subs.push(cur); }
    else if (op === 1) { const p = ap(m, data[i], data[i + 1]); i += 2; cur?.anchors.push({ x: p.x, y: p.y }); }
    else if (op === 2) { const c1 = ap(m, data[i], data[i + 1]), c2 = ap(m, data[i + 2], data[i + 3]), p = ap(m, data[i + 4], data[i + 5]); i += 6; if (cur) { cur.anchors[cur.anchors.length - 1].hout = c1; cur.anchors.push({ x: p.x, y: p.y, hin: c2 }); } }
    else if (op === 3) {
      if (cur) {
        cur.closed = true; const A = cur.anchors, a = A[0], b = A[A.length - 1];
        // A closing segment back onto the start point merges into the first anchor.
        if (A.length > 1 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) { if (b.hin) a.hin = b.hin; A.pop(); }
        cur = { closed: false, anchors: [{ x: a.x, y: a.y }] }; subs.push(cur);
      }
    } else break;
  }
  return { fillRule: rule, subpaths: subs.filter(s => s.anchors.length > 1 || s.closed) };
}

const objOf = (objs: any, id: string): Promise<any> => new Promise(resolve => { try { if (objs.has(id)) resolve(objs.get(id)); else objs.get(id, resolve); } catch { resolve(null); } });

export interface PdfImportOptions { fileName: string; format: 'ai' | 'pdf'; env: ImportEnv; pdfjs: any; maxPages?: number }

export async function importPdfDocument(bytes: Uint8Array, o: PdfImportOptions): Promise<ImportedDocument & { emptyPages: boolean }> {
  const { env, pdfjs: P } = o; const OPS = P.OPS; const report = new ReportBuilder();
  const doc = await P.getDocument({ data: bytes, disableFontFace: true, fontExtraProperties: true, useSystemFonts: false, verbosity: 0, isEvalSupported: false }).promise;
  const ocg = await doc.getOptionalContentConfig();
  const pageCount = Math.min(doc.numPages, o.maxPages ?? 64);
  if (pageCount > 1) report.note(o.format === 'ai' ? 'Artboards' : 'Pages', 'live', 'each is its own page', pageCount);
  const pages: ImportedPage[] = []; const fontNames = new Set<string>(); const pendingText: Array<{ obj: TelaVectorObject; font: string; size: number }> = [];
  const images = new Map<string, Promise<{ src: string }>>();
  let totalOps = 0, totalObjects = 0;

  for (let pn = 1; pn <= pageCount; pn++) {
    env.progress?.(`Reading artboard ${pn}`, pn - 1, pageCount);
    const page = await doc.getPage(pn); const list = await page.getOperatorList();
    const [vx0, vy0, vx1, vy1] = page.view; const W = vx1 - vx0, H = vy1 - vy0;
    const base: M = [1, 0, 0, -1, -vx0, vy1];
    totalOps += list.fnArray.length;
    const objects: TelaVectorObject[] = []; const groups: Record<string, StudioGroup> = {};
    // Optional content (Illustrator layers). Stack entries are group ids, or null for other marks.
    const marks: Array<string | null> = []; const hiddenAt: boolean[] = []; const groupByKey = new Map<string, string>();
    const currentGroup = () => { for (let i = marks.length - 1; i >= 0; i--) if (marks[i]) return marks[i]!; return undefined; };
    const isHidden = () => hiddenAt.some(Boolean);
    let gs: GS = { ctm: base, fill: '#000000', stroke: '#000000', lw: 1, cap: 'butt', join: 'miter', miter: 10, dash: [], dashPhase: 0, fa: 1, sa: 1, blend: undefined, clip: null, font: null, fontSize: 0, charSp: 0, wordSp: 0, hScale: 1, rise: 0, textMode: 0, tm: [1, 0, 0, 1, 0, 0], lm: [1, 0, 0, 1, 0, 0], smask: false };
    const stack: GS[] = []; const clone = (g: GS): GS => ({ ...g });
    let pendingClip: FillRule | null = null;
    let textRun: { glyphs: string[]; text: string; font: any; size: number; gsFill: Paint | 'none'; gsOpacity: number; m: M; last?: { x: number; y: number } } | null = null;
    const paintRef = (p: Paint | 'none'): string => typeof p === 'string' ? p : typeof p === 'object' && 'stops' in p ? p.stops[0]?.color ?? '#000' : '#000';

    const clipDef = (): TelaGeomExt['clip'] | undefined => gs.clip ? { d: toPathData(gs.clip), fillRule: gs.clip.fillRule } : undefined;
    const coversPage = (c: CompoundPath) => { const b = pathBounds(c); return c.subpaths.length === 1 && c.subpaths[0].anchors.length <= 5 && b.x <= 1 && b.y <= 1 && b.x + b.w >= W - 1 && b.y + b.h >= H - 1; };
    const intersectClip = (path: CompoundPath) => {
      if (coversPage(path)) return;
      if (!gs.clip) { gs.clip = path; return; }
      try { gs.clip = pathBoolean('intersect', [gs.clip, path]); }
      catch { gs.clip = path; report.note('Nested clipping', 'approx', 'the innermost clip is kept'); }
    };
    const stamp = (obj: TelaVectorObject) => {
      const g = currentGroup(); if (g) obj.groupId = g;
      if (isHidden()) obj.hidden = true;
      if (gs.smask) report.note('Opacity masks', 'dropped', 'the masked art shows unmasked');
      objects.push(obj);
    };
    const emitPath = (path: CompoundPath, doFill: boolean, doStroke: boolean) => {
      if (!path.subpaths.length || (!doFill && !doStroke)) return;
      const fill = doFill ? gs.fill : 'none', stroke = doStroke ? gs.stroke : 'none', s = meanScale(gs.ctm);
      const opacity = doFill && doStroke ? Math.max(gs.fa, gs.sa) : doFill ? gs.fa : gs.sa;
      const obj = pathToObject(path, {
        fill, stroke, strokeWidth: doStroke ? gs.lw * s : 0, opacity, blend: gs.blend, clip: clipDef(), fillRule: path.fillRule,
        strokeStyle: doStroke ? { cap: gs.cap, join: gs.join, miterLimit: gs.miter, dash: gs.dash.length ? gs.dash.map(d => d * s) : undefined, dashOffset: gs.dashPhase ? gs.dashPhase * s : undefined } : undefined,
        label: 'Path',
      }, oid('aip'));
      (obj.geom ||= { v: 1 }).imported = { source: o.format, kind: 'shape' };
      stamp(obj); report.note('Vector paths', 'live', 'real Bézier anchors');
    };
    const flushText = () => {
      const t = textRun; textRun = null; if (!t || !t.glyphs.length) return;
      const d = t.glyphs.join(' '); const rot = Math.atan2(t.m[1], t.m[0]);
      const path = parsePathData(d, 'nonzero'); if (!path.subpaths.length && !t.text.trim()) return;
      let b = path.subpaths.length ? pathBounds(path) : { x: t.m[4], y: t.m[5], w: t.size, h: t.size };
      const fillCss = paintRef(t.gsFill);
      const name = String(t.font?.name || 'Text').replace(/^[A-Z]{6}\+/, ''); fontNames.add(name);
      const obj: TelaVectorObject = {
        id: oid('ait'), kind: 'TEXT', x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h), fill: fillCss, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: t.gsOpacity,
        text: t.text.replace(/\s+$/, ''), fontSize: t.size, fontFamily: 'Inter, sans-serif', fontWeight: t.font?.bold ? 700 : t.font?.black ? 900 : 400, fontStyle: t.font?.italic ? 'italic' : 'normal', textAlign: 'left', lineHeight: 1.2, padding: 0, textRole: 'BOX',
        objectLabel: t.text.trim().slice(0, 40) || 'Text', templateRole: 'BODY',
        geom: { v: 1, glyphs: [{ d: toPathData({ fillRule: 'nonzero', subpaths: path.subpaths.map(s => ({ closed: s.closed, anchors: s.anchors.map(a => ({ ...a, x: a.x - b.x, y: a.y - b.y, hin: a.hin && { x: a.hin.x - b.x, y: a.hin.y - b.y }, hout: a.hout && { x: a.hout.x - b.x, y: a.hout.y - b.y } })) })) }), fill: fillCss }], imported: { source: o.format, kind: 'text', font: name }, clip: clipDef() },
      };
      if (gs.blend) obj.blendMode = gs.blend;
      if (Math.abs(rot) > .001) report.note('Rotated type', 'look', 'drawn exactly; editing the words resets the angle');
      if (typeof t.gsFill !== 'string') report.note('Gradient-filled type', 'approx', 'uses the gradient\'s first colour');
      stamp(obj); pendingText.push({ obj, font: name, size: t.size });
      report.note('Type', 'look', 'the words are editable; original outlines draw it exactly until you edit');
    };

    const showGlyphs = async (glyphs: any[]) => {
      const font = gs.font; if (!font || !gs.fontSize) return;
      if (gs.textMode === 3 || gs.textMode === 7) { report.note('Invisible text', 'dropped'); return; }
      const fs = gs.fontSize, hs = gs.hScale, fmx = (font.fontMatrix?.[0] ?? .001), vertical = !!font.vertical;
      const textBase = mul(gs.ctm, gs.tm);
      if (!textRun || textRun.font !== font || Math.abs(textRun.m[5] - textBase[5]) > .01 * fs * meanScale(textBase) || paintRef(textRun.gsFill) !== paintRef(gs.fill)) {
        flushText();
        textRun = { glyphs: [], text: '', font, size: fs * meanScale(textBase), gsFill: gs.fill, gsOpacity: gs.fa, m: textBase };
      }
      let x = 0;
      for (const g of glyphs) {
        if (typeof g === 'number') { x += (vertical ? 1 : -1) * g * fs / 1000; continue; }
        if (!g) { x += gs.wordSp; continue; }
        const key = `${font.loadedName}_path_${g.fontChar}`; const raw = page.commonObjs.has(key) ? page.commonObjs.get(key) : null;
        // Subset fonts often lack a real space glyph; its .notdef box must not be drawn.
        if (raw && !g.isSpace && !/^\s$/.test(g.unicode || '')) {
          const path = parsePathData(typeof raw === 'string' ? raw : String(raw), 'nonzero');
          const pm = mul(textBase, [hs * fs, 0, 0, fs, hs * x, gs.rise]);
          const mapped = mapSubs(path, pm);
          if (mapped.subpaths.length) textRun!.glyphs.push(toPathData(mapped));
        }
        if (g.unicode) textRun!.text += g.unicode;
        x += g.width * fs * fmx + (g.isSpace ? gs.wordSp : 0) + gs.charSp;
      }
      gs.tm = mul(gs.tm, [1, 0, 0, 1, x * hs, 0]);
    };

    const placeImage = async (id: string | null, data: any, fill?: string) => {
      const key = id ? `${id}|${fill || ''}` : null; const m = gs.ctm;
      const w = Math.hypot(m[0], m[1]), h = Math.hypot(m[2], m[3]); if (w < .01 || h < .01) return;
      const rect = pdfImageToRgba(data, fill); if (!rect) { report.note('Images in an unsupported encoding', 'dropped'); return; }
      let put: Promise<{ src: string }> | undefined = key ? images.get(key) : undefined;
      if (!put) { put = env.putImage(rect, 'Illustrator image'); if (key) images.set(key, put); }
      const { src } = await put;
      const cx = m[4] + (m[0] + m[2]) / 2, cy = m[5] + (m[1] + m[3]) / 2;
      const rotation = Math.atan2(m[1], m[0]) * 180 / Math.PI;
      const obj: TelaVectorObject = { id: oid('aii'), kind: 'IMAGE', x: cx - w / 2, y: cy - h / 2, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: Math.abs(rotation) < .01 ? 0 : rotation, opacity: gs.fa, sourceImageSrc: src, sourceCrop: { x: 0, y: 0, width: rect.width, height: rect.height, sourceWidth: rect.width, sourceHeight: rect.height }, objectLabel: 'Image', semanticRole: 'ARTWORK', geom: { v: 1, imported: { source: o.format, kind: 'image' }, clip: clipDef() } };
      if (gs.blend) obj.blendMode = gs.blend;
      if (Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-3 * w * h) report.note('Skewed images', 'approx', 'placed with rotation only');
      stamp(obj); report.note('Images', 'live');
    };

    const shadingPaint = async (id: string, matrix: M | null, fromPattern: boolean): Promise<Paint | null> => {
      const ir: any = await objOf(id.startsWith('g_') ? page.commonObjs : page.objs, id);
      if (!ir) return null;
      if (ir[0] !== 'RadialAxial') { report.note(ir[0] === 'Mesh' ? 'Gradient meshes' : 'Shadings', 'approx', 'filled with a flat colour'); return null; }
      const [, type, , colorStops, p0, p1, r0, r1] = ir;
      const stops: PaintStop[] = colorStops.map(([offset, color]: [number, string]) => ({ offset, color }));
      const tf = (fromPattern ? mul(base, matrix || [1, 0, 0, 1, 0, 0]) : gs.ctm) as Matrix;
      report.note('Gradients', 'live', 'multi-stop, editable');
      if (type === 'axial') return { type: 'linear', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stops, transform: tf };
      if (r0 > 0) report.note('Radial gradients with an inner radius', 'approx');
      return { type: 'radial', cx: p1[0], cy: p1[1], r: r1, fx: p0[0], fy: p0[1], fr: r0 || undefined, stops, transform: tf };
    };

    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i], a = list.argsArray[i];
      switch (fn) {
        case OPS.save: stack.push(clone(gs)); break;
        case OPS.restore: flushText(); if (stack.length) gs = stack.pop()!; break;
        case OPS.transform: gs.ctm = mul(gs.ctm, Array.from(a.length === 1 ? a[0] : a)); break;
        case OPS.setLineWidth: gs.lw = a[0]; break;
        case OPS.setLineCap: gs.cap = (['butt', 'round', 'square'] as LineCap[])[a[0]] ?? 'butt'; break;
        case OPS.setLineJoin: gs.join = (['miter', 'round', 'bevel'] as LineJoin[])[a[0]] ?? 'miter'; break;
        case OPS.setMiterLimit: gs.miter = a[0]; break;
        case OPS.setDash: gs.dash = Array.from(a[0] || []); gs.dashPhase = a[1] || 0; break;
        case OPS.setFillRGBColor: gs.fill = a[0]; break;
        case OPS.setStrokeRGBColor: gs.stroke = a[0]; break;
        case OPS.setFillTransparent: gs.fill = 'none'; break;
        case OPS.setStrokeTransparent: gs.stroke = 'none'; break;
        case OPS.setFillColorN: case OPS.setStrokeColorN: {
          let p: Paint | null = null;
          if (a[0] === 'Shading') p = await shadingPaint(a[1], a[2] || null, true);
          else if (a[0] === 'TilingPattern') report.note('Pattern fills', 'approx', 'filled with a flat colour');
          const v: Paint = p ?? (typeof (fn === OPS.setFillColorN ? gs.fill : gs.stroke) === 'string' ? (fn === OPS.setFillColorN ? gs.fill : gs.stroke) as string : '#808080');
          if (fn === OPS.setFillColorN) gs.fill = v; else gs.stroke = v;
          break;
        }
        case OPS.setGState:
          for (const [k, v] of a[0] as [string, any][]) {
            if (k === 'LW') gs.lw = v; else if (k === 'LC') gs.cap = (['butt', 'round', 'square'] as LineCap[])[v] ?? 'butt'; else if (k === 'LJ') gs.join = (['miter', 'round', 'bevel'] as LineJoin[])[v] ?? 'miter'; else if (k === 'ML') gs.miter = v;
            else if (k === 'D') { gs.dash = Array.from(v[0] || []); gs.dashPhase = v[1] || 0; }
            else if (k === 'CA') gs.sa = v; else if (k === 'ca') gs.fa = v;
            else if (k === 'BM') { const b = BM[v]; gs.blend = b; if (b) report.note('Blend modes', 'live'); }
            else if (k === 'SMask') gs.smask = !!v;
            else if (k === 'Font' && v) { gs.font = await objOf(page.commonObjs, v[0]); gs.fontSize = v[1]; }
          }
          break;
        case OPS.beginMarkedContentProps:
          if (a[0] === 'OC' && a[1]?.type === 'OCG') {
            const name = ocg.getGroup?.(a[1].id)?.name || 'Layer', parent = currentGroup(), key = `${parent || ''}/${a[1].id}`;
            let id = groupByKey.get(key);
            if (!id) { id = oid('aig'); groupByKey.set(key, id); groups[id] = { id, name, parent }; report.note('Layers', 'live'); }
            marks.push(id); let vis = true; try { vis = ocg.isVisible(a[1]); } catch { /* treat as visible */ } hiddenAt.push(!vis);
          } else { marks.push(null); hiddenAt.push(false); }
          break;
        case OPS.beginMarkedContent: marks.push(null); hiddenAt.push(false); break;
        case OPS.endMarkedContent: flushText(); marks.pop(); hiddenAt.pop(); break;
        case OPS.clip: pendingClip = 'nonzero'; break;
        case OPS.eoClip: pendingClip = 'evenodd'; break;
        case OPS.constructPath: {
          flushText();
          const end: number = a[0], data = a[1]?.[0]; if (!data) break;
          const evenOdd = end === OPS.eoFill || end === OPS.eoFillStroke || end === OPS.closeEOFillStroke;
          const close = end === OPS.closeStroke || end === OPS.closeFillStroke || end === OPS.closeEOFillStroke;
          const path = bufferToPath(data as ArrayLike<number>, gs.ctm, evenOdd ? 'evenodd' : 'nonzero');
          if (close) for (const s of path.subpaths) s.closed = true;
          const doFill = end === OPS.fill || end === OPS.eoFill || end === OPS.fillStroke || end === OPS.eoFillStroke || end === OPS.closeFillStroke || end === OPS.closeEOFillStroke;
          const doStroke = end === OPS.stroke || end === OPS.closeStroke || end === OPS.fillStroke || end === OPS.eoFillStroke || end === OPS.closeFillStroke || end === OPS.closeEOFillStroke;
          emitPath(path, doFill, doStroke);
          if (pendingClip) { const c = bufferToPath(data as ArrayLike<number>, gs.ctm, pendingClip); intersectClip(c); pendingClip = null; }
          break;
        }
        case OPS.shadingFill: {
          flushText();
          const p = await shadingPaint(a[0], null, false);
          const area = gs.clip ?? { fillRule: 'nonzero' as FillRule, subpaths: [{ closed: true, anchors: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] }] };
          const obj = pathToObject(area, { fill: p ?? '#808080', opacity: gs.fa, blend: gs.blend, label: 'Gradient', fillRule: area.fillRule }, oid('aig'));
          (obj.geom ||= { v: 1 }).imported = { source: o.format, kind: 'shape' };
          stamp(obj); break;
        }
        case OPS.beginText: gs.tm = [1, 0, 0, 1, 0, 0]; gs.lm = [1, 0, 0, 1, 0, 0]; break;
        case OPS.endText: flushText(); break;
        case OPS.setFont: gs.font = await objOf(page.commonObjs, a[0]); gs.fontSize = Math.abs(a[1]); break;
        case OPS.setTextMatrix: { const tm: M = Array.from(a.length === 1 ? a[0] : a); gs.tm = tm; gs.lm = [...tm]; break; }
        case OPS.moveText: gs.lm = mul(gs.lm, [1, 0, 0, 1, a[0], a[1]]); gs.tm = [...gs.lm]; break;
        case OPS.setLeadingMoveText: gs.lm = mul(gs.lm, [1, 0, 0, 1, a[0], a[1]]); gs.tm = [...gs.lm]; break;
        case OPS.nextLine: gs.tm = [...gs.lm]; break;
        case OPS.setCharSpacing: gs.charSp = a[0]; break;
        case OPS.setWordSpacing: gs.wordSp = a[0]; break;
        case OPS.setHScale: gs.hScale = a[0] / 100; break;
        case OPS.setTextRise: gs.rise = a[0]; break;
        case OPS.setTextRenderingMode: gs.textMode = a[0]; break;
        case OPS.showText: await showGlyphs(a[0]); break;
        case OPS.showSpacedText: await showGlyphs(a[0]); break;
        case OPS.paintFormXObjectBegin: stack.push(clone(gs)); if (a[0]) gs.ctm = mul(gs.ctm, a[0]); break;
        case OPS.paintFormXObjectEnd: if (stack.length) gs = stack.pop()!; break;
        case OPS.beginGroup: stack.push(clone(gs)); report.note('Transparency groups', 'approx', 'opacity is multiplied into the group\'s art'); gs = { ...gs, fa: gs.fa, sa: gs.sa }; break;
        case OPS.endGroup: if (stack.length) gs = stack.pop()!; break;
        case OPS.paintImageXObject: { const id = a[0]; const data = await objOf(id.startsWith('g_') ? page.commonObjs : page.objs, id); if (data) await placeImage(id, data); break; }
        case OPS.paintInlineImageXObject: await placeImage(null, a[0]); break;
        case OPS.paintImageMaskXObject: await placeImage(null, a[0], paintRef(gs.fill)); break;
        case OPS.paintImageXObjectRepeat: case OPS.paintInlineImageXObjectGroup: case OPS.paintImageMaskXObjectGroup: case OPS.paintImageMaskXObjectRepeat:
          report.note('Repeated image tiles', 'dropped'); break;
        default: break;
      }
    }
    flushText();
    totalObjects += objects.length;
    pages.push({ name: pageCount > 1 ? `${o.fileName.replace(/\.[^.]+$/, '')} · ${pn}` : o.fileName.replace(/\.[^.]+$/, ''), width: W, height: H, objects, studio: { v: 1, groups: Object.keys(groups).length ? groups : undefined } });
    page.cleanup?.();
    env.progress?.(`Reading artboard ${pn}`, pn, pageCount);
  }

  const fonts: Record<string, ResolvedFont> = fontNames.size && env.resolveFonts ? await env.resolveFonts([...fontNames]) : {};
  for (const t of pendingText) { const f = fonts[t.font]; if (f) { t.obj.fontFamily = f.css; t.obj.fontWeight = Math.max(t.obj.fontWeight || 400, f.weight); if (f.italic) t.obj.fontStyle = 'italic'; } }
  await doc.destroy();
  const report2 = { fileName: o.fileName, format: o.format, width: pages[0]?.width ?? 0, height: pages[0]?.height ?? 0, colorMode: undefined, bits: undefined, layers: pages.reduce((n, p) => n + Object.keys(p.studio.groups || {}).length, 0), features: report.features(), fonts: Object.values(fonts), warnings: report.warnings, smartObjects: [] };
  return { pages, report: report2, emptyPages: totalObjects < 2 };
}

function mapSubs(p: CompoundPath, m: M): CompoundPath {
  const q = (v: { x: number; y: number }) => ap(m, v.x, v.y);
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => ({ closed: s.closed, anchors: s.anchors.map(a => ({ ...q(a), hin: a.hin && q(a.hin), hout: a.hout && q(a.hout) })) })) };
}

/** pdf.js image payloads (raw 1/3/4 channel, or an ImageBitmap in the browser) → RGBA. */
function pdfImageToRgba(img: any, stencilFill?: string): RgbaImage | null {
  if (!img) return null; const w = img.width, h = img.height;
  if (img.bitmap && typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(img.bitmap.width, img.bitmap.height), g = c.getContext('2d')!; g.drawImage(img.bitmap, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    if (stencilFill) tint(d.data, stencilFill);
    return { width: c.width, height: c.height, data: d.data };
  }
  const data: Uint8ClampedArray | undefined = img.data; if (!data || !w || !h) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  if (data.length === w * h * 4) out.set(data);
  else if (data.length === w * h * 3) { for (let i = 0; i < w * h; i++) { out[i * 4] = data[i * 3]; out[i * 4 + 1] = data[i * 3 + 1]; out[i * 4 + 2] = data[i * 3 + 2]; out[i * 4 + 3] = 255; } }
  else {
    const rb = (w + 7) >> 3;
    if (data.length < rb * h) return null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const on = (data[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1; const o = (y * w + x) * 4; if (stencilFill) out[o + 3] = on ? 0 : 255; else { const v = on ? 255 : 0; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255; } }
  }
  if (stencilFill) tint(out, stencilFill);
  return { width: w, height: h, data: out };
}
function tint(d: Uint8ClampedArray, hex: string) { const m = /^#(..)(..)(..)/.exec(hex); const r = m ? parseInt(m[1], 16) : 0, g = m ? parseInt(m[2], 16) : 0, b = m ? parseInt(m[3], 16) : 0; for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; } }
