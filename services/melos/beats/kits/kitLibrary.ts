// The kit library: folders the user points MEKA at (a Native Instruments content folder, MPC
// expansions, Splice packs, Ableton User Library, Studio One sound sets…), walked with the File
// System Access API into an index of kit files + one-shot samples, cached in IndexedDB.
//
// Kits are only PARSED when opened (scan stays fast on a 100k-file library). Sample paths inside
// kits are written for the machine that saved them ("C:\Users\…\Kick.wav", "../Samples/…"), so
// resolution is: relative to the kit → same path tail anywhere in the library → same file name.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import {
  AUDIO_EXT, KITS_INDEX_KEY, KITS_ROOTS_KEY, USER_KITS_KEY,
  type KitLibraryIndex, type KitSpec, type LibraryKit, type LibrarySample,
} from './types';
import { classifySample, looksLikeKit } from './drumClassify';
import { kitFormatFor, parseFolderKit, parseKitBytes, parseImpact } from './parsers';
import { aiffToWav, zipEntries, zipRead } from './bytes';
import type { UserKit } from './applyKit';

export type FsHandle = {
  name: string;
  kind: 'file' | 'directory';
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FsHandle>;
  getFile?: () => Promise<File>;
  getDirectoryHandle?: (name: string) => Promise<FsHandle>;
  getFileHandle?: (name: string) => Promise<FsHandle>;
};

export const kitLibrarySupported = (): boolean => typeof window !== 'undefined' && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const SKIP_DIRS = /^(\$RECYCLE\.BIN|System Volume Information|node_modules|\.git|__MACOSX|Windows|Program Files \(x86\)|AppData)$/i;
const KIT_FILE = /\.(mxgrp|mxsnd|nbkt|xpm|adg|preset|bwpreset|sfz|h2drumkit|dspreset|sf2|soundset)$|(^|\/)drumkit\.xml$/i;

// ── Roots ────────────────────────────────────────────────────────────────────

export async function loadRoots(): Promise<FsHandle[]> {
  try { return (await idbGet<FsHandle[]>(KITS_ROOTS_KEY)) || []; } catch { return []; }
}
async function saveRoots(roots: FsHandle[]): Promise<void> { try { await idbSet(KITS_ROOTS_KEY, roots); } catch { /* */ } }

/** Pick a library folder and add it to the roots. */
export async function addLibraryFolder(): Promise<FsHandle[] | null> {
  if (!kitLibrarySupported()) return null;
  try {
    const h = await (window as unknown as { showDirectoryPicker: (o: { mode: string; id?: string }) => Promise<FsHandle> })
      .showDirectoryPicker({ mode: 'read', id: 'meka-kits' });
    const roots = await loadRoots();
    if (!roots.some((r) => r.name === h.name)) roots.push(h); else roots[roots.findIndex((r) => r.name === h.name)] = h;
    await saveRoots(roots);
    return roots;
  } catch { return null; }
}

export async function removeLibraryFolder(i: number): Promise<FsHandle[]> {
  const roots = await loadRoots();
  roots.splice(i, 1);
  await saveRoots(roots);
  return roots;
}

/** Browsers re-ask for folder access each session; this must run from a click. */
export async function grantRoots(roots: FsHandle[], ask: boolean): Promise<boolean[]> {
  return Promise.all(roots.map(async (h) => {
    try {
      if ((await h.queryPermission?.({ mode: 'read' })) === 'granted') return true;
      if (!ask) return false;
      return (await h.requestPermission?.({ mode: 'read' })) === 'granted';
    } catch { return false; }
  }));
}

// ── Index ────────────────────────────────────────────────────────────────────

export async function loadKitIndex(): Promise<KitLibraryIndex | null> {
  try { return (await idbGet<KitLibraryIndex>(KITS_INDEX_KEY)) || null; } catch { return null; }
}

export async function scanKitLibrary(
  roots: FsHandle[],
  onProgress?: (msg: string) => void,
  limits = { samples: 150_000, kits: 30_000 },
): Promise<KitLibraryIndex> {
  const kits: LibraryKit[] = [];
  const samples: LibrarySample[] = [];
  let skipped = 0;
  let tick = 0;
  const say = (m: string) => { if (onProgress && ++tick % 40 === 0) onProgress(m); };

  for (let r = 0; r < roots.length; r++) {
    const walk = async (dir: FsHandle, prefix: string, depth: number): Promise<void> => {
      if (depth > 14 || kits.length >= limits.kits) return;
      const entries: FsHandle[] = [];
      try { for await (const h of dir.values?.() ?? []) entries.push(h); } catch { skipped++; return; }
      const previews = new Set<string>();
      const pv = entries.find((e) => e.kind === 'directory' && e.name === '.previews');
      if (pv) { try { for await (const p of pv.values?.() ?? []) previews.add(p.name); } catch { /* */ } }
      const product = prefix.split('/')[0] || roots[r].name;
      const audioHere: string[] = [];
      for (const e of entries) {
        if (e.kind === 'directory') {
          if (e.name === '.previews' || SKIP_DIRS.test(e.name)) continue;
          await walk(e, `${prefix}${e.name}/`, depth + 1);
          continue;
        }
        const path = `${prefix}${e.name}`;
        if (AUDIO_EXT.test(e.name)) {
          audioHere.push(path);
          if (samples.length < limits.samples) samples.push({ root: r, path, name: e.name.replace(/\.[^.]+$/, ''), category: classifySample(path), product });
          continue;
        }
        if (!KIT_FILE.test(path)) continue;
        if (/\.soundset$/i.test(e.name)) {
          // Studio One sound set: a zip of presets + samples. Index the Impact kits inside it.
          try {
            const file = await e.getFile!();
            for (const z of await zipEntries(file)) {
              if (/\.preset$/i.test(z.name) && /impact/i.test(z.name)) {
                kits.push({ id: `${r}:${path}!${z.name}`, root: r, path: z.name, archive: path, name: z.name.split('/').pop()!.replace(/\.preset$/i, ''), format: 'impact', product: e.name.replace(/\.soundset$/i, '') });
              }
            }
          } catch { skipped++; }
          continue;
        }
        let format = kitFormatFor(e.name);
        if (format === 'mpc') {
          try { format = kitFormatFor(e.name, new Uint8Array(await (await e.getFile!()).slice(0, 512).arrayBuffer())); } catch { format = null; }
        }
        if (format === 'impact' && !/impact/i.test(path)) {
          // Studio One saves every device's presets as .preset — only Impact ones are kits.
          try { const head = new Uint8Array(await (await e.getFile!()).slice(0, 4096).arrayBuffer()); if (!/impact/i.test(new TextDecoder().decode(head))) continue; } catch { continue; }
        }
        if (format === 'bitwig') {
          try { const head = new Uint8Array(await (await e.getFile!()).slice(0, 2048).arrayBuffer()); if (!/Drum Machine|Drum Kit/.test(new TextDecoder('latin1').decode(head))) continue; } catch { continue; }
        }
        if (!format) continue;
        const base = e.name.replace(/\.[^.]+$/, '');
        const preview = [`${e.name}.ogg`, `${base}.ogg`].find((n) => previews.has(n));
        kits.push({ id: `${r}:${path}`, root: r, path, name: e.name === 'drumkit.xml' ? prefix.split('/').filter(Boolean).pop() || base : base, format, product, previewPath: preview ? `${prefix}.previews/${preview}` : undefined });
        say(`${kits.length} kits · ${samples.length} samples — ${e.name}`);
      }
      // A folder of mixed one-shots (kick + snare + hats…) is a kit of its own.
      if (looksLikeKit(audioHere)) {
        const name = prefix.split('/').filter(Boolean).pop() || roots[r].name;
        kits.push({ id: `${r}:${prefix}`, root: r, path: prefix, name, format: 'folder', product });
      }
      say(`${kits.length} kits · ${samples.length} samples — ${prefix}`);
    };
    await walk(roots[r], '', 0);
  }
  const index: KitLibraryIndex = { roots: roots.map((h) => h.name), kits, samples, scannedAt: Date.now(), skipped };
  try { await idbSet(KITS_INDEX_KEY, index); } catch { /* usable in memory */ }
  return index;
}

// ── Files ────────────────────────────────────────────────────────────────────

export async function fileAt(root: FsHandle, path: string): Promise<File | null> {
  try {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop()!;
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle!(p);
    return await (await dir.getFileHandle!(name)).getFile!();
  } catch { return null; }
}

/** Normalize "C:\a\b\..\c.wav", "file:///x", "./x" → segments. */
export function pathSegments(p: string): string[] {
  const out: string[] = [];
  for (const s of p.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/').split('/')) {
    if (!s || s === '.' || /^[A-Za-z]:$/.test(s) || s === '~') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  return out;
}

/** Lookup structures over the sample index, built once per index. */
export interface SampleLookup { byPath: Map<string, LibrarySample>; byName: Map<string, LibrarySample[]> }
export function buildLookup(index: KitLibraryIndex): SampleLookup {
  const byPath = new Map<string, LibrarySample>();
  const byName = new Map<string, LibrarySample[]>();
  for (const s of index.samples) {
    byPath.set(`${s.root}:${s.path.toLowerCase()}`, s);
    const n = s.path.split('/').pop()!.toLowerCase();
    const list = byName.get(n); if (list) list.push(s); else byName.set(n, [s]);
    // MPC programs name samples without an extension.
    const bare = n.replace(/\.[^.]+$/, '');
    const l2 = byName.get(`#${bare}`); if (l2) l2.push(s); else byName.set(`#${bare}`, [s]);
  }
  return { byPath, byName };
}

/**
 * Find a kit's sample in the library. `kitPath` is the kit file (or folder) inside its root.
 * Prefers: the literal relative path → the longest matching path tail (same root/product first) →
 * the bare file name.
 */
export function resolveSamplePath(lookup: SampleLookup, kit: Pick<LibraryKit, 'root' | 'path' | 'product' | 'format'>, ref: string): LibrarySample | null {
  const segs = pathSegments(ref);
  if (!segs.length) return null;
  const isAbs = /^([A-Za-z]:[\\/]|\/|\\\\|file:)/i.test(ref);
  const kitDir = kit.format === 'folder' ? pathSegments(kit.path) : pathSegments(kit.path).slice(0, -1);
  if (!isAbs) {
    const joined = pathSegments([...kitDir, ...ref.replace(/\\/g, '/').split('/')].join('/')).join('/').toLowerCase();
    const hit = lookup.byPath.get(`${kit.root}:${joined}`);
    if (hit) return hit;
  }
  const fname = segs[segs.length - 1].toLowerCase();
  const cands = lookup.byName.get(fname) ?? (/\.[a-z0-9]{2,4}$/i.test(fname) ? undefined : lookup.byName.get(`#${fname}`));
  if (!cands?.length) return null;
  if (cands.length === 1) return cands[0];
  const want = segs.map((s) => s.toLowerCase());
  let best: LibrarySample | null = null;
  let bestScore = -1;
  for (const c of cands) {
    const have = c.path.toLowerCase().split('/');
    let tail = 0;
    while (tail < want.length && tail < have.length && want[want.length - 1 - tail] === have[have.length - 1 - tail]) tail++;
    const score = tail * 10 + (c.root === kit.root ? 3 : 0) + (c.product === kit.product ? 2 : 0);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

/** Read + parse a kit. Folder kits list their own one-shots; .soundset kits read from inside the zip. */
export async function openKit(roots: FsHandle[], index: KitLibraryIndex, kit: LibraryKit): Promise<KitSpec | null> {
  const root = roots[kit.root];
  if (!root) return null;
  if (kit.format === 'folder') {
    const prefix = kit.path;
    const files = index.samples.filter((s) => s.root === kit.root && s.path.startsWith(prefix) && !s.path.slice(prefix.length).includes('/'));
    return parseFolderKit(kit.name, files.map((f) => f.path));
  }
  if (kit.archive) {
    const zip = await fileAt(root, kit.archive);
    if (!zip) return null;
    const entry = (await zipEntries(zip)).find((e) => e.name === kit.path);
    if (!entry) return null;
    return parseImpact(await zipRead(zip, entry), kit.name);
  }
  const file = await fileAt(root, kit.path);
  if (!file) return null;
  return parseKitBytes(kit.format, new Uint8Array(await file.arrayBuffer()), file.name);
}

/** Bytes for one pad's sample, ready for ingest (AIFF converted to WAV). */
export async function readKitSample(
  roots: FsHandle[], lookup: SampleLookup, kit: LibraryKit, src: NonNullable<KitSpec['pads'][number]['sample']>,
): Promise<{ file: File; libPath?: string } | null> {
  if (src.kind === 'bytes') {
    const bytes = /^aiff?$/.test(src.ext) ? aiffToWav(src.bytes) : src.bytes;
    return { file: new File([bytes as BlobPart], `sample.${src.ext === 'aif' || src.ext === 'aiff' ? 'wav' : src.ext}`, { type: 'audio/wav' }) };
  }
  // Inside a Studio One sound set, samples ride in the same zip.
  if (kit.archive) {
    const zip = await fileAt(roots[kit.root], kit.archive);
    if (zip) {
      const want = pathSegments(src.path).pop()!.toLowerCase();
      const entry = (await zipEntries(zip)).find((e) => e.name.toLowerCase().endsWith('/' + want) || e.name.toLowerCase() === want);
      if (entry) return { file: toWavFile(await zipRead(zip, entry), want) };
    }
  }
  const hit = resolveSamplePath(lookup, kit, src.path);
  if (!hit) return null;
  const f = await fileAt(roots[hit.root], hit.path);
  if (!f) return null;
  return { file: AUDIO_AIFF.test(f.name) ? toWavFile(new Uint8Array(await f.arrayBuffer()), f.name) : f, libPath: hit.path };
}

const AUDIO_AIFF = /\.aiff?$/i;
const toWavFile = (b: Uint8Array, name: string) => {
  const wav = AUDIO_AIFF.test(name) ? aiffToWav(b) : b;
  return new File([wav as BlobPart], name.replace(/\.aiff?$/i, '.wav'), { type: 'audio/wav' });
};

/** One indexed sample as a File (the Samples tab). */
export async function readLibrarySample(roots: FsHandle[], s: LibrarySample): Promise<File | null> {
  const f = await fileAt(roots[s.root], s.path);
  if (!f) return null;
  return AUDIO_AIFF.test(f.name) ? toWavFile(new Uint8Array(await f.arrayBuffer()), f.name) : f;
}

// ── User kits (Save Group) ───────────────────────────────────────────────────

export async function loadUserKits(): Promise<UserKit[]> {
  try { return (await idbGet<UserKit[]>(USER_KITS_KEY)) || []; } catch { return []; }
}
export async function saveUserKit(kit: UserKit): Promise<UserKit[]> {
  const list = (await loadUserKits()).filter((k) => k.name !== kit.name);
  list.unshift(kit);
  try { await idbSet(USER_KITS_KEY, list.slice(0, 500)); } catch { /* */ }
  return list;
}
export async function deleteUserKit(id: string): Promise<UserKit[]> {
  const list = (await loadUserKits()).filter((k) => k.id !== id);
  try { await idbSet(USER_KITS_KEY, list); } catch { /* */ }
  return list;
}
