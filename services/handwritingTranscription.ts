// handwritingTranscription — on-device handwriting OCR for reading students' completed worksheets.
//
// Tesseract reads PRINT well but not handwriting; this lane adds TrOCR (a transformer handwriting
// recogniser) through the same @huggingface/transformers stack Florence and SlimSAM already use, so
// it stays local-first: no upload, no API key. It is OPTIONAL — like the Florence naming pack — and
// the completed-scan reader degrades honestly to Tesseract + ink-density when it is not installed.
//
// TrOCR is single-line: it wants a tight crop of one line of handwriting. The reader crops each
// answered field's writing area and hands the crops here.

export const TELA_HANDWRITING_MODEL = {
  // small-handwritten (~60 MB) loads fast and is the default; base-handwritten (~330 MB) is the
  // accuracy upgrade. Both are trained on adult cursive (IAM); child print/cursive is still hard,
  // which is why the pre-assessment always keeps a human in the loop.
  id: 'Xenova/trocr-small-handwritten',
  version: 'trocr-small-handwritten/v1',
  approximateBytes: 60 * 1024 * 1024,
  license: 'MIT',
} as const;

export interface HandwritingProgress { phase: 'CHECKING' | 'DOWNLOADING' | 'LOADING' | 'READING' | 'READY'; message: string; progress?: number; }
type ProgressFn = (p: HandwritingProgress) => void;

let pipePromise: Promise<any> | null = null;

export function isHandwritingModelInstalled() {
  try { return localStorage.getItem(`tela:model:${TELA_HANDWRITING_MODEL.version}`) === 'ready'; } catch { return false; }
}

async function usableWebGpu() {
  try { const gpu = (navigator as any)?.gpu; return !!gpu && !!(await gpu.requestAdapter({ powerPreference: 'high-performance' })); } catch { return false; }
}

async function loadPipeline(onProgress?: ProgressFn) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    onProgress?.({ phase: 'CHECKING', message: 'Checking the local handwriting model…' });
    const { pipeline } = await import('@huggingface/transformers');
    const progress_callback = (event: any) => {
      if (event?.status === 'progress') onProgress?.({ phase: 'DOWNLOADING', message: `Downloading handwriting model… ${Math.round(event.progress || 0)}%`, progress: (event.progress || 0) / 100 });
    };
    const hasWebGpu = await usableWebGpu();
    onProgress?.({ phase: 'LOADING', message: `Loading handwriting recognition on ${hasWebGpu ? 'WebGPU' : 'CPU/WASM'}…` });
    let pipe: any;
    try {
      pipe = await pipeline('image-to-text', TELA_HANDWRITING_MODEL.id, { device: hasWebGpu ? 'webgpu' : 'wasm', progress_callback } as any);
    } catch (error) {
      if (hasWebGpu) { console.warn('[handwriting] WebGPU failed; retrying on WASM.', error); pipe = await pipeline('image-to-text', TELA_HANDWRITING_MODEL.id, { device: 'wasm', progress_callback } as any); }
      else throw error;
    }
    try { localStorage.setItem(`tela:model:${TELA_HANDWRITING_MODEL.version}`, 'ready'); } catch { /* private mode */ }
    onProgress?.({ phase: 'READY', message: 'Handwriting recognition ready on this device.', progress: 1 });
    return pipe;
  })().catch(error => { pipePromise = null; throw error; });
  return pipePromise;
}

/** Rough 0..1 confidence from the transcription's shape — TrOCR gives no score, and child
 *  handwriting is inherently uncertain, so this is deliberately conservative (keeps a human in
 *  the loop). Empty or symbol-heavy reads score low; clean alphanumeric reads score moderate. */
function readConfidence(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const alpha = (t.match(/[A-Za-z0-9]/g) || []).length;
  const ratio = alpha / t.length;
  const lengthOk = t.length >= 1 && t.length <= 80;
  // Deliberately capped BELOW the pre-assessment's auto-score threshold (0.5): handwriting OCR —
  // even when it looks clean — can be a confident hallucination, and shape alone can't tell the
  // difference. So a photographed paper's answers are always SUGGESTIONS the teacher verifies,
  // never authoritative auto-grades. Typed digital answers (high confidence) still auto-grade.
  return Math.max(0.12, Math.min(0.48, ratio * (lengthOk ? 0.48 : 0.3)));
}

/** Transcribe one cropped line of handwriting. Returns '' + 0 on failure. */
export async function transcribeHandwritingCrop(dataUrl: string, onProgress?: ProgressFn): Promise<{ text: string; confidence: number }> {
  try {
    const pipe = await loadPipeline(onProgress);
    onProgress?.({ phase: 'READING', message: 'Reading handwriting…' });
    const out = await pipe(dataUrl);
    const text = String(Array.isArray(out) ? out[0]?.generated_text : out?.generated_text || '').trim();
    return { text, confidence: readConfidence(text) };
  } catch (error) {
    console.warn('[handwriting] transcription failed.', error);
    return { text: '', confidence: 0 };
  }
}

/** Transcribe many field crops sequentially (the model is single-stream); reports progress. */
export async function transcribeHandwritingCrops(
  crops: Array<{ id: string; dataUrl: string }>,
  onProgress?: ProgressFn,
): Promise<Record<string, { text: string; confidence: number }>> {
  const results: Record<string, { text: string; confidence: number }> = {};
  await loadPipeline(onProgress);
  for (let i = 0; i < crops.length; i++) {
    onProgress?.({ phase: 'READING', message: `Reading handwriting ${i + 1}/${crops.length}…`, progress: crops.length ? i / crops.length : 0 });
    results[crops[i].id] = await transcribeHandwritingCrop(crops[i].dataUrl);
  }
  return results;
}
