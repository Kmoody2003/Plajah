// Deterministic council reviews. Every seat has rules that encode its lens, so the council gives a real, specific
// review with no network and no model — and when models do speak, they start from these findings rather than from a
// blank page. Fix ids are actions the planner can apply to the worksheet in one click.
import type { Worksheet } from '../yearCurriculum/types';
import { bandOf, gradeNum } from '../yearCurriculum/types';
import { analyzePassage, FK_TARGET, GLOBAL_NAMES } from '../yearCurriculum/storyIntel';
import { passageById } from '../../data/yearCurriculum/passages';
import { COUNCIL_SEATS } from './members';

export type FixId = 'fewer-items' | 'worked-example' | 'fewer-choices' | 'chunk' | 'sentence-frames' | 'read-aloud' | 'calm-page' | 'more-challenge' | 'visual-models';
export const FIX_LABEL: Record<FixId, string> = {
  'fewer-items': 'Trim to an age-appropriate number of items',
  'worked-example': 'Lead with a worked example',
  'fewer-choices': 'Reduce answer choices to three',
  'chunk': 'Chunk into parts with checkpoints',
  'sentence-frames': 'Add sentence frames for writing',
  'read-aloud': 'Add read-aloud markers',
  'calm-page': 'Use the calm, low-stimulus page',
  'more-challenge': 'Add a stretch challenge',
  'visual-models': 'Add visual models (concrete → pictorial)',
};

export interface Finding { seat: string; tone: 'praise' | 'concern' | 'suggestion'; note: string; fix?: FixId }

const MAX_ITEMS = (g: number) => (g === 0 ? 8 : g <= 2 ? 10 : g <= 5 ? 14 : 18);
const ATTENTION_MIN = (g: number) => (g === 0 ? 15 : g <= 2 ? 20 : g <= 5 ? 30 : 40);

export function reviewHeuristic(ws: Worksheet): Finding[] {
  const f: Finding[] = [];
  const g = gradeNum(ws.grade);
  const items = ws.sections.filter(s => s.kind !== 'reflect').flatMap(s => s.items);
  const s = ws.profile.supports || {};
  const ids = new Set(ws.profile.identities || []);
  const hasWorked = ws.sections.some(x => x.kind === 'worked');
  const visuals = items.filter(i => i.visual).length;
  const choiceItems = items.filter(i => i.kind === 'choice');
  const allText = items.map(i => i.prompt).join(' ');
  const namesUsed = GLOBAL_NAMES.filter(n => allText.includes(n));
  const passage = ws.sections.map(x => x.passageId && passageById(x.passageId)).find(Boolean) || undefined;
  const writing = ws.sections.find(x => x.kind === 'writing');

  // Aino — load and calm
  if (items.length > MAX_ITEMS(g)) f.push({ seat: 'helsinki', tone: 'concern', note: `${items.length} items is a lot for ${g === 0 ? 'kindergarten' : `grade ${g}`}; ${MAX_ITEMS(g)} or fewer leaves room for talk.`, fix: 'fewer-items' });
  else f.push({ seat: 'helsinki', tone: 'praise', note: `${items.length} items fits a focused ${ws.minutes || ATTENTION_MIN(g)}-minute block.` });
  if (ws.minutes > ATTENTION_MIN(g)) f.push({ seat: 'helsinki', tone: 'suggestion', note: `At ${ws.minutes} minutes, plan a movement break halfway.` });

  // Wei Ling — CPA and bar models
  if (ws.subject === 'math') {
    if (g <= 4 && visuals === 0 && ws.profile.tier !== 'stretch') f.push({ seat: 'singapore', tone: 'concern', note: 'No pictorial models on the page; younger learners need the picture before the abstract.', fix: 'visual-models' });
    else if (visuals) f.push({ seat: 'singapore', tone: 'praise', note: `${visuals} item${visuals > 1 ? 's' : ''} carry a visual model.` });
    const wordProblems = items.filter(i => /how many|how much|each|altogether|left/i.test(i.prompt) && i.prompt.length > 60).length;
    if (!wordProblems && g >= 1) f.push({ seat: 'singapore', tone: 'suggestion', note: 'Add one story problem so learners model the operation, ideally with a bar model.' });
    if (ws.profile.tier === 'support' && !hasWorked) f.push({ seat: 'singapore', tone: 'concern', note: 'Support version should open with a worked example.', fix: 'worked-example' });
  }

  // Haruto — one rich problem, anticipated misconceptions
  const challenge = ws.sections.find(x => x.kind === 'challenge');
  if (!challenge && ws.profile.tier !== 'support' && ws.subject === 'math') f.push({ seat: 'kyoto', tone: 'suggestion', note: 'There is no rich problem to discuss together; add a challenge that has more than one path.', fix: 'more-challenge' });
  else if (challenge) f.push({ seat: 'kyoto', tone: 'praise', note: 'The challenge with a written explanation gives the class something to compare in neriage.' });

  // Efua — representation, oral language
  if (namesUsed.length >= 2) f.push({ seat: 'accra', tone: 'praise', note: `Story problems include names from many places (${namesUsed.slice(0, 4).join(', ')}).` });
  if (ws.subject === 'ela' && g <= 2) f.push({ seat: 'accra', tone: 'suggestion', note: 'Begin with a read-aloud and a turn-and-talk before children write.' });
  if (ws.profile.homeLanguage && !/^en/i.test(ws.profile.homeLanguage) && !ws.adaptations.some(a => /home language/i.test(a))) f.push({ seat: 'accra', tone: 'concern', note: 'The learner’s home language is not bridged on the page.' });

  // Denise — CCSS rigor, copier budget
  if (!ws.ccss.length) f.push({ seat: 'chicago', tone: 'concern', note: 'No CCSS code attached.' });
  else f.push({ seat: 'chicago', tone: 'praise', note: `Aligned to ${ws.ccss.length} CCSS standard${ws.ccss.length > 1 ? 's' : ''}.` });
  if (ws.subject === 'ela' && passage && !items.some(i => i.skill === 'reading.evidence') && g >= 3) f.push({ seat: 'chicago', tone: 'suggestion', note: 'Add a question that requires quoting the text — CCSS RL/RI.1 asks for evidence.' });

  // Rafael — relevance and agency
  if (ws.profile.interests?.length) f.push({ seat: 'saopaulo', tone: 'praise', note: `Problems speak to the learner’s world (${ws.profile.interests.join(', ')}).` });
  else f.push({ seat: 'saopaulo', tone: 'suggestion', note: 'Ask learners to write one question of their own from their neighborhood.' });

  // Dr. Okafor — stigma, motivation
  f.push({ seat: 'devpsych', tone: 'praise', note: 'The tier is marked only by a small shape, so no child is labelled “support” on their page.' });
  if (!ws.sections.some(x => x.kind === 'reflect') && ws.minutes) f.push({ seat: 'devpsych', tone: 'suggestion', note: 'Add a self-reflection so learners name their own progress.' });

  // Dr. Lindqvist — cognitive load, retrieval
  const levels = items.map(i => i.level);
  const ramps = levels.every((l, i) => i === 0 || l >= levels[i - 1] - 1);
  f.push({ seat: 'learnsci', tone: ramps ? 'praise' : 'suggestion', note: ramps ? 'Items climb in difficulty, which manages cognitive load.' : 'Difficulty jumps around; order items from easier to harder.' });
  if (hasWorked && ws.profile.tier === 'stretch') f.push({ seat: 'learnsci', tone: 'suggestion', note: 'Expert learners gain less from full worked examples (expertise reversal); consider fading it.' });

  // Priya — assessment fidelity, anxiety
  if (/assessment|check/i.test(ws.title) && items.some(i => i.hint)) f.push({ seat: 'schoolpsych', tone: 'suggestion', note: 'Hints on an assessment blur what the data means; keep hints for practice days.' });
  if (s.untimed || (s.extraTime ?? 1) > 1) f.push({ seat: 'schoolpsych', tone: 'praise', note: 'Timing accommodations are honored on the page.' });

  // Marcus — UDL and plan fidelity
  const plan: Array<[boolean, string, FixId]> = [[!!s.fewerChoices, 'fewer choices', 'fewer-choices'], [!!s.chunk || ids.has('adhd'), 'chunking', 'chunk'], [!!(s.readQuestions || s.readAloud), 'read-aloud', 'read-aloud'], [!!(s.calm || s.mutedColor), 'calm page', 'calm-page']];
  for (const [need, label, fix] of plan) {
    const shown = ws.adaptations.some(a => a.toLowerCase().includes(label.split(' ')[0]));
    if (need && !shown) f.push({ seat: 'udl', tone: 'concern', note: `The learner’s plan calls for ${label}, but the page doesn’t show it.`, fix });
  }
  if (g <= 1 && choiceItems.some(i => (i.choices?.length || 0) > 3)) f.push({ seat: 'udl', tone: 'suggestion', note: 'Three choices is plenty for this age.', fix: 'fewer-choices' });
  if (ws.adaptations.length) f.push({ seat: 'udl', tone: 'praise', note: `${ws.adaptations.length} adaptation${ws.adaptations.length > 1 ? 's' : ''} written into the page, listed on the teacher key.` });

  // Yasmin — language load
  if (ws.subject === 'math') {
    const wordy = items.filter(i => i.prompt.split(/\s+/).length > 30).length;
    if (wordy >= 2) f.push({ seat: 'ell', tone: 'concern', note: `${wordy} problems are long in English; consider a glossary or simpler wording so language doesn’t hide the math.` });
  }
  if (writing && !writing.organizer) f.push({ seat: 'ell', tone: 'concern', note: 'Writing has no organizer or sentence frames.', fix: 'sentence-frames' });
  else if (writing) f.push({ seat: 'ell', tone: 'praise', note: 'Writing comes with an organizer to plan in any language first.' });

  // Tomás — feasibility
  f.push({ seat: 'principal', tone: 'praise', note: 'Prints on plain paper and fills on a device; a substitute can teach it from the lesson plan.' });

  // Amelia — standards coherence and readability
  const intlCount = [ws.intl.uk, ws.intl.cambridge, ws.intl.ib, ws.intl.singapore].filter(Boolean).length;
  f.push({ seat: 'curriculum', tone: intlCount >= 3 ? 'praise' : 'suggestion', note: intlCount >= 3 ? `Crosswalked to ${intlCount} international frameworks.` : 'Add the England, Cambridge, IB and Singapore crosswalk.' });
  if (passage) {
    const a = analyzePassage(passage);
    const [lo, hi] = FK_TARGET[bandOf(ws.grade)];
    f.push({ seat: 'curriculum', tone: a.fkGrade > hi + 1 ? 'concern' : 'praise', note: `“${passage.title}”: ${a.words} words, readability ≈ grade ${a.fkGrade} (band target ${lo}–${hi}).` });
  }
  return f;
}

export function seatFindings(all: Finding[], seat: string) { return all.filter(x => x.seat === seat); }

/** Seats to convene by default for a task: teachers + the specialists whose lens the work needs. */
export function defaultSeats(ws: Worksheet | null, task: string): string[] {
  const ids = new Set(['helsinki', 'devpsych', 'learnsci', 'udl', 'curriculum', 'principal']);
  if (ws?.subject === 'math') { ids.add('singapore'); ids.add('kyoto'); } else { ids.add('accra'); ids.add('chicago'); }
  if (ws?.profile.homeLanguage || task === 'adapt-learner') ids.add('ell');
  if (task === 'adapt-learner') ids.add('schoolpsych');
  if (task === 'research') { ids.add('saopaulo'); ids.add('learnsci'); }
  return COUNCIL_SEATS.map(s => s.id).filter(id => ids.has(id));
}
