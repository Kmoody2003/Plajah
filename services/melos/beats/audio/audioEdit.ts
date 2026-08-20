// Audio clip editing — the non-destructive operations behind the Timeline's audio editor.
//
// Every op takes an AudioBuffer + a sample range and returns a NEW AudioBuffer (the original
// stays intact for undo). The editor decodes the clip's OPFS sample once, runs these, and writes
// the result back as a fresh content-addressed sample. Time-stretch lives in timeStretch.ts.

const bufCtx = () => new OfflineAudioContext(2, 1, 48000);

export interface Range { start: number; end: number } // in samples

function makeBuffer(src: AudioBuffer, length: number): AudioBuffer {
  return bufCtx().createBuffer(src.numberOfChannels, Math.max(1, length), src.sampleRate);
}
const clampRange = (r: Range, len: number): Range => ({ start: Math.max(0, Math.min(len, Math.floor(r.start))), end: Math.max(0, Math.min(len, Math.ceil(r.end))) });

/** Normalize the selection (or whole buffer) to a target peak in dBFS. */
export function normalize(buf: AudioBuffer, range?: Range, targetDb = -0.3): AudioBuffer {
  const r = clampRange(range ?? { start: 0, end: buf.length }, buf.length);
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = r.start; i < r.end; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  if (peak < 1e-6) return buf;
  const target = Math.pow(10, targetDb / 20);
  const g = target / peak;
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    for (let i = 0; i < buf.length; i++) d[i] = i >= r.start && i < r.end ? s[i] * g : s[i];
  }
  return out;
}

/** Reverse the selection in place (returns a new buffer). */
export function reverse(buf: AudioBuffer, range?: Range): AudioBuffer {
  const r = clampRange(range ?? { start: 0, end: buf.length }, buf.length);
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    d.set(s);
    for (let i = r.start, j = r.end - 1; i < j; i++, j--) { const t = d[i]; d[i] = d[j]; d[j] = t; }
  }
  return out;
}

/** Gain the selection by dB. */
export function gain(buf: AudioBuffer, db: number, range?: Range): AudioBuffer {
  const r = clampRange(range ?? { start: 0, end: buf.length }, buf.length);
  const g = Math.pow(10, db / 20);
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    for (let i = 0; i < buf.length; i++) d[i] = i >= r.start && i < r.end ? s[i] * g : s[i];
  }
  return out;
}

/** Silence the selection. */
export function silence(buf: AudioBuffer, range: Range): AudioBuffer {
  const r = clampRange(range, buf.length);
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = out.getChannelData(c); d.set(s); for (let i = r.start; i < r.end; i++) d[i] = 0; }
  return out;
}

/** Linear fade in across the selection (or the whole buffer). */
export function fadeIn(buf: AudioBuffer, range?: Range): AudioBuffer {
  const r = clampRange(range ?? { start: 0, end: buf.length }, buf.length);
  const n = Math.max(1, r.end - r.start);
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = out.getChannelData(c); d.set(s); for (let i = r.start; i < r.end; i++) d[i] = s[i] * ((i - r.start) / n); for (let i = 0; i < r.start; i++) d[i] = 0; }
  return out;
}
/** Linear fade out across the selection (or the whole buffer). */
export function fadeOut(buf: AudioBuffer, range?: Range): AudioBuffer {
  const r = clampRange(range ?? { start: 0, end: buf.length }, buf.length);
  const n = Math.max(1, r.end - r.start);
  const out = makeBuffer(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = out.getChannelData(c); d.set(s); for (let i = r.start; i < r.end; i++) d[i] = s[i] * (1 - (i - r.start) / n); for (let i = r.end; i < buf.length; i++) d[i] = 0; }
  return out;
}

/** Trim to the selection — everything outside is removed (the crop op). */
export function crop(buf: AudioBuffer, range: Range): AudioBuffer {
  const r = clampRange(range, buf.length);
  const len = Math.max(1, r.end - r.start);
  const out = makeBuffer(buf, len);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(r.start, r.end));
  return out;
}

/** Split a buffer at a sample position → two buffers. */
export function split(buf: AudioBuffer, at: number): [AudioBuffer, AudioBuffer] {
  const p = Math.max(1, Math.min(buf.length - 1, Math.floor(at)));
  return [crop(buf, { start: 0, end: p }), crop(buf, { start: p, end: buf.length })];
}

/** Max-abs peak envelope for drawing (buckets across the buffer). */
export function peaks(buf: AudioBuffer, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const per = Math.max(1, Math.floor(buf.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let p = 0; const s = b * per, e = Math.min(buf.length, s + per);
    for (let i = s; i < e; i += 2) { const a = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i])); if (a > p) p = a; }
    out[b] = p;
  }
  return out;
}

/** Encode an AudioBuffer's channel(s) → a WAV Blob (for writing back to the sample store). */
export async function bufferToWav(buf: AudioBuffer): Promise<Blob> {
  const { encodeWav } = await import('../../../audio/wavEncode');
  return encodeWav(buf, 24);
}
