// CAD Phase 0: readers, writers, print checks, licence rules.
//   npm run test:cad
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
import * as WebIFC from 'web-ifc';
import { parseDxf, writeDxf, flatten2D, drawingToSvg, aciToHex, hexToAci, cleanMText } from '../services/cad/dxf';
import { parseStl, parse3mf, parseObj, modelStats, meshStats, weld } from '../services/cad/mesh';
import { importCadFile, detectCadFormat } from '../services/cad/importer';
import { CAD_ENGINES, licenceViolation } from '../services/cad/licences';
import { toModelJson } from '../services/cad/model';

const require = createRequire(import.meta.url);
const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/cad/${n}`, import.meta.url)));
const engines = {
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

test('DWG is recognised and explained, not faked', async () => {
  const m = await importCadFile('old.dwg', strToU8('AC1027' + '\0'.repeat(100)));
  assert.equal(m.format, 'dwg'); assert.equal(m.meta.version, 'AC1027'); assert.match(m.warnings[0], /DXF/); assert.equal(m.entities.length, 0);
});
