// Spectra — the EQ + dynamics panel. Bitwig-style: drag a band on the curve, watch the spectrum
// move under your hand; Studio One-depth: 5 musical bands unfold to a surgical grid, each band a
// dynamic EQ. Presets are named engineer moves with the reason shown.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Repeat } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  bandId, curveMagnitudeDb, defaultBands5, expandTo30, defaultSpectra,
  type SpectraBand, type SpectraState, type BandType,
} from '../../../../services/melos/beats/fx/spectraEq';
import { SPECTRA_PRESETS } from '../../../../services/melos/beats/fx/spectraPresets';
import { PLAYHEAD, SELECT, SURFACE } from '../theme';

interface Props { doc: GrooveDoc; onMutate: (fn: (d: GrooveDoc) => void) => void; onClose: () => void; }

const FMIN = 20, FMAX = 20000, GMAX = 24;
const BAND_COLORS = ['#57E389', '#00DAF3', '#FF2E88', '#B84DFF', '#FFC24B', '#FF8C00'];
const TYPES: BandType[] = ['bell', 'lowshelf', 'highshelf', 'highpass', 'lowpass', 'notch'];

export const SpectraPanel: React.FC<Props> = ({ doc, onMutate, onClose }) => {
  const stateRef = useRef<SpectraState>((doc.mixer.master.eq as unknown as SpectraState) || defaultSpectra());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [sel, setSel] = useState(0);
  const [showPresets, setShowPresets] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const state = stateRef.current;

  // push to engine + persist (debounced draw stays live via rAF)
  const commit = useCallback(() => {
    const s = stateRef.current;
    BeatsEngine.get().updateMasterEq(s);
    onMutate((d) => { d.mixer.master.eq = JSON.parse(JSON.stringify(s)); });
    rerender();
  }, [onMutate]);

  // ensure the live device exists so the spectrum shows
  useEffect(() => { BeatsEngine.get().masterEqDevice()?.setState(stateRef.current); }, []);

  const bands = state.bands;
  const band = bands[sel] || bands[0];

  // ── coordinate maps ──
  const dims = () => { const c = canvasRef.current; return { w: c?.clientWidth || 640, h: c?.clientHeight || 260 }; };
  const fToX = (f: number, w: number) => (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * w;
  const xToF = (x: number, w: number) => FMIN * Math.pow(FMAX / FMIN, x / w);
  const gToY = (g: number, h: number) => h / 2 - (g / GMAX) * (h / 2 - 12);
  const yToG = (y: number, h: number) => ((h / 2 - y) / (h / 2 - 12)) * GMAX;

  // ── live draw ──
  useEffect(() => {
    const draw = () => {
      const c = canvasRef.current; const ctx = c?.getContext('2d');
      if (c && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '8px ui-monospace,monospace';
        [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => { const x = fToX(f, w); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 3); });
        [GMAX / 2, 0, -GMAX / 2].forEach((g) => { const y = gToY(g, h); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillText(`${g > 0 ? '+' : ''}${g}`, w - 16, y - 2); });

        const eq = BeatsEngine.get().masterEqDevice();
        if (eq && state.on) {
          eq.tickDynamics();
          const drawSpec = (which: 'pre' | 'post', stroke: string, fill: string | null) => {
            const data = eq.spectrum(which); const sr = eq.sampleRate; const bins = data.length;
            ctx.beginPath();
            let started = false;
            for (let i = 1; i < bins; i++) {
              const f = (i / bins) * (sr / 2); if (f < FMIN || f > FMAX) continue;
              const x = fToX(f, w);
              const db = data[i]; // -140..0
              const y = h - ((db + 100) / 100) * h; // map -100..0 dB → bottom..top
              if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
            if (fill) { ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
          };
          drawSpec('pre', 'rgba(255,255,255,0.28)', null);
          drawSpec('post', PLAYHEAD, 'rgba(0,218,243,0.10)');
        }

        // EQ curve
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) { const f = xToF(x, w); const g = curveMagnitudeDb(bands, f, 48000); const y = gToY(g, h); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = SELECT; ctx.lineWidth = 1.6; ctx.stroke();

        // band nodes
        bands.forEach((bnd, i) => {
          if (!bnd.on) return;
          const x = fToX(bnd.freq, w); const y = gToY(bnd.type === 'highpass' || bnd.type === 'lowpass' || bnd.type === 'notch' ? 0 : bnd.gain, h);
          const col = BAND_COLORS[i % BAND_COLORS.length];
          ctx.beginPath(); ctx.arc(x, y, i === sel ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = i === sel ? col : 'rgba(10,10,14,0.7)'; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
          if (bnd.dynamic?.on) { ctx.beginPath(); ctx.arc(x + 7, y - 7, 3, 0, Math.PI * 2); ctx.fillStyle = '#FFC24B'; ctx.fill(); }
          ctx.fillStyle = i === sel ? '#06121a' : col; ctx.font = 'bold 8px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y); ctx.textAlign = 'start';
        });
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.on]);

  // ── pointer: select + drag a band ──
  const onPointerDown = (e: React.PointerEvent) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect(); const w = rect.width, h = rect.height;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // hit-test nodes
    let hit = -1;
    bands.forEach((bnd, i) => { if (!bnd.on) return; const x = fToX(bnd.freq, w); const y = gToY(['highpass', 'lowpass', 'notch'].includes(bnd.type) ? 0 : bnd.gain, h); if (Math.hypot(px - x, py - y) < 12) hit = i; });
    if (hit < 0) return;
    setSel(hit);
    const start = { ...bands[hit] };
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const b = stateRef.current.bands[hit]; if (!b) return;
      b.freq = Math.max(FMIN, Math.min(FMAX, Math.round(xToF(Math.max(0, Math.min(w, x)), w))));
      if (!['highpass', 'lowpass', 'notch'].includes(b.type)) b.gain = Math.max(-GMAX, Math.min(GMAX, Math.round(yToG(y, h) * 10) / 10));
      BeatsEngine.get().updateMasterEq(stateRef.current); rerender();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    void start;
  };
  const onDouble = (e: React.PointerEvent) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const f = Math.round(xToF(e.clientX - rect.left, rect.width));
    stateRef.current.bands.push({ id: bandId(), freq: Math.max(FMIN, Math.min(FMAX, f)), gain: 0, q: 1.0, type: 'bell', on: true });
    stateRef.current.bands.sort((a, b) => a.freq - b.freq);
    setSel(stateRef.current.bands.findIndex((b) => Math.round(b.freq) === Math.max(FMIN, Math.min(FMAX, f))));
    commit();
  };

  const editBand = (mut: (b: SpectraBand) => void) => { const b = stateRef.current.bands[sel]; if (b) { mut(b); commit(); } };
  const setMode = (mode: 5 | 30) => { stateRef.current.mode = mode; stateRef.current.bands = mode === 30 ? expandTo30(stateRef.current.bands) : defaultBands5(); setSel(0); commit(); };
  const toggleOn = () => { stateRef.current.on = !stateRef.current.on; commit(); };
  const applyPreset = (bands: SpectraBand[]) => { stateRef.current = { on: true, mode: stateRef.current.mode, bands }; setSel(0); setShowPresets(false); commit(); };

  const catList = useMemo(() => [...new Set(SPECTRA_PRESETS.map((p) => p.category))], []);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/72 backdrop-blur-sm p-4" onClick={onClose}>
      <div ref={wrapRef} className="w-full max-w-4xl rounded-[20px] border border-white/[0.16] overflow-hidden shadow-2xl" style={{ background: SURFACE }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0C0C10' }}>
          <span className="font-black text-[13px] tracking-[0.1em]" style={{ color: PLAYHEAD }}>SPECTRA</span>
          <span className="text-[10px] font-mono text-white/35">mix bus</span>
          <button onClick={toggleOn} className="h-7 px-3 rounded-lg text-[11px] border" style={state.on ? { borderColor: `${PLAYHEAD}59`, color: PLAYHEAD, background: `${PLAYHEAD}14` } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>{state.on ? 'On' : 'Off'}</button>
          <div className="flex gap-0.5 bg-black/40 border border-white/10 rounded-lg p-0.5">
            <button onClick={() => setMode(5)} className="h-6 px-2.5 rounded-md text-[10px] font-mono" style={state.mode === 5 ? { background: PLAYHEAD, color: '#06222a', fontWeight: 700 } : { color: 'rgba(255,255,255,0.45)' }}>5-band</button>
            <button onClick={() => setMode(30)} className="h-6 px-2.5 rounded-md text-[10px] font-mono" style={state.mode === 30 ? { background: PLAYHEAD, color: '#06222a', fontWeight: 700 } : { color: 'rgba(255,255,255,0.45)' }}>30-band</button>
          </div>
          <button onClick={() => setShowPresets((v) => !v)} className="h-7 px-3 rounded-lg text-[11px] font-semibold" style={{ color: SELECT }}>Presets ▾</button>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        {showPresets && (
          <div className="border-b border-white/10 p-3 max-h-56 overflow-y-auto" style={{ background: '#0C0C10' }}>
            {catList.map((cat) => (
              <div key={cat} className="mb-2">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">{cat}</p>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
                  {SPECTRA_PRESETS.filter((p) => p.category === cat).map((p) => (
                    <button key={p.name} onClick={() => applyPreset(p.bands())} className="text-left rounded-lg border border-white/10 p-2 hover:border-white/25" style={{ background: '#131318' }}>
                      <span className="text-[11px] font-semibold text-white">{p.name}</span>
                      <span className="block text-[9.5px] text-white/45 leading-snug mt-0.5">{p.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-3">
          <canvas ref={canvasRef} onPointerDown={onPointerDown} onDoubleClick={onDouble} className="w-full rounded-xl border border-white/10 cursor-crosshair" style={{ height: 260, background: 'linear-gradient(180deg,#0b0b10,#090a0d)', display: 'block' }} />
          <p className="text-[9px] text-white/25 mt-1.5">Drag a band on the curve · double-click to add one · the cyan spectrum is post-EQ, the grey is the input.</p>
        </div>

        {/* selected band strip */}
        {band && (
          <div className="px-4 pb-4 flex items-end gap-4 flex-wrap">
            <div className="flex gap-1">
              {TYPES.map((t) => (
                <button key={t} onClick={() => editBand((b) => { b.type = t; })} className="h-6 px-2 rounded-md text-[9px] font-mono border" style={band.type === t ? { borderColor: SELECT, color: '#fff', background: `${SELECT}22` } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>{t}</button>
              ))}
            </div>
            <Field label="Freq" value={`${band.freq >= 1000 ? (band.freq / 1000).toFixed(1) + 'k' : Math.round(band.freq)}`} onDown={() => editBand((b) => { b.freq = Math.max(FMIN, b.freq / 1.06); })} onUp={() => editBand((b) => { b.freq = Math.min(FMAX, b.freq * 1.06); })} />
            {!['highpass', 'lowpass', 'notch'].includes(band.type) && (
              <Field label="Gain" value={`${band.gain > 0 ? '+' : ''}${band.gain.toFixed(1)}`} onDown={() => editBand((b) => { b.gain = Math.max(-GMAX, b.gain - 0.5); })} onUp={() => editBand((b) => { b.gain = Math.min(GMAX, b.gain + 0.5); })} />
            )}
            <Field label="Q" value={band.q.toFixed(2)} onDown={() => editBand((b) => { b.q = Math.max(0.1, b.q / 1.15); })} onUp={() => editBand((b) => { b.q = Math.min(18, b.q * 1.15); })} />
            <button onClick={() => editBand((b) => { b.dynamic = b.dynamic?.on ? { ...b.dynamic, on: false } : { on: true, threshold: b.dynamic?.threshold ?? -18, range: b.dynamic?.range ?? -4 }; })}
              className="h-7 px-3 rounded-lg text-[10px] font-mono border flex items-center gap-1.5" style={band.dynamic?.on ? { borderColor: '#FFC24B', color: '#FFC24B', background: 'rgba(255,194,75,0.12)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
              <Repeat size={11} /> Dynamic {band.dynamic?.on ? 'on' : 'off'}
            </button>
            {band.dynamic?.on && (<>
              <Field label="Thr" value={`${band.dynamic.threshold}`} onDown={() => editBand((b) => { if (b.dynamic) b.dynamic.threshold = Math.max(-48, b.dynamic.threshold - 1); })} onUp={() => editBand((b) => { if (b.dynamic) b.dynamic.threshold = Math.min(0, b.dynamic.threshold + 1); })} />
              <Field label="Range" value={`${band.dynamic.range > 0 ? '+' : ''}${band.dynamic.range}`} onDown={() => editBand((b) => { if (b.dynamic) b.dynamic.range = Math.max(-24, b.dynamic.range - 1); })} onUp={() => editBand((b) => { if (b.dynamic) b.dynamic.range = Math.min(24, b.dynamic.range + 1); })} />
            </>)}
            <span className="flex-1" />
            {bands.length > 1 && <button onClick={() => { stateRef.current.bands.splice(sel, 1); setSel(0); commit(); }} className="h-7 px-3 rounded-lg text-[10px] border border-white/10 text-white/40 hover:text-white">Remove band {sel + 1}</button>}
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onDown: () => void; onUp: () => void }> = ({ label, value, onDown, onUp }) => (
  <div className="flex flex-col items-center gap-1">
    <span className="text-[8.5px] uppercase tracking-wider text-white/35 font-mono">{label}</span>
    <div className="flex items-center gap-1">
      <button onClick={onDown} className="w-5 h-6 rounded-md border border-white/12 text-white/50 hover:text-white text-[12px] leading-none">–</button>
      <span className="w-12 text-center text-[11px] font-mono text-white/80">{value}</span>
      <button onClick={onUp} className="w-5 h-6 rounded-md border border-white/12 text-white/50 hover:text-white text-[12px] leading-none">+</button>
    </div>
  </div>
);
