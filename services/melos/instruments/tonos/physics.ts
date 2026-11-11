// TONOS string physics readout — the same equations as string_for() in tonos.rs, so the panel can
// show the string a note is actually played on: its length, tension, gauge and inharmonicity.

import { TONOS_INSTRUMENTS, type TonosInstrument } from './catalog';
import { TONOS_MATERIALS } from './params';

export interface TonosString {
  /** Sounding pitch (Hz). */
  f: number;
  /** Which open string (MIDI) a necked instrument stops; null for one-string-per-note. */
  openNote: number | null;
  lengthOpen: number;
  lengthStopped: number;
  tension: number;
  /** Outer diameter (m). */
  diameter: number;
  /** Total mass / core mass: > 1 means the string is wound. */
  wound: number;
  /** Wave speed (m/s). */
  waveSpeed: number;
  /** Fletcher's inharmonicity coefficient. */
  inharmonicity: number;
  harmonic: number;
}

const midiToHz = (n: number) => 440 * 2 ** ((n - 69) / 12);
const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

export function stringFor(instIndex: number, note: number, tensionKnob = 0.5, materialKnob = 0): TonosString {
  const inst: TonosInstrument = TONOS_INSTRUMENTS[Math.max(0, Math.min(TONOS_INSTRUMENTS.length - 1, Math.round(instIndex)))];
  const mat = TONOS_MATERIALS[materialKnob >= 1 ? Math.min(TONOS_MATERIALS.length - 1, Math.round(materialKnob) - 1) : inst.material];
  const f = midiToHz(note);
  let t = inst.tension * 2 ** ((tensionKnob - 0.5) * 2);
  let lOpen = inst.length, fOpen = f, lStop = inst.length, openNote: number | null = null, harmonic = 1;
  if (inst.excite === 'harmonic') {
    const fRest = midiToHz(inst.reference);
    let best = 2, err = Infinity;
    for (let n = 2; n <= 7; n++) { const r = Math.abs(Math.log(f / (n * fRest))); if (r < err) { err = r; best = n; } }
    harmonic = best;
    fOpen = f / best;
    t *= (fOpen / fRest) ** 2;
  } else if (!inst.opens.length) {
    lOpen = lStop = Math.min(2.2, Math.max(0.06, inst.length * 2 ** (-inst.alpha * (note - inst.reference) / 12)));
  } else {
    let open = inst.opens[0];
    for (const o of inst.opens) if (o <= note + 0.01) open = o;
    openNote = open;
    const fo = midiToHz(open);
    if (f < fo) { t *= (f / fo) ** 2; } else { fOpen = fo; lStop = Math.max(inst.length * 0.05, inst.length * fo / f); }
  }
  const c = 2 * lOpen * fOpen;
  const mu = t / (c * c);
  const d = Math.sqrt((4 * mu) / (Math.PI * mat.rho));
  const bPlain = (Math.PI ** 3 * mat.e * d ** 4) / (64 * t * lStop * lStop);
  const wound = mat.e > 2e9 && bPlain > 6e-4 ? Math.min(8, Math.max(1, Math.sqrt(bPlain / 3e-4))) : 1;
  const dc = Math.sqrt((4 * mu) / wound / (Math.PI * mat.rho));
  const b = (Math.PI ** 3 * mat.e * dc ** 4) / (64 * t * lStop * lStop);
  return { f, openNote, lengthOpen: lOpen, lengthStopped: lStop, tension: t, diameter: d, wound, waveSpeed: c, inharmonicity: b, harmonic };
}

/** "0.61 m nylon at 45 N · 0.92 mm · B 3×10⁻⁴" — one line for the panel. */
export function describeString(instIndex: number, note: number, tensionKnob = 0.5, materialKnob = 0): string {
  const inst = TONOS_INSTRUMENTS[Math.round(instIndex)] ?? TONOS_INSTRUMENTS[0];
  const mat = TONOS_MATERIALS[materialKnob >= 1 ? Math.round(materialKnob) - 1 : inst.material];
  const s = stringFor(instIndex, note, tensionKnob, materialKnob);
  const exp = s.inharmonicity > 0 ? Math.floor(Math.log10(s.inharmonicity)) : 0;
  const mant = s.inharmonicity / 10 ** exp;
  const sup = (n: number) => String(n).replace(/-/g, '⁻').replace(/\d/g, (x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(x)]);
  const where = s.harmonic > 1 ? `harmonic ${s.harmonic} of ` : s.openNote !== null && s.lengthStopped < s.lengthOpen - 1e-4 ? 'stopped ' : '';
  return `${where}${s.lengthStopped.toFixed(2)} m of ${s.wound > 1.01 ? `wound ${mat.name.toLowerCase()}` : mat.name.toLowerCase()} at ${s.tension.toFixed(0)} N · ⌀ ${(s.diameter * 1000).toFixed(2)} mm · B ${mant.toFixed(1)}×10${sup(exp)}`;
}

export { hzToMidi, midiToHz };
