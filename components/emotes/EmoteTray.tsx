// EmoteTray — the always-there row of quick emotes under the stream + the button that opens the
// full library. Tap sends one. HOLD keeps sending (TikTok-style tapping) with a live ×count and a
// light haptic tick; the batcher turns a long hold into a handful of writes.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { EmoteDef } from '../../services/emotes/emoteTypes';
import { emoteById } from '../../services/emotes/emoteLibrary';
import { useEmoteShelf } from '../../services/emotes/emoteShelf';
import { canUseEmote, type ViewerAccess } from '../../services/emotes/emoteEngine';
import { EmoteGlyph } from './EmoteGlyph';

const DEFAULT_QUICK = ['core.heart', 'core.fire', 'core.lol', 'kaiju.roar', 'core.wow', 'core.popper', 'core.hundred', 'core.gg'];

export interface EmoteTrayProps {
  onSend: (def: EmoteDef, n: number) => void;
  onOpenPicker: () => void;
  /** How many quick slots to show (the rest of the row is the picker button). */
  slots?: number;
  size?: number;
  className?: string;
  /** Pinned emotes the creator chose for this stream (channel emotes first, typically). */
  pinned?: EmoteDef[];
  /** Hides emotes this viewer can't use (gated channel emotes). */
  access?: ViewerAccess;
}

export const EmoteTray: React.FC<EmoteTrayProps> = ({ onSend, onOpenPicker, slots = 6, size = 30, className, pinned = [], access = {} }) => {
  const { favorites, recent } = useEmoteShelf();
  const quick = useMemo(() => {
    const ids = [...pinned.map(p => p.id), ...favorites, ...recent, ...DEFAULT_QUICK];
    const out: EmoteDef[] = [];
    for (const id of ids) {
      if (out.length >= slots) break;
      const e = emoteById(id);
      if (e && canUseEmote(e, access) && !out.some(o => o.id === e.id)) out.push(e);
    }
    return out;
  }, [pinned, favorites, recent, slots, access]);

  const [holding, setHolding] = useState<{ id: string; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setTimeout(() => setHolding(h => (h && !timer.current ? null : h)), 500); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = (e: EmoteDef) => {
    onSend(e, 1);
    setHolding({ id: e.id, n: 1 });
    let n = 1, gap = 260;
    const rep = () => {
      n++; onSend(e, 1); setHolding({ id: e.id, n });
      if (n % 3 === 0) navigator.vibrate?.(6);
      gap = Math.max(110, gap * 0.86);                     // speeds up the longer you hold
      timer.current = setTimeout(rep, gap);
    };
    timer.current = setTimeout(rep, 340);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`} role="toolbar" aria-label="Quick emotes">
      {quick.map(e => (
        <button
          key={e.id}
          type="button"
          onPointerDown={ev => { ev.currentTarget.setPointerCapture?.(ev.pointerId); start(e); }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onContextMenu={ev => ev.preventDefault()}
          aria-label={`Send ${e.name}`}
          className="relative shrink-0 rounded-2xl flex items-center justify-center select-none touch-none transition-transform active:scale-90"
          style={{ width: size + 12, height: size + 12, background: holding?.id === e.id ? `${e.gel}33` : 'rgba(255,255,255,0.06)', boxShadow: holding?.id === e.id ? `0 0 18px ${e.gel}88` : undefined }}
        >
          <EmoteGlyph def={e} size={size} animate={holding?.id === e.id} />
          {holding?.id === e.id && holding.n > 1 && (
            <span className="absolute -top-2 -right-1 min-w-[22px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center"
              style={{ background: e.gel, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>×{holding.n}</span>
          )}
        </button>
      ))}
      <button type="button" onClick={onOpenPicker} aria-label="All emotes"
        className="shrink-0 rounded-2xl flex items-center justify-center text-white/85 bg-gradient-to-br from-[#6B0099] to-[#D40055] active:scale-90 transition-transform"
        style={{ width: size + 12, height: size + 12 }}>
        <SmilePlus className="w-5 h-5" />
      </button>
    </div>
  );
};

export default EmoteTray;
