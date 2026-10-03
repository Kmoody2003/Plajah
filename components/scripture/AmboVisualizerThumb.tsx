// AmboVisualizerThumb — the picture on a visualizer card in Ambo's library.
//
// Reuses Pixels' existing preview machinery rather than building another:
//   · GEN_GLSL generators → GeneratorPreviewTile (shared fxPreview WebGL2 context, live)
//   · Shadertoy shaders   → shaderThumbs still (IndexedDB-cached) + live
//                           ShaderPreviewTile while hovered
//   · everything else (Flux 3D, Studio GL presets, Milkdrop) → one still,
//     rendered through the SAME layer source the monitors use
//     (snapshotVisualizer), queued one at a time and only when on screen.
// A visualizer that cannot render says so on the card instead of showing black.

import React, { useEffect, useRef, useState } from 'react';
import type { AmboMediaSourceItem } from './AmboMediaBin';
import { GeneratorPreviewTile, ShaderPreviewTile } from '../plajahPixels/components/ShaderPreviewTile';
import { hasGenerator } from '../plajahPixels/engine/core/generators';
import { getShaderThumb, peekShaderThumb } from '../plajahPixels/ui/shaderThumbs';
import { normalizeGeneratorMode, snapshotVisualizer } from '../../services/ambo/layerSources';

// ── Sequential snapshot queue (one GL context at a time) ─────────────────────
const snapCache = new Map<string, string | null>();
type Job = { mode: string; done: (url: string | null) => void; cancelled: boolean };
const queue: Job[] = [];
let running = false;

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (job.cancelled) continue;
      if (snapCache.has(job.mode)) { job.done(snapCache.get(job.mode) ?? null); continue; }
      let url: string | null = null;
      try { url = await snapshotVisualizer({ kind: 'GENERATOR', mode: job.mode }, 320, 180); } catch { url = null; }
      snapCache.set(job.mode, url);
      job.done(url);
    }
  } finally {
    running = false;
  }
}

function requestSnapshot(mode: string, done: (url: string | null) => void): () => void {
  if (snapCache.has(mode)) { done(snapCache.get(mode) ?? null); return () => {}; }
  const job: Job = { mode, done, cancelled: false };
  queue.push(job);
  void pump();
  return () => { job.cancelled = true; };
}

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

const Unavailable: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
    <span className="px-1.5 py-0.5 rounded bg-black/70 text-[8px] font-semibold text-white/60">{text}</span>
  </div>
);

/** Visible-on-screen flag (with a margin) so off-screen cards cost nothing. */
function useOnScreen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setOn(true); }, { rootMargin: '200px' });
    io.observe(el);
    // Belt and braces: IntersectionObserver does not deliver in some hosts
    // (background/hidden documents, embedded panes). Fall back to a geometry check.
    const timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 0, vw = window.innerWidth || 0;
      if (r.width > 0 && r.bottom > -200 && r.top < vh + 200 && r.right > -200 && r.left < vw + 200) setOn(true);
    }, 1200);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, []);
  return [ref, on];
}

export const AmboVisualizerThumb: React.FC<{ item: AmboMediaSourceItem; hovered?: boolean }> = ({ item, hovered }) => {
  const isShader = item.kind === 'SHADER';
  const shaderSrc = isShader ? (item.src || item.mode || '') : '';
  const mode = isShader ? '' : normalizeGeneratorMode(item.mode);
  const liveGen = !isShader && hasGenerator(mode);
  const [boxRef, onScreen] = useOnScreen<HTMLDivElement>();
  const shaderKey = `ambo-viz:${item.id}`;
  const [still, setStill] = useState<string | null>(() => (isShader ? peekShaderThumb(shaderKey) : (snapCache.get(mode) ?? null)));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!onScreen || still || failed || liveGen) return;
    let cancelled = false;
    if (isShader) {
      if (!shaderSrc) { setFailed(true); return; }
      getShaderThumb(shaderKey, shaderSrc).then(url => {
        if (cancelled) return;
        if (url) setStill(url); else setFailed(true);
      });
      return () => { cancelled = true; };
    }
    const cancel = requestSnapshot(mode, url => {
      if (cancelled) return;
      if (url) setStill(url); else setFailed(true);
    });
    return () => { cancelled = true; cancel(); };
  }, [onScreen, still, failed, liveGen, isShader, shaderSrc, shaderKey, mode]);

  return (
    <div ref={boxRef} style={{ ...fill, background: item.gradient || '#120a1f' }} aria-label={`${item.name} preview`}>
      {liveGen && onScreen && <GeneratorPreviewTile mode={mode} />}
      {still && <img src={still} alt="" draggable={false} style={fill} />}
      {isShader && hovered && shaderSrc && !failed && <ShaderPreviewTile id={shaderKey} src={shaderSrc} />}
      {!still && !liveGen && !failed && onScreen && <Unavailable text="Rendering…" />}
      {failed && <Unavailable text={isShader ? "Shader won't compile here" : 'Preview unavailable'} />}
    </div>
  );
};

export default AmboVisualizerThumb;
