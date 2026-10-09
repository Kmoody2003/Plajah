// PREFLIGHT QUALITY GATE — pure, deterministic, unit-tested (tests/bookPreflight.test.ts).
//
// Mirrors the reasons independent ebooks actually get rejected or suppressed by KDP / Apple Books / Kobo /
// Draft2Digital / Smashwords / IngramSpark intake. It is a pre-check, not a promise of acceptance: every store keeps
// its own reviewers. Output is split into blocking errors (cannot submit), warnings (should fix) and infos, each
// with a concrete fix-it, plus a 0-100 "ready to publish" score. The SAME function runs in the browser (live
// checklist) and on the server (authoritative, routes/bookSubmissions.ts) so the two can never disagree.

import type { BookMetadata, BookPricing, CoverInfo, Finding, ManuscriptChapter } from './types';
import { MAX_BISAC, MAX_DESCRIPTION, MAX_KEYWORDS } from './types';
import { evaluateCover } from './cover';
import { checkIsbn } from './isbn';
import { isBisacShape } from './bisac';
import { PRICE_CEILING, PRICE_FLOOR } from './pricing';
import { stripTags } from './util';

export type PreflightChapter = Pick<ManuscriptChapter, 'id' | 'title' | 'text' | 'wordCount' | 'kind' | 'included'>;

export interface PreflightInput {
  metadata: BookMetadata;
  cover: CoverInfo | null;
  pricing: BookPricing;
  chapters: PreflightChapter[];
  /** Findings produced by services/bookmeta/epub.ts when the source was an EPUB. */
  epubFindings?: Finding[];
  accessibilityScore?: number | null;
  /** Injected for deterministic tests. */
  now?: number;
}

export interface PreflightResult {
  score: number;
  ready: boolean;
  blocking: Finding[];
  warnings: Finding[];
  infos: Finding[];
  all: Finding[];
  stats: { words: number; chapters: number };
}

const PLACEHOLDERS: { re: RegExp; label: string }[] = [
  { re: /lorem ipsum|dolor sit amet/i, label: '"Lorem ipsum"' },
  { re: /\[\s*insert\b/i, label: '"[Insert …]"' },
  { re: /\[\s*(your|author|book|chapter)\s+(name|title|text)[^\]]*\]/i, label: 'a bracketed template field' },
  { re: /\b(click here to (edit|add)|type (your|text) here|your name here|add (your )?text here)\b/i, label: 'template placeholder text' },
  { re: /\bTK\b|\bTBD\b|\bXXX+\b|\bFIXME\b/, label: 'a TBD / TK / XXX marker' },
];

/** A small list of very-widely-reproduced public-domain titles; stores reject unedited copies of these. */
const COMMON_PD_TITLES = [
  'pride and prejudice', 'moby dick', 'frankenstein', 'dracula', 'alice\'s adventures in wonderland', 'the great gatsby',
  'war and peace', 'crime and punishment', 'jane eyre', 'wuthering heights', 'the odyssey', 'the iliad', 'the art of war',
  'the prince', 'great expectations', 'a tale of two cities', 'the adventures of sherlock holmes', 'treasure island',
  'the picture of dorian gray', 'the time machine', 'the scarlet letter', 'little women', 'emma', 'metamorphosis',
  'heart of darkness', 'the call of the wild', 'anne of green gables', 'the wonderful wizard of oz', 'peter pan',
];

const PROMO_TITLE_RE = /\b(best[- ]?sell(er|ing)|#\s?1|number one|free\b|on sale|discount|kindle unlimited|limited time|award[- ]winning|new release)\b/i;
const BRAND_KEYWORDS = /\b(amazon|kindle|apple|kobo|nook|barnes|ibooks|google play|plajah|bestseller|best seller|free|new york times|nyt)\b/i;
const STOP = new Set('the a an and or of to in on for with is are was were be been it its this that these those as at by from but not you your i we they he she his her our their my me us them so if then than too very can will just about into over after before more most some any each other such'.split(' '));

const f = (code: string, severity: Finding['severity'], area: Finding['area'], message: string, fix?: string, mirrors?: string): Finding =>
  ({ code, severity, area, message, fix, mirrors });

function ngramDuplicateRatio(paragraphs: string[]): number {
  const seen = new Map<string, number>();
  let counted = 0, dup = 0;
  for (const p of paragraphs) {
    const k = p.toLowerCase().replace(/\s+/g, ' ').trim();
    if (k.length < 60) continue; // ignore short lines ("* * *", "Yes.")
    counted++;
    const n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n > 1) dup++;
  }
  return counted ? dup / counted : 0;
}

export function descriptionSpamStats(desc: string): { topWord?: string; topShare: number; capsRatio: number; urls: number; excl: number } {
  const text = stripTags(desc);
  const words = (text.toLowerCase().match(/[a-zÀ-ɏ']{3,}/g) || []).filter(w => !STOP.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let top: [string, number] | undefined;
  for (const e of freq) if (!top || e[1] > top[1]) top = e;
  const letters = text.replace(/[^A-Za-z]/g, '');
  const caps = text.replace(/[^A-Z]/g, '').length;
  return {
    topWord: top?.[0], topShare: words.length >= 20 && top ? top[1] / words.length : 0,
    capsRatio: letters.length >= 40 ? caps / letters.length : 0,
    urls: (text.match(/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io)\b/gi) || []).length,
    excl: (text.match(/!/g) || []).length,
  };
}

export function runPreflight(inp: PreflightInput): PreflightResult {
  const m = inp.metadata, p = inp.pricing;
  const now = inp.now ?? Date.now();
  const out: Finding[] = [];
  const add = (x: Finding) => out.push(x);

  const story = inp.chapters.filter(c => c.included && (c.kind ?? 'chapter') === 'chapter');
  const included = inp.chapters.filter(c => c.included);
  const words = included.reduce((s, c) => s + c.wordCount, 0);
  const storyWords = story.reduce((s, c) => s + c.wordCount, 0);

  // ── Manuscript ──
  if (!story.length) add(f('ms.empty', 'error', 'manuscript', 'There is no manuscript text to publish.', 'Drop in an .epub, .docx, .pdf, .md or .txt on the first step.'));
  else if (storyWords < 500) add(f('ms.too_short', 'error', 'manuscript', `The book has only ${storyWords} words.`, 'Add the full text, or publish it as a Zine / short.', 'KDP low-content'));
  else if (storyWords < 2500) add(f('ms.short', 'warning', 'manuscript', `Only ${storyWords.toLocaleString()} words — very short for a priced ebook.`, 'Consider the Zine format or a lower price.'));

  const emptyCh = story.filter(c => c.wordCount < 15);
  if (emptyCh.length) add(f('ms.empty_chapters', 'warning', 'manuscript', `${emptyCh.length} chapter(s) are empty or nearly empty (e.g. "${emptyCh[0].title}").`, 'Delete them or add their text.', 'Apple/Kobo blank pages'));
  const huge = story.filter(c => c.wordCount > 30000);
  if (huge.length) add(f('ms.huge_chapter', 'warning', 'manuscript', `"${huge[0].title}" is ${huge[0].wordCount.toLocaleString()} words — probably a missed chapter break.`, 'Split it in the chapter review.'));

  const allText = included.map(c => c.text).join('\n\n');
  for (const ph of PLACEHOLDERS) if (ph.re.test(allText)) { add(f('ms.placeholder', 'error', 'manuscript', `Placeholder text found: ${ph.label}.`, 'Search your manuscript for it and replace it with real content.', 'KDP/Apple content quality')); break; }

  const head = included.slice(0, 3).map(c => `${c.title}\n${c.text.slice(0, 1500)}`).join('\n').toLowerCase();
  const hasTitlePage = !!m.title && head.includes(m.title.trim().toLowerCase().slice(0, 40));
  if (m.title && !hasTitlePage && included.length) add(f('ms.no_title_page', 'info', 'manuscript', 'No title page found in the opening pages.', 'Plajah adds a title page in the reader automatically; leave as-is or add your own.', 'Apple Books'));
  const hasCopyright = /(©|copyright|all rights reserved)/i.test(included.slice(0, 3).map(c => c.text).join('\n') + '\n' + included.slice(-2).map(c => c.text).join('\n'));
  if (!hasCopyright && !m.includeGeneratedCopyrightPage) add(f('ms.no_copyright', 'warning', 'manuscript', 'No copyright page found.', 'Tick "Add a generated copyright page" on the Rights step, or add one to the manuscript.', 'IngramSpark / Apple'));
  if (story.length > 5 && !inp.chapters.some(c => c.kind === 'toc') && !(inp.epubFindings || []).length)
    add(f('ms.toc', 'info', 'manuscript', `${story.length} chapters and no contents page in the file.`, 'Plajah builds a navigable contents list from your chapters, so no action needed.'));

  const paras = allText.split(/\n{2,}/);
  const dupRatio = ngramDuplicateRatio(paras);
  if (dupRatio > 0.4) add(f('ms.duplicate_heavy', 'error', 'manuscript', `${Math.round(dupRatio * 100)}% of paragraphs are exact repeats — this reads as padded or duplicated content.`, 'Remove repeated sections.', 'KDP duplicate/low-quality content'));
  else if (dupRatio > 0.12) add(f('ms.duplicate_some', 'warning', 'manuscript', `${Math.round(dupRatio * 100)}% of paragraphs repeat verbatim.`, 'Check for accidentally pasted sections.'));

  if (/project gutenberg/i.test(allText)) add(f('ms.gutenberg', 'error', 'rights', 'The text contains Project Gutenberg licence/trademark boilerplate.', 'Remove the Gutenberg header/footer. Public-domain works can be sold, but the PG trademark text cannot be.', 'Project Gutenberg licence; all stores'));
  const titleKey = m.title.trim().toLowerCase().replace(/^the\s+/, 'the ');
  const knownPd = COMMON_PD_TITLES.some(t => titleKey === t || titleKey === t.replace(/^the /, ''));
  if (knownPd && !m.publicDomain) add(f('rights.pd_suspect', 'error', 'rights', 'This title matches a well-known public-domain work, but you have not declared it as public domain.', 'Tick "This is a public-domain work" and describe what you added (annotations, new translation, introduction); otherwise confirm you hold the rights.', 'KDP/Apple/Kobo public-domain policy'));
  if (m.publicDomain) {
    if (m.publicDomainNote.trim().length < 20) add(f('rights.pd_unedited', 'warning', 'rights', 'Public-domain books need something of your own added or the store will treat them as duplicates of the free versions.', 'Describe your added value (new introduction, annotations, translation, illustrations, editing).', 'KDP "differentiated content"'));
    add(f('rights.pd_review', 'info', 'rights', 'Public-domain titles get a closer look in review.', 'Keep your added-value note specific.'));
  }

  // ── Metadata ──
  const title = m.title.trim();
  if (!title) add(f('meta.title_missing', 'error', 'metadata', 'The title is missing.', 'Enter the title exactly as it appears on the cover.'));
  else {
    if (title.length > 200) add(f('meta.title_long', 'error', 'metadata', `The title is ${title.length} characters; stores cap it at about 200.`, 'Move the extra words to the subtitle.', 'KDP'));
    if (title === title.toUpperCase() && /[A-Z]{6,}/.test(title)) add(f('meta.title_caps', 'warning', 'metadata', 'The title is ALL CAPS.', 'Use title case; stores correct or reject all-caps titles.', 'KDP / Apple'));
    if (PROMO_TITLE_RE.test(`${title} ${m.subtitle}`)) add(f('meta.title_promo', 'error', 'metadata', 'The title/subtitle contains promotional words (e.g. "bestseller", "free", "#1", "limited time").', 'Remove them — retailers reject promotional text in titles.', 'KDP / Apple / Kobo'));
    if (/[<>{}]/.test(title)) add(f('meta.title_chars', 'warning', 'metadata', 'The title contains unusual symbols.', 'Stick to letters, numbers and normal punctuation.'));
  }
  const authors = m.contributors.filter(c => c.role === 'author' && c.name.trim());
  if (!authors.length && !m.penName.trim()) add(f('meta.author_missing', 'error', 'metadata', 'No author is set.', 'Add yourself as Author (or set a pen name).'));
  if (!m.language) add(f('meta.language', 'error', 'metadata', 'No language selected.', 'Choose the language the book is written in.', 'Apple / Kobo / ONIX'));
  if (!m.genre && !m.bisac.length) add(f('meta.genre', 'warning', 'metadata', 'No genre selected.', 'Choose a genre.'));

  const dText = stripTags(m.description);
  if (!dText) add(f('meta.desc_missing', 'error', 'metadata', 'The book description is empty.', 'Write 100–300 words that sell the book.', 'All stores'));
  else {
    if (m.description.length > MAX_DESCRIPTION) add(f('meta.desc_long', 'error', 'metadata', `The description is ${m.description.length} characters; the limit is ${MAX_DESCRIPTION}.`, 'Trim it.', 'IngramSpark 4,000'));
    if (dText.length < 60) add(f('meta.desc_short', 'warning', 'metadata', 'The description is very short.', 'Aim for at least a couple of sentences.'));
    if (/<\s*(script|iframe|style|object)\b/i.test(m.description)) add(f('meta.desc_html', 'error', 'metadata', 'The description contains disallowed HTML.', 'Use only paragraphs, bold, italics, lists and line breaks.', 'All stores'));
    const spam = descriptionSpamStats(m.description);
    if (spam.topShare > 0.12) add(f('meta.desc_stuffing', 'warning', 'metadata', `"${spam.topWord}" makes up ${Math.round(spam.topShare * 100)}% of the description — this looks like keyword stuffing.`, 'Write naturally; use the keyword boxes for search terms.', 'KDP metadata guidelines'));
    if (spam.capsRatio > 0.35) add(f('meta.desc_caps', 'warning', 'metadata', 'Much of the description is in capitals.', 'Use normal sentence case.'));
    if (spam.urls > 0) add(f('meta.desc_urls', 'warning', 'metadata', 'The description contains a web address.', 'Stores strip or reject external links in descriptions.', 'KDP / Apple'));
    if (spam.excl > 5) add(f('meta.desc_excl', 'info', 'metadata', 'Lots of exclamation marks.', 'Calmer copy reads as more professional.'));
    if (/\b(best[- ]?sell(er|ing)|#1|award[- ]winning)\b/i.test(dText) && !/\b(won|winner of|awarded)\b/i.test(dText))
      add(f('meta.desc_claims', 'info', 'metadata', 'Unverifiable claims ("bestseller", "award-winning") can be flagged.', 'Name the award or ranking, or drop the claim.', 'KDP'));
  }

  if (m.keywords.length > MAX_KEYWORDS) add(f('meta.kw_count', 'error', 'metadata', `${m.keywords.length} keywords; the maximum is ${MAX_KEYWORDS}.`, 'Remove the weakest ones.', 'KDP 7 keywords'));
  const kwSeen = new Set<string>();
  for (const k of m.keywords) {
    const kk = k.trim().toLowerCase(); if (!kk) continue;
    if (kk.length > 50) add(f('meta.kw_long', 'warning', 'metadata', `Keyword "${k.slice(0, 30)}…" is over 50 characters.`, 'Keep each phrase under 50 characters.', 'KDP'));
    if (BRAND_KEYWORDS.test(kk)) add(f('meta.kw_brand', 'warning', 'metadata', `Keyword "${k}" contains a retailer/promotional term.`, 'Replace it with a descriptive phrase.', 'KDP keyword policy'));
    if (kwSeen.has(kk)) add(f('meta.kw_dup', 'info', 'metadata', `Duplicate keyword "${k}".`, 'Use each phrase once.'));
    kwSeen.add(kk);
  }
  if (!m.keywords.filter(k => k.trim()).length) add(f('meta.kw_none', 'info', 'metadata', 'No keywords yet.', 'Seven good keywords are the cheapest discovery you will ever get.'));

  if (!m.bisac.length) add(f('meta.bisac_none', 'error', 'metadata', 'Choose at least one category (BISAC).', 'Search the category box on the Details step.', 'KDP / Ingram / D2D'));
  if (m.bisac.length > MAX_BISAC) add(f('meta.bisac_many', 'error', 'metadata', `${m.bisac.length} categories; the maximum is ${MAX_BISAC}.`, 'Keep the best three.', 'Ingram / Apple'));
  for (const c of m.bisac) if (!isBisacShape(c)) add(f('meta.bisac_shape', 'error', 'metadata', `"${c}" is not a valid BISAC code (3 letters + 6 digits).`, 'Pick from the search results.'));

  const { minAge, maxAge, adult } = m.audience;
  if (minAge != null && maxAge != null && minAge > maxAge) add(f('meta.age_range', 'error', 'metadata', 'The minimum age is higher than the maximum age.', 'Swap them.'));
  if ((m.matureContent || adult) && minAge != null && minAge < 18) add(f('meta.mature_age', 'error', 'metadata', 'Adult/mature content is marked, but the reading age starts below 18.', 'Set the minimum age to 18 or clear the mature flag.', 'KDP adult content'));
  if (m.contentWarnings.length && !m.matureContent && m.contentWarnings.some(w => /explicit|sexual|graphic violence/i.test(w)))
    add(f('meta.warn_mature', 'warning', 'metadata', 'Content warnings mention explicit material but the mature flag is off.', 'Turn on the mature-content flag.', 'KDP / Apple'));

  const pub = Date.parse(m.publicationDate), orig = Date.parse(m.originalPublicationDate);
  if (m.publicationDate && isNaN(pub)) add(f('meta.pubdate_invalid', 'error', 'metadata', 'The publication date is not a valid date.', 'Use the date picker.'));
  if (m.originalPublicationDate && !isNaN(orig) && !isNaN(pub) && orig > pub) add(f('meta.origdate', 'error', 'metadata', 'The original publication date is after the publication date.', 'Fix the dates.', 'ONIX'));
  if (m.originalPublicationDate && !m.publicDomain && !isNaN(orig) && new Date(orig).getFullYear() < 1900) add(f('meta.origdate_old', 'info', 'metadata', 'The original publication date is before 1900.', 'Declare it as a public-domain work if applicable.'));
  if (m.seriesName && !m.seriesNumber) add(f('meta.series_number', 'info', 'metadata', 'Series name set without a book number.', 'Add the number so readers see the order.'));

  // ── Rights ──
  if (!m.copyrightHolder.trim() && !m.publicDomain) add(f('rights.holder', 'warning', 'rights', 'No copyright holder named.', 'Enter your name or company; it appears on the copyright page.'));
  if (!m.territories.worldwide && !m.territories.countries.length) add(f('rights.territories', 'error', 'rights', 'No sales territories selected.', 'Choose Worldwide or pick countries.', 'ONIX SalesRights'));
  if (m.ai.text === 'generated' || m.ai.images === 'generated') add(f('rights.ai_generated', 'info', 'rights', 'AI-generated content is disclosed and the book will get a closer look.', 'No action — disclosure is the right call and is shown to readers.', 'KDP AI disclosure'));
  if (m.isbn.mode === 'own') {
    const c = checkIsbn(m.isbn.value);
    if (!c.valid) add(f('rights.isbn_invalid', 'error', 'rights', `ISBN problem: ${c.reason}`, 'Fix the digits, or choose "No ISBN" / a Plajah identifier.', 'All stores reject bad ISBN check digits'));
  }

  // ── Cover ──
  if (!inp.cover) add(f('cover.missing', 'error', 'cover', 'A cover image is required.', 'Upload one (ideal 1600x2560 JPG/PNG) or make one in Tela.', 'KDP / Apple / Kobo'));
  else for (const x of evaluateCover(inp.cover).findings) add(x);

  // ── Pricing ──
  if (p.model === 'PAID') {
    const entries = Object.entries(p.prices).filter(([, v]) => v != null);
    if (!entries.length) add(f('price.none', 'error', 'pricing', 'Paid book with no price set.', 'Enter a list price, or switch to Free.'));
    for (const [cur, v] of entries) {
      if (!(v > 0)) add(f('price.zero', 'error', 'pricing', `Price in ${cur} is zero or negative.`, 'Set a positive price, or switch the book to Free.'));
      else if (cur === 'USD' && v < PRICE_FLOOR) add(f('price.floor', 'error', 'pricing', `$${v.toFixed(2)} is below the $${PRICE_FLOOR} minimum — card fees would exceed the sale.`, `Price at $${PRICE_FLOOR} or higher, or make the book free.`, 'Stripe minimum economics'));
      else if (v > PRICE_CEILING) add(f('price.ceiling', 'error', 'pricing', `${cur} ${v} is above the ${PRICE_CEILING} ceiling.`, 'Lower the price.', 'KDP $200 cap'));
      else if (cur === 'USD' && v < 2.99 && storyWords > 70000) add(f('price.underpriced', 'info', 'pricing', `$${v.toFixed(2)} is low for a ${Math.round(storyWords / 1000)}k-word book.`, 'See the suggested price; readers often equate very low prices with low quality.'));
    }
  }
  if (p.freeSamplePct > 50) add(f('price.sample_big', 'warning', 'pricing', `A ${p.freeSamplePct}% free sample gives away most of the book.`, 'Most authors share 10–25%.'));
  if (p.preorder.enabled) {
    const d = Date.parse(p.preorder.date);
    if (isNaN(d)) add(f('price.preorder_date', 'error', 'pricing', 'Pre-order is on but has no release date.', 'Pick the release date.'));
    else if (d < now) add(f('price.preorder_past', 'error', 'pricing', 'The pre-order release date is in the past.', 'Choose a future date, or turn pre-order off.'));
    else if (d > now + 366 * 86400000) add(f('price.preorder_far', 'error', 'pricing', 'Pre-orders can be at most one year out.', 'Pick a nearer date.', 'KDP/Apple 12 months'));
  }
  if (p.promo.enabled) {
    if (!/^[A-Z0-9_-]{4,20}$/i.test(p.promo.code)) add(f('price.promo_code', 'error', 'pricing', 'The promo code must be 4–20 letters/numbers.', 'Use something like LAUNCH25.'));
    if (!(p.promo.pct >= 1 && p.promo.pct <= 90)) add(f('price.promo_pct', 'error', 'pricing', 'The promo discount must be 1–90%.', 'Adjust the percentage.'));
  }

  // ── EPUB structure + accessibility ──
  for (const x of inp.epubFindings || []) add(x);
  if (inp.accessibilityScore != null && inp.accessibilityScore < 50)
    add(f('a11y.score_low', 'warning', 'accessibility', `Accessibility readiness is ${inp.accessibilityScore}/100.`, 'Open the accessibility checklist on the Rights step and fix the unticked items.', 'EU Accessibility Act / EPUB A11y 1.1'));

  // De-duplicate identical codes+messages.
  const seen = new Set<string>(); const all: Finding[] = [];
  for (const x of out) { if (!x.message) continue; const k = `${x.code}|${x.message}`; if (!seen.has(k)) { seen.add(k); all.push(x); } }
  const blocking = all.filter(x => x.severity === 'error');
  const warnings = all.filter(x => x.severity === 'warning');
  const infos = all.filter(x => x.severity === 'info');
  let score = 100 - Math.min(75, blocking.length * 14) - Math.min(30, warnings.length * 4) - Math.min(6, infos.length);
  score = Math.max(0, Math.min(100, score));
  if (blocking.length) score = Math.min(score, 69);
  return { score: Math.round(score), ready: blocking.length === 0, blocking, warnings, infos, all, stats: { words, chapters: story.length } };
}

/** Defaults used by the wizard and by tests. */
export function emptyMetadata(): BookMetadata {
  return {
    title: '', subtitle: '', seriesName: '', seriesNumber: '', edition: '', language: 'en', penName: '', contributors: [],
    description: '', keywords: [], bisac: [], thema: [], genre: '', audience: { minAge: null, maxAge: null, adult: false },
    contentWarnings: [], matureContent: false, publicationDate: '', originalPublicationDate: '', publicDomain: false, publicDomainNote: '',
    isbn: { mode: 'none', value: '' }, copyrightHolder: '', copyrightYear: String(new Date().getFullYear()),
    territories: { worldwide: true, countries: [] },
    ai: { text: 'none', images: 'none', translation: 'none', tools: '' }, license: 'ARR',
    accessibility: { altTextDeclared: false, summary: '' }, includeGeneratedCopyrightPage: true,
  };
}

export function emptyPricing(): BookPricing {
  return {
    model: 'PAID', prices: { USD: 4.99 }, freeSamplePct: 10, freeFirstChapters: 1,
    preorder: { enabled: false, date: '' }, promo: { enabled: false, code: '', pct: 20, endsAt: '' },
    bundle: { enabled: false, discountPct: 20 }, delivery: 'DOWNLOAD_OPEN', watermark: true,
  };
}
