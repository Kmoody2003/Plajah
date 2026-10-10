// Living Books lab: ONE page of a showcase book's living edition, built from the REAL Tela doc (the designers' named objects + data/showcase/living/<book>.ts).
//   http://127.0.0.1:3155/living-books-lab.html?book=orbit-party&page=5            ?reduced=1  ?sound=1  ?w=820  ?real=1 (real audio engine instead of the recorder)
// Same idea as living-lab.tsx: a recording audio engine so a driver can assert what the runtime asked the audio module to do, plus helpers for real pointer driving.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TelaLivePage, { type TelaLivePageHandle } from './components/living/TelaLivePage';
import type { BookAudioApi, LivingBook } from './services/living/contracts';
import { buildShowcaseTelaDoc } from './services/showcase/livingDoc';
import { frameObjects } from './services/living/runtime/objects';
import { getBookAudio } from './services/living/audio';
import orbit from './data/showcase/living/orbit-party';
import fox from './data/showcase/living/little-fox-big-trees';

const Q = new URLSearchParams(location.search);
const BOOKS: Record<string, LivingBook> = { 'orbit-party': orbit, 'little-fox-big-trees': fox };

class LabAudio implements BookAudioApi {
  calls: Array<{ n: string; a: unknown[] }> = [];
  state = { unlocked: false, muted: false, musicGain: 1, sfxGain: 1, reducedSound: false };
  private rec(n: string, ...a: unknown[]) { this.calls.push({ n, a }); (window as any).__audioLog = this.calls; }
  async unlock() { this.state.unlocked = true; this.rec('unlock'); }
  setMuted(m: boolean) { this.rec('setMuted', m); } setGains(g: unknown) { this.rec('setGains', g); }
  sfx(id: string, p?: unknown) { this.rec('sfx', id, p); }
  note(i: string, n: string | number, o?: unknown) { this.rec('note', i, n, o); }
  voice(i: string, n: string | number) { this.rec('voice', i, n); const idx = this.calls.length - 1; return { setPitch: (x: string | number) => this.rec('voice.setPitch', idx, x), setGain: () => {}, stop: () => this.rec('voice.stop', idx) }; }
  registerScores(s: unknown) { this.rec('registerScores', Object.keys(s as object)); }
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
  const bookId = Q.get('book') || 'orbit-party';
  const living = BOOKS[bookId];
  const doc = useMemo(() => buildShowcaseTelaDoc(bookId, living), [bookId, living]);
  const [pageNo, setPageNo] = useState(Number(Q.get('page') || 1));
  const [reduced, setReduced] = useState(Q.get('reduced') === '1');
  const [sound, setSound] = useState(Q.get('sound') === '1');
  const [goals, setGoals] = useState<string[]>([]);
  const [vars, setVars] = useState<Record<string, unknown>>({});
  const audio = useMemo<BookAudioApi>(() => (Q.get('real') === '1' ? getBookAudio() : new LabAudio()), []);
  const ref = useRef<TelaLivePageHandle>(null);
  const frame = doc.frames[pageNo - 1];
  const objects = frameObjects(doc, frame);
  const lp = doc.living!.pages.find(p => p.page === pageNo)!;
  const dev = doc.devices[frame.deviceIds[0]] as { width: number; height: number };
  const w = Number(Q.get('w') || 820);
  useEffect(() => { audio.registerScores(doc.living!.scores); }, [audio, doc]);
  useEffect(() => {
    const t = setInterval(() => setVars(ref.current?.getVars() ?? {}), 150);
    (window as any).__lab = {
      handle: () => ref.current, engine: () => ref.current?.engine(), audio, vars: () => ref.current?.getVars(), goals: () => goals,
      setReduced, setSound, setPage: setPageNo, living: doc.living, doc,
      toClient: (x: number, y: number) => { const r = document.querySelector('.pj-live-page svg')!.getBoundingClientRect(); return { x: r.left + x * r.width / dev.width, y: r.top + y * r.height / dev.height }; },
      groupCenter: (name: string) => {
        const ids = lp.groups?.[name]; if (!ids) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const id of ids) { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGraphicsElement | null; if (!g) continue; const r = g.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
        return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
      },
      objCenter: (id: string) => { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGraphicsElement | null; if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
      computed: (id: string) => { const g = document.querySelector(`[data-obj-id="${id}"]`) as SVGGElement | null; if (!g) return null; const cs = getComputedStyle(g); return { transform: cs.transform, opacity: cs.opacity, visibility: cs.visibility, anims: g.getAnimations().length }; },
      groupAnimCount: (name: string) => (lp.groups?.[name] ?? []).reduce((n, id) => n + ((document.querySelector(`[data-obj-id="${id}"]`) as SVGGElement | null)?.getAnimations().length ?? 0), 0),
    };
    return () => clearInterval(t);
  }, [audio, goals, doc, dev, lp]);
  const btn = (on: boolean): React.CSSProperties => ({ border: 0, borderRadius: 10, padding: '8px 12px', font: '600 13px system-ui', color: on ? '#000' : '#fff', background: on ? '#ff8c00' : '#2a2833', cursor: 'pointer' });
  return (
    <div style={{ display: 'flex', gap: 16, padding: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: w, flex: '0 0 auto' }}>
        <TelaLivePage key={`${bookId}-${pageNo}`} ref={ref} objects={objects} width={dev.width} height={dev.height} living={lp} audio={audio} reducedMotion={reduced} soundEnabled={sound}
          onGoal={(pg, id) => setGoals(g => [...g, `${pg}:${id}`])} onGoto={p => setPageNo(n => (p === 'next' ? n + 1 : p === 'prev' ? n - 1 : Number(p)))} />
      </div>
      <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.7 }}>{bookId} · page {pageNo}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <button style={btn(false)} id="btn-prev" onClick={() => setPageNo(n => Math.max(1, n - 1))}>Prev</button>
          <button style={btn(false)} id="btn-next" onClick={() => setPageNo(n => Math.min(doc.frames.length, n + 1))}>Next</button>
          <button style={btn(reduced)} id="btn-reduced" onClick={() => setReduced(v => !v)}>Reduced motion</button>
          <button style={btn(sound)} id="btn-sound" onClick={() => setSound(v => !v)}>Sound</button>
          <button style={btn(false)} id="btn-replay" onClick={() => ref.current?.replay()}>Play again</button>
        </div>
        <pre id="vars" style={{ margin: 0, fontSize: 11, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{JSON.stringify(vars)}</pre>
        <div id="goals" style={{ fontSize: 12, marginTop: 6 }}>goals: {goals.join(', ') || 'none'}</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
