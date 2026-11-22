// Rift Realm's score + beat clock + procedural combat SFX.
//
// The music director plays Kenne's score (assets/audio/score.json): tracks are tagged by moment (menu, explore,
// combat, boss, showdown, victory, defeat) and the game sets the mood; the director crossfades to a track from that
// pool (no immediate repeats) and moves on to another when one ends. The beat clock follows the song that's playing:
// each track carries its own beat times (tracked offline from the audio), so "on beat" means on that song's beat,
// whatever its tempo. With no score (autoplay refused, file missing) a silent 124 BPM grid keeps the game playable.
export type BeatQuality = 'PERFECT' | 'GOOD' | 'OFF';

export interface BeatEval {
  quality: BeatQuality;
  beatIndex: number;
  offsetMs: number;
}

export type Mood = 'menu' | 'explore' | 'combat' | 'boss' | 'showdown' | 'victory' | 'defeat';

interface ScoreTrack { id: string; title: string; file: string; roles: string[]; bpm: number; energy: number; beats: number[]; downbeatIndex: number }

const AUDIO = '/games/rift-realm/assets/audio/';
const FALLBACK_BEAT = 60 / 124;
const FADE = 2.4;

/** One playing deck: an <audio> through its own gain, with the track it holds. */
interface Deck { el: HTMLAudioElement; gain: GainNode; track: ScoreTrack | null; cursor: number }

export class RhythmEngine {
  private ctx: AudioContext | null = null;
  private startTime = 0;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private tracks: ScoreTrack[] = [];
  private decks: Deck[] = [];
  private live = 0;                 // index of the deck the beat clock follows
  private mood: Mood = 'menu';
  private recent: string[] = [];
  private loading: Promise<void> | null = null;

  /** 0..1 phase within current beat (0 = exact beat). */
  phase = 0;
  /** 0..1 decaying pulse peaking on each beat + audio bass energy for shaders/HUD. */
  pulse = 0;
  beatIndex = 0;
  /** Seconds per beat of the playing song (for hold-to-fire repeats and HUD rings). */
  beatSec = FALLBACK_BEAT;
  /** True on the first beat of a bar. */
  downbeat = false;
  /** The playing track's title (HUD "now playing"). */
  nowPlaying = '';
  onTrackChange?: (title: string, mood: Mood) => void;

  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.master);

      this.startTime = this.ctx.currentTime + 0.05;
      for (let i = 0; i < 2; i++) {
        const el = new Audio();
        el.crossOrigin = 'anonymous';
        el.preload = 'auto';
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        this.ctx.createMediaElementSource(el).connect(gain);
        gain.connect(this.musicGain);
        el.addEventListener('ended', () => { if (this.decks[this.live]?.el === el) this.next(); });
        this.decks.push({ el, gain, track: null, cursor: 0 });
      }
      this.loading = this.loadScore();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    void this.loading?.then(() => { if (!this.decks[this.live].track) this.next(); else void this.decks[this.live].el.play().catch(() => {}); });
  }

  private async loadScore() {
    try {
      const j = await (await fetch(AUDIO + 'score.json')).json();
      this.tracks = j.tracks ?? [];
    } catch { this.tracks = []; }
  }

  /** Set the moment the music should fit. Changes track (crossfading) only when the pool changes. */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    const was = this.mood;
    this.mood = mood;
    const cur = this.decks[this.live]?.track;
    // stay on the song if it also fits the new moment (explore ↔ combat flip-flops shouldn't thrash the music)
    if (cur && cur.roles.includes(mood) && was !== 'menu') return;
    if (this.ctx) this.next();
  }

  /** Back-compat with the old two-track API (biome changes). */
  setTrack(track: 'main' | 'combat') { this.setMood(track === 'combat' ? 'combat' : 'explore'); }

  /** Skip to another song from the current mood's pool. */
  skip() { if (this.ctx) this.next(); }

  private pick(): ScoreTrack | null {
    let pool = this.tracks.filter((t) => t.roles.includes(this.mood));
    if (!pool.length) pool = this.tracks.filter((t) => t.roles.includes('explore'));
    if (!pool.length) return null;
    const fresh = pool.filter((t) => !this.recent.includes(t.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  private next() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = this.pick();
    if (!t) return;
    this.recent = [t.id, ...this.recent.filter((r) => r !== t.id)].slice(0, Math.max(1, Math.min(4, this.tracks.length - 1)));
    const out = this.decks[this.live], inc = this.decks[1 - this.live];
    const now = ctx.currentTime;
    inc.track = t; inc.cursor = 0;
    inc.el.src = AUDIO + t.file;
    inc.el.currentTime = 0;
    inc.gain.gain.cancelScheduledValues(now);
    inc.gain.gain.setValueAtTime(0, now);
    inc.gain.gain.linearRampToValueAtTime(1, now + FADE);
    out.gain.gain.cancelScheduledValues(now);
    out.gain.gain.setValueAtTime(out.gain.gain.value, now);
    out.gain.gain.linearRampToValueAtTime(0, now + FADE);
    window.setTimeout(() => { if (this.decks[this.live] !== out) out.el.pause(); }, FADE * 1000 + 100);
    this.live = 1 - this.live;
    this.nowPlaying = t.title;
    void inc.el.play().catch(() => { /* autoplay refused: the fallback grid keeps time */ });
    this.onTrackChange?.(t.title, this.mood);
  }

  /** Song time in seconds the listener hears now (or null if no song is playing). */
  private songTime(): { d: Deck; t: number } | null {
    const d = this.decks[this.live];
    if (!d?.track || d.el.paused || !this.ctx) return null;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return { d, t: d.el.currentTime - lat };
  }

  /** Index of the last beat at or before t (cursor-cached; the song only moves forward between frames). */
  private beatAt(d: Deck, t: number) {
    const b = d.track!.beats;
    let i = Math.min(d.cursor, b.length - 1);
    if (i > 0 && b[i] > t) i = 0;
    while (i + 1 < b.length && b[i + 1] <= t) i++;
    d.cursor = i;
    return i;
  }

  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const st = this.songTime();
    let phase: number, idx: number;
    if (st && st.d.track!.beats.length > 1 && st.t >= st.d.track!.beats[0]) {
      const b = st.d.track!.beats;
      idx = this.beatAt(st.d, st.t);
      const span = (b[idx + 1] ?? b[idx] + (b[idx] - b[idx - 1])) - b[idx];
      this.beatSec = span;
      phase = Math.min(0.999, (st.t - b[idx]) / span);
      this.downbeat = (idx - st.d.track!.downbeatIndex) % 4 === 0;
    } else {
      const exact = Math.max(0, this.ctx.currentTime - this.startTime) / FALLBACK_BEAT;
      idx = Math.floor(exact); phase = exact - idx; this.beatSec = FALLBACK_BEAT; this.downbeat = idx % 4 === 0;
    }
    this.beatIndex = idx;
    this.phase = phase;

    let bassEnergy = 0;
    if (this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      bassEnergy = ((this.freqData[0] + this.freqData[1] + this.freqData[2]) / (3 * 255)) * 0.6;
    }
    const clockPulse = Math.exp(-this.phase * 5.2) * (this.downbeat ? 1 : 0.85);
    this.pulse = Math.min(1.0, Math.max(clockPulse, bassEnergy));
  }

  evaluateBeat(): BeatEval {
    if (!this.ctx) return { quality: 'GOOD', beatIndex: 0, offsetMs: 0 };
    let offsetSec: number, nearest: number;
    const st = this.songTime();
    if (st && st.d.track!.beats.length > 1) {
      const b = st.d.track!.beats;
      const i = this.beatAt(st.d, st.t);
      const a = Math.abs(st.t - b[i]), c = i + 1 < b.length ? Math.abs(b[i + 1] - st.t) : Infinity;
      nearest = c < a ? i + 1 : i; offsetSec = Math.min(a, c);
    } else {
      const exact = Math.max(0, this.ctx.currentTime - this.startTime) / FALLBACK_BEAT;
      nearest = Math.round(exact); offsetSec = Math.abs(exact - nearest) * FALLBACK_BEAT;
    }
    const offsetMs = Math.round(offsetSec * 1000);
    // windows scale a little with the song's tempo (slow songs give a touch more room), clamped
    const k = Math.min(1.2, Math.max(0.85, this.beatSec / FALLBACK_BEAT));
    if (offsetSec <= 0.09 * k) return { quality: 'PERFECT', beatIndex: nearest, offsetMs };
    if (offsetSec <= 0.175 * k) return { quality: 'GOOD', beatIndex: nearest, offsetMs };
    return { quality: 'OFF', beatIndex: nearest, offsetMs };
  }

  playShot(quality: BeatQuality) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = quality === 'PERFECT' ? 'sawtooth' : 'triangle';
    const startFreq = quality === 'PERFECT' ? 880 : quality === 'GOOD' ? 620 : 340;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.11);
    gain.gain.setValueAtTime(quality === 'OFF' ? 0.14 : 0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playDash(onBeat: boolean) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(onBeat ? 260 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(onBeat ? 760 : 380, t + 0.14);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  playHit(killed: boolean) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(killed ? 520 : 300, t);
    osc.frequency.exponentialRampToValueAtTime(killed ? 1040 : 140, t + (killed ? 0.18 : 0.08));
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (killed ? 0.2 : 0.09));
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  playSurge() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.34);
    gain.gain.setValueAtTime(0.36, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.37);
  }
}
