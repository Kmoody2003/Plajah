// spatialMix — per-user persistence for the Spatial Mixer (Phase 2 of the Eclipsa/IAMF plan,
// docs/ECLIPSA_SPATIAL_AUDIO_PLAN.md). A saved project stores the full arrangement (positions,
// EQ, IAMF scene/object metadata, master level) plus a locker URL per stem so the mix reopens
// with real audio. Owner-only (collection `spatial_mixes`), stems live in the private
// `personal/` locker — never shared. Mirrors the personal_tracks pattern.
import { db, auth } from './firebase';
import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { uploadFile } from './backendService';
import type { AudioTrack, SerializedTrack, SpatialMixProject } from '../components/spatialMixer/types';

const removeUndefined = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? undefined : v)));

/**
 * Persist a spatial-mix project. Any stem without a `sourceUrl` yet (a freshly-added local
 * file) is first uploaded to the owner's private locker, so reopening the project re-fetches
 * real audio. Returns the saved project (or null if not signed in / no stems).
 */
export async function saveSpatialMix(
  opts: { id?: string; name: string; masterVolume: number; iamf: any },
  liveTracks: AudioTrack[],
  serialized: SerializedTrack[],
): Promise<SpatialMixProject | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const id = opts.id || `smix_${Math.random().toString(36).slice(2, 11)}`;

  // Upload any stems that aren't already in the locker; map id → url.
  const urlById: Record<string, string> = {};
  for (const t of liveTracks) {
    if (t.sourceUrl) { urlById[t.id] = t.sourceUrl; continue; }
    if (t.file) {
      const path = `personal/${user.uid}/spatialmix/${id}/${t.id}_${t.file.name}`;
      try { urlById[t.id] = await uploadFile(path, t.file); } catch { /* skip un-uploadable stem */ }
    }
  }

  const tracks: SerializedTrack[] = serialized
    .map(s => ({ ...s, sourceUrl: urlById[s.id] || s.sourceUrl || '' }))
    .filter(s => !!s.sourceUrl); // only persist stems we can actually re-fetch

  const now = Date.now();
  const project: SpatialMixProject = {
    id, ownerId: user.uid, name: opts.name || 'Spatial Mix',
    masterVolume: opts.masterVolume, tracks, iamf: opts.iamf,
    createdAt: opts.id ? (await getExistingCreatedAt(id)) ?? now : now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'spatial_mixes', id), removeUndefined({ ...project }), { merge: true });
    return project;
  } catch {
    return null;
  }
}

async function getExistingCreatedAt(id: string): Promise<number | null> {
  try {
    const snap = await getDocs(query(collection(db, 'spatial_mixes'), where('id', '==', id)));
    const d = snap.docs[0]?.data() as any;
    return d?.createdAt ?? null;
  } catch { return null; }
}

/** All of the signed-in user's saved mixes, newest first (index-free; sorted in JS). */
export async function fetchSpatialMixes(): Promise<SpatialMixProject[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(query(collection(db, 'spatial_mixes'), where('ownerId', '==', user.uid)));
    return snap.docs.map(d => d.data() as SpatialMixProject).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

export async function deleteSpatialMix(id: string): Promise<void> {
  try { await deleteDoc(doc(db, 'spatial_mixes', id)); } catch { /* best-effort */ }
}
