import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Mic, X, Radio, MessageCircle, Users, Eye, Settings2, MicOff, VideoOff, Share2 } from 'lucide-react';
import { auth } from '../services/backendService';
import { db } from '../services/firebase';
import LiveBroadcastControlPanel from './LiveBroadcastControlPanel';
import {
  doc, setDoc, collection, addDoc, onSnapshot,
  deleteDoc, updateDoc, increment, serverTimestamp, Timestamp
} from 'firebase/firestore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

interface LiveStreamModalProps {
  onClose: () => void;
  onStreamActive: (isActive: boolean) => void;
  clubId?: string;
  isPrivate?: boolean;
}

interface ChatMsg { user: string; text: string; ts: number }

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({ onClose, onStreamActive, clubId, isPrivate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [streamStartTime, setStreamStartTime] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streamId, setStreamId] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy Link');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const initCamera = useCallback(async () => {
    try {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: micEnabled,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      console.error('Camera init failed:', e);
    }
  }, [cameraEnabled, micEnabled]);

  useEffect(() => {
    initCamera();
    return () => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [initCamera]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const startBroadcast = async () => {
    if (!title.trim()) { alert('Please enter a broadcast title.'); return; }
    if (!auth.currentUser) { alert('Sign in to go live.'); return; }

    const id = uuidv4();
    setStreamId(id);
    const url = `${window.location.origin}?livestream=${id}`;
    setShareUrl(url);

    // Create stream document
    await setDoc(doc(db, 'live_streams', id), {
      id,
      title,
      description,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      ownerId: auth.currentUser.uid,
      ownerName: auth.currentUser.displayName || 'Broadcaster',
      ownerPhoto: auth.currentUser.photoURL || '',
      isLive: true,
      viewerCount: 0,
      ...(clubId ? { clubId, isPrivate: !!isPrivate } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Also publish to live_feeds for discovery
    await addDoc(collection(db, 'live_feeds'), {
      title,
      description,
      ownerId: auth.currentUser.uid,
      ownerName: auth.currentUser.displayName || 'Broadcaster',
      ownerPhoto: auth.currentUser.photoURL || '',
      url: `livestream:${id}`,
      status: 'LIVE',
      isPublic: true,
      streamId: id,
      timestamp: serverTimestamp(),
    });

    // Listen for viewer join requests
    const viewersRef = collection(db, 'live_streams', id, 'viewers');
    const unsubViewers = onSnapshot(viewersRef, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          await handleNewViewer(id, change.doc.id);
        }
        if (change.type === 'removed') {
          const pc = peerConnsRef.current.get(change.doc.id);
          pc?.close();
          peerConnsRef.current.delete(change.doc.id);
        }
      });
      setViewerCount(snap.size);
    });

    // Subscribe to chat
    const chatRef = collection(db, 'live_streams', id, 'chat');
    const unsubChat = onSnapshot(chatRef, (snap) => {
      const msgs: ChatMsg[] = [];
      snap.forEach(d => msgs.push(d.data() as ChatMsg));
      msgs.sort((a, b) => a.ts - b.ts);
      setChatMessages(msgs);
    });

    unsubscribesRef.current.push(unsubViewers, unsubChat);
    setStreamStartTime(Date.now());
    setIsLive(true);
    onStreamActive(true);
  };

  const handleNewViewer = async (sid: string, viewerId: string) => {
    if (peerConnsRef.current.has(viewerId)) return;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnsRef.current.set(viewerId, pc);

    // Add all local tracks
    mediaStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, mediaStreamRef.current!);
    });

    // ICE → Firestore
    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        await addDoc(
          collection(db, 'live_streams', sid, 'viewers', viewerId, 'broadcaster_candidates'),
          e.candidate.toJSON()
        );
      }
    };

    // Create & store offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(
      doc(db, 'live_streams', sid, 'viewers', viewerId, 'offer', 'data'),
      { sdp: offer.sdp, type: offer.type }
    );

    // Listen for answer
    const unsubAnswer = onSnapshot(
      doc(db, 'live_streams', sid, 'viewers', viewerId, 'answer', 'data'),
      async (snap) => {
        if (snap.exists() && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(snap.data() as RTCSessionDescriptionInit));
        }
      }
    );

    // Listen for viewer ICE candidates
    const unsubIce = onSnapshot(
      collection(db, 'live_streams', sid, 'viewers', viewerId, 'viewer_candidates'),
      (snap) => {
        snap.docChanges().forEach(async (c) => {
          if (c.type === 'added') {
            await pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit));
          }
        });
      }
    );

    unsubscribesRef.current.push(unsubAnswer, unsubIce);
  };

  const stopBroadcast = async () => {
    unsubscribesRef.current.forEach(u => u());
    unsubscribesRef.current = [];
    peerConnsRef.current.forEach(pc => pc.close());
    peerConnsRef.current.clear();
    if (streamId) {
      await updateDoc(doc(db, 'live_streams', streamId), { isLive: false, endedAt: serverTimestamp() });
    }
    setIsLive(false);
    onStreamActive(false);
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !streamId || !auth.currentUser) return;
    await addDoc(collection(db, 'live_streams', streamId, 'chat'), {
      user: auth.currentUser.displayName || 'Broadcaster',
      text: chatInput.trim(),
      ts: Date.now(),
    });
    setChatInput('');
  };

  const toggleTrack = (kind: 'video' | 'audio') => {
    mediaStreamRef.current?.getTracks().forEach(t => {
      if (t.kind === kind) t.enabled = !t.enabled;
    });
    if (kind === 'video') setCameraEnabled(v => !v);
    else setMicEnabled(v => !v);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy Link'), 2000);
  };

  // While live → hand off to the broadcast control panel
  if (isLive) {
    const sendChatText = async (text: string) => {
      if (!text.trim() || !streamId || !auth.currentUser) return;
      await addDoc(collection(db, 'live_streams', streamId, 'chat'), {
        user: auth.currentUser.displayName || 'Broadcaster',
        text: text.trim(),
        ts: Date.now(),
      });
    };
    return (
      <LiveBroadcastControlPanel
        streamId={streamId}
        title={title}
        shareUrl={shareUrl}
        localStream={mediaStreamRef.current}
        videoEnabled={cameraEnabled}
        audioEnabled={micEnabled}
        onToggleVideo={() => toggleTrack('video')}
        onToggleAudio={() => toggleTrack('audio')}
        viewerCount={viewerCount}
        startTime={streamStartTime}
        chatMessages={chatMessages.map((m, i) => ({ id: `${i}`, user: m.user, text: m.text, ts: m.ts }))}
        onSendChat={sendChatText}
        onEndStream={stopBroadcast}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-3xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-[2rem] overflow-hidden flex flex-col lg:flex-row h-[85vh] shadow-2xl"
      >
        {/* Left: Preview + Controls */}
        <div className="flex-1 flex flex-col p-8 border-r border-white/10 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-widest text-white">Broadcast Studio</h2>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">WebRTC · Public Stream</p>
            </div>
            {!isLive && (
              <button onClick={onClose} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                <X size={20} />
              </button>
            )}
          </div>

          {/* Camera preview */}
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/8 mb-6">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!cameraEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                <VideoOff size={40} className="text-white/20 mb-3" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Camera Off</span>
              </div>
            )}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white">Live</span>
              </div>
            )}
            {isLive && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                <Eye size={12} className="text-white/60" />
                <span className="text-[9px] font-black text-white/60">{viewerCount} watching</span>
              </div>
            )}
            {/* Stream controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-2.5 bg-black/70 backdrop-blur-xl rounded-full border border-white/10">
              <button
                onClick={() => toggleTrack('video')}
                className={`p-2 rounded-full transition-colors ${cameraEnabled ? 'text-white hover:bg-white/10' : 'text-red-400 bg-red-400/15'}`}
              >
                {cameraEnabled ? <Camera size={18} /> : <VideoOff size={18} />}
              </button>
              <button
                onClick={() => toggleTrack('audio')}
                className={`p-2 rounded-full transition-colors ${micEnabled ? 'text-white hover:bg-white/10' : 'text-red-400 bg-red-400/15'}`}
              >
                {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>
          </div>

          {/* Share link (shown when live) */}
          {isLive && shareUrl && (
            <div className="mb-5 p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Stream Link</p>
                <p className="text-[10px] text-white/60 truncate font-mono">{shareUrl}</p>
              </div>
              <button
                onClick={copyLink}
                className="shrink-0 px-4 py-2 bg-white text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-orange-400 transition-all"
              >
                {copyLabel}
              </button>
            </div>
          )}

          {/* Form */}
          {!isLive && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Broadcast Title *</label>
                <input
                  value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30 transition-colors"
                  placeholder="What are you broadcasting?"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Description</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-white/30 transition-colors resize-none"
                  placeholder="Tell viewers what you're doing..."
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Tags</label>
                <input
                  value={tags} onChange={e => setTags(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30 transition-colors"
                  placeholder="music, live, art..."
                />
              </div>
            </div>
          )}

          {/* Go Live / End */}
          <div className="mt-auto">
            {!isLive ? (
              <button
                onClick={startBroadcast}
                disabled={!title.trim()}
                className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all shadow-lg"
              >
                <span className="flex items-center justify-center gap-2">
                  <Radio size={18} /> Go Live Now
                </span>
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={stopBroadcast}
                  className="flex-1 py-4 bg-red-600/20 border border-red-600/30 hover:bg-red-600 text-red-400 hover:text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all"
                >
                  End Broadcast
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-black uppercase tracking-widest text-sm transition-all text-white/60"
                >
                  Minimize
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Chat */}
        <div className="w-full lg:w-80 flex flex-col bg-black/30">
          <div className="p-5 border-b border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={15} className="text-orange-400" />
              <span className="text-sm font-black uppercase tracking-widest">Live Chat</span>
            </div>
            {isLive && (
              <div className="flex items-center gap-1.5 text-white/40">
                <Users size={12} />
                <span className="text-[9px] font-black">{viewerCount}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'none' }}>
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <MessageCircle size={28} className="mb-2" />
                <p className="text-[9px] font-black uppercase tracking-widest text-center">Chat will appear here<br />once you go live</p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-orange-400/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[8px] font-black text-orange-400">{msg.user[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-orange-400">{msg.user}</span>
                    <p className="text-xs text-white/70 mt-0.5">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChat} className="p-4 border-t border-white/8">
            <div className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={!isLive}
                placeholder={isLive ? 'Send a message...' : 'Go live to chat'}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm outline-none focus:border-white/30 transition-colors disabled:opacity-40"
              />
              <button type="submit" disabled={!isLive || !chatInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30">
                <MessageCircle size={15} />
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
