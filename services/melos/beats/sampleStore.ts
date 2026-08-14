// Melos Beats — sample persistence. Content-addressed OPFS cache (instant offline reopen) with
// a durable copy in the owner's private locker (survives eviction / new devices). Wraps the
// canonical OPFS layer in services/fabula/mediaStore.ts; keys are `melos/beats/samples/{sha256}`
// so identical samples dedupe across grooves for free.

import { putBytes, getBytes, hasBytes } from '../../fabula/mediaStore';
import { uploadFile } from '../../backendService';
import { auth } from '../../firebase';
import type { SampleRef } from './grooveDoc';

const keyFor = (hash: string) => `melos/beats/samples/${hash}`;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ingest a local file: hash → OPFS put (dedupe) → decode. Locker backup happens separately
 * (see backupToLocker) so ingest stays instant and works signed-out.
 */
export async function ingestSample(file: File | Blob, name: string, ctx: BaseAudioContext): Promise<{ ref: SampleRef; buffer: AudioBuffer } | null> {
  try {
    const bytes = await file.arrayBuffer();
    const hash = await sha256Hex(bytes);
    const key = keyFor(hash);
    if (!(await hasBytes(key))) await putBytes(key, new Blob([bytes], { type: (file as File).type || 'application/octet-stream' }));
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    return { ref: { key, name, durationSec: buffer.duration }, buffer };
  } catch (e) {
    console.warn('[beats] sample ingest failed', e);
    return null;
  }
}

/** Push a durable copy to the private locker; returns the URL (or null when signed out/offline). */
export async function backupToLocker(ref: SampleRef): Promise<string | null> {
  const user = auth.currentUser;
  if (!user || ref.lockerUrl) return ref.lockerUrl || null;
  try {
    const blob = await getBytes(ref.key);
    if (!blob) return null;
    const hash = ref.key.split('/').pop();
    const safeName = ref.name.replace(/[^\w.-]+/g, '_').slice(0, 48);
    return await uploadFile(`personal/${user.uid}/melos/beats/samples/${hash}_${safeName}`, blob);
  } catch {
    return null; // best-effort: OPFS still has it
  }
}

/**
 * Resolve a SampleRef to a decoded buffer: OPFS first, locker URL as the re-hydration fallback
 * (fresh device / evicted OPFS). A locker fetch re-seeds OPFS so the next open is instant.
 */
export async function hydrateSample(ref: SampleRef, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    let blob = await getBytes(ref.key);
    if (!blob && ref.lockerUrl) {
      const res = await fetch(ref.lockerUrl);
      if (res.ok) {
        blob = await res.blob();
        void putBytes(ref.key, blob);
      }
    }
    if (!blob) return null;
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch (e) {
    console.warn('[beats] sample hydrate failed', ref.name, e);
    return null;
  }
}

/** Keep OPFS from silent eviction where the browser allows it. Fire-and-forget. */
export function requestPersistentStorage(): void {
  try { void navigator.storage?.persist?.(); } catch { /* unsupported */ }
}
