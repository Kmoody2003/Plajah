import assert from 'node:assert/strict';
import test from 'node:test';
import { EDITORS, EDITOR_LIST, castEditors, roomTensions } from '../services/editorial/council/editorialEditors';
import { DIMENSIONS, EDITOR_IDS, NOT_LEGAL_ADVICE, type EditorId, type ManuscriptInput } from '../services/editorial/council/editorialTypes';
import { ARIA_EDITORIAL_COUNCIL, ARIA_EDITORIAL_COUNCIL_METHOD, resolveAriaCreativeRole } from '../services/aria/ariaCreativeRoles';
import { chapterOpenings, computeMetrics, dialogueShare, flatten, locateQuote, metricByName, readability, sentencesOf, wordCount } from '../services/editorial/council/editorialMetrics';
import { localAdvice, applyScope, proofSlips, bestSentences } from '../services/editorial/council/editorialLocal';
import { detectEpigraphs, detectLongQuotes, detectLyricLike, personNames, publicDomainHint, rightsReview, shingleSimilarity, trademarkInTitle } from '../services/editorial/council/editorialRights';
import { JOURNALISM_FRAMEWORKS, journalismChecks } from '../services/editorial/council/editorialJournalism';
import { chunkManuscript, buildMaterial, mapChunks, DIGEST_BUDGET_WORDS } from '../services/editorial/council/editorialChunker';
import { ANTI_SYCOPHANCY, editorSystem, parseJson, readEditorRead, readSynthesis, synthesisSystem } from '../services/editorial/council/editorialPrompts';
import { applyToPrefs, declinedSet, emptyPrefs, filterDeclined, recordDecision, openNotes } from '../services/editorial/council/editorialDecisions';
import { articleToManuscript, htmlToText } from '../services/editorial/council/editorialAdapters';

/* ─── Sample texts ──────────────────────────────────────────────────────────────────────────── */
const FILLER = ['The kettle clicked off in the dark kitchen.', 'Nobody answered the phone, so Mara let it ring until the machine took over.', 'He felt very sad about the whole thing, and he quietly walked to the window.', 'She saw the rain begin and noticed that the glass was cold.', 'Salt wind came off the harbour, and the gravel under her boots rattled like loose teeth.', 'It was decided by the committee that the gate would be closed.', '"Where were you?" Tom asked.', '"Out," she said. "Walking. The streets are quiet now."', 'The ferry horn sounded twice across the water.', 'Rust flaked from the railing wherever her hand rested, and the smell of diesel hung in the cold air all morning.'];
function prose(words: number, seed = 0): string {
  const out: string[] = []; let n = 0, i = seed;
  while (n < words) { const s = FILLER[i++ % FILLER.length]; out.push(s); n += wordCount(s); if (i % 4 === 0) out.push('\n'); }
  return out.join(' ').replace(/ \n /g, '\n');
}
function novel(chapters = 8, wordsEach = 400): ManuscriptInput {
  return { title: 'The Harbour Year', kind: 'FICTION', genre: 'literary fiction', chapters: Array.from({ length: chapters }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}`, text: prose(wordsEach, i * 3) })) };
}

/* ─── Roster ────────────────────────────────────────────────────────────────────────────────── */
test('the roster: 18 distinct editors, each a whole person, tensions argued from BOTH sides', () => {
  assert.ok(EDITOR_LIST.length >= 14 && EDITOR_LIST.length <= 18); assert.equal(EDITOR_LIST.length, EDITOR_IDS.length);
  assert.equal(ARIA_EDITORIAL_COUNCIL.length, EDITOR_IDS.length);
  const names = new Set<string>();
  for (const e of EDITOR_LIST) {
    assert.ok(e.name && e.epithet && e.background.length > 30 && e.conviction && e.challenges && e.protects, `${e.id} lens/background incomplete`);
    assert.ok(e.voice.length > 30 && e.genres.length && e.kinds.length && e.dimensions.length, `${e.id} missing voice/genres`);
    assert.ok(e.questions.length >= 3, `${e.id} asks fewer than three questions`); assert.ok(e.blindSpots.length >= 1, `${e.id} has no blind spots`); assert.ok(e.researchBeats.length >= 2);
    assert.ok(Object.keys(e.tensions).length >= 1, `${e.id} argues with nobody`);
    for (const [o, why] of Object.entries(e.tensions)) { assert.notEqual(o, e.id); assert.ok(why!.length > 40); assert.ok(EDITORS[o as EditorId].tensions[e.id], `${o} does not answer ${e.id}: tension must be two-way`); }
    names.add(e.name);
  }
  assert.equal(names.size, EDITOR_LIST.length);
  // The brief's coverage: fiction, non-fiction, literary, publishing, copyright, journalism, reader, and non-Anglo voices.
  for (const id of ['DEV_LITERARY', 'DEV_GENRE', 'DEV_YA_CHILDREN', 'DEV_NARRATIVE_NF', 'DEV_EXPOSITORY', 'DEV_POETRY', 'DEV_SERIAL', 'LINE_COPY', 'PROOFREADER', 'ACQUISITIONS', 'PUB_OPS', 'SENSITIVITY', 'COPYRIGHT', 'JOURNALISM_VERIFY', 'JOURNALISM_ETHICS', 'READER_ADVOCATE', 'WORLD_LIT', 'ORAL_NARRATIVE'] as EditorId[]) assert.ok(EDITORS[id], id);
  assert.match(EDITORS.COPYRIGHT.background, /not a lawyer/i);
});

test('casting: copyright voice and reader advocate always sit in, journalism for articles, and the room contains a real argument', () => {
  const book = castEditors('FICTION', { genre: 'thriller' });
  assert.ok(book.includes('COPYRIGHT') && book.includes('READER_ADVOCATE')); assert.ok(book.includes('DEV_GENRE'));
  assert.ok(roomTensions(book).length >= 1, 'the room has a standing argument');
  const art = castEditors('ARTICLE');
  assert.ok(art.includes('JOURNALISM_VERIFY') && art.includes('JOURNALISM_ETHICS')); assert.ok(!art.some(i => i.startsWith('DEV_')));
  assert.ok(castEditors('POETRY').includes('DEV_POETRY'));
  assert.deepEqual(castEditors('FICTION', { pinned: ['ORAL_NARRATIVE'] })[0], 'ORAL_NARRATIVE');
});

test('Aria routes book, manuscript, edit, copyright and journalism intents to the editorial role', () => {
  for (const s of ['manuscript review', 'book-submit check', 'copyright question', 'journalism integrity', 'editorial desk']) assert.equal(resolveAriaCreativeRole(s).id, 'EDITORIAL_DIRECTOR', s);
  assert.equal(resolveAriaCreativeRole('pixels motion').id, 'MOTION_DIRECTOR');
  assert.match(ARIA_EDITORIAL_COUNCIL_METHOD, /Your call/); assert.match(ARIA_EDITORIAL_COUNCIL_METHOD, /not legal advice/i); assert.match(ARIA_EDITORIAL_COUNCIL_METHOD, /never mark a claim verified/i);
});

/* ─── Metrics: every one explained, none a verdict ──────────────────────────────────────────── */
test('metrics read what they claim to and explain themselves', () => {
  const m = novel(); const flat = flatten(m.chapters); const ms = computeMetrics(m, flat);
  for (const x of ms) { assert.ok(x.explanation.length > 60, `${x.name} has no explanation`); assert.ok(x.value.length > 3); }
  for (const name of ['Readability', 'Sentence length', 'Paragraph length', 'Adverb density', 'Filter words', 'Dialogue share', 'Passive voice', 'Chapter-length curve', 'Chapter openings', 'Show versus tell', 'Front and back matter']) assert.ok(metricByName(ms, name), `${name} missing`);
  const rep = metricByName(ms, 'Repeated phrases'); assert.ok(rep, 'the sample repeats whole sentences, which must register as repeated phrases');
  assert.ok(readability('The cat sat. The dog ran. We all went home.').fleschReadingEase > 90);
  assert.ok(readability('Notwithstanding considerable epistemological disagreement, interdisciplinary scholarship proceeds methodically.').fleschReadingEase < 20);
  const d = dialogueShare('"Hello there my friend," he said. Nothing else was said by anyone in the room for a long time at all.'); assert.ok(d.ratio > 0.1 && d.ratio < 0.5);
  assert.equal(sentencesOf('Dr. Smith arrived. He sat.').length, 2, 'abbreviations do not split sentences');
});

test('filter words, adverbs and show-vs-tell are located, not just counted', () => {
  const text = Array(30).fill('She felt very sad. He quietly noticed the window and she realized he seemed angry, softly, slowly, gently.').join('\n') + '\nThe harbour smelled of salt and diesel.';
  const m: ManuscriptInput = { kind: 'FICTION', title: 't', chapters: [{ id: 'a', title: 'A', text }] }; const flat = flatten(m.chapters); const ms = computeMetrics(m, flat);
  const f = metricByName(ms, 'Filter words')!; assert.match(f.value, /densest stretch/); assert.ok(f.where && text.includes(f.where.quote.slice(0, 20)));
  const t = metricByName(ms, 'Show versus tell')!; assert.ok(t.where); assert.match(t.explanation, /legitimate tool/);
  assert.ok(metricByName(ms, 'Adverb density'));
});

test('chapter openings, pacing curve and POV drift are heuristics that say so', () => {
  const m = novel(9, 300); m.chapters[4].text = 'It was a grey morning and the sun rose slowly over the hills. ' + m.chapters[4].text; m.chapters[2].text = 'I walked to the sea. I thought of my mother. I did not look back. ' .repeat(12) + 'He said she knew. She said he thought. They told him. ' .repeat(10);
  const flat = flatten(m.chapters); const o = chapterOpenings(flat); assert.ok(o.some(x => x.flags.some(f => /scene-setting/.test(f))));
  const ms = computeMetrics(m, flat); const pov = metricByName(ms, 'Point-of-view drift'); assert.ok(pov); assert.match(pov!.explanation, /cannot see head-hopping/);
  const long = novel(6, 200); long.chapters[2].text = prose(1400); assert.match(metricByName(computeMetrics(long), 'Chapter-length curve')!.value, /longest "Chapter 3"/);
});

test('locateQuote finds real passages and refuses invented ones', () => {
  const flat = flatten(novel().chapters); const real = 'Salt wind came off the harbour, and the gravel under her boots rattled like loose teeth.';
  const a = locateQuote(flat, real)!; assert.ok(a); assert.equal(flat.text.slice(a.start, a.end), real); assert.ok(a.chapterTitle);
  assert.ok(locateQuote(flat, real.replace(/ /g, '  ')), 'whitespace differences are tolerated');
  assert.equal(locateQuote(flat, 'The sky split open and a thousand silver herons descended.'), undefined);
});

/* ─── localAdvice: the output contract with no model ────────────────────────────────────────── */
test('localAdvice honours the contract: working with quoted locations, words not numbers, options + Your call, severities, honest limits', () => {
  const m = novel(); const flat = flatten(m.chapters); const r = localAdvice(m);
  assert.equal(r.source, 'local');
  // (a) what is working: specific, quoted, located, and the quote really is in the text at that offset
  assert.ok(r.working.length >= 1); for (const w of r.working) { assert.ok(w.anchor); assert.equal(flat.text.slice(w.anchor!.start, w.anchor!.end).replace(/\s+/g, ' ').trim().slice(0, 40), w.anchor!.quote.slice(0, 40)); assert.ok(w.anchor!.chapterTitle); }
  // (b) verdicts in words per dimension, including honesty about what a tool cannot judge
  const dims = new Set(r.verdicts.map(v => v.dimension)); for (const d of ['premise', 'structure', 'character', 'voice', 'pacing', 'prose', 'market fit', 'readiness']) assert.ok(dims.has(d), d);
  for (const v of r.verdicts) { assert.ok(['Strong', 'Developing', 'Needs a rethink', 'Not judged offline'].includes(v.band)); assert.ok(!/\d+\s*\/\s*\d+|\b\d{1,3}\s*%\s*(?:good|strong)/i.test(v.reasoning)); assert.ok(v.reasoning.length > 20); }
  assert.equal(r.verdicts.find(v => v.dimension === 'premise')!.band, 'Not judged offline'); assert.equal(r.verdicts.find(v => v.dimension === 'character')!.band, 'Not judged offline');
  assert.notEqual(r.verdicts.find(v => v.dimension === 'voice')!.band, 'Needs a rethink', 'a counting tool never tells an author to rethink their voice');
  // (c) options not commands, ending with Your call; (e) severity labels
  assert.ok(r.notes.length >= 3);
  for (const n of r.notes) { assert.ok(n.options.length >= 2, n.headline); assert.match(n.yourCall, /^Your call:/); assert.ok(['Craft', 'Clarity', 'Risk'].includes(n.severity)); assert.ok(!/\byou (must|have to|need to)\b/i.test(`${n.observation} ${n.options.join(' ')}`), `command language in "${n.headline}"`); assert.ok(n.fingerprint); }
  // metric-raised notes carry the explanation of the count
  assert.ok(r.notes.filter(n => n.metric).every(n => n.metric!.explanation.length > 40));
  // (d) disagreement is surfaced, not hidden
  assert.ok(r.disagreements.length >= 1); for (const d of r.disagreements) { assert.ok(d.sideA && d.sideB); assert.notEqual(d.between[0], d.between[1]); }
  assert.ok(r.synthesis && new Set([r.synthesis.lead, r.synthesis.counterpoint, r.synthesis.editor]).size === 3);
  // honest limits, and no flattery
  assert.ok(r.limits.some(l => /not legal advice/i.test(l))); assert.ok(r.limits.some(l => /not human editors/i.test(l)));
  assert.match(r.ariaSummary, /what is working/i); assert.ok(!/\b(amazing|brilliant|masterpiece|perfect)\b/i.test(r.ariaSummary));
  assert.ok(/You decide/.test(r.ariaSummary));
});

test('a text too short to read says so rather than flattering', () => {
  const r = localAdvice({ kind: 'FICTION', title: 'x', chapters: [{ id: 'a', title: 'A', text: 'It was a dark night. She ran.' }] });
  assert.equal(r.working.length, 0); assert.equal(r.verdicts[0].band, 'Needs a rethink'); assert.match(r.ariaSummary, /not enough text/i);
});

test('scope narrows the read: chapter and selection', () => {
  const m = novel(); const ch = applyScope(m, { kind: 'CHAPTER', chapterId: 'c3' }); assert.equal(ch.chapters.length, 1); assert.equal(ch.chapters[0].id, 'c3');
  const sel = applyScope(m, { kind: 'SELECTION', start: 0, end: 200 }); assert.equal(sel.chapters.length, 1); assert.ok(sel.chapters[0].text.length <= 200);
  assert.ok(localAdvice(m, { scope: { kind: 'CHAPTER', chapterId: 'c3' } }).metrics.length > 0);
});

test('proofing slips and best sentences', () => {
  const flat = flatten([{ id: 'a', title: 'A', text: 'This is is a test.  Two spaces  here , and a stray comma.' + '\n' + prose(300) }]);
  const slips = proofSlips(flat).map(s => s.what); assert.ok(slips.some(s => /doubled word "is"/.test(s))); assert.ok(slips.some(s => /two or more spaces/.test(s)));
  const best = bestSentences(flatten([{ id: 'a', title: 'A', text: prose(400) }])); assert.ok(best.length >= 1); assert.ok(!/\b(?:felt|saw|noticed)\b/i.test(best[0].text));
});

/* ─── Copyright & rights ────────────────────────────────────────────────────────────────────── */
test('rights checks: long quotes, epigraphs, lyric-like lines, trademarks, real names, with the disclaimer', () => {
  const longQuote = '"' + Array(60).fill('the committee resolved that henceforth all members shall').join(' ') + '"';
  const lyric = 'Verse text follows.\nHold me closer tiny dancer\nCount the headlights on the highway\nLay me down in sheets of linen\nYou had a busy day today\nBack to prose.';
  const m: ManuscriptInput = { kind: 'MEMOIR', title: 'Hogwarts and Me', chapters: [
    { id: 'e', title: 'Epigraph', text: '"The only way out is through."\n— Robert Frost\n\nChapter text begins here and goes on.' },
    { id: 'a', title: 'One', text: `${prose(200)}\nI met Jordan Whitfield in 2009 and Sandra Okoye later. Jordan Whitfield lied to me.\n${longQuote}\n${lyric}\n` },
  ], meta: { aiText: 'assisted', aiTools: '', copyrightHolder: '' } };
  const flat = flatten(m.chapters);
  assert.ok(detectLongQuotes(flat).length >= 1); assert.ok(detectEpigraphs(m).length >= 1); assert.ok(detectLyricLike(flat).length >= 1);
  assert.deepEqual(trademarkInTitle('Hogwarts and Me'), ['Hogwarts']); assert.deepEqual(trademarkInTitle('A Quiet House'), []);
  const names = personNames(flat.text).map(n => n.name); assert.ok(names.includes('Jordan Whitfield'));
  const r = rightsReview(m, flat); const ids = r.items.map(i => i.id);
  for (const id of ['long-quote', 'epigraph', 'lyric-like', 'trademark-title', 'real-people', 'ai-tools', 'holder']) assert.ok(ids.includes(id), `${id} missing: ${ids}`);
  assert.match(r.disclaimer, /not legal advice/i); assert.match(r.disclaimer, /attorney/i);
  for (const i of r.items) { assert.ok(i.nextSteps.length >= 1); assert.ok(['Craft', 'Clarity', 'Risk'].includes(i.severity)); }
  assert.ok(r.links.every(l => /^https:\/\//.test(l.url))); assert.ok(r.links.some(l => /copyright\.gov\/registration/.test(l.url)));
  assert.ok(!r.items.some(i => /we (?:have )?registered|your copyright is registered/i.test(i.why)), 'the council never claims to register copyright');
});

test('public-domain helper and the similarity hook say what they cannot do', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  assert.equal(publicDomainHint({ publicationYear: 1925, now }).status, 'LIKELY_PUBLIC_DOMAIN_US'); assert.equal(publicDomainHint({ publicationYear: 1930, now }).status, 'LIKELY_PUBLIC_DOMAIN_US'); assert.equal(publicDomainHint({ publicationYear: 1931, now }).status, 'LIKELY_STILL_PROTECTED_US'); assert.equal(publicDomainHint({ now }).status, 'UNKNOWN');
  assert.match(publicDomainHint({ publicationYear: 1900, authorDeathYear: 1950, now }).message, /1\s?950|2020|translation|edition/);
  const a = 'It was the best of times, it was the worst of times, it was the age of wisdom and then some extra words here follow on from there'; const b = 'xx ' + a + ' yy zz more words that differ entirely from anything else';
  const res = shingleSimilarity.check(a, { label: 'supplied text', text: b }) as any; assert.ok(res.longestSharedRun >= 12); assert.match(res.caveat, /Not a plagiarism guarantee/);
  assert.equal((shingleSimilarity.check('totally different words appear in this passage here today', { label: 'x', text: b }) as any).sharedPassages.length, 0);
});

/* ─── Journalism integrity ──────────────────────────────────────────────────────────────────── */
const ARTICLE = `The city council voted 7-2 to cut the library budget by 40 percent, a move that will close three branches and cost 120 jobs. The decision was shocking and the mayor slammed critics. Experts say the cuts will hurt children. Studies show reading scores fall when libraries close. "We had no choice and nobody consulted us about any of this at all," the notice read, according to nobody in particular.
My brother works at the library and I invested in the nonprofit that sponsors the reading program. Use code READ for a discount from our partnered bookshop.
Jordan Hale, 34, was arrested and charged with theft from the branch. A 15-year-old girl was a victim of the incident. The council "...did not ... vote on anything" said spokesman Lee Ortiz.
We must act now. I think the council clearly is a disgrace and obviously should resign. It is shameful. I believe we need to say so. We should never forget this. ${prose(60)}`;
test('journalism checks turn ethics into questions: attribution, sourcing, loaded language, quotes, headline, conflicts, harm', () => {
  const m = articleToManuscript({ title: 'Council confirms library cuts will end reading for 500,000 children', text: ARTICLE, disclosures: { aiAssisted: false, sponsored: false, affiliateLinks: false, conflictOfInterest: false }, rights: [{ ref: 'cover', credit: '', license: '' as any }], imageRefs: ['cover'], claims: [{ id: '1', ownerId: 'u', articleId: 'a', text: 'Reading scores fall.', status: 'VERIFIED', statusBy: 'ai:suggestion', statusAt: 1, sources: [{ url: 'https://x.org', addedAt: 1 }] }, { id: '2', ownerId: 'u', articleId: 'a', text: 'Cuts are 40 percent.', status: 'DISPUTED', statusBy: 'human:u', statusAt: 1, sources: [], note: 'budget office disagrees' }], aiUsed: true });
  const f = journalismChecks(m); const ids = new Set(f.map(x => x.id));
  for (const id of ['attribution-gap', 'vague-attribution', 'loaded-language', 'headline-mismatch', 'conflict-undisclosed', 'sponsor-undisclosed', 'sensitive', 'presumption', 'opinion-label', 'ai-disclosure', 'image-credit', 'claims-disputed', 'claims-unverified']) assert.ok(ids.has(id), `${id} missing; got ${[...ids]}`);
  for (const x of f) { assert.ok(x.options.length >= 1); assert.match(x.yourCall, /^Your call:/); assert.ok(['Craft', 'Clarity', 'Risk'].includes(x.severity)); assert.ok(x.principle.length > 5); }
  // the editors ask, they do not convict
  assert.ok(f.filter(x => /\?$/.test(x.headline)).length >= 5); assert.ok(!f.some(x => /(liar|lied|fraudulent|is guilty)/i.test(`${x.headline} ${x.observation}`)));
  // harm / conflicts are Risk; mechanics are Clarity
  assert.equal(f.find(x => x.id === 'sensitive')!.severity, 'Risk'); assert.equal(f.find(x => x.id === 'attribution-gap')!.severity, 'Clarity');
  // a claim a heuristic "verified" does not count as verified: the council reads the workbench, never trusts a machine's tick
  assert.ok(m.article!.claims!.every(c => c.status !== 'VERIFIED' || !c.humanVerified), 'the AI-set VERIFIED claim is not human-verified');
});

test('the council never marks a claim verified: no journalism code path writes claim status', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../services/editorial/council/editorialJournalism.ts', import.meta.url), 'utf8') + (await import('node:fs')).readFileSync(new URL('../services/editorial/council/editorialAdapters.ts', import.meta.url), 'utf8');
  assert.ok(!/setClaimStatus|status\s*:\s*['"]VERIFIED['"]|\.status\s*=\s*['"]VERIFIED/.test(src));
  assert.ok(!/importer|statusBy\s*[:=]/.test(src));
  assert.match(editorSystem('JOURNALISM_VERIFY', { journalism: true }), /NEVER mark a claim verified/);
});

test('ethics frameworks are real, paraphrased and cited', () => {
  const ids = JOURNALISM_FRAMEWORKS.map(f => f.id); for (const id of ['SPJ', 'ELEMENTS', 'AP', 'REUTERS', 'NPR']) assert.ok(ids.includes(id));
  const spj = JOURNALISM_FRAMEWORKS.find(f => f.id === 'SPJ')!; assert.deepEqual(spj.principles.map(p => p.key), ['Seek truth and report it', 'Minimize harm', 'Act independently', 'Be accountable and transparent']);
  assert.equal(JOURNALISM_FRAMEWORKS.find(f => f.id === 'ELEMENTS')!.principles.length, 9);
  for (const f of JOURNALISM_FRAMEWORKS) { assert.match(f.url, /^https:\/\//); for (const p of f.principles) assert.ok(p.summary.length < 260, 'paraphrase, never long reproduction'); }
});

test('a plain book is not run through the newsroom checklist', () => {
  const r = localAdvice(novel()); assert.ok(!r.notes.some(n => n.editorId === 'JOURNALISM_VERIFY' || n.editorId === 'JOURNALISM_ETHICS'));
  const a = localAdvice({ ...articleToManuscript({ title: 'Plain report', text: ARTICLE + ' ' + prose(250), disclosures: { aiAssisted: false, sponsored: false, affiliateLinks: false, conflictOfInterest: false }, rights: [], imageRefs: [], claims: [] }) });
  assert.ok(a.notes.some(n => n.editorId === 'JOURNALISM_VERIFY')); assert.ok(a.verdicts.some(v => v.dimension === 'sourcing')); assert.ok(!a.verdicts.some(v => v.dimension === 'character'));
});

/* ─── Chunking: a long book fits ────────────────────────────────────────────────────────────── */
test('map-reduce: a 100k-word book is chunked, summarised through the model, and the digest fits', async () => {
  const m = novel(40, 2500); const flat = flatten(m.chapters); assert.ok(wordCount(flat.text) >= 99000);
  const chunks = chunkManuscript(flat); assert.ok(chunks.length >= 45 && chunks.length <= 120); assert.ok(chunks.every(c => c.words <= 2600));
  assert.ok(Math.abs(chunks.reduce((a, c) => a + c.words, 0) - wordCount(flat.text)) / wordCount(flat.text) < 0.02, 'chunks cover the book');
  let calls = 0, active = 0, maxActive = 0;
  const ask = async (_s: string, u: string) => { calls++; active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 1)); active--; const id = /section "([^"]+)"/.exec(u)![1]; if (id.startsWith('c5#0')) throw new Error('boom'); return JSON.stringify({ summary: `Things happen in ${id}. Mara walks. The harbour waits for the ferry to arrive.`, voice: 'Close third, past tense.', standouts: ['The ferry horn sounded twice across the water.', 'A line that is not in the text at all, invented by the model.'], concerns: ['A jump in time is not explained.'] }); };
  const sums = await mapChunks(chunks, 'fiction', ask, parseJson, 4);
  assert.equal(calls, chunks.length); assert.ok(maxActive <= 4 && maxActive > 1, `bounded concurrency, saw ${maxActive}`);
  assert.ok(sums.some(s => s.fallback), 'a failed chunk degrades to its opening, honestly labelled'); assert.ok(sums.every(s => s.standouts.every(q => flat.text.includes(q))), 'invented standouts are dropped');
  const { material, mode } = buildMaterial(m, flat, sums); assert.equal(mode, 'DIGEST'); assert.match(material, /DIGEST/); assert.ok(wordCount(material) <= DIGEST_BUDGET_WORDS * 1.4, `digest is ${wordCount(material)} words`);
  assert.equal(buildMaterial(novel(2, 300), flatten(novel(2, 300).chapters)).mode, 'WHOLE');
});

/* ─── Prompts and strict readers ────────────────────────────────────────────────────────────── */
test('prompts carry the method, the person, the anti-sycophancy rule and the legal disclaimer', () => {
  const sys = editorSystem('ACQUISITIONS'); assert.match(sys, /Acquisitions & Market Editor/); assert.match(sys, /guidance not orders|Guide, never order/i); assert.match(sys, /Your call/); assert.match(sys, /Anti-sycophancy/); assert.match(sys, /not legal advice/i); assert.match(sys, /Aria is the only one who addresses the author/);
  assert.match(ANTI_SYCOPHANCY, /honest even when the news is unflattering/); assert.match(synthesisSystem(), /WITHOUT averaging/); assert.match(synthesisSystem(), /at most two/);
  assert.match(editorSystem('COPYRIGHT'), /You are not a lawyer|not a lawyer/i);
});

test('readers are strict: invented quotes are dropped, notes get options and a Your call, severity is normalised', () => {
  const flat = flatten(novel().chapters); const real = 'Salt wind came off the harbour, and the gravel under her boots rattled like loose teeth.';
  const r = readEditorRead('DEV_LITERARY', { working: [{ quote: real, why: 'Concrete and sensory.' }, { quote: 'An invented line about silver herons descending on the town.', why: 'Lovely.' }], verdicts: [{ dimension: 'Prose', band: 'strong', reasoning: 'Clean.' }, { dimension: 'x', band: 'excellent!!', reasoning: 'bad band' }], notes: [{ severity: 'serious', headline: 'Pacing sags', observation: 'The middle repeats.', quote: 'a quotation that is not there anywhere in this manuscript', options: ['You must cut chapter four.', 'Compress chapters four and five.'], yourCall: 'this would change if the repetition is a refrain.' }] }, flat)!;
  assert.equal(r.working.length, 1, 'praise you cannot quote is flattery'); assert.equal(r.droppedQuotes, 2);
  assert.deepEqual(r.verdicts.map(v => v.band), ['Strong']);
  const n = r.notes[0]; assert.equal(n.severity, 'Craft'); assert.equal(n.anchor, undefined); assert.ok(n.options.length >= 2); assert.ok(!n.options.some(o => /^you must/i.test(o))); assert.match(n.yourCall, /^Your call:/);
  assert.equal(readEditorRead('DEV_LITERARY', { nothing: true }, flat), null);
  const ids: EditorId[] = ['DEV_LITERARY', 'DEV_GENRE', 'ACQUISITIONS'];
  const s = readSynthesis({ lead: 'DEV_GENRE', counterpoint: 'DEV_GENRE', editor: 'DEV_GENRE', ariaSummary: 'a', verdicts: [{ dimension: 'pacing', band: 'Developing', reasoning: 'r', editorId: 'DEV_GENRE' }] }, ids)!;
  assert.equal(new Set([s.lead, s.counterpoint, s.editor]).size, 3); assert.equal(readSynthesis({ lead: 'PUB_OPS', ariaSummary: 'a' }, ids), null);
});

/* ─── Decisions ─────────────────────────────────────────────────────────────────────────────── */
test('decisions persist, declined notes are never raised again, and changing your mind un-declines', () => {
  const m = novel(); const r = localAdvice(m);
  const s = { id: 'L1', uid: 'u', createdAt: 1, depth: 'FULL' as const, status: 'DONE' as const, kind: m.kind, title: 't', scope: { kind: 'BOOK' as const }, editors: [], wordCount: 3000, report: r, decisions: [], replies: [], reconsiderations: 0 };
  const target = r.notes[0]; const s2 = recordDecision(s, target.id, 'DECLINE', 'It is deliberate.');
  assert.equal(s2.decisions[0].choice, 'DECLINE'); assert.equal(s2.decisions[0].note, 'It is deliberate.');
  assert.ok(!openNotes(s2).some(n => n.id === target.id));
  let prefs = applyToPrefs(emptyPrefs(), s2.decisions[0]); assert.ok(declinedSet(prefs).has(target.fingerprint));
  // a later read of the same text no longer raises it
  const r2 = localAdvice(m, { declinedFingerprints: declinedSet(prefs) }); assert.ok(!r2.notes.some(n => n.fingerprint === target.fingerprint)); assert.equal(r2.notes.length, r.notes.length - 1);
  assert.ok(!filterDeclined(r, declinedSet(prefs)).notes.some(n => n.fingerprint === target.fingerprint));
  const s3 = recordDecision(s2, target.id, 'ACCEPT'); assert.equal(s3.decisions.length, 1); prefs = applyToPrefs(prefs, s3.decisions[0]); assert.ok(!declinedSet(prefs).has(target.fingerprint));
  assert.throws(() => recordDecision(s, 'nope', 'ACCEPT'), /not part of this reading/); assert.throws(() => recordDecision(s, target.id, 'MAYBE' as any), /accept, adapt or decline/);
  assert.equal(recordDecision(s, target.id, 'ADAPT', 'Will do half.').decisions[0].choice, 'ADAPT');
});

/* ─── Orchestration (scripted model, in-memory store) ───────────────────────────────────────── */
test('the rounds run end to end: map, propose, dispute, synthesise, reflect; decisions and pushback persist; declined items stay gone', async () => {
  const { createEditorialCouncil, sanitizeManuscript, EDITORIAL_DAILY_CAP } = await import('../services/editorial/council/editorialRoutes');
  const mem = new Map<string, any>();
  const store = { get: async (p: string) => mem.get(p) ?? null, set: async (p: string, o: any) => { mem.set(p, JSON.parse(JSON.stringify(o))); return true; }, list: async (c: string) => [...mem.entries()].filter(([k]) => k.startsWith(c + '/')).map(([, v]) => v) };
  const real = 'Salt wind came off the harbour, and the gravel under her boots rattled like loose teeth.';
  const calls: string[] = [];
  const who = (system: string): EditorId => (EDITOR_IDS.find(id => system.startsWith('You are ' + EDITORS[id].name)) ?? 'DEV_LITERARY');
  const model = async (system: string, user: string) => {
    if (system.startsWith('You are a careful reading assistant')) { calls.push('map'); return JSON.stringify({ summary: 'Mara waits.', standouts: [], concerns: [] }); }
    if (system.startsWith('You are Aria, relaying')) { calls.push('reply'); return JSON.stringify({ stance: 'SOFTENS', reconsideration: 'Fair: if the repetition is a refrain, the note should be softer.', revisedOptions: ['Keep the refrain; vary it once.', 'Leave it.'] }); }
    if (system.startsWith('You are Aria')) { calls.push('synthesis'); return JSON.stringify({ lead: 'DEV_LITERARY', counterpoint: 'DEV_GENRE', editor: 'READER_ADVOCATE', keepFromCounterpoint: 'the payoff schedule', verdicts: [{ dimension: 'pacing', band: 'Developing', reasoning: 'The Genre Editor thinks the middle sags; the Literary Editor reads it as earned.', editorId: 'DEV_GENRE' }], disagreements: [{ between: ['DEV_LITERARY', 'DEV_GENRE'], about: 'pacing', sideA: 'Earned slowness.', sideB: 'A reader leaves.' }], ariaSummary: 'First, what is working: the harbour passage is concrete. The council split on pacing and I take the Genre Editor\'s side, but the decision is yours.' }); }
    const me = who(system);
    if (user.startsWith("The other editors' reads")) { calls.push(`dispute:${me}`); return JSON.stringify({ against: me === 'DEV_LITERARY' ? 'DEV_GENRE' : 'DEV_LITERARY', about: 'pacing', objection: 'I read it differently.', concession: 'One point is fair.' }); }
    if (user.startsWith('The reading is over')) { calls.push(`reflect:${me}`); return JSON.stringify({ note: `${me} would ask about the middle sooner.` }); }
    calls.push(`propose:${me}`);
    return JSON.stringify({ working: [{ quote: real, why: 'Concrete and sensory.' }, { quote: 'Invented words that the manuscript never contained at all.', why: 'Flattery' }], verdicts: [{ dimension: 'pacing', band: 'Developing', reasoning: 'The middle repeats.' }], notes: [{ severity: 'Craft', dimension: 'pacing', headline: `${me} says the middle repeats`, observation: 'Scenes echo each other.', quote: real, options: ['Compress two scenes.', 'Keep one as a refrain.', 'Leave it.'], yourCall: 'Your call: this would change if the echo is deliberate.' }], arguesWith: { editorId: me === 'DEV_LITERARY' ? 'DEV_GENRE' : 'DEV_LITERARY', about: 'pacing' } });
  };
  const council = createEditorialCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model });
  const m = novel(8, 1200); assert.ok(!('error' in sanitizeManuscript(m)));
  const s = await council.review('u1', m, { depth: 'FULL', editors: ['DEV_LITERARY', 'DEV_GENRE', 'READER_ADVOCATE'] });
  assert.equal(s.status, 'DONE', s.error); assert.equal(s.report!.source, 'mixed'); assert.ok(calls.includes('map'), 'a 9,600-word book goes through the map step');
  const idx = (p: string) => calls.findIndex(c => c.startsWith(p)); assert.ok(idx('propose') < idx('dispute') && idx('dispute') < calls.indexOf('synthesis'));
  assert.equal(calls.filter(c => c.startsWith('propose')).length, 3);
  const flat = flatten(m.chapters);
  for (const w of s.report!.working) assert.ok(w.anchor && flat.text.includes(w.anchor.quote.slice(0, 30)));
  assert.ok(!s.report!.working.some(w => /Flattery/.test(w.text)), 'the invented quote was dropped'); assert.ok(s.report!.limits.some(l => /could not be found in your text/.test(l)));
  assert.ok(s.report!.notes.some(n => n.source === 'ai' && n.anchor) && s.report!.notes.some(n => n.source === 'local'), 'AI and counted notes are merged');
  assert.equal(s.report!.synthesis!.lead, 'DEV_LITERARY'); assert.ok(s.report!.disagreements.length >= 1);
  assert.equal(s.report!.verdicts.find(v => v.dimension === 'pacing')!.editorId, 'DEV_GENRE', 'the verdict is one editor\'s, with the dissent in the reasoning, not an average');
  assert.equal(s.report!.verdicts.find(v => v.dimension === 'premise')!.band, 'Not judged offline');
  assert.ok(mem.has(`users/u1/editorial_sessions/${s.id}`)); assert.equal(mem.get(`users/u1/editorial_sessions/${s.id}`).status, 'DONE');
  await new Promise(r => setTimeout(r, 50)); assert.equal(calls.filter(c => c.startsWith('reflect')).length, 3); assert.equal(mem.get(`users/u1/editorial_sessions/${s.id}`).reflections.length, 3);
  assert.equal(mem.get('users/u1/muse_usage/' + new Date().toISOString().slice(0, 10)), undefined, 'the cap is only counted by the route, not the service');

  // the author declines one; it is persisted and never raised again
  const target = s.report!.notes.find(n => n.source === 'ai')!;
  const d = await council.decide('u1', s.id, target.id, 'DECLINE', 'The echo is the point.');
  assert.equal(d!.decisions[0].choice, 'DECLINE'); assert.ok(mem.get('users/u1/editorial_prefs/main').declined[target.fingerprint]);
  const s2 = await council.review('u1', m, { depth: 'QUICK', editors: ['DEV_LITERARY', 'DEV_GENRE', 'READER_ADVOCATE'] });
  assert.ok(!s2.report!.notes.some(n => n.fingerprint === target.fingerprint), 'the declined note does not come back');
  // the author pushes back; the council reconsiders and the stance is recorded
  const target2 = s2.report!.notes.find(n => n.source === 'ai')!;
  const r = await council.reply('u1', s2.id, 'The repetition is a refrain, it mirrors the tide.', target2.id);
  assert.equal(r!.reconsiderations, 1); assert.equal(r!.replies[0].stance, 'SOFTENS'); assert.equal(r!.report!.notes.find(n => n.id === target2.id)!.stance, 'SOFTENS'); assert.deepEqual(r!.report!.notes.find(n => n.id === target2.id)!.options, ['Keep the refrain; vary it once.', 'Leave it.']);
  // other users cannot read this session
  assert.equal(await council.decide('u2', s.id, target.id, 'ACCEPT'), null);
  assert.ok(EDITORIAL_DAILY_CAP.FREE < EDITORIAL_DAILY_CAP.PRO);
});

test('if every model call fails, the author still gets the honest offline read', async () => {
  const { createEditorialCouncil } = await import('../services/editorial/council/editorialRoutes');
  const mem = new Map<string, any>(); const store = { get: async (p: string) => mem.get(p) ?? null, set: async (p: string, o: any) => { mem.set(p, JSON.parse(JSON.stringify(o))); return true; }, list: async () => [] };
  const council = createEditorialCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model: async () => { throw new Error('no key'); } });
  const s = await council.review('u1', novel(), { depth: 'QUICK' });
  assert.equal(s.status, 'DONE'); assert.equal(s.report!.source, 'local'); assert.match(s.report!.limits[0], /AI editors were unavailable/); assert.ok(s.report!.notes.length > 0);
});

test('route layer: tier comes from the server, the cap is enforced, bad payloads are refused', async () => {
  const { createEditorialCouncil, sanitizeManuscript } = await import('../services/editorial/council/editorialRoutes');
  assert.deepEqual(sanitizeManuscript({ kind: 'FICTION', chapters: [{ text: '' }] }), { error: 'There is no text to read.' });
  assert.match((sanitizeManuscript({ kind: 'FICTION', chapters: [{ text: 'word '.repeat(450000) }] }) as any).error, /over 400,000 words/);
  assert.equal((sanitizeManuscript({ kind: 'weird', chapters: [{ text: 'hello there world' }] }) as any).kind, 'FICTION');
  const mem = new Map<string, any>(); const store = { get: async (p: string) => mem.get(p) ?? null, set: async (p: string, o: any) => { mem.set(p, JSON.parse(JSON.stringify(o))); return true; }, list: async () => [] };
  const routes: Record<string, Function> = {}; const app = { get: (p: string, ...h: Function[]) => { routes['GET ' + p] = h[h.length - 1]; }, post: (p: string, ...h: Function[]) => { routes['POST ' + p] = h[h.length - 1]; } };
  const council = createEditorialCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model: async () => '{}', resolveTier: async () => 'FREE' });
  council.register(app);
  const call = async (body: any) => { let status = 200, out: any; await routes['POST /api/editorial/review']({ uid: 'u9', body: { ...body, tier: 'PRO' } }, { status(c: number) { status = c; return this; }, json(o: any) { out = o; } }); return { status, out }; };
  assert.equal((await call({})).status, 400);
  const ok1 = await call({ manuscript: novel(2, 300), depth: 'QUICK' }); assert.equal(ok1.status, 200); await call({ manuscript: novel(2, 300), depth: 'QUICK' });
  const third = await call({ manuscript: novel(2, 300), depth: 'QUICK' }); assert.equal(third.status, 429, 'FREE cap of 2, and the client-sent tier PRO is ignored'); assert.match(third.out.error, /offline read is always free/);
});

test('adapters: HTML to text, article desk reads the workbench without writing to it', () => {
  assert.equal(htmlToText('<p>One &amp; two</p><p>Three<br/>four</p>'), 'One & two\n\nThree\nfour');
  const claim = { id: '1', ownerId: 'u', articleId: 'a', text: 't', status: 'UNVERIFIED' as const, statusBy: 'heuristic:suggestion', statusAt: 1, sources: [] };
  const before = JSON.stringify(claim); const m = articleToManuscript({ title: 'T', text: 'body '.repeat(50), disclosures: { aiAssisted: false, sponsored: false, affiliateLinks: false, conflictOfInterest: false }, rights: [], imageRefs: [], claims: [claim] });
  assert.equal(JSON.stringify(claim), before); assert.equal(m.article!.claims![0].humanVerified, false);
  assert.ok(NOT_LEGAL_ADVICE.length > 20); assert.equal(DIMENSIONS.length, 8);
});
