import type {
  Backend,
  ConvertProgress,
  ConvertResult,
  MediaKind,
  MediaProbe,
  Recipe,
  SourceFile,
} from './types';
import { AUDIO_CODECS, IMAGE_FORMATS, VIDEO_CODECS, extFor } from './formats';

// ─────────────────────────────────────────────────────────────────────────
// Crossover engine core: the ffmpeg-arg builder (single source of truth shared
// by the UI's transparent command preview AND the Cloud Run server), the
// backend router, and the CrossoverEngine interface every consumer talks to.
// ─────────────────────────────────────────────────────────────────────────

/** Hardware-accelerated encoder variants by codec + accelerator. */
const HW_ENCODER: Record<string, Partial<Record<string, string>>> = {
  h264: { nvenc: 'h264_nvenc', qsv: 'h264_qsv', amf: 'h264_amf', vaapi: 'h264_vaapi', videotoolbox: 'h264_videotoolbox' },
  h265: { nvenc: 'hevc_nvenc', qsv: 'hevc_qsv', amf: 'hevc_amf', vaapi: 'hevc_vaapi', videotoolbox: 'hevc_videotoolbox' },
  av1: { nvenc: 'av1_nvenc', qsv: 'av1_qsv' },
};

function videoEncoder(recipe: Recipe): string | undefined {
  const codec = VIDEO_CODECS.find((c) => c.id === recipe.videoCodecId);
  if (!codec) return undefined;
  const hw = recipe.hwAccel;
  if (hw && hw !== 'auto' && hw !== 'none' && HW_ENCODER[codec.id]?.[hw]) {
    return HW_ENCODER[codec.id]![hw];
  }
  return codec.encoder;
}

function audioEncoder(recipe: Recipe): string | undefined {
  return AUDIO_CODECS.find((c) => c.id === recipe.audioCodecId)?.encoder;
}

/**
 * Build the ffmpeg argument vector for a conversion. Pure & deterministic so
 * the browser can render an exact command preview and the server can execute
 * the very same recipe. `input`/`output` are paths (server) or display names
 * (preview). Never interpolates user text into a shell — args are passed
 * directly to spawn(). Finalize/repair flags are folded in here too.
 */
export function buildFfmpegArgs(
  input: string,
  recipe: Recipe,
  output: string,
  kind: MediaKind,
): string[] {
  const a: string[] = ['-y'];

  // Input-side options.
  if (recipe.fixTimestamps) a.push('-fflags', '+genpts');
  if (kind === 'video' && recipe.hwAccel && recipe.hwAccel !== 'auto' && recipe.hwAccel !== 'none') {
    // decode acceleration hint; harmless if unavailable with -hwaccel auto fallback
  }
  a.push('-i', input);

  if (kind === 'image') {
    a.push('-frames:v', '1');
    a.push(output);
    return a;
  }

  // Video stream.
  if (kind === 'video') {
    const venc = videoEncoder(recipe);
    if (venc) {
      a.push('-c:v', venc);
      if (recipe.qualityMode === 'lossless') {
        if (venc.startsWith('libx26')) a.push('-crf', '0');
      } else if (recipe.qualityMode === 'crf' && recipe.crf != null) {
        a.push('-crf', String(recipe.crf));
      } else if (recipe.qualityMode === 'bitrate' && recipe.videoBitrate) {
        a.push('-b:v', recipe.videoBitrate);
      }
      // Broadly-compatible pixel format for the H.26x family in mp4/mov.
      if (venc.startsWith('libx26') || venc.includes('nvenc') || venc.includes('qsv') || venc.includes('amf')) {
        a.push('-pix_fmt', 'yuv420p');
      }
    }
  }

  // Audio stream.
  const aenc = audioEncoder(recipe);
  if (aenc) {
    a.push('-c:a', aenc);
    if (recipe.audioBitrate && recipe.qualityMode !== 'lossless' && !aenc.startsWith('pcm') && aenc !== 'flac' && aenc !== 'alac') {
      a.push('-b:a', recipe.audioBitrate);
    }
    if (recipe.sampleRate) a.push('-ar', String(recipe.sampleRate));
    if (recipe.binauralDownmix) {
      // Stereo/headphone downmix. True HRTF binaural (sofalizer) needs a SOFA
      // profile — a server-side upgrade tracked for a later pass.
      a.push('-ac', '2');
    } else if (recipe.channels) {
      a.push('-ac', String(recipe.channels));
    }
  }

  if (recipe.stripMetadata) a.push('-map_metadata', '-1');
  a.push(output);
  return a;
}

/** Human-readable command for the UI's transparent-command panel. */
export function buildCommandPreview(source: SourceFile, recipe: Recipe): string {
  const ext = extFor(recipe, source.kind);
  const base = source.name.replace(/\.[^.]+$/, '');
  const out = `${base}.${ext}`;
  const args = buildFfmpegArgs(source.name, recipe, out, source.kind);
  return 'ffmpeg ' + args.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ');
}

/** Decide whether a job can run in the browser or must go to Cloud Run ffmpeg. */
export function chooseBackend(source: SourceFile, recipe: Recipe): Backend {
  // Only live browser Files can be processed client-side.
  if (!source.file) return 'server';
  if (recipe.stripMetadata) return 'server';

  if (source.kind === 'image') {
    const fmt = IMAGE_FORMATS.find((f) => f.id === recipe.imageFormatId);
    return fmt && fmt.backend !== 'server' ? 'client' : 'server';
  }
  if (source.kind === 'audio') {
    const c = AUDIO_CODECS.find((x) => x.id === recipe.audioCodecId);
    // Client audio path currently produces WAV PCM only (see clientEngine).
    const clientOk = !!c && c.backend !== 'server' && c.encoder.startsWith('pcm_');
    return clientOk ? 'client' : 'server';
  }
  // Video always routes to the cloud in this pass.
  return 'server';
}

export interface CrossoverEngine {
  probe(source: SourceFile): Promise<MediaProbe>;
  convert(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult>;
  buildCommandPreview(source: SourceFile, recipe: Recipe): string;
}

/** A concrete backend implementation (client or server). */
export interface BackendEngine {
  readonly backend: Backend;
  available(): boolean | Promise<boolean>;
  probe(source: SourceFile): Promise<MediaProbe>;
  convert(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult>;
}
