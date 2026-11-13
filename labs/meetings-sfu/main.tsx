// Meetings SFU lab: the real useRtcSession → MeetingSession → LiveKitSession path against a local
// LiveKit server, one browser tab per person (?as=<uid>). See docs/MEETINGS_SFU.md "Local test".
//   ?as=alice|bob|carol|dave|erin|guestAnn   who you are (members of the lab group; guestAnn is an admitted guest)
//   &target=group|public|dm                  the room's call, the public meeting link, or a 1:1 (stays mesh)
//   &purpose=meeting|huddle   &page=<n>      grid page size (default 8)   &cam=1  real camera instead of a test pattern
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRtcSession } from '../../hooks/useRtcSession';
import MeetingRefusal from '../../components/meetings/MeetingRefusal';
import '../../index.css';

const q = new URLSearchParams(location.search);
const me = q.get('as') || 'alice';
const target = q.get('target') || 'group';
const purpose = (q.get('purpose') === 'huddle' ? 'huddle' : 'meeting') as 'huddle' | 'meeting';
const pageSize = Math.max(1, Number(q.get('page')) || 8);
const collectionName = target === 'public' ? 'public_meetings/labmeet/rtc' : target === 'dm' ? 'chat_rooms/labdm/meeting_rtc' : 'chat_rooms/labgroup/meeting_rtc';

/** A moving test pattern + a quiet tone, so many tabs can join without fighting over one camera. */
function fakeMedia(label: string): MediaStream {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d')!;
  let t = 0;
  const hue = [...label].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  setInterval(() => {
    t += 1;
    g.fillStyle = `hsl(${hue} 60% 22%)`; g.fillRect(0, 0, 640, 360);
    g.fillStyle = `hsl(${hue} 80% 60%)`; g.beginPath(); g.arc(320 + Math.sin(t / 15) * 200, 180, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.fillText(label, 24, 60);
    g.font = '20px monospace'; g.fillText(new Date().toISOString().slice(11, 23), 24, 340);
  }, 1000 / 24);
  const v = c.captureStream(24).getVideoTracks()[0];
  const ac = new AudioContext();
  const osc = ac.createOscillator(); osc.frequency.value = 220 + (hue % 200);
  const gain = ac.createGain(); gain.gain.value = 0.02;
  const dest = ac.createMediaStreamDestination();
  osc.connect(gain).connect(dest); osc.start();
  return new MediaStream([v, dest.stream.getAudioTracks()[0]]);
}

const Tile: React.FC<{ stream: MediaStream | null; label: string; muted?: boolean; id: string; hd?: boolean }> = ({ stream, label, muted, id, hd }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
      <video ref={ref} data-peer={id} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      <span className="absolute left-2 bottom-2 text-[11px] font-bold bg-black/60 px-2 py-0.5 rounded">{label}{hd ? ' · HD' : ''}</span>
    </div>
  );
};

const HiddenAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
};

const Lab: React.FC = () => {
  const local = useMemo(() => (q.get('cam') === '1' ? undefined : fakeMedia(me)), []);
  const [joined, setJoined] = useState(q.get('autojoin') !== '0');
  const [lastData, setLastData] = useState<string>('');
  const [ledger, setLedger] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const rtc = useRtcSession(joined ? {
    collectionName, sessionId: 'main', topology: 'mesh', role: 'participant', liveness: true,
    media: { audio: true, video: true }, localStream: local, displayName: me,
  } : null, { sfu: { purpose }, onData: (peer, msg) => setLastData(`${peer}: ${msg.type} ${JSON.stringify(msg.payload)}`) });

  const remotes = [...rtc.remoteStreams.entries()];
  const speaker = rtc.activeSpeakers.find(id => id !== me) || null;
  const pages = Math.max(1, Math.ceil(remotes.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = remotes.slice(p * pageSize, p * pageSize + pageSize);
  const off = remotes.filter(([id]) => !shown.some(([s]) => s === id));
  const key = shown.map(([id]) => id).join(',');
  const { setVideoPolicy } = rtc;
  useEffect(() => { setVideoPolicy({ visible: key ? key.split(',') : [], focus: speaker }); }, [key, speaker, setVideoPolicy]);

  // For automated checks from the browser pane.
  (window as any).lab = { me, engine: rtc.engine, participants: rtc.participants.map(x => x.id), remotes: remotes.map(([id, s]) => ({ id, tracks: s.getTracks().map(t => `${t.kind}:${t.readyState}`) })), shown: shown.map(([id]) => id), error: rtc.error, refusal: rtc.refusal, lastData, speakers: rtc.activeSpeakers, send: rtc.sendData, setAudio: rtc.setAudio, setVideo: rtc.setVideo, leave: () => setJoined(false), join: () => setJoined(true), setPage };

  return (
    <div className="min-h-screen bg-[#08080a] text-white p-4 flex flex-col gap-3 font-sans">
      <header className="flex flex-wrap items-center gap-3 text-[12px]">
        <b className="text-[14px]">SFU lab · {me}</b>
        <span>target <code>{target}</code> · {purpose}</span>
        <span className={`px-2 py-0.5 rounded ${rtc.engine === 'sfu' ? 'bg-emerald-500/30' : 'bg-white/10'}`}>engine: {rtc.engine || '…'}</span>
        <span>{rtc.participants.length + (joined ? 1 : 0)} in call</span>
        <button className="px-2 py-1 rounded bg-white/10" onClick={() => rtc.toggleAudio()}>{rtc.audioEnabled ? 'Mute' : 'Unmute'}</button>
        <button className="px-2 py-1 rounded bg-white/10" onClick={() => rtc.toggleVideo()}>{rtc.videoEnabled ? 'Camera off' : 'Camera on'}</button>
        <button className="px-2 py-1 rounded bg-white/10" onClick={() => rtc.sendData('reaction', { emoji: '👏', from: me })}>Send 👏</button>
        <button className="px-2 py-1 rounded bg-white/10" onClick={() => setJoined(j => !j)}>{joined ? 'Leave' : 'Join'}</button>
        <button className="px-2 py-1 rounded bg-white/10" onClick={() => fetch('/lab/ledger').then(r => r.json()).then(setLedger)}>Ledger</button>
      </header>
      {rtc.refusal && <MeetingRefusal refusal={rtc.refusal} onClose={() => setJoined(false)} />}
      {rtc.error && !rtc.refusal && <p className="text-red-400 text-[12px]">{rtc.error}</p>}
      {lastData && <p className="text-[12px] text-emerald-300">data ← {lastData}</p>}
      {pages > 1 && (
        <div className="flex items-center gap-2 text-[12px]">
          <button className="px-2 rounded bg-white/10" onClick={() => setPage(Math.max(0, p - 1))}>‹</button> page {p + 1}/{pages}
          <button className="px-2 rounded bg-white/10" onClick={() => setPage(Math.min(pages - 1, p + 1))}>›</button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile stream={rtc.localStream} label={`${me} (you)`} muted id={me} />
        {shown.map(([id, s]) => <Tile key={id} id={id} stream={s} label={rtc.participants.find(x => x.id === id)?.name || id} hd={id === speaker || shown.length <= 2} />)}
      </div>
      {off.map(([id, s]) => <HiddenAudio key={id} stream={s} />)}
      {ledger.length > 0 && <pre className="text-[10px] bg-white/5 p-2 rounded overflow-auto max-h-64">{JSON.stringify(ledger, null, 1)}</pre>}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
