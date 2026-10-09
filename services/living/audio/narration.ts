// Read-aloud for Living Books.
//
//   speak(text, { voice, rate, onWord }) -> { cancel(), done }
//
// Voice choice, in order:
//   1. Aria's studio voice (ElevenLabs behind POST /api/aria/speak) if the server has it configured AND this signed-in account may use it.
//      Feature-detected cheaply in the background (never blocks): until the probe says yes, we do not even try.
//   2. The browser's Web Speech API (warm voice, slow child-friendly rate ~0.85), long text split into sentences (Chrome cuts long utterances).
//   3. No voice at all: a silent read-along that still advances the highlight at an estimated pace, so reading along works everywhere.
//
// Word indices: `onWord(i)` indexes `splitWords(text)` (split on whitespace). Boundary events drive it when the platform gives them;
// otherwise it is estimated from syllable counts (estimateWordTimings), stretched to the real audio length when we know it.
//
// Also here: a record-your-own-voice helper for authors (MediaRecorder), off unless the author opens it.

// ───────────── word splitting & timing ─────────────
export const splitWords = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Character offset of each word's first letter (same indexing as splitWords). */
export function wordStarts(text: string): number[] {
  const out: number[] = []; const re = /\S+/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m.index);
  return out;
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z0-9']/g, '');
  if (!w) return 0;
  if (/^\d+$/.test(w)) return Math.max(1, Math.ceil(w.length / 1.5));
  let s = w.replace(/'/g, '').replace(/eau/g, 'o');
  if (s.length <= 3) return 1;
  s = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = s.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface WordTiming { i: number; startMs: number; endMs: number }

/** Pause after a word, from its trailing punctuation. */
export function pauseAfterMs(word: string): number {
  if (/[.!?…]["')\]]*$/.test(word)) return 380;
  if (/[;:—–]["')\]]*$/.test(word) || /--$/.test(word)) return 220;
  if (/,["')\]]*$/.test(word)) return 160;
  return 0;
}

/**
 * Estimated per-word timings. `rate` 1 = a typical read-aloud pace (~215 ms per syllable). If `totalMs` is given (real audio length),
 * everything is scaled so the last word ends exactly there.
 */
export function estimateWordTimings(text: string, o: { rate?: number; totalMs?: number; msPerSyllable?: number } = {}): WordTiming[] {
  const words = splitWords(text);
  const rate = Math.max(0.3, o.rate ?? 1);
  const per = (o.msPerSyllable ?? 215) / rate;
  const raw: Array<{ dur: number; pause: number }> = words.map((w) => ({ dur: Math.max(110, countSyllables(w) * per), pause: pauseAfterMs(w) / rate }));
  let t = 0; const out: WordTiming[] = [];
  raw.forEach((r, i) => { out.push({ i, startMs: t, endMs: t + r.dur }); t += r.dur + (i < raw.length - 1 ? r.pause : 0); });
  const end = out.length ? out[out.length - 1].endMs : 0;
  if (o.totalMs && end > 0) { const k = o.totalMs / end; for (const w of out) { w.startMs *= k; w.endMs *= k; } }
  return out;
}

/** Which word is being spoken at `ms` (the last word whose start <= ms), or -1 before the first. */
export function wordIndexAt(timings: WordTiming[], ms: number): number {
  let lo = 0, hi = timings.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (timings[mid].startMs <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Word index for a Web Speech boundary charIndex. */
export function wordIndexForChar(starts: number[], charIndex: number): number {
  let lo = 0, hi = starts.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= charIndex) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Split into sentence-ish chunks no longer than maxChars, keeping each chunk's word offset. Never splits inside a word. */
export function chunkText(text: string, maxChars = 200): Array<{ text: string; firstWord: number; charOffset: number }> {
  const starts = wordStarts(text);
  const chunks: Array<{ text: string; firstWord: number; charOffset: number }> = [];
  let from = 0;
  const n = text.length;
  while (from < n) {
    let end = Math.min(n, from + maxChars);
    if (end < n) {
      const slice = text.slice(from, end);
      const m = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('\n'));
      const c = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '));
      if (m > 20) end = from + m + 1; else if (c > 40) end = from + c + 1; else { const sp = slice.lastIndexOf(' '); if (sp > 10) end = from + sp; }
    }
    const piece = text.slice(from, end);
    if (piece.trim()) {
      const lead = piece.length - piece.trimStart().length;
      const abs = from + lead;
      let fw = 0; for (let i = 0; i < starts.length; i++) { if (starts[i] >= abs) { fw = i; break; } fw = starts.length; }
      chunks.push({ text: piece.trim(), firstWord: fw, charOffset: abs });
    }
    from = end;
  }
  return chunks;
}

// ───────────── Web Speech voice choice ─────────────
export interface VoiceLike { name: string; lang: string; localService?: boolean; default?: boolean; voiceURI?: string }

const WARM = /(samantha|ava|allison|susan|serena|karen|moira|tessa|fiona|libby|sonia|jenny|aria|natasha|emma|salli|joanna|ivy|google uk english female|google us english|female)/i;
const NATURAL = /(natural|neural|premium|enhanced|online)/i;
const ROBOTIC = /(espeak|compact|novelty|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|pipe organ|trinoids|whisper|zarvox|albert|fred|junior|kathy|ralph)/i;

export function pickVoice<T extends VoiceLike>(voices: T[], pref: string | undefined, lang = 'en'): T | null {
  const list = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(lang));
  const pool = list.length ? list : voices;
  if (!pool.length) return null;
  const want = (pref || 'warm').toLowerCase();
  const score = (v: T) => {
    let s = 0;
    if (ROBOTIC.test(v.name)) s -= 100;
    if (NATURAL.test(v.name)) s += 30;
    if (WARM.test(v.name)) s += 20;
    if (/en[-_]us/i.test(v.lang)) s += 4; else if (/en[-_](gb|au|ie|za)/i.test(v.lang)) s += 3;
    if (v.localService) s += 2;
    if (want === 'bright' && /(zira|samantha|ava|jenny|aria|google us)/i.test(v.name)) s += 6;
    if (want === 'soft' && /(moira|tessa|karen|fiona|libby|serena|susan)/i.test(v.name)) s += 6;
    if (want !== 'warm' && want !== 'bright' && want !== 'soft' && want !== 'aria' && v.name.toLowerCase().includes(want)) s += 60;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
}

// ───────────── Aria proxy client ─────────────
export interface AriaClient {
  /** Cheap, cached, never throws, never blocks speak(). */
  probe(): Promise<boolean>;
  /** Cached synchronous answer: true only after a probe said yes. */
  isAvailable(): boolean;
  fetchAudio(text: string, signal?: AbortSignal): Promise<ArrayBuffer | null>;
}

export function createAriaClient(deps: { getToken: () => Promise<string | null>; fetchImpl?: typeof fetch; base?: string }): AriaClient {
  const f = (...a: Parameters<typeof fetch>) => (deps.fetchImpl ?? fetch)(...a);
  const base = deps.base ?? '/api/aria/speak';
  let ok = false; let checkedAt = 0; let inflight: Promise<boolean> | null = null;
  const cache = new Map<string, ArrayBuffer>();
  const probe = (): Promise<boolean> => {
    const age = Date.now() - checkedAt;
    if (ok && age < 10 * 60_000) return Promise.resolve(true);
    if (!ok && checkedAt && age < 60_000) return Promise.resolve(false);
    if (inflight) return inflight;
    inflight = (async () => {
      let result = false;
      try {
        const token = await deps.getToken();
        if (token) {
          const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const to = setTimeout(() => ctl?.abort(), 3000);
          try {
            const res = await f(`${base}/status`, { headers: { Authorization: `Bearer ${token}` }, signal: ctl?.signal });
            if (res.ok) { const j = await res.json(); result = !!(j && j.available && j.eligible); }
          } finally { clearTimeout(to); }
        }
      } catch { result = false; }
      ok = result; checkedAt = Date.now(); inflight = null;
      return result;
    })();
    return inflight;
  };
  return {
    probe,
    isAvailable: () => ok,
    async fetchAudio(text, signal) {
      const hit = cache.get(text); if (hit) return hit;
      try {
        const token = await deps.getToken(); if (!token) return null;
        const res = await f(base, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
        if (!res.ok) { if (res.status === 403 || res.status === 503) { ok = false; checkedAt = Date.now(); } return null; }
        const buf = await res.arrayBuffer();
        cache.set(text, buf); if (cache.size > 24) cache.delete(cache.keys().next().value as string);
        return buf;
      } catch { return null; }
    },
  };
}

// ───────────── narrator ─────────────
export interface SpeakOptions { voice?: string; rate?: number; onWord?: (wordIndex: number) => void }
export interface SpeakHandle { cancel(): void; done: Promise<void> }
export type NarrationMode = 'aria' | 'speech' | 'silent';

export interface NarratorDeps {
  /** AudioContext, only needed for the Aria path (decoded and played through the voice bus). */
  getCtx(): BaseAudioContext | null;
  voiceBus(): AudioNode | null;
  aria?: AriaClient | null;
  speech?: { speak(u: any): void; cancel(): void; pause(): void; resume(): void; getVoices(): any[]; speaking?: boolean } | null;
  makeUtterance?: (text: string) => any;
  /** engine hook: duck music while speech is audible */
  onSpeaking?(on: boolean): void;
  isMuted?(): boolean;
  /** injected for tests */
  timers?: { setInterval(fn: () => void, ms: number): unknown; clearInterval(h: unknown): void; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
  now?: () => number;
}

export const DEFAULT_CHILD_RATE = 0.85;
const realTimers = {
  setInterval: (fn: () => void, ms: number) => setInterval(fn, ms), clearInterval: (h: unknown) => clearInterval(h as any),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as any),
};

export class Narrator {
  private ticket = 0;
  private cancelCurrent: (() => void) | null = null;
  private pauseFn: (() => void) | null = null;
  private resumeFn: (() => void) | null = null;
  lastMode: NarrationMode | null = null;
  private deps: NarratorDeps;
  private timers: NonNullable<NarratorDeps['timers']>;
  private now: () => number;
  constructor(deps: NarratorDeps) {
    this.deps = deps; this.timers = deps.timers ?? realTimers;
    this.now = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** Background feature-detect of the Aria voice. Safe to call any time; never throws, never blocks. */
  warmUp(): void { void this.deps.aria?.probe().catch(() => {}); }

  get speaking(): boolean { return this.cancelCurrent != null; }
  pause(): void { this.pauseFn?.(); }
  resume(): void { this.resumeFn?.(); }
  cancel(): void { this.ticket++; const c = this.cancelCurrent; this.cancelCurrent = null; this.pauseFn = null; this.resumeFn = null; c?.(); }

  speak(text: string, opts: SpeakOptions = {}): SpeakHandle {
    this.cancel();
    const my = ++this.ticket;
    const words = splitWords(text);
    let resolve!: () => void; const done = new Promise<void>((r) => { resolve = r; });
    let finished = false; let lastWord = -1;
    const cleanups: Array<() => void> = [];
    const emit = (i: number) => { if (i > lastWord && i < words.length) { lastWord = i; try { opts.onWord?.(i); } catch { /* caller bug must not stop narration */ } } };
    const finish = () => {
      if (finished) return; finished = true;
      for (const c of cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
      if (this.ticket === my) { this.cancelCurrent = null; this.pauseFn = null; this.resumeFn = null; }
      this.deps.onSpeaking?.(false);
      resolve();
    };
    const cancel = () => { finish(); };
    if (!words.length) { finish(); return { cancel, done }; }
    this.cancelCurrent = cancel;
    this.deps.onSpeaking?.(true);

    const startEstimated = (rate: number, totalMs?: number, alsoSpeechCancel?: boolean) => {
      // Silent / fallback read-along driven by elapsed time.
      const tm = estimateWordTimings(text, { rate, totalMs });
      const t0 = this.now(); let paused = false; let pausedAt = 0; let skew = 0;
      const h = this.timers.setInterval(() => {
        if (paused) return;
        const el = this.now() - t0 - skew;
        emit(wordIndexAt(tm, el));
        if (el >= (tm[tm.length - 1]?.endMs ?? 0) + 120) finish();
      }, 40);
      cleanups.push(() => this.timers.clearInterval(h));
      this.pauseFn = () => { if (!paused) { paused = true; pausedAt = this.now(); } };
      this.resumeFn = () => { if (paused) { paused = false; skew += this.now() - pausedAt; } };
      void alsoSpeechCancel;
    };

    const runSpeech = (): boolean => {
      const synth = this.deps.speech;
      if (!synth) return false;
      const mkU = this.deps.makeUtterance ?? ((t: string) => new (globalThis as any).SpeechSynthesisUtterance(t));
      let voice: any = null;
      try { voice = pickVoice(synth.getVoices() as VoiceLike[], opts.voice); } catch { voice = null; }
      const rate = opts.rate ?? DEFAULT_CHILD_RATE;
      const chunks = chunkText(text);
      const starts = wordStarts(text);
      let ci = 0; let boundarySeen = false; let estStarted = false; let startedAt = 0;
      this.lastMode = 'speech';
      const nextChunk = () => {
        if (my !== this.ticket || finished) return;
        if (ci >= chunks.length) { finish(); return; }
        const ch = chunks[ci++];
        const u = mkU(ch.text);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
        u.rate = Math.max(0.5, Math.min(1.4, rate)); u.pitch = 1.05; u.volume = this.deps.isMuted?.() ? 0 : 1;
        u.onstart = () => {
          if (!startedAt) startedAt = this.now();
          // Some platforms (Android Chrome) never send boundary events: fall back to an estimated pace if none arrive soon.
          if (!estStarted) {
            const h = this.timers.setTimeout(() => {
              if (boundarySeen || finished || estStarted) return;
              estStarted = true;
              const tm = estimateWordTimings(text, { rate });
              const base = this.now() - (tm[Math.min(ch.firstWord, tm.length - 1)]?.startMs ?? 0);
              const hi = this.timers.setInterval(() => { if (boundarySeen) return; emit(wordIndexAt(tm, this.now() - base)); }, 40);
              cleanups.push(() => this.timers.clearInterval(hi));
            }, 900);
            cleanups.push(() => this.timers.clearTimeout(h));
          }
        };
        u.onboundary = (e: any) => {
          if (e && e.name && e.name !== 'word') return;
          boundarySeen = true;
          const rel = wordIndexForChar(wordStarts(ch.text), e.charIndex ?? 0);
          emit(ch.firstWord + rel);
        };
        u.onend = () => nextChunk();
        u.onerror = (e: any) => { if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; if (!startedAt) { cleanups.splice(0).forEach((c) => c()); startEstimated(rate); return; } nextChunk(); };
        try { synth.speak(u); } catch { /* handled by onerror path */ }
      };
      void starts;
      cleanups.push(() => { try { synth.cancel(); } catch { /* ignore */ } });
      this.pauseFn = () => { try { synth.pause(); } catch { /* ignore */ } };
      this.resumeFn = () => { try { synth.resume(); } catch { /* ignore */ } };
      try { synth.cancel(); } catch { /* clear any stale queue */ }
      nextChunk();
      return true;
    };

    const runSilent = () => { this.lastMode = 'silent'; startEstimated(opts.rate ?? DEFAULT_CHILD_RATE); };

    const runAria = async (): Promise<boolean> => {
      const aria = this.deps.aria; const ctx = this.deps.getCtx() as AudioContext | null; const bus = this.deps.voiceBus();
      if (!aria || !aria.isAvailable() || !ctx || !bus) return false;
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = this.timers.setTimeout(() => ctl?.abort(), 9000);
      cleanups.push(() => { this.timers.clearTimeout(to); ctl?.abort(); });
      const ab = await aria.fetchAudio(text, ctl?.signal);
      this.timers.clearTimeout(to);
      if (!ab || my !== this.ticket || finished) return !!(my !== this.ticket || finished);       // cancelled meanwhile counts as handled
      let buf: AudioBuffer;
      try { buf = await ctx.decodeAudioData(ab.slice(0)); } catch { return false; }
      if (my !== this.ticket || finished) return true;
      const playbackRate = Math.max(0.85, Math.min(1.15, opts.rate != null ? opts.rate / 0.95 : 1));
      const totalMs = (buf.duration / playbackRate) * 1000;
      const tm = estimateWordTimings(text, { totalMs });
      this.lastMode = 'aria';
      let src: AudioBufferSourceNode | null = null; let offset = 0; let startedCtxTime = 0; let ended = false;
      const play = () => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = playbackRate; s.connect(bus);
        s.onended = () => { if (src === s && !ended && !pausedFlag) { ended = true; finish(); } };
        src = s; startedCtxTime = ctx.currentTime; s.start(0, offset);
      };
      let pausedFlag = false;
      play();
      const h = this.timers.setInterval(() => {
        if (pausedFlag) return;
        const elapsedMs = (offset / playbackRate + (ctx.currentTime - startedCtxTime)) * 1000;
        emit(wordIndexAt(tm, elapsedMs));
      }, 40);
      cleanups.push(() => this.timers.clearInterval(h));
      cleanups.push(() => { const s = src; src = null; try { s?.stop(); } catch { /* ended */ } });
      this.pauseFn = () => { if (pausedFlag || !src) return; pausedFlag = true; offset += (ctx.currentTime - startedCtxTime) * playbackRate; const s = src; src = null; try { s?.stop(); } catch { /* ended */ } };
      this.resumeFn = () => { if (!pausedFlag) return; pausedFlag = false; play(); };
      return true;
    };

    // Decide without blocking: Aria only if a previous probe already said yes; otherwise start speaking right now.
    if (this.deps.aria?.isAvailable() && opts.voice !== 'browser') {
      void runAria().then((handled) => { if (handled || my !== this.ticket || finished) return; if (!runSpeech()) runSilent(); }).catch(() => { if (my === this.ticket && !finished) { if (!runSpeech()) runSilent(); } });
    } else {
      this.deps.aria?.probe().catch(() => {});                       // learn for next time
      if (!runSpeech()) runSilent();
    }
    return { cancel, done };
  }
}

// ───────────── record your own voice (author helper) ─────────────
export interface RecordedTake { blob: Blob; url: string; mime: string; durationMs: number; createdAt: number }

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private urls: string[] = [];
  state: 'idle' | 'recording' = 'idle';

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }
  static pickMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* next */ } }
    return '';
  }

  /** Asks the browser for the microphone (the permission prompt appears here, only when the author clicks record). */
  async start(): Promise<void> {
    if (this.state === 'recording') return;
    if (!VoiceRecorder.isSupported()) throw new Error('This browser cannot record audio.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = VoiceRecorder.pickMime();
    this.rec = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = Date.now();
    this.state = 'recording';
  }

  /** Stops, releases the microphone (indicator off) and returns the take. */
  stop(): Promise<RecordedTake> {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec || this.state !== 'recording') { reject(new Error('Not recording')); return; }
      rec.onstop = () => {
        const mime = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        const url = URL.createObjectURL(blob); this.urls.push(url);
        const take: RecordedTake = { blob, url, mime, durationMs: Date.now() - this.startedAt, createdAt: Date.now() };
        this.release(); resolve(take);
      };
      try { rec.stop(); } catch (e) { this.release(); reject(e as Error); }
    });
  }

  cancel(): void { try { if (this.rec && this.state === 'recording') { this.rec.onstop = null; this.rec.stop(); } } catch { /* ignore */ } this.release(); }
  private release() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.rec = null; this.state = 'idle'; }
  dispose(): void { this.cancel(); for (const u of this.urls.splice(0)) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } } }
}

/** Download-ready file for a take (the author attaches it to a page; the Tela bundle stores the blob). */
export function exportTake(take: RecordedTake, name = 'narration'): { filename: string; blob: Blob } {
  const ext = take.mime.includes('mp4') ? 'm4a' : take.mime.includes('ogg') ? 'ogg' : 'webm';
  return { filename: `${name.replace(/[^\w.-]+/g, '-')}.${ext}`, blob: take.blob };
}

/** Word timings for a recorded take: from author taps (one per word) if given, else estimated across the real duration. */
export function timingsForTake(text: string, take: { durationMs: number }, tapsMs?: number[]): WordTiming[] {
  const n = splitWords(text).length;
  if (tapsMs && tapsMs.length >= n && n > 0) {
    const sorted = [...tapsMs].slice(0, n).sort((a, b) => a - b);
    return sorted.map((s, i) => ({ i, startMs: s, endMs: i < n - 1 ? sorted[i + 1] : take.durationMs }));
  }
  return estimateWordTimings(text, { totalMs: take.durationMs });
}

/** Collects taps while a take plays/records: tap() once at the start of each word. */
export class TapTimer {
  private t0 = 0; readonly taps: number[] = [];
  constructor(private wordCount: number, private now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {}
  start() { this.t0 = this.now(); this.taps.length = 0; }
  tap(): number { if (this.taps.length < this.wordCount) this.taps.push(Math.max(0, this.now() - this.t0)); return this.taps.length - 1; }
  get complete() { return this.taps.length >= this.wordCount; }
}

/** Play a recorded take with highlighting. Uses an <audio> element (works after the author's click). */
export function playTake(take: RecordedTake, text: string, onWord?: (i: number) => void, tapsMs?: number[]): SpeakHandle {
  const audio = new Audio(take.url);
  let resolve!: () => void; const done = new Promise<void>((r) => { resolve = r; });
  const tm = timingsForTake(text, take, tapsMs); let last = -1;
  const tick = () => { const i = wordIndexAt(tm, audio.currentTime * 1000); if (i > last) { last = i; onWord?.(i); } };
  audio.ontimeupdate = tick;
  const fin = () => { audio.ontimeupdate = null; resolve(); };
  audio.onended = fin; audio.onerror = fin;
  void audio.play().catch(fin);
  return { cancel: () => { audio.pause(); fin(); }, done };
}
