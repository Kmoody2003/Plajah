// Biology Lab phase 0: structures, SBML, maths, solvers, starter models.
//   npm run test:bio
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePdb, parseMmcif, parseStructure, proteinMass, plddtColor, assignSecondary } from '../services/bio/structure';
import { structureToGroup, bakeForExport } from '../services/bio/molScene';
import { parseSbml, writeSbml, simulate, describeReaction, simulateStochastic } from '../services/bio/sbml';
import { parseInfix, evaluate, toInfix, compileExpr } from '../services/bio/math';
import { dopri5, ros23, solve, linspace } from '../services/bio/ode';
import { STARTERS } from '../services/bio/models';
import { PDB_ID, UNIPROT, fetchAlphaFold } from '../services/bio/sources';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/bio/${n}`, import.meta.url), 'utf8');
const CRAMBIN = 'TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN';
const disulfides = (s: ReturnType<typeof parsePdb>) => { const out: string[] = []; for (let k = 0; k < s.bonds.length; k += 2) { const a = s.atoms[s.bonds[k]], b = s.atoms[s.bonds[k + 1]]; if (a.name === 'SG' && b.name === 'SG') out.push(`${a.resSeq}-${b.resSeq}`); } return out.sort(); };

test('PDB: crambin atoms, sequence, secondary structure, disulfides', () => {
  const s = parsePdb(fixture('1crn.pdb'));
  assert.equal(s.id, '1CRN'); assert.equal(s.atoms.length, 327); assert.equal(s.resolution, 1.5); assert.match(s.method, /X-RAY/);
  assert.equal(s.chains.length, 1); assert.equal(s.chains[0].sequence, CRAMBIN); assert.equal(s.chains[0].kind, 'protein');
  assert.deepEqual(s.secondary.map(r => `${r.kind}:${r.start}-${r.end}`), ['helix:7-19', 'helix:23-30', 'sheet:1-4', 'sheet:32-35']);
  assert.deepEqual(disulfides(s), ['16-26', '3-40', '4-32']);
  assert.ok(Math.abs(proteinMass(CRAMBIN) - 4730) < 20);
});

test('secondary structure from CA geometry agrees with the annotated helices and sheets', () => {
  const s = parsePdb(fixture('1crn.pdb')); const ours = assignSecondary(s.atoms);
  const covers = (kind: string, a: number, b: number) => { let hit = 0; for (let r = a; r <= b; r++) if (ours.some(x => x.kind === kind && r >= x.start && r <= x.end)) hit++; return hit / (b - a + 1); };
  for (const r of s.secondary) assert.ok(covers(r.kind, r.start, r.end) >= 0.6, `${r.kind} ${r.start}-${r.end}: ${covers(r.kind, r.start, r.end)}`);
  // A file with no HELIX/SHEET records gets ours, marked as computed.
  const bare = parsePdb(fixture('1crn.pdb').split(/\r?\n/).filter(l => !/^(HELIX|SHEET)/.test(l)).join('\n'));
  assert.ok(bare.secondary.length >= 4 && bare.secondary.every(r => r.computed));
});

test('mmCIF reads the same structure as PDB', () => {
  const a = parsePdb(fixture('1crn.pdb')), b = parseMmcif(fixture('1crn.cif'));
  assert.equal(b.atoms.length, a.atoms.length); assert.equal(b.chains[0].sequence, CRAMBIN); assert.equal(b.bonds.length, a.bonds.length);
  assert.deepEqual(disulfides(b), disulfides(a));
  assert.deepEqual([b.atoms[0].x, b.atoms[0].y, b.atoms[0].z], [a.atoms[0].x, a.atoms[0].y, a.atoms[0].z]);
  assert.equal(parseStructure(fixture('1crn.cif'), '1crn.cif').atoms.length, 327);
});

test('PDB edge cases: alternate locations, models, waters, ligands, element guessing', () => {
  const line = (rec: string, serial: number, name: string, res: string, chain: string, seq: number, x: number, el = '', alt = ' ') =>
    `${rec.padEnd(6)}${String(serial).padStart(5)} ${name.padEnd(4)}${alt}${res.padStart(3)} ${chain}${String(seq).padStart(4)}    ${x.toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}  1.00 20.00          ${el.padStart(2)}`;
  const pdb = ['MODEL        1', line('ATOM', 1, ' CA ', 'GLY', 'A', 1, 0), line('ATOM', 2, ' CA ', 'SER', 'A', 2, 3.8, 'C', 'A'), line('ATOM', 3, ' CA ', 'SER', 'A', 2, 3.9, 'C', 'B'),
    line('HETATM', 4, 'FE  ', 'HEM', 'A', 100, 10, 'FE'), line('HETATM', 5, ' O  ', 'HOH', 'A', 200, 20), 'ENDMDL', 'MODEL        2', line('ATOM', 6, ' CA ', 'GLY', 'A', 1, 50), 'ENDMDL'].join('\n');
  const s = parsePdb(pdb, 'test');
  assert.equal(s.atoms.length, 4); // altLoc B and model 2 dropped
  assert.equal(s.chains[0].sequence, 'GS'); assert.deepEqual(s.chains[0].ligands, ['HEM']); assert.equal(s.chains[0].waters, 1);
  assert.equal(s.atoms.find(a => a.resName === 'HEM')!.element, 'FE');
  assert.match(s.warnings[0], /2 models/);
});

test('molecule scene: cartoon runs by secondary structure, all styles bake to plain meshes', () => {
  const s = parsePdb(fixture('1crn.pdb'));
  const cartoon = structureToGroup(s, { style: 'cartoon', color: 'secondary' });
  const runs: string[] = []; cartoon.traverse(o => { if (o.name.startsWith('cartoon_')) runs.push(o.name); });
  assert.ok(runs.length >= 5, runs.join());
  for (const style of ['cartoon', 'ball-stick', 'spacefill'] as const) {
    const baked = bakeForExport(structureToGroup(s, { style, color: 'element' }));
    let meshes = 0, instanced = 0; baked.traverse((o: any) => { if (o.isMesh) meshes++; if (o.isInstancedMesh) instanced++; });
    assert.ok(meshes > 0); assert.equal(instanced, 0);
  }
  assert.equal(plddtColor(95), '#0053d6'); assert.equal(plddtColor(40), '#ff7d45');
});

test('IDs: PDB and UniProt formats', () => {
  for (const ok of ['1CRN', '4hhb', '6LU7']) assert.ok(PDB_ID.test(ok), ok);
  for (const bad of ['CRN1', '12345', '1CR']) assert.ok(!PDB_ID.test(bad), bad);
  for (const ok of ['P69905', 'Q9Y6K9', 'A0A023GPI8']) assert.ok(UNIPROT.test(ok), ok);
  assert.ok(!UNIPROT.test('HELLO1'));
});

test('AlphaFold fetch follows the API to the model file and carries the CC-BY credit', async () => {
  const calls: string[] = [];
  const fake = (async (url: string) => { calls.push(url); return url.includes('/api/') ? { ok: true, status: 200, json: async () => [{ modelEntityId: 'AF-P69905-F1', pdbUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v6.pdb' }] } : { ok: true, status: 200, text: async () => fixture('1crn.pdb') }; }) as any;
  const r = await fetchAlphaFold('p69905', fake);
  assert.deepEqual(calls, ['https://alphafold.ebi.ac.uk/api/prediction/P69905', 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v6.pdb']);
  assert.equal(r.licence, 'CC-BY 4.0'); assert.match(r.credit, /AlphaFold DB AF-P69905-F1/); assert.equal(r.name, 'AF-P69905-F1-model_v6.pdb');
});

test('infix maths: precedence, unary minus, functions, round trip', () => {
  const env: Record<string, number> = { S: 2, Km: 3, Vmax: 10, n: 2, p: 4 };
  const v = (s: string) => evaluate(parseInfix(s), n => env[n], 0);
  assert.equal(v('Vmax*S/(Km+S)'), 4); assert.equal(v('-2^2'), -4); assert.equal(v('2^3^2'), 512); assert.equal(v('1/(1+p^n)'), 1 / 17);
  assert.ok(Math.abs(v('exp(ln(5))') - 5) < 1e-12); assert.equal(v('sqrt(16) + max(1, 7, 3)'), 11);
  const e = parseInfix('alpha/(1+p3^n) + alpha0'); assert.equal(toInfix(e), 'alpha/(1 + p3^n) + alpha0');
  assert.throws(() => parseInfix('2 +* 3'));
});

test('solvers: exact exponential decay; stiff Robertson matches the published values', () => {
  const decay = dopri5((_t, y, o) => { o[0] = -y[0]; }, [1], [0, 1, 2, 5]);
  decay.y.forEach((y, i) => assert.ok(Math.abs(y[0] - Math.exp(-decay.t[i])) < 1e-6));
  const rob = (_t: number, y: Float64Array, o: Float64Array) => { o[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; o[2] = 3e7 * y[1] * y[1]; o[1] = -o[0] - o[2]; };
  const r = ros23(rob, [1, 0, 0], [0, 40], { rtol: 1e-6, atol: 1e-10 }); const y = r.y[1];
  assert.ok(Math.abs(y[0] - 0.7158271) < 1e-4, String(y[0])); assert.ok(Math.abs(y[1] - 9.185535e-6) < 1e-7, String(y[1])); assert.ok(Math.abs(y[2] - 0.2841637) < 1e-4);
  assert.ok(r.steps < 1000, `${r.steps} steps`);
  const auto = solve(rob, [1, 0, 0], linspace(0, 40, 20)); assert.equal(auto.method, 'ros23'); assert.ok(auto.stiffSwitch);
});

test('starter models: conservation and textbook results', () => {
  const run = (id: string, points = 200) => { const s = STARTERS.find(x => x.id === id)!; return { s, r: simulate(s.model, { tEnd: s.tEnd, points, method: s.method }) }; };
  const mm = run('michaelis_menten').r; const end = (k: string) => mm.series[k].at(-1)!;
  mm.time.forEach((_, i) => { assert.ok(Math.abs(mm.series.E[i] + mm.series.ES[i] - 1) < 1e-6); assert.ok(Math.abs(mm.series.S[i] + mm.series.ES[i] + mm.series.P[i] - 10) < 1e-5); });
  assert.ok(end('P') > 9.99);
  const sir = run('sir').r; assert.ok(Math.abs(sir.series.R.at(-1)! - 0.9405) < 0.002, String(sir.series.R.at(-1)));
  const rep = run('repressilator', 600).r; const p1 = rep.series.p1.slice(300); // second half: sustained oscillation
  assert.ok(Math.max(...p1) - Math.min(...p1) > 50, 'repressilator keeps oscillating');
  const lv = run('lotka_volterra').r; assert.ok(Math.min(...lv.series.prey) > 0 && Math.max(...lv.series.prey) > 20);
  const rob = run('robertson').r; assert.equal(rob.solution.method, 'ros23'); assert.ok(Math.abs(rob.series.A.at(-1)! - 0.7158) < 1e-3);
});

test('parameter overrides change the run (what the sliders do)', () => {
  const s = STARTERS.find(x => x.id === 'sir')!;
  const lowR0 = simulate(s.model, { tEnd: 160, params: { beta: 0.09 } }); // R0 0.9: no outbreak
  assert.ok(lowR0.series.R.at(-1)! < 0.02, String(lowR0.series.R.at(-1)));
});

test('SBML: write, read back, same simulation; describes reactions', () => {
  for (const s of STARTERS) {
    const back = parseSbml(writeSbml(s.model));
    assert.equal(back.reactions.length, s.model.reactions.length); assert.deepEqual(back.warnings, []);
    const a = simulate(s.model, { tEnd: s.tEnd, points: 50, method: s.method }), b = simulate(back, { tEnd: s.tEnd, points: 50, method: s.method });
    for (const k of Object.keys(a.series)) assert.ok(Math.abs(a.series[k].at(-1)! - b.series[k].at(-1)!) < 1e-9, `${s.id}:${k}`);
  }
  const mm = STARTERS[0].model; const d = describeReaction(mm.reactions[0], new Map(mm.species.map(x => [x.id, x.name])));
  assert.equal(d.equation, 'Substrate + Enzyme ⇌ Complex'); assert.equal(d.rate, 'kon·S·E − koff·ES');
});

test('SBML level 2 features: compartments, local parameters, assignment and rate rules, functions, events reported', () => {
  const xml = `<?xml version="1.0"?><sbml xmlns="http://www.sbml.org/sbml/level2/version4" level="2" version="4"><model id="m" name="L2 test">
  <listOfFunctionDefinitions><functionDefinition id="mm"><math xmlns="http://www.w3.org/1998/Math/MathML"><lambda><bvar><ci>s</ci></bvar><bvar><ci>v</ci></bvar><bvar><ci>k</ci></bvar><apply><divide/><apply><times/><ci>v</ci><ci>s</ci></apply><apply><plus/><ci>k</ci><ci>s</ci></apply></apply></lambda></math></functionDefinition></listOfFunctionDefinitions>
  <listOfCompartments><compartment id="c" size="2"/></listOfCompartments>
  <listOfSpecies><species id="A" compartment="c" initialConcentration="5"/><species id="B" compartment="c" initialConcentration="0"/></listOfSpecies>
  <listOfParameters><parameter id="total" constant="false"/><parameter id="x" value="0" constant="false"/></listOfParameters>
  <listOfRules><assignmentRule variable="total"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><plus/><ci>A</ci><ci>B</ci></apply></math></assignmentRule>
  <rateRule variable="x"><math xmlns="http://www.w3.org/1998/Math/MathML"><cn type="e-notation">1<sep/>0</cn></math></rateRule></listOfRules>
  <listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A"/></listOfReactants><listOfProducts><speciesReference species="B"/></listOfProducts>
  <kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>c</ci><apply><ci>mm</ci><ci>A</ci><ci>V</ci><ci>K</ci></apply></apply></math><listOfParameters><parameter id="V" value="1"/><parameter id="K" value="1"/></listOfParameters></kineticLaw></reaction></listOfReactions>
  <listOfEvents><event id="e"/></listOfEvents></model></sbml>`;
  const m = parseSbml(xml);
  assert.deepEqual(m.warnings, ['Event e has no trigger; skipped.']);
  const r = simulate(m, { tEnd: 3, points: 31 });
  r.time.forEach((t, i) => { assert.ok(Math.abs(r.series.A[i] + r.series.B[i] - 5) < 1e-6); assert.ok(Math.abs(r.series.total[i] - 5) < 1e-6); });
  assert.ok(r.series.A.at(-1)! < 5 && r.series.A.at(-1)! > 0);
  assert.ok(Math.abs(r.series.x.at(-1)! - 3) < 1e-9, "rate rule x' = 1 gives x(3) = 3");
  assert.throws(() => parseSbml('<notsbml/>'), /Not an SBML/);
});

// ── Events, real BioModels files, stochastic runs ───────────────────────────

const L3 = (body: string) => `<?xml version="1.0"?><sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2"><model id="ev" name="events">
<listOfCompartments><compartment id="c" size="1" constant="true"/></listOfCompartments>
<listOfSpecies><species id="X" compartment="c" initialConcentration="0" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"/></listOfSpecies>
<listOfParameters><parameter id="k" value="0" constant="false"/></listOfParameters>
<listOfReactions><reaction id="make" reversible="false"><listOfProducts><speciesReference species="X" stoichiometry="1" constant="true"/></listOfProducts>
<kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><ci>k</ci></math></kineticLaw></reaction></listOfReactions>
<listOfEvents>${body}</listOfEvents></model></sbml>`;
const timeGeq = (v: number) => `<math xmlns="http://www.w3.org/1998/Math/MathML"><apply><geq/><csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time">t</csymbol><cn>${v}</cn></apply></math>`;
const setK = (v: number) => `<listOfEventAssignments><eventAssignment variable="k"><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>${v}</cn></math></eventAssignment></listOfEventAssignments>`;

test('events: a switch at t=5 is found exactly between output points', () => {
  const m = parseSbml(L3(`<event id="on" useValuesFromTriggerTime="true"><trigger initialValue="false" persistent="true">${timeGeq(5.37)}</trigger>${setK(2)}</event>`));
  assert.deepEqual(m.warnings, []); assert.equal(m.events.length, 1);
  const r = simulate(m, { tEnd: 10, points: 11 }); // outputs every 1.0; the switch is at 5.37
  assert.equal(r.series.X[5], 0); // t=5: not yet
  assert.ok(Math.abs(r.series.X[6] - 2 * (6 - 5.37)) < 1e-6, String(r.series.X[6])); // t=6: 2 x 0.63
  assert.ok(Math.abs(r.series.X[10] - 2 * (10 - 5.37)) < 1e-6);
});

test('events: delays, and values taken at trigger time', () => {
  const m = parseSbml(L3(`<event id="on"><trigger initialValue="false" persistent="true">${timeGeq(2)}</trigger><delay><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>3</cn></math></delay>${setK(1)}</event>`));
  const r = simulate(m, { tEnd: 10, points: 101 });
  assert.equal(r.series.X[50], 0); // t=5: delay just elapsed
  assert.ok(Math.abs(r.series.X[100] - 5) < 1e-6, String(r.series.X[100])); // on from t=5 to 10
});

test('events: a trigger re-arms after going false (threshold oscillator)', () => {
  // X grows at 1/time; when X >= 1 an event resets it to 0. Expect a sawtooth with period 1.
  const xml = L3(`<event id="reset"><trigger initialValue="false" persistent="true"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><geq/><ci>X</ci><cn>1</cn></apply></math></trigger><listOfEventAssignments><eventAssignment variable="X"><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>0</cn></math></eventAssignment></listOfEventAssignments></event>`).replace('value="0" constant="false"/></listOfParameters>', 'value="1" constant="false"/></listOfParameters>');
  const r = simulate(parseSbml(xml), { tEnd: 4.5, points: 10 });
  assert.ok(Math.abs(r.series.X.at(-1)! - 0.5) < 1e-6, String(r.series.X.at(-1)));
  assert.ok(Math.max(...r.series.X) < 1 + 1e-6);
});

test('real BioModels files: curated repressilator, ACh receptor (event), cell cycle (events) parse and run', () => {
  const rep = parseSbml(fixture('BIOMD0000000012.xml')); assert.equal(rep.name, 'Elowitz2000 - Repressilator');
  const r12 = simulate(rep, { tEnd: 1000, points: 500, budgetMs: 10000 });
  const p = r12.series.PX.slice(250); assert.ok(Math.max(...p) - Math.min(...p) > 100, 'curated repressilator oscillates');
  for (const f of ['BIOMD0000000001.xml', 'BIOMD0000000007.xml']) {
    const m = parseSbml(fixture(f)); assert.ok(m.events.length >= 1, f);
    assert.ok(!m.warnings.some(w => /not simulated|not supported/.test(w)), m.warnings.join('; '));
    const r = simulate(m, { tEnd: 100, points: 101, budgetMs: 10000 });
    for (const [k, v] of Object.entries(r.series)) assert.ok(v.every(Number.isFinite), `${f}:${k}`);
  }
});

test('stochastic: decay matches the exponential mean; seeds repeat; counts stay whole', () => {
  const decay = STARTERS[0].model; void decay;
  const m = parseSbml(L3('').replace('<listOfEvents></listOfEvents>', '').replace('initialConcentration="0"', 'initialConcentration="1000"')
    .replace('<listOfProducts><speciesReference species="X" stoichiometry="1" constant="true"/></listOfProducts>', '<listOfReactants><speciesReference species="X" stoichiometry="1" constant="true"/></listOfReactants>')
    .replace('<ci>k</ci></math>', '<apply><times/><cn>0.1</cn><ci>X</ci></apply></math>'));
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => simulateStochastic(m, { tEnd: 10, points: 11, unit: 1, seed }));
  const mean = runs.reduce((s, r) => s + r.series.X[10], 0) / runs.length;
  assert.ok(Math.abs(mean - 1000 * Math.exp(-1)) < 25, String(mean)); // sd of the mean ~ 5.4
  assert.ok(runs.every(r => r.series.X.every(v => Number.isInteger(v))));
  assert.deepEqual(simulateStochastic(m, { tEnd: 10, points: 11, unit: 1, seed: 3 }).series.X, runs[2].series.X);
  assert.notDeepEqual(runs[0].series.X, runs[1].series.X);
});

test('compiled formulas agree with the tree evaluator', () => {
  const e = parseInfix('alpha/(1+p^n) + alpha0 - max(0, exp(-x))*2^-1');
  const env: Record<string, number> = { alpha: 216, p: 3.2, n: 2, alpha0: 0.216, x: 0.7 };
  const f = compileExpr(e, n => () => env[n], () => 0);
  assert.ok(Math.abs(f() - evaluate(e, n => env[n], 0)) < 1e-12);
});
