// studio/pathfinder — Pathfinder panel and Shape Builder on Tela objects.
//
// Shape modes (Unite / Minus Front / Intersect / Exclude) produce one object; Pathfinders
// (Divide / Trim / Merge / Crop / Outline / Minus Back) produce many. Paint follows
// Illustrator: Unite, Intersect, Exclude and Minus Back take the TOPMOST operand's paint,
// Minus Front keeps the BACKMOST; Divide / Trim / Merge colour each piece by the topmost
// operand covering it; Outline strokes each edge in its owner's fill colour.
// Results are inserted at the z-position of the topmost operand, as one undo step.
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath } from '../geometry/model';
import type { Vec } from '../geometry/vec';
import { boolean, divide, pickRegion, mergeRegions, trim, merge, crop, minusBack, outline, resolve, type Region } from '../geometry/boolean';
import { pathOf, isPathish, withPath, primaryColor } from './objectGeom';
import { studioId } from './model';

export type ShapeMode = 'unite' | 'minusFront' | 'intersect' | 'exclude';
export type Pathfinder = 'divide' | 'trim' | 'merge' | 'crop' | 'outline' | 'minusBack';
export type PathfinderOp = ShapeMode | Pathfinder;

export const PATHFINDER_OPS: Array<{ id: PathfinderOp; label: string; group: 'shape' | 'pathfinder' }> = [
  { id: 'unite', label: 'Unite', group: 'shape' }, { id: 'minusFront', label: 'Minus Front', group: 'shape' },
  { id: 'intersect', label: 'Intersect', group: 'shape' }, { id: 'exclude', label: 'Exclude', group: 'shape' },
  { id: 'divide', label: 'Divide', group: 'pathfinder' }, { id: 'trim', label: 'Trim', group: 'pathfinder' },
  { id: 'merge', label: 'Merge', group: 'pathfinder' }, { id: 'crop', label: 'Crop', group: 'pathfinder' },
  { id: 'outline', label: 'Outline', group: 'pathfinder' }, { id: 'minusBack', label: 'Minus Back', group: 'pathfinder' },
];

interface Operand { o: TelaVectorObject; path: CompoundPath; index: number }
function operands(objects: TelaVectorObject[], ids: string[]): Operand[] {
  const set = new Set(ids);
  return objects.map((o, index) => ({ o, index })).filter(x => set.has(x.o.id) && isPathish(x.o) && !x.o.locked)
    .map(x => ({ ...x, path: pathOf(x.o)! })).filter(x => x.path && x.path.subpaths.length);
}
/** Closed-fill geometry of an operand (open subpaths contribute nothing to a fill). */
const fillGeom = (p: CompoundPath): CompoundPath => ({ fillRule: p.fillRule, subpaths: p.subpaths.filter(s => s.closed || s.anchors.length > 2).map(s => ({ ...s, closed: true })) });

/** A painted result piece built from `from` (keeps its paint/meta, new id unless `keepId`). */
function piece(from: TelaVectorObject, path: CompoundPath, keepId: boolean): TelaVectorObject {
  const o = withPath(from, path);
  // Pathfinder results are plain art: drop live source (it no longer matches) and symbol links.
  if (o.studio) { const s = { ...o.studio }; delete s.live; delete s.symbol; delete s.type; o.studio = Object.keys(s).length > 1 ? s : undefined; if (!o.studio) delete o.studio; }
  if (!keepId) o.id = studioId('obj');
  return o;
}

/** Replace the operands with `results`, inserted where the topmost operand was. */
function splice(objects: TelaVectorObject[], ops: Operand[], results: TelaVectorObject[]): TelaVectorObject[] {
  const drop = new Set(ops.map(x => x.o.id)); const top = Math.max(...ops.map(x => x.index));
  const out: TelaVectorObject[] = [];
  objects.forEach((o, i) => { if (!drop.has(o.id)) out.push(o); if (i === top) out.push(...results); });
  return out;
}

export interface PathfinderResult { objects: TelaVectorObject[]; selection: string[] }

export function applyPathfinder(objects: TelaVectorObject[], ids: string[], op: PathfinderOp): PathfinderResult | null {
  const ops = operands(objects, ids);
  if (ops.length < (op === 'outline' || op === 'divide' || op === 'trim' || op === 'merge' ? 1 : 2)) return null;
  const top = ops[ops.length - 1], back = ops[0];
  const fills = ops.map(x => fillGeom(x.path));
  let results: TelaVectorObject[] = [];
  switch (op) {
    case 'unite': results = [piece(top.o, boolean('union', fills), true)]; break;
    case 'intersect': results = [piece(top.o, boolean('intersect', fills), true)]; break;
    case 'exclude': results = [piece(top.o, boolean('exclude', fills), true)]; break;
    case 'minusFront': results = [piece(back.o, boolean('subtract', fills), true)]; break;
    case 'minusBack': results = [piece(top.o, minusBack(fills), true)]; break;
    case 'divide': {
      const regions = divide(fills);
      results = regions.map(r => piece(ops[topCover(r.coverage)].o, r.path, false));
      break;
    }
    case 'trim': case 'merge': case 'crop': {
      const stack = ops.map((x, i) => ({ path: fills[i], fill: primaryColor(x.o), i }));
      const out = op === 'trim' ? trim(stack) : op === 'merge' ? merge(stack) : crop(stack);
      results = out.map(s => piece(ops[s.i].o, s.path, false));
      break;
    }
    case 'outline': {
      results = outline(fills).map(e => {
        const src = ops[e.op].o; const o = piece(src, e.path, false);
        o.stroke = primaryColor(src); o.strokeWidth = Math.max(.5, src.strokeWidth || 1); o.fill = 'none'; o.gradient = undefined;
        if (o.geom) { o.geom = { ...o.geom }; delete o.geom.fill; delete o.geom.stroke; }
        return o;
      });
      break;
    }
  }
  results = results.filter(o => !!o.svgPathData);
  return { objects: splice(objects, ops, results), selection: results.map(o => o.id) };
}
/** Index of the topmost operand covering a region. */
const topCover = (cov: boolean[]) => { for (let i = cov.length - 1; i >= 0; i--) if (cov[i]) return i; return 0; };

// ── Shape Builder ───────────────────────────────────────────────────────────────────

export interface ShapeBuilderSession { ids: string[]; regions: Region[]; paintOf: number[] }

/** Start a shape-builder session over the selected closed shapes (regions computed once). */
export function shapeBuilderStart(objects: TelaVectorObject[], ids: string[]): ShapeBuilderSession | null {
  const ops = operands(objects, ids); if (!ops.length) return null;
  const regions = divide(ops.map(x => fillGeom(x.path)));
  return { ids: ops.map(x => x.o.id), regions, paintOf: regions.map(r => topCover(r.coverage)) };
}
export const shapeBuilderPick = (s: ShapeBuilderSession, p: Vec) => pickRegion(s.regions, p);

/**
 * Finish a drag: merge the picked regions (or delete them with Alt). Every other region
 * survives as its own piece coloured by its topmost operand, so the art looks unchanged
 * apart from what was built.
 */
export function shapeBuilderCommit(objects: TelaVectorObject[], s: ShapeBuilderSession, picked: number[], erase = false): PathfinderResult | null {
  const ops = operands(objects, s.ids); if (!ops.length || !picked.length) return null;
  const pickSet = new Set(picked);
  const results: TelaVectorObject[] = [];
  s.regions.forEach((r, i) => { if (!pickSet.has(i)) results.push(piece(ops[s.paintOf[i]].o, r.path, false)); });
  if (!erase) {
    const merged = resolve(mergeRegions(s.regions, picked), 'nonzero');
    const src = ops[s.paintOf[picked[0]]].o;
    results.push(piece(src, merged, false));
  }
  const out = results.filter(o => !!o.svgPathData);
  return { objects: splice(objects, ops, out), selection: out.slice(-1).map(o => o.id) };
}
