// AmboScriptureLook — pick how scripture looks and arrives.
//
// A live preview loops the chosen layout in → hold → out with the chosen
// transition, at any standard format (so the operator can see it re-flow for
// a 32:9 wall or a vertical stream); the gallery shows every layout grouped
// by family. Choices are stamped onto scripture as it goes on air.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X, Check, Play, Save } from 'lucide-react';
import {
  SCRIPTURE_LAYOUTS, SCRIPTURE_TRANSITIONS, SCRIPTURE_FORMATS, SAMPLE_SCRIPTURE,
  renderScripture, scriptureLayoutById, transitionById, type ScriptureLayout, type LayoutFamily,
} from '../../services/ambo/scriptureLayouts';
import { getScriptureLook, setScriptureLook, subscribeScriptureLook, BLEND_MODES, type BlendMode } from '../../services/ambo/scriptureLook';
import { TypoScriptureBackground } from '../../services/ambo/typoScriptureBackground';
import { chapterContextFor } from '../../services/ambo/scriptureContext';
import { thumbFromCanvas, type SavedTemplate } from '../../services/ambo/templateLibrary';
import { LibraryTabBar, SavedTemplateGrid, useTemplateLibrary, type LibTab } from './AmboTemplateLibraryTabs';
import { AmboSaveTemplateDialog, type TemplatePayload } from './AmboSaveTemplateDialog';

const FAMILIES: LayoutFamily[] = ['Opaque', 'Transparent', 'Panel', 'Overlay', 'Art Council', 'Modern & Abstract', 'Urban & Grunge', 'Typographic'];

/** Second (public-domain) verse so the preview can show a text-only verse change. */
const SECOND_VERSE = { text: 'Then shall ye call upon me, and ye shall go and pray unto me, and I will hearken unto you.', reference: 'Jeremiah 29:12', translation: 'KJV' };

/** Reusable offscreen canvases for the blend preview (never allocate per frame). */
const partCanvases: HTMLCanvasElement[] = [];
function partCanvas(i: number, w: number, h: number): HTMLCanvasElement {
  let c = partCanvases[i];
  if (!c) { c = document.createElement('canvas'); partCanvases[i] = c; }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
const ACCENTS = ['#D4AF37', '#F5C542', '#FF8C00', '#FF6FD8', '#B07CFF', '#4C8DFF', '#00DAF3', '#2BE0A8', '#FFFFFF'];

/** Checkerboard-ish stage behind transparent layouts so they read in previews. */
function stageBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b3a55'); g.addColorStop(0.5, '#4a3b5e'); g.addColorStop(1, '#2a4a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) { const x = ((i * 0.19 + t * 0.01) % 1) * w; ctx.beginPath(); ctx.arc(x, h * (0.3 + (i % 3) * 0.2), h * 0.18, 0, Math.PI * 2); ctx.fill(); }
}

const Thumb: React.FC<{ layout: ScriptureLayout; selected: boolean; onPick: () => void; accent: string }> = ({ layout, selected, onPick, accent }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1280, H = 720;
    const big = document.createElement('canvas'); big.width = W; big.height = H;
    const b = big.getContext('2d')!;
    if (layout.background === 'transparent') stageBackdrop(b, W, H, 0);
    renderScripture(b, layout.id, { w: W, h: H, t: 4, ...SAMPLE_SCRIPTURE, accent, enterP: 1, exitP: 0, transition: 'crossfade' });
    c.width = 320; c.height = 180;
    c.getContext('2d')!.drawImage(big, 0, 0, 320, 180);
  }, [layout, accent]);
  return (
    <button onClick={onPick} title={layout.blurb}
      className={`text-left rounded-lg overflow-hidden border transition-all ${selected ? 'border-[#D0BCFF] ring-2 ring-[#D0BCFF]/40' : 'border-white/10 hover:border-white/30'}`}>
      <canvas ref={ref} className="w-full aspect-video block" />
      <div className="px-1.5 py-1 bg-black/40">
        <div className="text-[10px] font-bold text-white truncate flex items-center gap-1">{selected && <Check size={10} className="text-[#D0BCFF]" />}{layout.name}</div>
        <div className="text-[8.5px] text-white/45 truncate">{layout.director ? `${layout.director} · Art Council` : layout.background === 'transparent' ? 'Transparent — over picture' : 'Opaque'}</div>
      </div>
    </button>
  );
};

export const AmboScriptureLook: React.FC = () => {
  const look = useSyncExternalStore(subscribeScriptureLook, getScriptureLook);
  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState('hd');
  const [replay, setReplay] = useState(0);
  const fmt = SCRIPTURE_FORMATS.find(f => f.id === formatId) ?? SCRIPTURE_FORMATS[0];
  const layout = scriptureLayoutById(look.layoutId);
  const tr = transitionById(look.transition);
  const vt = transitionById(look.verseTransition);
  const prevRef = useRef<HTMLCanvasElement>(null);
  // Saved looks: My looks / Shared / Community.
  const lib = useTemplateLibrary('scripture-look', open);
  const [lookTab, setLookTab] = useState<LibTab>('mine');
  const [saveOpen, setSaveOpen] = useState(false);
  const [appliedId, setAppliedId] = useState<string | undefined>();
  const applyLook = (t: SavedTemplate) => {
    const l = t.look; if (!l?.layoutId) return;
    const patch: Partial<typeof look> = { layoutId: scriptureLayoutById(l.layoutId).id };
    if (l.transition) patch.transition = transitionById(l.transition).id;
    if (l.verseTransition) patch.verseTransition = transitionById(l.verseTransition).id;
    if (l.accent && /^#[0-9a-f]{3,8}$/i.test(l.accent)) patch.accent = l.accent;
    if (l.bgBlend && (BLEND_MODES as readonly string[]).includes(l.bgBlend)) patch.bgBlend = l.bgBlend as BlendMode;
    if (typeof l.bgOpacity === 'number' && isFinite(l.bgOpacity)) patch.bgOpacity = Math.min(1, Math.max(0, l.bgOpacity));
    setScriptureLook(patch);
    setAppliedId(t.id);
    setReplay(r => r + 1);
  };
  /** Snapshot the current look + a settled-frame thumbnail (same renderer as the gallery tiles). */
  const buildLook = (): TemplatePayload => {
    let thumb: string | undefined;
    try {
      const W = 960, H = 540;
      const big = document.createElement('canvas'); big.width = W; big.height = H;
      const b = big.getContext('2d');
      if (b) {
        if (layout.background === 'transparent' || look.bgBlend !== 'normal' || look.bgOpacity < 1) stageBackdrop(b, W, H, 0);
        else { b.fillStyle = '#000'; b.fillRect(0, 0, W, H); }
        renderScripture(b, layout.id, { w: W, h: H, t: 4, ...SAMPLE_SCRIPTURE, accent: look.accent, enterP: 1, exitP: 0, transition: 'crossfade' });
        thumb = thumbFromCanvas(big, 480);
      }
    } catch { /* tile without thumb */ }
    return { look: { layoutId: look.layoutId, transition: look.transition, verseTransition: look.verseTransition, accent: look.accent, bgBlend: look.bgBlend, bgOpacity: look.bgOpacity }, thumb };
  };

  // Live preview: in → hold → out → gap, looping, at the chosen format.
  useEffect(() => {
    if (!open) return;
    const c = prevRef.current; if (!c) return;
    const k = Math.min(1, 1280 / Math.max(fmt.w, fmt.h));
    const W = Math.round(fmt.w * k), H = Math.round(fmt.h * k);
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const typo = layout.typoVolume ? new TypoScriptureBackground(W, H, layout.typoVolume, SAMPLE_SCRIPTURE.text) : null;
    const hold = 3.2, gap = 0.6, cycle = tr.inSec + hold + tr.outSec + gap;
    const t0 = performance.now();
    // Same as on air: background woven from the rest of the chapter (Lectio),
    // on a motion clock that speeds up through the transitions.
    let context: string[] | undefined;
    void chapterContextFor(SAMPLE_SCRIPTURE.reference, SAMPLE_SCRIPTURE.translation).then(c => { if (c) context = c.others.map(v => `${v.verse} ${v.text}`); });
    let mt = 0, rate = 1, last = performance.now();
    const draw = () => {
      const now = performance.now();
      const t = (now - t0) / 1000;
      const ct = t % cycle;
      const enterP = Math.min(1, ct / tr.inSec);
      const exitP = ct > tr.inSec + hold ? Math.min(1, (ct - tr.inSec - hold) / tr.outSec) : 0;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      rate += (1 + 3 * (1 - enterP) + 3 * exitP - rate) * Math.min(1, dt * 6); mt += dt * rate;
      const blending = look.bgBlend !== 'normal' || look.bgOpacity < 1;
      ctx.clearRect(0, 0, W, H);
      // Stand-in for what's beneath (generator / camera) when the look is transparent or blending.
      if (layout.background === 'transparent' || blending) stageBackdrop(ctx, W, H, t); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      if (ct < tr.inSec + hold + tr.outSec) {
        // Mid-hold the verse changes: only the text transitions, the background stays.
        const swapAt = tr.inSec + hold * 0.45, swapLen = Math.max(0.35, vt.inSec * 0.8);
        const swapping = ct >= swapAt && ct < swapAt + swapLen;
        const second = ct >= swapAt;
        const verseA = SAMPLE_SCRIPTURE, verseB = SECOND_VERSE;
        const base = { w: W, h: H, t, ...(second ? verseB : verseA), accent: look.accent, enterP, exitP, transition: tr.id, typoFrame: typo?.frame() ?? null, context, mt };
        const sp = swapping ? (ct - swapAt) / swapLen : 1;
        const drawText = (c: CanvasRenderingContext2D, deco: number | undefined) => {
          if (swapping) {
            renderScripture(c, layout.id, { ...base, decoP: deco ?? 1, enterP: sp, exitP: 0, transition: vt.id });
            renderScripture(c, layout.id, { ...base, ...verseA, decoP: 0, enterP: 1, exitP: sp, transition: vt.id });
          } else renderScripture(c, layout.id, deco === undefined ? base : { ...base, decoP: deco });
        };
        if (!blending) drawText(ctx, undefined);
        else {
          const bg = partCanvas(0, W, H), fg = partCanvas(1, W, H);
          const b = bg.getContext('2d')!, f = fg.getContext('2d')!;
          b.clearRect(0, 0, W, H); f.clearRect(0, 0, W, H);
          renderScripture(b, layout.id, { ...base, noText: true });
          drawText(f, 0);
          ctx.save(); ctx.globalCompositeOperation = (look.bgBlend === 'normal' ? 'source-over' : look.bgBlend) as GlobalCompositeOperation; ctx.globalAlpha = look.bgOpacity; ctx.drawImage(bg, 0, 0); ctx.restore();
          ctx.drawImage(fg, 0, 0);
        }
      }
    };
    draw();
    const id = setInterval(draw, 33); // interval, not rAF — keeps running in background panes
    return () => { clearInterval(id); typo?.dispose(); };
  }, [open, fmt, layout, tr, vt, look.accent, look.bgBlend, look.bgOpacity, replay]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  const groups = useMemo(() => FAMILIES.map(f => ({ f, items: SCRIPTURE_LAYOUTS.filter(l => l.family === f) })), []);
  const formatGroups = useMemo(() => [...new Set(SCRIPTURE_FORMATS.map(f => f.group))], []);

  const panel = open ? createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="w-[min(1180px,100%)] max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(14,11,22,0.98)', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
          <BookOpen size={15} className="text-[#D4AF37]" />
          <div className="text-[12px] font-bold text-white">Scripture Look</div>
          <div className="text-[10px] text-white/40">Applies to every screen; each output re-flows the layout for its own shape.</div>
          <div className="flex-1" />
          <button onClick={() => setOpen(false)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close"><X size={14} /></button>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-0">
          {/* preview + transition + format */}
          <div className="p-4 flex flex-col gap-3 border-r border-white/10 min-h-0 overflow-y-auto">
            <div className="rounded-xl border border-white/10 bg-black grid place-items-center" style={{ height: 330 }}>
              <canvas ref={prevRef} style={{ maxWidth: '100%', maxHeight: 320, aspectRatio: `${fmt.w} / ${fmt.h}` }} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/55">
              <span className="font-bold text-white">{layout.name}</span>
              <span>· {tr.name}</span>
              <span>· {fmt.label} ({fmt.w}×{fmt.h})</span>
              <div className="flex-1" />
              <button onClick={() => setReplay(r => r + 1)} className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 font-bold flex items-center gap-1"><Play size={10} /> Replay</button>
              <button onClick={() => setSaveOpen(true)} data-save-look className="px-2 py-1 rounded-md bg-[#D0BCFF]/10 hover:bg-[#D0BCFF]/20 border border-[#D0BCFF]/30 text-[#D0BCFF] font-bold flex items-center gap-1" title="Save this layout, transitions, accent and blend as one of your looks"><Save size={10} /> Save look</button>
            </div>
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Preview format</div>
              {formatGroups.map(g => (
                <div key={g} className="flex flex-wrap items-center gap-1 mb-1">
                  <span className="text-[9px] text-white/35 w-24">{g}</span>
                  {SCRIPTURE_FORMATS.filter(f => f.group === g).map(f => (
                    <button key={f.id} onClick={() => setFormatId(f.id)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] border ${formatId === f.id ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/50 text-[#D0BCFF] font-bold' : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'}`}>{f.label}</button>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Transition — plays when scripture comes up from clear, and when it’s cleared</div>
              <div className="grid grid-cols-2 gap-1.5">
                {SCRIPTURE_TRANSITIONS.map(t => (
                  <button key={t.id} onClick={() => { setScriptureLook({ transition: t.id }); setReplay(r => r + 1); }}
                    className={`text-left px-2 py-1.5 rounded-lg border transition-all ${look.transition === t.id ? 'border-[#D0BCFF]/50 bg-[#D0BCFF]/12' : 'border-white/10 hover:bg-white/5'}`}>
                    <div className="text-[10.5px] font-bold text-white flex items-center gap-1">{look.transition === t.id && <Check size={10} className="text-[#D0BCFF]" />}{t.name}{t.id === 'crossfade' && <span className="text-[8px] text-white/40 font-normal">default</span>}</div>
                    <div className="text-[9px] text-white/45 leading-snug">{t.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Verse change — text only; the background stays up</div>
              <div className="flex flex-wrap gap-1">
                {SCRIPTURE_TRANSITIONS.filter(t => t.id !== 'reference').map(t => (
                  <button key={t.id} onClick={() => { setScriptureLook({ verseTransition: t.id }); setReplay(r => r + 1); }} title={t.blurb}
                    className={`px-2 py-1 rounded-md text-[10px] border ${look.verseTransition === t.id ? 'border-[#D0BCFF]/50 bg-[#D0BCFF]/12 text-white font-bold' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                    {t.name}{t.id === 'crossfade' ? ' (default)' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Background blend</span>
              <select value={look.bgBlend} onChange={e => setScriptureLook({ bgBlend: e.target.value as BlendMode })}
                className="bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[10.5px] text-white/85" title="How the look's background art composes onto the generator, video or picture beneath it. The verse itself always stays normal.">
                {BLEND_MODES.map(m => <option key={m} value={m}>{m === 'normal' ? 'Normal (opaque art)' : m.replace('-', ' ')}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[10px] text-white/60">Opacity
                <input type="range" min={0} max={1} step={0.05} value={look.bgOpacity} onChange={e => setScriptureLook({ bgOpacity: Number(e.target.value) })} className="w-24 accent-[#D0BCFF] h-1" />
                <span className="font-mono w-8">{Math.round(look.bgOpacity * 100)}%</span>
              </label>
              <span className="text-[9px] text-white/35 basis-full">Multiply / overlay / soft light keep reading plates dark; screen / lighten brighten them.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mr-1">Accent</span>
              {ACCENTS.map(c => (
                <button key={c} onClick={() => setScriptureLook({ accent: c })} title={c} className="w-5 h-5 rounded-full"
                  style={{ background: c, boxShadow: look.accent === c ? `0 0 0 2px #0e0b16, 0 0 0 4px ${c}` : 'none' }} />
              ))}
            </div>
          </div>
          {/* gallery */}
          <div className="p-4 min-h-0 overflow-y-auto flex flex-col gap-3">
            <div className="rounded-xl p-2 border border-white/10 bg-white/[0.02]" data-saved-looks>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Saved looks</span>
                <LibraryTabBar tab={lookTab} onTab={setLookTab} lib={lib} size="sm" tabs={['mine', 'shared', 'community']} labels={{ mine: 'My looks', shared: 'Shared' }} />
              </div>
              {lookTab !== 'platform' && (
                <SavedTemplateGrid tab={lookTab} lib={lib} compact noun="looks" selectedId={appliedId} onOpen={applyLook}
                  shareWhere="Ambo → Scripture Look → Saved looks → Shared"
                  subtitle={t => `${t.look ? scriptureLayoutById(t.look.layoutId).name : 'Look'}${t.look?.transition ? ' · ' + transitionById(t.look.transition).name : ''}`} />
              )}
            </div>
            {groups.map(({ f, items }) => (
              <div key={f}>
                <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-1.5">{f}{f === 'Typographic' ? ' — the verse’s type is the art; the verse reads on a plate' : f === 'Art Council' ? ' — full pages by the council' : ''}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {items.map(l => <Thumb key={l.id} layout={l} accent={look.accent} selected={look.layoutId === l.id} onPick={() => { setScriptureLook({ layoutId: l.id }); setReplay(r => r + 1); }} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Portalled, but React events still bubble to the backdrop's close handler — stop them here. */}
      <div className="contents" onClick={e => e.stopPropagation()}>
      <AmboSaveTemplateDialog open={saveOpen} onClose={() => setSaveOpen(false)} kind="scripture-look" defaultName={`${layout.name} · ${tr.name}`}
        build={buildLook} onSaved={rec => { setAppliedId(rec.id); setLookTab('mine'); }} shareWhere="Ambo → Scripture Look → Saved looks → Shared" />
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 flex items-center gap-1 flex-none"
        title="Choose the scripture layout, transition and accent">
        <BookOpen size={11} /> Look: {layout.name}
      </button>
      {panel}
    </>
  );
};

export default AmboScriptureLook;
