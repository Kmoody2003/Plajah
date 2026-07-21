#!/usr/bin/env node
/**
 * Plajah Heritage Archive — import rights sidecars into Firestore.
 *
 * Walks ./holdings for *.rights.json, normalises the two sidecar shapes
 * (Internet Archive volumes and Met CC0 objects) into one `archiveAssets`
 * document schema, and writes them to the named Firestore database via the
 * REST API using the caller's gcloud credentials.
 *
 *   node import-archive-assets.mjs --dry-run      # print what would be written
 *   node import-archive-assets.mjs                # write to Firestore
 *
 * Requires: gcloud auth (an access token is read from `gcloud auth print-access-token`).
 * Only assets that were actually uploaded to Storage get a storagePath; the
 * redundant combined Beni Hasan scan is skipped to match the upload set.
 */

import { readdir, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const PROJECT = 'gen-lang-client-0665118474';
const DATABASE = 'plajah-prod';
const COLLECTION = 'archiveAssets';
const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const STORAGE_PREFIX = 'archive';
const ROOT = path.resolve('./holdings');

/** Local dirs that were intentionally NOT uploaded (redundant backup scan). */
const SKIP_DIRS = new Set(['BeniHasanvols.12']);

const DRY = process.argv.includes('--dry-run');

function token() {
  // GCLOUD_TOKEN wins when set; otherwise shell out. `shell: true` is required
  // on Windows, where `gcloud` is a .cmd wrapper rather than an executable.
  if (process.env.GCLOUD_TOKEN) return process.env.GCLOUD_TOKEN.trim();
  return execSync('gcloud auth print-access-token', { encoding: 'utf8', shell: true }).trim();
}

/** Recursively collect *.rights.json paths. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walk(full)));
    } else if (entry.name.endsWith('.rights.json')) {
      out.push(full);
    }
  }
  return out;
}

/** Firestore REST typed-value encoding. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  return { stringValue: String(v) };
}

/** Stable, path-safe document id. */
function docId(rec, relDir) {
  if (rec.metObjectID) return `met-${rec.metObjectID}`;
  const base = `${relDir}/${rec.assetFile}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return base.slice(0, 1400);
}

/** Normalise either sidecar shape into one museum-wide schema. */
function normalise(rec, relPath) {
  const relDir = path.dirname(relPath).split(path.sep).join('/');
  const storagePath = `${STORAGE_PREFIX}/${relDir}/${rec.assetFile}`;
  const isMet = Boolean(rec.metObjectID);
  return {
    id: docId(rec, relDir),
    fields: {
      assetFile: rec.assetFile,
      title: rec.title || rec.assetFile,
      source: isMet ? 'met-open-access' : 'internet-archive',
      acquisitionId: rec.acquisitionId || null,
      creator: rec.creator || null,
      published: rec.published || rec.date || null,
      culture: rec.culture || null,
      medium: rec.medium || null,
      department: rec.department || null,
      relevance: rec.relevance || null,
      sourceUrl: rec.sourceUrl || rec.objectUrl || rec.rights?.sourceUrl || null,
      metObjectID: rec.metObjectID ?? null,
      // Where the file now lives in Plajah's own storage.
      // NOTE: must be the firebasestorage.googleapis.com endpoint — it honours
      // storage.rules (which allow public read). The raw storage.googleapis.com
      // host is IAM-gated instead and returns 403 for anonymous readers.
      storagePath,
      downloadUrl:
        `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media`,
      // Rights block — the museum's non-negotiable layer
      rights: {
        tier: rec.rights?.tier || 'unknown',
        license: rec.rights?.license || 'unknown',
        attribution: rec.rights?.attribution || '',
        dateVerified: rec.rights?.dateVerified || null,
      },
      wing: 'africa',            // Vol. I holdings; future batches set their own
      discipline: 'combat',
      importedAt: new Date().toISOString(),
    },
  };
}

const files = await walk(ROOT);
console.log(`Found ${files.length} rights sidecars (skipping: ${[...SKIP_DIRS].join(', ')})`);

const docs = [];
for (const f of files) {
  const rec = JSON.parse(await readFile(f, 'utf8'));
  const rel = path.relative(ROOT, f).replace(/\.rights\.json$/, '');
  docs.push(normalise(rec, rel));
}

const bySource = docs.reduce((m, d) => { m[d.fields.source] = (m[d.fields.source] || 0) + 1; return m; }, {});
console.log('By source:', bySource);

if (DRY) {
  console.log('\n--- DRY RUN — sample document ---');
  console.log(JSON.stringify(docs[0], null, 2));
  console.log(`\nWould write ${docs.length} docs to ${DATABASE}/${COLLECTION}`);
  process.exit(0);
}

const TOKEN = token();
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${COLLECTION}`;
let ok = 0, fail = 0;

for (const d of docs) {
  const url = `${base}?documentId=${encodeURIComponent(d.id)}`;
  const body = { fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, toValue(v)])) };
  let res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Already exists → PATCH (idempotent re-runs)
  if (res.status === 409) {
    res = await fetch(`${base}/${encodeURIComponent(d.id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (res.ok) { ok++; process.stdout.write('.'); }
  else { fail++; console.log(`\n  !! ${d.id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); }
}

console.log(`\n\nDone. ${ok} written, ${fail} failed → ${DATABASE}/${COLLECTION}`);
