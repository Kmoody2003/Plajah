// TrackReactionButton — one small, always-recognisable taste control for a song.
//
//   tap            → Like (thumbs up)        tap again → clear
//   double-tap     → Love (heart)
//   press & hold, right-click, or ↑ / Shift+Enter → a tiny tray: Like · Love · Not for me
//
// The resting icon shows the current reaction (filled + coloured), so a glance down a tracklist
// reads your taste. Same store and event as TrackReactions (services/tasteService → the taste
// vector, Daily Mix and the Liked songs playlist), so every copy of a song's control stays in sync.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ThumbsUp, ThumbsDown, Heart } from 'lucide-react';
import type { Track, Album } from '../types';
import { getTrackReaction, setTrackReaction, loadMyReactions, type TasteSignal } from '../services/tasteService';
import { auth } from '../services/backendService';

const LOOK: Record<TasteSignal, { label: string; color: string; Icon: typeof Heart }> = {
  UP: { label: 'Liked', color: '#00DAF3', Icon: ThumbsUp },
  LOVE: { label: 'Loved', color: '#FF2E7E', Icon: Heart },
  DOWN: { label: 'Not for me', color: 'rgba(255,255,255,0.78)', Icon: ThumbsDown },
};
const ORDER: TasteSignal[] = ['UP', 'LOVE', 'DOWN'];

interface Props {
  track: Track;
  album?: Album | null;
  size?: number;
  /** Button box in px (keep ≥ 32 in dense rows, 44 where touch matters). */
  box?: number;
  className?: string;
  /** Where the tray opens relative to the button. */
  trayAt?: 'top' | 'bottom';
  /** Dense lists: hide the un-reacted icon until the row (a `group`) is hovered or focused.
   *  A song you've reacted to always shows its mark. */
  quiet?: boolean;
}

const TrackReactionButton: React.FC<Props> = ({ track, album = null, size = 16, box = 36, className = '', trayAt = 'top', quiet = false }) => {
  const [signal, setSignal] = useState<TasteSignal | undefined>(() => getTrackReaction(track.id));
  const [tray, setTray] = useState(false);
  const [pop, setPop] = useState(0);
  const holdRef = useRef<number | null>(null);
  const tapRef = useRef<number | null>(null);
  const held = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadMyReactions().then(() => { if (alive) setSignal(getTrackReaction(track.id)); }).catch(() => {});
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.trackId === track.id && alive) setSignal(d.signal || undefined);
    };
    window.addEventListener('taste:changed', onChange as EventListener);
    return () => { alive = false; window.removeEventListener('taste:changed', onChange as EventListener); };
  }, [track.id]);

  useEffect(() => {
    if (!tray) return;
    const close = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setTray(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTray(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [tray]);

  const apply = useCallback(async (s: TasteSignal | null) => {
    if (!auth.currentUser) { alert('Sign in to like music — it teaches Chora your taste.'); return; }
    const prev = signal;
    const next = s && s !== prev ? s : undefined;
    setSignal(next);
    if (next) setPop(p => p + 1);
    try { await setTrackReaction(track, album, s ?? prev ?? null); }
    catch { setSignal(prev); }
  }, [signal, track, album]);

  const startHold = () => {
    held.current = false;
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => { held.current = true; setTray(true); }, 420);
  };
  const endHold = () => { if (holdRef.current) window.clearTimeout(holdRef.current); holdRef.current = null; };

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (held.current) { held.current = false; return; }
    // Wait one beat to tell a tap (Like / clear) from a double-tap (Love).
    if (tapRef.current) {
      window.clearTimeout(tapRef.current);
      tapRef.current = null;
      void apply('LOVE');
      return;
    }
    tapRef.current = window.setTimeout(() => {
      tapRef.current = null;
      void apply(signal ? signal : 'UP'); // set → same signal clears it
    }, 230);
  };

  const cur = signal ? LOOK[signal] : null;
  const Icon = cur?.Icon ?? ThumbsUp;

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`} onClick={e => e.stopPropagation()}>
      <motion.button
        key={pop}
        type="button"
        initial={pop ? { scale: 0.7 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 14 }}
        onClick={onClick}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTray(t => !t); }}
        onKeyDown={e => { if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); setTray(true); } }}
        aria-label={cur ? `${cur.label} — tap to clear, hold for more` : 'Like — double-tap to love, hold for more'}
        aria-pressed={!!signal}
        aria-haspopup="menu"
        title={cur ? `${cur.label} · tap to clear · hold for more` : 'Like · double-tap to love · hold for more'}
        className={`grid place-items-center rounded-full transition-[colors,opacity] hover:bg-white/10 select-none touch-manipulation ${quiet && !signal && !tray ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''}`}
        style={{ width: box, height: box, color: cur ? cur.color : 'rgba(255,255,255,0.6)' }}
      >
        <Icon size={size} fill={cur ? 'currentColor' : 'none'} style={signal === 'LOVE' ? { filter: 'drop-shadow(0 0 6px rgba(255,46,126,0.6))' } : undefined} />
      </motion.button>

      <AnimatePresence>
        {tray && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: trayAt === 'top' ? 6 : -6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.14 }}
            className={`absolute left-1/2 -translate-x-1/2 z-[80] flex items-center gap-0.5 p-1 rounded-full border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.55)] ${trayAt === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`}
            style={{ background: 'rgba(16,10,24,0.97)' }}
          >
            {ORDER.map(s => {
              const L = LOOK[s];
              const on = signal === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  title={on ? `${L.label} — tap to clear` : s === 'UP' ? 'Like' : s === 'LOVE' ? 'Love' : 'Not for me'}
                  onClick={e => { e.stopPropagation(); setTray(false); void apply(s); }}
                  className="w-9 h-9 rounded-full grid place-items-center transition-colors hover:bg-white/10"
                  style={{ color: on ? L.color : 'rgba(255,255,255,0.7)', background: on ? 'rgba(255,255,255,0.08)' : undefined }}
                >
                  <L.Icon size={16} fill={on ? 'currentColor' : 'none'} />
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TrackReactionButton;
