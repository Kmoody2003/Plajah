/**
 * Voca content safety — vets any text a child will be asked to read aloud (curated passages today,
 * teacher- or parent-added passages later).
 *
 * Three tiers:
 *  • BLOCK  — never acceptable in a children's reading passage at any level (profanity, sexual content,
 *             drugs/alcohol, slurs and hate terms, self-harm, graphic violence).
 *  • MATURE — acceptable only in historical or literary texts for older readers (levels ≥ 9): war, death,
 *             weapons named in a historical context. Below that level they are rejected.
 *  • The checker matches whole words (with simple inflections) so "Scunthorpe"-style false positives on
 *    innocent words ("class", "assess", "grapes") do not happen.
 *
 * This is a gate, not a substitute for editorial review: every new passage still gets a human read.
 */

const BLOCK = [
  // profanity / vulgarity
  'damn', 'damned', 'hell', 'crap', 'shit', 'fuck', 'bitch', 'bastard', 'ass', 'arse', 'piss', 'dick', 'cock', 'pussy', 'slut', 'whore', 'bloody',
  // sexual content
  'sex', 'sexy', 'sexual', 'naked', 'nude', 'porn', 'erotic', 'breast', 'breasts', 'genital', 'genitals', 'condom', 'orgasm', 'seduce', 'seductive', 'lust',
  // drugs, alcohol, tobacco
  'beer', 'wine', 'whiskey', 'vodka', 'liquor', 'drunk', 'alcohol', 'cigarette', 'cigarettes', 'cigar', 'tobacco', 'vape', 'marijuana', 'weed', 'cocaine', 'heroin', 'meth', 'drug', 'drugs', 'high',
  // self-harm & graphic violence
  'suicide', 'kill', 'killed', 'killing', 'killer', 'murder', 'murdered', 'stab', 'stabbed', 'slaughter', 'blood', 'bloody', 'gore', 'torture', 'corpse', 'behead',
  // hate / slurs (generic terms; a vetted slur list plugs in via extendBlocklist)
  'stupid', 'idiot', 'dumb', 'moron', 'retard', 'retarded', 'hate',
];

/** Allowed only at MATURE_MIN_LEVEL and above, and only for historical / literary kinds. */
const MATURE = ['war', 'wars', 'battle', 'battlefield', 'fought', 'fight', 'dead', 'death', 'die', 'died', 'dying', 'grave', 'weapon', 'weapons', 'gun', 'guns', 'sword', 'enemy', 'perish'];
const MATURE_MIN_LEVEL = 9;
const MATURE_KINDS = new Set(['speech', 'poem', 'informational', 'fable', 'story']);

// 'high' only means drugs in phrases; as a lone word it is innocent ("high notes"). Keep it out of the hard list.
const CONTEXT_ONLY = new Set(['high', 'weed', 'hate', 'dumb', 'stupid']);
const blockSet = new Set(BLOCK.filter(w => !CONTEXT_ONLY.has(w)));
const softSet = new Set([...CONTEXT_ONLY].filter(w => w !== 'high' && w !== 'weed'));   // name-calling: blocked below level 9 only
const matureSet = new Set(MATURE);

export function extendBlocklist(words: string[]) { for (const w of words) blockSet.add(w.toLowerCase()); }

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[’']/g, "'").split(/[^a-z']+/).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}
function stem(w: string): string[] {
  const out = [w];
  if (w.endsWith("'s")) out.push(w.slice(0, -2));
  if (w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  if (w.endsWith('ed')) out.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('ing')) out.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  return out;
}

export interface SafetyResult { ok: boolean; problems: { word: string; tier: 'block' | 'mature' | 'soft' }[] }

export function checkPassageSafety(text: string, level: number, kind: string = 'story'): SafetyResult {
  const problems: SafetyResult['problems'] = [];
  for (const w of tokenize(text)) {
    const forms = stem(w);
    if (forms.some(f => blockSet.has(f))) { problems.push({ word: w, tier: 'block' }); continue; }
    if (level < MATURE_MIN_LEVEL && forms.some(f => softSet.has(f))) { problems.push({ word: w, tier: 'soft' }); continue; }
    if (forms.some(f => matureSet.has(f)) && (level < MATURE_MIN_LEVEL || !MATURE_KINDS.has(kind))) problems.push({ word: w, tier: 'mature' });
  }
  return { ok: problems.length === 0, problems };
}
