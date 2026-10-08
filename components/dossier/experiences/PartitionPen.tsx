/**
 * Partition: "Hold the pen". The 1948 Foreign Office map of the Punjab with your own draggable line between the same two
 * ends as Radcliffe's award; the map's printed notional (blue) and final (red) lines are isolated by colour with SVG filters
 * (not redrawn); eleven towns are classified by which side of your line they fall on. Ported from public/dossier/partition-map.html
 * (which stays as the standalone page). Logic is in services/dossier/partitionPen.ts. Lazy-loaded by DossierHall.
 * Reduced motion: the "lay the award over mine" wipe appears at once.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  BOT, MAP_H, MAP_URL, MAP_W, START_POINTS, TOP, TOWNS, classify, clampPt, keyStep, toMap, type Pt,
} from '../../../services/dossier/partitionPen';

const CSS = `
.pp{--pp-red:#ff5a44;--pp-blue:#5b8cff;--pp-line:rgba(255,255,255,.14);--pp-a:var(--dh-a,#e8553d);color:#f4efe6;font-family:var(--dh-font-b,'Source Serif 4',Georgia,serif);container-type:inline-size}
.pp-wrap{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:18px;align-items:start}
@container (max-width:860px){.pp-wrap{grid-template-columns:1fr}}
.pp-stage{border:1px solid var(--pp-line);border-radius:14px;overflow:hidden;background:#0c0a08}
.pp-tools{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-bottom:1px solid var(--pp-line);background:#100d0a}
.pp-tools button{font:600 14px 'Inter',system-ui,sans-serif;color:#f4efe6;background:rgba(12,10,8,.82);border:1px solid var(--pp-line);border-radius:999px;padding:8px 14px;min-height:40px;cursor:pointer}
.pp-tools button[aria-pressed=true]{border-color:#f4efe6;background:rgba(244,239,230,.16)}
.pp-tools button:hover,.pp-tools button:focus-visible{border-color:#fff;outline:none}
.pp-svg{display:block;width:100%;height:auto;touch-action:none}
.pp-handle{cursor:grab;touch-action:none;outline:none}
.pp-handle:active{cursor:grabbing}
.pp-handle:focus-visible,.pp-handle:hover{stroke:var(--dh-a,#e8553d);stroke-width:6}
.pp-town text{font:600 14px 'Inter',system-ui,sans-serif;fill:#1a1209;paint-order:stroke;stroke:#f4efe6;stroke-width:3px;stroke-linejoin:round}
.pp-town circle{stroke:#1a1209;stroke-width:2}
.pp-leg{display:flex;flex-wrap:wrap;gap:6px 18px;padding:10px 12px;border-top:1px solid var(--pp-line);background:#100d0a;font:500 13px 'Inter',system-ui,sans-serif;color:#b9b1a5}
.pp-leg i{display:inline-block;width:22px;height:4px;vertical-align:middle;margin-right:8px;border-radius:2px}
.pp-panel{display:grid;gap:14px;align-content:start}
.pp-card{border:1px solid var(--pp-line);border-radius:14px;padding:clamp(14px,3cqw,20px);background:#17120e}
.pp-cap{font:600 12px 'Inter',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#a79f94;margin-bottom:8px}
.pp-big{font:800 clamp(34px,6cqw,56px)/1 var(--dh-font-d,'Fraunces'),Georgia,serif;color:var(--pp-a)}
.pp-chips{display:flex;flex-wrap:wrap;gap:6px;min-height:30px}
.pp-chip{font:500 13px 'Inter',system-ui,sans-serif;padding:4px 10px;border-radius:999px;border:1px solid var(--pp-line)}
.pp-chip.same{border-color:#7fd1a0;color:#9fe3bb}
.pp-chip.diff{border-color:var(--pp-red);color:#ff9d8f}
.pp-chip.u{color:#a79f94}
.pp-s{margin:0;color:#d4ccc0;font-size:16px;line-height:1.55}
.pp-note{margin:12px 0 0;font:400 13.5px/1.6 'Inter',system-ui,sans-serif;color:#a79f94}
.pp-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.pp-cta{font:600 15px 'Inter',system-ui,sans-serif;background:var(--pp-a);color:var(--dh-a-ink,#1a0d09);border:1.5px solid var(--pp-a);border-radius:999px;padding:10px 18px;min-height:44px;cursor:pointer}
.pp-cta.sec{background:transparent;color:#f4efe6;border-color:var(--pp-line)}
.pp-cta:hover,.pp-cta:focus-visible{outline:2px solid #fff;outline-offset:2px}
.pp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pp-scan{transition:filter .6s,opacity .4s}
@media(prefers-reduced-motion:reduce){.pp-scan{transition:none}}
`;

const SCAN_DIM = 'grayscale(.85) brightness(.62) contrast(1.05)';
const SCAN_DARK = 'grayscale(1) brightness(.5)';
const WIPE_MS = 2200;

type Layer = 'scan' | 'mine' | 'not' | 'fin';

export default function PartitionPen() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { fRed: `pp-fred-${uid}`, fBlue: `pp-fblue-${uid}`, wipeF: `pp-wipef-${uid}`, wipeN: `pp-wipen-${uid}` };
  const [pts, setPts] = useState<Pt[]>(() => START_POINTS.map(p => ({ ...p })));
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ scan: true, mine: true, not: false, fin: false });
  const [dark, setDark] = useState(false);
  const [wipeN, setWipeN] = useState(0);
  const [wipeF, setWipeF] = useState(0);
  const [live, setLive] = useState('');
  /** Until the reader moves a handle the starting line already sits near the award, so no score is shown yet. */
  const [touched, setTouched] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<number | null>(null);
  const raf = useRef<{ n: number; f: number }>({ n: 0, f: 0 });
  const handleEls = useRef<Array<SVGCircleElement | null>>([]);

  const result = classify(pts);
  const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => () => { cancelAnimationFrame(raf.current.n); cancelAnimationFrame(raf.current.f); }, []);

  /** Sweeps a clip rect from 0 to the full map height (instant under reduced motion). */
  const wipe = useCallback((which: 'n' | 'f') => {
    const set = which === 'n' ? setWipeN : setWipeF;
    cancelAnimationFrame(raf.current[which]);
    if (reduced()) { set(MAP_H); return; }
    set(0);
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 == null) t0 = t;
      const k = Math.min(1, (t - t0) / WIPE_MS);
      set((1 - Math.pow(1 - k, 3)) * MAP_H);
      if (k < 1) raf.current[which] = requestAnimationFrame(step);
    };
    raf.current[which] = requestAnimationFrame(step);
  }, []);

  const toggle = (k: Layer) => {
    const next = !layers[k];
    setLayers(l => ({ ...l, [k]: next }));
    if (next && k === 'not') wipe('n');
    if (next && k === 'fin') wipe('f');
  };

  const reveal = () => {
    setTouched(true);
    setLayers(l => ({ ...l, fin: true, not: false }));
    setDark(true);
    wipe('f');
    setLive('The final award, in red, is laid over your line.');
  };
  const reset = () => {
    setPts(START_POINTS.map(p => ({ ...p })));
    setTouched(false);
    setLayers(l => ({ ...l, fin: false, not: false }));
    setDark(false);
    setLive('Your line is reset.');
  };

  const move = (i: number, p: Pt) => { setTouched(true); setPts(prev => prev.map((q, j) => (j === i ? clampPt(p) : q))); };

  const sayScore = (ps: Pt[]) => { const r = classify(ps); setLive(`${r.match} of ${r.total} places on the same side as the final award.`); };

  const onKey = (i: number) => (e: React.KeyboardEvent) => {
    const d = keyStep(e.key, e.shiftKey);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation(); // the hall moves between rooms on the arrow keys; a focused handle keeps them
    const next = pts.map((q, j) => (j === i ? clampPt({ x: q.x + d.x, y: q.y + d.y }) : q));
    setPts(next);
    setTouched(true);
    sayScore(next);
  };

  const onDown = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = i;
    e.currentTarget.focus();
  };
  const onMove = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (dragging.current !== i || !svgRef.current) return;
    move(i, toMap(e.clientX, e.clientY, svgRef.current.getBoundingClientRect()));
  };
  const onUp = () => { if (dragging.current != null) { dragging.current = null; sayScore(pts); } };

  const full = [TOP, ...pts, BOT];
  const names = (rs: typeof result.west) => rs.length ? rs.map(r => (
    <span key={r.town.n} className={`pp-chip ${!touched ? 'u' : r.same ? 'same' : 'diff'}`}>{r.town.n}{touched && <span className="pp-sr">{r.same ? ' (same side as the award)' : ' (a different side from the award)'}</span>}</span>
  )) : <span className="pp-chip u">nothing</span>;

  return (
    <div className="pp">
      <style>{CSS}</style>
      <div className="pp-wrap">
        <div className="pp-stage">
          <div className="pp-tools" role="group" aria-label="Map layers">
            <button type="button" aria-pressed={layers.scan} onClick={() => toggle('scan')}>Original map</button>
            <button type="button" aria-pressed={layers.mine} onClick={() => toggle('mine')}>Your line</button>
            <button type="button" aria-pressed={layers.not} onClick={() => toggle('not')}>Notional line (blue)</button>
            <button type="button" aria-pressed={layers.fin} onClick={() => toggle('fin')}>Final line (red)</button>
          </div>
          <svg ref={svgRef} className="pp-svg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="group"
            aria-label="1948 Foreign Office map of the Punjab with your boundary line between India and Pakistan. Three handles move your line; arrow keys move a focused handle.">
            <defs>
              <filter id={ids.fRed} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
                <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .35  0 0 0 0 .27  1.7 -.9 -.9 0 -.12" />
                <feMorphology operator="dilate" radius="1.2" result="d" />
                <feGaussianBlur in="d" stdDeviation="5" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="g" /><feMergeNode in="d" /></feMerge>
              </filter>
              <filter id={ids.fBlue} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
                <feColorMatrix type="matrix" values="0 0 0 0 .36  0 0 0 0 .55  0 0 0 0 1  -5 -4 9 0 -.8" />
                <feMorphology operator="dilate" radius="1.2" result="d" />
                <feGaussianBlur in="d" stdDeviation="5" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="g" /><feMergeNode in="d" /></feMerge>
              </filter>
              <clipPath id={ids.wipeF}><rect x="0" y="0" width={MAP_W} height={wipeF} /></clipPath>
              <clipPath id={ids.wipeN}><rect x="0" y="0" width={MAP_W} height={wipeN} /></clipPath>
            </defs>
            <image className="pp-scan" href={MAP_URL} width={MAP_W} height={MAP_H} style={{ filter: dark ? SCAN_DARK : SCAN_DIM, opacity: layers.scan ? 1 : 0.15 }} />
            <g clipPath={`url(#${ids.wipeN})`} style={{ display: layers.not ? '' : 'none' }} aria-hidden="true">
              <image href={MAP_URL} width={MAP_W} height={MAP_H} filter={`url(#${ids.fBlue})`} />
            </g>
            <g clipPath={`url(#${ids.wipeF})`} style={{ display: layers.fin ? '' : 'none' }} aria-hidden="true">
              <image href={MAP_URL} width={MAP_W} height={MAP_H} filter={`url(#${ids.fRed})`} />
            </g>
            <g style={{ display: layers.mine ? '' : 'none' }}>
              <polyline points={full.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f4efe6" strokeWidth="5" strokeLinejoin="round" strokeDasharray="2 9" strokeLinecap="round" />
              {[TOP, BOT].map((p, k) => <circle key={k} cx={p.x} cy={p.y} r="6" fill="#120f0c" stroke="#f4efe6" strokeWidth="3" aria-hidden="true" />)}
              {pts.map((p, i) => (
                <circle key={i} ref={el => { handleEls.current[i] = el; }} className="pp-handle" cx={p.x} cy={p.y} r="15" fill="#f4efe6" stroke="#120f0c" strokeWidth="4"
                  tabIndex={0} role="slider" aria-orientation="horizontal"
                  aria-label={`Boundary handle ${i + 1} of ${pts.length}. Arrow keys move it, Shift for bigger steps.`}
                  aria-valuemin={40} aria-valuemax={MAP_W - 40} aria-valuenow={Math.round(p.x)}
                  aria-valuetext={`${Math.round(p.x)} across, ${Math.round(p.y)} down, on a map 1280 wide`}
                  onPointerDown={onDown(i)} onPointerMove={onMove(i)} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey(i)} />
              ))}
            </g>
            <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {result.towns.map(r => (
                <g key={r.town.n} className="pp-town">
                  <circle cx={r.town.x} cy={r.town.y} r="6" fill={!touched ? '#f4efe6' : r.same ? '#7fd1a0' : '#ff5a44'} />
                  <text x={r.town.x + 10} y={r.town.y + 4}>{r.town.n}</text>
                </g>
              ))}
            </g>
          </svg>
          <div className="pp-leg">
            <span><i style={{ background: '#ff5a44' }} />Final boundary, as demarcated</span>
            <span><i style={{ background: '#5b8cff' }} />Notional boundary of the Act</span>
            <span><i style={{ background: '#f4efe6' }} />Your line</span>
          </div>
        </div>

        <div className="pp-panel">
          <div className="pp-card">
            <div className="pp-cap">Your line puts</div>
            <div className="pp-cap" style={{ marginTop: 6 }}>West of it</div>
            <div className="pp-chips">{names(result.west)}</div>
            <div className="pp-cap" style={{ marginTop: 12 }}>East of it</div>
            <div className="pp-chips">{names(result.east)}</div>
            <p className="pp-note">Once you move a handle: green = same side as Radcliffe&rsquo;s final award, red = a different side. Positions are read off the map and are approximate.</p>
          </div>
          <div className="pp-card">
            <div className="pp-cap">Match with the award</div>
            <div className="pp-big">{touched ? `${result.match} / ${result.total}` : '—'}</div>
            <p className="pp-s">{touched ? result.verdict : 'Drag the three handles, then lay Radcliffe’s line over yours.'}</p>
            <div className="pp-row">
              <button type="button" className="pp-cta" onClick={reveal}>Lay the award over mine</button>
              <button type="button" className="pp-cta sec" onClick={reset}>Reset my line</button>
            </div>
          </div>
          <div className="pp-card">
            <div className="pp-cap">What you are looking at</div>
            <p className="pp-s">A Foreign Office research map of September 1948. Blue is the <b>notional boundary</b> that applied at independence; red is the line <b>as finally demarcated</b> by the Boundary Commission. The award itself was announced on 17 August 1947, two days after independence. Radcliffe had five weeks and had never been to India.</p>
            <p className="pp-note">
              Source: Research Dept., Foreign Office, Sept. 1948, via Wikimedia Commons (public domain tag; rights review pending). The coloured lines are the map&rsquo;s own printed lines,
              isolated by colour, not redrawn. Town positions are placed by hand from the map and are approximate. People, villages, canals and rail are not shown, and numbers about
              the violence are contested and are not given here. This is a teaching toy, not a survey: your line does not claim to be a better border, only to show that every choice separates something from something.
            </p>
          </div>
        </div>
      </div>
      <p className="pp-sr" role="status" aria-live="polite" aria-atomic="true">{live}</p>
    </div>
  );
}
