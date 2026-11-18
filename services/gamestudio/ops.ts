// The Game Studio edit list (plan §3.2): the ONLY way a Game Project changes. Buttons in the rooms and
// Aria's tools call these same ops, so a prompt and a hand edit are the same thing: both can be undone, both
// show in the history as a plain sentence, and both reach the running game the same way.
//
// applyOp is pure: it returns a new project and the op that undoes it. Nothing here touches the DOM.

import type { GameLevel, GameProject, Instance, Look, Marker, MarkerKind, Rule, Zone } from './schema';

export type Op =
  | { op: 'setProjectName'; name: string }
  | { op: 'addLevel'; level: GameLevel; index?: number }
  | { op: 'removeLevel'; levelId: string }
  | { op: 'setStartLevel'; levelId: string }
  | { op: 'renameLevel'; levelId: string; name: string }
  | { op: 'setLook'; levelId: string; look: Look }
  | { op: 'addMarker'; levelId: string; marker: Marker; index?: number }
  | { op: 'removeMarker'; levelId: string; markerId: string }
  | { op: 'updateMarker'; levelId: string; markerId: string; patch: Partial<Omit<Marker, 'id'>> }
  /** Replace every marker of one kind (take a kind over from the module's defaults, or hand it back with []). */
  | { op: 'setMarkersOfKind'; levelId: string; kind: MarkerKind; markers: Marker[] }
  | { op: 'putZone'; levelId: string; zone: Zone }
  | { op: 'removeZone'; levelId: string; zoneId: string }
  | { op: 'putInstance'; levelId: string; instance: Instance }
  | { op: 'removeInstance'; levelId: string; instanceId: string }
  | { op: 'putRule'; levelId: string; rule: Rule }
  | { op: 'removeRule'; levelId: string; ruleId: string }
  /** Several ops undone as one step ("Aria laid out the arena"). */
  | { op: 'batch'; label: string; ops: Op[] };

export interface Applied { project: GameProject; inverse: Op }

export class OpError extends Error {}

const KIND_WORD: Record<MarkerKind, [string, string]> = {
  spawn: ['spawn', 'spawns'], enemySpot: ['enemy spot', 'enemy spots'], controlPoint: ['control point', 'control points'],
  pickup: ['pickup', 'pickups'], camera: ['camera', 'cameras'],
};

function levelOf(p: GameProject, id: string): [GameLevel, number] {
  const i = p.levels.findIndex(l => l.id === id);
  if (i < 0) throw new OpError(`No level "${id}".`);
  return [p.levels[i], i];
}

function withLevel(p: GameProject, id: string, fn: (l: GameLevel) => GameLevel): GameProject {
  const [l, i] = levelOf(p, id);
  const levels = p.levels.slice(); levels[i] = fn(l);
  return { ...p, levels };
}

/** Put an item with this id in a list (replace in place, or append), returning the previous item if any. */
function put<T extends { id: string }>(list: T[], item: T): [T[], T | undefined] {
  const i = list.findIndex(x => x.id === item.id);
  if (i < 0) return [[...list, item], undefined];
  const out = list.slice(); const prev = out[i]; out[i] = item; return [out, prev];
}

export function applyOp(p: GameProject, o: Op): Applied {
  switch (o.op) {
    case 'setProjectName': {
      if (!o.name.trim()) throw new OpError('A project needs a name.');
      return { project: { ...p, name: o.name }, inverse: { op: 'setProjectName', name: p.name } };
    }
    case 'addLevel': {
      if (p.levels.some(l => l.id === o.level.id)) throw new OpError(`Level "${o.level.id}" already exists.`);
      const levels = p.levels.slice(); levels.splice(o.index ?? levels.length, 0, o.level);
      return { project: { ...p, levels }, inverse: { op: 'removeLevel', levelId: o.level.id } };
    }
    case 'removeLevel': {
      const [l, i] = levelOf(p, o.levelId);
      if (p.levels.length === 1) throw new OpError('A project keeps at least one level.');
      const levels = p.levels.filter(x => x.id !== o.levelId);
      const startLevel = p.startLevel === o.levelId ? levels[0].id : p.startLevel;
      const inverse: Op = p.startLevel === o.levelId
        ? { op: 'batch', label: `Restore level ${l.name}`, ops: [{ op: 'addLevel', level: l, index: i }, { op: 'setStartLevel', levelId: l.id }] }
        : { op: 'addLevel', level: l, index: i };
      return { project: { ...p, levels, startLevel }, inverse };
    }
    case 'setStartLevel': {
      levelOf(p, o.levelId);
      return { project: { ...p, startLevel: o.levelId }, inverse: { op: 'setStartLevel', levelId: p.startLevel } };
    }
    case 'renameLevel': {
      const [l] = levelOf(p, o.levelId);
      return { project: withLevel(p, o.levelId, x => ({ ...x, name: o.name })), inverse: { op: 'renameLevel', levelId: o.levelId, name: l.name } };
    }
    case 'setLook': {
      const [l] = levelOf(p, o.levelId);
      // Undefined in the patch clears a field (back to the module's look).
      const look: Look = { ...l.look };
      const before: Look = {};
      for (const k of Object.keys(o.look) as (keyof Look)[]) {
        (before as any)[k] = l.look[k];
        if (o.look[k] === undefined) delete look[k]; else (look as any)[k] = o.look[k];
      }
      return { project: withLevel(p, o.levelId, x => ({ ...x, look })), inverse: { op: 'setLook', levelId: o.levelId, look: before } };
    }
    case 'addMarker': {
      const [l] = levelOf(p, o.levelId);
      if (l.markers.some(m => m.id === o.marker.id)) throw new OpError(`Marker "${o.marker.id}" already exists.`);
      const markers = l.markers.slice(); markers.splice(o.index ?? markers.length, 0, o.marker);
      return { project: withLevel(p, o.levelId, x => ({ ...x, markers })), inverse: { op: 'removeMarker', levelId: o.levelId, markerId: o.marker.id } };
    }
    case 'removeMarker': {
      const [l] = levelOf(p, o.levelId);
      const i = l.markers.findIndex(m => m.id === o.markerId);
      if (i < 0) throw new OpError(`No marker "${o.markerId}".`);
      return { project: withLevel(p, o.levelId, x => ({ ...x, markers: x.markers.filter(m => m.id !== o.markerId) })), inverse: { op: 'addMarker', levelId: o.levelId, marker: l.markers[i], index: i } };
    }
    case 'updateMarker': {
      const [l] = levelOf(p, o.levelId);
      const m = l.markers.find(x => x.id === o.markerId);
      if (!m) throw new OpError(`No marker "${o.markerId}".`);
      const before: Partial<Marker> = {};
      for (const k of Object.keys(o.patch) as (keyof Marker)[]) (before as any)[k] = m[k];
      const next = { ...m, ...o.patch } as Marker;
      for (const k of Object.keys(next) as (keyof Marker)[]) if (next[k] === undefined) delete next[k];
      return { project: withLevel(p, o.levelId, x => ({ ...x, markers: x.markers.map(y => y.id === o.markerId ? next : y) })), inverse: { op: 'updateMarker', levelId: o.levelId, markerId: o.markerId, patch: before } };
    }
    case 'setMarkersOfKind': {
      const [l] = levelOf(p, o.levelId);
      if (o.markers.some(m => m.kind !== o.kind)) throw new OpError('Every marker must be of the kind being set.');
      const prev = l.markers.filter(m => m.kind === o.kind);
      const ids = new Set(l.markers.filter(m => m.kind !== o.kind).map(m => m.id));
      for (const m of o.markers) { if (ids.has(m.id)) throw new OpError(`Marker id "${m.id}" is already used.`); ids.add(m.id); }
      const markers = [...l.markers.filter(m => m.kind !== o.kind), ...o.markers];
      return { project: withLevel(p, o.levelId, x => ({ ...x, markers })), inverse: { op: 'setMarkersOfKind', levelId: o.levelId, kind: o.kind, markers: prev } };
    }
    case 'putZone': {
      const [l] = levelOf(p, o.levelId);
      const [zones, prev] = put(l.zones, o.zone);
      return { project: withLevel(p, o.levelId, x => ({ ...x, zones })), inverse: prev ? { op: 'putZone', levelId: o.levelId, zone: prev } : { op: 'removeZone', levelId: o.levelId, zoneId: o.zone.id } };
    }
    case 'removeZone': {
      const [l] = levelOf(p, o.levelId);
      const z = l.zones.find(x => x.id === o.zoneId);
      if (!z) throw new OpError(`No zone "${o.zoneId}".`);
      return { project: withLevel(p, o.levelId, x => ({ ...x, zones: x.zones.filter(y => y.id !== o.zoneId) })), inverse: { op: 'putZone', levelId: o.levelId, zone: z } };
    }
    case 'putInstance': {
      const [l] = levelOf(p, o.levelId);
      const [instances, prev] = put(l.instances, o.instance);
      return { project: withLevel(p, o.levelId, x => ({ ...x, instances })), inverse: prev ? { op: 'putInstance', levelId: o.levelId, instance: prev } : { op: 'removeInstance', levelId: o.levelId, instanceId: o.instance.id } };
    }
    case 'removeInstance': {
      const [l] = levelOf(p, o.levelId);
      const n = l.instances.find(x => x.id === o.instanceId);
      if (!n) throw new OpError(`No instance "${o.instanceId}".`);
      return { project: withLevel(p, o.levelId, x => ({ ...x, instances: x.instances.filter(y => y.id !== o.instanceId) })), inverse: { op: 'putInstance', levelId: o.levelId, instance: n } };
    }
    case 'putRule': {
      const [l] = levelOf(p, o.levelId);
      const [rules, prev] = put(l.rules, o.rule);
      return { project: withLevel(p, o.levelId, x => ({ ...x, rules })), inverse: prev ? { op: 'putRule', levelId: o.levelId, rule: prev } : { op: 'removeRule', levelId: o.levelId, ruleId: o.rule.id } };
    }
    case 'removeRule': {
      const [l] = levelOf(p, o.levelId);
      const r = l.rules.find(x => x.id === o.ruleId);
      if (!r) throw new OpError(`No rule "${o.ruleId}".`);
      return { project: withLevel(p, o.levelId, x => ({ ...x, rules: x.rules.filter(y => y.id !== o.ruleId) })), inverse: { op: 'putRule', levelId: o.levelId, rule: r } };
    }
    case 'batch': {
      let cur = p;
      const inverses: Op[] = [];
      for (const sub of o.ops) { const a = applyOp(cur, sub); cur = a.project; inverses.unshift(a.inverse); }
      return { project: cur, inverse: { op: 'batch', label: `Undo: ${o.label}`, ops: inverses } };
    }
  }
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const markerName = (l: GameLevel | undefined, id: string, fallback?: Marker) => {
  const m = l?.markers.find(x => x.id === id) ?? fallback;
  return m ? markerLabel(m) : id;
};

/** A marker's display name: its own name, "Team A spawn", or "enemy spot 3". */
export function markerLabel(m: Marker): string {
  if (m.name) return m.name;
  if (m.kind === 'spawn') return `Team ${(m.team ?? 'a').toUpperCase()} spawn`;
  const n = m.id.match(/(\d+)$/)?.[1];
  return n !== undefined ? `${KIND_WORD[m.kind][0]} ${Number(n) + 1}` : `${KIND_WORD[m.kind][0]} ${m.id}`;
}

/** The op as a plain sentence for the history panel, read against the project BEFORE it applied. */
export function describeOp(p: GameProject, o: Op): string {
  const lv = 'levelId' in o ? p.levels.find(l => l.id === o.levelId) : undefined;
  const where = lv ? ` in ${lv.name}` : '';
  switch (o.op) {
    case 'setProjectName': return `Renamed the project to "${o.name}"`;
    case 'addLevel': return `Added level ${o.level.name}`;
    case 'removeLevel': return `Removed level ${lv?.name ?? o.levelId}`;
    case 'setStartLevel': return `Game now starts in ${lv?.name ?? o.levelId}`;
    case 'renameLevel': return `Renamed ${lv?.name ?? o.levelId} to ${o.name}`;
    case 'setLook': {
      const parts = Object.entries(o.look).map(([k, v]) => v === undefined ? `reset ${k}` : `${k} ${typeof v === 'number' ? fmt(v) : v}`);
      return `Set look${where}: ${parts.join(', ')}`;
    }
    case 'addMarker': return `Placed ${o.marker.name ?? `a ${KIND_WORD[o.marker.kind][0]}`}${where} at ${o.marker.pos.map(fmt).join(', ')}`;
    case 'removeMarker': return `Removed ${markerName(lv, o.markerId)}${where}`;
    case 'updateMarker': {
      const what = markerName(lv, o.markerId);
      const bits: string[] = [];
      if (o.patch.pos) bits.push(`moved to ${o.patch.pos.map(fmt).join(', ')}`);
      if (o.patch.yaw !== undefined) bits.push(`turned to ${fmt((o.patch.yaw * 180) / Math.PI)}°`);
      if (o.patch.radius !== undefined) bits.push(`radius ${fmt(o.patch.radius)} m`);
      if (o.patch.name !== undefined) bits.push(`named "${o.patch.name}"`);
      if (o.patch.team !== undefined) bits.push(`team ${o.patch.team.toUpperCase()}`);
      return `${what[0].toUpperCase()}${what.slice(1)}${where}: ${bits.join(', ') || 'changed'}`;
    }
    case 'setMarkersOfKind': {
      const word = KIND_WORD[o.kind][1];
      return o.markers.length ? `Took over ${word}${where} (${o.markers.length})` : `Handed ${word}${where} back to the level's own`;
    }
    case 'putZone': return o.zone.kind === 'hazardBelow' ? `Hazard${where} below ${fmt(o.zone.y ?? 0)} m` : `Set trigger ${o.zone.name ?? o.zone.id}${where}`;
    case 'removeZone': return `Removed zone ${o.zoneId}${where}`;
    case 'putInstance': return `Placed ${o.instance.prefab}${where}`;
    case 'removeInstance': return `Removed ${o.instanceId}${where}`;
    case 'putRule': return `Set rule ${o.rule.id}${where}`;
    case 'removeRule': return `Removed rule ${o.ruleId}${where}`;
    case 'batch': return o.label;
  }
}

export interface HistoryEntry { op: Op; inverse: Op; label: string; at: number }

/** Undo/redo over applyOp. Consecutive edits to the same field (a drag, a slider) merge into one step. */
export class History {
  project: GameProject;
  private done: HistoryEntry[] = [];
  private undone: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  constructor(project: GameProject, private now: () => number = Date.now, private mergeMs = 600) { this.project = project; }

  get entries(): readonly HistoryEntry[] { return this.done; }
  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const fn of this.listeners) fn(); }

  apply(op: Op): GameProject {
    const label = describeOp(this.project, op);
    const { project, inverse } = applyOp(this.project, op);
    const at = this.now();
    const last = this.done[this.done.length - 1];
    if (last && at - last.at < this.mergeMs && mergeKey(last.op) && mergeKey(last.op) === mergeKey(op)) {
      // Same marker/look field again: keep the first step's inverse so one undo returns to before the drag.
      // A step that began as a batch (take a kind over + first move) keeps its batch, with the latest move.
      const merged: Op = last.op.op === 'batch' && op.op !== 'batch' ? { ...last.op, ops: [...last.op.ops.slice(0, -1), op] } : op;
      this.done[this.done.length - 1] = { op: merged, inverse: last.inverse, label, at };
    } else {
      this.done.push({ op, inverse, label, at });
    }
    this.undone = [];
    this.project = { ...project, updatedAt: at };
    this.emit();
    return this.project;
  }

  undo(): GameProject | null {
    const e = this.done.pop();
    if (!e) return null;
    const { project } = applyOp(this.project, e.inverse);
    this.undone.push(e);
    this.project = { ...project, updatedAt: this.now() };
    this.emit();
    return this.project;
  }

  redo(): GameProject | null {
    const e = this.undone.pop();
    if (!e) return null;
    const { project, inverse } = applyOp(this.project, e.op);
    this.done.push({ ...e, inverse, at: 0 }); // at 0: never merge into a redone step
    this.project = { ...project, updatedAt: this.now() };
    this.emit();
    return this.project;
  }

  /** Open a different project (load, import): history starts over. */
  reset(project: GameProject) { this.project = project; this.done = []; this.undone = []; this.emit(); }
}

function mergeKey(o: Op): string | null {
  if (o.op === 'setProjectName') return 'name';
  if (o.op === 'batch') return o.ops.length ? mergeKey(o.ops[o.ops.length - 1]) : null;
  if (o.op === 'updateMarker') return `m:${o.levelId}:${o.markerId}:${Object.keys(o.patch).sort().join(',')}`;
  if (o.op === 'setLook') return `l:${o.levelId}:${Object.keys(o.look).sort().join(',')}`;
  return null;
}
