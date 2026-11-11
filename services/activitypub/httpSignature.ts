// HTTP Signatures (draft-cavage-http-signatures-12, the dialect Mastodon/Pixelfed/Lemmy/Threads speak) + Digest.
// PURE: node:crypto only, the clock is passed in. Used to sign every outgoing delivery and to verify every POST
// that arrives at an inbox.
//
// Outgoing: rsa-sha256 over (request-target) host date digest [content-type].
// Incoming: accept algorithm rsa-sha256 or hs2019 (verified as RSA-SHA256, the only key type we publish/accept),
// require (request-target) + date-or-(created) + host, and digest whenever there is a body. The Digest must match
// the exact bytes received; Date must be within the skew window.

import { createHash, createSign, createVerify } from 'node:crypto';

export const DEFAULT_MAX_SKEW_MS = 60 * 60 * 1000;       // an hour behind (queues retry)…
export const DEFAULT_MAX_FUTURE_MS = 5 * 60 * 1000;      // …five minutes ahead (clock drift)

export function digestHeader(body: string | Buffer): string {
  return `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
}

export interface ParsedSignature {
  keyId: string;
  algorithm: string;
  headers: string[];
  signature: string;
  created?: number;
  expires?: number;
}

/** Parse `keyId="…",algorithm="…",headers="…",signature="…"` (quoted or bare numeric values). */
export function parseSignatureHeader(raw: string | undefined): ParsedSignature | null {
  if (!raw || raw.length > 8192) return null;
  const params: Record<string, string> = {};
  const re = /\s*([a-zA-Z]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([0-9.]+))\s*(?:,|$)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index !== consumed) return null;
    params[m[1].toLowerCase()] = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3];
    consumed = re.lastIndex;
    if (consumed >= raw.length) break;
  }
  if (consumed < raw.trim().length) return null;
  if (!params.keyid || !params.signature) return null;
  return {
    keyId: params.keyid,
    algorithm: (params.algorithm || 'hs2019').toLowerCase(),
    headers: (params.headers || 'date').toLowerCase().split(/\s+/).filter(Boolean),
    signature: params.signature,
    created: params.created ? Number(params.created) : undefined,
    expires: params.expires ? Number(params.expires) : undefined,
  };
}

type HeaderBag = Record<string, string | string[] | undefined>;
const headerValue = (headers: HeaderBag, name: string): string | undefined => {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) {
    const k = Object.keys(headers).find(h => h.toLowerCase() === name.toLowerCase());
    const w = k ? headers[k] : undefined;
    return Array.isArray(w) ? w.join(', ') : w;
  }
  return Array.isArray(v) ? v.join(', ') : v;
};

/** The exact string that is signed. `path` includes the query string. Returns null if a named header is missing. */
export function buildSigningString(
  method: string, path: string, headers: HeaderBag, names: string[], extra: { created?: number; expires?: number } = {},
): string | null {
  const lines: string[] = [];
  for (const name of names) {
    if (name === '(request-target)') lines.push(`(request-target): ${method.toLowerCase()} ${path}`);
    else if (name === '(created)') { if (extra.created === undefined) return null; lines.push(`(created): ${extra.created}`); }
    else if (name === '(expires)') { if (extra.expires === undefined) return null; lines.push(`(expires): ${extra.expires}`); }
    else {
      const v = headerValue(headers, name);
      if (v === undefined) return null;
      lines.push(`${name}: ${v.trim()}`);
    }
  }
  return lines.join('\n');
}

export interface SignedHeaders { [k: string]: string }

/** Headers for an outgoing signed request (POST with body, or GET without). */
export function signRequest(opts: {
  method: 'GET' | 'POST'; url: string; body?: string; keyId: string; privateKeyPem: string; now?: Date;
  contentType?: string; accept?: string;
}): SignedHeaders {
  const u = new URL(opts.url);
  const headers: SignedHeaders = {
    host: u.host,
    date: (opts.now ?? new Date()).toUTCString(),
  };
  const names = ['(request-target)', 'host', 'date'];
  if (opts.method === 'POST') {
    headers.digest = digestHeader(opts.body ?? '');
    headers['content-type'] = opts.contentType ?? 'application/activity+json';
    names.push('digest', 'content-type');
  }
  if (opts.accept) headers.accept = opts.accept;
  const signing = buildSigningString(opts.method, u.pathname + u.search, headers, names)!;
  const sig = createSign('RSA-SHA256').update(signing).sign(opts.privateKeyPem, 'base64');
  headers.signature = `keyId="${opts.keyId}",algorithm="rsa-sha256",headers="${names.join(' ')}",signature="${sig}"`;
  return headers;
}

export type VerifyResult = { ok: true; keyId: string } | { ok: false; reason: string };

/** Structural checks that need no key (run these BEFORE fetching anything remote). */
export function precheckSignature(opts: {
  method: string; headers: HeaderBag; rawBody?: Buffer | string; now: number; maxSkewMs?: number; maxFutureMs?: number;
}): { ok: true; sig: ParsedSignature } | { ok: false; reason: string } {
  const sig = parseSignatureHeader(headerValue(opts.headers, 'signature'));
  if (!sig) return { ok: false, reason: 'missing-or-bad-signature-header' };
  if (!['rsa-sha256', 'hs2019'].includes(sig.algorithm)) return { ok: false, reason: 'unsupported-algorithm' };
  if (!sig.headers.includes('(request-target)')) return { ok: false, reason: 'request-target-not-signed' };
  if (!sig.headers.includes('host')) return { ok: false, reason: 'host-not-signed' };

  // Freshness: Date header (or the (created) pseudo-header).
  const maxSkew = opts.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  const maxFuture = opts.maxFutureMs ?? DEFAULT_MAX_FUTURE_MS;
  let at: number | null = null;
  if (sig.headers.includes('date')) {
    const d = headerValue(opts.headers, 'date');
    const t = d ? Date.parse(d) : NaN;
    if (!Number.isFinite(t)) return { ok: false, reason: 'bad-date' };
    at = t;
  } else if (sig.headers.includes('(created)') && sig.created !== undefined) {
    at = sig.created * 1000;
  }
  if (at === null) return { ok: false, reason: 'date-not-signed' };
  if (opts.now - at > maxSkew) return { ok: false, reason: 'date-too-old' };
  if (at - opts.now > maxFuture) return { ok: false, reason: 'date-in-future' };
  if (sig.expires !== undefined && sig.expires * 1000 < opts.now) return { ok: false, reason: 'signature-expired' };

  // Body integrity.
  const hasBody = opts.method.toUpperCase() !== 'GET' && opts.method.toUpperCase() !== 'HEAD';
  if (hasBody) {
    if (!sig.headers.includes('digest')) return { ok: false, reason: 'digest-not-signed' };
    const digest = headerValue(opts.headers, 'digest');
    if (!digest) return { ok: false, reason: 'missing-digest' };
    const want = digestHeader(opts.rawBody ?? '');
    // Digest may list several algorithms; we need a matching SHA-256 entry.
    const sha = digest.split(',').map(s => s.trim()).find(s => /^sha-256=/i.test(s));
    if (!sha) return { ok: false, reason: 'digest-not-sha256' };
    if (sha.slice(8) !== want.slice(8)) return { ok: false, reason: 'digest-mismatch' };
  }
  return { ok: true, sig };
}

/** Full verification once the caller has the signer's public key. */
export function verifySignature(opts: {
  method: string; path: string; headers: HeaderBag; rawBody?: Buffer | string; publicKeyPem: string; now: number;
  maxSkewMs?: number; maxFutureMs?: number;
}): VerifyResult {
  const pre = precheckSignature(opts);
  if (!pre.ok) return { ok: false, reason: (pre as { reason?: string }).reason || 'bad-signature' };
  const { sig } = pre;
  const signing = buildSigningString(opts.method, opts.path, opts.headers, sig.headers, { created: sig.created, expires: sig.expires });
  if (signing === null) return { ok: false, reason: 'signed-header-missing' };
  try {
    const good = createVerify('RSA-SHA256').update(signing).verify(opts.publicKeyPem, sig.signature, 'base64');
    return good ? { ok: true, keyId: sig.keyId } : { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'bad-key' };
  }
}
