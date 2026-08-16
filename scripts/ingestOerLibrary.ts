// ingestOerLibrary — seed / refresh the Plajah Academia OER catalogue in Firestore.
//
// Plajah has no firebase-admin dependency; this uses services/firebaseAdminRest (SA-signed REST),
// exactly like the rest of the backend.
//
//   npx tsx scripts/ingestOerLibrary.ts --dry              # print what would be written
//   npx tsx scripts/ingestOerLibrary.ts --verify-openstax  # check licences against OpenStax
//   npx tsx scripts/ingestOerLibrary.ts --key <file>       # write the curated seed catalogue
//   npx tsx scripts/ingestOerLibrary.ts --gutenberg 1342 9-12 --key <file>
//
// Credentials: pass --key with the path to a Firebase service-account JSON, or set
// GOOGLE_SERVICE_ACCOUNT_JSON in .env.local. --dry and --verify-openstax need neither.
//
// Licence discipline, which is the entire point of this pipeline:
//   • Every record carries its licence, and commercialOk is DERIVED from it, never hand-set.
//   • Licences are READ FROM UPSTREAM, never inferred from the publisher — OpenStax ships both
//     CC BY and CC BY-NC-SA titles, and assuming otherwise is how NC material meets a paywall.
//   • Non-commercial material can be hosted (textbooks are free to all, never in Plajah+) but
//     licenseGate still refuses to let it behind a PAID offering. Two separate gates.
//   • Attribution is composed once, here, and rendered wherever the item appears.

import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
loadServiceAccount(process.argv); // must run BEFORE firebaseAdminRest reads process.env

import { fsSet, adminConfig } from '../services/firebaseAdminRest';
import { OER_LIBRARY, type LibraryItem } from '../data/oerLibrary';
import { composeAttribution } from '../services/oerLicenseGate';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

async function writeItem(item: LibraryItem): Promise<boolean> {
  if (dryRun) {
    console.log(`  [dry] ${item.id.padEnd(32)} ${item.license.padEnd(12)} ${item.commercialOk ? 'commercial-ok' : 'FREE TIER ONLY'}  ${item.title}`);
    return true;
  }
  // Deterministic ids (not auto-ids) so re-running updates in place instead of duplicating.
  // Retried: a dropped connection would otherwise leave one item silently missing from the
  // catalogue, and a material that isn't in libraryItems fails server-side licence validation.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 800 * attempt));
    if (await fsSet(`libraryItems/${item.id}`, item as unknown as Record<string, unknown>)) return true;
  }
  return false;
}

/** Pull one public-domain title from Gutendex and add it to the catalogue. */
async function ingestGutenberg(id: string, gradeBand: string) {
  const res = await fetch(`https://gutendex.com/books/${id}`);
  if (!res.ok) throw new Error(`Gutendex returned ${res.status} for id ${id}`);
  const book = await res.json() as { title: string; authors: Array<{ name: string }> };
  const url = `https://www.gutenberg.org/ebooks/${id}`;
  const title = `${book.title} — ${book.authors.map(a => a.name).join(', ')}`;

  const item: LibraryItem = {
    id: `pg-${id}`,
    source: 'Project Gutenberg',
    sourceUrl: url,
    license: 'PD',
    commercialOk: true,
    shareAlike: false,
    attribution: composeAttribution('Project Gutenberg', title, 'PD', url),
    subjects: ['ela'],
    gradeBands: [gradeBand as LibraryItem['gradeBands'][number]],
    standards: [],
    title,
    format: 'reading',
    linkOutOnly: false,
  };
  const ok = await writeItem(item);
  console.log(ok ? `Ingested "${book.title}" (public domain)` : `FAILED to write ${item.id}`);
}

/**
 * Verify every OpenStax item against the publisher's OWN licence field.
 *
 * This exists because assuming "OpenStax = CC BY" is wrong and expensive: the catalogue is
 * mixed, and most of the K-12-facing maths titles are CC BY-NC-SA. A hand-maintained licence
 * column drifts silently — the only trustworthy source is upstream, so we go and read it.
 *
 *   npx tsx scripts/ingestOerLibrary.ts --verify-openstax
 */
async function verifyOpenStaxLicenses(): Promise<number> {
  const toLicense = (url: string): LibraryItem['license'] | null => {
    if (/by-nc-sa/.test(url)) return 'CC-BY-NC-SA';
    if (/by-nc/.test(url)) return 'CC-BY-NC';
    if (/by-sa/.test(url)) return 'CC-BY-SA';
    if (/licenses\/by\//.test(url)) return 'CC-BY';
    return null;
  };

  const rel = await (await fetch('https://openstax.org/rex/release.json')).json() as
    { archiveUrl: string; books: Record<string, { defaultVersion: string }> };
  const cms = await (await fetch(
    'https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&fields=title,slug,cnx_id&limit=300',
  )).json() as { items: Array<{ title: string; cnx_id: string; meta: { slug: string } }> };

  const items = OER_LIBRARY.filter(i => i.source.startsWith('OpenStax'));
  let mismatches = 0;

  for (const item of items) {
    const slug = item.sourceUrl.split('/books/')[1];
    const book = cms.items.find(b => b.meta.slug === slug);
    if (!book) { console.warn(`  ?  ${item.id} — slug "${slug}" not in the OpenStax catalogue`); continue; }
    const version = rel.books[book.cnx_id]?.defaultVersion;
    const res = await fetch(`https://openstax.org${rel.archiveUrl}/contents/${book.cnx_id}@${version}.json`);
    if (!res.ok) { console.warn(`  ?  ${item.id} — contents fetch ${res.status}`); continue; }
    const upstream = toLicense((await res.json() as { license: { url: string } }).license?.url ?? '');

    if (!upstream) { console.warn(`  ?  ${item.id} — unrecognised upstream licence`); continue; }
    if (upstream === item.license) {
      console.log(`  ok ${item.id.padEnd(32)} ${upstream}`);
    } else {
      mismatches++;
      console.error(`  !! ${item.id.padEnd(32)} catalogue says ${item.license}, OpenStax says ${upstream}`);
    }
  }
  return mismatches;
}

async function main() {
  if (args.includes('--verify-openstax')) {
    console.log('Checking every OpenStax item against the publisher\'s own licence field…\n');
    const bad = await verifyOpenStaxLicenses();
    console.log(bad
      ? `\n${bad} mismatch(es). Fix data/oerLibrary.ts before ingesting — a wrong licence here is what puts non-commercial material behind a paywall.`
      : '\nAll OpenStax licences match upstream.');
    process.exit(bad ? 1 : 0);
  }

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

  const gutenbergFlag = args.indexOf('--gutenberg');
  if (gutenbergFlag !== -1) {
    await ingestGutenberg(args[gutenbergFlag + 1], args[gutenbergFlag + 2] ?? '9-12');
    return;
  }

  console.log(`Writing ${OER_LIBRARY.length} library items to ${adminConfig.PROJECT_ID}/${adminConfig.DB_ID}${dryRun ? ' (dry run)' : ''}\n`);

  let written = 0;
  let failed = 0;
  for (const item of OER_LIBRARY) {
    if (await writeItem(item)) written++;
    else { failed++; console.error(`  FAILED ${item.id}`); }
  }

  const nc = OER_LIBRARY.filter(i => !i.commercialOk);
  console.log(`\n${written} written, ${failed} failed.`);
  console.log(`${nc.length} item(s) are non-commercial and gated to the free tier / link-out:`);
  nc.forEach(i => console.log(`  · ${i.title} (${i.license}) — ${i.source}`));
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
