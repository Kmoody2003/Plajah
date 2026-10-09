// Showcase books as Tela documents: determinism, labels, bundle storage, loader fallback, export. `npm run test:showcaselive`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_BOOKS } from '../data/showcase';
import { TELA_PUBLICATION_TEMPLATES, instantiatePublicationPage } from '../services/telaPublicationTemplates';
import {
  auditShowcaseLabels, buildShowcaseTelaDoc, checkLivingTargets, emptyLivingBook, frameLabelFor, isGenericLabel, loadShowcaseLiving, makeShowcaseBundle, mappedLabel,
  normaliseLiving, pageChapterId, pageObjects, showcaseAlbumId,
} from '../services/showcase/livingDoc';
import {
  BundleVerifyError, LIVING_BUNDLE_FORMAT, MAX_STORED_BUNDLE_BYTES, buildManifest, bundleFromVersionDoc, decodeBundle, encodeBundle, fetchBundleFromManifest,
  gunzipBytes, gzipBytes, isTelaVersionManifest, isTrustedBundleUrl, sha256Hex,
} from '../services/bookTela/bundleStorage';
import { parseFrameId, telaDocToBook } from '../services/bookTela/bookToTela';
import { bookFromBundle, chooseReaderMode } from '../services/bookTela/upgrade';
import { exportBook, fidelityFor } from '../services/bookTela/export';
import { READER_ONLY_NOTES } from '../services/bookTela/model';
import { livingReaderOnlyNotes, tallyLiving } from '../services/bookTela/livingNotes';
import { readZipEntries, readZipText } from '../services/bookmeta/zip';
import type { LivingBook } from '../services/living/contracts';
import type { TelaVectorDevice } from '../types';

const NOW = new Date('2026-10-09T12:00:00Z');
const vec = (d: ReturnType<typeof buildShowcaseTelaDoc>, i: number) => d.devices[d.frames[i].deviceIds[0]] as TelaVectorDevice;

// A small but representative LivingBook, used wherever a book "with living data" is needed (the real ones arrive in phase 2).
const sampleLiving = (bookId: string, label: string): LivingBook => ({
  version: 1, bookId,
  pages: [
    { page: 1, behaviors: [], music: { cue: 'lullaby' } },
    { page: 2, groups: { eyes: ['label:Eye*'] }, vars: { n: 0 }, narration: { text: 'Hello' }, goals: [{ id: 'g', label: 'Find', when: { var: 'n', op: '>=', value: 1 } }], behaviors: [
      { id: 'b1', target: { label }, on: { type: 'tap' }, hint: 'Tap it', do: [{ do: 'sfx', sound: 'boop' }, { do: 'burst', kind: 'sparkles' }, { do: 'haptic', pattern: 'tap' }] },
      { id: 'b2', target: { group: 'eyes' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'blink', loop: 'infinite' } }] },
      { id: 'b3', target: { page: true }, on: { type: 'tilt' }, do: [{ do: 'animate', anim: { preset: 'parallax' } }] },
      { id: 'b4', target: { label }, on: { type: 'drag', progressVar: 'n' }, hint: 'Drag it', do: [{ do: 'if', cond: { var: 'n', op: '>', value: 0.5 }, then: [{ do: 'narrate' }, { do: 'ambience', bed: 'room-tone' }] }] },
    ] },
  ],
  scores: { lullaby: { id: 'lullaby', tempo: 70, lengthBeats: 4, tracks: [{ instrument: 'musicbox', notes: [{ t: 0, n: 'C4', d: 1 }] }] } },
});

// ───────────────────────────── 1. the doc ─────────────────────────────

for (const b of SHOWCASE_BOOKS) {
  test(`${b.id}: builds twice to identical JSON and ids; every spread has a frame hosting one VECTOR device`, () => {
    const a = buildShowcaseTelaDoc(b.id), c = buildShowcaseTelaDoc(b.id);
    assert.equal(JSON.stringify(a), JSON.stringify(c));
    assert.equal(a.frames.length, b.spreads.length);
    const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === b.templateId)!;
    const ids = new Set<string>();
    a.frames.forEach((f, i) => {
      assert.equal(f.deviceIds.length, 1);
      const d = vec(a, i);
      assert.equal(d.type, 'VECTOR');
      assert.equal(d.width, t.width); assert.equal(d.height, t.height);
      assert.equal(f.w, t.width); assert.equal(f.h, t.height);
      assert.ok(d.objects.length >= 20, `page ${i + 1} has ${d.objects.length} objects`);
      for (const o of d.objects) { assert.ok(!ids.has(o.id), `duplicate id ${o.id}`); ids.add(o.id); assert.match(o.id, new RegExp(`^p${String(i + 1).padStart(2, '0')}_`)); }
      const r = parseFrameId(a.id, f.id);
      assert.equal(r.role, 'opener'); assert.equal('chapterId' in r && r.chapterId, pageChapterId(i + 1));
    });
    assert.ok(a.living && a.living.pages.length === b.spreads.length && a.living.pages.every((p, i) => p.page === i + 1 && p.behaviors.length === 0), 'empty LivingPage per spread');
    assert.deepEqual(a.publication && { author: a.publication.author, license: a.publication.license, ageMin: a.publication.ageMin, ageMax: a.publication.ageMax }, { author: b.author, license: 'CC BY 4.0', ageMin: b.ageMin, ageMax: b.ageMax });
    assert.equal(a.publication!.aiDisclosure, b.aiDisclosure);
    assert.equal(a.title, b.title);
  });

  test(`${b.id}: objects are EXACTLY the designer's (only ids and generic labels differ)`, () => {
    const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === b.templateId)!;
    const doc = buildShowcaseTelaDoc(b.id);
    t.pages.forEach((pt, i) => {
      const raw = instantiatePublicationPage(t, pt, i);
      const ours = vec(doc, i).objects;
      assert.equal(ours.length, raw.length);
      raw.forEach((o, k) => {
        const { id: _i, objectLabel: l0, ...rest } = o; const { id: _j, objectLabel: l1, ...mine } = ours[k];
        assert.deepEqual(mine, rest, `page ${i + 1} object ${k}`);
        if (!isGenericLabel(l0)) assert.equal(l1, l0, 'specific designer labels and templateRole are untouched');
      });
    });
  });

  test(`${b.id}: labels audit: nothing unlabeled or generic remains, ids unique`, () => {
    const au = auditShowcaseLabels(b.id);
    assert.equal(au.stillGeneric, 0); assert.equal(au.duplicateIds, 0);
    assert.equal(au.objects, buildShowcaseTelaDoc(b.id).frames.reduce((s, _f, i) => s + vec(buildShowcaseTelaDoc(b.id), i).objects.length, 0));
    assert.equal(au.remappedTotal + au.unlabeled, au.perPage.reduce((s, p) => s + p.remapped + p.unlabeled, 0));
  });
}

test('mapping layer: generic and missing labels get stable meaningful ones, specific ones are left alone', () => {
  assert.ok(isGenericLabel('Ellipse') && isGenericLabel('rect') && isGenericLabel('poly') && isGenericLabel('') && isGenericLabel(undefined) && isGenericLabel('Rect 3'));
  assert.ok(!isGenericLabel('Eye') && !isGenericLabel('Planet shade') && !isGenericLabel('Star') && !isGenericLabel('Path'));
  const o = { id: 'x', kind: 'ELLIPSE', x: 10, y: 10, w: 20, h: 20, fill: '#fff', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1 } as const;
  assert.equal(mappedLabel(o as never, 1000, 800), mappedLabel(o as never, 1000, 800));
  assert.match(mappedLabel(o as never, 1000, 800), /disc \(top left\)$/);
  assert.match(mappedLabel({ ...o, kind: 'TEXT', text: 'Boo!' } as never, 1000, 800), /^Text "Boo!"$/);
  const au = auditShowcaseLabels('orbit-party');
  assert.ok(au.remapped['Ellipse'] >= 100, 'orbit-party draws 150 generic "Ellipse" objects');
  const pr = pageObjects('story-space', 2);
  assert.ok(pr.objects.every(x => !isGenericLabel(x.objectLabel)));
});

test('ids are stable across rebuilds and keyed on page + label + index', () => {
  const a = vec(buildShowcaseTelaDoc('moon-blanket'), 1).objects.map(o => o.id);
  const b = vec(buildShowcaseTelaDoc('moon-blanket'), 1).objects.map(o => o.id);
  assert.deepEqual(a, b);
  assert.ok(a.every(id => /^p02_[a-z0-9-]+_\d+$/.test(id)));
  assert.ok(a.some(id => id.endsWith('_2')), 'repeated labels get k = 2, 3...');
});

test('living data: attached when given (pages normalised to one per spread), checked against the doc, dynamic import is optional', async () => {
  const doc0 = buildShowcaseTelaDoc('beep-block-street');
  const label = vec(doc0, 1).objects.find(o => o.objectLabel === 'Eye')?.objectLabel || 'Eye';
  const lv = sampleLiving('beep-block-street', label);
  const doc = buildShowcaseTelaDoc('beep-block-street', lv);
  assert.equal(doc.living!.pages.length, 10, 'missing pages are added empty');
  assert.equal(doc.living!.pages[1].behaviors.length, 4);
  assert.deepEqual(checkLivingTargets(doc), []);
  // dangling targets are reported
  const bad = buildShowcaseTelaDoc('beep-block-street', { ...lv, pages: [{ page: 2, behaviors: [{ id: 'x', target: { label: 'No such thing' }, on: { type: 'tap' }, do: [], hint: 'h' }] }] });
  assert.ok(checkLivingTargets(bad).some(p => /No such thing/.test(p)));
  assert.ok(checkLivingTargets({ ...doc, living: { ...lv, bookId: 'other' } }).some(p => /bookId/.test(p)));
  // an id target keeps working after a rebuild
  const id = vec(doc0, 1).objects[5].id;
  const withId = buildShowcaseTelaDoc('beep-block-street', { ...emptyLivingBook(SHOWCASE_BOOKS[1]), pages: [{ page: 2, behaviors: [{ id: 'i', target: { id }, on: { type: 'tap' }, do: [], hint: 'h' }] }] });
  assert.deepEqual(checkLivingTargets(withId), []);
  assert.deepEqual(checkLivingTargets(buildShowcaseTelaDoc('beep-block-street', withId.living)), []);
  // optional file: absent -> null (not an error)
  assert.equal(await loadShowcaseLiving('no-such-book-xyz'), null);
  assert.equal(normaliseLiving(SHOWCASE_BOOKS[0], { version: 1, bookId: 'zzz', pages: [], scores: {} }).bookId, 'moon-blanket');
});

// ───────────────────────────── 2. bundle storage ─────────────────────────────

test('bundle: gzip round trip, hash, manifest shape, size fits where an inline doc would not', async () => {
  const doc = buildShowcaseTelaDoc('below-the-blue', sampleLiving('below-the-blue', 'Eye'));
  const bundle = makeShowcaseBundle(doc, 'living-test1', 1760000000000, 'test');
  const enc = await encodeBundle(bundle);
  assert.ok(enc.rawByteLength > 900_000, `raw ${enc.rawByteLength} bytes is over the 900 KB inline limit (that is why this exists)`);
  assert.ok(enc.byteLength < MAX_STORED_BUNDLE_BYTES && enc.byteLength < enc.rawByteLength / 3, `gzip ${enc.byteLength}`);
  assert.equal(enc.sha256.length, 64);
  const again = await encodeBundle(bundle);
  assert.equal(again.sha256, enc.sha256); assert.equal(again.rawSha256, enc.rawSha256, 'deterministic');
  const m = buildManifest({ bundle, encoded: enc, bundleUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=t', ownerId: 'o1', flatPages: ['https://a/1.webp'], label: 'test' });
  assert.ok(isTelaVersionManifest(m));
  assert.equal(m.format, LIVING_BUNDLE_FORMAT); assert.equal(m.pageCount, 13); assert.equal(m.hasLiving, true); assert.equal(m.versionId, 'living-test1'); assert.equal(m.bookId, 'showcase_below-the-blue');
  assert.ok(!('bundleJson' in m), 'the version doc is small: no inline bundle');
  assert.ok(JSON.stringify(m).length < 2_000);
  const back = await decodeBundle(enc.bytes, m, { bookId: 'showcase_below-the-blue' });
  assert.equal(back.json, enc.json);
  assert.equal(back.bundle.doc.frames.length, 13);
  assert.deepEqual(back.bundle.doc.living, bundle.doc.living);
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual([...await gunzipBytes(await gzipBytes(new Uint8Array([1, 2, 3])))], [1, 2, 3]);
});

test('manifest validation rejects bad shapes and untrusted hosts', async () => {
  const doc = buildShowcaseTelaDoc('moon-blanket');
  const bundle = makeShowcaseBundle(doc, 'living-x', 1, undefined);
  const enc = await encodeBundle(bundle);
  const m = buildManifest({ bundle, encoded: enc, bundleUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', ownerId: 'o', flatPages: [] });
  assert.ok(isTelaVersionManifest(m));
  for (const mut of [{ sha256: 'zz' }, { byteLength: 0 }, { byteLength: MAX_STORED_BUNDLE_BYTES + 1 }, { encoding: 'br' }, { format: 'other' }, { bundleUrl: '' }, { versionId: '' }]) assert.equal(isTelaVersionManifest({ ...m, ...mut }), false, JSON.stringify(mut));
  assert.equal(isTelaVersionManifest(null), false); assert.equal(isTelaVersionManifest({ bundleJson: '{}' }), false);
  assert.ok(isTrustedBundleUrl('https://firebasestorage.googleapis.com/v0/b/b/o/p?alt=media'));
  assert.equal(isTrustedBundleUrl('http://firebasestorage.googleapis.com/x'), false);
  assert.equal(isTrustedBundleUrl('https://evil.example.com/x'), false);
  assert.equal(isTrustedBundleUrl('javascript:alert(1)'), false);
});

// ───────────────────────────── 3. loader: follow bundleUrl, verify, fall back ─────────────────────────────

test('loader: follows bundleUrl and returns the bundle; every failure returns null (reader falls back to the flat pages)', async () => {
  const doc = buildShowcaseTelaDoc('little-fox-big-trees', sampleLiving('little-fox-big-trees', 'Eye'));
  const bundle = makeShowcaseBundle(doc, 'living-fox1', 5);
  const enc = await encodeBundle(bundle);
  const url = 'https://firebasestorage.googleapis.com/v0/b/b/o/fox.json.gz?alt=media&token=t';
  const m = buildManifest({ bundle, encoded: enc, bundleUrl: url, ownerId: 'o', flatPages: [] });
  const ok = (bytes: Uint8Array) => (async () => new Response(bytes as BodyInit, { status: 200 })) as unknown as typeof fetch;
  const why: string[] = []; const onFail = (w: string) => why.push(w);

  const good = await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m }, { fetchImpl: ok(enc.bytes), onFail });
  assert.ok(good && good.bundle.doc.living!.pages[1].behaviors.length === 4); assert.equal(why.length, 0);

  // 1 hash mismatch (flip one byte)
  const flipped = enc.bytes.slice(); flipped[40] ^= 0xff;
  assert.equal(await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m }, { fetchImpl: ok(flipped), onFail }), null);
  // 2 truncated
  assert.equal(await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m }, { fetchImpl: ok(enc.bytes.slice(0, 100)), onFail }), null);
  // 3 HTTP error
  assert.equal(await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m }, { fetchImpl: (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch, onFail }), null);
  // 4 network failure (offline)
  assert.equal(await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m }, { fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, onFail }), null);
  // 5 hash is right but the bundle is another book's
  assert.equal(await bundleFromVersionDoc('showcase_orbit-party', { ...m }, { fetchImpl: ok(enc.bytes), onFail }), null);
  // 6 untrusted URL: never fetched
  let fetched = false;
  assert.equal(await bundleFromVersionDoc('showcase_little-fox-big-trees', { ...m, bundleUrl: 'https://evil.example.com/b.gz' }, { fetchImpl: (async () => { fetched = true; return new Response(enc.bytes as BodyInit); }) as unknown as typeof fetch, onFail }), null);
  assert.equal(fetched, false);
  // 7 garbage doc
  assert.equal(await bundleFromVersionDoc('x', { hello: 1 }, { onFail }), null);
  assert.equal(why.length, 7);
  assert.ok(why.some(w => /hash/.test(w)) && why.some(w => /HTTP 404/.test(w)) && why.some(w => /identity/.test(w)) && why.some(w => /untrusted/.test(w)));

  // the classic inline path is unchanged
  const inline = await bundleFromVersionDoc('showcase_little-fox-big-trees', { bundleJson: enc.json });
  assert.equal(inline?.bundle.versionId, 'living-fox1');
  assert.equal(await bundleFromVersionDoc('a', { bundleJson: '{not json' }), null);

  await assert.rejects(decodeBundle(flipped, m), (e: unknown) => e instanceof BundleVerifyError && e.reason === 'hash');
  assert.equal(await fetchBundleFromManifest({ ...m, sha256: '0'.repeat(64) }, { fetchImpl: ok(enc.bytes) }), null);
});

test('reader policy: a free living book follows the latest version; flat chapters stay out of it', () => {
  const v = [{ versionId: 'living-a', createdAt: 1 }, { versionId: 'living-b', createdAt: 2 }];
  const r = chooseReaderMode({ versions: v, isOwner: false, isPaid: false, license: null, telaEnabled: true });
  assert.deepEqual(r.mode === 'tela' && [r.pin, r.version.versionId], ['follow-latest', 'living-b']);
  assert.equal(chooseReaderMode({ versions: v, isOwner: false, isPaid: false, license: null, telaEnabled: false }).mode, 'classic', 'unpublish-living -> flat');
  assert.equal(chooseReaderMode({ versions: [], isOwner: false, isPaid: false, license: null, telaEnabled: true }).mode, 'classic');
});

// ───────────────────────────── 5. export: flat pages kept, living stripped and reported ─────────────────────────────

test('export: a living book exports as standard flat fixed EPUB / PDF; the report lists what was left out as reader-only', async () => {
  const b = SHOWCASE_BOOKS[1];
  const doc0 = buildShowcaseTelaDoc(b.id);
  const label = vec(doc0, 1).objects.find(o => o.objectLabel === 'Eye')!.objectLabel!;
  const flatBundle = makeShowcaseBundle(doc0, 'v0', 1);
  const liveBundle = makeShowcaseBundle(buildShowcaseTelaDoc(b.id, sampleLiving(b.id, label)), 'v1', 1);
  const flatBook = bookFromBundle(flatBundle), liveBook = bookFromBundle(liveBundle);
  assert.equal(liveBook.chapters.length, b.spreads.length, 'one chapter (page) per spread');
  assert.equal(liveBook.chapters[0].title, b.title); assert.equal(liveBook.chapters[1].title, 'Page 2'); assert.equal(liveBook.chapters.at(-1)!.title, 'Back cover');
  assert.ok(liveBook.visualLed);

  const fl = await exportBook({ book: flatBook, doc: flatBundle.doc, upgrade: { enhancements: [] }, format: 'EPUB_FIXED', options: { now: NOW } });
  const lv = await exportBook({ book: liveBook, doc: liveBundle.doc, upgrade: { enhancements: [] }, format: 'EPUB_FIXED', options: { now: NOW } });
  assert.ok(fl.ok && lv.ok, JSON.stringify(lv.findings.filter(f => f.severity === 'error')));
  const epub = lv.files.find(f => f.name.endsWith('.epub'))!.bytes;
  const entries = readZipEntries(epub);
  const pages = entries.filter(e => /\.xhtml$/.test(e.name) && /\/ch\d+\.xhtml$/.test(e.name));
  assert.equal(pages.length, b.spreads.length, 'every spread is a page of the EPUB');
  const text = (await Promise.all(entries.filter(e => /\.(xhtml|opf|json)$/.test(e.name)).map(e => readZipText(epub, e)))).join('\n');
  assert.match(text, /<svg/, 'pages are the drawn vector art'); assert.doesNotMatch(text, /"behaviors"|"scores"|"musicbox"|living-test|"narration"/);
  // the flat part of the file is the same with or without the living layer
  const pageXml = async (bytes: Uint8Array) => Promise.all(readZipEntries(bytes).filter(e => /\/ch\d+\.xhtml$/.test(e.name)).sort((a, c) => a.name.localeCompare(c.name)).map(e => readZipText(bytes, e)));
  assert.deepEqual(await pageXml(epub), await pageXml(fl.files.find(f => f.name.endsWith('.epub'))!.bytes));

  // report: reader-only lists behaviours, music, narration, drag/tilt, haptics
  assert.deepEqual(fl.report!.readerOnly, READER_ONLY_NOTES, 'a flat-only book reports exactly what it did before');
  const ro = lv.report!.readerOnly;
  assert.deepEqual(ro.slice(0, READER_ONLY_NOTES.length), READER_ONLY_NOTES);
  const joined = ro.join('\n');
  assert.match(joined, /living book/i); assert.match(joined, /Touch and pointer interactions are reader-only/); assert.match(joined, /Drag and tilt/); assert.match(joined, /Music and sound are reader-only: 1 music cues/);
  assert.match(joined, /Read-aloud narration/); assert.match(joined, /idle animations/); assert.match(joined, /Haptic/);
  // the live fidelity API says the same (what the export dialog shows) and pages stay FULL
  const fid = fidelityFor({ book: liveBook, doc: liveBundle.doc, upgrade: { enhancements: [] } }, 'EPUB_FIXED');
  assert.deepEqual(fid.readerOnly, ro.slice(READER_ONLY_NOTES.length));
  assert.equal(fid.summary.overall, 'FULL'); assert.equal(fid.pages.length, b.spreads.length);

  // PDF too
  const pdf = await exportBook({ book: liveBook, doc: liveBundle.doc, upgrade: { enhancements: [] }, format: 'PDF_SCREEN', options: { now: NOW } });
  assert.ok(pdf.ok); assert.ok(pdf.files[0].bytes.length > 10_000);
  assert.match(new TextDecoder('latin1').decode(pdf.files[0].bytes.slice(0, 8)), /^%PDF-/);
  assert.ok(!/behaviors|musicbox/.test(new TextDecoder('latin1').decode(pdf.files[0].bytes)));
});

test('livingNotes: tally and wording', () => {
  assert.deepEqual(livingReaderOnlyNotes(null), []);
  assert.deepEqual(livingReaderOnlyNotes(emptyLivingBook(SHOWCASE_BOOKS[0])), []);
  const t = tallyLiving(sampleLiving('moon-blanket', 'x'));
  assert.equal(t.behaviors, 4); assert.equal(t.drag, 1); assert.equal(t.tilt, 1); assert.equal(t.idle, 1); assert.equal(t.interactive, 3); assert.equal(t.musicCues, 1); assert.equal(t.haptics, 1); assert.equal(t.narratedPages, 1);
  const doc = buildShowcaseTelaDoc('moon-blanket');
  assert.equal(telaDocToBook(doc, { chapters: [] }).chapters[2].title, 'Page 3', 'fixed pages take their title from the frame, not from lettered HEADLINE glyphs');
  assert.equal(showcaseAlbumId('moon-blanket'), 'showcase_moon-blanket'); assert.equal(frameLabelFor(SHOWCASE_BOOKS[0], 1), 'Moon Blanket');
});
