// Dev-only preview for components/evite/EvitePlayGate over a living EviteStage: every kids plate. Delete freely.
//   npx vite --config evite-stage.vite.config.mjs  →  /evite-play.html?id=kids_boy/dino&reduced=1
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EviteStage, { type EviteStageHandle } from '../components/evite/EviteStage';
import EvitePlayGate from '../components/evite/EvitePlayGate';
import { PLATE_COLLECTIONS, plateUrls } from '../services/evite/plateCatalog';
import { recipeFor } from '../services/evite/motionRecipes';
import { playFor, type PlayKind } from '../services/evite/playGames';

const KIDS = PLATE_COLLECTIONS.filter(c => c.id.startsWith('kids_')).flatMap(c => c.plates.map(s => `${c.id}/${s}`));
const KINDS: PlayKind[] = ['pop', 'catch', 'memory', 'hunt', 'candles', 'scratch'];

function App() {
  const q = new URLSearchParams(location.search);
  const [id, setId] = useState(KIDS.includes(q.get('id') || '') ? q.get('id')! : 'kids_boy/dino');
  const [reduced, setReduced] = useState(q.get('reduced') === '1');
  const [gated, setGated] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const stage = useRef<EviteStageHandle>(null);
  const urls = plateUrls(id)!;
  const spec = useMemo(() => playFor(urls.collection, urls.subject), [urls.collection, urls.subject]);
  const recipe = useMemo(() => recipeFor(urls.collection, urls.subject), [urls.collection, urls.subject]);
  const accent = recipe.foil.color;
  const t0 = useRef(performance.now());
  (window as any).__preview = { stage, setId, setReduced, replay: () => replay() };

  const sync = (nid: string, r = reduced) => history.replaceState(null, '', `?id=${nid}${r ? '&reduced=1' : ''}`);
  const pick = (nid: string) => { setId(nid); sync(nid); replay(); };
  const go = (d: number) => pick(KIDS[(KIDS.indexOf(id) + d + KIDS.length) % KIDS.length]);
  const replay = () => { setGated(true); setNonce(n => n + 1); t0.current = performance.now(); stage.current?.replay(); };
  const note = (s: string) => setLog(l => [`${((performance.now() - t0.current) / 1000).toFixed(1)} s · ${s}`, ...l].slice(0, 6));
  const open = (how: 'win' | 'skip') => { note(how === 'win' ? 'onWin' : 'onSkip'); setGated(false); stage.current?.replay(); if (how === 'win') setTimeout(() => stage.current?.celebrate(), 120); };

  const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid #3a2a55', background: '#150d22', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
  const rise = (v: string, px = 24): React.CSSProperties => ({ opacity: gated ? 0 : (`var(${v})` as any), transform: `translateY(calc((1 - var(${v})) * ${px}px))` });
  return (
    <div style={{ display: 'flex', gap: 20, padding: 16, flexWrap: 'wrap', alignItems: 'flex-start', boxSizing: 'border-box', maxWidth: '100vw' }}>
      <div style={{ width: 390, maxWidth: '100%' }}>
        <EviteStage key={`${id}/${reduced}`} ref={stage} plateUrl={urls.plate} depthUrl={urls.depth} collection={urls.collection} subject={urls.subject} reducedMotion={reduced} label={id}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '90px 22px 24px', background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.35) 55%, transparent)', textAlign: 'center' }}>
            <div style={{ ...rise('--rv-head', 10), font: '800 11px Inter', letterSpacing: '.28em', textTransform: 'uppercase', color: accent }}>You're invited</div>
            <div style={{ ...rise('--rv-head', 40), font: '700 40px/0.98 Fredoka,Outfit,sans-serif', margin: '8px 0 10px', textShadow: '0 3px 18px rgba(0,0,0,.5)' }}>Max is turning 6</div>
            <div style={{ ...rise('--rv-details', 12), font: '700 15px Inter' }}>Saturday, October 24 · 2:00 PM</div>
            <div style={{ ...rise('--rv-details', 12), font: '500 13px Inter', opacity: gated ? 0 : 0.8 }}>The Garden Room</div>
            <div style={{ ...rise('--rv-cta', 10), marginTop: 14, display: 'inline-block', padding: '12px 26px', borderRadius: 999, background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', font: '800 13px Inter', letterSpacing: '.08em', textTransform: 'uppercase' }}>RSVP</div>
          </div>
          {gated && spec && <EvitePlayGate key={nonce} spec={spec} accent={accent} reducedMotion={reduced} onWin={() => open('win')} onSkip={() => open('skip')} />}
        </EviteStage>
      </div>
      <div style={{ display: 'grid', gap: 10, maxWidth: 420, width: '100%' }}>
        <div style={{ font: '700 22px Fredoka,Outfit,sans-serif' }}>{id.replace('_', ' ').replace('/', ' · ')}</div>
        <div style={{ font: '600 13px Inter', color: '#bcb3cc' }}>{spec ? `${spec.kind} · goal ${spec.goal} · ${spec.sprite} — “${spec.prompt}”` : 'no gate'}</div>
        <select value={id} onChange={e => pick(e.target.value)} style={{ ...btn, height: 42 }} aria-label="Kids plate">
          {KIDS.map(k => { const p = plateUrls(k)!; const s = playFor(p.collection, p.subject); return <option key={k} value={k}>{k} — {s?.kind}</option>; })}
        </select>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => go(-1)}>‹ Prev</button><button style={btn} onClick={() => go(1)}>Next ›</button>
          <button style={{ ...btn, background: '#6B0099' }} onClick={replay}>Replay game</button>
          <button style={btn} onClick={() => stage.current?.celebrate()}>Celebrate</button>
          <button style={{ ...btn, background: reduced ? '#06D6A0' : '#150d22', color: reduced ? '#002018' : '#fff' }} onClick={() => { const r = !reduced; setReduced(r); sync(id, r); replay(); }}>Reduced motion</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Jump to a kind">
          {KINDS.map(k => { const first = KIDS.find(x => { const p = plateUrls(x)!; return playFor(p.collection, p.subject)?.kind === k; }); return first ? <button key={k} style={{ ...btn, minHeight: 34, fontSize: 11 }} onClick={() => pick(first)}>{k}</button> : null; })}
        </div>
        <pre style={{ margin: 0, fontSize: 11, color: '#bcb3cc', whiteSpace: 'pre-wrap' }}>{log.join('\n') || 'events appear here'}</pre>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
