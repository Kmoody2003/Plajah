import React from 'react';
import { Radio, Sparkles, Users } from 'lucide-react';
import type { CapRefusal } from '../../services/meetings/sfuCaps';

/** Ask the app to open Go Live (App.tsx listens for this). Past the meeting cap, a call becomes a broadcast. */
export function startBroadcast() {
  window.dispatchEvent(new CustomEvent('plajah:start-broadcast'));
}

/**
 * Shown instead of the call when the server refuses a room (caps in services/meetings/sfuCaps.ts):
 * a huddle or meeting that's full, a meeting that needs a plan to go past 100, or anything past 300,
 * which is a broadcast, not a meeting.
 */
const MeetingRefusal: React.FC<{ refusal: { reason: CapRefusal; message: string; cap: number }; onClose: () => void; compact?: boolean }> = ({ refusal, onClose, compact }) => (
  <div role="alertdialog" aria-label="Meeting is full" className={`flex flex-col gap-3 text-white ${compact ? 'p-3' : 'p-6 max-w-sm mx-auto rounded-3xl bg-[#121212] border border-white/10'}`}>
    <p className="flex items-center gap-2 text-[13px] font-black"><Users size={15} className="text-amber-300" /> {refusal.reason === 'USE_BROADCAST' ? 'Too big for a meeting' : 'This room is full'}</p>
    <p className="text-[12px] text-white/75 leading-snug">{refusal.message}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => { onClose(); startBroadcast(); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-black text-[12px] font-black">
        <Radio size={14} /> Start a live broadcast
      </button>
      {refusal.reason === 'NEEDS_PLAN' && (
        <button type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('plajah:open-plajah-plus')); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[12px] font-bold">
          <Sparkles size={14} /> Get Plajah+
        </button>
      )}
      <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-[12px] text-white/60 hover:text-white">Close</button>
    </div>
  </div>
);

export default MeetingRefusal;
