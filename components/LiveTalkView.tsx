import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Users, Mic, MicOff, Settings, 
  X, Plus, Play, Pause, Music, Film, Book, 
  Send, ExternalLink, Share2, Globe, Heart,
  TrendingUp, Clock, User, LogOut, Radio,
  Shield, Volume2, List, Trash2
} from 'lucide-react';
import { LiveTalk, SharedAsset, ChatMessage } from '../types';
import { 
  auth, 
  createLiveTalk, 
  updateLiveTalk, 
  listenToLiveTalk, 
  joinLiveTalk, 
  leaveLiveTalk, 
  shareAssetToTalk,
  endLiveTalk,
  listenToMessages,
  sendMessage,
  listenToActiveLiveTalks,
  db
} from '../services/backendService';
import { collection, doc, setDoc, updateDoc, deleteDoc, query, where, arrayUnion } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useRtcSession } from '../hooks/useRtcSession';
import LanguageChannels from './LanguageChannels';
import { saveSessionRecording } from '../services/liveStreamService';
import { saveStudioEpisode } from '../services/podcastStudio/studioService';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Sub-component to play remote audio track
const RemoteAudioPlayer: React.FC<{ stream: MediaStream; muted?: boolean }> = ({ stream, muted }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={muted} style={{ display: 'none' }} />;
};

// Premium Speaker Avatar Component with real-time volume detection & pulsing halos
interface SpeakerAvatarProps {
  speaker: {
    uid: string;
    name: string;
    photoURL: string;
    isMuted: boolean;
  };
  stream: MediaStream | null;
  isHost: boolean;
  isCurrentUserHost: boolean;
  onToggleMute: (uid: string) => void;
}

const SpeakerAvatar: React.FC<SpeakerAvatarProps> = ({ speaker, stream, isHost, isCurrentUserHost, onToggleMute }) => {
  const [volume, setVolume] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || speaker.isMuted) {
      setVolume(0);
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength / 255;
        setVolume(average);

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.error("Error setting up speaker volume analysis:", e);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream, speaker.isMuted]);

  // Speaking threshold
  const isSpeaking = volume > 0.02;

  return (
    <div className="flex flex-col items-center gap-1 group relative">
       <div 
         className={`w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border transition-all duration-300 relative ${
           isSpeaking 
             ? 'ring-4 ring-[#00DAF3] shadow-[0_0_20px_rgba(0,218,243,0.6)] scale-105 border-transparent' 
             : 'ring-0 border-white/10 hover:border-white/20'
         }`}
       >
          <img 
            src={speaker.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${speaker.uid}`} 
            className="w-full h-full object-cover" 
            alt={speaker.name}
          />
          
          {/* Animated sound wave bars on bottom of avatar when speaking */}
          {isSpeaking && (
            <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 px-2 bg-black/60 py-0.5">
               <div className="w-0.5 h-3 bg-[#00DAF3] animate-[bounce_0.6s_infinite_alternate]" style={{ animationDelay: '0.1s' }} />
               <div className="w-0.5 h-4 bg-[#00DAF3] animate-[bounce_0.6s_infinite_alternate]" style={{ animationDelay: '0.3s' }} />
               <div className="w-0.5 h-2 bg-[#00DAF3] animate-[bounce_0.6s_infinite_alternate]" style={{ animationDelay: '0s' }} />
               <div className="w-0.5 h-3 bg-[#00DAF3] animate-[bounce_0.6s_infinite_alternate]" style={{ animationDelay: '0.2s' }} />
            </div>
          )}

          {/* Muted overlay */}
          {speaker.isMuted && (
             <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <MicOff size={16} className="text-red-500" />
             </div>
          )}
       </div>
       
       {/* Badge indicators */}
       <div className="absolute top-10 right-0 w-5 h-5 bg-black border border-white/10 rounded-full flex items-center justify-center shadow-md">
          {isHost ? (
             <Shield size={10} className="text-[#00DAF3]" />
          ) : (
             <User size={10} className="text-white/60" />
          )}
       </div>
       {isHost && (
          <span className="absolute -top-2 -left-1 px-1.5 py-0.5 bg-red-500 rounded text-[6px] font-black text-white uppercase tracking-wider shadow">Host</span>
       )}
       
       <p className="text-[9px] font-black uppercase text-center mt-1 text-white/50 truncate max-w-[64px]">{speaker.name}</p>

       {/* Host or Owner Controls */}
       {(isCurrentUserHost || speaker.uid === auth.currentUser?.uid) && (
         <div className="absolute -top-3 -right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button 
              onClick={() => onToggleMute(speaker.uid)} 
              className="p-1.5 bg-black border border-white/10 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform"
            >
               {speaker.isMuted ? <MicOff size={10} className="text-red-500" /> : <Mic size={10} className="text-green-500" />}
            </button>
         </div>
       )}
    </div>
  );
};

interface LiveTalkViewProps {
  onBrowse: () => void;
  initialShowSetup?: boolean;
  initialTalkId?: string;
}

const LiveTalkView: React.FC<LiveTalkViewProps> = ({ onBrowse, initialShowSetup, initialTalkId }) => {
  const [activeTalk, setActiveTalk] = useState<LiveTalk | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState({ title: '', description: '', topic: '', category: 'Discussion' });
  const [activeTalks, setActiveTalks] = useState<LiveTalk[]>([]);
  
  // Trigger setup or auto-join from parent props
  useEffect(() => {
    if (initialShowSetup) {
      setShowSetup(true);
    }
  }, [initialShowSetup]);

  useEffect(() => {
    if (initialTalkId && activeTalks.length > 0) {
      const talk = activeTalks.find(t => t.id === initialTalkId);
      if (talk && (!activeTalk || activeTalk.id !== talk.id)) {
        joinLiveTalk(talk.id);
        setActiveTalk(talk);
      }
    }
  }, [initialTalkId, activeTalks]);

  const { currentTrack, currentVideo, currentAlbum, playTrack, playVideo } = useGlobalPlayerState();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Microphones state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [signalConfirmed, setSignalConfirmed] = useState(false);

  // Web Audio refs for setup test
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Real-time audio now runs on the unified rtcCore backbone ('stage' topology:
  // speakers publish, listeners subscribe — the Clubhouse/X-Spaces model).
  const [remoteStreams, setRemoteStreams] = useState<{ [speakerUid: string]: MediaStream }>({});
  const [langChannelActive, setLangChannelActive] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [talkTab, setTalkTab] = useState<'CHAT' | 'ASSETS'>('CHAT');
  const [raisedHands, setRaisedHands] = useState<string[]>([]);

  // Enumerate input devices on load
  const loadDevices = async () => {
    try {
      const deviceInfos = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = deviceInfos.filter(d => d.kind === 'audioinput');
      setDevices(audioDevices);
      if (audioDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioDevices[0].deviceId);
      }
    } catch (e) {
      console.error("Error enumerating devices:", e);
    }
  };

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, []);

  // Request permissions when setup opens
  useEffect(() => {
    if (showSetup) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach(track => track.stop());
          loadDevices();
        })
        .catch(err => console.error("Mic permissions request error:", err));
    }
  }, [showSetup]);

  // Handle active talks subscription
  useEffect(() => {
    const unsubscribe = listenToActiveLiveTalks(setActiveTalks);
    return () => unsubscribe();
  }, []);

  // Handle messages and live talk document updates
  useEffect(() => {
    if (activeTalk) {
      const roomId = `live_talk_${activeTalk.id}`;
      const unsubscribeMessages = listenToMessages(roomId, (msgs) => {
        setMessages(msgs);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      const unsubscribeTalk = listenToLiveTalk(activeTalk.id, (talk) => {
        setActiveTalk(talk);
        if (!talk.isActive) {
          setActiveTalk(null);
          cleanupAllConnections();
        }
      });
      return () => {
        unsubscribeMessages();
        unsubscribeTalk();
      };
    }
  }, [activeTalk?.id]);

  useEffect(() => {
    if (activeTalk && auth.currentUser) {
      setIsHost(activeTalk.hostId === auth.currentUser.uid);
      setRaisedHands((activeTalk as any).raisedHands || []);
    } else {
      setIsHost(false);
      setRaisedHands([]);
    }
  }, [activeTalk, auth.currentUser]);

  // Clean up all connections on unmount
  useEffect(() => {
    return () => {
      cleanupAllConnections();
      stopMicTest();
    };
  }, []);

  // ── Real-time audio via the unified rtcCore backbone ('stage' topology) ──────
  // Speakers publish, listeners subscribe — the Clubhouse / X Spaces model.
  // Replaces ~220 lines of bespoke liveTalks signaling; raise-hand, host
  // controls, promotion and mute all stay app-level on the talk doc.
  const myUid = auth.currentUser?.uid;
  const amSpeaker = !!(myUid && activeTalk?.speakers?.some(sp => sp.uid === myUid));
  const amHost = !!(myUid && activeTalk?.hostId === myUid);
  const rtc = useRtcSession(
    activeTalk && myUid
      ? {
          sessionId: `talk_${activeTalk.id}`,
          topology: 'stage',
          role: amSpeaker ? (amHost ? 'host' : 'participant') : 'viewer',
          media: { audio: true, video: false },
          displayName: auth.currentUser?.displayName || 'Guest',
        }
      : null,
  );

  // Mirror backbone streams into the existing render shapes.
  useEffect(() => {
    const obj: { [uid: string]: MediaStream } = {};
    rtc.remoteStreams.forEach((stream, id) => { obj[id] = stream; });
    setRemoteStreams(obj);
  }, [rtc.remoteStreams]);
  useEffect(() => { localStreamRef.current = rtc.localStream; }, [rtc.localStream]);

  // Promotion (listener → speaker) flips my role, which re-keys the session and
  // makes me start publishing — no extra wiring needed. Doc-driven mute just
  // toggles the live mic track.
  useEffect(() => {
    if (!myUid || !amSpeaker) return;
    const rec = activeTalk?.speakers?.find(sp => sp.uid === myUid);
    if (rec) rtc.setAudio(!rec.isMuted);
  }, [activeTalk?.speakers, amSpeaker, myUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the mic can't be captured, auto-mute in the doc.
  useEffect(() => {
    if (rtc.error && amSpeaker && myUid) {
      const rec = activeTalk?.speakers?.find(sp => sp.uid === myUid);
      if (rec && !rec.isMuted) toggleMuteSpeaker(myUid);
    }
  }, [rtc.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // The hook tears down media + peers when activeTalk clears or this view
  // unmounts; kept as a thin shim for the existing call sites.
  const cleanupAllConnections = () => {
    rtc.leave();
    setRemoteStreams({});
  };

  // Mic test logic for Setup screen
  const startMicTest = async (deviceId: string) => {
    try {
      stopMicTest();

      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micTestStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioCtxRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsTestingMic(true);
      setSignalConfirmed(false);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barCount = 30;
        const barWidth = canvas.width / barCount;
        let total = 0;

        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.floor((i / barCount) * bufferLength);
          const val = dataArray[binIndex];
          total += val;

          const barHeight = (val / 255) * canvas.height * 0.95;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          gradient.addColorStop(0, '#6B0099'); // Purple
          gradient.addColorStop(0.5, '#FF007F'); // Pink
          gradient.addColorStop(1, '#00DAF3'); // Cyan

          ctx.fillStyle = gradient;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00DAF3';

          const y = canvas.height - barHeight - 2;
          const width = barWidth - 4;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(i * barWidth + 2, y, width, barHeight, 4);
          } else {
            ctx.rect(i * barWidth + 2, y, width, barHeight);
          }
          ctx.fill();
        }

        const average = total / barCount / 255;
        if (average > 0.08) {
          setSignalConfirmed(true);
        }

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      animationFrameRef.current = requestAnimationFrame(draw);
    } catch (err) {
      console.error("Failed to start mic test:", err);
    }
  };

  const stopMicTest = () => {
    setIsTestingMic(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach(track => track.stop());
      micTestStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  // Launch a talk session
  const handleCreateTalk = async () => {
    if (!setupData.title.trim()) return;
    stopMicTest();

    // Create the session
    const talk = await createLiveTalk(setupData);
    if (talk) {
      // Host immediately starts unmuted when they launch
      const newSpeakers = [{
        uid: auth.currentUser!.uid,
        name: auth.currentUser!.displayName || 'Host',
        photoURL: auth.currentUser!.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser!.uid}`,
        isMuted: false
      }];
      await updateLiveTalk(talk.id, { speakers: newSpeakers });
      setActiveTalk({ ...talk, speakers: newSpeakers });
      setShowSetup(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser || !activeTalk) return;
    const roomId = `live_talk_${activeTalk.id}`;
    await sendMessage(roomId, {
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName || 'Anonymous',
      senderPhoto: auth.currentUser.photoURL || '',
      text: inputText,
      type: 'TEXT'
    });
    setInputText('');
  };

  const handleShareCurrent = async () => {
    if (!activeTalk || !isHost) return;
    let asset: Partial<SharedAsset> | null = null;
    
    if (currentTrack) {
      asset = {
        type: 'MUSIC',
        title: currentTrack.title,
        url: currentTrack.url,
        mediaId: currentTrack.id
      };
    } else if (currentVideo) {
      asset = {
        type: 'VIDEO',
        title: currentVideo.title,
        url: currentVideo.url,
        mediaId: currentVideo.id
      };
    }

    if (asset) {
      await shareAssetToTalk(activeTalk.id, asset);
    }
  };

  const handleStartTalk = async () => {
    if (!activeTalk || !auth.currentUser) return;
    // Host goes live (unmuted)
    const newSpeakers = activeTalk.speakers.map(s => {
      if (s.uid === auth.currentUser?.uid) {
        return { ...s, isMuted: false };
      }
      return s;
    });
    await updateLiveTalk(activeTalk.id, { speakers: newSpeakers });
  };

  const handleStopTalk = async () => {
    if (!activeTalk || !auth.currentUser) return;
    // Host mutes themselves
    const newSpeakers = activeTalk.speakers.map(s => {
      if (s.uid === auth.currentUser?.uid) {
        return { ...s, isMuted: true };
      }
      return s;
    });
    await updateLiveTalk(activeTalk.id, { speakers: newSpeakers });
  };

  const toggleMuteSpeaker = async (uid: string) => {
    if (!activeTalk || !auth.currentUser) return;
    const isSelf = auth.currentUser.uid === uid;
    if (!isHost && !isSelf) return;

    const newSpeakers = activeTalk.speakers.map(s => {
      if (s.uid === uid) {
        return { ...s, isMuted: !s.isMuted };
      }
      return s;
    });
    await updateLiveTalk(activeTalk.id, { speakers: newSpeakers });
  };

  const handleRaiseHand = async () => {
    if (!activeTalk || !auth.currentUser) return;
    const newRaisedHands = [...raisedHands, auth.currentUser.uid];
    await updateLiveTalk(activeTalk.id, { raisedHands: newRaisedHands } as any);
  };

  const handleApproveHand = async (uid: string) => {
    if (!activeTalk || !isHost) return;
    const newRaisedHands = raisedHands.filter(id => id !== uid);
    const newSpeakers = [...(activeTalk.speakers), {
      uid: uid,
      name: 'Speaker',
      photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
      isMuted: false
    }];
    await updateLiveTalk(activeTalk.id, { raisedHands: newRaisedHands, speakers: newSpeakers as any } as any);
  };

  // Check roles
  const isUserSpeaker = activeTalk?.speakers.some(s => s.uid === auth.currentUser?.uid) || false;
  const userSpeakerObj = activeTalk?.speakers.find(s => s.uid === auth.currentUser?.uid);
  const isUserMuted = userSpeakerObj ? userSpeakerObj.isMuted : true;

  if (showSetup) {
    return (
      <div className="flex-1 flex flex-col p-8 space-y-8 bg-black/40 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
           <h3 className="text-2xl font-headline uppercase tracking-tight">Setup Talk</h3>
           <button onClick={() => { stopMicTest(); setShowSetup(false); }} className="p-2 hover:bg-white/5 rounded-full text-white/40"><X size={20} /></button>
        </div>

        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Talk Title</label>
              <input 
                type="text" 
                placeholder="The Future of Plajah..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all text-white"
                value={setupData.title}
                onChange={e => setSetupData({...setupData, title: e.target.value})}
              />
           </div>
           
           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Topic</label>
              <input 
                type="text" 
                placeholder="Tech, Philosophy, Music..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all text-white"
                value={setupData.topic}
                onChange={e => setSetupData({...setupData, topic: e.target.value})}
              />
           </div>

           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Category</label>
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all appearance-none text-white"
                value={setupData.category}
                onChange={e => setSetupData({...setupData, category: e.target.value})}
              >
                <option value="Discussion" className="bg-black">Discussion</option>
                <option value="Education" className="bg-black">Education</option>
                <option value="Entertainment" className="bg-black">Entertainment</option>
                <option value="Music" className="bg-black">Music</option>
                <option value="Q&A" className="bg-black">Q&A</option>
              </select>
           </div>

           {/* Audio Devices Dropdown */}
           <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Select Microphone</label>
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all appearance-none text-white"
                value={selectedDeviceId}
                onChange={e => {
                  setSelectedDeviceId(e.target.value);
                  if (isTestingMic) {
                    startMicTest(e.target.value);
                  }
                }}
              >
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-black">
                    {d.label || `Microphone (${d.deviceId.slice(0, 5)})`}
                  </option>
                ))}
                {devices.length === 0 && <option value="" className="bg-black">Default/System Microphone</option>}
              </select>
           </div>

           {/* Mic Audio Signal Test Panel */}
           <div className="space-y-4 p-5 bg-white/[0.02] border border-white/5 rounded-3xl">
              <div className="flex items-center justify-between">
                 <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Mic Audio Signal Test</span>
                 <button 
                   type="button"
                   onClick={() => {
                     if (isTestingMic) {
                       stopMicTest();
                     } else {
                       startMicTest(selectedDeviceId);
                     }
                   }}
                   className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                     isTestingMic 
                       ? 'bg-red-500/20 border border-red-500/30 text-red-500 hover:bg-red-500/30' 
                       : 'bg-[#00DAF3]/20 border border-[#00DAF3]/30 text-[#00DAF3] hover:bg-[#00DAF3]/30'
                   }`}
                 >
                   {isTestingMic ? 'Stop Test' : 'Test Mic'}
                 </button>
              </div>

              {/* Visualizer Canvas container */}
              <div className="relative h-16 w-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden flex items-center justify-center">
                 <canvas 
                   ref={canvasRef} 
                   className={`absolute inset-0 w-full h-full transition-all ${isTestingMic ? 'opacity-100' : 'opacity-0 h-0 pointer-events-none'}`} 
                   width={400} 
                   height={64} 
                 />
                 {!isTestingMic && (
                   <span className="text-[9px] font-black uppercase tracking-widest text-white/10 italic">Click Test Mic to see signal level</span>
                 )}
              </div>

              {/* Signal Confirmed Badge */}
              {signalConfirmed && (
                 <div className="flex items-center justify-center gap-2 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-[10px] font-black uppercase tracking-widest animate-pulse">
                    <Volume2 size={12} />
                    Signal Confirmed
                 </div>
              )}
           </div>
        </div>

        <button 
          onClick={handleCreateTalk}
          className="w-full py-5 aurora-bg rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-bloom hover:scale-[1.02] active:scale-[0.98] transition-all text-white"
        >
          Launch Broadcast
        </button>
      </div>
    );
  }

  if (activeTalk) {
    return (
      <div className="flex-1 flex flex-col h-full bg-black/40">
        {/* Dynamic, hidden receiver players for all active remote speaker streams */}
        {Object.entries(remoteStreams).map(([speakerUid, stream]) => (
          <RemoteAudioPlayer key={speakerUid} stream={stream} muted={langChannelActive} />
        ))}

        {/* Talk Header */}
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex flex-col gap-4">
          {/* On-device language channels — listen in your language */}
          <div className="px-1">
            <LanguageChannels getStreams={() => Object.values(remoteStreams)} onActiveChange={setLangChannelActive} />
          </div>
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Live Audio</span>
             </div>
             
             {/* Header Microphone / Mute controls for Host or Speakers */}
             {(isHost || isUserSpeaker) && (
               <div className="flex items-center gap-2">
                   <button 
                     onClick={() => toggleMuteSpeaker(auth.currentUser!.uid)}
                     className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all ${
                       isUserMuted 
                         ? 'bg-red-500/20 border-red-500/30 text-red-500 hover:bg-red-500/30' 
                         : 'bg-green-500/20 border border-green-500/30 text-green-500 hover:bg-green-500/30'
                     }`}
                   >
                      {isUserMuted ? 'Muted' : 'Unmuted'}
                   </button>

                   {/* Host: record the room → publishes as a podcast episode */}
                   {isHost && (
                     <button
                       onClick={async () => {
                         if (rtc.isRecording) {
                           const blob = await rtc.stopRecording();
                           if (blob) {
                             saveSessionRecording({ blob, title: `${activeTalk.title} — recording`, audioOnly: true });
                             if (auth.currentUser) saveStudioEpisode({ uid: auth.currentUser.uid, blob, title: activeTalk.title, durationMs: 0 }).catch(() => {});
                           }
                         } else {
                           rtc.startRecording({ audioOnly: true });
                         }
                       }}
                       title={rtc.isRecording ? 'Stop & save as podcast' : 'Record room'}
                       className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all ${
                         rtc.isRecording
                           ? 'bg-red-500/20 border-red-500/30 text-red-500 animate-pulse'
                           : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                       }`}
                     >
                       {rtc.isRecording ? '● Rec' : 'Record'}
                     </button>
                   )}

                   <select
                     value={selectedDeviceId} 
                     onChange={e => setSelectedDeviceId(e.target.value)} 
                     className="bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white outline-none focus:border-[#00DAF3]/50 transition-all max-w-[120px]"
                   >
                      {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Mic (${d.deviceId.slice(0, 5)})`}
                        </option>
                      ))}
                      {devices.length === 0 && <option value="">Default Microphone</option>}
                   </select>
               </div>
             )}
             
             <button 
               onClick={async () => {
                 if (isHost) {
                   if (window.confirm("End this Live Talk for everyone?")) {
                     // Auto-save the room as a podcast episode if it was recording.
                     if (rtc.isRecording) {
                       const blob = await rtc.stopRecording();
                       if (blob) {
                         saveSessionRecording({ blob, title: `${activeTalk.title} — recording`, audioOnly: true });
                         if (auth.currentUser) saveStudioEpisode({ uid: auth.currentUser.uid, blob, title: activeTalk.title, durationMs: 0 }).catch(() => {});
                       }
                     }
                     cleanupAllConnections();
                     await endLiveTalk(activeTalk.id);
                   }
                 } else {
                   cleanupAllConnections();
                   await leaveLiveTalk(activeTalk.id);
                   setActiveTalk(null);
                 }
               }} 
               className="p-2 hover:bg-white/5 rounded-full text-white/40 transition-colors"
             >
               <X size={16} />
             </button>
          </div>
          
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white mb-1">{activeTalk.title}</h3>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.1em]">Topic: {activeTalk.topic} • {activeTalk.category}</p>
          </div>
        </div>

        {/* Participation Panel */}
        <div className="p-6 flex flex-col gap-6 border-b border-white/5 bg-black/20 overflow-y-auto max-h-[320px]">
           {/* Speaker List */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00DAF3]">Speakers</h4>
                 <span className="text-[10px] font-black font-mono text-white/20">{activeTalk.speakers.length}</span>
              </div>
              
              <div className="flex flex-wrap gap-4">
                 {activeTalk.speakers.map(speaker => {
                   const isSpeakerHost = speaker.uid === activeTalk.hostId;
                   const stream = speaker.uid === auth.currentUser?.uid 
                     ? localStreamRef.current 
                     : (remoteStreams[speaker.uid] || null);

                   return (
                     <SpeakerAvatar
                       key={speaker.uid}
                       speaker={speaker}
                       stream={stream}
                       isHost={isSpeakerHost}
                       isCurrentUserHost={isHost}
                       onToggleMute={toggleMuteSpeaker}
                     />
                   );
                 })}
              </div>
           </div>

           {/* Host-only Raised Hands Queue */}
           {isHost && raisedHands.length > 0 && (
             <div className="space-y-4 p-4 bg-[#00DAF3]/5 border border-[#00DAF3]/20 rounded-3xl animate-pulse">
                <div className="flex items-center justify-between">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00DAF3]">Raised Hands Queue</h4>
                   <span className="text-[10px] font-black font-mono text-[#00DAF3]">{raisedHands.length}</span>
                </div>
                <div className="flex flex-wrap gap-4">
                   {raisedHands.map(uid => (
                      <div key={uid} className="flex items-center gap-3 bg-black/40 border border-white/5 p-2 rounded-2xl">
                         <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-8 h-8 rounded-xl" alt="" />
                         <button 
                           onClick={() => handleApproveHand(uid)}
                           className="px-2.5 py-1 bg-[#00DAF3] text-black text-[8px] font-black rounded-lg hover:scale-105 transition-transform uppercase tracking-wider"
                         >
                           Approve
                         </button>
                      </div>
                   ))}
                </div>
             </div>
           )}

           {/* Listener List */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Listeners</h4>
                 {!isHost && !activeTalk.speakers.find(s => s.uid === auth.currentUser?.uid) && (
                   <button 
                     onClick={handleRaiseHand} 
                     className="px-2.5 py-1 bg-[#00DAF3] text-black text-[8px] font-black rounded-lg hover:scale-105 transition-transform uppercase tracking-wider"
                   >
                     Raise Hand
                   </button>
                 )}
                 <span className="text-[10px] font-black font-mono text-white/20">{activeTalk.listeners.length}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                 {activeTalk.listeners.map(uid => (
                    <div key={uid} className="w-8 h-8 rounded-xl overflow-hidden bg-white/5 border border-white/5 shadow-sm opacity-60 hover:opacity-100 transition-opacity">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-full h-full" alt="" />
                    </div>
                 ))}
                 {activeTalk.listeners.length === 0 && <p className="text-[9px] font-bold uppercase tracking-widest text-white/10 italic">Waiting for audience...</p>}
              </div>
           </div>
        </div>

        {/* Live Chat & Shared Assets */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
           <div className="flex border-b border-white/5">
              <button 
                onClick={() => setTalkTab('CHAT')}
                className={`flex-1 py-3 text-[8px] font-black uppercase tracking-widest transition-all ${talkTab === 'CHAT' ? 'bg-white/5 text-white border-b-2 border-[#00DAF3]' : 'text-white/20 hover:text-white/40'}`}
              >
                Chat
              </button>
              <button 
                onClick={() => setTalkTab('ASSETS')}
                className={`flex-1 py-3 text-[8px] font-black uppercase tracking-widest transition-all ${talkTab === 'ASSETS' ? 'bg-white/5 text-white border-b-2 border-[#00DAF3]' : 'text-white/20 hover:text-white/40'}`}
              >
                Shared Assets ({activeTalk.sharedAssets.length})
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {talkTab === 'CHAT' ? (
                <>
                   {/* Pinned Shared media assets inside Chat */}
                   {activeTalk.sharedAssets.length > 0 && (
                     <div className="p-4 bg-[#00DAF3]/5 border border-[#00DAF3]/20 rounded-2xl mb-8 space-y-3">
                        <div className="flex items-center justify-between">
                           <span className="text-[8px] font-black uppercase tracking-widest text-[#00DAF3]">Live Playback Highlight</span>
                           <Music size={12} className="text-[#00DAF3]" />
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-black rounded-xl border border-white/10 flex items-center justify-center">
                              {activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1].type === 'MUSIC' ? <Music size={20} className="text-white/40" /> : <Film size={20} className="text-white/40" />}
                           </div>
                           <div className="flex-1 min-w-0">
                              <h5 className="text-[10px] font-black text-white truncate">{activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1].title}</h5>
                              <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Shared by Host</p>
                           </div>
                           <button 
                             onClick={() => {
                               const asset = activeTalk.sharedAssets[activeTalk.sharedAssets.length - 1];
                               if (asset.type === 'MUSIC' && asset.mediaId) playTrack({ id: asset.mediaId, title: asset.title, url: asset.url } as any, null, 'RADIO');
                               else if (asset.type === 'VIDEO' && asset.mediaId) playVideo({ id: asset.mediaId, title: asset.title, url: asset.url } as any);
                             }}
                             className="p-2 bg-white text-black rounded-lg hover:scale-105 transition-all animate-pulse"
                           >
                              <Play size={14} fill="black" />
                           </button>
                        </div>
                     </div>
                   )}

                   {messages.map((msg) => (
                     <div key={msg.id} className="flex gap-4">
                       <img 
                         src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} 
                         className="w-10 h-10 rounded-xl bg-white/5 border border-white/10" 
                         alt=""
                       />
                       <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#00DAF3]">{msg.senderName}</span>
                            <span className="text-[8px] font-mono text-white/10">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-sm text-white/70 leading-relaxed">{msg.text}</p>
                       </div>
                     </div>
                   ))}
                </>
              ) : (
                <div className="space-y-4">
                   {activeTalk.sharedAssets.slice().reverse().map((asset, idx) => (
                      <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4 group hover:bg-white/10 transition-all">
                         <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                            {asset.type === 'MUSIC' ? <Music size={16} className="text-white/40" /> : <Film size={16} className="text-white/40" />}
                         </div>
                         <div className="flex-1 min-w-0">
                            <h5 className="text-[10px] font-black text-white truncate">{asset.title}</h5>
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{asset.type} • {new Date(asset.timestamp).toLocaleTimeString()}</p>
                         </div>
                         <button 
                           onClick={() => {
                             if (asset.type === 'MUSIC' && asset.mediaId) playTrack({ id: asset.mediaId, title: asset.title, url: asset.url } as any, null, 'RADIO');
                             else if (asset.type === 'VIDEO' && asset.mediaId) playVideo({ id: asset.mediaId, title: asset.title, url: asset.url } as any);
                           }}
                           className="p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#00DAF3]"
                         >
                            <Play size={14} fill="currentColor" />
                         </button>
                      </div>
                   ))}
                   {activeTalk.sharedAssets.length === 0 && (
                     <div className="text-center py-12">
                        <List size={32} className="mx-auto mb-4 text-white/10" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No assets shared yet</p>
                     </div>
                   )}
                </div>
              )}
              <div ref={messagesEndRef} />
           </div>

           {/* Controls and Mute Toggles */}
           <div className="p-6 bg-black/40 border-t border-white/5 space-y-4">
              <div className="flex gap-2">
                 {/* Shared Media trigger (Host only) */}
                 {isHost && (
                    <button 
                      onClick={handleShareCurrent}
                      className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/10 flex items-center justify-center gap-2 transition-all"
                    >
                      <Share2 size={14} /> Share Media
                    </button>
                 )}

                 {/* Microphone mute quick toggler (Approved speakers and Host) */}
                 {isUserSpeaker && (
                    <button 
                      onClick={() => toggleMuteSpeaker(auth.currentUser!.uid)}
                      className={`flex-1 py-3 border rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                        isUserMuted 
                          ? 'bg-red-500/20 border-red-500/30 text-red-500 hover:bg-red-500/30' 
                          : 'bg-green-500/20 border border-green-500/30 text-green-500 hover:bg-green-500/30'
                      }`}
                    >
                      {isUserMuted ? <MicOff size={14} /> : <Mic size={14} />} 
                      {isUserMuted ? 'Unmute Mic' : 'Mute Mic'}
                    </button>
                 )}
              </div>
              
              <form onSubmit={handleSendMessage} className="relative">
                <input 
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Say something..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pr-14 text-sm outline-none focus:border-[#00DAF3]/50 transition-all shadow-inner text-white"
                />
                <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00DAF3] hover:scale-110 transition-transform">
                  <Send size={20} />
                </button>
              </form>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-black/40">
      <div className="p-12 text-center space-y-12">
        <div className="space-y-4">
          <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-bloom group hover:scale-110 transition-transform duration-500">
             <Mic size={40} className="text-primary group-hover:animate-pulse" />
          </div>
          <div>
            <h3 className="text-3xl font-headline uppercase tracking-tight">LiveTalk</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mt-2">Audio Only Social Space</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {activeTalks.length > 0 ? (
            <div className="space-y-4 text-left">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Now Streaming</span>
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">Live</span>
              </div>
              <div className="space-y-3">
                 {activeTalks.map(talk => (
                    <button 
                      key={talk.id}
                      onClick={() => {
                        joinLiveTalk(talk.id);
                        setActiveTalk(talk);
                      }}
                      className="w-full p-6 glass border border-white/5 rounded-3xl text-left hover:bg-white/10 transition-all group"
                    >
                       <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                             <img src={talk.hostPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${talk.hostId}`} className="w-8 h-8 rounded-lg shadow-lg" alt="" />
                             <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{talk.hostName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                             <Users size={12} className="text-white/20" />
                             <span className="text-[10px] font-black font-mono text-white/40">{(talk.listeners?.length || 0) + (talk.speakers?.length || 0)}</span>
                          </div>
                       </div>
                       <h5 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-[#00DAF3] transition-colors">{talk.title}</h5>
                       <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">Topic: {talk.topic}</p>
                    </button>
                 ))}
              </div>
            </div>
          ) : (
            <div className="py-12 glass border border-white/5 rounded-3xl opacity-40">
               <Radio size={32} className="mx-auto mb-4 text-white/20" />
               <p className="text-[10px] font-black uppercase tracking-widest">No active sessions</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
           <button 
             onClick={() => setShowSetup(true)}
             className="w-full py-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-primary hover:text-white transition-all"
           >
             Host a Talk
           </button>
           <button 
             onClick={onBrowse}
             className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] text-white/60 hover:bg-white/10"
           >
             Browse Archives
           </button>
        </div>
      </div>
    </div>
  );
};

export default LiveTalkView;
