/**
 * Business simulation engine. Pure and seeded: the same seed and the same choices always produce the
 * same game, so games can be saved, replayed and tested. The model is a deliberate simplification so
 * cause and effect are visible: price against demand, marketing against awareness, quality against
 * reputation, legal and IP protection against the cost of a dispute.
 *
 * Money rule: every cash change is categorised (revenue, cost of goods, operating costs, one-offs,
 * interest, tax, capital spending, loans, equity), so the balance sheet always balances.
 */
import type { Config, Effects, Cond, Conditional, SimEvent, Quest, Special, Legal, IpPortfolio, Rng } from '../../data/bizSim/types';
import { TIER_SCALE, tierDef, industryDef, QUESTS, EVENTS, questById, eventById } from '../../data/bizSim/content';

export interface TurnRecord {
  turn: number; revenue: number; otherIncome: number; cogs: number; opex: number; oneOff: number; interest: number; tax: number; depreciation: number; capex: number;
  loanIn: number; loanOut: number; equityIn: number; profit: number; cashEnd: number; sold: number; customers: number; stockout: boolean; notes: string[];
}
export interface EventResult { id: string; choice: number; learn: string; result?: string; links?: string[] }
export interface SimState {
  cfg: Config; turn: number; phase: 'operate' | 'ended'; endReason?: 'finished' | 'bankrupt';
  cash: number; debt: number; contributed: number; retained: number; equipment: number; equityPct: number;
  price: number; quality: number; awareness: number; reputation: number; staff: number; extraCapacity: number; demandMod: number;
  legal: Legal; ip: IpPortfolio;
  done: string[]; pendingQuests: Record<string, number>; specialsDone: string[];
  history: TurnRecord[]; xp: number; badges: string[]; seenEvents: string[]; pending?: string; lastEvent?: EventResult; negCash: number;
  startCash: number; version: 1;
}

export const seededRng = (seed: number): Rng => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function newGame(cfg: Config): SimState {
  const t = tierDef(cfg.tier), ind = industryDef(cfg.industry), S = TIER_SCALE[cfg.tier];
  const startCash = Math.round(S.cash * ind.startCash);
  return {
    cfg, turn: 0, phase: 'operate', cash: startCash, debt: 0, contributed: startCash, retained: 0, equipment: 0, equityPct: 0,
    price: ind.refPrice, quality: 50, awareness: 10, reputation: cfg.tier === 'seedling' || cfg.tier === 'sprout' ? 60 : 50, staff: ind.startStaff, extraCapacity: 0, demandMod: 0,
    legal: { entity: 'none', ein: false, bank: false, insurance: false, license: false, records: false },
    ip: { trademark: 'none', tmTurnsLeft: 0, copyrights: 0, patent: 'none', patentTurnsLeft: 0, secrets: false, licensesOut: 0 },
    done: [], pendingQuests: {}, specialsDone: [], history: [], xp: 0, badges: [], seenEvents: [], negCash: 0, startCash, version: 1,
  };
  void t;
}

// ── Decisions the player can take each turn ────────────────────────────────────────────────────────
export interface Decision { id: string; group: 'growth' | 'people' | 'money' | 'setup' | 'industry'; label: string; desc: string; cost: number; disabled?: string; kind: 'spend' | 'loan' | 'repay' | 'equity' | 'quest' | 'special' }

const unitScale = (s: SimState) => ({ S: TIER_SCALE[s.cfg.tier], ind: industryDef(s.cfg.industry), t: tierDef(s.cfg.tier) });
export const loanSize = (s: SimState) => { const { S, ind } = unitScale(s); return Math.round(ind.fixedCost * S.fixed * 5); };
export const marketingCost = (s: SimState, size: 0 | 1 | 2) => { const { S, ind } = unitScale(s); return r2(ind.fixedCost * S.fixed * [0.12, 0.35, 0.8][size]); };
export const qualityCost = (s: SimState) => { const { S, ind } = unitScale(s); return r2(ind.fixedCost * S.fixed * 0.4); };
export const equipmentCost = (s: SimState) => { const { S, ind } = unitScale(s); return r2(ind.fixedCost * S.fixed * 1.6); };
export const salaryOf = (s: SimState) => { const { S, ind } = unitScale(s); return r2(ind.salary * S.fixed); };
export const raiseAmount = (s: SimState) => { const { S, ind } = unitScale(s); return Math.round(ind.fixedCost * S.fixed * 9); };

const questOk = (s: SimState, q: Quest) => {
  if (!q.tiers.includes(s.cfg.tier)) return false; if (q.industries && !q.industries.includes(s.cfg.industry)) return false;
  if (!q.repeatable && s.done.includes(q.id)) return false; if (s.pendingQuests[q.id] !== undefined) return false;
  return (q.requires || []).every(r => s.done.includes(r));
};
export const availableQuests = (s: SimState) => QUESTS.filter(q => questOk(s, q));

export function listDecisions(s: SimState): Decision[] {
  const { t, ind } = unitScale(s); const out: Decision[] = [];
  const mk = (size: 0 | 1 | 2, label: string) => out.push({ id: `mkt-${size}`, group: 'growth', label, desc: `Raises awareness (now ${Math.round(s.awareness)}).`, cost: marketingCost(s, size), kind: 'spend' });
  mk(0, s.cfg.tier === 'seedling' ? 'Hand out flyers' : 'Small ad'); mk(1, s.cfg.tier === 'seedling' ? 'Put up a big sign' : 'Medium campaign'); mk(2, s.cfg.tier === 'seedling' ? 'Tell the whole street' : 'Big campaign');
  out.push({ id: 'quality', group: 'growth', label: s.cfg.tier === 'seedling' ? 'Make it extra yummy' : 'Improve quality', desc: `Customers love a better product (now ${Math.round(s.quality)}).`, cost: qualityCost(s), kind: 'spend' });
  if (t.staff) {
    out.push({ id: 'hire', group: 'people', label: s.cfg.tier === 'sprout' ? 'Ask a friend to help' : 'Hire a helper', desc: `More capacity; costs ${salaryOf(s)} each ${t.turnName.toLowerCase()}.`, cost: 0, kind: 'spend' });
    out.push({ id: 'fire', group: 'people', label: 'Let a helper go', desc: 'Lower costs, lower capacity.', cost: 0, kind: 'spend', disabled: s.staff <= ind.startStaff ? 'No extra helpers' : undefined });
    out.push({ id: 'equipment', group: 'people', label: 'Buy equipment', desc: 'Permanently more capacity.', cost: equipmentCost(s), kind: 'spend' });
  }
  if (t.debt) {
    out.push({ id: 'loan', group: 'money', label: s.cfg.tier === 'sprout' ? 'Borrow from the family bank' : 'Take a loan', desc: `Borrow ${loanSize(s)} at ${Math.round(t.interest * 1000) / 10}% per ${t.turnName.toLowerCase()}.`, cost: 0, kind: 'loan', disabled: s.debt >= loanSize(s) * 3 ? 'You owe a lot already' : undefined });
    out.push({ id: 'repay', group: 'money', label: 'Pay back some debt', desc: 'Pay back one loan chunk.', cost: Math.min(loanSize(s), s.debt), kind: 'repay', disabled: s.debt <= 0 ? 'No debt' : undefined });
  }
  if (t.equity) out.push({ id: 'equity', group: 'money', label: 'Sell a share of the company', desc: `Raise ${raiseAmount(s)} for 10% ownership. You cannot get it back.`, cost: 0, kind: 'equity', disabled: s.equityPct >= 40 ? 'Too much sold already' : s.legal.entity === 'llc' || s.legal.entity === 'ccorp' ? (s.reputation < 40 ? 'Investors want a reputation of 40+' : undefined) : 'Investors need a company (LLC or corporation)' });
  for (const q of availableQuests(s)) out.push({ id: `q:${q.id}`, group: 'setup', label: q.title, desc: q.kid, cost: q.cost, kind: 'quest' });
  for (const sp of ind.specials) if (sp.tiers.includes(s.cfg.tier) && !(sp.once && s.specialsDone.includes(sp.id))) {
    const missing = (sp.requires || []).find(r => !hasCond(s, r as Cond));
    out.push({ id: `sp:${sp.id}`, group: 'industry', label: sp.label, desc: sp.desc, cost: sp.cost, kind: 'special', disabled: missing ? `Needs ${missing}` : undefined });
  }
  return out;
}

export function hasCond(s: SimState, c: Cond): boolean {
  switch (c) {
    case 'trademark': return s.ip.trademark === 'registered';
    case 'copyright': return s.ip.copyrights > 0;
    case 'patent': return s.ip.patent === 'granted' || s.ip.patent === 'pending' || s.ip.patent === 'provisional';
    case 'llc': return s.legal.entity === 'llc' || s.legal.entity === 'ccorp';
    case 'insurance': return s.legal.insurance;
    case 'bank': return s.legal.bank;
    case 'ein': return s.legal.ein;
    case 'records': return s.legal.records;
    case 'secrets': return s.ip.secrets;
    case 'license': return s.legal.license || s.ip.licensesOut > 0;
  }
}

// ── Market ────────────────────────────────────────────────────────────────────────────────────────────
export function capacityOf(s: SimState): number { const { S, ind } = unitScale(s); return Math.max(1, Math.round(s.staff * ind.capacityPerStaff * S.market + s.extraCapacity)); }
export function demandAt(s: SimState, price: number, rng?: Rng): number {
  const { S, ind } = unitScale(s); const seas = s.cfg.tier === 'seedling' || s.cfg.tier === 'sprout' ? 1 : ind.seasonality[s.turn % 12];
  const base = ind.baseMarket * S.market * seas * (1 + s.demandMod);
  const aw = 0.25 + 0.75 * s.awareness / 100, ql = 0.5 + s.quality / 100, pf = clamp(Math.pow(ind.refPrice / price, ind.elasticity), 0.15, 2.6), rf = 0.6 + s.reputation / 125;
  return Math.max(0, Math.round(base * aw * ql * pf * rf * (rng ? 0.92 + 0.16 * rng() : 1)));
}

// ── Effects ────────────────────────────────────────────────────────────────────────────────────────────
const kidTier = (s: SimState) => s.cfg.tier === 'seedling' || s.cfg.tier === 'sprout';
const KID_SCALE: Record<string, number> = { seedling: 1, sprout: 1, builder: 4, founder: 12, executive: 50 };
const REAL_SCALE: Record<string, number> = { seedling: 1, sprout: 1, builder: 0.5, founder: 1, executive: 3 };
export const eventCashScale = (s: SimState, ev: SimEvent) => (ev.tiers.includes('seedling') || ev.tiers.includes('sprout') ? KID_SCALE : REAL_SCALE)[s.cfg.tier] ?? 1;

function bump(s: SimState, delta: number, rec: TurnRecord | undefined) {
  s.cash = r2(s.cash + delta); s.retained = r2(s.retained + delta);
  if (rec) { if (delta >= 0) rec.otherIncome = r2(rec.otherIncome + delta); else rec.oneOff = r2(rec.oneOff - delta); rec.profit = r2(rec.profit + delta); rec.cashEnd = s.cash; }
}
export function applyEffects(s: SimState, e: Effects, cashScale = 1, rec?: TurnRecord): void {
  if (e.cash) bump(s, Math.round(e.cash * cashScale), rec);
  if (e.reputation) s.reputation = clamp(s.reputation + e.reputation, 0, 100);
  if (e.quality) s.quality = clamp(s.quality + e.quality, 0, 100);
  if (e.awareness) s.awareness = clamp(s.awareness + e.awareness, 0, 100);
  if (e.demand) s.demandMod = clamp(s.demandMod + e.demand, -0.6, 1.5);
  if (e.capacity) s.extraCapacity = Math.max(0, s.extraCapacity + e.capacity * TIER_SCALE[s.cfg.tier].market);
  if (e.staff) s.staff = Math.max(1, s.staff + e.staff);
  if (e.xp) s.xp += e.xp;
  if (e.equityPct) s.equityPct = clamp(s.equityPct + e.equityPct, 0, 100);
}

// ── Events ────────────────────────────────────────────────────────────────────────────────────────────────
function gateOk(s: SimState, g: SimEvent['gate']): boolean {
  switch (g) {
    case undefined: return true;
    case 'no-trademark': return s.ip.trademark !== 'registered';
    case 'has-trademark': return s.ip.trademark === 'registered';
    case 'no-llc': return !(s.legal.entity === 'llc' || s.legal.entity === 'ccorp');
    case 'has-copyright': return s.ip.copyrights > 0;
    case 'has-patent': return hasCond(s, 'patent');
    case 'has-debt': return s.debt > 0;
    case 'no-records': return !s.legal.records;
    case 'growing': { const h = s.history; return s.awareness > 35 || (h.length >= 2 && h[h.length - 1].sold > h[h.length - 2].sold); }
  }
}
export function eligibleEvents(s: SimState): SimEvent[] {
  return EVENTS.filter(e => e.tiers.includes(s.cfg.tier) && (!e.industries || e.industries.includes(s.cfg.industry)) && s.turn >= (e.minTurn ?? 0) && !s.seenEvents.includes(e.id) && gateOk(s, e.gate));
}
function drawEvent(s: SimState, rng: Rng): SimEvent | null {
  const t = tierDef(s.cfg.tier); if (!t.events || rng() > (kidTier(s) ? 0.55 : 0.5)) return null;
  const pool = eligibleEvents(s); if (!pool.length) return null;
  const total = pool.reduce((a, e) => a + (e.weight ?? 1), 0); let x = rng() * total;
  for (const e of pool) { x -= e.weight ?? 1; if (x <= 0) return e; }
  return pool[pool.length - 1];
}

/** Resolve the player's choice for the pending event. Returns a new state. */
export function resolveEvent(prev: SimState, choiceIndex: number): SimState {
  if (!prev.pending) return prev; const s: SimState = structuredClone(prev);
  const ev = eventById(s.pending!); const ch = ev.choices[clamp(choiceIndex, 0, ev.choices.length - 1)]; const scale = eventCashScale(s, ev);
  const rec = s.history[s.history.length - 1];
  applyEffects(s, ch.effects, scale, rec);
  for (const c of (ch.conditional || []) as Conditional[]) applyEffects(s, hasCond(s, c.when) ? c.then : (c.else || {}), scale, rec);
  s.seenEvents.push(ev.id); s.xp += 10; if (!s.badges.includes('survivor') && ev.choices.some(c => (c.effects.cash || 0) < 0)) s.badges.push('survivor');
  s.lastEvent = { id: ev.id, choice: choiceIndex, learn: ev.learn, result: ch.result, links: ev.links }; s.pending = undefined;
  if (s.cash < 0 && !tierDef(s.cfg.tier).failure) { const gift = -s.cash; s.cash = 0; s.contributed = r2(s.contributed + gift); if (rec) { rec.equityIn = r2(rec.equityIn + gift); rec.cashEnd = 0; rec.notes.push('A grown-up lent you a few coins to keep going.'); } }
  return s;
}

// ── One turn ────────────────────────────────────────────────────────────────────────────────────────────────
export interface TurnInput { priceIdx?: number; picks: string[] }
export interface TurnOutcome { ok: boolean; errors: string[]; state: SimState; record?: TurnRecord }

/**
 * Order of play: (1) timers from earlier turns tick (quests, trademark, patent); (2) financing is
 * taken; (3) spending decisions are checked against cash and applied; (4) the market runs; (5) costs,
 * interest, depreciation and tax are charged and cash is settled in ONE place; (6) dynamics; (7) an
 * event may be drawn. Money is categorised so the balance sheet always balances.
 */
export function playTurn(prev: SimState, input: TurnInput): TurnOutcome {
  if (prev.phase === 'ended') return { ok: false, errors: ['The game is over.'], state: prev };
  if (prev.pending) return { ok: false, errors: ['Handle the event first.'], state: prev };
  const s: SimState = structuredClone(prev); const { S, ind, t } = unitScale(s); const rng = seededRng(s.cfg.seed * 7919 + s.turn * 104729 + 17);
  const decisions = listDecisions(s); const byId = new Map(decisions.map(d => [d.id, d]));
  const rec: TurnRecord = { turn: s.turn + 1, revenue: 0, otherIncome: 0, cogs: 0, opex: 0, oneOff: 0, interest: 0, tax: 0, depreciation: 0, capex: 0, loanIn: 0, loanOut: 0, equityIn: 0, profit: 0, cashEnd: 0, sold: 0, customers: 0, stockout: false, notes: [] };

  // (1) timers from earlier turns
  for (const [qid, left] of Object.entries(s.pendingQuests)) { if (left <= 1) { delete s.pendingQuests[qid]; finishQuest(s, questById(qid), rec); } else s.pendingQuests[qid] = left - 1; }
  if (s.ip.trademark === 'pending') { s.ip.tmTurnsLeft -= 1; if (s.ip.tmTurnsLeft <= 0) { s.ip.trademark = 'registered'; s.reputation = clamp(s.reputation + 3, 0, 100); rec.notes.push('Your trademark was registered!'); } }
  if (s.ip.patent === 'provisional') { s.ip.patentTurnsLeft -= 1; if (s.ip.patentTurnsLeft <= 0) { s.ip.patent = 'none'; rec.notes.push('Your provisional patent application expired without a full application.'); } }

  if (input.priceIdx !== undefined) s.price = r2(ind.refPrice * (t.priceSteps[clamp(input.priceIdx, 0, t.priceSteps.length - 1)] ?? 1));

  // (2) financing
  const picks = [...new Set(input.picks)]; const errors: string[] = [];
  for (const id of picks) {
    const d = byId.get(id); if (!d) { errors.push(`Unknown choice ${id}`); continue; } if (d.disabled) { errors.push(`${d.label}: ${d.disabled}`); continue; }
    if (d.kind === 'loan') { const a = loanSize(s); s.debt += a; s.cash = r2(s.cash + a); rec.loanIn += a; rec.notes.push(`Borrowed ${a}.`); }
    if (d.kind === 'repay') { const a = r2(Math.min(loanSize(s), s.debt, Math.max(0, s.cash))); s.debt = r2(s.debt - a); s.cash = r2(s.cash - a); rec.loanOut += a; rec.notes.push(`Paid back ${a}.`); }
    if (d.kind === 'equity') { const a = raiseAmount(s); s.cash = r2(s.cash + a); s.contributed = r2(s.contributed + a); s.equityPct += 10; rec.equityIn += a; rec.notes.push(`Raised ${a} for 10% of the company.`); }
  }

  // (3) spending
  const spendDs = picks.map(id => byId.get(id)).filter((d): d is Decision => !!d && !d.disabled && (d.kind === 'spend' || d.kind === 'quest' || d.kind === 'special') && !(d.id === 'fire' && s.staff <= ind.startStaff));
  const total = r2(spendDs.reduce((a, d) => a + d.cost, 0));
  if (total > s.cash + 1e-9) return { ok: false, errors: [...errors, `That costs ${total} but you have ${s.cash}. Choose less, or borrow first.`], state: prev };
  for (const d of spendDs) {
    if (d.id.startsWith('mkt-')) { const size = +d.id.slice(4) as 0 | 1 | 2; s.awareness = clamp(s.awareness + [6, 14, 24][size] * (1 - s.awareness / 130), 0, 100); rec.opex = r2(rec.opex + d.cost); rec.notes.push(`${d.label}.`); }
    else if (d.id === 'quality') { s.quality = clamp(s.quality + 7 * (1 - s.quality / 130), 0, 100); rec.opex = r2(rec.opex + d.cost); rec.notes.push('Quality improved.'); }
    else if (d.id === 'hire') { s.staff += 1; rec.notes.push('Hired a helper.'); }
    else if (d.id === 'fire') { s.staff = Math.max(ind.startStaff, s.staff - 1); rec.notes.push('Let a helper go.'); }
    else if (d.id === 'equipment') { s.equipment = r2(s.equipment + d.cost); rec.capex = r2(rec.capex + d.cost); s.extraCapacity += ind.capacityPerStaff * S.market * 0.5; rec.notes.push('Bought equipment.'); }
    else if (d.id.startsWith('q:')) applyQuest(s, questById(d.id.slice(2)), rec);
    else if (d.id.startsWith('sp:')) {
      const sp = ind.specials.find(x => `sp:${x.id}` === d.id) as Special; rec.oneOff = r2(rec.oneOff + sp.cost);
      if (sp.effects.cash) rec.otherIncome = r2(rec.otherIncome + sp.effects.cash);
      applyEffects(s, { ...sp.effects, cash: 0 }, 1); if (sp.once) s.specialsDone.push(sp.id); rec.notes.push(`${sp.label}.`);
    }
  }

  // (4) market
  const customers = demandAt(s, s.price, rng); const cap = capacityOf(s); const sold = Math.min(customers, cap);
  rec.customers = customers; rec.sold = sold; rec.stockout = customers > cap * 1.05;
  rec.revenue = r2(sold * s.price); rec.cogs = r2(sold * ind.unitCost);

  // (5) costs, interest, depreciation, tax, then settle cash once
  rec.opex = r2(rec.opex + ind.fixedCost * S.fixed + Math.max(0, s.staff - ind.startStaff) * ind.salary * S.fixed);
  if (s.ip.licensesOut > 0) { const lic = r2(s.ip.licensesOut * ind.refPrice * ind.baseMarket * 0.1 * S.market * (s.ip.copyrights > 0 || s.ip.trademark === 'registered' ? 1 : 0.5)); rec.otherIncome = r2(rec.otherIncome + lic); rec.notes.push(`Licensing income ${lic}.`); }
  rec.interest = r2(s.debt * t.interest);
  rec.depreciation = r2(s.equipment * 0.1); s.equipment = r2(s.equipment - rec.depreciation);
  const pretax = r2(rec.revenue + rec.otherIncome - rec.cogs - rec.opex - rec.oneOff - rec.interest - rec.depreciation);
  rec.tax = t.taxes && pretax > 0 ? r2(pretax * t.taxRate * (s.legal.entity === 'none' ? 1.2 : 1)) : 0;
  rec.profit = r2(pretax - rec.tax);
  s.cash = r2(s.cash + rec.revenue + rec.otherIncome - rec.cogs - rec.opex - rec.oneOff - rec.interest - rec.tax - rec.capex);
  s.retained = r2(s.retained + rec.profit); rec.cashEnd = s.cash;

  // (6) dynamics
  if (rec.stockout) { s.reputation = clamp(s.reputation - 3, 0, 100); rec.notes.push('You ran out of capacity and turned customers away.'); }
  else s.reputation = clamp(s.reputation + (s.quality - 45) / 40, 0, 100);
  s.awareness = clamp(s.awareness * 0.92, 0, 100); s.quality = clamp(s.quality - 0.4, 0, 100);
  s.history.push(rec); s.turn += 1; awardTurnXp(s, rec);

  if (s.cash < 0) {
    if (t.failure) { s.negCash += 1; rec.notes.push('You are out of cash.'); if (s.negCash >= 2) { s.phase = 'ended'; s.endReason = 'bankrupt'; } }
    else { const gift = -s.cash; s.cash = 0; s.contributed = r2(s.contributed + gift); rec.equityIn = r2(rec.equityIn + gift); rec.cashEnd = 0; rec.notes.push('A grown-up lent you a few coins to keep going.'); }
  } else s.negCash = 0;
  if (s.phase !== 'ended' && s.turn >= t.turns) { s.phase = 'ended'; s.endReason = 'finished'; }
  // (7) event
  if (s.phase !== 'ended') { const ev = drawEvent(s, rng); if (ev) s.pending = ev.id; }
  updateBadges(s);
  return { ok: true, errors, state: s, record: rec };
}

function applyQuest(s: SimState, q: Quest, rec: TurnRecord) {
  rec.oneOff = r2(rec.oneOff + q.cost); // legal and IP fees are expensed in the simulation
  if (q.turns > 0 && !q.ip?.trademark) { s.pendingQuests[q.id] = q.turns; rec.notes.push(`${q.title}: started (takes ${q.turns} ${tierDef(s.cfg.tier).turnName.toLowerCase()}${q.turns > 1 ? 's' : ''}).`); return; }
  finishQuest(s, q, rec);
}
function finishQuest(s: SimState, q: Quest, rec: TurnRecord) {
  if (q.sets) Object.assign(s.legal, q.sets);
  if (q.ip) {
    const { tmTurnsLeft, licensesOut, ...rest } = q.ip; Object.assign(s.ip, rest);
    if (rest.trademark === 'pending') s.ip.tmTurnsLeft = tmTurnsLeft ?? q.turns;
    if (licensesOut) s.ip.licensesOut += licensesOut;
  }
  if (q.copyright) s.ip.copyrights += q.copyright;
  if (q.effects) applyEffects(s, { ...q.effects, cash: 0 }, 1);
  if (!s.done.includes(q.id)) s.done.push(q.id);
  rec.notes.push(`Done: ${q.title}.`);
}

function awardTurnXp(s: SimState, rec: TurnRecord) { s.xp += 10 + Math.max(0, Math.min(40, Math.round(rec.profit / Math.max(1, s.startCash) * 100))); }

function updateBadges(s: SimState) {
  const add = (id: string) => { if (!s.badges.includes(id)) s.badges.push(id); };
  if (s.history.some(h => h.sold > 0)) add('first-sale'); if (s.history.some(h => h.profit > 0)) add('profit');
  const h = s.history; if (h.length >= 3 && h.slice(-3).every(x => x.profit > 0)) add('streak');
  if (s.ip.trademark === 'registered') add('protected'); if (s.ip.copyrights > 0) add('creator'); if (s.ip.licensesOut > 0) add('licensor');
  if ((s.legal.entity !== 'none' || kidTier(s)) && s.legal.bank && s.legal.records) add('official');
  if (s.phase === 'ended' && s.endReason === 'finished' && s.cash > s.startCash * 2) add('cash-king');
}

// ── Level, statements, report ──────────────────────────────────────────────────────────────────────────
export const LEVELS = [0, 60, 150, 280, 450, 700, 1000, 1400, 1900, 2600];
export const levelOf = (xp: number) => LEVELS.reduce((l, min, i) => (xp >= min ? i + 1 : l), 1);

export interface Statements {
  pl: { revenue: number; otherIncome: number; cogs: number; grossProfit: number; opex: number; oneOff: number; depreciation: number; interest: number; tax: number; netProfit: number };
  bs: { cash: number; equipment: number; assets: number; debt: number; liabilities: number; contributed: number; retained: number; equity: number };
  cf: { operating: number; investing: number; financing: number; netChange: number };
}
export function statements(s: SimState): Statements {
  const sum = (k: keyof TurnRecord) => r2(s.history.reduce((a, h) => a + (h[k] as number), 0));
  const revenue = sum('revenue'), otherIncome = sum('otherIncome'), cogs = sum('cogs'), opex = sum('opex'), oneOff = sum('oneOff'), dep = sum('depreciation'), interest = sum('interest'), tax = sum('tax');
  const net = r2(revenue + otherIncome - cogs - opex - oneOff - dep - interest - tax);
  const assets = r2(s.cash + s.equipment), liabilities = s.debt, equity = r2(s.contributed + s.retained);
  const capex = sum('capex'), loanIn = sum('loanIn'), loanOut = sum('loanOut'), equityIn = sum('equityIn');
  return {
    pl: { revenue, otherIncome, cogs, grossProfit: r2(revenue - cogs), opex, oneOff, depreciation: dep, interest, tax, netProfit: net },
    bs: { cash: s.cash, equipment: s.equipment, assets, debt: s.debt, liabilities, contributed: s.contributed, retained: s.retained, equity },
    cf: { operating: r2(net + dep), investing: r2(-capex), financing: r2(loanIn - loanOut + equityIn), netChange: r2(s.cash - s.startCash) },
  };
}

export function ipScore(s: SimState): number { return (s.ip.trademark === 'registered' ? 1 : s.ip.trademark === 'pending' ? 0.5 : 0) + Math.min(2, s.ip.copyrights) * 0.5 + (s.ip.patent === 'none' ? 0 : 0.75) + (s.ip.secrets ? 0.5 : 0) + Math.min(2, s.ip.licensesOut) * 0.25; }
export function protectionScore(s: SimState): number { const l = s.legal; return (l.entity !== 'none' ? 2 : 0) + (l.ein ? 1 : 0) + (l.bank ? 1 : 0) + (l.insurance ? 1 : 0) + (l.records ? 1 : 0) + (l.license ? 1 : 0) + Math.min(4, ipScore(s) * 1.5); }

export interface Report { stars: 1 | 2 | 3 | 4 | 5; companyValue: number; netWorth: number; ownerShare: number; protection: number; lessons: string[]; outcome: 'finished' | 'bankrupt' | 'running' }
export function report(s: SimState): Report {
  const st = statements(s); const netWorth = r2(st.bs.equity); const last3 = s.history.slice(-3); const avgProfit = last3.length ? last3.reduce((a, h) => a + h.profit, 0) / last3.length : 0;
  const companyValue = Math.max(0, Math.round(netWorth + avgProfit * 6 * (1 + 0.15 * ipScore(s))));
  const ratio = companyValue / Math.max(1, s.startCash);
  const stars = (s.endReason === 'bankrupt' ? 1 : ratio < 0.7 ? 1 : ratio < 1.1 ? 2 : ratio < 1.8 ? 3 : ratio < 3 ? 4 : 5) as Report['stars'];
  const lessons: string[] = [];
  if (!s.legal.records) lessons.push('Keep records from day one: they make tax time and funding conversations easy.');
  if (s.legal.entity === 'none' && !kidTier(s)) lessons.push('Registering as a business separates paperwork and, with a company, protects your personal assets.');
  if (!s.legal.insurance && s.cfg.tier === 'founder') lessons.push('Insurance turns a possible disaster into a manageable cost.');
  if (s.ip.trademark !== 'registered' && !kidTier(s)) lessons.push('Protect your brand name early. A registered trademark makes copycats far cheaper to stop.');
  if (s.ip.copyrights === 0 && (s.cfg.tier === 'founder' || s.cfg.tier === 'executive')) lessons.push('Register your important original works. In the US, registration is generally needed before you can sue.');
  if (s.history.length && s.history.filter(h => h.stockout).length > s.history.length / 3) lessons.push('You often ran out of capacity. Growth needs staff and equipment to match demand.');
  if (st.pl.interest > st.pl.netProfit && st.pl.interest > 0) lessons.push('Interest took a big bite. Borrow only what you can pay back from profit.');
  return { stars, companyValue, netWorth, ownerShare: Math.round(companyValue * (1 - s.equityPct / 100)), protection: Math.round(protectionScore(s) * 10) / 10, lessons, outcome: s.phase === 'ended' ? (s.endReason || 'finished') : 'running' };
}
