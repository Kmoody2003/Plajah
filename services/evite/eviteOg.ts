// eviteOg — BROWSER ONLY. The invite's own link preview (1200×630): the living card with its real headline, date and
// venue, centred on a soft blur of its own art. Drawn by the same paintCard the print file uses, so the preview a
// friend sees in iMessage / WhatsApp / X matches the card they open. Rendered in the host's browser when the invite
// is published or its wording changes, then uploaded to the host's Storage folder; the server's /i/:id tags prefer it
// over the per-design static preview (plateOgUrl).
import { plateUrls, plateVoice } from './plateCatalog';
import { isEraId } from './eraIds';
import { paintCard, loadPlate, ensurePrintFonts, type RenderPrintInput } from './evitePrintRender';
import type { PrintLayout, Rect } from './evitePrintCore';
import type { EviteFields } from './eviteTypes';

export const OG_W = 1200, OG_H = 630;
/** The card inside the preview: 2:3, tall enough to read on a phone thumbnail, centred so square crops keep it whole. */
const CARD_H = 560, CARD_W = Math.round(CARD_H * 2 / 3), RADIUS = 22, SS = 2;   // SS: card drawn at 2× then scaled

/** A card-shaped layout for paintCard (no bleed, no QR), matching the guest page's proportions. */
export function ogCardLayout(w: number, h: number): PrintLayout {
  const inset = w * 0.06;
  const full: Rect = { x: 0, y: 0, w, h };
  const safe: Rect = { x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset };
  const text: Rect = { x: safe.x, y: h * 0.46, w: safe.w, h: safe.y + safe.h - h * 0.46 };
  const scrimTop = Math.max(0, text.y - h * 0.2);
  return { dpi: 0, widthPx: w, heightPx: h, bleedPx: 0, safeInsetPx: inset, bleed: full, trim: full, safe, text,
    qr: { x: 0, y: 0, w: 0, h: 0 }, scrim: { x: 0, y: scrimTop, w, h: h - scrimTop }, unit: w / 390 };
}

export interface OgInput { plateId: string; fields: EviteFields; accent: string; art?: { plate: string; preset: string; voice?: string; light?: boolean } | null; showLaw?: boolean }

async function plateAndLook(i: OgInput): Promise<{ img: HTMLImageElement; look?: { voice: ReturnType<typeof plateVoice>; light: boolean } }> {
  if (isEraId(i.plateId)) {
    const era = await import('./eraArt');
    const ev = era.eraEvite(i.plateId); if (!ev) throw new Error('Unknown design.');
    const look = { voice: era.eraVoice(ev.id), light: ev.light };
    const [src] = await Promise.all([era.eraPlateDataUrl(ev.id, CARD_W * SS, CARD_H * SS, { showLaw: i.showLaw }), era.eraFontReady(ev.id)]);
    const [img] = await Promise.all([loadPlate(src), ensurePrintFonts(look.voice.display, look.voice.displayStyle)]);
    return { img, look };
  }
  const u = plateUrls(i.plateId);
  const src = u?.plate || i.art?.plate; if (!src) throw new Error('Unknown design.');
  const voice = plateVoice(i.art?.voice || u?.collection || i.art?.preset || 'general');
  const [img] = await Promise.all([loadPlate(src), ensurePrintFonts(voice.display, voice.displayStyle)]);
  return { img, look: u ? undefined : { voice, light: !!i.art?.light } };
}

function canvas(w: number, h: number): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Render the preview JPEG. */
export async function renderInviteOg(i: OgInput, quality = 0.86): Promise<Blob> {
  const { img, look } = await plateAndLook(i);

  // The card, at 2× with its live text.
  const card = canvas(CARD_W * SS, CARD_H * SS);
  const cctx = card.getContext('2d')!;
  const input: RenderPrintInput = { inviteFields: i.fields, plateId: i.plateId, product: null as any, accent: i.accent };
  paintCard(cctx, ogCardLayout(card.width, card.height), img, input, look);

  const out = canvas(OG_W, OG_H);
  const ctx = out.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

  // Background: the art blurred by down/up-sampling (works in every browser; ctx.filter isn't in all Safari versions).
  const tiny = canvas(48, 26), tctx = tiny.getContext('2d')!;
  const s = Math.max(48 / img.width, 26 / img.height);
  tctx.drawImage(img, (48 - img.width * s) / 2, (26 - img.height * s) / 2, img.width * s, img.height * s);
  ctx.drawImage(tiny, -40, -40, OG_W + 80, OG_H + 80);
  ctx.fillStyle = 'rgba(11,7,19,.42)'; ctx.fillRect(0, 0, OG_W, OG_H);
  const v = ctx.createRadialGradient(OG_W / 2, OG_H * 0.48, OG_H * 0.3, OG_W / 2, OG_H * 0.48, OG_W * 0.62);
  v.addColorStop(0, 'rgba(11,7,19,0)'); v.addColorStop(1, 'rgba(11,7,19,.7)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, OG_W, OG_H);

  // The card with a soft drop shadow and rounded corners.
  const cx = (OG_W - CARD_W) / 2, cy = (OG_H - CARD_H) / 2 - 4;
  const rr = (c: CanvasRenderingContext2D) => { c.beginPath(); (c as any).roundRect ? (c as any).roundRect(cx, cy, CARD_W, CARD_H, RADIUS) : c.rect(cx, cy, CARD_W, CARD_H); };
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16; ctx.fillStyle = '#000'; rr(ctx); ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx); ctx.clip(); ctx.drawImage(card, cx, cy, CARD_W, CARD_H); ctx.restore();
  ctx.save(); rr(ctx); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.font = '700 15px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.textAlign = 'right';
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '4px';
  ctx.fillText('PLAJAH EVENTS', OG_W - 34, OG_H - 26);
  ctx.restore();

  return new Promise<Blob>((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('Could not draw the link preview.')), 'image/jpeg', quality));
}

/** What the preview depends on: re-render only when one of these changes. */
export const ogSignature = (i: Pick<OgInput, 'plateId' | 'accent' | 'showLaw'> & { fields: Pick<EviteFields, 'headline' | 'subline' | 'startsAt' | 'endsAt' | 'timezone' | 'venueName'> }) =>
  JSON.stringify([i.plateId, i.accent, !!i.showLaw, i.fields.headline, i.fields.subline || '', i.fields.startsAt, i.fields.endsAt || 0, i.fields.timezone || '', i.fields.venueName || '']);
