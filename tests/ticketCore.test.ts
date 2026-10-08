import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig, allowedNext, cleanSubject, cleanLine, newTicket, computeTicketTotals, canTransition, applyTransition, decideLines,
  stageAfterDecision, addDeposit, startTimer, stopTimer, minutesByTech, matchesQuery, countsByStage, serializeTicket, parseTicket,
  toPublicView, parseToken, formatToken, saleLines, lineFromTemplate, partPriceFromCost, stageKind, type Ticket, type TicketConfig,
} from '../services/ticketCore';
import { AUTO_TICKET, LAUNDRY_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { PACKS, getPack } from '../services/verticalPacks';
import { casUpdate, memoryCasStore } from '../services/casCore';
import { makeToken, verifyToken, sendSms } from '../services/ticketServer';
import { renderTicketPage } from '../services/ticketPublicPage';
import { parseTaxSettings } from '../services/taxCore';

const TAX = parseTaxSettings({ defaultRateBps: 800, rates: { LABOR: 0, SERVICE: 0 } });   // parts 8%, labor/service untaxed
const mk = (cfg: TicketConfig = AUTO_TICKET, id = 'tk_1'): Ticket =>
  newTicket(cfg, { id, seq: 1042, businessUid: 'biz1', packId: 'auto_repair', customer: { name: 'Dana Cruz', phone: '5551234567', email: 'd@x.com' }, subject: { model: 'Civic' }, by: 'Owner', now: 1000 });
const addLine = (t: Ticket, cfg: TicketConfig, raw: any): Ticket => {
  const r = cleanLine(cfg, raw, `l${t.lines.length + 1}`); assert.ok(r.line, r.error);
  return { ...t, lines: [...t.lines, r.line!] };
};
const L = (kind: string, description: string, qty: number, unitPriceCents: number, extra: any = {}) => ({ kind, description, qty, unitPriceCents, ...extra });
const approveAll = (t: Ticket): Ticket => ({ ...t, lines: t.lines.map(l => ({ ...l, approval: 'APPROVED' as const })) });

describe('pack configs', () => {
  test('both service packs ship a valid pipeline', () => {
    assert.deepEqual(validateConfig(AUTO_TICKET), []);
    assert.deepEqual(validateConfig(LAUNDRY_TICKET), []);
    for (const id of ['auto_repair', 'laundromat']) assert.ok(getPack(id)!.ticket, id);
  });
  test('only the two service packs carry a ticket config and TICKETS tab', () => {
    for (const p of PACKS) {
      const on = p.id === 'auto_repair' || p.id === 'laundromat';
      assert.equal(!!p.ticket, on, p.id);
      assert.equal(p.tabs.includes('TICKETS' as any), on, p.id);
    }
  });
  test('legacy pack stage ids all exist in the ticket pipeline (and notify flags agree)', () => {
    for (const id of ['auto_repair', 'laundromat']) {
      const p = getPack(id)!;
      for (const s of p.stages!) {
        const ts = p.ticket!.stages.find(x => x.id === s.id);
        assert.ok(ts, `${id}:${s.id}`);
        if (s.notifyCustomer && s.id === 'ready') assert.equal(ts!.notify, true, `${id}:${s.id}`);
      }
    }
  });
  test('prefixes, numbering and notify stages', () => {
    assert.equal(newTicket(AUTO_TICKET, { id: 'a', seq: 1042, businessUid: 'b', customer: { name: 'x' }, subject: {}, by: 'o' }).number, 'RO-1042');
    assert.equal(newTicket(LAUNDRY_TICKET, { id: 'a', seq: 217, businessUid: 'b', customer: { name: 'x' }, subject: {}, by: 'o' }).number, 'WF-217');
    assert.equal(AUTO_TICKET.stages.find(s => s.id === 'ready')!.notify, true);
    assert.equal(LAUNDRY_TICKET.stages.find(s => s.id === 'ready')!.notify, true);
    assert.equal(LAUNDRY_TICKET.stages.find(s => s.id === 'washing')!.notify, undefined);
  });
  test('validateConfig catches broken pipelines', () => {
    assert.ok(validateConfig({ ...AUTO_TICKET, stages: AUTO_TICKET.stages.filter(s => s.kind !== 'DONE') }).length);
    assert.ok(validateConfig({ ...AUTO_TICKET, stages: [...AUTO_TICKET.stages, { id: 'estimate', label: 'dup', kind: 'ESTIMATE' }] }).includes('duplicate stage ids'));
    assert.ok(validateConfig({ ...AUTO_TICKET, prefix: 'nope' }).length);
  });
  test('default next = following stage + cancelled; terminals have none', () => {
    const c: TicketConfig = { ...LAUNDRY_TICKET, stages: LAUNDRY_TICKET.stages.map(({ next, ...s }) => s) };
    assert.deepEqual(allowedNext(c, 'washing'), ['drying', 'cancelled']);
    assert.deepEqual(allowedNext(c, 'picked_up'), []);
    assert.deepEqual(allowedNext(c, 'cancelled'), []);
    assert.deepEqual(allowedNext(AUTO_TICKET, 'nope'), []);
  });
});

describe('subject field schema', () => {
  test('auto: requires model, coerces numbers, drops unknown keys', () => {
    assert.ok(cleanSubject(AUTO_TICKET, { make: 'Honda' }).errors[0].includes('Model'));
    const r = cleanSubject(AUTO_TICKET, { model: ' Civic ', year: '2019', mileage_in: '48210.5', junk: 'x', plate: 'ABC123' });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.subject, { model: 'Civic', year: 2019, mileage_in: 48210.5, plate: 'ABC123' });
    assert.ok(cleanSubject(AUTO_TICKET, { model: 'x', year: 'abc' }).errors.length);
  });
  test('laundromat: bags required, tags split, select validated', () => {
    assert.ok(cleanSubject(LAUNDRY_TICKET, {}).errors.length);
    const r = cleanSubject(LAUNDRY_TICKET, { bags: 2, weight_lb: 14.25, tags: 'A12, A13 A14', detergent: 'Free & clear' });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.subject.tags, ['A12', 'A13', 'A14']);
    assert.ok(cleanSubject(LAUNDRY_TICKET, { bags: 1, detergent: 'Mystery' }).errors.length);
  });
});

describe('lines and totals', () => {
  test('cleanLine validates and respects requireApproval', () => {
    assert.ok(cleanLine(AUTO_TICKET, L('NOPE', 'x', 1, 100), 'a').error);
    assert.ok(cleanLine(AUTO_TICKET, L('PART', '', 1, 100), 'a').error);
    assert.ok(cleanLine(AUTO_TICKET, L('PART', 'x', 0, 100), 'a').error);
    assert.ok(cleanLine(AUTO_TICKET, L('PART', 'x', 1, -5), 'a').error);
    assert.equal(cleanLine(AUTO_TICKET, L('PART', 'x', 1, 100), 'a').line!.approval, 'PENDING');
    assert.equal(cleanLine(LAUNDRY_TICKET, L('BY_WEIGHT', 'wf', 12.5, 185, { unit: 'lb' }), 'a').line!.approval, 'APPROVED');
  });
  test('parts and labor use different tax classes through taxCore', () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('PART', 'Brake pads', 1, 8500));      // 8% -> 680
    t = addLine(t, AUTO_TICKET, L('LABOR', 'Brake labor', 2, 13500));   // 0%
    t = approveAll(t);
    const tot = computeTicketTotals(t, AUTO_TICKET, TAX);
    assert.equal(tot.approved.subtotalCents, 8500 + 27000);
    assert.equal(tot.approved.taxCents, 680);
    assert.equal(tot.approved.totalCents, 35500 + 680);
    assert.equal(tot.byLine['l1'].taxCents, 680);
    assert.equal(tot.byLine['l2'].taxCents, 0);
  });
  test('explicit line taxClass overrides the kind default', () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('LABOR', 'taxable labor', 1, 10000, { taxClass: 'STANDARD' }));
    assert.equal(computeTicketTotals(approveAll(t), AUTO_TICKET, TAX).approved.taxCents, 800);
  });
  test('approved-only vs estimate vs pending vs declined', () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('SERVICE', 'A', 1, 10000));
    t = addLine(t, AUTO_TICKET, L('SERVICE', 'B', 1, 20000));
    t = addLine(t, AUTO_TICKET, L('SERVICE', 'C', 1, 40000));
    t = { ...t, lines: [{ ...t.lines[0], approval: 'APPROVED' }, { ...t.lines[1], approval: 'DECLINED' }, t.lines[2]] };
    const tot = computeTicketTotals(t, AUTO_TICKET, TAX);
    assert.equal(tot.approved.totalCents, 10000);
    assert.equal(tot.estimate.totalCents, 50000);
    assert.equal(tot.pendingCents, 40000);
    assert.equal(tot.declinedCents, 20000);
    assert.deepEqual([tot.approvedCount, tot.pendingCount, tot.declinedCount], [1, 1, 1]);
  });
  test('by-weight pricing rounds to cents (12.5 lb at 185)', () => {
    let t = mk(LAUNDRY_TICKET);
    t = addLine(t, LAUNDRY_TICKET, L('BY_WEIGHT', 'Wash & fold', 12.5, 185, { unit: 'lb' }));
    assert.equal(computeTicketTotals(t, LAUNDRY_TICKET).approved.subtotalCents, 2313);   // 2312.5 -> 2313
  });
  test('deposits reduce the balance; excess is reported; payment zeroes it', () => {
    let t = approveAll(addLine(mk(), AUTO_TICKET, L('SERVICE', 'A', 1, 10000)));
    t = addDeposit(t, { id: 'd1', amountCents: 4000, method: 'cash', by: 'Owner' }).ticket!;
    assert.equal(computeTicketTotals(t, AUTO_TICKET).balanceCents, 6000);
    t = addDeposit(t, { id: 'd2', amountCents: 7000, method: 'card', by: 'Owner' }).ticket!;
    const tot = computeTicketTotals(t, AUTO_TICKET);
    assert.equal(tot.balanceCents, 0);
    assert.equal(tot.excessDepositCents, 1000);
    assert.ok(addDeposit(t, { id: 'x', amountCents: 0, method: 'cash', by: 'o' }).error);
    assert.ok(addDeposit({ ...t, saleOrderId: 'o1' }, { id: 'x', amountCents: 100, method: 'cash', by: 'o' }).error);
  });
  test('templates and parts markup helper', () => {
    const raw = lineFromTemplate(AUTO_TICKET, 'labor_hr', 1.5)!;
    assert.equal(raw.unitPriceCents, 13500); assert.equal(raw.qty, 1.5);
    assert.equal(lineFromTemplate(AUTO_TICKET, 'missing'), null);
    assert.equal(partPriceFromCost(5000, 40), 7000);
  });
});

describe('transition guards', () => {
  const base = () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('PART', 'Pads', 1, 8500));
    t = addLine(t, AUTO_TICKET, L('LABOR', 'Labor', 1, 13500));
    return t;
  };
  const go = (t: Ticket, to: string, ctx: any = {}) => { const c = canTransition(t, AUTO_TICKET, to, ctx); assert.ok(c.ok, JSON.stringify(c)); return applyTransition(t, AUTO_TICKET, to, 'Owner', { now: 2000, overridden: (c as any).overridden }); };

  test('illegal moves are rejected and cannot be overridden', () => {
    const t = base();
    const c = canTransition(t, AUTO_TICKET, 'ready', { override: true });
    assert.equal(c.ok, false); assert.equal((c as any).code, 'NOT_ALLOWED');
    assert.equal(canTransition(t, AUTO_TICKET, 'nope').ok, false);
  });
  test('awaiting approval needs something to approve', () => {
    let t = go(mk(), 'estimate');
    const c = canTransition(t, AUTO_TICKET, 'awaiting_approval');
    assert.equal((c as any).code, 'NOTHING_TO_APPROVE');
    t = base(); t = go(go(t, 'estimate'), 'awaiting_approval');
    assert.equal(t.stage, 'awaiting_approval');
  });
  test('cannot start work with unapproved scope unless override, which is audited', () => {
    let t = go(go(base(), 'estimate'), 'awaiting_approval');
    assert.equal(canTransition(t, AUTO_TICKET, 'approved').ok, false);
    const forced = canTransition(t, AUTO_TICKET, 'approved', { override: true });
    assert.equal(forced.ok, true);
    // approve one line, skip to in_progress path
    t = decideLines(t, { l1: 'APPROVED', l2: 'APPROVED' }, { ip: '1.1.1.1', consentText: 'ok', via: 'LINK' }).ticket;
    t = go(t, 'approved');
    t = addLine(t, AUTO_TICKET, L('PART', 'Rotor found worn', 1, 9000));      // extra scope -> PENDING
    const c = canTransition(t, AUTO_TICKET, 'in_progress');
    assert.equal(c.ok, false); assert.equal((c as any).code, 'UNAPPROVED'); assert.equal((c as any).canOverride, true);
    const o = go(t, 'in_progress', { override: true });
    assert.equal(o.audit[o.audit.length - 1].type, 'OVERRIDE');
    assert.match(o.audit[o.audit.length - 1].detail!, /OVERRIDE/);
  });
  test('DONE needs a zero balance unless override or a recorded sale', () => {
    let t = approveAll(base());
    t = { ...t, stage: 'ready' };
    const c = canTransition(t, AUTO_TICKET, 'picked_up', { tax: TAX });
    assert.equal(c.ok, false); assert.equal((c as any).code, 'BALANCE_DUE');
    assert.equal(canTransition(t, AUTO_TICKET, 'picked_up', { tax: TAX, override: true }).ok, true);
    assert.equal(canTransition({ ...t, saleOrderId: 'pos_1' }, AUTO_TICKET, 'picked_up', { tax: TAX }).ok, true);
    const dep = addDeposit(t, { id: 'd', amountCents: computeTicketTotals(t, AUTO_TICKET, TAX).approved.totalCents, method: 'card', by: 'o' }).ticket!;
    assert.equal(canTransition(dep, AUTO_TICKET, 'picked_up', { tax: TAX }).ok, true);
  });
  test('paid tickets cannot be cancelled; unpaid can, from any open stage', () => {
    const t = base();
    assert.equal(canTransition(t, AUTO_TICKET, 'cancelled').ok, true);
    assert.equal((canTransition({ ...t, saleOrderId: 'o' }, AUTO_TICKET, 'cancelled') as any).code, 'PAID');
  });
  test('audit records who, when, from -> to', () => {
    const t = go(mk(), 'estimate');
    const e = t.audit[t.audit.length - 1];
    assert.deepEqual([e.type, e.from, e.to, e.by, e.at], ['TRANSITION', 'intake', 'estimate', 'Owner', 2000]);
    assert.equal(t.audit[0].type, 'CREATE');
  });
  test('laundromat pipeline walks to done without approvals', () => {
    let t = addLine(mk(LAUNDRY_TICKET), LAUNDRY_TICKET, L('BY_WEIGHT', 'wf', 10, 185, { unit: 'lb' }));
    const walk = ['washing', 'drying', 'folded', 'ready'];
    for (const s of walk) { const c = canTransition(t, LAUNDRY_TICKET, s); assert.ok(c.ok, s); t = applyTransition(t, LAUNDRY_TICKET, s, 'a'); }
    assert.equal(canTransition(t, LAUNDRY_TICKET, 'picked_up').ok, false);                       // 1850 unpaid
    assert.equal(canTransition({ ...t, saleOrderId: 'o' }, LAUNDRY_TICKET, 'picked_up').ok, true);
    assert.equal(canTransition(t, LAUNDRY_TICKET, 'washing').ok, false);                          // no going back
  });
});

describe('customer decisions', () => {
  const sent = () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('PART', 'Pads', 1, 8500));
    t = addLine(t, AUTO_TICKET, L('LABOR', 'Labor', 1, 13500));
    t = addLine(t, AUTO_TICKET, L('SERVICE', 'Alignment', 1, 12000));
    return { ...t, stage: 'awaiting_approval' };
  };
  test('records ip/time/consent per decision and only touches pending lines', () => {
    const r = decideLines(sent(), { l1: 'APPROVED', l2: 'APPROVED', l3: 'DECLINED', ghost: 'APPROVED' }, { ip: '9.9.9.9', consentText: 'I agree', via: 'LINK', at: 5000 });
    assert.equal(r.applied, 3); assert.equal(r.pendingLeft, 0);
    assert.equal(r.ticket.approvals.length, 2);
    const a = r.ticket.approvals.find(x => x.decision === 'APPROVED')!;
    assert.deepEqual([a.ip, a.consentText, a.at, a.via, a.lineIds], ['9.9.9.9', 'I agree', 5000, 'LINK', ['l1', 'l2']]);
    const again = decideLines(r.ticket, { l3: 'APPROVED' }, { ip: '9.9.9.9', consentText: 'x', via: 'LINK' });
    assert.equal(again.applied, 0);                                   // already decided: replay is a no-op
    assert.equal(again.ticket.lines[2].approval, 'DECLINED');
  });
  test('next stage: approved if anything approved, cancelled if all declined, none while pending', () => {
    assert.equal(stageAfterDecision(sent(), AUTO_TICKET), null);
    const part = decideLines(sent(), { l1: 'APPROVED' }, { ip: 'i', consentText: 'c', via: 'LINK' }).ticket;
    assert.equal(stageAfterDecision(part, AUTO_TICKET), null);
    const some = decideLines(sent(), { l1: 'APPROVED', l2: 'DECLINED', l3: 'DECLINED' }, { ip: 'i', consentText: 'c', via: 'LINK' }).ticket;
    assert.equal(stageAfterDecision(some, AUTO_TICKET), 'approved');
    const none = decideLines(sent(), { l1: 'DECLINED', l2: 'DECLINED', l3: 'DECLINED' }, { ip: 'i', consentText: 'c', via: 'LINK' }).ticket;
    assert.equal(stageAfterDecision(none, AUTO_TICKET), 'cancelled');
  });
});

describe('time log', () => {
  test('start/stop, one running timer per tech, minutes per tech', () => {
    let t = mk();
    t = startTimer(t, { id: 'a', staffId: 's1', staffName: 'Sam', now: 0 }).ticket!;
    assert.ok(startTimer(t, { id: 'b', staffId: 's1', staffName: 'Sam', now: 10 }).error);
    t = startTimer(t, { id: 'c', staffId: 's2', staffName: 'Ana', now: 0 }).ticket!;
    t = stopTimer(t, 's1', 90 * 60000).ticket!;
    assert.ok(stopTimer(t, 's1').error);
    const m = minutesByTech(t, 30 * 60000);
    assert.equal(m.s1.minutes, 90); assert.equal(m.s2.minutes, 30);
    t = startTimer(t, { id: 'd', staffId: 's1', staffName: 'Sam', now: 100 * 60000 }).ticket!;
    assert.equal(minutesByTech(t, 130 * 60000).s1.minutes, 120);
  });
});

describe('storage + public view + token', () => {
  const full = () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('PART', 'Pads', 1, 8500, { costCents: 3000, notes: 'OEM', technicianId: 's1', technicianName: 'Sam' }));
    t = { ...t, notes: [{ id: 'n1', text: 'Customer is rude', internal: true, by: 'o', at: 1 }, { id: 'n2', text: 'Ready by 4pm', internal: false, by: 'o', at: 2 }],
      attachments: [{ id: 'a1', url: 'https://x.test/p.jpg', kind: 'image', lineId: 'l1', at: 1 }, { id: 'a2', url: 'https://x.test/private.jpg', kind: 'image', at: 1, visibleToCustomer: false }],
      assignedTo: { id: 's1', name: 'Sam' } };
    return { ...t, stage: 'awaiting_approval' };
  };
  test('serialize/parse round-trips and never contains undefined (Firestore throws on it)', () => {
    const t = full();
    const doc = serializeTicket(t, AUTO_TICKET, TAX);
    for (const [k, v] of Object.entries(doc)) assert.notEqual(v, undefined, k);
    for (const k of ['lines', 'audit', 'attachments', 'notes', 'deposits']) assert.equal(typeof doc[k], 'string', `${k} is a JSON string`);
    const back = parseTicket(doc);
    assert.deepEqual(back.lines, t.lines); assert.deepEqual(back.subject, t.subject); assert.equal(back.number, 'RO-1042');
    assert.equal(doc.customerName, 'Dana Cruz'); assert.equal(doc.stageKind, 'AWAITING_APPROVAL');
    const bare = serializeTicket(mk(), AUTO_TICKET);
    for (const [k, v] of Object.entries(bare)) assert.notEqual(v, undefined, k);
  });
  test('public view hides internal notes, costs, audit, staff and hidden photos', () => {
    const v = toPublicView(full(), AUTO_TICKET, 'Joes Auto', TAX);
    const json = JSON.stringify(v);
    for (const leak of ['rude', 'costCents', '3000', 'private.jpg', 'Sam', 'audit', 'phone', '5551234567', 'd@x.com', 'Dana']) assert.ok(!json.includes(leak), leak);
    assert.equal(v.canDecide, true);
    assert.deepEqual(v.messages, ['Ready by 4pm']);
    assert.deepEqual(v.lines[0].photos, ['https://x.test/p.jpg']);
    assert.equal(toPublicView({ ...full(), stage: 'in_progress' }, AUTO_TICKET, 'Joes').canDecide, false);
  });
  test('search and counts', () => {
    const t = full();
    assert.ok(matchesQuery(t, 'civic')); assert.ok(matchesQuery(t, 'ro-1042 dana')); assert.ok(!matchesQuery(t, 'toyota'));
    const c = countsByStage([t, { ...t, stage: 'ready' }, { ...t, stage: 'ready' }], AUTO_TICKET);
    assert.equal(c.awaiting_approval, 1); assert.equal(c.ready, 2); assert.equal(c.intake, 0);
  });
  test('link tokens: HMAC verifies, tampering and wrong versions fail, format is strict', () => {
    const t = { ...full(), id: 'tk_demo01' };
    const tok = makeToken(t);
    assert.deepEqual(verifyToken(tok), { ticketId: 'tk_demo01', version: 1 });
    const p = parseToken(tok)!;
    assert.equal(verifyToken(formatToken('tk_other2', p.version, p.mac)), null);
    assert.equal(verifyToken(formatToken(p.ticketId, 2, p.mac)), null);
    assert.equal(verifyToken(tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A')), null);
    assert.equal(parseToken('../../etc/passwd'), null); assert.equal(parseToken(''), null);
    assert.notEqual(makeToken({ id: 'tk_demo01', linkVersion: 2 }), tok);       // rotating revokes
  });
  test('saleLines: approved only, qty folded into price, tax class per kind', () => {
    let t = full();
    t = addLine(t, AUTO_TICKET, L('LABOR', 'Labor', 1.5, 13500));
    t = { ...t, lines: [{ ...t.lines[0], approval: 'APPROVED' }, { ...t.lines[1], approval: 'APPROVED' }] };
    const s = saleLines(t, AUTO_TICKET);
    assert.equal(s.length, 2);
    assert.equal(s[1].unitAmount, 20250); assert.equal(s[1].qty, 1); assert.equal(s[1].taxClass, 'LABOR');
    assert.equal(s[0].taxClass, 'STANDARD');
    assert.equal(saleLines({ ...t, lines: t.lines.map(l => ({ ...l, approval: 'DECLINED' as const })) }, AUTO_TICKET).length, 0);
  });
  test('sendSms is a logged no-op seam', async () => {
    assert.deepEqual(await sendSms('5551234567', 'hi'), { sent: false, reason: 'SMS_NOT_ENABLED' });
  });
});

describe('public page rendering', () => {
  test('escapes everything and shows approve/decline only while deciding', () => {
    let t = mk();
    t = addLine(t, AUTO_TICKET, L('PART', '<script>alert(1)</script>', 1, 1000, { notes: '"><img src=x onerror=1>' }));
    t = { ...t, stage: 'awaiting_approval', customer: { name: 'x' } };
    const html = renderTicketPage(toPublicView(t, AUTO_TICKET, '<b>Shop</b>'), { token: 'tok' });
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(!html.includes('<b>Shop</b>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('Approve') && html.includes('Decline') && html.includes('noindex'));
    const done = renderTicketPage(toPublicView({ ...t, stage: 'in_progress' }, AUTO_TICKET, 'Shop'), { token: 'tok' });
    assert.ok(!done.includes('class="ap"'));
  });
  test('rejects non-https photo urls', () => {
    let t = mk(); t = { ...t, attachments: [{ id: 'a', url: 'javascript:alert(1)', kind: 'image', at: 1 }] };
    assert.ok(!renderTicketPage(toPublicView(t, AUTO_TICKET, 'S')).includes('javascript:'));
  });
});

describe('CAS: concurrent ticket writers cannot clobber each other', () => {
  test('two staff adding lines at once both land; stale writer retries', async () => {
    const store = memoryCasStore({ tk_1: { v: 1 } as any });
    const add = (desc: string) => casUpdate(store, 'tk_1', cur => {
      const lines = JSON.parse(cur?.lines || '[]'); lines.push(desc);
      return { patch: { lines: JSON.stringify(lines) }, result: null };
    });
    await Promise.all([add('a'), add('b'), add('c')]);
    const doc = await store.get('tk_1');
    assert.deepEqual(JSON.parse(doc!.data.lines).sort(), ['a', 'b', 'c']);
  });
  test('double pay claim: only one wins', async () => {
    const store = memoryCasStore({ tk_1: { v: 1 } as any });
    const claim = (orderId: string) => casUpdate(store, 'tk_1', cur => (cur?.saleOrderId ? { abort: true, result: 'paid' } : { patch: { saleOrderId: orderId }, result: orderId }));
    const rs = await Promise.all([claim('o1'), claim('o2')]);
    assert.equal(rs.filter(r => r.ok).length, 1);
  });
  test('stageKind helper', () => { assert.equal(stageKind(AUTO_TICKET, 'ready'), 'READY'); assert.equal(stageKind(AUTO_TICKET, 'zzz'), undefined); });
});
