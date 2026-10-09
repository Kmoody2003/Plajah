// Dev-only preview for components/evite/EviteStage: every production plate, living. Delete freely.
//   /evite-stage.html?c=<collection>&s=<subject>&reduced=1
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EviteStage, { type EviteStageHandle } from '../components/evite/EviteStage';
import manifest from '../docs/evites/production/manifest.json';
import { recipeFor } from '../services/evite/motionRecipes';

const ALL = (manifest as any).grids.flatMap((g: any) => g.subjects.map((s: string) => ({ c: g.collection as string, s })));
const FORMAL = new Set(['wedding', 'anniversary', 'faith', 'military']);

function App() {
  const q = new URLSearchParams(location.search);
  const start = Math.max(0, ALL.findIndex((x: any) => x.c === q.get('c') && x.s === q.get('s')));
  const [i, setI] = useState(start);
  const [reduced, setReduced] = useState(q.get('reduced') === '1');
  const [nonce, setNonce] = useState(0);
  const stage = useRef<EviteStageHandle>(null);
  (window as any).__stage = stage;
  const { c, s } = ALL[i];
  const r = useMemo(() => recipeFor(c, s), [c, s]);
  const formal = FORMAL.has(c);
  const go = (d: number) => { const n = (i + d + ALL.length) % ALL.length; setI(n); history.replaceState(null, '', `?c=${ALL[n].c}&s=${ALL[n].s}${reduced ? '&reduced=1' : ''}`); };
  const btn: React.CSSProperties = { height: 38, padding: '0 14px', borderRadius: 999, border: '1px solid #3a2a55', background: '#150d22', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
  const rise = (v: string, px = 24): React.CSSProperties => ({ opacity: `var(${v})` as any, transform: `translateY(calc((1 - var(${v})) * ${px}px))` });
  return (
    <div style={{ display: 'flex', gap: 24, padding: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 390, maxWidth: '100%' }}>
        <EviteStage key={`${c}/${s}/${nonce}/${reduced}`} ref={stage} plateUrl={`/plates/${c}/${s}.jpg`} depthUrl={`/depth/${c}/${s}.depth.png`} collection={c} subject={s} reducedMotion={reduced} label={`${c} ${s}`}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '90px 22px 24px', background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.35) 55%, transparent)', textAlign: 'center' }}>
            <div style={{ ...rise('--rv-head', 10), font: '800 11px Inter', letterSpacing: '.28em', textTransform: 'uppercase', color: r.foil.color }}>{formal ? 'Together with their families' : "You're invited"}</div>
            <div style={{ ...rise('--rv-head', 40), font: formal ? 'italic 500 44px/1 "Cormorant Garamond",serif' : 'italic 900 40px/0.95 Outfit,sans-serif', textTransform: formal ? 'none' : 'uppercase', margin: '8px 0 10px', textShadow: '0 3px 18px rgba(0,0,0,.5)' }}>{formal ? 'Mira & Ellis' : 'Max is turning 6'}</div>
            <div style={{ ...rise('--rv-details', 12), font: '700 15px Inter' }}>Saturday, October 24 · 2:00 PM</div>
            <div style={{ ...rise('--rv-details', 12), font: '500 13px Inter', opacity: 0.8 as any }}>The Garden Room</div>
            <div style={{ ...rise('--rv-cta', 10), marginTop: 14, display: 'inline-block', padding: '12px 26px', borderRadius: 999, background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', font: '800 13px Inter', letterSpacing: '.08em', textTransform: 'uppercase' }}>RSVP</div>
          </div>
        </EviteStage>
      </div>
      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <div style={{ font: '900 italic 22px Outfit', textTransform: 'uppercase' }}>{c.replace('_', ' ')} · {s.replace(/-/g, ' ')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => go(-1)}>‹ Prev</button><button style={btn} onClick={() => go(1)}>Next ›</button>
          <button style={btn} onClick={() => setNonce(n => n + 1)}>Replay reveal</button>
          <button style={btn} onClick={() => stage.current?.celebrate()}>RSVP yes</button>
          <button style={{ ...btn, background: reduced ? '#06D6A0' : '#150d22', color: reduced ? '#002018' : '#fff' }} onClick={() => setReduced(v => !v)}>Reduced motion</button>
        </div>
        <pre style={{ margin: 0, fontSize: 11, color: '#bcb3cc', whiteSpace: 'pre-wrap' }}>{JSON.stringify({ parallax: r.parallax, popIn: r.popIn, sweep: r.sweep, foil: r.foil, flicker: r.flicker, caustics: r.caustics, fog: r.fog, twinkle: r.twinkle, emitter: r.emitter?.kind, burst: r.burst, spring: r.spring, revealMs: r.revealMs }, null, 1)}</pre>
        <select value={i} onChange={e => { setI(+e.target.value); }} style={{ ...btn, height: 40 }} aria-label="Plate">
          {ALL.map((x: any, k: number) => <option key={k} value={k}>{x.c} / {x.s}</option>)}
        </select>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
