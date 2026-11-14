// Server side of Story Intelligence → Worlds: write findings into a World. Source-agnostic, so a
// Reello video, a film and an album all file the same way. Used by the workspace routes and by the
// auto-file rules that run when a reading finishes. No rules engine bypass: every write checks the
// World belongs to the account first.

import { createHash } from 'crypto';
import type { WorldFiling } from '../reello/intel/types';
import {
  collectionFor, matchEntry, mergeEntryFields, newEntryFields, sourceRefFor,
  type Finding, type FindingEdits, type WorldEntryLite,
} from './findings';

export interface FilingStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<unknown>;
  patch(path: string, data: Record<string, unknown>): Promise<unknown>;
  list?(collection: string, max: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
}

export interface FilingSource {
  /** videoId, film video id, or albumId — the projectId on every entry it makes. */
  id: string;
  findings: Finding[];
  filing?: Record<string, WorldFiling>;
}

export type FileResult = { key: string; ok: boolean; entryId?: string; merged?: boolean; error?: string };

const ID_RE = /^[\w-]{1,128}$/;
/** Stable id per (world, source, finding): filing twice can never create a second entry, even after a failure midway. */
export const entryIdFor = (ref: string) => `si-${createHash('sha1').update(ref).digest('hex').slice(0, 20)}`;

export async function ownWorld(store: FilingStore, uid: string, worldId: string) {
  if (!ID_RE.test(worldId)) return null;
  const w = await store.get(`worlds/${worldId}`);
  return w && w.creatorId === uid ? w : null;
}

export async function worldEntries(store: FilingStore, worldId: string, coll: string): Promise<WorldEntryLite[]> {
  const rows = store.list ? await store.list(`worlds/${worldId}/${coll}`, 1000) : [];
  return rows.map(r => ({ id: r.id, name: r.data.name, title: r.data.title, sourceApp: r.data.sourceApp, sourceRefId: r.data.sourceRefId, storyIntelNames: r.data.storyIntelNames, discarded: r.data.discarded }));
}

/** What each finding would land in, for the Inbox and for the "known" rule. */
export async function matchesFor(store: FilingStore, world: Record<string, any>, worldId: string, src: FilingSource) {
  const [chars, lore, timeline] = await Promise.all(['characters', 'lore', 'timeline'].map(c => worldEntries(store, worldId, c)));
  const matches: Record<string, { id: string; by: 'source' | 'name'; name: string }> = {};
  for (const f of src.findings) {
    const pool = f.kind === 'character' ? chars : f.kind === 'lore' ? lore : f.kind === 'timeline' ? timeline : null;
    if (pool) { const m = matchEntry(f, src.id, pool); if (m) matches[f.key] = m; }
    else if (f.kind === 'asset' && f.assetId && (world.assetIds || []).includes(f.assetId)) matches[f.key] = { id: f.assetId, by: 'source', name: f.title };
  }
  // A relationship is "known" once both ends are in this World (filed, or matched there by name).
  for (const f of src.findings) {
    if (f.kind !== 'relation' || !f.ends) continue;
    const inWorld = (k: string) => (src.filing?.[k]?.status === 'FILED' && src.filing[k].worldId === worldId) || !!matches[k];
    if (f.ends.every(inWorld)) matches[f.key] = { id: '', by: 'name', name: f.title };
  }
  return matches;
}

/**
 * File findings into a World. Relationship findings add their two ends first when needed, then a
 * graph connection (deduplicated). Returns per-item results and the source's updated filing record;
 * the caller saves the record wherever that source keeps it.
 */
export async function fileInto(store: FilingStore, opts: {
  uid: string; world: Record<string, any>; worldId: string; src: FilingSource;
  items: Array<{ key: string; edits?: FindingEdits }>; now: () => number;
}): Promise<{ results: FileResult[]; filing: Record<string, WorldFiling> }> {
  const { uid, world, worldId, src, now } = opts;
  const all = new Map(src.findings.map(f => [f.key, f]));
  const pools: Record<string, WorldEntryLite[]> = {};
  const pool = async (c: string) => (pools[c] ||= await worldEntries(store, worldId, c));
  const filing: Record<string, WorldFiling> = { ...(src.filing || {}) };
  const results: FileResult[] = [];
  const assetIds: string[] = Array.isArray(world.assetIds) ? [...world.assetIds] : [];
  const graph: any[] = Array.isArray(world.graphConnections) ? [...world.graphConnections] : [];
  let worldChanged = false;

  const fileOne = async (key: string, edits: FindingEdits = {}): Promise<FileResult> => {
    const f = all.get(key);
    const coll = f ? collectionFor(f.kind) : null;
    if (!f || !coll) return { key, ok: false, error: f ? 'Products go to your store, not a World.' : 'Not in this reading.' };
    const prior = filing[key];
    if (prior?.status === 'FILED' && prior.worldId === worldId && !Object.keys(edits).length && coll !== 'characters' && coll !== 'lore') {
      return { key, ok: true, entryId: prior.entryId, merged: prior.merged };
    }
    if (coll === 'asset') {
      if (!assetIds.includes(f.assetId!)) { assetIds.push(f.assetId!); worldChanged = true; }
      // A video or album belongs to one World; only claim it when it has none yet.
      const path = `${f.assetCollection || 'videos'}/${f.assetId}`;
      const doc = await store.get(path);
      const owner = doc?.ownerId || doc?.creatorId || doc?.artistId;
      if (doc && owner === uid && !doc.worldId) await store.patch(path, { worldId });
      filing[key] = { status: 'FILED', worldId, entryKind: 'asset', entryId: f.assetId, at: now() };
      return { key, ok: true, entryId: f.assetId };
    }
    if (coll === 'graph') {
      const ends: Array<{ id: string; type: string }> = [];
      for (const k of f.ends || []) {
        const r: FileResult = filing[k]?.status === 'FILED' && filing[k].worldId === worldId ? { key: k, ok: true, entryId: filing[k].entryId } : await fileOne(k);
        if (!r.ok || !r.entryId) return { key, ok: false, error: r.error || 'Could not add both sides.' };
        ends.push({ id: r.entryId, type: all.get(k)?.kind === 'lore' ? 'LORE' : 'CHARACTER' });
      }
      if (ends.length !== 2) return { key, ok: false, error: 'Not a pair.' };
      const rel = f.relationshipType || 'APPEARS_WITH';
      const dup = graph.some(g => g.relationshipType === rel && ((g.sourceId === ends[0].id && g.targetId === ends[1].id) || (g.sourceId === ends[1].id && g.targetId === ends[0].id)));
      if (!dup) { graph.push({ sourceId: ends[0].id, sourceType: ends[0].type, targetId: ends[1].id, targetType: ends[1].type, relationshipType: rel }); worldChanged = true; }
      filing[key] = { status: 'FILED', worldId, entryKind: 'graph', entryId: `${ends[0].id}~${ends[1].id}`, merged: dup, at: now() };
      return { key, ok: true, entryId: `${ends[0].id}~${ends[1].id}`, merged: dup };
    }
    const entries = await pool(coll);
    const m = matchEntry(f, src.id, entries);
    let entryId: string; let merged = false;
    if (m) {
      const cur = (await store.get(`worlds/${worldId}/${coll}/${m.id}`)) || {};
      const patch = mergeEntryFields(f, src.id, cur, m.by, edits);
      if (Object.keys(patch).length && !(await store.patch(`worlds/${worldId}/${coll}/${m.id}`, patch))) throw new Error('Could not save to the World.');
      entryId = m.id; merged = m.by === 'name';
    } else {
      entryId = entryIdFor(`${worldId}:${sourceRefFor(src.id, key)}`);
      const data: Record<string, any> = { id: entryId, worldId, ...newEntryFields(f, src.id, edits), createdAt: now() };
      if (!(await store.set(`worlds/${worldId}/${coll}/${entryId}`, data))) throw new Error('Could not save to the World.');
      entries.push({ id: entryId, name: data.name, title: data.title, sourceApp: data.sourceApp, sourceRefId: data.sourceRefId, storyIntelNames: data.storyIntelNames });
    }
    filing[key] = { status: 'FILED', worldId, entryKind: coll, entryId, merged, at: now() };
    return { key, ok: true, entryId, merged };
  };

  for (const it of opts.items) {
    const e = it.edits || {};
    const edits: FindingEdits = {
      ...(typeof e.title === 'string' && e.title.trim() ? { title: e.title } : {}),
      ...(typeof e.summary === 'string' ? { summary: e.summary } : {}),
      ...(Number.isInteger(e.year) ? { year: e.year } : {}),
    };
    try { results.push(await fileOne(String(it.key), edits)); }
    catch (err: any) { results.push({ key: String(it.key), ok: false, error: err?.message || 'Could not file.' }); }
  }
  if (worldChanged) await store.patch(`worlds/${worldId}`, { assetIds, graphConnections: graph });
  return { results, filing };
}

export function skipIn(filing: Record<string, WorldFiling> | undefined, keys: string[], undo: boolean, now: number) {
  const next: Record<string, WorldFiling> = { ...(filing || {}) };
  for (const k of keys) {
    if (undo) { if (next[k]?.status === 'SKIPPED') delete next[k]; }
    else if (next[k]?.status !== 'FILED') next[k] = { status: 'SKIPPED', at: now };
  }
  return next;
}
