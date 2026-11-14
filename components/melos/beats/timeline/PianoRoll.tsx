// The piano roll — the instrument-track note, MPE and CC editor.
//
// One note list, two editors: this and the step grid render the SAME `clip.notes`, so switching
// between them is a view change, never a conversion. Notes live in CLIP-CONTENT beats: the clip
// is a window onto them (slip offset + optional loop, clipContent.ts), so the roll shows the whole
// content, dims what the window doesn't play, and lets you drag the loop brace and the window
// start on the strip above the grid.
//
// Editing (Bitwig / Studio One grammar): double-click = add · drag empty grid = marquee ·
// click/Shift/Ctrl-click = select / extend / toggle · drag notes = move all selected (grid snap,
// Shift = free) · right edge = resize all selected · ↑↓ transpose (Shift = octave) · ←→ nudge ·
// Ctrl+C/X/V/D copy/cut/paste/duplicate · Ctrl+A all · Delete · Q quantize (when no track is armed).
//
// Orchestral MPE (per-note pressure / timbre / bend / vibrato, articulations, swell shapes) and the
// clip's MIDI CC lanes (mod wheel, expression, sustain, pitch bend) share the bottom drawer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, FileMusic, Grid3x3, Music4, Repeat, Sparkles, Sliders, Trash2, Wand2 } from 'lucide-react';
import type {
  AutomationPoint,
  AutomationTarget,
  GrooveDoc,
  MpeSwellShape,
  NoteEvent,
  OrchestralArticulation,
  TimelineClip,
} from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { songTime } from '../../../../services/melos/beats/tempoMap';
import { gridCellBeats, snapBeat, type GridDiv, type GridSettings } from '../../../../services/melos/beats/snapGrid';
import { docKey, keyLabel, keyPitchClasses } from '../../../../services/melos/beats/songKey';
import { assistKeys, chordHistory, suggestionKeys, type ChordSuggestion } from '../../../../services/melos/beats/chordAssist';
import { ChordAssistBar } from '../assist/ChordAssistBar';
import { NoteFxRack } from '../assist/NoteFxRack';
import { clipLoop, contentExtent, contentPosAt, contentWindows } from '../../../../services/melos/beats/clipContent';
import { setClipLoop } from '../../../../services/melos/beats/clipEdit';
import { MIDI_LANE_TARGETS, targetKey, targetSpec } from '../../../../services/melos/beats/automation';
import {
  copyNotes, fitNotesToScale, lockPitch, notesInRect, pasteNotes, quantizeNotes, transposeNotes, type NoteClipboard,
} from '../../../../services/melos/beats/noteEdit';
import { useContextMenu } from '../../../ui/ContextMenu';
import { guessPartRole, performClipNotes, personaFor, playerForPart } from '../../../../services/melos/beats/patterns/performNotes';
import { BAND } from '../../../../services/melos/beats/band/roster';
import { AutomationLaneEditor } from './AutomationLaneEditor';
import { ScoreView, scoreHeight, type ScoreHit } from './ScoreView';
import { buildScore, keyAlters, midiFromStep, spell, TPB } from '../../../../services/melos/beats/notation/scoreModel';
import { downloadMusicXml, exportMusicXml } from '../../../../services/melos/beats/notation/musicXml';
import { flattenClipNotes } from '../../../../services/melos/beats/clipEdit';
import { PLAYHEAD, SELECT } from '../theme';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const ROW_H = 15;
const KEY_W = 46;
const STRIP_H = 16;
const LOW = 24;  // C1
const HIGH = 96; // C7
const ROWS = HIGH - LOW + 1;

// The roll's snap menu → the shared grid model (fixed division, optional triplet, or off).
const SNAP_OPTIONS: { id: string; label: string; div: GridDiv; triplet: boolean; off?: boolean }[] = [
  { id: 'bar', label: 'Bar', div: 'bar', triplet: false },
  { id: '1/4', label: '1/4', div: '1/4', triplet: false },
  { id: '1/8', label: '1/8', div: '1/8', triplet: false },
  { id: '1/16', label: '1/16', div: '1/16', triplet: false },
  { id: '1/32', label: '1/32', div: '1/32', triplet: false },
  { id: '1/4T', label: '1/4 T', div: '1/4', triplet: true },
  { id: '1/8T', label: '1/8 T', div: '1/8', triplet: true },
  { id: '1/16T', label: '1/16 T', div: '1/16', triplet: true },
  { id: 'off', label: 'off (Rubato)', div: '1/16', triplet: false, off: true },
];
const snapGridOf = (id: string): GridSettings => {
  const o = SNAP_OPTIONS.find((x) => x.id === id) || SNAP_OPTIONS[3];
  return { mode: o.off ? 'off' : 'fixed', div: o.div, triplet: o.triplet };
};

const noteName = (k: number) => `${NOTE_NAMES[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}`;

type EditMode = 'roll' | 'score' | 'split' | 'steps';
const SCORE_STEP_PX = 4;                 // one staff step (half a line gap) in the Score lens
const STEPS7 = 'CDEFGAB';
// Note values for the Score palette (ticks at 12 per beat): whole … 16th, MuseScore's 7…3 keys.
const NOTE_VALUES: { t: number; label: string; key: string }[] = [
  { t: 48, label: '1/1', key: '7' }, { t: 24, label: '1/2', key: '6' }, { t: 12, label: '♩', key: '5' },
  { t: 6, label: '♪', key: '4' }, { t: 3, label: '♬', key: '3' },
];
type MpeLaneKind = 'velocity' | 'pressure' | 'timbre' | 'bend' | 'vibrato';
type DrawerLane = MpeLaneKind | `cc:${'mod-wheel' | 'expression' | 'sustain' | 'pitch-bend'}`;

const ARTICULATION_SPECS: Array<{ id: OrchestralArticulation; label: string; short: string; color: string }> = [
  { id: 'legato', label: 'Legato Cantabile', short: 'LEG', color: '#38BDF8' },
  { id: 'spiccato', label: 'Spiccato Short Bow', short: 'SPIC', color: '#FBBF24' },
  { id: 'marcato', label: 'Marcato Accent', short: 'MARC', color: '#F87171' },
  { id: 'tremolo', label: 'Bow Tremolo (11.5 Hz)', short: 'TREM', color: '#A78BFA' },
  { id: 'pizzicato', label: 'Pizzicato Pluck', short: 'PIZZ', color: '#34D399' },
  { id: 'sfz-hairpin', label: 'Sforzando Hairpin (< >)', short: 'SFZ', color: '#FB923C' },
  { id: 'portamento', label: 'Portamento Glide', short: 'PORT', color: '#F472B6' },
  { id: 'con-sordino', label: 'Con Sordino (Muted)', short: 'SORD', color: '#94A3B8' },
  { id: 'sul-ponticello', label: 'Sul Ponticello (Glassy)', short: 'PONT', color: '#2DD4BF' },
];

const SWELL_SHAPES: Array<{ id: MpeSwellShape; label: string }> = [
  { id: 'hairpin', label: '⟨ ⟩ Hairpin Swell' },
  { id: 'crescendo', label: '⟨ Crescendo' },
  { id: 'decrescendo', label: '⟩ Decrescendo' },
  { id: 'sfz-swell', label: 'SFZ + Swell' },
  { id: 'arch', label: '⌒ Phrase Arch' },
  { id: 'sustained', label: '— Sustained' },
];

const MPE_LANES: { id: MpeLaneKind; label: string; color: string }[] = [
  { id: 'pressure', label: 'MPE Pressure', color: '#38BDF8' },
  { id: 'velocity', label: 'Velocity', color: '#F43F5E' },
  { id: 'timbre', label: 'MPE Timbre', color: '#A78BFA' },
  { id: 'vibrato', label: 'Vibrato', color: '#34D399' },
  { id: 'bend', label: 'MPE Bend', color: '#FBBF24' },
];

// The note clipboard outlives a single roll window (copy here, open another clip, paste).
let noteClipboard: NoteClipboard | null = null;

interface PianoRollProps {
  doc: GrooveDoc;
  trackId: string;
  clip: TimelineClip;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const PianoRoll: React.FC<PianoRollProps> = ({ doc, trackId, clip, beats, running, playMode, onMutate, onClose }) => {
  const [mode, setMode] = useState<EditMode>('roll');
  const [pxPerBeat, setPxPerBeat] = useState(64);
  const [snapId, setSnapId] = useState('1/16');
  const snapGrid = snapGridOf(snapId);
  const { meter } = songTime(doc);
  const offset = clip.contentOffsetBeats ?? 0;
  // Content beat ↔ song beat for grid purposes (the window's start aligns content to the song).
  const toSong = (c: number) => clip.startBeats + (c - offset);
  /** Snap a content beat to the SONG's grid (bars from the meter map). Shift = free. */
  const snapRel = (c: number, e?: { shiftKey?: boolean }) =>
    snapBeat(toSong(c), snapGrid, meter, pxPerBeat, { bypass: !!e?.shiftKey }) - toSong(0);
  const cellAt = (c: number) => gridCellBeats(toSong(c), snapGrid.mode === 'off' ? { mode: 'fixed', div: '1/16', triplet: false } : snapGrid, meter, pxPerBeat);
  const songKey = docKey(doc);
  const inKey = songKey ? keyPitchClasses(songKey) : null;
  const [scaleLock, setScaleLock] = useState(() => localStorage.getItem('melos:roll:scaleLock') === '1');
  const lock = scaleLock ? songKey : null;
  const [sel, setSel] = useState<string[]>([]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const selected = sel.length ? sel[sel.length - 1] : null;
  const [lastLen, setLastLen] = useState(0.5);
  const [defaultArticulation, setDefaultArticulation] = useState<OrchestralArticulation>('legato');
  const [defaultSwell, setDefaultSwell] = useState<MpeSwellShape>('hairpin');
  const [drawerLane, setDrawerLane] = useState<DrawerLane>('pressure');
  const [showExprDrawer, setShowExprDrawer] = useState(true);
  const [q, setQ] = useState(() => {
    try { return { strength: 1, swing: 0, ends: false, ...JSON.parse(localStorage.getItem('melos:roll:quantize') || '{}') }; } catch { return { strength: 1, swing: 0, ends: false }; }
  });
  const setQuant = (next: typeof q) => { setQ(next); try { localStorage.setItem('melos:roll:quantize', JSON.stringify(next)); } catch { /* */ } };
  const [marquee, setMarquee] = useState<{ b0: number; b1: number; k0: number; k1: number } | null>(null);

  const drag = useRef<{
    ids: string[]; primary: string; mode: 'move' | 'len'; x: number; y: number;
    orig: Map<string, { start: number; len: number; key: number }>; moved: boolean;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const track = doc.arrangement.find((t) => t.id === trackId);
  const notes = clip.notes || [];
  const selectedNote = useMemo(() => notes.find((n) => n.id === selected) || null, [notes, selected]);
  const extent = contentExtent(clip);
  const width = Math.max(640, (extent + 1) * pxPerBeat);
  const loop = clipLoop(clip);

  // Content that doesn't play through the window is dimmed.
  const played = contentWindows(clip).map((w) => [w.contentStart, w.contentEnd] as const);
  const dimmed = useMemo(() => {
    const spans = played.slice().sort((a, b) => a[0] - b[0]);
    const out: { from: number; to: number }[] = [];
    let at = 0;
    for (const [a, b] of spans) { if (a > at + 1e-6) out.push({ from: at, to: a }); at = Math.max(at, b); }
    if (at < extent + 1) out.push({ from: at, to: extent + 1 });
    return out;
  }, [JSON.stringify(played), extent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Score lens: the same notes engraved (scoreModel), edited in place ─────────
  const scoreOn = mode === 'score' || mode === 'split';
  const score = useMemo(
    () => (scoreOn ? buildScore(notes, { meter, songOffset: clip.startBeats - offset, fromContent: 0, toContent: extent + 1, key: songKey }) : null),
    [scoreOn, notes, meter, clip.startBeats, offset, extent, songKey?.tonic, songKey?.scale], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [durTicks, setDurTicks] = useState(12);
  const [durDot, setDurDot] = useState(false);
  const [durTriplet, setDurTriplet] = useState(false);
  const [noteInput, setNoteInput] = useState(false);
  const [inputCursor, setInputCursor] = useState(0);
  const lastInputKey = useRef(60);
  const durBeats = (durTicks / TPB) * (durDot ? 1.5 : 1) * (durTriplet ? 2 / 3 : 1);
  const keyAlt = keyAlters(score?.fifths ?? 0);
  /** A staff position → sounding pitch in the key (Shift = sharp, Alt = flat). */
  const pitchAt = (di: number, e: { shiftKey?: boolean; altKey?: boolean }) => {
    const step = STEPS7[((di % 7) + 7) % 7];
    return Math.max(0, Math.min(127, midiFromStep(step, Math.floor(di / 7), keyAlt[step] + (e.shiftKey ? 1 : 0) - (e.altKey ? 1 : 0))));
  };
  /** Pick a note value; with notes selected (outside note input) they take it too. */
  const setDuration = (ticks?: number, dot?: boolean, trip?: boolean) => {
    const t = ticks ?? durTicks, d = dot ?? durDot, tr = trip ?? durTriplet;
    setDurTicks(t); setDurDot(d); setDurTriplet(tr);
    const len = (t / TPB) * (d ? 1.5 : 1) * (tr ? 2 / 3 : 1);
    setLastLen(len);
    if (selSet.size && !noteInput) editNotes((list) => { for (const n of list) if (selSet.has(n.id)) n.lengthBeats = len; });
  };

  // Centre on the notes (or middle C) the first time this clip opens.
  const centred = useRef<string | null>(null);
  useEffect(() => {
    if (centred.current === clip.id || !scrollRef.current) return;
    centred.current = clip.id;
    const avg = notes.length ? notes.reduce((a, n) => a + n.key, 0) / notes.length : 60;
    scrollRef.current.scrollTop = Math.max(0, (HIGH - avg - 6) * ROW_H);
    scrollRef.current.scrollLeft = Math.max(0, offset * pxPerBeat - 40);
  }, [clip.id, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const editClip = useCallback((fn: (c: TimelineClip) => void) => {
    onMutate((d) => {
      const c = d.arrangement.find((x) => x.id === trackId)?.clips.find((x) => x.id === clip.id);
      if (c) fn(c);
    });
  }, [onMutate, trackId, clip.id]);
  const editNotes = useCallback((fn: (list: NoteEvent[]) => void) => {
    editClip((c) => { if (!c.notes) c.notes = []; fn(c.notes); });
  }, [editClip]);

  const audition = useCallback((key: number, vel = 100) => {
    if (!track) return;
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then(() => {
      engine.instrumentNoteOn(track, key, vel);
      setTimeout(() => engine.instrumentNoteOff(track, key), 250);
    });
  }, [track]);

  const [fxOpen, setFxOpen] = useState(false);
  // Next chord lands after whatever's written, on the grid, as long as the chord before it.
  const lastChord = useMemo(() => {
    if (!notes.length) return { at: 0, len: 4, around: 60 };
    const end = Math.max(...notes.map((n) => n.startBeats + n.lengthBeats));
    const lastStart = Math.max(...notes.map((n) => n.startBeats));
    const group = notes.filter((n) => Math.abs(n.startBeats - lastStart) < 1e-6);
    return { at: end, len: Math.max(0.25, Math.max(...group.map((n) => n.lengthBeats))), around: Math.round(group.reduce((a, n) => a + n.key, 0) / group.length) };
  }, [notes]);
  const insertChord = (s: ChordSuggestion) => {
    const keys = suggestionKeys(s, lastChord.around, doc.chordAssist);
    editNotes((list) => {
      for (const key of keys) list.push({ id: grooveUid(), startBeats: lastChord.at, lengthBeats: lastChord.len, key: Math.max(LOW, Math.min(HIGH, key)), vel: 100, articulation: defaultArticulation });
    });
    if (track) {
      const engine = BeatsEngine.get();
      void engine.ensureInstrument(track).then(() => {
        const inst = engine.getInstrument(track.id);
        const ctx = engine.getContext();
        if (!inst || !ctx) return;
        for (const key of keys) {
          const id = inst.noteOn(key, 0.75, ctx.currentTime, ctx.currentTime, ctx.sampleRate);
          setTimeout(() => inst.noteOff(id, true), 450);
        }
      });
    }
  };

  const addNote = (rawKey: number, startBeats: number, free = false, len?: number) => {
    // Auto-chord: the note drawn is the root of a chord in the key, written as real notes.
    const keys = assistKeys(doc, lockPitch(rawKey, lock));
    if (keys.length > 1) {
      const start = Math.max(0, free ? startBeats : snapRel(startBeats));
      editNotes((list) => {
        for (const k of keys) list.push({ id: grooveUid(), startBeats: start, lengthBeats: len ?? lastLen, key: Math.max(LOW, Math.min(HIGH, k)), vel: 100, articulation: defaultArticulation });
      });
      for (const k of keys) audition(k);
      return;
    }
    const key = lockPitch(rawKey, lock);
    const snapped = Math.max(0, free ? startBeats : snapRel(startBeats));
    const id = grooveUid();
    editNotes((list) => {
      list.push({
        id,
        startBeats: snapped,
        lengthBeats: len ?? lastLen,
        key,
        vel: 100,
        articulation: defaultArticulation,
        expr: {
          pressure: 0.82,
          timbre: defaultArticulation === 'sul-ponticello' ? 0.88 : defaultArticulation === 'con-sordino' ? 0.35 : 0.68,
          bend: 0,
          swellShape: defaultSwell,
          vibratoDepth: lastLen >= 1.0 ? 0.18 : 0.06,
          vibratoRateHz: 5.4,
        },
      });
    });
    setSel([id]);
    audition(key);
  };

  const removeNotes = useCallback((ids: Set<string>) => {
    if (!ids.size) return;
    editNotes((list) => { for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) list.splice(i, 1); });
    setSel((s) => s.filter((x) => !ids.has(x)));
  }, [editNotes]);

  /** The notes an action applies to: the selection, or every note when nothing is selected. */
  const targetsOf = (list: NoteEvent[]) => (selSet.size ? list.filter((n) => selSet.has(n.id)) : list);

  const quantize = useCallback(() => {
    editNotes((list) => quantizeNotes(list, selSet, {
      snap: (b) => snapRel(b), cell: cellAt, strength: q.strength, swing: q.swing, ends: q.ends,
      phase: (b) => meter.at(toSong(b)).startBeat - toSong(0),
    }));
  }, [editNotes, selSet, q, snapId, pxPerBeat, meter, clip.startBeats, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  const transpose = useCallback((semis: number) => {
    editNotes((list) => transposeNotes(list, selSet, semis));
  }, [editNotes, selSet]);

  // ── keyboard: capture phase so ↑↓ beat the QWERTY keyboard's octave shift while notes are selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && typeof el.matches === 'function' && el.matches('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const cursorContent = () => {
        if (running && playMode === 'song') { const c = contentPosAt(clip, beats); if (c !== null) return c; }
        return null;
      };
      // Score lens: note values, note input (A–G at the caret, 0 = rest), N toggles input.
      if (scoreOn && !mod) {
        const dur = NOTE_VALUES.find((v) => v.key === e.key);
        if (dur) { setDuration(dur.t); done(); return; }
        if (e.key === '.') { setDuration(undefined, !durDot); done(); return; }
        if (k === 'n') {
          setNoteInput((v) => {
            if (!v) {
              const end = notes.length ? Math.max(...notes.map((x) => x.startBeats + x.lengthBeats)) : offset;
              setInputCursor(snapRel(cursorContent() ?? (selSet.size ? Math.max(...notes.filter((x) => selSet.has(x.id)).map((x) => x.startBeats + x.lengthBeats)) : end)));
            }
            return !v;
          });
          done(); return;
        }
        if (noteInput && e.key === 'Escape') { setNoteInput(false); done(); return; }
        if (noteInput && /^[a-g]$/.test(k)) {
          const step = k.toUpperCase();
          const alter = keyAlt[step] + (e.shiftKey ? 1 : 0) - (e.altKey ? 1 : 0);
          // The octave closest to the previous note — melodies move by small steps.
          let best = 60, bestD = Infinity;
          for (let oct = 1; oct <= 7; oct++) {
            const m = midiFromStep(step, oct, alter);
            const dd = Math.abs(m - lastInputKey.current);
            if (dd < bestD) { bestD = dd; best = m; }
          }
          lastInputKey.current = best;
          const id = grooveUid();
          const at = inputCursor;
          editNotes((list) => { list.push({ id, startBeats: at, lengthBeats: durBeats, key: best, vel: 100, articulation: defaultArticulation }); });
          setSel([id]);
          setInputCursor(at + durBeats);
          audition(best);
          done(); return;
        }
        if (noteInput && e.key === '0') { setInputCursor((c) => c + durBeats); done(); return; }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.size) { removeNotes(selSet); done(); return; }
      if (e.key === 'Escape' && selSet.size) { setSel([]); done(); return; }
      if (mod && k === 'a') { setSel(notes.map((n) => n.id)); done(); return; }
      if (mod && (k === 'c' || k === 'x') && selSet.size) {
        noteClipboard = copyNotes(notes, selSet);
        if (k === 'x') removeNotes(selSet);
        done(); return;
      }
      if (mod && k === 'v' && noteClipboard) {
        const cb = noteClipboard;
        const selEnd = selSet.size ? Math.max(...notes.filter((n) => selSet.has(n.id)).map((n) => n.startBeats + n.lengthBeats)) : null;
        const at = snapRel(cursorContent() ?? selEnd ?? offset);
        let made: string[] = [];
        editNotes((list) => { made = pasteNotes(list, cb, at); });
        setSel(made); done(); return;
      }
      if (mod && k === 'd' && selSet.size) {
        const cb = copyNotes(notes, selSet);
        if (cb) {
          const t0 = Math.min(...notes.filter((n) => selSet.has(n.id)).map((n) => n.startBeats));
          let made: string[] = [];
          editNotes((list) => { made = pasteNotes(list, cb, t0 + cb.span); });
          setSel(made);
        }
        done(); return;
      }
      if (!mod && selSet.size && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        transpose((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)); done(); return;
      }
      if (!mod && selSet.size && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        editNotes((list) => {
          for (const n of list) if (selSet.has(n.id)) n.startBeats = Math.max(0, n.startBeats + dir * (e.shiftKey ? meter.at(toSong(n.startBeats)).lenBeats : cellAt(n.startBeats)));
        });
        done(); return;
      }
      // Q = quantize — unless a track is armed, where Q is a QWERTY note.
      if (!mod && k === 'q' && !doc.arrangement.some((t) => t.armed)) { quantize(); done(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // re-bound every render: it reads the live selection, notes and grid

  // ── Composer Expression Macros (selection, or every note) ────────────────────
  const applyHairpinSwells = useCallback(() => {
    editNotes((list) => {
      const targets = targetsOf(list);
      targets.forEach((n, idx) => {
        const isLong = n.lengthBeats >= 1.25;
        n.articulation = isLong ? 'legato' : (n.articulation || 'legato');
        n.expr = {
          ...(n.expr || {}),
          swellShape: isLong ? 'hairpin' : 'arch',
          pressure: Math.min(1, Math.max(0.55, (n.vel / 127) * 1.08)),
          timbre: Math.min(0.95, 0.58 + 0.25 * Math.sin((idx / Math.max(1, targets.length)) * Math.PI)),
          vibratoDepth: isLong ? 0.22 : 0.08,
          vibratoRateHz: 5.5,
          vibratoDelay01: 0.2,
        };
      });
    });
  }, [editNotes, selSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyLegatoPortamento = useCallback(() => {
    editNotes((list) => {
      const sorted = [...targetsOf(list)].sort((a, b) => a.startBeats - b.startBeats);
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        if (next && next.startBeats > cur.startBeats) {
          const gap = next.startBeats - (cur.startBeats + cur.lengthBeats);
          if (gap >= -0.15 && gap <= 0.5) {
            // Slight 0.06-beat overlap for true legato phrasing
            cur.lengthBeats = Math.max(0.15, next.startBeats - cur.startBeats + 0.06);
            const interval = cur.key - next.key;
            if (Math.abs(interval) >= 1 && Math.abs(interval) <= 7) {
              next.articulation = 'portamento';
              next.expr = {
                ...(next.expr || {}),
                glideFromSemis: Math.sign(interval) * Math.min(2, Math.abs(interval) * 0.5),
                glidePortion01: 0.22,
                swellShape: next.expr?.swellShape || 'hairpin',
              };
            }
          }
        }
      }
    });
  }, [editNotes, selSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyHumanizeRubato = useCallback(() => {
    editNotes((list) => {
      targetsOf(list).forEach((n, i) => {
        const phase = (i * 1.6180339) % 1;
        const velDelta = Math.round(Math.sin(i * 0.85) * 9 + (phase - 0.5) * 6);
        n.vel = Math.max(28, Math.min(126, n.vel + velDelta));
        const microBeat = (Math.sin(i * 1.37) * 0.018);
        n.startBeats = Math.max(0, Number((n.startBeats + microBeat).toFixed(4)));
        n.expr = {
          ...(n.expr || {}),
          pressure: Math.max(0.3, Math.min(1, (n.vel / 127) * (0.92 + 0.14 * Math.sin(i * 0.6)))),
          timbre: Math.max(0.25, Math.min(0.95, 0.55 + 0.24 * Math.cos(i * 0.45))),
          vibratoDepth: n.lengthBeats >= 1.5 ? 0.19 : 0.07,
          swellShape: n.expr?.swellShape || (n.lengthBeats >= 2 ? 'hairpin' : 'arch'),
        };
      });
    });
  }, [editNotes, selSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSelectedArticulation = useCallback((art: OrchestralArticulation) => {
    setDefaultArticulation(art);
    if (!selSet.size) return;
    editNotes((list) => {
      for (const target of list) {
        if (!selSet.has(target.id)) continue;
        target.articulation = art;
        target.expr = {
          ...(target.expr || {}),
          swellShape:
            art === 'sfz-hairpin'
              ? 'sfz-swell'
              : art === 'spiccato' || art === 'pizzicato'
                ? 'decrescendo'
                : target.expr?.swellShape || 'hairpin',
        };
      }
    });
  }, [selSet, editNotes]);

  const updateSelectedSwell = useCallback((swell: MpeSwellShape) => {
    setDefaultSwell(swell);
    if (!selSet.size) return;
    editNotes((list) => { for (const t of list) if (selSet.has(t.id)) t.expr = { ...(t.expr || {}), swellShape: swell }; });
  }, [selSet, editNotes]);

  const quantMenu = useContextMenu<void>(() => [
    { kind: 'header', label: `Quantize · ${selSet.size ? `${selSet.size} selected` : 'all notes'} · grid ${SNAP_OPTIONS.find((o) => o.id === snapId)?.label}` },
    { id: 'go', label: 'Quantize now', shortcut: 'Q', onSelect: quantize },
    { kind: 'separator' },
    { id: 'strength', label: `Strength · ${Math.round(q.strength * 100)}%`, submenu: [1, 0.75, 0.5, 0.25].map((v) => ({
      id: `s${v}`, label: `${v * 100}%`, checked: q.strength === v, onSelect: () => setQuant({ ...q, strength: v }),
    })) },
    { id: 'swing', label: `Swing · ${Math.round(q.swing * 100)}%`, submenu: [0, 0.25, 0.5, 0.66, 0.75].map((v) => ({
      id: `w${v}`, label: `${Math.round(v * 100)}%`, checked: q.swing === v, onSelect: () => setQuant({ ...q, swing: v }),
    })) },
    { id: 'ends', label: 'Quantize note ends', checked: q.ends, onSelect: () => setQuant({ ...q, ends: !q.ends }) },
  ]);

  // Play it in: the selection (or all notes) performed by a band member — pocket, rolled and voiced
  // chords, phrased leads, articulated bass — instead of sitting stiffly on the grid.
  const playIn = useCallback((playerId?: string, personaId?: string) => {
    editNotes((list) => {
      const targets = targetsOf(list);
      if (!targets.length) return;
      const who = `${track?.name ?? ''} ${track?.instrument?.presetName ?? ''} ${track?.instrument?.type ?? ''}`;
      const role = guessPartRole(targets, who);
      const player = playerId ?? playerForPart(who, role);
      const persona = BAND.find((b) => b.id === player)?.personas.find((x) => x.id === personaId) ?? personaFor(player, doc.band?.genre);
      const played = new Map(performClipNotes(targets, { role, traits: persona.traits, seed: (Date.now() & 0x7fffffff) }).map((n) => [n.id, n]));
      for (let i = 0; i < list.length; i++) { const n = played.get(list[i].id); if (n) list[i] = n; }
    });
  }, [editNotes, selSet, track, doc.band?.genre]); // eslint-disable-line react-hooks/exhaustive-deps

  const playMenu = useContextMenu<void>(() => {
    const who = `${track?.name ?? ''} ${track?.instrument?.presetName ?? ''} ${track?.instrument?.type ?? ''}`;
    const auto = BAND.find((b) => b.id === playerForPart(who, guessPartRole(targetsOf(notes), who)));
    return [
      { kind: 'header', label: `Play it in · ${selSet.size ? `${selSet.size} selected` : 'all notes'}` },
      { id: 'auto', label: `${auto?.name ?? 'The band'} (this track's player)`, onSelect: () => playIn() },
      { kind: 'separator' },
      ...BAND.map((b) => ({ id: b.id, label: `${b.name} · ${b.instrument}`, submenu: b.personas.map((x) => ({ id: `${b.id}-${x.id}`, label: `${x.name} — ${x.tagline}`, onSelect: () => playIn(b.id, x.id) })) })),
    ];
  });

  const playheadContent = running && playMode === 'song' ? contentPosAt(clip, beats) : null;

  // ── step grid: the same notes on a 16th grid, one row per pitch actually in use ──
  const stepRows = useMemo(() => {
    const keys = [...new Set(notes.map((n) => n.key))].sort((a, b) => b - a);
    return keys.length ? keys : [60];
  }, [notes]);
  const stepCount = Math.max(16, Math.round(extent * 4));

  // ── CC lanes (clip.automationLanes, content beats) ─────────────────────────
  const ccTarget: AutomationTarget | null = drawerLane.startsWith('cc:')
    ? MIDI_LANE_TARGETS.find((t) => `cc:${t.kind}` === drawerLane) ?? null
    : null;
  const ccPoints = ccTarget ? clip.automationLanes?.find((l) => targetKey(l.target) === targetKey(ccTarget))?.points ?? [] : [];
  const setCcPoints = (pts: AutomationPoint[]) => {
    if (!ccTarget) return;
    editClip((c) => {
      const lanes = (c.automationLanes ??= []);
      const i = lanes.findIndex((l) => targetKey(l.target) === targetKey(ccTarget));
      if (!pts.length) { if (i >= 0) lanes.splice(i, 1); if (!lanes.length) delete c.automationLanes; return; }
      if (i >= 0) lanes[i].points = pts;
      else lanes.push({ id: grooveUid(), target: ccTarget, points: pts });
    });
  };

  // Bar / count lines across the visible content, from the song's meter.
  const gridLinesContent = useMemo(() => {
    const out: { at: number; strong: boolean }[] = [];
    const s0 = toSong(0), s1 = toSong(extent + 1);
    const first = meter.at(Math.max(0, s0));
    for (const bar of [first, ...meter.bars(first.startBeat + first.lenBeats - 1e-6, s1)]) {
      out.push({ at: bar.startBeat - s0, strong: true });
      for (let u = 1; u < bar.num; u++) out.push({ at: bar.startBeat + u * bar.unitBeats - s0, strong: false });
    }
    return out.filter((l) => l.at >= -1e-6 && l.at <= extent + 1);
  }, [meter, clip.startBeats, offset, extent]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Drag on the window strip: the loop brace (body / ends) or the window start (slip). */
  const dragStrip = (what: 'loop' | 'loopL' | 'loopR' | 'start') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX;
    const orig = { offset, loop: clip.loop ? { ...clip.loop } : null };
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / pxPerBeat;
      editClip((c) => {
        if (what === 'start') { c.contentOffsetBeats = snapRel(orig.offset + d, ev); return; }
        if (!orig.loop || !c.loop) return;
        const cell = cellAt(orig.loop.startBeats);
        if (what === 'loop') { c.loop.startBeats = Math.max(0, snapRel(orig.loop.startBeats + d, ev)); return; }
        if (what === 'loopL') {
          const end = orig.loop.startBeats + orig.loop.lengthBeats;
          const s = Math.max(0, Math.min(end - cell, snapRel(orig.loop.startBeats + d, ev)));
          c.loop.startBeats = s; c.loop.lengthBeats = end - s; return;
        }
        c.loop.lengthBeats = Math.max(cell, snapRel(orig.loop.startBeats + orig.loop.lengthBeats + d, ev) - orig.loop.startBeats);
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // Marquee on the empty grid (a click without dragging clears the selection).
  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0 || !gridRef.current) return;
    const r = gridRef.current.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => ({
      b: (ev.clientX - r.left - KEY_W) / pxPerBeat,
      k: HIGH - Math.floor((ev.clientY - r.top - STRIP_H) / ROW_H),
    });
    const a = at(e);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? sel : [];
    let movedFar = false;
    const move = (ev: PointerEvent) => {
      const b = at(ev);
      if (!movedFar && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 4) return;
      movedFar = true;
      setMarquee({ b0: a.b, b1: b.b, k0: a.k, k1: b.k });
      setSel([...new Set([...base, ...notesInRect(notes, a.b, b.b, a.k, b.k)])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!movedFar && !additive) setSel([]);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // Score pointer editing: select / drag (time on the grid, pitch by staff steps in the key).
  const scoreNoteDown = (id: string, e: React.PointerEvent) => {
    if (e.ctrlKey || e.metaKey) { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); return; }
    const nextSel = e.shiftKey ? [...new Set([...sel, id])] : selSet.has(id) ? sel : [id];
    setSel(nextSel.filter((x) => x !== id).concat(id));
    const orig = new Map(notes.filter((x) => nextSel.includes(x.id)).map((x) => [x.id, { start: x.startBeats, key: x.key }]));
    const p0 = orig.get(id);
    if (!p0) return;
    const grabbed = notes.find((x) => x.id === id);
    if (grabbed) audition(grabbed.key, grabbed.vel);
    const fifths = score?.fifths ?? 0;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 3) return;
      moved = true;
      const steps = Math.round(-(ev.clientY - y0) / SCORE_STEP_PX);
      const minStart = Math.min(...[...orig.values()].map((o) => o.start));
      const delta = Math.max(-minStart, snapRel(p0.start + (ev.clientX - x0) / pxPerBeat, ev) - p0.start);
      editNotes((list) => {
        for (const t of list) {
          const o = orig.get(t.id);
          if (!o) continue;
          t.startBeats = o.start + delta;
          if (!steps) { t.key = o.key; continue; }
          const sp = spell(o.key, fifths);
          const di = sp.octave * 7 + STEPS7.indexOf(sp.step) + steps;
          const st = STEPS7[((di % 7) + 7) % 7];
          t.key = Math.max(0, Math.min(127, midiFromStep(st, Math.floor(di / 7), keyAlt[st])));
        }
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const renderScore = () => score && (
    <ScoreView
      score={score}
      pxPerBeat={pxPerBeat}
      gutter={KEY_W}
      width={width}
      selected={selSet}
      playheadBeat={playheadContent}
      cursorBeat={noteInput ? inputCursor : null}
      dimmed={dimmed}
      onNoteDown={scoreNoteDown}
      onEmptyDown={(hit: ScoreHit, e) => {
        if (noteInput) { setInputCursor(Math.max(0, snapRel(hit.beat))); return; }
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setSel([]);
      }}
      onEmptyDouble={(hit: ScoreHit, e) => {
        const key = pitchAt(hit.diatonic, e);
        lastInputKey.current = key;
        addNote(key, Math.max(0, hit.beat), false, durBeats);
      }}
    />
  );

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#0A0A0D] flex flex-col" style={{ height: showExprDrawer ? '58%' : '46%' }}>
      {/* Top Toolbar: Mode, Snap, Key/Scale, Quantize, Transpose, Loop, Articulation, Swell, Macros */}
      <ChordAssistBar doc={doc} onMutate={onMutate} history={chordHistory(notes, songKey)} onInsert={insertChord} />
      {fxOpen && <div className="flex-none p-1.5 border-b border-white/10 max-h-[40%] overflow-y-auto"><NoteFxRack doc={doc} target={{ trackId }} onMutate={onMutate} /></div>}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-white/10 flex-none overflow-x-auto">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold whitespace-nowrap">
          {track?.name || 'Clip'}
        </span>
        <button onClick={() => setFxOpen((v) => !v)} aria-pressed={fxOpen} title="Note FX: arp, gate, chord, echo and more, on this track's notes"
          className={`h-6 px-2 rounded-md border text-[10px] whitespace-nowrap ${fxOpen || track?.instrument?.noteFx?.length || (track?.instrument?.arp as { enabled?: boolean } | undefined)?.enabled ? 'border-[#FF8C00]/50 text-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 text-white/50 hover:text-white'}`}>Note FX</button>
        <span className="text-[10px] text-white/25 whitespace-nowrap">{sel.length ? `${sel.length}/${notes.length}` : notes.length} notes</span>

        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 ml-1">
          <button onClick={() => setMode('roll')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'roll' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Music4 size={10} /> MPE Roll</button>
          <button onClick={() => setMode('score')} title="Score — the same notes as notation" className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'score' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><FileMusic size={10} /> Score</button>
          <button onClick={() => setMode('split')} title="Split — roll and score together, beat-aligned" className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'split' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Columns2 size={10} /> Split</button>
          <button onClick={() => setMode('steps')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'steps' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Grid3x3 size={10} /> Steps</button>
        </div>
        {scoreOn && (
          <>
            <div className="flex items-center rounded-md border border-white/10 overflow-hidden" title="Note value — keys 7 whole · 6 half · 5 quarter · 4 eighth · 3 sixteenth · . dot (applies to selected notes too)">
              {NOTE_VALUES.map((v) => (
                <button key={v.t} onClick={() => setDuration(v.t)} className="h-6 px-1.5 text-[11px]"
                  style={durTicks === v.t ? { background: 'rgba(208,188,255,0.18)', color: '#D0BCFF' } : { color: 'rgba(255,255,255,0.55)' }}>{v.label}</button>
              ))}
              <button onClick={() => setDuration(undefined, !durDot)} className="h-6 px-1.5 text-[12px] font-bold" title="Dotted (.)"
                style={durDot ? { background: 'rgba(208,188,255,0.18)', color: '#D0BCFF' } : { color: 'rgba(255,255,255,0.45)' }}>·</button>
              <button onClick={() => setDuration(undefined, undefined, !durTriplet)} className="h-6 px-1.5 text-[10px]" title="Triplet"
                style={durTriplet ? { background: 'rgba(208,188,255,0.18)', color: '#D0BCFF' } : { color: 'rgba(255,255,255,0.45)' }}>3</button>
            </div>
            <button
              onClick={() => { setNoteInput((v) => { if (!v) setInputCursor(snapRel(playheadContent ?? (notes.length ? Math.max(...notes.map((x) => x.startBeats + x.lengthBeats)) : offset))); return !v; }); }}
              aria-pressed={noteInput}
              title="Note input (N) — type A–G to write at the caret (Shift = ♯, Alt = ♭), 0 = rest, click the staff to move the caret"
              className={`h-6 px-2 rounded-md border text-[10px] whitespace-nowrap ${noteInput ? 'border-[#FF4D8C]/60 text-[#FF4D8C] bg-[#FF4D8C]/10' : 'border-white/10 text-white/50 hover:text-white'}`}
            >Input</button>
          </>
        )}
        <button
          onClick={() => {
            const xml = exportMusicXml([{ name: track?.name || 'Part', notes: flattenClipNotes(clip) }], {
              title: clip.name || `${track?.name ?? 'Clip'}`, composer: undefined, bpm: doc.bpm, meter, key: songKey,
              songStart: clip.startBeats, lengthBeats: clip.lengthBeats,
            });
            downloadMusicXml(xml, clip.name || track?.name || 'clip');
          }}
          title="Export this clip as MusicXML (opens in MuseScore, Dorico, Sibelius, Finale)"
          className="h-6 px-2 rounded-md border border-white/10 text-white/50 hover:text-white text-[10px] whitespace-nowrap"
        >MusicXML</button>

        <label className="flex items-center gap-1 text-[10px] text-white/35 whitespace-nowrap">Snap
          <select value={snapId} onChange={(e) => setSnapId(e.target.value)} title="Snap grid · hold Shift while placing or dragging for free timing" className="bg-black/40 border border-white/10 rounded px-1 h-6 text-[10px] text-white/75 outline-none">
            {SNAP_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <button onClick={(e) => quantMenu.openFrom(e.currentTarget, undefined)} title="Quantize the selection (or all notes) to the snap grid — strength, swing, ends" className="h-6 px-2 rounded-md border border-white/10 text-white/60 hover:text-white text-[10px] whitespace-nowrap">Quantize ▾</button>
        <button onClick={(e) => playMenu.openFrom(e.currentTarget, undefined)} title="Play the selection (or all notes) in like a musician — choose which band member and which side of them" className="h-6 px-2 rounded-md border border-[#E86A33]/35 text-[#F4A27A] hover:text-white text-[10px] whitespace-nowrap">Play it ▾</button>
        <div className="flex items-center rounded-md border border-white/10 overflow-hidden" title="Transpose the selection (or all notes) — ↑↓ keys, Shift = octave">
          {[-12, -1, 1, 12].map((s) => (
            <button key={s} onClick={() => transpose(s)} className="h-6 px-1.5 text-[10px] font-mono text-white/55 hover:text-white hover:bg-white/10">{s > 0 ? `+${s}` : s}</button>
          ))}
        </div>
        {songKey && (
          <>
            <button
              onClick={() => setScaleLock((v) => { const n = !v; try { localStorage.setItem('melos:roll:scaleLock', n ? '1' : '0'); } catch { /* */ } return n; })}
              aria-pressed={scaleLock}
              title={`Scale lock — drawn and dragged notes stay in ${keyLabel(songKey)} (set the key from the transport bar)`}
              className={`h-6 px-2 rounded-md border text-[10px] whitespace-nowrap ${scaleLock ? 'border-[#D0BCFF]/50 text-[#D0BCFF] bg-[#D0BCFF]/12' : 'border-white/10 text-white/45 hover:text-white'}`}
            >{keyLabel(songKey)}{scaleLock ? ' · lock' : ''}</button>
            <button onClick={() => editNotes((list) => fitNotesToScale(list, selSet, songKey))} title="Move the selection (or all notes) to the nearest note of the project scale" className="h-6 px-2 rounded-md border border-white/10 text-white/50 hover:text-white text-[10px] whitespace-nowrap">Fit to scale</button>
          </>
        )}
        <button
          onClick={() => onMutate((d) => { const c = d.arrangement.find((x) => x.id === trackId)?.clips.find((x) => x.id === clip.id); if (c) setClipLoop(d, c, !c.loop); })}
          aria-pressed={!!loop}
          title="Loop the clip's content — drag the brace above the grid to set the loop"
          className={`h-6 px-2 rounded-md border text-[10px] flex items-center gap-1 whitespace-nowrap ${loop ? 'border-[#00DAF3]/50 text-[#00DAF3] bg-[#00DAF3]/10' : 'border-white/10 text-white/45 hover:text-white'}`}
        ><Repeat size={10} /> Loop{loop ? ` ${+(loop.len).toFixed(2)}b` : ''}</button>

        {/* Orchestral Articulation Selector */}
        <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap">Articulation
          <select
            value={selectedNote?.articulation || defaultArticulation}
            onChange={(e) => updateSelectedArticulation(e.target.value as OrchestralArticulation)}
            className="bg-black/50 border border-[#D0BCFF]/30 rounded px-1.5 h-6 text-[10px] text-[#D0BCFF] outline-none"
          >
            {ARTICULATION_SPECS.map((a) => (
              <option key={a.id} value={a.id}>{a.short} · {a.label}</option>
            ))}
          </select>
        </label>

        {/* MPE Dynamic Swell Shape Selector */}
        <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap">MPE Swell
          <select
            value={selectedNote?.expr?.swellShape || defaultSwell}
            onChange={(e) => updateSelectedSwell(e.target.value as MpeSwellShape)}
            className="bg-black/50 border border-[#38BDF8]/30 rounded px-1.5 h-6 text-[10px] text-[#38BDF8] outline-none"
          >
            {SWELL_SHAPES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        {/* Composer Expression Action Buttons */}
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={applyHairpinSwells}
            title="Apply continuous MPE pressure hairpin swells (< >) and progressive string/wind vibrato"
            className="h-6 px-2 rounded-md bg-[#38BDF8]/15 border border-[#38BDF8]/30 text-[#38BDF8] hover:bg-[#38BDF8]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            <Wand2 size={10} /> ⟨ ⟩ Hairpin Swell
          </button>
          <button
            onClick={applyLegatoPortamento}
            title="Overlap consecutive melody notes and add expressive legato portamento pitch glide"
            className="h-6 px-2 rounded-md bg-[#F472B6]/15 border border-[#F472B6]/30 text-[#F472B6] hover:bg-[#F472B6]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            ⌢ Legato + Glide
          </button>
          <button
            onClick={applyHumanizeRubato}
            title="Humanize note velocities, micro-timing rubato, and MPE timbre breath"
            className="h-6 px-2 rounded-md bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            <Sparkles size={10} /> Humanize Rubato
          </button>
        </div>

        {mode === 'roll' && (
          <label className="flex items-center gap-1 text-[10px] text-white/35 whitespace-nowrap ml-1">Zoom
            <input type="range" min={20} max={160} value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} className="w-16 accent-[#D0BCFF]" />
          </label>
        )}

        <span className="flex-1" />

        <button
          onClick={() => setShowExprDrawer((v) => !v)}
          className={`h-6 px-2 rounded-lg border text-[10px] flex items-center gap-1 whitespace-nowrap ${
            showExprDrawer ? 'border-[#D0BCFF]/40 bg-[#D0BCFF]/15 text-[#D0BCFF]' : 'border-white/10 text-white/45'
          }`}
        >
          <Sliders size={10} /> Lanes
        </button>

        {sel.length > 0 && (
          <button onClick={() => removeNotes(selSet)} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-[#EF4444] text-[10px] flex items-center gap-1">
            <Trash2 size={10} /> Delete{sel.length > 1 ? ` ${sel.length}` : ''}
          </button>
        )}
        <button onClick={onClose} className="h-6 px-2.5 rounded-lg border border-white/15 text-white/50 hover:text-white text-[10px]">Close</button>
      </div>
      {quantMenu.node}
      {playMenu.node}

      {mode === 'roll' || mode === 'split' ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto flex flex-col">
          {/* Note Grid Area */}
          <div ref={gridRef} className="relative flex-none" style={{ width: KEY_W + width, height: STRIP_H + ROWS * ROW_H }}>
            {/* Window strip: where the clip starts reading (drag = slip) and the loop brace. */}
            <div className="sticky top-0 z-20 flex" style={{ height: STRIP_H }}>
              <div className="sticky left-0 z-10 flex-none bg-[#0A0A0D] border-r border-b border-white/10 text-[7.5px] text-white/30 flex items-center justify-center" style={{ width: KEY_W }}>{loop ? 'LOOP' : 'CLIP'}</div>
              <div className="relative flex-1 bg-[#0E0F15] border-b border-white/10">
                {loop && (
                  <div
                    className="absolute top-[3px] bottom-[3px] rounded-sm cursor-grab"
                    style={{ left: loop.start * pxPerBeat, width: loop.len * pxPerBeat, background: 'rgba(0,218,243,0.22)', border: '1px solid rgba(0,218,243,0.7)' }}
                    onPointerDown={dragStrip('loop')}
                    title="Loop — drag to move · drag an end to resize (Shift = no snap)"
                  >
                    <span onPointerDown={dragStrip('loopL')} className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-ew-resize" />
                    <span onPointerDown={dragStrip('loopR')} className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-ew-resize" />
                  </div>
                )}
                <span
                  onPointerDown={dragStrip('start')}
                  className="absolute top-0 bottom-0 w-[9px] -ml-[1px] cursor-ew-resize"
                  style={{ left: offset * pxPerBeat, background: 'linear-gradient(90deg, #FF8C00 0 2px, transparent 2px)' }}
                  title="Clip start — drag to slip which content the clip begins on"
                />
              </div>
            </div>
            {/* keyboard + rows */}
            {Array.from({ length: ROWS }, (_, r) => {
              const key = HIGH - r;
              const pc = ((key % 12) + 12) % 12;
              const black = BLACK.has(pc);
              const outOfKey = inKey ? !inKey[pc] : false;
              const tonicRow = songKey ? pc === songKey.tonic : false;
              return (
                <div key={r} className="absolute left-0 right-0 flex" style={{ top: STRIP_H + r * ROW_H, height: ROW_H }}>
                  <button
                    onPointerDown={() => audition(key)}
                    className="sticky left-0 z-10 flex-none flex items-center justify-end pr-1.5 text-[8px] font-mono border-b border-r"
                    style={{
                      width: KEY_W, height: ROW_H,
                      background: black ? '#15151A' : '#E8E4EE',
                      color: black ? 'rgba(255,255,255,0.45)' : '#0A0A0D',
                      borderColor: 'rgba(0,0,0,0.5)',
                    }}
                  >{key % 12 === 0 ? noteName(key) : ''}</button>
                  <div
                    className="flex-1 border-b cursor-crosshair"
                    style={{
                      borderColor: 'rgba(255,255,255,0.045)',
                      // With a project key the rows read the SCALE (out-of-key rows dim, the tonic
                      // row is tinted); without one they read the keyboard, black keys shaded.
                      background: inKey
                        ? (tonicRow ? 'rgba(208,188,255,0.07)' : outOfKey ? 'rgba(0,0,0,0.38)' : 'transparent')
                        : (black ? 'rgba(0,0,0,0.30)' : 'transparent'),
                    }}
                    onPointerDown={startMarquee}
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      addNote(key, (e.clientX - rect.left) / pxPerBeat, e.shiftKey);
                    }}
                  />
                </div>
              );
            })}
            {/* content the clip window doesn't play */}
            {dimmed.map((r, i) => (
              <div key={`dim${i}`} className="absolute bottom-0 pointer-events-none" style={{ top: STRIP_H, left: KEY_W + r.from * pxPerBeat, width: Math.max(0, (r.to - r.from) * pxPerBeat), background: 'rgba(0,0,0,0.4)', zIndex: 6 }} />
            ))}
            {/* bar + count lines from the song's meter */}
            {gridLinesContent.map((l) => (
              <div key={`b${l.at}`} className="absolute bottom-0 pointer-events-none" style={{
                top: STRIP_H, left: KEY_W + l.at * pxPerBeat, width: 1,
                background: l.strong ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
              }} />
            ))}
            {playheadContent !== null && (
              <div className="absolute bottom-0 w-[2px] z-20 pointer-events-none" style={{ top: STRIP_H, left: KEY_W + playheadContent * pxPerBeat, background: PLAYHEAD, boxShadow: `0 0 10px ${PLAYHEAD}` }} />
            )}
            {marquee && (
              <div className="absolute z-30 pointer-events-none border border-[#00DAF3] bg-[#00DAF3]/10" style={{
                left: KEY_W + Math.min(marquee.b0, marquee.b1) * pxPerBeat,
                width: Math.abs(marquee.b1 - marquee.b0) * pxPerBeat,
                top: STRIP_H + (HIGH - Math.max(marquee.k0, marquee.k1)) * ROW_H,
                height: (Math.abs(marquee.k1 - marquee.k0) + 1) * ROW_H,
              }} />
            )}
            {/* notes with inline MPE swell curve & articulation badge */}
            {notes.map((n) => {
              const r = HIGH - n.key;
              if (r < 0 || r >= ROWS) return null;
              const isSel = selSet.has(n.id);
              const artSpec = ARTICULATION_SPECS.find((a) => a.id === (n.articulation || 'legato')) || ARTICULATION_SPECS[0];
              const noteW = Math.max(6, n.lengthBeats * pxPerBeat - 2);
              const swell = n.expr?.swellShape || (n.lengthBeats >= 2 ? 'hairpin' : 'arch');
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.ctrlKey || e.metaKey) { setSel((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id])); return; }
                    const nextSel = e.shiftKey ? [...new Set([...sel, n.id])] : isSel ? sel : [n.id];
                    setSel(nextSel.filter((x) => x !== n.id).concat(n.id)); // the grabbed note is primary
                    const el = e.currentTarget as HTMLElement;
                    const nearEnd = e.clientX > el.getBoundingClientRect().right - 8;
                    el.setPointerCapture(e.pointerId);
                    const orig = new Map(notes.filter((x) => nextSel.includes(x.id)).map((x) => [x.id, { start: x.startBeats, len: x.lengthBeats, key: x.key }]));
                    drag.current = { ids: nextSel, primary: n.id, mode: nearEnd ? 'len' : 'move', x: e.clientX, y: e.clientY, orig, moved: false };
                    if (!nearEnd) audition(n.key, n.vel);
                  }}
                  onPointerMove={(e) => {
                    const dr = drag.current;
                    if (!dr || dr.primary !== n.id) return;
                    if (!dr.moved && Math.abs(e.clientX - dr.x) + Math.abs(e.clientY - dr.y) < 3) return;
                    dr.moved = true;
                    const p0 = dr.orig.get(dr.primary)!;
                    const dBeats = (e.clientX - dr.x) / pxPerBeat;
                    const dRows = Math.round((e.clientY - dr.y) / ROW_H);
                    editNotes((list) => {
                      if (dr.mode === 'move') {
                        // The grabbed note lands on the grid; the rest keep their offsets to it.
                        const minStart = Math.min(...[...dr.orig.values()].map((o) => o.start));
                        const delta = Math.max(-minStart, snapRel(p0.start + dBeats, e) - p0.start);
                        for (const t of list) {
                          const o = dr.orig.get(t.id); if (!o) continue;
                          t.startBeats = o.start + delta;
                          t.key = lockPitch(Math.max(LOW, Math.min(HIGH, o.key - dRows)), lock);
                        }
                      } else {
                        // Snap the grabbed note's END; every selected note grows by the same amount.
                        const raw = Math.max(0.05, p0.len + dBeats);
                        const end = snapRel(p0.start + raw, e);
                        const minCell = cellAt(p0.start);
                        const newLen = e.shiftKey || snapGrid.mode === 'off' ? raw : Math.max(minCell, end - p0.start);
                        const dLen = newLen - p0.len;
                        for (const t of list) {
                          const o = dr.orig.get(t.id); if (!o) continue;
                          t.lengthBeats = Math.max(e.shiftKey ? 0.02 : Math.min(minCell, o.len), o.len + dLen);
                        }
                      }
                    });
                  }}
                  onPointerUp={() => {
                    const dr = drag.current;
                    drag.current = null;
                    if (dr?.mode === 'len' && dr.moved) {
                      const cur = (clip.notes || []).find((x) => x.id === dr.primary);
                      if (cur) setLastLen(cur.lengthBeats);
                    }
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); removeNotes(new Set([n.id])); }}
                  className="absolute rounded-[4px] cursor-grab overflow-hidden"
                  title={`${noteName(n.key)} · vel ${n.vel} · ${artSpec.label} · MPE ${swell} — drag to move, right edge to resize, double-click to delete`}
                  style={{
                    left: KEY_W + n.startBeats * pxPerBeat,
                    top: STRIP_H + r * ROW_H + 1,
                    width: noteW,
                    height: ROW_H - 2,
                    background: `linear-gradient(90deg, rgba(212,0,85,${0.32 + (n.vel / 127) * 0.58}), ${artSpec.color}99)`,
                    outline: isSel ? `1.5px solid ${SELECT}` : 'none',
                    outlineOffset: 1,
                    zIndex: 7,
                  }}
                >
                  {/* Inline MPE Envelope Contour Overlay */}
                  {noteW >= 24 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-65" viewBox="0 0 100 20" preserveAspectRatio="none">
                      <path
                        d={
                          swell === 'hairpin'
                            ? 'M 0 16 Q 55 2 100 15'
                            : swell === 'crescendo'
                              ? 'M 0 18 L 100 2'
                              : swell === 'decrescendo'
                                ? 'M 0 2 L 100 18'
                                : swell === 'sfz-swell'
                                  ? 'M 0 2 L 18 15 Q 65 4 100 3'
                                  : 'M 0 14 Q 50 4 100 14'
                        }
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                  {noteW >= 34 && (
                    <span className="relative z-10 pl-1 text-[7.5px] font-mono font-bold text-white/90 leading-none select-none pointer-events-none">
                      {artSpec.short}
                    </span>
                  )}
                  <span className="absolute right-0 top-0 bottom-0 w-[7px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.22)' }} />
                </div>
              );
            })}
          </div>

          {/* Split: the score docks under the roll, beat-aligned, above the lane drawer. */}
          {mode === 'split' && score && (
            <div className="sticky left-0 z-20 border-t border-white/15" style={{ bottom: showExprDrawer ? 108 : 0, width: KEY_W + width }}>
              {renderScore()}
            </div>
          )}

          {/* Bottom drawer: per-note MPE lanes and the clip's MIDI CC lanes */}
          {showExprDrawer && (
            <div className="sticky bottom-0 left-0 z-20 border-t border-white/15 bg-[#0D0E14]/95 backdrop-blur-md" style={{ width: KEY_W + width, height: 108 }}>
              <div className="sticky left-0 flex items-center gap-1 px-2 h-6 border-b border-white/10 bg-[#12131C] text-[9px] w-max">
                <span className="text-white/40 font-semibold uppercase tracking-wider mr-1">Note:</span>
                {MPE_LANES.map((lane) => (
                  <button key={lane.id} onClick={() => setDrawerLane(lane.id)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition ${drawerLane === lane.id ? 'bg-white/15 border border-white/25' : 'text-white/45 hover:text-white/75'}`}
                    style={drawerLane === lane.id ? { color: lane.color } : undefined}
                  >{lane.label}</button>
                ))}
                <span className="text-white/40 font-semibold uppercase tracking-wider ml-2 mr-1">CC:</span>
                {MIDI_LANE_TARGETS.map((t) => {
                  const id = `cc:${t.kind}` as DrawerLane;
                  const spec = targetSpec(t);
                  const has = !!clip.automationLanes?.some((l) => targetKey(l.target) === targetKey(t) && l.points.length);
                  return (
                    <button key={id} onClick={() => setDrawerLane(id)}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition ${drawerLane === id ? 'bg-white/15 border border-white/25' : 'text-white/45 hover:text-white/75'}`}
                      style={drawerLane === id ? { color: spec.color } : undefined}
                    >{spec.label}{has ? ' •' : ''}</button>
                  );
                })}
              </div>

              {ccTarget ? (
                <div style={{ marginLeft: KEY_W }}>
                  <AutomationLaneEditor
                    target={ccTarget}
                    points={ccPoints}
                    originBeat={0}
                    widthBeats={extent + 1}
                    pxPerBeat={pxPerBeat}
                    height={82}
                    snap={(b, e) => snapRel(b, e)}
                    cell={cellAt}
                    onChange={setCcPoints}
                    dimmed={dimmed}
                    cursorBeat={playheadContent}
                  />
                </div>
              ) : (
                <div className="relative h-[82px]" style={{ marginLeft: KEY_W, width }}>
                  {/* Horizontal reference grid lines */}
                  <div className="absolute inset-x-0 top-1/4 border-t border-white/[0.05] pointer-events-none" />
                  <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.08] pointer-events-none" />
                  <div className="absolute inset-x-0 top-3/4 border-t border-white/[0.05] pointer-events-none" />

                  {notes.map((n) => {
                    const lane = drawerLane as MpeLaneKind;
                    const left = n.startBeats * pxPerBeat;
                    const w = Math.max(8, n.lengthBeats * pxPerBeat - 2);
                    const val01 =
                      lane === 'velocity' ? n.vel / 127
                        : lane === 'pressure' ? n.expr?.pressure ?? n.vel / 127
                          : lane === 'timbre' ? n.expr?.timbre ?? 0.65
                            : lane === 'vibrato' ? Math.min(1, (n.expr?.vibratoDepth ?? 0.16) / 0.5)
                              : ((n.expr?.bend ?? 0) + 1) * 0.5;
                    const barH = Math.max(6, Math.round(val01 * 72));
                    const color = MPE_LANES.find((l) => l.id === lane)?.color ?? '#38BDF8';
                    // Drag paints the value; with a selection, every selected note follows.
                    const paint = (clientY: number, rect: DOMRect) => {
                      const new01 = Math.max(0.05, Math.min(1, 1 - (clientY - rect.top) / 76));
                      const ids = selSet.has(n.id) ? selSet : new Set([n.id]);
                      editNotes((list) => {
                        for (const target of list) {
                          if (!ids.has(target.id)) continue;
                          if (lane === 'velocity') { target.vel = Math.max(1, Math.min(127, Math.round(new01 * 127))); continue; }
                          target.expr = { ...(target.expr || {}) };
                          if (lane === 'pressure') target.expr.pressure = Number(new01.toFixed(2));
                          else if (lane === 'timbre') target.expr.timbre = Number(new01.toFixed(2));
                          else if (lane === 'vibrato') target.expr.vibratoDepth = Number((new01 * 0.5).toFixed(2));
                          else if (lane === 'bend') target.expr.bend = Number(((new01 - 0.5) * 2).toFixed(2));
                        }
                      });
                    };
                    return (
                      <div
                        key={`expr_${n.id}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (!selSet.has(n.id)) setSel([n.id]);
                          const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                          paint(e.clientY, rect);
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons !== 1) return;
                          paint(e.clientY, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect());
                        }}
                        className="absolute bottom-1 rounded-t cursor-ns-resize group"
                        style={{
                          left,
                          width: w,
                          height: barH,
                          background: `linear-gradient(180deg, ${color}cc, ${color}33)`,
                          borderTop: `2px solid ${color}`,
                          outline: selSet.has(n.id) ? `1px solid ${SELECT}` : 'none',
                        }}
                        title={`${noteName(n.key)} · ${lane}: ${Math.round(val01 * 100)}%`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : mode === 'score' && score ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
          {renderScore()}
          <p className="px-3 py-2 text-[9.5px] text-white/30">
            Click a note to select · drag to move (staff steps, in key) · double-click the staff to add ({'Shift = ♯, Alt = ♭'}) ·
            N = note input (A–G at the caret, 0 = rest) · 3–7 note values, . dot · ↑↓ transpose · Delete
          </p>
        </div>
      ) : (
        // ── step grid over the same notes ──
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <p className="text-[9px] text-white/25 mb-2">Same notes as the piano roll, snapped to 16ths. Click a cell to add or remove.</p>
          <div className="flex flex-col gap-1">
            {stepRows.map((key) => (
              <div key={key} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '52px 1fr' }}>
                <button onPointerDown={() => audition(key)} className="text-[10px] font-mono text-white/50 text-right pr-1 hover:text-white">{noteName(key)}</button>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0,1fr))` }}>
                  {Array.from({ length: stepCount }, (_, s) => {
                    const at = s * 0.25;
                    const hit = notes.find((n) => n.key === key && Math.abs(n.startBeats - at) < 0.125);
                    return (
                      <button
                        key={s}
                        onClick={() => (hit ? removeNotes(new Set([hit.id])) : addNote(key, at, true))}
                        aria-label={`${noteName(key)} step ${s + 1}`}
                        className="h-5 rounded-[3px] border transition"
                        style={{
                          background: hit ? `rgba(212,0,85,${0.35 + (hit.vel / 127) * 0.6})` : s % 4 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)',
                          borderColor: hit ? '#D40055' : 'rgba(255,255,255,0.06)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
