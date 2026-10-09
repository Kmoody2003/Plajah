// socialPerfCore — PURE helpers for the social performance + migration work (no Firebase, no DOM).
// Everything here is unit-tested in tests/socialPerf.test.ts. The Firebase-bound halves live in
// services/socialPerf.ts (client), services/sharedSubscription.ts, and services/socialMigrationServer.ts (server).

// ─── Chat message paging ─────────────────────────────────────────────────────

export interface Timestamped { id: string; timestamp?: number }

/**
 * Merge a page of older messages (from "load earlier") with the live window (limitToLast).
 * Dedupes by id (the live window wins: it carries the freshest seenBy/edits) and sorts ascending.
 */
export function mergeMessagePages<T extends Timestamped>(older: T[], live: T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of older) byId.set(m.id, m);
  for (const m of live) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Apply a new live-window snapshot to what's on screen. The live window only holds the newest N, so when a
 * new message arrives the oldest one slides OUT of the query — it must not vanish from the screen. Rule:
 * anything inside the live window's time range comes from `live` (so deletions/burns inside it disappear);
 * anything older is kept from `prev` (older pages + messages that slid out). A non-full window is the whole
 * history, so `live` is the answer.
 */
export function slideMessageWindow<T extends Timestamped>(prev: T[], live: T[], liveIsFull: boolean): T[] {
  if (!liveIsFull || live.length === 0) return mergeMessagePages([], live);
  const oldest = Math.min(...live.map(m => m.timestamp || 0));
  const liveIds = new Set(live.map(m => m.id));
  const kept = prev.filter(m => (m.timestamp || 0) < oldest && !liveIds.has(m.id));
  return mergeMessagePages(kept, live);
}

// ─── Typing indicator ────────────────────────────────────────────────────────

export const TYPING_TTL_MS = 6_000;
export const TYPING_MIN_INTERVAL_MS = 3_000;

/** Who is typing right now: entries younger than the TTL, never yourself. */
export function activeTypers(users: Record<string, unknown> | undefined | null, now: number, selfUid?: string | null, ttl = TYPING_TTL_MS): string[] {
  if (!users || typeof users !== 'object') return [];
  return Object.entries(users)
    .filter(([uid, at]) => uid !== selfUid && typeof at === 'number' && now - at < ttl && at - now < ttl)
    .map(([uid]) => uid);
}

export interface TypingSendState { lastSentAt: number; lastValue: boolean }

/**
 * Throttle: "typing" goes out at most once per interval (a heartbeat so the TTL never lapses while
 * someone types a long message); "stopped" goes out immediately, but only if we last said "typing".
 */
export function shouldSendTyping(prev: TypingSendState | undefined, isTyping: boolean, now: number, minInterval = TYPING_MIN_INTERVAL_MS): boolean {
  if (!isTyping) return !!prev?.lastValue;
  if (!prev || !prev.lastValue) return true;
  return now - prev.lastSentAt >= minInterval;
}

// ─── Notification grouping ───────────────────────────────────────────────────

export interface NotificationLike {
  id: string; type: string; senderId?: string; senderName?: string; senderPhoto?: string;
  title?: string; message?: string; link?: string; targetId?: string; isRead?: boolean; timestamp: number;
}

export interface NotificationGroup<N extends NotificationLike = NotificationLike> {
  key: string;
  lead: N;              // newest item — its photo / link / timestamp represent the group
  items: N[];           // newest first, including lead
  actorNames: string[]; // distinct senders, newest first
  count: number;        // distinct senders
  isRead: boolean;      // true only when every item is read
  title: string;
  message: string;
}

const GROUP_VERB: Record<string, string> = {
  LIKE: 'liked your post',
  COMMENT: 'commented on your post',
  FOLLOW: 'started following you',
};
export const GROUP_WINDOW_MS = 48 * 3600_000;

/** "Ana", "Ana and Ben", "Ana and 9 others". */
export function actorPhrase(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return 'Someone';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  const rest = n.length - 1;
  return `${n[0]} and ${rest} other${rest === 1 ? '' : 's'}`;
}

/**
 * Collapse LIKE / COMMENT / FOLLOW notifications about the same thing within a 48h window into one row:
 * "Ana and 9 others liked your post". Everything else (messages, hellos, system) stays one-per-row.
 * Input order doesn't matter; output is newest first.
 */
export function groupNotifications<N extends NotificationLike>(list: N[], windowMs = GROUP_WINDOW_MS): NotificationGroup<N>[] {
  const sorted = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const groups: NotificationGroup<N>[] = [];
  const open = new Map<string, NotificationGroup<N>>();
  const seen = new Map<NotificationGroup<N>, Set<string>>();
  const addActor = (g: NotificationGroup<N>, n: N) => {
    const who = n.senderId || n.senderName || n.id;
    const s = seen.get(g)!;
    if (s.has(who)) return;
    s.add(who);
    g.actorNames.push(n.senderName || 'Someone');
  };
  for (const n of sorted) {
    const subject = n.type === 'FOLLOW' ? '' : (n.targetId || n.link || '');
    const groupable = !!GROUP_VERB[n.type] && (n.type === 'FOLLOW' || !!subject);
    const baseKey = groupable ? `${n.type}:${subject}` : `one:${n.id}`;
    const g = groupable ? open.get(baseKey) : undefined;
    if (g && (g.lead.timestamp || 0) - (n.timestamp || 0) <= windowMs) {
      g.items.push(n);
      if (!n.isRead) g.isRead = false;
      addActor(g, n);
      continue;
    }
    const ng: NotificationGroup<N> = {
      key: groupable ? `${baseKey}:${n.id}` : baseKey, lead: n, items: [n],
      actorNames: [], count: 1, isRead: !!n.isRead,
      title: n.title || '', message: n.message || '',
    };
    seen.set(ng, new Set());
    addActor(ng, n);
    groups.push(ng);
    if (groupable) open.set(baseKey, ng);
  }
  for (const g of groups) {
    g.count = g.actorNames.length || 1;
    if (g.count > 1) g.title = `${actorPhrase(g.actorNames)} ${GROUP_VERB[g.lead.type]}`;
  }
  return groups;
}

// ─── Fediverse handle keys (fediverse_handles/{key} → uid) ───────────────────

export type FediNetwork = 'bluesky' | 'mastodon';

const safeKey = (s: string) => s.toLowerCase().replace(/[\/\s]/g, '').slice(0, 300);

/** Bluesky accounts are keyed by DID (handles can change; DIDs don't). */
export function blueskyKey(did: string): string | null {
  const d = String(did || '').trim();
  return /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(d) ? `bluesky_${safeKey(d)}` : null;
}

/**
 * Mastodon accounts are keyed by the full address user@host. `acct` is relative to `homeHost`:
 * a local account's acct is just "user" (Mastodon API), a remote one is "user@remote.host".
 */
export function mastodonAddress(acct: string, homeHost: string): string | null {
  const a = String(acct || '').trim().replace(/^@/, '');
  if (!a) return null;
  const [user, host] = a.includes('@') ? a.split('@') : [a, homeHost];
  const h = String(host || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(user) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return null;
  return `${user.toLowerCase()}@${h}`;
}
export function mastodonKey(acct: string, homeHost: string): string | null {
  const addr = mastodonAddress(acct, homeHost);
  return addr ? `mastodon_${safeKey(addr)}` : null;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i
export const isInviteCode = (s: unknown): s is string => typeof s === 'string' && /^[a-hjkmnp-z2-9]{8}$/.test(s);
export function makeInviteCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length) % INVITE_ALPHABET.length];
  return out;
}
export const INVITE_REDEEM_WINDOW_MS = 7 * 24 * 3600_000;
/** An invite only counts for a brand-new account (created within 7 days), never your own code. */
export function canRedeemInvite(p: { inviterUid?: string | null; redeemerUid: string; accountCreatedAt?: number | null; now: number }): { ok: true } | { ok: false; reason: string } {
  if (!p.inviterUid) return { ok: false, reason: 'unknown_code' };
  if (p.inviterUid === p.redeemerUid) return { ok: false, reason: 'own_code' };
  if (!p.accountCreatedAt || p.now - p.accountCreatedAt > INVITE_REDEEM_WINDOW_MS) return { ok: false, reason: 'not_new' };
  return { ok: true };
}

// ─── Share paths + OG cards ──────────────────────────────────────────────────

export type ShareKind = 'club' | 'room' | 'talk' | 'party' | 'live' | 'join';
export const SHARE_PATH_PREFIX: Record<string, ShareKind> = { c: 'club', room: 'room', talk: 'talk', party: 'party', live: 'live', join: 'join' };
/** The query param the SPA boot already understands for each path-style share link. */
export const SHARE_KIND_PARAM: Record<ShareKind, string> = { club: 'club', room: 'room', talk: 'talk', party: 'party', live: 'livestream', join: 'join' };

/** "/c/abc" → { kind:'club', id:'abc', query:'club=abc' } ; anything else → null. Mirrors the inline script in index.html. */
export function parseSharePath(pathname: string): { kind: ShareKind; id: string; query: string } | null {
  const m = /^\/(c|room|talk|party|live|join)\/([A-Za-z0-9_:-]{1,128})\/?$/.exec(String(pathname || ''));
  if (!m) return null;
  const kind = SHARE_PATH_PREFIX[m[1]];
  return { kind, id: m[2], query: `${SHARE_KIND_PARAM[kind]}=${encodeURIComponent(m[2])}` };
}

export interface ShareCard { title: string; description: string; image: string }
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Title/description copy for a share card. `image` falls back to the caller's default. */
export function buildShareCard(kind: ShareKind, d: {
  name?: string; host?: string; count?: number; live?: boolean; description?: string; image?: string; contentTitle?: string;
}, fallbackImage: string): ShareCard {
  const name = clip((d.name || '').trim(), 90);
  const host = clip((d.host || '').trim(), 60);
  const n = Math.max(0, Math.floor(d.count || 0));
  const people = (k: number, word: string) => `${k.toLocaleString('en-US')} ${word}${k === 1 ? '' : 's'}`;
  const image = d.image || fallbackImage;
  switch (kind) {
    case 'club':
      return { title: name ? `${name} on Plajah` : 'A club on Plajah', image,
        description: clip(`${n ? `${people(n, 'member')} · ` : ''}${d.description?.trim() || `Join ${name || 'the club'} on Plajah.`}`, 200) };
    case 'room':
      return { title: d.live === false ? (name || 'A room on Plajah') : `${d.live ? '🔴 LIVE · ' : ''}${name || 'A live room'}`, image,
        description: `${host ? `Hosted by ${host}` : 'A room on Plajah'}${n ? ` · ${people(n, 'person')} inside` : ''}. Tap to join.` };
    case 'talk':
      return { title: `${d.live ? '🔴 LIVE · ' : ''}${name || 'A live talk'}`, image,
        description: `${host ? `${host} is talking` : 'A live audio talk'}${n ? ` · ${people(n, 'listener')}` : ''} on Plajah. Tap to listen in.` };
    case 'party': {
      const what = d.contentTitle ? ` · ${clip(d.contentTitle, 70)}` : '';
      return { title: `${host || 'Someone'}'s party${what}`, image,
        description: `${d.live === false ? 'This party has ended' : 'Watch, listen or read along together'}${n ? ` · ${people(n, 'guest')}` : ''}. Join on Plajah.` };
    }
    case 'live':
      return { title: `${d.live ? '🔴 LIVE · ' : ''}${name || 'Live stream'}`, image,
        description: `${host ? `${host} is ${d.live ? 'live now' : 'streaming'}` : 'A live stream'} on Plajah.${n ? ` ${people(n, 'viewer')}.` : ''} Tap to watch.` };
    case 'join':
      return { title: `${host || 'A friend'} invited you to Plajah`, image,
        description: 'Music, film, books, live shows and the people who make them — all in one place. Join and you\'ll follow each other automatically.' };
  }
}
