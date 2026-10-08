import React, { useEffect, useMemo, useState } from 'react';
import SimBlock from './Sims';
import MediaStrip from '../../media/MediaStrip';
import { resolveMediaRefs, type MediaAsset } from '../../../services/lessonMedia';
import { niceTicks, plotPath, sampleFn, fmtTick, type Figure, type Series } from './figures';
import { compileExpr } from './exprParser';

/**
 * Renders one lesson figure inside a themed frame (`.ff`). Colours come from CSS variables set by the folio theme:
 * --f-ink (text and axes), --f-grid, --f-accent, --f-accent2, so a figure re-colours with the theme and the course.
 * Every figure has a caption and a text alternative; charts also offer their numbers as a table.
 */
const W = 560, H = 300, M = { l: 52, r: 16, t: 16, b: 46 };
const SERIES_VARS = ['var(--f-accent)', 'var(--f-accent2)', 'var(--f-accent3)'];

const Axes: React.FC<{ xt: ReturnType<typeof niceTicks>; yt: ReturnType<typeof niceTicks>; sx: (v: number) => number; sy: (v: number) => number; xl: string; yl: string }> = ({ xt, yt, sx, sy, xl, yl }) => (
  <g fontSize="11" fill="var(--f-ink)">
    {yt.ticks.map(v => <g key={'y' + v}><line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--f-grid)" /><text x={M.l - 8} y={sy(v) + 4} textAnchor="end">{fmtTick(v)}</text></g>)}
    {xt.ticks.map(v => <g key={'x' + v}><line x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke="var(--f-grid)" strokeDasharray="2 4" /><text x={sx(v)} y={H - M.b + 16} textAnchor="middle">{fmtTick(v)}</text></g>)}
    <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--f-ink)" /><line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--f-ink)" />
    <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontWeight="600">{xl}</text>
    <text transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontWeight="600">{yl}</text>
  </g>
);

const Chart: React.FC<{ f: Extract<Figure, { type: 'chart' }> }> = ({ f }) => {
  const [hot, setHot] = useState<{ name: string; x: number; y: number } | null>(null);
  const all = f.series.flatMap(s => s.points);
  const xt = niceTicks(Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0])));
  const yt = niceTicks(Math.min(0, ...all.map(p => p[1])), Math.max(...all.map(p => p[1])));
  const sx = (v: number) => M.l + ((v - xt.lo) / (xt.hi - xt.lo || 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - yt.lo) / (yt.hi - yt.lo || 1)) * (H - M.t - M.b);
  const xl = f.x.unit ? `${f.x.label} (${f.x.unit})` : f.x.label, yl = f.y.unit ? `${f.y.label} (${f.y.unit})` : f.y.label;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={f.alt || `${f.title}. ${f.caption}`} className="w-full h-auto" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best: typeof hot = null, d = 1e9; for (const sr of f.series) for (const [x, y] of sr.points) { const dd = Math.abs(sx(x) - px); if (dd < d) { d = dd; best = { name: sr.name, x, y }; } } setHot(d < 40 ? best : null); }} onPointerLeave={() => setHot(null)}>
      <Axes xt={xt} yt={yt} sx={sx} sy={sy} xl={xl} yl={yl} />
      {f.series.map((s: Series, i) => (
        <g key={s.name}>
          {f.kind === 'bar' ? s.points.map(([x, y], j) => { const bw = (W - M.l - M.r) / (s.points.length * (f.series.length + 1)); return <rect key={j} x={sx(x) - bw * (f.series.length / 2) + i * bw} y={sy(y)} width={bw * 0.9} height={H - M.b - sy(y)} fill={SERIES_VARS[i % 3]} />; })
            : f.kind === 'scatter' ? s.points.map(([x, y], j) => <circle key={j} cx={sx(x)} cy={sy(y)} r="4" fill={SERIES_VARS[i % 3]} />)
            : <><path d={plotPath(s.points, sx, sy)} fill="none" stroke={SERIES_VARS[i % 3]} strokeWidth="2.2" strokeLinejoin="round" />{(() => { const e = s.points[s.points.length - 1]; return <circle cx={sx(e[0])} cy={sy(e[1])} r="4.5" fill={SERIES_VARS[i % 3]} />; })()}</>}
          {f.series.length > 1 && <text x={W - M.r - 4} y={M.t + 12 + i * 15} textAnchor="end" fontSize="11" fill={SERIES_VARS[i % 3]} fontWeight="700">{s.name}</text>}
        </g>))}
      {hot && <g pointerEvents="none"><circle cx={sx(hot.x)} cy={sy(hot.y)} r="6" fill="none" stroke="var(--f-ink)" strokeWidth="2" /><text x={Math.min(W - M.r - 4, Math.max(M.l + 4, sx(hot.x)))} y={Math.max(M.t + 12, sy(hot.y) - 12)} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--f-ink)" stroke="var(--f-paper)" strokeWidth="3" paintOrder="stroke">{f.series.length > 1 ? hot.name + ': ' : ''}{hot.x}, {hot.y}</text></g>}
    </svg>
  );
};

const Graph: React.FC<{ f: Extract<Figure, { type: 'graph' }> }> = ({ f }) => {
  const [pv, setPv] = useState(f.param?.value ?? 0);
  const [tx, setTx] = useState<number | null>(null);
  const base = useMemo(() => { try { return f.fn || compileExpr(f.expr || 'x'); } catch { return () => NaN; } }, [f]);
  const fnAt = (p: number) => (f.fnp ? (x: number) => f.fnp!(x, p) : base);
  const fn = fnAt(pv);
  const pts = sampleFn(fn, f.domain);
  // The y axis is sized over the whole parameter range so the curve moves inside fixed axes instead of the page rescaling.
  const ps = f.param ? [f.param.min, (f.param.min + f.param.max) / 2, f.param.max, pv] : [pv];
  const ys = ps.flatMap(p => sampleFn(fnAt(p), f.domain, 80).map(q => q[1])).filter(isFinite);
  const xt = niceTicks(f.domain[0], f.domain[1]), yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => M.l + ((v - xt.lo) / (xt.hi - xt.lo || 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - yt.lo) / (yt.hi - yt.lo || 1)) * (H - M.t - M.b);
  const ty = tx === null ? NaN : fn(tx);
  const unit = (a: { label: string }) => { const m = a.label.match(/\(([^)]+)\)\s*$/); return m ? ' ' + m[1] : ''; };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={f.alt || `${f.title}. ${f.caption}`} className="w-full h-auto">
        <Axes xt={xt} yt={yt} sx={sx} sy={sy} xl={f.x.label} yl={f.y.label} />
        {xt.lo < 0 && xt.hi > 0 && <line x1={sx(0)} x2={sx(0)} y1={M.t} y2={H - M.b} stroke="var(--f-ink)" strokeOpacity=".55" />}
        {yt.lo < 0 && yt.hi > 0 && <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} stroke="var(--f-ink)" strokeOpacity=".55" />}
        <path data-mark="line" d={plotPath(pts, sx, sy)} fill="none" stroke="var(--f-accent)" strokeWidth="2.4" strokeLinejoin="round" />
        {(f.marks || []).map(m => { const y = fn(m.x); return isFinite(y) ? <g key={m.label}><circle cx={sx(m.x)} cy={sy(y)} r="5" fill="var(--f-accent2)" /><text x={sx(m.x) + 8} y={sy(y) - 8} fontSize="11" fill="var(--f-ink)" fontWeight="700">{m.label}</text></g> : null; })}
        {tx !== null && isFinite(ty) && <g pointerEvents="none">
          <line x1={sx(tx)} x2={sx(tx)} y1={M.t} y2={H - M.b} stroke="var(--f-accent2)" strokeDasharray="4 3" />
          <line x1={M.l} x2={sx(tx)} y1={sy(ty)} y2={sy(ty)} stroke="var(--f-accent2)" strokeDasharray="4 3" />
          <circle cx={sx(tx)} cy={sy(ty)} r="6" fill="var(--f-accent2)" stroke="var(--f-paper)" strokeWidth="2" />
        </g>}
      </svg>
      <div className="ff-controls">
        {f.param && <label>{f.param.name} <input type="range" aria-label={f.param.name} min={f.param.min} max={f.param.max} step={f.param.step} value={pv} onChange={e => setPv(+e.target.value)} /> <output>{+pv.toPrecision(4)}{f.param.unit ? ' ' + f.param.unit : ''}</output></label>}
        <label>Trace the curve <input type="range" aria-label={`Trace ${f.x.label}`} min={f.domain[0]} max={f.domain[1]} step={(f.domain[1] - f.domain[0]) / 200} value={tx ?? f.domain[0]} onChange={e => setTx(+e.target.value)} /></label>
        <output aria-live="polite">{tx !== null && isFinite(ty) ? `${f.x.label.replace(/\s*\(.*$/, '')} = ${+tx.toPrecision(4)}${unit(f.x)}, ${f.y.label.replace(/\s*\(.*$/, '')} = ${+ty.toPrecision(4)}${unit(f.y)}` : 'Drag to read exact values'}</output>
      </div>
    </div>
  );
};

const Diagram: React.FC<{ f: Extract<Figure, { type: 'diagram' }> }> = ({ f }) => {
  const [step, setStep] = useState<number | null>(null);
  const seen = (id: string) => step === null || f.nodes.findIndex(n => n.id === id) <= step;
  const cols = Math.max(...f.nodes.map(n => n.col)) + 1, rows = Math.max(...f.nodes.map(n => n.row)) + 1;
  const nw = 112, nh = 40, gx = (W - cols * nw) / (cols + 1), gy = (H - 30 - rows * nh) / (rows + 1);
  const pos = (id: string) => { const n = f.nodes.find(x => x.id === id)!; return { x: gx + n.col * (nw + gx), y: 14 + gy + n.row * (nh + gy) }; };
  const svg = (
    <svg viewBox={`0 0 ${W} ${H - 20}`} role="img" aria-label={f.alt || `${f.title}. ${f.caption}`} className="w-full h-auto" fontSize="12">
      <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--f-ink)" /></marker></defs>
      {f.edges.map(([a, b, l], i) => { const p = pos(a), q = pos(b); const x1 = p.x + (q.x > p.x ? nw : q.x < p.x ? 0 : nw / 2), y1 = p.y + (q.y > p.y ? nh : q.y < p.y ? 0 : nh / 2), x2 = q.x + (q.x > p.x ? 0 : q.x < p.x ? nw : nw / 2), y2 = q.y + (q.y > p.y ? 0 : q.y < p.y ? nh : nh / 2); return <g key={i} opacity={seen(a) && seen(b) ? 1 : 0.18}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--f-ink)" strokeWidth="1.4" markerEnd="url(#ar)" />{l && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fill="var(--f-ink)" fontSize="11" fontStyle="italic">{l}</text>}</g>; })}
      {f.nodes.map(n => { const p = pos(n.id); const cur = step !== null && f.nodes[step]?.id === n.id; return <g key={n.id} opacity={seen(n.id) ? 1 : 0.18}><rect x={p.x} y={p.y} width={nw} height={nh} rx="6" fill={cur ? 'var(--f-accent)' : 'var(--f-paper)'} fillOpacity={cur ? 0.28 : 1} stroke="var(--f-accent)" strokeWidth={cur ? 2.6 : 1.6} /><text x={p.x + nw / 2} y={p.y + nh / 2 + 4} textAnchor="middle" fill="var(--f-ink)" fontWeight="600">{n.label}</text></g>; })}
    </svg>
  );
  return (
    <div>
      {svg}
      <div className="ff-controls">
        {step === null
          ? <button type="button" onClick={() => setStep(0)}>Walk through the steps</button>
          : <><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button type="button" disabled={step >= f.nodes.length - 1} onClick={() => setStep(step + 1)}>Next</button><button type="button" onClick={() => setStep(null)}>Show all</button><output aria-live="polite">Step {step + 1} of {f.nodes.length}: {f.nodes[step]?.label}</output></>}
      </div>
    </div>
  );
};

const Timeline: React.FC<{ f: Extract<Figure, { type: 'timeline' }> }> = ({ f }) => (
  <ol aria-label={f.alt || f.title} className="ff-timeline">
    {f.events.map((e, i) => <li key={i}><b>{e.when}</b><span>{e.label}</span></li>)}
  </ol>
);

const Video: React.FC<{ f: Extract<Figure, { type: 'video' }> }> = ({ f }) => {
  const yt = f.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return <div className="ff-video"><iframe title={f.alt || f.caption} src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>;
  return <video className="ff-video" controls preload="metadata" poster={f.poster} aria-label={f.alt || f.caption}><source src={f.url} />Your browser cannot play this video. <a href={f.url}>Open it directly</a>.</video>;
};

const Archive: React.FC<{ f: Extract<Figure, { type: 'plate' | 'audio' }> }> = ({ f }) => {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  useEffect(() => { let alive = true; resolveMediaRefs([f.ref]).then(r => alive && setAssets(r[0]?.assets || [])).catch(() => alive && setAssets([])); return () => { alive = false; }; }, [f.id]);
  if (assets === null) return <p className="ff-wait">Finding it in the archive...</p>;
  if (!assets.length) return null;
  return <MediaStrip assets={assets.slice(0, f.type === 'plate' ? 1 : 1)} large />;
};

const DataTable: React.FC<{ f: Extract<Figure, { type: 'chart' }> }> = ({ f }) => (
  <details className="ff-data"><summary>Show the numbers</summary>
    <table><thead><tr><th>{f.x.label}</th>{f.series.map(s => <th key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{f.series[0].points.map(([x], i) => <tr key={i}><td>{x}</td>{f.series.map(s => <td key={s.name}>{s.points[i]?.[1]}</td>)}</tr>)}</tbody></table>
  </details>
);

const FigureBlock: React.FC<{ f: Figure }> = ({ f }) => {
  const body = f.type === 'chart' ? <Chart f={f} /> : f.type === 'graph' ? <Graph f={f} /> : f.type === 'diagram' ? <Diagram f={f} /> : f.type === 'sim' ? <SimBlock sim={f.sim} /> : f.type === 'timeline' ? <Timeline f={f} /> : f.type === 'video' ? <Video f={f} /> : <Archive f={f} />;
  const title = 'title' in f ? f.title : undefined;
  return (
    <figure className={`ff ff-${f.type} ff-${f.layout || (f.type === 'plate' || f.type === 'video' ? 'wide' : 'inline')}`}>
      {title && <p className="ff-title">{title}</p>}
      <div className="ff-body">{body}</div>
      <figcaption><span>{f.caption}</span>{(f.credit || f.sourceUrl) && <em> {f.credit}{f.sourceUrl && <> <a href={f.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a></>}</em>}</figcaption>
      {f.type === 'chart' && <DataTable f={f} />}
    </figure>
  );
};
export default FigureBlock;
