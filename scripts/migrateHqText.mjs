// Moves document text off orgAssets records into the closed orgAssetText collection. Dry run unless --apply.
//   node scripts/migrateHqText.mjs            print what would move
//   node scripts/migrateHqText.mjs --apply    move it
// Safe to run again. Text is written first and the old field removed only after that write landed.
import fs from 'fs'; import os from 'os';

const APPLY = process.argv.includes('--apply');
const token = process.env.RULES_ACCESS_TOKEN || JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens.access_token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-ops/documents';

async function send(url, body) {
  const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

let moved = 0, seen = 0, pageToken = '';
do {
  const r = await fetch(`${base}/orgAssets?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: H }).then(x => x.json());
  if (r.error) throw new Error(r.error.message);
  for (const d of r.documents || []) {
    seen++;
    const f = d.fields || {};
    const text = f.rawContentText?.stringValue;
    if (text === undefined) continue;
    const id = d.name.split('/').pop();
    moved++;
    console.log(`${APPLY ? 'move' : 'would move'} ${id}: ${text.length} chars`);
    if (!APPLY) continue;
    await send(`${base}/orgAssetText/${id}`, { fields: {
      assetId: { stringValue: id }, scopeKind: f.scopeKind || { stringValue: '' }, scopeId: f.scopeId || { stringValue: '' },
      text: { stringValue: text }, updatedAt: { integerValue: String(Date.now()) },
    } });
    // rawContentText is in the mask but not the body, which removes it.
    await send(`${base}/orgAssets/${id}?updateMask.fieldPaths=rawContentText&updateMask.fieldPaths=hasText`, { fields: { hasText: { booleanValue: !!text } } });
  }
  pageToken = r.nextPageToken || '';
} while (pageToken);
console.log(`${seen} records, ${moved} with text${APPLY ? ' moved' : ' to move (dry run)'}`);
