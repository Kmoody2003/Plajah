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

/** How the cloud separation is progressing, for callers that want to show more than a spinner. */
export type CloudStemStage = 'queued' | 'fetching' | 'separating' | 'uploading';

/**
 * High-quality separation on the Crossover tier.
 *
 * Demucs takes minutes per song, far longer than any request can stay open, so the contract is
 * asynchronous: POST /api/crossover/stems { url } → 202 { jobId }, then poll
 * GET /api/crossover/stems/job/:jobId until it reports done or error.
 *
 * Returns { ok:false } on any failure — not deployed, not signed in, timed out, worker error —
 * so every caller can fall back to quickStems and tell the user something true.
 */
export async function separateStemsCloud(
  url: string,
  mode: '4stem' | 'voices',
  opts?: { onStage?: (stage: CloudStemStage) => void; signal?: AbortSignal; timeoutMs?: number },
): Promise<CloudStemResult> {
  // The endpoint is behind authMiddleware, which hard-requires a Bearer token.
  const { auth } = await import('../backendService');
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
  if (!token) return { ok: false, message: 'Sign in to use studio separation' };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  let jobId: string;
  try {
    const res = await fetch('/api/crossover/stems', {
      method: 'POST', headers, body: JSON.stringify({ url, mode }), signal: opts?.signal,
    });
    const j = await res.json().catch(() => ({} as any));
    if (!res.ok || !j?.jobId) return { ok: false, message: j?.message || `stems endpoint ${res.status}` };
    jobId = j.jobId;
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || 'Studio separation unavailable' };
  }

  // Cap the wait so a stuck worker surfaces as a clear failure instead of an endless spinner.
  const deadline = Date.now() + (opts?.timeoutMs ?? 15 * 60 * 1000);
  let delay = 2000;
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) return { ok: false, message: 'cancelled' };
    await new Promise(r => setTimeout(r, delay));
    // Back off gently: separation takes minutes, so polling every 2s the whole way is wasteful.
    delay = Math.min(delay * 1.4, 10000);
    try {
      const res = await fetch(`/api/crossover/stems/job/${jobId}`, { headers, signal: opts?.signal });
      if (!res.ok) continue;   // transient — keep polling until the deadline
      const j = await res.json();
      if (j.status === 'done') return { ok: true, vocals: j.vocals, drums: j.drums, bass: j.bass, other: j.other };
      if (j.status === 'error') return { ok: false, message: j.message || 'separation failed' };
      if (j.stage) opts?.onStage?.(j.stage as CloudStemStage);
      else if (j.status === 'queued') opts?.onStage?.('queued');
    } catch (e) {
      if (opts?.signal?.aborted) return { ok: false, message: 'cancelled' };
      /* transient network blip — keep polling */
    }
  }
  return { ok: false, message: 'separation timed out' };
}
