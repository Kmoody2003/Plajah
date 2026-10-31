// import/presets — Adobe preset files → plain, renderable assets for Tela's library.
//   .abr  brushes (sampled and computed tips, spacing, angle, roundness, pressure dynamics)
//   .csh  custom shapes (real Bézier paths)
//   .ase  Adobe swatch exchange (groups, RGB, CMYK, Lab, Gray)
//   .aco  Photoshop swatches
//   .pat  Photoshop patterns (bitmap tiles)
//   .grd  Photoshop gradients
//   .asl  layer styles (read as the style names and effects inside; ag-psd's descriptor reader)
import { readAbr, readCsh } from 'ag-psd';
import { cmykToRgb8, decodeLayerPixels } from './psdChannels';
import type { RgbaImage } from './types';

export interface ImportedBrush {
  id: string; name: string; source: string;
  /** Grayscale tip, 255 = full paint; null for computed round tips. */
  tip: { width: number; height: number; data: Uint8Array } | null;
  size: number; hardness: number; spacing: number; angle: number; roundness: number;
  opacity: number; flow: number; sizePressure: number; opacityPressure: number; scatter: number; angleJitter: number; sizeJitter: number;
  /** Fields of the original that Tela's stamp engine cannot use. */
  unsupported?: string[];
}
export interface ImportedShape { id: string; name: string; source: string; d: string; width: number; height: number }
export interface ImportedSwatch { id: string; name: string; color: string; group?: string; source: string; spot?: boolean }
export interface ImportedPattern { id: string; name: string; source: string; width: number; height: number; image: RgbaImage }
export interface ImportedGradient { id: string; name: string; source: string; stops: Array<{ offset: number; color: string; opacity?: number }> }
export interface PresetBundle { brushes: ImportedBrush[]; shapes: ImportedShape[]; swatches: ImportedSwatch[]; patterns: ImportedPattern[]; gradients: ImportedGradient[]; warnings: string[] }

const empty = (): PresetBundle => ({ brushes: [], shapes: [], swatches: [], patterns: [], gradients: [], warnings: [] });
let seq = 0; const pid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

// ── Brushes ────────────────────────────────────────────────────────────────────────────
function dynamicsPressure(d?: { control: string; minimum?: number }): number { return d?.control === 'pen pressure' ? 1 - (d.minimum ?? 0) : 0; }
export function parseAbr(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty();
  // ag-psd reads ABR 6+; older brushes (v1/2) use a plain sampled-brush layout.
  const version = (bytes[0] << 8) | bytes[1];
  if (version === 1 || version === 2) return parseLegacyAbr(bytes, source);
  let abr: ReturnType<typeof readAbr>;
  try { abr = readAbr(bytes); }
  catch (e) { out.warnings.push(`${source} uses a brush setting this reader does not know yet (${(e as Error).message}), so none of its brushes could be read.`); return out; }
  const samples = new Map(abr.samples.map(s => [s.id, s]));
  // Adobe's stock presets name themselves "$$$/Presets/Brushes/SoftRound=Soft Round".
  const label = (n: string) => n.replace(/^\$\$\$\/[^=]*=/, '');
  const unit = (v: number | undefined, d: number) => v === undefined ? d : v > 1 ? v / 100 : v;
  for (const b of abr.brushes) {
    const s: any = b.shape; const unsupported: string[] = [];
    let tip: ImportedBrush['tip'] = null, size = s.size ?? 30;
    if (s.type === 'sampled') {
      const sm = samples.get(s.sampledData);
      if (sm) { tip = { width: sm.bounds.w, height: sm.bounds.h, data: sm.alpha }; size = s.size || Math.max(sm.bounds.w, sm.bounds.h); }
      else unsupported.push('missing tip sample');
    } else if (s.type === 'dynamic' || s.type === 'tips') unsupported.push(s.type === 'dynamic' ? 'bristle tip (drawn as a soft round tip)' : 'erodible/airbrush tip (drawn as a round tip)');
    if (b.dualBrush) unsupported.push('dual brush');
    if (b.texture) unsupported.push('texture');
    if (b.colorDynamics) unsupported.push('colour dynamics');
    const tr = b.transfer, sd = b.shapeDynamics, sc = b.scatter;
    const tool = b.toolOptions;
    if (tool && tool.type !== 'brush') unsupported.push(tool.type);
    out.brushes.push({
      id: pid('abr'), name: label(b.name || 'Brush'), source, tip, size, hardness: unit(s.hardness, 1), spacing: s.spacingOn === false ? .25 : unit(s.spacing, .25), angle: s.angle ?? 0, roundness: unit(s.roundness, 1),
      opacity: unit(tool?.opacity, 1), flow: unit(tool?.flow, 1), sizePressure: dynamicsPressure(sd?.sizeDynamics), opacityPressure: dynamicsPressure(tr?.opacityDynamics), scatter: unit((sc?.scatterDynamics as any)?.jitter, 0), angleJitter: unit(sd?.angleDynamics?.jitter, 0), sizeJitter: unit(sd?.sizeDynamics?.jitter, 0),
      unsupported: unsupported.length ? unsupported : undefined,
    });
  }
  return out;
}
function parseLegacyAbr(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty(); const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = v.getUint16(0), count = v.getUint16(2); let p = 4;
  for (let i = 0; i < count && p + 6 <= bytes.length; i++) {
    const type = v.getUint16(p), size = v.getUint32(p + 2); const body = p + 6;
    if (type === 2) {
      let q = body + 4; const spacing = v.getUint16(q); q += 2;
      let name = 'Brush';
      if (version === 2) { const len = v.getUint32(q); q += 4; let s = ''; for (let k = 0; k < len - 1; k++) s += String.fromCharCode(v.getUint16(q + k * 2)); name = s || name; q += len * 2; }
      q += 1; const top = v.getInt16(q), left = v.getInt16(q + 2), bottom = v.getInt16(q + 4), right = v.getInt16(q + 6); q += 8;
      const depth = v.getUint16(q), compression = bytes[q + 2]; q += 3;
      const w = right - left, h = bottom - top;
      if (w > 0 && h > 0 && depth === 8) {
        const tip = new Uint8Array(w * h);
        if (compression === 0) tip.set(bytes.subarray(q, q + w * h));
        else { let pos = q + h * 2, o = 0; for (let y = 0; y < h; y++) { const end = pos + v.getUint16(q + y * 2); let row = 0; while (pos < end && row < w) { const c = (bytes[pos] << 24) >> 24; pos++; if (c >= 0) { for (let k = 0; k <= c && row < w; k++, row++) tip[o++] = bytes[pos++]; } else if (c > -128) { const val = bytes[pos++]; for (let k = 0; k <= -c && row < w; k++, row++) tip[o++] = val; } } pos = end; } }
        out.brushes.push({ id: pid('abr'), name, source, tip: { width: w, height: h, data: tip }, size: Math.max(w, h), hardness: 1, spacing: spacing / 100, angle: 0, roundness: 1, opacity: 1, flow: 1, sizePressure: 0, opacityPressure: 0, scatter: 0, angleJitter: 0, sizeJitter: 0 });
      }
    } else if (type === 1) {
      const q = body + 4; const spacing = v.getUint16(q), diameter = v.getUint16(q + 2), roundness = v.getUint16(q + 4), angle = v.getUint16(q + 6), hardness = v.getUint16(q + 8);
      out.brushes.push({ id: pid('abr'), name: `Round ${diameter}`, source, tip: null, size: diameter, hardness: hardness / 100, spacing: spacing / 100, angle, roundness: roundness / 100, opacity: 1, flow: 1, sizePressure: 0, opacityPressure: 0, scatter: 0, angleJitter: 0, sizeJitter: 0 });
    }
    p = body + size;
  }
  return out;
}

// ── Shapes ─────────────────────────────────────────────────────────────────────────────
export function parseCsh(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty();
  for (const s of readCsh(bytes).shapes) {
    const parts: string[] = [];
    for (const p of s.paths || []) {
      const K = p.knots; if (!K?.length) continue;
      const f = (n: number) => String(Math.round(n * 1000) / 1000);
      parts.push(`M${f(K[0].points[2])} ${f(K[0].points[3])}`);
      for (let i = 1; i < K.length; i++) { const a = K[i - 1].points, b = K[i].points; parts.push(`C${f(a[4])} ${f(a[5])} ${f(b[0])} ${f(b[1])} ${f(b[2])} ${f(b[3])}`); }
      if (!p.open) { const a = K[K.length - 1].points, b = K[0].points; parts.push(`C${f(a[4])} ${f(a[5])} ${f(b[0])} ${f(b[1])} ${f(b[2])} ${f(b[3])}Z`); }
    }
    if (parts.length) out.shapes.push({ id: pid('csh'), name: s.name || 'Shape', source, d: parts.join(''), width: s.width || 100, height: s.height || 100 });
  }
  return out;
}

// ── Swatches ───────────────────────────────────────────────────────────────────────────
export function parseAse(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty(); const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0) !== 0x41534546) { out.warnings.push(`${source} is not an ASE file.`); return out; }
  const blocks = v.getUint32(8); let p = 12; let group: string | undefined; const t = [0, 0, 0];
  for (let i = 0; i < blocks && p + 6 <= bytes.length; i++) {
    const type = v.getUint16(p), len = v.getUint32(p + 2); const end = p + 6 + len; let q = p + 6;
    if (type === 0xc002) group = undefined;
    else if (type === 0xc001 || type === 1) {
      const n = v.getUint16(q); q += 2; let name = ''; for (let k = 0; k < n - 1; k++) name += String.fromCharCode(v.getUint16(q + k * 2)); q += n * 2;
      if (type === 0xc001) group = name;
      else {
        const model = String.fromCharCode(bytes[q], bytes[q + 1], bytes[q + 2], bytes[q + 3]).trim(); q += 4; const f = (k: number) => v.getFloat32(q + k * 4);
        let color = '#000000';
        if (model === 'RGB') color = hex(f(0) * 255, f(1) * 255, f(2) * 255);
        else if (model === 'CMYK') { cmykToRgb8(f(0) * 255, f(1) * 255, f(2) * 255, f(3) * 255, t); color = hex(t[0], t[1], t[2]); }
        else if (model === 'Gray') color = hex(f(0) * 255, f(0) * 255, f(0) * 255);
        else if (model === 'LAB') color = labHex(f(0) * 100, f(1), f(2));
        const kind = v.getUint16(q + (model === 'CMYK' ? 16 : model === 'Gray' ? 4 : 12));
        out.swatches.push({ id: pid('ase'), name: name || color, color, group, source, spot: kind === 1 });
      }
    }
    p = end;
  }
  return out;
}
function labHex(L: number, a: number, b: number) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200; const inv = (t: number) => t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29);
  const X = 0.9642 * inv(fx), Y = inv(fy), Z = 0.8249 * inv(fz); const e = (v: number) => { const x = Math.max(0, Math.min(1, v)); return (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255; };
  return hex(e(3.1339 * X - 1.6170 * Y - 0.4906 * Z), e(-0.9785 * X + 1.9160 * Y + 0.0333 * Z), e(0.0720 * X - 0.2290 * Y + 1.4057 * Z));
}
export function parseAco(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty(); const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 0; const t = [0, 0, 0];
  const read = (named: boolean) => {
    p += 2; const count = v.getUint16(p); p += 2; const rows: ImportedSwatch[] = [];
    for (let i = 0; i < count && p + 10 <= bytes.length; i++) {
      const space = v.getUint16(p), w = v.getUint16(p + 2), x = v.getUint16(p + 4), y = v.getUint16(p + 6), z = v.getUint16(p + 8); p += 10;
      let color = '#000000';
      if (space === 0) color = hex(w / 257, x / 257, y / 257);
      else if (space === 2) { cmykToRgb8(255 - w / 257, 255 - x / 257, 255 - y / 257, 255 - z / 257, t); color = hex(t[0], t[1], t[2]); }
      else if (space === 8) color = hex(255 - w / 39.2, 255 - w / 39.2, 255 - w / 39.2);
      else if (space === 7) color = labHex(w / 100, v.getInt16(p - 6) / 100, v.getInt16(p - 4) / 100);
      else if (space === 1) { const H = w / 65535 * 6, S = x / 65535, B = y / 65535, c = B * S, X = c * (1 - Math.abs(H % 2 - 1)), m = B - c; const r = [[c, X, 0], [X, c, 0], [0, c, X], [0, X, c], [X, 0, c], [c, 0, X]][Math.floor(H) % 6]; color = hex((r[0] + m) * 255, (r[1] + m) * 255, (r[2] + m) * 255); }
      let name = color;
      if (named) { const n = v.getUint32(p); p += 4; let s = ''; for (let k = 0; k < n - 1; k++) s += String.fromCharCode(v.getUint16(p + k * 2)); name = s || color; p += n * 2; }
      rows.push({ id: pid('aco'), name, color, source });
    }
    return rows;
  };
  // Version 1 (plain) is usually followed by version 2 (named); some files hold only version 2.
  let rows = read(v.getUint16(0) === 2);
  if (p + 4 <= bytes.length && v.getUint16(p) === 2) rows = read(true);
  out.swatches = rows; return out;
}

// ── Patterns ───────────────────────────────────────────────────────────────────────────
export function parsePat(bytes: Uint8Array, source: string): PresetBundle {
  const out = empty(); const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '8BPT') { out.warnings.push(`${source} is not a .pat file.`); return out; }
  const count = v.getUint32(6); let p = 10;
  for (let i = 0; i < count && p + 20 < bytes.length; i++) {
    try {
      const version = v.getUint32(p), mode = v.getUint32(p + 4); p += 8;
      if (version !== 1) break;
      const h = v.getUint16(p), w = v.getUint16(p + 2); p += 4;
      const nameLen = v.getUint32(p); p += 4; let name = ''; for (let k = 0; k < nameLen - 1; k++) name += String.fromCharCode(v.getUint16(p + k * 2)); p += nameLen * 2;
      p += 1 + bytes[p]; // pascal id
      if (mode === 2) p += 768 + 4;
      const vmaVersion = v.getUint32(p); p += 4; void vmaVersion;
      const vmaLen = v.getUint32(p); p += 4; const vmaEnd = p + vmaLen;
      const rectTop = v.getUint32(p), rectLeft = v.getUint32(p + 4), rectBottom = v.getUint32(p + 8), rectRight = v.getUint32(p + 12), maxCh = v.getUint32(p + 16); p += 20;
      const cw = rectRight - rectLeft, ch = rectBottom - rectTop; const channels: Array<{ id: number; compression: number; data?: Uint8Array }> = [];
      for (let c = 0; c < maxCh + 2 && p < vmaEnd; c++) {
        const written = v.getUint32(p); if (!written) { p += 4; continue; }
        const len = v.getUint32(p + 4); const depth = v.getUint32(p + 8); void depth; const compression = bytes[p + 8 + 4 + 16 + 2];
        const dataStart = p + 8 + 4 + 16 + 2 + 1; const dataLen = len - (4 + 16 + 2 + 1);
        if (dataLen > 0) channels.push({ id: c < maxCh ? c : -1, compression: compression ? 1 : 0, data: bytes.subarray(dataStart, dataStart + dataLen) });
        p = p + 8 + len;
      }
      p = vmaEnd;
      if (cw > 0 && ch > 0 && channels.length) {
        const colorChannels = channels.filter(c => c.id >= 0); const map = colorChannels.length >= 3 ? channels : channels;
        const image = decodeLayerPixels({ colorMode: mode, bitsPerChannel: 8, channels: map, large: false }, cw, ch, {});
        out.patterns.push({ id: pid('pat'), name: name.replace(/^\$\$\$\/[^=]*=/, '') || `Pattern ${i + 1}`, source, width: w || cw, height: h || ch, image });
      }
    } catch (e) { out.warnings.push(`A pattern in ${source} could not be read: ${(e as Error).message}`); break; }
  }
  return out;
}

export type PresetKind = 'abr' | 'csh' | 'ase' | 'aco' | 'pat';
export const PRESET_EXTENSIONS: PresetKind[] = ['abr', 'csh', 'ase', 'aco', 'pat'];
export const isPresetFile = (name: string) => /\.(abr|csh|ase|aco|pat)$/i.test(name);

export function parsePresetFile(name: string, bytes: Uint8Array): PresetBundle {
  const ext = (name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'abr': return parseAbr(bytes, name);
    case 'csh': return parseCsh(bytes, name);
    case 'ase': return parseAse(bytes, name);
    case 'aco': return parseAco(bytes, name);
    case 'pat': return parsePat(bytes, name);
    default: { const o = empty(); o.warnings.push(`${name} is not a preset type Tela reads yet.`); return o; }
  }
}
