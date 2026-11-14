import type {
  Backend,
  ConvertProgress,
  ConvertResult,
  MediaKind,
  MediaProbe,
  Recipe,
  SourceFile,
} from './types';
import { AUDIO_CODECS, CONTAINERS, IMAGE_FORMATS, VIDEO_CODECS, extFor } from './formats';

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

/** Picks the concrete encoder. `auto` uses a GPU encoder when the installed ffmpeg reports having it. */
export function videoEncoder(recipe: Recipe, available?: string[]): string | undefined {
  const codec = VIDEO_CODECS.find((c) => c.id === recipe.videoCodecId);
  if (!codec) return undefined;
  const hw = recipe.hwAccel;
  const has = (e: string | undefined): e is string => !!e && (!available || available.includes(e));
  if (hw === 'auto' && available) {
    for (const a of ['nvenc', 'qsv', 'amf', 'videotoolbox']) {
      const e = HW_ENCODER[codec.id]?.[a];
      if (has(e)) return e;
    }
  } else if (hw && hw !== 'auto' && hw !== 'none' && HW_ENCODER[codec.id]?.[hw]) {
    return HW_ENCODER[codec.id]![hw];
  }
  return codec.encoder;
}

/** Each encoder names its constant-quality control differently; -crf only exists on some. */
function qualityArgs(venc: string, recipe: Recipe): string[] {
  const q = recipe.crf ?? 20;
  if (venc === 'mpeg2video' && recipe.mpeg2Profile === 'xdcam50') return ['-b:v', '50M', '-minrate', '50M', '-maxrate', '50M', '-bufsize', '36408333', '-rc_init_occupancy', '36408333', '-g', '15', '-bf', '2', '-flags', '+cgop', '-sc_threshold', '1000000000'];
  if (recipe.qualityMode === 'bitrate') return recipe.videoBitrate ? ['-b:v', recipe.videoBitrate] : [];
  if (['prores_ks', 'ffv1', 'dnxhd', 'cfhd', 'hap', 'libopenjpeg', 'utvideo', 'v210', 'qtrle', 'dvvideo'].includes(venc)) return [];
  if (venc === 'libvvenc') return ['-qp', String(q)];
  if (venc === 'libxvid' || venc === 'mjpeg') return ['-q:v', String(Math.max(2, Math.min(31, Math.round(q / 3))))];
  if (venc === 'mpeg2video') return recipe.qualityMode === 'lossless' ? ['-q:v', '1'] : ['-q:v', String(Math.max(1, Math.min(31, Math.round(q / 2))))];
  if (recipe.qualityMode === 'lossless') {
    if (venc.endsWith('_nvenc')) return ['-tune', 'lossless'];
    return ['-crf', '0'];
  }
  if (venc.endsWith('_nvenc')) return ['-rc', 'vbr', '-cq', String(q), '-b:v', '0'];
  if (venc.endsWith('_qsv')) return ['-global_quality', String(q)];
  if (venc.endsWith('_amf')) return ['-rc', 'cqp', '-qp_i', String(q), '-qp_p', String(q)];
  if (venc.endsWith('_videotoolbox') || venc.endsWith('_vaapi')) return ['-q:v', String(Math.max(1, 100 - q * 2))];
  if (venc === 'libvpx-vp9') return ['-crf', String(q), '-b:v', '0'];
  return ['-crf', String(q)];
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
  availableEncoders?: string[],
): string[] {
  const a: string[] = ['-y'];

  // Input-side options.
  if (recipe.fixTimestamps) a.push('-fflags', '+genpts');
  a.push('-i', input);

  if (kind === 'image') {
    a.push('-frames:v', '1');
    a.push(output);
    return a;
  }

  // An audio-only target from a video source drops the picture.
  const audioOnly = kind === 'audio' || CONTAINERS.find((c) => c.id === recipe.containerId)?.kinds.includes('video') === false;
  if (!audioOnly) a.push('-map', '0:v:0?');
  if (recipe.containerId !== 'gif') a.push('-map', '0:a?');

  // Video stream.
  if (!audioOnly) {
    const venc = videoEncoder(recipe, availableEncoders);
    if (recipe.containerId === 'gif') {
      a.push('-vf', `fps=${recipe.fps || 12},scale=${recipe.width || 640}:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
    } else if (venc) {
      a.push('-c:v', venc);
      a.push(...qualityArgs(venc, recipe));
      if (venc === 'prores_ks') a.push('-profile:v', recipe.proresProfile ?? '3', '-pix_fmt', recipe.proresProfile === '4' ? 'yuva444p10le' : 'yuv422p10le');
      else if (venc === 'dnxhd') {
        const profile = recipe.dnxProfile ?? 'dnxhr_hq';
        a.push('-profile:v', profile, '-pix_fmt', profile === 'dnxhr_444' ? 'yuv444p10le' : profile === 'dnxhr_hqx' ? 'yuv422p10le' : 'yuv422p');
      }
      else if (venc === 'mpeg2video') a.push('-pix_fmt', recipe.mpeg2Profile === 'xdcam50' ? 'yuv422p' : 'yuv420p');
      else if (venc === 'cfhd') a.push('-pix_fmt', 'yuv422p10le');
      else if (venc === 'v210') a.push('-pix_fmt', 'yuv422p10le');
      else if (venc === 'dvvideo') a.push('-s', '720x480', '-r', '30000/1001', '-pix_fmt', 'yuv411p');
      // Broadly-compatible pixel format for the H.26x family in mp4/mov.
      else if (venc.startsWith('libx26') || venc.includes('nvenc') || venc.includes('qsv') || venc.includes('amf')) a.push('-pix_fmt', 'yuv420p');

      // GXF servers take standard definition only.
      if (recipe.containerId === 'gxf') a.push('-s', '720x480', '-r', '30000/1001');
      else if (recipe.width || recipe.height) a.push('-vf', `scale=${recipe.width || -2}:${recipe.height || -2}:flags=lanczos`);
      if (recipe.fps) a.push('-r', String(recipe.fps));
    }
  } else {
    a.push('-vn');
  }

  // Audio stream.
  const aenc = audioEncoder(recipe);
  if (aenc && recipe.containerId !== 'gif') {
    a.push('-c:a', aenc);
    if (recipe.audioBitrate && recipe.qualityMode !== 'lossless' && !aenc.startsWith('pcm') && aenc !== 'flac' && aenc !== 'alac') {
      a.push('-b:a', recipe.audioBitrate);
    }
    if (aenc === 'dca' || aenc === 'truehd') a.push('-strict', '-2');
    // MXF and GXF carry 48 kHz audio only.
    const rate = recipe.containerId === 'mxf' || recipe.containerId === 'gxf' ? 48000 : recipe.sampleRate;
    if (rate) a.push('-ar', String(rate));
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
