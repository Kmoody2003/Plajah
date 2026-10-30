// Go Live lab — the real GoLiveWizard → MobileLiveStreamer broadcaster and the real LiveViewer,
// talking WebRTC to each other through the in-memory Firestore (labs/golive/firestoreShim.ts).
//   npx vite --config golive-lab.vite.config.mjs  ->  http://127.0.0.1:3194/golive-lab.html
//   (no query)   host + viewer side by side in two frames
//   ?as=host     the Go Live wizard        ?as=viewer   auto-joins the first live stream
//   ?as=talk     Live Talk (audio rooms)   ?fake=1      force the synthetic camera + mic
//   ?timer=1     drive requestAnimationFrame from a timer (a hidden browser pane never ticks rAF)
import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { installFakeMedia } from './fakeMedia';
import { auth } from './backendShim';
import { __labDump } from './firestoreShim';

const qs = new URLSearchParams(location.search);
const as = qs.get('as');
if (qs.get('fake') === '1') (window as any).__forceFake = true;
installFakeMedia();
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

function Split() {
  const frame = (q: string) => <iframe src={`/golive-lab.html?${q}${qs.get('fake') ? '&fake=1' : ''}${qs.get('timer') ? '&timer=1' : ''}`} allow="camera; microphone; autoplay"
    style={{ width: '50%', height: '100%', border: 0, borderRight: '1px solid #333' }} />;
  return <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>{frame('as=host')}{frame('as=viewer')}</div>;
}

function App() {
  if (as === 'host') return <Suspense fallback={null}><GoLiveWizard onClose={() => location.reload()} currentUser={auth.currentUser} /></Suspense>;
  if (as === 'viewer') return <Suspense fallback={null}><Viewer /></Suspense>;
  if (as === 'talk') return <Talk />;
  return <Split />;
}
createRoot(document.getElementById('root')!).render(<App />);
