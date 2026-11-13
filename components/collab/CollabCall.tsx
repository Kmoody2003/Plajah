// components/collab/CollabCall.tsx — the project's video call, docked beside the work.
//
// Same call as the platform's Chat app: it joins the team room's meeting session
// (chat_rooms/{room}/meeting_rtc/main) through rtcCore, so someone who taps "call" from Chat lands
// in the same call as people working in the editor. Pop out opens the full call screen.

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Captions, Maximize2, Mic, MicOff, MonitorUp, PhoneOff, Sparkles, Video, VideoOff } from 'lucide-react';
import { auth } from '../../services/firebase';
import LiveDocDock from '../live/LiveDocDock';
import { useRtcSession } from '../../hooks/useRtcSession';
import { useLiveFx } from '../../hooks/useLiveFx';
import { LevelMeter } from '../live/LevelMeter';
const LiveMediaSheet = lazy(() => import('../live/LiveMediaSheet'));
import { personColor } from '../../services/coedit/project';
import { initials } from './collabUi';
import { useMeetingCaptions, type LiveCaption } from '../../hooks/useMeetingCaptions';
import { useAriaMeeting, type AriaNotesSink } from '../../hooks/useAriaMeeting';
import { parsePresence, type AriaLane, type AriaPresence } from '../../services/meetings/ariaMeetingCore';
import { AriaMeetingPanel } from './AriaMeetingPanel';

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
  /** The editor offers a notes page for Aria (Tela); without it Aria can still be heard, not brought in. */
  ariaSink?: AriaNotesSink | null;
}> = ({ roomId, joined, onLeave, onPopOut, onParticipants, ariaSink }) => {
  const me = auth.currentUser;
  // Data channel: captions from others, and Aria's presence announced by whoever brought her in.
  const captionsRef = useRef<((peer: string, payload: any) => void) | null>(null);
  const [remoteAria, setRemoteAria] = useState<AriaPresence | null>(null);
  const onData = useCallback((peer: string, msg: { type: string; payload?: any }) => {
    if (msg.type === 'caption') captionsRef.current?.(peer, msg.payload);
    else if (msg.type === 'aria') {
      const p = parsePresence(msg.payload);
      if (p) setRemoteAria(p.on ? { ...p, startedAt: Date.now() } : null);
    }
  }, []);
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
      : null,
    { autoJoin: true, onData }
  );
  const fx = useLiveFx(rtc);
  const [sheet, setSheet] = useState(false);

  // ── Aria (phase 1: live notes) ─────────────────────────────────────────────
  const aria = useAriaMeeting({ sink: ariaSink, roomId });
  const ariaRef = useRef(aria); ariaRef.current = aria;
  const [keepMeOut, setKeepMeOut] = useState(false);
  const [localLane, setLocalLane] = useState<{ available: boolean; model?: string }>({ available: false });
  const [cloudHourUsd, setCloudHourUsd] = useState<number | null>(null);
  useEffect(() => {
    if (!joined || !ariaSink) return;
    void import('../../services/meetings/ariaMeeting').then(async m => {
      setCloudHourUsd(m.ariaCloudHourUsd());
      const l = await m.ariaLanes();
      setLocalLane({ available: l.local, model: l.localModel });
    });
  }, [joined, !!ariaSink]);
  // A remote Aria goes quiet if her host left without saying so (announcements stop).
  useEffect(() => {
    if (!remoteAria) return;
    const t = window.setTimeout(() => setRemoteAria(null), 35_000);
    return () => window.clearTimeout(t);
  }, [remoteAria]);
  const ariaHere = aria.active || !!remoteAria?.on;
  const nameFor = (peer: string) => rtc.remotePeers.find(p => p.peerId === peer)?.name || 'Collaborator';
  const captions = useMeetingCaptions({
    roomId, selfId: me?.uid, selfName: me?.displayName || 'You',
    localStream: rtc.localStream, sendData: rtc.sendData,
    recording: null, optOut: false,
    forceTranscribe: ariaHere && !keepMeOut && rtc.audioEnabled,
    noAria: keepMeOut,
    onFinal: (c: LiveCaption) => { if (!c.noAria) ariaRef.current.feed({ uid: c.uid, name: c.name, text: c.text, at: c.at }); },
  });
  captionsRef.current = (peer, payload) => captions.receive(peer, nameFor(peer), payload);
  // While Aria runs here, announce her (and repeat, so people who join later see her too).
  useEffect(() => {
    if (!aria.active || !me) return;
    const presence = { on: true, hostUid: me.uid, hostName: me.displayName || 'Host', lane: aria.lane, startedAt: Date.now() };
    rtc.sendData('aria', presence);
    const t = window.setInterval(() => rtc.sendData('aria', presence), 10_000);
    return () => { window.clearInterval(t); rtc.sendData('aria', { ...presence, on: false }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aria.active, aria.lane, rtc.remotePeers.length]);
  const bringAria = (lane: AriaLane) => aria.start(lane);
  const leave = async () => { if (aria.active) await aria.stop(); onLeave(); };

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
      <AriaMeetingPanel
        aria={aria.active ? aria : null}
        remote={aria.active ? null : remoteAria}
        canBring={!!ariaSink && !remoteAria?.on}
        onBring={bringAria}
        onStop={() => void aria.stop()}
        keepMeOut={keepMeOut}
        onKeepMeOut={setKeepMeOut}
        localLane={localLane}
        cloudHourUsd={cloudHourUsd}
        captionError={ariaHere && !keepMeOut ? captions.error : ''}
      />
      {captions.showCaptions && captions.lines.length > 0 && (
        <div className="rounded-[8px] bg-black/50 px-2 py-1 flex flex-col gap-0.5 max-h-[96px] overflow-y-auto">
          {captions.lines.slice(-4).map((l, i) => (
            <div key={`${l.uid}_${l.at}_${i}`} className={`text-[.64rem] leading-snug ${l.final ? 'text-white' : 'text-white/60'}`}><b className="text-white/70">{l.name}:</b> {l.text}</div>
          ))}
        </div>
      )}
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
        <CallBtn on={!captions.showCaptions} onClick={() => captions.setShowCaptions(!captions.showCaptions)} title={captions.showCaptions ? 'Hide captions' : 'Show captions'}>
          <Captions size={14} />
        </CallBtn>
        <CallBtn on={!rtc.sharingScreen} onClick={rtc.toggleScreenShare} title="Share screen">
          <MonitorUp size={14} />
        </CallBtn>
        {/* Aria runs in this docked call; the full call screen would leave her behind. */}
        <CallBtn on onClick={() => { if (!aria.active) onPopOut(); }} title={aria.active ? 'Aria is taking notes in this panel. Pop out after she leaves.' : 'Full call screen'}>
          <Maximize2 size={13} />
        </CallBtn>
        <button onClick={() => void leave()} title="Leave call" className="h-8 px-3 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center gap-1 text-[.66rem] font-bold">
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
