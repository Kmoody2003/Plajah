// FollowAlongView — the full-screen in-room surface.
//
// Reached one of two ways, both deliberately free of permission prompts:
//   · a Follow-along card on the church's Elevate page (regulars)
//   · ?follow=<sessionId> from the code on the pre-service countdown slide
//     (visitors), which Ambo already owns
//
// No geofence, no bluetooth beacons, no check-in queue. Someone is being handed
// a bulletin — the flow has to survive that.

import React, { useState } from 'react';
import { ChevronLeft, Radio } from 'lucide-react';
import FollowAlong from './FollowAlong';

interface Props {
  sessionId?: string | null;
  onBack?: () => void;
}

const FollowAlongView: React.FC<Props> = ({ sessionId, onBack }) => {
  const [code, setCode] = useState('');
  const [active, setActive] = useState<string | null>(sessionId ?? null);

  return (
    <div className="fixed inset-0 z-[120] bg-[#08070c] text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[9px] font-black uppercase tracking-widest">
            <ChevronLeft size={14} /> Exit
          </button>
        )}
        <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d4af37]">Follow along</span>
      </div>

      {active ? (
        <div className="flex-1 min-h-0 mx-auto w-full max-w-md">
          <FollowAlong sessionId={active} mode="IN_ROOM" onClose={onBack} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Radio size={26} className="text-[#d4af37]/60 mb-4" />
          <h2 className="text-lg font-black tracking-tight mb-1.5">Follow today’s service</h2>
          <p className="text-[11px] text-white/40 max-w-xs leading-relaxed mb-6">
            Your phone turns to each passage as it’s read. It stays silent, keeps the
            screen dim, and never wakes on its own.
          </p>
          <form
            onSubmit={e => { e.preventDefault(); if (code.trim()) setActive(code.trim()); }}
            className="w-full max-w-[260px] space-y-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Service code"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full bg-black/45 border border-white/12 rounded-lg px-3 py-2.5 text-center font-mono text-[13px] tracking-[0.2em] text-white outline-none focus:border-[#d4af37]/50"
            />
            <button type="submit" disabled={!code.trim()}
              className="w-full py-2.5 rounded-lg bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-30">
              Follow
            </button>
          </form>
          <p className="text-[9px] text-white/25 mt-4">The code is on the screen before the service.</p>
        </div>
      )}
    </div>
  );
};

export default FollowAlongView;
