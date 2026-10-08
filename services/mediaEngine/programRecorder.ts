// mediaEngine/programRecorder.ts — record any output stream to a WebM blob.
//
// Unlike a bare MediaRecorder.stop(), stop() here resolves only after the final
// `dataavailable` has fired, so the last second of the recording is never lost.

export interface RecorderOptions {
  /** Called with each chunk as it records (for durable/cloud sinks). */
  onData?: (chunk: Blob) => void;
  videoBitsPerSecond?: number;
  timesliceMs?: number;
}

export function pickRecorderMime(hasVideo = true): string {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* */ }
  }
  return hasVideo ? 'video/webm' : 'audio/webm';
}

export class ProgramRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private _startedAt = 0;

  get recording() { return !!this.rec && this.rec.state !== 'inactive'; }
  get startedAt() { return this._startedAt; }

  start(stream: MediaStream, opts: RecorderOptions = {}) {
    if (this.recording) return;
    const mimeType = pickRecorderMime(stream.getVideoTracks().length > 0);
    this.chunks = [];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.videoBitsPerSecond ?? 6_000_000 });
    rec.ondataavailable = e => {
      if (e.data && e.data.size) { this.chunks.push(e.data); opts.onData?.(e.data); }
    };
    rec.start(opts.timesliceMs ?? 1000);
    this.rec = rec;
    this._startedAt = Date.now();
  }

  /** Stop and resolve with the complete recording (null if nothing was captured). */
  stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    return new Promise(resolve => {
      rec.addEventListener('stop', () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || 'video/webm' }) : null;
        this.rec = null;
        this.chunks = [];
        resolve(blob);
      }, { once: true });
      rec.stop();
    });
  }

  get durationSec() { return this._startedAt ? Math.round((Date.now() - this._startedAt) / 1000) : 0; }
}

/** Save a blob to the user's device. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
