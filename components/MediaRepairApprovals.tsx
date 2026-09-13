// MediaRepairApprovals — the creator's side of the admin file-repair flow.
//
// When Plajah support proposes replacing a broken file (see AdminMediaHealth), the creator gets
// a SYSTEM notification linking here. Nothing is changed on their release until they approve:
// they can audition the proposed replacement, read support's note, then Approve (which swaps the
// file and re-transcodes) or Deny. Support can never apply a replacement on their own.

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Play, Pause, Loader2, Check, Ban, Music } from 'lucide-react';
import { myRepairRequests, respondRepair, type RepairRequest } from '../services/adminMediaHealth';

export default function MediaRepairApprovals({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [requests, setRequests] = useState<RepairRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    setError('');
    try { setRequests((await myRepairRequests()).requests); }
    catch (e: any) { setError(e?.message || String(e)); setRequests([]); }
  };
  useEffect(() => { if (open) load(); }, [open]);

  const respond = async (r: RepairRequest, approve: boolean) => {
    setBusyId(r.id);
    try { await respondRepair(r.id, approve); await load(); }
    catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusyId(null); }
  };

  const audition = (key: string, url: string) => {
    if (playing === key) { audioRef.current?.pause(); setPlaying(null); return; }
    setPlaying(key);
    setTimeout(() => { if (audioRef.current) { audioRef.current.src = url; audioRef.current.play().catch(() => {}); } }, 0);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-[#141414] border border-white/10 flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-white/8">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ShieldCheck size={17} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-black">File repair approvals</h2>
                <p className="text-[10px] text-white/40">Support proposed fixing a file on your release. It changes nothing until you approve.</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/50"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
              {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">{error}</div>}
              {requests === null ? (
                <div className="py-10 text-center text-white/30 text-sm"><Loader2 size={18} className="animate-spin mx-auto mb-2" /> Loading…</div>
              ) : requests.length === 0 ? (
                <div className="py-10 text-center text-white/30 text-sm">Nothing waiting on you. 🎉</div>
              ) : requests.map(r => (
                <div key={r.id} className="rounded-xl bg-white/[0.03] border border-white/8 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music size={13} className="text-white/40 shrink-0" />
                    <div className="text-[12px] font-bold text-white/85 truncate">{r.trackTitle || 'Track'}</div>
                    <div className="text-[10px] text-white/35 truncate">· {r.albumTitle}</div>
                  </div>
                  {r.note && <div className="text-[11px] text-white/55 mb-2 italic">“{r.note}”</div>}
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => audition(`old-${r.id}`, r.oldUrl)} disabled={!r.oldUrl}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-white/50 disabled:opacity-30">
                      {playing === `old-${r.id}` ? <Pause size={10} /> : <Play size={10} />} Current
                    </button>
                    <button onClick={() => audition(`new-${r.id}`, r.newUrl)} disabled={!r.newUrl}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-[10px] font-bold text-emerald-300 disabled:opacity-30">
                      {playing === `new-${r.id}` ? <Pause size={10} /> : <Play size={10} />} Proposed fix
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => respond(r, true)} disabled={busyId === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-[11px] font-black uppercase tracking-widest text-emerald-300 disabled:opacity-40 transition-colors">
                      {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve
                    </button>
                    <button onClick={() => respond(r, false)} disabled={busyId === r.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-[11px] font-black uppercase tracking-widest text-white/50 disabled:opacity-40 transition-colors">
                      <Ban size={13} /> Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
