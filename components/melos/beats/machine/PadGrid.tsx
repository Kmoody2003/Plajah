// The 4×4 pads — Maschine order (pad 0 = bottom-left). Velocity comes from hit position
// (higher on the pad = harder) plus pointer pressure where the hardware reports it. The
// pointerdown path calls engine.trigger DIRECTLY — no state updates before sound.

import React, { useCallback } from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { GROUP_NAMES } from '../../../../services/melos/beats/grooveDoc';
import { ARMED, SELECT, SURFACE_CELL } from '../theme';
import { liveClearance, type MelosSampleRef } from '../melosSamples';

interface PadGridProps {
  doc: GrooveDoc;
  selectedPad: number;
  frame: number; // rAF tick from the bridge — re-styles pad lights from engine.lastHit
  onSelectPad: (idx: number) => void;
  onDropSample?: (padIdx: number, file: File) => void;
  /** Live Samples-room state, so a pad shows the CURRENT clearance, not the stamped one. */
  melosSamples?: MelosSampleRef[];
  /** Which Group (bank of 16) to show — pad indices are bank*16 + cell. */
  bank?: number;
  /** Click an empty pad → add an instrument onto it. */
  onAddToPad?: (padIdx: number) => void;
}

const HIT_GLOW_MS = 160;

export const PadGrid: React.FC<PadGridProps> = ({ doc, selectedPad, onSelectPad, onDropSample, melosSamples, bank = 0, onAddToPad }) => {
  const engine = BeatsEngine.get();
  const base = bank * 16;

  const hit = useCallback((padIdx: number, e: React.PointerEvent) => {
    const pad = doc.kit[padIdx];
    if (pad?.empty) { onAddToPad?.(padIdx); onSelectPad(padIdx); return; } // empty pad → add an instrument
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const yRel = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const pressure = e.pressure && e.pressure > 0 && e.pressure < 1 ? e.pressure : null;
    const vel = pressure ? Math.round(30 + pressure * 97) : Math.round(127 - yRel * 82);
    void engine.init().then(() => engine.trigger(padIdx, vel));
    onSelectPad(padIdx);
  }, [engine, onSelectPad, doc.kit, onAddToPad]);

  // Note-off: sustaining pads (env.sustain > 0) hold while pressed and release here.
  const lift = useCallback((padIdx: number) => { engine.release(padIdx); }, [engine]);

  const now = performance.now();

  return (
    <div className="grid grid-cols-4 gap-2.5 w-full max-w-[520px] mx-auto select-none" role="group" aria-label="Pads">
      {Array.from({ length: 16 }, (_, cell) => {
        // Render top row first: pad index 0 is bottom-left.
        const rowFromTop = Math.floor(cell / 4);
        const col = cell % 4;
        const padIdx = base + (3 - rowFromTop) * 4 + col;
        const pad = doc.kit[padIdx];
        if (!pad) return <div key={cell} />;
        const empty = !!pad.empty;
        const lit = now - engine.lastHit[padIdx] < HIT_GLOW_MS;
        const selected = padIdx === selectedPad;
        return (
          <button
            key={cell}
            onPointerDown={(e) => hit(padIdx, e)}
            onPointerUp={() => lift(padIdx)}
            onPointerCancel={() => lift(padIdx)}
            onPointerLeave={() => lift(padIdx)}
            onDragOver={(e) => { if (onDropSample) { e.preventDefault(); } }}
            onDrop={(e) => {
              if (!onDropSample) return;
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onDropSample(padIdx, f);
            }}
            className="relative rounded-xl border text-left transition-shadow duration-100"
            style={{
              aspectRatio: '1.25',
              background: empty ? 'rgba(255,255,255,0.015)' : lit ? 'rgba(255,140,0,0.22)' : SURFACE_CELL,
              borderColor: empty ? (selected ? 'rgba(212,0,85,0.5)' : 'rgba(255,255,255,0.07)') : lit ? 'rgba(255,140,0,0.6)' : selected ? SELECT : 'rgba(255,255,255,0.09)',
              borderStyle: empty ? 'dashed' : 'solid',
              boxShadow: lit ? `0 0 22px ${ARMED}59` : selected && !empty ? `0 0 0 1px ${SELECT}` : 'none',
              opacity: empty ? 0.5 : 1,
              touchAction: 'none',
            }}
            aria-label={empty ? `Empty pad ${padIdx + 1} — add an instrument` : `Pad ${padIdx + 1}: ${pad.name}`}
          >
            {empty ? (
              <span className="absolute inset-0 grid place-items-center text-[16px] font-light text-white/25">+</span>
            ) : (
              <>
                <span className="absolute top-1.5 right-2 text-[8px] font-mono text-white/25">{GROUP_NAMES[pad.group]}{pad.choke ? `·c${pad.choke}` : ''}</span>
                <span
                  className="absolute bottom-1.5 left-2 right-2 text-[11px] truncate font-medium"
                  style={{ color: lit ? ARMED : selected ? '#fff' : 'rgba(255,255,255,0.55)' }}
                >
                  {pad.name}
                </span>
              </>
            )}
            {pad.source === 'sample' && pad.sample && !engine.hasSampleBuffer(pad.sample.key) && (
              <span className="absolute top-1.5 left-2 text-[8px] text-[#F59E0B]">loading…</span>
            )}
            {/* Clearance dot for Samples-room sounds — an uncleared sample is visible while you
                build the beat, not at release time. Reads the LIVE status when available. */}
            {pad.melos && (() => {
              const live = liveClearance(melosSamples, pad.melos.sampleId);
              const status = live?.clearance || pad.melos.clearance;
              const color = live?.clearanceColor || (status === 'CLEARED' || status === 'NOT_NEEDED' ? '#06D6A0' : '#F59E0B');
              const blocking = live ? live.blocking : !(status === 'CLEARED' || status === 'NOT_NEEDED');
              return (
                <span
                  className="absolute top-1.5 left-2 flex items-center gap-1"
                  title={`${pad.melos.title} — ${live?.clearanceLabel || status}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {blocking && <span className="text-[7.5px] font-semibold" style={{ color }}>!</span>}
                </span>
              );
            })()}
          </button>
        );
      })}
    </div>
  );
};
