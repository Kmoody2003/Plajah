// RoomBanner — the in-feed affordance for a Live Room post. Shows a LIVE pill + countdown
// (or "Room ended"), the title, and a Join button that opens the room. Tiny + self-contained;
// rendered by PostCard when a post carries a roomId.

import React, { useEffect, useState } from 'react';
import { Radio, Users, ArrowRight } from 'lucide-react';

const RoomBanner: React.FC<{ roomId: string; title?: string; endsAt?: number }> = ({ roomId, title, endsAt }) => {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const live = !endsAt || Date.now() < endsAt;
  const mins = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 60000)) : null;

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('plajah:open-room', { detail: { roomId } }));
  };

  return (
    <button
      onClick={open}
      className="mt-2 w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all hover:scale-[1.005]"
      style={{ border: `1px solid ${live ? 'rgba(255,140,0,0.4)' : 'rgba(255,255,255,0.1)'}`, background: live ? 'linear-gradient(120deg, rgba(255,140,0,0.12), rgba(129,102,230,0.1))' : 'rgba(255,255,255,0.03)' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: live ? 'rgba(255,140,0,0.18)' : 'rgba(255,255,255,0.06)' }}>
        <Radio size={18} className={live ? 'text-small-orange' : 'text-white/40'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1 text-[8.5px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded-full" style={{ background: '#e23b3b' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
            </span>
          ) : (
            <span className="text-[8.5px] font-black uppercase tracking-widest text-white/40 px-2 py-0.5 rounded-full bg-white/5">Ended</span>
          )}
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Room</span>
        </div>
        <div className="text-sm font-black text-white truncate mt-0.5">{title || 'Live Room'}</div>
        {live && mins !== null && (
          <div className="text-[10px] text-white/40 flex items-center gap-2 mt-0.5"><Users size={10} /> ends in {mins} min{mins === 1 ? '' : 's'}</div>
        )}
      </div>
      <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest" style={{ background: live ? '#FF8C00' : 'rgba(255,255,255,0.06)', color: live ? '#1a1a1a' : 'rgba(255,255,255,0.4)' }}>
        {live ? <>Join <ArrowRight size={12} /></> : 'Replay'}
      </span>
    </button>
  );
};

export default RoomBanner;
