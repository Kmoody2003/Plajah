// studio/symbols — define a symbol, place instances, edit the master, update every instance.
//
// An instance is EXPANDED into ordinary member objects (one group per instance), each tagged
// studio.symbol = { id, instance, member, matrix }. That keeps every renderer that knows only
// Tela objects (Fabula, The Post Man, exports, thumbnails) drawing instances correctly, while
// the editor can rebuild all instances from the master. The instance matrix follows every
// transform (objectGeom.transformObject / translateObject compose it), so re-expanding an
// instance after a master edit puts it exactly where the user left it.
import type { TelaVectorObject } from '../../../types';
import type { Matrix } from '../geometry/model';
import { translate, multiply, invert } from '../geometry/transform';
import type { StudioSymbol } from './model';
import { studioId } from './model';
import { boundsOf, unionBounds, transformObject, translateObject } from './objectGeom';
import type { Groups } from './structure';
import { gatherContiguous } from './structure';

const strip = (o: TelaVectorObject): TelaVectorObject => {
  const n = { ...o }; delete n.groupId;
  if (n.studio) { const s = { ...n.studio }; delete s.symbol; delete s.clippedBy; n.studio = Object.keys(s).length > 1 ? s : undefined; if (!n.studio) delete n.studio; }
  return n;
};

/** Expand one instance of `sym` with `matrix` (master space → artboard). */
export function expandInstance(sym: StudioSymbol, matrix: Matrix, instance: string, groupId: string): TelaVectorObject[] {
  return sym.objects.map((m, i) => {
    const placed = transformObject({ ...m, id: `${instance}_${i}` }, matrix);
    return { ...placed, groupId, objectLabel: m.objectLabel ?? sym.name, studio: { ...(placed.studio ?? { v: 1 as const }), symbol: { id: sym.id, instance, member: i, matrix } } };
  });
}

/**
 * New symbol from the selection: the master is the art moved to (0,0); the selection is
 * replaced in place by an instance of it (so nothing moves on screen).
 */
export function defineSymbol(objects: TelaVectorObject[], groups: Groups, ids: string[], name: string): { objects: TelaVectorObject[]; groups: Groups; symbol: StudioSymbol; instance: string } | null {
  const sel = objects.filter(o => ids.includes(o.id)); if (!sel.length) return null;
  const b = unionBounds(sel.map(boundsOf))!;
  const symbol: StudioSymbol = { id: studioId('sym'), name, w: b.w, h: b.h, objects: sel.map((o, i) => ({ ...translateObject(strip(o), -b.x, -b.y), id: `m${i}` })) };
  const instance = studioId('inst'); const groupId = instance;
  const placed = expandInstance(symbol, translate(b.x, b.y), instance, groupId);
  const rest = objects.filter(o => !ids.includes(o.id));
  const top = objects.reduce((m, o, i) => ids.includes(o.id) ? i : m, -1);
  const insertAt = top + 1 - sel.length; // the topmost member's slot, counted in `rest`
  const next = [...rest.slice(0, insertAt), ...placed, ...rest.slice(insertAt)];
  return { objects: next, groups: { ...groups, [groupId]: { id: groupId, name: `${name} instance` } }, symbol, instance };
}

/** Place a new instance centred at `at`. */
export function placeInstance(objects: TelaVectorObject[], groups: Groups, sym: StudioSymbol, at: { x: number; y: number }): { objects: TelaVectorObject[]; groups: Groups; ids: string[] } {
  const instance = studioId('inst');
  const placed = expandInstance(sym, translate(at.x - sym.w / 2, at.y - sym.h / 2), instance, instance);
  return { objects: [...objects, ...placed], groups: { ...groups, [instance]: { id: instance, name: `${sym.name} instance` } }, ids: placed.map(o => o.id) };
}

/** Instances present in the document for a symbol: instance id → member objects (z-order). */
export function instancesOf(objects: TelaVectorObject[], symbolId: string): Map<string, TelaVectorObject[]> {
  const out = new Map<string, TelaVectorObject[]>();
  for (const o of objects) { const s = o.studio?.symbol; if (s && s.id === symbolId) (out.get(s.instance) ?? out.set(s.instance, []).get(s.instance)!).push(o); }
  return out;
}

/** Re-expand every instance of `sym` from its master (after the master changed). */
export function syncInstances(objects: TelaVectorObject[], sym: StudioSymbol): TelaVectorObject[] {
  const inst = instancesOf(objects, sym.id); if (!inst.size) return objects;
  let out = objects;
  for (const [instance, members] of inst) {
    const matrix = members[0].studio!.symbol!.matrix; const groupId = members[0].groupId ?? instance;
    const fresh = expandInstance(sym, matrix, instance, groupId);
    const first = out.findIndex(o => o.studio?.symbol?.instance === instance);
    const rest = out.filter(o => o.studio?.symbol?.instance !== instance);
    const at = out.slice(0, first).filter(o => o.studio?.symbol?.instance !== instance).length;
    out = [...rest.slice(0, at), ...fresh, ...rest.slice(at)];
  }
  return out;
}

/**
 * Edit master: the user edited one instance in isolation; its members (mapped back through
 * the inverse instance matrix) become the new master, and every instance is rebuilt.
 */
export function masterFromInstance(objects: TelaVectorObject[], sym: StudioSymbol, instance: string): StudioSymbol | null {
  const members = objects.filter(o => o.studio?.symbol?.instance === instance || (o.groupId === instance && !o.studio?.symbol));
  if (!members.length) return null;
  const tagged = members.find(o => o.studio?.symbol)?.studio!.symbol!;
  const inv = invert(tagged.matrix);
  const master = members.map((o, i) => ({ ...transformObject(strip(o), inv), id: `m${i}` }));
  const b = unionBounds(master.map(boundsOf)) ?? { x: 0, y: 0, w: sym.w, h: sym.h };
  return { ...sym, objects: master, w: b.w, h: b.h };
}

/** Break link to symbol: members become plain art (they keep their group). */
export function breakLink(objects: TelaVectorObject[], ids: string[]): TelaVectorObject[] {
  const inst = new Set(objects.filter(o => ids.includes(o.id)).map(o => o.studio?.symbol?.instance).filter(Boolean) as string[]);
  return objects.map(o => o.studio?.symbol && inst.has(o.studio.symbol.instance) ? (() => { const n = { ...o }; const s = { ...o.studio! }; delete s.symbol; n.studio = Object.keys(s).length > 1 ? s : undefined; if (!n.studio) delete n.studio; return n; })() : o);
}

/** Matrix helper for tests and the panel (master → artboard placement of an instance). */
export const instanceMatrix = (objects: TelaVectorObject[], instance: string): Matrix | null => objects.find(o => o.studio?.symbol?.instance === instance)?.studio?.symbol?.matrix ?? null;
export { multiply as composeMatrix, gatherContiguous };
