import type { SpeakOptions, VoiceProfile, VoiceProvider } from '../types';
import { chunkForSpeech, estimateMarks, splitSentences, wordCount, wordIndexAt } from '../text';

/**
 * Web Speech provider (on-device, always-available last resort). Modeled on services/voca/vocaVoice.ts:
 *  - waits for voiceschanged (1.5s timeout) before choosing a voice;
 *  - never picks a non-English voice for English text; prefers natural/neural voices;
 *  - chunked by sentence (Chrome truncates long utterances); per-chunk safety timeout for Chrome's missing onend;
 *  - speak() ALWAYS resolves.
 * `hasBoundary` reports whether word-boundary events fired (null = unknown yet); when they never fire,
 * word marks are estimated from character count so highlighting still moves (but is approximate).
 */

const PREFERRED = [/natural/i, /neural/i, /aria|jenny|ava|emma|libby|sonia/i, /google us english/i, /samantha|karen|moira|tessa/i, /google uk english female/i];

export interface VoiceLike { name: string; lang: string }

/** Pure voice chooser. Never returns a voice whose language differs from the requested one (returns null instead). */
export function chooseVoice<T extends VoiceLike>(voices: T[], lang: string, preferredName?: string): T | null {
  const base = lang.slice(0, 2).toLowerCase();
  const pool = voices.filter(v => v.lang?.toLowerCase().replace('_', '-').startsWith(base));
  if (!pool.length) return null;
  if (preferredName) { const p = pool.find(v => v.name === preferredName); if (p) return p; }
  for (const re of PREFERRED) { const v = pool.find(x => re.test(x.name)); if (v) return v; }
  return pool.find(v => v.lang === lang) ?? pool[0];
}

const getSynth = (): SpeechSynthesis | undefined => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
export const webSpeechSupported = () => !!getSynth() && typeof SpeechSynthesisUtterance !== 'undefined';

let voicesReady: Promise<void> | null = null;
/** Resolves once voices are populated (or after 1.5s — some browsers never fire voiceschanged). */
export function ensureVoices(): Promise<void> {
  const synth = getSynth();
  if (!synth) return Promise.resolve();
  if (voicesReady) return voicesReady;
  voicesReady = new Promise<void>(resolve => {
    if (synth.getVoices().length) return resolve();
    const t = setTimeout(resolve, 1500);
    try { synth.addEventListener?.('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true } as any); } catch { /* ignore */ }
  });
  return voicesReady;
}

interface Run { cancelled: boolean; finish: (() => void) | null }

class WebSpeechProvider implements VoiceProvider {
  id = 'webSpeech';
  label = 'Device voice (Web Speech)';
  kind = 'device' as const;
  /** true/false once known; null before any utterance has run. Callers: only trust word highlighting when true. */
  hasBoundary: boolean | null = null;
  private runs = new Set<Run>();

  async available() { return webSpeechSupported(); }

  cancel() {
    for (const r of this.runs) { r.cancelled = true; r.finish?.(); }
    try { getSynth()?.cancel(); } catch { /* nothing speaking */ }
  }

  async speak(text: string, profile: VoiceProfile, opts: SpeakOptions = {}): Promise<void> {
    try {
      const synth = getSynth();
      if (!synth || !webSpeechSupported() || !text.trim()) return;
      const lang = opts.lang ?? 'en-US';
      await ensureVoices();
      const voice = chooseVoice(synth.getVoices(), lang, profile.providerPrefs?.webSpeech?.voice);
      const rate = Math.max(0.1, (profile.rate || 1) * (opts.speed ?? 1));
      const run: Run = { cancelled: false, finish: null };
      this.runs.add(run);
      opts.signal?.addEventListener('abort', () => this.cancel(), { once: true });
      let started = false;
      let wordOffset = 0;
      const chunks = splitSentences(text).flatMap(s => chunkForSpeech(s));
      try {
        for (const chunk of chunks) {
          if (run.cancelled || opts.signal?.aborted) break;
          await this.speakChunk(chunk, { synth, voice, lang, rate, pitch: profile.pitch || 1, wordOffset, run, opts, onFirst: () => { if (!started) { started = true; opts.onStart?.(); } } });
          wordOffset += wordCount(chunk);
        }
      } finally { this.runs.delete(run); }
      opts.onEnd?.();
    } catch { /* always resolve */ opts.onEnd?.(); }
  }

  private speakChunk(chunk: string, c: { synth: SpeechSynthesis; voice: SpeechSynthesisVoice | null; lang: string; rate: number; pitch: number; wordOffset: number; run: Run; opts: SpeakOptions; onFirst: () => void }): Promise<void> {
    return new Promise<void>(resolve => {
      let done = false, sawBoundary = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const finish = () => { if (done) return; done = true; clearTimeout(safety); clearTimeout(probe); timers.forEach(clearTimeout); c.run.finish = null; resolve(); };
      c.run.finish = finish;
      const u = new SpeechSynthesisUtterance(chunk);
      if (c.voice) u.voice = c.voice;
      u.lang = c.voice?.lang ?? c.lang;
      u.rate = c.rate; u.pitch = c.pitch; u.volume = 1;
      u.onend = finish; u.onerror = finish;
      u.onboundary = (e: SpeechSynthesisEvent) => {
        if (e.name && e.name !== 'word') return;
        sawBoundary = true; this.hasBoundary = true;
        timers.forEach(clearTimeout); timers.length = 0;
        c.opts.onWord?.({ charIndex: e.charIndex, i: c.wordOffset + wordIndexAt(chunk, e.charIndex) });
      };
      const estDur = (chunk.length * 75) / (c.rate || 1);
      let probe: ReturnType<typeof setTimeout>;
      u.onstart = () => {
        c.onFirst();
        probe = setTimeout(() => {                       // no boundary events => estimate marks so highlighting still advances
          if (sawBoundary || done) return;
          this.hasBoundary = false;
          if (!c.opts.onWord) return;
          for (const m of estimateMarks(chunk, estDur, 0, c.wordOffset)) timers.push(setTimeout(() => !done && c.opts.onWord!(m), Math.max(0, m.startMs - 500)));
        }, 500);
      };
      probe = setTimeout(() => {}, 0);
      const safety = setTimeout(finish, Math.min(estDur * 1.2 + 2500, 40000));   // Chrome sometimes never fires `end`
      try { c.synth.speak(u); } catch { finish(); }
    });
  }
}

export const webSpeechProvider = new WebSpeechProvider();
export type { WebSpeechProvider };
