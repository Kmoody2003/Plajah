// publishBooks: install the six showcase books on the platform as real, free, CC BY 4.0 books.
//
//   npx tsx scripts/showcase/publishBooks.ts                 DRY RUN (default): checks everything, writes NOTHING
//   npx tsx scripts/showcase/publishBooks.ts --publish       uploads page images + writes the album docs
//   npx tsx scripts/showcase/publishBooks.ts --only=moon-blanket,orbit-party [--publish]
//   npx tsx scripts/showcase/publishBooks.ts --unpublish     makes the six albums private (reversible; deletes nothing)
//
// How a book is stored (the platform's own image-page book model, see services/comicImport.ts): an Album { type:'BOOK', subType:'GRAPHIC_NOVEL' }
// whose single chapter has format 'COMIC' and pages [{ id, url, pageNumber }]; BookReader opens those in ComicReader (now with page turns).
// Page images come from .tela-proofs/showcase-pages/<book-id>/page-NN.png (written by the layout builders). The album id is stable
// (showcase_<book-id>) so re-running UPDATES the same book instead of duplicating it; createdAt is preserved.
// Auth: the signed-in gcloud user (`gcloud auth print-access-token`), same as scripts/council/*. Writes go to the production database.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SHOWCASE_BOOKS } from '../../data/showcase';
import type { ShowcaseBook } from '../../data/showcase/types';
import { measure } from '../../services/showcase/storyMetrics';
import { toFields, fromFields } from '../../services/safety/safetyServerIo';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB = process.env.FIREBASE_DB_ID || 'plajah-prod';
const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const OWNER_UID = process.env.SHOWCASE_OWNER_UID || 'hiP7PGj15eTq0r0ZH2XwN00AS2h1';   // the account the books appear under (Kenne's, as in scripts/council)
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');

const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const UNPUBLISH = args.includes('--unpublish');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

let tok = '', tokAt = 0;
async function headers(json = true) {
  if (!tok || Date.now() - tokAt > 25 * 60e3) { tok = execSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as any).toString().trim(); tokAt = Date.now(); }
  return { Authorization: `Bearer ${tok}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function getDoc(p: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${FS}/${p}`, { headers: await headers(false) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return fromFields(((await r.json()) as any).fields || {});
}
async function putDoc(p: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${FS}/${p}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
async function patchFields(p: string, data: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${FS}/${p}?${mask}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

/** Upload one object with a Firebase download token so the URL works for everyone regardless of storage read rules. */
async function upload(objectPath: string, bytes: Buffer, contentType: string): Promise<string> {
  const token = crypto.randomUUID();
  const boundary = 'b' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name: objectPath, contentType, cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, source: 'plajah-showcase' } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, {
    method: 'POST', headers: { ...(await headers(false)), 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function pageFiles(b: ShowcaseBook): string[] {
  const dir = path.join('.tela-proofs', 'showcase-pages', b.id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /^page-\d+\.png$/.test(f)).sort().map(f => path.join(dir, f));
}

function plainText(b: ShowcaseBook): string {
  return b.spreads.filter(s => s.beat !== 'cover' && s.beat !== 'back' && s.beat !== 'activity').map(s => s.text.replace(/\n/g, ' ').trim()).filter(Boolean).join('\n\n');
}

function albumDoc(b: ShowcaseBook, pages: Array<{ id: string; url: string; pageNumber: number }>, thumb: string, createdAt: number) {
  const m = measure(b);
  return {
    id: `showcase_${b.id}`, ownerId: OWNER_UID, title: b.title, artist: b.author, createdAt,
    type: 'BOOK', subType: 'GRAPHIC_NOVEL', genre: "Children's Picture Books",
    description: b.blurb, coverImage: pages[0].url, coverThumb: thumb, coverOriginal: pages[0].url,
    tags: ['children', 'picture book', `ages ${b.ageMin}-${b.ageMax}`, b.medium.toLowerCase(), 'free to remix', 'cc by'],
    isPublic: true, isPrivate: false, isDraft: false, isScheduled: false, isPaywalled: false, price: 0,
    license: b.license, readingDir: 'ltr', likesCount: 0, commentsCount: 0,
    releaseAnnouncement: { enabled: false },
    // NEVER put `content` on an image-page chapter: BookReader would parse it as text pages and the buttons, tap zones and table of
    // contents would then drive hidden text pages instead of the pictures. The story text lives under `showcase.plainText` instead.
    bookChapters: [{ id: 'story', title: b.title, format: 'COMIC', pages }],
    bookDistribution: { delivery: 'DOWNLOAD_OPEN', license: b.license, language: 'en', aiDisclosure: b.aiDisclosure, wordCount: m.storyWords },
    showcase: {
      bookId: b.id, templateId: b.templateId, ageMin: b.ageMin, ageMax: b.ageMax, band: b.band, medium: b.medium, theme: b.theme, refrain: b.refrain ?? '',
      plainText: plainText(b), author: b.author, remixIdeas: b.remixIdeas, discussion: b.discussion, glossary: b.glossary ?? [],
      characters: b.characters.map(c => ({ id: c.id, name: c.name, kind: c.kind, role: c.role, look: c.look })),
      license: 'CC BY 4.0', attribution: `Based on "${b.title}" by ${b.author} (CC BY 4.0)`, publishedBy: 'scripts/showcase/publishBooks.ts',
    },
  };
}

async function main() {
  const books = SHOWCASE_BOOKS.filter(b => !only.length || only.includes(b.id));
  console.log(`${UNPUBLISH ? 'UNPUBLISH' : PUBLISH ? 'PUBLISH' : 'DRY RUN'} | project ${PROJECT} db ${DB} | owner ${OWNER_UID} | ${books.length} book(s)`);

  const owner = await getDoc(`users/${OWNER_UID}`);
  if (!owner) throw new Error(`Owner account users/${OWNER_UID} not found; set SHOWCASE_OWNER_UID.`);
  console.log(`Books will appear under: ${owner.displayName || owner.email || OWNER_UID}`);

  if (UNPUBLISH) {
    for (const b of books) { await patchFields(`albums/showcase_${b.id}`, { isPublic: false, isPrivate: true }); console.log(`  [${b.id}] made private`); }
    return;
  }

  const sharp = (await import('sharp')).default;
  for (const b of books) {
    const files = pageFiles(b);
    const ok = files.length === b.spreads.length;
    console.log(`\n[${b.id}] "${b.title}" ages ${b.ageMin}-${b.ageMax}: ${files.length}/${b.spreads.length} page images ${ok ? 'OK' : 'MISSING'}`);
    if (!ok) { console.log('   skipped: page images are not complete (the layout builders write them to .tela-proofs/showcase-pages/<id>/).'); continue; }
    const existing = await getDoc(`albums/showcase_${b.id}`);
    console.log(`   ${existing ? 'will UPDATE the existing book (createdAt kept)' : 'will CREATE a new book'}; ${b.spreads.length} pages -> books/${OWNER_UID}/showcase/${b.id}/`);
    if (!PUBLISH) continue;

    const pages: Array<{ id: string; url: string; pageNumber: number }> = [];
    for (let i = 0; i < files.length; i++) {
      const webp = await sharp(files[i]).webp({ quality: 88 }).toBuffer();
      const url = await upload(`books/${OWNER_UID}/showcase/${b.id}/page-${String(i + 1).padStart(2, '0')}.webp`, webp, 'image/webp');
      pages.push({ id: `p${i + 1}`, url, pageNumber: i + 1 });
      process.stdout.write(`   uploaded ${i + 1}/${files.length}\r`);
    }
    const thumbBuf = await sharp(files[0]).resize({ width: 640 }).webp({ quality: 85 }).toBuffer();
    const thumb = await upload(`books/${OWNER_UID}/showcase/${b.id}/cover-thumb.webp`, thumbBuf, 'image/webp');
    await putDoc(`albums/showcase_${b.id}`, albumDoc(b, pages, thumb, (existing?.createdAt as number) || Date.now()));

    // Verify what a reader would hit: the album reads back as public, and every page URL serves an image.
    const back = await getDoc(`albums/showcase_${b.id}`);
    const urls: string[] = (back?.bookChapters?.[0]?.pages ?? []).map((p: any) => p.url);
    let good = 0;
    for (const u of urls) { const r = await fetch(u, { method: 'HEAD' }); if (r.ok && /image\//.test(r.headers.get('content-type') || '')) good++; }
    console.log(`\n   published showcase_${b.id}: isPublic=${back?.isPublic} license=${back?.license} pages ${good}/${urls.length} reachable`);
    if (good !== urls.length || !back?.isPublic) throw new Error(`verification failed for ${b.id}`);
  }
  if (!PUBLISH) console.log('\nDry run only: nothing was written. Re-run with --publish to install.');
}
main().catch(e => { console.error(e); process.exit(1); });
