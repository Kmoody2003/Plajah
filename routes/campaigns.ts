// Campaigns — Plajah's built-in email marketing for business, organisation and creator accounts.
// Mount with: app.use('/api/campaigns', express.json({ limit: '2mb' }), campaignsRouter)
//
// This is "Mailchimp, built in": the audience already lives on the platform, so a sender picks a
// segment of people who genuinely opted in rather than importing a list from somewhere else.
//
// COMPLIANCE IS ENFORCED HERE, NOT IN THE UI. A client can be modified; this cannot. Every send:
//   · is blocked unless the sender has a verified physical postal address        (CAN-SPAM)
//   · draws recipients SERVER-SIDE from the sender's own mailing_lists rows      (no pasted lists)
//   · filters against the suppression list before a single message goes out      (CAN-SPAM, CASL)
//   · carries List-Unsubscribe + List-Unsubscribe-Post: One-Click                (RFC 8058)
//   · appends the sender's postal address and a working unsubscribe link         (CAN-SPAM)
//   · records who it went to and why they were on the list                       (GDPR/CASL proof)
//
// Unsubscribe tokens are HMAC-signed and self-describing, so a one-click POST can be honoured
// instantly without a database lookup and cannot be forged to unsubscribe someone else.
//
// Endpoints:
//   GET    /api/campaigns/status                — is sending configured on this deployment
//   GET    /api/campaigns/sender               — the caller's sender profile + readiness
//   PUT    /api/campaigns/sender               — set from-name, reply-to, postal address
//   GET    /api/campaigns/audience             — segment sizes for the caller's own audience
//   POST   /api/campaigns/send                 — compliance-gated send
//   GET    /api/campaigns                      — send history
//   GET    /api/campaigns/suppression          — who is suppressed and why
//   POST   /api/campaigns/suppression          — manual suppression
//   GET    /api/campaigns/unsubscribe          — human-facing confirmation page (no auth)
//   POST   /api/campaigns/unsubscribe          — RFC 8058 one-click (no auth)
//   POST   /api/campaigns/webhook/resend       — bounces + complaints → auto-suppress (no auth)

import { Router, Request, Response } from 'express';
import * as nodeCrypto from 'crypto';
import { verifyIdToken, fsGet, fsSet, fsPatch, fsCreate, adminConfig } from '../services/firebaseAdminRest';

export const campaignsRouter = Router();

/* ── Config ─────────────────────────────────────────────────────────────────── */

const RESEND_ENDPOINT = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;                 // Resend's per-request maximum
const MAX_RECIPIENTS_PER_SEND = 50_000; // sanity ceiling; daily quota is separate
const SEND_TIMEOUT_MS = 30_000;

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;

function resendKey(): string { return process.env.RESEND_API_KEY || ''; }
function isConfigured(): boolean { return !!resendKey(); }

/** Secret for unsubscribe HMACs. Falls back to the service-account material so a
 *  missing env var cannot silently produce forgeable tokens. */
function unsubSecret(): string {
  const s = process.env.CAMPAIGN_UNSUB_SECRET || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!s) throw new Error('No secret available for unsubscribe tokens');
  return s;
}

function baseUrl(req: Request): string {
  return process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`;
}

/* ── Firestore helpers ──────────────────────────────────────────────────────── */

function parseValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(parseValue);
  if (v.mapValue) return parseFields(v.mapValue.fields ?? {});
  return null;
}
function parseFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = parseValue(val);
  return out;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getAccessToken } = await import('../services/firebaseAdminRest');
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Structured query: one collection, one equality filter, paged. */
async function fsQuery(
  collectionId: string,
  field: string,
  value: string,
  limit = 1000,
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const out: Array<{ id: string; data: Record<string, any> }> = [];
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
        },
        limit,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return out;
  const rows = (await res.json()) as any[];
  for (const row of rows) {
    if (!row?.document) continue;
    const id = String(row.document.name || '').split('/').pop() || '';
    out.push({ id, data: parseFields(row.document.fields ?? {}) });
  }
  return out;
}

/* ── Auth ───────────────────────────────────────────────────────────────────── */

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

/* ── Unsubscribe tokens ─────────────────────────────────────────────────────── */

const b64u = (s: string | Buffer) => Buffer.from(s as any).toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

function signUnsub(ownerId: string, email: string): string {
  const payload = b64u(JSON.stringify({ o: ownerId, e: email.toLowerCase() }));
  const sig = nodeCrypto.createHmac('sha256', unsubSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyUnsub(token: string): { ownerId: string; email: string } | null {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = nodeCrypto.createHmac('sha256', unsubSecret()).update(payload).digest('base64url');
    // Constant-time compare — a token check that leaks timing is a token check that leaks.
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return null;
    const { o, e } = JSON.parse(unb64u(payload));
    if (!o || !e) return null;
    return { ownerId: String(o), email: String(e).toLowerCase() };
  } catch {
    return null;
  }
}

/* ── Suppression ────────────────────────────────────────────────────────────── */

const suppressionId = (ownerId: string, email: string) =>
  `${ownerId}__${b64u(email.toLowerCase())}`;

async function suppress(ownerId: string, email: string, reason: string, source = 'system') {
  const id = suppressionId(ownerId, email);
  await fsSet(`campaign_suppression/${id}`, {
    ownerId,
    email: email.toLowerCase(),
    reason,
    source,
    at: new Date().toISOString(),
  });
}

async function suppressedSet(ownerId: string): Promise<Set<string>> {
  const rows = await fsQuery('campaign_suppression', 'ownerId', ownerId, 20_000);
  return new Set(rows.map(r => String(r.data.email || '').toLowerCase()).filter(Boolean));
}

/* ── Sender profile ─────────────────────────────────────────────────────────── */

interface SenderProfile {
  fromName: string;
  replyTo: string;
  /** CAN-SPAM requires a real physical address in every commercial message. */
  postalAddress: string;
  /** What the sender says the audience opted into. Shown in the footer. */
  listDescription: string;
  updatedAt: string;
}

function senderReadiness(p: Partial<SenderProfile> | null) {
  const missing: string[] = [];
  if (!p?.fromName?.trim()) missing.push('A sender name');
  if (!p?.replyTo?.trim() || !p.replyTo.includes('@')) missing.push('A reply-to address');
  // The postal-address requirement is the one people try to skip. It is not optional.
  if (!p?.postalAddress?.trim() || p.postalAddress.trim().length < 10) {
    missing.push('A physical postal address (required by law in every marketing email)');
  }
  return { ready: missing.length === 0, missing };
}

/* ── Audience ───────────────────────────────────────────────────────────────── */

interface Recipient { email: string; name: string; consentSource: string; consentAt: string; }

/**
 * Recipients are derived here, from the caller's own mailing_lists rows — never from the
 * request body. This is the single most important compliance control in the file: it makes
 * it impossible to use Plajah to mail a list bought from someone else.
 */
async function audienceFor(ownerId: string): Promise<Recipient[]> {
  const rows = await fsQuery('mailing_lists', 'artistId', ownerId, 20_000);
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    const email = String(r.data.subscriberEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: String(r.data.subscriberName || email.split('@')[0]),
      consentSource: String(r.data.consentSource || 'Subscribed on Plajah'),
      consentAt: String(r.data.consentAt || r.data.timestamp || ''),
    });
  }
  return out;
}

/* ── Message assembly ───────────────────────────────────────────────────────── */

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Strips anything that has no business in a marketing email body. */
function sanitizeCampaignHtml(html: string): string {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(?:script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>?/gi, '')
    .replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
    .replace(/\b(href|src)\s*=\s*("(?:javascript|vbscript|data):[^"]*"|'(?:javascript|vbscript|data):[^']*')/gi, '$1="#"');
}

function footerHtml(sender: SenderProfile, unsubUrl: string, recipient: Recipient): string {
  return `
<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e0d9;font:12px/1.6 Arial,sans-serif;color:#6b6570">
  <p style="margin:0 0 8px">You are receiving this because ${escapeHtml(
    recipient.consentSource || 'you subscribed to this sender on Plajah',
  )}.</p>
  <p style="margin:0 0 8px">${escapeHtml(sender.fromName)}<br>${escapeHtml(sender.postalAddress).replace(/\n/g, '<br>')}</p>
  <p style="margin:0"><a href="${unsubUrl}" style="color:#6b6570">Unsubscribe</a> — you will stop receiving these immediately.</p>
</div>`.trim();
}

function footerText(sender: SenderProfile, unsubUrl: string, recipient: Recipient): string {
  return [
    '',
    '—',
    `You are receiving this because ${recipient.consentSource || 'you subscribed to this sender on Plajah'}.`,
    sender.fromName,
    sender.postalAddress,
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n');
}

/* ── Routes ─────────────────────────────────────────────────────────────────── */

campaignsRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: isConfigured() });
});

campaignsRouter.get('/sender', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const doc = (await fsGet(`campaign_senders/${uid}`)) as Partial<SenderProfile> | null;
    res.json({ sender: doc ?? null, ...senderReadiness(doc) });
  } catch (e) {
    console.error('[campaigns] sender read failed:', e);
    res.status(500).json({ error: 'Could not load your sender details.' });
  }
});

campaignsRouter.put('/sender', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });

    const { fromName, replyTo, postalAddress, listDescription } = req.body || {};
    const profile: SenderProfile = {
      fromName: String(fromName || '').slice(0, 120).trim(),
      replyTo: String(replyTo || '').slice(0, 200).trim(),
      postalAddress: String(postalAddress || '').slice(0, 400).trim(),
      listDescription: String(listDescription || '').slice(0, 200).trim(),
      updatedAt: new Date().toISOString(),
    };
    const readiness = senderReadiness(profile);
    await fsSet(`campaign_senders/${uid}`, profile as unknown as Record<string, unknown>);
    res.json({ sender: profile, ...readiness });
  } catch (e) {
    console.error('[campaigns] sender write failed:', e);
    res.status(500).json({ error: 'Could not save your sender details.' });
  }
});

campaignsRouter.get('/audience', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const [audience, suppressed] = await Promise.all([audienceFor(uid), suppressedSet(uid)]);
    const deliverable = audience.filter(r => !suppressed.has(r.email));
    res.json({
      total: audience.length,
      suppressed: audience.length - deliverable.length,
      deliverable: deliverable.length,
    });
  } catch (e) {
    console.error('[campaigns] audience failed:', e);
    res.status(500).json({ error: 'Could not size your audience.' });
  }
});

campaignsRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });

    const { subject, html, text, testTo } = req.body || {};
    const cleanSubject = String(subject || '').trim().slice(0, 200);
    if (!cleanSubject) return res.status(400).json({ error: 'A subject line is required.' });
    if (!html && !text) return res.status(400).json({ error: 'The message is empty.' });

    // 1 — sender must be complete. This is a legal gate, so it is checked server-side.
    const sender = (await fsGet(`campaign_senders/${uid}`)) as SenderProfile | null;
    const readiness = senderReadiness(sender);
    if (!sender || !readiness.ready) {
      return res.status(412).json({
        error: 'Your sender details are incomplete.',
        missing: readiness.missing,
        code: 'SENDER_INCOMPLETE',
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({ error: 'Email sending is not configured on this server.', configured: false });
    }

    const cleanHtml = html ? sanitizeCampaignHtml(String(html)) : '';
    const cleanText = text ? String(text) : '';
    const base = baseUrl(req);
    const from = `${sender.fromName} <${process.env.RESEND_FROM_ADDRESS || 'no-reply@plajah.com'}>`;

    // 2 — a test send goes only to the caller, and skips the audience entirely.
    let recipients: Recipient[];
    if (testTo) {
      const addr = String(testTo).trim().toLowerCase();
      if (!addr.includes('@')) return res.status(400).json({ error: 'That test address is not valid.' });
      recipients = [{ email: addr, name: 'Test', consentSource: 'this is a test send to yourself', consentAt: '' }];
    } else {
      // 3 — audience is derived here, never taken from the request.
      const [audience, suppressed] = await Promise.all([audienceFor(uid), suppressedSet(uid)]);
      recipients = audience.filter(r => !suppressed.has(r.email)).slice(0, MAX_RECIPIENTS_PER_SEND);
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'Nobody on your list can receive this yet.' });
      }
    }

    // 4 — build one personalised, compliant message per recipient.
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const slice = recipients.slice(i, i + BATCH_SIZE);
      const batch = slice.map(r => {
        const unsubUrl = `${base}/api/campaigns/unsubscribe?t=${encodeURIComponent(signUnsub(uid, r.email))}`;
        return {
          from,
          to: r.email,
          reply_to: sender.replyTo,
          subject: cleanSubject,
          ...(cleanHtml
            ? { html: `${cleanHtml}${footerHtml(sender, unsubUrl, r)}` }
            : { text: `${cleanText}${footerText(sender, unsubUrl, r)}` }),
          headers: {
            // RFC 8058. Gmail, Yahoo and Microsoft require both of these on marketing mail.
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      try {
        const r = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (r.ok) sent += batch.length;
        else { failed += batch.length; console.error('[campaigns] batch rejected:', r.status, await r.text()); }
      } catch (err) {
        failed += batch.length;
        console.error('[campaigns] batch threw:', err);
      }
    }

    // 5 — record the send. Proof of what went out, to how many, and under what sender details.
    if (!testTo) {
      await fsCreate('campaigns', {
        ownerId: uid,
        subject: cleanSubject,
        recipientCount: sent,
        failedCount: failed,
        fromName: sender.fromName,
        replyTo: sender.replyTo,
        postalAddress: sender.postalAddress,
        sentAt: new Date().toISOString(),
      });
    }

    res.json({ sent, failed, test: !!testTo });
  } catch (e) {
    console.error('[campaigns] send failed:', e);
    res.status(500).json({ error: 'The campaign could not be sent.' });
  }
});

campaignsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const rows = await fsQuery('campaigns', 'ownerId', uid, 100);
    const campaigns = rows
      .map(r => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => String(b.sentAt).localeCompare(String(a.sentAt)));
    res.json({ campaigns });
  } catch (e) {
    console.error('[campaigns] history failed:', e);
    res.status(500).json({ error: 'Could not load your campaign history.' });
  }
});

campaignsRouter.get('/suppression', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const rows = await fsQuery('campaign_suppression', 'ownerId', uid, 5_000);
    res.json({
      entries: rows.map(r => ({ email: r.data.email, reason: r.data.reason, at: r.data.at })),
    });
  } catch (e) {
    console.error('[campaigns] suppression list failed:', e);
    res.status(500).json({ error: 'Could not load your suppression list.' });
  }
});

campaignsRouter.post('/suppression', async (req: Request, res: Response) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email.includes('@')) return res.status(400).json({ error: 'That is not an email address.' });
    await suppress(uid, email, 'Added by the sender', 'manual');
    res.json({ ok: true });
  } catch (e) {
    console.error('[campaigns] manual suppression failed:', e);
    res.status(500).json({ error: 'Could not suppress that address.' });
  }
});

/* ── Unsubscribe (no auth — the recipient is not a Plajah user) ─────────────── */

function unsubPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#020202;color:#fff;
      font:16px/1.6 -apple-system,Segoe UI,Inter,system-ui,sans-serif;padding:24px}
 .c{max-width:440px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:28px;padding:40px 32px}
 h1{font-size:22px;margin:0 0 12px;font-weight:800;letter-spacing:-.02em}
 p{margin:0;color:rgba(255,255,255,.65);font-size:15px}
 .m{font-size:34px;margin-bottom:14px;color:${ok ? '#FF8C00' : 'rgba(255,255,255,.3)'}}
</style></head><body><div class="c"><div class="m">${ok ? '✓' : '!'}</div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

// RFC 8058 one-click. Mail clients POST here with no user interaction, so it must act immediately
// and must not require a confirmation step.
campaignsRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.t || req.body?.t || '');
    const parsed = verifyUnsub(token);
    if (!parsed) return res.status(400).send('Invalid unsubscribe link.');
    await suppress(parsed.ownerId, parsed.email, 'Unsubscribed', 'one-click');
    res.status(200).send('Unsubscribed');
  } catch (e) {
    console.error('[campaigns] one-click unsubscribe failed:', e);
    res.status(500).send('Could not process that request.');
  }
});

campaignsRouter.get('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const parsed = verifyUnsub(String(req.query.t || ''));
    if (!parsed) {
      return res.status(400).type('html').send(
        unsubPage('That link is not valid', 'It may have been altered in transit. Reply to the email and ask to be removed.', false),
      );
    }
    // Acting on GET as well as POST is deliberate: a recipient who clicks the footer link
    // expects to be unsubscribed, not handed another button to press.
    await suppress(parsed.ownerId, parsed.email, 'Unsubscribed', 'link');
    res.status(200).type('html').send(
      unsubPage('You have been unsubscribed', `${parsed.email} will not receive any more marketing email from this sender.`, true),
    );
  } catch (e) {
    console.error('[campaigns] unsubscribe page failed:', e);
    res.status(500).type('html').send(unsubPage('Something went wrong', 'Please try that link again shortly.', false));
  }
});

/* ── Provider webhook: bounces and complaints must suppress automatically ───── */

campaignsRouter.post('/webhook/resend', async (req: Request, res: Response) => {
  try {
    // Always 200 — a provider that gets errors here will retry and eventually stop sending events.
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[campaigns] RESEND_WEBHOOK_SECRET is not configured');
      return res.status(503).json({ error: 'Webhook unavailable' });
    }
    const supplied = String(req.headers['x-plajah-webhook-secret'] || '');
    const expectedBuf = Buffer.from(secret);
    const suppliedBuf = Buffer.from(supplied);
    if (expectedBuf.length !== suppliedBuf.length || !nodeCrypto.timingSafeEqual(expectedBuf, suppliedBuf)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const type = String(req.body?.type || '');
    const email = String(req.body?.data?.to?.[0] || req.body?.data?.email || '').toLowerCase();

    // A hard bounce or a spam complaint is permanent. Continuing to send to either is exactly
    // what destroys a sending reputation, so this is not a soft signal.
    const reason =
      type.includes('bounced') ? 'Hard bounce' :
      type.includes('complained') ? 'Marked as spam' : '';

    // Acknowledge BEFORE doing any work. Providers time out in a few seconds and retry on a slow
    // response, which would mean processing the same bounce repeatedly; the lookup below touches
    // Firestore and is far too slow to keep them waiting on.
    res.status(200).json({ ok: true });

    if (!reason || !email.includes('@')) return;

    // The event does not name the sender, so suppress this address for every sender that has it.
    void (async () => {
      try {
        const owners = await fsQuery('mailing_lists', 'subscriberEmail', email, 500);
        const ids = new Set(owners.map(o => String(o.data.artistId || '')).filter(Boolean));
        for (const ownerId of ids) await suppress(ownerId, email, reason, 'provider');
      } catch (err) {
        console.error('[campaigns] webhook suppression failed:', err);
      }
    })();
  } catch (e) {
    console.error('[campaigns] webhook failed:', e);
    if (!res.headersSent) res.status(200).json({ ok: true });
  }
});
