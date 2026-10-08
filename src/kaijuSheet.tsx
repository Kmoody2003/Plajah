// Dev-only: model sheet for the kaiju rigs — renders Lorik & Lumi in reference poses next to the
// uploaded character sheets so the SVG build can be matched against the art.  /kaiju-sheet.html
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { KaijuFigureSvg, type KaijuRig } from '../components/kaiju/KaijuFigure';
import { pose, mirrorPose, type Pose } from '../components/kaiju/kaijuPose';

const POSES: { name: string; p: Partial<Pose> }[] = [
  { name: 'Rest', p: {} },
  { name: 'T-pose', p: { armL: 80, armR: 80 } },
  { name: 'Sing', p: { mic: 1, armL: -105, armR: 70, mouth: 0.7, happy: 0.6 } },
  { name: 'Book', p: { book: 1, armL: -38, armR: -38 } },
  { name: 'Camera snap', p: { camUp: 1, armL: -158, armR: -158 } },
];

const Fig: React.FC<{ kind: 'lorik' | 'lumi'; p: Partial<Pose>; w?: number }> = ({ kind, p, w = 230 }) => {
  const r = useRef<KaijuRig>(null);
  useEffect(() => { const P = pose(p); r.current?.apply(kind === 'lumi' ? mirrorPose(P) : P); });
  return <KaijuFigureSvg ref={r} kind={kind} flipTail={kind === 'lumi'} style={{ width: w, height: w * 270 / 230 }} />;
};

function App() {
  if (new URLSearchParams(location.search).has('big')) {
    return (
      <div style={{ background: '#fff', display: 'flex', gap: 20, padding: 10 }}>
        <Fig kind="lorik" p={POSES[1].p} w={600} /><Fig kind="lumi" p={POSES[1].p} w={600} />
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', padding: 16, fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {POSES.map(x => (
          <div key={x.name} style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex' }}><Fig kind="lorik" p={x.p} /><Fig kind="lumi" p={x.p} /></div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{x.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
