// TrackReactions — the 👍 / ❤️ / 👎 taste control for a music track.
//
// Like (thumbs up), Love (heart), Dislike (thumbs down). Writes through tasteService, which stores
// the per-user reaction and feeds the recommender + Daily Mix. Reads the module cache and stays in
// sync via the 'taste:changed' event, so every instance of a track's control updates together.
// Works for native Chora, personal-library, and Audius tracks alike (the id carries the source).

import React, { useEffect, useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Heart } from 'lucide-react';
import type { Track, Album } from '../types';
import { getTrackReaction, setTrackReaction, loadMyReactions, type TasteSignal } from '../services/tasteService';
import { auth } from '../services/backendService';

interface TrackReactionsProps {
  track: Track;
  album?: Album | null;
  size?: number;
  /** 'bar' = spaced pill row (player), 'inline' = compact (track rows). */
  variant?: 'bar' | 'inline';
  className?: string;
  onNeedSignIn?: () => void;
}

const TrackReactions: React.FC<TrackReactionsProps> = ({
  track, album = null, size = 18, variant = 'bar', className = '', onNeedSignIn,
}) => {
  const [signal, setSignal] = useState<TasteSignal | undefined>(() => getTrackReaction(track.id));
  const [busy, setBusy] = useState(false);

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

  const react = useCallback(async (s: TasteSignal) => {
    if (!auth.currentUser) { onNeedSignIn ? onNeedSignIn() : alert('Sign in to rate music — it teaches Chora your taste.'); return; }
    if (busy) return;
    setBusy(true);
    const prev = signal;
    setSignal(s === prev ? undefined : s); // optimistic
    try { await setTrackReaction(track, album, s); }
    catch { setSignal(prev); }
    finally { setBusy(false); }
  }, [busy, signal, track, album, onNeedSignIn]);

  const gap = variant === 'inline' ? 'gap-0.5' : 'gap-1.5';
  const pad = variant === 'inline' ? 'p-1.5' : 'p-2';
  const btn = (active: boolean, activeCls: string) =>
    `${pad} rounded-full transition-all ${active ? activeCls : 'text-white/45 hover:text-white hover:bg-white/10'} ${busy ? 'opacity-60' : ''}`;

  return (
    <div className={`flex items-center ${gap} ${className}`} role="group" aria-label="Rate this track">
      <button type="button" onClick={() => react('UP')} disabled={busy} title="Like"
        aria-pressed={signal === 'UP'}
        className={btn(signal === 'UP', 'text-[#00DAF3] bg-[#00DAF3]/12')}>
        <ThumbsUp size={size} fill={signal === 'UP' ? 'currentColor' : 'none'} />
      </button>
      <button type="button" onClick={() => react('LOVE')} disabled={busy} title="Love"
        aria-pressed={signal === 'LOVE'}
        className={btn(signal === 'LOVE', 'text-[#D40055] bg-[#D40055]/14')}>
        <Heart size={size} fill={signal === 'LOVE' ? 'currentColor' : 'none'} className={signal === 'LOVE' ? 'drop-shadow-[0_0_6px_rgba(212,0,85,0.6)]' : ''} />
      </button>
      <button type="button" onClick={() => react('DOWN')} disabled={busy} title="Not for me"
        aria-pressed={signal === 'DOWN'}
        className={btn(signal === 'DOWN', 'text-white/80 bg-white/12')}>
        <ThumbsDown size={size} fill={signal === 'DOWN' ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
};

export default TrackReactions;
