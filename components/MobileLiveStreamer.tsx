/**
 * MobileLiveStreamer — Phone-first live broadcast interface.
 *
 * Streamer view: portrait camera preview, bottom control dock, slide-up chat.
 * Viewer view: full-screen video, overlay chat, reaction animations.
 *
 * Stream lifecycle (the platform-wide operational logic for live):
 *   GO LIVE  → stream doc + auto-post on the author's timeline + follower
 *              notification + FIRST_LIVE_STREAM achievement + recording starts.
 *   LIVE     → WebRTC broadcast to viewers (offer/answer per viewer — this is
 *              what makes "is actually live" verifiable), live viewer count +
 *              total views, camera flip via replaceTrack (recording unaffected
 *              because it captures a canvas mix, not the raw camera track).
 *   END      → prompt: SAVE (recording → Reello "Past Live Streams" + the
 *              timeline post becomes the replay) or DELETE (post removed).
 *
 * Layout: everything is contained — fixed inset-0 + real pt-safe/pb-safe
 * utilities + dvh-based sheets so no control ever renders off-screen.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, X, Camera, CameraOff, Mic, MicOff, FlipHorizontal2, MessageCircle,
  Users, Share2, Check, Heart, Send, ChevronDown, Eye, Zap, Sparkles,
  Clock, Settings, Volume2, VolumeX, RotateCcw, ArrowLeft, Save, Trash2,
} from 'lucide-react';
import {
  auth, db, createPost, updatePost, deletePost, notifyFollowers, uploadVideo,
} from '../services/backendService';
import { unlockAchievementByTrigger } from '../services/achievementService';
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
  const [step, setStep] = useState<'setup' | 'live' | 'ended'>('setup');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isLive, setIsLive] = useState(false);
  const [streamId, setStreamId] = useState('');
  const [postId, setPostId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [copied, setCopied] = useState(false);
  const [permError, setPermError] = useState('');
  const [goLiveError, setGoLiveError] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerUnsubsRef = useRef<Array<() => void>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId || null);

  // ── Recording pipeline (canvas mix — survives camera flips) ────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const facingRef = useRef(facing);
  useEffect(() => { facingRef.current = facing; }, [facing]);

  // Camera preview — and while live, hot-swap the new tracks into every
  // viewer's peer connection (replaceTrack) so flipping never drops the feed.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: true,
    }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      const prev = streamRef.current;
      streamRef.current = stream;
      stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
      stream.getVideoTracks().forEach(t => { t.enabled = camOn; });
      if (videoRef.current) { videoRef.current.srcObject = stream; }
      // Live camera switch: replace outgoing tracks on every viewer connection.
      const newVideo = stream.getVideoTracks()[0];
      const newAudio = stream.getAudioTracks()[0];
      peerConnsRef.current.forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'video' && newVideo) sender.replaceTrack(newVideo).catch(() => {});
          if (sender.track?.kind === 'audio' && newAudio) sender.replaceTrack(newAudio).catch(() => {});
        });
      });
      // Re-route mic into the recording mix.
      if (audioCtxRef.current && audioDestRef.current) {
        try { audioSrcRef.current?.disconnect(); } catch {}
        try {
          audioSrcRef.current = audioCtxRef.current.createMediaStreamSource(stream);
          audioSrcRef.current.connect(audioDestRef.current);
        } catch {}
      }
      prev?.getTracks().forEach(t => t.stop());
    }).catch(err => {
      if (!cancelled) setPermError(err.message || 'Camera access denied');
    });
    return () => { cancelled = true; };
  }, [facing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release camera on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    peerConnsRef.current.forEach(pc => pc.close());
    peerUnsubsRef.current.forEach(u => u());
    cancelAnimationFrame(rafRef.current);
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch {}
    audioCtxRef.current?.close().catch(() => {});
  }, []);

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

  // Viewer count + peak + total views
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      const data = snap.data();
      const count = data?.viewerCount ?? 0;
      setViewerCount(count);
      setTotalViews(data?.totalViews ?? 0);
      setPeakViewers(prev => {
        const peak = Math.max(prev, count);
        if (peak > (data?.peakViewers ?? 0)) {
          updateDoc(doc(db, 'streams', streamId), { peakViewers: peak }).catch(() => {});
        }
        return peak;
      });
    });
  }, [streamId]);

  // ── Broadcaster signaling: answer every viewer that joins ───────────────────
  // This is the piece that makes the stream *actually* watchable (and therefore
  // verifiable as live): each viewer doc gets an offer, we consume answers + ICE.
  useEffect(() => {
    if (!isLive || !streamId) return;
    const unsubViewers = onSnapshot(collection(db, 'streams', streamId, 'viewers'), snap => {
      snap.docChanges().forEach(async change => {
        const viewerId = change.doc.id;
        const data = change.doc.data();

        if (change.type === 'removed') {
          peerConnsRef.current.get(viewerId)?.close();
          peerConnsRef.current.delete(viewerId);
          return;
        }

        // New viewer (no offer sent yet) → build a connection and offer.
        if (!peerConnsRef.current.has(viewerId) && !data.offer) {
          const pc = new RTCPeerConnection(ICE);
          peerConnsRef.current.set(viewerId, pc);
          const ms = streamRef.current;
          ms?.getTracks().forEach(t => pc.addTrack(t, ms));

          pc.onicecandidate = e => {
            if (e.candidate) {
              addDoc(collection(db, 'streams', streamId, 'broadcasterCandidates', viewerId, 'candidates'), e.candidate.toJSON()).catch(() => {});
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(doc(db, 'streams', streamId, 'viewers', viewerId),
            { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });

          // Viewer's ICE candidates
          const unsubCand = onSnapshot(
            collection(db, 'streams', streamId, 'viewerCandidates', viewerId, 'candidates'),
            cs => cs.docChanges().forEach(c => {
              if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit)).catch(() => {});
            }),
          );
          peerUnsubsRef.current.push(unsubCand);
        }

        // Viewer answered → complete the handshake.
        const pc = peerConnsRef.current.get(viewerId);
        if (pc && data.answer && !pc.currentRemoteDescription) {
          pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
        }
      });
    });
    peerUnsubsRef.current.push(unsubViewers);
    return () => unsubViewers();
  }, [isLive, streamId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Recording: draw the preview into a canvas and record THAT, so camera
  //    flips / track swaps never invalidate the MediaRecorder stream. ─────────
  const startRecording = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 1280; // resized to the camera's real aspect on first frame
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d');
      let sized = false;
      const draw = () => {
        const v = videoRef.current;
        if (ctx && v && v.videoWidth > 0) {
          if (!sized) {
            // Record at the camera's native aspect (capped at 1280) — no zoom-crop.
            const cap = 1280 / Math.max(v.videoWidth, v.videoHeight);
            const k = Math.min(1, cap);
            canvas.width = Math.round(v.videoWidth * k);
            canvas.height = Math.round(v.videoHeight * k);
            sized = true;
          }
          ctx.save();
          if (facingRef.current === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      const canvasStream = canvas.captureStream(30);
      // Mix mic audio through an AudioContext so flips just re-route the source.
      const actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();
      audioCtxRef.current = actx; audioDestRef.current = dest;
      if (streamRef.current) {
        try {
          audioSrcRef.current = actx.createMediaStreamSource(streamRef.current);
          audioSrcRef.current.connect(dest);
        } catch {}
      }
      const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
      const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(2000);
      recorderRef.current = rec;
    } catch (e) {
      console.warn('[Live] recording unavailable', e);
    }
  }, []);

  const goLive = async () => {
    const user = auth.currentUser;
    if (!user) { setGoLiveError('Sign in to go live.'); return; }
    setGoLiveError('');
    const finalTitle = title.trim() || 'Live Stream';
    if (!title.trim()) setTitle(finalTitle);
    const id = uid4();
    setStreamId(id);
    try {
    await setDoc(doc(db, 'streams', id), {
      title: finalTitle,
      ownerName: user?.displayName || 'Creator',
      ownerUid: user?.uid,
      viewerCount: 0,
      totalViews: 0,
      peakViewers: 0,
      startedAt: Date.now(),
      isLive: true,
    });
    } catch (e: any) {
      // Surface the real failure (e.g. permissions) instead of doing nothing.
      setGoLiveError(e?.message || 'Could not start the stream. Try again.');
      setStreamId('');
      return;
    }
    setStartTime(Date.now());
    setIsLive(true);
    setStep('live');
    startRecording();

    // ── Lifecycle side effects (all fire-and-forget; the stream never blocks) ──
    if (user) {
      // 1. Auto-post on the author's timeline
      createPost({
        text: `🔴 Live now: ${finalTitle}`,
        isLiveNow: true,
        liveStreamId: id,
      }).then(pid => { if (pid) setPostId(pid); }).catch(() => {});
      // 2. Dedicated "is live" notification to followers
      notifyFollowers(user.uid, 'CONTENT', '🔴 Live Now',
        `${user.displayName || 'A creator you follow'} is live: ${finalTitle}`,
        'LIVE_HUB', id).catch(() => {});
      // 3. First-stream achievement
      unlockAchievementByTrigger(user.uid, 'FIRST_LIVE_STREAM').catch(() => {});
    }
  };

  // ── End flow: stop everything, then prompt save vs delete ──────────────────
  const endStream = async () => {
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch {}
    cancelAnimationFrame(rafRef.current);
    if (streamId) {
      await updateDoc(doc(db, 'streams', streamId), { isLive: false, endedAt: Date.now() }).catch(() => {});
    }
    peerConnsRef.current.forEach(pc => pc.close());
    peerConnsRef.current.clear();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsLive(false);
    setStep('ended');
  };

  const saveRecording = async () => {
    setSaving('saving');
    try {
      // Give the recorder a beat to flush its final chunk.
      await new Promise(r => setTimeout(r, 600));
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      if (blob.size < 1000) throw new Error('No recording captured');
      const finalTitle = title.trim() || 'Live Stream';
      const file = new File([blob], `live-${Date.now()}.webm`, { type: 'video/webm' });
      const video = await uploadVideo({
        file,
        title: `${finalTitle} (Live Replay)`,
        description: `Recorded live on ${new Date().toLocaleDateString()} · peak ${peakViewers} viewers · ${totalViews} views`,
        isLiveRecording: true,
        isPrivate: false,
        duration: elapsed,
        genre: 'Live',
      });
      // The timeline post becomes the replay.
      if (postId) {
        await updatePost(postId, {
          text: `${finalTitle} — live stream replay`,
          isLiveNow: false,
          media: [{ type: 'VIDEO', url: video.url || '', id: video.id, title: finalTitle }],
        }).catch(() => {});
      }
      if (streamId) await updateDoc(doc(db, 'streams', streamId), { recordingVideoId: video.id }).catch(() => {});
      setSaving('done');
      setTimeout(onClose, 1200);
    } catch (e) {
      console.warn('[Live] save failed', e);
      setSaving('error');
    }
  };

  const discardRecording = async () => {
    // Stream not saved → the auto-post comes down too (no dead "live" posts).
    if (postId) await deletePost(postId).catch(() => {});
    chunksRef.current = [];
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
    <div className="fixed inset-0 bg-black z-[200] flex flex-col select-none overflow-hidden" style={{ height: '100dvh' }}>
      {/* Camera preview — fills screen portrait */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-contain bg-black"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Dim overlay when cam off */}
      {!camOn && step !== 'ended' && (
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
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe">
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
          <div className="px-5 pb-safe space-y-4">
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
            <p className="text-[9px] text-white/35 leading-relaxed">
              Going live posts to your timeline and notifies your followers. When you end,
              you choose to save the replay to Reello or delete it.
            </p>
            {goLiveError && (
              <p className="text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">{goLiveError}</p>
            )}
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
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-safe z-10">
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
              {/* Viewers (live) */}
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
          <div className="absolute left-4 right-4" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
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
                style={{ maxHeight: '60dvh' }}
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
            <div className="flex items-center justify-between w-full max-w-md mx-auto">
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

      {/* ── Ended: save / delete prompt ───────────────────────────────────────── */}
      {step === 'ended' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/92 backdrop-blur-md flex flex-col items-center justify-center px-6 pt-safe pb-safe"
        >
          <div className="w-full max-w-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Radio size={24} className="text-red-400" />
              </div>
              <p className="text-lg font-black text-white">Stream ended</p>
              <p className="text-xs text-white/40">{title || 'Live Stream'}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Duration', value: fmt(elapsed) },
                { label: 'Peak viewers', value: String(peakViewers) },
                { label: 'Total views', value: String(totalViews) },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.05] border border-white/10 rounded-2xl px-2 py-3 text-center">
                  <p className="text-sm font-black text-white">{s.value}</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/35 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {saving === 'saving' ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-xs text-white/50">Saving your replay to Reello…</p>
              </div>
            ) : saving === 'done' ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <Check size={28} className="text-green-400" />
                <p className="text-xs text-white/60">Saved — it's in Reello under Past Live Streams.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {saving === 'error' && (
                  <p className="text-[10px] text-red-400 text-center">Couldn't save the recording — you can retry or delete.</p>
                )}
                <button onClick={saveRecording}
                  className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-95 transition-all font-black text-white text-sm flex items-center justify-center gap-2">
                  <Save size={16} /> Save replay to Reello
                </button>
                <p className="text-[9px] text-white/30 text-center leading-relaxed">
                  Saving keeps the recording on your Reello page and turns your live post into the replay.
                </p>
                <button onClick={discardRecording}
                  className="w-full py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-red-500/15 hover:border-red-500/30 active:scale-95 transition-all font-bold text-white/60 hover:text-red-300 text-sm flex items-center justify-center gap-2">
                  <Trash2 size={15} /> Delete stream
                </button>
              </div>
            )}
          </div>
        </motion.div>
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
  const [streamLive, setStreamLive] = useState(true);
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
        setStreamLive(data.isLive !== false);
      }
    });
  }, [streamId]);

  // Join stream via WebRTC signaling — the broadcaster answers with an offer.
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

      // Live + lifetime view counters
      await updateDoc(doc(db, 'streams', streamId), { viewerCount: increment(1), totalViews: increment(1) }).catch(() => {});

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

      // Broadcaster's ICE candidates
      const unsubBCand = onSnapshot(
        collection(db, 'streams', streamId, 'broadcasterCandidates', viewerId, 'candidates'),
        cs => cs.docChanges().forEach(c => {
          if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit)).catch(() => {});
        }),
      );

      // Register as viewer
      await setDoc(doc(db, 'streams', streamId, 'viewers', viewerId), { joinedAt: Date.now() });

      setTimeout(() => { if (!connected && !cancelled) setConnecting(false); }, 12000);

      return () => {
        cancelled = true;
        unsubOffer();
        unsubBCand();
        pc.close();
        updateDoc(doc(db, 'streams', streamId), { viewerCount: increment(-1) }).catch(() => {});
        deleteDoc(doc(db, 'streams', streamId, 'viewers', viewerId)).catch(() => {});
      };
    };

    const cleanup = join();
    return () => { cleanup.then(fn => fn()); };
  }, [streamId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Connecting / ended overlay */}
      <AnimatePresence>
        {(connecting || !streamLive) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 px-8"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center">
              <Radio size={28} className={`text-red-400 ${streamLive ? 'animate-pulse' : ''}`} />
            </div>
            <p className="text-white font-bold text-center">
              {streamLive ? 'Connecting to stream…' : 'This stream has ended'}
            </p>
            <p className="text-white/40 text-sm text-center">
              {streamLive ? `${ownerName || 'Creator'} is live` : 'Check their Reello page for the replay'}
            </p>
            {!streamLive && (
              <button onClick={onClose} className="mt-2 px-6 py-3 bg-white/10 rounded-2xl text-white font-bold text-sm">Close</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-safe z-10">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          {/* Verified-live badge: red only while the broadcaster is actually live */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${streamLive ? 'bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.5)]' : 'bg-white/15'}`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-white ${streamLive ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{streamLive ? 'Live' : 'Ended'}</span>
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
      <div className="absolute left-4" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
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
            style={{ maxHeight: '55dvh' }}
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
