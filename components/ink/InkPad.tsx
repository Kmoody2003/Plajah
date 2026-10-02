import React, { useEffect, useRef, useState } from 'react';
import { Pen, Pencil, Highlighter, Eraser, Undo2, Redo2, Trash2 } from 'lucide-react';
import type { TelaVectorObject } from '../../types';
import type { InkStyle } from '../../services/inkMath';
import InkLayer, { type NoteTool } from './InkLayer';
import InkStrokes, { inkStrokesOf } from './InkStrokes';

/**
 * A self-contained, compact drawing pad: paper + ink + a small toolbar, fitted to its container.
 * Drives itself (undo/redo included) so a feed card, a quick-draw prompt or a comment box can drop it
 * in with one line. Output is plain Tela Vector PATH objects, so a drawing can be saved as a Tela
 * document and embedded anywhere Tela renders. Finger drawing is ON here (it is a dedicated surface).
 */
interface Props {
  /** Logical drawing size; the pad scales to its container width. */
  width?: number; height?: number;
  background?: string;
  palette?: string[];
  /** Initial strokes (uncontrolled). */
  initial?: TelaVectorObject[];
  onChange?: (strokes: TelaVectorObject[]) => void;
  readOnly?: boolean;
  /** Hide the toolbar (e.g. a host that supplies its own). */
  bare?: boolean;
  className?: string;
}

const DEFAULT_PALETTE = ['#16131f', '#D40055', '#6B0099', '#00A3B8', '#E07A00', '#2E7D32'];
const TOOLS: { id: 'pen' | 'pencil' | 'highlighter' | 'eraser'; icon: React.ReactNode; label: string }[] = [
  { id: 'pen', icon: <Pen size={15} />, label: 'Pen' },
  { id: 'pencil', icon: <Pencil size={15} />, label: 'Pencil' },
  { id: 'highlighter', icon: <Highlighter size={15} />, label: 'Highlighter' },
  { id: 'eraser', icon: <Eraser size={15} />, label: 'Eraser' },
];

const InkPad: React.FC<Props> = ({ width = 640, height = 400, background = '#fdfcf8', palette = DEFAULT_PALETTE, initial, onChange, readOnly, bare, className }) => {
  const [strokes, setStrokes] = useState<TelaVectorObject[]>(() => inkStrokesOf(initial ?? []));
  const [past, setPast] = useState<TelaVectorObject[][]>([]);
  const [future, setFuture] = useState<TelaVectorObject[][]>([]);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [style, setStyle] = useState<InkStyle>({ color: palette[0], size: 2.4, tool: 'pen' });
  const wrap = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setK(Math.max(0.1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const commit = (next: TelaVectorObject[]) => { setPast(p => [...p.slice(-49), strokes]); setFuture([]); setStrokes(next); onChange?.(next); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setPast(p => p.slice(0, -1)); setFuture(f => [strokes, ...f]); setStrokes(prev); onChange?.(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture(f => f.slice(1)); setPast(p => [...p, strokes]); setStrokes(nxt); onChange?.(nxt); };
  const pick = (t: typeof TOOLS[number]['id']) => {
    setTool(t);
    if (t !== 'eraser') setStyle(s => ({ ...s, tool: t, size: t === 'highlighter' ? 3 : t === 'pencil' ? 2 : 2.4 }));
  };

  return (
    <div className={className}>
      {!bare && !readOnly && (
        <div className="flex flex-wrap items-center gap-1 mb-2 p-1.5 rounded-xl bg-black/30 border border-white/10" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(t => (
            <button key={t.id} type="button" title={t.label} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => pick(t.id)}
              className={`w-9 h-9 rounded-lg grid place-items-center ${tool === t.id ? 'bg-gradient-to-br from-[#6B0099] to-[#D40055] text-white' : 'text-white/60 hover:bg-white/10'}`}>{t.icon}</button>
          ))}
          <span className="w-px h-5 bg-white/15 mx-1" aria-hidden />
          {palette.map(c => (
            <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={style.color === c} onClick={() => { setStyle(s => ({ ...s, color: c })); if (tool === 'eraser') pick('pen'); }}
              className="w-6 h-6 rounded-full border-2" style={{ background: c, borderColor: style.color === c ? '#fff' : 'rgba(255,255,255,0.25)' }} />
          ))}
          <input type="range" min={1} max={12} step={0.5} value={style.size} onChange={e => setStyle(s => ({ ...s, size: +e.target.value }))} aria-label="Thickness" className="w-20 ml-1" />
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" aria-label="Undo" disabled={!past.length} onClick={undo} className="w-9 h-9 rounded-lg grid place-items-center text-white/70 hover:bg-white/10 disabled:opacity-30"><Undo2 size={15} /></button>
            <button type="button" aria-label="Redo" disabled={!future.length} onClick={redo} className="w-9 h-9 rounded-lg grid place-items-center text-white/70 hover:bg-white/10 disabled:opacity-30"><Redo2 size={15} /></button>
            <button type="button" aria-label="Clear drawing" disabled={!strokes.length} onClick={() => commit([])} className="w-9 h-9 rounded-lg grid place-items-center text-rose-300 hover:bg-rose-500/20 disabled:opacity-30"><Trash2 size={15} /></button>
          </span>
        </div>
      )}
      <div ref={wrap} className="w-full" style={{ height: height * k }}>
        <div className="relative rounded-lg overflow-hidden shadow-lg" style={{ width, height, background, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <InkStrokes width={width} height={height} strokes={strokes} />
          {!readOnly && (
            <InkLayer width={width} height={height} tool={tool} style={style} fingerDraws strokes={strokes} hiddenIds={new Set()}
              onStroke={o => commit([...strokes, o])}
              onErase={ids => commit(strokes.filter(s => !ids.includes(s.id)))}
              onLasso={() => {}} onTap={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
};

export default InkPad;
