// LibraryTile — renders one LibraryItem's preview by dispatching on its preview
// mode. Live GL kinds (fx / shader / gen / look / trans) register with the shared
// fxPreview engine (one context, many tiles); Melos grooves/basslines use the 2D
// PatternThumb; Tela templates render their real page-1 SVG; media shows a
// thumbnail; Ambo motion templates animate via renderMotionTemplateAt. Only on-screen tiles render (IntersectionObserver), so a 590-item
// grid stays cheap.
import React, { useEffect, useRef, useState } from 'react';
import { fxPreview, type FxPreviewTileRef } from '../../plajahPixels/engine/fx/fxPreview';
import { DrumPatternThumb, BasslineThumb } from '../../melos/beats/PatternThumb';
import { TelaStaticSvg } from '../../tela/TelaVector';
import { TELA_TEMPLATE_GALLERY } from '../../../services/tela/telaTemplateRegistry';
import { ensureFontsForObjects } from '../../../services/tela/telaFonts';
import type { LibraryItem } from '../../../services/universalLibrary/libraryModel';
import type { TelaMotionTemplateSpec } from '../../../types';
import { renderMotionTemplateAt, ensureMotionTemplateFonts, motionPrefersReduced } from '../../../services/tela/telaMotionTemplate';

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };

// GL preview (fx / shader / gen / look / trans) via the shared engine.
const GLTile: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !fxPreview.available()) return;
    canvas.width = 192; canvas.height = 108;
    const p = item.preview;
    const kind: FxPreviewTileRef['kind'] = p.mode === 'gen' ? 'gen' : p.mode === 'shader' ? 'shader' : p.mode === 'trans' ? 'trans' : p.mode === 'look' ? 'look' : 'fx';
    const tile: FxPreviewTileRef = { canvas, visible: false, kind, effectId: p.effectId, params: p.params, mode: p.genMode, shaderSrc: p.shaderSrc, transId: p.transId, transParams: p.transParams, look: p.look };
    fxPreview.register(tile);
    const io = new IntersectionObserver((es) => { for (const e of es) fxPreview.setVisible(tile, e.isIntersecting); }, { rootMargin: '200px' });
    io.observe(canvas);
    return () => { io.disconnect(); fxPreview.unregister(tile); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  return <canvas ref={ref} style={fill} aria-label={item.name} />;
};

// Tela template — build page 1 once (visible-gated) and render its real SVG.
const telaCache = new Map<string, { objects: any[]; w: number; h: number }>();
const TelaTile: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const id = item.preview.telaTemplateId || '';
  const [built, setBuilt] = useState<{ objects: any[]; w: number; h: number } | null>(() => telaCache.get(id) || null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (built) return;
    let alive = true;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      const t: any = TELA_TEMPLATE_GALLERY.find((x) => x.id === id); if (!t) { io.disconnect(); return; }
      let objects: any[] = []; try { objects = t.pages?.[0]?.build() || []; } catch { objects = []; }
      ensureFontsForObjects(objects);
      const v = { objects, w: t.width, h: t.height }; telaCache.set(id, v);
      if (alive) setBuilt(v);
      io.disconnect();
    }, { rootMargin: '200px' });
    if (ref.current) io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <div ref={ref} style={{ ...fill, background: '#fff', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
      {built && <TelaStaticSvg objects={built.objects} width={built.w} height={built.h} style={{ width: '100%', height: 'auto', display: 'block' }} />}
    </div>
  );
};

// Ambo motion templates (slides + scripture looks) — drawn by the same pure renderer
// a Tela object / Fabula clip uses. One shared scheduler (~12 fps) renders only
// on-screen tiles, round-robin (≤ 6 per tick) through one offscreen canvas at a
// real 16:9 design size (templates re-flow by size). Off-screen tiles stop and
// keep their last frame; settled stills are cached so remounts paint instantly.
// Reduced motion = the still only.
interface MotionRec { canvas: HTMLCanvasElement; spec: TelaMotionTemplateSpec; key: string; visible: boolean; ready: boolean; born: number; last: number }
const MT_W = 640, MT_H = 360, TILE_W = 320, TILE_H = 180;
const motionRecs = new Set<MotionRec>();
const motionStills = new Map<string, HTMLCanvasElement>();
let motionOff: HTMLCanvasElement | null = null;
let motionTimer: ReturnType<typeof setTimeout> | null = null;
let motionCursor = 0;
/** Preview timing: in → hold → out → in, so each tile shows its entrance and exit. */
const previewSpec = (s: TelaMotionTemplateSpec): TelaMotionTemplateSpec => ({ ...s, timing: { startOffset: 0.15, holdSec: 2.4, loop: true, gapSec: 0.35 } });
function motionOffscreen(): CanvasRenderingContext2D | null {
  if (!motionOff) { motionOff = document.createElement('canvas'); motionOff.width = MT_W; motionOff.height = MT_H; }
  return motionOff.getContext('2d');
}
function paintMotion(rec: MotionRec, t: number | null): void {
  const o = motionOffscreen(); const c = rec.canvas.getContext('2d'); if (!o || !c) return;
  renderMotionTemplateAt(o, previewSpec(rec.spec), t ?? 0, MT_W, MT_H, { backdrop: true, still: t == null });
  c.clearRect(0, 0, TILE_W, TILE_H); c.drawImage(motionOff!, 0, 0, TILE_W, TILE_H);
  rec.canvas.dataset.mtFrames = String((+(rec.canvas.dataset.mtFrames || 0)) + 1);
}
function cacheStill(rec: MotionRec): void {
  if (motionStills.has(rec.key)) return;
  paintMotion(rec, null);
  const s = document.createElement('canvas'); s.width = TILE_W; s.height = TILE_H; s.getContext('2d')?.drawImage(rec.canvas, 0, 0);
  if (motionStills.size > 400) motionStills.clear();
  motionStills.set(rec.key, s);
}
function motionTick(): void {
  motionTimer = null;
  const live = [...motionRecs].filter(r => r.visible && r.ready);
  if (!live.length || (typeof document !== 'undefined' && document.hidden)) { if (motionRecs.size) motionTimer = setTimeout(motionTick, 400); return; }
  const now = performance.now();
  if (motionPrefersReduced()) { live.forEach(r => { if (!r.last) { paintMotion(r, null); r.last = now; } }); }
  else {
    const n = Math.min(live.length, 6);
    for (let i = 0; i < n; i++) { const r = live[(motionCursor + i) % live.length]; paintMotion(r, (now - r.born) / 1000); r.last = now; }
    motionCursor = (motionCursor + n) % Math.max(1, live.length);
  }
  motionTimer = setTimeout(motionTick, 80);
}
const kickMotion = () => { if (!motionTimer) motionTimer = setTimeout(motionTick, 30); };

const MotionTile: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const spec = item.preview.motion!;
  const key = JSON.stringify(spec);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    canvas.width = TILE_W; canvas.height = TILE_H;
    const rec: MotionRec = { canvas, spec, key, visible: false, ready: false, born: performance.now(), last: 0 };
    const still = motionStills.get(key);
    if (still) canvas.getContext('2d')?.drawImage(still, 0, 0);
    motionRecs.add(rec);
    let alive = true;
    const io = new IntersectionObserver((es) => {
      rec.visible = es.some((e) => e.isIntersecting);
      if (rec.visible && !rec.ready) {
        ensureMotionTemplateFonts(spec).then(() => { if (!alive) return; rec.ready = true; cacheStill(rec); rec.born = performance.now(); kickMotion(); });
      }
      if (rec.visible) kickMotion();
      else if (rec.ready) { const st = motionStills.get(key); const c = canvas.getContext('2d'); if (st && c) { c.clearRect(0, 0, TILE_W, TILE_H); c.drawImage(st, 0, 0); } }
    }, { rootMargin: '120px' });
    io.observe(canvas);
    return () => { alive = false; io.disconnect(); motionRecs.delete(rec); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} data-motion-tile={item.id} style={fill} aria-label={item.name} />;
};

export const LibraryTile: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const p = item.preview;
  if (p.mode === 'motion' && p.motion) return <MotionTile item={item} />;
  if (p.mode === 'groove') return <DrumPatternThumb pattern={p.pattern as any} bpm={p.bpm} className="" style={fill as any} />;
  if (p.mode === 'bassline') return <BasslineThumb notes={p.notes as any} bpm={p.bpm} className="" style={fill as any} />;
  if (p.mode === 'tela') return <TelaTile item={item} />;
  if (p.mode === 'image') return <img src={p.url} alt={item.name} style={{ ...fill, objectFit: 'cover' }} />;
  if (p.mode === 'video') return <video src={p.url} muted loop autoPlay playsInline style={{ ...fill, objectFit: 'cover' }} />;
  if (p.mode === 'swatch') return <div style={{ ...fill, background: p.swatch }} />;
  return <GLTile item={item} />;
};

export default LibraryTile;
