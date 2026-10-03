import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const m = (
  id: string, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string,
): Question => ({ id, lessonId: id.replace(/\.q\d+$/, ''), kind: 'mcq', prompt, choices, answer, hint, explanation, level });

const tf = (
  id: string, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string,
): Question => ({ id, lessonId: id.replace(/\.q\d+$/, ''), kind: 'tf', prompt, answer, hint, explanation, level });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-physics',
    label: 'Physics',
    blurb: 'The search for the simplest rules that govern everything that moves, shines, or falls - from Newton to the Standard Model.',
    accent: '#00B4D8',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-physics.t1',
        title: 'Motion and Energy',
        blurb: 'The classical mechanics that predicts projectiles, orbits and machines.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-physics.l01',
            title: "Newton's Laws of Motion",
            blurb: 'Three laws link force, mass and acceleration.',
            minutes: 8,
            body: `Isaac Newton gathered the mechanics of everyday life into three laws. The first is inertia: an object keeps doing what it is doing, resting or moving in a straight line at steady speed, unless a net force acts on it. The second makes force quantitative. The net force on an object equals its mass times its acceleration, F = m a, or more generally the rate of change of its momentum. The third says forces come in pairs: when one body pushes on another, the other pushes back equally and oppositely.

Everyday example: push an empty shopping cart and then a full one with the same force. The full cart has more mass, so it accelerates less. A 10 kg cart pushed with a net force of 30 N accelerates at 3 m/s squared.

Galileo had already noticed that, ignoring air, all bodies fall with the same acceleration regardless of mass. In 1971 an Apollo 15 astronaut dropped a hammer and a feather on the airless Moon and they landed together. Heavier objects feel more gravitational force but also need more force to accelerate, so the effects cancel.

These laws work superbly whenever speeds are far below the speed of light and objects are larger than atoms. Outside that range, relativity and quantum mechanics take over.`,
          },
          {
            id: 'lab-physics.l02',
            title: 'Universal Gravitation',
            blurb: 'Every pair of masses attracts, weaker with distance squared.',
            minutes: 7,
            body: `Newton's great leap was to see that the force that pulls an apple down is the same one that holds the Moon in orbit. His law of universal gravitation says every pair of masses attracts along the line joining them, with a force F = G m1 m2 / r squared. Here m1 and m2 are the masses, r is the distance between their centres, and G is the gravitational constant, a very small number that sets the strength of the force.

Two things follow. First, the force grows with the product of the masses, so doubling one mass doubles the force. Second, it falls off with the square of the distance. Move twice as far away and the pull drops to one quarter; move three times as far and it drops to one ninth.

Everyday example: you and a friend attract each other gravitationally, but because G is tiny and your masses are small, the force is far too weak to notice. Only planet-sized masses make gravity obvious.

Astronauts on the space station float, but not because gravity is absent there. Gravity at that height is still strong. They float because they and the station are in continuous free fall around the Earth.

This law unified terrestrial and celestial motion, creating the template for later physics.`,
          },
          {
            id: 'lab-physics.l03',
            title: 'Kinetic Energy and Conservation Laws',
            blurb: 'Energy of motion, and the quantities that nature keeps constant.',
            minutes: 8,
            body: `Kinetic energy is the energy a body has because it is moving: E_k = one half m v squared, measured in joules. Because speed is squared, speed matters far more than mass. Double the speed and the kinetic energy grows four times. A 2 kg object moving at 3 m/s has E_k = 0.5 x 2 x 9 = 9 J.

Everyday example: a car at 60 km/h has four times the kinetic energy of the same car at 30 km/h, which is why stopping distances and crash damage rise so steeply with speed.

Kinetic energy is one piece of a bigger idea: conservation laws. In an isolated system, energy, momentum and electric charge are conserved, meaning their totals do not change even though they can move between objects or change form. A pendulum swings by trading gravitational energy for kinetic energy and back again.

Emmy Noether proved something deeper. Each conservation law is tied to a symmetry of nature. Conservation of energy comes from the fact that the laws of physics do not change with time, and conservation of momentum comes from the laws being the same everywhere in space. Conservation laws are therefore not arbitrary rules but consequences of the structure of the laws themselves.`,
          },
          {
            id: 'lab-physics.l04',
            title: 'Springs and Pendulums',
            blurb: 'Restoring forces create repeating oscillations.',
            minutes: 7,
            body: `Many systems oscillate: a spring bouncing, a swing, a pendulum clock. They share a common cause, a restoring force that pulls the system back toward its resting position. For an ideal spring, Hooke's law says F = -k x. The force is proportional to the displacement x, and the minus sign means it points opposite to the displacement. The spring constant k, in newtons per metre, measures stiffness. A spring with k = 200 N/m stretched by 0.05 m pulls back with 10 N.

Everyday example: a bathroom scale and a car's suspension both rely on springs that push back in proportion to how far they are compressed.

A simple pendulum swinging through small angles has a period T = 2 pi times the square root of L / g, where L is its length and g is the gravitational acceleration. The surprise is what is missing: the period does not depend on the mass of the bob or, for small swings, on how wide it swings. A pendulum 1 m long has a period of about 2 seconds on Earth.

Because the period depends on length, quadrupling the length only doubles the period. Galileo's observations of swinging lamps led to the idea of using pendulums to keep time.`,
          },
        ],
      },
      {
        id: 'lab-physics.t2',
        title: 'Waves, Heat and Fields',
        blurb: 'The nineteenth century unified waves, thermodynamics and electromagnetism.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-physics.l05',
            title: 'Waves',
            blurb: 'Speed, frequency and wavelength are linked by one relation.',
            minutes: 6,
            body: `A wave is a repeating disturbance that carries energy from place to place without carrying matter along with it. Ripples on a pond, sound in air, and light all share the same basic description. The distance between successive crests is the wavelength. The number of crests passing a point each second is the frequency, measured in hertz (Hz). The wave relation ties them together with the wave speed: v = f lambda.

For example, a wave with a frequency of 50 Hz and a wavelength of 4 m travels at 50 x 4 = 200 m/s.

The speed of a wave is usually set by the medium it travels through, not by the source. Sound travels at a particular speed in air no matter how loud or how high the note. So if you raise the frequency of a wave in a given medium, the wavelength must shrink to keep the product the same. Doubling the frequency halves the wavelength.

Everyday example: a short string on a guitar vibrates at a higher frequency than a long string, producing a higher pitch.

Waves can overlap and combine, reinforcing or cancelling each other. This interference is the signature that distinguishes waves from simple streams of particles, and it will return when we meet light and electrons.`,
          },
          {
            id: 'lab-physics.l06',
            title: 'Heat, Work and the Ideal Gas',
            blurb: 'The first law of thermodynamics and the gas law.',
            minutes: 8,
            body: `Thermodynamics is the physics of heat, work and energy. Its first law is a statement of energy conservation: the change in a system's internal energy equals the heat added to it minus the work the system does, delta U = Q - W. If you add 500 J of heat to a gas and it does 200 J of work pushing a piston, its internal energy rises by 300 J.

Everyday example: pump a bicycle tyre quickly and the pump warms up. You do work on the gas, increasing its internal energy.

The ideal gas law describes how pressure P, volume V, amount of gas n and temperature T are connected: P V = n R T, where R is the gas constant. Temperature here must be in kelvin, the absolute scale where zero means no thermal motion to remove.

The law gives quick predictions. In a sealed rigid container, the volume and the amount of gas cannot change, so pressure is proportional to temperature. That is why a sealed can left in a hot place can burst, and why tyre pressure rises as you drive.

The nineteenth century united the study of heat and mechanics into a single concept of energy that can change form but is never created or destroyed.`,
          },
          {
            id: 'lab-physics.l07',
            title: 'Entropy and the Arrow of Time',
            blurb: 'Why heat flows one way and time seems to as well.',
            minutes: 8,
            body: `Entropy is often described as disorder, but its precise meaning comes from counting. Ludwig Boltzmann showed that entropy S measures how many microscopic arrangements, called microstates, are consistent with what we observe at large scale: S = k_B ln Omega, where Omega is the number of microstates and k_B is Boltzmann's constant. This equation is engraved on his gravestone.

The second law of thermodynamics says that the entropy of an isolated system never decreases. Systems drift toward the large-scale states that have the most microstates, because those are overwhelmingly more probable. Sadi Carnot's study of steam engines had already hinted at this: it set an upper limit on how efficient any heat engine can be, and Clausius later coined the word entropy.

Everyday example: put an ice cube in a warm drink. Heat flows from the warm drink to the ice, never the reverse, because there are vastly more ways for thermal energy to be spread out evenly. A dropped glass shatters but never reassembles for the same reason: there are enormously more arrangements of broken pieces than of an intact glass.

This is why the second law gives time a direction, and it links thermodynamics, statistical mechanics and even information theory.`,
          },
          {
            id: 'lab-physics.l08',
            title: "Electric Charge and Coulomb's Law",
            blurb: 'The force between charges, and what Gauss added.',
            minutes: 7,
            body: `Electric charge, measured in coulombs, comes in two kinds. Like charges repel and opposite charges attract. Charles-Augustin Coulomb measured the force in 1785 and found that it is proportional to the product of the two charges and inversely proportional to the square of their separation: F = k q1 q2 / r squared, where k = 1/(4 pi epsilon-zero).

Compare this with gravity. Both are inverse-square laws, but they differ in an important way. Gravity only ever attracts, whereas electric forces can attract or repel. And the electric force between charged particles is vastly stronger than their gravitational pull, which is why static electricity can lift a scrap of paper against the pull of the entire Earth.

Scaling is straightforward. Double one charge and the force doubles. Double the distance and the force drops to a quarter. Do both at once and the net result is a factor of 2 x 1/4 = 1/2.

Everyday example: clothes cling together in a dryer because friction moves charge from one fabric to another and the opposite charges attract.

Gauss's law expresses the same physics in terms of fields: the electric flux through a closed surface is proportional to the charge enclosed. It is one of Maxwell's four equations.`,
          },
          {
            id: 'lab-physics.l09',
            title: "Induction and Maxwell's Light",
            blurb: 'Electricity, magnetism and light become one theory.',
            minutes: 8,
            body: `In 1820 Hans Christian Orsted noticed that a current in a wire deflects a nearby compass needle, linking electricity to magnetism. In 1831 Michael Faraday found the reverse: a changing magnetic flux through a circuit induces an electromotive force, written as EMF = -d(flux)/dt. The key word is changing. A magnet held still beside a coil produces nothing; move the magnet in and out and a current flows.

Everyday example: a bicycle dynamo or a power-station generator spins a coil in a magnetic field so that the flux through it keeps changing, producing a steady electrical output.

James Clerk Maxwell then fitted everything into four equations. A changing electric field creates a magnetic field and a changing magnetic field creates an electric field, so a self-sustaining wave can travel through empty space. He calculated its speed and found it matched the speed of light, concluding that light itself is an electromagnetic wave.

Maxwell's theory predicted radio waves, and in 1887 Heinrich Hertz detected them, confirming that electromagnetic waves travel at light speed. Radio, microwaves, visible light and X-rays are all the same kind of wave, differing only in wavelength.`,
          },
        ],
      },
      {
        id: 'lab-physics.t3',
        title: 'Relativity',
        blurb: 'Space, time and gravity reimagined by Einstein.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-physics.l10',
            title: 'Special Relativity and E = mc squared',
            blurb: 'The speed of light is the same for everyone.',
            minutes: 9,
            body: `Special relativity rests on two postulates. First, the laws of physics are the same in every inertial frame, meaning for any observers moving at constant velocity. Second, light travels at the same speed c, about 3 x 10^8 m/s, for all of them. The second sounds harmless but it has radical consequences: moving clocks run slow (time dilation), moving objects shorten along their direction of motion (length contraction), and events that look simultaneous to one observer may not to another.

The evidence is concrete. The Michelson-Morley experiment of 1887 found no ether wind, supporting the constancy of light speed. In 1941 Rossi and Hall showed that fast cosmic-ray muons reach the ground because their internal clocks run slow. In 1971 Hafele and Keating flew atomic clocks around the world and found the tiny predicted disagreement with clocks on the ground.

The theory also makes mass and energy interchangeable: E = m c squared. Because c squared is enormous, a tiny mass corresponds to a vast energy. Converting 1 kg of mass would release about 9 x 10^16 joules.

Everyday relevance: particle accelerators confirm relativity daily, since their particles move so fast that Newtonian predictions fail.`,
          },
          {
            id: 'lab-physics.l11',
            title: 'General Relativity',
            blurb: 'Gravity as the curvature of spacetime.',
            minutes: 8,
            body: `Einstein's general relativity recasts gravity. Rather than a force acting across empty space, gravity is the curvature of spacetime itself. Mass and energy bend the geometry, and objects follow the straightest possible paths through it. The Earth orbits the Sun not because the Sun pulls it with a rope but because the Sun curves the spacetime the Earth travels through. A useful picture is a heavy ball denting a stretched rubber sheet, though the real curvature involves time as well as space.

The theory made precise predictions that were later confirmed. It explained the slow drift, or precession, of Mercury's orbit that Newtonian gravity could not account for. In 1919 Arthur Eddington's eclipse expedition measured starlight bending around the Sun by the amount general relativity predicted, which made Einstein famous. It predicts gravitational time dilation, where clocks run slower in stronger gravity, and gravitational waves, ripples in spacetime.

In 2015 LIGO detected gravitational waves from two merging black holes, confirming a century-old prediction. The detectors measure stretches far smaller than a proton.

Everyday relevance: GPS satellites must correct for these timing effects, or their position estimates would drift.`,
          },
        ],
      },
      {
        id: 'lab-physics.t4',
        title: 'The Quantum World and Beyond',
        blurb: 'Probability, duality and the particles that make up everything.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-physics.l12',
            title: 'Quantum Mechanics',
            blurb: 'Energy comes in packets and nature is probabilistic.',
            minutes: 9,
            body: `Quantum mechanics began in 1900 when Max Planck explained black-body radiation by assuming energy is emitted in discrete packets rather than continuously. In 1905 Einstein used the same idea to explain the photoelectric effect: light ejects electrons from a metal as if it arrives in particles, photons, each with energy E = h f, where h is Planck's constant and f is the light's frequency.

The mature theory replaces definite trajectories with a wavefunction. The Schrodinger equation governs how the wavefunction changes with time, and its square gives the probability of finding a particle in a particular place. Quantities such as energy come in discrete levels, as in Bohr's model of the atom.

Heisenberg's uncertainty principle sets a limit: the uncertainties in position and momentum obey delta x times delta p is at least h-bar / 2. Squeeze one down and the other must grow. This is not a flaw in our instruments but a feature of nature.

Quantum mechanics is the most precisely tested theory in science. It underlies chemistry, since it determines how atoms bond, and technologies such as lasers and the semiconductors in every phone and computer.`,
          },
          {
            id: 'lab-physics.l13',
            title: 'Wave-Particle Duality',
            blurb: 'Light and matter show both faces.',
            minutes: 7,
            body: `For centuries physicists argued whether light was a wave or a stream of particles. Thomas Young's double-slit experiment in 1801 seemed to settle it: light passing through two narrow slits produced bands of bright and dark fringes, the signature of waves interfering. Yet the photoelectric effect in 1905 showed light delivering energy in discrete particle-like quanta.

Quantum mechanics says the answer is both. Light and matter each display wave behaviour, interference and diffraction, and particle behaviour, discrete and localised detections. Which face appears depends on the experiment performed.

Matter shows the same duality. In the Davisson-Germer experiment of 1927 electrons bounced off a crystal diffracted like waves, confirming that matter has a wave nature. In the double-slit experiment with single electrons, sent one at a time, each electron lands at a single spot like a particle, yet as thousands accumulate they build up an interference pattern, a result seen by Tonomura in 1989.

This is the puzzling part: a single particle somehow behaves as if it passed through both slits. The duality is not a hidden classical picture but a reminder that quantum objects are neither classical waves nor classical particles.`,
          },
          {
            id: 'lab-physics.l14',
            title: 'The Standard Model and the Modern Frontier',
            blurb: 'From fundamental particles to dark matter and black-hole images.',
            minutes: 8,
            body: `By the 1960s physicists had found a zoo of particles, and a tidier picture emerged. The Standard Model catalogues the fundamental particles and describes three of the four known forces: the electromagnetic force, the weak force and the strong force. Gravity is not included. Its pieces were built through quantum electrodynamics, developed by Feynman and others, and the quark model proposed in 1964.

Predictions were confirmed particle by particle, culminating in the observation of the Higgs boson at the Large Hadron Collider at CERN in 2012. The Higgs field is how fundamental particles acquire their mass.

Meanwhile cosmology matured. The Big Bang model, together with the discovery that most of the universe's matter is dark matter and that its expansion is driven by dark energy, shows that the particles of the Standard Model make up only a small share of the cosmos. Edwin Hubble had earlier shown that galaxies lie beyond our own and are receding, so the universe is expanding.

New windows have opened: LIGO detected gravitational waves in 2015 and the Event Horizon Telescope imaged a black-hole shadow in 2019. Unifying gravity with quantum theory remains the great open problem.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-physics',
    questions: [
      // l01
      m('lab-physics.l01.q1', 1, "Which law of motion states that an object keeps its state of rest or steady straight-line motion unless a net force acts on it?",
        ['The second law', 'The first law', 'The third law', 'The law of gravitation'], 1,
        'This property is called inertia.', "Newton's first law defines inertia: without a net force, motion does not change."),
      m('lab-physics.l01.q2', 1, "In Newton's second law, what does the net force on an object equal for constant mass?",
        ['Mass times velocity', 'Mass divided by acceleration', 'Mass times acceleration', 'Mass times speed squared'], 2,
        'Force is linked to how quickly velocity changes.', 'F = m a: net force is mass times acceleration.'),
      m('lab-physics.l01.q3', 2, 'A net force of 30 N acts on a 10 kg cart. What is its acceleration?',
        ['0.3 m/s squared', '300 m/s squared', '40 m/s squared', '3 m/s squared'], 3,
        'Rearrange F = m a to find a.', 'a = F / m = 30 N / 10 kg = 3 m/s squared.'),
      m('lab-physics.l01.q4', 3, 'On the airless Moon a hammer and a feather dropped together land at the same time. What best explains this?',
        ['Gravity on the Moon pulls harder on feathers', 'Without air resistance, all objects fall with the same acceleration', 'Heavier objects have less inertia', 'The Moon has no gravity so nothing falls'], 1,
        'Think about what differs on Earth between a feather and a hammer.', 'With no air, the only force that matters is gravity, and acceleration is independent of mass. On Earth, air resistance slows the feather.'),
      // l02
      m('lab-physics.l02.q1', 1, 'In the law of universal gravitation, how does the force between two masses depend on the distance between them?',
        ['It is proportional to the distance', 'It is inversely proportional to the distance squared', 'It does not depend on distance', 'It is proportional to the distance squared'], 1,
        'The force gets weaker with distance, faster than a simple proportion.', 'F = G m1 m2 / r squared, an inverse-square law.'),
      tf('lab-physics.l02.q2', 1, "Newton's law of gravitation applies to every pair of masses, not just to planets.", 0,
        'The word universal is in the name.', 'Every pair of masses attracts, but the force is only noticeable when at least one mass is huge.'),
      m('lab-physics.l02.q3', 2, 'The distance between two masses is tripled. By what factor does the gravitational force change?',
        ['It becomes 1/3 as large', 'It becomes 1/9 as large', 'It becomes 3 times as large', 'It becomes 9 times as large'], 1,
        'The force depends on the square of the distance.', 'Force scales as 1 / r squared, so tripling r gives 1/9 of the force.'),
      m('lab-physics.l02.q4', 3, 'Astronauts on the space station float. What is the correct explanation?',
        ['There is no gravity at that height', 'They are so far beyond the Earth gravitational pull that its force is negligible', 'They and the station are in continuous free fall around the Earth', 'The station spins to cancel gravity'], 2,
        'Gravity at that height is still strong.', 'Gravity there is still strong; they float because they are falling around the Earth together with the station.'),
      // l03
      m('lab-physics.l03.q1', 1, 'What is the formula for kinetic energy?',
        ['m v, which is momentum', 'one half m v squared', 'm a, which is net force', 'm g h, which is potential energy'], 1,
        'It involves the speed squared.', 'Kinetic energy is E_k = one half m v squared.'),
      m('lab-physics.l03.q2', 1, 'According to Emmy Noether, what is every conservation law connected to?',
        ['A symmetry of nature', 'A measuring instrument', 'The speed of light', 'The temperature of a system'], 0,
        'Her theorem links two ideas, one of them a conserved quantity.', 'Noether proved that each continuous symmetry corresponds to a conserved quantity.'),
      m('lab-physics.l03.q3', 2, 'What is the kinetic energy of a 2 kg object moving at 3 m/s?',
        ['6 J', '3 J', '18 J', '9 J'], 3,
        'Square the speed first.', 'E_k = 0.5 x 2 kg x (3 m/s) squared = 0.5 x 2 x 9 = 9 J.'),
      m('lab-physics.l03.q4', 3, 'Why does doubling a car speed make crashes much more severe than doubling its mass would?',
        ['Kinetic energy grows with the square of speed, so doubling speed quadruples it', 'Speed and mass affect kinetic energy equally', 'Kinetic energy does not depend on speed', 'Faster cars lose their momentum'], 0,
        'Compare how mass and speed each appear in the formula.', 'Doubling mass doubles E_k, but doubling speed multiplies it by 4.'),
      // l04
      m('lab-physics.l04.q1', 1, "What does the minus sign in Hooke's law F = -k x tell us?",
        ['The spring has a negative stiffness, so it pushes the mass away from rest', 'The force points opposite to the displacement', 'The force is always smaller than kx', 'The spring is losing energy'], 1,
        'Think about which way a stretched spring pulls.', 'The force is a restoring force, directed back toward the equilibrium position.'),
      m('lab-physics.l04.q2', 1, 'For small swings, which two quantities set the period of a simple pendulum?',
        ['Mass and amplitude', 'Mass and length', 'Amplitude and gravity', 'Length and gravitational acceleration'], 3,
        'The formula is T = 2 pi times the square root of L / g.', 'T depends only on length L and gravitational acceleration g.'),
      m('lab-physics.l04.q3', 2, 'A spring with k = 200 N/m is stretched 0.05 m. What is the magnitude of its restoring force?',
        ['10 N', '4000 N', '0.25 N', '100 N'], 0,
        'Multiply k by x in metres.', 'F = k x = 200 x 0.05 = 10 N.'),
      m('lab-physics.l04.q4', 3, 'A pendulum is made 4 times longer. What happens to its period?',
        ['It becomes 4 times longer', 'It becomes 16 times longer', 'It doubles', 'It stays the same'], 2,
        'The length sits under a square root.', 'T is proportional to the square root of L, and the square root of 4 is 2.'),
      // l05
      m('lab-physics.l05.q1', 1, 'What is the relation between wave speed, frequency and wavelength?',
        ['v = f / lambda', 'v = f lambda', 'v = lambda / f', 'v = f + lambda'], 1,
        'The speed is a product of two of the quantities.', 'Wave speed equals frequency times wavelength.'),
      m('lab-physics.l05.q2', 1, 'In what unit is frequency measured?',
        ['Metres', 'Joules', 'Hertz', 'Newtons'], 2,
        'It counts cycles per second.', 'One hertz is one cycle per second.'),
      m('lab-physics.l05.q3', 2, 'A wave has frequency 50 Hz and wavelength 4 m. What is its speed?',
        ['12.5 m/s', '200 m/s', '54.0 m/s', '46.0 m/s'], 1,
        'Use v = f lambda.', 'v = 50 Hz x 4 m = 200 m/s.'),
      m('lab-physics.l05.q4', 3, 'A wave travels through the same medium and its frequency is doubled. What happens to its wavelength?',
        ['It doubles', 'It stays the same', 'It becomes four times larger', 'It is halved'], 3,
        'The medium sets the speed, which stays fixed.', 'With v fixed, v = f lambda means doubling f halves lambda.'),
      // l06
      m('lab-physics.l06.q1', 1, 'The first law of thermodynamics is a statement of which principle?',
        ['Conservation of energy', 'Conservation of charge', 'Increase of entropy', 'Inverse-square force'], 0,
        'Energy can change form but not be created.', 'delta U = Q - W expresses energy conservation for heat and work.'),
      m('lab-physics.l06.q2', 1, 'In the ideal gas law P V = n R T, in which units must the temperature be given?',
        ['Celsius', 'Fahrenheit', 'Joules per kelvin', 'Kelvin'], 3,
        'It must be an absolute scale.', 'The gas law requires absolute temperature in kelvin.'),
      m('lab-physics.l06.q3', 2, 'A gas absorbs 500 J of heat and does 200 J of work on its surroundings. What is the change in its internal energy?',
        ['300 J', '700 J', '100 J', '200 J'], 0,
        'Use delta U = Q - W.', 'delta U = 500 J - 200 J = 300 J.'),
      m('lab-physics.l06.q4', 3, 'A sealed rigid can of gas is heated. Why does the pressure rise?',
        ['The gas gains mass', 'The volume must have increased', 'With volume and amount fixed, pressure is proportional to temperature', 'The gas constant R increases with heat'], 2,
        'Which quantities in P V = n R T are fixed here?', 'V and n are constant, so P is proportional to T.'),
      // l07
      m('lab-physics.l07.q1', 1, 'What does Boltzmann entropy S = k_B ln Omega count?',
        ['The total thermal energy stored in all of the particles of a system', 'The number of microscopic states consistent with a macrostate', 'The speed of the particles', 'The mass of a gas'], 1,
        'Omega is a count.', 'Omega is the number of microstates, and entropy grows with its logarithm.'),
      tf('lab-physics.l07.q2', 1, 'The second law says the entropy of an isolated system never decreases.', 0,
        'It gives time a direction.', 'In an isolated system, entropy stays constant or increases.'),
      m('lab-physics.l07.q3', 2, 'An ice cube is dropped into a warm drink. In which direction does heat flow spontaneously?',
        ['From the ice to the drink', 'From the drink to the ice', 'No heat flows', 'Back and forth equally'], 1,
        'Entropy increases when energy spreads out.', 'Heat flows from hot to cold, which increases the total entropy.'),
      m('lab-physics.l07.q4', 3, 'Why does a dropped glass shatter but never spontaneously reassemble?',
        ['Reassembly would break conservation of energy', 'Broken states have vastly more microstates than the intact glass', 'Gravity only pulls things apart', 'The glass loses entropy when it breaks'], 1,
        'Think about counting arrangements.', 'The disordered, broken states are overwhelmingly more probable. It is a statistical statement, not a violation of energy conservation.'),
      // l08
      m('lab-physics.l08.q1', 1, "According to Coulomb's law, what happens between two like charges?",
        ['They repel each other', 'They attract each other', 'They exert no force', 'They merge'], 0,
        'Think of two positive charges.', 'Like charges repel and unlike charges attract.'),
      m('lab-physics.l08.q2', 1, "Gauss's law relates the electric flux through a closed surface to what?",
        ['The surface area alone', 'The charge enclosed', 'The temperature inside', 'The mass inside'], 1,
        'It is about what is inside the surface.', 'The flux is proportional to the enclosed charge divided by epsilon-zero.'),
      m('lab-physics.l08.q3', 2, 'One charge is doubled and the distance between the two charges is also doubled. How does the electric force change?',
        ['It is unchanged', 'It doubles', 'It becomes one half', 'It becomes one quarter'], 2,
        'Force scales with the charge product and 1 / r squared.', 'The force is multiplied by 2 for the charge and by 1/4 for the distance, which gives 1/2.'),
      m('lab-physics.l08.q4', 3, 'Coulomb and gravity are both inverse-square laws. What is a key difference?',
        ['Electric forces can attract or repel, while gravity only attracts', 'Gravity can repel, but electric forces cannot', 'Gravity is the stronger force between particles', 'Only electric forces depend on distance'], 0,
        'Consider the two possible signs of charge.', 'Charge has two signs, so electric forces can go either way, while mass only attracts.'),
      // l09
      m('lab-physics.l09.q1', 1, 'What did Orsted discover in 1820?',
        ['Radio waves travelling through empty space', 'A current deflects a compass needle', 'The electron', 'Magnetic monopoles'], 1,
        'It linked electricity to magnetism.', 'A current-carrying wire moves a compass needle, linking electricity and magnetism.'),
      m('lab-physics.l09.q2', 1, 'What did Heinrich Hertz detect in 1887?',
        ['Gravitational waves', 'Individual photons', 'Cosmic ray showers', 'Radio waves'], 3,
        'Maxwell had predicted them.', 'Hertz detected electromagnetic waves at light speed, vindicating Maxwell.'),
      m('lab-physics.l09.q3', 2, 'A bar magnet is held perfectly still next to a coil of wire. What current flows in the coil?',
        ['A steady current, because the magnet produces a magnetic field', 'No induced current, because the flux is not changing', 'A current that grows with time', 'An alternating current'], 1,
        'Faraday\'s law depends on a change.', 'An EMF is induced only when the magnetic flux changes, such as when the magnet moves.'),
      m('lab-physics.l09.q4', 3, 'What led Maxwell to conclude that light is an electromagnetic wave?',
        ['His equations predicted a wave travelling at the speed of light', 'Light bends around the Sun', 'Light can be polarised', 'Compass needles point to light sources'], 0,
        'Think about the calculated speed.', 'Changing electric and magnetic fields sustain each other as a wave whose computed speed matched that of light.'),
      // l10
      m('lab-physics.l10.q1', 1, 'What do the two postulates of special relativity say?',
        ['Physics is the same in all inertial frames and light speed is the same for all observers', 'Mass is constant and time is absolute', 'Light needs an ether and has variable speed', 'Gravity is a curvature and light is a particle'], 0,
        'One concerns frames, the other concerns light.', 'Equivalent physics in all inertial frames and a constant speed of light are the two postulates.'),
      m('lab-physics.l10.q2', 1, 'What did the Michelson-Morley experiment find?',
        ['The speed of light in water', 'Gravitational waves', 'No ether wind', 'Time dilation of muons'], 2,
        'It tested for a medium for light.', 'It detected no ether wind, consistent with light speed being independent of motion.'),
      m('lab-physics.l10.q3', 2, 'Using E = m c squared with c about 3 x 10^8 m/s, roughly how much energy corresponds to 1 kg of mass?',
        ['3 x 10^8 J', '9 x 10^8 J', '3 x 10^16 J', '9 x 10^16 J'], 3,
        'Square c carefully.', 'c squared is 9 x 10^16 m squared per s squared, so E is about 9 x 10^16 J.'),
      m('lab-physics.l10.q4', 3, 'Cosmic-ray muons reach the ground even though they decay quickly. How does special relativity explain this?',
        ['They travel faster than light, so they outrun their decay', 'They gain mass', 'Their clocks run slow because they move fast', 'Gravity pulls them down faster'], 2,
        'Think about time dilation.', 'The muons are moving so fast that their internal clocks tick slowly, so they survive long enough to reach the ground.'),
      // l11
      m('lab-physics.l11.q1', 1, 'In general relativity, what is gravity?',
        ['A force carried by a particle called the graviton across empty space', 'A kind of magnetism', 'The curvature of spacetime produced by mass and energy', 'An illusion caused by acceleration of stars'], 2,
        'It is a geometric idea.', 'Mass and energy curve spacetime, and objects follow the straightest available paths.'),
      m('lab-physics.l11.q2', 1, 'What did the 1919 Eddington eclipse expedition measure?',
        ['The total mass of the Sun from the orbits of planets', 'The bending of starlight around the Sun', 'The speed of light', 'The expansion of the universe'], 1,
        'It was observed during a solar eclipse.', 'Starlight bent by the Sun matched general relativity, not Newton.'),
      m('lab-physics.l11.q3', 2, "Astronomers found that Mercury's orbit drifts in a way Newtonian gravity could not explain. Which theory accounts for it exactly?",
        ['Special relativity alone', 'General relativity', 'Kepler laws of planetary motion', 'Quantum mechanics of atoms'], 1,
        'Strong gravity near the Sun is involved.', "The precession of Mercury's perihelion is predicted by general relativity."),
      m('lab-physics.l11.q4', 3, 'Why was the 2015 LIGO detection of gravitational waves so important?',
        ['It disproved relativity', 'It confirmed a prediction made about a century earlier', 'It detected dark matter directly', 'It showed that gravity is a particle'], 1,
        'Think about when Einstein made the prediction.', 'Ripples from merging black holes confirmed a century-old prediction of general relativity.'),
      // l12
      m('lab-physics.l12.q1', 1, 'What was Planck\'s key idea in 1900?',
        ['Light is a wave', 'Atoms are indivisible and have no internal structure', 'Energy is emitted in discrete packets', 'Time is relative'], 2,
        'It resolved the black-body radiation problem.', 'Quantising energy explained black-body radiation and launched quantum theory.'),
      m('lab-physics.l12.q2', 1, 'What does the square of the wavefunction give?',
        ['The total mass of the particle in each region of space', 'The probability of finding it somewhere', 'The exact path it follows', 'Its charge'], 1,
        'Quantum mechanics is probabilistic.', 'The squared wavefunction gives probabilities rather than definite trajectories.'),
      m('lab-physics.l12.q3', 2, 'According to the uncertainty principle, what happens to the momentum uncertainty if a particle position is pinned down more precisely?',
        ['It shrinks as well', 'It stays the same', 'It becomes zero', 'It must grow'], 3,
        'The product of the two has a lower bound.', 'The product delta x times delta p cannot fall below h-bar / 2, so reducing one increases the other.'),
      m('lab-physics.l12.q4', 3, 'Why is quantum mechanics relevant to everyday technology?',
        ['It only applies to distant stars', 'It describes atoms, which underlies lasers and semiconductors', 'It replaces Newton for all large objects', 'It describes planetary orbits'], 1,
        'Think about what is inside a phone.', 'Quantum rules for electrons in atoms and solids make lasers and semiconductor chips possible.'),
      // l13
      m('lab-physics.l13.q1', 1, "What did Young's double-slit experiment show about light?",
        ['It behaves as a wave', 'It is made only of particles', 'It travels infinitely fast', 'It has no energy'], 0,
        'Interference fringes appeared.', 'The fringes are the signature of wave interference.'),
      m('lab-physics.l13.q2', 1, 'What did the Davisson-Germer experiment show?',
        ['Light is quantised', 'Electrons diffract like waves', 'Electrons are particles that never diffract', 'Gravity bends light'], 1,
        'It was done with electrons and a crystal.', 'Electron diffraction confirmed the wave nature of matter.'),
      m('lab-physics.l13.q3', 2, 'The photoelectric effect shows light ejecting electrons in discrete amounts of energy. Which aspect of light does it reveal?',
        ['Its wave nature, through interference fringes', 'Its particle (photon) nature', 'Its refraction', 'Its polarisation'], 1,
        'Each photon carries energy h f.', 'It is explained by photons, particle-like quanta of energy h f.'),
      m('lab-physics.l13.q4', 3, 'Electrons are sent through a double slit one at a time and an interference pattern slowly builds up. Why is this surprising?',
        ['Single electrons were expected to interfere only with each other in groups', 'Each electron is detected at one spot like a particle, yet the pattern is wave-like', 'It means electrons are heavier than expected', 'It shows electrons travel faster than light'], 1,
        'Each detection is a single dot.', 'Individual detections are particle-like, but the accumulated pattern shows wave interference.'),
      // l14
      m('lab-physics.l14.q1', 1, 'Which of the four known forces is NOT described by the Standard Model?',
        ['Electromagnetism', 'The strong force', 'The weak force', 'Gravity'], 3,
        'It is the one described by general relativity.', 'The Standard Model covers three of the four forces; gravity is excluded.'),
      m('lab-physics.l14.q2', 1, 'Which particle was observed at the Large Hadron Collider in 2012?',
        ['The Higgs boson', 'The positron', 'The neutron', 'The hypothetical graviton'], 0,
        'It is linked to how particles gain mass.', 'The Higgs boson was observed at CERN in 2012.'),
      m('lab-physics.l14.q3', 2, 'Edwin Hubble showed that "nebulae" were really other galaxies and that they are receding. What did this provide evidence for?',
        ['A static universe', 'The cosmic expansion', 'The existence of the ether', 'Proton decay'], 1,
        'The redshift-distance relation is the clue.', 'The redshift-distance relation was the first evidence that the universe expands.'),
      m('lab-physics.l14.q4', 3, 'Why does the discovery of dark matter and dark energy matter for the Standard Model?',
        ['It shows the Standard Model particles make up only a small share of the cosmos', 'It proves the Standard Model is wrong in every detail', 'It shows gravity is a particle', 'It replaces the Higgs boson'], 0,
        'Think about what makes up most of the universe.', 'Most of the universe is dark matter and dark energy, which the Standard Model does not account for.'),
    ],
  },
};
