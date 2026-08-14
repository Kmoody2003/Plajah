// The Glass view — the Plajah-native face: channel rack above, Sequence strip below, both as
// glass panels over the purple wash (the frame behind them is BeatsRoom's wash background).
// Same document, same engine as Machine — switching views mid-playback touches no audio.

import React from 'react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { ChannelRack } from './ChannelRack';
import { SequenceStrip } from './SequenceStrip';

interface GlassViewProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
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
    <SequenceStrip
      doc={p.doc}
      activePattern={p.pattern}
      beats={p.beats}
      running={p.running}
      playMode={p.playMode}
      onMutate={p.onMutate}
    />
  </div>
);
