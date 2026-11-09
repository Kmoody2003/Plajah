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
