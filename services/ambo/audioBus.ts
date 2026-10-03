// audioBus — Ambo's independent audio playlist.
//
// It lives OUTSIDE the seven-layer LiveStack on purpose. A TAKE, a CLEAR, a
// blackout or a video going live never touches it, so walk-in music, a
// communion bed or a lobby playlist keeps running underneath — or alongside —
// whatever is on the screens. The only thing allowed to change it is the
// operator, and the video-priority policy in audioPriority.ts (keep playing /
// duck / pause-and-resume while a video with sound is on Program).
//
// Plays Chora tracks (public, locker, playlists from the Chora service) and
// local files. Local files are object URLs and die with the page, so they're
// keyed by name+size: picking the same files again re-links every playlist
// that referenced them.

import {
  getAudioPriority, playlistFactor, subscribeAudioPriority,
} from './audioPriority';
import { CUE_COLORS, getCue } from './audioCues';
import { registerLyricClock } from './lyricFeed';
import { amboAudio, needsCors, proxied } from './amboAudioEngine';

/** How a song reaches the speakers: through the Ambo mixer with CORS, through
 *  the same-origin proxy, or — last resort — directly (plays, but unmixed). */
type RouteMode = 'cors' | 'proxy' | 'direct';

export interface BusTrack {
  id: string;
  title: string;
  artist?: string;
  url?: string;
  coverImage?: string;
  duration?: number | string;
  /** 'local' tracks resolve their url through the local-file registry. */
  source?: 'chora' | 'local' | 'audius';
  key?: string;
  bpm?: number;
  category?: string;
  /** Playlist the song came from — its cue note lives there (audioCues.ts). */
  cueScope?: string;
  /** Chora synced lyrics, for the lyrics layer (lyricFeed.ts). */
  timeCodedLyrics?: Array<{ time: number; text: string }>;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface BusState {
  queue: BusTrack[];
  index: number;            // -1 = nothing loaded
  playing: boolean;
  /** Paused by the video policy, not by the operator — resumes by itself. */
  heldByVideo: boolean;
  currentTime: number;
  duration: number;
  volume: number;           // operator fader, 0..1
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  crossfadeSec: number;
  error: string | null;
  /** The current song couldn't be routed through the mixer (no CORS, proxy
   *  failed) and is playing directly: audible, but no meters/FX/visualizers. */
  unmetered: boolean;
  /** The expanded DJ deck is playing this song (compact bar = remote control). */
  deck: boolean;
  /** Increments every time a song is (re)loaded — an expanded deck re-attaches on change. */
  loadSeq: number;
}

/** What the DJ deck exposes while it holds the playlist's song. */
export interface DeckTransport {
  toggle(): void;
  seek(sec: number): void;
  time(): number;
  duration(): number;
  playing(): boolean;
}

const KEY = 'ambo_audio_bus_v1';

// ── Local-file registry ──────────────────────────────────────────────────────

const localUrls = new Map<string, string>();

export function localTrackId(f: { name: string; size: number }): string {
  return `local_${f.name}_${f.size}`;
}

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?|wma)$/i.test(f.name);
}

/** Register picked/dropped files; returns tracks ready to queue or save. */
export function registerLocalFiles(files: FileList | File[]): BusTrack[] {
  const out: BusTrack[] = [];
  for (const f of Array.from(files)) {
    if (!isAudioFile(f)) continue;
    const id = localTrackId(f);
    if (!localUrls.has(id)) localUrls.set(id, URL.createObjectURL(f));
    const base = f.name.replace(/\.[^.]+$/, '');
    // "Artist - Title.mp3" is the common convention; fall back to the filename.
    const m = base.match(/^(.+?)\s+-\s+(.+)$/);
    out.push({
      id,
      title: m ? m[2] : base,
      artist: m ? m[1] : 'Local file',
      source: 'local',
      category: 'Local Files',
    });
  }
  bus.notify(); // tracks that were "missing" may be playable now
  return out;
}

export function isTrackPlayable(t: BusTrack): boolean {
  return t.source === 'local' ? localUrls.has(t.id) : !!t.url;
}

function resolveUrl(t: BusTrack): string | null {
  if (t.source === 'local') return localUrls.get(t.id) ?? null;
  return t.url || null;
}

// ── Engine ───────────────────────────────────────────────────────────────────

class AudioBus {
  private a: HTMLAudioElement | null = null;
  private b: HTMLAudioElement | null = null;   // crossfade partner
  private listeners = new Set<() => void>();
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private order: number[] = [];                // play order (shuffle-aware)
  /** Songs in a row that failed or ended instantly — stops a dead queue spinning. */
  private failures = 0;
  private snapshot: BusState;

  state: BusState = {
    queue: [], index: -1, playing: false, heldByVideo: false,
    currentTime: 0, duration: 0, volume: 0.8, muted: false,
    shuffle: false, repeat: 'all', crossfadeSec: 0, error: null, unmetered: false, deck: false, loadSeq: 0,
  };

  constructor() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (raw) {
        const s = JSON.parse(raw);
        this.state = {
          ...this.state,
          queue: Array.isArray(s.queue) ? s.queue : [],
          index: typeof s.index === 'number' ? s.index : -1,
          volume: s.volume ?? 0.8,
          shuffle: !!s.shuffle,
          repeat: s.repeat ?? 'all',
          crossfadeSec: s.crossfadeSec ?? 0,
        };
      }
    } catch { /* */ }
    this.rebuildOrder();
    this.snapshot = { ...this.state };
    subscribeAudioPriority(() => this.applyPriority());
  }

  // ── subscription (useSyncExternalStore-friendly) ──
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  notify() {
    this.snapshot = { ...this.state };
    for (const fn of this.listeners) { try { fn(); } catch { /* */ } }
  }
  private set(patch: Partial<BusState>, persist = false) {
    this.state = { ...this.state, ...patch };
    if (persist) this.persist();
    this.notify();
  }
  private persist() {
    try {
      const { queue, index, volume, shuffle, repeat, crossfadeSec } = this.state;
      localStorage.setItem(KEY, JSON.stringify({ queue, index, volume, shuffle, repeat, crossfadeSec }));
    } catch { /* */ }
  }

  // ── element plumbing ──
  private routed = new WeakSet<HTMLAudioElement>();
  private mode: RouteMode = 'cors';

  private el(): HTMLAudioElement {
    if (!this.a) this.a = this.makeEl();
    return this.a;
  }
  /** `routed`: wire into the Ambo mixer (playlist channel). Once per element. */
  private makeEl(routed = true): HTMLAudioElement {
    const e = new Audio();
    e.preload = 'auto';
    if (routed && amboAudio.attachElement(e, 'playlist')) this.routed.add(e);
    e.addEventListener('timeupdate', () => {
      if (e !== this.a) return;
      this.state.currentTime = e.currentTime;
      if (e.currentTime > 2) this.failures = 0;
      this.state.duration = isFinite(e.duration) ? e.duration : 0;
      // Start the crossfade early so the next song is up as this one ends.
      const xf = this.state.crossfadeSec;
      if (xf > 0 && this.state.duration > xf * 2 && this.state.duration - e.currentTime <= xf && !this.b && this.state.repeat !== 'one') {
        this.advance(1, true);
        return;
      }
      this.notify();
    });
    e.addEventListener('ended', () => {
      if (e !== this.a) return;
      if (e.currentTime < 1 && this.giveUp('ended instantly')) return;
      if (this.state.repeat === 'one') { e.currentTime = 0; void e.play().catch(() => {}); return; }
      this.advance(1);
    });
    e.addEventListener('error', () => {
      if (e !== this.a) return;
      const t = this.state.queue[this.state.index];
      const url = t ? resolveUrl(t) : null;
      // A cross-origin host without CORS fails here; try the proxy, then play
      // it directly (unmixed) rather than lose the song.
      if (url && needsCors(url) && this.mode !== 'direct') {
        const next: RouteMode = this.mode === 'cors' ? 'proxy' : 'direct';
        const keepPlaying = this.state.playing || this.pendingAutoplay;
        this.load(this.state.index, keepPlaying, false, next);
        return;
      }
      if (this.giveUp('could not be played')) return;
      this.set({ error: `Couldn't play "${t?.title ?? 'track'}" — skipping` });
      // Skip a dead track rather than going silent mid-service.
      setTimeout(() => { if (e === this.a && this.state.playing) this.advance(1); }, 600);
    });
    return e;
  }

  private gain(): number {
    if (this.state.muted) return 0;
    return this.state.volume * playlistFactor();
  }

  private applyPriority() {
    const p = getAudioPriority();
    const hold = p.videoAudible && p.policy === 'pause';
    if (hold && this.state.playing && !this.state.heldByVideo) {
      // Pause-and-resume: fade out, keep our place.
      this.rampTo(0, 0.6, () => { try { this.a?.pause(); } catch { /* */ } });
      this.set({ heldByVideo: true });
      return;
    }
    if (!hold && this.state.heldByVideo) {
      this.set({ heldByVideo: false });
      if (this.state.playing && this.a) {
        this.a.volume = 0;
        void this.a.play().catch(() => {});
        this.rampTo(this.gain(), 1.2);
      }
      return;
    }
    if (!this.state.heldByVideo) this.rampTo(this.gain(), 0.6);
  }

  private rampTo(to: number, sec: number, then?: () => void) {
    const e = this.a;
    if (!e) { then?.(); return; }
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const from = e.volume;
    const steps = Math.max(1, Math.round((sec * 1000) / 40));
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      try { e.volume = Math.min(1, Math.max(0, from + (to - from) * (i / steps))); } catch { /* */ }
      if (i >= steps) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        then?.();
      }
    }, 40);
  }

  private rebuildOrder(keepCurrent = true) {
    const n = this.state.queue.length;
    const idx = Array.from({ length: n }, (_, i) => i);
    if (this.state.shuffle) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      // The song that's playing stays first so toggling shuffle doesn't jump.
      if (keepCurrent && this.state.index >= 0) {
        const at = idx.indexOf(this.state.index);
        if (at > 0) { idx.splice(at, 1); idx.unshift(this.state.index); }
      }
    }
    this.order = idx;
  }

  private pendingAutoplay = false;

  private load(index: number, autoplay: boolean, crossfade = false, mode: RouteMode = 'cors') {
    // A new song ends any deck handover — the element plays it; an expanded
    // deck re-attaches to the new song itself.
    if (this.deckT) { this.deckT = null; this.deckTrackId = null; this.state.deck = false; }
    this.state.loadSeq++;
    const t = this.state.queue[index];
    if (!t) { this.stop(); return; }
    const url = resolveUrl(t);
    if (!url) {
      this.set({ index, error: `"${t.title}" is a local file that isn't linked this session — add the file again` }, true);
      if (autoplay && !this.giveUp('not linked')) setTimeout(() => this.advance(1), 400);
      return;
    }

    if (crossfade && this.a && this.state.crossfadeSec > 0) {
      // Old element fades out on its own; the new one becomes `a`.
      const old = this.a;
      this.b = old;
      const sec = this.state.crossfadeSec;
      const from = old.volume;
      const steps = Math.max(1, Math.round((sec * 1000) / 40));
      let i = 0;
      const t2 = setInterval(() => {
        i++;
        try { old.volume = Math.max(0, from * (1 - i / steps)); } catch { /* */ }
        if (i >= steps) { clearInterval(t2); try { old.pause(); old.src = ''; } catch { /* */ } amboAudio.detachElement(old); if (this.b === old) this.b = null; }
      }, 40);
      this.a = this.makeEl(mode !== 'direct');
    }

    // The element must match the route: a routed element can't play a
    // non-CORS cross-origin file (it would be silent), so 'direct' gets a
    // plain element and the next routable song gets a mixer element back.
    let e = this.el();
    const wantRouted = mode !== 'direct';
    if (this.routed.has(e) !== wantRouted) {
      try { e.pause(); e.src = ''; } catch { /* */ }
      amboAudio.detachElement(e);
      this.a = e = this.makeEl(wantRouted);
    }
    if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
    this.mode = mode;
    this.pendingAutoplay = autoplay;
    if (mode === 'proxy') { e.removeAttribute('crossorigin'); e.src = proxied(url); }
    else if (mode === 'cors' && needsCors(url)) { e.crossOrigin = 'anonymous'; e.src = url; }
    else { e.removeAttribute('crossorigin'); e.src = url; }
    e.currentTime = 0;
    amboAudio.applyFileFx(t.id);
    this.set({ index, currentTime: 0, duration: 0, error: null, unmetered: !this.routed.has(e) }, true);
    if (autoplay && !this.state.heldByVideo) {
      e.volume = crossfade ? 0 : this.gain();
      void e.play().then(() => {
        this.set({ playing: true });
        if (crossfade) this.rampTo(this.gain(), this.state.crossfadeSec);
      }).catch(err => this.set({ playing: false, error: String(err?.message || err) }));
    } else {
      this.set({ playing: autoplay });
    }
  }

  private advance(dir: 1 | -1, crossfade = false) {
    const n = this.state.queue.length;
    if (!n) return;
    if (this.order.length !== n) this.rebuildOrder();
    const pos = this.order.indexOf(this.state.index);
    let next = pos + dir;
    if (next >= n) {
      if (this.state.repeat === 'all') {
        if (this.state.shuffle) this.rebuildOrder(false);
        next = 0;
      } else { this.stop(); return; }
    }
    if (next < 0) next = this.state.repeat === 'all' ? n - 1 : 0;
    this.load(this.order[next], true, crossfade);
  }

  /** True (and stops) once every song in the queue has failed in a row. */
  private giveUp(why: string): boolean {
    this.failures++;
    if (this.failures < Math.max(1, this.state.queue.length)) return false;
    this.failures = 0;
    try { this.a?.pause(); } catch { /* */ }
    this.set({ playing: false, error: `Stopped — no song in the queue could play (${why})` });
    return true;
  }

  // ── public API ──

  /** Replace the queue and start playing (Play on a playlist or album). */
  playQueue(tracks: BusTrack[], startAt = 0, opts: { shuffle?: boolean } = {}) {
    this.failures = 0;
    const queue = tracks.filter(Boolean);
    if (!queue.length) return;
    this.state.queue = queue;
    if (opts.shuffle != null) this.state.shuffle = opts.shuffle;
    // The picked song plays first; with shuffle on, the rest follow in random order.
    this.state.index = Math.min(Math.max(0, startAt), queue.length - 1);
    if (opts.shuffle && startAt === 0) this.state.index = Math.floor(Math.random() * queue.length);
    this.rebuildOrder(true);
    this.load(this.state.index, true);
  }

  /** Append to the end of the queue. Starts playback if nothing was loaded. */
  enqueue(tracks: BusTrack[]) {
    const have = new Set(this.state.queue.map(t => t.id));
    const add = tracks.filter(t => t && !have.has(t.id));
    if (!add.length) return;
    const wasEmpty = this.state.index < 0 || !this.state.queue.length;
    this.state.queue = [...this.state.queue, ...add];
    this.rebuildOrder();
    if (wasEmpty) this.load(this.state.queue.length - add.length, true);
    else this.set({}, true);
  }

  /** Insert right after the current song. */
  playNext(track: BusTrack) {
    const q = this.state.queue.filter(t => t.id !== track.id);
    const cur = this.state.queue[this.state.index];
    const at = cur ? q.findIndex(t => t.id === cur.id) + 1 : 0;
    q.splice(at, 0, track);
    this.state.queue = q;
    this.state.index = cur ? q.findIndex(t => t.id === cur.id) : -1;
    this.rebuildOrder();
    if (!cur) this.load(0, true); else this.set({}, true);
  }

  jumpTo(index: number) { this.failures = 0; this.load(index, true); }

  remove(index: number) {
    const q = [...this.state.queue];
    q.splice(index, 1);
    const cur = this.state.index;
    this.state.queue = q;
    if (index === cur) {
      this.rebuildOrder();
      if (q.length) this.load(Math.min(index, q.length - 1), this.state.playing); else this.stop(true);
      return;
    }
    this.state.index = index < cur ? cur - 1 : cur;
    this.rebuildOrder();
    this.set({}, true);
  }

  move(from: number, to: number) {
    const q = [...this.state.queue];
    if (to < 0 || to >= q.length) return;
    const [t] = q.splice(from, 1);
    q.splice(to, 0, t);
    const curId = this.state.queue[this.state.index]?.id;
    this.state.queue = q;
    this.state.index = curId ? q.findIndex(x => x.id === curId) : -1;
    this.rebuildOrder();
    this.set({}, true);
  }

  clearQueue() { this.stop(true); }

  /** Reorder the queue by cue colour/label; the playing song keeps playing. */
  organizeByCue() {
    const rank = (t: BusTrack) => {
      const c = getCue(t.cueScope, t.id);
      const i = c ? CUE_COLORS.findIndex(x => x.id === c.color) : -1;
      return [c ? (i < 0 ? CUE_COLORS.length : i) : CUE_COLORS.length + 1, (c?.label || '').toLowerCase()] as const;
    };
    const curId = this.state.queue[this.state.index]?.id;
    const q = this.state.queue
      .map((t, i) => ({ t, i, r: rank(t) }))
      .sort((a, b) => a.r[0] - b.r[0] || a.r[1].localeCompare(b.r[1]) || a.i - b.i)
      .map(x => x.t);
    this.state.queue = q;
    this.state.index = curId ? q.findIndex(x => x.id === curId) : -1;
    this.rebuildOrder();
    this.set({}, true);
  }

  toggle() {
    if (this.deckT) { this.deckT.toggle(); return; }
    this.state.playing ? this.pause() : this.play();
  }

  play() {
    if (this.state.index < 0) { if (this.state.queue.length) this.load(this.order[0] ?? 0, true); return; }
    const e = this.el();
    if (!e.src) { this.load(this.state.index, true); return; }
    if (this.state.heldByVideo) { this.set({ playing: true }); return; }
    e.volume = this.gain();
    void e.play().then(() => this.set({ playing: true, error: null }))
      .catch(err => this.set({ playing: false, error: String(err?.message || err) }));
  }

  pause() {
    try { this.a?.pause(); } catch { /* */ }
    this.set({ playing: false });
  }

  /** Fade the playlist out and stop — the operator's "bring the music down". */
  fadeOut(sec = 3) {
    this.rampTo(0, sec, () => this.pause());
  }

  stop(clear = false) {
    try { this.a?.pause(); } catch { /* */ }
    if (clear) {
      try { if (this.a) this.a.src = ''; } catch { /* */ }
      this.state.queue = [];
      this.state.index = -1;
      this.order = [];
    }
    this.set({ playing: false, currentTime: 0 }, true);
  }

  next() { this.advance(1, this.state.crossfadeSec > 0); }
  prev() {
    // Like every player: restart the song unless we're at its top.
    if (this.exactTime() > 3) { this.seek(0); return; }
    this.advance(-1);
  }

  seek(sec: number) {
    if (this.deckT) { this.deckT.seek(sec); this.set({ currentTime: sec }); return; }
    if (this.a) { this.a.currentTime = sec; this.set({ currentTime: sec }); }
  }

  setVolume(v: number) {
    this.state.volume = Math.min(1, Math.max(0, v));
    if (this.a && !this.state.heldByVideo && !this.fadeTimer) this.a.volume = this.gain();
    this.set({}, true);
  }
  setMuted(m: boolean) { this.state.muted = m; if (this.a && !this.state.heldByVideo) this.a.volume = this.gain(); this.set({}); }
  setShuffle(s: boolean) { this.state.shuffle = s; this.rebuildOrder(); this.set({}, true); }
  setRepeat(r: RepeatMode) { this.set({ repeat: r }, true); }
  setCrossfade(sec: number) { this.set({ crossfadeSec: Math.max(0, Math.min(12, sec)) }, true); }

  /** Called when the presenter unmounts — music must not outlive its controls. */
  release() { this.pause(); }

  /** Sample-exact position, straight from the element (state is ~4 Hz). */
  exactTime(): number {
    if (this.deckT) return this.deckT.time();
    return this.a?.currentTime ?? this.state.currentTime;
  }
  isAudiblyPlaying(): boolean {
    if (this.deckT) return this.deckT.playing();
    return !!this.a && !this.a.paused && this.state.playing && !this.state.heldByVideo;
  }

  // ── Compact ⇄ DJ deck handover ─────────────────────────────────────────────
  // The thin bar and the DJ deck are two views of ONE song. The bar streams it
  // through an <audio> element; the deck needs the decoded buffer (waveform,
  // sample-accurate loops, EQ). So the song keeps playing in the bar while the
  // deck decodes, then the deck takes over at the same position with a 60 ms
  // crossfade — and hands it back the same way on collapse.
  private deckT: DeckTransport | null = null;
  private deckTrackId: string | null = null;
  private lastDeckReport = 0;

  /**
   * The deck is ready to take over `trackId`. Returns where the song is and
   * whether it's playing (the deck starts there), or null if the playlist has
   * moved on to another song meanwhile.
   */
  beginDeckHandoff(trackId: string, transport: DeckTransport): { time: number; playing: boolean } | null {
    const cur = this.state.queue[this.state.index];
    if (!cur || cur.id !== trackId) return null;
    const e = this.a;
    const time = e ? e.currentTime : this.state.currentTime;
    const playing = this.state.playing && !this.state.heldByVideo;
    this.deckT = transport;
    this.deckTrackId = trackId;
    if (e) this.rampTo(0, 0.06, () => { try { e.pause(); } catch { /* */ } });
    this.set({ deck: true });
    return { time, playing };
  }

  /** The deck closed (collapse to compact): resume the element where the deck was. */
  endDeckHandoff(trackId: string, time: number, playing: boolean) {
    if (this.deckTrackId !== trackId) return;
    this.deckT = null;
    this.deckTrackId = null;
    const cur = this.state.queue[this.state.index];
    if (cur && cur.id === trackId && this.a) {
      const e = this.a;
      try { e.currentTime = time; } catch { /* */ }
      if (playing && !this.state.heldByVideo) {
        e.volume = 0;
        void e.play().catch(() => {});
        this.rampTo(this.gain(), 0.06);
      }
      this.set({ deck: false, playing, currentTime: time });
    } else {
      this.set({ deck: false });
    }
  }

  /** The deck reached the end of the song: carry on with the playlist. */
  deckEnded(trackId: string) {
    if (this.deckTrackId !== trackId) return;
    this.deckT = null;
    this.deckTrackId = null;
    this.set({ deck: false });
    if (this.state.repeat === 'one') { this.load(this.state.index, true); return; }
    this.advance(1);
  }

  /** The deck reports progress so the compact bar keeps showing it (≈5 Hz). */
  reportDeck(trackId: string, time: number, duration: number, playing: boolean) {
    if (this.deckTrackId !== trackId) return;
    const now = performance.now();
    if (now - this.lastDeckReport < 200 && playing === this.state.playing) return;
    this.lastDeckReport = now;
    this.state.currentTime = time;
    this.state.duration = duration;
    this.state.playing = playing;
    this.notify();
  }
}

export const bus = new AudioBus();

// The playlist is a lyric clock: lyrics can follow whatever it's playing.
registerLyricClock('bus', {
  getTime: () => bus.exactTime(),
  isPlaying: () => bus.isAudiblyPlaying(),
  rate: () => 1,
  track: () => bus.state.queue[bus.state.index] ?? null,
});
