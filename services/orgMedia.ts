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
import { updateOrganization } from './organizationService';
import type { Album, ChannelSource, FastChannel, FastChannelSchedule, LiveFeed, Organization, Video } from '../types';

// ── Owners ───────────────────────────────────────────────────────────────────────
export const orgMediaUids = (org?: Pick<Organization, 'accountUid' | 'contentUids'> | null): string[] => {
  if (!org) return [];
  return Array.from(new Set([org.accountUid, ...(org.contentUids || [])].filter((u): u is string => !!u && typeof u === 'string')));
};

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

// ── Live now ─────────────────────────────────────────────────────────────────────
/** Realtime: LIVE streams (live_feeds mirror) by the org's media accounts. Public ones only; a
 *  Sanctuary-only stream shows just to members/owner. Up to 3, newest first. */
export function useOrgLive(org: Organization | null | undefined, viewerIsOrgMember = false): LiveFeed[] {
  const uids = useMemo(() => orgMediaUids(org), [org?.accountUid, (org?.contentUids || []).join('|')]);
  const key = uidsKey(uids);
  const [raw, setRaw] = useState<LiveFeed[]>([]);

  useEffect(() => {
    if (!uids.length) { setRaw([]); return; }
    const buckets: Record<number, LiveFeed[]> = {};
    const flush = () => setRaw(Object.values(buckets).flat());
    const unsubs = chunk(uids, 10).map((c, i) => {
      try {
        const q = query(collection(db, 'live_feeds'), where('ownerId', 'in', c), where('status', '==', 'LIVE'), limit(10));
        return onSnapshot(q, snap => {
          buckets[i] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as LiveFeed));
          flush();
        }, () => { buckets[i] = []; flush(); });
      } catch { return () => {}; }
    });
    return () => unsubs.forEach(u => { try { u(); } catch { /* */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const needsGate = raw.some(f => f.sanctuaryOnly);
  const gate = useMemberGate(uids, needsGate, viewerIsOrgMember);

  return useMemo(() => raw
    .filter(f => f.ownerId && f.isPublic !== false)
    .filter(f => !f.sanctuaryOnly || gate(f.ownerId))
    .sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp))
    .slice(0, 3), [raw, gate]);
}

// ── On-air TV channels ───────────────────────────────────────────────────────────
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
}

interface OwnerChannelData { meta: FastChannel | null; sources: ChannelSource[]; schedule: FastChannelSchedule | null }

/** The org's published TV channels that are on air now: its FAST channel (published + a playable
 *  programme) and any active EXTERNAL_LIVE / REELLO_LIVE source. Members-only sources are dropped for
 *  viewers who are not members (org member, Sanctuary member, or the account owner). */
export function useOrgChannels(org: Organization | null | undefined, viewerIsOrgMember = false): OrgChannel[] {
  const uids = useMemo(() => orgMediaUids(org), [org?.accountUid, (org?.contentUids || []).join('|')]);
  const key = uidsKey(uids);
  const [data, setData] = useState<Record<string, OwnerChannelData>>({});
  const [tick, setTick] = useState(0);

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
      if (d.meta?.isPublished && d.schedule) {
        const slots = activeDaySlots(d.schedule, now).filter(slotIsPlayable);
        if (slots.length && hasPlayableProgramme(slots)) {
          const { index } = dayAnchoredPosition(slots, now, (d.schedule as any).timezone);
          let nowPlaying: string | undefined;
          try { nowPlaying = resolveSlotMedia(slots[index])?.title || undefined; } catch { /* */ }
          out.push({ key: `fast:${uid}`, ownerId: uid, kind: 'FAST', name: d.meta.name || 'TV', number: d.meta.number, logoUrl: d.meta.logoUrl, nowPlaying });
        }
      }
      d.sources.forEach(s => {
        if (!s.isActive || (s.type !== 'EXTERNAL_LIVE' && s.type !== 'REELLO_LIVE')) return;
        if (!s.url && !s.muxPlaybackId) return;
        if (s.membersOnly && !gate(uid)) return;     // Sanctuary gate — non-members never see it
        out.push({ key: `src:${uid}:${s.id}`, ownerId: uid, kind: s.type, name: s.name || d.meta?.name || 'Live', number: d.meta?.number, logoUrl: s.logoUrl || d.meta?.logoUrl, sourceId: s.id, membersOnly: s.membersOnly });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick, gate, key]);
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
