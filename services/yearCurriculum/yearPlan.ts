// The year planner: units (data/yearCurriculum/*Units.ts) → 180 day-by-day lessons per grade and subject.
//
// Rhythm per unit: day 1 launches (big idea, essential question, pre-check); each skill gets a teach day then practice
// days; every Friday is a spiral check; the unit's second-to-last day is the assessment and its last day the performance
// task. ELA runs a fixed weekly workshop instead: Mon read & launch, Tue close reading, Wed word study, Thu writing,
// Fri check — with a fresh passage every week, matched to the unit's genres and climbing in difficulty through the year.
import type { DayLesson, LessonKind, Passage, SkillRef, UnitSpec, YearGrade, YearSubject } from './types';
import { bandOf, gradeNum } from './types';
import { MATH_UNITS } from '../../data/yearCurriculum/mathUnits';
import { ELA_UNITS } from '../../data/yearCurriculum/elaUnits';
import { PASSAGES } from '../../data/yearCurriculum/passages';
import { MATH_SKILLS } from './mathSkills';
import { ELA_SKILLS } from './elaSkills';

export const WEEKS = 36;
export const DAYS_PER_WEEK = 5;
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const weekdayName = (day: number) => WEEKDAY[(day - 1) % 5];

export function unitsFor(grade: YearGrade, subject: YearSubject): UnitSpec[] {
  return (subject === 'math' ? MATH_UNITS : ELA_UNITS).filter(u => u.grade === grade).sort((a, b) => a.n - b.n);
}

export const skillLabel = (id: string) =>
  MATH_SKILLS[id]?.label || ELA_SKILLS[id]?.label ||
  ({ 'reading.passage': 'Close reading', 'writing.sentence': 'Sentence writing', 'writing.opinion': 'Opinion writing', 'writing.informative': 'Informative writing', 'writing.narrative': 'Narrative writing', 'writing.research': 'Research writing', 'writing.poetry': 'Poetry writing', 'writing.argument': 'Argument writing' } as Record<string, string>)[id] || id;

const isReading = (s: SkillRef) => s.skill.startsWith('reading.');
/** The unit's name without a leading “Launch:”, so templates don't read “Launch: Launch: …”. */
const topicOf = (u: UnitSpec) => u.title.replace(/^Launch(ing)?\s*:\s*/i, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isWriting = (s: SkillRef) => s.skill.startsWith('writing.');

/** Passage per week for a grade's ELA year: genre-matched, unused, closest to the week's target difficulty. */
export function assignPassages(grade: YearGrade, units: UnitSpec[]): Map<number, Passage> {
  const band = bandOf(grade);
  const lib = PASSAGES[band];
  const pos = band === 'k2' ? gradeNum(grade) : band === '35' ? gradeNum(grade) - 3 : gradeNum(grade) - 6; // 0..2 inside the band
  const levelOf = (p: Passage) => Math.min(2, Math.floor((lib.indexOf(p) / Math.max(1, lib.length)) * 3));
  const used = new Set<string>();
  const out = new Map<number, Passage>();
  let week = 1;
  for (const u of units) {
    for (let w = 0; w < u.weeks; w++, week++) {
      const target = pos + (week - 18) / 36;
      const score = (p: Passage) => Math.abs(levelOf(p) - target) + (u.genres?.includes(p.genre) ? 0 : 2.5) + (p.focus.some(f => u.skills.some(s => s.params?.focus === f)) ? -0.4 : 0);
      const pool = lib.filter(p => !used.has(p.id));
      const pick = (pool.length ? pool : lib).slice().sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0];
      if (pick) { used.add(pick.id); out.set(week, pick); }
    }
  }
  return out;
}

const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function mathLesson(u: UnitSpec, kind: LessonKind, skills: SkillRef[], prev?: SkillRef): Pick<DayLesson, 'title' | 'objective' | 'warmUp' | 'miniLesson' | 'discussion' | 'exitTicket' | 'materials' | 'minutes'> {
  const s = skills[0];
  const label = skillLabel(s.skill);
  const vocab = join(u.vocab.slice(0, 3));
  const topic = topicOf(u);
  const young = gradeNum(u.grade) <= 1;
  switch (kind) {
    case 'launch': return {
      title: `Launch: ${topic}`, objective: `I can tell what our new unit, “${topic}”, is about and show what I already know.`,
      warmUp: 'Notice & wonder: show a photo connected to the unit’s big idea. Students share one thing they notice and one thing they wonder.',
      miniLesson: { iDo: `Introduce the big idea — ${u.bigIdea} Post the essential question: “${u.essentialQuestion}”`, weDo: `Build a class word wall together: ${vocab}.`, youDo: 'Complete the unit pre-check (worksheet). It is not graded — it shows where to start.' },
      discussion: u.essentialQuestion, exitTicket: 'Circle one problem on the pre-check that felt tricky and write why.', materials: ['Unit pre-check worksheet', 'Word wall cards', 'Manipulatives'], minutes: 50,
    };
    case 'review': return {
      title: `Spiral Check: ${join(skills.map(x => skillLabel(x.skill)))}`, objective: 'I can show what I have learned this week and fix my mistakes.',
      warmUp: 'Error analysis: display a solved problem with one mistake; partners find and fix it.',
      miniLesson: { iDo: young ? 'Model checking work by counting again or using a different tool.' : 'Model checking work with estimation and the inverse operation.', weDo: 'Stations: one table per skill this week; rotate every 8 minutes.', youDo: 'Mixed spiral practice (worksheet), then self-check with the key and set a goal.' },
      discussion: 'Which strategy did you use most this week, and when does a different one work better?', exitTicket: 'Write one goal for next week.', materials: ['Spiral review worksheet', 'Answer key for self-check', 'Station cards'], minutes: 50,
    };
    case 'assess': return {
      title: `Unit Assessment: ${topic}`, objective: `I can show what I have learned in “${topic}”.`,
      warmUp: 'Calm start: two minutes of breathing, then skim the whole test and star the ones you know.',
      miniLesson: { iDo: young ? 'Review routines: listen to each question, point and count, check your answer.' : 'Review test-taking routines: read twice, show your work, check units and reasonableness.', weDo: 'None — independent work time.', youDo: 'Unit assessment (worksheet). Accommodations apply as written in each learner’s plan.' },
      discussion: 'After the test: which question showed your best thinking?', exitTicket: 'Rate your confidence on each skill: 1 to 4.', materials: ['Unit assessment', 'Scratch paper', 'Manipulatives as allowed'], minutes: 55,
    };
    case 'project': return {
      title: `Performance Task: ${topic}`, objective: 'I can use what I learned to solve a real problem and explain my thinking.',
      warmUp: 'Gallery of real-world examples: where does this math show up in our community and around the world?',
      miniLesson: { iDo: `Present the task: ${u.performanceTask}`, weDo: 'Co-create the success criteria with the class.', youDo: 'Work in teams; each student completes their own write-up on the worksheet.' },
      discussion: u.essentialQuestion, exitTicket: 'Self-assess against the success criteria.', materials: ['Performance task sheet', 'Chart paper', 'Rubric'], minutes: 60,
    };
    case 'learn': return {
      title: label, objective: s.can,
      warmUp: prev ? `Number talk: one quick problem from “${skillLabel(prev.skill)}”, solved two different ways.` : 'Number talk: dot image — how many, and how do you see it?',
      miniLesson: { iDo: `Think aloud through the worked example at the top of the worksheet, naming each step and using the words ${vocab}.`, weDo: 'Solve two problems together on whiteboards; students explain to a partner before sharing.', youDo: 'Independent practice (worksheet), easiest to hardest. Early finishers take the challenge.' },
      discussion: young ? 'How do you know your answer is right?' : 'How do you know your answer is reasonable?', exitTicket: 'The last problem on the worksheet, done on your own.', materials: ['Worksheet', 'Whiteboards', 'Manipulatives'], minutes: 50,
    };
    default: return {
      title: `Practice: ${label}`, objective: s.can,
      warmUp: `Fluency sprint: two minutes of quick problems from “${label}”.`,
      miniLesson: { iDo: 'Quick reteach of the trickiest step from yesterday’s exit tickets.', weDo: 'Partner practice: one solves, one coaches, then switch.', youDo: 'Independent practice (worksheet) with a word problem and a challenge.' },
      discussion: 'What mistake is easy to make here, and how do you avoid it?', exitTicket: 'Last problem on the worksheet.', materials: ['Worksheet', 'Manipulatives'], minutes: 45,
    };
  }
}

function expandMath(u: UnitSpec, startWeek: number): Omit<DayLesson, 'grade' | 'subject' | 'dayOfYear' | 'id'>[] {
  const total = u.weeks * DAYS_PER_WEEK;
  const kinds: LessonKind[] = Array.from({ length: total }, (_, i) => (i === 0 ? 'launch' : i === total - 1 ? 'project' : i === total - 2 && total > 5 ? 'assess' : i % 5 === 4 ? 'review' : 'learn'));
  const teachDays = kinds.map((k, i) => (k === 'learn' ? i : -1)).filter(i => i >= 0);
  const per = teachDays.length / Math.max(1, u.skills.length);
  const skillAt = new Map<number, number>();
  teachDays.forEach((d, j) => skillAt.set(d, Math.min(u.skills.length - 1, Math.floor(j / per))));
  let lastSkill = -1;
  return kinds.map((kind0, i) => {
    let kind = kind0;
    let skills: SkillRef[];
    const taughtSoFar = u.skills.slice(0, Math.max(1, lastSkill + 1));
    if (kind === 'learn') {
      const si = skillAt.get(i)!;
      if (si === lastSkill) kind = 'practice';
      lastSkill = si;
      skills = [u.skills[si]];
    } else if (kind === 'review') skills = taughtSoFar.slice(-3);
    else skills = u.skills;
    const prevIdx = kind === 'learn' && skillAt.get(i)! > 0 ? skillAt.get(i)! - 1 : -1;
    const text = mathLesson(u, kind, skills, prevIdx >= 0 ? u.skills[prevIdx] : undefined);
    return { week: startWeek + Math.floor(i / 5), day: (i % 5) + 1, unitId: u.id, unitTitle: u.title, kind, skills, ccss: u.ccss, intl: u.intl, vocab: u.vocab, ...text };
  });
}

function expandEla(u: UnitSpec, startWeek: number, passages: Map<number, Passage>): Omit<DayLesson, 'grade' | 'subject' | 'dayOfYear' | 'id'>[] {
  const reading = u.skills.filter(isReading);
  const writing = u.skills.filter(isWriting);
  const language = u.skills.filter(s => !isReading(s) && !isWriting(s));
  const out: Omit<DayLesson, 'grade' | 'subject' | 'dayOfYear' | 'id'>[] = [];
  const mode = u.writing || 'narrative';
  for (let w = 0; w < u.weeks; w++) {
    const week = startWeek + w;
    const p = passages.get(week);
    const rd = reading[w % Math.max(1, reading.length)] || { skill: 'reading.passage', can: 'I can read closely and answer questions with evidence.' };
    const lg = language.length ? language[w % language.length] : undefined;
    const wr = writing[0] || { skill: `writing.${mode}`, can: `I can write a ${mode} piece.` };
    const last = w === u.weeks - 1;
    const pt = p ? `“${p.title}”` : 'this week’s text';
    const focus = String(rd.params?.focus || p?.focus[0] || 'key details');
    const vocabWords = p ? p.vocab.map(v => v[0]) : u.vocab;
    const base = { unitId: u.id, unitTitle: u.title, ccss: u.ccss, intl: u.intl, writing: u.writing, passageId: p?.id };
    const day = (d: number, kind: LessonKind, skills: SkillRef[], rest: Pick<DayLesson, 'title' | 'objective' | 'warmUp' | 'miniLesson' | 'discussion' | 'exitTicket' | 'materials' | 'minutes'>) =>
      out.push({ ...base, week, day: d, kind, skills, vocab: d === 3 && lg ? u.vocab : vocabWords, ...rest });

    day(1, w === 0 ? 'launch' : 'learn', [rd], {
      title: w === 0 ? `Launch: ${topicOf(u)} — ${pt}` : `Read: ${pt}`,
      objective: w === 0 ? `I can tell what our new unit, “${topicOf(u)}”, is about and read ${pt} closely.` : rd.can,
      warmUp: w === 0 ? `Essential question: “${u.essentialQuestion}” Quick-write or draw for 3 minutes.` : `Vocabulary preview: ${join(vocabWords.slice(0, 4))} — act out, draw or define in your own words.`,
      miniLesson: { iDo: `Read ${pt} aloud with expression, thinking aloud about ${focus}.`, weDo: 'Reread together; partners mark the text (✓ know it, ? wonder, ! surprise).', youDo: 'Answer the first questions on the worksheet, citing the text.' },
      discussion: w === 0 ? u.essentialQuestion : `What is the most important thing to remember about ${pt}?`, exitTicket: 'Retell the passage in two sentences.', materials: ['Passage worksheet', 'Highlighters'], minutes: 50,
    });
    day(2, 'practice', [rd], {
      title: `Close Reading: ${cap(focus.replace(/-/g, ' '))}`, objective: rd.can,
      warmUp: `Reread the first paragraph of ${pt} with a partner, alternating sentences.`,
      miniLesson: { iDo: `Model how a strong reader finds evidence for ${focus.replace(/-/g, ' ')}: point, quote, explain.`, weDo: 'Find a second piece of evidence together and debate which is stronger.', youDo: 'Complete the text-dependent questions and the evidence hunt.' },
      discussion: 'Which sentence in the text did the most work, and why?', exitTicket: 'Write one quote that proves your answer to question 1.', materials: ['Passage worksheet', 'Sticky notes'], minutes: 50,
    });
    day(3, 'practice', lg ? [lg, rd] : [rd], {
      title: lg ? `Word Study: ${skillLabel(lg.skill)}` : `Vocabulary in Context`, objective: lg ? lg.can : 'I can use context to work out what words mean.',
      warmUp: `Word hunt: find three examples of ${lg ? skillLabel(lg.skill).toLowerCase() : 'interesting words'} in ${pt}.`,
      miniLesson: { iDo: `Teach ${lg ? skillLabel(lg.skill).toLowerCase() : 'context clues'} with examples from ${pt}.`, weDo: 'Sort or fix sentences together on the board.', youDo: 'Word study practice (worksheet), then use two words in your own sentences.' },
      discussion: 'How does this help you as a reader and as a writer?', exitTicket: 'Last item on the worksheet.', materials: ['Word study worksheet', 'Word cards'], minutes: 45,
    });
    day(4, last ? 'assess' : 'practice', last ? [rd, ...(lg ? [lg] : []), wr] : [wr], last ? {
      title: `Unit Check: ${topicOf(u)}`, objective: `I can show what I learned in “${topicOf(u)}”: reading, word study and writing.`,
      warmUp: 'Calm start and skim. Star the questions you feel ready for.',
      miniLesson: { iDo: 'Review routines: reread, cite evidence, check conventions.', weDo: 'None — independent work.', youDo: 'Unit check (worksheet). Accommodations apply as written in each learner’s plan.' },
      discussion: 'Which answer shows your best thinking?', exitTicket: 'Rate your confidence: reading, word study, writing (1–4).', materials: ['Unit check worksheet'], minutes: 55,
    } : {
      title: `Writer’s Workshop: ${skillLabel(wr.skill)}`, objective: wr.can,
      warmUp: `Mentor sentence: study one sentence from ${pt}. What did the author do that we can borrow?`,
      miniLesson: { iDo: `Model planning a ${mode} piece with the organizer, thinking aloud.`, weDo: 'Draft the opening together as a class.', youDo: 'Plan with the organizer, then draft on the lines. Conference with the teacher.' },
      discussion: 'Share one sentence you are proud of.', exitTicket: 'Underline your strongest sentence.', materials: ['Writing worksheet', 'Mentor text'], minutes: 55,
    });
    day(5, last ? 'project' : 'review', last ? u.skills : [rd, ...(lg ? [lg] : [])], last ? {
      title: `Performance Task: ${topicOf(u)}`, objective: 'I can share my best work and reflect on my growth.',
      warmUp: 'Revise with a partner using the checklist.',
      miniLesson: { iDo: `Present the task: ${u.performanceTask}`, weDo: 'Review the success criteria together.', youDo: 'Complete and publish the performance task; reflect on the unit.' },
      discussion: u.essentialQuestion, exitTicket: 'Reflection: what are you most proud of?', materials: ['Performance task sheet', 'Rubric'], minutes: 60,
    } : {
      title: `Friday Check: ${pt}`, objective: 'I can show what I learned this week.',
      warmUp: 'Fluency: timed partner reading of a favorite paragraph.',
      miniLesson: { iDo: 'Model how to check answers against the text.', weDo: 'Book talk: share and recommend.', youDo: 'Weekly check (worksheet): reading + word study.' },
      discussion: 'What did this week’s text teach you about the essential question?', exitTicket: 'Set a reading goal for next week.', materials: ['Weekly check worksheet'], minutes: 45,
    });
  }
  return out;
}

const cache = new Map<string, DayLesson[]>();

/** All 180 lessons for a grade and subject, in calendar order. */
export function expandYear(grade: YearGrade, subject: YearSubject): DayLesson[] {
  const key = `${grade}:${subject}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const units = unitsFor(grade, subject);
  const passages = subject === 'ela' ? assignPassages(grade, units) : new Map<number, Passage>();
  const rows: Omit<DayLesson, 'grade' | 'subject' | 'dayOfYear' | 'id'>[] = [];
  let week = 1;
  for (const u of units) {
    rows.push(...(subject === 'math' ? expandMath(u, week) : expandEla(u, week, passages)));
    week += u.weeks;
  }
  const lessons = rows.slice(0, WEEKS * DAYS_PER_WEEK).map((r, i) => ({ ...r, grade, subject, dayOfYear: i + 1, id: `${subject}-${grade}-d${String(i + 1).padStart(3, '0')}` }));
  cache.set(key, lessons);
  return lessons;
}

export const lessonById = (id: string): DayLesson | undefined => {
  const m = /^(math|ela)-(k|g\d)-d(\d{3})$/.exec(id);
  return m ? expandYear(m[2] as YearGrade, m[1] as YearSubject)[Number(m[3]) - 1] : undefined;
};
