/**
 * Album Arranger → Chora playlist.
 *
 * An arrangement (album running order or live setlist) is published as the
 * artist's own playlist in `personal_playlists` — owner-only by Firestore rules,
 * so it is private until they choose to share it. Each song with rendered audio
 * becomes a private locker track (`personal_tracks`); songs with no audio yet
 * are left off and listed in the arranger.
 *
 * Order is kept in sync both ways by a three-way merge (services/melosChoraOrder):
 *   - the Album Arranger runs useChoraPlaylistSync while a production is open;
 *   - backendService.updatePlaylist calls syncPlaylistIntoArrangement whenever a
 *     linked playlist's track order changes in Chora, so the arrangement follows
 *     even when the arranger is closed.
 */

import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, opsDb } from './firebase';
import {
  patchArrangement,
  type ChoraPlaylistLink, type MelosArrangement, type MelosProduction, type MelosSong,
} from './melosService';
import { arrangementToPlaylistOrder, arrangementTrackOrder, reconcileOrder } from './melosChoraOrder';

const PLAYLISTS = 'personal_playlists';
const TRACKS = 'personal_tracks';

/** The audio a listener would hear: the song's linked track, else its newest take. */
export function songPlayableUrl(s: MelosSong): string | null {
  if (s.trackRef?.url) return s.trackRef.url;
  const takes = (s.takes || []).filter(t => !!t.url).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return takes[0]?.url || null;
}

export const melosTrackId = (songId: string) => `ptrack_melos_${songId}`;
export const melosPlaylistId = (arrangementId: string) => `playlist_melos_${arrangementId}`;

const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

/**
 * Make sure every song in `songIds` that has audio has a locker track, and return
 * the updated songId → trackId map. A song already linked to a locker track
 * reuses it; otherwise a private track mirrors the song's current audio.
 */
export async function ensureSongTracks(
  production: Pick<MelosProduction, 'id' | 'title' | 'artistName' | 'coverImage'>,
  songs: MelosSong[],
  songIds: string[],
  trackMap: Record<string, string>,
  opts: { refreshAudio?: boolean } = {},
): Promise<Record<string, string>> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to publish to Chora.');
  const byId = new Map(songs.map(s => [s.id, s]));
  const next = { ...trackMap };
  for (const sid of songIds) {
    const s = byId.get(sid);
    if (!s) continue;
    const url = songPlayableUrl(s);
    if (!url) continue;
    if (next[sid] && !opts.refreshAudio) continue;
    if (s.trackRef?.source === 'LOCKER' && s.trackRef.trackId && s.trackRef.url === url) {
      next[sid] = s.trackRef.trackId;
      continue;
    }
    const id = melosTrackId(sid);
    const dur = s.durationSec || s.trackRef?.durationSec;
    await setDoc(doc(db, TRACKS, id), clean({
      id,
      ownerId: uid,
      title: s.title || 'Untitled',
      artist: production.artistName || 'Me',
      url,
      duration: dur,
      albumTitle: production.title,
      albumCover: production.coverImage,
      isPersonalMedia: true,
      isGlobalArchive: false,
      rightsOwnerId: uid,
      melosProdId: production.id,
      melosSongId: sid,
      timestamp: Date.now(),
    }), { merge: true });
    next[sid] = id;
  }
  return next;
}

/**
 * Publish (or re-publish) an arrangement as a private Chora playlist.
 * Re-publishing refreshes the audio of every song and keeps any tracks the
 * artist added to the playlist by hand.
 */
export async function publishArrangementToChora(
  production: Pick<MelosProduction, 'id' | 'title' | 'artistName' | 'coverImage'>,
  arr: MelosArrangement,
  songs: MelosSong[],
): Promise<ChoraPlaylistLink> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to publish to Chora.');
  const prior = arr.choraPlaylist && arr.choraPlaylist.ownerUid === uid ? arr.choraPlaylist : null;
  const trackMap = await ensureSongTracks(production, songs, arr.songIds, prior?.trackMap || {}, { refreshAudio: true });
  const playlistId = prior?.playlistId || melosPlaylistId(arr.id);
  const ref = doc(db, PLAYLISTS, playlistId);
  const snap = await getDoc(ref).catch(() => null);
  const existing = snap?.exists() ? (snap.data().trackIds as string[] | undefined) || [] : [];
  const trackIds = existing.length
    ? arrangementToPlaylistOrder(arr.songIds, trackMap, existing)
    : arrangementTrackOrder(arr.songIds, trackMap);
  const now = Date.now();
  const title = production.title && production.title !== arr.name ? `${production.title} — ${arr.name}` : arr.name;
  await setDoc(ref, clean({
    id: playlistId,
    ownerId: uid,
    title,
    description: `Running order from the Album Arranger. Reorder here and the arrangement follows.`,
    coverUrl: production.coverImage,
    trackIds,
    melosLink: { prodId: production.id, arrangementId: arr.id },
    timestamp: snap?.exists() ? (snap.data().timestamp as number) || now : now,
    updatedAt: now,
  }), { merge: true });
  const link: ChoraPlaylistLink = {
    playlistId, ownerUid: uid, trackMap, base: trackIds,
    publishedAt: prior?.publishedAt || now, syncedAt: now,
  };
  await patchArrangement(production.id, arr.id, { choraPlaylist: link });
  return link;
}

/** Stop syncing. The playlist stays in the artist's Chora library as a normal playlist. */
export async function unlinkArrangementFromChora(prodId: string, arr: MelosArrangement): Promise<void> {
  const link = arr.choraPlaylist;
  await patchArrangement(prodId, arr.id, { choraPlaylist: null });
  if (link && link.ownerUid === auth.currentUser?.uid) {
    await updateDoc(doc(db, PLAYLISTS, link.playlistId), { melosLink: null, updatedAt: Date.now() }).catch(() => {});
  }
}

export interface LinkedPlaylistState { trackIds: string[]; updatedAt: number; exists: boolean }

export function subscribeLinkedPlaylist(playlistId: string, cb: (p: LinkedPlaylistState) => void): () => void {
  return onSnapshot(
    doc(db, PLAYLISTS, playlistId),
    snap => {
      const d = snap.data() as { trackIds?: string[]; updatedAt?: number; timestamp?: number } | undefined;
      cb({ exists: snap.exists(), trackIds: d?.trackIds || [], updatedAt: d?.updatedAt || d?.timestamp || 0 });
    },
    () => { /* not the owner / offline — the arranger shows the link without syncing */ },
  );
}

export async function writePlaylistOrder(playlistId: string, trackIds: string[]): Promise<void> {
  await updateDoc(doc(db, PLAYLISTS, playlistId), { trackIds, updatedAt: Date.now() });
}

/**
 * Chora side: a linked playlist's order changed — carry it into the arrangement.
 * Called by backendService.updatePlaylist; safe to call for any playlist.
 */
export async function syncPlaylistIntoArrangement(playlistId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const pSnap = await getDoc(doc(db, PLAYLISTS, playlistId)).catch(() => null);
  const pl = pSnap?.data() as { trackIds?: string[]; melosLink?: { prodId: string; arrangementId: string } | null } | undefined;
  if (!pl?.melosLink) return;
  const { prodId, arrangementId } = pl.melosLink;
  const aSnap = await getDoc(doc(opsDb, 'melosProductions', prodId, 'arrangements', arrangementId)).catch(() => null);
  const arr = aSnap?.data() as MelosArrangement | undefined;
  const link = arr?.choraPlaylist;
  if (!arr || !link || link.playlistId !== playlistId || link.ownerUid !== uid) return;
  const trackIds = pl.trackIds || [];
  const r = reconcileOrder({ songIds: arr.songIds, trackMap: link.trackMap, playlistTrackIds: trackIds, base: link.base, newer: 'playlist' });
  if (r.action === 'pull') {
    await patchArrangement(prodId, arrangementId, { songIds: r.songIds, choraPlaylist: { ...link, base: trackIds, syncedAt: Date.now() } });
  } else if (r.action === 'none' && JSON.stringify(link.base) !== JSON.stringify(trackIds)) {
    await patchArrangement(prodId, arrangementId, { choraPlaylist: { ...link, base: trackIds, syncedAt: Date.now() } });
  }
  // 'push' can't happen with newer:'playlist' unless only the arrangement moved;
  // the arranger's own sync handles that the next time it's open.
}
