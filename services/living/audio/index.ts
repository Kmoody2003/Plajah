// Living Books audio: public entry point.
//
//   import { getBookAudio } from 'services/living/audio';
//   const audio = getBookAudio();          // one engine per page/reader session
//   onFirstTap(() => audio.unlock());      // REQUIRED before any sound (iOS Safari)
//   audio.sfx('beep', { pitch: 3 });       // see sfxCatalog.ts / docs/LIVING_AUDIO.md
//
// The engine is created lazily and holds no AudioContext until unlock() runs inside a user gesture.

import { createBookAudio, type BookAudioEx, type EngineOptions } from './engine';
import { createAriaClient } from './narration';

export type { BookAudioApi } from '../contracts';
export type { BookAudioEx } from './engine';
export { createBookAudio } from './engine';
export { createMockAudio, type MockAudio } from './mock';
export { SFX_CATALOG, SFX_IDS, resolveSfx, type SfxDef, type SfxCategory } from './sfxCatalog';
export { INSTRUMENTS, resolveInstrument, type InstrumentDef } from './instruments';
export { AMBIENCE_IDS } from './ambience';
export { DEMO_SCORES } from './demoScores';
export * as compose from './compose';
export { splitWords, estimateWordTimings, VoiceRecorder, TapTimer, exportTake, playTake, timingsForTake, type RecordedTake } from './narration';

let instance: BookAudioEx | null = null;

/** Where the Aria voice proxy gets its Firebase token. Loaded lazily so the engine itself stays light. */
async function getAuthToken(): Promise<string | null> {
  try {
    const m = await import('../../backendService');
    return (await m.auth.currentUser?.getIdToken()) || null;
  } catch { return null; }
}

/** The singleton engine for this page/reader session. */
export function getBookAudio(): BookAudioEx {
  if (!instance) {
    const hasWindow = typeof window !== 'undefined';
    const o: EngineOptions = { aria: hasWindow ? createAriaClient({ getToken: getAuthToken, style: 'storybook' }) : null };
    instance = createBookAudio(o);
  }
  return instance;
}

/** Dispose the singleton (reader unmount, tests). The next getBookAudio() builds a fresh engine. */
export function resetBookAudio(): void {
  if (instance) { try { instance.dispose(); } catch { /* ignore */ } instance = null; }
}
