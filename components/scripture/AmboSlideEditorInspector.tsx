// AmboSlideEditorInspector — the properties panel of the slide editor.
// Pure presentation: every change goes back through `update` / `setLayerContent`, which the
// editor turns into Tela ops (so undo/redo covers it).
import React from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Maximize, FlipHorizontal2,
} from 'lucide-react';
import type { TelaVectorObject, TelaGradientPaint } from '../../types';
import type { LayerContent } from '../../services/ambo/showModel';
import { FONTS, fontCss, ensureFontsLoaded, type FontKey } from '../../services/tela/telaFonts';
import { GENERATOR_ITEMS } from '../../services/ambo/mediaLibrary';
import { amboRecord, isPromotable } from '../../services/ambo/telaSlide';
import { templateById } from '../../services/ambo/slideTemplates/registry';

const line = 'rgba(255,255,255,0.09)';
const CYAN = '#00DAF3';
const LILAC = '#D0BCFF';

export type Patch = Partial<TelaVectorObject> | ((o: TelaVectorObject) => Partial<TelaVectorObject>);
export type BackgroundSpec =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | { type: 'content'; content: LayerContent };

export interface BackgroundInfo { label: string; type: 'none' | 'solid' | 'gradient' | 'image' | 'video' | 'generator' | 'shader' | 'live' | 'other'; color?: string }

export interface InspectorProps {
  selected: TelaVectorObject[];
  slideLabel: string;
  onSlideLabel: (v: string) => void;
  background: BackgroundInfo;
  onSetBackground: (spec: BackgroundSpec) => void;
  /** Ask the host for a local image/video file; resolves to a usable URL (or null). */
  pickFile: (accept: string) => Promise<string | null>;
  update: (ids: string[], patch: Patch, coalesceKey?: string) => void;
  setLayerContent: (id: string, fn: (c: LayerContent) => LayerContent, coalesceKey?: string) => void;
  /** Replace the text of the selected text objects with bullets / numbers. */
  listify: (mode: 'bullet' | 'number' | 'none') => void;
}

const field = 'w-full bg-white/5 border outline-none rounded px-2 py-1.5 text-[12px] text-white focus:border-[#D0BCFF]';
const lab = 'text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-1';

const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => (
  <details open={defaultOpen} className="border-t pt-3 group" style={{ borderColor: line }}>
    <summary className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-white/55 cursor-pointer select-none mb-2 list-none flex items-center justify-between">
      {title}<span className="text-white/30 group-open:rotate-90 transition-transform">›</span>
    </summary>
    <div className="space-y-3">{children}</div>
  </details>
);

const Num: React.FC<{ label: string; value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }> = ({ label, value, onChange, step = 1, min, max, suffix }) => (
  <label className="block">
    <span className={lab}>{label}</span>
    <div className="relative">
      <input type="number" value={value === undefined || Number.isNaN(value) ? '' : Math.round(value * 1000) / 1000} step={step} min={min} max={max}
        onChange={e => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(max !== undefined ? Math.min(max, min !== undefined ? Math.max(min, v) : v) : v); }}
        className={field} style={{ borderColor: line }} />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">{suffix}</span>}
    </div>
  </label>
);

const Range: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }> = ({ label, value, min, max, step = 1, onChange, fmt }) => (
  <label className="block">
    <span className={`${lab} flex justify-between`}><span>{label}</span><span className="text-white/60 normal-case tracking-normal">{fmt ? fmt(value) : Math.round(value * 100) / 100}</span></span>
    <input type="range" value={value} min={min} max={max} step={step} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-[#D0BCFF]" />
  </label>
);

const Color: React.FC<{ label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }> = ({ label, value, onChange, allowNone }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map(c => c + c).join('') : '#000000';
  return (
    <label className="block">
      <span className={lab}>{label}</span>
      <div className="flex gap-1.5">
        <input type="color" value={hex} onChange={e => onChange(e.target.value)} className="h-[30px] w-10 rounded bg-white/5 border p-0.5 flex-none" style={{ borderColor: line }} aria-label={label} />
        <input type="text" value={value === 'none' ? 'none' : value} onChange={e => onChange(e.target.value)} className={field} style={{ borderColor: line }} spellCheck={false} />
        {allowNone && <button type="button" onClick={() => onChange('none')} className="px-2 text-[10px] rounded border text-white/60 hover:text-white" style={{ borderColor: line }} title="No colour">∅</button>}
      </div>
    </label>
  );
};

const Seg: React.FC<{ value: string | undefined; options: Array<{ id: string; label: React.ReactNode; title: string }>; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="flex rounded overflow-hidden border" style={{ borderColor: line }} role="group">
    {options.map(o => (
      <button key={o.id} type="button" title={o.title} aria-label={o.title} aria-pressed={value === o.id} onClick={() => onChange(o.id)}
        className="flex-1 h-8 grid place-items-center text-[11px] text-white/70 hover:bg-white/10" style={value === o.id ? { background: 'rgba(208,188,255,.22)', color: '#fff' } : undefined}>{o.label}</button>
    ))}
  </div>
);

const Toggle: React.FC<{ on: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ on, onClick, title, children }) => (
  <button type="button" onClick={onClick} title={title} aria-label={title} aria-pressed={on} className="h-8 w-8 grid place-items-center rounded border text-white/70 hover:bg-white/10"
    style={{ borderColor: line, ...(on ? { background: 'rgba(208,188,255,.22)', color: '#fff' } : {}) }}>{children}</button>
);

const WEIGHTS = [[100, 'Thin'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']] as const;
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];
const FONT_KEYS = Object.keys(FONTS) as FontKey[];
const FONT_CLASSES: Record<string, FontKey[]> = {};
for (const k of FONT_KEYS) (FONT_CLASSES[(FONTS as any)[k].class] ||= []).push(k);

const Fonts: React.FC<{ value: string | undefined; onChange: (css: string) => void }> = ({ value, onChange }) => {
  const key = FONT_KEYS.find(k => fontCss(k) === value);
  return (
    <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={key ?? '__custom'} aria-label="Font family"
      onChange={e => { if (e.target.value === '__custom') return; ensureFontsLoaded([e.target.value]); onChange(fontCss(e.target.value)); }}>
      {!key && <option value="__custom">{(value || 'Default').split(',')[0].replace(/["']/g, '')} (current)</option>}
      {Object.entries(FONT_CLASSES).map(([cls, keys]) => (
        <optgroup key={cls} label={cls}>{keys.map(k => <option key={k} value={k} style={{ fontFamily: fontCss(k) }}>{(FONTS as any)[k].family}</option>)}</optgroup>
      ))}
    </select>
  );
};

/** Fill editor: solid / linear / radial. */
const FillEditor: React.FC<{ o: TelaVectorObject; update: InspectorProps['update']; label?: string }> = ({ o, update, label = 'Fill' }) => {
  const g = o.gradient;
  const mode = g ? (g.kind === 'RADIAL' ? 'radial' : 'linear') : 'solid';
  const setMode = (m: string) => {
    if (m === 'solid') { update([o.id], { gradient: undefined }); return; }
    const base = o.fill && o.fill !== 'none' ? o.fill : '#6B0099';
    const stops = g?.stops?.length ? g.stops : [{ offset: 0, color: base }, { offset: 1, color: '#D40055' }];
    update([o.id], { gradient: { kind: m === 'radial' ? 'RADIAL' : 'LINEAR', angle: g?.angle ?? 90, stops } as TelaGradientPaint });
  };
  const stop = (i: number, color: string) => g && update([o.id], { gradient: { ...g, stops: g.stops.map((s, j) => j === i ? { ...s, color } : s) } }, `grad${i}`);
  return (
    <div className="space-y-2">
      <span className={lab}>{label}</span>
      <Seg value={mode} onChange={setMode} options={[{ id: 'solid', label: 'Solid', title: 'Solid colour' }, { id: 'linear', label: 'Linear', title: 'Linear gradient' }, { id: 'radial', label: 'Radial', title: 'Radial gradient' }]} />
      {!g && <Color label="Colour" value={o.fill} onChange={v => update([o.id], { fill: v }, 'fill')} allowNone />}
      {g && <>
        <div className="grid grid-cols-2 gap-2">
          <Color label="From" value={g.stops[0]?.color ?? '#000000'} onChange={v => stop(0, v)} />
          <Color label="To" value={g.stops[g.stops.length - 1]?.color ?? '#ffffff'} onChange={v => stop(g.stops.length - 1, v)} />
        </div>
        {g.kind === 'LINEAR' && <Range label="Angle" value={g.angle ?? 0} min={0} max={360} onChange={v => update([o.id], { gradient: { ...g, angle: v } }, 'gradAngle')} fmt={v => `${Math.round(v)}°`} />}
      </>}
    </div>
  );
};

export const AmboSlideEditorInspector: React.FC<InspectorProps> = (p) => {
  const { selected, update, setLayerContent } = p;

  // ── nothing selected → the slide itself ──────────────────────────────────
  if (!selected.length) {
    return (
      <div className="space-y-4">
        <label className="block">
          <span className={lab}>Slide label</span>
          <input value={p.slideLabel} onChange={e => p.onSlideLabel(e.target.value)} className={field} style={{ borderColor: line }} />
        </label>
        <BackgroundPicker {...p} />
        <div className="text-[11px] text-white/40 leading-relaxed">Click an object to edit it. Shift-click for several. Double-click text to type on the slide. Arrow keys nudge (Shift = 10px). Delete removes.</div>
      </div>
    );
  }

  const ids = selected.map(o => o.id);
  const o = selected[0];
  const multi = selected.length > 1;
  const rec = amboRecord(o);
  const layerKind = rec && !isPromotable(rec.layer) ? rec.layer.content.kind : null;
  const isText = selected.every(s => s.kind === 'TEXT');
  const live = (o as any).live as { drawer: string; props?: Record<string, any> } | undefined;
  const isShape = selected.every(s => s.kind === 'RECT' || s.kind === 'ELLIPSE' || s.kind === 'PATH' || s.kind === 'LINE') && !layerKind && !live;
  const isImage = !multi && o.kind === 'IMAGE';
  const setLive = (props: Record<string, any>) => update([o.id], (cur: any) => ({ live: { ...(cur.live || {}), props: { ...(cur.live?.props || {}), ...props } } } as any), 'liveProps');

  return (
    <div className="space-y-4">
      <div className="text-[12px] font-bold text-white truncate" title={o.objectLabel}>{multi ? `${selected.length} objects` : (o.objectLabel || o.kind)}</div>

      <Section title="Arrange">
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={o.x} onChange={v => update(ids, multi ? (c => ({ x: c.x + (v - o.x) })) : { x: v }, 'x')} suffix="px" />
          <Num label="Y" value={o.y} onChange={v => update(ids, multi ? (c => ({ y: c.y + (v - o.y) })) : { y: v }, 'y')} suffix="px" />
          {!multi && <>
            <Num label="Width" value={o.w} min={1} onChange={v => update(ids, o.kind === 'LINE' ? { w: v, points: [o.x, o.y, o.x + v, o.y + o.h] } : { w: v }, 'w')} suffix="px" />
            <Num label="Height" value={o.h} min={0} onChange={v => update(ids, o.kind === 'LINE' ? { h: v, points: [o.x, o.y, o.x + o.w, o.y + v] } : { h: v }, 'h')} suffix="px" />
            {!layerKind && <Num label="Rotation" value={o.rotation} min={-360} max={360} onChange={v => update(ids, { rotation: v }, 'rot')} suffix="°" />}
          </>}
        </div>
        <Range label="Opacity" value={o.opacity ?? 1} min={0} max={1} step={0.01} onChange={v => update(ids, { opacity: v }, 'opacity')} fmt={v => `${Math.round(v * 100)}%`} />
        {!layerKind && <label className="block"><span className={lab}>Blend</span>
          <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={o.blendMode ?? 'normal'} onChange={e => update(ids, { blendMode: e.target.value as any })}>{BLENDS.map(b => <option key={b}>{b}</option>)}</select></label>}
        {layerKind && <div className="text-[10.5px] text-white/40">This object keeps its own engine; its box scales the whole picture, so it stays 16:9.</div>}
      </Section>

      {isText && (
        <Section title="Text">
          {!multi && <label className="block"><span className={lab}>Content</span>
            <textarea value={o.text ?? ''} rows={4} onChange={e => update([o.id], { text: e.target.value }, 'text')} className={`${field} resize-y font-sans`} style={{ borderColor: line }} aria-label="Text content" /></label>}
          <label className="block"><span className={lab}>Font</span><Fonts value={o.fontFamily} onChange={css => update(ids, { fontFamily: css })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Size" value={o.fontSize} min={6} max={600} onChange={v => update(ids, { fontSize: v }, 'fs')} suffix="px" />
            <label className="block"><span className={lab}>Weight</span>
              <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={o.fontWeight ?? 400} onChange={e => update(ids, { fontWeight: Number(e.target.value) })}>{WEIGHTS.map(([w, n]) => <option key={w} value={w}>{n} {w}</option>)}</select></label>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Toggle on={(o.fontWeight ?? 400) >= 700} title="Bold" onClick={() => update(ids, { fontWeight: (o.fontWeight ?? 400) >= 700 ? 400 : 700 })}><Bold size={14} /></Toggle>
            <Toggle on={o.fontStyle === 'italic'} title="Italic" onClick={() => update(ids, { fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic size={14} /></Toggle>
            <Toggle on={!!o.underline} title="Underline" onClick={() => update(ids, { underline: !o.underline })}><Underline size={14} /></Toggle>
            <Toggle on={!!o.strike} title="Strikethrough" onClick={() => update(ids, { strike: !o.strike })}><Strikethrough size={14} /></Toggle>
            <Toggle on={!!o.autoFit} title="Shrink to fit the box" onClick={() => update(ids, { autoFit: !o.autoFit })}><Maximize size={14} /></Toggle>
            <Toggle on={false} title="Bulleted list" onClick={() => p.listify('bullet')}><List size={14} /></Toggle>
            <Toggle on={false} title="Numbered list" onClick={() => p.listify('number')}><ListOrdered size={14} /></Toggle>
            <Toggle on={false} title="Remove list marks" onClick={() => p.listify('none')}><FlipHorizontal2 size={14} /></Toggle>
          </div>
          <Seg value={o.textAlign ?? 'left'} onChange={v => update(ids, { textAlign: v as any })} options={[
            { id: 'left', label: <AlignLeft size={14} />, title: 'Align left' }, { id: 'center', label: <AlignCenter size={14} />, title: 'Align centre' }, { id: 'right', label: <AlignRight size={14} />, title: 'Align right' }]} />
          <Seg value={o.vAlign ?? 'top'} onChange={v => update(ids, { vAlign: v as any })} options={[
            { id: 'top', label: <AlignVerticalJustifyStart size={14} />, title: 'Align top' }, { id: 'middle', label: <AlignVerticalJustifyCenter size={14} />, title: 'Align middle' }, { id: 'bottom', label: <AlignVerticalJustifyEnd size={14} />, title: 'Align bottom' }]} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Line height" value={o.lineHeight ?? 1.22} step={0.05} min={0.6} max={3} onChange={v => update(ids, { lineHeight: v }, 'lh')} />
            <Num label="Letter spacing %" value={Math.round((o.letterSpacing ?? 0) * 1000) / 10} step={0.5} min={-20} max={100} onChange={v => update(ids, { letterSpacing: v / 100 }, 'ls')} />
          </div>
          <label className="block"><span className={lab}>Case</span>
            <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={o.textTransform ?? 'none'} onChange={e => update(ids, { textTransform: e.target.value as any })}>
              <option value="none">As typed</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="capitalize">Capitalize</option></select></label>
          <FillEditor o={o} update={update} label="Text colour" />
        </Section>
      )}

      {isText && (
        <Section title="Shadow & outline" defaultOpen={false}>
          <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={!!o.shadow} onChange={e => update(ids, { shadow: e.target.checked ? { x: 0, y: 4, blur: 14, color: 'rgba(0,0,0,0.55)' } : undefined })} /> Drop shadow</label>
          {o.shadow && <div className="grid grid-cols-3 gap-2">
            <Num label="X" value={o.shadow.x} onChange={v => update(ids, { shadow: { ...o.shadow!, x: v } }, 'shx')} />
            <Num label="Y" value={o.shadow.y} onChange={v => update(ids, { shadow: { ...o.shadow!, y: v } }, 'shy')} />
            <Num label="Blur" value={o.shadow.blur} min={0} onChange={v => update(ids, { shadow: { ...o.shadow!, blur: v } }, 'shb')} />
            <div className="col-span-3"><Color label="Shadow colour" value={o.shadow.color} onChange={v => update(ids, { shadow: { ...o.shadow!, color: v } }, 'shc')} /></div>
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <Color label="Outline" value={o.stroke} onChange={v => update(ids, { stroke: v }, 'stroke')} allowNone />
            <Num label="Outline width" value={o.strokeWidth} min={0} max={60} onChange={v => update(ids, { strokeWidth: v }, 'sw')} />
          </div>
        </Section>
      )}

      {isShape && (
        <Section title="Shape">
          {o.kind !== 'LINE' && <FillEditor o={o} update={update} />}
          <div className="grid grid-cols-2 gap-2">
            <Color label={o.kind === 'LINE' ? 'Line colour' : 'Stroke'} value={o.stroke} onChange={v => update(ids, { stroke: v }, 'stroke')} allowNone />
            <Num label="Stroke width" value={o.strokeWidth} min={0} max={200} onChange={v => update(ids, { strokeWidth: v }, 'sw')} />
          </div>
          {o.kind === 'RECT' && <Num label="Corner radius" value={o.rx ?? 0} min={0} max={600} onChange={v => update(ids, { rx: v }, 'rx')} suffix="px" />}
          <label className="block"><span className={lab}>Dash</span>
            <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={o.strokeDash?.length ? 'dash' : 'solid'} onChange={e => update(ids, { strokeDash: e.target.value === 'dash' ? [Math.max(8, (o.strokeWidth || 4) * 3), Math.max(6, (o.strokeWidth || 4) * 2)] : undefined })}>
              <option value="solid">Solid</option><option value="dash">Dashed</option></select></label>
          <Range label="Blur" value={o.blur ?? 0} min={0} max={80} onChange={v => update(ids, { blur: v }, 'blur')} fmt={v => `${Math.round(v)}px`} />
          <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={!!o.shadow} onChange={e => update(ids, { shadow: e.target.checked ? { x: 0, y: 10, blur: 28, color: 'rgba(0,0,0,0.45)' } : undefined })} /> Drop shadow</label>
        </Section>
      )}

      {isImage && (
        <Section title="Image">
          <label className="block"><span className={lab}>Fit</span>
            <Seg value={o.imageFit ?? 'cover'} onChange={v => update([o.id], { imageFit: v as any })} options={[{ id: 'cover', label: 'Fill', title: 'Cover — fill the box, crop overflow' }, { id: 'contain', label: 'Fit', title: 'Contain — whole image visible' }, { id: 'fill', label: 'Stretch', title: 'Stretch to the box' }]} /></label>
          <div className="space-y-1">
            <span className={lab}>Crop</span>
            {(['x', 'y', 'w', 'h'] as const).map(k => {
              const c = o.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 };
              return <Range key={k} label={k === 'x' ? 'Left' : k === 'y' ? 'Top' : k === 'w' ? 'Width' : 'Height'} value={c[k]} min={k === 'w' || k === 'h' ? 0.05 : 0} max={1} step={0.01}
                onChange={v => { const n = { ...c, [k]: v }; n.x = Math.min(n.x, 1 - n.w); n.y = Math.min(n.y, 1 - n.h); update([o.id], { imageCrop: n }, `crop${k}`); }} fmt={v => `${Math.round(v * 100)}%`} />;
            })}
            <button type="button" className="text-[11px] underline text-white/50 hover:text-white" onClick={() => update([o.id], { imageCrop: undefined })}>Reset crop</button>
          </div>
          <Num label="Corner radius" value={o.rx ?? 0} min={0} max={600} onChange={v => update([o.id], { rx: v }, 'rx')} suffix="px" />
          <div className="grid grid-cols-2 gap-2">
            <Color label="Border" value={o.stroke} onChange={v => update([o.id], { stroke: v }, 'stroke')} allowNone />
            <Num label="Border width" value={o.strokeWidth} min={0} max={80} onChange={v => update([o.id], { strokeWidth: v }, 'sw')} />
          </div>
          <button type="button" className="w-full h-8 rounded border text-[12px] text-white/80 hover:bg-white/10" style={{ borderColor: line }}
            onClick={async () => { const u = await p.pickFile('image/*'); if (u) update([o.id], { sourceImageSrc: u }); }}>Replace image…</button>
        </Section>
      )}

      {live && (
        <Section title={live.drawer === 'ambo-timer' ? 'Timer' : 'Clock'}>
          {live.drawer === 'ambo-timer' ? <>
            <Num label="Seconds" value={live.props?.seconds ?? 300} min={1} onChange={v => setLive({ seconds: v })} />
            <Seg value={live.props?.mode ?? 'down'} onChange={v => setLive({ mode: v })} options={[{ id: 'down', label: 'Count down', title: 'Count down' }, { id: 'up', label: 'Count up', title: 'Count up' }]} />
            <div className="text-[10.5px] text-white/40">Starts when the slide goes live.</div>
          </> : <label className="block"><span className={lab}>Format</span>
            <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={live.props?.format ?? '12h'} onChange={e => setLive({ format: e.target.value })}>
              <option value="12h">10:30 AM</option><option value="12h-sec">10:30:15 AM</option><option value="24h">22:30</option><option value="24h-sec">22:30:15</option></select></label>}
          <Num label="Size" value={o.fontSize} min={10} max={600} onChange={v => update([o.id], { fontSize: v }, 'fs')} suffix="px" />
          <Color label="Colour" value={o.fill} onChange={v => update([o.id], { fill: v }, 'fill')} />
          <Fonts value={o.fontFamily} onChange={css => update([o.id], { fontFamily: css })} />
        </Section>
      )}

      {layerKind && !multi && rec && (
        <LayerProps o={o} kind={layerKind} setLayerContent={setLayerContent} pickFile={p.pickFile} />
      )}
    </div>
  );
};

// ── engine-layer specifics (video / lottie / scripture / template fields…) ────
const LayerProps: React.FC<{ o: TelaVectorObject; kind: string; setLayerContent: InspectorProps['setLayerContent']; pickFile: InspectorProps['pickFile'] }> = ({ o, kind, setLayerContent, pickFile }) => {
  const c = amboRecord(o)!.layer.content as any;
  const set = (patch: Record<string, unknown>, key?: string) => setLayerContent(o.id, cur => ({ ...(cur as any), ...patch }), key);
  if (kind === 'VIDEO') return (
    <Section title="Video">
      <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={c.loop !== false} onChange={e => set({ loop: e.target.checked })} /> Loop</label>
      <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={!!c.muted} onChange={e => set({ muted: e.target.checked })} /> Muted</label>
      <Range label="Volume" value={c.volume ?? 1} min={0} max={1} step={0.01} onChange={v => set({ volume: v }, 'vol')} fmt={v => `${Math.round(v * 100)}%`} />
      <div className="grid grid-cols-2 gap-2"><Num label="Start (s)" value={c.inSec ?? 0} min={0} onChange={v => set({ inSec: v }, 'in')} /><Num label="End (s)" value={c.outSec} min={0} onChange={v => set({ outSec: v }, 'out')} /></div>
      <button type="button" className="w-full h-8 rounded border text-[12px] text-white/80 hover:bg-white/10" style={{ borderColor: line }} onClick={async () => { const u = await pickFile('video/*'); if (u) set({ src: u }); }}>Replace video…</button>
    </Section>
  );
  if (kind === 'LOTTIE') return (
    <Section title="Lottie">
      <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={c.loop !== false} onChange={e => set({ loop: e.target.checked })} /> Loop</label>
      <Range label="Speed" value={c.speed ?? 1} min={0.1} max={4} step={0.1} onChange={v => set({ speed: v }, 'spd')} fmt={v => `${v.toFixed(1)}×`} />
    </Section>
  );
  if (kind === 'SCRIPTURE') return (
    <Section title="Scripture">
      <label className="block"><span className={lab}>Reference</span><input className={field} style={{ borderColor: line }} value={c.reference ?? ''} onChange={e => set({ reference: e.target.value, refId: c.refId || e.target.value }, 'ref')} placeholder="John 3:16" /></label>
      <label className="block"><span className={lab}>Verse text</span><textarea rows={4} className={`${field} resize-y`} style={{ borderColor: line }} value={(c.lines ?? []).join('\n')} onChange={e => set({ lines: e.target.value.split('\n') }, 'lines')} /></label>
      <label className="block"><span className={lab}>Translation</span><input className={field} style={{ borderColor: line }} value={c.translation ?? ''} onChange={e => set({ translation: e.target.value }, 'tr')} placeholder="KJV" /></label>
    </Section>
  );
  if (kind === 'GENERATOR') return (
    <Section title="Generator">
      <select className={field} style={{ borderColor: line, background: '#1a1326' }} value={c.mode} onChange={e => set({ mode: e.target.value })}>{GENERATOR_ITEMS.map(g => <option key={g.id} value={(g.content as any).mode}>{g.name}</option>)}</select>
    </Section>
  );
  if (kind === 'TELA_TEMPLATE') {
    const t = templateById(c.templateId);
    return (
      <Section title={t?.name ?? 'Template'}>
        {(t?.fields ?? []).filter(f => !f.kind || f.kind === 'text' || f.kind === 'number').map(f => (
          <label className="block" key={f.key}><span className={lab}>{f.label}</span>
            {f.multiline
              ? <textarea rows={3} className={`${field} resize-y`} style={{ borderColor: line }} value={c.fields?.[f.key] ?? f.default} onChange={e => set({ fields: { ...(c.fields || {}), [f.key]: e.target.value } }, `f_${f.key}`)} />
              : <input className={field} style={{ borderColor: line }} value={c.fields?.[f.key] ?? f.default} onChange={e => set({ fields: { ...(c.fields || {}), [f.key]: e.target.value } }, `f_${f.key}`)} />}
          </label>
        ))}
      </Section>
    );
  }
  if (kind === 'AUDIO') return (
    <Section title="Audio">
      <Range label="Volume" value={c.volume ?? 1} min={0} max={1} step={0.01} onChange={v => set({ volume: v }, 'vol')} fmt={v => `${Math.round(v * 100)}%`} />
      <label className="flex items-center gap-2 text-[12px] text-white/80"><input type="checkbox" checked={!!c.loop} onChange={e => set({ loop: e.target.checked })} /> Loop</label>
    </Section>
  );
  return <div className="text-[11px] text-white/40 border-t pt-3" style={{ borderColor: line }}>{kind} layer — kept exactly as is. Move, hide, lock and reorder it like any object.</div>;
};

// ── Background picker (solid / gradient / image / video / generator / shader) ──
const BackgroundPicker: React.FC<InspectorProps> = ({ background, onSetBackground, pickFile }) => {
  const [color, setColor] = React.useState(background.color ?? '#0a0713');
  const [g1, setG1] = React.useState('#6B0099'); const [g2, setG2] = React.useState('#D40055'); const [ang, setAng] = React.useState(135);
  const [shader, setShader] = React.useState('');
  return (
    <Section title="Background">
      <div className="text-[11px] text-white/50">Now: <span className="text-white/80">{background.label}</span></div>
      <div className="flex flex-wrap gap-1.5">
        {(['none', 'solid', 'gradient'] as const).map(t => (
          <button key={t} type="button" onClick={() => onSetBackground(t === 'none' ? { type: 'none' } : t === 'solid' ? { type: 'solid', color } : { type: 'gradient', from: g1, to: g2, angle: ang })}
            className="px-2.5 h-7 rounded border text-[11px] capitalize text-white/80 hover:bg-white/10" style={{ borderColor: line, ...(background.type === t ? { background: 'rgba(208,188,255,.2)', color: '#fff' } : {}) }}>{t}</button>
        ))}
      </div>
      <Color label="Solid colour" value={color} onChange={v => { setColor(v); onSetBackground({ type: 'solid', color: v }); }} />
      <div className="grid grid-cols-2 gap-2">
        <Color label="Gradient from" value={g1} onChange={v => { setG1(v); onSetBackground({ type: 'gradient', from: v, to: g2, angle: ang }); }} />
        <Color label="Gradient to" value={g2} onChange={v => { setG2(v); onSetBackground({ type: 'gradient', from: g1, to: v, angle: ang }); }} />
      </div>
      <Range label="Gradient angle" value={ang} min={0} max={360} onChange={v => { setAng(v); onSetBackground({ type: 'gradient', from: g1, to: g2, angle: v }); }} fmt={v => `${Math.round(v)}°`} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="h-8 rounded border text-[12px] text-white/80 hover:bg-white/10" style={{ borderColor: line }} onClick={async () => { const u = await pickFile('image/*'); if (u) onSetBackground({ type: 'content', content: { kind: 'IMAGE', src: u } }); }}>Image…</button>
        <button type="button" className="h-8 rounded border text-[12px] text-white/80 hover:bg-white/10" style={{ borderColor: line }} onClick={async () => { const u = await pickFile('video/*'); if (u) onSetBackground({ type: 'content', content: { kind: 'VIDEO', src: u, loop: true, muted: true } }); }}>Video…</button>
      </div>
      <label className="block"><span className={lab}>Animated generator</span>
        <select className={field} style={{ borderColor: line, background: '#1a1326' }} value="" onChange={e => { if (e.target.value) onSetBackground({ type: 'content', content: { kind: 'GENERATOR', mode: e.target.value } }); }}>
          <option value="">Choose…</option>{GENERATOR_ITEMS.map(g => <option key={g.id} value={(g.content as any).mode}>{g.name}</option>)}</select></label>
      <label className="block"><span className={lab}>Shader</span>
        <div className="flex gap-1.5"><input className={field} style={{ borderColor: line }} value={shader} onChange={e => setShader(e.target.value)} placeholder="shader id" />
          <button type="button" className="px-3 rounded border text-[11px] text-white/80 hover:bg-white/10" style={{ borderColor: line }} disabled={!shader.trim()} onClick={() => onSetBackground({ type: 'content', content: { kind: 'SHADER', src: shader.trim() } })}>Set</button></div></label>
    </Section>
  );
};

export { CYAN, LILAC };
