// npm run test:laundry - weighed pricing, scale parsing, Code 128, bag tags/rack, due times, reminders,
// delivery routes, wallet promo, commercial invoicing/aging/schedules, laundry settings + ticket seams.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundWeight, netWeight, quoteWeighIn, validatePricing, parseScaleLine, parseBleWeightMeasurement, createStabilizer, produceTotalCents, quoteToTicketLines, type WeighPricing,
} from '../services/weighedCore';
import { code128Symbols, code128Widths, code128DecodeWidths, code128Svg, CODE128_PATTERNS, isCode128B } from '../services/code128';
import {
  makeTagCodes, parseTagCode, parseScan, tagRows, pickUpTags, setBagMissing, bagsOutstanding, whereIs, suggestRack, cleanRack, tagLabels,
  computeDueAt, addBusinessMinutes, nextOpenAt, isOpenAt, rushEligible, DEFAULT_TURNAROUND, unclaimedActions, coveredDays, readyAtOf,
  deliveryFeeCents, routeStops, routeListHtml, laundryPublicExtras, dueAtOf, hasBulkyLines, type WeekHours,
} from '../services/laundryCore';
import { computeTopUpBonus, cleanPromo, walletNudge, nextTierHint, bonusIdemKey, DEFAULT_PROMO, type WalletPromo } from '../services/walletPromoCore';
import {
  cleanAccount, expandSchedule, draftTicketFor, buildInvoice, applyInvoicePayment, voidInvoice, agingBuckets, buildStatement, statementHtml, invoiceHtml, billableTickets,
  invoiceBalance, serializeInvoice, parseInvoice, serializeAccount, parseAccount, invoiceNumber, type CommercialAccount, type Invoice,
} from '../services/commercialCore';
import { cleanLaundrySettings, DEFAULT_LAUNDRY } from '../services/laundryDefaults';
import { LAUNDRY_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { validateConfig, newTicket, cleanLine, applyTransition, addDeposit, toPublicView, computeTicketTotals, serializeTicket, parseTicket, type Ticket } from '../services/ticketCore';
import { parseTaxSettings } from '../services/taxCore';
import { renderTicketPage } from '../services/ticketPublicPage';

const cfg = LAUNDRY_TICKET;
const P: WeighPricing = { label: 'Wash & fold', bands: [{ upToLb: 40, centsPerLb: 185 }, { centsPerLb: 165 }], minimumChargeCents: 1850, taxClass: 'SERVICE' };
const T0 = Date.UTC(2026, 9, 5, 15, 0); // Mon 2026-10-05 15:00 UTC
const DAY = 86_400_000, H = 3_600_000;

function mk(seq: number, subject: Record<string, any> = {}, path: string[] = [], opts: { lines?: any[]; now?: number; name?: string; assigned?: boolean } = {}): Ticket {
  let t = newTicket(cfg, { id: `tk${seq}`, seq, businessUid: 'b1', packId: 'laundromat', customer: { name: opts.name || 'Jo Marsh', phone: '555-0100' }, subject, by: 'tester', now: opts.now ?? T0 });
  (opts.lines || []).forEach((l, i) => { const r = cleanLine(cfg, l, `l${i + 1}`); if (r.line) t = { ...t, lines: [...t.lines, r.line] }; });
  path.forEach((s, i) => { t = applyTransition(t, cfg, s, 'tester', { now: (opts.now ?? T0) + (i + 1) * H }); });
  if (opts.assigned) t = { ...t, assignedTo: { id: 'drv1', name: 'Dee Driver' } };
  return t;
}

describe('weighed pricing', () => {
  test('rounding to 0.1 lb is float safe', () => {
    assert.equal(roundWeight(12.35), 12.4); assert.equal(roundWeight(12.34), 12.3); assert.equal(roundWeight(12.31, 0.1, 'up'), 12.4); assert.equal(roundWeight(12.39, 0.1, 'down'), 12.3);
    assert.equal(roundWeight(0.1 + 0.2), 0.3);
    assert.equal(roundWeight(-4), 0);
  });
  test('tare: fixed + per bag, floors at zero', () => {
    assert.deepEqual(netWeight(20, { tareLb: 1, bags: 2, tarePerBagLb: 0.5 }), { grossLb: 20, tareLb: 2, netLb: 18 });
    assert.equal(netWeight(1, { tareLb: 5 }).netLb, 0);
  });
  test('single band, minimum charge top-up shows as its own line', () => {
    const q = quoteWeighIn({ grossLb: 6, pricing: { bands: [{ centsPerLb: 185 }], minimumChargeCents: 1850 } });
    assert.equal(q.ok, true); assert.equal(q.minimumChargeApplied, true); assert.equal(q.subtotalCents, 1850);
    assert.deepEqual(q.lines.map(l => l.kind), ['BY_WEIGHT', 'FEE']); assert.equal(q.lines[0].grossCents, 1110); assert.equal(q.lines[1].grossCents, 740);
  });
  test('marginal tiers split into one BY_WEIGHT line per band', () => {
    const q = quoteWeighIn({ grossLb: 52.4, pricing: P });
    assert.equal(q.lines.length, 2); assert.equal(q.lines[0].qty, 40); assert.equal(q.lines[1].qty, 12.4);
    assert.equal(q.subtotalCents, 40 * 185 + Math.round(12.4 * 165));
    assert.match(q.lines[0].description, /first 40 lb/); assert.match(q.lines[1].description, /over 40 lb/);
  });
  test('minimum billable weight (15 lb minimum)', () => {
    const q = quoteWeighIn({ grossLb: 9.2, pricing: { bands: [{ centsPerLb: 200 }], minimumLb: 15 } });
    assert.equal(q.billableLb, 15); assert.equal(q.minimumLbApplied, true); assert.equal(q.subtotalCents, 3000); assert.match(q.lines[0].description, /15 lb minimum/);
    assert.equal(quoteWeighIn({ grossLb: 20, pricing: { bands: [{ centsPerLb: 200 }], minimumLb: 15 } }).minimumLbApplied, false);
  });
  test('add-ons: per lb, per item, flat, percent; pieces by the item', () => {
    const q = quoteWeighIn({
      grossLb: 20, pricing: { bands: [{ centsPerLb: 200 }], taxClass: 'SERVICE' },
      addons: [{ def: { key: 'rush', label: 'Rush', mode: 'PER_LB', cents: 100 } }, { def: { key: 'hypo', label: 'Free & clear', mode: 'FLAT', cents: 300 } }, { def: { key: 'p', label: 'Pct', mode: 'PCT', pct: 10 } }, { def: { key: 'it', label: 'Item', mode: 'PER_ITEM', cents: 50 }, qty: 3 }],
      pieces: [{ def: { key: 'cq', label: 'Comforter, queen', cents: 2200 }, qty: 2 }],
    });
    assert.equal(q.weightChargeCents, 4000);
    const by = Object.fromEntries(q.lines.map(l => [l.key, l.grossCents]));
    assert.equal(by.rush, 2000); assert.equal(by.hypo, 300); assert.equal(by.p, 400); assert.equal(by.it, 150); assert.equal(by.cq, 4400);
    assert.equal(q.subtotalCents, 4000 + 2000 + 300 + 400 + 150 + 4400);
    assert.ok(q.lines.every(l => l.taxClass === 'SERVICE'));
  });
  test('pieces only (no weight) is allowed; empty is not', () => {
    assert.equal(quoteWeighIn({ grossLb: 0, pricing: P, pieces: [{ def: { key: 'k', label: 'King', cents: 2800 }, qty: 1 }] }).subtotalCents, 2800);
    const e = quoteWeighIn({ grossLb: 0, pricing: P }); assert.equal(e.ok, false); assert.ok(e.errors.length);
  });
  test('bad pricing is rejected', () => {
    assert.ok(validatePricing({ bands: [] }).length); assert.ok(validatePricing({ bands: [{ upToLb: 10, centsPerLb: 100 }] }).length);
    assert.ok(validatePricing({ bands: [{ upToLb: 20, centsPerLb: 1 }, { upToLb: 10, centsPerLb: 1 }, { centsPerLb: 1 }] }).length);
    assert.equal(quoteWeighIn({ grossLb: 10, pricing: { bands: [] } }).ok, false);
  });
  test('quote lines flow into ticket lines and totals via taxCore', () => {
    const q = quoteWeighIn({ grossLb: 12.5, pricing: P });
    let t = mk(1);
    quoteToTicketLines(q).forEach((l, i) => { const r = cleanLine(cfg, l, `w${i}`); assert.ok(r.line, r.error); t = { ...t, lines: [...t.lines, r.line!] }; });
    const tax = parseTaxSettings({ defaultRateBps: 825, rates: { SERVICE: 0 } });
    assert.equal(computeTicketTotals(t, cfg, tax).approved.subtotalCents, q.subtotalCents);
    assert.equal(computeTicketTotals(t, cfg, tax).approved.taxCents, 0);
    const tax2 = parseTaxSettings({ defaultRateBps: 825, rates: { SERVICE: 825 } });
    assert.equal(computeTicketTotals(t, cfg, tax2).approved.taxCents, Math.round(q.subtotalCents * 0.0825));
  });
  test('produce total', () => { assert.equal(produceTotalCents(1.236, 299), Math.round(1.24 * 299)); });
});

describe('scale parsing', () => {
  test('common serial formats', () => {
    const a = parseScaleLine('ST,GS,  12.50 lb')!; assert.equal(a.weightLb, 12.5); assert.equal(a.stable, true);
    const b = parseScaleLine('US,GS,  12.50lb')!; assert.equal(b.stable, false);
    assert.equal(parseScaleLine('  12.5 lb\r\n')!.weightLb, 12.5);
    const kg = parseScaleLine('+00012.50 kg')!; assert.equal(kg.unit, 'kg'); assert.equal(kg.weightLb, 27.558);
    assert.equal(parseScaleLine('WT:  0.250 kg')!.unit, 'kg');
    assert.equal(parseScaleLine('S S     500.0 g')!.stable, true);
    assert.equal(parseScaleLine('\x02  12.50\x0d')!.assumedUnit, true);
    assert.equal(parseScaleLine('16 oz')!.weightLb, 1);
    assert.equal(parseScaleLine('-0.20 lb')!.negative, true);
  });
  test('garbage never throws', () => {
    for (const g of ['', '   ', 'ERR', 'OL', null as any, undefined as any, '\x00\x01', 'N/A kg?', '99999999 lb']) assert.equal(parseScaleLine(g), null);
  });
  test('BLE weight measurement (GATT 0x2A9D)', () => {
    const kg = parseBleWeightMeasurement([0x00, 0x88, 0x13])!; assert.equal(kg.unit, 'kg'); assert.equal(kg.value, 25); // 0x1388 = 5000 * 0.005
    const lb = parseBleWeightMeasurement([0x01, 0xb8, 0x0b])!; assert.equal(lb.unit, 'lb'); assert.equal(lb.weightLb, 30); // 3000 * 0.01
    assert.equal(parseBleWeightMeasurement([0, 0xff, 0xff]), null); assert.equal(parseBleWeightMeasurement([1]), null);
  });
  test('stabilizer needs consecutive close readings and ignores motion', () => {
    const s = createStabilizer({ needed: 3, tolLb: 0.05 }); const r = (w: number, st: boolean | null = null) => ({ weightLb: w, value: w, unit: 'lb' as const, assumedUnit: false, stable: st, negative: false, raw: '' });
    assert.equal(s.push(r(10)).stable, false); assert.equal(s.push(r(10.02)).stable, false); assert.equal(s.push(r(10.01)).stable, true);
    assert.equal(s.push(r(12, false)).stable, false); assert.equal(s.push(r(10.5)).stable, false);
    assert.equal(s.push(null).stable, false);
    assert.equal(createStabilizer().push(r(9, true)).stable, true);
  });
});

describe('code 128', () => {
  test('pattern table is sane (sum 11, unique, 106 symbols)', () => {
    assert.equal(CODE128_PATTERNS.length, 106);
    for (const p of CODE128_PATTERNS) { assert.equal(p.length, 6); assert.equal([...p].reduce((n, c) => n + Number(c), 0), 11, p); }
    assert.equal(new Set(CODE128_PATTERNS).size, 106);
  });
  test('known symbol values and checksum', () => {
    // Code B: start 104, 'P'=48 'J'=42 'J'=42 '1'=17 '2'=18 '3'=19 'C'=35; checksum = (104 + sum(v*i)) mod 103
    const sy = code128Symbols('PJJ123C')!; assert.deepEqual(sy.slice(0, 8), [104, 48, 42, 42, 17, 18, 19, 35]);
    assert.equal(sy[8], (104 + 48 * 1 + 42 * 2 + 42 * 3 + 17 * 4 + 18 * 5 + 19 * 6 + 35 * 7) % 103);
  });
  test('encode/decode every tag shape', () => {
    for (const s of ['WF-217-2', 'RO-1042', 'A', 'hello world ~', 'WF-99999-12']) {
      const w = code128Widths(s)!; assert.equal(code128DecodeWidths(w), s);
      assert.equal(w.reduce((a, b) => a + b, 0) % 1, 0);
    }
    assert.equal(code128Widths('bad\x01char'), null); assert.equal(isCode128B(''), false);
  });
  test('svg has bars, escapes label', () => {
    const svg = code128Svg('WF-1-1', { label: true }); assert.match(svg, /^<svg/); assert.ok((svg.match(/<rect/g) || []).length > 20);
    assert.equal(code128Svg('\x01'), '');
    assert.ok(!code128Svg('A<B', { label: true }).includes('A<B'));
  });
});

describe('bag tags + rack', () => {
  test('codes and scan parsing', () => {
    assert.deepEqual(makeTagCodes('WF-217', 3), ['WF-217-1', 'WF-217-2', 'WF-217-3']);
    assert.deepEqual(makeTagCodes('WF-1', 0), []); assert.equal(makeTagCodes('WF-1', 500).length, 40);
    assert.deepEqual(parseTagCode(' wf-217-2 '), { ticketNumber: 'WF-217', n: 2, code: 'WF-217-2' });
    assert.equal(parseTagCode('WF-217'), null); assert.equal(parseTagCode('junk'), null);
    assert.deepEqual(parseScan('WF-217-2'), { ticketNumber: 'WF-217', n: 2 }); assert.deepEqual(parseScan('wf-217'), { ticketNumber: 'WF-217' });
    assert.deepEqual(parseScan('217'), { ticketNumber: 'WF-217' }); assert.equal(parseScan('???'), null);
  });
  test('partial pickup, missing-bag flow', () => {
    let s: any = { tags: ['WF-1-1', 'WF-1-2', 'WF-1-3'] };
    assert.equal(bagsOutstanding(s), 3);
    s = setBagMissing(s, 'WF-1-2', true); assert.equal(tagRows(s)[1].state, 'MISSING');
    const a = pickUpTags(s, ['WF-1-1', 'WF-9-9']); assert.deepEqual(a.picked, ['WF-1-1']); assert.deepEqual(a.unknown, ['WF-9-9']); assert.equal(a.allPicked, false);
    assert.equal(bagsOutstanding(a.subject), 2);
    const b = pickUpTags(a.subject, ['WF-1-2', 'WF-1-3']); assert.equal(b.allPicked, true); assert.equal(b.subject.missing_tags, undefined); // found while picking up
    assert.equal(setBagMissing(s, 'NOPE', true), s);
    assert.equal(pickUpTags(b.subject, ['WF-1-1']).picked.length, 1); // idempotent
    assert.deepEqual(pickUpTags(b.subject, ['WF-1-1']).subject.picked_tags, ['WF-1-1', 'WF-1-2', 'WF-1-3']);
  });
  test('where is it + rack suggestion', () => {
    const t = mk(5, { tags: ['WF-5-1', 'WF-5-2'], rack: 'R2', bags: 2 }, ['washing']);
    const w = whereIs(t, cfg); assert.equal(w.rack, 'R2'); assert.match(w.summary, /Washing/); assert.match(w.summary, /2 of 2 bags in store/);
    assert.equal(suggestRack([{ subject: { rack: 'R1' } }, { subject: { rack: 'r2' } }]), 'R3'); assert.equal(suggestRack([], { slots: 0 }), '');
    assert.equal(cleanRack(' a-12 <b> '), 'A-12 B');
  });
  test('label rows', () => {
    const t = mk(7, { rush: 'Rush', care: 'Hang dry', rack: 'R9' });
    const l = tagLabels(t, ['WF-7-1', 'WF-7-2'], 'Tue 5pm'); assert.equal(l.length, 2); assert.equal(l[1].of, 2); assert.equal(l[0].rush, true); assert.equal(l[0].rack, 'R9');
  });
});

const HOURS: WeekHours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => [d, { open: '06:00', close: '22:00' }]).concat([['sunday', { open: '07:00', close: '21:00', closed: true }] as any])) as WeekHours;

describe('due times (business hours aware)', () => {
  test('add business minutes crosses closed hours and closed days', () => {
    // Sat 2026-10-03 21:00 UTC with tz 0: 1h left today, then Sunday closed, Monday 06:00 start.
    const sat21 = Date.UTC(2026, 9, 3, 21, 0);
    assert.equal(addBusinessMinutes(sat21, 60, HOURS, 0), Date.UTC(2026, 9, 3, 22, 0));
    assert.equal(addBusinessMinutes(sat21, 120, HOURS, 0), Date.UTC(2026, 9, 5, 7, 0));
    assert.equal(nextOpenAt(Date.UTC(2026, 9, 4, 12, 0), HOURS, 0), Date.UTC(2026, 9, 5, 6, 0)); // Sunday closed -> Monday
    assert.equal(isOpenAt(Date.UTC(2026, 9, 5, 5, 59), HOURS, 0), false); assert.equal(isOpenAt(Date.UTC(2026, 9, 5, 6, 0), HOURS, 0), true);
  });
  test('timezone offset shifts the local clock', () => {
    // 11:00 UTC = 06:00 local at -300: shop just opened; 6 business hours later = 12:00 local = 17:00 UTC.
    assert.equal(addBusinessMinutes(Date.UTC(2026, 9, 5, 11, 0), 360, HOURS, -300), Date.UTC(2026, 9, 5, 17, 0));
  });
  test('standard 24 open hours from Monday 09:00 lands Tuesday 17:00', () => {
    const r = computeDueAt({ receivedAt: Date.UTC(2026, 9, 5, 9, 0), hours: HOURS, tzOffsetMin: 0 });
    assert.equal(r.dueAt, Date.UTC(2026, 9, 6, 17, 0));
  });
  test('rush: same day when before cutoff, falls back to standard when late', () => {
    const early = computeDueAt({ receivedAt: Date.UTC(2026, 9, 5, 8, 0), rush: true, hours: HOURS, tzOffsetMin: 0 });
    assert.equal(early.rushApplied, true); assert.equal(early.dueAt, Date.UTC(2026, 9, 5, 14, 0));
    const late = computeDueAt({ receivedAt: Date.UTC(2026, 9, 5, 15, 0), rush: true, hours: HOURS, tzOffsetMin: 0 });
    assert.equal(late.rushApplied, false); assert.match(late.rushReason || '', /10:00/); assert.ok(late.dueAt > early.dueAt + DAY / 2);
    assert.equal(rushEligible(Date.UTC(2026, 9, 5, 8, 0), DEFAULT_TURNAROUND, HOURS, 0).ok, true);
    const bulk = computeDueAt({ receivedAt: Date.UTC(2026, 9, 5, 8, 0), bulky: true, rules: { ...DEFAULT_TURNAROUND, bulkyExtraHours: 8 }, hours: HOURS, tzOffsetMin: 0 });
    assert.ok(bulk.dueAt > computeDueAt({ receivedAt: Date.UTC(2026, 9, 5, 8, 0), hours: HOURS, tzOffsetMin: 0 }).dueAt);
  });
  test('no hours at all falls back to elapsed time', () => {
    assert.equal(computeDueAt({ receivedAt: T0, hours: {}, tzOffsetMin: 0 }).dueAt, T0 + 24 * H);
  });
  test('due_at on the ticket subject', () => { assert.equal(dueAtOf(mk(1, { due_at: '2026-10-06T17:00:00.000Z' })), Date.UTC(2026, 9, 6, 17, 0)); assert.equal(dueAtOf(mk(2)), undefined); });
  test('bulky lines detected', () => assert.equal(hasBulkyLines(mk(3, {}, [], { lines: [{ kind: 'SERVICE', description: 'Comforter, king', qty: 1, unitPriceCents: 2800 }] })), true));
});

describe('unclaimed reminders', () => {
  const ready = (n: number, daysAgo: number, now: number) => mk(n, {}, ['washing', 'drying', 'folded', 'ready'], { now: now - daysAgo * DAY });
  const now = T0 + 40 * DAY;
  test('thresholds fire once, latest only, never for paid or not-ready tickets', () => {
    const a = ready(1, 3.2, now), b = ready(2, 8, now), c = ready(3, 0.4, now), d = { ...ready(4, 9, now), saleOrderId: 'x' }, e = mk(5, {}, ['washing'], { now: now - 9 * DAY });
    const acts = unclaimedActions([a, b, c, d, e], cfg, now);
    assert.deepEqual(acts.map(x => [x.number, x.kind, x.day]), [['WF-1', 'REMINDER', 3], ['WF-2', 'REMINDER', 7]]);
    const again = unclaimedActions([a, b], cfg, now, { tk1: [3], tk2: [3, 7] }); assert.deepEqual(again, []);
    assert.deepEqual(coveredDays(acts[1]), [3, 7]);
  });
  test('disposal warning then owner-review flag; ready time from audit', () => {
    const w = unclaimedActions([ready(6, 26, now)], cfg, now)[0]; assert.equal(w.kind, 'DISPOSAL_WARNING'); assert.match(w.text, /donated/);
    const o = unclaimedActions([ready(7, 31, now)], cfg, now)[0]; assert.equal(o.kind, 'DISPOSAL_ELIGIBLE'); assert.match(o.text, /owner review/);
    assert.ok(readyAtOf(ready(8, 2, now), cfg)! > 0); assert.equal(readyAtOf(mk(9), cfg), undefined);
  });
});

describe('pickup & delivery', () => {
  test('fees', () => {
    assert.equal(deliveryFeeCents('In-store', 2000), 0); assert.equal(deliveryFeeCents('Delivery', 2000), 500); assert.equal(deliveryFeeCents('Pickup', 2000), 0);
    assert.equal(deliveryFeeCents('Pickup & delivery', 2000, { flatFeeCents: 500, pickupFeeCents: 500 }), 1000);
    assert.equal(deliveryFeeCents('Pickup & delivery', 7000), 0);   // free over threshold
    assert.equal(deliveryFeeCents('Pickup & delivery', 2000, { flatFeeCents: 500, pickupFeeCents: 500, bothLegsDiscountCents: 300 }), 700);
  });
  test('route list sorted by window, filtered by date + driver, printable and escaped', () => {
    const t1 = mk(1, { svc: 'Pickup & delivery', pu_date: '2026-10-06', pu_start: '14:00', pu_end: '16:00', dl_date: '2026-10-08', dl_start: '10:00', dl_end: '12:00', addr: '1 <b>Main</b> St', bags: 2 }, [], { assigned: true });
    const t2 = mk(2, { svc: 'Delivery', dl_date: '2026-10-06', dl_start: '09:00', dl_end: '11:00', addr: '9 Oak' }, [], { name: 'Al' });
    const t3 = mk(3, { svc: 'In-store', pu_date: '2026-10-06' });
    const stops = routeStops([t1, t2, t3], '2026-10-06', { balanceCents: () => 1850 });
    assert.deepEqual(stops.map(s => [s.number, s.kind]), [['WF-2', 'DELIVERY'], ['WF-1', 'PICKUP']]); assert.equal(stops[0].balanceNote, 'Collect $18.50');
    assert.equal(routeStops([t1, t2], '2026-10-08').length, 1); assert.equal(routeStops([t1, t2], '2026-10-06', { driverId: 'drv1' }).length, 1);
    const html = routeListHtml(stops, { date: '2026-10-06', businessName: 'Suds' }); assert.ok(!html.includes('<b>Main</b>')); assert.match(html, /Unassigned/); assert.match(html, /Dee Driver/);
    assert.match(routeListHtml([], { date: 'x' }), /No stops/);
  });
});

describe('customer status page', () => {
  test('progress, ready-by, facts; hidden fields never leak; page renders', () => {
    const t = mk(11, { bags: 3, tags: ['WF-11-1', 'WF-11-2', 'WF-11-3'], picked_tags: ['WF-11-1'], rack: 'R7', account: 'acc_secret', due_at: new Date(T0 + 20 * H).toISOString(), rush: 'Rush', sched_key: 'zzz' }, ['washing', 'drying'], { lines: [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: 10, unit: 'lb', unitPriceCents: 185 }] });
    const x = laundryPublicExtras(t, cfg)!;
    assert.deepEqual(x.progress!.map(p => p.state), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
    assert.equal(x.readyByAt, T0 + 20 * H); assert.match(x.banner!, /dryer/); assert.ok(x.facts!.some(f => f.label === 'Bags picked up' && f.value === '1 of 3'));
    const v = toPublicView(t, cfg, 'Suds & Co'); assert.ok(v.extras);
    assert.ok(!v.subjectSummary.some(s => /Bag tags|Commercial|Schedule|Rack|Ready by|Bags picked/.test(s.label)));
    const html = renderTicketPage(v, { token: 'x' }); assert.match(html, /Progress/); assert.match(html, /Ready by/); assert.ok(!html.includes('acc_secret')); assert.ok(!html.includes('zzz'));
    const rdy = laundryPublicExtras(mk(12, { rack: 'R3' }, ['washing', 'drying', 'folded', 'ready']), cfg)!; assert.equal(rdy.readyByAt, undefined); assert.ok(rdy.facts!.some(f => f.label === 'Pickup shelf' && f.value === 'R3'));
  });
  test('a pack without hooks gets no extras (auto repair unaffected)', () => {
    const v = toPublicView(mk(13), { ...cfg, hooks: undefined }, 'X'); assert.equal(v.extras, undefined);
    const bad = toPublicView(mk(14), { ...cfg, hooks: { publicExtras: () => { throw new Error('boom'); } } }, 'X'); assert.equal(bad.extras, undefined);
  });
  test('laundry config is valid and stages are the pipeline', () => {
    assert.deepEqual(validateConfig(cfg), []);
    assert.deepEqual(cfg.stages.map(s => s.id), ['received', 'washing', 'drying', 'folded', 'ready', 'picked_up', 'cancelled']);
    assert.deepEqual(cfg.stages.filter(s => s.notify).map(s => s.id), ['ready']);
  });
  test('subject bookkeeping survives the storage codec and cleanSubject', () => {
    const t = mk(15, { bags: 2, tags: ['WF-15-1', 'WF-15-2'], rack: 'R1', due_at: '2026-10-06T17:00:00.000Z', wi_lines: ['l1', 'l2'] });
    const back = parseTicket(serializeTicket(t, cfg)); assert.deepEqual(back.subject.tags, ['WF-15-1', 'WF-15-2']); assert.equal(back.subject.rack, 'R1'); assert.deepEqual(back.subject.wi_lines, ['l1', 'l2']);
  });
});

describe('wallet promo + nudge', () => {
  const promo: WalletPromo = cleanPromo({ enabled: true, tiers: [{ minLoadCents: 5000, bonusCents: 500 }, { minLoadCents: 10000, bonusPct: 12 }, { minLoadCents: 2000, bonusPct: 2 }], maxBonusCents: 1000, lowBalanceCents: 500 });
  test('best qualifying tier, percent rounding, cap', () => {
    assert.equal(computeTopUpBonus(promo, 5000).bonusCents, 500); assert.equal(computeTopUpBonus(promo, 4999).bonusCents, Math.round(4999 * 0.02));
    assert.equal(computeTopUpBonus(promo, 1999).bonusCents, 0); assert.equal(computeTopUpBonus(promo, 7500).bonusCents, 500);
    assert.equal(computeTopUpBonus(promo, 10000).bonusCents, 1000);   // 12% = 1200, capped at 1000
    assert.match(computeTopUpBonus(promo, 5000).label, /load \$50, get \$5\.00/);
  });
  test('disabled, windowed and junk are zero', () => {
    assert.equal(computeTopUpBonus({ ...promo, enabled: false }, 9999).bonusCents, 0);
    assert.equal(computeTopUpBonus({ ...promo, startsAt: 2000 }, 5000, 1000).bonusCents, 0); assert.equal(computeTopUpBonus({ ...promo, endsAt: 500 }, 5000, 1000).bonusCents, 0);
    assert.equal(computeTopUpBonus(promo, -5).bonusCents, 0); assert.equal(computeTopUpBonus(promo, NaN as any).bonusCents, 0);
    assert.equal(cleanPromo('not json').enabled, false); assert.equal(cleanPromo({ enabled: true, tiers: [{ minLoadCents: 5000 }] }).tiers.length, 0);
  });
  test('idempotency key is deterministic and safe', () => { assert.equal(bonusIdemKey('pos_1_ab'), 'bonus_pos_1_ab'); assert.equal(bonusIdemKey('a b/c'), 'bonus_abc'); assert.equal(bonusIdemKey('pos_1'), bonusIdemKey('pos_1')); });
  test('next tier hint', () => {
    assert.deepEqual(nextTierHint(promo, 3000), { addCents: 2000, bonusCents: 500 }); assert.equal(nextTierHint(promo, 10000), null); assert.equal(nextTierHint({ ...promo, enabled: false }, 100), null);
  });
  test('low-wallet nudge: ok, low, short (and rounds up toward a promo tier)', () => {
    assert.equal(walletNudge({ balanceCents: 5000, dueCents: 1850, promo }).level, 'ok');
    const low = walletNudge({ balanceCents: 2000, dueCents: 1850, promo }); assert.equal(low.level, 'low'); assert.match(low.message, /left after this/);
    const sh = walletNudge({ balanceCents: 1000, dueCents: 4300, promo }); assert.equal(sh.level, 'short'); assert.equal(sh.shortfallCents, 3300);
    assert.equal(sh.suggestLoadCents, 5000); assert.match(sh.message, /get \$5\.00 free/);
    assert.equal(walletNudge({ balanceCents: 0, dueCents: 100, promo: DEFAULT_PROMO }).suggestLoadCents, 500);
  });
});

describe('commercial accounts, schedules, invoices', () => {
  const acc = cleanAccount({ name: 'Grand Hotel', email: 'ap@grand.test', termsDays: 30, pricePerLbCents: 140, taxExempt: false, schedules: [{ id: 'mwf', days: [1, 3, 5], start: '07:00', end: '09:00', address: '1 Grand Ave' }] }, 'acc1', 'b1', T0).account!;
  test('account validation', () => {
    assert.ok(cleanAccount({ name: '' }, 'a', 'b').error); assert.ok(cleanAccount({ name: 'x', email: 'nope' }, 'a', 'b').error); assert.ok(cleanAccount({ name: 'x', termsDays: 999 }, 'a', 'b').error);
    assert.ok(cleanAccount({ name: 'x', schedules: [{ days: [1], start: '10:00', end: '09:00' }] }, 'a', 'b').error);
    assert.equal(cleanAccount({ name: 'x', schedules: [{ days: [9, 'a'] }] }, 'a', 'b').account!.schedules.length, 0);
    assert.equal(parseAccount(serializeAccount(acc)).schedules[0].address, '1 Grand Ave');
  });
  test('schedule expansion: right weekdays, idempotent via keys, draft tickets', () => {
    const w = expandSchedule(acc, '2026-10-05', '2026-10-11'); assert.deepEqual(w.map(p => p.date), ['2026-10-05', '2026-10-07', '2026-10-09']);
    assert.deepEqual(expandSchedule(acc, '2026-10-05', '2026-10-11', new Set(w.map(p => p.key))), []);
    assert.equal(expandSchedule(acc, '2026-10-05', '2026-10-11', [w[0].key]).length, 2);
    assert.equal(expandSchedule({ ...acc, active: false }, '2026-10-05', '2026-10-11').length, 0); assert.equal(expandSchedule(acc, '2026-10-11', '2026-10-05').length, 0);
    assert.equal(expandSchedule(acc, '2026-01-01', '2027-12-31').length <= 62, true);
    const d = draftTicketFor(acc, w[0]); assert.equal(d.subject.account, 'acc1'); assert.equal(d.subject.sched_key, w[0].key); assert.equal(d.customer.name, 'Grand Hotel');
  });
  const tax = parseTaxSettings({ defaultRateBps: 825, rates: { SERVICE: 825 } });
  const done = (n: number, daysAgo: number, lb: number, acct = 'acc1', billed = true) => {
    let t = mk(n, { account: acct, weight_lb: lb }, [], { now: T0 - daysAgo * DAY, lines: [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: lb, unit: 'lb', unitPriceCents: 140 }] });
    if (billed) t = addDeposit(t, { id: 'd' + n, amountCents: Math.round(lb * 140), method: 'ACCOUNT', by: 'x', at: T0 - daysAgo * DAY }).ticket!;
    return ['washing', 'drying', 'folded', 'ready', 'picked_up'].reduce((a, s, i) => applyTransition(a, cfg, s, 'x', { now: T0 - daysAgo * DAY + (i + 1) * H }), t);
  };
  test('billable tickets filter', () => {
    const ts = [done(1, 10, 20), done(2, 5, 30), done(3, 5, 10, 'other'), done(4, 5, 10, 'acc1', false), done(5, 70, 10), mk(6, { account: 'acc1' })];
    const p = { fromMs: T0 - 30 * DAY, toMs: T0 };
    assert.deepEqual(billableTickets(ts, cfg, 'acc1', p, new Set()).map(t => t.number), ['WF-1', 'WF-2']);
    assert.deepEqual(billableTickets(ts, cfg, 'acc1', p, new Set(['tk1'])).map(t => t.number), ['WF-2']);
  });
  test('invoice totals use ticket totals + taxCore; tax-exempt accounts pay no tax', () => {
    const ts = [done(1, 10, 20), done(2, 5, 30)];
    const r = buildInvoice({ id: 'inv1', seq: 7, account: acc, tickets: ts, cfg, tax, periodFrom: '2026-09-01', periodTo: '2026-09-30', issuedAt: T0 });
    const inv = r.invoice!; assert.equal(inv.number, 'INV-00007'); assert.equal(inv.subtotalCents, 2800 + 4200);
    assert.equal(inv.taxCents, Math.round(2800 * 0.0825) + Math.round(4200 * 0.0825)); assert.equal(inv.totalCents, inv.subtotalCents + inv.taxCents);
    assert.equal(inv.dueAt, T0 + 30 * DAY); assert.equal(inv.status, 'OPEN');
    const ex = buildInvoice({ id: 'i2', seq: 8, account: { ...acc, taxExempt: true }, tickets: ts, cfg, tax, periodFrom: 'a', periodTo: 'b', issuedAt: T0 }).invoice!; assert.equal(ex.taxCents, 0);
    assert.ok(buildInvoice({ id: 'i3', seq: 9, account: acc, tickets: [], cfg, periodFrom: 'a', periodTo: 'b' }).error);
    assert.deepEqual(parseInvoice(serializeInvoice(inv)).lines, inv.lines); assert.equal(invoiceNumber(0), 'INV-00001');
    assert.ok(invoiceHtml(inv, { businessName: 'Suds' }).includes('INV-00007'));
  });
  test('payments: partial, full, overpay, void rules', () => {
    const inv = buildInvoice({ id: 'inv1', seq: 1, account: acc, tickets: [done(1, 10, 20)], cfg, tax, periodFrom: 'a', periodTo: 'b', issuedAt: T0 }).invoice!;
    const p1 = applyInvoicePayment(inv, { id: 'p1', amountCents: 1000, method: 'check', reference: '1042', by: 'owner', at: T0 + DAY }).invoice!;
    assert.equal(p1.status, 'OPEN'); assert.equal(invoiceBalance(p1), inv.totalCents - 1000); assert.equal(p1.payments[0].method, 'CHECK');
    assert.ok(applyInvoicePayment(p1, { id: 'p', amountCents: inv.totalCents, method: 'CASH', by: 'o' }).error);   // overpay
    assert.ok(applyInvoicePayment(p1, { id: 'p', amountCents: 0, method: 'CASH', by: 'o' }).error);
    const paid = applyInvoicePayment(p1, { id: 'p2', amountCents: invoiceBalance(p1), method: 'wire??', by: 'o' }).invoice!; assert.equal(paid.status, 'PAID'); assert.equal(paid.payments[1].method, 'EXTERNAL'); assert.equal(invoiceBalance(paid), 0);
    assert.ok(voidInvoice(p1, 'oops').error); assert.ok(voidInvoice(inv, '').error);
    const v = voidInvoice(inv, 'wrong account').invoice!; assert.equal(v.status, 'VOID'); assert.equal(invoiceBalance(v), 0); assert.ok(applyInvoicePayment(v, { id: 'p', amountCents: 100, method: 'CASH', by: 'o' }).error);
  });
  test('aging buckets + statement running balance', () => {
    const mkInv = (id: string, issuedDaysAgo: number, total: number, paid = 0, status: Invoice['status'] = 'OPEN'): Invoice => ({
      id, number: id.toUpperCase(), businessUid: 'b1', accountId: 'acc1', accountName: 'Grand Hotel', periodFrom: 'a', periodTo: 'b', issuedAt: T0 - issuedDaysAgo * DAY, dueAt: T0 - issuedDaysAgo * DAY + 30 * DAY, termsDays: 30,
      lines: [], subtotalCents: total, taxCents: 0, totalCents: total, payments: paid ? [{ id: 'p' + id, at: T0 - DAY, amountCents: paid, method: 'CHECK', by: 'o' }] : [], paidCents: paid, status,
    });
    const invs = [mkInv('i1', 10, 1000), mkInv('i2', 45, 2000), mkInv('i3', 75, 3000), mkInv('i4', 100, 4000), mkInv('i5', 150, 5000, 1000), mkInv('i6', 200, 9999, 0, 'VOID'), mkInv('i7', 130, 700, 700, 'PAID')];
    const a = agingBuckets(invs, T0);
    assert.deepEqual([a.current, a.d1_30, a.d31_60, a.d61_90, a.d90plus], [1000, 2000, 3000, 4000, 4000]);
    assert.equal(a.totalCents, 14000); assert.equal(a.count, 5);
    const s = buildStatement({ id: 'acc1', name: 'Grand Hotel', termsDays: 30 }, invs, T0);
    assert.equal(s.balanceCents, a.totalCents); assert.equal(s.rows[0].kind, 'INVOICE'); assert.equal(s.rows[s.rows.length - 1].balanceCents, s.balanceCents);
    assert.ok(!s.rows.some(r => r.ref === 'I6')); assert.match(statementHtml(s, { businessName: 'Suds' }), /Balance due: \$140\.00/);
  });
});

describe('laundry settings + registry', () => {
  test('defaults are valid; cleaner repairs bad input', () => {
    assert.deepEqual(validatePricing(DEFAULT_LAUNDRY.pricing), []);
    const c = cleanLaundrySettings({ pricing: { bands: [{ upToLb: 5, centsPerLb: 100 }] }, serviceTaxClass: 'BOGUS', tzOffsetMin: 99999, turnaround: { standardHours: -4 } });
    assert.deepEqual(c.pricing.bands, DEFAULT_LAUNDRY.pricing.bands);      // invalid bands (no open last band) -> default
    assert.equal(c.serviceTaxClass, 'SERVICE'); assert.equal(c.tzOffsetMin, 840); assert.equal(c.turnaround.standardHours, 1);
    assert.deepEqual(cleanLaundrySettings('{bad'), DEFAULT_LAUNDRY); assert.deepEqual(cleanLaundrySettings(null), DEFAULT_LAUNDRY);
    const ok = cleanLaundrySettings({ pricing: { bands: [{ centsPerLb: 199 }], minimumChargeCents: 2000 }, serviceTaxClass: 'EXEMPT', promo: { enabled: true, tiers: [{ minLoadCents: 5000, bonusCents: 500 }] } });
    assert.equal(ok.pricing.bands[0].centsPerLb, 199); assert.equal(ok.pricing.taxClass, 'EXEMPT'); assert.equal(ok.promo.enabled, true);
    assert.ok(quoteWeighIn({ grossLb: 10, pricing: DEFAULT_LAUNDRY.pricing, addons: [{ def: DEFAULT_LAUNDRY.addons[0] }] }).ok);
  });
});

import { tagSheetHtml, rackLabelHtml } from '../services/laundryPrint';
describe('tag printing html', () => {
  test('label + sheet layouts carry barcode, qr, escaped text', () => {
    const t = mk(21, { rush: 'Rush', rack: 'R3', care: 'x' }, [], { name: 'A <b>B</b> & Co' });
    const labels = tagLabels(t, makeTagCodes(t.number, 3), 'Tue 5pm');
    const a = tagSheetHtml(labels, 'label'); assert.equal((a.match(/class="tag"/g) || []).length, 3); assert.match(a, /2\.25in 1\.25in/); assert.match(a, /RUSH/); assert.ok(!a.includes('<b>B</b>')); assert.match(a, /aria-label="Barcode WF-21-2"/);
    assert.match(tagSheetHtml(labels, 'sheet'), /repeat\(3,2\.625in\)/);
    assert.match(rackLabelHtml('R3', 'WF-21', 'Jo <i>'), /R3/); assert.ok(!rackLabelHtml('R3', 'WF-21', 'Jo <i>').includes('<i>'));
  });
});
