/**
 * useProfileMarquee — the data behind the profile marquee (the reworked header card).
 *
 * The marquee replaced a row of pill buttons with three live surfaces:
 *   • Artist Radio  — what the creator's station is playing RIGHT NOW.
 *   • Watch Channel — what's on their FIRST channel right now.
 *   • Support rail  — Sanctuary activity, merch and an active funding goal.
 *
 * Everything here is READ-ONLY and defensive: every fetch is wrapped, every hook
 * no-ops when the feature is off, and a failure degrades the tile to its static
 * state instead of throwing into the profile. Nothing in this file writes.
 *
 * Positioning is computed with the SAME engines the full surfaces use, so the tile
 * and the thing it opens agree:
 *   • radio   → services/radioEngine.getSatellitePosition (wall-clock anchored)
 *   • channel → services/fastChannelTimeline.playoutPosition (+ resolveSlotMedia)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Album, Track, UserProfile, Sanctuary, SanctuaryCampaign, ChannelSource,
} from '../types';
import {
  fetchFastChannelSchedule,
  fetchChannelSources,
  fetchFastChannelMeta,
  auth,
} from '../services/backendService';
import { playoutPosition, resolveSlotMedia } from '../services/fastChannelTimeline';
import { getSatellitePosition } from '../services/radioEngine';
import { fetchSanctuary, fetchRecentMembers } from '../services/sanctuaryService';

// ── A shared 1s tick ─────────────────────────────────────────────────────────
// Positions are pure functions of the wall clock, so "now playing" only needs a
// re-render — never a re-fetch. Pauses while the tab is hidden.
export function useMarqueeClock(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => { stop(); id = setInterval(() => setNow(Date.now()), intervalMs); };
    const stop = () => { if (id) { clearInterval(id); id = undefined; } };
    const onVis = () => { if (document.hidden) stop(); else { setNow(Date.now()); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [active, intervalMs]);
  return now;
}

// ── Artist Radio ─────────────────────────────────────────────────────────────

export interface RadioNowPlaying {
  stationName: string;
  track: Track;
  artwork?: string;
  offsetSec: number;
  durationSec: number;
  /** Track count in the rotation — the tile shows it as station depth. */
  queueLength: number;
}

/**
 * What the creator's station is playing now, derived from the profile's OWN catalogue.
 *
 * A station's true rotation can also mix collaborators and the global pool (see RadioView);
 * we deliberately do NOT fetch every radio track on the platform to render a header tile.
 * With `ownMusicOnly` or an authored schedule — the two cases where the rotation is
 * deterministic — this matches the station exactly. Otherwise it is the artist's own
 * rotation at the right wall-clock position, which is what the tile claims to show.
 */
export function useRadioNowPlaying(
  uid: string,
  profile: UserProfile | null,
  albums: Album[],
  enabled: boolean,
): RadioNowPlaying | null {
  // The artist's own radio-eligible catalogue, in a stable order.
  const ownTracks = useMemo<Track[]>(() => {
    if (!enabled) return [];
    const out: Track[] = [];
    for (const a of albums) {
      if (a.isDraft || a.isPrivate) continue;
      for (const t of a.tracks || []) {
        if (!t?.url) continue;
        if (t.isRadioEligible === false) continue;
        if (t.mediaKind === 'VIDEO') continue;
        out.push({ ...t, artistId: t.artistId || uid, albumCover: t.albumCover || a.coverImage });
      }
    }
    return out;
  }, [albums, enabled, uid]);

  // NOTE — an authored radio Program Schedule would out-rank the catalogue order here (that is
  // what RadioView does), but `radio_schedules/{uid}` has NO rule in firestore.rules, so that
  // read is denied for EVERY caller and yields nothing but a console error. Until a read rule
  // ships, the marquee stays on the catalogue rotation. To restore: fetchRadioSchedule(uid),
  // map activeDaySlots() to tracks (skipping AD_BREAK / LIVE_INTERRUPT), and use that as `queue`.
  const queue = ownTracks;
  const now = useMarqueeClock(enabled && queue.length > 0);

  return useMemo(() => {
    if (!enabled || !queue.length) return null;
    void now;                                   // recompute on every tick
    const pos = getSatellitePosition(queue);
    const track = queue[pos.trackIndex];
    if (!track) return null;
    return {
      stationName: profile?.radioSettings?.stationName || `${profile?.displayName || 'Artist'} Radio`,
      track,
      artwork: track.albumCover,
      offsetSec: pos.offsetSeconds,
      durationSec: track.duration || 180,
      queueLength: queue.length,
    };
  }, [enabled, queue, now, profile?.radioSettings?.stationName, profile?.displayName]);
}

// ── Watch Channel ────────────────────────────────────────────────────────────

export interface ChannelNowPlaying {
  /** The channel this tile represents — always the account's FIRST channel. */
  channelName: string;
  channelLabel: string;              // "Channel 1 of 3"
  sourceType: ChannelSource['type'] | 'FAST';
  title: string;
  thumbnail?: string;
  /** Direct media for the hover preview. `isHls` marks an m3u8 (needs hls.js). */
  previewUrl?: string;
  isHls: boolean;
  offsetSec: number;
  durationSec: number;
  /** True for a genuine live source (external feed / Reello live) — no progress bar. */
  isLive: boolean;
  /** Midnight-anchored channels can be legitimately between programmes. */
  offAir: boolean;
  resumesInSec?: number;
}

export function useChannelNowPlaying(uid: string, enabled: boolean): ChannelNowPlaying | null {
  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [schedule, setSchedule] = useState<Awaited<ReturnType<typeof fetchFastChannelSchedule>>>(null);
  const [fastName, setFastName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !uid) { setSources([]); setSchedule(null); return; }
    Promise.all([
      fetchChannelSources(uid).catch(() => [] as ChannelSource[]),
      fetchFastChannelSchedule(uid).catch(() => null),
      fetchFastChannelMeta(uid).catch(() => null),
    ]).then(([srcs, sched, meta]) => {
      if (cancelled) return;
      setSources(srcs || []);
      setSchedule(sched);
      setFastName(meta?.name || '');
    });
    return () => { cancelled = true; };
  }, [uid, enabled]);

  const now = useMarqueeClock(enabled);

  return useMemo(() => {
    if (!enabled) return null;
    void now;

    // "Their first channel": the first ACTIVE source, else the first source at all.
    const ordered = [...sources];
    const first = ordered.find(s => s.isActive) || ordered[0] || null;
    const total = ordered.length || (schedule ? 1 : 0);
    const index = first ? ordered.indexOf(first) + 1 : 1;
    const channelLabel = total > 1 ? `Channel ${index} of ${total}` : 'Channel 1';

    // A live source (external feed or the account's own Reello live) plays as-is.
    if (first && first.type !== 'FAST') {
      const muxUrl = first.muxPlaybackId ? `https://stream.mux.com/${first.muxPlaybackId}.m3u8` : undefined;
      const url = muxUrl || first.url;
      return {
        channelName: first.name || 'Live',
        channelLabel,
        sourceType: first.type,
        title: first.name || 'Live now',
        thumbnail: first.logoUrl || (first.muxPlaybackId ? `https://image.mux.com/${first.muxPlaybackId}/thumbnail.jpg?width=640&time=5` : undefined),
        previewUrl: url,
        isHls: !!url && /\.m3u8($|[?#])/i.test(url),
        offsetSec: 0,
        durationSec: 0,
        isLive: true,
        offAir: false,
      };
    }

    // Otherwise the FAST channel, positioned exactly the way the player positions it.
    if (!schedule) return null;
    // The project compiles without strictNullChecks, so TS cannot narrow playoutPosition's
    // `offAir: true | false` discriminant (same reason services/fastChannelTimeline.ts and
    // the TV EPG read it loosely). Widen once here and read the optional members.
    const pos = playoutPosition(schedule, Date.now()) as {
      slots: typeof schedule.slots;
      offAir: boolean;
      index?: number;
      offsetSec?: number;
      resumesInSec?: number;
    };
    const name = fastName || first?.name || 'FAST Channel';
    if (pos.offAir) {
      return {
        channelName: name, channelLabel, sourceType: 'FAST',
        title: 'Schedule resumes at midnight',
        isHls: false, offsetSec: 0, durationSec: 0, isLive: false,
        offAir: true, resumesInSec: pos.resumesInSec || 0,
      };
    }
    const slot = pos.slots[pos.index || 0];
    if (!slot) return null;
    const media = resolveSlotMedia(slot);
    const url = media.muxPlaybackId ? `https://stream.mux.com/${media.muxPlaybackId}.m3u8` : media.url;
    return {
      channelName: name,
      channelLabel,
      sourceType: 'FAST',
      title: media.isAd ? 'Commercial break' : media.title,
      thumbnail: media.thumbnail || (media.muxPlaybackId ? `https://image.mux.com/${media.muxPlaybackId}/thumbnail.jpg?width=640&time=5` : undefined),
      previewUrl: media.isAd ? undefined : url,
      isHls: !!media.muxPlaybackId || media.isHls,
      offsetSec: pos.offsetSec || 0,
      durationSec: media.durationSec,
      isLive: media.kind === 'LIVE',
      offAir: false,
    };
  }, [enabled, sources, schedule, fastName, now]);
}

// ── Sanctuary (activity + funding goal) ──────────────────────────────────────

export interface MarqueeActivity {
  id: string;
  name: string;
  photo?: string;
  detail: string;
  at: number;
}

export interface SanctuarySummary {
  sanctuary: Sanctuary | null;
  campaign: SanctuaryCampaign | null;   // only when isActive
  activity: MarqueeActivity[];
  /** Recent joins are readable ONLY by the creator (firestore.rules: sanctuaryMemberships).
   *  Visitors get the public shape — member count + campaign — and no roster. */
  activityIsOwnerOnly: boolean;
}

export function useSanctuarySummary(uid: string, isOwnProfile: boolean): SanctuarySummary {
  const [sanctuary, setSanctuary] = useState<Sanctuary | null>(null);
  const [activity, setActivity] = useState<MarqueeActivity[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!uid) return;
    fetchSanctuary(uid)
      .then(s => { if (!cancelled) setSanctuary(s); })
      .catch(() => { /* no sanctuary → the rail hides itself */ });
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    // Only the creator may read their membership roster; don't even ask otherwise.
    if (!isOwnProfile || !auth.currentUser || auth.currentUser.uid !== uid) { setActivity([]); return; }
    fetchRecentMembers(uid, 4)
      .then(members => {
        if (cancelled) return;
        setActivity(
          members
            .map(m => ({
              id: m.id,
              name: m.memberName || 'A member',
              photo: m.memberPhoto,
              detail: m.tierName ? `joined ${m.tierName}` : 'joined your Sanctuary',
              at: m.startedAt || 0,
            })),
        );
      })
      .catch(() => { /* no access → no roster; the cell falls back to its public shape */ });
    return () => { cancelled = true; };
  }, [uid, isOwnProfile]);

  const campaign = sanctuary?.campaign?.isActive ? sanctuary.campaign : null;
  return { sanctuary, campaign, activity, activityIsOwnerOnly: true };
}

// ── Featured project resolution ──────────────────────────────────────────────

export interface FeaturedProjectView {
  kind: 'ALBUM' | 'VIDEO' | 'ARTICLE';
  id: string;
  title: string;
  cover?: string;
  subtitle: string;
  createdAt: number;
  /** True when the creator pinned this deliberately; false = most-recent-release fallback. */
  isPick: boolean;
  album?: Album;
  raw: any;
}

const albumKindLabel = (a: Album): string => {
  if (a.subType === 'PODCAST') return 'Podcast';
  if (a.subType === 'MIX') return 'Mix';
  if (a.type === 'BOOK') return 'Book';
  if (a.type === 'VIDEO' || a.subType === 'MOVIE') return 'Film';
  if (a.type === 'PHOTO') return 'Photo album';
  const n = a.tracks?.length || 0;
  return n === 1 ? 'Single' : n > 0 ? `Album · ${n} tracks` : 'Album';
};

/**
 * The Featured Project slot: the creator's pick, else the most recent release. Pure — it only
 * reads content the profile has already loaded, so it never adds a fetch and never blocks.
 */
export function resolveFeaturedProject(
  profile: UserProfile | null,
  albums: Album[],
  videos: any[],
  articles: any[],
): FeaturedProjectView | null {
  if (!profile) return null;

  const asAlbum = (a: Album, isPick: boolean): FeaturedProjectView => ({
    kind: 'ALBUM', id: a.id, title: a.title, cover: a.coverImage,
    subtitle: albumKindLabel(a), createdAt: a.releaseDate || a.createdAt || 0, isPick, album: a, raw: a,
  });
  const asVideo = (v: any, isPick: boolean): FeaturedProjectView => ({
    kind: 'VIDEO', id: v.id, title: v.title || 'Video',
    cover: v.thumbnailUrl || v.coverImageUrl || (v.muxPlaybackId ? `https://image.mux.com/${v.muxPlaybackId}/thumbnail.jpg?width=640&time=5` : undefined),
    subtitle: v.subType === 'MOVIE' ? 'Film' : 'Video', createdAt: v.timestamp || 0, isPick, raw: v,
  });
  const asArticle = (r: any, isPick: boolean): FeaturedProjectView => ({
    kind: 'ARTICLE', id: r.id, title: r.title || 'Article', cover: r.coverImage,
    subtitle: 'Article', createdAt: r.timestamp || 0, isPick, raw: r,
  });

  const pick = profile.featuredProject;
  if (pick?.id) {
    if (pick.kind === 'ALBUM') {
      const a = albums.find(x => x.id === pick.id);
      if (a) return asAlbum(a, true);
    } else if (pick.kind === 'VIDEO') {
      const v = (videos || []).find((x: any) => x.id === pick.id);
      if (v) return asVideo(v, true);
    } else if (pick.kind === 'ARTICLE') {
      const r = (articles || []).find((x: any) => x.id === pick.id);
      if (r) return asArticle(r, true);
    }
    // A pick pointing at deleted content silently falls through to the newest release.
  }

  const candidates: FeaturedProjectView[] = [
    ...albums.filter(a => !a.isDraft).map(a => asAlbum(a, false)),
    ...(videos || []).map((v: any) => asVideo(v, false)),
    ...(articles || []).map((r: any) => asArticle(r, false)),
  ].filter(c => !!c.title);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0];
}

/** Everything the creator can choose from in the "Change featured project" picker. */
export function featuredProjectChoices(albums: Album[], videos: any[], articles: any[]): FeaturedProjectView[] {
  const out: FeaturedProjectView[] = [
    ...albums.filter(a => !a.isDraft).map(a => ({
      kind: 'ALBUM' as const, id: a.id, title: a.title, cover: a.coverImage,
      subtitle: albumKindLabel(a), createdAt: a.releaseDate || a.createdAt || 0, isPick: false, album: a, raw: a,
    })),
    ...(videos || []).map((v: any) => ({
      kind: 'VIDEO' as const, id: v.id, title: v.title || 'Video',
      cover: v.thumbnailUrl || v.coverImageUrl, subtitle: 'Video',
      createdAt: v.timestamp || 0, isPick: false, raw: v,
    })),
    ...(articles || []).map((r: any) => ({
      kind: 'ARTICLE' as const, id: r.id, title: r.title || 'Article', cover: r.coverImage,
      subtitle: 'Article', createdAt: r.timestamp || 0, isPick: false, raw: r,
    })),
  ];
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Hover previews are a pointer affordance — never armed on touch or TV. */
export function useHoverPreviewAllowed(): boolean {
  const ref = useRef<boolean>(false);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      ref.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch { ref.current = false; }
    setOk(ref.current);
  }, []);
  return ok;
}
