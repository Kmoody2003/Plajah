// Outbound HTTP for federation, SSRF-hardened with the same gates as /api/link-preview (services/linkPreviewCore):
// static URL shape check (https only here), DNS lookup that validates EVERY resolved address and pins the socket to
// it (no rebinding gap), every redirect hop re-checked, size cap, hard timeout. Exposed behind the ApHttp interface
// so the inbox/delivery logic can be tested with a fake.

import * as https from 'node:https';
import { lookup as dnsLookupCb } from 'node:dns';
import { promisify } from 'node:util';
import { checkUrlShape, resolveRedirect, isBlockedIp } from '../linkPreviewCore';

export interface ApHttpResponse { status: number; body: string; contentType?: string }
export interface ApHttp {
  /** GET (optionally with signed headers) → parsed JSON or null. */
  getJson(url: string, headers?: Record<string, string>): Promise<{ status: number; json: any | null }>;
  /** POST a body with the given (already signed) headers. Never follows redirects. */
  post(url: string, body: string, headers: Record<string, string>): Promise<ApHttpResponse>;
}

export const MAX_AP_BODY = 1_000_000;
export const AP_TIMEOUT_MS = 10_000;
const UA = 'Plajah/1.0 (+https://plajah.com; ActivityPub)';

/** Federation targets must be https and pass the link-preview SSRF screen. */
export function checkFederationUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  const c = checkUrlShape(raw);
  if (!c.ok) return c;
  if (c.url.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  if (c.url.port && c.url.port !== '443' && c.url.port !== '8443') return { ok: false, reason: 'bad-port' };
  return c;
}

const dnsLookup = promisify(dnsLookupCb) as (host: string, opts: { all: true }) => Promise<Array<{ address: string; family: number }>>;
function safeLookup(host: string, options: any, cb: (err: Error | null, address?: any, family?: number) => void): void {
  dnsLookup(host, { all: true }).then(addrs => {
    if (!addrs.length || addrs.some(a => isBlockedIp(a.address))) return cb(new Error('blocked-address'));
    if (options?.all) return cb(null, addrs.map(x => ({ address: x.address, family: x.family })));
    cb(null, addrs[0].address, addrs[0].family);
  }).catch(e => cb(e));
}

function requestOnce(u: URL, method: 'GET' | 'POST', headers: Record<string, string>, body?: string): Promise<ApHttpResponse & { location?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(u, {
      method, lookup: safeLookup as any, timeout: AP_TIMEOUT_MS,
      headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity', ...headers, ...(body !== undefined ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
    }, resp => {
      const status = resp.statusCode || 0;
      const location = typeof resp.headers.location === 'string' ? resp.headers.location : undefined;
      const contentType = resp.headers['content-type'];
      const chunks: Buffer[] = []; let size = 0; let done = false;
      const finish = () => { if (done) return; done = true; resolve({ status, location, contentType, body: Buffer.concat(chunks).toString('utf8') }); };
      resp.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_AP_BODY) { resp.destroy(); return; }
        chunks.push(c);
      });
      resp.on('end', finish); resp.on('close', finish); resp.on('error', finish);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export function createSafeHttp(): ApHttp {
  return {
    async getJson(url, headers = {}) {
      const first = checkFederationUrl(url);
      if (!first.ok) return { status: 0, json: null };
      let current = first.url;
      for (let hop = 0; hop <= 3; hop++) {
        let r;
        try {
          r = await requestOnce(current, 'GET', { Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"', ...headers });
        } catch { return { status: 0, json: null }; }
        if (r.status >= 300 && r.status < 400) {
          const next = resolveRedirect(current, r.location);
          if (!next.ok || next.url.protocol !== 'https:') return { status: r.status, json: null };
          current = next.url; continue;
        }
        if (r.status < 200 || r.status >= 300) return { status: r.status, json: null };
        try { return { status: r.status, json: JSON.parse(r.body) }; } catch { return { status: r.status, json: null }; }
      }
      return { status: 0, json: null };
    },
    async post(url, body, headers) {
      const c = checkFederationUrl(url);
      if (!c.ok) return { status: 0, body: (c as { reason?: string }).reason || 'blocked' };
      try {
        const r = await requestOnce(c.url, 'POST', headers, body);
        return { status: r.status, body: r.body.slice(0, 2000), contentType: r.contentType };
      } catch (e: any) {
        return { status: 0, body: String(e?.message || e).slice(0, 200) };
      }
    },
  };
}
