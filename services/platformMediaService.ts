// Plajah platform media library — the ONE central repository of platform-owned branding: bumpers,
// idents, house ads, TV-app open bumpers, Taleo pre-rolls, and platform programming. Admin-managed;
// every on-platform broadcast (FAST channels, the TV app launch, the Taleo player) pulls from here.

import { db, auth } from './backendService';
import {
  collection, doc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import type { PlatformMediaAsset, PlatformMediaKind } from '../types';

const COLLECTION = 'platform_media';

/** All active assets of a kind (or every kind when omitted). */
export async function fetchPlatformMedia(kind?: PlatformMediaKind): Promise<PlatformMediaAsset[]> {
  try {
    const q = kind
      ? query(collection(db, COLLECTION), where('kind', '==', kind))
      : query(collection(db, COLLECTION));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) } as PlatformMediaAsset))
      .filter(a => a.isActive !== false && !!a.url)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.warn('[platformMedia] fetch failed', e);
    return [];
  }
}

/** Admin list — includes inactive, for management. */
export async function fetchAllPlatformMedia(): Promise<PlatformMediaAsset[]> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PlatformMediaAsset))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.warn('[platformMedia] fetchAll failed', e);
    return [];
  }
}

export async function savePlatformMediaAsset(asset: Partial<PlatformMediaAsset> & { kind: PlatformMediaKind; title: string; url: string }): Promise<string> {
  const id = asset.id || doc(collection(db, COLLECTION)).id;
  const clean: Record<string, any> = {
    kind: asset.kind,
    title: asset.title,
    url: asset.url,
    isActive: asset.isActive ?? true,
    weight: asset.weight ?? 1,
    createdBy: asset.createdBy || auth.currentUser?.uid || null,
    createdAt: asset.createdAt || Date.now(),
    updatedAt: Date.now(),
    _ts: serverTimestamp(),
  };
  // Only write optional fields when present (Firestore rejects undefined).
  if (asset.thumbnailUrl) clean.thumbnailUrl = asset.thumbnailUrl;
  if (asset.durationSeconds) clean.durationSeconds = Math.round(asset.durationSeconds);
  if (asset.category) clean.category = asset.category;
  await setDoc(doc(db, COLLECTION, id), clean, { merge: true });
  return id;
}

export async function deletePlatformMediaAsset(id: string): Promise<void> {
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) { console.warn('[platformMedia] delete failed', e); }
}

/** Weighted-random pick of one active asset of a kind (TV open bumper, Taleo pre-roll, …). */
export function pickRandomPlatformAsset(assets: PlatformMediaAsset[]): PlatformMediaAsset | null {
  const pool = assets.filter(a => a.isActive !== false && !!a.url);
  if (!pool.length) return null;
  const total = pool.reduce((s, a) => s + Math.max(0.01, a.weight ?? 1), 0);
  // Math.random is fine in app runtime (only banned in workflow scripts).
  let r = Math.random() * total;
  for (const a of pool) { r -= Math.max(0.01, a.weight ?? 1); if (r <= 0) return a; }
  return pool[0];
}

/** Convenience: fetch + pick one random active asset of a kind (used by the TV open + Taleo pre-roll). */
export async function fetchRandomPlatformAsset(kind: PlatformMediaKind): Promise<PlatformMediaAsset | null> {
  return pickRandomPlatformAsset(await fetchPlatformMedia(kind));
}
