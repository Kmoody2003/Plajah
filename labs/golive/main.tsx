// Go Live lab — the real GoLiveWizard → MobileLiveStreamer broadcaster and the real LiveViewer,
// talking WebRTC to each other through the in-memory Firestore (labs/golive/firestoreShim.ts).
//   npx vite --config golive-lab.vite.config.mjs  ->  http://127.0.0.1:3194/golive-lab.html
//   (no query)   host + viewer side by side in two frames
//   ?as=host     the Go Live wizard        ?as=viewer   auto-joins the first live stream
//   ?as=talk     Live Talk (audio rooms)   ?fake=1      force the synthetic camera + mic
//   ?timer=1     drive requestAnimationFrame from a timer (a hidden browser pane never ticks rAF)
//   ?split=call | class | campus   two people in a chat video call / a class lecture (teacher +
//                student) / a campus broadcast (+ master control) / a huddle / a collab call.
//                One frame: ?as=call|class|campus|huddle|collab&who=a|b
import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { installFakeMedia } from './fakeMedia';
import './classMediaShim';
import { auth } from './backendShim';
import { __labDump } from './firestoreShim';

const qs = new URLSearchParams(location.search);
const as = qs.get('as');
if (qs.get('fake') === '1') (window as any).__forceFake = true;
installFakeMedia();
// Track every peer connection + data channel so the lab can inspect them.
const labPcs: RTCPeerConnection[] = [];
const labDcs: RTCDataChannel[] = [];
{
  const RealPC = window.RTCPeerConnection;
  const realCreateDc = RealPC.prototype.createDataChannel;
  RealPC.prototype.createDataChannel = function (this: RTCPeerConnection, ...a: any[]) { const dc = (realCreateDc as any).apply(this, a); labDcs.push(dc); return dc; };
  (window as any).RTCPeerConnection = function (this: any, ...a: any[]) {
    const pc = new (RealPC as any)(...a); labPcs.push(pc);
    pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => labDcs.push(e.channel));
    return pc;
  } as any;
  (window as any).RTCPeerConnection.prototype = RealPC.prototype;
}
if (qs.get('timer') === '1') {
  let id = 0; const pending = new Map<number, number>();
  window.requestAnimationFrame = cb => { const n = ++id; pending.set(n, window.setTimeout(() => { pending.delete(n); cb(performance.now()); }, 16)); return n; };
  window.cancelAnimationFrame = n => { clearTimeout(pending.get(n)); pending.delete(n); };
}

/** Average RGB of a <video>'s current frame — proves what a frame actually carries. */
function sampleVideo(v: HTMLVideoElement | null) {
  if (!v || !v.videoWidth) return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(v, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  let r = 0, gg = 0, b = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); }
  const n = d.length / 4;
  return { w: v.videoWidth, h: v.videoHeight, r: Math.round(r / n), g: Math.round(gg / n), b: Math.round(b / n), sat: Math.round(sat / n), t: v.currentTime.toFixed(2) };
}
(window as any).goLiveLab = {
  calls: [] as any[],
  dump: __labDump,
  pcs: labPcs,
  rtc: () => ({ pcs: labPcs.map(pc => ({ conn: pc.connectionState, ice: pc.iceConnectionState, gather: pc.iceGatheringState, sig: pc.signalingState, sctp: (pc as any).sctp?.state ?? null })), dcs: labDcs.map(d => `${d.label}:${d.readyState}`) }),
  videos: () => [...document.querySelectorAll('video')].map(v => ({ playing: !v.paused, ...sampleVideo(v as HTMLVideoElement) })),
  snapshot: (i = 0) => { const v = document.querySelectorAll('video')[i] as HTMLVideoElement; if (!v) return null; const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); return c.toDataURL('image/jpeg', 0.7); },
  meters: () => [...document.querySelectorAll('[data-level-meter]')].map(el => ({ label: (el as HTMLElement).dataset.levelMeter, rms: (el.querySelectorAll('div[style*="clip-path"]')[1] as HTMLElement)?.style.clipPath, clip: (el.querySelector('button') as HTMLElement)?.dataset.on, read: el.querySelector('span.font-mono')?.textContent })),
};

const GoLiveWizard = React.lazy(() => import('../../components/GoLiveWizard'));
const LiveViewer = React.lazy(() => import('../../components/MobileLiveStreamer').then(m => ({ default: m.LiveViewer })));

function Viewer() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      const live = __labDump('streams/').find((d: any) => d.isLive && d.path.split('/').length === 2);
      if (live && !id) setId(live.path.split('/')[1]);
    }, 500);
    return () => clearInterval(t);
  }, [id]);
  if (!id) return <p style={{ color: '#888', font: '14px system-ui', padding: 24 }}>Viewer: waiting for a live stream…</p>;
  return <LiveViewer streamId={id} onClose={() => setId(null)} />;
}

function Talk() {
  const [View, setView] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    Promise.all([import('../../components/LiveTalkView'), import('../../contexts/GlobalPlayerContext')]).then(([t, g]) => {
      const P: any = (g as any).GlobalPlayerProvider || (({ children }: any) => children);
      setView(() => (props: any) => <P><t.default {...props} /></P>);
    });
  }, []);
  return View ? <View onBrowse={() => {}} initialShowSetup /> : null;
}

const LAB_ROOM: any = { id: 'lab-room', type: 'GROUP', name: 'Lab call', participants: ['lab-host', 'lab-viewer'], ownerId: 'lab-host', updatedAt: Date.now() };
const VideoChat = React.lazy(() => import('../../components/VideoChat'));
// The class feed's post composer needs the app's FediverseProvider.
const ClassHub = React.lazy(() => Promise.all([import('../../components/classroom/SharedClassroomClubHub'), import('../../contexts/FediverseContext')])
  .then(([m, f]) => ({ default: (p: any) => <f.FediverseProvider><m.SharedClassroomClubHub {...p} /></f.FediverseProvider> })));
const MasterControl = React.lazy(() => import('../../components/ChurchMasterControl'));
const HuddleDock = React.lazy(() => import('../../components/meetings/Huddle').then(m => ({ default: m.HuddleDock })));
const CollabCall = React.lazy(() => import('../../components/collab/CollabCall').then(m => ({ default: m.CollabCall })));
const who = qs.get('who') === 'b' ? 'b' : 'a';

// A long enough page to test following the teacher; correctAnswer must never reach the student frame.
const LAB_LESSON: any = {
  id: 'lab-lesson', title: 'To the church in Ephesus', sourceLabel: 'Lab', lessonBlocks: [], rawCurriculumText: 'TEACHER RAW SOURCE',
  questions: Array.from({ length: 24 }, (_, i) => ({ id: `q${i}`, type: 'SHORT', label: `${i + 1}`, prompt: `Question ${i + 1}: what does this verse say about the first love?`, correctAnswer: 'LAB-SECRET-KEY' })),
};

const LessonStage = React.lazy(() => import('../../components/classroom/LectureLessonStage'));
// ?as=lessonstage: the student's stage alone, for when two frames can't connect (WebRTC stuck on this network).
function LessonStageLab() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <div className="lh" style={{ height: '100vh' }}>
      <style>{'.lh-lesson{height:100vh;display:flex;flex-direction:column;position:relative}.lh-paper{flex:1;min-height:0;overflow-y:auto;background:#f7f2ea;padding:24px}'}</style>
      <LessonStage unit={LAB_LESSON} answers={answers} onAnswer={(q: string, v: string) => setAnswers(a => ({ ...a, [q]: v }))} note="Your own copy. Only you can see what you write here." />
    </div>
  );
}

// ?as=docshow&who=a|b: a Tela document with a sim, video, form and grid over the real source, no WebRTC needed.
const LiveDocDock = React.lazy(() => import('../../components/live/LiveDocDock'));
function seedDocShow() {
  const doc: any = {
    id: 'lab-doc', ownerId: 'lab-host', title: 'Interactive lesson', createdAt: 1, updatedAt: 1,
    frames: [
      { id: 'f1', kind: 'PAPER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['fig', 'vid', 'model'], label: 'Page 1' },
      { id: 'f2', kind: 'PAPER', x: 900, y: 0, w: 816, h: 700, deviceIds: ['form', 'base', 'grid'], label: 'Page 2' },
    ],
    devices: {
      fig: { id: 'fig', type: 'FIGURE', figure: { id: 'f', type: 'sim', title: 'Population', sim: 'population', caption: 'Live simulation' } },
      vid: { id: 'vid', type: 'MEDIA', kind: 'VIDEO', name: 'Clip', mimeType: 'video/mp4', size: 1, width: 640, height: 360, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
      model: { id: 'model', type: 'MEDIA', kind: 'MODEL_3D', name: 'Astronaut.glb', mimeType: 'model/gltf-binary', size: 1, width: 640, height: 360, src: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb' },
      form: { id: 'form', type: 'FORM', baseDeviceId: 'base', title: 'Quick check' },
      base: { id: 'base', type: 'BASE', name: 'Answers', fields: [{ id: 'a', name: 'Q1', type: 'TEXT', interaction: { kind: 'QUESTION', prompt: 'What limits growth?', responseType: 'SHORT_TEXT', required: true, points: 2, correctAnswer: 'Food' } }], rows: [] },
      grid: { id: 'grid', type: 'GRID', label: 'Data', cols: 3, rows: 3, cells: {} },
    },
  };
  return doc;
}
function DocShow() {
  useEffect(() => {
    if (who === 'a') import('../../services/telaStore').then(m => m.saveTelaDoc(seedDocShow())).catch(e => console.error('[lab] seed', e));
  }, []);
  return (
    <div style={{ height: '100vh', background: '#05030a', color: '#fff', padding: 16 }}>
      <p>{who === 'a' ? 'Presenter' : 'Viewer'} stream</p>
      <LiveDocDock sessionKey="lab-stream" canPresent={who === 'a'} hostName="Lab Host" audience="public" />
    </div>
  );
}

function Surface() {
  if (as === 'docshow') return <DocShow />;
  if (as === 'lessonstage') return <LessonStageLab />;
  if (as === 'call') return <VideoChat room={LAB_ROOM} user={auth.currentUser} onClose={() => {}} />;
  if (as === 'huddle') return <HuddleDock room={LAB_ROOM} onLeave={() => {}} onExpand={() => {}} />;
  if (as === 'collab') return <div style={{ width: 360, background: '#0b0b10' }}><CollabCall roomId="lab-room" joined onLeave={() => {}} onPopOut={() => {}} /></div>;
  if (as === 'class') return (
    <div style={{ padding: 16, background: '#05030a', minHeight: '100vh' }}>
      <ClassHub classId="lab-class" className="Lab Class" contextKind={'ACADEMIA' as any} teacherUid="lab-host" teacherName="Lab Host"
        isTeacher={who === 'a'} currentUserUid={auth.currentUser.uid} currentUserName={auth.currentUser.displayName}
        rosterStudents={[{ id: 'lab-viewer', name: 'Lab Viewer' }]} club={{ kind: 'classroom', id: 'lab-class' }} lessons={[LAB_LESSON]}
        initialSection={(new URLSearchParams(location.search).get('section') as any) || 'LIVE_LECTURE'} />
    </div>
  );
  return (
    <div style={{ background: '#05030a', minHeight: '100vh' }}>
      <MasterControl church={{ id: 'lab-church', name: 'Lab Church', campuses: [{ id: 'main', name: 'Main Campus', isPrimary: true }] } as any}
        onClose={() => {}} defaultMode={who === 'a' ? 'broadcast' : 'monitor'} />
    </div>
  );
}

function Split() {
  const kind = qs.get('split');
  if (kind) {
    const f = (w: string) => <iframe src={`/golive-lab.html?as=${kind}&who=${w}${qs.get('timer') ? '&timer=1' : ''}${qs.get('section') ? '&section=' + qs.get('section') : ''}`} allow="camera; microphone; autoplay"
      style={{ width: '50%', height: '100%', border: 0, borderRight: '1px solid #333' }} />;
    return <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>{f('a')}{f('b')}</div>;
  }
  const frame = (q: string) => <iframe src={`/golive-lab.html?${q}${qs.get('fake') ? '&fake=1' : ''}${qs.get('timer') ? '&timer=1' : ''}`} allow="camera; microphone; autoplay"
    style={{ width: '50%', height: '100%', border: 0, borderRight: '1px solid #333' }} />;
  return <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>{frame('as=host')}{frame('as=viewer')}</div>;
}

function App() {
  if (as === 'host') return <Suspense fallback={null}><GoLiveWizard onClose={() => location.reload()} currentUser={auth.currentUser} /></Suspense>;
  if (as === 'viewer') return <Suspense fallback={null}><Viewer /></Suspense>;
  if (as === 'talk') return <Talk />;
  if (as === 'docshow' || as === 'lessonstage' || as === 'call' || as === 'class' || as === 'campus' || as === 'huddle' || as === 'collab') return <Suspense fallback={null}><Surface /></Suspense>;
  return <Split />;
}
createRoot(document.getElementById('root')!).render(<App />);
