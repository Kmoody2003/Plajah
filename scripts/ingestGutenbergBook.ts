// ingestGutenbergBook — mirror public-domain Gutenberg texts into Plajah's reader.
//
//   npx tsx scripts/ingestGutenbergBook.ts --all --dry           # what would be written
//   npx tsx scripts/ingestGutenbergBook.ts --all --key <file>    # the whole K-12 shelf
//   npx tsx scripts/ingestGutenbergBook.ts 1342 --key <file>     # one book by Gutenberg id
//   npx tsx scripts/ingestGutenbergBook.ts --mcguffey --key <f>  # just the graded readers
//
// Credentials: --key <path to service-account JSON>, or GOOGLE_SERVICE_ACCOUNT_JSON in
// .env.local. --dry needs neither.
//
// Public domain means no licence gate to satisfy — but these are still stamped oerTextbook so
// they inherit the same protection as the OpenStax titles: free to every account, never sold,
// never part of Plajah+, and pinned that way by firestore.rules.

import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
loadServiceAccount(process.argv); // must run BEFORE firebaseAdminRest reads process.env

import { fsSet, getAccessToken, adminConfig } from '../services/firebaseAdminRest';
import {
  fetchGutenbergMeta, fetchGutenbergText, stripGutenbergBoilerplate,
  buildGutenbergText, countChapters, addLessonChapters,
} from '../services/gutenbergImport';
import { GUTENBERG_K12, MCGUFFEY_READERS, gutenbergBookId, gutenbergSeedById } from '../data/gutenbergK12';
import { composeAttribution } from '../services/oerLicenseGate';

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const doAll = args.includes('--all');
const mcguffeyOnly = args.includes('--mcguffey');
const keyFlag = args.indexOf('--key');
// Guard the -1: with no --key present, `keyFlag + 1` is 0 and would silently drop the
// FIRST positional argument — one book quietly missing from a multi-book run.
const isKeyValue = (i: number) => keyFlag !== -1 && i === keyFlag + 1;
const explicitIds = args
  .filter((a, i) => !a.startsWith('--') && !isKeyValue(i))
  .map(Number)
  .filter(n => Number.isFinite(n));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(1000 * i);
    try { return await fn(); } catch (e) { last = e; console.warn(`   !  ${label} retry ${i + 1}: ${(e as Error).message}`); }
  }
  throw last;
}

async function uploadText(path: string, text: string): Promise<string> {
  const encoded = encodeURIComponent(path);
  const token = await getAccessToken();
  if (!token) throw new Error('No access token.');
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encoded}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    },
  );
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media`;
}

async function ingest(gutenbergId: number) {
  const seed = gutenbergSeedById(gutenbergId);
  const meta = await retry(`meta #${gutenbergId}`, () => fetchGutenbergMeta(gutenbergId));
  const raw = await retry(`text #${gutenbergId}`, () => fetchGutenbergText(meta));

  let body = stripGutenbergBoilerplate(raw);
  const stripped = raw.length - body.length;

  // Only for books with no chapters of their own. The graded readers divide into "LESSON I."
  // headings the reader doesn't recognise, so without this a 63-lesson book is one long block.
  // Novels already carry CHAPTER headings and must be left alone.
  // Applied when the reader would find NO structure, and also when it would find far too
  // little: Little Women's 47 word-numbered chapters were being read as 2, which is a worse
  // contents list than none. A candidate style has to beat the existing count by 3x to win,
  // so books that already parse correctly are never touched.
  let lessons = 0;
  const existing = countChapters(body);
  const candidate = addLessonChapters(body);
  if (candidate.added >= 3 && candidate.added > existing * 3) {
    body = candidate.text;
    lessons = candidate.added;
  }

  const text = buildGutenbergText(meta, body);
  const chapters = countChapters(text);

  console.log(`\n── #${gutenbergId} ${meta.title.slice(0, 52)}`);
  console.log(`   text     ${(text.length / 1024).toFixed(0)} KB · ${chapters} chapter(s)${lessons ? ` (from ${lessons} lessons)` : ''} · ${(stripped / 1024).toFixed(0)} KB boilerplate removed`);
  if (chapters === 0) console.warn('   !  no chapters — this book will read as one block');

  // Boilerplate is ~18-20 KB. Removing almost nothing means the markers were missed and the
  // licence text is still in the book; removing most of the file means we cut into the work.
  if (stripped < 2_000) console.warn('   !  little boilerplate removed — check the markers for this title');
  if (body.length < raw.length * 0.5) throw new Error('stripping removed over half the file — refusing to publish');
  if (body.length < 10_000) throw new Error(`only ${body.length} bytes of text — refusing to publish`);

  const id = gutenbergBookId(gutenbergId);
  const storagePath = `books/gutenberg/${gutenbergId}/full.txt`;

  if (dryRun) {
    console.log(`   [dry] would upload → ${storagePath}`);
    console.log(`   [dry] would write  → albums/${id}`);
    console.log(`   [dry] opens with: ${body.slice(0, 90).replace(/\n/g, ' ⏎ ')}`);
    return;
  }

  const url = await retry('upload', () => uploadText(storagePath, text));
  const sourceUrl = `https://www.gutenberg.org/ebooks/${gutenbergId}`;
  const attribution = composeAttribution('Project Gutenberg', meta.title, 'PD', sourceUrl);

  const record = {
    id,
    type: 'BOOK',
    title: meta.title,
    artist: meta.authors.join(', ') || 'Unknown',
    description: `${attribution}${seed?.note ? ` ${seed.note}` : ''}${seed?.periodPiece ? ' Period schoolbook — reflects the assumptions of its time.' : ''} Free for everyone on Plajah — textbooks are never sold and are never part of Plajah+.`,
    coverImage: '',
    genre: seed?.periodPiece ? 'Graded Reader' : 'Literature',
    ownerId: 'system_admin',
    isGlobalArchive: true,
    isPublic: true,
    createdAt: Date.now(),
    // Same gate as the OpenStax titles — pinned by firestore.rules.
    oerTextbook: true,
    price: 0,
    isPaywalled: false,
    oerLicense: 'PD',
    oerLicenseUrl: 'https://www.gutenberg.org/policy/permission.html',
    oerAttribution: attribution,
    oerSourceUrl: sourceUrl,
    oerGradeBands: seed?.gradeBands ?? [],
    oerPeriodPiece: seed?.periodPiece === true,
    bookChapters: [{ id: `${id}_full`, title: meta.title, url, format: 'TXT', price: 0, isPaywalled: false }],
  };

  let written = false;
  for (let attempt = 0; attempt < 4 && !written; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    written = await fsSet(`albums/${id}`, record);
    if (!written) console.warn(`   !  album write retry ${attempt + 1}`);
  }
  if (!written) throw new Error(`Uploaded the text but could not write albums/${id}. Re-run to retry.`);
  console.log(`   ✓ albums/${id}`);
}

async function main() {
  if (!dryRun && !adminConfig.hasServiceAccount()) {
    const cred = loadServiceAccount(process.argv);
    console.error(cred.error ? `\n${cred.error}\n` : `\n${CREDENTIAL_HELP}\n`);
    console.error('Or add --dry to preview without writing anything.');
    process.exit(1);
  }
  if (!dryRun) {
    const pre = await preflightCredentials();
    if (!pre.ok) { console.error(`\n${pre.message}\n`); process.exit(1); }
    console.log(`Credentials: ${loadServiceAccount(process.argv).source} — ${pre.message}`);
  }

  const targets = mcguffeyOnly ? MCGUFFEY_READERS.map(b => b.id)
    : doAll ? GUTENBERG_K12.map(b => b.id)
    : explicitIds;

  if (!targets.length) {
    console.error('Usage: npx tsx scripts/ingestGutenbergBook.ts <gutenbergId…> | --all | --mcguffey  [--dry] [--key <file>]');
    process.exit(1);
  }

  console.log(`${targets.length} public-domain title(s)${dryRun ? ' (dry run)' : ''}`);
  let ok = 0;
  const failures: string[] = [];
  for (const id of targets) {
    try { await ingest(id); ok++; }
    catch (e) { failures.push(`#${id}: ${(e as Error).message}`); console.error(`   ✗ #${id}: ${(e as Error).message}`); }
    await sleep(400); // Gutenberg rate-limits aggressively; stay well under it
  }

  console.log(`\n${ok}/${targets.length} ingested.`);
  if (failures.length) { console.log('Failed:'); failures.forEach(f => console.log(`  · ${f}`)); }
  console.log('All are public domain and free to every account.');
  if (failures.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
