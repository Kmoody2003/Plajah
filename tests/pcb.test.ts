// PCB layout: footprints for every part, place + route + DRC on every describe-it recipe, and the
// fabrication outputs read back (Gerber flashes = pads, Excellon holes = drilled pads + vias).
//   npm run test:pcb
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { COMPONENTS, compDefaults } from '../services/elec/components';
import { RECIPES, recipeDefaults, interpret } from '../services/elec/recipes';
import { layoutBoard, footprintFor, drc, drcCounts, ipcWidth, type Board } from '../services/elec/pcb';
import { gerberFiles, gerberZip, excellon, placementCsv, bomCsv, packageZip } from '../services/elec/pcb/gerber';
import { toKicadPcb } from '../services/elec/pcb/kicad';
import { boardSvg } from '../services/elec/pcb/svg';
import { pcbHazards, openHazards } from '../services/safety/hazards';

/** Minimal RS-274X reader: aperture functions from %TA.AperFunction% and D03 flashes per function. */
function readGerber(src: string): { flashes: Record<string, number>; draws: number; ok: boolean } {
  const fnOf = new Map<number, string>(); let pendingFn = ''; let cur = -1; const flashes: Record<string, number> = {}; let draws = 0;
  const ok = /%FSLAX46Y46\*%/.test(src) && /%MOMM\*%/.test(src) && /M02\*\s*$/.test(src);
  for (const raw of src.split('\n')) {
    const line = raw.trim(); let m: RegExpMatchArray | null;
    if ((m = line.match(/^%TA\.AperFunction,([^*]+)\*%$/))) { pendingFn = m[1]; continue; }
    if (line === '%TD*%') { pendingFn = ''; continue; }
    if ((m = line.match(/^%ADD(\d+)([CRO]),[\d.X]+\*%$/))) { fnOf.set(+m[1], pendingFn || 'none'); continue; }
    if ((m = line.match(/^D(\d+)\*$/)) && +m[1] >= 10) { cur = +m[1]; continue; }
    if (/^X-?\d+Y-?\d+D03\*$/.test(line)) { const f = fnOf.get(cur) ?? '?'; flashes[f] = (flashes[f] ?? 0) + 1; }
    if (/^X-?\d+Y-?\d+D01\*$/.test(line)) draws++;
  }
  return { flashes, draws, ok };
}
const drillHits = (src: string) => src.split('\n').filter(l => /^X-?[\d.]+Y-?[\d.]+$/.test(l.trim())).length;

test('every part kind has a footprint whose pads cover all its schematic pins', () => {
  for (const c of COMPONENTS) {
    const p = { id: 'x', kind: c.kind, ref: 'X1', x: 0, y: 0, rot: 0, params: compDefaults(c) };
    const fp = footprintFor(p, 'tht');
    if (c.kind === 'ground') { assert.equal(fp, null); continue; }
    assert.ok(fp, `${c.kind} has a footprint`);
    const names = new Set(fp!.pads.map(d => d.name));
    for (const pin of c.pins) assert.ok(names.has(pin.name), `${c.kind}: pad for pin ${pin.name}`);
    for (const d of fp!.pads) if (d.drill) assert.ok((Math.min(d.w, d.h) - d.drill) / 2 >= 0.13, `${c.kind} pad ${d.name} annular ring`);
    const smd = footprintFor(p, 'smd'); assert.ok(smd, `${c.kind} smd variant`);
    for (const pin of c.pins) assert.ok(smd!.pads.some(d => d.name === pin.name), `${c.kind} smd: pad for pin ${pin.name}`);
  }
});

test('IPC-2221 width grows with current (1 A ≈ 0.3 mm at 10 °C, 1 oz)', () => {
  assert.ok(Math.abs(ipcWidth(1) - 0.30) < 0.03, String(ipcWidth(1)));
  assert.ok(ipcWidth(3) > ipcWidth(1) * 2); assert.ok(ipcWidth(2, 10, 2) < ipcWidth(2, 10, 1));
});

const boards = new Map<string, Board>();
for (const style of ['tht', 'smd'] as const) for (const r of RECIPES) {
  test(`recipe ${r.id} (${style}) lays out, routes and passes DRC with zero errors`, () => {
    const b = r.build(recipeDefaults(r)); const l = layoutBoard(b.circuit, { style });
    const k = drcCounts(l.drc);
    assert.equal(l.route.failed.length, 0, `unrouted: ${l.route.failed.map(f => f.name).join(', ')}`);
    assert.equal(k.errors, 0, l.drc.filter(d => d.level === 'error').map(d => d.text).join('\n'));
    assert.ok(l.board.tracks.length > 0); assert.ok(l.board.W > 10 && l.board.H > 10);
    // Every pad sits inside the outline.
    for (const p of l.board.pads) assert.ok(p.x > 0 && p.y > 0 && p.x < l.board.W && p.y < l.board.H);
    if (style === 'tht') boards.set(r.id, l.board);
  });
}

test('Gerbers parse back to the same pad count; drill files list every hole', () => {
  for (const [id, b] of boards) {
    const files = gerberFiles(b); const top = Object.entries(files).find(([k]) => k.endsWith('-F_Cu.gtl'))![1]; const bot = Object.entries(files).find(([k]) => k.endsWith('-B_Cu.gbl'))![1];
    const gt = readGerber(top), gb = readGerber(bot); assert.ok(gt.ok && gb.ok, `${id}: Gerber header/footer`);
    const topPads = b.pads.filter(p => p.layers.includes('top')).length, thPads = b.pads.filter(p => p.drill).length;
    assert.equal((gt.flashes.ComponentPad ?? 0) + (gt.flashes['SMDPad,CuDef'] ?? 0), topPads, `${id}: top pads`);
    assert.equal(gb.flashes.ComponentPad ?? 0, thPads, `${id}: bottom pads`);
    assert.equal(gt.flashes.ViaPad ?? 0, b.vias.length, `${id}: vias`);
    assert.equal(gt.draws + gb.draws, b.tracks.length, `${id}: one draw per track`);
    assert.equal(drillHits(excellon(b, true)), thPads + b.vias.length, `${id}: plated holes`);
    assert.equal(drillHits(excellon(b, false)), b.holes.length, `${id}: mounting holes`);
    const mask = readGerber(Object.entries(files).find(([k]) => k.endsWith('-F_Mask.gts'))![1]); assert.equal(Object.values(mask.flashes).reduce((a, x) => a + x, 0), topPads, `${id}: mask openings`);
  }
});

test('describe-it MIDI controller → routed DRC-clean board → Gerber zip a fab accepts', () => {
  const it = interpret('a midi controller with 3 knobs and 7 buttons'); assert.equal(it.recipe?.id, 'midi');
  const build = it.recipe!.build(it.values); const l = layoutBoard(build.circuit);
  assert.equal(drcCounts(l.drc).errors, 0); assert.equal(l.route.failed.length, 0);
  assert.ok(l.board.parts.some(p => p.kind === 'pico')); assert.ok(l.board.virtual.some(v => v.ref === 'J1'), 'USB supply is the Pico\'s own socket');
  const zip = unzipSync(gerberZip(l.board)); const names = Object.keys(zip);
  for (const suf of ['-F_Cu.gtl', '-B_Cu.gbl', '-F_Mask.gts', '-B_Mask.gbs', '-F_Silkscreen.gto', '-Edge_Cuts.gm1', '-PTH.drl']) assert.ok(names.some(n => n.endsWith(suf)), `zip has ${suf}`);
  const edge = strFromU8(zip[names.find(n => n.endsWith('-Edge_Cuts.gm1'))!]); assert.match(edge, /Profile/);
  const cpl = placementCsv(l.board).trim().split('\n'); assert.equal(cpl[0], 'Designator,Mid X,Mid Y,Layer,Rotation'); assert.equal(cpl.length - 1, l.board.parts.length);
  assert.match(bomCsv(l.board), /^Comment,Designator,Footprint,Quantity,LCSC Part #/);
  const pkg = Object.keys(unzipSync(packageZip(l.board, 'readme'))); assert.ok(pkg.some(n => n.endsWith('.kicad_pcb')) && pkg.includes('README.txt') && pkg.some(n => n.startsWith('assembly/')));
  const svg = boardSvg(l.board, { drc: l.drc }); assert.match(svg, /^<svg/);
});

test('KiCad export is a balanced s-expression with every footprint, track and via', () => {
  const b = boards.get('midi')!; const k = toKicadPcb(b);
  let depth = 0, inStr = false; for (let i = 0; i < k.length; i++) { const ch = k[i]; if (ch === '"' && k[i - 1] !== '\\') inStr = !inStr; if (inStr) continue; if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0); }
  assert.equal(depth, 0);
  assert.equal((k.match(/\(footprint "Plajah:/g) ?? []).length, b.parts.length + b.holes.length);
  assert.equal((k.match(/\(segment /g) ?? []).length, b.tracks.length); assert.equal((k.match(/\(via /g) ?? []).length, b.vias.length);
});

test('mains keeps 6 mm from low-voltage copper; DRC catches a track moved too close', () => {
  const r = RECIPES.find(x => x.id === 'charger')!; const l = layoutBoard(r.build(recipeDefaults(r)).circuit);
  assert.ok(l.board.nets.some(n => n.cls === 'mains')); assert.ok(l.drc.some(d => d.level === 'pass' && d.rule === 'mains'));
  const b = l.board; const lv = b.tracks.find(t => b.nets[t.net].cls !== 'mains')!; const mainsPad = b.pads.find(p => b.nets[p.net]?.cls === 'mains')!;
  const moved: Board = { ...b, tracks: [...b.tracks, { ...lv, a: [mainsPad.x + 3, mainsPad.y], b: [mainsPad.x + 3, mainsPad.y + 1] }] };
  assert.ok(drc(moved).some(d => d.level === 'error' && d.rule === 'mains'));
});

test('PCB hazards: mains creepage gates the download until acknowledged; battery protection flagged', () => {
  const charger = RECIPES.find(x => x.id === 'charger')!.build({}).circuit;
  const hz = pcbHazards(charger); const creep = hz.find(h => h.id === 'pcb-mains-creepage')!;
  assert.equal(creep.severity, 'critical'); assert.match(creep.cite ?? '', /IEC 62368-1/);
  assert.equal(openHazards(hz, []).length, 1); assert.equal(openHazards(hz, ['pcb-mains-creepage']).length, 0);
  const lamp = RECIPES.find(x => x.id === 'lamp')!.build({ power: 'battery' }).circuit;
  assert.ok(pcbHazards(lamp).some(h => h.id === 'pcb-battery-protect'));
  assert.equal(pcbHazards(RECIPES.find(x => x.id === 'midi')!.build({}).circuit).length, 0);
});
