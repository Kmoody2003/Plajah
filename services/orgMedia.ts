// orgMedia — what an organization's public page shows from the platform: live streams, on-air TV
// channels, recent videos and releases. Platform content is owned by ACCOUNT uids, so an org's media
// owners are `org.accountUid` (the account that IS the org) plus any `org.contentUids` the owner linked.
// The creator's personal account is deliberately NOT included by default.
//
// All reads are simple single-field queries + client-side sort (no composite indexes), capped, lightly
// cached, and every failure degrades to "nothing to show" — a denied/missing read never throws.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';
import { checkMembership } from './sanctuaryService';
import { activeDaySlots, dayAnchoredPosition, hasPlayableProgramme, resolveSlotMedia, slotIsPlayable } from './fastChannelTimeline';
import { isChannelFeed } from './fast/guideLineup';
import { isFeedLive } from './liveFeedLiveness';
import { updateOrganization } from './organizationService';
import type { Album, ChannelSource, FastChannel, FastChannelSchedule, LiveFeed, Organization, Video } from '../types';

// ── Owners & Organization Identity Matching ──────────────────────────────────────
export const orgMediaUids = (
  org?: Pick<Organization, 'id' | 'accountUid' | 'creatorId' | 'contentUids' | 'admins'> | null
): string[] => {
  if (!org) return [];
  return Array.from(
    new Set(
      [
        org.accountUid,
        org.creatorId,
        org.id,
        ...(org.contentUids || []),
        ...(org.admins || []),
      ].filter((u): u is string => !!u && typeof u === 'string')
    )
  );
};

const normalizeName = (s?: string | null): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const coreOrgName = (name?: string | null): string => {
  const norm = normalizeName(name);
  if (!norm) return '';
  const stripped = norm
    .replace(/\b(ministries|ministry|church|chapel|cathedral|temple|fellowship|international|inc|org)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length >= 4 ? stripped : norm;
};

/** True when a Live Hub feed or FAST channel name/ownerName matches this organization (e.g. "Great Faith" <-> "Great Faith Ministries"). */
export function matchesOrgIdentity(
  org?: Pick<Organization, 'id' | 'name' | 'slug'> | null,
  ...candidates: Array<string | undefined | null>
): boolean {
  if (!org?.name) return false;
  const full = normalizeName(org.name);
  const core = coreOrgName(org.name);
  const slug = normalizeName(org.slug);
  if (!full && !core) return false;
  for (const raw of candidates) {
    const c = normalizeName(raw);
    if (!c) continue;
    if (full && (c === full || c.includes(full) || full.includes(c))) return true;
    if (core && core.length >= 4 && (c === core || c.includes(core))) return true;
    if (slug && slug.length >= 4 && c.replace(/\s+/g, '') === slug.replace(/\s+/g, '')) return true;
  }
  return false;
}

/** Stable key so effects only re-run when the owner set actually changes. */
const uidsKey = (uids: string[]) => uids.slice().sort().join('|');

const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return Number(v) || 0;
};

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** Add (or remove) a linked media account on the org. Owner/admins only (enforced by the org rules). */
export async function setOrgContentUids(org: Organization, contentUids: string[]): Promise<string[]> {
  const next = Array.from(new Set(contentUids.filter(Boolean)));
  await updateOrganization(org.id, { contentUids: next });
  return next;
}

// ── Sanctuary gate (members-only live / sources) ─────────────────────────────────
/** uid -> allowed. Owner of the media account is always allowed; anyone else needs an ACTIVE Sanctuary
 *  membership with that owner (same check the TV player uses), or to be a member of the org itself. */
function useMemberGate(ownerUids: string[], needed: boolean, viewerIsOrgMember: boolean): (ownerId: string) => boolean {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const key = uidsKey(ownerUids);
  useEffect(() => {
    if (!needed) return;
    let alive = true;
    const me = auth.currentUser?.uid;
    ownerUids.forEach(uid => {
      if (me && me === uid) { setAllowed(p => ({ ...p, [uid]: true })); return; }
      if (!me) { setAllowed(p => ({ ...p, [uid]: false })); return; }
      checkMembership(uid).then(m => { if (alive) setAllowed(p => ({ ...p, [uid]: !!m })); })
        .catch(() => { if (alive) setAllowed(p => ({ ...p, [uid]: false })); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needed]);
  return (ownerId: string) => viewerIsOrgMember || !!allowed[ownerId];
}

// ── Live now (Org-scoped + LiveHub TV Plus discovery) ────────────────────────────
/** Realtime: LIVE streams and permanent LiveHub TV+ feeds (live_feeds) by the org's media accounts
 *  or matching the org's identity (e.g. Great Faith on Live TV Hub). Uses single-collection snapshot
 *  (zero composite index required) so feeds never silently drop. */
export function useOrgLive(org: Organization | null | undefined, viewerIsOrgMember = false): LiveFeed[] {
  const uids = useMemo(
    () => orgMediaUids(org),
    [org?.id, org?.accountUid, org?.creatorId, (org?.contentUids || []).join('|'), (org?.admins || []).join('|')]
  );
  const uidSet = useMemo(() => new Set(uids), [uids]);
  const [raw, setRaw] = useState<LiveFeed[]>([]);

  useEffect(() => {
    if (!org) {
      setRaw([]);
      return;
    }
    try {
      const q = query(collection(db, 'live_feeds'));
      const unsub = onSnapshot(
        q,
        snap => {
          const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as LiveFeed));
          setRaw(all);
        },
        () => setRaw([])
      );
      return () => {
        try {
          unsub();
        } catch {
          /* */
        }
      };
    } catch {
      setRaw([]);
      return () => {};
    }
  }, [org?.id]);

  const orgFeeds = useMemo(() => {
    if (!org) return [];
    return raw.filter(f => {
      const anyF = f as any;
      if (anyF.status === 'ENDED' || anyF.status === 'OFFLINE') return false;
      const active = isChannelFeed(f) || isFeedLive(f) || anyF.status === 'LIVE';
      if (!active) return false;
      const byUid = !!(f.ownerId && uidSet.has(f.ownerId));
      const byOrgId = anyF.brandId === org.id || anyF.orgId === org.id;
      const byName = matchesOrgIdentity(org, f.ownerName, f.title, anyF.channelName);
      return byUid || byOrgId || byName;
    });
  }, [raw, org, uidSet]);

  const candidateOwnerUids = useMemo(
    () => Array.from(new Set([...uids, ...orgFeeds.map(f => f.ownerId).filter(Boolean)])),
    [uids, orgFeeds]
  );
  const needsGate = orgFeeds.some(f => f.sanctuaryOnly);
  const gate = useMemberGate(candidateOwnerUids, needsGate, viewerIsOrgMember);

  return useMemo(
    () =>
      orgFeeds
        .filter(f => f.isPublic !== false)
        .filter(f => !f.sanctuaryOnly || !f.ownerId || gate(f.ownerId))
        .sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp))
        .slice(0, 12),
    [orgFeeds, gate]
  );
}

// ── On-air TV channels ───────────────────────────────────────────────────────────
/** How an on-air item plays inline: HLS (Mux or other), a plain file at an offset (FAST), or an embed. */
export interface OnAirPlayback { kind: 'hls' | 'file' | 'embed'; url: string; offsetSec?: number; poster?: string }

const isEmbedUrl = (u: string) => /youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|archive\.org|dailymotion/i.test(u);
export function playbackFor(url?: string, muxPlaybackId?: string, offsetSec?: number): OnAirPlayback | undefined {
  if (muxPlaybackId) return { kind: 'hls', url: `https://stream.mux.com/${muxPlaybackId}.m3u8`, offsetSec, poster: `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=0` };
  if (!url) return undefined;
  if (/\.m3u8($|[?#])/i.test(url) || url.includes('stream.mux.com')) return { kind: 'hls', url, offsetSec };
  if (isEmbedUrl(url)) return { kind: 'embed', url, offsetSec };
  return { kind: 'file', url, offsetSec };
}

export interface OrgChannel {
  key: string;
  ownerId: string;
  kind: 'FAST' | 'EXTERNAL_LIVE' | 'REELLO_LIVE';
  name: string;
  number?: number;
  logoUrl?: string;
  sourceId?: string;
  nowPlaying?: string;
  membersOnly?: boolean;
  /** What is on air right now, for an inline (muted) player. */
  playback?: OnAirPlayback;
  /** True when this channel belongs directly to the current organization. */
  isOrgOwned?: boolean;
}

interface OwnerChannelData { meta: FastChannel | null; sources: ChannelSource[]; schedule: FastChannelSchedule | null }

/** The org's published TV channels that are on air now: its FAST channel (published + a playable
 *  programme) and any active EXTERNAL_LIVE / REELLO_LIVE source. Also discovers FAST channels
 *  matching the organization's identity (e.g. Great Faith in Live TV Hub+). */
export function useOrgChannels(org: Organization | null | undefined, viewerIsOrgMember = false): OrgChannel[] {
  const baseUids = useMemo(
    () => orgMediaUids(org),
    [org?.id, org?.accountUid, org?.creatorId, (org?.contentUids || []).join('|'), (org?.admins || []).join('|')]
  );
  const [discoveredUids, setDiscoveredUids] = useState<string[]>([]);
  const uids = useMemo(() => Array.from(new Set([...baseUids, ...discoveredUids])), [baseUids, discoveredUids]);
  const key = uidsKey(uids);
  const [data, setData] = useState<Record<string, OwnerChannelData>>({});
  const [tick, setTick] = useState(0);

  // Discover any fast_channels / live_feeds ownerIds whose channel name or ownerName matches this org (e.g. "Great Faith")
  useEffect(() => {
    if (!org?.name) {
      setDiscoveredUids([]);
      return;
    }
    let alive = true;
    (async () => {
      const found = new Set<string>();
      try {
        const [fastSnap, feedsSnap, srcSnap] = await Promise.all([
          getDocs(query(collection(db, 'fast_channels'), limit(200))).catch(() => null),
          getDocs(query(collection(db, 'live_feeds'), limit(200))).catch(() => null),
          getDocs(query(collection(db, 'channel_sources'), limit(200))).catch(() => null),
        ]);
        fastSnap?.docs.forEach(d => {
          const fc = d.data() as FastChannel;
          const uid = fc.ownerId || d.id;
          if (uid && matchesOrgIdentity(org, fc.name, fc.tagline)) {
            found.add(uid);
          }
        });
        feedsSnap?.docs.forEach(d => {
          const f = d.data() as LiveFeed & { brandId?: string; orgId?: string; channelName?: string };
          if (f.ownerId && (f.brandId === org.id || f.orgId === org.id || matchesOrgIdentity(org, f.ownerName, f.title, f.channelName))) {
            found.add(f.ownerId);
          }
        });
        srcSnap?.docs.forEach(d => {
          const data = d.data() as { ownerId?: string; sources?: ChannelSource[] };
          const uid = data?.ownerId || d.id;
          const sources = Array.isArray(data?.sources) ? data.sources : [];
          if (uid && sources.some(s => matchesOrgIdentity(org, s.name))) {
            found.add(uid);
          }
        });
      } catch {
        /* ignore */
      }
      if (alive) setDiscoveredUids(Array.from(found));
    })();
    return () => {
      alive = false;
    };
  }, [org?.id, org?.name, org?.slug]);

  useEffect(() => {
    if (!uids.length) { setData({}); return; }
    const unsubs: Array<() => void> = [];
    let alive = true;
    const patch = (uid: string, p: Partial<OwnerChannelData>) =>
      alive && setData(prev => ({ ...prev, [uid]: { meta: null, sources: [], schedule: null, ...(prev[uid] || {}), ...p } }));
    uids.forEach(uid => {
      try {
        unsubs.push(onSnapshot(doc(db, 'fast_channels', uid), s => patch(uid, { meta: s.exists() ? (s.data() as FastChannel) : null }), () => patch(uid, { meta: null })));
        unsubs.push(onSnapshot(doc(db, 'channel_sources', uid), s => patch(uid, { sources: Array.isArray((s.data() as any)?.sources) ? (s.data() as any).sources : [] }), () => patch(uid, { sources: [] })));
      } catch { /* degrade to nothing */ }
      getDoc(doc(db, 'fast_channel_schedules', uid))
        .then(s => patch(uid, { schedule: s.exists() ? (s.data() as FastChannelSchedule) : null }))
        .catch(() => patch(uid, { schedule: null }));
    });
    return () => { alive = false; unsubs.forEach(u => { try { u(); } catch { /* */ } }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // "Now playing" moves with the clock.
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60_000); return () => clearInterval(t); }, []);

  const gate = useMemberGate(uids, Object.values(data).some(d => d.sources.some(s => s.isActive && s.membersOnly)), viewerIsOrgMember);

  return useMemo(() => {
    const out: OrgChannel[] = [];
    const now = Date.now();
    uids.forEach(uid => {
      const d = data[uid];
      if (!d) return;
      if (d.meta?.isPublished !== false && d.schedule) {
        const slots = activeDaySlots(d.schedule, now).filter(slotIsPlayable);
        if (slots.length && hasPlayableProgramme(slots)) {
          const { index, offsetSec } = dayAnchoredPosition(slots, now, (d.schedule as any).timezone);
          let nowPlaying: string | undefined;
          let playback: OnAirPlayback | undefined;
          try {
            const media = resolveSlotMedia(slots[index]);
            nowPlaying = media?.title || undefined;
            if (media && !media.generative) playback = playbackFor(media.url, media.muxPlaybackId, offsetSec);
            if (playback && media?.thumbnail) playback.poster = media.thumbnail;
          } catch { /* */ }
          out.push({ key: `fast:${uid}`, ownerId: uid, kind: 'FAST', name: d.meta?.name || org?.name || 'TV', number: d.meta?.number, logoUrl: d.meta?.logoUrl, nowPlaying, playback, isOrgOwned: true });
        }
      }
      d.sources.forEach(s => {
        if (!s.isActive || (s.type !== 'EXTERNAL_LIVE' && s.type !== 'REELLO_LIVE')) return;
        if (!s.url && !s.muxPlaybackId) return;
        if (s.membersOnly && !gate(uid)) return;     // Sanctuary gate — non-members never see it
        out.push({ key: `src:${uid}:${s.id}`, ownerId: uid, kind: s.type, name: s.name || d.meta?.name || 'Live', number: d.meta?.number, logoUrl: s.logoUrl || d.meta?.logoUrl, sourceId: s.id, membersOnly: s.membersOnly, playback: playbackFor(s.url, s.muxPlaybackId), isOrgOwned: true });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick, gate, key]);
}

/** LiveHub TV Plus feed/channel item for the inline source switcher inside RelloChurchViewer. */
export interface LiveHubTvSourceItem {
  id: string;
  title: string;
  channelName: string;
  speaker: string;
  number?: number;
  badgeText: string;
  isOrgOwned: boolean;
  kind: 'LIVE_SANCTUARY' | 'MINISTRY_TV_CHANNEL';
  playback: OnAirPlayback;
  feed?: LiveFeed;
  channel?: OrgChannel;
  viewerCount?: number;
}

/**
 * Discovers all active LiveHub TV Plus feeds (`live_feeds` + `fast_channels` + `channel_sources`)
 * so the Reello player + Verse Mini-Bible on the main page can automatically tune to the
 * organization's Live TV Hub broadcast AND let viewers switch between any LiveHub TV+ feed.
 */
export function useLiveHubTvPlusSources(
  org: Organization | null | undefined,
  orgLiveFeeds: LiveFeed[],
  orgChannels: OrgChannel[]
): LiveHubTvSourceItem[] {
  const [globalFeeds, setGlobalFeeds] = useState<LiveFeed[]>([]);
  const [globalFastChannels, setGlobalFastChannels] = useState<OrgChannel[]>([]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'live_feeds'));
      const unsub = onSnapshot(
        q,
        snap => {
          const rows = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) } as LiveFeed))
            .filter(f => {
              const anyF = f as any;
              if (anyF.status === 'ENDED' || anyF.status === 'OFFLINE') return false;
              if (f.isPublic === false || f.sanctuaryOnly) return false;
              return isChannelFeed(f) || isFeedLive(f) || anyF.status === 'LIVE';
            })
            .sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
          setGlobalFeeds(rows);
        },
        () => setGlobalFeeds([])
      );
      return () => {
        try {
          unsub();
        } catch {
          /* */
        }
      };
    } catch {
      setGlobalFeeds([]);
      return () => {};
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fastSnap, schedSnap, srcSnap] = await Promise.all([
          getDocs(query(collection(db, 'fast_channels'), limit(100))).catch(() => null),
          getDocs(query(collection(db, 'fast_channel_schedules'), limit(100))).catch(() => null),
          getDocs(query(collection(db, 'channel_sources'), limit(120))).catch(() => null),
        ]);
        if (!alive) return;
        const fastByUid = new Map<string, FastChannel>();
        fastSnap?.docs.forEach(d => {
          const fc = d.data() as FastChannel;
          fastByUid.set(fc.ownerId || d.id, fc);
        });
        const schedByUid = new Map<string, FastChannelSchedule>();
        schedSnap?.docs.forEach(d => schedByUid.set(d.id, d.data() as FastChannelSchedule));
        const now = Date.now();
        const resolved: OrgChannel[] = [];
        fastSnap?.docs.forEach(d => {
          const fc = d.data() as FastChannel;
          const uid = fc.ownerId || d.id;
          if (fc.isPublished === false) return;
          const sched = schedByUid.get(uid);
          if (!sched) return;
          const slots = activeDaySlots(sched, now).filter(slotIsPlayable);
          if (!slots.length || !hasPlayableProgramme(slots)) return;
          const { index, offsetSec } = dayAnchoredPosition(slots, now, (sched as any).timezone);
          try {
            const media = resolveSlotMedia(slots[index]);
            if (!media || media.generative) return;
            const pb = playbackFor(media.url, media.muxPlaybackId, offsetSec);
            if (!pb) return;
            if (media.thumbnail) pb.poster = media.thumbnail;
            resolved.push({
              key: `fast:${uid}`,
              ownerId: uid,
              kind: 'FAST',
              name: fc.name || 'Live TV+ Channel',
              number: fc.number,
              logoUrl: fc.logoUrl,
              nowPlaying: media.title || undefined,
              playback: pb,
              isOrgOwned: !!(org && (uid === org.id || uid === org.accountUid || uid === org.creatorId || matchesOrgIdentity(org, fc.name))),
            });
          } catch {
            /* */
          }
        });
        srcSnap?.docs.forEach(d => {
          const data = d.data() as { ownerId?: string; sources?: ChannelSource[] };
          const uid = data?.ownerId || d.id;
          const fc = fastByUid.get(uid);
          const sources = Array.isArray(data?.sources) ? data.sources : [];
          sources.forEach(s => {
            if (!s.isActive || (s.type !== 'EXTERNAL_LIVE' && s.type !== 'REELLO_LIVE')) return;
            if (s.membersOnly) return;
            const pb = playbackFor(s.url, s.muxPlaybackId);
            if (!pb) return;
            resolved.push({
              key: `src:${uid}:${s.id}`,
              ownerId: uid,
              kind: s.type,
              name: s.name || fc?.name || 'Live TV+ Channel',
              number: fc?.number,
              logoUrl: s.logoUrl || fc?.logoUrl,
              sourceId: s.id,
              playback: pb,
              isOrgOwned: !!(org && (uid === org.id || uid === org.accountUid || uid === org.creatorId || matchesOrgIdentity(org, s.name, fc?.name))),
            });
          });
        });
        resolved.sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
        if (alive) setGlobalFastChannels(resolved);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [org?.id, org?.name]);

  return useMemo(() => {
    const out: LiveHubTvSourceItem[] = [];
    const seenUrls = new Set<string>();
    const seenIds = new Set<string>();

    const pushItem = (item: LiveHubTvSourceItem) => {
      const dedupeKey = `${item.id}|${item.playback.url}`;
      if (seenIds.has(item.id) || seenUrls.has(dedupeKey)) return;
      seenIds.add(item.id);
      seenUrls.add(dedupeKey);
      out.push(item);
    };

    // 1. Organization's own live feeds first
    orgLiveFeeds.forEach((f, idx) => {
      const anyF = f as any;
      const pb = playbackFor(f.url || anyF.streamUrl || anyF.videoUrl, f.muxPlaybackId);
      if (!pb) return;
      pushItem({
        id: `org-live-${f.id}`,
        title: f.title || `${org?.name || 'Organization'} Live`,
        channelName: anyF.channelName || f.ownerName || `${org?.name || 'Organization'} · Ch ${idx + 1}`,
        speaker: anyF.hostName || f.ownerName || org?.name || 'Live Broadcast',
        number: typeof anyF.channelNumber === 'number' ? anyF.channelNumber : undefined,
        badgeText: orgLiveFeeds.length > 1 ? `ORG LIVE · FEED ${idx + 1}` : 'ORG LIVE NOW',
        isOrgOwned: true,
        kind: 'LIVE_SANCTUARY',
        playback: pb,
        feed: f,
        viewerCount: typeof anyF.viewerCount === 'number' ? anyF.viewerCount : undefined,
      });
    });

    // 2. Organization's own FAST / Live TV Hub channels (including sub-channels)
    orgChannels.forEach((ch, idx) => {
      if (!ch.playback) return;
      pushItem({
        id: `org-ch-${ch.key}`,
        title: ch.nowPlaying ? `${ch.name} · ${ch.nowPlaying}` : ch.name,
        channelName: typeof ch.number === 'number' ? `Ch ${ch.number} · ${ch.name}` : `${ch.name} · Live Hub TV+`,
        speaker: org?.name || ch.name,
        number: ch.number,
        badgeText: typeof ch.number === 'number' ? `CH ${ch.number} · ORG TV+` : `ORG TV+ · CH ${idx + 1}`,
        isOrgOwned: true,
        kind: 'MINISTRY_TV_CHANNEL',
        playback: ch.playback,
        channel: ch,
      });
    });

    // 3. Other LiveHub TV+ live feeds across the platform (for switching sources inside the viewer)
    globalFeeds.forEach(f => {
      const anyF = f as any;
      const pb = playbackFor(f.url || anyF.streamUrl || anyF.videoUrl, f.muxPlaybackId);
      if (!pb) return;
      const isOrg = !!(
        org &&
        (f.ownerId === org.id ||
          f.ownerId === org.accountUid ||
          f.ownerId === org.creatorId ||
          anyF.brandId === org.id ||
          anyF.orgId === org.id ||
          matchesOrgIdentity(org, f.ownerName, f.title, anyF.channelName))
      );
      if (seenIds.has(`org-live-${f.id}`)) return;
      pushItem({
        id: isOrg ? `org-live-${f.id}` : `livehub-feed-${f.id}`,
        title: f.title || f.ownerName || 'LiveHub TV+ Stream',
        channelName: f.ownerName ? `${f.ownerName} · LiveHub TV+` : 'LiveHub TV+ Feed',
        speaker: f.ownerName || 'LiveHub TV+',
        number: typeof anyF.channelNumber === 'number' ? anyF.channelNumber : undefined,
        badgeText: isOrg ? 'ORG LIVE · TV+' : 'LIVEHUB TV+ FEED',
        isOrgOwned: isOrg,
        kind: isOrg ? 'LIVE_SANCTUARY' : 'MINISTRY_TV_CHANNEL',
        playback: pb,
        feed: f,
        viewerCount: typeof anyF.viewerCount === 'number' ? anyF.viewerCount : undefined,
      });
    });

    // 4. Other LiveHub TV+ FAST channels across the platform
    globalFastChannels.forEach(ch => {
      if (!ch.playback) return;
      if (seenIds.has(`org-ch-${ch.key}`)) return;
      pushItem({
        id: ch.isOrgOwned ? `org-ch-${ch.key}` : `livehub-fast-${ch.key}`,
        title: ch.nowPlaying ? `${ch.name} · ${ch.nowPlaying}` : ch.name,
        channelName: typeof ch.number === 'number' ? `Ch ${ch.number} · ${ch.name}` : `${ch.name} · LiveHub TV+`,
        speaker: ch.name,
        number: ch.number,
        badgeText: typeof ch.number === 'number' ? `CH ${ch.number} · LIVEHUB TV+` : 'LIVEHUB TV+ FAST',
        isOrgOwned: !!ch.isOrgOwned,
        kind: 'MINISTRY_TV_CHANNEL',
        playback: ch.playback,
        channel: ch,
      });
    });

    // Sort so org-owned broadcasts are always first!
    return out.sort((a, b) => (a.isOrgOwned === b.isOrgOwned ? 0 : a.isOrgOwned ? -1 : 1));
  }, [org, orgLiveFeeds, orgChannels, globalFeeds, globalFastChannels]);
}

/** One thing on air for the org page's inline player: a live stream first, then its TV channels. */
export interface OnAirItem { key: string; title: string; subtitle?: string; playback: OnAirPlayback; feed?: LiveFeed; channel?: OrgChannel }

export function onAirItems(live: LiveFeed[], channels: OrgChannel[]): OnAirItem[] {
  const out: OnAirItem[] = [];
  live.forEach(f => {
    const playback = playbackFor(f.url, f.muxPlaybackId);
    if (playback) out.push({ key: `live:${f.id}`, title: f.title || 'Live now', subtitle: 'Live', playback, feed: f });
  });
  channels.forEach(c => {
    const subtitle = c.nowPlaying ? `Now playing · ${c.nowPlaying}` : typeof c.number === 'number' ? `Channel ${c.number}` : 'On air';
    if (c.playback) out.push({ key: c.key, title: c.name, subtitle, playback: c.playback, channel: c });
  });
  return out;
}

// ── Videos + releases ────────────────────────────────────────────────────────────
const TTL = 60_000;
const cache = new Map<string, { t: number; v: any }>();
const cached = async <T,>(k: string, fn: () => Promise<T>): Promise<T> => {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  const v = await fn();
  cache.set(k, { t: Date.now(), v });
  return v;
};

const PER_OWNER_CAP = 60;

async function readOwned<T>(col: string, uid: string): Promise<T[]> {
  try {
    const snap = await getDocs(query(collection(db, col), where('ownerId', '==', uid), limit(PER_OWNER_CAP)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as T));
  } catch { return []; }
}

const isFilmVideo = (v: Video) =>
  v.category === 'MOVIE' || v.category === 'TV_EPISODE' || v.category === 'SHORT_FILM' || v.category === 'DOCUMENTARY' ||
  v.subType === 'MOVIE' || v.subType === 'TV_SERIES';

const notFuture = (x: { isScheduled?: boolean; releaseDate?: number }) =>
  !(x.isScheduled && x.releaseDate && x.releaseDate > Date.now());

async function allVideos(org: Organization): Promise<Video[]> {
  const uids = orgMediaUids(org);
  return cached(`v:${uidsKey(uids)}`, async () => {
    const lists = await Promise.all(uids.map(u => readOwned<Video>('videos', u)));
    const seen = new Set<string>();
    return lists.flat().filter(v => v?.id && !seen.has(v.id) && (seen.add(v.id), true))
      .filter(v => !v.isPrivate && notFuture(v))
      .sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
  });
}

/** Recent public, non-scheduled videos (films/series are shown as Releases instead). */
export async function fetchOrgVideos(org: Organization, n = 12): Promise<Video[]> {
  if (!orgMediaUids(org).length) return [];
  return (await allVideos(org)).filter(v => !isFilmVideo(v)).slice(0, n);
}

export interface OrgRelease {
  key: string;
  id: string;
  kind: 'ALBUM' | 'VIDEO';
  label: string;       // Album / EP / Single / Mix / Film / Series / Podcast / Book …
  title: string;
  subtitle?: string;
  cover?: string;
  ts: number;
  raw: Album | Video;
}

const albumLabel = (a: Album): string => {
  switch (a.subType) {
    case 'MIX': return 'Mix';
    case 'PODCAST': return 'Podcast';
    case 'AUDIOBOOK': return 'Audiobook';
    case 'NOVEL': case 'GRAPHIC_NOVEL': return 'Book';
    case 'MOVIE': return 'Film';
    case 'TV_SERIES': return 'Series';
    default: break;
  }
  if (a.type === 'BOOK') return 'Book';
  const n = a.tracks?.length || 0;
  return n <= 1 ? 'Single' : n <= 6 ? 'EP' : 'Album';
};

const videoLabel = (v: Video): string =>
  v.category === 'TV_EPISODE' || v.subType === 'TV_SERIES' ? 'Series'
  : v.category === 'SHORT_FILM' ? 'Short film'
  : v.category === 'DOCUMENTARY' ? 'Documentary'
  : 'Film';

/** Recent releases: music (albums/EPs/singles/mixes), books/podcasts the platform exposes as albums,
 *  and films/series. Public, published, newest first. */
export async function fetchOrgReleases(org: Organization, n = 12): Promise<OrgRelease[]> {
  const uids = orgMediaUids(org);
  if (!uids.length) return [];
  const [albumLists, vids] = await Promise.all([
    cached(`a:${uidsKey(uids)}`, () => Promise.all(uids.map(u => readOwned<Album>('albums', u)))),
    allVideos(org),
  ]);
  const out: OrgRelease[] = [];
  const seen = new Set<string>();
  albumLists.flat().forEach(a => {
    if (!a?.id || seen.has(a.id)) return;
    seen.add(a.id);
    if (a.isDraft || a.isPrivate || a.isPublic === false || a.isIntimateOnly || a.subType === 'PLAYLIST' || !notFuture(a)) return;
    out.push({ key: `a:${a.id}`, id: a.id, kind: 'ALBUM', label: albumLabel(a), title: a.title || 'Untitled', subtitle: a.artist, cover: a.coverThumb || a.coverImage, ts: toMs(a.releaseDate) || toMs(a.createdAt), raw: a });
  });
  vids.filter(isFilmVideo).forEach(v => {
    out.push({ key: `v:${v.id}`, id: v.id, kind: 'VIDEO', label: videoLabel(v), title: v.title || 'Untitled', subtitle: v.movieMetadata ? undefined : v.artist, cover: v.coverImageUrl || v.thumbnailUrl, ts: toMs(v.releaseDate) || toMs(v.timestamp), raw: v });
  });
  return out.sort((a, b) => b.ts - a.ts).slice(0, n);
}

/** Loads videos + releases once per org-media change. `loading` is true until both settle. */
export function useOrgMedia(org: Organization | null | undefined): { videos: Video[]; releases: OrgRelease[]; loading: boolean } {
  const key = uidsKey(orgMediaUids(org));
  const [state, setState] = useState<{ videos: Video[]; releases: OrgRelease[]; loading: boolean }>({ videos: [], releases: [], loading: true });
  useEffect(() => {
    if (!org || !key) { setState({ videos: [], releases: [], loading: false }); return; }
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    Promise.all([fetchOrgVideos(org, 12).catch(() => []), fetchOrgReleases(org, 12).catch(() => [])])
      .then(([videos, releases]) => { if (alive) setState({ videos, releases, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Drop cached media after the owner links/unlinks a channel. */
export const invalidateOrgMediaCache = () => cache.clear();

/** Batched: which of these account uids are live right now (for the Elevate directory pills). */
export async function fetchLiveOwnerSet(uids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const clean = Array.from(new Set(uids.filter(Boolean)));
  await Promise.all(chunk(clean, 10).map(async c => {
    try {
      const snap = await getDocs(query(collection(db, 'live_feeds'), where('ownerId', 'in', c), where('status', '==', 'LIVE'), limit(30)));
      snap.docs.forEach(d => { const f = d.data() as any; if (f.ownerId && f.isPublic !== false && !f.sanctuaryOnly) out.add(f.ownerId); });
    } catch { /* degrade to no pills */ }
  }));
  return out;
}
