// A minimal WebM (Matroska) muxer for encoded video frames (our own): EBML header, Segment with
// Info, one video Track, and Clusters of SimpleBlocks. Enough for a turntable from WebCodecs'
// VideoEncoder, which, unlike MediaRecorder, encodes frames we render ourselves whether or not the
// page is visible.

export interface WebmFrame { data: Uint8Array; timestampMs: number; key: boolean }

type Bytes = Uint8Array;
const cat = (parts: Bytes[]): Bytes => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
function vint(n: number): Bytes { const out = new Uint8Array(8); out[0] = 0x01; for (let i = 6; i >= 0; i--) out[7 - i] = Math.floor(n / 2 ** (8 * i)) & 0xff; return out; } // 8-byte EBML size
const idBytes = (id: number): Bytes => { const b: number[] = []; let x = id; while (x > 0) { b.unshift(x & 0xff); x = Math.floor(x / 256); } return Uint8Array.from(b); };
const el = (id: number, ...body: Bytes[]): Bytes => { const b = cat(body); return cat([idBytes(id), vint(b.length), b]); };
const uint = (n: number): Bytes => { const b: number[] = []; let x = n; do { b.unshift(x & 0xff); x = Math.floor(x / 256); } while (x > 0); return Uint8Array.from(b); };
const float64 = (f: number): Bytes => { const a = new DataView(new ArrayBuffer(8)); a.setFloat64(0, f); return new Uint8Array(a.buffer); };
const str = (s: string): Bytes => new TextEncoder().encode(s);

export function muxWebm(frames: WebmFrame[], width: number, height: number, codec: 'V_VP8' | 'V_VP9'): Blob {
  const duration = frames.length ? frames[frames.length - 1].timestampMs + 1000 / 30 : 0;
  const header = el(0x1a45dfa3, el(0x4286, uint(1)), el(0x42f7, uint(1)), el(0x42f2, uint(4)), el(0x42f3, uint(8)), el(0x4282, str('webm')), el(0x4287, uint(2)), el(0x4285, uint(2)));
  const info = el(0x1549a966, el(0x2ad7b1, uint(1000000)), el(0x4489, float64(duration)), el(0x4d80, str('Plajah')), el(0x5741, str('Plajah')));
  const tracks = el(0x1654ae6b, el(0xae, el(0xd7, uint(1)), el(0x73c5, uint(1)), el(0x83, uint(1)), el(0x86, str(codec)), el(0xe0, el(0xb0, uint(width)), el(0xba, uint(height)))));
  const clusters: Bytes[] = []; let i = 0;
  while (i < frames.length) {
    const t0 = frames[i].timestampMs; const blocks: Bytes[] = [];
    while (i < frames.length && frames[i].timestampMs - t0 < 30000 && (blocks.length === 0 || !frames[i].key)) {
      const f = frames[i]; const rel = Math.round(f.timestampMs - t0); blocks.push(el(0xa3, Uint8Array.from([0x81, (rel >> 8) & 0xff, rel & 0xff, f.key ? 0x80 : 0x00]), f.data)); i++;
    }
    clusters.push(el(0x1f43b675, el(0xe7, uint(Math.round(t0))), ...blocks));
  }
  const segment = el(0x18538067, info, tracks, ...clusters);
  return new Blob([header, segment] as BlobPart[], { type: 'video/webm' });
}

/** Encode frames drawn by `draw(k)` into a WebM with WebCodecs; null when the browser has no encoder. */
export async function encodeWebm(canvas: HTMLCanvasElement, count: number, fps: number, draw: (k: number) => void): Promise<Blob | null> {
  const VE = (globalThis as unknown as { VideoEncoder?: typeof VideoEncoder }).VideoEncoder; if (!VE) return null;
  const w = canvas.width - (canvas.width % 2), h = canvas.height - (canvas.height % 2);
  const tries: Array<[string, 'V_VP9' | 'V_VP8']> = [['vp09.00.10.08', 'V_VP9'], ['vp8', 'V_VP8']]; let pick: [string, 'V_VP9' | 'V_VP8'] | null = null;
  for (const t of tries) { try { const s = await VE.isConfigSupported({ codec: t[0], width: w, height: h, bitrate: 8e6, framerate: fps }); if (s.supported) { pick = t; break; } } catch { /* next */ } }
  if (!pick) return null;
  const frames: WebmFrame[] = []; let err: unknown = null;
  const enc = new VE({ output: (chunk: EncodedVideoChunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); frames.push({ data: d, timestampMs: chunk.timestamp / 1000, key: chunk.type === 'key' }); }, error: e => { err = e; } });
  enc.configure({ codec: pick[0], width: w, height: h, bitrate: 8e6, framerate: fps });
  // Encoders need even dimensions: copy each frame into an even-sized canvas.
  const even = document.createElement('canvas'); even.width = w; even.height = h; const g = even.getContext('2d')!;
  for (let k = 0; k < count; k++) { draw(k); g.drawImage(canvas, 0, 0, w, h, 0, 0, w, h); const vf = new VideoFrame(even, { timestamp: Math.round(k * 1e6 / fps) }); enc.encode(vf, { keyFrame: k % fps === 0 }); vf.close(); if (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0)); }
  await enc.flush(); enc.close(); if (err || !frames.length) return null;
  frames.sort((a, b) => a.timestampMs - b.timestampMs); return muxWebm(frames, w, h, pick[1]);
}
