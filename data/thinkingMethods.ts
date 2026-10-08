/**
 * Guided methods for the Investigation Studio. Each is a well-known way of working, presented as
 * ONE useful route and not as the only one: real science and engineering loop back, skip ahead and
 * surprise people. Every step says what to do, why, and the mistakes people commonly make.
 */
export type FieldKind = 'text' | 'variables' | 'data' | 'cer';

export interface StepField {
  id: string; label: string; kind: FieldKind;
  placeholder?: string;
  /** For 'text': a gentle coaching rule (never blocks the student). */
  coach?: 'hypothesis' | 'question' | 'criteria';
}
export interface MethodStep { id: string; title: string; goal: string; guide: string; fields: StepField[]; mistakes: string[] }
export interface ThinkingMethod { id: string; title: string; emoji: string; blurb: string; caveat: string; steps: MethodStep[] }

export const THINKING_METHODS: ThinkingMethod[] = [
  {
    id: 'scientific-method', title: 'The scientific method', emoji: '🔬',
    blurb: 'Ask a testable question, predict, run a fair test, and let the data decide.',
    caveat: 'Scientists rarely follow these steps in a straight line. They loop back, change the question and follow surprises. Use this as a map, not a rulebook.',
    steps: [
      { id: 'question', title: 'Ask a question', goal: 'Turn something you noticed into a question you can answer by measuring.', guide: 'Good questions ask how one thing changes when another changes ("How does ... affect ...?"). Avoid questions that can only be answered with yes or no, or by opinion.',
        fields: [{ id: 'observation', label: 'What did you notice?', kind: 'text', placeholder: 'e.g. A long swing seems slower than a short one.' }, { id: 'question', label: 'Your testable question', kind: 'text', coach: 'question', placeholder: 'How does the length of a pendulum affect the time of one swing?' }],
        mistakes: ['Asking something you cannot measure', 'Asking two questions at once'] },
      { id: 'research', title: 'Find out what is known', goal: 'See what other people already know so you do not start from nothing.', guide: 'Read a lesson, open a Labs simulator, or look at a source. Write down what you learned and where it came from.',
        fields: [{ id: 'background', label: 'What do you already know, and from where?', kind: 'text', placeholder: 'Source and what it says.' }], mistakes: ['Trusting one source', 'Not writing down where facts came from'] },
      { id: 'hypothesis', title: 'Make a prediction', goal: 'State what you think will happen and why, in a way the data could prove wrong.', guide: 'A hypothesis is a testable explanation, usually "If I change X, then Y will change in this way, because ...". It must be possible for your results to show it is wrong.',
        fields: [{ id: 'hypothesis', label: 'Your hypothesis', kind: 'text', coach: 'hypothesis', placeholder: 'If I make the string longer, then the swing will take longer, because ...' }], mistakes: ['A hypothesis that cannot be wrong', 'Treating a guess as a fact before testing'] },
      { id: 'variables', title: 'Plan a fair test', goal: 'Decide what you will change, what you will measure and what you will keep the same.', guide: 'Change ONE thing (independent variable), measure its effect (dependent variable), and hold everything else constant (controlled variables). Plan to repeat trials.',
        fields: [{ id: 'vars', label: 'Variables', kind: 'variables' }, { id: 'plan', label: 'Your method, step by step', kind: 'text', placeholder: '1. Set the length ... 2. Time 10 swings ...' }], mistakes: ['Changing more than one thing', 'Only one trial', 'Forgetting units'] },
      { id: 'data', title: 'Collect data', goal: 'Record careful measurements, then look at them in a table and a graph.', guide: 'Record exactly what you measure, with units. Look for patterns, but also for points that do not fit. Choose the graph that shows the relationship you are asking about.',
        fields: [{ id: 'data', label: 'Your data and graph', kind: 'data' }], mistakes: ['Leaving out units', 'Throwing away data you did not expect', 'Joining dots on a scatter plot'] },
      { id: 'conclusion', title: 'Draw a conclusion', goal: 'Say what the data show, using the evidence, and whether your hypothesis held up.', guide: 'Use Claim, Evidence, Reasoning: state your claim, point to specific numbers, and explain how they support it. Say what you are unsure of. A hypothesis that was wrong has still taught you something.',
        fields: [{ id: 'cer', label: 'Claim, evidence, reasoning', kind: 'cer' }], mistakes: ['Saying the data prove something for certain', 'Claiming more than the data show', 'Mistaking correlation for cause'] },
      { id: 'share', title: 'Reflect and share', goal: 'Say what you would change, and what you would ask next.', guide: 'Good investigations raise new questions. Note sources of error and how to improve the test.',
        fields: [{ id: 'error', label: 'What could have gone wrong or been better?', kind: 'text' }, { id: 'next', label: 'What would you ask next?', kind: 'text' }], mistakes: ['Skipping error sources', 'Never asking the next question'] },
    ],
  },
  {
    id: 'engineering-design', title: 'The engineering design process', emoji: '⚙️',
    blurb: 'Define a problem with limits, imagine solutions, build, test and improve.',
    caveat: 'Engineers iterate. A prototype that fails is information, and most projects go around this loop several times.',
    steps: [
      { id: 'define', title: 'Define the problem', goal: 'Say who it is for and what a good solution must do.', guide: 'Describe the need, then list criteria (what success looks like) and constraints (limits on materials, cost, time, size, safety).',
        fields: [{ id: 'problem', label: 'The problem and who has it', kind: 'text', placeholder: 'Who needs this and why?' }, { id: 'criteria', label: 'Criteria and constraints', kind: 'text', coach: 'criteria', placeholder: 'Must hold 1 kg. Must cost under $5. Must fit a 20 cm box.' }], mistakes: ['Jumping to a solution', 'Criteria that cannot be measured'] },
      { id: 'research', title: 'Research', goal: 'Learn what already exists and what science applies.', guide: 'Look at existing solutions, relevant science (forces, materials, circuits) and the people who will use it.', fields: [{ id: 'research', label: 'What you found out', kind: 'text' }], mistakes: ['Ignoring what already works', 'Not talking to users'] },
      { id: 'ideas', title: 'Brainstorm', goal: 'Generate many different ideas before choosing one.', guide: 'Aim for quantity first. Then compare ideas against your criteria and choose one, saying why.', fields: [{ id: 'ideas', label: 'Your ideas, and the one you chose', kind: 'text' }], mistakes: ['Stopping at the first idea', 'Choosing without comparing to the criteria'] },
      { id: 'prototype', title: 'Build a prototype', goal: 'Make a first version to learn from.', guide: 'A prototype can be rough. Sketch it, list the parts and note how you built it.', fields: [{ id: 'prototype', label: 'Your design and how you built it', kind: 'text' }], mistakes: ['Waiting for it to be perfect'] },
      { id: 'test', title: 'Test', goal: 'Measure how well it meets each criterion.', guide: 'Test the prototype against your criteria with measurements, and record what happens, including failures.', fields: [{ id: 'results', label: 'Test results', kind: 'data' }], mistakes: ['Testing only what works', 'Not measuring'] },
      { id: 'improve', title: 'Improve', goal: 'Change the design using what the tests showed.', guide: 'Choose the biggest weakness, change one thing, and test again. Say what trade-off you accepted.', fields: [{ id: 'improve', label: 'What you changed and why', kind: 'text' }], mistakes: ['Changing everything at once'] },
      { id: 'share', title: 'Share', goal: 'Explain the problem, your solution and what you learned.', guide: 'Tell the story: the need, your design, the evidence, and what you would do next.', fields: [{ id: 'story', label: 'Your explanation', kind: 'text' }], mistakes: ['Hiding what failed'] },
    ],
  },
  {
    id: 'statistical-investigation', title: 'Statistical investigation (PPDAC)', emoji: '📊',
    blurb: 'Pose a question about data, plan how to collect it, analyse and conclude honestly.',
    caveat: 'Statistics is about reasoning under uncertainty. A pattern in a sample is evidence, not proof.',
    steps: [
      { id: 'problem', title: 'Problem', goal: 'Ask a question about a group or a relationship.', guide: 'Be clear about who or what you are asking about, and what you will measure.', fields: [{ id: 'question', label: 'Your statistical question', kind: 'text', coach: 'question', placeholder: 'Do taller players score more points per game?' }], mistakes: ['A question data cannot answer'] },
      { id: 'plan', title: 'Plan', goal: 'Decide what to measure and how to get a fair sample.', guide: 'Say what variables you need, how many cases, and how you will avoid bias in choosing them.', fields: [{ id: 'plan', label: 'Variables and sampling', kind: 'text' }], mistakes: ['A tiny or hand-picked sample'] },
      { id: 'data', title: 'Data', goal: 'Collect or load the data and check it for errors.', guide: 'Look for typing mistakes and impossible values before you trust anything.', fields: [{ id: 'data', label: 'Your data and graph', kind: 'data' }], mistakes: ['Not checking for errors'] },
      { id: 'analysis', title: 'Analysis', goal: 'Summarise and graph the data to find the pattern.', guide: 'Use the mean, median and spread, and a graph that fits the question. Note outliers and whether the pattern is strong or weak.', fields: [{ id: 'analysis', label: 'What the numbers and graph show', kind: 'text' }], mistakes: ['Using only the mean', 'Ignoring outliers'] },
      { id: 'conclusion', title: 'Conclusion', goal: 'Answer the question honestly, with the limits of the data.', guide: 'State your answer, the evidence, and what the data cannot tell you. Correlation does not show cause.', fields: [{ id: 'cer', label: 'Claim, evidence, reasoning', kind: 'cer' }], mistakes: ['Claiming cause from correlation', 'Ignoring sample limits'] },
    ],
  },
];

export const methodById = (id: string) => THINKING_METHODS.find(m => m.id === id);

/** Gentle, non-blocking coaching for a text field. Returns a tip or null when it looks fine. */
export function coachText(kind: StepField['coach'], text: string): string | null {
  const t = text.trim().toLowerCase(); if (!t) return null;
  if (kind === 'hypothesis') {
    if (!/\bif\b/.test(t) || !/\b(then|will|would)\b/.test(t)) return 'Try the form "If I change ___, then ___ will happen, because ___." That makes it testable.';
    if (!/\bbecause\b/.test(t)) return 'Add a "because" so your prediction comes with a reason.';
    if (/\b(prove|proves|definitely|always)\b/.test(t)) return 'Careful: data can support a hypothesis or contradict it, but rarely prove it for certain.';
  }
  if (kind === 'question') {
    if (/^(is|are|does|do|can|will|should)\b/.test(t) && !/\b(how|what|which|more|less|than)\b/.test(t)) return 'A yes or no question is hard to measure. Try "How does ___ change when ___ changes?"';
    if (!/\?\s*$/.test(t)) return 'End it with a question mark so it reads as a question.';
  }
  if (kind === 'criteria') {
    if (!/\d/.test(t)) return 'Add at least one number (a size, a cost, a weight, a time) so you can test whether you met it.';
  }
  return null;
}
