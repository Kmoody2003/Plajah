// The FL-style step graph editor — shape velocity, pitch or pan across the selected pad's row.
//
// This is the channel-graph half of FL Studio's step sequencer: pick a mode, drag the bars, and
// every step's per-hit value is set at once. Velocity already lived on the step; pitch and pan
// are the new per-step fields (grooveDoc Step.pitch / Step.pan), wired through the scheduler and
// voice so they actually sound. Dragging a bar on an empty step turns that step on.

import React, { useCallback, useRef, useState } from 'react';
import type { GrooveDoc, Pattern, Step } from '../../../../services/melos/beats/grooveDoc';
import { PLAYHEAD } from '../theme';

const ORANGE_MODE = '#FF8C00';

type Mode = 'vel' | 'pitch' | 'pan';
const MODES: { id: Mode; label: string; color: string }[] = [
  { id: 'vel', label: 'Velocity', color: '#FF8C00' },
  { id: 'pitch', label: 'Pitch', color: '#00DAF3' },
  { id: 'pan', label: 'Pan', color: '#D0BCFF' },
];

interface Props {
  doc: GrooveDoc;
  pattern: Pattern;
  padIdx: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

// value → 0..1 bar fraction, and back, per mode.
const toFrac = (mode: Mode, s: Step | undefined): number => {
  if (mode === 'vel') return (s?.v ?? 1) / 127;
  if (mode === 'pitch') return 0.5 + (s?.pitch ?? 0) / 48;   // ±24 semis
  return 0.5 + (s?.pan ?? 0) / 2;                             // ±1 pan
};
const fromFrac = (mode: Mode, f: number): Partial<Step> => {
  const y = Math.max(0, Math.min(1, f));
  if (mode === 'vel') return { v: Math.round(1 + y * 126) };
  if (mode === 'pitch') return { pitch: Math.round((y - 0.5) * 48) };
  return { pan: +((y - 0.5) * 2).toFixed(2) };
};
const fmt = (mode: Mode, s: Step | undefined): string => {
  if (mode === 'vel') return String(s?.v ?? '—');
  if (mode === 'pitch') { const p = s?.pitch ?? 0; return `${p >= 0 ? '+' : ''}${p}`; }
  const p = s?.pan ?? 0; return p === 0 ? 'C' : p < 0 ? `L${Math.round(-p * 100)}` : `R${Math.round(p * 100)}`;
};

export const StepGraphEditor: React.FC<Props> = ({ doc, pattern, padIdx, onMutate }) => {
  const [mode, setMode] = useState<Mode>('vel');
  const [selStep, setSelStep] = useState(0);
  const graphRef = useRef<HTMLDivElement>(null);
  const cols = Math.min(pattern.length, 16);
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
        <span className="ml-auto text-[10px] font-mono" style={{ color: modeColor }}>
          Step {selStep + 1}: {fmt(mode, sel)}
        </span>
      </div>

      <div ref={graphRef} className="relative rounded-[12px] border border-white/10 bg-black/30 p-2.5" style={{ height: 128 }}>
        {mode !== 'vel' && <div className="absolute left-2.5 right-2.5 top-1/2 h-px bg-white/12" />}
        <div className="grid gap-[4px] h-full items-end" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, c) => {
            const s = row[c];
            const frac = toFrac(mode, s);
            const on = !!s;
            const isSel = c === selStep;
            return (
              <div
                key={c}
                className="h-full flex flex-col justify-end cursor-ns-resize relative"
                onPointerDown={(e) => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ } dragTo(c, e.clientY); }}
                onPointerMove={(e) => { if (e.buttons === 1) dragTo(c, e.clientY); }}
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
        <span>drag a bar to set · dragging an empty step turns it on</span>
        <span className="ml-auto flex items-center gap-3">
          <span style={{ color: ORANGE_MODE }}>velocity 1–127</span>
          <span style={{ color: '#00DAF3' }}>pitch ±24 st</span>
          <span style={{ color: '#D0BCFF' }}>pan L↔R</span>
        </span>
      </div>
    </div>
  );
};
