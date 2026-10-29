// mirrorScores — copies every file in the score catalogue onto Plajah's own object store,
// so sheet music serves from us instead of hot-linking GitHub and mutopiaproject.org.
//
//   npx tsx scripts/scores/mirrorScores.mts            (needs public/scores/catalog.json)
//
// Files are staged on disk first (default D:/plajah-mirror/scores — C: has no room), then
// PUT with presigned SigV4 URLs. A file already in the bucket at the same size is skipped,
// so a rerun only uploads what is new. ~4,900 files, ~265 MB.
//
// Config (env, falling back to .env.local):
//   SCORE_MIRROR_BUCKET      default OBJECT_STORE_BUCKET   (plajah-dev today, plajah-public later)
//   SCORE_MIRROR_PUBLIC_BASE public read URL of the bucket, written into the catalogue
//                            default /api/scores/file (routes/scoreFiles.ts signs reads from a
//                            private bucket and falls back to the source)
//   SCORE_STAGE_DIR          default D:/plajah-mirror/scores
//   OBJECT_STORE_ENDPOINT / _REGION / _KEY_ID / _APP_KEY
//
// Keys are deterministic: scores/v1/<source>/<id>.<kind-ext> (see services/scoreCatalog.ts
// mirrorKey), so the catalogue only records WHICH kinds were mirrored, never the keys.
//
// Licences: every file here is CC0, public domain, CC BY or CC BY-SA — all allow
// redistribution. The credit travels in the catalogue (edition + engraver) and the pack's
// CREDITS.txt; files are copied byte-for-byte, never altered.

import fs from 'node:fs';
import path from 'node:path';
import { presignUrl } from '../../services/objectStore/sigv4';
import { mirrorKey, type ScoreCatalog, type ScoreFileKind } from '../../services/scoreCatalog';

const envFile = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const env = (k: string): string =>
  process.env[k] ??
  envFile.split(/\r?\n/).map(l => /^([A-Z0-9_]+)=(.*)$/.exec(l)).find(m => m?.[1] === k)?.[2]?.replace(/^["']|["']$/g, '') ??
  '';

const endpoint = env('OBJECT_STORE_ENDPOINT');
const region = env('OBJECT_STORE_REGION');
const accessKeyId = env('OBJECT_STORE_KEY_ID');
const secretAccessKey = env('OBJECT_STORE_APP_KEY');
const bucket = env('SCORE_MIRROR_BUCKET') || env('OBJECT_STORE_BUCKET');
// Private buckets (plajah-dev, plajah-private) are read through our own API route, which signs
// a short GET or falls back to the source. A public bucket behind Cloudflare sets its own base.
const publicBase = (env('SCORE_MIRROR_PUBLIC_BASE') || '/api/scores/file').replace(/\/$/, '');
const stage = env('SCORE_STAGE_DIR') || 'D:/plajah-mirror/scores';
if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
  console.error('Object store not configured (OBJECT_STORE_* in .env.local).');
  process.exit(1);
}

const CATALOG = path.resolve('public/scores/catalog.json');
const catalog: ScoreCatalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

const MIME: Record<ScoreFileKind, string> = {
  pdf: 'application/pdf',
  pdfZip: 'application/zip',
  mxl: 'application/vnd.recordare.musicxml',
  midi: 'audio/midi',
};
const URL_FIELD: Record<ScoreFileKind, 'pdfUrl' | 'pdfZipUrl' | 'mxlUrl' | 'midiUrl'> = {
  pdf: 'pdfUrl', pdfZip: 'pdfZipUrl', mxl: 'mxlUrl', midi: 'midiUrl',
};

const sign = (method: 'PUT' | 'HEAD', key: string, headers?: Record<string, string>) =>
  presignUrl({ method, endpoint, bucket, key, region, accessKeyId, secretAccessKey, expiresSec: 900, headers });

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}

async function stageFile(url: string, file: string): Promise<Buffer> {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file);
  const buf = await withRetry(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': 'plajah-score-mirror (+https://plajah.com)' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return Buffer.from(await r.arrayBuffer());
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

async function upload(key: string, buf: Buffer, mime: string): Promise<'skipped' | 'uploaded'> {
  const head = await fetch(sign('HEAD', key), { method: 'HEAD' }).catch(() => null);
  if (head?.ok && Number(head.headers.get('content-length')) === buf.length) return 'skipped';
  await withRetry(async () => {
    const headers = { 'content-type': mime, 'content-length': String(buf.length) };
    const r = await fetch(sign('PUT', key, headers), { method: 'PUT', headers, body: buf });
    if (!r.ok) throw new Error(`PUT ${r.status} ${key}: ${(await r.text()).slice(0, 200)}`);
  });
  return 'uploaded';
}

type Job = { entryIndex: number; kind: ScoreFileKind; url: string };
const jobs: Job[] = [];
catalog.entries.forEach((e, entryIndex) => {
  for (const kind of Object.keys(URL_FIELD) as ScoreFileKind[]) {
    const url = e[URL_FIELD[kind]];
    if (url) jobs.push({ entryIndex, kind, url });
  }
});
console.log(`Mirroring ${jobs.length} files from ${catalog.entries.length} scores → ${bucket} (staging in ${stage})`);

const mirrored = catalog.entries.map(() => new Set<ScoreFileKind>());
const counts = { uploaded: 0, skipped: 0, failed: 0 };
let bytes = 0, next = 0;
const failures: string[] = [];

await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    const e = catalog.entries[j.entryIndex];
    const key = mirrorKey(e, j.kind);
    try {
      const buf = await stageFile(j.url, path.join(stage, key));
      const res = await upload(key, buf, MIME[j.kind]);
      counts[res]++; bytes += buf.length;
      mirrored[j.entryIndex].add(j.kind);
    } catch (err) {
      counts.failed++; failures.push(`${e.id} ${j.kind}: ${String(err).slice(0, 160)}`);
    }
    const done = counts.uploaded + counts.skipped + counts.failed;
    if (done % 250 === 0) console.log(`  ${done}/${jobs.length}  (${(bytes / 1e6).toFixed(0)} MB)`);
  }
}));

// Record what is mirrored. Files that failed keep serving from their source.
catalog.entries.forEach((e, i) => {
  if (mirrored[i].size) e.mirrored = [...mirrored[i]].sort(); else delete e.mirrored;
});
catalog.mirror = { base: publicBase, bucket, at: new Date().toISOString() };
fs.writeFileSync(CATALOG, JSON.stringify(catalog));

console.log(JSON.stringify({ ...counts, megabytes: +(bytes / 1e6).toFixed(1), base: publicBase }, null, 2));
if (failures.length) console.log('Failures (served from source instead):\n' + failures.slice(0, 30).join('\n'));
