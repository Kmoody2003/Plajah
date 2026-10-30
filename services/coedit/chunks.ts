// services/coedit/chunks.ts — gzipped JSON split across Firestore docs (snapshots, versions, big values).
//
// A Firestore doc holds at most ~1 MiB, so a project snapshot is gzipped, base64'd and spread over
// coedit/{projectId}/chunks/{key}_{i}. Keys are generation-unique, so a reader never sees a mix of
// an old and a new snapshot: the pointer doc flips only after every chunk of the new one is written.

import { collection, deleteDoc, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { opsDb } from '../firebase';
import { COEDIT } from './project';

const CHUNK_CHARS = 700_000;

export async function gzipB64(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return `r:${btoa(unescape(encodeURIComponent(text)))}`;
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `g:${btoa(bin)}`;
}

export async function gunzipB64(data: string): Promise<string> {
  if (data.startsWith('r:')) return decodeURIComponent(escape(atob(data.slice(2))));
  const bin = atob(data.slice(2));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const chunkRef = (projectId: string, key: string, i: number) => doc(opsDb, COEDIT, projectId, 'chunks', `${key}_${i}`);

/** Writes JSON under `key`; returns how many chunks and the compressed size. */
export async function writeChunks(projectId: string, key: string, json: string): Promise<{ chunks: number; size: number }> {
  const data = await gzipB64(json);
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_CHARS) parts.push(data.slice(i, i + CHUNK_CHARS));
  if (!parts.length) parts.push('');
  // One chunk per batch keeps every write well under the request size cap.
  for (let i = 0; i < parts.length; i++) await setDoc(chunkRef(projectId, key, i), { d: parts[i], n: parts.length });
  return { chunks: parts.length, size: data.length };
}

export async function readChunks(projectId: string, key: string, chunks: number): Promise<string> {
  const parts = await Promise.all(
    Array.from({ length: chunks }, async (_, i) => {
      const s = await getDoc(chunkRef(projectId, key, i));
      if (!s.exists()) throw new Error(`missing chunk ${key}_${i}`);
      return String(s.data().d ?? '');
    })
  );
  return gunzipB64(parts.join(''));
}

export async function deleteChunks(projectId: string, key: string, chunks: number): Promise<void> {
  if (chunks <= 0) return;
  if (chunks === 1) {
    await deleteDoc(chunkRef(projectId, key, 0)).catch(() => {});
    return;
  }
  const b = writeBatch(opsDb);
  for (let i = 0; i < chunks; i++) b.delete(chunkRef(projectId, key, i));
  await b.commit().catch(() => {});
}

export const chunksCollection = (projectId: string) => collection(opsDb, COEDIT, projectId, 'chunks');
