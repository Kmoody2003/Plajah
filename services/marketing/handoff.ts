/**
 * Offline marketing hand-offs — turn a marketing play into the packet a billboard or print-and-mail vendor
 * actually needs. Pure (no Firebase, no network): the UI downloads these as files and the owner sends them.
 *
 * Plajah does not place paid billboard or mail orders yet (CampaignBuilder saves estimates; Lob is used
 * for address verification only). The packet is the honest hand-off: specs, copy, list and a job file in
 * the shape print-and-mail APIs (Lob / PostGrid) and DOOH sellers (AdQuick / Blip / Vistar) accept.
 */
import type { MarketingPlay } from '../opsPresets/types';

export interface HandoffIdentity {
  name: string;
  phone?: string;
  website?: string;
  address?: { line1?: string; line2?: string; city?: string; region?: string; postal?: string };
  logoUrl?: string;
}

export interface MailRecipient {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal: string;
}

/** Industry-standard digital billboard canvases (width x height px). Static vinyl bulletins are 14' x 48'. */
export const DOOH_SIZES = [
  { id: 'bulletin', label: 'Digital bulletin', w: 1400, h: 400 },
  { id: 'poster', label: 'Digital poster', w: 840, h: 400 },
  { id: 'hd', label: 'HD screen (landscape)', w: 1920, h: 1080 },
  { id: 'portrait', label: 'Street-level portrait', w: 1080, h: 1920 },
] as const;

/** USPS / print-vendor mail formats: trim size (in), bleed (in), and USPS class notes. */
export const MAIL_FORMATS = {
  postcard_4x6: { label: '4" x 6" postcard', w: 6, h: 4, bleed: 0.125, note: 'First-Class postcard rate.' },
  postcard_6x9: { label: '6" x 9" postcard', w: 9, h: 6, bleed: 0.125, note: 'Marketing Mail or First-Class letter rate.' },
  postcard_6x11: { label: '6" x 11" postcard', w: 11, h: 6, bleed: 0.125, note: 'Largest letter-size card; strong for EDDM-style saturation.' },
  letter: { label: 'Letter in #10 envelope', w: 8.5, h: 11, bleed: 0, note: 'Personal letters; window envelope with address block.' },
  eddm_flat: { label: 'EDDM flat (6.25" x 9" or larger)', w: 12, h: 6.25, bleed: 0.125, note: 'Every Door Direct Mail: no list, mailed by carrier route; needs the EDDM indicia and route facing slips.' },
} as const;

export type MailFormat = keyof typeof MAIL_FORMATS;

const fill = (s: string, who: HandoffIdentity) =>
  s.replace(/\{\{business_name\}\}/g, who.name).replace(/\{\{business_phone\}\}/g, who.phone || '').trim();

/** Billboard copy check: 7 words or fewer on the main line is the out-of-home rule of thumb. */
export function billboardCopyCheck(line: string): { words: number; ok: boolean; advice?: string } {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return words <= 7 ? { words, ok: true } : { words, ok: false, advice: `Cut to 7 words or fewer (now ${words}). Drivers read a billboard in about 5 seconds.` };
}

export interface BillboardBrief {
  kind: 'billboard';
  advertiser: string;
  campaign: string;
  flight: { start: string; end: string; days: number };
  market: { radiusMi: number; center?: string };
  budgetUsd: number;
  copy: { line: string; sub?: string; cta: string; check: ReturnType<typeof billboardCopyCheck> };
  creativeSpecs: { id: string; label: string; w: number; h: number; format: string }[];
  rules: string[];
}

export function billboardBrief(play: MarketingPlay, who: HandoffIdentity, start: Date): BillboardBrief {
  const line = fill(play.billboard?.line || play.headline, who);
  const end = new Date(start.getTime() + play.durationDays * 86400000);
  return {
    kind: 'billboard',
    advertiser: who.name,
    campaign: play.label,
    flight: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: play.durationDays },
    market: { radiusMi: play.radiusMi ?? 5, center: [who.address?.city, who.address?.region].filter(Boolean).join(', ') || undefined },
    budgetUsd: Math.round(play.budgetCents / 100),
    copy: { line, sub: play.billboard?.sub ? fill(play.billboard.sub, who) : undefined, cta: fill(play.cta, who), check: billboardCopyCheck(line) },
    creativeSpecs: DOOH_SIZES.map(s => ({ ...s, format: 'JPG or PNG, RGB, under 10 MB; MP4 only if the seller allows motion' })),
    rules: [
      'One message, one image, logo, and the next step (exit, address or short URL).',
      'High contrast; at least 30% of the canvas is the main line.',
      'Digital boards rotate every 8 to 10 seconds: no small print.',
      'Regulated categories (alcohol, cannabis, political, real estate, auto pricing) need the seller’s compliance review.',
    ],
  };
}

export interface MailJob {
  kind: 'mail';
  advertiser: string;
  campaign: string;
  format: MailFormat;
  size: (typeof MAIL_FORMATS)[MailFormat];
  quantity: number;
  list: NonNullable<MarketingPlay['mail']>['list'];
  mailBy: string;
  returnAddress?: HandoffIdentity['address'] & { name: string };
  copy: { headline: string; body: string; cta: string };
  /** Lob / PostGrid style "to" objects; empty for EDDM (route-based, no names). */
  to: { name: string; address_line1: string; address_line2?: string; address_city: string; address_state: string; address_zip: string }[];
  notes: string[];
}

export function mailJob(play: MarketingPlay, who: HandoffIdentity, recipients: MailRecipient[], mailBy: Date, eddmQuantity = 0): MailJob {
  const format = (play.mail?.format ?? 'postcard_6x9') as MailFormat;
  const list = play.mail?.list ?? 'uploaded';
  const eddm = list === 'eddm_routes' || play.channels.includes('eddm');
  const to = eddm ? [] : recipients.map(r => ({ name: r.name, address_line1: r.line1, ...(r.line2 ? { address_line2: r.line2 } : {}), address_city: r.city, address_state: r.region, address_zip: r.postal }));
  return {
    kind: 'mail',
    advertiser: who.name,
    campaign: play.label,
    format,
    size: MAIL_FORMATS[format],
    quantity: eddm ? eddmQuantity : to.length,
    list,
    mailBy: mailBy.toISOString().slice(0, 10),
    returnAddress: who.address ? { name: who.name, ...who.address } : undefined,
    copy: { headline: fill(play.headline, who), body: fill(play.body, who), cta: fill(play.cta, who) },
    to,
    notes: [
      eddm
        ? 'EDDM: choose carrier routes in the USPS EDDM Online tool (or your printer’s), print with the EDDM indicia, bundle by route with facing slips.'
        : 'Verify addresses (CASS) before printing; Plajah can verify through Lob when the account has a key.',
      'Leave the bottom 2.375" of the address side clear for USPS barcodes on postcards.',
      'Offers need an expiration date and any terms printed on the piece.',
    ],
  };
}

/** CSV for a printer or mail house. Quotes every field; skips incomplete rows. */
export function recipientsCsv(rows: MailRecipient[]): string {
  const q = (v?: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['name', 'address1', 'address2', 'city', 'state', 'zip'].join(',');
  const body = rows.filter(r => r.line1 && r.city && r.region && r.postal).map(r => [r.name, r.line1, r.line2, r.city, r.region, r.postal].map(q).join(','));
  return [head, ...body].join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A printable one-page brief (HTML) to email to the vendor or print for the files. */
export function briefHtml(brief: BillboardBrief | MailJob, accent = '#FF8C00'): string {
  const rows: [string, string][] = brief.kind === 'billboard'
    ? [['Advertiser', brief.advertiser], ['Campaign', brief.campaign], ['Flight', `${brief.flight.start} to ${brief.flight.end} (${brief.flight.days} days)`],
       ['Market', `${brief.market.radiusMi} mi around ${brief.market.center || 'the business'}`], ['Budget', `$${brief.budgetUsd.toLocaleString()}`],
       ['Main line', `${brief.copy.line}${brief.copy.check.ok ? '' : ` — ${brief.copy.check.advice}`}`], ['Sub line', brief.copy.sub || '—'], ['Call to action', brief.copy.cta],
       ['Creative sizes', brief.creativeSpecs.map(s => `${s.label} ${s.w}×${s.h}`).join('; ')]]
    : [['Advertiser', brief.advertiser], ['Campaign', brief.campaign], ['Format', `${brief.size.label} — ${brief.size.note}`], ['Quantity', String(brief.quantity || 'Set by route selection')],
       ['List', brief.list.replace(/_/g, ' ')], ['Mail by', brief.mailBy], ['Headline', brief.copy.headline], ['Body', brief.copy.body], ['Call to action', brief.copy.cta],
       ['Return address', brief.returnAddress ? [brief.returnAddress.name, brief.returnAddress.line1, brief.returnAddress.city, brief.returnAddress.region, brief.returnAddress.postal].filter(Boolean).join(', ') : '—']];
  const notes = brief.kind === 'billboard' ? brief.rules : brief.notes;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(brief.campaign)} — ${brief.kind === 'billboard' ? 'Billboard brief' : 'Mail job'}</title>
<style>body{font:15px/1.5 Inter,system-ui,sans-serif;color:#1D1922;margin:40px;max-width:760px}h1{font:700 30px/1.1 'Bricolage Grotesque',Inter,sans-serif;letter-spacing:-.02em;margin:0 0 4px}
.bar{height:6px;border-radius:3px;background:linear-gradient(135deg,#6B0099,#D40055 55%,${accent});margin:0 0 24px}table{border-collapse:collapse;width:100%}td{padding:10px 0;border-top:1px solid #e6e0e8;vertical-align:top}
td:first-child{width:170px;color:#6A6170}li{margin:4px 0}.foot{margin-top:28px;color:#6A6170;font-size:13px}</style></head><body>
<h1>${esc(brief.campaign)}</h1><div style="color:#6A6170;margin-bottom:12px">${brief.kind === 'billboard' ? 'Billboard / digital out-of-home brief' : 'Direct mail job'} · ${esc(brief.advertiser)}</div><div class="bar"></div>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<h3>Notes</h3><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
<div class="foot">Prepared with Plajah Business. Send this brief with your artwork to the vendor of your choice.</div></body></html>`;
}

/** Trigger a browser download of text content (client-only helper; no-op on the server). */
export function downloadText(filename: string, text: string, mime = 'text/plain') {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
