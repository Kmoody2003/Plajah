import { addInstrument, addInstrumentToNextPad } from '../beats/instrumentFactory';
import { addPadBank, defaultPattern, firstEmptyPadIndex, grooveUid, type GrooveDoc, type SampleRef, type InstrumentType } from '../beats/grooveDoc';
import { validateGeneratedNotes, type GeneratedNote } from './types';
import { guessPartRole, isOnGrid, performClipNotes, performMeloLane, personaFor, playerForPart } from '../beats/patterns/performNotes';

/** Generated parts come out on the grid: the band member who plays that instrument plays them in. */
function played<T extends { startBeats: number; lengthBeats: number; key: number; vel: number }>(notes: T[], target: InsertTarget): T[] {
  if (!isOnGrid(notes)) return notes;
  const who = `${target.name} ${target.instrument}`;
  const asEvents = notes.map((n, i) => ({ ...n, id: String(i) }));
  const role = guessPartRole(asEvents, who);
  return performClipNotes(asEvents, { role, traits: personaFor(playerForPart(who, role)).traits, seed: Date.now() & 0x7fffffff }) as unknown as T[];
}

export interface InsertTarget {
  destination: 'timeline' | 'meka' | 'glass';
  startBeats: number;
  trackId?: string;
  instrument: InstrumentType;
  name: string;
}
function validateTarget(target: InsertTarget) {
  if (!Number.isFinite(target.startBeats) || target.startBeats < 0 || target.startBeats > 100000) throw new Error('Choose a valid insertion beat');
}
export function insertGeneratedNotes(doc: GrooveDoc, raw: GeneratedNote[], target: InsertTarget) {
  validateTarget(target);
  const notes = validateGeneratedNotes(raw);
  const end = Math.max(...notes.map(note => note.startBeats + note.lengthBeats));
  if (target.destination === 'timeline') {
    const existing = target.trackId ? doc.arrangement.find(track => track.id === target.trackId && track.kind === 'instrument' && !track.padOwned) : undefined;
    if (target.trackId && !existing) throw new Error('The destination MIDI track is no longer available');
    const trackId = existing?.id || addInstrument(doc, target.instrument);
    const track = doc.arrangement.find(item => item.id === trackId)!;
    if (!existing) track.name = target.name;
    const clip = { id: grooveUid(), startBeats: target.startBeats, lengthBeats: Math.max(4, Math.ceil(end / 4) * 4), notes: played(notes, target).map(note => ({ ...note, id: grooveUid() })) };
    track.clips.push(clip);
    return { trackId, clipId: clip.id };
  }
  if (end > 16) throw new Error('MEKA and Glass patterns hold up to 4 bars. Use Timeline for a longer score.');
  const low = Math.min(...notes.map(note => note.key)), high = Math.max(...notes.map(note => note.key));
  if (high - low > 48) throw new Error('This score spans more than four octaves. Insert it in Timeline.');
  const { padIdx, trackId } = addInstrumentToNextPad(doc, target.instrument);
  const base = Math.round((low + high) / 2);
  const pad = doc.kit[padIdx]; pad.name = target.name.slice(0, 18); pad.instrumentNote = base; pad.pitchSemis = 0;
  const pattern = defaultPattern(target.name);
  pattern.length = (Math.max(1, Math.ceil(end / 4)) * 16) as 16 | 32 | 48 | 64;
  pattern.melo = { [padIdx]: {} };
  for (const note of notes) {
    const step = Math.min(pattern.length - 1, Math.round(note.startBeats * 4));
    const chord = pattern.melo[padIdx][step] ||= [];
    chord.push({ semi: note.key - base, v: note.vel, len: Math.max(1, Math.min(pattern.length - step, Math.round(note.lengthBeats * 4))) });
  }
  const who = `${target.name} ${target.instrument}`;
  const role = guessPartRole(notes.map((n, i) => ({ ...n, id: String(i) })), who);
  pattern.melo[padIdx] = performMeloLane(pattern.melo[padIdx], { role, traits: personaFor(playerForPart(who, role)).traits, seed: Date.now() & 0x7fffffff });
  doc.patterns.push(pattern);
  return { padIdx, trackId, patternId: pattern.id };
}
export function insertGeneratedAudio(doc: GrooveDoc, sample: SampleRef, target: InsertTarget, asSample: boolean) {
  validateTarget(target);
  if (!Number.isFinite(sample.durationSec) || sample.durationSec <= 0) throw new Error('Generated audio has no valid duration');
  if (asSample) {
    let padIdx = firstEmptyPadIndex(doc.kit);
    if (padIdx < 0) padIdx = addPadBank(doc.kit);
    Object.assign(doc.kit[padIdx], { source: 'sample', sample, name: target.name.slice(0, 18), empty: false, startSec: 0, pitchSemis: 0 });
    return { padIdx };
  }
  const existing = target.trackId ? doc.arrangement.find(track => track.id === target.trackId && track.kind === 'audio') : undefined;
  if (target.trackId && !existing) throw new Error('The destination audio track is no longer available');
  const track = existing || { id: grooveUid(), kind: 'audio' as const, name: target.name, color: '#D0BCFF', mute: false, solo: false, gainDb: 0, pan: 0, clips: [] };
  if (!existing) doc.arrangement.push(track);
  const clip = { id: grooveUid(), startBeats: target.startBeats, lengthBeats: sample.durationSec * doc.bpm / 60,
    audio: { sampleKey: sample.key, name: sample.name, offsetSec: 0, gainDb: 0, durationSec: sample.durationSec } };
  track.clips.push(clip);
  return { trackId: track.id, clipId: clip.id };
}
