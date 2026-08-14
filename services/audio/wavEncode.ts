// Shared WAV encoder (PCM 16- or 24-bit, interleaved) — extracted verbatim from
// components/MediaConverter.tsx so Beats, the Spatial Mixer and the converter emit
// byte-identical files from one implementation.

/** Raw bytes variant — for callers that zip/stream the file (e.g. .dawproject embedding). */
export function encodeWavBytes(buffer: AudioBuffer, bitDepth: 16 | 24): ArrayBuffer {
  return encodeWavBuffer(buffer, bitDepth);
}

export function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob {
  return new Blob([encodeWavBuffer(buffer, bitDepth)], { type: 'audio/wav' });
}

function encodeWavBuffer(buffer: AudioBuffer, bitDepth: 16 | 24): ArrayBuffer {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, bytesPer = bitDepth / 8;
  const frames = buffer.length;
  const dataLen = frames * numCh * bytesPer;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPer, true); view.setUint16(32, numCh * bytesPer, true); view.setUint16(34, bitDepth, true);
  ws(36, 'data'); view.setUint32(40, dataLen, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bitDepth === 16) { view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
      else { const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); view.setUint8(off, v & 0xff); view.setUint8(off + 1, (v >> 8) & 0xff); view.setUint8(off + 2, (v >> 16) & 0xff); off += 3; }
    }
  }
  return ab;
}
