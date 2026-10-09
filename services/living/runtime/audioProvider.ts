// One place that obtains the book audio engine (services/living/audio) lazily, so the reader / Tela preview only pay for it
// when a living page is actually opened. Returns null (silent) if the engine cannot load.
import type { BookAudioApi, Score } from '../contracts';

export async function loadBookAudio(scores?: Record<string, Score>): Promise<BookAudioApi | null> {
  try {
    const m = await import('../audio');
    const a = m.getBookAudio();
    if (scores) a.registerScores(scores);
    return a;
  } catch (e) { console.warn('[living] audio engine unavailable, pages will be silent', e); return null; }
}

export async function disposeBookAudio(): Promise<void> {
  try { (await import('../audio')).resetBookAudio(); } catch { /* */ }
}
