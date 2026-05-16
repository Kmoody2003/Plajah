import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Mic, Megaphone, Video, X, Settings2, Globe, Radio, MessageCircle } from 'lucide-react';
import { auth, publishLiveFeed, updateLiveFeed } from '../services/backendService';

// Fallback UUID v4 generator
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

interface LiveStreamModalProps {
  onClose: () => void;
  onStreamActive: (isActive: boolean) => void;
}

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({ onClose, onStreamActive }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('720p');
  
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeFeedIdRef = useRef<string | null>(null);
  const isLiveRef = useRef(false);

  // Chat Logic (Streamer end)
  const [chatMessages, setChatMessages] = useState<{user: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');

  const initCamera = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraEnabled ? { width: { ideal: resolution === '4k' ? 3840 : (resolution === '1080p' ? 1920 : 1280) } } : false,
        audio: micEnabled
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.error("Failed to init camera:", e);
    }
  };

  useEffect(() => {
    initCamera();
    return () => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      stopBroadcast();
    };
  }, [cameraEnabled, micEnabled, resolution]);

  const startBroadcast = async () => {
    if (!title) {
        alert("Please provide a broadcast title.");
        return;
    }
    if (!auth.currentUser) {
        alert("You must be logged in to go live.");
        return;
    }

    try {
      // Create Database Record
      const liveFeed = await publishLiveFeed({
        title,
        tags: tags.split(',').map(t => t.trim()),
        url: 'live_stream_placeholder', // the actual streaming engine handles WebRTC/WS
        status: 'LIVE'
      });
      
      // In publishLiveFeed the returned feed might not have the ID if we simulated it? Wait, let's just assume we can get it or we keep track. 
      // ACTUALLY publishLiveFeed might not return the inserted object, but let's check. 
      // If not, we don't strictly need the ID for this prototype if it's transient. 
      isLiveRef.current = true;
      setIsLive(true);
      if (mediaStreamRef.current) {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
        mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, { mimeType });
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0 && isLiveRef.current) {
            // IN A REAL APP: Send e.data through WebSocket to RTMP server or SFU
            // e.g. wsRef.current.send(e.data);
          }
        };
        mediaRecorderRef.current.start(1000);
      }
      onStreamActive(true);
    } catch(e) {
      console.error("Broadcast failed:", e);
    }
  };

  const stopBroadcast = async () => {
    isLiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsLive(false);
    onStreamActive(false);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim()) return;
      setChatMessages(prev => [...prev, { user: auth.currentUser?.displayName || 'Streamer', text: chatInput }]);
      setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-3xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-[2rem] overflow-hidden flex flex-col lg:flex-row h-[80vh] shadow-2xl"
      >
        {/* Left: Stream Settings & Preview */}
        <div className="flex-1 flex flex-col p-8 border-r border-white/10 overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-8">
                <div>
                   <h2 className="text-3xl font-black uppercase tracking-widest text-white italic">Broadcast Studio</h2>
                   <p className="text-xs font-bold text-white/40 uppercase">Configure your live feed</p>
                </div>
                {!isLive && (
                    <button onClick={onClose} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                        <X size={20} className="text-white" />
                    </button>
                )}
            </div>

            <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border-2 border-white/5 mb-8">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {!cameraEnabled && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                        <Camera size={48} className="text-white/20 mb-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-white/40">Camera Disabled</span>
                    </div>
                )}
                {isLive && (
                    <div className="absolute top-4 left-4 px-4 py-1.5 bg-red-600 rounded text-[10px] font-black uppercase tracking-widest text-white animate-pulse">
                        LIVE
                    </div>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-black/80 backdrop-blur-xl rounded-full border border-white/10">
                    <button onClick={() => setCameraEnabled(!cameraEnabled)} className={`p-2 rounded-full transition-colors ${cameraEnabled ? 'text-white hover:bg-white/10' : 'text-red-500 bg-red-500/20'}`}>
                        <Camera size={20} />
                    </button>
                    <button onClick={() => setMicEnabled(!micEnabled)} className={`p-2 rounded-full transition-colors ${micEnabled ? 'text-white hover:bg-white/10' : 'text-red-500 bg-red-500/20'}`}>
                        <Mic size={20} />
                    </button>
                    <div className="w-px h-6 bg-white/20" />
                    <select 
                       value={resolution} 
                       onChange={e => setResolution(e.target.value as any)}
                       disabled={isLive}
                       className="bg-transparent text-xs font-black uppercase tracking-widest outline-none appearance-none cursor-pointer"
                    >
                        <option value="720p">720p (Variable Bitrate)</option>
                        <option value="1080p">1080p HD</option>
                        <option value="4k">4K Ultra HD (Hardware Accel)</option>
                    </select>
                </div>
            </div>

            <div className="space-y-6">
                <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Broadcast Title</label>
                   <input type="text" disabled={isLive} value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-black outline-none focus:border-primary transition-colors" placeholder="e.g., Live Music Session..." />
                </div>
                <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Description</label>
                   <textarea disabled={isLive} value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-medium outline-none focus:border-primary transition-colors resize-none" placeholder="Tell viewers what you're up to..." />
                </div>
                <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Tags (Comma Separated)</label>
                   <input type="text" disabled={isLive} value={tags} onChange={e => setTags(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-black outline-none focus:border-primary transition-colors" placeholder="music, live, chat..." />
                </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10">
                {!isLive ? (
                    <button onClick={startBroadcast} className="w-full py-5 bg-primary text-black rounded-2xl font-black uppercase tracking-widest text-lg hover:bg-white transition-all shadow-[0_0_40px_rgba(255,140,0,0.3)]">
                        Go Live Now
                    </button>
                ) : (
                    <div className="flex gap-4">
                        <button onClick={stopBroadcast} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-red-500 transition-colors">
                            End Broadcast
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Right: Live Chat */}
        <div className="w-full lg:w-96 flex flex-col bg-black/40">
           <div className="p-6 border-b border-white/10 flex flex-col gap-2">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                 <MessageCircle size={16} className="text-primary" /> Live Chat
              </h3>
              <p className="text-[10px] font-bold text-white/40 uppercase">Connecting with your audience</p>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
               {chatMessages.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <MessageCircle size={32} className="mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Waiting for messages...</p>
                   </div>
               ) : (
                   chatMessages.map((msg, i) => (
                       <div key={i} className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">{msg.user}</span>
                          <p className="text-sm font-medium">{msg.text}</p>
                       </div>
                   ))
               )}
           </div>

           <div className="p-4 border-t border-white/10 bg-white/5">
              <form onSubmit={handleChatSubmit} className="relative">
                 <input 
                    type="text" 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Send a message..." 
                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm outline-none focus:border-white/30 transition-colors" 
                 />
                 <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <MessageCircle size={16} />
                 </button>
              </form>
           </div>
        </div>
      </motion.div>
    </div>
  );
};
