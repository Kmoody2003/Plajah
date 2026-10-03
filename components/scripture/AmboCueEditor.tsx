// AmboCueEditor — colour + label + note for one song. Opens anchored under the
// button that opened it (portalled so a scrolling list can't clip it).

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { CUE_COLORS, CUE_LABEL_PRESETS, type CueNote } from '../../services/ambo/audioCues';

interface Props {
  anchor: HTMLElement;
  trackTitle: string;
  value: CueNote | null;
  onSave: (cue: CueNote | null) => void;
  onClose: () => void;
}

export const AmboCueEditor: React.FC<Props> = ({ anchor, trackTitle, value, onSave, onClose }) => {
  const [color, setColor] = useState<string>(value?.color || 'yellow');
  const [label, setLabel] = useState(value?.label || '');
  const [note, setNote] = useState(value?.note || '');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = 300, h = 330;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight ? Math.max(12, r.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);

  const save = () => { onSave({ color, label: label.trim() || undefined, note: note.trim() || undefined }); onClose(); };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[10000] w-[300px] rounded-xl border p-3 flex flex-col gap-2.5 shadow-2xl"
      style={{ top: pos.top, left: pos.left, background: 'rgba(16,12,26,0.97)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Cue note</div>
          <div className="text-[11px] font-semibold text-white truncate">{trackTitle}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close"><X size={13} /></button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cue colour">
        {CUE_COLORS.map(c => (
          <button
            key={c.id}
            role="radio"
            aria-checked={color === c.id}
            title={c.name}
            onClick={() => setColor(c.id)}
            className="w-6 h-6 rounded-full transition-transform"
            style={{
              background: c.hex,
              boxShadow: color === c.id ? `0 0 0 2px #0b0812, 0 0 0 4px ${c.hex}` : 'none',
              transform: color === c.id ? 'scale(1.05)' : 'none',
            }}
          />
        ))}
      </div>

      <input
        autoFocus
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label — e.g. Offering"
        maxLength={40}
        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-[#D0BCFF] text-white text-[11px] outline-none placeholder:text-white/30"
      />
      <div className="flex flex-wrap gap-1">
        {CUE_LABEL_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setLabel(p)}
            className={`px-1.5 py-0.5 rounded text-[9.5px] border transition-all ${label === p ? 'border-[#D0BCFF]/50 bg-[#D0BCFF]/15 text-[#D0BCFF]' : 'border-white/10 text-white/55 hover:text-white hover:bg-white/5'}`}
          >{p}</button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note — e.g. fade out at the bridge, pastor prays over it"
        rows={3}
        maxLength={280}
        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-[#D0BCFF] text-white text-[11px] outline-none placeholder:text-white/30 resize-none"
      />

      <div className="flex items-center justify-between">
        {value ? (
          <button onClick={() => { onSave(null); onClose(); }} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/50 hover:text-[#FF5A5F] hover:bg-white/5">
            <Trash2 size={11} /> Remove cue
          </button>
        ) : <span />}
        <button onClick={save} className="px-3 py-1 rounded-lg text-[10.5px] font-bold text-[#0b0812] bg-[#D0BCFF] hover:bg-white transition-all">Save cue</button>
      </div>
    </div>,
    document.body,
  );
};

/** The visible cue on a row: tinted line + label chip + the note text. */
export const CueRowStyle = (hex: string | null): React.CSSProperties => hex ? {
  background: `linear-gradient(90deg, ${hex}2e 0%, ${hex}12 45%, rgba(255,255,255,0.02) 100%)`,
  borderColor: `${hex}66`,
  boxShadow: `inset 3px 0 0 ${hex}`,
} : {};

export default AmboCueEditor;
