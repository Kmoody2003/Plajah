import ImageTracer from 'imagetracerjs';
import type { TelaVectorNode, TelaVectorObject } from '../types';

export type TelaTracePreset = 'LINE_ART' | 'LOGO' | 'DETAILED';

export interface TelaTraceOptions {
  /** Normal page tracing groups contours by paint. Artwork reconstruction exposes every contour. */
  layerMode?: 'COMPOUND_PAINTS' | 'EDITABLE_CONTOURS';
  /** Hard mobile-performance guard. Largest meaningful contours are retained first. */
  maxLayers?: number;
  /** Maximum direct-edit anchors per contour before a shape-preserving reduction. */
  maxNodesPerLayer?: number;
  /** Drop every paper-white path (flattened worksheet crops: white IS the page behind). */
  dropPaperWhite?: boolean;
}

const OPTIONS: Record<TelaTracePreset, Record<string, number | string>> = {
  // Camera noise must be removed before path creation. These are deliberately
  // conservative: Tela is reconstructing an editable document, not dumping
  // every photographed pixel into the layer panel.
  LINE_ART: { ltres: 1.5, qtres: 1.5, pathomit: 24, colorsampling: 0, numberofcolors: 2, colorquantcycles: 3, strokewidth: 0, linefilter: 1, blurradius: 1, blurdelta: 48, roundcoords: 1, scale: 1 },
  LOGO: { ltres: 1.25, qtres: 1.25, pathomit: 14, colorsampling: 2, numberofcolors: 6, colorquantcycles: 3, strokewidth: 0, linefilter: 1, blurradius: 1, blurdelta: 48, roundcoords: 1, scale: 1 },
  DETAILED: { ltres: 1, qtres: 1, pathomit: 8, colorsampling: 2, numberofcolors: 12, colorquantcycles: 3, strokewidth: 0, linefilter: 1, blurradius: 1, blurdelta: 32, roundcoords: 1, scale: 1 },
};

function loadBitmap(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Tela could not read this bitmap. Upload the file directly if the image host blocks local tracing.'));
    image.src = src;
  });
}

/** Convert the M/L/Q/C/Z paths emitted by ImageTracer into editable cubic nodes. */
function nodesFromPath(d: string): { nodes: TelaVectorNode[]; closed: boolean } {
  const tokens = d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const nodes: TelaVectorNode[] = [];
  let i = 0, cmd = '', cx = 0, cy = 0;
  const num = () => Number(tokens[i++]);
  const add = (x: number, y: number): TelaVectorNode => { const n: TelaVectorNode = { id: `node_${nodes.length}_${Math.random().toString(36).slice(2, 6)}`, x, y }; nodes.push(n); cx = x; cy = y; return n; };
  let closed = false;
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { closed = true; cmd = ''; continue; }
    if (C === 'M' || C === 'L') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy; } add(x, y); if (C === 'M') cmd = rel ? 'l' : 'L';
    } else if (C === 'Q') {
      let qx = num(), qy = num(), x = num(), y = num();
      if (rel) { qx += cx; qy += cy; x += cx; y += cy; }
      const prev = nodes[nodes.length - 1];
      if (prev) { prev.outX = prev.x + (2 / 3) * (qx - prev.x); prev.outY = prev.y + (2 / 3) * (qy - prev.y); }
      const next = add(x, y); next.inX = x + (2 / 3) * (qx - x); next.inY = y + (2 / 3) * (qy - y);
    } else if (C === 'C') {
      let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
      const prev = nodes[nodes.length - 1]; if (prev) { prev.outX = x1; prev.outY = y1; }
      const next = add(x, y); next.inX = x2; next.inY = y2;
    } else break;
  }
  return { nodes, closed };
}

export function pathDataFromNodes(nodes: TelaVectorNode[], closed = false): string {
  if (!nodes.length) return '';
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    d += a.outX !== undefined || b.inX !== undefined
      ? ` C ${a.outX ?? a.x} ${a.outY ?? a.y} ${b.inX ?? b.x} ${b.inY ?? b.y} ${b.x} ${b.y}`
      : ` L ${b.x} ${b.y}`;
  }
  if (closed) {
    const a = nodes[nodes.length - 1], b = nodes[0];
    if (a.outX !== undefined || b.inX !== undefined) d += ` C ${a.outX ?? a.x} ${a.outY ?? a.y} ${b.inX ?? b.x} ${b.inY ?? b.y} ${b.x} ${b.y}`;
    d += ' Z';
  }
  return d;
}

function paintKey(path: Element): string {
  return [path.getAttribute('fill') || '#000000', path.getAttribute('stroke') || 'none', path.getAttribute('stroke-width') || '0', path.getAttribute('opacity') || '1'].join('|');
}

function isPaperWhite(paint: string): boolean {
  const nums = paint.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (paint.startsWith('#')) {
    const hex = paint.slice(1); const v = hex.length === 3 ? hex.split('').map(x => parseInt(x + x, 16)) : [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    return v.length === 3 && v.every(x => x >= 244);
  }
  return !!nums && nums.length === 3 && nums.every(x => x >= 244);
}

function editableNodes(nodes: TelaVectorNode[], maxNodes: number) {
  if (nodes.length <= maxNodes) return nodes;
  const step = Math.ceil(nodes.length / maxNodes);
  const reduced = nodes.filter((_, index) => index === 0 || index === nodes.length - 1 || index % step === 0);
  // Existing Bezier handles remain attached to retained anchors. This keeps the traced curve
  // directly editable while preventing a photographed edge from creating thousands of handles.
  return reduced;
}

function previewSvg(width: number, height: number, objects: TelaVectorObject[]): string {
  const paths = objects.map(o => `<path d="${o.svgPathData}" fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}" opacity="${o.opacity}" fill-rule="nonzero"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/>${paths}</svg>`;
}

export async function traceBitmapToTela(src: string, preset: TelaTracePreset = 'LOGO', options: TelaTraceOptions = {}) {
  const image = await loadBitmap(src);
  const max = preset === 'DETAILED' ? 1200 : 900;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas image processing is unavailable.');
  // A SlimSAM cutout is transparent outside its mask. ImageTracer interprets transparent RGB as
  // black unless it is composited first, which used to create a page-sized black path over the art.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const svgText = ImageTracer.imagedataToSVG(ctx.getImageData(0, 0, width, height), OPTIONS[preset]);
  const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  const rawPaths = Array.from(svg.querySelectorAll('path'));
  const pageArea = width * height;
  const candidates = rawPaths.map((path, index) => {
    const d = path.getAttribute('d') || '';
    const parsed = nodesFromPath(d);
    const xs = parsed.nodes.map(n => n.x), ys = parsed.nodes.map(n => n.y);
    const x = xs.length ? Math.min(...xs) : 0, y = ys.length ? Math.min(...ys) : 0;
    const w = xs.length ? Math.max(1, Math.max(...xs) - x) : width;
    const h = ys.length ? Math.max(1, Math.max(...ys) - y) : height;
    return { path, index, d, parsed, x, y, w, h, area: w * h, key: paintKey(path) };
  }).filter(p => p.d);

  // A photographed white sheet often becomes the largest path and can conceal
  // the rest of the reconstruction. The artboard is already white, so remove it.
  const useful = candidates.filter(p => !(isPaperWhite(p.path.getAttribute('fill') || '') && (options.dropPaperWhite || p.area > pageArea * .55)));
  const minArea = preset === 'DETAILED' ? 2 : preset === 'LOGO' ? 4 : 7;
  const denoised = useful.filter(p => p.area >= minArea);

  const makeObject = (parts: typeof denoised, index: number, exposeNodes: boolean): TelaVectorObject => {
    const first = parts[0];
    const x = Math.min(...parts.map(p => p.x)), y = Math.min(...parts.map(p => p.y));
    const maxX = Math.max(...parts.map(p => p.x + p.w)), maxY = Math.max(...parts.map(p => p.y + p.h));
    const directNodes = exposeNodes && parts.length === 1
      ? editableNodes(first.parsed.nodes, options.maxNodesPerLayer || 360)
      : undefined;
    const d = directNodes ? pathDataFromNodes(directNodes, first.parsed.closed) : parts.map(p => p.d).join(' ');
    return {
      id: `trace_${Date.now()}_${index}`, kind: 'PATH', x, y, w: Math.max(1, maxX - x), h: Math.max(1, maxY - y),
      fill: first.path.getAttribute('fill') || '#000000', stroke: first.path.getAttribute('stroke') || 'none',
      strokeWidth: Number(first.path.getAttribute('stroke-width') || 0), rotation: 0,
      opacity: Number(first.path.getAttribute('opacity') || 1), svgPathData: d,
      pathNodes: directNodes, pathClosed: directNodes ? first.parsed.closed : true, pathOriginX: x, pathOriginY: y,
      pathOriginW: Math.max(1, maxX - x), pathOriginH: Math.max(1, maxY - y),
      semanticRole: 'ARTWORK',
    };
  };

  let objects: TelaVectorObject[];
  if (options.layerMode === 'EDITABLE_CONTOURS') {
    // Recognition has already limited this bitmap to one semantic object. Each retained contour
    // therefore becomes a true Tela pen path with exposed spline anchors instead of a paint bucket.
    objects = [...denoised]
      .sort((a, b) => b.area - a.area)
      .slice(0, options.maxLayers || 96)
      .map((part, index) => makeObject([part], index, true));
  } else {
    // Whole-page/manual tracing still groups paint-equivalent contours so a scan cannot flood the
    // layer list with tens of thousands of microscopic objects.
    const groups = new Map<string, typeof denoised>();
    for (const p of denoised) groups.set(p.key, [...(groups.get(p.key) || []), p]);
    objects = Array.from(groups.values()).map((parts, index) => makeObject(parts, index, false));
  }
  const preview = previewSvg(width, height, objects);
  return {
    width, height, objects, previewSvg: preview,
    previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`,
    stats: {
      detectedPaths: rawPaths.length,
      retainedContours: denoised.length,
      compoundLayers: objects.length,
      removedNoise: rawPaths.length - denoised.length,
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
    },
  };
}

/** Repair traces created by the early one-contour-per-layer implementation. */
export function consolidateTelaTraceObjects(input: TelaVectorObject[]): TelaVectorObject[] {
  const groups = new Map<string, TelaVectorObject[]>();
  for (const o of input) {
    if (o.kind !== 'PATH' || !o.svgPathData) continue;
    const key = [o.fill, o.stroke, o.strokeWidth, o.opacity].join('|');
    groups.set(key, [...(groups.get(key) || []), o]);
  }
  return Array.from(groups.values()).map((parts, index) => {
    const first = parts[0];
    const x = Math.min(...parts.map(o => o.x)), y = Math.min(...parts.map(o => o.y));
    const maxX = Math.max(...parts.map(o => o.x + o.w)), maxY = Math.max(...parts.map(o => o.y + o.h));
    return {
      ...first, id: `trace_repaired_${Date.now()}_${index}`, x, y,
      w: Math.max(1, maxX - x), h: Math.max(1, maxY - y),
      svgPathData: parts.map(o => o.svgPathData).join(' '),
      pathNodes: undefined, pathOriginX: x, pathOriginY: y, pathClosed: true,
      pathOriginW: Math.max(1, maxX - x), pathOriginH: Math.max(1, maxY - y),
    };
  });
}
