// STEM track — Grades 6–8 · Designers.
//
// Two complete units anchor the year:
//   u01 Ohm's Law Is a Ratio  (electronics-math)  proportional reasoning, unit rates, signed numbers, percent and scale
//                                                  drawings, all with a real LED circuit as the context
//   u04 Classroom Weather Station (technology)     the 'sensor' recipe as a data instrument: sampling, mean and range,
//                                                  comparison, and an engineering-design cycle on a radiation shield
// The other six units are scope & sequence outlines (lesson titles + standards), authored next.
//
// All prose is original Plajah Academia writing. Standards are cited by code only.
// Numbers follow the simulator: LED forward voltage red 2.0 V, yellow 2.1 V, green 2.2 V, blue/white 3.0 V;
// the lamp recipe runs from USB 5 V or 3 × AA (4.5 V, about 2400 mAh) at 5 / 15 / 19 mA per LED.

import type { StemProject, StemUnit } from './types';
import type { RubricCriterion } from '../assignmentTemplates';

const M = (code: string) => `CCSS.MATH.CONTENT.${code}`;

const crit = (name: string, beginning: string, developing: string, proficient: string, advanced: string): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: beginning, points: 1 },
    { label: 'Developing', descriptor: developing, points: 2 },
    { label: 'Proficient', descriptor: proficient, points: 3 },
    { label: 'Advanced', descriptor: advanced, points: 4 },
  ],
});

const INTL_G6 = { uk: 'KS3 Y7', cambridge: 'Lower Secondary Stage 7', ib: 'MYP year 1', singapore: 'Primary 6' };
const INTL_G7 = { uk: 'KS3 Y8', cambridge: 'Lower Secondary Stage 8', ib: 'MYP year 2', singapore: 'Secondary 1' };

const BATTERY_SAFETY = 'Simulate first. If you build it, use a 3 × AA pack (4.5 V) or USB 5 V only, give every LED its own resistor, and never connect the battery terminals straight to each other: a shorted pack gets hot fast.';

// ════════════════════════════════════════════════════════════════════════════
// u01 · Ohm's Law Is a Ratio (electronics-math, complete)
// ════════════════════════════════════════════════════════════════════════════

const U01: StemUnit = {
  id: 'stem-68-u01',
  band: '6-8',
  n: 1,
  title: "Ohm's Law Is a Ratio",
  kind: 'electronics-math',
  strands: ['math', 'science', 'engineering'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'A resistor is a proportional relationship you can hold in your hand: double the voltage and the current doubles, and the resistance is the constant that ties them together. The same ratio thinking sizes LEDs, prices parts, reads batteries and scales drawings.',
  essentialQuestion: 'How does proportional reasoning let a designer predict what a circuit will do before it is built?',
  standards: {
    ccss: [M('6.RP.A.2'), M('6.RP.A.3'), M('7.RP.A.1'), M('7.RP.A.2'), M('7.RP.A.3'), M('6.NS.C.5'), M('7.NS.A.1'), M('7.G.A.1')],
    ngss: ['MS-ETS1-1', 'MS-ETS1-2'],
    intl: { uk: 'KS3 Y7–Y8 Ratio, proportion and rates of change', cambridge: 'Lower Secondary Stage 7–8 Number: ratio and proportion', ib: 'MYP years 1–2 Number', singapore: 'Secondary 1 Ratio, rate and proportion' },
  },
  projectIds: ['stem-68-proj-lamp-enclosure'],
  museion: 'physics',
  lessons: [
    // ── L1 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u01-l1',
      title: 'Volts per Amp: Ohm’s Law as a Proportional Relationship',
      minutes: 50,
      strands: ['math', 'science'],
      mathFocus: 'proportional relationships and the constant of proportionality',
      objectives: [
        'I can build a table of voltage and current for one resistor and show the ratio V/I stays the same.',
        'I can identify the resistance as the constant of proportionality in V = I · R.',
        'I can explain why the graph of V against I is a straight line through the origin.',
      ],
      vocab: [
        ['voltage (V)', 'The electrical “push” between two points, measured in volts.'],
        ['current (I)', 'How much charge flows past a point each second, measured in amps (A). 1 mA = 0.001 A.'],
        ['resistance (R)', 'How strongly a part resists current, measured in ohms (Ω).'],
        ['constant of proportionality', 'The fixed number you multiply one quantity by to get the other; here V = R × I.'],
      ],
      hook: 'Two students turn the same dimmer knob, one on a 100 Ω resistor and one on a 330 Ω resistor. Both see the current rise as the voltage rises, but at different rates. What number is hiding in each resistor that sets the rate?',
      build: {
        title: 'Sweep a resistor in Electronics Lab',
        steps: [
          'Open Electronics Lab and describe the circuit: an adjustable battery, one 100 Ω resistor, a voltmeter across it and an ammeter in line.',
          'Set the supply to 1 V, 2 V, 3 V and 4 V. Record each current in a table, writing amps as decimals (10 mA = 0.01 A).',
          'Add a third column, V ÷ I, and compute it for every row. Circle what you notice.',
          'Swap in a 220 Ω resistor and repeat. Plot both sets of points on one V-vs-I graph.',
        ],
        launch: { room: 'elec', prompt: 'one 100 ohm resistor on an adjustable 0-5 V battery with a voltmeter across it and an ammeter in series', lesson: 'stem-68-u01-l1' },
        materials: [],
      },
      worked: [
        {
          prompt: 'A 330 Ω resistor is tested at 1.5 V, 3 V and 4.5 V. Predict the current at each, then show the relationship is proportional.',
          steps: [
            'Rearrange V = I · R to I = V ÷ R.',
            '1.5 ÷ 330 ≈ 0.0045 A; 3 ÷ 330 ≈ 0.0091 A; 4.5 ÷ 330 ≈ 0.0136 A.',
            'Check the ratio V ÷ I in each row: every row gives 330.',
            'A constant ratio and a (0, 0) starting point mean the relationship is proportional, with constant 330 Ω.',
          ],
          answer: 'About 4.5 mA, 9.1 mA and 13.6 mA; V/I = 330 Ω in every row, so V is proportional to I.',
        },
      ],
      practice: [
        { q: 'A 220 Ω resistor carries 0.02 A (20 mA). What voltage is across it?', answer: 'V = I · R = 0.02 × 220 = 4.4 V.', value: 4.4, unit: 'V', check: { f: 'ohmV', args: [0.02, 220] }, level: 1 },
        { q: 'Your table for one resistor reads 0.01 A → 1 V, 0.02 A → 2 V, 0.03 A → 3 V. What is the constant of proportionality V/I?', answer: '3 ÷ 0.03 = 100 Ω (every row gives 100).', value: 100, unit: 'Ω', check: { f: 'ohmR', args: [3, 0.03] }, level: 1 },
        { q: 'A V-vs-I graph is a straight line through (0 A, 0 V) and (0.025 A, 5 V). What is its slope, and what part does it describe?', answer: 'Slope = 5 ÷ 0.025 = 200 V per A, which is a 200 Ω resistor.', value: 200, unit: 'Ω', check: { f: 'slope', args: [0, 0, 0.025, 5] }, level: 2 },
        { q: 'A 3 × AA pack (4.5 V) is connected across a 150 Ω resistor. What current flows, in amps?', answer: 'I = 4.5 ÷ 150 = 0.03 A (30 mA).', value: 0.03, unit: 'A', tol: 0.0003, check: { f: 'ohmI', args: [4.5, 150] }, level: 2 },
        { q: 'A 100 Ω and a 220 Ω resistor are joined end to end (in series). What single resistor would act the same?', answer: 'Series resistances add: 100 + 220 = 320 Ω.', value: 320, unit: 'Ω', check: { f: 'series', args: [100, 220] }, level: 2 },
        { q: 'A mystery part gives (0.01 A, 1.5 V), (0.02 A, 3 V), (0.04 A, 6.5 V). Find V/I for the last point. Is the part proportional?', answer: '6.5 ÷ 0.04 = 162.5 Ω, but the first two rows give 150 Ω. The ratio changes, so it is not proportional.', value: 162.5, unit: 'Ω', check: { f: 'quotient', args: [6.5, 0.04] }, level: 3 },
      ],
      exitTicket: { q: 'On one graph, the 100 Ω line and the 220 Ω line both start at the origin. Which is steeper, and why?', answer: 'The 220 Ω line is steeper: its slope (V per A) is the resistance, and 220 > 100.' },
      differentiation: {
        support: ['Give a partly filled table with the V ÷ I column started.', 'Pre-convert currents to amps on a reference card (5 mA = 0.005 A, 20 mA = 0.02 A).'],
        extension: ['Plot I against V instead. What does the slope mean now? (1/R, the conductance.)', 'Predict the line for two 100 Ω resistors in series before you simulate it.'],
        ell: 'Sentence frame: “When the voltage doubles, the current ___ because ___.” Cognates: proporcional, constante, resistencia.',
        supports: ['readAloud', 'chunk', 'extraTime'],
      },
      safety: { level: 'sim-only', note: 'This lesson runs entirely in the simulator; no batteries are needed.' },
      standards: {
        ccss: [M('6.RP.A.3'), M('6.RP.A.3.A'), M('7.RP.A.2'), M('7.RP.A.2.B')],
        ngss: ['MS-ETS1-2'],
        intl: { ...INTL_G7, uk: 'KS3 Y8 Ratio and proportion: direct proportion graphs' },
      },
      museion: 'physics',
    },

    // ── L2 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u01-l2',
      title: 'Unit Rates on the Workbench: mA per LED, Cents per Part, Watts',
      minutes: 50,
      strands: ['math', 'engineering'],
      mathFocus: 'unit rates and unit pricing',
      objectives: [
        'I can find the current per LED in a lamp from its total current.',
        'I can compare parts deals using unit price.',
        'I can calculate power in watts as volts times amps and share it per LED.',
      ],
      vocab: [
        ['unit rate', 'How much of one quantity for exactly one of another, like 15 mA per LED.'],
        ['unit price', 'The cost of one item, found by dividing the total price by the number of items.'],
        ['power (P)', 'How fast energy is used, in watts: P = V × I.'],
        ['watt-hour (Wh)', 'Energy used by 1 watt running for 1 hour.'],
      ],
      hook: 'A parts website sells 25 LEDs for $3.75 and a lamp kit that says “90 mA total”. Neither number tells you what one LED costs or draws. How do designers turn bulk numbers into numbers for one?',
      build: {
        title: 'Read a lamp like a designer',
        steps: [
          'Open the LED lamp recipe on USB power with 6 white LEDs at normal brightness.',
          'Read the summary line: note the current per LED and the total current.',
          'Change to 3 LEDs, then 9. Record total current each time and divide by the number of LEDs.',
          'Multiply the supply voltage by the total current (in amps) to find the lamp’s power.',
        ],
        launch: { room: 'elec', template: 'lamp', starter: { values: { leds: 6, color: 'white', power: 'usb', brightness: 'normal' } }, lesson: 'stem-68-u01-l2' },
        materials: [],
      },
      worked: [
        {
          prompt: 'A lamp draws 75 mA from USB (5 V) with 5 LEDs. Find the current per LED and the power per LED.',
          steps: [
            'Current per LED: 75 mA ÷ 5 = 15 mA.',
            'Total power: 5 V × 0.075 A = 0.375 W.',
            'Power per LED: 0.375 W ÷ 5 = 0.075 W, or 75 mW.',
          ],
          answer: '15 mA per LED and 75 mW per LED (counting each LED with its resistor).',
        },
      ],
      practice: [
        { q: 'A lamp with 6 LEDs draws 90 mA in total. How many milliamps does each LED get?', answer: '90 ÷ 6 = 15 mA per LED.', value: 15, unit: 'mA', check: { f: 'quotient', args: [90, 6] }, level: 1 },
        { q: 'A bag of 25 LEDs costs $3.75. What is the cost per LED?', answer: '$3.75 ÷ 25 = $0.15 per LED.', value: 0.15, unit: '$', tol: 0.001, check: { f: 'quotient', args: [3.75, 25] }, level: 1 },
        { q: 'Resistors come 100 for $2.40 or 25 for $0.80. Find the unit price of the 100-pack in cents. Which is the better buy?', answer: '240 ¢ ÷ 100 = 2.4 ¢ each; the 25-pack is 80 ÷ 25 = 3.2 ¢ each, so the 100-pack is cheaper per resistor.', value: 2.4, unit: '¢', check: { f: 'quotient', args: [240, 100] }, level: 2 },
        { q: 'A USB lamp runs at 5 V and draws 0.09 A. What is its power?', answer: 'P = 5 × 0.09 = 0.45 W.', value: 0.45, unit: 'W', tol: 0.005, check: { f: 'power', args: [5, 0.09] }, level: 2 },
        { q: 'That 450 mW lamp has 6 LEDs. How many milliwatts is that per LED?', answer: '450 ÷ 6 = 75 mW per LED.', value: 75, unit: 'mW', check: { f: 'quotient', args: [450, 6] }, level: 2 },
        { q: 'The 0.45 W lamp stays on for 10 hours of homework. How much energy does it use?', answer: '0.45 W × 10 h = 4.5 Wh.', value: 4.5, unit: 'Wh', check: { f: 'product', args: [0.45, 10] }, level: 3 },
      ],
      exitTicket: { q: 'Explain in one sentence why “mA per LED” stays the same when you add more LEDs to the lamp recipe.', answer: 'Each LED has its own resistor across the same supply, so each gets the same current; adding LEDs adds to the total, not to each one.' },
      differentiation: {
        support: ['Use a double number line for LEDs and milliamps.', 'Give a unit-rate frame: “___ ÷ ___ = ___ per one.”'],
        extension: ['Find the cost per LED including its resistor and a share of the switch.', 'If electricity costs 15 ¢ per kWh, what does 4.5 Wh cost? (0.0675 ¢.)'],
        ell: 'Visual: a price tag split into equal parts. Frame: “Each ___ costs ___.”',
        supports: ['chunk', 'fewerChoices', 'extraTime'],
      },
      safety: { level: 'sim-only', note: 'Simulation only. The lamp recipe stays under 500 mA, which any USB port can supply.' },
      standards: {
        ccss: [M('6.RP.A.2'), M('6.RP.A.3.B'), M('7.RP.A.1')],
        ngss: ['MS-ETS1-1'],
        intl: { ...INTL_G6, uk: 'KS3 Y7 Ratio: unit rates and best buys' },
      },
      museion: 'engineering',
    },

    // ── L3 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u01-l3',
      title: 'Above and Below Ground: Negative Numbers in a Circuit',
      minutes: 50,
      strands: ['math', 'science'],
      mathFocus: 'signed numbers and distance on a number line',
      objectives: [
        'I can place circuit voltages above and below a 0 V reference (ground) on a vertical number line.',
        'I can find the voltage between two points as a difference of signed numbers.',
        'I can explain why swapping meter probes changes the sign but not the size of a reading.',
      ],
      vocab: [
        ['ground', 'The point we agree to call 0 V; every other voltage is measured from it.'],
        ['potential', 'The voltage of one point compared with ground; it can be positive or negative.'],
        ['split supply', 'Two batteries stacked with ground in the middle, giving + and − voltages.'],
      ],
      hook: 'Sea level is 0 m, a hill is +40 m and a mine shaft is −30 m. Electronics works the same way: we pick one wire and call it 0 V. What happens to the other numbers if we pick a different wire?',
      build: {
        title: 'Probe a split supply',
        steps: [
          'In Electronics Lab, stack two 3 V battery packs and mark the middle connection as ground.',
          'Add a red LED with a 220 Ω resistor from the top (+) to the bottom (−).',
          'Probe each node with the black lead on ground and record the potentials on a vertical number line.',
          'Move ground to the bottom of the stack and probe again. Compare the two number lines.',
        ],
        launch: { room: 'elec', prompt: 'two 3 V battery packs in series with ground at the middle, a 220 ohm resistor and a red LED from the top to the bottom', lesson: 'stem-68-u01-l3' },
        materials: [],
      },
      worked: [
        {
          prompt: 'With ground in the middle, the top is +3 V and the bottom is −3 V. What does a meter read with red on the top and black on the bottom? What if the probes are swapped?',
          steps: [
            'A meter reads V(red) − V(black).',
            'Red on top: 3 − (−3) = 3 + 3 = 6 V.',
            'Swapped: (−3) − 3 = −6 V.',
            'Same size, opposite sign: the distance between the points has not changed, only the direction.',
          ],
          answer: '+6 V, then −6 V when swapped.',
        },
      ],
      practice: [
        { q: 'Point A is at +3 V and point B is at −3 V. What is V(A) − V(B)?', answer: '3 − (−3) = 6 V.', value: 6, unit: 'V', check: { f: 'difference', args: [3, -3] }, level: 1 },
        { q: 'The red probe touches −3 V and the black probe touches +3 V. What does the meter show?', answer: '(−3) − 3 = −6 V. The negative sign means the red probe is on the lower point.', value: -6, unit: 'V', check: { f: 'difference', args: [-3, 3] }, level: 1 },
        { q: 'An LED’s anode is at +1.2 V and its cathode is at −0.8 V. What voltage is across the LED? Which colour could it be?', answer: '1.2 − (−0.8) = 2.0 V, the forward voltage of a red LED.', value: 2, unit: 'V', check: { f: 'difference', args: [1.2, -0.8] }, level: 2 },
        { q: 'A node reads +1.5 V when ground is in the middle of the stack. You move ground to the bottom, which used to read −3 V. What does that node read now?', answer: 'Measure from the new zero: 1.5 − (−3) = 4.5 V.', value: 4.5, unit: 'V', check: { f: 'difference', args: [1.5, -3] }, level: 2 },
        { q: 'How far above a −2.5 V node is ground?', answer: '0 − (−2.5) = 2.5 V above.', value: 2.5, unit: 'V', check: { f: 'difference', args: [0, -2.5] }, level: 2 },
        { q: 'Order these potentials from lowest to highest: +1.8 V, −2.5 V, 0 V, −0.5 V.', answer: '−2.5 V, −0.5 V, 0 V, +1.8 V.', level: 1 },
      ],
      exitTicket: { q: 'Your partner says “a negative voltage means the battery is backwards.” Write a better explanation.', answer: 'A negative potential only means the point is below the reference we called 0 V; pick a different reference and the same point can read positive.' },
      differentiation: {
        support: ['Use a vertical number-line thermometer strip to slide the zero.', 'Rewrite every subtraction of a negative as adding its opposite before computing.'],
        extension: ['Design a split supply that gives +4.5 V and −4.5 V. What is the total voltage across the stack?', 'Why do audio amplifiers often use split supplies? Research and explain in two sentences.'],
        ell: 'Frame: “Point ___ is ___ volts above/below ground.” Pair “above/below” with arrow gestures.',
        supports: ['readAloud', 'chunk', 'calm'],
      },
      safety: { level: 'sim-only', note: 'Simulation only. Stacking battery packs in real life raises the voltage; keep any physical stack at 6 V or less and never short the ends.' },
      standards: {
        ccss: [M('6.NS.C.5'), M('6.NS.C.6'), M('7.NS.A.1'), M('7.NS.A.1.C')],
        ngss: ['MS-ETS1-2'],
        intl: { ...INTL_G7, uk: 'KS3 Y8 Number: negative numbers and directed number' },
      },
      museion: 'physics',
    },

    // ── L4 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u01-l4',
      title: 'Sizing the LED Resistor and Reading the Battery in Percent',
      minutes: 55,
      strands: ['math', 'engineering', 'science'],
      mathFocus: 'multi-step ratio problems and percent',
      objectives: [
        'I can calculate an LED’s resistor with R = (Vs − Vf) ÷ I and pick the next standard value up.',
        'I can find the real current once a standard resistor is chosen.',
        'I can express battery use and brightness changes as percents and estimate run time.',
      ],
      vocab: [
        ['forward voltage (Vf)', 'The voltage an LED “uses up” when it lights: red 2.0 V, green 2.2 V, blue and white 3.0 V.'],
        ['current-limiting resistor', 'The resistor in series with an LED that sets how much current flows, so the LED does not burn out.'],
        ['mAh', 'Milliamp-hours: how much charge a battery holds. 2400 mAh can supply 24 mA for 100 hours.'],
        ['percent', 'A ratio out of 100.'],
      ],
      hook: 'Connect an LED straight to a battery and it flashes once and dies. Add the right resistor and it glows for weeks. How do you find “the right” resistor without guessing?',
      build: {
        title: 'Check the recipe’s resistor math',
        steps: [
          'Open the LED lamp recipe. Choose battery power (4.5 V), 1 red LED, normal brightness (15 mA).',
          'Before reading the answer, compute (4.5 − 2.0) ÷ 0.015 in your notebook.',
          'Compare with the resistor the recipe chose. It rounds up to a standard (E12) value; explain why up, not down.',
          'Switch the colour to blue, then the power to USB, and predict each resistor before you look.',
          'Use the summary’s total current and the 2400 mAh battery to estimate the run time.',
        ],
        launch: { room: 'elec', template: 'lamp', starter: { values: { leds: 1, color: 'red', power: 'battery', brightness: 'normal' } }, lesson: 'stem-68-u01-l4' },
        materials: ['3 × AA battery holder with switch (optional)', '5 mm LEDs (red, blue)', 'Resistor assortment (100 Ω–1 kΩ)', 'Solderless breadboard and jumper wires'],
      },
      worked: [
        {
          prompt: 'A white LED (Vf = 3.0 V) runs from USB 5 V at 15 mA. Size the resistor, then find the real current with the standard value.',
          steps: [
            'Voltage left for the resistor: 5 − 3.0 = 2.0 V.',
            'Convert current: 15 mA = 0.015 A.',
            'R = 2.0 ÷ 0.015 ≈ 133 Ω. The next standard value up is 150 Ω.',
            'Real current: 2.0 ÷ 150 ≈ 0.0133 A, about 13 mA: slightly dimmer and safely below the limit.',
          ],
          answer: 'Calculate about 133 Ω, use 150 Ω, which gives about 13 mA.',
        },
      ],
      practice: [
        { q: 'USB 5 V, red LED (Vf 2.0 V), 15 mA. What resistor does the formula give?', answer: '(5 − 2.0) ÷ 0.015 = 200 Ω; use the next standard value, 220 Ω.', value: 200, unit: 'Ω', check: { f: 'ledR', args: [5, 2.0, 0.015] }, level: 1 },
        { q: 'Battery 4.5 V, blue LED (Vf 3.0 V), 15 mA. What resistor?', answer: '(4.5 − 3.0) ÷ 0.015 = 100 Ω.', value: 100, unit: 'Ω', check: { f: 'ledR', args: [4.5, 3.0, 0.015] }, level: 1 },
        { q: 'USB 5 V, green LED (Vf 2.2 V), bright setting 19 mA. What resistor does the formula give, and which standard value do you buy?', answer: '(5 − 2.2) ÷ 0.019 ≈ 147.4 Ω; buy 150 Ω (round up).', value: 147.4, unit: 'Ω', check: { f: 'ledR', args: [5, 2.2, 0.019] }, level: 2 },
        { q: 'You used 220 Ω for the red LED on 5 V, so 3 V is across the resistor. What current really flows, in mA? (Hint: 3000 mV ÷ 220 Ω gives mA.)', answer: '3000 ÷ 220 ≈ 13.6 mA.', value: 13.64, unit: 'mA', check: { f: 'quotient', args: [3000, 220] }, level: 2 },
        { q: 'A 2400 mAh battery pack has delivered 1800 mAh. What percent of its charge is used?', answer: '1800 ÷ 2400 = 0.75 = 75% used (25% left).', value: 75, unit: '%', check: { f: 'pct', args: [1800, 2400] }, level: 1 },
        { q: 'A three-LED battery lamp draws 45 mA. About how many hours will a 2400 mAh pack last?', answer: '2400 ÷ 45 ≈ 53.3 hours.', value: 53.33, unit: 'h', check: { f: 'batteryHours', args: [2400, 45] }, level: 2 },
        { q: 'Switching from normal (15 mA) to bright (19 mA) raises the current by 4 mA. What percent increase is that?', answer: '4 ÷ 15 ≈ 0.267 = about 26.7% more current.', value: 26.67, unit: '%', check: { f: 'pct', args: [4, 15] }, level: 3 },
      ],
      exitTicket: { q: 'Why do designers round an LED resistor up to the next standard value instead of down?', answer: 'A bigger resistor means a little less current, which keeps the LED under its limit; rounding down would push the current above the design value.' },
      differentiation: {
        support: ['Provide an LED colour card with Vf values.', 'Use a three-box organiser: “volts left over”, “amps”, “divide”.'],
        extension: ['Two red LEDs in series on 5 V: what resistor now? ((5 − 4.0) ÷ 0.015 ≈ 67 Ω.)', 'How much power does the 220 Ω resistor turn into heat? (3 V × 0.0136 A ≈ 0.041 W.)'],
        ell: 'Frame: “The resistor gets ___ volts because the LED uses ___.” Cognates: porcentaje, batería, resistencia.',
        supports: ['chunk', 'untimed', 'schedule', 'extraTime'],
      },
      safety: { level: 'low', note: `${BATTERY_SAFETY} LEDs only go in one way round: long leg (anode) toward +.` },
      standards: {
        ccss: [M('7.RP.A.3'), M('6.RP.A.3.C'), M('7.EE.B.3'), M('7.RP.A.2.C')],
        ngss: ['MS-ETS1-1', 'MS-ETS1-2'],
        intl: { ...INTL_G7, uk: 'KS3 Y8 Ratio: percentage change and multi-step problems' },
      },
      museion: 'engineering',
    },

    // ── L5 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u01-l5',
      title: 'Drawn to Scale: The Circuit Board and Its Box',
      minutes: 50,
      strands: ['math', 'engineering', 'technology'],
      mathFocus: 'scale drawings and scale factor (lengths and areas)',
      objectives: [
        'I can make a scale drawing of a 70 × 50 mm circuit board and its enclosure.',
        'I can convert between drawing lengths and real lengths with a scale factor.',
        'I can explain why area grows by the square of the scale factor.',
      ],
      vocab: [
        ['scale factor', 'The number you multiply real lengths by to get drawing lengths (2 for a 2:1 drawing).'],
        ['scale drawing', 'A drawing where every length is the real length times the same scale factor.'],
        ['clearance', 'Extra space left around a part so it fits inside its box.'],
      ],
      hook: 'Engineers draw tiny circuit boards bigger than life so they can see every hole, and big buildings smaller than life so they fit on paper. What has to stay the same for a drawing to be “to scale”?',
      build: {
        title: 'Model the lamp base in Build Studio',
        steps: [
          'Draw the 70 × 50 mm perfboard at 2:1 on grid paper and mark three LED holes 7 mm apart.',
          'In Build Studio, place a box for the base: board size plus 3 mm clearance on every side, 30 mm tall.',
          'Subtract three cylinders for the LED holes, using the real spacing from your drawing.',
          'Measure your model with the ruler tool and check it against the drawing ÷ 2.',
        ],
        launch: { room: 'studio', starter: { shapes: ['box', 'cylinder'], note: 'Base 76 × 56 × 30 mm; LED holes 5 mm, 7 mm apart.' }, prompt: 'a lamp base box sized for a 70 by 50 mm circuit board with 3 mm clearance and three 5 mm LED holes in the lid', lesson: 'stem-68-u01-l5' },
        materials: ['Grid paper', 'Ruler (mm)'],
      },
      worked: [
        {
          prompt: 'A 2:1 drawing shows the board 140 mm long and the switch hole 12 mm wide. Find the real sizes, then the real board area.',
          steps: [
            'Scale factor 2 means real = drawing ÷ 2.',
            'Board: 140 ÷ 2 = 70 mm. Switch hole: 12 ÷ 2 = 6 mm.',
            'Real board area: 70 × 50 = 3500 mm².',
            'Drawing area: 140 × 100 = 14 000 mm², which is 4 times as much (2 × 2).',
          ],
          answer: '70 mm board, 6 mm hole; real area 3500 mm², drawing area 4 × larger.',
        },
      ],
      practice: [
        { q: 'The real board is 50 mm wide. How wide is it on a 2:1 drawing?', answer: '50 × 2 = 100 mm.', value: 100, unit: 'mm', check: { f: 'product', args: [50, 2] }, level: 1 },
        { q: 'On a 3:1 drawing, two LED holes are 21 mm apart. How far apart are they on the real board?', answer: '21 ÷ 3 = 7 mm.', value: 7, unit: 'mm', check: { f: 'quotient', args: [21, 3] }, level: 1 },
        { q: 'A drawing shows a 70 mm board edge as 140 mm. What is the scale factor?', answer: '140 ÷ 70 = 2 (a 2:1 drawing).', value: 2, check: { f: 'quotient', args: [140, 70] }, level: 1 },
        { q: 'What is the real area of the 70 × 50 mm board?', answer: '70 × 50 = 3500 mm².', value: 3500, unit: 'mm²', check: { f: 'area', args: [70, 50] }, level: 2 },
        { q: 'On the 2:1 drawing, what area does the board cover?', answer: 'Area scales by 2 × 2 = 4: 3500 × 4 = 14 000 mm².', value: 14000, unit: 'mm²', check: { f: 'product', args: [3500, 4] }, level: 3 },
        { q: 'With 3 mm clearance on every side, the box inside is 76 × 56 mm. What is its inside perimeter (for a gasket strip)?', answer: '2 × (76 + 56) = 264 mm.', value: 264, unit: 'mm', check: { f: 'perimeter', args: [76, 56] }, level: 2 },
        { q: 'A 1:2 sketch (half size) shows a lid that is really 180 mm long. How long is it on paper?', answer: '180 ÷ 2 = 90 mm.', value: 90, unit: 'mm', check: { f: 'quotient', args: [180, 2] }, level: 2 },
      ],
      exitTicket: { q: 'A classmate doubles every length on their drawing and says the area doubles too. Correct them with numbers.', answer: 'A 70 × 50 board is 3500 mm²; doubled to 140 × 100 it is 14 000 mm², four times as much, because both length and width doubled.' },
      differentiation: {
        support: ['Pre-print the board outline at 1:1 to trace and enlarge.', 'Use a two-column ratio table: drawing mm | real mm.'],
        extension: ['If the box is 30 mm tall, by what factor does volume change at 2:1? (8.)', 'Add a 0.3 mm print tolerance to each LED hole and explain why.'],
        ell: 'Frame: “On the drawing it is ___ mm, so in real life it is ___ mm.” Visual: side-by-side boards.',
        supports: ['chunk', 'fewerChoices', 'untimed'],
      },
      safety: { level: 'sim-only', note: 'Design work only. If the base is 3D-printed later, an adult runs the printer and removes parts once the bed has cooled.' },
      standards: {
        ccss: [M('7.G.A.1'), M('6.RP.A.3.D'), M('7.G.B.6')],
        ngss: ['MS-ETS1-2'],
        intl: { ...INTL_G7, uk: 'KS3 Y8 Geometry: scale drawings and enlargement' },
      },
      museion: 'mathematics',
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// u02 · Fields & Forces (outline)
// ════════════════════════════════════════════════════════════════════════════

const U02: StemUnit = {
  id: 'stem-68-u02',
  band: '6-8',
  n: 2,
  title: 'Fields & Forces: Electromagnets, Speakers and Motors',
  kind: 'science',
  strands: ['science', 'engineering'],
  status: 'outline',
  weeks: 3,
  bigIdea: 'Electric current makes magnetic fields, and fields push on magnets and wires without touching them. Coils, speakers and motors are the same idea arranged differently.',
  essentialQuestion: 'How can an invisible field push something across a gap, and how do engineers make that push stronger?',
  standards: { ngss: ['MS-PS2-3', 'MS-PS2-5', 'MS-PS3-2'], ccss: [M('7.SP.A.2')], intl: { uk: 'KS3 Physics: magnetism and electromagnets', cambridge: 'Lower Secondary Stage 8 Physics: magnetism', ib: 'MYP year 2 Sciences', singapore: 'Lower Secondary Science: magnets and electromagnets' } },
  lessons: [],
  outline: [
    'Invisible pushes: mapping magnetic fields with compasses',
    'Turns and current: what makes an electromagnet stronger (a fair test)',
    'Inside a speaker: a coil, a magnet and a cone (the speaker recipe)',
    'Motion from current: build and explain a simple motor',
    'Forces at a distance: graphing pull against gap size',
  ],
  projectIds: [],
  museion: 'physics',
};

// ════════════════════════════════════════════════════════════════════════════
// u03 · Code a Controller (outline)
// ════════════════════════════════════════════════════════════════════════════

const U03: StemUnit = {
  id: 'stem-68-u03',
  band: '6-8',
  n: 3,
  title: 'Code a Controller: Variables, Loops and Functions on a Pico',
  kind: 'technology',
  strands: ['technology', 'engineering', 'math'],
  status: 'outline',
  weeks: 4,
  bigIdea: 'A microcontroller runs one loop forever: read the inputs, decide, act. Variables remember, conditionals decide, and functions package a job so it can be reused.',
  essentialQuestion: 'How does a few dozen lines of code turn knobs and buttons into music?',
  standards: { csta: ['2-AP-10', '2-AP-11', '2-AP-12', '2-AP-13', '2-CS-02'], ccss: [M('6.EE.A.2'), M('7.RP.A.2')], intl: { uk: 'KS3 Computing: variables, selection, iteration and procedures', cambridge: 'Lower Secondary Computing Stage 8: programming', ib: 'MYP Design year 2: digital design', singapore: 'Lower Secondary Computing: programming' } },
  lessons: [],
  outline: [
    'Reading the firmware: what each line of the MIDI controller code does',
    'Variables that remember: last values and why the code compares them',
    'Loops and conditionals: scanning knobs and buttons',
    'Map a range: from 0–65535 to 0–127 with division and bit shifts',
    'Write your own function: a scale or chord button',
    'Test, debug and jam: playing the class controllers in Chora',
  ],
  projectIds: [],
  museion: 'cs',
};

// ════════════════════════════════════════════════════════════════════════════
// u04 · Classroom Weather Station (technology, complete)
// ════════════════════════════════════════════════════════════════════════════

const SENSOR_SAFETY = 'Simulate first. A physical sensor runs only from a listed 5 V USB supply, never mains wiring. Keep the board dry outdoors and unplug it before moving wires.';

const U04: StemUnit = {
  id: 'stem-68-u04',
  band: '6-8',
  n: 4,
  title: 'Classroom Weather Station: Sensors, Data and Design',
  kind: 'technology',
  strands: ['technology', 'math', 'engineering', 'science'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'A sensor is only as good as the data it produces. Choosing how often to sample, cleaning out errors, summarising with mean and range, and redesigning the instrument are how a gadget becomes a scientific tool.',
  essentialQuestion: 'How do we know a temperature reading is telling the truth?',
  standards: {
    csta: ['2-DA-07', '2-DA-08', '2-DA-09', '2-AP-11', '2-CS-02'],
    ngss: ['MS-ETS1-1', 'MS-ETS1-2', 'MS-ETS1-3', 'MS-ETS1-4'],
    ccss: [M('6.SP.B.5'), M('6.SP.A.3'), M('7.SP.B.3')],
    intl: { uk: 'KS3 Y7–Y8 Statistics; Computing: data and sensing', cambridge: 'Lower Secondary Stage 7–8 Statistics and probability', ib: 'MYP years 1–2 Design and Mathematics', singapore: 'Secondary 1 Statistics: data handling' },
  },
  projectIds: ['stem-68-proj-weather-station'],
  museion: 'data',
  lessons: [
    // ── L1 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u04-l1',
      title: 'Meet the Sensor: Inputs, Outputs and the Update Interval',
      minutes: 50,
      strands: ['technology', 'math'],
      mathFocus: 'rates: samples per hour and per day',
      objectives: [
        'I can trace how a temperature reading travels from the sensor chip to the screen.',
        'I can change a variable in the device configuration and predict its effect.',
        'I can calculate how many readings a sensor makes per hour and per day.',
      ],
      vocab: [
        ['sensor', 'A part that turns something in the world (heat, light, pressure) into an electrical signal.'],
        ['microcontroller', 'A tiny computer on one chip that reads sensors and runs a program; here an ESP32.'],
        ['update interval', 'How many seconds the device waits between readings.'],
        ['I²C', 'A two-wire “conversation” (SDA for data, SCL for clock) between the microcontroller and the sensor.'],
      ],
      hook: 'Your phone says it is 18 °C, the classroom thermostat says 22 °C, and the window sill feels hotter than both. Which one is right? This unit we build our own instrument and find out.',
      build: {
        title: 'Simulate the Wi-Fi environment sensor',
        steps: [
          'Open the Wi-Fi environment sensor recipe and find the three parts: USB power, ESP32 and BME280 sensor.',
          'Trace the two I²C wires (SDA and SCL) from the ESP32 to the sensor. Label them on the schematic.',
          'Open the firmware file and find update_interval. Change it from 60 s to 10 s and regenerate.',
          'Fill in a table: interval (s) → readings per hour → readings per day.',
        ],
        launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 60 } }, lesson: 'stem-68-u04-l1' },
        materials: [],
      },
      worked: [
        {
          prompt: 'The sensor reports every 30 s. How many readings per hour, and per school day of 7 hours?',
          steps: [
            'One hour is 3600 s.',
            '3600 ÷ 30 = 120 readings per hour.',
            '120 × 7 = 840 readings in a 7-hour school day.',
          ],
          answer: '120 per hour, 840 per school day.',
        },
      ],
      practice: [
        { q: 'With update_interval set to 60 s, how many readings does the sensor send per hour?', answer: '3600 ÷ 60 = 60 readings.', value: 60, unit: 'readings', check: { f: 'quotient', args: [3600, 60] }, level: 1 },
        { q: 'At the fastest setting, 5 s, how many readings per hour?', answer: '3600 ÷ 5 = 720 readings.', value: 720, unit: 'readings', check: { f: 'quotient', args: [3600, 5] }, level: 1 },
        { q: 'At 60 readings per hour, how many readings in a full 24-hour day?', answer: '60 × 24 = 1440 readings.', value: 1440, unit: 'readings', check: { f: 'product', args: [60, 24] }, level: 1 },
        { q: 'The station draws 0.12 A from a 5 V USB supply. What is its power?', answer: 'P = 5 × 0.12 = 0.6 W.', value: 0.6, unit: 'W', tol: 0.006, check: { f: 'power', args: [5, 0.12] }, level: 2 },
        { q: 'Each reading stores 12 bytes (temperature, humidity, pressure). How many bytes per day at 1440 readings?', answer: '1440 × 12 = 17 280 bytes (about 17 kB).', value: 17280, unit: 'bytes', check: { f: 'product', args: [1440, 12] }, level: 3 },
        { q: 'Which line in the firmware sets how often the sensor reads, and what kind of thing is it in programming terms?', answer: 'update_interval: a variable (a named setting) whose value the program uses.', level: 2 },
      ],
      exitTicket: { q: 'Give one reason to read every 5 s and one reason to read only every 60 s.', answer: 'Every 5 s catches fast changes (a door opening); every 60 s uses less power, network and storage and is plenty for room temperature.' },
      differentiation: {
        support: ['Provide a labelled diagram of the three parts and two wires.', 'Give the 3600 s fact on a card.'],
        extension: ['How many readings in a 180-day school year at 60 s for 7 h a day? (75 600.)', 'Read the sensor note: why does the ESP32 sit away from the sensor?'],
        ell: 'Frame: “The ___ sends the reading to the ___ through the ___ wire.” Cognates: sensor, temperatura, intervalo.',
        supports: ['readAloud', 'chunk', 'extraTime'],
      },
      safety: { level: 'sim-only', note: 'Simulation only in this lesson.' },
      standards: {
        csta: ['2-CS-02', '2-AP-11', '2-DA-07'],
        ccss: [M('6.RP.A.3.B')],
        ngss: ['MS-ETS1-1'],
        intl: { ...INTL_G6, uk: 'KS3 Y7 Computing: hardware, software and sensing' },
      },
      museion: 'cs',
    },

    // ── L2 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u04-l2',
      title: 'Clean Data: Mean, Range and the Warm-Board Error',
      minutes: 50,
      strands: ['math', 'technology', 'science'],
      mathFocus: 'mean and range; effect of an outlier',
      objectives: [
        'I can summarise a set of temperature readings with the mean and the range.',
        'I can spot an outlier and show how much it pulls the mean.',
        'I can correct a reading for a known, systematic error.',
      ],
      vocab: [
        ['mean', 'Add all the values and divide by how many there are.'],
        ['range', 'Largest value minus smallest value: how spread out the data is.'],
        ['outlier', 'A value far from the others, often caused by a mistake or an unusual event.'],
        ['systematic error', 'An error that pushes every reading the same way, like a sensor sitting next to a warm chip.'],
      ],
      hook: 'Five readings in five minutes: 21.6, 21.8, 21.7, 25.9, 21.9 °C. Somebody breathed on the sensor. Should 25.9 count?',
      build: {
        title: 'Log readings and hunt for errors',
        steps: [
          'Run the sensor simulation with update_interval at 10 s and log five minutes of temperatures.',
          'Compute the mean and range of your log.',
          'Move the sensor right next to the ESP32 in the layout and log again. Compare means: that gap is the board’s warmth.',
          'Write a one-line correction rule and apply it to the second log.',
        ],
        launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 10 } }, lesson: 'stem-68-u04-l2' },
        materials: [],
      },
      worked: [
        {
          prompt: 'Readings: 20.8, 21.2, 21.0, 21.4 °C. Find the mean and range.',
          steps: [
            'Sum: 20.8 + 21.2 + 21.0 + 21.4 = 84.4.',
            'Mean: 84.4 ÷ 4 = 21.1 °C.',
            'Range: 21.4 − 20.8 = 0.6 °C.',
          ],
          answer: 'Mean 21.1 °C, range 0.6 °C.',
        },
      ],
      practice: [
        { q: 'Find the mean of 21.4, 21.9, 22.3, 21.8 and 22.1 °C.', answer: 'Sum 109.5 ÷ 5 = 21.9 °C.', value: 21.9, unit: '°C', check: { f: 'mean', args: [21.4, 21.9, 22.3, 21.8, 22.1] }, level: 1 },
        { q: 'Find the range of the same five readings.', answer: '22.3 − 21.4 = 0.9 °C.', value: 0.9, unit: '°C', check: { f: 'range', args: [21.4, 21.9, 22.3, 21.8, 22.1] }, level: 1 },
        { q: 'Find the mean of 21.6, 21.8, 21.7, 25.9 and 21.9 °C, including the outlier.', answer: 'Sum 112.9 ÷ 5 = 22.58 °C.', value: 22.58, unit: '°C', check: { f: 'mean', args: [21.6, 21.8, 21.7, 25.9, 21.9] }, level: 2 },
        { q: 'Now leave out 25.9 °C. What is the mean of the other four?', answer: 'Sum 87.0 ÷ 4 = 21.75 °C. The one outlier raised the mean by about 0.8 °C.', value: 21.75, unit: '°C', check: { f: 'mean', args: [21.6, 21.8, 21.7, 21.9] }, level: 2 },
        { q: 'A sensor mounted against the ESP32 reads 1.5 °C warm. It shows 23.4 °C. What is the corrected temperature?', answer: '23.4 − 1.5 = 21.9 °C.', value: 21.9, unit: '°C', check: { f: 'difference', args: [23.4, 1.5] }, level: 2 },
        { q: 'Is it honest to delete an outlier? Describe when you would and would not.', answer: 'Remove it only with a known cause (someone breathed on it) and say so in your report; keep it if it might be a real event, like sun hitting the window.', level: 3 },
      ],
      exitTicket: { q: 'Two logs both have a mean of 21.9 °C. One has range 0.4 °C, the other 3.2 °C. What does that tell you?', answer: 'The second room’s temperature swings much more (or that sensor is noisier); the mean alone hides the difference.' },
      differentiation: {
        support: ['Allow a calculator and a pre-made sum column.', 'Colour-code the largest and smallest values before finding the range.'],
        extension: ['Find the median of the outlier set and compare how much it moved versus the mean.', 'Plot both logs as dot plots and describe their shapes.'],
        ell: 'Frame: “The mean is ___ and the range is ___, so the data is ___.” Cognates: media, rango, error.',
        supports: ['chunk', 'untimed', 'fewerChoices'],
      },
      safety: { level: 'sim-only', note: 'Simulation only. Breathing on a real sensor is fine; touching the board while plugged in is not a habit to start.' },
      standards: {
        csta: ['2-DA-08', '2-DA-07'],
        ccss: [M('6.SP.B.5.C'), M('6.SP.A.3')],
        ngss: ['MS-ETS1-3'],
        intl: { ...INTL_G6, uk: 'KS3 Y7 Statistics: mean and range' },
      },
      museion: 'data',
    },

    // ── L3 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u04-l3',
      title: 'Compare and Predict: Which Spot Is Warmest?',
      minutes: 50,
      strands: ['math', 'science', 'technology'],
      mathFocus: 'comparing data sets; rate of change',
      objectives: [
        'I can compare two locations using their means and ranges.',
        'I can find a rate of change in °C per hour from two readings.',
        'I can use a rate to make and test a short prediction.',
      ],
      vocab: [
        ['rate of change', 'How fast a quantity changes, such as degrees per hour.'],
        ['variability', 'How much values differ from each other; range is one measure.'],
        ['model', 'A simplified rule or picture used to explain or predict.'],
      ],
      hook: 'The class splits into teams and places stations on the window sill, in the hallway and by the door. By lunch the window team is sure theirs is warmest. What evidence would convince a skeptic?',
      build: {
        title: 'Two stations, one question',
        steps: [
          'Open the sensor recipe twice (or share with a partner): name one “Window” and one “Hallway”.',
          'Enter the morning logs from your class sheet into each station’s data table.',
          'Make a line graph of both stations on the same axes, time on the horizontal axis.',
          'Compute each station’s mean, range and warming rate, then write a claim with evidence.',
        ],
        launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 60 }, note: 'Make two copies: Window and Hallway.' }, lesson: 'stem-68-u04-l3' },
        materials: [],
      },
      worked: [
        {
          prompt: 'The hallway reads 19.6 °C at 9:00 and 20.4 °C at 13:00. Find the warming rate.',
          steps: [
            'Change in temperature: 20.4 − 19.6 = 0.8 °C.',
            'Change in time: 13 − 9 = 4 hours.',
            'Rate: 0.8 ÷ 4 = 0.2 °C per hour.',
          ],
          answer: '0.2 °C per hour.',
        },
      ],
      practice: [
        { q: 'Window readings: 22.4, 23.1, 24.0, 24.5 °C. Find the mean.', answer: 'Sum 94.0 ÷ 4 = 23.5 °C.', value: 23.5, unit: '°C', check: { f: 'mean', args: [22.4, 23.1, 24.0, 24.5] }, level: 1 },
        { q: 'Hallway readings at the same times: 20.1, 20.3, 20.2, 20.4 °C. Find the mean.', answer: 'Sum 81.0 ÷ 4 = 20.25 °C.', value: 20.25, unit: '°C', check: { f: 'mean', args: [20.1, 20.3, 20.2, 20.4] }, level: 1 },
        { q: 'How much warmer is the window on average?', answer: '23.5 − 20.25 = 3.25 °C.', value: 3.25, unit: '°C', check: { f: 'difference', args: [23.5, 20.25] }, level: 1 },
        { q: 'What is the range of the window readings? Compare with the hallway range of 0.3 °C.', answer: '24.5 − 22.4 = 2.1 °C: the window varies seven times as much as the hallway.', value: 2.1, unit: '°C', check: { f: 'range', args: [22.4, 23.1, 24.0, 24.5] }, level: 2 },
        { q: 'The window reads 18.2 °C at 8:00 and 22.7 °C at 11:00. What is its warming rate?', answer: '(22.7 − 18.2) ÷ (11 − 8) = 4.5 ÷ 3 = 1.5 °C per hour.', value: 1.5, unit: '°C/h', check: { f: 'slope', args: [8, 18.2, 11, 22.7] }, level: 2 },
        { q: 'If that rate holds, what will the window read at 12:00?', answer: '22.7 + 1.5 = 24.2 °C (a prediction to test, since sun angle changes).', value: 24.2, unit: '°C', check: { f: 'sum', args: [22.7, 1.5] }, level: 3 },
      ],
      exitTicket: { q: 'Write a claim about the warmest spot using one mean and one range as evidence.', answer: 'Sample: The window is warmest, with a mean 3.25 °C above the hallway, but its 2.1 °C range shows it also changes the most as the sun moves.' },
      differentiation: {
        support: ['Provide graph axes already scaled.', 'Give a claim-evidence-reasoning organiser.'],
        extension: ['Why might a straight-line prediction fail by 15:00? Sketch what you expect.', 'Add a third station and rank all three by mean and by range.'],
        ell: 'Frame: “I claim ___ because the mean is ___ and the range is ___.”',
        supports: ['readAloud', 'chunk', 'extraTime'],
      },
      safety: { level: 'low', note: SENSOR_SAFETY },
      standards: {
        csta: ['2-DA-08', '2-DA-09'],
        ccss: [M('7.SP.B.3'), M('6.SP.B.5'), M('8.F.B.4')],
        ngss: ['MS-ETS1-3'],
        intl: { ...INTL_G7, uk: 'KS3 Y8 Statistics: comparing distributions' },
      },
      museion: 'data',
    },

    // ── L4 ─────────────────────────────────────────────────────────────────
    {
      id: 'stem-68-u04-l4',
      title: 'Engineering a Radiation Shield: Design, Test, Improve',
      minutes: 55,
      strands: ['engineering', 'science', 'math', 'technology'],
      mathFocus: 'mean of repeated trials and percent improvement',
      objectives: [
        'I can write criteria and constraints for a sensor shield.',
        'I can compare two designs using the mean error of repeated trials.',
        'I can express a design improvement as a percent and choose a design with evidence.',
      ],
      vocab: [
        ['criteria', 'What a design must do to succeed (reads within 1 °C of shade).'],
        ['constraints', 'Limits on the design (under 2 hours of printing, fits the sensor).'],
        ['radiation shield', 'A shaded, vented housing that keeps sunlight off a sensor while air still flows past it.'],
        ['trial', 'One run of a test; repeating trials shows whether a result is reliable.'],
      ],
      hook: 'Put the station in direct sun and it reports 31 °C on a 24 °C day. The air is not that hot: the sensor is. How do professional weather stations solve this, and can we do it with a 3D printer?',
      build: {
        title: 'Design a louvred shield in Build Studio',
        steps: [
          'List two criteria and two constraints with your team.',
          'In Build Studio, stack cones or thin cylinders with gaps to make a louvred shield around a box-shaped sensor.',
          'Estimate print time per plate and total, and check it against your constraint.',
          'Run the class sun test: bare sensor, Shield A, Shield B, three trials each, against a shaded reference.',
          'Compute each design’s mean error and choose, or combine, the best features.',
        ],
        launch: { room: 'studio', starter: { shapes: ['cone', 'cylinder', 'box'], note: 'Stack 4-6 plates with 8 mm air gaps around the sensor box.' }, prompt: 'a louvred radiation shield of stacked white plates with air gaps around a small weather sensor', lesson: 'stem-68-u04-l4' },
        materials: ['White card or 3D-printed plates', 'Spacers or dowel', 'Shaded reference thermometer'],
      },
      worked: [
        {
          prompt: 'A bare sensor in the sun reads 30.0 °C while the shade reference reads 24.0 °C. With a shield it reads 25.5 °C. By what percent did the shield cut the error?',
          steps: [
            'Bare error: 30.0 − 24.0 = 6.0 °C.',
            'Shielded error: 25.5 − 24.0 = 1.5 °C.',
            'Error removed: 6.0 − 1.5 = 4.5 °C.',
            'Percent: 4.5 ÷ 6.0 = 0.75 = 75%.',
          ],
          answer: 'The shield cut the error by 75%.',
        },
      ],
      practice: [
        { q: 'In the sun, the bare sensor reads 31.2 °C and the shaded reference reads 24.0 °C. How big is the error?', answer: '31.2 − 24.0 = 7.2 °C.', value: 7.2, unit: '°C', check: { f: 'difference', args: [31.2, 24.0] }, level: 1 },
        { q: 'Shield A errors over three trials: 2.1, 1.8, 2.4 °C. Find the mean error.', answer: '6.3 ÷ 3 = 2.1 °C.', value: 2.1, unit: '°C', check: { f: 'mean', args: [2.1, 1.8, 2.4] }, level: 1 },
        { q: 'Shield B errors: 1.2, 1.5, 0.9 °C. Find the mean error.', answer: '3.6 ÷ 3 = 1.2 °C.', value: 1.2, unit: '°C', check: { f: 'mean', args: [1.2, 1.5, 0.9] }, level: 1 },
        { q: 'What is the range of Shield B’s trials?', answer: '1.5 − 0.9 = 0.6 °C.', value: 0.6, unit: '°C', check: { f: 'range', args: [1.2, 1.5, 0.9] }, level: 2 },
        { q: 'Shield B reduced the 7.2 °C error to 1.2 °C, removing 6.0 °C. What percent of the error did it remove?', answer: '6.0 ÷ 7.2 ≈ 0.833 = about 83.3%.', value: 83.33, unit: '%', check: { f: 'pct', args: [6, 7.2] }, level: 2 },
        { q: 'Shield B has 5 plates at 18 minutes each. What is its total print time, and does it meet a 2-hour constraint?', answer: '5 × 18 = 90 minutes, under the 120-minute limit.', value: 90, unit: 'min', check: { f: 'product', args: [5, 18] }, level: 2 },
      ],
      exitTicket: { q: 'Shield A is cheaper; Shield B is more accurate. Which would you choose for the school station and why?', answer: 'Answers vary; a strong one cites the criterion (within 1–2 °C), the mean errors 2.1 vs 1.2 °C, and the constraint (90 min print fits).' },
      differentiation: {
        support: ['Give a filled-in decision matrix with two rows to complete.', 'Pair with a test lead who runs the timer.'],
        extension: ['Design Shield C combining A’s cost with B’s gaps; predict its error.', 'Research why commercial shields are white and louvred and write two sentences.'],
        ell: 'Frame: “Our design meets the criterion because ___. It fits the constraint because ___.”',
        supports: ['chunk', 'schedule', 'calm'],
      },
      safety: { level: 'supervised', note: `${SENSOR_SAFETY} An adult runs the 3D printer (hot nozzle and bed) and any craft-knife cutting of card plates.` },
      standards: {
        ngss: ['MS-ETS1-1', 'MS-ETS1-2', 'MS-ETS1-3', 'MS-ETS1-4'],
        csta: ['2-DA-09'],
        ccss: [M('7.RP.A.3'), M('6.SP.B.5')],
        intl: { ...INTL_G7, uk: 'KS3 Design and technology: iterative design and testing' },
      },
      museion: 'engineering',
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// u05–u08 · outlines
// ════════════════════════════════════════════════════════════════════════════

const U05: StemUnit = {
  id: 'stem-68-u05',
  band: '6-8',
  n: 5,
  title: 'Design for Fabrication: Scale, Tolerance and Print Time',
  kind: 'engineering',
  strands: ['engineering', 'technology', 'math'],
  status: 'outline',
  weeks: 3,
  bigIdea: 'A design that looks right on screen still has to be made. Scale, tolerances, wall thickness and print time decide whether a part fits, holds and finishes before the bell.',
  essentialQuestion: 'What changes when a design leaves the screen and becomes a real object?',
  standards: { ngss: ['MS-ETS1-2', 'MS-ETS1-4'], ccss: [M('7.G.A.1'), M('7.G.B.6'), M('7.RP.A.2')], intl: { uk: 'KS3 Design and technology: CAD/CAM', cambridge: 'Lower Secondary Stage 8 Geometry and measure', ib: 'MYP Design year 2: product design', singapore: 'Lower Secondary Design & Technology' } },
  lessons: [],
  outline: [
    'From sketch to solid: primitives and holes in Build Studio',
    'Tolerance: why a 20 mm peg will not fit a 20 mm hole',
    'Volume, infill and estimating print time',
    'Joints that work: snap fits, screw bosses and lids',
    'Test print, measure, revise: keeping an iteration log',
  ],
  projectIds: [],
  museion: 'engineering',
};

const U06: StemUnit = {
  id: 'stem-68-u06',
  band: '6-8',
  n: 6,
  title: 'Keep It Cool: A Thermal Energy Design Challenge',
  kind: 'engineering',
  strands: ['science', 'engineering', 'math'],
  status: 'outline',
  weeks: 3,
  bigIdea: 'Thermal energy always moves from warmer to cooler by conduction, convection and radiation. Good insulation design slows that flow, and data from a sensor proves whether it worked.',
  essentialQuestion: 'How can we design a container that slows the flow of thermal energy the most for the least cost?',
  standards: { ngss: ['MS-PS3-3', 'MS-PS3-4', 'MS-PS3-5', 'MS-ETS1-1', 'MS-ETS1-2', 'MS-ETS1-3', 'MS-ETS1-4'], ccss: [M('6.SP.B.5'), M('7.RP.A.2')], csta: ['2-DA-08'], intl: { uk: 'KS3 Physics: energy and heating', cambridge: 'Lower Secondary Stage 9 Physics: thermal energy transfer', ib: 'MYP year 3 Sciences', singapore: 'Lower Secondary Science: transfer of heat' } },
  lessons: [],
  outline: [
    'Heat on the move: conduction, convection and radiation',
    'Define the problem: criteria and constraints for a lunch cooler',
    'Insulator trials logged with the temperature sensor',
    'Combine the best features: optimise and retest',
    'Cooling curves and trade-offs: presenting the evidence',
  ],
  projectIds: [],
  museion: 'physics',
};

const U07: StemUnit = {
  id: 'stem-68-u07',
  band: '6-8',
  n: 7,
  title: 'Cells to Communities: Modeling Life in Biology Lab',
  kind: 'science',
  strands: ['science', 'math', 'technology'],
  status: 'outline',
  weeks: 4,
  bigIdea: 'Living systems run on rates: enzymes speed reactions inside cells, body systems pass materials between them, and illnesses spread through communities at rates we can model and change.',
  essentialQuestion: 'How can a computer model help us understand, and protect, living systems from cells to schools?',
  standards: { ngss: ['MS-LS1-1', 'MS-LS1-2', 'MS-LS1-3', 'MS-LS1-7', 'MS-LS2-1'], csta: ['2-DA-09', '2-AP-11'], ccss: [M('7.RP.A.3'), M('6.SP.B.5')], intl: { uk: 'KS3 Biology: cells and organisation; health', cambridge: 'Lower Secondary Stage 8 Biology: cells and body systems', ib: 'MYP year 2 Sciences', singapore: 'Lower Secondary Science: cells, digestion and disease' } },
  lessons: [],
  outline: [
    'Cells are the unit of life: a tour at every scale',
    'Enzymes as tiny machines: running the enzyme kinetics model',
    'More substrate, more speed? Experimenting with model rates',
    'Body systems working together: from digestion to cells',
    'How an illness spreads: the SIR model',
    'Vaccination and herd protection: changing the model to protect a school',
  ],
  projectIds: ['stem-68-proj-outbreak'],
  museion: 'biology',
};

const U08: StemUnit = {
  id: 'stem-68-u08',
  band: '6-8',
  n: 8,
  title: 'Soft Circuits: Engineering a Light-Up Plush',
  kind: 'engineering',
  strands: ['engineering', 'science', 'technology', 'math'],
  status: 'outline',
  weeks: 3,
  bigIdea: 'Materials have properties we can design with: conductive thread carries current, fabric bends and stretches, and stuffing insulates. A wearable or plush circuit has to be safe, soft and still work after a hug.',
  essentialQuestion: 'How do engineers choose materials when a circuit has to bend, wash and be cuddled?',
  standards: { ngss: ['MS-ETS1-1', 'MS-ETS1-2', 'MS-PS1-3'], ccss: [M('7.G.B.4'), M('7.RP.A.2')], intl: { uk: 'KS3 Design and technology: textiles and electronics', cambridge: 'Lower Secondary Stage 8 Science: materials and their properties', ib: 'MYP Design year 2: product design', singapore: 'Lower Secondary Design & Technology' } },
  lessons: [],
  outline: [
    'Materials matter: fibres, fabrics and conductive thread',
    'A circuit you can sew: coin cell, LED and the resistance of thread',
    'Pattern geometry: the plush-pal pattern and seam allowance',
    'Sew, test and troubleshoot a light-up plush (adult-supervised)',
    'Design notes and safety labels: coin cells stay sealed away',
  ],
  projectIds: [],
  museion: 'engineering',
};

export const G68_UNITS: StemUnit[] = [U01, U02, U03, U04, U05, U06, U07, U08];

// ════════════════════════════════════════════════════════════════════════════
// Projects
// ════════════════════════════════════════════════════════════════════════════

export const G68_PROJECTS: StemProject[] = [
  {
    id: 'stem-68-proj-lamp-enclosure',
    band: '6-8',
    unitId: 'stem-68-u01',
    title: 'Design an LED Desk Lamp, to Scale',
    subject: 'math',
    drivingQuestion: 'Can you design a desk lamp whose every number, from resistor to box size, you can prove with math?',
    brief: 'Choose how many LEDs, what colour and what power for a desk lamp. Size each LED’s resistor, find the total current, power and battery life, then design its base in Build Studio from a 2:1 scale drawing of the circuit board with clearance and print tolerance. Present a one-page spec sheet that shows your working.',
    deliverables: [
      'Spec sheet: LED count and colour, Vf, resistor calculation and chosen standard value, current per LED and total, power in watts',
      'Battery or USB analysis: run time in hours or proof the lamp stays under 500 mA',
      '2:1 scale drawing of the board with dimensions and the scale factor labelled',
      'Build Studio model of the base and lid with real dimensions and LED holes',
      'Two-sentence reflection on one design trade-off',
    ],
    steps: [
      'Pick LED count, colour, brightness and power in the lamp recipe.',
      'Calculate each resistor with (Vs − Vf) ÷ I before checking the recipe.',
      'Find total current, power and run time.',
      'Make a 2:1 scale drawing of the 70 × 50 mm board and its box.',
      'Model the base in Build Studio with 3 mm clearance and LED holes.',
      'Check every model dimension against drawing ÷ 2.',
      'Finish the spec sheet and reflection.',
    ],
    launch: { room: 'studio', starter: { shapes: ['box', 'cylinder', 'text'], note: 'Board 70 × 50 mm; add clearance and LED holes.' }, prompt: 'an LED desk lamp base and lid sized for a 70 by 50 mm circuit board, with LED holes and a switch opening', lesson: 'stem-68-proj-lamp-enclosure' },
    rubric: {
      criteria: [
        crit('Resistor and current math', 'Formula attempted with errors in units', 'Resistor correct but standard value or current missing', 'Resistor, standard value and current per LED all correct with units', 'All correct, plus total current and power checked against the recipe'),
        crit('Rates and percent', 'Power or run time missing', 'One of power or run time correct', 'Power and run time (or USB limit) correct', 'Correct and compared across two design options'),
        crit('Scale drawing and model', 'Drawing not to a consistent scale', 'Scale stated but some lengths wrong', 'Drawing and model match at the stated scale with clearance', 'Matches, and includes justified print tolerances'),
        crit('Communicating the design', 'Spec sheet incomplete', 'Spec sheet complete but working hidden', 'Clear spec sheet with working shown', 'Clear, polished spec sheet with a thoughtful trade-off reflection'),
      ],
    },
    standards: {
      ccss: [M('6.RP.A.3'), M('7.RP.A.2'), M('7.RP.A.3'), M('7.G.A.1')],
      ngss: ['MS-ETS1-1', 'MS-ETS1-2'],
      intl: { uk: 'KS3 Y8 Ratio and geometry', cambridge: 'Lower Secondary Stage 8', ib: 'MYP year 2 Mathematics', singapore: 'Secondary 1' },
    },
    minutes: 240,
    differentiation: {
      support: 'Fix the design at 3 red LEDs on USB and provide a spec-sheet template with formula boxes.',
      extension: 'Add a second brightness setting with its own resistor and compare battery life; design a snap-fit lid.',
    },
    safety: { level: 'supervised', note: 'Design and simulation first. A physical build uses USB 5 V or 3 × AA only, with a resistor on every LED; any soldering is done only if school policy allows, with an adult present, eye protection and ventilation. An adult runs the 3D printer.' },
  },
  {
    id: 'stem-68-proj-weather-station',
    band: '6-8',
    unitId: 'stem-68-u04',
    title: 'Classroom Weather Station',
    subject: 'science',
    drivingQuestion: 'Where is the warmest, and most trustworthy, place to measure temperature at our school?',
    brief: 'Configure the Wi-Fi environment sensor, choose and justify an update interval, collect at least two days of temperature data from two locations, and design a radiation shield. Report means, ranges and a warming rate, and make a recommendation backed by evidence.',
    deliverables: [
      'Configured sensor with the chosen update interval and a sentence explaining why',
      'Data table and line graph from two locations over two days',
      'Mean, range and one warming rate for each location',
      'Shield design with at least three test trials and a mean error',
      'Recommendation poster or slide: where the school station should live',
    ],
    steps: [
      'Open the sensor recipe and choose an update interval.',
      'Place stations in two locations (simulated or real) and log data.',
      'Clean the data: note outliers and any systematic error.',
      'Compute means, ranges and a warming rate.',
      'Design and test a radiation shield.',
      'Write and present your recommendation.',
    ],
    launch: { room: 'elec', template: 'sensor', starter: { values: { interval: 60 } }, lesson: 'stem-68-proj-weather-station' },
    rubric: {
      criteria: [
        crit('Sensor setup', 'Sensor not configured', 'Configured without a reason for the interval', 'Configured with a sensible, explained interval', 'Configured and the interval justified against power and data needs'),
        crit('Data quality', 'Too little data to compare', 'Data collected but errors not addressed', 'Clean data with outliers and errors noted', 'Clean data with a tested correction and honest notes'),
        crit('Analysis', 'Statistics missing or wrong', 'Some statistics correct', 'Means, ranges and a rate all correct', 'Correct and used to compare variability, not just averages'),
        crit('Engineering and recommendation', 'No shield or recommendation', 'Shield built but not tested', 'Shield tested in repeated trials; recommendation supported by data', 'Iterated shield design and a persuasive, evidence-based recommendation'),
      ],
    },
    standards: {
      ngss: ['MS-ETS1-1', 'MS-ETS1-2', 'MS-ETS1-3', 'MS-ETS1-4'],
      csta: ['2-DA-08', '2-DA-09', '2-CS-02'],
      ccss: [M('6.SP.B.5'), M('7.SP.B.3')],
      intl: { uk: 'KS3 Statistics; Computing', cambridge: 'Lower Secondary Stage 7–8', ib: 'MYP years 1–2 Design', singapore: 'Secondary 1 Statistics' },
    },
    minutes: 300,
    differentiation: {
      support: 'Use the class data set instead of collecting, and complete a guided analysis sheet.',
      extension: 'Add humidity and pressure, look for a pattern before rain, and compare with a public weather report.',
    },
    safety: { level: 'low', note: 'Simulate first. Physical stations run only from a listed 5 V USB supply, never mains wiring, and stay dry; an adult runs the 3D printer for shield parts.' },
  },
  {
    id: 'stem-68-proj-outbreak',
    band: '6-8',
    unitId: 'stem-68-u07',
    title: 'Model a Flu Outbreak at Our School',
    subject: 'science',
    drivingQuestion: 'If one student brings the flu to school, how many could get sick, and what fraction must be vaccinated to stop it spreading?',
    brief: 'Use the SIR epidemic model in Biology Lab to simulate an outbreak in a school of your size. Change the contact and recovery rates to represent handwashing and staying home when sick, then model vaccination by starting part of the school as already protected. Find the vaccination fraction that keeps the outbreak from taking off and explain it to the school community.',
    deliverables: [
      'Baseline SIR run with peak infected fraction and the day of the peak',
      'Two intervention runs (for example handwashing and staying home) with the parameters you changed',
      'Vaccination runs at three or more fractions, with a graph of peak infections against fraction vaccinated',
      'A public-health flyer that explains R0 and your recommendation in plain language',
    ],
    steps: [
      'Open the Epidemic (SIR) starter and run it unchanged; record the peak.',
      'Convert fractions to students for a school of your size.',
      'Lower the contact rate to model handwashing; rerun and compare.',
      'Raise the recovery rate or lower contacts to model staying home; rerun.',
      'Move a fraction of S into R at the start to model vaccination; try at least three fractions.',
      'Graph peak infections against fraction vaccinated and find where the outbreak stops growing.',
      'Make your flyer.',
    ],
    launch: { room: 'bio', template: 'sir', lesson: 'stem-68-proj-outbreak' },
    rubric: {
      criteria: [
        crit('Running the model', 'Model not run or results not recorded', 'Baseline recorded only', 'Baseline and interventions run with parameters recorded', 'All runs recorded and parameter choices justified'),
        crit('Math and data', 'Fractions not converted or graph missing', 'Some conversions or a partial graph', 'Correct conversions and a clear graph of peak vs vaccination', 'Correct, and the threshold explained using R0 = beta / gamma'),
        crit('Scientific reasoning', 'Conclusions not tied to the model', 'Some conclusions supported', 'Conclusions supported by runs, with model limits noted', 'Thoughtful limits discussed (real schools are not well mixed, immunity fades)'),
        crit('Communicating to the community', 'Flyer missing or inaccurate', 'Flyer accurate but unclear', 'Clear, accurate, respectful flyer', 'Clear, persuasive flyer a family could act on'),
      ],
    },
    standards: {
      ngss: ['MS-LS1-3', 'MS-LS2-1'],
      csta: ['2-DA-09'],
      ccss: [M('7.RP.A.3'), M('6.SP.B.5')],
      intl: { uk: 'KS3 Biology: health and disease', cambridge: 'Lower Secondary Stage 8 Biology', ib: 'MYP year 2 Sciences', singapore: 'Lower Secondary Science: disease' },
    },
    minutes: 240,
    differentiation: {
      support: 'Provide a run log with the parameter to change already circled, and a school of 500 for conversions.',
      extension: 'Add a waning-immunity flow from R back to S and describe what happens over a full year.',
    },
    safety: { level: 'sim-only', note: 'Entirely a computer model; no specimens or lab materials. Discuss illness respectfully, without naming or blaming anyone.' },
  },
];
