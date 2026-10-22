// services/merchStudio/store.ts — on-device persistence for Merch Designer projects.
//
// Same shape as the comic project store: the project JSON in IndexedDB with a small index for the
// picker, and every save queued to the creative cloud (kind 'merch') for version history and other
// devices. Binaries — uploaded artwork, imported/sculpted models, rendered shots — are separate
// IndexedDB blobs keyed by asset id, so the JSON that syncs on every edit stays a few KB.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  deleteCloudProject,
  getCloudHead,
  isCloudNewer,
  listCloudProjects,
  loadCloudProject,
  scheduleCreativeSync,
} from '../creativeCloud/cloudStore';
import { getProductTemplate } from './products';
import { getMerchScene } from './scenes';
import {
  MERCH_PROJECT_SCHEMA,
  newMerchId,
  type MerchAsset,
  type MerchProject,
  type MerchProjectSummary,
} from './types';

export const MERCH_CLOUD_KIND = 'merch';

const KEY = (id: string) => `merchProject:${id}`;
const ASSET_KEY = (id: string) => `merchAsset:${id}`;
const INDEX_KEY = 'merchProject:index';
const LAST_KEY = 'plajah.merchProject.last';

export function createMerchProject(templateId = 'tee', sceneId = 'clean-studio'): MerchProject {
  const t = getProductTemplate(templateId);
  const scene = getMerchScene(sceneId);
  const now = Date.now();
  return {
    schema: MERCH_PROJECT_SCHEMA,
    version: 1,
    id: newMerchId('merch'),
    title: `Untitled ${t.name}`,
    product: { kind: 'template', templateId: t.id },
    productColor: t.defaultColor,
    designs: {},
    setup: { sceneId: scene.id, aspect: '4:5', camera: { ...scene.camera }, lightScale: 1, keyYaw: 0, exposure: scene.exposure, props: true },
    shots: [],
    assets: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function productLabel(p: MerchProject): string {
  return p.product.kind === 'template' ? getProductTemplate(p.product.templateId).name : p.product.name;
}

export function summarizeMerchProject(p: MerchProject): MerchProjectSummary {
  const cover = p.shots.find((s) => s.id === p.coverShotId) ?? p.shots[0];
  return { id: p.id, title: p.title, productLabel: productLabel(p), shotCount: p.shots.length, coverAssetId: cover?.assetId, updatedAt: p.updatedAt };
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

function parseProject(json: string): MerchProject | null {
  try {
    const p = JSON.parse(json);
    return p && p.schema === MERCH_PROJECT_SCHEMA ? (p as MerchProject) : null;
  } catch {
    return null;
  }
}

export async function listMerchProjects(): Promise<MerchProjectSummary[]> {
  const index = [...((await idbGet<MerchProjectSummary[]>(INDEX_KEY)) ?? [])];
  for (const head of await withTimeout(listCloudProjects(MERCH_CLOUD_KIND), 4000, [])) {
    const local = index.find((s) => s.id === head.localId);
    if (local) {
      if (head.updatedAt > local.updatedAt) index[index.indexOf(local)] = { ...local, title: head.title, updatedAt: head.updatedAt };
      continue;
    }
    index.push({ id: head.localId, title: head.title, productLabel: '', shotCount: 0, updatedAt: head.updatedAt, inCloudOnly: true });
  }
  return index.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The newest copy: this device's, or the cloud's when another device saved after it. */
export async function loadMerchProject(id: string): Promise<MerchProject | null> {
  const stored = await idbGet<MerchProject>(KEY(id));
  const local = stored && stored.schema === MERCH_PROJECT_SCHEMA ? stored : null;
  const head = await withTimeout(getCloudHead(MERCH_CLOUD_KIND, id), 4000, null);
  if (head && (!local || isCloudNewer(head, local.updatedAt))) {
    const cloud = await withTimeout(loadCloudProject(MERCH_CLOUD_KIND, id), 20000, null);
    const p = cloud ? parseProject(cloud.json) : null;
    if (p) {
      await writeLocal(p);
      return p;
    }
  }
  return local;
}

async function writeLocal(project: MerchProject) {
  await idbSet(KEY(project.id), project);
  const index = (await idbGet<MerchProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(INDEX_KEY, [summarizeMerchProject(project), ...index.filter((s) => s.id !== project.id)]);
}

export async function saveMerchProject(project: MerchProject): Promise<MerchProject> {
  const saved = { ...project, updatedAt: Date.now() };
  await writeLocal(saved);
  setLastMerchProjectId(saved.id);
  const cover = saved.shots.find((s) => s.id === saved.coverShotId) ?? saved.shots[0];
  scheduleCreativeSync({
    kind: MERCH_CLOUD_KIND,
    localId: saved.id,
    title: saved.title,
    json: JSON.stringify(saved),
    ...(cover?.remoteUrl ? { coverUrl: cover.remoteUrl } : {}),
  });
  return saved;
}

export async function deleteMerchProject(id: string): Promise<void> {
  const p = await idbGet<MerchProject>(KEY(id));
  if (p) for (const a of Object.keys(p.assets || {})) await idbDel(ASSET_KEY(a)).catch(() => {});
  await idbDel(KEY(id));
  const index = (await idbGet<MerchProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(INDEX_KEY, index.filter((s) => s.id !== id));
  if (getLastMerchProjectId() === id) setLastMerchProjectId(null);
  await deleteCloudProject(MERCH_CLOUD_KIND, id).catch(() => {});
}

export function getLastMerchProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastMerchProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Blocked storage: reopening just starts a fresh project.
  }
}

// ── Assets ────────────────────────────────────────────────────────────────────

/** Stores a blob and returns its asset record (add it to project.assets). */
export async function putMerchAsset(blob: Blob, name: string): Promise<MerchAsset> {
  const id = newMerchId('ma');
  await idbSet(ASSET_KEY(id), blob);
  return { id, name, mime: blob.type || 'application/octet-stream', bytes: blob.size };
}

export async function getMerchAssetBlob(id: string): Promise<Blob | null> {
  return (await idbGet<Blob>(ASSET_KEY(id))) ?? null;
}

const objectUrls = new Map<string, string>();

/**
 * A URL for an asset ref ("asset:<id>") or a plain URL. Local blobs win; an asset only uploaded from
 * another device falls back to its remote URL. Object URLs are cached for the page's lifetime.
 */
export async function resolveMerchSrc(src: string | undefined, assets: Record<string, MerchAsset>): Promise<string | null> {
  if (!src) return null;
  if (!src.startsWith('asset:')) return src;
  const id = src.slice(6);
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const blob = await getMerchAssetBlob(id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.set(id, url);
    return url;
  }
  return assets[id]?.remoteUrl ?? null;
}

export const assetRef = (id: string) => `asset:${id}`;
