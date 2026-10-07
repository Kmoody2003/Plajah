import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Subtitles, Maximize2, ListVideo, RotateCcw } from 'lucide-react';
import type { FilmSpec } from '../../services/dossier/film/filmTypes';
import { FilmRenderer, FONT_CSS, type Chapter } from '../../services/dossier/film/filmRenderer';

interface Props {
  /** Builds the spec (fetches narration timings, basemaps). */
  load: (w: number, h: number) => Promise<FilmSpec>;
  onClose?: () => void;
  /** Render size; the renderer is resolution-independent (all sizes scale with height). */
  width?: number;
  height?: number;
  /**
   * Inline mode: the player sits inside a page (a node card) instead of covering the screen. Keys and mouse movement are
   * handled on the player itself (so Space and the arrows keep scrolling the page), it pauses itself when scrolled out of
   * view, and it has no close button. Everything else (scrub bar, pause, captions, chapters, fullscreen) is the same player.
   */
  embedded?: boolean;
  /** Always-visible label in a corner (for example "ANIMATED PAINTING"). */
  badge?: string;
  /** Start playing as soon as the film is ready. Defaults to true for the full-screen player and false when embedded. */
  autoPlay?: boolean;
  /** Embedded and not auto-playing: the time of the frame to show as the still behind the play button (default 0). */
  poster?: (r: FilmRenderer) => number;
  /** Called with the message when the film cannot be loaded (the host can swap in a fallback). */
  onFail?: (message: string) => void;
}

function ensureFonts() {
  if (document.querySelector('link[data-dossier-film-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = FONT_CSS; l.dataset.dossierFilmFonts = '1';
  document.head.appendChild(l);
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const CSS = `
.dfp{position:fixed;inset:0;z-index:80;background:#000;display:flex;align-items:center;justify-content:center;color:#f3ead8;font-family:'Inter',system-ui,sans-serif}
.dfp canvas{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.dfp-ui{position:absolute;left:0;right:0;bottom:0;padding:18px 24px 20px;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0));transition:opacity .35s}
.dfp[data-idle=true] .dfp-ui,.dfp[data-idle=true] .dfp-top{opacity:0}
.dfp-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,0));transition:opacity .35s}
.dfp-top h2{margin:0;font:600 13px/1 'Inter';letter-spacing:.2em;text-transform:uppercase;color:var(--dfp-a,#d4a24c)}
.dfp button{background:none;border:0;color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px;border-radius:8px}
.dfp button:hover{background:rgba(255,255,255,.08)}
.dfp button[aria-pressed=true]{color:var(--dfp-a,#d4a24c)}
.dfp-bar{position:relative;height:18px;cursor:pointer;margin-bottom:8px}
.dfp-track{position:absolute;left:0;right:0;top:8px;height:3px;background:rgba(255,255,255,.18);border-radius:2px}
.dfp-fill{position:absolute;left:0;top:8px;height:3px;background:var(--dfp-a,#d4a24c);border-radius:2px}
.dfp-tick{position:absolute;top:5px;width:2px;height:9px;background:rgba(243,234,216,.55)}
.dfp-row{display:flex;align-items:center;gap:10px}
.dfp-time{font-variant-numeric:tabular-nums;font-size:12px;color:rgba(243,234,216,.7);margin-left:4px}
.dfp-chap{font-size:12px;color:rgba(243,234,216,.8);margin-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dfp-menu{position:absolute;right:24px;bottom:78px;background:rgba(14,11,10,.94);border:1px solid rgba(212,162,76,.35);border-radius:12px;padding:8px;min-width:260px;backdrop-filter:blur(10px)}
.dfp-menu button{display:flex;justify-content:space-between;width:100%;text-align:left;padding:9px 10px}
.dfp-menu small{color:rgba(243,234,216,.5)}
.dfp-load{position:absolute;inset:0;display:grid;place-items:center;font:500 13px 'Inter';letter-spacing:.2em;text-transform:uppercase;color:var(--dfp-a,#d4a24c)}
.dfp-load i{display:block;width:220px;height:2px;background:rgba(212,162,76,.2);margin-top:14px}
.dfp-load i b{display:block;height:100%;background:var(--dfp-a,#d4a24c);transition:width .2s}
.dfp-skip{position:absolute;right:24px;bottom:96px;background:rgba(0,0,0,.72);border:1px solid var(--dfp-a,#d4a24c)!important;padding:8px 14px!important;font-size:14px!important}
.dfp-big{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.dfp-big span{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.45);border:1px solid rgba(212,162,76,.6);color:var(--dfp-a,#d4a24c)}
.dfp.emb{position:relative;inset:auto;z-index:auto;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden}
.dfp.emb:fullscreen{aspect-ratio:auto;border-radius:0}
.dfp.emb:focus-visible{outline:2px solid var(--dfp-a,#d4a24c);outline-offset:2px}
.dfp.emb .dfp-top h2{display:none}
.dfp.emb .dfp-ui{padding:12px 14px}
.dfp.emb .dfp-menu{right:14px;bottom:62px}
.dfp.emb .dfp-skip{right:14px;bottom:72px}
.dfp.emb .dfp-big{pointer-events:none}
.dfp-badge{position:absolute;top:12px;left:14px;z-index:2;font:700 11px/1 'Inter',system-ui,sans-serif;letter-spacing:.22em;padding:6px 9px;border-radius:6px;background:rgba(0,0,0,.66);border:1px solid var(--dfp-a,#d4a24c);color:var(--dfp-a,#d4a24c);pointer-events:none}
`;

export default function DossierFilmPlayer({ load, onClose, width = 1280, height = 720, embedded = false, badge, autoPlay = !embedded, poster, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRef<FilmRenderer | null>(null);
  const clock = useRef({ playing: false, base: 0, at: 0 });
  const audio = useRef<{ score?: HTMLAudioElement; voices: Map<string, HTMLAudioElement> }>({ voices: new Map() });
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cc, setCc] = useState(true);
  const [menu, setMenu] = useState(false);
  const [idle, setIdle] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState('');
  const [accent, setAccent] = useState('');
  const [skip, setSkip] = useState<{ from: number; to: number; label: string } | null>(null);
  // Embedded and not yet played: the still frame is on screen behind the big play button.
  const [atPoster, setAtPoster] = useState(false);
  const atPosterRef = useRef(false);

  const now = () => {
    const c = clock.current;
    return c.playing ? c.at + (performance.now() - c.base) / 1000 : c.at;
  };

  // Audio follows the film clock: score loops underneath; each narration line plays in its window.
  const syncAudio = useCallback((time: number, isPlaying: boolean) => {
    const rr = r.current; if (!rr) return;
    const a = audio.current;
    let speaking = false;
    for (const cue of rr.voiceCues) {
      let el = a.voices.get(cue.src);
      const inside = time >= cue.at && time < cue.at + cue.duration;
      if (inside) speaking = true;
      if (inside && isPlaying) {
        if (!el) { el = new Audio(cue.src); el.preload = 'auto'; a.voices.set(cue.src, el); }
        const want = time - cue.at;
        if (el.paused) { el.currentTime = want; void el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - want) > .3) el.currentTime = want;
      } else if (el && !el.paused) el.pause();
    }
    const score = a.score, spec = rr.spec.score;
    if (score && spec) {
      // Council films: the score is out through every Silence Hold (the render ramps over a second; so does this).
      const out = rr.silences.some(w => time >= w.from && time < w.to);
      const target = out ? 0 : (speaking ? spec.duckTo : spec.volume) * Math.min(1, time / 2, (rr.duration - time) / 4);
      score.volume = Math.max(0, Math.min(1, score.volume + (target - score.volume) * .08));
      if (isPlaying && score.paused) { score.currentTime = time % (score.duration || 1e9); void score.play().catch(() => {}); }
      if (!isPlaying && !score.paused) score.pause();
    }
  }, []);

  useEffect(() => {
    ensureFonts();
    let dead = false;
    (async () => {
      try {
        const spec = await load(width, height);
        if (dead || !canvas.current) return;
        const rr = new FilmRenderer(canvas.current, spec);
        await rr.load((d, n) => !dead && setProgress(d / n));
        if (dead) return;
        rr.captions = cc;
        // Council films: reduced motion is an authored cut list (holds and 150 ms fades), not a disabled animation.
        rr.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        r.current = rr;
        if (rr.council) setAccent(rr.council.tl.film.theme.accent);
        if (spec.score) { const s = new Audio(spec.score.src); s.loop = true; s.volume = 0; audio.current.score = s; }
        setChapters(rr.chapters);
        const start = rr.council && autoPlay;
        // Not auto-playing inline: show the authored still (poster frame) and wait for the viewer to press play.
        const stillAt = !start && embedded && poster ? Math.max(0, Math.min(rr.duration - .05, poster(rr))) : 0;
        if (stillAt > 0) { clock.current = { playing: false, base: 0, at: stillAt }; atPosterRef.current = true; setAtPoster(true); setT(stillAt); }
        rr.draw(stillAt);
        setReady(true);
        // The council style plays live from frame one (the viewer already pressed Watch the film).
        if (start) { clock.current = { playing: true, base: performance.now(), at: 0 }; setPlaying(true); }
      } catch (e) { const m = (e as Error).message || 'The film could not be loaded.'; setError(m); onFail?.(m); }
    })();
    return () => {
      dead = true;
      audio.current.score?.pause();
      audio.current.voices.forEach(v => v.pause());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (r.current) { r.current.captions = cc; r.current.draw(now()); } }, [cc]);

  // Render loop.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const loop = () => {
      const rr = r.current!;
      let time = now();
      if (time >= rr.duration) { time = rr.duration; clock.current = { playing: false, base: 0, at: rr.duration - .01 }; setPlaying(false); }
      rr.draw(time);
      syncAudio(time, clock.current.playing);
      setT(time);
      const w = rr.skips.find(k => time >= k.from && time < k.to) ?? null;
      setSkip(prev => (prev?.from === w?.from && prev?.to === w?.to ? prev : w));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, syncAudio]);

  const play = useCallback(() => {
    const rr = r.current; if (!rr) return;
    // From the still, play from the very start (the content note comes first).
    const at = atPosterRef.current || now() >= rr.duration - .05 ? 0 : now();
    atPosterRef.current = false; setAtPoster(false);
    clock.current = { playing: true, base: performance.now(), at };
    setPlaying(true);
  }, []);
  const pause = useCallback(() => { clock.current = { playing: false, base: 0, at: now() }; setPlaying(false); syncAudio(now(), false); }, [syncAudio]);
  const seek = useCallback((to: number) => {
    const rr = r.current; if (!rr) return;
    to = Math.max(0, Math.min(rr.duration - .01, to));
    atPosterRef.current = false; setAtPoster(false);
    audio.current.voices.forEach(v => v.pause());
    if (audio.current.score) audio.current.score.currentTime = to % (audio.current.score.duration || 1e9);
    clock.current = { ...clock.current, base: performance.now(), at: to };
    rr.draw(to); setT(to);
  }, []);

  // Keyboard + idle UI.
  useEffect(() => {
    let timer = 0;
    const poke = () => { setIdle(false); clearTimeout(timer); timer = window.setTimeout(() => setIdle(true), 2600); };
    const key = (e: KeyboardEvent) => {
      // Embedded: a focused button handles its own Enter/Space; the player only reacts to keys while it has focus.
      if (embedded && (e.target as HTMLElement | null)?.closest?.('button')) return;
      // Any key, tap or remote button skips the title sequence or a content-noted section (Escape still closes).
      const rr = r.current, here = rr?.skips.find(k => now() >= k.from && now() < k.to);
      if (rr && here && e.key !== 'Escape' && e.key !== 'c' && !e.metaKey && !e.ctrlKey && clock.current.playing) { e.preventDefault(); seek(here.to); poke(); return; }
      // Embedded in the hall: the arrows seek here and must not also turn the page to the next room (Escape still reaches the hall).
      if (embedded && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ' || e.key === 'k' || e.key === 'c')) e.stopPropagation();
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); clock.current.playing ? pause() : play(); }
      else if (e.key === 'ArrowRight') seek(now() + 5);
      else if (e.key === 'ArrowLeft') seek(now() - 5);
      else if (e.key === 'c') setCc(v => !v);
      else if (e.key === 'Escape') onClose?.();
      poke();
    };
    // Full-screen: the whole window. Embedded: only the player itself, so the page keeps its own keys.
    const target: HTMLElement | Window = embedded && wrap.current ? wrap.current : window;
    target.addEventListener('keydown', key as EventListener); target.addEventListener('mousemove', poke);
    poke();
    return () => { target.removeEventListener('keydown', key as EventListener); target.removeEventListener('mousemove', poke); clearTimeout(timer); };
  }, [play, pause, seek, onClose, embedded]);

  // Embedded: pause when the player is scrolled out of view.
  useEffect(() => {
    const el = wrap.current;
    if (!embedded || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => { if (es[0] && !es[0].isIntersecting && clock.current.playing) pause(); }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [embedded, pause]);

  const duration = r.current?.duration ?? 1;
  const current = [...chapters].reverse().find(c => t >= c.start);

  return (
    <div className={embedded ? 'dfp emb' : 'dfp'} ref={wrap} data-idle={idle && playing} role={embedded ? 'region' : 'dialog'} aria-label={embedded ? (badge || 'Dossier film') : 'Dossier film'}
      tabIndex={embedded ? 0 : undefined} style={accent ? ({ '--dfp-a': accent } as React.CSSProperties) : undefined}>
      <style>{CSS}</style>
      {badge && <span className="dfp-badge">{badge}</span>}
      <canvas ref={canvas} onClick={() => { if (skip && playing) seek(skip.to); else playing ? pause() : play(); }} aria-label="Film frame" />
      {!ready && !error && <div className="dfp-load"><div>Preparing the film<i><b style={{ width: `${Math.round(progress * 100)}%` }} /></i></div></div>}
      {error && <div className="dfp-load">{error}</div>}
      {ready && skip && playing && <button className="dfp-skip" onClick={() => seek(skip.to)}>{skip.label} (any key)</button>}
      {ready && !playing && (t < .05 || atPoster) && <div className="dfp-big"><span><Play size={34} /></span></div>}
      <div className="dfp-top">
        <h2>A Plajah Dossier · Film</h2>
        {onClose && <button onClick={onClose} aria-label="Close film"><X size={20} /></button>}
      </div>
      {ready && (
        <div className="dfp-ui">
          <div className="dfp-bar" onClick={e => { const b = e.currentTarget.getBoundingClientRect(); seek((e.clientX - b.left) / b.width * duration); }}
            role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(t)}>
            <div className="dfp-track" />
            <div className="dfp-fill" style={{ width: `${(t / duration) * 100}%` }} />
            {chapters.map(c => <span key={c.label} className="dfp-tick" style={{ left: `${(c.start / duration) * 100}%` }} title={c.label} />)}
          </div>
          <div className="dfp-row">
            <button onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
            <button onClick={() => seek(0)} aria-label="Restart"><RotateCcw size={16} /></button>
            <span className="dfp-time">{fmt(t)} / {fmt(duration)}</span>
            {current && <span className="dfp-chap">{current.label}</span>}
            <span style={{ flex: 1 }} />
            <button aria-pressed={cc} onClick={() => setCc(v => !v)} aria-label="Captions"><Subtitles size={18} /></button>
            <button aria-pressed={menu} onClick={() => setMenu(v => !v)} aria-label="Chapters"><ListVideo size={18} /></button>
            <button onClick={() => { const el = wrap.current; if (!el) return; document.fullscreenElement ? void document.exitFullscreen() : void el.requestFullscreen?.(); }} aria-label="Fullscreen"><Maximize2 size={17} /></button>
          </div>
          {menu && (
            <div className="dfp-menu">
              {chapters.map(c => <button key={c.label} onClick={() => { seek(c.start); setMenu(false); }}><span>{c.label}</span><small>{fmt(c.start)}</small></button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
