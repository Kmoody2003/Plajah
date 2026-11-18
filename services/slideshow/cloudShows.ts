// Themed Shows in the owner's account, and shared.
//
//   Account (private, every signed-in device): the creative cloud (kind 'slideshow') keeps the
//   project JSON with version history; photos and music the show uses are uploaded once to
//   personal/<uid>/creative/slideshow/<showId>/media/ and the JSON points at them. Opening a show
//   reads the freshest copy (Kenne's rule: everything syncs; local is a cache).
//
//   Published (shared): when the owner shares a show — to a post, Stage or a Tela document —
//   it is copied to public-shows/<uid>/<showId>/ (show.json + media). A ShowRef { owner, id }
//   is all a post / Stage source / Tela embed stores; ShowPlayer loads it from there.

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';
import { listCloudProjects, loadCloudProject, scheduleCreativeSync, type CloudHead } from '../creativeCloud/cloudStore';
import type { ShowSpec } from './types';
import { needsBrandBug } from './brandBug';

export const SHOW_KIND = 'slideshow';
export interface ShowRef { owner: string; id: string; title?: string; cover?: string }

const ext = (type: string) => (/png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /jpe?g/.test(type) ? 'jpg' : /mpeg|mp3/.test(type) ? 'mp3' : /wav/.test(type) ? 'wav' : /aac|mp4a|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'bin');

async function hashOf(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-1', buf.byteLength > 4_000_000 ? buf.slice(0, 2_000_000) : buf);
  return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('') + '-' + buf.byteLength.toString(36);
}

/** temp src (blob:/data:) → uploaded URL, per destination folder, for this session */
const uploaded = new Map<string, string>();

/** Upload every temporary media file the spec uses into `base/media/` and point the spec at it. */
async function withUploadedMedia(spec: ShowSpec, base: string, onProgress?: (done: number, total: number) => void, alsoCopy?: (src: string) => boolean): Promise<ShowSpec> {
  const temp = [...spec.photos.map((p) => p.src), ...spec.music.tracks.map((t) => t.src)].filter((s) => (/^(blob|data):/.test(s) || !!alsoCopy?.(s)) && !uploaded.has(`${base}|${s}`));
  let done = 0;
  for (const src of new Set(temp)) {
    const blob = await (await fetch(src)).blob();
    const type = blob.type || 'image/jpeg';
    const path = `${base}/media/${await hashOf(blob)}.${ext(type)}`;
    const r = ref(storage, path);
    await uploadBytes(r, blob, { contentType: type, cacheControl: 'public, max-age=31536000, immutable' });
    uploaded.set(`${base}|${src}`, await getDownloadURL(r));
    onProgress?.(++done, temp.length);
  }
  const map = (s: string) => uploaded.get(`${base}|${s}`) || s;
  return {
    ...spec,
    photos: spec.photos.map((p) => ({ ...p, src: map(p.src) })),
    music: { ...spec.music, tracks: spec.music.tracks.map((t) => ({ ...t, src: map(t.src) })) },
  };
}

export const signedInUid = () => (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null);

/**
 * Save to the owner's account: media uploaded once, then the project JSON through the creative
 * cloud (debounced, versioned, merged across devices). Returns the spec as stored (cloud URLs).
 */
export async function saveShowToAccount(spec: ShowSpec, onProgress?: (done: number, total: number) => void): Promise<ShowSpec | null> {
  const uid = signedInUid();
  if (!uid) return null;
  const cloudSpec = await withUploadedMedia(spec, `personal/${uid}/creative/${SHOW_KIND}/${spec.id}`, onProgress);
  const cover = cloudSpec.photos.find((p) => /^https?:/.test(p.src))?.src;
  scheduleCreativeSync({ kind: SHOW_KIND, localId: spec.id, title: spec.title || 'Themed Show', json: JSON.stringify({ format: 'plajah.themedShow', version: 1, spec: cloudSpec }), coverUrl: cover });
  return cloudSpec;
}

export async function listAccountShows(): Promise<CloudHead[]> {
  if (!signedInUid()) return [];
  try { return (await listCloudProjects(SHOW_KIND)).sort((a, b) => b.updatedAt - a.updatedAt); } catch { return []; }
}

export async function openAccountShow(id: string): Promise<{ spec: ShowSpec; head: CloudHead } | null> {
  const got = await loadCloudProject(SHOW_KIND, id);
  if (!got) return null;
  return { spec: (JSON.parse(got.json).spec as ShowSpec), head: got.head };
}

// --- publishing ---------------------------------------------------------------------------

export const publishedPath = (r: Pick<ShowRef, 'owner' | 'id'>) => `public-shows/${r.owner}/${r.id}/show.json`;

/** Publish (or re-publish) a show so posts, Stage and Tela can play it. */
export async function publishShow(spec: ShowSpec, onProgress?: (done: number, total: number) => void): Promise<ShowRef> {
  const uid = signedInUid();
  if (!uid) throw Object.assign(new Error('Sign in to share a show.'), { code: 'SIGN_IN_REQUIRED' });
  const base = `public-shows/${uid}/${spec.id}`;
  // private account copies (personal/…) are copied too, so nothing private is referenced
  const pub = await withUploadedMedia(spec, base, onProgress, (s) => s.includes('/personal%2F'));
  // Only published copies of the media are referenced: no private account URLs leak into a post.
  const leak = [...pub.photos.map((p) => p.src), ...pub.music.tracks.map((t) => t.src)].find((s) => s.includes('/personal%2F') || /^(blob|data):/.test(s));
  if (leak) throw new Error('A photo could not be published. Try again.');
  // Free and Spark owners' shared shows carry the plajah.com bug wherever they play
  const shared: ShowSpec = { ...pub, brandBug: await needsBrandBug() };
  const body = JSON.stringify({ format: 'plajah.themedShow', version: 1, owner: uid, publishedAt: Date.now(), spec: shared });
  await uploadBytes(ref(storage, publishedPath({ owner: uid, id: spec.id })), new Blob([body], { type: 'application/json' }), { contentType: 'application/json', cacheControl: 'public, max-age=60' });
  const cover = pub.photos.find((p) => !p.graphic)?.src || pub.photos[0]?.src;
  return { owner: uid, id: spec.id, title: spec.title, cover };
}

const pubCache = new Map<string, Promise<ShowSpec>>();
/** Load a published show (anyone can, signed in or not). */
export function loadPublishedShow(r: Pick<ShowRef, 'owner' | 'id'>, fresh = false): Promise<ShowSpec> {
  const key = `${r.owner}/${r.id}`;
  let p = fresh ? undefined : pubCache.get(key);
  if (!p) {
    p = (async () => {
      const url = await getDownloadURL(ref(storage, publishedPath(r)));
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`This show isn't available (${res.status}).`);
      return (await res.json()).spec as ShowSpec;
    })();
    pubCache.set(key, p);
    p.catch(() => pubCache.delete(key));
  }
  return p;
}

/** A link anyone can open (the app routes ?show=<owner>/<id> to the show viewer). */
export function showLink(r: Pick<ShowRef, 'owner' | 'id'>, mode: 'timeline' | 'interactive' = 'timeline') {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://plajah.com';
  return `${origin}/?show=${encodeURIComponent(`${r.owner}/${r.id}`)}${mode === 'interactive' ? '&mode=live' : ''}`;
}
