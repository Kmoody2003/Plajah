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
    id: 'lab-chemistry',
    label: 'Chemistry',
    blurb: 'The science of matter, its transformations, and the bonds that hold the world together - from Lavoisier to molecular design.',
    accent: '#06D6A0',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-chemistry.t1',
        title: 'Matter, Atoms and Bonds',
        blurb: 'How chemistry became a science, and what matter is made of.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-chemistry.l01',
            title: 'The Birth of Modern Chemistry',
            blurb: 'Boyle, Lavoisier and the conservation of mass.',
            minutes: 7,
            body: `For thousands of years metalworkers, dyers and alchemists built up practical knowledge of matter while chasing dreams such as turning lead into gold. Chemistry became a science when it started to measure. In 1661 Robert Boyle's Sceptical Chymist insisted that an element should be an experimental category, a substance that cannot be broken down by any chemical means, and that claims must rest on repeatable experiments.

Antoine Lavoisier then finished the job in the 1770s and 1780s. He overturned the phlogiston theory, which held that burning released a mysterious substance, and showed that combustion is a reaction with oxygen, a gas Joseph Priestley had isolated. Most importantly he weighed everything carefully and showed that in a closed system the total mass of the reactants equals the total mass of the products. This is the law of conservation of mass.

Everyday example: when a log burns, the ash weighs far less than the log. Mass has not vanished. The rest left as carbon dioxide and water vapour, and if you could collect every gas you would find the totals match. If 5 g of one substance reacts completely with 3 g of another to form a single product in a sealed vessel, the product has a mass of 8 g.

Lavoisier also helped devise the systematic chemical names still used today.`,
          },
          {
            id: 'lab-chemistry.l02',
            title: 'Atomic Theory',
            blurb: 'Matter is made of atoms combining in fixed ratios.',
            minutes: 8,
            body: `John Dalton revived the ancient idea of the atom in a quantitative form. He proposed that each element is made of identical atoms, and that atoms of different elements combine in small whole-number ratios to form compounds. This explained two patterns chemists had noticed. The law of definite proportions says a compound always contains its elements in the same fixed mass ratio. The law of multiple proportions, which Dalton formulated in 1803, says that when two elements form more than one compound, the masses of one element that combine with a fixed mass of the other are in small whole-number ratios.

Example: carbon and oxygen form two compounds. With 12 g of carbon, one contains 16 g of oxygen and the other 32 g. The ratio 16 to 32 is simply 1 to 2.

A century later the atom's inside was explored. Einstein and Perrin used the jitter of tiny suspended grains, called Brownian motion, to measure atoms and Avogadro's number. In 1911 Rutherford's team fired alpha particles at gold foil. Most passed straight through, but a few bounced back sharply, which could only be explained if almost all of the atom's mass sits in a tiny dense nucleus with electrons around it. Bohr later added quantised energy levels. Atomic theory is the foundation on which all chemistry is built.`,
          },
          {
            id: 'lab-chemistry.l03',
            title: 'The Periodic Table',
            blurb: 'Elements ordered by atomic number reveal repeating patterns.',
            minutes: 8,
            body: `By the 1860s chemists knew dozens of elements and noticed that properties repeated in a pattern when elements were listed by atomic weight. Dmitri Mendeleev arranged them into rows and columns so that similar elements lined up. His boldest move was leaving gaps for elements not yet discovered and predicting their properties. Between 1875 and 1886 gallium, scandium and germanium were found with just the properties he had foretold, which vindicated the periodic law.

The reason for the order came later. In 1913 Henry Moseley used X-ray spectra to show that elements are ordered by atomic number, the number of protons in the nucleus, rather than by atomic weight. An atom with 17 protons has atomic number 17 and is chlorine, whatever its mass. Quantum mechanics then explained the periods as electron shells filling up.

The table also grew. In the 1890s William Ramsay and Lord Rayleigh discovered the noble gases such as argon and neon, a whole new column of chemically inert elements that fitted neatly into the pattern.

Everyday relevance: the table lets you predict how an unfamiliar element will behave from its neighbours. Elements in the same column, such as sodium and potassium, react in similar ways.`,
          },
          {
            id: 'lab-chemistry.l04',
            title: 'Chemical Bonding',
            blurb: 'Atoms transfer, share or pool electrons.',
            minutes: 8,
            body: `Atoms join because of what their electrons do. There are three main bond types. In an ionic bond, electrons are transferred from one atom to another, producing oppositely charged ions that attract. In a covalent bond, atoms share pairs of electrons. In a metallic bond, electrons are pooled across a lattice of metal atoms. Which kind of bonding a substance has determines most of its physical and chemical properties.

Examples: table salt is ionic, with sodium giving an electron to chlorine. Hydrogen gas is covalent, with two hydrogen atoms sharing a pair. A copper wire is metallic, and the pooled electrons are why it conducts electricity.

In 1916 Gilbert Lewis pictured covalent bonds as shared electron pairs. Linus Pauling then applied quantum mechanics to explain their strength and direction, introducing hybrid orbitals. He also defined electronegativity, a scale of how strongly an atom attracts bonding electrons. If two bonded atoms differ a lot in electronegativity, the electrons are pulled toward one of them and the bond is polar. This is why a water molecule has a slightly negative oxygen end and slightly positive hydrogen ends.

X-ray crystallography measured real bond lengths and angles, confirming these models.`,
          },
        ],
      },
      {
        id: 'lab-chemistry.t2',
        title: 'Counting and Measuring',
        blurb: 'Turning reactions into numbers: moles, equations and gases.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-chemistry.l05',
            title: 'The Mole',
            blurb: 'A counting unit linking mass to numbers of particles.',
            minutes: 7,
            body: `Atoms are far too small to count one by one, so chemists count them in bunches called moles. One mole of any substance contains Avogadro's number of particles, about 6.02 x 10^23. The amount of substance n connects three things through two simple relations: n = N / N_A, where N is the number of particles, and n = m / M, where m is the mass in grams and M is the molar mass in grams per mole.

Molar mass comes straight from the periodic table. Water, H2O, has M = 2 x 1 + 16 = 18 g/mol. So 36 g of water is 36 / 18 = 2 mol. Two moles contain about 2 x 6.02 x 10^23, or roughly 1.2 x 10^24 molecules.

Everyday analogy: a dozen always means 12 of anything, but a dozen eggs and a dozen bricks have different masses. In the same way, a mole of iron and a mole of sulfur contain the same number of atoms but have different masses.

The mole is the bridge between the microscopic world of atoms, which we cannot weigh individually, and the macroscopic world of grams on a balance. The experiments of Einstein and Perrin on Brownian motion gave the first direct measurement of Avogadro's number.`,
          },
          {
            id: 'lab-chemistry.l06',
            title: 'Stoichiometry',
            blurb: 'Balanced equations as exact recipes.',
            minutes: 8,
            body: `Stoichiometry is the accounting of chemical reactions. Because atoms are conserved, a balanced equation fixes the exact mole ratios in which substances react and form. Take hydrogen burning in oxygen: 2 H2 + O2 gives 2 H2O. The coefficients say that 2 mol of hydrogen reacts with 1 mol of oxygen to make 2 mol of water.

To use an equation you convert to moles, apply the ratio, then convert back. Suppose 4 mol of hydrogen burns completely. The ratio of hydrogen to oxygen is 2 to 1, so 2 mol of oxygen is needed, and 4 mol of water forms.

You can also check mass. Burning 12 g of carbon (1 mol) with 32 g of oxygen (1 mol of O2) in a closed system gives 44 g of carbon dioxide, exactly 12 + 32, just as Lavoisier's conservation of mass requires.

Everyday example: a cook doubles a recipe by doubling every ingredient. A chemist scales a reaction the same way, from a test tube to a factory, to predict how much product a given amount of reactant will yield.

Proust's law of definite proportions and Dalton's multiple proportions were the early observations behind this bookkeeping.`,
          },
          {
            id: 'lab-chemistry.l07',
            title: 'Gases and Their Laws',
            blurb: "Boyle's law and the ideal gas law.",
            minutes: 7,
            body: `Gases were the first substances whose behaviour was captured by simple laws. In the 1600s Robert Boyle found that at constant temperature the pressure of a fixed amount of gas is inversely proportional to its volume: P1 V1 = P2 V2. Squeeze a gas into half the volume and its pressure doubles. A gas at 2 atm in a 6 L container, compressed to 3 L at the same temperature, reaches 4 atm.

Everyday example: pushing the plunger of a sealed syringe is hard because compressing the air raises its pressure.

Boyle's law combines with Charles's law (volume and temperature) and Avogadro's law (volume and amount) into the ideal gas law: P V = n R T. Here P is pressure, V is volume, n is the number of moles, R is the gas constant and T is the temperature. The temperature must be in kelvin, because the law depends on absolute temperature, not on a scale whose zero is arbitrary.

Real gases deviate when they are compressed to high pressures or cooled near their liquefying point, but for most everyday conditions the ideal gas law is a very good approximation. It lets chemists convert the volume of a gas into moles, which connects directly to stoichiometry.`,
          },
        ],
      },
      {
        id: 'lab-chemistry.t3',
        title: 'Energy, Speed and Balance',
        blurb: 'Why reactions happen, how fast, and where they settle.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-chemistry.l08',
            title: 'Thermochemistry and Free Energy',
            blurb: 'Heat, entropy and spontaneity.',
            minutes: 9,
            body: `Chemical reactions absorb or release heat because bonds are broken and formed. Reactions that release heat are exothermic, like burning fuel. Reactions that absorb heat are endothermic, like dissolving certain salts in cold packs. The heat change at constant pressure is the enthalpy change, delta H.

Heat alone does not decide whether a reaction will go. Josiah Willard Gibbs defined free energy to combine energy and entropy: delta G = delta H - T delta S. A reaction is spontaneous when delta G is negative. Here T is the absolute temperature in kelvin and delta S is the entropy change.

An example with clean numbers: take delta H = +30 kJ/mol, T = 300 K and delta S = 0.2 kJ/(mol K). Then T delta S = 60 kJ/mol and delta G = 30 - 60 = -30 kJ/mol. The reaction is endothermic, yet spontaneous, because the entropy gain outweighs the energy cost.

Everyday example: ice melts in a warm room even though melting absorbs heat, because the disordered liquid has higher entropy.

Gibbs free energy also connects to equilibrium through delta G standard = -R T ln K, so thermodynamics predicts how far a reaction will proceed as well as whether it will.`,
          },
          {
            id: 'lab-chemistry.l09',
            title: 'Reaction Rates',
            blurb: 'What controls how fast reactions go.',
            minutes: 8,
            body: `Thermodynamics tells us whether a reaction can happen, but kinetics tells us how fast. The rate of a reaction depends on the concentrations of the reactants. A rate law has the form r = k [A]^m [B]^n, where k is the rate constant and the exponents m and n, the reaction orders, must be found by experiment. For a first-order reaction, r = k [A]. If k = 0.1 per second and [A] = 0.5 mol/L, the rate is 0.1 x 0.5 = 0.05 mol/(L s). Doubling [A] doubles the rate.

Temperature matters too. Svante Arrhenius showed that k = A e^(-Ea / RT): the rate constant grows as temperature rises and falls as the activation energy Ea rises. The activation energy is the energy barrier that colliding molecules must overcome to react.

Everyday example: food spoils faster in a warm kitchen than in a refrigerator, because heating raises k.

Catalysts speed up reactions by providing a pathway with a lower activation energy, without being used up. That is why a reaction can be thermodynamically favourable yet very slow until a catalyst is added. Understanding the mechanism, the sequence of elementary steps, is how chemists design faster and cleaner reactions.`,
          },
          {
            id: 'lab-chemistry.l10',
            title: 'Chemical Equilibrium',
            blurb: 'Reversible reactions settle into a dynamic balance.',
            minutes: 8,
            body: `Many reactions are reversible. As reactants turn into products, products also turn back into reactants. Eventually the forward and reverse rates become equal and the concentrations stop changing. This is chemical equilibrium, a dynamic balance in which molecules keep reacting but nothing changes overall.

The balance is described by the equilibrium constant K. For the reaction aA + bB reversing to cC + dD, K = [C]^c [D]^d / ([A]^a [B]^b), with concentrations in mol/L. For 2A converting to B, K = [B] / [A]^2. If [B] = 1.0 mol/L and [A] = 0.5 mol/L at equilibrium, K = 1.0 / 0.25 = 4. A large K means products are favoured; a small K means reactants are.

Le Chatelier's principle, from 1884, predicts what happens when you disturb an equilibrium: the system shifts so as to oppose the change. Add more reactant and the equilibrium shifts toward products. Raise the pressure and it shifts toward the side with fewer gas molecules.

The Haber process uses this to make ammonia from nitrogen and hydrogen, N2 + 3 H2 reversing to 2 NH3. Four gas molecules become two, so high pressure favours ammonia. This industrial fixation of nitrogen feeds billions of people.`,
          },
        ],
      },
      {
        id: 'lab-chemistry.t4',
        title: 'Solutions, Electrons and Carbon',
        blurb: 'Acids, batteries, organic molecules and how we see them.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-chemistry.l11',
            title: 'Acids, Bases and pH',
            blurb: 'Proton donors, acceptors and the logarithmic pH scale.',
            minutes: 8,
            body: `Chemists have defined acids and bases in progressively broader ways. In 1884 Arrhenius described acids as substances that produce hydrogen ions, H+, in water, and bases as producers of hydroxide ions, OH-. In 1923 Bronsted and Lowry generalised this: an acid is a proton donor and a base is a proton acceptor. Lewis later broadened it again to electron-pair acceptors and donors.

In 1909 Soren Sorensen introduced the pH scale, a measurable way to express acidity: pH = -log10 [H+]. If [H+] = 1 x 10^-3 mol/L, then pH = 3. Because the scale is logarithmic, each pH unit is a tenfold change in hydrogen-ion concentration. A solution at pH 3 has 100 times more hydrogen ions than one at pH 5.

Everyday example: lemon juice has a low pH, around 2, while pure water is neutral at pH 7 and household ammonia is high.

Buffers resist changes in pH. The Henderson-Hasselbalch equation, pH = pKa + log10([A-] / [HA]), shows that when the weak acid HA and its conjugate base A- are present in equal amounts, the pH equals the pKa. Buffers keep our blood, the oceans and many industrial processes within a narrow pH range.`,
          },
          {
            id: 'lab-chemistry.l12',
            title: 'Redox and Electrochemistry',
            blurb: 'Electron transfer powers batteries and metabolism.',
            minutes: 8,
            body: `A redox reaction is one in which electrons are transferred between species. The species that loses electrons is oxidised, and the one that gains electrons is reduced. The two halves always happen together, so every oxidation is paired with a reduction.

A classic example: when zinc metal is placed in a copper(II) solution, zinc atoms lose electrons to become Zn2+ ions, and copper ions gain them to form copper metal. Zinc is oxidised and copper is reduced. If the electrons are forced to travel through an external wire, the reaction becomes an electrochemical cell, which is the principle of a battery.

The voltage a cell produces is linked to thermodynamics: delta G = -n F E, where n is the number of electrons transferred, F is the Faraday constant and E is the cell potential. A positive E means a negative delta G, so the reaction is spontaneous and the cell can deliver energy. A cell with E = +1.10 V therefore has a negative delta G.

Walther Nernst showed how the potential changes away from standard conditions: E = E standard - (R T / n F) ln Q, where Q is the reaction quotient. Concentrations therefore shift the voltage.

Redox chemistry also runs your body: cells extract energy from food through chains of electron-transfer reactions.`,
          },
          {
            id: 'lab-chemistry.l13',
            title: 'Organic Chemistry and Synthesis',
            blurb: 'Carbon chemistry from urea to polymers and green design.',
            minutes: 8,
            body: `Organic chemistry is the chemistry of carbon compounds, which form the basis of fuels, medicines, plastics and life itself. Early chemists believed in vitalism, the idea that the molecules of living things could only be made by living things. Friedrich Wohler undermined that belief by making urea, an organic compound, from inorganic starting materials, which united organic and inorganic chemistry.

August Kekule established that carbon is tetravalent, forming four bonds, and that carbon atoms can link into chains. He also proposed the ring structure of benzene. Knowing the structure of a molecule lets chemists predict and design its behaviour.

Wallace Carothers showed that polymers are long chains of repeating units held by ordinary covalent bonds, and he invented nylon and neoprene. Everyday example: the nylon in a rope or a jacket is a polymer, a very long molecule built from small monomers joined end to end.

Since the late twentieth century, chemists have used computation, nanomaterials and catalysis to design molecules atom by atom. In 1998 the principles of green chemistry were articulated, aiming to make chemical processes cleaner and more sustainable by reducing waste and hazardous substances.

Organic chemistry thus links the laws of bonding to the creation of useful new matter.`,
          },
          {
            id: 'lab-chemistry.l14',
            title: 'Measuring Matter with Light and X-rays',
            blurb: 'Spectrophotometry and crystallography reveal structure.',
            minutes: 7,
            body: `Modern chemistry depends on instruments that make invisible structure measurable. One of the simplest is the spectrophotometer, which shines light through a solution and measures how much is absorbed. The Beer-Lambert law says that absorbance is proportional to both concentration and path length: A = epsilon l c, where epsilon is the molar absorptivity, l is the path length in centimetres and c is the concentration in mol/L.

Example: with epsilon = 100 L/(mol cm), a path length of 1 cm and c = 0.005 mol/L, the absorbance is 100 x 1 x 0.005 = 0.5. Doubling the concentration doubles the absorbance, and so does doubling the path length. Chemists use this to find unknown concentrations, such as how much dye or protein is in a sample, by comparing against known standards.

X-ray crystallography reveals structure in a different way. X-rays diffract off the regular arrangement of atoms in a crystal, and the pattern lets chemists work out where the atoms sit. Dorothy Hodgkin used it to determine the 3-D structures of penicillin, vitamin B12 and insulin, which helped in making and improving vital medicines.

After 1945 other methods such as NMR, chromatography and mass spectrometry joined them. Together these instrumental methods made molecular structure routinely knowable.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-chemistry',
    questions: [
      // l01
      m('lab-chemistry.l01.q1', 1, 'Which theory did Lavoisier overturn when he explained combustion?',
        ["Dalton's atomic theory", 'Phlogiston theory', 'The periodic law of Mendeleev', 'The germ theory of disease'], 1,
        'It claimed burning released a mysterious substance.', 'Lavoisier showed combustion is a reaction with oxygen, replacing the phlogiston idea.'),
      m('lab-chemistry.l01.q2', 1, 'What did Boyle\'s Sceptical Chymist insist an element should be?',
        ['A mystical principle', 'An experimental category', 'Anything that burns', 'A substance made of four elements'], 1,
        'He wanted chemistry to rest on experiment.', 'Boyle treated the element as something defined by experiment, separating chemistry from alchemy.'),
      m('lab-chemistry.l01.q3', 2, 'In a sealed vessel 5 g of substance A reacts completely with 3 g of substance B to form one product. What is the mass of the product?',
        ['2 g', '15 g', '8 g', '5 g'], 2,
        'Mass is conserved in a closed system.', 'Total mass of reactants equals total mass of products: 5 g + 3 g = 8 g.'),
      m('lab-chemistry.l01.q4', 3, 'A log burns in an open fireplace and the ash weighs much less than the log. Which explanation fits conservation of mass?',
        ['Mass was destroyed by the heat', 'Phlogiston escaped', 'Gases such as carbon dioxide and water vapour carried away the missing mass', 'The ash has lost its atoms'], 2,
        'Ask what you would have to collect to account for all the mass.', 'The mass left as gases. In a closed system, the total would be unchanged.'),
      // l02
      m('lab-chemistry.l02.q1', 1, "What did Dalton propose about atoms of one element?",
        ['They are all identical', 'They have different masses depending on the sample', 'They can turn into other elements', 'They are made of molecules'], 0,
        'Think about the word identical.', 'Dalton proposed that each element consists of identical atoms that combine in whole-number ratios.'),
      m('lab-chemistry.l02.q2', 1, "What did Rutherford's gold-foil experiment reveal?",
        ['The electron', 'The neutron', 'A tiny dense nucleus', 'Quantised energy levels'], 2,
        'A few alpha particles were scattered strongly.', 'Alpha-particle scattering showed that the atom has a tiny dense nucleus at its core.'),
      m('lab-chemistry.l02.q3', 2, 'Carbon forms two oxides. One has 16 g of oxygen per 12 g of carbon and the other has 32 g. What is the ratio of the oxygen masses?',
        ['1 to 2', '1 to 3', '2 to 3', '1 to 4'], 0,
        'Divide 32 by 16.', 'The ratio 16 : 32 reduces to 1 : 2, a small whole-number ratio as the law of multiple proportions predicts.'),
      m('lab-chemistry.l02.q4', 3, 'In the gold-foil experiment most alpha particles passed straight through but a few were deflected strongly. What does this imply?',
        ['Atoms are solid throughout', 'Most of an atom is empty space with its mass concentrated in a small centre', 'Gold atoms are unusually small', 'Alpha particles are heavier than gold atoms'], 1,
        'Why would only a few particles be turned back?', 'Most particles met nothing, while the rare strong deflections came from a tiny, dense, positively charged core.'),
      // l03
      m('lab-chemistry.l03.q1', 1, 'What did Mendeleev do that made his periodic table so powerful?',
        ['He listed the elements alphabetically by their English names in one long column', 'He left gaps and predicted undiscovered elements', 'He discovered the proton by firing particles at a thin metal foil target', 'He ordered the elements strictly by the number of protons in each nucleus, measured by X-rays'], 1,
        'Think about the empty spaces.', 'His predictions for gallium, scandium and germanium were later confirmed.'),
      m('lab-chemistry.l03.q2', 1, 'What did Moseley show elements are ordered by?',
        ['Atomic weight', 'Density', 'Atomic number', 'Date of discovery'], 2,
        'It is the number of protons.', 'X-ray spectra showed the true ordering principle is atomic number.'),
      m('lab-chemistry.l03.q3', 2, 'An atom has 17 protons. What is its atomic number?',
        ['8', '34', '35', '17'], 3,
        'Atomic number counts protons.', 'The atomic number equals the number of protons, so it is 17.'),
      m('lab-chemistry.l03.q4', 3, 'Why did the discovery of gallium, scandium and germanium strengthen belief in the periodic law?',
        ['They were found with the properties Mendeleev predicted for the gaps', 'They were heavier than all known elements', 'They were all noble gases', 'They proved that atoms are divisible'], 0,
        'Think about predictions coming true.', 'Successful predictions of unseen elements are strong evidence that the pattern reflects a real law.'),
      // l04
      m('lab-chemistry.l04.q1', 1, 'In an ionic bond, what happens to electrons?',
        ['They are shared equally', 'They are pooled among many atoms', 'They are transferred from one atom to another', 'They are destroyed'], 2,
        'Ions form when electrons move.', 'Ionic bonds form when electrons are transferred, giving oppositely charged ions.'),
      m('lab-chemistry.l04.q2', 1, 'Who defined the electronegativity scale?',
        ['Mendeleev', 'Dalton', 'Lavoisier', 'Pauling'], 3,
        'He wrote The Nature of the Chemical Bond.', 'Linus Pauling introduced electronegativity to predict bond polarity.'),
      m('lab-chemistry.l04.q3', 2, 'What type of bonding explains why a copper wire conducts electricity?',
        ['Metallic bonding with pooled electrons', 'Ionic bonding', 'Covalent bonding in discrete molecules', 'Hydrogen bonding'], 0,
        'The electrons are not tied to single atoms.', 'In metallic bonds electrons are pooled across the lattice and can move.'),
      m('lab-chemistry.l04.q4', 3, 'Oxygen attracts bonding electrons more strongly than hydrogen. What does this make the O-H bond?',
        ['Ionic, with complete transfer of electrons to oxygen', 'Nonpolar, with electrons shared exactly equally', 'Metallic, with electrons pooled across a lattice', 'Polar, with oxygen slightly negative'], 3,
        'The electrons are pulled unequally.', 'A difference in electronegativity pulls electrons toward oxygen, giving a polar bond.'),
      // l05
      m('lab-chemistry.l05.q1', 1, "About how many particles are in one mole?",
        ['6.02 x 10^23', '6.02 x 10^12', '1 x 10^100', '3 x 10^8'], 0,
        'It is Avogadro\'s number.', "One mole contains Avogadro's number of particles, about 6.02 x 10^23."),
      m('lab-chemistry.l05.q2', 1, 'Which equation relates amount of substance to mass?',
        ['n = m x M', 'n = M / m', 'n = m / M', 'n = m + M'], 2,
        'Think about grams divided by grams per mole.', 'n = m / M, with mass in grams and molar mass in g/mol.'),
      m('lab-chemistry.l05.q3', 2, 'The molar mass of water is 18 g/mol. How many moles are in 36 g of water?',
        ['0.5 mol', '18 mol', '648 mol', '2 mol'], 3,
        'Divide mass by molar mass.', 'n = 36 g / 18 g/mol = 2 mol.'),
      m('lab-chemistry.l05.q4', 3, 'A mole of iron and a mole of sulfur have different masses. What do they have in common?',
        ['The same number of atoms', 'The same volume', 'The same density', 'The same number of protons per atom'], 0,
        'Think of a dozen eggs and a dozen bricks.', 'A mole is a fixed number of particles, whereas the mass depends on the molar mass of the element.'),
      // l06
      m('lab-chemistry.l06.q1', 1, 'What do the coefficients in a balanced chemical equation give?',
        ['The mole ratios in which substances react', 'The charges of the ions', 'The speed of the reaction', 'The colours of the products'], 0,
        'They tell you how much of each is involved.', 'Balanced coefficients fix the exact mole ratios of reactants and products.'),
      tf('lab-chemistry.l06.q2', 1, 'Stoichiometry relies on the conservation of atoms and mass.', 0,
        'Think about why an equation must be balanced.', 'Because atoms are conserved, the equation must balance and the ratios are fixed.'),
      m('lab-chemistry.l06.q3', 2, 'In 2 H2 + O2 gives 2 H2O, how many moles of oxygen are needed to burn 4 mol of hydrogen?',
        ['1 mol', '4 mol', '8 mol', '2 mol'], 3,
        'The ratio of H2 to O2 is 2 to 1.', 'The ratio is 2 : 1, so 4 mol of H2 needs 2 mol of O2.'),
      m('lab-chemistry.l06.q4', 3, 'When 12 g of carbon burns completely with 32 g of oxygen in a closed container, what mass of carbon dioxide forms?',
        ['20 g', '44 g', '38 g', '384 g'], 1,
        'Mass is conserved.', 'The total mass is conserved, so the product has a mass of 12 g + 32 g = 44 g.'),
      // l07
      m('lab-chemistry.l07.q1', 1, "What does Boyle's law say, at constant temperature?",
        ['Pressure and volume are directly proportional', 'Pressure and volume are inversely proportional', 'Volume is independent of pressure', 'Pressure is proportional to the square of volume'], 1,
        'Squeezing a gas raises its pressure.', 'For a fixed amount of gas at constant temperature, P V is constant.'),
      m('lab-chemistry.l07.q2', 1, 'In which units must temperature be expressed in P V = n R T?',
        ['Degrees Celsius', 'Degrees Fahrenheit', 'Joules', 'Kelvin'], 3,
        'It must be an absolute scale.', 'The law uses absolute temperature, in kelvin.'),
      m('lab-chemistry.l07.q3', 2, 'A gas at 2 atm and 6 L is compressed to 3 L at constant temperature. What is its new pressure?',
        ['1 atm', '4 atm', '2 atm', '12 atm'], 1,
        'Use P1 V1 = P2 V2.', 'P2 = (2 atm x 6 L) / 3 L = 4 atm.'),
      m('lab-chemistry.l07.q4', 3, 'Why does a sealed syringe get harder to push as you compress the air?',
        ['The air gains mass', 'The same amount of gas in a smaller volume has higher pressure', 'The gas constant R increases', 'The temperature must fall'], 1,
        'Think about the relation between pressure and volume.', 'By Boyle\'s law, reducing the volume at constant temperature raises the pressure.'),
      // l08
      m('lab-chemistry.l08.q1', 1, 'What does a negative delta G indicate for a reaction?',
        ['It is spontaneous', 'It is impossible', 'It is at equilibrium', 'It is endothermic'], 0,
        'It is the criterion Gibbs defined.', 'A reaction is spontaneous when the change in Gibbs free energy is negative.'),
      m('lab-chemistry.l08.q2', 1, 'What is an exothermic reaction?',
        ['One that absorbs heat', 'One that releases heat', 'One that has no energy change', 'One that never occurs spontaneously'], 1,
        'Burning fuel is an example.', 'Exothermic reactions release heat to the surroundings.'),
      m('lab-chemistry.l08.q3', 2, 'A reaction has delta H = +30 kJ/mol and delta S = 0.2 kJ/(mol K) at 300 K. What is delta G?',
        ['+90 kJ/mol', '-30 kJ/mol', '+30 kJ/mol', '-90 kJ/mol'], 1,
        'Compute T delta S first and keep the units consistent.', 'T delta S = 300 x 0.2 = 60 kJ/mol, so delta G = 30 - 60 = -30 kJ/mol.'),
      m('lab-chemistry.l08.q4', 3, 'Ice melts in a warm room even though melting absorbs heat. Why is this consistent with delta G = delta H - T delta S?',
        ['The enthalpy term is negative', 'The entropy increase can outweigh the energy cost, making delta G negative', 'Melting is exothermic', 'Free energy does not matter for melting'], 1,
        'Look at the second term in the equation.', 'The disordered liquid has higher entropy, so T delta S can exceed delta H.'),
      // l09
      m('lab-chemistry.l09.q1', 1, 'What does kinetics study?',
        ['Whether a reaction is spontaneous', 'How fast reactions proceed', 'The structure of atoms', 'The charge of ions'], 1,
        'The word is about speed.', 'Kinetics deals with reaction rates and mechanisms.'),
      m('lab-chemistry.l09.q2', 1, 'What is activation energy?',
        ['The total energy released by a reaction', 'The energy of the products', 'The energy barrier that must be overcome for reaction', 'The heat of the surroundings'], 2,
        'It is a barrier.', 'Ea is the minimum energy needed for colliding molecules to react.'),
      m('lab-chemistry.l09.q3', 2, 'A first-order reaction has rate = k [A], with k = 0.1 per second and [A] = 0.5 mol/L. What is the rate?',
        ['0.500 mol/(L s)', '0.200 mol/(L s)', '0.600 mol/(L s)', '0.05 mol/(L s)'], 3,
        'Multiply k by the concentration.', 'Rate = 0.1 x 0.5 = 0.05 mol/(L s).'),
      m('lab-chemistry.l09.q4', 3, 'Food spoils faster in a warm kitchen than in a refrigerator. What does the Arrhenius equation say?',
        ['The rate constant k increases as temperature rises', 'The rate constant stays the same whatever the temperature of the reaction', 'Activation energy rises steadily as the temperature of the mixture increases', 'Reactions slow down and eventually stop at high temperature'], 0,
        'Look at how T appears in the exponent.', 'In k = A e^(-Ea / RT), a larger T makes the exponent less negative, so k is larger.'),
      // l10
      m('lab-chemistry.l10.q1', 1, 'What is true at chemical equilibrium?',
        ['All molecular reactions have stopped completely and nothing moves', 'The forward and reverse rates are equal', 'Only products remain in the mixture and all reactants are gone', 'The concentrations of reactants and products are always equal'], 1,
        'The balance is dynamic.', 'Molecules keep reacting, but forward and reverse rates match, so concentrations are constant.'),
      m('lab-chemistry.l10.q2', 1, "What does Le Chatelier's principle say?",
        ['Equilibria never change', 'A system at equilibrium shifts so as to oppose an imposed change', 'Reactions always favour products', 'Catalysts shift the equilibrium'], 1,
        'It is about the response to a disturbance.', 'When a stress is applied, the equilibrium shifts to counteract it.'),
      m('lab-chemistry.l10.q3', 2, 'For 2A converting to B, K = [B] / [A]^2. At equilibrium [B] = 1.0 mol/L and [A] = 0.5 mol/L. What is K?',
        ['0.5', '2', '8', '4'], 3,
        'Square the concentration of A.', 'K = 1.0 / (0.5 squared) = 1.0 / 0.25 = 4.'),
      m('lab-chemistry.l10.q4', 3, 'In N2 + 3 H2 reversing to 2 NH3, why does high pressure favour ammonia?',
        ['The reaction forms four gas molecules from two', 'The reaction goes from four gas molecules to two, so pressure shifts it toward fewer molecules', 'Pressure lowers the temperature', 'Ammonia is a solid at high pressure'], 1,
        'Count the gas molecules on each side.', 'Raising pressure shifts equilibrium toward the side with fewer moles of gas, and the Haber process exploits this.'),
      // l11
      m('lab-chemistry.l11.q1', 1, 'In the Bronsted-Lowry theory, what is an acid?',
        ['A proton acceptor', 'An electron donor', 'A proton donor', 'A producer of OH- ions'], 2,
        'It donates something to the base.', 'Bronsted and Lowry defined acids as proton donors and bases as proton acceptors.'),
      m('lab-chemistry.l11.q2', 1, 'Who introduced the pH scale in 1909?',
        ['Svante Arrhenius', 'Sorensen', 'Gilbert Lewis', 'Walther Nernst'], 1,
        'A Danish chemist working in brewing research.', 'Soren Sorensen gave acidity a logarithmic, measurable definition.'),
      m('lab-chemistry.l11.q3', 2, 'A solution has [H+] = 1 x 10^-4 mol/L. What is its pH?',
        ['-4', '10', '0.0001', '4'], 3,
        'pH = -log10 [H+].', 'pH = -log10(10^-4) = 4.'),
      m('lab-chemistry.l11.q4', 3, 'How does the hydrogen-ion concentration at pH 3 compare with that at pH 5?',
        ['100 times higher', 'about 2 times higher', 'about 10 times lower', 'about 100 times lower'], 0,
        'Each pH unit is a factor of ten.', 'Two pH units lower means 10 x 10 = 100 times more H+.'),
      // l12
      m('lab-chemistry.l12.q1', 1, 'What is transferred in a redox reaction?',
        ['Protons', 'Neutrons', 'Atoms of carbon', 'Electrons'], 3,
        'Think of what batteries move.', 'Redox reactions involve the transfer of electrons.'),
      m('lab-chemistry.l12.q2', 1, 'What does it mean for a species to be oxidised?',
        ['It loses electrons', 'It gains electrons and is reduced', 'It gains protons and becomes an acid', 'It loses neutrons from its nucleus'], 0,
        'Zinc becoming Zn2+ is an example.', 'Oxidation is the loss of electrons and reduction is the gain.'),
      m('lab-chemistry.l12.q3', 2, 'A cell has a cell potential of +1.10 V. What is the sign of delta G for its reaction, from delta G = -n F E?',
        ['Positive', 'Zero', 'Negative', 'It depends on the size of F'], 2,
        'Note the minus sign in front of nFE.', 'With a positive E, delta G is negative, so the reaction is spontaneous.'),
      m('lab-chemistry.l12.q4', 3, 'Zinc metal is placed in copper(II) solution and copper metal forms. Which statement is correct?',
        ['Copper is oxidised and zinc is reduced', 'Both are reduced', 'Zinc is oxidised and copper ions are reduced', 'No electrons are transferred'], 2,
        'Which one becomes an ion?', 'Zn loses electrons to become Zn2+ and Cu2+ gains them to become Cu.'),
      // l13
      m('lab-chemistry.l13.q1', 1, 'What did Wohler show by synthesising urea?',
        ['That vitalism was correct', 'That an organic compound could be made from inorganic materials', 'That carbon has three bonds', 'That nylon is a polymer'], 1,
        'It challenged the idea that living things are special.', 'The synthesis undermined vitalism and united organic and inorganic chemistry.'),
      m('lab-chemistry.l13.q2', 1, 'How many bonds does a carbon atom typically form, according to Kekule?',
        ['Two', 'Three', 'Six', 'Four'], 3,
        'The word is tetravalent.', 'Carbon is tetravalent and can link into chains and rings.'),
      m('lab-chemistry.l13.q3', 2, 'Nylon is built from small units joined end to end by covalent bonds into very long molecules. What is such a material called?',
        ['A polymer', 'An isotope', 'A buffer', 'A noble gas'], 0,
        'Carothers founded the science of these materials.', 'Polymers are long chains of repeating units, and Carothers invented nylon and neoprene.'),
      m('lab-chemistry.l13.q4', 3, 'Why did the synthesis of urea matter for how chemists viewed living matter?',
        ['It proved life needs a vital force', 'It showed that molecules of life obey the same chemistry as other matter', 'It created life in a test tube', 'It showed that urea is inorganic'], 1,
        'It challenged vitalism.', 'Making an organic compound from inorganic starting materials showed no special vital force is required.'),
      // l14
      m('lab-chemistry.l14.q1', 1, 'What does the Beer-Lambert law relate absorbance to?',
        ['Temperature and pressure', 'Concentration and path length', 'Mass and volume', 'Charge and current'], 1,
        'A = epsilon l c.', 'Absorbance is proportional to concentration and to the path length of the light.'),
      m('lab-chemistry.l14.q2', 1, 'Which structures did Dorothy Hodgkin determine by X-ray crystallography?',
        ['Penicillin, vitamin B12 and insulin', 'Benzene, urea and the first synthetic dyes ever made', 'Nylon, neoprene and other early synthetic polymers', 'The noble gases argon, neon and helium'], 0,
        'They are important medicines and vitamins.', 'Hodgkin revealed the 3-D structures of penicillin, vitamin B12 and insulin.'),
      m('lab-chemistry.l14.q3', 2, 'With epsilon = 100 L/(mol cm), path length 1 cm and concentration 0.005 mol/L, what is the absorbance?',
        ['0.05', '5', '0.5', '50'], 2,
        'Multiply the three quantities.', 'A = 100 x 1 x 0.005 = 0.5.'),
      m('lab-chemistry.l14.q4', 3, 'A chemist doubles the path length through a sample without changing its concentration. What happens to the absorbance?',
        ['It halves', 'It doubles', 'It stays the same', 'It quadruples'], 1,
        'The law is linear in path length.', 'Absorbance is proportional to path length, so doubling l doubles A.'),
    ],
  },
};
