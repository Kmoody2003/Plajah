// TelaToolOptionsBar — the secondary row under Tela's document strip: the options of
// whichever tool is active (Photoshop/Illustrator "control bar"). With the Type tool it is
// the typography bar: values reflect the selected text layer when there is one, otherwise
// they are the defaults the next text layer is born with.
import React, { useMemo } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Plus, SquareDashed, Type, Underline, Wand2 } from 'lucide-react';
import type { TelaVectorObject } from '../../types';
import { FONTS, fontCss, fontKeysInStacks, ensureFontsLoaded, type FontKey, type FontSpec } from '../../services/tela/telaFonts';

/** The typography a new text layer / text box is created with. */
export interface TelaTypeDefaults {
  fontFamily: string; fontSize: number; fontWeight: number;
  fontStyle: 'normal' | 'italic'; underline: boolean;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number; letterSpacing: number; fill: string;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}
export const DEFAULT_TYPE: TelaTypeDefaults = {
  fontFamily: fontCss('inter'), fontSize: 16, fontWeight: 400, fontStyle: 'normal', underline: false,
  textAlign: 'left', lineHeight: 1.5, letterSpacing: 0, fill: '#1B1523', textTransform: 'none',
};

const TOOL_HINTS: Record<string, string> = {
  select: 'Click a layer to select and move it · double-click text to edit',
  direct: 'Drag anchors and points of a path',
  marquee: 'Drag to select every layer inside the box',
  rect: 'Drag on the page to draw a rectangle',
  ellipse: 'Drag on the page to draw an ellipse',
  line: 'Drag on the page to draw a line',
  pen: 'Click to add points · double-click to finish',
  ink: 'Draw freehand with pen, pencil or highlighter',
  pencil: 'Draw a freehand path', polygon: 'Drag to draw a polygon', star: 'Drag to draw a star',
  width: 'Drag on a stroke to vary its width', shapeBuilder: 'Click regions to merge · Alt-click to remove',
  gradient: 'Drag across the selection to set the gradient', mesh: 'Click inside a shape to add mesh points',
  eyedropper: 'Click any layer to copy its paint', artboard: 'Drag the page edges to resize the artboard',
  hand: 'Drag to pan the page', zoom: 'Click to zoom in · Alt-click to zoom out',
};

const TOOL_NAMES: Record<string, string> = {
  select: 'Select', direct: 'Direct select', marquee: 'Marquee', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line',
  pen: 'Pen', ink: 'Ink', pencil: 'Pencil', polygon: 'Polygon', star: 'Star', width: 'Width', shapeBuilder: 'Shape builder',
  gradient: 'Gradient', mesh: 'Mesh', eyedropper: 'Eyedropper', artboard: 'Artboard', hand: 'Hand', zoom: 'Zoom',
  rotate: 'Rotate', reflect: 'Reflect', scale: 'Scale', addAnchor: 'Add anchor', deleteAnchor: 'Delete anchor',
  convert: 'Convert anchor', scissors: 'Scissors', typePath: 'Type on a path', text: 'Type', type: 'Type',
};

const FONT_GROUPS: { label: string; keys: FontKey[] }[] = (() => {
  const groups = new Map<string, FontKey[]>();
  for (const [key, spec] of Object.entries(FONTS) as [FontKey, FontSpec][]) {
    const label = spec.class[0].toUpperCase() + spec.class.slice(1);
    groups.set(label, [...(groups.get(label) || []), key]);
  }
  return [...groups].map(([label, keys]) => ({ label, keys }));
})();

const WEIGHTS: [number, string][] = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']];

const field = 'h-7 px-2 rounded-[8px] text-[.64rem] font-bold text-white/80 outline-none shrink-0';
const fieldStyle: React.CSSProperties = { background: '#17131d', border: '1px solid rgba(255,255,255,.1)' };
const sep = <div className="h-4 w-px bg-white/10 mx-0.5 shrink-0" />;
const label = (text: string) => <span className="text-[.56rem] font-extrabold uppercase tracking-[.1em] text-white/35 shrink-0">{text}</span>;

const Toggle: React.FC<{ on: boolean; title: string; onClick: () => void; children: React.ReactNode }> = ({ on, title, onClick, children }) => (
  <button type="button" title={title} aria-pressed={on} onClick={onClick}
    className="w-7 h-7 grid place-items-center rounded-[8px] shrink-0 transition-colors"
    style={{ color: on ? '#fff' : 'rgba(255,255,255,.6)', background: on ? 'var(--pj-magenta,#D40055)' : 'rgba(255,255,255,.045)', border: on ? '1px solid rgba(212,0,85,.6)' : '1px solid rgba(255,255,255,.08)' }}>
    {children}
  </button>
);

export interface TelaToolOptionsBarProps {
  tool: string;
  /** Pro Studio canvas: shape paint lives in its own vector engine, so the bar leaves shapes to its panels. */
  proStudio?: boolean;
  /** The single selected vector object on the active page, if any. */
  selected: TelaVectorObject | null;
  onUpdateSelected: (patch: Partial<TelaVectorObject>) => void;
  typeDefaults: TelaTypeDefaults;
  onTypeDefaults: (patch: Partial<TelaTypeDefaults>) => void;
  onAddTextLayer: () => void;
  onAddTextBox: () => void;
  textArtOpen: boolean;
  onToggleTextArt: () => void;
  /** Rendered under the row (the Text Art Studio popover), outside the row's scroller so it is not clipped. */
  popover?: React.ReactNode;
}

export const TelaToolOptionsBar: React.FC<TelaToolOptionsBarProps> = ({
  tool, proStudio, selected, onUpdateSelected, typeDefaults, onTypeDefaults, onAddTextLayer, onAddTextBox, textArtOpen, onToggleTextArt, popover,
}) => {
  const isType = tool === 'text' || tool === 'type';
  const selText = selected?.kind === 'TEXT' ? selected : null;

  // What the bar shows: the selected text layer's values, else the defaults for the next one.
  const t: TelaTypeDefaults = useMemo(() => selText ? {
    fontFamily: selText.fontFamily || typeDefaults.fontFamily,
    fontSize: selText.fontSize || typeDefaults.fontSize,
    fontWeight: selText.fontWeight || 400,
    fontStyle: selText.fontStyle || 'normal',
    underline: !!selText.underline,
    textAlign: selText.textAlign || 'left',
    lineHeight: selText.lineHeight ?? 1.5,
    letterSpacing: selText.letterSpacing ?? 0,
    fill: selText.fill && selText.fill !== 'none' ? selText.fill : typeDefaults.fill,
    textTransform: selText.textTransform || 'none',
  } : typeDefaults, [selText, typeDefaults]);

  const setType = (patch: Partial<TelaTypeDefaults>) => {
    if (selText) onUpdateSelected(patch);
    else onTypeDefaults(patch);
  };
  const fontKey = fontKeysInStacks([t.fontFamily])[0] || '';

  const showTypography = isType || !!selText;
  const selShape = selected && selected.kind !== 'TEXT' ? selected : null;
  const hexFill = /^#[0-9a-f]{6}$/i.test(selShape?.fill || '') ? selShape!.fill : '#6B0099';
  const hexStroke = /^#[0-9a-f]{6}$/i.test(selShape?.stroke || '') ? selShape!.stroke : '#120D1C';

  return (
    <div className="relative shrink-0 z-[19]" style={{ background: 'rgba(16,14,22,0.97)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-1.5 px-3 h-9 overflow-x-auto custom-scrollbar select-none" role="toolbar" aria-label={`${TOOL_NAMES[tool] || 'Tool'} options`}>
        <span className="flex items-center gap-1.5 text-[.64rem] font-extrabold text-white/85 shrink-0 pr-1">
          {isType && <Type size={12} className="text-[#D0BCFF]" />}
          {TOOL_NAMES[tool] || tool}
        </span>
        {sep}

        {showTypography ? <>
          {label(selText ? (selText.textRole === 'BOX' ? 'Text box' : selText.textRole === 'LAYER' ? 'Text layer' : 'Text') : 'Next layer')}
          <select aria-label="Font" value={fontKey} onChange={e => { const key = e.target.value as FontKey; ensureFontsLoaded([key]); setType({ fontFamily: fontCss(key) }); }} className={field} style={{ ...fieldStyle, maxWidth: 150 }}>
            {!fontKey && <option value="">{t.fontFamily.split(',')[0].replace(/["']/g, '')}</option>}
            {FONT_GROUPS.map(g => <optgroup key={g.label} label={g.label}>{g.keys.map(k => <option key={k} value={k}>{FONTS[k].family}</option>)}</optgroup>)}
          </select>
          <select aria-label="Weight" value={t.fontWeight} onChange={e => setType({ fontWeight: +e.target.value })} className={field} style={fieldStyle}>
            {WEIGHTS.map(([w, name]) => <option key={w} value={w}>{name}</option>)}
          </select>
          <input aria-label="Font size" title="Font size (px)" type="number" min={6} max={400} value={t.fontSize} onChange={e => { const v = +e.target.value; if (v >= 6 && v <= 400) setType({ fontSize: v }); }} className={field} style={{ ...fieldStyle, width: 54 }} />
          {sep}
          <Toggle on={t.fontWeight >= 700} title="Bold (Ctrl+B)" onClick={() => setType({ fontWeight: t.fontWeight >= 700 ? 400 : 700 })}><Bold size={13} /></Toggle>
          <Toggle on={t.fontStyle === 'italic'} title="Italic (Ctrl+I)" onClick={() => setType({ fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic size={13} /></Toggle>
          <Toggle on={t.underline} title="Underline (Ctrl+U)" onClick={() => setType({ underline: !t.underline })}><Underline size={13} /></Toggle>
          {sep}
          <Toggle on={t.textAlign === 'left'} title="Align left" onClick={() => setType({ textAlign: 'left' })}><AlignLeft size={13} /></Toggle>
          <Toggle on={t.textAlign === 'center'} title="Align centre" onClick={() => setType({ textAlign: 'center' })}><AlignCenter size={13} /></Toggle>
          <Toggle on={t.textAlign === 'right'} title="Align right" onClick={() => setType({ textAlign: 'right' })}><AlignRight size={13} /></Toggle>
          {sep}
          {label('Leading')}
          <input aria-label="Line height" title="Line height (× font size)" type="number" min={0.8} max={3} step={0.05} value={t.lineHeight} onChange={e => { const v = +e.target.value; if (v >= 0.8 && v <= 3) setType({ lineHeight: v }); }} className={field} style={{ ...fieldStyle, width: 56 }} />
          {label('Tracking')}
          <input aria-label="Letter spacing" title="Letter spacing (% of font size)" type="number" min={-20} max={100} step={1} value={Math.round(t.letterSpacing * 100)} onChange={e => { const v = +e.target.value; if (v >= -20 && v <= 100) setType({ letterSpacing: v / 100 }); }} className={field} style={{ ...fieldStyle, width: 52 }} />
          <select aria-label="Case" value={t.textTransform} onChange={e => setType({ textTransform: e.target.value as TelaTypeDefaults['textTransform'] })} className={field} style={fieldStyle}>
            <option value="none">Aa</option><option value="uppercase">AA</option><option value="lowercase">aa</option><option value="capitalize">Title</option>
          </select>
          <label title="Text colour" className="w-7 h-7 rounded-[8px] shrink-0 cursor-pointer grid place-items-center" style={fieldStyle}>
            <span className="w-4 h-4 rounded-[4px] border border-white/30" style={{ background: t.fill }} />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(t.fill) ? t.fill : '#1b1523'} onChange={e => setType({ fill: e.target.value })} className="sr-only" />
          </label>
          {sep}
          <button type="button" onClick={onAddTextLayer} title="New text layer — a page-sized sheet of text lifted off the page (or just start typing with the Type tool)"
            className="h-7 px-2.5 rounded-[8px] text-[.62rem] font-extrabold text-white flex items-center gap-1 shrink-0 bg-[#6B0099]/35 hover:bg-[#6B0099]/55 border border-[#a78bfa]/40">
            <Plus size={11} /> Text layer
          </button>
          <button type="button" onClick={onAddTextBox} title="New text box layer — a framed box you size and place on the page"
            className="h-7 px-2.5 rounded-[8px] text-[.62rem] font-extrabold text-white flex items-center gap-1 shrink-0 bg-[#FF8C00]/20 hover:bg-[#FF8C00]/35 border border-[#FF8C00]/40">
            <SquareDashed size={11} /> Text box
          </button>
          <button type="button" onClick={onToggleTextArt} aria-pressed={textArtOpen} title="Text Art Studio — 3D, materials, generative effects, shape arrays, letter tools"
            className="h-7 px-2.5 rounded-[8px] text-[.62rem] font-extrabold flex items-center gap-1 shrink-0 border"
            style={{ color: '#fff', background: textArtOpen ? 'var(--pj-magenta,#D40055)' : 'rgba(212,0,85,.18)', borderColor: 'rgba(212,0,85,.45)' }}>
            <Wand2 size={11} /> Text art
          </button>
          {isType && !selText && <span className="text-[.6rem] font-semibold text-white/40 shrink-0 pl-1">Start typing or click a page to make a text layer</span>}
        </> : selShape && !proStudio ? <>
          {label('Fill')}
          <input aria-label="Fill colour" type="color" value={hexFill} onChange={e => onUpdateSelected({ fill: e.target.value })} className="w-7 h-7 rounded-[8px] shrink-0 cursor-pointer p-0.5" style={fieldStyle} />
          {label('Stroke')}
          <input aria-label="Stroke colour" type="color" value={hexStroke} onChange={e => onUpdateSelected({ stroke: e.target.value })} className="w-7 h-7 rounded-[8px] shrink-0 cursor-pointer p-0.5" style={fieldStyle} />
          <input aria-label="Stroke width" title="Stroke width (px)" type="number" min={0} max={80} step={0.5} value={selShape.strokeWidth} onChange={e => { const v = +e.target.value; if (v >= 0 && v <= 80) onUpdateSelected({ strokeWidth: v }); }} className={field} style={{ ...fieldStyle, width: 52 }} />
          {label('Opacity')}
          <input aria-label="Opacity" type="range" min={0} max={1} step={0.01} value={selShape.opacity ?? 1} onChange={e => onUpdateSelected({ opacity: +e.target.value })} className="w-24 shrink-0" />
          <span className="text-[.6rem] font-semibold text-white/40 shrink-0 pl-1 truncate">{selShape.objectLabel || selShape.kind.toLowerCase()}</span>
        </> : (
          <span className="text-[.62rem] font-semibold text-white/45 shrink-0">{TOOL_HINTS[tool] || 'Pick a tool from the left rail'}</span>
        )}
      </div>
      {popover}
    </div>
  );
};

export default TelaToolOptionsBar;
