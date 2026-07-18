// RepriseButton — "Reprise" is Plajah's stitch/duet, but on a real NLE.
//
// Pull an in/out range of the video you're watching into FABULA as a pre-licensed clip. The
// button self-hides when the source isn't licensed for derivatives (All Rights Reserved / -ND),
// so it only ever appears where reuse is actually granted.
//
// Degrades silently: no playable source, or an unlicensed source → renders null.

import React, { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, X, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { Video } from '../../types';
import {
  checkRepriseEligibility, clampRepriseRange, startReprise,
  REPRISE_MAX_SEC, REPRISE_MIN_SEC,
} from '../../services/remixService';

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';

function fmt(sec: number) {
  if (!(sec >= 0) || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  video: Video;
  /** Video duration in seconds — bounds the range picker. */
  duration: number;
  /** Current playhead — seeds the in-point. */
  currentTime: number;
  /** Display name of the source creator, for the attribution string. */
  ownerName?: string;
  /** Pause the player while the picker is open. */
  onPause?: () => void;
  variant?: 'pill' | 'icon';
  className?: string;
}

const RepriseButton: React.FC<Props> = ({
  video, duration, currentTime, ownerName, onPause, variant = 'pill', className,
}) => {
  const eligibility = useMemo(
    () => checkRepriseEligibility(video, ownerName),
    [video, ownerName],
  );

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);

  const maxDur = duration > 0 && !isNaN(duration) ? duration : 0;

  const openPicker = useCallback(() => {
    const inPoint = Math.max(0, Math.min(currentTime || 0, Math.max(0, maxDur - REPRISE_MIN_SEC)));
    const outPoint = maxDur > 0
      ? Math.min(maxDur, inPoint + Math.min(REPRISE_MAX_SEC, 15))
      : inPoint + 15;
    setStartSec(inPoint);
    setEndSec(outPoint);
    setError(null);
    onPause?.();
    setOpen(true);
  }, [currentTime, maxDur, onPause]);

  const range = clampRepriseRange({ startSec, endSec }, maxDur || undefined);
  const span = range.endSec - range.startSec;

  const confirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startReprise(
        video,
        { startSec: range.startSec, endSec: range.endSec },
        { durationSec: maxDur || undefined, ownerName },
      );
      if (!result) { setError('This video is not licensed for reuse.'); setBusy(false); return; }
      setOpen(false);
      setBusy(false);
    } catch {
      setError('Could not hand this clip to Fabula.');
      setBusy(false);
    }
  }, [video, range.startSec, range.endSec, maxDur, ownerName]);

  // Not licensed for reuse (or nothing playable) — the affordance simply doesn't exist.
  if (!eligibility.ok) return null;

  const trigger = variant === 'icon' ? (
    <button
      onClick={openPicker}
      title="Reprise this clip in Fabula"
      className={`p-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all ${className || ''}`}
    >
      <Scissors size={15} />
    </button>
  ) : (
    <button
      onClick={openPicker}
      title="Reprise this clip in Fabula"
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white font-black text-[9px] uppercase tracking-widest transition-all ${className || ''}`}
    >
      <Scissors size={15} /> Reprise
    </button>
  );

  return (
    <>
      {trigger}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[520] bg-black/80 backdrop-blur-2xl flex items-end sm:items-center justify-center p-3 sm:p-6"
            onClick={e => { e.stopPropagation(); if (!busy) setOpen(false); }}
          >
            <motion.div
              initial={{ y: 24, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg max-h-full overflow-y-auto bg-[#0a0a0a]/97 border border-white/10 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.85)]"
            >
              {/* Header */}
              <div className="p-5 pb-4 flex items-start gap-3.5">
                <span className="shrink-0 w-10 h-10 rounded-2xl p-[1.5px]" style={{ background: BRAND }}>
                  <span className="w-full h-full rounded-2xl bg-black flex items-center justify-center">
                    <Scissors size={16} className="text-white" />
                  </span>
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/35 mb-1.5">Reprise</p>
                  <h3 className="text-lg font-display font-black tracking-tight text-white leading-snug truncate">{video.title}</h3>
                </div>
                <button
                  onClick={() => !busy && setOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 pb-5 space-y-5">
                <p className="text-[10px] text-white/45 leading-relaxed">
                  Pick the range you want to borrow. It opens in Fabula as a pre-licensed clip on a
                  real timeline — cut it, build around it, publish it with credit intact.
                </p>

                {/* Range readout */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/8">
                  <div className="flex-1">
                    <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">In</p>
                    <p className="text-sm font-black tabular-nums text-white">{fmt(range.startSec)}</p>
                  </div>
                  <ArrowRight size={14} className="text-white/25 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Out</p>
                    <p className="text-sm font-black tabular-nums text-white">{fmt(range.endSec)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/30 mb-1">Length</p>
                    <p className="text-sm font-black tabular-nums text-small-orange">{span.toFixed(1)}s</p>
                  </div>
                </div>

                {/* In / Out sliders */}
                {maxDur > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">In point</label>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, maxDur - REPRISE_MIN_SEC)}
                        step={0.1}
                        value={startSec}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setStartSec(v);
                          if (endSec <= v + REPRISE_MIN_SEC) setEndSec(Math.min(maxDur, v + REPRISE_MIN_SEC));
                        }}
                        className="w-full accent-[#FF8C00]"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Out point</label>
                      <input
                        type="range"
                        min={REPRISE_MIN_SEC}
                        max={maxDur}
                        step={0.1}
                        value={endSec}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setEndSec(v);
                          if (v - startSec > REPRISE_MAX_SEC) setStartSec(v - REPRISE_MAX_SEC);
                          if (v <= startSec) setStartSec(Math.max(0, v - REPRISE_MIN_SEC));
                        }}
                        className="w-full accent-[#FF8C00]"
                      />
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/25">
                      Up to {REPRISE_MAX_SEC}s
                    </p>
                  </div>
                ) : (
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                    Duration unknown — the first {REPRISE_MAX_SEC}s will be used.
                  </p>
                )}

                {/* License grant */}
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/5">
                  <ShieldCheck size={13} className="text-emerald-400/80 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/35 mb-1">
                      Licensed · {eligibility.license.label}
                    </p>
                    <p className="text-[10px] text-white/45 leading-relaxed">
                      {eligibility.attribution || eligibility.license.human}
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400/80">{error}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => !busy && setOpen(false)}
                    className="px-5 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white/60 font-black text-[9px] uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirm}
                    disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-black hover:bg-[#FF8C00] hover:text-white font-black text-[9px] uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {busy
                      ? <><Loader2 size={13} className="animate-spin" /> Opening Fabula…</>
                      : <><Scissors size={13} /> Reprise in Fabula</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default RepriseButton;
