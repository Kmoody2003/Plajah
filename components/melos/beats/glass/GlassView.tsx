// The Glass view — the Plajah-native face: channel rack above, Sequence strip below, both as
// glass panels over the purple wash (the frame behind them is BeatsRoom's wash background).
// Same document, same engine as Machine — switching views mid-playback touches no audio.

import React from 'react';
import { Plus } from 'lucide-react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { ChannelRack } from './ChannelRack';
import { SequenceStrip } from './SequenceStrip';
import { StepGraphEditor } from './StepGraphEditor';
import { StepFxPanel } from './StepFxPanel';

interface GlassViewProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Add an instrument straight from Glass — it lands as a rack channel. */
  onAddInstrument?: () => void;
}

export const GlassView: React.FC<GlassViewProps> = (p) => (
  <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3.5">
    <ChannelRack
      doc={p.doc}
      pattern={p.pattern}
      selectedPad={p.selectedPad}
      beats={p.beats}
      running={p.running}
      playMode={p.playMode}
      onSelectPad={p.onSelectPad}
      onMutate={p.onMutate}
    />
    {/* FL-style per-step pitch / velocity / pan for the selected channel. */}
    <StepGraphEditor
      doc={p.doc}
      pattern={p.pattern}
      padIdx={p.selectedPad}
      onMutate={p.onMutate}
    />
    {/* Step Effects — per-step FX slots + routing for the selected channel. */}
    <StepFxPanel
      doc={p.doc}
      pattern={p.pattern}
      padIdx={p.selectedPad}
      onMutate={p.onMutate}
    />
    <SequenceStrip
      doc={p.doc}
      activePattern={p.pattern}
      beats={p.beats}
      running={p.running}
      playMode={p.playMode}
      onMutate={p.onMutate}
    />
    {p.onAddInstrument && (
      <button
        onClick={p.onAddInstrument}
        className="self-start h-9 px-4 rounded-full text-[12px] font-semibold text-white flex items-center gap-2"
        style={{ background: 'linear-gradient(135deg, #6B0099, #B84DFF)' }}
      ><Plus size={15} /> Add instrument to this rack</button>
    )}
  </div>
);
