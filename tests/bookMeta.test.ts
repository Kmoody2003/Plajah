// Pricing / royalty, manuscript splitting, BISAC search, cover maths, copyright page, accessibility score and the
// ONIX + CSV export (services/bookmeta/*).
//
//   npx tsx --test tests/bookMeta.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { royaltyBreakdown, suggestPrice, sampleSplit, bundlePrice, PLATFORM_CUT_PCT } from '../services/bookmeta/pricing';
import { splitIntoChapters, detectTitleAuthor, looksLikeChapterHeading, mergeChapters, splitChapter, type ParaIn } from '../services/bookmeta/manuscript';
import { searchBisac, isBisacShape, BISAC_SUBSET, bisacByCode } from '../services/bookmeta/bisac';
import { evaluateCover, cropRectForRatio } from '../services/bookmeta/cover';
import { copyrightLines } from '../services/bookmeta/copyright';
import { scoreAccessibility } from '../services/bookmeta/accessibility';
import { toOnix, toDistributionCsv, DISTRIBUTION_COLUMNS, lang3, type ExportBook } from '../services/bookmeta/export';
import { emptyMetadata, emptyPricing } from '../services/bookmeta/preflight';

const P = (text: string, heading = 0): ParaIn => ({ text, html: heading ? `<h${heading}>${text}</h${heading}>` : `<p>${text}</p>`, heading });
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

// ── pricing ──

test('platform cut is 5% and royalty maths adds up', () => {
  assert.equal(PLATFORM_CUT_PCT, 5);
  const r = royaltyBreakdown(10, 'USD');
  assert.equal(r.platformCut, 0.5);
  assert.equal(r.processingFee, 0.59);                // 2.9% of 10 + $0.30 (estimate)
  assert.equal(r.authorTakeHome, 8.91);
  assert.equal(Math.round((r.listPrice - r.platformCut - r.processingFee) * 100) / 100, r.authorTakeHome);
  assert.equal(r.per100Sales, 891);
  assert.equal(r.processingIsApprox, false);
  assert.equal(royaltyBreakdown(10, 'EUR').processingIsApprox, true);
});

test('royalty with discount and free books never goes negative', () => {
  assert.equal(royaltyBreakdown(0, 'USD').authorTakeHome, 0);
  assert.ok(royaltyBreakdown(0.99, 'USD').authorTakeHome >= 0);
  assert.equal(royaltyBreakdown(10, 'USD', 20).listPrice, 8);
});

test('suggested price rises with length and non-fiction', () => {
  assert.ok(suggestPrice(90000).suggested > suggestPrice(20000).suggested);
  assert.ok(suggestPrice(60000, 'Self-Help').suggested > suggestPrice(60000, 'Fantasy').suggested);
  const s = suggestPrice(60000, 'Fantasy');
  assert.ok(s.low <= s.suggested && s.suggested <= s.high);
});

test('free sample: first N chapters, then percentage; never the whole book', () => {
  const chs = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, wordCount: 1000 }));
  const a = sampleSplit(chs, 0, 2);
  assert.deepEqual(a.freeIds, ['c0', 'c1']);
  const b = sampleSplit(chs, 25, 1);
  assert.equal(b.freeIds.length, 3);
  assert.equal(sampleSplit(chs, 100, 0).paidIds.length > 0, true);
  assert.deepEqual(bundlePrice([4.99, 4.99, 4.99], 20), { sum: 14.97, bundle: 11.98, saves: 2.99 });
});

// ── manuscript ──

test('chapters split on real headings; text before the first heading becomes front matter', () => {
  const paras = [P('My Book', 1), P('by Ada'), P('Chapter 1', 2), P(words(50)), P('Chapter 2', 2), P(words(60))];
  const chs = splitIntoChapters(paras);
  assert.deepEqual(chs.map(c => c.title), ['Front matter', 'Chapter 1', 'Chapter 2']);
  assert.equal(chs[0].kind, 'front');
});

test('"Chapter N" lines split when there are no heading styles; titles and counts are right', () => {
  const paras = [P('Chapter One: The Start'), P(words(40)), P('Chapter Two: The Middle'), P(words(30)), P('Epilogue'), P(words(20))];
  const chs = splitIntoChapters(paras);
  assert.equal(chs.length, 3);
  assert.equal(chs[0].title, 'Chapter One: The Start');
  assert.equal(chs[0].wordCount, 40);
  assert.equal(chs.reduce((s, c) => s + c.wordCount, 0), 90);
  assert.ok(looksLikeChapterHeading('Prologue') && looksLikeChapterHeading('XII') && looksLikeChapterHeading('7'));
  assert.ok(!looksLikeChapterHeading('She walked to the shore and chapter one began again in her head'));
});

test('no structure + long text auto-splits at scene breaks and flags autoSplit; short text stays one chapter', () => {
  const body: ParaIn[] = [];
  for (let s = 0; s < 6; s++) { for (let k = 0; k < 4; k++) body.push(P(words(450))); body.push(P('* * *')); }
  const chs = splitIntoChapters(body);
  assert.ok(chs.length >= 3);
  assert.ok(chs.every(c => c.autoSplit));
  assert.equal(splitIntoChapters([P(words(300))]).length, 1);
  assert.deepEqual(splitIntoChapters([]), []);
});

test('title and author detection from the opening lines, docProps and the file name', () => {
  assert.deepEqual(detectTitleAuthor([P('The Harbour Count'), P('by Mara Quill'), P(words(10))], 'draft.docx'), { title: 'The Harbour Count', author: 'Mara Quill', confident: true });
  assert.equal(detectTitleAuthor([], 'Gull Island - Mara Quill.epub').author, 'Mara Quill');
  assert.equal(detectTitleAuthor([P(words(10))], 'x.docx', { title: 'From Props', author: 'P. Author' }).title, 'From Props');
  assert.equal(detectTitleAuthor([P(words(5))], 'Document1.docx').title, '');
});

test('merge and split chapter keep the word count', () => {
  const chs = splitIntoChapters([P('Chapter 1'), P(words(10)), P(words(10)), P('Chapter 2'), P(words(5))]);
  const total = chs.reduce((s, c) => s + c.wordCount, 0);
  const merged = mergeChapters(chs, 0);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].wordCount, total);
  const split = splitChapter(chs, 0);
  assert.equal(split.length, 3);
  assert.equal(split.reduce((s, c) => s + c.wordCount, 0), total);
});

// ── BISAC ──

test('BISAC subset: shape, lookup, search ranking', () => {
  assert.ok(BISAC_SUBSET.length >= 110);
  assert.equal(new Set(BISAC_SUBSET.map(b => b.code)).size, BISAC_SUBSET.length, 'duplicate code');
  for (const b of BISAC_SUBSET) assert.ok(isBisacShape(b.code), b.code);
  assert.equal(bisacByCode('fic009000')?.label, 'Fiction / Fantasy / General');
  assert.ok(searchBisac('fantasy').length >= 3 && searchBisac('fantasy').every(b => /fantasy/i.test(b.label)));
  assert.ok(searchBisac('romance contemporary').some(b => b.code === 'FIC027020'));
  assert.ok(searchBisac('FIC031').some(b => b.code === 'FIC031080'));
  assert.deepEqual(searchBisac('zzzzqq'), []);
  assert.equal(isBisacShape('FIC9'), false);
});

// ── cover ──

test('cover evaluation grades quality; crop snaps to 1.6', () => {
  assert.equal(evaluateCover({ width: 1600, height: 2560, bytes: 1e6, mime: 'image/jpeg' }).quality, 'great');
  assert.equal(evaluateCover({ width: 400, height: 600, bytes: 1e6, mime: 'image/jpeg' }).quality, 'unusable');
  assert.equal(evaluateCover({ width: 1200, height: 1920, bytes: 1e6, mime: 'image/png' }).quality, 'poor');
  const sq = cropRectForRatio(2000, 2000);            // square -> trim the sides
  assert.deepEqual(sq, { x: 375, y: 0, width: 1250, height: 2000 });
  const tall = cropRectForRatio(1000, 2000);          // too tall -> trim top/bottom
  assert.deepEqual(tall, { x: 0, y: 200, width: 1000, height: 1600 });
  assert.deepEqual(cropRectForRatio(1000, 1600), { x: 0, y: 0, width: 1000, height: 1600 });
});

// ── copyright + a11y ──

test('copyright page reflects licence, AI disclosure, contributors, ISBN', () => {
  const m = emptyMetadata();
  Object.assign(m, { title: 'T', copyrightHolder: 'Ada', copyrightYear: '2026', license: 'CC-BY', genre: 'Fantasy', contributors: [{ name: 'Ada', role: 'author' }, { name: 'Bo Ed', role: 'editor' }] });
  m.ai.images = 'generated';
  m.isbn = { mode: 'own', value: '9780306406157' };
  const text = copyrightLines(m, '9780306406157').join('\n');
  assert.match(text, /Copyright © 2026 Ada/);
  assert.match(text, /CC BY 4\.0/);
  assert.match(text, /Editor: Bo Ed/);
  assert.match(text, /images generated with AI/);
  assert.match(text, /ISBN 9780306406157/);
  assert.match(text, /work of fiction/);
  m.genre = 'Non-Fiction';
  assert.doesNotMatch(copyrightLines(m).join('\n'), /work of fiction/);
});

test('accessibility score rewards structure and alt text', () => {
  const base = { language: 'en', chapterCount: 10, headingChapters: 10, hasNav: true, imageCount: 0, imagesWithAlt: 0, declaredAltText: false, features: [] as string[], hasHazardDeclaration: false };
  assert.equal(scoreAccessibility(base).score, 85);
  assert.equal(scoreAccessibility({ ...base, features: ['tableOfContents'], hasHazardDeclaration: true }).score, 100);
  const noAlt = scoreAccessibility({ ...base, imageCount: 4, imagesWithAlt: 1 });
  assert.equal(noAlt.score, 60);
  assert.ok(noAlt.findings.some(f => f.code === 'a11y.alt_text'));
  assert.equal(scoreAccessibility({ ...base, imageCount: 4, imagesWithAlt: 1, declaredAltText: true }).score, 85);
  assert.ok(scoreAccessibility({ ...base, language: '', hasNav: false, headingChapters: 0 }).score < 50);
});

// ── export ──

function book(): ExportBook {
  const metadata = emptyMetadata();
  Object.assign(metadata, {
    title: 'The Harbour Count', subtitle: 'A "novel", really', language: 'en', seriesName: 'Gull Island', seriesNumber: '1',
    contributors: [{ name: 'Mara Quill', role: 'author' }, { name: 'Tess Redd', role: 'editor' }],
    description: '<p>Boats & tides, <em>and</em> secrets.</p>', keywords: ['coastal mystery', 'island'], bisac: ['FIC019000', 'FIC022000'],
    copyrightHolder: 'Mara Quill', publicationDate: '2026-11-01', originalPublicationDate: '2026-01-15',
    isbn: { mode: 'own', value: '978-0-306-40615-7' }, audience: { minAge: 16, maxAge: null, adult: false },
  });
  const pricing = { ...emptyPricing(), prices: { USD: 4.99, GBP: 3.99, NGN: 3500 } };
  return { id: 'book_1', metadata, pricing, cover: { width: 1600, height: 2560, bytes: 1, mime: 'image/jpeg', url: 'https://x.test/c.jpg' }, wordCount: 82000, chapterCount: 24 };
}

test('ONIX: well-formed shape with the expected codes and escaped text', () => {
  const x = toOnix(book(), { sentAt: new Date('2026-10-08T12:00:00Z') });
  assert.match(x, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(x, /<ONIXMessage release="3\.0" xmlns="http:\/\/ns\.editeur\.org\/onix\/3\.0\/reference">/);
  assert.match(x, /<ProductIDType>15<\/ProductIDType><IDValue>9780306406157<\/IDValue>/);
  assert.match(x, /<ProductForm>ED<\/ProductForm>\s*<ProductFormDetail>E101<\/ProductFormDetail>/);
  assert.match(x, /<EpubTechnicalProtection>00<\/EpubTechnicalProtection>/);       // DRM-free
  assert.match(x, /<TitleText>The Harbour Count<\/TitleText><Subtitle>A &quot;novel&quot;, really<\/Subtitle>/);
  assert.match(x, /<ContributorRole>A01<\/ContributorRole><PersonName>Mara Quill<\/PersonName><PersonNameInverted>Quill, Mara<\/PersonNameInverted>/);
  assert.match(x, /<ContributorRole>B01<\/ContributorRole>/);
  assert.match(x, /<LanguageCode>eng<\/LanguageCode>/);
  assert.match(x, /<ExtentType>02<\/ExtentType><ExtentValue>82000<\/ExtentValue>/);
  assert.match(x, /<SubjectSchemeIdentifier>10<\/SubjectSchemeIdentifier>.*<SubjectCode>FIC019000<\/SubjectCode>/);
  assert.match(x, /<CollectionType>10<\/CollectionType>/);
  assert.match(x, /<PriceAmount>4\.99<\/PriceAmount><CurrencyCode>USD<\/CurrencyCode>/);
  assert.match(x, /<RegionsIncluded>WORLD<\/RegionsIncluded>/);
  assert.match(x, /<PublishingStatus>04<\/PublishingStatus>|<PublishingStatus>02<\/PublishingStatus>/);
  assert.match(x, /Boats &amp; tides, and secrets\./);   // description emitted as plain text (textformat 06)
  // Well-formedness: a real open/close stack over every tag.
  const stack: string[] = [];
  for (const m of x.matchAll(/<(\/?)([A-Za-z][\w]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;                         // self-closing
    if (m[1] === '') stack.push(m[2]);
    else assert.equal(stack.pop(), m[2], `mismatched </${m[2]}>`);
  }
  assert.equal(stack.length, 0);
  assert.equal(lang3('pt-BR'), 'por');
  assert.equal(lang3('xx'), 'und');
});

test('ONIX: forthcoming title is status 02; country list replaces WORLD', () => {
  const b = book(); b.metadata.publicationDate = '2030-01-01'; b.metadata.territories = { worldwide: false, countries: ['US', 'CA'] };
  const x = toOnix(b, { sentAt: new Date('2026-10-08T00:00:00Z') });
  assert.match(x, /<PublishingStatus>02<\/PublishingStatus>/);
  assert.match(x, /<CountriesIncluded>US CA<\/CountriesIncluded>/);
});

test('distribution CSV: header, quoting, one row per book, DRM and price columns', () => {
  const csv = toDistributionCsv([book()]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split(',').length, DISTRIBUTION_COLUMNS.length);
  assert.ok(lines[0].startsWith('Title,Subtitle'));
  assert.match(csv, /"A ""novel"", really"/);                 // quote escaping
  assert.match(csv, /9780306406157/);                         // ISBN-10/13 hyphenless
  assert.match(csv, /No DRM/);
  assert.match(csv, /NGN 3500\.00/);
  assert.match(csv, /Tess Redd/);
});

// ── drafts + album mapping ──

import { newDraft, splitForCloud, mergeBodies } from '../services/bookmeta/drafts';
import { toAlbumPartial } from '../services/bookmeta/albumMap';
import { sanitizeHtmlLite } from '../services/bookmeta/util';

test('draft split keeps chapter bodies out of the Firestore doc and merges them back losslessly', () => {
  const d = newDraft('u1', 'NOVEL');
  d.manuscript = { fileName: 'a.docx', ext: 'docx', sizeBytes: 10, source: 'docx', chapters: [
    { id: 'c1', title: 'One', html: '<p>' + 'x'.repeat(5000) + '</p>', text: 'x'.repeat(5000), wordCount: 1, kind: 'chapter', included: true },
  ] };
  d.cover = { width: 1, height: 1, bytes: 1, mime: 'image/png', url: undefined } as any;   // undefined must not reach Firestore
  const { meta, bodies } = splitForCloud(d);
  assert.ok(JSON.stringify(meta).length < 3000, 'metadata doc must be small');
  assert.equal((meta.manuscript as any).chapters[0].html, undefined);
  assert.equal('url' in (meta.cover as any), false);
  const back = mergeBodies(JSON.parse(JSON.stringify(meta)), bodies);
  assert.equal(back.manuscript!.chapters[0].html, d.manuscript.chapters[0].html);
  assert.equal(back.manuscript!.chapters[0].text.length, 5000);
  assert.notEqual(newDraft('u1', 'NOVEL').id, newDraft('u1', 'NOVEL').id);
});

test('toAlbumPartial: free sample becomes bookPreviewConfig, DRM-free delivery and generated pages carry over, no undefined', () => {
  const d = newDraft('u1', 'NOVEL');
  d.metadata.title = 'T'; d.metadata.genre = 'Fantasy'; d.metadata.keywords = ['dragons'];
  d.metadata.contributors = [{ name: 'Ada', role: 'author' }]; d.metadata.description = '<p>Hello <b>there</b></p>';
  d.pricing.prices = { USD: 6.99 }; d.pricing.freeFirstChapters = 2; d.pricing.freeSamplePct = 0; d.pricing.delivery = 'DOWNLOAD_OPEN'; d.pricing.watermark = true;
  d.manuscript = { fileName: 'a.epub', ext: 'epub', sizeBytes: 1, source: 'epub', chapters: [1, 2, 3, 4].map(i => ({ id: `c${i}`, title: `C${i}`, html: `<p>${i}</p>`, text: String(i), wordCount: 1000, kind: 'chapter' as const, included: true })) };
  const a = toAlbumPartial(d, 'sub1') as any;
  assert.equal(a.type, 'BOOK');
  assert.equal(a.artist, 'Ada');
  assert.equal(a.description, 'Hello there');
  assert.equal(a.price, 6.99); assert.equal(a.isPaywalled, true);
  assert.deepEqual(a.bookPreviewConfig.allowedChapterIds.filter((x: string) => x.startsWith('c')), ['c1', 'c2']);
  assert.ok(a.bookChapters.some((c: any) => c.id === 'gen_copyright'));
  assert.equal(a.bookDistribution.delivery, 'DOWNLOAD_OPEN');
  assert.equal(a.bookDistribution.watermark, true);
  assert.equal(a.bookDistribution.submissionId, 'sub1');
  assert.ok(!JSON.stringify(a, (_k, v) => v === undefined ? '__undef__' : v).includes('__undef__'));
  d.pricing.model = 'FREE';
  assert.equal((toAlbumPartial(d) as any).isPaywalled, false);
});

test('sanitizeHtmlLite strips scripts, handlers and unknown tags but keeps formatting', () => {
  assert.equal(sanitizeHtmlLite('<p onclick="x()">Hi <b>you</b><script>alert(1)</script><img src=x onerror=y></p>'), '<p>Hi <b>you</b></p>');
  assert.equal(sanitizeHtmlLite('<iframe src="//e"></iframe><a href="javascript:1">l</a><em>ok</em>'), 'l<em>ok</em>');
});
