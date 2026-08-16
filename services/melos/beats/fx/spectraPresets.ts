// Spectra presets — the curves great engineers reach for, as data, with the WHY.
//
// Not random shapes: each is a named move that solves a real problem (the Pultec low trick, a vocal
// presence lift, a de-ess, a mud cut), with a one-line rationale that teaches while it works — the
// ambient-teaching principle, applied to the mixer. Grouped by what you're EQ-ing so the browser
// reads by intent: master, vocals, drums, bass, instruments, FX/cleanup.

import { bandId, type SpectraBand } from './spectraEq';

export interface SpectraPreset {
  name: string;
  category: 'Master' | 'Vocals' | 'Drums' | 'Bass' | 'Instruments' | 'Cleanup';
  description: string;
  bands: () => SpectraBand[];
}

const b = (freq: number, gain: number, q: number, type: SpectraBand['type'], dynamic?: SpectraBand['dynamic']): SpectraBand =>
  ({ id: bandId(), freq, gain, q, type, on: true, dynamic });

export const SPECTRA_PRESETS: SpectraPreset[] = [
  // ── Master ──
  {
    name: 'Pultec Low Trick', category: 'Master',
    description: 'Boost and cut the lows at once (60 Hz shelf up, 200 Hz bell down) — the classic Pultec move gives weight without mud.',
    bands: () => [b(60, 3.5, 0.6, 'lowshelf'), b(200, -3, 1.2, 'bell'), b(12000, 2, 0.6, 'highshelf')],
  },
  {
    name: 'Baxandall Tilt', category: 'Master',
    description: 'A gentle wide low shelf down and high shelf up — tilts the whole mix brighter without touching the mids. Transparent air.',
    bands: () => [b(120, -1.5, 0.5, 'lowshelf'), b(8000, 2.5, 0.5, 'highshelf')],
  },
  {
    name: 'Master Glue Clean', category: 'Master',
    description: 'A tiny 300 Hz dynamic cut that only pulls when the mix gets boxy, plus a soft air lift. Cleans without dulling.',
    bands: () => [b(300, 0, 1.4, 'bell', { on: true, threshold: -20, range: -2.5 }), b(30, 0, 0.7, 'highpass'), b(14000, 1.5, 0.6, 'highshelf')],
  },
  // ── Vocals ──
  {
    name: 'Vocal Presence', category: 'Vocals',
    description: 'High-pass the rumble, dip 400 Hz mud, lift 4 kHz for intelligibility, and a little air. The everyday vocal chain start.',
    bands: () => [b(90, 0, 0.7, 'highpass'), b(420, -2.5, 1.2, 'bell'), b(4000, 3, 1.0, 'bell'), b(11000, 2.5, 0.7, 'highshelf')],
  },
  {
    name: 'De-Ess 7k', category: 'Vocals',
    description: 'A dynamic cut at 7 kHz that only clamps on harsh sibilants — the transparent de-esser, done as a dynamic band.',
    bands: () => [b(7000, 0, 3.5, 'bell', { on: true, threshold: -22, range: -8 })],
  },
  {
    name: 'Radio Vocal', category: 'Vocals',
    description: 'Tighter low-cut, a scooped 500 Hz, and a bold presence + air. Cuts through a dense mix like a broadcast voice.',
    bands: () => [b(120, 0, 0.8, 'highpass'), b(500, -3.5, 1.3, 'bell'), b(3000, 2.5, 1.0, 'bell'), b(9000, 4, 0.7, 'highshelf')],
  },
  // ── Drums ──
  {
    name: 'Kick Punch', category: 'Drums',
    description: 'Weight at 60 Hz, cut the 350 Hz box, and a click at 4 kHz so the beater cuts through. Punch you feel and hear.',
    bands: () => [b(60, 3, 1.0, 'bell'), b(350, -3, 1.4, 'bell'), b(4000, 2.5, 1.2, 'bell')],
  },
  {
    name: 'Snare Crack', category: 'Drums',
    description: 'Body at 200 Hz, a dynamic 900 Hz honk-tamer, and 5 kHz crack. Makes a flat snare snap.',
    bands: () => [b(200, 2, 1.2, 'bell'), b(900, 0, 1.6, 'bell', { on: true, threshold: -18, range: -3 }), b(5000, 3, 1.0, 'bell')],
  },
  {
    name: 'Drum Bus Air', category: 'Drums',
    description: 'High-pass the sub, tame 500 Hz build-up dynamically, and open the top. Glues an overhead/room bus.',
    bands: () => [b(40, 0, 0.7, 'highpass'), b(500, 0, 1.2, 'bell', { on: true, threshold: -16, range: -2.5 }), b(10000, 2.5, 0.6, 'highshelf')],
  },
  // ── Bass ──
  {
    name: 'Bass Focus', category: 'Bass',
    description: 'Sub weight at 50 Hz, clear the 250 Hz mud, and add 800 Hz definition so the bass reads on small speakers.',
    bands: () => [b(50, 2, 0.8, 'lowshelf'), b(250, -2.5, 1.3, 'bell'), b(800, 2, 1.2, 'bell')],
  },
  {
    name: '808 Tame', category: 'Bass',
    description: 'A dynamic 60 Hz that only reins in when the 808 booms too hard, keeping the sub even across notes.',
    bands: () => [b(60, 0, 1.0, 'bell', { on: true, threshold: -14, range: -4 }), b(30, 0, 0.7, 'highpass')],
  },
  // ── Instruments ──
  {
    name: 'Guitar Cut', category: 'Instruments',
    description: 'Low-cut the boom, scoop 400 Hz to sit under vocals, presence at 3 kHz. Room for everything else.',
    bands: () => [b(100, 0, 0.7, 'highpass'), b(400, -3, 1.2, 'bell'), b(3000, 2, 1.0, 'bell')],
  },
  {
    name: 'Piano Clarity', category: 'Instruments',
    description: 'Trim 300 Hz build-up, lift 2 kHz for hammer detail, and air. Keeps a piano present without harshness.',
    bands: () => [b(300, -2, 1.2, 'bell'), b(2000, 2, 1.0, 'bell'), b(12000, 2, 0.6, 'highshelf')],
  },
  {
    name: 'Synth Wide Air', category: 'Instruments',
    description: 'Gentle low-cut and a big air shelf — lets a pad or lead shimmer on top without eating the midrange.',
    bands: () => [b(80, 0, 0.7, 'highpass'), b(10000, 4, 0.5, 'highshelf')],
  },
  // ── Cleanup ──
  {
    name: 'Mud Cut', category: 'Cleanup',
    description: 'A single 250 Hz dip — the first move on almost anything that sounds thick. Start here, then decide.',
    bands: () => [b(250, -3.5, 1.3, 'bell')],
  },
  {
    name: 'Harsh Tamer', category: 'Cleanup',
    description: 'A dynamic 3 kHz cut that only acts on harsh peaks — fixes ear-fatiguing digital edge without dulling.',
    bands: () => [b(3000, 0, 2.5, 'bell', { on: true, threshold: -20, range: -5 })],
  },
  {
    name: 'Rumble Kill', category: 'Cleanup',
    description: 'A steep high-pass at 80 Hz — removes room rumble, mic handling and DC that steals headroom from the mix.',
    bands: () => [b(80, 0, 0.9, 'highpass')],
  },
];
