// The Machine view — the matte slab, laid out in Maschine's order: Browser left; then top to
// bottom scenes (Ideas), the control area (Master / Group / Sound pages + eight knobs, the same
// eight as the hardware), Group + pad modes, the pads, the step sequencer, and the piano roll
// under it. QWERTY drumming: zxcv/asdf/qwer/1234 = pads bottom-to-top.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GrooveDoc, Pattern, Scene } from '../../../../services/melos/beats/grooveDoc';
import { bankCount, addPadBank, BANK_LETTERS } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { Plus, Minus } from 'lucide-react';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';
import { clearPad } from '../../../../services/melos/beats/channelOps';
import { groupLabel, setGroupMeta, snapshotGroup } from '../../../../services/melos/beats/kits/applyKit';
import { saveUserKit } from '../../../../services/melos/beats/kits/kitLibrary';
import { docKey } from '../../../../services/melos/beats/songKey';
import { chordLabel, chordSemis, keyLabelFor, keySemi, type ChordKind, type PadMode } from '../../../../services/melos/beats/padModes';
import { SURFACE } from '../theme';
import { PadGrid } from './PadGrid';
import { StepStrip } from './StepStrip';
import { ControlArea } from './ControlArea';
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
  /** The instrument's own panel body, for the control area's inline plug-in view. */
  renderInstrument?: (trackId: string) => React.ReactNode;
}

// Note Repeat rates in beats per hit (triplets = 2/3 of the straight value).
const REPEAT_RATES = [
  { label: '1/4', beats: 1 }, { label: '1/8', beats: 0.5 }, { label: '1/8T', beats: 1 / 3 },
  { label: '1/16', beats: 0.25 }, { label: '1/16T', beats: 1 / 6 }, { label: '1/32', beats: 0.125 },
];
const REPEAT_SWINGS = [0, 0.25, 0.5, 0.66];
// Group slot tints (Maschine lets you colour each Group); default cycles by bank.
const GROUP_TINTS = ['#D40055', '#FF8C00', '#00DAF3', '#D0BCFF', '#6FE3A1', '#FFD166', '#FF6FB5', '#9B7BFF'];
const FIXED_VELS = [null, 127, 100, 80, 60] as const;
const PAD_MODES: { id: PadMode; label: string; title: string }[] = [
  { id: 'pads', label: 'Pads', title: 'Pad mode — every pad plays its own sound' },
  { id: 'keys', label: 'Keys', title: 'Keyboard — the grid plays the selected pad at 16 pitches' },
  { id: 'chords', label: 'Chords', title: 'Chords — each pad plays a chord of the song key on the selected sound' },
  { id: 'vel16', label: '16 Vel', title: '16 Velocities — the whole grid plays the selected pad, soft to full' },
];

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
  // Pad modes: Pads / Keyboard / Chords / 16 Velocities, plus Fixed Velocity and Mute/Solo taps.
  const [padMode, setPadMode] = useState<PadMode>('pads');
  const vel16 = padMode === 'vel16';
  const [scaleLock, setScaleLock] = useState(true);
  const [octave, setOctave] = useState(0);
  const [chordKind, setChordKind] = useState<ChordKind>('triad');
  const [fixedVelIdx, setFixedVelIdx] = useState(0);
  const [tapMode, setTapMode] = useState<'mute' | 'solo' | null>(null);
  const [railWide, setRailWide] = useState(false);
  // Which Maschine "Group" (bank of 16) is showing. Follows the selected pad across banks.
  const banks = bankCount(p.doc.kit);
  const [bank, setBank] = useState(() => Math.floor(p.selectedPad / 16));
  const shownBank = Math.min(Math.max(0, bank), banks - 1); // clamp if a bank vanished
  const bankRef = useRef(shownBank); bankRef.current = shownBank;
  useEffect(() => { const b = Math.floor(p.selectedPad / 16); if (b !== bankRef.current) setBank(b); }, [p.selectedPad]);

  const key = docKey(p.doc);
  const selPad = p.doc.kit[p.selectedPad];
  // An instrument pad has an absolute base note, so its keyboard lines up with the song key.
  const baseNote = selPad?.source === 'instrument' ? (selPad.instrumentNote ?? 60) + (selPad.pitchSemis || 0) : null;
  const pitched = useMemo(() => {
    if (padMode === 'keys') return {
      notes: (c: number) => [keySemi(c, { key, scaleLock, octave, baseNote })],
      label: (c: number) => keyLabelFor(keySemi(c, { key, scaleLock, octave, baseNote }), baseNote),
    };
    if (padMode === 'chords') return {
      notes: (c: number) => chordSemis(c, { key, kind: chordKind, octave, baseNote }),
      label: (c: number) => chordLabel(c, { key, kind: chordKind }),
    };
    return null;
  }, [padMode, key, scaleLock, octave, baseNote, chordKind]);
  const pitchedRef = useRef(pitched); pitchedRef.current = pitched;
  const selectedRef = useRef(p.selectedPad); selectedRef.current = p.selectedPad;
  const fixedVel = FIXED_VELS[fixedVelIdx];

  // Right-click a Group letter: rename, colour, save to the Library, clear.
  const groupMenu = useContextMenu<number>((b) => {
    const tintOf = p.doc.groupMeta?.[b]?.color || GROUP_TINTS[b % GROUP_TINTS.length];
    const items: MenuNode<number>[] = [
      { kind: 'header', label: groupLabel(p.doc, b), swatch: tintOf },
      { id: 'rename', label: 'Rename…', onSelect: () => { const n = window.prompt('Group name', groupLabel(p.doc, b))?.trim(); if (n) p.onMutate((d) => setGroupMeta(d, b, { name: n.slice(0, 28) })); } },
      { id: 'color', label: 'Colour', submenu: GROUP_TINTS.map((c, i) => ({ id: `c${i}`, label: <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{c}</span>, checked: tintOf === c, onSelect: () => p.onMutate((d) => setGroupMeta(d, b, { color: c })) })) },
      { id: 'save', label: 'Save Group to Library', onSelect: () => { void saveUserKit(snapshotGroup(p.doc, b, groupLabel(p.doc, b))).then(() => window.dispatchEvent(new Event('meka:user-kits'))); } },
    ];
    const src = p.doc.groupMeta?.[b]?.source;
    if (src) items.push({ kind: 'header', label: `From ${src.format}: ${src.kit}` });
    items.push({ kind: 'separator' }, { id: 'clear', label: 'Clear Group', danger: true, onSelect: () => { p.onMutate((d) => { for (let i = b * 16; i < b * 16 + 16 && i < d.kit.length; i++) clearPad(d, i); }); BeatsEngine.get().syncInstruments(); } });
    return items;
  });

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
      const engine = BeatsEngine.get();
      const pm = pitchedRef.current;
      if (pm) {
        // Keyboard / Chords: QWERTY plays the selected pad's pitches, same as the grid.
        const notes = pm.notes(local);
        const target = selectedRef.current;
        void engine.init().then(() => { for (const semi of notes) engine.padDownPitched(target, 110, semi, notes.length > 1); });
        return;
      }
      const padIdx = bankRef.current * 16 + local; // keys play the CURRENT Group
      void engine.init().then(() => engine.padDown(padIdx, 110));
      p.onSelectPad(padIdx);
    };
    // Key-up = note-off, so sustaining pads hold under a finger like real keys.
    const onKeyUp = (e: KeyboardEvent) => {
      const local = padForKey(e.key.toLowerCase());
      if (local < 0) return;
      const pm = pitchedRef.current;
      // Keys/Chords: release only this key's notes, so a held chord across keys keeps sounding.
      if (pm) { for (const semi of pm.notes(local)) BeatsEngine.get().padNoteUp(selectedRef.current, semi); return; }
      BeatsEngine.get().padUp(bankRef.current * 16 + local);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [p.onSelectPad]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: `${railWide ? 320 : 224}px 1fr`, background: SURFACE }}>
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
          bank={shownBank}
          onWideChange={setRailWide}
        />
      </div>

      <div className="p-5 overflow-y-auto flex flex-col">
        <ScenesBar doc={p.doc} choice={p.choice} onLaunchScene={p.onLaunchScene} onMutate={p.onMutate} />
        <ControlArea
          doc={p.doc}
          selectedPad={p.selectedPad}
          groupTint={p.doc.groupMeta?.[shownBank]?.color || GROUP_TINTS[shownBank % GROUP_TINTS.length]}
          onMutate={p.onMutate}
          onLoadSampleFile={p.onLoadSampleFile}
          onPickInstrumentForPad={p.onPickInstrumentForPad}
          onEditPadInstrument={p.onEditPadInstrument}
          renderInstrument={p.renderInstrument}
          patternId={p.pattern.id}
          onSelectPad={p.onSelectPad}
        />
        {/* Group selector — Maschine banks of 16. Adding an instrument fills the next empty pad
            and spawns a new Group when one fills up. */}
        <div className="flex items-center justify-center gap-1.5 mb-2.5">
          <span className="text-[8px] uppercase tracking-[0.18em] text-white/25 font-semibold mr-1">Group</span>
          {groupMenu.node}
          {Array.from({ length: banks }, (_, b) => {
            const tint = p.doc.groupMeta?.[b]?.color || GROUP_TINTS[b % GROUP_TINTS.length];
            const named = p.doc.groupMeta?.[b]?.name;
            return (
              <button
                key={b}
                onClick={() => { setBank(b); p.onSelectPad(b * 16); }}
                {...groupMenu.bind(b)}
                className="h-7 min-w-7 px-1.5 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 max-w-[110px]"
                style={b === shownBank ? { color: '#fff', borderColor: tint, background: `${tint}24` } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
                title={`${groupLabel(p.doc, b)} — right-click to rename, colour, save or clear`}
              >
                <span style={{ color: b === shownBank ? tint : undefined }}>{BANK_LETTERS[b]}</span>
                {named && b === shownBank && <span className="text-[9.5px] font-medium truncate">{named}</span>}
              </button>
            );
          })}
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
            onClick={p.onToggleRecQuantize}
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border transition-colors"
            style={p.recQuantize ? { color: '#FF4D8C', borderColor: 'rgba(255,77,140,0.5)', background: 'rgba(255,77,140,0.1)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
            title={p.recQuantize ? 'Record quantize ON — recorded hits snap to the 16th' : 'Record quantize OFF — recorded hits keep your timing'}
          >Rec Q</button>
        </div>
        {/* Pad modes (Maschine PAD MODE / KEYBOARD / CHORDS / 16 VEL) + FIXED VEL + MUTE / SOLO. */}
        <div className="flex items-center justify-center gap-1 mb-2.5 flex-wrap">
          <span className="text-[8px] uppercase tracking-[0.18em] text-white/25 font-semibold mr-1">Pads</span>
          <div className="flex gap-0.5 bg-white/[0.05] border border-white/10 rounded-lg p-0.5">
            {PAD_MODES.map((m) => (
              <button key={m.id} onClick={() => { setPadMode(m.id); setTapMode(null); }} title={m.title}
                className="h-6 px-2 rounded-md text-[9px] uppercase tracking-wide"
                style={padMode === m.id ? { color: '#fff', background: 'rgba(0,218,243,0.18)' } : { color: 'rgba(255,255,255,0.4)' }}
              >{m.label}</button>
            ))}
          </div>
          {padMode === 'keys' && (
            <button onClick={() => setScaleLock((v) => !v)} title={key ? 'Lock the keyboard to the song key' : 'Lock to a scale (set the song key to choose which)'}
              className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border"
              style={scaleLock ? { color: '#00DAF3', borderColor: 'rgba(0,218,243,0.5)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
            >{scaleLock ? 'Scale' : 'Chromatic'}</button>
          )}
          {padMode === 'chords' && (
            <button onClick={() => setChordKind((k) => (k === 'triad' ? 'seventh' : 'triad'))} title="Triads or sevenths"
              className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border border-white/12 text-white/60"
            >{chordKind === 'triad' ? 'Triads' : '7ths'}</button>
          )}
          {(padMode === 'keys' || padMode === 'chords') && (
            <span className="flex items-center gap-0.5">
              <button aria-label="Octave down" onClick={() => setOctave((o) => Math.max(-2, o - 1))} className="w-6 h-7 grid place-items-center rounded-lg border border-white/12 text-white/50 hover:text-white"><Minus size={10} /></button>
              <span className="w-9 text-center text-[9px] font-mono text-white/60">oct {octave > 0 ? `+${octave}` : octave}</span>
              <button aria-label="Octave up" onClick={() => setOctave((o) => Math.min(2, o + 1))} className="w-6 h-7 grid place-items-center rounded-lg border border-white/12 text-white/50 hover:text-white"><Plus size={10} /></button>
            </span>
          )}
          <span className="w-px h-5 bg-white/10 mx-1" />
          <button onClick={() => setFixedVelIdx((i) => (i + 1) % FIXED_VELS.length)} title="Fixed Velocity — every hit at one level (click to cycle)"
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border"
            style={fixedVel ? { color: '#FFD166', borderColor: 'rgba(255,209,102,0.5)', background: 'rgba(255,209,102,0.08)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
          >{fixedVel ? `Fixed ${fixedVel}` : 'Fixed Vel'}</button>
          <button onClick={() => setTapMode((t) => (t === 'mute' ? null : 'mute'))} title="Mute — tap pads to mute / unmute them"
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border"
            style={tapMode === 'mute' ? { color: '#FF4D6D', borderColor: 'rgba(255,77,109,0.6)', background: 'rgba(255,77,109,0.12)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
          >Mute</button>
          <button onClick={() => setTapMode((t) => (t === 'solo' ? null : 'solo'))} title="Solo — tap pads to solo them"
            className="h-7 px-2 rounded-lg text-[9px] uppercase tracking-wide border"
            style={tapMode === 'solo' ? { color: '#FFD166', borderColor: 'rgba(255,209,102,0.6)', background: 'rgba(255,209,102,0.12)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
          >Solo</button>
          {p.doc.kit.some((k) => k.mute || k.solo) && (
            <button onClick={() => p.onMutate((d) => { for (const k of d.kit) { k.mute = false; k.solo = false; } })} title="Clear every mute and solo"
              className="h-7 px-1.5 rounded-lg text-[9px] text-white/35 hover:text-white underline decoration-dotted">clear</button>
          )}
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
          pitched={pitched}
          fixedVel={fixedVel}
          tapMode={tapMode}
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
        {/* Piano roll under the step sequencer — Maschine's pattern editor sits below the pads. */}
        <div className="mt-3">
          <PitchRoll
            doc={p.doc}
            pattern={p.pattern}
            selectedPad={p.selectedPad}
            beats={p.beats}
            running={p.running}
            playMode={p.playMode}
            onMutate={p.onMutate}
          />
        </div>
        <p className="mt-3 text-center text-[9px] text-white/20">
          keys: z x c v · a s d f · q w e r · 1 2 3 4{pitched ? ` — playing ${selPad?.name ?? 'the selected pad'}` : ''}
        </p>
      </div>

    </div>
  );
};
