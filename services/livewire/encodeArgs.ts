// services/livewire/encodeArgs.ts — one capture in, every rung out, on the broadcaster's GPU.
//
// Builds ffmpeg arguments for the bundled build (windows-native/third_party/ffmpeg, which has
// h264/av1 for NVENC, Quick Sync and AMF). The same builder serves:
//   • the Windows app (input = the program feed),
//   • the Livewire relay box (input = a browser host's WebM on stdin, GPU or x264),
//   • the local end-to-end test (input = testsrc, output = an HLS ladder on disk).
//
// ABR only works if every rung cuts segments at the same instants, so keyframes are forced on
// a fixed clock (every GOP_SECONDS) and scene-cut keyframes / B-frames are off on every encoder.
// Pure: returns string arrays, spawns nothing.

import type { EncodeOutput, EncoderFamily, Rung } from './types';

export const GOP_SECONDS = 2;

const ENCODER_NAME: Record<EncoderFamily, { h264: string; av1: string | null }> = {
  nvenc: { h264: 'h264_nvenc', av1: 'av1_nvenc' },
  qsv: { h264: 'h264_qsv', av1: 'av1_qsv' },
  amf: { h264: 'h264_amf', av1: 'av1_amf' },
  x264: { h264: 'libx264', av1: null },
};

/** Per-encoder options for constant-ish bitrate, low latency, aligned keyframes. */
function encoderOpts(family: EncoderFamily, codec: 'h264' | 'av1', r: Rung, gop: number, idx: number | null): string[] {
  const s = (k: string) => (idx === null ? k : `${k}:${idx}`); // per-stream specifier in single-output mode
  const name = codec === 'av1' ? ENCODER_NAME[family].av1 : ENCODER_NAME[family].h264;
  if (!name) throw new Error(`${family} cannot encode ${codec}`);
  const common = [
    s('-c:v'), name,
    s('-b:v'), `${r.videoKbps}k`, s('-maxrate:v'), `${r.maxKbps}k`, s('-bufsize:v'), `${r.maxKbps * 2}k`,
    s('-g:v'), String(gop), s('-bf:v'), '0',
  ];
  switch (family) {
    case 'nvenc':
      return [...common, s('-preset:v'), 'p4', s('-tune:v'), 'll', s('-rc:v'), 'cbr', s('-forced-idr:v'), '1', s('-no-scenecut:v'), '1',
        ...(codec === 'h264' ? [s('-profile:v'), 'high'] : [])];
    case 'qsv':
      return [...common, s('-preset:v'), 'veryfast', s('-look_ahead:v'), '0', ...(codec === 'h264' ? [s('-profile:v'), 'high'] : [])];
    case 'amf':
      return [...common, s('-usage:v'), 'lowlatency', s('-rc:v'), 'cbr', ...(codec === 'h264' ? [s('-profile:v'), 'high'] : [])];
    case 'x264':
      return [...common, s('-preset:v'), 'veryfast', s('-tune:v'), 'zerolatency', s('-sc_threshold:v'), '0', s('-keyint_min:v'), String(gop), s('-profile:v'), 'high'];
  }
}

/** MediaMTX path for one rung of one stream. */
export const rungPath = (streamId: string, rung: string) => `live/${streamId}/${rung}`;

function outputUrl(out: Exclude<EncodeOutput, { kind: 'hls-local' }>, rung: string): string {
  const path = rungPath(out.streamId, rung);
  if (out.kind === 'srt') {
    // MediaMTX SRT stream id: publish:<path>:<user>:<pass>. The token is the password.
    const sid = `publish:${path}:lw:${out.token}`;
    return `srt://${out.host}:${out.port ?? 8890}?streamid=${encodeURIComponent(sid)}&pkt_size=1316&latency=200000`;
  }
  return `rtmp://${out.host}:${out.port ?? 1935}/${path}?user=lw&pass=${encodeURIComponent(out.token)}`;
}

export interface EncodeJob {
  /** ffmpeg input arguments, e.g. ['-f','lavfi','-i','testsrc2=size=1920x1080:rate=30'] or ['-i','pipe:0']. */
  input: string[];
  rungs: Rung[];
  encoder: EncoderFamily;
  output: EncodeOutput;
  /** Extra input args for a separate audio source (lavfi sine in tests). */
  audioInput?: string[];
}

export function buildEncodeArgs(job: EncodeJob): string[] {
  const video = job.rungs.filter(r => r.codec !== 'none');
  const audioRung = job.rungs.find(r => r.codec === 'none');
  if (!video.length) throw new Error('ladder has no video rungs');
  const fps = Math.max(...video.map(r => r.fps));
  const gopFor = (r: Rung) => Math.round(r.fps * GOP_SECONDS);
  const audioIdx = job.audioInput ? 1 : 0;
  const audioKbps = audioRung?.audioKbps ?? video[0].audioKbps;

  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts', ...job.input, ...(job.audioInput ?? [])];

  // One decode, one split, one scale per rung.
  const splits = video.map((_, i) => `[v${i}]`).join('');
  const graph = [`[0:v]fps=${fps},split=${video.length}${splits}`,
    ...video.map((r, i) => `[v${i}]fps=${r.fps},scale=${r.width}:${r.height}:flags=bicubic,format=yuv420p[s${i}]`)].join(';');
  args.push('-filter_complex', graph);
  // Keyframes on a wall clock so every rung's segments line up.
  const forceKf = `expr:gte(t,n_forced*${GOP_SECONDS})`;

  if (job.output.kind === 'hls-local') {
    const out = job.output;
    const seg = out.segmentSeconds ?? GOP_SECONDS;
    video.forEach((r, i) => {
      args.push('-map', `[s${i}]`, '-map', `${audioIdx}:a:0`);
      args.push(...encoderOpts(job.encoder, r.codec as 'h264' | 'av1', r, gopFor(r), i), `-force_key_frames:v:${i}`, forceKf);
    });
    args.push('-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2');
    const varMap = video.map((r, i) => `v:${i},a:${i},name:${r.name}`).join(' ');
    args.push('-f', 'hls', '-hls_time', String(seg), '-hls_playlist_type', 'event',
      '-hls_flags', 'independent_segments', '-hls_segment_type', 'fmp4',
      '-master_pl_name', 'master.m3u8', '-var_stream_map', varMap,
      `${out.dir.replace(/\\/g, '/')}/%v/index.m3u8`);
    return args;
  }

  // Network: one output per rung (MediaMTX serves one path per rung), plus audio-only.
  const net = job.output;
  const mux = net.kind === 'srt' ? 'mpegts' : 'flv';
  video.forEach((r, i) => {
    args.push('-map', `[s${i}]`, '-map', `${audioIdx}:a:0`,
      ...encoderOpts(job.encoder, r.codec as 'h264' | 'av1', r, gopFor(r), null), '-force_key_frames', forceKf,
      '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
      '-f', mux, outputUrl(net, r.name));
  });
  if (audioRung) {
    args.push('-map', `${audioIdx}:a:0`, '-vn', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
      '-f', mux, outputUrl(net, 'audio'));
  }
  return args;
}

/** Which encoder family to use, from what FfmpegLocator / PlajahAiNativeService reported. */
export function pickEncoder(available: string[]): EncoderFamily {
  const has = (n: string) => available.includes(n);
  if (has('h264_nvenc')) return 'nvenc';
  if (has('h264_qsv')) return 'qsv';
  if (has('h264_amf')) return 'amf';
  return 'x264';
}

export const canEncodeAv1 = (family: EncoderFamily, available: string[]) =>
  !!ENCODER_NAME[family].av1 && available.includes(ENCODER_NAME[family].av1!);
