import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Calendar, Lock, Globe, X, Check, Ticket, Loader2 } from 'lucide-react';
import { createClubEvent, createClub, auth } from '../services/backendService';

interface Props {
  albumId: string;
  albumTitle: string;
  coverImage?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function FilmPremierModal({ albumId, albumTitle, coverImage, onClose, onCreated }: Props) {
  const [eventTitle, setEventTitle]       = useState(`${albumTitle} — Premiere`);
  const [description, setDescription]    = useState('');
  const [scheduledAt, setScheduledAt]    = useState('');
  const [isExclusive, setIsExclusive]    = useState(false);
  const [ticketPrice, setTicketPrice]    = useState('0');
  const [loading, setLoading]            = useState(false);
  const [done, setDone]                  = useState(false);

  const handleCreate = async () => {
    if (!scheduledAt || !auth.currentUser) return;
    setLoading(true);
    try {
      // Create a club for this film if needed (use albumId as slug)
      const clubId = `film_${albumId}`;

      await createClubEvent({
        clubId,
        hostId: auth.currentUser.uid,
        title: eventTitle.trim(),
        description: description.trim() || undefined,
        type: 'WATCH_PARTY',
        scheduledAt: new Date(scheduledAt).getTime(),
        isExclusive,
        isActive: false,
        attendeeIds: [],
      });

      setDone(true);
      setTimeout(() => {
        onCreated?.();
        onClose();
      }, 1_800);
    } catch (err) {
      console.error('[FilmPremierModal]', err);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-full max-w-md bg-[#0d0d0d] border border-white/8 rounded-[2.5rem] overflow-hidden"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-pink-500/12">
              <Users size={18} className="text-pink-400" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Schedule Premiere</h3>
              <p className="text-[9px] text-white/25 font-black uppercase tracking-widest">Watch Party Event</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-colors rounded-xl">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="px-8 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check size={24} className="text-green-400" />
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-white">Premiere Scheduled</p>
            <p className="text-[10px] text-white/30">Your watch party event has been created. Fans can RSVP from your film's club page.</p>
          </div>
        ) : (
          <div className="px-8 py-7 space-y-5">
            <div>
              <label className={labelCls}>Event title</label>
              <input value={eventTitle} onChange={e => setEventTitle(e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Date & time *</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What should fans know about this premiere?" className={`${inputCls} resize-none`} />
            </div>

            {/* Access toggle */}
            <button
              onClick={() => setIsExclusive(!isExclusive)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border transition-all"
              style={{
                background: isExclusive ? 'rgba(248,113,164,0.06)' : 'rgba(255,255,255,0.02)',
                borderColor: isExclusive ? 'rgba(248,113,164,0.25)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isExclusive ? 'bg-pink-500/15 text-pink-400' : 'bg-white/5 text-white/25'}`}>
                {isExclusive ? <Lock size={14} /> : <Globe size={14} />}
              </div>
              <div className="flex-1 text-left">
                <p className={`text-xs font-black uppercase tracking-widest ${isExclusive ? 'text-white' : 'text-white/40'}`}>
                  {isExclusive ? 'Members Only' : 'Public Event'}
                </p>
                <p className="text-[9px] text-white/25">{isExclusive ? 'Only fan club members can attend' : 'Anyone can RSVP and attend'}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isExclusive ? 'border-pink-400 bg-pink-400' : 'border-white/15'}`}>
                {isExclusive && <Check size={9} className="text-black" />}
              </div>
            </button>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-none px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!scheduledAt || loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30"
                style={{ background: '#f472b6', color: '#000' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <><Ticket size={13} /> Schedule Premiere</>}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
