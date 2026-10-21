// The FL-style step graph editor — shape velocity, pitch or pan across the selected pad's row.
//
// This is the channel-graph half of FL Studio's step sequencer: pick a mode, drag the bars, and
// every step's per-hit value is set at once. Velocity already lived on the step; pitch and pan
// are the new per-step fields (grooveDoc Step.pitch / Step.pan), wired through the scheduler and
// voice so they actually sound. Dragging a bar on an empty step turns that step on.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GrooveDoc, Pattern, Step } from '../../../../services/melos/beats/grooveDoc';
import { PLAYHEAD } from '../theme';
import { cutoffHz, tailMul } from '../../../../services/melos/beats/engine/stepMods';


// FL's channel-graph lanes, on Melos's Step fields (grooveDoc Step): velocity, pitch (+ fine
// cents), pan, the per-hit low-pass (cutoff = FL Mod X, resonance = Mod Y), tail length, and shift
// (the step's micro timing).
type Mode = 'vel' | 'pitch' | 'fine' | 'pan' | 'cut' | 'res' | 'rel' | 'shift';
const MODES: { id: Mode; label: string; color: string; field?: keyof Step }[] = [
  { id: 'vel', label: 'Velocity', color: '#FF8C00' },
  { id: 'pitch', label: 'Pitch', color: '#00DAF3', field: 'pitch' },
  { id: 'fine', label: 'Fine', color: '#38BDF8', field: 'fine' },
  { id: 'pan', label: 'Pan', color: '#D0BCFF', field: 'pan' },
  { id: 'cut', label: 'Cutoff', color: '#06D6A0', field: 'cut' },
  { id: 'res', label: 'Res', color: '#34D399', field: 'res' },
  { id: 'rel', label: 'Tail', color: '#FFD166', field: 'rel' },
  { id: 'shift', label: 'Shift', color: '#FF4D8D', field: 'micro' },
];
/** Lanes that sit at the centre when unset (bipolar). */
const BIPOLAR = new Set<Mode>(['pitch', 'fine', 'pan', 'shift']);

interface Props {
  doc: GrooveDoc;
  pattern: Pattern;
  padIdx: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

// value → 0..1 bar fraction, and back, per mode.
const toFrac = (mode: Mode, s: Step | undefined): number => {
  switch (mode) {
    case 'vel': return (s?.v ?? 1) / 127;
    case 'pitch': return 0.5 + (s?.pitch ?? 0) / 48;   // ±24 semis
    case 'fine': return 0.5 + (s?.fine ?? 0) / 200;    // ±100 cents
    case 'pan': return 0.5 + (s?.pan ?? 0) / 2;        // ±1
    case 'cut': return s?.cut ?? 1;                    // unset = open
    case 'res': return s?.res ?? 0;
    case 'rel': return s?.rel ?? 0.5;                  // unset = the pad's own tail
    case 'shift': return 0.5 + (s?.micro ?? 0);        // ±½ step
  }
};
const fromFrac = (mode: Mode, f: number): Partial<Step> => {
  const y = Math.max(0, Math.min(1, f));
  switch (mode) {
    case 'vel': return { v: Math.round(1 + y * 126) };
    case 'pitch': return { pitch: Math.round((y - 0.5) * 48) };
    case 'fine': return { fine: Math.round((y - 0.5) * 200) };
    case 'pan': return { pan: +((y - 0.5) * 2).toFixed(2) };
    case 'cut': return { cut: +y.toFixed(3) };
    case 'res': return { res: +y.toFixed(3) };
    case 'rel': return { rel: +y.toFixed(3) };
    case 'shift': return { micro: +(y - 0.5).toFixed(3) };
  }
};
const fmt = (mode: Mode, s: Step | undefined): string => {
  switch (mode) {
    case 'vel': return String(s?.v ?? '—');
    case 'pitch': { const p = s?.pitch ?? 0; return `${p >= 0 ? '+' : ''}${p}`; }
    case 'fine': { const c = s?.fine ?? 0; return `${c >= 0 ? '+' : ''}${c}c`; }
    case 'pan': { const p = s?.pan ?? 0; return p === 0 ? 'C' : p < 0 ? `L${Math.round(-p * 100)}` : `R${Math.round(p * 100)}`; }
    case 'cut': return s?.cut === undefined ? 'open' : `${Math.round(cutoffHz(s.cut))} Hz`;
    case 'res': return `${Math.round((s?.res ?? 0) * 100)}%`;
    case 'rel': return s?.rel === undefined ? 'pad' : `×${tailMul(s.rel).toFixed(2)}`;
    case 'shift': return `${Math.round((s?.micro ?? 0) * 100)}%`;
  }
};

export const StepGraphEditor: React.FC<Props> = ({ doc, pattern, padIdx, onMutate }) => {
  const [mode, setMode] = useState<Mode>('vel');
  const [selStep, setSelStep] = useState(0);
  const graphRef = useRef<HTMLDivElement>(null);
  // Patterns longer than 16 steps page in 16-step bars, the same chips the channel rack uses.
  const pages = Math.max(1, Math.ceil(pattern.length / 16));
  const [page, setPage] = useState(0);
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const colBase = Math.min(page, pages - 1) * 16;
  const cols = Math.min(16, pattern.length - colBase);
  const pad = doc.kit[padIdx];
  const row = pattern.steps[padIdx] || {};
  const modeColor = MODES.find((m) => m.id === mode)!.color;

  const setStepValue = useCallback((c: number, frac: number) => {
    onMutate((d) => {
      const pat = d.patterns.find((p) => p.id === pattern.id);
      if (!pat) return;
      const r = pat.steps[padIdx] || (pat.steps[padIdx] = {});
      const existing = r[c];
      const base: Step = existing ?? { v: 100 };
      r[c] = { ...base, ...fromFrac(mode, frac) };
    });
  }, [onMutate, pattern.id, padIdx, mode]);

  const dragTo = useCallback((c: number, clientY: number) => {
    const g = graphRef.current; if (!g) return;
    const rect = g.getBoundingClientRect();
    const f = 1 - (clientY - rect.top - 10) / (rect.height - 20);
    setStepValue(c, f);
    setSelStep(c);
  }, [setStepValue]);

  const sel = row[selStep];
  /** Graph column under a client x (null outside the bars). */
  const colAt = (clientX: number): number | null => {
    const g = graphRef.current; if (!g) return null;
    const r = g.getBoundingClientRect();
    const x = clientX - r.left - 10;
    const w = r.width - 20;
    if (x < 0 || x > w) return null;
    return colBase + Math.max(0, Math.min(cols - 1, Math.floor((x / w) * cols)));
  };

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Step control · {pad?.name}</span>
        <div className="flex gap-1.5 ml-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="h-7 px-3 rounded-lg text-[11px] font-bold border transition-colors"
              style={mode === m.id
                ? { color: m.color, borderColor: `${m.color}80`, background: `${m.color}14` }
                : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.1)' }}
            >{m.label}</button>
          ))}
        </div>
        {pages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="h-[18px] px-1.5 rounded text-[9px] font-mono border transition-colors"
                style={i === Math.min(page, pages - 1)
                  ? { borderColor: `${PLAYHEAD}66`, color: PLAYHEAD, background: 'rgba(0,218,243,0.08)' }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
                title={`Steps ${i * 16 + 1}–${Math.min((i + 1) * 16, pattern.length)}`}
              >{i * 16 + 1}–{Math.min((i + 1) * 16, pattern.length)}</button>
            ))}
          </div>
        )}
        <span className="ml-auto text-[10px] font-mono" style={{ color: modeColor }}>
          Step {selStep + 1}: {fmt(mode, sel)}
        </span>
      </div>

      <div
        ref={graphRef}
        className="relative rounded-[12px] border border-white/10 bg-black/30 p-2.5 touch-none"
        style={{ height: 128 }}
        // Paint across bars FL-style: the column follows the pointer while the button is held.
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const c = colAt(e.clientX); if (c !== null) dragTo(c, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons !== 1) return; const c = colAt(e.clientX); if (c !== null) dragTo(c, e.clientY); }}
      >
        {BIPOLAR.has(mode) && <div className="absolute left-2.5 right-2.5 top-1/2 h-px bg-white/12" />}
        <div className="grid gap-[4px] h-full items-end" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, ci) => {
            const c = colBase + ci;
            const s = row[c];
            const frac = toFrac(mode, s);
            const on = !!s;
            const isSel = c === selStep;
            return (
              <div
                key={c}
                className="h-full flex flex-col justify-end cursor-ns-resize relative"
                title={`Step ${c + 1}`}
              >
                {isSel && <div className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[8px]" style={{ color: modeColor }}>{fmt(mode, s)}</div>}
                <div
                  className="rounded-t-[3px] transition-[height]"
                  style={{
                    height: `${Math.max(3, frac * 100)}%`,
                    background: modeColor,
                    opacity: on ? (mode === 'vel' ? 0.5 + frac * 0.5 : 0.85) : 0.18,
                    outline: isSel ? `1px solid ${PLAYHEAD}` : 'none',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5 text-[10px] text-white/30 flex-wrap">
        <span>drag across the bars to paint · dragging an empty step turns it on</span>
        {MODES.find((m) => m.id === mode)?.field && (
          <button
            onClick={() => onMutate((d) => {
              const pat = d.patterns.find((p) => p.id === pattern.id);
              const r = pat?.steps[padIdx];
              const field = MODES.find((m) => m.id === mode)!.field!;
              if (r) for (const st of Object.values(r)) delete st[field];
            })}
            className="ml-auto h-6 px-2 rounded-md border border-white/12 hover:text-white"
            style={{ color: modeColor }}
            title="Reset this lane on every step of the channel"
          >Reset {MODES.find((m) => m.id === mode)?.label}</button>
        )}
      </div>
    </div>
  );
};
