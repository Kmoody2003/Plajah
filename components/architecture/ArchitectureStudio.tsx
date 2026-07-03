import React, { useState, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, Box, Waves, Loader2 } from 'lucide-react';
import {
  kN,
  GPa,
  mm4_to_m4,
  cm4_to_m4,
  mm3_to_m3,
  cm3_to_m3,
  mm,
  ssBeamUDL,
  ssBeamPoint,
  cantileverPoint,
  cantileverUDL,
  rectSection,
  circleSection,
  bendingStress,
  eulerBuckling,
  K_PRESETS,
  asce7LRFD,
  fmt,
} from './structuralMath';

// Heavy 3D viewer is lazy so the calculators render instantly.
const ModelViewer = lazy(() => import('./ModelViewer'));
const SimulationEngines = lazy(() => import('./SimulationEngines'));

type Tab = 'calc' | 'viewer' | 'engines';

export default function ArchitectureStudio({ accent = '#B08968' }: { accent?: string }) {
  const [tab, setTab] = useState<Tab>('calc');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'calc', label: 'Structural Calculators', icon: <Calculator className="h-3.5 w-3.5" /> },
    { id: 'viewer', label: 'Model Viewer', icon: <Box className="h-3.5 w-3.5" /> },
    { id: 'engines', label: 'Simulation Engines', icon: <Waves className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="w-full">
      {/* header */}
      <div className="mb-5">
        <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: accent }}>
          Architecture · Simulate
        </div>
        <h2 className="mt-1 text-xl font-black text-white/90">Engineering Studio</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-white/50">
          Run the engineering tests, upload a model to inspect, and connect to the architecture simulation engines.
        </p>
      </div>

      {/* tab bar */}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[8px] font-black uppercase tracking-widest transition-colors ${
                active ? 'text-black' : 'border-white/8 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
              }`}
              style={active ? { background: accent, borderColor: accent } : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'calc' && <Calculators accent={accent} />}
          {tab === 'viewer' && (
            <Suspense fallback={<Loader accent={accent} label="Loading 3D viewer…" />}>
              <ModelViewer accent={accent} />
            </Suspense>
          )}
          {tab === 'engines' && (
            <Suspense fallback={<Loader accent={accent} label="Loading engines…" />}>
              <SimulationEngines accent={accent} />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Loader({ accent, label }: { accent: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[1.4rem] border border-white/8 bg-white/[0.03] py-16 text-xs text-white/50">
      <Loader2 className="h-4 w-4 animate-spin" style={{ color: accent }} />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, subtitle, accent, children }: { title: string; subtitle?: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
      <div className="mb-3">
        <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: accent }}>
          {title}
        </div>
        {subtitle && <div className="mt-0.5 text-[11px] text-white/40">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function NumField({
  label,
  unit,
  value,
  onChange,
  accent,
  step,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  accent: string;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/45">{label}</span>
        <span className="text-[8px] font-bold text-white/30">{unit}</span>
      </div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step ?? 'any'}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm font-semibold text-white/90 outline-none transition-colors focus:border-white/25"
        style={{ caretColor: accent }}
      />
    </label>
  );
}

function Result({ label, value, unit, accent, formula }: { label: string; value: string; unit: string; accent: string; formula?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
      <div className="text-[8px] font-black uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-base font-black text-white/95">{value}</span>
        <span className="text-[10px] font-bold text-white/40">{unit}</span>
      </div>
      {formula && (
        <div className="mt-1 font-mono text-[10px]" style={{ color: accent }}>
          {formula}
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange, accent }: { options: readonly { id: T; label: string }[]; value: T; onChange: React.Dispatch<React.SetStateAction<T>>; accent: string }) {
  return (
    <div className="inline-flex rounded-full border border-white/8 bg-black/30 p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest transition-colors ${active ? 'text-black' : 'text-white/50 hover:text-white/80'}`}
            style={active ? { background: accent } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculators tab
// ─────────────────────────────────────────────────────────────────────────────
function Calculators({ accent }: { accent: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SimplySupportedBeam accent={accent} />
      <CantileverBeam accent={accent} />
      <SectionProperties accent={accent} />
      <EulerColumn accent={accent} />
      <div className="lg:col-span-2">
        <AsceCombos accent={accent} />
      </div>
    </div>
  );
}

// ── 1. Simply-supported beam ──────────────────────────────────────────────────
function SimplySupportedBeam({ accent }: { accent: string }) {
  const [mode, setMode] = useState<'udl' | 'point'>('udl');
  const [L, setL] = useState(6);
  const [w, setW] = useState(10); // kN/m
  const [P, setP] = useState(50); // kN
  const [E, setE] = useState(200); // GPa
  const [Iunit, setIunit] = useState<'mm4' | 'cm4'>('cm4');
  const [I, setI] = useState(21400); // cm^4 (approx a UB section)
  const [S, setS] = useState(1500); // section modulus, cm^3 (optional)
  const [Sunit, setSunit] = useState<'mm3' | 'cm3'>('cm3');

  const Im4 = (I || 0) * (Iunit === 'mm4' ? mm4_to_m4 : cm4_to_m4);
  const Em = (E || 0) * GPa;
  const Sm3 = (S || 0) * (Sunit === 'mm3' ? mm3_to_m3 : cm3_to_m3);

  const r = useMemo(() => {
    return mode === 'udl' ? ssBeamUDL((w || 0) * kN, L || 0, Em, Im4) : ssBeamPoint((P || 0) * kN, L || 0, Em, Im4);
  }, [mode, w, P, L, Em, Im4]);

  const sigma = bendingStress(r.Mmax, Sm3); // Pa

  return (
    <Card title="Simply-supported beam" subtitle="Pinned–roller span, one span" accent={accent}>
      <div className="mb-3">
        <Seg
          value={mode}
          onChange={setMode}
          accent={accent}
          options={[
            { id: 'udl', label: 'UDL w' },
            { id: 'point', label: 'Central P' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Span L" unit="m" value={L} onChange={setL} accent={accent} />
        {mode === 'udl' ? (
          <NumField label="Load w" unit="kN/m" value={w} onChange={setW} accent={accent} />
        ) : (
          <NumField label="Point load P" unit="kN" value={P} onChange={setP} accent={accent} />
        )}
        <NumField label="Modulus E" unit="GPa" value={E} onChange={setE} accent={accent} />
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/45">Moment of inertia I</span>
            <Seg value={Iunit} onChange={setIunit} accent={accent} options={[{ id: 'cm4', label: 'cm⁴' }, { id: 'mm4', label: 'mm⁴' }]} />
          </div>
          <input
            type="number"
            value={Number.isFinite(I) ? I : ''}
            onChange={(e) => setI(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm font-semibold text-white/90 outline-none focus:border-white/25"
          />
        </label>
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/45">Section modulus S (opt.)</span>
            <Seg value={Sunit} onChange={setSunit} accent={accent} options={[{ id: 'cm3', label: 'cm³' }, { id: 'mm3', label: 'mm³' }]} />
          </div>
          <input
            type="number"
            value={Number.isFinite(S) ? S : ''}
            onChange={(e) => setS(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm font-semibold text-white/90 outline-none focus:border-white/25"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Result label="Max moment" value={fmt(r.Mmax / kN, 2)} unit="kN·m" accent={accent} formula={mode === 'udl' ? 'Mmax = wL²/8' : 'Mmax = PL/4'} />
        <Result label="Max shear" value={fmt(r.Vmax / kN, 2)} unit="kN" accent={accent} formula={mode === 'udl' ? 'V = wL/2' : 'V = P/2'} />
        <Result label="Max deflection" value={fmt(r.dMax * 1000, 3)} unit="mm" accent={accent} formula={mode === 'udl' ? 'δ = 5wL⁴/384EI' : 'δ = PL³/48EI'} />
        <Result label="Bending stress σ" value={S ? fmt(sigma / 1e6, 2) : '—'} unit="MPa" accent={accent} formula="σ = M/S" />
      </div>
    </Card>
  );
}

// ── 2. Cantilever beam ────────────────────────────────────────────────────────
function CantileverBeam({ accent }: { accent: string }) {
  const [mode, setMode] = useState<'point' | 'udl'>('point');
  const [L, setL] = useState(3);
  const [P, setP] = useState(20); // kN
  const [w, setW] = useState(8); // kN/m
  const [E, setE] = useState(200); // GPa
  const [I, setI] = useState(8500); // cm^4
  const [Iunit, setIunit] = useState<'mm4' | 'cm4'>('cm4');

  const Im4 = (I || 0) * (Iunit === 'mm4' ? mm4_to_m4 : cm4_to_m4);
  const Em = (E || 0) * GPa;

  const r = useMemo(() => {
    return mode === 'point' ? cantileverPoint((P || 0) * kN, L || 0, Em, Im4) : cantileverUDL((w || 0) * kN, L || 0, Em, Im4);
  }, [mode, P, w, L, Em, Im4]);

  return (
    <Card title="Cantilever beam" subtitle="Fixed at one end, free at the tip" accent={accent}>
      <div className="mb-3">
        <Seg
          value={mode}
          onChange={setMode}
          accent={accent}
          options={[
            { id: 'point', label: 'End P' },
            { id: 'udl', label: 'UDL w' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Length L" unit="m" value={L} onChange={setL} accent={accent} />
        {mode === 'point' ? (
          <NumField label="End load P" unit="kN" value={P} onChange={setP} accent={accent} />
        ) : (
          <NumField label="Load w" unit="kN/m" value={w} onChange={setW} accent={accent} />
        )}
        <NumField label="Modulus E" unit="GPa" value={E} onChange={setE} accent={accent} />
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/45">Inertia I</span>
            <Seg value={Iunit} onChange={setIunit} accent={accent} options={[{ id: 'cm4', label: 'cm⁴' }, { id: 'mm4', label: 'mm⁴' }]} />
          </div>
          <input
            type="number"
            value={Number.isFinite(I) ? I : ''}
            onChange={(e) => setI(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm font-semibold text-white/90 outline-none focus:border-white/25"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Result label="Max moment" value={fmt(r.Mmax / kN, 2)} unit="kN·m" accent={accent} formula={mode === 'point' ? 'M = PL' : 'M = wL²/2'} />
        <Result label="Max shear" value={fmt(r.Vmax / kN, 2)} unit="kN" accent={accent} formula={mode === 'point' ? 'V = P' : 'V = wL'} />
        <Result label="Tip deflection" value={fmt(r.dMax * 1000, 3)} unit="mm" accent={accent} formula={mode === 'point' ? 'δ = PL³/3EI' : 'δ = wL⁴/8EI'} />
      </div>
    </Card>
  );
}

// ── 3. Section properties ─────────────────────────────────────────────────────
function SectionProperties({ accent }: { accent: string }) {
  const [shape, setShape] = useState<'rect' | 'circle'>('rect');
  const [b, setB] = useState(150); // mm
  const [h, setH] = useState(300); // mm
  const [d, setD] = useState(200); // mm

  // compute in mm, then also present in cm for convenience
  const res = useMemo(() => (shape === 'rect' ? rectSection(b || 0, h || 0) : circleSection(d || 0)), [shape, b, h, d]);

  return (
    <Card title="Section properties" subtitle="Centroidal strong-axis I, S, A" accent={accent}>
      <div className="mb-3">
        <Seg
          value={shape}
          onChange={setShape}
          accent={accent}
          options={[
            { id: 'rect', label: 'Rectangle' },
            { id: 'circle', label: 'Circle' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {shape === 'rect' ? (
          <>
            <NumField label="Width b" unit="mm" value={b} onChange={setB} accent={accent} />
            <NumField label="Height h" unit="mm" value={h} onChange={setH} accent={accent} />
          </>
        ) : (
          <NumField label="Diameter d" unit="mm" value={d} onChange={setD} accent={accent} />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Result label="Area A" value={fmt(res.A, 0)} unit="mm²" accent={accent} formula={shape === 'rect' ? 'A = b·h' : 'A = πd²/4'} />
        <Result label="Moment of inertia I" value={fmt(res.I / 1e4, 1)} unit="cm⁴" accent={accent} formula={shape === 'rect' ? 'I = bh³/12' : 'I = πd⁴/64'} />
        <Result label="Section modulus S" value={fmt(res.S / 1e3, 1)} unit="cm³" accent={accent} formula={shape === 'rect' ? 'S = bh²/6' : 'S = πd³/32'} />
        <Result label="Extreme fibre c" value={fmt(res.c, 1)} unit="mm" accent={accent} formula="c = h/2" />
      </div>
    </Card>
  );
}

// ── 4. Euler column buckling ──────────────────────────────────────────────────
function EulerColumn({ accent }: { accent: string }) {
  const [E, setE] = useState(200); // GPa
  const [I, setI] = useState(1200); // cm^4
  const [Iunit, setIunit] = useState<'mm4' | 'cm4'>('cm4');
  const [L, setL] = useState(4); // m
  const [A, setA] = useState(4000); // mm^2
  const [kKey, setKKey] = useState<keyof typeof K_PRESETS>('pinnedPinned');

  const Im4 = (I || 0) * (Iunit === 'mm4' ? mm4_to_m4 : cm4_to_m4);
  const Am2 = (A || 0) * mm * mm;
  const K = K_PRESETS[kKey].K;

  const r = useMemo(() => eulerBuckling((E || 0) * GPa, Im4, L || 0, K, Am2), [E, Im4, L, K, Am2]);

  return (
    <Card title="Euler column buckling" subtitle="Elastic critical load" accent={accent}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(K_PRESETS) as (keyof typeof K_PRESETS)[]).map((k) => {
          const active = kKey === k;
          return (
            <button
              key={k}
              onClick={() => setKKey(k)}
              className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-widest transition-colors ${
                active ? 'text-black' : 'border-white/8 bg-black/30 text-white/50 hover:text-white/80'
              }`}
              style={active ? { background: accent, borderColor: accent } : undefined}
            >
              {K_PRESETS[k].label} · K={K_PRESETS[k].K}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Modulus E" unit="GPa" value={E} onChange={setE} accent={accent} />
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/45">Inertia I</span>
            <Seg value={Iunit} onChange={setIunit} accent={accent} options={[{ id: 'cm4', label: 'cm⁴' }, { id: 'mm4', label: 'mm⁴' }]} />
          </div>
          <input
            type="number"
            value={Number.isFinite(I) ? I : ''}
            onChange={(e) => setI(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm font-semibold text-white/90 outline-none focus:border-white/25"
          />
        </label>
        <NumField label="Length L" unit="m" value={L} onChange={setL} accent={accent} />
        <NumField label="Area A" unit="mm²" value={A} onChange={setA} accent={accent} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Result label="Critical load Pcr" value={fmt(r.Pcr / kN, 1)} unit="kN" accent={accent} formula="Pcr = π²EI/(KL)²" />
        <Result label="Effective length Le" value={fmt(r.Le, 2)} unit="m" accent={accent} formula="Le = K·L" />
        <Result label="Critical stress σcr" value={fmt(r.sigmaCr / 1e6, 1)} unit="MPa" accent={accent} formula="σcr = Pcr/A" />
        <Result label="Slenderness λ" value={fmt(r.slenderness, 1)} unit="Le/r" accent={accent} formula="λ = Le/√(I/A)" />
      </div>
    </Card>
  );
}

// ── 5. ASCE 7 load combinations ───────────────────────────────────────────────
function AsceCombos({ accent }: { accent: string }) {
  const [unit, setUnit] = useState<'kN' | 'kPa'>('kN');
  const [D, setD] = useState(20);
  const [L, setL] = useState(15);
  const [Lr, setLr] = useState(5);
  const [S, setS] = useState(0);
  const [R, setR] = useState(0);
  const [W, setW] = useState(12);
  const [E, setE] = useState(18);

  const { combos, governing } = useMemo(() => asce7LRFD({ D, L, Lr, S, R, W, E }), [D, L, Lr, S, R, W, E]);

  return (
    <Card title="ASCE 7-16 · LRFD load combinations" subtitle="§2.3.1 strength design — governing value highlighted" accent={accent}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[8px] font-black uppercase tracking-widest text-white/40">Load effects (same unit each)</div>
        <Seg
          value={unit}
          onChange={setUnit}
          accent={accent}
          options={[
            { id: 'kN', label: 'kN' },
            { id: 'kPa', label: 'kPa' },
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <NumField label="Dead D" unit={unit} value={D} onChange={setD} accent={accent} />
        <NumField label="Live L" unit={unit} value={L} onChange={setL} accent={accent} />
        <NumField label="Roof Lr" unit={unit} value={Lr} onChange={setLr} accent={accent} />
        <NumField label="Snow S" unit={unit} value={S} onChange={setS} accent={accent} />
        <NumField label="Rain R" unit={unit} value={R} onChange={setR} accent={accent} />
        <NumField label="Wind W" unit={unit} value={W} onChange={setW} accent={accent} />
        <NumField label="Seismic E" unit={unit} value={E} onChange={setE} accent={accent} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
        {combos.map((c, i) => {
          const gov = c.id === governing.id;
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i % 2 ? 'bg-white/[0.02]' : ''}`}
              style={gov ? { background: `${accent}1f` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="w-4 text-[10px] font-bold text-white/30">{c.id}</span>
                <span className="font-mono text-[11px] text-white/70">{c.expr}</span>
                {gov && (
                  <span className="rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-black" style={{ background: accent }}>
                    Governs
                  </span>
                )}
              </div>
              <div className="font-bold text-white/90">
                {fmt(c.value, 2)} <span className="text-[10px] font-bold text-white/40">{unit}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-white/40">
        Governing design demand: <span className="font-bold" style={{ color: accent }}>{fmt(governing.value, 2)} {unit}</span> from combination {governing.id} ({governing.expr}).
      </div>
    </Card>
  );
}
