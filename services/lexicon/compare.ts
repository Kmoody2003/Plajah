/**
 * How meanings differ or match across words and languages.
 *
 *  • kinshipFor()   — same-spelling words in other languages and etymological cognates, each judged
 *                     same / shifted / drifted / false-friend against the home word's senses
 *                     (German "Gift" = poison: a cognate of English "gift" that drifted).
 *  • meaningPrism() — how one English word's senses split across another language's words
 *                     (English "bank" → Spanish "orilla" for a river, "banco" for money).
 *  • compareWords() — any two entries side by side, sense-to-sense alignment and a verdict.
 *
 * Deterministic and explainable (token overlap over English glosses, with the home word's synonyms
 * counted as matches) — no model call, so every verdict can show its reason.
 */
import type { CompareResult, EtymStep, Kinship, KinshipVerdict, LangEntry, MeaningPrism, PrismRow, SenseAlignment, WordEntry } from './types';
import { segText } from './wikitext';
import { familyOf } from './languages';

const STOP = new Set(('a an the of to in on at by for with from or and as is are be been being that this which who whom whose ' +
  'it its into onto than then so such any some one someone something used use especially often usually also ' +
  'not no very more most other another etc his her their them they he she you your we our us i me my ' +
  'act state quality person thing way kind sort type form make made having has have do does done').split(' '));

export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ied')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('es') && /(s|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ly')) s = s.slice(0, -2);
  return s;
}

export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length > 1 && !STOP.has(w)) out.add(stem(w));
  return out;
}

/** 0..1 overlap of two glosses; `bridge` terms (the home word + its synonyms) count as present in `b`. */
/**
 * 0..1 overlap of two glosses. `bridgeA`: terms that count as matches when they appear in `a` (the other
 * word and its synonyms); `bridgeB` likewise for `b` — so "present: a gift" meets "gift".
 */
export function overlap(a: string, b: string, bridgeA: Set<string> = new Set(), bridgeB: Set<string> = new Set()): number {
  const A = terms(a); const B = terms(b);
  if (!A.size || !B.size) return 0;
  let hitA = 0; let hitB = 0;
  for (const t of A) if (B.has(t) || bridgeA.has(t)) hitA++;
  for (const t of B) if (A.has(t) || bridgeB.has(t)) hitB++;
  // Dice-like, but a one-word gloss that names the home word ("gift") is a full match.
  const dice = (hitA + hitB) / (A.size + B.size);
  const cover = hitA / A.size;
  return Math.min(1, Math.max(dice, cover * 0.85));
}

/** Inflection / form-of senses say nothing about meaning ("Plural of oncia"). */
export const FORM_OF = /^(\(.*?\)\s*)?(plural|inflection|infl|alternative|obsolete|archaic|dated|nonstandard|misspelling|eye dialect|filter-avoidance|past|present|feminine|masculine|neuter|genitive|dative|accusative|nominative|vocative|comparative|superlative|definite|indefinite|singular|first-person|second-person|third-person|gerund|participle|supine|imperative|apocopic|contraction|abbreviation|initialism|acronym|clipping|romanization|diminutive|augmentative|female form|male form)\b[^.;]*?\b(form|of|spelling|participle|tense)\b/i;

export function sensesOf(L: LangEntry | undefined, max = 24, meaningOnly = false): string[] {
  if (!L) return [];
  const out: string[] = []; const old: string[] = [];
  for (const g of L.etymologies) for (const p of g.pos) for (const s of p.senses) {
    const t = segText(s.text);
    if (meaningOnly && FORM_OF.test(t)) continue;
    // Today's meaning first: obsolete/archaic senses only when nothing current is recorded.
    if (meaningOnly && s.labels.some(l => OLD_LABEL.test(l))) { old.push(t); continue; }
    if (out.length < max) out.push(t);
  }
  return out.length || !meaningOnly ? out : old.slice(0, max);
}

function stepKey(s: { lang: string; word: string }) { return `${s.lang}|${s.word.replace(/^\*/, '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}`; }

/** Ancestor keys of a language section (all etymologies), for shared-origin checks. */
export function ancestry(L: LangEntry | undefined): Set<string> {
  const out = new Set<string>();
  if (!L) return out;
  for (const g of L.etymologies) for (const s of [...(g.etymology?.chain ?? []), ...(g.etymology?.roots ?? [])]) if (s.word) out.add(stepKey(s));
  return out;
}

function sharesOrigin(a: Set<string>, bChain: EtymStep[] | Set<string>, homeLang?: string, homeWord?: string): boolean {
  const b = bChain instanceof Set ? bChain : new Set(bChain.filter(s => s.word).map(stepKey));
  for (const k of b) if (a.has(k)) return true;
  if (homeLang && homeWord && b.has(`${homeLang}|${homeWord.toLowerCase()}`)) return true; // borrowed from the home word itself
  return false;
}

export function verdictFor(ov: number, shared: boolean): Kinship {
  if (ov >= 0.5) return 'same';
  if (ov >= 0.2) return 'shifted';
  return shared ? 'drifted' : 'false-friend';
}

const WHY: Record<Kinship, (o: string, w: string) => string> = {
  same: (o, w) => `Means essentially what “${w}” means${o ? ` — closest to “${o}”` : ''}.`,
  shifted: (o, w) => `Overlaps with “${w}” but leans elsewhere${o ? ` — nearest sense: “${o}”` : ''}.`,
  drifted: (_o, w) => `Shares an ancestor with “${w}”, but the meaning travelled somewhere else.`,
  'false-friend': (_o, w) => `Looks like “${w}” by coincidence — different history, different meaning.`,
  unrelated: () => 'No clear relation.',
};

function best(gloss: string, senses: string[], bridge: Set<string>, homeWord?: string, bridgeB?: Set<string>): { ov: number; sense?: string } {
  let ov = 0; let sense: string | undefined;
  // A loanword glossed by the home word itself (French "cool" = "cool (informal senses)") keeps its meaning.
  const first = [...terms(gloss)][0];
  if (homeWord && first && first === stem(homeWord.toLowerCase())) return { ov: 0.75, sense: senses[0] };
  for (const s of senses) { const v = overlap(gloss, s, bridge, bridgeB); if (v > ov) { ov = v; sense = s; } }
  return { ov, sense };
}

/**
 * Judge cognates (from the home etymology) and same-spelling sections (other languages on the page).
 * `extraBridge` = synonyms from the thesaurus, so "present" matches "gift".
 */
export function kinshipFor(entry: WordEntry, homeLang = 'en', extraBridge: string[] = []): KinshipVerdict[] {
  const home = entry.langs.find(l => l.lang === homeLang) ?? entry.langs[0];
  if (!home) return [];
  const senses = sensesOf(home);
  const bridge = new Set([entry.title, ...home.synonyms, ...extraBridge].flatMap(w => [...terms(w)]));
  const homeAnc = ancestry(home);
  const homeChainLangs = new Set(home.etymologies.flatMap(g => (g.etymology?.chain ?? []).map(c => c.lang)));
  const homeCognates = new Set(home.etymologies.flatMap(g => (g.etymology?.cognates ?? []).map(c => `${c.lang}|${c.word.toLowerCase()}`)));
  const out: KinshipVerdict[] = [];
  const seen = new Set<string>();
  // 1) Same spelling, other language sections.
  for (const L of entry.langs) {
    if (L === home) continue;
    const gl = sensesOf(L, 3, true);
    if (!gl.length) continue;
    const gloss = gl.join('; ');
    const { ov, sense } = best(gloss, senses, bridge, entry.title);
    const chain = L.etymologies.flatMap(g => [...(g.etymology?.chain ?? []), ...(g.etymology?.roots ?? [])]);
    // An ancestor stage of the home word (Middle English "ones") or a listed cognate is related by definition.
    const isAncestorStage = homeChainLangs.has(L.lang);
    // …or the same spelling as a listed cognate in a sister language (Faroese "gift" beside Danish/Swedish "gift").
    const isListedCognate = homeCognates.has(`${L.lang}|${entry.title.toLowerCase()}`)
      || home.etymologies.some(g => (g.etymology?.cognates ?? []).some(c => c.word.toLowerCase() === entry.title.toLowerCase() && familyOf(c.lang) === familyOf(L.lang) && familyOf(c.lang) !== 'other'));
    const shared = isAncestorStage || isListedCognate || sharesOrigin(homeAnc, chain, home.lang, entry.title);
    const kinship = verdictFor(ov, shared);
    seen.add(`${L.lang}|${entry.title.toLowerCase()}`);
    out.push({ lang: L.lang, langName: L.langName, word: entry.title, gloss, kinship, overlap: round(ov), closestSense: sense, sharedOrigin: shared, why: WHY[kinship](sense ?? '', entry.title) });
  }
  // 2) Cognates named in the home etymology (glossed ones only — an unglossed cognate can't be judged).
  for (const g of home.etymologies) for (const c of g.etymology?.cognates ?? []) {
    if (!c.gloss || !c.word) continue;
    const key = `${c.lang}|${c.word.toLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key);
    const { ov, sense } = best(c.gloss, senses, bridge, entry.title);
    const kinship = verdictFor(ov, true);
    out.push({ lang: c.lang, langName: c.langName, word: c.word, gloss: c.gloss, kinship, overlap: round(ov), closestSense: sense, sharedOrigin: true, why: WHY[kinship](sense ?? '', entry.title) });
  }
  const order: Record<Kinship, number> = { 'false-friend': 0, drifted: 1, shifted: 2, same: 3, unrelated: 4 };
  return out.sort((a, b) => order[a.kinship] - order[b.kinship] || a.langName.localeCompare(b.langName));
}

/** How the home word's translated senses map onto each language's words. */
export function meaningPrism(home: LangEntry | undefined, langs: string[]): MeaningPrism {
  const groups = (home?.translations ?? []).filter(t => t.items.length);
  const senses = groups.map(g => g.gloss);
  const rows: PrismRow[] = [];
  for (const code of langs) {
    const cells = groups.map(g => uniq(g.items.filter(i => i.lang === code || (code === 'zh' && i.lang === 'cmn')).map(i => i.word)));
    const covered = cells.filter(c => c.length).length;
    if (!covered) continue;
    const distinct = uniq(cells.flat()).length;
    const firsts = uniq(cells.filter(c => c.length).map(c => c[0]));
    const shape: PrismRow['shape'] = covered < 2 ? 'partial' : firsts.length === 1 ? 'mirrors' : 'splits';
    const name = groups.flatMap(g => g.items).find(i => i.lang === code && !i.note)?.langName ?? code;
    rows.push({ lang: code, langName: name, cells, distinct, shape });
  }
  return { senses, rows };
}

/** Two entries side by side: align each sense of A with its nearest in B. */
export function compareWords(a: WordEntry, aLang: string, b: WordEntry, bLang: string): CompareResult {
  const A = a.langs.find(l => l.lang === aLang) ?? a.langs[0];
  const B = b.langs.find(l => l.lang === bLang) ?? b.langs[0];
  const as = sensesOf(A, 12); const bs = sensesOf(B, 12);
  const senseSyns = (L?: LangEntry) => (L?.etymologies ?? []).flatMap(g => g.pos.flatMap(p => p.senses.flatMap(s => s.synonyms)));
  // Identical spellings say nothing about meaning, so a shared title is no bridge.
  const sameSpelling = a.title.toLowerCase() === b.title.toLowerCase();
  const towardB = new Set([...(sameSpelling ? [] : [b.title]), ...(B?.synonyms ?? []), ...senseSyns(B)].flatMap(w => [...terms(w)]));
  const towardA = new Set([...(sameSpelling ? [] : [a.title]), ...(A?.synonyms ?? []), ...senseSyns(A)].flatMap(w => [...terms(w)]));
  const pairs: SenseAlignment[] = [];
  for (const s of as) { const r = best(s, bs, towardB, undefined, towardA); if (r.sense) pairs.push({ a: s, b: r.sense, overlap: round(r.ov) }); }
  // A short gloss that names the other word is a translation equivalent (Spanish "regalo" = "present, gift"):
  // it meets the other word's primary sense.
  const glossNames = (gloss: string, word: string) => { const t = [...terms(gloss)]; return t.length <= 4 && t.includes(stem(word.toLowerCase())); };
  // Never between identical spellings — that is exactly where false friends hide (English gift / German Gift).
  if (a.title.toLowerCase() !== b.title.toLowerCase()) {
    for (const s of bs) if (as[0] && glossNames(s, a.title)) pairs.push({ a: as[0], b: s, overlap: 0.85 });
    for (const s of as) if (bs[0] && glossNames(s, b.title)) pairs.push({ a: s, b: bs[0], overlap: 0.85 });
  }
  // Obsolete/archaic senses describe the past, not today: quarter weight for the verdict, but remembered —
  // German "Gift" (poison) still keeps an obsolete sense "gift; something given".
  const oldOf = (L?: LangEntry) => new Set((L?.etymologies ?? []).flatMap(g => g.pos.flatMap(p => p.senses.filter(s => s.labels.some(l => OLD_LABEL.test(l))).map(s => segText(s.text)))));
  const oldA = oldOf(A); const oldB = oldOf(B);
  let echo: SenseAlignment | undefined;
  for (const p of pairs) if (oldA.has(p.a) || oldB.has(p.b)) {
    if (p.overlap >= 0.3 && (!echo || p.overlap > echo.overlap)) echo = { ...p };
    p.overlap = round(p.overlap * 0.25);
  }
  pairs.sort((x, y) => y.overlap - x.overlap);
  const top = pairs.slice(0, 3);
  // Words are polysemous: the best-matching sense carries most of the weight.
  const score = top.length ? round(0.65 * top[0].overlap + 0.35 * (top.reduce((n, p) => n + p.overlap, 0) / top.length)) : 0;
  const shared = sharesOrigin(ancestry(A), ancestry(B)) || a.title.toLowerCase() === b.title.toLowerCase() && aLang !== bLang && sharesOrigin(ancestry(A), ancestry(B));
  const verdict = verdictFor(score, shared);
  const nameA = `${a.title}${A ? ` (${A.langName})` : ''}`; const nameB = `${b.title}${B ? ` (${B.langName})` : ''}`;
  const summary =
    verdict === 'same' ? `${nameA} and ${nameB} mean nearly the same thing${top[0] ? `: both cover “${clip(top[0].a)}”` : ''}.` :
    verdict === 'shifted' ? `${nameA} and ${nameB} overlap in part — they meet at “${clip(top[0]?.a ?? '')}” and part ways elsewhere.` :
    verdict === 'drifted' ? `${nameA} and ${nameB} share an ancestor, but their meanings have drifted apart.` :
    `${nameA} and ${nameB} are not the same word in meaning${a.title.toLowerCase() === b.title.toLowerCase() ? ' — a false friend' : ''}.`;
  const echoNote = echo && verdict !== 'same' ? ` An old sense still remembers the shared meaning: “${clip(oldB.has(echo.b) ? echo.b : echo.a)}”.` : '';
  return { a: { word: a.title, lang: A?.lang ?? aLang, senses: as }, b: { word: b.title, lang: B?.lang ?? bLang, senses: bs }, pairs, score, verdict, sharedOrigin: shared, summary: summary + echoNote, echo };
}

const OLD_LABEL = /^(obsolete|archaic|dated|historical|rare|poetic)$/i;
const round = (n: number) => Math.round(n * 100) / 100;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const clip = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
