// programFrameFeeder — pushes the Master Program Bus into the Windows app's network outputs.
//
// The native ProgramOutputHub hands the page a WebView2 shared buffer with three frame slots
// (program_out_buffer → 'sharedbufferreceived'). Each tick this reads one frame of
// getProgramBusStream() (MediaStreamTrackProcessor), copies it into the next slot as BGRA (WebCodecs
// VideoFrame.copyTo, with a canvas readback as fallback), and posts PROGRAM_OUT_FRAME. Program audio
// (amboAudio.programStream(), post-master) goes as 20 ms chunks of 48 kHz stereo s16.
//
// It runs only while some network output is on (NetworkOutputManager starts/stops it), and it
// follows the program stream when programBus replaces it (canvas resize → new captureStream).

import type { FeedFormat, FrameFeeder } from './networkOutputs';
import { getProgramBusStream } from './programBus';
import { amboAudio } from './amboAudioEngine';

type Webview = {
  postMessage(m: string): void;
  addEventListener(t: string, fn: (e: any) => void): void;
  removeEventListener(t: string, fn: (e: any) => void): void;
  releaseBuffer?(b: ArrayBuffer): void;
};
const webview = (): Webview | null => (typeof window !== 'undefined' ? (window as any).chrome?.webview ?? null : null);
const invoke = (cmd: string, args?: Record<string, unknown>): Promise<any> =>
  (window as any).__plajahMediaEngine?.invoke?.(cmd, args) ?? Promise.resolve(null);

/** Slot ring shared with ProgramOutputHub.Slots: the page writes slot n while native copies n-1. */
export const FEED_SLOTS = 3;
export const nextSlot = (frameNo: number) => frameNo % FEED_SLOTS;

/** Interleave planar float channels to s16 stereo, resampling linearly to 48 kHz when needed. */
export function toS16Stereo48k(planes: Float32Array[], rate: number): Int16Array {
  const L = planes[0], R = planes[1] ?? planes[0];
  const n = L.length;
  const outN = rate === 48000 ? n : Math.floor(n * 48000 / rate);
  const out = new Int16Array(outN * 2);
  const step = rate / 48000;
  for (let i = 0; i < outN; i++) {
    const x = i * step, i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), t = x - i0;
    const l = L[i0] + (L[i1] - L[i0]) * t, r = R[i0] + (R[i1] - R[i0]) * t;
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
  }
  return out;
}

export function base64OfBytes(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

export interface FeederStats { frames: number; path: 'copyTo' | 'canvas' | 'none'; lastError?: string; width: number; height: number; hasProgram: boolean }

export class ProgramFrameFeeder implements FrameFeeder {
  running = false;
  stats: FeederStats = { frames: 0, path: 'none', width: 0, height: 0, hasProgram: false };
  private fmt: FeedFormat | null = null;
  private buffer: ArrayBuffer | null = null;
  private gen = -1;
  private slotBytes = 0;
  private frameNo = 0;
  private stream: MediaStream | null = null;
  private reader: ReadableStreamDefaultReader<any> | null = null;
  private audioReader: ReadableStreamDefaultReader<any> | null = null;
  private watch: number | null = null;
  private lastSentAt = 0;
  private scratch: OffscreenCanvas | null = null;
  private copyToBroken = false;
  private onBuffer = (e: any) => {
    const meta = e?.additionalData;
    if (!meta || meta.kind !== 'plajah-program-out') return;
    const wv = webview();
    if (this.buffer && wv?.releaseBuffer) { try { wv.releaseBuffer(this.buffer); } catch { /* */ } }
    this.buffer = e.getBuffer();
    this.gen = meta.gen; this.slotBytes = meta.slotBytes;
  };

  start(format: FeedFormat): void {
    const wv = webview();
    if (this.running || !wv) return;
    this.running = true;
    this.fmt = { ...format };
    this.stats = { frames: 0, path: 'none', width: format.width, height: format.height, hasProgram: false };
    wv.addEventListener('sharedbufferreceived', this.onBuffer);
    void invoke('program_out_buffer', { width: format.width, height: format.height }).then(r => {
      if (r && r.success === false) this.stats.lastError = r.error;
    });
    this.follow();
    this.watch = window.setInterval(() => this.follow(), 1000);
    void this.pumpAudio();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.watch !== null) { clearInterval(this.watch); this.watch = null; }
    void this.reader?.cancel().catch(() => {}); this.reader = null;
    void this.audioReader?.cancel().catch(() => {}); this.audioReader = null;
    this.stream = null;
    const wv = webview();
    wv?.removeEventListener('sharedbufferreceived', this.onBuffer);
    if (this.buffer && wv?.releaseBuffer) { try { wv.releaseBuffer(this.buffer); } catch { /* */ } }
    this.buffer = null; this.gen = -1;
  }

  /** (Re)attach to the current program stream — programBus swaps it when the canvas resizes. */
  private follow() {
    const s = getProgramBusStream();
    this.stats.hasProgram = !!s;
    if (s === this.stream) return;
    void this.reader?.cancel().catch(() => {}); this.reader = null;
    this.stream = s;
    const track = s?.getVideoTracks?.()[0];
    const MSTP = (window as any).MediaStreamTrackProcessor;
    if (!track || !MSTP) { if (!MSTP) this.stats.lastError = 'This WebView has no MediaStreamTrackProcessor.'; return; }
    const reader = new MSTP({ track }).readable.getReader();
    this.reader = reader;
    void this.pumpVideo(reader);
  }

  private async pumpVideo(reader: ReadableStreamDefaultReader<any>) {
    while (this.running && this.reader === reader) {
      let r: ReadableStreamReadResult<any>;
      try { r = await reader.read(); } catch { break; }
      if (r.done) break;
      const frame = r.value;
      try {
        const now = performance.now();
        const interval = 1000 / (this.fmt?.fps ?? 30);
        // The bus runs at 60; send at the output rate (a little slack so 30-of-60 never skips to 20).
        if (now - this.lastSentAt >= interval - 4) {
          this.lastSentAt = now;
          await this.send(frame);
        }
      } catch (e: any) { this.stats.lastError = e?.message || String(e); }
      finally { frame.close(); }
    }
  }

  private async send(frame: any) {
    const wv = webview(), fmt = this.fmt;
    if (!wv || !fmt || !this.buffer || this.gen < 0) return;
    const { width: W, height: H } = fmt;
    if (this.slotBytes !== W * H * 4) return; // buffer for an older size is still in flight
    const slot = nextSlot(this.frameNo);
    const view = new Uint8Array(this.buffer, slot * this.slotBytes, this.slotBytes);
    let format: 'BGRA' | 'RGBA' = 'BGRA';
    const sameSize = frame.displayWidth === W && frame.displayHeight === H;
    if (!this.copyToBroken) {
      try {
        // Scale on the GPU first when the bus is a different size than the output format.
        const src = sameSize ? frame : this.scaled(frame, W, H);
        const vf = sameSize ? frame : new (window as any).VideoFrame(src, { timestamp: frame.timestamp });
        try { await vf.copyTo(view, { format: 'BGRA' }); } finally { if (vf !== frame) vf.close(); }
        this.stats.path = 'copyTo';
      } catch {
        this.copyToBroken = true; // older runtime: no format conversion in copyTo
      }
    }
    if (this.copyToBroken) {
      const c = this.scaled(frame, W, H);
      const px = c.getContext('2d')!.getImageData(0, 0, W, H).data;
      view.set(px);
      format = 'RGBA';
      this.stats.path = 'canvas';
    }
    wv.postMessage(JSON.stringify({ type: 'PROGRAM_OUT_FRAME', gen: this.gen, slot, width: W, height: H, format }));
    this.frameNo++;
    this.stats.frames++;
  }

  private scaled(frame: any, W: number, H: number): OffscreenCanvas {
    if (!this.scratch || this.scratch.width !== W || this.scratch.height !== H) this.scratch = new OffscreenCanvas(W, H);
    const ctx = this.scratch.getContext('2d', { willReadFrequently: this.copyToBroken })!;
    // Letterbox: the network output keeps the Program's aspect.
    const fw = frame.displayWidth, fh = frame.displayHeight, k = Math.min(W / fw, H / fh);
    const dw = fw * k, dh = fh * k;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(frame, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return this.scratch;
  }

  private async pumpAudio() {
    const MSTP = (window as any).MediaStreamTrackProcessor;
    const track = amboAudio.programStream()?.getAudioTracks?.()[0];
    const wv = webview();
    if (!MSTP || !track || !wv) return;
    const reader = new MSTP({ track }).readable.getReader();
    this.audioReader = reader;
    let acc: Int16Array[] = []; let accN = 0;
    while (this.running && this.audioReader === reader) {
      let r: ReadableStreamReadResult<any>;
      try { r = await reader.read(); } catch { break; }
      if (r.done) break;
      const ad = r.value;
      try {
        const chs = Math.min(2, ad.numberOfChannels), n = ad.numberOfFrames;
        const planes: Float32Array[] = [];
        for (let c = 0; c < chs; c++) { const p = new Float32Array(n); ad.copyTo(p, { planeIndex: c, format: 'f32-planar' }); planes.push(p); }
        const s16 = toS16Stereo48k(planes, ad.sampleRate);
        acc.push(s16); accN += s16.length;
        if (accN >= 960 * 2) { // ≥ 20 ms
          const all = new Int16Array(accN); let o = 0;
          for (const a of acc) { all.set(a, o); o += a.length; }
          acc = []; accN = 0;
          wv.postMessage(JSON.stringify({ type: 'PROGRAM_OUT_AUDIO', rate: 48000, channels: 2, pcm: base64OfBytes(new Uint8Array(all.buffer)) }));
        }
      } catch { /* skip chunk */ }
      finally { ad.close(); }
    }
  }
}
