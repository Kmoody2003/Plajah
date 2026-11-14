// cgLibrary — the Fabula CG catalogue: every package × every archetype, plus
// graphics the user authored in the Graphics workspace designer.
//
// Library graphics are built lazily and memoised (building all ~900 takes a few
// ms, but most hosts only need one). User graphics live in localStorage under
// one key so Fabula, the switcher and Stage (same origin) all see them.
import { CG_PACKAGES, cgPackage, type CgPackage } from './cgPackages';
import { CG_ARCHETYPES, buildGraphic, type CgArchetype } from './cgArchetypes';
import type { CgCategory, CgGraphic, CgGraphicRef, CgDragPayload } from './cgTypes';
import { CG_DRAG_MIME } from './cgTypes';
import { cgDefaultDuration } from './cgEvaluate';

const cache = new Map<string, CgGraphic>();
let all: CgGraphic[] | null = null;

export function cgArchetype(id: string): CgArchetype | undefined { return CG_ARCHETYPES.find(a => a.id === id); }

export function libraryGraphic(id: string): CgGraphic | undefined {
  const hit = cache.get(id); if (hit) return hit;
  const dot = id.indexOf('.');
  if (dot < 0) return undefined;
  const pk = cgPackage(id.slice(0, dot)), a = cgArchetype(id.slice(dot + 1));
  if (!pk || !a) return undefined;
  const g = buildGraphic(pk, a);
  cache.set(id, g);
  return g;
}

export function allLibraryGraphics(): CgGraphic[] {
  if (all) return all;
  all = [];
  for (const pk of CG_PACKAGES) for (const a of CG_ARCHETYPES) all.push(libraryGraphic(`${pk.id}.${a.id}`)!);
  return all;
}

export const CG_LIBRARY_SIZE = CG_PACKAGES.length * CG_ARCHETYPES.length;

// ── user graphics ────────────────────────────────────────────────────────────
const USER_KEY = 'fabula.cg.user.v1';
type Listener = () => void;
const listeners = new Set<Listener>();
export function onUserGraphicsChange(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function storage(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

export function loadUserGraphics(): CgGraphic[] {
  const s = storage(); if (!s) return [];
  try { const v = JSON.parse(s.getItem(USER_KEY) || '[]'); return Array.isArray(v) ? v.filter(g => g && g.id && Array.isArray(g.layers)) : []; } catch { return []; }
}
export function saveUserGraphic(g: CgGraphic): CgGraphic {
  const s = storage();
  const saved: CgGraphic = { ...g, custom: true, version: (g.version || 0) + 1, id: g.id.startsWith('user.') ? g.id : `user.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  if (s) {
    const list = loadUserGraphics().filter(x => x.id !== saved.id);
    list.unshift(saved);
    try { s.setItem(USER_KEY, JSON.stringify(list.slice(0, 400))); } catch { /* quota */ }
  }
  listeners.forEach(fn => fn());
  return saved;
}
export function deleteUserGraphic(id: string) {
  const s = storage(); if (!s) return;
  try { s.setItem(USER_KEY, JSON.stringify(loadUserGraphics().filter(x => x.id !== id))); } catch { /* */ }
  listeners.forEach(fn => fn());
}

/** Resolve any graphic id (library or user) — or the ref's inline graphic. */
export function findCgGraphic(idOrRef: string | CgGraphicRef | null | undefined): CgGraphic | undefined {
  if (!idOrRef) return undefined;
  if (typeof idOrRef !== 'string') {
    if (idOrRef.inline) return idOrRef.inline;
    return findCgGraphic(idOrRef.graphicId);
  }
  if (idOrRef.startsWith('user.')) return loadUserGraphics().find(g => g.id === idOrRef);
  return libraryGraphic(idOrRef);
}

// ── search ───────────────────────────────────────────────────────────────────
export interface CgQuery { text?: string; category?: CgCategory | 'all'; packageId?: string | 'all'; group?: CgPackage['group'] | 'all'; includeUser?: boolean }
export function searchCg(q: CgQuery = {}): CgGraphic[] {
  const pool = [...(q.includeUser !== false ? loadUserGraphics() : []), ...allLibraryGraphics()];
  const words = (q.text || '').toLowerCase().split(/\s+/).filter(Boolean);
  return pool.filter(g => {
    if (q.category && q.category !== 'all' && g.category !== q.category) return false;
    if (q.packageId && q.packageId !== 'all' && g.packageId !== q.packageId) return false;
    if (q.group && q.group !== 'all' && cgPackage(g.packageId)?.group !== q.group) return false;
    if (!words.length) return true;
    const hay = `${g.name} ${g.tags.join(' ')} ${g.category} ${g.tagline || ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// ── drag & drop ──────────────────────────────────────────────────────────────
export function cgDragPayload(g: CgGraphic, ref?: Partial<CgGraphicRef>): CgDragPayload {
  const r: CgGraphicRef = { graphicId: g.id, ...(ref || {}) };
  if (g.custom && !r.inline) r.inline = g; // user graphics travel with their definition (cross-window drops)
  return { kind: 'cg-graphic', ref: r, name: g.name, category: g.category, live: g.live, durationHint: cgDefaultDuration(g) };
}
/** Put a graphic on a DataTransfer (call from onDragStart). */
export function setCgDragData(dt: DataTransfer, g: CgGraphic, ref?: Partial<CgGraphicRef>) {
  const payload = JSON.stringify(cgDragPayload(g, ref));
  dt.setData(CG_DRAG_MIME, payload);
  dt.setData('text/plain', g.name);
  dt.effectAllowed = 'copy';
}
/** True while a CG drag is over a target (types are readable during dragover; data is not). */
export function isCgDrag(dt: DataTransfer | null | undefined): boolean {
  return !!dt && Array.from(dt.types || []).includes(CG_DRAG_MIME);
}
/** Read the payload on drop. */
export function readCgDragData(dt: DataTransfer | null | undefined): CgDragPayload | null {
  if (!dt) return null;
  try { const raw = dt.getData(CG_DRAG_MIME); if (!raw) return null; const p = JSON.parse(raw); return p?.kind === 'cg-graphic' && p.ref?.graphicId ? p : null; } catch { return null; }
}

export { CG_PACKAGES, CG_ARCHETYPES };
