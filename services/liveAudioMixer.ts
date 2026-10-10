/**
 * liveAudioMixer — one published audio track built from several sources, so a live participant
 * (host OR guest) can talk OVER whatever they're sharing instead of the share replacing the mic.
 *
 *   mic ─────────────┐
 *   device audio ────┼─► per-source gain ─► master ─► MediaStreamDestination ─► rtc.publishExternalAudio
 *   play-into-stream ┘        (media ducks under the voice when ducking is on)
 *
 * Sources:
 *   • mic           — the session's own mic track (never stopped here; rtcCore owns it).
 *   • device        — system / tab audio via getDisplayMedia (desktop browsers; Chrome on Windows
 *                     shares full system audio, macOS shares a tab). Phone browsers have no
 *                     getDisplayMedia, so `canShareDeviceAudio()` is false there.
 *   • screen        — the audio that came WITH a screen share (composer screen modes).
 *   • media         — "Play into stream": a file / clip the participant plays through OUR player.
 *                     Works on every phone today because the app itself is the player.
 *
 * Media is NOT routed to the local speakers by default: the streamer mic runs without echo
 * cancellation (HQ_AUDIO), so playing it out loud would feed back into the broadcast. `monitor`
 * opts in (headphones).
 */

export type MixSourceId = 'mic' | 'device' | 'screen' | 'media';

export interface MixSourceState {
  id: MixSourceId;
  active: boolean;
  gain: number;          // 0..1.5
  label: string;
}

export function canShareDeviceAudio(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator.mediaDevices as any)?.getDisplayMedia === 'function';
}

const DUCK_LEVEL = 0.35;          // media sits at 35% while the voice is present
const VOICE_THRESHOLD = 0.02;     // RMS above which we treat the mic as "talking"

export class LiveAudioMixer {
  private ctx: AudioContext;
  private dest: MediaStreamAudioDestinationNode;
  private master: GainNode;
  private nodes = new Map<MixSourceId, { src: AudioNode; gain: GainNode; stop?: () => void }>();
  private gains: Record<MixSourceId, number> = { mic: 1, device: 0.8, screen: 0.8, media: 0.7 };
  private micAnalyser: AnalyserNode | null = null;
  private duckTimer = 0;
  private mediaEl: HTMLMediaElement | null = null;
  private monitorNode: GainNode | null = null;
  ducking = true;
  onChange?: () => void;

  constructor() {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    try { this.ctx = new AC({ sampleRate: 48000 }); } catch { this.ctx = new AC(); }
    this.dest = this.ctx.createMediaStreamDestination();
    this.master = this.ctx.createGain();
    this.master.connect(this.dest);
    this.duckTimer = window.setInterval(() => this.duckTick(), 120);
  }

  /** The single mixed track to publish in place of the raw mic. */
  get track(): MediaStreamTrack { return this.dest.stream.getAudioTracks()[0]; }

  /** Must be called from a user gesture on iOS/Safari before audio flows. */
  resume() { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  state(): MixSourceState[] {
    const label: Record<MixSourceId, string> = { mic: 'Mic', device: 'Device audio', screen: 'Screen audio', media: 'Play into stream' };
    return (['mic', 'device', 'screen', 'media'] as MixSourceId[]).map(id => ({ id, active: this.nodes.has(id), gain: this.gains[id], label: label[id] }));
  }

  setGain(id: MixSourceId, g: number) {
    this.gains[id] = Math.max(0, Math.min(1.5, g));
    const n = this.nodes.get(id);
    if (n) n.gain.gain.setTargetAtTime(this.gains[id], this.ctx.currentTime, 0.05);
    this.onChange?.();
  }

  /** Attach a track as a source (replaces any previous one with the same id). */
  setTrack(id: MixSourceId, track: MediaStreamTrack | null, stop?: () => void) {
    this.remove(id);
    if (!track || track.readyState !== 'live') { this.onChange?.(); return; }
    const src = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.wire(id, src, stop);
    if (id === 'mic') {
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      src.connect(this.micAnalyser);
    }
    track.addEventListener('ended', () => { if (this.nodes.get(id)?.src === src) this.remove(id); }, { once: true });
  }

  /** Share the device's own audio (system / tab). Returns false when the platform can't or the
   *  user didn't tick "share audio" in the picker. */
  async shareDeviceAudio(): Promise<boolean> {
    if (!canShareDeviceAudio()) return false;
    this.resume();
    try {
      const disp: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,  // required by every browser's picker; dropped immediately below
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
      });
      const a = disp.getAudioTracks()[0];
      disp.getVideoTracks().forEach(t => t.stop());
      if (!a) { disp.getTracks().forEach(t => t.stop()); return false; }
      this.setTrack('device', a, () => a.stop());
      return true;
    } catch { return false; }
  }

  /** Play a local file into the stream. Returns the element so the UI can drive play/pause/seek. */
  playMedia(file: Blob): HTMLMediaElement {
    this.stopMedia();
    this.resume();
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio') as HTMLMediaElement;
    el.src = URL.createObjectURL(file);
    el.crossOrigin = 'anonymous';
    (el as any).playsInline = true;
    const src = this.ctx.createMediaElementSource(el);
    const url = el.src;
    this.wire('media', src, () => { el.pause(); URL.revokeObjectURL(url); });
    this.mediaEl = el;
    this.applyMonitor();
    el.play().catch(() => {});
    return el;
  }

  stopMedia() { this.remove('media'); this.mediaEl = null; }
  get media(): HTMLMediaElement | null { return this.mediaEl; }

  /** Hear the shared media locally too (headphones only — no echo cancel on the stream mic). */
  setMonitor(on: boolean) {
    if (on && !this.monitorNode) { this.monitorNode = this.ctx.createGain(); this.monitorNode.connect(this.ctx.destination); }
    if (!on && this.monitorNode) { try { this.monitorNode.disconnect(); } catch { /* */ } this.monitorNode = null; }
    this.applyMonitor();
  }
  get monitoring() { return !!this.monitorNode; }

  remove(id: MixSourceId) {
    const n = this.nodes.get(id);
    if (!n) return;
    try { n.src.disconnect(); n.gain.disconnect(); } catch { /* */ }
    try { n.stop?.(); } catch { /* */ }
    this.nodes.delete(id);
    if (id === 'mic') this.micAnalyser = null;
    this.onChange?.();
  }

  dispose() {
    clearInterval(this.duckTimer);
    (['device', 'screen', 'media'] as MixSourceId[]).forEach(id => this.remove(id));
    this.remove('mic');
    this.ctx.close().catch(() => {});
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private wire(id: MixSourceId, src: AudioNode, stop?: () => void) {
    const gain = this.ctx.createGain();
    gain.gain.value = this.gains[id];
    src.connect(gain).connect(this.master);
    this.nodes.set(id, { src, gain, stop });
    if (id === 'media') this.applyMonitor();
    this.onChange?.();
  }

  private applyMonitor() {
    const m = this.nodes.get('media');
    if (!m) return;
    try { m.gain.disconnect(); } catch { /* */ }
    m.gain.connect(this.master);
    if (this.monitorNode) m.gain.connect(this.monitorNode);
  }

  private buf = new Float32Array(512);
  private duckTick() {
    if (!this.ducking || !this.micAnalyser) return;
    this.micAnalyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const talking = Math.sqrt(sum / this.buf.length) > VOICE_THRESHOLD;
    for (const id of ['device', 'screen', 'media'] as MixSourceId[]) {
      const n = this.nodes.get(id);
      if (!n) continue;
      const target = this.gains[id] * (talking ? DUCK_LEVEL : 1);
      n.gain.gain.setTargetAtTime(target, this.ctx.currentTime, talking ? 0.04 : 0.4);
    }
  }
}
