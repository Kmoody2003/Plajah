// Shared simultaneous 2D + Dedicated Right-Side 3D Instrument Workspace.
// Renders 2D physics visualizers & controls continuously on the left alongside a large
// non-clipping dedicated 3D CAD simulation pane on the right (stacking on narrow windows).

import React, { useEffect, useRef, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { BeatsEngine } from '../../../../../services/melos/beats/engine/BeatsEngine';

interface Split2D3DWorkspaceProps {
  trackId: string;
  accentHex: string;
  title3D: string;
  subtitle3D?: string;
  left: React.ReactNode;
  right3D: React.ReactNode;
  rightFooter?: React.ReactNode;
}

function midiName(midi: number): string {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const r = Math.round(midi);
  return `${names[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

export const Split2D3DWorkspace: React.FC<Split2D3DWorkspaceProps> = ({
  trackId,
  accentHex,
  title3D,
  subtitle3D,
  left,
  right3D,
  rightFooter,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isSideBySide, setIsSideBySide] = useState(true);
  const [paneOpen, setPaneOpen] = useState(true);
  const [telemetry, setTelemetry] = useState<{ notes: number[]; bend: number; vel: number }>({
    notes: [],
    bend: 0,
    vel: 0,
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 900;
      setIsSideBySide(w >= 760);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Poll lightweight live telemetry at ~12 Hz so MIDI note/bend/velocity indicators stay fresh
  useEffect(() => {
    let alive = true;
    const iv = window.setInterval(() => {
      if (!alive) return;
      const inst = BeatsEngine.get().getInstrument(trackId);
      const nextNotes = inst ? inst.heldNoteNumbers() : [];
      const nextBend = inst?.pitchBendValue ?? 0;
      const nextVel = inst?.lastVelocity ?? 0;
      setTelemetry((prev) => {
        if (
          prev.notes.length === nextNotes.length &&
          prev.notes.every((v, i) => v === nextNotes[i]) &&
          Math.abs(prev.bend - nextBend) < 0.01 &&
          Math.abs(prev.vel - nextVel) < 0.01
        ) {
          return prev;
        }
        return { notes: nextNotes, bend: nextBend, vel: nextVel };
      });
    }, 85);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [trackId]);

  if (!paneOpen) {
    return (
      <div ref={hostRef} className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {left}
        </div>
        <button
          type="button"
          onClick={() => setPaneOpen(true)}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/80 hover:bg-black text-[10px] font-bold text-white/85 shadow-lg transition"
          title="Open dedicated 3D simulation viewport"
        >
          <PanelRightOpen size={12} style={{ color: accentHex }} /> 3D Sim View
        </button>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`flex-1 min-h-0 flex ${isSideBySide ? 'flex-row overflow-hidden' : 'flex-col overflow-y-auto custom-scrollbar'}`}
    >
      {/* Left: ALWAYS VISIBLE 2D Physics + Controls + Playable Audition Keys */}
      <div className={isSideBySide ? 'flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar' : 'flex-none min-w-0'}>
        {left}
      </div>

      {/* Right: Dedicated Large Non-Clipping 3D Viewport */}
      <aside
        className={
          isSideBySide
            ? 'flex-none w-[44%] min-w-[340px] max-w-[580px] h-full border-l border-white/10 bg-[#0b0b10] p-3 flex flex-col gap-2.5 min-h-0'
            : 'flex-none w-full min-h-[340px] border-t border-white/10 bg-[#0b0b10] p-3 flex flex-col gap-2.5'
        }
      >
        <div className="flex items-center justify-between gap-2 flex-none">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: accentHex }}>
              {title3D}
            </p>
            {subtitle3D && (
              <p className="text-[10.5px] text-white/60 truncate">{subtitle3D}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[9px] font-mono text-white/75">
              {telemetry.notes.length > 0 ? telemetry.notes.map(midiName).join(' ') : 'Idle'}
            </span>
            {Math.abs(telemetry.bend) > 0.02 && (
              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-[9px] font-mono text-sky-300">
                PB {telemetry.bend >= 0 ? '+' : ''}{(telemetry.bend * 2).toFixed(1)}st
              </span>
            )}
            <button
              type="button"
              onClick={() => setPaneOpen(false)}
              title="Collapse right 3D panel"
              className="p-1 rounded border border-white/10 text-white/45 hover:text-white hover:border-white/25 transition"
            >
              <PanelRightClose size={12} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[280px]">
          {right3D}
        </div>

        {rightFooter && <div className="flex-none">{rightFooter}</div>}
      </aside>
    </div>
  );
};
