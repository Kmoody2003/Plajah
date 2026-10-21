// Print + mail hand-off builders for the CRM: letters on business letterhead, 6x9 postcards (front + back,
// interleaved for duplex), Avery 5160 labels, and a print-and-mail vendor job spec. Printing happens in an
// isolated, hidden iframe so the app's own CSS never leaks onto the page and no pop-up blocker is involved.
import type { MailingRow } from '../../services/crm/crmCore';

export const esc = (s: string) => (s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export interface Letterhead {
  name: string;
  logoUrl?: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  website?: string;
  accent: string;
}

export function printHtml(title: string, bodyHtml: string, css: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Georgia,'Times New Roman',serif}${css}</style></head><body>${bodyHtml}</body></html>`);
  d.close();
  const go = () => {
    try { frame.contentWindow!.focus(); frame.contentWindow!.print(); } catch { /* blocked */ }
    setTimeout(() => frame.remove(), 60_000);
  };
  // Wait for images (logo) so the letterhead isn't blank on the first page.
  const imgs = Array.from(d.images);
  if (!imgs.length) { setTimeout(go, 50); return; }
  let left = imgs.length;
  const done = () => { if (--left <= 0) go(); };
  imgs.forEach(img => (img.complete ? done() : (img.onload = img.onerror = done)));
  setTimeout(() => { if (left > 0) { left = 0; go(); } }, 4000);
}

const addrBlock = (r: MailingRow) =>
  `${esc(r.name)}<br>${esc(r.address1)}${r.address2 ? `<br>${esc(r.address2)}` : ''}<br>${esc(r.city)}, ${esc(r.state)} ${esc(r.zip)}`;

const paragraphs = (text: string) =>
  text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/** One page per letter. The recipient block sits where a #10 window envelope shows it. */
export function lettersHtml(letters: { to: MailingRow | null; subject: string; body: string }[], head: Letterhead, dateText: string) {
  const css = `@page{size:letter;margin:0}
.page{width:8.5in;height:11in;padding:0.6in 0.9in 0.8in;position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.lh{display:flex;align-items:center;gap:14px;border-bottom:3px solid ${head.accent};padding-bottom:10px}
.lh img{height:52px;width:auto;max-width:160px;object-fit:contain}
.lh .n{font:700 20pt 'Bricolage Grotesque',Inter,Arial,sans-serif;letter-spacing:-0.01em}
.lh .a{font:9.5pt Inter,Arial,sans-serif;color:#555;margin-left:auto;text-align:right;line-height:1.45}
.to{position:absolute;top:2.05in;left:0.95in;width:3.9in;font:11pt Inter,Arial,sans-serif;line-height:1.35}
.date{position:absolute;top:2.05in;right:0.9in;font:10.5pt Inter,Arial,sans-serif;color:#444}
.body{position:absolute;top:3.35in;left:0.9in;right:0.9in;font-size:11.5pt;line-height:1.55}
.body p{margin:0 0 0.16in}
.re{font:700 11.5pt Inter,Arial,sans-serif;margin-bottom:0.18in}`;
  const head1 = `<div class="lh">${head.logoUrl ? `<img src="${esc(head.logoUrl)}" alt="">` : ''}<div class="n">${esc(head.name)}</div>
<div class="a">${head.addressLines.map(esc).join('<br>')}${head.phone ? `<br>${esc(head.phone)}` : ''}${head.email ? `<br>${esc(head.email)}` : ''}${head.website ? `<br>${esc(head.website)}` : ''}</div></div>`;
  const html = letters.map(l => `<section class="page">${head1}
${l.to ? `<div class="to">${addrBlock(l.to)}</div>` : ''}<div class="date">${esc(dateText)}</div>
<div class="body">${l.subject ? `<div class="re">${esc(l.subject)}</div>` : ''}${paragraphs(l.body)}</div></section>`).join('');
  return { html, css };
}

/** 6x9 postcards, interleaved front/back per recipient so a duplex printer lines them up. */
export function postcardsHtml(
  cards: { to: MailingRow; message: string }[],
  front: { headline: string; sub: string; logoUrl?: string; businessName: string; accent: string },
  returnAddr: { name: string; lines: string[] },
) {
  const css = `@page{size:9in 6in;margin:0}
.pc{width:9in;height:6in;position:relative;page-break-after:always;overflow:hidden}
.pc:last-child{page-break-after:auto}
.f{background:linear-gradient(135deg,#0E0C13 0%,#2A0A3A 55%,${front.accent} 140%);color:#F2EEF6;padding:0.55in;display:flex;flex-direction:column;justify-content:space-between}
.f .h{font:800 34pt/1.05 'Bricolage Grotesque',Inter,Arial,sans-serif;letter-spacing:-0.02em;max-width:7.2in}
.f .s{font:500 14pt/1.4 Inter,Arial,sans-serif;max-width:6.4in;opacity:.92}
.f .b{display:flex;align-items:center;gap:12px;font:700 14pt Inter,Arial,sans-serif}
.f .b img{height:44px;width:auto;max-width:140px;object-fit:contain;background:#fff;border-radius:8px;padding:4px}
.k{padding:0.4in;display:grid;grid-template-columns:1fr 1px 3.6in;gap:0.3in;font-family:Inter,Arial,sans-serif}
.k .msg{font-size:11pt;line-height:1.5;white-space:pre-wrap;overflow:hidden}
.k .rule{background:#ccc}
.k .right{position:relative}
.k .ret{font-size:8.5pt;color:#444;line-height:1.35;position:absolute;top:0;left:0}
.k .stamp{position:absolute;top:0;right:0;width:0.9in;height:1in;border:1px dashed #999;font-size:7pt;color:#999;display:flex;align-items:center;justify-content:center;text-align:center}
.k .to{position:absolute;top:2.4in;left:0;font-size:12pt;line-height:1.4}`;
  const frontHtml = `<section class="pc f"><div class="h">${esc(front.headline)}</div><div class="s">${esc(front.sub)}</div>
<div class="b">${front.logoUrl ? `<img src="${esc(front.logoUrl)}" alt="">` : ''}${esc(front.businessName)}</div></section>`;
  const html = cards.map(c => `${frontHtml}<section class="pc k"><div class="msg">${esc(c.message)}</div><div class="rule"></div>
<div class="right"><div class="ret">${esc(returnAddr.name)}<br>${returnAddr.lines.map(esc).join('<br>')}</div><div class="stamp">Place<br>stamp<br>here</div>
<div class="to">${addrBlock(c.to)}</div></div></section>`).join('');
  return { html, css };
}

/** Avery 5160 / 8160: 3 x 10, 2-5/8" x 1". */
export function labelsHtml(rows: MailingRow[]) {
  const css = `@page{size:letter;margin:0}
.sheet{width:8.5in;padding:0.5in 0.19in 0;display:flex;flex-wrap:wrap;page-break-after:always}
.l{width:2.625in;height:1in;padding:0.1in 0.15in;font:9.5pt/1.25 Arial,sans-serif;margin-right:0.125in;overflow:hidden}
.l:nth-child(3n){margin-right:0}`;
  const sheets: string[] = [];
  for (let i = 0; i < rows.length; i += 30) {
    sheets.push(`<div class="sheet">${rows.slice(i, i + 30).map(r => `<div class="l">${addrBlock(r)}</div>`).join('')}</div>`);
  }
  return { html: sheets.join(''), css };
}

export interface MailJobSpec {
  format: 'postcard_6x9' | 'letter';
  quantity: number;
  size: string;
  copy: { front?: { headline: string; sub: string }; back?: string; subject?: string; body?: string; mergeFields: string[] };
  returnAddress: { name: string; address1: string; address2: string; city: string; state: string; zip: string };
  mailClass: 'usps_first_class' | 'usps_standard';
  list: (MailingRow & { message?: string })[];
  generatedAt: string;
  note: string;
}
