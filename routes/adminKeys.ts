// Admin → API key rotation: a countdown for keys that expire on a schedule (see services/keyRotation.ts).
//
// GET  /api/admin/key-rotation               every tracked key with its countdown (never the key itself)
// POST /api/admin/key-rotation/:id/rotated   { rotatedAt?: ISO date }   record that the key was just rotated
//
// Platform admins only. State lives in the server-only collection `adminKeyRotations/{id}`; the only
// things stored are dates and the admin's uid.
import express from 'express';
import { fsGet, fsPatch, fsSet } from '../services/firebaseAdminRest';
import { KEY_BY_ID, TRACKED_KEYS, keyStatus, parseRotationDate, worstState } from '../services/keyRotation';

export interface AdminKeysDeps {
  /** Verifies the caller's token and sets req.uid (server.ts authMiddleware). */
  authMiddleware: express.RequestHandler;
  /** Platform-admin gate; must run after authMiddleware (server.ts requireVerifiedAdmin). */
  requireAdmin: express.RequestHandler;
  limiter?: express.RequestHandler;
  get?: (path: string) => Promise<Record<string, any> | null>;
  set?: (path: string, data: Record<string, unknown>) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

const HISTORY = 6;

export function createAdminKeysRouter(deps: AdminKeysDeps) {
  const router = express.Router();
  const get = deps.get ?? fsGet;
  const set = deps.set ?? fsSet;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => Date.now());
  const gate = [deps.limiter ?? ((_q, _r, n) => n()), deps.authMiddleware, deps.requireAdmin];

  router.get('/', ...gate, async (_req, res) => {
    const t = now();
    const keys = await Promise.all(TRACKED_KEYS.map(async k => {
      const doc = (await get(`adminKeyRotations/${k.id}`)) || {};
      const rotatedAt = typeof doc.rotatedAt === 'number' ? doc.rotatedAt : undefined;
      return {
        id: k.id, label: k.label, powers: k.powers, intervalDays: k.intervalDays, envVar: k.envVar, rotateUrl: k.rotateUrl, steps: k.steps,
        // Whether the server has a value at all: a boolean, never the value.
        configured: !!env[k.envVar],
        rotatedAt, rotatedBy: typeof doc.rotatedBy === 'string' ? doc.rotatedBy : undefined,
        lastFailureAt: typeof doc.lastFailureAt === 'number' ? doc.lastFailureAt : undefined,
        history: Array.isArray(doc.history) ? doc.history.filter((x: unknown) => typeof x === 'number').slice(0, HISTORY) : [],
        status: keyStatus(rotatedAt, k.intervalDays, t),
      };
    }));
    res.set('Cache-Control', 'no-store').json({ keys, worst: worstState(keys.map(k => k.status.state)), now: t });
  });

  router.post('/:id/rotated', ...gate, express.json({ limit: '2kb' }), async (req: any, res) => {
    const k = KEY_BY_ID[String(req.params.id)];
    if (!k) return res.status(404).json({ error: 'Unknown key.' });
    const t = now();
    const when = parseRotationDate(req.body?.rotatedAt, t);
    if (when === null) return res.status(400).json({ error: 'Use a date that is not in the future and within the last year.' });
    const prev = (await get(`adminKeyRotations/${k.id}`)) || {};
    const history = [typeof prev.rotatedAt === 'number' ? prev.rotatedAt : null, ...(Array.isArray(prev.history) ? prev.history : [])]
      .filter((x): x is number => typeof x === 'number').slice(0, HISTORY);
    // A key that was rotated clears the "provider rejected it" flag: the new one has not failed yet.
    const ok = await set(`adminKeyRotations/${k.id}`, { rotatedAt: when, rotatedBy: String(req.uid || ''), history, updatedAt: t });
    if (!ok) return res.status(500).json({ error: 'Could not save. Try again.' });
    res.json({ id: k.id, rotatedAt: when, status: keyStatus(when, k.intervalDays, t) });
  });

  return router;
}

/** Called by feature code when a provider rejects a key, so the dashboard can say "this may already have lapsed". */
export function recordKeyFailure(id: string, at = Date.now()): void {
  if (!KEY_BY_ID[id]) return;
  void fsPatch(`adminKeyRotations/${id}`, { lastFailureAt: at }).catch(() => undefined);
}
