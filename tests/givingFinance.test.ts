// Elevate giving: PDF statements/receipts, receipt wording, restricted-fund guardrails, fund-transfer journals.
// Run with: npm run test:giving
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { statementsPdf, receiptPdf, pdfSafe, wrapText, bytesToBase64 } from '../services/givingPdf';
import { receiptEmail, statementEmail, receiptNoOf, statementOrgOf, EMAIL_RE } from '../services/givingEmailCore';
import { restrictedOverdraw, checkTransfer, checkFundListChange, mergeFundLists } from '../services/restrictedFunds';
import { fundTransferEntry, isBalanced } from '../services/acctPosting';
import { fundBalanceData } from '../services/acctReports';
import { yearRange, type StatementData } from '../services/chmsFinanceReports';
import type { AcctAccount, AcctJournal, GivingFund } from '../types';

const ORG = statementOrgOf({ name: 'Grace Chapel', legalName: 'Grace Chapel Inc.', ein: '12-3456789', orgType: 'CHURCH', statementFooter: 'Thank you.' });
const stmt = (n: number): StatementData => ({
  key: `p:${n}`, name: `Giver ${n}`, personIds: [`p${n}`], linkedUids: [], range: yearRange(2025), total: n * 10,
  byFund: { General: n * 10 }, address: { line1: '1 Main St', city: 'Detroit', region: 'MI', postal: '48201' } as any,
  lines: Array.from({ length: n }, (_, i) => ({ date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, fund: 'General', amount: 10, method: 'CHECK' })),
});

describe('givingPdf', () => {
  test('statements PDF: valid, one statement per page break, long ledgers paginate', async () => {
    const bytes = await statementsPdf([stmt(3), stmt(120)], ORG);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 3, `expected the 120-gift statement to spill onto extra pages, got ${doc.getPageCount()}`);
  });
  test('receipt PDF is a one-page PDF and base64 starts with JVBER', async () => {
    const bytes = await receiptPdf({ receiptNo: 'R-1', date: '2025-03-02', donorName: 'Zoë 🙏 Smith', amount: 250, fundName: 'Missions', method: 'Online' }, ORG);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    assert.ok(bytesToBase64(bytes).startsWith('JVBER'));
  });
  test('pdfSafe keeps WinAnsi (é, —, ’) and replaces the rest', () => {
    assert.equal(pdfSafe('Zoë — it’s 🙏'), 'Zoë — it’s ?');
    assert.equal(pdfSafe('a\nb'), 'a b');
  });
  test('wrapText never exceeds the width except for a single long word', async () => {
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.TimesRoman);
    const lines = wrapText('No goods or services were provided in exchange for these contributions, other than intangible religious benefits.', f, 10, 150);
    assert.ok(lines.length > 1);
    for (const l of lines) assert.ok(f.widthOfTextAtSize(l, 10) <= 150 || !l.includes(' '));
  });
});

describe('givingEmailCore', () => {
  test('receipt email carries amount, fund, EIN and the intangible-religious-benefit wording', () => {
    const m = receiptEmail(ORG, { receiptNo: 'R-1', date: '2025-03-02', donorName: 'A <b>', amount: 300, fundName: 'Building', method: 'Online' });
    assert.match(m.subject, /\$300\.00/);
    assert.match(m.text, /Building/); assert.match(m.text, /12-3456789/); assert.match(m.text, /intangible religious benefits/);
    assert.ok(m.html.includes('A &lt;b&gt;'), 'donor name is escaped');
  });
  test('non-faith orgs drop the religious-benefit clause', () => {
    const m = statementEmail(statementOrgOf({ name: 'Food Bank', orgType: 'NONPROFIT' }), 'Sam', '2025', 50);
    assert.doesNotMatch(m.text, /religious/);
  });
  test('receipt numbers are stable per gift', () => {
    assert.equal(receiptNoOf('gift_o1_pi_123'), receiptNoOf('gift_o1_pi_123'));
    assert.notEqual(receiptNoOf('gift_o1_pi_123'), receiptNoOf('gift_o1_pi_124'));
  });
  test('email check', () => {
    assert.ok(EMAIL_RE.test('a@b.org')); assert.ok(!EMAIL_RE.test('a@b')); assert.ok(!EMAIL_RE.test('a b@c.org')); assert.ok(!EMAIL_RE.test('x@y.com, z@w.com'));
  });
});

const FUNDS: GivingFund[] = [
  { id: 'gen', name: 'General' } as GivingFund,
  { id: 'bld', name: 'Building', restricted: true } as GivingFund,
];

describe('restrictedFunds', () => {
  const bal = new Map([['gen', 100], ['bld', 500]]);
  test('spending within a restricted balance is fine; over it is blocked', () => {
    assert.equal(restrictedOverdraw(FUNDS, bal, 'bld', 500), null);
    assert.deepEqual(restrictedOverdraw(FUNDS, bal, 'bld', 650), { fundId: 'bld', fundName: 'Building', available: 500, short: 150 });
  });
  test('unrestricted, uncoded or unknown-balance spending is never blocked', () => {
    assert.equal(restrictedOverdraw(FUNDS, bal, 'gen', 10_000), null);
    assert.equal(restrictedOverdraw(FUNDS, bal, undefined, 10_000), null);
    assert.equal(restrictedOverdraw(FUNDS, undefined, 'bld', 10_000), null);
  });
  test('release out of a restricted fund needs purpose-met and a sufficient balance', () => {
    const [gen, bld] = FUNDS;
    assert.match(checkTransfer({ from: bld, to: gen, amount: 100, fromBalance: 500, purposeMet: false }) || '', /purpose/);
    assert.match(checkTransfer({ from: bld, to: gen, amount: 600, fromBalance: 500, purposeMet: true }) || '', /only holds/);
    assert.equal(checkTransfer({ from: bld, to: gen, amount: 500, fromBalance: 500, purposeMet: true }), null);
    assert.equal(checkTransfer({ from: gen, to: bld, amount: 9999, fromBalance: 0, purposeMet: false }), null);
  });
  test('a restricted fund holding money cannot be removed or unticked', () => {
    const by = (id: string) => bal.get(id) || 0;
    assert.match(checkFundListChange(FUNDS, [FUNDS[0]], by) || '', /can’t be removed/);
    assert.match(checkFundListChange(FUNDS, [FUNDS[0], { ...FUNDS[1], restricted: false }], by) || '', /can’t be lifted/);
    assert.equal(checkFundListChange(FUNDS, [FUNDS[0], { ...FUNDS[1], restricted: false }], () => 0), null);
    assert.equal(checkFundListChange(FUNDS, [{ ...FUNDS[0], restricted: true }, FUNDS[1]], by), null);
  });
  test('merge keeps a fund another editor added meanwhile', () => {
    const latest = [...FUNDS, { id: 'mis', name: 'Missions' } as GivingFund];
    assert.deepEqual(mergeFundLists(FUNDS, [FUNDS[0]], latest).map(f => f.id), ['gen', 'mis']);
  });
});

describe('fund transfer journal', () => {
  const accounts = [
    { id: 'na_u', code: '3000', name: 'NA w/o', type: 'NET_ASSET', subtype: 'unrestricted', active: true },
    { id: 'na_r', code: '3100', name: 'NA w/', type: 'NET_ASSET', subtype: 'restricted', active: true },
    { id: 'rev', code: '4000', name: 'Contributions', type: 'REVENUE', active: true },
    { id: 'exp', code: '5100', name: 'Supplies', type: 'EXPENSE', active: true },
    { id: 'cash', code: '1000', name: 'Cash', type: 'ASSET', active: true },
  ] as unknown as AcctAccount[];
  const j = (id: string, date: string, lines: AcctJournal['lines']): AcctJournal => ({ id, orgId: 'o', date, period: date.slice(0, 7), memo: id, lines, source: { kind: 'MANUAL' }, status: 'POSTED', createdBy: 'u', createdAt: 0 });
  test('release moves balance from the restricted fund to the unrestricted one', () => {
    const draft = fundTransferEntry({ restricted: 'na_r', unrestricted: 'na_u' }, { pairId: 'p1', date: '2025-05-01', amount: 200, from: FUNDS[1], to: FUNDS[0], memo: 'Release' });
    assert.ok(isBalanced(draft.lines));
    assert.equal(draft.key, 'transfer:p1');
    const journals = [
      j('g', '2025-01-05', [{ accountId: 'cash', debit: 500, credit: 0 }, { accountId: 'rev', debit: 0, credit: 500, fundId: 'bld' }]),
      { ...draft, id: 't', orgId: 'o', status: 'POSTED', createdBy: 'u', createdAt: 0 } as AcctJournal,
    ];
    const bal = new Map(fundBalanceData({ accounts, journals, funds: FUNDS, ministries: [] }, { from: '0000-01-01', to: '9999-12-31', label: 'all' }).map(f => [f.fundId, f.end]));
    assert.equal(bal.get('bld'), 300);
    assert.equal(bal.get('gen'), 200);
  });
});
