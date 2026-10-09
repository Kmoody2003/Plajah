// editorialRights — local-first copyright & permissions checks and the Rights checklist.
//
// NOT LEGAL ADVICE. Everything here is a prompt to ask a better question or to go and look something up.
// Nothing here registers a copyright, determines fair use, or proves originality. The similarity helper compares
// two texts the CALLER supplies; it is not a plagiarism guarantee and does not search the web.
import { anchorAt, flatten, paragraphsOf, sentencesOf, wordCount, wordsOf, type Flat } from './editorialMetrics';
import { NOT_LEGAL_ADVICE, type Anchor, type ManuscriptInput, type RightsItem, type Severity } from './editorialTypes';

export const RIGHTS_DISCLAIMER = NOT_LEGAL_ADVICE;

/** Official orientation links. Each was fetched on 2026-10-08 unless marked otherwise in docs/EDITORIAL_COUNCIL.md. */
export const RIGHTS_LINKS: Array<{ label: string; url: string; region: string }> = [
  { label: 'U.S. Copyright Office: register a work', url: 'https://www.copyright.gov/registration/', region: 'United States' },
  { label: 'U.S. Copyright Office: Fair Use Index', url: 'https://www.copyright.gov/fair-use/', region: 'United States' },
  { label: 'WIPO: copyright overview (international orientation)', url: 'https://www.wipo.int/copyright/en/', region: 'International' },
];

const fp = (kind: string, s: string) => { let h = 5381; const t = `${kind}:${s.toLowerCase().replace(/\s+/g, ' ').slice(0, 120)}`; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return `${kind}-${h.toString(36)}`; };
const item = (id: string, severity: Severity, title: string, why: string, nextSteps: string[], seed: string, anchor?: Anchor): RightsItem => ({ id, severity, title, why, nextSteps, anchor, fingerprint: fp(id, seed) });

/* ─── Quoted text: long verbatim quotes, epigraphs, lyric-like lines ───────────────────────── */
export function detectLongQuotes(flat: Flat, minWords = 45): Array<{ start: number; end: number; words: number }> {
  const out: Array<{ start: number; end: number; words: number }> = []; const re = /["“]([^"”]{10,3000})["”]/g; let m: RegExpExecArray | null;
  while ((m = re.exec(flat.text))) { const w = wordCount(m[1]); if (w >= minWords) out.push({ start: m.index, end: m.index + m[0].length, words: w }); }
  return out;
}
export function detectEpigraphs(m: ManuscriptInput): Array<{ chapterTitle: string; start: number; line: string }> {
  const out: Array<{ chapterTitle: string; start: number; line: string }> = [];
  for (const c of m.chapters) {
    const head = c.text.replace(/\r/g, '').split('\n').filter(l => l.trim()).slice(0, 6);
    const attr = head.findIndex(l => /^\s*(?:[—–-]{1,2}|~)\s*[A-Z][\w.'’ -]{2,60}/.test(l) && wordCount(l) <= 14);
    if (attr > 0 && attr <= 4) out.push({ chapterTitle: c.title, start: 0, line: head.slice(0, attr + 1).join(' ') });
    else if (/\bepigraph\b/i.test(c.title)) out.push({ chapterTitle: c.title, start: 0, line: head.join(' ') });
  }
  return out;
}
/** Runs of three or more short, unpunctuated, capitalised lines in a prose book look like verse or lyrics. */
export function detectLyricLike(flat: Flat): Array<{ start: number; end: number; lines: number }> {
  const out: Array<{ start: number; end: number; lines: number }> = []; const lines: Array<{ t: string; start: number; end: number }> = []; let pos = 0;
  for (const l of flat.text.split('\n')) { lines.push({ t: l, start: pos, end: pos + l.length }); pos += l.length + 1; }
  const short = (l: { t: string }) => { const t = l.t.trim(); const w = wordCount(t); return w >= 2 && w <= 10 && /^[A-Z"“(]/.test(t) && !/[.!?]["”]?$/.test(t) === true || /[♪♫]/.test(t); };
  let i = 0; while (i < lines.length) { if (short(lines[i])) { let j = i; while (j + 1 < lines.length && short(lines[j + 1])) j++; if (j - i + 1 >= 3) out.push({ start: lines[i].start, end: lines[j].end, lines: j - i + 1 }); i = j + 1; } else i++; }
  return out;
}
const SONG_CUES = /\b(?:lyrics?|song|singing|sang|chorus|verse|refrain|hummed|sings)\b/i;

/* ─── Marks, people, public domain ──────────────────────────────────────────────────────────── */
const MARKS = ['Coca-Cola', 'Pepsi', 'Disney', 'Marvel', 'Harry Potter', 'Star Wars', 'Star Trek', 'Barbie', 'Lego', 'Nike', 'Pokemon', 'Pokémon', 'Hello Kitty', 'Kleenex', 'Xerox', 'Band-Aid', 'Jeep', 'Uber', 'Airbnb', 'Google', 'iPhone', 'Facebook', 'Instagram', 'TikTok', 'Netflix', 'Tesla', 'Amazon', 'Hogwarts', 'Jedi', 'Mickey Mouse', 'Spider-Man', 'Batman', 'Superman', 'Game of Thrones', 'Monopoly', 'Lord of the Rings', 'Twilight', 'Hunger Games', 'Minecraft', 'Fortnite'];
export function trademarkInTitle(title: string): string[] { const t = title.toLowerCase(); return MARKS.filter(k => new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t)); }

const NOT_PERSON = new Set(['New York', 'United States', 'United Kingdom', 'Los Angeles', 'San Francisco', 'Hong Kong', 'South Africa', 'North America', 'South America', 'Middle East', 'Latin America', 'New Zealand', 'New Orleans', 'Las Vegas', 'Saint Louis', 'Washington Post', 'New Year', 'Good Friday', 'Old Testament', 'New Testament', 'Supreme Court', 'White House', 'Wall Street', 'Black Friday', 'Mother Teresa']);
const PERSON_PREFIX = /^(?:The|A|An|In|On|At|Of|And|But|For|From|With|When|After|Before|Then|Chapter|Part|Book|Section|Mr|Mrs|Ms|Dr|Mount|Lake|Fort|Port|Saint|North|South|East|West|Great|Little|Old|New)$/;
/** Capitalised two- or three-word sequences that look like personal names, mid-sentence, with counts. */
export function personNames(text: string, limit = 12): Array<{ name: string; count: number; first: number }> {
  const re = /(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,}(?:\s+[A-Z]\.)?\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g; const seen = new Map<string, { name: string; count: number; first: number }>(); let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]; const parts = name.split(/\s+/); if (PERSON_PREFIX.test(parts[0]) || NOT_PERSON.has(name)) continue;
    if (parts.some(p => /^(?:Street|Avenue|Road|City|County|Island|Bridge|Church|Hospital|University|College|School|Company|Corporation|River|Mountain|Park|Bay|Beach|Hotel|Airport|Station|Center|Centre|Valley|Forest)$/.test(p))) continue;
    const e = seen.get(name); if (e) e.count++; else seen.set(name, { name, count: 1, first: m.index });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.first - b.first).slice(0, limit);
}

export interface PublicDomainHint { status: 'LIKELY_PUBLIC_DOMAIN_US' | 'LIKELY_STILL_PROTECTED_US' | 'UNKNOWN'; cutoffYear: number; message: string; lifePlus70Year?: number }
/** US rule of thumb: works published up to 95 years ago are public domain (so, in year Y, published in or before Y-96 on Jan 1). Many countries use life + 70. */
export function publicDomainHint(input: { publicationYear?: number; authorDeathYear?: number; now?: Date }): PublicDomainHint {
  const year = (input.now ?? new Date()).getUTCFullYear(); const cutoffYear = year - 96;
  const l70 = input.authorDeathYear ? input.authorDeathYear + 70 : undefined;
  if (!input.publicationYear) return { status: 'UNKNOWN', cutoffYear, message: `Give a publication year. As a rule of thumb for the United States, works first published in ${cutoffYear} or earlier are in the public domain as of ${year}.`, lifePlus70Year: l70 };
  if (input.publicationYear <= cutoffYear) return { status: 'LIKELY_PUBLIC_DOMAIN_US', cutoffYear, lifePlus70Year: l70, message: `A work first published in ${input.publicationYear} is likely public domain in the United States (cutoff ${cutoffYear} in ${year}). Other countries often use life + 70 years${l70 ? ` (protected until about ${l70})` : ''}. A modern translation, edition, introduction or illustration may have its own copyright.` };
  return { status: 'LIKELY_STILL_PROTECTED_US', cutoffYear, lifePlus70Year: l70, message: `A work first published in ${input.publicationYear} is probably still protected in the United States (cutoff ${cutoffYear} in ${year}). Check renewal and notice rules for older works, or ask the rights holder for permission.` };
}
/** Link to look a candidate up on Project Gutenberg. We do not fetch it here. */
export const gutenbergSearchUrl = (query: string) => `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(query.slice(0, 120))}`;

/* ─── Similarity hook (interface + a local, caller-supplied comparison) ─────────────────────── */
export interface SimilarityResult { checker: string; comparedAgainst: string; sharedShingleRatio: number; longestSharedRun: number; sharedPassages: Array<{ text: string; words: number }>; caveat: string }
export interface SimilarityChecker { name: string; check(text: string, against: { label: string; text: string }): Promise<SimilarityResult> | SimilarityResult }
export const SIMILARITY_CAVEAT = 'Not a plagiarism guarantee. This only compares your text with the specific text you supplied, using exact word sequences. It cannot find paraphrase, translation, or sources it was not given, and shared phrases are often common expressions or fair quotation.';
export const shingleSimilarity: SimilarityChecker = {
  name: 'Local word-sequence overlap',
  check(text, against) {
    const N = 6; const a = wordsOf(text.toLowerCase()), b = wordsOf(against.text.toLowerCase());
    if (a.length < N || b.length < N) return { checker: 'Local word-sequence overlap', comparedAgainst: against.label, sharedShingleRatio: 0, longestSharedRun: 0, sharedPassages: [], caveat: SIMILARITY_CAVEAT };
    const bSet = new Set<string>(); for (let i = 0; i + N <= b.length; i++) bSet.add(b.slice(i, i + N).join(' '));
    let shared = 0, run = 0, best = 0, bestEnd = -1; const hits: boolean[] = [];
    for (let i = 0; i + N <= a.length; i++) { const h = bSet.has(a.slice(i, i + N).join(' ')); hits.push(h); if (h) { shared++; run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; }
    const passages: Array<{ text: string; words: number }> = []; let i = 0;
    while (i < hits.length && passages.length < 5) { if (hits[i]) { let j = i; while (j + 1 < hits.length && hits[j + 1]) j++; const w = j - i + N; if (w >= 12) passages.push({ text: a.slice(i, j + N).join(' '), words: w }); i = j + 1; } else i++; }
    return { checker: 'Local word-sequence overlap', comparedAgainst: against.label, sharedShingleRatio: shared / Math.max(1, hits.length), longestSharedRun: best ? best + N - 1 : 0, sharedPassages: passages, caveat: SIMILARITY_CAVEAT };
  },
};

/* ─── The checklist ─────────────────────────────────────────────────────────────────────────── */
export interface RightsChecklist { disclaimer: string; items: RightsItem[]; links: typeof RIGHTS_LINKS; publicDomain: string; basics: string[] }

export function rightsReview(m: ManuscriptInput, flat: Flat = flatten(m.chapters)): RightsChecklist {
  const items: RightsItem[] = []; const meta = m.meta || {};
  const journalistic = m.kind === 'ARTICLE' || m.kind === 'NEWSLETTER';

  for (const q of detectLongQuotes(flat).slice(0, 6)) {
    const a = anchorAt(flat, q.start, q.end);
    items.push(item('long-quote', 'Risk', `A ${q.words}-word quotation`, 'A long passage inside quotation marks. If it is from someone else\'s published work it may need permission, or at least a clear fair-use rationale (purpose, nature of the work, amount used, effect on the market). If it is a character speaking, ignore this.', ['If it is another writer\'s words: cite the source and decide whether to shorten it, paraphrase it, or ask for permission.', 'If it is public domain or your own earlier work, say so in your notes so a later reader can see you checked.', 'If you keep a long quotation under fair use, keep a note of your reasoning and consider a short conversation with an attorney.'], a.quote, a));
  }
  for (const e of detectEpigraphs(m).slice(0, 6)) items.push(item('epigraph', 'Risk', `An epigraph in "${e.chapterTitle}"`, 'Epigraphs from published work are quoted verbatim by design. Short prose epigraphs are commonly used with credit; poetry and song lyrics are the cases publishers most often ask permission for.', ['Check whether the source is in the public domain.', 'If it is a poem or lyric, ask the rights holder (publisher or music publisher) for permission, or swap in a public-domain line or your own.', 'Credit author and work either way.'], e.line));
  const verse = detectLyricLike(flat);
  if (m.kind !== 'POETRY') for (const v of verse.slice(0, 5)) {
    const a = anchorAt(flat, v.start, v.end);
    const song = SONG_CUES.test(flat.text.slice(Math.max(0, v.start - 300), v.end + 100));
    items.push(item('lyric-like', 'Risk', song ? 'Lines that look like song lyrics' : `${v.lines} short lines that look like verse`, 'Consecutive short unpunctuated lines in a prose book often turn out to be a poem or a song lyric. Quoting even a few lines of a recorded song normally requires a licence; the law does not treat lyrics as casually as prose.', ['If it is yours, mark it in your notes as original verse.', 'If it is someone else\'s, ask the music publisher or poet\'s publisher, or describe the song instead of quoting it.', 'If it is old enough to be public domain, check the date and the specific version.'], a.quote, a));
  }
  if (m.kind === 'POETRY') items.push(item('poetry-sources', 'Risk', 'Check every borrowed line in a poetry book', 'Poems that quote, remix or answer another poem (centos, erasures, glosses, epigraphs) are the poetry cases most likely to need permission or a clear credit.', ['List every borrowed line and its source.', 'Credit the source in the notes or acknowledgements.', 'For anything still protected, ask permission or check with an attorney.'], 'poetry'));

  const marks = m.title ? trademarkInTitle(m.title) : [];
  if (marks.length) items.push(item('trademark-title', 'Risk', `The title contains a name that may be a trademark: ${marks.join(', ')}`, 'Using someone else\'s brand or franchise name in a title can confuse buyers about who made the book. Titles are not copyrightable, but trademark and unfair-competition rules can still matter.', ['Consider whether the name is essential to the title or just evocative.', 'Add a clear note that the book is unofficial and independent if you keep it, and think about the cover design.', 'Ask an attorney before you launch if the name is a major franchise.'], marks.join(',')));

  const names = (m.kind === 'FICTION' || m.kind === 'SERIAL' || m.kind === 'YOUNG_READERS' || m.kind === 'POETRY') ? [] : personNames(flat.text, 8);
  if (names.length) items.push(item('real-people', 'Risk', 'Named people to think about (defamation and privacy)', `These look like personal names: ${names.map(n => `${n.name} (x${n.count})`).join(', ')}. For any real, living person who is identifiable, the questions are: is each statement true and provable, is it clearly fact versus opinion, and would the person be harmed by exposure of something private that the public has no real need to know?`, ['For each real person, mark what you can document (records, messages, interviews) and what rests on memory.', 'Consider changing names, details or order of events, and say so in an author\'s note, if you cannot document it.', 'For serious allegations about a living person, talk to a qualified attorney before publishing.'], names.map(n => n.name).join(','), anchorAt(flat, names[0].first, names[0].first + names[0].name.length)));

  if (!journalistic) {
    if (meta.aiText && meta.aiText !== 'none' && !(meta.aiTools || '').trim()) items.push(item('ai-tools', 'Clarity', 'You marked AI use for text but did not say how', 'Stores and readers increasingly want to know when AI wrote or generated text or images. Saying what the tool did is clearer than a bare tick-box.', ['Name the tool and what it did (drafting, editing, translation, ideas).', 'Keep your prompts or drafts if the platform asks for evidence.', 'Check the specific store\'s current AI-disclosure policy.'], 'ai-tools'));
    if (meta.aiImages && meta.aiImages !== 'none' && !(meta.aiTools || '').trim()) items.push(item('ai-image-tools', 'Clarity', 'AI images are marked but not described', 'The same applies to cover art and illustrations. Many tools also have licence terms of their own about commercial use.', ['Name the tool and read its commercial terms.', 'Record the date and the plan you used.'], 'ai-image-tools'));
    if (!meta.copyrightHolder?.trim()) items.push(item('holder', 'Clarity', 'No copyright holder is named', 'A clear holder and year on the copyright page tells readers and stores who to ask. Under the Berne Convention copyright arises automatically on creation in most countries; registration is a separate, optional step in many places and mandatory before suing in some.', ['Add your name or pen-name rights holder and the year.', 'Choose a licence (all rights reserved or a Creative Commons licence) deliberately.'], 'holder'));
    if (!meta.license) items.push(item('license', 'Clarity', 'No licence choice recorded', 'If you do not choose, "all rights reserved" is the usual default. Creative Commons licences can allow sharing; some are not reversible once you publish.', ['Decide whether you want to allow sharing or remixing.', 'Read what each licence means before picking.'], 'license'));
    if (meta.isbnMode === 'none') items.push(item('isbn', 'Clarity', 'No ISBN plan', 'An ISBN is an identifier for retail and library systems; it is not a copyright registration and it does not prove ownership. Some stores supply one; others require your own.', ['Check each store\'s ISBN rules.', 'Buy your own if you want to be the publisher of record.'], 'isbn'));
  }

  if (journalistic) {
    const a = m.article; const d = a?.disclosures;
    const missing = (a?.imageRefs ?? []).filter(r => { const x = a?.imageRights?.find(y => y.ref === r); return !x || !x.credit.trim() || !x.license; });
    if (missing.length) items.push(item('image-credit', 'Risk', `${missing.length} image${missing.length > 1 ? 's' : ''} without a complete credit and rights basis`, 'A credit line and a basis for use (owned, licensed, public domain, Creative Commons, or a claim of fair use) are the minimum a reader or rights holder would expect to see.', ['Add a credit line for each.', 'Record where you got the image and under what terms.', 'Replace any image whose rights you cannot explain.'], missing.join(',')));
    if (a?.imageRights?.some(r => r.license === 'AI_GENERATED') && !d?.aiAssisted) items.push(item('ai-image-disclosure', 'Clarity', 'An image is marked AI-generated but the article does not disclose AI use', 'Readers generally expect to be told when an image is synthetic.', ['Tick the AI disclosure and say what the AI made.'], 'ai-image'));
    if (a?.aiUsedInEditor && !d?.aiAssisted) items.push(item('ai-origin', 'Clarity', 'AI tools were used in this draft but the AI disclosure is off', 'The editor recorded AI help in this session. Whether you disclose is your newsroom policy; transparency about method is a core value in journalism ethics codes.', ['Turn the disclosure on and say plainly what the AI did.', 'Or, if you rewrote the AI-assisted text yourself, record that decision in your notes.'], 'ai-origin'));
  }

  const dedup = new Map<string, RightsItem>(); for (const i of items) dedup.set(i.fingerprint, i);
  const pd = 'If your book includes older public-domain material, check each specific edition and translation: the underlying work may be free to use while a modern edition, translation, introduction or illustration is not. Project Gutenberg lists items it considers public domain in the United States.';
  return {
    disclaimer: RIGHTS_DISCLAIMER, items: [...dedup.values()], links: RIGHTS_LINKS, publicDomain: pd,
    basics: [
      'Copyright in most countries arises automatically when you fix an original work; registration is separate. The Council does not register copyright. See the official pages below for how it works in your country.',
      'Fair use (United States) and fair dealing (UK, Canada and others) are defences judged case by case, not permissions. The four U.S. factors are purpose and character, nature of the work, amount used, and market effect.',
      'A takedown notice under the U.S. DMCA is a formal complaint; if you receive one or want to send one, read the official guidance and consider an attorney.',
    ],
  };
}

export { paragraphsOf, sentencesOf };
