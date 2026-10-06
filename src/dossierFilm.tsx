// Standalone Dossier film page (dossier-film.html).
//   /dossier-film.html            → the interactive player
//   /dossier-film.html?render=1   → bare 1920×1080 canvas driven by scripts/dossier/renderFilm.ts
//   /dossier-film.html?render=1&t=42  → a single still at 42 s (for review)
import React from 'react';
import { createRoot } from 'react-dom/client';
import DossierFilmPlayer from '../components/dossier/DossierFilmPlayer';
import { FilmRenderer, FONT_CSS } from '../services/dossier/film/filmRenderer';
import { loadDouglassFilm } from '../data/dossier/douglassFilm';

const q = new URLSearchParams(location.search);

declare global {
  interface Window {
    __film?: {
      ready: boolean; duration: number; fps: number;
      draw(t: number): void;
      frame(t: number, quality?: number): string;
      voiceCues: Array<{ src: string; at: number; duration: number }>;
      score?: { src: string; volume: number; duckTo: number };
      chapters: Array<{ label: string; start: number }>;
    };
  }
}

async function renderMode() {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_CSS; document.head.appendChild(link);
  const w = Number(q.get('w')) || 1920, h = Number(q.get('h')) || 1080;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100vw;height:auto;display:block';
  document.body.appendChild(canvas);
  const spec = await loadDouglassFilm(w, h);
  const r = new FilmRenderer(canvas, spec);
  await r.load();
  await document.fonts.ready;
  window.__film = {
    ready: true, duration: r.duration, fps: spec.fps,
    draw: t => r.draw(t),
    frame: (t, quality = .93) => { r.draw(t); return canvas.toDataURL('image/jpeg', quality); },
    voiceCues: r.voiceCues, score: spec.score, chapters: r.chapters,
  };
  const t = q.get('t');
  r.draw(t ? Number(t) : 0);
}

if (q.has('render')) void renderMode();
else createRoot(document.getElementById('root')!).render(<DossierFilmPlayer load={loadDouglassFilm} width={1600} height={900} />);
