// clearFillerDescriptions — remove the one generated blurb that was stamped onto releases
// whose AI-metadata call failed, without touching a single word anyone actually wrote.
//
//   npx tsx scripts/clearFillerDescriptions.ts --key <sa.json>            # DRY RUN (default)
//   npx tsx scripts/clearFillerDescriptions.ts --key <sa.json> --apply    # clear them
//   npx tsx scripts/clearFillerDescriptions.ts --key <sa.json> --restore <backup.json>
//
// Background: for a long time nothing in the publish flow asked the creator for a description.
// It was always generated from the album-metadata prompt, and when the model was unavailable
// that generator returned one fixed string. Films, books and games all got stamped with it.
// The generator no longer emits it and the app now hides it at display time, but the string is
// still in the data — so any consumer added later shows it again. This removes it at the source.
//
// ── Why this cannot erase anyone's writing ─────────────────────────────────────────────────
//  1. The match is Firestore server-side EQUALITY against the exact literal below. A description
//     that merely CONTAINS it, or has so much as a trailing word, does not match and is skipped.
//     Nothing is scanned client-side, so there is no fuzzy or partial matching anywhere.
//  2. The write uses an updateMask limited to `description`. Every other field is untouched.
//  3. It sets the field to '' rather than deleting it, so the shape callers expect is preserved.
//  4. Every matched document is backed up to JSON — with its exact previous value — BEFORE any
//     write happens, and --restore puts them all back verbatim.
//  5. It is a dry run unless --apply is passed.

import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
loadServiceAccount(process.argv); // must run BEFORE firebaseAdminRest reads process.env

import { writeFileSync, readFileSync } from 'node:fs';
import { getAccessToken, fsPatch, adminConfig } from '../services/firebaseAdminRest';
import { LEGACY_FILLER_DESCRIPTION } from '../utils/description';

/** Collections the publish flow could have written a description into. */
const COLLECTIONS = ['albums', 'videos', 'personal_albums'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const restoreAt = args.indexOf('--restore');
const RESTORE_FILE = restoreAt !== -1 ? args[restoreAt + 1] : null;

const FS_DOC_ROOT = `projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;
const FS_BASE = `https://firestore.googleapis.com/v1/${FS_DOC_ROOT}`;

interface Hit { collection: string; id: string; title: string; ownerId: string; description: string; }

/**
 * Every document in `collection` whose description equals the filler EXACTLY.
 *
 * Uses runQuery with a server-side equality filter rather than listing the collection and
 * filtering here: a full listing can be truncated by paging limits, and a truncated scan
 * reports "all clear" while quietly leaving documents behind. Paged by document name so a
 * large result set still completes, and a failed page THROWS rather than returning a short
 * list that would read as success.
 */
async function findFiller(collection: string): Promise<Hit[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token — cannot query.');
  const out: Hit[] = [];
  let cursor: string | undefined;
  const PAGE = 300;

  for (;;) {
    const structuredQuery: any = {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'description' },
          op: 'EQUAL',
          value: { stringValue: LEGACY_FILLER_DESCRIPTION },
        },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE,
    };
    if (cursor) structuredQuery.startAt = { values: [{ referenceValue: cursor }], before: false };

    const res = await fetch(`${FS_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) {
      throw new Error(`runQuery ${collection} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }

    const rows = (await res.json()) as any[];
    const docs = (Array.isArray(rows) ? rows : []).filter(r => r?.document);
    for (const r of docs) {
      const f = r.document.fields || {};
      out.push({
        collection,
        id: String(r.document.name).split('/').pop()!,
        title: f.title?.stringValue || '(untitled)',
        ownerId: f.ownerId?.stringValue || '',
        description: f.description?.stringValue ?? '',
      });
    }
    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1].document.name;
  }
  return out;
}

/** Put back exactly what a backup file recorded. */
async function restore(file: string): Promise<void> {
  const hits: Hit[] = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`Restoring ${hits.length} description(s) from ${file}\n`);
  let ok = 0;
  for (const h of hits) {
    const done = await fsPatch(`${h.collection}/${h.id}`, { description: h.description });
    if (done) ok++;
    else console.warn(`  FAILED ${h.collection}/${h.id}`);
  }
  console.log(`\nRestored ${ok}/${hits.length}.`);
}

async function main() {
  const cred = loadServiceAccount(process.argv);
  if (!cred.ok) {
    console.error(cred.error ? `\n${cred.error}\n` : '');
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }
  console.log(`Credentials: ${cred.source}`);
  const pre = await preflightCredentials();
  if (!pre.ok) { console.error(`\n${pre.message}`); process.exit(1); }
  console.log(`Connected: ${pre.message}\n`);

  if (RESTORE_FILE) return restore(RESTORE_FILE);

  console.log(`Looking for descriptions equal to: ${JSON.stringify(LEGACY_FILLER_DESCRIPTION)}\n`);
  const hits: Hit[] = [];
  for (const c of COLLECTIONS) {
    const found = await findFiller(c);
    console.log(`  ${c.padEnd(18)} ${String(found.length).padStart(4)} match(es)`);
    hits.push(...found);
  }

  if (!hits.length) {
    console.log('\nNothing to clear — no document carries the filler.');
    return;
  }

  console.log(`\n${hits.length} document(s) carry the filler and nothing else:\n`);
  for (const h of hits.slice(0, 40)) {
    console.log(`  ${h.collection}/${h.id.padEnd(34)} ${h.title}`);
  }
  if (hits.length > 40) console.log(`  … and ${hits.length - 40} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to clear these.');
    return;
  }

  // Back up BEFORE writing. A migration without an undo is a migration you cannot answer for.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `filler-descriptions-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(hits, null, 2), 'utf8');
  console.log(`\nBackup written: ${backup}`);
  console.log(`Undo with:  npx tsx scripts/clearFillerDescriptions.ts --key <sa.json> --restore ${backup}\n`);

  let ok = 0;
  const failed: Hit[] = [];
  for (const h of hits) {
    // updateMask=description — every other field on the document is left exactly as it was.
    const done = await fsPatch(`${h.collection}/${h.id}`, { description: '' });
    if (done) ok++; else failed.push(h);
  }
  console.log(`Cleared ${ok}/${hits.length}.`);
  if (failed.length) {
    console.log(`\n${failed.length} failed — re-run to retry just these:`);
    for (const h of failed) console.log(`  ${h.collection}/${h.id}`);
  }

  // Verify against the database rather than trusting the write loop's own tally.
  let remaining = 0;
  for (const c of COLLECTIONS) remaining += (await findFiller(c)).length;
  console.log(remaining === 0
    ? '\nVerified: no document carries the filler any more.'
    : `\nVerified: ${remaining} still carry it — re-run to finish.`);
}

main().catch(e => { console.error('\nFailed:', e?.message || e); process.exit(1); });
