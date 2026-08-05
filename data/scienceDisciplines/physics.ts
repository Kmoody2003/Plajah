// ─────────────────────────────────────────────────────────────────────────────
// Physics discipline data — the seed for the Plajah Academia / Labs Physics
// studio. Accuracy-first: every figure carries a real Wikipedia slug (the final
// path segment of en.wikipedia.org/wiki/<slug>) so portraits + biographies
// enrich live at runtime; every law's `latex` is verified KaTeX; every tool is a
// real, free/open resource with a genuine URL.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'physics',
  label: 'Physics',
  icon: 'Atom',
  accent: '#00B4D8',
  accent2: '#0077B6',
  tagline: 'The search for the simplest rules that govern everything that moves, shines, or falls.',
  heroBlurb:
    'From the swing of a pendulum to the collapse of a star, physics seeks the fewest equations that explain the most of the universe. Explore its pioneers, its laws, and the tools that let you test them yourself.',
  openStaxSubject: 'physics',
  arXivCategory: 'physics',
  arXivQuery: 'quantum condensed matter particle',
  simulators: ['projectile', 'pendulum', 'wave'],

  // ── Figure halls ───────────────────────────────────────────────────────────
  figureHalls: [
    { id: 'classical', label: 'Classical Era', blurb: 'The founders of mechanics, gravitation and the experimental method — from Galileo to Maxwell.' },
    { id: 'relativity', label: 'Relativity & Gravitation', blurb: 'Those who reshaped space, time and gravity into a single geometric fabric.' },
    { id: 'quantum', label: 'Quantum Revolution', blurb: 'The generation that discovered the strange, probabilistic laws of the atomic world.' },
    { id: 'modern', label: 'Modern & Astrophysics', blurb: 'Particle physics, the cosmos and the frontiers of the very small and the very large.' },
  ],

  // ── Figures (15) ────────────────────────────────────────────────────────────
  figures: [
    {
      id: 'galileo', name: 'Galileo Galilei', wikiSlug: 'Galileo_Galilei', hall: 'classical',
      role: 'Physicist & Astronomer', era: 'Scientific Revolution', nationality: 'Italian', years: '1564–1642',
      tagline: 'Father of the experimental method and modern observational astronomy.',
      works: ['Dialogue Concerning the Two Chief World Systems', 'Two New Sciences', 'Sidereus Nuncius'],
      techniques: ['Established that all bodies fall with the same acceleration', 'First to use a telescope systematically for astronomy', 'Formulated the principle of inertia and relativity of motion'],
    },
    {
      id: 'newton', name: 'Isaac Newton', wikiSlug: 'Isaac_Newton', hall: 'classical',
      role: 'Physicist & Mathematician', era: 'Scientific Revolution', nationality: 'English', years: '1643–1727',
      tagline: 'Author of the laws of motion and universal gravitation.',
      works: ['Philosophiæ Naturalis Principia Mathematica', 'Opticks'],
      techniques: ['Formulated the three laws of motion', 'Discovered the law of universal gravitation', 'Co-invented calculus and analysed the spectrum of light'],
    },
    {
      id: 'faraday', name: 'Michael Faraday', wikiSlug: 'Michael_Faraday', hall: 'classical',
      role: 'Physicist & Chemist', era: 'Victorian Science', nationality: 'English', years: '1791–1867',
      tagline: 'Discoverer of electromagnetic induction and the field concept.',
      works: ['Experimental Researches in Electricity', 'Faraday cage', 'Faraday effect'],
      techniques: ['Discovered electromagnetic induction, the basis of the electric generator', 'Introduced the idea of lines of force and fields', 'Established the laws of electrolysis'],
    },
    {
      id: 'maxwell', name: 'James Clerk Maxwell', wikiSlug: 'James_Clerk_Maxwell', hall: 'classical',
      role: 'Theoretical Physicist', era: 'Victorian Science', nationality: 'Scottish', years: '1831–1879',
      tagline: 'Unified electricity, magnetism and light into one theory.',
      works: ['A Treatise on Electricity and Magnetism', 'Maxwell’s equations', 'Kinetic theory of gases'],
      techniques: ['Formulated the equations of the electromagnetic field', 'Predicted that light is an electromagnetic wave', 'Founded the statistical theory of gases with the Maxwell distribution'],
    },
    {
      id: 'boltzmann', name: 'Ludwig Boltzmann', wikiSlug: 'Ludwig_Boltzmann', hall: 'classical',
      role: 'Physicist', era: 'Statistical Mechanics', nationality: 'Austrian', years: '1844–1906',
      tagline: 'Gave entropy its microscopic, probabilistic meaning.',
      works: ['Boltzmann equation', 'Statistical definition of entropy', 'H-theorem'],
      techniques: ['Connected entropy to the number of microscopic states', 'Founded statistical mechanics', 'Explained the second law of thermodynamics statistically'],
    },
    {
      id: 'einstein', name: 'Albert Einstein', wikiSlug: 'Albert_Einstein', hall: 'relativity',
      role: 'Theoretical Physicist', era: 'Modern Physics', nationality: 'German-American', years: '1879–1955',
      tagline: 'Reimagined space, time, gravity, and the quantum of light.',
      works: ['Special relativity', 'General relativity', 'Photoelectric effect', 'E = mc²'],
      techniques: ['Formulated special and general relativity', 'Explained the photoelectric effect, seeding quantum theory', 'Described gravity as the curvature of spacetime'],
    },
    {
      id: 'noether', name: 'Emmy Noether', wikiSlug: 'Emmy_Noether', hall: 'relativity',
      role: 'Mathematician & Physicist', era: 'Modern Physics', nationality: 'German', years: '1882–1935',
      tagline: 'Proved that every symmetry yields a conservation law.',
      works: ['Noether’s theorem', 'Abstract algebra foundations'],
      techniques: ['Linked continuous symmetries to conserved quantities', 'Underpinned modern theoretical physics and field theory', 'Revolutionised abstract and commutative algebra'],
    },
    {
      id: 'hubble', name: 'Edwin Hubble', wikiSlug: 'Edwin_Hubble', hall: 'modern',
      role: 'Astronomer', era: 'Modern Astronomy', nationality: 'American', years: '1889–1953',
      tagline: 'Showed the universe is vast and expanding.',
      works: ['Hubble’s law', 'Classification of galaxies', 'Discovery of galaxies beyond the Milky Way'],
      techniques: ['Proved that "nebulae" are separate galaxies', 'Discovered the redshift–distance relation', 'Provided the first evidence for cosmic expansion'],
    },
    {
      id: 'bohr', name: 'Niels Bohr', wikiSlug: 'Niels_Bohr', hall: 'quantum',
      role: 'Theoretical Physicist', era: 'Quantum Revolution', nationality: 'Danish', years: '1885–1962',
      tagline: 'Quantised the atom and championed complementarity.',
      works: ['Bohr model of the atom', 'Complementarity principle', 'Copenhagen interpretation'],
      techniques: ['Introduced quantised electron orbits and energy levels', 'Co-founded the Copenhagen interpretation of quantum mechanics', 'Explained atomic spectra and the periodic structure'],
    },
    {
      id: 'planck', name: 'Max Planck', wikiSlug: 'Max_Planck', hall: 'quantum',
      role: 'Theoretical Physicist', era: 'Quantum Revolution', nationality: 'German', years: '1858–1947',
      tagline: 'Founder of quantum theory.',
      works: ['Planck’s law of black-body radiation', 'Planck constant'],
      techniques: ['Introduced the quantum of action to explain black-body radiation', 'Established that energy is emitted in discrete packets', 'Launched the quantum era of physics'],
    },
    {
      id: 'curie', name: 'Marie Curie', wikiSlug: 'Marie_Curie', hall: 'quantum',
      role: 'Physicist & Chemist', era: 'Modern Physics', nationality: 'Polish-French', years: '1867–1934',
      tagline: 'Pioneer of radioactivity; only person to win Nobels in two sciences.',
      works: ['Discovery of polonium and radium', 'Theory of radioactivity'],
      techniques: ['Coined the term radioactivity and isolated new elements', 'Developed techniques for isolating radioactive isotopes', 'Advanced the medical use of radiation'],
    },
    {
      id: 'heisenberg', name: 'Werner Heisenberg', wikiSlug: 'Werner_Heisenberg', hall: 'quantum',
      role: 'Theoretical Physicist', era: 'Quantum Revolution', nationality: 'German', years: '1901–1976',
      tagline: 'Formulated matrix mechanics and the uncertainty principle.',
      works: ['Matrix mechanics', 'Uncertainty principle'],
      techniques: ['Created the first complete formulation of quantum mechanics', 'Discovered the limit on simultaneous knowledge of position and momentum', 'Advanced quantum field theory and nuclear physics'],
    },
    {
      id: 'dirac', name: 'Paul Dirac', wikiSlug: 'Paul_Dirac', hall: 'quantum',
      role: 'Theoretical Physicist', era: 'Quantum Field Theory', nationality: 'British', years: '1902–1984',
      tagline: 'United quantum mechanics with relativity and predicted antimatter.',
      works: ['Dirac equation', 'Quantum electrodynamics foundations', 'Prediction of the positron'],
      techniques: ['Formulated a relativistic wave equation for the electron', 'Predicted antimatter years before its discovery', 'Helped found quantum field theory'],
    },
    {
      id: 'feynman', name: 'Richard Feynman', wikiSlug: 'Richard_Feynman', hall: 'modern',
      role: 'Theoretical Physicist', era: 'Quantum Field Theory', nationality: 'American', years: '1918–1988',
      tagline: 'Reinvented quantum electrodynamics with diagrams and path integrals.',
      works: ['Feynman diagrams', 'Path integral formulation', 'The Feynman Lectures on Physics'],
      techniques: ['Developed the path-integral formulation of quantum mechanics', 'Invented Feynman diagrams for particle interactions', 'Co-created renormalised quantum electrodynamics'],
    },
    {
      id: 'hawking', name: 'Stephen Hawking', wikiSlug: 'Stephen_Hawking', hall: 'modern',
      role: 'Theoretical Physicist', era: 'Modern Cosmology', nationality: 'British', years: '1942–2018',
      tagline: 'Showed that black holes glow and eventually evaporate.',
      works: ['Hawking radiation', 'Penrose–Hawking singularity theorems', 'A Brief History of Time'],
      techniques: ['Predicted that black holes emit thermal radiation', 'Proved theorems on spacetime singularities', 'Bridged general relativity, thermodynamics and quantum theory'],
    },
  ],

  // ── Concepts (10) ───────────────────────────────────────────────────────────
  concepts: [
    { id: 'newton-laws', name: "Newton's Laws of Motion", blurb: 'Three laws linking force, mass and acceleration that govern everyday mechanics.', wikiSlug: "Newton's_laws_of_motion", tags: ['mechanics', 'classical'],
      deepDive: "Newton's first law defines inertia, the second (F = ma = dp/dt) makes force quantitative, and the third pairs every action with an equal and opposite reaction. Together they let a single set of equations predict projectiles, orbits and machines alike. They hold whenever speeds stay far below light and objects are larger than atoms, where relativity and quantum mechanics take over.",
      simulatorId: 'projectile', lawIds: ['newton-second', 'gravitation'], videoIds: ['kyQIGeArtGU', 'HEfHFsfGXjs'],
      evidence: [
        { label: 'Newton, Principia Mathematica (1687)', detail: 'Stated the three laws and universal gravitation, unifying terrestrial and celestial motion.', url: 'https://en.wikipedia.org/wiki/Philosophi%C3%A6_Naturalis_Principia_Mathematica', kind: 'document' },
        { label: "Galileo's inclined-plane experiments", detail: 'Showed bodies accelerate uniformly and independently of mass, foreshadowing inertia.', kind: 'experiment' },
        { label: 'Apollo 15 hammer–feather drop (1971)', detail: 'On the airless Moon a hammer and feather hit the ground together, confirming mass-independent free fall.', url: 'https://en.wikipedia.org/wiki/Galileo%27s_Leaning_Tower_of_Pisa_experiment', kind: 'observation' },
      ] },
    { id: 'conservation', name: 'Conservation Laws', blurb: 'Energy, momentum and charge are conserved — each tied by Noether to a symmetry.', wikiSlug: 'Conservation_law', tags: ['mechanics', 'symmetry'] },
    { id: 'thermodynamics', name: 'Laws of Thermodynamics', blurb: 'Rules governing heat, work, energy and the inexorable rise of entropy.', wikiSlug: 'Laws_of_thermodynamics', tags: ['thermodynamics', 'entropy'] },
    { id: 'entropy', name: 'Entropy', blurb: 'A measure of disorder and of the number of microscopic states available to a system.', wikiSlug: 'Entropy', tags: ['thermodynamics', 'statistical'],
      deepDive: 'Boltzmann showed that entropy counts the microscopic arrangements consistent with what we measure: S = k_B ln Ω. Systems drift toward macrostates with the most microstates, which is why heat flows from hot to cold and why the second law gives time a direction. Entropy links thermodynamics, statistical mechanics and even information theory.',
      lawIds: ['entropy', 'first-law-thermo'], videoIds: [],
      evidence: [
        { label: 'Carnot, Reflections on the Motive Power of Fire (1824)', detail: 'Set an upper limit on heat-engine efficiency, seeding the idea of irreversibility.', url: 'https://en.wikipedia.org/wiki/Nicolas_L%C3%A9onard_Sadi_Carnot', kind: 'document' },
        { label: "Clausius' formulation of the second law (1865)", detail: 'Coined "entropy" and stated that the entropy of an isolated system never decreases.', kind: 'document' },
        { label: "Boltzmann's S = k log W", detail: 'Gave entropy a microscopic, statistical meaning — the equation engraved on his gravestone.', url: 'https://en.wikipedia.org/wiki/Boltzmann%27s_entropy_formula', kind: 'proof' },
      ] },
    { id: 'electromagnetism', name: 'Electromagnetism', blurb: 'The unified theory of electric and magnetic fields, and of light itself.', wikiSlug: 'Electromagnetism', tags: ['electromagnetism', 'fields'],
      deepDive: "Maxwell's four equations fold electricity, magnetism and light into one field theory: a changing electric field makes a magnetic field and vice versa, and the self-sustaining result propagates at the speed of light. This predicted radio waves decades before they were used and revealed that light itself is an electromagnetic wave.",
      simulatorId: 'wave', lawIds: ['coulomb', 'gauss', 'faraday-induction'], videoIds: ['bHIhgxav9LY', '1TKSfAkWWN0'],
      evidence: [
        { label: "Ørsted's compass deflection (1820)", detail: 'A current-carrying wire deflects a compass needle, linking electricity to magnetism.', kind: 'experiment' },
        { label: "Faraday's induction ring (1831)", detail: 'A changing magnetic flux induces a current — the basis of generators and transformers.', url: 'https://en.wikipedia.org/wiki/Faraday%27s_law_of_induction', kind: 'experiment' },
        { label: 'Hertz detects radio waves (1887)', detail: 'Confirmed electromagnetic waves travelling at light speed, vindicating Maxwell.', url: 'https://en.wikipedia.org/wiki/Heinrich_Hertz', kind: 'experiment' },
      ] },
    { id: 'special-relativity', name: 'Special Relativity', blurb: 'Space and time are relative; the speed of light is the same for all observers.', wikiSlug: 'Special_relativity', tags: ['relativity', 'modern'],
      deepDive: 'From two postulates — the laws of physics are the same in every inertial frame, and light travels at c for everyone — Einstein derived time dilation, length contraction and the relativity of simultaneity. Mass and energy become interchangeable through E = mc². The theory is confirmed daily in particle accelerators and in cosmic-ray muons.',
      lawIds: ['mass-energy'], videoIds: ['1TKSfAkWWN0', 'Xo232kyTsO0'],
      evidence: [
        { label: 'Michelson–Morley experiment (1887)', detail: 'Found no ether wind, implying the speed of light is independent of motion.', url: 'https://en.wikipedia.org/wiki/Michelson%E2%80%93Morley_experiment', kind: 'experiment' },
        { label: 'Muon time dilation (Rossi–Hall 1941)', detail: 'Fast cosmic-ray muons reach the ground because their clocks run slow, as predicted.', url: 'https://en.wikipedia.org/wiki/Time_dilation_of_moving_particles', kind: 'experiment' },
        { label: 'Hafele–Keating experiment (1971)', detail: 'Atomic clocks flown around the world disagreed with ground clocks by the predicted amount.', url: 'https://en.wikipedia.org/wiki/Hafele%E2%80%93Keating_experiment', kind: 'experiment' },
      ] },
    { id: 'general-relativity', name: 'General Relativity', blurb: 'Gravity is the curvature of spacetime produced by mass and energy.', wikiSlug: 'General_relativity', tags: ['relativity', 'gravitation'],
      deepDive: 'Einstein recast gravity not as a force but as the curvature of spacetime: mass and energy bend the geometry, and objects follow the straightest available paths through it. The theory predicts light bending, the precession of Mercury, gravitational time dilation and gravitational waves — all since observed.',
      videoIds: ['iphcyNWFD10'],
      evidence: [
        { label: 'Eddington eclipse expedition (1919)', detail: 'Starlight bending around the Sun matched general relativity, not Newton, making Einstein famous.', url: 'https://en.wikipedia.org/wiki/Eddington_experiment', kind: 'observation' },
        { label: 'Perihelion precession of Mercury', detail: "The unexplained drift of Mercury's orbit is predicted exactly by general relativity.", kind: 'observation' },
        { label: 'LIGO detects gravitational waves (2015)', detail: 'Ripples from two merging black holes confirmed a century-old prediction.', url: 'https://en.wikipedia.org/wiki/First_observation_of_gravitational_waves', kind: 'observation' },
      ] },
    { id: 'quantum-mechanics', name: 'Quantum Mechanics', blurb: 'The probabilistic laws governing atoms, particles and light.', wikiSlug: 'Quantum_mechanics', tags: ['quantum', 'modern'],
      deepDive: 'Quantum mechanics replaces definite trajectories with a wavefunction whose evolution the Schrödinger equation governs and whose square gives probabilities. Energy, momentum and other quantities come in discrete quanta, and complementary properties obey the uncertainty principle. It is the most precisely tested theory in science, underpinning chemistry, lasers and semiconductors.',
      lawIds: ['schrodinger', 'uncertainty'], videoIds: ['p-MNSLsjjdo', 'a8LEyJU0auc'],
      evidence: [
        { label: 'Black-body radiation and Planck (1900)', detail: 'Quantising energy resolved the ultraviolet catastrophe, launching quantum theory.', url: 'https://en.wikipedia.org/wiki/Planck%27s_law', kind: 'experiment' },
        { label: 'Photoelectric effect (Einstein 1905)', detail: 'Light ejects electrons in a way explained only by photons of energy hf.', url: 'https://en.wikipedia.org/wiki/Photoelectric_effect', kind: 'experiment' },
        { label: 'Davisson–Germer experiment (1927)', detail: 'Electrons diffract like waves, confirming that matter has a wave nature.', url: 'https://en.wikipedia.org/wiki/Davisson%E2%80%93Germer_experiment', kind: 'experiment' },
      ] },
    { id: 'wave-particle', name: 'Wave–Particle Duality', blurb: 'Matter and light behave as both waves and particles depending on the experiment.', wikiSlug: 'Wave–particle_duality', tags: ['quantum'],
      deepDive: 'Light and matter each display wave behaviour (interference, diffraction) and particle behaviour (discrete, localised quanta) depending on how they are measured. The double-slit experiment is the canonical demonstration: single particles build up an interference pattern one detection at a time. Which face shows depends on the experiment, not on any hidden classical picture.',
      simulatorId: 'wave', videoIds: ['p-MNSLsjjdo'],
      evidence: [
        { label: "Young's double-slit experiment (1801)", detail: 'Interference fringes showed that light behaves as a wave.', url: 'https://en.wikipedia.org/wiki/Double-slit_experiment', kind: 'experiment' },
        { label: 'Photoelectric effect (1905)', detail: 'Light also acts as particles (photons) when it ejects electrons.', kind: 'experiment' },
        { label: 'Single-electron buildup (Tonomura 1989)', detail: 'Electrons sent one at a time slowly assemble an interference pattern.', url: 'https://en.wikipedia.org/wiki/Double-slit_experiment', kind: 'experiment' },
      ] },
    { id: 'standard-model', name: 'The Standard Model', blurb: 'The catalogue of fundamental particles and three of the four known forces.', wikiSlug: 'Standard_Model', tags: ['particle', 'modern'] },
  ],

  // ── Eras (7) ─────────────────────────────────────────────────────────────────
  eras: [
    {
      id: 'ancient', title: 'Ancient & Natural Philosophy', span: 'Antiquity–1500',
      essay: 'Long before experiment, thinkers from Aristotle to Archimedes and the Islamic Golden Age reasoned about motion, floating bodies, optics and the heavens. Their frameworks were often qualitative and sometimes wrong, but they framed the questions physics would later answer.',
      developments: ['Aristotelian physics of natural motion', "Archimedes' principle of buoyancy and levers", 'Alhazen’s experimental optics', 'Geocentric astronomy of Ptolemy'],
      turningPoints: ['Archimedes founds mathematical physics', 'Alhazen insists on experiment in the Book of Optics'],
    },
    {
      id: 'revolution', title: 'The Scientific Revolution', span: '1500–1700',
      essay: 'Copernicus, Galileo, Kepler and Newton replaced philosophical authority with observation and mathematics. Newton’s Principia unified terrestrial and celestial motion under a single law of gravitation, creating the template for all later physics.',
      developments: ['Copernican heliocentrism', 'Kepler’s laws of planetary motion', 'Galileo’s experiments on falling bodies', 'Newtonian mechanics and universal gravitation'],
      turningPoints: ['Galileo turns the telescope on the sky (1609)', 'Newton publishes the Principia (1687)'],
    },
    {
      id: 'enlightenment', title: 'Mechanics & Enlightenment', span: '1700–1820',
      essay: 'The 18th century refined Newtonian mechanics into the powerful analytical frameworks of Euler, Lagrange and Laplace, while early studies of heat, electricity and gases laid groundwork for the sciences to come.',
      developments: ['Lagrangian and Hamiltonian mechanics', 'Euler’s equations of fluid and rigid-body motion', 'Early electrostatics (Coulomb, Franklin)', 'Gas laws of Boyle and Charles'],
      turningPoints: ['Lagrange reformulates mechanics analytically (1788)', 'Coulomb quantifies the electric force (1785)'],
    },
    {
      id: 'classical-fields', title: 'Fields, Heat & Light', span: '1820–1900',
      essay: 'The 19th century unified vast territories: thermodynamics tamed heat and energy, Faraday and Maxwell wove electricity, magnetism and light into a single field theory, and Boltzmann grounded thermodynamics in statistics.',
      developments: ['Laws of thermodynamics and the concept of energy', "Faraday's electromagnetic induction", "Maxwell's electromagnetic theory of light", 'Statistical mechanics and the kinetic theory of gases'],
      turningPoints: ['Maxwell unifies electromagnetism (1865)', 'The second law and entropy are formalised'],
    },
    {
      id: 'quantum-relativity', title: 'Quantum & Relativity Revolutions', span: '1900–1930',
      essay: 'In three decades the classical worldview shattered. Planck and Einstein quantised energy and light; Einstein made space and time relative and gravity geometric; and Bohr, Heisenberg, Schrödinger and Dirac built the strange, probabilistic edifice of quantum mechanics.',
      developments: ['Planck’s quantum hypothesis', 'Special and general relativity', 'Bohr’s atomic model', 'Matrix and wave mechanics; the Dirac equation'],
      turningPoints: ['Planck introduces the quantum (1900)', 'Einstein publishes general relativity (1915)', 'Quantum mechanics is formalised (1925–1927)'],
    },
    {
      id: 'nuclear-particle', title: 'Nuclear & Particle Age', span: '1930–1970',
      essay: 'Physicists probed the nucleus and its energies, discovered antimatter and a zoo of particles, and forged quantum field theory. The era transformed both fundamental science and geopolitics, from fission to the first accelerators.',
      developments: ['Nuclear fission and fusion', 'Quantum electrodynamics', 'Particle accelerators and the particle zoo', 'The emerging Standard Model'],
      turningPoints: ['Discovery of nuclear fission (1938)', 'Renormalised QED (late 1940s)', 'Quark model proposed (1964)'],
    },
    {
      id: 'modern', title: 'Cosmology & the Modern Frontier', span: '1970–present',
      essay: 'The Standard Model was confirmed particle by particle, culminating in the Higgs boson; cosmology matured with the Big Bang, dark matter and dark energy; and gravitational waves and black-hole imaging opened new windows on the universe.',
      developments: ['Confirmation of the Standard Model', 'Discovery of dark matter and dark energy', 'Direct detection of gravitational waves', 'Imaging of a black-hole shadow'],
      turningPoints: ['Higgs boson observed at the LHC (2012)', 'LIGO detects gravitational waves (2015)', 'Event Horizon Telescope image (2019)'],
    },
  ],

  // ── Laws (15) ────────────────────────────────────────────────────────────────
  laws: [
    {
      id: 'newton-second', category: 'Mechanics', name: "Newton's Second Law",
      latex: '\\vec{F} = m\\vec{a} = \\frac{d\\vec{p}}{dt}',
      variables: [
        { sym: 'F', name: 'Net force', unit: 'N' },
        { sym: 'm', name: 'Mass', unit: 'kg' },
        { sym: 'a', name: 'Acceleration', unit: 'm/s²' },
        { sym: 'p', name: 'Momentum', unit: 'kg·m/s' },
      ],
      description: 'The net force on a body equals the rate of change of its momentum; for constant mass, force is mass times acceleration.',
      reference: "https://en.wikipedia.org/wiki/Newton's_laws_of_motion",
    },
    {
      id: 'gravitation', category: 'Gravitation', name: 'Universal Gravitation',
      latex: 'F = G\\frac{m_1 m_2}{r^2}',
      variables: [
        { sym: 'F', name: 'Gravitational force', unit: 'N' },
        { sym: 'G', name: 'Gravitational constant', unit: 'N·m²/kg²' },
        { sym: 'm_1, m_2', name: 'Masses', unit: 'kg' },
        { sym: 'r', name: 'Separation', unit: 'm' },
      ],
      description: 'Every pair of masses attracts along the line joining them with a force proportional to the product of their masses and inversely to the square of their distance.',
      reference: "https://en.wikipedia.org/wiki/Newton's_law_of_universal_gravitation",
    },
    {
      id: 'kinetic-energy', category: 'Mechanics', name: 'Kinetic Energy',
      latex: 'E_k = \\tfrac{1}{2} m v^2',
      variables: [
        { sym: 'E_k', name: 'Kinetic energy', unit: 'J' },
        { sym: 'm', name: 'Mass', unit: 'kg' },
        { sym: 'v', name: 'Speed', unit: 'm/s' },
      ],
      description: 'The energy a body possesses by virtue of its motion.',
      reference: 'https://en.wikipedia.org/wiki/Kinetic_energy',
    },
    {
      id: 'hookes-law', category: 'Mechanics', name: "Hooke's Law",
      latex: 'F = -k x',
      variables: [
        { sym: 'F', name: 'Restoring force', unit: 'N' },
        { sym: 'k', name: 'Spring constant', unit: 'N/m' },
        { sym: 'x', name: 'Displacement', unit: 'm' },
      ],
      description: 'The restoring force of an ideal spring is proportional and opposite to its displacement — the basis of simple harmonic motion.',
      reference: "https://en.wikipedia.org/wiki/Hooke's_law",
    },
    {
      id: 'pendulum', category: 'Oscillations', name: 'Simple Pendulum Period',
      latex: 'T = 2\\pi \\sqrt{\\frac{L}{g}}',
      variables: [
        { sym: 'T', name: 'Period', unit: 's' },
        { sym: 'L', name: 'Length', unit: 'm' },
        { sym: 'g', name: 'Gravitational acceleration', unit: 'm/s²' },
      ],
      description: 'For small swings, a pendulum’s period depends only on its length and gravity, not on its amplitude or mass.',
      reference: 'https://en.wikipedia.org/wiki/Pendulum',
    },
    {
      id: 'wave-speed', category: 'Waves', name: 'Wave Relation',
      latex: 'v = f\\lambda',
      variables: [
        { sym: 'v', name: 'Wave speed', unit: 'm/s' },
        { sym: 'f', name: 'Frequency', unit: 'Hz' },
        { sym: '\\lambda', name: 'Wavelength', unit: 'm' },
      ],
      description: 'The speed of any periodic wave equals its frequency times its wavelength.',
      reference: 'https://en.wikipedia.org/wiki/Wavelength',
    },
    {
      id: 'first-law-thermo', category: 'Thermodynamics', name: 'First Law of Thermodynamics',
      latex: '\\Delta U = Q - W',
      variables: [
        { sym: '\\Delta U', name: 'Change in internal energy', unit: 'J' },
        { sym: 'Q', name: 'Heat added to system', unit: 'J' },
        { sym: 'W', name: 'Work done by system', unit: 'J' },
      ],
      description: 'Energy is conserved: the change in a system’s internal energy equals heat added minus work done by the system.',
      reference: 'https://en.wikipedia.org/wiki/First_law_of_thermodynamics',
    },
    {
      id: 'entropy', category: 'Thermodynamics', name: 'Boltzmann Entropy',
      latex: 'S = k_B \\ln \\Omega',
      variables: [
        { sym: 'S', name: 'Entropy', unit: 'J/K' },
        { sym: 'k_B', name: 'Boltzmann constant', unit: 'J/K' },
        { sym: '\\Omega', name: 'Number of microstates' },
      ],
      description: 'Entropy is proportional to the logarithm of the number of microscopic configurations consistent with a macrostate.',
      reference: 'https://en.wikipedia.org/wiki/Boltzmann%27s_entropy_formula',
    },
    {
      id: 'ideal-gas', category: 'Thermodynamics', name: 'Ideal Gas Law',
      latex: 'PV = nRT',
      variables: [
        { sym: 'P', name: 'Pressure', unit: 'Pa' },
        { sym: 'V', name: 'Volume', unit: 'm³' },
        { sym: 'n', name: 'Amount of substance', unit: 'mol' },
        { sym: 'R', name: 'Gas constant', unit: 'J/(mol·K)' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
      ],
      description: 'Relates pressure, volume, temperature and amount for an ideal gas.',
      reference: 'https://en.wikipedia.org/wiki/Ideal_gas_law',
    },
    {
      id: 'coulomb', category: 'Electromagnetism', name: "Coulomb's Law",
      latex: 'F = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_1 q_2}{r^2}',
      variables: [
        { sym: 'F', name: 'Electrostatic force', unit: 'N' },
        { sym: 'q_1, q_2', name: 'Charges', unit: 'C' },
        { sym: 'r', name: 'Separation', unit: 'm' },
        { sym: '\\varepsilon_0', name: 'Vacuum permittivity', unit: 'F/m' },
      ],
      description: 'The force between two point charges is proportional to their product and inversely to the square of their separation.',
      reference: "https://en.wikipedia.org/wiki/Coulomb's_law",
    },
    {
      id: 'gauss', category: 'Electromagnetism', name: "Gauss's Law",
      latex: '\\oint \\vec{E} \\cdot d\\vec{A} = \\frac{Q_{enc}}{\\varepsilon_0}',
      variables: [
        { sym: 'E', name: 'Electric field', unit: 'V/m' },
        { sym: 'Q_{enc}', name: 'Enclosed charge', unit: 'C' },
        { sym: '\\varepsilon_0', name: 'Vacuum permittivity', unit: 'F/m' },
      ],
      description: 'The electric flux through a closed surface is proportional to the charge enclosed — one of Maxwell’s equations.',
      reference: "https://en.wikipedia.org/wiki/Gauss's_law",
    },
    {
      id: 'faraday-induction', category: 'Electromagnetism', name: "Faraday's Law of Induction",
      latex: '\\varepsilon = -\\frac{d\\Phi_B}{dt}',
      variables: [
        { sym: '\\varepsilon', name: 'Induced EMF', unit: 'V' },
        { sym: '\\Phi_B', name: 'Magnetic flux', unit: 'Wb' },
      ],
      description: 'A changing magnetic flux through a circuit induces an electromotive force opposing the change.',
      reference: "https://en.wikipedia.org/wiki/Faraday's_law_of_induction",
    },
    {
      id: 'mass-energy', category: 'Relativity', name: 'Mass–Energy Equivalence',
      latex: 'E = mc^2',
      variables: [
        { sym: 'E', name: 'Energy', unit: 'J' },
        { sym: 'm', name: 'Mass', unit: 'kg' },
        { sym: 'c', name: 'Speed of light', unit: 'm/s' },
      ],
      description: 'Mass and energy are equivalent; a small mass corresponds to an enormous energy.',
      reference: 'https://en.wikipedia.org/wiki/Mass%E2%80%93energy_equivalence',
    },
    {
      id: 'schrodinger', category: 'Quantum', name: 'Schrödinger Equation',
      latex: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi',
      variables: [
        { sym: '\\Psi', name: 'Wavefunction' },
        { sym: '\\hbar', name: 'Reduced Planck constant', unit: 'J·s' },
        { sym: '\\hat{H}', name: 'Hamiltonian operator' },
      ],
      description: 'Governs how the quantum wavefunction of a system evolves in time.',
      reference: 'https://en.wikipedia.org/wiki/Schr%C3%B6dinger_equation',
    },
    {
      id: 'uncertainty', category: 'Quantum', name: 'Heisenberg Uncertainty Principle',
      latex: '\\Delta x \\, \\Delta p \\ge \\frac{\\hbar}{2}',
      variables: [
        { sym: '\\Delta x', name: 'Position uncertainty', unit: 'm' },
        { sym: '\\Delta p', name: 'Momentum uncertainty', unit: 'kg·m/s' },
        { sym: '\\hbar', name: 'Reduced Planck constant', unit: 'J·s' },
      ],
      description: 'Position and momentum cannot both be known to arbitrary precision; their uncertainties have a fundamental lower bound.',
      reference: 'https://en.wikipedia.org/wiki/Uncertainty_principle',
    },
  ],

  // ── Tools (12) ───────────────────────────────────────────────────────────────
  tools: [
    { name: 'PhET Interactive Simulations', org: 'University of Colorado Boulder', url: 'https://phet.colorado.edu/', desc: 'Free interactive physics and math simulations for teaching and self-study.', kind: 'software', access: 'Open' },
    { name: 'Wolfram Alpha', org: 'Wolfram Research', url: 'https://www.wolframalpha.com/', desc: 'Computational knowledge engine for solving equations and physical quantities.', kind: 'software', access: 'Freemium' },
    { name: 'CERN Open Data Portal', org: 'CERN', url: 'https://opendata.cern.ch/', desc: 'Real collision datasets and analysis tools from the LHC experiments.', kind: 'dataset', access: 'Open' },
    { name: 'arXiv', org: 'Cornell University', url: 'https://arxiv.org/', desc: 'Open-access preprint archive for physics, math and quantitative sciences.', kind: 'dataset', access: 'Open' },
    { name: 'SymPy', org: 'SymPy Development Team', url: 'https://www.sympy.org/', desc: 'Open-source Python library for symbolic mathematics and physics.', kind: 'software', access: 'Open' },
    { name: 'GeoGebra', org: 'GeoGebra', url: 'https://www.geogebra.org/', desc: 'Free dynamic mathematics and physics visualisation software.', kind: 'software', access: 'Open' },
    { name: 'NASA/IPAC Extragalactic Database', org: 'NASA / IPAC', url: 'https://ned.ipac.caltech.edu/', desc: 'Comprehensive database of extragalactic objects for astrophysics research.', kind: 'dataset', access: 'Open' },
    { name: 'NIST Physical Reference Data', org: 'NIST', url: 'https://www.nist.gov/pml/productsservices/physical-reference-data', desc: 'Authoritative values for physical constants, atomic and nuclear data.', kind: 'dataset', access: 'Open' },
    { name: 'AstroPy', org: 'Astropy Project', url: 'https://www.astropy.org/', desc: 'Community Python package for astronomy and astrophysics computation.', kind: 'software', access: 'Open' },
    { name: 'Desmos Graphing Calculator', org: 'Desmos', url: 'https://www.desmos.com/calculator', desc: 'Free browser graphing calculator for plotting functions and data.', kind: 'software', access: 'Open' },
    { name: 'ROOT Data Analysis Framework', org: 'CERN', url: 'https://root.cern/', desc: 'Framework for large-scale data analysis used across particle physics.', kind: 'software', access: 'Open' },
    { name: 'SDSS SkyServer', org: 'Sloan Digital Sky Survey', url: 'https://skyserver.sdss.org/', desc: 'Open access to imaging and spectra of hundreds of millions of celestial objects.', kind: 'dataset', access: 'Open' },
  ],

  // ── Videos (14) ──────────────────────────────────────────────────────────────
  videos: [
    { id: 'ZihywtixUYo', title: 'The Map of Physics', channel: 'Domain of Science', topic: 'Foundations', blurb: 'A single animated map of every branch of physics and how they connect.', query: 'The Map of Physics Domain of Science' },
    { id: 'bHIhgxav9LY', title: 'The Big Misconception About Electricity', channel: 'Veritasium', topic: 'Foundations', blurb: 'Energy travels in the fields around a wire, not through the drifting electrons.', query: 'The Big Misconception About Electricity Veritasium' },
    { id: 'kyQIGeArtGU', title: "Newton's Laws: Crash Course Physics #5", channel: 'CrashCourse', topic: 'Foundations', blurb: 'Force, mass and acceleration explained through the three laws of motion.', query: "Newton's Laws Crash Course Physics 5" },
    { id: 'HEfHFsfGXjs', title: 'The most unexpected answer to a counting puzzle', channel: '3Blue1Brown', topic: 'Foundations', blurb: 'Colliding blocks compute the digits of pi through pure conservation of momentum and energy.', query: 'The most unexpected answer to a counting puzzle 3Blue1Brown' },
    { id: 'kTXTPe3wahc', title: "Parallel Worlds Probably Exist. Here's Why", channel: 'Veritasium', topic: 'Quantum', blurb: 'A tour of the many-worlds interpretation of quantum mechanics.', query: "Parallel Worlds Probably Exist Here's Why Veritasium" },
    { id: 'p-MNSLsjjdo', title: 'The Quantum Experiment that Broke Reality', channel: 'PBS Space Time', topic: 'Quantum', blurb: 'The double-slit experiment and what it reveals about measurement.', query: 'The Quantum Experiment that Broke Reality PBS Space Time' },
    { id: 'a8LEyJU0auc', title: 'The Uncertainty Principle', channel: 'MinutePhysics', topic: 'Quantum', blurb: 'Why position and momentum can never both be pinned down at once.', query: 'The Uncertainty Principle MinutePhysics' },
    { id: 'Xo232kyTsO0', title: 'The Real Meaning of E=mc²', channel: 'Veritasium', topic: 'Relativity', blurb: 'What mass–energy equivalence actually says about matter and energy.', query: 'The Real Meaning of E=mc2 Veritasium' },
    { id: '1TKSfAkWWN0', title: 'How Special Relativity Makes Magnets Work', channel: 'Veritasium', topic: 'Relativity', blurb: 'Magnetism is electrostatics seen through relativistic length contraction.', query: 'How Special Relativity Makes Magnets Work Veritasium' },
    { id: 'iphcyNWFD10', title: 'The Absurdity of Detecting Gravitational Waves', channel: 'Veritasium', topic: 'Relativity', blurb: 'How LIGO measures a spacetime ripple thousands of times smaller than a proton.', query: 'The Absurdity of Detecting Gravitational Waves Veritasium' },
    { id: 'e-P5IFTqB98', title: 'Black Holes Explained – From Birth to Death', channel: 'Kurzgesagt – In a Nutshell', topic: 'Cosmos', blurb: 'How stars collapse into black holes and what happens near the horizon.', query: 'Black Holes Explained From Birth to Death Kurzgesagt' },
    { id: 'wNDGgL73ihY', title: 'The Higgs Mechanism Explained', channel: 'PBS Space Time', topic: 'Cosmos', blurb: 'How the Higgs field gives fundamental particles their mass.', query: 'The Higgs Mechanism Explained PBS Space Time' },
    { id: 'msVuCEs8Ydo', title: 'Your Mass is NOT From the Higgs Boson', channel: 'PBS Space Time', topic: 'Cosmos', blurb: 'Most of your mass comes from binding energy, not the Higgs field.', query: 'Your Mass is NOT From the Higgs Boson PBS Space Time' },
    { id: 'zcqZHYo7ONs', title: 'The Standard Model', channel: 'PBS Space Time', topic: 'Cosmos', blurb: 'The catalogue of fundamental particles and the forces between them.', query: 'The Standard Model PBS Space Time' },
  ],
};

export default DATA;
