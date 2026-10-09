// partyService — the ONE synchronized "party" primitive for the whole platform.
//
// A watch party (movies/video), a read-along (Lorea books) and a Chora listening party are the SAME
// thing: a host presses play/pause/seek/next/turn-page, and everyone in the party follows — but the
// content plays LOCALLY on each viewer's own device, streamed to them by the platform, NOT relayed
// from the host. We broadcast STATE, not media. That means one host can front an unlimited audience
// for the price of a few Firestore writes, and each viewer gets full-quality local playback in sync.
//
// Firestore:
//   parties/{partyId}                 Party — identity + content REFERENCE + the host's live `playback`
//   parties/{partyId}/viewers/{uid}   join time + last-seen (clock probe; "longest-present" for openRemote)
//   parties/{partyId}/chat/{id}       party chat (signed-in, not blocked with the host)
//   parties/{partyId}/reactions/{id}  emoji reactions overlay
// Presence (viewer avatars/count) rides usePresence(`party_${id}`).
//
// ENTITLEMENT: the party doc is public-read, so it stores ONLY content type+id+title+cover. Every
// guest resolves the playable source through their OWN access (fetchVideoById / fetchAlbumById +
// the normal player gates). Never put a URL or playback id on the party doc.
//
// The follow math lives in the PURE services/partySync.ts (unit-tested) and is re-exported here.

import { db, auth, createNotification, fetchFollowers, fetchFollowing, fetchUserProfiles } from './backendService';
import {
  doc, setDoc, updateDoc, getDoc, getDocFromServer, serverTimestamp, Timestamp, collection, addDoc,
  query, where, orderBy, limit, limitToLast, deleteDoc,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { publicPartyContent } from './partySync';

export * from './partySync';

export type PartyKind = 'WATCH' | 'READ' | 'LISTEN';
export type PartyContentType = 'MOVIE' | 'VIDEO' | 'BOOK' | 'ALBUM' | 'TRACK';
export type PartyVisibility = 'link' | 'public';

export interface PartyContent {
  type: PartyContentType;
  id: string;
  title?: string;
  thumbnail?: string;
  /** total pages (read-along) — lets the UI show progress */
  totalPages?: number;
}

/** The host's live control state. Everyone else's local player is slaved to this. */
export interface PartyPlaybackState {
  isPlaying: boolean;
  /** host playhead in seconds at the moment this state was written (video / audio). */
  positionSec: number;
  /** read-along: the host's current page within the chapter (0-based index). */
  currentPage?: number;
  /** read-along: the host's current chapter index (books are a compound chapter+page position). */
  chapterIndex?: number;
  /** read-along (EPUB): the host's rendition CFI. */
  cfi?: string;
  /** read-along (parsed PDF/DOCX/TXT chapters): chapter + page within it. */
  parsedChapter?: number;
  parsedPage?: number;
  /** listening party: index of the track in the album the host is on. */
  trackIndex?: number;
  /** content id currently loaded (album track id, or the movie/book id) — lets the audience swap item. */
  contentId?: string;
  rate?: number;
  /** "Starting in 3…" — server-ms instant the host's countdown ends (0 = none). */
  countdownEndsAt?: number;
  /** true once the host has pressed play at least once (fresh-party countdown only applies before). */
  started?: boolean;
  /** server write time — followers anchor on this + a clock-offset estimate. */
  updatedAt?: any;
  /** monotonic client counter so out-of-order snapshots can be ignored. */
  seq: number;
}

export interface Party {
  id: string;
  kind: PartyKind;
  hostId: string;
  hostName?: string;
  hostPhoto?: string;
  content: PartyContent;
  playback: PartyPlaybackState;
  isActive: boolean;
  createdAt: number;
  endedAt?: number;
  /** server time of the host's last heartbeat (every PARTY_HEARTBEAT_MS while hosting). */
  hostHeartbeat?: any;
  /** host's tab went away (pagehide) — followers show "Host reconnecting…" immediately. */
  hostAway?: boolean;
  /** people the host trusts to take the remote if the host disappears. */
  coHostIds?: string[];
  /** when the host is gone and no co-host is present, the longest-present viewer may take over. */
  openRemote?: boolean;
  /** 'link' (default: anyone with the link) | 'public' (listed in "Watch with others now"). */
  visibility?: PartyVisibility;
}

const removeUndefined = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Deterministic party id for a host+content so re-opening resumes the same session. */
export const partyIdFor = (hostId: string, contentId: string) => `party_${hostId}_${contentId}`;

export function partyShareUrl(partyId: string): string {
  const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://plajah.com';
  // Path-style so a pasted link unfurls with the party's own card (server: services/socialMigrationServer.ts);
  // index.html maps /party/:id back to ?party=:id for the existing boot handler.
  return `${base}/party/${encodeURIComponent(partyId)}`;
}

/** In-app open (no reload): App.tsx listens for this and runs the same resolver as ?party= boot. */
export const OPEN_PARTY_EVENT = 'plajah:open-party';
export function openPartyInApp(partyId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_PARTY_EVENT, { detail: { partyId } }));
}

export interface CreatePartyInput {
  id?: string;
  kind: PartyKind;
  content: PartyContent;
  initial?: Partial<PartyPlaybackState>;
  visibility?: PartyVisibility;
  openRemote?: boolean;
}

/**
 * Host opens a party. Returns the party id. Re-hosting the deterministic id OVERWRITES the doc (no
 * merge) so a previous session's endedAt / co-hosts / countdown never leak into the new one.
 */
export async function createParty(input: CreatePartyInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to host a party');
  const id = input.id || partyIdFor(user.uid, input.content.id);
  const init = input.initial || {};
  const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const party: any = removeUndefined({
    id,
    kind: input.kind,
    hostId: user.uid,
    hostName: user.displayName || 'Host',
    hostPhoto: user.photoURL || '',
    content: publicPartyContent(input.content as any),
    playback: removeUndefined({
      isPlaying: !!init.isPlaying,
      positionSec: num(init.positionSec) ?? 0,
      currentPage: num(init.currentPage),
      chapterIndex: num(init.chapterIndex),
      cfi: typeof init.cfi === 'string' && init.cfi ? init.cfi : undefined,
      parsedChapter: num(init.parsedChapter),
      parsedPage: num(init.parsedPage),
      trackIndex: num(init.trackIndex),
      contentId: init.contentId ?? input.content.id,
      started: !!init.isPlaying,
      countdownEndsAt: 0,
      seq: 0,
      updatedAt: serverTimestamp(),
    }),
    isActive: true,
    createdAt: Date.now(),
    hostHeartbeat: serverTimestamp(),
    hostAway: false,
    coHostIds: [],
    openRemote: !!input.openRemote,
    visibility: input.visibility === 'public' ? 'public' : 'link',
  });
  await setDoc(doc(db, 'parties', id), party);
  return id;
}

const partyFromSnap = (snap: any): Party | null => (snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as Party : null);

export function listenToParty(partyId: string, cb: (party: Party | null, meta: { fromCache: boolean; hasPendingWrites: boolean }) => void): () => void {
  return onSnapshot(
    doc(db, 'parties', partyId),
    (snap: any) => cb(partyFromSnap(snap), { fromCache: !!snap.metadata?.fromCache, hasPendingWrites: !!snap.metadata?.hasPendingWrites }),
    () => cb(null, { fromCache: false, hasPendingWrites: false }),
  );
}

export async function fetchParty(partyId: string): Promise<Party | null> {
  try { return partyFromSnap(await getDoc(doc(db, 'parties', partyId))); } catch { return null; }
}

/**
 * Host writes a new playback state. `seq` MUST increase so the audience can drop stale snapshots.
 * Callers should throttle rapid scrubs (the hook does) — but always send the FINAL state.
 */
export async function updatePartyPlayback(partyId: string, patch: Partial<PartyPlaybackState>, seq: number): Promise<void> {
  const playback: any = removeUndefined({ ...patch, seq, updatedAt: serverTimestamp() });
  const fields: any = Object.fromEntries(Object.entries(playback).map(([k, v]) => [`playback.${k}`, v]));
  fields.hostHeartbeat = serverTimestamp();       // every control write doubles as a heartbeat
  fields.hostAway = false;
  await updateDoc(doc(db, 'parties', partyId), fields);
}

/** Host liveness ping (every PARTY_HEARTBEAT_MS while hosting). */
export async function heartbeatParty(partyId: string): Promise<void> {
  await updateDoc(doc(db, 'parties', partyId), { hostHeartbeat: serverTimestamp(), hostAway: false });
}

/** Best-effort on pagehide: tell followers the host stepped away (they pause + show reconnecting). */
export function markHostAway(partyId: string): void {
  updateDoc(doc(db, 'parties', partyId), { hostAway: true }).catch(() => {});
}

export async function endParty(partyId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'parties', partyId), {
      isActive: false, endedAt: Date.now(), 'playback.isPlaying': false, 'playback.countdownEndsAt': 0,
    });
  } catch { /* */ }
}

/** Host hands the remote to someone present. The old host stays as a co-host so they can take it back. */
export async function passRemote(party: Party, to: { uid: string; name?: string; photo?: string }): Promise<void> {
  const me = auth.currentUser;
  if (!me || party.hostId !== me.uid || !to.uid || to.uid === me.uid) return;
  const co = Array.from(new Set([me.uid, ...(party.coHostIds || []).filter(id => id !== to.uid)])).slice(0, 10);
  await updateDoc(doc(db, 'parties', party.id), {
    hostId: to.uid, hostName: to.name || 'Host', hostPhoto: to.photo || '', coHostIds: co,
    // The new host's heartbeat starts when their client notices; give them a grace window.
    hostHeartbeat: serverTimestamp(), hostAway: false,
  });
}

/** Claim the remote after the host has been gone >60s (rules re-check eligibility + staleness). */
export async function claimHost(party: Party): Promise<boolean> {
  const me = auth.currentUser;
  if (!me) return false;
  const co = Array.from(new Set([party.hostId, ...(party.coHostIds || [])].filter(id => id && id !== me.uid))).slice(0, 10);
  try {
    await updateDoc(doc(db, 'parties', party.id), {
      hostId: me.uid, hostName: me.displayName || 'Host', hostPhoto: me.photoURL || '',
      coHostIds: co, hostHeartbeat: serverTimestamp(), hostAway: false,
      'playback.isPlaying': false, 'playback.updatedAt': serverTimestamp(),
    });
    return true;
  } catch { return false; }
}

export async function setPartyCoHosts(partyId: string, coHostIds: string[]): Promise<void> {
  await updateDoc(doc(db, 'parties', partyId), { coHostIds: Array.from(new Set(coHostIds.filter(Boolean))).slice(0, 10) });
}

export async function setPartySettings(partyId: string, s: { visibility?: PartyVisibility; openRemote?: boolean }): Promise<void> {
  const patch: any = {};
  if (s.visibility) patch.visibility = s.visibility === 'public' ? 'public' : 'link';
  if (typeof s.openRemote === 'boolean') patch.openRemote = s.openRemote;
  if (Object.keys(patch).length) await updateDoc(doc(db, 'parties', partyId), patch);
}

// ── Viewers (join time + clock probe) ─────────────────────────────────────────────────────────────

export interface PartyViewer { uid: string; name?: string; photo?: string; joinedAt?: any; seenAt?: any }

/**
 * Write our viewer doc with a serverTimestamp and read it back from the server. Returns the clock
 * probe sample (feed to refineClockOffset) — or null when offline / denied.
 */
export async function probeViewer(partyId: string, firstJoin: boolean): Promise<{ sendLocalMs: number; receiptLocalMs: number; serverMs: number } | null> {
  const me = auth.currentUser;
  if (!me) return null;
  const ref = doc(db, 'parties', partyId, 'viewers', me.uid);
  const body: any = { uid: me.uid, name: (me.displayName || 'Guest').slice(0, 80), photo: me.photoURL || '', seenAt: serverTimestamp() };
  if (firstJoin) body.joinedAt = serverTimestamp();
  try {
    const sendLocalMs = Date.now();
    await setDoc(ref, body, { merge: true });
    const snap = await getDocFromServer(ref);
    const receiptLocalMs = Date.now();
    const serverMs = tsToMs(snap.data()?.seenAt);
    return serverMs ? { sendLocalMs, receiptLocalMs, serverMs } : null;
  } catch { return null; }
}

export function listenToViewers(partyId: string, cb: (viewers: PartyViewer[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'parties', partyId, 'viewers'), limit(200)),
    (snap: any) => cb(snap.docs.map((d: any) => d.data() as PartyViewer)),
    () => cb([]),
  );
}

export async function leaveViewers(partyId: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  try { await deleteDoc(doc(db, 'parties', partyId, 'viewers', me.uid)); } catch { /* */ }
}

// ── Chat + reactions ─────────────────────────────────────────────────────────────────────────────

export interface PartyChatMessage { id: string; uid: string; name: string; photo?: string; text: string; at?: any }
export interface PartyReaction { id: string; uid: string; emoji: string; at?: any }
export const PARTY_EMOJIS = ['😂', '😍', '🔥', '👏', '😮', '😢', '🎉', '❤️'] as const;
export const PARTY_CHAT_MAX = 300;

export async function sendPartyChat(partyId: string, text: string): Promise<void> {
  const me = auth.currentUser;
  const t = (text || '').trim().slice(0, PARTY_CHAT_MAX);
  if (!me || !t) return;
  await addDoc(collection(db, 'parties', partyId, 'chat'), {
    uid: me.uid, name: (me.displayName || 'Guest').slice(0, 80), photo: me.photoURL || '', text: t, at: serverTimestamp(),
  });
}

export function listenPartyChat(partyId: string, cb: (msgs: PartyChatMessage[]) => void, max = 60): () => void {
  return onSnapshot(
    query(collection(db, 'parties', partyId, 'chat'), orderBy('at', 'asc'), limitToLast(max)),
    (snap: any) => cb(snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }) as PartyChatMessage)),
    () => cb([]),
  );
}

export async function sendPartyReaction(partyId: string, emoji: string): Promise<void> {
  const me = auth.currentUser;
  if (!me || !(PARTY_EMOJIS as readonly string[]).includes(emoji)) return;
  await addDoc(collection(db, 'parties', partyId, 'reactions'), { uid: me.uid, emoji, at: serverTimestamp() });
}

export function listenPartyReactions(partyId: string, cb: (r: PartyReaction[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'parties', partyId, 'reactions'), orderBy('at', 'asc'), limitToLast(20)),
    (snap: any) => cb(snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }) as PartyReaction)),
    () => cb([]),
  );
}

// ── Discovery: "Watch with others now" ───────────────────────────────────────────────────────────
// Composite index: parties (isActive ASC, visibility ASC, hostHeartbeat DESC).

export function listenToPublicParties(cb: (parties: Party[]) => void, max = 12): () => void {
  return onSnapshot(
    query(collection(db, 'parties'), where('isActive', '==', true), where('visibility', '==', 'public'), orderBy('hostHeartbeat', 'desc'), limit(max)),
    (snap: any) => cb(snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }) as Party)),
    () => cb([]),
  );
}

// ── Invites ──────────────────────────────────────────────────────────────────────────────────────

export interface InviteCandidate { uid: string; name: string; photo: string }

/** People you follow + people who follow you (deduped, capped) — the in-app invite list. */
export async function fetchInviteCandidates(max = 60): Promise<InviteCandidate[]> {
  const me = auth.currentUser;
  if (!me) return [];
  const [followers, following] = await Promise.all([
    fetchFollowers(me.uid).catch(() => [] as string[]),
    fetchFollowing(me.uid).catch(() => [] as string[]),
  ]);
  const ids = Array.from(new Set([...following, ...followers])).filter(id => id && id !== me.uid).slice(0, max);
  const profiles = await fetchUserProfiles(ids).catch(() => []);
  return profiles.map((p: any) => ({ uid: p.uid || p.id, name: p.displayName || p.name || 'Someone', photo: p.photoURL || p.photo || '' }))
    .filter(c => !!c.uid);
}

const KIND_VERB: Record<PartyKind, string> = { WATCH: 'watch', READ: 'read', LISTEN: 'listen to' };

/** Send each selected person an in-app notification (+ push) that deep-links into the party. */
export async function sendPartyInvites(party: Party, uids: string[]): Promise<number> {
  const me = auth.currentUser;
  if (!me) return 0;
  const title = party.content.title || 'something';
  let sent = 0;
  for (const uid of Array.from(new Set(uids)).slice(0, 50)) {
    try {
      await createNotification({
        userId: uid,
        senderId: me.uid,
        senderName: me.displayName || 'A friend',
        senderPhoto: me.photoURL || '',
        type: 'CONTENT',
        title: `${me.displayName || 'A friend'} invited you to a party`,
        message: `Come ${KIND_VERB[party.kind] || 'join'} “${title}” together — it's happening now.`,
        link: `/?party=${encodeURIComponent(party.id)}`,
        targetId: party.id,
      } as any);
      sent++;
    } catch { /* keep going */ }
  }
  return sent;
}

/** Read a Firestore Timestamp|number|undefined to ms (0 when unknown / pending). */
export function tsToMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}
