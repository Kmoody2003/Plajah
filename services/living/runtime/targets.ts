import type { Target } from '../contracts';

/** What the runtime needs to know about a page object to resolve targets. */
export interface ObjInfo {
  id: string;
  label?: string;
  role?: string;
  kind?: string;
  /** Page-space bounding box at rest. */
  box: { x: number; y: number; w: number; h: number };
}

/** The whole-page pseudo target: backgrounds, global tint, parallax root. */
export const PAGE_ID = '@page';

function matchLabel(pattern: string, label: string | undefined): boolean {
  if (label === undefined) return false;
  return pattern.endsWith('*') ? label.startsWith(pattern.slice(0, -1)) : label === pattern;
}

function expandEntry(entry: string, objs: ObjInfo[]): string[] {
  if (entry.startsWith('label:')) { const p = entry.slice(6); return objs.filter(o => matchLabel(p, o.label)).map(o => o.id); }
  if (entry.startsWith('role:')) { const r = entry.slice(5); return objs.filter(o => o.role === r).map(o => o.id); }
  return objs.some(o => o.id === entry) ? [entry] : [];
}

/** Resolve a contract Target to object ids, in page (z) order, de-duplicated. `{page:true}` -> [PAGE_ID]. */
export function resolveTarget(t: Target | undefined, objs: ObjInfo[], groups?: Record<string, string[]>): string[] {
  if (!t) return [];
  if ('page' in t) return [PAGE_ID];
  let ids: string[] = [];
  if ('id' in t) ids = objs.some(o => o.id === t.id) ? [t.id] : [];
  else if ('label' in t) ids = objs.filter(o => matchLabel(t.label, o.label)).map(o => o.id);
  else if ('role' in t) ids = objs.filter(o => o.role === t.role).map(o => o.id);
  else if ('group' in t) ids = (groups?.[t.group] ?? []).flatMap(e => expandEntry(e, objs));
  const set = new Set(ids);
  return objs.filter(o => set.has(o.id)).map(o => o.id);
}

export function targetKey(t: Target): string { return JSON.stringify(t); }

/** Union of the boxes of the given objects (page space), or null when none resolve. */
export function unionBox(ids: string[], objs: ObjInfo[]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const o = objs.find(q => q.id === id); if (!o) continue;
    x0 = Math.min(x0, o.box.x); y0 = Math.min(y0, o.box.y); x1 = Math.max(x1, o.box.x + o.box.w); y1 = Math.max(y1, o.box.y + o.box.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
