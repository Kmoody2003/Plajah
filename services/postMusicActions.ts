// Music actions a social post offers on the song it carries: Favorite, Add to library, Add to
// playlist (PlaylistPickerModal) and Follow the artist — for Plajah Chora releases and Audius tracks.
//
// Where each lands:
//  • Favorite  — Chora track → users/{uid}.favoriteTrackIds. Audius track → the real Audius favorite
//                (the card already owns that call, so this file only handles the Chora side).
//  • Library   — users/{uid}.library (track ids, the Locker's "Library"). Tracks that don't live in a
//                public Chora album (Audius) also keep a small snapshot in libraryExternal.{id}, so the
//                Locker can list them without an album to resolve them from (fetchUserLibraryTracks).
//  • Follow    — Chora artist → followUser/unfollowUser (the normal Plajah follow). Audius artist →
//                followAudiusUser/unfollowAudiusUser on the connected Audius account.
//
// The viewer's own lists are read once per session (one users/{uid} get, shared by every post on the
// screen) and kept current locally as they tap, so a long feed costs one read, not one per post.

import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteField, FieldPath } from 'firebase/firestore';
import { db } from './firebase';
import { auth, followUser, unfollowUser, isFollowing } from './backendService';
import type { Album, Track } from '../types';

export interface LibraryTrackSnapshot {
  id: string;
  title: string;
  artist: string;
  url: string;
  artistId?: string;
  albumId?: string;
  albumCover?: string;
  duration?: number;
  source?: 'AUDIUS' | 'CHORA';
  addedAt: number;
}

interface MyMusicLists { uid: string; favorites: Set<string>; library: Set<string> }

let listsPromise: Promise<MyMusicLists | null> | null = null;
let listsUid: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* listener errors stay local */ } });

/** The viewer's favorites + library, read once per signed-in user. */
export function loadMyMusicLists(): Promise<MyMusicLists | null> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid) return Promise.resolve(null);
  if (listsPromise && listsUid === uid) return listsPromise;
  listsUid = uid;
  listsPromise = getDoc(doc(db, 'users', uid))
    .then(snap => {
      const d = (snap.exists() ? snap.data() : {}) as { favoriteTrackIds?: string[]; library?: string[] };
      return { uid, favorites: new Set(d.favoriteTrackIds || []), library: new Set(d.library || []) };
    })
    .catch(() => ({ uid, favorites: new Set<string>(), library: new Set<string>() }));
  return listsPromise;
}

export function subscribeMyMusicLists(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Chora favorite on/off. Returns the new state, or null when signed out / the write failed. */
export async function setChoraFavorite(trackId: string, on: boolean): Promise<boolean | null> {
  const lists = await loadMyMusicLists();
  if (!lists) return null;
  try {
    await updateDoc(doc(db, 'users', lists.uid), { favoriteTrackIds: on ? arrayUnion(trackId) : arrayRemove(trackId) });
    if (on) lists.favorites.add(trackId); else lists.favorites.delete(trackId);
    emit();
    return on;
  } catch (e) {
    console.warn('[postMusic] favorite failed', e);
    return null;
  }
}

/** True when the track can't be found in a public Chora album (so the Locker needs a snapshot). */
const isExternalTrack = (trackId: string) => /^audius_/.test(trackId);

export async function setInLibrary(track: Track, album: Album | null, on: boolean): Promise<boolean | null> {
  const lists = await loadMyMusicLists();
  if (!lists) return null;
  const ref = doc(db, 'users', lists.uid);
  try {
    if (isExternalTrack(track.id)) {
      const snap: LibraryTrackSnapshot = {
        id: track.id,
        title: track.title || 'Untitled',
        artist: track.artist || album?.artist || '',
        url: track.url || '',
        ...(track.artistId || album?.ownerId ? { artistId: track.artistId || album?.ownerId } : {}),
        ...(album?.id ? { albumId: album.id } : {}),
        ...(album?.coverImage ? { albumCover: album.coverImage } : {}),
        ...(typeof track.duration === 'number' ? { duration: track.duration } : {}),
        source: 'AUDIUS',
        addedAt: Date.now(),
      };
      await updateDoc(ref,
        'library', on ? arrayUnion(track.id) : arrayRemove(track.id),
        new FieldPath('libraryExternal', track.id), on ? snap : deleteField(),
      );
    } else {
      await updateDoc(ref, { library: on ? arrayUnion(track.id) : arrayRemove(track.id) });
    }
    if (on) lists.library.add(track.id); else lists.library.delete(track.id);
    emit();
    return on;
  } catch (e) {
    console.warn('[postMusic] library failed', e);
    return null;
  }
}

export function isChoraFavorite(trackId: string, lists: MyMusicLists | null) { return Boolean(lists?.favorites.has(trackId)); }
export function isInLibrary(trackId: string, lists: MyMusicLists | null) { return Boolean(lists?.library.has(trackId)); }

// Plajah follow state, cached per artist for the session (many posts share an artist).
const followCache = new Map<string, Promise<boolean>>();
export function isFollowingArtist(uid: string): Promise<boolean> {
  if (!auth.currentUser || uid === auth.currentUser.uid) return Promise.resolve(false);
  let p = followCache.get(uid);
  if (!p) { p = isFollowing(uid).catch(() => false); followCache.set(uid, p); }
  return p;
}
/** 'requested' = a private account took a follow request; null = not done (signed out, rate limit, blocked, error). */
export async function setFollowArtist(uid: string, on: boolean): Promise<boolean | 'requested' | null> {
  if (!auth.currentUser || uid === auth.currentUser.uid) return null;
  try {
    if (on) {
      const r = await followUser(uid);
      if (r === 'requested') return 'requested';
      if (r !== 'followed' && r !== 'already') return null;
    } else {
      await unfollowUser(uid);
    }
    followCache.set(uid, Promise.resolve(on));
    emit();
    return on;
  } catch (e) {
    console.warn('[postMusic] follow failed', e);
    return null;
  }
}
