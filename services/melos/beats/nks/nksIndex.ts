// NKS content indexing (tier 3). Pick a Komplete/NKS content folder with the File System
// Access API, walk it for .nksf/.nksn, decode the NISI (summary) and NICA (controller) chunks
// from MessagePack, and cache the index in IndexedDB. The directory HANDLE is cached too, but
// browsers require a user gesture to re-grant permission each session — hence the explicit
// "Reconnect library" flow (the index itself browses fine without it; previews need the grant).

import { decode } from '@msgpack/msgpack';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { parseRiff, msgpackPayload } from './riff';
import { NKS_HANDLE_KEY, NKS_IDB_KEY, type NksIndexState, type NksItem } from './types';

// Minimal structural typing for the File System Access API (not in the repo's TS lib target).
type FsHandle = {
  name: string;
  kind: 'file' | 'directory';
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FsHandle>;
  getFile?: () => Promise<File>;
  getDirectoryHandle?: (name: string) => Promise<FsHandle>;
};

export const nksSupported = (): boolean => typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : []);

/** NISI is a MessagePack map; NI has shipped a few key spellings, so accept the known aliases. */
function readNisi(payload: Uint8Array, fallbackName: string): Partial<NksItem> {
  try {
    const raw = decode(payload) as Record<string, unknown>;
    const types = Array.isArray(raw.types)
      ? (raw.types as unknown[]).map((t) => (Array.isArray(t) ? t.filter((x) => typeof x === 'string') as string[] : [String(t)]))
      : [];
    return {
      name: str(raw.name) || fallbackName,
      vendor: str(raw.vendor) || str(raw.company),
      author: str(raw.author),
      comment: str(raw.comment),
      bankchain: strArr(raw.bankchain),
      types,
      modes: strArr(raw.modes),
      uuid: str(raw.uuid),
      deviceType: str(raw.deviceType),
    };
  } catch {
    return { name: fallbackName };
  }
}

/** NICA holds knob pages: { ni8: [ [ {name, section, …} × 8 ] × pages ] } (shape varies). */
function readNica(payload: Uint8Array): string[] {
  try {
    const raw = decode(payload) as Record<string, unknown>;
    const pages = (raw.ni8 || raw.NI8 || Object.values(raw)[0]) as unknown;
    if (!Array.isArray(pages) || !pages.length) return [];
    const page1 = pages[0];
    if (!Array.isArray(page1)) return [];
    return page1.map((p) => (p && typeof p === 'object' ? str((p as Record<string, unknown>).name) : '')).slice(0, 8);
  } catch {
    return [];
  }
}

export async function pickNksLibrary(): Promise<FsHandle | null> {
  if (!nksSupported()) return null;
  try {
    const handle = await (window as unknown as { showDirectoryPicker: (o: { mode: string }) => Promise<FsHandle> })
      .showDirectoryPicker({ mode: 'read' });
    await idbSet(NKS_HANDLE_KEY, handle); // handles are structured-cloneable
    return handle;
  } catch {
    return null; // user cancelled
  }
}

/** The cached handle, re-granting permission if the (gesture-initiated) prompt is allowed. */
export async function reconnectNksLibrary(): Promise<FsHandle | null> {
  try {
    const handle = await idbGet<FsHandle>(NKS_HANDLE_KEY);
    if (!handle) return null;
    const q = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (q === 'granted') return handle;
    const r = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
    return r === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

export async function loadNksIndex(): Promise<NksIndexState | null> {
  try { return (await idbGet<NksIndexState>(NKS_IDB_KEY)) || null; } catch { return null; }
}

export async function clearNksIndex(): Promise<void> {
  try { await idbDel(NKS_IDB_KEY); await idbDel(NKS_HANDLE_KEY); } catch { /* */ }
}

/**
 * Walk the library and build the index. onProgress fires as files are read so a big Komplete
 * folder shows movement. Preview .ogg siblings live in a `.previews` subfolder next to the file.
 */
export async function scanNksLibrary(
  root: FsHandle,
  onProgress?: (found: number, current: string) => void,
  maxFiles = 20000,
): Promise<NksIndexState> {
  const items: NksItem[] = [];
  let fileCount = 0;
  let skipped = 0;

  const walk = async (dir: FsHandle, prefix: string): Promise<void> => {
    if (items.length >= maxFiles) return;
    const previews = new Set<string>();
    const entries: FsHandle[] = [];
    try { for await (const h of dir.values?.() ?? []) entries.push(h); } catch { return; }

    // Collect preview names first so items can point at them.
    const previewDir = entries.find((e) => e.kind === 'directory' && e.name === '.previews');
    if (previewDir) {
      try { for await (const p of previewDir.values?.() ?? []) previews.add(p.name); } catch { /* */ }
    }

    for (const entry of entries) {
      if (items.length >= maxFiles) return;
      if (entry.kind === 'directory') {
        if (entry.name === '.previews') continue;
        await walk(entry, `${prefix}${entry.name}/`);
        continue;
      }
      if (!/\.(nksf|nksn|nkm)$/i.test(entry.name)) continue;
      fileCount++;
      try {
        const file = await entry.getFile!();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const riff = parseRiff(bytes);
        if (!riff || !riff.chunks.NISI) { skipped++; continue; }
        const base = entry.name.replace(/\.[^.]+$/, '');
        const meta = readNisi(msgpackPayload(riff.chunks.NISI), base);
        const macros = riff.chunks.NICA ? readNica(msgpackPayload(riff.chunks.NICA)) : [];
        const previewName = [`${entry.name}.ogg`, `${base}.ogg`, `${base}.previews.ogg`].find((n) => previews.has(n));
        items.push({
          path: `${prefix}${entry.name}`,
          name: meta.name || base,
          vendor: meta.vendor || '',
          author: meta.author,
          comment: meta.comment,
          bankchain: meta.bankchain || [],
          types: meta.types || [],
          modes: meta.modes || [],
          uuid: meta.uuid,
          deviceType: meta.deviceType,
          previewPath: previewName ? `${prefix}.previews/${previewName}` : undefined,
          macros,
        });
        if (onProgress && items.length % 25 === 0) onProgress(items.length, entry.name);
      } catch { skipped++; }
    }
  };

  await walk(root, '');
  const state: NksIndexState = { items, scannedAt: Date.now(), rootName: root.name, fileCount, skipped };
  try { await idbSet(NKS_IDB_KEY, state); } catch { /* index still usable in memory */ }
  return state;
}

/** Fetch a preview .ogg as a decoded buffer (needs a live, permission-granted handle). */
export async function loadNksPreview(root: FsHandle, previewPath: string, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const parts = previewPath.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle!(p);
    const fileHandle = await (dir as unknown as { getFileHandle: (n: string) => Promise<FsHandle> }).getFileHandle(fileName);
    const file = await fileHandle.getFile!();
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  }
}
