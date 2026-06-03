/**
 * LiveBroadcastControlPanel
 * Floating live-stream control center for the on-platform broadcaster.
 * Compact bar by default; expands to a full studio panel.
 * Works with both WebRTC (LiveStreamModal) and Mux (GoLiveWizard) modes.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, X, Video, VideoOff, Mic, MicOff, Monitor, MonitorOff,
  Share2, Copy, Check, ChevronUp, ChevronDown, Users, MessageSquare,
  Maximize2, Minimize2, Send, Wifi, WifiOff, Sliders, Eye, Activity,
  Clock, Trash2, Ban, Type,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  uid?: string;
  user: string;
  text: string;
  ts: number;
}

interface LowerThird {
  id: string;
  title: string;
  subtitle: string;
  visible: boolean;
}

export interface LiveBroadcastControlPanelProps {
  // Stream identity
  streamId: string;
  title: string;
  shareUrl: string;

  // Media controls (broadcaster supplies the stream)
  localStream: MediaStream | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  onToggleVideo: () => void;
  onToggleAudio: () => void;

  // Stats (kept up-to-date by parent)
  viewerCount: number;
  startTime: number; // Date.now() when stream started

  // Chat messages (parent subscribes; passes array here)
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => Promise<void>;
  onDeleteChat?: (msgId: string) => void;
  onMuteUser?: (uid: string) => void;

  // Lower thirds
  lowerThirds?: LowerThird[];
  onShowLowerThird?: (lt: LowerThird) => void;

  // Mux signal (only for Mux streams)
  muxSignalStatus?: 'idle' | 'waiting' | 'active' | 'error';
  muxStreamKey?: string;
  muxRtmpUrl?: string;
  muxSrtUrl?: string;

  // Stream lifecycle
  onEndStream: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function useElapsed(startTime: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function AudioMeter({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const cv = canvasRef.current;
    if (!cv) return;
    const c2 = cv.getContext('2d')!;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      c2.clearRect(0, 0, cv.width, cv.height);
      const bw = cv.width / data.length;
      data.forEach((v, i) => {
        const pct = v / 255;
        const h = pct * cv.height;
        c2.fillStyle = pct > 0.8 ? '#ef4444' : pct > 0.5 ? '#f59e0b' : '#22c55e';
        c2.fillRect(i * bw, cv.height - h, bw - 1, h);
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ctx.close(); };
  }, [stream]);
  return <canvas ref={canvasRef} width={120} height={20} className="rounded bg-black/40" />;
}

// ── Main component ─────────────────────────────────────────────────────────────

const LiveBroadcastControlPanel: React.FC<LiveBroadcastControlPanelProps> = ({
  streamId,
  title,
  shareUrl,
  localStream,
  videoEnabled,
  audioEnabled,
  onToggleVideo,
  onToggleAudio,
  viewerCount,
  startTime,
  chatMessages,
  onSendChat,
  onDeleteChat,
  onMuteUser,
  lowerThirds = [],
  onShowLowerThird,
  muxSignalStatus,
  muxStreamKey,
  muxRtmpUrl,
  muxSrtUrl,
  onEndStream,
}) => {
  const elapsed = useElapsed(startTime);
  const [expanded, setExpanded] = useState(true);
  const [activePanel, setActivePanel] = useState<'chat' | 'graphics' | 'signal' | null>('chat');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Mirror local stream to preview
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    await onSendChat(chatInput.trim());
    setChatInput('');
  };

  const handleScreenShare = async () => {
    if (screenSharing) {
      setScreenSharing(false);
      // restore camera
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = videoEnabled;
      }
      return;
    }
    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      setScreenSharing(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      screenStream.getVideoTracks()[0].onended = () => setScreenSharing(false);
    } catch {
      // permission denied or cancelled
    }
  };

  // ── Compact floating bar ──────────────────────────────────────────────────
  if (!expanded) {
    return (
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1500] flex items-center gap-3 px-4 py-2.5 bg-black/95 backdrop-blur-2xl border border-red-500/30 rounded-full shadow-2xl"
      >
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-600 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white">Live</span>
        </div>
        <span className="font-mono text-xs font-black text-white tabular-nums">{elapsed}</span>
        <span className="flex items-center gap-1 text-[10px] text-white/50">
          <Users size={11} /> {viewerCount}
        </span>
        <div className="w-px h-4 bg-white/10" />
        <button onClick={onToggleVideo} className={`p-1.5 rounded-full transition-all ${videoEnabled ? 'text-white/70 hover:text-white' : 'text-red-400 bg-red-500/15'}`}>
          {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
        </button>
        <button onClick={onToggleAudio} className={`p-1.5 rounded-full transition-all ${audioEnabled ? 'text-white/70 hover:text-white' : 'text-red-400 bg-red-500/15'}`}>
          {audioEnabled ? <Mic size={14} /> : <MicOff size={14} />}
        </button>
        <div className="w-px h-4 bg-white/10" />
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors"
        >
          <Sliders size={11} /> Studio
        </button>
        <button
          onClick={() => setConfirmEnd(true)}
          className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-red-600 hover:text-white transition-all"
        >
          End
        </button>
      </motion.div>
    );
  }

  // ── Full studio panel ────────────────────────────────────────────────────
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 20 }}
        className="fixed bottom-6 right-6 z-[1500] w-[420px] max-h-[88vh] bg-black/96 backdrop-blur-2xl border border-white/12 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">Live</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-white truncate leading-tight">{title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-[9px] text-white/40">
                <Clock size={9} /> <span className="font-mono tabular-nums">{elapsed}</span>
              </span>
              <span className="flex items-center gap-1 text-[9px] text-white/40">
                <Eye size={9} /> {viewerCount} watching
              </span>
            </div>
          </div>
          <button onClick={() => setExpanded(false)} className="p-2 text-white/30 hover:text-white transition-colors">
            <ChevronDown size={15} />
          </button>
        </div>

        {/* ── Camera preview ── */}
        <div className="relative bg-black shrink-0" style={{ aspectRatio: '16/9' }}>
          {localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
              <VideoOff size={28} className="text-white/20" />
            </div>
          )}
          {/* Audio meter overlay */}
          <div className="absolute bottom-2 left-2">
            <AudioMeter stream={audioEnabled ? localStream : null} />
          </div>
          {/* Screen share badge */}
          {screenSharing && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-blue-600/90 rounded-full text-[8px] font-black uppercase text-white">
              <Monitor size={9} /> Screen
            </div>
          )}
          {/* Mux signal indicator */}
          {muxSignalStatus && (
            <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase ${
              muxSignalStatus === 'active' ? 'bg-green-600/90 text-white' :
              muxSignalStatus === 'waiting' ? 'bg-amber-600/90 text-white' :
              muxSignalStatus === 'error' ? 'bg-red-600/90 text-white' :
              'bg-white/10 text-white/40'
            }`}>
              {muxSignalStatus === 'active' ? <Wifi size={9} /> : <WifiOff size={9} />}
              {muxSignalStatus === 'active' ? 'Signal Good' : muxSignalStatus === 'waiting' ? 'Waiting for signal…' : muxSignalStatus === 'error' ? 'No signal' : 'Mux'}
            </div>
          )}
        </div>

        {/* ── Media controls ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/6 shrink-0">
          <button
            onClick={onToggleVideo}
            title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              videoEnabled ? 'bg-white/8 text-white/70 hover:bg-white/12' : 'bg-red-500/15 text-red-400 border border-red-500/25'
            }`}
          >
            {videoEnabled ? <Video size={13} /> : <VideoOff size={13} />}
            {videoEnabled ? 'Cam On' : 'Cam Off'}
          </button>
          <button
            onClick={onToggleAudio}
            title={audioEnabled ? 'Mute mic' : 'Unmute mic'}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              audioEnabled ? 'bg-white/8 text-white/70 hover:bg-white/12' : 'bg-red-500/15 text-red-400 border border-red-500/25'
            }`}
          >
            {audioEnabled ? <Mic size={13} /> : <MicOff size={13} />}
            {audioEnabled ? 'Mic On' : 'Mic Off'}
          </button>
          <button
            onClick={handleScreenShare}
            title={screenSharing ? 'Stop screen share' : 'Share screen'}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              screenSharing ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25' : 'bg-white/8 text-white/70 hover:bg-white/12'
            }`}
          >
            {screenSharing ? <MonitorOff size={13} /> : <Monitor size={13} />}
            Screen
          </button>
        </div>

        {/* ── Share link ── */}
        <div className="px-5 py-3 border-b border-white/6 shrink-0">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">Share Link</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/5 border border-white/8 rounded-xl px-3 py-2 font-mono text-[9px] text-white/40 truncate">
              {shareUrl}
            </div>
            <button
              onClick={() => copyText(shareUrl, 'link')}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shrink-0"
              style={{ background: copied === 'link' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)', color: copied === 'link' ? '#22c55e' : 'rgba(255,255,255,0.6)' }}
            >
              {copied === 'link' ? <Check size={10} /> : <Copy size={10} />}
              {copied === 'link' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex gap-2 mt-1.5">
            {[
              { label: 'X', fn: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Watch me live on Plajah`)}&url=${encodeURIComponent(shareUrl)}`, '_blank') },
              { label: 'WhatsApp', fn: () => window.open(`https://wa.me/?text=${encodeURIComponent(`Watch me live on Plajah: ${shareUrl}`)}`, '_blank') },
            ].map(s => (
              <button key={s.label} onClick={s.fn}
                className="flex-1 py-1 text-[7px] font-black uppercase tracking-widest text-white/30 hover:text-white border border-white/6 hover:border-white/18 bg-white/[0.02] hover:bg-white/6 rounded-lg transition-all">
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sub-panel tabs ── */}
        <div className="flex border-b border-white/6 shrink-0">
          {[
            { id: 'chat' as const, label: `Chat${chatMessages.length ? ` (${chatMessages.length})` : ''}`, icon: MessageSquare },
            { id: 'graphics' as const, label: 'Graphics', icon: Type },
            ...(muxStreamKey ? [{ id: 'signal' as const, label: 'Signal', icon: Activity }] : []),
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePanel(p => p === tab.id ? null : tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                  activePanel === tab.id ? 'text-small-orange border-b-2 border-small-orange -mb-px' : 'text-white/30 hover:text-white'
                }`}
              >
                <Icon size={10} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Panel body ── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Chat */}
          {activePanel === 'chat' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <p className="text-center text-[9px] text-white/20 uppercase tracking-widest mt-6">No messages yet</p>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="flex gap-2 group items-start">
                      <div className="w-5 h-5 rounded-full bg-small-orange/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[7px] font-black text-small-orange">{msg.user[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[8px] font-black text-small-orange uppercase tracking-widest">{msg.user} </span>
                        <span className="text-[10px] text-white/70">{msg.text}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {onMuteUser && msg.uid && (
                          <button onClick={() => onMuteUser(msg.uid!)} className="p-1 text-white/25 hover:text-amber-400 transition-colors" title="Mute user">
                            <Ban size={9} />
                          </button>
                        )}
                        {onDeleteChat && (
                          <button onClick={() => onDeleteChat(msg.id)} className="p-1 text-white/25 hover:text-red-400 transition-colors" title="Delete message">
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendChat} className="px-4 pb-3 pt-2 border-t border-white/6 shrink-0">
                <div className="relative">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Send to chat…"
                    className="w-full bg-white/5 border border-white/8 rounded-xl pl-3 pr-10 py-2 text-[11px] text-white placeholder-white/20 outline-none focus:border-white/18 transition-colors"
                  />
                  <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/30 hover:text-white disabled:opacity-25 transition-colors">
                    <Send size={11} />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Graphics */}
          {activePanel === 'graphics' && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
              {lowerThirds.length === 0 ? (
                <p className="text-[9px] text-white/20 uppercase tracking-widest text-center mt-6">No lower thirds added.<br />Configure in GoLive Wizard.</p>
              ) : (
                lowerThirds.filter(lt => lt.title).map(lt => (
                  <button
                    key={lt.id}
                    onClick={() => onShowLowerThird?.(lt)}
                    className="w-full text-left p-3 bg-white/5 border border-white/8 rounded-xl hover:border-small-orange/30 hover:bg-small-orange/5 transition-all"
                  >
                    <p className="text-xs font-black text-white">{lt.title}</p>
                    {lt.subtitle && <p className="text-[9px] text-white/40 mt-0.5">{lt.subtitle}</p>}
                    <p className="text-[8px] text-small-orange mt-1 font-black uppercase tracking-widest">Click to show on stream (6 s)</p>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Signal info (Mux) */}
          {activePanel === 'signal' && muxStreamKey && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
              {[
                { label: 'RTMP URL', value: muxRtmpUrl || 'rtmps://global-live.mux.com:443/app', key: 'rtmp' },
                { label: 'Stream Key', value: muxStreamKey, key: 'key', secret: true },
                { label: 'SRT URL', value: muxSrtUrl || '', key: 'srt' },
              ].filter(r => r.value).map(row => (
                <div key={row.key}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{row.label}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-black/40 border border-white/6 rounded-lg px-3 py-2 font-mono text-[9px] text-white/30 truncate">
                      {row.secret ? '•'.repeat(12) + row.value.slice(-8) : row.value}
                    </div>
                    <button
                      onClick={() => copyText(row.value, row.key)}
                      className="shrink-0 p-2 rounded-lg bg-white/6 hover:bg-white/12 text-white/40 hover:text-white transition-all"
                    >
                      {copied === row.key ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[8px] text-white/20 leading-relaxed">Use these in OBS, vMix, Streamlabs, or ffmpeg to stream via your device camera at full quality.</p>
            </div>
          )}
        </div>

        {/* ── End stream ── */}
        <div className="px-4 pb-4 pt-3 border-t border-white/6 shrink-0">
          {confirmEnd ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2.5 bg-white/6 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
                Cancel
              </button>
              <button onClick={onEndStream} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all">
                End Stream
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmEnd(true)}
              className="w-full py-2.5 bg-red-600/15 border border-red-500/25 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
            >
              End Broadcast
            </button>
          )}
        </div>
      </motion.div>

      {/* Confirm end overlay */}
    </>
  );
};

export default LiveBroadcastControlPanel;
