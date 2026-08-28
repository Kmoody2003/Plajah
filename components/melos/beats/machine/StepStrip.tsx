// The 16-step strip for the selected pad — one gesture below the pads, never a mode switch.
// Click toggles a step; vertical drag on an active step shapes its velocity; the playhead
// sweeps in cyan. Patterns longer than 16 page with the bar selector.

import React, { useCallback, useRef, useState } from 'react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { ARMED, PLAYHEAD, SURFACE_CELL } from '../theme';

interface StepStripProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;      // transport position from the bridge
  running: boolean;
  playMode: 'pattern' | 'song';
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const StepStrip: React.FC<StepStripProps> = ({ doc, pattern, selectedPad, beats, running, playMode, onMutate }) => {
  const [page, setPage] = useState(0);
  const drag = useRef<{ step: number; startY: number; startV: number } | null>(null);
  const pages = Math.max(1, pattern.length / 16);
  const safePage = Math.min(page, pages - 1);

  // Pattern-mode playhead: global 16th index folded into the pattern loop.
  const playStep = running && playMode === 'pattern'
    ? ((Math.floor(beats / 0.25) % pattern.length) + pattern.length) % pattern.length
    : -1;

  const toggle = useCallback((stepIdx: number) => {
    onMutate((d) => {
      const pat = d.patterns.find((p) => p.id === pattern.id);
      if (!pat) return;
      const row = pat.steps[selectedPad] || (pat.steps[selectedPad] = {});
      if (row[stepIdx]) delete row[stepIdx];
      else row[stepIdx] = { v: 100 };
    });
  }, [onMutate, pattern.id, selectedPad]);

  const row = pattern.steps[selectedPad] || {};
  const padName = doc.kit[selectedPad]?.name || `Pad ${selectedPad + 1}`;

  return (
    <div className="w-full max-w-[640px] mx-auto mt-4 select-none">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Steps · {padName}</span>
        <div className="flex-1" />
        {pages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`h-5 px-2 rounded text-[9px] font-mono ${i === safePage ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white'}`}
              >{i + 1}</button>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          {([16, 32, 48, 64] as const).map((len) => (
            <button
              key={len}
              onClick={() => onMutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) p.length = len; })}
              className={`h-5 px-1.5 rounded text-[9px] font-mono ${pattern.length === len ? 'text-[#00DAF3]' : 'text-white/30 hover:text-white'}`}
              title={`${len} steps`}
            >{len}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-16 gap-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
        {Array.from({ length: 16 }, (_, i) => {
          const stepIdx = safePage * 16 + i;
          const step = row[stepIdx];
          const isPlayhead = playStep === stepIdx;
          const beatHead = i % 4 === 0;
          const velFrac = step ? step.v / 127 : 0;
          return (
            <button
              key={i}
              onPointerDown={(e) => {
                if (step) {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { step: stepIdx, startY: e.clientY, startV: step.v };
                }
              }}
              onPointerMove={(e) => {
                const dr = drag.current;
                if (!dr || dr.step !== stepIdx) return;
                const dv = Math.round((dr.startY - e.clientY) * 1.2);
                if (Math.abs(dv) < 2) return;
                onMutate((d) => {
                  const p = d.patterns.find((x) => x.id === pattern.id);
                  const s = p?.steps[selectedPad]?.[stepIdx];
                  if (s) s.v = Math.max(1, Math.min(127, dr.startV + dv));
                });
              }}
              onPointerUp={(e) => {
                const dr = drag.current;
                drag.current = null;
                // A click (no meaningful drag) toggles; a drag only shaped velocity.
                if (!dr || Math.abs(dr.startY - e.clientY) < 4) toggle(stepIdx);
              }}
              onClick={(e) => { if (!step) return; e.preventDefault(); }}
              className="h-[34px] rounded-md border transition-colors"
              style={{
                background: step ? `rgba(255,140,0,${0.25 + velFrac * 0.75})` : SURFACE_CELL,
                borderColor: isPlayhead ? PLAYHEAD : beatHead ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                boxShadow: isPlayhead
                  ? `0 0 10px ${PLAYHEAD}66, inset 0 0 0 1px ${PLAYHEAD}`
                  : step && velFrac > 0.85 ? `0 0 8px ${ARMED}55` : 'none',
                touchAction: 'none',
              }}
              aria-label={`Step ${stepIdx + 1}${step ? ` velocity ${step.v}` : ''}`}
              title={step ? `v${step.v} — drag up/down for velocity, click to clear` : 'Click to set'}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-[9px] text-white/25 text-center">click = toggle · drag vertically on a lit step = velocity</p>
    </div>
  );
};
