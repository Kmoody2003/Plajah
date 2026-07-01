import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff,
  Settings, UserPlus, LayoutGrid, Monitor, Wifi, WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Circle } from 'lucide-react';
import { ChatRoom } from '../types';
import { auth } from '../services/backendService';
import { useRtcSession } from '../hooks/useRtcSession';
import { saveSessionRecording } from '../services/liveStreamService';

interface VideoChatProps {
  room: ChatRoom;
  onClose: () => void;
  user: any;
}

/** Attaches a MediaStream to a <video>. One tile per participant. */
const StreamTile: React.FC<{ stream: MediaStream; label: string; muted?: boolean; mirror?: boolean; connecting?: boolean }> =
({ stream, label, muted, mirror, connecting }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
      <video ref={ref} autoPlay playsInline muted={muted}
        className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`} />
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
        {!connecting && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>
    </motion.div>
  );
};

/**
 * VideoChat — messaging video/voice call. Now runs on the unified rtcCore
 * backbone (mesh topology), so the SAME component handles 1:1 AND group calls;
 * every extra participant is just another tile in the grid.
 */
const REACTIONS = ['❤️', '😂', '👍', '🔥', '👏', '🎉'];

const VideoChat: React.FC<VideoChatProps> = ({ room, onClose, user }) => {
  const selfId = auth.currentUser?.uid;
  const [floats, setFloats] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const addFloat = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFloats(prev => [...prev, { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 2600);
  }, []);

  const rtc = useRtcSession({
    sessionId: `call_${room.id}`,
    topology: 'mesh',
    role: 'participant',
    media: { audio: true, video: true },
    displayName: auth.currentUser?.displayName || 'You',
  }, {
    // Data-channel reactions — instant, peer-to-peer (no Firestore round-trip).
    onData: (_peer, msg) => { if (msg.type === 'reaction' && msg.payload?.emoji) addFloat(msg.payload.emoji); },
  });

  const react = (emoji: string) => { addFloat(emoji); rtc.sendData('reaction', { emoji }); };

  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (localRef.current) localRef.current.srcObject = rtc.localStream; }, [rtc.localStream]);

  const remotes = [...rtc.remoteStreams.entries()];
  const total = remotes.length + 1;
  const anyConnecting = [...rtc.peerStates.values()].some(s => s === 'connecting' || s === 'new');
  const allConnected = remotes.length > 0 && [...rtc.peerStates.values()].every(s => s === 'connected');
  const cols = total <= 1 ? 'grid-cols-1' : total <= 2 ? 'grid-cols-2' : total <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  const nameFor = (peerId: string) => rtc.participants.find(p => p.id === peerId)?.name || 'Participant';

  const toggleRecord = async () => {
    if (rtc.isRecording) {
      const blob = await rtc.stopRecording();
      if (blob) saveSessionRecording({ blob, title: `${room.name || 'Call'} — recording` });
    } else {
      rtc.startRecording();
    }
  };

  const end = () => { rtc.leave(); onClose(); };

  return (
    <div className="fixed inset-0 z-[500] bg-[#050505] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/20 rounded-2xl"><Video className="text-red-500" size={24} /></div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tightest leading-none">{room.name || 'Call'}</h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Live Video Session • {total} in call</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"><UserPlus size={20} /></button>
          <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"><LayoutGrid size={20} /></button>
          <button
            onClick={() => { rtc.refreshDevices(); setShowSettings(s => !s); }}
            title="Camera & microphone settings"
            className={`p-4 rounded-2xl transition-all ${showSettings ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
            <Settings size={20} />
          </button>
        </div>
      </div>

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
              </div>

              <p className="text-[9px] font-bold text-white/30 leading-relaxed">Changes apply instantly — the call keeps running while you swap devices.</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Connection banner */}
      {(anyConnecting || allConnected) && (
        <div className={`shrink-0 flex items-center justify-center gap-2 py-1.5 text-[9px] font-black uppercase tracking-widest ${
          allConnected ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-white/40'
        }`}>
          {allConnected ? <Wifi size={11} /> : <div className="w-3 h-3 border border-current rounded-full animate-spin border-t-transparent" />}
          {allConnected ? 'Connected' : 'Connecting…'}
        </div>
      )}
      {rtc.error && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-red-500/15 text-red-400 text-[9px] font-black uppercase tracking-widest">
          <WifiOff size={11} /> {rtc.error}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
        <div className={`grid gap-6 h-full ${cols}`}>
          {/* Local tile */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {!rtc.videoEnabled ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-white/10 border border-white/10 flex items-center justify-center"><VideoOff size={36} className="text-white/20" /></div>
              </div>
            ) : (
              <video ref={localRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            )}
            <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest">
              You {!rtc.audioEnabled && <MicOff size={9} className="inline ml-1 text-red-400" />}
            </div>
          </motion.div>

          {/* Remote tiles — one per peer (1:1 or group, same path) */}
          {remotes.map(([peerId, stream]) => (
            <StreamTile key={peerId} stream={stream} label={nameFor(peerId)} />
          ))}

          {/* Waiting state */}
          {remotes.length === 0 && (
            <div className="aspect-video bg-white/5 border border-white/5 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Waiting for others to join…</p>
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
      <div className="p-8 pt-2 bg-gradient-to-t from-black to-transparent flex items-center justify-center gap-6">
        <button onClick={rtc.toggleAudio}
          className={`p-6 rounded-full transition-all hover:scale-110 ${!rtc.audioEnabled ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          {!rtc.audioEnabled ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button onClick={rtc.toggleVideo}
          className={`p-6 rounded-full transition-all hover:scale-110 ${!rtc.videoEnabled ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          {!rtc.videoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
        </button>
        <button onClick={rtc.toggleScreenShare}
          className={`p-6 rounded-full transition-all hover:scale-110 ${rtc.sharingScreen ? 'bg-small-orange text-white shadow-[0_0_30px_rgba(255,140,0,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Monitor size={24} />
        </button>
        <button onClick={toggleRecord} title={rtc.isRecording ? 'Stop recording' : 'Record'}
          className={`p-6 rounded-full transition-all hover:scale-110 ${rtc.isRecording ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Circle size={24} fill={rtc.isRecording ? 'currentColor' : 'none'} />
        </button>
        <button onClick={end}
          className="p-6 bg-red-600 text-white rounded-full hover:scale-110 transition-all shadow-[0_0_50px_rgba(220,38,38,0.4)]">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VideoChat;
