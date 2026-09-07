// telaSvg — serialize Tela vector objects to an SVG string.
//
// Mirrors TelaVector's ObjectEl feature-for-feature (gradients, filters, text
// layout, path origin boxes) but with no React, so it runs in node for the QA
// gallery / tests and in the browser for export and Fabula hand-off.
import type { TelaVectorObject } from '../../types';
import { layoutTextLines } from './telaText';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => Math.round(n * 100) / 100;
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

export interface SvgOptions { background?: string; fontLinks?: boolean; writerTexts?: Record<string, string> }

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
  const common = `fill="${fill}" stroke="${o.stroke}" stroke-width="${num(o.strokeWidth)}" opacity="${o.opacity}" stroke-linecap="round" stroke-linejoin="round"${rot}${filter}${blend}${dash}`;
  let body = '';
  if (o.kind === 'RECT') body = `<rect x="${num(bx)}" y="${num(by)}" width="${num(Math.max(0, bw))}" height="${num(Math.max(0, bh))}" rx="${o.rx ?? 2}" ${common}/>`;
  else if (o.kind === 'ELLIPSE') body = `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(Math.max(0, bw / 2))}" ry="${num(Math.max(0, bh / 2))}" ${common}/>`;
  else if (o.kind === 'LINE' && o.points) body = `<line x1="${num(o.points[0])}" y1="${num(o.points[1])}" x2="${num(o.points[2])}" y2="${num(o.points[3])}" ${common}/>`;
  else if (o.kind === 'IMAGE' && o.sourceImageSrc && o.sourceCrop) {
    const c = o.sourceCrop;
    body = `<g opacity="${o.opacity}"${rot}${filter}${blend}><svg x="${num(bx)}" y="${num(by)}" width="${num(bw)}" height="${num(bh)}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}" preserveAspectRatio="none"><image href="${esc(o.sourceImageSrc)}" x="0" y="0" width="${c.sourceWidth}" height="${c.sourceHeight}" preserveAspectRatio="none"/></svg></g>`;
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
  return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + body;
}

export function objectsToSvg(objects: TelaVectorObject[], width: number, height: number, opts: SvgOptions = {}): string {
  const bg = opts.background ? `<rect width="${width}" height="${height}" fill="${opts.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${bg}${objects.map(o => objectToSvg(o, opts.writerTexts)).join('')}</svg>`;
}
