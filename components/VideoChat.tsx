import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff,
  Settings, UserPlus, LayoutGrid, Monitor, Wifi, WifiOff,
  Maximize2, Minimize2, MessageSquare, ChevronUp, Send, X, MonitorSpeaker, Search, Heart, Hand, Clapperboard, Captions,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Circle } from 'lucide-react';
import { ChatRoom } from '../types';
import { auth } from '../services/backendService';
import LiveDocDock from './live/LiveDocDock';
import { MeetingControl, meetingRoomFor, meetingPeerAllowed } from '../services/meetingCore';
import { MeetingMessage, watchMeeting, watchMeetingMessages, sendMeetingMessage } from '../services/meetingService';
import MeetingControls from './chat/MeetingControls';
import { useRtcSession } from '../hooks/useRtcSession';
import { useLiveFx } from '../hooks/useLiveFx';
const LiveMediaSheet = React.lazy(() => import('./live/LiveMediaSheet'));
import { beginMeetingRecording, listenRecordings, type ActiveRecording } from '../services/meetings/meetingRecording';
import type { MeetingRecording } from '../services/meetings/meetingRecordingCore';
import { useMeetingCaptions } from '../hooks/useMeetingCaptions';
import { MeetingRecordPanel, RecordingNotice, LiveCaptionsOverlay, type RecordChoice } from './meetings/MeetingRecordPanel';
import MeetingRecordingView from './meetings/MeetingRecordingView';
import { listenLobby, decideEntry } from '../services/meetings/meetingSchedule';
import type { LobbyEntry } from '../services/meetings/scheduleCore';
import RomanceFXOverlay from './RomanceFXOverlay';
import { CallControlBar, ReactionBar, ReactionFloats } from './call/CallControls';
import { ChatProduction } from '../services/chatProduction';
import { queueCallShow } from '../services/ambo/liveCallShows';

export interface CallContact { uid: string; displayName: string; photoURL?: string }

/** A scheduled meeting that admits guests: its own shared call session instead of the room's. */
export interface MeetingSession {
  collectionName: string;
  meetingId: string;
  title: string;
  /** member = in the chat (sees the waiting room); guest = joined from the link. */
  role: 'member' | 'guest';
}

interface VideoChatProps {
  /** Run on a scheduled meeting's shared session (guests possible) instead of the room's call. */
  session?: MeetingSession;
  room: ChatRoom;
  onClose: () => void;
  user: any;
  /** 'AUDIO' starts camera-off. */
  callType?: 'AUDIO' | 'VIDEO';
  /** Caller-side label shown while waiting for the callee to pick up. */
  ringingName?: string;
  /** Ring another user into this same call. */
  onInvite?: (userId: string) => void;
  /** People you can add to the call (for the add-caller picker). */
  contacts?: CallContact[];
}

/** Attaches a MediaStream to a <video>. One tile per participant. */
const StreamTile: React.FC<{ stream: MediaStream; label: string; muted?: boolean; mirror?: boolean; connecting?: boolean; contain?: boolean }> =
({ stream, label, muted, mirror, connecting, contain }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
      <video ref={ref} autoPlay playsInline muted={muted}
        className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'} ${mirror ? 'scale-x-[-1]' : ''}`} />
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
        {!connecting && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>
    </motion.div>
  );
};

/**
 * VideoChat — messaging video/voice call on the unified rtcCore backbone (mesh),
 * so the SAME component handles 1:1 AND group calls. Includes fullscreen, an
 * in-call chat panel, live device/source switching (camera, mic, screen, desktop
 * audio), add-a-caller, and a local self + screen preview.
 */

const VideoChat: React.FC<VideoChatProps> = ({ room, onClose, user, callType = 'VIDEO', ringingName, onInvite, contacts = [], session }) => {
  const isGuest = session?.role === 'guest';
  // Waiting room (members of a guest-enabled meeting): who is knocking, and who is already in.
  const [lobby, setLobby] = useState<LobbyEntry[]>([]);
  useEffect(() => (session?.role === 'member' ? listenLobby(session.meetingId, setLobby) : undefined), [session?.role, session?.meetingId]);
  const admittedGuests = useMemo(() => lobby.filter(e => e.status === 'ADMITTED').map(e => e.uid), [lobby]);
  const waiting = lobby.filter(e => e.status === 'WAITING');
  // Who may appear in this call: chat members (plus admitted guests); a guest sees everyone the session lets in.
  const peerOk = useCallback((id: string) => isGuest || room.participants.includes(id) || admittedGuests.includes(id), [isGuest, room.participants, admittedGuests]);
  const selfId = auth.currentUser?.uid;
  const [floats, setFloats] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [romanceFx, setRomanceFx] = useState<boolean>(!!room?.isIntimate); // rose-petals/hearts on intimate calls
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [productionEnabled, setProductionEnabled] = useState(false);
  const [productionConsent, setProductionConsent] = useState(false);
  const [productionNotice, setProductionNotice] = useState('');
  const [consentingPeers, setConsentingPeers] = useState<Set<string>>(new Set());
  const producer = useRef<ChatProduction | null>(null);
  const isProducer = !!selfId && room.ownerId === selfId;
  const [meeting, setMeeting] = useState<MeetingControl | null>(null);
  const [meetingReady, setMeetingReady] = useState(false);
  const [meetingError, setMeetingError] = useState('');
  const meetingRoom = meetingRoomFor(meeting, selfId || '');
  const removed = !!selfId && !!meeting?.removedIds.includes(selfId);
  const excludedMeetingPeers = useMemo(() => room.participants.filter(id => !meetingPeerAllowed(meeting, selfId || '', id)), [room.participants, meeting, selfId]);
  useEffect(() => {
    setMeetingReady(false); setMeeting(null); setMeetingError('');
    if (session) { setMeetingReady(true); return; } // breakouts/moderation belong to the room's own call
    return watchMeeting(room.id, state => { setMeeting(state); setMeetingReady(true); }, error => { setMeetingError(error.message); setMeetingReady(false); });
  }, [room.id]);

  const rootRef = useRef<HTMLDivElement>(null);

  // ── Recording (host's device; optional cloud segments) + per-person captions ──
  const activeRec = useRef<ActiveRecording | null>(null);
  const captionsRef = useRef<((peer: string, payload: any) => void) | null>(null);
  const [recordings, setRecordings] = useState<MeetingRecording[]>([]);
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState('');
  const [captionOptOut, setCaptionOptOut] = useState(false);
  const [finished, setFinished] = useState<MeetingRecording | null>(null);
  const [openRecording, setOpenRecording] = useState<MeetingRecording | null>(null);
  useEffect(() => listenRecordings(room.id, setRecordings), [room.id]);
  // The recording in progress (anyone's): everyone sees the notice and contributes captions.
  const roomRecording = recordings.find(r => r.status === 'RECORDING' && Date.now() - r.startedAt < 12 * 60 * 60 * 1000) || null;
  // Guests can't read the room's recordings, so the host also announces one over the call itself.
  const [announcedRecording, setAnnouncedRecording] = useState<MeetingRecording | null>(null);
  const liveRecording = roomRecording || announcedRecording;

  const addFloat = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFloats(prev => [...prev, { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 2600);
  }, []);

  const rtc = useRtcSession(meetingReady && !removed ? {
    collectionName: session?.collectionName || `chat_rooms/${room.id}/meeting_rtc`,
    sessionId: session ? 'main' : meetingRoom,
    // Heartbeats let chats show who is in the call (huddle banner) and drop crashed peers.
    liveness: true,
    topology: 'mesh',
    role: 'participant',
    media: { audio: true, video: callType !== 'AUDIO' },
    displayName: auth.currentUser?.displayName || 'You',
  } : null, {
    excludePeerIds: excludedMeetingPeers,
    allowedPeerIds: isGuest ? undefined : [...room.participants, ...admittedGuests],
    // The session ended mid-recording: close out the meeting recording (the device copy is already safe).
    onRecordingStopped: () => { const rec = activeRec.current; activeRec.current = null; void rec?.finish().catch(() => {}); },
    // Data-channel reactions — instant, peer-to-peer (no Firestore round-trip).
    onData: (peer, msg) => {
      if (!peerOk(peer) || !meetingPeerAllowed(meeting, selfId || '', peer)) return;
      if (msg.type === 'reaction' && msg.payload?.emoji) addFloat(msg.payload.emoji);
      if (msg.type === 'caption') captionsRef.current?.(peer, msg.payload);
      if (msg.type === 'meeting:recording') {
        const p = msg.payload;
        setAnnouncedRecording(p?.active && typeof p.id === 'string'
          ? { id: p.id, hostUid: peer, hostName: String(p.hostName || 'The host').slice(0, 100), title: '', mode: p.mode === 'CLOUD' ? 'CLOUD' : 'LOCAL', kind: 'VIDEO', status: 'RECORDING', startedAt: Number(p.startedAt) || Date.now() }
          : null);
      }
      if (msg.type === 'meeting:hand') setRaisedHands(prev => { const next = new Set(prev); if (msg.payload?.raised === true) next.add(peer); else next.delete(peer); return next; });
      if (msg.type === 'production:consent') setConsentingPeers(prev => { const next = new Set(prev); if (msg.payload?.allowed === true) next.add(peer); else next.delete(peer); return next; });
    },
  });
  // Lenses / looks / LUTs on the outgoing camera (hooks/useLiveFx) — engaged only when picked.
  const fx = useLiveFx(rtc);
  const lastMute = useRef<number>(0);
  useEffect(() => {
    const request = meeting?.muteRequests[selfId || ''] || 0;
    if (request > lastMute.current) { rtc.setAudio(false); setMeetingError('A moderator muted your microphone. You can unmute when you are ready.'); }
    lastMute.current = request;
  }, [meeting?.muteRequests, selfId, rtc.setAudio]);
  useEffect(() => { setRaisedHands(new Set()); setConsentingPeers(new Set()); setProductionConsent(false); setHandRaised(false); }, [meetingRoom]);
  useEffect(() => { if (removed) { setProductionEnabled(false); setMeetingError('You were removed from this meeting.'); } }, [removed]);

  // Tell everyone (guests included) when this device is recording; re-sent as people join.
  const myRecording = roomRecording && roomRecording.hostUid === selfId ? roomRecording : null;
  useEffect(() => {
    rtc.sendData('meeting:recording', myRecording
      ? { active: true, id: myRecording.id, hostName: myRecording.hostName, mode: myRecording.mode, startedAt: myRecording.startedAt }
      : { active: false });
  }, [rtc.participants, rtc.peerStates, myRecording?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    rtc.sendData('meeting:hand', { raised: handRaised });
    rtc.sendData('production:consent', { allowed: productionConsent });
  }, [rtc.participants, rtc.peerStates, handRaised, productionConsent]);
  useEffect(() => {
    setConsentingPeers(previous => new Set([...previous].filter(id => rtc.remoteStreams.has(id))));
  }, [rtc.remoteStreams]);
  useEffect(() => {
    if (!productionEnabled || !isProducer || room.isIntimate) return;
    let instance: ChatProduction;
    try { instance = new ChatProduction(room.id, room.name || 'Call'); }
    catch { setProductionEnabled(false); setProductionNotice('This device could not start live production output.'); return; }
    producer.current = instance;
    return () => { instance.dispose(); producer.current = null; };
  }, [productionEnabled, room.id, isProducer, room.isIntimate]);
  useEffect(() => {
    const moderators = new Set([room.ownerId, meeting?.hostId, ...(room.meetingModeratorIds || []), ...(meeting?.moderatorIds || [])]);
    producer.current?.update([
      ...(rtc.localStream && selfId ? [{ id: selfId, name: 'You', stream: rtc.localStream, moderator: moderators.has(selfId), allowed: productionConsent }] : []),
      ...[...rtc.remoteStreams].filter(([id]) => peerOk(id) && meetingPeerAllowed(meeting, selfId || '', id)).map(([id, stream]) => ({ id, name: rtc.participants.find(p => p.id === id)?.name || 'Participant', stream, moderator: moderators.has(id), allowed: consentingPeers.has(id) })),
    ]);
  }, [productionEnabled, isProducer, room.isIntimate, rtc.localStream, rtc.remoteStreams, rtc.participants, consentingPeers, productionConsent, room.ownerId, room.meetingModeratorIds, room.participants, selfId, meeting]);

  const react = (emoji: string) => { addFloat(emoji); rtc.sendData('reaction', { emoji }); };

  const captions = useMeetingCaptions({
    roomId: room.id, selfId, selfName: auth.currentUser?.displayName || 'Participant', localStream: rtc.localStream,
    sendData: rtc.sendData, optOut: captionOptOut,
    recording: liveRecording ? { id: liveRecording.id, startedAt: liveRecording.startedAt } : null,
  });
  captionsRef.current = (peer, payload) => captions.receive(peer, nameFor(peer), payload);

  // ── Local self preview (kept mounted so the stream stays attached) ──────────
  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (localRef.current) localRef.current.srcObject = rtc.localStream; }, [rtc.localStream, rtc.videoEnabled]);
  // ── Local screen (your own desktop feed while sharing) ──────────────────────
  const screenRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (screenRef.current) screenRef.current.srcObject = rtc.screenStream; }, [rtc.screenStream]);

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  // Each meeting room has a separate encrypted message stream.
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMessages([]); setDraft('');
    if (!meetingReady || removed || session) return;
    return watchMeetingMessages(room.id, meetingRoom, setMessages, error => setMeetingError(error.message));
  }, [room.id, meetingRoom, meetingReady, removed]);
  useEffect(() => { if (showChat) msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showChat]);
  const sendChat = async () => {
    const text = draft.trim();
    if (!text || sendingChat || removed || !meetingReady) return;
    setSendingChat(true);
    try { await sendMeetingMessage(room.id, meetingRoom, text); setDraft(current => current.trim() === text ? '' : current); }
    catch (error) { setMeetingError((error as Error).message); }
    finally { setSendingChat(false); }
  };

  const remotes = [...rtc.remoteStreams.entries()].filter(([id]) => peerOk(id) && meetingPeerAllowed(meeting, selfId || '', id));
  const hasScreen = !!rtc.screenStream;
  const total = remotes.length + 1;
  const tiles = total + (hasScreen ? 1 : 0);
  const anyConnecting = [...rtc.peerStates.values()].some(s => s === 'connecting' || s === 'new');
  const allConnected = remotes.length > 0 && [...rtc.peerStates.values()].every(s => s === 'connected');
  // Mobile-first: a 1:1 call (2 tiles) stacks on phones instead of two tiny side-by-side tiles.
  const cols = tiles <= 1 ? 'grid-cols-1' : tiles <= 2 ? 'grid-cols-1 sm:grid-cols-2' : tiles <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';

  const nameFor = (peerId: string) => rtc.participants.find(p => p.id === peerId)?.name || 'Participant';

  const stopMeetingRecording = async () => {
    const rec = activeRec.current;
    if (!rec) return;
    setRecBusy(true);
    try {
      await rtc.stopRecording();
      activeRec.current = null;
      setFinished(await rec.finish());
    } catch (e: any) {
      setRecError(e?.message || 'The recording could not be saved. Your device copy is kept.');
    } finally { setRecBusy(false); }
  };
  const startMeetingRecording = async (choice: RecordChoice) => {
    setRecBusy(true); setRecError('');
    try {
      const title = `${room.name || 'Call'} · ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
      const rec = await beginMeetingRecording({ roomId: room.id, title, ...choice });
      const ok = rtc.startRecording({ audioOnly: choice.kind === 'AUDIO', onData: chunk => rec.write(chunk) });
      if (!ok) { await rec.finish(); throw new Error('This device could not start recording.'); }
      activeRec.current = rec;
      setShowRecordPanel(false);
    } catch (e: any) {
      setRecError(e?.message || 'Recording could not start.');
    } finally { setRecBusy(false); }
  };
  const toggleRecord = async () => {
    if (activeRec.current) await stopMeetingRecording();
    else setShowRecordPanel(v => !v);
  };

  const invite = (uid: string) => {
    onInvite?.(uid);
    setInvited(prev => new Set(prev).add(uid));
  };

  const end = async () => {
    if (activeRec.current) await stopMeetingRecording();
    rtc.leave(); onClose();
  };

  const inCallIds = new Set([selfId, ...rtc.participants.map(p => p.id)].filter(Boolean) as string[]);
  const addable = contacts
    .filter(c => !inCallIds.has(c.uid))
    .filter(c => !addQuery || c.displayName.toLowerCase().includes(addQuery.toLowerCase()));

  return (
    <div ref={rootRef} className="fixed inset-0 z-[500] bg-[#050505] flex overflow-hidden">
      {/* Main call column */}
      <div className="relative flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Romance FX — falling rose petals + hearts on intimate calls */}
      {room?.isIntimate && romanceFx && <RomanceFXOverlay />}
      {/* Top bar */}
      <div className="p-3 sm:p-6 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="p-2 sm:p-3 bg-red-500/20 rounded-2xl shrink-0"><Video className="text-red-500 w-5 h-5 sm:w-6 sm:h-6" /></div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-black uppercase tracking-tightest leading-none truncate">{session?.title || room.name || 'Call'}</h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1 truncate">{callType === 'AUDIO' ? 'Voice' : 'Live Video'} Session • {total} in call</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {room?.isIntimate && (
            <button onClick={() => setRomanceFx(v => !v)} title="Romance FX"
              className={`p-2.5 sm:p-4 rounded-2xl transition-all ${romanceFx ? 'bg-rose-500/20 text-rose-400' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
              <Heart size={20} fill={romanceFx ? 'currentColor' : 'none'} />
            </button>
          )}
          {!session && <button onClick={() => setShowChat(s => !s)} title="Chat"
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${showChat ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <MessageSquare size={20} />
          </button>}
          <button onClick={() => captions.setShowCaptions(v => !v)} aria-pressed={captions.showCaptions} title={captions.showCaptions ? 'Hide captions' : 'Show captions'}
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${captions.showCaptions ? 'bg-amber-400/20 text-amber-300' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <Captions size={20} />
          </button>
          <button onClick={() => setHandRaised(v => !v)} aria-label={handRaised ? 'Lower hand' : 'Raise hand'} aria-pressed={handRaised} title={handRaised ? 'Lower hand' : 'Raise hand'} className={`p-2.5 rounded-2xl ${handRaised ? 'bg-amber-400/20 text-amber-300' : 'bg-white/5 text-white/50'}`}><Hand size={20} /></button>
          <button onClick={() => { setShowAdd(s => !s); setShowSettings(false); }} title="Add people"
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${showAdd ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <UserPlus size={20} />
          </button>
          <button onClick={toggleFullscreen} title={isFull ? 'Exit fullscreen' : 'Fullscreen'}
            className="hidden sm:flex p-2.5 sm:p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white">
            {isFull ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            onClick={() => { rtc.refreshDevices(); setShowSettings(s => !s); setShowAdd(false); }}
            title="Camera, mic & effects"
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${showSettings ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-white/10 text-xs bg-black/30">
        {handRaised && <span className="text-amber-300">Your hand is raised</span>}
        {[...raisedHands].filter(id => rtc.participants.some(p => p.id === id)).map(id => <span key={id} className="text-amber-300">✋ {nameFor(id)}</span>)}
        {!room.isIntimate && <label className="flex items-center gap-2"><input type="checkbox" checked={productionConsent} onChange={e => setProductionConsent(e.target.checked)} /> Allow my audio/video in live production</label>}
        {!room.isIntimate && isProducer && <>
          <button onClick={() => setProductionEnabled(v => !v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${productionEnabled ? 'bg-red-500/20 text-red-300' : 'bg-white/10'}`}><Clapperboard size={14} /> {productionEnabled ? 'Stop production feeds' : 'Route call to production'}</button>
          {productionEnabled && <button onClick={() => { const show = producer.current?.show(); if (show && selfId) { queueCallShow(selfId, show); setProductionNotice('Group and single shots sent to Stage. They load when you open the presenter. Keep the call running for live media.'); } }} className="rounded-lg px-3 py-2 bg-white/10">Send group + singles to Stage</button>}
          {productionEnabled && <span className="text-white/50">Moderators excluded · consenting guests only</span>}
        </>}
        {productionNotice && <span role="status" className="text-white/60">{productionNotice}</span>}
      </div>

      {meetingError && <div role="status" className="px-4 py-2 text-sm text-amber-300 bg-amber-400/10">{meetingError}</div>}
      {liveRecording && (
        <div className="px-4 pt-2">
          <RecordingNotice hostName={liveRecording.hostName} isHost={liveRecording.hostUid === selfId} mode={liveRecording.mode}
            startedAt={liveRecording.startedAt} optOut={captionOptOut} onToggleOptOut={() => setCaptionOptOut(v => !v)}
            onStop={activeRec.current ? () => void stopMeetingRecording() : undefined} stopping={recBusy} />
        </div>
      )}
      {recError && <div role="status" className="px-4 py-2 text-sm text-red-300 bg-red-500/10">{recError}</div>}
      {finished && (
        <div role="status" className="mx-4 mt-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-[12px]">
          <span className="text-white/80">Recording saved{finished.mode === 'CLOUD' ? ' to the cloud' : ' on this device'}. Captions are in the transcript.</span>
          <button onClick={() => { setOpenRecording(finished); setFinished(null); }} className="ml-auto px-3 py-1 rounded-lg bg-white text-black font-bold">Open and make a recap</button>
          <button onClick={() => setFinished(null)} aria-label="Dismiss" className="p-1 text-white/50 hover:text-white"><X size={14} /></button>
        </div>
      )}
      {session?.role === 'member' && waiting.length > 0 && (
        <div role="region" aria-label="Waiting room" className="mx-4 mt-2 flex flex-col gap-1.5 px-3 py-2.5 rounded-2xl bg-sky-500/10 border border-sky-400/25">
          <p className="text-[11px] font-black uppercase tracking-widest text-sky-200">Waiting room · {waiting.length}</p>
          {waiting.map(g => (
            <div key={g.uid} className="flex items-center gap-2 text-[12px] text-white">
              <span className="flex-1 min-w-0 truncate"><b>{g.name}</b> <span className="text-white/50">(guest) wants to join</span></span>
              <button onClick={() => decideEntry(session.meetingId, g.uid, 'ADMITTED').catch(e => setMeetingError(e.message))} className="px-3 py-1 rounded-lg bg-sky-400 text-black font-bold">Let in</button>
              <button onClick={() => decideEntry(session.meetingId, g.uid, 'DENIED').catch(e => setMeetingError(e.message))} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20">Deny</button>
            </div>
          ))}
        </div>
      )}
      {!session && meetingReady && !removed && selfId && !room.isIntimate && <MeetingControls room={room} state={meeting} uid={selfId} participants={room.participants.filter(id => id !== selfId).map(id => ({ id, name: rtc.participants.find(p => p.id === id)?.name || contacts.find(c => c.uid === id)?.displayName || 'Conversation member' }))} onError={setMeetingError} />}
      {/* Add-a-caller picker */}
      <AnimatePresence>
        {showAdd && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAdd(false)} className="fixed inset-0 z-40" />
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute top-24 right-6 z-50 w-80 max-w-[92vw] bg-[#0c0c0f] border border-white/10 rounded-3xl shadow-2xl p-4">
              <div className="flex items-center gap-2 mb-3"><UserPlus size={15} className="text-small-orange" /><h3 className="text-[11px] font-black uppercase tracking-widest text-white">Add to call</h3></div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 mb-3">
                <Search size={13} className="text-white/30" />
                <input value={addQuery} onChange={e => setAddQuery(e.target.value)} placeholder="Search people…"
                  className="bg-transparent text-xs text-white outline-none flex-1 placeholder:text-white/30" />
              </div>
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                {addable.length === 0 && <p className="text-[10px] text-white/30 px-2 py-4 text-center">No one to add.</p>}
                {addable.map(c => (
                  <div key={c.uid} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                    <img src={c.photoURL || `https://picsum.photos/seed/${c.uid}/80`} alt="" className="w-9 h-9 rounded-full object-cover" />
                    <span className="flex-1 text-xs font-bold text-white truncate">{c.displayName}</span>
                    <button onClick={() => invite(c.uid)} disabled={invited.has(c.uid)}
                      className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ${invited.has(c.uid) ? 'bg-white/5 text-white/40' : 'bg-small-orange text-white hover:brightness-110'}`}>
                      {invited.has(c.uid) ? 'Ringing…' : 'Call'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Device settings — pick + swap camera / mic live during the call */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)} className="fixed inset-0 z-40" />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute top-24 right-6 z-50">
              <React.Suspense fallback={null}>
                <LiveMediaSheet rtc={rtc} fx={fx} onClose={() => setShowSettings(false)} micMuted={!rtc.audioEnabled} video={callType !== 'AUDIO'}>
                  <button onClick={() => rtc.useDesktopAudio()} className="w-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2 transition-all">
                    <MonitorSpeaker size={13} /> Use desktop / system audio
                  </button>
                </LiveMediaSheet>
              </React.Suspense>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Connection banner */}
      {(anyConnecting || allConnected || (ringingName && remotes.length === 0)) && (
        <div className={`shrink-0 flex items-center justify-center gap-2 py-1.5 text-[9px] font-black uppercase tracking-widest ${
          allConnected ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-white/40'
        }`}>
          {allConnected ? <Wifi size={11} /> : <div className="w-3 h-3 border border-current rounded-full animate-spin border-t-transparent" />}
          {allConnected ? 'Connected' : ringingName && remotes.length === 0 ? `Ringing ${ringingName}…` : 'Connecting…'}
        </div>
      )}
      {rtc.error && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-red-500/15 text-red-400 text-[9px] font-black uppercase tracking-widest">
          <WifiOff size={11} /> {rtc.error}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 p-3 sm:p-6 lg:p-12 overflow-y-auto">
        <div className={`grid gap-3 sm:gap-6 h-full ${cols}`}>
          {/* Local tile — always mounted so the self-preview stays attached */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <video ref={localRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            {!rtc.videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="w-24 h-24 rounded-full bg-white/10 border border-white/10 flex items-center justify-center"><VideoOff size={36} className="text-white/20" /></div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest">
              You {!rtc.audioEnabled && <MicOff size={9} className="inline ml-1 text-red-400" />}
            </div>
          </motion.div>

          {/* Your screen (local desktop feed while sharing) */}
          {hasScreen && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-video bg-black border border-small-orange/40 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <video ref={screenRef} autoPlay muted playsInline className="w-full h-full object-contain" />
              <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-small-orange/40 text-[9px] font-black uppercase tracking-widest text-small-orange">
                Your screen
              </div>
            </motion.div>
          )}

          {/* Remote tiles — one per peer (1:1 or group, same path) */}
          {remotes.map(([peerId, stream]) => (
            <StreamTile key={peerId} stream={stream} label={nameFor(peerId)} />
          ))}

          {/* Waiting state */}
          {remotes.length === 0 && (
            <div className="aspect-video bg-white/5 border border-white/5 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{ringingName ? `Ringing ${ringingName}…` : 'Waiting for others to join…'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating reactions (data channel) + reaction bar + controls — shared call chrome */}
      {(captions.showCaptions || captions.error) && (
        <div className="absolute inset-x-0 bottom-36 z-30">
          <LiveCaptionsOverlay lines={captions.lines} status={captions.showCaptions ? captions.status : ''} error={captions.error} />
        </div>
      )}
      {showRecordPanel && !activeRec.current && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50">
          <MeetingRecordPanel defaultKind={callType === 'AUDIO' ? 'AUDIO' : 'VIDEO'} busy={recBusy} error={recError}
            onStart={c => void startMeetingRecording(c)} onClose={() => setShowRecordPanel(false)} />
        </div>
      )}
      {openRecording && <MeetingRecordingView roomId={room.id} recording={openRecording} onClose={() => setOpenRecording(null)} />}
      <ReactionFloats floats={floats} />
      <ReactionBar onReact={react} />
      <CallControlBar rtc={rtc} onEnd={() => void end()} record={isGuest ? undefined : { active: rtc.isRecording, toggle: () => void toggleRecord() }} />
      </div>

      {/* In-call chat side panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute inset-0 z-40 w-full sm:relative sm:inset-auto sm:z-auto sm:w-[360px] sm:max-w-[85vw] shrink-0 border-l border-white/10 bg-[#0a0a0d] flex flex-col">
            <div className="p-5 flex items-center gap-2 border-b border-white/10">
              <MessageSquare size={15} className="text-small-orange" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white flex-1">{meeting?.breakoutRooms[meetingRoom] || 'Meeting'} chat</h3>
              <button onClick={() => setShowChat(false)} className="text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && <p className="text-[10px] text-white/30 text-center py-8 uppercase tracking-widest font-black">No messages yet</p>}
              {messages.map(m => {
                const mine = m.senderId === selfId;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && <span className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1 px-1">{m.senderName}</span>}
                    <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[13px] leading-snug ${mine ? 'bg-small-orange text-white rounded-br-sm' : 'bg-white/8 text-white rounded-bl-sm'}`}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              <input value={draft} disabled={removed || !meetingReady} maxLength={2000} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendChat(); }}
                placeholder="Message…" className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-[13px] text-white outline-none focus:border-small-orange/60 placeholder:text-white/30" />
              <button aria-label="Send meeting message" disabled={sendingChat || removed || !meetingReady || !draft.trim()} onClick={() => void sendChat()} className="p-2.5 bg-small-orange text-white rounded-full hover:brightness-110 transition-all disabled:opacity-40"><Send size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <LiveDocDock sessionKey={`call_${room.id}`} canPresent={!isGuest} hostName={auth.currentUser?.displayName || 'You'} audience="members" memberUids={room.participants} />
    </div>
  );
};

export default VideoChat;
