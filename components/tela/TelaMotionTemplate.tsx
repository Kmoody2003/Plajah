/**
 * TelaMotionTemplate — React surfaces for MOTION_TEMPLATE vector objects: an Ambo
 * slide template or scripture look placed on a Tela artboard, drawn LIVE from the
 * platform designer code (services/tela/telaMotionTemplate.ts), with the doc
 * owning the timing.
 *
 *   <TelaMotionTemplateCanvas>     live playback inside an artboard (TelaVector renders it
 *                                  in a <foreignObject>). Entrance at startOffset → hold →
 *                                  exit (→ loop). Pauses off-screen / hidden tab; reduced
 *                                  motion holds the settled frame.
 *   <TelaMotionTemplateInspector>  template + theme / look, field text, timing, replay + scrub,
 *                                  poster refresh.
 *   controlMotionTemplate()        bus the inspector uses to drive the on-canvas instance.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Pause, Play, RotateCcw } from 'lucide-react';
import type { TelaMotionTemplateSpec, TelaMotionTemplateTiming, TelaVectorObject } from '../../types';
import {
  renderMotionTemplateAt, ensureMotionTemplateFonts, motionTemplateDurations, motionTemplateFields, motionTemplateDefaults,
  renderMotionTemplatePoster, motionPrefersReduced, defaultMotionSpec, themeSetOf,
  SLIDE_TEMPLATES, SLIDE_THEMES, SCRIPTURE_LAYOUTS, SCRIPTURE_TRANSITIONS, type MotionPhase,
} from '../../services/tela/telaMotionTemplate';

// ── Inspector → canvas bus ──────────────────────────────────────────────────

export type MotionBusCommand = { type: 'replay' } | { type: 'seek'; t: number } | { type: 'release' } | { type: 'pause' } | { type: 'play' };
const bus = new Map<string, Set<(c: MotionBusCommand) => void>>();
export function controlMotionTemplate(objectId: string, command: MotionBusCommand) { bus.get(objectId)?.forEach(fn => fn(command)); }
function subscribe(objectId: string, fn: (c: MotionBusCommand) => void) {
  const set = bus.get(objectId) || new Set(); set.add(fn); bus.set(objectId, set);
  return () => { set.delete(fn); if (!set.size) bus.delete(objectId); };
}

/** Spec identity for redraws (poster excluded — it never changes the live frame). */
const specKey = (s: TelaMotionTemplateSpec) => { const { posterSrc, ...rest } = s; void posterSrc; return JSON.stringify(rest); };

// ── Live canvas ─────────────────────────────────────────────────────────────

export const TelaMotionTemplateCanvas: React.FC<{ spec: TelaMotionTemplateSpec; width: number; height: number; objectId?: string; label?: string; style?: React.CSSProperties }> = ({ spec, width, height, objectId, label, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const specRef = useRef(spec); specRef.current = spec;
  const sizeRef = useRef({ w: width, h: height }); sizeRef.current = { w: width, h: height };
  // Clock: elapsed seconds accumulate only while visible (like the Lottie object).
  const clock = useRef({ elapsed: 0, last: 0, running: false, seek: null as number | null, paused: false });
  const visibleRef = useRef(true);
  const rafRef = useRef(0);
  const lastDraw = useRef(0);
  const [phase, setPhase] = useState<MotionPhase>('pre');
  const phaseRef = useRef<MotionPhase>('pre');

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const { w, h } = sizeRef.current;
    const k = Math.max(0.1, Math.min(1.5, 1920 / Math.max(1, w, h)));
    const bw = Math.max(2, Math.round(w * k)), bh = Math.max(2, Math.round(h * k));
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const ck = clock.current;
    const t = ck.seek ?? ck.elapsed;
    const fr = renderMotionTemplateAt(ctx, specRef.current, t, w, h, { reducedMotion: motionPrefersReduced() });
    if (fr.phase !== phaseRef.current) { phaseRef.current = fr.phase; setPhase(fr.phase); }
    c.dataset.mtT = t.toFixed(3); c.dataset.mtPhase = fr.phase;
  }, []);

  const tick = useCallback((now: number) => {
    rafRef.current = 0;
    const ck = clock.current;
    if (ck.running && !ck.paused && ck.seek == null && visibleRef.current && !document.hidden) {
      if (ck.last) ck.elapsed += Math.min(0.1, (now - ck.last) / 1000);
      ck.last = now;
    } else ck.last = 0;
    // ≤ 30 fps — the designers are typographic; this keeps several objects cheap.
    if (now - lastDraw.current >= 32) { lastDraw.current = now; draw(); }
    const reduced = motionPrefersReduced();
    const d = motionTemplateDurations(specRef.current);
    const finished = !d.loop && ck.elapsed > d.start + d.enter + d.hold + d.exit + 0.1;
    if (!reduced && ck.running && !ck.paused && ck.seek == null && visibleRef.current && !document.hidden && !finished) rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const kick = useCallback(() => { if (!rafRef.current) rafRef.current = requestAnimationFrame(tick); }, [tick]);

  // Start on mount; fonts first so the first frame measures with the real faces.
  useEffect(() => {
    let alive = true;
    clock.current.running = true;
    draw(); kick();
    ensureMotionTemplateFonts(specRef.current).then(() => { if (alive) { draw(); kick(); } });
    return () => { alive = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [draw, kick]);

  // Spec / size edits redraw at once (and keep the clock running).
  const key = specKey(spec);
  useEffect(() => {
    let alive = true;
    draw(); kick();
    ensureMotionTemplateFonts(spec).then(() => { if (alive) draw(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);

  // Visibility.
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visibleRef.current = es.some(e => e.isIntersecting); if (visibleRef.current) kick(); }) : null;
    io?.observe(wrap);
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [kick]);

  // Inspector bus.
  useEffect(() => {
    if (!objectId) return;
    return subscribe(objectId, c => {
      const ck = clock.current;
      if (c.type === 'replay') { ck.elapsed = 0; ck.last = 0; ck.seek = null; ck.paused = false; }
      else if (c.type === 'seek') ck.seek = Math.max(0, c.t);
      else if (c.type === 'release') { if (ck.seek != null) ck.elapsed = ck.seek; ck.seek = null; }
      else if (c.type === 'pause') ck.paused = true;
      else if (c.type === 'play') ck.paused = false;
      draw(); kick();
    });
  }, [objectId, draw, kick]);

  return (
    <div ref={wrapRef} data-tela-motion={objectId || ''} data-phase={phase} role="img" aria-label={label || 'Motion template'} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', ...style }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

// ── Inspector ───────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
const field: React.CSSProperties = { height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none', minWidth: 0 };
const chip = (on: boolean): React.CSSProperties => ({ height: 26, padding: '0 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: 'pointer', color: on ? '#ffd9a8' : 'rgba(255,255,255,.6)', background: on ? 'rgba(255,140,0,.14)' : 'rgba(255,255,255,.06)', border: on ? '1px solid rgba(255,140,0,.4)' : '1px solid rgba(255,255,255,.12)' });
const SET_LABEL = { classic: 'Classic', modern: 'Modern & Abstract', urban: 'Urban' } as const;

export const TelaMotionTemplateInspector: React.FC<{ object: TelaVectorObject; onUpdate: (patch: Partial<TelaVectorObject>) => void }> = ({ object, onUpdate }) => {
  const spec = object.motionTemplate;
  const latest = useRef(object); latest.current = object;
  const [scrub, setScrub] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const posterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (posterTimer.current) clearTimeout(posterTimer.current); controlMotionTemplate(object.id, { type: 'release' }); }, [object.id]);

  const slideGroups = useMemo(() => {
    const m = new Map<string, typeof SLIDE_TEMPLATES>();
    for (const t of SLIDE_TEMPLATES) { const a = m.get(t.category) || []; a.push(t); m.set(t.category, a); }
    return [...m.entries()];
  }, []);
  const lookGroups = useMemo(() => {
    const m = new Map<string, typeof SCRIPTURE_LAYOUTS>();
    for (const l of SCRIPTURE_LAYOUTS) { const a = m.get(l.family) || []; a.push(l); m.set(l.family, a); }
    return [...m.entries()];
  }, []);

  if (!spec) return <div style={{ fontSize: 11, color: '#ffb3c6' }}>This motion object has no template data.</div>;

  const commit = (next: TelaMotionTemplateSpec, poster = true) => {
    latest.current = { ...latest.current, motionTemplate: next };
    onUpdate({ motionTemplate: next });
    if (!poster) return;
    if (posterTimer.current) clearTimeout(posterTimer.current);
    posterTimer.current = setTimeout(async () => {
      const cur = latest.current; const s = cur.motionTemplate; if (!s) return;
      const src = await renderMotionTemplatePoster(s, cur.w, cur.h);
      if (src && latest.current.motionTemplate) { const n = { ...latest.current.motionTemplate, posterSrc: src }; latest.current = { ...latest.current, motionTemplate: n }; onUpdate({ motionTemplate: n }); }
    }, 450);
  };
  const set = (patch: Partial<TelaMotionTemplateSpec>) => { const cur = latest.current.motionTemplate; if (cur) commit({ ...cur, ...patch }); };
  const setTiming = (k: keyof TelaMotionTemplateTiming, v: number | boolean | undefined) => {
    const cur = latest.current.motionTemplate; if (!cur) return;
    const timing: TelaMotionTemplateTiming = { ...(cur.timing || {}) };
    if (v === undefined || v === '' as any || (typeof v === 'number' && !isFinite(v))) delete (timing as any)[k]; else (timing as any)[k] = v;
    commit({ ...cur, timing }, false);
  };
  const setField = (k: string, v: string) => { const cur = latest.current.motionTemplate; if (!cur) return; commit({ ...cur, fields: { ...(cur.fields || {}), [k]: v } }); };
  const resetField = (k: string) => { const cur = latest.current.motionTemplate; if (!cur) return; const f = { ...(cur.fields || {}) }; delete f[k]; commit({ ...cur, fields: f }); };

  const d = motionTemplateDurations(spec);
  const holdShown = isFinite(d.hold) ? d.hold : 3;
  const total = d.start + d.enter + holdShown + d.exit + (d.loop ? d.gap : 0.2);
  const defs = motionTemplateFields(spec);
  const dflt = motionTemplateDefaults(spec);
  const num = (k: keyof TelaMotionTemplateTiming, title: string, placeholder: string, max = 60) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={lbl} title={title}>{String(k).replace('Sec', '').replace('startOffset', 'start')} s</div>
      <input aria-label={title} type="number" min={0} max={max} step={0.05} placeholder={placeholder}
        value={typeof (spec.timing as any)?.[k] === 'number' ? (spec.timing as any)[k] : ''}
        onChange={e => setTiming(k, e.target.value === '' ? undefined : Math.max(0, Math.min(max, +e.target.value)))} style={{ ...field, width: '100%' }} />
    </div>
  );

  return (
    <div data-mt-inspector style={{ marginBottom: 10, padding: 8, borderRadius: 9, background: 'rgba(255,140,0,.05)', border: '1px solid rgba(255,140,0,.2)', color: '#fff' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Clapperboard size={13} color="#ffd9a8" />
        <div style={{ ...lbl, marginBottom: 0, color: '#ffd9a8' }}>Motion template · {spec.kind === 'scripture' ? 'Scripture look' : 'Ambo slide'}</div>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(255,255,255,.45)' }}>{spec.savedTemplateId ? 'from a saved template' : 'platform code'}</span>
      </div>

      <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
        <button onClick={() => { if (spec.kind !== 'slide') commit({ ...defaultMotionSpec('slide', 'welcome'), timing: spec.timing }); }} style={chip(spec.kind === 'slide')}>Slide</button>
        <button onClick={() => { if (spec.kind !== 'scripture') commit({ ...defaultMotionSpec('scripture', 'sanctuary'), timing: spec.timing }); }} style={chip(spec.kind === 'scripture')}>Scripture</button>
      </div>

      {spec.kind === 'slide' ? (
        <div className="flex items-end gap-1.5" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={lbl}>Template</div>
            <select aria-label="Template" value={spec.templateId || ''} onChange={e => set({ templateId: e.target.value, name: undefined })} style={{ ...field, width: '100%' }}>
              {slideGroups.map(([cat, list]) => <optgroup key={cat} label={cat}>{list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
            </select></div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={lbl}>Theme</div>
            <select aria-label="Theme" value={spec.theme || ''} onChange={e => set({ theme: e.target.value })} style={{ ...field, width: '100%' }}>
              {(['classic', 'modern', 'urban'] as const).map(s => <optgroup key={s} label={SET_LABEL[s]}>{SLIDE_THEMES.filter(t => themeSetOf(t.id) === s).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
            </select></div>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <div style={lbl}>Look</div>
          <select aria-label="Scripture look" value={spec.layoutId || ''} onChange={e => set({ layoutId: e.target.value, name: undefined })} style={{ ...field, width: '100%', marginBottom: 6 }}>
            {lookGroups.map(([fam, list]) => <optgroup key={fam} label={fam}>{list.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
          </select>
          <div className="flex items-end gap-1.5">
            <div style={{ flex: 1, minWidth: 0 }}><div style={lbl}>Transition</div>
              <select aria-label="Transition" value={spec.transition || 'crossfade'} onChange={e => set({ transition: e.target.value })} style={{ ...field, width: '100%' }}>
                {SCRIPTURE_TRANSITIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div><div style={lbl}>Accent</div><input aria-label="Accent colour" type="color" value={spec.accent || '#D4AF37'} onChange={e => set({ accent: e.target.value })} style={{ width: 34, height: 28, padding: 0, border: '1px solid rgba(255,255,255,.18)', borderRadius: 7, background: 'transparent' }} /></div>
          </div>
        </div>
      )}

      {/* Fields */}
      <div style={{ marginBottom: 8 }}>
        <div style={lbl}>Content</div>
        {defs.map(f => {
          const v = spec.fields?.[f.key];
          const shown = v ?? dflt[f.key] ?? f.default;
          const reset = v !== undefined ? <button title="Back to the template copy" aria-label={`Reset ${f.label}`} onClick={() => resetField(f.key)} style={{ ...chip(false), width: 26, padding: 0, display: 'grid', placeItems: 'center', flex: 'none' }}><RotateCcw size={11} /></button> : null;
          return (
            <div key={f.key} style={{ marginBottom: 5 }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.5)', marginBottom: 2 }} title={f.hint}>{f.label}</div>
              <div className="flex items-start gap-1.5">
                {f.multiline
                  ? <textarea aria-label={f.label} rows={2} value={shown} onChange={e => setField(f.key, e.target.value)} style={{ ...field, height: 'auto', padding: '5px 7px', flex: 1, resize: 'vertical', fontFamily: 'inherit' }} />
                  : f.kind === 'select' && f.options
                    ? <select aria-label={f.label} value={shown} onChange={e => setField(f.key, e.target.value)} style={{ ...field, flex: 1 }}>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    : <input aria-label={f.label} value={shown} onChange={e => setField(f.key, e.target.value)} style={{ ...field, flex: 1 }} />}
                {reset}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timing */}
      <div style={lbl}>Timing <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(255,255,255,.35)' }}>· blank = the theme's own</span></div>
      <div className="flex items-end gap-1.5" style={{ marginBottom: 6 }}>
        {num('startOffset', 'Seconds before the entrance begins', '0')}
        {num('enterSec', 'Entrance length', d.enter.toFixed(2), 6)}
        {num('holdSec', 'Hold length (blank = hold until cleared)', d.loop ? '4' : '∞')}
        {num('exitSec', 'Exit length', d.exit.toFixed(2), 4)}
      </div>
      <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
        <button onClick={() => setTiming('loop', spec.timing?.loop ? undefined : true)} style={chip(!!spec.timing?.loop)}>Loop</button>
        <button title="Replay from the start" aria-label="Replay" onClick={() => { setScrub(null); setPaused(false); controlMotionTemplate(object.id, { type: 'replay' }); }} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 4 }}><RotateCcw size={11} /> Replay</button>
        <button title={paused ? 'Resume' : 'Pause'} aria-label={paused ? 'Resume' : 'Pause'} onClick={() => { const n = !paused; setPaused(n); controlMotionTemplate(object.id, { type: n ? 'pause' : 'play' }); }} style={{ ...chip(paused), width: 30, padding: 0, display: 'grid', placeItems: 'center' }}>{paused ? <Play size={12} /> : <Pause size={12} />}</button>
      </div>
      <div className="flex items-center gap-1.5">
        <input aria-label="Scrub timing" type="range" min={0} max={Math.max(0.1, total)} step={0.02} value={scrub ?? 0}
          onChange={e => { const t = +e.target.value; setScrub(t); controlMotionTemplate(object.id, { type: 'seek', t }); }}
          onPointerUp={() => { controlMotionTemplate(object.id, { type: 'release' }); }} style={{ flex: 1, accentColor: '#FF8C00' }} />
        <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right' }}>{(scrub ?? 0).toFixed(2)}s</span>
      </div>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
        in {d.start.toFixed(2)}s · enter {d.enter.toFixed(2)}s · hold {isFinite(d.hold) ? d.hold.toFixed(2) + 's' : 'until cleared'} · exit {d.exit.toFixed(2)}s{d.loop ? ` · loop (+${d.gap.toFixed(1)}s)` : ''}
      </div>
      {spec.posterSrc && <div className="flex items-center gap-1.5" style={{ marginTop: 6 }}><img src={spec.posterSrc} alt="Poster" style={{ width: 54, height: 'auto', borderRadius: 4, border: '1px solid rgba(255,255,255,.12)' }} /><span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.4)' }}>Poster — used in thumbnails, print and HTML export</span></div>}
    </div>
  );
};
