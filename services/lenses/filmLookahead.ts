// filmLookahead — a fixed film is analysed AHEAD of the playhead, so Colorize applies decisions instead of
// running the heavy scene model live.
//
//   Reader   a second, muted, hidden <video> on the same source (Mux/HLS at its lowest rendition) plays
//            ahead of the viewer at ~4×, sampled per decoded frame (requestVideoFrameCallback).
//   Shots    each sample's 64×36 grey thumbnail and 32-bin histogram are compared with the previous
//            sample's; a cut is a spike in picture change (mean |Δ|, with some histogram movement χ²) well
//            above the change of the samples just before it, so sustained motion or a pan doesn't split a shot.
//   Keys     the remaster scene model (SegFormer-B2) runs at each shot's start and every 4 s inside it; the
//            reader pauses while it works, so no key is skipped. A key stores its labels run-length encoded
//            (a few KB) and its grey thumbnail.
//   Cache    per film in IndexedDB — a rewatch, or the next session, needs no analysis at all.
//   Playback mapAt(t) returns the shot's nearest key; drift(…) block-matches the live frame against the
//            key's thumbnail so the labels follow a pan, and reports how much of the picture still agrees
//            (actors walking in) so the engine can lean on its live senses instead.
//
// Faces and the person matte stay live (cheap, and needed where people are NOW). Desktop / WebGPU only —
// the engine doesn't create one elsewhere.
import { loadSceneModel, segmentFrame, type SegMap } from './sceneSegment';

const CACHE_VERSION = 1;
const AHEAD_S = 180;           // keep this much analysed past the playhead
const RATE = 4;                // reader speed while catching up (lowered when frames get dropped)
const SAMPLE_S = 0.25;         // media seconds between shot-detection samples
const KEY_EVERY_S = 4;         // a fresh key this often inside a long shot
const LEAPFROG_S = 8;          // when the viewer is in unread film, start reading this far ahead of them
const TW = 64, TH = 36;        // grey thumbnail (shot detection + drift)

export interface FilmShot { t0: number; t1: number }
export interface FilmKey { t: number; w: number; h: number; rect: [number, number, number, number]; rle: Uint8Array; thumb: Uint8Array }
interface FilmCache { filmId: string; version: number; shots: FilmShot[]; keys: FilmKey[]; covered: [number, number][] }

// ── run-length labels: byte = material << 3 | confidence (3 bits) ──
function encode(m: SegMap): Uint8Array {
  const n = m.w * m.h, out: number[] = [];
  let prev = -1, run = 0;
  for (let p = 0; p < n; p++) {
    const b = (m.data[p * 2] << 3) | (m.data[p * 2 + 1] >> 5);
    if (b === prev && run < 255) run++;
    else { if (prev >= 0) out.push(prev, run); prev = b; run = 1; }
  }
  if (prev >= 0) out.push(prev, run);
  return Uint8Array.from(out);
}
function decodeKey(k: FilmKey): SegMap {
  const data = new Uint8Array(k.w * k.h * 2);
  let p = 0;
  for (let i = 0; i < k.rle.length; i += 2) {
    const b = k.rle[i], mat = b >> 3, conf = ((b & 7) << 5) | 16;
    for (let r = 0; r < k.rle[i + 1]; r++, p++) { data[p * 2] = mat; data[p * 2 + 1] = conf; }
  }
  return { data, w: k.w, h: k.h, rect: k.rect, stamp: 0 };
}

// ── IndexedDB (one record per film) ──
const DB = 'plajah-colorize', STORE = 'films';
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function readCache(filmId: string): Promise<FilmCache | null> {
  try {
    const d = await db();
    return await new Promise(ok => {
      const q = d.transaction(STORE).objectStore(STORE).get(`${filmId}:${CACHE_VERSION}`);
      q.onsuccess = () => ok((q.result as FilmCache) || null); q.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function writeCache(c: FilmCache) {
  try {
    const d = await db();
    await new Promise<void>(ok => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(c, `${c.filmId}:${CACHE_VERSION}`); tx.oncomplete = () => ok(); tx.onerror = () => ok(); });
  } catch { /* private mode / quota: the cache just lives for this session */ }
}

function greyThumb(src: CanvasImageSource, c: HTMLCanvasElement): Uint8Array {
  c.width = TW; c.height = TH;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, 0, 0, TW, TH);
  const d = x.getImageData(0, 0, TW, TH).data, out = new Uint8Array(TW * TH);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  return out;
}
function histogram(t: Uint8Array): Float32Array {
  const h = new Float32Array(32);
  for (const v of t) h[v >> 3]++;
  for (let i = 0; i < 32; i++) h[i] /= t.length;
  return h;
}

export class FilmLookahead {
  private cache: FilmCache;
  private video = document.createElement('video');
  private hls: any = null;
  private probe = document.createElement('canvas');
  private frame = document.createElement('canvas');
  private thumbC = document.createElement('canvas');
  private prevThumb: Uint8Array | null = null;
  private prevHist: Float32Array | null = null;
  private madCtx: number[] = [];
  private rate = RATE;
  private gapAvg = SAMPLE_S;
  private lastSample = -1;
  private lastKey = -1e9;
  private runStart = -1;
  private readFrom = 0;              // where the reader was last sent (a run is covered from there)            // media time this reading run began (a covered range in progress)
  private segBusy = false;
  private dead = false;
  private dirty = false;
  private saveTimer: any = null;
  private playhead = 0;
  private playheadMovedAt = 0;
  private decoded = new Map<FilmKey, SegMap>();
  private ready: Promise<void>;
  /** bumped when new shots/keys land */
  stamp = 0;

  constructor(private filmId: string, private url: string) {
    this.cache = { filmId, version: CACHE_VERSION, shots: [], keys: [], covered: [] };
    const v = this.video;
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    // in the DOM (some engines skip decode callbacks for detached media) but invisible and inert
    Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
    this.ready = (async () => {
      const saved = await readCache(filmId);
      if (saved && !this.dead) { this.cache = saved; this.stamp++; }
      void loadSceneModel('remaster');
      if (this.dead) return;
      document.body.appendChild(v);
      if (/\.m3u8|stream\.mux\.com/.test(url) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (this.dead) return;
        this.hls = new Hls({ startLevel: 0, capLevelToPlayerSize: false, maxBufferLength: 20, maxMaxBufferLength: 40 });
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => { try { this.hls.currentLevel = 0; } catch { /* */ } });   // lowest rendition: plenty for 512-px analysis
        this.hls.loadSource(url); this.hls.attachMedia(v);
      } else v.src = url;
      v.addEventListener('loadedmetadata', () => this.pace());
      this.watchFrames();
    })();
  }

  // ───────────── reading ahead ─────────────
  private watchFrames() {
    const v: any = this.video;
    const onFrame = (_now: number, meta: any) => {
      if (this.dead) return;
      this.sample(meta?.mediaTime ?? v.currentTime);
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(onFrame);
    };
    if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(onFrame);
    // backstop: frame callbacks stop in throttled/hidden contexts; samples are rate-limited, so both can run
    v.addEventListener('timeupdate', () => { if (!this.dead) this.sample(v.currentTime); });
  }

  private sample(t: number) {
    if (!(t >= 0) || t - this.lastSample < SAMPLE_S || this.segBusy) return;
    const v = this.video;
    if (!v.videoWidth) return;
    // keep samples ~SAMPLE_S of film apart: if the decoder drops frames at this speed, read slower
    const gap = this.lastSample >= 0 ? t - this.lastSample : SAMPLE_S;
    if (gap > 0 && gap < 5) {
      this.gapAvg += (gap - this.gapAvg) * 0.2;
      this.rate = Math.max(1, Math.min(RATE, this.rate * (this.gapAvg > SAMPLE_S * 2 ? 0.85 : this.gapAvg < SAMPLE_S * 1.3 ? 1.05 : 1)));
      if (Math.abs(v.playbackRate - this.rate) > 0.05) v.playbackRate = this.rate;
    }
    this.lastSample = t;
    let thumb: Uint8Array;
    try { thumb = greyThumb(v, this.thumbC); } catch { this.stopReading(); return; }   // tainted: source isn't CORS-clean
    const hist = histogram(thumb);
    let cut = false;
    if (this.prevThumb && this.prevHist) {
      let chi = 0, mad = 0;
      for (let i = 0; i < 32; i++) { const s = hist[i] + this.prevHist[i]; if (s > 0) chi += (hist[i] - this.prevHist[i]) ** 2 / s; }
      for (let i = 0; i < thumb.length; i++) mad += Math.abs(thumb[i] - this.prevThumb[i]);
      mad /= thumb.length * 255;
      // A cut is a SPIKE: the picture jumps (and its grey histogram moves at least a little — b&w interiors
      // keep similar histograms across a cut) well above the change of the samples before it. Sustained
      // fast motion raises that context and is not cut. Tuned on Night of the Living Dead at this sample
      // spacing: 18 of 20 real cuts, no false ones (the misses sit inside fast motion; keys every 4 s and the
      // drift check cover them).
      const ctx = this.madCtx.length ? [...this.madCtx].sort((a, b) => a - b)[this.madCtx.length >> 1] : 0;
      cut = ((mad > 0.12 && chi > 0.02) || mad > 0.22) && mad > 3 * ctx + 0.02;
      this.madCtx.push(mad); if (this.madCtx.length > 8) this.madCtx.shift();
    }
    this.prevThumb = thumb; this.prevHist = hist;
    // shots stay time-ordered however the reader got here: a cut splits the shot it falls in; a run that starts
    // in unknown territory opens a shot that ends where the next known one begins
    const shots = this.cache.shots;
    const i = this.shotAt(t);
    if (i < 0) {
      const next = shots.findIndex(x => x.t0 > t);
      const prev = next < 0 ? shots[shots.length - 1] : shots[next - 1];
      // a run opened where the reader was sent: the shot starts there too (but never inside an earlier shot)
      const from = Math.max(Math.abs(t - this.readFrom) < 2 ? Math.min(t, this.readFrom) : t, prev && prev.t1 !== Infinity ? prev.t1 : -Infinity);
      shots.splice(next < 0 ? shots.length : next, 0, { t0: from, t1: next < 0 ? Infinity : shots[next].t0 });
      this.lastKey = -1e9; this.stamp++;
    } else if (cut && t - shots[i].t0 >= 0.5) {
      shots.splice(i + 1, 0, { t0: t, t1: shots[i].t1 }); shots[i].t1 = t;
      this.lastKey = -1e9; this.stamp++;
    }
    this.extendCovered(t);
    if (t - this.lastKey >= KEY_EVERY_S) { this.lastKey = t; this.keyframe(t, thumb); }
    this.pace();
  }

  private keyframe(t: number, thumb: Uint8Array) {
    const v = this.video;
    this.segBusy = true;
    v.pause();                                                    // hold this frame until the model has seen it
    let p: Promise<SegMap | null>;
    try { p = segmentFrame(v, v.videoWidth, v.videoHeight, 'remaster', this.frame, this.probe); }
    catch { this.segBusy = false; return; }
    p.then(m => {
      if (!m || this.dead) return;
      this.cache.keys.push({ t, w: m.w, h: m.h, rect: m.rect, rle: encode(m), thumb });
      this.cache.keys.sort((a, b) => a.t - b.t);
      this.stamp++; this.markDirty();
    }).finally(() => { this.segBusy = false; if (!this.dead) this.pace(); });
  }

  private extendCovered(t: number) {
    const c = this.cache.covered;
    if (this.runStart < 0) { const from = Math.abs(t - this.readFrom) < 2 ? Math.min(t, this.readFrom) : t; this.runStart = from; c.push([from, t]); }
    const run = c.find(r => r[0] === this.runStart);
    if (run && t > run[1]) run[1] = t;
    // merge overlaps
    c.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < c.length;) {
      if (c[i + 1][0] <= c[i][1] + SAMPLE_S * 2) { c[i][1] = Math.max(c[i][1], c[i + 1][1]); if (this.runStart === c[i + 1][0]) this.runStart = c[i][0]; c.splice(i + 1, 1); }
      else i++;
    }
  }
  private coveredAt(t: number) { return this.cache.covered.find(r => t >= r[0] && t <= r[1]); }

  /** Keep the reader inside [playhead, playhead + AHEAD]: run, rest, or jump to where the viewer went. */
  private pace() {
    const v = this.video;
    if (this.dead || this.tainted || this.segBusy || v.readyState < 1) return;
    const run = this.coveredAt(this.playhead);
    const end = Number.isFinite(v.duration) ? v.duration : Infinity;
    // where reading should continue: the end of what's done around the viewer — or, if the viewer is in
    // unread film, a little AHEAD of them (chasing the playhead itself would never catch it)
    const moving = performance.now() - this.playheadMovedAt < 1500;
    const want = Math.min(end - 0.5, run ? run[1] : this.playhead + (moving ? LEAPFROG_S : 0));
    if (run && run[1] >= Math.min(end - 0.5, this.playhead + AHEAD_S)) { v.pause(); return; }   // far enough ahead
    const at = v.currentTime;
    if (at < want - 1 || at > this.playhead + AHEAD_S + 10) {                                // fell behind, or the viewer jumped back
      this.runStart = -1; this.prevThumb = null; this.prevHist = null; this.madCtx = []; this.lastSample = -1;
      this.readFrom = want;
      try { v.currentTime = want; } catch { /* */ }
    }
    v.playbackRate = this.rate;
    if (v.paused) v.play().catch(() => { /* autoplay policy: muted video should be allowed */ });
  }

  private tainted = false;
  private stopReading() { this.tainted = true; this.video.pause(); }

  private markDirty() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; if (this.dirty) { this.dirty = false; void writeCache(this.cache); } }, 10000);
  }

  // ───────────── playback side ─────────────
  /** Tell the reader where the viewer is (call every frame with the main video's currentTime). */
  follow(t: number) {
    if (!Number.isFinite(t)) return;
    const jumped = Math.abs(t - this.playhead) > 3;
    if (t !== this.playhead) this.playheadMovedAt = performance.now();
    this.playhead = t;
    if (jumped || Math.random() < 0.02) this.pace();
  }

  shotAt(t: number): number {
    const s = this.cache.shots;
    let lo = 0, hi = s.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (t < s[m].t0) hi = m - 1; else if (t >= s[m].t1) lo = m + 1; else return m; }
    return -1;
  }

  /** The cached labels for time t (the shot's latest key at or before t, else its first), or null. */
  mapAt(t: number): { map: SegMap; key: FilmKey; shot: number } | null {
    if (!this.coveredAt(t)) return null;
    const shot = this.shotAt(t); if (shot < 0) return null;
    const { t0, t1 } = this.cache.shots[shot], keys = this.cache.keys;
    // last key at or before t (binary search), kept only if it belongs to this shot; else the shot's first key
    let lo = 0, hi = keys.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (keys[m].t <= t + 0.1) { at = m; lo = m + 1; } else hi = m - 1; }
    let best: FilmKey | null = at >= 0 && keys[at].t >= t0 ? keys[at] : null;
    if (!best && at + 1 < keys.length && keys[at + 1].t < t1) best = keys[at + 1];
    if (!best) return null;
    let m = this.decoded.get(best);
    if (!m) {
      m = decodeKey(best); m.stamp = this.cache.keys.indexOf(best) + 1;
      this.decoded.set(best, m);
      if (this.decoded.size > 12) this.decoded.delete(this.decoded.keys().next().value!);
    }
    return { map: m, key: best, shot };
  }

  /**
   * How the live frame has moved since the key: block-match its grey thumbnail against the key's (±6 px of
   * 64×36). Returns the label offset (uv) and agreement 0..1 (how much of the picture still matches).
   */
  drift(live: CanvasImageSource, key: FilmKey): { dx: number; dy: number; agree: number } {
    const cur = greyThumb(live, this.thumbC), ref = key.thumb, R = 6;
    let best = 1e9, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
      let s = 0, n = 0;
      for (let y = R; y < TH - R; y += 2) for (let x = R; x < TW - R; x += 2) {
        s += Math.abs(cur[y * TW + x] - ref[(y - dy) * TW + (x - dx)]); n++;
      }
      s /= n;
      if (s < best) { best = s; bx = dx; by = dy; }
    }
    const r = best / 255;
    return { dx: bx / TW, dy: by / TH, agree: 1 - Math.min(1, Math.max(0, (r - 0.05) / 0.13)) };
  }

  /** Short human status for the lens pill ('' when the playhead is covered). */
  status(): string {
    if (this.tainted || this.coveredAt(this.playhead)) return '';
    return this.segBusy || !this.video.paused ? 'colouring ahead of you…' : '';
  }

  /** How far past the playhead the analysis reaches (seconds). */
  lead(): number { const r = this.coveredAt(this.playhead); return r ? r[1] - this.playhead : 0; }

  /** Analysed shots and keys so far (for diagnostics / the lab). */
  stats() { return { shots: this.cache.shots.length, keys: this.cache.keys.length, covered: this.cache.covered.map(r => [Math.round(r[0]), Math.round(r[1])]), kb: Math.round(this.cache.keys.reduce((s, k) => s + k.rle.length + k.thumb.length, 0) / 1024) }; }

  whenReady() { return this.ready; }

  dispose() {
    this.dead = true;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.dirty) void writeCache(this.cache);
    try { this.hls?.destroy(); } catch { /* */ }
    const v = this.video; v.pause(); v.removeAttribute('src'); try { v.load(); } catch { /* */ } v.remove();
    this.decoded.clear();
  }
}
