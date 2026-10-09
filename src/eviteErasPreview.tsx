// Dev-only preview for the "Design eras" evites (services/evite/eraEvites.ts): one large living card with an era
// picker and the "Show the design law" toggle, then every era as a small card. Delete freely.
//   /evite-eras.html?era=<eraId>&law=1&reduced=1
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EviteCard from '../components/evite/EviteCard';
import { ERA_EVITES, eraEvite } from '../services/evite/eraEvites';

const start = Date.UTC(2026, 10, 14, 0, 30);
const sample = (headline: string) => ({ headline, subline: '', startsAt: start, endsAt: start + 3 * 36e5, timezone: 'America/New_York', venueName: 'The Garden Room, 12 Elm Street' });

/** Mount a living card only near the viewport: browsers cap live WebGL contexts (~16), and the grid has 41. */
function InView({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(es => setOn(es.some(e => e.isIntersecting)), { rootMargin: '150px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ aspectRatio: '2 / 3' }}>{on ? children : null}</div>;
}

function App() {
  const q = new URLSearchParams(location.search);
  const [era, setEra] = useState(eraEvite(q.get('era') || '')?.eraId || 'art-deco');
  const [law, setLaw] = useState(q.get('law') === '1');
  const [reduced, setReduced] = useState(q.get('reduced') === '1');
  const [nonce, setNonce] = useState(0);
  const ev = eraEvite(era)!;
  const sync = (e: string, l: boolean) => history.replaceState(null, '', `?era=${e}${l ? '&law=1' : ''}${reduced ? '&reduced=1' : ''}`);
  const btn: React.CSSProperties = { height: 36, padding: '0 14px', borderRadius: 999, border: '1px solid #3a2a55', background: '#150d22', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
  const step = (d: number) => { const i = ERA_EVITES.findIndex(x => x.eraId === era); const n = ERA_EVITES[(i + d + ERA_EVITES.length) % ERA_EVITES.length].eraId; setEra(n); sync(n, law); };
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 390, maxWidth: '100%' }} data-testid="hero">
          <EviteCard key={`${era}/${law}/${nonce}/${reduced}`} plateId={ev.id} fields={sample(`An Evening of ${ev.label}`)} ctaLabel="RSVP" showLaw={law} reducedMotion={reduced} />
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn} onClick={() => step(-1)}>‹ Prev</button>
            <select aria-label="Era" value={era} onChange={e => { setEra(e.target.value); sync(e.target.value, law); }} style={{ ...btn, maxWidth: 240 }}>
              {ERA_EVITES.map(e => <option key={e.eraId} value={e.eraId}>{e.label}</option>)}
            </select>
            <button style={btn} onClick={() => step(1)}>Next ›</button>
            <button style={btn} onClick={() => setNonce(n => n + 1)}>Replay</button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
            <input type="checkbox" checked={law} onChange={e => { setLaw(e.target.checked); sync(era, e.target.checked); }} /> Show the design law
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: .8 }}>
            <input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Reduced motion
          </label>
          <div style={{ fontSize: 13, lineHeight: 1.5, opacity: .85 }}>
            <b style={{ fontSize: 16 }}>{ev.label}</b> · {ev.period}{ev.relief ? ' · letterpress entrance' : ''}<br />
            {ev.lesson}<br />
            <span style={{ opacity: .7 }}>Cantus firmus: {ev.cantusFirmus.label}. {ev.cantusFirmus.governs}</span>
          </div>
        </div>
      </div>
      <h2 style={{ font: '900 italic 20px Outfit,Inter,sans-serif', textTransform: 'uppercase', margin: '28px 0 12px' }}>All {ERA_EVITES.length} eras</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }} data-testid="grid">
        {ERA_EVITES.map(e => (
          <button key={e.eraId} onClick={() => { setEra(e.eraId); sync(e.eraId, law); scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 6 }} aria-label={e.label}>
            <InView><EviteCard plateId={e.id} fields={sample(e.label)} compact reducedMotion={reduced} /></InView>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: .75, textAlign: 'center' }}>{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
