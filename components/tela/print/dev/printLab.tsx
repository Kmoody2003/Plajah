// Dev lab for Tela's print stack: the Prepress panel on a sample document (no Tela, no Firebase).
// Served by the journalism-lab server: http://127.0.0.1:3145/print-lab.html  (?tab=wrap for wraps)
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './printLab.css';
import PrepressPanel from '../PrepressPanel';
import type { TelaDoc, TelaFrame } from '../../../../types';
import type { DocPrintSpec } from '../../../../services/print/types';
import { vehiclePlacements } from '../../../../services/print/wrap';
import { defaultSpecFor } from '../../../../services/print/products';

// A deliberately low-resolution "photo": 160×120 px placed 4 in wide (40 ppi).
const lowRes = (() => {
  const c = document.createElement('canvas'); c.width = 160; c.height = 120;
  const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 160, 120); gr.addColorStop(0, '#1e6bd6'); gr.addColorStop(1, '#19c37d');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 120); g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('PHOTO', 40, 66);
  return c.toDataURL('image/png');
})();

const frame = (i: number): TelaFrame => ({ id: `f${i}`, kind: 'PAPER', preset: 'LETTER', x: 0, y: i * 1100, w: 816, h: 1056, deviceIds: [], label: `Page ${i + 1}` });

let guide = '';
function renderFrame(f: TelaFrame) {
  if (f.id === 'wrap') return (
    <div style={{ width: f.w, height: f.h, position: 'relative', background: 'linear-gradient(120deg,#ff4d6d,#ffd166 40%,#06d6a0 70%,#118ab2)' }}>
      <div style={{ position: 'absolute', left: '8%', top: '6%', fontSize: f.w / 9, fontWeight: 900, color: '#fff', fontFamily: 'sans-serif' }}>PLAJAH</div>
      {guide && <img src={guide} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.35 }} />}
    </div>
  );
  const n = +f.id.slice(1);
  return (
    <div style={{ width: f.w, height: f.h, position: 'relative', fontFamily: 'Georgia, serif', color: '#000' }}>
      {n === 0 && <div style={{ position: 'absolute', left: 0, top: 0, width: f.w, height: 120, background: '#c0262d' }} />}
      <h1 style={{ position: 'absolute', left: 6, top: 140, margin: 0, fontSize: 40, fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 800 }}>Robotics team takes second</h1>
      <p style={{ position: 'absolute', left: 72, top: 210, width: 600, fontSize: 13, color: '#151515', fontFamily: 'Inter, system-ui, sans-serif' }}>Our robotics team placed second of 14 schools at Saturday’s regional tournament, the best finish in school history.</p>
      <p style={{ position: 'absolute', left: 72, top: 262, width: 600, fontSize: 12, color: '#000' }}>Set in Georgia, a system font: the press PDF substitutes an open serif.</p>
      {n === 0 && (
        <svg style={{ position: 'absolute', left: 480, top: 300 }} width="260" height="200" viewBox="0 0 130 100">
          <rect x="5" y="5" width="120" height="60" rx="8" fill="#6B0099" stroke="#000" strokeWidth="1" />
          <circle cx="100" cy="80" r="14" fill="#D40055" />
          <text x="12" y="40" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="14" fill="#ffffff"><tspan x="12" dy="0">SVG headline</tspan></text>
        </svg>
      )}
      {n === 0 && <img src={lowRes} alt="team photo" style={{ position: 'absolute', left: 72, top: 300, width: 384, height: 288 }} />}
      <svg style={{ position: 'absolute', left: 72, top: 640 }} width="600" height="10"><line x1="0" y1="5" x2="600" y2="5" stroke="#000" strokeWidth="0.2" /></svg>
      <p style={{ position: 'absolute', left: 72, bottom: 60, fontSize: 9 }}>Page {n + 1}</p>
    </div>
  );
}

function Lab() {
  const [doc, setDoc] = useState<TelaDoc>(() => ({ id: 'lab', ownerId: 'lab', title: 'Print lab sample', frames: [0, 1, 2].map(frame), devices: {}, createdAt: 0, updatedAt: 0 }));
  const onSetSpec = (spec: DocPrintSpec | null, resize?: string[]) => setDoc(d => ({
    ...d, print: spec || undefined,
    frames: resize?.length && spec ? d.frames.map(f => (resize.includes(f.id) ? { ...f, w: Math.round(spec.trimIn[0] * 96), h: Math.round(spec.trimIn[1] * 96) } : f)) : d.frames,
  }));
  const addPages = (count: number) => setDoc(d => ({ ...d, frames: [...d.frames, ...Array.from({ length: count }, (_, i) => frame(d.frames.length + i))] }));
  useMemo(() => { (window as any).__labDoc = doc; }, [doc]);
  // Mirrors TelaView.createWrapBoard: a board at the job's scale plus the panel map.
  const createWrap = (b: { label: string; widthIn: number; heightIn: number; scale: number; guideSvg: string; job: any }) => {
    guide = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(b.guideSvg)}`;
    const w = Math.round(b.widthIn * b.scale * 96), h = Math.round(b.heightIn * b.scale * 96);
    const panels = b.job && !b.job.dieline ? vehiclePlacements(b.job).flatMap(({ surface, ox, oy, tile }) => tile.panels.map((p, i) => ({ label: `${surface.label} P${i + 1}`, rectIn: { x: ox + p.rect.x, y: oy + p.rect.y, w: p.rect.w, h: p.rect.h }, printW: p.printW, printH: p.printH }))) : [];
    setDoc(d => ({ ...d, frames: [{ id: 'wrap', kind: 'PAPER', preset: 'FREE', x: 0, y: 0, w, h, deviceIds: [], label: b.label }],
      print: defaultSpecFor('vehicle-wrap', { trimIn: [w / 96, h / 96], bleedIn: 0.3, safeIn: 0.4, pageFrameIds: ['wrap'], ...(panels.length ? { wrap: { scale: b.scale, panels } } : {}) }) }));
    setKey(k => k + 1);
  };
  const [key, setKey] = useState(0);
  return <PrepressPanel key={key} doc={doc} renderFrame={renderFrame} onSetSpec={onSetSpec} onAddBlankPages={addPages} onCreateWrapBoard={createWrap} onClose={() => console.log('[lab] close')} />;
}

createRoot(document.getElementById('root')!).render(<Lab />);
