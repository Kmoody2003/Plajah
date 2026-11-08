// SBML (Systems Biology Markup Language, levels 2 and 3 core): our own reader and simulator.
// Covers compartments, species, parameters, function definitions, initial assignments,
// assignment and rate rules, and reactions with local parameters. Events and algebraic rules
// are reported, not simulated (yet).
//
// Semantics follow the SBML spec: state is species AMOUNTS; a species name inside maths means
// its concentration (amount / compartment size) unless hasOnlySubstanceUnits; a kinetic law
// is a rate in substance per time; d(amount)/dt = sum of stoichiometry x rate.

import { parseXml, type XNode } from '../tela/geometry/xml';
import { type Expr, type Fn, type Getter, fromMathML, lambdaArgs, evaluate, toInfix, compileExpr, symbols } from './math';
import { solve, ros23, dopri5, linspace, colorColumns, type Solution, type JacPattern } from './ode';

export interface Species { id: string; name: string; compartment: string; initial: number; initialIsAmount: boolean; boundary: boolean; constant: boolean; onlySubstance: boolean }
export interface Param { id: string; name: string; value: number; constant: boolean }
export interface Compartment { id: string; name: string; size: number; constant: boolean }
export interface SpeciesRef { species: string; stoich: number }
export interface Reaction { id: string; name: string; reversible: boolean; reactants: SpeciesRef[]; products: SpeciesRef[]; modifiers: string[]; law: Expr | null; local: Record<string, number> }
export interface Rule { kind: 'assignment' | 'rate'; variable: string; math: Expr }
/** SBML event: when `trigger` turns true, the assignments run (after `delay`, if any). */
export interface BioEvent { id: string; trigger: Expr; delay?: Expr; assignments: Array<{ variable: string; math: Expr }>; useValuesFromTriggerTime: boolean; initialValue: boolean; persistent: boolean }

export interface BioModel {
  id: string; name: string; notes: string;
  compartments: Compartment[]; species: Species[]; params: Param[]; reactions: Reaction[];
  rules: Rule[]; initialAssignments: Array<{ symbol: string; math: Expr }>; functions: Record<string, Fn>; events: BioEvent[];
  warnings: string[];
}

const local = (tag: string) => tag.replace(/^.*:/, '');
const kids = (n: XNode, name?: string) => n.children.filter(c => !c.tag.startsWith('#') && (!name || local(c.tag) === name));
const find = (n: XNode | undefined, name: string) => n ? kids(n, name)[0] : undefined;
const num = (v: string | undefined, d = NaN) => { const x = v === undefined ? NaN : parseFloat(v); return Number.isFinite(x) ? x : d; };
const bool = (v: string | undefined, d = false) => v === undefined ? d : v === 'true' || v === '1';
const plain = (n?: XNode): string => n ? ((n.text || '') + ' ' + n.children.map(plain).join(' ')).replace(/\s+/g, ' ').trim() : '';

export function parseSbml(xml: string): BioModel {
  // The XML reader joins a node's text runs, so "1<sep/>0" (e-notation) would read as "10": keep them apart.
  const root = parseXml(xml.replace(/<(?:\w+:)?sep\s*\/>/g, ' $& ')); const sbml = kids(root).find(n => local(n.tag) === 'sbml');
  if (!sbml) throw new Error('Not an SBML file (no <sbml> element).');
  const level = num(sbml.attrs.level, 3); const model = find(sbml, 'model');
  if (!model) throw new Error('SBML file has no <model>.');
  const warnings: string[] = [];
  const list = (name: string, item: string) => kids(find(model, name) ?? { tag: '', attrs: {}, children: [], text: '' }, item);

  const functions: Record<string, Fn> = {};
  for (const f of list('listOfFunctionDefinitions', 'functionDefinition')) {
    const m = find(f, 'math'); if (!m) continue;
    try { functions[f.attrs.id] = { args: lambdaArgs(kids(m)[0] ?? m), body: fromMathML(m) }; } catch (e) { warnings.push(`Function ${f.attrs.id}: ${(e as Error).message}`); }
  }
  const compartments: Compartment[] = list('listOfCompartments', 'compartment').map(c => ({ id: c.attrs.id, name: c.attrs.name || c.attrs.id, size: num(c.attrs.size ?? c.attrs.volume, 1), constant: bool(c.attrs.constant, true) }));
  const species: Species[] = list('listOfSpecies', 'species').map(s => {
    const amt = num(s.attrs.initialAmount); const conc = num(s.attrs.initialConcentration);
    return { id: s.attrs.id, name: s.attrs.name || s.attrs.id, compartment: s.attrs.compartment, initial: Number.isFinite(amt) ? amt : Number.isFinite(conc) ? conc : 0, initialIsAmount: Number.isFinite(amt), boundary: bool(s.attrs.boundaryCondition), constant: bool(s.attrs.constant), onlySubstance: bool(s.attrs.hasOnlySubstanceUnits, level < 3 ? false : false) };
  });
  const params: Param[] = list('listOfParameters', 'parameter').map(p => ({ id: p.attrs.id, name: p.attrs.name || p.attrs.id, value: num(p.attrs.value, 0), constant: bool(p.attrs.constant, true) }));
  const math = (n: XNode | undefined, what: string): Expr | null => {
    const m = n && find(n, 'math'); if (!m) return null;
    try { return fromMathML(m); } catch (e) { warnings.push(`${what}: ${(e as Error).message}`); return null; }
  };
  const initialAssignments = list('listOfInitialAssignments', 'initialAssignment').map(a => ({ symbol: a.attrs.symbol, math: math(a, `Initial assignment ${a.attrs.symbol}`) })).filter((a): a is { symbol: string; math: Expr } => !!a.math);
  const rules: Rule[] = [];
  for (const r of kids(find(model, 'listOfRules') ?? { tag: '', attrs: {}, children: [], text: '' })) {
    const kind = local(r.tag); const m = math(r, `Rule for ${r.attrs.variable}`);
    if (kind === 'assignmentRule' && m) rules.push({ kind: 'assignment', variable: r.attrs.variable, math: m });
    else if (kind === 'rateRule' && m) rules.push({ kind: 'rate', variable: r.attrs.variable, math: m });
    else if (kind === 'algebraicRule') warnings.push('Algebraic rules are not simulated yet.');
  }
  const refs = (r: XNode, listName: string): SpeciesRef[] => kids(find(r, listName) ?? { tag: '', attrs: {}, children: [], text: '' }, 'speciesReference').map(s => ({ species: s.attrs.species, stoich: num(s.attrs.stoichiometry, 1) }));
  const reactions: Reaction[] = list('listOfReactions', 'reaction').map(r => {
    const kl = find(r, 'kineticLaw'); const localParams: Record<string, number> = {};
    for (const p of [...kids(find(kl, 'listOfParameters') ?? { tag: '', attrs: {}, children: [], text: '' }, 'parameter'), ...kids(find(kl, 'listOfLocalParameters') ?? { tag: '', attrs: {}, children: [], text: '' }, 'localParameter')]) localParams[p.attrs.id] = num(p.attrs.value, 0);
    const law = math(kl, `Reaction ${r.attrs.id}`);
    if (!law) warnings.push(`Reaction ${r.attrs.id} has no rate law; it will not run.`);
    return { id: r.attrs.id, name: r.attrs.name || r.attrs.id, reversible: bool(r.attrs.reversible, level < 3), reactants: refs(r, 'listOfReactants'), products: refs(r, 'listOfProducts'), modifiers: kids(find(r, 'listOfModifiers') ?? { tag: '', attrs: {}, children: [], text: '' }, 'modifierSpeciesReference').map(m => m.attrs.species), law, local: localParams };
  });
  const events: BioEvent[] = [];
  for (const ev of list('listOfEvents', 'event')) {
    const trig = find(ev, 'trigger'); const trigger = math(trig, `Event ${ev.attrs.id ?? ''} trigger`);
    if (!trigger) { warnings.push(`Event ${ev.attrs.id ?? ''} has no trigger; skipped.`); continue; }
    const delay = math(find(ev, 'delay'), `Event ${ev.attrs.id ?? ''} delay`) ?? undefined;
    const assignments = kids(find(ev, 'listOfEventAssignments') ?? { tag: '', attrs: {}, children: [], text: '' }, 'eventAssignment')
      .map(a => ({ variable: a.attrs.variable, math: math(a, `Event ${ev.attrs.id ?? ''} assignment`) })).filter((a): a is { variable: string; math: Expr } => !!a.math);
    if (find(ev, 'priority')) warnings.push(`Event ${ev.attrs.id ?? ''}: priorities are ignored (events at the same moment run in file order).`);
    events.push({ id: ev.attrs.id || `event${events.length + 1}`, trigger, delay, assignments, useValuesFromTriggerTime: bool(ev.attrs.useValuesFromTriggerTime, true), initialValue: bool(trig?.attrs.initialValue, true), persistent: bool(trig?.attrs.persistent, true) });
  }
  return { id: model.attrs.id || 'model', name: model.attrs.name || model.attrs.id || 'Model', notes: plain(find(model, 'notes')).slice(0, 600), compartments, species, params, reactions, rules, initialAssignments, functions, events, warnings };
}

// ── Simulation ──────────────────────────────────────────────────────────────

export interface SimResult { time: number[]; series: Record<string, number[]>; solution: Solution; ms: number }
export interface SimOptions { tEnd: number; points?: number; params?: Record<string, number>; initial?: Record<string, number>; method?: 'auto' | 'stiff' | 'explicit'; rtol?: number; atol?: number; budgetMs?: number }

/** Build the right-hand side once; evaluation reuses closures and typed arrays. */
export function compile(m: BioModel, o: Pick<SimOptions, 'params' | 'initial'> = {}) {
  const comp = new Map(m.compartments.map(c => [c.id, c.size]));
  const par = new Map(m.params.map(p => [p.id, o.params?.[p.id] ?? p.value]));
  const rateVars = new Set(m.rules.filter(r => r.kind === 'rate').map(r => r.variable));
  const assignVars = new Map(m.rules.filter(r => r.kind === 'assignment').map(r => [r.variable, r.math]));
  // Dynamic state: non-constant, non-boundary species changed by reactions, plus rate-rule targets.
  const sIdx = new Map<string, number>(); const stateIds: string[] = [];
  for (const s of m.species) if (!assignVars.has(s.id) && ((!s.boundary && !s.constant) || rateVars.has(s.id))) { sIdx.set(s.id, stateIds.length); stateIds.push(s.id); }
  for (const v of rateVars) if (!sIdx.has(v)) { sIdx.set(v, stateIds.length); stateIds.push(v); }
  const fixedSpecies = new Map<string, number>(); // boundary/constant species amounts (events may change them)
  const eventTargets = new Set((m.events ?? []).flatMap(e => e.assignments.map(a => a.variable)));
  const speciesById = new Map(m.species.map(s => [s.id, s]));

  let curY: Float64Array = new Float64Array(stateIds.length); let curT = 0;
  const assignCache = new Map<string, number>(); let assignDepth = 0;
  const scope = (name: string): number => {
    const sp = speciesById.get(name);
    if (sp) {
      const amount = sIdx.has(name) ? curY[sIdx.get(name)!] : assignVars.has(name) ? valueOfAssign(name) : fixedSpecies.get(name) ?? 0;
      if (assignVars.has(name)) return amount; // assignment rules give the value in the species' own terms
      return sp.onlySubstance ? amount : amount / (comp.get(sp.compartment) ?? 1);
    }
    if (sIdx.has(name)) return curY[sIdx.get(name)!];
    if (assignVars.has(name)) return valueOfAssign(name);
    if (par.has(name)) return par.get(name)!;
    if (comp.has(name)) return comp.get(name)!;
    throw new Error(`Unknown symbol ${name}`);
  };
  const valueOfAssign = (name: string) => {
    if (assignCache.has(name)) return assignCache.get(name)!;
    if (++assignDepth > 64) throw new Error('Assignment rules loop');
    const v = evaluate(assignVars.get(name)!, scope, curT, m.functions); assignDepth--; assignCache.set(name, v); return v;
  };
  const lawScope = (r: Reaction) => (name: string) => name in r.local ? r.local[name] : scope(name);

  // Initial values (amounts), then initial assignments.
  const y0 = new Float64Array(stateIds.length);
  for (const s of m.species) {
    const size = comp.get(s.compartment) ?? 1; const init = o.initial?.[s.id] ?? s.initial;
    const amount = s.initialIsAmount || s.onlySubstance ? init : init * size;
    if (sIdx.has(s.id)) y0[sIdx.get(s.id)!] = amount; else fixedSpecies.set(s.id, amount);
  }
  for (const v of rateVars) if (!speciesById.has(v)) y0[sIdx.get(v)!] = par.get(v) ?? comp.get(v) ?? 0;
  curY = y0;
  for (const ia of m.initialAssignments) {
    if (o.initial?.[ia.symbol] !== undefined || o.params?.[ia.symbol] !== undefined) continue;
    const v = evaluate(ia.math, scope, 0, m.functions); const sp = speciesById.get(ia.symbol);
    const amount = sp && !sp.onlySubstance ? v * (comp.get(sp.compartment) ?? 1) : v;
    if (sIdx.has(ia.symbol)) y0[sIdx.get(ia.symbol)!] = amount; else if (sp) fixedSpecies.set(ia.symbol, amount); else if (par.has(ia.symbol)) par.set(ia.symbol, v); else if (comp.has(ia.symbol)) comp.set(ia.symbol, v);
  }

  // ── Compile every formula once into closures (names resolved now, not per call) ──
  let stamp = 0; // bumps each evaluation, so assignment-rule values are computed once per call
  const time: Getter = () => curT;
  const assignStamp = new Map<string, number>(); const assignValue = new Map<string, number>(); const assignGetters = new Map<string, Getter>();
  const getterCache = new Map<string, Getter>();
  const sym = (name: string): Getter => {
    const hit = getterCache.get(name); if (hit) return hit;
    let g: Getter;
    const sp = speciesById.get(name);
    if (assignVars.has(name)) {
      g = () => {
        if (assignStamp.get(name) === stamp) return assignValue.get(name)!;
        if (++assignDepth > 64) throw new Error('Assignment rules loop');
        let f = assignGetters.get(name); if (!f) { f = compileExpr(assignVars.get(name)!, sym, time, m.functions); assignGetters.set(name, f); }
        const v = f(); assignDepth--; assignStamp.set(name, stamp); assignValue.set(name, v); return v;
      };
    } else if (sp) {
      const size = comp.get(sp.compartment) ?? 1; const div = sp.onlySubstance ? 1 : size;
      if (sIdx.has(name)) { const k = sIdx.get(name)!; g = div === 1 ? () => curY[k] : () => curY[k] / div; }
      else if (eventTargets.has(name)) g = () => (fixedSpecies.get(name) ?? 0) / div;
      else { const v = (fixedSpecies.get(name) ?? 0) / div; g = () => v; }
    } else if (sIdx.has(name)) { const k = sIdx.get(name)!; g = () => curY[k]; }
    else if (par.has(name) && eventTargets.has(name)) g = () => par.get(name)!;
    else if (par.has(name)) { const v = par.get(name)!; g = () => v; }
    else if (comp.has(name)) { const v = comp.get(name)!; g = () => v; }
    else throw new Error(`Unknown symbol ${name}`);
    getterCache.set(name, g); return g;
  };
  const laws: Getter[] = m.reactions.map(r => r.law ? compileExpr(r.law, n => n in r.local ? (v => () => v)(r.local[n]) : sym(n), time, m.functions) : () => 0);
  // Stoichiometry as flat index lists.
  const effects = m.reactions.map(r => [...r.reactants.map(x => [sIdx.get(x.species), -x.stoich] as const), ...r.products.map(x => [sIdx.get(x.species), x.stoich] as const)]
    .filter((e): e is readonly [number, number] => e[0] !== undefined && !rateVars.has(stateIds[e[0]])));
  const rateRules = m.rules.filter(r => r.kind === 'rate').map(rule => {
    const sp = speciesById.get(rule.variable); const mult = sp && !sp.onlySubstance ? comp.get(sp.compartment) ?? 1 : 1;
    return { k: sIdx.get(rule.variable)!, f: compileExpr(rule.math, sym, time, m.functions), mult };
  });

  const rates = new Float64Array(m.reactions.length);
  const rhs = (t: number, y: Float64Array, out: Float64Array) => {
    curY = y; curT = t; stamp++; out.fill(0);
    for (let i = 0; i < laws.length; i++) {
      const v = laws[i](); rates[i] = v;
      for (const [k, st] of effects[i]) out[k] += st * v;
    }
    for (const r of rateRules) out[r.k] = r.f() * r.mult;
  };
  /** Values to report: concentrations (or amounts for onlySubstance species), assignment-rule values. */
  const reportIds = [...m.species.map(s => s.id), ...[...assignVars.keys()].filter(v => !speciesById.has(v)), ...[...rateVars].filter(v => !speciesById.has(v))];
  const reportGetters = reportIds.map(sym);
  const report = (t: number, y: Float64Array): Record<string, number> => {
    curY = y; curT = t; stamp++; const out: Record<string, number> = {};
    reportIds.forEach((id, i) => { out[id] = reportGetters[i](); });
    return out;
  };
  void lawScope; void assignCache;
  /** Compiled events and a setter that writes a value the way SBML means it (concentrations become amounts). */
  const events = (m.events ?? []).map(e => ({ ...e, trig: compileExpr(e.trigger, sym, time, m.functions), del: e.delay ? compileExpr(e.delay, sym, time, m.functions) : null, vals: e.assignments.map(a => ({ variable: a.variable, f: compileExpr(a.math, sym, time, m.functions) })) }));
  const at = (t: number, y: Float64Array) => { curY = y; curT = t; stamp++; };
  const assign = (name: string, v: number, y: Float64Array) => {
    const sp = speciesById.get(name); const amount = sp && !sp.onlySubstance ? v * (comp.get(sp.compartment) ?? 1) : v;
    if (sIdx.has(name)) y[sIdx.get(name)!] = amount;
    else if (sp) fixedSpecies.set(name, amount);
    else if (par.has(name)) par.set(name, v);
    else throw new Error(`Event assigns ${name}, which is not supported yet`);
  };
  // Jacobian sparsity: which states each equation reads (assignment rules and function bodies followed).
  const reads = (e: Expr, seen = new Set<string>(), out = new Set<number>()): Set<number> => {
    for (const name of symbols(e)) {
      if (seen.has(name)) continue; seen.add(name);
      if (sIdx.has(name)) out.add(sIdx.get(name)!);
      if (assignVars.has(name)) reads(assignVars.get(name)!, seen, out);
    }
    const walk = (x: Expr) => { if (x.k === 'call' && m.functions[x.fn]) reads(m.functions[x.fn].body, seen, out); if (x.k === 'op' || x.k === 'call') x.args.forEach(walk); if (x.k === 'piece') x.pieces.forEach(([a, b]) => { walk(a); walk(b); }); };
    walk(e); return out;
  };
  const rowsOfCol: number[][] = stateIds.map(() => []);
  m.reactions.forEach((r, i) => { if (!r.law) return; const deps = reads(r.law); for (const [k] of effects[i]) for (const j of deps) rowsOfCol[j].push(k); });
  for (const r of m.rules) if (r.kind === 'rate') { const k = sIdx.get(r.variable)!; for (const j of reads(r.math)) rowsOfCol[j].push(k); }
  const jacPattern: JacPattern = colorColumns(rowsOfCol.map(l => [...new Set(l)]), stateIds.length);
  return { rhs, y0, stateIds, report, rates, events, at, assign, laws, effects, sIdx, jacPattern };
}

export function simulate(m: BioModel, o: SimOptions): SimResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const c = compile(m, o); const { rhs, y0 } = c;
  const times = linspace(0, o.tEnd, Math.max(2, o.points ?? 400));
  // Absolute tolerance follows the model's own scale: models in femtolitres hold amounts near 1e-21.
  let scale = 0; for (const v of y0) scale = Math.max(scale, Math.abs(v)); if (!scale) scale = 1;
  const opts = { rtol: o.rtol ?? 1e-6, atol: o.atol ?? 1e-9 * Math.min(1, scale), budgetMs: o.budgetMs, nonNegative: false, jacPattern: c.jacPattern };
  const sol = c.events.length ? withEvents(c, times, opts, o.method ?? 'auto') : o.method === 'stiff' ? ros23(rhs, y0, times, opts) : o.method === 'explicit' ? dopri5(rhs, y0, times, opts) : solve(rhs, y0, times, opts);
  const series: Record<string, number[]> = {};
  sol.y.forEach((y, i) => { const r = c.report(sol.t[i], y); for (const [k, v] of Object.entries(r)) (series[k] ??= []).push(v); });
  return { time: sol.t, series, solution: sol, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
}

type Compiled = ReturnType<typeof compile>;

/**
 * Integrate output interval by output interval. After each piece, any trigger that went from
 * false to true is located by bisection (re-integrating from the start of the piece), its
 * assignments run (now, or after its delay), and integration restarts from that moment.
 */
function withEvents(c: Compiled, times: number[], opts: { rtol: number; atol: number; budgetMs?: number; jacPattern?: JacPattern }, method: 'auto' | 'stiff' | 'explicit'): Solution {
  const out: Solution = { t: [times[0]], y: [c.y0.slice()], steps: 0, rejected: 0, method: method === 'stiff' ? 'ros23' : 'dopri5' };
  let useStiff = method === 'stiff'; const started = Date.now();
  const step = (y: Float64Array, a: number, b: number): Float64Array => {
    if (b - a <= 0) return y.slice();
    const budget = opts.budgetMs ? Math.max(1, opts.budgetMs - (Date.now() - started)) : undefined;
    if (budget !== undefined && Date.now() - started > (opts.budgetMs ?? Infinity)) throw new Error(`Stopped after ${Math.round((opts.budgetMs ?? 0) / 1000)} s at t=${a.toPrecision(4)}`);
    const o2 = { ...opts, budgetMs: budget };
    const r = useStiff ? ros23(c.rhs, y, [a, b], o2) : method === 'explicit' ? dopri5(c.rhs, y, [a, b], o2) : solve(c.rhs, y, [a, b], o2);
    if (r.method === 'ros23') { useStiff = true; out.method = 'ros23'; if (r.stiffSwitch) out.stiffSwitch = true; }
    out.steps += r.steps; out.rejected += r.rejected;
    return r.y[r.y.length - 1];
  };
  const truth = (t: number, y: Float64Array) => { c.at(t, y); return c.events.map(e => !!e.trig()); };
  const pending: Array<{ time: number; ev: number; values: number[] | null }> = [];
  const fire = (i: number, t: number, y: Float64Array) => {
    const e = c.events[i]; c.at(t, y);
    const delay = e.del ? e.del() : 0;
    const values = e.useValuesFromTriggerTime || !delay ? e.vals.map(v => v.f()) : null;
    if (delay > 0) { pending.push({ time: t + delay, ev: i, values }); pending.sort((a, b) => a.time - b.time); return; }
    e.vals.forEach((v, k) => c.assign(v.variable, values![k], y));
  };
  const runDue = (t: number, y: Float64Array) => {
    while (pending.length && pending[0].time <= t + 1e-12) {
      const p = pending.shift()!; const e = c.events[p.ev]; c.at(t, y);
      const values = p.values ?? e.vals.map(v => v.f());
      e.vals.forEach((v, k) => c.assign(v.variable, values[k], y));
    }
  };

  let t = times[0]; let y = c.y0.slice();
  // initialValue=false means a trigger already true at the start fires at once.
  let state = c.events.map(e => e.initialValue);
  const first = truth(t, y);
  first.forEach((now, i) => { if (now && !state[i]) fire(i, t, y); });
  state = truth(t, y);

  for (let n = 1; n < times.length; n++) {
    const target = times[n]; let guardLoops = 0;
    while (t < target - 1e-12 * Math.max(1, Math.abs(target))) {
      if (++guardLoops > 10000) throw new Error('Events keep firing at the same moment');
      const stop = pending.length && pending[0].time < target ? pending[0].time : target;
      const yEnd = step(y, t, stop); const now = truth(stop, yEnd);
      const rising = now.map((v, i) => v && !state[i]);
      if (rising.some(Boolean)) {
        // Bisect for the earliest rising trigger inside (t, stop].
        let lo = t, hi = stop; let yLo = y; let yHi = yEnd;
        for (let k = 0; k < 40 && hi - lo > 1e-10 * Math.max(1, Math.abs(hi)); k++) {
          const mid = (lo + hi) / 2; const yMid = step(yLo, lo, mid); const mNow = truth(mid, yMid);
          if (mNow.some((v, i) => v && !state[i])) { hi = mid; yHi = yMid; } else { lo = mid; yLo = yMid; state = state.map((s, i) => s && mNow[i]); }
        }
        t = hi; y = yHi.slice();
        const hits = truth(t, y);
        hits.forEach((v, i) => { if (v && !state[i]) fire(i, t, y); });
        runDue(t, y);
        state = truth(t, y);
        continue;
      }
      // Triggers that went false are re-armed; delayed events whose time came run now.
      state = now; t = stop; y = yEnd.slice();
      if (pending.length && pending[0].time <= t + 1e-12) { runDue(t, y); state = truth(t, y); }
    }
    out.t.push(target); out.y.push(y.slice());
  }
  return out;
}

// ── Stochastic simulation (Gillespie's direct method) ───────────────────────

export interface StochasticOptions extends Pick<SimOptions, 'tEnd' | 'points' | 'params' | 'initial'> {
  /** Molecules per model substance unit (e.g. 1 for models written in molecules). */
  unit: number; seed?: number; maxEvents?: number; budgetMs?: number;
}

/** Small, fast, seedable random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Exact stochastic simulation: each reaction fires one molecule-event at a time, with
 * probability set by its rate law evaluated on the current counts. Right for small numbers of
 * molecules (gene expression, single cells), where the smooth ODE answer hides real noise.
 * Rate laws are read as substance per time and converted with `unit` molecules per substance.
 * Rate rules and events are not part of this method; the model's ODE run covers those.
 */
export function simulateStochastic(m: BioModel, o: StochasticOptions): SimResult & { events: number } {
  const t0 = Date.now(); const c = compile(m, o); const R = c.laws.length;
  const counts = Float64Array.from(c.y0, v => Math.round(v * o.unit));
  const amounts = new Float64Array(counts.length); const sync = () => { for (let i = 0; i < counts.length; i++) amounts[i] = counts[i] / o.unit; };
  const rand = rng(o.seed ?? 1); const times = linspace(0, o.tEnd, Math.max(2, o.points ?? 400));
  const series: Record<string, number[]> = {}; const record = (t: number) => { sync(); const r = c.report(t, amounts); for (const [k, v] of Object.entries(r)) (series[k] ??= []).push(v); };
  const prop = new Float64Array(R); let t = 0; let next = 0; let events = 0; const maxEvents = o.maxEvents ?? 2_000_000;
  while (next < times.length) {
    sync(); c.at(t, amounts); let total = 0;
    for (let r = 0; r < R; r++) { const a = Math.max(0, c.laws[r]() * o.unit); prop[r] = Number.isFinite(a) ? a : 0; total += prop[r]; }
    const dt = total > 0 ? -Math.log(1 - rand()) / total : Infinity;
    while (next < times.length && times[next] <= t + dt) record(times[next++]);
    if (!Number.isFinite(dt) || next >= times.length) { while (next < times.length) record(times[next++]); break; }
    t += dt; let pick = rand() * total; let r = 0; while (r < R - 1 && (pick -= prop[r]) > 0) r++;
    for (const [k, st] of c.effects[r]) counts[k] = Math.max(0, counts[k] + st);
    if (++events > maxEvents) throw new Error(`Stopped after ${maxEvents.toLocaleString()} reaction events at t=${t.toPrecision(4)}; use fewer molecules or the ODE run`);
    if (o.budgetMs && (events & 1023) === 0 && Date.now() - t0 > o.budgetMs) throw new Error(`Stopped after ${Math.round(o.budgetMs / 1000)} s at t=${t.toPrecision(4)}`);
  }
  return { time: times, series, solution: { t: times, y: [], steps: events, rejected: 0, method: 'dopri5' }, ms: Date.now() - t0, events };
}

/** Human-readable reactions: "S + E → ES   k1·S·E". */
export function describeReaction(r: Reaction, names: Map<string, string>): { equation: string; rate: string } {
  const side = (refs: SpeciesRef[]) => refs.length ? refs.map(x => `${x.stoich !== 1 ? x.stoich + ' ' : ''}${names.get(x.species) ?? x.species}`).join(' + ') : '∅';
  return { equation: `${side(r.reactants)} ${r.reversible ? '⇌' : '→'} ${side(r.products)}`, rate: r.law ? toInfix(r.law) : '—' };
}

// ── Writer (so a model edited in the room can be saved and opened elsewhere) ─

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function toMathML(e: Expr): string {
  switch (e.k) {
    case 'num': return `<cn>${e.v}</cn>`;
    case 'sym': return `<ci>${esc(e.name)}</ci>`;
    case 'time': return '<csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time">t</csymbol>';
    case 'call': return `<apply><ci>${esc(e.fn)}</ci>${e.args.map(toMathML).join('')}</apply>`;
    case 'piece': return `<piecewise>${e.pieces.map(([v, c]) => `<piece>${toMathML(v)}${toMathML(c)}</piece>`).join('')}${e.otherwise ? `<otherwise>${toMathML(e.otherwise)}</otherwise>` : ''}</piecewise>`;
    case 'op':
      if (e.op === 'root' || e.op === 'log') return `<apply><${e.op}/><${e.op === 'root' ? 'degree' : 'logbase'}>${toMathML(e.args[1])}</${e.op === 'root' ? 'degree' : 'logbase'}>${toMathML(e.args[0])}</apply>`;
      return `<apply><${e.op}/>${e.args.map(toMathML).join('')}</apply>`;
  }
}
const mathEl = (e: Expr) => `<math xmlns="http://www.w3.org/1998/Math/MathML">${toMathML(e)}</math>`;

export function writeSbml(m: BioModel, overrides: { params?: Record<string, number>; initial?: Record<string, number> } = {}): string {
  const o: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">', `<model id="${esc(m.id)}" name="${esc(m.name)}">`];
  const fns = Object.entries(m.functions);
  if (fns.length) o.push(`<listOfFunctionDefinitions>${fns.map(([id, f]) => `<functionDefinition id="${esc(id)}"><math xmlns="http://www.w3.org/1998/Math/MathML"><lambda>${f.args.map(a => `<bvar><ci>${esc(a)}</ci></bvar>`).join('')}${toMathML(f.body)}</lambda></math></functionDefinition>`).join('')}</listOfFunctionDefinitions>`);
  o.push(`<listOfCompartments>${m.compartments.map(c => `<compartment id="${esc(c.id)}" name="${esc(c.name)}" size="${c.size}" constant="${c.constant}" spatialDimensions="3"/>`).join('')}</listOfCompartments>`);
  if (m.species.length) o.push(`<listOfSpecies>${m.species.map(s => { const v = overrides.initial?.[s.id] ?? s.initial; return `<species id="${esc(s.id)}" name="${esc(s.name)}" compartment="${esc(s.compartment)}" ${s.initialIsAmount ? `initialAmount="${v}"` : `initialConcentration="${v}"`} hasOnlySubstanceUnits="${s.onlySubstance}" boundaryCondition="${s.boundary}" constant="${s.constant}"/>`; }).join('')}</listOfSpecies>`);
  if (m.params.length) o.push(`<listOfParameters>${m.params.map(p => `<parameter id="${esc(p.id)}" name="${esc(p.name)}" value="${overrides.params?.[p.id] ?? p.value}" constant="${p.constant}"/>`).join('')}</listOfParameters>`);
  if (m.initialAssignments.length) o.push(`<listOfInitialAssignments>${m.initialAssignments.map(a => `<initialAssignment symbol="${esc(a.symbol)}">${mathEl(a.math)}</initialAssignment>`).join('')}</listOfInitialAssignments>`);
  if (m.rules.length) o.push(`<listOfRules>${m.rules.map(r => `<${r.kind === 'rate' ? 'rateRule' : 'assignmentRule'} variable="${esc(r.variable)}">${mathEl(r.math)}</${r.kind === 'rate' ? 'rateRule' : 'assignmentRule'}>`).join('')}</listOfRules>`);
  if (m.reactions.length) o.push(`<listOfReactions>${m.reactions.map(r => {
    const refs = (name: string, l: SpeciesRef[]) => l.length ? `<${name}>${l.map(x => `<speciesReference species="${esc(x.species)}" stoichiometry="${x.stoich}" constant="true"/>`).join('')}</${name}>` : '';
    const mods = r.modifiers.length ? `<listOfModifiers>${r.modifiers.map(s => `<modifierSpeciesReference species="${esc(s)}"/>`).join('')}</listOfModifiers>` : '';
    const loc = Object.entries(r.local); const kl = r.law ? `<kineticLaw>${mathEl(r.law)}${loc.length ? `<listOfLocalParameters>${loc.map(([k, v]) => `<localParameter id="${esc(k)}" value="${v}"/>`).join('')}</listOfLocalParameters>` : ''}</kineticLaw>` : '';
    return `<reaction id="${esc(r.id)}" name="${esc(r.name)}" reversible="${r.reversible}">${refs('listOfReactants', r.reactants)}${refs('listOfProducts', r.products)}${mods}${kl}</reaction>`;
  }).join('')}</listOfReactions>`);
  if (m.events?.length) o.push(`<listOfEvents>${m.events.map(e => `<event id="${esc(e.id)}" useValuesFromTriggerTime="${e.useValuesFromTriggerTime}"><trigger initialValue="${e.initialValue}" persistent="${e.persistent}">${mathEl(e.trigger)}</trigger>${e.delay ? `<delay>${mathEl(e.delay)}</delay>` : ''}<listOfEventAssignments>${e.assignments.map(a => `<eventAssignment variable="${esc(a.variable)}">${mathEl(a.math)}</eventAssignment>`).join('')}</listOfEventAssignments></event>`).join('')}</listOfEvents>`);
  o.push('</model>', '</sbml>');
  return o.join('\n');
}
