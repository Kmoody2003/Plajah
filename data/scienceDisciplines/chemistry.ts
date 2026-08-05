// ─────────────────────────────────────────────────────────────────────────────
// Chemistry discipline data — the seed for the Plajah Academia / Labs Chemistry
// studio. Accuracy-first: every figure carries a real Wikipedia slug, every
// law's `latex` is verified KaTeX, and every tool is a real, free/open resource.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'chemistry',
  label: 'Chemistry',
  icon: 'FlaskConical',
  accent: '#06D6A0',
  accent2: '#04A57D',
  tagline: 'The science of matter, its transformations, and the bonds that hold the world together.',
  heroBlurb:
    'Chemistry turns the invisible dance of atoms into medicines, materials and life itself. Meet the pioneers who tamed the elements, learn the laws of reaction and equilibrium, and experiment with real molecular tools.',
  openStaxSubject: 'chemistry',
  arXivCategory: 'chem-ph',
  arXivQuery: 'molecular synthesis reaction',
  simulators: ['ideal-gas', 'ph-titration'],

  // ── Figure halls ───────────────────────────────────────────────────────────
  figureHalls: [
    { id: 'foundational', label: 'Foundations', blurb: 'From alchemy to the birth of modern chemistry — the founders of elements, gases and conservation of mass.' },
    { id: 'periodic', label: 'The Periodic Age', blurb: 'Those who ordered the elements and uncovered atomic structure.' },
    { id: 'physical', label: 'Physical & Analytical', blurb: 'Thermodynamics, kinetics, spectroscopy and the quantitative science of reactions.' },
    { id: 'organic-bio', label: 'Organic & Biochemistry', blurb: 'The chemistry of carbon, synthesis and the molecules of life.' },
  ],

  // ── Figures (15) ────────────────────────────────────────────────────────────
  figures: [
    {
      id: 'lavoisier', name: 'Antoine Lavoisier', wikiSlug: 'Antoine_Lavoisier', hall: 'foundational',
      role: 'Chemist', era: 'Chemical Revolution', nationality: 'French', years: '1743–1794',
      tagline: 'Father of modern chemistry; established conservation of mass.',
      works: ['Traité élémentaire de chimie', 'Law of conservation of mass', 'Oxygen theory of combustion'],
      techniques: ['Overturned the phlogiston theory of combustion', 'Demonstrated that mass is conserved in reactions', 'Helped devise systematic chemical nomenclature'],
    },
    {
      id: 'boyle', name: 'Robert Boyle', wikiSlug: 'Robert_Boyle', hall: 'foundational',
      role: 'Chemist & Physicist', era: 'Scientific Revolution', nationality: 'Anglo-Irish', years: '1627–1691',
      tagline: 'Founder of modern experimental chemistry.',
      works: ['The Sceptical Chymist', "Boyle's law"],
      techniques: ['Distinguished chemical elements from compounds and mixtures', 'Established the pressure–volume relation for gases', 'Championed rigorous, repeatable experiment'],
    },
    {
      id: 'dalton', name: 'John Dalton', wikiSlug: 'John_Dalton', hall: 'foundational',
      role: 'Chemist', era: 'Atomic Theory', nationality: 'English', years: '1766–1844',
      tagline: 'Founder of modern atomic theory.',
      works: ['A New System of Chemical Philosophy', 'Law of multiple proportions'],
      techniques: ['Proposed that elements are made of indivisible atoms', 'Assigned relative atomic weights', 'Formulated the law of multiple proportions'],
    },
    {
      id: 'priestley', name: 'Joseph Priestley', wikiSlug: 'Joseph_Priestley', hall: 'foundational',
      role: 'Chemist & Theologian', era: 'Chemical Revolution', nationality: 'English', years: '1733–1804',
      tagline: 'Discoverer of oxygen and several other gases.',
      works: ['Experiments and Observations on Different Kinds of Air', 'Isolation of oxygen'],
      techniques: ['Isolated oxygen, ammonia and several other gases', 'Invented soda water', 'Advanced the study of "airs" (gases)'],
    },
    {
      id: 'mendeleev', name: 'Dmitri Mendeleev', wikiSlug: 'Dmitri_Mendeleev', hall: 'periodic',
      role: 'Chemist', era: 'Periodic Law', nationality: 'Russian', years: '1834–1907',
      tagline: 'Created the periodic table and predicted undiscovered elements.',
      works: ['Principles of Chemistry', 'Periodic table of the elements'],
      techniques: ['Arranged elements by atomic weight and property periodicity', 'Left gaps and predicted elements later discovered', 'Formulated the periodic law'],
    },
    {
      id: 'curie', name: 'Marie Curie', wikiSlug: 'Marie_Curie', hall: 'periodic',
      role: 'Physicist & Chemist', era: 'Radiochemistry', nationality: 'Polish-French', years: '1867–1934',
      tagline: 'Pioneer of radioactivity; discovered polonium and radium.',
      works: ['Discovery of polonium and radium', 'Theory of radioactivity'],
      techniques: ['Isolated radioactive elements from pitchblende', 'Developed methods to measure radioactivity', 'Won Nobel Prizes in both Physics and Chemistry'],
    },
    {
      id: 'ramsay', name: 'William Ramsay', wikiSlug: 'William_Ramsay', hall: 'periodic',
      role: 'Chemist', era: 'Periodic Age', nationality: 'Scottish', years: '1852–1916',
      tagline: 'Discovered the noble gases and added a whole column to the table.',
      works: ['Discovery of argon, neon, krypton and xenon', 'Isolation of helium on Earth'],
      techniques: ['Discovered an entire new group of elements', 'Characterised the chemically inert noble gases', 'Refined methods of gas fractionation'],
    },
    {
      id: 'arrhenius', name: 'Svante Arrhenius', wikiSlug: 'Svante_Arrhenius', hall: 'physical',
      role: 'Physical Chemist', era: 'Physical Chemistry', nationality: 'Swedish', years: '1859–1927',
      tagline: 'Founded ionic dissociation theory and reaction-rate kinetics.',
      works: ['Theory of electrolytic dissociation', 'Arrhenius equation', 'Arrhenius definition of acids and bases'],
      techniques: ['Explained how salts dissociate into ions in solution', 'Quantified how temperature governs reaction rates', 'Predicted the greenhouse effect of carbon dioxide'],
    },
    {
      id: 'gibbs', name: 'Josiah Willard Gibbs', wikiSlug: 'Josiah_Willard_Gibbs', hall: 'physical',
      role: 'Physical Chemist', era: 'Chemical Thermodynamics', nationality: 'American', years: '1839–1903',
      tagline: 'Founder of chemical thermodynamics and free energy.',
      works: ['On the Equilibrium of Heterogeneous Substances', 'Gibbs free energy', 'Phase rule'],
      techniques: ['Defined free energy governing spontaneity and equilibrium', 'Formulated the phase rule for multi-component systems', 'Founded statistical mechanics with Boltzmann'],
    },
    {
      id: 'nernst', name: 'Walther Nernst', wikiSlug: 'Walther_Nernst', hall: 'physical',
      role: 'Physical Chemist', era: 'Physical Chemistry', nationality: 'German', years: '1864–1941',
      tagline: 'Author of the third law of thermodynamics and the Nernst equation.',
      works: ['Nernst heat theorem (third law)', 'Nernst equation of electrochemistry'],
      techniques: ['Related cell potential to concentration', 'Established the third law of thermodynamics', 'Advanced electrochemistry and low-temperature physics'],
    },
    {
      id: 'pauling', name: 'Linus Pauling', wikiSlug: 'Linus_Pauling', hall: 'physical',
      role: 'Chemist', era: 'Quantum Chemistry', nationality: 'American', years: '1901–1994',
      tagline: 'Explained the chemical bond through quantum mechanics.',
      works: ['The Nature of the Chemical Bond', 'Electronegativity scale', 'Theory of hybrid orbitals'],
      techniques: ['Applied quantum mechanics to chemical bonding', 'Introduced electronegativity and resonance', 'Advanced molecular structure and protein chemistry'],
    },
    {
      id: 'kekule', name: 'August Kekulé', wikiSlug: 'August_Kekul%C3%A9', hall: 'organic-bio',
      role: 'Organic Chemist', era: 'Structural Theory', nationality: 'German', years: '1829–1896',
      tagline: 'Founder of structural theory; deduced the benzene ring.',
      works: ['Theory of chemical structure', 'Benzene ring structure'],
      techniques: ['Established that carbon is tetravalent and forms chains', 'Proposed the cyclic structure of benzene', 'Founded modern structural organic chemistry'],
    },
    {
      id: 'wohler', name: 'Friedrich Wöhler', wikiSlug: 'Friedrich_W%C3%B6hler', hall: 'organic-bio',
      role: 'Chemist', era: 'Early Organic Chemistry', nationality: 'German', years: '1800–1882',
      tagline: 'Synthesised urea, dissolving the vitalist divide.',
      works: ['Wöhler synthesis of urea', 'Isolation of aluminium and beryllium'],
      techniques: ['Made an organic compound from inorganic starting materials', 'Undermined vitalism, uniting organic and inorganic chemistry', 'Isolated several elements for the first time'],
    },
    {
      id: 'hodgkin', name: 'Dorothy Hodgkin', wikiSlug: 'Dorothy_Hodgkin', hall: 'organic-bio',
      role: 'Biochemist & Crystallographer', era: 'Structural Biochemistry', nationality: 'British', years: '1910–1994',
      tagline: 'Revealed the structures of penicillin, vitamin B12 and insulin.',
      works: ['Structure of penicillin', 'Structure of vitamin B12', 'Structure of insulin'],
      techniques: ['Advanced X-ray crystallography of complex biomolecules', 'Determined the 3-D structure of vital medicines', 'Pioneered protein structural analysis'],
    },
    {
      id: 'carothers', name: 'Wallace Carothers', wikiSlug: 'Wallace_Carothers', hall: 'organic-bio',
      role: 'Organic Chemist', era: 'Polymer Chemistry', nationality: 'American', years: '1896–1937',
      tagline: 'Inventor of nylon and neoprene; founder of polymer science.',
      works: ['Invention of nylon', 'Invention of neoprene', 'Foundations of polymer chemistry'],
      techniques: ['Established that polymers are long covalent chains', 'Developed the first synthetic fibres', 'Pioneered condensation polymerisation'],
    },
  ],

  // ── Concepts (10) ───────────────────────────────────────────────────────────
  concepts: [
    { id: 'atomic-theory', name: 'Atomic Theory', blurb: 'All matter is composed of atoms that combine in fixed ratios to form compounds.', wikiSlug: 'Atomic_theory', tags: ['foundations', 'structure'],
      deepDive: "Dalton revived the atom as a quantitative idea: elements are made of identical atoms that combine in small whole-number ratios, explaining the laws of definite and multiple proportions. A century later Thomson, Rutherford and Bohr resolved the atom's internal structure of electrons, a dense nucleus and quantised energy levels. Atomic theory is the foundation on which all of chemistry is built.",
      lawIds: ['conservation-mass', 'moles'], videoIds: ['FSyAehMdpyI', 'BxUS1K7xu30'],
      evidence: [
        { label: "Dalton's law of multiple proportions (1803)", detail: 'Elements combine in ratios of small whole numbers, implying discrete atoms.', url: 'https://en.wikipedia.org/wiki/Law_of_multiple_proportions', kind: 'observation' },
        { label: 'Brownian motion explained (Einstein 1905, Perrin 1908)', detail: "The jitter of suspended grains gave the first direct measure of atoms and Avogadro's number.", url: 'https://en.wikipedia.org/wiki/Brownian_motion', kind: 'experiment' },
        { label: 'Rutherford gold-foil experiment (1911)', detail: "Alpha-particle scattering revealed the tiny dense nucleus at the atom's core.", url: 'https://en.wikipedia.org/wiki/Geiger%E2%80%93Marsden_experiments', kind: 'experiment' },
      ] },
    { id: 'periodic-table', name: 'The Periodic Table', blurb: 'Elements arranged by atomic number reveal repeating patterns of chemical behaviour.', wikiSlug: 'Periodic_table', tags: ['periodicity', 'elements'],
      deepDive: "Mendeleev arranged the elements by weight and property and boldly left gaps for elements not yet discovered. When gallium, scandium and germanium turned up with the properties he foretold, the periodic law was vindicated. Moseley later showed the true ordering principle is atomic number — the proton count — and quantum mechanics explained the periods as filling electron shells.",
      videoIds: ['MFWv_kZQVy4'],
      evidence: [
        { label: "Mendeleev's predictions confirmed (1875–1886)", detail: 'Gallium, scandium and germanium were found with the properties he foretold for empty gaps.', url: 'https://en.wikipedia.org/wiki/Dmitri_Mendeleev', kind: 'observation' },
        { label: "Moseley's X-ray law (1913)", detail: 'X-ray spectra proved elements are ordered by atomic number, not atomic weight.', url: 'https://en.wikipedia.org/wiki/Henry_Moseley', kind: 'experiment' },
        { label: 'Discovery of the noble gases (1894–1898)', detail: 'Ramsay and Rayleigh added an entire new column of inert elements to the table.', kind: 'experiment' },
      ] },
    { id: 'chemical-bond', name: 'Chemical Bonding', blurb: 'Ionic, covalent and metallic bonds arise from how atoms share or transfer electrons.', wikiSlug: 'Chemical_bond', tags: ['bonding', 'structure'],
      deepDive: "Lewis pictured covalent bonds as shared electron pairs, and Pauling used quantum mechanics to explain their strength and direction, introducing hybrid orbitals and the electronegativity scale to predict polarity. Whether electrons are transferred (ionic), shared (covalent) or pooled (metallic) determines almost every physical and chemical property of a substance.",
      videoIds: ['MFWv_kZQVy4'],
      evidence: [
        { label: "Lewis's electron-pair bond (1916)", detail: 'Proposed shared pairs of electrons as the basis of the covalent bond.', url: 'https://en.wikipedia.org/wiki/Lewis_structure', kind: 'document' },
        { label: 'Pauling, The Nature of the Chemical Bond (1939)', detail: 'Applied quantum mechanics to bonding and defined the electronegativity scale.', url: 'https://en.wikipedia.org/wiki/The_Nature_of_the_Chemical_Bond', kind: 'document' },
        { label: 'X-ray crystallography of bond lengths', detail: 'Diffraction measured real bond lengths and angles, confirming bonding models.', kind: 'experiment' },
      ] },
    { id: 'stoichiometry', name: 'Stoichiometry', blurb: 'The quantitative accounting of reactants and products, rooted in conservation of mass.', wikiSlug: 'Stoichiometry', tags: ['reactions', 'quantitative'],
      deepDive: "Because mass and atoms are conserved, a balanced equation fixes the exact mole ratios in which substances react and form. Stoichiometry converts between mass, moles and particle counts through molar mass and Avogadro's number, letting chemists predict yields and scale a reaction from a test tube to a factory.",
      lawIds: ['conservation-mass', 'moles'], videoIds: ['nwiFxlBWLmg'],
      evidence: [
        { label: "Lavoisier's combustion mass balance (1770s)", detail: 'Careful weighing showed total mass is unchanged by a chemical reaction.', url: 'https://en.wikipedia.org/wiki/Conservation_of_mass', kind: 'experiment' },
        { label: "Proust's law of definite proportions (1799)", detail: 'A compound always contains its elements in the same fixed mass ratio.', url: 'https://en.wikipedia.org/wiki/Law_of_definite_proportions', kind: 'observation' },
        { label: "Dalton's law of multiple proportions (1803)", detail: 'Whole-number mass ratios between compounds pointed to discrete atoms.', kind: 'observation' },
      ] },
    { id: 'thermochemistry', name: 'Thermochemistry', blurb: 'The heat absorbed or released as chemical bonds break and form.', wikiSlug: 'Thermochemistry', tags: ['thermodynamics', 'energy'] },
    { id: 'equilibrium', name: 'Chemical Equilibrium', blurb: 'Reversible reactions settle into a dynamic balance described by an equilibrium constant.', wikiSlug: 'Chemical_equilibrium', tags: ['equilibrium', 'kinetics'],
      deepDive: "In a reversible reaction the forward and reverse rates eventually match, leaving concentrations constant even though molecules keep reacting. The equilibrium constant K captures that balance, and Le Chatelier's principle predicts how changes in concentration, pressure or temperature shift it. Manipulating equilibrium is how the Haber process fixes nitrogen to feed billions.",
      lawIds: ['equilibrium-constant', 'gibbs-equilibrium'], videoIds: [],
      evidence: [
        { label: 'Guldberg–Waage law of mass action (1864)', detail: 'Reaction rate depends on the product of reactant concentrations, defining equilibrium.', url: 'https://en.wikipedia.org/wiki/Law_of_mass_action', kind: 'document' },
        { label: "Le Chatelier's principle (1884)", detail: 'A system at equilibrium shifts so as to oppose an imposed change.', url: 'https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle', kind: 'document' },
        { label: 'The Haber–Bosch process (1909–1913)', detail: 'Industrial ammonia synthesis exploits equilibrium shifts under pressure and temperature.', url: 'https://en.wikipedia.org/wiki/Haber_process', kind: 'observation' },
      ] },
    { id: 'acid-base', name: 'Acids and Bases', blurb: 'Proton donors and acceptors, quantified by pH and the Brønsted–Lowry theory.', wikiSlug: 'Acid%E2%80%93base_reaction', tags: ['equilibrium', 'analytical'],
      deepDive: "Arrhenius saw acids and bases as producers of H+ and OH- ions; Brønsted and Lowry generalised them to proton donors and acceptors, and Lewis to electron-pair acceptors and donors. The pH scale measures hydrogen-ion concentration logarithmically, and buffers described by the Henderson–Hasselbalch equation hold pH steady — essential to blood, oceans and industry.",
      simulatorId: 'ph-titration', lawIds: ['ph', 'henderson'], videoIds: ['yQP4UJhNn0I'],
      evidence: [
        { label: "Arrhenius's ionic dissociation theory (1884)", detail: 'Explained acids and bases as sources of ions in aqueous solution.', url: 'https://en.wikipedia.org/wiki/Acid%E2%80%93base_reaction', kind: 'document' },
        { label: 'Brønsted–Lowry proton theory (1923)', detail: 'Redefined acids and bases as proton donors and acceptors.', url: 'https://en.wikipedia.org/wiki/Br%C3%B8nsted%E2%80%93Lowry_acid%E2%80%93base_theory', kind: 'document' },
        { label: 'Sørensen introduces the pH scale (1909)', detail: 'Gave a logarithmic, measurable definition of acidity.', url: 'https://en.wikipedia.org/wiki/PH', kind: 'document' },
      ] },
    { id: 'redox', name: 'Redox Reactions', blurb: 'Reactions involving the transfer of electrons — the basis of batteries and metabolism.', wikiSlug: 'Redox', tags: ['electrochemistry', 'reactions'] },
    { id: 'kinetics', name: 'Chemical Kinetics', blurb: 'How fast reactions proceed and what controls their rates and mechanisms.', wikiSlug: 'Chemical_kinetics', tags: ['kinetics', 'physical'] },
    { id: 'organic', name: 'Organic Chemistry', blurb: 'The vast chemistry of carbon compounds, from fuels to pharmaceuticals to life.', wikiSlug: 'Organic_chemistry', tags: ['organic', 'synthesis'] },
  ],

  // ── Eras (7) ─────────────────────────────────────────────────────────────────
  eras: [
    {
      id: 'alchemy', title: 'Alchemy & Early Craft', span: 'Antiquity–1660',
      essay: 'For millennia, metallurgists, dyers and alchemists accumulated practical knowledge of matter while chasing the transmutation of metals and the elixir of life. Their mysticism masked real technique — distillation, crystallisation and the isolation of acids and salts.',
      developments: ['Distillation and sublimation apparatus', 'Discovery of mineral acids', 'Metallurgy and glassmaking', 'The alchemical search for transmutation'],
      turningPoints: ['Jabir ibn Hayyan systematises laboratory technique', 'Paracelsus turns alchemy toward medicine'],
    },
    {
      id: 'foundation', title: 'Birth of Modern Chemistry', span: '1660–1800',
      essay: 'Boyle separated chemistry from alchemy by insisting on the element as an experimental category, while Lavoisier overthrew phlogiston, named oxygen, and proved that mass is conserved in every reaction — turning chemistry into a quantitative science.',
      developments: ['Distinction of elements, compounds and mixtures', 'Discovery of oxygen, hydrogen and nitrogen', 'Conservation of mass', 'Systematic chemical nomenclature'],
      turningPoints: ["Boyle's Sceptical Chymist (1661)", "Lavoisier's chemical revolution (1770s–1789)"],
    },
    {
      id: 'atomic', title: 'Atomic Theory & Laws of Combination', span: '1800–1860',
      essay: 'Dalton revived the atom as a quantitative concept, explaining fixed and multiple proportions, while Avogadro, Gay-Lussac and Berzelius refined atomic weights, formulae and the counting of molecules — giving chemistry its symbolic language.',
      developments: ["Dalton's atomic theory", "Avogadro's hypothesis on gas volumes", 'Berzelius’s chemical symbols and atomic weights', 'Laws of definite and multiple proportions'],
      turningPoints: ["Dalton's New System (1808)", 'Karlsruhe Congress standardises atomic weights (1860)'],
    },
    {
      id: 'periodic', title: 'The Periodic Law', span: '1860–1900',
      essay: 'Mendeleev arranged the elements into a periodic table that not only ordered known chemistry but predicted undiscovered elements. Meanwhile organic structural theory, thermodynamics and electrochemistry matured into distinct disciplines.',
      developments: ['The periodic table of the elements', 'Structural theory of organic molecules', 'Chemical thermodynamics and free energy', 'Electrolytic dissociation and ionic theory'],
      turningPoints: ["Mendeleev's periodic table (1869)", "Gibbs's chemical thermodynamics (1876–1878)"],
    },
    {
      id: 'quantum', title: 'Atomic Structure & the Quantum Bond', span: '1900–1945',
      essay: 'The discovery of the electron, nucleus and isotopes revealed why elements behave as they do, and quantum mechanics finally explained the chemical bond. Pauling, Lewis and others turned bonding into a predictive, electronic theory.',
      developments: ['Discovery of the electron and atomic nucleus', 'Lewis electron-pair bonding', 'Quantum theory of the chemical bond', 'Radiochemistry and isotopes'],
      turningPoints: ["Bohr's atomic model (1913)", "Pauling's Nature of the Chemical Bond (1939)"],
    },
    {
      id: 'synthetic', title: 'Synthesis, Polymers & Biochemistry', span: '1945–1990',
      essay: 'Chemistry became a maker of new matter: synthetic polymers, pharmaceuticals and materials, alongside the molecular decoding of life. Instrumental methods — spectroscopy, chromatography and crystallography — made structure routinely knowable.',
      developments: ['Polymer and materials chemistry', 'Total synthesis of complex natural products', 'Structural biochemistry (DNA, proteins)', 'Instrumental analysis (NMR, X-ray, mass spectrometry)'],
      turningPoints: ['Structure of DNA determined (1953)', 'Rise of instrumental spectroscopy'],
    },
    {
      id: 'modern', title: 'Molecular Design & Green Chemistry', span: '1990–present',
      essay: 'Computation, nanotechnology and green principles now let chemists design molecules and materials atom by atom — from catalysts and batteries to CRISPR reagents — while striving to make chemistry cleaner and more sustainable.',
      developments: ['Computational and quantum chemistry', 'Nanomaterials and supramolecular chemistry', 'Green and sustainable chemistry', 'Catalysis and click chemistry'],
      turningPoints: ['Principles of Green Chemistry articulated (1998)', 'Nobel-recognised click and asymmetric catalysis'],
    },
  ],

  // ── Laws (14) ────────────────────────────────────────────────────────────────
  laws: [
    {
      id: 'conservation-mass', category: 'Foundations', name: 'Conservation of Mass',
      latex: '\\sum m_{\\text{reactants}} = \\sum m_{\\text{products}}',
      variables: [{ sym: 'm', name: 'Mass of each species', unit: 'g' }],
      description: 'In a closed system, the total mass of reactants equals the total mass of products — Lavoisier’s founding law.',
      reference: 'https://en.wikipedia.org/wiki/Conservation_of_mass',
    },
    {
      id: 'ideal-gas', category: 'Gas Laws', name: 'Ideal Gas Law',
      latex: 'PV = nRT',
      variables: [
        { sym: 'P', name: 'Pressure', unit: 'Pa' },
        { sym: 'V', name: 'Volume', unit: 'm³' },
        { sym: 'n', name: 'Moles', unit: 'mol' },
        { sym: 'R', name: 'Gas constant', unit: 'J/(mol·K)' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
      ],
      description: 'Combines Boyle’s, Charles’s and Avogadro’s laws to relate the state variables of an ideal gas.',
      reference: 'https://en.wikipedia.org/wiki/Ideal_gas_law',
    },
    {
      id: 'boyle', category: 'Gas Laws', name: "Boyle's Law",
      latex: 'P_1 V_1 = P_2 V_2',
      variables: [
        { sym: 'P', name: 'Pressure', unit: 'Pa' },
        { sym: 'V', name: 'Volume', unit: 'm³' },
      ],
      description: 'At constant temperature, the pressure of a fixed amount of gas is inversely proportional to its volume.',
      reference: "https://en.wikipedia.org/wiki/Boyle's_law",
    },
    {
      id: 'moles', category: 'Stoichiometry', name: 'Amount of Substance',
      latex: 'n = \\frac{N}{N_A} = \\frac{m}{M}',
      variables: [
        { sym: 'n', name: 'Amount of substance', unit: 'mol' },
        { sym: 'N', name: 'Number of particles' },
        { sym: 'N_A', name: 'Avogadro constant', unit: 'mol⁻¹' },
        { sym: 'm', name: 'Mass', unit: 'g' },
        { sym: 'M', name: 'Molar mass', unit: 'g/mol' },
      ],
      description: 'The mole relates the number of particles, mass and molar mass of a substance.',
      reference: 'https://en.wikipedia.org/wiki/Mole_(unit)',
    },
    {
      id: 'gibbs', category: 'Thermodynamics', name: 'Gibbs Free Energy',
      latex: '\\Delta G = \\Delta H - T\\Delta S',
      variables: [
        { sym: '\\Delta G', name: 'Change in Gibbs free energy', unit: 'J/mol' },
        { sym: '\\Delta H', name: 'Change in enthalpy', unit: 'J/mol' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
        { sym: '\\Delta S', name: 'Change in entropy', unit: 'J/(mol·K)' },
      ],
      description: 'A reaction is spontaneous when the change in Gibbs free energy is negative.',
      reference: 'https://en.wikipedia.org/wiki/Gibbs_free_energy',
    },
    {
      id: 'gibbs-equilibrium', category: 'Thermodynamics', name: 'Free Energy & Equilibrium',
      latex: '\\Delta G^{\\circ} = -RT\\ln K',
      variables: [
        { sym: '\\Delta G^{\\circ}', name: 'Standard free-energy change', unit: 'J/mol' },
        { sym: 'R', name: 'Gas constant', unit: 'J/(mol·K)' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
        { sym: 'K', name: 'Equilibrium constant' },
      ],
      description: 'Links the standard free-energy change of a reaction to its equilibrium constant.',
      reference: 'https://en.wikipedia.org/wiki/Chemical_equilibrium',
    },
    {
      id: 'equilibrium-constant', category: 'Equilibrium', name: 'Equilibrium Constant',
      latex: 'K = \\frac{[\\text{C}]^c[\\text{D}]^d}{[\\text{A}]^a[\\text{B}]^b}',
      variables: [
        { sym: 'K', name: 'Equilibrium constant' },
        { sym: '[X]', name: 'Molar concentration of species X', unit: 'mol/L' },
        { sym: 'a,b,c,d', name: 'Stoichiometric coefficients' },
      ],
      description: 'At equilibrium, the ratio of product to reactant activities, each raised to its coefficient, is constant.',
      reference: 'https://en.wikipedia.org/wiki/Equilibrium_constant',
    },
    {
      id: 'arrhenius', category: 'Kinetics', name: 'Arrhenius Equation',
      latex: 'k = A\\,e^{-E_a / RT}',
      variables: [
        { sym: 'k', name: 'Rate constant' },
        { sym: 'A', name: 'Pre-exponential factor' },
        { sym: 'E_a', name: 'Activation energy', unit: 'J/mol' },
        { sym: 'R', name: 'Gas constant', unit: 'J/(mol·K)' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
      ],
      description: 'Describes how a reaction’s rate constant grows with temperature and falls with activation energy.',
      reference: 'https://en.wikipedia.org/wiki/Arrhenius_equation',
    },
    {
      id: 'rate-law', category: 'Kinetics', name: 'Rate Law',
      latex: 'r = k[\\text{A}]^m[\\text{B}]^n',
      variables: [
        { sym: 'r', name: 'Reaction rate', unit: 'mol/(L·s)' },
        { sym: 'k', name: 'Rate constant' },
        { sym: '[A],[B]', name: 'Reactant concentrations', unit: 'mol/L' },
        { sym: 'm,n', name: 'Reaction orders' },
      ],
      description: 'Expresses the rate of a reaction as a function of reactant concentrations and their orders.',
      reference: 'https://en.wikipedia.org/wiki/Rate_equation',
    },
    {
      id: 'ph', category: 'Acids & Bases', name: 'pH Definition',
      latex: '\\mathrm{pH} = -\\log_{10}[\\text{H}^+]',
      variables: [
        { sym: '\\mathrm{pH}', name: 'Acidity measure' },
        { sym: '[\\text{H}^+]', name: 'Hydrogen-ion concentration', unit: 'mol/L' },
      ],
      description: 'pH is the negative base-10 logarithm of the hydrogen-ion concentration.',
      reference: 'https://en.wikipedia.org/wiki/PH',
    },
    {
      id: 'henderson', category: 'Acids & Bases', name: 'Henderson–Hasselbalch Equation',
      latex: '\\mathrm{pH} = \\mathrm{p}K_a + \\log_{10}\\frac{[\\text{A}^-]}{[\\text{HA}]}',
      variables: [
        { sym: '\\mathrm{p}K_a', name: 'Acid dissociation constant (log)' },
        { sym: '[\\text{A}^-]', name: 'Conjugate base concentration', unit: 'mol/L' },
        { sym: '[\\text{HA}]', name: 'Acid concentration', unit: 'mol/L' },
      ],
      description: 'Relates the pH of a buffer to the ratio of conjugate base to weak acid.',
      reference: 'https://en.wikipedia.org/wiki/Henderson%E2%80%93Hasselbalch_equation',
    },
    {
      id: 'nernst', category: 'Electrochemistry', name: 'Nernst Equation',
      latex: 'E = E^{\\circ} - \\frac{RT}{nF}\\ln Q',
      variables: [
        { sym: 'E', name: 'Cell potential', unit: 'V' },
        { sym: 'E^{\\circ}', name: 'Standard potential', unit: 'V' },
        { sym: 'n', name: 'Electrons transferred' },
        { sym: 'F', name: 'Faraday constant', unit: 'C/mol' },
        { sym: 'Q', name: 'Reaction quotient' },
      ],
      description: 'Gives the potential of an electrochemical cell away from standard conditions.',
      reference: 'https://en.wikipedia.org/wiki/Nernst_equation',
    },
    {
      id: 'gibbs-cell', category: 'Electrochemistry', name: 'Cell Potential & Free Energy',
      latex: '\\Delta G = -nFE',
      variables: [
        { sym: '\\Delta G', name: 'Free-energy change', unit: 'J/mol' },
        { sym: 'n', name: 'Electrons transferred' },
        { sym: 'F', name: 'Faraday constant', unit: 'C/mol' },
        { sym: 'E', name: 'Cell potential', unit: 'V' },
      ],
      description: 'Connects the free-energy change of a redox reaction to the voltage its cell produces.',
      reference: 'https://en.wikipedia.org/wiki/Electrochemical_cell',
    },
    {
      id: 'beer-lambert', category: 'Analytical', name: 'Beer–Lambert Law',
      latex: 'A = \\varepsilon\\, l\\, c',
      variables: [
        { sym: 'A', name: 'Absorbance' },
        { sym: '\\varepsilon', name: 'Molar absorptivity', unit: 'L/(mol·cm)' },
        { sym: 'l', name: 'Path length', unit: 'cm' },
        { sym: 'c', name: 'Concentration', unit: 'mol/L' },
      ],
      description: 'Absorbance of light by a solution is proportional to concentration and path length — the basis of spectrophotometry.',
      reference: 'https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law',
    },
  ],

  // ── Tools (12) ───────────────────────────────────────────────────────────────
  tools: [
    { name: 'PubChem', org: 'NIH / NCBI', url: 'https://pubchem.ncbi.nlm.nih.gov/', desc: 'World’s largest free database of chemical structures, properties and bioactivity, with an open REST API.', kind: 'api', access: 'Free API' },
    { name: 'RDKit', org: 'RDKit Project', url: 'https://www.rdkit.org/', desc: 'Open-source cheminformatics toolkit for molecule manipulation and descriptors.', kind: 'software', access: 'Open' },
    { name: 'Avogadro', org: 'Avogadro Project', url: 'https://avogadro.cc/', desc: 'Free cross-platform molecular editor and visualisation tool.', kind: 'software', access: 'Open' },
    { name: 'NIST Chemistry WebBook', org: 'NIST', url: 'https://webbook.nist.gov/chemistry/', desc: 'Authoritative thermochemical, spectral and physical data for thousands of compounds.', kind: 'dataset', access: 'Open' },
    { name: 'ChemSpider', org: 'Royal Society of Chemistry', url: 'http://www.chemspider.com/', desc: 'Free chemical structure database linking properties and literature across sources.', kind: 'dataset', access: 'Open' },
    { name: 'Open Babel', org: 'Open Babel Community', url: 'https://openbabel.org/', desc: 'Open toolbox for converting between chemical file formats and representations.', kind: 'software', access: 'Open' },
    { name: 'Protein Data Bank (RCSB)', org: 'RCSB', url: 'https://www.rcsb.org/', desc: 'Open archive of 3-D structures of proteins, nucleic acids and complexes.', kind: 'dataset', access: 'Open' },
    { name: 'ChEMBL', org: 'EMBL-EBI', url: 'https://www.ebi.ac.uk/chembl/', desc: 'Open bioactivity database of drug-like molecules with an API for medicinal chemistry.', kind: 'api', access: 'Free API' },
    { name: 'MolView', org: 'MolView', url: 'https://molview.org/', desc: 'Free browser tool to sketch molecules and view 3-D structures and spectra.', kind: 'software', access: 'Open' },
    { name: 'PhET Chemistry Simulations', org: 'University of Colorado Boulder', url: 'https://phet.colorado.edu/en/simulations/filter?subjects=chemistry', desc: 'Interactive simulations for gas laws, pH, reactions and molecular shapes.', kind: 'software', access: 'Open' },
    { name: 'Crystallography Open Database', org: 'COD', url: 'http://www.crystallography.net/cod/', desc: 'Open collection of crystal structures of organic, inorganic and mineral compounds.', kind: 'dataset', access: 'Open' },
    { name: 'PubChem PUG-REST API', org: 'NIH / NCBI', url: 'https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest', desc: 'Programmatic access to compound properties, synonyms and bioassay data.', kind: 'api', access: 'Free API' },
  ],

  // ── Videos (14) ──────────────────────────────────────────────────────────────
  videos: [
    { id: 'MFWv_kZQVy4', title: 'The Map of Chemistry', channel: 'Domain of Science', topic: 'Foundations', blurb: 'A single animated map of the whole field of chemistry.', query: 'The Map of Chemistry Domain of Science' },
    { id: 'FSyAehMdpyI', title: 'The Nucleus: Crash Course Chemistry #1', channel: 'CrashCourse', topic: 'Foundations', blurb: 'Atomic structure and the dawn of modern chemistry.', query: 'The Nucleus Crash Course Chemistry 1' },
    { id: 'BxUS1K7xu30', title: 'The 2,400-year search for the atom', channel: 'TED-Ed', topic: 'Foundations', blurb: 'From Democritus to Rutherford, how we found the atom.', query: 'The 2400-year search for the atom TED-Ed' },
    { id: 'nwiFxlBWLmg', title: 'Stoichiometry: Crash Course Chemistry #6', channel: 'CrashCourse', topic: 'Foundations', blurb: 'Mole ratios and the bookkeeping of balanced reactions.', query: 'Stoichiometry Crash Course Chemistry 6' },
    { id: 'rHkuIODZOWA', title: 'How to Speak Chemistrian: Crash Course Chemistry #11', channel: 'CrashCourse', topic: 'Reactions', blurb: 'Reading formulas and the language of chemical reactions.', query: 'How to Speak Chemistrian Crash Course Chemistry 11' },
    { id: 'TRL7o2kPqw0', title: 'The Most Radioactive Places on Earth', channel: 'Veritasium', topic: 'Reactions', blurb: 'A tour of radioactivity and where it runs strongest.', query: 'The Most Radioactive Places on Earth Veritasium' },
    { id: 'kQjTdAdimVc', title: 'Precipitation Reactions: Crash Course Chemistry #9', channel: 'CrashCourse', topic: 'Reactions', blurb: 'When mixing two clear solutions makes a solid appear.', query: 'Precipitation Reactions Crash Course Chemistry 9' },
    { id: 'yQP4UJhNn0I', title: 'Acid–Base Reactions in Solution: Crash Course Chemistry #8', channel: 'CrashCourse', topic: 'Reactions', blurb: 'Proton transfer, neutralisation and the meaning of pH.', query: 'Acid Base Reactions in Solution Crash Course Chemistry 8' },
    { id: 'ADmvv1Cjm3g', title: 'Introduction to Organic Chemistry', channel: 'The Organic Chemistry Tutor', topic: 'Organic', blurb: 'A first tour of the vast chemistry of carbon.', query: 'Introduction to Organic Chemistry The Organic Chemistry Tutor' },
    { id: 'lS5Oj8Nj_9U', title: 'Making synthetic vanilla (vanillin)', channel: 'NileRed', topic: 'Organic', blurb: 'A multi-step organic synthesis from start to finish.', query: 'Making synthetic vanillin NileRed' },
    { id: 'AXvPCwYNfKI', title: 'Polymers: Crash Course Chemistry #45', channel: 'CrashCourse', topic: 'Organic', blurb: 'How small monomers chain into plastics and fibres.', query: 'Polymers Crash Course Chemistry 45' },
    { id: 'dexLmNhpio4', title: 'Sodium in Water', channel: 'Periodic Videos', topic: 'Lab', blurb: 'Alkali metals reacting vigorously with water.', query: 'Sodium in water Periodic Videos' },
    { id: 'Rd4a1X3B61w', title: 'The Chemical History of a Candle', channel: 'The Royal Institution', topic: 'Lab', blurb: "Faraday's classic lectures on combustion and chemistry.", query: 'The Chemical History of a Candle Royal Institution' },
    { id: 'IOwB_kMt2rM', title: 'What Triggers a Chemical Reaction?', channel: 'TED-Ed', topic: 'Lab', blurb: 'Activation energy and why reactions actually proceed.', query: 'What triggers a chemical reaction TED-Ed' },
  ],
};

export default DATA;
