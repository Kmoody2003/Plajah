import React, { Suspense, lazy, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Video, DoorOpen, ShieldCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db } from '../../services/firebase';
import { auth } from '../../services/backendService';
import {
  getPublicMeeting, isRoomMember, requestEntry, listenMyEntry, leaveLobby, meetingRtcCollection,
} from '../../services/meetings/meetingSchedule';
import { describeWhen, joinState, cleanGuestName, type LobbyEntry, type PublicMeeting } from '../../services/meetings/scheduleCore';
import type { ChatRoom } from '../../types';
import type { MeetingSession } from '../VideoChat';

const VideoChat = lazy(() => import('../VideoChat'));

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; meeting: PublicMeeting & { guestsAllowed: boolean }; member: boolean }
  | { kind: 'waiting'; meeting: PublicMeeting & { guestsAllowed: boolean } }
  | { kind: 'in-call'; room: ChatRoom; session?: MeetingSession }
  | { kind: 'denied' }
  | { kind: 'left' };

/**
 * What a meeting link (?meet=<id>) opens. Members of the chat go straight in; anyone else (no account
 * needed) gives a name and waits until someone in the chat lets them in.
 */
const MeetingJoinPage: React.FC<{ meetingId: string; onExit: () => void }> = ({ meetingId, onExit }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [name, setName] = useState(auth.currentUser?.displayName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meeting = await getPublicMeeting(meetingId);
        if (!alive) return;
        if (!meeting) { setPhase({ kind: 'missing' }); return; }
        setPhase({ kind: 'ready', meeting, member: await isRoomMember(meeting.roomId) });
      } catch (e: any) { if (alive) { setError(e?.message || 'This meeting could not be opened.'); setPhase({ kind: 'missing' }); } }
    })();
    return () => { alive = false; };
  }, [meetingId]);

  // A guest in the waiting room: go in when admitted.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const meeting = phase.meeting;
    return listenMyEntry(meetingId, (entry: LobbyEntry | null) => {
      if (entry?.status === 'ADMITTED') {
        const room = { id: meeting.roomId, name: meeting.title, type: 'GROUP', participants: [], updatedAt: 0 } as unknown as ChatRoom;
        setPhase({ kind: 'in-call', room, session: { collectionName: meetingRtcCollection({ id: meetingId, guestsAllowed: true }, meeting.roomId), meetingId, title: meeting.title, role: 'guest' } });
      } else if (entry?.status === 'DENIED') setPhase({ kind: 'denied' });
    });
  }, [phase, meetingId]);

  const joinAsMember = async (meeting: PublicMeeting & { guestsAllowed: boolean }) => {
    setBusy(true); setError('');
    try {
      const snap = await getDoc(doc(db, 'chat_rooms', meeting.roomId));
      if (!snap.exists()) throw new Error('This chat no longer exists.');
      const room = { ...(snap.data() as ChatRoom), id: snap.id };
      setPhase({
        kind: 'in-call', room,
        session: meeting.guestsAllowed ? { collectionName: meetingRtcCollection({ id: meetingId, guestsAllowed: true }, room.id), meetingId, title: meeting.title, role: 'member' } : undefined,
      });
    } catch (e: any) { setError(e?.message || 'Could not join.'); }
    finally { setBusy(false); }
  };

  const knock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase.kind !== 'ready') return;
    const clean = cleanGuestName(name);
    if (!clean) { setError('Enter your name (2 to 60 characters).'); return; }
    setBusy(true); setError('');
    try {
      if (auth.currentUser?.isAnonymous) await updateProfile(auth.currentUser, { displayName: clean }).catch(() => {});
      await requestEntry(meetingId, clean);
      setPhase({ kind: 'waiting', meeting: phase.meeting });
    } catch (err: any) { setError(err?.message || 'Could not ask to join. Try again.'); }
    finally { setBusy(false); }
  };

  if (phase.kind === 'in-call') {
    return (
      <Suspense fallback={<Centered><Loader2 className="animate-spin" /></Centered>}>
        <VideoChat room={phase.room} user={auth.currentUser} session={phase.session} onClose={() => { void leaveLobby(meetingId); setPhase({ kind: 'left' }); }} />
      </Suspense>
    );
  }

  return (
    <Centered>
      <div className="w-full max-w-sm rounded-3xl bg-[#121212] border border-white/10 p-6 flex flex-col gap-4 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5"><CalendarDays size={12} /> Plajah meeting</p>
        {phase.kind === 'loading' && <p className="flex items-center gap-2 text-[13px] text-white/70"><Loader2 size={14} className="animate-spin" /> Opening the meeting…</p>}
        {phase.kind === 'missing' && <p className="text-[13px] text-white/80">{error || "This meeting link isn't valid. Ask the person who shared it for a new one."}</p>}
        {phase.kind === 'denied' && <p className="text-[13px] text-white/80">The host didn't let you in to this meeting.</p>}
        {phase.kind === 'left' && <p className="text-[13px] text-white/80">You left the meeting.</p>}
        {(phase.kind === 'ready' || phase.kind === 'waiting') && (() => {
          const m = phase.meeting;
          const state = joinState(m);
          return (
            <>
              <div>
                <h1 className={`text-lg font-black leading-tight ${state === 'canceled' ? 'line-through opacity-60' : ''}`}>{m.title}</h1>
                <p className="text-[12px] text-white/60 mt-1">{describeWhen(m.startsAt)} · {m.durationMin} min · hosted by {m.hostName}</p>
              </div>
              {state === 'canceled' ? <p className="text-[13px]">This meeting was canceled.</p>
                : phase.kind === 'waiting' ? (
                  <p className="flex items-start gap-2 text-[13px] text-white/80"><Loader2 size={15} className="animate-spin mt-0.5 shrink-0" /> You're in the waiting room. Someone in the meeting will let you in shortly.</p>
                ) : phase.member ? (
                  <button onClick={() => void joinAsMember(m)} disabled={busy} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-400 text-black text-[13px] font-black disabled:opacity-50">
                    <Video size={15} /> {busy ? 'Joining…' : 'Join meeting'}
                  </button>
                ) : !m.guestsAllowed ? (
                  <p className="text-[13px] text-white/80">This meeting is for members of the chat. Sign in with the account that's in it to join.</p>
                ) : (
                  <form onSubmit={knock} className="flex flex-col gap-2">
                    <label htmlFor="guest-name" className="text-[11px] text-white/60">Your name, as others will see it</label>
                    <input id="guest-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus
                      className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-white/30" />
                    <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black text-[13px] font-black disabled:opacity-50">
                      <DoorOpen size={15} /> {busy ? 'Asking…' : 'Ask to join'}
                    </button>
                    <p className="text-[10px] text-white/45 flex items-start gap-1.5"><ShieldCheck size={11} className="mt-0.5 shrink-0" /> No account needed. You'll use your camera and microphone in this browser; nothing is installed.</p>
                  </form>
                )}
            </>
          );
        })()}
        {error && phase.kind !== 'missing' && <p className="text-[12px] text-red-400">{error}</p>}
        {phase.kind !== 'loading' && phase.kind !== 'waiting' && <button onClick={onExit} className="text-[12px] text-white/50 underline underline-offset-2 self-start">Go to Plajah</button>}
      </div>
    </Centered>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-[#08080a]">{children}</div>
);

export default MeetingJoinPage;
