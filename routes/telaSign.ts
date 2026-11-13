// Tela Sign — the server is the only writer of envelopes and audit trails.
// Pure lifecycle and hashing: services/tela/sign/signCore.ts. Mounted in server.ts at /api/tela/sign.
//
// Why server-side: an audit trail the browser writes proves nothing. Here the server stamps the time, IP
// address and user agent on every event, checks the document fingerprint, decides whose turn it is, and
// refuses any write that would fork the history.
//
// Storage (both server-only in firestore.rules):
//   telaSignEnvelopes/{id}  { json, senderUid, docHash, finalHash, status, version, updatedAt }
//                           The envelope is stored as one JSON string so hashes never drift through
//                           Firestore's type conversions (undefined vs null, integer vs double).
//   telaSignLocks/{id}_{v}  create-only claim on "the transition away from version v". Two concurrent
//                           writers can never both move an envelope forward from the same version.
//
// Endpoints
//   POST /envelopes                 sender (auth): create a draft
//   GET  /envelopes/:id             sender: envelope, integrity check, certificate
//   POST /envelopes/:id/send        sender: send; returns one signing link per recipient (until email delivery lands)
//   POST /envelopes/:id/void        sender
//   GET  /envelopes/:id/signer      signer (link token): what this signer sees; records "viewed"
//   POST /envelopes/:id/consent     signer
//   POST /envelopes/:id/field       signer
//   POST /envelopes/:id/finish      signer
//   POST /envelopes/:id/decline     signer
//   GET  /verify/:hash              public: check a document or final fingerprint

import { Router } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import {
  ESIGN_DISCLOSURE, certificate, checkExclusions, consent, createEnvelope, decline, expireIfDue, fillField, finish,
  send, sha256Hex, validateDraft, verifyAudit, view, voidEnvelope,
  type DraftInput, type Envelope, type Field, type Signer,
} from '../services/tela/sign/signCore';

// ── Storage ──────────────────────────────────────────────────────────────────
export interface SignStore {
  get(id: string): Promise<Envelope | null>;
  /** Claim the right to move `id` forward from `fromVersion`. */
  claim(id: string, fromVersion: number): Promise<'ok' | 'taken' | 'error'>;
  put(env: Envelope): Promise<boolean>;
  /** Find a completed envelope by its final fingerprint, or any envelope by document fingerprint. */
  findByHash(hash: string): Promise<Envelope | null>;
}

export function memorySignStore(): SignStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>(), locks = new Set<string>();
  return {
    rows,
    async get(id) { const j = rows.get(id); return j ? JSON.parse(j) : null; },
    async claim(id, v) { const k = `${id}_${v}`; if (locks.has(k)) return 'taken'; locks.add(k); return 'ok'; },
    async put(env) { rows.set(env.id, JSON.stringify(env)); return true; },
    async findByHash(h) {
      const all = [...rows.values()].map((j) => JSON.parse(j) as Envelope);
      return all.find((e) => e.finalHash === h) ?? all.find((e) => e.docHash === h) ?? null;
    },
  };
}

export async function firestoreSignStore(): Promise<SignStore> {
  const { fsGet, fsSet, fsQuery } = await import('../services/firebaseAdminRest');
  const { fsCreateOnce } = await import('../services/safety/safetyServerIo');
  const parse = (row: any): Envelope | null => { try { return row?.json ? JSON.parse(row.json) : null; } catch { return null; } };
  return {
    async get(id) { return parse(await fsGet(`telaSignEnvelopes/${encodeURIComponent(id)}`)); },
    async claim(id, v) {
      const r = await fsCreateOnce('telaSignLocks', `${id}_${v}`, { envelope: id, from: v, at: Date.now() });
      return r === 'created' ? 'ok' : r === 'exists' ? 'taken' : 'error';
    },
    async put(env) {
      return fsSet(`telaSignEnvelopes/${encodeURIComponent(env.id)}`, {
        json: JSON.stringify(env), senderUid: env.sender.id, docHash: env.docHash, finalHash: env.finalHash ?? '',
        status: env.status, version: env.audit.length, updatedAt: Date.now(),
      });
    },
    async findByHash(h) {
      const byFinal = await fsQuery('telaSignEnvelopes', [{ field: 'finalHash', value: h }], 1);
      if (byFinal[0]) return parse(byFinal[0].data);
      const byDoc = await fsQuery('telaSignEnvelopes', [{ field: 'docHash', value: h }], 1);
      return byDoc[0] ? parse(byDoc[0].data) : null;
    },
  };
}

// ── Signer links ─────────────────────────────────────────────────────────────
/** HMAC over envelope + signer. Without the secret nobody can mint a link for someone else. */
export function signerToken(secret: string, envelopeId: string, signerId: string): string {
  return nodeCrypto.createHmac('sha256', secret).update(`tela-sign:${envelopeId}:${signerId}`).digest('base64url').slice(0, 32);
}
function tokenOk(secret: string, envelopeId: string, signerId: string, token: unknown): boolean {
  const a = Buffer.from(String(token ?? '')), b = Buffer.from(signerToken(secret, envelopeId, signerId));
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}
const codeHash = (envelopeId: string, code: string) => sha256Hex(`tela-sign-code:${envelopeId}:${code.trim()}`);

// ── Router ───────────────────────────────────────────────────────────────────
export interface TelaSignDeps {
  authMiddleware: any;
  /** Reads a Bearer token if present (no 401); used for signers who must be signed in. */
  optionalUid: (req: any) => Promise<string | null>;
  store: SignStore | Promise<SignStore>;
  /** HMAC secret for signing links. Without it, signer endpoints answer 503. */
  secret: () => string;
  /** Public origin used to build signing links, e.g. https://plajah.com */
  origin: () => string;
  limiter?: any;
  now?: () => number;
}

const SUPPORTED_AUTH = new Set(['email_link', 'plajah_account']);
const isHex64 = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** What a signer may see: no other recipients' emails, uids, codes, or audit IP addresses. */
export function signerView(env: Envelope, signerId: string) {
  return {
    id: env.id, title: env.title, docType: env.docType, docHash: env.docHash, pages: env.pages, message: env.message,
    sender: { name: env.sender.name, org: env.sender.org }, status: env.status, expiresAt: env.expiresAt,
    you: (({ id, name, role, status, consumer, consentedAt, signedAt }) => ({ id, name, role, status, consumer, consentedAt, signedAt }))(env.signers.find((s) => s.id === signerId)!),
    recipients: env.signers.map((s) => ({ id: s.id, name: s.name, role: s.role, order: s.order, status: s.status })),
    fields: env.fields,
    disclosure: ESIGN_DISCLOSURE,
    finalHash: env.finalHash,
  };
}

export function createTelaSignRouter(deps: TelaSignDeps): Router {
  const r = Router();
  const now = deps.now ?? (() => Date.now());
  const json = express.json({ limit: '256kb' });
  if (deps.limiter) r.use(deps.limiter);
  const storeP = Promise.resolve(deps.store);

  const ctx = (req: any) => ({ ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 64), userAgent: String(req.get?.('user-agent') || '').slice(0, 256) });
  const fail = (res: any, status: number, error: string) => res.status(status).json({ error });
  const noStore = (res: any) => res.setHeader('Cache-Control', 'private, no-store');

  /** Load, apply expiry, run `op`, and save under a version claim. Retries a lost race a few times. */
  async function mutate(id: string, op: (env: Envelope) => Envelope | Promise<Envelope>): Promise<{ env?: Envelope; status?: number; error?: string }> {
    const store = await storeP;
    for (let attempt = 0; attempt < 4; attempt++) {
      const loaded = await store.get(id);
      if (!loaded) return { status: 404, error: 'Envelope not found.' };
      let next: Envelope;
      try {
        next = await op(expireIfDue(loaded, now()));
      } catch (e: any) {
        // Expiry is a real state change even when the requested action is refused.
        const expired = expireIfDue(loaded, now());
        if (expired !== loaded && (await store.claim(id, loaded.audit.length)) === 'ok') await store.put(expired);
        return { status: 409, error: String(e?.message || 'That action isn’t allowed right now.') };
      }
      if (next === loaded) return { env: loaded };
      const c = await store.claim(id, loaded.audit.length);
      if (c === 'ok') {
        if (!(await store.put(next))) return { status: 503, error: 'Couldn’t save. Try again.' };
        return { env: next };
      }
      if (c === 'error') return { status: 503, error: 'Couldn’t save. Try again.' };
      await new Promise((ok) => setTimeout(ok, 40 * (attempt + 1)));
    }
    return { status: 409, error: 'Someone else just updated this envelope. Reload and try again.' };
  }

  async function asSender(req: any, res: any): Promise<Envelope | null> {
    const env = await (await storeP).get(String(req.params.id));
    if (!env || env.sender.id !== req.uid) { fail(res, 404, 'Envelope not found.'); return null; }
    return env;
  }

  /** Check the link token, the access code and, for account signers, the signed-in user. */
  async function asSigner(req: any, res: any, src: any): Promise<{ env: Envelope; signer: Signer } | null> {
    const secret = deps.secret();
    if (!secret) { fail(res, 503, 'Signing links aren’t configured on this server.'); return null; }
    const id = String(req.params.id), sid = str(src?.s, 80);
    if (!sid || !tokenOk(secret, id, sid, src?.t)) { fail(res, 403, 'This signing link isn’t valid.'); return null; }
    const env = await (await storeP).get(id);
    const signer = env?.signers.find((s) => s.id === sid);
    if (!env || !signer) { fail(res, 404, 'Envelope not found.'); return null; }
    if (signer.accessCodeHash && codeHash(id, str(src?.code, 64)) !== signer.accessCodeHash) {
      res.status(401).json({ error: 'Enter the access code the sender gave you.', needs: 'access_code' }); return null;
    }
    if (signer.auth === 'plajah_account') {
      const uid = await deps.optionalUid(req);
      if (!uid || uid !== signer.uid) { res.status(401).json({ error: 'Sign in to Plajah as the person this was sent to.', needs: 'plajah_account' }); return null; }
    }
    return { env, signer };
  }

  // ── Sender ─────────────────────────────────────────────────────────────────
  r.post('/api/tela/sign/envelopes', json, deps.authMiddleware, async (req: any, res) => {
    const b = req.body || {};
    const docText = typeof b.docText === 'string' ? b.docText : null;
    const docHash = docText !== null ? sha256Hex(docText) : str(b.docHash, 64);
    if (b.docHash && docText !== null && b.docHash !== docHash) return fail(res, 400, 'The document fingerprint doesn’t match the document.');
    if (!isHex64(docHash)) return fail(res, 400, 'The document fingerprint is missing.');
    const id = `env_${nodeCrypto.randomBytes(10).toString('hex')}`;
    const signersIn = Array.isArray(b.signers) ? b.signers.slice(0, 50) : [];
    const signers: Omit<Signer, 'status'>[] = [];
    for (const [i, s] of signersIn.entries()) {
      const auth = str(s?.auth, 30) || 'email_link';
      if (!SUPPORTED_AUTH.has(auth)) return fail(res, 400, `${auth === 'sms_code' ? 'Text-message codes' : 'ID verification'} isn’t available yet. Use an email link, a Plajah account or an access code.`);
      if (auth === 'plajah_account' && !str(s?.uid, 128)) return fail(res, 400, 'Choose the Plajah account that should sign.');
      const code = str(s?.accessCode, 64);
      if (code && code.length < 4) return fail(res, 400, 'Access codes need at least 4 characters.');
      signers.push({
        id: str(s?.id, 80) || `s${i + 1}`, name: str(s?.name, 120), email: str(s?.email, 200).toLowerCase(),
        role: (['signer', 'approver', 'cc'].includes(s?.role) ? s.role : 'signer'), order: Math.max(1, Math.min(50, Number(s?.order) || 1)),
        auth: auth as Signer['auth'], consumer: s?.consumer !== false, uid: auth === 'plajah_account' ? str(s.uid, 128) : undefined,
        accessCodeHash: code ? codeHash(id, code) : undefined,
      });
    }
    const fields: Field[] = (Array.isArray(b.fields) ? b.fields.slice(0, 500) : []).map((f: any, i: number) => ({
      id: str(f?.id, 80) || `f${i + 1}`, signerId: str(f?.signerId, 80), type: f?.type, label: str(f?.label, 80) || undefined,
      page: Number(f?.page) || 1, x: Number(f?.x) || 0, y: Number(f?.y) || 0, w: Number(f?.w) || 0, h: Number(f?.h) || 0, required: f?.required !== false,
    }));
    if (fields.some((f) => !['signature', 'initials', 'date_signed', 'name', 'text', 'checkbox'].includes(f.type))) return fail(res, 400, 'Unknown field type.');
    const draft: DraftInput = {
      id, title: str(b.title, 200), docType: str(b.docType, 60) || 'document', docHash, pages: Math.max(1, Math.min(2000, Number(b.pages) || 1)),
      message: str(b.message, 2000) || undefined,
      sender: { id: req.uid, name: str(b.senderName, 120) || 'Plajah user', org: str(b.senderOrg, 120) || undefined },
      signers, fields, now: now(), expiresInDays: Math.max(1, Math.min(365, Number(b.expiresInDays) || 30)),
    };
    if (!draft.title) return fail(res, 400, 'Give the document a title.');
    const problems = validateDraft(draft);
    const ex = checkExclusions(draft.docType, draft.title, { stateDepartment: b.stateDepartment === true });
    if (!ex.allowed) return res.status(400).json({ error: ex.reasons[0], problems, exclusions: ex });
    const env = createEnvelope(draft);
    const store = await storeP;
    if ((await store.claim(id, -1)) !== 'ok' || !(await store.put(env))) return fail(res, 503, 'Couldn’t save. Try again.');
    noStore(res);
    res.status(201).json({ envelope: env, problems, exclusions: ex });
  });

  r.get('/api/tela/sign/envelopes/:id', deps.authMiddleware, async (req: any, res) => {
    const env = await asSender(req, res); if (!env) return;
    noStore(res);
    res.json({ envelope: env, check: verifyAudit(env), certificate: certificate(env) });
  });

  r.post('/api/tela/sign/envelopes/:id/send', json, deps.authMiddleware, async (req: any, res) => {
    const env = await asSender(req, res); if (!env) return;
    const secret = deps.secret();
    if (!secret) return fail(res, 503, 'Signing links aren’t configured on this server.');
    const out = await mutate(env.id, (e) => send(e, now()));
    if (!out.env) return fail(res, out.status!, out.error!);
    const links = out.env.signers.filter((s) => s.role !== 'cc').map((s) => ({
      signerId: s.id, name: s.name, email: s.email,
      url: `${deps.origin().replace(/\/$/, '')}/?view=sign&env=${encodeURIComponent(out.env!.id)}&s=${encodeURIComponent(s.id)}&t=${signerToken(secret, out.env!.id, s.id)}`,
    }));
    noStore(res);
    res.json({ envelope: out.env, links });
  });

  r.post('/api/tela/sign/envelopes/:id/void', json, deps.authMiddleware, async (req: any, res) => {
    const env = await asSender(req, res); if (!env) return;
    const reason = str(req.body?.reason, 500);
    if (!reason) return fail(res, 400, 'Say why you’re voiding it; signers will see this.');
    const out = await mutate(env.id, (e) => voidEnvelope(e, req.uid, reason, now()));
    if (!out.env) return fail(res, out.status!, out.error!);
    noStore(res); res.json({ envelope: out.env });
  });

  // ── Signer ─────────────────────────────────────────────────────────────────
  r.get('/api/tela/sign/envelopes/:id/signer', async (req: any, res) => {
    const who = await asSigner(req, res, req.query); if (!who) return;
    let env = who.env;
    if (env.status === 'sent' && who.signer.role !== 'cc') {
      const out = await mutate(env.id, (e) => view(e, who.signer.id, now(), ctx(req)));
      if (out.env) env = out.env;
    }
    noStore(res); res.json(signerView(env, who.signer.id));
  });

  const signerAction = (path: string, op: (env: Envelope, signerId: string, req: any) => Envelope) =>
    r.post(`/api/tela/sign/envelopes/:id/${path}`, json, async (req: any, res) => {
      const who = await asSigner(req, res, req.body); if (!who) return;
      const out = await mutate(who.env.id, (e) => op(e, who.signer.id, req));
      if (!out.env) return fail(res, out.status!, out.error!);
      noStore(res); res.json(signerView(out.env, who.signer.id));
    });

  signerAction('consent', (e, sid, req) => consent(e, sid, now(), ctx(req)));
  signerAction('field', (e, sid, req) => {
    const v = req.body?.value;
    const value = v && typeof v === 'object'
      ? { method: v.method, data: str(v.data, 20_000), at: now() } // the server sets the time, not the browser
      : typeof v === 'string' ? v.slice(0, 2000) : v === true || v === false ? v : undefined;
    return fillField(e, sid, str(req.body?.fieldId, 80), value as Field['value'], now());
  });
  signerAction('finish', (e, sid, req) => finish(e, sid, now(), ctx(req)));
  signerAction('decline', (e, sid, req) => decline(e, sid, str(req.body?.reason, 1000), now()));

  // ── Public verify ──────────────────────────────────────────────────────────
  r.get('/api/tela/sign/verify/:hash', async (req, res) => {
    const h = String(req.params.hash).toLowerCase();
    if (!isHex64(h)) return fail(res, 400, 'Paste a 64-character fingerprint.');
    const env = await (await storeP).findByHash(h);
    res.setHeader('Cache-Control', 'no-store');
    if (!env) return res.json({ found: false });
    const c = certificate(env);
    // Names and dates only: no emails, IP addresses or field values.
    res.json({
      found: true, matched: env.finalHash === h ? 'final' : 'document',
      title: env.title, status: env.status, sender: { name: env.sender.name, org: env.sender.org },
      documentFingerprint: env.docHash, finalFingerprint: env.finalHash ?? null, completedAt: env.completedAt ?? null,
      auditIntact: c.auditIntact, events: env.audit.length,
      signers: c.signers.map((s) => ({ name: s.name, role: s.role, auth: s.auth, status: s.status, signedAt: s.signedAt ?? null, method: s.method ?? null })),
    });
  });

  return r;
}
