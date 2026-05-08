import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  PhoneOff, 
  Users, 
  MessageSquare, 
  Settings, 
  Maximize2,
  MoreVertical,
  UserPlus,
  LayoutGrid,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoChatSession, ChatRoom } from '../types';
import { startVideoChat, joinVideoChat, auth } from '../services/backendService';

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

  useEffect(() => {
    // In a real app, we'd use WebRTC here. For this demo, we'll simulate the session.
    const initSession = async () => {
      const s = await startVideoChat(room.id);
      if (s) setSession(s);
    };
    initSession();
  }, [room.id]);

  const participants = session?.participants || [];

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

      {/* Video Grid */}
      <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
        <div className={`grid gap-6 h-full ${
          participants.length <= 1 ? 'grid-cols-1' :
          participants.length <= 2 ? 'grid-cols-2' :
          participants.length <= 4 ? 'grid-cols-2' :
          'grid-cols-3'
        }`}>
          {participants.map((p, i) => (
            <motion.div 
              key={p.uid}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-video bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden group shadow-2xl"
            >
              {/* Simulated Video Stream */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center">
                {p.isVideoOff ? (
                  <div className="w-24 h-24 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                    <Users size={48} className="text-white/20" />
                  </div>
                ) : (
                  <img 
                    src={`https://picsum.photos/seed/${p.uid}/800/450`} 
                    className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000" 
                    alt="" 
                  />
                )}
              </div>

              {/* Participant Info Overlay */}
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                <div className="flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">{p.displayName} {p.uid === user?.uid && '(You)'}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {p.isMuted && (
                    <div className="p-2 bg-red-500/20 rounded-lg border border-red-500/30">
                      <MicOff size={12} className="text-red-500" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Placeholder for empty slots */}
          {participants.length < 10 && Array.from({ length: Math.min(3, 10 - participants.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-video bg-white/5 border border-white/5 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center opacity-20">
              <UserPlus size={32} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Waiting for participants...</p>
            </div>
          ))}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="p-8 bg-gradient-to-t from-black to-transparent flex items-center justify-center gap-6">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className={`p-6 rounded-full transition-all hover:scale-110 ${isMuted ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        <button 
          onClick={() => setIsVideoOff(!isVideoOff)}
          className={`p-6 rounded-full transition-all hover:scale-110 ${isVideoOff ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
        >
          {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
        </button>

        <button 
          onClick={() => setIsSharingScreen(!isSharingScreen)}
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
