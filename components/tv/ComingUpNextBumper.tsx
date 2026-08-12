import React from 'react';
import { Tv } from 'lucide-react';

/**
 * ComingUpNextBumper — the standard Plajah-branded "coming up next" interstitial for TV/FAST channels.
 * Lists the next 3 programmes with the channel identity, in the Plajah brand palette. Purely
 * presentational (16:9), rendered absolute inset-0 over the player during breaks/bumpers.
 */

export interface UpNextItem {
  title: string;
  thumbnail?: string;
  timeLabel?: string;
  badge?: string;
}

const ORANGE = '#FF8C00';
const PURPLE = '#6B0099';
const MAGENTA = '#D40055';

interface Props {
  channelName: string;
  logoUrl?: string;
  items: UpNextItem[];
  accent?: string;
}

const ComingUpNextBumper: React.FC<Props> = ({ channelName, logoUrl, items, accent = ORANGE }) => {
  const three = items.slice(0, 3);
  return (
    <div className="absolute inset-0 overflow-hidden select-none" style={{ background: 'radial-gradient(130% 110% at 50% -10%, #22003f 0%, #0a0512 55%, #04030a 100%)' }}>
      {/* brand glows */}
      <div className="absolute -top-1/3 -left-1/4 w-[65%] h-[65%] rounded-full blur-[130px] opacity-45" style={{ background: PURPLE }} />
      <div className="absolute -bottom-1/3 -right-1/4 w-[65%] h-[65%] rounded-full blur-[130px] opacity-45" style={{ background: MAGENTA }} />
      <div className="absolute top-1/4 right-1/3 w-[30%] h-[30%] rounded-full blur-[120px] opacity-25" style={{ background: ORANGE }} />

      <div className="relative h-full flex flex-col justify-center gap-6 px-[6%] py-[5%]">
        {/* channel identity */}
        <div className="flex items-center gap-4">
          {logoUrl
            ? <img src={logoUrl} className="w-12 h-12 rounded-2xl object-cover border border-white/20" alt="" />
            : <div className="w-12 h-12 rounded-2xl grid place-items-center border border-white/15" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${MAGENTA})` }}><Tv size={22} className="text-white" /></div>}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.55em] text-white/45">Plajah TV</p>
            <p className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">{channelName}</p>
          </div>
        </div>

        {/* big title */}
        <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.82]"
          style={{ backgroundImage: `linear-gradient(100deg, ${ORANGE} 0%, ${MAGENTA} 55%, ${PURPLE} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Coming<br />Up Next
        </h1>

        {/* next three */}
        <div className="flex flex-col gap-3 max-w-4xl">
          {three.map((it, i) => (
            <div key={i} className="flex items-center gap-4 md:gap-6 p-3 pr-5 rounded-2xl bg-white/[0.045] border border-white/10 backdrop-blur-xl"
              style={i === 0 ? { boxShadow: `0 0 40px -12px ${accent}` , borderColor: `${accent}55` } : undefined}>
              <span className="text-3xl md:text-4xl font-black tabular-nums w-8 text-center shrink-0" style={{ color: i === 0 ? accent : 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
              <div className="w-24 md:w-36 aspect-video rounded-xl overflow-hidden bg-black/40 shrink-0 border border-white/10">
                {it.thumbnail
                  ? <img src={it.thumbnail} className="w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div className="w-full h-full grid place-items-center"><Tv size={20} className="text-white/20" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base md:text-2xl font-black uppercase tracking-tight text-white truncate">{it.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {it.timeLabel && <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/45">{it.timeLabel}</span>}
                  {it.badge && <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-white/60">{it.badge}</span>}
                </div>
              </div>
              {i === 0 && (
                <span className="shrink-0 px-3 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest" style={{ background: accent, color: '#000' }}>Up Next</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* brand bar */}
      <div className="absolute bottom-0 inset-x-0 h-1.5" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${MAGENTA}, ${PURPLE})` }} />
    </div>
  );
};

export default ComingUpNextBumper;
