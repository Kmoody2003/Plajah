// ffmpeg recipes for disc-compliant elementary streams, run on the desktop engine
// (crossover_convert) — feature-length x265 encodes don't belong in a browser or a 5-minute
// cloud request. Each stream lands in its own MPEG-TS so PTS/DTS survive; our M2TS muxer re-packs them.
import type { DiscProject, DiscTitle, AudioTrack } from './project';
import { planBudget } from './budget';

const MASTER_DISPLAY: Record<string, string> = {
  // x265 master-display: G(x,y)B(x,y)R(x,y)WP(x,y)L(max,min) in 0.00002 / 0.0001 cd/m² units
  'P3-D65-1000': 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)',
  'P3-D65-4000': 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(40000000,50)',
  'BT2020-1000': 'G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(10000000,1)',
};

/** Pass 1 writes no video; a one-frame marker gives the desktop engine a file to confirm the job. */
export const pass1Sink = (output: string) => ['-f', 'null', 'NUL', '-map', '0:v:0', '-frames:v', '1', '-update', '1', '-f', 'image2', `${output}.pass1.jpg`];

const fpsArg = (fps: number) => (fps === 23.976 ? '24000/1001' : fps === 29.97 ? '30000/1001' : fps === 59.94 ? '60000/1001' : String(fps));

export interface EncodeJob { kind: 'video' | 'audio'; titleId: string; trackId?: string; args: string[]; output: string; passes: number; label: string }

/** H.264 High@4.1, Blu-ray compatible GOP/VBV, 1-second GOPs, closed-GOP at chapters. */
export function bdVideoArgs(p: DiscProject, t: DiscTitle, kbps: number, input: string, output: string, pass?: 1 | 2): string[] {
  const maxrate = Math.min(40000, Math.round(kbps * 1.6));
  const keyint = Math.round(p.video.fps) || 24;
  const chapters = t.chapters.map(c => c.timeSec.toFixed(3)).join(',');
  const x264 = [
    'bluray-compat=1', 'level=4.1', `vbv-maxrate=${maxrate}`, 'vbv-bufsize=30000', `keyint=${keyint}`, `min-keyint=1`,
    'open-gop=0', 'slices=4', 'b-pyramid=strict', 'weightp=1', 'nal-hrd=vbr', 'aud=1', 'colorprim=bt709', 'transfer=bt709', 'colormatrix=bt709',
    ...(p.video.scan === 'i' ? ['tff=1'] : []),
  ].join(':');
  return [
    '-y', '-i', input, '-map', '0:v:0', '-an', '-sn',
    '-vf', `scale=${p.video.w}:${p.video.h}:flags=lanczos,format=yuv420p`, '-r', fpsArg(p.video.fps),
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', `${kbps}k`, '-x264-params', x264,
    ...(chapters ? ['-force_key_frames', chapters] : []),
    ...(pass ? ['-pass', String(pass), '-passlogfile', `${output}.log`] : []),
    ...(pass === 1 ? pass1Sink(output) : ['-f', 'mpegts', output]),
  ];
}

/** HEVC Main10 for UHD: uhd-bd profile, HDR10 SEI (mastering display + content light level). */
export function uhdVideoArgs(p: DiscProject, t: DiscTitle, kbps: number, input: string, output: string, pass?: 1 | 2): string[] {
  const hdr = p.video.dynamic !== 'SDR709' && p.video.dynamic !== 'SDR2020';
  const maxrate = Math.min(98000, Math.round(kbps * 1.6));
  const chapters = t.chapters.map(c => c.timeSec.toFixed(3)).join(',');
  const x265 = [
    'uhd-bd=1', 'level-idc=5.1', 'high-tier=1', `vbv-maxrate=${maxrate}`, 'vbv-bufsize=99000', `keyint=${Math.round(p.video.fps)}`, 'min-keyint=1',
    'no-open-gop=1', 'repeat-headers=1', 'aud=1', 'hrd=1',
    ...(p.video.dynamic === 'SDR709'
      ? ['colorprim=bt709', 'transfer=bt709', 'colormatrix=bt709']
      : ['colorprim=bt2020', `transfer=${hdr ? 'smpte2084' : 'bt2020-10'}`, 'colormatrix=bt2020nc', 'range=limited', 'chromaloc=2']),
    ...(hdr && p.video.hdr ? ['hdr10=1', 'hdr10-opt=1', `master-display=${MASTER_DISPLAY[p.video.hdr.masterDisplay]}`, `max-cll=${p.video.hdr.maxCll},${p.video.hdr.maxFall}`] : []),
    ...(p.video.dynamic === 'HDR10PLUS' ? ['dhdr10-info=hdr10plus.json'] : []),
    ...(pass ? [`pass=${pass}`, `stats=${output}.stats`] : []),
  ].join(':');
  return [
    '-y', '-i', input, '-map', '0:v:0', '-an', '-sn',
    '-vf', `scale=${p.video.w}:${p.video.h}:flags=lanczos,format=yuv420p10le`, '-r', fpsArg(p.video.fps),
    '-c:v', 'libx265', '-preset', 'slow', '-profile:v', 'main10', '-b:v', `${kbps}k`, '-x265-params', x265,
    ...(chapters ? ['-force_key_frames', chapters] : []),
    ...(pass === 1 ? pass1Sink(output) : ['-f', 'mpegts', output]),
  ];
}

/** LPCM (Blu-ray big-endian, 48 kHz 24-bit) or AC-3 at the track's rate. */
export function audioArgs(a: AudioTrack, input: string, output: string): string[] {
  const map = a.sourcePath ? ['-i', a.sourcePath, '-map', '1:a:0'] : ['-map', `0:a:${a.sourceIndex ?? 0}`];
  const layout = a.channels === 8 ? '7.1' : a.channels === 6 ? '5.1' : 'stereo';
  const common = ['-y', '-i', input, ...map, '-vn', '-ar', '48000', '-af', `aresample=48000,aformat=channel_layouts=${layout}`];
  if (a.codec === 'lpcm') return [...common, '-c:a', 'pcm_bluray', '-f', 'mpegts', output];
  if (a.codec === 'ac3') return [...common, '-c:a', 'ac3', '-b:a', `${Math.min(640, a.kbps)}k`, '-f', 'mpegts', output];
  throw new Error(`${a.codec} needs a licensed encoder — import a pre-encoded stream instead.`);
}

/** The full job list for a project, in run order (two-pass video, then audio). */
export function planEncodes(p: DiscProject, inputFor: (t: DiscTitle) => string, outDir: string): EncodeJob[] {
  const budget = planBudget(p);
  const jobs: EncodeJob[] = [];
  const sep = outDir.includes('\\') ? '\\' : '/';
  p.titles.forEach((t, i) => {
    const kbps = budget.titles.find(b => b.titleId === t.id)?.videoKbps || 8000;
    const n = String(i + 1).padStart(5, '0');
    const out = `${outDir}${sep}${n}_v.ts`;
    const fn = p.format === 'UHD' ? uhdVideoArgs : bdVideoArgs;
    jobs.push({ kind: 'video', titleId: t.id, args: fn(p, t, kbps, inputFor(t), out, 1), output: `${out}.pass1.jpg`, passes: 2, label: `${t.name} · video pass 1` });
    jobs.push({ kind: 'video', titleId: t.id, args: fn(p, t, kbps, inputFor(t), out, 2), output: out, passes: 2, label: `${t.name} · video pass 2 @ ${(kbps / 1000).toFixed(1)} Mbit/s` });
    t.audio.forEach((a, k) => {
      const aout = `${outDir}${sep}${n}_a${k}.ts`;
      if (!AUDIO_ENCODABLE.has(a.codec)) return;
      jobs.push({ kind: 'audio', titleId: t.id, trackId: a.id, args: audioArgs(a, inputFor(t), aout), output: aout, passes: 1, label: `${t.name} · ${a.label}` });
    });
  });
  return jobs;
}

export const AUDIO_ENCODABLE = new Set(['lpcm', 'ac3']);

/** Menu background clip: colour / still image / a looped stretch of a title, same codec as the disc. */
export interface MenuOverlay {
  /** The menu's static Tela art (1920×1080 PNG with alpha). */
  artPng?: string;
  /** Moving Tela light layers: PNG + path, drawn under the static art (same order as the preview). */
  layers?: { png: string; w: number; h: number; from: [number, number]; to: [number, number]; periodSec: number; ease: 'sine' | 'linear'; opacity?: number }[];
  flicker?: { amount: number; hz: number };
  grain?: number;
}

/** ffmpeg filtergraph for the overlay. Positions/sizes are on the 1920×1080 plane, scaled to the video. */
export function menuOverlayFilter(p: DiscProject, o: MenuOverlay, firstInput = 1): { graph: string; inputs: string[] } {
  const k = p.video.w / 1920;
  const inputs: string[] = [];
  const parts: string[] = [`[0:v]scale=${p.video.w}:${p.video.h}:flags=lanczos,setsar=1,format=yuva420p[v0]`];
  let cur = 'v0', n = firstInput, step = 0;
  for (const l of o.layers || []) {
    inputs.push('-loop', '1', '-i', l.png);
    const motion = (a: number, b: number) => l.ease === 'sine' ? `${(a * k).toFixed(1)}+${((b - a) * k).toFixed(1)}*(0.5-0.5*cos(2*PI*t/${l.periodSec}))` : `${(a * k).toFixed(1)}+${((b - a) * k).toFixed(1)}*mod(t,${l.periodSec})/${l.periodSec}`;
    const alpha = l.opacity != null && l.opacity < 1 ? `,colorchannelmixer=aa=${l.opacity}` : '';
    parts.push(`[${n}:v]scale=${Math.round(l.w * k)}:${Math.round(l.h * k)},format=rgba${alpha}[l${step}]`);
    parts.push(`[${cur}][l${step}]overlay=x='${motion(l.from[0], l.to[0])}':y='${motion(l.from[1], l.to[1])}':eval=frame:shortest=0[v${step + 1}]`);
    cur = `v${step + 1}`; n++; step++;
  }
  if (o.artPng) {
    inputs.push('-loop', '1', '-i', o.artPng);
    parts.push(`[${n}:v]scale=${p.video.w}:${p.video.h},format=rgba[art]`, `[${cur}][art]overlay=0:0:shortest=0[va]`);
    cur = 'va'; n++;
  }
  const post: string[] = [];
  if (o.flicker) post.push(`eq=brightness='${o.flicker.amount}*(0.6*sin(2*PI*${o.flicker.hz}*t)+0.4*sin(2*PI*${(o.flicker.hz * 2.7).toFixed(3)}*t+1.3))':eval=frame`);
  if (o.grain) post.push(`noise=alls=${Math.round(o.grain)}:allf=t`);
  parts.push(`[${cur}]${post.length ? post.join(',') + ',' : ''}format=${p.format === 'UHD' ? 'yuv420p10le' : 'yuv420p'}[vout]`);
  return { graph: parts.join(';'), inputs };
}

export function menuBackgroundArgs(p: DiscProject, bg: { kind: string; value: string; fromSec?: number; loopSec?: number }, titleInput: string | undefined, output: string, overlay?: MenuOverlay): string[] {
  const sec = bg.kind === 'video' || bg.kind === 'title' ? Math.max(2, bg.loopSec || 30) : 1;
  const size = `${p.video.w}x${p.video.h}`;
  const rate = fpsArg(p.video.fps);
  const input = bg.kind === 'title' && titleInput ? ['-ss', String(bg.fromSec || 0), '-t', String(sec), '-i', titleInput]
    : bg.kind === 'video' && bg.value ? ['-t', String(sec), '-i', bg.value]
    : bg.kind === 'image' && bg.value ? ['-loop', '1', '-t', String(sec), '-i', bg.value]
    : ['-f', 'lavfi', '-t', String(sec), '-i', `color=c=${(bg.value && bg.value.startsWith('#') ? bg.value : '#0b0b10').replace('#', '0x')}:s=${size}:r=${rate}`];
  const uhd = p.format === 'UHD';
  const codec = uhd
    ? ['-c:v', 'libx265', '-preset', 'medium', '-profile:v', 'main10', '-pix_fmt', 'yuv420p10le', '-b:v', '20000k', '-x265-params', `uhd-bd=1:level-idc=5.1:keyint=${Math.round(p.video.fps)}:no-open-gop=1:repeat-headers=1:aud=1:hrd=1:vbv-maxrate=40000:vbv-bufsize=60000`]
    : ['-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', '15000k', '-x264-params', `bluray-compat=1:level=4.1:vbv-maxrate=30000:vbv-bufsize=30000:keyint=${Math.round(p.video.fps)}:open-gop=0:slices=4:nal-hrd=vbr:aud=1`];
  if (overlay && (overlay.artPng || overlay.layers?.length || overlay.flicker || overlay.grain)) {
    const f = menuOverlayFilter(p, overlay);
    // Motion layers need time to move: a still background becomes a loop when anything animates.
    const loop = overlay.layers?.length || overlay.flicker ? Math.max(sec, 12) : sec;
    const base = loop !== sec ? input.map(a => (a === String(sec) ? String(loop) : a)) : input;
    return ['-y', ...base, ...f.inputs, '-filter_complex', f.graph, '-map', '[vout]', '-an', '-r', rate, ...codec, '-t', String(loop), '-f', 'mpegts', output];
  }
  return ['-y', ...input, '-map', '0:v:0', '-an', '-vf', `scale=${size}:flags=lanczos,setsar=1`, '-r', rate, ...codec, '-t', String(sec), '-f', 'mpegts', output];
}
