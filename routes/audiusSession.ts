// audiusSession — the caller's "Log in with Audius" connection, kept on their Plajah account so it follows them to
// every place they sign in (web, the Windows app, the Android app) instead of living in one device's localStorage.
// Mounted in server.ts at /api/audius/session.
//
// Bluesky / Mastodon / Threads already work this way (users/{uid}/fediverseAccounts, server-encrypted). Audius
// tokens come from a browser-side PKCE flow, so the client hands the finished session here and reads it back on a
// new device. Stored AES-256-GCM encrypted (same vault key as the fediverse credentials) at users/{uid}/private/audius;
// only the service account writes it.

import { Router, type Request, type Response } from 'express';
import { verifyIdToken, fsGetStrict, fsSet } from '../services/firebaseAdminRest';
import { encryptCreds, decryptCreds } from '../services/fediverse/auth';

export const audiusSessionRouter = Router();

const docPath = (uid: string) => `users/${uid}/private/audius`;

async function callerUid(req: Request): Promise<string | null> {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? verifyIdToken(h.slice(7)) : null;
}

const s = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Keep only the fields an AudiusSession has, bounded — never store whatever the client sent. */
export function cleanAudiusSession(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const userId = s(raw.userId, 64);
  const accessToken = s(raw.accessToken, 4096);
  if (!userId || !accessToken) return null;
  return {
    userId,
    handle: s(raw.handle, 120) ?? '',
    name: s(raw.name, 200) ?? '',
    profilePicture: s(raw.profilePicture, 2048),
    verified: raw.verified === true,
    scope: raw.scope === 'write' ? 'write' : 'read',
    accessToken,
    refreshToken: s(raw.refreshToken, 4096),
    accessExpiresAt: n(raw.accessExpiresAt),
    refreshExpiresAt: n(raw.refreshExpiresAt),
    connectedAt: n(raw.connectedAt) ?? Date.now(),
  };
}

audiusSessionRouter.get('/', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first' });
  try {
    const row = await fsGetStrict(docPath(uid));
    if (!row?.enc) return res.json({ session: null, disconnectedAt: Number(row?.disconnectedAt || 0) || undefined });
    const session = cleanAudiusSession(JSON.parse(String((decryptCreds(String(row.enc)) as any).v)));
    res.set('Cache-Control', 'no-store');
    return res.json({ session, updatedAt: Number(row.at || 0) });
  } catch (err) {
    // Never answer "no connection" for a failed read — the client would upload over a disconnect.
    console.error('[audius-session] read failed:', err);
    return res.status(502).json({ error: 'Could not read the Audius connection' });
  }
});

audiusSessionRouter.put('/', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first' });
  const session = cleanAudiusSession(req.body?.session);
  if (!session) return res.status(400).json({ error: 'Not an Audius session' });
  const ok = await fsSet(docPath(uid), { enc: encryptCreds({ v: JSON.stringify(session) } as any), at: Date.now() });
  return ok ? res.json({ ok: true }) : res.status(502).json({ error: 'Could not save the Audius connection' });
});

audiusSessionRouter.delete('/', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first' });
  // A marker, not a delete: another device still holding an old copy must not upload it back.
  await fsSet(docPath(uid), { disconnectedAt: Date.now(), at: Date.now() });
  return res.json({ ok: true });
});
