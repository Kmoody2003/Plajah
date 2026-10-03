/**
 * Voca voice — Chora's spoken coaching via the browser's on-device speech synthesis.
 *  • picks the most natural available English voice (Natural/Neural/Google/Siri voices first);
 *  • every speak() resolves even when the browser forgets to fire `end` (a long-standing Chrome bug),
 *    via a duration-based safety timeout — so the listener always resumes;
 *  • short utterances only (Chrome cuts off long ones), cancel-before-speak so lines never pile up.
 */

import { webSpeechProvider, webSpeechSupported, ensureVoices } from '../voice/aria/providers/webSpeech';
import type { VoiceProfile } from '../voice/aria/types';

// Public API unchanged; the speech machinery now lives in the shared Aria voice webSpeech provider
// (voiceschanged wait, English-only voice choice, per-chunk safety timeouts, always-resolve).
let lang = 'en-US';

export const ttsSupported = () => webSpeechSupported();

export function initVoice(l = 'en-US'): Promise<void> {
  lang = l;
  return ensureVoices();
}

export function cancelSpeech() { webSpeechProvider.cancel(); }

/** Speak a short line; always resolves (on end, on error, or on a safety timeout). */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}): Promise<void> {
  if (!ttsSupported() || !text.trim()) return Promise.resolve();
  cancelSpeech();                                   // lines never pile up
  const profile: VoiceProfile = { id: 'voca', name: 'Voca', persona: 'buddy', rate: opts.rate ?? 0.95, pitch: opts.pitch ?? 1.08, providerPrefs: {}, fallbackOrder: ['webSpeech'] };
  return webSpeechProvider.speak(text, profile, { lang });
}

/** Model a word: syllables slowly, then the whole word at a natural pace. */
export async function modelWord(word: string, syllables: string[]) {
  if (syllables.length > 1) { await speak(syllables.join(' … '), { rate: 0.6 }); await pause(150); }
  await speak(word, { rate: 0.8 });
}
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
