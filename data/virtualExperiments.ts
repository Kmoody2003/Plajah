/**
 * Virtual experiments: simulated labs a student can run as many times as they like, with realistic
 * measurement noise, to practise the whole investigation loop (question, hypothesis, variables, data,
 * graph, conclusion). The data are SIMULATED from well-known physical laws and always labelled that
 * way; they are never presented as real measurements. Each model records its true law so a teacher
 * (or the student, after concluding) can compare what the data suggested with what is true.
 */
export type Rng = () => number;
export interface ExperimentVar { name: string; unit: string; min: number; max: number; step: number; label: string }
export interface VirtualExperiment {
  id: string; title: string; emoji: string; question: string; background: string;
  /** What the student sets. */
  independent: ExperimentVar;
  /** What the student measures. */
  dependent: { name: string; unit: string; label: string; decimals: number };
  /** Variables a fair test must hold constant. */
  controls: string[];
  /** The true relationship, revealed after the student draws a conclusion. */
  truth: { law: string; explanation: string; linearise?: { x: 'none' | 'square' | 'sqrt' | 'ln' | 'inverse'; y: 'none' | 'square' | 'sqrt' | 'ln' | 'inverse'; why: string } };
  /** Standard deviation of the measurement noise, in dependent units. */
  noise: number;
  /** Noise-free model value. */
  model: (x: number) => number;
}

const G = 9.81;

export const VIRTUAL_EXPERIMENTS: VirtualExperiment[] = [
  {
    id: 'pendulum', title: 'The pendulum', emoji: '⏱️', question: 'How does the length of a pendulum change how long one swing takes?',
    background: 'A mass swings on a string. You can change the string length and time one full swing (the period) with a stopwatch.',
    independent: { name: 'Length', unit: 'm', min: 0.1, max: 1.6, step: 0.1, label: 'String length' },
    dependent: { name: 'Period', unit: 's', label: 'Time for one swing', decimals: 3 },
    controls: ['Mass of the bob', 'Starting angle (small, about 10 degrees)', 'Same stopwatch and method'],
    truth: { law: 'T = 2π √(L / g)', explanation: 'For small swings the period depends on the square root of the length and not on the mass, so T squared is proportional to L.', linearise: { x: 'none', y: 'square', why: 'Plotting T² against L gives a straight line with slope 4π²/g ≈ 4.02 s²/m.' } },
    noise: 0.02, model: L => 2 * Math.PI * Math.sqrt(L / G),
  },
  {
    id: 'spring', title: 'The spring', emoji: '🧲', question: 'How does the mass hanging on a spring change how far it stretches?',
    background: 'A spring hangs from a stand. You add masses and measure how far the spring stretches beyond its resting length.',
    independent: { name: 'Mass', unit: 'g', min: 50, max: 500, step: 50, label: 'Hanging mass' },
    dependent: { name: 'Extension', unit: 'cm', label: 'Stretch of the spring', decimals: 2 },
    controls: ['The same spring', 'Not stretching past its elastic limit', 'Measuring from the same resting point'],
    truth: { law: 'F = k x (Hooke\'s law)', explanation: 'Within the elastic limit the force is proportional to the extension. With k = 40 N/m, each 100 g adds about 2.45 cm.', linearise: undefined },
    noise: 0.12, model: m => ((m / 1000) * G) / 40 * 100,
  },
  {
    id: 'cooling', title: 'The cooling drink', emoji: '☕', question: 'How does the temperature of a hot drink change over time as it cools in a room?',
    background: 'A cup of hot water starts at 90 °C in a 22 °C room. You read a thermometer at set times.',
    independent: { name: 'Time', unit: 'min', min: 0, max: 40, step: 5, label: 'Minutes since the start' },
    dependent: { name: 'Temperature', unit: '°C', label: 'Water temperature', decimals: 1 },
    controls: ['Room temperature', 'Same cup and amount of water', 'Not stirring or adding anything'],
    truth: { law: 'T(t) = T_room + (T_0 - T_room) e^(-kt)', explanation: 'Newton\'s law of cooling: the hotter the drink is above the room, the faster it cools, so it falls quickly at first and then levels off (exponential decay, k = 0.05 per minute here).', linearise: { x: 'none', y: 'ln', why: 'Plotting ln(T - 22) against time gives a straight line with slope -k. Subtract the room temperature first.' } },
    noise: 0.4, model: t => 22 + 68 * Math.exp(-0.05 * t),
  },
  {
    id: 'projectile', title: 'The launcher', emoji: '🎯', question: 'How does the launch angle change how far a ball travels?',
    background: 'A launcher fires a ball at 15 m/s from the ground. You change the angle and measure how far away it lands.',
    independent: { name: 'Angle', unit: '°', min: 10, max: 80, step: 10, label: 'Launch angle' },
    dependent: { name: 'Range', unit: 'm', label: 'Distance travelled', decimals: 2 },
    controls: ['Launch speed', 'Launch height (ground level)', 'Same ball, no wind'],
    truth: { law: 'R = v² sin(2θ) / g', explanation: 'The range is greatest at 45 degrees and is symmetric: angles that add up to 90 degrees (such as 30 and 60) land at the same place.', linearise: undefined },
    noise: 0.25, model: a => (15 * 15 * Math.sin((2 * a * Math.PI) / 180)) / G,
  },
];

export const experimentById = (id: string) => VIRTUAL_EXPERIMENTS.find(e => e.id === id);

/** Box-Muller normal noise from a uniform RNG. */
export function gauss(r: Rng): number { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** One simulated trial: the model value plus measurement noise, rounded to the instrument's resolution. */
export function runTrial(e: VirtualExperiment, x: number, r: Rng = Math.random): number {
  const v = e.model(x) + gauss(r) * e.noise; const f = 10 ** e.dependent.decimals;
  return Math.round(v * f) / f;
}

export const seededRandom = (seed: number): Rng => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
