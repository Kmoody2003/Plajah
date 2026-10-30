// components/collab/CollabCall.tsx — the project's video call, docked beside the work.
//
// Same call as the platform's Chat app: it joins the team room's meeting session
// (chat_rooms/{room}/meeting_rtc/main) through rtcCore, so someone who taps "call" from Chat lands
// in the same call as people working in the editor. Pop out opens the full call screen.

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Maximize2, Mic, MicOff, MonitorUp, PhoneOff, Sparkles, Video, VideoOff } from 'lucide-react';
import { auth } from '../../services/firebase';
import LiveDocDock from '../live/LiveDocDock';
import { useRtcSession } from '../../hooks/useRtcSession';
import { useLiveFx } from '../../hooks/useLiveFx';
import { LevelMeter } from '../live/LevelMeter';
const LiveMediaSheet = lazy(() => import('../live/LiveMediaSheet'));
import { personColor } from '../../services/coedit/project';
import { initials } from './collabUi';

const Tile: React.FC<{ stream: MediaStream | null; name: string; uid: string; muted?: boolean; mirror?: boolean }> = ({ stream, name, uid, muted, mirror }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
  return (
    <div className="relative aspect-video rounded-[10px] overflow-hidden bg-black/60 border border-white/[0.06]">
      <video ref={ref} autoPlay playsInline muted={muted} className={`w-full h-full object-cover ${hasVideo ? '' : 'opacity-0'}`} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-black text-sm" style={{ background: personColor(uid) }}>
            {initials(name)}
          </span>
        </div>
      )}
      <span className="absolute left-1.5 bottom-1.5 text-[.58rem] font-bold text-white bg-black/55 px-1.5 py-0.5 rounded">{name}</span>
    </div>
  );
};

export const CollabCall: React.FC<{
  roomId: string;
  joined: boolean;
  onLeave: () => void;
  onPopOut: () => void;
  onParticipants?: (uids: string[]) => void;
}> = ({ roomId, joined, onLeave, onPopOut, onParticipants }) => {
  const me = auth.currentUser;
  const rtc = useRtcSession(
    joined
      ? {
          collectionName: `chat_rooms/${roomId}/meeting_rtc`,
          sessionId: 'main',
          topology: 'mesh',
          role: 'participant',
          media: { audio: true, video: true },
          displayName: me?.displayName || 'You',
        }
      : null
  );
  const fx = useLiveFx(rtc);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    onParticipants?.(joined ? [me?.uid ?? '', ...rtc.participants.map((p) => p.id)].filter(Boolean) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, rtc.participants]);

  if (!joined) return null;
  return (
    <div className="flex flex-col gap-2 p-2">
      {rtc.error && <div className="text-[.66rem] text-red-300">{rtc.error}</div>}
      <div className={`grid gap-1.5 ${rtc.remotePeers.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Tile stream={rtc.localStream} name="You" uid={me?.uid ?? 'me'} muted mirror />
        {rtc.remotePeers.map((p) => (
          <Tile key={p.peerId} stream={p.stream} name={p.name || 'Collaborator'} uid={p.peerId} />
        ))}
      </div>
      <LevelMeter source={rtc.localAudioTrack} size="sm" label="Mic" muted={!rtc.audioEnabled} />
      {sheet && (
        <Suspense fallback={null}>
          <LiveMediaSheet rtc={rtc} fx={fx} onClose={() => setSheet(false)} micMuted={!rtc.audioEnabled} className="w-full" />
        </Suspense>
      )}
      <div className="flex items-center justify-center gap-1.5">
        <CallBtn on={rtc.audioEnabled} onClick={rtc.toggleAudio} title={rtc.audioEnabled ? 'Mute' : 'Unmute'}>
          {rtc.audioEnabled ? <Mic size={14} /> : <MicOff size={14} />}
        </CallBtn>
        <CallBtn on={rtc.videoEnabled} onClick={rtc.toggleVideo} title={rtc.videoEnabled ? 'Camera off' : 'Camera on'}>
          {rtc.videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
        </CallBtn>
        <CallBtn on={!sheet && !fx.active} onClick={() => setSheet(v => !v)} title="Camera, mic & effects">
          <Sparkles size={14} />
        </CallBtn>
        <CallBtn on={!rtc.sharingScreen} onClick={rtc.toggleScreenShare} title="Share screen">
          <MonitorUp size={14} />
        </CallBtn>
        <CallBtn on onClick={onPopOut} title="Full call screen">
          <Maximize2 size={13} />
        </CallBtn>
        <button onClick={onLeave} title="Leave call" className="h-8 px-3 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center gap-1 text-[.66rem] font-bold">
          <PhoneOff size={13} /> Leave
        </button>
      </div>
      <LiveDocDock sessionKey={joined ? `call_${roomId}` : null} canPresent hostName={me?.displayName || 'You'} />
    </div>
  );
};

const CallBtn: React.FC<{ on: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ on, onClick, title, children }) => (
  <button onClick={onClick} title={title} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${on ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-black'}`}>
    {children}
  </button>
);
