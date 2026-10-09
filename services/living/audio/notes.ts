// Note names <-> MIDI numbers. 'C4' = 60 = middle C. Accepts sharps (#), flats (b), and plain MIDI numbers or numeric strings.

const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Returns the MIDI number for a note name or number, or null for 'x' / rests / garbage. */
export function noteToMidi(n: string | number | null | undefined): number | null {
  if (n == null) return null;
  if (typeof n === 'number') return Number.isFinite(n) ? n : null;
  const s = n.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^([A-Ga-g])([#b♯♭]*)(-?\d+)$/.exec(s);
  if (!m) return null;
  let semis = BASE[m[1].toUpperCase()];
  for (const ch of m[2]) semis += ch === '#' || ch === '♯' ? 1 : -1;
  return (parseInt(m[3], 10) + 1) * 12 + semis;
}

export function midiToName(m: number): string {
  const r = Math.round(m);
  return `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

export const isUnpitched = (n: string | number): boolean => typeof n === 'string' && /^(x|X)$/.test(n.trim());
