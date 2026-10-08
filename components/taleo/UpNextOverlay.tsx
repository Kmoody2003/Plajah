import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import MediaThumb from '../ui/MediaThumb';

export interface UpNextItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  onPlay: () => void;
}

export interface UpNextConfig {
  items: UpNextItem[];
  /** Called when the viewer does nothing for `seconds`: leave the player, back to the film page. */
  onTimeoutExit: () => void;
  seconds?: number;
}

/**
 * Shown over the player when a film ends. A visible countdown runs on the first suggestion's
 * card; if the viewer does nothing the player exits. Any pointer/key activity cancels the
 * countdown and the overlay stays until they choose or press Back.
 */
const UpNextOverlay: React.FC<UpNextConfig> = ({ items, onTimeoutExit, seconds = 20 }) => {
  const [left, setLeft] = useState<number | null>(seconds);
  const exitRef = useRef(onTimeoutExit);
  exitRef.current = onTimeoutExit;

  // Cancel on any activity (after a short grace so the pointer that was already moving at the
  // moment the film ended does not instantly cancel).
  useEffect(() => {
    const armedAt = Date.now() + 1200;
    const cancel = () => { if (Date.now() >= armedAt) setLeft(null); };
    const evs: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'];
    evs.forEach(e => window.addEventListener(e, cancel, true));
    return () => evs.forEach(e => window.removeEventListener(e, cancel, true));
  }, []);

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) { exitRef.current(); return; }
    const t = setTimeout(() => setLeft(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);

  if (!items.length) return null;
  const shown = items.slice(0, 4);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/80 backdrop-blur-sm px-4 py-6 overflow-y-auto" role="dialog" aria-label="Suggested to watch">
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Suggested to watch</p>
        <p className="text-xs text-white/40 mt-1">
          {left !== null ? 'Doing nothing returns you to the film page.' : 'Pick something, or press Back to leave.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4 w-full max-w-4xl">
        {shown.map((it, i) => (
          <button
            key={it.id}
            type="button"
            data-tv-focusable
            autoFocus={i === 0}
            onClick={it.onPlay}
            className="group relative w-44 sm:w-52 text-left rounded-2xl overflow-hidden bg-white/[0.06] border border-white/10 hover:border-[#D0BCFF]/60 focus:border-[#D0BCFF] focus:outline-none transition-colors"
          >
            <div className="relative aspect-video bg-white/[0.05]">
              <MediaThumb
                src={it.thumbnailUrl}
                alt=""
                containerClassName="absolute inset-0"
                fit="cover"
                fallback={<div className="w-full h-full flex items-center justify-center"><Play size={20} className="text-white/30" /></div>}
              />
              {i === 0 && left !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                  <span className="w-14 h-14 rounded-full border-2 border-[#D0BCFF] flex items-center justify-center text-xl font-black text-white" aria-live="polite">{left}</span>
                </div>
              )}
            </div>
            <div className="p-3">
              {it.subtitle && <p className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] truncate">{it.subtitle}</p>}
              <p className="text-xs font-bold text-white line-clamp-2 mt-0.5">{it.title}</p>
              {i === 0 && left !== null && <p className="text-[9px] uppercase tracking-widest text-white/40 mt-1">Exiting in {left}s</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default UpNextOverlay;
