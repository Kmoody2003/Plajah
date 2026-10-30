// Melos Beats — the project key. One tonic + scale for the whole song (`doc.key`), read by the
// piano roll's scale highlighting/snap, hum transcription, the generators and the council, so
// nothing has to guess a key from metadata. Scale ids are theory.ts SCALES ids.

import type { GrooveDoc, SongKey } from './grooveDoc';
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP, SCALES, nameToPc, scaleById, scalePitchClasses } from '../theory';

export const DEFAULT_SONG_KEY: SongKey = { tonic: 0, scale: 'major' };

// Keys conventionally spelled with flats (tonic pc → prefer flats) for major / minor families.
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);   // F Bb Eb Ab Db Gb
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);   // D G C F Bb Eb minor

export function prefersFlats(k: SongKey): boolean {
  // Minor-ish = a minor third and no major third, so the whole library spells itself.
  const iv = scaleById(k.scale).intervals;
  return iv.includes(3) && !iv.includes(4) ? FLAT_MINOR.has(k.tonic) : FLAT_MAJOR.has(k.tonic);
}

export function tonicName(k: SongKey): string {
  return (prefersFlats(k) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((k.tonic % 12) + 12) % 12];
}

/** "D minor", "F# Dorian" — for headers, prompts and the council brief. */
export function keyLabel(k: SongKey): string {
  const s = scaleById(k.scale);
  const name = s.id === 'minor' ? 'minor' : s.id === 'major' ? 'major' : s.name;
  return `${tonicName(k)} ${name}`;
}

/** Parse loose key text: "D Minor", "f#m", "Bb", "E dorian", "C# harmonic minor". */
export function parseKey(text: string | undefined | null): SongKey | null {
  if (!text) return null;
  const m = text.trim().match(/^([A-Ga-g])\s*([#b♯♭]?)\s*(.*)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
  const tonic = nameToPc(letter + acc) ?? 0;
  const rest = m[3].trim().toLowerCase();
  let scale = 'major';
  // A full scale name from the library wins ("D melodic minor", "A raga yaman").
  const named = SCALES.filter((s) => rest.length > 3 && s.name.toLowerCase().startsWith(rest)).sort((a, b) => a.name.length - b.name.length)[0];
  if (named && !/^(minor|major)$/.test(rest)) return { tonic, scale: named.id };
  if (/harmonic/.test(rest)) scale = 'harmonic-minor';
  else if (/pent/.test(rest)) scale = /min|^m/.test(rest) ? 'minor-pent' : 'major-pent';
  else if (/dorian/.test(rest)) scale = 'dorian';
  else if (/phrygian/.test(rest)) scale = 'phrygian';
  else if (/lydian/.test(rest)) scale = 'lydian';
  else if (/mixolydian/.test(rest)) scale = 'mixolydian';
  else if (/locrian/.test(rest)) scale = 'locrian';
  else if (/blues/.test(rest)) scale = 'blues';
  else if (/^(m|min|minor|aeolian)\b/.test(rest) || rest === 'm') scale = 'minor';
  return { tonic, scale };
}

/** The doc's key: explicit `doc.key`, else the showcase template's key text, else null (unset). */
export function docKey(doc: GrooveDoc): SongKey | null {
  if (doc.key && Number.isFinite(doc.key.tonic)) return doc.key;
  return parseKey(doc.showcaseMetadata?.keySignature);
}

/** The doc's key with a C-major fallback, for callers that always need one. */
export function docKeyOrDefault(doc: GrooveDoc): SongKey {
  return docKey(doc) ?? DEFAULT_SONG_KEY;
}

/** 12-entry in-scale lookup for the doc key (piano-roll row shading, snap). */
export function keyPitchClasses(k: SongKey): boolean[] {
  return scalePitchClasses(k.tonic, k.scale);
}
