/**
 * services/anima/projectStore.ts — saving Anima projects.
 *
 * IndexedDB on this device (fast, offline), plus a cloud copy with version history through
 * services/creativeCloud (kind 'anima'), so projects open on any signed-in device. Imported
 * plates and stop-motion captures upload next to the project in the author's creative storage.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';
import type { AnimaProject } from './types';
import { ANIMA_SCHEMA } from './templates';
import {
  deleteCloudProject,
  getCloudHead,
  isCloudNewer,
  listCloudProjects,
  loadCloudProject,
  scheduleCreativeSync,
} from '../creativeCloud/cloudStore';

export const ANIMA_CLOUD_KIND = 'anima';

const KEY = (id: string) => `animaProject:${id}`;
const INDEX_KEY = 'animaProject:index';
const LAST_KEY = 'plajah.anima.last';
const PENDING_KEY = 'plajah.anima.pending';

export interface AnimaProjectSummary {
  id: string;
  name: string;
  layerCount: number;
  durationFrames: number;
  fps: number;
  updatedAt: number;
  inCloudOnly?: boolean;
}

const summarize = (p: AnimaProject): AnimaProjectSummary => ({
  id: p.id,
  name: p.name,
  layerCount: p.layers.length,
  durationFrames: p.durationFrames,
  fps: p.fps,
  updatedAt: p.updatedAt ?? Date.now(),
});

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export function parseAnimaProject(json: string): AnimaProject | null {
  try {
    const p = JSON.parse(json);
    return p && p.schema === ANIMA_SCHEMA && Array.isArray(p.layers) ? (p as AnimaProject) : null;
  } catch {
    return null;
  }
}

async function cacheLocally(p: AnimaProject) {
  await idbSet(KEY(p.id), p);
  const index = (await idbGet<AnimaProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(INDEX_KEY, [summarize(p), ...index.filter((s) => s.id !== p.id)]);
}

/** Saves on this device and queues the cloud copy (with history). */
export async function saveAnimaProject(project: AnimaProject): Promise<AnimaProject> {
  const saved = { ...project, schema: ANIMA_SCHEMA, updatedAt: Date.now() };
  await cacheLocally(saved);
  setLastAnimaProjectId(saved.id);
  scheduleCreativeSync({ kind: ANIMA_CLOUD_KIND, localId: saved.id, title: saved.name, json: JSON.stringify(saved) });
  return saved;
}

/** Opens the newest copy: this device's, or the cloud's when another device saved after it. */
export async function loadAnimaProject(id: string): Promise<AnimaProject | null> {
  const stored = await idbGet<AnimaProject>(KEY(id));
  const local = stored && stored.schema === ANIMA_SCHEMA ? stored : null;
  const head = await withTimeout(getCloudHead(ANIMA_CLOUD_KIND, id), 4000, null);
  if (head && (!local || isCloudNewer(head, local.updatedAt))) {
    const cloud = await withTimeout(loadCloudProject(ANIMA_CLOUD_KIND, id), 20000, null);
    const p = cloud ? parseAnimaProject(cloud.json) : null;
    if (p) {
      await cacheLocally(p);
      return p;
    }
  }
  return local;
}

/** This device's projects plus those saved from the user's other devices. */
export async function listAnimaProjects(): Promise<AnimaProjectSummary[]> {
  const index = [...((await idbGet<AnimaProjectSummary[]>(INDEX_KEY)) ?? [])];
  for (const head of await withTimeout(listCloudProjects(ANIMA_CLOUD_KIND), 4000, [])) {
    const local = index.find((s) => s.id === head.localId);
    if (local) {
      if (head.updatedAt > local.updatedAt) index[index.indexOf(local)] = { ...local, name: head.title, updatedAt: head.updatedAt };
      continue;
    }
    index.push({ id: head.localId, name: head.title, layerCount: 0, durationFrames: 0, fps: 0, updatedAt: head.updatedAt, inCloudOnly: true });
  }
  return index.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteAnimaProject(id: string) {
  await idbDel(KEY(id));
  const index = (await idbGet<AnimaProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(INDEX_KEY, index.filter((s) => s.id !== id));
  if (getLastAnimaProjectId() === id) setLastAnimaProjectId(null);
  await deleteCloudProject(ANIMA_CLOUD_KIND, id).catch(() => {});
}

export function getLastAnimaProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastAnimaProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* blocked storage: reopening starts blank */
  }
}

/** Synchronous snapshot at page close (an IndexedDB write may not finish during unload). */
export function stashPendingAnimaProject(p: AnimaProject) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, updatedAt: Date.now() }));
  } catch {
    /* over quota: the async save is the only attempt */
  }
}

export function takePendingAnimaProject(): AnimaProject | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return parseAnimaProject(raw);
  } catch {
    return null;
  }
}

/**
 * Stores media for a project. Signed in: uploads beside the project in creative storage
 * (counts toward the author's allowance) and returns a durable URL. Guest: a blob URL that
 * lasts this session only.
 */
export async function storeAnimaMedia(
  projectId: string,
  file: Blob,
  name: string
): Promise<{ url: string; storagePath?: string; sessionOnly?: boolean }> {
  const user = auth.currentUser;
  if (!user) return { url: URL.createObjectURL(file), sessionOnly: true };
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-80) || 'media';
  const path = `personal/${user.uid}/creative/${ANIMA_CLOUD_KIND}/${projectId}/media/${Date.now()}_${safe}`;
  await uploadBytes(ref(storage, path), file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: { ownerUid: user.uid, kind: ANIMA_CLOUD_KIND },
  });
  return { url: await getDownloadURL(ref(storage, path)), storagePath: path };
}
