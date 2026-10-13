// paiGenerationHistory.ts — Persistent Chronological Storage & Photo Album Sync for Plajah AI Generations.
//
// 1. IndexedDB persistent storage via idb-keyval: unlimited runs, offline-first, instant loading.
// 2. Synchronizes automatically to the user's Photos account under the "PAI Generations" album.
// 3. Emits 'plajah:pai-history-updated' window events so Tela documents and studio panes stay live.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { auth, db, uploadPhoto, createPhotoAlbum } from '../backendService';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { PhotoAlbum } from '../../types';

export interface PaiGenerationItem {
  id: string;
  url: string; // Base64 data URL or media URI
  prompt: string;
  modelId: string;
  modelName?: string;
  aspect?: string;
  lens?: string;
  lighting?: string;
  cameraAngle?: string;
  hallucinationLevel?: number;
  resemblance?: number;
  timestamp: number;
  width: number;
  height: number;
  seed?: number;
  sourceImageUrl?: string;
  op?: string;
  durationMs?: number;
  hardware?: string;
  favorite?: boolean;
  syncedToPhotos?: boolean;
  photoId?: string;
  albumId?: string;
}

const STORAGE_KEY = 'plajah:pai:generations';
const MAX_LOCAL_ITEMS = 500;

function notifyHistoryChange(items: PaiGenerationItem[]) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plajah:pai-history-updated', { detail: { items } }));
  }
}

/**
 * Retrieve all past generations chronologically (newest first).
 */
export async function getPaiGenerations(): Promise<PaiGenerationItem[]> {
  try {
    const list = (await idbGet(STORAGE_KEY)) as PaiGenerationItem[] | undefined;
    if (Array.isArray(list)) {
      return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  } catch (err) {
    console.warn('[PaiHistory] Failed to read from IndexedDB:', err);
  }
  return [];
}

/**
 * Persist a new generation into local chronological history, and queue background sync to user's photos.
 */
export async function savePaiGeneration(
  entry: Omit<PaiGenerationItem, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
): Promise<PaiGenerationItem> {
  const item: PaiGenerationItem = {
    ...entry,
    id: entry.id || `pai_gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: entry.timestamp || Date.now(),
    favorite: entry.favorite || false,
    syncedToPhotos: false,
  };

  try {
    const existing = await getPaiGenerations();
    // Prevent duplicate entries
    const filtered = existing.filter((x) => x.id !== item.id);
    const updated = [item, ...filtered].slice(0, MAX_LOCAL_ITEMS);
    await idbSet(STORAGE_KEY, updated);
    notifyHistoryChange(updated);
  } catch (err) {
    console.error('[PaiHistory] Failed to save generation locally:', err);
  }

  // Non-blocking background sync to the user's Photos account
  void syncPaiGenerationToPhotos(item).catch((err) => {
    console.warn('[PaiHistory] Non-fatal photos account sync notice:', err);
  });

  return item;
}

/**
 * Convert a base64 Data URL to a native File object for upload.
 */
function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Locates or creates the dedicated "PAI Generations" album for the current signed-in user.
 */
async function getOrCreatePaiAlbum(uid: string): Promise<PhotoAlbum | null> {
  try {
    const q = query(
      collection(db, 'photo_albums'),
      where('ownerId', '==', uid),
      where('title', '==', 'PAI Generations')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as PhotoAlbum;
    }

    // Create the dedicated album
    const newAlbum = await createPhotoAlbum({
      title: 'PAI Generations',
      description: 'Plajah AI Generations & Directorial Synthetics',
      isPublic: false,
      photoIds: [],
    });
    return (newAlbum as PhotoAlbum) || null;
  } catch (e) {
    console.warn('[PaiHistory] Error finding/creating PAI Generations album:', e);
    return null;
  }
}

/**
 * Asynchronously synchronizes a generation into the user's Photos account under the "PAI Generations" album.
 */
export async function syncPaiGenerationToPhotos(item: PaiGenerationItem): Promise<boolean> {
  if (!auth.currentUser || !item.url) return false;
  const uid = auth.currentUser.uid;

  try {
    const file = dataUrlToFile(item.url, `${item.id}.png`);
    if (!file) return false;

    const album = await getOrCreatePaiAlbum(uid);

    const title = item.prompt ? item.prompt.slice(0, 50) : 'PAI Generation';
    const uploadedPhoto = await uploadPhoto(file, {
      title,
      description: item.prompt,
      tags: ['ai', 'synthetic', 'pai', 'pai-generations'],
      albumId: album ? album.id : undefined,
      isPublic: false,
      isGalleryEligible: true,
      width: item.width,
      height: item.height,
    });

    if (uploadedPhoto) {
      // If album exists, associate photo ID with the album
      if (album) {
        try {
          const albumRef = doc(db, 'photo_albums', album.id);
          await updateDoc(albumRef, {
            photoIds: arrayUnion(uploadedPhoto.id),
          });
        } catch (e) {
          console.warn('[PaiHistory] Could not update photo album:', e);
        }
      }

      // Mark as synced locally
      item.syncedToPhotos = true;
      item.photoId = uploadedPhoto.id;
      if (album) item.albumId = album.id;

      const current = await getPaiGenerations();
      const updated = current.map((x) => (x.id === item.id ? { ...x, syncedToPhotos: true, photoId: uploadedPhoto.id, albumId: album?.id } : x));
      await idbSet(STORAGE_KEY, updated);
      notifyHistoryChange(updated);
      return true;
    }
  } catch (err) {
    console.warn('[PaiHistory] Failed to sync generation to Photos account:', err);
  }
  return false;
}

/**
 * Remove an item from the history.
 */
export async function deletePaiGeneration(id: string): Promise<void> {
  try {
    const existing = await getPaiGenerations();
    const updated = existing.filter((x) => x.id !== id);
    await idbSet(STORAGE_KEY, updated);
    notifyHistoryChange(updated);
  } catch (err) {
    console.error('[PaiHistory] Failed to delete generation:', err);
  }
}

/**
 * Toggle favorite status.
 */
export async function toggleFavoritePaiGeneration(id: string): Promise<boolean> {
  try {
    const existing = await getPaiGenerations();
    let newFavState = false;
    const updated = existing.map((x) => {
      if (x.id === id) {
        newFavState = !x.favorite;
        return { ...x, favorite: newFavState };
      }
      return x;
    });
    await idbSet(STORAGE_KEY, updated);
    notifyHistoryChange(updated);
    return newFavState;
  } catch (err) {
    console.error('[PaiHistory] Failed to toggle favorite:', err);
    return false;
  }
}

/**
 * Subscribe to history changes. Calls callback immediately with current items.
 */
export function subscribePaiGenerations(callback: (items: PaiGenerationItem[]) => void): () => void {
  void getPaiGenerations().then(callback);

  const listener = (event: Event) => {
    const custom = event as CustomEvent<{ items?: PaiGenerationItem[] }>;
    if (custom.detail?.items) {
      callback(custom.detail.items);
    } else {
      void getPaiGenerations().then(callback);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('plajah:pai-history-updated', listener);
    return () => window.removeEventListener('plajah:pai-history-updated', listener);
  }
  return () => {};
}
