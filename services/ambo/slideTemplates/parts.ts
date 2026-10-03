// parts — small shared building blocks for slide designers (QR well, photo
// well, chips). Each is drawn in the active theme's palette.
import { rect, text, image, imageSlot, alpha } from '../../tela/templateKit';
import * as orn from '../../tela/ornaments';
import { measureText, transformText } from '../../tela/telaText';
import { fitText, type Lay } from './layout';
import type { DesignCtx, SlideObj, SlideTheme } from './types';
import { typeset } from './themes';

export const prelude = (d: DesignCtx, withFrame = true): SlideObj[] => [...d.th.motif.ground(d.L, d.seed), ...(withFrame ? d.th.motif.frame(d.L) : [])];

/** Multiply the opacity of a group (watermark use of a hero). */
export function dim(objs: SlideObj[], k: number): SlideObj[] { for (const o of objs) o.opacity = (o.opacity ?? 1) * k; return objs; }

/**
 * A QR well: a light, high-contrast square with the three finder marks drawn
 * so the operator reads it instantly as "QR goes here". A pasted QR image URL
 * is drawn over it.
 */
export function qrSlot(x: number, y: number, s: number, th: SlideTheme, L: Lay, seed: number, url?: string, caption?: string, captionColor = th.c.muted): SlideObj[] {
  const ink = '#16141A', pad = s * .08, inner = s - pad * 2, cell = inner / 21;
  const out: SlideObj[] = [rect(x, y, s, s, '#FFFFFF', { rx: Math.min(s * .06, L.u), label: 'QR well', role: 'IMAGE_SLOT', shadow: th.dark ? undefined : { x: 0, y: L.u * .3, blur: L.u, color: 'rgba(0,0,0,0.12)' } })];
  const finder = (fx: number, fy: number) => [
    rect(fx, fy, cell * 7, cell * 7, ink, { label: 'QR finder' }),
    rect(fx + cell, fy + cell, cell * 5, cell * 5, '#FFFFFF', { label: 'QR finder' }),
    rect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, ink, { label: 'QR finder' }),
  ];
  const ox = x + pad, oy = y + pad;
  out.push(...finder(ox, oy), ...finder(ox + cell * 14, oy), ...finder(ox, oy + cell * 14));
  if (!url) {
    const r = orn.rng(seed + 41);
    for (let j = 0; j < 21; j++) for (let i = 0; i < 21; i++) {
      const inFinder = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
      if (inFinder || r() > .42) continue;
      out.push(rect(ox + i * cell, oy + j * cell, cell, cell, alpha(ink, .16), { label: 'QR placeholder module' }));
      if (out.length > 150) break;
    }
  } else {
    out.push(image(x + pad * .5, y + pad * .5, s - pad, s - pad, url, 512, 512, { label: 'QR code image' }));
  }
  if (caption) {
    const ty = typeset(th);
    out.push(fitText(x, y + s + L.u * 1.1, s, caption, ty.label(L.u * 1.3, { align: 'center', color: captionColor, wrap: false, label: 'QR caption' }), L.u * 2, L.u * .95));
  }
  return out;
}

/** A photo well in the theme's shape; draws a pasted image URL over it. */
export function photo(x: number, y: number, w: number, h: number, th: SlideTheme, L: Lay, url: string | undefined, caption: string, opts: { tilt?: boolean; bleed?: boolean } = {}): SlideObj[] {
  const rx = opts.bleed ? 0 : Math.min(w, h) * th.slot.rx;
  const rot = opts.tilt === false ? 0 : th.slot.tilt;
  const out = imageSlot(x, y, w, h, { tone: th.dark ? 'dark' : 'light', rx, rotation: rot, caption, frame: opts.bleed ? undefined : alpha(th.c.accent, .45), frameWidth: Math.max(1, L.u * .1), label: 'Photo well' }) as SlideObj[];
  // The kit's hint is sized for print; scale it for a screen.
  for (const o of out) if (o.kind === 'TEXT') {
    o.fontSize = L.u * 1.1; o.y = y + h / 2 - o.fontSize / 2; o.h = o.fontSize;
    // Keep the hint inside title-safe even when the well bleeds off the page.
    const x0 = Math.max(o.x, L.safe.x), x1 = Math.min(o.x + o.w, L.safe.right);
    o.x = x0; o.w = Math.max(10, x1 - x0); o.y = Math.min(Math.max(o.y, L.safe.y), L.safe.bottom - o.h);
  }
  if (url) { const img = image(x, y, w, h, url, 1600, 1000, { label: 'Photo', rotation: rot }); (img as SlideObj).rx = rx; out.push(img); }
  return out;
}

/** Pill chip with a centred label. Returns objects and width used. */
export function chip(x: number, y: number, label: string, th: SlideTheme, L: Lay, size0: number, onPanel = false, maxW = Infinity): { objs: SlideObj[]; w: number; h: number } {
  const ty = typeset(th);
  let size = size0, t = text(0, 0, 4000, label, ty.label(size, { wrap: false, color: onPanel ? th.c.panelInk : th.c.ink, label: 'Chip label' }));
  while (measureLabel(t) + size * 2.2 > maxW && size > L.u * .95) { size *= .9; t = text(0, 0, 4000, label, ty.label(size, { wrap: false, color: onPanel ? th.c.panelInk : th.c.ink, label: 'Chip label' })); }
  while (measureLabel(t) + size * 2.2 > maxW && (t.text || '').length > 2) t.text = (t.text || '').replace(/.…?$/, '') .replace(/\s+$/, '') + '…';
  const tw = Math.min(4000, measureLabel(t)), padX = size * 1.1, h = size * 2.3, w = tw + padX * 2;
  t.x = x + padX; t.y = y + (h - size) / 2 - size * .08; t.w = tw + 2;
  return { w, h, objs: [rect(x, y, w, h, alpha(th.c.accent, th.dark ? .12 : .1), { rx: h / 2, stroke: alpha(th.c.accent, .6), strokeWidth: Math.max(1, L.u * .1), label: 'Chip' }), t] };
}
function measureLabel(o: SlideObj): number { return measureText(transformText(o.text || '', o.textTransform), o); }
