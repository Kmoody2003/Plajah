// localRecordingStore — crash-safe, on-device copy of a live stream, written AS it
// records so a failed upload (or a closed tab, or a dead network) never loses the video.
//
// Why this exists: Reello's live recorder only ever held the video as an in-memory Blob.
// If the post-stream upload to Mux/Firebase failed, or the tab crashed mid-stream, the
// recording was gone. Now every MediaRecorder chunk is committed durably the instant it
// arrives, so the stream survives to be re-uploaded or downloaded later.
//
// Durability model: each ~1s chunk is written as its own IndexedDB entry inside its own
// transaction, which is durably committed before the next chunk — so a crash at any point
// keeps everything up to the last completed second. IndexedDB is available in every browser
// AND the Android System WebView the APK runs in (unlike showSaveFilePicker, which is
// desktop-only). Optionally we ALSO stream to a user-picked file (desktop File System
// Access) so power users get the exact file at the exact path they chose.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

export interface LocalRecordingMeta {
  id: string;
  title: string;
  mime: string;
  startedAt: number;
  updatedAt: number;
  chunks: number;
  bytes: number;
  uploaded?: boolean;
  streamId?: string;
  /** true when the user also chose a real file on disk (desktop) — no need to offer download. */
  toFile?: boolean;
}

const INDEX_KEY = 'plajah:liveRec:index';
const metaKey = (id: string) => `plajah:liveRec:meta:${id}`;
const chunkKey = (id: string, seq: number) => `plajah:liveRec:chunk:${id}:${String(seq).padStart(6, '0')}`;

async function readIndex(): Promise<string[]> {
  try { return ((await idbGet(INDEX_KEY)) as string[]) || []; } catch { return []; }
}
async function writeIndex(ids: string[]): Promise<void> {
  try { await idbSet(INDEX_KEY, ids); } catch { /* */ }
}

/** A live handle you feed MediaRecorder chunks into. Each write is durable on return. */
export class LiveRecordingSink {
  private seq = 0;
  private closed = false;
  private writeChain: Promise<void> = Promise.resolve();
  constructor(public meta: LocalRecordingMeta, private fileWritable: FileSystemWritableFileStream | null) {}

  /** Persist one recorder chunk. Serialized so IDB writes commit in order even under
   *  back-to-back chunks. Resolves once this chunk is durably stored. */
  write(chunk: Blob): Promise<void> {
    if (this.closed || !chunk || !chunk.size) return Promise.resolve();
    const seq = this.seq++;
    this.writeChain = this.writeChain.then(async () => {
      if (!this.meta.mime && chunk.type) this.meta.mime = chunk.type;
      try { await idbSet(chunkKey(this.meta.id, seq), chunk); } catch { /* quota / private mode */ }
      if (this.fileWritable) { try { await this.fileWritable.write(chunk); } catch { /* disk full / revoked */ } }
      this.meta.chunks = seq + 1;
      this.meta.bytes += chunk.size;
      this.meta.updatedAt = Date.now();
      try { await idbSet(metaKey(this.meta.id), this.meta); } catch { /* */ }
    }).catch(() => {});
    return this.writeChain;
  }

  get id(): string { return this.meta.id; }
  get bytes(): number { return this.meta.bytes; }

  /** Finish writing. `uploaded` records whether the cloud copy succeeded, so recovery
   *  only surfaces recordings that still need saving. */
  async close(uploaded = false): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.writeChain.catch(() => {});
    this.meta.uploaded = uploaded;
    this.meta.updatedAt = Date.now();
    try { await idbSet(metaKey(this.meta.id), this.meta); } catch { /* */ }
    if (this.fileWritable) { try { await this.fileWritable.close(); } catch { /* */ } }
    this.fileWritable = null;
  }
}

export interface StartLocalRecordingOpts {
  title: string;
  mime?: string;
  streamId?: string;
  /** A writable from pickRecordingFile() to ALSO mirror chunks into a user-chosen file. */
  fileWritable?: FileSystemWritableFileStream | null;
}

/** Begin a durable on-device recording. Returns a sink you feed chunks into.
 *  Randomness/time are fine here — this is app runtime code, not a workflow script. */
export async function startLocalRecording(opts: StartLocalRecordingOpts): Promise<LiveRecordingSink> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta: LocalRecordingMeta = {
    id,
    title: opts.title,
    mime: opts.mime || '',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    chunks: 0,
    bytes: 0,
    streamId: opts.streamId,
    toFile: !!opts.fileWritable,
  };
  try { await idbSet(metaKey(id), meta); } catch { /* */ }
  const idx = await readIndex();
  if (!idx.includes(id)) { idx.push(id); await writeIndex(idx); }
  return new LiveRecordingSink(meta, opts.fileWritable ?? null);
}

/** Reassemble a stored recording into one Blob (for upload retry or download). */
export async function assembleLocalRecording(id: string): Promise<Blob | null> {
  const meta = (await idbGet(metaKey(id))) as LocalRecordingMeta | undefined;
  if (!meta || !meta.chunks) return null;
  const parts: Blob[] = [];
  for (let s = 0; s < meta.chunks; s++) {
    const c = (await idbGet(chunkKey(id, s))) as Blob | undefined;
    if (c && c.size) parts.push(c);
  }
  if (!parts.length) return null;
  return new Blob(parts, { type: meta.mime || 'video/webm' });
}

export async function getLocalRecordingMeta(id: string): Promise<LocalRecordingMeta | null> {
  return ((await idbGet(metaKey(id))) as LocalRecordingMeta) || null;
}

export async function listLocalRecordings(): Promise<LocalRecordingMeta[]> {
  const idx = await readIndex();
  const metas = await Promise.all(idx.map(id => idbGet(metaKey(id)) as Promise<LocalRecordingMeta | undefined>));
  return metas.filter(Boolean) as LocalRecordingMeta[];
}

/** Recordings that still need saving: not uploaded, have real bytes, not just written to a file. */
export async function listPendingLocalRecordings(): Promise<LocalRecordingMeta[]> {
  return (await listLocalRecordings()).filter(m => !m.uploaded && m.bytes > 0);
}

export async function deleteLocalRecording(id: string): Promise<void> {
  const meta = (await idbGet(metaKey(id))) as LocalRecordingMeta | undefined;
  const n = meta?.chunks ?? 0;
  for (let s = 0; s < n; s++) { try { await idbDel(chunkKey(id, s)); } catch { /* */ } }
  try { await idbDel(metaKey(id)); } catch { /* */ }
  const idx = await readIndex();
  await writeIndex(idx.filter(x => x !== id));
}

/** Mark a recording as safely uploaded to the cloud (so recovery stops offering it). */
export async function markLocalRecordingUploaded(id: string): Promise<void> {
  const meta = (await idbGet(metaKey(id))) as LocalRecordingMeta | undefined;
  if (!meta) return;
  meta.uploaded = true;
  try { await idbSet(metaKey(id), meta); } catch { /* */ }
}

/** Trigger a browser download of an assembled recording. In the Android WebView this
 *  lands in the system Downloads folder; on desktop the browser's save dialog opens. */
export async function downloadLocalRecording(id: string, filename?: string): Promise<boolean> {
  const blob = await assembleLocalRecording(id);
  if (!blob) return false;
  const meta = await getLocalRecordingMeta(id);
  const name = filename || `${(meta?.title || 'live').replace(/[^\w.\-]+/g, '_')}-${id}.webm`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* */ } }, 10_000);
  return true;
}

/** Whether this browser can let the user pick an exact file on disk (desktop Chromium). */
export function supportsFilePicker(): boolean {
  return typeof (window as any).showSaveFilePicker === 'function';
}

/** Open the OS save dialog and return a writable. MUST be called from a user gesture
 *  (e.g. a button click), so do it when the user picks "save to a file" — not later. */
export async function pickRecordingFile(suggestedName: string): Promise<FileSystemWritableFileStream | null> {
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }],
    });
    return await handle.createWritable();
  } catch { return null; }
}
