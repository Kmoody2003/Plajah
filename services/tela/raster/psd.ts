// raster/psd — Photoshop document import/export via ag-psd (MIT), mapped onto OUR model.
//
// Import: pixel layers (with position), groups (pass-through or isolated), clipping,
// opacity + fill opacity, all blend modes, bitmap masks (bounds + default colour + density
// + feather), vector masks (Bézier knots), text layers (rasterized pixels + text kept as
// metadata), adjustment layers that map to ours (levels, curves, hue/sat incl. ranges,
// colour balance, B&W, photo filter, channel mixer, exposure, vibrance, invert, posterize,
// threshold, gradient map, selective colour, brightness/contrast), solid colour fill
// layers and the basic layer effects (drop/inner shadow, outer glow, stroke, colour overlay).
// Export writes a layered PSD (Photoshop / GIMP / Photopea) with the same mapping. Layers
// whose look cannot be expressed in PSD (smart filters, non-integer transforms, gradient
// masks) are rasterized through the CPU compositor first, so the file looks right.

import { readPsd, writePsdUint8Array, initializeCanvas, type Layer as PsdLayer, type Psd, type BlendMode as PsdBlend, type AdjustmentLayer as PsdAdj, type Color as PsdColor, type LayerEffectsInfo } from 'ag-psd';
import type { Adjustment, BlendMode, GroupBlendMode, LayerStyles, PathPoint, RasterDocument, RasterLayer, RGB, VectorMask, PixelLayer, HueRange } from './model';
import { createDocument, pixelLayer, adjustmentLayer, fillLayer, groupLayer, affineTranslate, newLayerId } from './model';
import type { Bitmap8, Mask8 } from './buffer';
import { createMask } from './buffer';
import { renderDocumentCpu, type AssetSource } from './cpuBackend';
import { rasterToBitmap } from './buffer';

let canvasInit = false;
/** ag-psd wants a canvas factory; we only use imageData paths, so plain objects suffice (node/worker safe). */
function ensureCanvas() {
  if (canvasInit) return; canvasInit = true;
  const hasDom = typeof document !== 'undefined';
  if (!hasDom) initializeCanvas((() => { throw new Error('canvas not available (imageData mode)'); }) as any, (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) as any);
}

const toPsdBlend = (b: GroupBlendMode): PsdBlend => (b === 'pass-through' ? 'pass through' : (b.replace(/-/g, ' ') as PsdBlend));
const fromPsdBlend = (b?: PsdBlend): GroupBlendMode => {
  if (!b) return 'normal'; if (b === 'pass through') return 'pass-through';
  if (b === 'subtraction') return 'subtract';
  const m = b.replace(/ /g, '-'); return (['linear-height', 'height'].includes(m) ? 'normal' : m) as GroupBlendMode;
};
const rgbOf = (c?: PsdColor): RGB => { const x = c as any; if (!x) return [0, 0, 0]; if ('r' in x) return [x.r, x.g, x.b]; if ('fr' in x) return [x.fr * 255, x.fg * 255, x.fb * 255]; return [0, 0, 0]; };
const toColor = (c: RGB): PsdColor => ({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) });
const units = (v?: { value: number }) => v?.value ?? 0;

export interface PsdImportResult { doc: RasterDocument; warnings: string[] }
export interface PsdAssetSink { putBitmap(bm: Bitmap8, name: string): string; putMask(m: Mask8, name: string): string }

// ── Adjustments ─────────────────────────────────────────────────────────────
const HUE_RANGE_NAMES = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'] as const;
function adjFromPsd(a: PsdAdj, warn: (s: string) => void): Adjustment | null {
  switch (a.type) {
    case 'levels': {
      const ch = (c?: { shadowInput: number; highlightInput: number; shadowOutput: number; highlightOutput: number; midtoneInput: number }) => c ? { inBlack: c.shadowInput / 255, inWhite: c.highlightInput / 255, gamma: c.midtoneInput || 1, outBlack: c.shadowOutput / 255, outWhite: c.highlightOutput / 255 } : undefined;
      return { type: 'levels', master: ch(a.rgb) || { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1 }, r: ch(a.red), g: ch(a.green), b: ch(a.blue) };
    }
    case 'curves': { const pts = (c?: { input: number; output: number }[]) => c && c.length ? c.map(p => [p.input / 255, p.output / 255] as [number, number]) : undefined; return { type: 'curves', master: pts(a.rgb) || [[0, 0], [1, 1]], r: pts(a.red), g: pts(a.green), b: pts(a.blue) }; }
    case 'exposure': return { type: 'exposure', exposure: a.exposure ?? 0, offset: a.offset ?? 0, gamma: a.gamma ?? 1 };
    case 'vibrance': return { type: 'vibrance', vibrance: a.vibrance ?? 0, saturation: a.saturation ?? 0 };
    case 'hue/saturation': {
      const ranges: HueRange[] = [];
      for (const n of HUE_RANGE_NAMES) { const c = a[n]; if (c && (c.hue || c.saturation || c.lightness)) ranges.push({ range: { from: c.b, to: c.c, feather: Math.max(1, c.b - c.a) }, hue: c.hue, saturation: c.saturation, lightness: c.lightness }); }
      return { type: 'hueSaturation', hue: a.master?.hue ?? 0, saturation: a.master?.saturation ?? 0, lightness: a.master?.lightness ?? 0, ranges: ranges.length ? ranges : undefined };
    }
    case 'color balance': { const v = (x?: { cyanRed: number; magentaGreen: number; yellowBlue: number }): RGB => x ? [x.cyanRed, x.magentaGreen, x.yellowBlue] : [0, 0, 0]; return { type: 'colorBalance', shadows: v(a.shadows), midtones: v(a.midtones), highlights: v(a.highlights), preserveLuminosity: a.preserveLuminosity ?? true }; }
    case 'black & white': return { type: 'blackWhite', reds: a.reds ?? 40, yellows: a.yellows ?? 60, greens: a.greens ?? 40, cyans: a.cyans ?? 60, blues: a.blues ?? 20, magentas: a.magentas ?? 80 };
    case 'photo filter': return { type: 'photoFilter', color: rgbOf(a.color), density: a.density ?? 0.25, preserveLuminosity: a.preserveLuminosity ?? true };
    case 'channel mixer': { const r = (c?: { red: number; green: number; blue: number; constant: number }, d: [number, number, number, number] = [0, 0, 0, 0]) => c ? [c.red, c.green, c.blue, c.constant] as [number, number, number, number] : d; return { type: 'channelMixer', red: r(a.monochrome ? a.gray : a.red, [100, 0, 0, 0]), green: r(a.green, [0, 100, 0, 0]), blue: r(a.blue, [0, 0, 100, 0]), monochrome: a.monochrome }; }
    case 'invert': return { type: 'invert' };
    case 'posterize': return { type: 'posterize', levels: a.levels ?? 4 };
    case 'threshold': return { type: 'threshold', level: (a.level ?? 128) / 255 };
    case 'brightness/contrast': return { type: 'brightnessContrast', brightness: a.brightness ?? 0, contrast: a.contrast ?? 0 };
    case 'gradient map': return { type: 'gradientMap', reverse: a.reverse, dither: a.dither, gradient: { stops: (a.colorStops || []).map(s => ({ offset: s.location, color: rgbOf(s.color), midpoint: s.midpoint })) } };
    case 'selective color': { const k = (c?: { c: number; m: number; y: number; k: number }) => c ? [c.c, c.m, c.y, c.k] as [number, number, number, number] : undefined; return { type: 'selectiveColor', method: a.mode === 'absolute' ? 'absolute' : 'relative', reds: k(a.reds), yellows: k(a.yellows), greens: k(a.greens), cyans: k(a.cyans), blues: k(a.blues), magentas: k(a.magentas), whites: k(a.whites), neutrals: k(a.neutrals), blacks: k(a.blacks) }; }
    case 'color lookup': warn('Color Lookup adjustment imported without its LUT data (re-attach the .cube)'); return null;
  }
  return null;
}
function adjToPsd(a: Adjustment): PsdAdj | null {
  switch (a.type) {
    case 'levels': { const ch = (l?: { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }) => l ? { shadowInput: Math.round(l.inBlack * 255), highlightInput: Math.round(l.inWhite * 255), shadowOutput: Math.round(l.outBlack * 255), highlightOutput: Math.round(l.outWhite * 255), midtoneInput: l.gamma } : undefined; return { type: 'levels', rgb: ch(a.master), red: ch(a.r), green: ch(a.g), blue: ch(a.b) }; }
    case 'curves': { const c = (p?: [number, number][]) => p ? p.map(([x, y]) => ({ input: Math.round(x * 255), output: Math.round(y * 255) })) : undefined; return { type: 'curves', rgb: c(a.master), red: c(a.r), green: c(a.g), blue: c(a.b) }; }
    case 'exposure': return { type: 'exposure', exposure: a.exposure, offset: a.offset, gamma: a.gamma };
    case 'vibrance': return { type: 'vibrance', vibrance: a.vibrance, saturation: a.saturation };
    case 'hueSaturation': return { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: a.hue, saturation: a.saturation, lightness: a.lightness } };
    case 'colorBalance': { const v = (x: RGB) => ({ cyanRed: x[0], magentaGreen: x[1], yellowBlue: x[2] }); return { type: 'color balance', shadows: v(a.shadows), midtones: v(a.midtones), highlights: v(a.highlights), preserveLuminosity: a.preserveLuminosity }; }
    case 'blackWhite': return { type: 'black & white', reds: a.reds, yellows: a.yellows, greens: a.greens, cyans: a.cyans, blues: a.blues, magentas: a.magentas };
    case 'photoFilter': return { type: 'photo filter', color: toColor(a.color), density: a.density, preserveLuminosity: a.preserveLuminosity };
    case 'channelMixer': { const c = (v: number[]) => ({ red: v[0], green: v[1], blue: v[2], constant: v[3] }); return { type: 'channel mixer', monochrome: a.monochrome, red: c(a.red), green: c(a.green), blue: c(a.blue) }; }
    case 'invert': return { type: 'invert' };
    case 'posterize': return { type: 'posterize', levels: a.levels };
    case 'threshold': return { type: 'threshold', level: Math.round(a.level * 255) };
    case 'brightnessContrast': return { type: 'brightness/contrast', brightness: a.brightness, contrast: a.contrast, useLegacy: false };
    case 'gradientMap': return { type: 'gradient map', gradientType: 'solid', reverse: a.reverse, dither: a.dither, colorStops: a.gradient.stops.map(s => ({ color: toColor(s.color), location: s.offset, midpoint: s.midpoint ?? 0.5 })), opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] } as PsdAdj;
    case 'selectiveColor': { const k = (v?: number[]) => v ? { c: v[0], m: v[1], y: v[2], k: v[3] } : undefined; return { type: 'selective color', mode: a.method, reds: k(a.reds), yellows: k(a.yellows), greens: k(a.greens), cyans: k(a.cyans), blues: k(a.blues), magentas: k(a.magentas), whites: k(a.whites), neutrals: k(a.neutrals), blacks: k(a.blacks) }; }
    default: return null;
  }
}

// ── Effects ─────────────────────────────────────────────────────────────────
function stylesFromPsd(e?: LayerEffectsInfo): LayerStyles | undefined {
  if (!e) return undefined; const s: LayerStyles = { enabled: !e.disabled };
  const sh = (x?: any) => x ? { enabled: x.enabled !== false, blend: fromPsdBlend(x.blendMode) as BlendMode, color: rgbOf(x.color), opacity: x.opacity ?? 0.75, angle: x.angle ?? 120, distance: units(x.distance), spread: units(x.choke), size: units(x.size) } : undefined;
  s.dropShadow = sh(e.dropShadow?.[0]); s.innerShadow = sh(e.innerShadow?.[0]);
  if (e.outerGlow) s.outerGlow = { enabled: e.outerGlow.enabled !== false, blend: fromPsdBlend(e.outerGlow.blendMode) as BlendMode, color: rgbOf(e.outerGlow.color), opacity: e.outerGlow.opacity ?? 0.75, spread: units(e.outerGlow.choke), size: units(e.outerGlow.size) };
  const st = e.stroke?.[0]; if (st) s.stroke = { enabled: st.enabled !== false, blend: fromPsdBlend(st.blendMode) as BlendMode, color: rgbOf(st.color), opacity: st.opacity ?? 1, size: units(st.size), position: st.position ?? 'outside' };
  const so = e.solidFill?.[0]; if (so) s.colorOverlay = { enabled: so.enabled !== false, blend: fromPsdBlend(so.blendMode) as BlendMode, color: rgbOf(so.color), opacity: so.opacity ?? 1 };
  return s;
}
function stylesToPsd(s?: LayerStyles): LayerEffectsInfo | undefined {
  if (!s) return undefined; const px = (v: number) => ({ units: 'Pixels' as const, value: v }); const e: LayerEffectsInfo = { disabled: s.enabled === false, scale: 1 };
  const sh = (x: NonNullable<LayerStyles['dropShadow']>) => ({ enabled: x.enabled, present: true, showInDialog: true, blendMode: toPsdBlend(x.blend), color: toColor(x.color), opacity: x.opacity, angle: x.angle, distance: px(x.distance), choke: px(x.spread), size: px(x.size), useGlobalLight: false });
  if (s.dropShadow) e.dropShadow = [sh(s.dropShadow)]; if (s.innerShadow) e.innerShadow = [sh(s.innerShadow)];
  if (s.outerGlow) e.outerGlow = { enabled: s.outerGlow.enabled, present: true, blendMode: toPsdBlend(s.outerGlow.blend), color: toColor(s.outerGlow.color), opacity: s.outerGlow.opacity, choke: px(s.outerGlow.spread), size: px(s.outerGlow.size) };
  if (s.stroke) e.stroke = [{ enabled: s.stroke.enabled, present: true, blendMode: toPsdBlend(s.stroke.blend), color: toColor(s.stroke.color), opacity: s.stroke.opacity, size: px(s.stroke.size), position: s.stroke.position, fillType: 'color' }];
  if (s.colorOverlay) e.solidFill = [{ enabled: s.colorOverlay.enabled, present: true, blendMode: toPsdBlend(s.colorOverlay.blend), color: toColor(s.colorOverlay.color), opacity: s.colorOverlay.opacity }];
  return e;
}

// ── Import ──────────────────────────────────────────────────────────────────
export function importPsd(buffer: ArrayBuffer | Uint8Array, sink: PsdAssetSink): PsdImportResult {
  ensureCanvas();
  const warnings: string[] = [], warn = (s: string) => { if (!warnings.includes(s)) warnings.push(s); };
  const psd: Psd = readPsd(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), { useImageData: true, skipThumbnail: true });
  if (psd.colorMode !== undefined && psd.colorMode !== 3) warn(`colour mode ${psd.colorMode} imported as RGB`);
  if ((psd.bitsPerChannel ?? 8) !== 8) warn(`${psd.bitsPerChannel}-bit channels reduced to 8-bit`);
  const doc = createDocument(psd.width, psd.height, { background: null });
  const toBitmap = (d: { width: number; height: number; data: ArrayLike<number> }): Bitmap8 => {
    if (d.data instanceof Uint8ClampedArray || d.data instanceof Uint8Array) return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data as ArrayLike<number>) };
    const isFloat = d.data instanceof Float32Array, out = new Uint8ClampedArray(d.width * d.height * 4);
    for (let i = 0; i < out.length; i++) out[i] = isFloat ? d.data[i] * 255 : d.data[i] / 257;
    return { width: d.width, height: d.height, data: out };
  };
  const convert = (l: PsdLayer): RasterLayer | null => {
    const base = { name: l.name || 'Layer', visible: !l.hidden, opacity: l.opacity ?? 1, fillOpacity: (l as any).fillOpacity ?? 1, clipped: !!l.clipping, id: newLayerId('psd') };
    let out: RasterLayer | null = null;
    if (l.children) {
      out = groupLayer(l.children.map(convert).filter((x): x is RasterLayer => !!x), { ...base, blend: fromPsdBlend(l.blendMode), collapsed: !l.opened });
    } else if (l.adjustment) {
      const a = adjFromPsd(l.adjustment, warn); if (a) out = adjustmentLayer(a, { ...base, blend: fromPsdBlend(l.blendMode) as BlendMode });
      else warn(`adjustment "${(l.adjustment as any).type}" not supported — skipped`);
    } else if (l.vectorFill && l.vectorFill.type === 'color' && !l.imageData) {
      out = fillLayer({ type: 'solid', color: rgbOf(l.vectorFill.color) }, { ...base, blend: fromPsdBlend(l.blendMode) as BlendMode });
    } else if (l.imageData && (l.right! - l.left!) > 0) {
      const key = sink.putBitmap(toBitmap(l.imageData), base.name);
      out = pixelLayer({ assetId: key }, l.imageData.width, l.imageData.height, { ...base, blend: fromPsdBlend(l.blendMode) as BlendMode, transform: affineTranslate(l.left || 0, l.top || 0), styles: stylesFromPsd(l.effects) });
      if (l.text) (out as PixelLayer).text = { value: l.text.text, raw: { transform: l.text.transform, style: (l.text as any).style } };
    } else if (l.text) warn(`text layer "${base.name}" has no rasterized pixels`);
    else return null;
    if (!out) return null;
    const m = l.mask;
    if (m?.imageData && m.right !== undefined) {
      const md = m.imageData, mk = createMask(md.width, md.height); for (let i = 0; i < mk.data.length; i++) mk.data[i] = Number(md.data[i * 4]);
      out.mask = { kind: 'bitmap', enabled: !m.disabled, assetId: sink.putMask(mk, base.name + ' mask'), bounds: { x: m.left || 0, y: m.top || 0, width: md.width, height: md.height }, defaultColor: (m.defaultColor ?? 0) > 127 ? 255 : 0, density: m.userMaskDensity, feather: m.userMaskFeather };
    }
    if (l.vectorMask?.paths?.length) out.vectorMask = vectorFromPsd(l.vectorMask.paths, l.vectorMask.invert, l.vectorMask.disable);
    return out;
  };
  doc.layers = (psd.children || []).map(convert).filter((x): x is RasterLayer => !!x);
  if (!doc.layers.length && psd.imageData) { const key = sink.putBitmap(toBitmap(psd.imageData), 'Background'); doc.layers = [pixelLayer({ assetId: key }, psd.width, psd.height, { name: 'Background' })]; }
  return { doc, warnings };
}
function vectorFromPsd(paths: { open: boolean; operation?: string; knots: { points: number[] }[] }[], invert?: boolean, disabled?: boolean): VectorMask {
  return {
    enabled: !disabled, invert,
    subpaths: paths.map(p => ({
      closed: !p.open, op: p.operation === 'subtract' ? 'subtract' : p.operation === 'intersect' ? 'intersect' : p.operation === 'exclude' ? 'xor' : 'add',
      points: p.knots.map(k => ({ x: k.points[2], y: k.points[3], in: { x: k.points[0], y: k.points[1] }, out: { x: k.points[4], y: k.points[5] } }) as PathPoint),
    })),
  };
}

// ── Export ──────────────────────────────────────────────────────────────────
export interface PsdExportOptions { /** include a flattened composite (recommended; GIMP/Previewers use it) */ composite?: boolean; compress?: boolean }
/** Rasterize one layer's look (smart filters, transform, procedural masks) into doc space. */
function rasterizeAlone(doc: RasterDocument, l: RasterLayer, assets: AssetSource): Bitmap8 {
  const mini: RasterDocument = { ...doc, background: null, layers: [{ ...l, blend: 'normal', opacity: 1, fillOpacity: 1, clipped: false, mask: undefined, vectorMask: undefined, styles: undefined } as RasterLayer] };
  return rasterToBitmap(renderDocumentCpu(mini, assets), doc.blendSpace === 'linear');
}
const isIntegerTranslate = (m: number[]) => Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Number.isInteger(m[4]) && Number.isInteger(m[5]);
export function exportPsd(doc: RasterDocument, assets: AssetSource, o: PsdExportOptions = {}): { bytes: Uint8Array; warnings: string[] } {
  ensureCanvas();
  const warnings: string[] = [];
  const convert = (l: RasterLayer): PsdLayer => {
    const base: PsdLayer = { name: l.name, hidden: !l.visible, opacity: l.opacity, clipping: !!l.clipped, blendMode: toPsdBlend(l.blend) };
    (base as any).fillOpacity = l.fillOpacity ?? 1;
    if (l.kind === 'group') return { ...base, children: l.children.map(convert), opened: !l.collapsed };
    if (l.kind === 'adjustment') {
      const a = adjToPsd(l.adjustment);
      if (!a) { warnings.push(`"${l.name}": ${l.adjustment.type} has no PSD equivalent — written as an empty layer`); return { ...base, hidden: true }; }
      return { ...base, adjustment: a, ...maskToPsd(l, assets, doc) };
    }
    if (l.kind === 'fill') {
      const bm = rasterizeAlone(doc, l, assets);
      return { ...base, left: 0, top: 0, right: doc.width, bottom: doc.height, imageData: bm, ...(l.fill.type === 'solid' ? { vectorFill: { type: 'color', color: toColor(l.fill.color) } } : {}), effects: stylesToPsd(l.styles), ...maskToPsd(l, assets, doc) };
    }
    const src = assets.bitmap(l.asset.assetId || l.asset.src || '');
    if (src && isIntegerTranslate(l.transform) && !l.smartFilters?.some(f => f.enabled)) {
      return { ...base, left: l.transform[4], top: l.transform[5], right: l.transform[4] + src.width, bottom: l.transform[5] + src.height, imageData: src, effects: stylesToPsd(l.styles), ...maskToPsd(l, assets, doc), ...(l.text ? { name: l.name } : {}) };
    }
    if (l.smartFilters?.some(f => f.enabled)) warnings.push(`"${l.name}": smart filters baked into pixels`);
    const bm = rasterizeAlone(doc, l, assets);
    return { ...base, left: 0, top: 0, right: doc.width, bottom: doc.height, imageData: bm, effects: stylesToPsd(l.styles), ...maskToPsd(l, assets, doc) };
  };
  const psd: Psd = { width: doc.width, height: doc.height, children: doc.layers.map(convert) };
  if (o.composite !== false) psd.imageData = rasterToBitmap(renderDocumentCpu(doc, assets), doc.blendSpace === 'linear');
  return { bytes: writePsdUint8Array(psd, { noBackground: true, compress: o.compress }), warnings };
}
function maskToPsd(l: RasterLayer, assets: AssetSource, doc: RasterDocument): Partial<PsdLayer> {
  const out: Partial<PsdLayer> = {};
  const m = l.mask;
  if (m && m.kind === 'bitmap' && !m.linked) {
    const mk = assets.mask(m.assetId);
    if (mk) { const data = new Uint8ClampedArray(mk.width * mk.height * 4); for (let i = 0; i < mk.data.length; i++) { const v = m.invert ? 255 - mk.data[i] : mk.data[i]; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; } out.mask = { left: m.bounds.x, top: m.bounds.y, right: m.bounds.x + mk.width, bottom: m.bounds.y + mk.height, defaultColor: m.invert ? 255 - m.defaultColor : m.defaultColor, disabled: !m.enabled, userMaskDensity: m.density, userMaskFeather: m.feather, imageData: { width: mk.width, height: mk.height, data } }; }
  } else if (m) {
    // gradient / linked masks: rasterize the coverage
    const only: RasterDocument = { ...doc, background: [0, 0, 0], layers: [fillLayer({ type: 'solid', color: [255, 255, 255] }, { mask: m, vectorMask: undefined })] };
    const bm = rasterToBitmap(renderDocumentCpu(only, assets));
    out.mask = { left: 0, top: 0, right: doc.width, bottom: doc.height, defaultColor: 0, imageData: bm };
  }
  const vm = l.vectorMask;
  if (vm && !vm.linked) out.vectorMask = { invert: vm.invert, disable: !vm.enabled, paths: vm.subpaths.map(sp => ({ open: !sp.closed, operation: sp.op === 'subtract' ? 'subtract' : sp.op === 'intersect' ? 'intersect' : sp.op === 'xor' ? 'exclude' : 'combine', fillRule: 'non-zero' as const, knots: sp.points.map(p => ({ linked: true, points: [p.in?.x ?? p.x, p.in?.y ?? p.y, p.x, p.y, p.out?.x ?? p.x, p.out?.y ?? p.y] })) })) };
  return out;
}
