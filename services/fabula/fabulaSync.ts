// services/fabula/fabulaSync.ts — offline-first cloud sync + live-collab glue for Fabula productions.
//
// Fabula keeps its fast local save (IndexedDB) and a durable platform copy (services/fabulaProjects).
// This module adds what that pair was missing:
//
//   • a pending queue (IndexedDB) of productions whose cloud save hasn't landed yet, flushed when
//     the browser comes back online;
//   • a "last-synced" base per production, so when the cloud copy moved on (another device) while
//     this device had unsynced edits, the two are merged three-way through services/coedit/crdt.ts
//     instead of one silently winning;
//   • a *portable* projection of a production: device-local media fields (blob:/data: object URLs,
//     session/offline flags) are stripped, so live collaboration, version history and merges only
//     ever carry data that means something on another device. `overlayLocalMedia` puts this
//     device's playable URLs back on a document that arrived from elsewhere.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { applyOps, diff, fromDoc } from '../coedit/crdt';
import { newClock, tick } from '../coedit/hlc';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Prod = Record<string, any> & { id: string; updatedAt?: number; mediaPool?: any[] };

const PENDING_KEY = 'fabula:sync:pending';
const baseKey = (id: string) => `fabula:sync:base:${id}`;

const isDeviceUrl = (u: unknown): u is string => typeof u === 'string' && (u.startsWith('blob:') || u.startsWith('data:'));

// ── portable projection ─────────────────────────────────────────────────────

const DEVICE_ASSET_FIELDS = ['session', 'offline'] as const;

/** One media-pool asset as other devices should see it. */
function portableAsset(a: any): any {
  if (!a || typeof a !== 'object') return a;
  const needs = isDeviceUrl(a.url) || DEVICE_ASSET_FIELDS.some((k) => k in a);
  if (!needs) return a;
  const out = { ...a };
  for (const k of DEVICE_ASSET_FIELDS) delete out[k];
  if (isDeviceUrl(out.url)) {
    if (typeof out.cloudUrl === 'string' && out.cloudUrl) out.url = out.cloudUrl;
    else delete out.url;
  }
  return out;
}

// 3D clips cache the model's URL on the clip (model3dUrl); a blob:/data: one is device-only.
function portableClips(clips: any): any {
  if (!Array.isArray(clips) || !clips.some((c) => isDeviceUrl(c?.model3dUrl))) return clips;
  return clips.map((c) => {
    if (!isDeviceUrl(c?.model3dUrl)) return c;
    const { model3dUrl: _drop, ...rest } = c;
    return rest;
  });
}
function portableHost(h: any): any {
  const cl = h?.timeline?.clips;
  const p = portableClips(cl);
  return p === cl ? h : { ...h, timeline: { ...h.timeline, clips: p } };
}
function mapKeep<A>(arr: A[] | undefined, fn: (a: A) => A): A[] | undefined {
  if (!Array.isArray(arr)) return arr;
  let changed = false;
  const out = arr.map((a) => {
    const b = fn(a);
    if (b !== a) changed = true;
    return b;
  });
  return changed ? out : arr;
}

/**
 * The production without anything that only means something on this device. Unchanged parts are
 * shared by reference (cheap); the result is plain JSON-safe data.
 */
export function portableProduction<T extends Prod>(prod: T): T {
  if (!prod || typeof prod !== 'object') return prod;
  const out: any = { ...prod };
  if (Array.isArray(prod.mediaPool)) out.mediaPool = prod.mediaPool.map(portableAsset);
  out.edits = mapKeep(prod.edits, portableHost);
  out.acts = mapKeep(prod.acts, (a: any) => {
    const scenes = mapKeep(a?.scenes, portableHost);
    return scenes === a?.scenes ? a : { ...a, scenes };
  });
  if (out.edits === undefined) delete out.edits;
  if (out.acts === undefined) delete out.acts;
  return out;
}

const isDeviceOnly = (a: any) => !!a && isDeviceUrl(a.url) && !a.cloudUrl;
/** Media-pool assets that play only on this device (no cloud copy): what collaborators can't see. */
export function deviceOnlyAssets(prod: Prod | null | undefined): any[] {
  return (prod?.mediaPool ?? []).filter(isDeviceOnly);
}

export const portableJson = (prod: Prod) => JSON.stringify(portableProduction(prod));

/**
 * A production that arrived from elsewhere (a collaborator, the cloud, a merge), made playable here:
 * deep-copied (callers may mutate it, e.g. migrate()), with this device's local media URLs put back
 * for assets it already holds. Returns the ids of assets that have no playable source on this device
 * yet (the caller tries OPFS / sync folders; failing that the editor's NO MEDIA placeholder shows).
 */
export function overlayLocalMedia<T extends Prod>(incoming: T, current: Prod | null | undefined): { doc: T; missing: string[] } {
  const doc = clone(incoming);
  const missing: string[] = [];
  const mine = new Map<string, any>((current?.mediaPool ?? []).map((a: any) => [a?.id, a]));
  for (const a of doc.mediaPool ?? []) {
    if (!a || typeof a !== 'object') continue;
    const here = mine.get(a.id);
    // Same asset, still pointing at the same durable source (or none): keep the local bytes we play.
    const sameSource = here && (!a.url || a.url === a.cloudUrl || a.url === here.cloudUrl || a.url === here.url);
    if (here && sameSource && here.url && !here.offline) {
      a.url = here.url;
      if (here.session) a.session = true;
      a.offline = false;
      continue;
    }
    if (!a.url) {
      a.offline = true;
      missing.push(a.id);
    }
  }
  // Put back device-local 3D model URLs (stripped from the portable doc), else use the asset's.
  const myClips = new Map<string, any>();
  const hosts = (p: any) => [...(p?.edits ?? []), ...(p?.acts ?? []).flatMap((a: any) => a?.scenes ?? [])];
  for (const h of hosts(current)) for (const c of h?.timeline?.clips ?? []) if (c?.id) myClips.set(c.id, c);
  const poolUrl = new Map<string, string>((doc.mediaPool ?? []).filter((a: any) => a?.url).map((a: any) => [a.id, a.url]));
  for (const h of hosts(doc)) for (const c of h?.timeline?.clips ?? []) {
    if (!c || c.kind !== 'model3d' || c.model3dUrl) continue;
    const mineUrl = myClips.get(c.id)?.model3dUrl;
    const url = mineUrl || (c.assetId ? poolUrl.get(c.assetId) : undefined);
    if (url) c.model3dUrl = url;
  }
  return { doc, missing };
}

function clone<T>(v: T): T {
  try {
    return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

// ── three-way merge ─────────────────────────────────────────────────────────

/**
 * Applies the edits that turned `base` into `mine` onto `theirs`. Lists of id'd objects (acts,
 * scenes, edits, clips, tracks, media) merge per element; other values are last-writer-wins with
 * my edits winning where both sides touched the same field; prose merges line-wise.
 */
export function mergeThreeWay<T>(base: T, mine: T, theirs: T): T {
  const clock = newClock('fabulamerge');
  const state = fromDoc(clone(theirs));
  const ops = diff(base, mine, state.meta, () => tick(clock));
  if (!ops.length) return state.doc;
  return applyOps(state, ops).state.doc;
}

// ── pending queue + base ────────────────────────────────────────────────────

export async function listPending(): Promise<string[]> {
  try {
    const v = await idbGet<string[]>(PENDING_KEY);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Serialise read-modify-write of the pending list.
let pendingChain: Promise<unknown> = Promise.resolve();
function editPending(fn: (ids: Set<string>) => void): Promise<void> {
  const run = pendingChain.then(async () => {
    const ids = new Set(await listPending());
    fn(ids);
    await idbSet(PENDING_KEY, [...ids]).catch(() => {});
  });
  pendingChain = run.catch(() => {});
  return run;
}

export const markPending = (id: string) => editPending((s) => s.add(id));
export const clearPending = (id: string) => editPending((s) => s.delete(id));
export async function isPending(id: string) {
  return (await listPending()).includes(id);
}

/** The portable production as it was when the cloud last accepted it from this device. */
export async function getBase(id: string): Promise<Prod | null> {
  try {
    return ((await idbGet(baseKey(id))) as Prod) ?? null;
  } catch {
    return null;
  }
}
export async function setBase(prod: Prod) {
  await idbSet(baseKey(prod.id), JSON.parse(portableJson(prod))).catch(() => {});
}
export async function dropSyncState(id: string) {
  await idbDel(baseKey(id)).catch(() => {});
  await clearPending(id);
}

// ── reconcile ───────────────────────────────────────────────────────────────

export type ReconcileHow = 'local' | 'cloud' | 'merged' | 'conflict-copy';
export interface Reconciled {
  how: ReconcileHow;
  /** Portable production to use (overlay local media before handing it to the editor). */
  doc: Prod;
  /** With 'conflict-copy': the version that lost, to keep as a separate production. */
  other?: Prod;
}

/**
 * Decides between this device's copy and the cloud's. Cloud unchanged since our last sync → ours.
 * Cloud changed and we have nothing unsynced → theirs. Both changed → three-way merge on the last
 * synced base; with no base on record (older projects) keep both: newest as the project, the other
 * as a conflicted copy.
 */
export function reconcile(local: Prod, cloud: Prod | null, base: Prod | null, localDirty: boolean): Reconciled {
  const mine = portableProduction(local);
  if (!cloud) return { how: 'local', doc: mine };
  const theirs = portableProduction(cloud);
  const cloudAt = theirs.updatedAt ?? 0;
  const localAt = mine.updatedAt ?? 0;
  if (cloudAt === localAt) return { how: 'local', doc: mine };
  const cloudMoved = base ? (base.updatedAt ?? 0) !== cloudAt : cloudAt > localAt;
  if (!cloudMoved) return { how: 'local', doc: mine };
  const dirty = localDirty || (base ? (base.updatedAt ?? 0) !== localAt : false);
  if (!dirty) return { how: 'cloud', doc: theirs };
  if (base) {
    const merged = mergeThreeWay<Prod>(base, mine, theirs);
    merged.updatedAt = Math.max(Date.now(), cloudAt + 1, localAt + 1);
    return { how: 'merged', doc: merged };
  }
  return cloudAt > localAt ? { how: 'conflict-copy', doc: theirs, other: mine } : { how: 'conflict-copy', doc: mine, other: theirs };
}

/** Races a promise against a timeout (offline Firestore reads can hang for a long time). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

/** Friendlier labels for the collaboration panel's history/activity lines. */
export const fabulaLabeler = {
  key: (key: string): string | undefined =>
    ({ mediaPool: 'Media', acts: 'Acts', edits: 'Edits', tracks: 'Tracks', timeline: 'Timeline', clips: 'Clips', cast: 'Cast', worldCats: 'World', bins: 'Bins', defaults: 'Project settings' } as Record<string, string>)[key],
};
