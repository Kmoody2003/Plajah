// Room 3: the poster wall. Every pioneer is a wheat-pasted bill on brick; tap one to pull it off the wall
// and read the story, the labels and the records.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { TX_PIONEERS, type TxPioneer, trackById } from '../../../data/technoExhibit/history';
import { Reveal, Tape, tilt } from './gritKit';
import { TrackChip } from './ListeningBooth';

const WAVES: Array<{ id: TxPioneer['wave']; label: string; sub: string }> = [
  { id: 'roots', label: 'The Roots', sub: 'The ears and hands before the name' },
  { id: 'first', label: 'The First Wave', sub: 'Belleville and Deep Space Soundworks' },
  { id: 'second', label: 'The Second Wave', sub: 'Masks, minimalism and Planet E' },
  { id: 'berlin', label: 'The Berlin Side', sub: 'The people who opened the vault' },
];

const initials = (name: string) => name.replace(/["“”]/g, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.toLowerCase() !== 'the').map((w) => w[0]).slice(0, 2).join('');

function Poster({ p, onOpen, big = false }: { p: TxPioneer; onOpen: () => void; big?: boolean }) {
  const rot = tilt(p.id, 2.6);
  return (
    <Reveal rot={rot} style={{ position: 'relative' }}>
      <button type="button" onClick={onOpen} className="tx-paste" aria-label={`${p.name}: open poster`}
        style={{ display: 'block', width: '100%', cursor: 'pointer', border: 0, padding: 0, textAlign: 'left', transition: 'transform .15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03) rotate(-1deg)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = '')}>
        <div className="tx-halftone" style={{ position: 'relative', aspectRatio: big ? '4 / 5' : '3 / 4', background: `linear-gradient(160deg, ${p.ink}, #111 85%)`, overflow: 'hidden' }}>
          <div className="tx-halftone" style={{ position: 'absolute', inset: 0 }} />
          <div className="tx-stencil" aria-hidden style={{ position: 'absolute', right: -10, bottom: -24, fontSize: big ? 220 : 150, color: 'rgba(0,0,0,.55)', lineHeight: 1 }}>{initials(p.name)}</div>
          <div style={{ position: 'absolute', left: 12, top: 12, font: "600 10px/1 'IBM Plex Mono',monospace", letterSpacing: '.16em', background: '#111', color: p.ink === '#ffffff' ? '#ffd400' : p.ink, padding: '4px 6px' }}>{p.city.toUpperCase()}</div>
          <div className="tx-stencil" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, fontSize: big ? 22 : 16, color: '#e9e4d6', textShadow: '2px 2px 0 #000' }}>{p.tag}</div>
        </div>
        <div style={{ padding: '10px 12px 14px' }}>
          <div className="tx-poster" style={{ fontSize: big ? 30 : 22, color: '#111' }}>{p.name}</div>
          <div style={{ font: "400 11px/1.35 'IBM Plex Mono',monospace", color: '#333', marginTop: 4 }}>{p.role}</div>
        </div>
      </button>
      <Tape style={{ top: -8, left: '50%', marginLeft: -43, transform: `rotate(${rot * 2}deg)` }} />
    </Reveal>
  );
}

export function PioneerSheet({ p, onClose }: { p: TxPioneer; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const tracks = p.trackIds.map(trackById).filter(Boolean);
  return (
    <div role="dialog" aria-modal aria-label={p.name} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="tx-paste tx-slam" style={{ ['--tx-rot' as string]: '-1deg', width: 'min(640px,100%)', padding: '26px 22px 22px', position: 'relative' }}>
        <Tape style={{ top: -10, left: 24, transform: 'rotate(-6deg)' }} /><Tape style={{ top: -10, right: 24, transform: 'rotate(5deg)' }} />
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', right: 10, top: 10, background: '#111', color: '#e9e4d6', border: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
        <div style={{ font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: '.18em', color: '#555' }}>{p.city.toUpperCase()} · {p.role.toUpperCase()}</div>
        <h3 className="tx-poster" style={{ margin: '8px 0 4px', fontSize: 'clamp(34px,6vw,52px)', color: '#111' }}>{p.name}</h3>
        {p.aka.length > 0 && <div className="tx-type" style={{ color: '#444', fontSize: 14 }}>a.k.a. {p.aka.join(' · ')}</div>}
        <p className="tx-type" style={{ fontSize: 16, lineHeight: 1.6, color: '#1b1b1b', margin: '16px 0' }}>{p.story}</p>
        {p.labels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {p.labels.map((l) => <span key={l} className="tx-stencil" style={{ background: '#111', color: '#ffd400', padding: '6px 10px', fontSize: 18 }}>{l}</span>)}
          </div>
        )}
        {tracks.length > 0 && <div style={{ display: 'grid', gap: 6 }}>{tracks.map((t) => <TrackChip key={t!.id} track={t!} />)}</div>}
      </div>
    </div>
  );
}

export default function PioneersRoom({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <section id="tx-pioneers" className="tx-brick" style={{ padding: '80px 16px 100px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 03 · THE GODFATHERS</div>
        <h2 className="tx-stencil tx-spray" style={{ margin: 0, fontSize: 'clamp(48px,9vw,120px)', color: 'var(--tx-red)' }}>THE PIONEERS</h2>
        <p className="tx-type" style={{ color: 'var(--tx-paper)', fontSize: 16, maxWidth: 640, lineHeight: 1.6 }}>
          The "Belleville Three" (Juan Atkins, Derrick May and Kevin Saunderson) are called the godfathers of techno. They never worked alone. Tap a poster.
        </p>
        {WAVES.map((w) => {
          const people = TX_PIONEERS.filter((p) => p.wave === w.id);
          return (
            <div key={w.id} style={{ marginTop: 56 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
                <h3 className="tx-stencil" style={{ margin: 0, fontSize: 'clamp(30px,4.5vw,48px)', color: 'var(--tx-paper)' }}>{w.label}</h3>
                <span className="tx-type" style={{ color: 'var(--tx-muted)', fontSize: 14 }}>{w.sub}</span>
              </div>
              <div style={{ display: 'grid', gap: 28, gridTemplateColumns: w.id === 'first' ? 'repeat(auto-fit,minmax(220px,1fr))' : 'repeat(auto-fill,minmax(180px,1fr))' }}>
                {people.map((p) => <Poster key={p.id} p={p} big={w.id === 'first' && p.id !== 'fowlkes'} onOpen={() => onOpen(p.id)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
