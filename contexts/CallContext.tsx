// CallContext — the ONE global call orchestrator. Mounted at the app root so a
// user is rung anywhere in the app (not just inside chat). It owns:
//   • outgoing calls  — placeCall(room, type) rings every other participant and
//     opens the real rtc call (VideoChat) for the caller,
//   • incoming calls  — a global listener surfaces a ring UI (accept/decline);
//     accepting drops the callee straight into the same rtc session,
//   • add-a-caller     — inviteToCall(userId) rings someone into the live call.
// There is a single <VideoChat> mount here, so a call persists across navigation.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video as VideoIcon, User, Voicemail, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatRoom, CallSession } from '../types';
import {
  auth, startCall, listenToCalls, updateCallStatus, listenToCall, fetchChatRooms, fetchUserProfile,
  sendMessage, uploadFile, createNotification,
} from '../services/backendService';
import VideoChat, { CallContact } from '../components/VideoChat';
import VoiceRecorder from '../components/VoiceRecorder';

interface CallPeer { uid?: string; name?: string; photo?: string }

interface ActiveCall {
  room: ChatRoom;
  isCaller: boolean;
  ringingName?: string;
  peer?: CallPeer;
  /** call docs this side created (caller), so we can cancel them on hang-up. */
  callIds: string[];
}

/** A call the caller placed that went unanswered — offer to leave a voice message. */
interface MissedCall {
  room: ChatRoom;
  peer?: CallPeer;
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

// Compact incoming-call card — floats bottom-left near the chat icon (WhatsApp/
// Discord style) instead of taking over the whole screen. z-[330] sits above the
// PublishTray (320) and other bottom-left widgets.
const IncomingRing: React.FC<{ call: CallSession; onAccept: () => void; onDecline: () => void }> = ({ call, onAccept, onDecline }) => {
  useRingtone(true);
  return (
    <motion.div
      initial={{ opacity: 0, x: -24, y: 8 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="fixed bottom-6 left-6 z-[330] w-[300px] max-w-[86vw]">
      <div className="bg-[#0c0c0f]/95 backdrop-blur-2xl border border-white/10 rounded-[1.75rem] shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-4">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 shrink-0">
            <div className="absolute inset-0 bg-small-orange/25 rounded-full blur-lg animate-pulse" />
            <div className="relative w-14 h-14 rounded-full border-2 border-white/10 overflow-hidden">
              {call.callerPhoto
                ? <img src={call.callerPhoto} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-white/5 flex items-center justify-center"><User size={24} className="text-white/30" /></div>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-tight text-white truncate">{call.callerName || 'Someone'}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-small-orange mt-0.5 flex items-center gap-1">
              <VideoIcon size={10} /> Incoming {call.type === 'VIDEO' ? 'video' : 'voice'} call…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={onDecline} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/90 hover:bg-red-500 rounded-2xl transition-all">
            <PhoneOff size={16} className="text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Decline</span>
          </button>
          <button onClick={onAccept} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 rounded-2xl transition-all animate-pulse">
            <Phone size={16} className="text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Accept</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Shown to the CALLER when a call goes unanswered — record a voice message that
// drops into the conversation, WhatsApp-style.
const MissedCallCard: React.FC<{ missed: MissedCall; onSend: (blob: Blob) => Promise<void>; onDismiss: () => void }> = ({ missed, onSend, onDismiss }) => {
  const [sending, setSending] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="fixed bottom-6 left-6 z-[330] w-[320px] max-w-[86vw]">
      <div className="bg-[#0c0c0f]/95 backdrop-blur-2xl border border-white/10 rounded-[1.75rem] shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full border-2 border-white/10 overflow-hidden shrink-0">
            {missed.peer?.photo
              ? <img src={missed.peer.photo} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/5 flex items-center justify-center"><User size={20} className="text-white/30" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black uppercase tracking-tight text-white truncate">{missed.peer?.name || 'No answer'}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mt-0.5 flex items-center gap-1"><Voicemail size={10} /> Leave a voice message</p>
          </div>
          {!sending && (
            <button onClick={onDismiss} className="text-white/30 hover:text-white shrink-0"><X size={16} /></button>
          )}
        </div>
        <div className="mt-3">
          {sending ? (
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-small-orange py-3">Sending…</p>
          ) : (
            <VoiceRecorder
              onSend={async (blob) => { setSending(true); await onSend(blob); }}
              onCancel={onDismiss}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [missed, setMissed] = useState<MissedCall | null>(null);
  const [contacts, setContacts] = useState<CallContact[]>([]);
  const activeRef = useRef<ActiveCall | null>(null);
  activeRef.current = active;
  // Set when the caller hangs up themselves, so we don't also show the missed card.
  const hungUpRef = useRef(false);

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
    const peer: CallPeer = { uid: receivers[0], name: first?.displayName || room.name || 'them', photo: first?.photoURL };
    hungUpRef.current = false;
    setMissed(null);
    setActive({ room, isCaller: true, ringingName: receivers.length === 1 ? (first?.displayName || 'them') : undefined, peer, callIds });
  }, [contacts]);

  // Caller side: detect a no-answer (declined or 30s timeout with nobody connected)
  // for a 1:1 call, and offer to leave a voice message.
  useEffect(() => {
    if (!active?.isCaller || active.callIds.length !== 1) return; // group calls don't get a VM prompt
    const callId = active.callIds[0];
    let answered = false, done = false;
    const toMissed = () => {
      if (done) return; done = true;
      if (!answered && !hungUpRef.current) {
        const a = activeRef.current;
        setActive(null);
        if (a) setMissed({ room: a.room, peer: a.peer });
      }
    };
    const unsub = listenToCall(callId, (call) => {
      if (!call) return;
      if (call.status === 'CONNECTED') { answered = true; }
      else if ((call.status === 'ENDED' || call.status === 'MISSED')) { toMissed(); }
    });
    const timer = setTimeout(() => {
      if (!answered && !hungUpRef.current) { updateCallStatus(callId, 'MISSED').catch(() => {}); toMissed(); }
    }, 30000);
    return () => { try { unsub?.(); } catch {} clearTimeout(timer); };
  }, [active]);

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
    hungUpRef.current = true; // user chose to hang up — don't show the missed-call VM card
    if (a) a.callIds.forEach(id => updateCallStatus(id, 'ENDED').catch(() => {}));
    setActive(null);
  }, []);

  // Send the recorded missed-call voice message into the conversation.
  const sendMissedVoice = useCallback(async (blob: Blob) => {
    const m = missed;
    if (!m) return;
    try {
      const url = await uploadFile(`chat/${m.room.id}/voice/${Date.now()}_missedcall.webm`, blob);
      await sendMessage(m.room.id, {
        senderId: auth.currentUser?.uid || '',
        senderName: auth.currentUser?.displayName || 'You',
        senderPhoto: auth.currentUser?.photoURL || '',
        voiceUrl: url,
        type: 'VOICE',
      } as any);
      if (m.peer?.uid) {
        createNotification({
          userId: m.peer.uid,
          senderId: auth.currentUser?.uid || '',
          senderName: auth.currentUser?.displayName || 'Someone',
          senderPhoto: auth.currentUser?.photoURL || '',
          type: 'MESSAGE', title: 'Voice message', message: 'Left you a voice message after a missed call',
          link: 'CHAT', targetId: m.room.id,
        } as any).catch(() => {});
      }
    } catch { /* surfaced by uploadFile's own reporting */ }
    setMissed(null);
  }, [missed]);

  return (
    <CallContext.Provider value={{ placeCall, inCall: !!active }}>
      {children}
      <AnimatePresence>
        {incoming && !active && (
          <IncomingRing call={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {missed && !active && !incoming && (
          <MissedCallCard missed={missed} onSend={sendMissedVoice} onDismiss={() => setMissed(null)} />
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
