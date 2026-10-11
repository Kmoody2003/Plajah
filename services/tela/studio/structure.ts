// studio/structure — groups (nested), isolation, z-order, lock/hide, clipping masks,
// compound paths and the Layers tree.
//
// Storage stays native to Tela: an object's `groupId` is its INNERMOST group (the field every
// renderer, Aria and the template engine already understand), and nesting lives in the
// device's `studio.groups` table as parent links. A groupId with no table entry (templates,
// Scene.group output, older docs) is simply a top-level group. Groups are kept contiguous in
// the z-stack like Illustrator, so a group is always one slice of `objects`.
//
// Clipping mask (Ctrl+7): the TOPMOST selected object becomes the clip path (no paint, flagged
// studio.clipMask) and every other member gets `geom.clip` — the canonical serialiser already
// clips with it, so exports/Fabula/letters show the mask without knowing about groups.
import type { TelaVectorObject } from '../../../types';
import type { TelaStudioDeviceExt, StudioGroup } from './model';
import { studioId } from './model';
import { objectMatrix, pathOf, isPathish } from './objectGeom';
import { invert, transformPath } from '../geometry/transform';
import { toPathData } from '../geometry/pathData';
import { boolean } from '../geometry/boolean';
import type { CompoundPath } from '../geometry/model';
import { pathToObject } from '../geometry/tela';

export type Groups = Record<string, StudioGroup>;

/** The chain of group ids from innermost to outermost for an object. */
export function groupChain(o: TelaVectorObject, groups: Groups): string[] {
  const out: string[] = []; let g = o.groupId; const seen = new Set<string>();
  while (g && !seen.has(g)) { out.push(g); seen.add(g); g = groups[g]?.parent; }
  return out;
}
/** Is group `inner` inside (or equal to) group `outer`? */
export function groupWithin(inner: string, outer: string, groups: Groups): boolean {
  let g: string | undefined = inner; const seen = new Set<string>();
  while (g && !seen.has(g)) { if (g === outer) return true; seen.add(g); g = groups[g]?.parent; }
  return false;
}
/** Members (object ids) of a group, deep. */
export function groupMembers(objects: TelaVectorObject[], groupId: string, groups: Groups): string[] {
  return objects.filter(o => o.groupId && groupWithin(o.groupId, groupId, groups)).map(o => o.id);
}

/**
 * What a click on `id` selects with the Selection tool: the whole outermost group (or, in
 * isolation mode inside group `iso`, the child of `iso` that contains it).
 */
export function selectionUnit(objects: TelaVectorObject[], id: string, groups: Groups, iso?: string | null): string[] {
  const o = objects.find(x => x.id === id); if (!o) return [];
  const chain = groupChain(o, groups);
  let unit: string | undefined;
  if (iso) { const i = chain.indexOf(iso); if (i < 0) return [id]; unit = i > 0 ? chain[i - 1] : undefined; }
  else unit = chain[chain.length - 1];
  return unit ? groupMembers(objects, unit, groups) : [id];
}
/** Expand ids to whole selection units (used after marquee). */
export function expandUnits(objects: TelaVectorObject[], ids: string[], groups: Groups, iso?: string | null): string[] {
  const out = new Set<string>(); for (const id of ids) for (const x of selectionUnit(objects, id, groups, iso)) out.add(x);
  return objects.filter(o => out.has(o.id)).map(o => o.id);
}

/** Move `ids` so they sit contiguously at the z-position of the topmost of them. */
export function gatherContiguous(objects: TelaVectorObject[], ids: Set<string>): TelaVectorObject[] {
  const idx = objects.map((o, i) => ids.has(o.id) ? i : -1).filter(i => i >= 0); if (!idx.length) return objects;
  const top = idx[idx.length - 1]; const members = idx.map(i => objects[i]);
  const rest = objects.filter(o => !ids.has(o.id));
  const insertAt = top + 1 - members.length; // index in `rest`
  return [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
}

/** Ctrl+G. Returns the new objects + groups and the new group id. */
export function groupSelection(objects: TelaVectorObject[], groups: Groups, ids: string[], name?: string, iso?: string | null): { objects: TelaVectorObject[]; groups: Groups; groupId: string } | null {
  if (ids.length < 1) return null;
  const sel = new Set(ids);
  const gid = studioId('grp'); const G: Groups = { ...groups };
  const parent = iso ?? undefined;
  G[gid] = { id: gid, name: name ?? `Group ${Object.keys(groups).length + 1}`, parent };
  const tops = new Set<string>();
  const next = objects.map(o => {
    if (!sel.has(o.id)) return o;
    const chain = groupChain(o, groups);
    // The group directly below the isolation level (or the outermost) gets re-parented.
    const lvl = iso ? chain.indexOf(iso) : chain.length;
    const top = lvl > 0 ? chain[lvl - 1] : undefined;
    if (top) { tops.add(top); return o; }
    return { ...o, groupId: gid };
  });
  for (const t of tops) G[t] = { ...(G[t] ?? { id: t }), parent: gid };
  return { objects: gatherContiguous(next, sel), groups: G, groupId: gid };
}

/** Ctrl+Shift+G: remove one level of grouping from the selected units. Releases clip groups. */
export function ungroupSelection(objects: TelaVectorObject[], groups: Groups, ids: string[], iso?: string | null): { objects: TelaVectorObject[]; groups: Groups } {
  const sel = objects.filter(o => ids.includes(o.id)); const G: Groups = { ...groups };
  const targets = new Set<string>();
  for (const o of sel) { const chain = groupChain(o, groups); const lvl = iso ? chain.indexOf(iso) : chain.length; const top = lvl > 0 ? chain[lvl - 1] : undefined; if (top) targets.add(top); }
  let next = objects;
  for (const t of targets) {
    if (G[t]?.clip) next = releaseClip(next, G, t);
    const parent = G[t]?.parent;
    next = next.map(o => o.groupId === t ? (parent ? { ...o, groupId: parent } : withoutGroup(o)) : o);
    for (const g of Object.values(G)) if (g.parent === t) G[g.id] = { ...g, parent };
    delete G[t];
  }
  return { objects: next, groups: G };
}
const withoutGroup = (o: TelaVectorObject): TelaVectorObject => { const n = { ...o }; delete n.groupId; return n; };

// ── Clipping masks ──────────────────────────────────────────────────────────────────

/** Artboard path of a clip object. */
function clipPathOf(o: TelaVectorObject): CompoundPath | null { return isPathish(o) ? pathOf(o) : null; }

/** Recompute `geom.clip` for every member of every clip group (after any edit). */
export function syncClips(objects: TelaVectorObject[], groups: Groups): TelaVectorObject[] {
  const clipGroups = Object.values(groups).filter(g => g.clip);
  if (!clipGroups.length && !objects.some(o => o.studio?.clippedBy)) return objects;
  const clipFor = new Map<string, { path: CompoundPath; by: string }>(); // object id → artboard clip (nested masks intersect)
  for (const g of clipGroups) {
    const mask = objects.find(o => o.studio?.clipMask && o.groupId === g.id); if (!mask) continue;
    const mp = clipPathOf(mask); if (!mp) continue;
    for (const id of groupMembers(objects, g.id, groups)) {
      if (id === mask.id) continue;
      const prev = clipFor.get(id); clipFor.set(id, { path: prev ? boolean('intersect', [prev.path, mp]) : mp, by: prev?.by ?? g.id });
    }
  }
  return objects.map(o => {
    const c = clipFor.get(o.id);
    if (!c) {
      if (!o.studio?.clippedBy) return o;
      const n = { ...o }; const g = { ...(n.geom ?? { v: 1 as const }) }; delete g.clip; n.geom = g;
      const s = { ...o.studio }; delete s.clippedBy; n.studio = Object.keys(s).length > 1 ? s : undefined; if (!n.studio) delete n.studio;
      return n;
    }
    const local = o.kind === 'PATH' && o.svgPathData ? transformPath(c.path, invert(objectMatrix(o))) : c.path;
    const d = toPathData(local);
    if (o.geom?.clip?.d === d && o.studio?.clippedBy === c.by) return o;
    return { ...o, geom: { ...(o.geom ?? { v: 1 }), clip: { d, fillRule: c.path.fillRule } }, studio: { ...(o.studio ?? { v: 1 as const }), clippedBy: c.by } };
  });
}

/** Ctrl+7: the topmost selected object clips the rest. */
export function makeClipMask(objects: TelaVectorObject[], groups: Groups, ids: string[], iso?: string | null): { objects: TelaVectorObject[]; groups: Groups; groupId: string } | null {
  const sel = objects.filter(o => ids.includes(o.id)); if (sel.length < 2) return null;
  const mask = sel[sel.length - 1]; if (!isPathish(mask)) return null;
  const grouped = groupSelection(objects, groups, ids, 'Clip group', iso); if (!grouped) return null;
  grouped.groups[grouped.groupId] = { ...grouped.groups[grouped.groupId], clip: true };
  const marked = grouped.objects.map(o => o.id === mask.id ? { ...o, groupId: grouped.groupId, fill: 'none', stroke: 'none', gradient: undefined, studio: { ...(o.studio ?? { v: 1 as const }), clipMask: true } } : o);
  return { objects: syncClips(marked, grouped.groups), groups: grouped.groups, groupId: grouped.groupId };
}
/** Ctrl+Alt+7: release the clip group (mask stays as an unpainted path, members unclipped). */
export function releaseClip(objects: TelaVectorObject[], groups: Groups, groupId: string): TelaVectorObject[] {
  const members = new Set(groupMembers(objects, groupId, groups));
  groups[groupId] = { ...(groups[groupId] ?? { id: groupId }), clip: false };
  return objects.map(o => {
    if (!members.has(o.id)) return o;
    const n = { ...o };
    if (n.studio?.clipMask) { const s = { ...n.studio }; delete s.clipMask; n.studio = Object.keys(s).length > 1 ? s : undefined; if (!n.studio) delete n.studio; }
    else if (n.studio?.clippedBy) { const g = { ...(n.geom ?? { v: 1 as const }) }; delete g.clip; n.geom = g; const s = { ...n.studio }; delete s.clippedBy; n.studio = Object.keys(s).length > 1 ? s : undefined; if (!n.studio) delete n.studio; }
    return n;
  });
}

// ── Z-order ─────────────────────────────────────────────────────────────────────────

export type Arrange = 'front' | 'forward' | 'backward' | 'back';
/** Arrange the selection (kept in relative order). */
export function arrange(objects: TelaVectorObject[], ids: string[], how: Arrange): TelaVectorObject[] {
  const sel = new Set(ids); if (!sel.size) return objects;
  const moving = objects.filter(o => sel.has(o.id)); const rest = objects.filter(o => !sel.has(o.id));
  if (how === 'front') return [...rest, ...moving];
  if (how === 'back') return [...moving, ...rest];
  const next = objects.slice();
  if (how === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) if (sel.has(next[i].id) && !sel.has(next[i + 1].id)) { const t = next[i]; next[i] = next[i + 1]; next[i + 1] = t; }
  } else {
    for (let i = 1; i < next.length; i++) if (sel.has(next[i].id) && !sel.has(next[i - 1].id)) { const t = next[i]; next[i] = next[i - 1]; next[i - 1] = t; }
  }
  return next;
}
/** Layers-panel drag: move `ids` to sit just above (in z) the object `beforeId` (null = to front). */
export function moveTo(objects: TelaVectorObject[], ids: string[], aboveId: string | null, intoGroup?: string | null): TelaVectorObject[] {
  const sel = new Set(ids); const moving = objects.filter(o => sel.has(o.id)).map(o => intoGroup === undefined ? o : intoGroup ? { ...o, groupId: intoGroup } : withoutGroup(o));
  const rest = objects.filter(o => !sel.has(o.id));
  if (aboveId === null) return [...rest, ...moving];
  const i = rest.findIndex(o => o.id === aboveId); if (i < 0) return objects;
  return [...rest.slice(0, i + 1), ...moving, ...rest.slice(i + 1)];
}

// ── Compound paths (Ctrl+8 / Ctrl+Alt+8) ────────────────────────────────────────────

/** Make compound path: all selected paths become one object (paint of the topmost), evenodd holes. */
export function makeCompound(objects: TelaVectorObject[], ids: string[]): TelaVectorObject[] | null {
  const sel = objects.filter(o => ids.includes(o.id) && isPathish(o)); if (sel.length < 2) return null;
  const top = sel[sel.length - 1];
  const subs = sel.flatMap(o => pathOf(o)?.subpaths ?? []);
  const merged = pathToObject({ fillRule: 'evenodd', subpaths: subs }, { fill: 'none' }, top.id);
  const obj: TelaVectorObject = { ...top, kind: 'PATH', x: merged.x, y: merged.y, w: merged.w, h: merged.h, rotation: 0, svgPathData: merged.svgPathData, pathOriginX: merged.pathOriginX, pathOriginY: merged.pathOriginY, pathOriginW: merged.pathOriginW, pathOriginH: merged.pathOriginH, pathClosed: merged.pathClosed, points: undefined, pathNodes: undefined, geom: { ...(top.geom ?? { v: 1 }), v: 1, fillRule: 'evenodd', fill: undefined, stroke: undefined, clip: undefined } };
  if (top.geom?.fill && typeof top.geom.fill === 'string') obj.geom!.fill = top.geom.fill;
  const drop = new Set(sel.map(o => o.id)); drop.delete(top.id);
  return objects.filter(o => !drop.has(o.id)).map(o => o.id === top.id ? obj : o);
}
/** Release compound path: each subpath becomes its own object with the same paint. */
export function releaseCompound(objects: TelaVectorObject[], id: string): TelaVectorObject[] | null {
  const o = objects.find(x => x.id === id); const p = o ? pathOf(o) : null; if (!o || !p || p.subpaths.length < 2) return null;
  const parts = p.subpaths.map((s, i) => {
    const one = pathToObject({ fillRule: 'nonzero', subpaths: [s] }, {}, i === 0 ? o.id : `${o.id}_${i}`);
    return { ...o, id: one.id, kind: 'PATH' as const, x: one.x, y: one.y, w: one.w, h: one.h, rotation: 0, svgPathData: one.svgPathData, pathOriginX: one.x, pathOriginY: one.y, pathOriginW: one.w, pathOriginH: one.h, pathClosed: s.closed, points: undefined, pathNodes: undefined, geom: o.geom ? { ...o.geom, fillRule: 'nonzero' as const, clip: o.geom.clip } : undefined };
  });
  const i = objects.indexOf(o);
  return [...objects.slice(0, i), ...parts, ...objects.slice(i + 1)];
}

// ── Layers tree ─────────────────────────────────────────────────────────────────────

export type LayerNode =
  | { type: 'object'; id: string; depth: number }
  | { type: 'group'; id: string; name: string; depth: number; clip: boolean; collapsed: boolean; members: string[]; children: LayerNode[] };

/** Front-to-back tree of groups and objects (what the Layers panel draws). */
export function layerTree(objects: TelaVectorObject[], groups: Groups): LayerNode[] {
  const root: LayerNode[] = []; const nodes = new Map<string, Extract<LayerNode, { type: 'group' }>>();
  const ensure = (gid: string): Extract<LayerNode, { type: 'group' }> => {
    let n = nodes.get(gid); if (n) return n;
    const g = groups[gid]; const parent = g?.parent;
    const depth = parent ? ensure(parent).depth + 1 : 0;
    n = { type: 'group', id: gid, name: g?.name ?? 'Group', depth, clip: !!g?.clip, collapsed: !!g?.collapsed, members: [], children: [] };
    nodes.set(gid, n);
    (parent ? ensure(parent).children : root).push(n);
    return n;
  };
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (!o.groupId) { root.push({ type: 'object', id: o.id, depth: 0 }); continue; }
    const g = ensure(o.groupId); g.children.push({ type: 'object', id: o.id, depth: g.depth + 1 });
    for (let p: string | undefined = o.groupId; p; p = groups[p]?.parent) { const n = nodes.get(p); if (n) n.members.push(o.id); if (groups[p]?.parent === p) break; }
  }
  return root;
}
/** Flatten the tree to visible rows (collapsed groups hide their children). */
export function layerRows(tree: LayerNode[]): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (ns: LayerNode[]) => { for (const n of ns) { out.push(n); if (n.type === 'group' && !n.collapsed) walk(n.children); } };
  walk(tree); return out;
}

/** Device studio helpers. */
export const groupsOf = (studio?: TelaStudioDeviceExt): Groups => studio?.groups ?? {};

// ── Duplication (Alt-drag, paste) ───────────────────────────────────────────────────

/**
 * Copies of `ids` with fresh object ids and fresh (structure-preserving) group ids, so a
 * duplicated group is its own group with the same nesting and clip setup.
 */
export function duplicateObjects(source: TelaVectorObject[], groups: Groups, idPrefix = 'obj'): { objects: TelaVectorObject[]; groups: Groups; map: Map<string, string> } {
  const gmap = new Map<string, string>(); const G: Groups = {};
  const remapGroup = (g: string | undefined): string | undefined => {
    if (!g) return undefined;
    let n = gmap.get(g); if (n) return n;
    n = studioId('grp'); gmap.set(g, n);
    const def = groups[g]; G[n] = { ...(def ?? { id: g }), id: n, parent: def?.parent ? remapGroup(def.parent) : undefined };
    return n;
  };
  const map = new Map<string, string>();
  const objects = source.map(o => {
    const id = studioId(idPrefix); map.set(o.id, id);
    const n: TelaVectorObject = { ...o, id, groupId: remapGroup(o.groupId) };
    if (!n.groupId) delete n.groupId;
    if (n.studio?.symbol) { const inst = remapGroup(n.studio.symbol.instance) ?? n.studio.symbol.instance; n.studio = { ...n.studio, symbol: { ...n.studio.symbol, instance: inst } }; }
    if (n.studio?.clippedBy) n.studio = { ...n.studio, clippedBy: remapGroup(n.studio.clippedBy) };
    return n;
  });
  // Threads: keep links inside the copy, drop links to frames that were not copied.
  for (const n of objects) {
    const t = n.studio?.type; if (!t) continue;
    const next = t.threadNext ? map.get(t.threadNext) : undefined, prev = t.threadPrev ? map.get(t.threadPrev) : undefined;
    if (t.threadNext !== next || t.threadPrev !== prev) n.studio = { ...n.studio!, type: { ...t, threadNext: next, threadPrev: prev } };
  }
  return { objects, groups: G, map };
}
