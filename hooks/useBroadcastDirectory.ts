// useBroadcastDirectory — the one source of truth for "everything broadcasting on Plajah right now".
// Aggregates active live streams, FAST channels + external/Reello live sources, and streaming radio,
// with the current user's follows for personalisation. Powers the Social Broadcast hub AND the
// mobile Live Hub, so both surfaces show the same live picture.

import { useEffect, useState } from 'react';
import {
  fetchAllLiveFeeds, fetchAllFastChannels, fetchActiveLiveSources, fetchFollowedArtists,
} from '../services/backendService';
import { fetchTrending } from '../services/radioBrowser';
import type { LiveFeed, ChannelSource } from '../types';
import type { RadioStation } from '../services/radioBrowser';

export interface FastChannelListing {
  ownerId: string; name: string; number?: number; category?: string; logoUrl?: string; profile: any;
}
export interface LiveSourceEntry { ownerId: string; source: ChannelSource }

export interface BroadcastDirectory {
  liveStreams: LiveFeed[];
  fastChannels: FastChannelListing[];
  liveSources: LiveSourceEntry[];
  streamingRadio: RadioStation[];
  followingIds: Set<string>;
  loading: boolean;
}

export function useBroadcastDirectory(uid: string | null | undefined): BroadcastDirectory {
  const [liveStreams, setLiveStreams] = useState<LiveFeed[]>([]);
  const [fastChannels, setFastChannels] = useState<FastChannelListing[]>([]);
  const [liveSources, setLiveSources] = useState<LiveSourceEntry[]>([]);
  const [streamingRadio, setStreamingRadio] = useState<RadioStation[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Live streams — real-time (a broadcast starting/ending updates the guide instantly).
  useEffect(() => {
    const unsub = fetchAllLiveFeeds((feeds: LiveFeed[]) => {
      setLiveStreams((feeds || []).filter(f => (f as any).status === 'LIVE' && (f as any).isPublic !== false));
    });
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, []);

  // FAST channels + external live sources + streaming radio — one-shot on mount.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetchAllFastChannels().catch(() => []),
      fetchActiveLiveSources().catch(() => []),
      fetchTrending(24).catch(() => []),
    ]).then(([fc, ls, rad]) => {
      if (!alive) return;
      if (fc.status === 'fulfilled') setFastChannels((fc.value as any) || []);
      if (ls.status === 'fulfilled') setLiveSources((ls.value as any) || []);
      if (rad.status === 'fulfilled') setStreamingRadio(((rad.value as any) || []).filter((s: RadioStation) => !s.blockedMixedContent && s.lastCheckOk));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Follows for personalisation.
  useEffect(() => {
    if (!uid) { setFollowingIds(new Set()); return; }
    let alive = true;
    fetchFollowedArtists(uid).then(list => { if (alive) setFollowingIds(new Set((list || []).map(a => a.uid))); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  return { liveStreams, fastChannels, liveSources, streamingRadio, followingIds, loading };
}
