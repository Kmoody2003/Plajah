// Pure real-time performance kinematics solver linking MIDI notes, pitch bend, velocity,
// mod wheel, and live audio energy to 3D CAD mechanical actuators, translucent player hands,
// and volumetric acoustic airflow streams.

export type PerformerArchetype =
  | 'brass-valves'
  | 'brass-slide'
  | 'woodwind-keys'
  | 'keyboard'
  | 'bowed-string'
  | 'plucked-string'
  | 'percussion'
  | 'synth';

export interface FingerTarget {
  id: string;
  hand: 'left' | 'right';
  pos: [number, number, number];
  active: boolean;
}

export interface PerformanceKinematicsInput {
  archetype: PerformerArchetype;
  heldNotes: number[];
  lastNote: number;
  velocity: number;
  energy: number;
  pitchBend: number; // -1..1
  modWheel: number;  // 0..1
  timeSec: number;
  excitePos?: number;   // 0..1 along string / bow point
  strikePos?: number;   // 0..1 radial drum strike position
  strikeAngle?: number; // 0..1 angular drum strike position
  drumRadius?: number;
  drumHeight?: number;
  isFlute?: boolean;
  isSax?: boolean;
}

export interface PerformanceKinematicsState {
  archetype: PerformerArchetype;
  activeMidi: number;
  /** True while actively blown/bowed/struck or recently sounding. */
  isEngaged: boolean;
  /** Brass valve depressions [1st, 2nd, 3rd] matching real chromatic brass fingerings. */
  brassValves: [boolean, boolean, boolean];
  /** Trombone slide extension 0..1 (7 chromatic positions + bend gliss). */
  slideExtension: number;
  /** Six woodwind key cup closure booleans (key_0..key_5). */
  woodwindKeys: [boolean, boolean, boolean, boolean, boolean, boolean];
  /** Depressed visual piano/tine/synth keys (14 modeled keys, C4-D5 chromatic/diatonic span). */
  pressedKeyIndices: number[];
  /** Target guitar/violin string index (0..5 or 0..3) and normalized fret fraction (0..0.75). */
  stringIndex: number;
  fretNorm: number;
  /** Translucent performer fingertip + palm targets in model meters. */
  fingers: FingerTarget[];
  /** Volumetric acoustic airflow emission origin, unit vector, and intensity (0..1). */
  airflow: {
    active: boolean;
    intensity: number;
    origin: [number, number, number];
    dir: [number, number, number];
    spread: number;
  };
}

// Chromatic pitch class (0 = C .. 11 = B) mapped to standard Bb brass 3-valve combinations [V1, V2, V3]
const BRASS_VALVE_FINGERINGS: ReadonlyArray<[boolean, boolean, boolean]> = [
  [false, false, false], // C  (Open)
  [true, true, true],    // C# (1-2-3)
  [true, false, true],   // D  (1-3)
  [false, true, true],   // Eb (2-3)
  [true, true, false],   // E  (1-2)
  [true, false, false],  // F  (1)
  [false, true, false],  // F# (2)
  [false, false, false], // G  (Open)
  [false, true, true],   // Ab (2-3)
  [true, true, false],   // A  (1-2)
  [true, false, false],  // Bb (1)
  [false, true, false],  // B  (2)
];

// Six tone-hole key closures for flute / clarinet / sax / reed across pitch classes
const WOODWIND_KEY_FINGERINGS: ReadonlyArray<[boolean, boolean, boolean, boolean, boolean, boolean]> = [
  [true, true, true, true, true, true],     // C
  [true, true, true, true, true, false],    // C#
  [true, true, true, true, false, false],   // D
  [true, true, true, true, true, false],    // Eb
  [true, true, true, false, false, false],  // E
  [true, true, true, true, false, false],   // F
  [true, true, false, true, false, false],  // F#
  [true, true, true, false, false, false],  // G
  [true, true, false, false, true, false],  // Ab
  [true, true, false, false, false, false], // A
  [true, false, false, true, false, false], // Bb
  [true, false, false, false, false, false],// B
];

export function resolveLyraArchetype(model: string, variant = 0): PerformerArchetype {
  if (model === 'trumpet') return 'brass-valves';
  if (model === 'brass') return variant === 2 || variant === 3 ? 'brass-slide' : 'brass-valves';
  if (model === 'sax' || model === 'flute' || model === 'clarinet' || model === 'reed') return 'woodwind-keys';
  if (model === 'piano' || model === 'tine') return 'keyboard';
  if (model === 'violin') return 'bowed-string';
  return 'plucked-string';
}

export function resolveTonosArchetype(excite: string): PerformerArchetype {
  return excite === 'bow' || excite === 'wheel' ? 'bowed-string' : 'plucked-string';
}

/**
 * Compute continuous 3D performer kinematics for valves, slides, keys, frets, hands, and airflow.
 */
export function computePerformanceKinematics(input: PerformanceKinematicsInput): PerformanceKinematicsState {
  const {
    archetype,
    heldNotes,
    lastNote,
    velocity,
    energy,
    pitchBend,
    modWheel,
    timeSec,
    excitePos = 0.28,
    strikePos = 0.62,
    strikeAngle = 0.5,
    drumRadius = 0.24,
    drumHeight = 0.36,
    isFlute = false,
    isSax = false,
  } = input;

  const isHeld = heldNotes.length > 0;
  const activeMidi = isHeld ? heldNotes[heldNotes.length - 1]! : lastNote;
  const pitchClass = ((Math.round(activeMidi) % 12) + 12) % 12;
  const isEngaged = isHeld || energy > 0.03;

  const brassValves: [boolean, boolean, boolean] = isEngaged && archetype === 'brass-valves'
    ? BRASS_VALVE_FINGERINGS[pitchClass]!
    : [false, false, false];

  // Trombone slide 7 positions from chromatic descent below Bb harmonic series
  const rawPos = ((10 - pitchClass + 12) % 12) % 7;
  const slideBase = archetype === 'brass-slide' ? rawPos / 6 : 0;
  const slideExtension = Math.max(0, Math.min(1, slideBase - pitchBend * 0.22));

  const woodwindKeys: [boolean, boolean, boolean, boolean, boolean, boolean] =
    isEngaged && archetype === 'woodwind-keys'
      ? WOODWIND_KEY_FINGERINGS[pitchClass]!
      : [false, false, false, false, false, false];

  // Map held MIDI notes onto 14 modeled keys spanning C4 (60)..D5 (74)
  const pressedSet = new Set<number>();
  for (const n of heldNotes) {
    const idx = ((Math.round(n) - 48) % 14 + 14) % 14;
    pressedSet.add(idx);
  }
  const pressedKeyIndices = Array.from(pressedSet).sort((a, b) => a - b);

  // String & fret mapping across E2..E5
  const clampedNote = Math.max(40, Math.min(88, activeMidi));
  const stringIndex = Math.max(0, Math.min(5, Math.floor((clampedNote - 40) / 5)));
  const fretNum = Math.max(0, Math.min(15, Math.round(clampedNote - (40 + stringIndex * 5))));
  const fretNorm = fretNum / 15;

  const fingers: FingerTarget[] = [];
  let airflow: PerformanceKinematicsState['airflow'] = {
    active: false,
    intensity: 0,
    origin: [0, 0, 0],
    dir: [-1, 0, 0],
    spread: 0.2,
  };

  const breathIntensity = isEngaged
    ? Math.max(0.15, Math.min(1, Math.max(energy, isHeld ? Math.max(0.35, velocity) : 0) * (1 + 0.25 * modWheel)))
    : 0;

  if (archetype === 'brass-valves') {
    for (let v = 0; v < 3; v++) {
      const pressed = brassValves[v]!;
      fingers.push({
        id: `brass_v${v}`,
        hand: 'right',
        pos: [-0.06 + v * 0.042, 0.008, pressed ? 0.088 : 0.114],
        active: pressed,
      });
    }
    fingers.push({
      id: 'brass_lh_thumb',
      hand: 'left',
      pos: [0.06, -0.025, 0.018],
      active: isEngaged,
    });
    airflow = {
      active: breathIntensity > 0.04,
      intensity: breathIntensity,
      origin: [-0.31, 0, 0.08],
      dir: [-1, 0, 0.06],
      spread: 0.26,
    };
  } else if (archetype === 'brass-slide') {
    const ext = slideExtension * 0.24;
    fingers.push({
      id: 'slide_rh_grip',
      hand: 'right',
      pos: [0.24 + ext, -0.02, 0.045],
      active: isEngaged,
    });
    fingers.push({
      id: 'slide_lh_brace',
      hand: 'left',
      pos: [-0.02, 0.025, 0.035],
      active: isEngaged,
    });
    airflow = {
      active: breathIntensity > 0.04,
      intensity: breathIntensity,
      origin: [-0.33, 0, 0.08],
      dir: [-1, 0, 0.04],
      spread: 0.30,
    };
  } else if (archetype === 'woodwind-keys') {
    for (let k = 0; k < 6; k++) {
      const closed = woodwindKeys[k]!;
      const p: [number, number, number] = isSax
        ? [0.056, 0, 0.055 - k * 0.044]
        : [-0.16 + k * 0.058, 0, closed ? 0.024 : 0.042];
      fingers.push({
        id: `ww_k${k}`,
        hand: k < 3 ? 'left' : 'right',
        pos: p,
        active: closed,
      });
    }
    airflow = isSax
      ? {
          active: breathIntensity > 0.04,
          intensity: breathIntensity,
          origin: [0.16, 0, -0.03],
          dir: [0.35, 0, 0.94],
          spread: 0.34,
        }
      : isFlute
        ? {
            active: breathIntensity > 0.04,
            intensity: breathIntensity,
            origin: [-0.26, 0.012, 0.02],
            dir: [0.85, 0.2, 0.35],
            spread: 0.18,
          }
        : {
            active: breathIntensity > 0.04,
            intensity: breathIntensity,
            origin: [0.36, 0, 0],
            dir: [1, 0, 0.06],
            spread: 0.25,
          };
  } else if (archetype === 'keyboard') {
    const activeList = pressedKeyIndices.length > 0 ? pressedKeyIndices : (isEngaged ? [((Math.round(activeMidi) - 48) % 14 + 14) % 14] : []);
    // Show smooth hovering left & right finger cluster tracking active keys
    const leftKey = activeList.find((k) => k < 7) ?? 3;
    const rightKey = activeList.find((k) => k >= 7) ?? 9;
    const kx = (idx: number) => -0.325 + idx * 0.05;
    for (let f = 0; f < 3; f++) {
      const lk = Math.max(0, Math.min(13, leftKey + f - 1));
      const rk = Math.max(0, Math.min(13, rightKey + f - 1));
      const lDown = isEngaged && activeList.includes(lk);
      const rDown = isEngaged && activeList.includes(rk);
      fingers.push({
        id: `kb_lh_${f}`,
        hand: 'left',
        pos: [kx(lk), -0.31, lDown ? 0.056 : 0.088],
        active: lDown,
      });
      fingers.push({
        id: `kb_rh_${f}`,
        hand: 'right',
        pos: [kx(rk), -0.31, rDown ? 0.056 : 0.088],
        active: rDown,
      });
    }
  } else if (archetype === 'bowed-string') {
    const neckX = 0.06 + (1 - fretNorm) * 0.20;
    const strY = -0.016 + (0.032 * (stringIndex % 4)) / 3;
    const vibOffset = isEngaged ? Math.sin(timeSec * 28) * 0.005 * (0.3 + modWheel) : 0;
    fingers.push({
      id: 'bow_lh_stop',
      hand: 'left',
      pos: [neckX + vibOffset, strY * 0.72, isEngaged ? 0.034 : 0.052],
      active: isEngaged,
    });
    const bowSweep = isEngaged ? Math.sin(timeSec * 3.8) * 0.10 : 0;
    const bowX = -0.14 + excitePos * 0.12;
    fingers.push({
      id: 'bow_rh_frog',
      hand: 'right',
      pos: [bowX, -0.16 + bowSweep, 0.068],
      active: isEngaged,
    });
  } else if (archetype === 'plucked-string') {
    const neckX = 0.04 + (1 - fretNorm) * 0.34;
    const strY = -0.022 + (0.044 * (stringIndex % 6)) / 5;
    fingers.push({
      id: 'pluck_lh_fret',
      hand: 'left',
      pos: [neckX, strY * 0.75, isEngaged ? 0.034 : 0.055],
      active: isEngaged,
    });
    const pluckX = -0.24 + excitePos * 0.16;
    const pluckStroke = isEngaged ? Math.sin(Math.min(Math.PI, timeSec * 14)) * 0.016 : 0;
    fingers.push({
      id: 'pluck_rh_pick',
      hand: 'right',
      pos: [pluckX, strY + pluckStroke, isEngaged ? 0.036 : 0.062],
      active: isEngaged,
    });
  } else if (archetype === 'percussion') {
    const ang = strikeAngle * Math.PI - Math.PI;
    const rad = Math.max(0.02, Math.min(0.95, strikePos)) * drumRadius * 0.92;
    const sx = rad * Math.cos(ang);
    const sy = rad * Math.sin(ang);
    const hitDrop = energy > 0.1 ? Math.max(0, 0.045 - energy * 0.038) : 0.062;
    fingers.push({
      id: 'perc_rh_strike',
      hand: 'right',
      pos: [sx, sy, drumHeight + hitDrop],
      active: isEngaged,
    });
    fingers.push({
      id: 'perc_lh_rim',
      hand: 'left',
      pos: [-sx * 0.65, -sy * 0.65, drumHeight + 0.055],
      active: isHeld,
    });
  } else if (archetype === 'synth') {
    const keysToShow = pressedKeyIndices.length > 0
      ? pressedKeyIndices.slice(0, 4)
      : [(((Math.round(activeMidi) - 48) % 14) + 14) % 14];
    keysToShow.forEach((rawIdx, i) => {
      const idx = Math.max(0, Math.min(13, rawIdx));
      const kx = -0.325 + idx * 0.05;
      fingers.push({
        id: i === 0 ? 'synth_rh_key' : `synth_rh_key_${i}`,
        hand: 'right',
        pos: [kx, -0.30, isEngaged ? 0.056 : 0.086],
        active: isEngaged,
      });
    });
    fingers.push({
      id: 'synth_lh_mod',
      hand: 'left',
      pos: [-0.06 + pitchBend * 0.04, -0.07 + modWheel * 0.13, 0.138],
      active: Math.abs(pitchBend) > 0.02 || modWheel > 0.05 || isEngaged,
    });
  }

  return {
    archetype,
    activeMidi,
    isEngaged,
    brassValves,
    slideExtension,
    woodwindKeys,
    pressedKeyIndices,
    stringIndex,
    fretNorm,
    fingers,
    airflow,
  };
}
