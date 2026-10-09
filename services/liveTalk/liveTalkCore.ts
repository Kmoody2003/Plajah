/**
 * liveTalkCore — pure, dependency-free logic for Live Talk (Plajah's X Spaces competitor).
 *
 * Everything here is deterministic and unit-tested (tests/liveTalkCore.test.ts). The Firestore
 * side lives in liveTalkService.ts and the UI in components/LiveTalkView.tsx. See docs/LIVE_TALK.md.
 *
 * Data model (Firestore, named DB plajah-prod):
 *   liveTalks/{talkId}                    talk doc (host-owned) + denormalized roster fields
 *     members/{uid}                       one doc per person in the room (role, hand, mute, presence)
 *     chat/{msgId}                        room chat
 *     reactions/{auto}                    batched emoji reactions (TTL via expireAt)
 *   rtc_sessions/talk_{talkId}            WebRTC signaling (rtcCore 'stage' topology)
 */

/** Owner decision (2026-10-08): every talk is capped at 20 people TOTAL (host + co-hosts +
 *  speakers + listeners) until the P2P stage is proven on real devices. Raise this — and the
 *  matching literal in the firestore rules snippet — only together with an SFU. */
export const LIVE_TALK_MAX_PARTICIPANTS = 20;
/** Max people on stage (host + co-hosts + speakers). Each speaker uploads one stream per
 *  member, so this is the dominant P2P cost. */
export const LIVE_TALK_MAX_SPEAKERS = 10;
/** Host writes `lastHeartbeat` this often. */
export const HOST_HEARTBEAT_MS = 20_000;
/** A talk whose host heartbeat is older than this is treated as dead (discovery hides it,
 *  a present co-host takes over). Must match the 60s literal in the rules snippet. */
export const HOST_STALE_MS = 60_000;
/** Members bump `lastSeen` this often. */
export const MEMBER_HEARTBEAT_MS = 30_000;
/** A member not seen for this long is pruned from the roster by the host. */
export const MEMBER_STALE_MS = 90_000;
/** Legacy talks (no heartbeat field) are only trusted this long after creation. */
export const LEGACY_TALK_TRUST_MS = 10 * 60_000;
export const CHAT_MAX_LEN = 500;
export const CHAT_PAGE = 50;
export const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👏', '💯', '🙌'] as const;

export type TalkRole = 'host' | 'cohost' | 'speaker' | 'listener';

export interface TalkMember {
  uid: string;
  role: TalkRole;
  name: string;
  photo?: string;
  joinedAt?: unknown;
  lastSeen?: unknown;
  handRaised?: boolean;
  mutedByHost?: boolean;
  selfMuted?: boolean;
}

/** The subset of the talk doc this module reasons about (all optional — legacy docs lack most). */
export interface TalkDocLike {
  id?: string;
  hostId: string;
  isActive: boolean;
  timestamp?: number;
  lastHeartbeat?: unknown;
  cohostUids?: string[];
  speakerUids?: string[];
  kicked?: string[];
  memberCount?: number;
}

/** Firestore Timestamp | number | {seconds} | null → epoch ms (null when unknown/pending). */
export function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') {
    const o = v as any;
    if (typeof o.toMillis === 'function') { try { return o.toMillis(); } catch { return null; } }
    if (typeof o.seconds === 'number') return o.seconds * 1000 + Math.floor((o.nanoseconds || 0) / 1e6);
  }
  return null;
}

/** Is this talk really on air? Discovery uses this to hide zombie rooms whose host tab died. */
export function isTalkAlive(talk: TalkDocLike, now: number): boolean {
  if (!talk || talk.isActive !== true) return false;
  const hb = toMillis(talk.lastHeartbeat);
  if (hb != null) return now - hb <= HOST_STALE_MS;
  // Pending serverTimestamp on the host's own client, or a legacy doc: trust a fresh creation time.
  const created = toMillis(talk.timestamp);
  return created != null && now - created <= LEGACY_TALK_TRUST_MS;
}

/** Host heartbeat is silent (> HOST_STALE_MS). A missing heartbeat on an old talk counts as silent. */
export function isHostStale(talk: TalkDocLike, now: number): boolean {
  const hb = toMillis(talk.lastHeartbeat);
  if (hb != null) return now - hb > HOST_STALE_MS;
  const created = toMillis(talk.timestamp);
  return created == null || now - created > HOST_STALE_MS;
}

export const isStageRole = (r: TalkRole | undefined) => r === 'host' || r === 'cohost' || r === 'speaker';

export function isModerator(talk: TalkDocLike | null | undefined, uid: string | null | undefined): boolean {
  if (!talk || !uid) return false;
  return talk.hostId === uid || (talk.cohostUids || []).includes(uid);
}

export type JoinBlock = 'signin' | 'ended' | 'kicked' | 'blocked' | 'full';

/** Can `uid` enter this talk? `alreadyMember` lets a rejoin through a full room. */
export function joinBlocker(
  talk: TalkDocLike | null,
  uid: string | null | undefined,
  opts: { blocked?: boolean; alreadyMember?: boolean; now?: number } = {},
): JoinBlock | null {
  if (!talk || talk.isActive !== true) return 'ended';
  if (!uid) return 'signin';
  if ((talk.kicked || []).includes(uid)) return 'kicked';
  if (opts.blocked) return 'blocked';
  if (!opts.alreadyMember && talk.hostId !== uid && (talk.memberCount ?? 0) >= LIVE_TALK_MAX_PARTICIPANTS) return 'full';
  return null;
}

/** "12/20" */
export function capacityLabel(count: number | undefined): string {
  return `${Math.max(0, count ?? 0)}/${LIVE_TALK_MAX_PARTICIPANTS}`;
}

/** People in the room: the host-maintained memberCount, else (legacy docs) speakers + listeners. */
export function headcount(t: { memberCount?: number; listeners?: unknown[]; speakers?: unknown[] } | null | undefined): number {
  if (!t) return 0;
  if (typeof t.memberCount === 'number') return Math.max(0, t.memberCount);
  return (Array.isArray(t.listeners) ? t.listeners.length : 0) + (Array.isArray(t.speakers) ? t.speakers.length : 0);
}

/** Discovery / header label, e.g. "12/20". */
export const talkCapacityLabel = (t: Parameters<typeof headcount>[0]) => capacityLabel(headcount(t));

/** Can `actor` move `target` to `next`? Mirrors the members/{uid} rule in the rules snippet. */
export function canSetRole(talk: TalkDocLike, actorUid: string, target: TalkMember, next: TalkRole, stageCount: number): boolean {
  if (!isModerator(talk, actorUid)) return false;
  if (target.uid === talk.hostId || next === 'host') return false;
  const actorIsHost = actorUid === talk.hostId;
  if ((target.role === 'cohost' || next === 'cohost') && !actorIsHost) return false;
  if (isStageRole(next) && !isStageRole(target.role) && stageCount >= LIVE_TALK_MAX_SPEAKERS) return false;
  return true;
}

const ROLE_ORDER: Record<TalkRole, number> = { host: 0, cohost: 1, speaker: 2, listener: 3 };

/** Members sorted host → co-hosts → speakers → listeners, then by join time. */
export function sortMembers(members: TalkMember[]): TalkMember[] {
  return [...members].sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    || ((toMillis(a.joinedAt) ?? 0) - (toMillis(b.joinedAt) ?? 0))
    || a.uid.localeCompare(b.uid));
}

/** Members whose presence is stale (crashed tab). Pending (null) lastSeen counts as fresh. */
export function isMemberStale(m: TalkMember, now: number): boolean {
  const seen = toMillis(m.lastSeen) ?? toMillis(m.joinedAt);
  if (seen == null) return false;
  return now - seen > MEMBER_STALE_MS;
}

export interface TalkDenorm {
  speakerUids: string[];
  speakers: Array<{ uid: string; name: string; photoURL: string; isMuted: boolean }>;
  listeners: string[];
  cohostUids: string[];
  speakerCount: number;
  listenerCount: number;
  memberCount: number;
  raisedHandCount: number;
}

/** The denormalized roster the host keeps on the talk doc (discovery cards, rtc allow-lists, rules).
 *  The host is always on stage even if their member doc is momentarily missing. */
export function deriveDenorm(members: TalkMember[], hostId: string, now: number): TalkDenorm {
  const live = sortMembers(members.filter(m => !isMemberStale(m, now) || m.uid === hostId));
  const stage = live.filter(m => isStageRole(m.role) || m.uid === hostId).slice(0, LIVE_TALK_MAX_SPEAKERS);
  const stageIds = new Set(stage.map(m => m.uid));
  const speakerUids = stage.map(m => m.uid);
  if (!stageIds.has(hostId)) speakerUids.unshift(hostId);
  const listeners = live.filter(m => !stageIds.has(m.uid) && m.uid !== hostId).map(m => m.uid);
  return {
    speakerUids,
    speakers: stage.map(m => ({ uid: m.uid, name: m.name || 'Speaker', photoURL: m.photo || '', isMuted: !!(m.selfMuted || m.mutedByHost) })),
    listeners,
    cohostUids: live.filter(m => m.role === 'cohost').map(m => m.uid),
    speakerCount: speakerUids.length,
    listenerCount: listeners.length,
    memberCount: live.length,
    raisedHandCount: live.filter(m => m.handRaised && !isStageRole(m.role)).length,
  };
}

/** Shallow compare so the host only writes the talk doc when the roster actually changed. */
export function denormEqual(a: Partial<TalkDenorm> | null | undefined, b: TalkDenorm): boolean {
  if (!a) return false;
  const arr = (x: unknown) => JSON.stringify(x ?? []);
  return arr(a.speakerUids) === arr(b.speakerUids) && arr(a.listeners) === arr(b.listeners)
    && arr(a.cohostUids) === arr(b.cohostUids) && arr(a.speakers) === arr(b.speakers)
    && a.memberCount === b.memberCount && a.raisedHandCount === b.raisedHandCount;
}

/** Host gone > 60s: which present co-host takes over? First in cohostUids order who is still
 *  fresh. Every client computes the same answer, so only that co-host acts. */
export function takeoverCandidate(talk: TalkDocLike, members: TalkMember[], now: number): string | null {
  if (!talk.isActive || !isHostStale(talk, now)) return null;
  const byUid = new Map(members.map(m => [m.uid, m]));
  for (const uid of talk.cohostUids || []) {
    const m = byUid.get(uid);
    if (m && !isMemberStale(m, now)) return uid;
  }
  return null;
}

/** Which rtc peers may I connect to? Listeners hear only the stage; stage members serve every member. */
export function allowedPeerIds(selfUid: string, amOnStage: boolean, speakerUids: string[], memberUids: string[]): string[] {
  const src = amOnStage ? memberUids : speakerUids;
  return Array.from(new Set(src.filter(u => u && u !== selfUid)));
}

export type TalkPhase = 'signin' | 'full' | 'joining' | 'connecting' | 'live' | 'reconnecting' | 'ended';

/** One clear state for the header pill. `expectedPeers` = remote publishers I should hear (for a
 *  listener) or anyone I serve (for a speaker). */
export function talkPhase(input: {
  ended: boolean; signedIn: boolean; full?: boolean; memberJoined: boolean;
  peerStates: RTCPeerConnectionState[] | string[]; expectedPeers: number;
}): TalkPhase {
  if (input.ended) return 'ended';
  if (!input.signedIn) return 'signin';
  if (input.full) return 'full';
  if (!input.memberJoined) return 'joining';
  const s = input.peerStates as string[];
  // Hearing (or serving) at least one peer = live; a single flaky link elsewhere doesn't
  // downgrade the whole room.
  if (s.includes('connected')) return 'live';
  if (s.some(x => x === 'disconnected' || x === 'failed')) return 'reconnecting';
  if (input.expectedPeers === 0) return 'live';
  return 'connecting';
}

export function sanitizeChat(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
}

/** Coalesce rapid taps into one write per emoji ({emoji,count}), capped at 30 per write. */
export function coalesceReactions(taps: string[]): Array<{ emoji: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of taps) if (e) m.set(e, Math.min(30, (m.get(e) || 0) + 1));
  return Array.from(m, ([emoji, count]) => ({ emoji, count }));
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
