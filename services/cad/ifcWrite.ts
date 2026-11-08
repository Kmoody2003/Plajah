// Our own IFC4 writer (ISO 16739-1, STEP physical file). From the 2D BIM drawing it writes:
//   IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey
//   IfcWall        swept solid of the wall's true (mitred) plan shape, extruded to its height
//   IfcOpeningElement + IfcRelVoidsElement   one per hosted door/window, cutting the wall
//   IfcDoor / IfcWindow + IfcRelFillsElement  filling each opening, with mark, size, operation
//   IfcSpace       each room: net floor polygon, number and name, Qto_SpaceBaseQuantities
//   IfcSlab        a floor slab under each room
// Lengths are written in millimetres, areas in square metres. No outside library: this is part of
// the Plajah BIM stack. Tests read the output back with web-ifc to prove other tools accept it.

import type { CadModel } from './model';
import { MM_PER_UNIT } from './model';
import { findJoins, wallFaces, stationOf, type Wall } from './walls';
import { detectRooms } from './rooms';
import { collectOpenings } from './schedules';
import { BIM_DEFAULTS, type BimDefaults } from './bim3d';

type P = [number, number];

// ── STEP encoding ───────────────────────────────────────────────────────────

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** IFC GlobalId: 128 random bits in IFC's 22-character base-64. */
export function ifcGuid(rand: () => number = Math.random): string {
  let n = 0n; for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(Math.floor(rand() * 256) & 255);
  let s = GUID_CHARS[Number((n >> 126n) & 3n)];
  for (let i = 20; i >= 0; i--) s += GUID_CHARS[Number((n >> BigInt(6 * i)) & 63n)];
  return s;
}

/** IFC REAL: always with a decimal point, exponent as E. */
export function real(x: number): string {
  if (!Number.isFinite(x)) x = 0;
  const v = Math.abs(x) < 1e-9 ? 0 : +x.toFixed(6);
  let s = String(v); if (s.includes('e')) s = v.toExponential(6).replace('e', 'E');
  if (!s.includes('.')) s = s.includes('E') ? s.replace('E', '.E') : s + '.';
  return s;
}

/** IFC STRING: quotes doubled, backslashes escaped, anything outside printable ASCII as \X2\hhhh\X0\. */
export function str(s: string | undefined | null): string {
  if (s === undefined || s === null) return '$';
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "'") out += "''"; else if (ch === '\\') out += '\\\\';
    else if (c >= 32 && c <= 126) out += ch;
    else { const hex = c > 0xffff ? `\\X4\\${c.toString(16).toUpperCase().padStart(8, '0')}\\X0\\` : `\\X2\\${c.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`; out += hex; }
  }
  return `'${out}'`;
}

class Step {
  lines: string[] = []; private n = 0;
  add(e: string): string { this.n++; this.lines.push(`#${this.n}=${e};`); return `#${this.n}`; }
}

export interface IfcWriteOptions { projectName?: string; siteName?: string; buildingName?: string; storeyName?: string; author?: string; timestamp?: string; rand?: () => number; defaults?: BimDefaults }

export function writeIfc(m: CadModel, o: IfcWriteOptions = {}): string {
  const d = o.defaults ?? BIM_DEFAULTS; const rand = o.rand ?? Math.random; const G = () => str(ifcGuid(rand));
  const upm = 1 / MM_PER_UNIT[m.units]; const mm = (v: number) => v / upm; // drawing units -> mm
  const s = new Step();
  const pt3 = (x: number, y: number, z: number) => s.add(`IFCCARTESIANPOINT((${real(x)},${real(y)},${real(z)}))`);
  const pt2 = (x: number, y: number) => s.add(`IFCCARTESIANPOINT((${real(x)},${real(y)}))`);
  const dir3 = (x: number, y: number, z: number) => s.add(`IFCDIRECTION((${real(x)},${real(y)},${real(z)}))`);
  const zUp = dir3(0, 0, 1), xDir = dir3(1, 0, 0);
  const ax3 = (x = 0, y = 0, z = 0, refX = 1, refY = 0) => s.add(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},${zUp},${refX === 1 && refY === 0 ? xDir : dir3(refX, refY, 0)})`);
  const place = (rel: string | null, axis: string) => s.add(`IFCLOCALPLACEMENT(${rel ?? '$'},${axis})`);

  // Units and contexts.
  const lenU = s.add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), areaU = s.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), volU = s.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), angU = s.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const units = s.add(`IFCUNITASSIGNMENT((${lenU},${areaU},${volU},${angU}))`);
  const ctx = s.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ax3()},$)`);
  const body = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const project = s.add(`IFCPROJECT(${G()},$,${str(o.projectName ?? m.name.replace(/\.[^.]+$/, ''))},$,$,$,$,(${ctx}),${units})`);
  const sitePl = place(null, ax3()); const site = s.add(`IFCSITE(${G()},$,${str(o.siteName ?? 'Site')},$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = place(sitePl, ax3()); const building = s.add(`IFCBUILDING(${G()},$,${str(o.buildingName ?? 'Building')},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  const stPl = place(bldPl, ax3()); const storey = s.add(`IFCBUILDINGSTOREY(${G()},$,${str(o.storeyName ?? 'Level 1')},$,$,${stPl},$,$,.ELEMENT.,0.)`);
  s.add(`IFCRELAGGREGATES(${G()},$,$,$,${project},(${site}))`);
  s.add(`IFCRELAGGREGATES(${G()},$,$,$,${site},(${building}))`);
  s.add(`IFCRELAGGREGATES(${G()},$,$,$,${building},(${storey}))`);

  const shape = (items: string[], type = 'SweptSolid') => s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${s.add(`IFCSHAPEREPRESENTATION(${body},'Body',${str(type)},(${items.join(',')}))`)}))`);
  const extrude = (profile: string, depth: number, z = 0) => s.add(`IFCEXTRUDEDAREASOLID(${profile},${ax3(0, 0, z)},${zUp},${real(depth)})`);
  const polyProfile = (pts: P[]) => { const ids = [...pts, pts[0]].map(p => pt2(p[0], p[1])); return s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${s.add(`IFCPOLYLINE((${ids.join(',')}))`)})`); };
  const rectProfile = (cx: number, cy: number, xd: number, yd: number) => s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${s.add(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`)},${real(xd)},${real(yd)})`);

  const contained: string[] = [];
  const walls = m.entities.filter((e): e is Wall => e.type === 'wall'); const joins = findJoins(walls);
  const marks = new Map(collectOpenings(m).filter(x => x.opening).map(x => [x.opening!.id, x.mark]));

  walls.forEach((w, wi) => {
    const a: P = [w.a[0], w.a[1]]; const L = stationOf(w, [w.b[0], w.b[1]]).s; if (L <= 0) return;
    const u: P = [(w.b[0] - a[0]) / L, (w.b[1] - a[1]) / L]; const n: P = [-u[1], u[0]];
    const loc = (p: P): P => [mm((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]), mm((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1])];
    const f = wallFaces(w, joins.get(w) ?? []);
    const plan = [f.right[0], f.right[1], f.left[1], f.left[0]].map(loc);
    const wPl = place(stPl, ax3(mm(a[0]), mm(a[1]), 0, u[0], u[1]));
    const wall = s.add(`IFCWALL(${G()},$,${str(`Wall ${wi + 1}`)},$,$,${wPl},${shape([extrude(polyProfile(plan), mm(w.height))])},$,.STANDARD.)`);
    contained.push(wall);
    const thickMm = mm(w.thickness);
    s.add(`IFCRELDEFINESBYPROPERTIES(${G()},$,$,$,(${wall}),${s.add(`IFCELEMENTQUANTITY(${G()},$,'Qto_WallBaseQuantities',$,$,(${s.add(`IFCQUANTITYLENGTH('Length',$,$,${real(mm(L))},$)`)},${s.add(`IFCQUANTITYLENGTH('Width',$,$,${real(thickMm)},$)`)},${s.add(`IFCQUANTITYLENGTH('Height',$,$,${real(mm(w.height))},$)`)}))`)})`);

    for (const op of w.openings) {
      if (op.kind === 'opening' && !op.width) continue;
      const head = op.head !== undefined ? mm(op.head) : op.kind === 'window' ? Number(op.params?.head ?? d.windowHeadMm) : Number(op.params?.height ?? d.doorHeadMm);
      const sill = op.kind === 'window' ? (op.sill !== undefined ? mm(op.sill) : Number(op.params?.sill ?? d.windowSillMm)) : 0;
      const width = mm(op.width), at = mm(op.at);
      // Opening: a box through the full thickness (plus a margin), from sill to head, in the wall's frame.
      const oPl = place(wPl, ax3(at, 0, sill));
      const opening = s.add(`IFCOPENINGELEMENT(${G()},$,'Opening',$,$,${oPl},${shape([extrude(rectProfile(width / 2, 0, width, thickMm + 20), head - sill)])},$,.OPENING.)`);
      s.add(`IFCRELVOIDSELEMENT(${G()},$,$,$,${wall},${opening})`);
      if (op.kind === 'opening') continue;
      const mark = marks.get(op.id) ?? '';
      const fPl = place(oPl, ax3());
      if (op.kind === 'door') {
        const operation = op.item === 'door-double' ? 'DOUBLE_DOOR_SINGLE_SWING' : op.item === 'door-sliding' ? 'DOUBLE_DOOR_SLIDING' : op.item === 'door-pocket' ? 'SLIDING_TO_LEFT' : op.item === 'door-bifold' ? 'FOLDING_TO_LEFT' : op.item === 'door-overhead' ? 'ROLLINGUP' : op.item === 'opening' ? 'NOTDEFINED' : op.params?.hand === 'right' ? 'SINGLE_SWING_RIGHT' : 'SINGLE_SWING_LEFT';
        const door = s.add(`IFCDOOR(${G()},$,${str(mark || 'Door')},$,$,${fPl},${shape([extrude(rectProfile(width / 2, 0, width, 40), head)])},${str(mark || null)},${real(head)},${real(width)},.DOOR.,.${operation}.,$)`);
        s.add(`IFCRELFILLSELEMENT(${G()},$,$,$,${opening},${door})`); contained.push(door);
      } else {
        const win = s.add(`IFCWINDOW(${G()},$,${str(mark || 'Window')},$,$,${fPl},${shape([extrude(rectProfile(width / 2, 0, width, 12), head - sill)])},${str(mark || null)},${real(head - sill)},${real(width)},.WINDOW.,.SINGLE_PANEL.,$)`);
        s.add(`IFCRELFILLSELEMENT(${G()},$,$,$,${opening},${win})`); contained.push(win);
      }
    }
  });

  // Rooms: spaces (aggregated by the storey) and floor slabs (contained in it).
  const spaces: string[] = [];
  const minH = walls.length ? Math.min(...walls.map(w => mm(w.height))) : 2700;
  for (const r of detectRooms(m.entities)) {
    const poly = r.net.map(p => [mm(p[0]), mm(p[1])] as P);
    const sPl = place(stPl, ax3());
    const space = s.add(`IFCSPACE(${G()},$,${str(r.number ?? r.id)},$,$,${sPl},${shape([extrude(polyProfile(poly), minH)])},${str(r.name ?? null)},.ELEMENT.,.INTERNAL.,$)`);
    spaces.push(space);
    const areaM2 = r.area / (upm * upm) / 1e6, perMm = mm(r.perimeter);
    const q = s.add(`IFCELEMENTQUANTITY(${G()},$,'Qto_SpaceBaseQuantities',$,$,(${s.add(`IFCQUANTITYAREA('NetFloorArea',$,$,${real(areaM2)},$)`)},${s.add(`IFCQUANTITYLENGTH('NetPerimeter',$,$,${real(perMm)},$)`)},${s.add(`IFCQUANTITYLENGTH('Height',$,$,${real(minH)},$)`)}))`);
    s.add(`IFCRELDEFINESBYPROPERTIES(${G()},$,$,$,(${space}),${q})`);
    const slab = s.add(`IFCSLAB(${G()},$,${str(`Floor ${r.number ?? ''} ${r.name ?? ''}`.trim())},$,$,${place(stPl, ax3())},${shape([extrude(polyProfile(poly), d.slabMm, -d.slabMm)])},$,.FLOOR.)`);
    contained.push(slab);
  }
  if (spaces.length) s.add(`IFCRELAGGREGATES(${G()},$,$,$,${storey},(${spaces.join(',')}))`);
  if (contained.length) s.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G()},$,$,$,(${contained.join(',')}),${storey})`);

  const stamp = o.timestamp ?? new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(m.name.replace(/\.[^.]+$/, '') + '.ifc')},${str(stamp)},(${str(o.author ?? '')}),(''),'Plajah BIM','Plajah','');`,
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...s.lines, 'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
}
