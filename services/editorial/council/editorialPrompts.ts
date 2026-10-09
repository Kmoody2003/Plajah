// editorialPrompts — what each editor is told, and how their answers are read back. Server-safe (no browser globals).
//
// The method is ARIA_EDITORIAL_COUNCIL_METHOD: guidance not orders, options with a "Your call", honest verdicts in
// words, severity Craft / Clarity / Risk, disagreement kept visible, synthesis without averaging. Every reader is
// strict: a quote the manuscript does not contain is never an anchor, a note without options is padded with the
// option to leave it, and a "Your call" line is guaranteed.
import { ARIA_EDITORIAL_COUNCIL_METHOD } from '../../aria/ariaCreativeRoles';
import { EDITORS } from './editorialEditors';
import { locateQuote, type Flat } from './editorialMetrics';
import { fingerprintOf } from './editorialLocal';
import { AI_EDITORS_LIMIT, NOT_LEGAL_ADVICE, DIMENSIONS, isJournalistic, type Anchor, type Band, type Disagreement, type EditorId, type ManuscriptInput, type MetricReading, type Note, type Severity, type Verdict, type Working } from './editorialTypes';

export const ANTI_SYCOPHANCY = 'Anti-sycophancy rule: be honest even when the news is unflattering, and kind in how you say it. Do not inflate. Praise only what you can quote. If a dimension needs a rethink, say "Needs a rethink" and say why. Never say a manuscript is ready to publish; say what you can and cannot see. Never invent a quotation, a statistic, a comparable title, or a law.';
export const CALIBRATION = 'Bands are words, not numbers: "Strong" (it does what it is trying to do), "Developing" (the instinct is right and the execution needs work), "Needs a rethink" (the approach itself is not yet serving the book). Never give scores or percentages.';

const jsonLine = 'Answer ONLY with the JSON requested. No preamble, no code fence.';

export function editorSystem(id: EditorId, opts: { journalism?: boolean } = {}): string {
  const e = EDITORS[id];
  const tensions = Object.entries(e.tensions).map(([o, why]) => `- with ${EDITORS[o as EditorId].name}: ${why}`).join('\n');
  return [
    `You are ${e.name}, ${e.epithet}, one of the editors on the Plajah editorial council: a working team, not a panel of mascots. ${e.background}`,
    `Your craft: ${e.medium}. Conviction: ${e.conviction} You challenge: ${e.challenges}. You protect: ${e.protects}.`,
    `Genres you know best: ${e.genres.join(', ')}. Your voice: ${e.voice}`,
    `Questions you always ask: ${e.questions.join(' ')}`,
    `Your blind spots, which you should state when they matter: ${e.blindSpots.join('; ')}.`,
    tensions ? `Standing arguments on this team:\n${tensions}` : '',
    '', 'How the team works:', ARIA_EDITORIAL_COUNCIL_METHOD, '', ANTI_SYCOPHANCY, CALIBRATION, '',
    'Rules for you:',
    '- You are one voice. Speak to the team, not to the author: Aria is the only one who addresses the author. Never use "you" to the author inside your notes; refer to "the author" or "the manuscript".',
    '- Start with what is working. Quote it exactly, copied from the text, 10 to 40 words, so it can be found.',
    '- Every note offers two to four options, never an order. Do not write "you must" or "you should". Each note ends with "Your call: <what it would change> if ...".',
    '- Label each note Craft (how it is written), Clarity (whether a reader can follow or find it) or Risk (legal or ethical exposure).',
    '- Never rewrite the author\'s text. If a line is clearly weak, describe the problem and the kinds of fix, not a replacement.',
    '- You are not a lawyer and not a human editor. Say what you cannot judge from what you were given.',
    opts.journalism ? '- This is journalism. Ask questions rather than convict. You read the fact-check status but you NEVER mark a claim verified: only a person with a source can.' : '',
    `- ${NOT_LEGAL_ADVICE}`, jsonLine,
  ].filter(Boolean).join('\n');
}

export function briefText(m: ManuscriptInput, material: string, mode: 'WHOLE' | 'DIGEST', words: number, local: MetricReading[], extra?: string): string {
  const meta = m.meta; const a = m.article; const j = isJournalistic(m.kind);
  return [
    `THE WORK: "${m.title || 'Untitled'}"  kind: ${m.kind}${m.genre ? `  genre: ${m.genre}` : ''}  length: ~${words.toLocaleString()} words  you are reading: ${mode === 'WHOLE' ? 'the whole text' : 'a digest (not all the text)'}`,
    meta?.description ? `Author's description: ${meta.description.slice(0, 600)}` : '',
    meta?.aiText && meta.aiText !== 'none' ? `AI use declared for text: ${meta.aiText}${meta.aiTools ? ` (${meta.aiTools})` : ''}` : '',
    j && a?.headline ? `Headline: ${a.headline}` : '',
    j && a?.disclosures ? `Disclosures set: AI ${a.disclosures.aiAssisted ? 'yes' : 'no'}, sponsored ${a.disclosures.sponsored ? 'yes' : 'no'}, affiliate ${a.disclosures.affiliateLinks ? 'yes' : 'no'}, conflict ${a.disclosures.conflictOfInterest ? 'yes' : 'no'}` : '',
    j && a?.claims ? `Fact-check workbench (read-only): ${a.claims.length} claims logged; ${a.claims.filter(c => c.status === 'VERIFIED' && c.humanVerified).length} verified by a person with sources; ${a.claims.filter(c => c.status === 'DISPUTED').length} disputed.` : '',
    local.length ? `COUNTED PATTERNS (a machine counted these; they are prompts, not verdicts):\n${local.slice(0, 10).map(x => `- ${x.name}: ${x.value}`).join('\n')}` : '',
    extra || '',
    `MANUSCRIPT:\n"""\n${material}\n"""`,
  ].filter(Boolean).join('\n');
}

export function readUser(brief: string, others: EditorId[], depth: 'QUICK' | 'FULL', journalism: boolean): string {
  const dims = journalism ? 'sourcing, fairness, harm, transparency, clarity, readiness' : DIMENSIONS.join(', ');
  const n = depth === 'QUICK' ? 'up to 4' : 'up to 7';
  return `${brief}

The others in the room: ${others.map(o => EDITORS[o].name).join(', ') || 'none'}.

Give your read, from your own expertise only. Return JSON exactly:
{"working":[{"quote":"exact words from the text, 10-40 words","why":"what is working here, specifically"}],
 "verdicts":[{"dimension":"one of: ${dims} (only those you are qualified to judge)","band":"Strong|Developing|Needs a rethink","reasoning":"two sentences, honest and kind"}],
 "notes":[{"severity":"Craft|Clarity|Risk","dimension":"one of ${dims}","headline":"short","observation":"what you see, specific","quote":"exact words from the text, or empty","options":["option one","option two","option three"],"yourCall":"Your call: ... would change if ..."}],
 "arguesWith":{"editorId":"one of ${others.join('|') || 'none'}","about":"the specific disagreement you expect"}}
Give ${n} notes, most important first. At least one must be something the author may not want to hear, unless the work truly has no such problem; if so, say that in one verdict instead of inventing one.`;
}

export function disputeUser(self: EditorId, reads: Array<{ editorId: EditorId; summary: string }>): string {
  const others = reads.filter(r => r.editorId !== self);
  return `The other editors' reads:
${others.map(r => `[${r.editorId}] ${EDITORS[r.editorId].name}: ${r.summary}`).join('\n')}

Choose the ONE read you most disagree with and say why, about the reading, not the person. Then concede one thing they have right. Return JSON: {"against":"one of ${others.map(o => o.editorId).join(', ')}","about":"the topic","objection":"two or three sentences in your voice","concession":"one sentence"}`;
}

export function synthesisSystem(): string {
  return `You are Aria, the single AI presence across Plajah. You convened the editorial council: editors who work as a team behind you. You speak to the author; they do not. Refer to "the council" or "the editors", and name an individual editor only to quote a position (at most two quotes).

Synthesise WITHOUT averaging: choose a lead reading, a counterpoint worth keeping, and an editor of last resort. Where editors disagree, say so and keep the disagreement visible. For each dimension give ONE band (Strong / Developing / Needs a rethink) taken from the editor best qualified to judge it, and put the strongest dissent in the reasoning. Open with what is working. Be honest about what is not. Give options, not orders, and end with the one decision that is the author's.

${ANTI_SYCOPHANCY}
${CALIBRATION}
${AI_EDITORS_LIMIT}
${NOT_LEGAL_ADVICE}
${jsonLine}`;
}

export function synthesisUser(brief: string, reads: Array<{ editorId: EditorId; working: Working[]; notes: Note[]; verdicts: Verdict[] }>, disputes: Disagreement[]): string {
  const r = reads.map(x => `[${x.editorId}] ${EDITORS[x.editorId].name}\n  working: ${x.working.map(w => w.text).join(' | ') || '(nothing quoted)'}\n  verdicts: ${x.verdicts.map(v => `${v.dimension}=${v.band}`).join(', ')}\n  notes: ${x.notes.map(n => `(${n.severity}) ${n.headline}`).join(' | ')}`).join('\n');
  const d = disputes.map(x => `${x.between[0]} vs ${x.between[1]}: ${x.about}. ${x.sideA} // ${x.sideB}`).join('\n');
  return `${brief.slice(0, 1500)}

READS:
${r}

DISAGREEMENTS SAID OUT LOUD:
${d || '(none recorded)'}

Return JSON exactly:
{"lead":"editorId","counterpoint":"editorId (different)","editor":"editorId (different from both)","keepFromCounterpoint":"the one thing from the counterpoint that must survive","verdicts":[{"dimension":"...","band":"Strong|Developing|Needs a rethink","reasoning":"two sentences including the strongest dissent","editorId":"whose band this is"}],"disagreements":[{"between":["editorId","editorId"],"about":"...","sideA":"...","sideB":"..."}],"ariaSummary":"what you say to the author: three or four short paragraphs, starting with what is working, naming where the council split and which side you take, ending with the decision that is theirs"}`;
}

export function replySystem(editorId: EditorId): string {
  const e = EDITORS[editorId];
  return `You are Aria, relaying a reconsideration on behalf of ${e.name} (${e.epithet}). The author has pushed back on a note. Reconsider honestly: if their point is right, say so and withdraw or soften the note; if it is not, hold your position kindly and say what would change your mind. Do not capitulate to be liked, and do not dig in to be right. ${ANTI_SYCOPHANCY} Never rewrite the author's text. ${NOT_LEGAL_ADVICE} ${jsonLine}`;
}
export function replyUser(note: Note, authorReply: string, excerpt?: string): string {
  return `THE NOTE (${note.severity}, ${EDITORS[note.editorId].name}): ${note.headline}\n${note.observation}\nOptions offered: ${note.options.join(' | ')}\n${note.anchor ? `Passage: "${note.anchor.quote}"` : ''}${excerpt ? `\nMore context: "${excerpt.slice(0, 800)}"` : ''}\n\nTHE AUTHOR REPLIES: ${authorReply.slice(0, 1200)}\n\nReturn JSON: {"stance":"HOLDS|SOFTENS|WITHDRAWS","reconsideration":"two to four sentences to the author, warm and direct","revisedOptions":["optional replacement options"]}`;
}

export function reflectionUser(self: EditorId, summary: string): string {
  return `The reading is over. Aria told the author: ${summary.slice(0, 700)}\n\nIn one or two sentences, first person, write the note you would add to your own working notes: what this manuscript moved in your thinking, or something you would ask sooner next time. Return JSON: {"note":"..."}`;
}

/* ─── Readers ───────────────────────────────────────────────────────────────────────────────── */
export function parseJson<T = any>(text: string): T | null {
  if (!text) return null; const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/); const body = fence ? fence[1] : text;
  const s = body.indexOf('{'), e = body.lastIndexOf('}'); if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
}
const str = (v: unknown, max = 900) => String(v ?? '').trim().slice(0, max);
const isId = (v: unknown): v is EditorId => typeof v === 'string' && v in EDITORS;
const BANDS: Band[] = ['Strong', 'Developing', 'Needs a rethink'];
const SEVS: Severity[] = ['Craft', 'Clarity', 'Risk'];
const normBand = (v: unknown): Band | null => { const s = str(v, 40).toLowerCase(); return BANDS.find(b => b.toLowerCase() === s) ?? (s.startsWith('needs') ? 'Needs a rethink' : s.startsWith('dev') ? 'Developing' : s.startsWith('strong') ? 'Strong' : null); };
const normSev = (v: unknown): Severity => SEVS.find(s => s.toLowerCase() === str(v, 20).toLowerCase()) ?? 'Craft';
const ORDERS = /\byou (?:must|have to|need to|should)\b/i;

export interface EditorRead { editorId: EditorId; working: Working[]; verdicts: Verdict[]; notes: Note[]; arguesWith?: { editorId: EditorId; about: string }; droppedQuotes: number }

export function readEditorRead(id: EditorId, raw: any, flat: Flat, maxNotes = 7): EditorRead | null {
  if (!raw || typeof raw !== 'object') return null; let dropped = 0;
  const working: Working[] = [];
  for (const w of Array.isArray(raw.working) ? raw.working.slice(0, 4) : []) {
    const anchor = locateQuote(flat, str(w?.quote, 400)); const why = str(w?.why, 500);
    if (!anchor || !why) { dropped++; continue; }   // praise you cannot quote is flattery
    working.push({ editorId: id, text: why, anchor });
  }
  const verdicts: Verdict[] = [];
  for (const v of Array.isArray(raw.verdicts) ? raw.verdicts : []) { const band = normBand(v?.band); const dim = str(v?.dimension, 30).toLowerCase(); if (band && dim && str(v?.reasoning)) verdicts.push({ dimension: dim, band, reasoning: str(v.reasoning, 600), editorId: id }); }
  const notes: Note[] = [];
  for (const n of (Array.isArray(raw.notes) ? raw.notes : []).slice(0, maxNotes)) {
    const headline = str(n?.headline, 160), observation = str(n?.observation, 900); if (!headline || !observation) continue;
    const quote = str(n?.quote, 400); const anchor: Anchor | undefined = quote ? locateQuote(flat, quote) : undefined; if (quote && !anchor) dropped++;
    let options = (Array.isArray(n?.options) ? n.options : []).map((o: unknown) => str(o, 400)).filter(Boolean).filter((o: string) => !ORDERS.test(o)).slice(0, 4);
    if (options.length < 2) options = [...options, 'Leave it as it is, if it is a deliberate choice.'].slice(0, 4);
    let yourCall = str(n?.yourCall, 400); if (!/^your call\b/i.test(yourCall)) yourCall = `Your call: ${yourCall || 'this would change if the choice is deliberate and you can say why.'}`;
    const fpr = fingerprintOf(`ai:${id}`, `${headline}|${anchor?.quote ?? ''}`);
    notes.push({ id: `a-${fpr}`, editorId: id, severity: normSev(n?.severity), dimension: str(n?.dimension, 30).toLowerCase() || 'prose', fingerprint: fpr, headline, observation, anchor, options, yourCall, source: 'ai' });
  }
  if (!working.length && !notes.length && !verdicts.length) return null;
  const a = raw.arguesWith; const arguesWith = a && isId(a.editorId) && a.editorId !== id ? { editorId: a.editorId, about: str(a.about, 400) } : undefined;
  return { editorId: id, working, verdicts, notes, arguesWith, droppedQuotes: dropped };
}
export function readDispute(from: EditorId, raw: any, allowed: EditorId[]): Disagreement | null {
  if (!raw || !isId(raw.against) || raw.against === from || !allowed.includes(raw.against)) return null; const o = str(raw.objection, 700); if (!o) return null;
  return { between: [from, raw.against], about: str(raw.about, 200) || 'the reading', sideA: o, sideB: str(raw.concession, 300) ? `Concession from ${EDITORS[from].epithet}: ${str(raw.concession, 300)}` : '' };
}
export interface SynthesisRead { lead: EditorId; counterpoint: EditorId; editor: EditorId; keepFromCounterpoint: string; verdicts: Verdict[]; disagreements: Disagreement[]; ariaSummary: string }
export function readSynthesis(raw: any, ids: EditorId[]): SynthesisRead | null {
  if (!raw || !isId(raw.lead) || !ids.includes(raw.lead)) return null;
  const counterpoint = isId(raw.counterpoint) && raw.counterpoint !== raw.lead && ids.includes(raw.counterpoint) ? raw.counterpoint : ids.find(i => i !== raw.lead)!;
  const editor = isId(raw.editor) && raw.editor !== raw.lead && raw.editor !== counterpoint && ids.includes(raw.editor) ? raw.editor : ids.find(i => i !== raw.lead && i !== counterpoint) ?? counterpoint;
  const verdicts: Verdict[] = (Array.isArray(raw.verdicts) ? raw.verdicts : []).map((v: any) => ({ dimension: str(v?.dimension, 30).toLowerCase(), band: normBand(v?.band), reasoning: str(v?.reasoning, 600), editorId: isId(v?.editorId) ? v.editorId : undefined })).filter((v: any) => v.band && v.dimension && v.reasoning);
  const disagreements: Disagreement[] = (Array.isArray(raw.disagreements) ? raw.disagreements : []).filter((d: any) => Array.isArray(d?.between) && isId(d.between[0]) && isId(d.between[1]) && d.between[0] !== d.between[1]).slice(0, 4).map((d: any) => ({ between: [d.between[0], d.between[1]] as [EditorId, EditorId], about: str(d.about, 200), sideA: str(d.sideA, 400), sideB: str(d.sideB, 400) }));
  const ariaSummary = str(raw.ariaSummary, 2800); if (!ariaSummary) return null;
  return { lead: raw.lead, counterpoint, editor, keepFromCounterpoint: str(raw.keepFromCounterpoint, 500), verdicts, disagreements, ariaSummary };
}
export function readReply(raw: any): { stance: 'HOLDS' | 'SOFTENS' | 'WITHDRAWS'; reconsideration: string; revisedOptions?: string[] } | null {
  if (!raw) return null; const s = str(raw.stance, 20).toUpperCase(); const reconsideration = str(raw.reconsideration, 1200); if (!reconsideration) return null;
  const stance = s === 'SOFTENS' || s === 'WITHDRAWS' ? s : 'HOLDS';
  const rev = Array.isArray(raw.revisedOptions) ? raw.revisedOptions.map((o: unknown) => str(o, 400)).filter(Boolean).slice(0, 4) : undefined;
  return { stance, reconsideration, ...(rev?.length ? { revisedOptions: rev } : {}) };
}
