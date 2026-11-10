/**
 * Keeps every Album Arranger arrangement that's published to Chora in step with
 * its playlist while a production is open: listens to each linked playlist,
 * adds locker tracks for newly added songs that have audio, and runs the
 * three-way order merge (services/melosChoraOrder) — pulling Chora reorders in,
 * pushing arranger reorders out. Only the publishing account syncs (the
 * playlist is private to them).
 */

import { useEffect, useRef, useState } from 'react';
import { auth } from '../../services/firebase';
import type { MelosArrangement, MelosProduction, MelosSong } from '../../services/melosService';
import { reconcileOrder } from '../../services/melosChoraOrder';
import {
  ensureSongTracks, songPlayableUrl, subscribeLinkedPlaylist, writePlaylistOrder,
  type LinkedPlaylistState,
} from '../../services/melosChoraPlaylist';

export function useChoraPlaylistSync(opts: {
  enabled: boolean;
  production: MelosProduction | null;
  songs: MelosSong[];
  arrangements: MelosArrangement[];
  editArrangement: (id: string, patch: Partial<MelosArrangement>) => void;
}): Record<string, LinkedPlaylistState> {
  const { enabled, production, songs, arrangements, editArrangement } = opts;
  const uid = auth.currentUser?.uid || null;
  const [playlists, setPlaylists] = useState<Record<string, LinkedPlaylistState>>({});

  const linkedIds = enabled && uid
    ? arrangements
        .filter(a => a.choraPlaylist && a.choraPlaylist.ownerUid === uid)
        .map(a => a.choraPlaylist!.playlistId)
        .sort()
        .join('|')
    : '';

  useEffect(() => {
    if (!linkedIds) { setPlaylists({}); return; }
    const offs = linkedIds.split('|').map(pid =>
      subscribeLinkedPlaylist(pid, p => setPlaylists(cur => ({ ...cur, [pid]: p }))),
    );
    return () => offs.forEach(off => off());
  }, [linkedIds]);

  const busy = useRef(new Set<string>());

  useEffect(() => {
    if (!linkedIds || !production) return;
    const t = window.setTimeout(() => {
      for (const a of arrangements) {
        const link = a.choraPlaylist;
        if (!link || link.ownerUid !== uid) continue;
        const pl = playlists[link.playlistId];
        if (!pl || !pl.exists || busy.current.has(a.id)) continue;

        // Songs newly added to the arrangement that have audio need a locker track first.
        const needTrack = a.songIds.filter(sid => !link.trackMap[sid] && (() => {
          const s = songs.find(x => x.id === sid);
          return !!s && !!songPlayableUrl(s);
        })());

        busy.current.add(a.id);
        void (async () => {
          try {
            const trackMap = needTrack.length
              ? await ensureSongTracks(production, songs, needTrack, link.trackMap)
              : link.trackMap;
            const r = reconcileOrder({
              songIds: a.songIds, trackMap, playlistTrackIds: pl.trackIds, base: link.base,
              newer: pl.updatedAt > (link.syncedAt || 0) && pl.updatedAt >= a.updatedAt ? 'playlist' : 'arrangement',
            });
            const now = Date.now();
            if (r.action === 'push') {
              await writePlaylistOrder(link.playlistId, r.playlistTrackIds);
              editArrangement(a.id, { choraPlaylist: { ...link, trackMap, base: r.playlistTrackIds, syncedAt: now } });
            } else if (r.action === 'pull') {
              editArrangement(a.id, { songIds: r.songIds, choraPlaylist: { ...link, trackMap, base: pl.trackIds, syncedAt: now } });
            } else if (trackMap !== link.trackMap || JSON.stringify(link.base) !== JSON.stringify(pl.trackIds)) {
              editArrangement(a.id, { choraPlaylist: { ...link, trackMap, base: pl.trackIds, syncedAt: now } });
            }
          } catch (err) {
            console.warn('[Album Arranger] Chora playlist sync failed', err);
          } finally {
            busy.current.delete(a.id);
          }
        })();
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [linkedIds, production, songs, arrangements, playlists, editArrangement, uid]);

  return playlists;
}
