/**
 * Terra data notice acceptance — recorded per account and per notice version
 * (services/terra/dataNotice.ts), the same shape as the Build terms route.
 *   GET  /api/terra/notice → { version, accepted }
 *   POST /api/terra/notice { version } → records { version, at, userAgent }
 */
import express, { type Request, type Response } from 'express';
import { verifyIdToken, fsGet, fsSet } from '../services/firebaseAdminRest';
import { TERRA_NOTICE_VERSION } from '../services/terra/dataNotice';

async function uidOf(req: Request): Promise<string | null> {
  const a = req.headers.authorization;
  return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null;
}

export const terraNoticeRouter = express.Router();

terraNoticeRouter.get('/', async (req: Request, res: Response) => {
  const uid = await uidOf(req);
  if (!uid) { res.json({ version: TERRA_NOTICE_VERSION, accepted: null }); return; }
  const d = await fsGet(`terraNoticeAcceptance/${uid}`);
  res.json({ version: TERRA_NOTICE_VERSION, accepted: d?.version === TERRA_NOTICE_VERSION ? d : null });
});

terraNoticeRouter.post('/', async (req: Request, res: Response) => {
  const uid = await uidOf(req);
  if (!uid) { res.status(401).json({ error: 'Sign in to record acceptance' }); return; }
  if (req.body?.version !== TERRA_NOTICE_VERSION) {
    res.status(409).json({ error: 'The notice changed; reload and read the current version', version: TERRA_NOTICE_VERSION });
    return;
  }
  const row = { version: TERRA_NOTICE_VERSION, at: Date.now(), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200) };
  await fsSet(`terraNoticeAcceptance/${uid}`, row);
  res.json({ ok: true, accepted: row });
});
