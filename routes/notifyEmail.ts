/**
 * Email notification routes. Dispatch itself happens server-side from /api/push and
 * /api/push/admin (server.ts) via services/notify/emailNotifyServer.
 *
 *   GET  /api/notify/email/unsubscribe?t=   confirm page (GET never changes state — mail scanners prefetch links)
 *   POST /api/notify/email/unsubscribe?t=   RFC 8058 one-click + the confirm page's button
 *   POST /api/notify/email/test             (Bearer ID token) send a test email to yourself
 *   POST /api/cron/email-notifications      header x-cron-key == CRON_SECRET | ADMIN_SEED_KEY — run every 15 min
 */
import { Router } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsPatch } from '../services/firebaseAdminRest';
import { verifyUnsub, prefKeyForScope, renderEmail, escapeHtml } from '../services/notify/emailNotifyCore';
import { lookupAuthUser, sendViaResend, runEmailNotificationCron, emailConfigured, appUrl } from '../services/notify/emailNotifyServer';

export const notifyEmailRouter = Router();

const secret = () => process.env.EMAIL_UNSUB_SECRET || process.env.CRON_SECRET || '';
const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px">
<div style="max-width:420px;background:#fff;border-radius:16px;padding:28px;text-align:center">${body}</div></body></html>`;

const SCOPE_LABEL: Record<string, string> = {
  all: 'all Plajah emails', messages: 'unread-message emails', social: 'activity digests',
  system: 'update emails', platform: 'update emails', content: 'new-content digests',
};

notifyEmailRouter.get('/notify/email/unsubscribe', (req, res) => {
  const t = String(req.query.t || '');
  const v = verifyUnsub(t, secret());
  if (!secret() || !v) return res.status(400).send(page('Link expired', '<h2>This link isn’t valid</h2><p>You can change email settings in Plajah → Notifications → Settings.</p>'));
  res.send(page('Unsubscribe', `<h2 style="margin-top:0">Stop ${escapeHtml(SCOPE_LABEL[v.scope] || 'these emails')}?</h2>
<form method="post" action="/api/notify/email/unsubscribe?t=${encodeURIComponent(t)}"><button style="background:#ff6a2b;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:15px;cursor:pointer">Turn them off</button></form>
<form method="post" action="/api/notify/email/unsubscribe?t=${encodeURIComponent(t)}&all=1" style="margin-top:14px"><button style="background:none;border:0;color:#86868b;font-size:13px;text-decoration:underline;cursor:pointer">Or stop all Plajah emails</button></form>`));
});

notifyEmailRouter.post('/notify/email/unsubscribe', express.urlencoded({ extended: false }), async (req, res) => {
  const v = secret() ? verifyUnsub(String(req.query.t || ''), secret()) : null;
  if (!v) return res.status(400).send(page('Link expired', '<h2>This link isn’t valid</h2>'));
  const scope = req.query.all === '1' ? 'all' : v.scope;
  const key = prefKeyForScope(scope);
  if (!key) return res.status(400).send(page('Error', '<h2>Unknown email type</h2>'));
  const profile = await fsGet(`users/${v.uid}`);
  const prefs = { ...((profile?.notificationPrefs || {}) as Record<string, unknown>), [key]: false };
  await fsPatch(`users/${v.uid}`, { notificationPrefs: prefs });
  res.send(page('Unsubscribed', `<h2 style="margin-top:0">Done</h2><p>You won’t get ${escapeHtml(SCOPE_LABEL[scope] || 'these emails')} anymore. You can turn them back on any time in Plajah → Notifications → Settings.</p>`));
});

const testHits = new Map<string, number>();
notifyEmailRouter.post('/notify/email/test', async (req, res) => {
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? await verifyIdTokenDetailed(h.slice(7)) : null;
  if (!tok || tok.isAnonymous) return res.status(401).json({ error: 'Sign in to send a test email' });
  if (!emailConfigured()) return res.json({ sent: false, reason: 'not_configured' });
  const last = testHits.get(tok.uid) || 0;
  if (Date.now() - last < 60_000) return res.status(429).json({ error: 'One test email per minute' });
  testHits.set(tok.uid, Date.now());
  const u = await lookupAuthUser(tok.uid);
  if (!u?.email) return res.json({ sent: false, reason: 'no_email' });
  if (!u.emailVerified) return res.json({ sent: false, reason: 'email_unverified' });
  const mail = renderEmail({
    subject: 'Your Plajah email notifications are working', heading: 'Email notifications are on',
    lines: ['This is a test. Unread messages, your activity digest and important updates will arrive here, based on your notification settings.'],
    ctaLabel: 'Open Plajah', ctaUrl: `${appUrl()}/`,
  });
  const ok = await sendViaResend(u.email, mail);
  res.json({ sent: ok, to: u.email.replace(/^(.).*(@.*)$/, '$1•••$2') });
});

function cronOk(provided: unknown): boolean {
  const p = String(provided || '');
  return [process.env.CRON_SECRET, process.env.ADMIN_SEED_KEY].some(s => {
    if (!s || !p) return false;
    const a = Buffer.from(p), b = Buffer.from(s);
    return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
  });
}
notifyEmailRouter.post('/cron/email-notifications', async (req, res) => {
  if (!cronOk(req.headers['x-cron-key'])) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await runEmailNotificationCron());
});
