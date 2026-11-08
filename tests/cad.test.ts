// CAD Phase 0: readers, writers, print checks, licence rules.
//   npm run test:cad
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
import * as WebIFC from 'web-ifc';
import { parseDxf, writeDxf, flatten2D, drawingToSvg, aciToHex, hexToAci, cleanMText } from '../services/cad/dxf';
import { parseStl, parse3mf, parseObj, modelStats, meshStats, weld } from '../services/cad/mesh';
import { importCadFile, detectCadFormat } from '../services/cad/importer';
import { CAD_ENGINES, licenceViolation } from '../services/cad/licences';
import { toModelJson } from '../services/cad/model';
import { LIBRARY, CATEGORIES, itemById, defaultParams, blockName, makeBlock, ensureBlockAndLayer, userBlocks } from '../services/cad/library';
import { transformEntity, transformEntities, rotateAbout, scaleAbout, mirrorAcross, offsetEntity, insertBlock } from '../services/cad/draft';
import { paths2DBounds } from '../services/cad/dxf';
import { addOpening, wallAt } from '../services/cad/walls';
import { detectRooms, formatArea } from '../services/cad/rooms';
import { doorSchedule, windowSchedule, roomSchedule, wallSummary, toCsv, formatLength, parseLibraryBlock } from '../services/cad/schedules';
import { runChecks, RULES, inscribedRadius } from '../services/cad/codeCheck';
import { bimTo3D, earcut } from '../services/cad/bim3d';
import { writeIfc, ifcGuid, real, str } from '../services/cad/ifcWrite';
import { hatchStrokes } from '../services/cad/hatchPatterns';
import { wallsFrom, trimEntity, extendEntity, filletEntities, boundaryAt, translateEntity } from '../services/cad/draft';
import { newDrawing, addEntities, buildGeom, findSnap, DEFAULT_SNAPS, applyOrtho, pick, boxSelect, parsePointInput, COMMAND_ALIASES, moveEntities, eraseEntities, setLayer, measureEntity, arcFrom, drawingScale } from '../services/cad/draft';

const require = createRequire(import.meta.url);
const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/cad/${n}`, import.meta.url)));
// DWG goes through the cad-dwg tool (ACadSharp). Build it with `npm run build:cad-dwg`.
const CAD_DWG = new URL('../windows-native/tools/CadDwg/bin/Release/net8.0/cad-dwg.dll', import.meta.url);
const dwgEngine = async (bytes: Uint8Array) => {
  const dir = mkdtempSync(join(tmpdir(), 'cad-dwg-')); const inp = join(dir, 'in.dwg'); const out = join(dir, 'out.dxf');
  (await import('node:fs')).writeFileSync(inp, bytes);
  try { execFileSync('dotnet', [CAD_DWG.pathname.replace(/^\/([A-Za-z]:)/, '$1'), inp, out], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e: any) { return { success: false, error: String(e.stderr || e.message) }; }
  return { success: true, dxf: new Uint8Array(readFileSync(out)) };
};
const engines = {
  dwg: dwgEngine,
  occt: async () => require('occt-import-js')(),
  ifc: async () => { const api = new WebIFC.IfcAPI(); await api.Init(); return api; },
};

// A 10 x 20 x 30 box as a binary STL triangle soup.
function boxStl(sx = 10, sy = 20, sz = 30): Uint8Array {
  const v = [[0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0], [0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buf = new ArrayBuffer(84 + f.length * 50); const dv = new DataView(buf); dv.setUint32(80, f.length, true);
  f.forEach((tri, t) => tri.forEach((vi, k) => v[vi].forEach((c, j) => dv.setFloat32(84 + t * 50 + 12 + k * 12 + j * 4, c, true))));
  return new Uint8Array(buf);
}

test('licence rules hold for every engine', () => {
  for (const e of CAD_ENGINES) assert.equal(licenceViolation(e), null, e.id);
  assert.match(licenceViolation({ ...CAD_ENGINES.find(e => e.id === 'web-ifc')!, linkage: 'linked' })!, /separate module/);
  assert.match(licenceViolation({ ...CAD_ENGINES.find(e => e.id === 'calculix')!, runs: ['browser'] })!, /web bundle/);
  assert.match(licenceViolation({ ...CAD_ENGINES.find(e => e.id === 'prusa-orca-cura')!, runs: ['server'] })!, /off our servers/);
});

test('format detection uses magic bytes before extensions', () => {
  assert.equal(detectCadFormat('x.bin', strToU8('AC1032 junk')), 'dwg');
  assert.equal(detectCadFormat('x.stp', fixture('example.ifc')), 'ifc');
  assert.equal(detectCadFormat('x.ifc', fixture('cube.stp')), 'step');
  assert.equal(detectCadFormat('noext', fixture('plan.dxf')), 'dxf');
  assert.equal(detectCadFormat('a.3MF', new Uint8Array([0x50, 0x4b, 3, 4])), '3mf');
});

test('ACI colours round trip for the base palette', () => {
  for (let i = 1; i <= 9; i++) assert.equal(hexToAci(aciToHex(i)), i);
  assert.equal(aciToHex(10), '#ff0000');
  assert.equal(cleanMText('{\\fArial|b1;BED}\\P3.0 x 3.5 m'), 'BED\n3.0 x 3.5 m');
});

test('DXF plan: layers, units, entities, blocks, warnings', () => {
  const m = parseDxf(fixture('plan.dxf'), 'plan.dxf');
  assert.equal(m.units, 'mm'); assert.equal(m.meta.version, 'AC1015'); assert.ok(m.is2D);
  assert.deepEqual(m.layers.map(l => l.name), ['0', 'A-WALL', 'A-DOOR', 'A-ANNO', 'A-HATCH']);
  assert.equal(m.layers[1].color, '#ff0000');
  const types = m.entities.map(e => e.type).sort();
  assert.deepEqual(types, ['circle', 'ellipse', 'hatch', 'insert', 'insert', 'line', 'polyline', 'polyline', 'spline', 'text', 'text'].sort());
  assert.equal(m.blocks.length, 1); assert.equal(m.blocks[0].entities.length, 2);
  assert.deepEqual(m.warnings, ['1 WIPEOUT not drawn yet']);
  // Bounds: walls 0..8000 x 0..6000, bay window bulges outward above y=6000.
  assert.equal(m.bounds.min[0], 0); assert.equal(m.bounds.max[0], 8000);
  assert.ok(m.bounds.max[1] > 6000 && m.bounds.max[1] < 6600, `bay top ${m.bounds.max[1]}`);
  const mtext = m.entities.find(e => e.type === 'text' && e.text.startsWith('BED'));
  assert.ok(mtext);
});

test('DXF blocks expand with rotation; hidden layers drop out', () => {
  const m = parseDxf(fixture('plan.dxf'));
  const doors = flatten2D(m).paths.filter(p => p.layer === 'A-DOOR');
  assert.equal(doors.length, 4); // 2 inserts x (leaf + swing)
  const rotatedLeaf = doors[2]; // insert at (5000,3000) rotated 90: leaf runs from (5000,3000) to (4100,3000)
  assert.ok(Math.abs(rotatedLeaf.pts[1][0] - 4100) < 1e-6 && Math.abs(rotatedLeaf.pts[1][1] - 3000) < 1e-6, JSON.stringify(rotatedLeaf.pts));
  assert.equal(doors[0].color, '#00ff00'); // entities on layer 0 inside a block take the insert's layer colour
  const hidden = flatten2D(m, { hiddenLayers: new Set(['A-DOOR', 'A-ANNO']) });
  assert.ok(!hidden.paths.some(p => p.layer === 'A-DOOR')); assert.equal(hidden.texts.length, 0);
});

test('DXF writes R12 that reads back the same drawing', () => {
  const a = parseDxf(fixture('plan.dxf'));
  const text = writeDxf(a);
  assert.match(text, /AC1009/);
  const b = parseDxf(text);
  assert.equal(b.units, 'mm');
  assert.deepEqual(b.layers.map(l => [l.name, l.color]), a.layers.map(l => [l.name, l.color]));
  for (let i = 0; i < 3; i++) { assert.ok(Math.abs(a.bounds.min[i] - b.bounds.min[i]) < 1e-6); assert.ok(Math.abs(a.bounds.max[i] - b.bounds.max[i]) < 1e-6); }
  assert.equal(b.warnings.length, 0);
  assert.equal(flatten2D(b).texts.length, flatten2D(a).texts.length);
});

test('DXF plots to SVG', () => {
  const svg = drawingToSvg(parseDxf(fixture('plan.dxf')), { width: 800 });
  assert.match(svg, /^<svg /); assert.match(svg, /LIVING/); assert.match(svg, /stroke="#ff0000"/);
  assert.ok(!svg.includes('NaN'));
});

test('STL: binary box welds to 8 vertices, closed, exact volume', () => {
  const m = parseStl(boxStl(), 'box.stl');
  assert.equal(m.meshes[0].positions.length / 3, 8);
  const s = modelStats(m);
  assert.equal(s.triangles, 12); assert.ok(s.watertight); assert.ok(Math.abs(s.volume - 6000) < 1e-6); assert.ok(Math.abs(s.area - 2200) < 1e-6);
  assert.deepEqual(m.bounds, { min: [0, 0, 0], max: [10, 20, 30] });
});

test('STL: ASCII and an open mesh are reported honestly', () => {
  const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
  const m = parseStl(strToU8(ascii), 't.stl');
  const s = modelStats(m); assert.equal(s.triangles, 1); assert.equal(s.watertight, false); assert.equal(s.openEdges, 3);
  assert.equal(parseStl(strToU8('solid nothing\nendsolid'), 'e.stl').warnings.length, 1);
});

test('OBJ: groups become parts, quads split, negative indices work', () => {
  const m = parseObj('o A\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\no B\nv 0 0 1\nv 1 0 1\nv 0 1 1\nf -3 -2 -1\n');
  assert.deepEqual(m.meshes.map(x => [x.name, x.indices.length / 3]), [['A', 2], ['B', 1]]);
  assert.equal(m.elements.length, 2);
});

test('3MF: units, colours, components and build transforms', () => {
  const model = `<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">Bracket</metadata><resources>
  <basematerials id="1"><base name="Red PLA" displaycolor="#FF2020FF"/></basematerials>
  <object id="2" name="Plate" pid="1" pindex="0"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices>
  <triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh></object>
  <object id="3" name="Pair"><components><component objectid="2"/><component objectid="2" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>
  </resources><build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 0 0 2"/></build></model>`;
  const zip = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), '3D/3dmodel.model': strToU8(model), 'Metadata/Slic3r_PE.config': strToU8('; settings') });
  const m = parse3mf(zip, 'bracket.3mf');
  assert.equal(m.units, 'in'); assert.equal(m.meta.Title, 'Bracket'); assert.match(m.meta.printSettings, /Slic3r/);
  assert.equal(m.meshes.length, 2); assert.equal(m.meshes[0].color, '#FF2020');
  assert.deepEqual(m.bounds, { min: [0, 0, 2], max: [6, 1, 3] });
  assert.deepEqual(m.elements.map(e => e.cls), ['Assembly', 'Object', 'Object']);
  const s = modelStats(m); assert.ok(s.watertight); assert.ok(Math.abs(s.volume - 2 / 6) < 1e-6);
});

test('weld + meshStats agree on a tetrahedron', () => {
  const { positions, indices } = weld([0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
  const s = meshStats(positions, indices); assert.equal(s.vertices, 4); assert.ok(s.watertight); assert.ok(Math.abs(s.volume - 1 / 6) < 1e-9);
});

test('STEP through OpenCASCADE: a 300 mm cube', async () => {
  const m = await importCadFile('cube.stp', fixture('cube.stp'), engines);
  assert.equal(m.engine, 'occt-import-js'); assert.equal(m.units, 'mm');
  const s = modelStats(m); assert.equal(s.triangles, 12); assert.ok(s.watertight); assert.ok(Math.abs(s.volume - 27e6) < 1);
  assert.deepEqual(m.elements.find(e => e.cls === 'Part')?.props, { Geometry: { 'B-rep faces': 6 } });
});

test('IFC through web-ifc: classes, storeys, property sets', async () => {
  const m = await importCadFile('example.ifc', fixture('example.ifc'), engines);
  assert.equal(m.engine, 'web-ifc'); assert.equal(m.meta.schema, 'IFC2X3');
  const count = (c: string) => m.elements.filter(e => e.cls === c).length;
  assert.equal(count('IfcWallStandardCase'), 17); assert.equal(count('IfcBeam'), 43); assert.equal(count('IfcColumn'), 42); assert.equal(count('IfcBuildingStorey'), 2);
  const slab = m.elements.find(e => e.cls === 'IfcSlab' && e.props.Pset_SlabCommon);
  assert.equal(slab?.props.Pset_SlabCommon.LoadBearing, true);
  const wall = m.elements.find(e => e.cls === 'IfcWallStandardCase')!;
  let p = m.elements.find(e => e.id === wall.parent); while (p && p.cls !== 'IfcBuildingStorey') p = m.elements.find(e => e.id === p!.parent);
  assert.ok(p, 'wall sits under a storey');
  const json = toModelJson(m); assert.equal(json.meshes.length, m.meshes.length); assert.ok(!('positions' in json.meshes[0]));
});

test('DWG through ACadSharp: 2004 and 2018 files read the same drawing', { skip: !existsSync(CAD_DWG) && 'run npm run build:cad-dwg first' }, async () => {
  const a = await importCadFile('s18.dwg', fixture('sample_AC1018.dwg'), engines);
  const b = await importCadFile('s32.dwg', fixture('sample_AC1032.dwg'), engines);
  for (const m of [a, b]) {
    assert.equal(m.format, 'dwg'); assert.equal(m.engine, 'acadsharp'); assert.equal(m.units, 'in'); assert.ok(m.is2D);
    assert.equal(m.blocks.length, 27);
    assert.ok(m.entities.filter(e => e.type === 'text').length >= 50);
    assert.ok(!m.warnings.some(w => /VIEWPORT|MULTILEADER|MLINE|MESH/.test(w)), m.warnings.join('; '));
    assert.ok(m.warnings.some(w => /3DSOLID \(ACIS solid\)/.test(w)));
  }
  assert.equal(a.meta.version, 'AC1018'); assert.equal(b.meta.version, 'AC1032');
  assert.deepEqual(a.bounds, b.bounds);
  assert.equal(flatten2D(a).paths.length, flatten2D(b).paths.length);
});

test('DWG without the converter is recognised and explained, not faked', async () => {
  const m = await importCadFile('old.dwg', strToU8('AC1027' + '\0'.repeat(100)));
  assert.equal(m.format, 'dwg'); assert.equal(m.meta.version, 'AC1027'); assert.match(m.warnings[0], /desktop app/); assert.equal(m.entities.length, 0);
});

// ── Drafting engine ─────────────────────────────────────────────────────────

test('drafting: snaps prefer endpoints, find intersections, perpendicular feet, grid', () => {
  let m = newDrawing('t.dxf');
  m = addEntities(m, [
    { type: 'line', layer: 'A-WALL', a: [0, 0, 0], b: [1000, 0, 0] },
    { type: 'line', layer: 'A-WALL', a: [500, -500, 0], b: [500, 500, 0] },
    { type: 'circle', layer: '0', c: [2000, 0, 0], r: 100 },
  ]);
  const g = buildGeom(m);
  assert.deepEqual(findSnap(g, [995, 3], 20, DEFAULT_SNAPS)?.kind, 'end');
  assert.deepEqual(findSnap(g, [995, 3], 20, DEFAULT_SNAPS)?.p, [1000, 0]);
  const x = findSnap(g, [504, 6], 20, DEFAULT_SNAPS)!; assert.equal(x.kind, 'intersection'); assert.deepEqual(x.p.map(Math.round), [500, 0]);
  assert.equal(findSnap(g, [250, 4], 20, DEFAULT_SNAPS), null); // nothing within 20 of the cursor at the quarter point
  assert.equal(findSnap(g, [2003, 2], 20, DEFAULT_SNAPS)?.kind, 'center');
  const perp = findSnap(g, [300, 8], 20, DEFAULT_SNAPS, [300, 400]); assert.equal(perp?.kind, 'perp'); assert.deepEqual(perp?.p, [300, 0]);
  const grid = findSnap(g, [1312, 760], 20, { ...DEFAULT_SNAPS, grid: true, gridSize: 100 }); assert.deepEqual(grid, null); // grid point (1300,800) is 41 away
  assert.deepEqual(findSnap(g, [1310, 790], 20, { ...DEFAULT_SNAPS, grid: true, gridSize: 100 })?.p, [1300, 800]);
  assert.deepEqual(applyOrtho([830, 40], [100, 0]), [830, 0]); assert.deepEqual(applyOrtho([130, 900], [100, 0]), [100, 900]);
});

test('drafting: pick nearest entity; window vs crossing selection', () => {
  let m = newDrawing();
  m = addEntities(m, [
    { type: 'polyline', layer: 'A-WALL', points: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]], closed: true },
    { type: 'line', layer: 'A-WALL', a: [2000, 0, 0], b: [3000, 0, 0] },
    { type: 'text', layer: 'A-ANNO-TEXT', at: [400, 400, 0], height: 100, rotation: 0, text: 'ROOM' },
  ]);
  const g = buildGeom(m);
  assert.equal(pick(g, [1003, 500], 10), 0); assert.equal(pick(g, [2500, 4], 10), 1); assert.equal(pick(g, [450, 440], 10), 2); assert.equal(pick(g, [1500, 500], 10), -1);
  assert.deepEqual(boxSelect(g, [-10, -10], [1100, 1100]).sort(), [0, 2]); // window: fully inside only
  assert.deepEqual(boxSelect(g, [2600, 100], [1500, -100]).sort(), [1]); // crossing from the right touches the line
  assert.deepEqual(boxSelect(g, [1100, 600], [900, 400]).sort(), [0]); // crossing a wall with no vertex inside
});

test('drafting: typed coordinates, polar and direct distance entry', () => {
  assert.deepEqual(parsePointInput('1200,300', null, null), [1200, 300]);
  assert.deepEqual(parsePointInput('@500,0', [100, 100], null), [600, 100]);
  const polar = parsePointInput('@1000<90', [0, 0], null)!; assert.ok(Math.abs(polar[0]) < 1e-9 && Math.abs(polar[1] - 1000) < 1e-9);
  assert.deepEqual(parsePointInput('2500', [0, 0], [10, 0]), [2500, 0]); // along the rubber band
  assert.equal(parsePointInput('@5,5', null, null), null); assert.equal(parsePointInput('hello', [0, 0], [1, 0]), null);
  assert.equal(COMMAND_ALIASES.L, 'line'); assert.equal(COMMAND_ALIASES.PL, 'polyline'); assert.equal(COMMAND_ALIASES.CO, 'copy');
});

test('drafting: move, copy, erase, layer change, measure, arcs', () => {
  let m = addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [3000, 4000, 0] }, { type: 'circle', layer: '0', c: [0, 0, 0], r: 1000 }]);
  const mv = moveEntities(m, [0], 100, 200); assert.deepEqual((mv.model.entities[0] as any).a, [100, 200, 0]); assert.deepEqual(mv.selection, [0]);
  const cp = moveEntities(m, [0, 1], 10, 0, true); assert.equal(cp.model.entities.length, 4); assert.deepEqual(cp.selection, [2, 3]); assert.deepEqual((cp.model.entities[3] as any).c, [10, 0, 0]);
  assert.equal(eraseEntities(cp.model, [0, 2]).entities.length, 2);
  assert.equal(setLayer(m, [1], 'A-WALL').entities[1].layer, 'A-WALL');
  assert.equal(measureEntity(m.entities[0]).length, 5000);
  assert.ok(Math.abs(measureEntity(m.entities[1]).area! - Math.PI * 1e6) < 1e-6);
  const room = measureEntity({ type: 'polyline', layer: '0', points: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]], closed: true });
  assert.equal(room.area, 12e6); assert.equal(room.length, 14000);
  const arc = arcFrom([0, 0], [1000, 0], [0, 1000], '0') as any; assert.equal(arc.r, 1000); assert.equal(arc.start, 0); assert.equal(arc.end, 90);
  assert.ok(Math.abs(measureEntity(arc).length! - Math.PI * 500) < 1e-9);
});

test('drafting: dimensions draw, measure, write to DXF and read back as lines and text', () => {
  let m = addEntities(newDrawing(), [{ type: 'dimension', layer: 'A-ANNO-DIMS', a: [0, 0, 0], b: [3600, 0, 0], at: [1800, 600, 0], height: 150, decimals: 0 }]);
  const f = flatten2D(m);
  assert.equal(f.texts.length, 1); assert.equal(f.texts[0].text, '3600'); assert.equal(f.texts[0].rotation, 0);
  assert.equal(f.paths.length, 5); // two extension lines, the dimension line, two ticks
  assert.ok(f.texts[0].at[1] > 600); // text sits above the dimension line
  const vertical = flatten2D(addEntities(newDrawing(), [{ type: 'dimension', layer: '0', a: [0, 2000, 0], b: [0, 0, 0], at: [-500, 1000, 0], height: 100, decimals: 1 }]));
  assert.equal(vertical.texts[0].text, '2000.0'); assert.equal(vertical.texts[0].rotation, 90); // reads upright from the right
  const back = parseDxf(writeDxf(m));
  assert.equal(back.entities.filter(e => e.type === 'line').length, 5); assert.equal((back.entities.find(e => e.type === 'text') as any).text, '3600');
  assert.equal(back.layers.find(l => l.name === 'A-ANNO-DIMS')?.color, '#ffff00');
});

test('drafting: a new drawing starts with the AEC layer set and sensible defaults', () => {
  const m = newDrawing('Plan.dxf', 'mm');
  assert.ok(m.is2D); assert.equal(m.units, 'mm'); assert.deepEqual(m.layers.map(l => l.name).slice(0, 3), ['0', 'A-WALL', 'A-DOOR']);
  const s = drawingScale(m); assert.equal(s.textHeight, 200); assert.equal(s.grid, 200);
});

// ── Architectural library + transforms ──────────────────────────────────────

test('library: every item builds clean geometry at its defaults, in every category', () => {
  assert.ok(LIBRARY.length >= 45, `${LIBRARY.length} items`);
  for (const cat of CATEGORIES) assert.ok(LIBRARY.some(i => i.category === cat), cat);
  for (const item of LIBRARY) {
    const ents = item.build(defaultParams(item)); assert.ok(ents.length > 0, item.id);
    const f = flatten2D({ entities: ents, blocks: [], layers: [{ name: '0', color: '#fff', visible: true }] });
    for (const p of f.paths) for (const [x, y] of p.pts) assert.ok(Number.isFinite(x) && Number.isFinite(y), `${item.id} has a bad point`);
    for (const t of f.texts) assert.ok(Number.isFinite(t.at[0]) && t.text.length > 0, item.id);
    assert.equal(new Set(LIBRARY.map(i => i.id)).size, LIBRARY.length);
  }
});

test('library: parameters drive the geometry (door width, stair run, ramp slope, ADA circle, bed sizes)', () => {
  const bounds = (id: string, p: Record<string, number | string | boolean> = {}) => { const it = itemById(id)!; return paths2DBounds(flatten2D({ entities: it.build({ ...defaultParams(it), ...p }), blocks: [], layers: [] })); };
  const d900 = bounds('door-single'), d800 = bounds('door-single', { width: 800 });
  assert.ok(Math.abs(d900.max[0] - 900) < 1e-6 && Math.abs(d800.max[0] - 800) < 1e-6);
  assert.ok(Math.abs(d900.max[1] - 900) < 1e-6, 'a 90-degree swing reaches the door width');
  assert.equal(bounds('stair-straight', { treads: 10, going: 300 }).max[1], 3000);
  assert.equal(bounds('ramp', { rise: 500 }).max[1], 6000); // 1:12
  const ada = bounds('ada-turning'); assert.ok(Math.abs(ada.max[0] - ada.min[0] - 1525) < 1e-6);
  const king = bounds('bed', { size: 'King' }); assert.equal(king.max[0], 1930); assert.equal(king.max[1], 2030);
});

test('library: blocks are named by their settings and scale into inch drawings', () => {
  const door = itemById('door-single')!;
  assert.equal(blockName(door, defaultParams(door)), blockName(door, { ...defaultParams(door) }));
  assert.notEqual(blockName(door, defaultParams(door)), blockName(door, { ...defaultParams(door), width: 800 }));
  const inch = makeBlock(door, defaultParams(door), 'in');
  const b = paths2DBounds(flatten2D({ entities: inch.entities, blocks: [], layers: [] })); assert.ok(Math.abs(b.max[0] - 900 / 25.4) < 1e-6);
  let m = ensureBlockAndLayer(newDrawing(), inch, 'A-DOOR'); m = ensureBlockAndLayer(m, inch, 'A-DOOR');
  assert.equal(m.blocks.length, 1); assert.equal(m.layers.filter(l => l.name === 'A-DOOR').length, 1);
  m = ensureBlockAndLayer(m, makeBlock(itemById('bed')!, {}, 'mm'), 'A-FURN'); assert.equal(m.layers.find(l => l.name === 'A-FURN')?.color, '#ff7f00');
  // Placed, rotated 90: the 900 opening now runs up the y axis.
  const placed = insertBlock(ensureBlockAndLayer(newDrawing(), makeBlock(door, defaultParams(door), 'mm'), 'A-DOOR'), blockName(door, defaultParams(door)), [1000, 1000], 90, false, 'A-DOOR');
  const pb = paths2DBounds(flatten2D(placed)); assert.ok(Math.abs(pb.max[1] - 1900) < 1e-6, String(pb.max[1]));
  assert.ok(flatten2D(placed).paths.every(p => p.layer === 'A-DOOR'), 'block contents take the insert layer');
  assert.deepEqual(userBlocks({ ...placed, blocks: [...placed.blocks, { name: '*D1', base: [0, 0, 0], entities: [] }] }).map(b2 => b2.name), [blockName(door, defaultParams(door))]);
});

test('transforms: rotate, scale, mirror every kind of entity consistently', () => {
  const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  const r = transformEntity({ type: 'line', layer: '0', a: [0, 0, 0], b: [1000, 0, 0] }, rotateAbout([0, 0], 90)) as any; assert.ok(near(r.b, [0, 1000, 0]));
  const sc = transformEntity({ type: 'circle', layer: '0', c: [100, 0, 0], r: 50 }, scaleAbout([0, 0], 2)) as any; assert.ok(near(sc.c, [200, 0, 0])); assert.equal(sc.r, 100);
  // Mirror an arc 0..90 across the y axis: it becomes 90..180.
  const ma = transformEntity({ type: 'arc', layer: '0', c: [0, 0, 0], r: 10, start: 0, end: 90 }, mirrorAcross([0, 0], [0, 1])) as any; assert.ok(Math.abs(ma.start - 90) < 1e-9 && Math.abs(ma.end - 180) < 1e-9, JSON.stringify(ma));
  // Mirrored text stays readable.
  const mt = transformEntity({ type: 'text', layer: '0', at: [100, 0, 0], height: 50, rotation: 0, text: 'A' }, mirrorAcross([0, 0], [0, 1])) as any; assert.ok(near(mt.at, [-100, 0, 0])); assert.equal(mt.rotation, 0);
  // A mirrored block reference draws exactly the mirror image of its contents.
  const door = itemById('door-single')!; const blk = makeBlock(door, defaultParams(door), 'mm');
  const m = ensureBlockAndLayer(newDrawing(), blk, 'A-DOOR');
  const ins: any = { type: 'insert', layer: 'A-DOOR', block: blk.name, at: [500, 200, 0], scale: [1, 1, 1], rotation: 30 };
  const M = mirrorAcross([0, 0], [1, 1]);
  const viaInsert = flatten2D({ ...m, entities: [transformEntity(ins, M)] }).paths.flatMap(p => p.pts);
  const direct = flatten2D({ ...m, entities: [ins] }).paths.flatMap(p => p.pts).map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
  viaInsert.forEach((p, i) => assert.ok(Math.abs(p[0] - direct[i][0]) < 1e-6 && Math.abs(p[1] - direct[i][1]) < 1e-6, `point ${i}`));
  const copy = transformEntities(addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [10, 0, 0] }]), [0], mirrorAcross([0, 5], [10, 5]), true);
  assert.equal(copy.model.entities.length, 2); assert.deepEqual(copy.selection, [1]);
});

test('offset: walls from a room outline, lines to the picked side, circles in and out', () => {
  const room: any = { type: 'polyline', layer: '0', points: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]], closed: true };
  const outside = offsetEntity(room, 200, [5000, 1500]) as any; assert.deepEqual(outside.points.map((p: number[]) => p.slice(0, 2)), [[-200, -200], [4200, -200], [4200, 3200], [-200, 3200]]);
  const inside = offsetEntity(room, 200, [2000, 1500]) as any; assert.deepEqual(inside.points.map((p: number[]) => p.slice(0, 2)), [[200, 200], [3800, 200], [3800, 2800], [200, 2800]]);
  const cw: any = { ...room, points: [...room.points].reverse() }; const insideCw = offsetEntity(cw, 200, [2000, 1500]) as any;
  assert.ok(insideCw.points.every((p: number[]) => p[0] >= 199.999 && p[0] <= 3800.001), 'orientation does not matter');
  const ln = offsetEntity({ type: 'line', layer: '0', a: [0, 0, 0], b: [1000, 0, 0] }, 150, [500, -900]) as any; assert.deepEqual(ln.a, [0, -150, 0]);
  const open = offsetEntity({ type: 'polyline', layer: '0', points: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], closed: false }, 100, [500, 500]) as any;
  assert.deepEqual(open.points.map((p: number[]) => p.slice(0, 2).map(Math.round)), [[0, 100], [900, 100], [900, 1000]]);
  assert.equal((offsetEntity({ type: 'circle', layer: '0', c: [0, 0, 0], r: 500 }, 100, [0, 900]) as any).r, 600);
  assert.equal(offsetEntity({ type: 'circle', layer: '0', c: [0, 0, 0], r: 50 }, 100, [0, 10]), null);
});

// ── Walls, hatching, trim / extend / fillet ─────────────────────────────────

const near2 = (a: number[], b: number[], tol = 1e-6) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;

test('walls: a closed room of four walls mitres every corner (no caps, faces meet)', () => {
  const walls = wallsFrom([[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 200, 2700, 'A-WALL', 1, true);
  assert.equal(walls.length, 4);
  const m = addEntities(newDrawing(), walls);
  const f = flatten2D(m);
  assert.equal(f.paths.length, 8, 'two faces per wall, no end caps');
  const pts = f.paths.flatMap(p => p.pts);
  for (const corner of [[-100, -100], [6100, -100], [6100, 4100], [-100, 4100], [100, 100], [5900, 100], [5900, 3900], [100, 3900]]) assert.ok(pts.some(p => near2(p, corner)), `corner ${corner}`);
  // A lone wall gets square end caps.
  assert.equal(flatten2D(addEntities(newDrawing(), wallsFrom([[0, 0], [3000, 0]], 200, 2700, 'A-WALL', 1))).paths.length, 4);
});

test('walls: a hosted door breaks both faces and draws its swing on the side it was placed', () => {
  const [w] = wallsFrom([[0, 0], [5000, 0]], 200, 2700, 'A-WALL', 1) as any[];
  const withDoor = addOpening(w, [2000, 300], { kind: 'door', width: 900, item: 'door-single', params: { hand: 'left', swing: 90 } })!;
  assert.ok(withDoor); assert.equal(withDoor.openings[0].at, 1550); assert.equal(withDoor.openings[0].flip, false);
  const f = flatten2D(addEntities(newDrawing(), [withDoor]));
  const wallLines = f.paths.filter(p => p.layer === 'A-WALL'); assert.equal(wallLines.length, 6, 'each face split in two, plus two caps');
  const door = f.paths.filter(p => p.layer === 'A-DOOR'); assert.ok(door.length >= 3, 'jambs, leaf and swing');
  const doorPts = door.flatMap(p => p.pts); assert.ok(Math.max(...doorPts.map(p => p[1])) > 900, 'swing goes up, toward the click');
  const other = addOpening(w, [2000, -300], { kind: 'door', width: 900, item: 'door-single' })!; assert.equal(other.openings[0].flip, true);
  const fo = flatten2D(addEntities(newDrawing(), [other])); assert.ok(Math.min(...fo.paths.filter(p => p.layer === 'A-DOOR').flatMap(p => p.pts).map(p => p[1])) < -900, 'swing goes down');
  assert.equal(addOpening(withDoor, [2300, 300], { kind: 'door', width: 900, item: 'door-single' }), null, 'openings may not overlap');
  assert.equal(addOpening(w, [100, 0], { kind: 'window', width: 6000 }), null, 'too wide for the wall');
  assert.equal(wallAt(addEntities(newDrawing(), [w]).entities, [2500, 90], 50)?.index, 0); assert.equal(wallAt([w], [2500, 400], 50), null);
});

test('walls: move, mirror and DXF export keep doors with their wall', () => {
  const [w] = wallsFrom([[0, 0], [5000, 0]], 200, 2700, 'A-WALL', 1) as any[];
  const wd = addOpening(w, [1000, 300], { kind: 'door', width: 900, item: 'door-single', params: { hand: 'left' } })!;
  const moved = translateEntity(wd, 0, 3000) as any; assert.deepEqual(moved.a, [0, 3000, 0]); assert.equal(moved.openings[0].at, 550);
  const mir = transformEntity(wd, mirrorAcross([0, 0], [1, 0])) as any; assert.equal(mir.openings[0].flip, true); assert.equal(mir.openings[0].params.hand, 'right');
  const fm = flatten2D(addEntities(newDrawing(), [mir])); assert.ok(Math.min(...fm.paths.filter(p => p.layer === 'A-DOOR').flatMap(p => p.pts).map(p => p[1])) < -800, 'mirrored across the wall line, the swing faces down');
  const dxf = writeDxf(addEntities(newDrawing(), wallsFrom([[0, 0], [4000, 0], [4000, 3000]], 200, 2700, 'A-WALL', 1)));
  const back = parseDxf(dxf); const lines = back.entities.filter(e => e.type === 'line');
  assert.equal(lines.length, 6, 'two walls: four faces and two caps'); assert.ok(lines.every(l => l.layer === 'A-WALL'));
});

test('hatching: patterns clip to the boundary, respect holes, and read from DXF', () => {
  const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const st = hatchStrokes([square], 'ANSI31', 2); // 6.35 apart
  assert.ok(st.length > 5 && st.every(s => [s.a, s.b].every(p => p[0] >= -1e-6 && p[0] <= 100 + 1e-6 && p[1] >= -1e-6 && p[1] <= 100 + 1e-6)));
  const hole: Array<[number, number]> = [[40, 40], [60, 40], [60, 60], [40, 60]];
  const withHole = hatchStrokes([square, hole], 'NET', 2);
  assert.ok(!withHole.some(s => { const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2; return mx > 41 && mx < 59 && my > 41 && my < 59; }), 'nothing inside the hole');
  assert.equal(hatchStrokes([square], 'SOLID').length, 0);
  assert.ok(hatchStrokes([[[0, 0], [2000, 0], [2000, 1000], [0, 1000]]], 'AR-BRSTD', 1).length > 20);
  const m = addEntities(newDrawing(), [{ type: 'hatch', layer: '0', loops: [square.map(([x, y]) => [x, y, 0] as [number, number, number])], pattern: 'ANSI31', solid: false, patternScale: 2, patternAngle: 0 }]);
  const back = parseDxf(writeDxf(m)); assert.ok(back.entities.filter(e => e.type === 'line').length > 5, 'pattern written as lines (R12 has no HATCH)');
  const bnd = boundaryAt(addEntities(newDrawing(), [{ type: 'polyline', layer: '0', points: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]], closed: true }, { type: 'circle', layer: '0', c: [500, 500, 0], r: 200 }]), [500, 500]);
  assert.ok(bnd && Math.abs(Math.hypot(bnd[0][0][0] - 500, bnd[0][0][1] - 500) - 200) < 1, 'the smallest boundary (the circle) wins');
  // DXF HATCH with pattern scale 41 and angle 52 after the style codes.
  const dxfText = ['0', 'SECTION', '2', 'ENTITIES', '0', 'HATCH', '8', '0', '2', 'ANSI31', '70', '0', '91', '1', '92', '2', '72', '0', '73', '1', '93', '4', '10', '0', '20', '0', '10', '100', '20', '0', '10', '100', '20', '100', '10', '0', '20', '100', '75', '1', '76', '1', '52', '30', '41', '5', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const h = parseDxf(dxfText).entities[0] as any; assert.equal(h.patternScale, 5); assert.equal(h.patternAngle, 30);
  assert.ok(flatten2D(parseDxf(dxfText)).paths.length > 3, 'imported hatch shows its pattern');
});

test('trim, extend, fillet', () => {
  // Trim the middle of a line crossed by two others.
  let m = addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [3000, 0, 0] }, { type: 'line', layer: '0', a: [1000, -500, 0], b: [1000, 500, 0] }, { type: 'line', layer: '0', a: [2000, -500, 0], b: [2000, 500, 0] }]);
  const t = trimEntity(m, 0, [1500, 0])!; const kept = t.entities.filter(e => e.type === 'line' && (e as any).a[1] === 0 && (e as any).b[1] === 0) as any[];
  assert.equal(kept.length, 2); assert.deepEqual(kept.map(k => [k.a[0], k.b[0]]).sort((x, y) => x[0] - y[0]), [[0, 1000], [2000, 3000]]);
  assert.equal(trimEntity(addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [10, 0, 0] }]), 0, [5, 0]), null, 'no cutting edges, nothing to trim');
  // Trim a circle crossed by a line into an arc.
  const c = trimEntity(addEntities(newDrawing(), [{ type: 'circle', layer: '0', c: [0, 0, 0], r: 100 }, { type: 'line', layer: '0', a: [-200, 0, 0], b: [200, 0, 0] }]), 0, [0, 100])!;
  const arc = c.entities.find(e => e.type === 'arc') as any; assert.ok(arc && Math.abs(arc.start - 180) < 1e-6 && Math.abs(arc.end) < 1e-6, JSON.stringify(arc));
  // Extend a line to a boundary.
  m = addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [500, 0, 0] }, { type: 'line', layer: '0', a: [2000, -500, 0], b: [2000, 500, 0] }]);
  assert.deepEqual((extendEntity(m, 0, [450, 0])!.entities[0] as any).b, [2000, 0, 0]);
  // Fillet r=0 makes a clean corner; r>0 adds a tangent arc.
  m = addEntities(newDrawing(), [{ type: 'line', layer: '0', a: [0, 0, 0], b: [1200, 0, 0] }, { type: 'line', layer: '0', a: [1000, -300, 0], b: [1000, 1000, 0] }]);
  const f0 = filletEntities(m, 0, [200, 0], 1, [1000, 800], 0)!; assert.deepEqual((f0.entities[0] as any).b, [1000, 0, 0]); assert.deepEqual((f0.entities[1] as any).a, [1000, 0, 0]);
  const f1 = filletEntities(m, 0, [200, 0], 1, [1000, 800], 100)!; const fa = f1.entities.find(e => e.type === 'arc') as any;
  assert.ok(fa && near2(fa.c, [900, 100]) && fa.r === 100, JSON.stringify(fa)); assert.ok(near2((f1.entities[0] as any).b, [900, 0])); assert.ok(near2((f1.entities[1] as any).a, [1000, 100]));
  // Fillet two walls at 0: centrelines meet, the corner mitres.
  const ws = addEntities(newDrawing(), [...wallsFrom([[0, 0], [3000, 0]], 200, 2700, 'A-WALL', 1), ...wallsFrom([[3500, 500], [3500, 3000]], 200, 2700, 'A-WALL', 1)]);
  const fw = filletEntities(ws, 0, [1000, 0], 1, [3500, 2000], 0)!;
  assert.deepEqual((fw.entities[0] as any).b, [3500, 0, 0]); assert.deepEqual((fw.entities[1] as any).a, [3500, 0, 0]);
  assert.equal(flatten2D(fw).paths.length, 6, 'joined corner: four faces plus the two free end caps');
});

// ── Rooms, schedules, code checks ───────────────────────────────────────────

const roomTag = (x: number, y: number, name: string, number: string): any => ({ type: 'room', layer: 'A-ANNO-TEXT', at: [x, y, 0], name, number, height: 200, unitsPerMm: 1 });

test('rooms: found from walls (T-junctions split them), net area inside the faces, named by tags', () => {
  // 6 x 4 m outline with a dividing wall at x = 4000 ending on the outline (two T-junctions).
  let m = addEntities(newDrawing(), [...wallsFrom([[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 200, 2700, 'A-WALL', 1, true), ...wallsFrom([[4000, 0], [4000, 4000]], 100, 2700, 'A-WALL', 1)]);
  m = addEntities(m, [roomTag(2000, 2000, 'Living', '101'), roomTag(5000, 2000, 'Bath', '102')]);
  const rooms = detectRooms(m.entities); assert.equal(rooms.length, 2);
  const living = rooms.find(r => r.name === 'Living')!, bath = rooms.find(r => r.name === 'Bath')!;
  assert.ok(Math.abs(living.area - (4000 - 100 - 50) * 3800) < 1, String(living.area)); // 3850 x 3800
  assert.ok(Math.abs(bath.area - (2000 - 100 - 50) * 3800) < 1, String(bath.area));      // 1850 x 3800
  assert.equal(rooms[0].number, '101'); // ordered by number
  assert.equal(formatArea(living.area, 1), '14.63 m²');
  const texts = flatten2D(m).texts.map(t => t.text); assert.ok(texts.includes('Living') && texts.includes('14.63 m²') && texts.includes('102'));
  assert.equal(detectRooms(addEntities(newDrawing(), wallsFrom([[0, 0], [3000, 0], [3000, 3000]], 200, 2700, 'A-WALL', 1)).entities).length, 0, 'an open run encloses nothing');
});

test('schedules: doors and windows with marks, rooms with totals, walls by thickness, CSV, imperial lengths', () => {
  const [south, east, north, west] = wallsFrom([[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 200, 2700, 'A-WALL', 1, true) as any[];
  const s2 = addOpening(south, [1500, 300], { kind: 'door', width: 900, item: 'door-single', params: { hand: 'left' } })!;
  const e2 = addOpening(east, [5800, 2000], { kind: 'window', width: 1800, item: 'window-fixed', params: {} })!;
  const m = addEntities(newDrawing(), [s2, e2, north, west, roomTag(3000, 2000, 'Studio', '201')]);
  const doors = doorSchedule(m); assert.deepEqual(doors.rows[0].slice(0, 6), ['D01', 'Single swing door', '900', '2100', 'left', '201 Studio']);
  const wins = windowSchedule(m); assert.deepEqual(wins.rows[0].slice(0, 4), ['W01', 'Window, fixed', '1800', '1200']);
  assert.equal(wins.rows[0][6], '201 Studio');
  const rooms = roomSchedule(m); assert.deepEqual(rooms.rows[0].slice(0, 3), ['201', 'Studio', '22.04 m²']); assert.equal(rooms.rows.at(-1)![1], 'Total');
  const walls = wallSummary(m); assert.deepEqual(walls.rows[0].slice(0, 3), ['200', '4', '20.00 m']);
  assert.match(toCsv(doors), /^Mark,Type,Width,Height,Hinge,Room,Wall,Placed\r\nD01,/);
  assert.equal(formatLength(914.4, true), `3'-0"`); assert.equal(formatLength(2133.6, true), `7'-0"`); assert.equal(formatLength(901, false), '901');
  const door = itemById('door-single')!; const lib = parseLibraryBlock(blockName(door, { ...defaultParams(door), width: 850 }))!;
  assert.equal(lib.item.id, 'door-single'); assert.equal(lib.params.width, 850); assert.equal(lib.params.hand, 'left');
  // Free library doors count too.
  const free = insertBlock(ensureBlockAndLayer(newDrawing(), makeBlock(door, defaultParams(door), 'mm'), 'A-DOOR'), blockName(door, defaultParams(door)), [0, 0], 0, false, 'A-DOOR');
  assert.equal(doorSchedule(free).rows[0][7], 'free block');
});

test('code checks: door width, latch clearance, toilet turning space, WC centreline, stair treads', () => {
  const byRule = (fs: ReturnType<typeof runChecks>, id: string) => fs.filter(f => f.rule === id);
  // A bath 1900 x 1500 (too small to turn), with a 750 door hard against the corner.
  const [s, e, n, w] = wallsFrom([[0, 0], [2000, 0], [2000, 1600], [0, 1600]], 100, 2700, 'A-WALL', 1, true) as any[];
  const narrowDoor = addOpening(s, [450, 200], { kind: 'door', width: 750, item: 'door-single', params: { hand: 'right' } })!; // latch toward x = 0
  let m = addEntities(newDrawing(), [narrowDoor, e, n, w, roomTag(1000, 800, 'Bath', '1')]);
  let f = runChecks(m);
  assert.equal(byRule(f, 'door-clear-width')[0].status, 'fail');
  assert.equal(byRule(f, 'door-latch-clearance')[0].status, 'fail', byRule(f, 'door-latch-clearance')[0].detail);
  assert.equal(byRule(f, 'turning-space')[0].status, 'fail');
  // Bigger room, wider door, latch with room to spare: all pass.
  const [s2, e2, n2, w2] = wallsFrom([[0, 0], [2600, 0], [2600, 2400], [0, 2400]], 100, 2700, 'A-WALL', 1, true) as any[];
  const goodDoor = addOpening(s2, [1600, 200], { kind: 'door', width: 900, item: 'door-single', params: { hand: 'left' } })!; // latch toward x = 2600, 500 to spare
  m = addEntities(newDrawing(), [goodDoor, e2, n2, w2, roomTag(1300, 1200, 'Accessible WC', '2')]);
  f = runChecks(m);
  assert.equal(byRule(f, 'door-clear-width')[0].status, 'pass'); assert.equal(byRule(f, 'door-latch-clearance')[0].status, 'pass', byRule(f, 'door-latch-clearance')[0].detail);
  assert.equal(byRule(f, 'turning-space')[0].status, 'pass');
  // Toilet against the north wall, centreline 450 from the west wall's inner face (x = 50).
  const wc = itemById('wc')!; const blk = makeBlock(wc, defaultParams(wc), 'mm');
  const withWc = insertBlock(ensureBlockAndLayer(m, blk, 'P-FIXT'), blk.name, [500, 2350], 180, false, 'P-FIXT');
  assert.equal(byRule(runChecks(withWc), 'wc-centerline')[0].status, 'pass', byRule(runChecks(withWc), 'wc-centerline')[0].detail);
  const tooClose = insertBlock(ensureBlockAndLayer(m, blk, 'P-FIXT'), blk.name, [350, 2350], 180, false, 'P-FIXT');
  assert.equal(byRule(runChecks(tooClose), 'wc-centerline')[0].status, 'fail');
  // Stairs.
  const stair = itemById('stair-straight')!; const steep = makeBlock(stair, { ...defaultParams(stair), going: 250 }, 'mm');
  const sm = insertBlock(ensureBlockAndLayer(newDrawing(), steep, 'A-FLOR'), steep.name, [0, 0], 0, false, 'A-FLOR');
  assert.equal(byRule(runChecks(sm), 'stair-tread')[0].status, 'fail');
  assert.ok(RULES.every(r => /2010 ADA Standards §\d/.test(r.citation)));
  assert.equal(inscribedRadius([[0, 0], [2000, 0], [2000, 1000], [0, 1000]]).r > 495, true);
});

// ── Plajah BIM: 3D from walls, and our own IFC4 checked by an independent reader ──

function bimPlan() {
  const [s, e, n, w] = wallsFrom([[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 200, 2700, 'A-WALL', 1, true) as any[];
  const s2 = addOpening(s, [1500, 300], { kind: 'door', width: 900, item: 'door-single', params: { hand: 'left' } })!;
  const e2 = addOpening(e, [5800, 2000], { kind: 'window', width: 1500, item: 'window-fixed', params: {} })!;
  const part = wallsFrom([[4400, 0], [4400, 4000]], 100, 2700, 'A-WALL', 1);
  return addEntities(newDrawing('House.dxf'), [s2, e2, n, w, ...part, roomTag(2000, 2000, 'Living', '101'), roomTag(5200, 2000, 'Bath', '102')]);
}

test('BIM 3D: walls rise in pieces around openings; doors, glazing and slabs are elements', () => {
  const m3 = bimTo3D(bimPlan());
  const count = (c: string) => m3.elements.filter(e => e.cls === c).length;
  assert.equal(count('IfcWall'), 5); assert.equal(count('IfcDoor'), 1); assert.equal(count('IfcWindow'), 1); assert.equal(count('IfcSlab'), 2);
  assert.equal(m3.meta.upAxis, 'Z');
  assert.ok(Math.abs(m3.bounds.max[2] - 2700) < 1e-6 && Math.abs(m3.bounds.min[2] + 200) < 1e-6, JSON.stringify(m3.bounds));
  // The south wall: left of the door, above the door (2100-2700), right of the door = 3 pieces.
  const south = m3.elements.find(e => e.cls === 'IfcWall' && e.name === 'Wall 1')!; assert.equal(south.meshIds.length, 3);
  // The east wall: below sill, above head, and the two full-height pieces = 4.
  const east = m3.elements.find(e => e.name === 'Wall 2')!; assert.equal(east.meshIds.length, 4);
  // No wall triangle inside the door opening below its head.
  const doorZone = (x: number, y: number, z: number) => x > 1050 + 1 && x < 1950 - 1 && Math.abs(y) < 99 && z < 2100 - 1;
  for (const id of south.meshIds) { const mesh = m3.meshes.find(x => x.id === id)!; for (let i = 0; i < mesh.positions.length; i += 3) assert.ok(!doorZone(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]), 'wall material inside the door opening'); }
  // Closed solids: every piece is watertight.
  for (const mesh of m3.meshes) { const st = meshStats(...(Object.values(weld(Array.from(mesh.indices).flatMap(k => [mesh.positions[k * 3], mesh.positions[k * 3 + 1], mesh.positions[k * 3 + 2]])))) as [Float32Array, Uint32Array]); assert.ok(st.watertight, `${mesh.name} is not closed`); }
  // Slab floor area matches the room schedule.
  assert.equal(earcut([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]]).length, 3);
});

test('IFC4 writer: valid STEP, unique GlobalIds, escaping', () => {
  assert.equal(ifcGuid().length, 22); assert.match(ifcGuid(), /^[0-3][0-9A-Za-z_$]{21}$/);
  assert.equal(real(1500), '1500.'); assert.equal(real(0.5), '0.5'); assert.equal(real(1e-12), '0.'); assert.equal(real(-2), '-2.');
  assert.equal(str("Kenne's Café"), "'Kenne''s Caf\\X2\\00E9\\X0\\'"); assert.equal(str(undefined), '$');
  const ifc = writeIfc(bimPlan(), { timestamp: '2026-11-08T12:00:00' });
  assert.match(ifc, /^ISO-10303-21;\nHEADER;/); assert.match(ifc, /FILE_SCHEMA\(\('IFC4'\)\);/); assert.match(ifc, /END-ISO-10303-21;\n$/);
  const guids = [...ifc.matchAll(/^#\d+=IFC[A-Z]+\('([0-9A-Za-z_$]{22})'/gm)].map(x => x[1]);
  assert.ok(guids.length > 20); assert.equal(new Set(guids).size, guids.length, 'GlobalIds are unique');
  const refs = new Set([...ifc.matchAll(/#(\d+)=/g)].map(x => x[1])); for (const r of ifc.matchAll(/[(,]#(\d+)/g)) assert.ok(refs.has(r[1]), `dangling #${r[1]}`);
});

test('IFC4 writer: web-ifc (an independent engine) reads our file with walls voided, doors, windows, spaces and quantities', async () => {
  const ifc = writeIfc(bimPlan(), { projectName: 'House' });
  const m = await importCadFile('House.ifc', new TextEncoder().encode(ifc), engines);
  assert.equal(m.meta.schema, 'IFC4'); assert.deepEqual(m.warnings, []);
  const count = (c: string) => m.elements.filter(e => e.cls === c).length;
  assert.equal(count('IfcWall'), 5); assert.equal(count('IfcDoor'), 1); assert.equal(count('IfcWindow'), 1); assert.equal(count('IfcSpace'), 2); assert.equal(count('IfcSlab'), 2);
  assert.ok(count('IfcBuildingStorey') === 1 && count('IfcBuilding') === 1 && count('IfcProject') === 1);
  // web-ifc works in metres: the building is 6.2 x 4.2 m (outer faces) and walls are 2.7 m tall.
  const walls = m.meshes.filter(x => x.layer === 'IfcWall'); assert.ok(walls.length >= 5);
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity; for (const w of walls) for (let i = 0; i < w.positions.length; i += 3) { minX = Math.min(minX, w.positions[i]); maxX = Math.max(maxX, w.positions[i]); maxY = Math.max(maxY, w.positions[i + 1]); }
  assert.ok(Math.abs(maxX - minX - 6.2) < 0.01, `width ${maxX - minX}`); assert.ok(Math.abs(maxY - 2.7) < 0.01, `height ${maxY}`);
  // The opening really cuts the wall: the south wall mesh (voided by web-ifc) has more than a plain box's 12 triangles.
  const south = m.elements.find(e => e.cls === 'IfcWall' && e.name === 'Wall 1')!; const tris = south.meshIds.reduce((s2, id) => s2 + m.meshes.find(x => x.id === id)!.indices.length / 3, 0);
  assert.ok(tris > 12, `${tris} triangles`);
  // Spaces carry their number, name and net area.
  const living = m.elements.find(e => e.cls === 'IfcSpace' && e.name === '101')!;
  assert.ok(Math.abs(Number(living.props.Qto_SpaceBaseQuantities.NetFloorArea) - 16.15) < 0.01, JSON.stringify(living.props)); // (4400 - 100 - 50) x (4000 - 200)
  const door = m.elements.find(e => e.cls === 'IfcDoor')!; assert.equal(door.name, 'D01');
});

// ---- Mechanical parts library (services/mech) ----
import { MECH_PARTS, mechModel, mechDefaults, spurGearOutline } from '../services/mech/parts';
import { writeStl } from '../services/mech/geometry';

/** Closed 2-manifold: after welding by position, every edge is used exactly twice, once each way. */
function watertight(positions: Float32Array, indices: Uint32Array | number[]): boolean {
  const key = (i: number) => `${positions[i * 3].toFixed(4)},${positions[i * 3 + 1].toFixed(4)},${positions[i * 3 + 2].toFixed(4)}`;
  const id = new Map<string, number>(); const v = (i: number) => { const k = key(i); let n = id.get(k); if (n === undefined) { n = id.size; id.set(k, n); } return n; };
  const edges = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = v(indices[t]), b = v(indices[t + 1]), c = v(indices[t + 2]); if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${p}>${q}`, (edges.get(`${p}>${q}`) ?? 0) + 1);
  }
  for (const [k, n] of edges) { const [p, q] = k.split('>'); if (n !== 1 || edges.get(`${q}>${p}`) !== 1) return false; }
  return edges.size > 0;
}

test('every standard mechanical part is a closed solid at its default size', () => {
  for (const p of MECH_PARTS) {
    const m = mechModel(p, mechDefaults(p)); assert.equal(m.units, 'mm'); assert.ok(m.meshes.length > 0, p.id);
    for (const mesh of m.meshes) assert.ok(watertight(mesh.positions, mesh.indices), `${p.id} is not watertight`);
  }
});

test('mechanical parts follow their published dimensions', () => {
  const gear = MECH_PARTS.find(p => p.id === 'spur-gear')!;
  const pts = spurGearOutline(1, 24, 20); const r = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(Math.abs(r - 13) < 0.05, `addendum radius ${r}`); // (z + 2)·m / 2
  const m = mechModel(gear, { ...mechDefaults(gear), m: 1, z: 24 }); const xs: number[] = [];
  for (const mesh of m.meshes) for (let i = 0; i < mesh.positions.length; i += 3) xs.push(mesh.positions[i]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 26) < 0.1);
  const stl = writeStl(m.meshes, 'gear'); const tris = m.meshes.reduce((s, x) => s + x.indices.length / 3, 0);
  assert.equal(stl.byteLength, 84 + 50 * tris);
});
