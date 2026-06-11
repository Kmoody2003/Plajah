/**
 * Migrate Firestore data off the AI-Studio free-tier database.
 *
 * The AI-Studio database (ai-studio-5564c944-…, ENTERPRISE edition) is
 * permanently capped at free-tier read quota — it cannot exceed it even with
 * billing enabled. The project already has a `(default)` STANDARD-edition
 * database that bills normally. This script copies all data across using
 * Firestore's *managed* export/import (Google handles subcollections,
 * consistency and scale — no hand-rolled document walk).
 *
 * Prerequisites:
 *   1. The project is on the Blaze (pay-as-you-go) plan. Managed export/import
 *      and a billed Standard database both require Blaze. (Decision: yours —
 *      it puts a card on file; classics-sized usage is typically cents/month.)
 *   2. A service-account key with roles:
 *        - Cloud Datastore Import Export Admin
 *        - Storage Admin (or Object Admin on the staging bucket)
 *   3. A GCS bucket for staging the export (defaults to the project's
 *      appspot bucket; override with --bucket).
 *
 * Run (export then import, polling each operation to completion):
 *   node scripts/migrate-firestore.mjs <service-account.json> \
 *     --source ai-studio-5564c944-b75c-4461-bcd3-afa92800323b \
 *     --target "(default)" \
 *     --bucket gs://gen-lang-client-0665118474.appspot.com
 *
 * Add --dry-run to print the planned operations without executing.
 */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const PROJECT = 'gen-lang-client-0665118474';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const DRY = process.argv.includes('--dry-run');
const SOURCE = arg('source', 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b');
const TARGET = arg('target', '(default)');
const BUCKET = arg('bucket', `gs://${PROJECT}.appspot.com`);

function loadServiceAccount() {
  const path = process.argv[2];
  if (!path || path.startsWith('--')) {
    console.error('Usage: node scripts/migrate-firestore.mjs <service-account.json> [--source ..] [--target ..] [--bucket ..] [--dry-run]');
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function mintToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned =
    b64({ alg: 'RS256', typ: 'JWT' }) + '.' +
    b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${sig}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token mint failed: ' + JSON.stringify(data).slice(0, 200));
  return data.access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollOperation(token, opName) {
  // opName is a full resource path: projects/.../databases/.../operations/...
  for (;;) {
    const res = await fetch(`https://firestore.googleapis.com/v1/${opName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const op = await res.json();
    if (op.done) {
      if (op.error) throw new Error('Operation failed: ' + JSON.stringify(op.error));
      return op;
    }
    process.stdout.write('.');
    await sleep(5000);
  }
}

async function main() {
  const sa = loadServiceAccount();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPrefix = `${BUCKET.replace(/\/$/, '')}/firestore-migration-${stamp}`;

  console.log('Project :', PROJECT);
  console.log('Source  :', SOURCE);
  console.log('Target  :', TARGET);
  console.log('Staging :', exportPrefix);
  console.log('SA      :', sa.client_email);
  if (DRY) { console.log('\n[dry-run] Would export source → staging, then import staging → target.'); return; }

  const token = await mintToken(sa);

  // 1) Export the source database to GCS
  console.log('\n[1/2] Exporting source database…');
  const expRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(SOURCE)}:exportDocuments`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ outputUriPrefix: exportPrefix }) },
  );
  const exp = await expRes.json();
  if (!exp.name) throw new Error('Export start failed: ' + JSON.stringify(exp).slice(0, 300));
  const expDone = await pollOperation(token, exp.name);
  const outputPrefix = expDone.metadata?.outputUriPrefix || exportPrefix;
  console.log('\n      Exported to', outputPrefix);

  // 2) Import the export into the target database
  console.log('[2/2] Importing into target database…');
  const impRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(TARGET)}:importDocuments`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputUriPrefix: outputPrefix }) },
  );
  const imp = await impRes.json();
  if (!imp.name) throw new Error('Import start failed: ' + JSON.stringify(imp).slice(0, 300));
  await pollOperation(token, imp.name);
  console.log('\n\nMigration complete. Next: set firestoreDatabaseId to the target in firebase-applet-config.json, redeploy security rules to the target DB, and test.');
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
