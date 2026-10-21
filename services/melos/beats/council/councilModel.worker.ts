/// <reference lib="webworker" />
// councilModel.worker — the composer council's on-device model, off the main thread.
//
// Its own worker means its own WebAssembly heap: the studio tab already holds the audio engine,
// samples and the DAW, and loading a 1.5B model next to them ran out of wasm memory
// (std::bad_alloc at session create). Here the model has the heap to itself, generation never
// stalls the audio thread, and terminating the worker gives every byte back.
//
// Protocol:
//   main → worker  { type:'load', id, model, device, dtype }   → { type:'loaded', id } | { type:'loadError', id, error }
//                  { type:'generate', id, messages, maxNewTokens, temperature } → { type:'result', id, text } | { type:'error', id, error }
//   worker → main  { type:'progress', id, file, loaded, total }  (while downloading)

let gen: any = null;
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent) => {
  const m = e.data || {};
  if (m.type === 'load') {
    try {
      const mod: any = await import('@huggingface/transformers');
      gen = await mod.pipeline('text-generation', m.model, {
        ...(m.device ? { device: m.device } : {}),
        dtype: m.dtype,
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && p.total) post({ type: 'progress', id: m.id, file: String(p.file || ''), loaded: p.loaded, total: p.total });
        },
      });
      post({ type: 'loaded', id: m.id });
    } catch (err) {
      gen = null;
      post({ type: 'loadError', id: m.id, error: String((err as Error)?.message || err) });
    }
    return;
  }
  if (m.type === 'generate') {
    try {
      if (!gen) throw new Error('model not loaded');
      const t = typeof m.temperature === 'number' ? m.temperature : 0.7;
      const out = await gen(m.messages, { max_new_tokens: m.maxNewTokens ?? 512, temperature: t, do_sample: t > 0 });
      const content = out?.[0]?.generated_text?.at?.(-1)?.content;
      post({ type: 'result', id: m.id, text: typeof content === 'string' ? content.trim() : String(content ?? '').trim() });
    } catch (err) {
      post({ type: 'error', id: m.id, error: String((err as Error)?.message || err) });
    }
  }
};
