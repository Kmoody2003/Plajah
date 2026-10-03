import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Rotate the choices (keeping their cyclic order) so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = (target - answer + 4) % 4;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'thinking-methods.l01';
const L02 = 'thinking-methods.l02';
const L03 = 'thinking-methods.l03';
const L04 = 'thinking-methods.l04';
const L05 = 'thinking-methods.l05';
const L06 = 'thinking-methods.l06';
const L07 = 'thinking-methods.l07';
const L08 = 'thinking-methods.l08';
const L09 = 'thinking-methods.l09';
const L10 = 'thinking-methods.l10';
const L11 = 'thinking-methods.l11';
const L12 = 'thinking-methods.l12';
const L13 = 'thinking-methods.l13';
const L14 = 'thinking-methods.l14';
const L15 = 'thinking-methods.l15';
const L16 = 'thinking-methods.l16';
const L17 = 'thinking-methods.l17';
const L18 = 'thinking-methods.l18';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'thinking-methods',
    label: 'Thinking Like a Scientist and Engineer',
    blurb: 'Ask testable questions, handle data honestly, design and iterate, and reason well: the habits of mind behind science and engineering.',
    accent: '#06D6A0',
    framework: 'ngss',
    tracks: [
      {
        id: 'thinking-methods.t1',
        title: 'Asking and Testing',
        blurb: 'Turn curiosity into questions and experiments that can actually give an answer.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Makes a Question Testable',
            blurb: 'A testable question can be answered by measurement or observation.',
            minutes: 5,
            body: `Science does not answer every question. It answers questions that can be settled by observation or measurement. A testable question names something you can change or compare and something you can measure.

Compare two questions. "Is this music beautiful?" depends on taste, and no measurement settles it. "Do plants grow taller with classical music playing than in silence?" can be tested: you can play music to one group, leave another in silence, and measure height with a ruler.

A good testable question usually has three features. It is specific, so that anyone could repeat it. It uses quantities you can measure, such as centimetres, seconds or counts. And it has an answer that could, in principle, come out either way.

Turning a vague curiosity into a testable question is a skill. "Which paper towel is best?" becomes "How many millilitres of water does one sheet of each brand absorb before it drips?" Now you know what to do, what to measure and how to compare the results.

Questions about values, such as what we ought to do, are important, but they need different tools than experiments.`,
          },
          {
            id: L02,
            title: 'Observation, Inference and Hypothesis',
            blurb: 'Separate what you see from what you conclude, then turn the conclusion into a claim you can test.',
            minutes: 6,
            body: `An observation is what you directly detect with your senses or instruments: "The lawn near the fence is brown." An inference is an explanation or conclusion you draw from observations: "The brown patch is caused by lack of water." Inferences may be reasonable, but they can be wrong, and mixing them up with observations is a common source of error.

Suppose you see a bicycle lying on its side with a bent wheel. You observe the bent wheel and the position. You infer that it crashed, but it might have been run over by a car, or dropped from a balcony. Good scientists record observations first and label inferences clearly.

A hypothesis is a proposed explanation that makes a prediction you can check. "The brown patch is caused by lack of water" predicts that watering the patch will turn it green again. A prediction is what you expect to see if the hypothesis is right; the hypothesis is the proposed explanation behind it.

Keeping observations and inferences apart protects you from seeing only what you expect. Two people can share the same observations and still offer different inferences, and the next step is to design a test that tells them apart.`,
          },
          {
            id: L03,
            title: 'Hypotheses That Can Be Wrong',
            blurb: 'A scientific claim must forbid some outcomes, so that evidence could count against it.',
            minutes: 6,
            body: `Consider the claim "Some day it will rain." No weather could ever show it false, so it tells you almost nothing. Compare "It will rain tomorrow in this town." Tomorrow will either have rain or not, so the claim sticks its neck out. A useful hypothesis rules things out.

This property is called falsifiability: there is some possible observation that would show the hypothesis false. A hypothesis that is compatible with every outcome explains nothing, because it cannot be distinguished from any other.

Take "This fertiliser makes tomato plants grow taller." If plants given fertiliser end up the same height as plants without it, the claim has failed its test. A weaker version, "Fertiliser helps in some way at some time," survives any result and is therefore not very informative.

Falsifiable does not mean false. It means testable in a way that could have gone against it. A hypothesis that survives many honest tests earns our confidence, though never absolute certainty.

Be wary of explanations that get adjusted after every failed prediction so they can never lose. If you cannot say what result would change your mind, you are probably not testing anything.`,
          },
          {
            id: L04,
            title: 'Variables and Fair Tests',
            blurb: 'Change one thing, measure its effect, and keep everything else the same.',
            minutes: 7,
            body: `A fair test isolates the effect of one factor. The independent variable is the factor you deliberately change. The dependent variable is the outcome you measure to see the effect. Controlled variables are everything else you keep the same, so they cannot explain the difference.

Suppose you want to know whether the temperature of water affects how fast sugar dissolves. The independent variable is water temperature. The dependent variable is the time to dissolve. You control the mass of sugar, the volume of water, the type of sugar and how often you stir.

If you used finer sugar in the hot cup and coarser sugar in the cold cup, you could not tell whether temperature or grain size caused the difference. That is a confounding variable, a hidden second change that tangles the result.

A control group is a comparison in which the independent variable is left unchanged or at a standard value, for instance a cup of room-temperature water. It shows what happens without your treatment.

Fair testing does not guarantee that the hypothesis is right; it makes sure the answer you get is about the thing you meant to ask about.`,
          },
          {
            id: L05,
            title: 'Sample Size and Repeating Trials',
            blurb: 'One result can be luck; repeated results reveal the pattern.',
            minutes: 6,
            body: `Measurements vary. If you drop a ball and time its fall five times, you will probably get five slightly different numbers because of reaction time, tiny draughts and the way the ball was released. A single trial could be an unlucky one.

Repeating trials lets you see how much results vary and lets averaging smooth out random errors. Suppose five timings of a rolling cart are 12, 14, 13, 15 and 11 seconds. The mean is 65 / 5 = 13 seconds, and the spread of the results tells you how far to trust it.

The same idea applies to studies of many individuals. The number of individuals studied is the sample size. A small sample may happen to include unusual cases, so it can give a misleading picture. A larger, randomly chosen sample is more likely to represent the whole group.

Repeating means doing the experiment again under the same conditions. It makes results more reliable; it does not by itself make a flawed method correct. If every trial uses a badly calibrated scale, all trials will agree and all will be off.

A sensible plan is to repeat enough times to see the variation, and to have other people try to reproduce the result.`,
          },
        ],
      },
      {
        id: 'thinking-methods.t2',
        title: 'Data and Evidence',
        blurb: 'Measure carefully, show data clearly, and draw only the conclusions the evidence supports.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L06,
            title: 'Measurement, Precision, Accuracy and Uncertainty',
            blurb: 'Every measurement has an uncertainty, and precision and accuracy are different things.',
            minutes: 7,
            body: `No measurement is exact. A ruler marked in millimetres cannot tell you a length to a hundredth of a millimetre, so we report a value with its uncertainty, for example 12.4 cm plus or minus 0.1 cm.

Accuracy describes how close a measurement is to the true value. Precision describes how close repeated measurements are to each other. Picture darts: all clustered tightly but far from the bullseye is precise but not accurate. Scattered around the bullseye on average is accurate but not precise.

Errors come in two broad kinds. Random errors vary unpredictably from one reading to the next and can be reduced by averaging. Systematic errors push every reading the same way, such as a scale that always reads 2 g too high, and averaging does not remove them.

Percent error compares a measured value with an accepted one: |measured minus accepted| / accepted x 100. If you measure g as 9.5 m/s2 and the accepted value is 10.0 m/s2 (a rounded figure for this example), the error is 0.5 / 10.0 x 100 = 5 percent.

Error bars on a graph show the uncertainty. When two error bars overlap heavily, the difference between the values may not be meaningful.`,
          },
          {
            id: L07,
            title: 'Choosing and Reading Graphs',
            blurb: 'The right graph type depends on your data, and every axis needs a label and units.',
            minutes: 7,
            body: `A graph is an argument made with shapes, so choose the shape that fits the data.

A bar chart compares separate categories, such as the number of students choosing each lunch option. A line graph shows how a measured quantity changes in order, usually over time, such as temperature through a day. A scatter plot places each observation as a point using two measured quantities, which is how you look for a relationship, such as height against arm span. A histogram groups one continuous variable into ranges of equal width and shows how often values fall in each range, for example the distribution of test scores.

Every axis needs a label and units, such as "Time (s)" or "Mass (kg)". By convention, the independent variable goes on the horizontal axis and the dependent variable on the vertical axis. The scale should start and increase evenly. A vertical axis that begins at a value other than zero can exaggerate small differences in a bar chart.

To find the slope of a straight-line graph, divide the rise by the run. If a line passes through (0, 0) and (4 s, 10 m), the slope is 10 / 4 = 2.5 m/s, which is the speed.`,
          },
          {
            id: L08,
            title: 'Mean, Median and Outliers',
            blurb: 'Different averages answer different questions, and outliers can pull some of them far off.',
            minutes: 6,
            body: `An average summarises many numbers with one. The mean is the sum divided by the count. The median is the middle value when the numbers are put in order. The mode is the most frequent value.

Take the quiz scores 3, 4, 5, 6 and 22. The sum is 40, so the mean is 40 / 5 = 8. The median is 5, the middle of the five ordered values. The 22 is an outlier, a value far from the others. It drags the mean up to 8 while the median barely notices it.

This is why the median is often preferred for skewed data, such as incomes or house prices, where a few very large values would inflate the mean. For roughly symmetric data without outliers, the mean is usually fine and uses all the information.

What should you do with an outlier? Do not delete it just because it spoils the pattern. Check whether it came from a mistake, such as a misread instrument or a typing error. If it did, you can correct or exclude it and say so. If it is a real measurement, it may be the most interesting result you have.

Always report what you did with unusual values.`,
          },
          {
            id: L09,
            title: 'Correlation Is Not Causation',
            blurb: 'Two things that move together may be linked by a third factor, or by coincidence.',
            minutes: 7,
            body: `Two quantities are correlated when they tend to change together. Ice cream sales and sunburn cases both rise in summer, so they are positively correlated. Yet ice cream does not cause sunburn. Hot sunny weather, a third factor called a confounder, drives both.

When you find a correlation between A and B, there are several possibilities. A may cause B. B may cause A. A third factor may cause both. Or the match may be a coincidence, especially when you test many pairs of quantities.

How can we tell cause from correlation? The strongest tool is a controlled experiment, in which the experimenter changes A, ideally assigning it at random, and watches B while other factors are held steady. Random assignment spreads unknown confounders evenly across groups. When experiments are impossible, researchers gather several lines of evidence, such as a plausible mechanism, a consistent effect across studies and a dose-response pattern.

A scatter plot with a clear trend line is a prompt for a question, not a conclusion. The honest wording is "A is associated with B", and the claim "A causes B" needs stronger support.`,
          },
          {
            id: L10,
            title: 'Linearising Data',
            blurb: 'Plot a transformed quantity so that a curve becomes a straight line you can read.',
            minutes: 8,
            body: `Straight lines are easy to judge by eye and easy to fit, so scientists often rearrange a relationship until it plots as a line.

A simple pendulum has period T = 2 pi x sqrt(L / g), where L is the length and g the gravitational field strength. A graph of T against L is a curve. But squaring both sides gives T^2 = (4 pi^2 / g) x L. That matches the form y = m x, so a graph of T^2 (vertical) against L (horizontal) is a straight line through the origin, with slope 4 pi^2 / g.

Now the slope carries the physics. If your best-fit line has a slope of 4.0 s^2/m, then g = 4 pi^2 / 4.0. Using pi^2 of about 9.87, that is 39.5 / 4.0, roughly 9.9 m/s^2.

The method works well because deviations from a straight line stand out immediately. A line that bends tells you the model is wrong or the data have a problem. The same trick works elsewhere: plotting y against x^2 for free fall distance, or taking logarithms for exponential growth.

Always check that the plotted line fits the points over the whole range, not just the middle.`,
          },
          {
            id: L11,
            title: 'Claim, Evidence, Reasoning',
            blurb: 'A strong scientific argument links a claim to evidence through explicit reasoning.',
            minutes: 6,
            body: `When you report a result, structure it in three parts. The claim is the answer to the question, stated plainly. The evidence is the data or observations that support it. The reasoning explains why that evidence supports the claim, using a scientific idea.

Suppose you tested whether a darker cup keeps drinks hot longer. A weak answer: "The black cup was better." A strong one follows the pattern.

Claim: the foam cup kept water warm longer than the metal cup. Evidence: after 20 minutes, water in the foam cup had cooled from 80 C to 62 C, while the metal cup water fell from 80 C to 48 C, in three repeated trials. Reasoning: foam is a poorer conductor of heat, so less thermal energy flows from the water to the surroundings.

Notice that the evidence is specific and quantitative, and the reasoning names a mechanism rather than just repeating the data. A good argument also admits limits, such as a small number of trials, and considers other explanations.

Writing in this form shows readers exactly what would have to be wrong for the conclusion to fail, which makes your work easy to check.`,
          },
        ],
      },
      {
        id: 'thinking-methods.t3',
        title: 'Engineering and Design',
        blurb: 'How engineers define problems, build and test solutions, and weigh what matters.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L12,
            title: 'The Engineering Design Process',
            blurb: 'Define the problem, set criteria and constraints, then build, test and improve.',
            minutes: 7,
            body: `Science asks why things are as they are. Engineering asks how to make something that works for a need. The usual cycle has these steps: define the problem, research, brainstorm, build a prototype, test, and improve. The loop repeats until the design is good enough.

Defining the problem comes first. It includes the criteria, which describe what success looks like, and the constraints, which are the limits you must work within. For a bridge built from craft sticks, criteria might be holding at least 5 kg and spanning 40 cm. Constraints might be using no more than 100 sticks, one bottle of glue and two hours.

Research means finding out what already works, including existing designs and the science of the materials. Brainstorming produces many candidate ideas before judging any of them, because the first idea is rarely the best.

A prototype is a first working model. Testing it against the criteria generates measurements, and the results show what to change. The steps are not a one-way staircase; teams jump back, for example returning to the problem definition when testing reveals a requirement they missed.

Engineers who skip the definition stage often build a clever answer to the wrong question.`,
          },
          {
            id: L13,
            title: 'Trade-offs, Iteration and Learning from Failure',
            blurb: 'Every design balances competing goals, and a failed test is useful information.',
            minutes: 7,
            body: `No design is best at everything. Making a bicycle frame stronger usually makes it heavier or more expensive. These tensions are trade-offs, and engineering is largely the art of choosing among them deliberately.

A decision matrix helps. List the criteria, weight each by importance, score each option, and compare totals. Suppose cost has weight 3 and strength has weight 2. Option A scores 4 for cost and 3 for strength: 3 x 4 + 2 x 3 = 18. Option B scores 2 and 5: 3 x 2 + 2 x 5 = 16. Option A wins under these weights. Change the weights, and the answer may change, which is why the weights deserve discussion.

Iteration means making repeated cycles of build, test and revise. Early iterations are cheap and rough. A paper model that fails costs minutes; a failure found after manufacturing costs far more.

Failure is data. A prototype that breaks at a joint shows you exactly where the weakness is. Engineers often test to failure on purpose to learn the real limits instead of guessing.

The aim is not to avoid failing but to fail early, safely and informatively, and then use what you learned.`,
          },
          {
            id: L14,
            title: 'Models and Simulation',
            blurb: 'Models are simplified stand-ins that let us predict before we build.',
            minutes: 7,
            body: `A model is a simplified representation of something real, used to explain or predict. It may be a scale model, a graph, an equation or a computer program. All models leave things out on purpose; the question is whether what they leave out matters for your purpose.

An equation can be a model. If a spring stretches 2 cm for each newton, then extension = 2 x force is a model for small loads. At a force of 5 N it predicts 10 cm. That prediction is useful until the spring is stretched so far that it stops behaving in a straight line.

A simulation runs a model forward, often in many small steps on a computer. Engineers simulate airflow around a car, loads on a bridge or traffic at a junction. Simulations let you test conditions that are too expensive, slow or dangerous to try for real.

Models need checking. Validation compares the model with real measurements. If predictions and measurements disagree, either the model is missing something or the measurements are flawed.

A common saying captures the attitude: all models are approximations, and some are useful. Trust a model within the range where it has been tested, and be cautious beyond it.`,
          },
          {
            id: L15,
            title: 'Safety, Ethics and Designing for People',
            blurb: 'Good engineering protects people, respects their needs and tests with real users.',
            minutes: 7,
            body: `Engineers work for the public as well as for clients, so safety is a design requirement, not an extra. One basic tool is the factor of safety: failure load divided by the expected working load. A cable that fails at 6000 N and is expected to carry 1500 N has a factor of safety of 6000 / 1500 = 4. The margin covers uncertainty in materials, wear and unexpected use.

Ethics asks who benefits, who bears the risks and who is left out. A design can be legal and still cause harm, such as a product that is easy to misuse or a data system that exposes private information. Professional codes of ethics tell engineers to put public safety first and to be honest about risks and limits.

Design thinking adds empathy. Instead of assuming what people want, you observe and talk with the people who will use the product, define their needs, and test prototypes with them. A kettle handle that suits a strong adult hand may be unusable for someone with arthritis. Designing with a wide range of users in mind often improves the product for everyone.

Responsible design involves asking questions before building: what could go wrong, and for whom?`,
          },
        ],
      },
      {
        id: 'thinking-methods.t4',
        title: 'Systems of Thought',
        blurb: 'Ways of reasoning, the history behind them, and the habits that keep us honest.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L16,
            title: 'There Is No Single Scientific Method',
            blurb: 'Real science mixes observation, experiment and theory, and the ideas behind it have a history.',
            minutes: 8,
            body: `School often presents the scientific method as a fixed list of steps. Real science is more varied. Some fields run controlled experiments. Astronomers cannot control stars, so they gather observations and compare models. Field biologists survey ecosystems, and geologists reconstruct events that happened long ago. Many discoveries begin with an accident or a surprising observation, and then are tested carefully.

Even so, common threads run through all of it: claims are checked against evidence, methods are shared so others can test them, and conclusions stay open to revision.

Some milestones in how these ideas developed. Ibn al-Haytham, working in the early eleventh century, wrote a Book of Optics that stressed testing ideas about light with experiments. Francis Bacon, in his Novum Organum of 1620, argued for building knowledge by careful, systematic observation, an approach called induction. In the twentieth century Karl Popper argued that what marks a claim as scientific is that it can be falsified by evidence. Thomas Kuhn, in 1962, described how scientific fields can shift between broad frameworks he called paradigms.

These thinkers disagreed in places, and philosophers still debate them. The practical lesson is to treat method as a toolkit, not a recipe.`,
          },
          {
            id: L17,
            title: 'Reasoning: Deductive, Inductive, Abductive and Socratic',
            blurb: 'Different kinds of inference carry different strengths of certainty.',
            minutes: 8,
            body: `Deductive reasoning moves from general statements to a specific conclusion. If all metals conduct electricity and copper is a metal, then copper conducts electricity. If the premises are true and the logic is valid, the conclusion must be true.

Inductive reasoning moves from specific observations to a general pattern. Every swan you have seen is white, so you suppose all swans are white. The conclusion is probable, not guaranteed; a single black swan would overturn it.

Abductive reasoning looks for the best explanation of a surprising observation. You come home and find the grass wet; the best explanation might be that it rained. Charles Sanders Peirce developed this idea. The conclusion is a plausible hypothesis that needs testing, since a sprinkler could also explain it.

Scientists use all three: abduction to propose an explanation, deduction to work out what should follow, and induction to test and generalise from the results.

Socratic questioning is a method of probing a claim through a series of questions, such as "What do you mean by that?", "What evidence supports it?" and "What would follow if it were true?" It helps expose hidden assumptions, and it works well in discussion with others or as an inner dialogue.`,
          },
          {
            id: L18,
            title: 'Fallacies, Systems and Computational Thinking',
            blurb: 'Spot flawed arguments, then break problems down and see how the parts interact.',
            minutes: 9,
            body: `A fallacy is a flaw in reasoning that makes an argument weaker than it looks. A straw man misrepresents an opponent's view to make it easy to attack: "You want a later bedtime? So you want kids to never sleep." An ad hominem attacks the person rather than the argument. A false dilemma offers only two options when more exist: "Either we buy this bike or we never cycle." Post hoc reasoning assumes that because B followed A, A caused B.

Computational thinking offers tools for solving problems. Decomposition splits a big problem into smaller parts. Pattern recognition spots similarities. Abstraction ignores unneeded detail. An algorithm is a clear step-by-step procedure. Guessing a number from 1 to 100 by always halving the range needs at most 7 guesses, because 2^7 is 128, which is at least 100.

Systems thinking looks at how parts interact. A thermostat uses negative feedback: if the room is too warm, it switches heating off, pushing the temperature back toward the setting. Emergence is when a system shows properties that no single part has, such as traffic jams from many cars.

First-principles thinking breaks a problem down to basic facts you are confident about and reasons upward from there, instead of copying what is usually done.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'thinking-methods',
    questions: [
      // L01 Testable questions
      mc(L01, 1, 1, 'Which of these is the most testable question?',
        ['Is this song beautiful?', 'Does a plant given 10 mL of water a day grow taller than one given 5 mL a day?', 'Why do some things in the world happen the way that they do?', 'Is studying science a more worthwhile pursuit for a person than studying art or music?'], 1,
        'Look for something you could measure with a tool.',
        'It names something to change (water amount) and something to measure (height), so an experiment can answer it.'),
      tf(L01, 2, 1, 'A question about what people ought to do can be settled just by measuring something in a lab.', 1,
        'Ought-questions involve values.',
        'Measurements can inform value questions but cannot settle them alone; they need different kinds of reasoning.'),
      mc(L01, 3, 2, 'A student asks, "Which sports drink is best?" Which rewrite makes it testable?',
        ['Which sports drink do most people say they like the best when asked at a school sports event?', 'Which sports drink tastes better in my opinion?', 'Which sports drink has the highest sugar content per 100 mL, measured by the same method?', 'Which sports drink is the healthiest choice for every athlete in every sport?'], 2,
        'Pick the one with a measurable quantity and a clear method.',
        'It specifies a measurable quantity and a consistent method, so the comparison can be repeated by anyone.'),
      mc(L01, 4, 3, 'Why is "Does cold weather make people feel unhappy?" harder to test than "Do people report lower scores on a mood survey on days below 0 C?"',
        ['Because science cannot study people', 'Because the second defines how mood is measured and what is compared, while the first leaves both vague', 'Because the second asks about a smaller number of people', 'Because the first question is about weather and weather cannot be measured'], 1,
        'Think about which wording tells you what to record.',
        'The second wording defines how happiness is measured (a survey score) and what is compared (cold vs other days); the first leaves both undefined.'),

      // L02 Observation, inference, hypothesis
      mc(L02, 1, 1, 'Which statement is an observation rather than an inference?',
        ['The window was broken by a ball that a child kicked across the playground.', 'The window has a hole about 5 cm wide with cracks spreading from it.', 'Someone must have been careless when they were playing near the building.', 'The ball was thrown too hard by someone standing on the far side of the field.'], 1,
        'An observation is what you can directly see or measure.',
        'The size of the hole and cracks can be directly seen; the other statements explain how or why it happened.'),
      mc(L02, 2, 1, 'What is a hypothesis?',
        ['A measurement taken with an instrument and written in a lab notebook', 'A proposed explanation that makes a testable prediction', 'A fact that has already been proven', 'A list of the materials and tools needed for an experiment'], 1,
        'It is a proposal, not a result.',
        'A hypothesis proposes an explanation and leads to predictions that tests can check.'),
      mc(L02, 3, 2, 'You see a bare patch of soil near a tree and fresh paw prints in it. Which is the best inference to test next?',
        ['An animal dug there, and a camera placed nearby will show it', 'The soil has always been bare because nothing will grow in that spot', 'Paw prints prove that the tree is dying and that animals are avoiding it', 'Nothing can be said about the patch until a scientist has studied it for years'], 0,
        'Choose the one that gives you a way to check.',
        'It is a reasonable explanation of what was seen and it suggests a test (a camera), unlike the other options.'),
      mc(L02, 4, 3, 'Two students observe the same dim light bulb. One infers a weak battery, the other a faulty bulb. What is the best next step?',
        ['Decide by holding a class vote on which explanation sounds best', 'Swap in a new battery and see whether the brightness changes', 'Assume the first explanation, since it was offered first', 'Stop, because the observation is uncertain'], 1,
        'Design a test that distinguishes the two explanations.',
        'Changing only the battery gives a result that favours one inference over the other.'),

      // L03 Falsifiability
      mc(L03, 1, 1, 'What does it mean for a hypothesis to be falsifiable?',
        ['It has been shown to be false by an earlier experiment', 'Some possible observation could show it to be wrong', 'It has been proved true by every single experiment ever done', 'It cannot be tested by any possible observation or measurement'], 1,
        'Think about whether evidence could count against it.',
        'A falsifiable hypothesis makes predictions that could fail, so evidence could count against it.'),
      mc(L03, 2, 1, 'Which claim is falsifiable?',
        ['Everything happens for a reason we cannot detect.', 'This metal expands when heated from 20 C to 100 C.', 'Luck sometimes helps people succeed in unexpected ways.', 'Things might be different somewhere.'], 1,
        'Which one forbids some measurable outcome?',
        'The metal claim predicts a measurable change, and failing to see expansion would count against it.'),
      mc(L03, 3, 2, 'A hypothesis says "Plants given fertiliser X grow taller than unfertilised plants." Which result would count against it?',
        ['Fertilised plants average 30 cm and unfertilised ones 22 cm', 'Fertilised plants average 22 cm and unfertilised ones 22 cm', 'Fertilised plants average 35 cm and unfertilised ones 20 cm', 'Fertilised plants look greener'], 1,
        'Look for the result that does not show the predicted difference.',
        'No difference in height is what the hypothesis forbids, so that result would count against it.'),
      mc(L03, 4, 3, 'A theory is changed after each failed prediction so that it can never be wrong. What is the main problem?',
        ['It becomes too simple', 'It no longer forbids any outcome, so evidence cannot test it', 'It will be accepted without testing by everyone', 'It uses too many measurements and takes far too long to check'], 1,
        'Think about what a claim must rule out.',
        'If every result can be accommodated, the claim rules out nothing and so says nothing testable.'),

      // L04 Variables and fair tests
      mc(L04, 1, 1, 'In a test of how water temperature affects how fast sugar dissolves, what is the dependent variable?',
        ['The temperature of the water in the cup', 'The time taken to dissolve', 'The mass of sugar added to each cup', 'The size of the cup that holds the water'], 1,
        'It is the thing you measure as the outcome.',
        'The dissolving time is the measured outcome; temperature is the independent variable.'),
      tf(L04, 2, 1, 'In a fair test, you change several variables at once so the results are richer.', 1,
        'Think about which change caused the result.',
        'Changing several things at once makes it impossible to tell which one caused the effect.'),
      mc(L04, 3, 2, 'A student tests whether fertiliser affects bean height. Which is a controlled variable?',
        ['Whether or not fertiliser is added to the soil', 'The final height of each plant at the end', 'The amount of light each plant gets', 'The colour of the flowers on each plant'], 2,
        'A controlled variable is deliberately kept the same.',
        'Light must be kept equal for all plants so it cannot explain a height difference.'),
      mc(L04, 4, 3, 'Hot-water sugar used fine grains and cold-water sugar used coarse grains. What is the main flaw?',
        ['Grain size is a confounding variable that also changes dissolving time', 'There was no dependent variable', 'The temperatures were too different', 'Sugar cannot dissolve in cold water'], 0,
        'Ask what else differed between the two cups.',
        'Grain size changed along with temperature, so the effect of temperature cannot be separated.'),

      // L05 Sample size and repeats
      mc(L05, 1, 1, 'Why do scientists repeat trials?',
        ['To make the results look more impressive', 'To see how much results vary and reduce the effect of chance', 'To prove the hypothesis true', 'Because the first trial is always wrong'], 1,
        'Think about random variation between measurements.',
        'Repeating shows the spread of results and lets averaging reduce random error.'),
      mc(L05, 2, 1, 'What does sample size mean in a study?',
        ['The physical size of each specimen measured in the study', 'The number of individuals or observations included', 'How big the lab space is where the whole study takes place', 'The total amount of time that the whole study took to finish'], 1,
        'It is about how many were studied.',
        'Sample size is the count of individuals or observations in the study.'),
      mc(L05, 3, 2, 'Five timings of a cart are 12, 14, 13, 15 and 11 seconds. What is the mean?',
        ['12 s', '13 s', '13.5 s', '65 s'], 1,
        'Add all the values and divide by how many there are.',
        'The sum is 65 and 65 / 5 = 13 s.'),
      mc(L05, 4, 3, 'Five trials with a badly calibrated scale all read 2 g too high. What does repeating achieve?',
        ['It removes the error because the results agree', 'It shows the results are precise but does not remove the systematic error', 'It makes the results random', 'It makes the scale correct'], 1,
        'Consider whether agreement among trials proves they are right.',
        'Repeat measurements agree with each other (precision) but the systematic offset remains, so the answers are all off in the same way.'),

      // L06 Measurement
      mc(L06, 1, 1, 'What is the difference between accuracy and precision?',
        ['They mean the same thing', 'Accuracy is closeness to the true value; precision is closeness of repeated measurements to each other', 'Accuracy is about repeated measurements; precision is about the true value', 'Accuracy applies to instruments only'], 1,
        'One compares to the truth, the other compares trials to each other.',
        'Accuracy compares a measurement to the true value; precision describes how tightly repeated measurements cluster.'),
      mc(L06, 2, 1, 'What kind of error is a scale that always reads 2 g too high?',
        ['Random error', 'Systematic error', 'Human error only', 'No error'], 1,
        'It pushes every reading the same way.',
        'A consistent offset in every reading is a systematic error, which averaging does not remove.'),
      mc(L06, 3, 2, 'You measure g as 9.5 m/s2 and the accepted value is 10.0 m/s2. What is the percent error?',
        ['0.5 percent', '5 percent', '9.5 percent', '50 percent'], 1,
        'Divide the difference by the accepted value, then multiply by 100.',
        'The difference is 0.5 and 0.5 / 10.0 x 100 = 5 percent.'),
      mc(L06, 4, 3, 'Two groups report 12.4 cm plus or minus 0.3 cm and 12.6 cm plus or minus 0.3 cm for a length. What can you conclude?',
        ['The groups definitely disagree about the true length of the object', 'The ranges overlap, so the difference may not be meaningful', 'The first group made an error and should repeat the measurement', 'The second group is more accurate'], 1,
        'Compare the ranges, not just the central values.',
        'The ranges 12.1 to 12.7 cm and 12.3 to 12.9 cm overlap, so the difference between the values could be due to uncertainty.'),

      // L07 Graphs
      mc(L07, 1, 1, 'Which graph is best for comparing the number of students who chose each of five lunch options?',
        ['Bar chart', 'Line graph over time', 'Scatter plot of two continuous variables', 'Pie chart of temperatures'], 0,
        'The options are separate categories.',
        'A bar chart compares counts across separate categories.'),
      mc(L07, 2, 1, 'By convention, which variable goes on the horizontal axis?',
        ['The dependent variable', 'The independent variable', 'Whichever has larger numbers', 'The controlled variable'], 1,
        'It is the one you chose to change.',
        'The independent variable normally goes on the x-axis and the dependent variable on the y-axis.'),
      mc(L07, 3, 2, 'A straight line passes through (0 s, 0 m) and (4 s, 10 m). What is its slope?',
        ['0.4 m/s', '2.5 m/s', '4 m/s', '40 m/s'], 1,
        'Slope is rise divided by run.',
        'The slope is 10 m / 4 s = 2.5 m/s.'),
      mc(L07, 4, 3, 'A bar chart of two values (50 and 52) has a vertical axis starting at 49. What is the problem?',
        ['Bar charts need a horizontal axis', 'The truncated axis makes a small difference look large', 'The values are too close together to be graphed in any useful way', 'Nothing, since axes can start anywhere without effect'], 1,
        'Think about how bar heights are compared by eye.',
        'Starting the axis at 49 makes one bar look many times taller than the other even though they differ by about 4 percent.'),

      // L08 Mean median outliers
      mc(L08, 1, 1, 'What is the median of a set of numbers?',
        ['The sum divided by the count', 'The middle value when the numbers are ordered', 'The most frequent value', 'The difference between largest and smallest'], 1,
        'Think of lining the numbers up in order.',
        'The median is the middle value of the ordered list.'),
      mc(L08, 2, 1, 'What is an outlier?',
        ['The average of all the numbers in a data set', 'A value far away from the others', 'A measurement taken outdoors in bad weather', 'The first value written in a data table'], 1,
        'It stands apart from the rest.',
        'An outlier is a data point that lies unusually far from the other values.'),
      mc(L08, 3, 2, 'For the scores 3, 4, 5, 6 and 22, what are the mean and median?',
        ['Mean 8, median 5', 'Mean 5, median 8', 'Mean 8, median 6', 'Mean 40, median 5'], 0,
        'Add and divide for the mean; take the middle value for the median.',
        'The sum is 40, so the mean is 8, and the middle ordered value is 5.'),
      mc(L08, 4, 3, 'One reading in your data set is far from the rest. What should you do first?',
        ['Delete it so the graph looks neat', 'Check whether it came from a mistake, and report what you do with it', 'Always keep it and ignore it', 'Replace it with the mean'], 1,
        'Investigate before acting, and be open about it.',
        'An outlier may be an error or a real result, so check the cause and state how you handled it.'),

      // L09 Correlation
      mc(L09, 1, 1, 'Ice cream sales and sunburn cases rise together in summer. What best explains this?',
        ['Ice cream causes sunburn', 'Sunburn causes people to buy ice cream', 'Hot sunny weather affects both', 'It is a coincidence only'], 2,
        'Look for a third factor.',
        'Sunny hot weather is a confounder that increases both ice cream sales and sunburn.'),
      tf(L09, 2, 1, 'A strong correlation between two quantities proves that one causes the other.', 1,
        'Think about third factors and coincidence.',
        'Correlation alone does not show cause; confounders, reverse causation or chance can produce it.'),
      mc(L09, 3, 2, 'Which design gives the strongest evidence that a new study app improves test scores?',
        ['Comparing students who chose the app with those who did not', 'Randomly assigning students to use the app or not, then comparing scores', 'Asking users whether they like the app', 'Looking at scores before and after in only one class'], 1,
        'Think about spreading unknown differences evenly.',
        'Random assignment balances unknown factors across groups, so a difference is more likely due to the app.'),
      mc(L09, 4, 3, 'Children with larger shoe sizes score higher on a reading test. Which explanation is most likely?',
        ['Having bigger feet gives children better balance and so better reading', 'Age affects both shoe size and reading ability', 'Reading a lot of books makes the feet of children grow larger', 'Shoe size is measured with much more error than reading scores are'], 1,
        'Ask what changes in children as they get older.',
        'Older children have larger feet and have also had more reading practice, so age is the confounder.'),

      // L10 Linearising
      mc(L10, 1, 1, 'For a simple pendulum, which plot gives a straight line?',
        ['T against L', 'T squared against L', 'L against 1/T', 'T against sqrt of g'], 1,
        'Square the period equation.',
        'Because T^2 = (4 pi^2 / g) L, T squared against L is a straight line through the origin.'),
      mc(L10, 2, 1, 'Why do scientists often linearise data?',
        ['To remove all of the uncertainty from each measurement taken', 'Because straight lines are easy to judge by eye and fit', 'To make the data bigger', 'Because curves are never meaningful in a scientific report'], 1,
        'Consider how easy it is to spot a bend in a line.',
        'Straight lines make deviations obvious and let you read quantities from the slope.'),
      mc(L10, 3, 2, 'A graph of T squared against L has slope 4.0 s^2/m. Using g = 4 pi^2 / slope with pi^2 about 9.87, what is g?',
        ['About 2.5 m/s^2', 'About 9.9 m/s^2', 'About 16 m/s^2', 'About 39.5 m/s^2'], 1,
        'Divide 4 pi^2 by the slope.',
        '4 x 9.87 = 39.5, and 39.5 / 4.0 is about 9.9 m/s^2.'),
      mc(L10, 4, 3, 'Your T squared against L points curve away from a straight line at large lengths. What is the most sensible response?',
        ['Draw a straight line anyway', 'Consider that the model or method may fail there, for example a large swing angle, and investigate', 'Remove all the points', 'Conclude that pendulums do not have periods'], 1,
        'A bend is information about the model.',
        'Systematic departure from a line suggests the model has limits or the method has a problem, which is worth investigating.'),

      // L11 CER
      mc(L11, 1, 1, 'In claim, evidence, reasoning, what is the claim?',
        ['The data you collected', 'The answer to the question, stated plainly', 'The scientific idea that explains the data', 'The list of materials'], 1,
        'It is the conclusion itself.',
        'The claim is the answer to the question; the evidence and reasoning back it up.'),
      mc(L11, 2, 1, 'What does the reasoning part of a CER argument do?',
        ['Repeats the data', 'Explains why the evidence supports the claim using a scientific idea', 'Lists the experiment steps', 'Gives the result of a different experiment'], 1,
        'It connects the evidence to the claim.',
        'Reasoning links evidence to claim by invoking a principle or mechanism.'),
      mc(L11, 3, 2, 'Water in a foam cup cooled from 80 C to 62 C in 20 minutes; in a metal cup it cooled from 80 C to 48 C. How much more did the metal-cup water cool?',
        ['14 C', '18 C', '32 C', '50 C'], 0,
        'Find each temperature drop first.',
        'The foam cup dropped 18 C and the metal cup 32 C, so the metal water cooled 14 C more.'),
      mc(L11, 4, 3, 'Which is the strongest piece of evidence for the claim "The foam cup keeps water warm longer"?',
        ['The foam cup felt much better and more comfortable in my hand when I held it', 'Temperatures recorded each 5 minutes in three repeated trials', 'Everyone in the class agreed that it was true after a short discussion', 'The foam cup is much cheaper to buy in the shops than the metal cup is'], 1,
        'Choose specific, repeated measurements.',
        'Repeated, quantitative measurements are specific evidence that bears directly on the claim.'),

      // L12 Design process
      mc(L12, 1, 1, 'In engineering design, what are constraints?',
        ['The goals that define what success looks like for the design', 'The limits you must work within, such as cost or time', 'The first prototype', 'The test results'], 1,
        'Think of the limits, not the goals.',
        'Constraints are limits on the design; criteria describe what success looks like.'),
      mc(L12, 2, 1, 'What is a prototype?',
        ['A final product that is ready to sit on a store shelf', 'A first working model used for testing', 'A written report describing the finished design', 'A material sample sent away to a testing lab'], 1,
        'It is built to be tested and improved.',
        'A prototype is an early working model that is tested and revised.'),
      mc(L12, 3, 2, 'A craft-stick bridge must hold at least 5 kg and use no more than 100 sticks. Which is a criterion rather than a constraint?',
        ['Use no more than 100 sticks', 'Use only one bottle of glue', 'Hold at least 5 kg', 'Finish within two hours'], 2,
        'Which one describes what counts as success?',
        'Holding at least 5 kg is what success looks like; the others are limits on resources.'),
      mc(L12, 4, 3, 'Testing a prototype shows it works but nobody wants to use it because of a need the team never asked about. What step was skipped or rushed?',
        ['Prototyping', 'Defining the problem and researching users', 'Testing', 'Improving'], 1,
        'The mismatch is about the need, not the build.',
        'A design can pass tests and still fail if the problem and users were not properly understood at the start.'),

      // L13 Trade-offs
      mc(L13, 1, 1, 'What is a trade-off in design?',
        ['A sale of a finished product to a customer at a lower price', 'Improving one goal at the cost of another', 'A mistake made in a prototype that causes it to break', 'A test of strength carried out on a finished product'], 1,
        'Gains in one area usually cost something in another.',
        'A trade-off means gaining on one criterion usually costs something on another, such as strength versus weight.'),
      tf(L13, 2, 1, 'A prototype that fails a test is a wasted effort.', 1,
        'Think about what the failure reveals.',
        'A failed test shows where the design is weak, so it provides useful information for improving it.'),
      mc(L13, 3, 2, 'Cost has weight 3 and strength weight 2. Option A scores cost 4, strength 3. Option B scores cost 2, strength 5. Which has the higher weighted total?',
        ['A with 18', 'B with 16', 'A with 16', 'They tie at 17'], 0,
        'Multiply each score by its weight and add.',
        'A: 3 x 4 + 2 x 3 = 18. B: 3 x 2 + 2 x 5 = 16. A is higher.'),
      mc(L13, 4, 3, 'Why do engineers build cheap, rough early prototypes?',
        ['Because quality does not matter', 'Because early failures are cheap to find and fix compared with later ones', 'Because they are never tested', 'Because customers prefer rough designs'], 1,
        'Think about the cost of discovering problems late.',
        'Problems found early cost far less to fix than problems found after manufacturing.'),

      // L14 Models
      mc(L14, 1, 1, 'What is a model in science and engineering?',
        ['A perfect copy of reality', 'A simplified representation used to explain or predict', 'Only a physical miniature', 'A guess with no evidence'], 1,
        'It leaves out details on purpose.',
        'Models simplify reality for a purpose, and may be equations, graphs, physical scales or programs.'),
      mc(L14, 2, 1, 'What does validating a model mean?',
        ['Making it more complicated', 'Comparing its predictions with real measurements', 'Publishing it', 'Running it only once'], 1,
        'Consider checking it against the real world.',
        'Validation tests the model by comparing what it predicts with what is actually measured.'),
      mc(L14, 3, 2, 'A spring model says extension = 2 cm per newton. What extension does it predict for 5 N?',
        ['2.5 cm', '7 cm', '10 cm', '25 cm'], 2,
        'Multiply the rate by the force.',
        '2 cm per newton x 5 N = 10 cm, valid while the spring behaves linearly.'),
      mc(L14, 4, 3, 'Your spring model works up to 5 N but is then used for a 50 N load. What is the main concern?',
        ['The model is always wrong, since no model gives good predictions at any load', 'The prediction goes beyond the range where the model was tested', 'The spring will be lighter because a larger load removes some of its mass', 'Newtons cannot be used above 10 because the unit stops working at larger forces'], 1,
        'Think about where the model has actually been checked.',
        'Models are only trusted within tested ranges; real springs can stop behaving linearly or break at large loads.'),

      // L15 Safety, ethics, empathy
      mc(L15, 1, 1, 'What is a factor of safety?',
        ['The load a product is expected to carry', 'The ratio of failure load to expected working load', 'The extra cost of making a product safe for its users to handle', 'The number of tests passed'], 1,
        'It compares what breaks it with what it normally carries.',
        'Factor of safety is failure load divided by working load.'),
      mc(L15, 2, 1, 'What does empathy contribute to design thinking?',
        ['It lets designers skip testing', 'It helps designers understand the needs of the people who will use the product', 'It makes products cheaper', 'It replaces measurement'], 1,
        'It is about understanding people.',
        'Empathy means observing and listening to users so that the design meets their real needs.'),
      mc(L15, 3, 2, 'A cable fails at 6000 N and is expected to carry 1500 N. What is its factor of safety?',
        ['2', '4', '6', '9000'], 1,
        'Divide failure load by working load.',
        '6000 / 1500 = 4.'),
      mc(L15, 4, 3, 'A phone app is legal but quietly shares users\' location with third parties. Which question best captures the ethical issue?',
        ['Is it profitable enough to justify the full cost of developing and running it?', 'Who benefits, who bears the risk, and did users understand it?', 'Does it run fast enough on older phones and in areas with slow signals?', 'Is it popular enough to be among the most downloaded apps in its category?'], 1,
        'Ethics asks about people affected, not just rules.',
        'Ethical analysis considers who gains, who is exposed to risk and whether people were informed, beyond legality.'),

      // L16 No single method / history
      mc(L16, 1, 1, 'Which statement about the scientific method is most accurate?',
        ['It is one fixed list of steps used by every scientist', 'Real science uses varied methods, with shared habits of checking claims against evidence', 'It only involves lab experiments', 'It never changes conclusions'], 1,
        'Astronomers cannot run experiments on stars.',
        'Fields differ in method, but all check claims against evidence and stay open to revision.'),
      mc(L16, 2, 1, 'Which thinker argued that a claim is scientific if evidence could show it false?',
        ['Karl Popper', 'Francis Bacon', 'Ibn al-Haytham', 'Thomas Kuhn'], 0,
        'He is linked with falsifiability.',
        'Karl Popper proposed falsifiability as a mark of scientific claims.'),
      mc(L16, 3, 2, 'Which pairing is correct?',
        ['Ibn al-Haytham: Book of Optics, which stressed testing ideas about light by experiment', 'Francis Bacon: first to propose falsifiability, in a book published in 1962 about paradigms', 'Karl Popper: wrote Novum Organum in 1620, a book arguing for induction from observation', 'Thomas Kuhn: lived in the eleventh century'], 0,
        'Match each person to their approximate time and work.',
        'Ibn al-Haytham wrote the Book of Optics around the early eleventh century; Bacon wrote Novum Organum in 1620.'),
      mc(L16, 4, 3, 'Astronomers study stars they cannot manipulate. Which approach fits science best here?',
        ['Declare the topic unscientific, because only things that can be controlled count as science', 'Gather observations, make predictions from models, and test them against new observations', 'Wait for stars to be brought into the lab', 'Rely only on authority'], 1,
        'Science can test claims without controlling the object.',
        'Observational sciences test models by checking predictions against new observations, without controlling the system.'),

      // L17 Reasoning types and Socratic
      mc(L17, 1, 1, 'All metals conduct electricity, and copper is a metal, so copper conducts electricity. What kind of reasoning is this?',
        ['Deductive', 'Inductive', 'Abductive', 'Emotional'], 0,
        'It moves from a general rule to a specific case.',
        'Deduction applies a general statement to a specific case; with true premises and valid logic the conclusion must hold.'),
      mc(L17, 2, 1, 'Inferring that all swans are white from seeing only white swans is which kind of reasoning?',
        ['Deductive', 'Inductive', 'Abductive', 'Circular'], 1,
        'It generalises from specific observations.',
        'Induction generalises from specific cases; its conclusion is probable, not certain.'),
      mc(L17, 3, 2, 'You find the lawn wet and conclude it probably rained. Which reasoning is this, and what should follow?',
        ['Deduction; no further checking is needed', 'Abduction; test it, for example by checking for a sprinkler or other signs of rain', 'Induction; the lawn is always wet', 'Socratic; ask nobody anything'], 1,
        'It picks the best explanation of an observation.',
        'Abduction proposes the best explanation, which then needs testing because other explanations remain possible.'),
      mc(L17, 4, 3, 'A friend states a claim with confidence. Which Socratic question best tests it?',
        ['Why are you so sure of everything when you have never studied the subject?', 'What evidence supports that, and what would count against it?', 'Who told you that, and why did you decide to simply believe that person?', 'Do not you think that is silly, given how many people disagree with you?'], 1,
        'Look for questions that probe evidence and assumptions respectfully.',
        'It asks for evidence and for conditions under which the claim would fail, which exposes assumptions without attacking the person.'),

      // L18 Fallacies, systems, computational thinking
      mc(L18, 1, 1, 'Which is an example of a false dilemma?',
        ['Either we buy this bike or we never cycle again.', 'Many people use this bike, so it must be good.', 'You said we need bike lanes, so you must hate all drivers and cars.', 'The bike is blue, so it is fast.'], 0,
        'It offers only two options when more exist.',
        'A false dilemma presents two choices as if they were the only ones.'),
      mc(L18, 2, 1, 'What does decomposition mean in computational thinking?',
        ['Ignoring unneeded detail', 'Breaking a problem into smaller parts', 'Writing a clear step-by-step procedure for a computer', 'Spotting similarities'], 1,
        'Think of splitting something big into pieces.',
        'Decomposition splits a large problem into smaller, easier parts.'),
      mc(L18, 3, 2, 'You must find a number from 1 to 100 by guessing, and each answer tells you "higher" or "lower". By always guessing the middle, what is the most guesses you need?',
        ['5', '7', '50', '100'], 1,
        'Each guess halves the remaining range.',
        'Each guess halves the options, and 2^7 = 128 is at least 100 while 2^6 = 64 is not, so at most 7 guesses.'),
      mc(L18, 4, 3, 'A thermostat switches heating off when the room is too warm. What does this illustrate?',
        ['Positive feedback that amplifies the change and drives the temperature further away', 'Negative feedback that pushes the system back toward a set point', 'Emergence from many separate parts', 'A straw man'], 1,
        'The response opposes the change.',
        'The response counteracts the change and stabilises the temperature, which is negative feedback.'),
    ],
  },
};
