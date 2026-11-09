// STEM track, grades 9–12 · Engineers. Original Plajah Academia writing; standards cited by code only.
//
// Scope & sequence (one school year, 36 weeks):
//   u01 Design under constraints           engineering   outline   HS-ETS1-1..4, tradeoff matrices
//   u02 Functions on the Bench             electronics-math  COMPLETE  linear → exponential → log → trig → stats → vectors
//   u03 Embedded Systems & IoT             technology    outline   CSTA 3A-AP-13..17; smart-lamp / sensor / pi recipes
//   u04 Data Science with Sensors          technology    outline   3A-DA-11/12, HSS.ID; the IoT station project
//   u05 Living Systems as Models           science       COMPLETE  Biology Lab: sir, lotka_volterra, michaelis_menten, repressilator
//   u06 CAD & Fabrication                  engineering   outline   tolerances, fits, print time and cost
//   u07 Energy & Power Systems             engineering   outline   HS-PS3-3, battery sizing, efficiency
//   u08 Soft & Wearable Engineering        engineering   outline   Sewing & Plush with conductive thread
//
// Every numeric practice item carries a `check`, recomputed by tests/stem.test.ts with independent formulas.

import type { Differentiation, SafetyNote, StemLesson, StemProject, StemUnit } from './types';

const C = (s: string) => `CCSS.MATH.CONTENT.${s}`;

const SIM_ONLY: SafetyNote = { level: 'sim-only', note: 'Simulation only in the Electronics Lab: nothing is powered on a bench, so no physical hazards. If a student wants to build it, use the low-voltage bench rules below.' };
const BENCH_LOW: SafetyNote = {
  level: 'low',
  note: 'Low-voltage DC only (a 5 V USB supply or an AA pack). Never connect anything to a wall outlet or mains. Electrolytic capacitors go in the right way round (stripe = negative) and are discharged through a resistor before handling. Eye protection on when anything is powered.',
};

const supportsCore = ['readAloud', 'chunk', 'extraTime'];

// ─────────────────────────────────────────────────────────────────────────────
// u02 · Functions on the Bench (electronics-math, complete)
// ─────────────────────────────────────────────────────────────────────────────

const L_LINEAR: StemLesson = {
  id: 'stem-912-u02-l1-linear-vi',
  title: 'Straight Lines You Can Measure: V–I Graphs and Resistance',
  minutes: 55,
  strands: ['math', 'science', 'technology'],
  objectives: [
    'I can find the slope of a voltage–current line from two measured points and interpret it as resistance in ohms.',
    'I can decide from a table whether a component behaves linearly (equal differences) or not.',
    'I can rearrange V = IR and use series and parallel rules to predict current before I measure it.',
  ],
  vocab: [
    ['slope', 'The constant rate of change of a linear function: rise over run, here volts per ampere.'],
    ['ohmic', 'A component whose V–I graph is a straight line through the origin, so its resistance does not change.'],
    ['equivalent resistance', 'The single resistor that would draw the same current as a whole network.'],
    ['rate of change', 'How much the output changes for each unit of input.'],
  ],
  hook: 'Two students sweep a supply from 0 to 5 V across two mystery parts: one gives a dead-straight line, the other bends like a hockey stick. Which one obeys a linear function, and what single number describes the straight one completely?',
  build: {
    title: 'Sweep a resistor and an LED in the Electronics Lab',
    steps: [
      'Open the Electronics Lab with the starter: a 0–5 V adjustable supply, a 220 Ω resistor and an ammeter in series.',
      'Run the DC sweep in five steps of 1 V and copy (I, V) pairs into a table with units.',
      'Plot V against I. Pick two points far apart and compute the slope; compare it to the resistor label.',
      'Swap the resistor for an LED plus a 150 Ω resistor and sweep again. Mark where the line stops being straight and say why that is not a linear function.',
      'Add a second resistor in parallel, predict the new slope, then re-run and check.',
    ],
    launch: { room: 'elec', prompt: 'A 0 to 5 volt adjustable DC supply driving a 220 ohm resistor through an ammeter, with a voltmeter across the resistor, for a V-I sweep; add an LED with a 150 ohm resistor as a second branch.' },
    materials: ['Optional bench version: breadboard, 5 V USB supply, 220 Ω and 470 Ω resistors, one LED, digital multimeter'],
  },
  worked: [
    {
      prompt: 'A sweep gives (I, V) = (0.010 A, 2.2 V) and (0.030 A, 6.6 V). Find the resistance and write the function V(I).',
      steps: [
        'Slope = ΔV / ΔI = (6.6 − 2.2) / (0.030 − 0.010) = 4.4 / 0.020.',
        '4.4 / 0.020 = 220, so the slope is 220 V/A, which is 220 Ω.',
        'Check the intercept: V = 220 × 0.010 = 2.2 ✓, so the line passes through the origin.',
      ],
      answer: 'R = 220 Ω and V(I) = 220·I: a proportional linear function.',
    },
    {
      prompt: 'Three resistors, 220 Ω, 330 Ω and 470 Ω, sit in series across 5 V. What current flows?',
      steps: ['Series resistances add: 220 + 330 + 470 = 1020 Ω.', 'I = V / R = 5 / 1020 ≈ 0.0049 A.'],
      answer: 'About 0.0049 A (4.9 mA).',
    },
  ],
  practice: [
    { q: 'A V–I sweep passes through (0.010 A, 2.2 V) and (0.030 A, 6.6 V). What is the slope, in ohms?', answer: '(6.6 − 2.2) / (0.030 − 0.010) = 220 Ω', value: 220, unit: 'Ω', check: { f: 'slope', args: [0.01, 2.2, 0.03, 6.6] }, level: 1 },
    { q: 'A different part reads (0.004 A, 2.0 V) and (0.016 A, 8.0 V). Find its resistance from the slope.', answer: '6.0 / 0.012 = 500 Ω', value: 500, unit: 'Ω', check: { f: 'slope', args: [0.004, 2.0, 0.016, 8.0] }, level: 1 },
    { q: 'What current flows through a 470 Ω resistor across 9 V (in a simulation)?', answer: 'I = 9 / 470 ≈ 0.0191 A (19.1 mA)', value: 0.0191, unit: 'A', check: { f: 'ohmI', args: [9, 470] }, level: 1 },
    { q: 'Find the equivalent resistance of 220 Ω, 330 Ω and 470 Ω in series.', answer: '220 + 330 + 470 = 1020 Ω', value: 1020, unit: 'Ω', check: { f: 'series', args: [220, 330, 470] }, level: 1 },
    { q: 'Find the equivalent resistance of 1000 Ω, 1000 Ω and 2200 Ω in parallel. Is it smaller than the smallest branch?', answer: '1 / (1/1000 + 1/1000 + 1/2200) ≈ 407 Ω, yes, smaller than 1000 Ω', value: 407.4, unit: 'Ω', check: { f: 'parallel', args: [1000, 1000, 2200] }, level: 2 },
    { q: 'An LED drops 2.0 V and should carry 0.020 A from a 5 V supply. Solve V = IR for the series resistor.', answer: 'R = (5 − 2.0) / 0.020 = 150 Ω', value: 150, unit: 'Ω', check: { f: 'ledR', args: [5, 2.0, 0.02] }, level: 2 },
    { q: 'A sensor reads 3.3 V across it while 0.0015 A flows. What resistance does it present at that moment?', answer: 'R = 3.3 / 0.0015 = 2200 Ω', value: 2200, unit: 'Ω', check: { f: 'ohmR', args: [3.3, 0.0015] }, level: 2 },
  ],
  exitTicket: {
    q: 'A table of an LED shows V rising by 0.2 V for currents 1 mA, 5 mA, 10 mA, 20 mA. Is V(I) linear? Explain using equal differences.',
    answer: 'No. Equal 0.2 V steps match unequal current steps (4, 5, 10 mA), so the rate of change is not constant; the graph curves and has no single slope.',
  },
  differentiation: {
    support: ['Pre-printed table with the ΔV and ΔI columns already labelled.', 'Slope triangle template drawn on the graph grid.', 'Formula card: V = IR, series add, parallel reciprocals.'],
    extension: ['Fit a line of best fit to noisy simulated data and report the residuals.', 'Explain why a filament lamp has a slope that increases with current (temperature-dependent resistance).'],
    ell: 'Sentence frames: "The slope is ___ ohms because for every ___ ampere the voltage rises ___ volts." Cognates: linear/lineal, resistance/resistencia.',
    supports: ['readAloud', 'chunk', 'fewerChoices', 'extraTime'],
  },
  safety: BENCH_LOW,
  standards: {
    ccss: [C('HSF.IF.B.6'), C('HSF.LE.A.1'), C('HSA.CED.A.4')],
    ngss: ['HS-PS2-5'],
    intl: { uk: 'GCSE Physics — electricity (I–V characteristics)', ib: 'DP Physics — electric circuits', cambridge: 'IGCSE Physics — electrical quantities' },
  },
  mathFocus: 'slope as a constant rate of change',
  museion: 'physics',
};

const L_EXP: StemLesson = {
  id: 'stem-912-u02-l2-rc-exponential',
  title: 'Charging Curves: Exponential Functions and the Time Constant',
  minutes: 55,
  strands: ['math', 'science'],
  objectives: [
    'I can evaluate V(t) = Vs(1 − e^(−t/RC)) for a charging capacitor.',
    'I can compute the time constant τ = RC and explain why the capacitor reaches about 63% of the supply after one τ.',
    'I can use a natural logarithm to solve for the time to reach a target voltage.',
  ],
  vocab: [
    ['time constant (τ)', 'The product RC, in seconds; the time to cover 63.2% of the remaining gap to the supply voltage.'],
    ['exponential function', 'A function where equal steps in input multiply the output (or the gap) by the same factor.'],
    ['asymptote', 'A value the curve approaches but never reaches; here, the supply voltage.'],
    ['capacitance', 'How much charge a capacitor stores per volt, in farads (F).'],
  ],
  hook: 'A camera flash whines and then is ready; a phone screen fades out instead of snapping off. Both are a capacitor filling or emptying. Why does it charge fast at first and then crawl?',
  build: {
    title: 'Watch an RC circuit charge in a transient simulation',
    steps: [
      'Open the Electronics Lab with a 5 V supply, a switch, a 10 kΩ resistor and a 100 µF capacitor in series.',
      'Set the simulation to transient mode, 0 to 5 s, and probe the capacitor voltage.',
      'Read V at t = 1, 2, 3 s. Divide each remaining gap (5 − V) by the previous gap: what factor do you get every second?',
      'Change R to 4.7 kΩ and C to 470 µF, predict τ, then run and mark the 63% point on the trace.',
    ],
    launch: { room: 'elec', prompt: 'RC charging circuit: 5 V DC supply, a switch, a 10 kilohm resistor and a 100 microfarad capacitor in series, transient simulation from 0 to 5 seconds probing the capacitor voltage.' },
    materials: ['Optional bench version: 5 V USB supply, 10 kΩ resistor, 100 µF electrolytic capacitor, multimeter or a microcontroller logging the voltage'],
  },
  worked: [
    {
      prompt: 'R = 10 kΩ, C = 100 µF, Vs = 5 V. Find τ and the capacitor voltage after 1 s.',
      steps: [
        'τ = RC = 10 000 × 0.000100 = 1.0 s.',
        'V(1) = 5(1 − e^(−1/1)) = 5(1 − 0.3679).',
        '= 5 × 0.6321 ≈ 3.16 V, which is 63.2% of 5 V.',
      ],
      answer: 'τ = 1.0 s and V(1 s) ≈ 3.16 V.',
    },
    {
      prompt: 'How long until the same kind of circuit reaches half the supply voltage?',
      steps: ['Set Vs(1 − e^(−t/τ)) = Vs/2, so e^(−t/τ) = 1/2.', 'Take ln of both sides: −t/τ = ln(1/2), so t = τ·ln 2 ≈ 0.693τ.'],
      answer: 't = 0.693τ: for τ = 1 s that is about 0.69 s.',
    },
  ],
  practice: [
    { q: 'Find τ for R = 4.7 kΩ and C = 470 µF.', answer: 'τ = 4700 × 0.00047 ≈ 2.21 s', value: 2.209, unit: 's', check: { f: 'rcTau', args: [4700, 0.00047] }, level: 1 },
    { q: 'Find τ for R = 10 kΩ and C = 100 µF.', answer: 'τ = 10 000 × 0.0001 = 1.0 s', value: 1, unit: 's', check: { f: 'rcTau', args: [10000, 0.0001] }, level: 1 },
    { q: 'Vs = 5 V, R = 10 kΩ, C = 100 µF. What is the capacitor voltage at t = 1 s?', answer: '5(1 − e^(−1)) ≈ 3.16 V', value: 3.16, unit: 'V', check: { f: 'rcCharge', args: [5, 10000, 0.0001, 1] }, level: 1 },
    { q: 'What percent of the 5 V supply is 3.16 V? Connect your answer to one time constant.', answer: '3.16 / 5 = 63.2%, the one-τ mark', value: 63.2, unit: '%', check: { f: 'pct', args: [3.1606, 5] }, level: 1 },
    { q: 'Vs = 3.3 V, R = 1 kΩ, C = 1000 µF. What is V after 3 s (three time constants)?', answer: '3.3(1 − e^(−3)) ≈ 3.14 V, about 95% of the supply', value: 3.136, unit: 'V', check: { f: 'rcCharge', args: [3.3, 1000, 0.001, 3] }, level: 2 },
    { q: 'In simulation, Vs = 9 V, R = 4.7 kΩ, C = 470 µF. What is V at t = 5 s?', answer: '9(1 − e^(−5/2.209)) ≈ 8.06 V', value: 8.06, unit: 'V', check: { f: 'rcCharge', args: [9, 4700, 0.00047, 5] }, level: 2 },
    { q: 'With τ = 2.209 s, how long until the capacitor reaches half of Vs? (Use t = τ·ln 2, ln 2 ≈ 0.6931.)', answer: 't = 2.209 × 0.6931 ≈ 1.53 s', value: 1.531, unit: 's', check: { f: 'product', args: [2.209, 0.6931] }, level: 3 },
  ],
  exitTicket: {
    q: 'Your teammate says "after two time constants the capacitor is 2 × 63% = 126% full." Fix the reasoning.',
    answer: 'Each τ removes 63.2% of the remaining gap, not of the total. After 2τ the gap is 0.368² ≈ 0.135, so the capacitor is about 86.5% charged.',
  },
  differentiation: {
    support: ['Calculator walkthrough card for e^x and ln.', 'Partially filled table of t, t/τ, e^(−t/τ) and V.', 'Graph paper with the 63%, 86%, 95% lines pre-drawn.'],
    extension: ['Derive the discharge curve V(t) = V0·e^(−t/RC) and find when a 5 V capacitor falls below 1 V.', 'Use log-linear graphing: plot ln(Vs − V) against t and show the slope is −1/τ.'],
    ell: 'Visual: a bathtub filling more slowly as it nears the top. Frames: "After one time constant the capacitor is about ___ percent charged."',
    supports: ['readAloud', 'chunk', 'untimed', 'extraTime'],
  },
  safety: BENCH_LOW,
  standards: {
    ccss: [C('HSF.LE.A.1'), C('HSF.LE.A.4'), C('HSF.LE.B.5'), C('HSF.IF.C.8')],
    ngss: ['HS-PS3-1'],
    intl: { uk: 'A level Maths — exponentials & logarithms; A level Physics — capacitor charge and discharge', ib: 'DP Math AA — exponential and logarithmic functions', cambridge: 'IGCSE Additional Mathematics — logarithmic and exponential functions' },
  },
  mathFocus: 'exponential approach to an asymptote',
  museion: 'physics',
};

const L_LOG: StemLesson = {
  id: 'stem-912-u02-l3-log-db-frets',
  title: 'Logarithms You Can Hear: Decibels and the Guitar Fretboard',
  minutes: 60,
  strands: ['math', 'science', 'engineering'],
  objectives: [
    'I can compute power and voltage gains in decibels with 10·log10 and 20·log10.',
    'I can place a fret with d(n) = s − s/2^(n/12) and explain why fret spacing shrinks up the neck.',
    'I can use log base 2 to find how many octaves or frets a frequency ratio represents.',
  ],
  vocab: [
    ['logarithm', 'The exponent you need: log2(8) = 3 because 2³ = 8.'],
    ['decibel (dB)', 'A logarithmic ratio scale: 10·log10 of a power ratio, 20·log10 of a voltage ratio.'],
    ['scale length', 'The vibrating string length from nut to saddle, e.g. 648 mm.'],
    ['equal temperament', 'Tuning where each semitone multiplies the frequency by 2^(1/12).'],
  ],
  hook: 'The frets on a guitar are not evenly spaced, and a 16 W amp does not sound four times as loud as a 4 W amp. Both facts come from the same function. What happens to the frequency each time you move up one fret?',
  build: {
    title: 'Lay out a fretboard in the guitar designer',
    steps: [
      'Open the Electronics Lab guitar recipe with a 648 mm scale and 22 frets.',
      'Open the fretboard drawing and read the distance from the nut to frets 1, 5, 7 and 12.',
      'Compute each with d(n) = s − s/2^(n/12) and compare to the drawing to the nearest 0.1 mm.',
      'Switch to a 34" (863.6 mm) bass and predict where fret 5 moves before you look.',
      'Probe the jack in transient mode with the tone knob at both ends and estimate the change in decibels from the two peak voltages.',
    ],
    launch: { room: 'elec', template: 'guitar', starter: { values: { scale: 648, frets: 22 }, note: 'Open the fretboard drawing and compare each slot to d(n) = s − s/2^(n/12).' } },
  },
  worked: [
    {
      prompt: 'Where is fret 7 on a 648 mm scale guitar?',
      steps: [
        'The string past fret n is s/2^(n/12) long, so the fret sits at d = s − s/2^(n/12).',
        '2^(7/12) ≈ 1.4983, so 648 / 1.4983 ≈ 432.49 mm of string remains.',
        'd(7) = 648 − 432.49 ≈ 215.5 mm.',
      ],
      answer: 'About 215.5 mm from the nut. The frequency ratio is 1.498, almost exactly a perfect fifth (3:2).',
    },
    {
      prompt: 'An amp goes from 0.5 W to 8 W. What is the gain in dB?',
      steps: ['Power ratio = 8 / 0.5 = 16.', 'Gain = 10·log10(16) ≈ 10 × 1.204 = 12.0 dB.'],
      answer: '+12.0 dB: four doublings of power, each about 3 dB.',
    },
  ],
  practice: [
    { q: 'Distance from the nut to fret 12 on a 648 mm scale.', answer: '648 − 648/2 = 324 mm, exactly half the scale', value: 324, unit: 'mm', check: { f: 'fret', args: [648, 12] }, level: 1 },
    { q: 'Distance from the nut to fret 5 on a 648 mm scale.', answer: '648 − 648/2^(5/12) ≈ 162.5 mm', value: 162.55, unit: 'mm', check: { f: 'fret', args: [648, 5] }, level: 1 },
    { q: 'Distance from the nut to fret 7 on a 648 mm scale.', answer: '648 − 648/2^(7/12) ≈ 215.5 mm', value: 215.51, unit: 'mm', check: { f: 'fret', args: [648, 7] }, level: 1 },
    { q: 'Distance from the nut to fret 5 on an 863.6 mm (34") bass.', answer: '863.6 − 863.6/2^(5/12) ≈ 216.6 mm', value: 216.63, unit: 'mm', check: { f: 'fret', args: [863.6, 5] }, level: 2 },
    { q: 'What frequency ratio does moving up 7 frets give? (Compute 2^(7/12).)', answer: '2^(7/12) ≈ 1.498, about a 3:2 perfect fifth', value: 1.4983, unit: '', check: { f: 'pow', args: [2, 0.583333] }, level: 2 },
    { q: 'Fret 24 has four times the open-string frequency. How many octaves is that? (log2 of the ratio.)', answer: 'log2(4) = 2 octaves, which is 24 frets', value: 2, unit: 'octaves', check: { f: 'log2', args: [4] }, level: 2 },
    { q: 'How many octaves is a 3:2 ratio? Multiply by 12 to estimate the fret.', answer: 'log2(1.5) ≈ 0.585 octaves; × 12 ≈ 7.02, so fret 7', value: 0.585, unit: 'octaves', check: { f: 'log2', args: [1.5] }, level: 3 },
    { q: 'Amplifier output rises from 0.5 W to 8 W. Gain in dB?', answer: '10·log10(16) ≈ 12.0 dB', value: 12.04, unit: 'dB', check: { f: 'db', args: [8, 0.5] }, level: 1 },
    { q: 'Doubling the power: how many dB is that?', answer: '10·log10(2) ≈ 3.01 dB', value: 3.01, unit: 'dB', check: { f: 'db', args: [2, 1] }, level: 1 },
    { q: 'A preamp turns a 0.1 V pickup signal into 2.83 V. Voltage gain in dB?', answer: '20·log10(28.3) ≈ 29.0 dB', value: 29.04, unit: 'dB', check: { f: 'dbV', args: [2.83, 0.1] }, level: 2 },
  ],
  exitTicket: {
    q: 'Why is the gap between frets 1 and 2 wider than the gap between frets 11 and 12?',
    answer: 'Each fret shortens the remaining string by the same factor 2^(−1/12), so each gap is a fixed fraction of a shrinking length: equal ratios, not equal distances.',
  },
  differentiation: {
    support: ['A pre-filled 2^(n/12) table for n = 1…12.', 'Step-by-step calculator keystrokes for 10·log10 and log2 (as log(x)/log(2)).', 'Fewer practice items: frets 5, 7, 12 and the 3 dB doubling.'],
    extension: ['Derive d(n) from the requirement that each fret multiplies frequency by 2^(1/12).', 'Compare equal temperament to just intonation: how far (in mm) is fret 7 from where a pure 3:2 would sit?'],
    ell: 'Gesture: hand moving up the neck with steps getting smaller. Frames: "The frequency ratio is ___ so the fret is at ___ millimetres."',
    supports: ['readAloud', 'chunk', 'fewerChoices', 'extraTime'],
  },
  safety: SIM_ONLY,
  standards: {
    ccss: [C('HSF.LE.A.4'), C('HSF.BF.B.5'), C('HSF.BF.A.1')],
    ngss: ['HS-PS4-1'],
    intl: { uk: 'A level Maths — exponentials & logarithms', ib: 'DP Math AA — logarithms; DP Physics — sound and waves', cambridge: 'IGCSE Additional Mathematics — logarithmic functions' },
  },
  mathFocus: 'logarithms as inverse exponentials',
  museion: 'mathematics',
};

const L_TRIG: StemLesson = {
  id: 'stem-912-u02-l4-ac-sine',
  title: 'Signals That Go Round: Sine Waves, Period and RMS',
  minutes: 55,
  strands: ['math', 'science'],
  objectives: [
    'I can evaluate v(t) = A·sin(2πft) at a given time, working in radians.',
    'I can find the period T = 1/f and the RMS value A/√2 of a sine wave.',
    'I can connect angular position on the unit circle to the instantaneous value of a waveform.',
  ],
  vocab: [
    ['amplitude', 'The peak value A of a sine wave, measured from zero.'],
    ['period', 'The time for one full cycle, T = 1/f.'],
    ['RMS', 'Root-mean-square: the steady DC voltage that heats a resistor as much as the wave does; A/√2 for a sine.'],
    ['radian', 'The angle unit where one full turn is 2π.'],
  ],
  hook: 'A guitar pickup turns a vibrating string into a voltage that swings above and below zero 440 times a second. If you froze time at 0.4 ms, what would the meter read, and why do we need a unit circle to answer?',
  build: {
    title: 'Probe a pickup signal on the virtual oscilloscope',
    steps: [
      'Open the guitar recipe; its pickup is modelled as a 0.2 V peak, 440 Hz source.',
      'Run the transient simulation and read the period from the trace by measuring peak-to-peak time.',
      'Predict v(t) at 0.4 ms with A·sin(2πft) in radian mode, then read it off the trace.',
      'Turn the volume knob halfway, read the new peak, and compute its RMS value.',
    ],
    launch: { room: 'elec', template: 'guitar', starter: { note: 'The pickup is a 0.2 V, 440 Hz sine: probe it and the jack in transient mode.' } },
  },
  worked: [
    {
      prompt: 'A function generator gives v(t) = 5·sin(2π·440·t) volts. Find v at t = 0.5 ms and the period.',
      steps: [
        'Angle = 2π × 440 × 0.0005 = 0.44π ≈ 1.382 rad (calculator in radians).',
        'sin(1.382) ≈ 0.9823, so v ≈ 5 × 0.9823 ≈ 4.91 V.',
        'T = 1/440 s ≈ 0.002273 s = 2.27 ms.',
      ],
      answer: 'v(0.5 ms) ≈ 4.91 V; period ≈ 2.27 ms.',
    },
  ],
  practice: [
    { q: 'v(t) = 10·sin(2π·50·t). Find v at t = 0.005 s.', answer: 'Angle = π/2, so v = 10 V (a peak)', value: 10, unit: 'V', check: { f: 'sine', args: [10, 50, 0.005] }, level: 1 },
    { q: 'v(t) = 3·sin(2π·50·t). Find v at t = 0.015 s.', answer: 'Angle = 3π/2, so v = −3 V (a trough)', value: -3, unit: 'V', check: { f: 'sine', args: [3, 50, 0.015] }, level: 1 },
    { q: 'v(t) = 5·sin(2π·440·t). Find v at t = 0.0005 s.', answer: '5·sin(0.44π) ≈ 4.91 V', value: 4.91, unit: 'V', check: { f: 'sine', args: [5, 440, 0.0005] }, level: 2 },
    { q: 'v(t) = 2·sin(2π·1000·t). Find v at t = 0.0002 s.', answer: '2·sin(0.4π) ≈ 1.90 V', value: 1.902, unit: 'V', check: { f: 'sine', args: [2, 1000, 0.0002] }, level: 2 },
    { q: 'The guitar pickup gives 0.2 V peak at 440 Hz. What is v at t = 0.0004 s?', answer: '0.2·sin(2π × 0.176) ≈ 0.179 V', value: 0.1787, unit: 'V', tol: 0.002, check: { f: 'sine', args: [0.2, 440, 0.0004] }, level: 3 },
    { q: 'Period of a 440 Hz wave, in milliseconds.', answer: 'T = 1000 / 440 ≈ 2.27 ms', value: 2.273, unit: 'ms', check: { f: 'quotient', args: [1000, 440] }, level: 1 },
    { q: 'RMS of a sine wave with 5 V peak.', answer: '5 / √2 ≈ 3.54 V', value: 3.536, unit: 'V', check: { f: 'rms', args: [5] }, level: 1 },
    { q: 'A low-voltage bench transformer output peaks at 12 V. What is its RMS voltage?', answer: '12 / √2 ≈ 8.49 V', value: 8.485, unit: 'V', check: { f: 'rms', args: [12] }, level: 2 },
  ],
  exitTicket: {
    q: 'A classmate gets v ≈ 0.12 V for 5·sin(2π·440·0.0005). What mistake did they make?',
    answer: 'Their calculator was in degrees: 5·sin(1.382°) ≈ 5 × 0.024 ≈ 0.12 V. The 2πft angle is in radians, so the correct value is 5·sin(1.382 rad) ≈ 4.91 V.',
  },
  differentiation: {
    support: ['Unit-circle card with π/2, π, 3π/2 marked and the matching sine values.', 'A "check your mode" sticker: RAD.', 'Work items 1, 2, 6 and 7 first; they land on exact angles.'],
    extension: ['Add two sines of 440 Hz and 442 Hz and explain the 2 Hz beat a tuner uses.', 'Show that the RMS of A·sin is A/√2 by averaging sin² over a period.'],
    ell: 'Frames: "The period is ___ because the frequency is ___ cycles per second." Visual: a rotating arm drawing the wave.',
    supports: ['readAloud', 'chunk', 'calm', 'extraTime'],
  },
  safety: SIM_ONLY,
  standards: {
    ccss: [C('HSF.TF.A.2'), C('HSF.TF.B.5'), C('HSF.IF.C.7')],
    ngss: ['HS-PS4-1', 'HS-PS2-5'],
    intl: { uk: 'A level Maths — trigonometry (radians); A level Physics — alternating currents', ib: 'DP Math AA — trigonometric functions; DP Physics — waves', cambridge: 'IGCSE Additional Mathematics — circular measure and trigonometry' },
  },
  mathFocus: 'periodic functions in radians',
  museion: 'physics',
};

const L_STATS: StemLesson = {
  id: 'stem-912-u02-l5-sensor-stats',
  title: 'Reading the Noise: Statistics from Sensor Logs',
  minutes: 55,
  strands: ['math', 'technology', 'science'],
  objectives: [
    'I can compute the mean, range and standard deviation of a sensor log.',
    'I can compare two sensors by centre and spread and say which is more precise.',
    'I can express a calibration offset as a percent error.',
  ],
  vocab: [
    ['mean', 'The sum of the readings divided by how many there are.'],
    ['range', 'Largest reading minus smallest reading.'],
    ['standard deviation', 'A typical distance of readings from the mean; the square root of the average squared deviation.'],
    ['precision vs accuracy', 'Precise readings agree with each other; accurate readings agree with the true value.'],
  ],
  hook: 'Two thermometers in the same room both "average 22 °C", yet one jumps around by more than two degrees. If your greenhouse fan switches on at 23 °C, which sensor would you trust, and how do you prove it with numbers?',
  build: {
    title: 'Log a Wi-Fi environment sensor',
    steps: [
      'Open the Wi-Fi environment sensor recipe and set the update interval to 30 s.',
      'Run the simulated log (or a real one from a classroom node) and export eight temperature readings.',
      'Compute the mean, range and standard deviation by hand, then check with a spreadsheet.',
      'Compare against a second sensor\'s log and write a one-paragraph recommendation.',
    ],
    launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 30 } } },
    materials: ['Optional: an ESP32 + BME280 sensor node on a 5 V USB supply'],
  },
  worked: [
    {
      prompt: 'Sensor A logged 21.4, 21.8, 22.1, 21.9, 22.6, 21.7, 22.0, 21.5 °C. Find the mean and range.',
      steps: ['Sum = 175.0; 175.0 / 8 = 21.875 °C.', 'Range = 22.6 − 21.4 = 1.2 °C.'],
      answer: 'Mean ≈ 21.9 °C, range 1.2 °C.',
    },
    {
      prompt: 'The squared deviations of sensor A average 0.1244 °C². What is the standard deviation?',
      steps: ['Standard deviation is the square root of that average (the population variance).', '√0.1244 ≈ 0.353 °C.'],
      answer: 'σ ≈ 0.35 °C.',
    },
  ],
  practice: [
    { q: 'Mean of sensor A: 21.4, 21.8, 22.1, 21.9, 22.6, 21.7, 22.0, 21.5 °C.', answer: '175.0 / 8 = 21.875 °C', value: 21.875, unit: '°C', check: { f: 'mean', args: [21.4, 21.8, 22.1, 21.9, 22.6, 21.7, 22.0, 21.5] }, level: 1 },
    { q: 'Range of sensor A.', answer: '22.6 − 21.4 = 1.2 °C', value: 1.2, unit: '°C', check: { f: 'range', args: [21.4, 21.8, 22.1, 21.9, 22.6, 21.7, 22.0, 21.5] }, level: 1 },
    { q: 'Mean of sensor B: 20.9, 23.4, 21.1, 22.8, 21.0, 23.2, 22.0, 21.6 °C.', answer: '176.0 / 8 = 22.0 °C', value: 22, unit: '°C', check: { f: 'mean', args: [20.9, 23.4, 21.1, 22.8, 21.0, 23.2, 22.0, 21.6] }, level: 1 },
    { q: 'Range of sensor B.', answer: '23.4 − 20.9 = 2.5 °C', value: 2.5, unit: '°C', check: { f: 'range', args: [20.9, 23.4, 21.1, 22.8, 21.0, 23.2, 22.0, 21.6] }, level: 1 },
    { q: 'Sensor B\'s squared deviations average 0.9025 °C². Find its standard deviation and compare with sensor A (0.35 °C).', answer: '√0.9025 = 0.95 °C; B is far less precise than A', value: 0.95, unit: '°C', check: { f: 'sqrt', args: [0.9025] }, level: 2 },
    { q: 'A reference thermometer reads 22.0 °C. Sensor A averages 21.875 °C. What is A\'s offset?', answer: '22.0 − 21.875 = 0.125 °C low', value: 0.125, unit: '°C', check: { f: 'difference', args: [22.0, 21.875] }, level: 2 },
    { q: 'Express that 0.125 °C offset as a percent error of 22.0 °C.', answer: '0.125 / 22.0 ≈ 0.57%', value: 0.568, unit: '%', check: { f: 'pct', args: [0.125, 22.0] }, level: 3 },
  ],
  exitTicket: {
    q: 'Sensor B has the "right" mean. Why might you still choose sensor A for a fan controller?',
    answer: 'A has a much smaller spread (σ 0.35 vs 0.95 °C), so it will not trigger the fan on random spikes; its small, steady offset can be corrected in software.',
  },
  differentiation: {
    support: ['A deviations table with columns x, x − mean, (x − mean)².', 'Spreadsheet template with =AVERAGE and =STDEV.P cells to check by-hand work.'],
    extension: ['Write firmware pseudocode for a moving average of the last 5 readings and show how it lowers the spread.', 'Compute the sample standard deviation (n − 1) and explain when to use it.'],
    ell: 'Frames: "Sensor ___ is more precise because its standard deviation is ___." Word wall: mean/media, range/rango.',
    supports: ['readAloud', 'chunk', 'untimed', 'fewerChoices'],
  },
  safety: BENCH_LOW,
  standards: {
    ccss: [C('HSS.ID.A.1'), C('HSS.ID.A.2'), C('HSS.ID.A.3')],
    csta: ['3A-DA-11'],
    intl: { uk: 'GCSE Maths — statistics (averages and spread); A level Maths — statistical sampling', ib: 'DP Math AI — descriptive statistics', cambridge: 'IGCSE Mathematics — statistics' },
  },
  mathFocus: 'centre and spread of a data set',
  museion: 'data',
};

const L_VEC: StemLesson = {
  id: 'stem-912-u02-l6-vectors-fields',
  title: 'Pushes and Fields: Vectors in Motors and Magnetometers',
  minutes: 55,
  strands: ['math', 'science', 'engineering'],
  objectives: [
    'I can find the magnitude and direction of a vector from its components.',
    'I can add force vectors component by component.',
    'I can use F = BIL to find the push on a current-carrying wire in a magnetic field.',
  ],
  vocab: [
    ['vector', 'A quantity with size and direction, written as components (x, y).'],
    ['magnitude', 'The length of a vector, √(x² + y²).'],
    ['component', 'The part of a vector along one axis, e.g. F·cos θ along x.'],
    ['magnetic field (B)', 'The region around a magnet or current where moving charges feel a force; measured in teslas.'],
  ],
  hook: 'A phone compass reads the Earth\'s magnetic field as three numbers, yet the app shows one arrow and one angle. How does it turn components into a direction, and why does the arrow dip toward the ground here?',
  build: {
    title: 'Read a 3-axis magnetometer and a simple motor in the Electronics Lab',
    steps: [
      'Open the starter: a 3.3 V microcontroller reading a magnetometer over I²C, with a small coil driven from a 5 V supply through a transistor.',
      'Read the horizontal (north) and vertical field components from the simulated sensor.',
      'Compute the field magnitude and the dip angle with atan2, then compare to the app\'s compass readout.',
      'Switch the coil on and watch the readings change: explain the shift as a second field vector being added.',
    ],
    launch: { room: 'elec', prompt: 'A 3.3 V microcontroller reading a 3-axis magnetometer over I2C, plus a small coil driven from a 5 V USB supply through an NPN transistor and flyback diode, to show a current making a magnetic field.' },
    materials: ['Optional bench version: Raspberry Pi Pico, magnetometer breakout, enamelled wire coil, NPN transistor, 1N4001 diode, 5 V USB supply'],
  },
  worked: [
    {
      prompt: 'A magnetometer reads 18 µT north (x) and −45 µT (y, down). Find the field strength and its angle.',
      steps: [
        'Magnitude = √(18² + 45²) = √(324 + 2025) = √2349 ≈ 48.5 µT.',
        'Angle = atan2(−45, 18) ≈ −68.2°, so the field dips 68.2° below horizontal.',
      ],
      answer: '|B| ≈ 48.5 µT at −68.2° (a dip angle typical of mid-northern latitudes).',
    },
    {
      prompt: 'Add forces F1 = (12, 5) N and F2 = (−4, 7) N.',
      steps: ['Add components: (12 − 4, 5 + 7) = (8, 12) N.', 'Magnitude √(64 + 144) ≈ 14.4 N; angle atan2(12, 8) ≈ 56.3°.'],
      answer: 'Resultant (8, 12) N: 14.4 N at 56.3°.',
    },
  ],
  practice: [
    { q: 'A bracket carries (3, 4) N. What is the magnitude of the force?', answer: '√(9 + 16) = 5 N', value: 5, unit: 'N', check: { f: 'vecMag', args: [3, 4] }, level: 1 },
    { q: 'What angle does the (3, 4) N force make with the x-axis?', answer: 'atan2(4, 3) ≈ 53.1°', value: 53.13, unit: '°', check: { f: 'vecAngle', args: [3, 4] }, level: 1 },
    { q: 'Earth\'s field reads 18 µT (x) and −45 µT (y). Find its magnitude.', answer: '√(18² + 45²) ≈ 48.5 µT', value: 48.47, unit: 'µT', check: { f: 'vecMag', args: [18, -45] }, level: 2 },
    { q: 'Find the dip angle of that field (atan2 of y over x).', answer: 'atan2(−45, 18) ≈ −68.2°', value: -68.2, unit: '°', check: { f: 'vecAngle', args: [18, -45] }, level: 2 },
    { q: 'F1 = (12, 5) N and F2 = (−4, 7) N. Find the magnitude of the resultant.', answer: 'Resultant (8, 12) N; √208 ≈ 14.4 N', value: 14.42, unit: 'N', check: { f: 'vecMag', args: [8, 12] }, level: 2 },
    { q: 'A 20 N cable pulls at 30° above horizontal. Find the horizontal component (cos 30° ≈ 0.8660).', answer: '20 × 0.8660 ≈ 17.3 N', value: 17.32, unit: 'N', check: { f: 'product', args: [20, 0.866] }, level: 2 },
    { q: 'A 0.05 m wire carrying 1.5 A sits across a 0.2 T field. Find the force F = BIL.', answer: '0.2 × 1.5 × 0.05 = 0.015 N', value: 0.015, unit: 'N', tol: 0.0005, check: { f: 'product', args: [0.2, 1.5, 0.05] }, level: 3 },
  ],
  exitTicket: {
    q: 'Why does the compass app use atan2(y, x) rather than tan⁻¹(y/x)?',
    answer: 'tan⁻¹(y/x) cannot tell (3, 4) from (−3, −4); atan2 uses the signs of both components to pick the right quadrant.',
  },
  differentiation: {
    support: ['Coordinate grid to sketch each vector tip-to-tail before calculating.', 'Formula strip: |v| = √(x² + y²), θ = atan2(y, x), x = r·cos θ.'],
    extension: ['Extend to three components and find the angle between two field readings with the dot product.', 'Compute the torque on a rectangular coil and estimate how many turns a toy motor needs.'],
    ell: 'Frames: "The vector has components ___ and ___, so its magnitude is ___." Use arrows drawn with colour for x and y.',
    supports: ['readAloud', 'chunk', 'extraTime'],
  },
  safety: {
    level: 'low',
    note: 'Low-voltage DC only (5 V USB). Coils can get warm: switch them through the transistor, never hold a coil connected directly across a supply, and fit the flyback diode. Keep magnets away from cards and pacemakers. Eye protection on when powered.',
  },
  standards: {
    ccss: [C('HSN.VM.A.1'), C('HSN.VM.A.3'), C('HSN.VM.B.4')],
    ngss: ['HS-PS2-5'],
    intl: { uk: 'A level Maths — vectors; GCSE Physics — magnetism and electromagnetism', ib: 'DP Math AA — vectors; DP Physics — magnetic fields', cambridge: 'IGCSE Physics — electromagnetic effects' },
  },
  mathFocus: 'vector components, magnitude and direction',
  museion: 'physics',
};

// ─────────────────────────────────────────────────────────────────────────────
// u05 · Living Systems as Models (science, complete) — Biology Lab
// ─────────────────────────────────────────────────────────────────────────────

const BIO_SAFETY: SafetyNote = { level: 'sim-only', note: 'All modelling happens in the Biology Lab simulator. No biological samples or wet-lab work. Discuss outbreak data with care: some students may have lost family members to illness.' };
const bioDiff = (extra: Partial<Differentiation>): Differentiation => ({
  support: ['A one-page model card listing every variable, parameter and its units.', 'Graph-reading frame: "At t = ___ the value of ___ is ___."'],
  extension: ['Change one parameter at a time and record how the key output responds (a sensitivity table).'],
  ell: 'Word wall with icons for each compartment. Frames: "When ___ increases, ___ because ___."',
  supports: supportsCore,
  ...extra,
});

const L_SIR: StemLesson = {
  id: 'stem-912-u05-l1-sir-r0',
  title: 'How an Outbreak Takes Off: The SIR Model and R0',
  minutes: 55,
  strands: ['science', 'math', 'technology'],
  objectives: [
    'I can explain the S, I and R compartments and the two rates that move people between them.',
    'I can compute R0 = β/γ and the herd-immunity threshold 1 − 1/R0.',
    'I can use the early growth rate β − γ to estimate a doubling time.',
  ],
  vocab: [
    ['compartment model', 'A model that sorts a population into boxes and tracks the flow between them.'],
    ['R0', 'The basic reproduction number: average new infections caused by one case in a fully susceptible population.'],
    ['herd-immunity threshold', 'The fraction that must be immune so each case causes fewer than one new case: 1 − 1/R0.'],
    ['doubling time', 'How long an exponentially growing quantity takes to double: ln 2 divided by the growth rate.'],
  ],
  hook: 'One case among a thousand people. In one version of the model, it fizzles; in another, two-thirds of the town catch it. The only difference is two numbers. Which two, and how can we tell in advance?',
  build: {
    title: 'Run and perturb the SIR starter',
    steps: [
      'Open the Biology Lab SIR starter (β = 0.3/day, γ = 0.1/day, I starts at 0.001).',
      'Run to day 160 and record the peak infected fraction and the day it happens.',
      'Halve β (a contact-reduction policy) and rerun. Record the new peak and day.',
      'Set R at t = 0 to 0.7 (vaccinated before the outbreak) and explain what you see.',
    ],
    launch: { room: 'bio', template: 'sir' },
  },
  worked: [
    {
      prompt: 'β = 0.3/day and γ = 0.1/day. Find R0 and the herd-immunity threshold.',
      steps: ['R0 = β/γ = 0.3/0.1 = 3.', 'Threshold = 1 − 1/R0 = 1 − 1/3 ≈ 0.667.'],
      answer: 'R0 = 3; about 66.7% must be immune.',
    },
    {
      prompt: 'Early in the outbreak almost everyone is susceptible. Estimate the doubling time.',
      steps: ['Early on, dI/dt ≈ (β − γ)I, so I grows exponentially at r = 0.2/day.', 'Doubling time = ln 2 / r = 0.6931 / 0.2 ≈ 3.5 days.'],
      answer: 'About 3.5 days.',
    },
  ],
  practice: [
    { q: 'Compute R0 for β = 0.3/day, γ = 0.1/day.', answer: 'R0 = 0.3 / 0.1 = 3', value: 3, unit: '', check: { f: 'quotient', args: [0.3, 0.1] }, level: 1 },
    { q: 'How long is the average infectious period when γ = 0.1/day?', answer: '1/γ = 10 days', value: 10, unit: 'days', check: { f: 'quotient', args: [1, 0.1] }, level: 1 },
    { q: 'Herd-immunity threshold for R0 = 3, as a fraction. (1/3 ≈ 0.3333.)', answer: '1 − 0.3333 ≈ 0.667', value: 0.667, unit: '', check: { f: 'difference', args: [1, 0.33333] }, level: 2 },
    { q: 'Early exponential growth rate r = β − γ for β = 0.3, γ = 0.1.', answer: 'r = 0.2 per day', value: 0.2, unit: '/day', check: { f: 'difference', args: [0.3, 0.1] }, level: 1 },
    { q: 'Doubling time at r = 0.2/day (ln 2 ≈ 0.6931).', answer: '0.6931 / 0.2 ≈ 3.47 days', value: 3.47, unit: 'days', check: { f: 'quotient', args: [0.6931, 0.2] }, level: 2 },
    { q: 'By what factor do infections grow in 10 days at r = 0.2/day? (e^(0.2 × 10) = e², e ≈ 2.71828.)', answer: 'e² ≈ 7.39 times', value: 7.389, unit: '×', check: { f: 'pow', args: [2.71828, 2] }, level: 3 },
    { q: 'A policy halves β to 0.15/day. What is the new R0?', answer: '0.15 / 0.1 = 1.5; still above 1, so the outbreak still grows, but more slowly', value: 1.5, unit: '', check: { f: 'quotient', args: [0.15, 0.1] }, level: 2 },
  ],
  exitTicket: {
    q: 'Why does the epidemic peak before everyone has been infected?',
    answer: 'Once S falls below 1/R0, each case infects fewer than one new person on average (β·S/γ < 1), so I starts to fall even though some people are still susceptible.',
  },
  differentiation: bioDiff({
    extension: ['Add a V (vaccinated) compartment with a vaccination rate and find the rate that keeps the peak below 5%.', 'Fit β to a short real data series by matching the doubling time.'],
  }),
  safety: BIO_SAFETY,
  standards: {
    ngss: ['HS-LS2-1', 'HS-LS2-2', 'HS-ETS1-4'],
    ccss: [C('HSF.LE.A.1'), C('HSF.LE.A.4'), C('HSA.CED.A.4')],
    csta: ['3A-DA-12'],
    intl: { uk: 'A level Biology — immunity and disease; A level Maths — exponential models', ib: 'DP Biology — defence against infectious disease; DP Math AI — modelling', cambridge: 'IGCSE Biology — diseases and immunity' },
  },
  museion: 'biology',
};

const L_LV: StemLesson = {
  id: 'stem-912-u05-l2-predator-prey',
  title: 'Out of Step: Predator–Prey Cycles',
  minutes: 55,
  strands: ['science', 'math'],
  objectives: [
    'I can describe how each term of the Lotka–Volterra model represents birth, predation, gain or death.',
    'I can find the equilibrium populations c/d (prey) and a/b (predators).',
    'I can estimate the cycle period near equilibrium as 2π/√(ac) and compare it with the simulation.',
  ],
  vocab: [
    ['equilibrium', 'A state where every population\'s rate of change is zero.'],
    ['phase plot', 'A graph of predators against prey; cycles appear as closed loops.'],
    ['carrying capacity', 'The largest population an environment can support (missing from the basic model, which is why prey can boom).'],
  ],
  hook: 'Fur-trading records once showed hare and lynx numbers rising and crashing roughly every ten years, the lynx always a step behind. Can four numbers in a model produce that rhythm on their own?',
  build: {
    title: 'Run the Lotka–Volterra starter and draw the phase loop',
    steps: [
      'Open the Biology Lab predator–prey starter (a = 1.1, b = 0.4, c = 0.4, d = 0.1; 10 prey, 10 predators).',
      'Run to t = 50 and mark the times of three prey peaks; average the gaps.',
      'Switch to the phase view (predators vs prey) and locate the centre of the loop.',
      'Start the model at prey = 4, predators = 2.75 and explain why nothing changes.',
    ],
    launch: { room: 'bio', template: 'lotka_volterra' },
  },
  worked: [
    {
      prompt: 'With a = 1.1, b = 0.4, c = 0.4, d = 0.1, find the equilibrium.',
      steps: [
        'Prey rate a·x − b·x·y = 0 gives y = a/b = 1.1/0.4 = 2.75 predators.',
        'Predator rate d·x·y − c·y = 0 gives x = c/d = 0.4/0.1 = 4 prey.',
      ],
      answer: '(prey, predators) = (4, 2.75).',
    },
  ],
  practice: [
    { q: 'Equilibrium prey population c/d for c = 0.4, d = 0.1.', answer: '0.4 / 0.1 = 4', value: 4, unit: 'prey', check: { f: 'quotient', args: [0.4, 0.1] }, level: 1 },
    { q: 'Equilibrium predator population a/b for a = 1.1, b = 0.4.', answer: '1.1 / 0.4 = 2.75', value: 2.75, unit: 'predators', check: { f: 'quotient', args: [1.1, 0.4] }, level: 1 },
    { q: 'Compute √(ac) for a = 1.1, c = 0.4.', answer: '√0.44 ≈ 0.663', value: 0.6633, unit: '/time', check: { f: 'sqrt', args: [0.44] }, level: 2 },
    { q: 'Estimate the small-cycle period 2π/√(ac) (2π ≈ 6.2832).', answer: '6.2832 / 0.6633 ≈ 9.47 time units', value: 9.47, unit: 'time units', check: { f: 'quotient', args: [6.2832, 0.6633] }, level: 2 },
    { q: 'With no predators, prey grow as e^(a·t). By what factor in one time unit? (e ≈ 2.71828.)', answer: 'e^1.1 ≈ 3.00 times', value: 3.004, unit: '×', check: { f: 'pow', args: [2.71828, 1.1] }, level: 2 },
    { q: 'Your plot shows prey peaks at t = 2.1, 11.9 and 21.6. Find the mean gap between peaks (9.8 and 9.7).', answer: '(9.8 + 9.7) / 2 = 9.75', value: 9.75, unit: 'time units', check: { f: 'mean', args: [9.8, 9.7] }, level: 3 },
  ],
  exitTicket: {
    q: 'Why does the predator peak always come after the prey peak?',
    answer: 'Predators grow only when there is plenty of prey (d·x·y > c·y), so their numbers keep rising until prey have already been eaten down; their growth lags the food supply.',
  },
  differentiation: bioDiff({
    extension: ['Add a logistic term a·x(1 − x/K) and show how the loop spirals into a steady state.', 'Explain why the large-amplitude cycles have a longer period than the 2π/√(ac) estimate.'],
  }),
  safety: BIO_SAFETY,
  standards: {
    ngss: ['HS-LS2-1', 'HS-LS2-2', 'HS-LS2-6'],
    ccss: [C('HSF.IF.B.4'), C('HSA.CED.A.4')],
    csta: ['3A-DA-12', '3B-DA-07'],
    intl: { uk: 'A level Biology — populations in ecosystems', ib: 'DP Biology — ecology (populations)', cambridge: 'IGCSE Biology — populations' },
  },
  museion: 'biology',
};

const L_MM: StemLesson = {
  id: 'stem-912-u05-l3-enzyme-kinetics',
  title: 'Enzymes at Full Speed: Michaelis–Menten Kinetics',
  minutes: 55,
  strands: ['science', 'math'],
  objectives: [
    'I can compute Km = (koff + kcat)/kon and Vmax = kcat·E0 from mass-action rates.',
    'I can use v = Vmax·S/(Km + S) to predict reaction speed at a substrate level.',
    'I can explain saturation: why adding more substrate eventually stops helping.',
  ],
  vocab: [
    ['enzyme', 'A protein that speeds up a reaction without being used up.'],
    ['substrate', 'The molecule the enzyme acts on.'],
    ['Km', 'The substrate concentration at which the reaction runs at half its maximum speed.'],
    ['saturation', 'When nearly every enzyme is busy, so speed levels off near Vmax.'],
  ],
  hook: 'A checkout with one cashier speeds up as customers arrive, until there is always a queue. Then more customers do not make it any faster. Enzymes behave the same way. Can we predict where the "always a queue" point is?',
  build: {
    title: 'Measure initial rates in the enzyme starter',
    steps: [
      'Open the Biology Lab enzyme kinetics starter (kon = 1, koff = 0.5, kcat = 0.8, E0 = 1, S0 = 10).',
      'Run and read the slope of product P over the first second: that is the initial rate.',
      'Repeat with S0 = 1.3, 5 and 20 and plot rate against S0.',
      'Draw the horizontal asymptote and mark Km on your graph.',
    ],
    launch: { room: 'bio', template: 'michaelis_menten' },
  },
  worked: [
    {
      prompt: 'Find Km, Vmax, and the rate at S = 10 for kon = 1, koff = 0.5, kcat = 0.8, E0 = 1.',
      steps: [
        'Km = (koff + kcat)/kon = (0.5 + 0.8)/1 = 1.3.',
        'Vmax = kcat × E0 = 0.8.',
        'v = 0.8 × 10 / (1.3 + 10) = 8 / 11.3 ≈ 0.708.',
      ],
      answer: 'Km = 1.3, Vmax = 0.8, v(10) ≈ 0.71 (about 88.5% of Vmax).',
    },
  ],
  practice: [
    { q: 'Km = koff + kcat when kon = 1. Compute it for koff = 0.5, kcat = 0.8.', answer: '0.5 + 0.8 = 1.3', value: 1.3, unit: 'conc.', check: { f: 'sum', args: [0.5, 0.8] }, level: 1 },
    { q: 'Vmax = kcat × E0 for kcat = 0.8 and E0 = 1.', answer: '0.8 × 1 = 0.8', value: 0.8, unit: 'conc./time', check: { f: 'product', args: [0.8, 1] }, level: 1 },
    { q: 'Reaction speed at S = 10: v = 0.8 × 10 / 11.3.', answer: '8 / 11.3 ≈ 0.708', value: 0.708, unit: 'conc./time', check: { f: 'quotient', args: [8, 11.3] }, level: 2 },
    { q: 'What percent of Vmax is that? (S/(Km + S) = 10/11.3.)', answer: '≈ 88.5%', value: 88.5, unit: '%', check: { f: 'pct', args: [10, 11.3] }, level: 2 },
    { q: 'What is the speed when S equals Km?', answer: 'Vmax / 2 = 0.4', value: 0.4, unit: 'conc./time', check: { f: 'quotient', args: [0.8, 2] }, level: 1 },
    { q: 'A drug doubles the effective Km to 2.6. What percent of Vmax is reached at S = 10 now?', answer: '10 / 12.6 ≈ 79.4%', value: 79.4, unit: '%', check: { f: 'pct', args: [10, 12.6] }, level: 3 },
  ],
  exitTicket: {
    q: 'Going from S = 10 to S = 20 barely changes the speed. Explain using the formula.',
    answer: 'S/(Km + S) goes from 10/11.3 ≈ 0.885 to 20/21.3 ≈ 0.939: the enzyme is already nearly saturated, so v approaches Vmax but cannot exceed it.',
  },
  differentiation: bioDiff({
    extension: ['Make a Lineweaver–Burk plot (1/v vs 1/S) and show its slope is Km/Vmax.', 'Compare competitive and non-competitive inhibition by which parameter each changes.'],
  }),
  safety: BIO_SAFETY,
  standards: {
    ngss: ['HS-LS1-6', 'HS-LS1-3'],
    ccss: [C('HSF.IF.B.4'), C('HSA.CED.A.4'), C('HSF.BF.A.1')],
    csta: ['3A-DA-12'],
    intl: { uk: 'A level Biology — enzymes', ib: 'DP Biology — enzymes and metabolism', cambridge: 'IGCSE Biology — enzymes' },
  },
  museion: 'biology',
};

const L_REP: StemLesson = {
  id: 'stem-912-u05-l4-genetic-clock',
  title: 'A Clock Made of Genes: Feedback in the Repressilator',
  minutes: 60,
  strands: ['science', 'engineering', 'math'],
  objectives: [
    'I can explain how three genes repressing each other in a ring can oscillate.',
    'I can evaluate the repression term α/(1 + pⁿ) at a given protein level.',
    'I can measure a period from simulation peaks and test how a parameter changes it.',
  ],
  vocab: [
    ['negative feedback', 'When a product slows its own production, directly or around a loop.'],
    ['repressor', 'A protein that blocks a gene from being transcribed.'],
    ['Hill coefficient (n)', 'How switch-like repression is; larger n gives a sharper on/off response.'],
    ['oscillation', 'A repeating rise and fall with a regular period.'],
  ],
  hook: 'In 2000, two researchers wired three genes into E. coli so each one switched off the next. The bacteria began to blink. Engineers build clocks from feedback loops; can biology do the same thing with proteins?',
  build: {
    title: 'Probe the repressilator',
    steps: [
      'Open the Biology Lab repressilator starter (α = 216, α0 = 0.216, β = 5, n = 2).',
      'Run to t = 60, plot the three proteins and note the order of their peaks.',
      'Measure three successive peak times of one protein and average the gaps.',
      'Set n = 1 and rerun. Describe what happens to the oscillation and explain using the repression term.',
    ],
    launch: { room: 'bio', template: 'repressilator' },
  },
  worked: [
    {
      prompt: 'With α = 216 and n = 2, how strongly is a gene transcribed when its repressor level is 5?',
      steps: ['pⁿ = 5² = 25.', 'α/(1 + pⁿ) = 216/26 ≈ 8.31 (plus a tiny leak α0 = 0.216).'],
      answer: 'About 8.3, down from 216 with no repressor: roughly a 26-fold drop.',
    },
  ],
  practice: [
    { q: 'Maximum transcription with no repressor: α + α0 = 216 + 0.216.', answer: '216.216', value: 216.216, unit: '', check: { f: 'sum', args: [216, 0.216] }, level: 1 },
    { q: 'Compute pⁿ for repressor level 5 and n = 2.', answer: '5² = 25', value: 25, unit: '', check: { f: 'pow', args: [5, 2] }, level: 1 },
    { q: 'Repression term α/(1 + pⁿ) at p = 5: 216 / 26.', answer: '≈ 8.31', value: 8.31, unit: '', check: { f: 'quotient', args: [216, 26] }, level: 2 },
    { q: 'Repression term at p = 10: 216 / 101.', answer: '≈ 2.14', value: 2.139, unit: '', check: { f: 'quotient', args: [216, 101] }, level: 2 },
    { q: 'Your trace shows peak-to-peak gaps of 11.6 and 11.5 time units. Mean period?', answer: '(11.6 + 11.5) / 2 = 11.55', value: 11.55, unit: 'time units', check: { f: 'mean', args: [11.6, 11.5] }, level: 2 },
    { q: 'With n = 1, the term at p = 5 becomes 216/(1 + 5). Compute it and compare with n = 2.', answer: '216 / 6 = 36, over four times weaker repression than 8.31, so the switch is too soft to oscillate', value: 36, unit: '', check: { f: 'quotient', args: [216, 6] }, level: 3 },
  ],
  exitTicket: {
    q: 'Why does a ring of three repressors oscillate, while a single gene repressing itself (with these settings) settles to a steady level?',
    answer: 'The ring adds delay: each protein must be made before it can switch off the next, so the signal arrives late and overshoots. A direct self-loop corrects itself almost immediately and settles.',
  },
  differentiation: bioDiff({
    extension: ['Find the smallest Hill coefficient that still oscillates by bisection on n.', 'Design a four-gene ring and predict whether it oscillates (hint: an even loop is a switch).'],
  }),
  safety: BIO_SAFETY,
  standards: {
    ngss: ['HS-LS1-1', 'HS-LS1-3', 'HS-ETS1-4'],
    ccss: [C('HSF.IF.B.4'), C('HSF.BF.A.1')],
    csta: ['3A-DA-12', '3B-DA-07'],
    intl: { uk: 'A level Biology — gene expression and control', ib: 'DP Biology — gene expression', cambridge: 'Cambridge International AS & A Level Biology — control of gene expression' },
  },
  museion: 'biology',
};

// ─────────────────────────────────────────────────────────────────────────────
// Units
// ─────────────────────────────────────────────────────────────────────────────

export const G912_UNITS: StemUnit[] = [
  {
    id: 'stem-912-u01', band: '9-12', n: 1, title: 'Design Under Constraints', kind: 'engineering',
    strands: ['engineering', 'math', 'science'], status: 'outline', weeks: 4,
    bigIdea: 'Every real design trades one good thing for another; engineers make those tradeoffs explicit, weigh them, and test the winner.',
    essentialQuestion: 'How do you choose the best design when the criteria pull in opposite directions?',
    standards: { ngss: ['HS-ETS1-1', 'HS-ETS1-2', 'HS-ETS1-3', 'HS-ETS1-4'], ccss: [C('HSN.Q.A.1'), C('HSA.CED.A.3')] },
    lessons: [],
    outline: [
      'Defining the problem: criteria, constraints and the people affected',
      'Breaking a big problem into solvable subsystems',
      'Weighted decision matrices and sensitivity to the weights',
      'Cost, safety, reliability, aesthetics, and environmental impact as competing criteria',
      'Simulating before building: when a model is good enough',
      'Design review: presenting a tradeoff to a client',
    ],
    projectIds: [], museion: 'engineering',
  },
  {
    id: 'stem-912-u02', band: '9-12', n: 2, title: 'Functions on the Bench', kind: 'electronics-math',
    strands: ['math', 'science', 'technology', 'engineering'], status: 'complete', weeks: 6,
    bigIdea: 'The function families of high-school math are not abstractions: a resistor draws a line, a capacitor charges exponentially, a fretboard is a logarithm, an AC signal is a sine, and every sensor log is a data set.',
    essentialQuestion: 'Which function describes this circuit, and what do its parameters mean physically?',
    standards: {
      ccss: [C('HSF.IF.B.6'), C('HSF.LE.A.1'), C('HSF.LE.A.4'), C('HSF.BF.B.5'), C('HSF.TF.B.5'), C('HSS.ID.A.2'), C('HSN.VM.A.3'), C('HSA.CED.A.4')],
      ngss: ['HS-PS2-5', 'HS-PS4-1'],
      csta: ['3A-DA-11'],
      intl: { uk: 'A level Maths — functions, exponentials & logarithms, trigonometry, vectors, statistics', ib: 'DP Math AA — functions; DP Physics — circuits and waves', cambridge: 'IGCSE Additional Mathematics' },
    },
    lessons: [L_LINEAR, L_EXP, L_LOG, L_TRIG, L_STATS, L_VEC],
    projectIds: ['stem-912-proj-fretboard'], museion: 'mathematics',
  },
  {
    id: 'stem-912-u03', band: '9-12', n: 3, title: 'Embedded Systems & IoT', kind: 'technology',
    strands: ['technology', 'engineering'], status: 'outline', weeks: 5,
    bigIdea: 'A microcontroller is a tiny computer that reads the world, decides and acts; networked, it becomes part of a system that must be reliable and secure.',
    essentialQuestion: 'How do you write firmware that keeps working, and keeps others out, when nobody is watching?',
    standards: { csta: ['3A-AP-13', '3A-AP-14', '3A-AP-15', '3A-AP-16', '3A-AP-17', '3B-AP-14', '3A-NI-05'], ngss: ['HS-ETS1-2'] },
    lessons: [],
    outline: [
      'Inputs, outputs and the main loop: blinking with intent on a Raspberry Pi Pico',
      'Debouncing, state machines and non-blocking timing',
      'Pulse-width modulation: dimming the smart LED lamp',
      'Talking to sensors over I²C (the Raspberry Pi hub)',
      'ESPHome and Home Assistant: devices as services',
      'Secrets, passwords and over-the-air updates: IoT security basics',
      'Testing and logging firmware like an engineer',
    ],
    projectIds: [], museion: 'cs',
  },
  {
    id: 'stem-912-u04', band: '9-12', n: 4, title: 'Data Science with Sensors', kind: 'technology',
    strands: ['technology', 'math', 'science'], status: 'outline', weeks: 4,
    bigIdea: 'A sensor network turns a room into a data set; good questions, clean data and honest graphs turn that data set into decisions.',
    essentialQuestion: 'When does a pattern in sensor data mean something real?',
    standards: { csta: ['3A-DA-11', '3A-DA-12', '3B-DA-05', '3B-DA-06'], ccss: [C('HSS.ID.A.1'), C('HSS.ID.B.6'), C('HSS.ID.C.7'), C('HSS.ID.C.9')], ngss: ['HS-ESS3-5'] },
    lessons: [],
    outline: [
      'Deploying a sensor node: sampling rate, placement and metadata',
      'Cleaning a log: gaps, spikes and timestamps',
      'Scatter plots, lines of best fit and residuals (temperature vs humidity)',
      'Correlation is not causation: confounders in a classroom',
      'Interactive dashboards that tell the truth',
    ],
    projectIds: ['stem-912-proj-iot-station'], museion: 'data',
  },
  {
    id: 'stem-912-u05', band: '9-12', n: 5, title: 'Living Systems as Models', kind: 'science',
    strands: ['science', 'math', 'technology'], status: 'complete', weeks: 4,
    bigIdea: 'A few equations about rates can reproduce outbreaks, population cycles, enzyme saturation and genetic clocks; models are tools for asking "what if" before acting.',
    essentialQuestion: 'What can a simple rate model predict about a living system, and where does it break down?',
    standards: {
      ngss: ['HS-LS2-1', 'HS-LS2-2', 'HS-LS1-3', 'HS-ETS1-4'],
      ccss: [C('HSF.LE.A.1'), C('HSF.IF.B.4'), C('HSA.CED.A.4')],
      csta: ['3A-DA-12', '3B-DA-07'],
      intl: { uk: 'A level Biology — populations, immunity, enzymes, gene expression', ib: 'DP Biology — ecology, immunity, metabolism', cambridge: 'IGCSE Biology' },
    },
    lessons: [L_SIR, L_LV, L_MM, L_REP],
    projectIds: ['stem-912-proj-outbreak'], museion: 'biology',
  },
  {
    id: 'stem-912-u06', band: '9-12', n: 6, title: 'CAD & Fabrication', kind: 'engineering',
    strands: ['engineering', 'technology', 'math'], status: 'outline', weeks: 5,
    bigIdea: 'A part that fits is designed with its manufacturing process in mind: tolerances, material, time and cost are design parameters, not afterthoughts.',
    essentialQuestion: 'How precise does a part need to be, and what does that precision cost?',
    standards: { ngss: ['HS-ETS1-2', 'HS-ETS1-3'], ccss: [C('HSG.MG.A.3'), C('HSG.GMD.A.3'), C('HSN.Q.A.3')] },
    lessons: [],
    outline: [
      'Parametric CAD: sketches, constraints and design intent',
      'Tolerances and fits: press, slip and clearance for a sensor enclosure',
      '3D-print time and cost: layer height, infill and the volume formula',
      'Laser and CNC: kerf, toolpaths, and why routing a guitar body is an adult/technician step',
      'Design for assembly: fewer parts, fewer screws',
    ],
    projectIds: [], museion: 'engineering',
  },
  {
    id: 'stem-912-u07', band: '9-12', n: 7, title: 'Energy & Power Systems', kind: 'engineering',
    strands: ['science', 'engineering', 'math'], status: 'outline', weeks: 4,
    bigIdea: 'Every device converts energy from one form to another and loses some on the way; sizing a battery or a solar panel is an energy budget.',
    essentialQuestion: 'How big a battery does a device really need, and where does the rest of the energy go?',
    standards: { ngss: ['HS-PS3-3', 'HS-PS3-1', 'HS-PS2-5', 'HS-ETS1-3'], ccss: [C('HSN.Q.A.1'), C('HSA.CED.A.1')] },
    lessons: [],
    outline: [
      'Energy, power and efficiency: following the joules through a speaker',
      'Battery sizing: mAh, duty cycle and sleep modes for a sensor node',
      'Lithium cells safely: protected packs, proper chargers, never puncture, short or charge unattended',
      'Generators and motors: electromagnetic induction on a hand-crank',
      'Solar harvesting for an outdoor sensor: panel area and worst-case days',
    ],
    projectIds: [], museion: 'physics',
  },
  {
    id: 'stem-912-u08', band: '9-12', n: 8, title: 'Soft & Wearable Engineering', kind: 'engineering',
    strands: ['engineering', 'technology', 'science'], status: 'outline', weeks: 4,
    bigIdea: 'Fabric can be a circuit board: conductive thread has resistance, seams are wiring routes, and a wearable must survive bending, washing and skin.',
    essentialQuestion: 'How do you design electronics that move, flex and live on a body?',
    standards: { ngss: ['HS-ETS1-2', 'HS-ETS1-3', 'HS-PS3-3'], ccss: [C('HSG.MG.A.3'), C('HSA.CED.A.4')], csta: ['3A-AP-16'] },
    lessons: [],
    outline: [
      'Conductive thread as a resistor: measuring Ω per metre',
      'Routing traces on a tote bag pattern without short circuits',
      'Sewable microcontrollers, LEDs and coin-cell holders',
      'Garment wearables: placement, strain relief and washability',
      'User testing: comfort, safety and accessibility',
    ],
    projectIds: [], museion: 'engineering',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────

const crit = (name: string, b: string, d: string, p: string, a: string) => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: b, points: 1 },
    { label: 'Developing', descriptor: d, points: 2 },
    { label: 'Proficient', descriptor: p, points: 3 },
    { label: 'Advanced', descriptor: a, points: 4 },
  ],
});

export const G912_PROJECTS: StemProject[] = [
  {
    id: 'stem-912-proj-fretboard', band: '9-12', unitId: 'stem-912-u02',
    title: 'Design Your Own Fretboard and Pickup Wiring', subject: 'math',
    drivingQuestion: 'Can you use exponential and logarithmic functions to design a playable, in-tune instrument for a scale length you choose?',
    brief: 'Choose a scale length between 600 and 870 mm for a guitar or bass. Derive and tabulate every fret position with d(n) = s − s/2^(n/12), verify the table against the guitar designer\'s drawing, and justify where the neck joins the body. Then wire the pickups, volume and tone circuit in simulation and use decibels to describe what the tone control does to the signal. A finished drawing and a reasoned spec sheet are the deliverables; any physical build of the body is routed on a CNC by an adult technician.',
    deliverables: [
      'A fret table (n = 1 to your fret count) with distances to 0.1 mm and the spacing between frets',
      'A graph of d(n) with a written explanation of why it is not linear',
      'The fretboard drawing from the Electronics Lab with three frets checked by hand',
      'A pickup wiring simulation with before/after jack voltages and the change in dB',
      'A one-page spec sheet justifying scale length, fret count and pickup choice',
    ],
    steps: [
      'Pick a scale length and fret count and record why (player hand size, instrument type).',
      'Build the fret table in a spreadsheet with d(n) = s − s/2^(n/12); check frets 5, 7 and 12 by hand.',
      'Open the guitar recipe with your values and compare its fretboard to your table.',
      'Simulate the jack voltage with the tone knob fully open and fully closed; compute 20·log10 of the ratio.',
      'Write the spec sheet and present your fret graph to a partner for review.',
      'Optional build: assemble electronics with supervised soldering; the body is routed by a technician.',
    ],
    launch: { room: 'elec', template: 'guitar', starter: { values: { scale: 648, frets: 22, pickups: 2, type: 'humbucker' }, note: 'Change the scale length to yours, then compare the fretboard to your table.' } },
    rubric: {
      criteria: [
        crit('Mathematical accuracy', 'Fret table has many errors or no formula', 'Formula used, several values off by more than 0.5 mm', 'All frets within 0.1 mm, three checked by hand', 'All correct, plus a derivation of the formula from 2^(1/12) per semitone'),
        crit('Function reasoning', 'Graph missing or unexplained', 'Graph drawn, says only that it "curves"', 'Explains equal ratios vs equal distances using the formula', 'Connects d(n) to logarithms and predicts spacing for a new scale length'),
        crit('Circuit and decibels', 'Wiring incomplete', 'Wiring simulates, dB calculation missing or wrong', 'Correct wiring and a correct dB change with units', 'Compares two tone-cap values and explains the frequency effect'),
        crit('Engineering communication', 'Spec sheet missing', 'Choices stated without reasons', 'Each choice justified with a measurement or calculation', 'Tradeoffs weighed explicitly, peer review feedback incorporated'),
      ],
    },
    standards: {
      ccss: [C('HSF.LE.A.4'), C('HSF.BF.B.5'), C('HSF.LE.A.2')],
      ngss: ['HS-PS4-1', 'HS-ETS1-2'],
      intl: { uk: 'A level Maths — exponentials & logarithms', ib: 'DP Math AA — exponentials and logarithms (internal assessment ready)', cambridge: 'IGCSE Additional Mathematics — logarithmic functions' },
    },
    minutes: 300,
    differentiation: {
      support: 'Provide a spreadsheet with the formula in the first row to fill down, and require only frets 1–12 plus three hand checks.',
      extension: 'Design a compensated saddle: research string-gauge intonation offsets and adjust the bridge position, or design a multi-scale (fanned-fret) neck.',
    },
    safety: {
      level: 'supervised',
      note: 'Simulation and drawing need no safety gear. Any soldering is supervised, with eye protection and fume extraction, on a heat-proof mat. The guitar body is routed on a CNC by an adult technician only; students never operate the router. No mains: the instrument circuit is passive and the amp is a purchased, certified unit.',
    },
  },
  {
    id: 'stem-912-proj-iot-station', band: '9-12', unitId: 'stem-912-u04',
    title: 'Classroom Climate Station: An IoT Data Study', subject: 'science',
    drivingQuestion: 'Is our classroom comfortable and healthy all day, and what evidence would convince the facilities team to change something?',
    brief: 'Build and deploy a Wi-Fi environment sensor (temperature, humidity, pressure) on an ESP32, log a full week, and analyse the data with descriptive statistics and graphs. Calibrate against a reference thermometer, report centre and spread for each period of the day, and write a data-backed recommendation. Keep device secrets out of shared code.',
    deliverables: [
      'Configured sensor firmware (ESPHome YAML) with secrets kept in a private file',
      'A cleaned data log of at least one school week',
      'Summary statistics (mean, range, standard deviation) by period with a calibration offset',
      'Two honest graphs: a time series and a box plot or histogram',
      'A one-page recommendation memo citing the numbers',
    ],
    steps: [
      'Open the sensor recipe, set an update interval and review the firmware.',
      'Plan placement and metadata (height, distance from windows and vents).',
      'Calibrate against a reference thermometer for 30 minutes; record the offset.',
      'Deploy for a week; export and clean the log (remove gaps and spikes, documenting each change).',
      'Compute summary statistics and build the graphs.',
      'Write and present the recommendation memo.',
    ],
    launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 60 } } },
    rubric: {
      criteria: [
        crit('Data collection', 'Little usable data', 'Partial log, placement undocumented', 'Full week logged with documented placement and calibration', 'Two nodes compared, sampling choices justified'),
        crit('Statistical analysis', 'Statistics missing or wrong', 'Some statistics, units or periods missing', 'Correct mean, range and SD by period with calibration applied', 'Discusses outliers, uncertainty and whether differences are meaningful'),
        crit('Visualisation', 'Graphs missing or misleading', 'Graphs present but unlabelled', 'Clear, labelled graphs that match the claims', 'Interactive or layered graphs that reveal a non-obvious pattern'),
        crit('Communication and security', 'No recommendation; secrets in shared code', 'Recommendation not tied to data', 'Recommendation cites numbers; secrets kept private', 'Anticipates objections and proposes a follow-up study'),
      ],
    },
    standards: {
      csta: ['3A-DA-11', '3A-DA-12', '3A-AP-16'],
      ccss: [C('HSS.ID.A.1'), C('HSS.ID.A.2'), C('HSS.ID.A.3')],
      ngss: ['HS-ETS1-2'],
      intl: { uk: 'GCSE Computer Science — networks and data; A level Maths — statistics', ib: 'DP Computer Science — systems in organisations', cambridge: 'IGCSE Computer Science — data and networks' },
    },
    minutes: 360,
    differentiation: {
      support: 'Provide a pre-configured sensor and a spreadsheet template with statistics formulas; focus the analysis on two periods of the day.',
      extension: 'Add a CO₂ sensor, correlate it with occupancy and window state, and discuss confounders.',
    },
    safety: {
      level: 'low',
      note: 'Powered only from a 5 V USB supply; never from mains wiring. Mount the node away from water and heat. If soldering headers, an adult supervises with eye protection and fume extraction. Do not share Wi-Fi passwords or API keys in code or screenshots.',
    },
  },
  {
    id: 'stem-912-proj-outbreak', band: '9-12', unitId: 'stem-912-u05',
    title: 'Outbreak Response Brief: Modelling Interventions', subject: 'science',
    drivingQuestion: 'With a limited budget, which combination of contact reduction and vaccination keeps a model outbreak\'s peak below what a local clinic can handle?',
    brief: 'Using the Biology Lab SIR model, act as a modelling team advising a town of 10,000 people. Establish a baseline, then test at least three interventions (reducing β, vaccinating before the outbreak, or both). Report peak size, peak timing and total infected for each, compare against a clinic capacity of 3% infected at once, and recommend a plan, stating clearly what the model leaves out.',
    deliverables: [
      'Baseline run with R0, herd-immunity threshold, peak and timing',
      'A table of at least three intervention scenarios with peak, peak day and final size',
      'One graph overlaying the infected curves',
      'A two-page brief with a recommendation and a limitations section',
    ],
    steps: [
      'Open the SIR starter and record the baseline (β = 0.3, γ = 0.1).',
      'Compute R0 and the herd-immunity threshold; check them against the simulation.',
      'Design three interventions and predict each outcome before running it.',
      'Run, tabulate and graph the scenarios against the 3% capacity line.',
      'Write the brief, including at least three model limitations (age, geography, behaviour change).',
    ],
    launch: { room: 'bio', template: 'sir' },
    rubric: {
      criteria: [
        crit('Model use', 'Baseline not reproduced', 'Baseline run, interventions incomplete', 'Baseline and three interventions run and recorded accurately', 'Sensitivity analysis on β or γ included'),
        crit('Quantitative reasoning', 'R0 or threshold missing', 'Calculations with errors', 'R0, threshold and scenario numbers correct and consistent with the simulation', 'Explains discrepancies between the formula and simulation results'),
        crit('Argument from evidence', 'Recommendation unsupported', 'Recommendation loosely tied to data', 'Recommendation follows from the scenario table and capacity line', 'Weighs cost and feasibility tradeoffs explicitly'),
        crit('Limitations and ethics', 'No limitations', 'One generic limitation', 'Three specific limitations with their likely effect', 'Discusses equity and communication of uncertainty to the public'),
      ],
    },
    standards: {
      ngss: ['HS-LS2-1', 'HS-LS2-2', 'HS-ETS1-4'],
      ccss: [C('HSF.LE.A.1'), C('HSA.CED.A.4')],
      csta: ['3A-DA-12', '3B-DA-07'],
      intl: { uk: 'A level Biology — immunity and disease', ib: 'DP Biology — immunity', cambridge: 'IGCSE Biology — diseases and immunity' },
    },
    minutes: 240,
    differentiation: {
      support: 'Supply a scenario table template and two pre-chosen interventions; students add one of their own.',
      extension: 'Add a vaccinated compartment with waning immunity, or split the town into two connected groups with different contact rates.',
    },
    safety: { level: 'sim-only', note: 'Simulation only. Handle real disease topics with sensitivity; students may have personal experience of illness and loss.' },
  },
];
