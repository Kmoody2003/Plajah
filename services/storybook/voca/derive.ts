// storybook/voca/derive — Plajah Academia Voca data for every spread, derived from the live text.
//
// Kenne 2026-10-10: Voca is built INTO the storybook editor. Each spread carries a reading level (Voca 1..10),
// target words with syllable splits, accepted pronunciation variants (dialect-fair), a comprehension question
// and narration word timings. This module derives all of it deterministically (no key needed); two optional
// hooks let a model help: pronunciation variants and question drafts. Drafts are NEVER shown to a child until
// the author approves them (source + approved flags on the question).
//
// Level mapping. The book's reading band (storyMetrics BAND_LIMITS, the same bands the showcase tests use) gives
// a base Voca level; the Flesch-Kincaid grade of the text nudges it at most one step either way, because FK on a
// 20-word page is noisy. Book level = band base nudged by the whole book's FK.
import type { Beat, StoryBook, StorySpread, SpreadVoca, TargetWord, VocaQuestionDraft, WordTimingMs, ReadingBand } from '../model';
import { spreadText, characterById } from '../model';
import { syllables as countSyl, sentences } from '../../showcase/storyMetrics';
import { syllabify } from '../../voca/vocaAlign';
import { checkPassageSafety } from '../../voca/vocaContentSafety';
import { estimateWordTimings } from '../../living/audio/narration';

const words = (t: string): string[] => (t.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []);

/** Voca level for each reading band (VOCA_LEVELS: 1 Pre-K, 2 K, 3 G1 early, 4 G1, 5 G2, 6 G3, 7 G4, 8 G5, 9 G6-8, 10 G9-12). */
export const BAND_LEVEL: Record<ReadingBand, number> = { toddler: 1, preschool: 2, 'early-picture': 3, picture: 4, 'read-alone': 5, story: 6 };

/** Flesch-Kincaid grade → Voca level. */
export function fkToLevel(fk: number): number {
  const cut = [0, 1, 1.8, 2.5, 3.5, 4.5, 5.5, 6.5, 8.5];
  let l = 1; for (const c of cut) if (fk > c) l++; return Math.min(10, l);
}
export function fkGrade(text: string): number {
  const w = words(text); if (!w.length) return 0;
  const sents = Math.max(1, sentences(text).length);
  const syl = w.reduce((n, x) => n + countSyl(x), 0);
  return +(0.39 * (w.length / sents) + 11.8 * (syl / w.length) - 15.59).toFixed(2);
}
/** Spread level: band base, nudged at most one step by the spread's FK grade. */
export function spreadLevel(band: ReadingBand, text: string): number {
  const base = BAND_LEVEL[band]; if (!words(text).length) return base;
  const fkL = fkToLevel(fkGrade(text));
  return Math.max(1, Math.min(10, fkL > base ? base + 1 : fkL < base ? Math.max(1, base - 1) : base));
}
const STORY_BEATS = (b: Beat) => b !== 'cover' && b !== 'back' && b !== 'activity';
export function bookLevel(book: Pick<StoryBook, 'band' | 'spreads'>): { level: number; fkGrade: number } {
  const text = book.spreads.filter(s => STORY_BEATS(s.beat)).map(spreadText).join('\n');
  const fk = fkGrade(text); return { level: spreadLevel(book.band, text), fkGrade: fk };
}

// ───────────── target words ─────────────

/** Dolch pre-primer..grade-1 sight words: never "targets" (a child reads them by sight). */
const SIGHT = new Set(('a and away big blue can come down find for funny go help here i in is it jump little look make me my not one play red run said see the three to two up we where yellow you ' +
  'all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran ride saw say she so soon that there they this too under want was well went what white who will with yes ' +
  'after again an any as ask by could every fly from give going had has her him his how just know let live may of old once open over put round some stop take thank them then think walk were when ' +
  'its his hers your their our us him them oh too very').split(/\s+/));

/** Optional pronunciation-variant provider (an LLM, a dialect table, or the author). Words are normalised lower-case. */
export type VariantProvider = (word: string, lang: string) => string[];
/** Deterministic default: common US/UK spelling pairs and a few dialect-fair contractions (the aligner already accepts homophones). */
const PAIRS: Array<[RegExp, (m: string) => string]> = [
  [/our$/, w => w.replace(/our$/, 'or')], [/or$/, w => w.replace(/or$/, 'our')], [/ise$/, w => w.replace(/ise$/, 'ize')], [/ize$/, w => w.replace(/ize$/, 'ise')], [/re$/, w => w.length > 4 ? w.replace(/re$/, 'er') : w],
];
export const defaultVariants: VariantProvider = (word: string) => {
  const out = new Set<string>();
  for (const [re, f] of PAIRS) if (re.test(word)) { const v = f(word); if (v !== word) out.add(v); }
  if (word.endsWith("in'")) out.add(word.replace(/in'$/, 'ing'));
  if (word.endsWith('ing')) out.add(word.replace(/ing$/, "in'"));
  return [...out];
};

/**
 * Up to `max` target words for a page: the words a reader at this level is most likely to stumble on (more syllables,
 * longer, not sight words), with character names first (a reader should practise the names they will meet on every page).
 */
export function targetWords(book: Pick<StoryBook, 'characters' | 'language'>, text: string, max = 5, provider: VariantProvider = defaultVariants, syllableOverrides?: Record<string, string[]>): TargetWord[] {
  const names = new Set(book.characters.flatMap(c => words(c.name)).filter(n => n !== 'the'));
  const seen = new Set<string>(); const cands: Array<{ w: string; score: number; at: number }> = [];
  words(text).forEach((w, at) => {
    if (seen.has(w) || SIGHT.has(w) || w.length < 3) return; seen.add(w);
    const syl = countSyl(w);
    const score = (names.has(w) ? 100 : 0) + syl * 10 + Math.min(w.length, 12);
    if (names.has(w) || syl >= 2 || w.length >= 5) cands.push({ w, score, at });
  });
  cands.sort((a, b) => b.score - a.score || a.at - b.at);
  return cands.slice(0, max).map(({ w }) => {
    const v = provider(w, book.language).filter(x => x && x !== w);
    return { word: w, syllables: syllabify(w, syllableOverrides), ...(v.length ? { variants: v } : {}) };
  });
}

// ───────────── comprehension questions ─────────────

const DECOY_WHO = ['a dragon', 'a robot', 'a king', 'a duck', 'a giant', 'a snail'];
const DECOY_WHERE: Record<string, string> = { forest: 'in a forest', meadow: 'in a meadow', ocean: 'under the sea', 'night-sky': 'up in space', city: 'in the city', bedroom: 'in bed', village: 'in a village', snow: 'in the snow', desert: 'in the desert' };
const DECOY_SOUND = ['Moo!', 'Splash!', 'Ding-dong!', 'Achoo!', 'Quack!'];
const rot = (seed: string, n: number) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; };
function arrange(correct: string, decoys: string[], seed: string): Pick<VocaQuestionDraft, 'choices' | 'answer'> {
  const ds = decoys.filter(d => d.toLowerCase() !== correct.toLowerCase()).slice(0, 2);
  while (ds.length < 2) ds.push(['Nobody', 'Nothing', 'Something else'][ds.length]);
  const at = rot(seed, 3) as 0 | 1 | 2; const choices = [...ds]; choices.splice(at, 0, correct);
  return { choices: choices as [string, string, string], answer: at };
}

/**
 * A deterministic question draft for a page (template source). Priority: the refrain (shared reading), the sound word,
 * the setting, then who is on the page. Pages with no story (cover/back) get none.
 */
export function templateQuestion(book: Pick<StoryBook, 'id' | 'refrain' | 'characters'>, sp: Pick<StorySpread, 'id' | 'beat' | 'cast' | 'sfx' | 'art' | 'text'>): VocaQuestionDraft | undefined {
  if (!STORY_BEATS(sp.beat)) return undefined;
  const text = spreadText(sp as StorySpread); if (!words(text).length) return undefined;
  const seed = `${book.id}/${sp.id}`;
  const refrain = book.refrain?.trim();
  if (refrain && text.toLowerCase().includes(refrain.toLowerCase().replace(/[.!?]$/, ''))) {
    return { prompt: 'Which words come back again and again?', ...arrange(refrain, ['Time to go home.', 'Look at me!', 'Hooray for cake!'], seed), source: 'template', approved: false };
  }
  if (sp.sfx) return { prompt: 'What sound is on this page?', ...arrange(sp.sfx, DECOY_SOUND, seed), source: 'template', approved: false };
  const cast = sp.cast.map(c => characterById(book as StoryBook, c.id)).filter(Boolean);
  const hero = cast[0];
  if (sp.art.setting && hero) {
    const where = DECOY_WHERE[sp.art.setting];
    return { prompt: `Where is ${hero.name}?`, ...arrange(where, Object.values(DECOY_WHERE).filter(w => w !== where).slice(rot(seed, 5), rot(seed, 5) + 2), seed), source: 'template', approved: false };
  }
  if (hero) {
    const others = book.characters.filter(c => !sp.cast.some(x => x.id === c.id)).map(c => c.name);
    return { prompt: 'Who is on this page?', ...arrange(hero.name, [...others, ...DECOY_WHO], seed), source: 'template', approved: false };
  }
  return undefined;
}

/** Optional model hook: same shape as the editorial councils (`ask(system, user)` returns text, JSON expected). */
export type Ask = (system: string, user: string, maxTokens?: number) => Promise<string>;
export async function draftQuestionWithModel(ask: Ask, book: Pick<StoryBook, 'title' | 'ageMin' | 'ageMax'>, text: string): Promise<VocaQuestionDraft | null> {
  const system = 'You write ONE literal comprehension question for a children\'s picture-book page, for a child reading aloud. Use only facts on the page. Three short choices, exactly one correct, no trick answers, nothing scary. Reply as JSON {"prompt":string,"choices":[string,string,string],"answer":0|1|2}.';
  const user = `Book: ${book.title} (ages ${book.ageMin}-${book.ageMax}).\nPage text:\n${text}`;
  try {
    const raw = await ask(system, user, 300); const m = raw.match(/\{[\s\S]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]);
    if (typeof j.prompt !== 'string' || !Array.isArray(j.choices) || j.choices.length !== 3 || ![0, 1, 2].includes(j.answer)) return null;
    if (!checkPassageSafety([j.prompt, ...j.choices].join(' '), 1).ok) return null;
    return { prompt: j.prompt, choices: j.choices.map(String) as [string, string, string], answer: j.answer, source: 'llm', approved: false };
  } catch { return null; }
}

// ───────────── the whole spread ─────────────

export interface DeriveOptions { variants?: VariantProvider; now?: number; keepAuthored?: boolean }
/** Derive (or refresh) a spread's Voca data from its live text. Author-pinned levels, authored/approved questions and recorded timings are kept. */
export function deriveSpreadVoca(book: Pick<StoryBook, 'id' | 'band' | 'refrain' | 'characters' | 'language'>, sp: StorySpread, o: DeriveOptions = {}): SpreadVoca {
  const prev = sp.voca as SpreadVoca | undefined;
  const text = spreadText(sp);
  const level = prev && prev.auto === false ? prev.level : spreadLevel(book.band, text);
  const keepQ = prev?.question && (prev.question.source === 'author' || prev.question.approved);
  const question = keepQ ? prev!.question : templateQuestion(book, sp);
  const keepT = prev?.timings && prev.timingSource && prev.timingSource !== 'estimate';
  const timings: WordTimingMs[] | undefined = keepT ? prev!.timings : (words(text).length ? estimateWordTimings(text, { rate: .85 }) : undefined);
  const safety = checkPassageSafety(text, level, 'story');
  const out: SpreadVoca = {
    level, auto: prev ? prev.auto : true,
    targetWords: targetWords(book, text, 5, o.variants),
    ...(prev?.variants ? { variants: prev.variants } : {}),
    ...(question ? { question } : {}),
    ...(timings ? { timings, timingSource: keepT ? prev!.timingSource : 'estimate' as const } : {}),
    safety: { ok: safety.ok, problems: safety.problems, checkedAt: o.now ?? 0 },
  };
  return out;
}
export function deriveBookVoca(book: StoryBook, o: DeriveOptions = {}): StoryBook {
  const spreads = book.spreads.map(sp => ({ ...sp, voca: deriveSpreadVoca(book, sp, o) }));
  const bl = bookLevel({ band: book.band, spreads });
  return { ...book, spreads, voca: book.voca && book.voca.auto === false ? book.voca : { level: bl.level, auto: true, fkGrade: bl.fkGrade } };
}
