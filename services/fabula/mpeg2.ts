// ═══════════════════════════════════════════════════════════════════════════
// mpeg2 — MPEG-2 in and out of Fabula.
//
// IMPORT. Browsers ship no MPEG-2 decoder (neither <video> nor WebCodecs), so an MPEG-2 source
// (DVD VOB, broadcast TS, HDV/AVCHD-era M2TS, XDCAM/IMX MXF, plain .mpg/.m2v) is CONFORMED once on
// import: a full-resolution H.264 working copy, deinterlaced (bwdif, only frames flagged
// interlaced), anamorphic pixels squared, audio to AAC. That copy is what plays, proxies and
// renders; the original file is kept untouched for archive / re-delivery.
//
// EXPORT. The timeline renders to the H.264 master as usual; a delivery preset then transcodes
// it to a spec-conformant MPEG-2 file: DVD-Video (NTSC/PAL), broadcast HD transport stream,
// Sony XDCAM HD422 50 Mb/s MXF, or a plain MPEG-2 program-stream master. (IMX/D-10 export is left
// out: ffmpeg's intra 50 Mb/s CBR can't stuff simple frames such as a black slate. IMX imports fine.)
//
// Both directions run on the desktop app's ffmpeg (any size, fast) or the in-browser codec pack
// (FFmpeg WebAssembly, no upload). MPEG-2's patents expired in 2018 — no royalty either way.
// Argument builders are pure and unit-tested (tests/fabulaMpeg2.test.ts).
// ═══════════════════════════════════════════════════════════════════════════

const MPEG2_EXT = new Set(['mpg', 'mpeg', 'm2v', 'm2p', 'mpv', 'vob', 'ts', 'm2t', 'm2ts', 'mts', 'mod', 'tod', 'mxf', 'hdv', 'trp', 'tp']);

export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

/** A file Fabula should conform before editing (by extension / MIME; MXF and TS are probed by ffmpeg). */
export function isMpeg2Source(name: string, mime = ''): boolean {
  return MPEG2_EXT.has(extOf(name)) || /^video\/(mpeg|mp2t|mp2p|x-mpeg2?)$/i.test(mime) || /mxf/i.test(mime);
}

// ── conform (import) ────────────────────────────────────────────────────────

export interface ConformOptions {
  /** H.264 encoder: libx264 (default), or a GPU encoder the desktop ffmpeg reports. */
  encoder?: string;
  /** CRF for libx264 — 16 is visually lossless for SD/HD MPEG-2 sources. */
  crf?: number;
  /** x264 speed preset; the in-browser pack uses a faster one. */
  preset?: string;
}

/** MPEG-2 source → editable H.264 working copy at source resolution. */
export function buildConformArgs(input: string, output: string, o: ConformOptions = {}): string[] {
  const enc = o.encoder || 'libx264';
  const v = enc === 'libx264'
    ? ['-c:v', 'libx264', '-preset', o.preset || 'fast', '-crf', String(o.crf ?? 16), '-g', '12', '-bf', '2']
    : ['-c:v', enc, '-b:v', '40M', '-maxrate', '60M', '-bufsize', '80M', '-g', '12'];
  return [
    '-y', '-fflags', '+genpts', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    // bwdif deinterlaces only frames flagged interlaced (one frame out per frame: same rate, same
    // frame count, so timecode and edit points line up with the original). Anamorphic DVD / HDV
    // pixels (SAR 8:9, 32:27, 4:3) become square so every engine draws the right shape.
    '-vf', "bwdif=mode=send_frame:parity=auto:deint=interlaced,scale='trunc(iw*sar/2)*2':ih:flags=lanczos,setsar=1",
    ...v, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-ar', '48000',
    '-movflags', '+faststart', output,
  ];
}

// ── delivery presets (export) ───────────────────────────────────────────────

export type Mpeg2PresetId = 'dvd-ntsc' | 'dvd-pal' | 'ts-hd' | 'xdcam-hd422' | 'ps-master';

export interface Mpeg2Preset {
  id: Mpeg2PresetId;
  label: string;
  note: string;
  ext: string;
  /** Frame rate the deliverable runs at; the master is retimed if it differs. */
  rate: { num: number; den: number };
  size: { w: number; h: number } | null;   // null = keep the master's size
  interlaced: boolean;
}

export const MPEG2_PRESETS: Mpeg2Preset[] = [
  { id: 'dvd-ntsc', label: 'DVD-Video · NTSC', note: '720×480 29.97, MPEG-2 PS + AC-3. Burns with any DVD authoring tool.', ext: 'mpg', rate: { num: 30000, den: 1001 }, size: { w: 720, h: 480 }, interlaced: true },
  { id: 'dvd-pal', label: 'DVD-Video · PAL', note: '720×576 25, MPEG-2 PS + AC-3.', ext: 'mpg', rate: { num: 25, den: 1 }, size: { w: 720, h: 576 }, interlaced: true },
  { id: 'ts-hd', label: 'Broadcast HD · MPEG-2 TS', note: '1920×1080i, 4:2:0, 20 Mb/s CBR, AC-3 — ATSC-style contribution / playout.', ext: 'ts', rate: { num: 30000, den: 1001 }, size: { w: 1920, h: 1080 }, interlaced: true },
  { id: 'xdcam-hd422', label: 'XDCAM HD422 · MXF', note: 'Sony XDCAM 50 Mb/s 4:2:2 long-GOP, OP1a MXF, 24-bit PCM. The broadcast server standard.', ext: 'mxf', rate: { num: 30000, den: 1001 }, size: { w: 1920, h: 1080 }, interlaced: true },
  { id: 'ps-master', label: 'MPEG-2 PS master', note: 'Program stream at the sequence\'s own size and rate, high bitrate 4:2:0, MP2 audio.', ext: 'mpg', rate: { num: 0, den: 0 }, size: null, interlaced: false },
];

export const mpeg2Preset = (id: Mpeg2PresetId) => MPEG2_PRESETS.find((p) => p.id === id)!;

export interface DeliverOptions {
  /** Display aspect of the programme: DVD / SD presets letterbox or flag 16:9. */
  aspect?: '16:9' | '4:3';
  /** Sequence rate, for the PS master and 25 vs 29.97 pick. */
  fps?: number;
}

/** Fit any master into a fixed raster without distortion (letterbox/pillarbox), then set the flag.
 *  SD rasters convert the picture to the BT.601 matrix (HD masters are BT.709) so colours stay true. */
const fitTo = (w: number, h: number, dar: string) =>
  `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos${h <= 576 ? ':out_color_matrix=bt601:out_range=tv' : ':out_color_matrix=bt709:out_range=tv'},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setdar=${dar.replace(':', '/')}`;
/** Colour tags written into the stream (what decoders and QC tools read). */
const SD_NTSC = ['-color_primaries', 'smpte170m', '-color_trc', 'smpte170m', '-colorspace', 'smpte170m'];
const SD_PAL = ['-color_primaries', 'bt470bg', '-color_trc', 'gamma28', '-colorspace', 'bt470bg'];
const HD709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

/** H.264 master → MPEG-2 deliverable. */
export function buildMpeg2Args(input: string, output: string, presetId: Mpeg2PresetId, o: DeliverOptions = {}): string[] {
  const p = mpeg2Preset(presetId);
  const dar = o.aspect || '16:9';
  const base = ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?'];
  // Interlaced deliverables: frames are flagged top-field-first in the filter chain (setfield) and
  // coded with interlaced motion + DCT; field_order also lands in the container (MXF/TS descriptors).
  const tff = ['-flags', '+ilme+ildct', '-field_order', 'tt'];
  switch (presetId) {
    case 'dvd-ntsc':
    case 'dvd-pal': {
      const ntsc = presetId === 'dvd-ntsc';
      // -target sets the DVD muxer, GOP (15/12), VBV and bitrate caps. 6 Mb/s keeps ~90 min on a DVD-5.
      return [...base, '-vf', `${fitTo(720, ntsc ? 480 : 576, dar)},fps=${ntsc ? '30000/1001' : '25'},setfield=tff`,
        '-target', ntsc ? 'ntsc-dvd' : 'pal-dvd', '-aspect', dar, '-b:v', '6000k', '-maxrate', '9000k', ...tff, ...(ntsc ? SD_NTSC : SD_PAL),
        '-c:a', 'ac3', '-b:a', '192k', '-ar', '48000', '-ac', '2', output];
    }
    case 'ts-hd':
      return [...base, '-vf', `${fitTo(1920, 1080, '16:9')},fps=30000/1001,setfield=tff`,
        '-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '20M', '-minrate', '20M', '-maxrate', '20M', '-bufsize', '9781248',
        '-g', '15', '-bf', '2', '-intra_vlc', '1', '-non_linear_quant', '1', '-qmin', '1', '-qmax', '28', ...tff, ...HD709,
        '-c:a', 'ac3', '-b:a', '384k', '-ar', '48000', '-ac', '2',
        '-f', 'mpegts', '-muxrate', '24M', '-mpegts_service_id', '1', '-metadata', 'service_provider=Plajah Fabula', output];
    case 'xdcam-hd422': {
      // Sony XDCAM HD422: 1920x1080, 4:2:2, 50 Mb/s CBR, GOP 12 (M=3), 10-bit DC, nonlinear quant.
      const fps = o.fps && Math.abs(o.fps - 25) < 0.01 ? '25' : '30000/1001';
      return [...base, '-vf', `${fitTo(1920, 1080, '16:9')},fps=${fps},setfield=tff`,
        '-c:v', 'mpeg2video', '-pix_fmt', 'yuv422p', '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M', '-bufsize', '17825792', '-rc_init_occupancy', '17825792',
        '-g', '12', '-bf', '2', '-dc', '10', '-intra_vlc', '1', '-non_linear_quant', '1', '-qmin', '1', '-qmax', '12', '-lmin', '1*QP2LAMBDA', ...tff, ...HD709,
        '-c:a', 'pcm_s24le', '-ar', '48000', '-ac', '2', '-f', 'mxf', output];
    }
    case 'ps-master':
    default:
      return [...base, '-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '25M', '-maxrate', '35M', '-bufsize', '9781248',
        '-g', '15', '-bf', '2', '-intra_vlc', '1', '-non_linear_quant', '1', '-qmin', '1', '-qmax', '28',
        '-c:a', 'mp2', '-b:a', '384k', '-ar', '48000', '-f', 'vob', output];
  }
}

export const deliverName = (base: string, presetId: Mpeg2PresetId) =>
  `${base.replace(/[\\/:*?"<>|]+/g, '_')}.${presetId}.${mpeg2Preset(presetId).ext}`;

/** Read "Stream #0:0 ... Video: mpeg2video (Main), yuv420p(tv, top first), 720x480 [SAR 8:9 DAR 4:3], 29.97 fps" from an ffmpeg log. */
export function parseVideoStreamLine(log: string[]): { codec?: string; width?: number; height?: number; fps?: number; interlaced?: boolean; fieldOrder?: string; dar?: string } {
  const line = log.find((l) => /Stream #\d+:\d+.*Video:/.test(l));
  if (!line) return {};
  const codec = /Video:\s*([\w]+)/.exec(line)?.[1];
  const size = /,\s*(\d{2,5})x(\d{2,5})/.exec(line);
  const fps = /([\d.]+)\s*fps/.exec(line);
  const field = /\b(top first|bottom first|top coded first|bottom coded first|progressive)\b/.exec(line)?.[1];
  const dar = /DAR (\d+:\d+)/.exec(line)?.[1];
  return {
    codec, width: size ? +size[1] : undefined, height: size ? +size[2] : undefined, fps: fps ? +fps[1] : undefined,
    fieldOrder: field, interlaced: field ? field !== 'progressive' : undefined, dar,
  };
}
