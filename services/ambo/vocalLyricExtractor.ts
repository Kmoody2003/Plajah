// vocalLyricExtractor — real, time-synced lyrics for ANY track playing on the DJ deck / playlist.
//
// Speech models cannot read a full mix, so we never feed them the mix. Instead, in the
// background (ahead of the playhead, faster than real time):
//   1. VOCAL ISOLATION on the decoded buffer: mid/side split (lead vocals sit in the centre,
//      so L+R keeps them and the stereo-wide guitars/synths/reverb are dropped), a 160 Hz–5 kHz
//      band-pass (kick/bass/cymbals gone), then a compressor to lift the voice, resampled to 16 kHz.
//   2. WINDOWED TRANSCRIPTION with timestamps (Whisper), silent/instrumental windows skipped,
//      hallucinations and loops filtered.
//   3. Lines are published PROGRESSIVELY as each window finishes (so lyrics start appearing in
//      seconds and stay in sync with the track's own clock), and cached for next time.
// The result is a normal `timeCodedLyrics` array — every lyric look, output window and visualizer
// already consumes that.

export interface TimedLine { time: number; text: string }
export interface ExtractState { status: 'idle' | 'isolating' | 'transcribing' | 'done' | 'error'; progress: number; lines: number; message: string; key: string }

const store = new Map<string, TimedLine[]>();
const subs = new Set<() => void>();
let state: ExtractState = { status: 'idle', progress: 0, lines: 0, message: '', key: '' };
const emit = () => subs.forEach(f => { try { f(); } catch { /* */ } });
const setState = (p: Partial<ExtractState>) => { state = { ...state, ...p }; emit(); };
export const getExtractState = () => state;
export const subscribeExtract = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export type ExtractTrack = { id?: string; url?: string; title?: string; artist?: string };
export const trackKey = (t: ExtractTrack) => t.id || t.title || t.url || '';
export const getExtractedLyrics = (t: ExtractTrack | null | undefined): TimedLine[] => (t && store.get(trackKey(t))) || [];
export const isExtracting = (t: ExtractTrack) => state.key === trackKey(t) && (state.status === 'isolating' || state.status === 'transcribing');

const CACHE_PREFIX = 'ambo_vocal_lyrics_v2:';
function readCache(key: string): TimedLine[] | null {
  try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache(key: string, lines: TimedLine[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(lines)); } catch { /* quota */ }
}

// ── 1. vocal isolation ──────────────────────────────────────────────────────
export async function isolateVocals16k(buf: AudioBuffer): Promise<Float32Array> {
  const n = buf.length;
  const mono = new AudioBuffer({ length: n, sampleRate: buf.sampleRate, numberOfChannels: 1 });
  const out = mono.getChannelData(0);
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  // Mid keeps centred content; subtracting a fraction of the side energy's envelope-free
  // component further suppresses wide instruments. (L+R)/2 is the core of it.
  for (let i = 0; i < n; i++) out[i] = (L[i] + R[i]) * 0.5;

  const len16 = Math.max(1, Math.ceil(buf.duration * 16000));
  const ctx = new OfflineAudioContext(1, len16, 16000);
  const src = ctx.createBufferSource(); src.buffer = mono;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160; hp.Q.value = 0.8;
  const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 160; hp2.Q.value = 0.7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.8;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2200; presence.gain.value = 4; presence.Q.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -32; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.12;
  const gain = ctx.createGain(); gain.gain.value = 2.2;
  src.connect(hp); hp.connect(hp2); hp2.connect(lp); lp.connect(presence); presence.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

// ── 2. whisper with timestamps (shared accelerated engine: Turbo on the GPU once downloaded) ──
async function loadAsr(onMsg: (m: string) => void) {
  onMsg('Loading accelerated speech model…');
  const { ensureAsr, getAsr } = await import('./asrEngine');
  await ensureAsr();
  // getAsr() returns Turbo as soon as it finishes loading, the quick tier until then
  return async (pcm: Float32Array) => (await getAsr()!.transcribe(pcm, { timestamps: true, background: true })).chunks;
}

// ── 0. cloud captions (server-side Gemini — what Chora's album page uses) ───
/** Time-coded lines for a web-reachable track, or null when unavailable (offline, local file, signed out). */
export async function fetchCloudCaptions(track: ExtractTrack): Promise<TimedLine[] | null> {
  if (!track.url || !/^https?:\/\//i.test(track.url)) return null;
  try {
    const { auth } = await import('../backendService');
    const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    if (!token) return null;
    const res = await fetch('/api/ai/captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ audioUrl: track.url, title: track.title || '', artist: track.artist || '' }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const caps: any[] = Array.isArray(data?.captions) ? data.captions : [];
    let lines = caps
      .map(c => ({ time: Number(c?.time ?? c?.start ?? 0), text: cleanLine(String(c?.text ?? '')) }))
      .filter(l => l.text && Number.isFinite(l.time));
    if (lines.length && Math.max(...lines.map(l => l.time)) > 7200) lines = lines.map(l => ({ ...l, time: l.time / 1000 }));
    return lines.length ? lines.sort((a, b) => a.time - b.time) : null;
  } catch { return null; }
}

const BAD = /^(?:thanks? for watching|thank you(?:\s+very\s+much)?|subtitles? by|subscribe|please like|translated by|amara\.org|copyright|closed captions?|the end|bye[- ]bye|you)[\s.!,]*$/i;
export function cleanLine(raw: string): string {
  let t = (raw || '').replace(/\s+/g, ' ').trim();
  if (/^[\[({♪\s*]*(?:music|applause|laughter|singing|instrumental|silence|inaudible|blank_audio)?[\])}♪\s*]*$/i.test(t)) return '';
  t = t.replace(/\[[^\]]*\]|\([^)]*\)|♪/g, '').trim();
  if (t.length < 2 || BAD.test(t)) return '';
  const w = t.toLowerCase().split(/\s+/);
  if (w.length >= 4 && new Set(w).size <= Math.max(1, Math.floor(w.length / 4))) return '';   // "la la la la la…" loops
  return t;
}

const rms = (a: Float32Array, s: number, e: number) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / Math.max(1, e - s)); };
const yieldUi = () => new Promise<void>(r => setTimeout(r, 0));

let runToken = 0;
export function cancelExtraction() { runToken++; if (state.status === 'isolating' || state.status === 'transcribing') setState({ status: 'idle', message: 'Cancelled' }); }

/**
 * Start (or resume from cache) extraction for a decoded track. Safe to call repeatedly:
 * no-ops if the track already has lyrics or is already being processed.
 */
async function resample16k(mono: Float32Array, sr: number): Promise<Float32Array> {
  if (sr === 16000) return mono;
  const ab = new AudioBuffer({ length: mono.length, sampleRate: sr, numberOfChannels: 1 });
  ab.copyToChannel(mono, 0);
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(mono.length * 16000 / sr)), 16000);
  const src = ctx.createBufferSource(); src.buffer = ab; src.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

export async function extractLyricsForTrack(track: ExtractTrack, buffer: AudioBuffer): Promise<void> {
  const key = trackKey(track);
  if (!key || (store.get(key)?.length && state.key === key && state.status === 'done')) return;
  if (state.key === key && (state.status === 'isolating' || state.status === 'transcribing')) return;
  const cached = readCache(key);
  if (cached?.length) { store.set(key, cached); setState({ key, status: 'done', progress: 1, lines: cached.length, message: 'Lyrics ready (cached)' }); return; }

  const token = ++runToken;
  const alive = () => token === runToken;
  store.set(key, []);
  setState({ key, status: 'transcribing', progress: 0.02, lines: 0, message: 'Identifying song…' });
  try {
    // ── 1. free online lyrics (LRCLIB) for the identified song ──
    let reference: string[] | null = null;
    try {
      const { identifySong, readTagsFromUrl, fetchOnlineLyrics } = await import('./onlineLyrics');
      const weakArtist = !track.artist || /^(?:local audio file|unknown)/i.test(track.artist);
      const tags = weakArtist && track.url ? await readTagsFromUrl(track.url) : {};
      const id = identifySong({ title: tags.title || track.title, artist: tags.artist || track.artist, fileName: track.title });
      if (!alive()) return;
      if (id) {
        setState({ message: `Looking up lyrics for “${id.title}”…` });
        const online = await fetchOnlineLyrics(id, buffer.duration);
        if (!alive()) return;
        if (online?.synced?.length) {
          store.set(key, online.synced);
          writeCache(key, online.synced);
          setState({ status: 'done', progress: 1, lines: online.synced.length, message: `Lyrics ready (synced, ${online.source})` });
          return;
        }
        if (online?.plain?.length) reference = online.plain;
      }
    } catch (e) { console.warn('[vocalLyricExtractor] online lyrics lookup failed', e); }

    // ── 2. cloud captions (server Gemini) when nothing published was found ──
    if (!reference) {
      setState({ message: 'Fetching captions…' });
      const cloud = await fetchCloudCaptions(track);
      if (!alive()) return;
      if (cloud?.length) {
        store.set(key, cloud);
        writeCache(key, cloud);
        setState({ status: 'done', progress: 1, lines: cloud.length, message: 'Lyrics ready (cloud captions)' });
        return;
      }
    }
    // ── 3. on-device: isolate vocals → transcribe (as the lyrics, or only to TIME the published lyrics) ──
    const { alignLyrics } = await import('./onlineLyrics');
    setState({ status: 'isolating', message: reference ? 'Timing published lyrics to the vocals…' : 'Preparing vocal isolation…' });
    const asrP = loadAsr(m => alive() && setState({ message: m }));
    asrP.catch(() => { /* surfaced below */ });

    const WIN = 24, HOP = 20;                               // seconds; 4 s overlap, dupes dropped below
    const totalSec = buffer.duration;
    const lines: TimedLine[] = [];
    let lastEnd = -1;
    let asr: ((pcm: Float32Array) => Promise<Array<{ text: string; start: number }>>) | null = null;
    const publish = (upTo: number, final: boolean) => {
      const out = reference ? alignLyrics(reference, lines, upTo, final) : [...lines];
      store.set(key, out);
      setState({ lines: out.length });
      return out;
    };

    const transcribe = async (startSec: number, pcm16: Float32Array) => {
      if (rms(pcm16, 0, pcm16.length) <= 0.003) return;       // instrumental section
      asr = asr || await asrP;
      if (!alive()) return;
      setState({ status: 'transcribing', message: reference ? 'Timing published lyrics…' : 'Transcribing vocals…' });
      const chunks = await asr(pcm16);
      for (const c of chunks) {
        const text = cleanLine(c.text);
        if (!text) continue;
        const t = startSec + (Number.isFinite(c.start) ? c.start : 0);
        if (t <= lastEnd - 0.5) continue;
        if (lines.length && lines[lines.length - 1].text.toLowerCase() === text.toLowerCase() && t - lines[lines.length - 1].time < 4) continue;
        lines.push({ time: Math.max(0, t), text });
        lastEnd = t;
      }
      publish(startSec + pcm16.length / 16000, false);       // progressive publish
    };

    // Provider of 16 kHz vocal audio for [from, to) seconds, depending on how isolation ran.
    let window16: (from: number, to: number) => Promise<Float32Array>;
    let filled = 0;                                           // seconds of vocal audio ready
    let nextStart = 0;
    const drain = async (final: boolean) => {
      while (alive() && nextStart < totalSec) {
        const need = nextStart + WIN;
        if (!(filled >= need || (final && filled >= totalSec - 0.01))) break;
        const end = Math.min(totalSec, need);
        await transcribe(nextStart, await window16(nextStart, end));
        if (end >= totalSec) { nextStart = Infinity; break; }
        nextStart += HOP;
      }
    };

    try {
      // ── ONNX MDX-Net stems: near-studio vocals, streamed in ~5.7 s chunks ──
      const { separateVocals, MDX } = await import('./vocalSeparator');
      const sr = MDX.sr;
      const vocal = new Float32Array(Math.ceil(totalSec * sr) + MDX.hop * MDX.dimT);
      window16 = (a, b) => resample16k(vocal.subarray(Math.floor(a * sr), Math.floor(b * sr)), sr);
      await separateVocals(buffer, async seg => {
        const o = Math.round(seg.startSec * sr);
        for (let i = 0; i < seg.left.length; i++) vocal[o + i] = (seg.left[i] + seg.right[i]) * 0.5;
        filled = (o + seg.left.length) / sr;
        if (alive()) setState({ status: 'isolating', progress: 0.1 + 0.88 * Math.min(1, filled / totalSec), message: 'Isolating vocals (ONNX)…' });
        await drain(false);
      }, (msg, p) => { if (alive() && filled === 0) setState({ message: msg, progress: 0.02 + 0.08 * p }); }, alive);
      filled = totalSec;
      await drain(true);
    } catch (modelErr) {
      if (!alive()) return;
      console.warn('[vocalLyricExtractor] ONNX separation unavailable, using filter isolation:', modelErr);
      if (lines.length === 0) {
        setState({ status: 'isolating', message: 'Isolating vocals (filter)…' });
        const pcm = await isolateVocals16k(buffer);
        window16 = async (a, b) => pcm.subarray(Math.floor(a * 16000), Math.floor(b * 16000));
        filled = totalSec; nextStart = 0;
        await drain(true);
      }
    }
    if (!alive()) return;
    const finalLines = publish(totalSec, true);
    writeCache(key, finalLines);
    setState({ status: 'done', progress: 1, lines: finalLines.length, message: finalLines.length ? (reference ? 'Lyrics ready (published words, timed to vocals)' : 'Lyrics ready') : 'No vocals detected' });
  } catch (e) {
    if (alive()) setState({ status: 'error', message: String((e as Error)?.message || e) });
  }
}
