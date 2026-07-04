import React, { useEffect, useState } from 'react';
import { CalendarPlus, Calendar, Radio, Mic, Clock, Check, Trash2, Users } from 'lucide-react';
import { SanctuaryEvent, SanctuaryMembership } from '../../types';
import {
  listenToSanctuaryEvents, createSanctuaryEvent, rsvpSanctuaryEvent, deleteSanctuaryEvent, hasAccess,
} from '../../services/sanctuaryService';
import { auth } from '../../services/firebase';
import { SANCTUARY_THEME, SanctuaryLockChip } from './SanctuaryIdentity';

const TYPE_ICON: Record<SanctuaryEvent['type'], React.ReactNode> = {
  LIVESTREAM: <Radio size={13} />, AMA: <Mic size={13} />, WATCH_PARTY: <Users size={13} />,
  LISTENING: <Radio size={13} />, CALL: <Mic size={13} />,
};

const SanctuaryEvents: React.FC<{
  sanctuaryId: string; isOwner?: boolean; membership?: SanctuaryMembership | null; purchasedIds: Set<string>;
}> = ({ sanctuaryId, isOwner, membership, purchasedIds }) => {
  const [events, setEvents] = useState<SanctuaryEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'LIVESTREAM' as SanctuaryEvent['type'], when: '' });
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToSanctuaryEvents(sanctuaryId, setEvents), [sanctuaryId]);

  const ctx = { isOwner, membership, purchasedItemIds: purchasedIds };

  const save = async () => {
    if (!form.title.trim() || !form.when) return;
    await createSanctuaryEvent({
      sanctuaryId, title: form.title.trim(), description: form.description.trim(),
      type: form.type, scheduledAt: new Date(form.when).getTime(), accessType: 'TIER', requiredTierIds: [],
    });
    setForm({ title: '', description: '', type: 'LIVESTREAM', when: '' });
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      {isOwner && (
        creating ? (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Event title"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25" />
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Details (optional)" rows={2}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25 resize-none" />
            <div className="flex gap-2">
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as SanctuaryEvent['type'] })}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none">
                <option value="LIVESTREAM">Livestream</option><option value="AMA">AMA</option>
                <option value="WATCH_PARTY">Watch party</option><option value="LISTENING">Listening</option><option value="CALL">Call</option>
              </select>
              <input type="datetime-local" value={form.when} onChange={e => setForm({ ...form, when: e.target.value })}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
              <button onClick={save} disabled={!form.title.trim() || !form.when}
                className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-30" style={{ background: SANCTUARY_THEME.gold }}>
                Schedule event
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
            style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <CalendarPlus size={14} style={{ color: SANCTUARY_THEME.gold }} /> Schedule an event
          </button>
        )
      )}

      {events.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar size={30} className="mx-auto mb-3" style={{ color: 'rgba(201,165,92,0.3)' }} />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/25">No events scheduled</p>
        </div>
      ) : events.map(ev => {
        const open = hasAccess({ accessType: ev.accessType, requiredTierIds: ev.requiredTierIds }, ev.id, ctx);
        const going = !!uid && ev.attendeeIds?.includes(uid);
        const upcoming = ev.scheduledAt > Date.now();
        return (
          <div key={ev.id} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(23,18,22,0.6)', border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: SANCTUARY_THEME.goldSheen, color: SANCTUARY_THEME.gold }}>
              {ev.isLive ? <Radio size={15} /> : TYPE_ICON[ev.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="text-sm font-black tracking-tight truncate">{ev.title}</h4>
                {ev.isLive && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">Live</span>}
                {ev.accessType !== 'FREE' && <SanctuaryLockChip text="Members" />}
              </div>
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1">
                <Clock size={9} /> {new Date(ev.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              {ev.description && <p className="text-[12px] text-white/55 leading-relaxed mb-2">{ev.description}</p>}
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/30"><Users size={9} /> {ev.attendeeIds?.length || 0} going</span>
                {!isOwner && open && upcoming && (
                  <button onClick={() => rsvpSanctuaryEvent(ev.id, !going)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
                    style={going ? { color: '#000', background: SANCTUARY_THEME.gold } : { color: SANCTUARY_THEME.goldSoft, border: `1px solid ${SANCTUARY_THEME.line}` }}>
                    {going ? <><Check size={10} /> Going</> : 'RSVP'}
                  </button>
                )}
                {isOwner && (
                  <button onClick={() => deleteSanctuaryEvent(ev.id)} className="ml-auto text-white/25 hover:text-rose-400"><Trash2 size={12} /></button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SanctuaryEvents;
