// AmboSlideTemplateGallery — pick a Tela-designed slide template, a theme and
// the words, preview it animating at any output aspect, and insert it into the
// active show as a TELA_TEMPLATE layer.
//
// Thumbnails and the preview are drawn by the SAME renderer the outputs use
// (services/ambo/slideTemplates/canvasRender), so what the operator sees here
// is what every screen will draw at its own size.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BLEND_MODES, type BlendMode } from '../../services/ambo/scriptureLook';
import { createPortal } from 'react-dom';
import { LayoutTemplate, X, Check, Play, Pause, RotateCcw, Plus, Image as ImageIcon, Film, Music, BarChart3, AlertTriangle } from 'lucide-react';
import { TemplateFieldEditor, trimFieldKeys, isSessionOnlyUrl, splitLines } from './AmboTemplateFieldEditors';
import type { SlideTemplateDef } from '../../services/ambo/slideTemplates/types';
import { newId, type Slide } from '../../services/ambo/showModel';
import { SLIDE_TEMPLATES, TEMPLATE_CATEGORIES, defaultFields, templateById, GROUND_FIELD } from '../../services/ambo/slideTemplates/registry';
import { SLIDE_THEMES, DEFAULT_THEME_ID, themeById } from '../../services/ambo/slideTemplates/themes';
import { MODERN_THEMES_A } from '../../services/ambo/slideTemplates/themesModernA';
import { MODERN_THEMES_B } from '../../services/ambo/slideTemplates/themesModernB';
import { URBAN_THEMES } from '../../services/ambo/slideTemplates/themesUrban';

/** Theme sets for the picker — 43 themes don't fit one strip. */
const MODERN_IDS = new Set([...MODERN_THEMES_A, ...MODERN_THEMES_B].map(t => t.id));
const URBAN_IDS = new Set(URBAN_THEMES.map(t => t.id));
const THEME_SETS = ['Classic', 'Modern & Abstract', 'Urban & Grunge'] as const;
type ThemeSet = typeof THEME_SETS[number];
const themeSetOf = (id: string): ThemeSet => URBAN_IDS.has(id) ? 'Urban & Grunge' : MODERN_IDS.has(id) ? 'Modern & Abstract' : 'Classic';
import { renderSlideTemplate, loadThemeFonts, invalidateSlideLayouts, slideTemplateTiming, prefersReducedMotion } from '../../services/ambo/slideTemplates/canvasRender';

const ASPECTS: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: '16:9', label: '16:9', w: 1920, h: 1080 },
  { id: '4:3', label: '4:3', w: 1440, h: 1080 },
  { id: '9:16', label: '9:16', w: 1080, h: 1920 },
  { id: '21:9', label: '21:9', w: 2560, h: 1080 },
  { id: '32:9', label: '32:9', w: 3840, h: 1080 },
];

const LILAC = '#D0BCFF', CYAN = '#00DAF3', LIVE = '#FF8C00';

/** Media templates own playback/data — badge them in the list and the category row. */
type MediaType = NonNullable<SlideTemplateDef['media']>;
const MEDIA_ICON: Record<MediaType, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = { photo: ImageIcon, video: Film, audio: Music, data: BarChart3 };
const CATEGORY_MEDIA: Record<string, MediaType> = { Photo: 'photo', Video: 'video', Audio: 'audio', Data: 'data' };
const mediaOf = (t: SlideTemplateDef): MediaType | undefined => t.media || CATEGORY_MEDIA[t.category];
const glass: React.CSSProperties = { background: 'rgba(16,13,28,0.94)', border: '1px solid rgba(255,255,255,0.09)', backdropFilter: 'blur(18px)' };

/** Fit an aspect inside a box. */
function fit(ar: number, bw: number, bh: number) { return ar >= bw / bh ? { w: bw, h: Math.round(bw / ar) } : { w: Math.round(bh * ar), h: bh }; }

function useFontEpoch(themeId: string): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let alive = true;
    loadThemeFonts(themeId).then(() => { if (alive) { invalidateSlideLayouts(); setEpoch(e => e + 1); } });
    return () => { alive = false; };
  }, [themeId]);
  return epoch;
}

const Thumb: React.FC<{ templateId: string; theme: string; aspect: typeof ASPECTS[number]; fields?: Record<string, string>; epoch: number; box: { w: number; h: number } }> = ({ templateId, theme, aspect, fields, epoch, box }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = fit(aspect.w / aspect.h, box.w, box.h);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    renderSlideTemplate(ctx, templateId, theme, fields, c.width, c.height, { t: 0 });
  }, [templateId, theme, aspect.id, epoch, size.w, size.h, fields]);
  return <canvas ref={ref} style={{ width: size.w, height: size.h, borderRadius: 6, display: 'block', boxShadow: '0 4px 18px rgba(0,0,0,.35)' }} />;
};

/** The animated preview — loops entrance → hold → exit. */
const LivePreview: React.FC<{ templateId: string; theme: string; aspect: typeof ASPECTS[number]; fields: Record<string, string>; epoch: number; playing: boolean; box: { w: number; h: number }; replayKey: number }> = ({ templateId, theme, aspect, fields, epoch, playing, box, replayKey }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = fit(aspect.w / aspect.h, box.w, box.h);
  const [phase, setPhase] = useState('');
  // Typing updates the words without restarting the loop.
  const fieldsRef = useRef(fields); fieldsRef.current = fields;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    const reduced = prefersReducedMotion();
    const tm = slideTemplateTiming(theme, reduced);
    const hold = 3.4, gap = .6, cycle = tm.enterSec + hold + tm.exitSec + gap;
    const t0 = performance.now();
    let raf = 0, last = '';
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (!playing) { renderSlideTemplate(ctx, templateId, theme, fieldsRef.current, c.width, c.height, { t, reducedMotion: reduced }); if (last !== 'Hold') setPhase(last = 'Hold'); raf = requestAnimationFrame(tick); return; }
      const ct = t % cycle;
      let enterP = 1, exitP = 0, label = 'Hold';
      if (ct < tm.enterSec) { enterP = ct / tm.enterSec; label = 'In'; }
      else if (ct > tm.enterSec + hold && ct < tm.enterSec + hold + tm.exitSec) { exitP = (ct - tm.enterSec - hold) / tm.exitSec; label = 'Out'; }
      else if (ct >= tm.enterSec + hold + tm.exitSec) { exitP = 1; label = 'Clear'; }
      if (exitP >= 1) ctx.clearRect(0, 0, c.width, c.height);
      else renderSlideTemplate(ctx, templateId, theme, fieldsRef.current, c.width, c.height, { t, enterP, exitP, reducedMotion: reduced });
      if (label !== last) setPhase(last = label);
      raf = requestAnimationFrame(tick);
    };
    tick(); // first frame now — never show an empty well while rAF is throttled
    return () => cancelAnimationFrame(raf);
  }, [templateId, theme, aspect.id, epoch, playing, size.w, size.h, replayKey]);
  return (
    <div className="relative" style={{ width: size.w, height: size.h, borderRadius: 10, overflow: 'hidden', background: 'repeating-conic-gradient(#1a1726 0% 25%, #14121e 0% 50%) 50% / 16px 16px', boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
      <canvas ref={ref} style={{ width: size.w, height: size.h, display: 'block' }} />
      <span className="absolute top-2 left-2 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,.55)', color: phase === 'Hold' ? CYAN : LIVE }}>{phase}</span>
    </div>
  );
};

export interface AmboSlideTemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onInsert?: (slide: Slide) => void;
  activeShowTitle?: string;
}

export const AmboSlideTemplateGallery: React.FC<AmboSlideTemplateGalleryProps> = ({ open, onClose, onInsert, activeShowTitle }) => {
  const [aspectId, setAspectId] = useState('16:9');
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [themeSet, setThemeSet] = useState<ThemeSet>(() => themeSetOf(DEFAULT_THEME_ID));
  const [director, setDirector] = useState('All');
  const setThemes = useMemo(() => SLIDE_THEMES.filter(t => themeSetOf(t.id) === themeSet), [themeSet]);
  const directors = useMemo(() => ['All', ...Array.from(new Set(setThemes.map(t => t.director)))], [setThemes]);
  const shownThemes = director === 'All' ? setThemes : setThemes.filter(t => t.director === director);
  const [category, setCategory] = useState<string>('All');
  const [templateId, setTemplateId] = useState(SLIDE_TEMPLATES[0].id);
  const [fieldsById, setFieldsById] = useState<Record<string, Record<string, string>>>({});
  const [slot, setSlot] = useState<'slide' | 'background'>('slide');
  const [translucent, setTranslucent] = useState(false);
  // Background-art blend onto the layers beneath (generator, video…); text stays normal.
  const [bgBlend, setBgBlend] = useState<BlendMode>('normal');
  const [bgOpacity, setBgOpacity] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [flash, setFlash] = useState('');
  const epoch = useFontEpoch(themeId);
  const previewWrap = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(520);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => {
    const el = previewWrap.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPreviewW(Math.max(260, Math.floor(el.clientWidth))));
    ro.observe(el); return () => ro.disconnect();
  }, [open]);

  const tpl = templateById(templateId) || SLIDE_TEMPLATES[0];
  const aspect = ASPECTS.find(a => a.id === aspectId) || ASPECTS[0];
  const theme = themeById(themeId);
  const fields = useMemo<Record<string, string>>(() => ({ ...defaultFields(tpl), ...(fieldsById[tpl.id] || {}), [GROUND_FIELD]: translucent ? 'translucent' : 'solid' }), [tpl, fieldsById, translucent]);
  const list = SLIDE_TEMPLATES.filter(t => category === 'All' || t.category === category);
  const setField = (k: string, v: string) => setFieldsById(m => ({ ...m, [tpl.id]: { ...(m[tpl.id] || {}), [k]: v } }));
  const trimKeys = useMemo(() => trimFieldKeys(tpl.fields), [tpl]);
  const fieldCtx = { keys: tpl.fields.map(f => f.key), get: (k: string) => fields[k] ?? '', set: setField };
  // blob: URLs die on reload / never reach other machines — say so before inserting.
  const sessionOnly = tpl.fields.filter(fd => splitLines(fields[fd.key] || '').some(u => isSessionOnlyUrl(u.trim()))).map(fd => fd.label);

  const insert = () => {
    if (!onInsert) return;
    const title = fields.title || fields.name || fields.quote || fields.point || tpl.name;
    const slide: Slide = {
      id: newId('sl_tpl'),
      label: `${tpl.name}${title && title !== tpl.name ? ' · ' + title.slice(0, 40) : ''}`,
      group: tpl.category,
      groupColor: LILAC,
      layers: [{ id: newId('ly_tpl'), slot, name: `${tpl.name} (${theme.name})`, content: { kind: 'TELA_TEMPLATE', templateId: tpl.id, fields: { ...fields }, theme: theme.id, ...(bgBlend !== 'normal' || bgOpacity < 1 ? { bgBlend, bgOpacity } : {}) } }],
    };
    onInsert(slide);
    setFlash(`Added “${tpl.name}” to ${activeShowTitle || 'the show'}${sessionOnly.length ? ' — local media is session-only' : ''}`);
    window.setTimeout(() => setFlash(''), 2200);
  };

  if (!open || typeof document === 'undefined') return null;
  const thumbBox = { w: 172, h: 104 };
  const previewBox = { w: previewW, h: Math.round(previewW * 0.62) };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(4,3,10,0.66)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[1320px] h-[min(880px,94vh)] rounded-2xl flex flex-col overflow-hidden text-white" style={glass}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <LayoutTemplate size={18} style={{ color: LILAC }} />
          <div className="min-w-0">
            <div className="text-[13px] font-extrabold tracking-wide">Slide Templates</div>
            <div className="text-[10px] text-white/45 truncate">Designed in Tela · re-flows to every output's aspect · animates in, breathes, animates out</div>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,.05)' }} title="Preview aspect — every output draws its own">
            {ASPECTS.map(a => (
              <button key={a.id} onClick={() => setAspectId(a.id)} className="px-2 py-1 rounded-md text-[10.5px] font-bold transition-all"
                style={{ color: aspectId === a.id ? '#0b0a12' : 'rgba(255,255,255,.65)', background: aspectId === a.id ? CYAN : 'transparent' }}>{a.label}</button>
            ))}
          </div>
          <button onClick={onClose} className="ml-2 w-8 h-8 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Close"><X size={16} /></button>
        </div>

        {/* Themes */}
        <div className="flex items-center gap-1 px-4 pt-2 flex-wrap">
          {THEME_SETS.map(set => (
            <button key={set} onClick={() => { setThemeSet(set); setDirector('All'); }} className="px-2 py-0.5 rounded-md text-[10.5px] font-bold"
              style={{ color: themeSet === set ? '#0b0a12' : 'rgba(255,255,255,.6)', background: themeSet === set ? LILAC : 'rgba(255,255,255,.05)' }}>
              {set} <span className="opacity-60">{SLIDE_THEMES.filter(t => themeSetOf(t.id) === set).length}</span>
            </button>
          ))}
          <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,.12)' }} />
          {directors.map(d => (
            <button key={d} onClick={() => setDirector(d)} className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ color: director === d ? '#fff' : 'rgba(255,255,255,.45)', background: director === d ? 'rgba(255,255,255,.12)' : 'transparent' }}>{d.replace(/^the /, '')}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
          {shownThemes.map(t => (
            <button key={t.id} onClick={() => setThemeId(t.id)} title={`${t.lens}\nBest for: ${t.use}`}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full flex-none transition-all"
              style={{ border: `1px solid ${themeId === t.id ? LILAC : 'rgba(255,255,255,.1)'}`, background: themeId === t.id ? 'rgba(208,188,255,.12)' : 'rgba(255,255,255,.03)' }}>
              <span className="flex -space-x-1">
                {[t.c.ground, t.c.accent, t.c.ink].map((col, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border" style={{ background: col, borderColor: 'rgba(255,255,255,.25)' }} />)}
              </span>
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-bold">{t.name}</span>
                <span className="block text-[9px] text-white/40">{t.director}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Library */}
          <div className="flex-1 min-w-0 flex flex-col border-r" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
            <div className="flex gap-1 px-3 pt-2 pb-1 flex-wrap">
              {['All', ...TEMPLATE_CATEGORIES].map(cat => {
                const n = cat === 'All' ? SLIDE_TEMPLATES.length : SLIDE_TEMPLATES.filter(t => t.category === cat).length;
                const MIcon = CATEGORY_MEDIA[cat] ? MEDIA_ICON[CATEGORY_MEDIA[cat]] : null;
                return (
                  <button key={cat} onClick={() => setCategory(cat)} data-category={cat} className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold inline-flex items-center gap-1"
                    style={{ color: category === cat ? '#fff' : n ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.25)', background: category === cat ? 'rgba(255,255,255,.12)' : 'transparent' }}>
                    {MIcon && <MIcon size={11} style={{ color: category === cat ? CYAN : 'rgba(0,218,243,.6)' }} />}{cat}
                    {cat !== 'All' && <span className="text-[9px] opacity-50 font-mono">{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbBox.w + 16}px, 1fr))`, alignContent: 'start' }}>
              {!list.length && (
                <div className="col-span-full text-[11px] text-white/40 p-6 text-center">No {category} templates yet — they are on their way.</div>
              )}
              {list.map(t => {
                const active = t.id === tpl.id;
                const media = mediaOf(t);
                const MIcon = media ? MEDIA_ICON[media] : null;
                return (
                  <button key={t.id} onClick={() => { setTemplateId(t.id); setReplayKey(k => k + 1); }} className="rounded-xl p-2 text-left transition-all"
                    style={{ border: `1px solid ${active ? CYAN : 'rgba(255,255,255,.08)'}`, background: active ? 'rgba(0,218,243,.08)' : 'rgba(255,255,255,.03)', boxShadow: active ? '0 0 18px rgba(0,218,243,.15)' : 'none' }}>
                    <div className="relative grid place-items-center" style={{ height: thumbBox.h }}>
                      {MIcon && <span title={`${media} template`} className="absolute top-1 right-1 z-[1] w-5 h-5 rounded-md grid place-items-center" style={{ background: 'rgba(8,6,16,.78)', border: '1px solid rgba(0,218,243,.35)' }}><MIcon size={11} style={{ color: CYAN }} /></span>}
                      <Thumb templateId={t.id} theme={themeId} aspect={aspect} epoch={epoch} box={thumbBox} fields={fieldsById[t.id] ? { ...defaultFields(t), ...fieldsById[t.id] } : undefined} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold truncate">{t.name}</span>
                      <span className="text-[8.5px] font-mono uppercase text-white/35 flex-none">{t.category}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview + form */}
          <div className="w-[min(560px,46%)] flex-none flex flex-col min-h-0">
            <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
              <div ref={previewWrap} className="w-full grid place-items-center" style={{ height: previewBox.h }}>
                <LivePreview templateId={tpl.id} theme={themeId} aspect={aspect} fields={fields} epoch={epoch} playing={playing} box={previewBox} replayKey={replayKey} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setPlaying(p => !p)} className="h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 bg-white/5 hover:bg-white/10">
                  {playing ? <Pause size={12} /> : <Play size={12} />}{playing ? 'Pause loop' : 'Loop in/out'}
                </button>
                <button onClick={() => setReplayKey(k => k + 1)} className="h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 bg-white/5 hover:bg-white/10"><RotateCcw size={12} />Replay</button>
                <div className="ml-auto text-right leading-tight">
                  <div className="text-[11px] font-bold" style={{ color: LILAC }}>{theme.name}</div>
                  <div className="text-[9.5px] text-white/45">by {theme.director} · Art Council</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <div className="text-[10.5px] text-white/50">{tpl.blurb}</div>
              {tpl.fields.filter(fd => !trimKeys.has(fd.key)).map(fd => (
                <TemplateFieldEditor key={`${tpl.id}:${fd.key}`} fd={fd} value={fields[fd.key] ?? ''} onChange={v => setField(fd.key, v)} ctx={fieldCtx} />
              ))}
              {sessionOnly.length > 0 && (
                <div className="text-[9.5px] flex items-start gap-1 rounded-md px-2 py-1" style={{ color: '#FFB547', background: 'rgba(255,181,71,.08)' }}>
                  <AlertTriangle size={11} className="flex-none mt-px" />{sessionOnly.join(', ')}: local file{sessionOnly.length > 1 ? 's are' : ' is'} session-only and will be missing after a reload.
                </div>
              )}
              <button onClick={() => setFieldsById(m => { const n = { ...m }; delete n[tpl.id]; return n; })} className="text-[10px] font-semibold text-white/45 hover:text-white">Reset fields to defaults</button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Layer</span>
                  <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,.05)' }}>
                    {(['slide', 'background'] as const).map(s => (
                      <button key={s} onClick={() => setSlot(s)} className="flex-1 py-1 rounded-md text-[10.5px] font-bold capitalize"
                        style={{ background: slot === s ? 'rgba(208,188,255,.2)' : 'transparent', color: slot === s ? LILAC : 'rgba(255,255,255,.55)' }}>{s}</button>
                    ))}
                  </div>
                  <div className="text-[9px] text-white/35 mt-1">{slot === 'slide' ? 'Replaces the slide text layer.' : 'Stays under lyrics & scripture.'}</div>
                </div>
                <div>
                  <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Ground</span>
                  <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,.05)' }}>
                    {[false, true].map(v => (
                      <button key={String(v)} onClick={() => setTranslucent(v)} className="flex-1 py-1 rounded-md text-[10.5px] font-bold"
                        style={{ background: translucent === v ? 'rgba(208,188,255,.2)' : 'transparent', color: translucent === v ? LILAC : 'rgba(255,255,255,.55)' }}>{v ? 'Translucent' : 'Solid'}</button>
                    ))}
                  </div>
                  <div className="text-[9px] text-white/35 mt-1">{translucent ? 'Lets the background layer show through.' : 'Paints its own full ground.'}</div>
                </div>
                <div>
                  <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Blend</span>
                  <select value={bgBlend} onChange={e => setBgBlend(e.target.value as BlendMode)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10.5px] text-white/85"
                    title="How the template's background art composes onto the generator, video or picture beneath. Text stays normal.">
                    {BLEND_MODES.map(m => <option key={m} value={m}>{m === 'normal' ? 'Normal' : m.replace('-', ' ')}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-[9.5px] text-white/50 mt-1">Opacity
                    <input type="range" min={0} max={1} step={0.05} value={bgOpacity} onChange={e => setBgOpacity(Number(e.target.value))} className="flex-1 accent-[#D0BCFF] h-1" />
                    <span className="font-mono w-7">{Math.round(bgOpacity * 100)}%</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
              <div className="text-[10px] min-w-0 truncate" style={{ color: flash ? CYAN : 'rgba(255,255,255,.4)' }}>
                {flash ? <span className="inline-flex items-center gap-1"><Check size={12} />{flash}</span> : onInsert ? `Inserts after the selected slide in ${activeShowTitle || 'the active show'}` : 'Open a show to insert slides'}
              </div>
              <button onClick={insert} disabled={!onInsert} className="ml-auto h-9 px-4 rounded-lg text-[12px] font-extrabold flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${LILAC}, ${CYAN})`, color: '#0b0a12' }}><Plus size={14} />Insert slide</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Compact entry point for the Shows tab: a button that opens the gallery. */
export const AmboSlideTemplateEntry: React.FC<{ onInsert?: (slide: Slide) => void; activeShowTitle?: string }> = ({ onInsert, activeShowTitle }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full mt-2 flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all hover:brightness-110"
        style={{ background: 'linear-gradient(135deg, rgba(208,188,255,.16), rgba(0,218,243,.10))', border: '1px solid rgba(208,188,255,.28)', color: LILAC }}>
        <LayoutTemplate size={14} />New slide from template
      </button>
      <AmboSlideTemplateGallery open={open} onClose={() => setOpen(false)} onInsert={onInsert} activeShowTitle={activeShowTitle} />
    </>
  );
};

export default AmboSlideTemplateGallery;
