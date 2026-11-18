// Themed Shows — project saving.
//
// A show project is the ShowSpec plus every file it uses (photos, edited photos, music).
// Object URLs from a folder import die with the tab, so the media is copied into the save.
//
//   • Autosave (this device): OPFS  themed-shows/<showId>/show.json + media/<mediaId>
//   • Save to drive:          a folder the owner picks — <Title>/show.json + media/…
//     (plain files: back it up, move it, open it on another machine)
//
// The project records its owner (the signed-in account) so the cloud copy can be attached
// to that account. Until cloud sync is wired, saves are on this device only — the studio
// says so (Kenne's rule: everything syncs; local is only a cache).

import type { ShowSpec } from './types';

export const PROJECT_FORMAT = 'plajah.themedShow';
export const PROJECT_VERSION = 1;

export interface ShowProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: number;
  /** Account that owns the show (Firebase uid + display handle when known). */
  owner?: { uid: string; handle?: string };
  /** The spec with every media src replaced by `media:<id>`. */
  spec: ShowSpec;
  media: Record<string, { name: string; type: string; size: number }>;
}

export interface ShowProjectSummary { id: string; title: string; theme: string; photos: number; savedAt: number; cover?: string; owner?: ShowProjectFile['owner'] }

const ROOT = 'themed-shows';

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT, { create: true });
}

const mediaIdFor = async (blob: Blob) => {
  // content hash: the same photo is stored once, edits get a new id
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-1', buf.byteLength > 4_000_000 ? buf.slice(0, 2_000_000) : buf);
  return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('') + '-' + buf.byteLength.toString(36);
};

const extFor = (type: string) => (/png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /jpe?g/.test(type) ? 'jpg' : /mpeg|mp3/.test(type) ? 'mp3' : /wav/.test(type) ? 'wav' : /aac|mp4a|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'bin');

/** Collect a spec's media as blobs and rewrite srcs to media ids. */
async function packSpec(spec: ShowSpec, known: Map<string, string>) {
  const media = new Map<string, Blob>();
  const meta: ShowProjectFile['media'] = {};
  const take = async (src: string, name: string) => {
    if (src.startsWith('media:')) return src;
    // only temporary sources are copied in; permanent URLs (the owner's Plajah storage,
    // the theme pack under /slideshow) are kept as links
    if (!/^(blob|data):/.test(src)) return src;
    const cached = known.get(src);
    if (cached) return `media:${cached}`;
    const blob = await (await fetch(src)).blob();
    const id = await mediaIdFor(blob);
    known.set(src, id);
    if (!media.has(id)) { media.set(id, blob); meta[id] = { name, type: blob.type || 'application/octet-stream', size: blob.size }; }
    return `media:${id}`;
  };
  const photos = [];
  for (const p of spec.photos) photos.push({ ...p, src: await take(p.src, p.title || p.id) });
  const tracks = [];
  for (const t of spec.music.tracks) tracks.push({ ...t, src: await take(t.src, t.title) });
  const packed: ShowSpec = { ...spec, photos, music: { ...spec.music, tracks } };
  return { packed, media, meta };
}

// --- autosave (this device) ------------------------------------------------------------

const srcToMedia = new Map<string, string>(); // object URL → media id, across saves

export async function saveLocal(spec: ShowSpec, owner?: ShowProjectFile['owner']): Promise<number> {
  const dir = await (await opfsRoot()).getDirectoryHandle(spec.id, { create: true });
  const mdir = await dir.getDirectoryHandle('media', { create: true });
  const { packed, media, meta } = await packSpec(spec, srcToMedia);
  // only write media we don't have yet
  for (const [id, blob] of media) {
    try { await mdir.getFileHandle(`${id}.${extFor(blob.type)}`); continue; } catch { /* new */ }
    const fh = await mdir.getFileHandle(`${id}.${extFor(blob.type)}`, { create: true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
  }
  // keep earlier media entries the spec still references
  let prevMeta: ShowProjectFile['media'] = {};
  try { prevMeta = JSON.parse(await (await (await dir.getFileHandle('show.json')).getFile()).text()).media || {}; } catch { /* first save */ }
  const used = new Set<string>();
  for (const p of packed.photos) if (p.src.startsWith('media:')) used.add(p.src.slice(6));
  for (const t of packed.music.tracks) if (t.src.startsWith('media:')) used.add(t.src.slice(6));
  const allMeta: ShowProjectFile['media'] = {};
  for (const id of used) allMeta[id] = meta[id] || prevMeta[id];
  const savedAt = Date.now();
  const file: ShowProjectFile = { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt, owner, spec: packed, media: allMeta };
  const fh = await dir.getFileHandle('show.json', { create: true });
  const w = await fh.createWritable(); await w.write(JSON.stringify(file)); await w.close();
  return savedAt;
}

export async function listLocal(): Promise<ShowProjectSummary[]> {
  const out: ShowProjectSummary[] = [];
  try {
    const root = await opfsRoot();
    for await (const [name, h] of (root as any).entries()) {
      if (h.kind !== 'directory') continue;
      try {
        const f: ShowProjectFile = JSON.parse(await (await (await (h as FileSystemDirectoryHandle).getFileHandle('show.json')).getFile()).text());
        out.push({ id: name, title: f.spec.title, theme: f.spec.theme, photos: f.spec.photos.length, savedAt: f.savedAt, owner: f.owner });
      } catch { /* incomplete save */ }
    }
  } catch { /* OPFS unavailable */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

async function unpack(file: ShowProjectFile, mediaDir: FileSystemDirectoryHandle): Promise<ShowSpec> {
  const urls = new Map<string, string>();
  const resolve = async (src: string) => {
    if (!src.startsWith('media:')) return src;
    const id = src.slice(6);
    let u = urls.get(id);
    if (!u) {
      const m = file.media[id];
      const fh = await mediaDir.getFileHandle(`${id}.${extFor(m?.type || '')}`);
      u = URL.createObjectURL(await fh.getFile());
      urls.set(id, u);
      srcToMedia.set(u, id);
    }
    return u;
  };
  const spec = file.spec;
  const photos = [];
  for (const p of spec.photos) photos.push({ ...p, src: await resolve(p.src) });
  const tracks = [];
  for (const t of spec.music.tracks) tracks.push({ ...t, src: await resolve(t.src) });
  return { ...spec, photos, music: { ...spec.music, tracks } };
}

export async function openLocal(id: string): Promise<{ spec: ShowSpec; file: ShowProjectFile }> {
  const dir = await (await opfsRoot()).getDirectoryHandle(id);
  const file: ShowProjectFile = JSON.parse(await (await (await dir.getFileHandle('show.json')).getFile()).text());
  return { spec: await unpack(file, await dir.getDirectoryHandle('media', { create: true })), file };
}

export async function deleteLocal(id: string) {
  await (await opfsRoot()).removeEntry(id, { recursive: true });
}

// --- the local drive (a folder the owner picks) ----------------------------------------

export const driveSupported = () => typeof (window as any).showDirectoryPicker === 'function';

const safeName = (s: string) => (s || 'Themed Show').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Themed Show';

/** Write the project as a plain folder inside a directory the owner chooses. */
export async function saveToDrive(spec: ShowSpec, owner?: ShowProjectFile['owner'], parent?: FileSystemDirectoryHandle): Promise<{ folder: string; files: number }> {
  const base: FileSystemDirectoryHandle = parent || await (window as any).showDirectoryPicker({ id: 'plajah-themed-shows', mode: 'readwrite', startIn: 'documents' });
  const folder = safeName(spec.title);
  const dir = await base.getDirectoryHandle(folder, { create: true });
  const mdir = await dir.getDirectoryHandle('media', { create: true });
  const { packed, media, meta } = await packSpec(spec, new Map());
  let files = 0;
  for (const [id, blob] of media) {
    const fh = await mdir.getFileHandle(`${id}.${extFor(blob.type)}`, { create: true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
    files++;
  }
  const file: ShowProjectFile = { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: Date.now(), owner, spec: packed, media: meta };
  const fh = await dir.getFileHandle('show.json', { create: true });
  const w = await fh.createWritable(); await w.write(JSON.stringify(file, null, 1)); await w.close();
  return { folder, files: files + 1 };
}

/** Open a project folder from the drive (the folder that holds show.json). */
export async function openFromDrive(): Promise<{ spec: ShowSpec; file: ShowProjectFile }> {
  const dir: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'plajah-themed-shows', mode: 'read', startIn: 'documents' });
  const file: ShowProjectFile = JSON.parse(await (await (await dir.getFileHandle('show.json')).getFile()).text());
  if (file.format !== PROJECT_FORMAT) throw new Error('That folder is not a Themed Show project.');
  return { spec: await unpack(file, await dir.getDirectoryHandle('media')), file };
}
