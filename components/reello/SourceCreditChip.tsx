// SourceCreditChip — attribution for a Reprise.
//
// Any video carrying `remixOfVideoId` is a derivative work. This chip resolves the source
// video's title + owner and links back to it, so a remix always shows where it came from.
// It also reads `remixStartSec`/`remixEndSec` to name the exact borrowed range.
//
// Degrades silently: no `remixOfVideoId`, or the source has been removed → renders null.

import React, { useEffect, useState } from 'react';
import { GitBranch, ArrowUpRight } from 'lucide-react';
import { Video, UserProfile } from '../../types';
import { fetchVideoById, fetchUserProfile } from '../../services/backendService';
import { buildShareUrl } from '../../services/deepLinkService';

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';

function fmt(sec?: number) {
  if (typeof sec !== 'number' || !(sec >= 0) || isNaN(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  video: Video;
  /** Open the source video in the player. Falls back to a share deep link when absent. */
  onOpenSource?: (v: Video) => void;
  className?: string;
}

const SourceCreditChip: React.FC<Props> = ({ video, onOpenSource, className }) => {
  const sourceId = video?.remixOfVideoId;
  const [source, setSource] = useState<Video | null>(null);
  const [owner, setOwner] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!sourceId) { setSource(null); setOwner(null); return; }
    let alive = true;
    (async () => {
      try {
        const v = await fetchVideoById(sourceId);
        if (!alive || !v) return;
        setSource(v);
        if (v.ownerId) {
          try {
            const p = await fetchUserProfile(v.ownerId);
            if (alive && p) setOwner(p);
          } catch { /* name is optional */ }
        }
      } catch {
        /* silent — attribution is additive, never a failure surface */
      }
    })();
    return () => { alive = false; };
  }, [sourceId]);

  // Not a remix, or the source is gone.
  if (!sourceId || !source) return null;

  const inPoint = fmt(video.remixStartSec);
  const outPoint = fmt(video.remixEndSec);
  const rangeLabel = inPoint && outPoint ? `${inPoint}–${outPoint}` : null;
  const creditName = owner?.displayName || source.artist || 'original creator';
  const thumb = source.thumbnailUrl || source.coverImageUrl;

  const open = () => {
    if (onOpenSource) { onOpenSource(source); return; }
    // No in-place handler — fall back to the canonical share deep link, which the
    // app already resolves to this video (RelloView/VideoTab `initialVideoId`).
    try { window.location.href = buildShareUrl('video', source.id); } catch { /* no-op */ }
  };

  return (
    <button
      onClick={open}
      title={`Reprised from "${source.title}"`}
      className={`group flex items-center gap-3 w-full text-left pl-2 pr-4 py-2 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-white/25 hover:bg-white/[0.07] transition-all ${className || ''}`}
    >
      <span className="w-11 h-11 rounded-xl overflow-hidden shrink-0 p-[1.5px]" style={{ background: BRAND }}>
        <span className="block w-full h-full rounded-[0.6rem] overflow-hidden bg-black">
          {thumb
            ? <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : <span className="w-full h-full flex items-center justify-center"><GitBranch size={14} className="text-white/40" /></span>}
        </span>
      </span>

      <span className="flex-1 min-w-0 leading-none">
        <span className="block text-[7.5px] font-black uppercase tracking-[0.25em] text-white/35 mb-1.5">
          Reprised from{rangeLabel ? ` · ${rangeLabel}` : ''}
        </span>
        <span className="block text-[11px] font-black uppercase tracking-widest text-white truncate">{source.title}</span>
        <span className="block mt-1 text-[9px] font-bold text-white/40 truncate">by {creditName}</span>
      </span>

      <ArrowUpRight size={15} className="text-white/25 group-hover:text-small-orange transition-colors shrink-0" />
    </button>
  );
};

export default SourceCreditChip;
