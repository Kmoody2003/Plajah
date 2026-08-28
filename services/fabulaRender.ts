// fabulaRender.ts — Phase 2: Fabula's video renderer, powered by the Pixels engine.
//
// Fabula has no video export of its own — its code says rendering "belongs in the
// codebase render pipeline — the timeline data here is its exact input." This is
// that pipeline: it adapts a Fabula timeline (clips + mediaPool) into a Pixels
// SceneTimeline and runs the deterministic offline renderer, so Fabula finally
// writes a real, frame/beat/sample-accurate MP4.
//
// v1 scope: the V1 video track (Pixels-originated edits are single-track) + the
// first audio clip as the soundtrack. Each clip resolves to its mediaPool item — a
// Pixels scene snapshot (`item.pixels`) renders as the true composite; a plain
// media item renders as a video/image layer. Per-clip CSS transforms/blur and the
// V2 overlay track are follow-ups; structure, motion, audio-reactivity + sound are
// all accurate here.

import { renderTimeline } from '../components/plajahPixels/engine/core/offlineRenderer';
import type { SceneSnapshot, RenderLayer } from '../components/plajahPixels/engine/timeline/sceneTimeline';
import { EQ_BANDS, makeIR } from './fabula/audioGraph';
import { buildCurveLut, isCurvesIdentity } from './fabula/gradeCurves';
import { isQualifierIdentity } from './fabula/hslKey';
import { isWindowEnabled } from './fabula/gradeWindow';
import { sampleParam } from './fabula/keyframes';
import { probeVideoFrameRate, sourceSafeRenderFrameRate } from './videoFrameRate';

interface RenderFabulaOpts {
  clips: any[];                 // Fabula clips on the active timeline
  mediaPool: any[];             // prod.mediaPool
  format: { w?: number; h?: number; fps?: number };
  palette?: string[];           // Pixels colorPalette carried through on export (fidelity)
  title?: string;
  trackSettings?: Record<string, any>; // per-track mixer: vol/pan/mute/eq/comp (render = live parity)
  onProgress?: (p: number, stage: string) => void;
  signal?: AbortSignal;
}

function itemToSnapshot(item: any, label: string): SceneSnapshot {
  if (item?.pixels) return item.pixels as SceneSnapshot;        // real Pixels scene
  // Any url-backed visual: video, image, or a rasterized-vector/generated 'graphic' still.
  // Images & graphics (PNG/WebP/rasterized SVG/AI) carry alpha; the compositor's per-source
  // alpha blend then reveals lower tracks through their transparent pixels.
  if (item?.url && (item.type === 'video' || item.type === 'image' || item.type === 'graphic')) {
    return {
      name: item.name || label,
      layers: [{
        id: 'v1', blendMode: 'normal', opacity: 1,
        clip: { type: 'media', mediaUrl: item.url, mediaType: item.type === 'video' ? 'video' : 'image', opacity: 1 },
      }],
    };
  }
  return { name: label || 'clip', layers: [] };                 // unresolved → black
}

// Append an EQ + compressor stage (matching the live audioGraph chain) after `input`.
// Zero-gain EQ bands and comp.on=false are skipped entirely — bit-transparent bypass.
function applyEqComp(ctx: BaseAudioContext, input: AudioNode, eq?: number[], comp?: any): AudioNode {
  let node = input;
  if (eq && eq.some((v) => v)) {
    EQ_BANDS.forEach((b, i) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q || 1;
      f.gain.value = Math.max(-24, Math.min(24, eq[i] || 0));
      node.connect(f); node = f;
    });
  }
  if (comp && comp.on) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = Math.max(-100, Math.min(0, comp.threshold ?? -24));
    c.ratio.value = Math.max(1, Math.min(20, comp.ratio ?? 3));
    c.attack.value = Math.max(0, Math.min(1, comp.attack ?? 0.003));
    c.release.value = Math.max(0, Math.min(1, comp.release ?? 0.25));
    c.knee.value = Math.max(0, Math.min(40, comp.knee ?? 30));
    const mk = ctx.createGain(); mk.gain.value = Math.pow(10, (comp.makeup || 0) / 20);
    node.connect(c); c.connect(mk); node = mk;
  }
  return node;
}

// Non-destructive cleanup pre-stage (parity with AudioEditor / audioGraph.applyClean). hpf/lpf 0 =
// bypass; hum 0 = off; trim in dB. denoise + normalize are baked into the buffer separately.
function applyCleanRender(ctx: BaseAudioContext, input: AudioNode, clean?: any): AudioNode {
  if (!clean) return input;
  let node = input;
  if (clean.hpf > 0) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = Math.max(10, Math.min(2000, clean.hpf)); f.Q.value = 0.707; node.connect(f); node = f; }
  if (clean.hum) { const f = ctx.createBiquadFilter(); f.type = 'notch'; f.frequency.value = clean.hum; f.Q.value = 8; node.connect(f); node = f; }
  if (clean.lpf > 0) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(1000, Math.min(22000, clean.lpf)); f.Q.value = 0.707; node.connect(f); node = f; }
  if (clean.trim) { const g = ctx.createGain(); g.gain.value = Math.pow(10, Math.max(-24, Math.min(24, clean.trim)) / 20); node.connect(g); node = g; }
  return node;
}
// Bake denoise (time-domain noise gate below an auto-estimated floor) + normalize (peak → −1 dBFS)
// into a fresh buffer. Only called when the clip actually asks for them, so the shared cache is safe.
function bakeCleanBuffer(ctx: BaseAudioContext, ab: AudioBuffer, clean: any): AudioBuffer {
  const out = ctx.createBuffer(ab.numberOfChannels, ab.length, ab.sampleRate);
  const win = Math.max(1, Math.round(ab.sampleRate * 0.02)); // 20ms envelope window
  const denoise = Math.max(0, Math.min(1, clean.denoise || 0));
  let globalPeak = 0;
  for (let ch = 0; ch < ab.numberOfChannels; ch++) {
    const src = ab.getChannelData(ch), dst = out.getChannelData(ch);
    // estimate noise floor = median-ish of the quietest windows' RMS
    let floor = 1;
    if (denoise > 0) {
      const rms: number[] = [];
      for (let i = 0; i < src.length; i += win) { let s = 0, n = 0; for (let j = i; j < Math.min(src.length, i + win); j++) { s += src[j] * src[j]; n++; } rms.push(Math.sqrt(s / Math.max(1, n))); }
      rms.sort((a, b) => a - b); floor = rms[Math.floor(rms.length * 0.1)] || 0;
    }
    const gateLo = floor * (1 + denoise * 2), gateHi = floor * (2 + denoise * 3);
    let env = 0; const atk = 0.4, rel = 0.02;
    for (let i = 0; i < src.length; i++) {
      let v = src[i];
      if (denoise > 0 && gateHi > gateLo) {
        const a = Math.abs(v); env += (a > env ? atk : rel) * (a - env);
        let gain = env <= gateLo ? 0 : env >= gateHi ? 1 : (env - gateLo) / (gateHi - gateLo);
        gain = 1 - denoise * (1 - gain); // denoise=1 → full gate, denoise=0.5 → half depth
        v *= gain;
      }
      dst[i] = v; const av = Math.abs(v); if (av > globalPeak) globalPeak = av;
    }
  }
  if (clean.normalize && globalPeak > 0) { const scale = 0.891 / globalPeak; for (let ch = 0; ch < out.numberOfChannels; ch++) { const d = out.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= scale; } }
  return out;
}

// Mix ALL audio clips (any a-track) into one master buffer with FULL DSP PARITY to live
// playback: per-clip gain + fades + clip EQ/comp, summed into per-track buses that apply the
// track's EQ/comp, stereo pan, fader and mute — the same chain the editor's mixer runs, so
// what you hear in the edit is what the MP4 contains.
async function mixAudio(clips: any[], mediaPool: any[], durationSec: number, trackSettings?: Record<string, any>): Promise<AudioBuffer | null> {
  const aClips = clips.filter(c => /^a\d+$/.test(c.trackId) && c.assetId && !c.disabled);
  // Video clips with EMBEDDED audio (older clips with no linked A-track sibling) used to render
  // SILENT — the mixer only read a-tracks. Their sound now routes through the A1 track bus, so
  // the A1 fader/EQ/comp/pan govern it exactly like the rest of the mix. Skipped when the clip
  // has a live linked-audio sibling (`av` pairs) — that sibling already carries the sound.
  const linkedIds = new Set(aClips.map(c => c.linkId).filter(Boolean));
  const itemOf = (id: string) => mediaPool.find(m => m.id === id);
  const vAudio = clips
    .filter(c => /^v\d+$/.test(c.trackId) && c.assetId && !c.disabled && !c.av
      && !(c.linkId && linkedIds.has(c.linkId)) && itemOf(c.assetId)?.type === 'video')
    .map(c => ({ ...c, trackId: 'a1' }));
  const audioClips = [...aClips, ...vAudio];
  if (!audioClips.length || durationSec <= 0) return null;
  const SR = 48000;

  // decode each unique asset once
  const cache = new Map<string, AudioBuffer>();
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  // Decode every unique source in PARALLEL, each guarded by a timeout. Serial decoding of
  // several video files' audio (every video clip routes its embedded audio here now) was the
  // invisible "stuck on Preparing" stall — one big/slow file blocked the whole render. A source
  // that can't decode in ~25s is skipped (it just renders silent) rather than hanging the export.
  const uniqueIds = [...new Set(audioClips.map(c => c.assetId))];
  await Promise.all(uniqueIds.map(async (id) => {
    const item = mediaPool.find(m => m.id === id);
    if (!item?.url) return;
    try {
      const buf = await Promise.race([
        (async () => decodeCtx.decodeAudioData(await (await fetch(item.url)).arrayBuffer()))(),
        new Promise<null>((res) => setTimeout(() => res(null), 25000)),
      ]);
      if (buf) cache.set(id, buf as AudioBuffer);
    } catch { /* undecodable / no audio track — skip */ }
  }));
  try { decodeCtx.close(); } catch { /* */ }

  const offline = new OfflineAudioContext(2, Math.ceil(durationSec * SR), SR);

  // Master bus with the SAME brickwall limiter as live (clean, clip-proof export). Any track
  // soloed → non-soloed tracks are muted (solo derives to mute, matching the live console).
  const anySolo = Object.values(trackSettings || {}).some((t: any) => t && t.solo);
  const masterIn = offline.createGain();
  const masterLimiter = offline.createDynamicsCompressor();
  masterLimiter.threshold.value = -1.0; masterLimiter.ratio.value = 20; masterLimiter.attack.value = 0.001; masterLimiter.release.value = 0.05; masterLimiter.knee.value = 0;
  const masterGain = offline.createGain();
  const masterCfg: any = (trackSettings as any)?.master || {};
  masterGain.gain.value = Math.max(0, masterCfg.vol == null ? 1 : masterCfg.vol);
  masterIn.connect(masterLimiter); masterLimiter.connect(masterGain); masterGain.connect(offline.destination);

  // FX aux buses (same IR/params as live → export parity): reverb convolver + feedback delay.
  const rvb = masterCfg.reverb || {};
  const dly = masterCfg.delay || {};
  const reverbSend = offline.createGain();
  const conv = offline.createConvolver(); conv.normalize = true; conv.buffer = makeIR(offline, rvb.preset || 'hall');
  const reverbWet = offline.createGain(); reverbWet.gain.value = rvb.wet == null ? 0.9 : rvb.wet;
  reverbSend.connect(conv); conv.connect(reverbWet); reverbWet.connect(masterIn);
  const delaySend = offline.createGain();
  const delayNode = offline.createDelay(2.0); delayNode.delayTime.value = Math.max(0, Math.min(2, dly.time == null ? 0.33 : dly.time));
  const fbNode = offline.createGain(); fbNode.gain.value = Math.max(0, Math.min(0.95, dly.feedback == null ? 0.35 : dly.feedback));
  const delayWet = offline.createGain(); delayWet.gain.value = dly.wet == null ? 0.8 : dly.wet;
  delaySend.connect(delayNode); delayNode.connect(fbNode); fbNode.connect(delayNode); delayNode.connect(delayWet); delayWet.connect(masterIn);

  // One bus per audio track: input → track EQ/comp → pan → fader(mute/solo) → master (+ aux sends).
  const buses = new Map<string, GainNode>();
  const trackBus = (tid: string): GainNode => {
    const hit = buses.get(tid); if (hit) return hit;
    const ts: any = (trackSettings || {})[tid] || {};
    const input = offline.createGain();
    let node: AudioNode = applyEqComp(offline, input, ts.eq, ts.comp);
    if (typeof (offline as any).createStereoPanner === 'function' && (ts.pan || 0) !== 0) {
      const p = (offline as any).createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, ts.pan || 0));
      node.connect(p); node = p;
    }
    const fader = offline.createGain();
    const muted = ts.mute || (anySolo && !ts.solo);
    fader.gain.value = muted ? 0 : Math.max(0, ts.vol == null ? 1 : ts.vol);
    node.connect(fader); fader.connect(masterIn);
    if (!muted && (ts.sendReverb || 0) > 0) { const s = offline.createGain(); s.gain.value = ts.sendReverb; fader.connect(s); s.connect(reverbSend); }
    if (!muted && (ts.sendDelay || 0) > 0) { const s = offline.createGain(); s.gain.value = ts.sendDelay; fader.connect(s); s.connect(delaySend); }
    buses.set(tid, input);
    return input;
  };

  for (const c of audioClips) {
    let ab = cache.get(c.assetId); if (!ab) continue;
    const clean = c.audio?.clean;
    // Denoise / normalize are look-ahead processes → bake into a per-clip buffer copy (cache stays raw).
    if (clean && ((clean.denoise || 0) > 0 || clean.normalize)) { try { ab = bakeCleanBuffer(offline, ab, clean); } catch { /* keep raw */ } }
    const start = Math.max(0, c.start || 0);
    const offset = Math.max(0, c.srcIn || 0);
    const dur = Math.max(0.01, Math.min(c.duration || (ab.duration - offset), ab.duration - offset));
    // clip gain: the inspector's clip-audio volume (c.audio.vol), falling back to legacy fx.vol
    const gainVal = c.audio?.vol != null ? c.audio.vol : (c.fx?.vol != null ? c.fx.vol : (c.vol != null ? c.vol : 1));
    const fi = Math.min(c.fx?.fadeIn || 0, dur), fo = Math.min(c.fx?.fadeOut || 0, dur);
    const src = offline.createBufferSource(); src.buffer = ab;
    const g = offline.createGain();
    g.gain.setValueAtTime(fi > 0 ? 0.0001 : gainVal, start);
    if (fi > 0) g.gain.linearRampToValueAtTime(gainVal, start + fi);
    if (fo > 0) { g.gain.setValueAtTime(gainVal, Math.max(start, start + dur - fo)); g.gain.linearRampToValueAtTime(0.0001, start + dur); }
    src.connect(g);
    const cleaned = applyCleanRender(offline, g, clean);          // HPF/LPF/hum/trim (live parity)
    const shaped = applyEqComp(offline, cleaned, c.audio?.eq, c.audio?.comp); // clip EQ/comp
    shaped.connect(trackBus(c.trackId));
    try { src.start(start, offset, dur); } catch { /* out of range */ }
  }
  try { return await offline.startRendering(); } catch { return null; }
}

/** Render the Fabula timeline to an MP4 Blob via the Pixels offline renderer. Composites
 *  ALL video tracks (v1, v2, … unlimited; bottom→top) per frame, captions included. */
export async function renderFabulaToBlob(opts: RenderFabulaOpts): Promise<Blob | null> {
  const { clips, mediaPool, format, palette, trackSettings, onProgress, signal } = opts;
  const videoClips = clips.filter(c => /^v\d+$/.test(c.trackId) && !c.disabled);
  const subtitleClips = clips.filter(c => c.kind === 'subtitle' && c.text);
  const titleClips = clips.filter(c => c.kind === 'title' && c.text);
  if (!videoClips.length && !subtitleClips.length && !titleClips.length) { console.warn('[Fabula render] nothing visual to render'); return null; }

  // Distinct video tracks, bottom (v1) → top, numeric order (v2 before v10).
  const tracks = [...new Set(videoClips.map(c => c.trackId))].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const itemById = new Map<string, any>(mediaPool.map(m => [m.id, m]));

  const resolveLayers = (t: number): RenderLayer[] => {
    const out: RenderLayer[] = [];
    // Emit one clip's layers into `out`, opacity scaled by opMul. `freeze` overrides
    // the clip-local time (used to HOLD the outgoing clip's last frame under a transition).
    const emitClip = (clip: any, tAbs: number, opMul: number, freeze: number | null, extra?: { wipe?: any; blurAdd?: number }) => {
      if (opMul <= 0.001) return;
      const item = itemById.get(clip.assetId);
      const snap = itemToSnapshot(item, clip.label || 'clip');
      const kfT = freeze != null ? freeze : tAbs - clip.start;
      const lt = kfT + (clip.srcIn || 0);
      const fx = clip.fx;
      const clipBlend = fx?.blend && fx.blend !== 'normal' ? fx.blend : null;
      const clipOp = sampleParam(fx, 'op', kfT, fx?.op ?? 1) * opMul;
      const kx = sampleParam(fx, 'x', kfT, fx?.x || 0);
      const ky = sampleParam(fx, 'y', kfT, fx?.y || 0);
      const ksc = sampleParam(fx, 'sc', kfT, fx?.sc ?? 1);
      const krot = sampleParam(fx, 'rot', kfT, fx?.rot || 0);
      const tf = fx ? { x: kx / 100, y: ky / 100, scale: ksc, rot: (krot * Math.PI) / 180 } : null;
      const hasTf = tf && (tf.x !== 0 || tf.y !== 0 || tf.scale !== 1 || tf.rot !== 0);
      const grade = fx ? {
        bri: sampleParam(fx, 'bri', kfT, fx.bri ?? 1), con: sampleParam(fx, 'con', kfT, fx.con ?? 1),
        sat: sampleParam(fx, 'sat', kfT, fx.sat ?? 1), hue: sampleParam(fx, 'hue', kfT, fx.hue || 0),
        warm: fx.warm || 0, blur: sampleParam(fx, 'blur', kfT, fx.blur || 0),
      } : null;
      const hasGrade = grade && (grade.bri !== 1 || grade.con !== 1 || grade.sat !== 1 || grade.hue !== 0 || grade.warm !== 0 || grade.blur !== 0);
      const w = fx?.wheel;
      const hasWheel = w && (
        (w.lift || []).some((v: number) => v !== 0) || (w.gamma || []).some((v: number) => v !== 1)
        || (w.gain || []).some((v: number) => v !== 1) || w.temp || w.tint
      );
      const curveLut = !isCurvesIdentity(fx?.curves) ? buildCurveLut(fx.curves) : null;
      const qualifier = !isQualifierIdentity(fx?.qualifier) ? fx.qualifier : null;
      const window = isWindowEnabled(fx?.window) ? fx.window : null;
      const baseGrade = (hasWheel || curveLut || qualifier) ? {
        lift: w?.lift, gamma: w?.gamma, gain: w?.gain, temp: w?.temp || 0, tint: w?.tint || 0,
        ...(curveLut ? { curveLut } : {}),
        ...(qualifier ? { qualifier } : {}),
        ...(window ? { window } : {}),
      } : null;
      // GRADE LAYERS (H2): flat fx = the base grade; fx.grades[] are stacked secondaries.
      const toInputGrade = (g: any) => {
        const gw = g.wheel;
        const gcl = !isCurvesIdentity(g.curves) ? buildCurveLut(g.curves) : null;
        const gq = !isQualifierIdentity(g.qualifier) ? g.qualifier : null;
        const gwin = isWindowEnabled(g.window) ? g.window : null;
        return { lift: gw?.lift, gamma: gw?.gamma, gain: gw?.gain, temp: gw?.temp || 0, tint: gw?.tint || 0,
          ...(gcl ? { curveLut: gcl } : {}), ...(gq ? { qualifier: gq } : {}), ...(gwin ? { window: gwin } : {}) };
      };
      const extraGrades = (fx?.grades || []).filter((g: any) => g && g.enabled !== false).map(toInputGrade);
      const glGrade = (!extraGrades.length && baseGrade) ? baseGrade : null;   // single inline path
      const glGrades = extraGrades.length ? [baseGrade, ...extraGrades].filter(Boolean) : null; // multi-pass
      // Blur-dissolve: add transition blur (canvas-side) on top of any graded blur.
      const blurAdd = extra?.blurAdd || 0;
      const emitGrade = blurAdd ? { ...(grade || { bri: 1, con: 1, sat: 1, hue: 0, warm: 0, blur: 0 }), blur: (grade?.blur || 0) + blurAdd } : grade;
      const emitHasGrade = hasGrade || blurAdd > 0;
      for (const layer of snap.layers) {
        out.push({
          ...layer,
          id: `${clip.trackId}:${clip.id}:${layer.id}`,   // unique per clip (two clips can co-exist mid-transition)
          blendMode: clipBlend || layer.blendMode,
          opacity: (layer.opacity ?? 1) * clipOp,
          time: lt,
          transform: hasTf ? tf : undefined,
          ...(emitHasGrade ? { grade: emitGrade } : {}),
          ...(glGrade ? { glGrade } : {}),
          ...(glGrades ? { glGrades } : {}),
          ...(extra?.wipe ? { wipe: extra.wipe } : {}),
        } as any);
      }
    };

    for (const tid of tracks) {                       // bottom → top
      const onTrack = videoClips.filter(c => c.trackId === tid).sort((a, b) => a.start - b.start);
      const cur = onTrack.find(c => t >= c.start && t < c.start + c.duration);
      if (!cur) continue;
      // A transition lives on the INCOMING clip (fx.trans = { type, dur }) and plays over
      // the first `dur` seconds of that clip, blending FROM the previous clip on the track.
      const trans = cur.fx?.trans;
      const dur = trans?.dur || 0;
      if (dur > 0.01 && t < cur.start + dur) {
        const idx = onTrack.indexOf(cur);
        const prev = idx > 0 ? onTrack[idx - 1] : null;
        const p = Math.max(0, Math.min(1, (t - cur.start) / dur)); // 0 → 1 across the window
        if (trans.type === 'dip') {
          // Dip THROUGH black: outgoing fades out over the first half, incoming in over the second.
          if (prev) emitClip(prev, t, 1 - Math.min(1, p * 2), prev.duration - 1e-3);
          emitClip(cur, t, Math.max(0, (p - 0.5) * 2), null);
        } else if (trans.type === 'wipe') {
          // WIPE: hold the outgoing, reveal the incoming behind a moving edge (shader matte).
          if (prev) emitClip(prev, t, 1, prev.duration - 1e-3);
          emitClip(cur, t, 1, null, { wipe: { dir: (trans.dir ?? 0), p, soft: 0.06 } });
        } else if (trans.type === 'blur') {
          // BLUR DISSOLVE: both clips blur toward the midpoint while crossing over.
          const bl = (1 - Math.abs(p - 0.5) * 2) * 22; // 0 → 22px → 0
          if (prev) emitClip(prev, t, 1, prev.duration - 1e-3, { blurAdd: bl });
          emitClip(cur, t, p, null, { blurAdd: bl });
        } else {
          // Dissolve / fade: HOLD the outgoing's last frame, cross the incoming in over it.
          if (prev) emitClip(prev, t, 1, prev.duration - 1e-3);
          emitClip(cur, t, p, null);
        }
      } else {
        emitClip(cur, t, 1, null);
      }
    }
    // Subtitle + title clips burn in on top, screen-blended.
    for (const c of subtitleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      out.push({ id: `sub:${c.id}`, clip: { type: 'text', text: c.text }, blendMode: 'screen', opacity: 1, time: 0 });
    }
    for (const c of titleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      // titler overrides (font/color/size/position) ride along so the export matches the monitor
      out.push({ id: `title:${c.id}`, clip: { type: 'title', text: c.text, subtitle: c.subtitle, titleStyle: c.titleStyle, tFont: c.tFont, tColor: c.tColor, tSubColor: c.tSubColor, tSize: c.tSize, tx: c.tx, ty: c.ty } as any, blendMode: 'screen', opacity: 1, time: 0 });
    }
    return out;
  };

  const duration = Math.max(0, ...clips.map(c => c.start + c.duration));
  onProgress?.(0, 'Mixing audio'); // visible stage — this step used to sit silently on "Preparing"
  const audioBuffer = await mixAudio(clips, mediaPool, duration, trackSettings);
  if (signal?.aborted) return null;
  // A grade can make an offline render slower, but it must never make the FILE
  // lower-FPS. Preserve the fastest active source cadence (up to 60fps). Imported
  // assets cache this value; older projects are measured once here at delivery.
  const activeAssetIds = new Set(videoClips.map(c => c.assetId).filter(Boolean));
  const sources = new Map<string, any>();
  for (const item of mediaPool.filter(asset => activeAssetIds.has(asset.id))) {
    if (item.type === 'video' && item.url) sources.set(item.url, item);
    for (const layer of item.pixels?.layers || []) {
      const clip = layer?.clip;
      if (clip?.type === 'media' && clip.mediaType !== 'image' && clip.mediaUrl) {
        sources.set(clip.mediaUrl, item);
      }
    }
  }
  const requestedFps = format.fps || 30;
  // Cadence probe is a NICETY, never a blocker: only probe sources without a cached fps, and
  // cap the whole phase — if probing is slow/unresponsive we fall back to the requested fps
  // rather than stalling the export.
  const toProbe = [...sources].filter(([url, item]) => !(item.url === url && item.fps));
  let sourceRates: number[] = [...sources].map(([url, item]) => (item.url === url && item.fps) ? (item.fps as number) : 0);
  if (toProbe.length) {
    onProgress?.(0, 'Checking source frame rates');
    const probed = await Promise.race([
      Promise.all(toProbe.map(async ([url, item]) => {
        const measured = await probeVideoFrameRate(url, signal);
        if (measured && item.url === url) item.fps = measured; // cache ordinary media assets
        return measured;
      })),
      new Promise<number[]>((res) => setTimeout(() => res([]), 8000)), // hard cap on probing
    ]);
    if (Array.isArray(probed) && probed.length) sourceRates = sourceRates.concat(probed);
  }
  if (signal?.aborted) return null;
  const renderFps = sourceSafeRenderFrameRate(requestedFps, sourceRates);
  if (renderFps > requestedFps + 0.001) onProgress?.(0, `Preserving source cadence at ${renderFps} fps`);
  const config = {
    colorPalette: palette || [],
    gradeBrightness: 1, gradeContrast: 1, gradeSaturation: 1, gradeGamma: 1,
    enableBassShake: false,
  };

  return renderTimeline({
    resolveLayers, duration, audioBuffer, config,
    width: format.w || 1920, height: format.h || 1080, fps: renderFps,
    onProgress, signal,
  });
}
