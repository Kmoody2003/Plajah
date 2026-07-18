// WhatIfBranching — Reello's interactive "What If" format.
//
// A Video may carry `whatIfBranchPoints`: creator-authored decision points on the timeline.
// When the playhead reaches one, playback PAUSES and the viewer is offered the alternate
// continuations. A choice can:
//   • seek elsewhere in the SAME video          (choice.jumpsToTimestamp)
//   • load a different video entirely            (choice.jumpsToVideoId [+ jumpsToVideoTimestamp])
//   • or the viewer can decline and keep watching (always offered — never a dead end)
//
// Degrades silently: no whatIfBranchPoints → renders null and installs no effects.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GitBranch, Play, ArrowRight, Loader2, X } from 'lucide-react';
import { Video, WhatIfBranchPoint, WhatIfChoice } from '../../types';
import { fetchVideoById } from '../../services/backendService';

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';

/** How long after a branch timestamp we still consider it "reached" (handles coarse timeupdate). */
const CATCH_WINDOW_SEC = 2.5;

interface Props {
  video: Video;
  /** Current playhead position in seconds. */
  currentTime: number;
  /** Pause playback (the branch point owns the stage). */
  onPause: () => void;
  /** Resume playback after a decision. */
  onResume: () => void;
  /** Seek within the current video. */
  onSeek: (sec: number) => void;
  /** Swap the player to a different video (alternate scene / ending), optionally at an in-point. */
  onPlayVideo?: (v: Video, startSec?: number) => void;
  className?: string;
}

const WhatIfBranching: React.FC<Props> = ({
  video, currentTime, onPause, onResume, onSeek, onPlayVideo, className,
}) => {
  const points = video?.whatIfBranchPoints;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingChoice, setLoadingChoice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef(0);

  // Reset per-video state so a re-watch (or a branch jump) re-arms the points.
  useEffect(() => {
    firedRef.current = new Set();
    lastTimeRef.current = 0;
    setActiveId(null);
    setLoadingChoice(null);
    setLoadError(null);
  }, [video?.id]);

  // Only points that actually offer somewhere to go are worth pausing for.
  const usable: WhatIfBranchPoint[] = useMemo(() => {
    if (!points?.length) return [];
    return points
      .filter(p => p && typeof p.timestamp === 'number' && p.timestamp >= 0 && !!p.choices?.length)
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [points]);

  // ── Trip the branch point when the playhead crosses it ──────────────────────
  useEffect(() => {
    if (!usable.length) return;
    if (activeId) return;                       // already showing one
    if (!(currentTime >= 0) || isNaN(currentTime)) return;

    const prev = lastTimeRef.current;
    lastTimeRef.current = currentTime;

    // A backwards seek re-arms every point after the new position.
    if (currentTime < prev - 1) {
      for (const p of usable) if (p.timestamp > currentTime) firedRef.current.delete(p.id);
      return;
    }

    for (const p of usable) {
      if (firedRef.current.has(p.id)) continue;
      const reached = currentTime >= p.timestamp && currentTime <= p.timestamp + CATCH_WINDOW_SEC;
      if (!reached) continue;
      firedRef.current.add(p.id);
      onPause();
      setActiveId(p.id);
      break;
    }
  }, [currentTime, usable, activeId, onPause]);

  const active = activeId ? usable.find(p => p.id === activeId) || null : null;

  const dismiss = useCallback(() => {
    setActiveId(null);
    setLoadingChoice(null);
    setLoadError(null);
    onResume();
  }, [onResume]);

  const pick = useCallback(async (choice: WhatIfChoice) => {
    setLoadError(null);

    // Same-video jump — cheapest path, no fetch.
    if (typeof choice.jumpsToTimestamp === 'number' && !choice.jumpsToVideoId) {
      setActiveId(null);
      onSeek(Math.max(0, choice.jumpsToTimestamp));
      onResume();
      return;
    }

    // Alternate video.
    if (choice.jumpsToVideoId) {
      if (!onPlayVideo) { setLoadError('This branch opens another video, which this player cannot load.'); return; }
      setLoadingChoice(choice.id);
      try {
        const next = await fetchVideoById(choice.jumpsToVideoId);
        if (!next) { setLoadError('That continuation is no longer available.'); setLoadingChoice(null); return; }
        setActiveId(null);
        setLoadingChoice(null);
        // Carry the requested in-point so the player can seek once duration is known.
        const startSec = typeof choice.jumpsToVideoTimestamp === 'number'
          ? Math.max(0, choice.jumpsToVideoTimestamp)
          : undefined;
        onPlayVideo(next, startSec);
      } catch {
        setLoadError('Could not load that continuation.');
        setLoadingChoice(null);
      }
      return;
    }

    // A choice with no destination just continues the story.
    dismiss();
  }, [onPlayVideo, onResume, onSeek, dismiss]);

  // Nothing branching on this video — render nothing at all.
  if (!usable.length) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 z-40 ${className || ''}`}>
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ y: 22, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 22, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              className="w-full max-w-lg max-h-full overflow-y-auto bg-[#0a0a0a]/97 border border-white/10 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.85)]"
            >
              {/* Header */}
              <div className="relative p-5 pb-4 flex items-start gap-3.5">
                <span className="shrink-0 w-10 h-10 rounded-2xl p-[1.5px]" style={{ background: BRAND }}>
                  <span className="w-full h-full rounded-2xl bg-black flex items-center justify-center">
                    <GitBranch size={16} className="text-white" />
                  </span>
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/35 mb-1.5">What if…</p>
                  <h3 className="text-lg font-display font-black tracking-tight text-white leading-snug">{active.question}</h3>
                </div>
                <button
                  onClick={dismiss}
                  title="Keep watching"
                  className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Choices */}
              <div className="px-5 pb-5 space-y-2">
                {active.choices.map(c => {
                  const busy = loadingChoice === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pick(c)}
                      disabled={!!loadingChoice}
                      className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-white/25 hover:bg-white/[0.08] transition-all disabled:opacity-40"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-widest text-white truncate">{c.label}</span>
                        {c.description && (
                          <span className="block mt-1 text-[10px] text-white/45 leading-relaxed line-clamp-2">{c.description}</span>
                        )}
                      </span>
                      {busy
                        ? <Loader2 size={15} className="text-white/50 animate-spin shrink-0" />
                        : <ArrowRight size={15} className="text-small-orange shrink-0" />}
                    </button>
                  );
                })}

                {loadError && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400/80 pt-1">{loadError}</p>
                )}

                {/* Always an exit — an interactive video must never trap the viewer. */}
                <button
                  onClick={dismiss}
                  disabled={!!loadingChoice}
                  className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 text-white/40 hover:text-white/80 transition-all text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  <Play size={12} /> Keep watching
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WhatIfBranching;
