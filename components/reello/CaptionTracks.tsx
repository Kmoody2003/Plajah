// CaptionTracks — real WebVTT subtitles on the Plajah player.
//
// `Video.subtitles` is a list of { label, srclang, url, default? }. Two pieces here:
//
//   <SubtitleTracks video={video} />   → the actual <track> children, rendered INSIDE <video>
//   <CaptionToggle ... />              → a CC button that drives video.textTracks
//
// The <track> elements are the standards-compliant part; the toggle exists because we hide the
// native controls, so the browser's own CC menu is unreachable.
//
// Degrades silently: no `subtitles` (or an empty list) → both render null.

import React, { useCallback, useEffect, useState } from 'react';
import { Captions, CaptionsOff, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Video } from '../../types';

export interface SubtitleTrack {
  label: string;
  srclang: string;
  url: string;
  default?: boolean;
}

/** Only tracks with both a URL and a language are renderable. */
export function usableSubtitles(video?: Video | null): SubtitleTrack[] {
  const list = video?.subtitles;
  if (!Array.isArray(list) || !list.length) return [];
  return list.filter(t => !!t?.url && !!t?.srclang);
}

// ── <track> children ──────────────────────────────────────────────────────────

/**
 * Render as a direct child of <video>. Cross-origin VTT needs CORS on the host, so we set
 * crossOrigin on the <video> itself at the call site when subtitles are present.
 */
export const SubtitleTracks: React.FC<{ video: Video }> = ({ video }) => {
  const tracks = usableSubtitles(video);
  if (!tracks.length) return null;
  return (
    <>
      {tracks.map((t, i) => (
        <track
          key={`${t.srclang}_${i}`}
          kind="subtitles"
          src={t.url}
          srcLang={t.srclang}
          label={t.label || t.srclang.toUpperCase()}
          default={!!t.default}
        />
      ))}
    </>
  );
};

// ── CC toggle ─────────────────────────────────────────────────────────────────

interface ToggleProps {
  video: Video;
  /** The live <video> element whose textTracks we drive. */
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  className?: string;
}

export const CaptionToggle: React.FC<ToggleProps> = ({ video, videoElRef, className }) => {
  const tracks = usableSubtitles(video);
  const [menuOpen, setMenuOpen] = useState(false);
  // index into `tracks`, or -1 for off
  const [activeIdx, setActiveIdx] = useState<number>(() => {
    const d = tracks.findIndex(t => t.default);
    return d >= 0 ? d : -1;
  });

  // Reset when the video changes.
  useEffect(() => {
    const d = tracks.findIndex(t => t.default);
    setActiveIdx(d >= 0 ? d : -1);
    setMenuOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  // Push the selection onto the element's TextTrackList. The list populates
  // asynchronously, so retry briefly until the tracks exist.
  const apply = useCallback((idx: number) => {
    const el = videoElRef.current;
    if (!el) return;
    const tt = el.textTracks;
    if (!tt) return;
    for (let i = 0; i < tt.length; i++) {
      tt[i].mode = i === idx ? 'showing' : 'disabled';
    }
  }, [videoElRef]);

  useEffect(() => {
    if (!tracks.length) return;
    apply(activeIdx);
    // The <track> elements may not be registered on the first tick.
    const t1 = setTimeout(() => apply(activeIdx), 250);
    const t2 = setTimeout(() => apply(activeIdx), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeIdx, apply, tracks.length, video?.id]);

  if (!tracks.length) return null;

  const on = activeIdx >= 0;
  const single = tracks.length === 1;

  const primary = () => {
    if (single) { setActiveIdx(i => (i >= 0 ? -1 : 0)); return; }
    setMenuOpen(o => !o);
  };

  return (
    <div className={`relative ${className || ''}`} onClick={e => e.stopPropagation()}>
      <button
        onClick={primary}
        title={on ? 'Captions on' : 'Captions off'}
        className={`p-2.5 transition-colors ${on ? 'text-small-orange' : 'text-white hover:text-white/80'}`}
      >
        {on ? <Captions size={18} /> : <CaptionsOff size={18} />}
      </button>

      <AnimatePresence>
        {menuOpen && !single && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-full right-0 mb-2 min-w-[11rem] p-1.5 bg-black/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.7)] z-50"
          >
            <p className="px-3 pt-2 pb-1.5 text-[7.5px] font-black uppercase tracking-[0.25em] text-white/30">Subtitles</p>
            <button
              onClick={() => { setActiveIdx(-1); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-left"
            >
              <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-white/70">Off</span>
              {activeIdx === -1 && <Check size={12} className="text-small-orange shrink-0" />}
            </button>
            {tracks.map((t, i) => (
              <button
                key={`${t.srclang}_${i}`}
                onClick={() => { setActiveIdx(i); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-left"
              >
                <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-white/70 truncate">
                  {t.label || t.srclang.toUpperCase()}
                </span>
                {activeIdx === i && <Check size={12} className="text-small-orange shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SubtitleTracks;
