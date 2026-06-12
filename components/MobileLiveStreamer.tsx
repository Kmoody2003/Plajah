/**
 * MobileLiveStreamer — Phone-first live broadcast interface.
 *
 * Streamer view: portrait camera preview, bottom control dock, slide-up chat.
 * Viewer view: full-screen video, overlay chat, reaction animations.
 *
 * Uses the same WebRTC + Firestore signaling as LiveStreamModal/LiveStreamViewer.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, X, Camera, CameraOff, Mic, MicOff, FlipHorizontal2, MessageCircle,
  Users, Share2, Check, Heart, Send, ChevronDown, Eye, Zap, Sparkles,
  Clock, Settings, Volume2, VolumeX, RotateCcw, ArrowLeft,
} from 'lucide-react';
import { auth, db } from '../services/backendService';
import {
  doc, collection, addDoc, setDoc, updateDoc, increment, deleteDoc,
  query, orderBy, limit,
} from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';

// ─── ICE + helpers ────────────────────────────────────────────────────────────

const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

const uid4 = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg { id: string; user: string; text: string; ts: number }
interface Reaction { id: string; emoji: string; x: number }

export interface MobileLiveStreamerProps {
  /** 'streamer' = broadcaster; 'viewer' = watcher */
  mode: 'streamer' | 'viewer';
  /** Required for viewer mode */
  streamId?: string;
  /** Stream title set by broadcaster */
  title?: string;
  ownerName?: string;
  onClose: () => void;
}

// ─── Shared hook: live chat subscription ──────────────────────────────────────

function useLiveChat(streamId: string | null) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!streamId) return;
    const q = query(
      collection(db, 'streams', streamId, 'chat'),
      orderBy('ts', 'desc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)).reverse());
    });
  }, [streamId]);
  return msgs;
}

async function sendChat(streamId: string, text: string) {
  const user = auth.currentUser;
  if (!user || !text.trim()) return;
  await addDoc(collection(db, 'streams', streamId, 'chat'), {
    user: user.displayName || 'Viewer',
    text: text.trim(),
    ts: Date.now(),
    uid: user.uid,
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

const MobileLiveStreamer: React.FC<MobileLiveStreamerProps> = ({
  mode, streamId: initStreamId, title: initTitle, ownerName, onClose,
}) => {
  if (mode === 'viewer' && initStreamId) {
    return <MobileViewer streamId={initStreamId} title={initTitle} ownerName={ownerName} onClose={onClose} />;
  }
  return <MobileStreamer onClose={onClose} />;
};

export default MobileLiveStreamer;

// ─────────────────────────────────────────────────────────────────────────────
//  STREAMER SIDE
// ─────────────────────────────────────────────────────────────────────────────

function MobileStreamer({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'setup' | 'live'>('setup');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isLive, setIsLive] = useState(false);
  const [streamId, setStreamId] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [copied, setCopied] = useState(false);
  const [permError, setPermError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId || null);

  // Camera preview
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: micOn,
    }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; }
    }).catch(err => {
      if (!cancelled) setPermError(err.message || 'Camera access denied');
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facing]);

  // Toggle audio track
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = micOn; });
  }, [micOn]);

  // Toggle video track
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = camOn; });
  }, [camOn]);

  // Live timer
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isLive, startTime]);

  // Viewer count
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      setViewerCount(snap.data()?.viewerCount ?? 0);
    });
  }, [streamId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const goLive = async () => {
    if (!title.trim()) { setTitle('Live Stream'); }
    const id = uid4();
    setStreamId(id);
    await setDoc(doc(db, 'streams', id), {
      title: title.trim() || 'Live Stream',
      ownerName: auth.currentUser?.displayName || 'Creator',
      ownerUid: auth.currentUser?.uid,
      viewerCount: 0,
      startedAt: Date.now(),
      isLive: true,
    });
    setStartTime(Date.now());
    setIsLive(true);
    setStep('live');
  };

  const endStream = async () => {
    if (streamId) {
      await updateDoc(doc(db, 'streams', streamId), { isLive: false, endedAt: Date.now() }).catch(() => {});
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    onClose();
  };

  const addReaction = (emoji: string) => {
    const r: Reaction = { id: uid4(), emoji, x: 20 + Math.random() * 60 };
    setReactions(prev => [...prev, r]);
    setTimeout(() => setReactions(prev => prev.filter(x => x.id !== r.id)), 2500);
  };

  const copyLink = () => {
    const url = `${window.location.origin}?stream=${streamId}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const shareStream = async () => {
    const url = `${window.location.origin}?stream=${streamId}`;
    if (navigator.share) {
      await navigator.share({ title: title || 'Live Stream', url }).catch(() => {});
    } else {
      copyLink();
    }
  };

  if (permError) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 p-8 z-[200]">
        <CameraOff size={40} className="text-red-400" />
        <p className="text-white font-bold text-center">Camera access needed</p>
        <p className="text-white/40 text-sm text-center">{permError}</p>
        <button onClick={onClose} className="mt-4 px-6 py-3 bg-white/10 rounded-2xl text-white font-bold">Back</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col select-none overflow-hidden">
      {/* Camera preview — fills screen portrait */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Dim overlay when cam off */}
      {!camOn && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <CameraOff size={48} className="text-white/30" />
        </div>
      )}

      {/* Setup overlay — shown before going live */}
      {step === 'setup' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent"
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-safe">
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
              <X size={18} className="text-white" />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                <FlipHorizontal2 size={18} className="text-white" />
              </button>
              <button onClick={() => setMicOn(m => !m)}
                className={`w-10 h-10 rounded-full backdrop-blur flex items-center justify-center ${micOn ? 'bg-black/50' : 'bg-red-500/80'}`}>
                {micOn ? <Mic size={18} className="text-white" /> : <MicOff size={18} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Setup form */}
          <div className="p-6 pb-safe space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Stream title</p>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What are you streaming today?"
                maxLength={80}
                className="w-full bg-black/50 backdrop-blur border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-400/60"
              />
            </div>
            <button
              onClick={goLive}
              className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all font-black text-white text-base tracking-wide flex items-center justify-center gap-2 shadow-[0_8px_32px_rgba(239,68,68,0.5)]"
            >
              <Radio size={18} className="animate-pulse" /> Go Live
            </button>
          </div>
        </motion.div>
      )}

      {/* Live UI */}
      {step === 'live' && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-3 pt-safe z-10">
            <div className="flex items-center gap-2">
              {/* LIVE badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 rounded-full shadow-[0_4px_16px_rgba(239,68,68,0.6)]">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
              </div>
              {/* Timer */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
                <Clock size={11} className="text-white/60" />
                <span className="text-[11px] font-bold text-white/80 font-mono">{fmt(elapsed)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Viewers */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
                <Eye size={11} className="text-white/60" />
                <span className="text-[11px] font-bold text-white/80">{viewerCount}</span>
              </div>
              {/* Share */}
              <button onClick={shareStream}
                className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                {copied ? <Check size={16} className="text-green-400" /> : <Share2 size={16} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Title overlay */}
          <div className="absolute top-16 left-4 right-4">
            {title && (
              <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-1.5 inline-flex max-w-full">
                <p className="text-xs font-bold text-white truncate">{title}</p>
              </div>
            )}
          </div>

          {/* Floating reactions */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <AnimatePresence>
              {reactions.map(r => (
                <motion.div
                  key={r.id}
                  initial={{ y: 0, opacity: 1, scale: 1 }}
                  animate={{ y: -300, opacity: 0, scale: 1.4 }}
                  exit={{}}
                  transition={{ duration: 2.4, ease: 'easeOut' }}
                  className="absolute bottom-32 text-3xl"
                  style={{ left: `${r.x}%` }}
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Chat overlay (slide up) */}
          <AnimatePresence>
            {showChat && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 400 }}
                className="absolute inset-x-0 bottom-0 bg-black/85 backdrop-blur-xl rounded-t-3xl flex flex-col"
                style={{ maxHeight: '60vh' }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-black text-white">Live Chat</p>
                  <button onClick={() => setShowChat(false)} className="text-white/40 hover:text-white">
                    <ChevronDown size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 min-h-0">
                  {chatMsgs.map(m => (
                    <div key={m.id} className="flex items-start gap-2">
                      <span className="text-[10px] font-black text-orange-400 shrink-0 mt-0.5">{m.user.split(' ')[0]}</span>
                      <span className="text-[11px] text-white/80 leading-relaxed">{m.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 pb-safe">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim()) { sendChat(streamId, chatInput); setChatInput(''); } }}
                    placeholder="Say something…"
                    className="flex-1 bg-white/10 border border-white/15 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
                  />
                  <button
                    onClick={() => { if (chatInput.trim()) { sendChat(streamId, chatInput); setChatInput(''); } }}
                    className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center"
                  >
                    <Send size={14} className="text-white" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom dock */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-safe pt-4 bg-gradient-to-t from-black/70 to-transparent">
            {/* Reactions row */}
            <div className="flex items-center gap-3">
              {['❤️', '🔥', '😂', '👏', '💯', '🎉'].map(e => (
                <button key={e} onClick={() => addReaction(e)}
                  className="text-2xl active:scale-125 transition-transform">
                  {e}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between w-full">
              {/* Chat toggle */}
              <button onClick={() => setShowChat(s => !s)}
                className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/15 flex items-center justify-center">
                  <MessageCircle size={22} className={showChat ? 'text-orange-400' : 'text-white'} />
                </div>
                <span className="text-[9px] text-white/50">Chat</span>
              </button>

              {/* Flip camera */}
              <button onClick={() => { setFacing(f => f === 'user' ? 'environment' : 'user'); }}
                className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/15 flex items-center justify-center">
                  <FlipHorizontal2 size={22} className="text-white" />
                </div>
                <span className="text-[9px] text-white/50">Flip</span>
              </button>

              {/* End stream — big center button */}
              <button onClick={endStream}
                className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-[0_8px_24px_rgba(239,68,68,0.6)] active:scale-95 transition-transform">
                  <Radio size={26} className="text-white" />
                </div>
                <span className="text-[9px] text-red-400 font-bold">End</span>
              </button>

              {/* Mic toggle */}
              <button onClick={() => setMicOn(m => !m)}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${micOn ? 'bg-black/60 border-white/15' : 'bg-red-500 border-red-500'}`}>
                  {micOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-white" />}
                </div>
                <span className="text-[9px] text-white/50">{micOn ? 'Mute' : 'Unmuted'}</span>
              </button>

              {/* Camera toggle */}
              <button onClick={() => setCamOn(c => !c)}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${camOn ? 'bg-black/60 border-white/15' : 'bg-red-500 border-red-500'}`}>
                  {camOn ? <Camera size={22} className="text-white" /> : <CameraOff size={22} className="text-white" />}
                </div>
                <span className="text-[9px] text-white/50">{camOn ? 'Cam' : 'Hidden'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  VIEWER SIDE — mobile-first full-screen viewer
// ─────────────────────────────────────────────────────────────────────────────

function MobileViewer({ streamId, title, ownerName, onClose }: {
  streamId: string; title?: string; ownerName?: string; onClose: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  useEffect(() => {
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      const data = snap.data();
      if (data) {
        setViewerCount(data.viewerCount ?? 0);
        setLikeCount(data.likeCount ?? 0);
      }
    });
  }, [streamId]);

  // Join stream via WebRTC signaling (simplified — full signaling in LiveStreamViewer)
  useEffect(() => {
    const viewerId = uid4();
    let cancelled = false;

    const join = async () => {
      setConnecting(true);
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;

      pc.ontrack = e => {
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          setConnected(true);
          setConnecting(false);
        }
      };

      pc.onicecandidate = async e => {
        if (e.candidate && !cancelled) {
          await addDoc(collection(db, 'streams', streamId, 'viewerCandidates', viewerId, 'candidates'), e.candidate.toJSON()).catch(() => {});
        }
      };

      // Increment viewer count
      await updateDoc(doc(db, 'streams', streamId), { viewerCount: increment(1) }).catch(() => {});

      // Listen for offer
      const unsubOffer = onSnapshot(doc(db, 'streams', streamId, 'viewers', viewerId), async snap => {
        const data = snap.data();
        if (data?.offer && !pc.remoteDescription && !cancelled) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setDoc(doc(db, 'streams', streamId, 'viewers', viewerId), { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });
        }
      });

      // Register as viewer
      await setDoc(doc(db, 'streams', streamId, 'viewers', viewerId), { joinedAt: Date.now() });

      setTimeout(() => { if (!connected && !cancelled) setConnecting(false); }, 12000);

      return () => {
        cancelled = true;
        unsubOffer();
        pc.close();
        updateDoc(doc(db, 'streams', streamId), { viewerCount: increment(-1) }).catch(() => {});
        deleteDoc(doc(db, 'streams', streamId, 'viewers', viewerId)).catch(() => {});
      };
    };

    const cleanup = join();
    return () => { cleanup.then(fn => fn()); };
  }, [streamId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const addReaction = (emoji: string) => {
    const r: Reaction = { id: uid4(), emoji, x: 10 + Math.random() * 70 };
    setReactions(prev => [...prev, r]);
    sendChat(streamId, emoji).catch(() => {});
    setTimeout(() => setReactions(prev => prev.filter(x => x.id !== r.id)), 2500);
  };

  const toggleLike = async () => {
    setLiked(l => !l);
    await updateDoc(doc(db, 'streams', streamId), { likeCount: increment(liked ? -1 : 1) }).catch(() => {});
    if (!liked) addReaction('❤️');
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden">
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Connecting overlay */}
      <AnimatePresence>
        {connecting && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center">
              <Radio size={28} className="text-red-400 animate-pulse" />
            </div>
            <p className="text-white font-bold">Connecting to stream…</p>
            <p className="text-white/40 text-sm">{ownerName || 'Creator'} is live</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 pt-safe z-10">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 rounded-full shadow-[0_4px_16px_rgba(239,68,68,0.5)]">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
            <Eye size={11} className="text-white/60" />
            <span className="text-[11px] font-bold text-white/80">{viewerCount}</span>
          </div>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
          {muted ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} className="text-white" />}
        </button>
      </div>

      {/* Creator info */}
      <div className="absolute top-16 left-4">
        <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-1.5">
          <p className="text-xs font-black text-white">{ownerName || 'Live Stream'}</p>
          {title && <p className="text-[9px] text-white/50">{title}</p>}
        </div>
      </div>

      {/* Floating reactions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {reactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ y: 0, opacity: 1, scale: 0.8 }}
              animate={{ y: -280, opacity: 0, scale: 1.5 }}
              exit={{}}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              className="absolute bottom-32 text-3xl"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Slide-up chat */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            className="absolute inset-x-0 bottom-0 bg-black/85 backdrop-blur-xl rounded-t-3xl flex flex-col"
            style={{ maxHeight: '55vh' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-orange-400" />
                <p className="text-sm font-black text-white">Live Chat</p>
              </div>
              <button onClick={() => setShowChat(false)} className="text-white/40"><ChevronDown size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 min-h-0">
              {chatMsgs.map(m => (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="text-[10px] font-black text-orange-400 shrink-0 mt-0.5">{m.user.split(' ')[0]}</span>
                  <span className="text-[11px] text-white/80 leading-relaxed">{m.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 pb-safe">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { sendChat(streamId, chatInput); setChatInput(''); } }}
                placeholder="Say something…"
                className="flex-1 bg-white/10 border border-white/15 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <button onClick={() => { sendChat(streamId, chatInput); setChatInput(''); }}
                className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center">
                <Send size={14} className="text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 px-5 pb-safe pt-4">
        {/* Reactions */}
        {!showChat && (
          <div className="flex items-center gap-3">
            {['❤️', '🔥', '😂', '👏', '💯'].map(e => (
              <button key={e} onClick={() => addReaction(e)} className="text-2xl active:scale-125 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
        {/* Action bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowChat(s => !s)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full border font-bold text-sm transition-all ${showChat ? 'bg-orange-500 border-orange-500 text-white' : 'bg-black/60 backdrop-blur border-white/20 text-white'}`}
          >
            <MessageCircle size={16} />
            Chat
            {chatMsgs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{chatMsgs.length}</span>
            )}
          </button>
          <button onClick={toggleLike}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${liked ? 'bg-red-500 border-red-500' : 'bg-black/60 backdrop-blur border-white/20'}`}>
            <Heart size={20} className={`${liked ? 'text-white fill-white' : 'text-white'}`} />
          </button>
          <button
            className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center"
            onClick={() => navigator.share?.({ title: title, url: window.location.href }).catch(() => {})}
          >
            <Share2 size={20} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile-optimized entry button for LiveHubView ────────────────────────────

export function MobileGoLiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 active:scale-95 transition-all rounded-2xl font-black text-white text-sm shadow-[0_8px_24px_rgba(239,68,68,0.4)]"
    >
      <Radio size={16} className="animate-pulse" />
      Go Live
      <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[9px]">Mobile</span>
    </button>
  );
}
