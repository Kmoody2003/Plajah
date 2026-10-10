/**
 * childrensSpeech.ts — a pronunciation and tone pass for reading aloud to children.
 *
 * Pure and dependency-free (shared by the Aria voice route and its tests). It only runs when the caller asks for the
 * 'storybook' delivery, and the reader only asks for it on children's books (services/living/audio/audience.ts), so
 * nothing else Aria says is touched. The text on screen never changes; only the text sent to the voice does.
 *
 * Tone: a voice engine reads trailing dots, long dashes and drawn-out spellings ("Mmmm", "Ooooh") as breathy, slow and
 * intimate. A picture book wants steady, warm and plain, so those are flattened, and sound words written in capitals
 * (BEEP, POP) are read as words instead of shouted or spelled. Pronunciation: names the engine tends to get wrong.
 */

/** Names and words children's books use that voice engines mispronounce. Whole-word, case-insensitive. */
export const CHILDRENS_PRONUNCIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bLumi\b/g, 'Loo-mee'],
  [/\bMira\b/g, 'Mee-rah'],
  [/\bBo\b/g, 'Boh'],
  [/\bZib\b/g, 'Zibb'],
  [/\bGlint\b/g, 'Glint'],
  [/\bkazoo\b/gi, 'kuh-ZOO'],
  [/\bbioluminescent\b/gi, 'bye-oh-LOO-min-ent'],
  [/\bGolden Thread\b/g, 'Golden Thread'],
];

const SOUND_WORD_CAPS = /\b([A-Z]{3,})\b/g;   // BEEP, POP, HONK: not acronyms of 2 letters, not "I"/"A"

export function childrensSpeechText(raw: string): string {
  if (!raw) return '';
  let t = raw;

  // Capitalised sound words read as plain words: "BEEP!" -> "Beep!"
  t = t.replace(SOUND_WORD_CAPS, (w) => w[0] + w.slice(1).toLowerCase());

  // Drawn-out spellings: "Sooooo" -> "So", "Mmmm" -> "Mm", "Ooooh" -> "Oh", "Aaah" -> "Ah", "Shhhh" -> "Shh".
  t = t.replace(/\b([Mm])m{2,}\b/g, '$1m')
       .replace(/\b([Oo])o+h+\b/g, '$1h').replace(/\b([Aa])a+h+\b/g, '$1h')
       .replace(/\b([Ss])h{3,}\b/g, '$1hh')
       .replace(/([aeiouAEIOU])\1{2,}/g, '$1')
       .replace(/([b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z])\1{2,}/g, '$1$1');

  // Trailing dots and long dashes make the voice trail off or breathe: use plain, steady punctuation.
  t = t.replace(/\s*(?:\.{3,}|…)\s*$/g, '.')           // "...and then..." ends cleanly
       .replace(/\s*(?:\.{3,}|…)\s*/g, ', ')            // mid-sentence
       .replace(/\s*[—–]\s*/g, ', ');                   // dramatic dash pauses
  t = t.replace(/([!?])[!?]+/g, '$1');                   // "?!" / "!!!" -> a single mark (less shouting)

  for (const [pattern, spoken] of CHILDRENS_PRONUNCIATIONS) t = t.replace(pattern, spoken);

  return t.replace(/ {2,}/g, ' ').replace(/,\s*,/g, ',').trim();
}
