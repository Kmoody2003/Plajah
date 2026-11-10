/**
 * Album Arranger ⇄ Chora playlist — running-order merge.
 *
 * Pure (no Firebase) so it can be unit-tested. An arrangement published to
 * Chora keeps a `trackMap` (songId → personal_tracks id) and a merge base:
 * the playlist's trackIds as both sides last agreed on them. Reconciling is a
 * three-way merge against that base:
 *
 *   - only the playlist moved   → pull its order into the arrangement
 *   - only the arrangement moved → push its order into the playlist
 *   - both moved                 → the side edited most recently wins
 *
 * Songs with no rendered audio are never in the playlist; they keep their slot
 * in the arrangement. Tracks the artist added to the playlist by hand (not
 * songs from this arrangement) keep their slot in the playlist.
 */

export type SongTrackMap = Record<string, string>;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Linked track ids in arrangement order (songs with no track are skipped). */
export function arrangementTrackOrder(songIds: readonly string[], trackMap: SongTrackMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sid of songIds) {
    const tid = trackMap[sid];
    if (tid && !seen.has(tid)) { out.push(tid); seen.add(tid); }
  }
  return out;
}

/** Just the playlist entries that belong to this arrangement, in playlist order. */
export function linkedPlaylistOrder(playlistTrackIds: readonly string[], trackMap: SongTrackMap): string[] {
  const linked = new Set(Object.values(trackMap));
  const seen = new Set<string>();
  return playlistTrackIds.filter(t => linked.has(t) && !seen.has(t) && (seen.add(t), true));
}

/**
 * The arrangement's order written into the playlist. Foreign tracks stay where
 * they are; the slots that hold this arrangement's tracks are refilled in
 * arrangement order; songs new to the arrangement are appended; songs taken
 * out of the arrangement leave the playlist.
 */
export function arrangementToPlaylistOrder(
  songIds: readonly string[],
  trackMap: SongTrackMap,
  playlistTrackIds: readonly string[],
): string[] {
  const linked = new Set(Object.values(trackMap));
  const wanted = arrangementTrackOrder(songIds, trackMap);
  const queue = [...wanted];
  const out: string[] = [];
  for (const t of playlistTrackIds) {
    if (!linked.has(t)) { out.push(t); continue; }
    const next = queue.shift();
    if (next) out.push(next);
  }
  out.push(...queue);
  return out;
}

/**
 * The playlist's order written into the arrangement. Songs with a track in the
 * playlist are reordered to match it (filling the slots those songs held);
 * songs with no track keep their slot; songs whose track was taken off the
 * playlist leave the arrangement.
 */
export function playlistToArrangementOrder(
  songIds: readonly string[],
  trackMap: SongTrackMap,
  playlistTrackIds: readonly string[],
): string[] {
  const songByTrack = new Map<string, string>();
  for (const [sid, tid] of Object.entries(trackMap)) songByTrack.set(tid, sid);
  const inPlaylist = new Set(playlistTrackIds);
  const ordered = linkedPlaylistOrder(playlistTrackIds, trackMap)
    .map(t => songByTrack.get(t)!)
    .filter(sid => songIds.includes(sid));
  const queue = [...ordered];
  const out: string[] = [];
  for (const sid of songIds) {
    const tid = trackMap[sid];
    if (!tid) { out.push(sid); continue; }          // no audio — stays put
    if (!inPlaylist.has(tid)) continue;             // removed in Chora
    const next = queue.shift();
    if (next) out.push(next);
  }
  return out;
}

export type ReconcileAction = 'none' | 'push' | 'pull';

export interface ReconcileInput {
  songIds: readonly string[];
  trackMap: SongTrackMap;
  playlistTrackIds: readonly string[];
  /** Playlist trackIds as last agreed by both sides. */
  base: readonly string[];
  /** Which side was edited last, used only when both moved. */
  newer: 'arrangement' | 'playlist';
}

export interface ReconcileResult {
  action: ReconcileAction;
  songIds: string[];
  playlistTrackIds: string[];
}

export function reconcileOrder(input: ReconcileInput): ReconcileResult {
  const { songIds, trackMap, playlistTrackIds, base, newer } = input;
  const arr = arrangementTrackOrder(songIds, trackMap);
  const pl = linkedPlaylistOrder(playlistTrackIds, trackMap);
  const b = linkedPlaylistOrder(base, trackMap);
  const arrMoved = !sameList(arr, b);
  const plMoved = !sameList(pl, b);

  const push = (): ReconcileResult => ({
    action: 'push',
    songIds: [...songIds],
    playlistTrackIds: arrangementToPlaylistOrder(songIds, trackMap, playlistTrackIds),
  });
  const pull = (): ReconcileResult => ({
    action: 'pull',
    songIds: playlistToArrangementOrder(songIds, trackMap, playlistTrackIds),
    playlistTrackIds: [...playlistTrackIds],
  });

  if (sameList(arr, pl)) return { action: 'none', songIds: [...songIds], playlistTrackIds: [...playlistTrackIds] };
  if (arrMoved && !plMoved) return push();
  if (plMoved && !arrMoved) return pull();
  return newer === 'playlist' ? pull() : push();
}
