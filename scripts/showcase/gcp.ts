// Tiny REST helpers for the showcase scripts: Firestore documents + Cloud Storage objects, authenticated as the signed-in gcloud user
// (`gcloud auth print-access-token`, the same as scripts/showcase/publishBooks.ts and scripts/council/*). Writes go to the PRODUCTION database,
// so every script that imports this defaults to a DRY RUN.
import { execSync } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { toFields, fromFields } from '../../services/safety/safetyServerIo';

export const PROJECT = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
export const DB = process.env.FIREBASE_DB_ID || 'plajah-prod';
export const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
export const OWNER_UID = process.env.SHOWCASE_OWNER_UID || 'hiP7PGj15eTq0r0ZH2XwN00AS2h1';
export const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');

let tok = '', tokAt = 0;
export async function headers(json = true): Promise<Record<string, string>> {
  if (!tok || Date.now() - tokAt > 25 * 60e3) { tok = execSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as never).toString().trim(); tokAt = Date.now(); }
  return { Authorization: `Bearer ${tok}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

export async function getDoc(p: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${FS}/${p}`, { headers: await headers(false) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return fromFields(((await r.json()) as any).fields || {});
}
/** Anonymous read (no token): what a signed-out reader would get, so Firestore RULES apply. Returns the HTTP status and the doc when readable. */
export async function getDocAnonymous(p: string): Promise<{ status: number; doc: Record<string, any> | null }> {
  const r = await fetch(`${FS}/${p}`);
  if (!r.ok) return { status: r.status, doc: null };
  return { status: r.status, doc: fromFields(((await r.json()) as any).fields || {}) };
}
export async function listDocIds(collectionPath: string): Promise<string[]> {
  const r = await fetch(`${FS}/${collectionPath}?pageSize=100`, { headers: await headers(false) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`LIST ${collectionPath}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (((await r.json()) as any).documents ?? []).map((d: any) => String(d.name).split('/').pop());
}
export async function putDoc(p: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${FS}/${p}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
/** Set only these top-level fields (others untouched). */
export async function patchFields(p: string, data: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${FS}/${p}?${mask}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
/** Remove these top-level fields (mask names them, body omits them). */
export async function deleteFields(p: string, names: string[]): Promise<void> {
  const mask = names.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${FS}/${p}?${mask}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: {} }) });
  if (!r.ok) throw new Error(`PATCH(delete fields) ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
export async function deleteDoc(p: string): Promise<void> {
  const r = await fetch(`${FS}/${p}`, { method: 'DELETE', headers: await headers(false) });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Upload one object with a Firebase download token so the URL works for everyone regardless of storage read rules. */
export async function upload(objectPath: string, bytes: Uint8Array, contentType: string, cacheControl = 'public, max-age=31536000, immutable'): Promise<string> {
  const token = crypto.randomUUID();
  const boundary = 'b' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name: objectPath, contentType, cacheControl, metadata: { firebaseStorageDownloadTokens: token, source: 'plajah-showcase-living' } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, {
    method: 'POST', headers: { ...(await headers(false)), 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}
export async function listObjects(prefix: string): Promise<string[]> {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: await headers(false) });
  if (!r.ok) throw new Error(`list ${prefix}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (((await r.json()) as any).items ?? []).map((i: any) => String(i.name));
}
export async function deleteObject(objectPath: string): Promise<void> {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}`, { method: 'DELETE', headers: await headers(false) });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${objectPath}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}
