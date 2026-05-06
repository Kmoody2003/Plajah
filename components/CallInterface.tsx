import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, X, Mic, MicOff, VideoOff, PhoneOff, User, Maximize2, Minimize2, Sparkles, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CallSession, UserProfile } from '../types';
import { updateCallStatus, fetchUserProfile, auth } from '../services/backendService';

interface CallInterfaceProps {
  call: CallSession;
  onEnd: () => void;
}

const CallInterface: React.FC<CallInterfaceProps> = ({ call, onEnd }) => {
  const [status, setStatus] = useState<CallSession['status']>(call.status);
  const [remoteUser, setRemoteUser] = useState<UserProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callTime, setCallTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const uid = call.callerId === auth.currentUser?.uid ? call.receiverId : call.callerId;
      const profile = await fetchUserProfile(uid);
      setRemoteUser(profile);
    };
    loadUser();

    if (call.type === 'VIDEO') {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        })
        .catch(err => console.error("Error accessing camera:", err));
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [call]);

  useEffect(() => {
    if (status === 'CONNECTED') {
      timerRef.current = setInterval(() => {
        setCallTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [status]);

  const handleAccept = async () => {
    await updateCallStatus(call.id, 'CONNECTED');
    setStatus('CONNECTED');
  };

  const handleDecline = async () => {
    await updateCallStatus(call.id, 'ENDED');
    onEnd();
  };

  const handleEnd = async () => {
    await updateCallStatus(call.id, 'ENDED');
    onEnd();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[500] flex flex-col items-center justify-center p-6 lg:p-12">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-small-orange/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#6B0099]/10 rounded-full blur-[120px] delay-700" />
      </div>

      <div className="relative w-full max-w-4xl aspect-video bg-white/5 rounded-[3rem] border border-white/10 overflow-hidden shadow-3xl flex flex-col">
        {/* Call Content */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {call.type === 'VIDEO' ? (
            <>
              {/* Remote Video (Simulated) */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                {remoteUser ? (
                  <div className="text-center">
                    <div className="w-32 h-32 rounded-full border-4 border-white/10 overflow-hidden mx-auto mb-6 shadow-2xl">
                      <img src={remoteUser.photoURL || null} alt={remoteUser.displayName} className="w-full h-full object-cover grayscale opacity-40" />
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tightest text-white/40">Waiting for {remoteUser.displayName}...</h2>
                  </div>
                ) : (
                  <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              
              {/* Local Video Preview */}
              <div className="absolute bottom-8 right-8 w-64 aspect-video bg-black rounded-2xl border border-white/20 overflow-hidden shadow-2xl z-10">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <VideoOff size={24} className="text-white/20" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="relative mb-12">
                <div className="absolute inset-0 bg-small-orange/20 rounded-full blur-3xl" />
                <div className="w-48 h-48 rounded-full border-4 border-white/10 overflow-hidden mx-auto relative shadow-3xl">
                  <img src={remoteUser?.photoURL || 'https://picsum.photos/seed/user/400/400'} alt="User" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-small-orange rounded-full shadow-xl">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Audio Call</span>
                </div>
              </div>
              <h2 className="text-4xl font-black uppercase tracking-tightest mb-2">{remoteUser?.displayName || 'Connecting...'}</h2>
              <p className="text-small-orange font-bold uppercase tracking-[0.3em] text-xs">
                {status === 'RINGING' ? 'Incoming Call...' : formatTime(callTime)}
              </p>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="p-10 bg-black/40 backdrop-blur-xl border-t border-white/5 flex items-center justify-center gap-6">
          {status === 'RINGING' ? (
            <>
              <button 
                onClick={handleDecline}
                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-all shadow-xl group"
              >
                <PhoneOff size={32} className="text-white group-hover:rotate-12 transition-transform" />
              </button>
              <button 
                onClick={handleAccept}
                className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-all shadow-xl group animate-bounce"
              >
                <Phone size={40} className="text-white group-hover:rotate-12 transition-transform" />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border ${isMuted ? 'bg-red-500 border-red-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              
              {call.type === 'VIDEO' && (
                <button 
                  onClick={() => setIsVideoOff(!isVideoOff)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border ${isVideoOff ? 'bg-red-500 border-red-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>
              )}

              <button 
                onClick={handleEnd}
                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-all shadow-xl group"
              >
                <PhoneOff size={32} className="text-white group-hover:rotate-12 transition-transform" />
              </button>

              <button className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10 transition-all">
                <Volume2 size={24} />
              </button>
              
              <button className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10 transition-all">
                <Sparkles size={24} className="text-small-orange" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="mt-12 flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-white/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>Secure P2P Encryption</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-small-orange rounded-full" />
          <span>Plajah HD Audio</span>
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
