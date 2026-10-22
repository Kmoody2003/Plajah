// Convening the Education Council on a piece of work.
//
//   1. Baseline   — every seat's deterministic findings (heuristics.ts). Always runs, always shown.
//   2. Seats      — each convened seat reasons on its own model lane (modelStack.ts), starting from its baseline, and
//                   returns a verdict, notes and fix ids. Seats run in parallel.
//   3. Chair      — synthesises: what the council agrees on, where it disagrees, the decisions, and which fixes to apply.
//   4. Apply      — fixes are pure transformations of the worksheet profile/sections (applyFixes), so the teacher sees
//                   the revised page before keeping it.
// Offline (or with every lane down) steps 2–3 fall back to the baseline, and the transcript says so.
import type { Worksheet, DayLesson } from '../yearCurriculum/types';
import { GRADE_LABEL } from '../yearCurriculum/types';
import { adaptWorksheet, buildWorksheet } from '../yearCurriculum/worksheetBuilder';
import { workedExample } from '../yearCurriculum/mathSkills';
import { makeRng } from '../yearCurriculum/rng';
import { storyWorld } from '../yearCurriculum/storyIntel';
import { COUNCIL_SEATS, seatById, type Lane } from './members';
import { reviewHeuristic, seatFindings, defaultSeats, FIX_LABEL, type Finding, type FixId } from './heuristics';
import { runLane, extractJson, UNTRUSTED_NOTE } from './modelStack';

export type CouncilTask = 'review-worksheet' | 'adapt-learner' | 'design-unit' | 'research';
export const TASK_LABEL: Record<CouncilTask, string> = {
  'review-worksheet': 'Review this worksheet',
  'adapt-learner': 'Adapt it for a learner',
  'design-unit': 'Improve the unit plan',
  'research': 'Ask a research question',
};

export interface SeatReview {
  seat: string;
  verdict: 'approve' | 'revise';
  notes: string[];
  fixes: FixId[];
  lane: Lane;
  model?: string;
  baseline: Finding[];
}

export interface CouncilSession {
  id: string;
  task: CouncilTask;
  question?: string;
  target: { lessonId?: string; title?: string; grade?: string };
  reviews: SeatReview[];
  synthesis: { summary: string; agreements: string[]; tensions: string[]; decisions: string[]; fixes: FixId[]; approve: number; revise: number; lane: Lane; model?: string };
  offline: boolean;
  createdAt: number;
}

const FIX_IDS = Object.keys(FIX_LABEL) as FixId[];

function summarize(ws: Worksheet): string {
  const lines = [
    `Worksheet: “${ws.title}” — ${GRADE_LABEL[ws.grade]} ${ws.subject.toUpperCase()}, tier ${ws.profile.tier}, about ${ws.minutes || 'untimed'} min.`,
    `Target: ${ws.objective}`,
    `Standards: ${ws.ccss.join(', ')} | England ${ws.intl.uk || '—'} | Cambridge ${ws.intl.cambridge || '—'} | ${ws.intl.ib || 'IB —'} | Singapore ${ws.intl.singapore || '—'}`,
    `Learner profile: supports ${JSON.stringify(ws.profile.supports || {})}; identities ${(ws.profile.identities || []).join(', ') || 'none'}; interests ${(ws.profile.interests || []).join(', ') || 'none'}; home language ${ws.profile.homeLanguage || 'English'}.`,
    `Adaptations applied: ${ws.adaptations.join(' | ') || 'none'}`,
    ...ws.sections.map(s => `[${s.kind}] ${s.title}: ${s.items.slice(0, 6).map(i => `(${i.kind}, L${i.level}) ${i.prompt.slice(0, 140)}`).join(' / ')}${s.items.length > 6 ? ` … +${s.items.length - 6} more` : ''}${s.organizer ? ` organizer: ${s.organizer.join(', ')}` : ''}`),
  ];
  return lines.join('\n');
}

function seatSystem(seatId: string): string {
  const s = seatById(seatId)!;
  return `You hold the "${s.title}" seat on Plajah's global Education Council (${s.region}; tradition: ${s.tradition}). ` +
    `Your lens: ${s.lens.join('; ')}. Conviction: ${s.conviction} Touchstones you may cite: ${s.touchstones.join('; ')}. ` +
    `Speak as an experienced professional colleague: specific, kind, practical, evidence-aware; never invent studies or statistics. ` +
    `${UNTRUSTED_NOTE} Reply with JSON only: {"verdict":"approve"|"revise","notes":["≤40 words each, max 3"],"fixes":[subset of ${FIX_IDS.join(', ')}]}`;
}

export async function convene(input: { task: CouncilTask; worksheet?: Worksheet; lesson?: DayLesson; question?: string; seats?: string[]; offline?: boolean }): Promise<CouncilSession> {
  const ws = input.worksheet || null;
  const baseline = ws ? reviewHeuristic(ws) : [];
  const seats = input.seats?.length ? input.seats : defaultSeats(ws, input.task);
  const brief = [
    `Task: ${TASK_LABEL[input.task]}.`,
    input.question ? `Teacher's question: <<<${input.question.slice(0, 1200)}>>>` : '',
    input.lesson ? `Lesson: ${input.lesson.title} (${input.lesson.unitTitle}, week ${input.lesson.week} day ${input.lesson.day}). Warm-up: ${input.lesson.warmUp} I do: ${input.lesson.miniLesson.iDo} We do: ${input.lesson.miniLesson.weDo} You do: ${input.lesson.miniLesson.youDo}` : '',
    ws ? summarize(ws) : '',
  ].filter(Boolean).join('\n\n');

  const reviews: SeatReview[] = await Promise.all(seats.map(async (id): Promise<SeatReview> => {
    const seat = seatById(id)!;
    const mine = seatFindings(baseline, id);
    const fallback: SeatReview = {
      seat: id, lane: 'heuristic', baseline: mine,
      verdict: mine.some(f => f.tone === 'concern') ? 'revise' : 'approve',
      notes: mine.length ? mine.map(f => f.note) : [`From the ${seat.lens[0]} lens, nothing to flag.`],
      fixes: mine.map(f => f.fix).filter((x): x is FixId => !!x),
    };
    const r = await runLane(seat.lane, seatSystem(id), `${brief}\n\nYour rule-based pre-review found:\n${mine.map(f => `- (${f.tone}) ${f.note}`).join('\n') || '- nothing specific'}\n\nGive your review.`, { offline: input.offline, maxTokens: 900 });
    const j = r.ok ? extractJson<{ verdict?: string; notes?: string[]; fixes?: string[] }>(r.text) : null;
    if (!j) return fallback;
    return {
      seat: id, lane: r.lane, model: r.model, baseline: mine,
      verdict: j.verdict === 'revise' ? 'revise' : 'approve',
      notes: (j.notes || []).slice(0, 3).map(n => String(n).slice(0, 400)),
      fixes: [...new Set([...(j.fixes || []).filter((x): x is FixId => FIX_IDS.includes(x as FixId)), ...fallback.fixes])],
    };
  }));

  const approve = reviews.filter(r => r.verdict === 'approve').length, revise = reviews.length - approve;
  const fixCount = new Map<FixId, number>();
  reviews.forEach(r => r.fixes.forEach(f => fixCount.set(f, (fixCount.get(f) || 0) + 1)));
  const fixes = [...fixCount.entries()].filter(([f, n]) => n >= 2 || baseline.some(b => b.fix === f && b.tone === 'concern')).map(([f]) => f);
  const offline = reviews.every(r => r.lane === 'heuristic');

  const transcript = reviews.map(r => `${seatById(r.seat)!.title} (${seatById(r.seat)!.region}) — ${r.verdict}: ${r.notes.join(' ')}`).join('\n');
  const chair = await runLane('claude',
    `You chair Plajah's global Education Council: teachers, researchers, child psychologists, specialists and school leaders from six continents. ` +
    `Synthesise the members' reviews for the teacher. Be concrete and brief. Name real disagreements honestly rather than smoothing them over. ${UNTRUSTED_NOTE} ` +
    `Reply with JSON only: {"summary":"≤80 words","agreements":["≤25 words",…max 3],"tensions":["≤30 words",…max 2],"decisions":["≤25 words, an action",…max 4]}`,
    `${brief}\n\nMember reviews:\n${transcript}\n\nFixes most members asked for: ${fixes.map(f => FIX_LABEL[f]).join('; ') || 'none'}.`,
    { tier: 'chair', offline: input.offline || offline, maxTokens: 1200 });
  const cj = chair.ok ? extractJson<{ summary?: string; agreements?: string[]; tensions?: string[]; decisions?: string[] }>(chair.text) : null;

  const concerns = baseline.filter(b => b.tone === 'concern');
  const praise = baseline.filter(b => b.tone === 'praise');
  const synthesis = cj ? {
    summary: String(cj.summary || ''), agreements: (cj.agreements || []).slice(0, 3), tensions: (cj.tensions || []).slice(0, 2), decisions: (cj.decisions || []).slice(0, 4),
    fixes, approve, revise, lane: chair.lane, model: chair.model,
  } : {
    summary: input.task === 'research' && !ws
      ? 'The council could not reach its model lanes, so it cannot answer an open research question right now. Try again online.'
      : `${approve} of ${reviews.length} seats approve${revise ? `; ${revise} ask for revisions` : ''}. ${concerns.length ? `Main concerns: ${concerns.slice(0, 2).map(c => c.note.replace(/\.$/, '')).join('; ')}.` : 'No blocking concerns.'}`,
    agreements: praise.slice(0, 3).map(p => p.note),
    tensions: ws?.profile.tier === 'stretch' && baseline.some(b => b.seat === 'learnsci' && /expertise/.test(b.note)) ? ['Worked examples help most learners, but learning science warns they can slow experts — keep or fade it?'] : [],
    decisions: fixes.map(f => FIX_LABEL[f]),
    fixes, approve, revise, lane: 'heuristic' as Lane,
  };

  return {
    id: `edc_${Date.now().toString(36)}`, task: input.task, question: input.question,
    target: { lessonId: ws?.lessonId || input.lesson?.id, title: ws?.title || input.lesson?.title, grade: ws?.grade || input.lesson?.grade },
    reviews, synthesis, offline: offline && synthesis.lane === 'heuristic', createdAt: Date.now(),
  };
}

/** Apply council fixes to a worksheet. Profile-level fixes re-run adaptation; structural ones edit sections. */
export function applyFixes(ws: Worksheet, fixes: FixId[], lesson?: DayLesson): Worksheet {
  let profile = { ...ws.profile, supports: { ...(ws.profile.supports || {}) } };
  if (fixes.includes('fewer-choices')) profile.supports.fewerChoices = true;
  if (fixes.includes('chunk')) profile.supports.chunk = true;
  if (fixes.includes('read-aloud')) profile.supports.readQuestions = true;
  if (fixes.includes('calm-page')) profile.supports.calm = true;
  let next: Worksheet = lesson ? buildWorksheet(lesson, profile, { seed: ws.seed, themeId: ws.themeId }) : adaptWorksheet({ ...ws, profile, adaptations: [] });
  let sections = next.sections.map(s => ({ ...s, items: [...s.items] }));
  const notes = [...next.adaptations];
  if (fixes.includes('fewer-items')) {
    const cap = ws.grade === 'k' ? 6 : ['g1', 'g2'].includes(ws.grade) ? 8 : 12;
    let left = cap;
    sections = sections.map(s => { if (s.kind === 'reflect' || s.kind === 'writing') return s; const keep = s.items.slice(0, Math.max(1, Math.min(s.items.length, left))); left -= keep.length; return { ...s, items: keep }; }).filter(s => s.items.length || s.kind !== 'practice');
    notes.push(`Council: trimmed to ${cap} items for this age.`);
  }
  if (fixes.includes('worked-example') && ws.subject === 'math' && !sections.some(s => s.kind === 'worked')) {
    const skill = sections.flatMap(s => s.items).find(i => !i.skill.startsWith('math.'))?.skill;
    const ex = skill ? workedExample(skill, { rng: makeRng(ws.seed), level: 1, tier: 'core', params: {}, world: storyWorld(makeRng(ws.seed)), idx: 0 }) : undefined;
    if (ex) { sections.unshift({ id: 'worked', kind: 'worked', title: 'Watch me: worked example', directions: 'Read each step, then try the ones below the same way.', items: [], example: ex }); notes.push('Council: added a worked example.'); }
  }
  if (fixes.includes('sentence-frames')) {
    sections = sections.map(s => (s.kind === 'writing' && !s.organizer ? { ...s, organizer: ['I think…', 'One reason is…', 'For example…', 'In conclusion…'] } : s));
    notes.push('Council: added sentence frames to the writing.');
  }
  if (fixes.includes('visual-models')) {
    let added = 0;
    sections = sections.map(s => ({ ...s, items: s.items.map(it => {
      if (it.visual || !it.numeric) return it;
      const r = it.prompt.match(/Round ([\d,]+) to the nearest ([\d,]+)/);
      if (r) { const n = Number(r[1].replace(/,/g, '')), to = Number(r[2].replace(/,/g, '')), lo = Math.floor(n / to) * to; added++; return { ...it, visual: { type: 'numberline' as const, min: lo, max: lo + to, step: to / 10, marks: [n], labels: 'ends' as const } }; }
      const a = it.prompt.match(/(\d+)\s*[+−]\s*(\d+)/);
      if (a && Number(a[1]) <= 20 && Number(a[2]) <= 20) { added++; return { ...it, visual: { type: 'numberline' as const, min: 0, max: 20, step: 1, labels: 'all' as const } }; }
      return it;
    }) }));
    notes.push(added ? `Council: drew number lines beside ${added} problem${added > 1 ? 's' : ''}.` : 'Council: visual models requested — the Support tier draws pictorial models for this skill.');
  }
  if (fixes.includes('more-challenge') && !sections.some(s => s.kind === 'challenge')) {
    sections.splice(Math.max(0, sections.length - 1), 0, { id: 'challenge', kind: 'challenge', title: 'Challenge', directions: 'More than one way works. Show yours.', items: [{ id: 'cx', kind: 'write', skill: 'math.explain', level: 3, points: 3, lines: 4, prompt: 'Make up your own problem like the ones above, solve it two different ways, and explain which way you prefer.', answer: 'A valid problem, two correct strategies, a reasoned preference.' }] });
    notes.push('Council: added an open challenge.');
  }
  return { ...next, sections, adaptations: notes };
}

export const seatList = () => COUNCIL_SEATS;
