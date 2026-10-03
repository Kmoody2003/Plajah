// AmboTemplateThumbs — still thumbnails for slide templates and scripture looks.
//
// Drawn by the SAME renderers the outputs use, at a small fixed size, only once
// the tile scrolls into view, and cached — so a menu of 50 templates or 59
// looks opens instantly and never redraws what it already has. Slide thumbnails
// take the slide's own words, so each tile shows what THIS slide would look like.
import React, { useEffect, useRef, useState } from 'react';
import { renderSlideTemplate, loadThemeFonts, invalidateSlideLayouts } from '../../services/ambo/slideTemplates/canvasRender';
import { renderScripture, scriptureLayoutById, SAMPLE_SCRIPTURE } from '../../services/ambo/scriptureLayouts';

const TW = 448, TH = 252;

// ── cache ────────────────────────────────────────────────────────────────────
const cache = new Map<string, HTMLCanvasElement>();
function remember(key: string, c: HTMLCanvasElement) {
  if (cache.size >= 360) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
}
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// ── fonts: a theme's faces load once, then its cached tiles are redrawn ──────
const fontJobs = new Map<string, Promise<void>>();
const fontsReady = new Set<string>();
export function ensureThemeFonts(theme: string): Promise<void> {
  let p = fontJobs.get(theme);
  if (!p) {
    p = loadThemeFonts(theme).catch(() => undefined).then(() => {
      fontsReady.add(theme);
      invalidateSlideLayouts();
      for (const k of [...cache.keys()]) if (k.startsWith(`slide|${theme}|0|`)) cache.delete(k);
    });
    fontJobs.set(theme, p);
  }
  return p;
}

/** True once the tile has been on screen (it then stays drawn). */
function useSeen(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '160px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}

function blit(dst: HTMLCanvasElement | null, src: HTMLCanvasElement) {
  if (!dst) return;
  if (dst.width !== TW || dst.height !== TH) { dst.width = TW; dst.height = TH; }
  dst.getContext('2d')?.drawImage(src, 0, 0);
}

function failCard(ctx: CanvasRenderingContext2D, label: string) {
  ctx.fillStyle = '#16111f'; ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 22px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(label, TW / 2, TH / 2, TW - 40);
}

// ── slide template ───────────────────────────────────────────────────────────
export const SlideThumb: React.FC<{
  templateId: string; theme?: string; fields?: Record<string, string>; className?: string;
}> = ({ templateId, theme = 'sanctuary', fields, className }) => {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(box);
  const [epoch, setEpoch] = useState(0);
  const fk = hash(JSON.stringify(fields || {}));

  useEffect(() => {
    if (!seen || fontsReady.has(theme)) return;
    let alive = true;
    ensureThemeFonts(theme).then(() => { if (alive) setEpoch(e => e + 1); });
    return () => { alive = false; };
  }, [seen, theme]);

  useEffect(() => {
    if (!seen) return;
    const key = `slide|${theme}|${fontsReady.has(theme) ? 1 : 0}|${templateId}|${fk}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = TW; tile.height = TH;
      const ctx = tile.getContext('2d')!;
      try {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, TW, TH);
        renderSlideTemplate(ctx, templateId, theme, fields, TW, TH, { t: 4, enterP: 1, exitP: 0, reducedMotion: true });
      } catch { failCard(ctx, templateId); }
      remember(key, tile);
    }
    blit(cv.current, tile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, templateId, theme, fk, epoch]);

  return (
    <div ref={box} className={className} style={{ aspectRatio: '16 / 9', background: '#0c0914' }}>
      <canvas ref={cv} width={TW} height={TH} className="block w-full h-full" />
    </div>
  );
};

// ── scripture look ───────────────────────────────────────────────────────────
export interface ScriptureSample { text: string; reference: string; translation?: string }

/** Neighbouring verses (KJV, public domain) so the typographic looks have something to weave. */
const SAMPLE_CONTEXT = [
  '12 Then shall ye call upon me, and ye shall go and pray unto me, and I will hearken unto you.',
  '13 And ye shall seek me, and find me, when ye shall search for me with all your heart.',
  '10 For thus saith the LORD, That after seventy years be accomplished at Babylon I will visit you, and perform my good word toward you.',
  '14 And I will be found of you, saith the LORD.',
];

function stageBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b3a55'); g.addColorStop(0.5, '#4a3b5e'); g.addColorStop(1, '#2a4a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(w * (0.12 + i * 0.2), h * (0.3 + (i % 3) * 0.2), h * 0.17, 0, Math.PI * 2); ctx.fill(); }
}

export const ScriptureThumb: React.FC<{
  layoutId: string; accent?: string; sample?: ScriptureSample; className?: string;
}> = ({ layoutId, accent = '#D4AF37', sample, className }) => {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(box);
  const s = sample ?? SAMPLE_SCRIPTURE;
  const sk = hash(`${s.text}|${s.reference}`);

  useEffect(() => {
    if (!seen) return;
    const key = `scr|${layoutId}|${accent}|${sk}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = TW; tile.height = TH;
      const ctx = tile.getContext('2d')!;
      try {
        const layout = scriptureLayoutById(layoutId);
        if (layout.background === 'transparent') stageBackdrop(ctx, TW, TH); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, TW, TH); }
        renderScripture(ctx, layout.id, {
          w: TW, h: TH, t: 4, text: s.text, reference: s.reference, translation: s.translation || 'KJV',
          accent, enterP: 1, exitP: 0, transition: 'crossfade', context: SAMPLE_CONTEXT, mt: 4,
        });
      } catch { failCard(ctx, layoutId); }
      remember(key, tile);
    }
    blit(cv.current, tile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, layoutId, accent, sk]);

  return (
    <div ref={box} className={className} style={{ aspectRatio: '16 / 9', background: '#0c0914' }}>
      <canvas ref={cv} width={TW} height={TH} className="block w-full h-full" />
    </div>
  );
};
