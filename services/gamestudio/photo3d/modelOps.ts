// The model edit list: the only way a ModelDoc changes, for Aria's agent and a person's hands alike
// (same pattern as services/gamestudio/ops.ts). applyModelOp is pure and returns the op that undoes it;
// describeModelOp gives the sentence the history panel shows; validateModelOp checks an op that came from a
// model before it is allowed near the document.

import {
  PART_SHAPES, SCULPT_BRUSHES,
  type Hex, type MaterialDef, type ModelCamera, type ModelDoc, type ModelPart, type PaintLayer, type SculptStroke, type Vec3,
} from './schema';

export type ModelOp =
  /** Name what the picture shows ("conga drum"). */
  | { op: 'setSubject'; subject: string }
  /** Where the photo was taken from (alignment writes it; a person can nudge it). */
  | { op: 'setCamera'; view: string; camera: ModelCamera }
  /** Show or hide the scan shell (a hero rebuild turns it off once the parts carry the shape). */
  | { op: 'useScan'; on: boolean }
  /** Add a primitive (or replace the part with this id). Carving is a part with op 'carve'. */
  | { op: 'addPart'; part: ModelPart }
  | { op: 'updatePart'; partId: string; patch: Partial<Omit<ModelPart, 'id'>> }
  | { op: 'removePart'; partId: string }
  /**
   * Pull a profile out of the surface: from a point along a direction. Stored as a capsule/box part, so it
   * stays one editable piece ("Handle, 0.12 long").
   */
  | { op: 'extrude'; id: string; name: string; from: Vec3; dir: Vec3; length: number; radius: number; endRadius?: number; profile?: 'round' | 'square'; material?: string; mirrorX?: boolean; why?: string }
  | { op: 'sculpt'; stroke: SculptStroke }
  | { op: 'removeStroke'; strokeId: string }
  | { op: 'paint'; layer: PaintLayer }
  | { op: 'removePaint'; layerId: string }
  | { op: 'putMaterial'; material: MaterialDef }
  | { op: 'removeMaterial'; materialId: string }
  /** Several ops undone as one step ("Aria added the brass lugs"). */
  | { op: 'batch'; label: string; ops: ModelOp[] };

export interface AppliedModelOp { doc: ModelDoc; inverse: ModelOp }
export class ModelOpError extends Error {}

const putById = <T extends { id: string }>(list: T[], item: T): [T[], T | undefined, number] => {
  const i = list.findIndex(x => x.id === item.id);
  if (i < 0) return [[...list, item], undefined, list.length];
  const out = list.slice(); const prev = out[i]; out[i] = item; return [out, prev, i];
};

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** The part an extrude op stands for. */
export function extrudePart(o: Extract<ModelOp, { op: 'extrude' }>): ModelPart {
  const d = norm(o.dir);
  const end: Vec3 = [o.from[0] + d[0] * o.length, o.from[1] + d[1] * o.length, o.from[2] + d[2] * o.length];
  if (o.profile === 'square') {
    // A box centred on the run, its own +Y along the direction.
    const center: Vec3 = [(o.from[0] + end[0]) / 2, (o.from[1] + end[1]) / 2, (o.from[2] + end[2]) / 2];
    return { id: o.id, name: o.name, op: 'add', shape: 'box', center, size: [o.radius * 2, o.length, o.radius * 2], rot: rotYTo(d), blend: o.radius * 0.3, material: o.material, mirrorX: o.mirrorX, why: o.why };
  }
  return { id: o.id, name: o.name, op: 'add', shape: 'capsule', center: o.from, end, size: [o.radius, o.endRadius ?? o.radius, 0], rot: [0, 0, 0], blend: o.radius * 0.4, material: o.material, mirrorX: o.mirrorX, why: o.why };
}

/** Euler XYZ degrees that turn +Y onto d. */
export function rotYTo(d: Vec3): Vec3 {
  // R = Rz·Ry·Rx (sdf.ts). With rotY 0: Rx tips +Y to [0, cos a, sin a], Rz swings it to [-sin b cos a, cos b cos a, sin a].
  const [x, y, z] = norm(d);
  const rx = Math.atan2(z, Math.hypot(x, y));
  const rz = Math.hypot(x, y) < 1e-9 ? 0 : Math.atan2(-x, y);
  return [rx * 180 / Math.PI, 0, rz * 180 / Math.PI];
}

export function applyModelOp(doc: ModelDoc, o: ModelOp): AppliedModelOp {
  switch (o.op) {
    case 'setSubject':
      return { doc: { ...doc, subject: o.subject }, inverse: { op: 'setSubject', subject: doc.subject } };
    case 'setCamera': {
      const i = doc.references.findIndex(r => r.name === o.view);
      if (i < 0) throw new ModelOpError(`No reference view "${o.view}".`);
      const prev = doc.references[i].camera;
      const references = doc.references.slice(); references[i] = { ...references[i], camera: o.camera };
      // Undoing a first alignment leaves the camera as it was (none): an empty patch is not expressible, so the
      // inverse sets the same camera back only when there was one.
      return { doc: { ...doc, references }, inverse: prev ? { op: 'setCamera', view: o.view, camera: prev } : { op: 'batch', label: 'Undo camera', ops: [] } };
    }
    case 'useScan':
      return { doc: { ...doc, useScan: o.on }, inverse: { op: 'useScan', on: doc.useScan } };
    case 'addPart': {
      if (o.part.material && !doc.materials.some(m => m.id === o.part.material)) throw new ModelOpError(`No material "${o.part.material}".`);
      const [parts, prev] = putById(doc.parts, o.part);
      return { doc: { ...doc, parts }, inverse: prev ? { op: 'addPart', part: prev } : { op: 'removePart', partId: o.part.id } };
    }
    case 'updatePart': {
      const p = doc.parts.find(x => x.id === o.partId);
      if (!p) throw new ModelOpError(`No part "${o.partId}".`);
      const before: Partial<ModelPart> = {};
      for (const k of Object.keys(o.patch) as (keyof ModelPart)[]) (before as any)[k] = p[k];
      const next = { ...p, ...o.patch } as ModelPart;
      for (const k of Object.keys(next) as (keyof ModelPart)[]) if (next[k] === undefined) delete next[k];
      return { doc: { ...doc, parts: doc.parts.map(x => x.id === o.partId ? next : x) }, inverse: { op: 'updatePart', partId: o.partId, patch: before } };
    }
    case 'removePart': {
      const i = doc.parts.findIndex(x => x.id === o.partId);
      if (i < 0) throw new ModelOpError(`No part "${o.partId}".`);
      // Paint layers pinned to the part go with it, and come back with it.
      const pinned = doc.paints.filter(l => l.region.kind === 'part' && l.region.partId === o.partId);
      const restore: ModelOp[] = [{ op: 'addPart', part: doc.parts[i] }, ...pinned.map(l => ({ op: 'paint', layer: l }) as ModelOp)];
      return {
        doc: { ...doc, parts: doc.parts.filter(x => x.id !== o.partId), paints: doc.paints.filter(l => !pinned.includes(l)) },
        inverse: restore.length === 1 ? restore[0] : { op: 'batch', label: 'Restore part', ops: restore },
      };
    }
    case 'extrude':
      return applyModelOp(doc, { op: 'addPart', part: extrudePart(o) });
    case 'sculpt': {
      const [strokes, prev] = putById(doc.strokes, o.stroke);
      return { doc: { ...doc, strokes }, inverse: prev ? { op: 'sculpt', stroke: prev } : { op: 'removeStroke', strokeId: o.stroke.id } };
    }
    case 'removeStroke': {
      const s = doc.strokes.find(x => x.id === o.strokeId);
      if (!s) throw new ModelOpError(`No stroke "${o.strokeId}".`);
      return { doc: { ...doc, strokes: doc.strokes.filter(x => x.id !== o.strokeId) }, inverse: { op: 'sculpt', stroke: s } };
    }
    case 'paint': {
      const r = o.layer.region;
      if (r.kind === 'part' && !doc.parts.some(p => p.id === r.partId)) throw new ModelOpError(`No part "${r.partId}" to paint.`);
      if (o.layer.material && !doc.materials.some(m => m.id === o.layer.material)) throw new ModelOpError(`No material "${o.layer.material}".`);
      if (o.layer.projectPhoto && !doc.references.some(v => v.name === o.layer.projectPhoto)) throw new ModelOpError(`No reference view "${o.layer.projectPhoto}".`);
      const [paints, prev] = putById(doc.paints, o.layer);
      return { doc: { ...doc, paints }, inverse: prev ? { op: 'paint', layer: prev } : { op: 'removePaint', layerId: o.layer.id } };
    }
    case 'removePaint': {
      const l = doc.paints.find(x => x.id === o.layerId);
      if (!l) throw new ModelOpError(`No paint layer "${o.layerId}".`);
      return { doc: { ...doc, paints: doc.paints.filter(x => x.id !== o.layerId) }, inverse: { op: 'paint', layer: l } };
    }
    case 'putMaterial': {
      const [materials, prev] = putById(doc.materials, o.material);
      return { doc: { ...doc, materials }, inverse: prev ? { op: 'putMaterial', material: prev } : { op: 'removeMaterial', materialId: o.material.id } };
    }
    case 'removeMaterial': {
      const m = doc.materials.find(x => x.id === o.materialId);
      if (!m) throw new ModelOpError(`No material "${o.materialId}".`);
      if (doc.parts.some(p => p.material === o.materialId) || doc.paints.some(l => l.material === o.materialId)) {
        throw new ModelOpError(`${m.name} is still used; take it off its parts and paint first.`);
      }
      return { doc: { ...doc, materials: doc.materials.filter(x => x.id !== o.materialId) }, inverse: { op: 'putMaterial', material: m } };
    }
    case 'batch': {
      let cur = doc;
      const inverses: ModelOp[] = [];
      for (const sub of o.ops) { const a = applyModelOp(cur, sub); cur = a.doc; inverses.unshift(a.inverse); }
      return { doc: cur, inverse: { op: 'batch', label: `Undo: ${o.label}`, ops: inverses } };
    }
  }
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const at = (v: Vec3) => v.map(f).join(', ');
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const SHAPE_WORD: Record<string, string> = { box: 'box', ellipsoid: 'rounded lump', cylinder: 'cylinder', torus: 'ring', capsule: 'rod' };

/** The op as a sentence, read against the document BEFORE it applied. */
export function describeModelOp(doc: ModelDoc, o: ModelOp): string {
  const partName = (id: string) => doc.parts.find(p => p.id === id)?.name ?? id;
  switch (o.op) {
    case 'setSubject': return `Called it "${o.subject}"`;
    case 'setCamera': return `Lined the ${o.view} camera up: turned ${f(o.camera.yawDeg)}°, looking down ${f(o.camera.pitchDeg)}°`;
    case 'useScan': return o.on ? 'Showed the scan shell' : 'Hid the scan shell (the parts carry the shape now)';
    case 'addPart': {
      const p = o.part, had = doc.parts.some(x => x.id === p.id);
      const verb = p.op === 'carve' ? 'Carved' : 'Added';
      const mat = p.material ? ` in ${doc.materials.find(m => m.id === p.material)?.name ?? p.material}` : '';
      const mirror = p.mirrorX ? ', both sides' : '';
      return had ? `Rebuilt ${p.name}` : `${verb} ${p.name} (${an(SHAPE_WORD[p.shape])} ${SHAPE_WORD[p.shape]}${mat}) at ${at(p.center)}${mirror}`;
    }
    case 'updatePart': {
      const bits: string[] = [];
      const pt = o.patch;
      if (pt.center) bits.push(`moved to ${at(pt.center)}`);
      if (pt.size) bits.push(`sized ${at(pt.size)}`);
      if (pt.rot) bits.push(`turned ${at(pt.rot)}°`);
      if (pt.name) bits.push(`renamed "${pt.name}"`);
      if (pt.material) bits.push(`made of ${doc.materials.find(m => m.id === pt.material)?.name ?? pt.material}`);
      if (pt.op) bits.push(pt.op === 'carve' ? 'now cuts away' : 'now adds');
      if (pt.blend !== undefined) bits.push(`blend ${f(pt.blend)}`);
      return `${partName(o.partId)}: ${bits.join(', ') || 'changed'}`;
    }
    case 'removePart': return `Removed ${partName(o.partId)}`;
    case 'extrude': return `Pulled ${o.name} out ${f(o.length)} from ${at(o.from)}${o.mirrorX ? ', both sides' : ''}`;
    case 'sculpt': {
      const verb = { clay: 'Built up', carve: 'Carved into', inflate: 'Swelled' }[o.stroke.brush];
      return `${verb} ${o.stroke.name} (${o.stroke.points.length}-point stroke, radius ${f(o.stroke.radius)})`;
    }
    case 'removeStroke': return `Removed stroke ${doc.strokes.find(s => s.id === o.strokeId)?.name ?? o.strokeId}`;
    case 'paint': {
      const l = o.layer;
      const what = l.projectPhoto ? `the ${l.projectPhoto}'s colours` : l.material ? (doc.materials.find(m => m.id === l.material)?.name ?? l.material) : l.colour;
      const where = l.region.kind === 'part' ? partName(l.region.partId) : l.region.kind === 'all' ? 'everything' : `${l.name}`;
      const fill = l.projectPhoto && l.fillUnseen && l.fillUnseen !== 'none' ? (l.fillUnseen === 'turn' ? ", carried round to the sides it can't see" : ", mirrored onto the sides it can't see") : '';
      return `Painted ${where} with ${what}${l.opacity < 1 ? ` at ${Math.round(l.opacity * 100)}%` : ''}${fill}`;
    }
    case 'removePaint': return `Removed paint ${doc.paints.find(l => l.id === o.layerId)?.name ?? o.layerId}`;
    case 'putMaterial': return `${doc.materials.some(m => m.id === o.material.id) ? 'Changed' : 'New'} material ${o.material.name}: ${o.material.colour}, ${o.material.metalness >= 0.5 ? 'metal' : 'non-metal'}, roughness ${f(o.material.roughness)}`;
    case 'removeMaterial': return `Removed material ${doc.materials.find(m => m.id === o.materialId)?.name ?? o.materialId}`;
    case 'batch': return o.label;
  }
}

// ── Validation of ops written by a model ──────────────────────────────────────────────────────────────────────

const isNum = (v: unknown, lo = -Infinity, hi = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isVec = (v: unknown, lim = 1.5): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(x => isNum(x, -lim, lim));
const isHex = (v: unknown): v is Hex => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v);
const isName = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 80;

/** Why the op can't be used, or null when it is fine. Positions stay inside the clay domain; sizes stay sane. */
export function validateModelOp(o: unknown, depth = 0): string | null {
  if (!o || typeof o !== 'object') return 'not an object';
  const x = o as Record<string, any>;
  switch (x.op) {
    case 'setSubject': return isName(x.subject) ? null : 'subject must be short text';
    case 'useScan': return typeof x.on === 'boolean' ? null : 'on must be true or false';
    case 'setCamera': return typeof x.view === 'string' && x.camera && isNum(x.camera.fovDeg, 1, 120) ? null : 'bad camera';
    case 'addPart': return validatePart(x.part);
    case 'updatePart': {
      if (!isId(x.partId) || !x.patch || typeof x.patch !== 'object') return 'updatePart needs partId and patch';
      if ('id' in x.patch) return 'a patch cannot change the id';
      return null;
    }
    case 'removePart': return isId(x.partId) ? null : 'removePart needs partId';
    case 'extrude':
      if (!isId(x.id) || !isName(x.name)) return 'extrude needs id and name';
      if (!isVec(x.from) || !isVec(x.dir, 10) || Math.hypot(...(x.dir as Vec3)) < 1e-6) return 'extrude needs from and a non-zero dir';
      if (!isNum(x.length, 0.002, 2) || !isNum(x.radius, 0.002, 0.8)) return 'extrude length/radius out of range';
      if (x.endRadius !== undefined && !isNum(x.endRadius, 0, 0.8)) return 'endRadius out of range';
      return null;
    case 'sculpt': {
      const s = x.stroke;
      if (!s || !isId(s.id) || !isName(s.name)) return 'sculpt needs a stroke with id and name';
      if (!SCULPT_BRUSHES.includes(s.brush)) return `brush must be one of ${SCULPT_BRUSHES.join(', ')}`;
      if (!Array.isArray(s.points) || !s.points.length || s.points.length > 64 || !s.points.every((p: unknown) => isVec(p))) return 'stroke points must be 1-64 positions in the clay domain';
      if (!isNum(s.radius, 0.004, 0.6) || !isNum(s.strength, 0, 1)) return 'stroke radius/strength out of range';
      return null;
    }
    case 'removeStroke': return isId(x.strokeId) ? null : 'removeStroke needs strokeId';
    case 'paint': {
      const l = x.layer;
      if (!l || !isId(l.id) || !isName(l.name)) return 'paint needs a layer with id and name';
      if (!isNum(l.opacity, 0, 1)) return 'opacity must be 0..1';
      if (!l.colour && !l.material && !l.projectPhoto) return 'a layer needs a colour, a material or a photo to project';
      if (l.colour !== undefined && !isHex(l.colour)) return 'colour must be #rrggbb';
      if (l.fillUnseen !== undefined && !['mirror', 'turn', 'none'].includes(l.fillUnseen)) return 'fillUnseen must be mirror, turn or none';
      const r = l.region;
      if (!r) return 'paint needs a region';
      if (r.kind === 'sphere') return isVec(r.center) && isNum(r.radius, 0.002, 2) ? null : 'bad sphere region';
      if (r.kind === 'box') return isVec(r.center) && isVec(r.size, 4) && r.size.every((v: number) => v > 0) ? null : 'bad box region';
      if (r.kind === 'part') return isId(r.partId) ? null : 'bad part region';
      if (r.kind === 'all') return null;
      return 'region kind must be sphere, box, part or all';
    }
    case 'removePaint': return isId(x.layerId) ? null : 'removePaint needs layerId';
    case 'putMaterial': {
      const m = x.material;
      if (!m || !isId(m.id) || !isName(m.name) || !isHex(m.colour)) return 'material needs id, name and #rrggbb colour';
      return isNum(m.metalness, 0, 1) && isNum(m.roughness, 0, 1) ? null : 'metalness/roughness must be 0..1';
    }
    case 'removeMaterial': return isId(x.materialId) ? null : 'removeMaterial needs materialId';
    case 'batch': {
      if (depth > 1) return 'batches nest one level at most';
      if (!isName(x.label) || !Array.isArray(x.ops)) return 'batch needs label and ops';
      for (const s of x.ops) { const e = validateModelOp(s, depth + 1); if (e) return `in batch: ${e}`; }
      return null;
    }
    default: return `unknown op "${x.op}"`;
  }
}

function validatePart(p: any): string | null {
  if (!p || !isId(p.id) || !isName(p.name)) return 'part needs id and name';
  if (p.op !== 'add' && p.op !== 'carve') return 'part op must be add or carve';
  if (!PART_SHAPES.includes(p.shape)) return `shape must be one of ${PART_SHAPES.join(', ')}`;
  if (!isVec(p.center) || !isVec(p.rot, 360)) return 'part needs center (clay domain) and rot (degrees)';
  if (!Array.isArray(p.size) || p.size.length !== 3 || !p.size.every((v: unknown) => isNum(v, 0, 2))) return 'size must be three numbers 0..2';
  if (p.shape !== 'capsule' && p.size.slice(0, 2).some((v: number) => v < 0.002)) return 'part is too small to see';
  if (p.shape === 'capsule' && (!isVec(p.end) || p.size[0] < 0.002)) return 'a capsule needs an end and a radius';
  if (p.blend !== undefined && !isNum(p.blend, 0, 0.5)) return 'blend out of range';
  if (p.round !== undefined && !isNum(p.round, 0, 0.5)) return 'round out of range';
  return null;
}

// ── History ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ModelHistoryEntry { op: ModelOp; inverse: ModelOp; label: string; by: 'person' | 'aria'; at: number }

/** Undo/redo over applyModelOp, with who made each step (the agent's rounds show as Aria's). */
export class ModelHistory {
  doc: ModelDoc;
  private done: ModelHistoryEntry[] = [];
  private undone: ModelHistoryEntry[] = [];
  constructor(doc: ModelDoc, private now: () => number = Date.now) { this.doc = doc; }
  get entries(): readonly ModelHistoryEntry[] { return this.done; }
  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }

  apply(op: ModelOp, by: 'person' | 'aria' = 'person'): ModelDoc {
    const label = describeModelOp(this.doc, op);
    const { doc, inverse } = applyModelOp(this.doc, op);
    this.done.push({ op, inverse, label, by, at: this.now() });
    this.undone = [];
    this.doc = { ...doc, updatedAt: this.now() };
    return this.doc;
  }
  undo(): ModelDoc | null {
    const e = this.done.pop(); if (!e) return null;
    this.doc = { ...applyModelOp(this.doc, e.inverse).doc, updatedAt: this.now() };
    this.undone.push(e);
    return this.doc;
  }
  redo(): ModelDoc | null {
    const e = this.undone.pop(); if (!e) return null;
    const { doc, inverse } = applyModelOp(this.doc, e.op);
    this.done.push({ ...e, inverse });
    this.doc = { ...doc, updatedAt: this.now() };
    return this.doc;
  }
}

export const hexToRgb = (h: Hex): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
export const rgbToHex = (c: [number, number, number]): Hex => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
