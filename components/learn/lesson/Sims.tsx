import React, { useMemo, useState } from 'react';

/**
 * Small reusable simulators for lessons. Each one is a pure model (exported helpers, tested) plus a themed SVG view that
 * takes its colours from the figure variables (--f-ink, --f-grid, --f-accent, --f-accent2). The maths is in the caption's terms.
 */
export type SimKind = 'unitcircle' | 'population' | 'sorting';

export const rad = (deg: number) => (deg * Math.PI) / 180;
/** Logistic growth N(t) = K / (1 + ((K - N0) / N0) e^(-r t)). */
export const logistic = (t: number, K: number, r: number, N0 = 10) => K / (1 + ((K - N0) / N0) * Math.exp(-r * t));

/** Every state of a bubble sort on `a`, with the pair compared at that step and a running comparison count. */
export interface SortStep { arr: number[]; i: number; j: number; swapped: boolean; compares: number; done: boolean }
export function bubbleSteps(a: number[]): SortStep[] {
  const arr = [...a], out: SortStep[] = [{ arr: [...arr], i: -1, j: -1, swapped: false, compares: 0, done: false }];
  let c = 0;
  for (let end = arr.length - 1; end > 0; end--) for (let j = 0; j < end; j++) {
    c++; const sw = arr[j] > arr[j + 1]; if (sw) [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
    out.push({ arr: [...arr], i: j, j: j + 1, swapped: sw, compares: c, done: false });
  }
  out.push({ arr: [...arr], i: -1, j: -1, swapped: false, compares: c, done: true });
  return out;
}

const W = 560, H = 300;
const box: React.CSSProperties = { font: '12px/1.4 system-ui,sans-serif', color: 'var(--f-ink)' };

const UnitCircle: React.FC = () => {
  const [deg, setDeg] = useState(40);
  const cx = 170, cy = 150, R = 110, t = rad(deg), x = Math.cos(t), y = Math.sin(t);
  const px = cx + R * x, py = cy - R * y;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Unit circle with the point at ${deg} degrees: cosine ${x.toFixed(3)}, sine ${y.toFixed(3)}`} className="w-full h-auto" fontSize="12" fill="var(--f-ink)">
        <line x1={cx - R - 20} x2={cx + R + 20} y1={cy} y2={cy} stroke="var(--f-ink)" strokeOpacity=".5" /><line x1={cx} x2={cx} y1={cy - R - 20} y2={cy + R + 20} stroke="var(--f-ink)" strokeOpacity=".5" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--f-ink)" strokeOpacity=".6" />
        <path d={`M${cx + 28} ${cy} A28 28 0 ${deg > 180 ? 1 : 0} 0 ${cx + 28 * Math.cos(t)} ${cy - 28 * Math.sin(t)}`} fill="none" stroke="var(--f-accent2)" strokeWidth="2" />
        <line x1={cx} y1={cy} x2={px} y2={py} stroke="var(--f-accent)" strokeWidth="2.4" />
        <line x1={px} y1={py} x2={px} y2={cy} stroke="var(--f-accent3)" strokeWidth="2" strokeDasharray="4 3" /><line x1={cx} y1={cy} x2={px} y2={cy} stroke="var(--f-accent2)" strokeWidth="2" strokeDasharray="4 3" />
        <circle cx={px} cy={py} r="6" fill="var(--f-accent)" stroke="var(--f-paper)" strokeWidth="2" />
        <text x={cx + R + 8} y={cy + 14}>1</text><text x={cx - R - 14} y={cy + 14}>-1</text><text x={cx + 6} y={cy - R - 6}>1</text>
        <g transform="translate(350 70)"><text fontWeight="700" y="0">At {deg}° ({+t.toPrecision(3)} rad)</text>
          <text y="28" fill="var(--f-accent2)" fontWeight="700">cos θ = {x.toFixed(3)}</text><text y="50" fill="var(--f-accent3)" fontWeight="700">sin θ = {y.toFixed(3)}</text>
          <text y="80">cos² + sin² = {(x * x + y * y).toFixed(3)}</text><text y="108" opacity=".75">The point is always</text><text y="124" opacity=".75">exactly 1 from the centre.</text></g>
      </svg>
      <div className="ff-controls" style={box}><label>Angle <input type="range" aria-label="Angle in degrees" min={0} max={360} step={1} value={deg} onChange={e => setDeg(+e.target.value)} /> <output>{deg}°</output></label>
        {[0, 30, 45, 60, 90, 180, 270].map(a => <button key={a} type="button" onClick={() => setDeg(a)}>{a}°</button>)}</div>
    </div>
  );
};

const Population: React.FC = () => {
  const [K, setK] = useState(1000), [r, setR] = useState(0.6);
  const T = 24, M = { l: 52, r: 16, t: 16, b: 42 }, yMax = 2000;
  const sx = (t: number) => M.l + (t / T) * (W - M.l - M.r), sy = (n: number) => H - M.b - (n / yMax) * (H - M.t - M.b);
  const d = useMemo(() => Array.from({ length: 97 }, (_, i) => { const t = (i / 96) * T; return `${i ? 'L' : 'M'}${sx(t).toFixed(1)} ${sy(logistic(t, K, r)).toFixed(1)}`; }).join(''), [K, r]);
  const half = Math.log((K - 10) / 10) / r; // time to reach K/2 from N0 = 10 (valid when K > 20)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Logistic growth with carrying capacity ${K} and growth rate ${r} per generation`} className="w-full h-auto" fontSize="11" fill="var(--f-ink)">
        {[0, 500, 1000, 1500, 2000].map(v => <g key={v}><line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--f-grid)" /><text x={M.l - 8} y={sy(v) + 4} textAnchor="end">{v}</text></g>)}
        {[0, 6, 12, 18, 24].map(v => <text key={v} x={sx(v)} y={H - M.b + 16} textAnchor="middle">{v}</text>)}
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--f-ink)" /><line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--f-ink)" />
        <line x1={M.l} x2={W - M.r} y1={sy(K)} y2={sy(K)} stroke="var(--f-accent2)" strokeDasharray="5 4" /><text x={W - M.r - 4} y={sy(K) - 6} textAnchor="end" fill="var(--f-accent2)" fontWeight="700">carrying capacity K = {K}</text>
        <path d={d} fill="none" stroke="var(--f-accent)" strokeWidth="2.6" strokeLinejoin="round" data-mark="line" />
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontWeight="600">Time (generations)</text><text transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontWeight="600">Individuals</text>
      </svg>
      <div className="ff-controls" style={box}>
        <label>Carrying capacity <input type="range" aria-label="Carrying capacity" min={200} max={2000} step={50} value={K} onChange={e => setK(+e.target.value)} /> <output>{K}</output></label>
        <label>Growth rate <input type="range" aria-label="Growth rate per generation" min={0.1} max={1.2} step={0.05} value={r} onChange={e => setR(+e.target.value)} /> <output>{r.toFixed(2)}</output></label>
        <output aria-live="polite">Starts at 10. Half of K is reached after about {half.toFixed(1)} generations.</output>
      </div>
    </div>
  );
};

const START = [5, 2, 8, 1, 9, 3, 7, 4];
const Sorting: React.FC = () => {
  const steps = useMemo(() => bubbleSteps(START), []);
  const [k, setK] = useState(0);
  const s = steps[k], bw = 50, gap = 10, x0 = (W - (START.length * (bw + gap) - gap)) / 2;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H - 60}`} role="img" aria-label={`Bubble sort, step ${k} of ${steps.length - 1}: ${s.arr.join(', ')}`} className="w-full h-auto" fontSize="13" fill="var(--f-ink)">
        {s.arr.map((v, idx) => {
          const h = v * 20, hot = idx === s.i || idx === s.j;
          return <g key={idx}><rect x={x0 + idx * (bw + gap)} y={H - 90 - h} width={bw} height={h} rx="4" fill={s.done ? 'var(--f-accent3)' : hot ? (s.swapped ? 'var(--f-accent2)' : 'var(--f-accent)') : 'var(--f-grid)'} stroke="var(--f-ink)" strokeOpacity=".5" /><text x={x0 + idx * (bw + gap) + bw / 2} y={H - 94 - h} textAnchor="middle" fontWeight="700">{v}</text></g>;
        })}
      </svg>
      <div className="ff-controls" style={box}>
        <button type="button" disabled={k === 0} onClick={() => setK(k - 1)}>Back</button><button type="button" disabled={k >= steps.length - 1} onClick={() => setK(k + 1)}>Next</button><button type="button" onClick={() => setK(0)}>Reset</button>
        <output aria-live="polite">{s.done ? `Sorted after ${s.compares} comparisons.` : k === 0 ? 'Eight values, unsorted. Press Next.' : `Compared ${s.arr[s.i] === undefined ? '' : ''}positions ${s.i + 1} and ${s.j + 1}${s.swapped ? ': out of order, swapped' : ': already in order'}. Comparisons so far: ${s.compares}.`}</output>
      </div>
    </div>
  );
};

const SimBlock: React.FC<{ sim: SimKind }> = ({ sim }) => sim === 'unitcircle' ? <UnitCircle /> : sim === 'population' ? <Population /> : <Sorting />;
export default SimBlock;
