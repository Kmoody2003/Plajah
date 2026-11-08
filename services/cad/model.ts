// CAD model: the in-memory shape every importer produces and every view reads.
//
// Not a file format. A model is saved into a Tela document as two assets on a MEDIA device
// (see telaCad.ts): the semantic part (layers, 2D entities, elements and their properties)
// as JSON, and the triangles as a GLB whose node names are mesh ids. The original file is
// kept too, so nothing is lost when our reading of it is partial.

export type CadFormat = 'dxf' | 'dwg' | 'ifc' | 'step' | 'iges' | 'brep' | 'stl' | 'obj' | 'glb' | 'gltf' | '3mf';

/** Units of the model's own coordinates. `unitless` keeps numbers as drawn. */
export type CadUnit = 'unitless' | 'mm' | 'cm' | 'm' | 'in' | 'ft';

export const MM_PER_UNIT: Record<CadUnit, number> = { unitless: 1, mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface CadLayer { name: string; color: string; visible: boolean; frozen?: boolean; lineType?: string }

interface Base2D { layer: string; color?: string }
/** 2D drafting entities (AutoCAD-style). Coordinates are model units, y UP (CAD convention). */
export type CadEntity2D =
  | (Base2D & { type: 'line'; a: Vec3; b: Vec3 })
  | (Base2D & { type: 'polyline'; points: Vec3[]; bulges?: number[]; closed: boolean; width?: number })
  | (Base2D & { type: 'circle'; c: Vec3; r: number })
  | (Base2D & { type: 'arc'; c: Vec3; r: number; start: number; end: number }) // degrees, CCW
  | (Base2D & { type: 'ellipse'; c: Vec3; major: Vec3; ratio: number; start: number; end: number }) // radians
  | (Base2D & { type: 'spline'; points: Vec3[]; degree: number; closed: boolean; fit: boolean })
  | (Base2D & { type: 'text'; at: Vec3; height: number; rotation: number; text: string; align?: 'left' | 'center' | 'right' })
  | (Base2D & { type: 'point'; at: Vec3 })
  | (Base2D & { type: 'face'; points: Vec3[] })
  | (Base2D & { type: 'hatch'; loops: Vec3[][]; pattern: string; solid: boolean; /** Pattern spacing multiplier and angle (degrees), as DXF codes 41 and 52. */ patternScale?: number; patternAngle?: number })
  | (Base2D & { type: 'insert'; block: string; at: Vec3; scale: Vec3; rotation: number })
  /** Aligned dimension from a to b; the dimension line passes through `at`. `text` overrides the measured value. */
  | (Base2D & { type: 'dimension'; a: Vec3; b: Vec3; at: Vec3; height: number; decimals: number; text?: string })
  /** A wall: centreline a to b, thickness, height, and the doors/windows it hosts. The start of BIM. */
  | (Base2D & { type: 'wall'; a: Vec3; b: Vec3; thickness: number; height: number; openings: WallOpening[]; /** Drawing units per millimetre (library geometry is in mm). */ unitsPerMm: number })
  /** Room tag: names the room it sits in; its area is computed live from the surrounding walls. */
  | (Base2D & { type: 'room'; at: Vec3; name: string; number: string; height: number; unitsPerMm: number });

/** A door, window or plain opening hosted by a wall. `at` is the distance from the wall's start to the opening's start. */
export interface WallOpening {
  id: string; kind: 'door' | 'window' | 'opening';
  at: number; width: number;
  /** Library item drawn in the opening, with its parameters (mm). */
  item?: string; params?: Record<string, number | string | boolean>;
  /** Swing/face on the wall's right side instead of its left. */
  flip?: boolean;
  /** Sill and head heights (drawing units), for 3D and schedules. */
  sill?: number; head?: number;
}

export interface CadBlock { name: string; base: Vec3; entities: CadEntity2D[] }

/** A triangle mesh. positions xyz, indices into positions (always indexed). */
export interface CadMesh {
  id: string;
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  color?: string;
  opacity?: number;
  elementId?: string;
  layer?: string;
}

/** A named thing in the model: an IFC element, a STEP part, a 3MF object. */
export interface CadElement {
  id: string;
  /** IFC class (IfcWall, IfcDoor...) or a generic kind ('Part', 'Object', 'Assembly'). */
  cls: string;
  name: string;
  parent?: string;
  meshIds: string[];
  /** Property sets: set name -> property -> value. */
  props: Record<string, Record<string, string | number | boolean | null>>;
}

export interface CadBounds { min: Vec3; max: Vec3 }

export interface CadModel {
  schema: 1;
  name: string;
  format: CadFormat;
  units: CadUnit;
  /** True when the model is drawn in a plane (DXF/DWG drafting). */
  is2D: boolean;
  layers: CadLayer[];
  entities: CadEntity2D[];
  blocks: CadBlock[];
  meshes: CadMesh[];
  elements: CadElement[];
  bounds: CadBounds;
  /** Engine that read the file (see licences.ts). */
  engine: string;
  warnings: string[];
  meta: Record<string, string>;
}

export function emptyModel(name: string, format: CadFormat, engine: string): CadModel {
  return { schema: 1, name, format, units: 'unitless', is2D: false, layers: [], entities: [], blocks: [], meshes: [], elements: [], bounds: { min: [0, 0, 0], max: [0, 0, 0] }, engine, warnings: [], meta: {} };
}

export const emptyBounds = (): CadBounds => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });

export function growBounds(b: CadBounds, x: number, y: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  if (x < b.min[0]) b.min[0] = x; if (y < b.min[1]) b.min[1] = y; if (z < b.min[2]) b.min[2] = z;
  if (x > b.max[0]) b.max[0] = x; if (y > b.max[1]) b.max[1] = y; if (z > b.max[2]) b.max[2] = z;
}

export const boundsValid = (b: CadBounds) => b.min[0] <= b.max[0];

/** Semantic JSON saved next to the GLB: everything except the triangles. */
export interface CadModelJson extends Omit<CadModel, 'meshes'> {
  meshes: Array<Omit<CadMesh, 'positions' | 'indices' | 'normals'> & { triangles: number }>;
}

export function toModelJson(m: CadModel): CadModelJson {
  return { ...m, meshes: m.meshes.map(({ positions: _p, indices, normals: _n, ...rest }) => ({ ...rest, triangles: indices.length / 3 })) };
}

let seq = 0;
export const cadId = (prefix: string) => `${prefix}_${(++seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
