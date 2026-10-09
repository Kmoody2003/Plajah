// Lab for the living editions of Below the Blue and The Golden Thread, on the REAL built Tela docs:
//   http://127.0.0.1:3155/living-lab-bluethread.html?book=below-the-blue|golden-thread &page=N (1-based) &reduced=1 &sound=1 &w=720
// Audio is the recording mock from services/living/audio/mock (it also reports unknown ids and sound-before-unlock as `problems`).
// window.__lab: handle(), engine(), audio, vars(), goals, gotos, objBox(id), groupBox(ids), toClient(x,y), ids(label), setReduced, setSound
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TelaLivePage, { type TelaLivePageHandle } from './components/living/TelaLivePage';
import { createMockAudio } from './services/living/audio/mock';
import { buildShowcaseTelaDoc } from './services/showcase/livingDoc';
import { frameObjects, frameSize } from './services/living/runtime/objects';
import type { LivingBook } from './services/living/contracts';

const Q = new URLSearchParams(location.search);
const BOOK = Q.get('book') || 'below-the-blue';
const PAGE = Number(Q.get('page') || 1);
const mods: Record<string, () => Promise<unknown>> = {
  'below-the-blue': () => import('./data/showcase/living/below-the-blue'),
  'golden-thread': () => import('./data/showcase/living/golden-thread'),
};

function Lab() {
  const [living, setLiving] = useState<LivingBook | null>(null);
  const [err, setErr] = useState('');
  const [reduced, setReduced] = useState(Q.get('reduced') === '1');
  const [sound, setSound] = useState(Q.get('sound') === '1');
  const [vars, setVars] = useState<Record<string, unknown>>({});
  const [goals, setGoals] = useState<string[]>([]);
  const [gotos, setGotos] = useState<string[]>([]);
  const audio = useMemo(() => createMockAudio(), []);
  const ref = useRef<TelaLivePageHandle>(null);
  useEffect(() => {
    const load = mods[BOOK];
    if (!load) { setErr(`no living file for ${BOOK}`); return; }
    load().then(m => { const lv = (m as { default: LivingBook }).default; audio.registerScores(lv.scores); setLiving(lv); }).catch(e => setErr(String(e?.stack || e)));
  }, [audio]);
  const doc = useMemo(() => (living ? buildShowcaseTelaDoc(BOOK, living) : null), [living]);
  const frame = doc?.frames[PAGE - 1];
  const objects = useMemo(() => (doc && frame ? frameObjects(doc, frame) : []), [doc, frame]);
  const size = doc && frame ? frameSize(doc, frame) : { width: 816, height: 816 };
  const lp = living?.pages.find(p => p.page === PAGE);
  const w = Number(Q.get('w') || 720);

  useEffect(() => {
    const t = setInterval(() => setVars(ref.current?.getVars() ?? {}), 150);
    (window as any).__lab = {
      handle: () => ref.current, engine: () => ref.current?.engine(), audio, vars: () => ref.current?.getVars(), goals, gotos, setReduced, setSound, size,
      toClient: (x: number, y: number) => { const r = document.querySelector('.pj-live-page svg')!.getBoundingClientRect(); return { x: r.left + x * r.width / size.width, y: r.top + y * r.height / size.height }; },
      objBox: (id: string) => { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGraphicsElement | null; if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; },
      groupBox: (ids: string[]) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const id of ids) { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGraphicsElement | null; if (!g) continue; const r = g.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; },
      ids: (label: string) => objects.filter(o => o.objectLabel === label).map(o => o.id),
    };
    return () => clearInterval(t);
  }, [audio, goals, gotos, size, objects]);

  if (err) return <pre id="lab-error" style={{ whiteSpace: 'pre-wrap' }}>{err}</pre>;
  if (!doc || !lp) return <div>loading...</div>;
  const btn = (on: boolean): React.CSSProperties => ({ border: 0, borderRadius: 10, padding: '8px 12px', font: '600 13px system-ui', color: on ? '#000' : '#fff', background: on ? '#ff8c00' : '#2a2833', cursor: 'pointer' });
  return (
    <div style={{ display: 'flex', gap: 16, padding: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: w, flex: '0 0 auto' }}>
        <TelaLivePage ref={ref} objects={objects} width={size.width} height={size.height} living={lp} audio={audio} reducedMotion={reduced} soundEnabled={sound} active
          onGoto={p => setGotos(g => [...g, String(p)])} onGoal={(pg, id) => setGoals(g => [...g, `${pg}:${id}`])} />
      </div>
      <div style={{ flex: '1 1 260px', minWidth: 240 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .7 }}>{BOOK} · page {PAGE}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <button style={btn(reduced)} onClick={() => setReduced(v => !v)} id="btn-reduced">Reduced motion</button>
          <button style={btn(sound)} onClick={() => setSound(v => !v)} id="btn-sound">Sound</button>
          <button style={btn(false)} onClick={() => ref.current?.replay()} id="btn-replay">Play again</button>
        </div>
        <pre id="vars" style={{ margin: 0, fontSize: 11, opacity: .85, whiteSpace: 'pre-wrap' }}>{JSON.stringify(vars)}</pre>
        <div id="goals" style={{ fontSize: 12, marginTop: 6 }}>goals: {goals.join(', ') || 'none'}</div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
