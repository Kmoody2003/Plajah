// STEM track, grades 3–5 · Makers. Scope & sequence (all eight units authored), the two anchor units and the band's Build projects.
// Units 1 and 4–8 live in data/stem/units/35-u0*.ts. See data/stem/types.ts for the model. All prose is original Plajah Academia writing.
//
// Safety for this band: simulated Electronics Lab first; physical circuits only on AA alkaline packs (≤ 6 V), every
// LED with its own resistor, never a wire straight across a battery. No heat tools. Needles with an adult nearby.

import type { RubricCriterion } from '../assignmentTemplates';
import type { StemProject, StemUnit } from './types';
import { G35_U01 as U01 } from './units/35-u01';
import { G35_U04 as U04, G35_U04_PROJECTS } from './units/35-u04';
import { G35_U05 as U05, G35_U05_PROJECTS } from './units/35-u05';
import { G35_U06 as U06 } from './units/35-u06';
import { G35_U07 as U07 } from './units/35-u07';
import { G35_U08 as U08 } from './units/35-u08';

const C = (code: string) => `CCSS.MATH.CONTENT.${code}`;

const crit = (name: string, beginning: string, developing: string, proficient: string, advanced: string): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: beginning, points: 1 },
    { label: 'Developing', descriptor: developing, points: 2 },
    { label: 'Proficient', descriptor: proficient, points: 3 },
    { label: 'Advanced', descriptor: advanced, points: 4 },
  ],
});

const PHYSICAL_CIRCUIT_SAFETY =
  'Simulate first. If you build for real: AA alkaline cells in a holder (6 V or less), every LED with its own resistor, and never connect a wire straight from + to −, because the battery and wire get hot. Unclip the pack before changing anything.';

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Unit 2 · Energy on the Move (science, complete)
// ───────────────────────────────────────────────────────────────────────────────────────────────
const U02: StemUnit = {
  id: 'stem-35-u02',
  band: '3-5',
  n: 2,
  title: 'Energy on the Move: Circuits, Conductors & Insulators',
  kind: 'science',
  strands: ['science', 'engineering', 'technology'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'Energy can travel from place to place. In a circuit it rides around a closed loop and changes into light, sound, motion and a little heat wherever it is used.',
  essentialQuestion: 'Where does the energy in a battery go, and how can we steer it where we want?',
  standards: {
    ngss: ['4-PS3-2', '4-PS3-4', '5-PS1-3', '3-5-ETS1-1', '3-5-ETS1-2', '3-5-ETS1-3'],
    ccss: [C('4.OA.A.1'), C('3.MD.B.3'), C('5.NBT.B.7')],
    intl: { uk: 'Y4 Science — Electricity', cambridge: 'Stage 5 — Physics: electrical circuits', ib: 'PYP How the world works — energy', singapore: 'Primary Science P5 — Electrical systems' },
  },
  projectIds: ['stem-35-proj-switch-box'],
  museion: 'physics',
  lessons: [
    {
      id: 'stem-35-u02-l1',
      title: 'Closed Loops: Making a Light Turn On',
      minutes: 45,
      strands: ['science', 'technology'],
      objectives: [
        'I can build a closed circuit that lights an LED.',
        'I can explain why a gap anywhere in the loop stops the light.',
        'I can name the jobs of the battery, wires, switch, resistor and LED.',
      ],
      vocab: [
        ['circuit', 'A complete path that lets electric energy travel out of a battery and back again.'],
        ['closed circuit', 'A loop with no gaps, so energy can flow and the light turns on.'],
        ['open circuit', 'A loop with a gap somewhere, so nothing flows.'],
        ['resistor', 'A small part that slows the flow so an LED does not get too much.'],
      ],
      hook: 'Hold up a dark flashlight and a fresh pair of AA cells. Put the cells in backwards and click the switch: nothing. Turn them around: light. What changed inside, and why did it matter which way they faced?',
      build: {
        title: 'Light one LED in the Electronics Lab',
        steps: [
          'Open the Electronics Lab and place a 2-AA battery pack, a switch, a resistor and one LED.',
          'Wire them into one loop: battery + to switch, switch to resistor, resistor to the LED long leg, LED short leg back to battery −.',
          'Run the simulation and flip the switch. Watch the current arrows travel around the loop.',
          'Delete one wire on purpose. Predict, then check: does the LED stay on? Put the wire back.',
          'Turn the LED around. Record what happens and explain it with the word "direction".',
          'With your teacher, build the same loop on the table using the classroom kit, checking the resistor is in before you clip in the pack.',
        ],
        launch: { room: 'elec', prompt: 'a simple battery circuit: 2 AA cells, a slide switch, one resistor and one red LED in a single loop', lesson: 'stem-35-u02-l1' },
        materials: ['2 × AA alkaline cells in a holder with a switch', 'one 5 mm LED', 'one 220 Ω resistor', 'alligator-clip leads'],
      },
      worked: [
        {
          prompt: 'Jada built a loop: battery, switch, resistor, LED. The switch is on but the LED is dark. Find two things she should check.',
          steps: [
            'Trace the loop with a finger from + all the way back to −. Every part must touch the next one.',
            'Check the LED direction: the long leg must face the + side.',
            'Check that the battery holder has both cells facing the way the drawing in the holder shows.',
          ],
          answer: 'Look for a gap (a loose clip) and check the LED faces the right way; either one leaves the circuit open.',
        },
      ],
      practice: [
        { q: 'A battery pack holds 2 AA cells. Each cell gives 1.5 volts. How many volts does the pack give?', answer: '2 × 1.5 V = 3 V', value: 3, unit: 'V', check: { f: 'product', args: [2, 1.5] }, level: 1 },
        { q: 'A camping lantern holds 4 AA cells end to end. How many volts is that?', answer: '4 × 1.5 V = 6 V', value: 6, unit: 'V', check: { f: 'product', args: [4, 1.5] }, level: 2 },
        { q: 'Draw a loop with a switch. Mark where the gap is when the switch is OFF.', answer: 'The gap is inside the switch: OFF pulls the metal contacts apart and opens the loop.', level: 1 },
        { q: 'Why does our lab LED always have a resistor next to it?', answer: 'Without it too much current rushes through the LED and it can burn out; the resistor slows the flow to a safe amount.', level: 2 },
        { q: 'A string of 5 lights is wired in one single loop. One light breaks. Predict what the others do, and explain.', answer: 'They all go out, because the broken light makes a gap and the single loop is now open.', level: 3 },
      ],
      exitTicket: { q: 'In one sentence, why does a circuit need to be a closed loop?', answer: 'Energy has to travel out of the battery and come back to it; any gap stops the flow everywhere in the loop.' },
      differentiation: {
        support: ['Give a picture card of the loop with each part labelled and numbered in wiring order.', 'Pre-place the battery and LED in the simulation so students add only wires.'],
        extension: ['Add a second LED with its own resistor and find a way to wire it so one can break without the other going out.', 'Explain what a switch is in the language of "open" and "closed".'],
        ell: 'Sentence frames: "The light is on because the circuit is ___." "There is a gap at ___." Cognates: circuito, energía.',
        supports: ['readAloud', 'chunk', 'fewerChoices'],
      },
      safety: { level: 'low', note: PHYSICAL_CIRCUIT_SAFETY },
      standards: {
        ngss: ['4-PS3-2'],
        ccss: [C('4.OA.A.1')],
        intl: { uk: 'Y4 Science — Electricity: simple series circuits', cambridge: 'Stage 4 — Physics: electrical circuits', ib: 'PYP How the world works', singapore: 'Primary Science P5 — Electrical systems' },
      },
      museion: 'physics',
    },
    {
      id: 'stem-35-u02-l2',
      title: 'Conductors & Insulators: The Material Tester',
      minutes: 45,
      strands: ['science', 'engineering'],
      objectives: [
        'I can use a tester circuit to sort materials into conductors and insulators.',
        'I can record results in a table and a bar graph.',
        'I can use evidence to explain why wires are metal on the inside and plastic on the outside.',
      ],
      vocab: [
        ['conductor', 'A material that lets electric energy move through it easily, like most metals.'],
        ['insulator', 'A material that blocks electric energy, like plastic, rubber, wood or glass.'],
        ['property', 'Something you can observe or measure about a material, like hardness or whether it conducts.'],
      ],
      hook: 'Pass around a piece of electrical wire with the plastic stripped off one end. Why would someone wrap metal in plastic? Make a guess, then let us build a machine that answers it.',
      build: {
        title: 'Build a material tester with a gap',
        steps: [
          'In the Electronics Lab, build last lesson’s LED loop but leave two wire ends loose: that is the test gap.',
          'Use the lab’s material bin to drop a sample across the gap: copper, foil, a paper clip, a pencil lead, plastic, wood, rubber, glass.',
          'Record each result as "lit" or "dark" in your table.',
          'Repeat with real objects on the table using the kit tester, touching both loose clips to each object.',
          'Make a bar graph of how many objects were conductors and how many were insulators.',
        ],
        launch: { room: 'elec', prompt: 'a continuity tester: 2 AA cells, a resistor and an LED with two open probe leads to test materials', lesson: 'stem-35-u02-l2' },
        materials: ['tester loop from lesson 1 with two loose clip leads', 'test objects: foil, coin, paper clip, pencil, eraser, craft stick, plastic spoon, glass marble'],
      },
      worked: [
        {
          prompt: 'The tester lights for a paper clip but stays dark for a plastic-coated paper clip. What does that tell you?',
          steps: [
            'The bare paper clip is metal, so it closes the gap and the LED lights: it is a conductor.',
            'The coating is plastic. The clips touch only the coating, which blocks the flow: an insulator.',
            'So the same metal can be hidden inside an insulator, just like electrical wire.',
          ],
          answer: 'Metal conducts and the plastic coating insulates; the coating keeps the energy inside the wire.',
        },
      ],
      practice: [
        { q: 'Your group tested 12 objects. 5 of them lit the LED. How many were insulators?', answer: '12 − 5 = 7 insulators', value: 7, unit: 'objects', check: { f: 'difference', args: [12, 5] }, level: 1 },
        { q: 'Kai rated how bright the LED looked with foil across the gap on three tries: 4, 5 and 3 (on a 1–5 scale). What is the mean rating?', answer: '(4 + 5 + 3) ÷ 3 = 4', value: 4, check: { f: 'mean', args: [4, 5, 3] }, level: 2 },
        { q: 'Sort: copper penny, rubber band, steel spoon, wooden ruler, aluminium foil, glass jar.', answer: 'Conductors: penny, steel spoon, foil. Insulators: rubber band, wooden ruler, glass jar.', level: 1 },
        { q: 'Four tables tested 9, 11, 10 and 10 objects. What is the mean number tested per table?', answer: '(9 + 11 + 10 + 10) ÷ 4 = 10 objects', value: 10, unit: 'objects', check: { f: 'mean', args: [9, 11, 10, 10] }, level: 2 },
        { q: 'A pencil "lead" made the LED glow dimly. Is it a conductor? Use evidence.', answer: 'Yes, a weak one: the graphite let some energy through (the LED glowed) but not as much as metal (it was dimmer).', level: 3 },
      ],
      exitTicket: { q: 'Name one conductor and one insulator from today and explain how the tester told you which was which.', answer: 'Example: foil lit the LED (conductor); the eraser left it dark (insulator), because only a conductor closes the gap.' },
      differentiation: {
        support: ['Provide a two-column table already labelled "lit" and "dark".', 'Limit the first round to four objects with very different results.'],
        extension: ['Rank conductors by brightness and look for a pattern.', 'Test water with and without salt in the simulation and explain the difference.'],
        ell: 'Sentence frames: "___ is a conductor because the LED ___." Picture cards for each object.',
        supports: ['chunk', 'fewerChoices', 'untimed'],
      },
      safety: { level: 'low', note: PHYSICAL_CIRCUIT_SAFETY + ' Never put the tester leads in an outlet or any wall socket; it is only for objects on the table.' },
      standards: {
        ngss: ['4-PS3-2', '5-PS1-3'],
        ccss: [C('3.MD.B.3'), C('5.NBT.B.7')],
        intl: { uk: 'Y4 Science — Electricity: conductors and insulators', cambridge: 'Stage 4 — Physics: conductors and insulators', ib: 'PYP How the world works — materials', singapore: 'Primary Science P5 — Electrical conductors and insulators' },
      },
      museion: 'physics',
    },
    {
      id: 'stem-35-u02-l3',
      title: 'Energy Changes Form: Light, Sound, Motion and Heat',
      minutes: 45,
      strands: ['science'],
      objectives: [
        'I can describe how a circuit turns stored energy into light, sound or motion.',
        'I can notice that some energy always turns into heat.',
        'I can collect repeated measurements and find their mean.',
      ],
      vocab: [
        ['energy', 'The ability to make something happen: move, light up, make sound or warm up.'],
        ['energy transfer', 'Energy moving from one place or object to another.'],
        ['output device', 'The part of a circuit that does the job: an LED, buzzer or motor.'],
      ],
      hook: 'Put a buzzer, a small fan motor and an LED on the same battery pack, one at a time. Same battery, three different results. Where did the battery’s energy go each time?',
      build: {
        title: 'Swap the output: LED, buzzer, motor',
        steps: [
          'In the Electronics Lab, start with the LED loop and run it.',
          'Replace the LED and resistor with a buzzer. Run it and listen.',
          'Replace the buzzer with a small motor with a paper fan. Count how many turns the fan makes in 10 seconds on the slow-motion view, three times.',
          'Open the lab’s energy view and notice the small "heat" slice in every circuit.',
          'Fill in an energy chain for each: battery (stored) → wires → output (light, sound or motion) + a little heat.',
        ],
        launch: { room: 'elec', prompt: 'a 2 AA battery pack driving a switch and a buzzer, with a second version driving a small DC motor', lesson: 'stem-35-u02-l3' },
        materials: ['2 × AA alkaline cells in a holder', 'piezo buzzer', 'small 3 V hobby motor with a paper fan', 'LED with a 220 Ω resistor', 'clip leads'],
      },
      worked: [
        {
          prompt: 'Write the energy chain for a battery-powered fan.',
          steps: [
            'Start where the energy is stored: the chemicals in the battery.',
            'It travels through the wires as electrical energy.',
            'The motor changes it into motion energy (the spinning fan), plus a little heat and a hum.',
          ],
          answer: 'Battery (stored) → electrical energy in wires → motion of the fan, plus some heat and sound.',
        },
      ],
      practice: [
        { q: 'The fan turned 30, 34 and 26 times in 10 seconds on three trials. What is the mean?', answer: '(30 + 34 + 26) ÷ 3 = 30 turns', value: 30, unit: 'turns', check: { f: 'mean', args: [30, 34, 26] }, level: 2 },
        { q: 'A toy runs on 4 AA (6 V). Another runs on 2 AA (3 V). How many times as many volts does the first toy have?', answer: '6 ÷ 3 = 2 times as many', value: 2, check: { f: 'quotient', args: [6, 3] }, level: 2 },
        { q: 'Name the output energy for each: doorbell, flashlight, electric fan.', answer: 'Doorbell: sound. Flashlight: light. Fan: motion. Each also makes a little heat.', level: 1 },
        { q: 'After running for a while the motor feels slightly warm. Where did that warmth come from?', answer: 'Some of the electrical energy changed into heat instead of motion; no device changes all of it into the job we want.', level: 3 },
      ],
      exitTicket: { q: 'Draw an energy chain for a buzzer circuit.', answer: 'Battery (stored energy) → electrical energy in the wires → sound from the buzzer (+ a little heat).' },
      differentiation: {
        support: ['Energy chain template with picture icons to drag into place.', 'Pair students so one counts fan turns and one records.'],
        extension: ['Predict and test what happens to the fan speed with 1 AA versus 2 AA.', 'Design a circuit with two outputs that both run from one switch.'],
        ell: 'Word bank with pictures: light, sound, motion, heat. Frame: "The ___ changes electrical energy into ___."',
        supports: ['readAloud', 'chunk', 'calm'],
      },
      safety: { level: 'low', note: PHYSICAL_CIRCUIT_SAFETY + ' Keep fingers and hair away from the spinning fan.' },
      standards: {
        ngss: ['4-PS3-2', '4-PS3-4'],
        ccss: [C('5.NBT.B.7')],
        intl: { uk: 'Y4 Science — Electricity: devices and their energy', cambridge: 'Stage 5 — Physics: energy transfer', ib: 'PYP How the world works — energy', singapore: 'Primary Science P4 — Energy forms and uses' },
      },
      museion: 'physics',
    },
    {
      id: 'stem-35-u02-l4',
      title: 'Design Challenge: The Steady-Hand Game',
      minutes: 50,
      strands: ['engineering', 'science', 'technology'],
      objectives: [
        'I can use criteria and constraints to plan a device that converts energy.',
        'I can test my design fairly and improve it from the results.',
        'I can explain my game as an open and closed circuit.',
      ],
      vocab: [
        ['criteria', 'The things a design must do to count as a success.'],
        ['constraint', 'A limit on the design, like time, materials or size.'],
        ['fair test', 'A test where you change only one thing so the results can be compared.'],
      ],
      hook: 'Can you guide a metal loop along a wiggly wire without touching it? If you touch, a buzzer goes off. Today you are the engineers who build the game, and the game is secretly a switch.',
      build: {
        title: 'Simulate, then build a steady-hand buzzer game',
        steps: [
          'Write the criteria (it buzzes on a touch, it is quiet otherwise, a player can finish) and constraints (2 AA pack, one buzzer, 60 cm of wire, 20 minutes).',
          'In the Electronics Lab, wire battery → buzzer → the wiggly wire, and battery → the handle loop. Touching the two closes the loop.',
          'Run the simulation and test: does it buzz only when they touch?',
          'Build it with the kit: bend the wire into a maze shape and push its ends into a clay or foam base.',
          'Run three fair trials per player and record the number of buzzes.',
          'Change one thing (a bigger loop, a gentler bend) and test again. Record which change helped.',
        ],
        launch: { room: 'elec', prompt: 'a steady-hand buzzer game: 2 AA cells and a buzzer where a hand-held wire loop touching a bent maze wire closes the circuit', lesson: 'stem-35-u02-l4' },
        materials: ['2 × AA alkaline cells in a holder', 'piezo buzzer', '60 cm of stiff bare craft wire', 'insulated clip leads', 'modelling clay or foam block base', 'tape for the handle'],
      },
      worked: [
        {
          prompt: 'Team Ruby’s game buzzes all the time, even when nobody touches the wire. Find the problem.',
          steps: [
            'A buzzer that never stops means the loop is always closed.',
            'Check where the handle loop rests: if it is lying against the maze wire, the loop is closed.',
            'Check the base: the bare wire ends must not touch each other or the handle lead.',
          ],
          answer: 'Something is touching all the time; separate the handle from the maze wire (or tape the start zone) so the circuit is open until a player slips.',
        },
      ],
      practice: [
        { q: 'A player buzzed 6, 4, 5 and 5 times on four tries. What is the mean number of buzzes?', answer: '(6 + 4 + 5 + 5) ÷ 4 = 5 buzzes', value: 5, unit: 'buzzes', check: { f: 'mean', args: [6, 4, 5, 5] }, level: 2 },
        { q: 'Your maze uses three straight pieces of wire: 20 cm, 15 cm and 25 cm. How much wire is that in all? Is it inside the 60 cm constraint?', answer: '20 + 15 + 25 = 60 cm, exactly at the limit', value: 60, unit: 'cm', check: { f: 'sum', args: [20, 15, 25] }, level: 1 },
        { q: '3 teams each give 4 players a turn. How many turns in all?', answer: '3 × 4 = 12 turns', value: 12, unit: 'turns', check: { f: 'product', args: [3, 4] }, level: 1 },
        { q: 'Why should every player get the same number of tries in your test?', answer: 'So the test is fair: we change only the design, not the number of chances, and the results can be compared.', level: 2 },
        { q: 'Which part of your game acts as the switch? Explain using "open" and "closed".', answer: 'The handle loop and the maze wire: apart, the circuit is open (quiet); touching, it is closed (buzz).', level: 3 },
      ],
      exitTicket: { q: 'Name one change you made and the evidence that it improved (or did not improve) the game.', answer: 'Example: a wider loop dropped the mean buzzes from 5 to 3, so it made the game easier.' },
      differentiation: {
        support: ['Provide a pre-bent maze wire and a numbered build card.', 'Offer a checklist for the fair test: same player, same number of tries.'],
        extension: ['Add an LED with its resistor that lights at the finish when the loop touches a finish pad.', 'Graph the mean buzzes before and after the change.'],
        ell: 'Frames: "Our criteria are ___." "We changed ___ and the result was ___."',
        supports: ['chunk', 'schedule', 'untimed', 'calm'],
      },
      safety: { level: 'low', note: PHYSICAL_CIRCUIT_SAFETY + ' Bent wire ends are sharp: tape them or push them into the base.' },
      standards: {
        ngss: ['4-PS3-4', '3-5-ETS1-1', '3-5-ETS1-2', '3-5-ETS1-3'],
        ccss: [C('3.OA.A.3'), C('5.NBT.B.7')],
        intl: { uk: 'Y4 Design & technology — electrical systems', cambridge: 'Stage 5 — Science: scientific enquiry, fair tests', ib: 'PYP How we organise ourselves — design', singapore: 'Primary Science P5 — Electrical systems' },
      },
      museion: 'engineering',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Unit 3 · Night-Light Numbers (electronics-math, complete)
// ───────────────────────────────────────────────────────────────────────────────────────────────
const U03: StemUnit = {
  id: 'stem-35-u03',
  band: '3-5',
  n: 3,
  title: 'Night-Light Numbers: Circuit Math',
  kind: 'electronics-math',
  strands: ['math', 'engineering', 'science'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'A reading-nook night-light is full of math: batteries stack in equal groups, battery life is a division story, parallel parts share in fractions, and the box that holds it all is an area, perimeter and volume puzzle.',
  essentialQuestion: 'How can multiplying, dividing and measuring help us design a light that lasts and a box that fits?',
  standards: {
    ngss: ['4-PS3-2', '3-5-ETS1-2'],
    ccss: [C('3.OA.A.3'), C('3.NF.A.1'), C('3.MD.C.7'), C('3.MD.D.8'), C('4.MD.A.3'), C('4.NBT.B.5'), C('4.NBT.B.6'), C('5.MD.C.5'), C('5.NBT.B.5')],
    intl: { uk: 'Y4–Y6 Multiplication, division, fractions, measurement', cambridge: 'Stages 4–6 — Number and measure', ib: 'PYP Number; Measurement — phase 3', singapore: 'Primary Mathematics P3–P5 — whole numbers, fractions, area and volume' },
  },
  projectIds: ['stem-35-proj-nightlight'],
  museion: 'mathematics',
  lessons: [
    {
      id: 'stem-35-u03-l1',
      title: 'Battery Stacks: Equal Groups Make Volts',
      minutes: 45,
      strands: ['math', 'science'],
      mathFocus: 'multiplication as equal groups (and division as how many groups)',
      objectives: [
        'I can use multiplication to find the voltage of batteries placed end to end.',
        'I can use division to find how many cells make a voltage.',
        'I can write a multiplication equation for a battery pack.',
      ],
      vocab: [
        ['volt (V)', 'The unit for how hard a battery pushes energy around a circuit.'],
        ['in series', 'Placed end to end in one line, so the pushes add up.'],
        ['equal groups', 'Groups that each have the same amount, which we can count with multiplication.'],
      ],
      hook: 'One AA cell says 1.5 V on its side. Our night-light needs about 4.5 V. Do we need a bigger battery, or can we team up small ones? Let us find out with equal groups.',
      build: {
        title: 'Stack cells and watch the meter',
        steps: [
          'Open the lamp starter in the Electronics Lab and set Power to battery.',
          'Click the battery and change it to 1 cell, then 2, then 3. Read the voltage each time and write it in a table.',
          'Spot the pattern: each new cell adds the same 1.5 V. Write it as a multiplication: cells × 1.5 V.',
          'Predict the voltage for 4 cells, then check it in the lab.',
        ],
        launch: { room: 'elec', template: 'lamp', starter: { values: { power: 'battery', leds: 1, color: 'yellow' }, note: 'Change the cell count and read the voltage.' }, lesson: 'stem-35-u03-l1' },
      },
      worked: [
        {
          prompt: 'Our night-light holds 3 AA cells in a row. Each gives 1.5 V. What voltage does it get?',
          steps: [
            'Each cell is one equal group of 1.5 V.',
            'There are 3 groups, so multiply: 3 × 1.5.',
            'Think 3 × 1 = 3 and 3 × 0.5 (three halves) = 1.5, so 3 + 1.5 = 4.5.',
          ],
          answer: '3 × 1.5 V = 4.5 V',
        },
      ],
      practice: [
        { q: 'How many volts do 2 AA cells in series give?', answer: '2 × 1.5 V = 3 V', value: 3, unit: 'V', check: { f: 'product', args: [2, 1.5] }, level: 1 },
        { q: 'How many volts do 4 AA cells in series give?', answer: '4 × 1.5 V = 6 V', value: 6, unit: 'V', check: { f: 'product', args: [4, 1.5] }, level: 1 },
        { q: 'A toy needs 6 V. How many 1.5 V cells must go in a row?', answer: '6 ÷ 1.5 = 4 cells', value: 4, unit: 'cells', check: { f: 'quotient', args: [6, 1.5] }, level: 2 },
        { q: 'Our class is building 8 night-lights. Each needs 3 AA cells. How many cells should the teacher order?', answer: '8 × 3 = 24 cells', value: 24, unit: 'cells', check: { f: 'product', args: [8, 3] }, level: 2 },
        { q: 'AA cells come in packs of 4. How many packs give enough for 24 cells?', answer: '24 ÷ 4 = 6 packs', value: 6, unit: 'packs', check: { f: 'quotient', args: [24, 4] }, level: 3 },
      ],
      exitTicket: { q: 'Write a multiplication equation for 3 cells of 1.5 V and solve it.', answer: '3 × 1.5 V = 4.5 V' },
      differentiation: {
        support: ['Draw each cell as a bar labelled 1.5 and skip-count: 1.5, 3, 4.5, 6.', 'Use a table with the first two rows filled in.'],
        extension: ['A 9 V battery is made of small 1.5 V cells inside. How many?', 'Find all the cell counts from 1 to 4 that stay at 6 V or below, and explain why our class stops there.'],
        ell: 'Frame: "___ groups of 1.5 volts is ___ volts." Visual: battery bars on a number line.',
        supports: ['chunk', 'untimed', 'readAloud'],
      },
      safety: { level: 'sim-only', note: 'All stacking happens in the simulation. In class we never go above 4 AA (6 V), and cells must all face the same way in the holder.' },
      standards: {
        ngss: ['4-PS3-2'],
        ccss: [C('3.OA.A.1'), C('3.OA.A.3'), C('4.NBT.B.5')],
        intl: { uk: 'Y4 Multiplication and division', cambridge: 'Stage 4 — Number: multiplication', ib: 'PYP Number — phase 3', singapore: 'Primary Mathematics P3 — multiplication' },
      },
      museion: 'mathematics',
    },
    {
      id: 'stem-35-u03-l2',
      title: 'How Long Will It Glow? Battery-Life Division Stories',
      minutes: 45,
      strands: ['math', 'engineering'],
      mathFocus: 'division as fair sharing; multi-digit division with zeros',
      objectives: [
        'I can find how many hours a battery lasts by dividing its capacity by the current.',
        'I can multiply to find the total current of several LEDs.',
        'I can explain a division story in words.',
      ],
      vocab: [
        ['milliamp (mA)', 'A small unit for how much electric current flows each moment.'],
        ['capacity (mAh)', 'How much a battery can give: milliamp-hours, like the size of a fuel tank.'],
        ['quotient', 'The answer to a division problem.'],
      ],
      hook: 'Three AA cells hold about 2400 milliamp-hours. Think of it as 2400 little energy tickets. If the light spends 20 tickets every hour, how many hours until we run out?',
      build: {
        title: 'Read the lamp’s current and predict battery life',
        steps: [
          'Open the lamp starter on battery power with 1 LED and read the current (mA) in the lab’s summary.',
          'Change to 2, then 3, then 4 LEDs. Record the total current each time and notice it grows by equal groups.',
          'For each row, divide 2400 by the total current to predict the hours of light.',
          'Choose the LED count that would last at least one school week of bedtime reading.',
        ],
        launch: { room: 'elec', template: 'lamp', starter: { values: { power: 'battery', leds: 1, brightness: 'low' }, note: 'Record total mA as you add LEDs.' }, lesson: 'stem-35-u03-l2' },
      },
      worked: [
        {
          prompt: 'A night-light uses 20 mA. Its battery pack holds 2400 mAh. How many hours will it glow?',
          steps: [
            'Hours = capacity ÷ current, so 2400 ÷ 20.',
            'Share in tens: 2400 is 240 tens and 20 is 2 tens.',
            '240 ÷ 2 = 120.',
          ],
          answer: '2400 ÷ 20 = 120 hours',
        },
      ],
      practice: [
        { q: 'A pack holds 2400 mAh and the light uses 30 mA. How many hours does it last?', answer: '2400 ÷ 30 = 80 hours', value: 80, unit: 'h', check: { f: 'batteryHours', args: [2400, 30] }, level: 1 },
        { q: 'Four LEDs each use 10 mA. What is the total current?', answer: '4 × 10 mA = 40 mA', value: 40, unit: 'mA', check: { f: 'product', args: [4, 10] }, level: 1 },
        { q: 'Those four LEDs (40 mA total) run from a 2400 mAh pack. How many hours?', answer: '2400 ÷ 40 = 60 hours', value: 60, unit: 'h', check: { f: 'batteryHours', args: [2400, 40] }, level: 2 },
        { q: 'The light lasts 80 hours and you read for 4 hours a night. How many nights is that?', answer: '80 ÷ 4 = 20 nights', value: 20, unit: 'nights', check: { f: 'quotient', args: [80, 4] }, level: 2 },
        { q: 'A smaller pack holds 1200 mAh. The light uses 15 mA. How many hours?', answer: '1200 ÷ 15 = 80 hours', value: 80, unit: 'h', check: { f: 'batteryHours', args: [1200, 15] }, level: 3 },
      ],
      exitTicket: { q: 'Which lasts longer from a 2400 mAh pack: a 20 mA light or a 40 mA light? By how many hours?', answer: '20 mA lasts 120 h, 40 mA lasts 60 h: the 20 mA light lasts 60 hours longer.' },
      differentiation: {
        support: ['Use base-ten blocks or a "ticket" model: bundle 2400 into groups of 20.', 'Give a division table with the tens trick shown for the first row.'],
        extension: ['Make a line graph of LEDs (1–4) versus hours of light and describe the shape.', 'Find the current that would make a 2400 mAh pack last exactly 100 hours.'],
        ell: 'Frame: "The battery has ___ mAh. The light uses ___ mA. It lasts ___ hours." Visual of a fuel gauge.',
        supports: ['chunk', 'untimed', 'readAloud'],
      },
      safety: { level: 'sim-only', note: 'Readings come from the simulation. Battery-life numbers are estimates; real cells give less as they get cold or old.' },
      standards: {
        ngss: ['4-PS3-2'],
        ccss: [C('3.OA.A.2'), C('4.NBT.B.6'), C('4.OA.A.2'), C('5.NBT.B.6')],
        intl: { uk: 'Y5 Multiplication and division — divide by multiples of 10', cambridge: 'Stage 5 — Number: division', ib: 'PYP Number — phase 3', singapore: 'Primary Mathematics P4 — whole numbers: division' },
      },
      museion: 'mathematics',
    },
    {
      id: 'stem-35-u03-l3',
      title: 'Fraction Circuits: Halves, Quarters and What Is Left',
      minutes: 45,
      strands: ['math', 'science'],
      mathFocus: 'unit fractions and fractions of a whole',
      objectives: [
        'I can show that two equal resistors side by side (in parallel) give half the resistance of one.',
        'I can find a fraction of a number, like the charge left in a battery.',
        'I can explain that equal branches share current in equal fractions.',
      ],
      vocab: [
        ['resistance (Ω)', 'How much a part slows the flow, measured in ohms.'],
        ['parallel', 'Side by side, so the flow has more than one path to take.'],
        ['unit fraction', 'A fraction with 1 on top, like 1/2 or 1/4: one equal share of a whole.'],
      ],
      hook: 'A single lane on a bridge lets cars cross slowly. Open a second, identical lane next to it. How much of the traffic jam is left? That is exactly what two resistors in parallel do.',
      build: {
        title: 'Lanes for current: series versus parallel resistors',
        steps: [
          'In the Electronics Lab, place two 100 Ω resistors end to end (series) and read the total with the meter.',
          'Move them side by side (parallel) and read the total again. Compare: 200 Ω versus 50 Ω.',
          'Add a third and fourth identical resistor in parallel. Write each total as a fraction of one resistor.',
          'Back in the lamp, split the current into two equal LED branches and read each branch: each gets 1/2.',
        ],
        launch: { room: 'elec', prompt: 'a battery pack with two equal 100 ohm resistors that can be wired in series or in parallel, with a meter', lesson: 'stem-35-u03-l3' },
      },
      worked: [
        {
          prompt: 'Two 100 Ω resistors are placed in parallel. What is the total resistance?',
          steps: [
            'Two equal lanes let the current through twice as easily.',
            'Twice as easy means half the resistance: 1/2 of 100 Ω.',
            '100 ÷ 2 = 50.',
          ],
          answer: '50 Ω, which is 1/2 of one resistor',
        },
      ],
      practice: [
        { q: 'Two 100 Ω resistors in series (end to end). Total resistance?', answer: '100 + 100 = 200 Ω', value: 200, unit: 'Ω', check: { f: 'series', args: [100, 100] }, level: 1 },
        { q: 'Two 100 Ω resistors in parallel (side by side). Total resistance?', answer: '1/2 of 100 Ω = 50 Ω', value: 50, unit: 'Ω', check: { f: 'parallel', args: [100, 100] }, level: 1 },
        { q: 'Two 220 Ω resistors in parallel. Total resistance?', answer: '1/2 of 220 Ω = 110 Ω', value: 110, unit: 'Ω', check: { f: 'parallel', args: [220, 220] }, level: 2 },
        { q: 'Four 100 Ω resistors in parallel. What fraction of one resistor is the total, and how many ohms?', answer: '1/4 of 100 Ω = 25 Ω', value: 25, unit: 'Ω', check: { f: 'parallel', args: [100, 100, 100, 100] }, level: 3 },
        { q: 'A 2400 mAh pack has used 3/4 of its charge. 1/4 is left. How many mAh is that?', answer: '2400 ÷ 4 = 600 mAh left', value: 600, unit: 'mAh', check: { f: 'quotient', args: [2400, 4] }, level: 2 },
        { q: '20 mA splits equally into 2 identical LED branches. How much goes through each?', answer: '1/2 of 20 mA = 10 mA', value: 10, unit: 'mA', check: { f: 'quotient', args: [20, 2] }, level: 2 },
      ],
      exitTicket: { q: 'Three 300 Ω resistors in parallel: what fraction of one resistor is the total, and how many ohms?', answer: '1/3 of 300 Ω = 100 Ω' },
      differentiation: {
        support: ['Fraction strips: fold a 100-square strip in half, then quarters.', 'Use only the two-resistor cases first.'],
        extension: ['A 100 Ω and a 100 Ω in parallel, then in series with another 100 Ω: find the total.', 'Explain why parallel LED branches each get their own resistor in our lamp.'],
        ell: 'Frame: "Two equal lanes make ___ of the resistance." Bridge-lane picture.',
        supports: ['chunk', 'readAloud', 'fewerChoices'],
      },
      safety: { level: 'sim-only', note: 'Simulation only. Resistor totals are read on the virtual meter; no batteries are wired by hand in this lesson.' },
      standards: {
        ngss: ['4-PS3-2'],
        ccss: [C('3.NF.A.1'), C('4.NF.B.4'), C('5.NF.B.3'), C('4.NBT.B.6')],
        intl: { uk: 'Y4 Fractions — fractions of amounts', cambridge: 'Stage 4 — Number: fractions', ib: 'PYP Number — fractions, phase 3', singapore: 'Primary Mathematics P3 — fractions' },
      },
      museion: 'physics',
    },
    {
      id: 'stem-35-u03-l4',
      title: 'A Home for the Circuit: Area and Perimeter of an Enclosure',
      minutes: 50,
      strands: ['math', 'engineering'],
      mathFocus: 'area and perimeter of rectangles; unknown side lengths',
      objectives: [
        'I can find the area of a rectangular lid by multiplying length × width.',
        'I can find the perimeter of the lid to know how much edge trim I need.',
        'I can find an unknown side when I know the perimeter and one side.',
        'I can show that boxes with the same perimeter can have different areas.',
      ],
      vocab: [
        ['enclosure', 'The box that holds and protects a circuit.'],
        ['area', 'How many square units cover a flat surface.'],
        ['perimeter', 'The distance all the way around the edge of a shape.'],
      ],
      hook: 'Our night-light circuit is loose on the desk. It needs a home. How big should the lid be to hold the battery pack and board, and how much trim tape goes around its edge?',
      build: {
        title: 'Design the enclosure lid in Build Studio',
        steps: [
          'Open Build Studio. A box is already placed: it is the base of the night-light enclosure.',
          'Set the lid to 8 cm long and 6 cm wide. Turn on the 1 cm grid and count the squares on top, then check with 8 × 6.',
          'Measure around the edge with the ruler tool and add the four sides to get the perimeter.',
          'Try a 7 cm × 5 cm lid and a 6 cm × 6 cm lid. Record perimeter and area for each in a table.',
          'Pick the lid that fits the 6 cm × 3 cm battery pack with room for the board and explain your choice.',
        ],
        launch: { room: 'studio', prompt: 'a small rectangular enclosure for a battery night-light, 8 cm by 6 cm by 4 cm, with a lid and a light hole', starter: { shapes: ['box', 'cylinder'], note: 'Box = enclosure; cylinder = the hole for the LED.' }, lesson: 'stem-35-u03-l4' },
      },
      worked: [
        {
          prompt: 'The lid is 8 cm long and 6 cm wide. Find its area and its perimeter.',
          steps: [
            'Area: rows × columns of 1 cm squares = 8 × 6 = 48 square centimetres.',
            'Perimeter: add all four sides: 8 + 6 + 8 + 6 = 28 cm.',
            'Shortcut: 2 × (8 + 6) = 2 × 14 = 28 cm.',
          ],
          answer: 'Area 48 cm²; perimeter 28 cm',
        },
      ],
      practice: [
        { q: 'A lid is 8 cm × 6 cm. What is its area?', answer: '8 × 6 = 48 cm²', value: 48, unit: 'cm²', check: { f: 'area', args: [8, 6] }, level: 1 },
        { q: 'How much trim tape goes around the edge of that 8 cm × 6 cm lid?', answer: '2 × (8 + 6) = 28 cm', value: 28, unit: 'cm', check: { f: 'perimeter', args: [8, 6] }, level: 1 },
        { q: 'A base plate is 10 cm × 7 cm. Find its area.', answer: '10 × 7 = 70 cm²', value: 70, unit: 'cm²', check: { f: 'area', args: [10, 7] }, level: 1 },
        { q: 'Find the perimeter of the 10 cm × 7 cm base plate.', answer: '2 × (10 + 7) = 34 cm', value: 34, unit: 'cm', check: { f: 'perimeter', args: [10, 7] }, level: 2 },
        { q: 'A lid has a perimeter of 30 cm. One side is 9 cm. How long is the other side? (Half the perimeter is 15 cm.)', answer: '15 − 9 = 6 cm', value: 6, unit: 'cm', check: { f: 'difference', args: [15, 9] }, level: 3 },
        { q: 'A 7 cm × 5 cm lid and a 6 cm × 6 cm lid both have a 24 cm perimeter. What is the area of the 6 cm × 6 cm lid, and which lid holds more?', answer: '6 × 6 = 36 cm², more than 7 × 5 = 35 cm²', value: 36, unit: 'cm²', check: { f: 'area', args: [6, 6] }, level: 3 },
      ],
      exitTicket: { q: 'Your lid is 9 cm × 4 cm. Find the area and the perimeter.', answer: 'Area 9 × 4 = 36 cm²; perimeter 2 × (9 + 4) = 26 cm.' },
      differentiation: {
        support: ['Use 1 cm grid paper and colour the squares before multiplying.', 'Give a perimeter "walk": trace each side with a finger and write its length.'],
        extension: ['Find every whole-number lid with a 24 cm perimeter and say which has the greatest area.', 'Find the total surface area of the 8 × 6 × 4 box (all six faces).'],
        ell: 'Frames: "Area is the ___ inside. Perimeter is the ___ around." Visual anchor chart with a fence and a carpet.',
        supports: ['chunk', 'untimed', 'fewerChoices'],
      },
      safety: { level: 'sim-only', note: 'Design happens on screen in Build Studio. Printing or cutting the box is an adult step, done later by the teacher or makerspace lead.' },
      standards: {
        ngss: ['3-5-ETS1-2'],
        ccss: [C('3.MD.D.8'), C('3.MD.C.7'), C('4.MD.A.3')],
        intl: { uk: 'Y4 Measurement — area and perimeter of rectilinear shapes', cambridge: 'Stage 4 — Geometry and measure: area and perimeter', ib: 'PYP Measurement — phase 3', singapore: 'Primary Mathematics P3 — area and perimeter' },
      },
      museion: 'mathematics',
    },
    {
      id: 'stem-35-u03-l5',
      title: 'How Much Fits Inside? Volume and Big Multiplication',
      minutes: 50,
      strands: ['math', 'engineering'],
      mathFocus: 'volume as layers of cubes; multi-digit multiplication',
      objectives: [
        'I can find the volume of a box by multiplying length × width × height.',
        'I can think of volume as layers: base area × number of layers.',
        'I can multiply multi-digit numbers to plan materials for the whole class.',
      ],
      vocab: [
        ['volume', 'How much space is inside a 3D shape, counted in cubic units.'],
        ['cubic centimetre (cm³)', 'A cube 1 cm on every edge; the unit for small volumes.'],
        ['layer', 'One flat level of cubes covering the base of a box.'],
      ],
      hook: 'Our battery pack is a little brick. Will it fit in the enclosure with room left for the board and wires? Instead of guessing, let us count the space inside, one cube at a time and then all at once.',
      build: {
        title: 'Fill the enclosure with layers',
        steps: [
          'Open Build Studio with the 8 × 6 × 4 cm enclosure. Place one 1 cm cube in a corner.',
          'Duplicate the cube to cover the floor: one layer is 8 × 6 = 48 cubes.',
          'Stack layers until you reach the top (4 layers). Write volume = 48 × 4.',
          'Place the 6 × 3 × 2 cm battery pack inside and find how many cubes of space are left.',
          'Use the lab’s material estimate (grams per box) to plan how much printing material the class needs.',
        ],
        launch: { room: 'studio', prompt: 'a hollow 8 by 6 by 4 centimetre enclosure with a 6 by 3 by 2 centimetre battery pack inside', starter: { shapes: ['box'], note: 'Duplicate 1 cm cubes to fill a layer.' }, lesson: 'stem-35-u03-l5' },
      },
      worked: [
        {
          prompt: 'The enclosure is 8 cm long, 6 cm wide and 4 cm tall. What is its volume?',
          steps: [
            'One layer on the floor is 8 × 6 = 48 cubes.',
            'There are 4 layers, so 48 × 4.',
            '48 × 4 = 40 × 4 + 8 × 4 = 160 + 32 = 192.',
          ],
          answer: '192 cm³',
        },
      ],
      practice: [
        { q: 'Find the volume of an 8 cm × 6 cm × 4 cm enclosure.', answer: '8 × 6 × 4 = 192 cm³', value: 192, unit: 'cm³', check: { f: 'volume', args: [8, 6, 4] }, level: 1 },
        { q: 'The battery pack is 6 cm × 3 cm × 2 cm. What is its volume?', answer: '6 × 3 × 2 = 36 cm³', value: 36, unit: 'cm³', check: { f: 'volume', args: [6, 3, 2] }, level: 1 },
        { q: 'How much space is left in the 192 cm³ enclosure after the 36 cm³ pack goes in?', answer: '192 − 36 = 156 cm³', value: 156, unit: 'cm³', check: { f: 'difference', args: [192, 36] }, level: 2 },
        { q: 'A base layer is 48 cubes. How many cubes fill 4 layers?', answer: '48 × 4 = 192 cubes', value: 192, unit: 'cm³', check: { f: 'product', args: [48, 4] }, level: 2 },
        { q: 'Each printed box uses 18 grams of material. 24 students each print one. How many grams in all?', answer: '24 × 18 = 432 g', value: 432, unit: 'g', check: { f: 'product', args: [24, 18] }, level: 3 },
        { q: 'A taller box is 12 cm × 15 cm × 5 cm. What is its volume?', answer: '12 × 15 × 5 = 900 cm³', value: 900, unit: 'cm³', check: { f: 'volume', args: [12, 15, 5] }, level: 3 },
      ],
      exitTicket: { q: 'A box is 5 cm × 4 cm × 3 cm. Find its volume and say what the base layer is.', answer: 'Base layer 5 × 4 = 20 cubes; 3 layers: 20 × 3 = 60 cm³.' },
      differentiation: {
        support: ['Hands-on: fill a small box with real centimetre cubes before using the formula.', 'Give the base-layer number first and only ask for the number of layers.'],
        extension: ['Design a box with exactly 120 cm³ of space. How many different whole-number boxes can you find?', 'Work out the volume in cubic millimetres for the 8 × 6 × 4 cm box (80 × 60 × 40).'],
        ell: 'Frame: "One layer has ___ cubes. There are ___ layers. The volume is ___ cubic centimetres."',
        supports: ['chunk', 'untimed', 'readAloud'],
      },
      safety: { level: 'sim-only', note: 'Design only. Any printing is run by an adult; students do not handle hot printer parts.' },
      standards: {
        ngss: ['3-5-ETS1-2'],
        ccss: [C('5.MD.C.3'), C('5.MD.C.5'), C('5.NBT.B.5'), C('4.NBT.B.5')],
        intl: { uk: 'Y6 Measurement — volume of cuboids', cambridge: 'Stage 6 — Geometry and measure: volume', ib: 'PYP Measurement — volume, phase 4', singapore: 'Primary Mathematics P5 — volume of cube and cuboid' },
      },
      museion: 'mathematics',
    },
  ],
};

export const G35_UNITS: StemUnit[] = [U01, U02, U03, U04, U05, U06, U07, U08];

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Projects
// ───────────────────────────────────────────────────────────────────────────────────────────────
export const G35_PROJECTS: StemProject[] = [
  {
    id: 'stem-35-proj-nightlight',
    band: '3-5',
    unitId: 'stem-35-u03',
    title: 'Reading-Nook Night-Light',
    subject: 'math',
    drivingQuestion: 'How can we design a battery night-light for a reading nook that lasts a whole week of bedtime stories and fits in a box we designed?',
    brief: 'Design a battery night-light in the Electronics Lab and plan its enclosure. Use multiplication for your battery voltage, division for battery life, fractions for your LED branches, and area, perimeter and volume for the box. Present a one-page design sheet with every calculation shown.',
    deliverables: [
      'A simulated lamp circuit (3 AA, 1–4 LEDs, each with a resistor) saved in the Electronics Lab',
      'A design sheet: voltage, total current, hours of light and nights of reading, with equations',
      'Enclosure plan: lid area and perimeter, box volume and space left after the battery pack',
      'A short reflection: one change you would make and why',
    ],
    steps: [
      'Open the lamp starter on battery power and choose your LED count and colour.',
      'Write the voltage as a multiplication: cells × 1.5 V.',
      'Record the total current and divide 2400 mAh by it to find hours of light.',
      'Divide the hours by your reading time per night to find how many nights it lasts.',
      'Sketch the enclosure lid on grid paper and find its area and perimeter.',
      'Find the box volume and subtract the battery pack volume.',
      'Check that every LED has its own resistor, then share your design sheet with a partner for feedback.',
    ],
    launch: { room: 'elec', template: 'lamp', starter: { values: { power: 'battery', leds: 2, color: 'yellow', brightness: 'low' }, note: 'Reading-nook night-light: aim for at least 5 nights of 4-hour reading.' }, lesson: 'stem-35-proj-nightlight' },
    rubric: {
      criteria: [
        crit('Multiplication and division', 'Calculations are missing or mostly incorrect.', 'Some voltage or battery-life calculations are correct; equations are incomplete.', 'Voltage, current and battery-life calculations are correct with equations shown.', 'All calculations are correct, explained in words, and used to compare two design options.'),
        crit('Area, perimeter and volume', 'Enclosure measurements are missing or confused.', 'Finds either area or perimeter correctly; volume is incomplete.', 'Finds lid area, perimeter and box volume correctly with units.', 'Also finds the space left and justifies the box size from the parts that must fit.'),
        crit('Circuit design', 'The circuit does not light or LEDs lack resistors.', 'The circuit lights but the design does not meet the week-long goal.', 'The circuit lights, every LED has a resistor, and it meets the battery-life goal.', 'Tests more than one LED count and chooses the best with evidence.'),
        crit('Communication', 'Design sheet is hard to follow.', 'Design sheet shows work but is missing labels or units.', 'Design sheet is clear, labelled and uses unit vocabulary correctly.', 'Design sheet teaches the reader: clear steps, a diagram and a thoughtful reflection.'),
      ],
    },
    standards: {
      ngss: ['4-PS3-2', '3-5-ETS1-2'],
      ccss: [C('3.OA.A.3'), C('4.NBT.B.6'), C('3.MD.D.8'), C('3.MD.C.7'), C('5.MD.C.5')],
      intl: { uk: 'Y4–Y6 Multiplication, division and measurement', cambridge: 'Stages 4–6 — Number and measure', ib: 'PYP Number; Measurement', singapore: 'Primary Mathematics P3–P5' },
    },
    minutes: 180,
    differentiation: {
      support: 'Provide a design-sheet template with each equation started (__ × 1.5 V = __) and allow a calculator for the division step.',
      extension: 'Compare two brightness settings and two LED counts and recommend the best night-light with a short graph.',
    },
    safety: { level: 'low', note: 'Design in the simulation. Any classroom build uses a 3-AA alkaline holder (4.5 V), an LED with its resistor and clip leads, with the teacher checking the circuit before the pack is clipped in. No heat tools.' },
  },
  {
    id: 'stem-35-proj-switch-box',
    band: '3-5',
    unitId: 'stem-35-u02',
    title: 'Design a Switch Box',
    subject: 'science',
    drivingQuestion: 'How can we design a box that protects a circuit, keeps its energy where we want it, and lets anyone switch it on easily?',
    brief: 'Model a protective box for a battery, switch and LED in Build Studio. Choose materials for each part as conductors or insulators, leave a hole for the light and a slot for the switch, and test the design against your criteria.',
    deliverables: [
      'A Build Studio model of the box with a light hole and switch slot',
      'A materials table: each part, the material chosen, and whether it should conduct or insulate',
      'Test notes: criteria met or not, and one improvement',
    ],
    steps: [
      'Write your criteria (protects the circuit, switch is easy to reach, light shines out) and constraints (fits in a 10 cm cube, 30 minutes).',
      'In Build Studio, start from the box and resize it to fit the battery pack.',
      'Cut a cylinder-shaped hole for the LED and a box-shaped slot for the switch.',
      'Fill in the materials table with conductor or insulator for every part.',
      'Trade designs with another team and test them against the criteria.',
      'Improve one thing and save a second version.',
    ],
    launch: { room: 'studio', prompt: 'a protective switch box for a 2 AA battery pack, a slide switch and an LED, with a round light hole and a switch slot', starter: { shapes: ['box', 'cylinder', 'box'], note: 'Outer box, light hole, switch slot.' }, lesson: 'stem-35-proj-switch-box' },
    rubric: {
      criteria: [
        crit('Meets criteria and constraints', 'Box does not hold the parts or ignores the limits.', 'Box holds the parts but misses one criterion or constraint.', 'Box meets every criterion and stays inside the constraints.', 'Box meets every criterion and adds a clever improvement that is explained.'),
        crit('Conductors and insulators', 'Materials are not identified.', 'Some materials are correctly sorted.', 'Every part is correctly labelled conductor or insulator with a reason.', 'Explains how the choices keep energy on its path and keep users safe.'),
        crit('Testing and improving', 'No test or change is recorded.', 'A test is recorded but no improvement follows.', 'Testing leads to one clear, recorded improvement.', 'Several tests guide improvements, compared with evidence.'),
      ],
    },
    standards: {
      ngss: ['4-PS3-2', '5-PS1-3', '3-5-ETS1-1', '3-5-ETS1-3'],
      ccss: [C('4.MD.A.3')],
      intl: { uk: 'Y4 Design & technology — electrical systems', cambridge: 'Stage 5 — Science: thinking and working scientifically', ib: 'PYP How we organise ourselves', singapore: 'Primary Science P5 — Electrical systems' },
    },
    minutes: 120,
    differentiation: {
      support: 'Give a pre-sized box and a materials word bank with pictures.',
      extension: 'Add a hinged lid or a battery door and explain how the hinge works.',
    },
    safety: { level: 'sim-only', note: 'Modelling only. If the box is printed or cut, an adult runs the machine; students never handle hot printer parts or blades.' },
  },
  {
    id: 'stem-35-proj-plush-pal',
    band: '3-5',
    unitId: 'stem-35-u07',
    title: 'Plush Pal Pattern Engineers',
    subject: 'math',
    drivingQuestion: 'How much fabric does a plush friend really need, and how do flat pieces become a 3D shape?',
    brief: 'Choose a size for a plush pal in Sewing & Plush, measure the pattern pieces, estimate each piece’s area with a centimetre grid, and plan the fabric you need. With an adult supervising needles, sew, stuff and close it, then reflect on how well the pattern fit.',
    deliverables: [
      'A saved plush-pal pattern at your chosen height',
      'A measurement sheet: each piece’s length and width, its rectangle area on the grid, and the total fabric area',
      'The finished plush (or a sewn sample seam if time is short)',
      'A reflection: what you would change in the pattern next time',
    ],
    steps: [
      'Open the plush-pal pattern and choose a height between 15 and 25 cm.',
      'Print or trace the pieces on centimetre grid paper.',
      'Measure each piece’s length and width and find the area of the rectangle that fits around it.',
      'Add the areas to estimate the total fabric you need, then add a little extra for seams.',
      'With an adult nearby, pin and cut the pieces, then sew with a running or back stitch.',
      'Stuff, close the opening, and test: does it sit flat?',
    ],
    launch: { room: 'sew', template: 'plush-pal', starter: { note: 'Choose a height between 15 and 25 cm.' }, lesson: 'stem-35-proj-plush-pal' },
    rubric: {
      criteria: [
        crit('Measurement', 'Measurements are missing or without units.', 'Some pieces are measured correctly.', 'All pieces are measured correctly in centimetres.', 'Measurements are precise to the half centimetre and checked twice.'),
        crit('Area and fabric plan', 'No area estimate.', 'Area found for some pieces; total is incomplete.', 'Area of every piece and the total fabric are found correctly.', 'Plan explains the extra for seams and lays pieces out to waste little fabric.'),
        crit('Construction', 'Pieces are not joined.', 'Some seams hold; the plush opens or leaks stuffing.', 'Seams hold and the plush is closed and stuffed.', 'Neat, even stitches and the plush sits flat as designed.'),
        crit('Reflection', 'No reflection.', 'Reflection names a problem.', 'Reflection names a problem and a pattern change to fix it.', 'Reflection connects the change to measurements and area.'),
      ],
    },
    standards: {
      ngss: ['3-5-ETS1-1', '3-5-ETS1-3'],
      ccss: [C('3.MD.C.7'), C('4.MD.A.3'), C('4.MD.A.1')],
      intl: { uk: 'Y4 Design & technology — textiles; Measurement — area', cambridge: 'Stage 4 — Geometry and measure: area', ib: 'PYP How we express ourselves', singapore: 'Primary Mathematics P4 — area' },
    },
    minutes: 240,
    differentiation: {
      support: 'Offer pre-cut pieces and a measurement sheet with the rectangles drawn; use felt so edges do not fray.',
      extension: 'Redraft the pal at two heights and compare how the total area changes when the height doubles.',
    },
    safety: { level: 'supervised', note: 'An adult supervises needles and pins at all times and counts them in and out. Sharp scissors stay with the adult; sewing machines only as school policy allows.' },
  },
  ...G35_U04_PROJECTS,
  ...G35_U05_PROJECTS,
];
