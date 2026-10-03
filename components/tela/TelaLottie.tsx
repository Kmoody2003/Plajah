/**
 * TelaLottie — React surfaces for native Lottie objects (vector kind 'LOTTIE').
 *
 *   <TelaLottieCanvas>     live playback inside an artboard (TelaVector renders it in a
 *                          <foreignObject>). Pauses off-screen / when the tab is hidden,
 *                          honours prefers-reduced-motion (holds the poster frame).
 *   <TelaLottieInspector>  playback props: play/pause + scrub, autoplay, loop, speed,
 *                          direction, segment, marker, start offset, poster frame, fit,
 *                          dotLottie theme + slot overrides (editable titles / colours).
 *   <TelaLottieImportRow>  file picker + "insert from URL" for a vector artboard.
 *   scrubLottieObject()    tiny bus the inspector uses to drive the on-canvas instance.
 *
 * Runtime + deterministic seek: services/tela/telaLottie.ts.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Link as LinkIcon, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import type { TelaLottieSpec, TelaVectorObject } from '../../types';
import {
  createLottiePlayer, lottieFrameAtTime, playOptionsFromSpec, prefersReducedMotion, renderLottiePoster,
  type TelaLottiePlayer,
} from '../../services/tela/telaLottie';
import { importLottieFile, importLottieUrl } from '../../services/tela/telaLottieImport';

// ── Inspector → canvas bus ──────────────────────────────────────────────────

export type LottieBusCommand = { type: 'seek'; frame: number } | { type: 'release' } | { type: 'play' } | { type: 'pause' };
const bus = new Map<string, Set<(c: LottieBusCommand) => void>>();
export function scrubLottieObject(objectId: string, command: LottieBusCommand) { bus.get(objectId)?.forEach(fn => fn(command)); }
function subscribe(objectId: string, fn: (c: LottieBusCommand) => void) {
  const set = bus.get(objectId) || new Set(); set.add(fn); bus.set(objectId, set);
  return () => { set.delete(fn); if (!set.size) bus.delete(objectId); };
}

export const lottieSourceKey = (s: TelaLottieSpec['source']) => `${s.format}|${s.assetId || ''}|${s.url || ''}|${s.inlineJson ? s.inlineJson.length : 0}`;

// ── Live canvas ─────────────────────────────────────────────────────────────

export const TelaLottieCanvas: React.FC<{ spec: TelaLottieSpec; objectId?: string; label?: string; style?: React.CSSProperties }> = ({ spec, objectId, label, style }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<TelaLottiePlayer | null>(null);
  const specRef = useRef(spec); specRef.current = spec;
  const visibleRef = useRef(true);
  const scrubRef = useRef(false);
  const forcePlayRef = useRef(false);
  const manualPauseRef = useRef(false);
  const startedRef = useRef(false);
  const offsetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const sourceKey = lottieSourceKey(spec.source);

  const evaluate = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    const s = specRef.current;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const should = forcePlayRef.current
      ? visibleRef.current && !hidden && !scrubRef.current
      : s.autoplay && !manualPauseRef.current && visibleRef.current && !hidden && !prefersReducedMotion() && !scrubRef.current;
    if (should) {
      if (p.isPlaying || offsetTimer.current) return;
      const offset = !startedRef.current && !forcePlayRef.current ? Math.max(0, s.startOffset || 0) : 0;
      if (offset > 0) {
        p.setFrame(lottieFrameAtTime({ frameRate: p.frameRate, totalFrames: p.totalFrames, ...s }, 0));
        offsetTimer.current = setTimeout(() => { offsetTimer.current = null; startedRef.current = true; evaluate(); }, offset * 1000);
        return;
      }
      startedRef.current = true;
      p.play();
    } else {
      if (offsetTimer.current) { clearTimeout(offsetTimer.current); offsetTimer.current = null; }
      if (p.isPlaying) p.pause();
      if (!startedRef.current && !scrubRef.current) p.setFrame(s.posterFrame || 0);
    }
  }, []);

  const fitBackingStore = useCallback(() => {
    const p = playerRef.current, wrap = wrapRef.current; if (!p || !wrap) return;
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = Math.max(0.25, Math.min(2, window.devicePixelRatio || 1, 2048 / Math.max(r.width, r.height)));
    p.configure({ pixelRatio: ratio });
    p.resize();
  }, []);

  // Create / replace the player when the source changes.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let alive = true;
    setStatus('loading'); setError(''); startedRef.current = false;
    const s = specRef.current;
    const r = wrapRef.current?.getBoundingClientRect();
    const w = r && r.width ? r.width : s.intrinsicWidth, h = r && r.height ? r.height : s.intrinsicHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    createLottiePlayer(s.source, w * ratio, h * ratio, { ...playOptionsFromSpec(s), pixelRatio: ratio }, canvas)
      .then(p => {
        if (!alive) { p.dispose(); return; }
        playerRef.current = p;
        p.setFrame(s.posterFrame || 0);
        fitBackingStore();
        setStatus('ready');
        evaluate();
      })
      .catch(e => { if (alive) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); } });
    return () => {
      alive = false;
      if (offsetTimer.current) { clearTimeout(offsetTimer.current); offsetTimer.current = null; }
      playerRef.current?.dispose(); playerRef.current = null;
    };
  }, [sourceKey, evaluate, fitBackingStore]);

  // Live playback settings.
  const optsKey = JSON.stringify(playOptionsFromSpec(spec)) + `|${spec.posterFrame || 0}`;
  useEffect(() => {
    const p = playerRef.current; if (!p) return;
    p.configure(playOptionsFromSpec(specRef.current));
    if (!p.isPlaying && !scrubRef.current) p.setFrame(specRef.current.posterFrame || 0);
    evaluate();
  }, [optsKey, evaluate]);

  // Visibility: off-screen, hidden tab, reduced-motion changes, box resizes.
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { visibleRef.current = entries.some(e => e.isIntersecting); evaluate(); }) : null;
    io?.observe(wrap);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fitBackingStore()) : null;
    ro?.observe(wrap);
    const onVis = () => evaluate();
    document.addEventListener('visibilitychange', onVis);
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    mq?.addEventListener?.('change', onVis);
    return () => { io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); mq?.removeEventListener?.('change', onVis); };
  }, [evaluate, fitBackingStore]);

  // Inspector bus.
  useEffect(() => {
    if (!objectId) return;
    return subscribe(objectId, c => {
      const p = playerRef.current;
      if (c.type === 'seek') { scrubRef.current = true; if (p) { if (p.isPlaying) p.pause(); p.setFrame(c.frame); } }
      else if (c.type === 'release') { scrubRef.current = false; evaluate(); }
      else if (c.type === 'play') { forcePlayRef.current = true; manualPauseRef.current = false; scrubRef.current = false; evaluate(); }
      else if (c.type === 'pause') { forcePlayRef.current = false; manualPauseRef.current = true; evaluate(); }
    });
  }, [objectId, evaluate]);

  const fitCss = spec.fit === 'cover' ? 'cover' : spec.fit === 'fill' ? 'fill' : 'contain';
  return (
    <div ref={wrapRef} data-tela-lottie={objectId || ''} aria-label={label || spec.source.name || 'Animation'} role="img" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', ...style }}>
      {spec.posterSrc && status !== 'ready' && <img src={spec.posterSrc} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fitCss }} />}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: status === 'ready' ? 1 : 0 }} />
      {status === 'loading' && !spec.posterSrc && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(107,0,153,.55)' }}><Loader2 size={22} className="animate-spin" /></div>}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 8, textAlign: 'center', background: spec.posterSrc ? 'rgba(18,13,28,.55)' : 'rgba(18,13,28,.9)', color: '#ffb3c6', fontSize: 11, fontWeight: 700, fontFamily: 'system-ui, sans-serif' }}>
          <div><Film size={18} style={{ margin: '0 auto 4px' }} />{error || 'Animation unavailable'}</div>
        </div>
      )}
    </div>
  );
};

// ── Inspector ───────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
const field: React.CSSProperties = { height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none', minWidth: 0 };
const chip = (on: boolean): React.CSSProperties => ({ height: 26, padding: '0 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: 'pointer', color: on ? '#8ff5ff' : 'rgba(255,255,255,.6)', background: on ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.06)', border: on ? '1px solid rgba(0,218,243,.35)' : '1px solid rgba(255,255,255,.12)' });

const toHex = (k: unknown) => {
  if (!Array.isArray(k) || k.length < 3) return '#000000';
  return '#' + k.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(1, Number(n))) * 255).toString(16).padStart(2, '0')).join('');
};
const fromHex = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);
const slotValue = (payload: any) => payload?.p?.k;
const slotText = (payload: any): string => { const k = slotValue(payload); return Array.isArray(k) && k[0]?.s ? String(k[0].s.t ?? '') : ''; };

export const TelaLottieInspector: React.FC<{ object: TelaVectorObject; onUpdate: (patch: Partial<TelaVectorObject>) => void }> = ({ object, onUpdate }) => {
  const spec = object.lottie;
  const latest = useRef(object); latest.current = object;
  const [playhead, setPlayhead] = useState(spec?.posterFrame || 0);
  const [previewing, setPreviewing] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const posterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (posterTimer.current) clearTimeout(posterTimer.current); scrubLottieObject(object.id, { type: 'release' }); }, [object.id]);
  if (!spec) return <div style={{ fontSize: 11, color: '#ffb3c6' }}>This Lottie object has no animation data.</div>;

  const total = Math.max(1, spec.totalFrames || 1), fr = spec.frameRate || 30;
  // Patches compose even when several land before the next render (latest is advanced eagerly).
  const set = (patch: Partial<TelaLottieSpec>) => { const cur = latest.current.lottie; if (!cur) return; const next = { ...cur, ...patch }; latest.current = { ...latest.current, lottie: next }; onUpdate({ lottie: next }); };
  // Poster raster follows poster frame / theme / slots (debounced, best-effort).
  const refreshPoster = (patch: Partial<TelaLottieSpec>) => {
    set(patch);
    if (posterTimer.current) clearTimeout(posterTimer.current);
    posterTimer.current = setTimeout(async () => {
      const cur = latest.current.lottie; if (!cur) return;
      setPosterBusy(true);
      const src = await renderLottiePoster(cur.source, cur);
      setPosterBusy(false);
      if (src) set({ posterSrc: src });
    }, 350);
  };
  const seek = (f: number) => { setPlayhead(f); setPreviewing(false); scrubLottieObject(object.id, { type: 'seek', frame: f }); };
  const unit = spec.segment?.unit || 'frame';
  const toUnit = (frames: number) => unit === 'second' ? Math.round((frames / fr) * 100) / 100 : Math.round(frames);
  const fmtTime = (f: number) => `${(f / fr).toFixed(2)}s · f${Math.round(f)}`;
  const slotInfo = spec.slotInfo || [];
  const src = spec.source;
  const where = src.inlineJson ? 'embedded in doc' : src.sessionOnly ? 'session only — re-import to keep' : src.assetId && src.url ? 'on device + cloud' : src.assetId ? 'on this device' : src.url ? 'linked URL' : 'missing';

  return (
    <div style={{ marginBottom: 10, padding: 8, borderRadius: 9, background: 'rgba(0,218,243,.05)', border: '1px solid rgba(0,218,243,.18)', color: '#fff' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Film size={13} color="#8ff5ff" />
        <div style={{ ...lbl, marginBottom: 0, color: '#8ff5ff' }}>Lottie · {src.format === 'dotlottie' ? '.lottie' : 'JSON'}</div>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: src.sessionOnly ? '#ffcf8a' : 'rgba(255,255,255,.45)' }}>{where}</span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginBottom: 8 }}>{spec.intrinsicWidth}×{spec.intrinsicHeight} · {total} frames @ {Math.round(fr * 100) / 100}fps · {(total / fr).toFixed(2)}s{src.bytes ? ` · ${Math.max(1, Math.round(src.bytes / 1024))} KB` : ''}</div>

      {/* Transport */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
        <button title={previewing ? 'Pause preview' : 'Play preview'} aria-label={previewing ? 'Pause preview' : 'Play preview'} onClick={() => { const next = !previewing; setPreviewing(next); scrubLottieObject(object.id, { type: next ? 'play' : 'pause' }); }} style={{ ...chip(previewing), width: 30, padding: 0, display: 'grid', placeItems: 'center' }}>{previewing ? <Pause size={13} /> : <Play size={13} />}</button>
        <input aria-label="Scrub animation" type="range" min={0} max={total - 1} step={1} value={playhead} onChange={e => seek(+e.target.value)} onPointerUp={() => scrubLottieObject(object.id, { type: 'release' })} style={{ flex: 1, accentColor: '#00DAF3' }} />
      </div>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>Playhead {fmtTime(playhead)}</div>

      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 8 }}>
        <button onClick={() => set({ autoplay: !spec.autoplay })} style={chip(spec.autoplay)}>Autoplay</button>
        <button onClick={() => set({ loop: !spec.loop })} style={chip(spec.loop)}>Loop</button>
        <select aria-label="Direction" value={spec.direction} onChange={e => set({ direction: e.target.value as TelaLottieSpec['direction'] })} style={{ ...field, height: 26, flex: 1 }}>
          <option value="forward">Forward</option><option value="reverse">Reverse</option><option value="bounce">Bounce</option><option value="reverse-bounce">Reverse bounce</option>
        </select>
      </div>

      <div className="flex items-end gap-1.5" style={{ marginBottom: 8 }}>
        <div style={{ flex: 1 }}><div style={lbl}>Speed ×</div><input aria-label="Speed" type="number" min={0.05} max={8} step={0.05} value={spec.speed} onChange={e => set({ speed: Math.max(0.05, Math.min(8, +e.target.value || 1)) })} style={{ ...field, width: '100%' }} /></div>
        <div style={{ flex: 1 }}><div style={lbl} title="Seconds on the frame timeline before playback starts">Start at s</div><input aria-label="Start offset seconds" type="number" min={0} step={0.1} value={spec.startOffset || 0} onChange={e => set({ startOffset: Math.max(0, +e.target.value || 0) || undefined })} style={{ ...field, width: '100%' }} /></div>
        <div style={{ flex: 1 }}><div style={lbl}>Fit</div><select aria-label="Fit" value={spec.fit} onChange={e => set({ fit: e.target.value as TelaLottieSpec['fit'] })} style={{ ...field, width: '100%' }}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></div>
      </div>

      {/* Segment */}
      <div style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-1.5" style={{ marginBottom: 3 }}>
          <div style={{ ...lbl, marginBottom: 0 }}>Segment</div>
          <button onClick={() => set({ segment: spec.segment ? undefined : { start: 0, end: unit === 'second' ? (total - 1) / fr : total - 1, unit } })} style={{ ...chip(!!spec.segment), height: 20, marginLeft: 'auto' }}>{spec.segment ? 'On' : 'Whole'}</button>
          {spec.segment && <select aria-label="Segment unit" value={unit} onChange={e => { const u = e.target.value as 'frame' | 'second'; const s = spec.segment!; const k = u === 'second' ? 1 / fr : fr; if (u !== unit) set({ segment: { start: Math.round(s.start * k * 100) / 100, end: Math.round(s.end * k * 100) / 100, unit: u } }); }} style={{ ...field, height: 20, fontSize: 10 }}><option value="frame">frames</option><option value="second">seconds</option></select>}
        </div>
        {spec.segment && (
          <div className="flex items-center gap-1.5">
            <input aria-label="Segment start" type="number" step={unit === 'second' ? 0.05 : 1} min={0} value={spec.segment.start} onChange={e => set({ segment: { ...spec.segment!, start: Math.max(0, +e.target.value || 0) } })} style={{ ...field, width: 0, flex: 1 }} />
            <button title="Start at playhead" onClick={() => set({ segment: { ...spec.segment!, start: toUnit(playhead) } })} style={chip(false)}>⇤</button>
            <input aria-label="Segment end" type="number" step={unit === 'second' ? 0.05 : 1} min={0} value={spec.segment.end} onChange={e => set({ segment: { ...spec.segment!, end: Math.max(0, +e.target.value || 0) } })} style={{ ...field, width: 0, flex: 1 }} />
            <button title="End at playhead" onClick={() => set({ segment: { ...spec.segment!, end: toUnit(playhead) } })} style={chip(false)}>⇥</button>
          </div>
        )}
        {!!spec.markers?.length && (
          <select aria-label="Marker" value={spec.marker || ''} onChange={e => set({ marker: e.target.value || undefined })} style={{ ...field, width: '100%', marginTop: 6 }}>
            <option value="">— no marker —</option>{spec.markers.map(m => <option key={m} value={m}>Marker · {m}</option>)}
          </select>
        )}
      </div>

      {/* Poster */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
        {spec.posterSrc ? <img src={spec.posterSrc} alt="Poster frame" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 6, background: 'repeating-conic-gradient(#ffffff14 0 25%, transparent 0 50%) 0 0/10px 10px', border: '1px solid rgba(255,255,255,.12)' }} /> : <div style={{ width: 34, height: 34, borderRadius: 6, border: '1px dashed rgba(255,255,255,.2)' }} />}
        <div style={{ flex: 1 }}><div style={lbl} title="Shown in thumbnails, print, reduced motion and before playback">Poster frame</div><input aria-label="Poster frame" type="number" min={0} max={total - 1} step={1} value={spec.posterFrame || 0} onChange={e => refreshPoster({ posterFrame: Math.max(0, Math.min(total - 1, Math.round(+e.target.value || 0))) })} style={{ ...field, width: '100%' }} /></div>
        <button title="Use playhead as poster" onClick={() => refreshPoster({ posterFrame: Math.round(playhead) })} style={{ ...chip(false), alignSelf: 'flex-end' }}>{posterBusy ? <Loader2 size={11} className="animate-spin" /> : 'Use playhead'}</button>
      </div>

      {/* dotLottie theme + slots */}
      {!!spec.themes?.length && (
        <div style={{ marginBottom: 8 }}><div style={lbl}>Theme</div>
          <select aria-label="Theme" value={spec.themeId || ''} onChange={e => refreshPoster({ themeId: e.target.value || undefined })} style={{ ...field, width: '100%' }}><option value="">Default</option>{spec.themes.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
      )}
      {slotInfo.filter(s => s.kind === 'color' || s.kind === 'text' || s.kind === 'scalar').length > 0 && (
        <div>
          <div style={lbl}>Editable slots</div>
          {slotInfo.map(s => {
            const override = spec.slots?.[s.id];
            const payload: any = override ?? s.default;
            const setSlot = (value: unknown | undefined) => { const next = { ...(spec.slots || {}) }; if (value === undefined) delete next[s.id]; else next[s.id] = value; refreshPoster({ slots: Object.keys(next).length ? next : undefined }); };
            const reset = override !== undefined ? <button title="Reset slot" aria-label={`Reset ${s.id}`} onClick={() => setSlot(undefined)} style={{ ...chip(false), width: 26, padding: 0, display: 'grid', placeItems: 'center' }}><RotateCcw size={11} /></button> : null;
            if (s.kind === 'color') return <div key={s.id} className="flex items-center gap-1.5" style={{ marginBottom: 4 }}><input type="color" aria-label={`Slot ${s.id}`} value={toHex(slotValue(payload))} onChange={e => setSlot({ p: { a: 0, k: fromHex(e.target.value) } })} style={{ width: 30, height: 26, padding: 0, border: '1px solid rgba(255,255,255,.18)', borderRadius: 7, background: 'transparent' }} /><span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,.7)' }}>{s.id}</span>{reset}</div>;
            if (s.kind === 'text') return <div key={s.id} className="flex items-center gap-1.5" style={{ marginBottom: 4 }}><input aria-label={`Slot ${s.id}`} value={slotText(payload)} placeholder={s.id} onChange={e => { const base: any = payload ? JSON.parse(JSON.stringify(payload)) : { p: { k: [{ s: {}, t: 0 }] } }; const ks = Array.isArray(base.p?.k) ? base.p.k : (base.p = { k: [{ s: {}, t: 0 }] }).k; ks.forEach((kf: any) => { kf.s = { ...(kf.s || {}), t: e.target.value }; }); setSlot(base); }} style={{ ...field, flex: 1 }} />{reset}</div>;
            if (s.kind === 'scalar') return <div key={s.id} className="flex items-center gap-1.5" style={{ marginBottom: 4 }}><span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,.7)' }}>{s.id}</span><input aria-label={`Slot ${s.id}`} type="number" value={Number(slotValue(payload)) || 0} onChange={e => setSlot({ p: { a: 0, k: +e.target.value || 0 } })} style={{ ...field, width: 70 }} />{reset}</div>;
            return null;
          })}
        </div>
      )}
    </div>
  );
};

// ── Import row (Studio panel / anywhere with an artboard) ──────────────────

export const TelaLottieImportRow: React.FC<{ artboard: { width: number; height: number }; onAdd: (object: TelaVectorObject) => void }> = ({ artboard, onAdd }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<TelaVectorObject>) => {
    setBusy(true); setError(null);
    try { onAdd(await task()); setUrl(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not import this animation.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[.72rem] font-bold text-white disabled:opacity-50" style={{ background: 'rgba(0,218,243,.14)', border: '1px solid rgba(0,218,243,.35)' }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} {busy ? 'Importing…' : 'Add Lottie animation'}
      </button>
      <div className="flex items-center gap-1.5">
        <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && url.trim()) void run(() => importLottieUrl(url, { artboard })); }} placeholder="…or Lottie URL (.lottie / .json)" aria-label="Lottie URL" className="flex-1 min-w-0 h-8 px-2.5 rounded-[9px] text-[.7rem] text-white/85 outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }} />
        <button title="Insert from URL" aria-label="Insert Lottie from URL" disabled={busy || !url.trim()} onClick={() => void run(() => importLottieUrl(url, { artboard }))} className="grid place-items-center w-8 h-8 rounded-[9px] text-white/70 disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }}><LinkIcon size={14} /></button>
      </div>
      {error && <div role="alert" className="text-[.66rem] leading-snug" style={{ color: '#ffb3c6' }}>{error}</div>}
      <input ref={fileRef} type="file" accept=".lottie,.json,application/json,application/zip+dotlottie" multiple className="hidden" onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; files.forEach((file, i) => void run(() => importLottieFile(file, { artboard, at: { x: artboard.width / 2 + i * 24, y: artboard.height / 2 + i * 24 } }))); }} />
    </div>
  );
};
