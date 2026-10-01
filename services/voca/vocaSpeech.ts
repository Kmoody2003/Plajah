/**
 * Voca speech — the listening layer. Reliability first.
 *
 * WebSpeechRecognizer (Chrome / Edge / Safari): streaming recognition with
 *  • a fresh recognizer instance per segment, auto-restart on `end` (browsers stop silently after ~60 s or a
 *    pause), exponential backoff on error storms, and a WATCHDOG that restarts the engine when the mic meter
 *    hears a voice but no words have arrived for a while (Chrome's known "deaf but alive" state);
 *  • interim words emitted only once STABLE (unchanged across two consecutive interim updates), so the
 *    highlight never runs ahead on a guess the recogniser later revises; the final result flushes the rest;
 *  • up to three alternative guesses per word, handed to the aligner (a child's word may be guess #2);
 *  • suspend()/resume() so the coach's own voice is never heard as the child (echo-proof by construction).
 *
 * MicMeter: a separate low-latency level meter (echo cancellation ON, auto-gain OFF) for the mic check,
 * the live level bar, "I can't hear you" detection and the watchdog.
 *
 * Privacy: Chrome's Web Speech sends audio to the browser vendor's speech service. Child accounts require
 * guardian consent (`parentalControls.speechRecognition`) before this recogniser is used; otherwise Voca
 * runs in Listener mode (an adult taps ✓/✗), which processes no audio at all.
 */

export type RecState = 'idle' | 'starting' | 'listening' | 'suspended' | 'error';
export type RecErrorCode = 'not-allowed' | 'no-mic' | 'network' | 'unsupported' | 'other';
export interface RecError { code: RecErrorCode; message: string }
export interface HeardWord { text: string; alts: string[] }

export interface Recognizer {
  readonly kind: 'web-speech';
  start(): void; stop(): void; suspend(): void; resume(): void;
  noteVoiceActivity(): void;
  onWords?: (words: HeardWord[]) => void;
  onState?: (s: RecState, err?: RecError) => void;
  readonly state: RecState;
}

/** Looked up lazily (not at import) so polyfills/test doubles installed later are honoured. */
const getSR = (): any => typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null) : null;
export const speechSupported = () => !!getSR();
export const isEmbeddedWebView = () => typeof navigator !== 'undefined' && /; wv\)|Capacitor|Plajah-Android/i.test(navigator.userAgent);

const split = (t: string) => t.trim().split(/\s+/).filter(Boolean);

export class WebSpeechRecognizer implements Recognizer {
  readonly kind = 'web-speech' as const;
  onWords?: (words: HeardWord[]) => void;
  onState?: (s: RecState, err?: RecError) => void;
  state: RecState = 'idle';
  private rec: any = null;
  private active = false;
  private suspended = false;
  private seq = 0;
  private emitted = new Map<string, number>();
  private lastInterim = new Map<string, string[]>();
  private restarts: number[] = [];
  private netFails = 0;
  private lastResultAt = 0;
  private listeningSince = 0;
  private lastVoiceAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private lang = 'en-US') {}

  private set(s: RecState, err?: RecError) { this.state = s; this.onState?.(s, err); }

  start() {
    if (!getSR()) { this.set('error', { code: 'unsupported', message: 'This browser cannot listen. Try Chrome, Edge or Safari, or use Listener mode.' }); return; }
    this.active = true; this.suspended = false; this.netFails = 0;
    this.spawn();
    if (!this.watchdog) this.watchdog = setInterval(() => this.checkWatchdog(), 1000);
  }

  stop() {
    this.active = false; this.suspended = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.kill();
    this.set('idle');
  }

  suspend() { if (!this.active) return; this.suspended = true; this.kill(); this.set('suspended'); }
  resume() { if (!this.active || !this.suspended) return; this.suspended = false; this.spawn(); }
  noteVoiceActivity() { this.lastVoiceAt = Date.now(); }

  private kill() {
    const r = this.rec; this.rec = null;
    if (r) { r.onend = r.onresult = r.onerror = r.onstart = null; try { r.abort(); } catch { /* already stopped */ } }
  }

  private spawn() {
    if (!this.active || this.suspended) return;
    this.kill();
    const SR = getSR(); if (!SR) return;
    const r = new SR();
    r.lang = this.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
    const seq = ++this.seq;
    this.emitted.clear(); this.lastInterim.clear();
    r.onstart = () => { this.listeningSince = Date.now(); this.lastResultAt = Date.now(); this.set('listening'); };
    r.onresult = (e: any) => this.handleResult(e, seq);
    r.onerror = (e: any) => this.handleError(e?.error);
    r.onend = () => { if (this.rec === r) this.rec = null; this.scheduleRestart(); };
    this.rec = r;
    this.set('starting');
    try { r.start(); } catch { this.scheduleRestart(); }
  }

  private scheduleRestart() {
    if (!this.active || this.suspended) return;
    const now = Date.now();
    this.restarts = this.restarts.filter(t => now - t < 6000); this.restarts.push(now);
    // a storm of restarts means something is wrong (mic grabbed elsewhere, service down): back off
    const delay = this.restarts.length > 6 ? 1500 : 120;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.spawn(), delay);
  }

  private handleError(code: string) {
    switch (code) {
      case 'no-speech': case 'aborted': return;              // normal: `end` follows and we restart
      case 'audio-capture': this.active = false; this.set('error', { code: 'no-mic', message: 'No microphone was found. Plug one in or check that another app is not using it.' }); return;
      case 'not-allowed': case 'service-not-allowed': this.active = false; this.set('error', { code: 'not-allowed', message: 'Microphone permission is blocked. Allow the microphone for this site, then try again.' }); return;
      case 'network':
        if (++this.netFails >= 3) { this.active = false; this.set('error', { code: 'network', message: 'Listening needs an internet connection right now. Check the connection or switch to Listener mode.' }); }
        return;
      default: return;                                       // transient: let `end` restart us
    }
  }

  private handleResult(e: any, seq: number) {
    if (seq !== this.seq) return;
    this.lastResultAt = Date.now(); this.netFails = 0;
    const out: HeardWord[] = [];
    for (let r = e.resultIndex; r < e.results.length; r++) {
      const res = e.results[r]; const key = `${seq}:${r}`;
      const words = split(res[0]?.transcript ?? '');
      const done = this.emitted.get(key) ?? 0;
      if (res.isFinal) {
        const altWords: string[][] = [];
        for (let a = 1; a < res.length; a++) altWords.push(split(res[a]?.transcript ?? ''));
        for (let k = done; k < words.length; k++) out.push({ text: words[k], alts: altWords.map(aw => aw[k]).filter(Boolean) });
        this.emitted.set(key, words.length); this.lastInterim.delete(key);
      } else {
        // stable prefix = words unchanged since the previous interim update, never the last (still forming) word
        const prev = this.lastInterim.get(key) ?? [];
        let stable = 0; while (stable < words.length - 1 && stable < prev.length && prev[stable].toLowerCase() === words[stable].toLowerCase()) stable++;
        for (let k = done; k < stable; k++) out.push({ text: words[k], alts: [] });
        if (stable > done) this.emitted.set(key, stable);
        this.lastInterim.set(key, words);
      }
    }
    if (out.length) this.onWords?.(out);
  }

  private checkWatchdog() {
    if (!this.active || this.suspended || this.state !== 'listening') return;
    const now = Date.now();
    // voice heard recently, nothing recognised for 7 s, and we have been listening for a while → restart
    if (now - this.lastVoiceAt < 1500 && now - this.lastResultAt > 7000 && now - this.listeningSince > 7000) {
      this.lastResultAt = now; this.kill(); this.scheduleRestart();
    }
  }
}

// ------------------------------------------------------------------ mic level meter
export class MicMeter {
  level = 0; floor = 0.01; speaking = false;
  onLevel?: (level: number, speaking: boolean) => void;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<RecError | null> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') return { code: 'not-allowed', message: 'Microphone permission is blocked. Allow the microphone for this site, then try again.' };
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return { code: 'no-mic', message: 'No microphone was found. Plug one in and try again.' };
      return { code: 'other', message: 'The microphone could not start. Close other apps using it and try again.' };
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx!.state === 'suspended') { try { await this.ctx!.resume(); } catch { /* resumes on next gesture */ } }
    const src = this.ctx!.createMediaStreamSource(this.stream!);
    const an = this.ctx!.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    // setInterval (not rAF) so metering keeps working when the tab repaints slowly
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      this.level = this.level * 0.6 + rms * 0.4;
      // adaptive noise floor: falls quickly, rises slowly
      this.floor = rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.998 + rms * 0.002;
      this.speaking = this.level > Math.max(0.012, this.floor * 2.8);
      this.onLevel?.(this.level, this.speaking);
    }, 50);
    return null;
  }

  stop() {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    try { this.ctx?.close(); } catch { /* closed */ } this.ctx = null;
  }
}
