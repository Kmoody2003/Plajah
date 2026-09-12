// LibraryTile — renders one LibraryItem's preview by dispatching on its preview
// mode. Live GL kinds (fx / shader / gen / look / trans) register with the shared
// fxPreview engine (one context, many tiles); Melos grooves/basslines use the 2D
// PatternThumb; Tela templates render their real page-1 SVG; media shows a
// thumbnail. Only on-screen tiles render (IntersectionObserver), so a 590-item
// grid stays cheap.
import React, { useEffect, useRef, useState } from 'react';
import { fxPreview, type FxPreviewTileRef } from '../../plajahPixels/engine/fx/fxPreview';
import { DrumPatternThumb, BasslineThumb } from '../../melos/beats/PatternThumb';
import { TelaStaticSvg } from '../../tela/TelaVector';
import { TELA_TEMPLATE_GALLERY } from '../../../services/tela/telaTemplateRegistry';
import { ensureFontsForObjects } from '../../../services/tela/telaFonts';
import type { LibraryItem } from '../../../services/universalLibrary/libraryModel';

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

export const LibraryTile: React.FC<{ item: LibraryItem }> = ({ item }) => {
  const p = item.preview;
  if (p.mode === 'groove') return <DrumPatternThumb pattern={p.pattern as any} bpm={p.bpm} className="" style={fill as any} />;
  if (p.mode === 'bassline') return <BasslineThumb notes={p.notes as any} bpm={p.bpm} className="" style={fill as any} />;
  if (p.mode === 'tela') return <TelaTile item={item} />;
  if (p.mode === 'image') return <img src={p.url} alt={item.name} style={{ ...fill, objectFit: 'cover' }} />;
  if (p.mode === 'video') return <video src={p.url} muted loop autoPlay playsInline style={{ ...fill, objectFit: 'cover' }} />;
  if (p.mode === 'swatch') return <div style={{ ...fill, background: p.swatch }} />;
  return <GLTile item={item} />;
};

export default LibraryTile;
