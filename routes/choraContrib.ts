// Chora contribution ledger — server I/O and routes. Pure hashing: services/chora/contrib/chain.ts.
// Mounted in server.ts:  app.use('/api/chora/contrib', createChoraContribRouter({ ... }))
//
// Storage (plajah-prod, all server-only in firestore.rules):
//   choraContrib/{projectId}_{seq}         the chain — who did what, server-stamped uid/name/time
//   choraContribHeads/{projectId}          seq + head hash (a cache of the chain tip)
//   choraContribProjects/{projectId}       { ownerUid } — claimed by the first writer of a solo project
//   choraContribPrivate/{projectId}_{seq}  network address + user agent, for disputes only (never served)
//
// Who may write/read a project's ledger: its co-edit members (coedit/{projectId} in plajah-ops,
// editor or owner to write, any member to read), or — for a project that was never shared — the
// account that claimed it. The client never supplies uid, name, time or sequence.
//
// Endpoints
//   POST /api/chora/contrib/:pid/events   { events: ContribEvent[] }      append (max 50)
//   POST /api/chora/contrib/:pid/seal     { sha256: string[], label }      fix a version (proof of authorship)
//   GET  /api/chora/contrib/:pid                                            chain + verification
//   GET  /api/chora/contrib/mine                                            projects I have entries in

import { Router } from 'express';
import { fsGet, fsSet, fsQuery } from '../services/firebaseAdminRest';
import { fsCreateOnce } from '../services/safety/safetyServerIo';
import { GENESIS, contribDocId, makeContrib, sanitizeEvent, verifyContribChain } from '../services/chora/contrib/chain';
import type { ContribEntry } from '../services/chora/contrib/types';

const PID_RE = /^[\w-]{3,160}$/;

type Access = { read: boolean; write: boolean };

async function accessFor(pid: string, uid: string): Promise<Access> {
  const co = await fsGet(`coedit/${pid}`);
  if (co?.members && typeof co.members === 'object') {
    const role = (co.members as Record<string, string>)[uid];
    return { read: !!role, write: role === 'owner' || role === 'editor' };
  }
  const claim = await fsGet(`choraContribProjects/${pid}`);
  if (!claim) {
    // Never shared and never ledgered: the first writer claims it (create-once, so a race has one winner).
    const r = await fsCreateOnce('choraContribProjects', pid, { ownerUid: uid, at: Date.now() });
    if (r === 'created') return { read: true, write: true };
    const again = await fsGet(`choraContribProjects/${pid}`);
    const mine = again?.ownerUid === uid;
    return { read: mine, write: mine };
  }
  const mine = claim.ownerUid === uid;
  return { read: mine, write: mine };
}

async function displayName(uid: string): Promise<string> {
  const u = await fsGet(`users/${uid}`);
  return String(u?.displayName || u?.name || u?.username || 'Plajah member').slice(0, 80);
}

/** Append entries in order. Race-safe the same way as routes/ledger.ts (create-only slots). */
async function appendAll(pid: string, bodies: Array<Omit<ContribEntry, 'hash' | 'seq' | 'prevHash'>>, priv: Record<string, unknown>): Promise<ContribEntry[]> {
  const head = await fsGet(`choraContribHeads/${pid}`);
  let seq = Number(head?.seq) || 0;
  let prevHash = typeof head?.hash === 'string' ? head.hash : GENESIS;
  const written: ContribEntry[] = [];
  for (const body of bodies) {
    let done = false;
    for (let attempt = 0; attempt < 25 && !done; attempt++) {
      const entry = makeContrib(body, seq + 1, prevHash);
      const r = await fsCreateOnce('choraContrib', contribDocId(pid, entry.seq), entry as unknown as Record<string, unknown>);
      if (r === 'created') {
        seq = entry.seq; prevHash = entry.hash; written.push(entry); done = true;
        void fsCreateOnce('choraContribPrivate', contribDocId(pid, entry.seq), { projectId: pid, seq: entry.seq, uid: body.uid, ...priv });
        break;
      }
      if (r === 'error') break;
      const taken = await fsGet(`choraContrib/${contribDocId(pid, seq + 1)}`);
      if (!taken?.hash) break;
      seq += 1; prevHash = taken.hash;
    }
    if (!done) break;
  }
  if (written.length) await fsSet(`choraContribHeads/${pid}`, { projectId: pid, seq, hash: prevHash, updatedAt: Date.now() });
  return written;
}

async function readChain(pid: string): Promise<ContribEntry[]> {
  const rows = await fsQuery('choraContrib', [{ field: 'projectId', value: pid }], 5000);
  return rows.map((r) => r.data as ContribEntry).sort((a, b) => a.seq - b.seq);
}

export interface ChoraContribRouterDeps {
  authMiddleware: any;
}

export function createChoraContribRouter(deps: ChoraContribRouterDeps): Router {
  const r = Router();
  const privOf = (req: any) => ({ ip: String(req.ip || req.socket?.remoteAddress || ''), ua: String(req.headers?.['user-agent'] || '').slice(0, 240), at: Date.now() });

  r.get('/mine', deps.authMiddleware, async (req: any, res) => {
    const rows = await fsQuery('choraContrib', [{ field: 'uid', value: req.uid }], 2000);
    const projects = new Map<string, { projectId: string; lastAt: number; entries: number }>();
    for (const { data } of rows) {
      const p = projects.get(data.projectId) ?? { projectId: data.projectId, lastAt: 0, entries: 0 };
      p.entries++; p.lastAt = Math.max(p.lastAt, Number(data.at) || 0);
      projects.set(data.projectId, p);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ projects: [...projects.values()].sort((a, b) => b.lastAt - a.lastAt) });
  });

  r.post('/:pid/events', deps.authMiddleware, async (req: any, res) => {
    const pid = String(req.params.pid);
    if (!PID_RE.test(pid)) return res.status(400).json({ error: 'Bad project id' });
    const events = (Array.isArray(req.body?.events) ? req.body.events : []).slice(0, 50).map(sanitizeEvent).filter(Boolean);
    if (!events.length) return res.json({ written: 0 });
    const access = await accessFor(pid, req.uid);
    if (!access.write) return res.status(403).json({ error: 'Not a collaborator on this project' });
    const name = await displayName(req.uid);
    const at = Date.now();
    // A take someone else played: name them from their account, never from the client.
    for (const e of events as any[]) {
      if (e.origin?.performer === req.uid) delete e.origin.performer;
      else if (e.origin?.performer) e.origin.performerName = await displayName(e.origin.performer);
    }
    const written = await appendAll(pid, events.map((e: any) => ({ ...e, projectId: pid, uid: req.uid, name, at })), privOf(req));
    res.json({ written: written.length, head: written.at(-1)?.hash ?? null });
  });

  r.post('/:pid/seal', deps.authMiddleware, async (req: any, res) => {
    const pid = String(req.params.pid);
    if (!PID_RE.test(pid)) return res.status(400).json({ error: 'Bad project id' });
    const sha = (Array.isArray(req.body?.sha256) ? req.body.sha256 : []).filter((s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)).slice(0, 64);
    if (!sha.length) return res.status(400).json({ error: 'Nothing to seal: send the sha-256 of the audio' });
    const access = await accessFor(pid, req.uid);
    if (!access.write) return res.status(403).json({ error: 'Not a collaborator on this project' });
    const head = await fsGet(`choraContribHeads/${pid}`);
    const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 120) : 'Version';
    const [entry] = await appendAll(pid, [{
      projectId: pid, uid: req.uid, name: await displayName(req.uid), at: Date.now(),
      kind: 'sealed', target: label, label, count: 1, sha256: sha, clientAt: Date.now(),
      sealedHead: typeof head?.hash === 'string' ? head.hash : GENESIS,
    }], privOf(req));
    if (!entry) return res.status(503).json({ error: 'Could not write the seal — try again' });
    res.json({ entry });
  });

  r.get('/:pid', deps.authMiddleware, async (req: any, res) => {
    const pid = String(req.params.pid);
    if (!PID_RE.test(pid)) return res.status(400).json({ error: 'Bad project id' });
    const co = await fsGet(`coedit/${pid}`);
    const claim = co ? null : await fsGet(`choraContribProjects/${pid}`);
    const allowed = co?.members ? !!(co.members as Record<string, string>)[req.uid] : claim?.ownerUid === req.uid;
    if (!allowed) return res.status(403).json({ error: 'Not a collaborator on this project' });
    const entries = await readChain(pid);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ projectId: pid, check: verifyContribChain(entries), entries });
  });

  return r;
}
