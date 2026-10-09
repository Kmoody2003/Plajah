// Book <-> Tela upgrade + open-format export. Run: npm run test:booktela
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

import { bookToTelaDoc, telaDocToBook, parseFrameId } from '../services/bookTela/bookToTela';
import { normalizeChapterHtml, plainText, htmlToNodes, nodesToHtml } from '../services/bookTela/html';
import { buildExportModel, pageFidelity, fidelitySummary } from '../services/bookTela/model';
import { ENHANCEMENTS, ENHANCEMENT_TYPES, instanceFidelity, resolveStrategy, validateInstance } from '../services/bookTela/enhancements';
import { buildEpub } from '../services/bookTela/export/epub';
import { buildPdf } from '../services/bookTela/export/pdf';
import { buildHtmlBundle, buildMarkdown } from '../services/bookTela/export/plain';
import { exportBook, fidelityFor, prepare } from '../services/bookTela/export';
import { decideExportRights } from '../services/bookTela/export/rights';
import { xmlWellFormed } from '../services/bookTela/export/xmlCheck';
import { isFontLicenseSafe } from '../services/bookTela/export/common';
import { bookFromAlbum, bookFromDraft, canUpgrade, chooseReaderMode, createUpgrade, makeBundle, pinnedVersionFor, previewUpgrade, revertUpgrade } from '../services/bookTela/upgrade';
import type { BookSource, EnhancementInstance, EnhancementType } from '../services/bookTela/types';
import { inspectEpub } from '../services/bookmeta/epub';
import { readZipEntries, readZipText } from '../services/bookmeta/zip';
import { newDraft } from '../services/bookmeta/drafts';
import type { TelaDoc } from '../types';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const png = 'data:image/png;base64,' + Buffer.from(PNG).toString('base64');
const NOW = new Date('2026-10-08T00:00:00Z');

const longPara = (n: number) => `<p>${'The lantern swung over the black water and the crew counted the hours until dawn. '.repeat(n)}</p>`;
function sample(extra: Partial<BookSource> = {}): BookSource {
  return {
    id: 'bk1', title: 'The Lantern & the Sea', subtitle: 'A tale', authors: ['Ada Writer'], language: 'en', coverUrl: png, description: 'A short sea story.',
    chapters: [
      { id: 'c1', title: 'Departure', html: `<h1>Departure</h1><p>The <em>lantern</em> glowed &amp; the <strong>sea</strong> breathed.</p>${longPara(1)}<blockquote><p>Quoted line</p></blockquote><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>` },
      { id: 'c2', title: 'Arrival', html: `<p>We arrived.</p><figure><img src="${png}" alt="A harbour at dusk"/><figcaption>The harbour</figcaption></figure><h3>Sub</h3><p>After the harbour.</p><hr/><p>Epilogue line.</p>` },
      { id: 'c3', title: 'Home', html: `${longPara(30)}<p>The end.</p>` },
    ],
    ...extra,
  };
}
const enh = (type: EnhancementType, chapterId: string, config: Record<string, any>, extra: Partial<EnhancementInstance> = {}): EnhancementInstance => ({ id: `e_${type}`, type, chapterId, config, ...extra });

const GOOD: Record<EnhancementType, EnhancementInstance> = {
  AUDIO_SYNC: enh('AUDIO_SYNC', 'c1', { src: 'https://cdn.example/narr.mp3' }),
  VIDEO: enh('VIDEO', 'c1', { src: 'https://cdn.example/v.mp4', poster: png }, { alt: 'Trailer poster showing a lantern' }),
  MOTION: enh('MOTION', 'c1', { lottie: { source: { format: 'json', url: 'https://cdn.example/a.json' }, intrinsicWidth: 400, intrinsicHeight: 300, autoplay: true, loop: true, speed: 1, direction: 'forward', fit: 'contain', posterSrc: png } }, { alt: 'A swaying lantern' }),
  INTERACTIVE_3D: enh('INTERACTIVE_3D', 'c2', { modelSrc: 'https://cdn.example/m.glb', poster: png }, { alt: 'A brass lantern, seen from the front' }),
  CHART: enh('CHART', 'c2', { title: 'Tide heights', kind: 'BAR', labels: ['Mon', 'Tue'], series: [{ name: 'Metres', values: [1.2, 2.4] }] }, { alt: 'Tide heights on Monday and Tuesday' }),
  ILLUSTRATED_OPENER: enh('ILLUSTRATED_OPENER', 'c1', { src: png, width: 1, height: 1 }, { alt: 'A lighthouse in a storm' }),
  ANIMATED_DROPCAP: enh('ANIMATED_DROPCAP', 'c1', { style: 'GROW' }),
  READER_NOTE: enh('READER_NOTE', 'c1', { text: 'Margin note text & more' }, { afterBlockId: 'c1:b0' }),
  GLOSSARY: enh('GLOSSARY', 'c1', { term: 'lantern', definition: 'A portable light.' }),
  BRANCHING: enh('BRANCHING', 'c1', { prompt: 'What now?', choices: [{ label: 'Sail on', targetChapterId: 'c2' }, { label: 'Go home', targetChapterId: 'c3' }] }, { afterBlockId: 'c1:b1' }),
  LIVE_DATA: enh('LIVE_DATA', 'c2', { label: 'Wind', snapshotValue: '14', unit: 'knots', formula: '=SUM(A1:A2)' }),
  COMMENTARY: enh('COMMENTARY', 'c2', { text: 'I wrote this scene first.' }, { afterBlockId: 'c2:b0' }),
};

const entriesOf = async (bytes: Uint8Array) => {
  const es = readZipEntries(bytes); const m = new Map<string, string>();
  for (const e of es) m.set(e.name, /\.(png|jpe?g|gif|woff2?|ttf|otf)$/.test(e.name) ? '' : await readZipText(bytes, e));
  return { es, m };
};

// ── 1. round trip ────────────────────────────────────────────────────────────

test('round trip: chapters -> Tela doc -> chapters is lossless and id-stable', () => {
  const b = sample();
  const doc = bookToTelaDoc(b, { now: 1 });
  const back = telaDocToBook(doc, b);
  assert.deepEqual(back.chapters.map(c => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(back.chapters.map(c => c.title), ['Departure', 'Arrival', 'Home']);
  for (let i = 0; i < 3; i++) assert.equal(back.chapters[i].html, normalizeChapterHtml(b.chapters[i].title, b.chapters[i].html), `chapter ${i} html`);
  assert.deepEqual(back.warnings, []);
  assert.equal(back.coverUrl, png);
  const roles = doc.frames.map(f => parseFrameId(doc.id, f.id));
  assert.ok(roles.filter(r => r.role === 'opener').length === 3);
  assert.ok(roles.filter(r => r.role === 'writer' && r.chapterId === 'c3').length > 1, 'long chapter split across page frames');
  const again = telaDocToBook(bookToTelaDoc({ ...b, chapters: back.chapters }, { now: 1 }), b);
  assert.deepEqual(again.chapters.map(c => c.html), back.chapters.map(c => c.html), 'fixed point');
});

test('round trip: text edits made in Tela sync back; missing chapters and foreign frames warn', () => {
  const b = sample();
  const doc: TelaDoc = JSON.parse(JSON.stringify(bookToTelaDoc(b, { now: 1 })));
  const w = Object.values(doc.devices).find(d => d.type === 'WRITER' && d.id.includes(':ch:c1:'))!;
  if (w.type !== 'WRITER') throw new Error('writer expected');
  w.blocks[0].text = 'Edited <em>opening</em> line.';
  const op = Object.values(doc.devices).find(d => d.type === 'VECTOR' && d.id.endsWith(':ch:c2:opener'))!;
  if (op.type === 'VECTOR') op.objects.find(o => o.templateRole === 'HEADLINE')!.text = 'Landfall';
  doc.devices['x1'] = { id: 'x1', type: 'GRID', rows: 1, cols: 1, cells: { A1: '1' } } as any;
  doc.frames.push({ id: 'x-frame', kind: 'SCREEN', preset: 'FREE', x: 0, y: 99999, w: 100, h: 100, deviceIds: ['x1'], label: 'Sums' });
  doc.frames = doc.frames.filter(f => !f.id.includes(':ch:c3:'));
  const back = telaDocToBook(doc, b);
  assert.ok(back.chapters[0].html.startsWith('<p>Edited <em>opening</em> line.</p>'));
  assert.equal(back.chapters[1].title, 'Landfall');
  assert.equal(back.chapters.length, 2);
  assert.ok(back.warnings.some(x => /Home/.test(x)), 'missing chapter is reported');
  assert.ok(back.warnings.some(x => /GRID/.test(x)), 'foreign device is reported');
});

test('frame-level enhancements add frames but never change the text', () => {
  const b = sample();
  const plain = telaDocToBook(bookToTelaDoc(b, { now: 1 }), b);
  const withAll = bookToTelaDoc(b, { now: 1, enhancements: Object.values(GOOD) });
  const back = telaDocToBook(withAll, b);
  assert.deepEqual(back.chapters.map(c => c.html), plain.chapters.map(c => c.html));
  assert.ok(withAll.frames.length > bookToTelaDoc(b, { now: 1 }).frames.length);
  const kinds = new Set(Object.values(withAll.devices).map(d => d.type));
  for (const t of ['MEDIA', 'CHART', 'GRID', 'VECTOR', 'WRITER']) assert.ok(kinds.has(t as any), t);
});

test('html-lite parser/serialiser is idempotent and strips active content', () => {
  const dirty = '<p onclick="x()">Hi <script>alert(1)</script><b>bold</b> <u>u</u></p><iframe src="x"></iframe><p>two</p>';
  const once = nodesToHtml(htmlToNodes(dirty));
  assert.equal(once, nodesToHtml(htmlToNodes(once)));
  assert.ok(!/script|onclick|iframe/.test(once));
  assert.equal(plainText(once), 'Hi bold u\n\ntwo');
  assert.equal(htmlToNodes('First.\n\nSecond.').length, 2);
});

// ── 2. upgrade / preview / revert ────────────────────────────────────────────

test('upgrade is opt-in, reversible and previewable', () => {
  const b = sample();
  assert.equal(canUpgrade(b).ok, true);
  assert.equal(canUpgrade({ ...b, chapters: [] }).ok, false);
  const { upgrade, doc } = createUpgrade(b, { now: 5, enhancements: [GOOD.GLOSSARY] });
  assert.deepEqual(upgrade.originalChapters, b.chapters, 'verbatim snapshot');
  upgrade.originalChapters[0].html = 'MUTATED';
  assert.notEqual(b.chapters[0].html, 'MUTATED', 'snapshot is a copy; the original book is untouched');
  const fresh = createUpgrade(b, { now: 5 });
  const r = revertUpgrade(fresh.upgrade, 9);
  assert.deepEqual(r.chapters, b.chapters);
  assert.equal(r.upgrade.revertedAt, 9);
  const pv = previewUpgrade(b, { now: 5, enhancements: Object.values(GOOD) });
  assert.equal(pv.textPreserved, true);
  assert.equal(pv.before.chapters, 3); assert.equal(pv.after.chapters, 3);
  assert.equal(pv.before.words, pv.after.words);
  assert.ok(pv.openerSvgs.length === 3 && pv.openerSvgs.every(o => o.svg.startsWith('<svg')));
  assert.ok(doc.frames.length > 3);
});

test('adapters: Album chapters, file-backed chapters are reported, drafts map metadata', () => {
  const r = bookFromAlbum({ id: 'a1', title: 'T', artist: 'A', ownerId: 'u', coverImage: 'c', bookChapters: [
    { id: 'x', title: 'Text', content: 'Para one.\n\nPara two.' }, { id: 'y', title: 'Scan', url: 'https://f/x.pdf', format: 'PDF' }] } as any);
  assert.equal(r.book.chapters.length, 1); assert.deepEqual(r.unsupported, ['Scan']);
  const d = newDraft('u1', 'NOVEL'); d.metadata.title = 'Draft'; d.metadata.contributors = [{ name: 'Zed', role: 'author' }];
  d.manuscript = { fileName: 'a.md', ext: 'md', sizeBytes: 1, source: 'md', chapters: [{ id: 'c', title: 'One', html: '<p>x</p>', text: 'x', wordCount: 1, included: true }] };
  const b = bookFromDraft(d);
  assert.equal(b.title, 'Draft'); assert.deepEqual(b.authors, ['Zed']); assert.equal(b.chapters.length, 1);
});

// ── 3. fidelity ──────────────────────────────────────────────────────────────

test('fidelity classification: every enhancement has a declared fallback and a sensible FULL/DEGRADED/OMITTED', () => {
  for (const t of ENHANCEMENT_TYPES) {
    const def = ENHANCEMENTS[t];
    assert.ok(def.allowedFallbacks.includes(def.defaultFallback), `${t} default is allowed`);
    assert.ok(def.exportSummary.length > 20, `${t} explains itself`);
    const inst = GOOD[t];
    assert.deepEqual(validateInstance(inst).filter(i => i.severity === 'error'), [], `${t} sample is valid`);
    for (const fmt of ['EPUB_REFLOW', 'EPUB_FIXED', 'PDF_SCREEN', 'PDF_PRINT', 'MARKDOWN', 'HTML'] as const) {
      const f = instanceFidelity(inst, fmt);
      assert.ok(['FULL', 'DEGRADED', 'OMITTED'].includes(f.fidelity));
      if (f.fidelity !== 'FULL') assert.ok(f.changes.length > 0, `${t}/${fmt} says what changes`);
    }
  }
  assert.equal(instanceFidelity(GOOD.ILLUSTRATED_OPENER, 'EPUB_REFLOW').fidelity, 'FULL');
  assert.equal(instanceFidelity(GOOD.AUDIO_SYNC, 'EPUB_REFLOW').fidelity, 'DEGRADED');
  const broken = enh('AUDIO_SYNC', 'c1', {});
  assert.equal(resolveStrategy(broken).strategy, 'omit-note');
  assert.equal(instanceFidelity(broken, 'EPUB_REFLOW').fidelity, 'OMITTED');
  assert.equal(resolveStrategy(enh('VIDEO', 'c1', { src: 'x' }, { alt: 'a' })).strategy, 'qr-link');
  assert.equal(resolveStrategy(enh('MOTION', 'c1', { lottie: { source: {} } })).strategy, 'omit-note');
  assert.ok(validateInstance(enh('READER_NOTE', 'c1', { text: 'x' }, { fallbackOverride: 'qr-link' })).some(i => i.code === 'enh.fallback_not_allowed'));
});

test('per-page fidelity badge: plain book is all FULL; enhancements mark exactly their pages', () => {
  const b = sample();
  const plain = bookToTelaDoc(b, { now: 1 });
  assert.equal(fidelitySummary(pageFidelity(plain, null, 'EPUB_REFLOW')).overall, 'FULL');
  const enhs = [GOOD.AUDIO_SYNC, GOOD.CHART, GOOD.ILLUSTRATED_OPENER, enh('LIVE_DATA', 'c2', { label: 'x' })];
  const doc = bookToTelaDoc(b, { now: 1, enhancements: enhs });
  const pages = pageFidelity(doc, { enhancements: enhs }, 'EPUB_REFLOW');
  const by = (id: string) => pages.find(p => p.enhancementIds.includes(id))!;
  assert.equal(by('e_AUDIO_SYNC').fidelity, 'DEGRADED');
  assert.equal(by('e_CHART').fidelity, 'DEGRADED');
  assert.equal(by('e_ILLUSTRATED_OPENER').fidelity, 'FULL');
  assert.equal(fidelitySummary(pages).overall, 'OMITTED', 'the incomplete live-data block is reported as omitted');
  assert.equal(fidelitySummary(pageFidelity(doc, { enhancements: enhs.slice(0, 3) }, 'EPUB_REFLOW')).overall, 'DEGRADED');
  assert.ok(pages.filter(p => p.fidelity === 'FULL').length >= 4, 'text-only pages stay FULL');
  const d2: TelaDoc = JSON.parse(JSON.stringify(doc));
  d2.devices.g1 = { id: 'g1', type: 'GRID', rows: 1, cols: 1, cells: {} } as any;
  d2.frames.push({ id: 'free', kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: 1, h: 1, deviceIds: ['g1'], label: 'Sheet' });
  assert.equal(pageFidelity(d2, { enhancements: enhs }, 'EPUB_REFLOW').find(p => p.frameId === 'free')!.fidelity, 'OMITTED');
  assert.equal(fidelityFor({ book: b, upgrade: null }, 'EPUB_REFLOW').summary.overall, 'FULL');
});

// ── 4. fallbacks never emit empty/broken markup (all formats) ────────────────

test('every fallback strategy yields valid, non-empty markup in EPUB, HTML and Markdown', async () => {
  const b = sample();
  const variants: EnhancementInstance[][] = [
    Object.values(GOOD),
    [enh('VIDEO', 'c1', { src: 'x' }, { alt: 'a' }), enh('MOTION', 'c1', { lottie: { source: {}, intrinsicWidth: 1, intrinsicHeight: 1 } }, { alt: 'alt only' }), enh('INTERACTIVE_3D', 'c2', { modelSrc: 'm' }, { alt: 'obj' }), enh('CHART', 'c2', { title: 'T', labels: ['a'], series: [{ name: 's', values: [1] }] })],
    ENHANCEMENT_TYPES.map(t => enh(t, 'c1', {}, { id: `bad_${t}` })),
    ENHANCEMENT_TYPES.map(t => ({ ...GOOD[t], id: `om_${t}`, fallbackOverride: 'omit-note' as const })),
  ];
  for (const [vi, enhancements] of variants.entries()) {
    const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements });
    const model = buildExportModel({ doc, book: b, upgrade }, { format: 'EPUB_REFLOW', exportedAt: NOW.toISOString() });
    for (const layout of ['REFLOW', 'FIXED'] as const) {
      const r = await buildEpub(b, model, { now: NOW, layout });
      assert.deepEqual(r.findings.filter(f => f.severity === 'error').map(f => f.message), [], `variant ${vi} ${layout}`);
      const { m } = await entriesOf(r.bytes);
      for (const [name, text] of m) {
        if (!/\.xhtml$/.test(name)) continue;
        assert.ok(!/<script/i.test(text), `${name} has no script`);
        assert.ok(!/\[\[n:/.test(text), `${name} has no unresolved note marker`);
        assert.ok(!/<img\b(?![^>]*\bsrc="[^"]+")/i.test(text), `${name} img has src`);
        assert.ok(!/<img\b(?![^>]*\balt=)/i.test(text), `${name} img has alt`);
        assert.ok(!/<(p|aside|li|figcaption|td|th|h[1-6])>\s*<\/\1>/.test(text), `${name} has an empty element`);
        assert.ok(!/(src)="https?:\/\//i.test(text), `${name} has no remote media`);
      }
    }
    const md = await buildMarkdown(b, model, { now: NOW });
    assert.ok(!/\[\[n:|undefined|\[object/.test(md.text), `variant ${vi} markdown clean`);
    const hb = await buildHtmlBundle(b, model, { now: NOW });
    assert.ok(!/\[\[n:|undefined|\[object/.test(hb.text), `variant ${vi} html clean`);
    assert.ok(!/<(p|aside|li|figcaption|td|th|h[1-6])>\s*<\/\1>/.test(hb.text), `variant ${vi} html has no empty element`);
    if (vi === 2 || vi === 3) assert.ok(model.omitted.length >= 1, 'omissions are reported');
  }
});

test('fallback content: QR+link for audio, table for chart, endnotes for notes/glossary, links for branching, frozen value for live data', async () => {
  const b = sample();
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: Object.values(GOOD) });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'EPUB_REFLOW', exportedAt: NOW.toISOString() });
  const r = await buildEpub(b, model, { now: NOW, layout: 'REFLOW' });
  const { m, es } = await entriesOf(r.bytes);
  const c1 = m.get('OEBPS/ch001.xhtml')!, c2 = m.get('OEBPS/ch002.xhtml')!;
  assert.match(c1, /narrated version of this book/);
  assert.match(c1, /href="https:\/\/plajah\.com\/book\/bk1"/);
  assert.ok(es.some(e => /images\/qr-\d+\.svg/.test(e.name)), 'QR image embedded');
  assert.match(c1, /epub:type="noteref"/); assert.match(c1, /epub:type="endnote"/);
  assert.match(c1, /Margin note text &amp; more/);
  assert.match(c1, /<a href="ch002\.xhtml">Sail on<\/a>/);
  assert.match(c2, /<table>[\s\S]*Tide heights[\s\S]*<th scope="row">Mon<\/th>/);
  assert.match(c2, /Wind:<\/strong> 14 knots/);
  assert.match(c2, /Author commentary/);
  assert.match(m.get('OEBPS/glossary.xhtml')!, /<dt>lantern<\/dt>/);
  assert.match(c1, /lantern<\/em><a id="r1-\d+" class="noteref"|lantern<a id="r1-\d+" class="noteref"/);
  assert.match(c1, /<div class="opener"><img src="images\/img-\d+\.png" alt="A lighthouse in a storm"\/>/);
});

// ── 5. EPUB output validates with the bookmeta validator ─────────────────────

test('reflowable EPUB passes services/bookmeta/epub.ts with no findings, and reads back', async () => {
  const b = sample({ metadata: { title: 'The Lantern & the Sea', language: 'en', penName: 'A. Writer', keywords: ['sea', 'lantern'], copyrightHolder: 'Ada Writer', copyrightYear: '2026', isbn: { mode: 'own', value: '9780306406157' } } as any });
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: Object.values(GOOD) });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'EPUB_REFLOW', exportedAt: NOW.toISOString() });
  const r = await buildEpub(b, model, { now: NOW, layout: 'REFLOW', watermarkTag: 'PLJ-TEST123' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings, [], 'no errors, warnings or info');
  const insp = await inspectEpub(r.bytes);
  assert.equal(insp.version, '3.0'); assert.equal(insp.hasNav, true); assert.ok(insp.coverPath);
  assert.equal(insp.metadata.language, 'en'); assert.deepEqual(insp.metadata.creators, ['Ada Writer']);
  assert.equal(insp.metadata.identifier, 'urn:isbn:9780306406157');
  assert.ok(insp.accessibility.features.includes('structuralNavigation') && insp.accessibility.features.includes('alternativeText'));
  assert.ok(insp.accessibility.hazards.includes('noFlashingHazard'));
  assert.equal(insp.accessibility.imageCount, insp.accessibility.imagesWithAlt, 'every <img> has alt');
  assert.ok(insp.chapters.filter(c => c.kind === 'chapter').length >= 3);
  const { m, es } = await entriesOf(r.bytes);
  assert.match(m.get('OEBPS/ch001.xhtml')!, /The <em>lantern<a id="r1-1"/);
  const first = [...es].sort((a, c) => a.localOffset - c.localOffset)[0];
  assert.equal(first.name, 'mimetype'); assert.equal(first.method, 0); assert.equal(first.localExtraLen, 0);
  assert.match(m.get('OEBPS/package.opf')!, /plajah:watermark">PLJ-TEST123</);
  assert.match(m.get('OEBPS/package.opf')!, /plajah:drm">none</);
  assert.ok(!es.some(e => /\.js$/i.test(e.name)), 'no scripts shipped');
  assert.ok(!/scripted/.test(m.get('OEBPS/package.opf')!));
  const r2 = await buildEpub(b, model, { now: NOW, layout: 'REFLOW', watermarkTag: 'PLJ-TEST123' });
  assert.deepEqual(Buffer.from(r2.bytes), Buffer.from(r.bytes), 'deterministic');
  const r3 = await buildEpub(b, model, { now: NOW, layout: 'REFLOW', includeColophon: false });
  assert.ok(!(await entriesOf(r3.bytes)).m.has('OEBPS/colophon.xhtml'));
  assert.equal(r3.ok, true);
});

test('fixed-layout EPUB passes the validator and declares pre-paginated rendition', async () => {
  const b = sample({ visualLed: true });
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: [GOOD.ILLUSTRATED_OPENER, GOOD.CHART, GOOD.VIDEO] });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'EPUB_FIXED', exportedAt: NOW.toISOString() });
  const r = await buildEpub(b, model, { now: NOW, layout: 'FIXED' });
  assert.equal(r.layout, 'FIXED'); assert.equal(r.ok, true);
  assert.deepEqual(r.findings.filter(f => f.severity !== 'info'), []);
  const { m } = await entriesOf(r.bytes);
  assert.match(m.get('OEBPS/package.opf')!, /rendition:layout">pre-paginated</);
  const page = m.get('OEBPS/ch001.xhtml')!;
  assert.match(page, /<meta name="viewport" content="width=1024, height=768"\/>/);
  assert.match(page, /<h1 class="sr"[^>]*>Departure<\/h1>/, 'real heading present for AT and navigation');
  assert.ok([...m.keys()].filter(k => /ch\d+.*\.xhtml$/.test(k)).length > 3, 'multiple fixed pages');
  const insp = await inspectEpub(r.bytes);
  assert.ok(!insp.accessibility.features.includes('displayTransformability'), 'not claimed for fixed layout');
});

test('layout recommendation: text-led -> reflow, picture-led -> fixed', () => {
  const textBook = sample();
  const picBook: BookSource = { ...sample(), chapters: [{ id: 'p1', title: 'Pages', html: `<figure><img src="${png}" alt="a"/></figure><figure><img src="${png}" alt="b"/></figure><p>x</p>` }] };
  assert.equal(fidelityFor({ book: textBook }, 'EPUB_REFLOW').recommended.layout, 'REFLOW');
  assert.equal(fidelityFor({ book: picBook }, 'EPUB_REFLOW').recommended.layout, 'FIXED');
});

test('embedded fonts: only licence-safe fonts are embedded', async () => {
  assert.ok(isFontLicenseSafe('OFL-1.1') && isFontLicenseSafe('Apache-2.0') && !isFontLicenseSafe('Commercial') && !isFontLicenseSafe(''));
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/eb-garamond/files');
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, 'eb-garamond-latin-400-normal.woff')));
  const b = sample();
  const { doc, upgrade } = createUpgrade(b, { now: 1 });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'EPUB_REFLOW', exportedAt: NOW.toISOString() });
  const r = await buildEpub(b, model, { now: NOW, layout: 'REFLOW', fonts: [
    { family: 'EB Garamond', license: 'OFL-1.1', weight: 400, style: 'normal', ext: 'woff', bytes },
    { family: 'Proprietary Sans', license: 'Commercial', weight: 400, style: 'normal', ext: 'woff', bytes }] });
  assert.equal(r.ok, true);
  const insp = await inspectEpub(r.bytes);
  assert.equal(insp.fonts.length, 1);
  assert.ok(r.report.warnings.some(w => /Proprietary Sans/.test(w)));
});

// ── 6. PDF structure ─────────────────────────────────────────────────────────

test('screen PDF: RGB pages, outline, internal + URI links, metadata', async () => {
  const b = sample();
  const enhs = [GOOD.BRANCHING, GOOD.AUDIO_SYNC, GOOD.CHART, GOOD.READER_NOTE, GOOD.GLOSSARY, GOOD.ILLUSTRATED_OPENER];
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: enhs });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'PDF_SCREEN', exportedAt: NOW.toISOString() });
  const r = await buildPdf(b, model, { mode: 'screen', now: NOW, watermarkTag: 'PLJ-ABC' });
  assert.equal(r.kind, 'paged');
  const pdf = await PDFDocument.load(r.bytes);
  assert.equal(pdf.getPageCount(), r.pageCount); assert.ok(r.pageCount >= 6);
  assert.equal(pdf.getTitle(), 'The Lantern & the Sea'); assert.equal(pdf.getAuthor(), 'Ada Writer');
  const cat = pdf.catalog;
  assert.ok(cat.get(PDFName.of('Outlines')), 'has outline');
  const outlines = pdf.context.lookup(cat.get(PDFName.of('Outlines'))!, PDFDict);
  assert.equal(outlines.get(PDFName.of('Count'))!.toString(), String(r.outline.length));
  assert.deepEqual(r.outline.slice(0, 3).map(o => o.title), ['Departure', 'Arrival', 'Home']);
  let internal = 0, uri = 0;
  for (const p of pdf.getPages()) {
    const an = p.node.Annots(); if (!an) continue;
    for (let i = 0; i < an.size(); i++) { const d = pdf.context.lookup(an.get(i), PDFDict); if (d.get(PDFName.of('Dest'))) internal++; if (d.get(PDFName.of('A'))) uri++; }
  }
  assert.ok(internal >= 3 + 2, `contents entries + branching choices are internal links (got ${internal})`);
  assert.ok(uri >= 1, 'QR / platform link');
  const raw = Buffer.from(r.bytes).toString('latin1');
  assert.match(raw, /PlajahWatermark/); assert.ok(!/DeviceCMYK/.test(raw), 'RGB only');
  assert.ok(r.report.warnings.some(w => /tagged PDF/.test(w)), 'honest about what is not produced');
  assert.equal(pdf.getPage(0).getWidth(), 5.5 * 72);
});

test('print PDF (picture book): trim + 0.125in bleed, TrimBox/BleedBox, mirrored, padded page count', async () => {
  const b = sample({ visualLed: true });
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: [GOOD.ILLUSTRATED_OPENER] });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'PDF_PRINT', exportedAt: NOW.toISOString() });
  const r = await buildPdf(b, model, { mode: 'print', now: NOW, trimId: '8x10', printer: 'lulu', binding: 'PERFECT_PAPERBACK' });
  assert.equal(r.kind, 'paged');
  const pdf = await PDFDocument.load(r.bytes);
  const p0 = pdf.getPage(0);
  assert.equal(Math.round(p0.getWidth()), Math.round((8 + 0.125) * 72)); assert.equal(Math.round(p0.getHeight()), Math.round((10 + 0.25) * 72));
  const tb = (i: number) => pdf.getPage(i).getTrimBox();
  assert.equal(Math.round(tb(0).width), 8 * 72); assert.equal(Math.round(tb(0).height), 10 * 72);
  assert.equal(Math.round(tb(0).x), 0, 'recto: bleed on the right');
  assert.equal(Math.round(tb(1).x), Math.round(0.125 * 72), 'verso: bleed on the left');
  assert.equal(Math.round(pdf.getPage(0).getBleedBox().width), Math.round(p0.getWidth()));
  assert.equal(pdf.getPageCount() % 2, 0);
  assert.ok(pdf.getPageCount() >= r.print!.paddedPages);
  assert.ok(r.report.warnings.some(w => /RGB/.test(w)));
  assert.ok(r.report.warnings.some(w => /Print:/.test(w)), 'printer page-limit preflight surfaced');
});

test('print PDF (text-led) reuses the POD interior pipeline unchanged', async () => {
  const b = sample();
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: [GOOD.GLOSSARY] });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'PDF_PRINT', exportedAt: NOW.toISOString() });
  const r = await buildPdf(b, model, { mode: 'print', now: NOW, watermarkTag: 'PLJ-ZZ' });
  assert.equal(r.kind, 'pod-interior');
  const pdf = await PDFDocument.load(r.bytes, { updateMetadata: false });
  assert.ok(pdf.getPageCount() >= 24 && pdf.getPageCount() % 2 === 0, `padded to printer rules (${pdf.getPageCount()})`);
  assert.equal(pdf.getProducer(), 'Plajah Print Edition');
  assert.match(Buffer.from(r.bytes).toString('latin1'), /PlajahWatermark/);
  assert.ok(r.report.warnings.some(w => /text-only/.test(w)));
});

// ── 7. plain exports + sidecar ───────────────────────────────────────────────

test('Markdown and HTML bundles carry every word, the sidecar, footnotes and the removable colophon', async () => {
  const b = sample();
  const { doc, upgrade } = createUpgrade(b, { now: 1, enhancements: [GOOD.READER_NOTE, GOOD.GLOSSARY, GOOD.CHART] });
  const model = buildExportModel({ doc, book: b, upgrade }, { format: 'MARKDOWN', exportedAt: NOW.toISOString() });
  const md = await buildMarkdown(b, model, { now: NOW, watermarkTag: 'PLJ-1' });
  assert.match(md.text, /^---\ntitle: "The Lantern & the Sea"/);
  assert.match(md.text, /watermark: "PLJ-1"/); assert.match(md.text, /drm: none/);
  assert.match(md.text, /\[\^1-1\]/); assert.match(md.text, /\[\^1-1\]: /);
  assert.match(md.text, /\| Mon \| 1.2 \|/);
  assert.match(md.text, /!\[A harbour at dusk\]\(images\/img-\d+\.png "The harbour"\)/);
  for (const w of ['lantern', 'harbour', 'Epilogue', 'The end.']) assert.ok(md.text.includes(w));
  assert.match(md.text, /## Exported from Plajah/);
  const noCol = await buildMarkdown(b, model, { now: NOW, includeColophon: false });
  assert.ok(!/## Exported from Plajah/.test(noCol.text));
  const { m: mm } = await entriesOf(md.bytes);
  assert.ok(mm.has('book.md') && mm.has('plajah-export.json'));
  const side = JSON.parse(mm.get('plajah-export.json')!);
  assert.equal(side.drm, 'none'); assert.equal(side.watermarkTag, 'PLJ-1'); assert.equal(side.fidelity.overall, 'DEGRADED');
  assert.ok(side.degraded.length >= 1);
  const hb = await buildHtmlBundle(b, model, { now: NOW });
  assert.match(hb.text, /<html lang="en">/); assert.match(hb.text, /prefers-reduced-motion/); assert.ok(!/<script/i.test(hb.text));
  assert.match(hb.text, /<table>/);
});

test('exportBook: rights gate blocks, outputs carry the sidecar, hostile titles stay valid', async () => {
  const b = sample();
  const denied = await exportBook({ book: b, format: 'EPUB_REFLOW', rights: decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: null }) });
  assert.equal(denied.ok, false); assert.ok(denied.blockedReason); assert.equal(denied.files.length, 0);
  const ok = await exportBook({ book: b, format: 'EPUB_REFLOW', options: { now: NOW }, rights: decideExportRights({ isOwner: true, signedIn: true, isPaid: true }) });
  assert.equal(ok.ok, true); assert.deepEqual(ok.files.map(f => f.name), ['the-lantern-the-sea.epub', 'plajah-export.json']);
  assert.equal(ok.files[0].mime, 'application/epub+zip');
  const pdf = await exportBook({ book: b, format: 'PDF_SCREEN', options: { now: NOW } });
  assert.equal(pdf.files[0].mime, 'application/pdf');
  const nasty = sample({ title: 'A <b>"quoted"</b> & title', authors: ['O\'Brien & Sons <x>'] });
  const r = await exportBook({ book: nasty, format: 'EPUB_REFLOW', options: { now: NOW } });
  assert.equal(r.ok, true, JSON.stringify(r.findings));
  const f = await exportBook({ book: nasty, format: 'EPUB_FIXED', options: { now: NOW } });
  assert.equal(f.ok, true, JSON.stringify(f.findings));
});

// ── 8. rights, pinning, reader mode ──────────────────────────────────────────

test('export rights: author always; buyer only with DOWNLOAD_OPEN, pinned, watermarked; rentals/streaming-only/strangers denied', () => {
  const lic = (over: object = {}) => ({ grant: 'PURCHASE' as const, delivery: 'DOWNLOAD_OPEN' as const, issuedAt: 100, watermarkTag: 'PLJ-AAA', ...over });
  assert.equal(decideExportRights({ isOwner: true, signedIn: true, isPaid: true }).scope, 'author');
  const buyer = decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: lic() });
  assert.deepEqual([buyer.allowed, buyer.scope, buyer.version, buyer.watermarkTag], [true, 'buyer', 'pinned-to-purchase', 'PLJ-AAA']);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: lic({ watermarkTag: undefined }), watermarkOn: true, computedWatermarkTag: 'PLJ-CCC' }).watermarkTag, 'PLJ-CCC');
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: lic({ delivery: 'PLAJAH_ONLY' }) }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: lic({ grant: 'RENTAL', expiresAt: 10 ** 15 }) }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: lic({ expiresAt: 5 }), now: 10 }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: true, license: null }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: false, isPaid: false }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: false, bookLicense: 'ARR' }).allowed, false);
  assert.equal(decideExportRights({ isOwner: false, signedIn: true, isPaid: false, bookLicense: 'CC-BY' }).scope, 'open-license');
});

test('buy-to-own: a sold copy pins to the newest version at purchase time and never moves; owners and free readers follow latest', () => {
  const vs = [{ versionId: 'v1', createdAt: 100 }, { versionId: 'v2', createdAt: 200 }, { versionId: 'v3', createdAt: 300 }];
  assert.equal(pinnedVersionFor(vs, 250)!.versionId, 'v2');
  assert.equal(pinnedVersionFor(vs, 200)!.versionId, 'v2');
  assert.equal(pinnedVersionFor(vs, 50), null);
  const base = { versions: vs, isOwner: false, isPaid: true, telaEnabled: true };
  assert.deepEqual(chooseReaderMode({ ...base, license: { issuedAt: 250 } }), { mode: 'tela', pin: 'pinned', version: vs[1] });
  assert.deepEqual(chooseReaderMode({ ...base, license: { issuedAt: 250 } }), chooseReaderMode({ ...base, versions: [...vs, { versionId: 'v4', createdAt: 999 }], license: { issuedAt: 250 } }), 'later versions never reach the buyer');
  assert.equal(chooseReaderMode({ ...base, license: { issuedAt: 50 } }).mode, 'classic');
  assert.equal(chooseReaderMode({ ...base, license: null }).mode, 'classic');
  assert.deepEqual(chooseReaderMode({ ...base, isOwner: true }), { mode: 'tela', pin: 'follow-latest', version: vs[2] });
  assert.deepEqual(chooseReaderMode({ ...base, isPaid: false }), { mode: 'tela', pin: 'follow-latest', version: vs[2] });
  assert.equal(chooseReaderMode({ ...base, isPaid: false, telaEnabled: false }).mode, 'classic');
  assert.equal(chooseReaderMode({ ...base, isPaid: false, versions: [] }).mode, 'classic');
});

test('reader bundle omits the author-private original snapshot', () => {
  const b = sample();
  const { upgrade, doc } = createUpgrade(b, { now: 1, enhancements: [GOOD.GLOSSARY] });
  const bundle = makeBundle(b, upgrade, doc, 'v_1', 7);
  const json = JSON.stringify(bundle);
  assert.ok(!('originalChapters' in bundle));
  assert.ok(!json.includes('"originalChapters"'));
  assert.equal(bundle.doc.currentVersionId, 'v_1'); assert.equal(bundle.toc.length, 3);
  assert.ok(json.length < 950_000);
});

test('xml checker catches what a string exporter gets wrong', () => {
  assert.deepEqual(xmlWellFormed('<a><b x="1">t</b></a>'), []);
  assert.ok(xmlWellFormed('<a><b></a>').length);
  assert.ok(xmlWellFormed('<a>Fish & chips</a>').length);
  assert.ok(xmlWellFormed('<a>&nbsp;</a>').length);
  assert.ok(xmlWellFormed('<a x=1/>').length);
  assert.ok(xmlWellFormed('<a x="1" x="2"/>').length);
});

test('prepare() derives a doc for plain (non-upgraded) books so export works without an upgrade', () => {
  const { doc, model } = prepare({ book: sample() }, 'EPUB_REFLOW', { now: NOW });
  assert.equal(doc.id, 'book:bk1');
  assert.equal(model.chapters.length, 3);
  assert.equal(model.fidelity.every(p => p.fidelity === 'FULL'), true);
});
