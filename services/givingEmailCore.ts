// givingEmailCore — PURE wording for donation receipt and contribution-statement emails (no I/O).
// The PDF (services/givingPdf.ts) is the tax document; the email body repeats the essentials so a donor
// who never opens the attachment still has a contemporaneous written acknowledgment.
import { NO_GOODS_TEXT, money, type StatementOrg } from './chmsFinanceReports';
import type { GiftReceipt } from './givingPdf';
import { isFaithOrg } from './elevateTemplates';
import type { OrgType } from '../types';

/** The org fields a statement/receipt prints, from an Organization doc (client object or server REST read). */
export function statementOrgOf(org: { name?: string; legalName?: string; ein?: string; statementFooter?: string; orgType?: OrgType; location?: { address?: string; city?: string }; financeSettings?: { statementIntro?: string } }): StatementOrg {
  const loc = org.location;
  return {
    name: org.name || 'Organization', legalName: org.legalName, ein: org.ein, statementFooter: org.statementFooter, intro: org.financeSettings?.statementIntro,
    address: loc?.address ? `${loc.address}${loc.city ? ', ' + loc.city : ''}` : undefined, faith: isFaithOrg(org.orgType),
  };
}

export const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

export interface GivingMail { subject: string; text: string; html: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function shell(org: StatementOrg, title: string, body: string, single = false): string {
  const noGoods = single ? NO_GOODS_TEXT(!!org.faith).replace('these contributions', 'this contribution') : NO_GOODS_TEXT(!!org.faith);
  return `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:Georgia,'Times New Roman',serif;color:#111;padding:24px 12px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0;font-size:18px;font-weight:bold">${esc(org.legalName || org.name)}</p>${org.ein ? `<p style="margin:2px 0 0;font-size:12px;color:#555">EIN ${esc(org.ein)}</p>` : ''}
<h1 style="font-size:16px;margin:18px 0 12px;border-top:2px solid #111;padding-top:12px">${esc(title)}</h1>${body}
<p style="font-size:12px;color:#444;font-style:italic;margin-top:18px">${esc(noGoods)}</p>${org.statementFooter ? `<p style="font-size:12px;color:#444;font-style:italic">${esc(org.statementFooter)}</p>` : ''}
</div></body></html>`;
}

export function receiptEmail(org: StatementOrg, r: GiftReceipt): GivingMail {
  const rows: Array<[string, string]> = [['Received from', r.donorName], ['Date', r.date], ['Gift amount', money(r.amount)], ['Fund', r.fundName], ['Method', r.method], ['Receipt', r.receiptNo]];
  if (r.note) rows.push(['Note', r.note]);
  if (r.feeCovered && r.feeCovered > 0) rows.push(['Processing cover', `${money(r.feeCovered)} (paid by you; not part of the gift)`]);
  const table = `<table style="font-size:14px;border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:4px 0;color:#555;width:150px">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`;
  return {
    subject: `Your gift receipt — ${money(r.amount)} to ${org.name}`,
    text: [`Thank you for your gift to ${org.name}.`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', NO_GOODS_TEXT(!!org.faith).replace('these contributions', 'this contribution'), org.statementFooter || '', '', `${org.legalName || org.name}${org.ein ? ` · EIN ${org.ein}` : ''}`].join('\n').trim(),
    html: shell(org, 'Donation receipt', `<p style="font-size:14px">Thank you for your generous gift to ${esc(org.name)}. Please keep this receipt for your tax records; a PDF copy is attached.</p>${table}`, true),
  };
}

export function statementEmail(org: StatementOrg, name: string, rangeLabel: string, total: number): GivingMail {
  return {
    subject: `Your ${rangeLabel} giving statement — ${org.legalName || org.name}`,
    text: [`Dear ${name},`, '', `Thank you for your generous support of ${org.name}. Your ${rangeLabel} contribution statement is attached as a PDF.`, `Total contributions: ${money(total)}`, '', NO_GOODS_TEXT(!!org.faith), org.statementFooter || ''].join('\n').trim(),
    html: shell(org, `${rangeLabel} contribution statement`, `<p style="font-size:14px">Dear ${esc(name)},</p><p style="font-size:14px">Thank you for your generous support of ${esc(org.name)}. Your ${esc(rangeLabel)} contribution statement is attached as a PDF for your tax records.</p><p style="font-size:14px"><b>Total contributions: ${esc(money(total))}</b></p>`),
  };
}

/** Short human receipt number from a gift doc id (stable, so a resend shows the same number). */
export const receiptNoOf = (giftId: string): string => {
  let h = 0; for (const c of giftId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `R-${h.toString(36).toUpperCase().padStart(7, '0')}`;
};
