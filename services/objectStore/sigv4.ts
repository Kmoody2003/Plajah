// services/objectStore/sigv4.ts — AWS Signature V4 presigned URLs for any S3-compatible store.
//
// Backblaze B2 today, Cloudflare R2 or anything else S3-shaped later: only the endpoint, region and keys
// change. Server-only (node:crypto); the browser never sees a key, only a URL that works for a few minutes.
//
// Headers passed in `headers` are signed, so the store rejects a request whose Content-Type or
// Content-Length differs from what the server approved — that's how an upload's size cap is enforced.

import { createHash, createHmac } from 'node:crypto';

export interface PresignInput {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  /** https://s3.us-east-005.backblazeb2.com */
  endpoint: string;
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  now?: Date;
  /** Extra headers the request must carry exactly (lower-case names). */
  headers?: Record<string, string>;
  /** Extra query parameters, e.g. response-content-disposition. */
  query?: Record<string, string>;
  /** bucket.host/key instead of host/bucket/key. */
  virtualHost?: boolean;
}

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (key: string) => key.split('/').map(enc).join('/');
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest();

export function presignUrl(p: PresignInput): string {
  const base = new URL(p.endpoint);
  const host = p.virtualHost ? `${p.bucket}.${base.host}` : base.host;
  const path = p.virtualHost ? `/${encPath(p.key)}` : `/${enc(p.bucket)}/${encPath(p.key)}`;
  const amzDate = (p.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${p.region}/s3/aws4_request`;

  const headers: Record<string, string> = { host };
  for (const [k, v] of Object.entries(p.headers ?? {})) headers[k.toLowerCase()] = String(v).trim();
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604_800, Math.round(p.expiresSec)))),
    'X-Amz-SignedHeaders': signedHeaders,
    ...(p.query ?? {}),
  };
  const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');

  const canonical = [p.method, path, qs, names.map((n) => `${n}:${headers[n]}\n`).join(''), signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, day), p.region), 's3'), 'aws4_request');
  const sig = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  return `${base.protocol}//${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}
