// Tests for the dep-free EPUB reader + epubcheck-style validator (services/bookmeta/epub.ts).
// A tiny ZIP writer builds fixture EPUBs in memory, so each structural rule is proven by breaking exactly one thing.
//
//   npx tsx --test tests/bookEpub.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import { inspectEpub, resolveHref, xhtmlToHtmlLite } from '../services/bookmeta/epub';

interface Ent { name: string; data: string | Buffer; deflate?: boolean; extra?: boolean }

function zip(entries: Ent[]): Uint8Array {
  const chunks: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const comp = e.deflate ? deflateRawSync(raw) : raw;
    const extra = e.extra ? Buffer.from([0xfe, 0xca, 0x00, 0x00]) : Buffer.alloc(0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(extra.length, 28);
    chunks.push(lh, name, extra, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + extra.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cd, eocd]));
}

const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const chapter = (h: string, body: string) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${h}</title></head><body><h1>${h}</h1>${body}</body></html>`;
const NAV = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">The Beginning</a></li><li><a href="ch2.xhtml">The End</a></li></ol></nav></body></html>`;

function opf(over: { version?: string; uid?: string; identifier?: string; title?: string; language?: string; modified?: boolean; extraManifest?: string; spine?: string; nav?: boolean; cover?: boolean } = {}) {
  const o = { version: '3.0', uid: 'pub-id', identifier: 'urn:uuid:1234', title: 'My Book', language: 'en', modified: true, nav: true, cover: true, ...over };
  return `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="${o.version}" unique-identifier="${o.uid}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${o.identifier === '' ? '' : `<dc:identifier id="pub-id">${o.identifier}</dc:identifier>`}
${o.title === '' ? '' : `<dc:title>${o.title}</dc:title>`}
${o.language === '' ? '' : `<dc:language>${o.language}</dc:language>`}
<dc:creator>Ada Writer</dc:creator>
${o.modified ? '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' : ''}
</metadata>
<manifest>
${o.nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
${o.cover ? '<item id="cov" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}
${o.extraManifest ?? ''}
</manifest>
<spine>${o.spine ?? '<itemref idref="c1"/><itemref idref="c2"/>'}</spine>
</package>`;
}

const LONG = '<p>' + 'It was a bright cold day in April and the clocks were striking thirteen. '.repeat(10) + '</p>';

function good(over: { opf?: string; extra?: Ent[]; ch1?: string; drop?: string[]; mimeEntry?: Partial<Ent>; reorder?: boolean } = {}): Uint8Array {
  const mime: Ent = { name: 'mimetype', data: 'application/epub+zip', ...over.mimeEntry };
  let ents: Ent[] = [
    mime,
    { name: 'META-INF/container.xml', data: CONTAINER, deflate: true },
    { name: 'OEBPS/content.opf', data: over.opf ?? opf(), deflate: true },
    { name: 'OEBPS/nav.xhtml', data: NAV, deflate: true },
    { name: 'OEBPS/ch1.xhtml', data: over.ch1 ?? chapter('The Beginning', LONG), deflate: true },
    { name: 'OEBPS/ch2.xhtml', data: chapter('The End', LONG), deflate: true },
    { name: 'OEBPS/cover.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    ...(over.extra ?? []),
  ];
  if (over.drop) ents = ents.filter(e => !over.drop!.includes(e.name));
  if (over.reorder) ents = [ents[1], ents[0], ...ents.slice(2)];
  return zip(ents);
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map(f => f.code);
const errors = (r: { findings: { code: string; severity: string }[] }) => r.findings.filter(f => f.severity === 'error').map(f => f.code);

test('a well-formed EPUB 3 has no errors and yields chapters, metadata and cover', async () => {
  const r = await inspectEpub(good());
  assert.deepEqual(errors(r), []);
  assert.equal(r.readable, true);
  assert.equal(r.version, '3.0');
  assert.equal(r.metadata.title, 'My Book');
  assert.deepEqual(r.metadata.creators, ['Ada Writer']);
  assert.equal(r.metadata.language, 'en');
  assert.equal(r.coverPath, 'OEBPS/cover.jpg');
  assert.equal(r.hasNav, true);
  assert.equal(r.chapters.length, 2);
  assert.equal(r.chapters[0].title, 'The Beginning');   // from the nav label
  assert.ok(r.chapters[0].wordCount > 100);
  assert.ok(!/<script/.test(r.chapters[0].html));
});

test('mimetype must be first, stored, exact and extra-free', async () => {
  assert.ok(errors(await inspectEpub(good({ drop: ['mimetype'] }))).includes('epub.mimetype_missing'));
  assert.ok(errors(await inspectEpub(good({ reorder: true }))).includes('epub.mimetype_not_first'));
  assert.ok(errors(await inspectEpub(good({ mimeEntry: { deflate: true } }))).includes('epub.mimetype_compressed'));
  assert.ok(errors(await inspectEpub(good({ mimeEntry: { data: 'application/zip' } }))).includes('epub.mimetype_wrong'));
  assert.ok(codes(await inspectEpub(good({ mimeEntry: { extra: true } }))).includes('epub.mimetype_extra'));
});

test('container.xml and OPF wiring errors are reported and stop further checks', async () => {
  assert.ok(errors(await inspectEpub(good({ drop: ['META-INF/container.xml'] }))).includes('epub.container_missing'));
  assert.ok(errors(await inspectEpub(good({ drop: ['OEBPS/content.opf'] }))).includes('epub.opf_missing'));
  const notZip = await inspectEpub(new Uint8Array([1, 2, 3, 4]));
  assert.equal(notZip.readable, false);
  assert.ok(errors(notZip).includes('epub.not_zip'));
});

test('identifier / title / language / modified rules', async () => {
  assert.ok(errors(await inspectEpub(good({ opf: opf({ identifier: '' }) }))).includes('epub.identifier_missing'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ uid: 'nope' }) }))).includes('epub.uid_unresolved'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ title: '' }) }))).includes('epub.title_missing'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ language: '' }) }))).includes('epub.language_missing'));
  assert.ok(codes(await inspectEpub(good({ opf: opf({ language: 'english!' }) }))).includes('epub.language_invalid'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ modified: false }) }))).includes('epub.modified_missing'));
});

test('manifest <-> archive drift and duplicate ids', async () => {
  const missing = await inspectEpub(good({ opf: opf({ extraManifest: '<item id="ghost" href="ghost.xhtml" media-type="application/xhtml+xml"/>' }) }));
  assert.ok(errors(missing).includes('epub.manifest_file_missing'));
  const dup = await inspectEpub(good({ opf: opf({ extraManifest: '<item id="c1" href="ch2.xhtml" media-type="application/xhtml+xml"/>' }) }));
  assert.ok(errors(dup).includes('epub.item_dup_id'));
  const unlisted = await inspectEpub(good({ extra: [{ name: 'OEBPS/stray.txt', data: 'x' }] }));
  assert.ok(codes(unlisted).includes('epub.unlisted_file'));
});

test('spine integrity and navigation document', async () => {
  assert.ok(errors(await inspectEpub(good({ opf: opf({ spine: '' }) }))).includes('epub.spine_empty'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ spine: '<itemref idref="c1"/><itemref idref="zzz"/>' }) }))).includes('epub.spine_bad_ref'));
  assert.ok(errors(await inspectEpub(good({ opf: opf({ nav: false }) }))).includes('epub.nav_missing'));
});

test('EPUB 2 needs an NCX and is flagged as legacy', async () => {
  const r = await inspectEpub(good({ opf: opf({ version: '2.0', nav: false, modified: false }) }));
  assert.ok(errors(r).includes('epub.ncx_missing'));
  assert.ok(codes(r).includes('epub.v2'));
});

test('broken images are errors; oversized images are flagged; alt text is counted', async () => {
  const withImg = chapter('The Beginning', LONG + '<img src="images/missing.png" alt="x"/><img src="cover.jpg"/>');
  const r = await inspectEpub(good({ ch1: withImg }));
  assert.ok(errors(r).includes('epub.image_broken'));
  assert.equal(r.accessibility.imageCount, 2);
  assert.equal(r.accessibility.imagesWithAlt, 1);
  assert.ok(codes(r).includes('a11y.alt_missing'));

  const big = Buffer.alloc(4 * 1024 * 1024, 7);
  const r2 = await inspectEpub(good({ opf: opf({ extraManifest: '<item id="big" href="big.jpg" media-type="image/jpeg"/>' }), extra: [{ name: 'OEBPS/big.jpg', data: big }] }));
  assert.ok(codes(r2).includes('epub.image_large'));
  assert.ok(!errors(r2).includes('epub.image_huge'));
});

test('embedded fonts, scripts, remote images and DRM', async () => {
  const fonts = await inspectEpub(good({ opf: opf({ extraManifest: '<item id="f" href="f.otf" media-type="font/otf"/>' }), extra: [{ name: 'OEBPS/f.otf', data: 'font' }] }));
  assert.ok(codes(fonts).includes('epub.fonts_embedded'));
  const scripted = await inspectEpub(good({ ch1: chapter('The Beginning', LONG + '<script>alert(1)</script>') }));
  assert.ok(codes(scripted).includes('epub.scripted'));
  assert.ok(!scripted.chapters[0].html.includes('alert'));
  const remote = await inspectEpub(good({ ch1: chapter('The Beginning', LONG + '<img src="https://x.test/a.png" alt="a"/>') }));
  assert.ok(codes(remote).includes('epub.remote_resources'));
  const drm = await inspectEpub(good({ extra: [{ name: 'META-INF/encryption.xml', data: '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>' }] }));
  assert.ok(errors(drm).includes('epub.drm'));
  const fontOnly = await inspectEpub(good({ extra: [{ name: 'META-INF/encryption.xml', data: '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>' }] }));
  assert.ok(!errors(fontOnly).includes('epub.drm'));
});

test('missing cover is a warning, accessibility metadata is read', async () => {
  const r = await inspectEpub(good({ opf: opf({ cover: false }) }));
  assert.ok(codes(r).includes('epub.cover_missing'));
  assert.equal(r.coverPath, undefined);
});

test('helpers: resolveHref and xhtmlToHtmlLite', () => {
  assert.equal(resolveHref('OEBPS/content.opf', 'text/ch%201.xhtml#a'), 'OEBPS/text/ch 1.xhtml');
  assert.equal(resolveHref('OEBPS/text/ch1.xhtml', '../images/a.png'), 'OEBPS/images/a.png');
  const html = xhtmlToHtmlLite('<html><body><div class="x"><p style="a">Hi <em>there</em> &amp; you</p><script>bad()</script></div></body></html>');
  assert.equal(html, '<p>Hi <em>there</em> &amp; you</p>');
});
