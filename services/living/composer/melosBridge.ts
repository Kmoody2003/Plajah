// melosBridge: a PURE two-way converter between a Melos MIDI clip (services/melos/beats/grooveDoc TimelineClip / NoteEvent)
// and a Living Books Score (services/living/contracts). Neither side is modified; this file only maps between them.
//
// Units line up: Melos `startBeats` / `lengthBeats` are beats, and so are Score `t` / `d`. Pitch is a MIDI number on both sides
// (Score may also carry a note name like 'C4'). Melos velocity is 1..127, Score velocity is 0..1.
//
//   NoteEvent.startBeats  <->  ScoreNote.t        (1:1, beats)
//   NoteEvent.lengthBeats <->  ScoreNote.d        (1:1, beats)
//   NoteEvent.key         <->  ScoreNote.n        (MIDI number; names are normalised to numbers on the way to Melos)
//   NoteEvent.vel (1-127) <->  ScoreNote.v (0-1)  (v = vel / 127, vel = round(v * 127) clamped to 1..127; missing v = DEFAULT_VELOCITY)
//   tempo (bpm)           <->  Score.tempo        (a Melos clip has no tempo of its own: pass it in, or read it back from the Score)
//
// LOSSY, on purpose, and reported in `loss` so the UI can say so instead of hiding it:
//   Melos -> Score drops: per-note MPE expression (`expr`), clip colour, clip start offset (the clip is rebased to beat 0), note ids.
//                         Notes with a fractional or out-of-range key are rounded / clamped to 0..127.
//   Score -> Melos drops: unpitched hits ('x' and drum names are NOT MIDI pitches here, they are skipped and counted), per-track gain, pan,
//                         loop, the Score's `variation` and `reverb`, `beatsPerBar` (Melos keeps meter on the timeline, not the clip), and
//                         the instrument name (Melos instruments are assigned per track in Melos; we return it so the caller can map it).
//   Score -> Melos regenerates ids: they are deterministic (`<prefix>-<track>-<index>`), so a round trip is reproducible in tests.
//
// A Melos -> Score -> Melos round trip is EXACT for in-range integer pitches, any start / length, and any integer velocity 1..127
// (only ids are regenerated). A Score -> Melos -> Score trip is exact only for pitched notes with explicit v; see tests/livingComposerBridge.test.ts.

import type { Score, ScoreNote, ScoreTrack } from '../contracts';
import { isUnpitched, midiToName, noteToMidi } from '../audio/notes';
import type { NoteEvent, TimelineClip } from '../../melos/beats/grooveDoc';

export const DEFAULT_VELOCITY = 0.7;   // used when a ScoreNote has no `v` (the engine's own default feel)
export const DEFAULT_MELOS_VEL = 90;   // Melos' default clip velocity (progressionToClip uses 90)

export interface BridgeLoss {
  /** notes that could not become MIDI pitches ('x', drum names) */
  unpitchedSkipped: number;
  /** notes whose pitch/velocity had to be rounded or clamped */
  adjusted: number;
  /** human readable list of everything that does not survive this direction */
  dropped: string[];
}

const clampInt = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export const velToMelos = (v: number | undefined): number => clampInt((v ?? DEFAULT_VELOCITY) * 127, 1, 127);
export const velFromMelos = (vel: number): number => clampInt(vel, 1, 127) / 127;

// ───────────────────────── Melos clip -> Score ─────────────────────────
export interface ClipToScoreOpts {
  id: string;
  tempo: number;
  instrument?: string;
  beatsPerBar?: number;
  /** length of one loop in beats; defaults to the clip length (or the end of its last note) */
  lengthBeats?: number;
  gain?: number;
  pan?: number;
  loop?: boolean;
  reverb?: number;
}

/** Notes of one Melos clip as ScoreNotes (rebased so the clip starts at beat 0). Sorted by time then pitch. */
export function noteEventsToScoreNotes(notes: NoteEvent[]): { notes: ScoreNote[]; adjusted: number } {
  let adjusted = 0;
  const out: ScoreNote[] = [];
  for (const e of notes) {
    if (!Number.isFinite(e.key) || !Number.isFinite(e.startBeats) || !Number.isFinite(e.lengthBeats)) { adjusted++; continue; }
    const key = clampInt(e.key, 0, 127);
    if (key !== e.key) adjusted++;
    out.push({ t: Math.max(0, e.startBeats), n: key, d: Math.max(0.0625, e.lengthBeats), v: velFromMelos(e.vel) });
  }
  out.sort((a, b) => a.t - b.t || (a.n as number) - (b.n as number));
  return { notes: out, adjusted };
}

export function clipToScore(clip: Pick<TimelineClip, 'lengthBeats' | 'notes'>, o: ClipToScoreOpts): { score: Score; loss: BridgeLoss } {
  const { notes, adjusted } = noteEventsToScoreNotes(clip.notes ?? []);
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  const track: ScoreTrack = { instrument: o.instrument ?? 'felt-piano', notes };
  if (o.gain != null) track.gain = o.gain;
  if (o.pan != null) track.pan = o.pan;
  if (o.loop != null) track.loop = o.loop;
  const score: Score = { id: o.id, tempo: o.tempo, lengthBeats: o.lengthBeats ?? (clip.lengthBeats > 0 ? clip.lengthBeats : Math.max(1, end)), tracks: [track] };
  if (o.beatsPerBar) score.beatsPerBar = o.beatsPerBar;
  if (o.reverb != null) score.reverb = o.reverb;
  return { score, loss: { unpitchedSkipped: 0, adjusted, dropped: ['per-note MPE expression', 'clip colour', 'clip start offset (rebased to beat 0)', 'note ids'] } };
}

// ───────────────────────── Score -> Melos clips ─────────────────────────
export interface MelosTrackClip {
  trackIndex: number;
  /** the Living instrument name, so the caller can choose a Melos instrument for the track */
  instrument: string;
  clip: TimelineClip;
}

export interface ScoreToClipsOpts { idPrefix?: string; startBeats?: number }

export function scoreToClips(score: Score, o: ScoreToClipsOpts = {}): { clips: MelosTrackClip[]; tempo: number; beatsPerBar: number; loss: BridgeLoss } {
  const prefix = o.idPrefix ?? score.id;
  let unpitched = 0, adjusted = 0;
  const clips: MelosTrackClip[] = [];
  score.tracks.forEach((tr, ti) => {
    const notes: NoteEvent[] = [];
    tr.notes.forEach((sn, ni) => {
      if (isUnpitched(sn.n)) { unpitched++; return; }
      const m = noteToMidi(sn.n);
      // drum hits named 'kick' / 'snare' etc. are not pitches either
      if (m == null) { unpitched++; return; }
      const key = clampInt(m, 0, 127);
      if (key !== m) adjusted++;
      if (sn.v != null && (sn.v < 0 || sn.v > 1)) adjusted++;
      notes.push({ id: `${prefix}-${ti}-${ni}`, startBeats: sn.t, lengthBeats: sn.d, key, vel: velToMelos(sn.v) });
    });
    clips.push({ trackIndex: ti, instrument: tr.instrument, clip: { id: `${prefix}-clip-${ti}`, startBeats: o.startBeats ?? 0, lengthBeats: score.lengthBeats, notes } });
  });
  return {
    clips, tempo: score.tempo, beatsPerBar: score.beatsPerBar ?? 4,
    loss: { unpitchedSkipped: unpitched, adjusted, dropped: ['unpitched / drum-name hits', 'per-track gain, pan and loop', 'variation (seeded humanise / dropout)', 'reverb', 'beatsPerBar (meter lives on the Melos timeline)', 'instrument assignment (returned per clip instead)'] },
  };
}

/** Convenience: all pitched tracks of a Score merged into ONE Melos clip (for dropping a whole cue onto a single Melos track). */
export function scoreToSingleClip(score: Score, o: ScoreToClipsOpts = {}): { clip: TimelineClip; tempo: number; loss: BridgeLoss } {
  const r = scoreToClips(score, o);
  const notes = r.clips.flatMap((c) => c.clip.notes ?? []).sort((a, b) => a.startBeats - b.startBeats || a.key - b.key)
    .map((n, i) => ({ ...n, id: `${o.idPrefix ?? score.id}-m-${i}` }));
  return { clip: { id: `${o.idPrefix ?? score.id}-clip`, startBeats: o.startBeats ?? 0, lengthBeats: score.lengthBeats, notes }, tempo: r.tempo, loss: r.loss };
}

/** Normalise note names to MIDI numbers and sort: the canonical form used to compare Scores in round-trip tests. */
export function canonicalScore(score: Score): Score {
  return {
    ...score,
    tracks: score.tracks.map((tr) => ({
      ...tr,
      notes: tr.notes.map((n) => ({ ...n, n: typeof n.n === 'string' && !isUnpitched(n.n) ? (noteToMidi(n.n) ?? n.n) : n.n }))
        .sort((a, b) => a.t - b.t || String(a.n).localeCompare(String(b.n), undefined, { numeric: true })),
    })),
  };
}

export { midiToName };
