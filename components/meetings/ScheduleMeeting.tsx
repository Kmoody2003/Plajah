import React, { useEffect, useState } from 'react';
import { CalendarPlus, CalendarDays, X, Video, Link2, Copy, Check, Users, Repeat, Download, Ban } from 'lucide-react';
import Portal from '../Portal';
import { auth } from '../../services/backendService';
import { scheduleMeeting, cancelMeeting, listenScheduledMeeting, type MeetingInviteRef } from '../../services/meetings/meetingSchedule';
import {
  DURATIONS, validateSchedule, describeWhen, joinState, currentOccurrence, meetingLink, calendarEvent,
  googleCalendarUrl, outlookCalendarUrl, type ScheduledMeeting,
} from '../../services/meetings/scheduleCore';
import { downloadIcs, RECURRENCE_LABEL, type Recurrence } from '../../services/postman/calendarTime';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Next half hour, at least 15 minutes out. */
const defaultStart = () => { const d = new Date(Date.now() + 15 * 60_000); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 60); return d.getTime(); };
const REPEATS: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

export const ScheduleMeetingDialog: React.FC<{ roomId: string; roomName: string; onClose: () => void; onScheduled?: (m: ScheduledMeeting) => void }> = ({ roomId, roomName, onClose, onScheduled }) => {
  const [title, setTitle] = useState(`${roomName} meeting`);
  const [start, setStart] = useState(toLocalInput(defaultStart()));
  const [duration, setDuration] = useState(30);
  const [repeat, setRepeat] = useState<Recurrence>('none');
  const [agenda, setAgenda] = useState('');
  const [guests, setGuests] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const startsAt = new Date(start).getTime();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateSchedule({ title, startsAt, durationMin: duration });
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { const m = await scheduleMeeting(roomId, { title, startsAt, durationMin: duration, agenda, recurrence: repeat, guestsAllowed: guests }); onScheduled?.(m); onClose(); }
    catch (err: any) { setError(err?.message || 'The meeting could not be scheduled. Try again.'); setBusy(false); }
  };
  const field = 'w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white outline-none focus:border-white/30';

  return (
    <Portal>
      <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Schedule a meeting">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-[#121212] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <CalendarPlus size={15} className="text-small-orange" />
            <h2 className="text-xs font-black uppercase tracking-widest text-white flex-1">Schedule a meeting</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-white/10"><X size={15} /></button>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-white/60" htmlFor="sched-title">Name
              <input id="sched-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className={field} />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-white/60 min-w-0" htmlFor="sched-start">Starts
                <input id="sched-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-white/60" htmlFor="sched-duration">Length
                <select id="sched-duration" value={duration} onChange={e => setDuration(Number(e.target.value))} className={`${field} [&>option]:bg-[#121212]`}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? 's' : ''}`}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[11px] text-white/60" htmlFor="sched-repeat">Repeats
              <select id="sched-repeat" value={repeat} onChange={e => setRepeat(e.target.value as Recurrence)} className={`${field} [&>option]:bg-[#121212]`}>
                {REPEATS.map(r => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-white/60" htmlFor="sched-agenda">Agenda (optional)
              <textarea id="sched-agenda" value={agenda} onChange={e => setAgenda(e.target.value)} rows={3} maxLength={2000} className={`${field} resize-none`} placeholder="What you'll cover" />
            </label>
            <label className="flex items-start gap-2 text-[12px] text-white/80" htmlFor="sched-guests">
              <input id="sched-guests" type="checkbox" checked={guests} onChange={e => setGuests(e.target.checked)} className="mt-0.5" />
              <span>Let people outside this chat join from a link<span className="block text-[10px] text-white/45">No account needed. They wait until someone here lets them in.</span></span>
            </label>
            {Number.isFinite(startsAt) && <p className="text-[11px] text-white/45">{describeWhen(startsAt)} · your time zone</p>}
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="py-2.5 rounded-xl bg-small-orange text-white text-[12px] font-black uppercase tracking-widest disabled:opacity-50">
              {busy ? 'Scheduling…' : 'Schedule and post to chat'}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
};

/** The pinned card a scheduled meeting posts into the chat: time, join, calendar, guest link. */
export const MeetingInviteCard: React.FC<{ roomId: string; invite: MeetingInviteRef; onJoin?: (m: ScheduledMeeting) => void }> = ({ roomId, invite, onJoin }) => {
  const [meeting, setMeeting] = useState<ScheduledMeeting | null>(null);
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => listenScheduledMeeting(roomId, invite.meetingId, setMeeting), [roomId, invite.meetingId]);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 30_000); return () => window.clearInterval(t); }, []);
  const base: ScheduledMeeting = meeting || {
    id: invite.meetingId, roomId, title: invite.title, startsAt: invite.startsAt, durationMin: invite.durationMin,
    recurrence: invite.recurrence, guestsAllowed: invite.guestsAllowed, createdBy: '', createdByName: '', createdAt: 0,
  };
  const m = currentOccurrence(base);
  const state = joinState(m);
  const link = meetingLink(window.location.origin, m.id);
  const ev = calendarEvent(m, link);
  const isCreator = !!meeting && auth.currentUser?.uid === meeting.createdBy;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy the meeting link', link); }
  };
  const chip = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold';

  return (
    <div className="flex flex-col gap-2 min-w-[240px] max-w-[min(340px,72vw)]" onClick={stop}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 flex items-center gap-1.5"><CalendarDays size={12} /> Meeting</p>
      <p className={`text-[14px] font-bold leading-tight ${state === 'canceled' ? 'line-through opacity-60' : ''}`}>{m.title}</p>
      <p className="text-[12px] opacity-85">{describeWhen(m.startsAt)} · {m.durationMin} min</p>
      <p className="text-[10px] opacity-60 flex flex-wrap gap-x-3 gap-y-1">
        {m.recurrence && m.recurrence !== 'none' && <span className="flex items-center gap-1"><Repeat size={10} />{RECURRENCE_LABEL[m.recurrence]}</span>}
        {m.guestsAllowed && <span className="flex items-center gap-1"><Users size={10} />Guests can join from a link</span>}
      </p>
      {meeting?.agenda && <p className="text-[12px] opacity-80 whitespace-pre-wrap line-clamp-4">{meeting.agenda}</p>}
      {state === 'canceled' ? <p className="text-[12px] font-bold opacity-80">Canceled</p> : (
        <div className="flex flex-wrap gap-2 relative">
          {(state === 'open' || state === 'live') && onJoin && (
            <button type="button" onClick={() => onJoin(m)} className={`${chip} bg-emerald-400 text-black`}><Video size={12} /> {state === 'live' ? 'Join now' : 'Join early'}</button>
          )}
          {state === 'upcoming' && <span className={`${chip} bg-black/20`}>Join opens 10 min before</span>}
          <button type="button" onClick={() => setMenu(v => !v)} aria-expanded={menu} className={`${chip} bg-black/25 hover:bg-black/40`}><CalendarPlus size={12} /> Add to calendar</button>
          {m.guestsAllowed && <button type="button" onClick={copy} className={`${chip} bg-black/25 hover:bg-black/40`}>{copied ? <Check size={12} /> : <Link2 size={12} />}{copied ? 'Link copied' : 'Copy guest link'}</button>}
          {isCreator && state !== 'ended' && (
            <button type="button" onClick={() => { if (window.confirm('Cancel this meeting for everyone?')) void cancelMeeting(roomId, m.id); }} className={`${chip} bg-black/15 hover:bg-black/30 opacity-80`}><Ban size={12} /> Cancel</button>
          )}
          {menu && (
            <div className="absolute left-0 top-full mt-1 z-20 w-56 p-1 rounded-xl bg-[#111] border border-white/10 shadow-2xl text-white">
              <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-[12px]"><CalendarPlus size={13} /> Google Calendar</a>
              <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-[12px]"><CalendarPlus size={13} /> Outlook</a>
              <button type="button" onClick={() => { downloadIcs(ev); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-[12px]"><Download size={13} /> Apple / other (.ics)</button>
              <button type="button" onClick={() => { void copy(); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-[12px]"><Copy size={13} /> Copy meeting link</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
