// Moves media of shared and org Tela documents from users/{uid}/tela (public, permanent token links) to tela-media
// (served only after a member check), and rewrites the documents to point at the new paths.
// Old links keep working until this has run with --revoke-old.
//
//   node scripts/migrateTelaMedia.mjs                 report only; nothing is changed
//   node scripts/migrateTelaMedia.mjs --apply         copy objects and rewrite project snapshots and cloud copies
//   node scripts/migrateTelaMedia.mjs --revoke-old    with --apply: also delete the old objects, which kills the old links
//
// Personal documents never shared are left alone: their links are theirs, and they may sit in public articles.
// A public or chat copy of a shared document's image needs telaMediaRelease/{pid}, so check the report's list first.
// Auth: a firebase-tools login (`npx firebase-tools projects:list` refreshes it).
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

const APPLY = process.argv.includes('--apply');
const REVOKE = process.argv.includes('--revoke-old');
if (REVOKE && !APPLY) { console.error('--revoke-old needs --apply'); process.exit(2); }

const PROJECT = 'gen-lang-client-0665118474';
const BUCKET = process.env.STORAGE_BUCKET || `${PROJECT}.firebasestorage.app`;
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired: run `npx firebase-tools projects:list`, then retry.'); process.exit(2); }
const H = { Authorization: `Bearer ${tok.access_token}` };
const OPS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/plajah-ops/documents`;
const PROD = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/plajah-prod/documents`;
const GCS = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
const OLD_URL = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/"\\]+\/o\/users%2F([^%"\\]+)%2Ftela%2F([^?"\\]+)\?alt=media(?:&(?:amp;)?token=[\w-]+)?/g;

const str = f => f?.stringValue;
async function listAll(url) {
  const out = [];
  let page = '';
  do {
    const res = await fetch(`${url}?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: H });
    if (!res.ok) throw new Error(`list ${url}: ${res.status}`);
    const json = await res.json();
    out.push(...(json.documents || []));
    page = json.nextPageToken || '';
  } while (page);
  return out;
}
async function getDoc(url) {
  const res = await fetch(url, { headers: H });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${url}: ${res.status}`);
  return res.json();
}

/** Rewrites the links in one JSON text, copying each object once. */
async function rewrite(json, pid, orgId, stats, oldObjects) {
  const found = [...json.matchAll(OLD_URL)];
  let next = json;
  for (const m of found) {
    const uid = decodeURIComponent(m[1]), file = decodeURIComponent(m[2]);
    const from = `users/${uid}/tela/${file}`;
    const rel = orgId ? `${pid}/org/${orgId}/${uid}/${file}` : `${pid}/user/${uid}/${file}`;
    stats.links++;
    oldObjects.add(from);
    if (APPLY) {
      const res = await fetch(`${GCS}/${encodeURIComponent(from)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(`tela-media/${rel}`)}`, { method: 'POST', headers: H });
      if (!res.ok) { stats.failed.push(from); continue; }
    }
    next = next.split(m[0]).join(`/api/tela-media/${rel}`);
  }
  return next;
}

const gunzipB64 = d => d.startsWith('r:') ? decodeURIComponent(escape(Buffer.from(d.slice(2), 'base64').toString('latin1'))) : zlib.gunzipSync(Buffer.from(d.slice(2), 'base64')).toString('utf8');
const gzipB64 = t => `g:${zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64')}`;
const CHUNK = 700_000;

async function migrateSnapshot(pid, orgId, stats, oldObjects) {
  const head = await getDoc(`${OPS}/coedit/${pid}/snap/head`);
  const gen = str(head?.fields?.gen), chunks = Number(head?.fields?.chunks?.integerValue || 0);
  if (!gen || !chunks) return;
  let data = '';
  for (let i = 0; i < chunks; i++) data += str((await getDoc(`${OPS}/coedit/${pid}/chunks/snap_${gen}_${i}`))?.fields?.d) || '';
  const json = gunzipB64(data);
  const next = await rewrite(json, pid, orgId, stats, oldObjects);
  if (next === json || !APPLY) return;
  const gz = gzipB64(next);
  const parts = gz.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) || [''];
  const newGen = `${gen}m`;
  for (let i = 0; i < parts.length; i++) {
    await fetch(`${OPS}/coedit/${pid}/chunks/snap_${newGen}_${i}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { d: { stringValue: parts[i] }, n: { integerValue: String(parts.length) }, by: { stringValue: 'migration' } } }) });
  }
  await fetch(`${OPS}/coedit/${pid}/snap/head?updateMask.fieldPaths=gen&updateMask.fieldPaths=chunks`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { gen: { stringValue: newGen }, chunks: { integerValue: String(parts.length) } } }) });
  stats.snapshots++;
}

async function migrateCloudCopy(pid, orgId, stats, oldObjects) {
  const head = await getDoc(`${PROD}/creativeProjects/${pid}`);
  const path = str(head?.fields?.headPath);
  if (!path) return;
  const res = await fetch(`${GCS}/${encodeURIComponent(path)}?alt=media`, { headers: H });
  if (!res.ok) return;
  const raw = Buffer.from(await res.arrayBuffer());
  const gz = path.endsWith('.gz');
  const json = (gz ? zlib.gunzipSync(raw) : raw).toString('utf8');
  const next = await rewrite(json, pid, orgId, stats, oldObjects);
  if (next === json || !APPLY) return;
  const body = gz ? zlib.gzipSync(Buffer.from(next, 'utf8')) : Buffer.from(next, 'utf8');
  await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, { method: 'POST', headers: { ...H, 'Content-Type': gz ? 'application/gzip' : 'application/json' }, body });
  stats.cloudCopies++;
}

const stats = { projects: 0, links: 0, snapshots: 0, cloudCopies: 0, failed: [] };
const oldObjects = new Set();
for (const d of await listAll(`${OPS}/coedit`)) {
  const pid = d.name.split('/').pop();
  if (!pid.startsWith('tela__')) continue;
  stats.projects++;
  const orgId = str(d.fields?.orgId);
  await migrateSnapshot(pid, orgId, stats, oldObjects);
  await migrateCloudCopy(pid, orgId, stats, oldObjects);
}
console.log(`${APPLY ? 'Applied' : 'Report only'}: ${stats.projects} shared Tela projects, ${stats.links} links to ${oldObjects.size} objects, ${stats.snapshots} snapshots and ${stats.cloudCopies} cloud copies rewritten.`);
if (stats.failed.length) console.log(`Could not copy ${stats.failed.length}:`, stats.failed.slice(0, 20));
if (REVOKE) {
  if (stats.failed.length) { console.log('Old objects kept because some copies failed. Fix those and run again.'); process.exit(1); }
  for (const path of oldObjects) await fetch(`${GCS}/${encodeURIComponent(path)}`, { method: 'DELETE', headers: H });
  console.log(`Deleted ${oldObjects.size} old objects; their token links no longer work.`);
}
