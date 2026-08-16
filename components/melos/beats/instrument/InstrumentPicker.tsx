// Choose an instrument — the thing that opens when you add one, from any view.
//
// The point the user made: adding an instrument should be choosing WHAT KIND of instrument you
// want, not scrolling a preset list. So this leads with the instruments themselves; a preset is
// a later choice inside the panel, never a gate on getting started.

import React from 'react';
import { X } from 'lucide-react';
import { INSTRUMENTS } from '../../../../services/melos/beats/instrumentFactory';
import type { InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { SURFACE } from '../theme';

interface Props {
  onPick: (type: InstrumentType) => void;
  onClose: () => void;
  /** Shown in the header — "as a track" vs "on this pad". */
  destination?: string;
}

export const InstrumentPicker: React.FC<Props> = ({ onPick, onClose, destination }) => (
  <div className="absolute inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-5" onClick={onClose}>
    <div
      className="w-full max-w-md rounded-[20px] border border-white/[0.16] shadow-2xl overflow-hidden"
      style={{ background: SURFACE }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0E0E12' }}>
        <span className="text-[12px] font-semibold text-white">Add an instrument{destination ? ` ${destination}` : ''}</span>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
          <X size={14} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.name}
            disabled={!inst.ready}
            onClick={() => { onPick(inst.type as InstrumentType); onClose(); }}
            className="text-left rounded-xl border p-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: inst.ready ? `${inst.color}4d` : 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg flex-none grid place-items-center font-black text-[11px]"
                style={{ background: `${inst.color}26`, color: inst.color }}>
                {inst.name.slice(0, 2)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white">{inst.name}</span>
                  {!inst.ready && <span className="text-[9px] uppercase tracking-wide text-white/35 border border-white/12 rounded px-1.5">soon</span>}
                </div>
                <p className="text-[11px] text-white/45 leading-snug">{inst.blurb}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);
