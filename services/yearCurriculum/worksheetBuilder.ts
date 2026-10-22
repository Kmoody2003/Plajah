// Lesson + learner profile → worksheet. The builder chooses sections by lesson kind and subject, asks the skill
// generators for items at a level ladder that fits the tier, pulls the week's passage through story intelligence, and
// then lets adaptation (services/learningSupport supports + identities) reshape the page. Every change adaptation makes
// is written down in plain language on `adaptations`, so the teacher can see exactly what differs between versions.
import type { AdaptProfile, DayLesson, Passage, Tier, Worksheet, WsItem, WsSection } from './types';
import { bandOf, gradeNum } from './types';
import { makeRng, hashStr, type Rng } from './rng';
import { MATH_SKILLS, workedExample, type GenCtx, type GenOut } from './mathSkills';
import { ELA_SKILLS } from './elaSkills';
import { storyWorld, analyzePassage, vocabInContext, sequenceItem, evidenceItem, type StoryWorld } from './storyIntel';
import { skillLabel } from './yearPlan';
import { passageById } from '../../data/yearCurriculum/passages';
import { themeForUnit } from './worksheetThemes';

const ITEM_COUNT: Record<Tier, number> = { support: 6, core: 10, stretch: 12 };
const LADDER: Record<Tier, Array<1 | 2 | 3>> = {
  support: [1, 1, 1, 2, 2, 2, 2, 2],
  core: [1, 1, 2, 2, 2, 2, 3, 2, 3, 3, 3, 3],
  stretch: [2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
};

function genItem(skill: string, ctx: GenCtx): GenOut | null {
  const s = MATH_SKILLS[skill] || ELA_SKILLS[skill];
  if (!s) return null;
  try { return s.gen(ctx); } catch { return null; }
}

function toItem(out: GenOut, id: string, skill: string, level: 1 | 2 | 3): WsItem {
  const kind = out.kind || (out.choices ? 'choice' : 'answer');
  return {
    id, skill, level, kind, prompt: out.prompt, answer: String(out.answer), choices: out.choices, visual: out.visual, hint: out.hint,
    numeric: out.numeric, tolerance: out.tolerance, lines: out.lines, points: kind === 'write' ? 2 : 1,
  };
}

/** n items for a skill, de-duplicated by prompt (generators are random; a page should not repeat itself). */
function itemsFor(skill: string, n: number, tier: Tier, rng: Rng, world: StoryWorld, params: Record<string, number | string> = {}, prefix = 'q', ladder = LADDER[tier]): WsItem[] {
  const out: WsItem[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 6; tries++) {
    const level = ladder[Math.min(out.length, ladder.length - 1)];
    const g = genItem(skill, { rng, level, tier, params, world, idx: out.length + tries });
    if (!g || seen.has(g.prompt)) continue;
    seen.add(g.prompt);
    out.push(toItem(g, `${prefix}${out.length + 1}`, skill, level));
  }
  return out;
}

const reflect = (can: string): WsSection => ({
  id: 'reflect', kind: 'reflect', title: 'How did it go?', directions: 'Circle the face that matches how you feel about today’s target.',
  items: [{ id: 'r1', kind: 'choice', skill: 'reflect', level: 1, points: 0, prompt: can, choices: ['I can teach it', 'I can do it', 'I’m getting there', 'I need help'], answer: '—' }],
});

const WRITING_ORGANIZERS: Record<string, string[]> = {
  opinion: ['My opinion', 'Reason 1 + example', 'Reason 2 + example', 'Closing'],
  argument: ['Claim', 'Evidence 1', 'Evidence 2', 'Counterclaim & rebuttal', 'Conclusion'],
  informative: ['Topic', 'Fact or detail 1', 'Fact or detail 2', 'Fact or detail 3', 'Conclusion'],
  research: ['Question', 'Source 1 says…', 'Source 2 says…', 'What I conclude'],
  narrative: ['Characters & setting', 'Problem', 'Events', 'Solution & ending'],
  poetry: ['Topic or image', 'Senses: see / hear / feel', 'Strong words', 'Line break plan'],
  sentence: ['Who?', 'Does what?', 'Where / when?'],
};

function writingPrompt(mode: string, p: Passage | undefined, world: StoryWorld, grade: number): string {
  if (p?.writePrompt && mode !== 'poetry') return p.writePrompt;
  const topic = world.interest === 'school' ? 'your school' : world.interest;
  const by: Record<string, string> = {
    opinion: `What is the best thing about ${topic}? Give your opinion and at least two reasons.`,
    argument: `Should every school have more time for ${topic}? Make a claim, support it with evidence, and answer a counterclaim.`,
    informative: `Teach a younger student about ${topic}. Explain three important facts.`,
    research: `What question do you have about ${topic}? Plan how you would research it and what you expect to find.`,
    narrative: `Write a story about a day at ${world.place} when something surprising happened.`,
    poetry: `Write a poem about ${p ? `an image from “${p.title}”` : topic}. Use at least one simile.`,
    sentence: `Write ${grade === 0 ? 'one sentence' : 'three sentences'} about ${world.place}.`,
  };
  return by[mode] || by.narrative;
}

function readingSection(p: Passage, tier: Tier, rng: Rng, grade: number, withIntel: boolean): WsSection[] {
  const a = analyzePassage(p);
  const choicesN = grade <= 1 || tier === 'support' ? 3 : 4;
  const qs = (tier === 'support' ? p.questions.filter(q => q.level <= 2).slice(0, 3) : p.questions).map((q, i): WsItem => {
    const correct = q.choices[0];
    const shown = rng.shuffle([correct, ...rng.sample(q.choices.slice(1), choicesN - 1)]);
    return { id: `p${i + 1}`, kind: 'choice', skill: `reading.${q.type}`, level: q.level, points: 1, prompt: q.q, choices: shown, answer: correct };
  });
  const extra: WsItem[] = [];
  if (withIntel && p.vocab.length >= 2) extra.push(...vocabInContext(p, a, rng, tier === 'support' ? 1 : 2, choicesN));
  if (withIntel && tier !== 'support') { const s = sequenceItem(p, a, rng); if (s && p.genre !== 'poetry' && p.genre !== 'informational') extra.push(s); }
  if (tier !== 'support' && grade >= 2) extra.push(evidenceItem(p, a));
  return [
    { id: 'read', kind: 'reading', title: p.title, directions: grade <= 1 ? 'Listen and follow along. Then read it with a buddy.' : 'Read the passage. Mark words you don’t know and ideas that matter.', items: [], passageId: p.id },
    { id: 'comp', kind: 'practice', title: 'Show what you understood', directions: 'Choose the best answer. Look back at the text to check.', items: [...qs, ...extra.map((x, i) => ({ ...x, id: `x${i + 1}` }))] },
  ];
}

export interface BuildOptions { seed?: number; themeId?: string }

export function buildWorksheet(lesson: DayLesson, profile: AdaptProfile, opts: BuildOptions = {}): Worksheet {
  const tier = profile.tier;
  const seed = opts.seed ?? hashStr(`${lesson.id}|${tier}|${(profile.interests || []).join(',')}`);
  const rng = makeRng(seed);
  const world = storyWorld(rng, profile.interests, profile.learnerName);
  const g = gradeNum(lesson.grade);
  const sections: WsSection[] = [];
  const passage = lesson.passageId ? passageById(lesson.passageId) : undefined;
  const count = ITEM_COUNT[tier];
  const primary = lesson.skills[0];

  if (lesson.subject === 'math') {
    if (lesson.kind === 'learn' || lesson.kind === 'practice') {
      if (tier === 'support' || lesson.kind === 'learn') {
        const ex = workedExample(primary.skill, { rng, level: 1, tier, params: primary.params || {}, world, idx: 99 });
        if (ex) sections.push({ id: 'worked', kind: 'worked', title: 'Watch me: worked example', directions: 'Read each step. Then try the ones below the same way.', items: [], example: ex });
      }
      const wordSkill = /\.word$/.test(primary.skill) ? null : lesson.skills.find(s => /word/.test(s.skill));
      sections.push({ id: 'practice', kind: 'practice', title: `Practice: ${skillLabel(primary.skill)}`, directions: tier === 'support' ? 'Take your time. Use the example and the hints.' : 'Show your work. Check each answer.', items: itemsFor(primary.skill, count - (wordSkill ? 2 : 0), tier, rng, world, primary.params) });
      if (wordSkill) sections.push({ id: 'story', kind: 'practice', title: 'Story problems', directions: 'Read twice. Draw a picture or model if it helps.', items: itemsFor(wordSkill.skill, 2, tier, rng, world, wordSkill.params, 'w') });
      if (tier !== 'support') sections.push({ id: 'challenge', kind: 'challenge', title: 'Challenge', directions: 'Stretch your thinking.', items: [...itemsFor(primary.skill, tier === 'stretch' ? 2 : 1, 'stretch', rng, world, primary.params, 'c', [3, 3]), { id: 'cx', kind: 'write', skill: 'math.explain', level: 3, points: 2, lines: 3, prompt: `Explain how you solved one problem above so a classmate could follow your steps. Use the word${lesson.vocab.length > 1 ? 's' : ''} ${lesson.vocab.slice(0, 2).join(' and ')}.`, answer: 'Clear steps, correct vocabulary, answer checked.' }] });
    } else if (lesson.kind === 'review' || lesson.kind === 'launch' || lesson.kind === 'assess') {
      const per = Math.max(2, Math.round((lesson.kind === 'assess' ? count + 4 : count) / lesson.skills.length));
      lesson.skills.forEach((s, i) => sections.push({ id: `s${i}`, kind: 'practice', title: skillLabel(s.skill), directions: lesson.kind === 'launch' ? 'Try what you can. It’s okay not to know yet!' : 'Show your work.', items: itemsFor(s.skill, per, lesson.kind === 'launch' ? 'support' : tier, rng, world, s.params, `s${i}q`) }));
    } else {
      sections.push({ id: 'task', kind: 'writing', title: 'Performance task', directions: lesson.miniLesson.iDo.replace(/^Present the task: /, ''), organizer: ['What do I know?', 'What do I need to find?', 'My plan', 'My solution', 'How I checked'], items: [{ id: 't1', kind: 'write', skill: 'math.task', level: 3, points: 8, lines: 8, prompt: 'Show all of your work and explain your solution.', answer: 'Score with the unit rubric: accuracy, reasoning, communication, real-world connection.' }] });
      sections.push({ id: 'skills', kind: 'practice', title: 'Skills check', directions: 'Quick check of the unit skills.', items: lesson.skills.flatMap((s, i) => itemsFor(s.skill, 1, tier, rng, world, s.params, `k${i}`)) });
    }
  } else {
    const mode = lesson.writing || 'narrative';
    const lang = lesson.skills.find(s => !s.skill.startsWith('reading.') && !s.skill.startsWith('writing.'));
    const writeSec = (lines: number): WsSection => ({
      id: 'write', kind: 'writing', title: `Write: ${skillLabel(`writing.${g === 0 && mode !== 'poetry' ? 'sentence' : mode}`)}`, directions: g <= 1 ? 'Draw a picture, then write about it.' : 'Plan with the organizer, then write.', organizer: WRITING_ORGANIZERS[g === 0 ? 'sentence' : mode],
      items: [{ id: 'wr', kind: 'write', skill: `writing.${mode}`, level: 2, points: 6, lines: tier === 'stretch' ? lines + 4 : tier === 'support' ? Math.max(3, lines - 3) : lines, prompt: writingPrompt(g === 0 ? 'sentence' : mode, passage, world, g), answer: 'Score with the writing rubric: ideas, organization, evidence/detail, conventions.' }],
    });
    const langSec = (n: number): WsSection | null => lang ? ({ id: 'lang', kind: 'vocab', title: `Word study: ${skillLabel(lang.skill)}`, directions: 'Read each one carefully.', items: itemsFor(lang.skill, n, tier, rng, world, lang.params, 'l') }) : null;
    if (passage && (lesson.day === 1 || lesson.day === 2 || lesson.kind === 'review' || lesson.kind === 'assess')) sections.push(...readingSection(passage, tier, rng, g, lesson.day !== 1));
    if (lesson.day === 1 && passage) sections.push({ id: 'vocab', kind: 'vocab', title: 'Words to know', directions: g <= 1 ? 'Say each word. Draw it.' : 'Read each word and its meaning. Use one in a sentence.', items: passage.vocab.slice(0, tier === 'support' ? 3 : 5).map(([w, d], i) => ({ id: `v${i + 1}`, kind: 'write' as const, skill: 'reading.vocab', level: 1 as const, points: 1, lines: 1, prompt: `${w} — ${d}`, answer: `A sentence that uses “${w}” correctly.` })) });
    if (lesson.day === 3) { const s = langSec(tier === 'support' ? 6 : tier === 'stretch' ? 12 : 10); if (s) sections.push(s); if (passage) sections.push({ id: 'ctx', kind: 'practice', title: 'Words in the passage', directions: 'Use the sentence around each word.', items: vocabInContext(passage, analyzePassage(passage), rng, Math.min(3, passage.vocab.length), g <= 1 || tier === 'support' ? 3 : 4) }); }
    if (lesson.day === 4 && lesson.kind !== 'assess') sections.push(writeSec(g <= 1 ? 3 : g <= 4 ? 8 : 12));
    if (lesson.kind === 'review' || lesson.kind === 'assess') { const s = langSec(lesson.kind === 'assess' ? 6 : 4); if (s) sections.push(s); }
    if (lesson.kind === 'assess') sections.push({ ...writeSec(g <= 1 ? 3 : 8), title: 'Short response' });
    if (lesson.kind === 'project') sections.push({ ...writeSec(g <= 1 ? 4 : 14), title: 'Performance task', directions: lesson.miniLesson.iDo.replace(/^Present the task: /, '') });
    if (!sections.length) sections.push(writeSec(6));
  }
  if (lesson.kind !== 'assess') sections.push(reflect(lesson.objective));

  const ws: Worksheet = {
    id: `${lesson.id}:${tier}:${seed.toString(36)}`, lessonId: lesson.id, title: lesson.title,
    kicker: `${lesson.unitTitle} · Week ${lesson.week}, Day ${lesson.day}`, grade: lesson.grade, subject: lesson.subject,
    objective: lesson.objective, ccss: lesson.ccss, intl: lesson.intl, profile, sections,
    themeId: opts.themeId || themeForUnit(lesson.unitId, bandOf(lesson.grade)).id,
    adaptations: tier === 'support' ? ['Support tier: fewer items, worked example first, entry-level numbers, hints on the page.'] : tier === 'stretch' ? ['Stretch tier: harder numbers, more challenge items, longer written explanation.'] : [],
    minutes: lesson.kind === 'assess' ? 45 : 25, seed,
  };
  return adaptWorksheet(ws);
}

/** Learning-support adaptations. Pure: returns a new worksheet with `adaptations` describing every change. */
export function adaptWorksheet(ws: Worksheet): Worksheet {
  const s = ws.profile.supports || {};
  const ids = new Set(ws.profile.identities || []);
  const notes = [...ws.adaptations];
  let sections = ws.sections.map(sec => ({ ...sec, items: sec.items.map(it => ({ ...it })) }));
  if (s.fewerChoices) {
    let n = 0;
    sections.forEach(sec => sec.items.forEach(it => { if (it.kind === 'choice' && it.choices && it.choices.length > 3 && sec.kind !== 'reflect') { const keep = [it.answer, ...it.choices.filter(c => c !== it.answer).slice(0, 2)]; it.choices = it.choices.filter(c => keep.includes(c)); n++; } }));
    if (n) notes.push(`Fewer choices: ${n} multiple-choice item${n > 1 ? 's' : ''} trimmed to 3 options.`);
  }
  if (s.chunk || ids.has('adhd')) {
    sections = sections.map((sec, i) => (sec.kind === 'reflect' || sec.kind === 'reading' ? sec : { ...sec, ownPage: i > 0, checkpoint: 'Checkpoint: stretch, check your answers, then turn the page.' }));
    notes.push('Chunked: each part starts on its own page with a checkpoint and a progress tracker.');
  }
  if (ids.has('dyscalculic')) {
    sections.forEach(sec => sec.items.forEach(it => { if (!it.visual && it.numeric && /[+−]/.test(it.prompt)) { const m = it.prompt.match(/(\d+)\s*[+−]\s*(\d+)/); if (m && Number(m[1]) <= 20 && Number(m[2]) <= 20) it.visual = { type: 'numberline', min: 0, max: 20, step: 1, labels: 'all' }; } }));
    notes.push('Number sense supports: number lines beside small-number problems and a printed hundreds strip.');
  }
  if (s.readQuestions || s.readAloud || ids.has('dyslexic')) notes.push('Read-aloud: every question carries a listen marker; opened in Plajah, the reader speaks it.');
  if (s.easyRead || (s.textSize ?? 0) > 0 || ids.has('dyslexic')) notes.push(`Easier reading: ${ids.has('dyslexic') ? 'dyslexia-friendly type (Lexend), ' : ''}larger text${s.lineFocus ? ', tinted line guides' : ''} and more space between lines.`);
  else if (s.lineFocus) notes.push('Line focus: alternating tinted rows guide the eye.');
  if (s.untimed) notes.push('Untimed: no time box; finish at your own pace.');
  else if (s.extraTime && s.extraTime > 1) notes.push(`Extra time: ×${s.extraTime} (${Math.round(ws.minutes * s.extraTime)} minutes).`);
  if (s.calm || s.mutedColor) notes.push('Calm page: muted colors and a quieter border.');
  if (s.retryFree) notes.push('Try-again boxes: a second answer space on every item, no penalty.');
  if (ws.profile.homeLanguage && !/^en/i.test(ws.profile.homeLanguage)) notes.push(`Home language bridge (${ws.profile.homeLanguage}): a glossary line beside key words for translation.`);
  if (ws.profile.interests?.length) notes.push(`Personalized: story problems and prompts use the learner’s interests (${ws.profile.interests.slice(0, 3).join(', ')}).`);
  return { ...ws, sections, adaptations: notes, minutes: s.untimed ? 0 : Math.round(ws.minutes * (s.extraTime || 1)) };
}

/** Answer key rows for the teacher copy. */
export function answerKey(ws: Worksheet): Array<{ section: string; id: string; n: number; prompt: string; answer: string }> {
  let n = 0;
  return ws.sections.flatMap(sec => sec.items.filter(it => sec.kind !== 'reflect').map(it => ({ section: sec.title, id: it.id, n: ++n, prompt: it.prompt, answer: it.answer })));
}
