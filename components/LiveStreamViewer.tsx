import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Users, MessageCircle, Heart, Send, Radio, Wifi, WifiOff } from 'lucide-react';
import { auth } from '../services/backendService';
import { db } from '../services/firebase';
import {
  doc, collection, addDoc, onSnapshot, setDoc, updateDoc, increment
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

interface LiveStreamViewerProps {
  streamId: string;
  title?: string;
  ownerName?: string;
  onClose: () => void;
}

interface ChatMsg { user: string; text: string; ts: number }

const LiveStreamViewer: React.FC<LiveStreamViewerProps> = ({ streamId, title, ownerName, onClose }) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [streamInfo, setStreamInfo] = useState<{ title: string; ownerName: string; viewerCount: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [liked, setLiked] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef(uuidv4());
  const unsubsRef = useRef<Array<() => void>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    joinStream();
    return () => {
      cleanup();
    };
  }, [streamId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const cleanup = () => {
    unsubsRef.current.forEach(u => u());
    unsubsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    // Remove viewer document
    const viewerRef = doc(db, 'live_streams', streamId, 'viewers', viewerIdRef.current);
    deleteDoc(viewerRef).catch(() => {});
  };

  const joinStream = async () => {
    setConnecting(true);

    // Subscribe to stream info
    const unsubInfo = onSnapshot(doc(db, 'live_streams', streamId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStreamInfo({
          title: data.title || title || 'Live Stream',
          ownerName: data.ownerName || ownerName || 'Broadcaster',
          viewerCount: data.viewerCount || 0,
        });
        if (!data.isLive) setConnected(false);
      }
    });

    // Subscribe to chat
    const unsubChat = onSnapshot(collection(db, 'live_streams', streamId, 'chat'), (snap) => {
      const msgs: ChatMsg[] = [];
      snap.forEach(d => msgs.push(d.data() as ChatMsg));
      msgs.sort((a, b) => a.ts - b.ts);
      setChatMessages(msgs.slice(-100));
    });

    unsubsRef.current.push(unsubInfo, unsubChat);

    // Signal presence — broadcaster watches for this document
    const viewerRef = doc(db, 'live_streams', streamId, 'viewers', viewerIdRef.current);
    await setDoc(viewerRef, { joinedAt: Date.now(), userId: auth.currentUser?.uid || 'anonymous' });

    // Wait for broadcaster offer
    const offerRef = doc(db, 'live_streams', streamId, 'viewers', viewerIdRef.current, 'offer', 'data');
    const unsubOffer = onSnapshot(offerRef, async (snap) => {
      if (!snap.exists() || pcRef.current) return;
      await setupWebRTC(snap.data() as RTCSessionDescriptionInit);
    });

    unsubsRef.current.push(unsubOffer);
    setTimeout(() => {
      if (!connected) setConnecting(false);
    }, 8000);
  };

  const setupWebRTC = async (offer: RTCSessionDescriptionInit) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Receive remote stream
    pc.ontrack = (e) => {
      if (videoRef.current && e.streams[0]) {
        videoRef.current.srcObject = e.streams[0];
        videoRef.current.play().catch(() => {});
        setConnected(true);
        setConnecting(false);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnected(false);
      }
    };

    // ICE → Firestore
    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        await addDoc(
          collection(db, 'live_streams', streamId, 'viewers', viewerIdRef.current, 'viewer_candidates'),
          e.candidate.toJSON()
        );
      }
    };

    // Set remote description (offer from broadcaster)
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create and send answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await setDoc(
      doc(db, 'live_streams', streamId, 'viewers', viewerIdRef.current, 'answer', 'data'),
      { sdp: answer.sdp, type: answer.type }
    );

    // Receive broadcaster ICE candidates
    const unsubBroadcasterIce = onSnapshot(
      collection(db, 'live_streams', streamId, 'viewers', viewerIdRef.current, 'broadcaster_candidates'),
      (snap) => {
        snap.docChanges().forEach(async (c) => {
          if (c.type === 'added') {
            await pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit));
          }
        });
      }
    );

    unsubsRef.current.push(unsubBroadcasterIce);
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const user = auth.currentUser?.displayName || 'Viewer';
    await addDoc(collection(db, 'live_streams', streamId, 'chat'), {
      user, text: chatInput.trim(), ts: Date.now(),
    });
    setChatInput('');
  };

  const deleteDoc = (ref: any) => {
    const { deleteDoc: del } = require('firebase/firestore');
    return del(ref);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-[2rem] overflow-hidden flex flex-col lg:flex-row h-[85vh] shadow-2xl"
      >
        {/* Video */}
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 bg-black min-h-0">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />

            {/* Connecting overlay */}
            {connecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin mb-4" />
                <p className="text-sm font-black uppercase tracking-widest text-white/60">Connecting to stream...</p>
              </div>
            )}

            {!connecting && !connected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
                <WifiOff size={40} className="text-white/20" />
                <p className="text-sm font-black uppercase tracking-widest text-white/40">Stream Offline</p>
                <p className="text-[10px] text-white/20">The broadcast may have ended</p>
              </div>
            )}

            {/* Header overlay */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
              <div className="flex items-center gap-3">
                {connected && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white">Live</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-black text-white">{streamInfo?.title || title}</p>
                  <p className="text-[9px] text-white/50">{streamInfo?.ownerName || ownerName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {connected && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                    <Users size={11} className="text-white/50" />
                    <span className="text-[9px] font-black text-white/50">{streamInfo?.viewerCount || 1}</span>
                  </div>
                )}
                <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Like button */}
            {connected && (
              <button
                onClick={() => setLiked(v => !v)}
                className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
              >
                <Heart size={20} className={liked ? 'text-red-500 fill-red-500' : 'text-white/60'} />
              </button>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="w-full lg:w-72 flex flex-col bg-black/30 border-l border-white/8">
          <div className="p-4 border-b border-white/8 flex items-center gap-2">
            <MessageCircle size={14} className="text-orange-400" />
            <span className="text-sm font-black uppercase tracking-widest">Live Chat</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 gap-2">
                <MessageCircle size={24} />
                <p className="text-[9px] font-black uppercase tracking-widest text-center">No messages yet</p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-5 h-5 rounded-full bg-orange-400/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[7px] font-black text-orange-400">{msg.user[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-[7px] font-black uppercase tracking-wider text-orange-400">{msg.user}</span>
                    <p className="text-[11px] text-white/60">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChat} className="p-3 border-t border-white/8">
            <div className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Say something..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-3 pr-10 text-sm outline-none focus:border-white/30 transition-colors"
              />
              <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30">
                <Send size={13} />
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default LiveStreamViewer;
