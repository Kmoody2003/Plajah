// OriginBadge — the small, mountable "where did this come from?" chip for the
// Creator Passport provenance layer (blueprint 1C.5).
//
// Wording discipline: this badge NEVER says "verified", "proven", "authentic", or
// anything else implying cryptography. Plajah does not sign or anchor provenance yet
// (see the honesty note at the top of services/creatorPassport.ts) — the badge reports
// what the platform RECORDED, and says plainly when it recorded nothing. If you are
// tempted to add a checkmark icon here, don't: a checkmark reads as verification.
//
// Mount it anywhere a video is shown:
//   <OriginBadge video={video} onOpenOrigin={id => openVideo(id)} />
// It self-resolves, renders nothing while loading, and renders nothing at all when
// there is no provenance and no remix link (silent degradation on legacy content),
// unless you pass `showWhenUnknown`.

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GitBranch, Fingerprint, Info } from 'lucide-react';
import type { Video } from '../types';
import { resolveOrigin, describeProvenance, isPlaceholderPassport, type OriginResolution } from '../services/creatorPassport';

const OriginBadge: React.FC<{
  video: Pick<Video, 'id' | 'ownerId'> & Partial<Video>;
  /** Open the origin work. Omit to render the badge non-interactively. */
  onOpenOrigin?: (videoId: string) => void;
  /** Render a muted "no origin record" chip instead of nothing. Default false. */
  showWhenUnknown?: boolean;
  className?: string;
}> = ({ video, onOpenOrigin, showWhenUnknown = false, className }) => {
  const [res, setRes] = useState<OriginResolution | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRes(null);
    resolveOrigin(video)
      .then(r => { if (!cancelled) setRes(r); })
      .catch(() => { /* silent — the badge simply won't render */ });
    return () => { cancelled = true; };
  }, [video.id]);

  if (!res) return null;
  if (res.reason && !showWhenUnknown) return null;

  const unknown = !!res.reason;
  const derived = !unknown && !res.isOriginal;
  const originTitle = res.origin?.title;
  const originCreator = res.origin?.artist;

  const tone = unknown
    ? 'border-white/8 bg-white/[0.03] text-white/35'
    : derived
      ? 'border-[#FFB68D]/25 bg-[#FFB68D]/10 text-[#FFB68D]'
      : 'border-[#D0BCFF]/25 bg-[#D0BCFF]/10 text-[#D0BCFF]';

  return (
    <div className={className}>
      <motion.button
        type="button"
        whileHover={{ scale: unknown ? 1 : 1.02 }}
        onClick={() => setExpanded(v => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition-colors ${tone}`}
        title={describeProvenance(res)}
      >
        {derived ? <GitBranch size={10} /> : <Fingerprint size={10} />}
        {unknown ? 'No origin record' : derived ? 'Derived work' : 'Origin on Plajah'}
      </motion.button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 max-w-sm rounded-2xl border border-white/8 bg-black/60 backdrop-blur-xl p-3.5"
        >
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35 mb-2">Provenance</p>
          <p className="text-[11.5px] leading-relaxed text-white/70">{describeProvenance(res)}</p>

          {derived && res.originVideoId && (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Traces back to</p>
              <button
                type="button"
                disabled={!onOpenOrigin}
                onClick={() => onOpenOrigin && res.originVideoId && onOpenOrigin(res.originVideoId)}
                className={`text-left text-xs font-bold text-white truncate w-full ${onOpenOrigin ? 'hover:text-[#D0BCFF] transition-colors' : 'cursor-default'}`}
              >
                {originTitle || res.originVideoId}
              </button>
              {originCreator && <p className="text-[10px] text-white/40 mt-0.5 truncate">by {originCreator}</p>}
            </div>
          )}

          {/* The honest caveat, shown in the UI rather than buried in a comment. */}
          <div className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/30">
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>
              {isPlaceholderPassport(video.provenance?.passportId)
                ? 'This is an attribution record kept by Plajah, not a cryptographic proof. It is not signed or independently verifiable.'
                : 'Attribution record kept by Plajah.'}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default OriginBadge;
