// givingPdf — real PDF contribution statements and per-gift donation receipts (pdf-lib, no DOM).
// Isomorphic: the Finance Hub uses it for "Download PDF" / emailed statements, the server uses it for
// the receipt attached to every online gift. Wording comes from chmsFinanceReports (NO_GOODS_TEXT) so the
// printed HTML, the PDF and the email always say the same thing.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { NO_GOODS_TEXT, money, type StatementData, type StatementOrg } from './chmsFinanceReports';

const W = 612, H = 792, M = 54;            // US Letter, 0.75in margins
const INK = rgb(0.07, 0.07, 0.07), SOFT = rgb(0.33, 0.33, 0.33), RULE = rgb(0.8, 0.8, 0.8);

// Standard fonts are WinAnsi-only: anything outside it (emoji, CJK…) would throw mid-render.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export const pdfSafe = (s: unknown): string => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/./gu, ch => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch) ? ch : '?';
});

interface Fonts { reg: PDFFont; bold: PDFFont; ital: PDFFont }
async function fontsOf(doc: PDFDocument): Promise<Fonts> {
  const [reg, bold, ital] = await Promise.all([doc.embedFont(StandardFonts.TimesRoman), doc.embedFont(StandardFonts.TimesRomanBold), doc.embedFont(StandardFonts.TimesRomanItalic)]);
  return { reg, bold, ital };
}

/** Greedy word wrap to `width` points. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of pdfSafe(text).split(' ').filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/** A cursor over pages: `need(h)` starts a new page when the next block won't fit. */
class Flow {
  page!: PDFPage; y = 0;
  constructor(private doc: PDFDocument, private f: Fonts, private onNewPage?: (fl: Flow) => void) { this.add(); }
  add() { this.page = this.doc.addPage([W, H]); this.y = H - M; this.onNewPage?.(this); }
  need(h: number) { if (this.y - h < M + 24) this.add(); }
  text(s: string, x: number, size = 11, font = this.f.reg, color = INK) { this.page.drawText(pdfSafe(s), { x, y: this.y, size, font, color }); }
  right(s: string, xRight: number, size = 11, font = this.f.reg, color = INK) { const t = pdfSafe(s); this.page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y: this.y, size, font, color }); }
  rule(thick = 0.6, color = RULE) { this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: thick, color }); }
  para(s: string, size = 11, font = this.f.reg, color = INK, gap = 4) {
    for (const ln of wrapText(s, font, size, W - 2 * M)) { this.need(size + gap); this.text(ln, M, size, font, color); this.y -= size + gap; }
  }
}

function orgHeader(fl: Flow, f: Fonts, org: StatementOrg, title: string, sub: string) {
  fl.text(org.legalName || org.name, M, 16, f.bold);
  fl.right(title, W - M, 14, f.bold);
  fl.y -= 15;
  const left = [org.ein ? `EIN ${org.ein}` : '', org.address || ''].filter(Boolean);
  fl.right(sub, W - M, 10, f.reg, SOFT);
  for (const l of left) { fl.text(l, M, 10, f.reg, SOFT); fl.y -= 12; }
  if (!left.length) fl.y -= 12;
  fl.y -= 2; fl.rule(1.4, INK); fl.y -= 22;
}

function footer(doc: PDFDocument, f: Fonts, label: string) {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = pdfSafe(`${label} · Page ${i + 1} of ${pages.length}`);
    p.drawText(t, { x: W - M - f.reg.widthOfTextAtSize(t, 8), y: M - 18, size: 8, font: f.reg, color: SOFT });
  });
}

type MemberSubtotal = { name: string; role: string; subtotal: number; giftCount: number };

function drawStatement(doc: PDFDocument, f: Fonts, s: StatementData & { memberSubtotals?: MemberSubtotal[] }, org: StatementOrg) {
  const sub = `${s.range.label} · ${s.range.from} to ${s.range.to}`;
  const cols = { date: M, fund: M + 80, type: M + 250, amt: W - M };
  const tableHead = (fl: Flow) => {
    fl.text('Date', cols.date, 10, f.bold); fl.text('Fund', cols.fund, 10, f.bold); fl.text('Type', cols.type, 10, f.bold); fl.right('Amount', cols.amt, 10, f.bold);
    fl.y -= 5; fl.rule(); fl.y -= 13;
  };
  let inTable = false;
  const fl = new Flow(doc, f, x => { orgHeader(x, f, org, 'Contribution Statement', sub); if (inTable) tableHead(x); });

  fl.text(s.name, M, 12, f.bold); fl.y -= 14;
  const a = s.address;
  const addr = a?.line1 ? [a.line1, a.line2, [[a.city, a.region].filter(Boolean).join(', '), a.postal].filter(Boolean).join(' ')].filter(Boolean) as string[] : [];
  if (addr.length) for (const l of addr) { fl.text(l, M, 11); fl.y -= 13; }
  else { fl.text('No mailing address on file', M, 10, f.ital, SOFT); fl.y -= 13; }
  fl.y -= 12;
  fl.para(org.intro || `Thank you for your generous support of ${org.name}.`);
  fl.y -= 10;

  inTable = true; fl.need(40); tableHead(fl);
  for (const l of s.lines) {
    fl.need(14);
    const type = `${l.method}${l.tribute ? ' · ' + l.tribute : ''}${l.inKind ? ' (in-kind: no value assigned)' : ''}`;
    const fundW = cols.type - cols.fund - 8, typeW = cols.amt - 70 - cols.type;
    fl.text(l.date, cols.date, 10);
    fl.text(wrapText(l.fund, f.reg, 10, fundW)[0] || '', cols.fund, 10);
    fl.text(wrapText(type, f.reg, 10, typeW)[0] || '', cols.type, 10);
    fl.right(money(l.amount), cols.amt, 10);
    fl.y -= 14;
  }
  inTable = false;
  fl.need(24); fl.y += 4; fl.rule(1.2, INK); fl.y -= 14;
  fl.text('Total contributions', M, 11, f.bold); fl.right(money(s.total), cols.amt, 11, f.bold); fl.y -= 26;

  const funds = Object.entries(s.byFund);
  if (funds.length) {
    fl.need(30); fl.text('Summary by fund', M, 11, f.bold); fl.y -= 15;
    for (const [name, v] of funds) { fl.need(14); fl.text(name, M, 10); fl.right(money(v), M + 300, 10); fl.y -= 13; }
    fl.y -= 8;
  }
  if (s.memberSubtotals && s.memberSubtotals.length > 1) {
    fl.need(30); fl.text('Household members', M, 11, f.bold); fl.y -= 15;
    for (const m of s.memberSubtotals) { fl.need(14); fl.text(`${m.name} (${m.role.toLowerCase()}) · ${m.giftCount} gift(s)`, M, 10); fl.right(money(m.subtotal), M + 300, 10); fl.y -= 13; }
    fl.y -= 8;
  }
  fl.y -= 6;
  fl.para(NO_GOODS_TEXT(!!org.faith), 10, f.ital, SOFT);
  if (org.statementFooter) { fl.y -= 4; fl.para(org.statementFooter, 10, f.ital, SOFT); }
}

/** One PDF holding every statement (each starts on a new page). */
export async function statementsPdf(stmts: Array<StatementData & { memberSubtotals?: MemberSubtotal[] }>, org: StatementOrg): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Contribution statements — ${org.legalName || org.name}`)); doc.setCreator('Plajah Elevate'); doc.setProducer('Plajah Elevate');
  const f = await fontsOf(doc);
  for (const s of stmts) drawStatement(doc, f, s, org);
  if (!stmts.length) { const fl = new Flow(doc, f); fl.text('No statements.', M, 12); }
  footer(doc, f, org.legalName || org.name);
  return doc.save();
}

// ── Per-gift receipts ──────────────────────────────────────────────────────────
export interface GiftReceipt {
  receiptNo: string; date: string; donorName: string; amount: number; fundName: string; method: string;
  /** Recurring gift note, e.g. "Monthly recurring gift". */
  note?: string;
  /** Donor-paid processing cover — not part of the deductible gift. */
  feeCovered?: number;
}

export async function receiptPdf(r: GiftReceipt, org: StatementOrg): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Donation receipt ${r.receiptNo}`)); doc.setCreator('Plajah Elevate'); doc.setProducer('Plajah Elevate');
  const f = await fontsOf(doc);
  const fl = new Flow(doc, f, x => orgHeader(x, f, org, 'Donation Receipt', `Receipt ${r.receiptNo}`));
  const row = (k: string, v: string, bold = false) => { fl.text(k, M, 11, f.reg, SOFT); fl.text(v, M + 150, 11, bold ? f.bold : f.reg); fl.y -= 17; };
  row('Received from', r.donorName, true);
  row('Date', r.date);
  row('Gift amount', money(r.amount), true);
  row('Fund', r.fundName);
  row('Method', r.method);
  if (r.note) row('Note', r.note);
  if (r.feeCovered && r.feeCovered > 0) row('Processing cover', `${money(r.feeCovered)} (paid by you; not part of the gift)`);
  fl.y -= 10;
  fl.para(`Thank you for your generous gift to ${org.name}.`);
  fl.y -= 8;
  fl.para(NO_GOODS_TEXT(!!org.faith).replace('these contributions', 'this contribution'), 10, f.ital, SOFT);
  fl.para('Please keep this receipt for your tax records. Your year-end contribution statement will list all of your gifts.', 10, f.ital, SOFT);
  if (org.statementFooter) fl.para(org.statementFooter, 10, f.ital, SOFT);
  footer(doc, f, org.legalName || org.name);
  return doc.save();
}

/** Uint8Array → base64 in both Node and the browser (no Buffer dependency in the client bundle). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(bin) : (globalThis as any).Buffer.from(bytes).toString('base64');
}

/** Browser download of PDF bytes. */
export function downloadPdf(filename: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
