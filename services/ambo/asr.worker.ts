/// <reference lib="webworker" />
// asr.worker — on-device Whisper, off the main thread.
//
// Model downloads, log-mel feature extraction and ONNX inference all happen here, so the
// UI never stalls and — more importantly — the audio capture callbacks keep running on
// time while a pass is in flight (a blocked main thread drops mic audio, which read as
// "the model can't hear anything").
//
// Protocol:
//   main → worker  { type:'load', plan, id }                       → { type:'loaded', id, warmMs } | { type:'loadError', id, error }
//                  { type:'transcribe', id, tier, pcm, timestamps, background } → { type:'result', id, text, chunks, ms } | { type:'error', id, error }
//   worker → main  { type:'progress', id, file, progress }  (while loading)

import { loadTier, transcribe, type AsrLoadPlan } from './asrCore';

const post = (m: any, transfer?: Transferable[]) => (self as any).postMessage(m, transfer || []);

self.onmessage = async (e: MessageEvent) => {
  const m = e.data || {};
  if (m.type === 'load') {
    const plan = m.plan as AsrLoadPlan;
    try {
      const { warmMs } = await loadTier(plan, (file, progress) => post({ type: 'progress', id: m.id, file, progress }));
      post({ type: 'loaded', id: m.id, warmMs });
    } catch (err) {
      post({ type: 'loadError', id: m.id, error: String((err as Error)?.message || err) });
    }
    return;
  }
  if (m.type === 'transcribe') {
    try {
      const r = await transcribe(String(m.tier), m.pcm as Float32Array, { timestamps: !!m.timestamps, background: !!m.background });
      post({ type: 'result', id: m.id, text: r.text, chunks: r.chunks, ms: r.ms });
    } catch (err) {
      post({ type: 'error', id: m.id, error: String((err as Error)?.message || err) });
    }
  }
};

post({ type: 'hello' });
