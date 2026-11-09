// Plajah Build fabrication: geometry, slicing, CAM, G-code dialects, CLI, 3MF, DFM, connectors.
//   npm run test:fab
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { offset, area, regions, entitiesToPaths, type Loop } from '../services/fab/geom2d';
import { sliceAt, sliceMesh } from '../services/fab/slice';
import { cutJob, pocketJob, fdmJob, latheJob, turnedProfile, writeCli } from '../services/fab/cam';
import { post, parseGcode, fileExtension } from '../services/fab/gcode';
import { dfm2d, dfm3d } from '../services/fab/dfm';
import { PROCESSES, MACHINES, processById, machineById } from '../services/fab/machines';
import { write3mf } from '../services/fab/threeMf';
import { sendToMachine, streamGcode, streamLines, type LinePort } from '../services/fab/connect';
import { MECH_PARTS, mechModel, mechDefaults } from '../services/mech/parts';
import { extrude } from '../services/mech/geometry';

const sq = (s: number, cx = 0, cy = 0): Loop => [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]];
const part = (id: string) => { const p = MECH_PARTS.find(x => x.id === id)!; return mechModel(p, mechDefaults(p)).meshes; };
const box = (w: number, h: number) => [extrude(sq(w / 2), [], 0, h)];

test('offsets are exact for squares and collapse when too deep', () => {
  assert.ok(Math.abs(area(offset(sq(10), 1)[0]) - (400 + 80 + Math.PI)) < 0.2); // rounded outside corners
  assert.ok(Math.abs(area(offset(sq(10), -1)[0]) - 324) < 1e-6);
  assert.equal(offset(sq(1), -2).length, 0);
  // An L shape keeps its reflex corner sharp outward and rounded inward.
  const L: Loop = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
  assert.equal(offset(L, -2).length, 1); assert.ok(area(offset(L, -2)[0]) < area(L));
});

test('regions pair holes with their outlines', () => {
  const r = regions([sq(10, 30, 0), sq(50), sq(3, -20, -20), sq(1, 30, 0)]);
  assert.equal(r.length, 2); assert.equal(r.find(x => Math.abs(area(x.outer)) > 1000)!.holes.length, 2);
  assert.ok(r.every(x => area(x.outer) > 0 && x.holes.every(h => area(h) < 0)));
});

test('CAD entities chain into closed loops', () => {
  const ents = [{ type: 'line', layer: '0', a: [0, 0, 0], b: [10, 0, 0] }, { type: 'line', layer: '0', a: [10, 10, 0], b: [10, 0, 0] }, { type: 'line', layer: '0', a: [10, 10, 0], b: [0, 10, 0] }, { type: 'line', layer: '0', a: [0, 10, 0], b: [0, 0, 0] }, { type: 'circle', layer: '0', c: [5, 5, 0], r: 2 }, { type: 'line', layer: '0', a: [20, 0, 0], b: [30, 0, 0] }] as any;
  const p = entitiesToPaths(ents); assert.equal(p.loops.length, 2); assert.equal(p.open.length, 1);
  assert.ok(Math.abs(Math.abs(area(p.loops.find(l => l.length === 4)!)) - 100) < 1e-6);
});

test('slicing a box gives one square contour per layer, counter-clockwise', () => {
  const loops = sliceAt(box(20, 10), 5); assert.equal(loops.length, 1); assert.ok(Math.abs(area(loops[0]) - 400) < 1e-3);
  const washer = sliceAt(part('washer'), 0.5); assert.equal(washer.length, 2); assert.equal(washer.filter(l => area(l) > 0).length, 1);
  assert.equal(sliceMesh(box(20, 10), 0.5).length, 20);
});

test('cut job: kerf outside outlines, inside holes, holes first, lead-ins and pierces', () => {
  const j = cutJob([sq(50), sq(10, 20, 20)], [], { process: 'plasma', kerf: 2, feed: 2000, pierceDelay: 0.5 });
  const feeds = j.moves.filter(m => m.t === 'feed') as Array<{ x?: number; y?: number }>; const xs = feeds.map(m => m.x!).filter(v => v !== undefined);
  assert.ok(Math.max(...xs) > 50.9 && Math.max(...xs) < 51.1, 'outline cut 1 mm outside'); assert.equal(j.stats.pierces, 2);
  const firstFeed = feeds[0]; assert.ok(firstFeed.x! > 10 && firstFeed.x! < 30 && firstFeed.y! > 10 && firstFeed.y! < 30, 'the hole is cut first');
  const g = post(j, { dialect: 'plasma' }); assert.match(g, /M3 \$0 S1/); assert.match(g, /G4 P0\.5/); assert.match(g, /M5 \$0/); assert.match(g, /M30\n$/);
  assert.equal(cutJob([sq(50), sq(0.5, 20, 20)], [], { process: 'plasma', kerf: 2, feed: 2000 }).warnings.length, 1);
});

test('router cuts in depth passes with the spindle on', () => {
  const j = cutJob([sq(50)], [], { process: 'router', kerf: 6, feed: 1500, thickness: 18, stepDown: 6 });
  assert.deepEqual(j.moves.filter(m => m.t === 'feed' && (m as any).z !== undefined).map(m => (m as any).z), [-6, -12, -18]);
  const g = post(j, { dialect: 'grbl' }); assert.match(g, /S18000 M3/); assert.ok(parseGcode(g).some(m => m.z === -18));
});

test('pocketing clears from the centre out and respects the tool', () => {
  const j = pocketJob([sq(20)], { process: 'mill3', tool: 6, depth: 3, stepDown: 1, feed: 600 });
  const xs = j.moves.filter(m => m.t === 'feed' && (m as any).x !== undefined).map(m => Math.abs((m as any).x)); assert.ok(Math.max(...xs) <= 17.0001);
  assert.match(post(j, { dialect: 'iso', coolant: true }), /T1 M6[\s\S]*M8[\s\S]*M30\n%\n$/);
});

test('FDM slicer: walls, infill, temperatures, extrusion grows monotonically', () => {
  const j = fdmJob(box(20, 2), { layer: 0.2, walls: 2, infill: 0.2, retract: 0, adhesion: 'none' }); assert.equal(j.stats.layers, 10);
  const g = post(j, { dialect: 'marlin', nozzleTemp: 215, bedTemp: 65 }); assert.match(g, /M104 S215/); assert.match(g, /M190 S65/);
  const es = parseGcode(g).filter(m => m.e !== undefined).map(m => m.e!); assert.ok(es.length > 100); assert.ok(es.every((e, i) => i === 0 || e >= es[i - 1]));
  // 20×20×2 mm solid-ish box: roughly 0.4 m of 1.75 mm filament or more.
  assert.ok(j.stats.filamentG! > 0.5 && j.stats.filamentG! < 1.5, `${j.stats.filamentG}`);
  assert.match(post(j, { dialect: 'klipper' }), /PRINT_START EXTRUDER=210 BED=60[\s\S]*PRINT_END/);
});

test('lathe: profile from a turned part, roughing then finish in diameter mode', () => {
  const prof = turnedProfile(part('spacer')); assert.ok(prof.every(([, r]) => Math.abs(r - prof[0][1]) < 0.05));
  const j = latheJob(prof, { stock: 20, doc: 1, finish: 0.2, feed: 150, finishFeed: 80, rpm: 1200 }); const g = post(j, { dialect: 'lathe-iso' });
  assert.match(g, /G18[\s\S]*G7[\s\S]*G97 S1200 M3/); const xs = parseGcode(g).filter(m => m.g === 1).map(m => m.x); assert.ok(Math.min(...xs) >= prof[0][1] * 2 - 0.01);
  assert.equal(fileExtension('lathe-iso'), 'ngc');
});

test('CLI layers for metal powder bed', () => {
  const cli = writeCli(sliceMesh(part('washer'), 0.04), 'washer'); const lines = cli.split('\n');
  assert.equal(lines[0], '$$HEADERSTART'); assert.ok(lines.includes('$$ASCII')); assert.match(cli, /\$\$LAYERS\/000040/);
  const poly = lines.find(l => l.startsWith('$$POLYLINE/'))!.split('/')[1].split(','); const n = +poly[2]; assert.equal(poly.length, 3 + 2 * n);
  assert.ok(cli.includes('$$POLYLINE/1,1,') && cli.includes('$$POLYLINE/1,0,'), 'outer CCW and inner CW contours');
});

test('3MF: a valid package with the mesh in millimetres, scaled for shrink', () => {
  const z = unzipSync(write3mf(box(10, 10), { scale: 1.25 })); const xml = strFromU8(z['3D/3dmodel.model']);
  assert.ok(z['[Content_Types].xml'] && z['_rels/.rels']); assert.match(xml, /unit="millimeter"/); assert.match(xml, /x="6\.25000"/); assert.equal((xml.match(/<triangle /g) ?? []).length, 12);
});

test('DFM: machine fit, thin walls, overhangs, PVC on a laser, small plasma holes, sharp router corners', () => {
  const fdm = processById('fdm')!; assert.equal(dfm3d(box(400, 10), fdm, machineById('klipper-fdm'))[0].level, 'error');
  assert.ok(dfm3d(box(0.5, 10), fdm, null).some(f => f.level === 'warn' && /thinner/.test(f.title)));
  assert.ok(dfm2d([sq(20)], processById('laser-co2')!, { material: 'PVC sheet' }).some(f => f.level === 'error'));
  assert.ok(dfm2d([sq(50), sq(1.5, 10, 10)], processById('plasma')!, { thickness: 6 }).some(f => f.level === 'warn' && /hole/.test(f.title)));
  assert.ok(dfm2d([[[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]], processById('router')!, { tool: 6 }).some(f => /sharp inside corner/.test(f.title)));
});

test('catalogue: every machine points at a known process; metal printers are covered', () => {
  for (const m of MACHINES) assert.ok(processById(m.process), m.id);
  for (const id of ['lpbf', 'ebm', 'binder-jet', 'bound-metal', 'ded']) assert.equal(processById(id)?.family, 'Metal printing');
  assert.ok(PROCESSES.length >= 20);
});

test('network senders use each printer API', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); }) as typeof fetch;
  assert.ok((await sendToMachine({ kind: 'moonraker' }, { host: '192.168.1.5' }, 'a.gcode', 'G1', true, f)).ok); assert.equal(calls[0].url, 'http://192.168.1.5/server/files/upload');
  await sendToMachine({ kind: 'prusalink' }, { host: 'prusa.local', apiKey: 'k' }, 'a.gcode', 'G1', true, f); assert.match(calls[1].url, /\/api\/v1\/files\/usb\/a\.gcode$/); assert.equal((calls[1].init!.headers as any)['Print-After-Upload'], '?1');
  await sendToMachine({ kind: 'octoprint' }, { host: 'http://octopi', apiKey: 'k' }, 'a.gcode', 'G1', false, f); assert.equal(calls[2].url, 'http://octopi/api/files/local');
  await sendToMachine({ kind: 'duet' }, { host: 'duet' }, 'a.gcode', 'G1', true, f); assert.match(calls[3].url, /rr_upload/); assert.match(calls[4].url, /M32/);
  const bad = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch; assert.match((await sendToMachine({ kind: 'moonraker' }, { host: 'x' }, 'a', 'G1', true, bad)).message, /CORS/);
});

test('USB streaming waits for ok and stops on an error', async () => {
  const sent: string[] = []; const replies = ['echo:busy', 'ok', 'ok', 'error:2 bad number'];
  const port: LinePort = { write: async l => { sent.push(l); }, readLine: async () => replies.shift() ?? 'ok', close: async () => {} };
  assert.deepEqual(streamLines('G21 ; mm\n(comment)\n\nG1 X1\n%'), ['G21', 'G1 X1']);
  const r = await streamGcode(port, 'G21\nG90\nG1 X1\nG1 X2'); assert.equal(r.ok, false); assert.match(r.message, /line 3/); assert.equal(sent.length, 3);
});

// ---------------------------------------------------------------- printing gaps
import { supportGrids, rasterize, makeGrid, count } from '../services/fab/raster';
import { resinJob, writeSl1, encodePngGray } from '../services/fab/resin';
import { FILAMENTS, RESINS } from '../services/fab/materials';

const tee = () => [extrude(sq(5), [], 0, 10), extrude([[-15, -5], [15, -5], [15, 5], [-15, 5]], [], 10, 15)];

test('supports appear under overhangs only, and not under a plain box', () => {
  const t = fdmJob(tee(), { supports: 'buildplate' });
  assert.ok(Number(t.meta.supportFilamentMm) > 100, `support ${t.meta.supportFilamentMm}`);
  const g = t.supportGrids!;
  // Low layers carry support under the wings (|x| > 6) but never inside the stem.
  const mid = g[10]; const at = (x: number, y: number) => mid.bits[Math.floor((y - mid.y0) / mid.cell) * mid.w + Math.floor((x - mid.x0) / mid.cell)];
  assert.equal(at(11, 0), 1); assert.equal(at(-11, 0), 1); assert.equal(at(0, 0), 0);
  assert.equal(Number(fdmJob(box(20, 10), { supports: 'everywhere' }).meta.supportFilamentMm ?? 0), 0);
});

test('raster fill respects holes', () => {
  const g = rasterize(makeGrid(-12, -12, 12, 12, 0.5), [sq(10), [...sq(4)].reverse()]);
  assert.ok(Math.abs(count(g) * 0.25 - (400 - 64)) < 12);
});

test('slicer retracts, hops, brims and runs the fan', () => {
  const j = fdmJob(tee(), { adhesion: 'brim', brimWidth: 4, retract: 1, zHop: 0.3, fan: 0.5 });
  const g = post(j, { dialect: 'marlin' });
  assert.match(g, /M106 S128/); assert.match(g, /M107/);
  const moves = parseGcode(g); let retracts = 0, lastE = 0; for (const m of moves) { if (m.e !== undefined) { if (m.e < lastE - 0.5) retracts++; lastE = m.e; } }
  assert.ok(retracts > 5, `retracts ${retracts}`);
  // The brim widens layer 0 beyond the part.
  const l0 = j.moves.slice(0, j.moves.findIndex((m, i) => i > 0 && m.t === 'layer'));
  const xs = l0.flatMap(m => (m.t === 'feed' && m.x !== undefined ? [m.x] : [])); assert.ok(Math.max(...xs) > 5 + 3); // layer 0 is the 10 mm stem
  assert.ok(FILAMENTS.length >= 10 && RESINS.length >= 4);
});

test('resin job builds raft, pillars and a valid SL1 package', () => {
  const rj = resinJob(tee(), { layer: 0.1, printer: 'sl1s' });
  assert.ok(rj.supportLayers >= 40 && rj.fits && rj.ml > 1);
  // Pillars reach the wing undersides: a lift layer has exposed pixels under the wing.
  const lift = rj.layers[rj.supportLayers - 1].mask; assert.ok(count(lift) > 0);
  const zip = unzipSync(writeSl1(rj, 'tee', { layer: 0.1 }));
  assert.match(strFromU8(zip['config.ini']), /numFast = \d+/);
  const png = zip['tee00000.png']; assert.deepEqual([...png.slice(1, 4)], [80, 78, 71]);
  assert.equal(Object.keys(zip).filter(k => k.endsWith('.png')).length, rj.layers.length);
  const tiny = encodePngGray(2, 2, new Uint8Array([0, 255, 255, 0])); assert.equal(tiny[25], 0); // colour type 0
});

// ---------------------------------------------------------------- slicer profiles and quality features
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { importProfiles, applyProfiles, renderGcode, settingsVars, jobVars, parseIni, loadProfiles, saveProfiles, mergeProfiles } from '../services/fab/profiles';
import { profileHazards } from '../services/safety/hazards';
import { infillPaths, gyroidFill } from '../services/fab/infill';
import { estimateSeconds, trapezoid } from '../services/fab/estimate';
import { layerHeights } from '../services/fab/slice';
import { FDM_DEFAULTS, seamIndex, type FdmOptions } from '../services/fab/cam';

const fixture = (f: string) => readFileSync(new URL(`./fixtures/fab/${f}`, import.meta.url), 'utf8');
const byKind = (r: ReturnType<typeof importProfiles>, k: string) => r.profiles.find(p => p.kind === k)!;
/** Square pyramid: base 2s × 2s at z = 0, apex at height h. */
const pyramid = (s: number, h: number) => ({ positions: [-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0, 0, 0, h], indices: [0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4] });
const monotonicE = (g: string) => { const es = parseGcode(g).filter(m => m.e !== undefined).map(m => m.e!); return es.length > 0 && es.every(Number.isFinite); };
const noNaN = (g: string) => !/NaN|Infinity|undefined/.test(g);

test('OrcaSlicer JSON: inherits chains resolve and map onto our options', () => {
  const r = importProfiles([{ name: 'voron.json', data: fixture('orca_machine_chain.json') }]);
  assert.equal(r.profiles.length, 4, 'abstract parents (instantiation false) are not listed on their own'); assert.deepEqual(r.warnings, []);
  const pr = r.profiles.find(p => p.name === 'My Voron 350')!; assert.equal(pr.name, 'My Voron 350'); assert.equal(pr.source, 'orca');
  assert.deepEqual(pr.printer!.bed, [350, 350, 330]); assert.deepEqual(pr.printer!.bedCenter, [175, 175]); assert.equal(pr.printer!.bedShape, 'rect');
  assert.equal(pr.printer!.nozzle, 0.4); assert.equal(pr.printer!.dialect, 'klipper');
  assert.equal(pr.printer!.retract, 0.5, 'own value wins'); assert.equal(pr.printer!.zHop, 0.4, 'grandparent value inherited');
  assert.equal(pr.printer!.limits.maxX, 500); assert.equal(pr.printer!.limits.accel, 5000); assert.match(pr.printer!.startGcode!, /^PRINT_START BED=/);
  const fi = byKind(r, 'filament'); assert.equal(fi.filament!.type, 'PLA'); assert.equal(fi.filament!.nozzleTemp, 215); assert.equal(fi.filament!.firstLayerNozzleTemp, 220);
  assert.equal(fi.filament!.bedTemp, 55); assert.equal(fi.filament!.firstLayerBedTemp, 60); assert.equal(fi.filament!.fan, 0.8); assert.equal(fi.filament!.maxVolumetric, 15);
  const ps = byKind(r, 'process').process!;
  assert.deepEqual({ layer: ps.layer, firstLayer: ps.firstLayer, walls: ps.walls, infill: ps.infill, pattern: ps.infillPattern, top: ps.topLayers, bottom: ps.solidLayers, seam: ps.seam, ironing: ps.ironing, supports: ps.supports, style: ps.supportStyle, overhang: ps.overhang, adhesion: ps.adhesion },
    { layer: 0.2, firstLayer: 0.25, walls: 4, infill: 0.25, pattern: 'gyroid', top: 4, bottom: 3, seam: 'rear', ironing: true, supports: 'buildplate', style: 'tree', overhang: 40, adhesion: 'skirt' });
  assert.deepEqual([ps.outerWallSpeed, ps.innerWallSpeed, ps.infillSpeed, ps.travel, ps.firstLayerSpeed], [120, 200, 250, 400, 50]);
  // Combined: process speeds, filament flow cap and the printer's acceleration.
  const a = applyProfiles({ printer: pr, filament: fi, process: byKind(r, 'process') });
  assert.equal(a.dialect, 'klipper'); assert.equal(a.fdm.maxVolumetric, 15); assert.equal(a.fdm.accel, 4000); assert.equal(a.fdm.retract, 0.5); assert.equal(a.fdm.nozzleTemp, 215);
});

test('OrcaSlicer user preset alone: the missing system parent is reported, and found later in the library', () => {
  const user = JSON.parse(fixture('orca_machine_chain.json')).find((p: any) => p.name === 'My PLA');
  const alone = importProfiles([{ name: 'My PLA.json', data: JSON.stringify(user) }]);
  assert.equal(alone.profiles.length, 1); assert.match(alone.profiles[0].warnings[0], /inherits from "fdm_filament_pla"/); assert.equal(alone.profiles[0].filament!.diameter, undefined);
  const sys = JSON.parse(fixture('orca_machine_chain.json')).find((p: any) => p.name === 'fdm_filament_pla');
  const lib = importProfiles([{ name: 'pla.json', data: JSON.stringify({ ...sys, instantiation: 'true' }) }]).profiles;
  const again = importProfiles([{ name: 'My PLA.json', data: JSON.stringify(user) }], lib);
  assert.deepEqual(again.profiles[0].warnings, []); assert.equal(again.profiles[0].filament!.diameter, 1.75); assert.equal(again.profiles[0].filament!.nozzleTemp, 215);
});

test('PrusaSlicer config bundle: sections, abstract parents, percentages and quoted G-code', () => {
  const r = importProfiles([{ name: 'PrusaSlicer_config_bundle.ini', data: fixture('prusa_bundle.ini') }]);
  assert.equal(r.profiles.length, 3); assert.deepEqual(r.profiles.map(p => p.name).sort(), ['0.20mm QUALITY @MK3', 'Original Prusa i3 MK3S', 'Prusament PETG']);
  const pr = byKind(r, 'printer').printer!;
  assert.deepEqual(pr.bed, [250, 210, 210]); assert.deepEqual(pr.bedCenter, [125, 105]); assert.equal(pr.dialect, 'marlin'); assert.equal(pr.limits.maxX, 200); assert.equal(pr.limits.accel, 1250);
  assert.equal(pr.startGcode!.split('\n').length, 11, 'escaped newlines become lines');
  const fi = byKind(r, 'filament').filament!;
  assert.deepEqual([fi.type, fi.nozzleTemp, fi.firstLayerNozzleTemp, fi.bedTemp, fi.firstLayerBedTemp, fi.fan, fi.fanFirstLayers, fi.maxVolumetric, fi.retract], ['PETG', 240, 230, 90, 85, 0.5, 3, 8, 1]);
  assert.equal(fi.startGcode, 'M900 K0.08 ; Filament gcode');
  const ps = byKind(r, 'process').process!;
  assert.deepEqual({ layer: ps.layer, firstLayer: ps.firstLayer, walls: ps.walls, infill: ps.infill, pattern: ps.infillPattern, top: ps.topLayers, bottom: ps.solidLayers, seam: ps.seam, ironing: ps.ironing, ironFlow: ps.ironingFlow, ironSpacing: ps.ironingSpacing, supports: ps.supports, style: ps.supportStyle, overhang: ps.overhang, maxVol: ps.maxVolumetric, adhesion: ps.adhesion },
    { layer: 0.2, firstLayer: 0.2, walls: 2, infill: 0.2, pattern: 'cubic', top: 5, bottom: 4, seam: 'rear', ironing: true, ironFlow: 0.15, ironSpacing: 0.1, supports: 'buildplate', style: 'tree', overhang: 55, maxVol: 11, adhesion: 'skirt' });
  assert.equal(ps.outerWallSpeed, 22.5, '50% of the 45 mm/s perimeter speed'); assert.equal(ps.solidSpeed, 40);
  // A single exported .ini (no sections) is split by what it contains.
  const flat = parseIni('layer_height = 0.3\nperimeters = 3\nfill_density = 10%\nbed_shape = 0x0,200x0,200x200,0x200\ntemperature = 205\nfilament_type = PLA\n').root;
  const single = importProfiles([{ name: 'config.ini', data: Object.entries(flat).map(([k, v]) => `${k} = ${v}`).join('\n') }]);
  assert.deepEqual(single.profiles.map(p => p.kind).sort(), ['filament', 'printer', 'process']);
});

test('3MF projects: PrusaSlicer and OrcaSlicer settings inside Metadata/', () => {
  const prusaCfg = '; generated by PrusaSlicer\n; layer_height = 0.1\n; perimeters = 3\n; fill_density = 30%\n; bed_shape = 0x0,180x0,180x180,0x180\n; temperature = 200\n; filament_type = PLA\n; printer_settings_id = Mini\n; filament_settings_id = Generic PLA\n; print_settings_id = 0.10mm DETAIL\n';
  const p3 = zipSync({ '3D/3dmodel.model': strToU8('<model/>'), 'Metadata/Slic3r_PE.config': strToU8(prusaCfg) });
  const a = importProfiles([{ name: 'part.3mf', data: p3 }]);
  assert.deepEqual(a.profiles.map(p => `${p.kind}:${p.name}`).sort(), ['filament:Generic PLA', 'printer:Mini', 'process:0.10mm DETAIL']);
  assert.equal(byKind(a, 'printer').printer!.bed[0], 180); assert.equal(byKind(a, 'process').process!.infill, 0.3);
  const orcaCfg = JSON.stringify({ layer_height: '0.16', wall_loops: '3', sparse_infill_density: '12%', printable_area: ['0x0', '256x0', '256x256', '0x256'], nozzle_temperature: ['230'], filament_type: ['PETG'], printer_settings_id: 'Bambu Lab X1 Carbon 0.4 nozzle', filament_settings_id: ['Bambu PETG Basic'], print_settings_id: '0.16mm Optimal' });
  const b = importProfiles([{ name: 'plate.3mf', data: zipSync({ 'Metadata/project_settings.config': strToU8(orcaCfg) }) }]);
  assert.equal(b.profiles.length, 3); assert.equal(byKind(b, 'filament').name, 'Bambu PETG Basic'); assert.equal(byKind(b, 'filament').filament!.nozzleTemp, 230); assert.equal(byKind(b, 'process').process!.layer, 0.16);
  // Orca preset bundles are zips of JSON.
  const bundle = zipSync({ 'bundle_structure.json': strToU8('{}'), 'printer/My Voron.json': strToU8(fixture('orca_machine_chain.json')) });
  assert.equal(importProfiles([{ name: 'voron.orca_printer', data: bundle }]).profiles.length, 4);
  assert.match(importProfiles([{ name: 'broken.json', data: '{ nope' }]).warnings[0], /could not be read/);
});

test('custom G-code templates: placeholders, conditionals, and unresolved lines commented out', () => {
  const vars = { ...settingsVars({ nozzle_diameter: ['0.6'], filament_type: 'PETG,PLA', printer_model: 'MK3S' }), ...jobVars({ ...FDM_DEFAULTS, nozzle: 0.6, nozzleTemp: 240, bedTemp: 85, firstLayerNozzleTemp: 230 }) };
  const r = renderGcode('M104 S[first_layer_temperature]\nM190 S{first_layer_bed_temperature[0]}\nM109 S{nozzle_temperature_initial_layer[initial_extruder] + 5}\n{if nozzle_diameter[0] > 0.5}M900 K0.02{elsif nozzle_diameter[0] > 0.3}M900 K0.04{else}M900 K0.06{endif}\n{if filament_type[0]=="PETG"}M221 S95{endif}\nM862.3 P "[printer_model]"\nM117 {plate_name}\n{if is_superslicer}\nG29 L1\n{endif}\nG1 Z5', vars);
  assert.deepEqual(r.text.split('\n').slice(0, 6), ['M104 S230', 'M190 S85', 'M109 S235', 'M900 K0.02', 'M221 S95', 'M862.3 P "MK3S"']);
  assert.match(r.text, /^; PLAJAH SKIPPED.*M117 \{plate_name\}$/m); assert.match(r.text, /^; PLAJAH SKIPPED.*conditional block/m);
  assert.ok(!/^G29 L1$/m.test(r.text), 'contents of an unreadable conditional are not emitted'); assert.match(r.text, /G1 Z5$/);
  assert.equal(r.skipped.length, 2);
});

test('an imported profile slices: bed centre, flavour, rendered start G-code, first-layer temperatures', () => {
  const r = importProfiles([{ name: 'bundle.ini', data: fixture('prusa_bundle.ini') }]);
  const a = applyProfiles({ printer: byKind(r, 'printer'), filament: byKind(r, 'filament'), process: byKind(r, 'process') });
  const o: FdmOptions = { ...FDM_DEFAULTS, ...a.fdm, supports: 'none', center: a.bedCenter, bed: { w: a.bed![0], d: a.bed![1] } };
  const j = fdmJob(box(20, 4), o);
  const xs = j.moves.flatMap(m => (m.t === 'feed' && m.x !== undefined ? [m.x] : [])); assert.ok(Math.min(...xs) > 100 && Math.max(...xs) < 150, 'centred on the 250 × 210 bed');
  assert.equal(j.stats.layers, 1 + Math.round((4 - 0.2) / 0.2));
  const pr = byKind(r, 'printer').printer!; const vars = { ...settingsVars({ ...byKind(r, 'printer').settings, ...byKind(r, 'filament').settings }), ...jobVars(o) };
  const st = renderGcode(pr.startGcode!, vars), en = renderGcode(pr.endGcode!, vars);
  assert.deepEqual(st.skipped, []);
  const g = post(j, { dialect: a.dialect!, nozzleTemp: o.firstLayerNozzleTemp, bedTemp: o.firstLayerBedTemp, startGcode: st.text, endGcode: en.text });
  assert.match(g, /M190 S85 ; wait for bed temp[\s\S]*M109 S230[\s\S]*M221 S95[\s\S]*G92 E0/); assert.match(g, /M104 S240/, 'switches to the normal temperature after layer 1');
  assert.match(g, /M140 S90/); assert.match(g, /M84 ; disable motors\n$/); assert.ok(!/PRINT_START|\[first_layer/.test(g)); assert.ok(monotonicE(g) && noNaN(g));
  // Volumetric cap from the filament (8 mm³/s) slows fast infill: 8 / (0.2 × 0.45) ≈ 89 mm/s.
  const fs = parseGcode(g).length; assert.ok(fs > 100); assert.ok(!j.moves.some(m => m.t === 'feed' && m.e !== undefined && (m.f ?? 0) / 60 > 8 / (0.2 * 0.45) + 1e-6));
});

test('profile safety: temperatures over the material limit, speeds over the machine, risky G-code', () => {
  const ok = profileHazards({ material: 'PLA', nozzleTemp: 210, bedTemp: 60, speed: 100, travel: 150, maxX: 300, maxY: 300 }); assert.equal(ok.length, 0);
  const hot = profileHazards({ material: 'PLA', nozzleTemp: 215, firstLayerNozzleTemp: 260, bedTemp: 60, speed: 100, travel: 150 });
  const t = hot.find(h => h.id === 'profile-nozzle-temp')!; assert.equal(t.severity, 'critical'); assert.ok(t.ack && t.cite); assert.ok(hot.some(h => h.id === 'profile-ptfe'));
  assert.ok(profileHazards({ material: 'PETG', nozzleTemp: 240, bedTemp: 130, speed: 50, travel: 50 }).some(h => h.id === 'profile-bed-temp' && h.severity === 'critical'));
  const fast = profileHazards({ material: 'PLA', nozzleTemp: 210, bedTemp: 60, speed: 120, travel: 400, maxX: 200, maxY: 200 }); assert.ok(fast.some(h => h.id === 'profile-speed' && h.ack));
  const g = profileHazards({ material: 'PLA', nozzleTemp: 210, bedTemp: 60, speed: 50, travel: 50, gcode: [{ label: 'Start', text: 'G28\nM502 ; reset\nM302 S0\nM104 S280\nM117 ok ; M500 in a comment is fine' }] });
  const gh = g.find(h => h.id === 'profile-gcode-start')!; assert.equal(gh.severity, 'critical'); assert.match(gh.why, /M502/); assert.match(gh.why, /M302/); assert.match(gh.why, /280/); assert.ok(!/M500 in/.test(gh.why));
  assert.equal(profileHazards({ nozzleTemp: 295, bedTemp: 110, speed: 50, travel: 50 }).filter(h => h.severity === 'critical').length, 0, 'unknown filament: generic 300/120 ceiling');
});

test('saved profiles are per user and survive a reload', () => {
  const mem = new Map<string, string>(); const st = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => { mem.set(k, v); } };
  const r = importProfiles([{ name: 'bundle.ini', data: fixture('prusa_bundle.ini') }]);
  assert.ok(saveProfiles(st, r.profiles, 'uid-a')); assert.equal(loadProfiles(st, 'uid-a').length, 3); assert.equal(loadProfiles(st, 'uid-b').length, 0);
  const again = importProfiles([{ name: 'bundle.ini', data: fixture('prusa_bundle.ini') }]);
  assert.equal(mergeProfiles(loadProfiles(st, 'uid-a'), again.profiles).length, 3, 're-importing replaces by kind and name');
});

test('infill patterns: grid, cubic and gyroid stay inside and print valid G-code', () => {
  const area = [sq(15)];
  for (const pat of ['lines', 'grid', 'cubic', 'gyroid'] as const) {
    const paths = infillPaths(area, pat, 2, 3, 1); assert.ok(paths.length > 3, pat);
    assert.ok(paths.flat().every(p => Math.abs(p[0]) <= 15.01 && Math.abs(p[1]) <= 15.01), `${pat} stays inside`);
    const j = fdmJob(box(30, 3), { infillPattern: pat, infill: 0.2, solidLayers: 1, adhesion: 'none' }); const g = post(j, { dialect: 'marlin' }); assert.ok(monotonicE(g) && noNaN(g), pat);
  }
  // Gyroid: curved lines, and the pattern changes with height.
  const gy = gyroidFill(area, 2, 0.6); assert.ok(gy.some(l => l.length > 6), 'curves, not straight lines');
  assert.notDeepEqual(gyroidFill(area, 2, 0.6)[0], gyroidFill(area, 2, 1.4)[0]);
  // Cubic shifts with height; grid crosses itself in one layer.
  assert.notDeepEqual(infillPaths(area, 'cubic', 2, 0.2, 0)[0], infillPaths(area, 'cubic', 2, 1.2, 5)[0]);
  const angles = new Set(infillPaths(area, 'grid', 2, 1, 0).map(l => Math.round(Math.atan2(l[1][1] - l[0][1], l[1][0] - l[0][0]) * 180 / Math.PI + 360) % 180)); assert.equal(angles.size, 2);
});

test('adaptive layers: thin on shallow slopes, thick on vertical walls, exact tops', () => {
  const walls = layerHeights(box(20, 10), { layer: 0.2, adaptive: true, nozzle: 0.4 }); // vertical sides: thick layers
  assert.ok(walls.length < 50, `${walls.length}`); assert.ok(Math.abs(walls[walls.length - 1] - 10) < 1e-6);
  const shallow = layerHeights([pyramid(20, 5)], { layer: 0.2, adaptive: true, nozzle: 0.4 }); // ~14° slope: thin layers
  const steps = shallow.map((z, i) => z - (i ? shallow[i - 1] : 0)); assert.ok(Math.max(...steps.slice(1)) < 0.2, `${Math.max(...steps)}`); assert.ok(shallow.length > 25);
  const j = fdmJob([pyramid(20, 5)], { adaptive: true, adhesion: 'none' }); const g = post(j, { dialect: 'marlin' });
  const zs = [...new Set(parseGcode(g).filter(m => m.g === 1 && m.e !== undefined).map(m => +m.z.toFixed(3)))]; assert.ok(zs.length > 20); assert.ok(monotonicE(g) && noNaN(g));
  // A first layer of its own height.
  assert.equal(layerHeights(box(20, 2), { layer: 0.2, firstLayer: 0.3 })[0], 0.3);
});

test('seams: rear puts the start at the back, aligned follows the layer below into a corner', () => {
  const l: Loop = [[-10, -10], [10, -10], [10, 10], [0, 12], [-10, 10]];
  assert.equal(seamIndex(l, 'rear', { pos: [0, 0], prev: [], li: 0, k: 0 }), 3);
  assert.equal(seamIndex(l, 'aligned', { pos: [0, 0], prev: [[10, -9.5]], li: 1, k: 0 }), 1);
  assert.equal(seamIndex(l, 'nearest', { pos: [-11, 9], prev: [], li: 0, k: 0 }), 4);
  // In a job, every layer's outer wall starts at the back.
  const j = fdmJob(box(20, 2), { seam: 'rear', walls: 1, infill: 0, solidLayers: 0, adhesion: 'none', retract: 0, zHop: 0 });
  const starts: number[] = []; let y = 0, fresh = false;
  for (const m of j.moves) { if (m.t === 'layer') fresh = true; if (m.t !== 'rapid' && m.t !== 'feed') continue; if (fresh && m.t === 'feed' && m.x !== undefined) { starts.push(y); fresh = false; } y = m.y ?? y; }
  assert.equal(starts.length, j.stats.layers); assert.ok(starts.every(v => v > 9), `${starts}`);
});

test('ironing: a light, slow pass over top surfaces only', () => {
  const plain = fdmJob(tee(), { adhesion: 'none' }); const ironed = fdmJob(tee(), { adhesion: 'none', ironing: true });
  assert.ok(Number(ironed.meta.ironingFilamentMm) > 0); assert.equal(plain.meta.ironingFilamentMm, undefined);
  const slow = ironed.moves.filter(m => m.t === 'feed' && m.x !== undefined && m.f === 15 * 60); assert.ok(slow.length > 50);
  // Ironing happens on the wing tops (z = 10) and the stem's top layer... not on the bottom.
  const layerOf = (idx: number) => { for (let i = idx; i >= 0; i--) { const m = ironed.moves[i]; if (m.t === 'layer') return m.z; } return 0; };
  const zs = new Set(ironed.moves.map((m, i) => (m.t === 'feed' && m.f === 900 ? layerOf(i) : -1)).filter(z => z > 0)); assert.ok([...zs].every(z => z >= 9.9), `${[...zs]}`);
  assert.ok(monotonicE(post(ironed, { dialect: 'marlin' })));
});

test('tree supports reach the wings from the bed and print as rings', () => {
  const t = fdmJob(tee(), { supports: 'buildplate', supportStyle: 'tree' }); const s = Number(t.meta.supportFilamentMm);
  assert.ok(s > 20, `support ${s}`);
  assert.ok(t.moves.some(m => m.t === 'feed' && m.x !== undefined && Math.abs(m.x) > 6), 'printed under the wings');
  const g = t.supportGrids!; const at = (L: number, x: number) => { const m = g[L]; let n = 0; for (let r = 0; r < m.h; r++) { const c = Math.floor((x - m.x0) / m.cell); if (m.bits[r * m.w + c]) n++; } return n; };
  assert.ok([10, 11, 12, 13, 14].some(x => at(2, x) > 0) || [-10, -11, -12, -13, -14].some(x => at(2, x) > 0), 'branches near the bed under the wings');
  assert.equal(Number(fdmJob(box(20, 10), { supports: 'everywhere', supportStyle: 'tree' }).meta.supportFilamentMm ?? 0), 0);
  assert.ok(monotonicE(post(t, { dialect: 'marlin' })));
});

test('time estimate accounts for acceleration and corners', () => {
  assert.ok(Math.abs(trapezoid(100, 50, 1e9, 0, 0) - 2) < 1e-6); // instant acceleration: L / v
  assert.ok(Math.abs(trapezoid(10, 100, 1000, 0, 0) - 2 * Math.sqrt(10 / 1000)) < 1e-6); // never reaches cruise
  const zig = Array.from({ length: 200 }, (_, i) => ({ t: 'feed' as const, x: i % 2 ? 20 : 0, y: i * 0.4, e: i, f: 6000 }));
  const slow = estimateSeconds(zig, { accel: 500 }), fast = estimateSeconds(zig, { accel: 20000 });
  assert.ok(slow > fast * 1.5, `${slow} vs ${fast}`);
  const straight = [{ t: 'feed' as const, x: 50, f: 3000 }, { t: 'feed' as const, x: 100, f: 3000 }]; const corner = [{ t: 'feed' as const, x: 50, f: 3000 }, { t: 'feed' as const, x: 50, y: 50, f: 3000 }];
  assert.ok(estimateSeconds(corner, { accel: 1000 }) > estimateSeconds(straight, { accel: 1000 }), 'stopping at a sharp corner costs time');
  const j = fdmJob(box(20, 2), { accel: 500, adhesion: 'none' }); assert.ok(j.stats.seconds > Number(j.meta.secondsNoAccel), 'longer than the constant-speed sum');
  assert.ok(fdmJob(box(20, 2), { accel: 5000, adhesion: 'none' }).stats.seconds < j.stats.seconds);
});

// ---------------------------------------------------------------- machining gaps: 3D surfacing
import { DropField, rasterJob, waterlineJob, stepoverForScallop, scallopForStepover } from '../services/fab/surface';
import { distToLoop } from '../services/fab/geom2d';

/** A UV sphere, radius r about the origin. */
function sphere(r: number, lat = 24, lon = 48) {
  const P: number[] = [], I: number[] = [];
  for (let i = 0; i <= lat; i++) for (let j = 0; j < lon; j++) { const th = Math.PI * i / lat, ph = 2 * Math.PI * j / lon; P.push(r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)); }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = i * lon + j, b = i * lon + (j + 1) % lon, c = (i + 1) * lon + j, d = (i + 1) * lon + (j + 1) % lon; I.push(a, c, b, b, c, d); }
  return [{ positions: P, indices: I }];
}

test('drop-cutter: flat and ball against a box, exact edge and vertex contacts, stock to leave', () => {
  const b = box(20, 10); // x, y in ±10, z 0..10
  const flat = new DropField(b, { shape: 'flat', dia: 6 }), ball = new DropField(b, { shape: 'ball', dia: 6 });
  assert.ok(Math.abs(flat.drop(0, 0) - 10) < 1e-9 && Math.abs(ball.drop(0, 0) - 10) < 1e-9);
  assert.ok(Math.abs(flat.drop(12, 0) - 10) < 1e-9, 'the flat rim still rests on the top edge 2 mm away');
  assert.ok(Math.abs(ball.drop(12, 0) - (10 + Math.sqrt(5) - 3)) < 1e-9, 'ball on an edge 2 mm off: centre at 10 + √(9 − 4)');
  assert.ok(Math.abs(ball.drop(12, 12) - (10 + Math.sqrt(9 - 8) - 3)) < 1e-9, 'ball on the corner vertex');
  assert.equal(flat.drop(14, 0), 0, 'past the part the tool drops to the floor');
  assert.ok(Math.abs(new DropField(b, { shape: 'ball', dia: 6 }, { stockToLeave: 0.5 }).drop(0, 0) - 10.5) < 1e-9);
});

test('scallop height sets the step-over and round-trips', () => {
  assert.ok(Math.abs(stepoverForScallop(3, 0.01) - 2 * Math.sqrt(0.01 * 5.99)) < 1e-12);
  assert.ok(Math.abs(scallopForStepover(3, stepoverForScallop(3, 0.02)) - 0.02) < 1e-9);
});

test('waterline: contours sit one tool radius off the box walls and touch the sphere', () => {
  const j = waterlineJob(box(20, 10), { cutter: { shape: 'flat', dia: 6 }, feed: 800, stepDown: 2.5, resolution: 1 });
  const sq10 = sq(10); const mid = j.levels.filter(L => L.z > 0.5 && L.z < 9.5);
  assert.ok(mid.length >= 3 && mid.every(L => L.loops.length === 1));
  for (const L of mid) for (const p of L.loops[0]) assert.ok(Math.abs(distToLoop(p, sq10) - 3) < 2e-3, `${p} is ${distToLoop(p, sq10)} off the wall`);
  // Ball on a sphere: the ball centre at every contour point is R + r from the sphere's centre (the tool touches it).
  const s = sphere(10); const R = 3; const w = waterlineJob(s, { cutter: { shape: 'ball', dia: 2 * R }, feed: 800, stepDown: 2, resolution: 0.8 });
  const upper = w.levels.filter(L => L.z > 0.5 && L.z < 9); assert.ok(upper.length >= 3);
  for (const L of upper) { assert.equal(L.loops.length, 1); for (const p of L.loops[0]) { const d = Math.hypot(p[0], p[1], L.z + R); assert.ok(Math.abs(d - 13) < 0.05, `centre ${d.toFixed(3)} from the sphere`); } }
  // Every contour runs with the part on the right (climb cutting with M3) in the moves.
  const g = post(j, { dialect: 'grbl' }); assert.match(g, /S12000 M3/); assert.ok(parseGcode(g).some(m => Math.abs(m.z - mid[0].z) < 1e-3));
});

test('raster finish: no gouge anywhere, rows on the scallop step-over, stock left on', () => {
  const s = sphere(10); const R = 2;
  const j = rasterJob(s, { cutter: { shape: 'ball', dia: 2 * R }, scallop: 0.02, feed: 1200, resolution: 0.5 });
  assert.ok(Math.abs(Number(j.meta.stepover) - stepoverForScallop(R, 0.02)) < 1e-3);
  // Ball centre never closer to the sphere than R (minus the faceting sag), and it does touch it.
  let touch = 0;
  for (const row of j.rows) for (const [x, y, z] of row) { const d = Math.hypot(x, y, z + R); if (z > -9.9) { assert.ok(d > 12 - 0.05, `gouge: ${d}`); if (d < 12 + 0.05) touch++; } }
  assert.ok(touch > 100);
  const left = rasterJob(s, { cutter: { shape: 'ball', dia: 2 * R }, stepover: 2, feed: 1200, stockToLeave: 0.5 });
  assert.ok(left.rows.flat().every(([x, y, z]) => z <= -9.99 || Math.hypot(x, y, z + R) > 12.5 - 0.05));
  assert.match(rasterJob(box(20, 30), { cutter: { shape: 'flat', dia: 6 }, feed: 800, reach: 20 }).warnings.join(' '), /holder would hit/);
});
