/**
 * TelaVisualizer — Pixels / Fabula visuals as Tela design elements.
 *
 *   VISUALIZER objects   a live platform visualizer on the page: any Pixels generator, signature shader,
 *                        MilkDrop preset, Flux scene (Flux Canvas included) or Typo. Drawn by the same
 *                        engine Stage uses (services/ambo/layerSources GeneratorSource / ShaderSource), so it
 *                        looks identical everywhere. Reacts to the Plajah player, the mic, or nothing. Pauses
 *                        off-screen and on a hidden tab; reduced motion holds a still. A baked `posterSrc`
 *                        stands in for print, PDF, image export and thumbnails.
 *   Image effects        any Pixels / Fabula effect or Look on an IMAGE object (`pixelsFx`): rendered on the
 *                        GPU through the Fabula effect renderer and baked into `filteredSrc`, which every
 *                        static path uses; `live` animates it (and lets it hear the player) on the page.
 *
 * Both arrive from the Universal Library (gen / shader → a visualizer; fx / look → the selected image).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Mic, MicOff, RefreshCw, Sparkles, X } from 'lucide-react';
import type { TelaPixelsFx, TelaVectorObject, TelaVisualizerSpec } from '../../types';
import { GeneratorSource, ShaderSource, snapshotVisualizer } from '../../services/ambo/layerSources';
import { buildVisualizerCatalog, resolveVisualizerValue, type VisualizerEntry } from '../scripture/AmboTemplateVisualizerPicker';
import { loadMilkdropNames } from '../FxStageVisualizers';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { FxRenderer } from '../plajahPixels/engine/fx/fxRenderer';
import { getEffect, FX_EFFECTS } from '../plajahPixels/engine/fx/effects';
import { AudioTexture } from '../plajahPixels/engine/core/audioTexture';
import { createGL, makeSourceTexture, uploadElement, makeTarget } from '../plajahPixels/engine/core/glUtil';

const oid = () => `vo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The Plajah player's analyser when this document sits inside the app (null in embeds/exports). */
function usePlayerAnalyser(): AnalyserNode | null {
  try { return useGlobalPlayer().analyser ?? null; } catch { return null; }   // the hook only reads context
}

// ── Visualizer objects ──────────────────────────────────────────────────────

type Built = { src: GeneratorSource | ShaderSource; kind: 'GENERATOR' | 'SHADER' };
const resolveSpec = (spec: TelaVisualizerSpec) => resolveVisualizerValue(spec.value) ?? (spec.shaderSrc ? { kind: 'SHADER' as const, src: spec.shaderSrc, name: spec.name || 'Shader' } : null);
function buildSource(spec: TelaVisualizerSpec, w: number, h: number): Built | null {
  const r = resolveSpec(spec);
  if (!r) return null;
  if (r.kind === 'SHADER') return { kind: 'SHADER', src: new ShaderSource({ kind: 'SHADER', src: r.src, params: { speed: spec.speed ?? 1 } as any }, w, h) };
  const params: Record<string, number | string> = { speed: spec.speed ?? 1, morph: spec.morph === false ? 0 : 1, director: spec.director === false ? 0 : 1, audioSource: spec.audio === 'mic' ? 'live-input' : 'none' };
  return { kind: 'GENERATOR', src: new GeneratorSource({ kind: 'GENERATOR', mode: r.mode, params }, w, h) };
}
function applyAudio(b: Built, spec: TelaVisualizerSpec, player: AnalyserNode | null) {
  const want = spec.audio ?? 'player';
  if (b.kind === 'GENERATOR') {
    const g = b.src as GeneratorSource;
    if (want === 'mic') g.setAudioSource('live-input'); else g.useAnalyser(want === 'player' ? player : null);
  } else (b.src as ShaderSource).externalAnalyser = want === 'player' ? player : null;
}

/** A still of the visualizer for every static path (≤ 480 px). */
export async function renderVisualizerPoster(spec: TelaVisualizerSpec, w: number, h: number): Promise<string | null> {
  const r = resolveSpec(spec); if (!r) return null;
  const k = Math.min(1, 480 / Math.max(1, w, h)), pw = Math.max(32, Math.round(w * k)), ph = Math.max(18, Math.round(h * k));
  // Flux Canvas scenes are their picture brought to life: the picture, cropped to the box, is the faithful still
  // (and doesn't race the scene's textures loading).
  const canvasId = /^FLUX_CANVAS_([A-Z_]+?)(?:_PLATE|_WORLD)?$/.exec(spec.value)?.[1];
  if (canvasId) {
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `${((globalThis as any).__PLAJAH_ASSET_BASE ?? '/visualizers/')}canvas/plates/${canvasId.toLowerCase().replace(/_/g, '-')}.jpg`; });
      const c = document.createElement('canvas'); c.width = pw; c.height = ph;
      const s0 = Math.max(pw / img.naturalWidth, ph / img.naturalHeight), dw = img.naturalWidth * s0, dh = img.naturalHeight * s0;
      c.getContext('2d')!.drawImage(img, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
      return c.toDataURL('image/jpeg', 0.86);
    } catch { /* fall through to a rendered frame */ }
  }
  const content = r.kind === 'SHADER' ? { kind: 'SHADER' as const, src: r.src } : { kind: 'GENERATOR' as const, mode: r.mode, params: { audioSource: 'none', morph: spec.morph === false ? 0 : 1 } as any };
  return snapshotVisualizer(content as any, pw, ph, 6).catch(() => null);
}

export function makeVisualizerObject(spec: TelaVisualizerSpec, box: { x: number; y: number; w: number; h: number }): TelaVectorObject {
  return {
    id: oid(), kind: 'VISUALIZER', x: box.x, y: box.y, w: box.w, h: box.h,
    fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
    semanticRole: 'ARTWORK', templateRole: 'ORNAMENT', objectLabel: spec.name || 'Visualizer',
    visualizer: { audio: 'player', speed: 1, ...spec },
  } as TelaVectorObject;
}

export const TelaVisualizerCanvas: React.FC<{ spec: TelaVisualizerSpec; width: number; height: number; objectId?: string; label?: string }> = ({ spec, width, height, objectId, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const player = usePlayerAnalyser();
  const visible = useRef(true);
  const built = useRef<Built | null>(null);
  const specRef = useRef(spec); specRef.current = spec;
  // Render at ≤ 1280 px on the long side: crisp on a page, cheap enough for several on one board.
  const k = Math.min(1, 1280 / Math.max(1, width, height));
  const bw = Math.max(16, Math.round(width * k)), bh = Math.max(9, Math.round(height * k));

  // (Re)build when the visualizer itself changes; settings below update in place.
  useEffect(() => {
    const b = buildSource(spec, bw, bh); built.current = b;
    if (b) applyAudio(b, spec, player);
    return () => { try { b?.src.dispose(); } catch { /* */ } built.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.value]);
  useEffect(() => { const b = built.current; if (b) { try { b.src.resize(bw, bh); } catch { /* */ } } }, [bw, bh]);
  useEffect(() => {
    const b = built.current; if (!b) return;
    applyAudio(b, spec, player);
    if (b.kind === 'GENERATOR') (b.src as GeneratorSource).update({ kind: 'GENERATOR', mode: resolveVisualizerValue(spec.value)?.kind === 'GENERATOR' ? (resolveVisualizerValue(spec.value) as any).mode : spec.value,
      params: { speed: spec.speed ?? 1, morph: spec.morph === false ? 0 : 1, director: spec.director === false ? 0 : 1, audioSource: spec.audio === 'mic' ? 'live-input' : 'none' } } as any);
  }, [spec.audio, spec.speed, spec.morph, spec.director, player, spec.value]);

  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible.current = es.some(e => e.isIntersecting); }) : null;
    io?.observe(wrap);
    let raf = 0, last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible.current || document.hidden || now - last < 32) return;   // ≤ 30 fps, only when seen
      last = now;
      const c = canvasRef.current, b = built.current; if (!c || !b) return;
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
      const f = b.src.frame((now - t0) / 1000);
      const ctx = c.getContext('2d'); if (!ctx || !f) return;
      ctx.drawImage(f, 0, 0, bw, bh);
      if (reducedMotion() && (now - t0) > 1500) { cancelAnimationFrame(raf); raf = 0; }   // hold a still
    };
    raf = requestAnimationFrame(loop);
    return () => { if (raf) cancelAnimationFrame(raf); io?.disconnect(); };
  }, [bw, bh]);

  return (
    <div ref={wrapRef} data-tela-visualizer={objectId || ''} role="img" aria-label={label || spec.name || 'Visualizer'} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', background: '#000' }}>
      {spec.posterSrc && <img src={spec.posterSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
const field: React.CSSProperties = { height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none', minWidth: 0, width: '100%' };
const chip = (on: boolean): React.CSSProperties => ({ height: 26, padding: '0 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: on ? '#bff6ff' : 'rgba(255,255,255,.6)', background: on ? 'rgba(0,218,243,.14)' : 'rgba(255,255,255,.06)', border: on ? '1px solid rgba(0,218,243,.45)' : '1px solid rgba(255,255,255,.12)' });

export const TelaVisualizerInspector: React.FC<{ object: TelaVectorObject; onUpdate: (patch: Partial<TelaVectorObject>) => void }> = ({ object, onUpdate }) => {
  const spec = object.visualizer;
  const latest = useRef(object); latest.current = object;
  const [milk, setMilk] = useState<string[]>([]);
  useEffect(() => { let alive = true; loadMilkdropNames().then(n => { if (alive) setMilk(n || []); }).catch(() => {}); return () => { alive = false; }; }, []);
  const catalog = useMemo(() => buildVisualizerCatalog(milk), [milk]);
  const groups = useMemo(() => { const m = new Map<string, VisualizerEntry[]>(); for (const e of catalog) { const a = m.get(e.group) || []; a.push(e); m.set(e.group, a); } return [...m.entries()]; }, [catalog]);
  const posterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (posterTimer.current) clearTimeout(posterTimer.current); }, []);
  if (!spec) return <div style={{ fontSize: 11, color: '#ffb3c6' }}>This visualizer has no settings.</div>;

  const rebake = () => {
    if (posterTimer.current) clearTimeout(posterTimer.current);
    posterTimer.current = setTimeout(async () => {
      const cur = latest.current; const s = cur.visualizer; if (!s) return;
      const posterSrc = await renderVisualizerPoster(s, cur.w, cur.h);
      if (posterSrc && latest.current.visualizer) onUpdate({ visualizer: { ...latest.current.visualizer, posterSrc } });
    }, 500);
  };
  const set = (patch: Partial<TelaVisualizerSpec>, poster = false) => {
    const cur = latest.current.visualizer; if (!cur) return;
    const next = { ...cur, ...patch }; latest.current = { ...latest.current, visualizer: next };
    onUpdate({ visualizer: next, ...(patch.name ? { objectLabel: patch.name } : {}) });
    if (poster) rebake();
  };
  const isCanvas = spec.value.startsWith('FLUX_CANVAS_'), audio = spec.audio ?? 'player';

  return (
    <div style={{ marginBottom: 12, display: 'grid', gap: 9 }}>
      <div>
        <div style={lbl}>Visualizer</div>
        <select style={field} value={spec.value} onChange={e => { const hit = catalog.find(c => c.value === e.target.value); set({ value: e.target.value, name: hit?.name || spec.name }, true); }}>
          {!catalog.some(c => c.value === spec.value) && <option value={spec.value}>{spec.name || spec.value}</option>}
          {groups.map(([g, items]) => <optgroup key={g} label={g}>{items.map(it => <option key={it.id} value={it.value}>{it.name}</option>)}</optgroup>)}
        </select>
      </div>
      <div>
        <div style={lbl}>Reacts to</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button type="button" style={chip(audio === 'player')} onClick={() => set({ audio: 'player' })}><Music2 size={11} />Plajah player</button>
          <button type="button" style={chip(audio === 'mic')} onClick={() => set({ audio: 'mic' })}><Mic size={11} />Microphone</button>
          <button type="button" style={chip(audio === 'none')} onClick={() => set({ audio: 'none' })}><MicOff size={11} />Nothing</button>
        </div>
      </div>
      <label style={{ display: 'grid', gap: 3 }}>
        <span style={lbl}>Speed · {(spec.speed ?? 1).toFixed(2)}×</span>
        <input type="range" min={0} max={3} step={0.05} value={spec.speed ?? 1} onChange={e => set({ speed: Number(e.target.value) })} />
      </label>
      {isCanvas && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button type="button" style={chip(spec.morph !== false)} onClick={() => set({ morph: spec.morph === false }, true)}>Pattern morph {spec.morph === false ? 'off' : 'on'}</button>
          <button type="button" style={chip(spec.director !== false)} onClick={() => set({ director: spec.director === false })}>Director {spec.director === false ? 'off' : 'on'}</button>
        </div>
      )}
      <button type="button" style={chip(false)} onClick={rebake}><RefreshCw size={11} />Refresh still for print &amp; export</button>
    </div>
  );
};

// ── Image effects ───────────────────────────────────────────────────────────

/** One shared GL context for every image effect on the page (effects are chained in it). */
let fxGL: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; renderer: FxRenderer; src: WebGLTexture; audio: AudioTexture } | null = null;
function fxContext() {
  if (fxGL) return fxGL;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
  const gl = createGL(canvas) as WebGL2RenderingContext | null; if (!gl) return null;
  fxGL = { canvas, gl, renderer: new FxRenderer(gl), src: makeSourceTexture(gl), audio: new AudioTexture(gl) };
  return fxGL;
}
const paramsFor = (effectId: string, given?: number[]) => given?.length ? given : (getEffect(effectId)?.params.map(p => p.default) ?? []);

/** Run an effect chain over a picture → a 2D canvas (w×h). Null when WebGL2 or the source isn't available. */
export function applyPixelsFx(el: HTMLImageElement | HTMLCanvasElement, fx: TelaPixelsFx, w: number, h: number, time = 1, analyser?: AnalyserNode | null, out?: HTMLCanvasElement): HTMLCanvasElement | null {
  const c = fxContext(); if (!c) return null;
  const { gl, renderer } = c;
  if (!uploadElement(gl, c.src, el)) return null;
  if (analyser) c.audio.update(analyser);
  let tex: WebGLTexture = c.src;
  fx.steps.forEach((s, i) => {
    if (!getEffect(s.effectId)) return;
    tex = renderer.render(`tela-fx:${i}:${s.effectId}`, s.effectId, paramsFor(s.effectId, s.params), tex, w, h, { time, audio: c.audio }, undefined, { mix: Math.max(0, Math.min(1, (s.mix ?? 1) * fx.amount)) });
  });
  const rb = makeTarget(gl, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rb.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const px = new Uint8ClampedArray(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteTexture(rb.tex); gl.deleteFramebuffer(rb.fbo);
  // GL rows run bottom-up; the picture was uploaded flipped, so flip back while copying.
  const rowBytes = w * 4, flipped = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) flipped.set(px.subarray((h - 1 - y) * rowBytes, (h - y) * rowBytes), y * rowBytes);
  const canvas = out ?? document.createElement('canvas');
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.getContext('2d')!.putImageData(new ImageData(flipped, w, h), 0, 0);
  return canvas;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const fitSize = (w: number, h: number, max: number) => { const k = Math.min(1, max / Math.max(1, w, h)); return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) }; };

/** The filtered picture as a data URL (≤ 1600 px), for `filteredSrc`. */
export async function bakePixelsFx(sourceSrc: string, fx: TelaPixelsFx): Promise<string | null> {
  try {
    const img = await loadImage(sourceSrc);
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, 1600);
    const out = applyPixelsFx(img, fx, w, h, 1);
    return out ? out.toDataURL('image/jpeg', 0.9) : null;
  } catch { return null; }
}

/** Live (animated, music-reactive) rendering of an image's effect, sized to the source picture. */
export const TelaFxLiveImage: React.FC<{ sourceSrc: string; fx: TelaPixelsFx }> = ({ sourceSrc, fx }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = usePlayerAnalyser();
  const fxRef = useRef(fx); fxRef.current = fx;
  useEffect(() => {
    let raf = 0, alive = true, last = 0, img: HTMLImageElement | null = null;
    const t0 = performance.now();
    loadImage(sourceSrc).then(i => { img = i; }).catch(() => {});
    const loop = (now: number) => {
      if (!alive) return; raf = requestAnimationFrame(loop);
      if (!img || document.hidden || now - last < 42) return;   // ≤ 24 fps
      last = now;
      const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, 960);
      if (canvasRef.current) applyPixelsFx(img, fxRef.current, w, h, (now - t0) / 1000, player, canvasRef.current);
      if (reducedMotion()) { cancelAnimationFrame(raf); raf = 0; }
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; if (raf) cancelAnimationFrame(raf); };
  }, [sourceSrc, player]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

/** Effect controls on an image object: what's applied, amount, live, remove. */
export const TelaImageFxInspector: React.FC<{ object: TelaVectorObject; onUpdate: (patch: Partial<TelaVectorObject>) => void }> = ({ object, onUpdate }) => {
  const fx = object.pixelsFx;
  const latest = useRef(object); latest.current = object;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const effectOptions = useMemo(() => (FX_EFFECTS as any[]).filter(e => !e.auxInput || e.auxInput.optional).map(e => ({ id: e.id, name: e.name, cat: String(e.category || 'Effect') })), []);
  const commit = (next: TelaPixelsFx | undefined) => {
    onUpdate({ pixelsFx: next });
    if (!next || !latest.current.sourceImageSrc) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const src = latest.current.sourceImageSrc; const cur = latest.current.pixelsFx; if (!src || !cur) return;
      const filteredSrc = await bakePixelsFx(src, cur);
      if (filteredSrc && latest.current.pixelsFx) onUpdate({ pixelsFx: { ...latest.current.pixelsFx, filteredSrc } });
    }, 350);
  };
  return (
    <div style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
      <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={11} />Effect</div>
      <select style={field} value={fx?.steps.length === 1 ? fx.steps[0].effectId : ''} onChange={e => {
        const id = e.target.value;
        if (!id) { commit(undefined); return; }
        commit({ steps: [{ effectId: id }], amount: fx?.amount ?? 1, name: effectOptions.find(o => o.id === id)?.name, live: fx?.live });
      }}>
        <option value="">{fx && fx.steps.length > 1 ? (fx.name || 'Look') : 'None'}</option>
        {effectOptions.map(o => <option key={o.id} value={o.id}>{o.cat} · {o.name}</option>)}
      </select>
      {fx && <>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Amount · {Math.round(fx.amount * 100)}%</span>
          <input type="range" min={0} max={1} step={0.01} value={fx.amount} onChange={e => commit({ ...fx, amount: Number(e.target.value) })} />
        </label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button type="button" style={chip(!!fx.live)} onClick={() => commit({ ...fx, live: !fx.live })}>{fx.live ? 'Live: on' : 'Live: off'}</button>
          <button type="button" style={chip(false)} onClick={() => commit(undefined)}><X size={11} />Remove effect</button>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)' }}>Live animates the effect and lets it react to the Plajah player; print and export use the still.</div>
      </>}
    </div>
  );
};

/** Library item → effect steps (an `fx:` effect, or a Look's resolved chain). */
export function fxFromLibraryItem(item: { kind: string; name: string; preview?: any }): TelaPixelsFx | null {
  const p = item.preview || {};
  if (item.kind === 'fx' && p.effectId) return { steps: [{ effectId: p.effectId, params: Array.isArray(p.params) ? p.params : undefined }], amount: 1, name: item.name };
  if (item.kind === 'look' && Array.isArray(p.look) && p.look.length) return { steps: p.look.map((s: any) => ({ effectId: s.effectId, params: s.params, mix: s.mix })), amount: 1, name: item.name };
  return null;
}
/** Library item → visualizer spec (a `gen:` scene/generator, or a `shader:`). */
export function visualizerFromLibraryItem(item: { kind: string; name: string; preview?: any }): TelaVisualizerSpec | null {
  const p = item.preview || {};
  if (item.kind === 'gen' && p.genMode) return { value: String(p.genMode), name: item.name, audio: 'player' };
  if (item.kind === 'shader') return { value: `SHADER:${item.name}`, name: item.name, audio: 'player', shaderSrc: typeof p.shaderSrc === 'string' ? p.shaderSrc : undefined };
  return null;
}
