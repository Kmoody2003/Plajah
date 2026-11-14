// MEKA Sampler — capture glue. Streams PCM blocks from an audio input (any device) or from MEKA's
// own master output (resampling) into a TakeRecorder, through a tiny AudioWorklet so nothing is
// dropped. Runs in the engine's AudioContext; the capture node never reaches the speakers.

import { BeatsEngine } from '../engine/BeatsEngine';
import { TakeRecorder, type TakeOptions } from './takeRecorder';

const WORKLET = `
class MekaTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0];
    if (ch && ch.length) this.port.postMessage(ch.map((c) => c.slice()));
    return true;
  }
}
registerProcessor('meka-sampler-tap', MekaTap);
`;
const loaded = new WeakSet<BaseAudioContext>();

export type CaptureSource = { kind: 'input'; deviceId?: string } | { kind: 'internal' };

export interface Capture {
  recorder: TakeRecorder;
  stop: () => void;
}

/** Audio inputs the browser can see (labels appear once mic permission is granted). */
export async function listInputs(): Promise<{ id: string; label: string }[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
  } catch { return []; }
}

export async function startCapture(source: CaptureSource, opts: Omit<TakeOptions, 'sampleRate' | 'channels'>, onBlock?: (r: TakeRecorder) => void): Promise<Capture> {
  const engine = BeatsEngine.get();
  await engine.init();
  const ctx = engine.getContext() as AudioContext | null;
  if (!ctx) throw new Error('Audio is not available');
  if (!loaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    loaded.add(ctx);
  }
  let stream: MediaStream | null = null;
  let src: AudioNode;
  if (source.kind === 'input') {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: source.deviceId ? { exact: source.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
      });
    } catch (e) {
      throw new Error((e as { name?: string })?.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Could not open that input');
    }
    src = ctx.createMediaStreamSource(stream);
  } else {
    const tap = engine.masterMeterTap();
    if (!tap) throw new Error('MEKA’s output isn’t running yet — press play once');
    src = tap.node;
  }
  const node = new AudioWorkletNode(ctx, 'meka-sampler-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
  const recorder = new TakeRecorder({ ...opts, sampleRate: ctx.sampleRate, channels: 2 });
  let wasRunning = engine.isRunning();
  if (opts.mode === 'sync' && wasRunning) recorder.transportStarted(); // already playing → now
  node.port.onmessage = (e: MessageEvent<Float32Array[]>) => {
    if (opts.mode === 'sync') { const r = engine.isRunning(); if (r && !wasRunning) recorder.transportStarted(); wasRunning = r; }
    recorder.push(e.data);
    onBlock?.(recorder);
    if (recorder.state === 'done') stop();
  };
  src.connect(node);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    recorder.stop();
    try { src.disconnect(node); } catch { /* */ }
    node.port.onmessage = null;
    stream?.getTracks().forEach((t) => t.stop());
  };
  return { recorder, stop };
}
