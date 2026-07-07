import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff,
  Settings, UserPlus, LayoutGrid, Monitor, Wifi, WifiOff,
  Maximize2, Minimize2, MessageSquare, ChevronUp, Send, X, MonitorSpeaker, Search, Heart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Circle } from 'lucide-react';
import { ChatRoom, ChatMessage } from '../types';
import { auth, listenToMessages, sendMessage } from '../services/backendService';
import { useRtcSession } from '../hooks/useRtcSession';
import { saveSessionRecording } from '../services/liveStreamService';
import RomanceFXOverlay from './RomanceFXOverlay';

export interface CallContact { uid: string; displayName: string; photoURL?: string }

interface VideoChatProps {
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
const REACTIONS = ['❤️', '😂', '👍', '🔥', '👏', '🎉'];

const VideoChat: React.FC<VideoChatProps> = ({ room, onClose, user, callType = 'VIDEO', ringingName, onInvite, contacts = [] }) => {
  const selfId = auth.currentUser?.uid;
  const [floats, setFloats] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [srcMenu, setSrcMenu] = useState<'mic' | 'cam' | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [romanceFx, setRomanceFx] = useState<boolean>(!!room?.isIntimate); // rose-petals/hearts on intimate calls

  const rootRef = useRef<HTMLDivElement>(null);

  const addFloat = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFloats(prev => [...prev, { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 2600);
  }, []);

  const rtc = useRtcSession({
    sessionId: `call_${room.id}`,
    topology: 'mesh',
    role: 'participant',
    media: { audio: true, video: callType !== 'AUDIO' },
    displayName: auth.currentUser?.displayName || 'You',
  }, {
    // Data-channel reactions — instant, peer-to-peer (no Firestore round-trip).
    onData: (_peer, msg) => { if (msg.type === 'reaction' && msg.payload?.emoji) addFloat(msg.payload.emoji); },
  });

  const react = (emoji: string) => { addFloat(emoji); rtc.sendData('reaction', { emoji }); };

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

  // ── In-call chat (reuses the room's message thread) ─────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const unsub = listenToMessages(room.id, setMessages);
    return () => { try { unsub?.(); } catch {} };
  }, [room.id]);
  useEffect(() => { if (showChat) msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showChat]);
  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sendMessage(room.id, {
      senderId: selfId || '',
      senderName: auth.currentUser?.displayName || 'You',
      senderPhoto: auth.currentUser?.photoURL || '',
      text,
      type: 'TEXT',
    } as any).catch(() => {});
  };

  const remotes = [...rtc.remoteStreams.entries()];
  const hasScreen = !!rtc.screenStream;
  const total = remotes.length + 1;
  const tiles = total + (hasScreen ? 1 : 0);
  const anyConnecting = [...rtc.peerStates.values()].some(s => s === 'connecting' || s === 'new');
  const allConnected = remotes.length > 0 && [...rtc.peerStates.values()].every(s => s === 'connected');
  // Mobile-first: a 1:1 call (2 tiles) stacks on phones instead of two tiny side-by-side tiles.
  const cols = tiles <= 1 ? 'grid-cols-1' : tiles <= 2 ? 'grid-cols-1 sm:grid-cols-2' : tiles <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';

  const nameFor = (peerId: string) => rtc.participants.find(p => p.id === peerId)?.name || 'Participant';

  const toggleRecord = async () => {
    if (rtc.isRecording) {
      const blob = await rtc.stopRecording();
      if (blob) saveSessionRecording({ blob, title: `${room.name || 'Call'} — recording` });
    } else {
      rtc.startRecording();
    }
  };

  const invite = (uid: string) => {
    onInvite?.(uid);
    setInvited(prev => new Set(prev).add(uid));
  };

  const end = () => { rtc.leave(); onClose(); };

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
            <h2 className="text-base sm:text-xl font-black uppercase tracking-tightest leading-none truncate">{room.name || 'Call'}</h2>
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
          <button onClick={() => setShowChat(s => !s)} title="Chat"
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${showChat ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <MessageSquare size={20} />
          </button>
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
            title="Camera & microphone settings"
            className={`p-2.5 sm:p-4 rounded-2xl transition-all ${showSettings ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <Settings size={20} />
          </button>
        </div>
      </div>

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
              className="absolute top-24 right-6 z-50 w-80 max-w-[92vw] bg-[#0c0c0f] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Settings size={15} className="text-small-orange" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Devices</h3>
                <button onClick={() => rtc.refreshDevices()} title="Refresh" className="ml-auto text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">Refresh</button>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40"><Video size={12} /> Camera</label>
                <select
                  value={rtc.activeDevices.cameraId || ''}
                  onChange={e => rtc.switchVideoDevice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-small-orange/60 [&>option]:bg-[#0c0c0f]">
                  {rtc.devices.cameras.length === 0 && <option value="">No camera found</option>}
                  {rtc.devices.cameras.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40"><Mic size={12} /> Microphone</label>
                <select
                  value={rtc.activeDevices.micId || ''}
                  onChange={e => rtc.switchAudioDevice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-small-orange/60 [&>option]:bg-[#0c0c0f]">
                  {rtc.devices.mics.length === 0 && <option value="">No microphone found</option>}
                  {rtc.devices.mics.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                  ))}
                </select>
                <button onClick={() => rtc.useDesktopAudio()} className="w-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2 transition-all">
                  <MonitorSpeaker size={13} /> Use desktop / system audio
                </button>
              </div>

              <p className="text-[9px] font-bold text-white/30 leading-relaxed">Changes apply instantly — the call keeps running while you swap devices.</p>
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

      {/* Floating reactions (data channel) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        <AnimatePresence>
          {floats.map(f => (
            <motion.div key={f.id}
              initial={{ y: 0, opacity: 1, scale: 0.6 }}
              animate={{ y: -window.innerHeight * 0.5, opacity: 0, scale: 1.5 }}
              exit={{}} transition={{ duration: 2.5, ease: 'easeOut' }}
              className="absolute bottom-32 text-4xl" style={{ left: `${f.x}%` }}>
              {f.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Reaction bar */}
      <div className="flex items-center justify-center gap-2 pb-1">
        {REACTIONS.map(e => (
          <button key={e} onClick={() => react(e)}
            className="text-2xl hover:scale-125 active:scale-95 transition-transform p-1.5 rounded-full hover:bg-white/10">
            {e}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="p-3 sm:p-8 pt-2 bg-gradient-to-t from-black to-transparent flex items-center justify-center gap-2 sm:gap-4 flex-wrap" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {/* Mic + source dropdown */}
        <div className="relative flex items-center">
          <button onClick={rtc.toggleAudio}
            className={`p-4 sm:p-6 rounded-l-full rounded-r-lg transition-all hover:scale-105 ${!rtc.audioEnabled ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
            {!rtc.audioEnabled ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button onClick={() => { setSrcMenu(m => m === 'mic' ? null : 'mic'); rtc.refreshDevices(); }}
            className="px-1.5 py-4 sm:py-6 rounded-r-full rounded-l-lg bg-white/10 text-white/50 hover:bg-white/20 transition-all"><ChevronUp size={14} /></button>
          <AnimatePresence>
            {srcMenu === 'mic' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSrcMenu(null)} />
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full mb-3 left-0 z-50 w-64 bg-[#0c0c0f] border border-white/10 rounded-2xl shadow-2xl p-2">
                  <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Microphone</div>
                  {rtc.devices.mics.length === 0 && <div className="px-2 py-2 text-[10px] text-white/30">No microphone found</div>}
                  {rtc.devices.mics.map((d, i) => {
                    const active = rtc.activeDevices.micId === d.deviceId;
                    return (
                      <button key={d.deviceId || i} onClick={() => { rtc.switchAudioDevice(d.deviceId); setSrcMenu(null); }}
                        className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${active ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                        <Mic size={12} /> <span className="truncate">{d.label || `Microphone ${i + 1}`}</span>
                      </button>
                    );
                  })}
                  <div className="h-px bg-white/10 my-1.5" />
                  <button onClick={() => { rtc.useDesktopAudio(); setSrcMenu(null); }}
                    className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 text-white/70 hover:bg-white/5">
                    <MonitorSpeaker size={12} /> Desktop / system audio
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Camera + source dropdown */}
        <div className="relative flex items-center">
          <button onClick={rtc.toggleVideo}
            className={`p-4 sm:p-6 rounded-l-full rounded-r-lg transition-all hover:scale-105 ${!rtc.videoEnabled ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
            {!rtc.videoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
          </button>
          <button onClick={() => { setSrcMenu(m => m === 'cam' ? null : 'cam'); rtc.refreshDevices(); }}
            className="px-1.5 py-4 sm:py-6 rounded-r-full rounded-l-lg bg-white/10 text-white/50 hover:bg-white/20 transition-all"><ChevronUp size={14} /></button>
          <AnimatePresence>
            {srcMenu === 'cam' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSrcMenu(null)} />
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full mb-3 left-0 z-50 w-64 bg-[#0c0c0f] border border-white/10 rounded-2xl shadow-2xl p-2">
                  <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Camera</div>
                  {rtc.devices.cameras.length === 0 && <div className="px-2 py-2 text-[10px] text-white/30">No camera found</div>}
                  {rtc.devices.cameras.map((d, i) => {
                    const active = rtc.activeDevices.cameraId === d.deviceId;
                    return (
                      <button key={d.deviceId || i} onClick={() => { rtc.switchVideoDevice(d.deviceId); setSrcMenu(null); }}
                        className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${active ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                        <Video size={12} /> <span className="truncate">{d.label || `Camera ${i + 1}`}</span>
                      </button>
                    );
                  })}
                  <div className="h-px bg-white/10 my-1.5" />
                  <button onClick={() => { rtc.toggleScreenShare(); setSrcMenu(null); }}
                    className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${rtc.sharingScreen ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                    <Monitor size={12} /> {rtc.sharingScreen ? 'Stop sharing screen' : 'Share screen'}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <button onClick={rtc.toggleScreenShare}
          className={`hidden sm:flex p-4 sm:p-6 rounded-full transition-all hover:scale-110 ${rtc.sharingScreen ? 'bg-small-orange text-white shadow-[0_0_30px_rgba(255,140,0,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Monitor size={24} />
        </button>
        <button onClick={toggleRecord} title={rtc.isRecording ? 'Stop recording' : 'Record'}
          className={`hidden sm:flex p-4 sm:p-6 rounded-full transition-all hover:scale-110 ${rtc.isRecording ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Circle size={24} fill={rtc.isRecording ? 'currentColor' : 'none'} />
        </button>
        <button onClick={end}
          className="p-4 sm:p-6 bg-red-600 text-white rounded-full hover:scale-110 transition-all shadow-[0_0_50px_rgba(220,38,38,0.4)]">
          <PhoneOff size={24} />
        </button>
      </div>
      </div>

      {/* In-call chat side panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute inset-0 z-40 w-full sm:relative sm:inset-auto sm:z-auto sm:w-[360px] sm:max-w-[85vw] shrink-0 border-l border-white/10 bg-[#0a0a0d] flex flex-col">
            <div className="p-5 flex items-center gap-2 border-b border-white/10">
              <MessageSquare size={15} className="text-small-orange" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white flex-1">In-call chat</h3>
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
              <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                placeholder="Message…" className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-[13px] text-white outline-none focus:border-small-orange/60 placeholder:text-white/30" />
              <button onClick={sendChat} className="p-2.5 bg-small-orange text-white rounded-full hover:brightness-110 transition-all"><Send size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoChat;
