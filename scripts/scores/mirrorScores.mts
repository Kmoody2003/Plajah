// mirrorScores — copies every file in the score catalogue into Plajah's Firebase Storage,
// so sheet music serves from us instead of hot-linking GitHub and mutopiaproject.org.
//
//   npx tsx scripts/scores/mirrorScores.mts            (needs public/scores/catalog.json + gsutil login)
//
// Files are staged on disk first (default D:/plajah-mirror/scores — C: has no room), then
// `gsutil rsync` copies the stage to gs://<bucket>/scores/v1, so a rerun only uploads what is
// new. ~4,900 files, ~280 MB. storage.rules makes scores/ public-read, admin-write.
//
// Config (env):
//   SCORE_MIRROR_BUCKET  default gen-lang-client-0665118474.firebasestorage.app (firebase.json)
//   SCORE_STAGE_DIR      default D:/plajah-mirror/scores
//
// Keys are deterministic: scores/v1/<source>/<id>.<kind-ext> (see services/scoreCatalog.ts
// mirrorKey), so the catalogue only records WHICH kinds were mirrored, never the keys.
//
// Licences: every file here is CC0, public domain, CC BY or CC BY-SA — all allow
// redistribution. The credit travels in the catalogue (edition + engraver) and the pack's
// CREDITS.txt; files are copied byte-for-byte, never altered.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mirrorKey, type ScoreCatalog, type ScoreFileKind } from '../../services/scoreCatalog';

const bucket = process.env.SCORE_MIRROR_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const stage = process.env.SCORE_STAGE_DIR || 'D:/plajah-mirror/scores';

const CATALOG = path.resolve('public/scores/catalog.json');
const catalog: ScoreCatalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

const URL_FIELD: Record<ScoreFileKind, 'pdfUrl' | 'pdfZipUrl' | 'mxlUrl' | 'midiUrl'> = {
  pdf: 'pdfUrl', pdfZip: 'pdfZipUrl', mxl: 'mxlUrl', midi: 'midiUrl',
};

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}

async function stageFile(url: string, file: string): Promise<void> {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const buf = await withRetry(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': 'plajah-score-mirror (+https://plajah.com)' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return Buffer.from(await r.arrayBuffer());
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

type Job = { entryIndex: number; kind: ScoreFileKind; url: string };
const jobs: Job[] = [];
catalog.entries.forEach((e, entryIndex) => {
  for (const kind of Object.keys(URL_FIELD) as ScoreFileKind[]) {
    const url = e[URL_FIELD[kind]];
    if (url) jobs.push({ entryIndex, kind, url });
  }
});
console.log(`Staging ${jobs.length} files from ${catalog.entries.length} scores in ${stage}`);

let next = 0, done = 0;
const failures: string[] = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    const e = catalog.entries[j.entryIndex];
    try { await stageFile(j.url, path.join(stage, mirrorKey(e, j.kind))); }
    catch (err) { failures.push(`${e.id} ${j.kind}: ${String(err).slice(0, 160)}`); }
    if (++done % 500 === 0) console.log(`  staged ${done}/${jobs.length}`);
  }
}));

const dest = `gs://${bucket}/scores/v1`;
console.log(`Uploading → ${dest}`);
execSync(`gsutil -m -q -h "Cache-Control:public, max-age=31536000, immutable" rsync -r "${path.join(stage, 'scores/v1')}" ${dest}`, { stdio: 'inherit' });

// Record what is actually in the bucket. Anything missing keeps serving from its source.
const present = new Set(
  execSync(`gsutil ls -r ${dest}`, { encoding: 'utf8', maxBuffer: 64 << 20 })
    .split(/\r?\n/).filter(l => l.startsWith('gs://')).map(l => l.slice(`gs://${bucket}/`.length)),
);
let mirroredFiles = 0;
catalog.entries.forEach(e => {
  const kinds = (Object.keys(URL_FIELD) as ScoreFileKind[]).filter(k => e[URL_FIELD[k]] && present.has(mirrorKey(e, k)));
  mirroredFiles += kinds.length;
  if (kinds.length) e.mirrored = kinds.sort(); else delete e.mirrored;
});
catalog.mirror = { bucket, at: new Date().toISOString() };
fs.writeFileSync(CATALOG, JSON.stringify(catalog));

console.log(JSON.stringify({ files: jobs.length, mirrored: mirroredFiles, stageFailures: failures.length, bucket }, null, 2));
if (failures.length) console.log('Failures (served from source instead):\n' + failures.slice(0, 30).join('\n'));
