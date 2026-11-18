// Themed Shows — render the whole experience to a video file, on-device.
// Frame-by-frame (deterministic, never drops a frame), WebCodecs via mediabunny, with the
// music mixed offline: playlist in order or a loop, repeating until every photo has had
// its full time, faded in at the start and out with the closing card.

import type { ShowSpec } from './types';
import { ShowRuntime } from './showRuntime';
import { musicCues } from './planner';

export interface RenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  format?: 'mp4' | 'webm';
  withMusic?: boolean;
  onProgress?: (k: number, label: string) => void;
  signal?: AbortSignal;
}

export async function decodeTrack(src: string, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Could not load music (${r.status})`);
  return ctx.decodeAudioData(await r.arrayBuffer());
}

/** Probe each track's duration (needed by the planner for playlist fit). */
export async function probeTrackDurations(spec: ShowSpec): Promise<ShowSpec> {
  const tracks = await Promise.all(spec.music.tracks.map(async (t) => {
    if (t.duration) return t;
    const d = await new Promise<number>((res) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => res(0);
      a.src = t.src;
    });
    return { ...t, duration: d };
  }));
  return { ...spec, music: { ...spec.music, tracks } };
}

/** Mix the music bed for a show of `total` seconds. */
export async function mixMusic(spec: ShowSpec, total: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  const cues = musicCues(spec, total);
  if (!cues.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const decoded = new Map<number, AudioBuffer>();
  for (const c of cues) if (!decoded.has(c.trackIndex)) decoded.set(c.trackIndex, await decodeTrack(spec.music.tracks[c.trackIndex].src, ctx));
  const master = ctx.createGain();
  const vol = spec.music.volume ?? 0.8;
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(vol, Math.min(3, total / 4));
  master.gain.setValueAtTime(vol, Math.max(0, total - 5));
  master.gain.linearRampToValueAtTime(0, total);
  master.connect(ctx.destination);
  const XF = 1.5; // soft overlap between tracks / loop repeats
  cues.forEach((c, k) => {
    const src = ctx.createBufferSource();
    src.buffer = decoded.get(c.trackIndex)!;
    const g = ctx.createGain();
    const at = Math.max(0, c.at - (k ? XF : 0));
    g.gain.setValueAtTime(k ? 0 : 1, at);
    if (k) g.gain.linearRampToValueAtTime(1, at + XF);
    const end = Math.min(total, c.at + c.length);
    g.gain.setValueAtTime(1, Math.max(at, end - XF));
    g.gain.linearRampToValueAtTime(k === cues.length - 1 ? 1 : 0, end);
    src.connect(g).connect(master);
    src.start(at, c.offset, end - at + 0.01);
  });
  return ctx.startRendering();
}

export async function renderShowVideo(spec: ShowSpec, o: RenderOptions = {}): Promise<Blob> {
  const W = o.width ?? 1920, H = o.height ?? 1080, fps = o.fps ?? 30;
  const format = o.format ?? 'mp4';
  const mb = await import('mediabunny');
  const { Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, AudioBufferSource, QUALITY_HIGH, canEncodeVideo, canEncodeAudio } = mb as any;
  const vCodecs = format === 'webm' ? ['vp9', 'vp8'] : ['avc', 'hevc'];
  let vCodec: string | null = null;
  for (const c of vCodecs) if (await canEncodeVideo(c, { width: W, height: H }).catch(() => false)) { vCodec = c; break; }
  if (!vCodec) throw new Error("This browser can't encode video at that size. Try 1280×720 or WebM.");

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const rt = new ShowRuntime(canvas, spec, { width: W, height: H, pixelRatio: 1 });
  try {
    o.onProgress?.(0, 'Building the scene');
    await rt.load((k, label) => o.onProgress?.(k * 0.08, label));
    const total = rt.duration;

    const target = new BufferTarget();
    const output = new Output({ format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const video = new CanvasSource(canvas, { codec: vCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(video, { frameRate: fps });

    let audio: any = null;
    let bed: AudioBuffer | null = null;
    if (o.withMusic !== false && spec.music.mode !== 'none' && spec.music.tracks.length) {
      o.onProgress?.(0.08, 'Mixing the music');
      bed = await mixMusic(spec, total);
      const aCodec = format === 'webm' ? 'opus' : 'aac';
      if (bed && (await canEncodeAudio(aCodec).catch(() => false))) {
        audio = new AudioBufferSource({ codec: aCodec, bitrate: 192_000 });
        output.addAudioTrack(audio);
      }
    }

    await output.start();
    const frames = Math.ceil(total * fps);
    for (let f = 0; f < frames; f++) {
      if (o.signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');
      const t = f / fps;
      await rt.frame(t);
      await video.add(t, 1 / fps);
      if (f % 15 === 0) o.onProgress?.(0.1 + 0.88 * (f / frames), `Rendering ${fmt(t)} / ${fmt(total)}`);
    }
    if (audio && bed) await audio.add(bed);
    o.onProgress?.(0.99, 'Finishing the file');
    await output.finalize();
    o.onProgress?.(1, 'Done');
    return new Blob([target.buffer!], { type: format === 'webm' ? 'video/webm' : 'video/mp4' });
  } finally {
    rt.dispose();
  }
}

function fmt(s: number) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
