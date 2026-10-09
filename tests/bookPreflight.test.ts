// Preflight quality gate + automated review (services/bookmeta/preflight.ts, review.ts).
// Each test breaks exactly one thing in an otherwise clean submission and checks the finding + score behaviour.
//
//   npx tsx --test tests/bookPreflight.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPreflight, emptyMetadata, emptyPricing, descriptionSpamStats, type PreflightInput } from '../services/bookmeta/preflight';
import { automatedReview } from '../services/bookmeta/review';

const NOW = Date.parse('2026-10-08T00:00:00Z');
const para = (n: number) => Array.from({ length: n }, (_, i) => `The harbour lights flickered as Mara counted the boats, number ${i} of the long grey morning, and wondered who would still be waiting.`).join(' ');
const chapter = (i: number, words = 1200) => ({ id: `c${i}`, title: `Chapter ${i}`, text: `Chapter ${i}\n\n` + Array.from({ length: Math.ceil(words / 24) }, (_, k) => `Paragraph ${k} of chapter ${i}: ${para(1)} Unique tail ${i}-${k}-${Math.random().toString(36).slice(2)}.`).join('\n\n'), wordCount: words, kind: 'chapter' as const, included: true });

function clean(): PreflightInput {
  const metadata = emptyMetadata();
  Object.assign(metadata, {
    title: 'The Harbour Count', subtitle: 'A novel', genre: 'Literary Fiction',
    contributors: [{ name: 'Mara Quill', role: 'author' }],
    description: '<p>When the tide goes out on Gull Island, Mara counts the boats. This year, one is missing, and the whole village has a reason to keep quiet. A slow-burning mystery about memory, debt and the sea.</p>',
    keywords: ['coastal mystery', 'island village', 'literary suspense'], bisac: ['FIC019000', 'FIC022000'],
    copyrightHolder: 'Mara Quill', publicationDate: '2026-11-01',
  });
  return {
    now: NOW, metadata, pricing: { ...emptyPricing(), prices: { USD: 4.99 } },
    cover: { width: 1600, height: 2560, bytes: 900_000, mime: 'image/jpeg' },
    chapters: [chapter(1), chapter(2), chapter(3), chapter(4)],
    accessibilityScore: 80,
  };
}
const codes = (r: ReturnType<typeof runPreflight>, sev: 'blocking' | 'warnings' | 'infos' = 'blocking') => r[sev].map(f => f.code);

test('a clean submission is ready with a high score and no blocking errors', () => {
  const r = runPreflight(clean());
  assert.deepEqual(codes(r), []);
  assert.equal(r.ready, true);
  assert.ok(r.score >= 90, `score ${r.score}`);
  assert.equal(r.stats.chapters, 4);
});

test('empty manuscript, placeholder text and nearly-empty books block', () => {
  const a = clean(); a.chapters = [];
  assert.ok(codes(runPreflight(a)).includes('ms.empty'));
  const b = clean(); b.chapters = [{ ...chapter(1, 200), wordCount: 200 }];
  assert.ok(codes(runPreflight(b)).includes('ms.too_short'));
  for (const ph of ['Lorem ipsum dolor sit amet', '[Insert dedication here]', 'Click here to edit this text', 'TBD']) {
    const c = clean(); c.chapters[1] = { ...c.chapters[1], text: c.chapters[1].text + `\n\n${ph}` };
    assert.ok(codes(runPreflight(c)).includes('ms.placeholder'), ph);
  }
});

test('score is capped below 70 whenever anything blocks, and falls with warnings', () => {
  const a = clean(); a.cover = null;
  const ra = runPreflight(a);
  assert.equal(ra.ready, false);
  assert.ok(ra.score <= 69);
  const b = clean(); b.metadata.keywords = ['amazon bestseller', 'free kindle'];
  const rb = runPreflight(b);
  assert.equal(rb.ready, true);
  assert.ok(rb.score < runPreflight(clean()).score);
  assert.ok(codes(rb, 'warnings').includes('meta.kw_brand'));
});

test('cover rules: missing, too small, low-res, wrong ratio, wrong type, too big', () => {
  const run = (cover: any) => { const i = clean(); i.cover = cover; return runPreflight(i); };
  assert.ok(codes(run(null)).includes('cover.missing'));
  assert.ok(codes(run({ width: 500, height: 800, bytes: 1e5, mime: 'image/jpeg' })).includes('cover.too_small'));
  assert.ok(codes(run({ width: 1200, height: 1920, bytes: 1e5, mime: 'image/jpeg' }), 'warnings').includes('cover.low_res'));
  assert.ok(codes(run({ width: 1600, height: 1600, bytes: 1e5, mime: 'image/png' })).includes('cover.ratio_bad'));
  assert.ok(codes(run({ width: 1600, height: 2560, bytes: 1e5, mime: 'image/gif' })).includes('cover.format'));
  assert.ok(codes(run({ width: 1600, height: 2560, bytes: 60 * 1048576, mime: 'image/jpeg' })).includes('cover.too_big'));
});

test('metadata: title, description, keywords, categories', () => {
  const t = (fn: (i: PreflightInput) => void) => { const i = clean(); fn(i); return runPreflight(i); };
  assert.ok(codes(t(i => { i.metadata.title = ''; })).includes('meta.title_missing'));
  assert.ok(codes(t(i => { i.metadata.title = 'x'.repeat(201); })).includes('meta.title_long'));
  assert.ok(codes(t(i => { i.metadata.title = 'THE HARBOUR COUNT'; }), 'warnings').includes('meta.title_caps'));
  assert.ok(codes(t(i => { i.metadata.subtitle = 'A #1 bestseller'; })).includes('meta.title_promo'));
  assert.ok(codes(t(i => { i.metadata.description = ''; })).includes('meta.desc_missing'));
  assert.ok(codes(t(i => { i.metadata.description = 'a'.repeat(4001); })).includes('meta.desc_long'));
  assert.ok(codes(t(i => { i.metadata.description = '<script>x</script>' + i.metadata.description; })).includes('meta.desc_html'));
  assert.ok(codes(t(i => { i.metadata.keywords = Array.from({ length: 8 }, (_, k) => `kw${k}`); })).includes('meta.kw_count'));
  assert.ok(codes(t(i => { i.metadata.bisac = []; })).includes('meta.bisac_none'));
  assert.ok(codes(t(i => { i.metadata.bisac = ['FIC019000', 'FIC022000', 'FIC027000', 'FIC031000']; })).includes('meta.bisac_many'));
  assert.ok(codes(t(i => { i.metadata.bisac = ['nope']; })).includes('meta.bisac_shape'));
  assert.ok(codes(t(i => { i.metadata.contributors = []; })).includes('meta.author_missing'));
});

test('description spam: keyword stuffing, shouting, URLs', () => {
  const stuffed = Array(30).fill('vampire romance vampire love vampire').join(' ');
  const s = descriptionSpamStats(stuffed);
  assert.equal(s.topWord, 'vampire');
  assert.ok(s.topShare > 0.12);
  const i = clean(); i.metadata.description = `<p>${stuffed}</p>`;
  assert.ok(codes(runPreflight(i), 'warnings').includes('meta.desc_stuffing'));
  const j = clean(); j.metadata.description += '<p>Visit www.mybooks.com for more</p>';
  assert.ok(codes(runPreflight(j), 'warnings').includes('meta.desc_urls'));
  const k = clean(); k.metadata.description = '<p>' + 'THIS BOOK WILL CHANGE YOUR LIFE FOREVER READ IT NOW BEFORE ITS TOO LATE ' .repeat(3) + '</p>';
  assert.ok(codes(runPreflight(k), 'warnings').includes('meta.desc_caps'));
});

test('rights: public-domain suspicion, Gutenberg boilerplate, ISBN, territories, mature vs age', () => {
  const pd = clean(); pd.metadata.title = 'Pride and Prejudice';
  assert.ok(codes(runPreflight(pd)).includes('rights.pd_suspect'));
  pd.metadata.publicDomain = true; pd.metadata.publicDomainNote = 'x';
  const rpd = runPreflight(pd);
  assert.ok(!codes(rpd).includes('rights.pd_suspect'));
  assert.ok(codes(rpd, 'warnings').includes('rights.pd_unedited'));
  pd.metadata.publicDomainNote = 'New introduction, 120 annotations and a glossary written for this edition.';
  assert.ok(!codes(runPreflight(pd), 'warnings').includes('rights.pd_unedited'));

  const g = clean(); g.chapters[0] = { ...g.chapters[0], text: g.chapters[0].text + '\n\nThe Project Gutenberg eBook of Something' };
  assert.ok(codes(runPreflight(g)).includes('ms.gutenberg'));

  const isbn = clean(); isbn.metadata.isbn = { mode: 'own', value: '9780306406158' };
  assert.ok(codes(runPreflight(isbn)).includes('rights.isbn_invalid'));
  isbn.metadata.isbn = { mode: 'own', value: '978-0-306-40615-7' };
  assert.ok(!codes(runPreflight(isbn)).includes('rights.isbn_invalid'));

  const terr = clean(); terr.metadata.territories = { worldwide: false, countries: [] };
  assert.ok(codes(runPreflight(terr)).includes('rights.territories'));

  const mature = clean(); mature.metadata.matureContent = true; mature.metadata.audience = { minAge: 14, maxAge: null, adult: false };
  assert.ok(codes(runPreflight(mature)).includes('meta.mature_age'));
});

test('dates: original after publication, bad dates', () => {
  const i = clean(); i.metadata.originalPublicationDate = '2027-01-01';
  assert.ok(codes(runPreflight(i)).includes('meta.origdate'));
  const j = clean(); j.metadata.publicationDate = 'tomorrow-ish';
  assert.ok(codes(runPreflight(j)).includes('meta.pubdate_invalid'));
});

test('pricing: floor, ceiling, zero, pre-order, promo, sample', () => {
  const p = (fn: (i: PreflightInput) => void) => { const i = clean(); fn(i); return runPreflight(i); };
  assert.ok(codes(p(i => { i.pricing.prices = { USD: 0.5 }; })).includes('price.floor'));
  assert.ok(codes(p(i => { i.pricing.prices = { USD: 250 }; })).includes('price.ceiling'));
  assert.ok(codes(p(i => { i.pricing.prices = {}; })).includes('price.none'));
  assert.ok(codes(p(i => { i.pricing.prices = { USD: 0 }; })).includes('price.zero'));
  assert.ok(!codes(p(i => { i.pricing.model = 'FREE'; i.pricing.prices = {}; })).includes('price.none'));
  assert.ok(codes(p(i => { i.pricing.preorder = { enabled: true, date: '' }; })).includes('price.preorder_date'));
  assert.ok(codes(p(i => { i.pricing.preorder = { enabled: true, date: '2026-01-01' }; })).includes('price.preorder_past'));
  assert.ok(codes(p(i => { i.pricing.preorder = { enabled: true, date: '2028-06-01' }; })).includes('price.preorder_far'));
  assert.ok(!codes(p(i => { i.pricing.preorder = { enabled: true, date: '2026-12-01' }; })).some(c => c.startsWith('price.preorder')));
  assert.ok(codes(p(i => { i.pricing.promo = { enabled: true, code: 'x', pct: 20, endsAt: '' }; })).includes('price.promo_code'));
  assert.ok(codes(p(i => { i.pricing.promo = { enabled: true, code: 'LAUNCH20', pct: 95, endsAt: '' }; })).includes('price.promo_pct'));
  assert.ok(codes(p(i => { i.pricing.freeSamplePct = 80; }), 'warnings').includes('price.sample_big'));
});

test('duplicate-heavy manuscripts are blocked', () => {
  const i = clean();
  const block = 'This exact paragraph is long enough to count toward the duplicate detector and it repeats verbatim many times over.';
  i.chapters = [{ id: 'd', title: 'Dup', text: Array(40).fill(block).join('\n\n'), wordCount: 800, kind: 'chapter', included: true }];
  assert.ok(codes(runPreflight(i)).includes('ms.duplicate_heavy'));
});

test('epub findings and low accessibility flow through', () => {
  const i = clean();
  i.epubFindings = [{ code: 'epub.nav_missing', severity: 'error', area: 'epub', message: 'EPUB 3 requires a navigation document.', fix: 'Add nav.xhtml' }];
  i.accessibilityScore = 30;
  const r = runPreflight(i);
  assert.ok(codes(r).includes('epub.nav_missing'));
  assert.ok(codes(r, 'warnings').includes('a11y.score_low'));
  assert.equal(r.ready, false);
});

test('every finding carries a fix-it suggestion', () => {
  const i = clean(); i.cover = null; i.metadata.title = ''; i.metadata.description = ''; i.metadata.bisac = []; i.chapters = [];
  const r = runPreflight(i);
  assert.ok(r.blocking.length >= 5);
  for (const f of r.blocking) assert.ok(f.fix && f.fix.length > 5, `${f.code} lacks a fix`);
});

// ── automated review ──

const acks = { contentPolicy: true, rights: true };
test('review: clean + acknowledged -> LIVE; missing acks or blocking errors -> REJECTED with reasons', () => {
  assert.equal(automatedReview({ ...clean(), acks }).status, 'LIVE');
  const noAck = automatedReview({ ...clean(), acks: { contentPolicy: true, rights: false } });
  assert.equal(noAck.status, 'REJECTED');
  assert.ok(noAck.reasons.some(r => r.code === 'ack.rights'));
  const bad = clean(); bad.cover = null;
  const rej = automatedReview({ ...bad, acks });
  assert.equal(rej.status, 'REJECTED');
  assert.ok(rej.reasons.some(r => r.code === 'cover.missing'));
});

test('review: public domain, AI-generated text, mature content go to IN_REVIEW, not REJECTED', () => {
  const a = clean(); a.metadata.publicDomain = true; a.metadata.publicDomainNote = 'New foreword, notes and glossary written for this edition.';
  assert.equal(automatedReview({ ...a, acks }).status, 'IN_REVIEW');
  const b = clean(); b.metadata.ai.text = 'generated';
  assert.equal(automatedReview({ ...b, acks }).status, 'IN_REVIEW');
  const c = clean(); c.metadata.matureContent = true; c.metadata.audience = { minAge: 18, maxAge: null, adult: true };
  assert.equal(automatedReview({ ...c, acks }).status, 'IN_REVIEW');
});
