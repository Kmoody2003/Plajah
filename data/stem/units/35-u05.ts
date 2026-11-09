// 3–5 · Unit 5 · Loops & Events: Coding a Light Show (technology). Original Plajah Academia writing.
import type { StemProject, StemUnit } from '../types';
import { G35_AA_PACK, M, crit, num, say } from '../kit';

const INTL = { uk: 'KS2 Computing — sequence, selection and repetition', cambridge: 'Stage 5 — Computing: programming', ib: 'PYP Technology — computational thinking', singapore: 'Code for Fun — primary' };
const PICO = 'A simulated Raspberry Pi Pico on a 3 × AA pack with four LEDs (each with its own 220 ohm resistor) on pins 2 to 5 and a push button on pin 14, programmed with blocks or simple Python.';
const SIM = 'Simulated Electronics Lab first. A physical board is powered from a USB port on a computer or an AA pack only.';

export const G35_U05: StemUnit = {
  id: 'stem-35-u05',
  band: '3-5',
  n: 5,
  title: 'Loops & Events: Coding a Light Show',
  kind: 'technology',
  strands: ['technology', 'math', 'engineering'],
  status: 'complete',
  weeks: 4,
  bigIdea: 'Programs are step-by-step instructions; loops repeat steps and events make a program react to the world.',
  essentialQuestion: 'How can a few lines of code make a light show that responds to a button?',
  standards: {
    csta: ['1B-AP-08', '1B-AP-10', '1B-AP-11', '1B-AP-12', '1B-AP-15'],
    ccss: [M('4.OA.C.5'), M('3.OA.D.9')],
    intl: INTL,
  },
  projectIds: ['stem-35-proj-light-show'],
  museion: 'cs',
  lessons: [
    {
      id: 'stem-35-u05-l1',
      title: 'Algorithms Out Loud, then Blink with a Repeat Block',
      minutes: 45,
      strands: ['technology', 'math'],
      objectives: [
        'I can write a precise algorithm a classmate can follow.',
        'I can use a repeat (loop) block to blink an LED.',
        'I can use the on and off times to work out how many blinks happen in a minute.',
      ],
      vocab: [
        ['algorithm', 'A precise list of steps to solve a problem.'],
        ['loop', 'Code that repeats.'],
        ['delay', 'An instruction to wait a set time, often in milliseconds (ms).'],
        ['millisecond', 'One thousandth of a second: 1000 ms = 1 s.'],
      ],
      hook: 'One student is the "robot" and may only follow exact words. Another writes the steps to draw a square on the board. The robot follows them literally, and the square goes very wrong. What makes an instruction precise?',
      build: {
        title: 'Blink an LED on a simulated Pico',
        steps: [
          'Write a 5-step algorithm for a classmate robot to draw a square; test and fix it.',
          'Open the Electronics Lab with the Pico light-show starter.',
          'Write: LED on, wait 500 ms, LED off, wait 500 ms. Run it once.',
          'Wrap those four steps in a "repeat 10" loop and run again. Count the blinks.',
          'Change the waits to 250 ms and predict how many blinks fit in 10 seconds.',
        ],
        launch: { room: 'elec', prompt: PICO, lesson: 'stem-35-u05-l1' },
        materials: ['Whiteboard and marker for the classmate robot'],
      },
      worked: [
        {
          prompt: 'An LED is on for 500 ms and off for 500 ms each blink. How many blinks in one minute?',
          steps: ['One blink takes 500 + 500 = 1000 ms = 1 second.', 'One minute is 60 seconds.', '60 ÷ 1 = 60 blinks.'],
          answer: '60 blinks a minute.',
        },
      ],
      practice: [
        num('On 250 ms and off 250 ms. How long is one blink?', '500 ms.', 500, 'sum', [250, 250], 1, 'ms'),
        num('Each blink takes 500 ms. How many blinks fit in 10 seconds (10000 ms)?', '10000 ÷ 500 = 20 blinks.', 20, 'quotient', [10000, 500], 2, 'blinks'),
        num('A loop repeats 12 times and each pass blinks 3 LEDs. How many blinks?', '12 × 3 = 36 blinks.', 36, 'product', [12, 3], 2, 'blinks'),
        say('Why is "repeat 10" better than writing the same four lines ten times?', 'Shorter, easier to read and change, fewer chances for mistakes.', 1),
        say('A robot was told "walk to the door" and walked into a desk. How do you make the algorithm more precise?', 'Give exact steps, e.g. "turn left, take 4 steps, turn right, take 6 steps".', 3),
      ],
      exitTicket: { q: 'Write a loop that blinks an LED 5 times.', answer: 'repeat 5 [LED on, wait, LED off, wait] (any equivalent).' },
      differentiation: {
        support: ['Provide the blink blocks pre-made to drag into the loop.', 'Use 1000 ms waits so each blink is one second.'],
        extension: ['Make two LEDs blink in turn (a police light).', 'Find the shortest wait where you can still see the blink.'],
        ell: 'Frames: "First ___, then ___." "It blinks ___ times in ___ seconds."',
        supports: ['readAloud', 'chunk', 'extraTime'],
      },
      safety: { level: 'sim-only', note: SIM },
      standards: { csta: ['1B-AP-08', '1B-AP-10'], ccss: [M('4.MD.A.1'), M('4.NBT.B.6'), M('4.OA.C.5')], intl: INTL },
      mathFocus: 'unit conversion (ms to s) and division',
      museion: 'cs',
    },
    {
      id: 'stem-35-u05-l2',
      title: 'Events: When the Button Is Pressed',
      minutes: 45,
      strands: ['technology', 'engineering'],
      objectives: [
        'I can use an event block so the program reacts to a button.',
        'I can use if/else to choose between two actions.',
        'I can use a variable to count button presses.',
      ],
      vocab: [
        ['event', 'Something that happens, like a button press, that the program waits for.'],
        ['condition', 'A question with a yes/no answer that decides what the program does.'],
        ['variable', 'A named box in the program that remembers a number.'],
      ],
      hook: 'Your light show plays the same way forever. Boring! What if pressing a button changed the colour, or sped it up? Programs that react are everywhere: lifts, crossings, game controllers.',
      build: {
        title: 'Add a button to the simulated light show',
        steps: [
          'Open the Pico starter. Find the button on pin 14.',
          'Add an event: "when button pressed, add 1 to presses".',
          'Add an if/else: if presses is even, light the red LED; else light the green LED.',
          'Press the button in the simulator 6 times and record which LED lights each time.',
          'Change the rule so every 3rd press lights all four LEDs.',
        ],
        launch: { room: 'elec', prompt: PICO, lesson: 'stem-35-u05-l2' },
      },
      worked: [
        {
          prompt: 'Every 3rd press lights all four LEDs. Which of the first 10 presses do that?',
          steps: ['Count by 3s: 3, 6, 9.', '12 is past 10, so stop.'],
          answer: 'Presses 3, 6 and 9: three times.',
        },
      ],
      practice: [
        num('Every 4th press plays a fanfare. How many fanfares in 20 presses?', '20 ÷ 4 = 5 fanfares.', 5, 'quotient', [20, 4], 2, 'fanfares'),
        num('The counter is at 7. The button is pressed 5 more times. What does it show?', '12.', 12, 'sum', [7, 5], 1),
        say('Is 14 even or odd? Which LED lights with the even/odd rule?', 'Even: the red LED.', 1),
        say('What is the difference between a loop and an event?', 'A loop repeats steps on its own; an event runs code only when something happens.', 2),
        say('Why does the program need a variable to do "every 3rd press"?', 'It must remember how many presses have happened so far.', 3),
      ],
      exitTicket: { q: 'Write the rule: "If the button is pressed, ___, otherwise ___."', answer: 'Any sensible if/else pair of LED actions.' },
      differentiation: {
        support: ['Give a press-by-press table to fill in.', 'Start with if only, then add else.'],
        extension: ['Use two buttons: one speeds up, one slows down.', 'Add a reset when presses reaches 10.'],
        ell: 'Frames: "When ___, the program ___." "If ___, then ___, else ___."',
        supports: ['readAloud', 'chunk', 'fewerChoices'],
      },
      safety: { level: 'sim-only', note: SIM },
      standards: { csta: ['1B-AP-10', '1B-AP-11'], ccss: [M('3.OA.D.9'), M('4.OA.B.4')], intl: INTL },
      mathFocus: 'even, odd and multiples',
      museion: 'cs',
    },
    {
      id: 'stem-35-u05-l3',
      title: 'Number Patterns in Loops: Count by 2s, 5s and 10s',
      minutes: 45,
      strands: ['math', 'technology'],
      objectives: [
        'I can make a loop that counts up by a step size.',
        'I can predict the numbers a counting loop will make.',
        'I can find and explain a rule in a number pattern.',
      ],
      vocab: [
        ['step', 'How much a counter changes each time through the loop.'],
        ['pattern rule', 'The rule that makes each number in a pattern from the one before.'],
        ['term', 'One number in a pattern.'],
      ],
      hook: 'A loop starts at 0 and adds 5 each time, lighting one more LED every time the count passes a multiple of 10. What numbers will it show? Before you run it, can you predict the 6th number?',
      build: {
        title: 'Counting loops on the light board',
        steps: [
          'Open the Pico starter. Make a variable count = 0.',
          'Repeat 8 times: add 2 to count and show count on the screen.',
          'Write down the numbers. What is the rule?',
          'Change the step to 5, then 10. Predict before you run.',
          'Light LED 1 when count is a multiple of 10, LED 2 when it is a multiple of 20.',
        ],
        launch: { room: 'elec', prompt: PICO, lesson: 'stem-35-u05-l3' },
      },
      worked: [
        {
          prompt: 'A loop starts at 3 and adds 4 each time. What is the 5th number shown?',
          steps: ['After 1 pass: 7. After 2: 11. After 3: 15. After 4: 19. After 5: 23.', 'Or: 3 + 5 × 4 = 3 + 20 = 23.'],
          answer: '23.',
        },
      ],
      practice: [
        num('Start at 0, add 5 each pass. What does it show after 7 passes?', '7 × 5 = 35.', 35, 'product', [7, 5], 1),
        num('Start at 10, add 10 each pass. What after 6 passes?', '10 + 6 × 10 = 70.', 70, 'sum', [10, 60], 2),
        num('Start at 1, add 3 each pass. What after 9 passes?', '1 + 9 × 3 = 28.', 28, 'sum', [1, 27], 2),
        say('Start at 0 and add 2. Will the count ever be odd? Why?', 'No: adding 2 to an even number always gives an even number.', 3),
        say('Pattern 4, 8, 12, 16. What is the rule and the next term?', 'Add 4; next is 20.', 1),
      ],
      exitTicket: { q: 'A loop shows 6, 11, 16, 21. What is the rule and the next number?', answer: 'Add 5; 26.' },
      differentiation: {
        support: ['Use a hundred chart to colour the counts.', 'Start every pattern at 0.'],
        extension: ['Make a loop that doubles: 1, 2, 4, 8… and say how it is different.', 'Find the pass number when start 3, add 7 first goes over 100.'],
        ell: 'Frames: "The rule is add ___." "The next number is ___."',
        supports: ['readAloud', 'chunk', 'untimed'],
      },
      safety: { level: 'sim-only', note: SIM },
      standards: { csta: ['1B-AP-10'], ccss: [M('4.OA.C.5'), M('3.OA.D.9')], intl: INTL },
      mathFocus: 'generating and explaining number patterns',
      museion: 'mathematics',
    },
    {
      id: 'stem-35-u05-l4',
      title: 'Debug It, Then the Reaction-Time Showcase',
      minutes: 50,
      strands: ['technology', 'engineering', 'math'],
      objectives: [
        'I can find a bug by testing one part at a time.',
        'I can explain what the bug was and how I fixed it.',
        'I can build a reaction-time game and compare results with a range.',
      ],
      vocab: [
        ['bug', 'A mistake in a program.'],
        ['debug', 'Find, fix and explain a mistake.'],
        ['reaction time', 'How long it takes you to respond after a signal.'],
      ],
      hook: 'Your teacher\'s light show was meant to go red, yellow, green, blue. It goes red, red, green, blue. Somewhere one line is wrong. How do engineers find one wrong line in a hundred?',
      build: {
        title: 'Fix the buggy show, then build the reaction game',
        steps: [
          'Open the buggy light-show program. Run it and write what you expected and what happened.',
          'Add a short pause after each step and watch which step goes wrong.',
          'Fix the line, run again, and write a one-sentence bug report.',
          'Build the game: after a random wait, light the LED; when the button is pressed, show the time in ms.',
          'Play five rounds and record your times.',
        ],
        launch: { room: 'elec', prompt: `${PICO} Includes a reaction-time game: random wait, LED on, measure milliseconds until the button is pressed.`, lesson: 'stem-35-u05-l4' },
      },
      worked: [
        {
          prompt: 'Five reaction times: 320, 290, 410, 305 and 275 ms. What is the range, and the fastest time?',
          steps: ['Fastest (smallest) = 275 ms. Slowest (largest) = 410 ms.', 'Range = 410 − 275 = 135 ms.'],
          answer: 'Fastest 275 ms; range 135 ms.',
        },
      ],
      practice: [
        num('Times 340, 300, 360, 310 ms. What is the range?', '360 − 300 = 60 ms.', 60, 'range', [340, 300, 360, 310], 2, 'ms'),
        num('Your best time was 280 ms and your partner\'s was 315 ms. How much faster were you?', '35 ms faster.', 35, 'difference', [315, 280], 1, 'ms'),
        num('A reaction time of 250 ms is what fraction of a second, as a decimal?', '250 ÷ 1000 = 0.25 s.', 0.25, 'quotient', [250, 1000], 3, 's'),
        say('The show skipped yellow. Name a smart first step to find the bug.', 'Run it slowly or step by step and see which line runs when yellow should light.', 2),
        say('Why write down what you expected before you debug?', 'So you can compare expected with actual and spot exactly where they differ.', 3),
      ],
      exitTicket: { q: 'Write a bug report: "Expected ___. Got ___. The bug was ___. I fixed it by ___."', answer: 'All four parts filled in about a real bug.' },
      differentiation: {
        support: ['Give programs with the bug inside a highlighted section of five lines.', 'Record times in a table with columns ready.'],
        extension: ['Make the game reject a press before the LED lights ("too soon!").', 'Compare left-hand and right-hand reaction ranges.'],
        ell: 'Frames: "I expected ___ but ___ happened." "My fastest time was ___ ms."',
        supports: ['readAloud', 'chunk', 'calm'],
      },
      safety: { level: 'sim-only', note: `${SIM} ${G35_AA_PACK}` },
      standards: { csta: ['1B-AP-12', '1B-AP-15'], ccss: [M('4.MD.A.2'), M('3.MD.B.3')], intl: INTL },
      mathFocus: 'range and comparing measurements',
      museion: 'cs',
    },
  ],
};

export const G35_U05_PROJECTS: StemProject[] = [
  {
    id: 'stem-35-proj-light-show',
    band: '3-5',
    unitId: 'stem-35-u05',
    title: 'Light-Show Showcase',
    subject: 'math',
    drivingQuestion: 'Can we program a light show with loops and a button that an audience can play with, and predict exactly how many blinks it makes?',
    brief: 'Program a four-LED light show on the simulated Pico. It must use at least one loop, one button event and one number pattern. Before you run it for the audience, predict how many blinks it makes in one cycle and how long a cycle lasts, then check. Add the reaction-time game as an encore.',
    deliverables: ['The light-show program', 'A written prediction of blinks per cycle and cycle length, with the math', 'A bug report for one bug you fixed', 'A short demo for the class'],
    steps: [
      'Plan the show on a storyboard: which LEDs light in what order, and what the button does.',
      'Program it with a loop, an event and a number pattern.',
      'Predict blinks per cycle and cycle length in seconds; show the multiplication.',
      'Run it, count, and compare with your prediction.',
      'Fix at least one bug and write the bug report.',
      'Demo the show and the reaction-time game to the class.',
    ],
    launch: { room: 'elec', prompt: PICO, lesson: 'stem-35-proj-light-show' },
    rubric: {
      criteria: [
        crit('Programming', 'Show runs once with no loop', 'Uses a loop or an event', 'Uses a loop, an event and a number pattern', 'Uses all three plus a variable that changes the show'),
        crit('Prediction math', 'No prediction', 'Prediction with errors', 'Correct blink count and cycle length', 'Correct, and explains how changing one delay changes the total'),
        crit('Debugging', 'No bug report', 'Bug named only', 'Expected, got, cause and fix', 'Bug report plus a test that would catch the bug again'),
        crit('Showcase', 'Show not presented', 'Presented without explanation', 'Presented and explained loop and event', 'Audience could play it and give feedback that was used'),
      ],
    },
    standards: { csta: ['1B-AP-10', '1B-AP-11', '1B-AP-15'], ccss: [M('4.OA.C.5'), M('4.NBT.B.6')], intl: INTL },
    minutes: 150,
    differentiation: {
      support: 'Start from a working two-LED show and add one button event; provide a prediction frame.',
      extension: 'Add a second button and a speed variable, and predict the cycle length at three speeds.',
    },
    safety: { level: 'sim-only', note: SIM },
  },
];
