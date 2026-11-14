// Recorded acceptance of the Creator Agreement (services/legal/creatorAgreement.ts).
// Mounted in server.ts:  app.use('/api/legal', createLegalAcceptanceRouter({ authMiddleware }))
//
// A checkbox in the browser proves nothing later; this stores who agreed to which version, for
// which release, when, and which exact files (sha-256) the declaration covered. It also appends a
// RIGHTS_DECLARED entry to the work's licence ledger (routes/ledger.ts), so the declaration sits in
// the same tamper-evident chain as the work's sales.
//
//   agreementAcceptances/{uid}_{version}_{contentId}   server-only
//   agreementAcceptancesPrivate/{same id}              network address + user agent (disputes only)
//
//   termsAcceptances/{uid}                             server-only; latest Terms version accepted + history
//
// Endpoints
//   POST /api/legal/creator-agreement  { version, contentId, contentKind, fileSha256: string[] }
//   GET  /api/legal/terms              { current, accepted }
//   POST /api/legal/terms              { version }   record that the signed-in user agreed to the Terms

import { Router } from 'express';
import { fsCreateOnce, fsGet, fsMerge } from '../services/safety/safetyServerIo';
import { appendLedger } from './ledger';
import { CREATOR_AGREEMENT_VERSION } from '../services/legal/creatorAgreement';
import { TERMS_VERSION } from '../services/legal/terms';

export function createLegalAcceptanceRouter(deps: { authMiddleware: any }): Router {
  const r = Router();

  r.post('/creator-agreement', deps.authMiddleware, async (req: any, res) => {
    const version = String(req.body?.version || '');
    if (version !== CREATOR_AGREEMENT_VERSION) return res.status(409).json({ error: 'The agreement changed — reload and review it again', current: CREATOR_AGREEMENT_VERSION });
    const contentId = String(req.body?.contentId || '');
    if (!/^[\w-]{3,128}$/.test(contentId)) return res.status(400).json({ error: 'Bad content id' });
    const contentKind = String(req.body?.contentKind || 'album').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 24) || 'album';
    const fileSha256 = (Array.isArray(req.body?.fileSha256) ? req.body.fileSha256 : [])
      .filter((s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)).slice(0, 200);
    const at = Date.now();
    const id = `${req.uid}_${version}_${contentId}`;
    const r1 = await fsCreateOnce('agreementAcceptances', id, { uid: req.uid, version, contentId, contentKind, fileSha256, at });
    if (r1 === 'error') return res.status(503).json({ error: 'Could not record the agreement — try again' });
    if (r1 === 'created') {
      void fsCreateOnce('agreementAcceptancesPrivate', id, { ip: String(req.ip || req.socket?.remoteAddress || ''), ua: String(req.headers?.['user-agent'] || '').slice(0, 240), at });
      void appendLedger({ event: 'RIGHTS_DECLARED', workKind: contentKind, workId: contentId, at, actorUid: req.uid, versionId: version, ...(fileSha256.length ? { fileHashes: fileSha256 } : {}) });
    }
    res.json({ recorded: true, version, at });
  });

  r.get('/terms', deps.authMiddleware, async (req: any, res) => {
    const d = await fsGet(`termsAcceptances/${req.uid}`);
    res.json({ current: TERMS_VERSION, accepted: d?.version ?? null });
  });

  r.post('/terms', deps.authMiddleware, async (req: any, res) => {
    const version = String(req.body?.version || '');
    if (version !== TERMS_VERSION) return res.status(409).json({ error: 'The Terms changed — reload and review them again', current: TERMS_VERSION });
    const at = Date.now();
    const prev = await fsGet(`termsAcceptances/${req.uid}`);
    const history = [...(Array.isArray(prev?.history) ? prev!.history : []), { version, at }].slice(-20);
    const ok = await fsMerge(`termsAcceptances/${req.uid}`, {
      version, at, history,
      ip: String(req.ip || req.socket?.remoteAddress || ''), ua: String(req.headers?.['user-agent'] || '').slice(0, 240),
    });
    if (!ok) return res.status(503).json({ error: 'Could not record — try again' });
    res.json({ recorded: true, version, at });
  });

  return r;
}
