/**
 * Founding Era: "The whole era on one line". A horizontal, scrubbable timeline from 1754 to 1817. Four coloured bands are the
 * four presidencies (a grey band before them); event pins come from the exhibit's own milestones and carry the confidence
 * grades of the ledger claims behind them. Tap or press Enter on a pin to open its room. A slider scrubs the years;
 * Previous and Next step between events; every control is a real button or input, so the keyboard reaches all of it.
 *
 * A plain note under the line, always visible, says that enslaved people lived in every presidency; the 1790 and 1810
 * census counts (Census Bureau, see the ledger) sit on a strip that runs the whole width. Lazy-loaded by DossierHall.
 * Reduced motion: no smooth scrolling and no transitions.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Claim, Confidence, Dossier } from '../../../services/dossier/dossierTypes';
import {
  CENSUS_POINTS, FOUNDING_RANGE, PRESIDENCIES, SLAVERY_NOTE, foundingMilestones, type FoundingPin,
} from '../../../data/dossier/foundingTimeline';

interface Props {
  dossier: Dossier;
  /** Opens a room of the exhibit (DossierHall's own room navigation). */
  onGoRoom?: (roomId: string) => void;
}

const CHIP: Record<Confidence, { label: string; mark: string }> = {
  established: { label: 'Established', mark: '●' },
  probable: { label: 'Probable', mark: '◐' },
  contested: { label: 'Contested', mark: '▲' },
  tradition: { label: 'Tradition', mark: '◇' },
};
const CONF_ORDER: Confidence[] = ['established', 'probable', 'contested', 'tradition'];

const CARD_W = 156;
const LANE_H = 134;
const PAD_L = 28;
const PAD_R = CARD_W + 36;
const AXIS_Y = 112;
const MIN_PPY = 56;
const MAX_LANES = 3;

const CSS = `
.ft{--ft-line:rgba(255,255,255,.16);--ft-mute:#b4ac9f;--ft-ink:#f4efe6;container-type:inline-size;color:var(--ft-ink);font-family:'Inter',system-ui,sans-serif}
.ft *{box-sizing:border-box}
.ft-box{border:1px solid var(--ft-line);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01)),var(--dh-bg,#101615);overflow:hidden}
.ft-read{display:grid;grid-template-columns:auto 1fr auto;gap:6px 22px;align-items:center;padding:clamp(14px,2.6cqw,24px) clamp(14px,2.6cqw,26px);border-bottom:1px solid var(--ft-line)}
.ft-year{font-family:var(--dh-font-d,'Libre Caslon Text'),Georgia,serif;font-weight:var(--dh-d-weight,700);font-size:clamp(46px,8cqw,84px);line-height:.95;color:var(--dh-a,#4fb3a0);letter-spacing:-.02em;font-variant-numeric:lining-nums tabular-nums;min-width:2.4ch}
.ft-what{min-width:0}
.ft-band{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--ft-ink);margin-bottom:4px}
.ft-band{flex-wrap:wrap}
.ft-band i{width:12px;height:12px;border-radius:3px;display:inline-block;flex:none}
.ft-label{font-family:var(--dh-font-b,'Source Serif 4'),Georgia,serif;font-size:clamp(18px,2.4cqw,22px);line-height:1.35;margin:0}
.ft-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.ft-chip{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;line-height:1;padding:5px 9px;border-radius:999px;border:1.5px solid currentColor;white-space:nowrap}
.ft-chip.established{color:#8fd8b4}.ft-chip.probable{color:#9cc0f5}.ft-chip.contested{color:#f2c37c;background:rgba(242,195,124,.1)}.ft-chip.tradition{color:#f0a9a0;border-style:dashed;background:rgba(240,169,160,.08)}
.ft-go{align-self:center;border:1.5px solid var(--dh-a,#4fb3a0);background:transparent;color:var(--dh-a,#4fb3a0);border-radius:999px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;white-space:nowrap}
.ft-go:hover,.ft-go:focus-visible{background:var(--dh-a,#4fb3a0);color:var(--dh-a-ink,#0b0a0d);outline:none}
.ft-ctl{display:flex;align-items:center;gap:12px;padding:12px clamp(14px,2.6cqw,26px);border-bottom:1px solid var(--ft-line)}
.ft-step{border:1.5px solid var(--ft-line);background:none;color:var(--ft-ink);border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.ft-step:hover,.ft-step:focus-visible{border-color:var(--dh-a,#4fb3a0);outline:none}
.ft-step:disabled{opacity:.4;cursor:default}
.ft-slide{flex:1;min-width:0;accent-color:var(--dh-a,#4fb3a0);height:30px;margin:0}
.ft-scroll{overflow-x:auto;overflow-y:hidden;position:relative;scrollbar-color:var(--dh-a,#4fb3a0) rgba(255,255,255,.08)}
.ft-scroll:focus-visible{outline:2px solid var(--dh-a,#4fb3a0);outline-offset:-2px}
.ft-inner{position:relative}
.ft-bands{position:absolute;left:0;right:0;top:12px;height:44px}
.ft-bandbar{position:absolute;top:0;height:44px;display:flex;align-items:center;padding:0 10px;color:#0b0a0d;font-size:15px;font-weight:700;overflow:hidden;white-space:nowrap;border-radius:5px;border-right:2px solid var(--dh-bg,#101615)}
.ft-bandbar small{font-weight:500;font-size:13px;margin-left:8px;opacity:.85}
.ft-ticks{position:absolute;left:0;right:0;top:62px;height:26px}
.ft-tick{position:absolute;top:0;font-size:13px;color:var(--ft-mute);transform:translateX(-50%);font-variant-numeric:tabular-nums}
.ft-tick:before{content:"";position:absolute;left:50%;top:-6px;width:1px;height:6px;background:var(--ft-mute)}
.ft-slavery{position:absolute;left:0;right:0;top:86px;height:20px;background:repeating-linear-gradient(90deg,rgba(242,195,124,.35) 0 6px,transparent 6px 12px);border-radius:3px}
.ft-slavery span{position:sticky;left:10px;display:inline-block;margin-left:10px;font-size:13px;line-height:20px;font-weight:600;color:#f6d9a8;background:var(--dh-bg,#101615);padding:0 8px;border-radius:3px}
.ft-census{position:absolute;top:86px;height:20px;transform:translateX(-4px);font-size:13px;line-height:20px;font-weight:600;color:#0b0a0d;background:#f2c37c;padding:0 8px;border-radius:3px;white-space:nowrap;border-left:3px solid #fff}
.ft-stems{position:absolute;left:0;top:0;pointer-events:none}
.ft-head{position:absolute;top:8px;bottom:0;width:2px;background:var(--dh-a,#4fb3a0);box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none;z-index:2}
.ft-head:before{content:"";position:absolute;top:-2px;left:-5px;border:6px solid transparent;border-top-color:var(--dh-a,#4fb3a0)}
.ft-pin{position:absolute;width:${CARD_W}px;height:${LANE_H - 14}px;overflow:hidden;text-align:left;border:1px solid var(--ft-line);border-left:4px solid var(--pc,#7f8f8b);border-radius:6px;background:#161c1b;color:var(--ft-ink);padding:8px 10px 9px;cursor:pointer;font-family:inherit;z-index:1}
.ft-pin:hover,.ft-pin:focus-visible,.ft-pin[aria-current=true]{border-color:var(--dh-a,#4fb3a0);border-left-color:var(--pc,#7f8f8b);background:#1d2625;outline:none;z-index:3;box-shadow:0 0 0 2px rgba(79,179,160,.35)}
.ft-pin b{display:block;font-family:var(--dh-font-d,'Libre Caslon Text'),Georgia,serif;font-weight:var(--dh-d-weight,700);font-size:21px;line-height:1;color:var(--dh-a,#4fb3a0);font-variant-numeric:lining-nums}
.ft-pin span.s{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;margin-top:3px;font-size:14px;line-height:1.3}
.ft-pin .ft-chips{position:absolute;left:10px;right:8px;bottom:8px;margin:0;gap:4px;flex-wrap:nowrap}
.ft-pin .ft-chip{font-size:13px;padding:2px 7px;border-width:1px;min-width:26px;justify-content:center}
.ft-legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px clamp(14px,2.6cqw,26px);font-size:14px;color:var(--ft-mute);border-bottom:1px solid var(--ft-line)}
.ft-legend b{font-weight:600}
.ft-note{margin:0;padding:14px clamp(14px,2.6cqw,26px) 16px;font-size:15px;line-height:1.55;color:#f6d9a8;border-top:1px solid var(--ft-line);background:rgba(242,195,124,.07)}
.ft-note b{color:#fff}
.ft-help{margin:10px 2px 0;font-size:15px;line-height:1.55;color:var(--ft-mute);max-width:78ch}
@container (max-width:640px){
  .ft-read{grid-template-columns:minmax(0,1fr)}
  .ft-year{font-size:clamp(48px,16cqw,64px)}
  .ft-go{justify-self:stretch;white-space:normal;text-align:left;border-radius:14px;line-height:1.3}
  .ft-ctl{flex-wrap:wrap}
  .ft-slide{order:3;flex-basis:100%}
}
@media(prefers-reduced-motion:reduce){.ft *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const bandOf = (year: number) => PRESIDENCIES.find(b => year >= b.from && year < b.to) ?? PRESIDENCIES[PRESIDENCIES.length - 1];

export default function FoundingTimeline({ dossier, onGoRoom }: Props) {
  const pins = useMemo(() => [...foundingMilestones].sort((a, b) => a.year - b.year), []);
  const claimById = useMemo(() => new Map(dossier.ledger.claims.map(c => [c.id, c])), [dossier]);
  const roomById = useMemo(() => new Map(dossier.rooms.map((r, i) => [r.id, { title: r.title, n: i + 1 }])), [dossier]);

  const scroller = useRef<HTMLDivElement | null>(null);
  const [vw, setVw] = useState(900);
  const [sel, setSel] = useState(0);
  const [year, setYear] = useState(pins[0].year);

  // Pixels per year: at least MIN_PPY, more when the box is wide enough to show the whole line.
  const span = FOUNDING_RANGE.to - FOUNDING_RANGE.from;
  const ppy = Math.max(MIN_PPY, (vw - PAD_L - PAD_R) / span);
  const xOf = useCallback((y: number) => PAD_L + (y - FOUNDING_RANGE.from) * ppy, [ppy]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth || 900);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Card placement: at most MAX_LANES rows under the axis. Each card goes to the row where it must move least to the right
  // of the card before it; a card that had to move is joined to its year by an elbow, so a year is always found at the stem.
  const layout = useMemo(() => {
    const ends = Array.from({ length: MAX_LANES }, () => -Infinity);
    return pins.map(p => {
      const x = xOf(p.year);
      let lane = 0, best = Infinity;
      for (let l = 0; l < MAX_LANES; l++) {
        const dx = Math.max(0, ends[l] + 8 - x);
        if (dx < best) { best = dx; lane = l; }
      }
      ends[lane] = x + best + CARD_W;
      return { lane, dx: best, x };
    });
  }, [pins, xOf]);
  const laneCount = Math.max(...layout.map(l => l.lane)) + 1;
  const contentRight = Math.max(...layout.map(l => l.x + l.dx + CARD_W)) + 24;
  const width = Math.max(PAD_L + span * ppy + PAD_R, contentRight);
  const height = AXIS_Y + 14 + laneCount * LANE_H;

  const chipsOf = useCallback((p: FoundingPin): Confidence[] => {
    const set = new Set<Confidence>();
    for (const id of [p.claimId, ...(p.extraClaimIds ?? [])]) { const c = claimById.get(id) as Claim | undefined; if (c) set.add(c.confidence); }
    return CONF_ORDER.filter(c => set.has(c));
  }, [claimById]);

  const scrollToYear = useCallback((y: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, xOf(y) - el.clientWidth / 2), behavior: reduced() ? 'auto' : 'smooth' });
  }, [xOf]);

  const choose = useCallback((i: number, scroll: boolean) => {
    const k = Math.min(pins.length - 1, Math.max(0, i));
    setSel(k); setYear(pins[k].year);
    if (scroll) scrollToYear(pins[k].year);
  }, [pins, scrollToYear]);

  const scrub = (v: number) => {
    setYear(v);
    let best = 0;
    pins.forEach((p, i) => { if (Math.abs(p.year - v) < Math.abs(pins[best].year - v)) best = i; });
    setSel(best);
    scrollToYear(v);
  };

  const cur = pins[sel];
  const curBand = bandOf(cur.year);
  const room = roomById.get(cur.roomId);
  const openRoom = (roomId: string) => onGoRoom?.(roomId);

  // Left and Right on a focused pin move to the neighbouring pin (the Tab order is the same, so this is a shortcut).
  const onPinKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (to == null || to < 0 || to >= pins.length) return;
    e.preventDefault();
    choose(to, true);
    (scroller.current?.querySelectorAll('.ft-pin')[to] as HTMLElement | undefined)?.focus({ preventScroll: true });
  };

  // Tick years: the start, the decades before 1789, and the inauguration years that bound the bands.
  const ticks = [1754, 1760, 1770, 1780, 1789, 1797, 1801, 1809, 1817];

  useEffect(() => { scroller.current?.scrollTo({ left: 0 }); }, []);

  return (
    <div className="ft">
      <style>{CSS}</style>
      <div className="ft-box">
        <div className="ft-read" aria-live="polite">
          <div className="ft-year" aria-hidden>{Math.floor(cur.year)}</div>
          <div className="ft-what">
            <div className="ft-band"><i style={{ background: curBand.color }} />{curBand.name} <span style={{ fontWeight: 400, color: '#b4ac9f' }}>({curBand.span})</span></div>
            <p className="ft-label"><span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{Math.floor(cur.year)}: </span>{cur.label}</p>
            <div className="ft-chips" aria-label="How sure historians are">
              {chipsOf(cur).map(c => <span key={c} className={`ft-chip ${c}`}><span aria-hidden>{CHIP[c].mark}</span>{CHIP[c].label}</span>)}
            </div>
          </div>
          {room && <button className="ft-go" onClick={() => openRoom(cur.roomId)}>Open room {room.n}: {room.title}</button>}
        </div>

        <div className="ft-ctl">
          <button className="ft-step" onClick={() => choose(sel - 1, true)} disabled={sel === 0} aria-label="Previous event">← Earlier</button>
          <input className="ft-slide" type="range" min={FOUNDING_RANGE.from} max={FOUNDING_RANGE.to - 1} step={0.1} value={Math.min(year, FOUNDING_RANGE.to - 1)}
            onChange={e => scrub(Number(e.target.value))} aria-label="Scrub through the years, 1754 to 1817" aria-valuetext={`${Math.floor(year)}, ${bandOf(year).name}`} />
          <button className="ft-step" onClick={() => choose(sel + 1, true)} disabled={sel === pins.length - 1} aria-label="Next event">Later →</button>
        </div>

        <div className="ft-legend" aria-hidden>
          <span>How sure historians are:</span>
          {CONF_ORDER.map(c => <span key={c} className={`ft-chip ${c}`} style={{ padding: '2px 8px' }}>{CHIP[c].mark} {CHIP[c].label}</span>)}
        </div>

        <div className="ft-scroll" ref={scroller} tabIndex={0} role="region" aria-label="The timeline, 1754 to 1817. Scroll sideways. Each event is a button that opens its room.">
          <div className="ft-inner" style={{ width, height }}>
            <div className="ft-bands" aria-hidden>
              {PRESIDENCIES.map(b => (
                <div key={b.id} className="ft-bandbar" style={{ left: xOf(b.from), width: Math.max(0, xOf(Math.min(b.to, FOUNDING_RANGE.to)) - xOf(b.from) - 2), background: b.color }} title={`${b.name}, ${b.span}`}>
                  {b.name}{(b.to - b.from) * ppy > 230 && <small>{b.span}</small>}
                </div>
              ))}
            </div>
            <div className="ft-ticks" aria-hidden>{ticks.map(y => <span key={y} className="ft-tick" style={{ left: xOf(y) }}>{y}</span>)}</div>
            <div className="ft-slavery" aria-hidden><span>Enslaved people lived here, throughout</span></div>
            {CENSUS_POINTS.map(c => {
              const claim = claimById.get(c.claimId);
              return (
                <div key={c.year} className="ft-census" style={{ left: xOf(c.year) }} title={claim?.text}>
                  {c.year}: {c.enslaved.toLocaleString('en-US')} enslaved of {c.total.toLocaleString('en-US')} counted
                </div>
              );
            })}
            <svg className="ft-stems" width={width} height={height} aria-hidden>
              {pins.map((p, i) => {
                const { lane, dx, x } = layout[i];
                const top = AXIS_Y + 14 + lane * LANE_H;
                const mid = top + 22;
                const d = dx > 0 ? `M${x} ${AXIS_Y - 6} V${mid} H${x + dx}` : `M${x} ${AXIS_Y - 6} V${top + 8}`;
                return <path key={p.claimId} d={d} fill="none" stroke={bandOf(p.year).color} strokeWidth={i === sel ? 3 : 1.5} opacity={i === sel ? 1 : 0.7} />;
              })}
            </svg>
            <div className="ft-head" style={{ left: xOf(year) - 1 }} aria-hidden />
            {pins.map((p, i) => {
              const chips = chipsOf(p);
              const r = roomById.get(p.roomId);
              return (
                <button key={p.claimId} className="ft-pin" aria-current={i === sel}
                  style={{ left: layout[i].x + layout[i].dx, top: AXIS_Y + 14 + layout[i].lane * LANE_H, ['--pc' as string]: bandOf(p.year).color } as React.CSSProperties}
                  onMouseEnter={() => choose(i, false)} onFocus={() => choose(i, false)} onKeyDown={e => onPinKey(e, i)}
                  onClick={() => { choose(i, false); openRoom(p.roomId); }}
                  aria-label={`${Math.floor(p.year)}: ${p.short}. ${chips.map(c => CHIP[c].label).join(', ')}. Opens room ${r?.n ?? ''}, ${r?.title ?? ''}.`}>
                  <b>{Math.floor(p.year)}</b>
                  <span className="s">{p.short}</span>
                  <span className="ft-chips" aria-hidden>{chips.map(c => <span key={c} className={`ft-chip ${c}`} title={CHIP[c].label}>{CHIP[c].mark}</span>)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="ft-note"><b>Plainly:</b> {SLAVERY_NOTE}</p>
      </div>
      <p className="ft-help">Slide the year, press Earlier or Later, or press any event to open its room. The chips show how sure historians are of the claims behind each event: established, probable, contested (they disagree) or tradition (a story told, not proved). The census counts are from the U.S. Census Bureau.</p>
    </div>
  );
}
