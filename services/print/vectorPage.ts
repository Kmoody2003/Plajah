// vectorPage — split a rendered page into a vector layer (text, shapes) and a raster underlay (images,
// gradients, effects). Browser only.
//
// Works on a CLONE of the off-screen page, so the live render is never touched:
//   1. HTML text (writer pages, text boxes): every word is measured with a Range on its text node; the
//      baseline comes from a zero-height inline-block probe set in the same font, so it is exact.
//   2. SVG <text> (Tela vector text objects): each <tspan> line starts at getStartPositionOfChar(0),
//      which is the baseline; width is getComputedTextLength. Both go through the element's CTM.
//   3. SVG shapes: path/rect/circle/ellipse/line/polyline/polygon → absolute paths through the CTM.
// What becomes vector is hidden in the clone (text made transparent, shapes made invisible) and the
// clone is then rasterised as the underlay. Anything the PDF/X-1a vector path can't reproduce exactly
// stays raster and is counted by reason: transparency, gradients/patterns, filters, clips, masks,
// blend modes, rotated or transformed text, small caps, words broken across lines, glyphs the font
// lacks, text without an embeddable font, and anything a later raster element may paint over.

import { fontKey, type ResolvedFont, type VectorPage, type VectorShape, type VectorText } from './vector';
import { resolveFont, type FontSourceOptions } from './fontSource';
import { ellipsePath, parseSvgPath, polyPath, rectPath, segsToD, transformSegs } from './svgPath';
import { PX_PER_IN } from './types';
import { settle } from './domPrintJob';

export interface VectorBuild { clone: HTMLElement; vector: VectorPage; dispose: () => void }

type RGB = [number, number, number];
const parseColor = (c: string): { rgb: RGB; a: number } | null => {
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
  return { rgb: [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])], a };
};
const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const isFollowing = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && !b.contains(a);

let fontkitMod: Promise<any> | null = null;
const fontkit = () => (fontkitMod ||= import('@pdf-lib/fontkit').then(m => m.default));

export async function buildVectorPage(el: HTMLElement, fonts: Record<string, ResolvedFont>, o: FontSourceOptions = {}): Promise<VectorBuild> {
  // ── Clone off-screen, carrying canvas pixels across ──
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-400000px;top:0;pointer-events:none;';
  const clone = el.cloneNode(true) as HTMLElement;
  host.appendChild(clone); document.body.appendChild(host);
  const srcCanvases = el.querySelectorAll('canvas'), dstCanvases = clone.querySelectorAll('canvas');
  dstCanvases.forEach((c, i) => { try { c.getContext('2d')?.drawImage(srcCanvases[i], 0, 0); } catch { /* tainted/webgl: stays blank */ } });
  await settle(clone);

  const origin = clone.getBoundingClientRect();
  const toIn = (px: number) => px / PX_PER_IN;
  const rasterized: Record<string, number> = {};
  const keepRaster = (reason: string, n = 1) => { rasterized[reason] = (rasterized[reason] || 0) + n; };

  // Things that paint as raster, in document order: images, canvases, video, SVG images, CSS background images.
  const rasterEls: Array<{ el: Element; rect: DOMRect }> = [];
  clone.querySelectorAll('img, canvas, video, image').forEach(e => rasterEls.push({ el: e, rect: e.getBoundingClientRect() }));
  clone.querySelectorAll<HTMLElement>('*').forEach(e => { const bi = getComputedStyle(e).backgroundImage; if (bi && bi !== 'none') rasterEls.push({ el: e, rect: e.getBoundingClientRect() }); });
  const coveredLater = (node: Node, r: DOMRect) => rasterEls.some(x => intersects(x.rect, r) && isFollowing(node, x.el));

  // Effects on an element or any ancestor inside the page that a flat vector can't reproduce.
  const effectCache = new Map<Element, string | null>();
  const effect = (e: Element | null, textRule: boolean): string | null => {
    const out: string[] = [];
    for (let n = e; n && n !== clone.parentElement; n = n.parentElement) {
      let r = effectCache.get(n);
      if (r === undefined) {
        const cs = getComputedStyle(n);
        r = +cs.opacity < 1 ? 'transparency' : cs.filter !== 'none' ? 'filters' : (cs.mixBlendMode && cs.mixBlendMode !== 'normal') ? 'blend modes'
          : (cs.clipPath && cs.clipPath !== 'none') ? 'clipped elements' : ((cs as any).mask && (cs as any).mask !== 'none' && (cs as any).maskImage !== 'none') ? 'masks' : null;
        effectCache.set(n, r);
      }
      if (r) return r;
      // Positions come from measured rects, so a pure translate is harmless; scale/rotate/skew are not.
      if (textRule && n instanceof HTMLElement) {
        const tf = getComputedStyle(n).transform;
        const mm = tf.match(/^matrix\(([^)]+)\)$/);
        const v = mm ? mm[1].split(',').map(Number) : null;
        if (tf !== 'none' && !(v && Math.abs(v[0] - 1) < 1e-6 && Math.abs(v[1]) < 1e-6 && Math.abs(v[2]) < 1e-6 && Math.abs(v[3] - 1) < 1e-6)) out.push('transformed text');
      }
    }
    return out[0] || null;
  };

  // Fonts: resolve once per face, check glyph coverage with fontkit.
  const faces = new Map<string, { key: string; font: any } | null>();
  const face = async (stack: string, weight: number, italic: boolean) => {
    const id = `${stack}|${weight}|${italic}`;
    if (!faces.has(id)) {
      const r = await resolveFont(stack, weight, italic, o);
      if (!r) faces.set(id, null);
      else {
        const key = fontKey(stack.split(',')[0].trim().replace(/["']/g, ''), Math.min(900, Math.max(100, Math.round(weight / 100) * 100)), italic);
        fonts[key] = r;
        let fk: any = null; try { fk = (await fontkit()).create(r.bytes); } catch { fk = null; }
        faces.set(id, fk ? { key, font: fk } : null);
      }
    }
    return faces.get(id)!;
  };
  const covers = (fk: any, s: string) => [...s].every(ch => /\s/.test(ch) || fk.hasGlyphForCodePoint(ch.codePointAt(0)!));

  const texts: VectorText[] = [];
  const hideRanges: Array<{ node: Text; start: number; end: number }> = [];
  const hideSvg: Element[] = [];
  const baselineCache = new Map<string, number>();

  // ── 1. HTML text ──
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  const range = document.createRange();
  for (const node of nodes) {
    const parent = node.parentElement; const raw = node.data;
    if (!parent || !raw.trim() || parent.closest('svg text, script, style')) continue;
    const words = [...raw.matchAll(/\S+/g)];
    const cs = getComputedStyle(parent);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const col = parseColor(cs.color);
    const fx = effect(parent, true);
    const reason = fx || (!col ? 'text in unusual colours' : col.a < 1 ? 'transparency' : cs.textShadow !== 'none' ? 'text with shadows'
      : cs.fontVariantCaps && cs.fontVariantCaps !== 'normal' ? 'small caps' : (cs as any).webkitBackgroundClip === 'text' || (cs as any).backgroundClip === 'text' ? 'gradient text' : null);
    if (reason) { keepRaster(reason, words.length); continue; }
    // Text inside foreignObject is scaled by the SVG's transform; rotation/skew stays raster.
    let scale = 1;
    const fo = parent.closest('foreignObject') as SVGGraphicsElement | null;
    if (fo) { const m = fo.getScreenCTM(); if (!m || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) { keepRaster('transformed text', words.length); continue; } scale = Math.abs(m.a); }
    const weight = parseInt(cs.fontWeight, 10) || 400, italic = /italic|oblique/.test(cs.fontStyle);
    const f = await face(cs.fontFamily, weight, italic);
    if (!f) { keepRaster('text without an embeddable font', words.length); continue; }
    const sizePx = parseFloat(cs.fontSize) || 16;
    // Baseline offset below the text box top, for this exact font (probe in the same parent).
    const sig = `${cs.fontStyle}|${cs.fontWeight}|${cs.fontSize}|${cs.fontFamily}`;
    let base = baselineCache.get(sig);
    if (base === undefined) {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;';
      const mark = document.createElement('span'); mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
      const t = document.createTextNode('Hg'); probe.append(mark, t); parent.appendChild(probe);
      const r = document.createRange(); r.selectNodeContents(t);
      base = mark.getBoundingClientRect().bottom - r.getBoundingClientRect().top;
      probe.remove(); baselineCache.set(sig, base);
    }
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    const tt = cs.textTransform;
    for (const m of words) {
      const start = m.index!, end = start + m[0].length;
      range.setStart(node, start); range.setEnd(node, end);
      const rects = range.getClientRects();
      if (rects.length !== 1) { keepRaster('words broken across lines'); continue; }
      const r = rects[0];
      if (coveredLater(node, r)) { keepRaster('text under images'); continue; }
      const word = tt === 'uppercase' ? m[0].toUpperCase() : tt === 'lowercase' ? m[0].toLowerCase() : tt === 'capitalize' ? m[0][0].toUpperCase() + m[0].slice(1) : m[0];
      if (!covers(f.font, word)) { keepRaster('glyphs missing from the embedded font'); continue; }
      texts.push({
        text: word, xIn: toIn(r.left - origin.left), baselineIn: toIn(r.top - origin.top + base * scale), widthIn: toIn(r.width),
        sizePt: sizePx * scale * 0.75, fontKey: f.key, color: col!.rgb, letterSpacingPt: ls * scale * 0.75,
      });
      hideRanges.push({ node, start, end });
    }
  }

  // ── 2. SVG <text> lines ──
  for (const t of Array.from(clone.querySelectorAll('svg text')) as SVGTextElement[]) {
    const lines = (t.querySelectorAll('tspan').length ? Array.from(t.querySelectorAll('tspan')) : [t]) as SVGTextContentElement[];
    const cs = getComputedStyle(t);
    const fill = cs.fill.startsWith('url(') ? null : parseColor(cs.fill);
    const m = t.getScreenCTM();
    const reason = effect(t, false) || (!fill ? 'gradient text' : fill.a < 1 || +cs.fillOpacity < 1 ? 'transparency' : cs.stroke && cs.stroke !== 'none' ? 'outlined text'
      : !m || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 ? 'rotated text' : null);
    if (reason) { keepRaster(reason, lines.length); continue; }
    const weight = parseInt(cs.fontWeight, 10) || 400, italic = /italic|oblique/.test(cs.fontStyle);
    const f = await face(cs.fontFamily, weight, italic);
    if (!f) { keepRaster('text without an embeddable font', lines.length); continue; }
    const sx = Math.abs(m!.a), sy = Math.abs(m!.d);
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    for (const ln of lines) {
      const s = (ln.textContent || '').replace(/\s+$/, '');
      if (!s.trim() || ln.getNumberOfChars() === 0) continue;
      if (!covers(f.font, s)) { keepRaster('glyphs missing from the embedded font'); continue; }
      const p = ln.getStartPositionOfChar(0);
      const sp = new DOMPoint(p.x, p.y).matrixTransform(m!);
      const width = ln.getComputedTextLength() * sx;
      const box = new DOMRect(sp.x, sp.y - parseFloat(cs.fontSize) * sy, width, parseFloat(cs.fontSize) * sy * 1.2);
      if (coveredLater(ln, box)) { keepRaster('text under images'); continue; }
      texts.push({
        text: s, xIn: toIn(sp.x - origin.left), baselineIn: toIn(sp.y - origin.top), widthIn: toIn(width),
        sizePt: parseFloat(cs.fontSize) * sy * 0.75, fontKey: f.key, color: fill!.rgb, letterSpacingPt: ls * sx * 0.75,
      });
      hideSvg.push(ln);
    }
  }

  // ── 3. SVG shapes ──
  const shapes: VectorShape[] = [];
  const shapeEls = Array.from(clone.querySelectorAll('svg path, svg rect, svg circle, svg ellipse, svg line, svg polyline, svg polygon')) as SVGGraphicsElement[];
  for (const s of shapeEls) {
    if (s.closest('defs, clipPath, mask, pattern, symbol, marker, foreignObject')) continue;
    const cs = getComputedStyle(s);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const fillC = cs.fill && cs.fill !== 'none' ? (cs.fill.startsWith('url(') ? 'url' : parseColor(cs.fill)) : null;
    const strokeC = cs.stroke && cs.stroke !== 'none' ? (cs.stroke.startsWith('url(') ? 'url' : parseColor(cs.stroke)) : null;
    const sw = parseFloat(cs.strokeWidth) || 0;
    const fill = fillC && fillC !== 'url' && fillC.a > 0 ? fillC : null;
    const stroke = strokeC && strokeC !== 'url' && strokeC.a > 0 && sw > 0 ? strokeC : null;
    if (!fill && !stroke && fillC !== 'url' && strokeC !== 'url') continue; // paints nothing
    const m = s.getScreenCTM();
    const reason = effect(s, false) || (fillC === 'url' || strokeC === 'url' ? 'gradients and patterns' : (fill && (fill.a < 1 || +cs.fillOpacity < 1)) || (stroke && (stroke.a < 1 || +cs.strokeOpacity < 1)) ? 'transparency' : !m ? 'unmeasurable shapes' : null);
    if (reason) { keepRaster(reason); continue; }
    const box = s.getBoundingClientRect();
    if (coveredLater(s, box)) { keepRaster('shapes under images'); continue; }
    const tag = s.tagName.toLowerCase(), A = (n: string) => parseFloat(s.getAttribute(n) || '0') || 0;
    const d = tag === 'path' ? s.getAttribute('d') || ''
      : tag === 'rect' ? rectPath(A('x'), A('y'), A('width'), A('height'), A('rx') || A('ry'), A('ry') || A('rx'))
      : tag === 'circle' ? ellipsePath(A('cx'), A('cy'), A('r'), A('r'))
      : tag === 'ellipse' ? ellipsePath(A('cx'), A('cy'), A('rx'), A('ry'))
      : tag === 'line' ? `M${A('x1')} ${A('y1')}L${A('x2')} ${A('y2')}`
      : polyPath(s.getAttribute('points') || '', tag === 'polygon');
    if (!d) continue;
    // User space → page inches: the CTM lands in viewport px; shift by the page origin and divide by 96.
    const k = 1 / PX_PER_IN;
    const segs = transformSegs(parseSvgPath(d), [m!.a * k, m!.b * k, m!.c * k, m!.d * k, (m!.e - origin.left) * k, (m!.f - origin.top) * k]);
    const det = Math.sqrt(Math.abs(m!.a * m!.d - m!.b * m!.c));
    const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[ ,]+/).map(v => parseFloat(v) * det * 0.75).filter(v => v > 0) : undefined;
    shapes.push({
      d: segsToD(segs), fill: tag === 'line' ? undefined : fill?.rgb, stroke: stroke?.rgb,
      strokePt: stroke ? sw * det * 0.75 : undefined, dashPt: dash?.length ? dash : undefined,
      cap: (cs.strokeLinecap as VectorShape['cap']) || undefined, join: (cs.strokeLinejoin as VectorShape['join']) || undefined,
      evenOdd: cs.fillRule === 'evenodd',
    });
    hideSvg.push(s);
  }

  // ── Hide the vector layer in the clone so the underlay keeps only what stays raster ──
  for (const e of hideSvg) (e as SVGElement).style.visibility = 'hidden';
  const byNode = new Map<Text, Array<{ start: number; end: number }>>();
  for (const h of hideRanges) { if (!byNode.has(h.node)) byNode.set(h.node, []); byNode.get(h.node)!.push(h); }
  for (const [node, spans] of byNode) {
    const frag = document.createDocumentFragment(); let at = 0;
    for (const { start, end } of spans.sort((a, b) => a.start - b.start)) {
      if (start > at) frag.append(node.data.slice(at, start));
      const sp = document.createElement('span');
      sp.style.cssText = 'color:transparent;-webkit-text-fill-color:transparent;text-shadow:none;';
      sp.textContent = node.data.slice(start, end); frag.append(sp); at = end;
    }
    if (at < node.data.length) frag.append(node.data.slice(at));
    node.replaceWith(frag);
  }

  return { clone, vector: { texts, shapes, rasterized }, dispose: () => host.remove() };
}
