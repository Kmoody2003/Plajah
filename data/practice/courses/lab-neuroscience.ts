import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

/** Compact question builder: mcq with 4 choices. */
const q = (
  lessonId: string,
  n: number,
  level: 1 | 2 | 3,
  prompt: string,
  choices: string[],
  answer: number,
  hint: string,
  explanation: string,
): Question => {
  // Rotate the authored choices so correct answers are spread across positions 0-3.
  const k = (lessonId.length * 3 + n * 5 + lessonId.charCodeAt(lessonId.length - 1)) % 4;
  const rotated = choices.map((_, i) => choices[(i - k + 4) % 4]);
  return { id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices: rotated, answer: (answer + k) % 4, hint, explanation, level };
};

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-neuroscience',
    label: 'Neuroscience',
    blurb: 'From ion to idea: how neurons signal, how synapses learn, and how circuits build perception, memory and mind.',
    accent: '#DA77F2',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-neuroscience.t1',
        title: 'The Cell and Its Voltage',
        blurb: 'What a neuron is, and how it keeps and spends its electrical charge.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-neuroscience.l01',
            title: 'The Neuron Doctrine',
            blurb: 'The brain is made of separate cells, not a continuous web.',
            minutes: 6,
            body:
              'In the late 1800s scientists argued about what the brain is made of. Camillo Golgi, who invented a silver stain that darkens a few whole neurons against a clear background, believed the nervous system was one continuous net. Santiago Ramon y Cajal used Golgi\'s own stain and drew detailed pictures showing that neurons are separate cells that touch but do not fuse. This is the neuron doctrine, and Cajal turned out to be right. Electron microscopes in the 1950s finally resolved the tiny gap between neurons and settled the argument.\n\nA typical neuron has dendrites that receive signals, a cell body (soma) that integrates them, and an axon that sends the signal onward. Cajal\'s law of dynamic polarisation says information flows in one direction: dendrite, then soma, then axon. Charles Sherrington later named the junction between two neurons the synapse.\n\nThink of a relay race. Each runner (neuron) is a separate person who hands the baton across a gap to the next runner, rather than all runners being one long body. Golgi and Cajal shared the 1906 Nobel Prize even though they never agreed on this question.',
          },
          {
            id: 'lab-neuroscience.l02',
            title: 'The Resting Potential',
            blurb: 'A neuron at rest is a charged battery, about -70 mV inside.',
            minutes: 7,
            body:
              'Even when it is doing nothing, a neuron is electrically charged. The inside of the cell sits at roughly -70 millivolts relative to the outside. This resting membrane potential comes from two things: uneven ion concentrations and a membrane that lets some ions through more easily than others.\n\nPotassium is concentrated inside the cell and sodium outside, and the sodium-potassium pump (the Na+/K+-ATPase, found by Jens Skou) spends energy to maintain those gradients. At rest the membrane is far more permeable to potassium than to sodium, so potassium leaks out and leaves the inside negative.\n\nEach ion has an equilibrium or Nernst potential, the voltage at which the electrical push exactly balances the diffusion push for that ion. The Nernst equation is E = (RT / zF) ln([X]out / [X]in). When several ions can cross, the Goldman-Hodgkin-Katz equation blends their Nernst potentials, weighting each by its permeability. The resting potential therefore sits close to the potassium potential, because potassium dominates the permeability.\n\nIn everyday terms, a resting neuron is like a charged phone battery: stored energy waiting to be used. Every action potential discharges a little of it.',
          },
          {
            id: 'lab-neuroscience.l03',
            title: 'The Action Potential',
            blurb: 'The all-or-nothing spike that carries a signal down an axon.',
            minutes: 8,
            body:
              'An action potential is a brief, self-regenerating wave of voltage. When input depolarises the membrane past a threshold, voltage-gated sodium channels snap open. Sodium rushes in and the inside of the cell swings sharply positive. A fraction of a millisecond later the sodium channels inactivate and potassium channels open, so potassium flows out and the membrane repolarises.\n\nThe spike is all-or-nothing: below threshold nothing happens, and above threshold the spike has the same size no matter how strong the stimulus. Because each patch of membrane regenerates the spike for the next patch, the signal travels the whole length of an axon without fading.\n\nAlan Hodgkin and Andrew Huxley worked this out in the 1950s using the giant axon of the squid and a technique called the voltage clamp, which holds voltage steady so the ionic currents can be measured. Their model adds up a capacitive current plus potassium, sodium and leak currents. Each ionic current follows Ohm\'s law: I = g x (Vm - E), conductance times the driving force.\n\nA useful comparison is a row of dominoes: a small push does nothing, a big enough push topples the first domino, and each falling domino fully topples the next, so the wave arrives undiminished.',
          },
        ],
      },
      {
        id: 'lab-neuroscience.t2',
        title: 'Communication Between Cells',
        blurb: 'How signals cross synapses and spread along cell membranes.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-neuroscience.l04',
            title: 'The Synapse',
            blurb: 'Where one neuron hands a chemical signal to the next.',
            minutes: 7,
            body:
              'At a chemical synapse, the electrical signal is briefly converted into a chemical one. When an action potential reaches the axon terminal, voltage-gated calcium channels open. The incoming calcium makes synaptic vesicles fuse with the membrane and dump neurotransmitter into the narrow synaptic cleft, a gap of roughly 20 nanometres. The transmitter binds to receptors on the next cell and changes its voltage.\n\nBernard Katz showed that release is quantal: neurotransmitter comes in discrete packets, one vesicle at a time. Otto Loewi gave the first proof that transmission is chemical in 1921, when fluid washed from a stimulated frog heart nerve slowed a second heart. Sherrington named the synapse decades before electron microscopy (Palade and Palay, 1954) let anyone see it.\n\nThe key point is that the signal is delayed and one-way at the synapse: the sending side releases, the receiving side listens. That makes synapses places where signals can be amplified, weakened or blocked, which is why they matter so much for learning and for drugs.\n\nImagine passing a note across a gap by throwing a ball with a message tied on: the ball (neurotransmitter) leaves one side and is caught by receptors on the other.',
          },
          {
            id: 'lab-neuroscience.l05',
            title: 'Neurotransmitters',
            blurb: 'The chemical vocabulary of the brain.',
            minutes: 7,
            body:
              'Neurotransmitters are the molecules that carry signals across synapses. Glutamate is the brain\'s main excitatory signal, which makes the next neuron more likely to fire, and GABA is the main inhibitory signal, which makes it less likely. Other transmitters, including dopamine, serotonin, noradrenaline and acetylcholine, act as modulators that tune whole circuits for reward, mood, arousal and attention.\n\nA surprising fact is that a transmitter is not excitatory or inhibitory by itself. What matters is the receptor it binds, so the same molecule can have different effects in different places. Most psychiatric drugs work by nudging these systems, for example by changing how long a transmitter stays in the cleft.\n\nThe history is concrete. Otto Loewi identified acetylcholine, which he called Vagusstoff, in 1921 as the first known neurotransmitter. Ulf von Euler discovered noradrenaline in 1946, and Arvid Carlsson showed in 1957 that dopamine is a signalling molecule in its own right rather than just a precursor.\n\nAn everyday analogy is a radio: the same broadcast (transmitter) can be a song or static depending on the radio (receptor) that receives it.',
          },
          {
            id: 'lab-neuroscience.l06',
            title: 'Passive Spread: Time and Length Constants',
            blurb: 'How voltage fades along and across a membrane.',
            minutes: 8,
            body:
              'Not every signal in a neuron is an all-or-nothing spike. Small voltage changes in dendrites spread passively, like heat along a metal rod, and they fade with time and distance. Cable theory, developed by Wilfrid Rall, describes this.\n\nTwo numbers summarise it. The membrane time constant is tau = Rm x Cm, the product of membrane resistance and capacitance. It is the time for the voltage to rise (or decay) to about 63 percent of its final value, and it controls how much inputs arriving at slightly different times can add together. The length constant is lambda = sqrt(rm / ri), the square root of membrane resistance over axial resistance per unit length. It is the distance over which a passive signal falls to about 37 percent of its starting size.\n\nExample: with Rm = 20,000 ohm cm2 and Cm = 1 microfarad per cm2, tau = 20,000 x 0.000001 s = 0.02 s, or 20 milliseconds. A leakier membrane (smaller Rm) has a shorter tau and a shorter lambda, so signals fade faster and shorter.\n\nThis is why neurons need action potentials for long distances: passive spread alone would fade to nothing, but a regenerated spike restores the full signal at every step.',
          },
        ],
      },
      {
        id: 'lab-neuroscience.t3',
        title: 'Learning, Memory and Maps',
        blurb: 'How experience reshapes circuits and where functions live.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-neuroscience.l07',
            title: 'Hebb and Long-Term Potentiation',
            blurb: 'Cells that fire together wire together.',
            minutes: 8,
            body:
              'In 1949 Donald Hebb proposed that a synapse strengthens when the cell before it and the cell after it are active at the same time. Summed up as cells that fire together wire together, it can be written as a rule: change in weight = eta x (activity i) x (activity j), where eta is the learning rate. For example, with eta = 0.1 and activities 2 and 3, the weight rises by 0.1 x 2 x 3 = 0.6.\n\nThe cellular version is long-term potentiation (LTP), discovered by Bliss and Lomo in 1973 in the rabbit hippocampus. Strong, repeated stimulation of a synapse makes its response larger for hours, days or longer. The key molecule is the NMDA receptor, which opens only when the sending cell has released glutamate and the receiving cell is already depolarised. That makes it a coincidence detector, exactly what Hebb\'s rule needs.\n\nThe link to behaviour is direct: in the Morris water-maze experiment, blocking NMDA receptors with the drug APV impaired spatial memory.\n\nThink of a path through grass. Walk it often (correlated activity) and it becomes a clear, easy trail (a stronger synapse); a path nobody uses grows over.',
          },
          {
            id: 'lab-neuroscience.l08',
            title: 'Neuroplasticity',
            blurb: 'The brain rewires itself throughout life.',
            minutes: 7,
            body:
              'The adult brain is not fixed wiring. Synapses strengthen and weaken with use, new dendritic spines grow, and whole cortical maps can reorganise after injury or intense practice. This lifelong ability to change is called neuroplasticity, and it is the cellular basis of learning and of recovery from conditions such as stroke.\n\nPlasticity is strongest in early critical periods. David Hubel and Torsten Wiesel closed one eye of a young kitten and found that the visual cortex permanently rewired so that the open eye took over; the same closure in an adult cat had far less effect. Plasticity never closes completely, though. Michael Merzenich showed that sensory maps in the cortex reorganise when input changes, and Eleanor Maguire found in 2000 that licensed London taxi drivers had an enlarged posterior hippocampus, reflecting years of navigating the city.\n\nSo experience literally reshapes brain structure. Learning a language, juggling or a musical instrument all leave physical traces.\n\nAn everyday picture is a muscle: use a particular one heavily and it grows, neglect one and it weakens. Brain circuits behave in a similar use-it-or-lose-it way, though through changes in connections rather than bulk.',
          },
          {
            id: 'lab-neuroscience.l09',
            title: 'Memory Systems and Patient H.M.',
            blurb: 'The hippocampus and the different kinds of memory.',
            minutes: 7,
            body:
              'Memory is not one thing. The clearest evidence came from a patient known as H.M., who had parts of his medial temporal lobes, including the hippocampus, removed to treat epilepsy. Afterwards he could no longer form new lasting memories of facts and events, though he remembered his earlier life and could still learn new motor skills. Brenda Milner studied him and used this to distinguish declarative memory (facts and events you can state) from procedural memory (skills such as mirror drawing), which depend on different brain systems.\n\nThe hippocampus is central to turning new experiences into lasting memories. At the cellular level, long-term potentiation gives it a way to store them, and Eric Kandel\'s work on the sea slug Aplysia showed how short-term and long-term memory change synaptic strength, with long-term memory involving new molecular changes in the synapse.\n\nA practical example: someone with this kind of damage might practise a puzzle daily and get faster at it, yet each day insist they have never seen the puzzle before. The skill is stored; the memory of the practice sessions is not.\n\nThis is the value of case studies in neuroscience: a lesion that removes one ability while sparing others reveals how the brain divides up its work.',
          },
          {
            id: 'lab-neuroscience.l10',
            title: 'Functional Localisation',
            blurb: 'Different regions handle different jobs.',
            minutes: 7,
            body:
              'Functional localisation is the idea that different parts of the cortex specialise in different tasks. In 1861 Paul Broca studied a patient who could understand speech but could barely produce it, and found damage in the left inferior frontal gyrus. This region is now called Broca\'s area and was the first strong evidence for localisation. In 1874 Carl Wernicke described a different pattern: patients who spoke fluently but could not understand language, with damage in the temporal lobe. Wernicke\'s area supports comprehension, so production and comprehension can fail separately.\n\nLater, neurosurgeon Wilder Penfield stimulated the exposed cortex of awake patients with small electrical currents and mapped body representations in the sensory and motor cortex. His map is the cortical homunculus, a distorted little person in which hands and lips take up far more cortex than the trunk. Roger Sperry\'s split-brain studies added that the two hemispheres specialise too.\n\nLocalisation does not mean one spot does everything. Complex tasks use networks, but the maps tell us which regions are necessary for which functions.\n\nAn analogy is a city: a hospital district and a harbour district have different jobs, yet everyday life needs roads connecting all of them.',
          },
        ],
      },
      {
        id: 'lab-neuroscience.t4',
        title: 'Codes, Models and Modern Methods',
        blurb: 'How spikes carry information and how we study the working brain.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-neuroscience.l11',
            title: 'Neural Coding and Spike Statistics',
            blurb: 'How patterns of spikes represent information.',
            minutes: 8,
            body:
              'Because every action potential is the same size, information must be carried by the pattern of spikes: how many occur in a window (rate coding) and exactly when they occur (temporal coding). Hubel and Wiesel found that visual cortex neurons fire most for edges at a preferred orientation, so a cell\'s firing rate signals how well the stimulus matches its preference.\n\nSpike counts from many cortical neurons are noisy, and a good first model is the Poisson distribution: P(n) = (lambda t)^n e^(-lambda t) / n!, where lambda is the mean firing rate and t is the time window. The expected number of spikes is simply lambda x t. A neuron firing at 20 Hz observed for 0.5 s is expected to give 20 x 0.5 = 10 spikes, although any single trial will vary.\n\nSimple models help too. In the leaky integrate-and-fire neuron the membrane integrates its input, leaks back toward rest, and fires a spike when it crosses threshold. A sigmoid function, f(x) = 1 / (1 + e^-x), is often used to turn net input into a smooth firing rate, and is a building block of artificial neural networks.\n\nPsychophysics adds that perception is not linear: the Weber-Fechner law says perceived intensity grows with the logarithm of stimulus strength.',
          },
          {
            id: 'lab-neuroscience.l12',
            title: 'Imaging, Connectomes and Computation',
            blurb: 'Watching the living brain and mapping its wiring.',
            minutes: 7,
            body:
              'Since about 1990, tools have made the working brain visible. Functional MRI measures blood-flow changes that follow neural activity, and the first fMRI studies of human cognition appeared in 1991 and 1992. PET and MEG add other views, and optogenetics (2005) lets researchers switch specific neurons on or off with light, which tests cause and effect rather than just correlation.\n\nConnectomics tries to map every neuron and connection. The connectome of the roundworm C. elegans has 302 neurons, while the human brain has around 86 billion. Large datasets such as the Allen Brain Atlas, OpenNeuro and the Human Connectome Project are open, and simulators such as NEURON and Brian2 let students model neurons themselves.\n\nEach method has trade-offs. fMRI sees the whole brain but follows blood flow, which is slower and less direct than spikes. Recording single neurons is precise but sees only a few cells at a time.\n\nA good rule of thumb for any study is to ask what is actually being measured. A bright patch on a scan means blood flow rose there during the task, which is evidence about brain activity but not proof that the region alone performs the task.\n\nThis closes a long path: from the ancient heart-versus-brain debate to computational models that aim at the origins of the mind.',
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-neuroscience',
    questions: [
      // l01
      q('lab-neuroscience.l01', 1, 1, 'What does the neuron doctrine state?', ['The nervous system is one continuous net of fused fibres', 'The nervous system is made of discrete individual cells', 'Neurons are made only of glial cells', 'Signals travel from axon to dendrite'], 1, 'Think about what Cajal argued against Golgi.', 'The neuron doctrine holds that neurons are separate cells that communicate across gaps, not a continuous network.'),
      q('lab-neuroscience.l01', 2, 1, 'Which scientist coined the term "synapse"?', ['Santiago Ramon y Cajal', 'Hermann von Helmholtz', 'Charles Sherrington', 'Alan Hodgkin and Andrew Huxley'], 2, 'He was a British neurophysiologist who described the reflex arc.', 'Charles Sherrington named the junction between neurons the synapse in 1897.'),
      q('lab-neuroscience.l01', 3, 2, 'A neuron\'s signal is described by the law of dynamic polarisation. Which path does the information follow?', ['Axon, then soma, then dendrite', 'Soma, then dendrite, then axon', 'Dendrite, then soma, then axon', 'Dendrite, then axon, then soma'], 2, 'Receive, integrate, send.', 'Cajal proposed that signals enter at dendrites, are integrated in the soma, and leave via the axon.'),
      q('lab-neuroscience.l01', 4, 3, 'Why was Golgi\'s silver stain so important for settling the debate, even though Golgi himself held the opposing view?', ['It stained a few whole neurons completely, letting Cajal see each cell as separate', 'It made all tissue transparent so a continuous net could be seen', 'It measured electrical activity in single cells', 'It showed the synapse directly with an electron beam'], 0, 'Consider why staining only a few cells is useful.', 'Because it blackened only a small fraction of cells entirely, individual neurons and their boundaries could be seen, and Cajal used it to show they were separate.'),
      // l02
      q('lab-neuroscience.l02', 1, 1, 'Roughly what is the resting membrane potential of a typical neuron?', ['+70 mV (positive inside)', '0 mV (no charge at all)', '-70 mV', '-700 mV (extremely negative)'], 2, 'The inside is negative relative to the outside.', 'A neuron at rest sits at about -70 mV inside relative to outside.'),
      q('lab-neuroscience.l02', 2, 1, 'Which ion is the membrane most permeable to at rest?', ['Sodium', 'Potassium', 'Calcium', 'Hydrogen ions'], 1, 'The resting potential sits close to this ion\'s equilibrium potential.', 'At rest the membrane is far more permeable to potassium than to sodium, so the resting potential is close to the potassium Nernst potential.'),
      q('lab-neuroscience.l02', 3, 2, 'If a membrane\'s permeability to sodium were suddenly increased greatly, in which direction would the membrane potential move?', ['Toward the sodium equilibrium potential, which is positive', 'Toward the potassium equilibrium potential, which is more negative', 'It would not change', 'It would go to exactly zero'], 0, 'The GHK equation weights each ion by its permeability.', 'The potential moves toward the Nernst potential of whichever ion has the greatest permeability; sodium\'s equilibrium potential is positive.'),
      q('lab-neuroscience.l02', 4, 3, 'What would happen to the resting potential over time if the sodium-potassium pump stopped working?', ['It would become more negative forever', 'The ion gradients would slowly run down and the resting potential would decay', 'Nothing, because the pump only controls temperature', 'The cell would fire a single permanent spike'], 1, 'The pump keeps the concentration gradients in place.', 'The pump maintains the sodium and potassium gradients that set the resting voltage; without it the gradients dissipate and the stored electrochemical energy is lost.'),
      // l03
      q('lab-neuroscience.l03', 1, 1, 'Which channels open first when the membrane depolarises past threshold?', ['Voltage-gated sodium channels', 'Voltage-gated potassium channels', 'Calcium-activated chloride channels', 'Ligand-gated NMDA glutamate receptors'], 0, 'Sodium floods in during the rising phase.', 'Voltage-gated sodium channels open first, letting sodium rush in and drive the inside positive.'),
      q('lab-neuroscience.l03', 2, 1, 'What does "all-or-nothing" mean for an action potential?', ['It only occurs in a few neurons', 'Its size does not depend on the strength of a suprathreshold stimulus', 'It is larger for stronger stimuli', 'It never travels along axons'], 1, 'Think about whether a harder push makes a bigger spike.', 'Below threshold nothing fires; above it the spike has the same size regardless of stimulus strength.'),
      q('lab-neuroscience.l03', 3, 2, 'A potassium channel has conductance g = 2 nS and the membrane is at -70 mV while the potassium reversal potential is -90 mV. Using I = g x (Vm - E), what is the current?', ['40 pA', '-40 pA', '140 pA', '4.5 pA'], 0, 'Find the driving force first: Vm minus E.', 'Driving force = -70 - (-90) = 20 mV. I = 2 nS x 20 mV = 40 pA (nS times mV gives pA).'),
      q('lab-neuroscience.l03', 4, 3, 'Why can an action potential travel a long axon without fading, whereas a passive voltage change does not?', ['Axons have no resistance', 'The spike is actively regenerated by voltage-gated channels at each patch of membrane', 'Axons contain a battery in the cell body that continuously pushes the signal along the whole fibre', 'The signal is amplified at the synapse only'], 1, 'Regeneration happens all along the membrane.', 'Each membrane patch opens its own voltage-gated channels and regenerates the spike, restoring its full size as it propagates.'),
      // l04
      q('lab-neuroscience.l04', 1, 1, 'What triggers synaptic vesicles to release neurotransmitter at the axon terminal?', ['Entry of calcium through voltage-gated channels', 'Exit of potassium', 'Closing of sodium channels', 'Arrival of a new neuron'], 0, 'An ion enters when the spike arrives at the terminal.', 'Calcium entering through voltage-gated calcium channels makes vesicles fuse and release their contents into the cleft.'),
      q('lab-neuroscience.l04', 2, 1, 'Which experiment gave early proof of chemical transmission?', ['Katz\'s patch clamp recordings of ion channels', 'Loewi\'s frog-heart experiment', 'Hubel and Wiesel\'s kitten study', 'Broca\'s patient with a damaged left frontal lobe'], 1, 'It involved fluid being transferred from one heart to another.', 'Loewi showed that fluid from a stimulated vagus nerve slowed a second heart, proving a chemical messenger.'),
      q('lab-neuroscience.l04', 3, 2, 'Katz showed that neurotransmitter is released in "quantal" packets. What does this mean for a single vesicle?', ['Each vesicle releases a variable amount that scales smoothly with stimulus strength', 'Release happens in whole-vesicle units, not in arbitrary amounts', 'Vesicles only release when the cell is silent', 'Neurotransmitter diffuses out of the whole cell at once'], 1, 'Quantal means in discrete units.', 'Release occurs in discrete packets, with one vesicle\'s contents as the basic unit.'),
      q('lab-neuroscience.l04', 4, 3, 'Why is the synapse a useful place for the nervous system to regulate and change signals?', ['It is the only place in the whole neuron where electrical current is able to flow, so every signal must pass it', 'The chemical step can be strengthened, weakened or blocked, unlike a continuous fibre', 'It is much faster than any other part of the neuron', 'It contains the cell nucleus'], 1, 'Think about what a chemical step allows that a wire does not.', 'Because transmission is a controllable chemical step, the strength of a synapse can be adjusted, which underlies learning and the action of many drugs.'),
      // l05
      q('lab-neuroscience.l05', 1, 1, 'Which neurotransmitter is the brain\'s main inhibitory signal?', ['Glutamate', 'GABA', 'Acetylcholine', 'Noradrenaline'], 1, 'Its initials are three letters.', 'GABA is the main inhibitory transmitter; glutamate is the main excitatory one.'),
      q('lab-neuroscience.l05', 2, 1, 'Which was the first neurotransmitter identified, by Otto Loewi in 1921?', ['Dopamine', 'Noradrenaline', 'Acetylcholine', 'GABA'], 2, 'Loewi called it Vagusstoff.', 'Loewi identified acetylcholine as the substance that slowed the frog heart.'),
      q('lab-neuroscience.l05', 3, 2, 'The same neurotransmitter excites one cell type and inhibits another. What is the most likely explanation?', ['The two cells have different receptors for it', 'The transmitter changes its chemical formula', 'One cell has no membrane', 'The transmitter is only active at night'], 0, 'Effect depends on what the transmitter binds to.', 'Whether a transmitter excites or inhibits depends on its receptor, not the molecule itself.'),
      q('lab-neuroscience.l05', 4, 3, 'A drug blocks the re-uptake of a transmitter so that it stays longer in the cleft. What is the most likely effect on signalling through that transmitter?', ['It is strengthened or prolonged', 'It stops completely once the transmitter lingers', 'It switches from excitatory to inhibitory', 'It has no effect on receptors or on the cell receiving it'], 0, 'More time in the cleft means more receptor activation.', 'Longer presence of transmitter in the cleft increases and prolongs receptor activation, which is how many psychiatric drugs work.'),
      // l06
      q('lab-neuroscience.l06', 1, 1, 'What is the formula for the membrane time constant?', ['tau = Rm x Cm', 'tau = Rm / Cm', 'tau = Rm + Cm', 'tau = sqrt(Rm x Cm)'], 0, 'It is a simple product of resistance and capacitance.', 'The time constant is the product of membrane resistance and capacitance.'),
      q('lab-neuroscience.l06', 2, 1, 'Over one length constant, a passive signal falls to about what fraction of its original size?', ['63 percent', '50 percent', '37 percent', '10 percent'], 2, 'It is the reciprocal of e, roughly.', 'A passive potential decays to about 37 percent of its amplitude over one length constant.'),
      q('lab-neuroscience.l06', 3, 2, 'A membrane has Rm = 20,000 ohm cm2 and Cm = 1 microfarad per cm2. What is its time constant?', ['2 ms', '20 ms', '200 ms', '2 s'], 1, 'Convert microfarads to farads: multiply by 0.000001.', 'tau = 20,000 x 0.000001 = 0.02 s, which is 20 ms.'),
      q('lab-neuroscience.l06', 4, 3, 'A dendrite\'s membrane becomes much leakier, lowering membrane resistance. How does this change passive signal spread?', ['Signals travel farther', 'Signals fade over a shorter distance', 'Signals become all-or-nothing spikes that no longer decay with distance', 'There is no change'], 1, 'Lambda = sqrt(rm / ri).', 'Lower membrane resistance reduces the length constant, so more current leaks out and passive signals fade over a shorter distance.'),
      // l07
      q('lab-neuroscience.l07', 1, 1, 'Which receptor acts as the coincidence detector for LTP?', ['NMDA receptor', 'GABA-A receptor channel', 'Dopamine transporter', 'Acetylcholinesterase'], 0, 'It opens only with glutamate plus depolarisation.', 'The NMDA receptor opens only when presynaptic release and postsynaptic depolarisation coincide.'),
      q('lab-neuroscience.l07', 2, 1, 'Who discovered LTP in the rabbit hippocampus in 1973?', ['Hubel and Wiesel', 'Bliss and Lomo', 'Hodgkin and Huxley', 'Cajal and Golgi'], 1, 'Two researchers whose names start with B and L.', 'Tim Bliss and Terje Lomo showed that high-frequency stimulation lastingly strengthened synapses.'),
      q('lab-neuroscience.l07', 3, 2, 'Using the Hebbian rule change in weight = eta x xi x xj, with eta = 0.1, xi = 2 and xj = 3, what is the change in weight?', ['0.5', '0.6', '5', '6'], 1, 'Multiply all three numbers.', '0.1 x 2 x 3 = 0.6.'),
      q('lab-neuroscience.l07', 4, 3, 'Why does blocking NMDA receptors in the Morris water maze experiment support a link between LTP and learning?', ['It makes animals swim faster', 'It blocks LTP and also impairs spatial learning', 'It increases the number of synapses', 'It removes the hippocampus'], 1, 'Think about what changed in behaviour.', 'Blocking NMDA receptors prevents LTP and also impairs spatial memory, tying the cellular mechanism to behaviour.'),
      // l08
      q('lab-neuroscience.l08', 1, 1, 'What is neuroplasticity?', ['The brain\'s ability to change its connections with experience', 'The hardening of brain tissue with age', 'A type of neurotransmitter', 'The growth of new skull bone'], 0, 'Plastic means changeable.', 'Neuroplasticity is the lifelong ability of the brain to strengthen, weaken, prune and form connections with experience.'),
      q('lab-neuroscience.l08', 2, 1, 'Which group showed enlarged posterior hippocampi after years of navigation work?', ['Professional pianists', 'London taxi drivers', 'Chess players', 'Long-distance swimmers'], 1, 'They had to learn thousands of street routes.', 'Maguire found in 2000 that licensed London cab drivers had an enlarged posterior hippocampus.'),
      q('lab-neuroscience.l08', 3, 2, 'In Hubel and Wiesel\'s experiments, closing one eye of a kitten during early life led to what?', ['Permanent rewiring of visual cortex toward the open eye', 'No change at all', 'Loss of hearing', 'Faster than normal development of the closed eye and its cortical inputs'], 0, 'Think about the critical period.', 'Monocular deprivation in the critical period permanently rewired visual cortex in favour of the open eye.'),
      q('lab-neuroscience.l08', 4, 3, 'Why does a critical period matter for how we think about learning and recovery?', ['Plasticity is highest early but never fully closes, so both timing and later practice matter', 'It proves that adults cannot learn anything new once childhood has ended and the window has shut', 'It shows that only children have neurons', 'It means plasticity stops at age 10'], 0, 'Remember what Merzenich and Maguire showed in adults.', 'Plasticity is strongest early, yet adult cortical remapping and hippocampal changes show it persists, so training can help throughout life.'),
      // l09
      q('lab-neuroscience.l09', 1, 1, 'Which brain structure was crucial to patient H.M.\'s inability to form new memories?', ['Hippocampus and medial temporal lobe', 'Visual cortex', 'Cerebellum only', 'Motor cortex'], 0, 'It is shaped like a seahorse.', 'H.M. lost medial temporal lobe structures including the hippocampus and could no longer form new lasting declarative memories.'),
      q('lab-neuroscience.l09', 2, 1, 'Who studied H.M. and distinguished declarative from procedural memory?', ['Brenda Milner', 'Rita Levi-Montalcini', 'Torsten Wiesel', 'Eleanor Maguire'], 0, 'A founder of neuropsychology working in Montreal.', 'Brenda Milner\'s studies of H.M. revealed separate memory systems.'),
      q('lab-neuroscience.l09', 3, 2, 'A patient with hippocampal damage gets steadily faster at a mirror-drawing task over several days but says each day that they have never done it before. What does this show?', ['Skill memory can form without memory of the practice episodes', 'Skill learning requires conscious recall', 'The patient is simply guessing the answers each time without any learning', 'Both memory types depend on exactly the same system'], 0, 'Procedural and declarative memory are separate.', 'Procedural learning can be preserved when declarative memory is lost, which shows they rely on different systems.'),
      q('lab-neuroscience.l09', 4, 3, 'Why are lesion case studies like H.M. so informative about brain organisation?', ['Removing a region that disrupts one ability but spares others shows how functions are divided', 'They prove every function is in one place', 'They show that the brain cannot be studied scientifically because every case is unique and unrepeatable', 'They measure single-neuron spikes'], 0, 'Compare what was lost with what remained.', 'Selective loss with sparing of other abilities reveals which structures are needed for which functions.'),
      // l10
      q('lab-neuroscience.l10', 1, 1, 'Broca\'s area is associated with what function?', ['Speech production', 'Visual processing of faces and objects', 'Hearing', 'Balance'], 0, 'Broca\'s patient could understand but not speak fluently.', 'Broca localised speech production to the left inferior frontal gyrus.'),
      q('lab-neuroscience.l10', 2, 1, 'What did Wilder Penfield create by stimulating the cortex of awake patients?', ['The cortical homunculus map', 'The Golgi stain', 'The voltage clamp', 'The NMDA receptor'], 0, 'It is a distorted map of the body on the cortex.', 'Penfield mapped sensory and motor cortex and produced the homunculus.'),
      q('lab-neuroscience.l10', 3, 2, 'A patient speaks fluently but produces meaningless sentences and cannot understand what others say. Damage to which area is most consistent?', ['Wernicke\'s area', 'Broca\'s area', 'Primary motor cortex', 'The cerebellum'], 0, 'Comprehension, not production, is the main problem.', 'Wernicke\'s area in the temporal lobe supports language comprehension; damage gives fluent but poorly understood speech.'),
      q('lab-neuroscience.l10', 4, 3, 'In the homunculus, hands and lips occupy a large share of the map. What is the best interpretation?', ['Cortical space reflects the density and importance of sensory or motor control, not body size', 'Hands and lips are the largest parts of the body, so the map simply scales with physical size and mass', 'The map is drawn at random', 'These areas have no neurons'], 0, 'Think about how finely we sense and move our fingers and lips.', 'Cortical area is allocated by sensory and motor demand, so finely controlled parts get disproportionate space.'),
      // l11
      q('lab-neuroscience.l11', 1, 1, 'What does rate coding mean?', ['Information is carried by how many spikes occur in a time window', 'Information is carried only by spike size', 'Information is carried by the colour of neurons', 'Neurons never change their firing'], 0, 'Think counts per second.', 'In rate coding, the number of spikes per time window represents the stimulus.'),
      q('lab-neuroscience.l11', 2, 1, 'Which distribution is a common first model for cortical spike counts?', ['Poisson', 'Uniform distribution', 'Cauchy distribution', 'Bimodal distribution'], 0, 'Named after a French mathematician.', 'Many cortical neurons fire with near-Poisson variability, so spike counts follow a Poisson distribution.'),
      q('lab-neuroscience.l11', 3, 2, 'A neuron fires at a mean rate of 20 Hz. How many spikes do you expect on average in a 0.5 s window?', ['4', '10', '20', '40'], 1, 'Expected count = rate x time.', 'Expected spikes = 20 x 0.5 = 10.'),
      q('lab-neuroscience.l11', 4, 3, 'Why is a single-trial spike count not a perfect measure of a stimulus?', ['Spike counts vary from trial to trial even for the same stimulus', 'Neurons only fire once', 'Spikes differ greatly in size from one trial to the next for the same cell', 'The stimulus changes the species'], 0, 'Think about the Poisson variability.', 'Cortical spike counts are noisy, so the same stimulus produces different counts; averaging or pooling many neurons or trials is needed.'),
      // l12
      q('lab-neuroscience.l12', 1, 1, 'What does fMRI measure?', ['Blood-flow changes linked to neural activity', 'Individual ion channel currents flowing across single membrane patches', 'The sequence of DNA', 'Neurotransmitter concentration in the cleft'], 0, 'It follows blood, not spikes.', 'fMRI tracks blood-flow signals that follow neural activity.'),
      q('lab-neuroscience.l12', 2, 1, 'How many neurons are in the C. elegans connectome?', ['302', '3,020', '86 billion', '1 million'], 0, 'It is a small number, a worm\'s whole nervous system.', 'The roundworm C. elegans has a 302-neuron connectome; the human brain has roughly 86 billion.'),
      q('lab-neuroscience.l12', 3, 2, 'Optogenetics lets researchers switch defined neurons on or off with light. What kind of conclusion does it allow beyond fMRI?', ['Tests of cause and effect for specific neurons', 'Only correlations between regions', 'Measurement of blood oxygen', 'Mapping the skull'], 0, 'Controlling a cell is different from watching it.', 'Because researchers actively control specific neurons, they can test whether activity in those cells causes a behaviour.'),
      q('lab-neuroscience.l12', 4, 3, 'A scan shows a bright patch in a region during a task. What is the most careful conclusion?', ['Blood flow rose there during the task, which suggests involvement but does not prove it alone performs the task', 'That region alone produces the behaviour, because the bright patch directly shows exactly which neurons are firing', 'The region is damaged', 'Neurons there are not active'], 0, 'Consider what fMRI directly measures.', 'fMRI reports blood-flow changes, indirect evidence of activity; it does not by itself show that one region is solely responsible.'),
    ],
  },
};
