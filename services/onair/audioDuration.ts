// Real song lengths for the Plajah FM station clock, read from the file header with a small byte-range
// fetch — no ffprobe, no full download. The station's satellite positioning (services/radioEngine) is
// only as good as these numbers: uploads never stored a duration, and a 3-minute guess for every song
// made the clock change "slots" every 3 minutes regardless of what was really playing.
//
// Handles the two formats in the catalogue: WAV (RIFF fmt + data chunk → exact) and MP3 (Xing/Info or
// VBRI frame count → exact for VBR; otherwise CBR from the first frame's bitrate and the file size).

const MP3_BITRATES: Record<string, number[]> = {
  // [version][layer] tables, kbps; index 0 = free, 15 = bad
  'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  'V1L2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  'V2L1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  'V2L2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Size of a leading ID3v2 tag (0 when none) — tags with embedded cover art can be megabytes. */
export function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0; // "ID3"
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const footer = (b[5] & 0x10) ? 10 : 0;
  return 10 + size + footer;
}

/** WAV: seconds from the fmt byte rate and the data chunk size. `totalBytes` covers a 0/0xFFFFFFFF size. */
export function wavDuration(b: Uint8Array, totalBytes?: number): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12, byteRate = 0;
  while (o + 8 <= b.length) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ' && o + 16 <= b.length) byteRate = dv.getUint32(o + 16, true);
    if (id === 'data') {
      if (!byteRate) return null;
      let dataBytes = size;
      if ((!size || size === 0xffffffff) && totalBytes) dataBytes = totalBytes - (o + 8);
      if (totalBytes && o + 8 + dataBytes > totalBytes) dataBytes = totalBytes - (o + 8); // truncated upload
      return dataBytes > 0 ? dataBytes / byteRate : null;
    }
    o += 8 + size + (size & 1);
  }
  return null;
}

/**
 * MP3: `b` starts at (or just before) the first audio frame — i.e. after any ID3v2 tag. `audioBytes` is
 * the file size minus that tag, for the CBR estimate.
 */
export function mp3Duration(b: Uint8Array, audioBytes?: number): number | null {
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const verBits = (b[i + 1] >> 3) & 3;   // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layerBits = (b[i + 1] >> 1) & 3; // 1 = L3, 2 = L2, 3 = L1
    const brIdx = (b[i + 2] >> 4) & 15;
    const srIdx = (b[i + 2] >> 2) & 3;
    if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;
    const v = verBits === 3 ? 'V1' : 'V2';
    const layer = layerBits === 1 ? 3 : layerBits === 2 ? 2 : 1;
    const kbps = MP3_BITRATES[`${v}L${layer}`][brIdx];
    const sampleRate = MP3_RATES[verBits][srIdx];
    const mono = ((b[i + 3] >> 6) & 3) === 3;
    const spf = layer === 1 ? 384 : layer === 2 ? 1152 : verBits === 3 ? 1152 : 576;
    // Sanity: the next frame should start where this one says it ends (rules out a stray 0xFFE).
    const padding = (b[i + 2] >> 1) & 1;
    const frameLen = layer === 1 ? Math.floor((12 * kbps * 1000) / sampleRate + padding) * 4 : Math.floor((spf / 8) * kbps * 1000 / sampleRate) + padding;
    const nxt = i + frameLen;
    if (nxt + 1 < b.length && !(b[nxt] === 0xff && (b[nxt + 1] & 0xe0) === 0xe0)) continue;
    // Xing / Info header (VBR or LAME CBR) sits after the side info.
    const side = verBits === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    const x = i + 4 + side;
    const tag = (o: number) => (o + 4 <= b.length ? String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]) : '');
    if (tag(x) === 'Xing' || tag(x) === 'Info') {
      const flags = (b[x + 4] << 24) | (b[x + 5] << 16) | (b[x + 6] << 8) | b[x + 7];
      if (flags & 1) {
        const frames = ((b[x + 8] << 24) | (b[x + 9] << 16) | (b[x + 10] << 8) | b[x + 11]) >>> 0;
        if (frames > 0) return (frames * spf) / sampleRate;
      }
    }
    const vbri = i + 4 + 32;
    if (tag(vbri) === 'VBRI') {
      const frames = ((b[vbri + 14] << 24) | (b[vbri + 15] << 16) | (b[vbri + 16] << 8) | b[vbri + 17]) >>> 0;
      if (frames > 0) return (frames * spf) / sampleRate;
    }
    if (audioBytes && kbps) return (audioBytes - i) * 8 / (kbps * 1000);
    return null;
  }
  return null;
}

type RangeFetch = (url: string, start: number, end: number) => Promise<{ bytes: Uint8Array; total?: number }>;

/** Default range fetch: one HTTP Range request; total size from Content-Range. */
export const httpRange: RangeFetch = async (url, start, end) => {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(10_000) });
  // 416 on bytes=0-… means the stored file is EMPTY — a song that can never play.
  if (res.status === 416 && start === 0) return { bytes: new Uint8Array(0), total: 0 };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // A server that ignores Range sends the whole file: read only what we asked for.
  const reader = res.body?.getReader();
  const want = end - start + 1;
  const chunks: Uint8Array[] = []; let got = 0;
  if (reader) {
    while (got < want) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value); got += value.length;
    }
    try { await reader.cancel(); } catch { /* */ }
  }
  const bytes = new Uint8Array(Math.min(got, want));
  let o = 0; for (const c of chunks) { const n = Math.min(c.length, bytes.length - o); bytes.set(c.subarray(0, n), o); o += n; if (o >= bytes.length) break; }
  const cr = res.headers.get('content-range');
  const total = cr ? Number(cr.split('/')[1]) : res.status === 200 ? Number(res.headers.get('content-length')) : undefined;
  return { bytes, total: Number.isFinite(total) && total! >= 0 ? total : undefined };
};

/**
 * Seconds of audio in a WAV or MP3 at `url`; 0 when the file is empty (unplayable — the station skips
 * it); null when the header can't be read.
 */
export async function probeDuration(url: string, range: RangeFetch = httpRange): Promise<number | null> {
  const head = await range(url, 0, 65_535);
  const b = head.bytes;
  if (head.total === 0 || (!b.length && head.total === undefined)) return 0;
  const wav = wavDuration(b, head.total);
  if (wav) return wav;
  const id3 = id3v2Size(b);
  if (id3 > 0 && id3 + 4 > b.length) {
    const after = await range(url, id3, id3 + 32_767); // the tag is bigger than the first read (cover art)
    return mp3Duration(after.bytes, head.total ? head.total - id3 : undefined);
  }
  return mp3Duration(b.subarray(id3), head.total ? head.total - id3 : undefined);
}
