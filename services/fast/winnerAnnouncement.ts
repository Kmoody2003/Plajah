// Fan Vote winner announcement — when a ballot locks, tell people who won.
//
//   1. a post on Plajah (posts + the feed mirror), from the channel's account;
//   2. the same message to every connected social account of that account (Bluesky, Mastodon, Threads
//      — whatever is linked under users/{uid}/fediverseAccounts), so as more social tools are wired up
//      they receive winners without a change here.
//
// "The channel's account" is the creator who owns the slot, or — for Plajah's own channels — the
// platform account named by PLAJAH_OFFICIAL_UID. Bluesky for the platform account is whatever is
// connected to that user; BLUESKY_PLATFORM_HANDLE + BLUESKY_PLATFORM_APP_PASSWORD work as a fallback.
//
// Exactly once per ballot: the claim doc livePollAnnouncements/{pollId} is created before anything is
// sent, and holds the per-destination outcome afterwards. Failures never block locking or scheduling.

import { countsToArray, percentages, totalVotes, type LivePoll } from './voteSchedule';

export interface AnnounceDeps {
  read: (collection: string, id: string) => Promise<Record<string, any> | null>;
  patch: (collection: string, id: string, fields: Record<string, any>) => Promise<boolean>;
  createOnce: (collection: string, id: string, data: Record<string, any>) => Promise<'created' | 'exists' | 'error'>;
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
}

const SITE = 'https://plajah.com';
const MAX_LEN = 290; // Bluesky allows 300 graphemes; leave headroom

export interface WinnerMessage { text: string; title: string; imageUrl?: string }

/** The announcement text for a locked ballot, or null when there is nothing to announce. */
export function winnerMessage(poll: LivePoll, hhmmLabel: string): WinnerMessage | null {
  if (poll.status !== 'LOCKED' || poll.winnerIdx == null) return null;
  const win = poll.options[poll.winnerIdx];
  if (!win) return null;
  const counts = countsToArray(poll.counts, poll.options.length);
  const total = totalVotes(poll.counts, poll.options.length);
  const pct = percentages(counts)[poll.winnerIdx];
  const channel = (poll.subtitle || '').split('·')[0].trim() || 'Plajah';
  const title = win.programme?.title || win.label;
  const why = total === 0 ? 'No votes came in, so we picked at random.'
    : poll.winnerReason === 'TIE_FIRST_TO_REACH' ? `A tie at ${pct}% — first to get there wins.`
    : `Fans picked it with ${pct}% of ${total.toLocaleString()} vote${total === 1 ? '' : 's'}.`;
  const free = poll.funding?.unlocked ? ' Airing commercial-free, thanks to fan pledges!' : '';
  const base = `🎬 Tonight ${hhmmLabel} on ${channel}: ${title}! ${why}${free}`;
  const tail = ` ${SITE} #Plajah`;
  const text = (base.length + tail.length > MAX_LEN ? base.slice(0, MAX_LEN - tail.length - 1).trimEnd() + '…' : base) + tail;
  const img = win.programme?.thumbnail;
  return { text, title, ...(img && /^https?:\/\//i.test(img) ? { imageUrl: img } : {}) };
}

function clockOf(poll: LivePoll): string {
  const at = poll.schedule?.airAtMs;
  if (!at) return 'at showtime';
  const t = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: poll.schedule?.timezone || 'America/New_York', timeZoneName: 'short' });
  return `at ${t.replace(':00 ', ' ')}`;
}

async function postToPlajah(deps: AnnounceDeps, uid: string, poll: LivePoll, msg: WinnerMessage): Promise<string> {
  const profile = (await deps.read('users', uid)) || {};
  const authorName = profile.displayName || 'Plajah';
  const authorPhoto = profile.photoURL || '';
  const id = `fastvote_${poll.id}`.slice(0, 120);
  const now = Date.now();
  const media = msg.imageUrl ? [{ type: 'IMAGE', url: msg.imageUrl }] : [];
  const made = await deps.createOnce('posts', id, {
    text: msg.text, authorId: uid, authorName, authorPhoto, likesCount: 0, commentsCount: 0, timestamp: now, isPublic: true,
    hashtags: ['plajah'], ...(media.length ? { media } : {}),
  });
  if (made === 'error') throw new Error('post write failed');
  if (made === 'created') {
    await deps.createOnce('feed', id, {
      authorId: uid, authorName, authorPhoto, type: media.length ? 'PICTURE' : 'NEWS', content: msg.text, timestamp: now,
      likesCount: 0, commentCount: 0, shareCount: 0, originalPostId: id, ...(msg.imageUrl ? { imageUrl: msg.imageUrl } : {}),
    }).catch(() => {});
  }
  return id;
}

async function postToSocials(deps: AnnounceDeps, uid: string, isPlatform: boolean, text: string): Promise<Array<{ protocol: string; handle?: string; ok: boolean; error?: string; url?: string }>> {
  const { decentralizedAuth } = await import('../fediverse/auth');
  const { ADAPTERS_MAP } = await import('../fediverse/service');
  const token = ((await deps.firestoreAuthHeaders()).Authorization || '').replace(/^Bearer\s+/i, '');
  let accounts = await decentralizedAuth.loadAccounts(uid, token).catch(() => []);
  accounts = accounts.filter(a => a.isActive);
  const out: Array<{ protocol: string; handle?: string; ok: boolean; error?: string; url?: string }> = [];
  const send = async (protocol: 'bluesky' | 'mastodon' | 'threads', creds: any, handle?: string) => {
    try {
      const post = await ADAPTERS_MAP[protocol].createPost(creds, text);
      out.push({ protocol, handle, ok: true, url: post?.url });
    } catch (e: any) {
      out.push({ protocol, handle, ok: false, error: String(e?.message || e).slice(0, 200) });
    }
  };
  await Promise.all(accounts.map(a => send(a.protocol, a.credentials, a.handle)));
  if (isPlatform && !accounts.some(a => a.protocol === 'bluesky')) {
    const h = process.env.BLUESKY_PLATFORM_HANDLE, pw = process.env.BLUESKY_PLATFORM_APP_PASSWORD;
    if (h && pw) {
      try {
        const { bskyCreateSession } = await import('../fediverse/bluesky');
        await send('bluesky', await bskyCreateSession(h.replace(/^@/, ''), pw), h);
      } catch (e: any) { out.push({ protocol: 'bluesky', handle: h, ok: false, error: String(e?.message || e).slice(0, 200) }); }
    }
  }
  return out;
}

/**
 * Announce a locked ballot's winner. Safe to call repeatedly: only the caller that creates the claim
 * sends anything. Returns a one-line summary for the tick log, or null when nothing was done.
 */
export async function announceWinner(deps: AnnounceDeps, poll: LivePoll): Promise<string | null> {
  const msg = winnerMessage(poll, clockOf(poll));
  if (!msg) return null;
  // Whose voice: the creator who owns the slot, else the platform account.
  const isPlatform = !poll.ownerUid;
  const uid = poll.ownerUid || process.env.PLAJAH_OFFICIAL_UID || '';
  if (!uid) return `${poll.id}: winner not announced — PLAJAH_OFFICIAL_UID is not set`;
  // A creator can switch winner posts off for their channel.
  if (!isPlatform) {
    const sched = await deps.read('fast_channel_schedules', uid);
    if (sched?.autoPostWinners === false) return null;
  }
  const claim = await deps.createOnce('livePollAnnouncements', poll.id, { at: Date.now(), uid, text: msg.text });
  if (claim !== 'created') return null;

  const result: Record<string, any> = {};
  try { result.plajahPostId = await postToPlajah(deps, uid, poll, msg); }
  catch (e: any) { result.plajahError = String(e?.message || e).slice(0, 200); }
  try { result.socials = await postToSocials(deps, uid, isPlatform, msg.text); }
  catch (e: any) { result.socialsError = String(e?.message || e).slice(0, 200); }
  await deps.patch('livePollAnnouncements', poll.id, { ...result, doneAt: Date.now() });
  const socials = (result.socials || []) as Array<{ protocol: string; ok: boolean }>;
  return `${poll.id}: winner announced (Plajah ${result.plajahPostId ? 'ok' : 'FAILED'}; ${socials.length ? socials.map(s => `${s.protocol} ${s.ok ? 'ok' : 'FAILED'}`).join(', ') : 'no social accounts connected'})`;
}
