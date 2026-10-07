// Standalone Dossier film page (dossier-film.html).
//   /dossier-film.html                      → the interactive player (Douglass)
//   /dossier-film.html?film=ford            → the interactive player, Henry Ford (council style)
//   /dossier-film.html?render=1[&film=ford] → bare 1920×1080 canvas driven by scripts/dossier/renderFilm.ts
//   /dossier-film.html?render=1&t=42        → a single still at 42 s (for review)
import React from 'react';
import { createRoot } from 'react-dom/client';
import DossierFilmPlayer from '../components/dossier/DossierFilmPlayer';
import { FilmRenderer, FONT_CSS } from '../services/dossier/film/filmRenderer';
import type { FilmSpec } from '../services/dossier/film/filmTypes';
import { loadDouglassFilm } from '../data/dossier/douglassFilm';
import { loadFordCouncilFilm } from '../data/dossier/fordFilmCouncil';

const q = new URLSearchParams(location.search);
const LOADERS: Record<string, (w?: number, h?: number) => Promise<FilmSpec>> = { douglass: loadDouglassFilm, ford: loadFordCouncilFilm };
const which = q.get('film') ?? 'douglass';
const loadSpec = LOADERS[which] ?? loadDouglassFilm;

declare global {
  interface Window {
    __film?: {
      ready: boolean; duration: number; fps: number;
      draw(t: number): void;
      frame(t: number, quality?: number, format?: 'jpeg' | 'png'): string;
      voiceCues: Array<{ src: string; at: number; duration: number }>;
      score?: { src: string; volume: number; duckTo: number };
      chapters: Array<{ label: string; start: number }>;
      /** Council style only. */
      council?: {
        timing: 'estimated' | 'voiced' | 'mixed';
        cues: Array<{ a: number; b: number; text: string }>;
        silences: Array<{ from: number; to: number }>;
        foley: Array<{ at: number; kind: string }>;
        stableTimes: Array<{ id: string; t: number }>;
        warnings: string[];
        verify(t: number): { fidelity: Array<{ asset: string; psnr: number; vsSource: number }> };
        textGates(): { captionFit: Array<{ text: string; lines: number; width: number }>; textFit: string[] };
      };
    };
  }
}

async function renderMode() {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_CSS; document.head.appendChild(link);
  const w = Number(q.get('w')) || 1920, h = Number(q.get('h')) || 1080;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100vw;height:auto;display:block';
  document.body.appendChild(canvas);
  const spec = await loadSpec(w, h);
  const r = new FilmRenderer(canvas, spec);
  await r.load();
  await document.fonts.ready;
  const c = r.council;
  window.__film = {
    ready: true, duration: r.duration, fps: spec.fps,
    draw: t => r.draw(t),
    frame: (t, quality = .93, format = 'jpeg') => { r.draw(t); return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', quality); },
    voiceCues: r.voiceCues, score: spec.score, chapters: r.chapters,
    council: c && {
      timing: c.tl.timing,
      cues: c.tl.cues.map(x => ({ a: x.a, b: x.b, text: x.text })),
      silences: c.tl.silences, foley: c.tl.foley, warnings: c.tl.warnings,
      // A frame inside each plate shot's hold (after its transition, before the lower third retracts) for the PSNR gate.
      stableTimes: c.tl.shots.filter(s => s.kind === 'plates').map(s => ({ id: s.spec.id, t: s.start + s.trDur + Math.min(1.5, (s.end - s.start - s.trDur) / 2) })),
      verify: t => { r.draw(t); return { fidelity: c.painter.plateFidelity(canvas.getContext('2d')!, t) }; },
      textGates: () => ({ captionFit: c.painter.captionFit(canvas.getContext('2d')!), textFit: c.painter.textFit(canvas.getContext('2d')!) }),
    },
  };
  const t = q.get('t');
  r.draw(t ? Number(t) : 0);
}

if (q.has('render')) void renderMode();
else {
  document.title = `${which === 'ford' ? 'Henry Ford' : 'Frederick Douglass'} — Dossier film`;
  createRoot(document.getElementById('root')!).render(<DossierFilmPlayer load={loadSpec} width={1600} height={900} />);
}
