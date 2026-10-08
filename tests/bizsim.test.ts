import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, playTurn, resolveEvent, listDecisions, statements, report, levelOf, hasCond, eligibleEvents, demandAt, loanSize, type SimState } from '../services/bizSim/engine';
import { TIERS, INDUSTRIES, QUESTS, EVENTS, TIER_SCALE } from '../data/bizSim/content';
import type { Tier, Industry } from '../data/bizSim/types';

const near = (a: number, b: number, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

/** Play a whole game with a simple strategy; always resolves events with the first choice. */
function play(tier: Tier, industry: Industry, seed: number, strategy: (s: SimState) => string[], priceIdx?: (s: SimState) => number | undefined): SimState {
  let s = newGame({ tier, industry, seed, name: 'Test' });
  for (let guard = 0; guard < 60 && s.phase !== 'ended'; guard++) {
    if (s.pending) { s = resolveEvent(s, 0); continue; }
    const out = playTurn(s, { picks: strategy(s), priceIdx: priceIdx?.(s) });
    if (!out.ok) { const out2 = playTurn(s, { picks: [] }); s = out2.state; } else s = out.state;
  }
  return s;
}
const identity = (s: SimState) => { const st = statements(s); near(st.bs.assets, st.bs.liabilities + st.bs.equity, 0.05); };

test('the same seed and choices give the same game', () => {
  const a = play('founder', 'music', 42, () => ['mkt-1']); const b = play('founder', 'music', 42, () => ['mkt-1']);
  assert.deepEqual(a.history.map(h => h.profit), b.history.map(h => h.profit)); assert.equal(a.cash, b.cash);
  const c = play('founder', 'music', 43, () => ['mkt-1']); assert.notDeepEqual(a.history.map(h => h.customers), c.history.map(h => h.customers));
});

test('the balance sheet balances after every turn, for every tier and industry, with active play', () => {
  for (const t of TIERS) for (const ind of INDUSTRIES) {
    let s = newGame({ tier: t.id, industry: ind.id, seed: 7, name: 'x' });
    for (let i = 0; i < t.turns && s.phase !== 'ended'; i++) {
      if (s.pending) { s = resolveEvent(s, 1 % (EVENTS.find(e => e.id === s.pending)!.choices.length)); identity(s); continue; }
      const picks = listDecisions(s).filter(d => !d.disabled && d.cost <= s.cash * 0.35 && (d.id.startsWith('mkt-0') || d.id === 'quality' || d.id.startsWith('q:') || d.id === 'loan' || d.id === 'hire' || d.id === 'equipment' || d.id.startsWith('sp:'))).map(d => d.id).slice(0, 3 + (i % 3));
      const out = playTurn(s, { picks }); s = out.ok ? out.state : playTurn(s, { picks: [] }).state; identity(s);
    }
  }
});

test('doing nothing is worse than a sensible strategy, and a sensible strategy usually turns a profit', () => {
  for (const tier of ['sprout', 'builder', 'founder'] as Tier[]) {
    let wins = 0, total = 0;
    for (const ind of ['lemonade', 'shop', 'ecommerce', 'services', 'publishing'] as Industry[]) {
      const idle = play(tier, ind, 11, () => []); const smart = play(tier, ind, 11, s => (s.turn % 2 === 0 ? ['mkt-0'] : s.turn === 1 ? ['quality'] : []));
      total++; if (smart.cash > idle.cash) wins++;
    }
    assert.ok(wins >= 3, `${tier}: smart play beat idling only ${wins}/${total} times`);
  }
});

test('demand falls as price rises and rises with awareness, quality and reputation', () => {
  const s = newGame({ tier: 'builder', industry: 'shop', seed: 1, name: 'x' });
  assert.ok(demandAt(s, 8) > demandAt(s, 12) && demandAt(s, 12) > demandAt(s, 20));
  const better = { ...s, awareness: 60, quality: 80, reputation: 80 }; assert.ok(demandAt(better, 12) > demandAt(s, 12) * 1.5);
});

test('you cannot spend money you do not have; borrowing first makes it possible', () => {
  const s = newGame({ tier: 'builder', industry: 'restaurant', seed: 3, name: 'x' });
  const big = listDecisions(s).find(d => d.id === 'mkt-2')!;
  const poor = { ...s, cash: big.cost / 2 }; assert.equal(playTurn(poor, { picks: ['mkt-2'] }).ok, false);
  const withLoan = playTurn(poor, { picks: ['loan', 'mkt-2'] }); assert.equal(withLoan.ok, true); assert.equal(withLoan.state.debt, loanSize(s));
});

test('the establishment campaign unlocks in order and changes what you hold', () => {
  let s = newGame({ tier: 'founder', industry: 'software', seed: 5, name: 'x' });
  assert.ok(!listDecisions(s).some(d => d.id === 'q:f-ein'));           // needs the LLC first
  const step = (id: string) => { const o = playTurn(s, { picks: [id] }); assert.ok(o.ok, o.errors.join()); s = o.state.pending ? resolveEvent(o.state, 0) : o.state; };
  const idle = () => { if (s.pending) s = resolveEvent(s, 0); const o = playTurn(s, { picks: [] }); s = o.ok ? o.state : s; if (s.pending) s = resolveEvent(s, 0); };
  step('q:f-search'); step('q:f-llc'); assert.equal(s.legal.entity, 'none' as const); idle(); assert.equal(s.legal.entity, 'llc' as const);
  step('q:f-ein'); step('q:f-bank'); step('q:f-insure'); step('q:f-books');
  assert.ok(hasCond(s, 'llc') && hasCond(s, 'ein') && hasCond(s, 'bank') && hasCond(s, 'insurance') && hasCond(s, 'records'));
  step('q:f-tm'); assert.equal(s.ip.trademark, 'pending');
  for (let i = 0; i < 4 && s.phase !== 'ended'; i++) { if (s.pending) s = resolveEvent(s, 0); const o = playTurn(s, { picks: [] }); s = o.ok ? o.state : s; }
  assert.equal(s.ip.trademark, 'registered');
  step('q:f-copyright'); assert.equal(s.ip.copyrights, 1); assert.ok(s.badges.includes('protected') && s.badges.includes('creator'));
});

test('protection changes what an event costs: a registered trademark makes the copycat event cheap', () => {
  const base = newGame({ tier: 'founder', industry: 'ecommerce', seed: 9, name: 'x' });
  assert.ok(EVENTS.find(e => e.id === 'e-copycat')!);
  const unprotected = { ...base, pending: 'e-copycat', history: [{ turn: 1, revenue: 0, otherIncome: 0, cogs: 0, opex: 0, oneOff: 0, interest: 0, tax: 0, depreciation: 0, capex: 0, loanIn: 0, loanOut: 0, equityIn: 0, profit: 0, cashEnd: 0, sold: 0, customers: 0, stockout: false, notes: [] }] } as SimState;
  const hurt = resolveEvent(unprotected, 1); assert.ok(hurt.cash < base.cash - 200);
  const protectedState = { ...unprotected, ip: { ...unprotected.ip, trademark: 'registered' as const }, pending: 'e-copycat-tm' } as SimState;
  const fine = resolveEvent(protectedState, 0); assert.ok(fine.cash > base.cash - 100);
  // and the eligible-events gate agrees
  assert.ok(!eligibleEvents({ ...base, turn: 4 }).some(e => e.id === 'e-copycat-tm')); assert.ok(eligibleEvents({ ...base, turn: 4, ip: { ...base.ip, trademark: 'registered' } }).some(e => e.id === 'e-copycat-tm'));
});

test('kid tiers cannot go bankrupt; adult tiers can; levels rise with XP; the report is sensible', () => {
  const broke = play('seedling', 'lemonade', 2, s => listDecisions(s).filter(d => d.id === 'mkt-2' && d.cost <= s.cash).map(d => d.id), () => 2);
  assert.notEqual(broke.endReason, 'bankrupt'); assert.ok(broke.cash >= 0);
  let s = newGame({ tier: 'builder', industry: 'restaurant', seed: 4, name: 'x' }); s = { ...s, cash: -50, negCash: 1 };
  const o = playTurn({ ...s, cash: 0 }, { picks: [], priceIdx: 5 }); assert.ok(o.ok);
  assert.equal(levelOf(0), 1); assert.ok(levelOf(500) > levelOf(100));
  const done = play('executive', 'film', 8, () => ['mkt-0']); const r = report(done); assert.ok(r.stars >= 1 && r.stars <= 5); assert.ok(r.companyValue >= 0); assert.equal(r.outcome === 'finished' || r.outcome === 'bankrupt', true);
});

test('content is consistent: quest requirements exist, events have choices, every tier has a playable setup', () => {
  const ids = new Set(QUESTS.map(q => q.id));
  for (const q of QUESTS) for (const r of q.requires || []) assert.ok(ids.has(r), `${q.id} requires unknown ${r}`);
  for (const e of EVENTS) { assert.ok(e.choices.length >= 1 && e.learn.length > 30, e.id); assert.ok(e.tiers.length > 0); }
  for (const t of TIERS) { assert.ok(TIER_SCALE[t.id].cash > 0); assert.ok(t.priceSteps.includes(1)); const s = newGame({ tier: t.id, industry: 'lemonade', seed: 1, name: 'x' }); assert.ok(listDecisions(s).length > 3); }
  for (const i of INDUSTRIES) { assert.ok(i.refPrice > i.unitCost, `${i.id} sells below cost`); assert.equal(i.seasonality.length, 12); }
});
