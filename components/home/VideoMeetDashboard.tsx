import React, { useState } from 'react';
import { Video, Mic, MicOff, Monitor, PhoneOff, PhoneCall, Volume2, ShieldCheck, User } from 'lucide-react';
import { Button } from '../ui';

export const VideoMeetDashboard: React.FC = () => {
  const [isInCall, setIsInCall] = useState<boolean>(true);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCamOff, setIsCamOff] = useState<boolean>(false);
  const [activeRoom, setActiveRoom] = useState<string>('Living Room Hub (Xbox One)');

  const roomTargets = [
    { id: 'living', name: 'Living Room TV', device: 'Xbox One P2P', status: 'Ready to Call' },
    { id: 'office', name: "Dad's Office Rig", device: 'Windows Workstation', status: 'Ready to Call' },
    { id: 'kitchen', name: 'Kitchen Wall Hub', device: 'Android Tablet', status: 'Ready to Call' },
    { id: 'mobile', name: "Kenny's Phone", device: 'Mobile Push', status: 'Mobile Ready' },
  ];

  return (
    <div className="rounded-[32px] p-8 flex flex-col gap-6 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <span className="text-xs font-mono text-[#00DAF3] uppercase font-bold">
            Matter & WebRTC Calling Engine
          </span>
          <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white">
            Smart Home Video Calling Dashboard
          </h3>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-mono bg-[#06D6A0]/20 border border-[#06D6A0]/40 text-[#06D6A0] font-bold w-fit">
          1080p60 Low-Latency P2P
        </span>
      </div>

      {/* Main Video Call Stage */}
      {isInCall ? (
        <div className="relative w-full h-80 sm:h-96 rounded-3xl bg-black/80 border border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
          {/* Remote Video Background Canvas */}
          <img
            src="/home/art_earth.png"
            alt="Remote Call"
            className="absolute inset-0 w-full h-full object-cover opacity-65 filter blur-[1px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />

          {/* Remote Node Indicator */}
          <div className="relative z-10 flex flex-col items-center text-center p-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#6B0099] to-[#00DAF3] flex items-center justify-center mb-2 shadow-2xl">
              <User className="w-8 h-8 text-white" />
            </div>
            <h4 className="text-lg font-bold text-white font-['Outfit']">{activeRoom}</h4>
            <span className="text-xs font-mono text-[#06D6A0]">
              Connected ● 18ms Latency ● Opus Audio 48kHz
            </span>
          </div>

          {/* PICTURE-IN-PICTURE (PiP) REAL KENNY MOODY CAMERA */}
          <div className="absolute top-4 right-4 z-20 w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-[#FF8C00] shadow-2xl bg-black">
            <img
              src="/home/kmoody_avatar.png"
              alt="Kenny Self View"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 left-1 font-mono text-[9px] bg-black/80 px-1.5 py-0.5 rounded text-white border border-white/10">
              Kenny (Host)
            </div>
          </div>

          {/* Floating Call Controls Toolbar */}
          <div className="absolute bottom-4 z-20 flex items-center gap-3 bg-black/75 px-6 py-2.5 rounded-2xl border border-white/15 backdrop-blur-xl shadow-2xl">
            <button
              onClick={() => setIsMicMuted(!isMicMuted)}
              className={`p-2.5 rounded-xl transition ${
                isMicMuted ? 'bg-[#EF4444] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsCamOff(!isCamOff)}
              className={`p-2.5 rounded-xl transition ${
                isCamOff ? 'bg-[#EF4444] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title={isCamOff ? 'Turn Camera On' : 'Turn Camera Off'}
            >
              <Video className="w-4 h-4" />
            </button>

            <button
              onClick={() => alert('Screen beam initiated over WebRTC DataChannel')}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              title="Share Screen"
            >
              <Monitor className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsInCall(false)}
              className="px-4 py-2 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white font-mono font-bold text-xs transition active:scale-95 shadow-lg"
            >
              End Call
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-black/40 border border-white/10 flex flex-col items-center justify-center text-center gap-4 py-16">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/50">
            <PhoneCall className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white">Call Disconnected</h4>
            <p className="text-xs font-mono text-white/50 mt-1">Select a family device or room below to start a video session.</p>
          </div>
          <Button variant="accent" size="sm" onClick={() => setIsInCall(true)}>
            Rejoin Last Room
          </Button>
        </div>
      )}

      {/* Quick Room Call Launcher Grid */}
      <div>
        <span className="text-xs font-mono text-white/50 uppercase block mb-3">
          Available Smart Home Video Nodes:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {roomTargets.map((target) => (
            <div
              key={target.id}
              onClick={() => {
                setActiveRoom(target.name);
                setIsInCall(true);
              }}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#00DAF3] transition flex flex-col justify-between gap-3 cursor-pointer group"
            >
              <div>
                <h5 className="text-sm font-bold text-white group-hover:text-[#00DAF3] transition">
                  {target.name}
                </h5>
                <span className="text-[10px] font-mono text-[#06D6A0]">● {target.status}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-white/40 pt-2 border-t border-white/5">
                <span>{target.device}</span>
                <PhoneCall className="w-3.5 h-3.5 text-[#00DAF3]" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default VideoMeetDashboard;
