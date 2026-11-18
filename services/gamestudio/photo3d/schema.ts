// Photo → 3D (docs/game-studio-photo-to-3d.md): the editable model document a scan turns into.
//
// A scan mesh is only the starting shape. Everything Aria (or a person) adds on top of it is data: named parts,
// sculpt strokes, paint layers and materials, each one a readable op (modelOps.ts) that can be undone and edited
// by hand. Nothing in here is a baked mesh except the scan itself, which stays a reference to a file.
//
// Units: clay space, the Argilla domain [-1, 1] on every axis. The scan is fitted into it (largest half-extent
// FIT) when the document is made; `metresPerUnit` gives real size when the subject's size is known.

export type Vec3 = [number, number, number];
/** "#rrggbb", so a colour reads in the history panel and a person can type one. */
export type Hex = string;

export const MODEL_DOC_KIND = 'plajah.model';
export const MODEL_DOC_VERSION = 1;
/** Largest half-extent a scan is fitted to inside the clay domain (same as Argilla's voxelize default). */
export const FIT = 0.82;

/**
 * A pinhole camera looking at `target` from `distance`, turned `yaw` around +Y and tilted `pitch` down.
 * `frame` maps the projected picture onto the photo's pixels (alignment finds it), so a 3D point and a
 * pixel of the photo can be traded both ways.
 */
export interface ModelCamera {
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  distance: number;
  target: Vec3;
  width: number;
  height: number;
  /** After projection: pixel = centre + ndc * scale * height/2 + offset (pixels). */
  frame: { scale: number; dx: number; dy: number };
  /** Camera roll around its view axis, degrees (a tilted phone). */
  rollDeg?: number;
}

export interface ReferenceView {
  /** 'photo' for the main picture; 'side', 'back', 'detail-1' … for any more pictures the creator gives. */
  name: string;
  url: string;
  camera?: ModelCamera;
}

export type PartShape = 'box' | 'ellipsoid' | 'cylinder' | 'torus' | 'capsule';
export const PART_SHAPES: PartShape[] = ['box', 'ellipsoid', 'cylinder', 'torus', 'capsule'];

/**
 * A primitive added to (or carved from) the clay. Size is the full extent along the part's own axes; a
 * cylinder and a torus stand along their own +Y. Capsules (and extrusions) run from `center` to `end`.
 */
export interface ModelPart {
  id: string;
  name: string;
  op: 'add' | 'carve';
  shape: PartShape;
  center: Vec3;
  /** box/ellipsoid: [w, h, d]. cylinder: [diameter, height, diameter]. torus: [outer diameter, tube diameter, -]. capsule: [radius at center, radius at end, -]. */
  size: Vec3;
  /** Euler degrees, XYZ. */
  rot: Vec3;
  /** Capsule/extrusion end point. */
  end?: Vec3;
  /** Corner rounding for boxes and cylinders (clay units). */
  round?: number;
  /** Smooth blend into what is already there (clay units, 0 = hard edge). */
  blend?: number;
  /** Also place the part mirrored across X = 0. */
  mirrorX?: boolean;
  /** Material id; its colour paints the part unless a paint layer says otherwise. */
  material?: string;
  /** The gap item that asked for it, so a person can see why it exists. */
  why?: string;
}

/** The brushes a replay can reproduce exactly. Smooth, flatten, pinch and crease stay hand tools in Argilla for now. */
export type SculptBrush = 'clay' | 'carve' | 'inflate';
export const SCULPT_BRUSHES: SculptBrush[] = ['clay', 'carve', 'inflate'];

/** A stroke as the Argilla brushes make it: points on the surface, a radius and a strength (0..1). */
export interface SculptStroke {
  id: string;
  name: string;
  brush: SculptBrush;
  points: Vec3[];
  radius: number;
  strength: number;
  mirrorX?: boolean;
  why?: string;
}

export type PaintRegion =
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'box'; center: Vec3; size: Vec3 }
  | { kind: 'part'; partId: string }
  | { kind: 'all' };

/**
 * Colour on the surface. `projectPhoto` carries the reference picture's pixels onto the faces that see the
 * camera (what paint_from_views does for the Forge); otherwise the layer is a flat colour, or a material's.
 */
export interface PaintLayer {
  id: string;
  name: string;
  region: PaintRegion;
  colour?: Hex;
  material?: string;
  /** Reference view whose pixels to project (usually 'photo'). */
  projectPhoto?: string;
  /**
   * What a projection puts on faces the camera can't see. 'mirror': the colour of the point mirrored front-to-back
   * (most objects). 'turn': the colour at the same height on the side facing the camera (round things: drums,
   * vases, bottles). 'none' (default): leave them to the layers below.
   */
  fillUnseen?: 'mirror' | 'turn' | 'none';
  /** 0..1, how much of the layer covers what is under it. */
  opacity: number;
  /** Soft edge as a fraction of the region (0 = hard). */
  feather?: number;
  why?: string;
}

export interface MaterialDef {
  id: string;
  name: string;
  colour: Hex;
  metalness: number;
  roughness: number;
}

export interface ScanBase {
  kind: 'scan';
  /** GLB the scan engine wrote (local file or storage URL). */
  glb: string;
  backend: string;
  /** Clay-space fit applied to the GLB: clay = (p - centre) * scale. */
  centre: Vec3;
  scale: number;
}

export interface ModelDoc {
  kind: typeof MODEL_DOC_KIND;
  version: typeof MODEL_DOC_VERSION;
  id: string;
  name: string;
  /** What it is, in words ("conga drum"). The vision model fills it in when the creator doesn't. */
  subject: string;
  /**
   * 'prop': the scan can stay the shell. 'hero': the scan is a guide only; the finished model has to be built
   * from the reference frames and design sheet (Kenne, hero cars, 2026-11-16), so the loop never passes a hero
   * that still leans on the scan for its shell.
   */
  role: 'prop' | 'hero';
  references: ReferenceView[];
  base: ScanBase | { kind: 'empty' };
  /** Show the scan shell at all (a hero rebuild turns it off once the parts carry the shape). */
  useScan: boolean;
  metresPerUnit?: number;
  parts: ModelPart[];
  strokes: SculptStroke[];
  paints: PaintLayer[];
  materials: MaterialDef[];
  createdAt: number;
  updatedAt: number;
}

export function emptyModelDoc(id: string, name: string, now = Date.now()): ModelDoc {
  return {
    kind: MODEL_DOC_KIND, version: MODEL_DOC_VERSION, id, name, subject: '', role: 'prop', references: [],
    base: { kind: 'empty' }, useScan: true, parts: [], strokes: [], paints: [], materials: [], createdAt: now, updatedAt: now,
  };
}
