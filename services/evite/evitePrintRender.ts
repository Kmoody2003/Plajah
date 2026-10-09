// evitePrintRender — BROWSER ONLY. Renders one printed invitation, per order, at the full 300 dpi bleed size:
//   plate (covering the bleed) → scrim / paper wash (same as the guest page) → live text in the safe box → QR tile.
// Names are never stored in art: this file is produced from the plate + the invite's live text each time.
//
// The same code renders the scaled-down preview in EvitePrintSheet (opts.scale), so the preview IS the print.
import QRCode from 'qrcode';
import { plateUrls, plateVoice, isLightPlate } from './plateCatalog';
import { isEraId } from './eraIds';
import { printLayout, coverRect, setJpegDpi, type PrintProduct, type PrintLayout, type Rect } from './evitePrintCore';
import type { EviteFields } from './eviteTypes';

export interface RenderPrintInput {
  inviteFields: EviteFields;
  plateId: string;
  product: PrintProduct;
  accent: string;
  /** The living invite this card opens (`https://plajah.com/i/<id>`). Omit to leave the QR off. */
  inviteUrl?: string;
  /** 1 = print file (default). Smaller for on-screen previews; layout scales with it. */
  scale?: number;
  /** JPEG quality; print default 0.95. */
  quality?: number;
}

/** Same faces the guest page loads (open-licensed only). */
export const PRINT_FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Outfit:ital,wght@0,600;0,800;1,900&family=Inter:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Fredoka:wght@600;700&display=swap';
const SANS = 'Inter, system-ui, sans-serif';

const plateCache = new Map<string, Promise<HTMLImageElement>>();
export function loadPlate(src: string): Promise<HTMLImageElement> {
  let p = plateCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';       // the plate bucket serves CORS (EviteStage's WebGL texture needs it too); keeps the canvas untainted
      i.decoding = 'async';
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('We couldn’t load the invitation art. Check your connection and try again.'));
      i.src = src;
    });
    p.catch(() => plateCache.delete(src));
    plateCache.set(src, p);
  }
  return p;
}

/** Make sure the faces the card uses are loaded before drawing (a canvas silently falls back otherwise). */
export async function ensurePrintFonts(display: string, displayStyle: string, timeoutMs = 6000): Promise<void> {
  if (typeof document === 'undefined' || !(document as any).fonts) return;
  if (!document.querySelector(`link[href="${PRINT_FONTS_CSS}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = PRINT_FONTS_CSS; document.head.appendChild(l);
  }
  const faces = [`${displayStyle} 64px ${display}`, `800 32px ${SANS}`, `700 32px ${SANS}`, `500 32px ${SANS}`];
  const load = Promise.all(faces.map(f => document.fonts.load(f).catch(() => []))).then(() => document.fonts.ready);
  await Promise.race([load, new Promise(r => setTimeout(r, timeoutMs))]);
}

function whenLine(f: EviteFields): string {
  const tz = f.timezone || undefined;
  const d = new Date(f.startsAt);
  const safe = (o: Intl.DateTimeFormatOptions, t: Date = d) => { try { return t.toLocaleString(undefined, { ...o, timeZone: tz }); } catch { return t.toLocaleString(undefined, o); } };
  const end = f.endsAt ? safe({ hour: 'numeric', minute: '2-digit' }, new Date(f.endsAt)) : '';
  return `${safe({ weekday: 'long', month: 'long', day: 'numeric' })} · ${safe({ hour: 'numeric', minute: '2-digit' })}${end ? ` – ${end}` : ''}`;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Greedy word wrap to `maxW`; a single word wider than the line is left to the font-size fitter. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Re-wrap to roughly equal line widths (CSS text-wrap: balance) by shrinking the target width while the line count holds. */
function balanced(ctx: Ctx, text: string, maxW: number): string[] {
  const base = wrap(ctx, text, maxW);
  if (base.length < 2) return base;
  let best = base;
  for (let w = maxW * 0.95; w > maxW * 0.5; w *= 0.95) {
    const t = wrap(ctx, text, w);
    if (t.length !== base.length || t.some(l => ctx.measureText(l).width > maxW)) break;
    best = t;
  }
  return best;
}

/** Letter-spaced text, centred on cx (canvas letterSpacing is not everywhere yet, so space glyph by glyph). */
function spaced(ctx: Ctx, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
  ctx.textAlign = align;
}

function roundRect(ctx: Ctx, r: Rect, rad: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y); ctx.lineTo(r.x + r.w - rad, r.y); ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad); ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h);
  ctx.lineTo(r.x + rad, r.y + r.h); ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rad);
  ctx.lineTo(r.x, r.y + rad); ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y); ctx.closePath();
}

function drawQr(ctx: Ctx, url: string, box: Rect) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'Q' });
  const n = qr.modules.size, quiet = 2;                     // tile padding supplies most of the quiet zone
  const cell = Math.floor(box.w / (n + quiet * 2)) || 1;    // whole pixels per module: crisp edges in the print
  const side = cell * (n + quiet * 2);
  const ox = box.x + box.w - side, oy = box.y + box.h - side;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, { x: ox, y: oy, w: side, h: side }, cell * 1.5); ctx.fill();
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
  ctx.restore();
  return { x: ox, y: oy, w: side, h: side };
}

/** Draw the card onto ctx using layout L. Exported for tests / thumbnails; most callers want renderPrintFile. */
export function paintCard(ctx: Ctx, L: PrintLayout, img: CanvasImageSource & { width: number; height: number }, input: RenderPrintInput, look?: { voice: ReturnType<typeof plateVoice>; light: boolean }) {
  const f = input.inviteFields;
  const p = plateUrls(input.plateId);
  const voice = look?.voice || plateVoice(p?.collection || 'general');
  const light = look ? look.light : isLightPlate(input.plateId);
  const u = L.unit;

  // 1. Plate covering the whole bleed box. The 812×1224 masters are upscaled ~1.9× here with the browser's
  //    high-quality smoothing. LATER: a pro upscale (e.g. an AI upscaler run once per plate master; plates carry no
  //    names, so the result can be cached per plate) will sharpen fine detail at 300 dpi.
  ctx.fillStyle = light ? '#faf6ee' : '#0b0713';
  ctx.fillRect(0, 0, L.widthPx, L.heightPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const c = coverRect(img.width, img.height, L.bleed);
  ctx.drawImage(img, c.x, c.y, c.w, c.h);

  // 2. Scrim (dark plates) or paper wash (light plates), the same stops as the guest page's .eg-over.
  const g = ctx.createLinearGradient(0, L.scrim.y + L.scrim.h, 0, L.scrim.y);
  if (light) { g.addColorStop(0, 'rgba(250,246,238,.94)'); g.addColorStop(0.55, 'rgba(250,246,238,.72)'); g.addColorStop(1, 'rgba(250,246,238,0)'); }
  else { g.addColorStop(0, 'rgba(5,3,9,.86)'); g.addColorStop(0.55, 'rgba(5,3,9,.45)'); g.addColorStop(1, 'rgba(5,3,9,0)'); }
  ctx.fillStyle = g;
  ctx.fillRect(L.scrim.x, L.scrim.y, L.scrim.w, L.scrim.h);

  // 3. Text block: eyebrow, headline, subline, date · time, venue — bottom-aligned in L.text, centred.
  const ink = light ? '#2b2420' : '#f4f1fa';
  const eyebrowInk = light ? '#7a5a2a' : input.accent;
  const T = L.text, cx = T.x + T.w / 2;
  const headline = voice.tone === 'party' ? f.headline.toUpperCase() : f.headline;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Fit the headline: start at the guest page's 46px, shrink until it fits in ≤3 lines and leaves room for the rest.
  const subPx = 15 * u, whenPx = 15 * u, venuePx = 13 * u, eyePx = 11 * u;
  const rest = eyePx * 1.2 + 8 * u + (f.subline ? subPx * 1.35 + 8 * u : 0) + whenPx * 1.35 + (f.venueName ? venuePx * 1.4 : 0) + 8 * u;
  let hPx = 46 * u, lines: string[] = [];
  for (; hPx > 20 * u; hPx *= 0.94) {
    ctx.font = `${voice.displayStyle} ${hPx}px ${voice.display}`;
    lines = balanced(ctx, headline, T.w);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (lines.length <= 3 && widest <= T.w && lines.length * hPx * 0.98 + rest <= T.h) break;
  }
  const subLines = f.subline ? (ctx.font = `500 ${subPx}px ${SANS}`, wrap(ctx, f.subline, T.w).slice(0, 2)) : [];

  // Lay out top-down from the computed total height, so the block sits on the bottom of the text box.
  const blocks: Array<{ font: string; px: number; lh: number; text: string; color: string; alpha?: number; shadow?: boolean; spacing?: number; gapBefore?: number }> = [];
  blocks.push({ font: `800 ${eyePx}px ${SANS}`, px: eyePx, lh: eyePx * 1.2, text: voice.eyebrow.toUpperCase(), color: eyebrowInk, spacing: eyePx * 0.28 });
  lines.forEach((l, i) => blocks.push({ font: `${voice.displayStyle} ${hPx}px ${voice.display}`, px: hPx, lh: hPx * 0.98, text: l, color: ink, shadow: !light, gapBefore: i === 0 ? 8 * u : 0 }));
  subLines.forEach((l, i) => blocks.push({ font: `500 ${subPx}px ${SANS}`, px: subPx, lh: subPx * 1.35, text: l, color: ink, alpha: 0.9, gapBefore: i === 0 ? 8 * u : 0 }));
  blocks.push({ font: `700 ${whenPx}px ${SANS}`, px: whenPx, lh: whenPx * 1.35, text: whenLine(f), color: ink, gapBefore: 8 * u });
  if (f.venueName) blocks.push({ font: `500 ${venuePx}px ${SANS}`, px: venuePx, lh: venuePx * 1.4, text: f.venueName, color: ink, alpha: 0.82 });

  const total = blocks.reduce((n, b) => n + (b.gapBefore || 0) + b.lh, 0);
  let y = T.y + Math.max(0, T.h - total);
  for (const b of blocks) {
    y += (b.gapBefore || 0) + b.lh;
    ctx.save();
    ctx.font = b.font; ctx.fillStyle = b.color; ctx.globalAlpha = b.alpha ?? 1;
    if (b.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 3 * u; }
    const baseline = y - b.lh * 0.22;                     // drop the descender share of the line box
    if (b.spacing) spaced(ctx, b.text, cx, baseline, b.spacing);
    else {
      // A long date / venue line shrinks to fit rather than running past the safe box.
      const w = ctx.measureText(b.text).width;
      if (w > T.w) { ctx.translate(cx, baseline); ctx.scale(T.w / w, 1); ctx.fillText(b.text, 0, 0); }
      else ctx.fillText(b.text, cx, baseline);
    }
    ctx.restore();
  }

  // 4. QR so the paper card still opens the living invite (RSVP, map, gifts), with a small caption beside it.
  if (input.inviteUrl) {
    const tile = drawQr(ctx, input.inviteUrl, L.qr);
    ctx.save();
    ctx.font = `700 ${10 * u}px ${SANS}`; ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.textAlign = 'right';
    ctx.fillText('Scan to RSVP', tile.x - 6 * u, tile.y + tile.h - 12 * u);
    ctx.font = `500 ${8.5 * u}px ${SANS}`; ctx.globalAlpha = 0.65;
    ctx.fillText(input.inviteUrl.replace(/^https?:\/\//, ''), tile.x - 6 * u, tile.y + tile.h - 1 * u);
    ctx.restore();
  }
}

/**
 * Render the print file. At scale 1 the result is exactly printLayout(product).widthPx × heightPx, JPEG q0.95,
 * sRGB (the 2D canvas works in sRGB; the JPEG carries no ICC profile and printers treat untagged RGB as sRGB),
 * with the JFIF density stamped to 300 dpi.
 */
export async function renderPrintFile(input: RenderPrintInput): Promise<Blob> {
  const L = printLayout(input.product, { scale: input.scale });
  const quality = input.quality ?? 0.95;
  let img: HTMLImageElement, look: { voice: ReturnType<typeof plateVoice>; light: boolean } | undefined;
  if (isEraId(input.plateId)) {
    // Design eras are vector: draw the plate straight at the bleed size, so print is as sharp as the screen.
    const era = await import('./eraArt');
    const ev = era.eraEvite(input.plateId);
    if (!ev) throw new Error('This invitation has no printable design.');
    look = { voice: era.eraVoice(ev.id), light: ev.light };
    const [src] = await Promise.all([era.eraPlateDataUrl(ev.id, Math.round(L.bleed.w), Math.round(L.bleed.h)), era.eraFontReady(ev.id)]);
    [img] = await Promise.all([loadPlate(src), ensurePrintFonts(look.voice.display, look.voice.displayStyle)]);
  } else {
    const urls = plateUrls(input.plateId);
    if (!urls) throw new Error('This invitation has no printable design.');
    const voice = plateVoice(urls.collection);
    [img] = await Promise.all([loadPlate(urls.plate), ensurePrintFonts(voice.display, voice.displayStyle)]);
  }

  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(L.widthPx, L.heightPx);
    const ctx = cv.getContext('2d', { alpha: false, colorSpace: 'srgb' } as any) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Your browser can’t draw the print file.');
    paintCard(ctx, L, img, input, look);
    blob = await cv.convertToBlob({ type: 'image/jpeg', quality });
  } else {
    const cv = document.createElement('canvas');
    cv.width = L.widthPx; cv.height = L.heightPx;
    const ctx = cv.getContext('2d', { alpha: false, colorSpace: 'srgb' } as any) as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Your browser can’t draw the print file.');
    paintCard(ctx, L, img, input, look);
    blob = await new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not create the print file.')), 'image/jpeg', quality));
  }
  const stamped = setJpegDpi(new Uint8Array(await blob.arrayBuffer()), Math.round(L.dpi));
  return new Blob([stamped as BlobPart], { type: 'image/jpeg' });
}

/** Base64 (no data: prefix) of a Blob, for the JSON upload route. */
export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(new Error('Could not read the print file.'));
    r.readAsDataURL(b);
  });
}
