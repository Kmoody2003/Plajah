// services/melos/jam/jamSession.ts — playing and recording together in a shared Chora project.
//
// The project document itself syncs through services/coedit (clips, notes, mixer…). This is the
// performance layer on top: a low-latency rtcCore mesh between everyone in the session that carries
//   • live MIDI from anyone's shared controller, timestamped and clock-corrected so every machine
//     plays the note through the track's instrument at the same musical moment;
//   • live audio from anyone's shared input (interface, mic, instrument), Opus at up to 192 kbps that
//     WebRTC adapts to each link — the "collab" quality;
//   • transport (play / stop / position / tempo) and "who is recording on which track".
//
// A take is recorded twice on the player's machine at the same time: a lossless 24-bit WAV (the
// master, never leaves at lower quality) and a ~96 kbps Opus proxy. Committing a take contributes
// both to the project's asset ledger (services/coedit/assets.ts): the proxy lands in seconds, the
// master syncs behind it and replaces it everywhere ("adaptive until the file syncs").
//
// Two ways to record:
//   live   — others hear it as it's played and the clip appears for everyone the moment you stop;
//   commit — record privately (as many takes as you like); "Commit take" shares the one you keep.

import { RtcSession, type RtcParticipant } from '../../rtcCore';
import { auth } from '../../firebase';
import { concatBlocks, encodeWav } from './wav';
import { JAM_JITTER_MS, bestOffset, clockSample, jamNow, localPlayTime, type ClockSample } from './clock';

export { JAM_JITTER_MS, jamNow };

export type RecordMode = 'live' | 'commit';

export interface JamMidiEvent {
  trackId: string;
  /** Raw MIDI bytes (status, data1, data2). */
  data: number[];
  /** Sender's clock (ms, performance-based wall time). */
  t: number;
}

export interface JamTransport {
  playing: boolean;
  /** Song position in beats at `at` (sender's clock). */
  beat: number;
  bpm: number;
  at: number;
}

export interface JamRecordingState {
  trackId: string;
  takeId: string;
  mode: RecordMode;
  state: 'recording' | 'stopped' | 'committed' | 'discarded';
  startBeat?: number;
  at: number;
}

export interface JamEvents {
  /** A remote MIDI event, with the local time it should sound (already clock-corrected). */
  onMidi?: (peerId: string, ev: JamMidiEvent, playAt: number) => void;
  onTransport?: (peerId: string, t: JamTransport, localAt: number) => void;
  onRemoteAudio?: (peerId: string, stream: MediaStream | null) => void;
  onRecording?: (peerId: string, r: JamRecordingState) => void;
  onPeers?: (peers: RtcParticipant[]) => void;
  onError?: (err: Error) => void;
  /** A control message addressed to this user (someone armed / recorded on one of your inputs). */
  onControl?: (peerId: string, c: JamControl) => void;
}

/**
 * Asking an input's owner to act on it: 'arm' = stream it into the session for my track, 'disarm' =
 * I'm done with it, 'rec-start'/'rec-stop' = record a take on it (the owner records the lossless
 * master locally — the stream everyone hears is only the collab copy).
 */
export interface JamControl {
  kind: 'arm' | 'disarm' | 'rec-start' | 'rec-stop';
  /** The input owner's uid. */
  to: string;
  inputId: string;
  trackId: string;
  byName?: string;
  mode?: RecordMode;
  startBeat?: number;
}


export class JamSession {
  private rtc: RtcSession | null = null;
  private ctx: AudioContext | null = null;
  private silent: MediaStreamTrack | null = null;
  private inputStream: MediaStream | null = null;
  private offsets = new Map<string, ClockSample[]>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  readonly sessionId: string;
  private readonly selfId = auth.currentUser?.uid ?? `guest_${Math.random().toString(36).slice(2, 8)}`;

  constructor(projectId: string, private events: JamEvents = {}) {
    this.sessionId = `jam_${projectId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 140);
  }

  async join() {
    if (this.rtc) return;
    // Join with a silent track (no mic prompt); a shared input is swapped in when someone plays.
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const dest = this.ctx.createMediaStreamDestination();
    this.silent = dest.stream.getAudioTracks()[0];
    this.rtc = new RtcSession(
      {
        sessionId: this.sessionId,
        selfId: this.selfId,
        topology: 'mesh',
        role: 'participant',
        localStream: new MediaStream([this.silent]),
        displayName: auth.currentUser?.displayName || 'Collaborator',
        audioBitrate: 192_000,
        liveness: true,
      },
      {
        onRemoteStream: (peer, stream) => this.events.onRemoteAudio?.(peer, stream),
        onPeerLeft: (peer) => {
          this.offsets.delete(peer);
          this.events.onRemoteAudio?.(peer, null);
        },
        onParticipants: (p) => this.events.onPeers?.(p),
        onData: (peer, msg) => this.onData(peer, msg.type, msg.payload),
        onError: (e) => this.events.onError?.(e),
      }
    );
    await this.rtc.join();
    this.pingTimer = setInterval(() => this.rtc?.sendData('jam:ping', { t0: jamNow() }), 2000);
  }

  async leave() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    await this.streamInput(null);
    await this.rtc?.leave();
    this.rtc = null;
    this.silent?.stop();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private onData(peer: string, type: string, payload: any) {
    switch (type) {
      case 'jam:ping':
        this.rtc?.sendData('jam:pong', { t0: payload?.t0, t1: jamNow(), to: peer });
        return;
      case 'jam:pong': {
        if (payload?.to !== this.selfId) return; // a reply to someone else's ping
        const sample = clockSample(Number(payload.t0), Number(payload.t1), jamNow());
        if (!sample) return;
        const s = [...(this.offsets.get(peer) ?? []), sample].slice(-12);
        this.offsets.set(peer, s);
        return;
      }
      case 'jam:midi': {
        const ev = payload as JamMidiEvent;
        this.events.onMidi?.(peer, ev, localPlayTime(ev.t, bestOffset(this.offsets.get(peer) ?? []), jamNow()));
        return;
      }
      case 'jam:transport': {
        const t = payload as JamTransport;
        this.events.onTransport?.(peer, t, t.at - bestOffset(this.offsets.get(peer) ?? []));
        return;
      }
      case 'jam:rec':
        this.events.onRecording?.(peer, payload as JamRecordingState);
        return;
      case 'jam:ctl': {
        const c = payload as JamControl;
        if (c?.to === this.selfId) this.events.onControl?.(peer, c);
        return;
      }
    }
  }

  /** Ask an input's owner to stream / stop / record it (delivered only to `c.to`). */
  sendControl(c: Omit<JamControl, 'byName'>) {
    this.rtc?.sendData('jam:ctl', { ...c, byName: auth.currentUser?.displayName || 'Collaborator' } satisfies JamControl);
  }

  get uid() {
    return this.selfId;
  }

  get joined() {
    return !!this.rtc;
  }

  /** Sends a MIDI event from a shared controller (play it locally yourself at `t + JAM_JITTER_MS`). */
  sendMidi(trackId: string, data: number[], t = jamNow()) {
    this.rtc?.sendData('jam:midi', { trackId, data: [...data].slice(0, 3), t } satisfies JamMidiEvent);
  }

  sendTransport(t: Omit<JamTransport, 'at'>) {
    this.rtc?.sendData('jam:transport', { ...t, at: jamNow() } satisfies JamTransport);
  }

  announceRecording(r: Omit<JamRecordingState, 'at'>) {
    this.rtc?.sendData('jam:rec', { ...r, at: jamNow() } satisfies JamRecordingState);
  }

  /**
   * Streams one of your audio inputs to everyone (null stops). Music profile: no echo cancellation,
   * noise suppression or auto-gain, 48 kHz — the full instrument, not a phone-call voice.
   */
  async streamInput(deviceId: string | null): Promise<MediaStream | null> {
    this.inputStream?.getTracks().forEach((t) => t.stop());
    this.inputStream = null;
    if (!deviceId) {
      if (this.silent) await this.rtc?.publishExternalAudio(this.silent);
      return null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: { ideal: 2 } },
    });
    this.inputStream = stream;
    await this.rtc?.publishExternalAudio(stream.getAudioTracks()[0]);
    return stream;
  }

  get liveInput() {
    return this.inputStream;
  }
}

// ── recording a take (lossless master + collab proxy at once) ───────────────

const CAPTURE_WORKLET = `
class JamCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) this.port.postMessage(input.map((c) => c.slice(0)));
    return true;
  }
}
registerProcessor('jam-capture', JamCapture);
`;

export interface TakeResult {
  takeId: string;
  master: Blob;
  proxy: Blob | null;
  durationSec: number;
  sampleRate: number;
  channels: number;
}

/** Records a stream: 24-bit WAV master via an AudioWorklet + ~96 kbps Opus proxy via MediaRecorder. */
export class TakeRecorder {
  readonly takeId = `take_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private blocks: Float32Array[][] = [];
  private nCh = 1;
  private rec: MediaRecorder | null = null;
  private proxyParts: Blob[] = [];
  private startedAt = 0;

  constructor(private stream: MediaStream) {}

  async start() {
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.nCh = Math.min(2, Math.max(1, src.channelCount));
    this.node = new AudioWorkletNode(this.ctx, 'jam-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: this.nCh, channelCountMode: 'explicit' });
    this.node.port.onmessage = (e) => this.blocks.push(e.data as Float32Array[]);
    src.connect(this.node);
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (mime) {
      this.rec = new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 96_000 });
      this.rec.ondataavailable = (e) => e.data.size && this.proxyParts.push(e.data);
      this.rec.start(1000);
    }
    this.startedAt = jamNow();
  }

  async stop(): Promise<TakeResult> {
    const proxyDone = this.rec
      ? new Promise<void>((r) => {
          this.rec!.onstop = () => r();
          this.rec!.stop();
        })
      : Promise.resolve();
    this.node?.disconnect();
    await proxyDone;
    const sampleRate = this.ctx?.sampleRate ?? 48000;
    await this.ctx?.close().catch(() => {});
    const pcm = concatBlocks(this.blocks, this.nCh);
    this.blocks = [];
    return {
      takeId: this.takeId,
      master: encodeWav(pcm, sampleRate, 24),
      proxy: this.proxyParts.length ? new Blob(this.proxyParts, { type: this.proxyParts[0].type || 'audio/webm' }) : null,
      durationSec: (pcm[0]?.length ?? 0) / sampleRate || (jamNow() - this.startedAt) / 1000,
      sampleRate,
      channels: this.nCh,
    };
  }
}
