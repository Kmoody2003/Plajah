/**
 * TelaLivePage: ONE page of a Tela document, live.
 *
 * Rendering: each vector object becomes its own <g data-obj-id data-label> whose content is the exact SVG the Tela serializer
 * (services/tela/telaSvg.ts) emits, so gradients, filters, blend modes, text layout and path origin boxes are identical to the
 * flat export. We use the serializer (a string per object, set once) instead of TelaVector's React renderer because that one
 * is wired for editing (pointer handlers, move cursors, selection) and LOTTIE/MOTION foreignObjects that a reader page must
 * not run. The wrapper <g> is what animates, so object internals are never touched by the animation engine.
 *
 * The behaviour runtime lives in services/living/runtime (LivingEngine). This component adds: the accessible layer (a focusable
 * control per interactive behaviour, named by its `hint`), a live region, the particle canvas, visibility/idle management and
 * audio unlock + page music ownership.
 */
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TelaVectorObject } from '../../types';
import type { BookAudioApi, LivingPage, Scalar, Score } from '../../services/living/contracts';
import { objectToSvg } from '../../services/tela/telaSvg';
import { LivingEngine, type InteractiveItem } from '../../services/living/runtime/engine';
import { narrationObjects, objectInfos } from '../../services/living/runtime/objects';
import LiveHints from './LiveHints';

export interface TelaLivePageHandle {
  replay(): void;
  pause(): void;
  resume(): void;
  setReducedMotion(reduced: boolean | null): void;
  getVars(): Record<string, Scalar>;
  narrate(): void;
  stopNarration(): void;
  emit(name: string, payload?: unknown): void;
  /** Escape hatch for the lab and tests. */
  engine(): LivingEngine | null;
}

export interface TelaLivePageProps {
  objects: TelaVectorObject[];
  width: number;
  height: number;
  living: LivingPage;
  audio: BookAudioApi | null;
  reducedMotion: boolean;
  soundEnabled: boolean;
  onGoto?: (page: number | 'next' | 'prev') => void;
  onGoal?: (pageNumber: number, goalId: string) => void;
  /** Only the current page is active. Inactive pages render at rest (page-turn neighbours, thumbnails). Default true. */
  active?: boolean;
  /** Page background colour behind the objects. */
  background?: string;
  /** Start the page's music cue / ambience bed when it becomes active (and sound is on). Default true. */
  pageAudio?: boolean;
  /** Scores the book registered, for validation-free playback; unused by the runtime itself. */
  scores?: Record<string, Score>;
  /** Read the page aloud as soon as it opens (reader's "Auto" mode). */
  autoNarrate?: boolean;
  writerTexts?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
  onNarrationWord?: (i: number) => void;
  /** Draw the visual "you can touch this" cues (components/living/LiveHints.tsx). Default true. */
  hints?: boolean;
  /** Asked at the moment it matters (never captured): is this page the one the reader is on? A page-turn keeps a stale copy of the page being left (still
   *  `active` as it was when captured) alongside the incoming one; only the current page may own the music, ambience and narration. Default: yes. */
  isCurrent?: () => boolean;
}

// ── audio ownership: the page that is active owns the music. A page that is left does not stop music a newer page already took over.
const audioOwner = new WeakMap<object, { owner: symbol | null; cue: string | null; bed: string | null }>();
const ownerState = (a: object) => { let s = audioOwner.get(a); if (!s) { s = { owner: null, cue: null, bed: null }; audioOwner.set(a, s); } return s; };

const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

const ObjectG = memo(function ObjectG({ o, html }: { o: TelaVectorObject; html: string }) {
  return <g data-obj-id={o.id} data-label={o.objectLabel || undefined} data-role={o.templateRole || undefined} dangerouslySetInnerHTML={{ __html: html }} />;
});

let instanceCounter = 0;

const TelaLivePage = forwardRef<TelaLivePageHandle, TelaLivePageProps>(function TelaLivePage(props, ref) {
  const { objects, width, height, living, audio, soundEnabled, onGoto, onGoal, active = true, background, pageAudio = true, autoNarrate, writerTexts, className, style, label, onNarrationWord, hints = true, isCurrent } = props;
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? props.reducedMotion;
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pageGRef = useRef<SVGGElement>(null);
  const tintRef = useRef<SVGRectElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LivingEngine | null>(null);
  const [items, setItems] = useState<InteractiveItem[]>([]);
  const [discovered, setDiscovered] = useState<ReadonlySet<string>>(() => new Set());
  const [busyTick, setBusyTick] = useState(0);
  const [said, setSaid] = useState('');
  const [inView, setInView] = useState(true);
  const prefix = useMemo(() => `lv${++instanceCounter}_`, []);
  const token = useMemo(() => Symbol('live-page'), []);

  // Stable callbacks so the engine is not rebuilt when the host re-renders.
  const cb = useRef({ onGoto, onGoal, onNarrationWord });
  cb.current = { onGoto, onGoal, onNarrationWord };

  const visible = useMemo(() => objects.filter(o => !o.hidden), [objects]);
  const htmls = useMemo(() => visible.map(o => objectToSvg(o, writerTexts).replace(/(id="|url\(#)(g_|f_)/g, `$1${prefix}$2`)), [visible, writerTexts, prefix]);
  const infos = useMemo(() => objectInfos(visible), [visible]);
  const narr = useMemo(() => narrationObjects(visible), [visible]);

  // ── engine lifetime: rebuilt when the objects or the behaviour data change
  useLayoutEffect(() => {
    if (!svgRef.current || !pageGRef.current || !rootRef.current) return;
    const texts: Record<string, string> = {};
    for (const o of narr) texts[o.id] = (o.text ?? '').replace(/\s+/g, ' ').trim();
    const eng = new LivingEngine({
      root: rootRef.current, svg: svgRef.current, pageG: pageGRef.current, canvas: canvasRef.current, tint: tintRef.current,
      objects: infos, texts, narrationIds: narr.map(o => o.id), width, height, living, audio,
      reducedMotion: reduced, soundEnabled,
      onGoto: p => cb.current.onGoto?.(p), onGoal: (pg, id) => cb.current.onGoal?.(pg, id),
      announce: t => setSaid(prev => (prev === t ? t + '​' : t)),
      onWord: i => cb.current.onNarrationWord?.(i),
    });
    engineRef.current = eng;
    setItems(eng.interactiveItems()); setDiscovered(new Set());
    return () => { eng.stop(); eng.destroy(); if (engineRef.current === eng) engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infos, living, width, height, narr]);

  // ── follow props
  useEffect(() => { engineRef.current?.setReduced(reduced); }, [reduced]);
  useEffect(() => { engineRef.current?.setSound(soundEnabled); }, [soundEnabled]);
  useEffect(() => { engineRef.current?.setAudio(audio); }, [audio]);

  // ── activation (layout effect: entrance art is hidden before the first paint, no flash)
  useLayoutEffect(() => {
    const eng = engineRef.current; if (!eng) return;
    if (active) { if (!eng.isActive) eng.start(); } else if (eng.isActive) eng.stop();
    return () => { if (eng.isActive) eng.stop(); };
  }, [active, infos, living, width, height, narr]);

  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') { io = new IntersectionObserver(es => { for (const e of es) setInView(e.isIntersecting); }, { threshold: 0.01 }); io.observe(el); }
    const vis = () => engineRef.current?.setVisible(!document.hidden && inViewRef.current);
    document.addEventListener('visibilitychange', vis);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const inViewRef = useRef(true); inViewRef.current = inView;
  useEffect(() => { engineRef.current?.setVisible(inView && !document.hidden); }, [inView, infos, living]);

  const isCurrentRef = useRef(isCurrent); isCurrentRef.current = isCurrent;
  const stillCurrent = () => (isCurrentRef.current ? isCurrentRef.current() : true);

  // ── page music / ambience (owner-aware, only with sound on)
  useEffect(() => {
    if (!audio || !pageAudio || !active || !soundEnabled || !stillCurrent()) return;
    const st = ownerState(audio); st.owner = token;
    const m = living.music, a = living.ambience;
    try {
      if (m) { if (st.cue !== m.cue) { audio.playCue(m.cue, { fadeMs: m.fadeMs ?? 800 }); st.cue = m.cue; } }
      else if (st.cue) { audio.stopMusic({ fadeMs: 600 }); st.cue = null; }
      if (a) { if (st.bed !== a.bed) { audio.setAmbience(a.bed, { gain: a.gain, fadeMs: 800 }); st.bed = a.bed; } }
      else if (st.bed) { audio.setAmbience(null, { fadeMs: 600 }); st.bed = null; }
    } catch (e) { console.warn('[living] page audio failed', e); }
    return () => {
      if (st.owner !== token) return;      // a newer page already took over: leave its music alone
      try { audio.stopMusic({ fadeMs: 500 }); audio.setAmbience(null, { fadeMs: 500 }); } catch { /* */ }
      st.cue = null; st.bed = null; st.owner = null;
    };
  }, [audio, pageAudio, active, soundEnabled, living.music?.cue, living.ambience?.bed, token]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto read-aloud
  useEffect(() => {
    if (!autoNarrate || !active || !soundEnabled || !audio || !stillCurrent()) return;
    const t = window.setTimeout(() => { if (stillCurrent()) engineRef.current?.narrate(); }, 700);
    return () => { clearTimeout(t); engineRef.current?.cancelSpeech(); };
  }, [autoNarrate, active, soundEnabled, audio, infos, living]);

  useImperativeHandle(ref, () => ({
    replay: () => engineRef.current?.replay(),
    pause: () => engineRef.current?.pause(),
    resume: () => engineRef.current?.resume(),
    setReducedMotion: r => setReducedOverride(r),
    getVars: () => engineRef.current?.vars.snapshot() ?? {},
    narrate: () => engineRef.current?.narrate(),
    stopNarration: () => engineRef.current?.cancelSpeech(),
    emit: (n, p) => engineRef.current?.emit(n, p),
    engine: () => engineRef.current,
  }), []);

  const unlock = useCallback(() => {
    if (soundEnabled && audio) { try { void audio.unlock(); } catch { /* */ } }
    void engineRef.current?.requestTilt();
  }, [soundEnabled, audio]);

  const onItemKey = (item: InteractiveItem) => (e: React.KeyboardEvent) => {
    const eng = engineRef.current; if (!eng) return;
    const bs = living.behaviors.filter(b => item.behaviorIds.includes(b.id));
    if (item.family === 'drag' && e.key.startsWith('Arrow')) { e.preventDefault(); unlock(); eng.keyboardDrag(item, bs, e.key); }
    else if (item.family === 'press' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!e.repeat) { unlock(); eng.activateItem(item, 'down'); } }
  };
  const onItemKeyUp = (item: InteractiveItem) => (e: React.KeyboardEvent) => {
    if (item.family === 'press' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); engineRef.current?.activateItem(item, 'up'); }
  };
  // Enter/Space on tap/proximity/drag controls arrive as `click` with detail 0 (also what screen readers send).
  const onItemClick = (item: InteractiveItem) => (e: React.MouseEvent) => {
    if (e.detail !== 0) return; unlock(); markTried(item.key); engineRef.current?.activateItem(item, 'tap');
  };
  const markTried = (key: string) => { setBusyTick(t => t + 1); setDiscovered(prev => (prev.has(key) ? prev : new Set(prev).add(key))); };
  /** A touch on a spot counts as trying it: that spot stops hinting. Any touch also quiets the hints for a moment. */
  const noteTouch = (e: React.PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect(); setBusyTick(t => t + 1); if (!r || !r.width) return;
    const x = (e.clientX - r.left) / r.width * width, y = (e.clientY - r.top) / r.height * height, pad = width * 0.05;
    for (const it of items) if (x >= it.box.x - pad && x <= it.box.x + it.box.w + pad && y >= it.box.y - pad && y <= it.box.y + it.box.h + pad) markTried(it.key);
  };

  const cls = `pj-live-page ${className ?? ''}`;
  const summary = living.a11y?.summary; const instr = living.a11y?.instructions;
  const descId = `${prefix}desc`;
  return (
    <div ref={rootRef} className={cls} data-live-page={living.page} data-reduced={reduced ? '1' : '0'} data-active={active ? '1' : '0'} role="group" aria-label={label || summary || `Page ${living.page}, interactive`} aria-describedby={instr ? descId : undefined}
      onPointerDownCapture={e => { unlock(); noteTouch(e); }}
      style={{ position: 'relative', width: '100%', aspectRatio: `${width} / ${height}`, touchAction: living.behaviors.some(b => b.on.type === 'drag' || b.on.type === 'press') ? 'none' : 'pan-y pinch-zoom',   // a drag that starts on a full-page texture would otherwise be claimed by the browser's pan
      userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', overflow: 'hidden', ...style } as React.CSSProperties}>
      <style>{`.pj-live-page .pj-live-hit:focus-visible{outline:3px solid #ff8c00;outline-offset:2px;background:rgba(255,140,0,.14)!important}`}</style>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet" focusable="false">
        {background ? <rect width={width} height={height} fill={background} /> : null}
        <g ref={pageGRef} data-page-root="1">
          {visible.map((o, i) => <ObjectG key={o.id} o={o} html={htmls[i]} />)}
        </g>
        <rect ref={tintRef} width={width} height={height} fill="#000" style={{ opacity: 0, pointerEvents: 'none' }} data-tint="1" />
      </svg>
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      {active ? <LiveHints items={items} width={width} height={height} reduced={reduced} enabled={hints} discovered={discovered} busyTick={busyTick} /> : null}
      {active && items.map(it => {
        const cx = (it.box.x + it.box.w / 2) / width * 100, cy = (it.box.y + it.box.h / 2) / height * 100;
        return (
          <button key={it.key} type="button" className="pj-live-hit" data-family={it.family} data-behaviors={it.behaviorIds.join(',')} aria-label={it.hint}
            onKeyDown={onItemKey(it)} onKeyUp={onItemKeyUp(it)} onClick={onItemClick(it)}
            style={{ position: 'absolute', left: `${cx}%`, top: `${cy}%`, width: `max(44px, ${it.box.w / width * 100}%)`, height: `max(44px, ${it.box.h / height * 100}%)`, transform: 'translate(-50%, -50%)', background: 'transparent', border: 0, padding: 0, borderRadius: 14, pointerEvents: 'none' }} />
        );
      })}
      {instr ? <p id={descId} style={SR_ONLY}>{instr}</p> : null}
      <div role="status" aria-live="polite" aria-atomic="true" data-live-region="1" style={SR_ONLY}>{said}</div>
    </div>
  );
});

export default TelaLivePage;
