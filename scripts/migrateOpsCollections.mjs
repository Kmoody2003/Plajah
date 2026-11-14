// Copies the org back-office collections (services/opsCollections.ts) from plajah-prod into plajah-ops,
// subcollections included, and fills the read-only mirrors (organizations, productions, businessPages,
// admins). DRY RUN BY DEFAULT — pass --apply to write.
//
//   node scripts/migrateOpsCollections.mjs            (dry run: counts what would be copied)
//   node scripts/migrateOpsCollections.mjs --apply
//
// Safe to re-run at any time, including after the cutover: a doc is copied only when plajah-ops has no
// copy or the plajah-prod version is NEWER (updateTime), so writes made in plajah-ops are never
// overwritten by the stale plajah-prod originals. The originals are left in place as a backup.
// Auth: RULES_ACCESS_TOKEN, else `gcloud auth print-access-token`.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PROJECT = 'gen-lang-client-0665118474';
const SRC = 'plajah-prod', DST = 'plajah-ops';
const apply = process.argv.includes('--apply');
const src = fs.readFileSync(new URL('../services/opsCollections.ts', import.meta.url), 'utf8');
const listOf = (name) => [...src.split(name)[1].split(/\]\)|\] as const/)[0].matchAll(/'([A-Za-z_]\w*)'/g)].map(m => m[1]);
const OPS = listOf('OPS_COLLECTIONS: ReadonlySet<string> = new Set(');
const MIRRORED = listOf('OPS_MIRRORED_COLLECTIONS = ');
if (OPS.length < 50 || MIRRORED.length !== 4) { console.error('could not read services/opsCollections.ts', OPS.length, MIRRORED.length); process.exit(2); }

const token = process.env.RULES_ACCESS_TOKEN
  || execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const docs = (db) => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${db}/documents`;

async function req(method, url, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    if (r && r.status !== 429 && r.status < 500) return r;
    await new Promise(res => setTimeout(res, 500 * 2 ** i));
  }
  throw new Error(`${method} ${url} kept failing`);
}

/** All docs (full) directly under `parent` ('' = root) in collection `col`, plus "missing" docs (no fields,
 *  no createTime) that exist only as the parent of a subcollection, e.g. districtPersona/{uid}/rosters. */
async function listDocs(db, parent, col) {
  const out = []; let page = '';
  do {
    const r = await req('GET', `${docs(db)}${parent ? '/' + parent : ''}/${col}?pageSize=300&showMissing=true${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    if (r.status === 404) return out;
    if (!r.ok) throw new Error(`list ${db} ${parent}/${col}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    out.push(...(j.documents || []));
    page = j.nextPageToken || '';
  } while (page);
  return out;
}

async function subcollections(db, docPath) {
  const r = await req('POST', `${docs(db)}/${docPath}:listCollectionIds`, { pageSize: 100 });
  if (!r.ok) return [];
  return (await r.json()).collectionIds || [];
}

const rel = (name) => name.split('/documents/')[1];
const tally = { scanned: 0, copied: 0, upToDate: 0, errors: 0 };

async function copyTree(parent, col, depth = 0, withSubs = true) {
  const srcDocs = await listDocs(SRC, parent, col);
  for (const d of srcDocs) {
    const path = rel(d.name);
    if (!d.createTime) {   // missing parent: nothing to copy itself, but its subcollections are real data
      if (withSubs && depth < 4) for (const sub of await subcollections(SRC, path)) await copyTree(path, sub, depth + 1);
      continue;
    }
    tally.scanned++;
    const dst = await req('GET', `${docs(DST)}/${path}?mask.fieldPaths=__name__`);
    const dstTime = dst.ok ? (await dst.json()).updateTime : null;
    if (dstTime && dstTime >= d.updateTime) tally.upToDate++;
    else if (!apply) tally.copied++;
    else {
      const w = await req('PATCH', `${docs(DST)}/${path}`, { fields: d.fields || {} });
      if (w.ok) tally.copied++; else { tally.errors++; console.error('  write failed', path, w.status, (await w.text()).slice(0, 200)); }
    }
    if (withSubs && depth < 4) for (const sub of await subcollections(SRC, path)) await copyTree(path, sub, depth + 1);
  }
  return srcDocs.length;
}

for (const col of [...OPS, ...MIRRORED]) {
  // Mirrors are top-level docs only: ops rules read nothing below them.
  const n = await copyTree('', col, 0, !MIRRORED.includes(col));
  if (n) console.log(`${col}: ${n} top-level docs${MIRRORED.includes(col) ? ' (mirror)' : ''}`);
}
console.log(`${apply ? '' : '[dry-run] '}scanned ${tally.scanned}, ${apply ? 'copied' : 'would copy'} ${tally.copied}, already current ${tally.upToDate}, errors ${tally.errors}`);
process.exit(tally.errors ? 1 : 0);
