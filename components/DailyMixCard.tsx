// DailyMixCard — "Your Daily Mix" hero for the For You tab.
//
// Chora presents a personalized ≤40-minute mix as if the mascot made it just for you: your name in
// the copy, a "why this mix" overview, and a line of insight about an artist inside. Plays via the
// existing onSelectAlbum path (the mix is a synthetic Album).
//
// NOTE on the mascot: the Kith creature "Chora the kaiju" is embargoed (its likeness must not be
// surfaced outside the sightings game), so the curator avatar here is an abstract Chora brand mark,
// NOT the creature. Swap CuratorMark for the real art only once the embargo is lifted for this surface.

import React, { useEffect, useState } from 'react';
import { Play, Sparkles, RefreshCw } from 'lucide-react';
import type { Album } from '../types';
import { buildDailyMix, type DailyMix } from '../services/dailyMixService';
import { auth } from '../services/backendService';

const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

// Abstract, embargo-safe "Chora" curator mark — a soft gradient orb with a gentle pulse.
const CuratorMark: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
    <div className="absolute inset-0 rounded-[36%] animate-pulse"
      style={{ background: 'radial-gradient(120% 120% at 30% 25%, #00DAF3, transparent 55%), radial-gradient(120% 120% at 75% 85%, #FF8C00, transparent 55%), linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 8px 30px rgba(212,0,85,.45), inset 0 1px 0 rgba(255,255,255,.3)' }} />
    <div className="absolute inset-0 grid place-items-center">
      <Sparkles size={size * 0.4} className="text-white/90 drop-shadow" />
    </div>
  </div>
);

interface DailyMixCardProps {
  onSelectAlbum: (album: Album) => void;
  className?: string;
}

const DailyMixCard: React.FC<DailyMixCardProps> = ({ onSelectAlbum, className = '' }) => {
  const [mix, setMix] = useState<DailyMix | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    try { const m = await buildDailyMix({ force }); setMix(m); }
    catch { /* leave null */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!auth.currentUser) return null;

  if (loading) {
    return (
      <div className={`rounded-3xl border border-white/10 bg-white/[0.03] p-6 ${className}`}>
        <div className="flex items-center gap-4">
          <CuratorMark />
          <div className="flex-1">
            <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-64 rounded bg-white/5 animate-pulse mt-2" />
          </div>
        </div>
      </div>
    );
  }
  if (!mix || mix.trackCount === 0) return null;

  return (
    <div className={`relative rounded-3xl overflow-hidden border border-white/12 ${className}`}
      style={{ background: 'radial-gradient(120% 130% at 88% -10%, rgba(212,0,85,.22), transparent 55%), radial-gradient(90% 120% at 4% 110%, rgba(0,218,243,.14), transparent 55%), linear-gradient(160deg,#150c22,#0b0813 60%,#100a12)' }}>
      <div className="p-6 sm:p-7">
        {/* header */}
        <div className="flex items-start gap-4">
          <CuratorMark />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#D0BCFF]">
              Made by Chora · for {mix.greetingName}
            </div>
            <h2 className="font-black tracking-tight text-2xl sm:text-3xl mt-1 text-white">Your Daily Mix</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-semibold text-white/50">
              <span>{mix.trackCount} tracks</span><span>·</span><span>{fmtMin(mix.durationSec)}</span>
              {mix.topGenres.length > 0 && <><span>·</span><span className="truncate">{mix.topGenres.join(' / ')}</span></>}
            </div>
          </div>
          <button onClick={() => load(true)} disabled={refreshing} title="Rebuild today's mix"
            className="shrink-0 w-9 h-9 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* overview */}
        <p className="text-white/80 text-[14.5px] leading-relaxed mt-4 max-w-[62ch]">{mix.overview}</p>
        {mix.insight && (
          <p className="text-white/55 text-[12.5px] italic mt-2 max-w-[62ch]">“{mix.insight}”</p>
        )}

        {/* play */}
        <div className="flex items-center gap-3 mt-5">
          <button onClick={() => onSelectAlbum(mix.album)}
            className="flex items-center gap-2.5 pl-4 pr-6 py-3 rounded-full text-white font-black text-sm uppercase tracking-wide shadow-xl hover:scale-[1.02] active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)' }}>
            <Play size={18} fill="currentColor" /> Play the mix
          </button>
          <span className="text-[11px] text-white/35 font-medium">Refreshes daily · heart tracks to teach me your taste</span>
        </div>
      </div>
    </div>
  );
};

export default DailyMixCard;
