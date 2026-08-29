// fetchFloraPhotos — real photographs for the specimen cards, with their licences.
//
//   node scripts/fetchFloraPhotos.mjs            # every species
//   node scripts/fetchFloraPhotos.mjs quercus    # just the ones matching
//
// WHY THIS EXISTS, AND WHY IT DOWNLOADS
//
// Hot-linking is how this wing lost its planet textures: they pointed at the
// three.js repo, that repo removed them, and most of the solar system silently
// rendered untextured in production for weeks. An external host owes us nothing.
// So every image is fetched once, resized, and committed.
//
// LICENSING IS NOT OPTIONAL HERE. This is a museum: a photograph without its
// photographer is a wall label with the artist's name scratched off. Wikimedia
// carries machine-readable licence metadata, so the credit is pulled from the
// same request as the pixels and written straight into the specimen record —
// which is why FloraSpecimen.photos[] has `credit` and `license` on every entry
// rather than one attribution line for the page. Anything whose licence cannot
// be read, or that reads as non-free, is skipped rather than guessed at.
//
// Output: public/photos/flora/<id>-N.jpg, plus a printed data block to paste
// into data/flora/*.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

// Requests go through curl, not node's fetch. fetch() fails outright in some
// sandboxed environments this repo gets run in while curl is allowed, and a
// media fetcher that only works on one machine is not much of a fetcher.

const OUT_DIR = path.join(process.cwd(), 'public', 'photos', 'flora');
const WIDTH = 900;             // plenty for a card; a 4000px original is waste
const QUALITY = 82;
const PER_SPECIES = 2;         // a lead shot and a detail; more is repo weight
const UA = 'PlajahMuseion/1.0 (educational museum exhibit; contact via plajah.com)';

/** Species to photograph. Scientific name is the search key — it is unambiguous. */
const SPECIES = [
  { id: 'quercus-rubra', sci: 'Quercus rubra' },
  { id: 'betula-papyrifera', sci: 'Betula papyrifera' },
  { id: 'pinus-sylvestris', sci: 'Pinus sylvestris' },
  { id: 'salix-babylonica', sci: 'Salix babylonica' },
  { id: 'adansonia-digitata', sci: 'Adansonia digitata' },
  { id: 'acer-saccharum', sci: 'Acer saccharum' },
  { id: 'ginkgo-biloba', sci: 'Ginkgo biloba' },
  { id: 'populus-nigra-italica', sci: 'Populus nigra' },
  { id: 'cupressus-sempervirens', sci: 'Cupressus sempervirens' },
  { id: 'sequoia-sempervirens', sci: 'Sequoia sempervirens' },
  { id: 'phoenix-dactylifera', sci: 'Phoenix dactylifera' },
  { id: 'prunus-serrulata', sci: 'Prunus serrulata' },
  { id: 'eucalyptus-regnans', sci: 'Eucalyptus regnans' },
  { id: 'aloidendron-dichotomum', sci: 'Aloidendron dichotomum' },
  { id: 'dryopteris-filix-mas', sci: 'Dryopteris filix-mas' },
];

/** Licences we may ship. Anything not matching is skipped, not guessed. */
const FREE = /^(cc0|cc[ -]by([ -]sa)?([ -]\d(\.\d)?)?|public domain|pd|no restrictions)/i;

/** Candidates turned down, so an empty result can be explained. */
let rejected = [];

const stripHtml = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Commons authorship is free text, and a lot of it is boilerplate that would
 * read absurdly on a museum label — "No machine-readable author provided.
 * Velela assumed (based on copyright claims)." is a real and common value. The
 * person's name is in there; this digs it out and throws the wrapper away.
 * Attribution is still preserved, just written the way a wall label writes it.
 */
function tidyArtist(raw) {
  let a = stripHtml(raw);

  // "Original.jpg : Photographer derivative work: Editor" — credit the editor,
  // who is the author of the version actually being shown.
  const derived = a.match(/derivative work:\s*(.+)$/i);
  if (derived) a = derived[1];

  const assumed = a.match(/([A-Za-z0-9_.\- ]+?)\s+assumed\s+\(based on copyright claims\)/i);
  if (assumed) a = assumed[1];

  a = a.replace(/^No machine-readable author provided\.?\s*/i, '');
  a = a.replace(/\s*\(\s*talk\s*\)\s*/gi, ' ');
  a = a.replace(/\s+at\s+(English|German|French)?\s*Wikipedia\b.*$/i, '');
  // Several uploaders write a paragraph into the author field ("I am the
  // originator of this photo. I hold the copyright..."). The name is the first
  // clause; the rest is a licence statement we already record separately.
  a = a.split(/(?<=[a-z0-9\)])\.\s+[A-Z]/)[0];
  a = a.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');

  // A link and its label often duplicate the name back to back.
  const half = Math.floor(a.length / 2);
  if (a.length > 6 && a.slice(0, half).trim() === a.slice(half).trim()) a = a.slice(0, half).trim();

  if (a.length > 70) a = a.slice(0, 70).replace(/\s+\S*$/, '') + '…';
  return a || 'Unknown photographer';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikimedia asks that bulk clients go one request at a time behind a real
 * User-Agent, and it enforces that: fire fifteen species at it back to back and
 * it starts returning an HTML error page instead of JSON, which is what "non-
 * JSON reply" was. So requests are spaced, and a failure backs off and retries
 * rather than writing the species off — a rate limit is a "wait", not a "no".
 */
let lastCall = 0;
const MIN_GAP_MS = 350;

async function api(base, params, attempt = 0) {
  const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
  if (wait) await sleep(wait);
  lastCall = Date.now();

  const url = `${base}?${new URLSearchParams({ format: 'json', ...params })}`;
  let stdout = '';
  try {
    ({ stdout } = await run(
      'curl',
      ['-sS', '-L', '-m', '45', '-A', UA, url],
      { maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch (err) {
    stdout = '';
  }
  try {
    return JSON.parse(stdout);
  } catch {
    if (attempt < 4) {
      const backoff = 1200 * Math.pow(2, attempt);
      console.warn(`    … throttled, retrying in ${backoff}ms`);
      await sleep(backoff);
      return api(base, params, attempt + 1);
    }
    throw new Error(`no JSON after ${attempt + 1} attempts: ${url}`);
  }
}

/**
 * The images on a species' Wikipedia article, lead image first.
 *
 * The lead image is chosen by editors as the most representative photograph of
 * the organism, which is exactly the editorial judgement a specimen card wants —
 * and much better than picking the first search hit, which tends to be a range
 * map or a herbarium sheet.
 */
async function candidateFiles(sci) {
  const out = [];
  const lead = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query', titles: sci, prop: 'pageimages', piprop: 'name', redirects: '1',
  });
  const pages = Object.values(lead?.query?.pages ?? {});
  for (const p of pages) if (p?.pageimage) out.push(`File:${p.pageimage}`);

  const all = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query', titles: sci, prop: 'images', imlimit: '40', redirects: '1',
  });

  // A species article carries more than the species. Quercus rubra's page has a
  // range map; Acer saccharum's has the Vermont state quarter; Salix babylonica's
  // has a Monet. All are legitimately on the page and none of them is a specimen
  // photograph, so candidates are both filtered and RANKED: a file whose name
  // carries the genus or the species epithet is almost always a picture of the
  // organism, and that heuristic does most of the editorial work here.
  const [genus = '', epithet = ''] = sci.toLowerCase().split(' ');
  const NOT_A_SPECIMEN =
    /(icon|logo|\bmap\b|distribution|range|status|commons|wiki|symbol|barnstar|coin|quarter|dollar|stamp|banknote|flag|seal|coat[ _]of[ _]arms|painting|portrait|\bmonet\b|signature|diagram|chart|graph)/i;

  const extras = [];
  for (const p of Object.values(all?.query?.pages ?? {})) {
    for (const im of p?.images ?? []) {
      const title = im.title;
      if (/\.svg$/i.test(title)) continue;
      if (NOT_A_SPECIMEN.test(title)) continue;
      if (out.includes(title)) continue;
      const lower = title.toLowerCase();
      // Genus AND epithet is near-certainly the organism; genus alone is likely;
      // neither means it is on the page for some other reason entirely.
      const score = (lower.includes(genus) ? 2 : 0) + (epithet && lower.includes(epithet) ? 2 : 0);
      extras.push({ title, score });
    }
  }
  extras.sort((a, b) => b.score - a.score);
  for (const e of extras) if (e.score > 0) out.push(e.title);
  // Unscored files only if nothing named after the species turned up at all.
  for (const e of extras) if (e.score === 0) out.push(e.title);
  return out;
}

/** Licence, author and a downloadable URL for one Commons file. */
async function fileInfo(title) {
  const data = await api('https://commons.wikimedia.org/w/api.php', {
    action: 'query', titles: title, prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size', iiurlwidth: String(WIDTH),
  });
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  if (!/^image\/(jpeg|png|webp)$/i.test(info.mime ?? '')) return null;

  const m = info.extmetadata ?? {};
  const license = stripHtml(m.LicenseShortName?.value);
  const artist = tidyArtist(m.Artist?.value);
  if (!license) { rejected.push(`${title}: no licence stated`); return null; }
  if (!FREE.test(license)) { rejected.push(`${title}: ${license}`); return null; }

  return {
    url: info.thumburl || info.url,
    descriptionurl: info.descriptionurl,
    credit: `${artist} — Wikimedia Commons`,
    license,
    width: info.thumbwidth ?? info.width,
  };
}

async function download(url, dest) {
  const tmp = path.join(os.tmpdir(), `flora-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await run('curl', ['-sS', '-L', '-m', '90', '-A', UA, '-o', tmp, url], { maxBuffer: 1024 * 1024 });
  try {
    // Re-encode rather than storing the original: a 6 MB PNG behind a card is
    // bandwidth nobody asked for.
    await sharp(tmp).resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true }).toFile(dest);
  } finally {
    await fs.rm(tmp, { force: true });
  }
  const { size } = await fs.stat(dest);
  return size;
}

const filter = process.argv[2]?.toLowerCase();
const wanted = filter
  ? SPECIES.filter((s) => s.id.includes(filter) || s.sci.toLowerCase().includes(filter))
  : SPECIES;

await fs.mkdir(OUT_DIR, { recursive: true });

// RESUMABLE. Wikimedia throttles a bulk client, so any single pass over fifteen
// species is likely to lose a few to rate limiting. Re-running should chase only
// what is still missing rather than re-fetching everything and getting throttled
// again in a different place — so previous results are loaded, species that
// already have photographs are skipped, and results are MERGED rather than
// overwritten. `--force` re-fetches regardless.
// The credits live with the DATA, not with the images, so the specimen records
// can import them directly and a re-run of this script updates the exhibit
// without anyone hand-editing a species file (and mistyping a photographer's
// name while they do it).
const CREDITS = path.join(process.cwd(), 'data', 'flora', 'photoCredits.json');
const force = process.argv.includes('--force');

let records = {};
try {
  records = JSON.parse(await fs.readFile(CREDITS, 'utf8'));
} catch { /* first run */ }

async function alreadyHave(id) {
  const rows = records[id];
  if (!Array.isArray(rows) || rows.length === 0) return false;
  for (const r of rows) {
    try { await fs.access(path.join(OUT_DIR, path.basename(r.url))); }
    catch { return false; }                 // record without its file: refetch
  }
  return true;
}
for (const sp of wanted) {
  if (!force && await alreadyHave(sp.id)) {
    console.log(`\n${sp.sci}\n  · already have ${records[sp.id].length}, skipping`);
    continue;
  }
  process.stdout.write(`\n${sp.sci}\n`);
  let files;
  try {
    files = await candidateFiles(sp.sci);
  } catch (err) {
    console.warn(`  ! lookup failed: ${err.message}`);
    continue;
  }

  const got = [];
  const seenSources = new Set();
  rejected = [];
  for (const title of files) {
    if (got.length >= PER_SPECIES) break;
    let info;
    try { info = await fileInfo(title); } catch { info = null; }
    if (!info) continue;
    // prop=images repeats the lead image, so the same photograph can arrive
    // twice under two titles. Two identical shots on one card reads as a bug.
    const fingerprint = (info.descriptionurl || info.url).split('/').pop();
    if (seenSources.has(fingerprint)) continue;
    seenSources.add(fingerprint);
    const n = got.length + 1;
    const rel = `/photos/flora/${sp.id}-${n}.jpg`;
    const dest = path.join(OUT_DIR, `${sp.id}-${n}.jpg`);
    try {
      const size = await download(info.url, dest);
      got.push({ url: rel, credit: info.credit, license: info.license });
      console.log(`  ✓ ${rel}  ${(size / 1024).toFixed(0)} KB  [${info.license}]  ${info.credit}`);
    } catch (err) {
      console.warn(`  ! ${title}: ${err.message}`);
    }
  }
  if (!got.length) {
    console.warn(`  ! no freely-licensed photo found among ${files.length} candidates`);
    for (const r of rejected.slice(0, 5)) console.warn(`      rejected ${r}`);
  }
  // Only overwrite on success — a throttled pass must not erase a good result.
  if (got.length) records[sp.id] = got;
}

console.log('\n\n── paste into the specimen records ──\n');
for (const [id, photos] of Object.entries(records)) {
  if (!photos.length) continue;
  console.log(`// ${id}`);
  console.log('photos: ' + JSON.stringify(photos, null, 2) + ',\n');
}
await fs.writeFile(CREDITS, JSON.stringify(records, null, 2) + '\n');
const missing = SPECIES.filter((s) => !records[s.id]?.length).map((s) => s.sci);
console.log(`\nWrote ${CREDITS}`);
console.log(`${Object.keys(records).length}/${SPECIES.length} species have photographs.`);
if (missing.length) console.log(`Still missing (re-run to retry): ${missing.join(', ')}`);
