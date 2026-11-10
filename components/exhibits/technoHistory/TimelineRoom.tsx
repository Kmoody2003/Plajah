// Room 2: the animated timeline. A spray-painted spine draws itself as you scroll, a stencilled year
// counter rolls to the era you're in, and each event slams onto the wall like a wheat-pasted bill.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TX_ERAS, type TxEvent, type TxPlace, trackById, pioneerById } from '../../../data/technoExhibit/history';
import { Reveal, Tape, tilt } from './gritKit';
import { TrackChip } from './ListeningBooth';

const PLACE_LABEL: Record<TxPlace, string> = { detroit: 'DETROIT', berlin: 'BERLIN', bridge: 'DETROIT ⟷ BERLIN', world: 'WORLD' };
const FILTERS: Array<{ id: 'all' | TxPlace; label: string }> = [
  { id: 'all', label: 'Everything' }, { id: 'detroit', label: 'Detroit' }, { id: 'berlin', label: 'Berlin' }, { id: 'bridge', label: 'The bridge' },
];

function useYearCounter(target: number) {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    let raf = 0; const from = shown; const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 650);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (target - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return shown;
}

function EventBill({ ev, ink, side, onSeen, onPioneer }: { ev: TxEvent; ink: string; side: 'l' | 'r'; onSeen: (y: number) => void; onPioneer?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && onSeen(ev.year)), { rootMargin: '-45% 0px -45% 0px' });
    io.observe(el); return () => io.disconnect();
  }, [ev.year, onSeen]);
  const tracks = (ev.trackIds || []).map(trackById).filter(Boolean);
  const people = (ev.pioneerIds || []).map(pioneerById).filter(Boolean);
  const rot = tilt(ev.id, 1.8);
  return (
    <div ref={ref} className={`txt-row txt-${side}`}>
      <div className="txt-dot" style={{ background: ink, boxShadow: `0 0 0 4px #0b0b0c, 0 0 18px ${ink}` }} />
      <Reveal className="txt-bill" rot={rot}>
        <div className="tx-paste" style={{ padding: '18px 18px 16px' }}>
          <Tape style={{ top: -10, left: side === 'l' ? 'auto' : 18, right: side === 'l' ? 18 : 'auto', transform: `rotate(${rot * 3}deg)` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="tx-stencil" style={{ fontSize: 26, color: '#111' }}>{ev.when}</span>
            <span style={{ font: "600 10px/1 'IBM Plex Mono',monospace", letterSpacing: '.14em', padding: '4px 6px', background: '#111', color: ev.place === 'berlin' ? '#fff' : ink === '#ffffff' ? '#ffd400' : ink }}>{PLACE_LABEL[ev.place]}</span>
          </div>
          <h4 className="tx-poster" style={{ margin: '0 0 8px', fontSize: 'clamp(22px,3vw,30px)', color: '#111' }}>{ev.title}</h4>
          <p className="tx-type" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#222' }}>{ev.body}</p>
          {people.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {people.map((p) => (
                <button key={p!.id} type="button" onClick={() => onPioneer?.(p!.id)} style={{ cursor: 'pointer', border: '1.5px dashed #111', background: 'transparent', padding: '3px 7px', font: "600 10px/1.2 'IBM Plex Mono',monospace", letterSpacing: '.08em', textTransform: 'uppercase', color: '#111' }}>{p!.name}</button>
              ))}
            </div>
          )}
          {tracks.length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>{tracks.map((t) => <TrackChip key={t!.id} track={t!} compact />)}</div>}
        </div>
      </Reveal>
    </div>
  );
}

export default function TimelineRoom({ onPioneer }: { onPioneer?: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | TxPlace>('all');
  const [year, setYear] = useState(1967);
  const shownYear = useYearCounter(year);
  const sectionRef = useRef<HTMLElement>(null);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const sec = sectionRef.current; if (!sec) return;
    const root = sec.closest('.tx') as HTMLElement | null; if (!root) return;
    const onScroll = () => {
      const r = sec.getBoundingClientRect(); const rr = root.getBoundingClientRect();
      const mid = rr.top + rr.height * 0.55;
      setFill(Math.max(0, Math.min(1, (mid - r.top) / r.height)));
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  const eras = useMemo(() => TX_ERAS.map((era) => ({ ...era, events: era.events.filter((e) => filter === 'all' || e.place === filter || (filter !== 'bridge' && e.place === 'bridge')) })).filter((e) => e.events.length), [filter]);
  const seen = React.useCallback((y: number) => setYear(y), []);
  let n = 0;

  return (
    <section ref={sectionRef} id="tx-timeline" className="tx-wall" style={{ position: 'relative', padding: '80px 0 120px' }}>
      <style>{TIMELINE_CSS}</style>
      <div className="txt-head">
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 02 · THE TIMELINE</div>
        <h2 className="tx-stencil tx-spray" style={{ margin: 0, fontSize: 'clamp(48px,9vw,120px)', color: 'var(--tx-hazard)' }}>1967 → TODAY</h2>
        <div role="group" aria-label="Filter the timeline" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          {FILTERS.map((f) => <button key={f.id} type="button" className="tx-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>

      <div className="txt-year tx-stencil" aria-live="polite" aria-label={`Year ${shownYear}`}>{shownYear}</div>

      <div className="txt-track">
        <div className="txt-spine"><div className="txt-spine-fill" style={{ transform: `scaleY(${fill})` }} /></div>
        {eras.map((era) => (
          <div key={era.id} className="txt-era">
            <Reveal className="txt-era-head" rot={tilt(era.id, 1)}>
              <div style={{ font: "600 12px/1 'IBM Plex Mono',monospace", letterSpacing: '.24em', color: era.ink, marginBottom: 6 }}>{era.range}</div>
              <h3 className="tx-stencil tx-spray tx-drip" style={{ margin: 0, color: era.ink, fontSize: 'clamp(38px,6vw,76px)' }}>{era.title}</h3>
              <div className="tx-type" style={{ marginTop: 18, color: 'var(--tx-paper)', fontSize: 15, lineHeight: 1.6, maxWidth: 640, marginInline: 'auto' }}>
                <strong style={{ color: era.ink }}>{era.kicker}.</strong> {era.summary}
              </div>
            </Reveal>
            {era.events.map((ev) => <EventBill key={ev.id} ev={ev} ink={era.ink} side={n++ % 2 === 0 ? 'l' : 'r'} onSeen={seen} onPioneer={onPioneer} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

const TIMELINE_CSS = `
.txt-head{max-width:1100px;margin:0 auto;padding:0 16px 40px}
.txt-year{position:sticky;top:64px;z-index:3;margin-left:auto;width:max-content;padding:0 16px;font-size:clamp(56px,10vw,140px);color:transparent;-webkit-text-stroke:2px rgba(233,228,214,.28);pointer-events:none;height:0;overflow:visible;line-height:1}
.txt-track{position:relative;max-width:1100px;margin:0 auto;padding:0 16px}
.txt-spine{position:absolute;top:0;bottom:0;left:50%;width:6px;margin-left:-3px;background:rgba(255,255,255,.06)}
.txt-spine-fill{position:absolute;inset:0;transform-origin:top;background:linear-gradient(#ff5a1f,#ffd400 18%,#00e5ff 36%,#ff2d55 52%,#b8ff00 66%,#fff 80%,#a63be6);box-shadow:0 0 18px rgba(255,212,0,.35);transition:transform .12s linear;filter:url(#tx-rough)}
.txt-era{position:relative;padding-top:40px}
.txt-era-head{position:relative;z-index:2;text-align:center;padding:40px 0 30px;background:radial-gradient(ellipse at center,rgba(11,11,12,.92) 40%,transparent 72%)}
.txt-row{position:relative;display:flex;padding:22px 0}
.txt-l{justify-content:flex-start}.txt-r{justify-content:flex-end}
.txt-bill{width:calc(50% - 44px)}
.txt-dot{position:absolute;left:50%;top:44px;width:18px;height:18px;margin-left:-9px;border-radius:50%;z-index:2}
@media (max-width:760px){
  .txt-spine{left:22px}.txt-dot{left:22px}
  .txt-row,.txt-l,.txt-r{justify-content:flex-end}
  .txt-bill{width:calc(100% - 48px)}
  .txt-era-head{text-align:left;padding-left:44px}
  .txt-year{top:56px;font-size:64px}
}
`;
