// Sequenced notes on the Windows app's multi-core engine (rust/plajah-audio-host), streamed back
// into the browser's graph. There is one clock, the AudioContext's: chunks carry the frame they
// were rendered for, so the FX rack, mixer and meters keep working and nothing can drift.
//
//   main thread  --rows--> worker --socket--> NativeAudioBridge.cs --> engine session
//   ring worklet <--chunks-- worker <--socket--
//
// Off unless localStorage 'chora.nativeEngine' is 'on'. Offline bounces never come through here.

import workletUrl from './nativeStream.worklet.js?url';
import workerUrl from './nativeStream.worker.js?worker&url';

/** A note closer than this can't be on time natively (85 ms lead + 21 ms chunk), so the worklet plays it. */
const NATIVE_MIN_AHEAD_SEC = 0.11;

const Op = { AddTrack: 1, RemoveTrack: 2, Param: 3, On: 4, Off: 5, AllOff: 6, Macro: 7, Route: 8, ModWheel: 9, PitchBend: 10, Tempo: 11, Expression: 12 } as const;

export interface NativeStats { missed: number; late: number; chunks: number; minLead: number }

interface WebviewLike {
  postMessage(s: string): void;
  addEventListener(t: 'message', f: (e: { data: unknown }) => void): void;
  removeEventListener(t: 'message', f: (e: { data: unknown }) => void): void;
}

const webview = (): WebviewLike | null => (typeof window !== 'undefined' ? (window as any).chrome?.webview ?? null : null);

function hostOpen(): Promise<{ port: number; token: string } | null> {
  const wv = webview();
  if (!wv) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onMessage = (e: { data: unknown }) => {
      let d: any = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (d?.type !== 'NATIVE_AUDIO_OPEN_RESULT') return;
      wv.removeEventListener('message', onMessage);
      if (!d.available) console.info('[beats] native engine unavailable:', d.error);
      resolve(d.available ? { port: d.port, token: d.token } : null);
    };
    wv.addEventListener('message', onMessage);
    wv.postMessage(JSON.stringify({ type: 'NATIVE_AUDIO_OPEN' }));
    // An older app build never answers.
    setTimeout(() => { wv.removeEventListener('message', onMessage); resolve(null); }, 2000);
  });
}

class NativeSession {
  private rows: number[] = [];
  private nextTrack = 0;
  readonly tracks = new Set<NativeTrack>();
  private dead = false;

  constructor(readonly ctx: AudioContext, readonly worker: Worker) {
    worker.addEventListener('message', (e) => {
      if (e.data?.type === 'closed') this.close();
    });
  }

  row(op: number, track: number, a = 0, b = 0, c = 0, d = 0, e = 0): void {
    if (this.dead) return;
    if (!this.rows.length) queueMicrotask(() => this.flush());
    this.rows.push(op, track, a, b, c, d, e);
  }

  private flush(): void {
    const rows = Float64Array.from(this.rows).buffer;
    this.rows = [];
    this.worker.postMessage({ type: 'rows', rows }, [rows]);
  }

  addTrack(): number {
    this.row(Op.AddTrack, 0);
    return this.nextTrack++;
  }

  /** The engine or its socket went away: every track falls back to its worklet. */
  private close(): void {
    this.dead = true;
    for (const t of [...this.tracks]) t.lost();
    sessions.delete(this.ctx);
    this.worker.terminate();
  }
}

/** One instrument's mirror on the native engine. */
export class NativeTrack {
  private readonly voices = new Set<number>();
  private readonly chunks: MessageChannel;
  private onLost: () => void = () => {};
  /** Latest figures from the ring: frames missed or late are native dropouts. */
  stats: NativeStats = { missed: 0, late: 0, chunks: 0, minLead: 0 };
  /** Notes sent to the engine, for the lab. */
  sentNotes = 0;
  private readonly id: number;
  private readonly ring: AudioWorkletNode;
  private gone = false;

  constructor(private readonly session: NativeSession) {
    this.id = session.addTrack();
    session.tracks.add(this);
    this.ring = new AudioWorkletNode(session.ctx, 'plajah-native-ring', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.ring.port.onmessage = (e) => { this.stats = e.data; };
    this.chunks = new MessageChannel();
    this.ring.port.postMessage({ type: 'wire', port: this.chunks.port1 }, [this.chunks.port1]);
    session.worker.postMessage({ type: 'ring', track: this.id, port: this.chunks.port2 }, [this.chunks.port2]);
  }

  connect(output: AudioNode, analyser: AudioNode | null, onLost: () => void): void {
    this.ring.connect(output);
    if (analyser) this.ring.connect(analyser);
    this.onLost = onLost;
  }

  owns(voiceId: number): boolean {
    return this.voices.has(voiceId);
  }

  offAt(voiceId: number, ctxTime: number): void {
    this.voices.delete(voiceId);
    this.session.row(Op.Off, this.id, voiceId, Math.round(ctxTime * this.session.ctx.sampleRate));
  }

  /** Mirrors one worklet message. True when the note went native only and the worklet must not play it. */
  mirror(m: Record<string, any>): boolean {
    const s = this.session;
    const sr = s.ctx.sampleRate;
    const now = Math.round(s.ctx.currentTime * sr);
    switch (m.type) {
      case 'param': s.row(Op.Param, this.id, m.id, m.value); return false;
      case 'params': for (let i = 0; i < m.ids.length; i++) s.row(Op.Param, this.id, m.ids[i], m.values[i]); return false;
      case 'paramsAt': for (let i = 0; i < m.ids.length; i++) s.row(Op.Param, this.id, m.ids[i], m.values[i]); return false;
      case 'macro': s.row(Op.Macro, this.id, m.index, m.value); return false;
      case 'route': s.row(Op.Route, this.id, m.index, m.source, m.dest, m.depth, m.via); return false;
      case 'modWheel': s.row(Op.ModWheel, this.id, m.value); return false;
      case 'pitchBend': s.row(Op.PitchBend, this.id, m.value); return false;
      case 'tempo': s.row(Op.Tempo, this.id, m.beatsPerSec); return false;
      case 'noteOn': return this.on(m.note, m.velocity, m.voiceId, now + m.frameOffset, now, sr);
      case 'scheduleOn': return this.on(m.note, m.velocity, m.voiceId, m.frame, now, sr);
      case 'noteOff':
      case 'scheduleOff':
        if (!this.voices.has(m.voiceId)) return false;
        this.voices.delete(m.voiceId);
        s.row(Op.Off, this.id, m.voiceId, m.frame ?? now);
        return true;
      case 'expression':
        if (!this.voices.has(m.voiceId)) return false;
        s.row(Op.Expression, this.id, m.voiceId, m.bend, m.pressure, m.timbre);
        return true;
      case 'clearSchedule':
      case 'allNotesOff':
        this.voices.clear();
        s.row(Op.AllOff, this.id, m.hard ? 1 : 0);
        if (m.hard) this.ring.port.postMessage({ type: 'flush' });
        return false;
      default: return false;
    }
  }

  private on(note: number, velocity: number, voiceId: number, frame: number, now: number, sr: number): boolean {
    if (frame - now < NATIVE_MIN_AHEAD_SEC * sr) return false;
    this.voices.add(voiceId);
    this.sentNotes += 1;
    this.session.row(Op.On, this.id, note, velocity, voiceId, frame);
    return true;
  }

  lost(): void {
    this.onLost();
    this.teardown();
  }

  dispose(): void {
    this.session.row(Op.RemoveTrack, this.id);
    this.session.worker.postMessage({ type: 'dropRing', track: this.id });
    this.teardown();
  }

  private teardown(): void {
    if (this.gone) return;
    this.gone = true;
    this.session.tracks.delete(this);
    try { this.ring.disconnect(); } catch { /* already detached */ }
    this.ring.port.postMessage({ type: 'dispose' });
  }
}

const sessions = new Map<BaseAudioContext, Promise<NativeSession | null>>();

async function openSession(ctx: AudioContext): Promise<NativeSession | null> {
  const host = await hostOpen();
  if (!host) return null;
  await ctx.audioWorklet.addModule(workletUrl);
  const worker = new Worker(workerUrl, { type: 'module' });
  const opened = new Promise<boolean>((resolve) => {
    worker.addEventListener('error', () => resolve(false));
    setTimeout(() => resolve(false), 3000);
    worker.addEventListener('message', (e) => {
      if (e.data?.type === 'open') resolve(true);
      else if (e.data?.type === 'closed') resolve(false);
    });
  });
  worker.postMessage({ type: 'open', url: `ws://127.0.0.1:${host.port}/?t=${host.token}&sr=${ctx.sampleRate}` });
  if (!(await opened)) {
    worker.terminate();
    return null;
  }
  const clock = new AudioWorkletNode(ctx, 'plajah-native-clock', { numberOfInputs: 0, numberOfOutputs: 1 });
  const mute = ctx.createGain();
  mute.gain.value = 0;
  clock.connect(mute).connect(ctx.destination); // connected, so it is pulled even when nothing else plays
  const wire = new MessageChannel();
  clock.port.onmessage = (e) => wire.port1.postMessage(e.data);
  worker.postMessage({ type: 'clock', port: wire.port2 }, [wire.port2]);
  return new NativeSession(ctx, worker);
}

export function nativeEngineEnabled(): boolean {
  try { return !!webview() && localStorage.getItem('chora.nativeEngine') === 'on'; } catch { return false; }
}

/** A new native track on this context, or null when the worklets should do it all. */
export async function openNativeTrack(ctx: BaseAudioContext): Promise<NativeTrack | null> {
  if (!nativeEngineEnabled() || !(ctx instanceof AudioContext)) return null;
  let session = sessions.get(ctx);
  if (!session) {
    session = openSession(ctx).catch((e) => {
      console.warn('[beats] native engine failed to open', e);
      return null;
    });
    sessions.set(ctx, session);
  }
  const s = await session;
  return s ? new NativeTrack(s) : null;
}
