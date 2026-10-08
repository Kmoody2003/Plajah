// ChoraTypoVisualizer — the TYPO engine of the FX Stage: lyric-synchronised 3D typography.
//
// Engine lives in components/chora/typo/ (glyph atlas + instanced glyph layers, twelve volumes,
// audio analysis). This host owns one renderer, keeps the active volume built, feeds it the shared
// AnalyserNode and the playing track's lyrics, and disposes everything on unmount.
//
// Lyrics: timeCodedLyrics when the track has them; otherwise plain `lyrics` spread across the
// duration; otherwise title / artist / album, cycling. Time is the player's currentTime,
// extrapolated between progress ticks so word highlighting doesn't stutter.

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { loadAtlas, makeVol, disposeVol, lineStreams, clamp, TypoDirector, type Vol, type LyricState } from './chora/typo/typoEngine';
import { TYPO_VOLUMES, type TypoVolumePreset } from './chora/typo/typoVolumes';
import { TypoAudioAnalyzer } from './chora/typo/typoAudio';
import { AdaptiveScale } from './plajahPixels/engine/core/adaptiveScale';

export type { TypoVolumePreset };

interface Props {
  preset?: TypoVolumePreset;
  /** Shared analyser from the FX Stage; falls back to the player's own. */
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
  fpsCap?: number;
  renderScale?: number;
  className?: string;
}

type Line = { time: number; text: string };

function linesFor(track: any, album: any, duration: number): { lines: Line[]; loop: number | null } {
  const tc = track?.timeCodedLyrics as Line[] | undefined;
  if (tc?.length) return { lines: [...tc].filter(l => l.text?.trim()).sort((a, b) => a.time - b.time), loop: null };
  const raw = typeof track?.lyrics === 'string' ? track.lyrics.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !/^\[.*\]$/.test(l)) : [];
  if (raw.length) { const step = (duration || 180) / raw.length; return { lines: raw.map((text: string, i: number) => ({ time: i * step, text })), loop: null }; }
  const meta = [track?.title, track?.artist || album?.artist, album?.title].filter(Boolean) as string[];
  const fallback = meta.length ? meta : ['CHORA'];
  return { lines: fallback.map((text, i) => ({ time: i * 4, text })), loop: fallback.length * 4 };
}

export const ChoraTypoVisualizer: React.FC<Props> = ({
  preset = 'SPHERE', analyser, isPlaying, fpsCap = 0, renderScale = 1, className = 'w-full h-full relative',
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const player = useGlobalPlayerState();
  const { currentTime, duration } = useGlobalPlayerProgress();

  const live = useRef({ preset, analyser: analyser ?? player.analyser, playing: isPlaying ?? player.isPlaying, fpsCap, renderScale });
  live.current = { preset, analyser: analyser ?? player.analyser, playing: isPlaying ?? player.isPlaying, fpsCap, renderScale };

  const clock = useRef({ time: 0, at: 0 });
  useEffect(() => { clock.current = { time: currentTime || 0, at: performance.now() }; }, [currentTime]);

  const lyricsRef = useRef<{ lines: Line[]; loop: number | null; key: string }>({ lines: [], loop: null, key: '' });
  useEffect(() => {
    const t = player.currentTrack as any;
    lyricsRef.current = { ...linesFor(t, player.currentAlbum, duration), key: `${t?.id || ''}:${(t?.timeCodedLyrics?.length || 0)}:${duration | 0}` };
  }, [player.currentTrack, player.currentAlbum, duration]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let disposed = false, raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let atlas: THREE.CanvasTexture | null = null;
    const vols = new Map<string, Vol>();
    const audio = new TypoAudioAnalyzer();
    const director = new TypoDirector();
    const adapt = new AdaptiveScale(0.5, 1, 1);   // dynamic resolution toward a 60fps lock
    const ly: LyricState = { idx: -1, word: -1, words: [] };
    let lyricKey = '', activeKey = '', lastT = performance.now(), T = 0, lastDraw = 0, lastResume = 0;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const resize = () => {
      if (!renderer) return;
      const r = host.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * clamp(live.current.renderScale, 0.25, 1) * adapt.scale);
      renderer.setSize(Math.max(2, r.width), Math.max(2, r.height), false);
    };
    const ro = new ResizeObserver(resize);

    const volFor = (key: string) => {
      let v = vols.get(key);
      if (!v) {
        const def = TYPO_VOLUMES.find(d => d.key === key) || TYPO_VOLUMES[0];
        v = makeVol(def, atlas!); vols.set(key, v);
        if (ly.words.length) def.text(v, lineStreams(ly.words.join(' ')), true);
      }
      return v;
    };

    const nowSeconds = () => {
      const c = clock.current;
      return c.time + (live.current.playing ? (performance.now() - c.at) / 1000 : 0);
    };

    const updateLyrics = (v: Vol, t: number) => {
      const L = lyricsRef.current;
      if (!L.lines.length) return;
      if (L.key !== lyricKey) { lyricKey = L.key; ly.idx = -1; }
      const tt = L.loop ? ((t % L.loop) + L.loop) % L.loop : t;
      let i = 0; for (let k = 0; k < L.lines.length; k++) if (tt >= L.lines[k].time) i = k;
      if (i !== ly.idx) {
        const first = ly.idx === -1; ly.idx = i; ly.word = -1;
        const st = lineStreams(L.lines[i].text); ly.words = st.words;
        vols.forEach(vol => vol.def.text(vol, st, first && vol === v));
      }
      const s = L.lines[i].time, e = L.lines[i + 1]?.time ?? (L.loop ?? s + 5), p = (tt - s) / Math.max(0.1, (e - s) * 0.85);
      const wts = ly.words.map(w => w.length + 1), tot = wts.reduce((a, b) => a + b, 0);
      let acc = 0, w = ly.words.length - 1; for (let k = 0; k < wts.length; k++) { acc += wts[k] / tot; if (p < acc) { w = k; break; } }
      ly.word = p < 0 ? -1 : w;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!renderer || !atlas) return;
      const cap = live.current.fpsCap;
      if (cap > 0 && now - lastDraw < 1000 / cap - 1) return;
      lastDraw = now;
      adapt.target = cap > 0 ? 1000 / cap : 16.7;
      if (adapt.frame(now)) resize();
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; T += dt;

      const an = live.current.analyser;
      if (an && now - lastResume > 5000) { lastResume = now; const ctx = an.context as AudioContext; if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); }

      if (live.current.preset !== activeKey) { activeKey = live.current.preset; }
      const v = volFor(activeKey);
      const t = nowSeconds();
      updateLyrics(v, t);
      const A = audio.sample(an, live.current.playing, T, dt);

      v.layers.forEach(L => L.tick(dt, ly.word));
      v.def.update(v, T, dt, A, ly);
      director.apply(v, A, dt, T);
      v.layers.forEach(L => L.commit());

      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, aspect = w / h;
      v.cam.aspect = aspect; v.cam.fov = director.fov * Math.pow(clamp(1.33 / aspect, 1, 1.8), 0.75); v.cam.updateProjectionMatrix();
      renderer.setClearColor(v.bg, 1);
      renderer.render(v.scene, v.cam);
    };

    (async () => {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      } catch (e) {
        console.warn('[TYPO] WebGL unavailable', e); return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      resize(); ro.observe(host);
      atlas = await loadAtlas();
      if (disposed) return;
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf); ro.disconnect();
      vols.forEach(v => disposeVol(v, atlas));
      vols.clear();
      renderer?.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} style={{ overflow: 'hidden' }} />;
};

export default ChoraTypoVisualizer;
