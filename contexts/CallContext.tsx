// CallContext — the ONE global call orchestrator. Mounted at the app root so a
// user is rung anywhere in the app (not just inside chat). It owns:
//   • outgoing calls  — placeCall(room, type) rings every other participant and
//     opens the real rtc call (VideoChat) for the caller,
//   • incoming calls  — a global listener surfaces a ring UI (accept/decline);
//     accepting drops the callee straight into the same rtc session,
//   • add-a-caller     — inviteToCall(userId) rings someone into the live call.
// There is a single <VideoChat> mount here, so a call persists across navigation.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video as VideoIcon, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatRoom, CallSession } from '../types';
import {
  auth, startCall, listenToCalls, updateCallStatus, listenToCall, fetchChatRooms, fetchUserProfile,
} from '../services/backendService';
import VideoChat, { CallContact } from '../components/VideoChat';

interface ActiveCall {
  room: ChatRoom;
  isCaller: boolean;
  ringingName?: string;
  /** call docs this side created (caller), so we can cancel them on hang-up. */
  callIds: string[];
}

interface CallContextType {
  /** Ring every other participant of a room and open the call. */
  placeCall: (room: ChatRoom, type?: CallSession['type']) => Promise<void>;
  inCall: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

/** A short, looping ring tone via Web Audio (no asset needed). */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<any>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx: AudioContext = new AudioCtx();
    ctxRef.current = ctx;
    const beep = () => {
      if (stopped) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 480;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 1);
    };
    beep();
    timerRef.current = setInterval(beep, 2000);
    return () => {
      stopped = true;
      if (timerRef.current) clearInterval(timerRef.current);
      ctx.close().catch(() => {});
    };
  }, [active]);
}

const IncomingRing: React.FC<{ call: CallSession; onAccept: () => void; onDecline: () => void }> = ({ call, onAccept, onDecline }) => {
  useRingtone(true);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-sm bg-[#0c0c0f] border border-white/10 rounded-[2.5rem] shadow-2xl p-8 text-center">
        <div className="relative w-28 h-28 mx-auto mb-6">
          <div className="absolute inset-0 bg-small-orange/25 rounded-full blur-2xl animate-pulse" />
          <div className="relative w-28 h-28 rounded-full border-4 border-white/10 overflow-hidden">
            {call.callerPhoto
              ? <img src={call.callerPhoto} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/5 flex items-center justify-center"><User size={40} className="text-white/30" /></div>}
          </div>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tightest text-white leading-none">{call.callerName || 'Someone'}</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange mt-2 flex items-center justify-center gap-1.5">
          <VideoIcon size={12} /> Incoming {call.type === 'VIDEO' ? 'video' : 'voice'} call
        </p>
        <div className="flex items-center justify-center gap-8 mt-8">
          <button onClick={onDecline} className="flex flex-col items-center gap-2 group">
            <span className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center group-hover:bg-red-600 transition-all shadow-xl"><PhoneOff size={26} className="text-white" /></span>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Decline</span>
          </button>
          <button onClick={onAccept} className="flex flex-col items-center gap-2 group">
            <span className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center group-hover:bg-green-600 transition-all shadow-xl animate-bounce"><Phone size={26} className="text-white" /></span>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Accept</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [contacts, setContacts] = useState<CallContact[]>([]);
  const activeRef = useRef<ActiveCall | null>(null);
  activeRef.current = active;

  const uid = auth.currentUser?.uid;

  // Global incoming-call listener — rings anywhere in the app.
  useEffect(() => {
    if (!uid) return;
    const unsub = listenToCalls((calls) => {
      // Ignore rings for a room we're already in; surface the newest otherwise.
      const relevant = calls.find(c => !activeRef.current || activeRef.current.room.id !== c.roomId);
      setIncoming(prev => {
        if (!relevant) return prev && calls.find(c => c.id === prev.id) ? prev : null;
        return relevant;
      });
    });
    return () => { try { unsub?.(); } catch {} };
  }, [uid]);

  // Build a contact list (people you have conversations with) for add-a-caller.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const rooms = await fetchChatRooms();
        const others = new Set<string>();
        rooms.forEach(r => (r.participants || []).forEach(p => { if (p !== uid) others.add(p); }));
        const profiles = await Promise.all([...others].slice(0, 50).map(id => fetchUserProfile(id).catch(() => null)));
        if (cancelled) return;
        setContacts(profiles.filter(Boolean).map((p: any) => ({ uid: p.uid, displayName: p.displayName || 'User', photoURL: p.photoURL })));
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const placeCall = useCallback(async (room: ChatRoom, type: CallSession['type'] = 'VIDEO') => {
    const me = auth.currentUser?.uid;
    const receivers = (room.participants || []).filter(p => p && p !== me);
    const meta = {
      roomId: room.id,
      roomName: room.name || 'Call',
      callerName: auth.currentUser?.displayName || 'Someone',
      callerPhoto: auth.currentUser?.photoURL || '',
    };
    const callIds: string[] = [];
    for (const r of receivers) {
      try { callIds.push(await startCall(r, type, meta)); } catch { /* keep ringing the rest */ }
    }
    const first = contacts.find(c => c.uid === receivers[0]);
    setActive({ room, isCaller: true, ringingName: receivers.length === 1 ? (first?.displayName || 'them') : undefined, callIds });
  }, [contacts]);

  const inviteToCall = useCallback((room: ChatRoom, userId: string) => {
    startCall(userId, 'VIDEO', {
      roomId: room.id, roomName: room.name || 'Call',
      callerName: auth.currentUser?.displayName || 'Someone',
      callerPhoto: auth.currentUser?.photoURL || '',
    }).catch(() => {});
  }, []);

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    await updateCallStatus(incoming.id, 'CONNECTED');
    const room: ChatRoom = {
      id: incoming.roomId || `call_${incoming.id}`,
      name: incoming.roomName || incoming.callerName || 'Call',
      type: 'PRIVATE',
      participants: [incoming.callerId, auth.currentUser?.uid || ''].filter(Boolean),
    } as any;
    setActive({ room, isCaller: false, callIds: [incoming.id] });
    setIncoming(null);
  }, [incoming]);

  const declineIncoming = useCallback(async () => {
    if (incoming) await updateCallStatus(incoming.id, 'ENDED');
    setIncoming(null);
  }, [incoming]);

  const endActive = useCallback(() => {
    const a = activeRef.current;
    if (a) a.callIds.forEach(id => updateCallStatus(id, 'ENDED').catch(() => {}));
    setActive(null);
  }, []);

  return (
    <CallContext.Provider value={{ placeCall, inCall: !!active }}>
      {children}
      <AnimatePresence>
        {incoming && !active && (
          <IncomingRing call={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && (
          <VideoChat
            key={active.room.id}
            room={active.room}
            user={auth.currentUser}
            callType={'VIDEO'}
            ringingName={active.isCaller ? active.ringingName : undefined}
            contacts={contacts}
            onInvite={(userId) => inviteToCall(active.room, userId)}
            onClose={endActive}
          />
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
};

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}
