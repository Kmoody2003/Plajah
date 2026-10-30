import React, { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, Maximize2, PhoneOff } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useRtcSession } from '../../hooks/useRtcSession';
import { LevelMeter } from '../live/LevelMeter';
import { activeHuddlers, huddleLabel, type HuddlePresence } from '../../services/meetings/scheduleCore';
import type { ChatRoom } from '../../types';

/** Who is in a room's call right now (heart-beating participants of meeting_rtc/main). */
export function useHuddlePresence(roomId: string | null | undefined): HuddlePresence[] {
  const [raw, setRaw] = useState<HuddlePresence[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!roomId) { setRaw([]); return; }
    return onSnapshot(collection(db, 'chat_rooms', roomId, 'meeting_rtc', 'main', 'participants'), snap => {
      setRaw(snap.docs.map(d => {
        const v = d.data() as any;
        const ls = v.lastSeen;
        return { id: d.id, name: v.name || 'Someone', lastSeen: typeof ls?.toMillis === 'function' ? ls.toMillis() : typeof ls === 'number' ? ls : null };
      }));
    }, () => setRaw([]));
  }, [roomId]);
  // Re-check staleness even when nothing changes (someone's tab died).
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 15_000); return () => window.clearInterval(t); }, []);
  return activeHuddlers(raw);
}

/** Banner inside a chat when people are already in its huddle. */
export const HuddleBanner: React.FC<{ roomId: string; selfId?: string; inThisHuddle: boolean; onJoin: () => void }> = ({ roomId, selfId, inThisHuddle, onJoin }) => {
  const people = useHuddlePresence(roomId).filter(p => p.id !== selfId);
  if (!people.length || inThisHuddle) return null;
  return (
    <div className="shrink-0 mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-2xl bg-emerald-500/12 border border-emerald-400/25 text-[12px] text-white">
      <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-emerald-400" /></span>
      <Headphones size={13} className="text-emerald-300" />
      <span className="min-w-0 truncate"><b>{huddleLabel(people.map(p => p.name))}</b> {people.length === 1 ? 'is' : 'are'} in a huddle</span>
      <button type="button" onClick={onJoin} className="ml-auto shrink-0 px-3 py-1 rounded-full bg-emerald-400 text-black text-[11px] font-black">Join</button>
    </div>
  );
};

const RemoteAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
};

/**
 * The floating huddle: audio-only on the room's own call session, so it keeps running while you
 * move around the app. "Open call" hands over to the full call screen (same session).
 */
export const HuddleDock: React.FC<{ room: ChatRoom; onLeave: () => void; onExpand: () => void }> = ({ room, onLeave, onExpand }) => {
  const rtc = useRtcSession({
    collectionName: `chat_rooms/${room.id}/meeting_rtc`,
    sessionId: 'main',
    topology: 'mesh',
    role: 'participant',
    media: { audio: true, video: false },
    liveness: true,
  }, { allowedPeerIds: room.participants });
  const remotes = [...rtc.remoteStreams.entries()].filter(([id]) => room.participants.includes(id));
  const names = rtc.participants.filter(p => room.participants.includes(p.id)).map(p => p.name || 'Someone');
  const leave = () => { rtc.leave(); onLeave(); };
  const expand = () => { rtc.leave(); onExpand(); };
  return (
    <div role="region" aria-label="Huddle" className="fixed z-[480] flex items-center gap-2 pl-3 pr-2 py-2 rounded-full bg-[#0f1a14]/95 backdrop-blur-xl border border-emerald-400/30 shadow-2xl text-white"
      style={{ right: 'max(16px, env(safe-area-inset-right))', bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      {remotes.map(([id, stream]) => <RemoteAudio key={id} stream={stream} />)}
      <Headphones size={15} className="text-emerald-300 shrink-0" />
      <div className="min-w-0 max-w-[46vw] sm:max-w-[260px]">
        <p className="text-[12px] font-bold truncate">{room.name || 'Huddle'}</p>
        <p className="text-[10px] text-white/55 truncate">{names.length ? `With ${huddleLabel(names)}` : 'Waiting for others to join…'}</p>
        <LevelMeter source={rtc.localAudioTrack} size="sm" muted={!rtc.audioEnabled} className="mt-1" />
      </div>
      <button type="button" onClick={() => rtc.setAudio(!rtc.audioEnabled)} aria-pressed={!rtc.audioEnabled}
        title={rtc.audioEnabled ? 'Mute' : 'Unmute'} aria-label={rtc.audioEnabled ? 'Mute' : 'Unmute'}
        className={`p-2 rounded-full ${rtc.audioEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500/80 hover:bg-red-500'}`}>
        {rtc.audioEnabled ? <Mic size={15} /> : <MicOff size={15} />}
      </button>
      <button type="button" onClick={expand} title="Open the full call (video, screen share, recording)" aria-label="Open full call" className="p-2 rounded-full bg-white/10 hover:bg-white/20">
        <Maximize2 size={15} />
      </button>
      <button type="button" onClick={leave} title="Leave huddle" aria-label="Leave huddle" className="p-2 rounded-full bg-red-500 hover:bg-red-400">
        <PhoneOff size={15} />
      </button>
      {rtc.error && <span className="sr-only" role="status">{rtc.error}</span>}
    </div>
  );
};
