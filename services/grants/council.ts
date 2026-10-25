/**
 * Grants — the Grant Council.
 *
 * Five seats that read an application the way the people who decide its fate will, then Aria
 * turns their notes into a short, ordered fix list. They work from the applicant's OWN facts and
 * the notice's text — nothing else.
 *
 *   Program Officer    — does this fit what the funder is trying to buy, and is the money used as allowed?
 *   Peer Reviewer      — scores need, approach, outcomes and capacity the way a review panel would
 *   Budget Auditor     — are costs reasonable, allowable, allocable, and does the arithmetic hold?
 *   Compliance Officer — eligibility, registrations, certifications and red flags
 *   Plain-Language Editor — clarity, concision, page limits, voice
 *
 * ── Integrity rules (apply to every seat and to drafting) ────────────────────
 * 1. Never invent a fact. No statistics, outcomes, partners, letters, awards, credentials or dates
 *    the applicant did not supply. A missing fact becomes a visible `[NEEDS YOUR FACT: …]` marker.
 * 2. The council advises; people decide and certify. It never says an application will be funded.
 * 3. It never signs, certifies or attests for anyone.
 * 4. It is honest about uncertainty and about what it cannot see (the full notice, the funder's
 *    unwritten priorities, other applicants).
 * Because models can still drift, `findUnsupportedNumbers` re-checks every number in a draft
 * against the facts we gave it, and the UI shows anything unsupported as a warning.
 *
 * The model lane is injected (like the art council), so the protocol runs under test with no network.
 */

export type SeatId = 'PROGRAM_OFFICER' | 'PEER_REVIEWER' | 'BUDGET_AUDITOR' | 'COMPLIANCE' | 'EDITOR';
/**
 * A model lane: the cloud (Gemini, server-side) or this PC's own model (desktop app). `json` asks the
 * lane for strict JSON output where it supports that. The same council code runs on either lane.
 */
export type ModelFn = (system: string, user: string, maxTokens?: number, opts?: { json?: boolean }) => Promise<string>;

export interface Seat { id: SeatId; name: string; epithet: string; lens: string; asks: string[] }

export const SEATS: Seat[] = [
  { id: 'PROGRAM_OFFICER', name: 'Program Officer', epithet: 'the Program Officer',
    lens: 'You are a federal or foundation program officer who has funded hundreds of projects and watched many fail. You read for fit with the funder\'s stated purpose and for whether the money would be used as the notice allows.',
    asks: ['Does the project do what this notice is trying to buy?', 'Is any cost or activity outside what the notice allows?', 'Would I be comfortable defending this award to my director?'] },
  { id: 'PEER_REVIEWER', name: 'Peer Reviewer', epithet: 'the Peer Reviewer',
    lens: 'You sit on a review panel scoring many applications in a weekend. You score against the notice\'s stated review criteria, reward evidence over adjectives, and notice when a claim has nothing behind it.',
    asks: ['Is the need real and documented with a source, or just asserted?', 'Can I picture who does what, when, and how we would know it worked?', 'Does this applicant have the capacity to deliver?'] },
  { id: 'BUDGET_AUDITOR', name: 'Budget Auditor', epithet: 'the Budget Auditor',
    lens: 'You are a grants accountant fluent in the federal Uniform Guidance (2 CFR 200). A cost must be necessary, reasonable, allocable and allowable. You check the arithmetic and whether the budget matches the narrative.',
    asks: ['Does every cost trace to an activity in the narrative?', 'Do the numbers add up, and is the indirect rate stated and allowed?', 'Is any required match shown with a real source?'] },
  { id: 'COMPLIANCE', name: 'Compliance Officer', epithet: 'the Compliance Officer',
    lens: 'You check that the applicant may legally apply and can legally submit: eligibility type, active registrations, authorized signer, required certifications, conflicts of interest, and anything that would make a technically-correct application get rejected.',
    asks: ['Is this applicant an eligible type for this notice?', 'Are registrations and the authorized representative in place?', 'What would cause a rejection before anyone reads the narrative?'] },
  { id: 'EDITOR', name: 'Plain-Language Editor', epithet: 'the Editor',
    lens: 'You edit for clarity under a page limit. You cut filler, define jargon, lead with the point, and make every sentence earn its place. You keep the applicant\'s voice.',
    asks: ['Could a tired reviewer find the main point in the first paragraph?', 'What can be cut with no loss?', 'Where does the writing say "we are passionate" instead of showing what we do?'] },
];

export const SEAT_BY_ID: Record<SeatId, Seat> = Object.fromEntries(SEATS.map(s => [s.id, s])) as Record<SeatId, Seat>;

export const INTEGRITY = [
  'RULES YOU MUST FOLLOW:',
  '- Use ONLY facts in the APPLICANT FACTS and NOTICE blocks. Never invent statistics, outcomes, partners, letters of support, awards, credentials, dates or dollar amounts.',
  '- If a fact is needed and is not provided, write [NEEDS YOUR FACT: what is needed] — never fill the gap yourself.',
  '- Never predict that the application will or will not be funded. You advise; people decide.',
  '- Never sign, certify or attest for anyone. Certifications belong to the organization\'s authorized representative.',
  '- Say what you cannot see (the full notice, the funder\'s unwritten priorities, other applicants).',
  '- Quote the notice when you cite a requirement; do not paraphrase a rule into something stronger than it says.',
].join('\n');

export interface Facts {
  /** "Label: value" lines from the applicant profile. */
  profileLines: string[];
  /** Free facts the person typed for this application (need data, outcomes, partners…). */
  userFacts: string[];
}
export interface NoticeCtx {
  title: string;
  agency?: string;
  number?: string;
  summary?: string;
  eligibilityText?: string;
  closeDate?: string;
  awardFloor?: number;
  awardCeiling?: number;
  costSharing?: boolean;
}

const block = (title: string, lines: string[]) => `${title}\n${lines.length ? lines.map(l => `- ${l}`).join('\n') : '- (none provided)'}`;

export function noticeBlock(n: NoticeCtx): string {
  return block('NOTICE', [
    `Title: ${n.title}`, n.agency && `Agency: ${n.agency}`, n.number && `Number: ${n.number}`, n.closeDate && `Closes: ${n.closeDate}`,
    n.awardFloor || n.awardCeiling ? `Award range: ${n.awardFloor ?? '?'}–${n.awardCeiling ?? '?'}` : '',
    n.costSharing !== undefined ? `Cost sharing required: ${n.costSharing ? 'yes' : 'no'}` : '',
    n.eligibilityText && `Who may apply (from the notice): ${n.eligibilityText}`, n.summary && `Summary: ${n.summary}`,
  ].filter(Boolean) as string[]);
}
export const factsBlock = (f: Facts) => `${block('APPLICANT FACTS (profile)', f.profileLines)}\n${block('APPLICANT FACTS (typed for this application)', f.userFacts)}`;

// ─── Parsing ─────────────────────────────────────────────────────────────────

export function parseJson<T = any>(raw: string): T | null {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t) as T; } catch { /* fall through */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { /* */ } }
  return null;
}

export const PLACEHOLDER_RE = /\[NEEDS YOUR FACT:[^\]]*\]/g;
export const extractPlaceholders = (text: string): string[] => text.match(PLACEHOLDER_RE) || [];

/**
 * Numbers in the draft that appear nowhere in the facts we supplied. A model may round, convert or
 * make one up; any such figure is shown to the person as "check this". Years and 1–2 digit numbers
 * are ignored (page counts, list numbers); percentages and dollar figures are not.
 */
export function findUnsupportedNumbers(draft: string, sourceText: string): string[] {
  const src = sourceText.replace(/,/g, '');
  const found = new Set<string>();
  const body = draft.replace(PLACEHOLDER_RE, ' ');
  for (const m of body.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)) {
    const shown = m[0].replace(/,$/, '');                // what the reader sees, e.g. "$50,000"
    const tok = shown.replace(/,/g, '');                 // what we compare, e.g. "$50000"
    const digits = tok.replace(/\D/g, '');
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    if (digits.length < 3 && !tok.includes('%') && !tok.includes('$')) continue;
    if (!src.includes(tok) && !src.includes(tok.replace(/^\$/, ''))) found.add(shown);
  }
  return [...found];
}

// ─── Review ──────────────────────────────────────────────────────────────────

export interface SeatReview {
  seat: SeatId;
  score: number;
  verdict: string;
  strengths: string[];
  concerns: string[];
  fixes: string[];
}
export interface CouncilReview {
  readiness: 'ready' | 'revise' | 'not-yet';
  headline: string;
  topFixes: { fix: string; seat: SeatId }[];
  seats: SeatReview[];
  /** Aria's plain note about what the council could not judge. */
  limits: string;
  unsupportedNumbers: string[];
  placeholders: string[];
}

const clampScore = (n: unknown) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));
const strs = (v: unknown, n = 5): string[] => (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 400)).filter(Boolean).slice(0, n);

export function seatSystem(seat: Seat): string {
  return `${seat.lens}\n\nQuestions you always ask:\n${seat.asks.map(a => `- ${a}`).join('\n')}\n\n${INTEGRITY}\n\n`
    + 'Reply with ONLY JSON: {"score":1-5,"verdict":"one sentence","strengths":["…"],"concerns":["…"],"fixes":["specific, doable change"]}. '
    + 'At most 4 items per list. Fixes must be actions the applicant can do this week.';
}

const SYNTH_SYSTEM = 'You are Aria, chairing the Grant Council. Combine the seats\' reviews into a short, ordered plan. Do not average opinions: where seats disagree, say so and pick the safer path. '
  + `${INTEGRITY}\nReply with ONLY JSON: {"readiness":"ready|revise|not-yet","headline":"one sentence, warm and direct","topFixes":[{"fix":"…","seat":"PROGRAM_OFFICER|PEER_REVIEWER|BUDGET_AUDITOR|COMPLIANCE|EDITOR"}],"limits":"what the council could not judge"}. Max 5 fixes, most important first. `
  + '"ready" only if no seat scored below 4 and Compliance found no blocker.';

function reviewText(draft: string, sections?: { title: string; text: string }[]): string {
  return [draft, ...(sections || []).map(s => `## ${s.title}\n${s.text}`)].filter(Boolean).join('\n\n').slice(0, 14000);
}
function reviewUser(notice: NoticeCtx, facts: Facts, text: string): string {
  return `${noticeBlock(notice)}\n\n${factsBlock(facts)}\n\nAPPLICATION TEXT\n${text || '(nothing drafted yet — review readiness from the facts alone)'}`;
}

/** Typical output sizes, from the JSON shapes we ask for (well under the caps). */
const SEAT_OUT = 350, SYNTH_OUT = 400, DRAFT_OUT = 450;
const tok = (chars: number) => Math.ceil(chars / 4);

/** What a council review will send, for cost and time estimates before anything runs. */
export function councilWorkload(opts: { notice: NoticeCtx; facts: Facts; draft: string; sections?: { title: string; text: string }[]; seats?: SeatId[] }) {
  const user = reviewUser(opts.notice, opts.facts, reviewText(opts.draft, opts.sections));
  const seats = (opts.seats?.length ? opts.seats : SEATS.map(s => s.id)).map(id => SEAT_BY_ID[id]);
  const calls = seats.map(seat => ({ inTokens: tok(seatSystem(seat).length + user.length), outTokens: SEAT_OUT }));
  // The synthesis reads the notice plus the seats' JSON.
  calls.push({ inTokens: tok(SYNTH_SYSTEM.length + noticeBlock(opts.notice).length + seats.length * SEAT_OUT * 4), outTokens: SYNTH_OUT });
  return { kind: 'council' as const, calls, parallelGroups: [seats.map((_, i) => i)] };
}

export function draftWorkload(opts: { section: string; notice: NoticeCtx; facts: Facts; instructions?: string }) {
  const sec = SECTIONS[opts.section];
  const sys = sec ? draftSystem(sec) : '';
  return { kind: 'draft' as const, calls: [{ inTokens: tok(sys.length + draftUser(opts).length), outTokens: DRAFT_OUT }], parallelGroups: [] as number[][] };
}

/** Identifiers and personal contact details never go to any model — cloud or local; the writing does not need them. */
export const NOT_FOR_MODEL = new Set(['ein', 'uei', 'repName', 'repEmail', 'repPhone', 'contactName', 'contactEmail', 'contactPhone']);

/** Facts for a model call: the profile minus identifiers and personal contacts, plus what the person typed. */
export function factsFromProfile(profile: Record<string, { value: string }>, typed: unknown, labelOf: (key: string) => string | undefined): Facts {
  const profileLines = Object.entries(profile)
    .filter(([k]) => labelOf(k) && !NOT_FOR_MODEL.has(k))
    .map(([k, v]) => `${labelOf(k)}: ${v.value}`);
  const userFacts = (Array.isArray(typed) ? typed : []).slice(0, 40).map(f => String(f ?? '').slice(0, 600).trim()).filter(Boolean);
  return { profileLines, userFacts };
}

export async function reviewApplication(opts: {
  model: ModelFn; notice: NoticeCtx; facts: Facts; draft: string; sections?: { title: string; text: string }[]; seats?: SeatId[];
}): Promise<CouncilReview> {
  const { model, notice, facts, draft } = opts;
  const text = reviewText(draft, opts.sections);
  const user = reviewUser(notice, facts, text);
  const seats = (opts.seats?.length ? opts.seats : SEATS.map(s => s.id)).map(id => SEAT_BY_ID[id]);

  const reviews = (await Promise.all(seats.map(async (seat): Promise<SeatReview | null> => {
    try {
      const j = parseJson<any>(await model(seatSystem(seat), user, 900, { json: true }));
      if (!j) return null;
      return { seat: seat.id, score: clampScore(j.score), verdict: String(j.verdict || '').slice(0, 300), strengths: strs(j.strengths, 4), concerns: strs(j.concerns, 4), fixes: strs(j.fixes, 4) };
    } catch { return null; }
  }))).filter((r): r is SeatReview => !!r);

  if (!reviews.length) throw new Error('The council could not be reached. Try again in a moment.');

  const synthUser = `${noticeBlock(notice)}\n\nSEAT REVIEWS\n${JSON.stringify(reviews)}`;
  let synth: any = null;
  try {
    synth = parseJson<any>(await model(SYNTH_SYSTEM, synthUser, 700, { json: true }));
  } catch { /* fall back to a deterministic synthesis below */ }

  const avg = reviews.reduce((a, r) => a + r.score, 0) / reviews.length;
  const compliance = reviews.find(r => r.seat === 'COMPLIANCE');
  const fallbackReadiness: CouncilReview['readiness'] = reviews.some(r => r.score <= 2) || (compliance && compliance.score <= 2) ? 'not-yet' : avg >= 4 && reviews.every(r => r.score >= 4) ? 'ready' : 'revise';
  const topFixes = (Array.isArray(synth?.topFixes) ? synth.topFixes : reviews.flatMap(r => r.fixes.slice(0, 1).map(fix => ({ fix, seat: r.seat }))))
    .map((f: any) => ({ fix: String(f.fix).slice(0, 400), seat: (SEAT_BY_ID[f.seat as SeatId] ? f.seat : 'PEER_REVIEWER') as SeatId })).slice(0, 5);

  // Never let the synthesis claim "ready" over a low score or a compliance blocker.
  let readiness: CouncilReview['readiness'] = ['ready', 'revise', 'not-yet'].includes(synth?.readiness) ? synth.readiness : fallbackReadiness;
  if (readiness === 'ready' && fallbackReadiness !== 'ready') readiness = fallbackReadiness;

  return {
    readiness,
    headline: String(synth?.headline || (readiness === 'ready' ? 'The council sees no blockers.' : 'The council has changes to suggest before you submit.')).slice(0, 300),
    topFixes, seats: reviews,
    limits: String(synth?.limits || 'The council cannot see the full notice, the funder\'s unwritten priorities, or other applicants, and it does not decide who is funded.').slice(0, 400),
    unsupportedNumbers: findUnsupportedNumbers(text, `${factsBlock(facts)}\n${noticeBlock(notice)}`),
    placeholders: extractPlaceholders(text),
  };
}

// ─── Drafting ────────────────────────────────────────────────────────────────

export const SECTIONS: Record<string, { title: string; guide: string }> = {
  need: { title: 'Statement of need', guide: 'Who is affected, how many, where, and what the evidence is. Lead with the clearest, sourced fact. Cite only sources the applicant provided.' },
  goals: { title: 'Goals and objectives', guide: 'One broad goal; 2–4 SMART objectives (specific, measurable, time-bound). Use only targets the applicant gave.' },
  approach: { title: 'Project approach / activities', guide: 'What happens, in what order, who does it, where, and why this approach. A reviewer should be able to picture a week of the project.' },
  evaluation: { title: 'Evaluation plan', guide: 'What you will measure, how you will collect it, who reviews it, and how results change the work. Tie each measure to an objective.' },
  capacity: { title: 'Organizational capacity', guide: 'Why this organization can deliver: history, staff, systems, experience, fiscal management. Facts only.' },
  sustainability: { title: 'Sustainability', guide: 'How the work continues after the grant: other funding, partnerships, earned income, institutional commitment.' },
  budgetJustification: { title: 'Budget justification', guide: 'For each budget line: what it buys, how the amount was calculated, and which activity it supports. Show the arithmetic.' },
  capability: { title: 'Capability statement', guide: 'A one-page summary for a government buyer: what you do, your NAICS codes, certifications, past performance (named customers and what you delivered), key people, and how to contact you. Facts only; no claims you cannot document.' },
  title: { title: 'Project title', guide: 'A specific title under 12 words that says what happens and where.' },
};

function draftSystem(sec: { title: string; guide: string }): string {
  return `You are a grant writer helping a first-time applicant. Draft the "${sec.title}" section.\n${sec.guide}\n\n${INTEGRITY}\n\n`
    + 'Write in plain, concrete language in the applicant\'s voice ("we"). Keep it to roughly 250 words unless the notice sets a limit. Output only the draft text.';
}
function draftUser(opts: { notice: NoticeCtx; facts: Facts; instructions?: string }): string {
  return `${noticeBlock(opts.notice)}\n\n${factsBlock(opts.facts)}${opts.instructions ? `\n\nPERSON'S INSTRUCTIONS\n${opts.instructions.slice(0, 600)}` : ''}`;
}

export async function draftSection(opts: { model: ModelFn; section: string; notice: NoticeCtx; facts: Facts; instructions?: string }): Promise<{ text: string; placeholders: string[]; unsupportedNumbers: string[] }> {
  const sec = SECTIONS[opts.section];
  if (!sec) throw new Error('unknown section');
  const text = (await opts.model(draftSystem(sec), draftUser(opts), 900)).trim();
  return {
    text,
    placeholders: extractPlaceholders(text),
    unsupportedNumbers: findUnsupportedNumbers(text, `${factsBlock(opts.facts)}\n${noticeBlock(opts.notice)}`),
  };
}
