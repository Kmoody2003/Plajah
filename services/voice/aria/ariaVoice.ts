import type { SpeakOptions, SpeakResult, VoiceProfile, VoiceProvider, VoiceState, WordMark } from './types';
import { AudioCache, createDefaultCache } from './cache';
import { serverTtsProvider } from './providers/serverTts';
import { kokoroProvider } from './providers/kokoro';
import { webSpeechProvider } from './providers/webSpeech';

export { splitSentences, estimateMarks } from './text';

/**
 * Aria voice: ONE entry point for every read-aloud surface, independent of any TTS vendor.
 * Cascade: profile.fallbackOrder (default serverTts -> kokoro -> webSpeech); unavailable or failing providers
 * are skipped. speak()/speakSentences() ALWAYS resolve. A new speak cancels the previous one (no overlap).
 */

const CASCADE = ['serverTts', 'kokoro', 'webSpeech'];

export const DEFAULT_PROFILES: Record<string, VoiceProfile> = {
  aria: {
    id: 'aria', name: 'Aria', persona: 'aria', rate: 1.0, pitch: 1.05,
    providerPrefs: { kokoro: { voice: 'af_heart' }, webSpeech: {} }, fallbackOrder: CASCADE,
  },
  narrator: {
    id: 'narrator', name: 'Narrator', persona: 'narrator', rate: 0.92, pitch: 0.92,
    providerPrefs: { kokoro: { voice: 'bf_emma' }, webSpeech: {} }, fallbackOrder: CASCADE,
  },
  buddy: {
    id: 'buddy', name: 'Reading Buddy', persona: 'buddy', rate: 0.82, pitch: 1.15, onDeviceOnly: true,
    providerPrefs: { kokoro: { voice: 'af_bella' }, webSpeech: {} }, fallbackOrder: CASCADE,
  },
};

export type AudioPlayer = (audio: Blob | string, marks: WordMark[], opts: SpeakOptions, signal: AbortSignal) => Promise<void>;

/** Default audio playback via HTMLAudioElement; fires onWord from marks as time advances. */
export const defaultAudioPlayer: AudioPlayer = (audio, marks, opts, signal) =>
  new Promise<void>((resolve, reject) => {
    if (typeof Audio === 'undefined') return reject(new Error('no audio output'));
    const url = typeof audio === 'string' ? audio : URL.createObjectURL(audio);
    const el = new Audio(url);
    let next = 0, over = false;
    const done = (err?: unknown) => {
      if (over) return; over = true;
      signal.removeEventListener('abort', onAbort);
      try { el.pause(); } catch { /* ignore */ }
      if (typeof audio !== 'string') { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
      err ? reject(err) : resolve();
    };
    const onAbort = () => done();
    signal.addEventListener('abort', onAbort, { once: true });
    el.ontimeupdate = () => {
      const ms = el.currentTime * 1000;
      while (next < marks.length && marks[next].startMs <= ms) opts.onWord?.(marks[next++]);
    };
    el.onended = () => done();
    el.onerror = () => done(new Error('audio playback error'));
    el.play().catch(done);
  });

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise<T | undefined>((resolve, reject) => {
    const onAbort = () => resolve(undefined);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(v => { signal.removeEventListener('abort', onAbort); resolve(v); }, e => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

export interface AriaVoiceInit { providers?: VoiceProvider[]; profiles?: Record<string, VoiceProfile>; cache?: AudioCache | null; player?: AudioPlayer }

export class AriaVoiceService {
  private providers = new Map<string, VoiceProvider>();
  private profiles: Record<string, VoiceProfile>;
  private profile: VoiceProfile;
  private cancellers = new Set<() => void>();
  private listeners = new Set<(s: VoiceState) => void>();
  private ctrl: AbortController | null = null;
  private runId = 0;
  private state: VoiceState;
  private cache: AudioCache | null;
  private player: AudioPlayer;
  /** Provider id that spoke the most recent utterance (null if none could). */
  lastProvider: string | null = null;

  constructor(init: AriaVoiceInit = {}) {
    this.profiles = { ...DEFAULT_PROFILES, ...(init.profiles ?? {}) };
    this.profile = this.profiles.aria;
    this.cache = init.cache === undefined ? null : init.cache;
    this.player = init.player ?? defaultAudioPlayer;
    for (const p of init.providers ?? []) this.providers.set(p.id, p);
    this.state = { speaking: false, provider: null, profileId: this.profile.id };
  }

  registerProvider(p: VoiceProvider) { this.providers.set(p.id, p); }
  getProvider(id: string) { return this.providers.get(id); }
  setCache(c: AudioCache | null) { this.cache = c; }
  setAudioPlayer(p: AudioPlayer) { this.player = p; }

  setProfile(p: VoiceProfile | string) {
    const next = typeof p === 'string' ? this.profiles[p] : p;
    if (!next) return;
    this.profiles[next.id] = next;
    this.profile = next;
    this.emit({ profileId: next.id });
  }
  getProfile(): VoiceProfile { return this.profile; }
  listProfiles(): VoiceProfile[] { return Object.values(this.profiles); }

  get isSpeaking() { return this.state.speaking; }
  getState(): VoiceState { return this.state; }
  onState(cb: (s: VoiceState) => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  /** Other modules (legacy speechSynthesis users, sound managers) register a stop function so cancel() silences them too. */
  registerExternalCanceller(fn: () => void): () => void { this.cancellers.add(fn); return () => { this.cancellers.delete(fn); }; }

  cancel() {
    try { this.ctrl?.abort(); } catch { /* ignore */ }
    this.silence();
    this.emit({ speaking: false });
  }

  private silence() {
    for (const p of this.providers.values()) { try { p.cancel(); } catch { /* ignore */ } }
    for (const fn of this.cancellers) { try { fn(); } catch { /* ignore */ } }
  }

  private emit(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) { try { l(this.state); } catch { /* listener bug must not break speech */ } }
  }

  private begin(ext?: AbortSignal) {
    try { this.ctrl?.abort(); } catch { /* ignore */ }
    this.silence();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const id = ++this.runId;
    if (ext) { if (ext.aborted) ctrl.abort(); else ext.addEventListener('abort', () => ctrl.abort(), { once: true }); }
    this.emit({ speaking: true, provider: null });
    return { id, signal: ctrl.signal };
  }
  private end(id: number) { if (id === this.runId) { this.ctrl = null; this.emit({ speaking: false }); } }

  /** Speak text. Always resolves. A new call cancels whatever is speaking. */
  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    const run = this.begin(opts.signal);
    try {
      if (!String(text ?? '').trim()) return;
      opts.onStart?.();
      await this.cascade(text, opts, run.signal, run.id);
    } catch (e) { console.debug('[aria] speak failed', e); }
    finally { try { opts.onEnd?.(); } catch { /* ignore */ } this.end(run.id); }
  }

  /**
   * Speak a stream of sentences (e.g. a model reply). The first sentence starts as soon as it arrives;
   * the source keeps being consumed while earlier sentences are spoken. Always resolves.
   */
  async speakSentences(src: AsyncIterable<string> | Iterable<string>, opts: SpeakOptions = {}): Promise<void> {
    const run = this.begin(opts.signal);
    const queue: string[] = [];
    let finished = false;
    let wake: (() => void) | null = null;
    const poke = () => { const w = wake; wake = null; w?.(); };
    run.signal.addEventListener('abort', poke, { once: true });
    (async () => {
      try { for await (const s of src as AsyncIterable<string>) { if (run.signal.aborted) break; if (String(s ?? '').trim()) { queue.push(String(s)); poke(); } } }
      catch (e) { console.debug('[aria] sentence source failed', e); }
      finished = true; poke();
    })();
    try {
      let started = false;
      while (!run.signal.aborted) {
        if (!queue.length) {
          if (finished) break;
          await new Promise<void>(r => { wake = r; });
          continue;
        }
        if (!started) { started = true; opts.onStart?.(); }
        await this.cascade(queue.shift()!, opts, run.signal, run.id);
      }
    } catch (e) { console.debug('[aria] speakSentences failed', e); }
    finally { try { opts.onEnd?.(); } catch { /* ignore */ } this.end(run.id); }
  }

  /** Try providers in profile order; first one that succeeds wins. Never throws. */
  private async cascade(text: string, opts: SpeakOptions, signal: AbortSignal, runId: number): Promise<void> {
    const profile = this.profile;
    const inner: SpeakOptions = { ...opts, signal, onStart: undefined, onEnd: undefined };
    for (const id of profile.fallbackOrder) {
      if (signal.aborted) return;
      const p = this.providers.get(id);
      if (!p) continue;
      if (profile.onDeviceOnly && p.kind !== 'device') continue;
      try {
        let ok = false;
        try { ok = await raceAbort(p.available(), signal) ?? false; } catch { ok = false; }
        if (signal.aborted) return;
        if (!ok) continue;
        if (p.speak) {
          await raceAbort(p.speak(text, profile, inner), signal);
        } else if (p.synth) {
          const r = await this.synthWithCache(p, text, profile, inner, signal);
          if (signal.aborted || !r) return;
          if (!r.audio) throw new Error(`${id}: no audio`);
          await raceAbort(this.player(r.audio, r.marks, inner, signal), signal);
        } else continue;
        if (runId === this.runId) { this.lastProvider = id; this.emit({ provider: id }); }
        return;
      } catch (e) {
        if (signal.aborted) return;
        console.debug(`[aria] provider ${id} failed, falling through`, e);
      }
    }
    if (!signal.aborted) console.debug('[aria] no voice provider could speak');
  }

  private async synthWithCache(p: VoiceProvider, text: string, profile: VoiceProfile, opts: SpeakOptions, signal: AbortSignal): Promise<SpeakResult | undefined> {
    const cache = this.cache;
    const voice = String(profile.providerPrefs?.[p.id]?.voice ?? '');
    const speed = Math.round((profile.rate || 1) * (opts.speed ?? 1) * 100) / 100;
    let key = '';
    if (cache) {
      try {
        key = await cache.key(p.id, voice, speed, text);
        const hit = await cache.get(key);
        if (hit) return { audio: hit.blob, marks: hit.marks, durationMs: hit.durationMs, provider: p.id, cached: true };
      } catch { /* miss */ }
    }
    const r = await raceAbort(p.synth!(text, profile, opts), signal);
    if (r && cache && key && typeof Blob !== 'undefined' && r.audio instanceof Blob) void cache.put(key, { blob: r.audio, marks: r.marks, durationMs: r.durationMs });
    return r;
  }
}

/** The shared singleton. Providers are lazy: constructing this downloads nothing. */
export const ariaVoice = new AriaVoiceService({
  providers: [serverTtsProvider, kokoroProvider, webSpeechProvider],
  cache: createDefaultCache(),
});
