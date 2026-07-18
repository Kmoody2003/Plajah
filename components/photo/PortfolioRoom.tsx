/**
 * PortfolioRoom — Part 3C of the Experience Expansion.
 *
 * "Elegant, chrome-free gallery pages per photographer — the high end presentation layer."
 *
 * Everything in Plajah Photos is a grid with hover overlays and buttons. This is the
 * opposite: one photograph, black, no chrome. The UI is present only when you ask for it —
 * it fades out after a few seconds of stillness and returns on any movement or keypress.
 *
 * Navigation: ← / → / space / swipe. `i` toggles the caption + EXIF plate. `f` fullscreen.
 * `Esc` leaves the room.
 *
 * It renders as a portal at the top of the stack so it is genuinely full-bleed regardless
 * of where it was opened from, and it degrades silently: no EXIF, no plate; no title,
 * no caption; one photo, no counter.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Info, Maximize, Play, Pause, Aperture,
} from 'lucide-react';
import { Photo } from '../../types';
import { fetchExif, type ExifData } from '../../services/exifService';

const IDLE_MS = 2600;
const SLIDESHOW_MS = 6000;

export interface PortfolioRoomProps {
  photos: Photo[];
  /** Name shown on the (dismissable) title plate. */
  photographerName?: string;
  /** Optional one-line statement under the name. */
  statement?: string;
  initialIndex?: number;
  onClose: () => void;
}

const PortfolioRoom: React.FC<PortfolioRoomProps> = ({
  photos, photographerName, statement, initialIndex = 0, onClose,
}) => {
  // Stills only — a portfolio room is a print wall, not a feed.
  const works = useMemo(
    () => (photos || []).filter(p => p?.url && p.mediaType !== 'VIDEO'),
    [photos],
  );

  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, works.length - 1)));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [plateOpen, setPlateOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [loaded, setLoaded] = useState(false);

  const idleTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const current = works[index] || null;
  const count = works.length;

  // ── Chrome auto-hide ────────────────────────────────────────────────────────
  const wake = useCallback(() => {
    setChromeVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setChromeVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
  }, [wake]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const go = useCallback((delta: number) => {
    if (count === 0) return;
    setIndex(i => ((i + delta) % count + count) % count);
    wake();
  }, [count, wake]);

  useEffect(() => { setLoaded(false); setExif(null); }, [current?.id]);

  // EXIF is fetched lazily and only when the plate is actually opened — a portfolio
  // room should not issue a range request per photograph just to sit there.
  useEffect(() => {
    if (!plateOpen || !current?.url) return;
    let cancelled = false;
    fetchExif(current.url).then(data => { if (!cancelled) setExif(data); });
    return () => { cancelled = true; };
  }, [plateOpen, current?.url]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':     e.preventDefault(); onClose(); break;
        case 'ArrowRight':
        case 'PageDown':   e.preventDefault(); go(1); break;
        case 'ArrowLeft':
        case 'PageUp':     e.preventDefault(); go(-1); break;
        case ' ':          e.preventDefault(); setPlaying(p => !p); wake(); break;
        case 'i': case 'I': setPlateOpen(p => !p); wake(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        default: wake();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, onClose, wake]);

  // ── Slideshow ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || count < 2) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % count), SLIDESHOW_MS);
    return () => window.clearInterval(id);
  }, [playing, count]);

  // ── Fullscreen (best-effort; silently ignored where unsupported) ────────────
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else el.requestFullscreen?.();
    } catch { /* not available — no-op */ }
    wake();
  }, [wake]);

  // ── Touch / swipe ───────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    wake();
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return; // not a horizontal swipe
    go(dx < 0 ? 1 : -1);
  };

  const exifRows = useMemo(() => {
    if (!exif) return [] as { label: string; value: string }[];
    const rows: { label: string; value: string }[] = [];
    if (exif.camera)      rows.push({ label: 'Camera', value: exif.camera });
    if (exif.lens)        rows.push({ label: 'Lens', value: exif.lens });
    if (exif.focalLength) rows.push({ label: 'Focal', value: exif.focalLength });
    if (exif.aperture)    rows.push({ label: 'Aperture', value: exif.aperture });
    if (exif.shutter)     rows.push({ label: 'Shutter', value: exif.shutter });
    if (exif.iso)         rows.push({ label: 'ISO', value: exif.iso });
    if (exif.dimensions)  rows.push({ label: 'Size', value: exif.dimensions });
    if (exif.dateTaken)   rows.push({ label: 'Taken', value: exif.dateTaken });
    return rows;
  }, [exif]);

  const body = (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[9999] bg-black select-none"
      onMouseMove={wake}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-label={photographerName ? `${photographerName} — portfolio room` : 'Portfolio room'}
    >
      {/* ── The work ── */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-10 lg:p-16">
        {current ? (
          <AnimatePresence mode="wait">
            <motion.img
              key={current.id || current.url}
              src={current.url}
              alt={current.title || ''}
              onLoad={() => setLoaded(true)}
              initial={{ opacity: 0, scale: 1.012 }}
              animate={{ opacity: loaded ? 1 : 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-full max-h-full object-contain"
              style={{ boxShadow: '0 40px 120px rgba(0,0,0,0.9)' }}
              draggable={false}
              decoding="async"
            />
          </AnimatePresence>
        ) : (
          <div className="text-center">
            <Aperture size={44} className="mx-auto mb-6 text-white/10" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/25">
              This room is empty
            </p>
          </div>
        )}
      </div>

      {/* Click zones: left third back, right third forward. Deliberately invisible. */}
      {count > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Previous work"
            className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize focus:outline-none" />
          <button onClick={() => go(1)} aria-label="Next work"
            className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize focus:outline-none" />
        </>
      )}

      {/* ── Chrome (fades away) ── */}
      <AnimatePresence>
        {chromeVisible && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0"
          >
            {/* Title plate — top left */}
            <div className="pointer-events-auto absolute top-0 left-0 right-0 flex items-start justify-between gap-4 p-5 sm:p-8 bg-gradient-to-b from-black/70 to-transparent">
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.45em] text-white/35">
                  Portfolio Room
                </p>
                {photographerName && (
                  <h2 className="mt-2 text-lg sm:text-2xl font-black uppercase tracking-tight text-white truncate">
                    {photographerName}
                  </h2>
                )}
                {statement && (
                  <p className="mt-1 max-w-md text-[11px] font-medium italic text-white/35 line-clamp-2">
                    {statement}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {count > 1 && (
                  <button
                    onClick={() => { setPlaying(p => !p); wake(); }}
                    title={playing ? 'Pause slideshow (space)' : 'Play slideshow (space)'}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${
                      playing
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                )}
                <button
                  onClick={() => { setPlateOpen(p => !p); wake(); }}
                  title="Caption & EXIF (i)"
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${
                    plateOpen
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Info size={15} />
                </button>
                <button
                  onClick={toggleFullscreen}
                  title="Fullscreen (f)"
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
                >
                  <Maximize size={15} />
                </button>
                <button
                  onClick={onClose}
                  title="Leave the room (Esc)"
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Bottom rail — arrows + position */}
            <div className="pointer-events-auto absolute bottom-0 left-0 right-0 flex items-end justify-between gap-6 p-5 sm:p-8 bg-gradient-to-t from-black/70 to-transparent">
              <div className="min-w-0">
                {current?.title && (
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white/80 truncate">
                    {current.title}
                  </h3>
                )}
                {count > 0 && (
                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.35em] text-white/25 font-mono">
                    {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                  </p>
                )}
              </div>

              {count > 1 && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => go(-1)}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => go(1)}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all">
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Hairline progress — the only persistent indicator */}
            {count > 1 && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-white/5">
                <div
                  className="h-full bg-white/40 transition-all duration-500"
                  style={{ width: `${((index + 1) / count) * 100}%` }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Caption / EXIF plate — the museum wall label ── */}
      <AnimatePresence>
        {plateOpen && current && (
          <motion.div
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-1/2 -translate-y-1/2 right-4 sm:right-8 w-[min(20rem,80vw)] max-h-[70vh] overflow-y-auto custom-scrollbar
                       bg-black/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-6"
          >
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/25 mb-3">
              Wall Label
            </p>
            <h4 className="text-base font-black uppercase tracking-tight text-white leading-snug">
              {current.title || 'Untitled'}
            </h4>
            {photographerName && (
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-small-orange">
                {photographerName}
              </p>
            )}
            {current.timestamp > 0 && (
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/25">
                {new Date(current.timestamp).getFullYear()}
              </p>
            )}
            {current.description && (
              <p className="mt-4 text-[11px] font-medium italic leading-relaxed text-white/50">
                {current.description}
              </p>
            )}

            {exifRows.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/10 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">
                  Capture Data
                </p>
                {exifRows.map(row => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 shrink-0">
                      {row.label}
                    </span>
                    <span className="text-[10px] font-bold text-white/65 text-right truncate font-mono">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {current.tags && current.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {current.tags.slice(0, 8).map(tag => (
                  <span key={tag}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/35">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-6 text-[8px] font-bold uppercase tracking-[0.25em] text-white/15 leading-relaxed">
              ← → to move · i to hide this · esc to leave
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return createPortal(<AnimatePresence>{body}</AnimatePresence>, document.body);
};

export default PortfolioRoom;
