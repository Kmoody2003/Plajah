// Moves files of gated sanctuary items out of public-URL Storage into sanctuaries/{owner}/ (no client read, no token)
// and rewrites the record to `gated:<path>`. FREE items and links to other sites are left alone. Dry run unless --apply.
//
//   npx tsx --env-file=.env.local scripts/migrateSanctuaryGated.ts [--apply]
//
// Run after the server, client and storage rules are live. A source inside sanctuaries/ is moved; a source elsewhere is
// copied and left in place, because the owner may use it publicly too. Those are listed for review.
import { fsList, fsPatch, getAccessToken } from '../services/firebaseAdminRest';
import { SANCTUARY_ITEM_OWNER, gatedRef, isGatedRef } from '../services/sanctuaryMediaCore';
import { objectBelongsTo, storagePathsIn } from '../services/mediaTrashPolicy';

const apply = process.argv.includes('--apply');
const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const API = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
let moved = 0, skipped = 0, failed = 0;
const left: string[] = [];

async function headers() { return { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }; }

/** Copy src to dst with no download token, following GCS's rewrite tokens for big files. */
async function copy(src: string, dst: string): Promise<boolean> {
  let rewriteToken = '';
  for (let i = 0; i < 50; i++) {
    const url = `${API}/${encodeURIComponent(src)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(dst)}${rewriteToken ? `?rewriteToken=${encodeURIComponent(rewriteToken)}` : ''}`;
    const r = await fetch(url, { method: 'POST', headers: await headers(), body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: null } }) });
    if (!r.ok) return false;
    const j: any = await r.json();
    if (j.done) return true;
    rewriteToken = j.rewriteToken;
  }
  return false;
}

async function secure(owner: string, itemId: string, url: string): Promise<string | null> {
  const [path] = storagePathsIn(url, BUCKET);
  if (!path) return null;
  const meta = await fetch(`${API}/${encodeURIComponent(path)}`, { headers: await headers() });
  if (!meta.ok) { skipped++; console.log(`Skipping ${itemId}: object not readable (${meta.status})`); return null; }
  const info: any = await meta.json();
  if (!objectBelongsTo(owner, path, info?.metadata?.ownerUid) && !path.startsWith(`sanctuaries/${owner}/`)) { skipped++; console.log(`Skipping ${itemId}: object isn't the owner's`); return null; }
  const dst = `sanctuaries/${owner}/secured/${itemId}_${path.split('/').pop()}`;
  moved++;
  if (!apply) return gatedRef(dst);
  if (!(await copy(path, dst))) { failed++; return null; }
  if (path.startsWith('sanctuaries/')) await fetch(`${API}/${encodeURIComponent(path)}`, { method: 'DELETE', headers: await headers() });
  else left.push(path);
  return gatedRef(dst);
}

for (const [col, ownerField] of Object.entries(SANCTUARY_ITEM_OWNER)) {
  const items = await fsList(col, { strict: true, pageSize: 300, maxDocs: 50000 });
  for (const { id, data } of items) {
    if ((data.accessType || 'TIER') === 'FREE') continue;
    const owner = String(data[ownerField] || '');
    const patch: Record<string, unknown> = {};
    for (const field of ['url', 'contentUrl']) {
      if (typeof data[field] === 'string' && !isGatedRef(data[field])) { const next = await secure(owner, id, data[field]); if (next) patch[field] = next; }
    }
    if (Array.isArray(data.attachments)) {
      let changed = false;
      const next = [];
      for (const a of data.attachments) {
        const ref = a?.url && !isGatedRef(a.url) ? await secure(owner, id, a.url) : null;
        if (ref) changed = true;
        next.push(ref ? { ...a, url: ref } : a);
      }
      if (changed) patch.attachments = next;
    }
    if (apply && Object.keys(patch).length && !(await fsPatch(`${col}/${id}`, patch))) failed++;
  }
}
console.log(`${apply ? 'Secured' : 'Would secure'} ${moved} files, skipped ${skipped}. Failed: ${failed}.`);
if (left.length) console.log(`Copied but left in place, review these public originals:\n${left.join('\n')}`);
process.exit(failed ? 1 : 0);
