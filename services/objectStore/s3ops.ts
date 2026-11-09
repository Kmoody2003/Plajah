// services/objectStore/s3ops.ts — the few S3 calls the SERVER makes itself (Drive uploads):
// multipart create / part links / complete / abort, HEAD (true size after upload), DELETE.
// Every request is query-signed with our own SigV4 (sigv4.ts), so there is no AWS SDK.
// Fetch is injected for tests. Server only.

import { presignUrl } from './sigv4';

export interface S3Config { endpoint: string; region: string; bucket: string; keyId: string; appKey: string }

type Fetch = typeof fetch;

const signed = (cfg: S3Config, method: 'GET' | 'PUT' | 'DELETE' | 'HEAD' | 'POST', key: string, expiresSec: number,
  query?: Record<string, string>, headers?: Record<string, string>, now?: Date) =>
  presignUrl({ method, endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, key, accessKeyId: cfg.keyId,
    secretAccessKey: cfg.appKey, expiresSec, query, headers, now });

/** Browser upload link for a small file; Content-Type and Content-Length are signed. */
export const putUrl = (cfg: S3Config, key: string, size: number, contentType: string, expiresSec = 900, now?: Date) =>
  signed(cfg, 'PUT', key, expiresSec, undefined, { 'content-type': contentType, 'content-length': String(size) }, now);

export const getUrl = (cfg: S3Config, key: string, expiresSec = 600, query?: Record<string, string>, now?: Date) =>
  signed(cfg, 'GET', key, expiresSec, query, undefined, now);

const xmlTag = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function createMultipart(cfg: S3Config, key: string, contentType: string, f: Fetch = fetch): Promise<string> {
  const url = signed(cfg, 'POST', key, 300, { uploads: '' }, { 'content-type': contentType });
  const res = await f(url, { method: 'POST', headers: { 'Content-Type': contentType } });
  const body = await res.text();
  if (!res.ok) throw new Error(`multipart create ${res.status}: ${body.slice(0, 200)}`);
  const id = xmlTag(body, 'UploadId');
  if (!id) throw new Error('multipart create: no UploadId');
  return id;
}

/** Link for one part (1..10000). The browser PUTs the bytes and keeps the ETag header it gets back. */
export const partUrl = (cfg: S3Config, key: string, uploadId: string, partNumber: number, expiresSec = 3600, now?: Date) =>
  signed(cfg, 'PUT', key, expiresSec, { partNumber: String(partNumber), uploadId }, undefined, now);

export async function completeMultipart(cfg: S3Config, key: string, uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>, f: Fetch = fetch): Promise<void> {
  const xml = '<CompleteMultipartUpload>' + [...parts].sort((a, b) => a.partNumber - b.partNumber)
    .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEsc(p.etag)}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
  const res = await f(signed(cfg, 'POST', key, 300, { uploadId }), { method: 'POST', body: xml, headers: { 'Content-Type': 'application/xml' } });
  const body = await res.text();
  // S3 can answer 200 with an <Error> body for complete.
  if (!res.ok || /<Error>/.test(body)) throw new Error(`multipart complete ${res.status}: ${body.slice(0, 200)}`);
}

export async function abortMultipart(cfg: S3Config, key: string, uploadId: string, f: Fetch = fetch): Promise<void> {
  await f(signed(cfg, 'DELETE', key, 120, { uploadId }), { method: 'DELETE' }).catch(() => {});
}

/** Size the store actually holds (null = no such object). Never trust the size a client reported. */
export async function headSize(cfg: S3Config, key: string, f: Fetch = fetch): Promise<number | null> {
  const res = await f(signed(cfg, 'HEAD', key, 120), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`head ${res.status}`);
  const n = Number(res.headers.get('content-length'));
  return Number.isFinite(n) ? n : null;
}

export async function deleteObjectServer(cfg: S3Config, key: string, f: Fetch = fetch): Promise<void> {
  await f(signed(cfg, 'DELETE', key, 120), { method: 'DELETE' }).catch(() => {});
}
