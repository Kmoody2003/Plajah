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
// Each preset is a SPEC: raster, allowed frame rates, chroma, bitrate + VBV, GOP, wrapper, audio.
// One builder turns a spec into ffmpeg arguments, so adding a network/house variant is one row.

export type Mpeg2PresetId =
  | 'dvd-ntsc' | 'dvd-pal'
  | 'ts-hd' | 'atsc-720p' | 'dvb-1080i25' | 'contrib-422'
  | 'xdcam-hd422' | 'xdcam-hd422-720p' | 'xdcam-hd35' | 'hdv-1080i'
  | 'ps-master';

export type Mpeg2Group = 'Broadcast HD' | 'Broadcast servers (MXF)' | 'DVD / SD' | 'Master';

export interface Mpeg2Preset {
  id: Mpeg2PresetId;
  label: string;
  group: Mpeg2Group;
  note: string;
  ext: string;
  /** ffmpeg rate strings this spec allows; the first is the default. Empty = the sequence's own rate. */
  rates: string[];
  size: { w: number; h: number } | null;   // coded raster; null = keep the master's size
  /** Interlaced (TFF) at field-based rates (25 / 29.97 on 1080 and SD); progressive otherwise. */
  interlaced: boolean;
  /** Anamorphic 16:9 in a 1440-wide raster (HDV, XDCAM HD 35). */
  anamorphic?: boolean;
  chroma?: '420' | '422';
  /** Video bitrate (bps), and whether it is constant (CBR) or a VBR ceiling. */
  bitrate?: number;
  cbr?: boolean;
  bufsize?: number;
  gop?: number;
  wrapper?: 'mpegts' | 'mxf';
  muxrate?: number;
  audio?: { codec: 'ac3' | 'mp2' | 'pcm_s24le' | 'pcm_s16le'; bitrate?: string };
}

const R2997 = '30000/1001', R25 = '25', R2398 = '24000/1001', R5994 = '60000/1001', R50 = '50';

export const MPEG2_PRESETS: Mpeg2Preset[] = [
  // ── Broadcast HD transmission / contribution (transport streams) ──
  { id: 'ts-hd', group: 'Broadcast HD', label: 'ATSC 1080i · MPEG-2 TS', note: 'ATSC A/53: 1920×1080i 29.97, MP@HL 4:2:0, 17.5 Mb/s CBR, AC-3 384k, 19.39 Mb/s mux. US over-the-air spec.',
    ext: 'ts', rates: [R2997], size: { w: 1920, h: 1080 }, interlaced: true, chroma: '420', bitrate: 17_500_000, cbr: true, bufsize: 7_995_392, gop: 15, wrapper: 'mpegts', muxrate: 19_392_658, audio: { codec: 'ac3', bitrate: '384k' } },
  { id: 'atsc-720p', group: 'Broadcast HD', label: 'ATSC 720p · MPEG-2 TS', note: 'ATSC A/53: 1280×720p 59.94, MP@HL 4:2:0, 17.5 Mb/s CBR, AC-3 384k. For 720p networks (sports).',
    ext: 'ts', rates: [R5994], size: { w: 1280, h: 720 }, interlaced: false, chroma: '420', bitrate: 17_500_000, cbr: true, bufsize: 7_995_392, gop: 30, wrapper: 'mpegts', muxrate: 19_392_658, audio: { codec: 'ac3', bitrate: '384k' } },
  { id: 'dvb-1080i25', group: 'Broadcast HD', label: 'DVB 1080i25 · MPEG-2 TS', note: '1920×1080i 25, MP@HL 4:2:0, 15 Mb/s CBR, MPEG-1 Layer II 384k. European / PAL-region HD.',
    ext: 'ts', rates: [R25], size: { w: 1920, h: 1080 }, interlaced: true, chroma: '420', bitrate: 15_000_000, cbr: true, bufsize: 9_781_248, gop: 12, wrapper: 'mpegts', muxrate: 18_000_000, audio: { codec: 'mp2', bitrate: '384k' } },
  { id: 'contrib-422', group: 'Broadcast HD', label: 'Contribution 4:2:2 · 50 Mb/s TS', note: 'MPEG-2 422P@HL 1080i, 50 Mb/s CBR — satellite / fibre contribution links. 29.97 or 25.',
    ext: 'ts', rates: [R2997, R25], size: { w: 1920, h: 1080 }, interlaced: true, chroma: '422', bitrate: 50_000_000, cbr: true, bufsize: 17_825_792, gop: 12, wrapper: 'mpegts', muxrate: 55_000_000, audio: { codec: 'ac3', bitrate: '448k' } },
  { id: 'hdv-1080i', group: 'Broadcast HD', label: 'HDV 1080i · .m2t', note: '1440×1080i anamorphic 16:9, 25 Mb/s CBR, MP2 384k — for HDV decks and legacy servers. 29.97 or 25.',
    ext: 'm2t', rates: [R2997, R25], size: { w: 1440, h: 1080 }, interlaced: true, anamorphic: true, chroma: '420', bitrate: 25_000_000, cbr: true, bufsize: 9_781_248, gop: 15, wrapper: 'mpegts', audio: { codec: 'mp2', bitrate: '384k' } },
  // ── Broadcast servers: Sony XDCAM in OP1a MXF ──
  { id: 'xdcam-hd422', group: 'Broadcast servers (MXF)', label: 'XDCAM HD422 1080 · MXF', note: 'Sony XDCAM 50 Mb/s 4:2:2 long-GOP, OP1a MXF, 24-bit PCM. 1080i 29.97 / 25 or 1080p 23.98. The broadcast server standard.',
    ext: 'mxf', rates: [R2997, R25, R2398], size: { w: 1920, h: 1080 }, interlaced: true, chroma: '422', bitrate: 50_000_000, cbr: true, bufsize: 17_825_792, gop: 12, wrapper: 'mxf', audio: { codec: 'pcm_s24le' } },
  { id: 'xdcam-hd422-720p', group: 'Broadcast servers (MXF)', label: 'XDCAM HD422 720p · MXF', note: 'Sony XDCAM 50 Mb/s 4:2:2, 1280×720p 59.94 / 50, OP1a MXF, 24-bit PCM.',
    ext: 'mxf', rates: [R5994, R50], size: { w: 1280, h: 720 }, interlaced: false, chroma: '422', bitrate: 50_000_000, cbr: true, bufsize: 17_825_792, gop: 12, wrapper: 'mxf', audio: { codec: 'pcm_s24le' } },
  { id: 'xdcam-hd35', group: 'Broadcast servers (MXF)', label: 'XDCAM HD 35 · MXF', note: 'Sony XDCAM HD/EX: 1440×1080i anamorphic, 4:2:0, 35 Mb/s VBR, OP1a MXF, 16-bit PCM. 29.97 or 25.',
    ext: 'mxf', rates: [R2997, R25], size: { w: 1440, h: 1080 }, interlaced: true, anamorphic: true, chroma: '420', bitrate: 35_000_000, cbr: false, bufsize: 9_781_248, gop: 15, wrapper: 'mxf', audio: { codec: 'pcm_s16le' } },
  // ── DVD / SD ──
  { id: 'dvd-ntsc', group: 'DVD / SD', label: 'DVD-Video · NTSC', note: '720×480 29.97, MPEG-2 PS + AC-3. Burns with any DVD authoring tool.', ext: 'mpg', rates: [R2997], size: { w: 720, h: 480 }, interlaced: true },
  { id: 'dvd-pal', group: 'DVD / SD', label: 'DVD-Video · PAL', note: '720×576 25, MPEG-2 PS + AC-3.', ext: 'mpg', rates: [R25], size: { w: 720, h: 576 }, interlaced: true },
  // ── Master ──
  { id: 'ps-master', group: 'Master', label: 'MPEG-2 PS master', note: "Program stream at the sequence's own size and rate, high bitrate 4:2:0, MP2 audio.", ext: 'mpg', rates: [], size: null, interlaced: false },
];

export const mpeg2Preset = (id: Mpeg2PresetId) => MPEG2_PRESETS.find((p) => p.id === id) || MPEG2_PRESETS[0];

export const rateValue = (r: string) => { const [n, d] = r.split('/').map(Number); return d ? n / d : n; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

/** The spec rate closest to what was asked (or the sequence rate); the preset's default otherwise. */
export function pickRate(p: Mpeg2Preset, fps?: number): string {
  if (!p.rates.length) return fps ? String(fps) : R2997;
  if (fps) { const hit = p.rates.find((r) => near(rateValue(r), fps)); if (hit) return hit; }
  return p.rates[0];
}
/** Field-based at 25 / 29.97 on interlaced specs; 23.98p / 50p / 59.94p stay progressive. */
export const isInterlacedAt = (p: Mpeg2Preset, rate: string) => p.interlaced && (near(rateValue(rate), 25) || near(rateValue(rate), 30000 / 1001));

export interface DeliverOptions {
  /** Display aspect of the programme: DVD / SD presets letterbox or flag 16:9. */
  aspect?: '16:9' | '4:3';
  /** Wanted frame rate (sequence rate by default); snapped to what the spec allows. */
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
  const rate = pickRate(p, o.fps);
  const fields = isInterlacedAt(p, rate);
  // Interlaced deliverables: frames are flagged top-field-first in the filter chain (setfield) and
  // coded with interlaced motion + DCT; field_order also lands in the container (MXF/TS descriptors).
  const tff = fields ? ['-flags', '+ilme+ildct', '-field_order', 'tt'] : ['-field_order', 'progressive'];
  const fieldFilter = fields ? ',setfield=tff' : ',setfield=prog';

  if (presetId === 'dvd-ntsc' || presetId === 'dvd-pal') {
    const ntsc = presetId === 'dvd-ntsc';
    // -target sets the DVD muxer, GOP (15/12), VBV and bitrate caps. 6 Mb/s keeps ~90 min on a DVD-5.
    return [...base, '-vf', `${fitTo(720, ntsc ? 480 : 576, dar)},fps=${ntsc ? R2997 : R25},setfield=tff`,
      '-target', ntsc ? 'ntsc-dvd' : 'pal-dvd', '-aspect', dar, '-b:v', '6000k', '-maxrate', '9000k', '-flags', '+ilme+ildct', '-field_order', 'tt', ...(ntsc ? SD_NTSC : SD_PAL),
      '-c:a', 'ac3', '-b:a', '192k', '-ar', '48000', '-ac', '2', output];
  }
  if (presetId === 'ps-master' || !p.size) {
    return [...base, '-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '25M', '-maxrate', '35M', '-bufsize', '9781248',
      '-g', '15', '-bf', '2', '-intra_vlc', '1', '-non_linear_quant', '1', '-qmin', '1', '-qmax', '28',
      '-c:a', 'mp2', '-b:a', '384k', '-ar', '48000', '-f', 'vob', output];
  }

  // Spec-driven HD MPEG-2.
  const { w, h } = p.size;
  const picture = p.anamorphic
    // 1440-wide anamorphic: frame the programme as 16:9 first, then squeeze to 1440 with 4:3 pixels.
    ? `${fitTo(1920, 1080, '16:9')},scale=${w}:${h}:flags=lanczos,setsar=4/3`
    : fitTo(w, h, '16:9');
  const br = p.bitrate || 25_000_000;
  const rc = p.cbr
    ? ['-b:v', String(br), '-minrate', String(br), '-maxrate', String(br), '-bufsize', String(p.bufsize || 9_781_248), '-rc_init_occupancy', String(p.bufsize || 9_781_248)]
    : ['-b:v', String(Math.round(br * 0.85)), '-maxrate', String(br), '-bufsize', String(p.bufsize || 9_781_248)];
  const gop = p.gop ?? 15;
  const a = p.audio || { codec: 'ac3', bitrate: '384k' };
  const audio = ['-c:a', a.codec, ...(a.bitrate ? ['-b:a', a.bitrate] : []), '-ar', '48000', '-ac', '2'];
  const wrapper = p.wrapper === 'mxf'
    ? ['-f', 'mxf']
    : ['-f', 'mpegts', ...(p.muxrate ? ['-muxrate', String(p.muxrate)] : []), '-mpegts_service_id', '1', '-metadata', 'service_provider=Plajah Fabula'];
  return [...base, '-vf', `${picture},fps=${rate}${fieldFilter}`,
    '-c:v', 'mpeg2video', '-pix_fmt', p.chroma === '422' ? 'yuv422p' : 'yuv420p', ...rc,
    '-g', String(gop), '-bf', '2', '-intra_vlc', '1', '-non_linear_quant', '1', '-qmin', '1', '-qmax', p.chroma === '422' ? '12' : '28',
    ...(p.chroma === '422' ? ['-dc', '10', '-lmin', '1*QP2LAMBDA'] : []),
    ...tff, ...HD709, ...audio, ...wrapper, output];
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
