// services/melos/jam/wav.ts — PCM → WAV (the lossless master of a recorded take). Pure.

/** Interleaves channels and writes a RIFF/WAVE file at 16 or 24 bits. */
export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24 = 24): Blob {
  const nCh = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytesPer = bitDepth / 8;
  const dataBytes = frames * nCh * bytesPer;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nCh * bytesPer, true);
  v.setUint16(32, nCh * bytesPer, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  const max = bitDepth === 16 ? 0x7fff : 0x7fffff;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < nCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]?.[f] ?? 0));
      const s = Math.round(x < 0 ? x * (max + 1) : x * max);
      if (bitDepth === 16) {
        v.setInt16(o, s, true);
        o += 2;
      } else {
        v.setUint8(o, s & 0xff);
        v.setUint8(o + 1, (s >> 8) & 0xff);
        v.setUint8(o + 2, (s >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Joins captured blocks into one Float32Array per channel. */
export function concatBlocks(blocks: Float32Array[][], nCh: number): Float32Array[] {
  const total = blocks.reduce((n, b) => n + (b[0]?.length ?? 0), 0);
  const out = Array.from({ length: nCh }, () => new Float32Array(total));
  let at = 0;
  for (const b of blocks) {
    for (let c = 0; c < nCh; c++) out[c].set(b[c] ?? b[0], at);
    at += b[0]?.length ?? 0;
  }
  return out;
}
