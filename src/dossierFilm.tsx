// Standalone Dossier film page (dossier-film.html).
//   /dossier-film.html                      → the interactive player (Douglass, council style)
//   /dossier-film.html?film=ford|persia|partition → the interactive player, council style
//   /dossier-film.html?film=douglass-legacy → the earlier, pre-council Douglass cut
//   /dossier-film.html?film=founding-battle → the interactive player, the animated-painting demo (Trumbull, Bunker Hill);
//                                              add &motion=full to play the motion when the OS asks for reduced motion
//   /dossier-film.html?render=1[&film=ford] → bare 1920×1080 canvas driven by scripts/dossier/renderFilm.ts
//   /dossier-film.html?render=1&t=42        → a single still at 42 s (for review)
import React from 'react';
import { createRoot } from 'react-dom/client';
import DossierFilmPlayer from '../components/dossier/DossierFilmPlayer';
import { FilmRenderer, FONT_CSS } from '../services/dossier/film/filmRenderer';
import type { FilmSpec } from '../services/dossier/film/filmTypes';
import { loadDouglassFilm } from '../data/dossier/douglassFilm';
import { loadDouglassCouncilFilm } from '../data/dossier/douglassFilmCouncil';
import { loadPersiaCouncilFilm } from '../data/dossier/persiaFilmCouncil';
import { loadPartitionCouncilFilm } from '../data/dossier/partitionFilmCouncil';
import { loadFordCouncilFilm } from '../data/dossier/fordFilmCouncil';
import { loadFoundingBattleFilm } from '../data/dossier/foundingBattleDemo';

const q = new URLSearchParams(location.search);
const LOADERS: Record<string, (w?: number, h?: number) => Promise<FilmSpec>> = {
  douglass: loadDouglassCouncilFilm, 'douglass-legacy': loadDouglassFilm, ford: loadFordCouncilFilm, persia: loadPersiaCouncilFilm, partition: loadPartitionCouncilFilm,
  'founding-battle': loadFoundingBattleFilm,
};
const which = q.get('film') ?? 'douglass';
const loadSpec = LOADERS[which] ?? loadDouglassCouncilFilm;
const TITLES: Record<string, string> = { douglass: 'Frederick Douglass', 'douglass-legacy': 'Frederick Douglass (earlier cut)', ford: 'Henry Ford', persia: 'Christianity in Persia', partition: 'The Partition of India, 1947', 'founding-battle': 'Bunker Hill (animated painting)' };

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
        foley: Array<{ at: number; kind: string; gain?: number }>;
        ambience: Array<{ from: number; to: number; kind: string }>;
        stableTimes: Array<{ id: string; t: number }>;
        warnings: string[];
        verify(t: number): { fidelity: Array<{ asset: string; psnr: number; vsSource: number }> };
        textGates(): { captionFit: Array<{ text: string; lines: number; width: number }>; textFit: string[] };
        paintingGates(): Array<{ id: string; ok: boolean; lock?: { maxDiff: number; compared: number; farMoved: number }; stillDb?: number; bookendDiff?: number; note?: string }>;
      };
    };
  }
}

// Preview only: ?motion=full plays the animated version even when the OS asks for reduced motion (the player otherwise shows
// the authored still, as it must for viewers who asked for it). Useful for review on machines that have it switched on.
if (q.get('motion') === 'full' && window.matchMedia) {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => /prefers-reduced-motion/.test(query) ? ({ ...real('(min-width: 0px)'), matches: false, media: query } as MediaQueryList) : real(query);
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
      silences: c.tl.silences, foley: c.tl.foley, ambience: c.tl.ambience, warnings: c.tl.warnings,
      // A frame inside each plate shot's hold (after its transition, before the lower third retracts) for the PSNR gate.
      // Shots with a mark (underline, crop-in) are also checked just after the underline, with its own rows left out, and always before the crop-in begins.
      stableTimes: c.tl.shots.filter(s => s.kind === 'plates').flatMap(s => {
        const base = s.start + s.trDur + Math.min(1.5, (s.end - s.start - s.trDur) / 2);
        const first = s.marks.length ? Math.min(...s.marks.map(m => m.at)) : Infinity;
        const out = [{ id: s.spec.id, t: Math.min(base, first - 0.15) }];
        const u = s.marks.find(m => m.mark.kind === 'underline'), d = s.marks.find(m => m.mark.kind === 'detail');
        if (u) { const t2 = u.at + 14 / 30 + 0.25; if (!d || t2 < d.at - 0.1) out.push({ id: `${s.spec.id}+underline`, t: t2 }); }
        return out;
      }),
      verify: t => { r.draw(t); return { fidelity: c.painter.plateFidelity(canvas.getContext('2d')!, t) }; },
      paintingGates: () => c.painter.paintingGates(),
      textGates: () => ({ captionFit: c.painter.captionFit(canvas.getContext('2d')!), textFit: c.painter.textFit(canvas.getContext('2d')!) }),
    },
  };
  const t = q.get('t');
  r.draw(t ? Number(t) : 0);
}

if (q.has('render')) void renderMode();
else {
  document.title = `${TITLES[which] ?? 'Frederick Douglass'} — Dossier film`;
  createRoot(document.getElementById('root')!).render(<DossierFilmPlayer load={loadSpec} width={1600} height={900} />);
}
