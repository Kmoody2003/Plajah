// antiAbuse router — small, unauthenticated anti-bot endpoints.
// Mounted in server.ts as: app.use('/api', antiAbuseRouter)
//
//   POST /api/auth/signup-check  { email }  → { ok: true } | { ok: false, code, message }
//        Runs BEFORE createUserWithEmailAndPassword in the registration UI. Rejects malformed
//        and disposable-domain addresses. Never reveals whether an account exists. Strict
//        per-IP limits (per-instance + shared across instances). This is a UX speed bump: a
//        bot can call Firebase Auth directly, so REAL enforcement is the Identity Platform
//        beforeCreate blocking function in docs/ANTI_BOT_PLAYBOOK.md.
//
//   POST /api/security/csp-report  → 204. Collects Content-Security-Policy-Report-Only
//        violations (firebase.json) into security_events rollups. Sampled + capped.

import express, { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { checkSignupEmail } from '../services/signupGuard';
import { sharedRateLimit, clientIpKey } from '../services/sharedRateLimit';
import { recordSecurityEvent } from '../services/securityEvents';

export const antiAbuseRouter = Router();

const signupLocalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req: any) => clientIpKey(req),
  handler: (req: any, res: any) => {
    recordSecurityEvent('signup_check_rate_limited', { route: '/api/auth/signup-check', ip: req.ip });
    res.status(429).json({ error: 'Too many sign-up attempts from this network. Please wait a few minutes.' });
  },
});
const signupSharedLimiter = sharedRateLimit({
  name: 'signup_check', limit: 40, windowMs: 60 * 60 * 1000,
  key: (req: any) => `ip:${clientIpKey(req)}`,
  message: 'Too many sign-up attempts from this network. Please try again later.',
});

antiAbuseRouter.post('/auth/signup-check', signupLocalLimiter, signupSharedLimiter, express.json({ limit: '2kb' }), (req: Request, res: Response) => {
  const verdict = checkSignupEmail((req.body as any)?.email);
  if (!verdict.ok) {
    if ((verdict as { code?: string }).code === 'EMAIL_NOT_ACCEPTED') recordSecurityEvent('signup_check_disposable', { route: '/api/auth/signup-check', ip: req.ip });
    return res.status(200).json(verdict);
  }
  recordSecurityEvent('signup_check_ok', { route: '/api/auth/signup-check' });
  res.json({ ok: true });
});

const cspJson = express.json({ limit: '16kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] });
const cspLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: false, legacyHeaders: false, keyGenerator: (req: any) => clientIpKey(req), handler: (_req: any, res: any) => res.status(204).end() });

antiAbuseRouter.post('/security/csp-report', cspLimiter, cspJson, (req: Request, res: Response) => {
  try {
    const body: any = req.body;
    const reports: any[] = Array.isArray(body) ? body.slice(0, 5).map(r => r?.body || r) : [body?.['csp-report'] || body];
    for (const r of reports) {
      if (!r) continue;
      const directive = String(r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || '').slice(0, 60);
      let blocked = String(r['blocked-uri'] || r.blockedURL || '').slice(0, 200);
      try { if (/^https?:/.test(blocked)) blocked = new URL(blocked).origin; } catch { /* keep raw */ }
      const page = String(r['document-uri'] || r.documentURL || '');
      let route = '';
      try { route = page ? new URL(page).pathname : ''; } catch { route = ''; }
      recordSecurityEvent('csp_report', { route: route || '/unknown', detail: `${directive} ${blocked}` });
    }
  } catch { /* ignore malformed reports */ }
  res.status(204).end();
});
