/**
 * Email notifications — PURE decisions (no I/O, unit-tested in tests/emailNotify.test.ts).
 *
 * Email is the third channel beside in-app (always) and push. It must never feel like spam:
 *   - messages  → only if still UNREAD after a short delay (you didn't see it in-app/push), one
 *                 email per thread per window
 *   - social    → bundled into a daily (or weekly) digest, never one email per like
 *   - content   → OPT-IN only (new posts from followed creators), digest
 *   - system / platform → sent right away
 *   - security  → always sent to a verified address (sign-in alerts, appeals decisions)
 * Recipients need a VERIFIED email. Strangers' notifications (a brand-new sender the recipient
 * doesn't follow) stay in-app only — email is where phishing lives.
 *
 * Prefs live in users/{uid}.notificationPrefs (booleans, opt-out: unset = on), alongside the
 * push keys: email (master), emailMessages, emailSocial, emailSystem, emailContent (opt-in),
 * emailWeekly (digest weekly instead of daily).
 */
import nodeCrypto from 'node:crypto';

export type EmailCategory = 'messages' | 'social' | 'content' | 'system' | 'platform' | 'security';
export type EmailPlan =
  | { action: 'send_now'; reason: string }
  | { action: 'queue_unread'; reason: string; sendAfter: number }
  | { action: 'digest'; reason: string }
  | { action: 'skip'; reason: string };

export const MESSAGE_UNREAD_DELAY_MS = 15 * 60 * 1000;
export const THREAD_EMAIL_COOLDOWN_MS = 60 * 60 * 1000;
export const DAILY_IMMEDIATE_CAP = 8;
export const NEW_SENDER_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const DAILY_DIGEST_MS = 20 * 60 * 60 * 1000;   // "daily" tolerant of cron jitter
export const WEEKLY_DIGEST_MS = 6.5 * 24 * 60 * 60 * 1000;
export const MAX_QUEUE_ITEMS = 60;

export function categoryForType(type: string | undefined): EmailCategory {
  switch ((type || '').toUpperCase()) {
    case 'MESSAGE': return 'messages';
    case 'COMMENT': case 'LIKE': case 'FOLLOW': case 'HELLO': case 'MENTION': return 'social';
    case 'CONTENT': return 'content';
    case 'SECURITY': return 'security';
    case 'PLATFORM': return 'platform';
    default: return 'system';
  }
}

export interface PlanInput {
  category: EmailCategory;
  prefs: Record<string, unknown>;
  emailVerified: boolean;
  hasEmail: boolean;
  now: number;
  sentTodayImmediate: number;
  /** Last time this thread produced an email (messages only). */
  lastThreadEmailAt?: number;
  /** Sender trust: a user-to-user notification from a new account the recipient doesn't follow. */
  senderIsStranger?: boolean;
}

const on = (prefs: Record<string, unknown>, k: string) => prefs[k] !== false;

export function planEmail(i: PlanInput): EmailPlan {
  if (!i.hasEmail) return { action: 'skip', reason: 'no_email' };
  if (!i.emailVerified) return { action: 'skip', reason: 'email_unverified' };
  if (i.category === 'security') return { action: 'send_now', reason: 'security' };
  if (!on(i.prefs, 'email')) return { action: 'skip', reason: 'email_master_off' };

  switch (i.category) {
    case 'platform':
    case 'system':
      if (!on(i.prefs, 'emailSystem')) return { action: 'skip', reason: 'category_off' };
      if (i.sentTodayImmediate >= DAILY_IMMEDIATE_CAP) return { action: 'digest', reason: 'daily_cap' };
      return { action: 'send_now', reason: i.category };
    case 'messages':
      if (!on(i.prefs, 'emailMessages')) return { action: 'skip', reason: 'category_off' };
      if (i.senderIsStranger) return { action: 'skip', reason: 'stranger_sender' };
      if (i.lastThreadEmailAt && i.now - i.lastThreadEmailAt < THREAD_EMAIL_COOLDOWN_MS) {
        return { action: 'skip', reason: 'thread_cooldown' };
      }
      return { action: 'queue_unread', reason: 'wait_for_unread', sendAfter: i.now + MESSAGE_UNREAD_DELAY_MS };
    case 'social':
      if (!on(i.prefs, 'emailSocial')) return { action: 'skip', reason: 'category_off' };
      if (i.senderIsStranger) return { action: 'skip', reason: 'stranger_sender' };
      return { action: 'digest', reason: 'social_digest' };
    case 'content':
      // Opt-in: must be explicitly true.
      if (i.prefs.emailContent !== true) return { action: 'skip', reason: 'content_opt_in' };
      return { action: 'digest', reason: 'content_digest' };
  }
  return { action: 'skip', reason: 'unknown' };
}

export function digestIntervalMs(prefs: Record<string, unknown>): number {
  return prefs.emailWeekly === true ? WEEKLY_DIGEST_MS : DAILY_DIGEST_MS;
}

export function digestDue(prefs: Record<string, unknown>, lastDigestAt: number | undefined, now: number): boolean {
  return now - (lastDigestAt || 0) >= digestIntervalMs(prefs);
}

export interface QueueItem {
  kind: 'unread' | 'digest';
  type: string;
  category: EmailCategory;
  senderId: string;
  senderName: string;
  snippet: string;
  targetId?: string;
  threadId?: string;
  notificationId?: string;
  at: number;
  sendAfter?: number;
}

/** Append, newest last, bounded. Duplicate (same notificationId) is dropped. */
export function enqueue(queue: QueueItem[], item: QueueItem): QueueItem[] {
  if (item.notificationId && queue.some(q => q.notificationId === item.notificationId)) return queue;
  const next = [...queue, item];
  return next.length > MAX_QUEUE_ITEMS ? next.slice(next.length - MAX_QUEUE_ITEMS) : next;
}

/** Group digest items into human lines: "Ana and 3 others liked your post". */
export function groupDigest(items: QueueItem[]): string[] {
  const verb: Record<string, string> = {
    LIKE: 'liked your post', COMMENT: 'commented on your post', FOLLOW: 'followed you',
    HELLO: 'said hi', MENTION: 'mentioned you', CONTENT: 'posted something new',
  };
  const groups = new Map<string, QueueItem[]>();
  for (const it of items) {
    const key = it.type === 'FOLLOW' || it.type === 'HELLO' ? it.type : `${it.type}:${it.targetId || ''}`;
    groups.set(key, [...(groups.get(key) || []), it]);
  }
  const lines: string[] = [];
  for (const g of groups.values()) {
    const names = Array.from(new Set(g.map(x => x.senderName || 'Someone')));
    const v = verb[g[0].type] || 'sent you a notification';
    const who = names.length === 1 ? names[0]
      : names.length === 2 ? `${names[0]} and ${names[1]}`
      : `${names[0]} and ${names.length - 1} others`;
    const snip = g.length === 1 && g[0].type === 'COMMENT' && g[0].snippet ? `: “${g[0].snippet}”` : '';
    lines.push(`${who} ${v}${snip}`);
  }
  return lines;
}

/** Plain-text-ify untrusted snippet text: no links, no markup, bounded. */
export function safeSnippet(s: unknown, max = 140): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\bwww\.\S+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ── Unsubscribe tokens (HMAC, no expiry — an old email's link must keep working) ──
export function signUnsub(uid: string, scope: string, secret: string): string {
  const body = Buffer.from(JSON.stringify({ u: uid, s: scope })).toString('base64url');
  const mac = nodeCrypto.createHmac('sha256', secret).update(body).digest('base64url').slice(0, 32);
  return `${body}.${mac}`;
}
export function verifyUnsub(token: string, secret: string): { uid: string; scope: string } | null {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expect = nodeCrypto.createHmac('sha256', secret).update(body).digest('base64url').slice(0, 32);
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return null;
  try {
    const { u, s } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof u !== 'string' || typeof s !== 'string') return null;
    return { uid: u, scope: s };
  } catch { return null; }
}
/** Pref key an unsubscribe scope turns off. 'all' → master. */
export function prefKeyForScope(scope: string): string | null {
  return ({ all: 'email', messages: 'emailMessages', social: 'emailSocial', system: 'emailSystem', platform: 'emailSystem', content: 'emailContent' } as Record<string, string>)[scope] ?? null;
}

// ── Templates ──────────────────────────────────────────────────────────────────
export interface RenderedEmail { subject: string; text: string; html: string }

export function renderEmail(o: {
  heading: string; lines: string[]; ctaLabel: string; ctaUrl: string;
  unsubscribeUrl?: string; footerNote?: string; subject: string;
}): RenderedEmail {
  const lines = o.lines.map(l => l.trim()).filter(Boolean);
  const text = [
    o.heading, '', ...lines, '', `${o.ctaLabel}: ${o.ctaUrl}`, '',
    o.footerNote || 'You’re getting this because of your Plajah notification settings.',
    o.unsubscribeUrl ? `Turn these emails off: ${o.unsubscribeUrl}` : '',
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  const li = lines.map(l => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#1d1d1f">${escapeHtml(l)}</p>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<tr><td style="font-size:13px;font-weight:800;letter-spacing:.2em;color:#ff6a2b;text-transform:uppercase;padding-bottom:16px">Plajah</td></tr>
<tr><td style="font-size:20px;font-weight:700;color:#111;padding-bottom:14px">${escapeHtml(o.heading)}</td></tr>
<tr><td>${li}</td></tr>
<tr><td style="padding:18px 0 6px"><a href="${escapeHtml(o.ctaUrl)}" style="display:inline-block;background:#ff6a2b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">${escapeHtml(o.ctaLabel)}</a></td></tr>
<tr><td style="padding-top:22px;font-size:12px;line-height:1.5;color:#86868b">${escapeHtml(o.footerNote || 'You’re getting this because of your Plajah notification settings.')}${o.unsubscribeUrl ? ` <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:#86868b">Turn these emails off</a>.` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: o.subject.slice(0, 150), text, html };
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
