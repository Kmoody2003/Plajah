import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Tv, Plus, Check } from 'lucide-react';
import { addToWatchlist } from '../../services/backendService';
import { isPilotChannel, type PlajahPromo } from '../../services/promos/platformPromos';

/**
 * PromoBillboard — one Plajah promo spot in the left ad panel.
 *
 * The spot is scaled to FIT the panel (nothing cropped); a blurred, darkened copy of the same video
 * fills the rest of the background. It plays muted and unmutes while the pointer is over it (a tap
 * toggles sound on touch screens). When the spot sells a pilot channel it offers Tune in now / Add to
 * watchlist for it.
 */

interface Props {
  promo: PlajahPromo;
  onTune?: (channel: NonNullable<PlajahPromo['channel']>) => void;
  dotCount?: number;
  dotIdx?: number;
}

const PromoBillboard: React.FC<Props> = ({ promo, onTune, dotCount = 0, dotIdx = 0 }) => {
  const fg = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [saved, setSaved] = useState(false);
  const ch = promo.channel && isPilotChannel({ plajahId: promo.channel.plajahId, name: promo.channel.name }) ? promo.channel : null;

  // Sound follows the pointer. A browser may refuse to unmute before the viewer has interacted with
  // the page; then the speaker stays crossed out and a click (below) tries again.
  useEffect(() => {
    const v = fg.current;
    if (!v) return;
    v.muted = !sound;
    if (sound) v.play().catch(() => { v.muted = true; setSound(false); });
  }, [sound]);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      onMouseEnter={() => setSound(true)}
      onMouseLeave={() => setSound(false)}
    >
      {/* blanking fill: the same spot, blown up, blurred and dimmed */}
      <video src={promo.url} autoPlay muted loop playsInline aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl brightness-50 saturate-125" />
      {/* the spot itself, scaled to fit */}
      <video ref={fg} src={promo.url} autoPlay muted loop playsInline
        onClick={() => setSound(s => !s)}
        className="absolute inset-0 w-full h-full object-contain cursor-pointer" />

      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-widest text-white/70 border border-white/15">Plajah</span>
      </div>
      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm grid place-items-center text-white/80 pointer-events-none" title={sound ? 'Sound on' : 'Hover for sound'}>
        {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </div>

      {ch && (
        <div className="absolute inset-x-0 bottom-0 pt-10 pb-8 px-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-small-orange mb-0.5">Now on Plajah</p>
          <p className="text-white font-black text-sm leading-tight mb-2 line-clamp-2">{ch.name}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onTune?.(ch)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
            ><Tv size={12} /> Tune in now</button>
            <button
              onClick={() => {
                setSaved(true);
                void addToWatchlist({ id: `channel_${ch.plajahId || ch.ownerId || ch.name}`, title: ch.name, type: 'VIDEO', thumbnailUrl: promo.thumbnail }).catch(() => setSaved(false));
              }}
              title={saved ? 'On your watchlist' : 'Add to watchlist'}
              aria-label={saved ? 'On your watchlist' : 'Add to watchlist'}
              className={`w-9 shrink-0 grid place-items-center rounded-full border text-white ${saved ? 'bg-emerald-500/25 border-emerald-400/40' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
            >{saved ? <Check size={14} /> : <Plus size={14} />}</button>
          </div>
        </div>
      )}

      {dotCount > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          {Array.from({ length: Math.min(dotCount, 7) }).map((_, i) => (
            <span key={i} className="rounded-full transition-all duration-300"
              style={{ width: i === dotIdx % Math.min(dotCount, 7) ? '16px' : '5px', height: '5px', background: i === dotIdx % Math.min(dotCount, 7) ? '#ff8c00' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PromoBillboard;
