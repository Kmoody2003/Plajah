// StartRoomModal — the "Start a Room" composer. Title + duration (15/30/45 min) → creates the
// room, mirrors it as a social post (so it shows in the feed + on the profile), links the two,
// and opens the room. Triggered globally via the `plajah:start-room` event (feed + profile CTAs).

import React, { useState } from 'react';
import { Radio, X, Loader2 } from 'lucide-react';
import { createRoom, setRoomPost, ALLOWED_DURATIONS } from '../services/roomService';
import { createPost } from '../services/backendService';

const StartRoomModal: React.FC<{ user?: any; onClose: () => void }> = ({ user, onClose }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    if (!user?.uid) { setError('Sign in to start a room.'); return; }
    if (!title.trim()) { setError('Give your room a title.'); return; }
    setBusy(true); setError('');
    try {
      const room = await createRoom({ title: title.trim(), durationMins: duration, user });
      const postId = await createPost({ text: `🔴 Live Room: ${title.trim()}`, roomId: room.id, roomTitle: title.trim(), roomEndsAt: room.endsAt, isLiveNow: true });
      if (postId) await setRoomPost(room.id, postId);
      window.dispatchEvent(new CustomEvent('plajah:open-room', { detail: { roomId: room.id } }));
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not start the room.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-6" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-7 max-w-sm w-full shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,140,0,0.16)' }}><Radio size={20} className="text-small-orange" /></div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/30 hover:text-white"><X size={16} /></button>
        </div>

        <h2 className="text-lg font-black tracking-tight mb-1">Start a Room</h2>
        <p className="text-xs text-white/40 font-bold mb-5 leading-relaxed">A live space on your page — anyone can join and chat. It posts to your feed and auto-closes when the time's up.</p>

        <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">What's it about?</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Beat-making Q&A, watch party, study hall…" maxLength={120}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all mb-5" />

        <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">How long?</label>
        <div className="flex gap-2 mb-5">
          {ALLOWED_DURATIONS.map(d => (
            <button key={d} onClick={() => setDuration(d)}
              className={`flex-1 py-3 rounded-2xl text-sm font-black transition-all ${duration === d ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'}`}>
              {d} min
            </button>
          ))}
        </div>

        {error && <div className="text-[11px] text-red-400 font-bold mb-3">{error}</div>}

        <button onClick={start} disabled={busy || !title.trim()} className="w-full flex items-center justify-center gap-2 py-3.5 bg-small-orange text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><Radio size={14} /> Go live</>}
        </button>
      </div>
    </div>
  );
};

export default StartRoomModal;
