// The Melos bridge — the Project view reads the production's songs and arrangements so an
// album can be built from the record you're already writing, and so a song's data (lyrics,
// title, credits) rides along instead of being retyped. "Nothing orphans" is the rule.

import { useEffect, useMemo, useState } from 'react';
import {
  subSongs, subArrangements, flattenLyrics, songDuration,
  type MelosSong, type MelosArrangement,
} from '../../../../services/melosService';

export interface ResolvedSong {
  song: MelosSong;
  /** The audio to master: the chosen track reference, else the newest take that has a URL. */
  url: string | null;
  durationSec: number;
  lyrics: string;
}

/** The song's audio: trackRef wins, otherwise the most recent take carrying a URL. */
export function resolveSongAudio(song: MelosSong): { url: string | null; durationSec: number } {
  if (song.trackRef?.url) return { url: song.trackRef.url, durationSec: song.trackRef.durationSec ?? songDuration(song) ?? 0 };
  const takes = [...(song.takes ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const take = takes.find((t) => !!t.url);
  return { url: take?.url ?? null, durationSec: take?.durationSec ?? songDuration(song) ?? 0 };
}

export function useMelosSongs(productionId?: string) {
  const [songs, setSongs] = useState<MelosSong[]>([]);
  const [arrangements, setArrangements] = useState<MelosArrangement[]>([]);

  useEffect(() => {
    if (!productionId) { setSongs([]); setArrangements([]); return; }
    const un1 = subSongs(productionId, setSongs);
    const un2 = subArrangements(productionId, setArrangements);
    return () => { un1?.(); un2?.(); };
  }, [productionId]);

  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  /** The songs of an arrangement, in running order, with their audio + lyrics resolved. */
  const resolveArrangement = useMemo(() => (arrangementId: string): ResolvedSong[] => {
    const arr = arrangements.find((a) => a.id === arrangementId);
    if (!arr) return [];
    return arr.songIds
      .map((id) => byId.get(id))
      .filter((s): s is MelosSong => !!s)
      .map((song) => {
        const { url, durationSec } = resolveSongAudio(song);
        return { song, url, durationSec, lyrics: flattenLyrics(song.lyrics ?? [], false) };
      });
  }, [arrangements, byId]);

  return { songs, arrangements, resolveArrangement };
}
