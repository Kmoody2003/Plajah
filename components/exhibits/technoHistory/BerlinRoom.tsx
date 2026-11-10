// Room 4: the bridge. A spray-painted arc crosses a xeroxed Atlantic from Detroit to Berlin as you scroll
// in; stops along it are the records and rooms that tied the two cities together.
import React, { useState } from 'react';
import { TX_ERAS, trackById } from '../../../data/technoExhibit/history';
import { Reveal, useReveal } from './gritKit';
import { TrackChip } from './ListeningBooth';

const BRIDGE_IDS = ['e-compilation', 'e-hardwax', 'e-wall', 'e-tresor', 'e-3mb', 'e-basic', 'e-bells', 'e-borderland'];
const ALL = TX_ERAS.flatMap((e) => e.events);
const STOPS = BRIDGE_IDS.map((id) => ALL.find((e) => e.id === id)!).filter(Boolean);

const PAIRS: Array<[string, string]> = [
  ['Empty car plants', 'Empty power stations'],
  ['A city that lost its industry', 'A city that lost its border'],
  ['Machines took the jobs', 'Nobody owned the buildings'],
  ['Kids with drum machines', 'Kids with keys to a bank vault'],
  ['Made the records', 'Played them loudest'],
];

export default function BerlinRoom() {
  const mapRef = useReveal<HTMLDivElement>();
  const [stop, setStop] = useState(3);
  const s = STOPS[stop];
  const tracks = (s?.trackIds || []).map(trackById).filter(Boolean);
  // arc parameter for the marker
  const k = STOPS.length > 1 ? stop / (STOPS.length - 1) : 0;
  const bx = (1 - k) * (1 - k) * 120 + 2 * (1 - k) * k * 500 + k * k * 880;
  const by = (1 - k) * (1 - k) * 300 + 2 * (1 - k) * k * 40 + k * k * 220;

  return (
    <section id="tx-berlin" className="tx-wall" style={{ padding: '80px 16px 100px', background: '#0e0f11' }}>
      <style>{BERLIN_CSS}</style>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 04 · THE BRIDGE</div>
        <h2 className="tx-stencil tx-spray" style={{ margin: 0, fontSize: 'clamp(44px,8.4vw,112px)', color: '#fff' }}>DETROIT <span style={{ color: 'var(--tx-cyan)' }}>⟷</span> BERLIN</h2>
        <p className="tx-type" style={{ color: 'var(--tx-paper)', fontSize: 16, maxWidth: 700, lineHeight: 1.6 }}>
          Two cities broken by the twentieth century found each other in the nineties. Detroit artists who struggled for gigs at home played to packed vaults in Berlin, and Berlin answered with records of its own.
        </p>

        <div ref={mapRef} className="txb-map tx-reveal">
          <svg viewBox="0 0 1000 360" role="img" aria-label="Map line from Detroit to Berlin across the Atlantic" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <pattern id="txb-ht" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.1" fill="rgba(233,228,214,.12)" /></pattern>
            </defs>
            <rect width="1000" height="360" fill="url(#txb-ht)" />
            {/* rough continents as xerox blobs */}
            <path d="M20 120 C60 80 150 70 200 110 C240 150 230 230 190 290 C150 340 80 330 50 280 C20 230 0 170 20 120Z" fill="rgba(233,228,214,.08)" stroke="rgba(233,228,214,.25)" strokeDasharray="4 6" />
            <path d="M760 90 C820 60 930 70 980 120 C1000 170 970 250 900 280 C840 300 780 270 760 220 C740 170 730 120 760 90Z" fill="rgba(233,228,214,.08)" stroke="rgba(233,228,214,.25)" strokeDasharray="4 6" />
            <text x="500" y="330" textAnchor="middle" fill="rgba(233,228,214,.28)" style={{ font: "600 13px 'IBM Plex Mono',monospace", letterSpacing: '.6em' }}>ATLANTIC · ~4,200 MI</text>
            <path className="txb-arc" d="M120 300 Q500 40 880 220" fill="none" stroke="#00e5ff" strokeWidth="7" strokeLinecap="round" filter="url(#tx-rough)" />
            <path d="M120 300 Q500 40 880 220" fill="none" stroke="#00e5ff" strokeWidth="18" opacity=".12" />
            <circle cx="120" cy="300" r="10" fill="#ff5a1f" /><circle cx="880" cy="220" r="10" fill="#fff" />
            <text x="120" y="338" textAnchor="middle" fill="#ff5a1f" className="tx-stencil" style={{ fontSize: 30 }}>DETROIT</text>
            <text x="880" y="262" textAnchor="middle" fill="#fff" className="tx-stencil" style={{ fontSize: 30 }}>BERLIN</text>
            <g style={{ transition: 'transform .5s cubic-bezier(.2,1.4,.3,1)', transform: `translate(${bx}px,${by}px)` }}>
              <circle r="16" fill="#ffd400" stroke="#111" strokeWidth="4" />
              <circle r="28" fill="none" stroke="#ffd400" strokeWidth="2" opacity=".5"><animate attributeName="r" values="16;34;16" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values=".6;0;.6" dur="1.6s" repeatCount="indefinite" /></circle>
            </g>
          </svg>
          <div role="tablist" aria-label="Stops on the bridge" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
            {STOPS.map((st, i) => (
              <button key={st.id} role="tab" aria-selected={i === stop} type="button" className="tx-chip" aria-pressed={i === stop} onClick={() => setStop(i)}>{st.when}</button>
            ))}
          </div>
        </div>

        {s && (
          <div key={s.id} className="tx-paste tx-slam" style={{ ['--tx-rot' as string]: '-.6deg', maxWidth: 720, margin: '26px auto 0', padding: '20px 20px 18px' }}>
            <div className="tx-stencil" style={{ color: '#111', fontSize: 24 }}>{s.when}</div>
            <h3 className="tx-poster" style={{ margin: '4px 0 8px', fontSize: 32, color: '#111' }}>{s.title}</h3>
            <p className="tx-type" style={{ margin: 0, color: '#222', fontSize: 15, lineHeight: 1.6 }}>{s.body}</p>
            {tracks.length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>{tracks.map((t) => <TrackChip key={t!.id} track={t!} />)}</div>}
          </div>
        )}

        <h3 className="tx-stencil" style={{ margin: '70px 0 18px', fontSize: 'clamp(30px,4.5vw,48px)', textAlign: 'center' }}>TWO BROKEN CITIES</h3>
        <div className="txb-pairs">
          {PAIRS.map(([d, b], i) => (
            <Reveal key={i} className="txb-pair" rot={i % 2 ? 0.8 : -0.8}>
              <div className="txb-d tx-poster">{d}</div>
              <div className="txb-x tx-stencil">×</div>
              <div className="txb-b tx-poster">{b}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const BERLIN_CSS = `
.txb-map{margin-top:34px;padding:16px;border:2px solid rgba(233,228,214,.2);background:#08090a}
.txb-arc{stroke-dasharray:1200;stroke-dashoffset:1200;transition:stroke-dashoffset 2.4s cubic-bezier(.6,0,.2,1) .2s}
.txb-map.in .txb-arc{stroke-dashoffset:0}
.txb-pairs{display:grid;gap:12px;max-width:860px;margin:0 auto}
.txb-pair{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px}
.txb-d{background:#ff5a1f;color:#111;padding:12px 14px;font-size:clamp(16px,2.4vw,24px);text-align:right}
.txb-b{background:#e9e4d6;color:#111;padding:12px 14px;font-size:clamp(16px,2.4vw,24px)}
.txb-x{font-size:34px;color:#00e5ff}
`;
