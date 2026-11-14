// AmboOutputFitControl — "Fit" on the audio bar.
//
// Each bus's own format: match its display or a fixed ratio / resolution of any shape, and how a
// fixed format sits on a screen of another shape. Then, what to do with media whose aspect ratio is not the output's: letterbox it (and fill the
// bars with a blurred or abstract version of the picture, a colour, or black), fill the whole
// screen, or stretch. Plus alignment, zoom and shift of the media, and placement of the whole
// output (shrink + align it on the screen). Applies to one output or all of them; the Program
// monitors in the studio mirror the Program output, so changes are visible immediately.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Frame, X } from 'lucide-react';
import type { AmboOutput } from '../../services/ambo/outputRouter';
import { ALIGN_PRESETS, normalizeFit, type FitSpec } from '../../services/ambo/outputFit';
import { ASPECT_PRESETS, aspectLabel, busSize, parseAspect, setBusAspect, setBusResolution, type DisplayScale } from '../../services/ambo/busFormat';
import type { TransformSpec } from '../../services/ambo/showModel';

interface Props {
  outputs: AmboOutput[];
  setOutputs: React.Dispatch<React.SetStateAction<AmboOutput[]>>;
}

const MODES: Array<[FitSpec['mode'], string, string]> = [
  ['fill', 'Full fill', 'Cover the whole screen; the edges are cropped'],
  ['auto', 'Auto letterbox', 'Fit inside the screen, never crop — bars only when the shape differs'],
  ['stretch', 'Stretch', 'Distort to the screen'],
];
const FILLS: Array<[FitSpec['fill'], string, string]> = [
  ['blur', 'Blur', 'A soft, enlarged copy of the picture behind it'],
  ['abstract', 'Abstract', 'Slow colour fields drawn from the picture’s own palette'],
  ['black', 'Black', 'Plain black bars'],
  ['color', 'Colour', 'A colour of your choice'],
];

const SCALES: Array<[DisplayScale, string, string]> = [
  ['fit', 'Fit', 'Show the whole format; bars where the screen is another shape'],
  ['fill', 'Fill', 'Cover the screen; the edges of the format are cropped'],
  ['stretch', 'Stretch', 'Distort the format to the screen'],
];

/** Edits locally and commits on blur / Enter, so typing '32:9' never passes through '3:9'. */
const Commit: React.FC<{ value: string; placeholder?: string; label: string; width: string; onCommit: (v: string) => boolean | void }> = ({ value, placeholder, label, width, onCommit }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text !== value && onCommit(text) === false) setText(value); };
  return (
    <input value={text} placeholder={placeholder} aria-label={label} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      className="h-6 rounded bg-white/5 border border-white/15 px-1.5 font-mono text-[10px] text-white outline-none focus:border-[#00DAF3]/60" style={{ width }} />
  );
};

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string, string]>; onChange: (v: T) => void }) => (
  <div className="flex flex-wrap gap-1">
    {options.map(([v, label, hint]) => (
      <button key={v} onClick={() => onChange(v)} title={hint}
        className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${value === v ? 'text-[#00DAF3] bg-[#00DAF3]/15 border-[#00DAF3]/40' : 'text-white/60 border-white/10 hover:text-white hover:bg-white/5'}`}>{label}</button>
    ))}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start gap-2">
    <span className="w-[68px] flex-none pt-1 text-[9px] font-extrabold uppercase tracking-wider text-white/40">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

const AlignGrid: React.FC<{ ax: number; ay: number; onPick: (ax: number, ay: number) => void }> = ({ ax, ay, onPick }) => (
  <div className="grid grid-cols-3 gap-0.5 w-[66px]">
    {ALIGN_PRESETS.map(a => (
      <button key={a.id} onClick={() => onPick(a.ax, a.ay)} title={a.label}
        className={`h-[20px] rounded-sm border ${Math.abs(a.ax - ax) < 0.01 && Math.abs(a.ay - ay) < 0.01 ? 'bg-[#00DAF3] border-[#00DAF3]' : 'bg-white/5 border-white/15 hover:bg-white/15'}`} />
    ))}
  </div>
);

const Slider: React.FC<{ value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }> = ({ value, min, max, step, fmt, onChange }) => (
  <div className="flex items-center gap-2">
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="flex-1 accent-[#00DAF3]" />
    <span className="w-10 text-right font-mono text-[10px] text-white/70">{fmt(value)}</span>
  </div>
);

/** Whole-output placement as a normalised rect, from a scale and an anchor. */
const placementOf = (t?: TransformSpec): { s: number; ax: number; ay: number } => {
  const r = t?.rect;
  if (!r || r.w >= 0.999) return { s: 1, ax: 0.5, ay: 0.5 };
  const ax = r.w >= 1 ? 0.5 : r.x / (1 - r.w), ay = r.h >= 1 ? 0.5 : r.y / (1 - r.h);
  return { s: r.w, ax: Math.min(1, Math.max(0, ax)), ay: Math.min(1, Math.max(0, ay)) };
};
const rectFor = (s: number, ax: number, ay: number) => ({ x: (1 - s) * ax, y: (1 - s) * ay, w: s, h: s });

const AmboOutputFitControl: React.FC<Props> = ({ outputs, setOutputs }) => {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>('ALL');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const first = target === 'ALL' ? (outputs.find(o => o.kind === 'PROGRAM') ?? outputs[0]) : outputs.find(o => o.id === target);
  const fit = { ...normalizeFit(first?.fit), mode: first?.fit?.mode ?? 'fill' };
  const size = busSize(first);
  const auto = first?.autoDetectDisplay !== false;
  const label = aspectLabel(size.w, size.h);
  const place = placementOf(first?.transform);

  const apply = (fn: (o: AmboOutput) => AmboOutput) =>
    setOutputs(prev => prev.map(o => (target === 'ALL' || o.id === target) ? fn(o) : o));
  const setFit = (patch: Partial<FitSpec>) => apply(o => ({ ...o, fit: normalizeFit({ ...normalizeFit(o.fit), mode: o.fit?.mode ?? 'fill', ...patch }) }));
  const setFormat = (patch: Partial<AmboOutput> | null) => { if (!patch) return false; apply(o => ({ ...o, ...patch })); return true; };
  const setPlace = (s: number, ax: number, ay: number) =>
    apply(o => ({ ...o, transform: s >= 0.999 ? { ...(o.transform || {}), rect: undefined } : { ...(o.transform || {}), rect: rectFor(s, ax, ay) } }));
  const reset = () => apply(o => ({ ...o, fit: undefined, displayScale: undefined, autoDetectDisplay: true, transform: { ...(o.transform || {}), rect: undefined } }));

  const changed = outputs.some(o => o.fit && JSON.stringify(normalizeFit(o.fit)) !== JSON.stringify(normalizeFit({ mode: 'fill' })))
    || outputs.some(o => o.transform?.rect || o.autoDetectDisplay === false);

  const panel = open ? createPortal(
    <div ref={panelRef} className="fixed z-[10000] w-[420px] max-w-[calc(100vw-24px)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: 'rgba(14,11,22,0.98)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)', ...anchorPos(btnRef.current) }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Frame size={14} className="text-[#00DAF3]" />
        <div className="text-[11px] font-bold text-white">Bus format, fit &amp; position</div>
        <div className="flex-1" />
        <button onClick={reset} className="px-2 py-0.5 rounded text-[9.5px] font-bold text-white/60 hover:text-white hover:bg-white/10">Reset</button>
        <button onClick={() => setOpen(false)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close"><X size={13} /></button>
      </div>
      <div className="p-3 flex flex-col gap-2.5 max-h-[72vh] overflow-y-auto">
        <Row label="Output">
          <select value={target} onChange={e => setTarget(e.target.value)} className="w-full h-7 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-2">
            <option value="ALL" className="bg-[#14101e]">All outputs</option>
            {outputs.map(o => <option key={o.id} value={o.id} className="bg-[#14101e]">{o.name || o.kind}</option>)}
          </select>
        </Row>
        <Row label="Aspect">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1" data-bus-aspects>
              <button onClick={() => setFormat({ autoDetectDisplay: true })} title="Fill whatever display this bus is on, at that display's own size and shape"
                className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${auto ? 'text-[#00DAF3] bg-[#00DAF3]/15 border-[#00DAF3]/40' : 'text-white/60 border-white/10 hover:text-white hover:bg-white/5'}`}>Match display</button>
              {ASPECT_PRESETS.map(r => (
                <button key={r} onClick={() => setFormat(setBusAspect(r))}
                  className={`px-2 py-1 rounded-md font-mono text-[10px] font-bold border transition-all ${!auto && label === r ? 'text-[#00DAF3] bg-[#00DAF3]/15 border-[#00DAF3]/40' : 'text-white/60 border-white/10 hover:text-white hover:bg-white/5'}`}>{r}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-white/50">
              Custom
              <Commit value={auto ? '' : label} placeholder="W:H" label="Custom aspect ratio" width="72px"
                onCommit={v => (parseAspect(v) ? setFormat(setBusAspect(v)) : false)} />
            </label>
          </div>
        </Row>
        <Row label="Resolution">
          <div className="flex items-center gap-1.5 text-[10px] text-white/50">
            <Commit value={String(size.w)} label="Width in pixels" width="58px" onCommit={v => setFormat(setBusResolution(Number(v), size.h))} />
            ×
            <Commit value={String(size.h)} label="Height in pixels" width="58px" onCommit={v => setFormat(setBusResolution(size.w, Number(v)))} />
            <span className="font-mono text-white/40">{auto ? 'from display' : label}</span>
          </div>
        </Row>
        {!auto && <Row label="On screen"><Seg value={first?.displayScale ?? 'fit'} options={SCALES} onChange={displayScale => setFormat({ displayScale })} /></Row>}
        <Row label="Media fit"><Seg value={fit.mode} options={MODES} onChange={mode => setFit({ mode })} /></Row>
        {fit.mode === 'auto' && (
          <Row label="Bar fill">
            <div className="flex flex-col gap-1.5">
              <Seg value={fit.fill} options={FILLS} onChange={fill => setFit({ fill })} />
              {fit.fill === 'color' && <input type="color" value={fit.color || '#000000'} onChange={e => setFit({ color: e.target.value })} className="h-6 w-14 rounded border border-white/15 bg-transparent" />}
            </div>
          </Row>
        )}
        <Row label="Align media"><AlignGrid ax={fit.ax} ay={fit.ay} onPick={(ax, ay) => setFit({ ax, ay })} /></Row>
        <Row label="Zoom"><Slider value={fit.zoom} min={0.5} max={2} step={0.01} fmt={v => `${Math.round(v * 100)}%`} onChange={zoom => setFit({ zoom })} /></Row>
        <Row label="Shift X"><Slider value={fit.ox} min={-0.5} max={0.5} step={0.005} fmt={v => `${Math.round(v * 100)}%`} onChange={ox => setFit({ ox })} /></Row>
        <Row label="Shift Y"><Slider value={fit.oy} min={-0.5} max={0.5} step={0.005} fmt={v => `${Math.round(v * 100)}%`} onChange={oy => setFit({ oy })} /></Row>

        <div className="border-t border-white/10 pt-2 flex flex-col gap-2.5">
          <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Whole output</div>
          <Row label="Size"><Slider value={place.s} min={0.4} max={1} step={0.01} fmt={v => `${Math.round(v * 100)}%`} onChange={s => setPlace(s, place.ax, place.ay)} /></Row>
          <Row label="Position"><AlignGrid ax={place.ax} ay={place.ay} onPick={(ax, ay) => setPlace(place.s, ax, ay)} /></Row>
        </div>
        <p className="text-[9.5px] text-white/40 leading-snug">
          Each bus has its own format and fit. Only images, video, live feeds and Lottie are fitted — generators, text, scripture and templates already re-flow to each output.
          The bar fill shows behind background media.
        </p>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 ${changed ? 'text-black bg-[#00DAF3] border-[#00DAF3]' : open ? 'text-[#00DAF3] bg-[#00DAF3]/15 border-[#00DAF3]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
        title="Each bus's aspect ratio, resolution and scaling; fill, letterbox, align and reposition media">
        <Frame size={11} /> Fit
      </button>
      {panel}
    </>
  );
};

function anchorPos(el: HTMLElement | null): React.CSSProperties {
  if (!el || typeof window === 'undefined') return { right: 12, bottom: 60 };
  const r = el.getBoundingClientRect();
  const right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - 432));
  return r.top > window.innerHeight / 2 ? { right, bottom: window.innerHeight - r.top + 8 } : { right, top: r.bottom + 8 };
}

export default AmboOutputFitControl;
