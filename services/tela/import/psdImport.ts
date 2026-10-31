// import/psdImport — a Photoshop file (.psd / .psb) → editable Tela vector pages.
//
// Why a vector artboard and not an image device: one z-ordered stack is the only Tela surface where
// pixels, live type and real paths can sit between each other, the way layers do in Photoshop.
//
//   Pixel layer        IMAGE object at its own bounds
//   Type layer         TEXT object (font resolved; Photoshop's pixels shown until edited when the
//                      font is missing or the text has mixed styles or a warp)
//   Shape layer        PATH object: real Bézier knots, solid or gradient fill, full stroke options
//   Smart object       IMAGE of its rendered pixels, embedded file kept and openable
//   Group              studio group (nesting, name, collapse); opacity and masks reach its children
//   Layer/vector mask  live SVG mask / geometric clip
//   Clipping mask      live clip to the base's pixels or path
//   Layer effects      the layerStyle filter graph
//   Adjustment layer   baked into everything it affects (Tela vector objects have no live slot)
//   Guides, artboards  studio guides, one page per artboard
//
// Layers decode one at a time and pixels leave through env.putImage straight away, so an
// import's memory use is the file plus one layer, not the sum of every layer.
import { readPsd, initializeCanvas, type Layer as PsdLayer, type Psd } from 'ag-psd';
import type { TelaVectorObject, TelaBlendMode, TelaBlock } from '../../../types';
import type { CompoundPath, Paint, SubPath, GeomMask, TelaGeomExt, ImportedObjectMeta } from '../geometry/model';
import { pathToObject } from '../geometry/tela';
import { toPathData } from '../geometry/pathData';
import { boolean as pathBoolean } from '../geometry/boolean';
import { compileAdjustment, type ColorFn } from '../raster/adjust';
import { adjFromPsd } from '../raster/psd';
import { COLOR_MODE_NAMES, cmykToRgb8, decodeComposite, decodeLayerMask, decodeLayerPixels, type DecodeContext, type RawLayerData } from './psdChannels';
import { layerStyleFrom, psdColor, psdGradientPaint } from './layerStyles';
import { ReportBuilder, type ImportEnv, type ImportedDocument, type ImportedPage, type ResolvedFont, type RgbaImage } from './types';
import type { StudioGroup } from '../studio/model';

let canvasReady = false;
function ensureCanvas() {
  if (canvasReady) return; canvasReady = true;
  // ag-psd asks for a canvas factory even when we only read raw data.
  initializeCanvas((() => { throw new Error('canvas not used by the importer'); }) as never, ((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })) as never);
}

const BLENDS: Record<string, TelaBlendMode> = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };
const NEAREST_BLEND: Record<string, TelaBlendMode> = { 'linear burn': 'multiply', 'darker color': 'darken', 'linear dodge': 'plus-lighter' as TelaBlendMode, 'lighter color': 'lighten', 'vivid light': 'hard-light', 'linear light': 'hard-light', 'pin light': 'hard-light', 'hard mix': 'hard-light', subtract: 'difference', divide: 'color-dodge', dissolve: 'normal' };

let idSeq = 0;
const oid = (p: string) => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** A pending object: everything known from the structure pass, pixels still undecoded. */
interface Item {
  obj: TelaVectorObject;
  layer: PsdLayer;
  pixelRect?: { x: number; y: number; w: number; h: number };
  needsPixels: boolean;
  adjustments: Array<{ fn: ColorFn; opacity: number; name: string; mask?: { layer: PsdLayer; rect: { x: number; y: number; w: number; h: number }; outside: number } }>;
  /** Mask sources resolved in the pixel pass. */
  ownMask?: PsdLayer;
  inheritedMasks: PsdLayer[];
  clipBase?: Item;
  scope: string[];
}

export interface PsdImportOptions { fileName: string; env: ImportEnv; /** Skip hidden layers' pixels to save time and storage. */ skipHidden?: boolean; /** Also decode Photoshop's flattened composite (fidelity checks). */ wantComposite?: boolean }

export async function importPsdDocument(bytes: Uint8Array, o: PsdImportOptions): Promise<ImportedDocument & { composite?: RgbaImage }> {
  ensureCanvas();
  const { env } = o; const report = new ReportBuilder();
  env.progress?.('Reading the file', 0, 1);
  // ag-psd refuses CMYK, Lab, Multichannel and Duotone in its header check, yet its structure
  // reader is colour-blind and we decode the channels ourselves. So the header says RGB for the
  // length of the read, and the real mode goes to the channel decoder.
  const mode = (bytes[24] << 8) | bytes[25];
  const foreignMode = [4, 7, 8, 9].includes(mode);
  if (foreignMode) { bytes[24] = 0; bytes[25] = 3; }
  let psd: Psd & { rawCompositeData?: Uint8Array; palette?: DecodeContext['palette'] };
  try { psd = readPsd(bytes, { useRawData: true, skipThumbnail: true, skipCompositeImageData: !o.wantComposite, totalMemoryLimit: undefined } as never) as never; }
  finally { if (foreignMode) { bytes[24] = 0; bytes[25] = mode; } }
  const ctx: DecodeContext = { palette: psd.palette };
  const bits = psd.bitsPerChannel ?? 8;
  if (mode === 4) report.note('CMYK colour', 'approx', 'converted to sRGB with Tela\'s ICC-less printer model; rich colours can shift slightly');
  if (mode === 9) report.note('Lab colour', 'approx', 'converted to sRGB');
  if (mode === 7 || mode === 8) report.warn(`${COLOR_MODE_NAMES[mode]} images come across as grayscale from the first channel.`);
  if (bits > 8) report.note(`${bits}-bit channels`, 'approx', 'reduced to 8 bits per channel for display');
  const cmyk = (c: number, m: number, y: number, k: number, out: number[]) => cmykToRgb8(c, m, y, k, out);
  const color = (c: unknown) => psdColor(c, cmyk);
  const globalAngle = (psd.imageResources as { globalAngle?: number } | undefined)?.globalAngle ?? 120;

  // ── Fonts first: positioning text needs metrics ──────────────────────────────────────
  const fontNames = new Set<string>();
  const scanFonts = (ls?: PsdLayer[]) => { for (const l of ls || []) { if (l.text) { const s: any = l.text.style; if (s?.font?.name) fontNames.add(s.font.name); for (const r of l.text.styleRuns || []) if ((r as any).style?.font?.name) fontNames.add((r as any).style.font.name); } scanFonts(l.children); } };
  scanFonts(psd.children);
  const fonts: Record<string, ResolvedFont> = fontNames.size && env.resolveFonts ? await env.resolveFonts([...fontNames]) : {};

  // ── Pages: Photoshop artboards each become a page ────────────────────────────────────
  const top = psd.children || [];
  const artboards = top.filter(l => (l as any).artboard?.rect);
  const pagesIn: Array<{ name: string; x: number; y: number; w: number; h: number; layers: PsdLayer[]; background?: string }> = artboards.length && artboards.length === top.filter(l => !l.hidden).length
    ? artboards.map(l => { const r = (l as any).artboard.rect; return { name: l.name || 'Artboard', x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top, layers: l.children || [] }; })
    : [{ name: o.fileName.replace(/\.[^.]+$/, ''), x: 0, y: 0, w: psd.width, h: psd.height, layers: top }];
  if (artboards.length && pagesIn.length > 1) report.note('Artboards', 'live', 'each artboard is its own page', pagesIn.length);

  const patternsById = new Map<string, any>(((psd as any).patterns || []).map((x: any) => [x.id, x]));
  const smartObjects: ImportedDocument['report']['smartObjects'] = [];
  const linked = new Map<string, { name: string; data?: Uint8Array; type?: string }>();
  for (const f of psd.linkedFiles || []) linked.set(f.id, { name: f.name, data: f.data, type: f.type });
  const storedLinks = new Map<string, string>();

  const allItems: Item[] = []; let layerCount = 0;
  const pages: ImportedPage[] = [];

  for (const page of pagesIn) {
    const items: Item[] = []; const groups: Record<string, StudioGroup> = {};
    const ox = page.x, oy = page.y;
    const shift = (p: CompoundPath): CompoundPath => (ox || oy) ? { fillRule: p.fillRule, subpaths: p.subpaths.map(s => ({ closed: s.closed, anchors: s.anchors.map(a => ({ ...a, x: a.x - ox, y: a.y - oy, hin: a.hin && { x: a.hin.x - ox, y: a.hin.y - oy }, hout: a.hout && { x: a.hout.x - ox, y: a.hout.y - oy } })) })) } : p;

    interface Scope { groupId?: string; opacity: number; hidden: boolean; blend?: TelaBlendMode; masks: PsdLayer[]; clipPaths: string[]; chain: string[] }

    const walk = (children: PsdLayer[], scope: Scope) => {
      let clipBase: Item | undefined; let clipBaseAt = -1;
      for (const l of children) {
        layerCount++;
        const name = l.name || 'Layer';
        const blendKey = (l.blendMode as string) || 'normal';
        let blend: TelaBlendMode | undefined = BLENDS[blendKey];
        if (!blend && blendKey !== 'pass through') { blend = NEAREST_BLEND[blendKey] || 'normal'; report.note(`${blendKey[0].toUpperCase()}${blendKey.slice(1)} blend mode`, 'approx', `drawn as ${blend}`); }
        else if (blend && blend !== 'normal') report.note('Blend modes', 'live');
        if (scope.blend && (!blend || blend === 'normal')) blend = scope.blend;

        if (l.children) {
          const id = oid('psdg');
          groups[id] = { id, name, parent: scope.groupId, collapsed: !l.opened };
          report.note('Layer groups', 'live');
          const opacity = scope.opacity * (l.opacity ?? 1);
          if ((l.opacity ?? 1) < 1) report.note('Group opacity', 'approx', 'multiplied into each child; overlapping children look slightly different');
          const groupBlend = blendKey !== 'pass through' && blendKey !== 'normal' ? blend : scope.blend;
          if (blendKey !== 'pass through' && blendKey !== 'normal') report.note('Group blend mode', 'approx', 'applied to each child rather than the merged group');
          const masks = [...scope.masks]; if (l.mask && !l.mask.disabled && l.rawData) { masks.push(l); report.note('Group masks', 'live'); }
          const clipPaths = [...scope.clipPaths]; const vm = vectorMaskPath(l, shift, report); if (vm) clipPaths.push(vm);
          walk(l.children, { groupId: id, opacity, hidden: scope.hidden || !!l.hidden, blend: groupBlend, masks, clipPaths, chain: [...scope.chain, id] });
          continue;
        }

        if (l.adjustment) {
          if (l.hidden || scope.hidden) { report.note('Hidden adjustment layers', 'dropped', 'not applied, because they were switched off'); continue; }
          const warns: string[] = []; const adj = adjFromPsd(l.adjustment, s => warns.push(s));
          warns.forEach(w => report.warn(w));
          const typeName = (l.adjustment as { type: string }).type;
          if (!adj) { report.note(`${typeName} adjustment`, 'dropped', 'no equivalent in Tela yet'); continue; }
          const fn = compileAdjustment(adj); const opacity = (l.opacity ?? 1) * scope.opacity;
          const mask = l.mask && !l.mask.disabled && l.mask.right !== undefined && l.rawData ? { layer: l, rect: { x: l.mask.left || 0, y: l.mask.top || 0, w: (l.mask.right || 0) - (l.mask.left || 0), h: (l.mask.bottom || 0) - (l.mask.top || 0) }, outside: l.mask.defaultColor ?? 0 } : undefined;
          const entry = { fn, opacity, name: `${typeName}: ${name}`, mask };
          // A clipped adjustment touches only its base. Otherwise it reaches everything below in this scope.
          const clipStart = clipBaseAt;
          const applyTo = l.clipping && clipBase ? items.slice(clipStart) : items.filter(it => scope.chain.every(g => it.scope.includes(g)));
          for (const it of applyTo) it.adjustments.push(entry);
          report.note(`${typeName[0].toUpperCase()}${typeName.slice(1)} adjustment`, 'baked', 'applied to the layers it covers');
          if (blendKey !== 'normal') report.note('Adjustment blend mode', 'approx', 'adjustments apply as Normal');
          continue;
        }

        const item = makeItem(l, name, blend, scope, ox, oy, shift);
        if (!item) continue;
        // Clipping: this layer shows only where the base below it does.
        if (l.clipping && clipBase) { item.clipBase = clipBase; report.note('Clipping masks', 'live'); }
        else { clipBase = item; clipBaseAt = items.length; }
        items.push(item); allItems.push(item);
      }
    };

    /** Structure pass for one non-group, non-adjustment layer. */
    const makeItem = (l: PsdLayer, name: string, blend: TelaBlendMode | undefined, scope: Scope, ox: number, oy: number, shift: (p: CompoundPath) => CompoundPath): Item | null => {
      const left = (l.left ?? 0), top = (l.top ?? 0), w = Math.max(0, (l.right ?? 0) - left), h = Math.max(0, (l.bottom ?? 0) - top);
      const hasPixels = w > 0 && h > 0 && !!(l.rawData as RawLayerData | undefined)?.channels.some(c => c.id !== -2 && c.id !== -3 && c.data);
      const rect = { x: left - ox, y: top - oy, w, h };
      const opacity = scope.opacity * (l.opacity ?? 1), hidden = scope.hidden || !!l.hidden;
      const fillOpacity = (l as { fillOpacity?: number }).fillOpacity ?? 1;
      const meta: ImportedObjectMeta = { source: 'psd', layerName: name };
      const base = { blendMode: blend && blend !== 'normal' ? blend : undefined, hidden: hidden || undefined, locked: (l as any).protected?.position && (l as any).protected?.composite ? true : undefined, groupId: scope.groupId };
      const mk = (obj: TelaVectorObject, needsPixels: boolean): Item => {
        Object.assign(obj, Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)));
        return { obj, layer: l, pixelRect: rect, needsPixels, adjustments: [], ownMask: l.mask && !l.mask.disabled && l.mask.right !== undefined ? l : undefined, inheritedMasks: scope.masks, scope: scope.chain };
      };
      const applyClip = (obj: TelaVectorObject) => {
        const paths = [...scope.clipPaths]; const own = l.vectorFill ? null : vectorMaskPath(l, shift, report); if (own) paths.push(own);
        if (paths.length) { (obj.geom ||= { v: 1 }).clip = { d: paths.join(' '), fillRule: 'nonzero' }; if (paths.length > 1) report.note('Nested vector masks', 'approx', 'combined rather than intersected'); }
      };
      const applyStyle = (obj: TelaVectorObject, canRepaint: boolean) => {
        const st = layerStyleFrom(l.effects, globalAngle, { color, report, canRepaint, box: rect, fillOpacity: fillOpacity < 1 ? fillOpacity : undefined, patternSize: id => { const info = patternsById.get(id); return info ? { w: info.bounds.w, h: info.bounds.h } : null; } });
        if (st.fillColor && canRepaint) { obj.fill = st.fillColor; delete obj.gradient; if (obj.geom?.fill) delete obj.geom.fill; }
        if (st.fillGradient && canRepaint) (obj.geom ||= { v: 1 }).fill = st.fillGradient;
        if (st.spec) (obj.geom ||= { v: 1 }).material = { preset: 'layerStyle', params: { style: JSON.stringify(st.spec) } };
      };

      // ── Type ─────────────────────────────────────────────────────────────────────────
      if (l.text) {
        const t = buildText(l, rect, opacity, color, fonts, report);
        (t.geom ||= { v: 1 }).imported = { ...meta, kind: 'text', font: (l.text.style as any)?.font?.name };
        if (!hasPixels) delete t.geom.textPreview;
        applyStyle(t, false); applyClip(t);
        return mk(t, hasPixels);
      }

      // ── Shape and solid/gradient fill layers ─────────────────────────────────────────
      const fill: any = l.vectorFill;
      if (fill && fill.type !== 'pattern') {
        let path = l.vectorMask?.paths?.length ? shift(knotsToPath(l.vectorMask.paths, report)) : null;
        const isFillLayer = !path;
        if (!path) { const W = page.w, H = page.h; path = { fillRule: 'nonzero', subpaths: [{ closed: true, anchors: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] }] }; }
        const box = isFillLayer ? { x: 0, y: 0, w: page.w, h: page.h } : rect;
        const paint: Paint | 'none' = (l as any).vectorStroke?.fillEnabled === false ? 'none' : fill.type === 'color' ? color(fill.color) : psdGradientPaint(fill, box, color, report);
        const vs: any = (l as any).vectorStroke; const strokeOn = vs?.strokeEnabled;
        const strokePaint: Paint | 'none' = strokeOn ? vs.content?.type === 'color' ? color(vs.content.color) : vs.content?.type ? psdGradientPaint(vs.content, box, color, report) : '#000' : 'none';
        const obj = pathToObject(path, {
          fill: paint, stroke: strokePaint, strokeWidth: strokeOn ? vs.lineWidth?.value ?? 1 : 0, opacity,
          strokeStyle: strokeOn ? { cap: vs.lineCap === 'round' ? 'round' : vs.lineCap === 'square' ? 'square' : 'butt', join: vs.lineJoin === 'round' ? 'round' : vs.lineJoin === 'bevel' ? 'bevel' : 'miter', miterLimit: vs.miterLimit, dash: vs.lineDashSet?.length ? vs.lineDashSet.map((d: any) => (d.value ?? d) * (vs.lineWidth?.value ?? 1)) : undefined, align: vs.lineAlignment === 'inside' ? 'inside' : vs.lineAlignment === 'outside' ? 'outside' : 'center' } : undefined,
          label: name, role: 'ORNAMENT',
        }, oid('psdp'));
        (obj.geom ||= { v: 1 }).imported = { ...meta, kind: isFillLayer ? 'fill' : 'shape' };
        applyStyle(obj, !strokeOn); applyClip(obj);
        report.note(isFillLayer ? 'Fill layers' : 'Shape layers', 'live', isFillLayer ? undefined : 'full Bézier paths, editable with the Direct tool');
        const parametric = (l as any).vectorOrigination?.keyDescriptorList?.some((k: any) => k.keyOriginType);
        if (parametric) report.note('Live shape properties', 'approx', 'corner radii and the like arrive as anchor points');
        return mk(obj, false);
      }
      if (fill?.type === 'pattern') report.note('Pattern fill layers', hasPixels ? 'baked' : 'dropped', hasPixels ? 'kept as pixels' : 'the pattern itself is not in the file\'s layer data');

      // ── Pixels (plain and smart objects) ─────────────────────────────────────────────
      if (!hasPixels) { report.note('Empty layers', 'dropped', 'nothing to draw'); return null; }
      const img: TelaVectorObject = { id: oid('psdi'), kind: 'IMAGE', x: rect.x, y: rect.y, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity, sourceImageSrc: '', sourceCrop: { x: 0, y: 0, width: w, height: h, sourceWidth: w, sourceHeight: h }, objectLabel: name, semanticRole: 'ARTWORK', templateRole: 'HERO', geom: { v: 1, imported: { ...meta, kind: l.placedLayer ? 'smart' : 'pixel' } } };
      applyStyle(img, false); applyClip(img);
      if (l.placedLayer) {
        report.note('Smart objects', 'look', 'shown as rendered, including smart filters; the embedded file opens as its own document');
        if ((l.placedLayer as any).filter) report.note('Smart filters', 'baked', 'already part of the rendered pixels');
      } else report.note('Pixel layers', 'live');
      return mk(img, true);
    };

    walk(page.layers, { opacity: 1, hidden: false, masks: [], clipPaths: [], chain: [] });
    const guides = page === pagesIn[0] ? guidesOf(psd) : undefined;
    if (guides) report.note('Guides', 'live', undefined, guides.x.length + guides.y.length);
    pages.push({ name: page.name, width: page.w, height: page.h, objects: items.map(i => i.obj), studio: { v: 1, groups: Object.keys(groups).length ? groups : undefined, guides } });
    pageItems.set(pages[pages.length - 1], items);
  }

  // ── Pixel pass ───────────────────────────────────────────────────────────────────────
  const uploaded = new Map<PsdLayer, { src: string; w: number; h: number; rect: { x: number; y: number; w: number; h: number } }>();
  const maskUploads = new Map<PsdLayer, { src: string; rect: { x: number; y: number; w: number; h: number }; outside: 0 | 255 }>();
  const pixelItems = allItems.filter(it => it.needsPixels && !(o.skipHidden && it.obj.hidden));
  let done = 0;
  const maskFor = async (l: PsdLayer) => {
    const hit = maskUploads.get(l); if (hit) return hit;
    const m = l.mask!, w = (m.right || 0) - (m.left || 0), h = (m.bottom || 0) - (m.top || 0);
    const outside: 0 | 255 = (m.defaultColor ?? 0) > 127 ? 255 : 0;
    if (w <= 0 || h <= 0 || !l.rawData) return null;
    const bm = decodeLayerMask(l.rawData as RawLayerData, w, h); if (!bm) return null;
    const put = await env.putImage(bm, `${l.name || 'Layer'} mask`);
    const out = { src: put.src, rect: { x: m.left || 0, y: m.top || 0, w, h }, outside };
    maskUploads.set(l, out); return out;
  };

  for (const it of allItems) {
    if (it.needsPixels && (!o.skipHidden || !it.obj.hidden)) {
      env.progress?.(`Layer ${it.layer.name || ''}`.trim(), ++done, pixelItems.length);
      const rect = it.pixelRect!, l = it.layer;
      const bm = decodeLayerPixels({ ...(l.rawData as RawLayerData), colorMode: mode }, rect.w, rect.h, ctx);
      if (it.adjustments.length) await bakeAdjustments(bm, rect, it, ctx, l);
      const put = await env.putImage(bm, l.name || 'Layer');
      uploaded.set(l, { src: put.src, w: rect.w, h: rect.h, rect });
      if (it.obj.kind === 'IMAGE') it.obj.sourceImageSrc = put.src;
      else if (it.obj.kind === 'TEXT' && it.obj.geom?.textPreview) { const p = it.obj.geom.textPreview; p.src = put.src; p.dx = rect.x - it.obj.x; p.dy = rect.y - it.obj.y; p.w = rect.w; p.h = rect.h; p.base = { w: it.obj.w, h: it.obj.h }; }
      (l as { rawData?: unknown }).rawData = it.ownMask || it.layer.mask ? l.rawData : undefined;
    }
    if (it.adjustments.length) {
      if (it.obj.kind !== 'IMAGE') bakeVectorAdjustments(it, report);
      (it.obj.geom ||= { v: 1 }).imported = { ...(it.obj.geom.imported as ImportedObjectMeta), bakedAdjustments: it.adjustments.map(a => a.name) };
    }
  }

  // Masks and clipping reference other layers' pixels, so they resolve once every upload is known.
  for (const it of allItems) {
    const masks: GeomMask[] = [];
    const add = async (l: PsdLayer, stage: 'content' | 'clip') => {
      const m = await maskFor(l); if (!m) return;
      masks.push({ src: m.src, dx: m.rect.x - it.obj.x, dy: m.rect.y - it.obj.y, w: m.rect.w, h: m.rect.h, base: { w: it.obj.w, h: it.obj.h }, mode: 'luminance', outside: m.outside, stage });
    };
    if (it.ownMask) { await add(it.ownMask, 'content'); report.note('Layer masks', 'live', 'non-destructive; they move with the layer'); }
    for (const g of it.inheritedMasks) await add(g, 'clip');
    const base = it.clipBase;
    if (base) {
      if (base.obj.kind === 'PATH' && base.obj.svgPathData) { const g = it.obj.geom ||= { v: 1 }; g.clip = { d: base.obj.svgPathData, fillRule: base.obj.geom?.fillRule ?? 'nonzero' }; }
      else {
        const up = uploaded.get(base.layer);
        if (up) masks.push({ src: up.src, dx: up.rect.x - it.obj.x, dy: up.rect.y - it.obj.y, w: up.rect.w, h: up.rect.h, base: { w: it.obj.w, h: it.obj.h }, mode: 'alpha', stage: 'clip' });
      }
      if (base.ownMask) { const m = await maskFor(base.ownMask); if (m) masks.push({ src: m.src, dx: m.rect.x - it.obj.x, dy: m.rect.y - it.obj.y, w: m.rect.w, h: m.rect.h, base: { w: it.obj.w, h: it.obj.h }, mode: 'luminance', outside: m.outside, stage: 'clip' }); }
    }
    if (masks.length) (it.obj.geom ||= { v: 1 }).masks = masks;
  }
  for (const it of allItems) (it.layer as { rawData?: unknown }).rawData = undefined;

  // Pattern overlays name their tile by id; upload each tile once and point the styles at it.
  const patternUrls = new Map<string, string>();
  for (const it of allItems) {
    const m = it.obj.geom?.material; const style = m?.params?.style; if (typeof style !== 'string' || !style.includes('pattern:')) continue;
    const id = /"href":"pattern:([^"]+)"/.exec(style)?.[1]; if (!id) continue;
    let url = patternUrls.get(id);
    if (!url) { const info = patternsById.get(id); url = (await env.putImage({ width: info.bounds.w, height: info.bounds.h, data: info.data }, info.name || 'Pattern')).src; patternUrls.set(id, url); }
    m!.params!.style = style.replace(`pattern:${id}`, url);
  }

  // ── Embedded smart objects ───────────────────────────────────────────────────────────
  if (env.putBlob) {
    for (const it of allItems) {
      const pl: any = it.layer.placedLayer; if (!pl) continue;
      const f = linked.get(pl.id); if (!f?.data) continue;
      let assetId = storedLinks.get(pl.id);
      if (!assetId) { assetId = await env.putBlob(f.data, f.name); storedLinks.set(pl.id, assetId); smartObjects.push({ assetId, name: f.name, type: f.type, layer: it.layer.name || '' }); }
      (it.obj.geom as TelaGeomExt).imported!.smart = { assetId, name: f.name, type: f.type };
    }
  }

  // ── Things that do not come across ───────────────────────────────────────────────────
  const res: any = psd.imageResources || {};
  if (res.layerComps?.length) report.note('Layer comps', 'dropped', 'the layers come across in their current state', res.layerComps.length);
  if (res.slices?.length && res.slices.some((s: any) => s.slices?.length > 1)) report.note('Slices', 'dropped');
  if (res.alphaChannelNames?.length) report.note('Alpha channels', 'dropped', 'saved selections are not carried', res.alphaChannelNames.length);
  if (res.timelineInformation || (psd as any).animations) report.note('Timeline animation', 'dropped', 'the current frame is imported');

  let composite: RgbaImage | undefined;
  if (o.wantComposite && psd.rawCompositeData) { try { composite = decodeComposite(psd.rawCompositeData, psd.width, psd.height, psd.channels ?? 3, bits, mode, !!(bytes[4] === 0 && bytes[5] === 2), ctx) || undefined; } catch { /* the composite is only a reference */ } }

  const fontList = Object.values(fonts);
  for (const f of fontList) if (f.status === 'substitute') report.warn(`Font "${f.requested}" is not on this computer. Text shows Photoshop's pixels until you edit it, then uses ${f.family}.`);

  return {
    pages,
    composite,
    report: {
      fileName: o.fileName, format: /\.psb$/i.test(o.fileName) ? 'psb' : 'psd', width: psd.width, height: psd.height,
      colorMode: COLOR_MODE_NAMES[mode], bits, layers: layerCount, features: report.features(), fonts: fontList, warnings: report.warnings, smartObjects,
    },
  };
}

const pageItems = new WeakMap<ImportedPage, Item[]>();

function guidesOf(psd: Psd) {
  const gs: any[] | undefined = (psd.imageResources as any)?.gridAndGuidesInformation?.guides;
  if (!gs?.length) return undefined;
  return { x: gs.filter(g => g.direction === 'vertical').map(g => g.location), y: gs.filter(g => g.direction === 'horizontal').map(g => g.location) };
}

// ── Vector paths ───────────────────────────────────────────────────────────────────────
function knotsToSub(p: { open: boolean; knots: { points: number[] }[] }): SubPath {
  return { closed: !p.open, anchors: p.knots.map(k => ({ x: k.points[2], y: k.points[3], hin: { x: k.points[0], y: k.points[1] }, hout: { x: k.points[4], y: k.points[5] } })) };
}
function knotsToPath(paths: any[], report: ReportBuilder): CompoundPath {
  // Photoshop's path operations run bottom to top. Combine runs stay plain; subtract and friends
  // go through the boolean engine so the outcome is a real outline, and fall back to even-odd.
  let out: CompoundPath = { fillRule: 'nonzero', subpaths: [] };
  for (const p of paths) {
    if (!p.knots?.length) continue;
    const sub: CompoundPath = { fillRule: p.fillRule === 'even-odd' ? 'evenodd' : 'nonzero', subpaths: [knotsToSub(p)] };
    const op = p.operation as string | undefined;
    if (!out.subpaths.length || !op || op === 'combine' || op === 'add') { out = { fillRule: out.fillRule, subpaths: [...out.subpaths, ...sub.subpaths] }; continue; }
    try {
      out = pathBoolean(op === 'subtract' ? 'subtract' : op === 'intersect' ? 'intersect' : 'exclude', [out, sub]);
    } catch {
      report.note('Compound shape operations', 'approx', 'combined with an even-odd fill');
      out = { fillRule: 'evenodd', subpaths: [...out.subpaths, ...sub.subpaths] };
    }
  }
  return out;
}
function vectorMaskPath(l: PsdLayer, shift: (p: CompoundPath) => CompoundPath, report: ReportBuilder): string | null {
  const vm = l.vectorMask; if (!vm?.paths?.length || vm.disable) return null;
  const path = shift(knotsToPath(vm.paths as never, report));
  if (vm.invert) report.note('Inverted vector masks', 'dropped', 'drawn uninverted');
  report.note('Vector masks', 'live', 'kept as a geometric clip');
  return toPathData(path);
}

// ── Type ───────────────────────────────────────────────────────────────────────────────
function buildText(l: PsdLayer, rect: { x: number; y: number; w: number; h: number }, opacity: number, color: (c: unknown) => string, fonts: Record<string, ResolvedFont>, report: ReportBuilder): TelaVectorObject {
  const t: any = l.text; const s: any = t.style || {}; const para: any = t.paragraphStyle || {};
  const tf: number[] = t.transform || [1, 0, 0, 1, rect.x, rect.y];
  const scale = Math.hypot(tf[0], tf[1]) || 1, rotation = Math.atan2(tf[1], tf[0]) * 180 / Math.PI;
  const fontName: string | undefined = s.font?.name;
  const font = fontName ? fonts[fontName] : undefined;
  const size = (s.fontSize || 24) * scale;
  const value: string = String(t.text || '').replace(/\r\n?|\u0003/g, '\n');
  const runs: any[] = t.styleRuns || [];
  const distinctStyles = new Set(runs.map(r => JSON.stringify([r.style?.font?.name, r.style?.fontSize, r.style?.fillColor, r.style?.tracking]))).size;
  const mixed = distinctStyles > 1;
  const warped = !!t.warp && t.warp.style && t.warp.style !== 'none';
  const skew = Math.abs(tf[0] * tf[2] + tf[1] * tf[3]) > 1e-3 || Math.abs(Math.hypot(tf[2], tf[3]) - scale) > 1e-3 * scale;
  const stretched = (s.horizontalScale ?? 1) !== 1 || (s.verticalScale ?? 1) !== 1;
  const align: 'left' | 'center' | 'right' = para.justification === 'center' || para.justification === 'justify-center' ? 'center' : para.justification === 'right' || para.justification === 'justify-right' ? 'right' : 'left';
  const isBox = t.shapeType === 'box' && t.boxBounds;
  const leading = !s.autoLeading && s.leading > .1 ? (s.leading * scale) / size : para.autoLeading ?? 1.2;
  const blocks: TelaBlock[] = value.split('\n').map((text, i) => ({ id: `p${i}`, kind: 'p' as const, text }));
  let x = rect.x, y = rect.y, w = Math.max(rect.w, 8), h = Math.max(rect.h, 8);
  if (isBox && !rotation) {
    const b: number[] = Array.isArray(t.boxBounds) ? t.boxBounds : [t.boxBounds.left, t.boxBounds.top, t.boxBounds.right, t.boxBounds.bottom];
    x = tf[4] + b[0] * scale; y = tf[5] + b[1] * scale; w = (b[2] - b[0]) * scale; h = (b[3] - b[1]) * scale;
  } else if (!isBox) {
    // Point text grows from its anchor: pad the box so editing has room and stays anchored.
    w = rect.w + size; x = align === 'center' ? rect.x - size / 2 : align === 'right' ? rect.x - size : rect.x;
  }
  const obj: TelaVectorObject = {
    id: oid('psdt'), kind: 'TEXT', x, y, w, h, fill: color(s.fillColor), stroke: s.strokeFlag ? color(s.strokeColor) : 'none', strokeWidth: s.strokeFlag ? (s.outlineWidth || 1) * scale : 0, rotation: Math.abs(rotation) < .01 ? 0 : rotation, opacity,
    text: value, blocks, fontSize: size, fontFamily: font?.css || 'Inter, sans-serif', fontWeight: Math.max(font?.weight ?? 400, s.fauxBold ? 700 : 0) || 400,
    fontStyle: font?.italic || s.fauxItalic ? 'italic' : 'normal', textAlign: align, letterSpacing: (s.tracking || 0) / 1000, lineHeight: leading,
    textTransform: s.fontCaps === 2 ? 'uppercase' : 'none', underline: s.underline || undefined, strike: s.strikethrough || undefined, wrap: !!isBox, padding: 0, textRole: 'BOX',
    objectLabel: l.name || value.slice(0, 40), templateRole: 'BODY',
  };
  // Photoshop's pixels show until the first edit, whatever the font. Its line breaking, kerning
  // and tracking are its own, so nothing else lines up to the pixel, even with the font installed.
  (obj.geom ||= { v: 1 }).textPreview = { src: '', dx: 0, dy: 0, w: rect.w, h: rect.h, base: { w, h } };
  report.note('Type', 'look', "the words are editable; Photoshop's own rendering shows until you edit");
  {
    if (warped) report.note('Warped text', 'look', 'the warp is kept as pixels; editing removes it');
    if (mixed) report.note('Mixed text styles', 'look', 'editing applies the first style to the whole text');
    if (skew || stretched) report.note('Skewed or scaled type', 'look', 'editing returns it to plain type');
  }
  if (s.fontCaps === 1) report.note('Small caps', 'approx', 'editing shows regular case');
  if (t.shapeType === 'box' && value.includes('\t')) report.note('Tab stops', 'dropped');
  return obj;
}

// ── Baking adjustments ─────────────────────────────────────────────────────────────────
async function bakeAdjustments(bm: RgbaImage, rect: { x: number; y: number; w: number; h: number }, it: Item, ctx: DecodeContext, l: PsdLayer) {
  const { width: w, height: h, data } = bm; const c = [0, 0, 0];
  for (const adj of it.adjustments) {
    const fn = adj.fn; let coverage: Uint8Array | null = null; let m: { x: number; y: number; w: number; h: number } | null = null;
    if (adj.mask && adj.mask.layer.rawData) {
      m = adj.mask.rect; const dec = decodeLayerMask(adj.mask.layer.rawData as RawLayerData, m.w, m.h);
      if (dec) { coverage = new Uint8Array(m.w * m.h); for (let i = 0; i < coverage.length; i++) coverage[i] = dec.data[i * 4]; }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (data[i + 3] === 0) continue;
      let k = adj.opacity;
      if (coverage && m) { const mx = rect.x + x - m.x, my = rect.y + y - m.y; k *= (mx >= 0 && my >= 0 && mx < m.w && my < m.h ? coverage[my * m.w + mx] : adj.mask!.outside) / 255; if (k <= 0) continue; }
      c[0] = data[i] / 255; c[1] = data[i + 1] / 255; c[2] = data[i + 2] / 255;
      fn(c);
      data[i] = data[i] + (c[0] * 255 - data[i]) * k; data[i + 1] = data[i + 1] + (c[1] * 255 - data[i + 1]) * k; data[i + 2] = data[i + 2] + (c[2] * 255 - data[i + 2]) * k;
    }
  }
}

function adjustHex(hex: string, adjustments: Item['adjustments']): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return hex;
  let r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16); const c = [0, 0, 0];
  for (const a of adjustments) { c[0] = r / 255; c[1] = g / 255; c[2] = b / 255; a.fn(c); const k = a.opacity * (a.mask ? .5 : 1); r += (c[0] * 255 - r) * k; g += (c[1] * 255 - g) * k; b += (c[2] * 255 - b) * k; }
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
/** Vector and type colours through the same adjustments the pixels got. */
function bakeVectorAdjustments(it: Item, report: ReportBuilder) {
  const o = it.obj, adj = it.adjustments;
  if (o.fill && o.fill !== 'none') o.fill = adjustHex(o.fill, adj);
  if (o.stroke && o.stroke !== 'none') o.stroke = adjustHex(o.stroke, adj);
  const p = o.geom?.fill;
  if (p && typeof p !== 'string' && 'stops' in p) p.stops = p.stops.map(s => ({ ...s, color: adjustHex(s.color, adj) }));
  if (adj.some(a => a.mask)) report.note('Masked adjustments over vector', 'approx', 'applied at half strength to shapes and type');
}
