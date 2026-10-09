/**
 * Email notifications — server side (Resend + Firestore REST via the service account).
 * Decisions are in ./emailNotifyCore (pure, tested). This file does I/O only.
 *
 * State: email_notify_state/{uid} (server-only; no client rule needed — default deny)
 *   { day, sentToday, threadLast: [{id, at}], queue: QueueItem[], lastDigestAt, updatedAt }
 *
 * Env: RESEND_API_KEY, RESEND_FROM (a VERIFIED Resend domain sender, e.g.
 *      "Plajah <notifications@plajah.com>"), EMAIL_UNSUB_SECRET (falls back to CRON_SECRET),
 *      VITE_APP_URL (link base). Without a key or an unsubscribe secret nothing is sent
 *      (security mail aside, every email must carry a working unsubscribe link).
 */
import { getAccessToken, fsGet, fsPatch, fsList } from '../firebaseAdminRest';
import {
  planEmail, categoryForType, enqueue, groupDigest, safeSnippet, renderEmail, signUnsub,
  digestDue, dayKey, NEW_SENDER_AGE_MS, type QueueItem, type EmailCategory, type RenderedEmail,
} from './emailNotifyCore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';

export const appUrl = () => (process.env.VITE_APP_URL || process.env.APP_URL || 'https://plajah.com').replace(/\/+$/, '');
const unsubSecret = () => process.env.EMAIL_UNSUB_SECRET || process.env.CRON_SECRET || '';
export const emailConfigured = () => !!process.env.RESEND_API_KEY && !!unsubSecret();

interface AuthUser { email?: string; emailVerified: boolean; createdAt?: number; disabled?: boolean }

/** Email comes from Firebase Auth, never the (self-editable, public) users doc. */
export async function lookupAuthUser(uid: string): Promise<AuthUser | null> {
  const at = await getAccessToken();
  if (!at) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
      method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    });
    if (!r.ok) return null;
    const u = ((await r.json()) as any).users?.[0];
    if (!u) return null;
    // OAuth providers (Google/Microsoft) verify the address for us.
    const oauthVerified = Array.isArray(u.providerUserInfo) && u.providerUserInfo.some((p: any) => ['google.com', 'microsoft.com'].includes(p.providerId) && p.email === u.email);
    return { email: u.email, emailVerified: u.emailVerified === true || oauthVerified, createdAt: u.createdAt ? Number(u.createdAt) : undefined, disabled: u.disabled === true };
  } catch { return null; }
}

function unsubUrl(uid: string, scope: string): string {
  return `${appUrl()}/api/notify/email/unsubscribe?t=${encodeURIComponent(signUnsub(uid, scope, unsubSecret()))}`;
}

export async function sendViaResend(to: string, mail: RenderedEmail, unsubscribe?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const headers: Record<string, string> = {};
  if (unsubscribe) {
    headers['List-Unsubscribe'] = `<${unsubscribe}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>',
        to, subject: mail.subject, text: mail.text, html: mail.html, headers,
      }),
    });
    if (!r.ok) console.warn('[emailNotify] resend', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return r.ok;
  } catch (e: any) { console.warn('[emailNotify] resend error', e?.message); return false; }
}

interface State { day?: string; sentToday?: number; threadLast?: Array<{ id: string; at: number }>; queue?: QueueItem[]; lastDigestAt?: number }

async function readState(uid: string): Promise<State> {
  return ((await fsGet(`email_notify_state/${uid}`)) || {}) as State;
}
async function writeState(uid: string, s: State): Promise<void> {
  await fsPatch(`email_notify_state/${uid}`, { ...s, updatedAt: Date.now() } as Record<string, unknown>);
}
function bumpSent(s: State, now: number): State {
  const day = dayKey(now);
  return { ...s, day, sentToday: (s.day === day ? s.sentToday || 0 : 0) + 1 };
}

export interface DispatchInput {
  toUid: string;
  fromUid?: string;          // verified caller uid; absent for platform/system
  type?: string;
  title?: string;
  body?: string;
  targetId?: string;
  threadId?: string;
  notificationId?: string;
}

/** Decide + act for one notification. Never throws; returns the plan's reason for logging. */
export async function dispatchEmailNotification(d: DispatchInput): Promise<string> {
  try {
    if (!emailConfigured()) return 'not_configured';
    const category: EmailCategory = d.fromUid ? categoryForType(d.type) : (d.type === 'SECURITY' ? 'security' : 'platform');
    // User-to-user can't claim system/platform/security categories.
    if (d.fromUid && !['messages', 'social', 'content'].includes(category)) return 'category_not_allowed';

    const [recipient, profile, state] = await Promise.all([
      lookupAuthUser(d.toUid), fsGet(`users/${d.toUid}`), readState(d.toUid),
    ]);
    if (!recipient || recipient.disabled) return 'no_recipient';
    const prefs = (profile?.notificationPrefs || {}) as Record<string, unknown>;

    let senderName = 'Plajah';
    let senderIsStranger = false;
    if (d.fromUid) {
      if (Array.isArray(profile?.blockedUsers) && profile!.blockedUsers.includes(d.fromUid)) return 'blocked';
      const [sender, senderProfile, followsSender] = await Promise.all([
        lookupAuthUser(d.fromUid), fsGet(`users/${d.fromUid}`), fsGet(`follows/${d.toUid}_${d.fromUid}`),
      ]);
      // Real display name from the server, never the caller-supplied one.
      senderName = safeSnippet(senderProfile?.displayName || senderProfile?.name || 'Someone', 60) || 'Someone';
      const youngAccount = !sender?.createdAt || Date.now() - sender.createdAt < NEW_SENDER_AGE_MS;
      senderIsStranger = !followsSender && youngAccount;
    }

    const now = Date.now();
    const threadKey = d.threadId || d.targetId || '';
    const plan = planEmail({
      category, prefs, now,
      emailVerified: recipient.emailVerified, hasEmail: !!recipient.email,
      sentTodayImmediate: state.day === dayKey(now) ? state.sentToday || 0 : 0,
      lastThreadEmailAt: (state.threadLast || []).find(t => t.id === threadKey)?.at,
      senderIsStranger,
    });

    const item: QueueItem = {
      kind: plan.action === 'queue_unread' ? 'unread' : 'digest',
      type: (d.type || 'SYSTEM').toUpperCase(), category,
      senderId: d.fromUid || 'plajah', senderName,
      snippet: safeSnippet(d.body), targetId: d.targetId, threadId: d.threadId,
      notificationId: d.notificationId, at: now,
      sendAfter: plan.action === 'queue_unread' ? plan.sendAfter : undefined,
    };

    if (plan.action === 'skip') return plan.reason;
    if (plan.action === 'queue_unread' || plan.action === 'digest') {
      await writeState(d.toUid, { ...state, queue: enqueue(state.queue || [], item) });
      return plan.reason;
    }
    // send_now: system / platform / security — title + body are server- or admin-authored here.
    const scope = category === 'security' ? '' : 'system';
    const mail = renderEmail({
      subject: safeSnippet(d.title, 120) || 'An update from Plajah',
      heading: safeSnippet(d.title, 120) || 'An update from Plajah',
      lines: [safeSnippet(d.body, 1200)],
      ctaLabel: 'Open Plajah', ctaUrl: `${appUrl()}/`,
      unsubscribeUrl: scope ? unsubUrl(d.toUid, scope) : undefined,
      footerNote: category === 'security' ? 'This is a security notice about your account and can’t be turned off.' : undefined,
    });
    const ok = await sendViaResend(recipient.email!, mail, scope ? unsubUrl(d.toUid, scope) : undefined);
    if (ok) await writeState(d.toUid, bumpSent(state, now));
    return ok ? 'sent' : 'send_failed';
  } catch (e: any) {
    console.warn('[emailNotify] dispatch error', e?.message);
    return 'error';
  }
}

/**
 * Cron worker (every ~15 min): sends "unread messages" emails whose delay elapsed and the
 * notification is STILL unread, and daily/weekly digests that are due. Bounded per run.
 */
export async function runEmailNotificationCron(maxUsers = 2000): Promise<{ users: number; unreadEmails: number; digests: number }> {
  const out = { users: 0, unreadEmails: 0, digests: 0 };
  if (!emailConfigured()) return out;
  const docs = await fsList('email_notify_state', { pageSize: 300, maxDocs: maxUsers });
  const now = Date.now();
  for (const { id: uid, data } of docs) {
    const state = data as State;
    const queue = state.queue || [];
    if (!queue.length) continue;
    out.users++;
    const profile = await fsGet(`users/${uid}`);
    const prefs = (profile?.notificationPrefs || {}) as Record<string, unknown>;
    let next: State = { ...state };
    let remaining = queue;
    let recipient: AuthUser | null | undefined;
    const getRecipient = async () => (recipient === undefined ? (recipient = await lookupAuthUser(uid)) : recipient);

    // 1) Unread messages past their delay.
    const dueUnread = queue.filter(q => q.kind === 'unread' && (q.sendAfter || 0) <= now);
    if (dueUnread.length) {
      const stillUnread: QueueItem[] = [];
      for (const q of dueUnread) {
        if (!q.notificationId) { stillUnread.push(q); continue; }
        const n = await fsGet(`notifications/${q.notificationId}`);
        if (n && n.isRead !== true) stillUnread.push(q);
      }
      remaining = remaining.filter(q => !dueUnread.includes(q));
      const r = stillUnread.length ? await getRecipient() : null;
      if (r?.email && r.emailVerified && prefs.email !== false && prefs.emailMessages !== false) {
        const byThread = new Map<string, QueueItem[]>();
        for (const q of stillUnread) byThread.set(q.threadId || q.senderId, [...(byThread.get(q.threadId || q.senderId) || []), q]);
        const lines = Array.from(byThread.values()).slice(0, 6).map(g => {
          const last = g[g.length - 1];
          return `${last.senderName}${g.length > 1 ? ` (${g.length} messages)` : ''}: “${last.snippet || 'sent you a message'}”`;
        });
        const first = stillUnread[0].senderName;
        const mail = renderEmail({
          subject: byThread.size === 1 ? `${first} sent you a message on Plajah` : `You have unread messages from ${byThread.size} people`,
          heading: 'You have unread messages', lines, ctaLabel: 'Reply on Plajah', ctaUrl: `${appUrl()}/`,
          unsubscribeUrl: unsubUrl(uid, 'messages'),
        });
        if (await sendViaResend(r.email, mail, unsubUrl(uid, 'messages'))) {
          out.unreadEmails++;
          next = bumpSent(next, now);
          const tl = (next.threadLast || []).filter(t => !byThread.has(t.id));
          next.threadLast = [...tl, ...Array.from(byThread.keys()).map(id => ({ id, at: now }))].slice(-30);
        }
      }
    }

    // 2) Digest.
    const digestItems = remaining.filter(q => q.kind === 'digest');
    if (digestItems.length && digestDue(prefs, state.lastDigestAt, now)) {
      remaining = remaining.filter(q => q.kind !== 'digest');
      const r = await getRecipient();
      if (r?.email && r.emailVerified && prefs.email !== false) {
        const lines = groupDigest(digestItems).slice(0, 12);
        const weekly = prefs.emailWeekly === true;
        const mail = renderEmail({
          subject: `${lines[0]}${lines.length > 1 ? ` + ${lines.length - 1} more` : ''}`,
          heading: weekly ? 'Your week on Plajah' : 'Today on Plajah', lines,
          ctaLabel: 'See what’s new', ctaUrl: `${appUrl()}/`,
          unsubscribeUrl: unsubUrl(uid, 'social'),
        });
        if (await sendViaResend(r.email, mail, unsubUrl(uid, 'social'))) out.digests++;
      }
      next.lastDigestAt = now;
    }

    if (remaining.length !== queue.length || next.lastDigestAt !== state.lastDigestAt) {
      await writeState(uid, { ...next, queue: remaining });
    }
  }
  return out;
}

const FS_DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${process.env.FIREBASE_DB_ID || 'plajah-prod'}/documents`;

/** Server-authored in-app notification. `timestamp` is a real Firestore timestamp so it sorts
 *  with client-created (serverTimestamp) notifications in the bell's orderBy('timestamp'). */
export async function createServerNotification(toUid: string, n: { title: string; message: string; link?: string; type?: string }): Promise<string | undefined> {
  const at = await getAccessToken();
  if (!at) return undefined;
  const s = (v: string) => ({ stringValue: v });
  try {
    const r = await fetch(`${FS_DOCS}/notifications`, {
      method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        userId: s(toUid), senderId: s('plajah'), senderName: s('Plajah'), senderPhoto: s(''),
        type: s(n.type || 'SYSTEM'), title: s(n.title.slice(0, 120)), message: s(n.message.slice(0, 2000)),
        link: s((n.link || 'FEED').slice(0, 300)), isRead: { booleanValue: false },
        timestamp: { timestampValue: new Date().toISOString() },
      } }),
    });
    if (!r.ok) return undefined;
    return ((await r.json()) as any).name?.split('/').pop();
  } catch { return undefined; }
}

export async function listAllUserIds(max = 5000): Promise<string[]> {
  return (await fsList('users', { pageSize: 300, maxDocs: max })).map(d => d.id);
}
