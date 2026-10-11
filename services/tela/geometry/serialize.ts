// serialize — THE canonical SVG serialiser for Tela vector devices.
//
// Contract: for objects without `geom`, output is byte-identical to the historical
// services/tela/telaSvg.ts (tests/geometrySerialize.test.ts proves it over the whole
// template gallery), so telaSvg can delegate here with zero visual change. Objects with
// `geom` additionally get: fill rule, engine paints (multi-stop absolute gradients with
// transforms, patterns, freeform, mesh), stroke caps/joins/miter/dash offset, inside /
// outside stroke alignment, material filter graphs, and clip paths.
//
// No React and no DOM, so it runs in node (tests, puppeteer proofs, export workers).
import type { TelaVectorObject } from '../../../types';
import type { Paint, FreeformPaint, MeshPaint } from './model';
import { layoutTextLines } from '../telaText';
import { paintServer, paintLayers } from './paint';
import { materialFilter } from './materials/filters';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => Math.round(n * 100) / 100;
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

export interface SvgOptions { background?: string; fontLinks?: boolean; writerTexts?: Record<string, string>; /** Extra <defs> content (e.g. shared materials). */ defs?: string }

/** Engine-extended rendering of a PATH with `geom` (artboard coordinates through the origin mapping). */
function geomPath(o: TelaVectorObject, legacyFill: string, filterAttr: string, rot: string, blend: string, dash: string): string {
  const g = o.geom!; const bx = o.x, by = o.y, bw = o.w, bh = o.h;
  const defs: string[] = []; const sid = safe(o.id);
  const ox = o.pathOriginX ?? bx, oy = o.pathOriginY ?? by;
  const sx = bw / Math.max(1, o.pathOriginW ?? bw), sy = bh / Math.max(1, o.pathOriginH ?? bh);
  const ss = Math.max(.0001, Math.sqrt(Math.abs(sx * sy)));
  const tf = `translate(${num(bx)} ${num(by)}) scale(${num(sx)} ${num(sy)}) translate(${num(-ox)} ${num(-oy)})`;
  const d = o.svgPathData!; const rule = g.fillRule ?? 'evenodd';
  // fills
  let fill = legacyFill; let layered: { defs: string; body: string } | null = null;
  const ref = (p: Paint, key: string): string => {
    if (typeof p === 'string') return esc(p);
    const id = `${key}_${sid}`; const srv = paintServer(id, p);
    if (srv) { defs.push(srv); return `url(#${id})`; }
    return 'none';
  };
  if (g.fill) {
    if (typeof g.fill !== 'string' && (g.fill.type === 'freeform' || g.fill.type === 'mesh')) { layered = paintLayers(`m_${sid}`, g.fill as FreeformPaint | MeshPaint); fill = 'none'; }
    else fill = ref(g.fill, 'gf');
  }
  const stroke = g.stroke ? ref(g.stroke, 'gs') : esc(o.stroke);
  const st = g.strokeStyle ?? {};
  const cap = st.cap ?? 'round', join = st.join ?? 'round';
  const sw = o.strokeWidth / ss;
  const align = st.align ?? 'center';
  const strokeAttrs = (w: number) => `stroke="${stroke}" stroke-width="${num(w)}" stroke-linecap="${cap}" stroke-linejoin="${join}"${join === 'miter' && st.miterLimit ? ` stroke-miterlimit="${num(st.miterLimit)}"` : ''}${dash}${st.dashOffset ? ` stroke-dashoffset="${num(st.dashOffset)}"` : ''}`;
  // material filter on the geometry (inside the origin mapping, so user-space noise follows the art)
  let matAttr = '';
  if (g.material) {
    const fid = `mat_${sid}`; const ob = { x: ox, y: oy, w: Math.max(1, o.pathOriginW ?? bw), h: Math.max(1, o.pathOriginH ?? bh) };
    const pad = o.strokeWidth / ss / 2; defs.push(materialFilter(fid, g.material, { x: ob.x - pad, y: ob.y - pad, w: ob.w + pad * 2, h: ob.h + pad * 2 }));
    matAttr = ` filter="url(#${fid})"`;
  }
  let clipAttr = '';
  if (g.clip) { const cid = `clip_${sid}`; defs.push(`<clipPath id="${cid}"><path d="${g.clip.d}" clip-rule="${g.clip.fillRule ?? 'nonzero'}"/></clipPath>`); clipAttr = ` clip-path="url(#${cid})"`; }
  const parts: string[] = [];
  if (layered) {
    const cid = `fillclip_${sid}`; defs.push(`<clipPath id="${cid}"><path d="${d}" clip-rule="${rule}"/></clipPath>`); if (layered.defs) defs.push(layered.defs);
    parts.push(`<g clip-path="url(#${cid})">${layered.body}</g>`);
  }
  const hasStroke = stroke !== 'none' && o.strokeWidth > 0;
  if (align !== 'center' && hasStroke && o.pathClosed) {
    // inside: clip a double-width stroke to the shape; outside: mask the shape away
    if (fill !== 'none') parts.push(`<path d="${d}" fill="${fill}" fill-rule="${rule}" stroke="none"/>`);
    if (align === 'inside') { const cid = `sin_${sid}`; defs.push(`<clipPath id="${cid}"><path d="${d}" clip-rule="${rule}"/></clipPath>`); parts.push(`<path d="${d}" fill="none" ${strokeAttrs(sw * 2)} clip-path="url(#${cid})"/>`); }
    else { const mid = `sout_${sid}`; defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff"/><path d="${d}" fill="#000" fill-rule="${rule}"/></mask>`); parts.push(`<path d="${d}" fill="none" ${strokeAttrs(sw * 2)} mask="url(#${mid})"/>`); }
  } else {
    parts.push(`<path d="${d}" fill="${fill}" fill-rule="${rule}" ${hasStroke ? strokeAttrs(sw) : `stroke="${stroke}" stroke-width="${num(sw)}"`}/>`);
  }
  const inner = parts.length === 1 && !matAttr && !clipAttr ? parts[0].replace('<path ', `<path transform="${tf}" `) : `<g transform="${tf}"${clipAttr}><g${matAttr}>${parts.join('')}</g></g>`;
  return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + `<g opacity="${o.opacity}"${rot}${filterAttr}${blend}>${inner}</g>`;
}

export function objectToSvg(o: TelaVectorObject, writerTexts?: Record<string, string>): string {
  const bx = o.x, by = o.y, bw = o.w, bh = o.h;
  const cx = bx + bw / 2, cy = by + bh / 2;
  const defs: string[] = [];
  let fill = o.fill;
  if (o.gradient) {
    const gid = `g_${safe(o.id)}`;
    const stops = o.gradient.stops.map(s => `<stop offset="${num(s.offset * 100)}%" stop-color="${s.color}" stop-opacity="${s.opacity ?? 1}"/>`).join('');
    if (o.gradient.kind === 'RADIAL') defs.push(`<radialGradient id="${gid}">${stops}</radialGradient>`);
    else { const a = (o.gradient.angle ?? 0) * Math.PI / 180; defs.push(`<linearGradient id="${gid}" x1="${num(50 - Math.cos(a) * 50)}%" y1="${num(50 - Math.sin(a) * 50)}%" x2="${num(50 + Math.cos(a) * 50)}%" y2="${num(50 + Math.sin(a) * 50)}%">${stops}</linearGradient>`); }
    fill = `url(#${gid})`;
  }
  let filter = '';
  if (o.shadow || (o.blur && o.blur > 0)) {
    const fid = `f_${safe(o.id)}`;
    defs.push(`<filter id="${fid}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">${o.blur && o.blur > 0 ? `<feGaussianBlur stdDeviation="${o.blur}"/>` : ''}${o.shadow ? `<feDropShadow dx="${o.shadow.x}" dy="${o.shadow.y}" stdDeviation="${o.shadow.blur}" flood-color="${o.shadow.color}"/>` : ''}</filter>`);
    filter = ` filter="url(#${fid})"`;
  }
  const rot = o.rotation ? ` transform="rotate(${num(o.rotation)} ${num(cx)} ${num(cy)})"` : '';
  const blend = o.blendMode && o.blendMode !== 'normal' ? ` style="mix-blend-mode:${o.blendMode}"` : '';
  const dash = o.strokeDash?.length ? ` stroke-dasharray="${o.strokeDash.join(' ')}"` : '';
  if (o.kind === 'PATH' && o.svgPathData && o.geom) {
    return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + geomPath(o, fill, filter, rot, blend, dash);
  }
  if (o.kind === 'TEXT' && o.geom?.glyphs?.length) {
    // Engine-set type (Studio): composed glyph outlines, object-local, no font needed anywhere.
    const outlined = o.stroke !== 'none' && o.strokeWidth > 0;
    const paths = o.geom.glyphs.map(g => `<path d="${g.d}" fill="${o.gradient ? fill : esc(g.fill)}"${outlined ? ` stroke="${esc(o.stroke)}" stroke-width="${num(o.strokeWidth)}" stroke-linejoin="round" paint-order="stroke"` : ''}/>`).join('');
    return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + withClip(o, `<g opacity="${o.opacity}"${rot}${filter}${blend}><g transform="translate(${num(bx)} ${num(by)})">${paths}</g></g>`);
  }
  const common = `fill="${fill}" stroke="${o.stroke}" stroke-width="${num(o.strokeWidth)}" opacity="${o.opacity}" stroke-linecap="round" stroke-linejoin="round"${rot}${filter}${blend}${dash}`;
  let body = '';
  if (o.kind === 'RECT') body = `<rect x="${num(bx)}" y="${num(by)}" width="${num(Math.max(0, bw))}" height="${num(Math.max(0, bh))}" rx="${o.rx ?? 2}" ${common}/>`;
  else if (o.kind === 'ELLIPSE') body = `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(Math.max(0, bw / 2))}" ry="${num(Math.max(0, bh / 2))}" ${common}/>`;
  else if (o.kind === 'LINE' && o.points) body = `<line x1="${num(o.points[0])}" y1="${num(o.points[1])}" x2="${num(o.points[2])}" y2="${num(o.points[3])}" ${common}/>`;
  else if (o.kind === 'IMAGE' && o.sourceImageSrc && o.sourceCrop) {
    const c = o.sourceCrop;
    body = `<g opacity="${o.opacity}"${rot}${filter}${blend}><svg x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}" preserveAspectRatio="none"><image href="${esc(o.sourceImageSrc)}" x="0" y="0" width="${c.sourceWidth}" height="${c.sourceHeight}" preserveAspectRatio="none"/></svg></g>`;
  } else if (o.kind === 'LOTTIE') {
    const L = o.lottie;
    const par = !L || L.fit === 'contain' ? 'xMidYMid meet' : L.fit === 'cover' ? 'xMidYMid slice' : 'none';
    const inner = L?.posterSrc
      ? `<svg x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}"><image href="${esc(L.posterSrc)}" x="0" y="0" width="${num(bw)}" height="${num(bh)}" preserveAspectRatio="${par}"/></svg>`
      : `<rect x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}" rx="6" fill="rgba(0,218,243,.08)" stroke="rgba(0,163,184,.6)" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${num(cx)}" y="${num(cy)}" text-anchor="middle" dominant-baseline="middle" font-size="${num(Math.max(10, Math.min(28, Math.min(bw, bh) / 6)))}" font-weight="800" font-family="system-ui, sans-serif" fill="rgba(0,120,140,.85)">Lottie${o.objectLabel ? ` · ${esc(o.objectLabel)}` : ''}</text>`;
    body = `<g opacity="${o.opacity}" data-tela-kind="LOTTIE"${rot}${filter}${blend}>${inner}</g>`;
  } else if (o.kind === 'MOTION_TEMPLATE') {
    const M = o.motionTemplate;
    const inner = M?.posterSrc
      ? `<svg x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}"><image href="${esc(M.posterSrc)}" x="0" y="0" width="${num(bw)}" height="${num(bh)}" preserveAspectRatio="none"/></svg>`
      : `<rect x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}" rx="6" fill="rgba(255,140,0,.08)" stroke="rgba(200,110,0,.6)" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${num(cx)}" y="${num(cy)}" text-anchor="middle" dominant-baseline="middle" font-size="${num(Math.max(10, Math.min(28, Math.min(bw, bh) / 6)))}" font-weight="800" font-family="system-ui, sans-serif" fill="rgba(160,90,0,.85)">Motion${o.objectLabel ? ` · ${esc(o.objectLabel)}` : ''}</text>`;
    body = `<g opacity="${o.opacity}" data-tela-kind="MOTION_TEMPLATE"${rot}${filter}${blend}>${inner}</g>`;
  } else if (o.kind === 'PATH' && o.svgPathData) {
    const ox = o.pathOriginX ?? bx, oy = o.pathOriginY ?? by;
    const sx = bw / Math.max(1, o.pathOriginW ?? bw), sy = bh / Math.max(1, o.pathOriginH ?? bh);
    const ss = Math.max(.0001, Math.sqrt(Math.abs(sx * sy)));
    body = `<g opacity="${o.opacity}"${rot}${filter}${blend}><path d="${o.svgPathData}" fill="${fill}" fill-rule="evenodd" stroke="${o.stroke}" stroke-width="${num(o.strokeWidth / ss)}" stroke-linecap="round" stroke-linejoin="round"${dash} transform="translate(${num(bx)} ${num(by)}) scale(${num(sx)} ${num(sy)}) translate(${num(-ox)} ${num(-oy)})"/></g>`;
  } else if (o.kind === 'PATH' && o.points) {
    const pts: string[] = []; for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(`${num(o.points[i])},${num(o.points[i + 1])}`);
    body = o.pathClosed ? `<polygon points="${pts.join(' ')}" ${common}/>` : `<polyline points="${pts.join(' ')}" ${common}/>`;
  } else if (o.kind === 'TEXT') {
    const size = o.fontSize || 24;
    const bound = o.boundWriterDeviceId ? writerTexts?.[o.boundWriterDeviceId] : undefined;
    const lines = layoutTextLines(o, bound !== undefined && bound !== '' ? bound : (o.text ?? ''));
    const align = o.textAlign || 'left';
    const ax = align === 'center' ? bx + bw / 2 : align === 'right' ? bx + bw : bx;
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const leading = size * (o.lineHeight ?? 1.22);
    const outlined = o.stroke !== 'none' && o.strokeWidth > 0;
    const attrs = `x="${num(ax)}" y="${num(by + size)}" fill="${fill}" opacity="${o.opacity}" font-size="${size}" font-family='${(o.fontFamily || 'system-ui, sans-serif').replace(/'/g, '"')}' font-weight="${o.fontWeight || 400}"${o.fontStyle === 'italic' ? ' font-style="italic"' : ''}${o.letterSpacing ? ` letter-spacing="${num(o.letterSpacing * size)}"` : ''} text-anchor="${anchor}"${outlined ? ` stroke="${o.stroke}" stroke-width="${num(o.strokeWidth)}" paint-order="stroke" stroke-linejoin="round"` : ''}${rot}${filter}${blend}`;
    body = `<text ${attrs}>${lines.map((ln, i) => `<tspan x="${num(ax)}" dy="${i === 0 ? 0 : num(leading)}">${ln === '' ? ' ' : esc(ln)}</tspan>`).join('')}</text>`;
  }
  return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + withClip(o, body);
}

/** Clipping-mask membership on a non-PATH object (geom.clip, artboard coordinates). PATH objects clip inside geomPath. */
function withClip(o: TelaVectorObject, body: string): string {
  const c = o.geom?.clip; if (!c || !body) return body;
  const cid = `oclip_${safe(o.id)}`;
  return `<defs><clipPath id="${cid}"><path d="${c.d}" clip-rule="${c.fillRule ?? 'nonzero'}"/></clipPath></defs><g clip-path="url(#${cid})">${body}</g>`;
}

/** Whole artboard. Hidden objects are skipped only when `skipHidden` (legacy output keeps them). */
export function objectsToSvg(objects: TelaVectorObject[], width: number, height: number, opts: SvgOptions = {}): string {
  const bg = opts.background ? `<rect width="${width}" height="${height}" fill="${opts.background}"/>` : '';
  const extra = opts.defs ? `<defs>${opts.defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${extra}${bg}${objects.map(o => objectToSvg(o, opts.writerTexts)).join('')}</svg>`;
}

/** A vector device (convenience). */
export function deviceToSvg(device: { width: number; height: number; objects: TelaVectorObject[] }, opts: SvgOptions = {}): string {
  return objectsToSvg(device.objects.filter(o => !o.hidden), device.width, device.height, opts);
}
