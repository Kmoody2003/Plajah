// editorialLocal — the council with no model: a deterministic read that always works, keys or not.
//
// Mirrors localAdvice in services/motion/council. It cannot judge premise, character or market, and says so
// ("Not judged offline"). What it CAN do is count: rhythm, density, repetition, pacing, openings, front matter,
// proofing slips, rights prompts and journalism mechanics, and hand each to a named editor as a note that
// offers options and ends with "Your call". Every number is explained and none is presented as a verdict.
import { EDITORS, castEditors, roomTensions } from './editorialEditors';
import { chapterOpenings, computeMetrics, flatten, metricByName, anchorAt, wordCount, type Flat } from './editorialMetrics';
import { rightsReview } from './editorialRights';
import { findingToNote, journalismChecks } from './editorialJournalism';
import { AI_EDITORS_LIMIT, NOT_LEGAL_ADVICE, isJournalistic, type Anchor, type Band, type Disagreement, type EditorId, type EditorialReport, type ManuscriptInput, type MetricReading, type Note, type Scope, type Severity, type Verdict, type Working } from './editorialTypes';

export const fingerprintOf = (kind: string, s: string): string => { let h = 5381; const t = `${kind}:${s.toLowerCase().replace(/\s+/g, ' ').slice(0, 140)}`; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return `${kind}-${h.toString(36)}`; };

/** Narrow a manuscript to the scope the author asked about. Offsets in the narrowed text are what the report refers to. */
export function applyScope(m: ManuscriptInput, scope: Scope = { kind: 'BOOK' }): ManuscriptInput {
  if (scope.kind === 'BOOK') return m;
  if (scope.kind === 'CHAPTER') { const c = m.chapters.filter(x => x.id === scope.chapterId); return c.length ? { ...m, chapters: c } : m; }
  const flat = flatten(m.chapters); const text = flat.text.slice(Math.max(0, scope.start), Math.max(scope.start, scope.end));
  return { ...m, chapters: [{ id: 'selection', title: 'Your selection', text, kind: 'chapter' }] };
}

/* ─── Proofing slips ────────────────────────────────────────────────────────────────────────── */
export function proofSlips(flat: Flat): Array<{ what: string; anchor: Anchor }> {
  const out: Array<{ what: string; anchor: Anchor }> = []; const t = flat.text;
  const dbl = /\b([A-Za-z]{2,})\s+\1\b/g; let m: RegExpExecArray | null;
  while ((m = dbl.exec(t)) && out.length < 20) { if (/^(?:had|that|very|bye|no|so|ha|knock|chop|tick|walla)$/i.test(m[1])) continue; out.push({ what: `doubled word "${m[1]}"`, anchor: anchorAt(flat, Math.max(0, m.index - 20), m.index + m[0].length + 20) }); }
  const sp = /[^\n ] {2,}[^\n ]/g; let sc = 0; while ((m = sp.exec(t)) && sc < 3) { out.push({ what: 'two or more spaces in a row', anchor: anchorAt(flat, Math.max(0, m.index - 20), m.index + 30) }); sc++; }
  const spb = /\w \s?[,;:.!?](?=\s|$)/g; sc = 0; while ((m = spb.exec(t)) && sc < 3) { out.push({ what: 'a space before punctuation', anchor: anchorAt(flat, Math.max(0, m.index - 20), m.index + 30) }); sc++; }
  const curly = (t.match(/[“”]/g) || []).length, straight = (t.match(/"/g) || []).length;
  if (curly > 5 && straight > 5) out.push({ what: 'a mix of straight and curly double quotes', anchor: anchorAt(flat, 0, Math.min(t.length, 80)) });
  const open = (t.match(/“/g) || []).length, close = (t.match(/”/g) || []).length;
  if (open + close > 10 && Math.abs(open - close) >= 2) out.push({ what: `unbalanced curly quotes (${open} opening, ${close} closing)`, anchor: anchorAt(flat, 0, Math.min(t.length, 80)) });
  return out;
}

/* ─── Metric → note ─────────────────────────────────────────────────────────────────────────── */
interface Rule { metric: string; test: (m: MetricReading, ctx: { kind: string; flat: Flat }) => boolean; editors: EditorId[]; severity: Severity; dimension: string; headline: (m: MetricReading) => string; why: (m: MetricReading) => string; options: string[]; yourCall: string }
const num = (s: string, re: RegExp): number => { const x = re.exec(s); return x ? parseFloat(x[1]) : NaN; };

const RULES: Rule[] = [
  { metric: 'Sentence length', test: m => /quite even/.test(m.value), editors: ['LINE_COPY', 'DEV_LITERARY'], severity: 'Craft', dimension: 'prose', headline: () => 'Your sentences are very even in length', why: m => `${m.value}. A steady length can create a hypnotic rhythm or a monotone, and only you know which you want.`, options: ['Read a page aloud and mark where it drones; vary the length only there.', 'Combine two short sentences, or break one long one, at an emotional turn.', 'Leave it: if the evenness is the voice, it is working.'], yourCall: 'Your call: this would change if the evenness is a deliberate, incantatory voice.' },
  { metric: 'Paragraph length', test: m => num(m.value, /longest (\d+)/) > 250 || num(m.value, /average ([\d.]+)/) > 120, editors: ['PUB_OPS', 'LINE_COPY', 'READER_ADVOCATE'], severity: 'Clarity', dimension: 'readiness', headline: () => 'Some paragraphs are very long', why: m => `${m.value}. Long blocks are heavy on a phone, and readers often skim them.`, options: ['Break at a change of speaker, time, place or idea.', 'Add a line of white space around the longest block.', 'Keep it if the density is the effect (a stream-of-consciousness passage, for instance).'], yourCall: 'Your call: this would change if the long block is a deliberate set piece.' },
  { metric: 'Adverb density', test: m => num(m.value, /\(?([\d.]+)% of words|, ([\d.]+)% of words/) >= 3 || /densest stretch/.test(m.value), editors: ['LINE_COPY', 'DEV_LITERARY'], severity: 'Craft', dimension: 'prose', headline: () => 'A cluster of -ly adverbs', why: m => `${m.value}. Often the verb can carry the meaning alone ("whispered" rather than "said quietly").`, options: ['Swap the strongest verb in for the verb-plus-adverb pair.', 'Keep one adverb per scene where it adds a surprise.', 'Leave them if they are part of an ornate, deliberate voice.'], yourCall: 'Your call: this would change if the adverbs carry tone you want, such as irony.' },
  { metric: 'Filter words', test: m => num(m.value, /\(([\d.]+)% of words\)/) >= 1.2 || /densest stretch/.test(m.value), editors: ['DEV_LITERARY', 'DEV_GENRE', 'LINE_COPY'], severity: 'Craft', dimension: 'voice', headline: () => 'Perception words may be putting distance between reader and scene', why: m => `${m.value}. "She saw the door open" is one step further from the reader than "The door opened".`, options: ['Cut the filter and state the thing directly where the scene is tense.', 'Keep it where the narrator\'s limited knowledge is the point.', 'Switch to a deeper point of view in a single scene and compare.'], yourCall: 'Your call: this would change if the distance is the effect you want.' },
  { metric: 'Dialogue share', test: (m, c) => ['FICTION', 'SERIAL', 'YOUNG_READERS'].includes(c.kind) && (num(m.value, /^([\d.]+)%/) < 8 || num(m.value, /^([\d.]+)%/) > 70), editors: ['DEV_GENRE', 'DEV_SERIAL', 'READER_ADVOCATE'], severity: 'Craft', dimension: 'pacing', headline: () => 'Dialogue is very low or very high for fiction', why: m => `${m.value}. Many readers feel pace most in conversation; a book with none can feel inward, and one with all can feel unmoored.`, options: ['Convert a summary passage into a short scene with talk.', 'Insert beats of action or setting between long runs of dialogue.', 'Keep it if the form (monologue, letters, interior narration) calls for it.'], yourCall: 'Your call: this would change if the form of the book is deliberately interior or deliberately conversational.' },
  { metric: 'Repeated phrases', test: () => true, editors: ['LINE_COPY', 'DEV_LITERARY', 'ORAL_NARRATIVE'], severity: 'Craft', dimension: 'prose', headline: () => 'A phrase repeats often', why: m => `${m.value}. Repetition can be a refrain or an unnoticed tic.`, options: ['Keep it where it is a refrain, and vary it elsewhere.', 'Search the whole manuscript and keep it at the two or three places where it lands hardest.', 'Replace with a fresh image at the weakest repetition.'], yourCall: 'Your call: this would change if the repetition belongs to the tradition you are writing in.' },
  { metric: 'Passive voice', test: (m, c) => num(m.value, /\(([\d.]+)%\)/) >= (['ARTICLE', 'NEWSLETTER', 'NONFICTION'].includes(c.kind) ? 35 : 25), editors: ['LINE_COPY', 'DEV_EXPOSITORY', 'JOURNALISM_VERIFY'], severity: 'Clarity', dimension: 'prose', headline: () => 'Many sentences look passive', why: m => `${m.value}. Passive hides the actor, which is sometimes the point and sometimes a blur.`, options: ['Recast where the actor matters (who decided, who did it).', 'Keep passive for unknown actors or to emphasise the receiver.', 'Check whether anything is hidden that a reader would want named.'], yourCall: 'Your call: this would change if the passive is a convention of your field.' },
  { metric: 'Chapter-length curve', test: m => /middle runs longest|lengthen/.test(m.value) || (num(m.value, /longest "[^"]*" \((\d+)\)/) > 2.5 * num(m.value, /average (\d+) words/)), editors: ['DEV_GENRE', 'DEV_SERIAL', 'DEV_LITERARY', 'READER_ADVOCATE'], severity: 'Craft', dimension: 'pacing', headline: () => 'The chapter-length curve is lopsided', why: m => `${m.value}. Readers feel chapter length as pace; an overlong middle is a classic place to lose them.`, options: ['Look at the longest chapter and ask where it could split.', 'Compress the middle: cut a scene that repeats an earlier beat.', 'Leave it if the long chapter is the big set piece.'], yourCall: 'Your call: this would change if the longest chapter is the book\'s centrepiece.' },
  { metric: 'Chapter openings', test: m => /scene-setting|waking|very long first/.test(m.value), editors: ['DEV_SERIAL', 'READER_ADVOCATE', 'DEV_GENRE'], severity: 'Craft', dimension: 'structure', headline: () => 'Some chapters open slowly', why: m => `${m.value}. A reader meeting a chapter cold has only its first lines to decide.`, options: ['Start the chapter one or two sentences later, in the action.', 'Open on a line of dialogue or a concrete image from the middle of the scene.', 'Keep a quiet opening where the quiet is the contrast.'], yourCall: 'Your call: this would change if the stillness is set against what came before.' },
  { metric: 'Point-of-view drift', test: () => true, editors: ['DEV_LITERARY', 'DEV_GENRE', 'LINE_COPY'], severity: 'Clarity', dimension: 'voice', headline: () => 'Point of view may shift', why: m => `${m.value}. If it is unintended, readers lose track of whose head they are in.`, options: ['Check the flagged chapter for an unannounced shift.', 'Mark a deliberate shift with a section break or chapter heading.', 'Leave it if it is a multi-voice book.'], yourCall: 'Your call: this would change if the shift is part of the design.' },
  { metric: 'Show versus tell', test: () => true, editors: ['DEV_LITERARY', 'DEV_GENRE', 'DEV_YA_CHILDREN'], severity: 'Craft', dimension: 'prose', headline: () => 'Some feelings are stated rather than dramatised', why: m => `${m.value}. Naming an emotion is quick and sometimes right; showing it gives the reader something to do.`, options: ['Replace with a gesture, a detail or a line of dialogue that implies it.', 'Keep the statement where speed matters.', 'Pair the statement with one concrete image.'], yourCall: 'Your call: this would change if the summary is doing the job of getting you quickly to the scene that matters.' },
];

function pickEditor(candidates: EditorId[], room: EditorId[]): EditorId { return candidates.find(c => room.includes(c)) ?? room[0] ?? candidates[0]; }

/* ─── What is working ───────────────────────────────────────────────────────────────────────── */
const SENSORY = /\b(?:smell|smelled|scent|taste|tasted|salt|smoke|rust|glass|cold|warm|hot|rain|dust|gravel|copper|cedar|bread|oil|wet|dry|light|shadow|echo|hum|rattle|crack|whisper|silence|breath)\b/i;
export function bestSentences(flat: Flat, max = 2): Array<{ text: string; start: number; end: number }> {
  const cands: Array<{ text: string; start: number; end: number; score: number }> = [];
  const re = /[^.!?\n]+[.!?]+["”']?/g; let m: RegExpExecArray | null;
  while ((m = re.exec(flat.text))) {
    const t = m[0].trim(); const w = wordCount(t); if (w < 10 || w > 28) continue;
    let s = 0; if (SENSORY.test(t)) s += 2; if (/[,;]/.test(t)) s += 1; if (/\b\d+\b/.test(t)) s += 0.5; if (/\b(?:felt|saw|heard|noticed|realized|seemed)\b/i.test(t)) s -= 2; if (/\b[a-z]{4,}ly\b/i.test(t)) s -= 1.5; if (/\b(?:very|really|just|suddenly|quite)\b/i.test(t)) s -= 1.5; if (/\b(?:was|were)\s+\w+ed\b/.test(t)) s -= 1; if (/["“]/.test(t)) s -= 1;
    cands.push({ text: t, start: m.index + (m[0].length - m[0].trimStart().length), end: m.index + m[0].length, score: s });
  }
  const picked: typeof cands = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) { if (c.score < 2) break; if (picked.every(p => Math.abs(p.start - c.start) > 3000)) picked.push(c); if (picked.length >= max) break; }
  return picked;
}

function workingFor(m: ManuscriptInput, flat: Flat, metrics: MetricReading[], room: EditorId[]): Working[] {
  const out: Working[] = [];
  if (wordCount(flat.text) < 200) return out;
  for (const s of bestSentences(flat)) {
    const a = anchorAt(flat, s.start, s.end);
    out.push({ editorId: pickEditor(['DEV_LITERARY', 'LINE_COPY', 'DEV_POETRY'], room), text: `This line works: it is concrete and carries its own weight without leaning on adverbs or perception words. A reader can see or hear it${a.chapterTitle ? ` (in "${a.chapterTitle}")` : ''}.`, anchor: a });
  }
  const hook = chapterOpenings(flat).filter(o => o.signals.length >= 2 && !o.flags.length)[0];
  if (hook) out.push({ editorId: pickEditor(['DEV_SERIAL', 'READER_ADVOCATE', 'DEV_GENRE'], room), text: `A strong way into a chapter: it ${hook.signals.join(' and ')}. This is the kind of opening that gets a sample reader to turn the page.`, anchor: hook.anchor });
  const sv = metricByName(metrics, 'Sentence length');
  if (sv && !/quite even/.test(sv.value)) out.push({ editorId: pickEditor(['LINE_COPY', 'DEV_LITERARY'], room), text: `Your sentence rhythm varies (${sv.value}). That variety is what keeps long stretches of prose from droning.`, anchor: sv.where });
  const dlg = metricByName(metrics, 'Dialogue share');
  if (dlg && ['FICTION', 'SERIAL', 'YOUNG_READERS'].includes(m.kind)) { const r = num(dlg.value, /^([\d.]+)%/); if (r >= 15 && r <= 55) out.push({ editorId: pickEditor(['DEV_GENRE', 'READER_ADVOCATE'], room), text: `The balance of talk to narration (${dlg.value}) sits in a range where scenes can breathe and conversation can move the story.` }); }
  const rep = metricByName(metrics, 'Repeated phrases'), fw = metricByName(metrics, 'Filter words');
  if (!rep && wordCount(flat.text) > 1500) out.push({ editorId: pickEditor(['LINE_COPY'], room), text: 'No four-word phrase repeats three or more times across the manuscript. The prose is not leaning on tics.' });
  if (fw && num(fw.value, /\(([\d.]+)% of words\)/) < 0.6) out.push({ editorId: pickEditor(['DEV_LITERARY', 'LINE_COPY'], room), text: `Perception words are sparse (${fw.value}), so the reader tends to stand inside the scene rather than watch it through a narrator.` });
  return out.slice(0, 6);
}

/* ─── Verdicts ──────────────────────────────────────────────────────────────────────────────── */
function bandFor(concerns: number, cap = true): Band { return concerns === 0 ? 'Strong' : concerns <= 2 || cap ? 'Developing' : 'Needs a rethink'; }

function verdictsFor(m: ManuscriptInput, flat: Flat, metrics: MetricReading[], notes: Note[], riskCount: number, slips: number): Verdict[] {
  const count = (dim: string) => notes.filter(n => n.dimension === dim && n.source === 'local').length;
  const words = wordCount(flat.text);
  const journal = isJournalistic(m.kind);
  const off = (dimension: string, why: string): Verdict => ({ dimension, band: 'Not judged offline', reasoning: why });
  if (words < 300) return [{ dimension: 'readiness', band: 'Needs a rethink', reasoning: 'There is not enough text yet for a reading. Come back with at least a chapter or a full article.' }];
  const v: Verdict[] = [];
  if (journal) {
    const j = notes.filter(n => n.editorId === 'JOURNALISM_VERIFY' || n.editorId === 'JOURNALISM_ETHICS');
    const risk = j.filter(n => n.severity === 'Risk').length;
    v.push({ dimension: 'sourcing', band: bandFor(j.filter(n => ['attribution-gap', 'single-source', 'vague-attribution'].some(k => n.fingerprint.startsWith(k))).length), reasoning: 'Counts sentences with checkable claims and no nearby attribution or link, plus vague attribution. It cannot know whether your sources are good.' });
    v.push({ dimension: 'fairness', band: bandFor(j.filter(n => n.fingerprint.startsWith('loaded') || n.fingerprint.startsWith('opinion')).length), reasoning: 'Looks for loaded wording and unlabelled opinion. It cannot see who you did not interview.' });
    v.push({ dimension: 'harm', band: risk ? 'Developing' : 'Strong', reasoning: risk ? `${risk} question${risk > 1 ? 's' : ''} about harm, privacy or conflicts need a human decision.` : 'No sensitive-topic patterns, undisclosed ties or accusation wording was detected. That is not the same as no harm.' });
    v.push({ dimension: 'transparency', band: j.filter(n => n.fingerprint.startsWith('ai-') || n.fingerprint.startsWith('sponsor') || n.fingerprint.startsWith('conflict')).length ? 'Developing' : 'Strong', reasoning: 'Compares what the text suggests with the disclosures you have set.' });
  } else {
    v.push(off('premise', 'A tool cannot judge premise. This needs a reader. Ask the council with a model for a real read.'));
    const open = notes.filter(n => n.dimension === 'structure').length + count('pacing');
    v.push({ dimension: 'structure', band: bandFor(open), reasoning: `Looks only at chapter-length shape and how chapters open. ${open ? 'A couple of those patterns are worth a look.' : 'Nothing odd in the lengths or openings.'} It cannot see whether the story is shaped well.` });
    v.push(off('character', 'Characters live in what they want and do; a counting tool cannot see that.'));
    v.push({ dimension: 'voice', band: bandFor(count('voice')), reasoning: 'Based on filter words and point-of-view consistency. A distinctive voice is not something a metric can find.' });
    v.push({ dimension: 'pacing', band: bandFor(count('pacing')), reasoning: 'Based on chapter-length curve and dialogue share. A slow chapter that earns its length would not show up.' });
  }
  v.push({ dimension: 'prose', band: bandFor(count('prose')), reasoning: `Based on sentence rhythm, adverbs, passive voice, repetition and show-versus-tell patterns. ${slips ? `${slips} proofing slip${slips > 1 ? 's' : ''} also turned up.` : ''}` });
  if (!journal) v.push(m.meta?.description ? { dimension: 'market fit', band: m.meta.description.length > 200 && (m.meta.keywords?.length ?? 0) >= 3 ? 'Developing' : 'Developing', reasoning: 'Market fit needs comps and a reading of your category, which a counting tool cannot do. Your description and keywords are filled in, which is a start.' } : off('market fit', 'Market fit needs comps and an eye on the shelf. Ask the council with a model.'));
  const readyConcerns = riskCount + notes.filter(n => n.dimension === 'readiness').length + (slips > 3 ? 1 : 0);
  v.push({ dimension: 'readiness', band: readyConcerns === 0 ? 'Strong' : readyConcerns <= 3 ? 'Developing' : 'Needs a rethink', reasoning: readyConcerns ? `${riskCount} rights or ethics question${riskCount === 1 ? '' : 's'}, ${notes.filter(n => n.dimension === 'readiness').length} presentation note(s) and ${slips} proofing slip(s) to look at before publishing.` : 'No obvious presentation, rights or proofing issues turned up by the checks that exist.' });
  return v;
}

/* ─── The read ──────────────────────────────────────────────────────────────────────────────── */
export interface LocalOptions { editors?: EditorId[]; scope?: Scope; declinedFingerprints?: ReadonlySet<string> | string[] }

export function localAdvice(manuscript: ManuscriptInput, opts: LocalOptions = {}): EditorialReport {
  const m = applyScope(manuscript, opts.scope);
  const flat = flatten(m.chapters); const room = opts.editors?.length ? opts.editors : castEditors(m.kind, { genre: m.genre });
  const metrics = computeMetrics(m, flat);
  const notes: Note[] = []; const ctx = { kind: m.kind, flat };
  for (const r of RULES) {
    const mt = metricByName(metrics, r.metric); if (!mt || !r.test(mt, ctx)) continue;
    const editorId = pickEditor(r.editors, room); const fpr = fingerprintOf(r.metric, mt.where?.quote ?? mt.name);
    notes.push({ id: `l-${fpr}`, editorId, severity: r.severity, dimension: r.dimension, fingerprint: fpr, headline: r.headline(mt), observation: r.why(mt), anchor: mt.where, options: r.options, yourCall: r.yourCall, metric: { name: mt.name, value: mt.value, explanation: mt.explanation }, source: 'local' });
  }
  const fm = metricByName(metrics, 'Front and back matter');
  if (fm && /not detected: [^;]*(copyright page|about the author)/.test(fm.value)) notes.push({ id: `l-${fingerprintOf('frontmatter', fm.value)}`, editorId: pickEditor(['PUB_OPS'], room), severity: 'Clarity', dimension: 'readiness', fingerprint: fingerprintOf('frontmatter', fm.value), headline: 'Front or back matter may be missing', observation: fm.value + '. Readers and stores expect a copyright page; a short author note helps readers find you.', options: ['Add a copyright page (the submission flow can generate one).', 'Add a short "About the author" with a link to where readers can follow you.', 'Skip either if it is a deliberate choice for a zine or chapbook.'], yourCall: 'Your call: this would change if this is a short or experimental piece that does not need them.', metric: { name: fm.name, value: fm.value, explanation: fm.explanation }, source: 'local' });
  const slips = proofSlips(flat);
  if (slips.length) notes.push({ id: `l-${fingerprintOf('proof', slips[0].anchor.quote)}`, editorId: pickEditor(['PROOFREADER', 'LINE_COPY'], room), severity: 'Clarity', dimension: 'readiness', fingerprint: fingerprintOf('proof', slips[0].anchor.quote), headline: `${slips.length} small proofing slip${slips.length > 1 ? 's' : ''}`, observation: `For example: ${slips[0].what}. ${slips.slice(1, 4).map(s => s.what).join('; ')}`.trim(), anchor: slips[0].anchor, options: ['Fix these in a final proofing pass, after the content is settled.', 'Search for the pattern across the manuscript to catch the rest.', 'Leave any that are deliberate (spaced punctuation, doubled words for effect).'], yourCall: 'Your call: this would change if any are intentional.', source: 'local' });

  const rights = rightsReview(m, flat);
  if (isJournalistic(m.kind) || m.kind === 'NONFICTION') for (const [i, f] of journalismChecks(m, flat).entries()) notes.push({ ...findingToNote(f, i), editorId: room.includes(f.editorId) || f.editorId === 'COPYRIGHT' ? f.editorId : room.includes('JOURNALISM_VERIFY') ? 'JOURNALISM_VERIFY' : f.editorId });
  const copyrightNotes: Note[] = rights.items.map((it, i) => ({ id: `r${i}-${it.fingerprint}`, editorId: 'COPYRIGHT' as EditorId, severity: it.severity, dimension: 'readiness', fingerprint: it.fingerprint, headline: it.title, observation: it.why, anchor: it.anchor, options: it.nextSteps, yourCall: 'Your call: this would change if you hold the rights, the material is public domain, or you have permission in writing. This is not legal advice.', source: 'local' as const }));
  const all = [...notes, ...copyrightNotes];
  const declined = new Set(Array.isArray(opts.declinedFingerprints) ? opts.declinedFingerprints : [...(opts.declinedFingerprints ?? [])]);
  const kept = all.filter(n => !declined.has(n.fingerprint));
  const riskCount = kept.filter(n => n.severity === 'Risk').length;

  const verdicts = verdictsFor(m, flat, metrics, kept, riskCount, slips.length);

  // Synthesis without averaging: the editor with the weightiest notes leads; a standing opponent in the room is the counterpoint.
  const weight = (id: EditorId) => kept.filter(n => n.editorId === id).reduce((a, n) => a + (n.severity === 'Risk' ? 3 : n.severity === 'Clarity' ? 2 : 1), 0);
  const ranked = [...room].sort((a, b) => weight(b) - weight(a));
  const lead = ranked[0]; const tensions = roomTensions(room);
  const counterId = (tensions.find(t => t.between.includes(lead))?.between.find(x => x !== lead)) ?? ranked[1] ?? lead;
  const editorId = ranked.find(x => x !== lead && x !== counterId) ?? counterId;
  const live: Disagreement[] = tensions.slice(0, 3).map(t => ({ between: t.between, about: 'A standing disagreement in this room', sideA: t.sideA, sideB: t.sideB }));
  const synthesis = { lead, counterpoint: counterId, editor: editorId, keepFromCounterpoint: `Keep what ${EDITORS[counterId].epithet} protects: ${EDITORS[counterId].protects}.` };

  const working = workingFor(m, flat, metrics, room);
  const top = kept.filter(n => n.severity === 'Risk')[0] ?? kept[0];
  const summary = [
    working.length ? `First, what is working: ${working.length === 1 ? 'one thing stood out' : `${working.length} things stood out`}, and I have quoted them below so you can see exactly where.` : 'There was not enough text here for me to point at passages that work, so I will say that plainly rather than flatter you.',
    top ? `The thing I would look at first: ${top.headline.toLowerCase()}. ${top.severity === 'Risk' ? 'That one is a question about risk, not craft.' : ''}` : 'The counting checks did not raise anything that needs your attention.',
    `The council here read your text only by counting patterns, with no model, so it cannot judge premise, character or market, and it has said so in the verdicts. ${live.length ? 'Where editors in the room would disagree, I have left the disagreement visible rather than averaging it.' : ''}`,
    'Every suggestion is an option. You decide.',
  ].filter(Boolean).join(' ');

  return {
    working, verdicts, notes: kept, disagreements: live, rights: rights.items.filter(i => !declined.has(i.fingerprint)), ariaSummary: summary, synthesis, metrics, source: 'local',
    limits: ['This read used no model: it only counts patterns and explains each count. Treat the numbers as prompts, not scores.', AI_EDITORS_LIMIT, NOT_LEGAL_ADVICE],
  };
}
