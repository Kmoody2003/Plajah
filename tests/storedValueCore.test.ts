// storedValueCore: codes, ledger ops, CAS concurrency, idempotency, limits, tenders, refund interplay, Z report, liability.
// Run with: npm run test:stored
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { memoryCasStore } from '../services/casCore';
import {
  generateCode, normalizeCode, formatCode, checkChar, codeFromScan, applyOp, maxRedeemable, rateCheck, ledgerEntryId,
  buildLiabilityReport, searchCards, DEFAULT_LIMITS, type LedgerOp,
} from '../services/storedValueCore';
import { validateTenders } from '../services/tenderCore';
import { planRefund } from '../services/refundCore';
import { buildZReport, normalizeOrder } from '../services/drawerCore';

const NOW = 1_800_000_000_000;
const issue = (kind: any = 'GIFT', cents = 5000, extra: Partial<LedgerOp> = {}): LedgerOp => ({ type: 'ISSUE', idemKey: 'iss1', now: NOW, init: { kind, last4: 'ABCD', initialCents: cents }, ...extra });
const mk = async (kind: any = 'GIFT', cents = 5000) => { const s = memoryCasStore(); const r = await applyOp(s, 'c1', issue(kind, cents)); assert.equal(r.ok, true); return s; };
const redeem = (cents: number, k: string): LedgerOp => ({ type: 'REDEEM', idemKey: k, amountCents: cents, now: NOW + 1 });

describe('codes', () => {
  test('16 chars, grouped 4-4-4-4, validates round trip, unguessable (no repeats in 2000)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) { const c = generateCode(n => randomBytes(n)); assert.equal(c.length, 16); assert.equal(normalizeCode(formatCode(c)), c); seen.add(c); }
    assert.equal(seen.size, 2000);
    assert.match(formatCode(generateCode(n => randomBytes(n))), /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  });
  test('check char catches nearly every single-char typo; folds I/L/O, case and spaces', () => {
    const c = generateCode(n => randomBytes(n));
    let caught = 0, tried = 0;
    for (let i = 0; i < 16; i++) for (const ch of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') if (ch !== c[i]) { tried++; if (normalizeCode(c.slice(0, i) + ch + c.slice(i + 1)) === null) caught++; }
    assert.ok(caught / tried > 0.97, `caught ${caught}/${tried}`);
    assert.equal(normalizeCode(c.toLowerCase().replace(/(.{4})/g, '$1 ')), c);
    assert.equal(normalizeCode('short'), null); assert.equal(normalizeCode(''), null); assert.equal(normalizeCode(null), null);
    const body = '0123456789ABCDE'; const full = body + checkChar(body);
    assert.equal(normalizeCode(full), full);
  });
  test('QR payload: plain code or a link with gc=', () => {
    const c = generateCode(n => randomBytes(n));
    assert.equal(codeFromScan(c), c); assert.equal(codeFromScan(`https://x.app/gc?gc=${formatCode(c)}`), c); assert.equal(codeFromScan('https://x.app/'), null);
  });
});

describe('ledger ops', () => {
  test('issue then partial redemptions; never below zero', async () => {
    const s = await mk('GIFT', 5000);
    const a = await applyOp(s, 'c1', redeem(1200, 'r1')); assert.ok(a.ok && a.balanceCents === 3800);
    const b = await applyOp(s, 'c1', redeem(4000, 'r2')); assert.ok(!b.ok && b.code === 'INSUFFICIENT' && b.balanceCents === 3800);
    const c = await applyOp(s, 'c1', redeem(3800, 'r3')); assert.ok(c.ok && c.balanceCents === 0);
    const d = await applyOp(s, 'c1', redeem(1, 'r4')); assert.ok(!d.ok);
    assert.equal(s.docs.get('c1')!.data.balanceCents, 0);
  });
  test('idempotency: same key replays the original entry and never double-applies', async () => {
    const s = await mk();
    const a = await applyOp(s, 'c1', redeem(1000, 'sale1_0')); const b = await applyOp(s, 'c1', redeem(1000, 'sale1_0'));
    assert.ok(a.ok && b.ok && !a.duplicate && b.duplicate && b.balanceCents === 4000 && b.entry.at === a.entry.at);
    assert.equal(s.docs.get('c1')!.data.balanceCents, 4000);
    const again = await applyOp(s, 'c1', issue()); assert.ok(again.ok && again.duplicate);
  });
  test('concurrent redemptions cannot overdraw (CAS)', async () => {
    const s = await mk('GIFT', 5000);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => applyOp(s, 'c1', redeem(1000, `p${i}`))));
    assert.equal(rs.filter(r => r.ok).length, 5);
    assert.equal(s.docs.get('c1')!.data.balanceCents, 0);
  });
  test('concurrent identical key applies once', async () => {
    const s = await mk('GIFT', 5000);
    await Promise.all(Array.from({ length: 6 }, () => applyOp(s, 'c1', redeem(1000, 'same'))));
    assert.equal(s.docs.get('c1')!.data.balanceCents, 4000);
  });
  test('reload: limits, max balance, credit not reloadable; wallet may start at 0', async () => {
    const w = await mk('WALLET', 0);
    assert.ok((await applyOp(w, 'c1', { type: 'RELOAD', idemKey: 'a', amountCents: 100, now: NOW })).ok === false);
    assert.ok((await applyOp(w, 'c1', { type: 'RELOAD', idemKey: 'b', amountCents: 2000, now: NOW })).ok);
    const big = await applyOp(w, 'c1', { type: 'RELOAD', idemKey: 'c', amountCents: DEFAULT_LIMITS.maxBalanceCents, now: NOW }); assert.ok(!big.ok && big.code === 'LIMIT');
    const cr = await mk('CREDIT', 1000); const r = await applyOp(cr, 'c1', { type: 'RELOAD', idemKey: 'x', amountCents: 1000, now: NOW }); assert.ok(!r.ok && r.code === 'BAD_KIND');
    assert.ok(!(await applyOp(memoryCasStore(), 'z', issue('GIFT', 100))).ok);
    assert.ok(!(await applyOp(memoryCasStore(), 'z', issue('GIFT', 0))).ok);
  });
  test('void and adjust need a reason; void zeroes; voided cards cannot redeem or restore', async () => {
    const s = await mk();
    assert.ok(!(await applyOp(s, 'c1', { type: 'VOID', idemKey: 'v0', now: NOW })).ok);
    const v = await applyOp(s, 'c1', { type: 'VOID', idemKey: 'v1', reason: 'lost', now: NOW }); assert.ok(v.ok && v.entry.deltaCents === -5000 && v.balanceCents === 0);
    assert.ok(!(await applyOp(s, 'c1', redeem(1, 'q'))).ok);
    const rr = await applyOp(s, 'c1', { type: 'REFUND_RESTORE', idemKey: 'rs', amountCents: 100, now: NOW }); assert.ok(!rr.ok && rr.code === 'VOID');
    const s2 = await mk();
    assert.ok(!(await applyOp(s2, 'c1', { type: 'ADJUST', idemKey: 'a1', amountCents: -100, now: NOW })).ok);
    assert.ok(!(await applyOp(s2, 'c1', { type: 'ADJUST', idemKey: 'a2', amountCents: -9999, reason: 'x', now: NOW })).ok);
    const ok = await applyOp(s2, 'c1', { type: 'ADJUST', idemKey: 'a3', amountCents: -500, reason: 'typo at issue', now: NOW }); assert.ok(ok.ok && ok.balanceCents === 4500);
  });
  test('refund restore adds back to the same card', async () => {
    const s = await mk('GIFT', 5000);
    await applyOp(s, 'c1', redeem(5000, 'r1'));
    const r = await applyOp(s, 'c1', { type: 'REFUND_RESTORE', idemKey: 'rf1', amountCents: 2000, ref: 'rf_1', now: NOW }); assert.ok(r.ok && r.balanceCents === 2000);
  });
  test('expiry is opt-in: no expiresAt never expires; expired cannot redeem; EXPIRE zeroes', async () => {
    const never = await mk(); assert.ok((await applyOp(never, 'c1', { ...redeem(100, 'k'), now: NOW + 10 * 365 * 86_400_000 })).ok);
    const s = memoryCasStore();
    await applyOp(s, 'e', issue('GIFT', 5000, { init: { kind: 'GIFT', last4: 'ZZZZ', initialCents: 5000, expiresAt: NOW + 1000 } }));
    const late = await applyOp(s, 'e', { ...redeem(100, 'k'), now: NOW + 5000 }); assert.ok(!late.ok && late.code === 'EXPIRED');
    assert.ok(!(await applyOp(s, 'e', { type: 'EXPIRE', idemKey: 'x0', now: NOW })).ok);
    const ex = await applyOp(s, 'e', { type: 'EXPIRE', idemKey: 'x1', now: NOW + 5000 }); assert.ok(ex.ok && ex.balanceCents === 0);
  });
  test('maxRedeemable is capped at both balance and ticket total', () => {
    const c = { status: 'ACTIVE' as const, balanceCents: 5000 };
    assert.equal(maxRedeemable(c, 3000, NOW), 3000); assert.equal(maxRedeemable(c, 9000, NOW), 5000);
    assert.equal(maxRedeemable({ ...c, status: 'VOID' as const }, 3000, NOW), 0); assert.equal(maxRedeemable({ ...c, balanceCents: 0 }, 3000, NOW), 0);
  });
  test('ledger entry id is deterministic and safe', () => { assert.equal(ledgerEntryId('c1', 'sale/1:0'), 'c1_sale10'); });
});

describe('rate limit', () => {
  test('blocks after max in window, resets after window', () => {
    let st; let blocked = 0;
    for (let i = 0; i < 15; i++) { const r = rateCheck(st, NOW + i, { max: 10, windowMs: 1000 }); st = r.state; if (!r.allowed) blocked++; }
    assert.equal(blocked, 5);
    assert.ok(rateCheck(st, NOW + 5000, { max: 10, windowMs: 1000 }).allowed);
  });
});

describe('tenders + refunds + Z report', () => {
  const code = generateCode(n => randomBytes(n));
  test('stored-value tenders validate; GIFT needs a valid code; cannot pay for gift cards with stored value', () => {
    const ok = validateTenders([{ type: 'GIFT', amountCents: 500, code: formatCode(code) }, { type: 'CASH', amountCents: 500 }], 1000);
    assert.ok(ok.ok && ok.tenders[0].code === code);
    assert.equal(validateTenders([{ type: 'GIFT', amountCents: 1000 }], 1000).ok, false);
    assert.equal(validateTenders([{ type: 'GIFT', amountCents: 1000, code: 'AAAA-BBBB-CCCC-DDDD' }], 1000).ok, false);
    assert.equal(validateTenders([{ type: 'WALLET', amountCents: 1000 }], 1000).ok, true);
    assert.equal(validateTenders([{ type: 'STORE_CREDIT', amountCents: 1000 }], 1000, { storedValueMaxCents: 0 }).ok, false);
    assert.equal(validateTenders([{ type: 'STORE_CREDIT', amountCents: 400 }, { type: 'CASH', amountCents: 600 }], 1000, { storedValueMaxCents: 400 }).ok, true);
  });
  const line = { productId: 'p', title: 'Tee', qty: 1, chargeCents: 1000, taxCents: 0 };
  test('refund: SNAP never to store credit; gift tender never to cash; gift goes back to its tender', () => {
    const snap = planRefund({ lines: [line], tenders: [{ type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 1000 }] }, [], { lines: [{ index: 0, qty: 1 }], method: 'STORE_CREDIT' });
    assert.equal(snap.ok, false);
    const gift = [{ type: 'GIFT' as const, amountCents: 1000 }];
    assert.equal(planRefund({ lines: [line], tenders: gift }, [], { lines: [{ index: 0, qty: 1 }], method: 'CASH' }).ok, false);
    const sc = planRefund({ lines: [line], tenders: gift }, [], { lines: [{ index: 0, qty: 1 }], method: 'STORE_CREDIT' }); assert.ok(sc.ok);
    const orig = planRefund({ lines: [line], tenders: gift }, [], { lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL' });
    assert.ok(orig.ok && orig.plan.allocations[0].type === 'GIFT' && orig.plan.allocations[0].tenderIndex === 0);
  });
  test('Z report: gift-card sale is liability not revenue, redemption is a tender, credit issued counted, no double count', () => {
    const base = { createdAt: NOW, taxCents: 0, tipCents: 0, discountCents: 0 };
    const sellOrder = normalizeOrder({ ...base, id: 'o1', subtotalCents: 0, totalCents: 0, storedValueSoldCents: 5000, tenders: JSON.stringify([{ type: 'CASH', amountCents: 5000 }]), items: '[]' });
    const spendOrder = normalizeOrder({ ...base, id: 'o2', subtotalCents: 3000, totalCents: 3000, tenders: JSON.stringify([{ type: 'GIFT', amountCents: 2000 }, { type: 'CASH', amountCents: 1000 }]), items: JSON.stringify([{ productId: 'p', title: 'Tee', qty: 1, chargeCents: 3000, taxCents: 0 }]) });
    const z = buildZReport([sellOrder, spendOrder], [{ id: 'r', createdAt: NOW, amountCents: 500, taxCents: 0, allocations: [{ type: 'STORE_CREDIT', amountCents: 500 }] }], [], 0, { from: NOW - 1, to: NOW + 1 });
    assert.equal(z.grossSalesCents, 3000); assert.equal(z.netSalesCents, 2500);
    assert.deepEqual(z.storedValue, { soldCents: 5000, redeemedCents: 2000, creditIssuedCents: 500 });
    assert.equal(z.cash.salesCents, 6000);
    assert.equal(z.byTender.find(t => t.key === 'GIFT')!.salesCents, 2000);
  });
});

describe('back office', () => {
  const cards: any[] = [
    { id: 'a', kind: 'GIFT', status: 'ACTIVE', balanceCents: 3000, last4: 'AB12', createdAt: NOW, updatedAt: NOW },
    { id: 'b', kind: 'WALLET', status: 'ACTIVE', balanceCents: 1000, last4: 'CD34', createdAt: NOW - 400 * 86_400_000, updatedAt: NOW - 400 * 86_400_000, customerUid: 'u9' },
    { id: 'c', kind: 'CREDIT', status: 'VOID', balanceCents: 0, last4: 'EF56', createdAt: NOW },
  ];
  test('liability report: outstanding excludes void/zero; period sums; breakage is data only', () => {
    const led = [{ type: 'ISSUE' as const, deltaCents: 4000, at: NOW }, { type: 'REDEEM' as const, deltaCents: -1000, at: NOW }, { type: 'REDEEM' as const, deltaCents: -999, at: NOW - 10_000_000_000 }];
    const r = buildLiabilityReport(cards, led, { from: NOW - 1000, to: NOW + 1000 }, NOW);
    assert.equal(r.outstandingCents, 4000); assert.equal(r.activeCards, 2); assert.equal(r.issuedCents, 4000); assert.equal(r.redeemedCents, 1000);
    assert.deepEqual(r.breakage, { dormantDays: 365, dormantCards: 1, dormantCents: 1000 });
  });
  test('search by last4 / customer', () => { assert.equal(searchCards(cards, 'cd34').length, 1); assert.equal(searchCards(cards, 'u9')[0].id, 'b'); assert.equal(searchCards(cards, '').length, 3); });
});
