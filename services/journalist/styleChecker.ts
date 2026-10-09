// AP-style basics checker. Pure TypeScript, no dependencies, so it is unit-tested
// (tests/journalistStyle.test.ts) and can run in the editor, a worker, or the server.
//
// This is a LINTER for the common, mechanical AP rules. It is not the AP Stylebook
// (that is licensed and far larger) and it cannot judge fairness, accuracy or libel.
// Every finding is a suggestion; the writer decides.

export type StyleSeverity = 'error' | 'warn' | 'info';
export type StyleRule =
  | 'numbers' | 'numbers-start' | 'numerals-for-ten-plus' | 'titles' | 'dateline' | 'attribution'
  | 'passive' | 'headline-length' | 'headline-style' | 'month-abbrev' | 'time-format' | 'percent' | 'spacing';

export interface StyleIssue {
  rule: StyleRule;
  severity: StyleSeverity;
  message: string;
  start: number;
  end: number;
  match: string;
  suggestion?: string;
}

export interface StyleReport {
  issues: StyleIssue[];
  stats: { words: number; sentences: number; passiveSentences: number; passiveRatio: number; avgSentenceWords: number };
}

export const HEADLINE_SOFT_MAX = 60;  // search-result friendly
export const HEADLINE_HARD_MAX = 100; // beyond this most cards truncate hard

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEN_PLUS_WORDS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const UNIT_AFTER = /^\s*(?:%|°|p\.m\.|a\.m\.|(?:percent|pm|am|years?[ -]old|-year|-month|-day|-foot|-mile|inch(?:es)?|feet|ft|mph|degrees?|pounds?|lbs?|miles?|cents?|cm|mm|km|kg|oz|ounces?|hours?|minutes?|seconds?|gallons?|acres?|yards?|meters?|metres?)\b)/i;
const MONTH_BEFORE = /(?:Jan\.?|Feb\.?|March|April|May|June|July|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?|January|February|August|September|October|November|December)\s*$/;
const LABEL_BEFORE = /(?:\b(?:No|Nos|Page|Pages|Chapter|Room|Route|Highway|Interstate|Apt|Suite|Channel|Grade|Rule|Section|Article|Table|Figure|Version|v)\.?|#)\s*$/i;
const SENTENCE_START_BEFORE = /(^|[.!?]["'”]?\s+)$/;
const ABBREV_BEFORE = /\b(?:Jan|Feb|Aug|Sept?|Oct|Nov|Dec|Sen|Rep|Gov|Dr|Mr|Mrs|Ms|St|No|Lt|Col|Gen|Sgt|Rev|Jr|Sr|vs|Inc|Co|Corp|Mt|Ave|Blvd)\.\s+$/;
/** True when `prefix` ends where a new sentence begins (abbreviation periods do not count). */
const atSentenceStart = (prefix: string): boolean => SENTENCE_START_BEFORE.test(prefix) && !ABBREV_BEFORE.test(prefix);

const IRREGULAR_PP = new Set([
  'begun', 'beaten', 'blown', 'cast', 'cut', 'shut', 'split', 'bought', 'broken', 'brought', 'built', 'caught', 'chosen', 'done', 'drawn', 'driven', 'eaten', 'fallen', 'felt', 'found', 'forgotten',
  'given', 'gone', 'grown', 'held', 'hidden', 'hit', 'hurt', 'kept', 'known', 'laid', 'led', 'left', 'lost', 'made', 'met', 'paid', 'put', 'read', 'run',
  'said', 'seen', 'sent', 'set', 'shot', 'shown', 'sold', 'spoken', 'spent', 'stolen', 'taken', 'taught', 'told', 'thought', 'thrown', 'understood', 'won', 'worn', 'written',
]);
// Participles that are idiomatic adjectives, not passive constructions.
const ADJECTIVAL = new Set(['born', 'based', 'supposed', 'used', 'tired', 'excited', 'interested', 'concerned', 'worried', 'pleased', 'scared', 'married', 'located', 'gone', 'done', 'left']);

interface Sentence { s: string; start: number }
const sentenceSplit = (text: string): Sentence[] => {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ s: m[0], start: m.index });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
};

export function isPassiveSentence(s: string): { passive: boolean; index: number; length: number } {
  const re = /\b(?:is|are|was|were|be|being)(?:\s+(?:not|also|never|already|recently|reportedly|widely|still|being))*\s+([a-z]+)/ig;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const w = m[1].toLowerCase();
    const looksPP = (w.length > 3 && w.endsWith('ed')) || IRREGULAR_PP.has(w);
    if (!looksPP || ADJECTIVAL.has(w)) continue;
    return { passive: true, index: m.index, length: m[0].length };
  }
  return { passive: false, index: -1, length: 0 };
}

/** Run every body rule over `text`. Offsets index into `text`. */
export function checkStyle(text: string): StyleReport {
  const issues: StyleIssue[] = [];
  const push = (rule: StyleRule, severity: StyleSeverity, message: string, start: number, end: number, suggestion?: string) =>
    issues.push({ rule, severity, message, start, end, match: text.slice(start, end), suggestion });

  // numbers one through nine are spelled out
  const digit = /(?<![\w$£€.,:/#-])(\d)(?![\w.,:/-]*\d)(?!\w)/g;
  let m: RegExpExecArray | null;
  while ((m = digit.exec(text))) {
    const start = m.index; const end = start + 1;
    const after = text.slice(end);
    const before = text.slice(Math.max(0, start - 14), start);
    if (UNIT_AFTER.test(after)) continue;
    if (MONTH_BEFORE.test(before) || LABEL_BEFORE.test(before)) continue;
    if (/[$£€]\s*$/.test(before)) continue;
    if (/^[.,]\d/.test(after) || /\d[.,]$/.test(before)) continue;
    if (/^(?:st|nd|rd|th)\b/.test(after)) continue;
    if (atSentenceStart(text.slice(0, start))) continue; // handled by numbers-start
    push('numbers', 'warn', `Spell out numbers one through nine: "${SMALL[+m[1]]}".`, start, end, SMALL[+m[1]]);
  }

  // numerals at the start of a sentence (years excepted)
  const startNum = /\d[\d,.]*\d|\d/g;
  while ((m = startNum.exec(text))) {
    const num = m[0]; const start = m.index;
    if (!atSentenceStart(text.slice(0, start)) || !/^[\s]/.test(text.slice(start + num.length))) continue;
    if (/^(1\d{3}|2\d{3})$/.test(num)) continue;
    push('numbers-start', 'warn', 'Do not start a sentence with a numeral (years excepted); spell it out or reword.', start, start + num.length);
  }

  // "ten".."ninety" spelled out mid-sentence
  const words = /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b(?!-)/gi;
  while ((m = words.exec(text))) {
    const start = m.index; const word = m[1];
    const lead = text.slice(0, start);
    const tail = text.slice(start + word.length);
    if (atSentenceStart(lead)) continue;
    if (/^s\b/i.test(tail) || /^\s+of\b/i.test(tail) && /\btens\s*$/i.test(lead)) continue;
    if (/\b(?:one|two|three|four|five|six|seven|eight|nine)[\s-]*$/i.test(lead)) continue;
    push('numerals-for-ten-plus', 'info', `Use numerals for 10 and above: "${TEN_PLUS_WORDS[word.toLowerCase()]}".`, start, start + word.length, String(TEN_PLUS_WORDS[word.toLowerCase()]));
  }

  // titles
  const titles: Array<[RegExp, string, string]> = [
    [/\b(Senator)\s+(?=[A-Z])/g, 'Sen.', 'AP abbreviates Sen. before a name.'],
    [/\b(Representative|Congressman|Congresswoman)\s+(?=[A-Z])/g, 'Rep.', 'AP abbreviates Rep. before a name.'],
    [/\b(Governor)\s+(?=[A-Z])/g, 'Gov.', 'AP abbreviates Gov. before a name.'],
    [/\b(Lieutenant Governor)\s+(?=[A-Z])/g, 'Lt. Gov.', 'AP abbreviates Lt. Gov. before a name.'],
    [/\b(Doctor)\s+(?=[A-Z])/g, 'Dr.', 'AP uses Dr. on first reference only for medical doctors.'],
    [/\b(Mr\.|Mrs\.|Ms\.|Miss)\s+(?=[A-Z])/g, '', 'AP drops courtesy titles (Mr., Mrs., Ms.); use the full name, then the last name.'],
    [/\b(Reverend)\s+(?=[A-Z])/g, 'the Rev.', 'AP: the Rev. before a name.'],
  ];
  for (const [re, fix, msg] of titles) {
    while ((m = re.exec(text))) push('titles', 'info', msg, m.index, m.index + m[1].length, fix || undefined);
  }
  const lowerPre = /\b(president|governor|senator|mayor|chairman|chairwoman)\s+(?=[A-Z][a-z]+\s[A-Z])/g;
  while ((m = lowerPre.exec(text))) push('titles', 'info', 'Formal titles are capitalized directly before a name.', m.index, m.index + m[1].length, m[1][0].toUpperCase() + m[1].slice(1));

  // dateline
  const firstPara = text.trimStart().split(/\n/)[0] || '';
  const lead = text.length - text.trimStart().length;
  const mixedCase = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*(?:-{1,2}|–)\s/.exec(firstPara);
  if (mixedCase) push('dateline', 'info', 'Datelines are the city in ALL CAPS, then an em dash: "DETROIT —".', lead, lead + mixedCase[1].length, mixedCase[1].toUpperCase());
  const capsHyphen = /^([A-Z][A-Z .']{2,28}?)\s*(-{1,2}|–)\s/.exec(firstPara);
  if (capsHyphen) push('dateline', 'info', 'Use an em dash (—) after the dateline, not a hyphen or en dash.', lead, lead + capsHyphen[0].length);

  // attribution
  const weakVerbs = /\b(stated|claimed|asserted|exclaimed|opined|declared|averred|remarked|commented)\b/gi;
  while ((m = weakVerbs.exec(text))) push('attribution', 'info', `"${m[1]}" editorializes; AP prefers "said" ("claimed" implies doubt).`, m.index, m.index + m[1].length, 'said');
  const present = /(?<=["”]\s)(says|states)\b/g;
  while ((m = present.exec(text))) push('attribution', 'info', 'AP uses past tense "said" for attribution in news copy.', m.index, m.index + m[1].length, 'said');
  let off = 0;
  for (const para of text.split('\n')) {
    const t = para.trim();
    if (/^["“].{12,}["”]$/.test(t) && !/\b(said|says|according to|told|wrote|added|asked|explained)\b/i.test(t)) {
      const s = off + para.indexOf(t);
      push('attribution', 'warn', 'Quote has no attribution. Say who said it, in the same or the next sentence.', s, s + Math.min(t.length, 60));
    }
    off += para.length + 1;
  }

  // passive voice
  let passiveSentences = 0;
  const sentences = sentenceSplit(text);
  for (const { s, start } of sentences) {
    const p = isPassiveSentence(s);
    if (p.passive) {
      passiveSentences++;
      push('passive', 'info', 'Passive voice. Prefer active (who did what) unless the actor is unknown or unimportant.', start + p.index, start + p.index + p.length);
    }
  }

  // months, times, percent, spacing
  const monthMap: Array<[RegExp, string]> = [
    [/\b(January)(?=\s+\d)/g, 'Jan.'], [/\b(February)(?=\s+\d)/g, 'Feb.'], [/\b(August)(?=\s+\d)/g, 'Aug.'],
    [/\b(September|Sept(?!\.))(?=\s+\d)/g, 'Sept.'], [/\b(October|Oct(?!\.))(?=\s+\d)/g, 'Oct.'], [/\b(November|Nov(?!\.))(?=\s+\d)/g, 'Nov.'], [/\b(December|Dec(?!\.))(?=\s+\d)/g, 'Dec.'],
  ];
  for (const [re, fix] of monthMap) while ((m = re.exec(text))) push('month-abbrev', 'info', `With a specific date, AP abbreviates this month: "${fix}".`, m.index, m.index + m[1].length, fix);
  const ord = /\b((?:Jan|Feb|Aug|Sept?|Oct|Nov|Dec)\.?|March|April|May|June|July)\s+(\d{1,2})(st|nd|rd|th)\b/g;
  while ((m = ord.exec(text))) push('month-abbrev', 'info', 'Drop the ordinal suffix on dates: "Oct. 5", not "Oct. 5th".', m.index, m.index + m[0].length, `${m[1]} ${m[2]}`);
  const tm = /\b(\d{1,2})(?::(\d{2}))?\s?(AM|PM|am|pm|A\.M\.|P\.M\.)/g;
  while ((m = tm.exec(text))) {
    const mer = /a/i.test(m[3]) ? 'a.m.' : 'p.m.';
    const t = m[2] && m[2] !== '00' ? `${m[1]}:${m[2]}` : m[1];
    const fix = `${t} ${mer}`;
    if (m[0] !== fix) push('time-format', 'info', `AP time style: "${fix}" (lowercase, periods, no :00).`, m.index, m.index + m[0].length, fix);
  }
  const pct = /\b(\d+(?:\.\d+)?)\s(percent|per cent)\b/g;
  while ((m = pct.exec(text))) push('percent', 'info', 'AP now uses the % sign with figures.', m.index, m.index + m[0].length, `${m[1]}%`);
  const dbl = /[^\S\n]{2,}/g;
  while ((m = dbl.exec(text))) push('spacing', 'info', 'Use a single space.', m.index, m.index + m[0].length, ' ');

  issues.sort((a, b) => a.start - b.start);
  const wordCount = (text.match(/[\w'’-]+/g) || []).length;
  return {
    issues,
    stats: {
      words: wordCount,
      sentences: sentences.length,
      passiveSentences,
      passiveRatio: sentences.length ? passiveSentences / sentences.length : 0,
      avgSentenceWords: sentences.length ? Math.round((wordCount / sentences.length) * 10) / 10 : 0,
    },
  };
}

/** Headline-specific rules (separate from body copy). */
export function checkHeadline(headline: string): StyleIssue[] {
  const h = headline.trim();
  const issues: StyleIssue[] = [];
  const push = (rule: StyleRule, severity: StyleSeverity, message: string, suggestion?: string) =>
    issues.push({ rule, severity, message, start: 0, end: headline.length, match: headline, suggestion });
  if (!h) { push('headline-length', 'error', 'Headline is empty.'); return issues; }
  if (h.length > HEADLINE_HARD_MAX) push('headline-length', 'error', `${h.length} characters; cards and search results will truncate it hard (limit ${HEADLINE_HARD_MAX}).`);
  else if (h.length > HEADLINE_SOFT_MAX) push('headline-length', 'warn', `${h.length} characters; aim for ${HEADLINE_SOFT_MAX} or fewer so it is not cut off in search.`);
  if (h.length < 15) push('headline-length', 'info', 'Very short; check it still says what the story is.');
  if (/\.$/.test(h)) push('headline-style', 'info', 'AP headlines do not end with a period.');
  if (h.length > 6 && h === h.toUpperCase() && /[A-Z]/.test(h)) push('headline-style', 'warn', 'All caps is hard to read and reads as shouting; use sentence case.');
  const tokens = h.split(/\s+/);
  const caps = tokens.filter(w => /^[A-Z]/.test(w)).length;
  if (tokens.length >= 5 && caps / tokens.length > 0.8 && h !== h.toUpperCase()) push('headline-style', 'info', 'AP headlines use sentence case (capitalize only the first word and proper nouns).');
  if (/!$/.test(h)) push('headline-style', 'info', 'Avoid exclamation points in news headlines.');
  if (/^(?:you won'?t believe|what happens next|this one trick)/i.test(h)) push('headline-style', 'warn', 'Clickbait phrasing; say what actually happened.');
  return issues;
}
