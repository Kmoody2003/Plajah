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
import { segmentSubject } from '../../../../services/fabula/subjectMatte';
import { estimateDepth, depthRangeCanvas } from '../../../../services/fabula/depthMatte';
import { segmentSam } from '../../../../services/fabula/samMatte';
import { renderModel3d } from './model3d';
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
import { getLowerThirdCanvas } from './lowerThirdLayer';
import { findLowerThird } from '../../../../services/fabula/lowerThirdRegistry';
import { materialShaderSource } from '../presets/materialShaders';
import { SceneTimeline, RenderLayer, activeBlockAt, localTime } from '../timeline/sceneTimeline';
import { normalizeVideoFrameRate, videoFrameTiming } from '../../../../services/videoFrameRate';
import type { CubeLutData } from '../../../../services/fabula/cubeLut';
import { getEffect } from '../fx/effects';
import { TextOverlayCache } from '../../../../services/fabula/textOverlay';
import { meshAuxElement } from '../../../../services/fabula/meshTrack';

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
  cubeLut?: CubeLutData | null;
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

// Per-element record of the SOURCE frame currently presented. frameDur is the MINIMUM positive
// delta ever observed between presentations — the only safe estimate of the true source frame
// duration (averaging consecutive deltas OVERESTIMATES it when the render fps is below the
// source fps, which made the skip window too wide and duplicated frames on 60fps clips — the
// "some clips stutter in exports" regression). The skip only engages after 3 measurements and
// only within 60% of that minimum — correctness beats speed here.
const presented = new WeakMap<HTMLVideoElement, { mediaTime: number; frameDur: number; samples: number }>();

function seekVideo(v: HTMLVideoElement, t: number, timeoutMs = 2500): Promise<void> {
  // ALWAYS RESOLVES — never rejects. A paused seek presents exactly ONE frame (the nearest
  // decodable frame ≤ target); that frame IS the seek result and must be used, even when it sits
  // a little before the target. Rejecting on an "imperfect" frame here failed the whole render on
  // essentially every seek — the render-failure regression. We wait for the presentation for
  // accuracy, but if the display/GPU misses the callback we fall through and use what's there.
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(t, (v.duration || t) - 0.0005));
    // FAST PATH (conservative): target provably inside the frame already presented.
    const cur = presented.get(v);
    if (cur && cur.samples >= 3 && v.readyState >= 2
      && target >= cur.mediaTime - 1e-4 && target < cur.mediaTime + cur.frameDur * 0.6) { resolve(); return; }
    let done = false;
    const settle = () => {
      if (done) return; done = true;
      if (typeof (v as any).requestVideoFrameCallback === 'function') {
        let fired = false;
        // Cap the present-wait so a missed callback can't stall the render; resolve with
        // whatever frame is on the element (never fail).
        const cap = setTimeout(() => { if (!fired) { fired = true; resolve(); } }, 300);
        (v as any).requestVideoFrameCallback((_now: number, meta: any) => {
          if (meta && typeof meta.mediaTime === 'number') {
            const prev = presented.get(v);
            const delta = prev ? meta.mediaTime - prev.mediaTime : 0;
            const frameDur = prev && delta > 0.001 && delta < 0.5
              ? Math.min(prev.frameDur, delta)          // min-track → true source frame duration
              : (prev?.frameDur ?? 1 / 120);            // pessimistic default until measured
            presented.set(v, { mediaTime: meta.mediaTime, frameDur, samples: (prev?.samples || 0) + (delta > 0.001 ? 1 : 0) });
          }
          if (!fired) { fired = true; clearTimeout(cap); resolve(); }
        });
      } else resolve();
    };
    const finish = () => { v.removeEventListener('seeked', finish); clearTimeout(timer); settle(); };
    const timer = setTimeout(finish, timeoutMs); // seek timeout → use current frame, don't fail
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
  const { timeline, resolveLayers, audioBuffer, config, fast, analysis, onProgress, signal, cubeLut } = opts;
  const fps = normalizeVideoFrameRate(opts.fps) || 30;
  const width = Math.max(2, Math.round(opts.width / 2) * 2);
  const height = Math.max(2, Math.round(opts.height / 2) * 2);
  const bitrate = opts.bitrate ?? Math.round(Math.min(24_000_000, Math.max(8_000_000, width * height * fps * 0.12)));

  const picked = await pickVideoCodec(width, height, bitrate, fps);
  if (!picked) { console.warn('[Pixels render] WebCodecs H.264 unavailable in this browser'); return null; }
  const { codec, hardwareAcceleration } = picked;
  if (hardwareAcceleration !== 'prefer-hardware') console.warn('[Pixels render] no hardware H.264 encoder — falling back to software (slower).');
  // Make the encoder path visible in the UI so "why is this slow" is answerable at a glance.
  onProgress?.(0, hardwareAcceleration === 'prefer-hardware' ? 'Rendering — GPU hardware encoder' : 'Rendering — SOFTWARE encoder (no hw H.264 on this device; slower)');

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

  // Text-as-input overlays: rasterised once per distinct string, reused across frames.
  const textAux = new TextOverlayCache();
  const gradeCanvases = new Map<string, HTMLCanvasElement>(); // per-layer graded-frame buffers (Fabula color page)
  const colorCanvases = new Map<string, HTMLCanvasElement>();
  const colorEl = (hex: string) => {
    let c = colorCanvases.get(hex);
    if (!c) { c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d')!; x.fillStyle = hex; x.fillRect(0, 0, 4, 4); colorCanvases.set(hex, c); }
    return c;
  };

  // Muxer + encoders.
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    // mp4-muxer uses this as its exact track timescale. Fractional rates cannot
    // be used as an integer MP4 timescale, so retain its precise 57,600 fallback.
    video: { codec: 'avc', width, height, ...(Number.isInteger(fps) ? { frameRate: fps } : {}) },
    ...(audioBuffer ? { audio: { codec: 'aac' as const, numberOfChannels: Math.min(2, audioBuffer.numberOfChannels), sampleRate: audioBuffer.sampleRate } } : {}),
    fastStart: 'in-memory',
  });

  let encErr: any = null;
  let encodedFrameCount = 0;
  const videoEnc = new VideoEncoder({
    output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); encodedFrameCount++; },
    error: (e) => { encErr = e; },
  });
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
        audioTex.updateFromArrays(aud.freq, aud.wave, audioBuffer?.sampleRate || offAudio?.sampleRate || 48_000);
        comp.updateAudio(aud.freq, aud.wave);   // Forge effects + Beat Reactor bindings
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
        const inputStart = inputs.length;
        const clip = layer.clip;
        const lt = layer.time ?? 0;
        const forgeEffects = await Promise.all(((layer as any).forgeEffects || []).map(async (instance: any) => {
          if (instance.maskUrl) {
            // Asset-driven mask (PixelChooser image/video mask): the element's luma feeds the mix stage.
            const maskEl = await getMedia(instance.maskUrl, instance.maskMediaType === 'video' ? 'video' : 'image');
            if (maskEl instanceof HTMLVideoElement) { const dur = maskEl.duration || 0; const seek = dur > 0 ? lt % dur : lt; if (fast) { try { maskEl.currentTime = seek; } catch { /* */ } } else await seekVideo(maskEl, seek); }
            instance = { ...instance, maskElement: maskEl };
          }
          const eff = getEffect(instance.effectId);
          if (eff?.auxInput?.kind === 'mesh') {
            // A mesh warp takes a generated displacement map, not an asset. Neutral when the clip
            // has no track — never the renderer's source-frame fallback, which a warp shader would
            // read as a displacement field and tear the picture apart.
            return { ...instance, auxElement: meshAuxElement(instance.meshTrack, Math.round(lt * fps)) };
          }
          if (eff?.auxInput?.kind === 'text') {
            // Text effects take a rasterised string, not an asset. Blank when empty — never the
            // renderer's source-frame fallback, which would read as full glyph coverage.
            return { ...instance, auxElement: textAux.resolve(instance.id, instance.textOverlay, { localT: lt, fps }, width, height) };
          }
          if (!instance.auxUrl) return instance;
          const auxElement = await getMedia(instance.auxUrl, instance.auxMediaType === 'video' ? 'video' : 'image');
          if (auxElement instanceof HTMLVideoElement) {
            const dur = auxElement.duration || 0; const seek = dur > 0 ? lt % dur : lt;
            if (fast) { try { auxElement.currentTime = seek; } catch { /* */ } } else await seekVideo(auxElement, seek);
          }
          return { ...instance, auxElement };
        }));
        const opacity = Math.max(0, Math.min(1, (layer.opacity ?? 1) * (clip.opacity ?? 1)));
        if (clip.type === 'generator' && clip.sceneMode && hasGenerator(clip.sceneMode)) {
          const tex = gen.render(layer.id, clip.sceneMode, width, height, { time: lt, audio: audioTex, colors: palette, params: clip.params || [] });
          inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'model3d' && (clip.model3dUrl || (clip as any).model3d?.url)) {
          // A loaded mesh rendered by three.js to a canvas the compositor uploads like an image —
          // so Forge effects, grade and masks apply on top, and the model's own animation is driven
          // to clip-local time (lt), which is why the export matches the monitor.
          const canvas = await renderModel3d(clip.model3dUrl || (clip as any).model3d.url, (clip as any).model3d || {}, width, height, lt);
          if (canvas) inputs.push({ element: canvas, opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography, grade: (layer as any).glGrade, grades: (layer as any).glGrades, effects: forgeEffects, time: layer.time, wipe: (layer as any).wipe, transition: (layer as any).forgeTransition });
        } else if (clip.type === 'media' && clip.mediaUrl) {
          const el = await getMedia(clip.mediaUrl, clip.mediaType ?? 'video');
          // Per-clip GRADE (Fabula color page): bake the clip's grade into the frame via a cached
          // 2D canvas with ctx.filter before compositing — export now matches the graded monitor.
          const grade = (layer as any).grade as { bri: number; con: number; sat: number; hue: number; warm: number; blur: number } | undefined;
          const applyGrade = (src: HTMLVideoElement | HTMLImageElement): HTMLCanvasElement | HTMLVideoElement | HTMLImageElement => {
            if (!grade) return src;
            const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || width;
            const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || height;
            // FULL FIDELITY: bake at the source's native resolution (4K-safe cap) — the old
            // 1920px cap downscaled 4K sources before compositing and visibly softened exports.
            const gw = Math.min(sw, 4096), gh = Math.round(gw * (sh / Math.max(1, sw)));
            let gc = gradeCanvases.get(layer.id);
            if (!gc || gc.width !== gw || gc.height !== gh) { gc = document.createElement('canvas'); gc.width = gw; gc.height = gh; gradeCanvases.set(layer.id, gc); }
            const g = gc.getContext('2d')!;
            g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
            g.clearRect(0, 0, gw, gh); // reused canvas — clear so a transparent (alpha) source doesn't ghost the prior frame
            g.filter = `blur(${grade.blur || 0}px) brightness(${grade.bri}) contrast(${grade.con}) saturate(${grade.sat})${grade.warm ? ` sepia(${Math.min(1, grade.warm)})` : ''}${grade.hue ? ` hue-rotate(${grade.hue}deg)` : ''}`;
            g.drawImage(src, 0, 0, gw, gh);
            g.filter = 'none';
            return gc;
          };
          if (el instanceof HTMLVideoElement) {
            const dur = el.duration || 0;
            let st = lt;
            if (dur > 0) st = st % dur; // loop the source within the clip
            if (fast) { try { el.currentTime = st; } catch { /* */ } } // no wait — nearest ready frame
            else await seekVideo(el, st);
            // ML subject mattes are computed from the SEEKED frame so the export is exact.
            for (const inst of forgeEffects) if (inst?.subjectMask) inst.maskElement = await segmentSubject(el, 512, Math.max(2, Math.round(512 * (el.videoHeight || 9) / (el.videoWidth || 16))));
            for (const inst of forgeEffects) if (inst?.samMask) inst.maskElement = await segmentSam(el, inst.samMask, 512, Math.max(2, Math.round(512 * (el.videoHeight || 9) / (el.videoWidth || 16))), inst.samMask.feather);
            for (const inst of forgeEffects) if (inst?.depthMask) { const d = await estimateDepth(el, 384, Math.max(2, Math.round(384 * (el.videoHeight || 9) / (el.videoWidth || 16)))); inst.maskElement = d ? depthRangeCanvas(d, inst.depthMask.near, inst.depthMask.far, inst.depthMask.feather) : null; }
            for (const inst of forgeEffects) if (inst?.auxSource === 'depth' && !inst.auxElement) inst.auxElement = await estimateDepth(el, 384, Math.max(2, Math.round(384 * (el.videoHeight || 9) / (el.videoWidth || 16))));
            inputs.push({ element: applyGrade(el), opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography, grade: (layer as any).glGrade, grades: (layer as any).glGrades, effects: forgeEffects, time: layer.time, wipe: (layer as any).wipe, transition: (layer as any).forgeTransition });
          } else if (el instanceof HTMLImageElement) {
            for (const inst of forgeEffects) if (inst?.subjectMask) inst.maskElement = await segmentSubject(el, 512, Math.max(2, Math.round(512 * (el.naturalHeight || 9) / (el.naturalWidth || 16))));
            for (const inst of forgeEffects) if (inst?.samMask) inst.maskElement = await segmentSam(el, inst.samMask, 512, Math.max(2, Math.round(512 * (el.naturalHeight || 9) / (el.naturalWidth || 16))), inst.samMask.feather);
            for (const inst of forgeEffects) if (inst?.depthMask) { const d = await estimateDepth(el, 384, Math.max(2, Math.round(384 * (el.naturalHeight || 9) / (el.naturalWidth || 16)))); inst.maskElement = d ? depthRangeCanvas(d, inst.depthMask.near, inst.depthMask.far, inst.depthMask.feather) : null; }
            for (const inst of forgeEffects) if (inst?.auxSource === 'depth' && !inst.auxElement) inst.auxElement = await estimateDepth(el, 384, Math.max(2, Math.round(384 * (el.naturalHeight || 9) / (el.naturalWidth || 16))));
            inputs.push({ element: applyGrade(el), opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography, grade: (layer as any).glGrade, grades: (layer as any).glGrades, effects: forgeEffects, time: layer.time, wipe: (layer as any).wipe, transition: (layer as any).forgeTransition });
          }
        } else if (clip.type === 'color' && clip.fillColor) {
          inputs.push({ element: colorEl(clip.fillColor), opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'text' && clip.text) {
          inputs.push({ element: getTextCanvas(clip.text, clip.fillColor), opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'title' && (clip as any).tGraphic && findLowerThird((clip as any).tGraphic.specId)) {
          // Motion lower third — same renderer as Fabula's monitor, keyed per frame while animating.
          const tc = clip as any;
          const spec = findLowerThird(tc.tGraphic.specId)!;
          const fusion = spec.shaderFusion;
          const fusionSource = fusion ? materialShaderSource(fusion.shaderId) : undefined;
          if (fusion && fusionSource) {
            const tex = shaderRend.render(`${layer.id}:fusion`, fusionSource, width, height, { time: layer.time ?? 0, audio: audioTex, params: fusion.params || [] });
            inputs.push({ texture: tex, opacity: opacity * fusion.opacity, blendMode: fusion.blend, transform: layer.transform, homography: (layer as any).homography });
          }
          inputs.push({ element: getLowerThirdCanvas({ spec, ref: tc.tGraphic, title: tc.rawText ?? clip.text ?? '', subtitle: clip.subtitle, tag: tc.tag, t: layer.time ?? 0, duration: tc.tDur ?? Infinity, origin: tc.tx != null && tc.ty != null ? { x: tc.tx, y: tc.ty } : undefined, width, height }), opacity, blendMode: 'normal', transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'title' && clip.text) {
          const tc = clip as any; // Fabula titler overrides ride along on the clip
          inputs.push({ element: getTitleCanvas(clip.text, clip.subtitle, clip.titleStyle, clip.fillColor, { font: tc.tFont, color: tc.tColor, subColor: tc.tSubColor, size: tc.tSize, x: tc.tx, y: tc.ty }, { anim: tc.tAnim, t: layer.time ?? 0, duration: tc.tDur }), opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'shader' && clip.shaderSrc) {
          const tex = shaderRend.render(layer.id, clip.shaderSrc, width, height, { time: lt, audio: audioTex, params: clip.params || [] });
          inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'nodegraph' && clip.graph) {
          const tex = graphRend.evaluate(clip.graph, width, height, { time: lt, audio: audioTex, colors: palette });
          if (tex) inputs.push({ texture: tex, opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
        } else if (clip.type === 'milkdrop') {
          const preset = clip.milkdropName ?? clip.milkdropIdx ?? 0;
          const d = await getMilkdrop(layer.id, preset);
          if (d) {
            d.renderFrame(aud ? aud.wave : null);   // inject stored waveform → deterministic
            inputs.push({ element: d.canvas, opacity, blendMode: layer.blendMode, transform: layer.transform, homography: (layer as any).homography });
          }
        }
        for (let added = inputStart; added < inputs.length; added++) {
          (inputs[added] as any).precomposeGroup = (layer as any).precomposeGroup;
          if ((layer as any).forgeTransition) (inputs[added] as any).transition = (layer as any).forgeTransition;
        }
      }

      // Collapse every marked compound scene to one same-context texture before
      // it enters the two-input transition renderer.
      const finalInputs: LayerInput[] = [];
      for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
        const input = inputs[inputIndex];
        if (!input.precomposeGroup) { finalInputs.push(input); continue; }
        const children: LayerInput[] = [];
        const groupId = input.precomposeGroup; let transition = input.transition;
        while (inputIndex < inputs.length && inputs[inputIndex].precomposeGroup === groupId) {
          const child = { ...inputs[inputIndex], transition: null, precomposeGroup: undefined };
          transition ||= inputs[inputIndex].transition; children.push(child); inputIndex++;
        }
        inputIndex--;
        finalInputs.push({ precompose: children, opacity: 1, blendMode: 'normal', transition });
      }
      comp.render(finalInputs, grade, shake, cubeLut);
      const timing = videoFrameTiming(i, fps);
      const frame = new VideoFrame(canvas as any, timing);
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
    // Integrity note — but NEVER discard a completed encode over it. A hardware encoder can
    // legitimately emit a frame or two off at flush; throwing away minutes of render for that
    // (and failing the whole export) is far worse than delivering the finished file.
    if (encodedFrameCount !== total) console.warn(`[Pixels render] encoder emitted ${encodedFrameCount}/${total} frames — delivering anyway.`);
    if (encodedFrameCount < 1) return null; // nothing encoded → genuinely failed

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
