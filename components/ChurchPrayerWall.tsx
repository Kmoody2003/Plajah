import React, { useEffect, useState } from 'react';
import { HandHeart, Check, Lock, Trash2, Send } from 'lucide-react';
import { ChurchPrayer } from '../types';
import {
  submitChurchPrayer, listenToChurchPrayers, toggleChurchPraying,
  markChurchPrayerAnswered, deleteChurchPrayer,
} from '../services/organizationService';
import { auth } from '../services/firebase';

// A real, persistent prayer wall for a church/org page. Members submit requests
// (public or private-to-staff), tap "I'm praying," and staff mark answered.
const ChurchPrayerWall: React.FC<{ orgId: string; isOwner?: boolean }> = ({ orgId, isOwner }) => {
  const [prayers, setPrayers] = useState<ChurchPrayer[]>([]);
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToChurchPrayers(orgId, setPrayers), [orgId]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    if (!uid) { alert('Sign in to share a prayer request.'); return; }
    setBusy(true);
    try { await submitChurchPrayer(orgId, text, isPrivate); setText(''); setIsPrivate(false); }
    finally { setBusy(false); }
  };

  // Non-staff see public prayers + their own private ones.
  const visible = prayers.filter(p => !p.isPrivate || isOwner || p.authorId === uid);

  return (
    <section className="mt-10">
      <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2"><HandHeart size={12} className="text-small-orange" /> Prayer wall</h2>

      <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 mb-4">
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Share a prayer request with the church…"
          rows={2}
          className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-white/25"
        />
        <div className="flex items-center justify-between pt-2 border-t border-white/8 mt-2">
          <button onClick={() => setIsPrivate(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isPrivate ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
            <Lock size={11} /> {isPrivate ? 'Private to staff' : 'Public'}
          </button>
          <button onClick={submit} disabled={!text.trim() || busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
            <Send size={11} /> Share
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-[11px] text-white/30 uppercase tracking-widest text-center py-6">Be the first to share a prayer request</p>
      ) : (
        <div className="space-y-3">
          {visible.map(p => {
            const praying = !!uid && p.prayingIds?.includes(uid);
            const canManage = isOwner || p.authorId === uid;
            return (
              <div key={p.id} className="rounded-2xl p-4 border" style={{ background: p.answered ? 'rgba(63,190,133,0.06)' : 'rgba(255,255,255,0.03)', borderColor: p.answered ? 'rgba(63,190,133,0.25)' : 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <img src={p.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.authorId}`} className="w-6 h-6 rounded-full border border-white/10" alt="" />
                    <p className="text-[11px] font-black text-white">{p.authorName}<span className="text-white/30 font-bold"> · {new Date(p.timestamp).toLocaleDateString()}</span></p>
                    {p.isPrivate && <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-white/40"><Lock size={9} /> Private</span>}
                  </div>
                  {p.answered && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400"><Check size={10} /> Answered</span>}
                </div>
                <p className="text-sm text-white/80 leading-relaxed mb-3">{p.request}</p>
                {p.answered && p.answeredNote && <p className="text-[11px] text-emerald-300/70 italic mb-2">— {p.answeredNote}</p>}
                <div className="flex items-center gap-3">
                  <button onClick={() => uid ? toggleChurchPraying(p.id, !praying) : alert('Sign in to pray.')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    style={praying ? { background: '#FF8C00', color: '#000' } : { color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <HandHeart size={11} /> {p.prayingIds?.length || 0} praying
                  </button>
                  {isOwner && !p.answered && (
                    <button onClick={() => markChurchPrayerAnswered(p.id, true)} className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70 hover:text-emerald-400">Mark answered</button>
                  )}
                  {canManage && (
                    <button onClick={() => window.confirm('Delete this prayer request?') && deleteChurchPrayer(p.id)} className="ml-auto text-white/25 hover:text-rose-400"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ChurchPrayerWall;
