// MACHINE SOUL: Detroit techno, the Berlin connection, the godfathers and a tribute to Juan Atkins.
// One scrolling building of rooms: Entrance → Timeline → Pioneers → Bridge → The Originator → Edit Bay → Archive.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown } from 'lucide-react';
import { TX_DOCS, TX_SOURCES, pioneerById } from '../../../data/technoExhibit/history';
import { GritStyles, Reveal } from './gritKit';
import { BoothDock, BoothProvider, TrackChip } from './ListeningBooth';
import TimelineRoom from './TimelineRoom';
import PioneersRoom, { PioneerSheet } from './PioneersRoom';
import BerlinRoom from './BerlinRoom';
import AtkinsTribute from './AtkinsTribute';
import SpotPreviz from './SpotPreviz';
import { ShareButton, shareTechnoExhibit } from './TechnoShare';

const ROOMS = [
  { id: 'tx-entrance', label: 'Entrance' },
  { id: 'tx-timeline', label: 'Timeline' },
  { id: 'tx-pioneers', label: 'Pioneers' },
  { id: 'tx-berlin', label: 'Berlin' },
  { id: 'tx-atkins', label: 'The Originator' },
  { id: 'tx-spots', label: 'Edit bay' },
  { id: 'tx-archive', label: 'Archive' },
];

export interface TechnoExhibitProps {
  onBack?: () => void;
  /** Posts a room to the feed. Defaults to shareTechnoExhibit (Plajah createPost); the lab passes a fake. */
  onShare?: (roomId: string) => Promise<void>;
  /** Room to open on, e.g. 'tx-atkins'. */
  initialRoom?: string;
}

function Entrance({ go }: { go: (id: string) => void }) {
  return (
    <section id="tx-entrance" className="tx-brick" style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '110px 16px 80px', overflow: 'hidden' }}>
      <div aria-hidden className="tx-hazard" style={{ position: 'absolute', left: '-5%', right: '-5%', top: 70, height: 26, transform: 'rotate(-2.5deg)', boxShadow: '0 6px 0 rgba(0,0,0,.5)' }} />
      <div aria-hidden className="tx-hazard" style={{ position: 'absolute', left: '-5%', right: '-5%', bottom: 40, height: 26, transform: 'rotate(1.8deg)', boxShadow: '0 6px 0 rgba(0,0,0,.5)' }} />
      <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', position: 'relative' }}>
        <div className="tx-gaffer tx-type tx-slam" style={{ fontSize: 14, ['--tx-rot' as string]: '-2deg' }}>AN EXHIBITION IN SEVEN ROOMS</div>
        <h1 className="tx-stencil tx-spray tx-slam" style={{ margin: '16px 0 0', fontSize: 'clamp(72px,17vw,250px)', color: '#e9e4d6', animationDelay: '.1s' }}>
          MACHINE<br /><span style={{ color: 'var(--tx-cyan)' }}>SOUL</span>
        </h1>
        <div className="tx-poster tx-slam" style={{ fontSize: 'clamp(22px,3.6vw,44px)', color: 'var(--tx-hazard)', marginTop: 10, animationDelay: '.25s' }}>Detroit techno · the Berlin connection · the godfathers</div>
        <p className="tx-type" style={{ maxWidth: 620, fontSize: 17, lineHeight: 1.65, color: 'var(--tx-paper)', marginTop: 22 }}>
          In a city emptied by automation, Black teenagers took the machines that replaced their parents and made them dance. Ten years later, in a city split by a wall, the machines found their second home. This is how techno was born.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 26 }}>
          <button type="button" className="tx-btn" onClick={() => go('tx-timeline')}><ArrowDown size={14} /> Walk the timeline</button>
          <button type="button" className="tx-btn ghost" onClick={() => go('tx-atkins')}>Tribute to Juan Atkins</button>
          <button type="button" className="tx-btn ghost" onClick={() => go('tx-spots')}>Watch the spots</button>
        </div>
        <div className="tx-type" style={{ marginTop: 30, fontSize: 12, color: 'var(--tx-muted)' }}>Music plays from YouTube. All recordings belong to their artists and labels.</div>
      </div>
    </section>
  );
}

function Archive() {
  return (
    <section id="tx-archive" className="tx-wall" style={{ padding: '80px 16px 140px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 07 · THE ARCHIVE</div>
        <h2 className="tx-stencil tx-spray" style={{ margin: 0, fontSize: 'clamp(44px,8vw,110px)', color: 'var(--tx-paper)' }}>WATCH · READ</h2>
        <Reveal className="tx-paste" style={{ padding: '18px', marginTop: 26 }}>
          <div className="tx-poster" style={{ color: '#111', fontSize: 26, marginBottom: 10 }}>Films & interviews</div>
          <div style={{ display: 'grid', gap: 8 }}>{TX_DOCS.map((d) => <TrackChip key={d.id} track={d} />)}</div>
        </Reveal>
        <Reveal className="tx-paste" rot={0.8} style={{ padding: '18px', marginTop: 26 }}>
          <div className="tx-poster" style={{ color: '#111', fontSize: 26, marginBottom: 10 }}>Sources & further reading</div>
          <ul className="tx-type" style={{ margin: 0, paddingLeft: 18, color: '#222', lineHeight: 1.8 }}>{TX_SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
        </Reveal>
      </div>
    </section>
  );
}

export default function TechnoExhibit({ onBack, onShare = shareTechnoExhibit, initialRoom }: TechnoExhibitProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState('tx-entrance');
  const [pioneer, setPioneer] = useState<string | null>(null);

  const go = (id: string) => {
    const root = rootRef.current; const el = root?.querySelector<HTMLElement>(`#${id}`);
    if (root && el) root.scrollTo({ top: el.offsetTop - 52, behavior: 'smooth' });
  };

  useEffect(() => { if (initialRoom) requestAnimationFrame(() => go(initialRoom)); }, [initialRoom]);

  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const onScroll = () => {
      let cur = ROOMS[0].id;
      for (const r of ROOMS) { const el = root.querySelector<HTMLElement>(`#${r.id}`); if (el && el.offsetTop - 120 <= root.scrollTop) cur = r.id; }
      setRoom(cur);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  const p = pioneer ? pioneerById(pioneer) : undefined;

  return (
    <BoothProvider>
      <div ref={rootRef} className="tx">
        <GritStyles />
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <filter id="tx-rough"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter>
        </svg>
        <nav aria-label="Exhibition rooms" style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(11,11,12,.92)', borderBottom: '2px solid #000', backdropFilter: 'blur(6px)', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {onBack && <button type="button" onClick={onBack} aria-label="Back" style={{ flex: 'none', background: 'none', border: 0, color: '#e9e4d6', cursor: 'pointer', padding: 6, display: 'grid', placeItems: 'center' }}><ArrowLeft size={18} /></button>}
          <span className="tx-stencil" style={{ flex: 'none', fontSize: 22, color: 'var(--tx-cyan)', marginRight: 8 }}>MACHINE SOUL</span>
          {ROOMS.map((r) => (
            <button key={r.id} type="button" onClick={() => go(r.id)} aria-current={room === r.id ? 'location' : undefined}
              style={{ flex: 'none', cursor: 'pointer', border: 0, padding: '6px 9px', font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: '.12em', textTransform: 'uppercase', background: room === r.id ? 'var(--tx-hazard)' : 'transparent', color: room === r.id ? '#111' : 'rgba(233,228,214,.75)' }}>{r.label}</button>
          ))}
          <ShareButton run={() => onShare(room)} label="Share this room" style={{ flex: 'none', marginLeft: 'auto' }} />
        </nav>

        <Entrance go={go} />
        <TimelineRoom onPioneer={setPioneer} />
        <PioneersRoom onOpen={setPioneer} />
        <BerlinRoom />
        <AtkinsTribute onShare={() => onShare('tx-atkins')} />
        <SpotPreviz />
        <Archive />
        <BoothDock />
        {p && <PioneerSheet p={p} onClose={() => setPioneer(null)} />}
      </div>
    </BoothProvider>
  );
}
