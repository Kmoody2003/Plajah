// Unified workspace: skill profile, tool registry, guide-path contract, and the Architecture rail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, recordUse, finishPath, setLevel, mergeProfiles, sanitizeProfile, usesOf } from '../services/workspace/skillProfile';
import { ToolRegistry, registry, EARN_AFTER, type ToolContext } from '../services/workspace/tools';
import { currentStepOf, pathProgress } from '../services/workspace/guidePath';
import { WORKSPACES, workspaceById, PLANNED_PATHS } from '../services/workspace/workspaces';
import { registerCadTools, ARCH, CAD_TOOLS, type CadToolDoc } from '../services/cad/workspaceTools';
import { HOME_PATH, STEPS } from '../services/cad/guide/journey';
import { newDrawing, addEntities } from '../services/cad/draft';
import { detectRooms } from '../services/cad/rooms';
import { addShell } from '../services/cad/guide/starters';

test('skill profile: uses count up, paths finish once, merge keeps the best of both', () => {
  let a = recordUse(emptyProfile(), 'architecture', 'wall', 10);
  a = recordUse(a, 'architecture', 'wall', 11);
  a = finishPath(a, 'architecture', 'design-a-home', 50);
  assert.equal(usesOf(a, 'architecture', 'wall'), 2);
  assert.equal(finishPath(a, 'architecture', 'design-a-home', 99), a, 'finishing twice changes nothing');
  let b = recordUse(emptyProfile(), 'architecture', 'wall', 5);
  for (let i = 0; i < 4; i++) b = recordUse(b, 'architecture', 'wall', 20 + i);
  b = finishPath(b, 'architecture', 'design-a-home', 30);
  b = setLevel(b, 'electronics', 'pro', 40);
  const m = mergeProfiles(a, b);
  assert.equal(usesOf(m, 'architecture', 'wall'), 5);
  assert.equal(m.workspaces.architecture.paths['design-a-home'], 30, 'earliest finish wins');
  assert.equal(m.workspaces.electronics.level, 'pro');
});

test('skill profile: untrusted input is bounded and cleaned', () => {
  const p = sanitizeProfile({ updatedAt: 5, workspaces: { architecture: { uses: { wall: 3, 'BAD KEY': 9, neg: -2, big: 1e99 }, paths: { x: 'no' }, level: 'admin' }, '../evil': { uses: { a: 1 } } } });
  assert.deepEqual(p.workspaces.architecture.uses, { wall: 3, big: 1e6 });
  assert.deepEqual(p.workspaces.architecture.paths, {});
  assert.equal(p.workspaces.architecture.level, undefined);
  assert.equal(p.workspaces['../evil'], undefined);
  assert.deepEqual(sanitizeProfile('nope'), emptyProfile());
});

test('registry: starters always, core when needed or used, pro when earned, in Pro mode, or after a path', () => {
  const r = new ToolRegistry();
  r.register<{ n: number }>(
    { id: 'a', workspace: 'w', label: 'A', actsOn: [], level: 'starter', group: 'g', teach: { simple: '', pro: '' } },
    { id: 'b', workspace: 'w', label: 'B', actsOn: [], level: 'core', group: 'g', teach: { simple: '', pro: '' }, appearsWhen: c => c.doc.n > 2 },
    { id: 'c', workspace: 'w', label: 'C', actsOn: [], level: 'pro', group: 'g', teach: { simple: '', pro: '' }, after: ['b'] },
    { id: 'd', workspace: 'w', label: 'D', actsOn: [], level: 'pro', group: 'g', teach: { simple: '', pro: '' } },
    { id: 'e', workspace: 'w', label: 'E', actsOn: [], level: 'core', group: 'g', teach: { simple: '', pro: '' }, appearsWhen: () => { throw new Error('half-built'); } },
  );
  r.unlockOnPath('w', 'p1', ['d']);
  const ctx = (n: number, over: Partial<ToolContext<{ n: number }>> = {}): ToolContext<{ n: number }> => ({ workspace: 'w', doc: { n }, selection: [], level: 'simple', profile: emptyProfile(), ...over });
  const ids = (c: ToolContext<{ n: number }>) => r.visible(c).map(x => `${x.tool.id}:${x.reason}`);
  assert.deepEqual(ids(ctx(0)), ['a:starter']);
  assert.deepEqual(ids(ctx(3)), ['a:starter', 'b:needed']);
  assert.equal(r.suggest(ctx(3))?.id, 'b');
  let prof = emptyProfile(); for (let i = 0; i < EARN_AFTER; i++) prof = recordUse(prof, 'w', 'b');
  assert.deepEqual(ids(ctx(0, { profile: prof })), ['a:starter', 'b:used', 'c:earned']);
  assert.equal(r.suggest(ctx(3, { profile: prof })), null, 'no hint for a tool already used');
  assert.deepEqual(ids(ctx(0, { profile: finishPath(emptyProfile(), 'w', 'p1') })), ['a:starter', 'd:path']);
  assert.deepEqual(ids(ctx(0, { level: 'pro' })), ['a:starter', 'b:pro', 'c:pro', 'd:pro', 'e:pro'], 'Pro shows everything');
  assert.throws(() => r.register({ id: 'a', workspace: 'w', label: 'A', actsOn: [], level: 'starter', group: 'g', teach: { simple: '', pro: '' } }));
});

test('guide paths: current step skips passed optional steps; progress counts them', () => {
  const steps = [{ id: 'a' }, { id: 'b', optional: true }, { id: 'c' }, { id: 'd' }];
  const st = (...done: boolean[]) => steps.map((s, i) => ({ id: s.id, done: done[i], lines: [] }));
  assert.equal(currentStepOf(steps, st(true, false, false, false)), 'b');
  assert.equal(currentStepOf(steps, st(true, false, true, false)), 'd');
  assert.deepEqual(pathProgress(steps, st(true, false, true, true)), { done: 4, total: 4, finished: true });
  assert.equal(HOME_PATH.steps, STEPS);
  assert.equal(HOME_PATH.workspace, ARCH);
});

test('workspaces: ids unique, live ones have a room, planned paths listed', () => {
  assert.equal(new Set(WORKSPACES.map(w => w.id)).size, WORKSPACES.length);
  for (const w of WORKSPACES) if (w.status === 'live') assert.ok(w.room, `${w.id} is live without a room`);
  assert.equal(workspaceById('architecture')?.room, 'cad');
  for (const id of ['landscape', 'automotive', 'robotics', 'aerospace', 'astronomy', 'compute']) assert.equal(workspaceById(id)?.status, 'planned');
  assert.ok(PLANNED_PATHS.some(p => p.id === 'line-follower'));
});

test('architecture rail: short for a blank page, grows as the drawing does', () => {
  registerCadTools(); registerCadTools(); // idempotent
  assert.equal(registry.forWorkspace(ARCH).length, CAD_TOOLS.length);
  const ctx = (m: ReturnType<typeof newDrawing>, sel: number[] = []): ToolContext<CadToolDoc> => ({ workspace: ARCH, doc: { model: m, rooms: detectRooms(m.entities) }, selection: sel, level: 'simple', profile: emptyProfile() });
  const blank = newDrawing('Blank.dxf', 'mm');
  const first = registry.visible(ctx(blank)).map(x => x.tool.id);
  assert.deepEqual(first, ['select', 'pan', 'wall', 'line', 'rect', 'circle', 'text', 'measure']);
  const shell = addShell(blank, 6000, 4000);
  const grown = registry.visible(ctx(shell)).filter(x => x.reason === 'needed').map(x => x.tool.id);
  for (const t of ['roomtag', 'dimension', 'fillet', 'hatch']) assert.ok(grown.includes(t), `${t} should appear once there's a closed room`);
  assert.equal(registry.suggest(ctx(shell))?.id, 'roomtag', 'Aria suggests naming the room first');
  assert.ok(registry.visible(ctx(shell, [0])).some(x => x.tool.id === 'move'), 'Move appears with a selection');
  const lines = addEntities(blank, [0, 1, 2].map(i => ({ type: 'line' as const, layer: '0', a: [i * 1000, 0, 0] as [number, number, number], b: [i * 1000 + 1000, 0, 0] as [number, number, number] })));
  const lv = registry.visible(ctx(lines)).map(x => x.tool.id);
  assert.ok(lv.includes('polyline') && lv.includes('offset'), 'lines bring Polyline and Offset (lines into walls)');
  const done = finishPath(emptyProfile(), ARCH, HOME_PATH.id);
  const kept = registry.visible({ ...ctx(blank), profile: done }).filter(x => x.reason === 'path').map(x => x.tool.id);
  assert.deepEqual(kept.sort(), [...(HOME_PATH.unlocks ?? [])].sort(), 'finishing Design a home keeps its tools');
});

test('electronics rail: starters on an empty sheet, tools join as the circuit grows', async () => {
  const { registerElecTools, ELEC, ELEC_TOOLS } = await import('../services/elec/workspaceTools');
  const { DESIGNS } = await import('../services/elec/designs');
  const { simulate } = await import('../services/elec/sim');
  const { checkCircuit, summarize } = await import('../services/elec/checks');
  registerElecTools(); registerElecTools(); // idempotent
  assert.equal(registry.forWorkspace(ELEC).length, ELEC_TOOLS.length);
  type D = import('../services/elec/workspaceTools').ElecToolDoc;
  const ctx = (doc: D, sel: number[] = []): ToolContext<D> => ({ workspace: ELEC, doc, selection: sel, level: 'simple', profile: emptyProfile() });
  const ids = (c: ToolContext<D>) => registry.visible(c).map(x => x.tool.id);
  const empty: D = { circuit: { name: 'x', parts: [], wires: [] }, sim: null, mode: 'dc', errors: 0 };
  assert.deepEqual(ids(ctx(empty)), ['select', 'wire', 'rotate', 'delete', 'undo', 'simulate', 'checks', 'safety']);
  // Safety and Checks are never hidden.
  for (const t of ['safety', 'checks']) assert.equal(registry.get(ELEC, t)?.level, 'starter');

  const lamp = DESIGNS.find(d => d.id === 'usb-led-lamp')!;
  const lampDoc: D = { circuit: lamp.circuit, sim: null, mode: 'dc', errors: 0 };
  const l = ids(ctx(lampDoc));
  assert.ok(l.includes('bom') && !l.includes('overtime') && !l.includes('board'), 'a lamp brings Parts list, not Over time or Board yet');
  assert.ok(ids(ctx(lampDoc, [0])).includes('props'), 'Part appears with a selection');
  const sim = simulate(lamp.circuit, lamp.sim);
  const errors = summarize(checkCircuit(lamp.circuit, sim, { market: 'both', toy: false })).errors;
  assert.equal(errors, 0, 'the USB lamp starter passes its checks');
  assert.ok(ids(ctx({ ...lampDoc, sim })).includes('board'), 'a simulated, clean circuit can become a board');
  assert.ok(!ids(ctx({ ...lampDoc, sim, errors: 1 })).includes('board'), 'no Board while checks fail');

  const rc = DESIGNS.find(d => d.id === 'rc-low-pass')!;
  const rcDoc: D = { circuit: rc.circuit, sim: null, mode: 'dc', errors: 0 };
  assert.equal(registry.suggest(ctx(rcDoc))?.id, 'overtime', 'a capacitor circuit: Aria suggests watching it over time');
  const tran = simulate(rc.circuit, rc.sim);
  assert.ok(ids(ctx({ ...rcDoc, sim: tran, mode: 'tran' })).includes('scope'), 'a transient run brings the Scope');

  let prof = emptyProfile(); for (let i = 0; i < EARN_AFTER; i++) prof = recordUse(prof, ELEC, 'simulate');
  assert.ok(ids({ ...ctx(empty), profile: prof }).includes('spice'), 'SPICE export is earned by simulating');
  assert.equal(ids({ ...ctx(empty), level: 'pro' }).length, ELEC_TOOLS.length, 'Pro shows everything');
});

test('sewing rail: pick a pattern and print; layout/3D after measuring; nesting and tech pack when selling', async () => {
  const { registerSewTools, SEW, SEW_TOOLS } = await import('../services/soft/workspaceTools');
  registerSewTools(); registerSewTools();
  assert.equal(registry.forWorkspace(SEW).length, SEW_TOOLS.length);
  type D = import('../services/soft/workspaceTools').SewToolDoc;
  const ids = (doc: D, over: Partial<ToolContext<D>> = {}) => registry.visible<D>({ workspace: SEW, doc, selection: [], level: 'simple', profile: emptyProfile(), ...over }).map(x => x.tool.id);
  const fresh: D = { kind: 'apparel', edited: false, selling: false, sizes: 8 };
  assert.deepEqual(ids(fresh), ['pieces', 'make', 'steps', 'materials', 'safety']);
  assert.ok(ids({ ...fresh, edited: true }).includes('layout') && ids({ ...fresh, edited: true }).includes('fit3d'));
  assert.ok(!ids({ kind: 'home', edited: true, selling: false, sizes: 1 }).includes('fit3d'), 'no 3D fit for a cushion');
  const sell = ids({ ...fresh, selling: true });
  assert.ok(sell.includes('grade') && sell.includes('techpack'), 'selling brings nesting and the tech pack');
  assert.ok(!ids({ ...fresh, selling: true, sizes: 1 }).includes('grade'), 'one-size patterns have nothing to nest');
  assert.equal(registry.suggest<D>({ workspace: SEW, doc: { ...fresh, edited: true }, selection: [], level: 'simple', profile: emptyProfile() })?.id, 'layout');
  let prof = emptyProfile(); for (let i = 0; i < EARN_AFTER; i++) prof = recordUse(prof, SEW, 'make');
  assert.ok(ids(fresh, { profile: prof }).includes('cutter'), 'machine cutting is earned by making');
  assert.equal(registry.get(SEW, 'safety')?.level, 'starter');
});

test('biology rail: atom views for small molecules, chain colours for complexes, stochastic only for real counts', async () => {
  const { registerBioTools, BIO, BIO_TOOLS, fewMolecules, moleculeFacts } = await import('../services/bio/workspaceTools');
  const { STARTERS } = await import('../services/bio/models');
  registerBioTools(); registerBioTools();
  assert.equal(registry.forWorkspace(BIO).length, BIO_TOOLS.length);
  type D = import('../services/bio/workspaceTools').BioToolDoc;
  const ids = (doc: D, over: Partial<ToolContext<D>> = {}) => registry.visible<D>({ workspace: BIO, doc, selection: [], level: 'simple', profile: emptyProfile(), ...over }).map(x => x.tool.id);
  const chain = (id: string, residues: number, ligands: string[] = []) => ({ id, sequence: '', residues, ligands, waters: 0, kind: 'protein' as const });
  const crambin = moleculeFacts({ chains: [chain('A', 46)] });
  const hemoglobin = moleculeFacts({ chains: [chain('A', 141, ['HEM']), chain('B', 146, ['HEM']), chain('C', 141, ['HEM']), chain('D', 146, ['HEM'])] });
  const big = moleculeFacts({ chains: [chain('A', 900)] });
  assert.ok(ids({ tab: 'molecule', ...crambin }).includes('atoms'), 'a small protein: atoms are worth seeing');
  assert.ok(!ids({ tab: 'molecule', ...big }).includes('atoms'), 'a big single chain stays a cartoon');
  const hb = ids({ tab: 'molecule', ...hemoglobin });
  assert.ok(hb.includes('chains') && hb.includes('atoms'), 'haemoglobin: four chains and bound haem');
  for (const s of STARTERS) assert.equal(fewMolecules(s.model), false, `${s.id} is in concentrations, not counts`);
  const counted = { species: [{ id: 'm', name: 'mRNA', compartment: 'c', initial: 5, initialIsAmount: true, boundary: false, constant: false, onlySubstance: true }] };
  assert.equal(fewMolecules(counted), true);
  assert.ok(ids({ tab: 'pathway', fewMolecules: true }).includes('stochastic'));
  assert.equal(registry.suggest<D>({ workspace: BIO, doc: { tab: 'pathway', tuned: true }, selection: [], level: 'simple', profile: emptyProfile() })?.id, 'amounts');
  let prof = emptyProfile(); for (let i = 0; i < EARN_AFTER; i++) prof = recordUse(prof, BIO, 'params');
  assert.ok(ids({ tab: 'pathway' }, { profile: prof }).includes('sbml'), 'SBML export is earned by tuning');
});
