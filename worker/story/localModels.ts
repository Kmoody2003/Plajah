/**
 * Taleo Story Intelligence — tier 3 (fully offline) perception.
 *
 * Runs entirely in THIS container's CPU via @huggingface/transformers (the same library the
 * main app already ships client-side for Tela document intelligence and on-device translation
 * — see services/telaDocumentIntelligence.ts and services/translation/translationEngine.ts).
 * Under Node it uses the onnxruntime-node CPU backend instead of WebGPU/WASM, but the model
 * APIs are identical.
 *
 * Tried only after BOTH cloud tiers (native video, then Gemini audio+stills) have failed or
 * come back empty for a chunk. It has no cloud dependency and no per-call API cost, so it is
 * immune to the Gemini capacity throttling that motivated it — the real tradeoff is quality
 * (no continuous motion understanding, no speaker attribution, weaker scene detail) and
 * latency (CPU inference + a one-time model download per container instance).
 *
 * Whisper gives dialogue with timestamps; Florence-2 gives a caption per still frame. Neither
 * attempts character identification — that stays Pokee's job, reasoning over whatever text
 * this tier can supply.
 */
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { runFfmpeg } from './lib.ts';

const ASR_MODEL = 'onnx-community/whisper-base';
const CAPTION_MODEL = 'onnx-community/Florence-2-base-ft';

let asrPromise: Promise<any> | null = null;
let florencePromise: Promise<{ model: any; processor: any; tokenizer: any }> | null = null;

/** Isolate the HF cache under the container's own tmp so a cold instance's first tier-3 job
 *  pays the (one-time, ~450MB combined) download cost once, then every job on that instance
 *  reuses it — same idea as the demucs worker's model cache. */
function cacheDir(): string {
  const dir = path.join(os.tmpdir(), 'story-worker-model-cache');
  return dir;
}

async function getAsr() {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    const tf: any = await import('@huggingface/transformers');
    tf.env.cacheDir = cacheDir();
    tf.env.allowLocalModels = false;
    console.log('[local-models] loading Whisper (first tier-3 call on this instance)…');
    return tf.pipeline('automatic-speech-recognition', ASR_MODEL, { device: 'cpu' });
  })().catch(e => { asrPromise = null; throw e; });
  return asrPromise;
}

async function getFlorence() {
  if (florencePromise) return florencePromise;
  florencePromise = (async () => {
    const tf: any = await import('@huggingface/transformers');
    tf.env.cacheDir = cacheDir();
    tf.env.allowLocalModels = false;
    console.log('[local-models] loading Florence-2 (first tier-3 call on this instance)…');
    const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer } = tf;
    const dtype = { embed_tokens: 'q8', vision_encoder: 'q8', encoder_model: 'q4', decoder_model_merged: 'q4' };
    const [processor, tokenizer, model] = await Promise.all([
      AutoProcessor.from_pretrained(CAPTION_MODEL, {}),
      AutoTokenizer.from_pretrained(CAPTION_MODEL, {}),
      Florence2ForConditionalGeneration.from_pretrained(CAPTION_MODEL, { device: 'cpu', dtype } as any),
    ]);
    return { model, processor, tokenizer };
  })().catch(e => { florencePromise = null; throw e; });
  return florencePromise;
}

/**
 * Decode a chunk's audio to 16kHz mono Float32 PCM (Whisper's required input) via ffmpeg raw
 * output — avoids pulling in a separate WAV-parsing dependency for a container that already
 * has ffmpeg. Returns null (never throws) so a decode hiccup just skips this tier gracefully.
 */
async function decodePcm16k(chunkPath: string, tmp: string, tag: string): Promise<Float32Array | null> {
  const out = path.join(tmp, `pcm_${tag}.f32`);
  const r = await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error', '-i', chunkPath,
    '-vn', '-f', 'f32le', '-ar', '16000', '-ac', '1', out,
  ], 5 * 60 * 1000);
  if (!r.ok) return null;
  const buf = await fs.readFile(out).catch(() => null);
  if (!buf || buf.length < 4) return null;
  // Float32Array needs a buffer whose byteOffset is a multiple of 4; Node Buffers from
  // readFile are freshly allocated and 4-byte aligned in practice, but slice to be certain.
  const aligned = Buffer.from(buf);
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4);
}

/**
 * Small ASR models (whisper-base especially) can degenerate into a repetition loop on
 * ambiguous, music-heavy, or near-silent audio — the same short phrase repeated dozens of
 * times (observed live 2026-08-30 on a trailer's score). That is a known Whisper failure mode,
 * not a transcription of anything real, and passing it to Pokee as if it were dialogue would
 * bias the reasoning step on fabricated repetition. Collapse any run of 3+ consecutive
 * identical short word-groups down to one instance; if that still leaves the text mostly one
 * repeated phrase, drop it entirely as unreliable rather than report noise as speech.
 */
function stripAsrRepetition(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 6) return text.trim();
  for (const groupSize of [1, 2, 3, 4, 5, 6, 8]) {
    if (words.length < groupSize * 3) continue;
    const out: string[] = [];
    let i = 0;
    while (i < words.length) {
      const group = words.slice(i, i + groupSize).join(' ');
      let runLen = 1;
      while (
        i + runLen * groupSize + groupSize <= words.length &&
        words.slice(i + runLen * groupSize, i + (runLen + 1) * groupSize).join(' ') === group
      ) runLen++;
      out.push(group);
      i += runLen * groupSize;
    }
    const collapsed = out.join(' ');
    // A collapse that shrank the text by more than half means the original was dominated by
    // one repeating phrase — treat the whole segment as an ASR hallucination, not real speech.
    if (collapsed.length < text.trim().length * 0.5) return '';
    if (collapsed !== text.trim()) return collapsed;
  }
  return text.trim();
}

/** Whisper transcription for one chunk's audio, timestamped relative to the CHUNK's own start
 *  (the caller re-anchors to the film's absolute time, same convention as the cloud tiers). */
export async function transcribeChunkLocal(
  chunkPath: string, tmp: string, tag: string,
): Promise<{ tSec: number; text: string }[]> {
  const pcm = await decodePcm16k(chunkPath, tmp, tag);
  if (!pcm || !pcm.length) return [];
  const asr = await getAsr();
  const out: any = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  const chunks = Array.isArray(out?.chunks) ? out.chunks : (out?.text ? [{ text: out.text, timestamp: [0, null] }] : []);
  return chunks
    .map((c: any) => ({
      tSec: Math.max(0, Number(Array.isArray(c.timestamp) ? c.timestamp[0] : 0) || 0),
      text: stripAsrRepetition(String(c.text || '')),
    }))
    .filter((c: { text: string }) => c.text.length > 0);
}

/** Florence-2 detailed caption for one still frame. Empty string (not a throw) on any model
 *  failure — a caption-less still just contributes nothing to that beat rather than aborting
 *  the whole fallback attempt. */
export async function captionStillLocal(jpgPath: string): Promise<string> {
  try {
    const tf: any = await import('@huggingface/transformers');
    const { RawImage } = tf;
    const { model, processor, tokenizer } = await getFlorence();
    const image = await RawImage.read(jpgPath);
    const task = '<MORE_DETAILED_CAPTION>';
    const prompts = processor.construct_prompts(task);
    const textInputs = tokenizer(prompts);
    const visionInputs = await processor(image);
    const generated = await model.generate({ ...textInputs, ...visionInputs, max_new_tokens: 256, num_beams: 1, do_sample: false });
    const decoded = tokenizer.batch_decode(generated, { skip_special_tokens: false })[0];
    const result = processor.post_process_generation(decoded, task, image.size);
    return String(result?.[task] || '').trim();
  } catch (e: any) {
    console.error('[local-models] caption failed:', e?.message || e);
    return '';
  }
}
