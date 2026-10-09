/**
 * Trust & Safety — server-side media scanning, CSAM case metadata, admin soft-remove, cron sweep.
 *
 * Mounted in server.ts as `app.use('/api', createTrustSafetyRouter())` (paths below are relative to /api).
 * Firestore/Storage access is the service account, which BYPASSES rules — every route authorises itself.
 *
 *   POST /api/safety/scan            Bearer ID token. Body {targetCollection,targetId} (scan a doc you own)
 *                                    or {storagePath|url, surface} (a file under your own uid). Rate limited.
 *   POST /api/safety/report-escalate Bearer ID token. Body {reportId} — the caller's own sexual_minor_safety report.
 *   GET  /api/safety/cases           platform admin. CSAM case METADATA only (never media, URLs or paths).
 *   GET  /api/safety/review-queue    platform admin. Open moderation items (metadata; csam-queue items redacted).
 *   GET  /api/safety/status          platform admin. Which providers are configured.
 *   POST /api/safety/admin/remove    platform admin. Soft-remove {contentType, contentId, parentId?, reason?}.
 *   POST /api/cron/safety-sweep      header x-cron-key == ADMIN_SEED_KEY | CRON_SECRET. ?hours=24&budget=40
 *
 * Policy lives in services/safety/safetyPolicy.ts (pure, tested). See docs/CONTENT_SAFETY_PIPELINE.md.
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import { verifyIdTokenDetailed, adminConfig, fsGet } from '../services/firebaseAdminRest';
import { isVerifiedAdmin } from '../services/platformAdmin';
import { SAFETY_SURFACES, type SafetySurface } from '../services/safety/safetyPolicy';
import { caseMetadataView, type CsamCase } from '../services/safety/csamCaseCore';
import { providerStatus, ffmpegAvailable } from '../services/safety/mediaSafetyServer';
import { scanTarget, scanLooseMedia, escalateReport, softRemove, runSweep, TARGETS } from '../services/safety/safetyPipeline';
import { fsQuery, storagePathFromUrl } from '../services/safety/safetyServerIo';

const json = express.json({ limit: '16kb' });

// ── Auth ──────────────────────────────────────────────────────────────────────

interface Caller { uid: string; email: string | null; emailVerified: boolean }

async function caller(req: Request, res: Response): Promise<Caller | null> {
  if (!adminConfig.hasCredentials()) { res.status(503).json({ error: 'Server not configured.' }); return null; }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Sign in required.' }); return null; }
  const raw = auth.slice(7);
  const t = await verifyIdTokenDetailed(raw);
  if (!t) { res.status(401).json({ error: 'Invalid token.' }); return null; }
  if (t.isAnonymous) { res.status(403).json({ error: 'A registered account is required.' }); return null; }
  // The token was just verified, so its payload claims are trustworthy.
  let email: string | null = null, emailVerified = false;
  try {
    const p = JSON.parse(Buffer.from(raw.split('.')[1], 'base64url').toString('utf8'));
    if (p.sub === t.uid) { email = typeof p.email === 'string' ? p.email : null; emailVerified = p.email_verified === true; }
  } catch { /* no email claims */ }
  return { uid: t.uid, email, emailVerified };
}

async function isAdmin(c: Caller): Promise<boolean> {
  try {
    return isVerifiedAdmin({
      email: c.email || undefined, emailVerified: c.emailVerified,
      isAdminDoc: !!(await fsGet(`admins/${c.uid}`)),
      extraAdminEmails: process.env.PLATFORM_ADMIN_EMAILS || process.env.ARIA_VOICE_ADMIN_EMAILS,
    });
  } catch { return false; }
}

async function adminCaller(req: Request, res: Response): Promise<Caller | null> {
  const c = await caller(req, res);
  if (!c) return null;
  if (!(await isAdmin(c))) { res.status(403).json({ error: 'Platform admin access required' }); return null; }
  return c;
}

function secretsEqual(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== 'string' || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}

function clientIp(req: Request): string | null {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || null;
}

// Per-uid scan budget (each scan costs provider calls). In-memory per instance — a courtesy limit.
const scanRate = new Map<string, { start: number; n: number }>();
const SCAN_PER_HOUR = 60;
function allowScan(uid: string): boolean {
  const now = Date.now();
  const e = scanRate.get(uid);
  if (!e || now - e.start > 3_600_000) { scanRate.set(uid, { start: now, n: 1 }); return true; }
  if (e.n >= SCAN_PER_HOUR) return false;
  e.n++;
  return true;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createTrustSafetyRouter(): Router {
  const r = Router();

  r.post('/safety/scan', json, async (req: Request, res: Response) => {
    const c = await caller(req, res);
    if (!c) return;
    if (!allowScan(c.uid)) return res.status(429).json({ error: 'Too many scan requests.' });
    const b = (req.body || {}) as Record<string, unknown>;
    try {
      if (typeof b.targetCollection === 'string' && typeof b.targetId === 'string') {
        const spec = TARGETS[b.targetCollection];
        if (!spec) return res.status(400).json({ error: 'Unsupported targetCollection.' });
        const doc = await fsGet(`${b.targetCollection}/${b.targetId}`);
        if (!doc) return res.status(404).json({ error: 'Not found.' });
        const owner = spec.owner(doc, b.targetId);
        if (owner !== c.uid && !(await isAdmin(c))) return res.status(403).json({ error: 'Not your content.' });
        const out = await scanTarget(b.targetCollection, b.targetId, { uploaderIp: owner === c.uid ? clientIp(req) : null, trigger: 'client' });
        return res.status(out.ok ? 200 : 400).json(out);
      }
      const surface = (typeof b.surface === 'string' && (SAFETY_SURFACES as readonly string[]).includes(b.surface) ? b.surface : 'post') as SafetySurface;
      const sp = typeof b.storagePath === 'string' ? b.storagePath : typeof b.url === 'string' ? storagePathFromUrl(b.url) : null;
      if (!sp) return res.status(400).json({ error: 'storagePath (or a Plajah storage url) required.' });
      // Loose files: only ones under the caller's own uid segment (posts/{uid}/…, users/{uid}/…, fabula/{uid}/…).
      if (!sp.split('/').includes(c.uid) && !(await isAdmin(c))) return res.status(403).json({ error: 'Not your file.' });
      const kind = /\.(mp4|mov|webm|m4v|mkv)$/i.test(sp) ? 'video' : 'image';
      const out = await scanLooseMedia({ kind, storagePath: sp }, surface, c.uid, clientIp(req));
      return res.json(out);
    } catch (e: any) {
      console.error('[safety/scan]', e?.message || e);
      // Fail safe: the client treats this as "unscanned"; the sweep retries.
      return res.status(500).json({ ok: false, error: 'scan_failed' });
    }
  });

  r.post('/safety/report-escalate', json, async (req: Request, res: Response) => {
    const c = await caller(req, res);
    if (!c) return;
    const reportId = typeof req.body?.reportId === 'string' ? req.body.reportId : '';
    if (!/^[A-Za-z0-9_\-]{1,200}$/.test(reportId)) return res.status(400).json({ error: 'reportId required.' });
    const rep = await fsGet(`content_reports/${reportId}`);
    if (!rep) return res.status(404).json({ error: 'Not found.' });
    if (rep.reporterId !== c.uid && !(await isAdmin(c))) return res.status(403).json({ error: 'Not your report.' });
    const out = await escalateReport(reportId);
    // Do not tell the reporter whether the content was hidden (avoids probing the classifier).
    return res.status(out.ok ? 200 : 400).json({ ok: out.ok });
  });

  r.get('/safety/cases', async (req: Request, res: Response) => {
    if (!(await adminCaller(req, res))) return;
    const rows = await fsQuery('csam_cases', { orderBy: { field: 'detectedAt', direction: 'DESCENDING' }, limit: 100 });
    res.set('Cache-Control', 'no-store');
    res.json({ cases: rows.map(x => caseMetadataView(x.data as CsamCase)) });
  });

  r.get('/safety/review-queue', async (req: Request, res: Response) => {
    if (!(await adminCaller(req, res))) return;
    const rows = await fsQuery('moderation', { where: [{ field: 'reviewStatus', op: 'EQUAL', value: 'open' }], limit: 200 });
    res.set('Cache-Control', 'no-store');
    res.json({
      items: rows.map(x => {
        const d = x.data;
        const csam = d.reviewQueue === 'csam';
        return {
          id: x.id, targetCollection: d.targetCollection, targetId: d.targetId, surface: d.surface, ownerUid: d.ownerUid,
          action: d.action, display: d.display, reviewQueue: d.reviewQueue, labels: d.labels || [], scannedAt: d.scannedAt,
          // csam-queue items: no reason text, no per-media signals — trained reviewers work from the case system.
          reason: csam ? null : d.reason, media: csam ? null : (d.media || []).map((m: any) => ({ kind: m.kind, action: m.action, gemini: m.gemini, openai: m.openai, providerErrors: m.providerErrors })),
        };
      }),
    });
  });

  r.get('/safety/status', async (req: Request, res: Response) => {
    if (!(await adminCaller(req, res))) return;
    res.json({
      providers: providerStatus(),
      ffmpeg: await ffmpegAvailable(),
      ncmec: {
        credentials: !!(process.env.NCMEC_CYBERTIP_USER && process.env.NCMEC_CYBERTIP_PASS),
        submitEnabled: process.env.NCMEC_SUBMIT_ENABLED === 'true',
        env: process.env.NCMEC_ENV === 'prod' ? 'prod' : 'test',
      },
      mux: !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET),
    });
  });

  r.post('/safety/admin/remove', json, async (req: Request, res: Response) => {
    const c = await adminCaller(req, res);
    if (!c) return;
    const b = req.body || {};
    if (typeof b.contentType !== 'string' || typeof b.contentId !== 'string' || !/^[A-Za-z0-9_\-]{1,200}$/.test(b.contentId)) {
      return res.status(400).json({ error: 'contentType + contentId required.' });
    }
    if (b.parentId !== undefined && (typeof b.parentId !== 'string' || !/^[A-Za-z0-9_\-]{1,200}$/.test(b.parentId))) {
      return res.status(400).json({ error: 'Bad parentId.' });
    }
    const out = await softRemove({ contentType: b.contentType, contentId: b.contentId, parentId: b.parentId, removedBy: c.uid, reason: typeof b.reason === 'string' ? b.reason : undefined });
    res.json(out);
  });

  r.post('/cron/safety-sweep', json, async (req: Request, res: Response) => {
    const key = req.headers['x-cron-key'];
    if (!secretsEqual(key, process.env.ADMIN_SEED_KEY) && !secretsEqual(key, process.env.CRON_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!adminConfig.hasCredentials()) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 14);
    const budget = Math.min(Math.max(Number(req.query.budget) || 40, 1), 300);
    try {
      const summary = await runSweep({ hours, budget, deadline: Date.now() + 240_000 });
      res.json({ hours, budget, providers: providerStatus(), ...summary });
    } catch (e: any) {
      console.error('[cron/safety-sweep]', e?.message || e);
      res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });

  return r;
}
