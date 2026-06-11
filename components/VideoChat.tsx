import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff, Users,
  MessageSquare, Settings, UserPlus, LayoutGrid, Monitor,
  Wifi, WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoChatSession, ChatRoom } from '../types';
import { startVideoChat, auth } from '../services/backendService';
import { db } from '../services/firebase';
import { doc, setDoc, updateDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface VideoChatProps {
  room: ChatRoom;
  onClose: () => void;
  user: any;
}

const VideoChat: React.FC<VideoChatProps> = ({ room, onClose, user }) => {
  const [session, setSession] = useState<VideoChatSession | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [layout, setLayout] = useState<'GRID' | 'SPEAKER'>('GRID');
  const [camError, setCamError] = useState<string | null>(null);
  const [peerState, setPeerState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamReady = useRef(false);

  // ── Attach remote stream to video element ───────────────────────────────────
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ── Local camera ────────────────────────────────────────────────────────────
  useEffect(() => {
    startVideoChat(room.id).then(s => { if (s) setSession(s); });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        localStreamReady.current = true;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(err => setCamError(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera unavailable'));

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
    };
  }, [room.id]);

  // ── WebRTC signaling via Firestore ──────────────────────────────────────────
  useEffect(() => {
    if (room.type !== 'PRIVATE') return; // only 1:1 calls use WebRTC
    const myUid = auth.currentUser?.uid;
    const otherUid = room.participants.find(p => p !== myUid);
    if (!myUid || !otherUid) return;

    const callRef  = doc(db, 'chatRooms', room.id, 'videoCall', 'session');
    const callerCol = collection(db, 'chatRooms', room.id, 'videoCall', 'session', 'callerCandidates');
    const calleeCol = collection(db, 'chatRooms', room.id, 'videoCall', 'session', 'calleeCandidates');
    const isInitiator = myUid < otherUid; // deterministic — lower UID always initiates
    const subs: (() => void)[] = [];

    const waitForStream = (cb: () => void, retries = 20) => {
      if (localStreamRef.current) { cb(); return; }
      if (retries <= 0) return;
      setTimeout(() => waitForStream(cb, retries - 1), 200);
    };

    waitForStream(async () => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      setPeerState('connecting');

      localStreamRef.current!.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

      pc.ontrack = e => { if (e.streams[0]) setRemoteStream(e.streams[0]); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setPeerState('connected');
        if (pc.connectionState === 'failed') setPeerState('failed');
      };

      if (isInitiator) {
        pc.onicecandidate = e => { if (e.candidate) addDoc(callerCol, e.candidate.toJSON()); };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });

        // Wait for answer
        subs.push(onSnapshot(callRef, snap => {
          const d = snap.data();
          if (d?.answer && !pc.currentRemoteDescription) {
            pc.setRemoteDescription(new RTCSessionDescription(d.answer));
          }
        }));
        // Callee ICE candidates
        subs.push(onSnapshot(calleeCol, snap => {
          snap.docChanges().forEach(ch => {
            if (ch.type === 'added') pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
          });
        }));
      } else {
        pc.onicecandidate = e => { if (e.candidate) addDoc(calleeCol, e.candidate.toJSON()); };
        // Wait for offer then answer
        subs.push(onSnapshot(callRef, async snap => {
          const d = snap.data();
          if (d?.offer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } });
          }
        }));
        // Caller ICE candidates
        subs.push(onSnapshot(callerCol, snap => {
          snap.docChanges().forEach(ch => {
            if (ch.type === 'added') pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
          });
        }));
      }
    });

    return () => {
      subs.forEach(u => u());
      pcRef.current?.close();
      // Clean up signaling docs on hang-up
      deleteDoc(callRef).catch(() => {});
    };
  }, [room.id, room.type, room.participants]);

  const toggleMute = () => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) { audio.enabled = isMuted; setIsMuted(m => !m); }
  };

  const toggleVideo = () => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) { video.enabled = isVideoOff; setIsVideoOff(v => !v); }
  };

  const shareScreen = async () => {
    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      setIsSharingScreen(true);
      screenStream.getVideoTracks()[0].onended = () => {
        if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setIsSharingScreen(false);
      };
    } catch { /* user cancelled */ }
  };

  const participants = session?.participants || [];
  const remoteParticipants = participants.filter(p => p.uid !== user?.uid);

  return (
    <div className="fixed inset-0 z-[500] bg-[#050505] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/20 rounded-2xl">
            <Video className="text-red-500" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tightest leading-none">{room.name}</h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Live Video Session • {participants.length}/10 Participants</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white">
            <UserPlus size={20} />
          </button>
          <button 
            onClick={() => setLayout(layout === 'GRID' ? 'SPEAKER' : 'GRID')}
            className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"
          >
            <LayoutGrid size={20} />
          </button>
          <button className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Connection status banner */}
      {room.type === 'PRIVATE' && peerState !== 'idle' && (
        <div className={`shrink-0 flex items-center justify-center gap-2 py-1.5 text-[9px] font-black uppercase tracking-widest ${
          peerState === 'connected' ? 'bg-green-500/15 text-green-400' :
          peerState === 'failed'    ? 'bg-red-500/15 text-red-400' :
          'bg-white/5 text-white/40'
        }`}>
          {peerState === 'connected' ? <Wifi size={11} /> : peerState === 'failed' ? <WifiOff size={11} /> : <div className="w-3 h-3 border border-current rounded-full animate-spin border-t-transparent" />}
          {peerState === 'connected' ? 'Connected' : peerState === 'failed' ? 'Connection failed — check network' : 'Connecting peer…'}
        </div>
      )}

      {/* Video Grid */}
      <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
        <div className={`grid gap-6 h-full ${remoteStream ? 'grid-cols-2' : 'grid-cols-1'}`}>

          {/* Local tile */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {isVideoOff ? (
                <div className="w-24 h-24 rounded-full bg-white/10 border border-white/10 flex items-center justify-center"><VideoOff size={36} className="text-white/20" /></div>
              ) : (
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              )}
            </div>
            <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest">
              You {isMuted && <MicOff size={9} className="inline ml-1 text-red-400" />}
            </div>
          </motion.div>

          {/* Remote tile — real WebRTC stream */}
          {remoteStream ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-video bg-black border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest">{remoteParticipants[0]?.displayName || 'Remote'}</span>
              </div>
            </motion.div>
          ) : peerState === 'connecting' ? (
            <div className="aspect-video bg-white/5 border border-white/5 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Waiting for other person…</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="p-8 bg-gradient-to-t from-black to-transparent flex items-center justify-center gap-6">
        {camError && (
          <p className="absolute bottom-32 text-[9px] font-black uppercase tracking-widest text-red-400 bg-black/70 px-3 py-1.5 rounded-full">{camError}</p>
        )}
        <button
          onClick={toggleMute}
          className={`p-6 rounded-full transition-all hover:scale-110 ${isMuted ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-6 rounded-full transition-all hover:scale-110 ${isVideoOff ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
        >
          {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
        </button>

        <button
          onClick={shareScreen}
          className={`p-6 rounded-full transition-all hover:scale-110 ${isSharingScreen ? 'bg-small-orange text-white shadow-[0_0_30px_rgba(255,140,0,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
        >
          <Monitor size={24} />
        </button>

        <button 
          onClick={onClose}
          className="p-6 bg-red-600 text-white rounded-full hover:scale-110 transition-all shadow-[0_0_50px_rgba(220,38,38,0.4)]"
        >
          <PhoneOff size={24} />
        </button>

        <button className="p-6 bg-white/10 text-white/60 rounded-full hover:bg-white/20 transition-all hover:scale-110">
          <MessageSquare size={24} />
        </button>
      </div>
    </div>
  );
};

export default VideoChat;
