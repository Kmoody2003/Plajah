// mixEngine.ts — the live-radio master bus. Every source (host mic, callers, soundboard, ads, music
// bed) is a named channel with gain + mute + a meter; they sum into a master that feeds (a) the
// recorder + the live-publish track and (b) the monitor. Auto-ducking lowers host/callers under ads
// & soundboard cues. This single mixed stream is both what gets recorded into the episode and what
// gets broadcast live.

export interface ChannelHandle {
  id: string;
  label: string;
  gain: GainNode;
  analyser: AnalyserNode;
  muted: boolean;
  baseGain: number;       // the user-set level (duck multiplies this)
  duckable: boolean;      // host + callers duck under cues; ads/soundboard don't
}

export class MixEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private monitor: GainNode;
  private channels = new Map<string, ChannelHandle>();
  private sources = new Map<string, AudioNode>();   // active source per channel (for disconnect)
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private ducked = false;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.dest = this.ctx.createMediaStreamDestination();
    this.monitor = this.ctx.createGain(); this.monitor.gain.value = 1;
    this.master.connect(this.dest);                 // → recorder + live publish
    this.master.connect(this.monitor); this.monitor.connect(this.ctx.destination); // → headphones
  }

  // ── Channels ───────────────────────────────────────────────────────────────────
  addChannel(id: string, label: string, opts: { gain?: number; duckable?: boolean } = {}): ChannelHandle {
    let ch = this.channels.get(id);
    if (ch) return ch;
    const gain = this.ctx.createGain(); gain.gain.value = opts.gain ?? 1;
    const analyser = this.ctx.createAnalyser(); analyser.fftSize = 256;
    gain.connect(analyser); analyser.connect(this.master);
    ch = { id, label, gain, analyser, muted: false, baseGain: opts.gain ?? 1, duckable: opts.duckable ?? false };
    this.channels.set(id, ch);
    return ch;
  }
  removeChannel(id: string): void {
    this.disconnectSource(id);
    const ch = this.channels.get(id);
    if (ch) { try { ch.gain.disconnect(); ch.analyser.disconnect(); } catch { /* */ } this.channels.delete(id); }
  }

  /** Route a MediaStream (mic / caller) into a channel. */
  connectStream(id: string, stream: MediaStream, label = id): ChannelHandle {
    const ch = this.addChannel(id, label, { duckable: true });
    this.disconnectSource(id);
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(ch.gain); this.sources.set(id, src);
    return ch;
  }
  /** Route an arbitrary node (soundboard pad / ad player) into a channel. */
  connectNode(id: string, node: AudioNode, label = id): ChannelHandle {
    const ch = this.addChannel(id, label, { duckable: false });
    node.connect(ch.gain);
    return ch;
  }
  private disconnectSource(id: string): void {
    const s = this.sources.get(id);
    if (s) { try { s.disconnect(); } catch { /* */ } this.sources.delete(id); }
  }

  setGain(id: string, v: number): void { const ch = this.channels.get(id); if (ch) { ch.baseGain = v; if (!ch.muted) ch.gain.gain.value = v * (this.ducked && ch.duckable ? 0.25 : 1); } }
  setMute(id: string, m: boolean): void { const ch = this.channels.get(id); if (ch) { ch.muted = m; ch.gain.gain.value = m ? 0 : ch.baseGain; } }
  /** 0..1 RMS level for the channel's meter. */
  meter(id: string): number {
    const ch = this.channels.get(id); if (!ch) return 0;
    const buf = new Uint8Array(ch.analyser.fftSize);
    ch.analyser.getByteTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / buf.length) * 2.2);
  }
  listChannels(): ChannelHandle[] { return [...this.channels.values()]; }

  // ── Ducking (cue/ad sidechain) ───────────────────────────────────────────────────
  duck(on: boolean, ms = 180): void {
    this.ducked = on;
    const t = this.ctx.currentTime, dt = ms / 1000;
    for (const ch of this.channels.values()) {
      if (!ch.duckable || ch.muted) continue;
      ch.gain.gain.cancelScheduledValues(t);
      ch.gain.gain.linearRampToValueAtTime(ch.baseGain * (on ? 0.25 : 1), t + dt);
    }
  }

  // ── Output / recording ───────────────────────────────────────────────────────────
  /** The mixed master as a MediaStream — feed to a live publisher (rtcCore) or another sink. */
  get outputStream(): MediaStream { return this.dest.stream; }

  async addMic(deviceId?: string): Promise<ChannelHandle> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } });
    return this.connectStream('host', stream, 'Host Mic');
  }

  startRecording(): void {
    if (this.recorder) return;
    this.recChunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.recorder = new MediaRecorder(this.dest.stream, { mimeType: mime });
    this.recorder.ondataavailable = e => { if (e.data.size > 0) this.recChunks.push(e.data); };
    this.recorder.start(1000);
  }
  stopRecording(): Promise<Blob> {
    return new Promise(resolve => {
      const rec = this.recorder;
      if (!rec) { resolve(new Blob([], { type: 'audio/webm' })); return; }
      rec.onstop = () => { this.recorder = null; resolve(new Blob(this.recChunks, { type: 'audio/webm' })); };
      try { rec.stop(); } catch { this.recorder = null; resolve(new Blob(this.recChunks, { type: 'audio/webm' })); }
    });
  }
  get isRecording(): boolean { return !!this.recorder; }

  async resume(): Promise<void> { try { await this.ctx.resume(); } catch { /* */ } }
  dispose(): void {
    try { this.recorder?.stop(); } catch { /* */ }
    this.sources.forEach(s => { try { s.disconnect(); } catch { /* */ } });
    try { this.ctx.close(); } catch { /* */ }
  }
}
