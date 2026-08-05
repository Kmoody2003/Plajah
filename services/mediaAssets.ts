// mediaAssets — Phase 1 of the PlayGround.api integration (docs/MEDIA_LIBRARY_API_INTEGRATION.md).
// One canonical, standardized, publicly-readable record per published work, spanning
// every Plajah service (Chora/Taleo/Lorea/Reello). It's the index behind the Content
// Asset Manager and the payload for the public federation API (/api/artists/:id/media).
import { db } from './firebase';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { buildShareUrl } from './deepLinkService';
import type { Album } from '../types';

/** Standardized cross-service asset record (mirrors PlayGround.api's mediaAsset schema). */
export interface MediaAsset {
  id: string;
  artistId: string;
  title: string;
  type: string;        // MUSIC | VIDEO | BOOK | …
  service: string;     // CHORA | TALEO | LOREA | REELLO | OTHER
  status: string;      // PUBLIC | DRAFT | PRIVATE | SCHEDULED
  originUrl: string;   // canonical, shareable link back to the asset on Plajah
  cover?: string;
  releaseDate?: number;
  playCount?: number;
  updatedAt: number;
}

const strip = <T extends Record<string, any>>(o: T): T => {
  const out: any = {};
  for (const k in o) if (o[k] !== undefined) out[k] = o[k];
  return out;
};

const serviceForAlbum = (al: Album): string => {
  if (al.type === 'MUSIC') return 'CHORA';
  if (al.type === 'BOOK') return 'LOREA';
  if (al.type === 'VIDEO') return (al.subType === 'MOVIE' || al.subType === 'TV_SERIES') ? 'TALEO' : 'REELLO';
  return 'OTHER';
};

const statusFor = (a: any): string =>
  a?.isScheduled ? 'SCHEDULED' : a?.isDraft ? 'DRAFT' : (a?.isPrivate || a?.isPublic === false) ? 'PRIVATE' : 'PUBLIC';

const originForAlbum = (al: Album): string => {
  if (al.type === 'VIDEO' && (al.subType === 'MOVIE' || al.subType === 'TV_SERIES')) return buildShareUrl('movie', al.id);
  if (al.type === 'BOOK') return buildShareUrl('book', al.id);
  return buildShareUrl('album', al.id);
};

/** Upsert the canonical index record for an album/film/book/EP on publish. Non-fatal. */
export async function upsertMediaAssetFromAlbum(al: Album): Promise<void> {
  if (!al?.id || !(al as any).ownerId) return;
  const rec: MediaAsset = strip({
    id: al.id,
    artistId: (al as any).ownerId,
    title: al.title || 'Untitled',
    type: al.type || 'ASSET',
    service: serviceForAlbum(al),
    status: statusFor(al),
    originUrl: originForAlbum(al),
    cover: al.coverImage || undefined,
    releaseDate: (al as any).releaseDate,
    playCount: (al as any).playCount || 0,
    updatedAt: Date.now(),
  });
  try { await setDoc(doc(db, 'mediaAssets', al.id), rec, { merge: true }); }
  catch { /* index write is best-effort — the source collections remain the truth */ }
}

/** A creator's canonical catalog (all statuses for the owner). */
export async function fetchMediaAssets(artistId: string): Promise<MediaAsset[]> {
  try {
    const snap = await getDocs(query(collection(db, 'mediaAssets'), where('artistId', '==', artistId)));
    return snap.docs.map(d => d.data() as MediaAsset).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}
