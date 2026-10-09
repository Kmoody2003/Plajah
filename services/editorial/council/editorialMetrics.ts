// editorialMetrics — deterministic, model-free readings of a manuscript.
//
// RULE: a metric is an observation with an explanation, never a verdict. Every reading says what was counted,
// why an editor might care, and when it is perfectly fine to ignore it (a thriller SHOULD have short
// sentences; a memoir may live in the passive on purpose). Anchors point at real passages so the author can
// check the machine's count against their own eye. Pure TypeScript: runs in the browser, a worker or node.
import { isPassiveSentence } from '../../journalist/styleChecker';
import type { Anchor, ManuscriptChapterInput, ManuscriptInput, ManuscriptKind, MetricReading } from './editorialTypes';

/* ─── Flattening: one text with chapter offsets, so every anchor is checkable ──────────────── */
export interface FlatChapter { id: string; title: string; kind: string; start: number; end: number; text: string; words: number }
export interface Flat { text: string; chapters: FlatChapter[] }
export const CHAPTER_GAP = '\n\n';

export function flatten(chapters: ManuscriptChapterInput[]): Flat {
  const out: FlatChapter[] = []; let text = '';
  for (const c of chapters) {
    const t = (c.text || '').replace(/\r\n?/g, '\n');
    if (text) text += CHAPTER_GAP;
    const start = text.length; text += t;
    out.push({ id: c.id, title: c.title, kind: c.kind || 'chapter', start, end: text.length, text: t, words: wordsOf(t).length });
  }
  return { text, chapters: out };
}
export const wordsOf = (t: string): string[] => t.match(/[A-Za-zÀ-ɏЀ-ӿ][A-Za-zÀ-ɏЀ-ӿ'’-]*|\d[\d,.]*/g) || [];
export const wordCount = (t: string) => wordsOf(t).length;

export function chapterAt(flat: Flat, offset: number): FlatChapter | undefined { return flat.chapters.find(c => offset >= c.start && offset <= c.end); }
export function anchorAt(flat: Flat, start: number, end: number, max = 220): Anchor {
  const c = chapterAt(flat, start);
  const quote = flat.text.slice(start, Math.min(end, start + max)).replace(/\s+/g, ' ').trim();
  return { chapterId: c?.id, chapterTitle: c?.title, start, end, quote };
}
/** Find a model-supplied quote in the real text. A quote the manuscript does not contain is not an anchor. */
export function locateQuote(flat: Flat, quote: string): Anchor | undefined {
  const q = quote.replace(/\s+/g, ' ').trim(); if (q.length < 12) return undefined;
  let i = flat.text.indexOf(q);
  if (i < 0) { // tolerate whitespace and curly-quote differences
    const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
    const map: number[] = []; let n = '';
    for (let k = 0; k < flat.text.length; k++) { const ch = norm(flat.text[k]); if (ch === ' ' && n.endsWith(' ')) continue; n += ch; map.push(k); }
    const j = n.indexOf(norm(q)); if (j < 0) return undefined;
    i = map[j]; const endIdx = map[Math.min(j + norm(q).length - 1, map.length - 1)] + 1;
    return anchorAt(flat, i, endIdx);
  }
  return anchorAt(flat, i, i + q.length);
}

/* ─── Sentences ─────────────────────────────────────────────────────────────────────────────── */
export interface Sentence { text: string; start: number; end: number; words: number }
const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Inc|Ltd|Co)\.$/;
export function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = []; const re = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n|$)/g; let m: RegExpExecArray | null; let carry: { s: string; start: number } | null = null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    let s = m[0]; let start = m.index;
    if (carry) { s = carry.s + s; start = carry.start; carry = null; }
    if (ABBREV.test(s.trim())) { carry = { s, start }; continue; }
    const t = s.trim(); if (!t) continue;
    out.push({ text: t, start: start + (s.length - s.trimStart().length), end: start + s.length, words: wordCount(t) });
  }
  if (carry) { const t = carry.s.trim(); if (t) out.push({ text: t, start: carry.start, end: carry.start + carry.s.length, words: wordCount(t) }); }
  return out;
}
export function paragraphsOf(text: string): Array<{ text: string; start: number; end: number; words: number }> {
  const out: Array<{ text: string; start: number; end: number; words: number }> = []; const re = /[^\n]+/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m[0].trim()) out.push({ text: m[0], start: m.index, end: m.index + m[0].length, words: wordCount(m[0]) }); }
  return out;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const r1 = (x: number) => (Math.round(x * 10) / 10).toString();

/* ─── Readability ───────────────────────────────────────────────────────────────────────────── */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
  const g = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, g ? g.length : 1);
}
export function readability(text: string): { fleschReadingEase: number; gradeLevel: number; words: number; sentences: number } {
  const ws = wordsOf(text).filter(w => /[A-Za-z]/.test(w)); const ss = sentencesOf(text);
  if (!ws.length || !ss.length) return { fleschReadingEase: 0, gradeLevel: 0, words: ws.length, sentences: ss.length };
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  const wps = ws.length / ss.length, spw = syl / ws.length;
  return { fleschReadingEase: 206.835 - 1.015 * wps - 84.6 * spw, gradeLevel: 0.39 * wps + 11.8 * spw - 15.59, words: ws.length, sentences: ss.length };
}

/* ─── Lexicons ──────────────────────────────────────────────────────────────────────────────── */
const FILTER_WORDS = ['felt', 'feel', 'feeling', 'saw', 'heard', 'noticed', 'realized', 'realised', 'seemed', 'wondered', 'thought', 'watched', 'knew', 'decided', 'could see', 'could hear', 'could feel'];
const EMOTION = '(?:sad|angry|happy|afraid|scared|nervous|anxious|furious|jealous|embarrassed|ashamed|excited|lonely|depressed|guilty|worried|terrified|annoyed|upset|proud|bored)';
const TELL_PATTERNS: Array<[RegExp, string]> = [
  [new RegExp(`\\b(?:she|he|they|I|we)\\s+(?:was|were|am|felt|feel|seemed)\\s+(?:very\\s+|so\\s+|really\\s+|extremely\\s+)?${EMOTION}\\b`, 'gi'), 'names the emotion instead of showing it'],
  [new RegExp(`\\b(?:was|were)\\s+(?:a\\s+)?(?:very\\s+)?(?:kind|cruel|selfish|generous|brave|cowardly|stubborn|lazy|clever)\\s+(?:man|woman|person|boy|girl)\\b`, 'gi'), 'states a trait instead of dramatising it'],
  [/\b(?:it was obvious|it was clear|everyone knew|he could tell|she could tell)\b/gi, 'tells the reader what to conclude'],
];
const STOP = new Set('the a an and or but of to in on at for with as by from that this these those it its is are was were be been being he she they we you i his her their our my your not no so if then than when while which who whom what there here up out into over after before just very'.split(' '));

/* ─── The metrics ───────────────────────────────────────────────────────────────────────────── */
export interface MetricContext { kind: ManuscriptKind }

function sentenceVariance(flat: Flat): MetricReading[] {
  const ss = sentencesOf(flat.text).filter(s => s.words >= 2); if (ss.length < 15) return [];
  const lens = ss.map(s => s.words); const m = mean(lens), sd = stdev(lens), cv = sd / (m || 1);
  const longest = ss.reduce((a, b) => (b.words > a.words ? b : a));
  return [{
    name: 'Sentence length and rhythm', value: `average ${r1(m)} words, spread ${r1(sd)} (${cv < 0.45 ? 'quite even' : cv > 0.8 ? 'very varied' : 'varied'}); longest ${longest.words} words`,
    explanation: 'Counts words per sentence. An even length can read as monotone and a wild spread as uneven, but a thriller wants short sentences and a lyrical novel may want long ones. The longest sentence is anchored so you can judge whether it earns its length.',
    where: anchorAt(flat, longest.start, longest.end),
  }];
}
function paragraphShape(flat: Flat): MetricReading[] {
  const ps = paragraphsOf(flat.text); if (ps.length < 10) return [];
  const lens = ps.map(p => p.words); const m = mean(lens), sd = stdev(lens); const big = ps.reduce((a, b) => (b.words > a.words ? b : a));
  return [{ name: 'Paragraph length', value: `average ${r1(m)} words, spread ${r1(sd)}; longest ${big.words} words`, explanation: 'Counts words per paragraph. Very long blocks are heavy on a phone screen; a run of one-line paragraphs can feel breathless. Neither is wrong, but the shape is a pacing signal worth looking at.', where: big.words > 200 ? anchorAt(flat, big.start, big.end) : undefined }];
}
function readabilityReading(flat: Flat): MetricReading[] {
  const r = readability(flat.text); if (r.words < 150) return [];
  const band = r.fleschReadingEase >= 80 ? 'very easy to read' : r.fleschReadingEase >= 60 ? 'plain-English' : r.fleschReadingEase >= 40 ? 'moderately dense' : 'dense';
  return [{ name: 'Readability', value: `Flesch reading ease ${Math.round(r.fleschReadingEase)} (${band}), roughly US grade ${Math.max(0, Math.round(r.gradeLevel))}`, explanation: 'A formula built from sentence length and syllables per word. It measures surface difficulty only, not quality or meaning: a children\'s book and a scholarly monograph should score differently.' }];
}
function adverbs(flat: Flat): MetricReading[] {
  const ws = wordsOf(flat.text); if (ws.length < 300) return [];
  const ly = ws.filter(w => /^[a-z]{4,}ly$/i.test(w) && !/^(only|family|early|likely|lonely|friendly|lovely|silly|holy|belly|ugly|bully|jelly|reply|supply|apply|fly|july|italy|rely)$/i.test(w));
  const rate = ly.length / ws.length;
  const re = /\b[a-z]{4,}ly\b/gi; let m: RegExpExecArray | null; let where: Anchor | undefined; let best = 0;
  while ((m = re.exec(flat.text))) { const w = m[0]; if (!ly.includes(w) && !ly.map(x => x.toLowerCase()).includes(w.toLowerCase())) continue; const c = (flat.text.slice(m.index, m.index + 160).match(/\b[a-z]{4,}ly\b/gi) || []).length; if (c > best) { best = c; where = anchorAt(flat, m.index, Math.min(flat.text.length, m.index + 160)); } }
  return [{ name: 'Adverb density', value: `${ly.length} -ly adverbs, ${pct(rate)} of words${best > 1 ? `; densest stretch has ${best} close together` : ''}`, explanation: 'Counts words ending in "-ly". Some editors read heavy adverb use as a sign the verb could do the work; many acclaimed writers use them freely. This is a prompt to look, not a fault.', where: best > 1 ? where : undefined }];
}
function filterWords(flat: Flat): MetricReading[] {
  const total = wordCount(flat.text); if (total < 300) return [];
  const re = new RegExp(`\\b(?:${FILTER_WORDS.map(w => w.replace(' ', '\\s+')).join('|')})\\b`, 'gi'); const hits: number[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(flat.text))) hits.push(m.index);
  const rate = hits.length / total;
  // densest 400-char window
  let bestI = -1, bestC = 0; for (let i = 0; i < hits.length; i++) { let c = 1; while (i + c < hits.length && hits[i + c] - hits[i] < 400) c++; if (c > bestC) { bestC = c; bestI = i; } }
  return [{ name: 'Filter words', value: `${hits.length} (${pct(rate)} of words)${bestC >= 3 ? `; densest stretch has ${bestC} within 400 characters` : ''}`, explanation: 'Counts words that put a perceiver between the reader and the scene ("she felt", "he noticed", "I saw"). In close third or first person they can create distance; they are also how a narrator can be honest about not knowing. Ignore them where the distance is the point.', where: bestC >= 3 ? anchorAt(flat, hits[bestI], hits[bestI] + 400) : undefined }];
}
export function dialogueShare(text: string): { ratio: number; dialogueWords: number; spans: Array<{ start: number; end: number }> } {
  const spans: Array<{ start: number; end: number }> = []; const re = /["“]([^"”\n]{1,600})["”]/g; let m: RegExpExecArray | null; let dw = 0;
  while ((m = re.exec(text))) { spans.push({ start: m.index, end: m.index + m[0].length }); dw += wordCount(m[1]); }
  const total = wordCount(text);
  return { ratio: total ? dw / total : 0, dialogueWords: dw, spans };
}
function dialogue(flat: Flat, ctx: MetricContext): MetricReading[] {
  if (ctx.kind === 'POETRY' || wordCount(flat.text) < 500) return [];
  const d = dialogueShare(flat.text); const per = flat.chapters.filter(c => c.words > 300).map(c => ({ c, r: dialogueShare(c.text).ratio }));
  const spread = per.length >= 3 ? ` Chapter by chapter it ranges from ${pct(Math.min(...per.map(p => p.r)), 0)} to ${pct(Math.max(...per.map(p => p.r)), 0)}.` : '';
  return [{ name: 'Dialogue share', value: `${pct(d.ratio)} of words are inside quotation marks`, explanation: `Counts words inside straight or curly double quotes.${spread} Fiction often sits between a fifth and half; memoir and non-fiction far lower; a long stretch with none or all can feel like a pacing choice worth confirming.` }];
}
function repetition(flat: Flat): MetricReading[] {
  const ws = wordsOf(flat.text.toLowerCase()); if (ws.length < 800) return [];
  const N = 4; const counts = new Map<string, number>();
  for (let i = 0; i + N <= ws.length; i++) { const g = ws.slice(i, i + N); if (g.filter(w => !STOP.has(w)).length < 2) continue; const k = g.join(' '); counts.set(k, (counts.get(k) || 0) + 1); }
  const rep = [...counts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5); if (!rep.length) return [];
  const [phrase, c] = rep[0]; const idx = flat.text.toLowerCase().indexOf(phrase);
  return [{ name: 'Repeated phrases', value: rep.map(([p, n]) => `"${p}" x${n}`).join('; '), explanation: 'Finds four-word sequences (ignoring very common words) used three or more times. Refrain and ritual are legitimate devices, especially in oral and lyrical writing; unconscious tics are not. Only you know which this is.', where: idx >= 0 ? anchorAt(flat, idx, idx + phrase.length + 40) : undefined }].map(x => ({ ...x, value: `${x.value}` })) as MetricReading[];
}
function passive(flat: Flat): MetricReading[] {
  const ss = sentencesOf(flat.text).filter(s => s.words >= 5); if (ss.length < 30) return [];
  const hits = ss.filter(s => isPassiveSentence(s.text).passive); const rate = hits.length / ss.length;
  return [{ name: 'Passive voice', value: `${hits.length} of ${ss.length} sentences (${pct(rate)}) look passive`, explanation: 'A pattern match for "was/were + past participle". It will miss some and misfire on some adjectives. Passive is often the right choice (unknown actor, emphasis on the receiver) and is normal in reporting and academic prose.', where: hits.length ? anchorAt(flat, hits[0].start, hits[0].end) : undefined }];
}
function pacingCurve(flat: Flat): MetricReading[] {
  const cs = flat.chapters.filter(c => c.kind === 'chapter' && c.words > 0); if (cs.length < 4) return [];
  const lens = cs.map(c => c.words); const m = mean(lens), sd = stdev(lens);
  const longest = cs.reduce((a, b) => (b.words > a.words ? b : a)); const shortest = cs.reduce((a, b) => (b.words < a.words ? b : a));
  const third = Math.ceil(cs.length / 3); const open = mean(lens.slice(0, third)), mid = mean(lens.slice(third, third * 2)), end = mean(lens.slice(third * 2));
  const shape = mid > open * 1.35 && mid > end * 1.35 ? 'the middle runs longest' : end < open * 0.7 ? 'chapters shorten toward the end' : open < end * 0.7 ? 'chapters lengthen toward the end' : 'fairly steady';
  return [{ name: 'Chapter-length curve', value: `${cs.length} chapters, average ${Math.round(m)} words; shortest "${shortest.title}" (${shortest.words}), longest "${longest.title}" (${longest.words}); ${shape}`, explanation: 'Compares chapter lengths. Shorter chapters read as faster, and a long saggy middle is a common place for readers to leave. It cannot see what happens inside a chapter. A deliberate slow chapter is fine.', where: anchorAt(flat, longest.start, Math.min(longest.end, longest.start + 200)) }, ...(sd / (m || 1) > 1 ? [] : [])];
}
const OPEN_PEOPLE = /^(?:i|he|she|they|we)\b/i;
export interface OpeningRead { chapter: FlatChapter; first: string; signals: string[]; flags: string[]; anchor: Anchor }
export function chapterOpenings(flat: Flat): OpeningRead[] {
  const out: OpeningRead[] = [];
  for (const c of flat.chapters) {
    if (c.kind !== 'chapter' || c.words < 80) continue;
    const ss = sentencesOf(c.text).slice(0, 3); if (!ss.length) continue; const first = ss[0]; const ft = first.text; const signals: string[] = [], flags: string[] = [];
    if (/^["“]/.test(ft)) signals.push('opens in dialogue');
    if (ss.slice(0, 3).some(s => /\?/.test(s.text))) signals.push('poses a question');
    if (first.words <= 10) signals.push('short, direct first line');
    if (/\b\d+\b/.test(ft) || /\b(?:blood|gun|dead|died|killed|scream|fire|run|ran|fell|crash|door|knife)\b/i.test(ft)) signals.push('concrete or high-stakes detail');
    if (/^(?:it was|there was|there were|the sun|the morning|the day|the weather)\b/i.test(ft)) flags.push('begins with scene-setting or weather');
    if (/^(?:she|he|i)\s+(?:woke|awoke|opened (?:her|his|my) eyes|got out of bed)/i.test(ft)) flags.push('begins with waking up');
    if (first.words > 35) flags.push('very long first sentence');
    out.push({ chapter: c, first: ft, signals, flags, anchor: anchorAt(flat, c.start + first.start, c.start + first.end) });
  }
  return out;
}
function hooks(flat: Flat): MetricReading[] {
  const o = chapterOpenings(flat); if (o.length < 3) return [];
  const withSignal = o.filter(x => x.signals.length).length; const flagged = o.filter(x => x.flags.length);
  return [{ name: 'Chapter openings', value: `${withSignal} of ${o.length} chapters open with a question, dialogue, a short line or a concrete detail${flagged.length ? `; ${flagged.length} begin with scene-setting, waking, or a very long first sentence` : ''}`, explanation: 'Looks at the first sentences of each chapter for common "hook" signals. A quiet opening can be exactly right; this just shows where a reader meets a chapter cold, which matters most in serials and sample downloads.', where: flagged[0]?.anchor }];
}
export interface PovRead { chapter: FlatChapter; firstPerson: number; thirdPerson: number; mixed: boolean }
export function povReads(flat: Flat): PovRead[] {
  return flat.chapters.filter(c => c.kind === 'chapter' && c.words > 200).map(c => {
    const narration = c.text.replace(/["“][^"”\n]*["”]/g, ' ');
    const fp = (narration.match(/\b(?:I|me|my|mine|myself)\b/g) || []).length; const tp = (narration.match(/\b(?:he|she|him|her|his|hers|they|them|their)\b/gi) || []).length;
    const tot = fp + tp; const minority = Math.min(fp, tp) / (tot || 1);
    return { chapter: c, firstPerson: fp, thirdPerson: tp, mixed: tot > 30 && minority > 0.25 && Math.min(fp, tp) > 10 };
  });
}
function povDrift(flat: Flat, ctx: MetricContext): MetricReading[] {
  if (ctx.kind === 'POETRY' || ctx.kind === 'ARTICLE' || ctx.kind === 'NEWSLETTER') return [];
  const reads = povReads(flat); if (reads.length < 2) return [];
  const mixed = reads.filter(r => r.mixed);
  const fpCh = reads.filter(r => r.firstPerson > r.thirdPerson).length; const swing = fpCh > 0 && fpCh < reads.length;
  if (!mixed.length && !swing) return [];
  return [{ name: 'Point-of-view drift (heuristic)', value: mixed.length ? `${mixed.length} chapter${mixed.length > 1 ? 's' : ''} mix first-person and third-person pronouns in narration` : `${fpCh} of ${reads.length} chapters lean first-person, the rest third`, explanation: 'Counts I/me/my versus he/she/they in narration outside quotation marks. A mix is normal in memoir, epistolary and multi-narrator books and a genuine slip in others. It cannot see head-hopping inside a third-person scene, so do not read silence as clearance.', where: mixed[0] ? anchorAt(flat, mixed[0].chapter.start, Math.min(mixed[0].chapter.end, mixed[0].chapter.start + 160)) : undefined }];
}
function showTell(flat: Flat): MetricReading[] {
  if (wordCount(flat.text) < 300) return [];
  const hits: Array<{ start: number; end: number; why: string }> = [];
  for (const [re, why] of TELL_PATTERNS) { const r = new RegExp(re.source, re.flags); let m: RegExpExecArray | null; while ((m = r.exec(flat.text))) hits.push({ start: m.index, end: m.index + m[0].length, why }); }
  if (!hits.length) return [];
  hits.sort((a, b) => a.start - b.start); const h = hits[0];
  return [{ name: 'Show versus tell (pattern match)', value: `${hits.length} place${hits.length > 1 ? 's' : ''} where emotion or character is stated plainly`, explanation: 'Matches simple patterns like "she was very sad". Telling is a legitimate tool: summary, speed, a narrator with a voice. Showing is not always better. These are places to ask whether the reader would rather see it dramatised.', where: anchorAt(flat, Math.max(0, h.start - 40), Math.min(flat.text.length, h.end + 60)) }];
}
export interface FrontMatterRead { present: string[]; missing: string[] }
export function frontMatter(m: ManuscriptInput): FrontMatterRead {
  const text = m.chapters.map(c => `${c.title}\n${c.text.slice(0, 600)}`).join('\n').toLowerCase(); const kinds = new Set(m.chapters.map(c => c.kind));
  const has = (re: RegExp, kind?: string) => re.test(text) || (kind ? kinds.has(kind as any) : false);
  const present: string[] = [], missing: string[] = [];
  const check = (label: string, ok: boolean) => (ok ? present : missing).push(label);
  check('title page', has(/\btitle page\b/) || !!m.title);
  check('copyright page', has(/copyright|©|all rights reserved|\bcc[- ]by\b|public domain/) || !!(m.meta?.copyrightHolder && m.meta?.copyrightYear));
  check('table of contents', has(/\bcontents\b/, 'toc') || m.chapters.filter(c => (c.kind || 'chapter') === 'chapter').length < 4);
  check('about the author', has(/about the author|author'?s? bio|about me/));
  check('acknowledgements or dedication', has(/acknowledg|dedicat|for my |to my /));
  return { present, missing };
}
function frontMatterReading(flat: Flat, m: ManuscriptInput): MetricReading[] {
  if (m.kind === 'ARTICLE' || m.kind === 'NEWSLETTER') return [];
  const f = frontMatter(m);
  return [{ name: 'Front and back matter', value: `present: ${f.present.join(', ') || 'none detected'}; not detected: ${f.missing.join(', ') || 'none'}`, explanation: 'Looks for common pieces by title and wording. Short books and zines may reasonably skip some; a copyright page and a way to learn about you are what most readers and stores expect. Detection is by wording, so a piece named unusually may be missed.' }];
}

export function computeMetrics(m: ManuscriptInput, flat: Flat = flatten(m.chapters)): MetricReading[] {
  const ctx = { kind: m.kind };
  return [
    ...readabilityReading(flat), ...sentenceVariance(flat), ...paragraphShape(flat), ...adverbs(flat), ...filterWords(flat), ...dialogue(flat, ctx),
    ...repetition(flat), ...passive(flat), ...pacingCurve(flat), ...hooks(flat), ...povDrift(flat, ctx), ...showTell(flat), ...frontMatterReading(flat, m),
  ];
}
export const metricByName = (ms: MetricReading[], name: string) => ms.find(x => x.name.startsWith(name));
