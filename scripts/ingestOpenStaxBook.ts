// ingestOpenStaxBook — mirror an OpenStax textbook into Plajah so it reads natively in the
// Lorea reader, with no leaving the page.
//
//   npx tsx scripts/ingestOpenStaxBook.ts physics --dry          # fetch + report, write nothing
//   npx tsx scripts/ingestOpenStaxBook.ts physics --key <file>    # ingest one book
//   npx tsx scripts/ingestOpenStaxBook.ts --all --key <file>      # every catalogued OpenStax title
//
// Credentials: pass --key with the path to a Firebase service-account JSON, or set
// GOOGLE_SERVICE_ACCOUNT_JSON in .env.local. --dry needs neither.
//
// THE GATE, which is the point of this script:
//   Textbooks are free to everyone, forever. Every record written here is stamped
//   oerTextbook:true, price:0, isPaywalled:false, and firestore.rules refuses to let any of
//   those be changed. That is what makes the CC BY-NC-SA titles safe to host — NonCommercial
//   restricts commercial use, not hosting, and a book that can never be sold or placed behind
//   Plajah+ is not being used commercially. The licence is read from OpenStax at ingest, never
//   assumed, because assuming "OpenStax = CC BY" is how NC material ends up behind a paywall.

import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
loadServiceAccount(process.argv); // must run BEFORE firebaseAdminRest reads process.env

import { fsSet, getAccessToken, adminConfig } from '../services/firebaseAdminRest';
import {
  resolveBook, fetchToc, fetchPageText, buildBookText,
  type OpenStaxBookRef, type OpenStaxPage,
} from '../services/openstaxImport';
import { OER_LIBRARY } from '../data/oerLibrary';
import { composeAttribution } from '../services/oerLicenseGate';

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const doAll = args.includes('--all');
// Drop the value that follows --key, so a file path isn't mistaken for a book slug.
const keyFlag = args.indexOf('--key');
// Guard the -1: without --key, `keyFlag + 1` is 0 and drops the first slug silently.
const slugs = args.filter((a, i) => !a.startsWith('--') && !(keyFlag !== -1 && i === keyFlag + 1));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function uploadText(path: string, text: string): Promise<string> {
  const encoded = encodeURIComponent(path);
  const token = await getAccessToken();
  if (!token) throw new Error('No access token — is GOOGLE_SERVICE_ACCOUNT_JSON set?');
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

async function ingest(slug: string) {
  console.log(`\n── ${slug} ──`);
  const book: OpenStaxBookRef = await resolveBook(slug);
  console.log(`   ${book.title}`);
  console.log(`   licence  ${book.license}  (read from OpenStax, not assumed)`);

  const toc: OpenStaxPage[] = await fetchToc(book);
  console.log(`   pages    ${toc.length}`);

  const pages: Array<OpenStaxPage & { text: string }> = [];
  let failed = 0;
  for (let i = 0; i < toc.length; i++) {
    const page = toc[i];
    // Retry with backoff: a transient blip against a free public API would otherwise drop a
    // page of the textbook permanently, and a book missing two sections still reads as whole.
    let text: string | null = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 3 && text === null; attempt++) {
      if (attempt) await sleep(600 * attempt);
      try { text = await fetchPageText(book, page.id); }
      catch (e) { lastErr = (e as Error).message; }
    }
    if (text === null) {
      failed++;
      console.warn(`   !  page ${i + 1}/${toc.length} "${page.title}" — ${lastErr}`);
    } else {
      pages.push({ ...page, text });
    }
    if ((i + 1) % 25 === 0) console.log(`   …  ${i + 1}/${toc.length}`);
    await sleep(60); // be a considerate guest on someone else's free service
  }

  const text = buildBookText(book, pages);
  const chapters = new Set(pages.map(p => p.chapterNumber).filter(n => n !== null)).size;
  console.log(`   text     ${(text.length / 1024).toFixed(0)} KB · ${chapters} chapters · ${failed} page(s) failed`);

  // A book that lost pages would read as complete while quietly missing content, so refuse it.
  if (failed > toc.length * 0.05) {
    throw new Error(`${failed}/${toc.length} pages failed — refusing to publish an incomplete textbook.`);
  }

  const id = `openstax_${slug.replace(/-/g, '_')}`;
  const storagePath = `books/openstax/${slug}/full.txt`;
  const catalogued = OER_LIBRARY.find(i => i.sourceUrl.endsWith(`/books/${slug}`));

  if (catalogued && catalogued.license !== book.license) {
    throw new Error(
      `Licence mismatch: catalogue says ${catalogued.license}, OpenStax says ${book.license}. ` +
      `Fix data/oerLibrary.ts first — run: npx tsx scripts/ingestOerLibrary.ts --verify-openstax`,
    );
  }

  if (dryRun) {
    console.log(`   [dry] would upload → ${storagePath}`);
    console.log(`   [dry] would write  → albums/${id}`);
    console.log(`   [dry] preview:\n${text.slice(0, 300).split('\n').map(l => `        ${l}`).join('\n')}`);
    return;
  }

  // Upload is retried too — this connection drops often enough that a single attempt loses
  // twenty minutes of fetching to a blip.
  let url = '';
  for (let attempt = 0; attempt < 3 && !url; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    try { url = await uploadText(storagePath, text); }
    catch (e) { if (attempt === 2) throw e; console.warn(`   !  upload retry ${attempt + 1}: ${(e as Error).message}`); }
  }
  const attribution = composeAttribution('OpenStax (Rice University)', book.title, book.license, `https://openstax.org/books/${slug}`);

  const albumRecord = {
    id,
    type: 'BOOK',
    title: book.title,
    artist: 'OpenStax (Rice University)',
    description: `${attribution} Access this book for free at openstax.org. Free for everyone on Plajah — textbooks are never sold and are never part of Plajah+.`,
    coverImage: '',
    genre: 'Textbook',
    ownerId: 'system_admin',
    isGlobalArchive: true,
    isPublic: true,
    createdAt: Date.now(),
    // ── The gate. firestore.rules pins all four of these. ──
    oerTextbook: true,
    price: 0,
    isPaywalled: false,
    oerLicense: book.license,
    oerLicenseUrl: book.licenseUrl,
    oerAttribution: attribution,
    oerSourceUrl: `https://openstax.org/books/${slug}`,
    bookChapters: [{
      id: `${id}_full`,
      title: book.title,
      url,
      format: 'TXT',
      price: 0,
      isPaywalled: false,
    }],
  };

  // Retried like everything else here: the text is already in Storage by this point, so losing
  // the album write to a dropped connection would cost a full re-fetch of the whole book.
  let albumWritten = false;
  for (let attempt = 0; attempt < 4 && !albumWritten; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    albumWritten = await fsSet(`albums/${id}`, albumRecord);
    if (!albumWritten) console.warn(`   !  album write retry ${attempt + 1}`);
  }

  if (!albumWritten) throw new Error(`Uploaded the text but could not write albums/${id}. Re-run to retry.`);
  console.log(`   ✓ albums/${id}`);
  console.log(`     ${url}`);
}

async function main() {
  if (!dryRun && !adminConfig.hasServiceAccount()) {
    const cred = loadServiceAccount(process.argv);
    console.error(cred.error ? `
${cred.error}
` : `
${CREDENTIAL_HELP}
`);
    console.error('Or add --dry to preview without writing anything.');
    process.exit(1);
  }

  if (!dryRun) {
    const pre = await preflightCredentials();
    if (!pre.ok) { console.error(`
${pre.message}
`); process.exit(1); }
    console.log(`Credentials: ${loadServiceAccount(process.argv).source} — ${pre.message}
`);
  }

  const targets = doAll
    ? OER_LIBRARY.filter(i => i.source.startsWith('OpenStax')).map(i => i.sourceUrl.split('/books/')[1])
    : slugs;

  if (!targets.length) {
    console.error('Usage: npx tsx scripts/ingestOpenStaxBook.ts <slug> [--dry]   |   --all');
    process.exit(1);
  }

  let ok = 0;
  for (const slug of targets) {
    try { await ingest(slug); ok++; }
    catch (e) { console.error(`   ✗ ${slug}: ${(e as Error).message}`); }
  }
  console.log(`\n${ok}/${targets.length} book(s) ingested.`);
  console.log('All are free to every account. Textbooks are never sold and never gated behind Plajah+.');
  if (ok < targets.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
