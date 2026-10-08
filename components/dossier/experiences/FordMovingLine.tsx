/**
 * Ford: "The Moving Line". Scrub from the bench-built chassis (October 1913) to the moving line (early 1914)
 * and watch a chassis crawl past the stations while the hours fall. Numbers come from the Ford ledger
 * (c-93min, c-price, c-modelt); anything not in the ledger is labelled illustrative. Lazy-loaded by DossierHall.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Claim, Dossier } from '../../../services/dossier/dossierTypes';
import {
  CHASSIS_AFTER_MIN, CHASSIS_BEFORE_MIN, LINE_STATIONS, chassisMinutes, formatMinutes, lineFigures, periodLabel, speedUp, stationsPassed,
} from '../../../services/dossier/movingLine';

const CSS = `
.fml{--fml-line:rgba(255,255,255,.14);color:#f4efe6;font-family:'Inter',system-ui,sans-serif;container-type:inline-size}
.fml-box{border:1px solid var(--fml-line);border-radius:14px;overflow:hidden;background:#0f0c0a}
.fml-rail{position:relative;height:clamp(180px,26cqw,250px);background:repeating-linear-gradient(90deg,#1a1411 0 38px,#16100d 38px 76px);overflow:hidden;border-bottom:1px solid var(--fml-line)}
.fml-belt{position:absolute;left:0;right:0;bottom:36px;height:12px;background:#2b211b;border-top:2px solid #3a2d25}
.fml-belt:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 14px,rgba(0,0,0,.4) 14px 16px);animation:fmlBelt 1.4s linear infinite;animation-play-state:var(--fml-run,paused)}
@keyframes fmlBelt{to{background-position:32px 0}}
.fml-st{position:absolute;top:12px;transform:translateX(-4px);font-size:15px;font-weight:600;color:#8c7f73;transition:color .3s;display:flex;flex-direction:column;gap:6px}
.fml-st:after{content:"";display:block;width:2px;height:clamp(70px,12cqw,110px);background:currentColor;opacity:.5}
.fml-st.on{color:var(--dh-a,#ff4b1f)}
.fml-chassis{position:absolute;bottom:48px;width:clamp(140px,24cqw,230px);aspect-ratio:150/62;transition:left .08s linear}
.fml-chassis svg{width:100%;height:100%;overflow:visible}
.fml-chassis [data-p]{transition:opacity .35s}
.fml-read{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1px;background:var(--fml-line)}
.fml-read div{background:#0f0c0a;padding:20px 22px}
.fml-read b{display:block;font:400 clamp(38px,6cqw,68px)/1 var(--dh-font-d,'Anton'),Impact,sans-serif;text-transform:var(--dh-upper,uppercase);color:var(--dh-a,#ff4b1f)}
.fml-read small{display:block;margin-top:6px;font-size:15px;color:#b4ac9f}
.fml-ctl{padding:18px 22px;display:grid;gap:10px;border-top:1px solid var(--fml-line)}
.fml-ctl label{display:flex;justify-content:space-between;gap:12px;font-size:16px;color:#d8d1c4}
.fml-ctl input[type=range]{width:100%;accent-color:var(--dh-a,#ff4b1f);margin:0;height:28px}
.fml-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.fml-btn{border:1.5px solid var(--dh-a,#ff4b1f);background:transparent;color:var(--dh-a,#ff4b1f);border-radius:999px;padding:8px 18px;font-size:15px;font-weight:600;cursor:pointer}
.fml-btn:hover,.fml-btn:focus-visible{background:var(--dh-a,#ff4b1f);color:var(--dh-a-ink,#0b0a0d);outline:none}
.fml-bars{display:grid;gap:12px;padding:20px 22px;border-top:1px solid var(--fml-line)}
.fml-bar{display:grid;grid-template-columns:minmax(84px,150px) 1fr minmax(76px,120px);gap:12px;align-items:center;font-size:15px;color:#cfc8bc}
.fml-bar .tr{height:18px;background:#1d1612;border-radius:2px;overflow:hidden}
.fml-bar .fi{height:100%;background:var(--dh-a,#ff4b1f);transition:width .25s}
.fml-bar .fi.alt{background:#8c7f73}
.fml-bar .v{text-align:right;font-variant-numeric:tabular-nums;color:#f4efe6}
.fml-claims{display:flex;flex-wrap:wrap;gap:8px;padding:0 22px 18px}
.fml-chip{font-size:14px;padding:4px 12px;border:1px solid var(--fml-line);border-radius:999px;color:#cfc8bc}
.fml-chip b{color:#f4efe6;margin-right:6px}
.fml-note{margin:12px 2px 0;font-size:15px;line-height:1.55;color:#b4ac9f;max-width:72ch}
.fml-note.warn{color:#f1c27a}
@container (max-width:520px){.fml-st{font-size:13px}.fml-bar{grid-template-columns:78px 1fr 70px;font-size:14px}}
@media(prefers-reduced-motion:reduce){.fml-belt:after{animation:none}.fml-chassis{transition:none}.fml-chassis [data-p],.fml-bar .fi{transition:none}}
`;

const CONF: Record<Claim['confidence'], string> = { established: 'Established', probable: 'Probable', contested: 'Contested', tradition: 'Tradition' };

export default function FordMovingLine({ dossier }: { dossier: Dossier }) {
  const fig = useMemo(() => lineFigures(dossier.ledger.claims), [dossier]);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [railW, setRailW] = useState(720);
  const raf = useRef<number>(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const el = railRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setRailW(el.clientWidth));
    ro.observe(el); setRailW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // "Run the line" sweeps the scrub from one end to the other (a manual scrub always works).
  useEffect(() => {
    if (!running) return;
    let start: number | null = null; const from = t >= 1 ? 0 : t;
    const dur = 5200 * (1 - from);
    const step = (now: number) => {
      if (start == null) start = now;
      const k = Math.min(1, (now - start) / Math.max(1, dur));
      setT(from + (1 - from) * k);
      if (k < 1) raf.current = requestAnimationFrame(step); else setRunning(false);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const minutes = chassisMinutes(t);
  const passed = new Set(stationsPassed(t));
  const chassisW = Math.min(230, Math.max(140, railW * 0.24));
  const left = 10 + t * Math.max(0, railW - chassisW - 20);
  const hoursPct = (minutes / CHASSIS_BEFORE_MIN) * 100;
  const claimChips = [fig.start, fig.time, fig.price, fig.launch].filter(Boolean) as Claim[];

  return (
    <div className="fml" style={{ ['--fml-run' as string]: running && !reduced ? 'running' : 'paused' } as React.CSSProperties}>
      <style>{CSS}</style>
      <div className="fml-box" role="group" aria-label="The moving line: scrub from the bench-built chassis to the moving line">
        <div className="fml-rail" ref={railRef} aria-hidden>
          <div className="fml-belt" />
          {LINE_STATIONS.map(s => (
            <span key={s.id} className={`fml-st${passed.has(s.id) ? ' on' : ''}`} style={{ left: `${s.at * 100}%` }}>{s.label}</span>
          ))}
          <div className="fml-chassis" style={{ left }}>
            <svg viewBox="0 0 150 62">
              <rect x="6" y="30" width="138" height="10" rx="2" fill="#c8c0b4" />
              <g data-p="axles" opacity={passed.has('axles') ? 1 : 0.2}><rect x="26" y="40" width="6" height="8" fill="#8c7f73" /><rect x="118" y="40" width="6" height="8" fill="#8c7f73" /></g>
              <rect data-p="engine" x="14" y="20" width="26" height="12" rx="2" fill="#6f655b" opacity={passed.has('engine') ? 1 : 0.15} />
              <rect data-p="body" x="44" y="12" width="60" height="19" rx="3" fill="var(--dh-a,#ff4b1f)" opacity={passed.has('body') ? 1 : 0.15} />
              <g data-p="wheels" opacity={passed.has('wheels') ? 1 : 0.25}>
                <circle cx="30" cy="46" r="13" fill="#0f0c0a" stroke="#c8c0b4" strokeWidth="3" />
                <circle cx="120" cy="46" r="13" fill="#0f0c0a" stroke="#c8c0b4" strokeWidth="3" />
              </g>
            </svg>
          </div>
        </div>

        <div className="fml-read">
          <div><b aria-live="polite">{formatMinutes(minutes)}</b><small>to build a chassis</small></div>
          <div><b>{speedUp(t).toFixed(1)}<i style={{ fontFamily: "'Inter',sans-serif", fontStyle: 'normal', textTransform: 'none', fontSize: '.5em', marginLeft: 4 }}>times</i></b><small>as fast as in October 1913</small></div>
          <div><b>{periodLabel(t)}</b><small>when</small></div>
        </div>

        <div className="fml-ctl">
          <label htmlFor="fml-scrub"><span>Bench-built, October 1913</span><span>Moving line, early 1914</span></label>
          <input id="fml-scrub" type="range" min={0} max={100} step={1} value={Math.round(t * 100)}
            onChange={e => { setRunning(false); setT(Number(e.target.value) / 100); }}
            aria-valuetext={`${formatMinutes(minutes)} to build a chassis, ${periodLabel(t)}`} />
          <div className="fml-row">
            <button className="fml-btn" onClick={() => setRunning(r => !r)}>{running ? 'Pause the line' : t >= 1 ? 'Run it again' : 'Run the line'}</button>
            <button className="fml-btn" onClick={() => { setRunning(false); setT(0); }}>Back to the bench</button>
          </div>
        </div>

        <div className="fml-bars">
          <div className="fml-bar"><span>Chassis time</span><div className="tr"><div className="fi" style={{ width: `${hoursPct}%` }} /></div><span className="v">{formatMinutes(minutes)}</span></div>
          <div className="fml-bar"><span>Price, 1908</span><div className="tr"><div className="fi alt" style={{ width: '100%' }} /></div><span className="v">about $825</span></div>
          <div className="fml-bar"><span>Price, mid-1920s</span><div className="tr"><div className="fi alt" style={{ width: `${(260 / 825) * 100}%` }} /></div><span className="v">about $260</span></div>
        </div>
        {claimChips.length > 0 && (
          <div className="fml-claims" aria-label="Ledger claims behind these numbers">
            {claimChips.map(c => <span key={c.id} className="fml-chip"><b>{CONF[c.confidence]}</b>{c.id}</span>)}
          </div>
        )}
      </div>

      <p className="fml-note">
        The two chassis times are the documented ends: {formatMinutes(CHASSIS_BEFORE_MIN)}, the best stationary average Ford himself reported, to {formatMinutes(CHASSIS_AFTER_MIN)}{' '}
        once the line was raised to waist height in early 1914. The scrub fills in between evenly for illustration; Ford also reported a rough rope-and-windlass test at 5 h 50 min. The price bars are a separate story on a longer clock: the Model T launched at about $825 in 1908 and fell to about $260 by the
        mid-1920s, and the sources differ on both ends ($825 or $850; $260 or $265). Stations are illustrative: the ledger records only that flywheel magnetos moved
        onto a line around 1 April 1913 and that by August the line reached complete chassis.
      </p>
      {fig.timeNote && <p className="fml-note">{fig.timeNote}</p>}
      {!fig.sourced && <p className="fml-note warn">Some figures here are not backed by a ledger claim and are illustrative only.</p>}
    </div>
  );
}
