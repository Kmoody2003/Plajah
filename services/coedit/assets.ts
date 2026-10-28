// services/coedit/assets.ts — everyone's media in a shared project, and who brought what.
//
// Samples, recorded takes, presets, instruments and library items that a project references live in
// a per-project ledger, content-addressed (sha-256), with provenance: who contributed it, when, and
// what it is a version of. A recording is never blocked on the network:
//
//   local   the bytes exist only on the contributor's device (playable there, at full quality)
//   proxy   a small collab copy (Opus/WebM ~96 kbps) is up — everyone can play it within seconds
//   master  the full-quality original (WAV/FLAC/original file) has synced; players upgrade to it
//
// Collaborators play the best tier their connection can take ("adaptive until synced"): proxy on a
// slow or metered link, master once it's there on a good one. The contributor always plays local.
//
//   coedit/{projectId}/assets/{assetId}              the ledger entry (ops database)
//   collab/{projectId}/{uid}/{assetId}/{tier}         the bytes (private bucket, services/objectStore —
//                                                     the server signs each link after checking membership)
//   coedit-assets/{projectId}/{uid}/{assetId}/{tier}  older uploads, and the fallback when no bucket is
//                                                     configured (Firebase Storage)
//
// Uploads are resumable and survive reloads: the bytes wait in IndexedDB until each tier lands.

import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import { auth, opsDb, storage } from '../firebase';
import { collabKey } from '../objectStore/objectKeys';
import { getObject, ObjectStoreUnavailable, putObject } from '../objectStore/client';
import { COEDIT } from './project';

export type AssetKind = 'sample' | 'take' | 'preset' | 'instrument' | 'library' | 'media';
export type AssetTier = 'proxy' | 'master';
export type AssetStatus = 'local' | 'proxy' | 'master';

export interface AssetTierInfo {
  /** collab/… lives in the private bucket; coedit-assets/… in Firebase Storage. */
  path: string;
  mime: string;
  size: number;
  /** e.g. 'opus' 96 kbps proxy, 'wav' 24-bit 48 kHz master. */
  codec?: string;
  kbps?: number;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
}

export interface SharedAsset {
  id: string;
  kind: AssetKind;
  name: string;
  owner: string;
  ownerName: string;
  contributedAt: number;
  status: AssetStatus;
  durationSec?: number;
  tiers: Partial<Record<AssetTier, AssetTierInfo>>;
  /** Provenance: this asset replaces / is a new take of another one. */
  versionOf?: string;
  /** Where it came from on the contributor's side (their library item id, preset id, device). */
  source?: { library?: string; device?: string; instrument?: string };
  /** Free-form data a preset or instrument needs (parameters, mapping) — small JSON only. */
  data?: unknown;
}

const ledger = (projectId: string) => collection(opsDb, COEDIT, projectId, 'assets');
const cacheKey = (assetId: string, tier: AssetTier | 'local') => `coedit-asset:${assetId}:${tier}`;
const uploadKey = (projectId: string, assetId: string, tier: AssetTier) => `coedit-upload:${projectId}:${assetId}:${tier}`;

export async function sha256Id(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return `a${[...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const ext = (mime: string) =>
  mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('flac') ? 'flac' : mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('json') ? 'json' : 'bin';

// ── contributing ────────────────────────────────────────────────────────────

export interface ContributeInput {
  kind: AssetKind;
  name: string;
  /** Full-quality bytes (what this device keeps and eventually syncs). */
  master: Blob;
  masterInfo?: Omit<AssetTierInfo, 'path' | 'mime' | 'size'>;
  /** A small collab copy made while recording (MediaRecorder Opus). Small assets can skip it. */
  proxy?: Blob;
  proxyInfo?: Omit<AssetTierInfo, 'path' | 'mime' | 'size'>;
  durationSec?: number;
  versionOf?: string;
  source?: SharedAsset['source'];
  data?: unknown;
}

/** Below this, the original is its own collab copy (one upload, no proxy step). */
const SMALL_BYTES = 3 * 1024 * 1024;

/**
 * Adds an asset to the project. Returns at once with the ledger entry (status 'local'); the proxy and
 * then the master upload in the background and the entry's status follows them.
 */
export async function contributeAsset(projectId: string, input: ContributeInput): Promise<SharedAsset> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to share media with the project.');
  const id = await sha256Id(input.master);
  await idbSet(cacheKey(id, 'local'), input.master);
  const existing = await getDoc(doc(ledger(projectId), id)).catch(() => null);
  if (existing?.exists()) return existing.data() as SharedAsset; // same bytes already shared

  const asset: SharedAsset = {
    id,
    kind: input.kind,
    name: input.name.slice(0, 200),
    owner: u.uid,
    ownerName: u.displayName || 'Collaborator',
    contributedAt: Date.now(),
    status: 'local',
    tiers: {},
    ...(input.durationSec ? { durationSec: input.durationSec } : {}),
    ...(input.versionOf ? { versionOf: input.versionOf } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.data !== undefined ? { data: JSON.parse(JSON.stringify(input.data)) } : {}),
  };
  await setDoc(doc(ledger(projectId), id), asset);

  const small = input.master.size <= SMALL_BYTES;
  const proxy = small ? null : input.proxy ?? null;
  if (proxy) {
    await idbSet(cacheKey(id, 'proxy'), proxy);
    await queueUpload(projectId, id, 'proxy', proxy.type || 'audio/webm', input.proxyInfo);
  }
  await queueUpload(projectId, id, 'master', input.master.type || 'application/octet-stream', input.masterInfo);
  return asset;
}

interface PendingUpload {
  projectId: string;
  assetId: string;
  tier: AssetTier;
  uid: string;
  mime: string;
  info?: Omit<AssetTierInfo, 'path' | 'mime' | 'size'>;
}

export type UploadProgress = { assetId: string; tier: AssetTier; fraction: number; state: 'running' | 'done' | 'waiting' | 'error' };
const progressListeners = new Set<(p: UploadProgress) => void>();
export function onUploadProgress(fn: (p: UploadProgress) => void): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}
const report = (p: UploadProgress) => progressListeners.forEach((l) => l(p));

async function queueUpload(projectId: string, assetId: string, tier: AssetTier, mime: string, info?: PendingUpload['info']) {
  const uid = auth.currentUser!.uid;
  const job: PendingUpload = { projectId, assetId, tier, uid, mime, ...(info ? { info } : {}) };
  await idbSet(uploadKey(projectId, assetId, tier), job);
  void runUpload(job);
}

const running = new Set<string>();

async function runUpload(job: PendingUpload): Promise<void> {
  const key = uploadKey(job.projectId, job.assetId, job.tier);
  if (running.has(key) || auth.currentUser?.uid !== job.uid) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return report({ assetId: job.assetId, tier: job.tier, fraction: 0, state: 'waiting' });
  // The proxy goes first: don't start a master while its proxy is still pending.
  if (job.tier === 'master' && (await idbGet(uploadKey(job.projectId, job.assetId, 'proxy')))) {
    setTimeout(() => void runUpload(job), 3000);
    return;
  }
  const blob = await idbGet<Blob>(cacheKey(job.assetId, job.tier === 'proxy' ? 'proxy' : 'local'));
  if (!blob) {
    await idbDel(key);
    return;
  }
  running.add(key);
  const progress = (fraction: number) => report({ assetId: job.assetId, tier: job.tier, fraction, state: 'running' });
  let path = collabKey(job.projectId, job.uid, job.assetId, job.tier, ext(job.mime));
  try {
    try {
      await putObject(path, blob, job.mime, progress);
    } catch (err) {
      if (!(err instanceof ObjectStoreUnavailable)) throw err;
      path = `coedit-assets/${job.projectId}/${job.uid}/${job.assetId}/${job.tier}.${ext(job.mime)}`;
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), blob, { contentType: job.mime, customMetadata: { projectId: job.projectId, assetId: job.assetId, tier: job.tier } });
        task.on('state_changed', (s) => progress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve());
      });
    }
    const info: AssetTierInfo = { path, mime: job.mime, size: blob.size, ...(job.info ?? {}) };
    const ledgerRef = doc(ledger(job.projectId), job.assetId);
    const cur = (await getDoc(ledgerRef)).data() as SharedAsset | undefined;
    const status: AssetStatus = job.tier === 'master' ? 'master' : cur?.status === 'master' ? 'master' : 'proxy';
    await updateDoc(ledgerRef, { [`tiers.${job.tier}`]: info, status });
    await idbDel(key);
    if (job.tier === 'proxy') await idbDel(cacheKey(job.assetId, 'proxy')).catch(() => {}); // local plays master
    report({ assetId: job.assetId, tier: job.tier, fraction: 1, state: 'done' });
  } catch (err) {
    console.warn('[coedit assets] upload paused; will resume', err);
    report({ assetId: job.assetId, tier: job.tier, fraction: 0, state: 'error' });
    setTimeout(() => void runUpload(job), 15_000);
  } finally {
    running.delete(key);
  }
}

/** Restarts uploads left unfinished by a closed tab or a lost connection. */
export async function resumeAssetUploads(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  for (const k of await idbKeys().catch(() => [] as IDBValidKey[])) {
    if (typeof k !== 'string' || !k.startsWith('coedit-upload:')) continue;
    const job = await idbGet<PendingUpload>(k).catch(() => undefined);
    if (job?.uid === uid) void runUpload(job);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void resumeAssetUploads());
  auth.onAuthStateChanged((u) => u && void resumeAssetUploads());
}

// ── playing ─────────────────────────────────────────────────────────────────

/** Is this connection good enough to pull full-quality masters? */
export function connectionCanTakeMasters(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  if (c.effectiveType && /(^|-)2g|3g/.test(c.effectiveType)) return false;
  return c.downlink == null || c.downlink >= 3;
}

/** Which tier this device should play right now. */
export function bestTier(asset: SharedAsset, preferMaster = connectionCanTakeMasters()): AssetTier | 'local' | null {
  if (asset.owner === auth.currentUser?.uid) return 'local';
  if (asset.tiers.master && (preferMaster || !asset.tiers.proxy)) return 'master';
  if (asset.tiers.proxy) return 'proxy';
  if (asset.tiers.master) return 'master';
  return null; // still uploading from its owner's device
}

/**
 * A playable Blob for an asset at the best tier available, cached on this device. Resolves null when
 * nothing has synced yet (the UI shows "<owner> is uploading…").
 */
export async function resolveAsset(asset: SharedAsset, preferMaster?: boolean): Promise<{ blob: Blob; tier: AssetTier | 'local' } | null> {
  const local = await idbGet<Blob>(cacheKey(asset.id, 'local'));
  if (local) return { blob: local, tier: 'local' };
  const tier = bestTier(asset, preferMaster);
  if (!tier || tier === 'local') return null;
  const cachedMaster = await idbGet<Blob>(cacheKey(asset.id, 'master'));
  if (cachedMaster) return { blob: cachedMaster, tier: 'master' };
  if (tier === 'proxy') {
    const cachedProxy = await idbGet<Blob>(cacheKey(asset.id, 'proxy'));
    if (cachedProxy) return { blob: cachedProxy, tier: 'proxy' };
  }
  const info = asset.tiers[tier]!;
  const blob = info.path.startsWith('collab/') ? await getObject(info.path) : await getBlob(ref(storage, info.path));
  await idbSet(cacheKey(asset.id, tier), blob).catch(() => {});
  if (tier === 'master') await idbDel(cacheKey(asset.id, 'proxy')).catch(() => {});
  return { blob, tier };
}

export function subscribeAssets(projectId: string, cb: (assets: SharedAsset[]) => void): () => void {
  return onSnapshot(
    ledger(projectId),
    (s) => cb(s.docs.map((d) => d.data() as SharedAsset).sort((a, b) => b.contributedAt - a.contributedAt)),
    () => cb([])
  );
}

/** Contributions grouped by person (the "who brought what" view). */
export function byContributor(assets: SharedAsset[]): Array<{ uid: string; name: string; assets: SharedAsset[] }> {
  const m = new Map<string, { uid: string; name: string; assets: SharedAsset[] }>();
  for (const a of assets) {
    const g = m.get(a.owner) ?? { uid: a.owner, name: a.ownerName, assets: [] };
    g.assets.push(a);
    m.set(a.owner, g);
  }
  return [...m.values()];
}

/** The chain of versions an asset belongs to, oldest first. */
export function versionChain(assets: SharedAsset[], id: string): SharedAsset[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const chain: SharedAsset[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.versionOf ? byId.get(cur.versionOf) : undefined;
  }
  // and anything newer that points at the tip
  let tip = chain[chain.length - 1];
  for (;;) {
    const next = assets.find((a) => a.versionOf === tip?.id && !seen.has(a.id));
    if (!next) break;
    seen.add(next.id);
    chain.push(next);
    tip = next;
  }
  return chain;
}
