// scripts/video/migrateMuxToBunny.mts — move on-demand videos from Mux to Bunny Stream, one item at a time.
//
//   npx tsx scripts/video/migrateMuxToBunny.mts <items.json>            # dry run: backup + upload + wait, no Firestore writes
//   npx tsx scripts/video/migrateMuxToBunny.mts <items.json> --apply    # also write Bunny fields onto each doc
//
// items.json: [{ "muxAssetId": "...", "doc": "videos/vid_123", "master"?: "D:/plajah-masters/x.mp4", "title"?: "..." }]
//   album film track: { "muxAssetId": "...", "doc": "albums/album_1", "track": "movie" } — patches tracks[id=movie]
//   (written only if the album is unchanged since read) and its videos/sys_<album>_<track> mirror.
//
// Per item:
//  1. Master: use `master` if given and present, else pull Mux's master (temporary master access, switched
//     back off in finally) into D:/plajah-masters/mux/<assetId>.mp4. Mux is often the ONLY copy, so the
//     master is kept on disk either way.
//  2. Create a Bunny video, PUT the master into it, wait for status Finished.
//  3. --apply: patch the doc with bunnyVideoId / bunnyCdnHost / videoHost, url = Bunny HLS (only if url is
//     empty or a Mux URL), thumbnailUrl only if missing. muxPlaybackId is KEPT as the fallback, and the Mux
//     asset is NEVER deleted here — that happens only after playback is checked on web, phone and TV.
//  4. Appends a line to D:/plajah-masters/bunny-migration.log.jsonl (resume: items already done are skipped).
//
// Needs in .env.local: MUX_TOKEN_ID/SECRET, BUNNY_STREAM_LIBRARY_ID/API_KEY/READONLY_KEY/CDN_HOST
// (BUNNY_STREAM_ENABLED is not needed here). Firestore via `gcloud auth print-access-token` (db plajah-prod).
// Top-level docs and album film tracks are patched; TV episodes / music videos inside albums are not yet.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { bunnyStreamConfig, videoStatusState } from '../../services/bunnyStream/core.ts';
import { createVideo, getVideo, uploadVideoBody, tusUploadAuth } from '../../services/bunnyStream/server.ts';
import { bunnyDocFields } from '../../services/video/playback.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MASTERS = 'D:/plajah-masters';
const LOG = `${MASTERS}/bunny-migration.log.jsonl`;
const PROJECT = 'gen-lang-client-0665118474';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/plajah-prod/documents`;

const env: Record<string, string> = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }));
const bunny = bunnyStreamConfig({ ...env, BUNNY_STREAM_ENABLED: '1' });
if (!bunny) { console.error('BUNNY_STREAM_LIBRARY_ID / API_KEY / READONLY_KEY / CDN_HOST missing from .env.local'); process.exit(1); }
const muxAuth = 'Basic ' + Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString('base64');

const [itemsFile, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
if (!itemsFile) { console.error('usage: migrateMuxToBunny.mts <items.json> [--apply]'); process.exit(1); }
const items: { muxAssetId: string; doc: string; track?: string; master?: string; title?: string; finishUpload?: { uploadId: string; playbackId: string } }[] = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
fs.mkdirSync(`${MASTERS}/mux`, { recursive: true });

// Last successful log entry per asset: skip finished work, and let --apply reuse a dry run's Bunny video
// instead of uploading it a second time.
const prior = new Map<string, any>();
if (fs.existsSync(LOG)) for (const l of fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)) {
  const e = JSON.parse(l); if (e.ok) prior.set(e.muxAssetId, e);
}
const done = new Set<string>([...prior.values()].filter(e => e.applied || !APPLY).map(e => e.muxAssetId));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const fsToken = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

async function mux(p: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.mux.com/video/v1${p}`, { ...init, headers: { Authorization: muxAuth, 'content-type': 'application/json' } });
  if (!r.ok) throw new Error(`Mux ${init.method || 'GET'} ${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data;
}

async function pullMuxMaster(assetId: string): Promise<string> {
  const dest = `${MASTERS}/mux/${assetId}.mp4`;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  await mux(`/assets/${assetId}/master-access`, { method: 'PUT', body: JSON.stringify({ master_access: 'temporary' }) });
  try {
    let url: string | undefined;
    for (let i = 0; i < 180 && !url; i++) {
      const a = await mux(`/assets/${assetId}`);
      if (a.master?.status === 'ready') url = a.master.url;
      else if (a.master?.status === 'errored') throw new Error('Mux master errored');
      else await sleep(10_000);
    }
    if (!url) throw new Error('Mux master not ready after 30 min');
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`master download ${r.status}`);
    const want = Number(r.headers.get('content-length') || 0);
    await pipeline(Readable.fromWeb(r.body as any), fs.createWriteStream(`${dest}.part`));
    if (want && fs.statSync(`${dest}.part`).size !== want) throw new Error('master size mismatch');
    fs.renameSync(`${dest}.part`, dest);
    return dest;
  } finally {
    await mux(`/assets/${assetId}/master-access`, { method: 'PUT', body: JSON.stringify({ master_access: 'none' }) })
      .catch(e => console.error(`!! could not switch master access off for ${assetId}: ${e.message}`));
  }
}

async function readDoc(docPath: string) {
  const r = await fetch(`${FS}/${docPath}`, { headers: { Authorization: `Bearer ${fsToken()}`, 'x-goog-user-project': PROJECT } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`read ${docPath}: ${r.status}`);
  return (await r.json()).fields || {};
}

async function tusUpload(guid: string, file: string, size: number, title: string): Promise<void> {
  const { createRequire } = await import('node:module');
  const tus = createRequire(path.join(ROOT, 'package.json'))('tus-js-client');
  const auth = tusUploadAuth(bunny!, guid, 24 * 3600);
  let last = -1;
  await new Promise<void>((resolve, reject) => new tus.Upload(fs.createReadStream(file), {
    endpoint: auth.endpoint, headers: auth.headers, uploadSize: size, chunkSize: 50 * 1024 * 1024,
    retryDelays: [0, 3000, 10000, 30000, 60000, 120000],
    metadata: { filetype: 'video/mp4', title: title.slice(0, 200) },
    onProgress: (sent: number, total: number) => { const p = Math.floor((sent / total) * 10); if (p !== last) { last = p; console.log(`   upload ${p * 10}%`); } },
    onSuccess: () => resolve(), onError: (e: Error) => reject(e),
  }).start());
}

async function readDocRaw(docPath: string): Promise<{ fields: Record<string, any>; updateTime: string } | null> {
  const r = await fetch(`${FS}/${docPath}`, { headers: { Authorization: `Bearer ${fsToken()}`, 'x-goog-user-project': PROJECT } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`read ${docPath}: ${r.status}`);
  const j = await r.json();
  return { fields: j.fields || {}, updateTime: j.updateTime };
}

/** Album track: find tracks[id=trackId] (typed Firestore map fields), or throw. */
function trackFields(albumFields: Record<string, any>, trackId: string): Record<string, any> {
  const t = (albumFields.tracks?.arrayValue?.values || []).find((x: any) => x?.mapValue?.fields?.id?.stringValue === trackId);
  if (!t) throw new Error(`track ${trackId} not found`);
  t.mapValue.fields ||= {};
  return t.mapValue.fields;
}

/** Writes the whole tracks array back, only if the album is unchanged since we read it (no lost edits). */
async function patchAlbumTracks(docPath: string, albumFields: Record<string, any>, updateTime: string) {
  const r = await fetch(`${FS}/${docPath}?updateMask.fieldPaths=tracks&currentDocument.updateTime=${encodeURIComponent(updateTime)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${fsToken()}`, 'x-goog-user-project': PROJECT, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { tracks: albumFields.tracks } }),
  });
  if (!r.ok) throw new Error(`patch ${docPath} tracks: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function patchDoc(docPath: string, fields: Record<string, string | null>) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null ? { nullValue: null } : { stringValue: v }])) };
  const r = await fetch(`${FS}/${docPath}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${fsToken()}`, 'x-goog-user-project': PROJECT, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`patch ${docPath}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

let failures = 0;
for (const it of items) {
  if (done.has(it.muxAssetId)) { console.log(`skip (done) ${it.muxAssetId}`); continue; }
  const entry: Record<string, unknown> = { at: new Date().toISOString(), muxAssetId: it.muxAssetId, doc: it.doc, apply: APPLY };
  try {
    if (!/^[A-Za-z0-9]{10,80}$/.test(it.muxAssetId) || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(it.doc)) throw new Error('bad item');
    if (it.track && (!it.doc.startsWith('albums/') || !/^[A-Za-z0-9_-]+$/.test(it.track))) throw new Error('track items must be albums/<id> + a track id');
    const raw = it.track ? await readDocRaw(it.doc) : null;
    const docFields = it.track ? (raw ? trackFields(raw.fields, it.track) : null) : await readDoc(it.doc);
    if (!docFields) throw new Error(`doc ${it.doc} not found`);
    if (docFields.muxAssetId?.stringValue && docFields.muxAssetId.stringValue !== it.muxAssetId) throw new Error('doc points at a different Mux asset');
    if (docFields.bunnyVideoId?.stringValue) throw new Error(`doc already on Bunny (${docFields.bunnyVideoId.stringValue})`);

    const reuse = prior.get(it.muxAssetId)?.bunnyVideoId as string | undefined;
    let v: { guid: string };
    if (reuse) {
      v = { guid: reuse };
      entry.bunnyVideoId = reuse; entry.reused = true;
      console.log(`→ ${it.doc} reusing Bunny ${reuse} from the dry run`);
    } else {
      if (!(it.master && fs.existsSync(it.master))) {
        const st = fs.statfsSync(MASTERS);
        if (st.bavail * st.bsize < 15e9) { console.error('   ✗ under 15 GB free on the masters drive — stopping (re-run resumes)'); break; }
      }
      const master = it.master && fs.existsSync(it.master) ? it.master : await pullMuxMaster(it.muxAssetId);
      const size = fs.statSync(master).size;
      entry.master = master; entry.bytes = size;
      const title = it.title || docFields.title?.stringValue || path.basename(master, path.extname(master));
      console.log(`→ ${it.doc} "${title}" ${(size / 1e6).toFixed(0)} MB`);
      v = await createVideo(bunny, title);
      entry.bunnyVideoId = v.guid;
      fs.appendFileSync(LOG, JSON.stringify({ ...entry, ok: false, stage: 'created' }) + '\n'); // orphan trail if the upload dies
      if (size < 1e9) await uploadVideoBody(bunny, v.guid, Readable.toWeb(fs.createReadStream(master)) as ReadableStream, size);
      else await tusUpload(v.guid, master, size, title); // big films: resumable 50 MB chunks with retries
    }
    let state = 'processing';
    for (let i = 0; i < 1080 && state !== 'ready'; i++) { // up to 3 h (feature films on the free encoder)
      await sleep(10_000);
      const s = await getVideo(bunny, v.guid);
      state = videoStatusState(s.status);
      if (state === 'errored') throw new Error(`Bunny failed to encode (status ${s.status})`);
      if (i % 6 === 0) process.stdout.write(`   encoding ${s.encodeProgress}%\n`);
    }
    if (state !== 'ready') throw new Error('Bunny encode not finished after 3 h');

    if (APPLY) {
      const f = bunnyDocFields(v.guid, bunny.cdnHost);
      const oldUrl = docFields.url?.stringValue || '';
      const patch: Record<string, string> = { bunnyVideoId: f.bunnyVideoId, bunnyCdnHost: f.bunnyCdnHost, videoHost: f.videoHost };
      if (!oldUrl || /mux\.com/.test(oldUrl)) patch.url = f.url;
      if (!docFields.thumbnailUrl?.stringValue) patch.thumbnailUrl = f.thumbnailUrl;
      if (it.track) {
        // Re-read right before writing so the precondition covers the whole encode wait.
        const fresh = await readDocRaw(it.doc);
        if (!fresh) throw new Error(`album ${it.doc} vanished`);
        const tf = trackFields(fresh.fields, it.track);
        if (tf.muxAssetId?.stringValue && tf.muxAssetId.stringValue !== it.muxAssetId) throw new Error('track now points at a different Mux asset');
        for (const [k, val] of Object.entries(patch)) tf[k] = { stringValue: val };
        await patchAlbumTracks(it.doc, fresh.fields, fresh.updateTime);
        // The track's mirror in `videos` (sys_<album>_<track>) plays it in Reello/Taleo — move it too.
        const mirror = `videos/sys_${it.doc.slice('albums/'.length)}_${it.track}`;
        const m = await readDoc(mirror);
        if (m && !m.bunnyVideoId?.stringValue && (!m.muxAssetId?.stringValue || m.muxAssetId.stringValue === it.muxAssetId)) {
          const mp: Record<string, string> = { bunnyVideoId: f.bunnyVideoId, bunnyCdnHost: f.bunnyCdnHost, videoHost: f.videoHost };
          const mu = m.url?.stringValue || '';
          if (!mu || /mux\.com/.test(mu)) mp.url = f.url;
          if (!m.thumbnailUrl?.stringValue) mp.thumbnailUrl = f.thumbnailUrl;
          await patchDoc(mirror, mp);
          entry.mirror = mirror;
        }
      } else {
        const full: Record<string, string | null> = { ...patch };
        if (it.finishUpload) {
          // Doc stuck on a Mux upload that did finish (Mux never wrote back): complete it like the poller would.
          const fresh = await readDoc(it.doc);
          if (fresh?.muxUploadId?.stringValue !== it.finishUpload.uploadId) throw new Error('doc no longer waits on that Mux upload');
          Object.assign(full, { muxAssetId: it.muxAssetId, muxPlaybackId: it.finishUpload.playbackId, muxUploadId: null });
        }
        await patchDoc(it.doc, full);
      }
      entry.applied = true;
    }
    entry.ok = true;
    console.log(`   ✓ Bunny ${v.guid}${APPLY ? ' (doc updated)' : ' (dry run: doc untouched)'}`);
  } catch (e: any) {
    failures++; entry.ok = false; entry.error = e.message;
    console.error(`   ✗ ${it.muxAssetId}: ${e.message}`);
  }
  fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
}
process.exit(failures ? 1 : 0);
