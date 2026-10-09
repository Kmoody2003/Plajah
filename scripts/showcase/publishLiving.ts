// publishLiving: publish each showcase book's LIVING edition (a Tela document + its LivingBook) so the Lorea reader opens it,
// while the flat image pages (bookChapters, written by publishBooks.ts) stay exactly as they are: the export version and the fallback.
//
//   npx tsx scripts/showcase/publishLiving.ts                      DRY RUN (default): builds every bundle, verifies size + hash, reads the existing albums, WRITES NOTHING
//   npx tsx scripts/showcase/publishLiving.ts --publish            uploads the gzip bundle, writes the manifest + Album.bookTela, then re-reads everything and checks it
//   npx tsx scripts/showcase/publishLiving.ts --only=moon-blanket,orbit-party [--publish]
//   npx tsx scripts/showcase/publishLiving.ts --unpublish-living   removes Album.bookTela (edition 'living' only) so readers fall back to the flat pages; bundles stay
//   npx tsx scripts/showcase/publishLiving.ts --only=<id> --test-album [--publish]   proof run into a TEMPORARY album `showcase_zz_test_<id>` (private copy of the real album)
//   npx tsx scripts/showcase/publishLiving.ts --only=<id> --delete-test-album       deletes that temporary album, its version docs and its storage objects
//
// What gets written (docs/LIVING_PUBLISHING.md):
//   Storage   books/<owner>/showcase/<id>/living/<versionId>.json.gz        gzip BookTelaBundle, public tokenized URL
//   Firestore albums/<album>/telaVersions/<versionId>                       small manifest (bundleUrl, byteLength, sha256, rawSha256, flatPages ...), write-once
//   Firestore albums/<album>.bookTela                                       { enabled, edition:'living', versionId, versions[], pageTurn:{style:'flip'}, hasLiving, bundleUrl ... }
// NOT touched: bookChapters, coverImage, price, license, anything else on the album.
// A book with no living data yet (data/showcase/living/<id>.ts missing or empty) is NOT published for real unless --allow-empty-living.
// Idempotent: the versionId is a hash of the doc content, so re-running with nothing changed writes nothing.
import crypto from 'node:crypto';
import { SHOWCASE_BOOKS } from '../../data/showcase';
import { checkLivingTargets, loadShowcaseTelaDoc, makeShowcaseBundle, showcaseAlbumId } from '../../services/showcase/livingDoc';
import { buildManifest, encodeBundle, fetchBundleFromManifest, isTelaVersionManifest, MAX_STORED_BUNDLE_BYTES } from '../../services/bookTela/bundleStorage';
import { chooseReaderMode } from '../../services/bookTela/upgrade';
import { BUCKET, OWNER_UID, PROJECT, DB, deleteDoc, deleteFields, deleteObject, getDoc, getDocAnonymous, listDocIds, listObjects, patchFields, putDoc, upload } from './gcp';

/** Bump when makeShowcaseBundle's output format changes for the same doc (versions are write-once, so the id must change with it). */
const LIVING_BUNDLE_BUILD = 1;

const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const UNPUBLISH = args.includes('--unpublish-living');
const TEST = args.includes('--test-album');
const DELETE_TEST = args.includes('--delete-test-album');
const ALLOW_EMPTY = args.includes('--allow-empty-living');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const TEST_PREFIX = 'showcase_zz_test_';

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const targetAlbumId = (bookId: string) => (TEST ? `${TEST_PREFIX}${bookId}` : showcaseAlbumId(bookId));
const storageDir = (bookId: string) => (TEST ? `books/${OWNER_UID}/showcase-test/${TEST_PREFIX}${bookId}/living` : `books/${OWNER_UID}/showcase/${bookId}/living`);

async function main() {
  const books = SHOWCASE_BOOKS.filter(b => !only.length || only.includes(b.id));
  const unknown = only.filter(id => !SHOWCASE_BOOKS.some(b => b.id === id));
  if (unknown.length) throw new Error(`Unknown book id(s): ${unknown.join(', ')}`);
  if ((TEST || DELETE_TEST) && books.length !== 1) throw new Error('--test-album / --delete-test-album need exactly one book: --only=<id>');
  const mode = DELETE_TEST ? 'DELETE TEST ALBUM' : UNPUBLISH ? 'UNPUBLISH-LIVING' : PUBLISH ? (TEST ? 'PUBLISH (temporary test album)' : 'PUBLISH') : 'DRY RUN';
  console.log(`${mode} | project ${PROJECT} db ${DB} | bucket ${BUCKET} | owner ${OWNER_UID} | ${books.length} book(s)`);

  if (DELETE_TEST) { await deleteTestAlbum(books[0].id); return; }

  let problems = 0;
  for (const b of books) {
    const albumId = targetAlbumId(b.id);
    console.log(`\n[${b.id}] "${b.title}" -> albums/${albumId}`);
    const real = await getDoc(`albums/${showcaseAlbumId(b.id)}`);
    if (!real) { console.log(`   !! the flat album albums/${showcaseAlbumId(b.id)} does not exist; run publishBooks.ts first`); problems++; continue; }
    const flat: string[] = (real.bookChapters?.[0]?.pages ?? []).map((p: { url: string }) => p.url);
    const flatOk = flat.length === b.spreads.length;
    console.log(`   flat album: public=${real.isPublic} price=${real.price} license=${real.license} flat pages ${flat.length}/${b.spreads.length} ${flatOk ? 'OK' : 'MISMATCH'}; bookTela=${real.bookTela ? JSON.stringify({ edition: real.bookTela.edition ?? 'standard', versionId: real.bookTela.versionId, enabled: real.bookTela.enabled }) : 'none'}`);
    if (!flatOk) { problems++; console.log('   !! flat pages incomplete: the fallback would be broken. Not publishing.'); continue; }

    if (UNPUBLISH) {
      const cur = await getDoc(`albums/${albumId}`);
      if (!cur?.bookTela) { console.log('   nothing to do: no bookTela on this album'); continue; }
      if (cur.bookTela.edition !== 'living') { console.log(`   left alone: bookTela edition is "${cur.bookTela.edition ?? 'standard'}", not 'living'`); continue; }
      console.log('   will REMOVE bookTela (readers fall back to the flat pages; bundles and version docs stay)');
      await deleteFields(`albums/${albumId}`, ['bookTela']);
      const back = await getDoc(`albums/${albumId}`);
      console.log(`   removed. bookTela now: ${back?.bookTela ? 'STILL PRESENT' : 'gone'}; flat pages still ${(back?.bookChapters?.[0]?.pages ?? []).length}`);
      if (back?.bookTela) problems++;
      continue;
    }

    // ── build ──
    const doc = await loadShowcaseTelaDoc(b.id, { ownerId: OWNER_UID });
    const objs = doc.frames.reduce((s, f) => { const d = doc.devices[f.deviceIds[0]]; return s + (d.type === 'VECTOR' ? d.objects.length : 0); }, 0);
    const behaviors = doc.living!.pages.reduce((s, p) => s + p.behaviors.length, 0);
    const hasLiving = behaviors > 0;
    const targetProblems = checkLivingTargets(doc);
    console.log(`   doc: ${doc.frames.length} frames, ${objs} objects; living: ${behaviors} behaviours, ${Object.keys(doc.living!.scores).length} scores${hasLiving ? '' : ' (NO living data yet: empty LivingBook)'}`);
    if (targetProblems.length) { problems++; console.log(`   !! ${targetProblems.length} living target problem(s):`); targetProblems.slice(0, 8).forEach(p => console.log('      - ' + p)); }

    const coverUrl: string | undefined = real.coverImage || flat[0];
    const hash = crypto.createHash('sha256').update(JSON.stringify({ doc, coverUrl, build: LIVING_BUNDLE_BUILD })).digest('hex');
    const versionId = `living-${hash.slice(0, 12)}`;
    const existingManifest = await getDoc(`albums/${albumId}/telaVersions/${versionId}`);
    const createdAt = (existingManifest?.createdAt as number) || Date.now();
    const bundle = makeShowcaseBundle(doc, versionId, createdAt, 'Living edition', { coverUrl, albumId });
    const enc = await encodeBundle(bundle);
    console.log(`   bundle ${versionId}: raw ${kb(enc.rawByteLength)} -> gzip ${kb(enc.byteLength)} (${(enc.byteLength / enc.rawByteLength * 100).toFixed(1)}%, limit ${kb(MAX_STORED_BUNDLE_BYTES)}) sha256 ${enc.sha256.slice(0, 16)}... raw ${enc.rawSha256.slice(0, 16)}...`);
    if (existingManifest) {
      const same = existingManifest.rawSha256 === enc.rawSha256;
      console.log(`   version doc already exists (written ${new Date(existingManifest.createdAt).toISOString()}): content ${same ? 'identical' : 'DIFFERS'}`);
      if (!same) { problems++; console.log('   !! versions are write-once; this id exists with different bytes. Bump LIVING_BUNDLE_BUILD in publishLiving.ts.'); continue; }
    }
    const cur = await getDoc(`albums/${albumId}`);
    const upToDate = !!existingManifest && cur?.bookTela?.edition === 'living' && cur.bookTela.versionId === versionId;
    const objectPath = `${storageDir(b.id)}/${versionId}.json.gz`;
    console.log(`   would write: ${upToDate ? 'NOTHING (album already points at this version)' : `${existingManifest ? '' : `upload ${objectPath}; write albums/${albumId}/telaVersions/${versionId}; `}${TEST && !cur ? `create the temporary album ${albumId} (private copy of the real album); ` : ''}set albums/${albumId}.bookTela {edition:'living', versionId:${versionId}, pageTurn:flip, hasLiving:${hasLiving}}`}`);
    if (!hasLiving && !TEST && !ALLOW_EMPTY) { console.log(`   (a real --publish would SKIP this book: no living data yet in data/showcase/living/${b.id}.ts; pass --allow-empty-living to override)`); if (PUBLISH) continue; }
    if (targetProblems.length && PUBLISH) { console.log('   SKIP: fix the living target problems first'); continue; }
    if (!PUBLISH) continue;
    if (upToDate) { console.log('   up to date'); continue; }

    // ── write ──
    if (TEST && !cur) {
      const { bookTela: _bt, ...copy } = real;
      await putDoc(`albums/${albumId}`, { ...copy, id: albumId, title: `[TEST] ${real.title}`, isPublic: false, isPrivate: true, showcase: { ...(real.showcase ?? {}), test: true } });
      console.log(`   created temporary album ${albumId}`);
    }
    let bundleUrl = existingManifest?.bundleUrl as string | undefined;
    // The manifest is ALSO stored on the album record (albums are publicly readable), so readers never depend on the telaVersions rules being deployed.
    let manifestForAlbum: Record<string, unknown> | undefined = existingManifest as unknown as Record<string, unknown> | undefined;
    if (!existingManifest) {
      bundleUrl = await upload(objectPath, enc.bytes, 'application/gzip');
      const manifest = buildManifest({ bundle, encoded: enc, bundleUrl, ownerId: OWNER_UID, flatPages: flat, label: 'Living edition' });
      if (!isTelaVersionManifest(manifest)) throw new Error('built manifest failed its own shape check');
      await putDoc(`albums/${albumId}/telaVersions/${versionId}`, manifest as unknown as Record<string, unknown>);
      manifestForAlbum = manifest as unknown as Record<string, unknown>;
      console.log(`   uploaded + manifest written (${kb(enc.byteLength)})`);
    }
    const prev = ((await getDoc(`albums/${albumId}`))?.bookTela?.versions ?? []) as Array<{ versionId: string; createdAt: number }>;
    const versions = [...prev.filter(v => v.versionId !== versionId), { versionId, createdAt }];
    await patchFields(`albums/${albumId}`, {
      bookTela: {
        enabled: true, edition: 'living', hasLiving, docId: doc.id, versionId, upgradedAt: createdAt, layoutPreference: 'FIXED', enhancementCount: 0,
        versions, pageTurn: { style: 'flip' }, bundleUrl: bundleUrl!, manifest: manifestForAlbum,
      },
    });

    // ── verify what a reader would hit ──
    const back = await getDoc(`albums/${albumId}`);
    const man = await getDoc(`albums/${albumId}/telaVersions/${versionId}`);
    const flatBack: string[] = (back?.bookChapters?.[0]?.pages ?? []).map((p: { url: string }) => p.url);
    const checks: Array<[string, boolean]> = [
      ['album.bookTela.edition=living + versionId', back?.bookTela?.edition === 'living' && back.bookTela.versionId === versionId && back.bookTela.enabled === true],
      ['album.bookTela.versions lists the version', (back?.bookTela?.versions ?? []).some((v: { versionId: string }) => v.versionId === versionId)],
      ['flat pages (bookChapters) untouched', flatBack.length === flat.length && flatBack.every((u, i) => u === flat[i])],
      ['manifest reads back and is well-formed', isTelaVersionManifest(man) && man.sha256 === enc.sha256 && man.rawSha256 === enc.rawSha256],
    ];
    const got = man && isTelaVersionManifest(man) ? await fetchBundleFromManifest(man, { expectBookId: albumId, onFail: w => console.log('   fetch failed: ' + w) }) : null;
    checks.push(['bundleUrl serves bytes whose sha256 matches; gunzip + parse + identity OK', !!got && got.bundle.doc.frames.length === b.spreads.length]);
    checks.push(['downloaded bundle JSON is byte-identical to what was built', !!got && got.json === enc.json]);
    const mode2 = chooseReaderMode({ versions: back?.bookTela?.versions ?? [], isOwner: false, isPaid: !!(back?.price > 0), license: null, telaEnabled: !!back?.bookTela?.enabled });
    checks.push(['reader policy picks this version for an anonymous reader of a free book', mode2.mode === 'tela' && mode2.version.versionId === versionId]);
    for (const [name, ok] of checks) { console.log(`   ${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) problems++; }
    const anon = await getDocAnonymous(`albums/${albumId}/telaVersions/${versionId}`);
    console.log(`   info: anonymous (rules-enforced) read of the version doc -> HTTP ${anon.status}${anon.status === 200 ? ' (readers can read it)' : ' (firestore.rules for telaVersions are probably not deployed yet, or the album is private)'}`);
  }
  if (!PUBLISH && !UNPUBLISH) console.log('\nDry run only: nothing was written. Re-run with --publish to install.');
  if (problems) { console.log(`\n${problems} problem(s).`); process.exitCode = 1; }
}

/** Remove a temporary proof album: only ids that start with showcase_zz_test_ can ever be deleted by this script. */
async function deleteTestAlbum(bookId: string) {
  const albumId = `${TEST_PREFIX}${bookId}`;
  if (!albumId.startsWith(TEST_PREFIX)) throw new Error('refusing to delete a non-test album');
  const versions = await listDocIds(`albums/${albumId}/telaVersions`);
  for (const v of versions) { await deleteDoc(`albums/${albumId}/telaVersions/${v}`); console.log(`   deleted albums/${albumId}/telaVersions/${v}`); }
  const objs = await listObjects(`books/${OWNER_UID}/showcase-test/${albumId}/`);
  for (const o of objs) { await deleteObject(o); console.log(`   deleted storage object ${o}`); }
  await deleteDoc(`albums/${albumId}`); console.log(`   deleted albums/${albumId}`);
  const still = await getDoc(`albums/${albumId}`);
  const left = await listObjects(`books/${OWNER_UID}/showcase-test/${albumId}/`);
  console.log(`   verify: album ${still ? 'STILL EXISTS' : 'gone'}, version docs ${(await listDocIds(`albums/${albumId}/telaVersions`)).length} left, storage objects ${left.length} left`);
  if (still || left.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
