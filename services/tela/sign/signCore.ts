/**
 * Tela Sign — native electronic signatures on Tela documents (the pure core).
 *
 * An envelope carries one document (fingerprinted by SHA-256), the people who sign or approve it in
 * order, and the fields each of them fills (signature, initials, date signed, name, text, checkbox),
 * positioned with the same 0–100% page boxes as Tela Base fields (TelaField.layout). Every step —
 * sent, viewed, consented, field completed, signed, declined, voided, completed — is appended to a
 * hash-chained audit trail, so any later edit to the history is detectable (verifyAudit). The
 * completed envelope gets a final fingerprint over the document and every value, and a certificate
 * of completion. That fingerprint can be anchored on the Civic Record (docs/TERRA_CIVIC_LEDGER_BLUEPRINT.md).
 *
 * ── Legal frame (not legal advice; confirm per use with counsel) ────────────
 * - Michigan Uniform Electronic Transactions Act, MCL 450.831 et seq.: an electronic signature satisfies a law
 *   requiring a signature (450.837) when the parties agreed to transact electronically (450.838).
 *   It does not apply to wills, codicils or testamentary trusts, or to most of the UCC (450.833).
 *   State departments use e-signatures as the Department of Technology, Management and Budget
 *   determines (450.848).
 * - Federal ESIGN Act (15 U.S.C. 7001–7006): consumers must get a disclosure and consent before electronic
 *   records replace paper (7001(c)); some documents are excluded (7003), e.g. family-law matters, court
 *   orders and notices of utility shutoff, foreclosure or eviction, insurance cancellation, product recalls.
 *   checkExclusions() blocks or flags these.
 *
 * Pure and isomorphic: no Firebase, no DOM, no Node crypto (a small SHA-256 is included).
 */

// ── SHA-256 (sync, pure JS) ──────────────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** Deterministic JSON: sorted keys, undefined dropped. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

// ── Types ────────────────────────────────────────────────────────────────────
export type SignerRole = 'signer' | 'approver' | 'cc';
export type SignerAuth = 'email_link' | 'plajah_account' | 'sms_code' | 'id_verified';
export type FieldType = 'signature' | 'initials' | 'date_signed' | 'name' | 'text' | 'checkbox';
export type EnvelopeStatus = 'draft' | 'sent' | 'completed' | 'declined' | 'voided' | 'expired';

export interface Signer {
  id: string;
  name: string;
  email: string;
  role: SignerRole;
  /** Routing order; equal numbers sign in parallel. */
  order: number;
  auth: SignerAuth;
  /** A consumer must accept the ESIGN disclosure before signing (15 U.S.C. 7001(c)). */
  consumer?: boolean;
  status: 'waiting' | 'ready' | 'viewed' | 'signed' | 'declined';
  consentedAt?: number;
  signedAt?: number;
}

export interface SignatureMark { method: 'drawn' | 'typed'; /** SVG path data (drawn) or the typed name. */ data: string; at: number }

export interface Field {
  id: string;
  signerId: string;
  type: FieldType;
  label?: string;
  page: number;
  /** 0–100 percent of the page, like TelaField.layout. */
  x: number; y: number; w: number; h: number;
  required: boolean;
  value?: string | boolean | SignatureMark;
}

export interface AuditEvent {
  seq: number;
  at: number;
  actor: string; // signer id, sender uid, or 'system'
  event: 'created' | 'sent' | 'viewed' | 'consented' | 'field' | 'signed' | 'declined' | 'voided' | 'expired' | 'completed' | 'reminded';
  detail?: string;
  /** Client context recorded by the server (never trusted from the client alone). */
  ip?: string;
  userAgent?: string;
  prevHash: string;
  hash: string;
}

export interface Envelope {
  id: string;
  title: string;
  /** Kind of document, used by checkExclusions (e.g. "permit", "contract", "will"). */
  docType: string;
  docHash: string;
  pages: number;
  message?: string;
  sender: { id: string; name: string; org?: string };
  signers: Signer[];
  fields: Field[];
  status: EnvelopeStatus;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  /** SHA-256 over the document hash and every field value, set on completion. */
  finalHash?: string;
  audit: AuditEvent[];
}

export const GENESIS = '0'.repeat(64);

// ── Legal checks ─────────────────────────────────────────────────────────────
export interface ExclusionResult { allowed: boolean; level: 'ok' | 'warn' | 'block'; reasons: string[]; cites: string[] }

const BLOCK: [RegExp, string, string][] = [
  [/(^will\b|\blast will\b|\bwill and testament\b|\bcodicil\b|\btestamentary trust\b)/i, 'Wills, codicils and testamentary trusts are outside Michigan’s electronic transactions act.', 'mcl-450.833'],
  [/\b(adoption|divorce|custody|family law)\b/i, 'Family-law matters such as adoption and divorce are excluded from federal ESIGN.', '15 U.S.C. 7003(a)(2)'],
  [/\b(court order|court notice|pleading|court document)\b/i, 'Court orders, notices and official court documents are excluded from federal ESIGN.', '15 U.S.C. 7003(b)(1)'],
];
const NOTICE: [RegExp, string, string][] = [
  [/\b(utility (shutoff|termination)|water shutoff)\b/i, 'Utility shutoff notices must still be delivered on paper.', '15 U.S.C. 7003(b)(2)(A)'],
  [/\b(foreclosure|eviction|repossession|default notice)\b/i, 'Notices of default, foreclosure, eviction or repossession of a primary residence must still be delivered on paper.', '15 U.S.C. 7003(b)(2)(B)'],
  [/\b(insurance cancellation|cancel(l)?ation of (health|life) insurance)\b/i, 'Health or life insurance cancellation notices must still be delivered on paper.', '15 U.S.C. 7003(b)(2)(C)'],
  [/\bproduct recall\b/i, 'Product recall notices affecting health or safety must still be delivered on paper.', '15 U.S.C. 7003(b)(2)(D)'],
  [/\b(hazardous material)\b/i, 'Documents that must accompany hazardous materials in transport must stay on paper.', '15 U.S.C. 7003(b)(3)'],
];

export function checkExclusions(docType: string, title = '', opts: { stateDepartment?: boolean } = {}): ExclusionResult {
  const text = `${docType} ${title}`;
  const reasons: string[] = [], cites: string[] = [];
  let level: ExclusionResult['level'] = 'ok';
  for (const [re, why, cite] of BLOCK) if (re.test(text)) { reasons.push(why); cites.push(cite); level = 'block'; }
  for (const [re, why, cite] of NOTICE) if (re.test(text)) { reasons.push(why); cites.push(cite); if (level === 'ok') level = 'warn'; }
  if (opts.stateDepartment) {
    reasons.push('State departments sign electronically as DTMB determines; confirm the department’s approved method.');
    cites.push('mcl-450.848');
    if (level === 'ok') level = 'warn';
  }
  return { allowed: level !== 'block', level, reasons, cites };
}

export const ESIGN_DISCLOSURE = [
  'You agree to sign and receive this document electronically.',
  'You can ask for a paper copy at no charge, and you can withdraw consent before you sign by declining.',
  'You need a device with a current web browser and an email address to receive your copy.',
  'Your signature, the time and the device details are recorded in an audit trail attached to the document.',
];

// ── Audit trail ──────────────────────────────────────────────────────────────
function append(env: Envelope, ev: Omit<AuditEvent, 'seq' | 'prevHash' | 'hash'>): Envelope {
  const prev = env.audit[env.audit.length - 1];
  const base = { ...ev, seq: env.audit.length, prevHash: prev ? prev.hash : GENESIS };
  const hash = sha256Hex(canonical({ envelope: env.id, docHash: env.docHash, ...base }));
  return { ...env, audit: [...env.audit, { ...base, hash }] };
}

export function verifyAudit(env: Envelope): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (const e of env.audit) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || sha256Hex(canonical({ envelope: env.id, docHash: env.docHash, ...rest })) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
export interface DraftInput {
  id: string; title: string; docType: string; docHash: string; pages: number; message?: string;
  sender: Envelope['sender']; signers: Omit<Signer, 'status'>[]; fields: Field[]; now: number; expiresInDays?: number;
}

/** Validate a draft. Returns problems in plain language; an empty list means it can be sent. */
export function validateDraft(d: DraftInput): string[] {
  const p: string[] = [];
  if (!/^[0-9a-f]{64}$/.test(d.docHash)) p.push('The document fingerprint is missing.');
  if (!d.signers.some((s) => s.role === 'signer')) p.push('Add at least one signer.');
  for (const s of d.signers) {
    if (!s.name.trim()) p.push('Every recipient needs a name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) p.push(`${s.name || 'A recipient'} needs a valid email.`);
    if (s.role === 'signer' && !d.fields.some((f) => f.signerId === s.id && f.type === 'signature')) p.push(`${s.name} has no signature field.`);
  }
  for (const f of d.fields) {
    if (!d.signers.some((s) => s.id === f.signerId)) p.push('A field is assigned to someone who isn’t on the envelope.');
    if (f.page < 1 || f.page > d.pages || f.x < 0 || f.y < 0 || f.x + f.w > 100 || f.y + f.h > 100) p.push(`A ${f.type.replace('_', ' ')} field sits outside the page.`);
  }
  const ex = checkExclusions(d.docType, d.title);
  if (ex.level === 'block') p.push(...ex.reasons);
  return [...new Set(p)];
}

export function createEnvelope(d: DraftInput): Envelope {
  const env: Envelope = {
    id: d.id, title: d.title, docType: d.docType, docHash: d.docHash, pages: d.pages, message: d.message, sender: d.sender,
    signers: d.signers.map((s) => ({ ...s, status: 'waiting' })), fields: d.fields.map((f) => ({ ...f, value: undefined })),
    status: 'draft', createdAt: d.now, expiresAt: d.now + (d.expiresInDays ?? 30) * 86_400_000, audit: [],
  };
  return append(env, { at: d.now, actor: d.sender.id, event: 'created', detail: `Document ${d.docHash.slice(0, 12)}…` });
}

/** Signers whose turn it is (lowest order among those not finished). */
export function activeOrder(env: Envelope): number | null {
  const open = env.signers.filter((s) => s.role !== 'cc' && s.status !== 'signed');
  return open.length ? Math.min(...open.map((s) => s.order)) : null;
}

function refreshReady(env: Envelope): Envelope {
  const o = activeOrder(env);
  return { ...env, signers: env.signers.map((s) => (s.role !== 'cc' && s.status === 'waiting' && s.order === o ? { ...s, status: 'ready' } : s)) };
}

export function send(env: Envelope, now: number): Envelope {
  if (env.status !== 'draft') throw new Error('Only a draft can be sent.');
  const problems = validateDraft({ ...env, signers: env.signers, fields: env.fields, now, sender: env.sender });
  if (problems.length) throw new Error(problems[0]);
  return refreshReady(append({ ...env, status: 'sent' }, { at: now, actor: env.sender.id, event: 'sent', detail: `To ${env.signers.filter((s) => s.role !== 'cc').map((s) => s.name).join(', ')}` }));
}

function signerOrThrow(env: Envelope, id: string): Signer {
  const s = env.signers.find((x) => x.id === id);
  if (!s) throw new Error('Not a recipient of this envelope.');
  if (env.status !== 'sent') throw new Error('This envelope is not open for signing.');
  return s;
}

function patchSigner(env: Envelope, id: string, p: Partial<Signer>): Envelope {
  return { ...env, signers: env.signers.map((s) => (s.id === id ? { ...s, ...p } : s)) };
}

export function expireIfDue(env: Envelope, now: number): Envelope {
  if (env.status === 'sent' && now > env.expiresAt) return append({ ...env, status: 'expired' }, { at: now, actor: 'system', event: 'expired' });
  return env;
}

export function view(env: Envelope, signerId: string, now: number, ctx: { ip?: string; userAgent?: string } = {}): Envelope {
  const s = signerOrThrow(env, signerId);
  const next = s.status === 'ready' ? patchSigner(env, signerId, { status: 'viewed' }) : env;
  return append(next, { at: now, actor: signerId, event: 'viewed', ...ctx });
}

export function consent(env: Envelope, signerId: string, now: number, ctx: { ip?: string; userAgent?: string } = {}): Envelope {
  signerOrThrow(env, signerId);
  return append(patchSigner(env, signerId, { consentedAt: now }), { at: now, actor: signerId, event: 'consented', detail: 'Accepted the electronic records disclosure', ...ctx });
}

export function fillField(env: Envelope, signerId: string, fieldId: string, value: Field['value'], now: number): Envelope {
  const s = signerOrThrow(env, signerId);
  if (s.status !== 'ready' && s.status !== 'viewed') throw new Error('It isn’t your turn to sign yet.');
  const f = env.fields.find((x) => x.id === fieldId);
  if (!f || f.signerId !== signerId) throw new Error('That field belongs to someone else.');
  if ((f.type === 'signature' || f.type === 'initials')) {
    const m = value as SignatureMark;
    if (!m || typeof m !== 'object' || !m.data || (m.method !== 'drawn' && m.method !== 'typed')) throw new Error('Draw or type your signature.');
  }
  if (f.type === 'checkbox' && typeof value !== 'boolean') throw new Error('Check or uncheck the box.');
  if ((f.type === 'text' || f.type === 'name') && typeof value !== 'string') throw new Error('Enter text.');
  const fields = env.fields.map((x) => (x.id === fieldId ? { ...x, value } : x));
  return append({ ...env, fields }, { at: now, actor: signerId, event: 'field', detail: `${f.label ?? f.type.replace('_', ' ')} completed` });
}

/** Finish signing for one signer. Fills date-signed fields, checks every required field and consent. */
export function finish(env: Envelope, signerId: string, now: number, ctx: { ip?: string; userAgent?: string } = {}): Envelope {
  const s = signerOrThrow(env, signerId);
  if (s.status !== 'ready' && s.status !== 'viewed') throw new Error('It isn’t your turn to sign yet.');
  if (s.consumer && !s.consentedAt) throw new Error('Accept the electronic records disclosure before signing.');
  let next: Envelope = { ...env, fields: env.fields.map((f) => (f.signerId === signerId && f.type === 'date_signed' ? { ...f, value: new Date(now).toISOString().slice(0, 10) } : f)) };
  const missing = next.fields.filter((f) => f.signerId === signerId && f.required && (f.value === undefined || f.value === '' || f.value === false));
  if (missing.length) throw new Error(`Complete ${missing.length === 1 ? 'the' : missing.length} required field${missing.length === 1 ? '' : 's'} first.`);
  next = append(patchSigner(next, signerId, { status: 'signed', signedAt: now }), { at: now, actor: signerId, event: 'signed', ...ctx });
  next = refreshReady(next);
  if (activeOrder(next) === null) {
    const finalHash = sha256Hex(canonical({ doc: next.docHash, fields: next.fields.map((f) => ({ id: f.id, signer: f.signerId, value: f.value })) }));
    next = append({ ...next, status: 'completed', completedAt: now, finalHash }, { at: now, actor: 'system', event: 'completed', detail: `Final fingerprint ${finalHash.slice(0, 12)}…` });
  }
  return next;
}

export function decline(env: Envelope, signerId: string, reason: string, now: number): Envelope {
  signerOrThrow(env, signerId);
  if (!reason.trim()) throw new Error('Say why you’re declining so the sender can follow up.');
  return append(patchSigner({ ...env, status: 'declined' }, signerId, { status: 'declined' }), { at: now, actor: signerId, event: 'declined', detail: reason.trim() });
}

export function voidEnvelope(env: Envelope, by: string, reason: string, now: number): Envelope {
  if (env.status === 'completed') throw new Error('A completed envelope can’t be voided; create a new one.');
  return append({ ...env, status: 'voided' }, { at: now, actor: by, event: 'voided', detail: reason });
}

// ── Certificate ──────────────────────────────────────────────────────────────
export function certificate(env: Envelope) {
  const v = verifyAudit(env);
  return {
    envelope: env.id,
    title: env.title,
    status: env.status,
    documentFingerprint: env.docHash,
    finalFingerprint: env.finalHash,
    auditIntact: v.ok,
    sender: env.sender,
    signers: env.signers.filter((s) => s.role !== 'cc').map((s) => ({
      name: s.name, email: s.email, role: s.role, auth: s.auth,
      consentedAt: s.consentedAt, signedAt: s.signedAt, status: s.status,
      method: (env.fields.find((f) => f.signerId === s.id && f.type === 'signature')?.value as SignatureMark | undefined)?.method,
    })),
    events: env.audit.map((e) => ({ seq: e.seq, at: e.at, actor: e.actor, event: e.event, detail: e.detail, hash: e.hash })),
  };
}
