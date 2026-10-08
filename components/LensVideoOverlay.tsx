import React, { useEffect, useRef, useState } from 'react';
import { LENSES, type LensId } from '../services/lenses/lensEngine';

/**
 * Real-time lens over any <video> — viewers of a live stream, library players, anything with a ref.
 *
 * Draws the video into a canvas every frame, runs the lens engine over it, and sits exactly on top of
 * the video (same object-fit), which keeps playing underneath for audio and controls. Filtering is
 * LOCAL to the person watching; it never touches what the broadcaster publishes.
 *
 * Cross-origin sources (e.g. an HLS/MP4 host without CORS headers) can't be read by the GPU. The
 * engine detects that and the overlay hides itself, so the plain video shows through and `onStatus`
 * says why — the video never breaks.
 */
export const LensVideoOverlay: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement | null>;
  lens: LensId;
  fit?: 'cover' | 'contain';
  /** Called with a short human-readable state ('' = fine) whenever it changes. */
  onStatus?: (s: string) => void;
  className?: string;
}> = ({ videoRef, lens, fit = 'cover', onStatus, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blocked, setBlocked] = useState(false);
  const statusRef = useRef('');
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;   // callers pass inline lambdas; must not re-create the engine

  useEffect(() => {
    setBlocked(false);
    if (lens === 'none') { onStatusRef.current?.(''); return; }
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let engine: import('../services/lenses/lensEngine').LensEngine | null = null;
    let raf = 0, last = 0, dead = false, hidden = document.hidden;
    const onVis = () => { hidden = document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    const report = (s: string) => { if (s !== statusRef.current) { statusRef.current = s; onStatusRef.current?.(s); } };

    import('../services/lenses/lensEngine').then(m => {
      if (dead) return;
      engine = new m.LensEngine();
      engine.setLens(lens);
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = performance.now();
        if (hidden || t - last < 31) return;               // ~30fps: matches the stream, spares the battery
        last = t;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh || video.readyState < 2) return;
        // Canvas carries the video's own aspect (capped for power); CSS object-fit then crops it
        // exactly like the <video> beneath, so the two never disagree about framing.
        const k = Math.min(1, 1280 / Math.max(vw, vh));
        const w = Math.max(2, Math.round(vw * k / 2) * 2), h = Math.max(2, Math.round(vh * k / 2) * 2);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        try { ctx.drawImage(video, 0, 0, w, h); } catch { return; }
        engine!.apply(ctx, canvas, video, t, 'contain');   // canvas already has the video's aspect
        const st = engine!.getStatus();
        report(st);
        if (/blocks filters/.test(st)) setBlocked(true);
      };
      tick();
    });

    return () => {
      dead = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      engine?.dispose();
      statusRef.current = '';
    };
  }, [lens, videoRef]);

  if (lens === 'none' || blocked) return null;
  return (
    <canvas ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} />
  );
};

/** Compact lens chooser — used in the broadcaster's carousel, the viewer, and players. */
export const LensPicker: React.FC<{
  value: LensId;
  onChange: (id: LensId) => void;
  status?: string;
  busy?: boolean;
  compact?: boolean;
}> = ({ value, onChange, status, busy, compact }) => (
  <div>
    <div className={compact ? 'flex gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
      {LENSES.map(l => (
        <button key={l.id} disabled={busy} onClick={() => onChange(l.id)}
          className={`rounded-xl text-left transition-all disabled:opacity-50 ${compact ? 'px-2.5 py-1.5 text-[11px] font-bold' : 'px-3 py-2.5'} ${value === l.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/85'}`}>
          <span className={compact ? '' : 'text-[18px] mr-1.5'}>{l.icon}</span>
          <span className={compact ? '' : 'text-[12px] font-black'}>{l.label}</span>
          {!compact && <span className={`block text-[9px] leading-tight mt-0.5 ${value === l.id ? 'text-black/60' : 'text-white/40'}`}>{l.blurb}</span>}
        </button>
      ))}
    </div>
    {status && <p className="text-[9px] text-amber-300/80 pt-1.5 px-0.5">{status}</p>}
  </div>
);
