/**
 * ariaSpeech.ts — turns one of Aria's chat replies into text fit to be spoken.
 *
 * Pure and dependency-free so the server route and the tests share it. Two jobs:
 *   1. Strip everything that is for eyes, not ears (markdown, links, code, the
 *      <ARIA_ACTION>/<BUILD_*> protocol blocks, emoji).
 *   2. Respell Plajah's product names so the voice engine says them the way we do.
 *      On screen the names stay as written; only the text sent to TTS is respelled.
 */

/** How we say the names. Order matters: longest/most specific first. */
export const ARIA_PRONUNCIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bPlajah\+/gi, 'Plah-yah Plus'],
  [/\bPlajah\b/gi, 'Plah-yah'],      // J is pronounced like a Y
  [/\bChora\b/gi, 'Koh-rah'],        // hard Ch, like the Greek "chorus"
  [/\bReello\b/gi, 'Ree-loh'],
];

/** Protocol blocks the model emits for the app, never for the user to hear. */
const PROTOCOL_BLOCKS = /<(ARIA_ACTION|BUILD_[A-Z_]+|COUNCIL_CONVENE|DESIGN_STUDY)>[\s\S]*?<\/\1>/g;

// Pictographs, dingbats, symbols, flags, variation selectors, ZWJ.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu;

export const ARIA_SPEECH_MAX_CHARS = 1200;

export function prepareSpeechText(raw: unknown, maxChars: number = ARIA_SPEECH_MAX_CHARS): string {
  if (typeof raw !== 'string') return '';
  let t = raw
    .replace(PROTOCOL_BLOCKS, ' ')
    .replace(/```[\s\S]*?```/g, ' ')                 // fenced code is not read aloud
    .replace(/`([^`]*)`/g, '$1')                      // inline code → its text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')            // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // [label](url) → label
    .replace(/https?:\/\/\S+/g, ' ')                  // bare URLs
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')               // headings
    .replace(/^\s*>\s?/gm, '')                        // blockquotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')        // list markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2')               // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')                  // italics
    .replace(/~~(.*?)~~/g, '$1')
    .replace(EMOJI, '');

  for (const [pattern, spoken] of ARIA_PRONUNCIATIONS) t = t.replace(pattern, spoken);

  t = t
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*\n\s*/g, '\n\n')                // keep paragraph breaks (natural pauses)
    .replace(/\n/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return t;
}
