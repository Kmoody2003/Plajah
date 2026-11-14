// The harmony bar: project key from the whole scale library, auto-chord, and what could come next.
// Sits in the piano roll and the pitch roll; `onInsert` is where a clicked chord lands in each.

import React, { useEffect, useState } from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { NOTE_NAMES_SHARP, SCALES, SCALE_FAMILIES, scaleById, scaleFamily } from '../../../../services/melos/theory';
import { docKey } from '../../../../services/melos/beats/songKey';
import { CHORD_VOICINGS, defaultChordAssist, suggestNextChords, type ChordAssist, type ChordSuggestion, type ChordVoicing, type PlayedChord } from '../../../../services/melos/beats/chordAssist';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';

interface Props {
  doc: GrooveDoc;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Chords already written before the insert point. */
  history: PlayedChord[];
  onInsert: (s: ChordSuggestion) => void;
  /** Sound it (hover/click preview). */
  onAudition?: (s: ChordSuggestion) => void;
}

const selectCls = 'h-6 rounded-md bg-black/40 border border-white/10 px-1 text-[10px] text-white/80 outline-none';
const KIND_COLOR: Record<ChordSuggestion['kind'], string> = { 'in-key': '#00DAF3', progression: '#D0BCFF', colour: '#FF8C00' };

/** Grouped scale picker, shared with anything else that sets the key. */
export const ScalePicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Scale" title={scaleById(value).character} className={`${selectCls} max-w-[150px]`}>
    {SCALE_FAMILIES.map((f) => (
      <optgroup key={f.id} label={f.name}>
        {SCALES.filter((s) => scaleFamily(s) === f.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </optgroup>
    ))}
  </select>
);

export const ChordAssistBar: React.FC<Props> = ({ doc, onMutate, history, onInsert, onAudition }) => {
  const key = docKey(doc);
  const assist: ChordAssist = { ...defaultChordAssist(), ...doc.chordAssist };
  const setAssist = (fn: (a: ChordAssist) => void) => onMutate((d) => {
    const next: ChordAssist = { ...defaultChordAssist(), ...d.chordAssist };
    fn(next);
    d.chordAssist = next;
  });

  // What's been played counts too, when it's newer than what's drawn.
  const [played, setPlayed] = useState<PlayedChord[]>([]);
  useEffect(() => {
    const t = setInterval(() => {
      const list = BeatsEngine.get().playedChords();
      setPlayed((p) => (p.length === list.length && p[p.length - 1] === list[list.length - 1] ? p : [...list]));
    }, 400);
    return () => clearInterval(t);
  }, []);
  const context = played.length ? [...history, ...played.slice(-3)] : history;
  const suggestions = key ? suggestNextChords(key, context, { tones: Math.min(assist.tones, 4), limit: 6 }) : [];

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-2 py-1 border-b border-white/10 bg-black/20" data-testid="chord-assist-bar">
      <label className="flex items-center gap-1 text-[9.5px] text-white/40">Key
        <select aria-label="Key tonic" value={key?.tonic ?? ''} onChange={(e) => onMutate((d) => {
          const tonic = Number(e.target.value);
          d.key = { tonic, scale: d.key?.scale ?? 'major' };
        })} className={selectCls}>
          {!key && <option value="">–</option>}
          {NOTE_NAMES_SHARP.map((n, pc) => <option key={n} value={pc}>{n}</option>)}
        </select>
      </label>
      <ScalePicker value={key?.scale ?? 'major'} onChange={(scale) => onMutate((d) => { d.key = { tonic: d.key?.tonic ?? 0, scale }; })} />

      <span className="w-px h-4 bg-white/10 mx-0.5" />
      <button onClick={() => setAssist((a) => { a.on = !a.on; })} aria-pressed={assist.on}
        title="One note plays a whole chord in the key: when drawing, on keys and pads, in the sequencer"
        className="h-6 px-2 rounded-md text-[10px] font-semibold border whitespace-nowrap"
        style={assist.on ? { borderColor: '#D0BCFF', color: '#D0BCFF', background: 'rgba(208,188,255,0.14)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>Auto-chord</button>
      {assist.on && (
        <>
          <select aria-label="Chord size" value={assist.tones} onChange={(e) => setAssist((a) => { a.tones = Number(e.target.value); })} className={selectCls}>
            {[[2, 'Dyad'], [3, 'Triad'], [4, '7th'], [5, '9th'], [6, '11th'], [7, '13th']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Voicing" value={assist.voicing} onChange={(e) => setAssist((a) => { a.voicing = e.target.value as ChordVoicing; })} title={CHORD_VOICINGS.find((v) => v.id === assist.voicing)?.hint} className={selectCls}>
            {CHORD_VOICINGS.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select aria-label="Inversion" value={assist.inversion} onChange={(e) => setAssist((a) => { a.inversion = Number(e.target.value); })} className={selectCls}>
            {['Root', '1st inv', '2nd inv', '3rd inv'].map((l, i) => <option key={l} value={i}>{l}</option>)}
          </select>
        </>
      )}

      <span className="w-px h-4 bg-white/10 mx-0.5" />
      {key ? (
        <>
          <span className="text-[9.5px] text-white/35 whitespace-nowrap">Next</span>
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => { BeatsEngine.get().clearPlayedChords(); onInsert(s); onAudition?.(s); }} title={s.why} data-testid="chord-suggestion"
              className="h-6 px-1.5 rounded-md border text-[10px] whitespace-nowrap flex items-center gap-1 hover:bg-white/10"
              style={{ borderColor: `${KIND_COLOR[s.kind]}55`, color: KIND_COLOR[s.kind] }}>
              <span className="font-semibold">{s.symbol}</span><span className="opacity-60 text-[9px]">{s.roman}</span>
            </button>
          ))}
        </>
      ) : <span className="text-[9.5px] text-white/30">Set a key to get next-chord ideas</span>}
    </div>
  );
};
