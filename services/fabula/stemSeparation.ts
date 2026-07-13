// stemSeparation — audio-page separation. TWO tiers:
//   • quickStems()  — INSTANT, in-browser mid/side (center-channel) extraction. Vocals sit
//     center in most mixes, so the mid (L+R) is vocal-forward and the side (L-R) is the
//     instrumental (center-cancelled). Not ML-grade, but real, offline, and immediate.
//   • separateStemsCloud() — HIGH-QUALITY via the Crossover tier (Demucs 4-stem + pyannote
//     voice diarization, both open-source/MIT). Falls back to quickStems if the tier is absent.
//
// Everything returns WAV blobs (universally decodable) so the caller drops them as normal clips.

export type StemMode = 'vocals' | 'instrumental' | 'both';

function decodeCtx(): AudioContext { return new (window.AudioContext || (window as any).webkitAudioContext)(); }

/** 16-bit stereo WAV from a Float32 pair. */
function toWav(L: Float32Array, R: Float32Array, sr: number): Blob {
  const len = L.length, out = new ArrayBuffer(44 + len * 4), dv = new DataView(out);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, len * 4, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    dv.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7fff, true); off += 2;
    dv.setInt16(off, r < 0 ? r * 0x8000 : r * 0x7fff, true); off += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

/** Instant browser split. Returns the requested stem(s) as WAV blobs. */
export async function quickStems(blob: Blob, mode: StemMode = 'both'): Promise<{ vocals?: Blob; instrumental?: Blob }> {
  const ac = decodeCtx();
  const ab = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close();
  const n = ab.length, sr = ab.sampleRate;
  const L = ab.getChannelData(0);
  const R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
  const res: { vocals?: Blob; instrumental?: Blob } = {};
  if (mode === 'instrumental' || mode === 'both') {
    // center-cancel: side signal removes anything panned dead-center (usually lead vocal)
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = (L[i] - R[i]) * 0.9;
    res.instrumental = toWav(s, s, sr);
  }
  if (mode === 'vocals' || mode === 'both') {
    // center emphasis: mid minus the correlated side energy → vocal-forward mono
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const mid = (L[i] + R[i]) * 0.5, side = Math.abs(L[i] - R[i]) * 0.5;
      const c = mid - Math.sign(mid) * Math.min(Math.abs(mid), side);
      v[i] = c * 1.1;
    }
    res.vocals = toWav(v, v, sr);
  }
  return res;
}

export interface CloudStemResult { vocals?: string; drums?: string; bass?: string; other?: string; voices?: string[]; ok: boolean; message?: string; }

/** High-quality separation on the Crossover tier. Contract (see docs/fabula/AUDIO_SEPARATION_PLAN.md):
 *  POST /api/crossover/stems { url, mode:'4stem'|'voices' } → { vocals, drums, bass, other } URLs
 *  (Demucs) or { voices:[urls] } (pyannote diarization + per-speaker isolate). Not yet deployed →
 *  returns { ok:false } so the caller can fall back to quickStems and tell the user. */
export async function separateStemsCloud(url: string, mode: '4stem' | 'voices'): Promise<CloudStemResult> {
  try {
    const res = await fetch('/api/crossover/stems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mode }),
    });
    if (!res.ok) return { ok: false, message: `stems endpoint ${res.status}` };
    const j = await res.json();
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || 'Crossover stems tier unavailable' };
  }
}
