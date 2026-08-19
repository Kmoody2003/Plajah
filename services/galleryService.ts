// Plajah Gallery — persistence + comments + likes.
// A gallery is a shareable, self-contained photo experience (like sharing a Chora album).
// Mirrors the Firestore patterns in backendService (auth guards, serverTimestamp/Date.now(),
// undefined-stripping before writes — Firestore rejects `undefined` field values).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth } from './backendService';
import { storage } from './firebase';
import { PhotoAlbum, PhotoGallery, GalleryComment, Photo } from '../types';

const COL = 'photo_galleries';

/** Firestore rejects writes containing `undefined` — strip them (shallow) first. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k];
  return out as T;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const createGallery = async (data: Partial<PhotoGallery>): Promise<PhotoGallery | null> => {
  if (!auth.currentUser) return null;
  const id = data.id || `gallery_${Date.now()}`;
  const visibility = data.visibility || (data.isPublic === false ? 'PRIVATE' : 'PUBLIC');
  const gallery: PhotoGallery = stripUndefined({
    id,
    ownerId: auth.currentUser.uid,
    title: data.title || 'Untitled Gallery',
    description: data.description,
    photoIds: data.photoIds || [],
    isPublic: visibility === 'PUBLIC',
    timestamp: Date.now(),
    order: data.order,
    viewType: data.viewType || 'MODERN',
    coverImage: data.coverImage,
    curatorName: data.curatorName,
    tagline: data.tagline,
    visibility,
    soundtrackAlbumId: data.soundtrackAlbumId,
    soundtrackTrackId: data.soundtrackTrackId,
    models3d: data.models3d,
    audioNotes: data.audioNotes,
    likesCount: 0,
  }) as PhotoGallery;
  try {
    await setDoc(doc(db, COL, id), gallery);
    return gallery;
  } catch (e) {
    console.error('[galleryService] createGallery failed', e);
    return null;
  }
};

export const fetchGallery = async (id: string): Promise<PhotoGallery | null> => {
  try {
    const snap = await getDoc(doc(db, COL, id));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as PhotoGallery) }) : null;
  } catch (e) {
    console.error('[galleryService] fetchGallery failed', e);
    return null;
  }
};

export const fetchUserGalleries = async (uid: string): Promise<PhotoGallery[]> => {
  try {
    const q = query(collection(db, COL), where('ownerId', '==', uid), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as PhotoGallery) }));
  } catch (e) {
    console.error('[galleryService] fetchUserGalleries failed', e);
    return [];
  }
};

export const fetchPublicGalleries = async (): Promise<PhotoGallery[]> => {
  try {
    const q = query(
      collection(db, COL),
      where('isPublic', '==', true),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as PhotoGallery) }));
  } catch (e) {
    console.error('[galleryService] fetchPublicGalleries failed', e);
    return [];
  }
};

export const updateGallery = async (id: string, patch: Partial<PhotoGallery>): Promise<void> => {
  if (!auth.currentUser) return;
  // Keep the legacy isPublic flag in sync when visibility changes.
  const next = { ...patch };
  if (patch.visibility && patch.isPublic === undefined) next.isPublic = patch.visibility === 'PUBLIC';
  try {
    await updateDoc(doc(db, COL, id), stripUndefined(next));
  } catch (e) {
    console.error('[galleryService] updateGallery failed', e);
  }
};

export const deleteGallery = async (id: string): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    await deleteDoc(doc(db, COL, id));
  } catch (e) {
    console.error('[galleryService] deleteGallery failed', e);
  }
};

// ── comments ────────────────────────────────────────────────────────────────

export const addGalleryComment = async (
  galleryId: string,
  text: string,
  author?: { name?: string; photo?: string }
): Promise<void> => {
  if (!auth.currentUser || !text.trim()) return;
  const path = `${COL}/${galleryId}/comments`;
  try {
    await addDoc(collection(db, path), stripUndefined({
      galleryId,
      authorId: auth.currentUser.uid,
      authorName: author?.name,
      authorPhoto: author?.photo,
      text: text.trim(),
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    }));
  } catch (e) {
    console.error('[galleryService] addGalleryComment failed', e);
  }
};

/** Live comments listener; returns an unsubscribe fn. Ordered oldest → newest. */
export const listenGalleryComments = (
  galleryId: string,
  cb: (comments: GalleryComment[]) => void
): (() => void) => {
  const path = `${COL}/${galleryId}/comments`;
  try {
    const q = query(collection(db, path), orderBy('timestamp', 'asc'), limit(200));
    return onSnapshot(
      q,
      snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<GalleryComment, 'id'>) }))),
      err => { console.error('[galleryService] listenGalleryComments failed', err); cb([]); }
    );
  } catch (e) {
    console.error('[galleryService] listenGalleryComments setup failed', e);
    return () => {};
  }
};

// ── likes ─────────────────────────────────────────────────────────────────────

/** Toggle the current user's like on a gallery. Likers live at photo_galleries/{id}/likes/{uid}. */
export const toggleGalleryLike = async (galleryId: string, like: boolean): Promise<void> => {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    await updateDoc(doc(db, COL, galleryId), {
      likesCount: increment(like ? 1 : -1),
      likedBy: like ? arrayUnion(uid) : arrayRemove(uid),
    });
  } catch (e) {
    console.error('[galleryService] toggleGalleryLike failed', e);
  }
};

// ── media uploads (gallery-scoped audio notes + 3D models) ─────────────────────
// Both write under users/{uid}/** where the existing Storage rules already let the
// owner write, mirroring uploadFabulaAsset in backendService. Paths are stable per
// (gallery, photo) / (gallery, file) so re-records overwrite rather than orphan.

const safeName = (s: string) => (s || 'file').toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(-64);

/**
 * Upload a per-photo voice note (a MediaRecorder blob, ≤30s — the cap is enforced in the
 * recorder UI). Returns the download URL to store in `PhotoGallery.audioNotes[photoId]`.
 * A stable path means re-recording the same photo's note overwrites the old object.
 */
export const uploadGalleryAudioNote = async (
  uid: string,
  galleryId: string,
  photoId: string,
  blob: Blob,
): Promise<string | null> => {
  if (!uid || !galleryId || !photoId) return null;
  try {
    const path = `users/${uid}/galleryAudio/${galleryId}/${photoId}.webm`;
    const sRef = ref(storage, path);
    await uploadBytes(sRef, blob, { contentType: blob.type || 'audio/webm' });
    return await getDownloadURL(sRef);
  } catch (e) {
    console.error('[galleryService] uploadGalleryAudioNote failed', e);
    return null;
  }
};

/**
 * Upload a GLTF/GLB model for the Walk-in museum plinths. Returns the download URL to
 * append to `PhotoGallery.models3d[]`. Path is timestamped so multiple models coexist.
 */
export const uploadGalleryModel = async (
  uid: string,
  file: File,
): Promise<string | null> => {
  if (!uid || !file) return null;
  try {
    const path = `users/${uid}/galleryModels/${Date.now()}_${safeName(file.name)}`;
    const sRef = ref(storage, path);
    await uploadBytes(sRef, file, { contentType: file.type || 'model/gltf-binary' });
    return await getDownloadURL(sRef);
  } catch (e) {
    console.error('[galleryService] uploadGalleryModel failed', e);
    return null;
  }
};

// ── ephemeral / preview ─────────────────────────────────────────────────────

/**
 * Build an in-memory PhotoGallery from an album (or a loose set of photos) WITHOUT
 * persisting it — so a gallery is viewable before any creation editor exists.
 * `galleryFromAlbum` accepts either a real PhotoAlbum or a lightweight `{ title, photoIds }`.
 */
export const galleryFromAlbum = (
  album: Pick<PhotoAlbum, 'id' | 'title' | 'ownerId' | 'photoIds'> & Partial<PhotoAlbum> & { curatorName?: string },
  photos: Photo[]
): PhotoGallery => {
  const ids = album.photoIds && album.photoIds.length
    ? album.photoIds
    : photos.map(p => p.id);
  const cover = photos.find(p => ids.includes(p.id))?.url || photos[0]?.url;
  return {
    id: album.id || `preview_${Date.now()}`,
    ownerId: album.ownerId || photos[0]?.ownerId || '',
    title: album.title || 'Gallery',
    description: album.description,
    photoIds: ids,
    isPublic: album.isPublic ?? false,
    timestamp: album.timestamp || Date.now(),
    order: album.order,
    viewType: 'MODERN',
    coverImage: cover,
    curatorName: (album as any).curatorName,
    visibility: (album.isPublic ?? false) ? 'PUBLIC' : 'PRIVATE',
    likesCount: 0,
  };
};
