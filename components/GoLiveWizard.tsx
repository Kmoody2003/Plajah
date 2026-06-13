import { createPortal } from 'react-dom';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Radio, Camera, Monitor, Wifi,
  Mic, MicOff, Video, VideoOff, Check, AlertCircle, Trash2,
  Clock, Type, MessageSquare, Ban, Layers, Copy, Tv2, RefreshCw, Settings
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { publishLiveFeed, deleteLiveFeed, createMuxLiveStream, endMuxLiveStream, getMuxLiveStreamStatus, saveStreamArchive } from '../services/backendService';
import { db } from '../services/backendService';
import { collection, query, orderBy, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import PlajahLivePlayer from './PlajahLivePlayer';
import LiveBroadcastControlPanel from './LiveBroadcastControlPanel';
import SportsProducerPanel from './SportsProducerPanel';
import MobileLiveStreamer from './MobileLiveStreamer';

interface GoLiveWizardProps {
  onClose: () => void;
  currentUser: FirebaseUser | null;
}

type StreamType = 'QUICK' | 'STUDIO' | 'EXTERNAL' | 'MUX' | 'SPORTS';
type WizardStep = 'TYPE' | 'DETAILS' | 'SIGNAL' | 'GRAPHICS' | 'GOLIVE';

interface MuxStreamInfo {
  streamId: string;
  streamKey: string;
  rtmpUrl: string;
  srtUrl: string;
  playbackId: string | null;
}

interface LowerThird {
  id: string;
  title: string;
  subtitle: string;
  visible: boolean;
}

interface ChatMessage {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  timestamp: number;
}

function AudioMeter({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!stream) return;
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d')!;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      const barW = canvas.width / data.length;
      data.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        const pct = v / 255;
        ctx2d.fillStyle = pct > 0.8 ? '#ef4444' : pct > 0.5 ? '#f59e0b' : '#22c55e';
        ctx2d.fillRect(i * barW, canvas.height - h, barW - 1, h);
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); audioCtx.close(); };
  }, [stream]);

  return <canvas ref={canvasRef} width={200} height={48} className="w-full rounded-lg bg-black/60" />;
}

function LiveTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
  return <span className="font-mono text-sm font-black text-white tabular-nums">{h}:{m}:{s}</span>;
}

// A crash anywhere in the broadcast UI must stay contained to this overlay —
// never white-screen the platform. Shows the real error + a close path.
class BroadcastErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: any) { return { error: String(e?.message || e).slice(0, 300) }; }
  componentDidCatch(e: any, info: any) { console.error('[GoLive] UI crashed:', e, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[910] bg-black/95 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-white font-black">The broadcast screen hit an error</p>
          <p className="text-white/45 text-xs leading-relaxed break-words max-w-sm">{this.state.error}</p>
          <button onClick={this.props.onClose} className="mt-2 px-8 py-3.5 bg-white/10 border border-white/15 rounded-2xl text-white font-bold text-sm">Close</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const GoLiveWizardInner: React.FC<GoLiveWizardProps> = ({ onClose, currentUser }) => {
  const [step, setStep] = useState<WizardStep>('TYPE');
  // Quick Stream skips the wizard entirely — one tap into the phone streamer
  // (auto-post + notifications + achievements + save/delete live there).
  const [quickLaunch, setQuickLaunch] = useState(false);
  const [streamType, setStreamType] = useState<StreamType>('QUICK');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [signalOk, setSignalOk] = useState(false);
  const [signalError, setSignalError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lowerThirds, setLowerThirds] = useState<LowerThird[]>([{ id: '1', title: '', subtitle: '', visible: false }]);
  const [activeLowerThird, setActiveLowerThird] = useState<LowerThird | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [liveFeedId, setLiveFeedId] = useState<string | null>(null);
  const [goLiveStartTime, setGoLiveStartTime] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [slowMode, setSlowMode] = useState(false);
  const [muxStream, setMuxStream] = useState<MuxStreamInfo | null>(null);
  const [muxCreating, setMuxCreating] = useState(false);
  const [muxError, setMuxError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [muxSignalStatus, setMuxSignalStatus] = useState<'idle' | 'waiting' | 'active' | 'error'>('idle');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps: WizardStep[] = ['TYPE', 'DETAILS', 'SIGNAL', 'GRAPHICS', 'GOLIVE'];
  const stepIndex = steps.indexOf(step);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_) {}
  };

  const createMuxStream = async () => {
    setMuxCreating(true);
    setMuxError('');
    try {
      const info = await createMuxLiveStream();
      setMuxStream(info);
      setSignalOk(true);
    } catch (err: any) {
      setMuxError(err.message || 'Failed to create Mux live stream');
    } finally {
      setMuxCreating(false);
    }
  };

  const startCamera = useCallback(async () => {
    setSignalError('');
    if (streamType === 'EXTERNAL' || streamType === 'MUX') { setSignalOk(true); return; }
    try {
      const constraints: MediaStreamConstraints = {
        video: streamType === 'QUICK' || streamType === 'SPORTS'
          ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; }
      setSignalOk(true);
    } catch (err: any) {
      setSignalError(err.message || 'Could not access camera/microphone. Check browser permissions.');
      setSignalOk(false);
    }
  }, [streamType]);

  useEffect(() => {
    if (step === 'SIGNAL') startCamera();
    return () => {
      if (step !== 'SIGNAL' && step !== 'GRAPHICS' && step !== 'GOLIVE') {
        localStream?.getTracks().forEach(t => t.stop());
      }
    };
  }, [step]);

  const toggleVideo = () => { localStream?.getVideoTracks().forEach(t => { t.enabled = !videoEnabled; }); setVideoEnabled(v => !v); };
  const toggleAudio = () => { localStream?.getAudioTracks().forEach(t => { t.enabled = !audioEnabled; }); setAudioEnabled(a => !a); };

  useEffect(() => {
    if (!isLive || !liveFeedId) return;
    const q = query(collection(db, 'live_feeds', liveFeedId, 'chat'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
    return unsub;
  }, [isLive, liveFeedId]);

  // Poll Mux for live signal once credentials are issued
  useEffect(() => {
    if (!muxStream?.streamId || muxSignalStatus === 'active') return;
    setMuxSignalStatus('waiting');
    pollIntervalRef.current = setInterval(async () => {
      try {
        const { status } = await getMuxLiveStreamStatus(muxStream.streamId);
        if (status === 'active') {
          setMuxSignalStatus('active');
          setSignalOk(true);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch {
        setMuxSignalStatus('error');
      }
    }, 5000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [muxStream?.streamId]);

  const deleteMessage = async (msgId: string) => {
    if (!liveFeedId) return;
    await deleteDoc(doc(db, 'live_feeds', liveFeedId, 'chat', msgId));
  };
  const muteUser = (uid: string) => setMutedUsers(s => new Set([...s, uid]));
  const unmuteUser = (uid: string) => setMutedUsers(s => { const n = new Set(s); n.delete(uid); return n; });

  const handleGoLive = async () => {
    if (!currentUser) return;
    try {
      let url = externalUrl;
      if (streamType === 'MUX' && muxStream?.playbackId) {
        url = `https://stream.mux.com/${muxStream.playbackId}.m3u8`;
      } else if (streamType !== 'EXTERNAL') {
        url = `plajah://live/${currentUser.uid}`;
      }
      const feedPayload: any = {
        title,
        url,
        ownerName: currentUser.displayName || 'User',
        ownerPhoto: currentUser.photoURL || '',
        status: 'LIVE',
        isPublic: true,
        streamType,
      };
      if (streamType === 'MUX' && muxStream) {
        feedPayload.muxPlaybackId = muxStream.playbackId;
        feedPayload.muxStreamId = muxStream.streamId;
      }
      const feedRef = await publishLiveFeed(feedPayload);
      setLiveFeedId(feedRef?.id ?? null);
      setIsLive(true);
      setGoLiveStartTime(Date.now());
    } catch (err) { console.error('Failed to go live:', err); }
  };

  const handleEndStream = async () => {
    const endedAt = Date.now();
    const durationMs = goLiveStartTime ? endedAt - goLiveStartTime : 0;

    // End Mux stream (complete() triggers asset creation) and archive the broadcast.
    if (muxStream?.streamId) {
      try {
        const { assetId, playbackId } = await endMuxLiveStream(muxStream.streamId);
        await saveStreamArchive({
          ownerId: currentUser?.uid ?? '',
          ownerName: currentUser?.displayName || 'User',
          ownerPhoto: currentUser?.photoURL || '',
          title,
          startedAt: goLiveStartTime || endedAt,
          endedAt,
          durationMs,
          muxAssetId: assetId,
          muxPlaybackId: playbackId,
          streamType: 'MUX',
        });
      } catch (err) {
        console.error('Stream archive failed:', err);
      }
    }

    if (liveFeedId) await deleteLiveFeed(liveFeedId);
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setIsLive(false);
    onClose();
  };

  const showLowerThird = (lt: LowerThird) => {
    setActiveLowerThird(lt);
    setLowerThirds(prev => prev.map(l => l.id === lt.id ? { ...l, visible: true } : l));
    setTimeout(() => {
      setActiveLowerThird(null);
      setLowerThirds(prev => prev.map(l => l.id === lt.id ? { ...l, visible: false } : l));
    }, 6000);
  };

  if (isLive) {
    const liveUrl = streamType === 'MUX' && muxStream?.playbackId
      ? `https://stream.mux.com/${muxStream.playbackId}.m3u8`
      : `${window.location.origin}?livestream=${liveFeedId}`;

    const sendChatText = async (text: string) => {
      if (!text.trim() || !liveFeedId || !currentUser) return;
      await addDoc(collection(db, 'live_feeds', liveFeedId, 'chat'), {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Broadcaster',
        text: text.trim(),
        timestamp: Date.now(),
      });
    };

    return (
      <>
        {/* Lower third overlay */}
        <AnimatePresence>
          {activeLowerThird && (
            <motion.div key={activeLowerThird.id} initial={{ x: -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -80, opacity: 0 }}
              className="fixed left-8 z-[1500] pointer-events-none" style={{ bottom: '84px' }}>
              <div className="border-l-4 border-[#ff8c00] pl-4 bg-black/80 backdrop-blur-md pr-8 py-3 rounded-r-2xl">
                <p className="text-white font-black text-lg uppercase tracking-tight leading-tight">{activeLowerThird.title}</p>
                {activeLowerThird.subtitle && <p className="text-[#ff8c00] text-sm font-bold uppercase tracking-widest">{activeLowerThird.subtitle}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="fixed bottom-0 left-0 right-0 z-[1400] bg-black/95 backdrop-blur-xl border-t border-red-500/30 px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 bg-red-600 px-4 py-2 rounded-full shrink-0">
            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
            <span className="text-white text-xs font-black uppercase tracking-widest">Live</span>
          </div>
          <LiveTimer startTime={goLiveStartTime} />
          <div className="flex-1" />
          <button onClick={toggleVideo} className={`p-3 rounded-full border transition-all ${videoEnabled ? 'border-white/20 bg-white/5 text-white' : 'border-red-500/50 bg-red-500/20 text-red-400'}`}>
            {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
          <button onClick={toggleAudio} className={`p-3 rounded-full border transition-all ${audioEnabled ? 'border-white/20 bg-white/5 text-white' : 'border-red-500/50 bg-red-500/20 text-red-400'}`}>
            {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          {lowerThirds.filter(lt => lt.title).map(lt => (
            <button key={lt.id} onClick={() => showLowerThird(lt)}
              className="px-4 py-2 bg-[#ff8c00]/20 border border-[#ff8c00]/40 text-[#ff8c00] text-xs font-black rounded-full hover:bg-[#ff8c00]/30 transition-all truncate max-w-[120px]">
              {lt.title}
            </button>
          ))}
          <button onClick={() => setShowChat(v => !v)}
            className={`p-3 rounded-full border transition-all ${showChat ? 'border-[#ff8c00]/50 bg-[#ff8c00]/20 text-[#ff8c00]' : 'border-white/20 bg-white/5 text-white'}`}>
            <MessageSquare size={18} />
          </button>
          <button onClick={handleEndStream}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-full transition-all">
            <div className="w-2 h-2 bg-white rounded-full" /> End Stream
          </button>
        </div>

        <AnimatePresence>
          {showChat && (
            <motion.div initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }}
              className="fixed right-0 top-0 bottom-16 z-[1300] w-80 bg-black/95 backdrop-blur-xl border-l border-white/10 flex flex-col">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-black uppercase tracking-widest">Live Chat</p>
                  <p className="text-white/40 text-[10px] font-bold">{chatMessages.length} messages</p>
                </div>
                <button onClick={() => setSlowMode(v => !v)}
                  className={`p-2 rounded-full border text-xs transition-all ${slowMode ? 'border-[#ff8c00]/50 bg-[#ff8c00]/20 text-[#ff8c00]' : 'border-white/20 bg-white/5 text-white/40'}`}
                  title="Slow mode"><Clock size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.filter(m => !mutedUsers.has(m.uid)).map(msg => (
                  <div key={msg.id} className="group flex items-start gap-2 bg-white/5 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#ff8c00] text-[10px] font-black uppercase tracking-wide truncate">{msg.displayName}</p>
                      <p className="text-white text-xs leading-relaxed break-words">{msg.text}</p>
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => deleteMessage(msg.id)} className="p-1 text-white/30 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                      <button onClick={() => muteUser(msg.uid)} className="p-1 text-white/30 hover:text-yellow-400 transition-colors"><Ban size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {mutedUsers.size > 0 && (
                <div className="p-3 border-t border-white/10">
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Muted ({mutedUsers.size})</p>
                  <div className="space-y-1">
                    {[...mutedUsers].map(uid => {
                      const u = chatMessages.find(m => m.uid === uid);
                      return (
                        <div key={uid} className="flex items-center justify-between bg-red-500/10 rounded-lg px-3 py-2">
                          <span className="text-red-400 text-[10px] font-bold truncate">{u?.displayName || uid.slice(0, 8)}</span>
                          <button onClick={() => unmuteUser(uid)} className="text-white/30 hover:text-white transition-colors ml-2"><X size={10} /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Broadcast control panel */}
        <LiveBroadcastControlPanel
          streamId={liveFeedId || ''}
          title={title}
          shareUrl={liveUrl}
          localStream={localStream}
          videoEnabled={videoEnabled}
          audioEnabled={audioEnabled}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          viewerCount={0}
          startTime={goLiveStartTime}
          chatMessages={chatMessages.map(m => ({ id: m.id, uid: m.uid, user: m.displayName, text: m.text, ts: m.timestamp }))}
          onSendChat={sendChatText}
          onDeleteChat={deleteMessage}
          onMuteUser={muteUser}
          lowerThirds={lowerThirds}
          onShowLowerThird={showLowerThird}
          muxSignalStatus={streamType === 'MUX' ? muxSignalStatus : undefined}
          muxStreamKey={muxStream?.streamKey}
          muxRtmpUrl={muxStream?.rtmpUrl}
          muxSrtUrl={muxStream?.srtUrl}
          onEndStream={handleEndStream}
        />
        {streamType === 'SPORTS' && liveFeedId && (
          <SportsProducerPanel feedId={liveFeedId} />
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl sm:rounded-[2.5rem] overflow-hidden flex flex-col" style={{ maxHeight: '94dvh' }}>

        <div className="flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-8 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center"><Radio size={18} className="text-white" /></div>
            <div>
              <p className="text-white font-black text-lg uppercase tracking-tight">Go Live</p>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Step {stepIndex + 1} of {steps.length} — {step.replace('_', ' ')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white/5 rounded-full text-white/40 hover:bg-white/10 transition-all"><X size={20} /></button>
        </div>

        <div className="flex items-center justify-center gap-2 px-4 sm:px-8 pb-4 sm:pb-6 shrink-0">
          {steps.map((s, i) => (
            <div key={s} className={`rounded-full transition-all ${i === stepIndex ? 'w-8 h-2 bg-red-500' : i < stepIndex ? 'w-2 h-2 bg-red-500/50' : 'w-2 h-2 bg-white/10'}`} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.18 }}>

              {step === 'TYPE' && (
                <div className="space-y-4">
                  <h2 className="text-white font-black text-xl uppercase tracking-tight mb-6">How do you want to go live?</h2>
                  {/* Two primary choices only — advanced modes live inside TV Studio. */}
                  {([
                    { id: 'QUICK' as StreamType, icon: Camera, label: 'Quick Stream', desc: 'Phone camera, one tap. Auto-posts to your timeline, notifies followers, save the replay when you end.' },
                    { id: 'STUDIO' as StreamType, icon: Monitor, label: 'TV Studio', desc: 'Full production broadcast — cameras, audio controls, overlays. Advanced modes inside.' },
                  ]).map(({ id, icon: Icon, label, desc }) => {
                    const selected = id === 'QUICK' ? streamType === 'QUICK' : streamType !== 'QUICK';
                    return (
                      <button key={id} onClick={() => setStreamType(id)}
                        className={`w-full flex items-center gap-4 sm:gap-5 p-4 sm:p-6 rounded-2xl border text-left transition-all ${selected ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${selected ? 'bg-red-500' : 'bg-white/10'}`}>
                          <Icon size={22} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black uppercase tracking-tight">{label}</p>
                          <p className="text-white/40 text-xs sm:text-sm mt-0.5">{desc}</p>
                        </div>
                        {selected && <Check size={20} className="text-red-400 shrink-0" />}
                      </button>
                    );
                  })}

                  {/* TV Studio preferences — the former top-level advanced options */}
                  {streamType !== 'QUICK' && (
                    <div className="mt-2 p-4 bg-white/[0.04] rounded-2xl border border-white/10 space-y-2">
                      <p className="text-white/50 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Settings size={11} /> Studio broadcast mode
                      </p>
                      {([
                        { id: 'STUDIO' as StreamType, icon: Monitor, label: 'Studio Camera', desc: 'Webcam or capture card with audio/video controls.' },
                        { id: 'SPORTS' as StreamType, icon: Radio, label: 'Sports Broadcast', desc: 'Scorebug, clock, replays, AI commentary.' },
                        { id: 'MUX' as StreamType, icon: Tv2, label: 'Pro (OBS / RTMP)', desc: 'Stream from OBS, Streamlabs or any encoder.' },
                        { id: 'EXTERNAL' as StreamType, icon: Wifi, label: 'External URL', desc: 'Relay an existing YouTube/Twitch stream.' },
                      ]).map(({ id, icon: Icon, label, desc }) => (
                        <button key={id} onClick={() => setStreamType(id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${streamType === id ? 'border-red-500/40 bg-red-500/10' : 'border-white/5 bg-white/[0.03] hover:border-white/15'}`}>
                          <Icon size={15} className={streamType === id ? 'text-red-400' : 'text-white/40'} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-black uppercase tracking-tight ${streamType === id ? 'text-white' : 'text-white/60'}`}>{label}</p>
                            <p className="text-white/30 text-[10px] truncate">{desc}</p>
                          </div>
                          {streamType === id && <Check size={14} className="text-red-400 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {streamType === 'EXTERNAL' && (
                    <div className="mt-2 p-4 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">External Stream URL</p>
                      <p className="text-white/40 text-xs mb-3 leading-relaxed">Paste your live embed URL from YouTube, Twitch, or any source.</p>
                      <input type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:ring-2 ring-red-500/40" />
                    </div>
                  )}
                </div>
              )}

              {step === 'DETAILS' && (
                <div className="space-y-5">
                  <h2 className="text-white font-black text-xl uppercase tracking-tight mb-2">Stream details</h2>
                  <div>
                    <label className="text-white/60 text-xs font-black uppercase tracking-widest block mb-2">Stream Title *</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you streaming today?"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/20 outline-none focus:ring-2 ring-red-500/40 font-bold" />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs font-black uppercase tracking-widest block mb-2">Description</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell viewers what to expect..." rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/20 outline-none focus:ring-2 ring-red-500/40 resize-none text-sm" />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs font-black uppercase tracking-widest block mb-2">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {['Music', 'Gaming', 'Talk', 'Sports', 'Art', 'Education', 'IRL', 'Other'].map(cat => (
                        <button key={cat} onClick={() => setCategory(cat)}
                          className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide border transition-all ${category === cat ? 'border-red-500/50 bg-red-500/20 text-red-400' : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 'SIGNAL' && (
                <div className="space-y-5">
                  <h2 className="text-white font-black text-xl uppercase tracking-tight mb-2">Signal check</h2>
                  {streamType === 'MUX' ? (
                    <div className="space-y-4">
                      {!muxStream ? (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center space-y-4">
                          <Tv2 size={40} className="text-[#ff8c00] mx-auto" />
                          <div>
                            <p className="text-white font-black uppercase tracking-tight">Professional RTMP Stream</p>
                            <p className="text-white/40 text-sm mt-1 leading-relaxed">We'll generate a private RTMP endpoint for you. Use it in OBS, Streamlabs, or any broadcasting software.</p>
                          </div>
                          {muxError && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                              <AlertCircle size={16} className="text-red-400 shrink-0" />
                              <p className="text-red-400 text-xs">{muxError}</p>
                            </div>
                          )}
                          <button onClick={createMuxStream} disabled={muxCreating}
                            className="flex items-center gap-2 mx-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-full transition-all disabled:opacity-50">
                            {muxCreating ? <RefreshCw size={14} className="animate-spin" /> : <Tv2 size={14} />}
                            {muxCreating ? 'Creating Stream...' : 'Generate Stream Credentials'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <Check size={16} className="text-green-400 shrink-0" />
                            <p className="text-green-400 text-xs font-black uppercase tracking-widest">Stream credentials ready</p>
                          </div>
                          {/* Signal status banner */}
                          <div className={`flex items-center gap-3 p-3 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all ${
                            muxSignalStatus === 'active' ? 'border-green-500/40 bg-green-500/10 text-green-400'
                            : muxSignalStatus === 'waiting' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                            : 'border-white/10 bg-white/5 text-white/30'
                          }`}>
                            {muxSignalStatus === 'active'
                              ? <><Check size={14} /> Signal detected — stream is active!</>
                              : muxSignalStatus === 'waiting'
                              ? <><RefreshCw size={14} className="animate-spin" /> Waiting for signal from your encoder…</>
                              : <><AlertCircle size={14} /> Open OBS and start streaming to detect signal</>
                            }
                          </div>

                          {/* Credentials */}
                          {[
                            { label: 'RTMP Server (OBS / Streamlabs)', value: muxStream.rtmpUrl, field: 'rtmp' },
                            { label: 'SRT URL (OBS 29+ / ffmpeg / vMix)', value: muxStream.srtUrl, field: 'srt' },
                            { label: 'Stream Key', value: muxStream.streamKey, field: 'key', secret: true },
                          ].map(({ label, value, field, secret }) => (
                            <div key={field} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">{label}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-white text-xs font-mono flex-1 break-all select-all">
                                  {secret ? '•'.repeat(20) + '…' : value}
                                </p>
                                <button onClick={() => copyToClipboard(value, field)}
                                  className={`shrink-0 p-2 rounded-xl transition-all ${copiedField === field ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40 hover:text-white'}`}>
                                  {copiedField === field ? <Check size={13} /> : <Copy size={13} />}
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Setup guide */}
                          <div className="p-4 bg-[#ff8c00]/5 border border-[#ff8c00]/20 rounded-2xl text-xs text-white/50 leading-relaxed space-y-1">
                            <p className="text-[#ff8c00] font-black uppercase tracking-widest text-[10px] mb-2">OBS / Encoder Setup</p>
                            <p className="font-bold text-white/40">RTMP: Settings → Stream → Custom RTMP → paste Server + Key</p>
                            <p className="font-bold text-white/40">SRT: Settings → Stream → Custom… → paste full SRT URL (no key needed)</p>
                            <p className="font-bold text-white/40">ffmpeg: <span className="font-mono text-white/30">ffmpeg -i input … -f mpegts "{muxStream.srtUrl}"</span></p>
                          </div>

                          {/* Live preview — Plajah player, zero Mux UI */}
                          {muxStream.playbackId && (
                            <div className="rounded-2xl overflow-hidden border border-white/10">
                              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest px-3 pt-3 pb-2">
                                {muxSignalStatus === 'active' ? 'Live Preview' : 'Preview (will appear once your encoder connects)'}
                              </p>
                              <div className="aspect-video">
                                <PlajahLivePlayer
                                  playbackId={muxStream.playbackId}
                                  isLive
                                  autoPlay
                                  muted
                                  className="w-full h-full"
                                  onError={() => {}}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : streamType === 'EXTERNAL' ? (
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <Wifi size={40} className="text-[#ff8c00] mx-auto mb-3" />
                      <p className="text-white font-bold">External stream detected</p>
                      <p className="text-white/40 text-sm mt-1">Signal verification is handled by your external software (OBS, etc.).</p>
                      <p className="text-white/30 text-xs mt-1 break-all">URL: {externalUrl || '(none set)'}</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10">
                        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${videoEnabled ? 'opacity-100' : 'opacity-0'}`} />
                        {!videoEnabled && <div className="absolute inset-0 flex items-center justify-center"><VideoOff size={40} className="text-white/20" /></div>}
                        {signalOk && (
                          <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500/20 border border-green-500/40 px-3 py-1.5 rounded-full">
                            <Check size={12} className="text-green-400" />
                            <span className="text-green-400 text-[10px] font-black uppercase">Signal OK</span>
                          </div>
                        )}
                      </div>
                      {signalError && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-red-400 text-sm font-bold">Permission Error</p>
                            <p className="text-red-300/70 text-xs mt-1">{signalError}</p>
                            <button onClick={startCamera} className="mt-2 text-red-400 text-xs font-black uppercase tracking-widest hover:text-red-300 transition-colors">Try Again</button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button onClick={toggleVideo}
                          className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all ${videoEnabled ? 'border-white/20 bg-white/5 text-white' : 'border-red-500/50 bg-red-500/20 text-red-400'}`}>
                          {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}{videoEnabled ? 'Disable Video' : 'Enable Video'}
                        </button>
                        <button onClick={toggleAudio}
                          className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all ${audioEnabled ? 'border-white/20 bg-white/5 text-white' : 'border-red-500/50 bg-red-500/20 text-red-400'}`}>
                          {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}{audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                        </button>
                      </div>
                      <div>
                        <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Audio Level</p>
                        <AudioMeter stream={localStream} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Video Signal', ok: signalOk && videoEnabled, icon: Video },
                          { label: 'Audio Signal', ok: signalOk && audioEnabled, icon: Mic },
                        ].map(({ label, ok, icon: Icon }) => (
                          <div key={label} className={`flex items-center gap-3 p-4 rounded-2xl border ${ok ? 'border-green-500/30 bg-green-500/10' : 'border-white/10 bg-white/5'}`}>
                            <Icon size={18} className={ok ? 'text-green-400' : 'text-white/20'} />
                            <div>
                              <p className={`text-xs font-black uppercase tracking-wide ${ok ? 'text-green-400' : 'text-white/30'}`}>{label}</p>
                              <p className="text-[10px] text-white/30 font-bold">{ok ? 'Connected' : 'Not detected'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === 'GRAPHICS' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-white font-black text-xl uppercase tracking-tight">Graphics & Lower Thirds</h2>
                    <button onClick={() => setLowerThirds(prev => [...prev, { id: Date.now().toString(), title: '', subtitle: '', visible: false }])}
                      className="flex items-center gap-2 px-4 py-2 bg-[#ff8c00]/20 border border-[#ff8c00]/40 text-[#ff8c00] text-xs font-black rounded-full hover:bg-[#ff8c00]/30 transition-all">
                      <Type size={12} /> Add
                    </button>
                  </div>
                  <p className="text-white/40 text-sm">Create lower thirds to display during your stream. They fire for 6 seconds when triggered from the broadcast bar.</p>
                  <div className="space-y-3">
                    {lowerThirds.map((lt, idx) => (
                      <div key={lt.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Lower Third {idx + 1}</p>
                          {lowerThirds.length > 1 && <button onClick={() => setLowerThirds(prev => prev.filter(l => l.id !== lt.id))} className="text-white/20 hover:text-red-400 transition-colors"><X size={14} /></button>}
                        </div>
                        <input type="text" value={lt.title} onChange={e => setLowerThirds(prev => prev.map(l => l.id === lt.id ? { ...l, title: e.target.value } : l))}
                          placeholder="Main title text..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-bold placeholder-white/20 outline-none focus:ring-2 ring-[#ff8c00]/40 text-sm" />
                        <input type="text" value={lt.subtitle} onChange={e => setLowerThirds(prev => prev.map(l => l.id === lt.id ? { ...l, subtitle: e.target.value } : l))}
                          placeholder="Subtitle / role (optional)..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white/70 placeholder-white/20 outline-none focus:ring-2 ring-[#ff8c00]/40 text-sm" />
                        {lt.title && (
                          <div className="border-l-4 border-[#ff8c00] pl-4 bg-black/60 pr-6 py-3 rounded-r-xl">
                            <p className="text-white font-black text-sm uppercase tracking-tight">{lt.title}</p>
                            {lt.subtitle && <p className="text-[#ff8c00] text-xs font-bold uppercase tracking-widest">{lt.subtitle}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex items-center gap-3 mb-2"><Layers size={16} className="text-white/40" /><p className="text-white/60 text-xs font-black uppercase tracking-widest">Full-Screen Graphics</p></div>
                    <p className="text-white/30 text-xs leading-relaxed">Full-screen graphics and media playback overlays coming in a future update.</p>
                  </div>
                </div>
              )}

              {step === 'GOLIVE' && (
                <div className="space-y-6">
                  <h2 className="text-white font-black text-xl uppercase tracking-tight mb-2">Ready to go live?</h2>
                  <div className="space-y-3">
                    {[
                      { label: 'Stream Type', value: streamType === 'QUICK' ? 'Quick Mobile' : streamType === 'STUDIO' ? 'Studio Broadcast' : streamType === 'MUX' ? 'Mux Pro Stream' : streamType === 'SPORTS' ? '🏈 Sports Broadcast' : 'External Stream' },
                      { label: 'Title', value: title || '(untitled)' },
                      { label: 'Category', value: category || '(none)' },
                      { label: 'Lower Thirds', value: `${lowerThirds.filter(lt => lt.title).length} configured` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-3 border-b border-white/5">
                        <span className="text-white/40 text-xs font-black uppercase tracking-widest">{label}</span>
                        <span className="text-white text-sm font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                  {streamType === 'MUX' ? (
                    <div className={`flex items-center gap-3 p-4 rounded-2xl border ${muxStream ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}`}>
                      {muxStream ? <Check size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-yellow-400" />}
                      <p className={`text-sm font-bold ${muxStream ? 'text-green-400' : 'text-yellow-400'}`}>
                        {muxStream ? 'Mux stream credentials ready — connect OBS and go live' : 'No Mux stream created yet — go back to Signal step'}
                      </p>
                    </div>
                  ) : streamType === 'SPORTS' ? (
                    <div className="flex items-center gap-3 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                      <Radio size={18} className="text-amber-400" />
                      <p className="text-sm font-bold text-amber-400">
                        Sports mode — real-time scorebug, AI commentary & replay controls will appear when you go live
                      </p>
                    </div>
                  ) : streamType !== 'EXTERNAL' ? (
                    <div className={`flex items-center gap-3 p-4 rounded-2xl border ${signalOk ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}`}>
                      {signalOk ? <Check size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-yellow-400" />}
                      <p className={`text-sm font-bold ${signalOk ? 'text-green-400' : 'text-yellow-400'}`}>
                        {signalOk ? 'Signal verified — ready to broadcast' : 'Signal not verified — you can still go live'}
                      </p>
                    </div>
                  ) : null}
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed">
                    By going live you confirm your content complies with Plajah Community Guidelines and all applicable laws. Do not stream copyrighted content without authorization.
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 border-t border-white/5 shrink-0">
          <button onClick={() => setStep(steps[stepIndex - 1])} disabled={stepIndex === 0}
            className="flex items-center gap-2 px-5 py-3 bg-white/5 rounded-2xl text-white/60 text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all">
            <ChevronLeft size={16} /> Back
          </button>
          {step !== 'GOLIVE' ? (
            <button onClick={() => { if (step === 'TYPE' && streamType === 'QUICK') { setQuickLaunch(true); } else { setStep(steps[stepIndex + 1]); } }}
              disabled={(step === 'DETAILS' && !title.trim()) || (step === 'TYPE' && streamType === 'EXTERNAL' && !externalUrl.trim())}
              className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/90 disabled:opacity-30 disabled:pointer-events-none transition-all">
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleGoLive} disabled={!title.trim()}
              className="flex items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest disabled:opacity-30 disabled:pointer-events-none transition-all">
              <div className="w-2 h-2 bg-white rounded-full animate-ping" /> Go Live
            </button>
          )}
        </div>
      </motion.div>

      {/* Quick Stream — the phone-first streamer takes over the whole screen */}
      {quickLaunch && <MobileLiveStreamer mode="streamer" onClose={onClose} />}
    </div>
  );
};

// Portal to <body>: any transformed ancestor re-anchors position:fixed, which
// made the wizard open at the top of the page instead of the current viewport.
const GoLiveWizard: React.FC<GoLiveWizardProps> = (props) => createPortal(
  <BroadcastErrorBoundary onClose={props.onClose}>
    <GoLiveWizardInner {...props} />
  </BroadcastErrorBoundary>,
  document.body,
);

export default GoLiveWizard;
