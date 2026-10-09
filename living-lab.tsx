// Living Runtime lab: every trigger and every animation preset, with a recording mock audio engine.
// No login, no app shell. Driven by scripts/living/driveLab.mjs (real pointer / touch / keyboard events).
//   ?page=triggers (default) | presets | tela (the Behaviours panel) | reader (a 3-page book in TelaBookReader)
//   ?reduced=1  ?sound=1  ?inactive=1  ?w=420 (render width in px)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './living-lab.css';
import TelaLivePage, { type TelaLivePageHandle } from './components/living/TelaLivePage';
import type { BookAudioApi } from './services/living/contracts';
import { LAB_H, LAB_W, labObjects, labPage, presetObjects, presetPage } from './services/living/sample/labPage';
import { applyTelaOp, type TelaOp } from './components/tela/telaOps';
import type { TelaDoc } from './types';

const Q = new URLSearchParams(location.search);

/** A recording audio engine: lets the driver assert what the runtime asked the (separate) audio module to do. */
class LabAudio implements BookAudioApi {
  calls: Array<{ n: string; a: unknown[] }> = [];
  state = { unlocked: false, muted: false, musicGain: 1, sfxGain: 1, reducedSound: false };
  private rec(n: string, ...a: unknown[]) { this.calls.push({ n, a }); (window as any).__audioLog = this.calls; }
  async unlock() { this.state.unlocked = true; this.rec('unlock'); }
  setMuted(m: boolean) { this.rec('setMuted', m); } setGains(g: unknown) { this.rec('setGains', g); }
  sfx(id: string, p?: unknown) { this.rec('sfx', id, p); }
  note(i: string, n: string | number, o?: unknown) { this.rec('note', i, n, o); }
  voice(i: string, n: string | number) { this.rec('voice', i, n); const idx = this.calls.length - 1; return { setPitch: (x: string | number) => this.rec('voice.setPitch', idx, x), setGain: () => {}, stop: () => this.rec('voice.stop', idx) }; }
  registerScores(s: unknown) { this.rec('registerScores', s); }
  playCue(id: string, o?: unknown) { this.rec('playCue', id, o); }
  stopMusic(o?: unknown) { this.rec('stopMusic', o); }
  setTempoScale(s: number, r?: number) { this.rec('setTempoScale', s, r); }
  setAmbience(b: string | null, o?: unknown) { this.rec('setAmbience', b, o); }
  duck(a: number, ms: number) { this.rec('duck', a, ms); }
  setDepth(d: number) { this.rec('setDepth', d); }
  speak(t: string, o?: { onWord?: (i: number) => void }) {
    this.rec('speak', t); const words = t.split(/\s+/).filter(Boolean); let cancelled = false;
    const done = new Promise<void>(res => { words.forEach((_, i) => setTimeout(() => { if (!cancelled) o?.onWord?.(i); if (i === words.length - 1) res(); }, 140 * (i + 1))); });
    return { cancel: () => { cancelled = true; this.rec('speak.cancel'); }, done };
  }
  stopAll() { this.rec('stopAll'); } dispose() { this.rec('dispose'); }
}

function Lab() {
  const which = Q.get('page') === 'presets' ? 'presets' : 'triggers';
  const [reduced, setReduced] = useState(Q.get('reduced') === '1');
  const [sound, setSound] = useState(Q.get('sound') === '1');
  const [active, setActive] = useState(Q.get('inactive') !== '1');
  const [vars, setVars] = useState<Record<string, unknown>>({});
  const [goals, setGoals] = useState<string[]>([]);
  const [gotos, setGotos] = useState<string[]>([]);
  const audio = useMemo(() => new LabAudio(), []);
  const ref = useRef<TelaLivePageHandle>(null);
  const objects = which === 'presets' ? presetObjects : labObjects;
  const living = which === 'presets' ? presetPage : labPage;
  const w = Number(Q.get('w') || 420);

  useEffect(() => {
    const t = setInterval(() => setVars(ref.current?.getVars() ?? {}), 150);
    (window as any).__lab = {
      handle: () => ref.current, engine: () => ref.current?.engine(), audio, vars: () => ref.current?.getVars(), goals: () => goals, gotos: () => gotos,
      setReduced, setSound, setActive,
      pageRect: () => document.querySelector('.pj-live-page')!.getBoundingClientRect().toJSON(),
      /** page units -> client px for the driver */
      toClient: (x: number, y: number) => { const r = document.querySelector('.pj-live-page svg')!.getBoundingClientRect(); return { x: r.left + x * r.width / LAB_W, y: r.top + y * r.height / LAB_H }; },
      objCenter: (id: string) => { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGraphicsElement | null; if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
      computed: (id: string) => { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGElement | null; if (!g) return null; const cs = getComputedStyle(g); return { transform: cs.transform, opacity: cs.opacity, visibility: cs.visibility, anims: g.getAnimations().length }; },
    };
    return () => clearInterval(t);
  }, [audio, goals, gotos]);

  const btn = (on: boolean): React.CSSProperties => ({ border: 0, borderRadius: 10, padding: '8px 12px', font: '600 13px system-ui', color: on ? '#000' : '#fff', background: on ? '#ff8c00' : '#2a2833', cursor: 'pointer' });
  return (
    <div style={{ display: 'flex', gap: 16, padding: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: w, flex: '0 0 auto' }}>
        <TelaLivePage ref={ref} objects={objects} width={LAB_W} height={LAB_H} living={living} audio={audio} reducedMotion={reduced} soundEnabled={sound} active={active}
          onGoto={p => setGotos(g => [...g, String(p)])} onGoal={(pg, id) => setGoals(g => [...g, `${pg}:${id}`])} />
      </div>
      <div style={{ flex: '1 1 260px', minWidth: 240 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .7 }}>Living Runtime Lab · {which}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <button style={btn(reduced)} onClick={() => setReduced(v => !v)} id="btn-reduced">Reduced motion</button>
          <button style={btn(sound)} onClick={() => setSound(v => !v)} id="btn-sound">Sound</button>
          <button style={btn(active)} onClick={() => setActive(v => !v)} id="btn-active">Active</button>
          <button style={btn(false)} onClick={() => ref.current?.replay()} id="btn-replay">Play again</button>
          <a style={{ ...btn(false), textDecoration: 'none' }} href={`?page=${which === 'presets' ? 'triggers' : 'presets'}`}>{which === 'presets' ? 'Triggers' : 'Presets'}</a>
        </div>
        <pre id="vars" style={{ margin: 0, fontSize: 11, opacity: .85, whiteSpace: 'pre-wrap' }}>{JSON.stringify(vars)}</pre>
        <div id="goals" style={{ fontSize: 12, marginTop: 6 }}>goals: {goals.join(', ') || 'none'}</div>
        <button id="after-focus" style={btn(false)}>after</button>
      </div>
    </div>
  );
}

// ───────────── harness for the Tela Behaviours panel: a real TelaDoc, ops through applyTelaOp, no firebase ─────────────
const TelaBehaviorsPanel = React.lazy(() => import('./components/tela/TelaBehaviorsPanel'));
function PanelHarness() {
  const [doc, setDoc] = useState<TelaDoc>(() => makeDoc(false));
  const [sel, setSel] = useState<string | null>('bo-body');
  const [saved, setSaved] = useState('');
  const [frameId, setFrameId] = useState('book:lab:f:ch:c1:img1');
  const ops = useRef<TelaOp[]>([]);
  const dispatch = (op: TelaOp) => { ops.current.push(op); setDoc(d => applyTelaOp(d, op)); };
  useEffect(() => {
    (window as any).__tela = { doc: () => doc, ops: () => ops.current, select: setSel, frame: setFrameId, reload: () => { const j = JSON.stringify(doc); setSaved(j); setDoc(JSON.parse(j)); } };
  });
  const objs = (doc.devices.v1 as any).objects as Array<{ id: string; objectLabel?: string; kind: string }>;
  return (
    <div style={{ display: 'flex', gap: 16, padding: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 300, fontSize: 12 }}>
        <div style={{ marginBottom: 8, opacity: .7 }}>Studio object list (selection)</div>
        <div style={{ maxHeight: 520, overflow: 'auto' }}>{objs.map(o => <div key={o.id} data-pick={o.id} onClick={() => setSel(o.id)} style={{ padding: '4px 8px', cursor: 'pointer', background: sel === o.id ? '#6b0099' : 'transparent', borderRadius: 6 }}>{o.objectLabel || o.kind}</div>)}</div>
        <div style={{ marginTop: 8 }}><button id="frame-1" onClick={() => setFrameId('book:lab:f:ch:c1:img1')}>Page 1</button> <button id="frame-2" onClick={() => setFrameId('book:lab:f:ch:c1:img2')}>Page 2 (empty)</button></div>
        <pre id="saved" style={{ fontSize: 10, maxHeight: 120, overflow: 'auto' }}>{saved ? `saved ${saved.length} bytes` : ''}</pre>
      </div>
      <div style={{ width: 380, background: '#16131d', padding: 12, borderRadius: 12 }}>
        <React.Suspense fallback="loading"><TelaBehaviorsPanel doc={doc} frameId={frameId} selectedObjectId={sel} dispatchOp={dispatch} /></React.Suspense>
      </div>
    </div>
  );
}

export function makeDoc(withLiving: boolean): TelaDoc {
  const base = { rotation: 0, opacity: 1, strokeWidth: 0, stroke: 'none' };
  const plain = [{ ...base, id: 'p-bg', kind: 'RECT', x: 0, y: 0, w: LAB_W, h: LAB_H, fill: '#44304a', rx: 0 }, { ...base, id: 'p-t', kind: 'TEXT', x: 30, y: 60, w: 540, h: 60, text: 'A page with no living data stays a plain Tela page.', fontSize: 28, fontFamily: 'Georgia, serif', fontWeight: 700, fill: '#fff', wrap: true }];
  const doc = {
    id: 'book:lab', ownerId: 'u', title: 'Living lab book', createdAt: 1, updatedAt: 1, bindings: [],
    frames: [1, 2, 3].map(n => ({ id: `book:lab:f:ch:c1:img${n}`, kind: 'SCREEN', preset: 'PHONE', x: 0, y: 0, w: LAB_W, h: LAB_H, deviceIds: [`v${n}`], label: `Page ${n}` })),
    devices: { v1: { id: 'v1', type: 'VECTOR', width: LAB_W, height: LAB_H, objects: labObjects }, v2: { id: 'v2', type: 'VECTOR', width: LAB_W, height: LAB_H, objects: presetObjects }, v3: { id: 'v3', type: 'VECTOR', width: LAB_W, height: LAB_H, objects: plain } },
  } as unknown as TelaDoc;
  if (withLiving) doc.living = { version: 1, bookId: 'lab', pages: [labPage, presetPage], scores: { 'lab-lullaby': { id: 'lab-lullaby', tempo: 90, lengthBeats: 8, tracks: [{ instrument: 'musicbox', notes: [{ t: 0, n: 'C4', d: 1 }, { t: 2, n: 'E4', d: 1 }, { t: 4, n: 'G4', d: 2 }] }] } }, defaults: { narrate: 'on-demand' } };
  return doc;
}

function ReaderHarness() {
  const [R, setR] = useState<React.ComponentType<any> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { import('./components/bookTela/TelaBookReader').then(m => setR(() => m.default)).catch(e => setErr(String(e))); }, []);
  const doc = useMemo(() => makeDoc(true), []);
  const bundle = useMemo(() => ({ schemaVersion: 1, bookId: 'lab', versionId: 'v1', createdAt: 1, doc, enhancements: [], toc: [{ chapterId: 'c1', title: 'Living lab', frameId: doc.frames[0].id }], book: { id: 'lab', title: 'Living lab book', authors: [], language: 'en', visualLed: true, ownerId: 'u' } }), [doc]);
  if (err) return <pre id="reader-error">{err}</pre>;
  if (!R) return <div>loading reader...</div>;
  return <R album={{ id: 'lab-album', title: 'Living lab book', ownerId: 'u' }} bundle={bundle} pin="follow-latest" uid="u" isOwner isPaid license={null} onBack={() => { /* lab */ }} />;
}

const mode = Q.get('page');
createRoot(document.getElementById('root')!).render(mode === 'tela' ? <PanelHarness /> : mode === 'reader' ? <ReaderHarness /> : <Lab />);
