// The Machine view — the matte slab. Browser left, pads center with the step strip beneath
// (one gesture apart), macros right. QWERTY drumming: zxcv/asdf/qwer/1234 = pads bottom-to-top.

import React, { useEffect, useRef, useState } from 'react';
import type { GrooveDoc, Pattern, Scene } from '../../../../services/melos/beats/grooveDoc';
import { bankCount, addPadBank, BANK_LETTERS } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { Plus } from 'lucide-react';
import { SURFACE } from '../theme';
import { PadGrid } from './PadGrid';
import { StepStrip } from './StepStrip';
import { MacroKnobs } from './MacroKnobs';
import { BrowserRail } from './BrowserRail';
import { PitchRoll } from './PitchRoll';
import { ScenesBar } from './ScenesBar';
import type { MelosSampleRef } from '../melosSamples';

const KEY_ROWS = ['zxcv', 'asdf', 'qwer', '1234']; // row 0 = pads 0–3 (bottom)

interface MachineViewProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  frame: number;
  playMode: 'pattern' | 'song';
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onLoadSampleFile: (padIdx: number, file: File) => void;
  melosSamples?: MelosSampleRef[];
  onLoadMelosSample?: (padIdx: number, ref: MelosSampleRef) => void;
  onPickInstrumentForPad?: (padIdx: number) => void;
  onEditPadInstrument?: (padIdx: number) => void;
  /** Per-Group pattern choice (what pattern mode plays) + scene launch. */
  choice: Record<number, string | undefined>;
  onLaunchScene: (scene: Scene) => void;
  /** Record quantize for live pad recording (on = snap hits to the 16th). */
  recQuantize: boolean;
  onToggleRecQuantize: () => void;
}

// Note Repeat rates in beats per hit (triplets = 2/3 of the straight value).
const REPEAT_RATES = [
  { label: '1/4', beats: 1 }, { label: '1/8', beats: 0.5 }, { label: '1/8T', beats: 1 / 3 },
  { label: '1/16', beats: 0.25 }, { label: '1/16T', beats: 1 / 6 }, { label: '1/32', beats: 0.125 },
];
const REPEAT_SWINGS = [0, 0.25, 0.5, 0.66];

export const MachineView: React.FC<MachineViewProps> = (p) => {
  // Maschine performance modes: Note Repeat (hold a pad → retriggers at the rate) and
  // 16 Velocities (the grid plays the selected pad at sixteen levels).
  // Note Repeat lives in the ENGINE (scheduled on the audio clock, locked to the transport), so
  // pads, QWERTY, MIDI and the NI controller all repeat the same way; this is just its panel.
  const [noteRepeat, setNoteRepeat] = useState(() => BeatsEngine.get().noteRepeatState().on);
  const [repeatRate, setRepeatRate] = useState(3); // 1/16 — the Maschine default
  const [repeatSwing, setRepeatSwing] = useState(0);
  useEffect(() => {
    BeatsEngine.get().setNoteRepeat({ on: noteRepeat, rateBeats: REPEAT_RATES[repeatRate].beats, swing: REPEAT_SWINGS[repeatSwing] });
  }, [noteRepeat, repeatRate, repeatSwing]);
  const [vel16, setVel16] = useState(false);
  // Which Maschine "Group" (bank of 16) is showing. Follows the selected pad across banks.
  const banks = bankCount(p.doc.kit);
  const [bank, setBank] = useState(() => Math.floor(p.selectedPad / 16));
  const shownBank = Math.min(Math.max(0, bank), banks - 1); // clamp if a bank vanished
  const bankRef = useRef(shownBank); bankRef.current = shownBank;
  useEffect(() => { const b = Math.floor(p.selectedPad / 16); if (b !== bankRef.current) setBank(b); }, [p.selectedPad]);

  useEffect(() => {
    const padForKey = (k: string): number => {
      for (let row = 0; row < 4; row++) {
        const col = KEY_ROWS[row].indexOf(k);
        if (col >= 0) return row * 4 + col;
      }
      return -1;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      const local = padForKey(e.key.toLowerCase());
      if (local < 0) return;
      const padIdx = bankRef.current * 16 + local; // keys play the CURRENT Group
      const engine = BeatsEngine.get();
      void engine.init().then(() => engine.padDown(padIdx, 110));
      p.onSelectPad(padIdx);
    };
    // Key-up = note-off, so sustaining pads hold under a finger like real keys.
    const onKeyUp = (e: KeyboardEvent) => {
      const local = padForKey(e.key.toLowerCase());
      if (local >= 0) BeatsEngine.get().padUp(bankRef.current * 16 + local);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [p.onSelectPad]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '224px 1fr 216px', background: SURFACE }}>
      <div className="border-r border-white/[0.07] p-3.5 min-h-0" style={{ background: '#0C0C10' }}>
        <BrowserRail
          doc={p.doc}
          selectedPad={p.selectedPad}
          onSelectPad={p.onSelectPad}
          onMutate={p.onMutate}
          onLoadSampleFile={p.onLoadSampleFile}
          melosSamples={p.melosSamples}
          onLoadMelosSample={p.onLoadMelosSample}
          onPickInstrumentForPad={p.onPickInstrumentForPad}
          onEditPadInstrument={p.onEditPadInstrument}
        />
      </div>

      <div className="p-5 overflow-y-auto flex flex-col justify-center">
        <PitchRoll
          doc={p.doc}
          pattern={p.pattern}
          selectedPad={p.selectedPad}
          beats={p.beats}
          running={p.running}
          playMode={p.playMode}
          onMutate={p.onMutate}
        />
        <ScenesBar doc={p.doc} choice={p.choice} onLaunchScene={p.onLaunchScene} onMutate={p.onMutate} />
        {/* Group selector — Maschine banks of 16. Adding an instrument fills the next empty pad
            and spawns a new Group when one fills up. */}
        <div className="flex items-center justify-center gap-1.5 mb-2.5">
          <span className="text-[8px] uppercase tracking-[0.18em] text-white/25 font-semibold mr-1">Group</span>
          {Array.from({ length: banks }, (_, b) => (
            <button
              key={b}
              onClick={() => { setBank(b); p.onSelectPad(b * 16); }}
              className="w-7 h-7 rounded-lg text-[11px] font-bold border transition-colors"
              style={b === shownBank ? { color: '#fff', borderColor: '#D40055', background: 'rgba(212,0,85,0.14)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
              title={`Group ${BANK_LETTERS[b]}`}
            >{BANK_LETTERS[b]}</button>
          ))}
          <button
            onClick={() => { p.onMutate((d) => addPadBank(d.kit)); setBank(banks); p.onSelectPad(banks * 16); }}
            className="w-7 h-7 grid place-items-center rounded-lg border border-white/12 text-white/40 hover:text-white"
            title="Add a Group (16 more pads)"
          ><Plus size={13} /></button>

          <span className="w-px h-5 bg-white/10 mx-1.5" />

          {/* Note Repeat + 16 Velocities — the Maschine performance modes. */}
          <button
            onClick={() => setNoteRepeat((v) => !v)}
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border transition-colors"
            style={noteRepeat ? { color: '#FF8C00', borderColor: 'rgba(255,140,0,0.5)', background: 'rgba(255,140,0,0.1)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
            title="Note Repeat — hold a pad and it retriggers at the rate"
          >Repeat</button>
          {noteRepeat && REPEAT_RATES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRepeatRate(i)}
              className="h-7 px-1.5 rounded-lg text-[9px] font-mono border transition-colors"
              style={i === repeatRate ? { color: '#FF8C00', borderColor: 'rgba(255,140,0,0.5)' } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.1)' }}
            >{r.label}</button>
          ))}
          {noteRepeat && (
            <button
              onClick={() => setRepeatSwing((i) => (i + 1) % REPEAT_SWINGS.length)}
              className="h-7 px-1.5 rounded-lg text-[9px] font-mono border transition-colors"
              style={repeatSwing ? { color: '#FF8C00', borderColor: 'rgba(255,140,0,0.5)' } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.1)' }}
              title="Note Repeat swing — delays every other repeat"
            >sw {Math.round(REPEAT_SWINGS[repeatSwing] * 100)}%</button>
          )}
          <button
            onClick={() => setVel16((v) => !v)}
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border transition-colors"
            style={vel16 ? { color: '#00DAF3', borderColor: 'rgba(0,218,243,0.5)', background: 'rgba(0,218,243,0.1)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
            title="16 Velocities — the whole grid plays the selected pad, soft to full"
          >16 Vel</button>
          <button
            onClick={p.onToggleRecQuantize}
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border transition-colors"
            style={p.recQuantize ? { color: '#FF4D8C', borderColor: 'rgba(255,77,140,0.5)', background: 'rgba(255,77,140,0.1)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
            title={p.recQuantize ? 'Record quantize ON — recorded hits snap to the 16th' : 'Record quantize OFF — recorded hits keep your timing'}
          >Rec Q</button>
        </div>
        <PadGrid
          doc={p.doc}
          selectedPad={p.selectedPad}
          frame={p.frame}
          bank={shownBank}
          onSelectPad={p.onSelectPad}
          onDropSample={p.onLoadSampleFile}
          onAddToPad={p.onPickInstrumentForPad}
          onEditPadInstrument={p.onEditPadInstrument}
          onMutate={p.onMutate}
          melosSamples={p.melosSamples}
          velocity16={vel16}
        />
        <StepStrip
          doc={p.doc}
          pattern={p.pattern}
          selectedPad={p.selectedPad}
          beats={p.beats}
          running={p.running}
          playMode={p.playMode}
          onMutate={p.onMutate}
        />
        <p className="mt-3 text-center text-[9px] text-white/20">keys: z x c v · a s d f · q w e r · 1 2 3 4</p>
      </div>

      <div className="border-l border-white/[0.07] p-3.5 overflow-y-auto" style={{ background: '#0C0C10' }}>
        <MacroKnobs doc={p.doc} selectedPad={p.selectedPad} onMutate={p.onMutate} />
      </div>
    </div>
  );
};
