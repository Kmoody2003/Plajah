// Large reader bundles: gzip JSON in Cloud Storage, referenced from a small Firestore manifest. PURE (no React / Firebase / node-only APIs),
// so the publisher script, the reader and the tests all share one implementation. Format and policy: docs/LIVING_PUBLISHING.md.
//
// Why: a living picture book carries 50-250 vector objects per page (a 14-page book is 0.8-4 MB of JSON, ~10x smaller gzipped), far beyond the
// 900 KB the classic path puts inline (`telaVersions/{id}.bundleJson`, MAX_BUNDLE_BYTES). So the bundle is gzipped and stored as ONE
// Cloud Storage object (public tokenized URL, the same pattern as the showcase page images) and `telaVersions/{versionId}` holds only
// a manifest: where it is, how big, and its SHA-256, so a reader can prove it got the exact bytes the publisher wrote.
//
// Reader contract: follow `bundleUrl` -> check byteLength + sha256 of the downloaded (compressed) bytes -> gunzip -> parse -> check the
// bundle's identity (bookId/versionId) -> cache the JSON in IndexedDB (immutable per versionId). ANY failure returns null and the reader
// falls back to the album's flat pages (bookChapters), which always stay in place.

import type { BookTelaBundle } from './upgrade';

export const LIVING_BUNDLE_FORMAT = 'plajah.living-bundle/1' as const;
/** Hard limits the reader and the publisher both enforce (compressed bytes / uncompressed bytes). */
export const MAX_STORED_BUNDLE_BYTES = 8_000_000;
export const MAX_STORED_BUNDLE_RAW_BYTES = 48_000_000;

/** `albums/{albumId}/telaVersions/{versionId}` when the bundle lives in Cloud Storage. Write-once like every version doc. */
export interface TelaVersionManifest {
  format: typeof LIVING_BUNDLE_FORMAT;
  versionId: string;
  bookId: string;
  ownerId: string;
  createdAt: number;
  label?: string;
  /** Tokenized public download URL of the gzip object. */
  bundleUrl: string;
  encoding: 'gzip';
  /** Size of the stored (gzip) object. */
  byteLength: number;
  /** SHA-256 (hex) of the stored (gzip) bytes: what the reader verifies. */
  sha256: string;
  /** Size / SHA-256 (hex) of the uncompressed JSON: lets the publisher tell "same content" without trusting gzip output. */
  rawByteLength: number;
  rawSha256: string;
  pageCount: number;
  hasLiving: boolean;
  /** The flat page images the album keeps as the export version and the fallback (informational). */
  flatPages: string[];
}

const te = new TextEncoder();
const td = new TextDecoder();

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle is not available (needs https), cannot verify the bundle');
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}

async function pump(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader(); const parts: Uint8Array[] = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; if (value) { parts.push(value); n += value.length; } }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const through = (bytes: Uint8Array, t: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }) => {
  const w = t.writable.getWriter(); void w.write(bytes as unknown as Uint8Array).then(() => w.close()).catch(() => { /* surfaced by the read side */ });
  return pump(t.readable);
};
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream is not available');
  return through(bytes, new CompressionStream('gzip') as unknown as { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> });
}
export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is not available');
  return through(bytes, new DecompressionStream('gzip') as unknown as { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> });
}

export interface EncodedBundle { bytes: Uint8Array; byteLength: number; sha256: string; rawByteLength: number; rawSha256: string; json: string }

/** JSON -> gzip -> hashes. Throws when over the limits. Deterministic for identical input in one runtime. */
export async function encodeBundle(bundle: BookTelaBundle): Promise<EncodedBundle> {
  const json = JSON.stringify(bundle);
  const raw = te.encode(json);
  if (raw.length > MAX_STORED_BUNDLE_RAW_BYTES) throw new Error(`bundle JSON is ${raw.length} bytes, over the ${MAX_STORED_BUNDLE_RAW_BYTES} limit`);
  const bytes = await gzipBytes(raw);
  if (bytes.length > MAX_STORED_BUNDLE_BYTES) throw new Error(`gzip bundle is ${bytes.length} bytes, over the ${MAX_STORED_BUNDLE_BYTES} limit`);
  return { bytes, byteLength: bytes.length, sha256: await sha256Hex(bytes), rawByteLength: raw.length, rawSha256: await sha256Hex(raw), json };
}

export function buildManifest(i: { bundle: BookTelaBundle; encoded: EncodedBundle; bundleUrl: string; ownerId: string; flatPages: string[]; label?: string }): TelaVersionManifest {
  const { bundle, encoded } = i;
  return {
    format: LIVING_BUNDLE_FORMAT, versionId: bundle.versionId, bookId: bundle.bookId, ownerId: i.ownerId, createdAt: bundle.createdAt,
    ...(i.label ? { label: i.label } : {}),
    bundleUrl: i.bundleUrl, encoding: 'gzip', byteLength: encoded.byteLength, sha256: encoded.sha256, rawByteLength: encoded.rawByteLength, rawSha256: encoded.rawSha256,
    pageCount: bundle.doc.frames.length, hasLiving: !!bundle.doc.living && bundle.doc.living.pages.some(p => p.behaviors.length > 0),
    flatPages: i.flatPages,
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Shape check of a Firestore doc (untrusted: a version doc is data written by the author). */
export function isTelaVersionManifest(d: unknown): d is TelaVersionManifest {
  if (!d || typeof d !== 'object') return false;
  const m = d as Record<string, unknown>;
  return m.format === LIVING_BUNDLE_FORMAT && isStr(m.versionId) && isStr(m.bookId) && isStr(m.bundleUrl) && m.encoding === 'gzip'
    && isNum(m.byteLength) && m.byteLength > 0 && m.byteLength <= MAX_STORED_BUNDLE_BYTES && isNum(m.rawByteLength) && m.rawByteLength <= MAX_STORED_BUNDLE_RAW_BYTES
    && /^[0-9a-f]{64}$/.test(String(m.sha256)) && /^[0-9a-f]{64}$/.test(String(m.rawSha256)) && isNum(m.createdAt) && isNum(m.pageCount);
}

/** Only https URLs of Firebase / Google Cloud Storage, so a tampered manifest cannot point a reader at an arbitrary host. */
export function isTrustedBundleUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'firebasestorage.googleapis.com' || x.hostname === 'storage.googleapis.com' || x.hostname.endsWith('.firebasestorage.app')); }
  catch { return false; }
}

export class BundleVerifyError extends Error { constructor(public reason: 'length' | 'hash' | 'gzip' | 'json' | 'shape' | 'identity', msg: string) { super(msg); } }

/** Verify downloaded bytes against the manifest and parse them. Throws BundleVerifyError. */
export async function decodeBundle(bytes: Uint8Array, m: TelaVersionManifest, expect?: { bookId?: string }): Promise<{ bundle: BookTelaBundle; json: string }> {
  if (bytes.length !== m.byteLength) throw new BundleVerifyError('length', `expected ${m.byteLength} bytes, got ${bytes.length}`);
  if ((await sha256Hex(bytes)) !== m.sha256) throw new BundleVerifyError('hash', 'SHA-256 does not match the manifest');
  let raw: Uint8Array;
  try { raw = await gunzipBytes(bytes); } catch (e) { throw new BundleVerifyError('gzip', `cannot gunzip: ${(e as Error).message}`); }
  if (raw.length !== m.rawByteLength) throw new BundleVerifyError('length', `expected ${m.rawByteLength} raw bytes, got ${raw.length}`);
  const json = td.decode(raw);
  let bundle: BookTelaBundle;
  try { bundle = JSON.parse(json) as BookTelaBundle; } catch (e) { throw new BundleVerifyError('json', `bundle is not JSON: ${(e as Error).message}`); }
  if (!bundle || bundle.schemaVersion !== 1 || !bundle.doc || !Array.isArray(bundle.doc.frames) || !bundle.doc.devices || !Array.isArray(bundle.toc) || !bundle.book) throw new BundleVerifyError('shape', 'not a book reader bundle');
  if (bundle.versionId !== m.versionId || (expect?.bookId && bundle.bookId !== expect.bookId)) throw new BundleVerifyError('identity', 'bundle belongs to a different book or version than its manifest');
  return { bundle, json };
}

/** Download + verify. Returns null (never throws) so a caller can fall back to the flat pages. `onFail` receives the reason for logs/tests. */
export async function fetchBundleFromManifest(m: TelaVersionManifest, o: { fetchImpl?: typeof fetch; expectBookId?: string; onFail?: (why: string) => void } = {}): Promise<{ bundle: BookTelaBundle; json: string } | null> {
  const fail = (why: string) => { o.onFail?.(why); return null; };
  if (!isTrustedBundleUrl(m.bundleUrl)) return fail('untrusted bundle URL');
  try {
    const r = await (o.fetchImpl ?? fetch)(m.bundleUrl);
    if (!r.ok) return fail(`HTTP ${r.status}`);
    return await decodeBundle(new Uint8Array(await r.arrayBuffer()), m, { bookId: o.expectBookId });
  } catch (e) { return fail(e instanceof BundleVerifyError ? `${e.reason}: ${e.message}` : (e as Error).message); }
}

/** The reader's decision for one `telaVersions/{versionId}` doc: inline `bundleJson` (classic, < 950 KB) or a manifest (stored gzip object). null = unavailable -> flat pages. */
export async function bundleFromVersionDoc(albumId: string, data: Record<string, unknown>, o: { fetchImpl?: typeof fetch; onFail?: (why: string) => void } = {}): Promise<{ bundle: BookTelaBundle; json: string } | null> {
  if (typeof data.bundleJson === 'string' && data.bundleJson) {
    try { return { bundle: JSON.parse(data.bundleJson) as BookTelaBundle, json: data.bundleJson }; } catch { o.onFail?.('inline bundleJson is not JSON'); return null; }
  }
  if (!isTelaVersionManifest(data)) { o.onFail?.('version doc is neither an inline bundle nor a manifest'); return null; }
  return fetchBundleFromManifest(data, { fetchImpl: o.fetchImpl, expectBookId: albumId, onFail: o.onFail });
}
