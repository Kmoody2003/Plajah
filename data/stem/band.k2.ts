// STEM track, Grades K–2 · Tinkerers.
//
// Seven units across the year, all fully authored. The two anchors live here:
//   u01 Build It Strong      engineering design: ask, imagine, plan, build, test, improve (Build Studio)
//   u02 Lights That Count    electronics-math: counting, patterns, joining and skip-counting, with LEDs as counters
// Units 3–7 (forces, coding, felt critters, living things, weather) live in data/stem/units/k2-u0*.ts.
//
// Safety for this band: nothing hot, nothing plugged in. Circuits live in the simulated Electronics Lab first; the
// only physical circuit is a 3 V coin cell, an LED and copper tape, and an adult holds and places every coin cell
// (they are a serious swallowing hazard). Sewing: an adult does all cutting and machine sewing; children stuff,
// glue and decorate. All prose is original Plajah Academia writing; standards are cited by code only.

import type { RubricCriterion } from '../assignmentTemplates';
import type { Check, CheckFn, PracticeItem, StemProject, StemUnit } from './types';
import { K2_U03 as U03, K2_U03_PROJECTS } from './units/k2-u03';
import { K2_U04 as U04 } from './units/k2-u04';
import { K2_U05 as U05 } from './units/k2-u05';
import { K2_U06 as U06 } from './units/k2-u06';
import { K2_U07 as U07 } from './units/k2-u07';

const M = (code: string) => `CCSS.MATH.CONTENT.${code}`;
const MP = (n: number) => `CCSS.MATH.PRACTICE.MP${n}`;

/** A numeric practice item whose key the tests recompute from `check`. */
const num = (q: string, answer: string, value: number, f: CheckFn, args: number[], level: 1 | 2 | 3, unit?: string): PracticeItem => {
  const check: Check = { f, args };
  return unit ? { q, answer, value, unit, check, level } : { q, answer, value, check, level };
};
/** A practice item answered in words (patterns, explanations, choices). */
const say = (q: string, answer: string, level: 1 | 2 | 3): PracticeItem => ({ q, answer, level });

const crit = (name: string, beginning: string, developing: string, proficient: string, advanced: string): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: beginning, points: 1 },
    { label: 'Developing', descriptor: developing, points: 2 },
    { label: 'Proficient', descriptor: proficient, points: 3 },
    { label: 'Advanced', descriptor: advanced, points: 4 },
  ],
});

const COIN_CELL_NOTE = 'Coin cells are a serious swallowing hazard: an adult keeps them, places them in the holder and collects them at the end. No battery ever goes home in a pocket.';

const INTL_DT = { uk: 'KS1 Design & technology — design, make, evaluate', cambridge: 'Stage 1–3 Science — Thinking and Working Scientifically', ib: 'PYP How the world works — phase 1' };
const INTL_NUM_K = { uk: 'Y1 Number & place value — counting to 20', cambridge: 'Stage 1 — Number: counting and sequences', ib: 'PYP Number — phase 1', singapore: 'P1 Numbers to 10' };
const INTL_ADD = { uk: 'Y1–Y2 Addition & subtraction', cambridge: 'Stage 1–2 — Number: addition and subtraction', ib: 'PYP Number — phase 1–2', singapore: 'P1 Addition and subtraction within 20' };

// ── Unit 1 · Build It Strong (engineering design) ──────────────────────────────

const U01: StemUnit = {
  id: 'stem-k2-u01',
  band: 'K-2',
  n: 1,
  title: 'Build It Strong: Little Engineers',
  kind: 'engineering',
  strands: ['engineering', 'technology', 'math'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'Engineers solve a problem by asking questions, trying an idea, testing it and making it better. A first try is a starting place, not a failure.',
  essentialQuestion: 'How can we make something stronger by testing it and trying again?',
  standards: {
    ngss: ['K-2-ETS1-1', 'K-2-ETS1-2', 'K-2-ETS1-3'],
    ccss: [M('K.MD.A.2'), M('1.MD.C.4'), M('2.MD.A.4'), M('2.MD.D.10')],
    intl: INTL_DT,
  },
  projectIds: ['stem-k2-proj-toy-tower'],
  museion: 'engineering',
  lessons: [
    {
      id: 'stem-k2-u01-l1',
      title: 'What Is the Problem? Ask and Imagine',
      minutes: 30,
      strands: ['engineering', 'math'],
      objectives: [
        'I can say what problem a design needs to solve.',
        'I can ask a question to learn more about a problem.',
        'I can imagine more than one idea before I build.',
      ],
      vocab: [
        ['engineer', 'A person who uses ideas and tools to solve a problem for someone.'],
        ['problem', 'Something that is not working yet, that we want to fix.'],
        ['design', 'A plan for how to make something.'],
      ],
      hook: 'Teddy the toy bear lives on one side of a "river" made of blue paper, and his picnic is on the other side. He cannot swim and his feet must stay dry. What could we make to help Teddy get across?',
      build: {
        title: 'A bridge for Teddy in Build Studio',
        steps: [
          'Open Build Studio. Two boxes are the river banks; the gap between them is the river.',
          'Count how many blocks wide the river is by laying cubes along the gap.',
          'Try one idea: lay a long flat box across the gap. Does it touch both banks?',
          'Try a second idea that is different: a bridge with a pillar in the middle, or a ramp made from wedges.',
          'Tell a partner which idea you like best and why.',
        ],
        launch: {
          room: 'studio',
          prompt: 'Two river banks with a gap between them, and a small toy that needs a bridge to get across.',
          starter: { shapes: ['box', 'box', 'wedge', 'cylinder'], note: 'Banks are the two big boxes; the gap is the river.' },
          lesson: 'stem-k2-u01-l1',
        },
        materials: ['Blue paper strip for the river', 'Building blocks or paper cups', 'A small toy'],
      },
      worked: [
        {
          prompt: 'The river is 6 cubes wide. Ana\'s bridge plank is 8 cubes long. Will it reach across? How many cubes does it rest on the banks?',
          steps: [
            'The plank must be longer than the river to reach both sides.',
            '8 is more than 6, so it reaches.',
            'Count on from 6 to 8: 7, 8. That is 2 extra cubes, so the plank rests on the banks by 2 cubes in all.',
          ],
          answer: 'Yes, it reaches. It has 2 cubes resting on the banks (one at each end).',
        },
      ],
      practice: [
        say('What problem does Teddy have?', 'He needs to get across the river and keep his feet dry.', 1),
        num('The river is 5 cubes wide. A plank is 7 cubes long. How many cubes longer than the river is the plank?', '2 cubes longer.', 2, 'difference', [7, 5], 1, 'cubes'),
        num('A plank is 9 cubes long and the river is 4 cubes wide. How many extra cubes are there?', '5 extra cubes.', 5, 'difference', [9, 4], 2, 'cubes'),
        say('Name one question an engineer might ask before building a bridge.', 'Any fair question, e.g. How heavy is the toy? How wide is the river? What can I use?', 2),
        say('Why is it smart to think of two ideas before you build?', 'If the first idea does not work, you already have another one to try, and you can pick the better one.', 3),
      ],
      exitTicket: { q: 'Draw or tell one idea for getting Teddy across.', answer: 'Any idea that spans the gap: a plank bridge, a pillar bridge, a ramp, a boat.' },
      differentiation: {
        support: ['Give the river width as a printed number line the child can lay cubes on.', 'Offer two picture choices of a bridge and ask which one touches both banks.'],
        extension: ['Make the river wider and ask for a bridge that still holds the toy.', 'Ask for a bridge a toy car can roll over.'],
        ell: 'Frames: "The problem is ___." "My idea is ___." Point to picture cards for bridge, river, bank.',
        supports: ['readAloud', 'chunk', 'fewerChoices'],
      },
      safety: { level: 'low', note: 'Blocks and paper only. Build at table height so towers cannot fall on anyone.' },
      standards: {
        ngss: ['K-2-ETS1-1'],
        ccss: [M('K.MD.A.2'), M('1.OA.A.1')],
        intl: INTL_DT,
      },
      museion: 'engineering',
    },
    {
      id: 'stem-k2-u01-l2',
      title: 'Plan and Build a Tower',
      minutes: 35,
      strands: ['engineering', 'technology', 'math'],
      objectives: [
        'I can draw a simple plan before I build.',
        'I can build a tower that matches my plan.',
        'I can add the heights of blocks to find how tall my tower is.',
      ],
      vocab: [
        ['plan', 'A drawing that shows what you are going to build.'],
        ['base', 'The bottom part that holds everything up.'],
        ['stable', 'Steady; it does not tip over easily.'],
      ],
      hook: 'Hold up a tall stack of cups on a tiny base and a short stack on a wide base, then gently blow on each. Which one wobbles? Why do you think so?',
      build: {
        title: 'Plan-first tower in Build Studio',
        steps: [
          'Draw your tower on paper first: which shapes go on the bottom, middle and top?',
          'Open Build Studio and place the shapes in the same order as your drawing.',
          'Use the height label to see how tall each shape is, and add them up.',
          'Check Build Studio’s stability note (it warns when a tower is tall and narrow). Then print or stack a real one and give it a gentle blow: does it stay standing?',
          'Circle the part of your plan you would change.',
        ],
        launch: {
          room: 'studio',
          prompt: 'A toy tower built from simple blocks, as tall as possible while staying steady.',
          starter: { shapes: ['box', 'cylinder', 'cone', 'pyramid'], note: 'Each box is 3 units tall.' },
          lesson: 'stem-k2-u01-l2',
        },
        materials: ['Paper and crayons for the plan', 'Paper cups or wooden blocks'],
      },
      worked: [
        {
          prompt: 'Leo stacks 3 boxes. Each box is 3 units tall. How tall is his tower?',
          steps: ['Write the height of each box: 3, 3, 3.', 'Add two at a time: 3 + 3 = 6, then 6 + 3 = 9.'],
          answer: 'The tower is 9 units tall.',
        },
      ],
      practice: [
        num('A tower has 4 boxes, each 3 units tall. How tall is it?', '12 units tall (3 + 3 + 3 + 3).', 12, 'sum', [3, 3, 3, 3], 2, 'units'),
        num('A tower has a box 3 units tall and a cone 2 units tall on top. How tall is it?', '5 units tall.', 5, 'sum', [3, 2], 1, 'units'),
        num('Mia\'s tower is 10 units tall. She takes off a box 3 units tall. How tall is it now?', '7 units tall.', 7, 'difference', [10, 3], 2, 'units'),
        say('Which is more stable: a wide base or a narrow base?', 'A wide base.', 1),
        say('Why do engineers draw a plan before building?', 'So they know what to build, can share the idea, and can see what to change.', 3),
      ],
      exitTicket: { q: 'Point to the base of your tower. Why does it matter?', answer: 'The base is the bottom; a wide, flat base keeps the tower from tipping.' },
      differentiation: {
        support: ['Provide a plan template with three boxes to fill: bottom, middle, top.', 'Use real cubes alongside the screen so heights can be counted by touch.'],
        extension: ['Build the tallest tower that Build Studio does not flag as tall and narrow, and record its height.', 'Use exactly 5 shapes and make two different towers of the same height.'],
        ell: 'Frames: "On the bottom I put ___." "It is ___ units tall." Gesture wide and narrow.',
        supports: ['chunk', 'untimed', 'readAloud'],
      },
      safety: { level: 'low', note: 'Keep physical towers below shoulder height and build away from walkways.' },
      standards: {
        ngss: ['K-2-ETS1-2'],
        ccss: [M('1.OA.A.2'), M('1.OA.C.6'), M('K.G.B.5')],
        intl: INTL_DT,
      },
      museion: 'engineering',
    },
    {
      id: 'stem-k2-u01-l3',
      title: 'Test, Compare, Make It Better',
      minutes: 35,
      strands: ['engineering', 'math', 'science'],
      objectives: [
        'I can test two designs the same way.',
        'I can count and compare test results.',
        'I can tell which design worked better and why.',
      ],
      vocab: [
        ['test', 'Trying a design to see how well it works.'],
        ['fair test', 'Testing every design in exactly the same way.'],
        ['improve', 'To change a design so it works better.'],
      ],
      hook: 'Two paper bridges look almost the same, but one is folded like a fan. We will add pennies one at a time until each bridge sags. Which one will hold more? Make a guess with your thumb up or down.',
      build: {
        title: 'Load test in Build Studio, then on the table',
        steps: [
          'In Build Studio, place the flat bridge and the folded bridge side by side over the same gap.',
          'Add weight blocks one at a time until each bridge bends. Count the blocks each one holds.',
          'Write the two numbers on the class chart.',
          'Change one thing about the weaker bridge, test again and count.',
          'With an adult, try the real paper bridges over two books with pennies.',
        ],
        launch: {
          room: 'studio',
          prompt: 'Two toy bridges over the same gap, one flat and one folded, ready for a weight test with small blocks.',
          starter: { shapes: ['box', 'box', 'box', 'wedge'], note: 'Small cubes are the test weights.' },
          lesson: 'stem-k2-u01-l3',
        },
        materials: ['Two sheets of paper', 'Two stacks of books', 'Pennies or counters'],
      },
      worked: [
        {
          prompt: 'The flat bridge held 4 pennies. The folded bridge held 11 pennies. How many more did the folded bridge hold?',
          steps: ['Start at the smaller number, 4.', 'Count on to 11: 5, 6, 7, 8, 9, 10, 11. That is 7 counts.', 'Check: 4 + 7 = 11.'],
          answer: 'The folded bridge held 7 more pennies.',
        },
      ],
      practice: [
        num('Bridge A held 6 pennies. Bridge B held 13. How many more did Bridge B hold?', '7 more pennies.', 7, 'difference', [13, 6], 2, 'pennies'),
        num('A bridge was tested three times. It held 5, 6 and 4 pennies. How many pennies is that altogether?', '15 pennies.', 15, 'sum', [5, 6, 4], 2, 'pennies'),
        num('Before the change the tower held 8 blocks. After, it held 12. How many more blocks?', '4 more blocks.', 4, 'difference', [12, 8], 1, 'blocks'),
        say('Sam tested his bridge with pennies and Jo tested hers with big rocks. Is that a fair test?', 'No. To be fair, both bridges must be tested with the same kind of weight.', 2),
        say('The folded bridge held more. What could you try next to make it even stronger?', 'Any reasonable change: more folds, a thicker paper, a pillar in the middle, a shorter span.', 3),
      ],
      exitTicket: { q: 'Bridge A held 9 pennies and Bridge B held 3. Which is stronger, and by how many?', answer: 'Bridge A, by 6 pennies.' },
      differentiation: {
        support: ['Use a ten frame to hold the pennies so totals can be seen at a glance.', 'Compare with "more" and "fewer" before finding how many more.'],
        extension: ['Make a picture graph of the class results.', 'Find the strongest bridge using only one sheet of paper and tape.'],
        ell: 'Frames: "Bridge ___ held more." "It held ___ more pennies." Act out "bend" and "sag".',
        supports: ['chunk', 'calm', 'schedule'],
      },
      safety: { level: 'low', note: 'Pennies are small: count them back into the cup at the end and keep them away from mouths.' },
      standards: {
        ngss: ['K-2-ETS1-3'],
        ccss: [M('K.MD.A.2'), M('1.MD.C.4'), M('2.MD.D.10'), M('1.OA.A.2')],
        intl: INTL_DT,
      },
      museion: 'engineering',
    },
  ],
};

// ── Unit 2 · Lights That Count (electronics-math) ─────────────────────────────

const ELEC_SIM = 'Simulated Electronics Lab only: nothing physical to touch.';

const U02: StemUnit = {
  id: 'stem-k2-u02',
  band: 'K-2',
  n: 2,
  title: 'Lights That Count: Math Through Electronics',
  kind: 'electronics-math',
  strands: ['math', 'technology', 'engineering'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'Little lights make great counters. When a switch turns an LED on, we can count it, make patterns with it, join groups of lights and skip-count lights in pairs.',
  essentialQuestion: 'How can lights that turn on and off help us count, add and find patterns?',
  standards: {
    ccss: [M('K.CC.B.4.C'), M('K.CC.B.5'), M('K.CC.C.6'), M('K.OA.A.1'), M('K.OA.A.4'), M('1.OA.A.2'), M('1.OA.C.5'), M('2.OA.B.2'), M('2.OA.C.3'), M('2.OA.C.4')],
    ngss: ['K-2-ETS1-2'],
    csta: ['1A-CS-01'],
    intl: INTL_NUM_K,
  },
  projectIds: ['stem-k2-proj-light-number-card'],
  museion: 'mathematics',
  lessons: [
    {
      id: 'stem-k2-u02-l1',
      title: 'Count the Lights: One More, One Less',
      minutes: 30,
      strands: ['math', 'technology'],
      mathFocus: 'counting and one more / one less',
      objectives: [
        'I can count how many lights are on.',
        'I can tell how many there are when one more light turns on.',
        'I can tell how many there are when one light turns off.',
      ],
      vocab: [
        ['LED', 'A tiny light that turns on when electricity flows through it.'],
        ['switch', 'A button that turns a light on or off.'],
        ['one more', 'The next number when we count up by one.'],
      ],
      hook: 'The screen shows a row of ten little lights, all dark. Click! One turns on. Click! Another. Each time I press a switch, call out how many lights are on now.',
      build: {
        title: 'Ten lights, ten switches',
        steps: [
          'Open the Electronics Lab. You will see a battery, ten LEDs and ten switches.',
          'Press switches to turn on 4 lights. Touch and count each lit light once.',
          'Turn on one more. Say the new number before you count.',
          'Turn one off. Say how many are left.',
          'Take turns: one partner says a number, the other lights exactly that many.',
        ],
        launch: {
          room: 'elec',
          prompt: 'A row of ten LEDs, each with its own press switch, powered by one 3 V coin cell, for counting practice.',
          lesson: 'stem-k2-u02-l1',
        },
      },
      worked: [
        {
          prompt: 'Five lights are on. You press one more switch. How many lights are on now?',
          steps: ['Start at 5. Do not count again from 1.', 'One more after 5 is 6.'],
          answer: '6 lights are on.',
        },
        {
          prompt: 'Eight lights are on. You turn one off. How many are on?',
          steps: ['Start at 8.', 'One less than 8 is the number just before it: 7.'],
          answer: '7 lights are on.',
        },
      ],
      practice: [
        num('3 lights are on. One more turns on. How many are on now?', '4 lights.', 4, 'sum', [3, 1], 1, 'lights'),
        num('6 lights are on. One turns off. How many are on now?', '5 lights.', 5, 'difference', [6, 1], 1, 'lights'),
        num('9 lights are on. One more turns on. How many are on now?', '10 lights.', 10, 'sum', [9, 1], 2, 'lights'),
        num('All 10 lights are on. Two turn off. How many are still on?', '8 lights.', 8, 'difference', [10, 2], 2, 'lights'),
        say('Lights are on in a scattered group, not a line. How can you make sure you count each one only once?', 'Touch each light as you count it, or count in rows, so none is skipped or counted twice.', 3),
      ],
      exitTicket: { q: '7 lights are on. What is one more? What is one less?', answer: 'One more is 8; one less is 6.' },
      differentiation: {
        support: ['Work with 5 lights before 10.', 'Lay a counter on each lit LED on a paper copy of the screen.'],
        extension: ['Ask "two more" and "two less" questions.', 'Light a number, cover the screen, and ask how many would be on after three more.'],
        ell: 'Frames: "___ lights are on." "One more is ___." Show on/off with hand open and closed.',
        supports: ['readAloud', 'chunk', 'untimed'],
      },
      safety: { level: 'sim-only', note: ELEC_SIM },
      standards: {
        ccss: [M('K.CC.B.4.A'), M('K.CC.B.4.B'), M('K.CC.B.4.C'), M('K.CC.B.5')],
        csta: ['1A-CS-01'],
        intl: INTL_NUM_K,
      },
      museion: 'mathematics',
    },
    {
      id: 'stem-k2-u02-l2',
      title: 'On, Off, Off: Light Patterns',
      minutes: 30,
      strands: ['math', 'technology'],
      mathFocus: 'repeating patterns and counting groups',
      objectives: [
        'I can make a repeating ON-OFF light pattern.',
        'I can say what comes next in a light pattern.',
        'I can count how many lights are in a pattern that repeats.',
      ],
      vocab: [
        ['pattern', 'Something that repeats the same way again and again.'],
        ['core', 'The part of a pattern that repeats, like ON, OFF.'],
        ['repeat', 'To do the same thing again.'],
      ],
      hook: 'Watch the lights blink: ON, OFF, ON, OFF. Now: ON, OFF, OFF, ON, OFF, OFF. Can you clap the pattern? What will the next light do?',
      build: {
        title: 'Program a blinking pattern',
        steps: [
          'Open the Electronics Lab with the row of ten lights.',
          'Set an AB pattern: on, off, on, off, all the way along the row.',
          'Change it to an ABB pattern: on, off, off.',
          'Find the core of each pattern and put a box around it on your worksheet.',
          'Make your own pattern and challenge a partner to say what comes next.',
        ],
        launch: {
          room: 'elec',
          prompt: 'Ten LEDs in a row on one 3 V coin cell, each with a press switch, used to build on-off patterns.',
          lesson: 'stem-k2-u02-l2',
        },
      },
      worked: [
        {
          prompt: 'The pattern core is ON, OFF, OFF. It repeats 3 times. How many lights are in the whole pattern? How many are ON?',
          steps: ['One core has 3 lights.', 'Three cores: 3 + 3 + 3 = 9 lights.', 'Each core has 1 ON light, so 3 cores have 3 ON lights.'],
          answer: '9 lights in all, and 3 of them are ON.',
        },
      ],
      practice: [
        say('ON, OFF, ON, OFF, ON, ___. What comes next?', 'OFF.', 1),
        say('ON, OFF, OFF, ON, OFF, OFF, ON, ___, ___. What are the next two?', 'OFF, OFF.', 2),
        num('The core ON, OFF repeats 5 times. How many lights are there in all?', '10 lights (2 + 2 + 2 + 2 + 2).', 10, 'product', [2, 5], 2, 'lights'),
        num('The core ON, OFF, OFF repeats 4 times. How many lights are OFF?', '8 lights are off (2 in each core, 4 cores).', 8, 'product', [2, 4], 3, 'lights'),
        num('Ten lights blink ON, OFF, ON, OFF all along the row. How many are ON?', '5 lights are on.', 5, 'quotient', [10, 2], 2, 'lights'),
      ],
      exitTicket: { q: 'Make an ABB pattern with 6 lights. How many are ON?', answer: 'ON, OFF, OFF, ON, OFF, OFF: 2 lights are ON.' },
      differentiation: {
        support: ['Use two colours of counters on paper beside the screen.', 'Start with AB only; add ABB once AB is steady.'],
        extension: ['Make an AAB or ABC pattern and count each part.', 'Predict the 12th light in an ABB pattern without building it.'],
        ell: 'Frames: "Next comes ___." "The core is ___." Clap and stomp patterns together.',
        supports: ['readAloud', 'fewerChoices', 'calm'],
      },
      safety: { level: 'sim-only', note: ELEC_SIM },
      standards: {
        ccss: [M('K.CC.B.5'), M('1.OA.C.5'), M('2.OA.C.4'), MP(7)],
        csta: ['1A-AP-10'],
        intl: INTL_NUM_K,
      },
      museion: 'mathematics',
    },
    {
      id: 'stem-k2-u02-l3',
      title: 'Join the Strings: Adding Lights',
      minutes: 35,
      strands: ['math', 'technology', 'engineering'],
      mathFocus: 'addition within 10 and 20, making ten',
      objectives: [
        'I can join two strings of lights and find how many in all.',
        'I can find how many more lights make 10.',
        'I can add three small groups of lights.',
      ],
      vocab: [
        ['add', 'Put groups together to find how many in all.'],
        ['circuit', 'A path that goes all the way round so electricity can flow and the light turns on.'],
        ['make ten', 'Find the number that joins with another to make 10.'],
      ],
      hook: 'One light string has 4 glowing lights. Another has 3. If we connect them into one long string, how many lights will glow? Make a guess, then we will join them and see.',
      build: {
        title: 'Snap light strings together',
        steps: [
          'Open the Electronics Lab. Two short strings of LEDs sit next to a battery and a switch.',
          'Count the lights on each string and write the two numbers.',
          'Connect the strings into one circuit and press the switch.',
          'Count all the lights that glow and write the addition sentence.',
          'With your teacher, look at a real copper-tape card: an adult places the coin cell, and you press the switch to light it.',
        ],
        launch: {
          room: 'elec',
          prompt: 'Two short strings of LEDs that join into one circuit with a press switch and a 3 V coin cell, so children can add the lights.',
          lesson: 'stem-k2-u02-l3',
        },
        materials: ['Copper-tape light card prepared by the teacher (optional)', '3 V coin cell in a holder with a built-in switch, handled by an adult', 'Counters'],
      },
      worked: [
        {
          prompt: 'A string of 6 lights joins a string of 7 lights. How many lights glow?',
          steps: ['Make ten: 6 needs 4 more to make 10, so split 7 into 4 and 3.', '6 + 4 = 10, then 10 + 3 = 13.'],
          answer: '13 lights glow.',
        },
      ],
      practice: [
        num('A string of 3 lights joins a string of 4. How many lights in all?', '7 lights.', 7, 'sum', [3, 4], 1, 'lights'),
        num('A string of 5 joins another string of 5. How many lights?', '10 lights.', 10, 'sum', [5, 5], 1, 'lights'),
        num('A string has 6 lights. How many more lights would make 10?', '4 more lights.', 4, 'difference', [10, 6], 2, 'lights'),
        num('A string of 8 lights joins a string of 7. How many lights glow?', '15 lights (8 + 2 = 10, 10 + 5 = 15).', 15, 'sum', [8, 7], 2, 'lights'),
        num('Three strings have 9, 6 and 2 lights. How many lights altogether?', '17 lights (9 + 6 = 15, 15 + 2 = 17).', 17, 'sum', [9, 6, 2], 3, 'lights'),
      ],
      exitTicket: { q: 'A string of 9 joins a string of 4. How many lights glow?', answer: '13 lights.' },
      differentiation: {
        support: ['Keep totals within 10 using a ten frame beside the screen.', 'Let the child count all from 1 before moving to counting on.'],
        extension: ['Find every pair of strings that makes 10.', 'Write a light story problem for a partner with a total between 15 and 20.'],
        ell: 'Frames: "___ and ___ make ___." Use the cognate "total" and point to each string as you add.',
        supports: ['readAloud', 'chunk', 'untimed'],
      },
      safety: { level: 'supervised', note: `Simulated first. If the copper-tape card is used, ${COIN_CELL_NOTE}` },
      standards: {
        ccss: [M('K.OA.A.1'), M('K.OA.A.4'), M('1.OA.A.2'), M('1.OA.C.6'), M('2.OA.B.2')],
        ngss: ['K-2-ETS1-2'],
        intl: INTL_ADD,
      },
      museion: 'physics',
    },
    {
      id: 'stem-k2-u02-l4',
      title: 'Lights in Pairs: Skip-Count and Compare',
      minutes: 35,
      strands: ['math', 'technology'],
      mathFocus: 'skip-counting by 2s, even and odd, comparing groups',
      objectives: [
        'I can skip-count lights by 2s.',
        'I can tell if a number of lights is even or odd by pairing them.',
        'I can compare two groups of lights and find how many more.',
      ],
      vocab: [
        ['pair', 'Two things that go together.'],
        ['even', 'A number of things that can all be put in pairs with none left over.'],
        ['odd', 'A number of things that leaves one without a partner when you make pairs.'],
      ],
      hook: 'Each switch on this board lights two LEDs at once, like a pair of eyes. Press three switches. Let\'s count the lights together: 2, 4, 6. What did we just do?',
      build: {
        title: 'Pair-light board',
        steps: [
          'Open the Electronics Lab with the pair-light board: every switch turns on two LEDs.',
          'Press switches one at a time and skip-count the lights by 2s.',
          'Light 7 single LEDs on the other side. Can every light find a partner?',
          'Light two groups and compare: which has more, and how many more?',
          'Record your skip-count on the number line.',
        ],
        launch: {
          room: 'elec',
          prompt: 'A board of ten switches where each press switch lights a pair of LEDs, on one 3 V coin cell, for skip-counting by twos.',
          lesson: 'stem-k2-u02-l4',
        },
      },
      worked: [
        {
          prompt: 'You press 4 pair-switches. How many lights are on?',
          steps: ['Each switch lights 2.', 'Skip-count: 2, 4, 6, 8.', 'Check with addition: 2 + 2 + 2 + 2 = 8.'],
          answer: '8 lights are on.',
        },
      ],
      practice: [
        num('You press 6 pair-switches. How many lights are on?', '12 lights.', 12, 'product', [2, 6], 2, 'lights'),
        num('20 lights are on in pairs. How many switches did you press?', '10 switches.', 10, 'quotient', [20, 2], 3, 'switches'),
        num('Group A has 9 lights on. Group B has 5. How many more does Group A have?', '4 more lights.', 4, 'difference', [9, 5], 1, 'lights'),
        num('A board has 2 rows of lights with 7 in each row. How many lights?', '14 lights (7 + 7).', 14, 'product', [2, 7], 2, 'lights'),
        say('Is 11 lights even or odd? How do you know?', 'Odd: when you make pairs, one light is left without a partner.', 2),
      ],
      exitTicket: { q: 'Skip-count by 2s from 2 to 10. How many pair-switches is that?', answer: '2, 4, 6, 8, 10: five switches.' },
      differentiation: {
        support: ['Use a hundred chart and colour every second number.', 'Pair real counters before deciding even or odd.'],
        extension: ['Skip-count by 5s with a five-light switch.', 'Find all the even numbers of lights up to 20.'],
        ell: 'Frames: "___ is even because ___." "Group ___ has ___ more." Show pairs with two fingers.',
        supports: ['readAloud', 'chunk', 'fewerChoices'],
      },
      safety: { level: 'sim-only', note: ELEC_SIM },
      standards: {
        ccss: [M('2.OA.C.3'), M('2.OA.C.4'), M('K.CC.C.6'), M('1.OA.A.1')],
        intl: { uk: 'Y2 Number — count in steps of 2, odd and even', cambridge: 'Stage 2 — Number: counting in twos', ib: 'PYP Number — phase 2', singapore: 'P2 Multiplication by 2' },
      },
      museion: 'mathematics',
    },
  ],
};






export const K2_UNITS: StemUnit[] = [U01, U02, U03, U04, U05, U06, U07];

// ── Projects ──────────────────────────────────────────────────────────────────

export const K2_PROJECTS: StemProject[] = [
  {
    id: 'stem-k2-proj-toy-tower',
    band: 'K-2',
    unitId: 'stem-k2-u01',
    title: 'A Lookout Tower for a Toy',
    subject: 'science',
    drivingQuestion: 'How can we build a tower tall enough for a toy to see over the classroom wall, that does not tip over?',
    brief: 'A small toy wants a lookout tower. Plan it on paper, build it in Build Studio, check its stability, then change one thing to make it better. Tell the class what you changed and what happened.',
    deliverables: ['A labelled drawing of your plan', 'Your Build Studio tower, before and after the change', 'A sentence or a recording: "I changed ___ and it ___."'],
    steps: [
      'Look at the toy and say what problem the tower solves.',
      'Draw your tower: what goes on the bottom, middle and top?',
      'Build it in Build Studio and add up how tall it is.',
      'Check Build Studio’s stability note, then build a real one from blocks and count how many gentle blows it survives.',
      'Change one thing, test again and compare.',
      'Share your before and after with the class.',
    ],
    launch: {
      room: 'studio',
      prompt: 'A lookout tower for a small toy, as tall as possible without being too tall and narrow to stand.',
      starter: { shapes: ['box', 'cylinder', 'wedge', 'pyramid'], note: 'Put the toy on the very top.' },
      lesson: 'stem-k2-proj-toy-tower',
    },
    rubric: {
      criteria: [
        crit('Plan', 'No plan, or a plan that does not match the tower', 'A plan with some parts shown', 'A clear plan the tower follows', 'A clear plan with labels and a reason for the base'),
        crit('Build and test', 'Started a tower', 'Built a tower and tested it once', 'Built, tested and recorded what happened', 'Built, tested, and used the result to choose a change'),
        crit('Improve', 'No change made', 'Made a change but did not test it', 'Made one change and tested again', 'Made a change, tested, and explained why it worked better or worse'),
        crit('Share', 'Showed the tower', 'Said one thing about it', 'Told what changed and what happened', 'Told what changed, what happened, and what to try next'),
      ],
    },
    standards: { ngss: ['K-2-ETS1-1', 'K-2-ETS1-2', 'K-2-ETS1-3'], ccss: [M('1.OA.A.2'), M('K.MD.A.2')], intl: INTL_DT },
    minutes: 90,
    differentiation: {
      support: 'Offer a three-box plan template and real blocks to build alongside the screen; accept a spoken explanation.',
      extension: 'Set a height goal and a shape limit, and compare two towers of the same height to see which is steadier.',
    },
    safety: { level: 'low', note: 'Screen and building blocks only. Any physical tower stays below shoulder height.' },
  },
  {
    id: 'stem-k2-proj-light-number-card',
    band: 'K-2',
    unitId: 'stem-k2-u02',
    title: 'My Light-Up Number Card',
    subject: 'math',
    drivingQuestion: 'How can we design a card with lights that helps a younger child learn to count?',
    brief: 'Design a counting card in the Electronics Lab with up to ten LEDs and switches. Choose a number, light that many, and write the matching numeral and an addition sentence. Then use your card to quiz a partner on one more, one less and making ten.',
    deliverables: ['A simulated light card showing your number', 'The numeral and two addition sentences that make your number', 'A quiz question for a partner, with the answer'],
    steps: [
      'Pick a number from 1 to 10 (or up to 20 with two strings).',
      'Open the Electronics Lab and light exactly that many LEDs.',
      'Write the numeral and two ways to make it, like 4 + 3 and 5 + 2.',
      'Show one more and one less on your card.',
      'Quiz a partner with your card and check their answer.',
      'Optional, with your teacher: see your design on a real copper-tape card, with an adult handling the coin cell.',
    ],
    launch: {
      room: 'elec',
      prompt: 'A 3 V coin-cell counting card with up to ten LEDs, each with its own press switch, for a young child learning numbers.',
      lesson: 'stem-k2-proj-light-number-card',
    },
    rubric: {
      criteria: [
        crit('Counting', 'Lit lights but the count does not match', 'Count matches with help', 'Lit and counted the number correctly', 'Counted correctly and showed one more and one less'),
        crit('Number sentences', 'No sentence', 'One sentence, with an error', 'Two correct sentences that make the number', 'Three or more correct sentences, including making ten'),
        crit('Card design', 'Lights placed at random', 'Lights in a row', 'Lights arranged so they are easy to count', 'Arranged in fives or pairs, and can explain why that helps'),
        crit('Partner quiz', 'No question', 'A question without an answer', 'A clear question with the right answer', 'A question that checks one more, one less or make ten, and helped the partner fix a mistake'),
      ],
    },
    standards: { ccss: [M('K.CC.B.5'), M('K.CC.B.4.C'), M('K.OA.A.4'), M('1.OA.C.6')], intl: INTL_NUM_K },
    minutes: 60,
    differentiation: {
      support: 'Work with numbers to 5 on a five-light card; provide sentence frames "___ and ___ make ___".',
      extension: 'Build a two-string card for a number from 11 to 20 and show it as 10 and some more.',
    },
    safety: { level: 'supervised', note: `The design is made in the simulated lab. If a physical card is shown, ${COIN_CELL_NOTE}` },
  },
  {
    id: 'stem-k2-proj-felt-critter',
    band: 'K-2',
    unitId: 'stem-k2-u05',
    title: 'Design a Felt Critter',
    subject: 'science',
    drivingQuestion: 'Which materials make the softest, sturdiest critter for a friend to hug?',
    brief: 'Choose a critter shape in Sewing & Plush and change its ears, arms and feet. Test fabric swatches by squishing and stretching, and pick the best one. An adult cuts and sews your critter; you stuff it, glue on its face and give it a name.',
    deliverables: ['Your critter design from Sewing & Plush', 'A material test chart with a star on your choice', 'Your stuffed and decorated critter, with its name'],
    steps: [
      'Open Sewing & Plush and change the critter shape until it looks like your idea.',
      'Squish and stretch three fabric swatches and draw a face for how each one feels.',
      'Choose a fabric and tell why it is best.',
      'Give your design to an adult, who cuts and sews it.',
      'Stuff your critter and glue on eyes, nose and patches with felt glue.',
      'Tell a friend which material you chose and why.',
    ],
    launch: {
      room: 'sew',
      template: 'plush-pal',
      prompt: 'A small round felt critter a child can stuff and decorate; an adult cuts and sews.',
      lesson: 'stem-k2-proj-felt-critter',
    },
    rubric: {
      criteria: [
        crit('Design', 'Used the starter shape unchanged', 'Changed one part', 'Changed parts to match an idea', 'Changed parts and explained how each fits the idea'),
        crit('Material test', 'Did not test', 'Tested one swatch', 'Tested three swatches and recorded each', 'Tested, recorded, and compared using words like soft, stiff, stretchy'),
        crit('Choosing', 'Chose without a reason', 'Gave a reason that is not about the material', 'Chose using a test result', 'Chose using test results and named a trade-off'),
        crit('Making', 'Started stuffing', 'Stuffed the critter', 'Stuffed and decorated it neatly', 'Finished it and could tell the steps in order'),
      ],
    },
    standards: { ngss: ['2-PS1-1', '2-PS1-2', 'K-2-ETS1-2'], ccss: [M('1.G.A.2')], intl: { uk: 'KS1 Design & technology — textiles; KS1 Science — everyday materials', cambridge: 'Stage 2 Chemistry — materials', ib: 'PYP How we express ourselves — phase 1' } },
    minutes: 120,
    differentiation: {
      support: 'Offer two pre-chosen fabric swatches and picture cards for soft, stiff and stretchy; stuffing can be done with a partner.',
      extension: 'Add a pocket or a second colour patch to the design and explain where it goes on the pattern.',
    },
    safety: { level: 'supervised', note: 'An adult does all cutting and machine sewing. Children use felt glue, not needles, unless an adult is sitting beside them. Glue-on eyes are for older children only; embroider or use felt eyes for any critter given to a child under three.' },
  },
  ...K2_U03_PROJECTS,
];
