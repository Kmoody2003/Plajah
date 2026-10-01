/**
 * Voca voice — Chora's spoken coaching via the browser's on-device speech synthesis.
 *  • picks the most natural available English voice (Natural/Neural/Google/Siri voices first);
 *  • every speak() resolves even when the browser forgets to fire `end` (a long-standing Chrome bug),
 *    via a duration-based safety timeout — so the listener always resumes;
 *  • short utterances only (Chrome cuts off long ones), cancel-before-speak so lines never pile up.
 */

let voice: SpeechSynthesisVoice | null = null;
let ready: Promise<void> | null = null;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const ttsSupported = () => !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

const PREFERRED = [/natural/i, /neural/i, /aria|jenny|ava|emma|libby|sonia/i, /google us english/i, /samantha|karen|moira|tessa/i, /google uk english female/i];

function choose(lang: string): SpeechSynthesisVoice | null {
  const all = synth?.getVoices() ?? [];
  const pool = all.filter(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  for (const re of PREFERRED) { const v = pool.find(x => re.test(x.name)); if (v) return v; }
  return pool.find(v => v.lang === lang) ?? pool[0] ?? all[0] ?? null;
}

export function initVoice(lang = 'en-US'): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  if (ready) return ready;
  ready = new Promise<void>(resolve => {
    const pick = () => { voice = choose(lang); if (voice) resolve(); };
    pick();
    if (!voice) {
      synth!.addEventListener?.('voiceschanged', pick, { once: true } as any);
      setTimeout(() => { voice = choose(lang); resolve(); }, 1500);   // some browsers never fire voiceschanged
    }
  });
  return ready;
}

export function cancelSpeech() { try { synth?.cancel(); } catch { /* nothing speaking */ } }

/** Speak a short line; always resolves (on end, on error, or on a safety timeout). */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}): Promise<void> {
  if (!ttsSupported() || !text.trim()) return Promise.resolve();
  return new Promise<void>(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(safety); resolve(); } };
    cancelSpeech();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-US';
    u.rate = opts.rate ?? 0.95; u.pitch = opts.pitch ?? 1.08; u.volume = 1;
    u.onend = finish; u.onerror = finish;
    const est = (text.length * 75) / (u.rate || 1) + 1200;
    const safety = setTimeout(finish, Math.min(est, 12000));
    try { synth!.speak(u); } catch { finish(); }
  });
}

/** Model a word: syllables slowly, then the whole word at a natural pace. */
export async function modelWord(word: string, syllables: string[]) {
  if (syllables.length > 1) { await speak(syllables.join(' … '), { rate: 0.6 }); await pause(150); }
  await speak(word, { rate: 0.8 });
}
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
