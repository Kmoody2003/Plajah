// WatchLaterButton — one-tap save to the reserved "Watch Later" system playlist.
//
// Shares a module-level cache of the caller's Watch Later videoIds so a grid of 30 cards costs
// one Firestore read, not 30. The cache is updated optimistically on toggle.

import React, { useEffect, useState } from 'react';
import { Clock, Check, Loader2 } from 'lucide-react';
import { Video } from '../../types';
import { auth, fetchWatchLaterPlaylist, toggleWatchLater } from '../../services/backendService';

// ── Shared saved-id cache ────────────────────────────────────────────────────
let cachedIds: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => { try { l(); } catch { /* */ } });

async function loadSavedIds(): Promise<Set<string>> {
  if (cachedIds) return cachedIds;
  if (inflight) return inflight;
  inflight = (async () => {
    const pl = await fetchWatchLaterPlaylist().catch(() => null);
    cachedIds = new Set(pl?.videoIds || []);
    inflight = null;
    return cachedIds;
  })();
  return inflight;
}

/** Drop the cache — call after mutating Watch Later outside this component. */
export const invalidateWatchLaterCache = () => { cachedIds = null; inflight = null; notify(); };

interface Props {
  video: Video | any;
  /** `icon` = bare icon button for card overlays; `pill` = labelled chip for detail views. */
  variant?: 'icon' | 'pill';
  className?: string;
}

const WatchLaterButton: React.FC<Props> = ({ video, variant = 'icon', className }) => {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoId = video?.id as string | undefined;

  useEffect(() => {
    if (!videoId || !auth.currentUser) return;
    let alive = true;
    const sync = () => { loadSavedIds().then(ids => { if (alive) setSaved(ids.has(videoId)); }); };
    sync();
    listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, [videoId]);

  if (!videoId || !auth.currentUser) return null;

  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);                                     // optimistic
    try {
      const result = await toggleWatchLater(video);
      setSaved(result);
      const ids = cachedIds || new Set<string>();
      result ? ids.add(videoId) : ids.delete(videoId);
      cachedIds = ids;
      notify();
    } catch {
      setSaved(!next);                                  // roll back
    } finally {
      setBusy(false);
    }
  };

  const title = saved ? 'Remove from Watch Later' : 'Save to Watch Later';
  const Icon = busy ? Loader2 : saved ? Check : Clock;

  if (variant === 'pill') {
    return (
      <button
        onClick={handle}
        title={title}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-black text-[9px] uppercase tracking-widest transition-all ${
          saved ? 'bg-small-orange/15 border-small-orange/40 text-small-orange' : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
        } ${className || ''}`}
      >
        <Icon size={13} className={busy ? 'animate-spin' : ''} />
        {saved ? 'Saved' : 'Watch Later'}
      </button>
    );
  }

  return (
    <button
      onClick={handle}
      title={title}
      className={`p-2 transition-colors shrink-0 ${saved ? 'text-small-orange' : 'text-white/20 hover:text-small-orange opacity-0 group-hover:opacity-100'} ${className || ''}`}
    >
      <Icon size={14} className={busy ? 'animate-spin' : ''} />
    </button>
  );
};

export default WatchLaterButton;
