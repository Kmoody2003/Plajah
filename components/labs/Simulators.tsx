// Interactive, fully-offline simulators for Plajah Academia's science studios.
//
// Each simulator is a small canvas/compute widget with live controls — real physics/math, no
// external libraries. Disciplines reference them by id via `ScienceDisciplineData.simulators`;
// the studio's Simulate tab renders whatever ids resolve here (unknown ids are skipped).

import React, { useEffect, useRef, useState, useMemo } from 'react';

// ── Shared shell ────────────────────────────────────────────────────────────────
const Shell: React.FC<{ title: string; blurb: string; accent: string; controls: React.ReactNode; children: React.ReactNode }> = ({ title, blurb, accent, controls, children }) => (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
    <div className="p-4 border-b border-white/8">
      <p className="text-[13px] font-black uppercase tracking-tight text-white">{title}</p>
      <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{blurb}</p>
    </div>
    <div className="p-4 grid lg:grid-cols-[1fr_260px] gap-4">
      <div className="min-w-0">{children}</div>
      <div className="space-y-3">{controls}</div>
    </div>
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; accent: string; onChange: (v: number) => void }> = ({ label, value, min, max, step = 1, unit, accent, onChange }) => (
  <label className="block">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
      <span className="text-[10px] font-black tabular-nums" style={{ color: accent }}>{value}{unit ? ` ${unit}` : ''}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
      className="w-full accent-current" style={{ accentColor: accent }} />
  </label>
);

const Btn: React.FC<{ onClick: () => void; accent: string; children: React.ReactNode; solid?: boolean }> = ({ onClick, accent, children, solid }) => (
  <button onClick={onClick} className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
    style={solid ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: '#fff' }}>{children}</button>
);

/** Canvas with a stable ref + auto device-pixel sizing; draw() is called each frame or on demand. */
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, deps: any[], animate: boolean) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw); drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let raf = 0; const start = performance.now();
    const sizeAndDraw = (t: number) => {
      const parent = cv.parentElement; const w = parent ? parent.clientWidth : 480; const h = 260;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h, (t - start) / 1000);
      if (animate) raf = requestAnimationFrame(sizeAndDraw);
    };
    raf = requestAnimationFrame(sizeAndDraw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const grid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
};

// ── 1. Projectile motion ─────────────────────────────────────────────────────────
const Projectile: React.FC<{ accent: string }> = ({ accent }) => {
  const [v0, setV0] = useState(30), [angle, setAngle] = useState(45), [g, setG] = useState(9.8);
  const rad = (angle * Math.PI) / 180;
  const range = (v0 * v0 * Math.sin(2 * rad)) / g;
  const apex = (v0 * v0 * Math.sin(rad) ** 2) / (2 * g);
  const tFlight = (2 * v0 * Math.sin(rad)) / g;
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h);
    const pad = 20; const sx = (w - 2 * pad) / Math.max(range, 1); const sy = (h - 2 * pad) / Math.max(apex * 1.2, 1);
    const s = Math.min(sx, sy);
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let t = 0; t <= tFlight; t += tFlight / 120) {
      const x = pad + v0 * Math.cos(rad) * t * s;
      const y = h - pad - (v0 * Math.sin(rad) * t - 0.5 * g * t * t) * s;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = accent;
    const px = pad + range * s, py = h - pad;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
  }, [v0, angle, g], false);
  return <Shell title="Projectile Motion" blurb="Launch angle, speed and gravity trace the parabolic path. Read off range, peak height and flight time." accent={accent}
    controls={<>
      <Slider label="Speed v₀" value={v0} min={5} max={80} unit="m/s" accent={accent} onChange={setV0} />
      <Slider label="Angle θ" value={angle} min={5} max={85} unit="°" accent={accent} onChange={setAngle} />
      <Slider label="Gravity g" value={g} min={1.6} max={24.8} step={0.1} unit="m/s²" accent={accent} onChange={setG} />
      <div className="text-[10px] text-white/50 space-y-0.5 pt-1">
        <p>Range: <b style={{ color: accent }}>{range.toFixed(1)} m</b></p>
        <p>Peak: <b style={{ color: accent }}>{apex.toFixed(1)} m</b></p>
        <p>Flight: <b style={{ color: accent }}>{tFlight.toFixed(2)} s</b></p>
      </div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 2. Pendulum ────────────────────────────────────────────────────────────────
const Pendulum: React.FC<{ accent: string }> = ({ accent }) => {
  const [len, setLen] = useState(1.5), [g] = useState(9.8), [a0, setA0] = useState(30);
  const period = 2 * Math.PI * Math.sqrt(len / g);
  const ref = useCanvas((ctx, w, h, t) => {
    grid(ctx, w, h);
    const theta = (a0 * Math.PI / 180) * Math.cos((2 * Math.PI / period) * t);
    const ox = w / 2, oy = 24; const L = Math.min(h - 60, len * 90);
    const bx = ox + L * Math.sin(theta), by = oy + L * Math.cos(theta);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx, by, 12, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, 7); ctx.fill();
  }, [len, a0, period], true);
  return <Shell title="Simple Pendulum" blurb="Small-angle period depends only on length and gravity — not on mass or amplitude. Watch it swing in real time." accent={accent}
    controls={<>
      <Slider label="Length L" value={len} min={0.3} max={3} step={0.1} unit="m" accent={accent} onChange={setLen} />
      <Slider label="Start angle" value={a0} min={5} max={60} unit="°" accent={accent} onChange={setA0} />
      <div className="text-[10px] text-white/50 pt-1"><p>Period T = <b style={{ color: accent }}>{period.toFixed(2)} s</b></p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 3. Wave superposition ─────────────────────────────────────────────────────────
const Wave: React.FC<{ accent: string }> = ({ accent }) => {
  const [f1, setF1] = useState(2), [f2, setF2] = useState(3), [show, setShow] = useState(true);
  const ref = useCanvas((ctx, w, h, t) => {
    grid(ctx, w, h); const mid = h / 2;
    const wave = (f: number, color: string, amp: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= w; x++) { const y = mid - amp * Math.sin((x / w) * Math.PI * 2 * f - t * 2); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    };
    if (show) { wave(f1, 'rgba(255,255,255,0.25)', 30); wave(f2, 'rgba(255,255,255,0.25)', 30); }
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let x = 0; x <= w; x++) { const y = mid - 30 * (Math.sin((x / w) * Math.PI * 2 * f1 - t * 2) + Math.sin((x / w) * Math.PI * 2 * f2 - t * 2)) / 2; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }, [f1, f2, show], true);
  return <Shell title="Wave Superposition" blurb="Add two travelling waves and watch interference and beats emerge from their sum." accent={accent}
    controls={<>
      <Slider label="Frequency 1" value={f1} min={1} max={8} unit="Hz" accent={accent} onChange={setF1} />
      <Slider label="Frequency 2" value={f2} min={1} max={8} unit="Hz" accent={accent} onChange={setF2} />
      <Btn onClick={() => setShow(s => !s)} accent={accent}>{show ? 'Hide components' : 'Show components'}</Btn>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 4. Ideal gas (PV = nRT) ────────────────────────────────────────────────────────
const IdealGas: React.FC<{ accent: string }> = ({ accent }) => {
  const [T, setT] = useState(300), [n, setN] = useState(1), [V, setV] = useState(22.4);
  const P = (n * 0.08314 * T) / V; // bar
  const ref = useCanvas((ctx, w, h, t) => {
    grid(ctx, w, h);
    const boxW = Math.max(60, Math.min(w - 40, V * 8)); const bx = (w - boxW) / 2, by = 30, bh = h - 60;
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(bx, by, boxW, bh);
    const count = Math.round(n * 30); const speed = Math.sqrt(T) / 6;
    ctx.fillStyle = accent;
    for (let i = 0; i < count; i++) {
      const px = bx + 10 + ((Math.sin(i * 12.9 + t * speed) * 0.5 + 0.5)) * (boxW - 20);
      const py = by + 10 + ((Math.cos(i * 7.7 + t * speed * 1.3) * 0.5 + 0.5)) * (bh - 20);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill();
    }
  }, [T, n, V], true);
  return <Shell title="Ideal Gas Law" blurb="PV = nRT. Change temperature, amount and volume and watch pressure — and the molecules — respond." accent={accent}
    controls={<>
      <Slider label="Temperature T" value={T} min={100} max={800} unit="K" accent={accent} onChange={setT} />
      <Slider label="Moles n" value={n} min={0.5} max={4} step={0.5} unit="mol" accent={accent} onChange={setN} />
      <Slider label="Volume V" value={V} min={5} max={44} step={0.5} unit="L" accent={accent} onChange={setV} />
      <div className="text-[10px] text-white/50 pt-1"><p>Pressure P = <b style={{ color: accent }}>{P.toFixed(2)} bar</b></p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 5. pH titration curve ─────────────────────────────────────────────────────────
const Titration: React.FC<{ accent: string }> = ({ accent }) => {
  const [pKa, setPKa] = useState(4.75), [conc, setConc] = useState(0.1);
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 26;
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const f = i / 50; // 0..2 equivalents
      let pH: number;
      if (f < 1) pH = pKa + Math.log10(Math.max(f, 0.001) / Math.max(1 - f, 0.001));
      else if (Math.abs(f - 1) < 0.001) pH = 7 + 0.5 * Math.log10(conc);
      else pH = 14 + Math.log10(Math.max((f - 1) * conc, 1e-7));
      pH = Math.max(0, Math.min(14, pH));
      const x = pad + (i / 100) * (w - 2 * pad); const y = h - pad - (pH / 14) * (h - 2 * pad);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px sans-serif';
    ctx.fillText('pH 14', 2, pad); ctx.fillText('pH 0', 2, h - pad); ctx.fillText('equiv. pt', w / 2 - 18, h - 6);
  }, [pKa, conc], false);
  return <Shell title="Acid–Base Titration" blurb="Titrate a weak acid with strong base. The buffer region flattens near the pKa, then jumps at the equivalence point." accent={accent}
    controls={<>
      <Slider label="pKa" value={pKa} min={2} max={10} step={0.05} accent={accent} onChange={setPKa} />
      <Slider label="Concentration" value={conc} min={0.01} max={1} step={0.01} unit="M" accent={accent} onChange={setConc} />
      <div className="text-[10px] text-white/50 pt-1"><p>Half-equiv pH = pKa = <b style={{ color: accent }}>{pKa.toFixed(2)}</b></p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 6. Logistic population growth ──────────────────────────────────────────────────
const Population: React.FC<{ accent: string }> = ({ accent }) => {
  const [r, setR] = useState(0.6), [K, setK] = useState(1000), [N0, setN0] = useState(20);
  const series = useMemo(() => { const out = [N0]; let N = N0; for (let i = 0; i < 100; i++) { N = N + r * N * (1 - N / K); out.push(Math.max(0, N)); } return out; }, [r, K, N0]);
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 24; const maxN = Math.max(K * 1.1, ...series);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([4, 4]); ctx.beginPath();
    const ky = h - pad - (K / maxN) * (h - 2 * pad); ctx.moveTo(pad, ky); ctx.lineTo(w - pad, ky); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath();
    series.forEach((N, i) => { const x = pad + (i / (series.length - 1)) * (w - 2 * pad); const y = h - pad - (N / maxN) * (h - 2 * pad); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '9px sans-serif'; ctx.fillText('carrying capacity K', pad + 4, ky - 4);
  }, [series, K], false);
  return <Shell title="Logistic Growth" blurb="Populations grow exponentially, then saturate at the carrying capacity K. High r can overshoot and oscillate." accent={accent}
    controls={<>
      <Slider label="Growth rate r" value={r} min={0.1} max={2.8} step={0.05} accent={accent} onChange={setR} />
      <Slider label="Capacity K" value={K} min={200} max={2000} step={50} accent={accent} onChange={setK} />
      <Slider label="Start N₀" value={N0} min={2} max={500} accent={accent} onChange={setN0} />
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 7. Hardy–Weinberg ───────────────────────────────────────────────────────────
const HardyWeinberg: React.FC<{ accent: string }> = ({ accent }) => {
  const [p, setP] = useState(0.6); const q = 1 - p;
  const AA = p * p, Aa = 2 * p * q, aa = q * q;
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 30; const bw = (w - 2 * pad) / 3 - 12;
    const bars = [{ l: 'AA', v: AA, c: accent }, { l: 'Aa', v: Aa, c: 'rgba(255,255,255,0.5)' }, { l: 'aa', v: aa, c: 'rgba(255,255,255,0.3)' }];
    bars.forEach((b, i) => {
      const x = pad + i * ((w - 2 * pad) / 3) + 6; const bh = b.v * (h - 2 * pad);
      ctx.fillStyle = b.c; ctx.fillRect(x, h - pad - bh, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(b.l, x + bw / 2 - 8, h - pad + 14);
      ctx.fillText((b.v * 100).toFixed(0) + '%', x + bw / 2 - 12, h - pad - bh - 6);
    });
  }, [p], false);
  return <Shell title="Hardy–Weinberg Equilibrium" blurb="With allele frequency p, genotype frequencies settle at p² + 2pq + q² = 1. Slide p and watch the population." accent={accent}
    controls={<>
      <Slider label="Allele freq p" value={p} min={0.05} max={0.95} step={0.01} accent={accent} onChange={setP} />
      <div className="text-[10px] text-white/50 pt-1 space-y-0.5"><p>p = <b style={{ color: accent }}>{p.toFixed(2)}</b>, q = <b>{q.toFixed(2)}</b></p><p>p² + 2pq + q² = <b>{(AA + Aa + aa).toFixed(2)}</b></p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 8. SIR epidemic ─────────────────────────────────────────────────────────────
const SIR: React.FC<{ accent: string }> = ({ accent }) => {
  const [beta, setBeta] = useState(0.4), [gamma, setGamma] = useState(0.1);
  const series = useMemo(() => {
    let S = 0.99, I = 0.01, R = 0; const out: [number, number, number][] = [];
    for (let i = 0; i < 160; i++) { out.push([S, I, R]); const dS = -beta * S * I, dI = beta * S * I - gamma * I, dR = gamma * I; S += dS; I += dI; R += dR; }
    return out;
  }, [beta, gamma]);
  const R0 = beta / gamma;
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 20;
    const line = (idx: number, color: string) => { ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath(); series.forEach((v, i) => { const x = pad + (i / (series.length - 1)) * (w - 2 * pad); const y = h - pad - v[idx] * (h - 2 * pad); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke(); };
    line(0, 'rgba(120,200,255,0.7)'); line(2, 'rgba(255,255,255,0.35)'); line(1, accent);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px sans-serif'; ctx.fillText('S', pad, pad + 8); ctx.fillText('I (infected)', w - 70, pad + 8);
  }, [series], false);
  return <Shell title="SIR Epidemic Model" blurb="Susceptible → Infected → Recovered. The basic reproduction number R₀ = β/γ decides whether an outbreak grows." accent={accent}
    controls={<>
      <Slider label="Infection β" value={beta} min={0.05} max={1} step={0.01} accent={accent} onChange={setBeta} />
      <Slider label="Recovery γ" value={gamma} min={0.02} max={0.5} step={0.01} accent={accent} onChange={setGamma} />
      <div className="text-[10px] text-white/50 pt-1"><p>R₀ = β/γ = <b style={{ color: R0 > 1 ? accent : '#8BCE89' }}>{R0.toFixed(2)}</b> {R0 > 1 ? '(epidemic)' : '(dies out)'}</p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 9. Function plotter ───────────────────────────────────────────────────────────
const FUNCS: { label: string; f: (x: number) => number }[] = [
  { label: 'sin(x)', f: x => Math.sin(x) }, { label: 'x²/4', f: x => x * x / 4 }, { label: 'e^(x/3)', f: x => Math.exp(x / 3) },
  { label: 'sin(x)/x', f: x => x === 0 ? 1 : Math.sin(x) / x }, { label: 'tanh(x)', f: x => Math.tanh(x) }, { label: 'x³−3x', f: x => x ** 3 - 3 * x },
];
const FunctionPlotter: React.FC<{ accent: string }> = ({ accent }) => {
  const [idx, setIdx] = useState(0), [zoom, setZoom] = useState(6);
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const cx = w / 2, cy = h / 2; const sx = (w / 2) / zoom, sy = 26;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath(); let started = false;
    for (let px = 0; px <= w; px++) { const x = (px - cx) / sx; const y = cy - FUNCS[idx].f(x) * sy; if (y < -1e4 || y > 1e4 || isNaN(y)) { started = false; continue; } started ? ctx.lineTo(px, y) : ctx.moveTo(px, y); started = true; }
    ctx.stroke();
  }, [idx, zoom], false);
  return <Shell title="Function Plotter" blurb="Graph classic functions and zoom the domain — see roots, asymptotes and curvature at a glance." accent={accent}
    controls={<>
      <div className="grid grid-cols-2 gap-1.5">{FUNCS.map((f, i) => <button key={f.label} onClick={() => setIdx(i)} className="py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all" style={i === idx ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: '#fff' }}>{f.label}</button>)}</div>
      <Slider label="Domain ±" value={zoom} min={2} max={20} accent={accent} onChange={setZoom} />
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 10. Sieve of Eratosthenes ─────────────────────────────────────────────────────
const PrimeSieve: React.FC<{ accent: string }> = ({ accent }) => {
  const [n, setN] = useState(120);
  const primes = useMemo(() => { const s = new Array(n + 1).fill(true); s[0] = s[1] = false; for (let i = 2; i * i <= n; i++) if (s[i]) for (let j = i * i; j <= n; j += i) s[j] = false; return s; }, [n]);
  const count = primes.filter(Boolean).length;
  const cols = 20;
  return <Shell title="Sieve of Eratosthenes" blurb="Cross out multiples of each prime to reveal every prime up to n — the oldest known prime-finding algorithm." accent={accent}
    controls={<>
      <Slider label="Up to n" value={n} min={40} max={400} step={10} accent={accent} onChange={setN} />
      <div className="text-[10px] text-white/50 pt-1"><p><b style={{ color: accent }}>{count}</b> primes ≤ {n}</p></div>
    </>}>
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {Array.from({ length: n - 1 }, (_, i) => i + 2).map(k => (
        <div key={k} className="aspect-square rounded flex items-center justify-center text-[8px] font-bold tabular-nums"
          style={primes[k] ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' }}>{k}</div>
      ))}
    </div>
  </Shell>;
};

// ── 11. Sorting visualizer ─────────────────────────────────────────────────────────
const Sorting: React.FC<{ accent: string }> = ({ accent }) => {
  const [size, setSize] = useState(40);
  const [arr, setArr] = useState<number[]>(() => Array.from({ length: 40 }, () => Math.random()));
  const [algo, setAlgo] = useState<'bubble' | 'insertion' | 'selection'>('bubble');
  const runningRef = useRef(false);
  const reset = () => { runningRef.current = false; setArr(Array.from({ length: size }, () => Math.random())); };
  useEffect(reset, [size]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (runningRef.current) return; runningRef.current = true;
    const a = [...arr]; const sleep = () => new Promise(r => setTimeout(r, 12));
    const swap = (i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
    if (algo === 'bubble') { for (let i = 0; i < a.length && runningRef.current; i++) for (let j = 0; j < a.length - i - 1; j++) { if (a[j] > a[j + 1]) { swap(j, j + 1); setArr([...a]); await sleep(); } } }
    else if (algo === 'insertion') { for (let i = 1; i < a.length && runningRef.current; i++) { let j = i; while (j > 0 && a[j - 1] > a[j]) { swap(j - 1, j); j--; setArr([...a]); await sleep(); } } }
    else { for (let i = 0; i < a.length && runningRef.current; i++) { let m = i; for (let j = i + 1; j < a.length; j++) if (a[j] < a[m]) m = j; swap(i, m); setArr([...a]); await sleep(); } }
    runningRef.current = false;
  };
  return <Shell title="Sorting Visualizer" blurb="Watch bubble, insertion and selection sort reorder the bars step by step — the shape of an O(n²) algorithm." accent={accent}
    controls={<>
      <div className="grid grid-cols-3 gap-1.5">{(['bubble', 'insertion', 'selection'] as const).map(a => <button key={a} onClick={() => setAlgo(a)} className="py-1.5 rounded-lg text-[9px] font-black uppercase transition-all" style={a === algo ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: '#fff' }}>{a.slice(0, 4)}</button>)}</div>
      <Slider label="Array size" value={size} min={15} max={80} accent={accent} onChange={setSize} />
      <Btn onClick={run} accent={accent} solid>Sort</Btn>
      <Btn onClick={reset} accent={accent}>Shuffle</Btn>
    </>}>
    <div className="flex items-end gap-[2px] h-[240px] bg-[#0a0a0f] rounded-lg p-2">
      {arr.map((v, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${v * 100}%`, background: accent, opacity: 0.55 + v * 0.45 }} />)}
    </div>
  </Shell>;
};

// ── 12. Big-O growth ─────────────────────────────────────────────────────────────
const COMPLEXITY: { label: string; f: (n: number) => number; c: string }[] = [
  { label: 'O(1)', f: () => 1, c: '#8BCE89' }, { label: 'O(log n)', f: n => Math.log2(n + 1), c: '#63E6BE' },
  { label: 'O(n)', f: n => n, c: '#748FFC' }, { label: 'O(n log n)', f: n => n * Math.log2(n + 1), c: '#DA77F2' },
  { label: 'O(n²)', f: n => n * n, c: '#FFA94D' }, { label: 'O(2ⁿ)', f: n => Math.pow(2, n), c: '#ff6b6b' },
];
const BigO: React.FC<{ accent: string }> = ({ accent }) => {
  const [nMax, setNMax] = useState(20);
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 22; const maxY = COMPLEXITY[4].f(nMax);
    COMPLEXITY.forEach(c => { ctx.strokeStyle = c.c; ctx.lineWidth = 2; ctx.beginPath(); for (let n = 1; n <= nMax; n++) { const x = pad + ((n - 1) / (nMax - 1)) * (w - 2 * pad); const y = h - pad - Math.min(c.f(n) / maxY, 1) * (h - 2 * pad); n === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); });
  }, [nMax], false);
  return <Shell title="Big-O Complexity" blurb="How runtime scales with input size. Constant and logarithmic stay flat; quadratic and exponential explode." accent={accent}
    controls={<>
      <Slider label="Max n" value={nMax} min={8} max={40} accent={accent} onChange={setNMax} />
      <div className="space-y-1 pt-1">{COMPLEXITY.map(c => <div key={c.label} className="flex items-center gap-2 text-[10px]"><span className="w-3 h-1.5 rounded-full" style={{ background: c.c }} /><span className="font-mono text-white/60">{c.label}</span></div>)}</div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 13. Orbit (two-body) ───────────────────────────────────────────────────────────
const Orbit: React.FC<{ accent: string }> = ({ accent }) => {
  const [ecc, setEcc] = useState(0.5), [a, setA] = useState(1);
  const ref = useCanvas((ctx, w, h, t) => {
    grid(ctx, w, h); const cx = w / 2, cy = h / 2; const A = Math.min(w, h) / 2.6 * a; const b = A * Math.sqrt(1 - ecc * ecc); const focus = A * ecc;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx - focus, cy, A, b, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fill();
    const M = t * 1.2; let E = M; for (let i = 0; i < 5; i++) E = E - (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
    const px = cx - focus + A * Math.cos(E), py = cy + b * Math.sin(E);
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
  }, [ecc, a], true);
  return <Shell title="Orbital Mechanics" blurb="A planet sweeps an ellipse with the star at one focus — faster at perihelion, slower at aphelion (Kepler's laws)." accent={accent}
    controls={<>
      <Slider label="Eccentricity e" value={ecc} min={0} max={0.85} step={0.01} accent={accent} onChange={setEcc} />
      <Slider label="Semi-major a" value={a} min={0.5} max={1.2} step={0.05} accent={accent} onChange={setA} />
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 14. Integrate-and-fire neuron ──────────────────────────────────────────────────
const Neuron: React.FC<{ accent: string }> = ({ accent }) => {
  const [I, setI] = useState(1.4), [tau, setTau] = useState(10);
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 20; const Vth = 1, Vreset = 0; const dt = 0.5; let V = 0; const pts: number[] = [];
    for (let i = 0; i < 200; i++) { V += (dt / tau) * (-V + I); if (V >= Vth) { pts.push(1.6); V = Vreset; } else pts.push(V); }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([4, 4]); ctx.beginPath(); const thy = h - pad - (Vth / 1.7) * (h - 2 * pad); ctx.moveTo(pad, thy); ctx.lineTo(w - pad, thy); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((v, i) => { const x = pad + (i / (pts.length - 1)) * (w - 2 * pad); const y = h - pad - (v / 1.7) * (h - 2 * pad); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '9px sans-serif'; ctx.fillText('threshold', pad + 4, thy - 4);
  }, [I, tau], false);
  return <Shell title="Integrate-and-Fire Neuron" blurb="Membrane voltage charges toward the input current; when it hits threshold the neuron fires a spike and resets." accent={accent}
    controls={<>
      <Slider label="Input current I" value={I} min={0.5} max={3} step={0.05} accent={accent} onChange={setI} />
      <Slider label="Time constant τ" value={tau} min={4} max={25} unit="ms" accent={accent} onChange={setTau} />
      <div className="text-[10px] text-white/50 pt-1"><p>{I > 1 ? 'Spiking' : 'Sub-threshold (silent)'}</p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── 15. Simply-supported beam ──────────────────────────────────────────────────────
const Beam: React.FC<{ accent: string }> = ({ accent }) => {
  const [L, setL] = useState(6), [P, setP] = useState(20), [pos, setPos] = useState(0.5);
  const a = L * pos, b = L * (1 - pos); const R1 = (P * b) / L, R2 = (P * a) / L; const Mmax = (P * a * b) / L;
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h); const pad = 30; const y0 = h / 2 - 20; const sx = (w - 2 * pad) / L;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(w - pad, y0); ctx.stroke();
    const lx = pad + a * sx; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, y0 - 34); ctx.lineTo(lx, y0 - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 5, y0 - 12); ctx.lineTo(lx, y0 - 2); ctx.lineTo(lx + 5, y0 - 12); ctx.fill();
    // bending moment diagram
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 100; i++) { const x = (i / 100) * L; const M = x <= a ? R1 * x : R2 * (L - x); const px = pad + x * sx; const py = y0 + 60 - (M / Math.max(Mmax, 1)) * 50; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '9px sans-serif'; ctx.fillText('bending moment', pad, y0 + 78);
  }, [L, P, pos], false);
  return <Shell title="Simply-Supported Beam" blurb="A point load on a beam splits into support reactions and a bending-moment diagram peaking under the load." accent={accent}
    controls={<>
      <Slider label="Span L" value={L} min={2} max={12} unit="m" accent={accent} onChange={setL} />
      <Slider label="Load P" value={P} min={5} max={50} unit="kN" accent={accent} onChange={setP} />
      <Slider label="Load position" value={pos} min={0.1} max={0.9} step={0.05} accent={accent} onChange={setPos} />
      <div className="text-[10px] text-white/50 pt-1 space-y-0.5"><p>R₁ = <b style={{ color: accent }}>{R1.toFixed(1)} kN</b>, R₂ = <b style={{ color: accent }}>{R2.toFixed(1)} kN</b></p><p>M_max = <b style={{ color: accent }}>{Mmax.toFixed(1)} kN·m</b></p></div>
    </>}>
    <canvas ref={ref} className="w-full rounded-lg" />
  </Shell>;
};

// ── Registry ────────────────────────────────────────────────────────────────────
export interface SimEntry { label: string; Component: React.FC<{ accent: string }>; }
export const SIMULATORS: Record<string, SimEntry> = {
  'projectile':       { label: 'Projectile Motion', Component: Projectile },
  'pendulum':         { label: 'Simple Pendulum', Component: Pendulum },
  'wave':             { label: 'Wave Superposition', Component: Wave },
  'ideal-gas':        { label: 'Ideal Gas Law', Component: IdealGas },
  'ph-titration':     { label: 'Acid–Base Titration', Component: Titration },
  'population':       { label: 'Logistic Growth', Component: Population },
  'hardy-weinberg':   { label: 'Hardy–Weinberg', Component: HardyWeinberg },
  'sir':              { label: 'SIR Epidemic', Component: SIR },
  'function-plotter': { label: 'Function Plotter', Component: FunctionPlotter },
  'prime-sieve':      { label: 'Prime Sieve', Component: PrimeSieve },
  'sorting':          { label: 'Sorting Visualizer', Component: Sorting },
  'big-o':            { label: 'Big-O Complexity', Component: BigO },
  'orbit':            { label: 'Orbital Mechanics', Component: Orbit },
  'neuron':           { label: 'Spiking Neuron', Component: Neuron },
  'beam':             { label: 'Beam Analysis', Component: Beam },
};

/** Resolve a list of ids to renderable entries (skips unknown ids). */
export function resolveSimulators(ids?: string[]): { id: string; entry: SimEntry }[] {
  return (ids || []).map(id => ({ id, entry: SIMULATORS[id] })).filter((x): x is { id: string; entry: SimEntry } => !!x.entry);
}
