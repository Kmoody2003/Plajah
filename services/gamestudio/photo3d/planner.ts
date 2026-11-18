// Aria's hands: turn a gap report into model ops.
//
// Split of work:
// - the eye (vision model) says what is wrong and where in a picture (gapReport.ts);
// - anchorGaps() does the 3D maths: each picture region becomes a place on (or just off) the model, with a
//   surface normal and a real size, through the aligned camera;
// - the agent (an LLM lane, or planFromGaps' rules when no model answers) picks the ops.
// Every op it returns is validated, labelled with the gap it answers (`why`), and applied as one undoable batch.

import { ray, unitsPerPixel, basis, project } from './camera';
import { gapCost, SEVERITY_COST, type GapItem, type GapReport } from './gapReport';
import { rgbToHex, validateModelOp, type ModelOp } from './modelOps';
import type { Hex, ModelCamera, ModelDoc, ModelPart, Vec3 } from './schema';

export interface Hit { point: Vec3; normal: Vec3 }

export interface PlanContext {
  /** Camera of each picture the report can point into ('photo', 'render-front' …). */
  cameras: Record<string, ModelCamera>;
  /** Ray against the current model. */
  hit: (origin: Vec3, dir: Vec3) => Hit | null;
  /** Mean colour of the photo's subject pixels inside a box (0..1 box), or null if none. */
  samplePhoto?: (view: string, box: GapItem['region']) => Hex | null;
  /** How much of a box the subject covers in the photo and in the photo-camera render. */
  coverage?: (box: GapItem['region']) => { photo: number; render: number };
  /** The model's current bounds in clay space. */
  bounds: { min: Vec3; max: Vec3 };
}

export interface Anchor {
  gap: GapItem;
  /** Where the region's centre lands on the model, or on the plane through the model's centre if the ray misses. */
  point: Vec3;
  normal: Vec3;
  onSurface: boolean;
  /** Region size in clay units at that depth: [width, height]. */
  size: [number, number];
  /** Distance of the point from the model's vertical axis (rings and bands wrap at this radius). */
  axisRadius: number;
  /** Photo colour there, if known. */
  colour?: Hex;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r3 = (v: Vec3): Vec3 => v.map(x => Math.round(x * 1000) / 1000) as Vec3;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';

/** Picture regions → places on the model. Items in views without a camera are skipped (and reported). */
export function anchorGaps(report: GapReport, ctx: PlanContext): { anchors: Anchor[]; skipped: string[] } {
  const anchors: Anchor[] = [], skipped: string[] = [];
  const centre: Vec3 = [0, 1, 2].map(k => (ctx.bounds.min[k] + ctx.bounds.max[k]) / 2) as Vec3;
  for (const gap of report.items) {
    const cam = ctx.cameras[gap.view];
    if (!cam) { skipped.push(`${gap.id}: no camera for view "${gap.view}"`); continue; }
    const b = basis(cam);
    const px = ((gap.region.x0 + gap.region.x1) / 2) * cam.width, py = ((gap.region.y0 + gap.region.y1) / 2) * cam.height;
    const r = ray(cam, px, py, b);
    const h = ctx.hit(r.origin, r.dir);
    let point: Vec3, normal: Vec3;
    if (h) { point = h.point; normal = h.normal; }
    else {
      // Off the model (a missing handle sticks out past the silhouette): the plane through the centre, facing the camera.
      const t = dot(sub(centre, r.origin), b.fwd) / Math.max(1e-6, dot(r.dir, b.fwd));
      point = add(r.origin, r.dir, t);
      normal = [-b.fwd[0], -b.fwd[1], -b.fwd[2]];
    }
    const depth = project(cam, point, b)[2];
    const upp = unitsPerPixel(cam, depth, b);
    const size: [number, number] = [(gap.region.x1 - gap.region.x0) * cam.width * upp, (gap.region.y1 - gap.region.y0) * cam.height * upp];
    const colour = gap.hint?.colour ?? ctx.samplePhoto?.(gap.view === 'photo' || !ctx.samplePhoto ? 'photo' : gap.view, gap.region) ?? undefined;
    anchors.push({ gap, point: r3(point), normal: r3(normal), onSurface: !!h, size: [+size[0].toFixed(4), +size[1].toFixed(4)], axisRadius: +Math.hypot(point[0] - centre[0], point[2] - centre[2]).toFixed(4), ...(colour ? { colour } : {}) });
  }
  return { anchors, skipped };
}

/** Most costly first: severity × confidence, then size. */
export const byCost = (a: Anchor, b: Anchor) => SEVERITY_COST[b.gap.severity] * b.gap.confidence - SEVERITY_COST[a.gap.severity] * a.gap.confidence || b.size[0] * b.size[1] - a.size[0] * a.size[1];

/**
 * The rules the agent falls back on when no model answers (and the baseline a model has to beat). Deliberately
 * simple and predictable: one gap → one or two ops, sized from the anchor.
 */
export function planFromGaps(doc: ModelDoc, anchors: Anchor[], ctx: PlanContext, round: number): ModelOp[] {
  const ops: ModelOp[] = [];
  const height = ctx.bounds.max[1] - ctx.bounds.min[1];
  const centre: Vec3 = [0, 1, 2].map(k => (ctx.bounds.min[k] + ctx.bounds.max[k]) / 2) as Vec3;
  const materials = new Map(doc.materials.map(m => [m.id, m]));
  const used = new Set([...doc.parts.map(p => p.id), ...doc.paints.map(l => l.id), ...doc.strokes.map(s => s.id), ...doc.materials.map(m => m.id)]);
  const uid = (base: string) => { let id = `${base}-r${round}`, k = 2; while (used.has(id)) id = `${base}-r${round}-${k++}`; used.add(id); return id; };

  // The photo's own colours go on first: nothing else matches colour as well where the camera sees the surface.
  if (doc.references.some(v => v.name === 'photo') && !doc.paints.some(l => l.projectPhoto)) {
    ops.push({ op: 'paint', layer: { id: uid('photo-colours'), name: 'Photo colours', region: { kind: 'all' }, projectPhoto: 'photo', opacity: 1 } });
  }

  const materialFor = (a: Anchor): string | undefined => {
    const name = a.gap.hint?.material ?? (a.gap.hint?.metal ? 'metal' : undefined);
    if (!name) return undefined;
    const id = slug(name);
    if (!materials.has(id)) {
      const m = { id, name, colour: a.colour ?? '#888888', metalness: a.gap.hint?.metal || /brass|gold|steel|iron|chrome|metal|copper|silver|bronze/i.test(name) ? 1 : 0, roughness: /polish|gloss|lacquer|chrome|mirror/i.test(name) ? 0.2 : 0.55 };
      materials.set(id, m); used.add(id);
      ops.push({ op: 'putMaterial', material: m });
    }
    return id;
  };

  for (const a of [...anchors].sort(byCost)) {
    const g = a.gap, why = g.id, name = g.description.split(/[,.;]/)[0].slice(0, 60);
    const thick = Math.max(0.01, Math.min(a.size[0], a.size[1], (g.hint?.depth ?? 0) * height || Infinity));
    if (g.axis === 'colour') {
      ops.push({ op: 'paint', layer: { id: uid(`paint-${slug(name)}`), name, region: { kind: 'box', center: a.point, size: [a.size[0], a.size[1], Math.max(a.size[0], 0.05)] }, colour: a.colour ?? '#808080', opacity: 0.9, feather: 0.2, why } });
      continue;
    }
    if (g.axis === 'material') {
      const mat = materialFor(a) ?? (() => { const id = uid('material'); const m = { id, name: name.slice(0, 40), colour: a.colour ?? '#888888', metalness: 0, roughness: 0.5 }; materials.set(id, m); ops.push({ op: 'putMaterial', material: m }); return id; })();
      ops.push({ op: 'paint', layer: { id: uid(`mat-${slug(name)}`), name, region: { kind: 'box', center: a.point, size: [a.size[0], a.size[1], Math.max(a.size[0], 0.05)] }, material: mat, opacity: 1, why } });
      continue;
    }
    // Shape axes: silhouette, geometry, prop.
    let carve = g.kind === 'extra';
    if (g.kind === 'wrong' && ctx.coverage && (g.view === 'photo' || g.view === 'render-photo')) {
      const c = ctx.coverage(g.region);
      carve = c.render > c.photo + 0.05;
    }
    const material = carve ? undefined : materialFor(a);
    const shape = g.hint?.shape;
    const parts: ModelPart[] = [];
    const base = { op: carve ? 'carve' : 'add', material, why, mirrorX: g.hint?.symmetric || undefined } as const;
    if (shape === 'ring' || shape === 'band' || (!shape && a.size[0] > a.size[1] * 4 && a.size[0] > (ctx.bounds.max[0] - ctx.bounds.min[0]) * 0.6)) {
      // Wraps the subject at this height.
      const tube = Math.max(0.008, Math.min(a.size[1], thick * 1.5));
      const ringR = Math.max(0.02, a.axisRadius) + tube * 0.25;
      parts.push({ ...base, mirrorX: undefined, id: uid(`ring-${slug(name)}`), name, shape: 'torus', center: [centre[0], a.point[1], centre[2]], size: [2 * ringR + tube, tube, 0], rot: [0, 0, 0], blend: tube * 0.2 });
    } else if (shape === 'groove' || shape === 'hole') {
      parts.push({ ...base, op: 'carve', material: undefined, id: uid(`cut-${slug(name)}`), name, shape: 'ellipsoid', center: a.point, size: [a.size[0], a.size[1], thick], rot: [0, 0, 0], blend: thick * 0.2 });
    } else if (shape === 'bar' || shape === 'rod') {
      // Along the region's long side, standing off the surface by half its thickness.
      const vertical = a.size[1] >= a.size[0];
      const len = Math.max(a.size[0], a.size[1]);
      const r = Math.max(0.004, Math.min(a.size[0], a.size[1]) / 2);
      const mid = add(a.point, a.normal, a.onSurface ? r * 0.6 : 0);
      const half: Vec3 = vertical ? [0, len / 2, 0] : [len / 2, 0, 0];
      parts.push({ ...base, id: uid(`rod-${slug(name)}`), name, shape: 'capsule', center: r3(sub(mid, half)), end: r3(add(mid, half)), size: [r, r, 0], rot: [0, 0, 0], blend: r * 0.3 });
    } else {
      const lumpy = shape === 'knob' || shape === 'lump' || (!shape && g.axis !== 'prop');
      const d = carve ? thick : Math.max(0.008, (g.hint?.depth ?? 0) * height || thick * 0.6);
      const center = carve || !a.onSurface ? a.point : add(a.point, a.normal, d * 0.35);
      parts.push({ ...base, id: uid(`${carve ? 'cut' : lumpy ? 'lump' : 'block'}-${slug(name)}`), name, shape: lumpy ? 'ellipsoid' : 'box', center: r3(center), size: [a.size[0], a.size[1], d], rot: [0, (Math.atan2(a.normal[0], a.normal[2]) * 180) / Math.PI, 0], round: lumpy ? undefined : d * 0.25, blend: d * 0.25 });
    }
    // Repeats around the subject (lugs on a drum): copy round the vertical axis.
    const count = g.hint?.count ?? 1;
    for (const p of parts) {
      ops.push({ op: 'addPart', part: p });
      if (count > 1 && p.shape !== 'torus') {
        for (let k = 1; k < count; k++) {
          const ang = (2 * Math.PI * k) / count;
          const turn = (v: Vec3): Vec3 => { const x = v[0] - centre[0], z = v[2] - centre[2]; return r3([centre[0] + x * Math.cos(ang) + z * Math.sin(ang), v[1], centre[2] - x * Math.sin(ang) + z * Math.cos(ang)]); };
          ops.push({ op: 'addPart', part: { ...p, id: uid(p.id.replace(/-r\d+(-\d+)?$/, '')), name: `${p.name} ${k + 1}`, center: turn(p.center), end: p.end ? turn(p.end) : undefined, rot: [p.rot[0], p.rot[1] + (ang * 180) / Math.PI, p.rot[2]], mirrorX: undefined } });
        }
      }
    }
  }
  return ops;
}

// ── The LLM lane ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the agent is told: the vocabulary, the model as it stands, and each gap already placed in 3D. */
export function agentPrompt(doc: ModelDoc, anchors: Anchor[], ctx: PlanContext, round: number, notes: string[] = []): { system: string; user: string } {
  const system = [
    'You are Aria, a 3D modelling agent in the Plajah Game Studio. You fix a model so it matches a reference photo, using edit ops a person can read and undo.',
    'Coordinates are clay space: the model sits inside [-1, 1] on every axis, +Y up, +Z toward the front. Sizes are full extents in the same units.',
    'Each gap comes with its place on the model already worked out (point, normal, size). Use those numbers; do not invent positions far from them.',
    'Prefer few, well-named parts that a person would make by hand. Name parts by what they are ("Top rim", "Tuning lug 3"). Put each gap id in the op\'s "why".',
    'When the model has a scan shell, the shell IS the body: never add a part that covers or replaces it. Fix colour with paint (box or sphere regions round the gap, or a part region), fix small shape errors with sculpt strokes, and add parts only for pieces that are missing (a handle, a ring, a lug). A part much larger than its gap is wrong.',
    'Faces the photo cannot see get their colour from the photo-colours layer: its fillUnseen is "mirror" (front-to-back, most objects) or "turn" (same height on the camera side; round things such as drums, vases, bottles). Paint a layer with the same id to change it.',
    'Every round is measured, and a round that lowers the score is undone.',
    'Answer only JSON: {"ops": [...]}.',
  ].join(' ');
  const vocab = [
    'Ops:',
    '{"op":"addPart","part":{"id","name","op":"add"|"carve","shape":"box"|"ellipsoid"|"cylinder"|"torus"|"capsule","center":[x,y,z],"size":[a,b,c],"rot":[degX,degY,degZ],"end":[x,y,z] (capsule only),"round","blend","mirrorX":bool,"material":id,"why"}}',
    '  box/ellipsoid size = [w,h,d]; cylinder = [diameter, height, diameter], stands on +Y; torus = [outer diameter, tube diameter, 0], lies flat (axis +Y); capsule = [radius at center, radius at end, 0] from center to end.',
    '{"op":"extrude","id","name","from":[x,y,z],"dir":[x,y,z],"length","radius","endRadius","profile":"round"|"square","material","mirrorX","why"}',
    '{"op":"sculpt","stroke":{"id","name","brush":"clay"|"carve"|"inflate","points":[[x,y,z],...],"radius","strength":0..1,"mirrorX","why"}}  (points on the surface; moves it by up to radius*strength/2)',
    '{"op":"paint","layer":{"id","name","projectPhoto":"photo" (projection layers only),"fillUnseen":"mirror"|"turn"|"none","region":{"kind":"sphere","center","radius"}|{"kind":"box","center","size"}|{"kind":"part","partId"}|{"kind":"all"},"colour":"#rrggbb" or "material":id,"opacity":0..1,"feather":0..1,"why"}}',
    '{"op":"putMaterial","material":{"id","name","colour":"#rrggbb","metalness":0..1,"roughness":0..1}}  (put it before parts/paint that use it)',
    '{"op":"updatePart","partId","patch":{...}} {"op":"removePart","partId"} {"op":"removePaint","layerId"} {"op":"removeStroke","strokeId"}',
  ].join('\n');
  const height = ctx.bounds.max[1] - ctx.bounds.min[1];
  const state = {
    subject: doc.subject,
    bounds: ctx.bounds,
    height: +height.toFixed(3),
    scanShell: doc.useScan && doc.base.kind === 'scan',
    parts: doc.parts.map(p => ({ id: p.id, name: p.name, op: p.op, shape: p.shape, center: p.center, size: p.size, material: p.material })),
    materials: doc.materials,
    paints: doc.paints.map(l => ({ id: l.id, name: l.name, region: l.region, colour: l.colour, material: l.material, projectPhoto: l.projectPhoto, fillUnseen: l.fillUnseen, opacity: l.opacity })),
    strokes: doc.strokes.map(s => ({ id: s.id, name: s.name, brush: s.brush })),
  };
  const gaps = [...anchors].sort(byCost).map(a => ({
    id: a.gap.id, axis: a.gap.axis, kind: a.gap.kind, severity: a.gap.severity, description: a.gap.description, hint: a.gap.hint,
    point: a.point, normal: a.normal, onSurface: a.onSurface, size: a.size, axisRadius: a.axisRadius, photoColour: a.colour,
  }));
  const user = `${vocab}\n\n${notes.length ? `Earlier rounds:\n${notes.join('\n')}\n\n` : ''}Round ${round}. The model now:\n${JSON.stringify(state)}\n\nGaps to fix, most costly first:\n${JSON.stringify(gaps)}\n\nIds must be new (not already in the model) unless you mean to replace that item. Return {"ops": [...]}.`;
  return { system, user };
}

/** Reads the agent's answer; keeps the ops that validate, says why the rest were dropped. */
export function parseAgentOps(raw: string): { ops: ModelOp[]; dropped: string[] } {
  let data: any;
  const text = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { data = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); try { data = m ? JSON.parse(m[0]) : null; } catch { data = null; } }
  const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.ops) ? data.ops : [];
  const ops: ModelOp[] = [], dropped: string[] = [];
  list.forEach((o, i) => {
    normaliseOp(o);
    const err = validateModelOp(o);
    if (err) dropped.push(`op ${i + 1}: ${err}`); else ops.push(o as ModelOp);
  });
  if (!list.length) dropped.push('no ops in the answer');
  return { ops, dropped };
}

/** Fill the defaults a model tends to leave out, so a missing rotation doesn't cost a whole op. */
function normaliseOp(o: any) {
  if (!o || typeof o !== 'object') return;
  const p = o.op === 'addPart' ? o.part : null;
  if (p && typeof p === 'object') { p.rot ??= [0, 0, 0]; p.op ??= 'add'; if (Array.isArray(p.size) && p.size.length === 2) p.size = [p.size[0], p.size[1], 0]; }
  if (o.op === 'paint' && o.layer && typeof o.layer === 'object') o.layer.opacity ??= 1;
  if (o.op === 'sculpt' && o.stroke && typeof o.stroke === 'object') o.stroke.strength ??= 0.5;
  if (o.op === 'batch' && Array.isArray(o.ops)) o.ops.forEach(normaliseOp);
}

/** One summary line of what a gap report costs, for logs. */
export const costLine = (r: GapReport) => Object.entries(gapCost(r.items)).filter(([, v]) => v > 0).map(([k, v]) => `${k} −${(v * 100).toFixed(1)}%`).join(', ') || 'no open gaps';

export { rgbToHex };
