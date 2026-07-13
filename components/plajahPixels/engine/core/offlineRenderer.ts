// offlineRenderer.ts — the offline, accelerated, NON-realtime renderer.
//
// Steps the scene timeline frame-by-frame (t = N/fps), and for each frame:
//   • computes the audio spectrum at EXACTLY t from the decoded buffer (OfflineAudio)
//   • renders the active scene's layers through the same GPU Compositor the live
//     engine uses — generators with injected time+audio, media seeked to the frame
//   • encodes the frame (WebCodecs H.264) + muxes the song's audio (AAC)
// Because time and audio are pure functions of the frame index, the output is
// frame/beat/sample-accurate — a traditional editor-style render, not a screen grab.
//
// Renders generator + shader + node-graph + media + color + text/title layers, plus
// MILKDROP (butterchurn driven deterministically from the stored waveform — see
// milkdropDriver), the global color grade, baked-in camera shake, and the music track.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Compositor, LayerInput, ShakeParams } from './compositor';
import { GeneratorRenderer, hasGenerator, hexToRgb } from './generators';
import { ShaderRenderer } from './shaderRenderer';
import { createMilkdropDriver, MilkdropDriver } from './milkdropDriver';
import { NodeGraphRenderer } from './nodeGraph';
import { AudioTexture } from './audioTexture';
import { OfflineAudio } from './offlineAudio';
import { MusicAnalysis, analysisAt } from './musicAnalysis';
import { AudioDriverSampler } from '../audioDrivers';
import { getTextCanvas } from './textLayer';
import { getTitleCanvas } from './titleLayer';
import { SceneTimeline, RenderLayer, activeBlockAt, localTime } from '../timeline/sceneTimeline';

export interface RenderOptions {
  timeline?: SceneTimeline;              // single-track Pixels path (activeBlockAt)
  /** Multi-track path: return the composited layers (bottom→top) at time t, each
   *  carrying its own `time`. Takes precedence over `timeline`. */
  resolveLayers?: (t: number) => RenderLayer[];
  duration?: number;                     // total seconds (required when using resolveLayers)
  audioBuffer: AudioBuffer | null;
  config: any;            // VisualizationConfig — colorPalette + grade* fields
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  /** Fast mode: don't WAIT for each video seek to land (draw the nearest decoded
   *  frame). Generators/shaders/text are unaffected (no seeking); media timing is
   *  approximate but the render no longer stalls seconds-per-frame. */
  fast?: boolean;
  /** Precomputed stored analysis — drives the visuals deterministically (and skips
   *  the per-frame FFT). If absent, the song buffer is analyzed on the fly. */
  analysis?: MusicAnalysis;
  onProgress?: (p: number, stage: string) => void;
  signal?: AbortSignal;
}

const VIDEO_CODECS = ['avc1.4D0033', 'avc1.4D0028', 'avc1.42E01F']; // Main 5.1 → Main 4.0 → Baseline

interface PickedCodec { codec: string; hardwareAcceleration: 'prefer-hardware' | 'no-preference'; }

async function pickVideoCodec(width: number, height: number, bitrate: number, fps: number): Promise<PickedCodec | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  // Prefer HARDWARE encode (Intel Arc QuickSync / NVENC / VideoToolbox). Software 1080p
  // H.264 is the render-speed killer — it's what makes a song take an hour. We also probe
  // with latencyMode 'realtime' so the chosen config matches the throughput-optimized
  // configure() below (the default 'quality' mode runs slow multi-pass analysis).
  for (const hw of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of VIDEO_CODECS) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: 'realtime' });
        if (s.supported) return { codec, hardwareAcceleration: hw };
      } catch { /* try next */ }
    }
  }
  return null;
}

// Per-element record of the SOURCE frame currently presented (mediaTime + measured frame
// duration from rVFC metadata). Lets the render loop skip seeks entirely when the requested
// time still falls inside the frame already on screen — the dominant per-frame cost when the
// render fps exceeds the source fps, and a large chunk of it even at matched rates.
const presented = new WeakMap<HTMLVideoElement, { mediaTime: number; frameDur: number }>();

function seekVideo(v: HTMLVideoElement, t: number, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    // 'seeked' means the seek COMPLETED internally — but the decoded frame can be presented one
    // tick later on some GPUs, so sampling immediately grabs the PREVIOUS frame (renders came out
    // with duplicated/juddery frames). requestVideoFrameCallback is the actual "new frame is
    // presented" signal; wait for it (short-capped) after the seek before letting the compositor
    // texture the element.
    const target = Math.max(0, Math.min(t, (v.duration || t) - 0.0005));
    // FAST PATH 1: the target lies within the source frame already presented → the correct
    // pixels are already on screen; no seek, no wait, no rVFC. (Same-frame currentTime writes
    // also don't reliably fire 'seeked', so this doubles as the hang guard.)
    const cur = presented.get(v);
    if (cur && v.readyState >= 2 && target >= cur.mediaTime - 1e-4 && target < cur.mediaTime + cur.frameDur - 1e-4) { resolve(); return; }
    if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) { resolve(); return; }
    let done = false;
    const settle = () => {
      if (done) return; done = true;
      if (typeof (v as any).requestVideoFrameCallback === 'function') {
        let fired = false;
        const cap = setTimeout(() => { if (!fired) { fired = true; resolve(); } }, 80);
        (v as any).requestVideoFrameCallback((_now: number, meta: any) => {
          if (meta && typeof meta.mediaTime === 'number') {
            const prev = presented.get(v);
            // measure the source frame duration from consecutive presentations (fallback 1/30)
            const dur = prev && meta.mediaTime > prev.mediaTime && meta.mediaTime - prev.mediaTime < 0.5
              ? meta.mediaTime - prev.mediaTime
              : (prev?.frameDur || 1 / 30);
            presented.set(v, { mediaTime: meta.mediaTime, frameDur: dur });
          }
          if (!fired) { fired = true; clearTimeout(cap); resolve(); }
        });
      } else resolve();
    };
    const finish = () => { v.removeEventListener('seeked', finish); clearTimeout(timer); settle(); };
    const timer = setTimeout(finish, timeoutMs);
    v.addEventListener('seeked', finish);
    try { v.currentTime = target; } catch { finish(); }
  });
}

async function loadMediaEl(url: string, type: 'video' | 'image'): Promise<HTMLVideoElement | HTMLImageElement | null> {
  try {
    if (type === 'image') {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
      await img.decode().catch(() => new Promise<void>((r, j) => { img.onload = () => r(); img.onerror = () => j(new Error('img')); }));
      return img;
    }
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    // Wait for the clip to be fully buffered (canplaythrough) so per-frame seeks are
    // instant rather than stalling on range fetches — the main render-speed killer.
    await new Promise<void>((res, rej) => {
      let done = false; const ok = () => { if (!done) { done = true; res(); } };
      v.oncanplaythrough = ok;
      v.onloadeddata = () => setTimeout(ok, 1200); // fallback if canplaythrough never fires
      v.onerror = () => { if (!done) { done = true; rej(new Error('video')); } };
      setTimeout(ok, 12000);                       // hard cap so a stuck load can't hang the render
    });
    return v;
  } catch { return null; }
}

/** Render the timeline to an MP4 Blob, or null on failure / unsupported / abort. */
export async function renderTimeline(opts: RenderOptions): Promise<Blob | null> {
  const { timeline, resolveLayers, audioBuffer, config, fps, fast, analysis, onProgress, signal } = opts;
  const width = Math.max(2, Math.round(opts.width / 2) * 2);
  const height = Math.max(2, Math.round(opts.height / 2) * 2);
  const bitrate = opts.bitrate ?? Math.round(Math.min(24_000_000, Math.max(8_000_000, width * height * fps * 0.12)));

  const picked = await pickVideoCodec(width, height, bitrate, fps);
  if (!picked) { console.warn('[Pixels render] WebCodecs H.264 unavailable in this browser'); return null; }
  const { codec, hardwareAcceleration } = picked;
  if (hardwareAcceleration !== 'prefer-hardware') console.warn('[Pixels render] no hardware H.264 encoder — falling back to software (slower).');

  const durationSec = timeline?.duration ?? opts.duration ?? 0;
  const total = Math.max(1, Math.ceil(durationSec * fps));
  const aborted = () => signal?.aborted;

  // GL stack (offscreen, headless) — same classes the live engine uses.
  const canvas = new OffscreenCanvas(width, height);
  let comp: Compositor;
  try { comp = new Compositor(canvas as any); }
  catch (e) { console.warn('[Pixels render] WebGL2 unavailable:', e); return null; }
  comp.resize(width, height);
  const gen = new GeneratorRenderer(comp.gl);
  const shaderRend = new ShaderRenderer(comp.gl);
  const graphRend = new NodeGraphRenderer(comp.gl);
  const audioTex = new AudioTexture(comp.gl);
  const offAudio = audioBuffer ? new OfflineAudio(audioBuffer) : null;

  // Media elements, loaded once and seeked per frame.
  const mediaEls = new Map<string, HTMLVideoElement | HTMLImageElement | null>();
  const getMedia = async (url: string, type: 'video' | 'image') => {
    if (!mediaEls.has(url)) mediaEls.set(url, await loadMediaEl(url, type));
    return mediaEls.get(url) ?? null;
  };
  // Milkdrop (butterchurn) drivers — created lazily per layer, driven deterministically
  // from the stored waveform (no live analyser) so the export is reproducible. Each
  // renders to its own canvas which we composite as an element layer.
  const milkDrivers = new Map<string, MilkdropDriver | null>();
  const milkPreset = new Map<string, string | number>();
  let bcAudioCtx: AudioContext | null = null;
  const getMilkdrop = async (id: string, preset: string | number): Promise<MilkdropDriver | null> => {
    if (!milkDrivers.has(id)) {
      bcAudioCtx = bcAudioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
      const d = await createMilkdropDriver({ width, height, audioCtx: bcAudioCtx, fps });
      if (d) { d.setPreset(preset); milkPreset.set(id, preset); }
      milkDrivers.set(id, d);
    }
    const d = milkDrivers.get(id) || null;
    if (d && milkPreset.get(id) !== preset) { d.setPreset(preset, 0); milkPreset.set(id, preset); }
    return d;
  };

  const colorCanvases = new Map<string, HTMLCanvasElement>();
  const colorEl = (hex: string) => {
    let c = colorCanvases.get(hex);
    if (!c) { c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d')!; x.fillStyle = hex; x.fillRect(0, 0, 4, 4); colorCanvases.set(hex, c); }
    return c;
  };

  // Muxer + encoders.
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(audioBuffer ? { audio: { codec: 'aac' as const, numberOfChannels: Math.min(2, audioBuffer.numberOfChannels), sampleRate: audioBuffer.sampleRate } } : {}),
    fastStart: 'in-memory',
  });

  let encErr: any = null;
  const videoEnc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
  // realtime = throughput over the default multi-pass 'quality' analysis; prefer-hardware
  // routes to the GPU encoder. Together these are the difference between minutes and an hour.
  videoEnc.configure({ codec, width, height, bitrate, framerate: fps, hardwareAcceleration, latencyMode: 'realtime' });

  const gopFrames = Math.max(1, Math.round(fps * 2)); // keyframe every 2s
  const palette = (config.colorPalette || []).slice(0, 3).map(hexToRgb);
  const grade = {
    brightness: config.gradeBrightness ?? 1, contrast: config.gradeContrast ?? 1,
    saturation: config.gradeSaturation ?? 1, gamma: config.gradeGamma ?? 1,
  };
  // Camera shake — same drum/intensity model as live, but fed deterministically
  // from the offline FFT so it bakes into the rendered file on the right beats.
  const wantShake = !!config.enableBassShake;
  const shakeInt = config.bassShakeIntensity ?? 1;
  const shakeSampler = new AudioDriverSampler();
  let shakeAmp = 0;

  try {
    // ── Video pass ──────────────────────────────────────────────────────────
    for (let i = 0; i < total; i++) {
      if (aborted()) throw new Error('aborted');
      if (encErr) throw encErr;
      const t = i / fps;

      let shake: ShakeParams | undefined;
      // Prefer the stored analysis (deterministic, no per-frame FFT); else analyze live.
      const aud = analysis ? analysisAt(analysis, t) : (offAudio ? offAudio.sample(t) : null);
      if (aud) {
        audioTex.updateFromArrays(aud.freq, aud.wave);
        if (wantShake) {
          shakeSampler.updateFromArray(aud.freq, t * 1000, audioBuffer?.sampleRate || offAudio?.sampleRate || 48000);
          const target = shakeSampler.intensity * 0.4 + shakeSampler.density * 0.55;
          shakeAmp = Math.max(shakeAmp * 0.82, target);
          if (shakeSampler.isSnare) shakeAmp = Math.min(1.6, shakeAmp + 0.9);
          if (shakeSampler.isKick)  shakeAmp = Math.min(1.6, shakeAmp + 0.4);
          const amp = shakeAmp * shakeInt;
          if (amp > 0.01) {
            const mag = amp * 14;
            const ang = (Math.random() - 0.5) * amp * 0.015;
            shake = { offX: ((Math.random() - 0.5) * mag) / width, offY: ((Math.random() - 0.5) * mag) / height, sin: Math.sin(ang), cos: Math.cos(ang), scale: 1 + amp * 0.03 };
          }
        }
      }

      const inputs: LayerInput[] = [];
      // Multi-track resolver wins; else the single-track Pixels timeline (activeBlockAt).
      let layers: RenderLayer[];
      if (resolveLayers) {
        layers = resolveLayers(t);
      } else if (timeline) {
        const block = activeBlockAt(timeline, t);
        const lt = block ? localTime(block, t) : 0;
        layers = block ? block.snapshot.layers.map(l => ({ ...l, time: lt })) : [];
      } else { layers = []; }

      for (const layer of layers) {
        const clip = layer.clip;
        const lt = layer.time ?? 0;
        const opacity = Math.max(0, Math.min(1, (layer.opacity ?? 1) * (clip.opacity ?? 1)));
        if (clip.type === 'generator' && clip.sceneMode && hasGenerator(clip.sceneMode)) {
          const tex = gen.render(layer.id, clip.sceneMode, width, height, { time: lt, audio: audioTex, colors: palette, params: clip.params || [] });
          inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'media' && clip.mediaUrl) {
          const el = await getMedia(clip.mediaUrl, clip.mediaType ?? 'video');
          if (el instanceof HTMLVideoElement) {
            const dur = el.duration || 0;
            let st = lt;
            if (dur > 0) st = st % dur; // loop the source within the clip
            if (fast) { try { el.currentTime = st; } catch { /* */ } } // no wait — nearest ready frame
            else await seekVideo(el, st);
            inputs.push({ element: el, opacity, blendMode: layer.blendMode, transform: layer.transform });
          } else if (el instanceof HTMLImageElement) {
            inputs.push({ element: el, opacity, blendMode: layer.blendMode, transform: layer.transform });
          }
        } else if (clip.type === 'color' && clip.fillColor) {
          inputs.push({ element: colorEl(clip.fillColor), opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'text' && clip.text) {
          inputs.push({ element: getTextCanvas(clip.text, clip.fillColor), opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'title' && clip.text) {
          const tc = clip as any; // Fabula titler overrides ride along on the clip
          inputs.push({ element: getTitleCanvas(clip.text, clip.subtitle, clip.titleStyle, clip.fillColor, { font: tc.tFont, color: tc.tColor, subColor: tc.tSubColor, size: tc.tSize, x: tc.tx, y: tc.ty }), opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'shader' && clip.shaderSrc) {
          const tex = shaderRend.render(layer.id, clip.shaderSrc, width, height, { time: lt, audio: audioTex, params: clip.params || [] });
          inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'nodegraph' && clip.graph) {
          const tex = graphRend.evaluate(clip.graph, width, height, { time: lt, audio: audioTex, colors: palette });
          if (tex) inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform });
        } else if (clip.type === 'milkdrop') {
          const preset = clip.milkdropName ?? clip.milkdropIdx ?? 0;
          const d = await getMilkdrop(layer.id, preset);
          if (d) {
            d.renderFrame(aud ? aud.wave : null);   // inject stored waveform → deterministic
            inputs.push({ element: d.canvas, opacity, blendMode: layer.blendMode, transform: layer.transform });
          }
        }
      }

      comp.render(inputs, grade, shake);
      const frame = new VideoFrame(canvas as any, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
      videoEnc.encode(frame, { keyFrame: i % gopFrames === 0 });
      frame.close();

      // Let the encoder pipeline run deep before waiting (more parallelism = faster).
      while (videoEnc.encodeQueueSize > 24) { if (aborted()) throw new Error('aborted'); await new Promise(r => setTimeout(r, 1)); }
      // Yield to the browser only occasionally (keeps the tab alive without throttling
      // the render to the event-loop tick) — generator/shader renders then run far
      // faster than real time.
      if (i % 24 === 0) { onProgress?.(i / total * 0.92, 'Rendering frames'); await new Promise(r => setTimeout(r, 0)); }
    }
    await videoEnc.flush();
    if (encErr) throw encErr;

    // ── Audio pass (AAC) ────────────────────────────────────────────────────
    if (audioBuffer && typeof AudioEncoder !== 'undefined') {
      onProgress?.(0.94, 'Encoding audio');
      const chs = Math.min(2, audioBuffer.numberOfChannels);
      const sr = audioBuffer.sampleRate;
      let audioErr: any = null;
      const audioEnc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { audioErr = e; } });
      audioEnc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: chs, bitrate: 192_000 });
      const CH = audioBuffer.getChannelData(0);
      const CH1 = chs > 1 ? audioBuffer.getChannelData(1) : null;
      const BLK = 4096;
      for (let off = 0; off < CH.length; off += BLK) {
        if (audioErr) break;
        const n = Math.min(BLK, CH.length - off);
        const planar = new Float32Array(n * chs);
        planar.set(CH.subarray(off, off + n), 0);
        if (CH1) planar.set(CH1.subarray(off, off + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: chs, timestamp: Math.round(off / sr * 1e6), data: planar });
        audioEnc.encode(ad); ad.close();
        while (audioEnc.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 3));
      }
      await audioEnc.flush();
      audioEnc.close();
      if (audioErr) console.warn('[Pixels render] audio encode failed — video-only output:', audioErr);
    }

    muxer.finalize();
    const buf = (muxer.target as ArrayBufferTarget).buffer;
    onProgress?.(1, 'Done');
    if (!buf || buf.byteLength < 1024) return null;
    return new Blob([buf], { type: 'video/mp4' });
  } catch (e) {
    console.warn('[Pixels render] failed:', (e as Error)?.message || e);
    return null;
  } finally {
    try { videoEnc.state !== 'closed' && videoEnc.close(); } catch { /* */ }
    gen.dispose(); shaderRend.dispose(); graphRend.dispose(); audioTex.dispose(); comp.dispose();
    mediaEls.forEach(el => { if (el instanceof HTMLVideoElement) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ } } });
    milkDrivers.forEach(d => { try { d?.dispose(); } catch { /* */ } });
    try { bcAudioCtx?.close(); } catch { /* */ }
  }
}
