/**
 * Figures for Chemistry, Biology, Earth and Environment lessons. Computed curves are models of the laws stated in each
 * lesson (the captions say so); the only measured data is the Keeling Curve annual means (NOAA / Scripps).
 */
import type { Figure } from '../../components/learn/lesson/figures';

const range = (a: number, b: number, step: number) => { const o: number[] = []; for (let v = a; v <= b + 1e-9; v += step) o.push(+v.toFixed(6)); return o; };
const pts = (xs: number[], f: (x: number) => number) => xs.map(x => [x, +f(x).toFixed(4)] as [number, number]);

const PS = range(0, 1, 0.1);
const TS = range(0, 16, 2);
const logisticN = (t: number) => 1000 / (1 + ((1000 - 50) / 50) * Math.exp(-0.5 * t));
const GR_M = [4, 5, 6, 7, 8];

export const FIGURES: Record<string, Figure[]> = {
  'lab-chemistry.l03': [{
    id: 'periodic-timeline', type: 'timeline', after: 1, layout: 'inline', title: 'How the periodic table was built and confirmed',
    events: [
      { when: '1869', label: 'Mendeleev publishes his periodic table, leaving gaps for undiscovered elements' },
      { when: '1875', label: 'Gallium discovered, matching a predicted element' },
      { when: '1879', label: 'Scandium discovered' },
      { when: '1886', label: 'Germanium discovered' },
      { when: '1894', label: 'Ramsay and Rayleigh discover argon, the first noble gas' },
      { when: '1913', label: 'Moseley shows elements are ordered by atomic number' },
    ],
    caption: 'Each confirmed prediction strengthened the periodic law; Moseley later supplied the reason for the order.',
    alt: 'Timeline: 1869 Mendeleev table; 1875 gallium; 1879 scandium; 1886 germanium; 1894 argon discovered; 1913 Moseley and atomic number.',
  }],
  'lab-chemistry.l07': [
    {
      id: 'boyle-pv', type: 'graph', after: 1, layout: 'inline', title: "Boyle's law: pressure against volume",
      fn: v => 12 / v, domain: [1.5, 12], x: { label: 'Volume (L)' }, y: { label: 'Pressure (atm)' },
      marks: [{ x: 3, label: '3 L, 4 atm' }, { x: 6, label: '6 L, 2 atm' }],
      caption: 'A fixed amount of gas at constant temperature, with P x V = 12 atm L. Halving the volume from 6 L to 3 L doubles the pressure from 2 atm to 4 atm.',
      alt: 'A falling curve of pressure in atmospheres against volume in litres, P = 12 divided by V. At 6 litres the pressure is 2 atmospheres; at 3 litres it is 4 atmospheres.',
    },
    {
      id: 'ideal-v-t', type: 'graph', after: 2, layout: 'inline', title: 'Volume of one mole of ideal gas at 1 atm',
      fn: t => 0.082057 * t, domain: [0, 400], x: { label: 'Temperature (K)' }, y: { label: 'Volume (L)' },
      marks: [{ x: 273.15, label: '273.15 K (0 C): 22.4 L' }, { x: 373.15, label: '373.15 K (100 C): 30.6 L' }],
      caption: 'From PV = nRT with n = 1 mol, P = 1 atm and R = 0.08206 L atm per mol K, volume is proportional to the temperature in kelvin and would reach zero at 0 K.',
      alt: 'A straight line through the origin of volume in litres against temperature in kelvin. At 273.15 K the volume is about 22.4 litres; at 373.15 K about 30.6 litres.',
    },
  ],
  'lab-chemistry.l08': [{
    id: 'gibbs-vs-t', type: 'graph', after: 2, layout: 'inline', title: 'Free energy change against temperature',
    fn: t => 30 - 0.2 * t, domain: [0, 400], x: { label: 'Temperature (K)' }, y: { label: 'Delta G (kJ/mol)' },
    marks: [{ x: 150, label: '150 K: delta G = 0' }, { x: 300, label: '300 K: -30 kJ/mol' }],
    caption: 'A worked model using the lesson numbers, delta H = +30 kJ/mol and delta S = 0.2 kJ/(mol K), treated as constant. The endothermic reaction becomes spontaneous once T delta S exceeds delta H, above 150 K.',
    alt: 'A straight line falling from +30 kJ per mole at 0 K to -50 at 400 K, crossing zero at 150 K and reaching -30 at 300 K.',
  }],
  'lab-chemistry.l11': [{
    id: 'henderson', type: 'graph', after: 1, layout: 'inline', title: 'A buffer: pH minus pKa against base-to-acid ratio',
    fn: r => Math.log10(r), domain: [0.1, 10], x: { label: 'Ratio [A-] / [HA]' }, y: { label: 'pH - pKa' },
    marks: [{ x: 0.1, label: '0.1: pH = pKa - 1' }, { x: 1, label: '1: pH = pKa' }, { x: 10, label: '10: pH = pKa + 1' }],
    caption: 'The Henderson-Hasselbalch equation: when acid and conjugate base are equal the pH equals the pKa, and each tenfold change in the ratio moves the pH by one unit.',
    alt: 'A curve of pH minus pKa against the ratio of conjugate base to weak acid from 0.1 to 10. It equals -1 at 0.1, 0 at 1 and +1 at 10.',
  }],

  'lab-biology.l02': [
    {
      id: 'dna-timeline', type: 'timeline', after: 0, layout: 'inline', title: 'Finding the structure and copying of DNA',
      events: [
        { when: '1944', label: 'Avery, MacLeod and McCarty show DNA carries heredity' },
        { when: '1952', label: 'Franklin and Gosling record Photo 51' },
        { when: '1953', label: 'Watson and Crick propose the double helix' },
        { when: '1958', label: 'Meselson and Stahl show replication is semiconservative' },
      ],
      caption: 'Four steps from identifying the molecule to proving how it is copied.',
      alt: 'Timeline: 1944 DNA shown to carry heredity; 1952 Photo 51; 1953 double helix proposed; 1958 semiconservative replication demonstrated.',
    },
    {
      id: 'semiconservative', type: 'diagram', after: 2, layout: 'wide', title: 'Semiconservative replication',
      nodes: [{ id: 'orig', label: 'Original helix: 2 old strands', col: 0, row: 0 }, { id: 'd1', label: 'Daughter 1: 1 old + 1 new', col: 1, row: 0 }, { id: 'd2', label: 'Daughter 2: 1 old + 1 new', col: 1, row: 1 }],
      edges: [['orig', 'd1', 'each strand is a template'], ['orig', 'd2', 'each strand is a template']],
      caption: 'After one round of copying every daughter molecule holds exactly one strand from the original, as Meselson and Stahl showed.',
      alt: 'A diagram: the original double helix of two old strands splits into two daughter helices, each made of one old strand and one new strand.',
    },
  ],
  'lab-biology.l04': [{
    id: 'monohybrid', type: 'diagram', after: 1, layout: 'wide', title: 'A monohybrid cross, Aa x Aa',
    nodes: [
      { id: 'par', label: 'Parents: Aa x Aa', col: 0, row: 1 }, { id: 'gam', label: 'Gametes: A or a', col: 1, row: 1 },
      { id: 'aa1', label: 'AA: 1/4 (dominant)', col: 2, row: 0 }, { id: 'aa2', label: 'Aa: 1/2 (dominant)', col: 2, row: 1 }, { id: 'aa3', label: 'aa: 1/4 (recessive)', col: 2, row: 2 },
    ],
    edges: [['par', 'gam', 'segregation'], ['gam', 'aa1', 'random fusion'], ['gam', 'aa2'], ['gam', 'aa3']],
    caption: 'Each parent passes on A or a with equal chance. Three quarters of offspring show the dominant trait and one quarter the recessive, a 3 to 1 ratio.',
    alt: 'A diagram: two Aa parents produce gametes carrying A or a, which combine to give offspring AA one quarter, Aa one half and aa one quarter; 3 to 1 dominant to recessive.',
  }],
  'lab-biology.l06': [{
    id: 'hw-genotypes', type: 'chart', kind: 'line', after: 1, layout: 'inline', title: 'Hardy-Weinberg genotype frequencies',
    x: { label: 'Frequency of allele A (p)' }, y: { label: 'Genotype frequency' },
    series: [{ name: 'AA (p squared)', points: pts(PS, p => p * p) }, { name: 'Aa (2pq)', points: pts(PS, p => 2 * p * (1 - p)) }, { name: 'aa (q squared)', points: pts(PS, p => (1 - p) * (1 - p)) }],
    caption: 'Computed from the equation, not measured. Heterozygotes peak at 0.5 when p = q = 0.5; at p = 0.7 the frequencies are AA 0.49, Aa 0.42 and aa 0.09.',
    alt: 'Three curves against allele frequency p from 0 to 1. AA rises from 0 to 1, aa falls from 1 to 0, and Aa rises to a peak of 0.5 at p = 0.5 then falls. At p = 0.7: AA 0.49, Aa 0.42, aa 0.09.',
  }],
  'lab-biology.l10': [{
    id: 'michaelis-menten', type: 'graph', after: 1, layout: 'inline', title: 'Enzyme rate against substrate concentration',
    fn: s => (100 * s) / (2 + s), domain: [0, 20], x: { label: 'Substrate concentration [S]' }, y: { label: 'Rate v' },
    marks: [{ x: 2, label: '[S] = Km: v = 50' }, { x: 20, label: '[S] = 20: v = 91' }],
    caption: 'The lesson example, Vmax = 100 and Km = 2. The rate climbs steeply, then flattens toward Vmax; at [S] = Km it is exactly half of Vmax.',
    alt: 'A rising saturating curve of rate against substrate concentration with Vmax 100 and Km 2. At concentration 2 the rate is 50; at 20 it is about 91, approaching 100.',
  }],

  'lab-earth.l03': [{
    id: 'half-life-decay', type: 'graph', after: 0, layout: 'inline', title: 'Radioactive decay over half-lives',
    fn: n => Math.pow(0.5, n), domain: [0, 5], x: { label: 'Time (half-lives)' }, y: { label: 'Fraction of parent atoms remaining' },
    marks: [{ x: 1, label: '1 half-life: 1/2' }, { x: 2, label: '2: 1/4' }, { x: 3, label: '3: 1/8' }],
    caption: 'The fraction remaining is 0.5 raised to the number of half-lives, the same curve as N = N0 e^(-lambda t). Measuring parent against daughter atoms tells how many half-lives have passed.',
    alt: 'A decaying curve from 1 at time zero, to one half after one half-life, one quarter after two, one eighth after three, and about 0.03 after five.',
  }],
  'lab-earth.l04': [{
    id: 'rock-cycle', type: 'diagram', after: 1, layout: 'wide', title: 'The rock cycle',
    nodes: [
      { id: 'mag', label: 'Magma', col: 0, row: 0 }, { id: 'ign', label: 'Igneous rock', col: 1, row: 0 }, { id: 'sed', label: 'Sediment', col: 2, row: 0 },
      { id: 'sdr', label: 'Sedimentary rock', col: 2, row: 1 }, { id: 'met', label: 'Metamorphic rock', col: 0, row: 1 },
    ],
    edges: [['mag', 'ign', 'cooling'], ['ign', 'sed', 'weathering, erosion'], ['sed', 'sdr', 'burial, cementation'], ['sdr', 'met', 'heat and pressure'], ['met', 'mag', 'melting']],
    caption: 'One common loop through the cycle. Any rock can take shortcuts, for example igneous rock can be metamorphosed directly, and uplift can return any of them to the surface.',
    alt: 'A loop: magma cools to igneous rock; weathering and erosion make sediment; burial and cementation make sedimentary rock; heat and pressure make metamorphic rock; melting returns to magma.',
  }],
  'lab-earth.l08': [{
    id: 'earth-layers', type: 'diagram', after: 1, layout: 'inline', title: 'Earth layers found with seismic waves',
    nodes: [{ id: 'cr', label: 'Crust', col: 0, row: 0 }, { id: 'ma', label: 'Mantle', col: 0, row: 1 }, { id: 'oc', label: 'Liquid outer core', col: 0, row: 2 }, { id: 'ic', label: 'Solid inner core', col: 0, row: 3 }],
    edges: [['cr', 'ma', 'Moho, 1909'], ['ma', 'oc', 'S-waves stop (Gutenberg)'], ['oc', 'ic', 'Lehmann, 1936']],
    caption: 'Each boundary was found from how earthquake waves change speed, reflect or vanish. S-waves cannot cross liquid, so the outer core is liquid.',
    alt: 'A stack from the surface down: crust, then mantle (boundary found by Mohorovicic in 1909), then liquid outer core (S-waves do not pass, shown by Gutenberg), then solid inner core (found by Lehmann in 1936).',
  }],
  'lab-earth.l09': [{
    id: 'gutenberg-richter', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'Gutenberg-Richter law with b = 1',
    x: { label: 'Magnitude, M or greater' }, y: { label: 'Earthquakes per year' },
    series: [{ name: 'Model: 1000 at M4 and above', points: pts(GR_M, m => 1000 * Math.pow(10, -(m - 4))) }],
    caption: 'A computed model from the lesson example. Each step up of one magnitude unit means ten times fewer earthquakes: 1000, 100, 10, 1, then 0.1 per year.',
    alt: 'A line falling from 1000 earthquakes per year at magnitude 4 and above, to 100 at magnitude 5, 10 at 6, 1 at 7 and 0.1 at 8.',
  }],
  'lab-earth.l12': [{
    id: 'keeling', type: 'chart', kind: 'line', after: 1, layout: 'wide', title: 'Atmospheric CO2 at Mauna Loa, annual means',
    x: { label: 'Year' }, y: { label: 'CO2', unit: 'ppm' },
    series: [{ name: 'Annual mean CO2', points: [[1960, 317], [1970, 326], [1980, 339], [1990, 354], [2000, 370], [2010, 390], [2020, 414]] }],
    credit: 'NOAA Global Monitoring Laboratory and Scripps Institution of Oceanography (Keeling Curve), values rounded to 1 ppm',
    caption: 'Yearly averages smooth out the seasonal sawtooth but show the steady rise measured since 1958, from about 315 ppm to over 410.',
    alt: 'A rising line of annual mean CO2 in parts per million at Mauna Loa: about 317 in 1960, 326 in 1970, 339 in 1980, 354 in 1990, 370 in 2000, 390 in 2010 and 414 in 2020.',
  }],

  'lab-environment.l02': [{
    id: 'energy-chain', type: 'diagram', after: 1, layout: 'wide', title: 'Energy lost at each trophic level',
    nodes: [
      { id: 'pr', label: 'Producers: 10 000 kJ', col: 0, row: 0 }, { id: 'he', label: 'Herbivores: about 1000 kJ', col: 1, row: 0 }, { id: 'ca', label: 'Carnivores: about 100 kJ', col: 2, row: 0 },
      { id: 'de', label: 'Decomposers recycle nutrients', col: 1, row: 1 },
    ],
    edges: [['pr', 'he', 'about 10% passed on'], ['he', 'ca', 'about 10% passed on'], ['pr', 'de'], ['he', 'de'], ['ca', 'de']],
    caption: "An illustration of the ten-percent rule using the lesson's numbers; real transfer efficiencies vary. About 90 percent is lost at each step, mostly as heat, which is why food chains are short.",
    alt: 'A chain: producers hold 10 000 kilojoules, herbivores about 1000 and carnivores about 100, each step passing on about 10 percent. Decomposers receive material from every level and recycle nutrients.',
  }],
  'lab-environment.l03': [
    {
      id: 'logistic-rate', type: 'graph', after: 1, layout: 'inline', title: 'Growth rate of a logistic population',
      fn: n => 0.5 * n * (1 - n / 1000), domain: [0, 1000], x: { label: 'Population size N' }, y: { label: 'Growth rate dN/dt (individuals per year)' },
      marks: [{ x: 500, label: 'N = 500: 125 per year' }, { x: 1000, label: 'N = K: 0' }],
      caption: 'With r = 0.5 per year and K = 1000, growth is fastest at half the carrying capacity and falls to zero at K.',
      alt: 'An arch-shaped curve of growth rate against population size, zero at N = 0 and at N = 1000, peaking at 125 individuals per year when N = 500.',
    },
    {
      id: 'logistic-curve', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'An S-shaped logistic curve',
      x: { label: 'Time', unit: 'years' }, y: { label: 'Population N' },
      series: [{ name: 'r = 0.5, K = 1000, N0 = 50', points: pts(TS, logisticN) }],
      caption: 'A computed model, not field data, starting from 50 individuals. The population rises almost exponentially at first, then levels off near the carrying capacity of 1000.',
      alt: 'An S-shaped curve of population against time, starting at 50, rising steeply in the middle years and levelling just below 1000 by year 16.',
    },
  ],
  'lab-environment.l07': [{
    id: 'co2-forcing', type: 'graph', after: 0, layout: 'inline', title: 'Radiative forcing from CO2',
    fn: c => 5.35 * Math.log(c / 280), domain: [280, 1120], x: { label: 'CO2 concentration (ppm)' }, y: { label: 'Forcing (W per square metre)' },
    marks: [{ x: 560, label: '560 ppm (one doubling): 3.7' }, { x: 1120, label: '1120 ppm (two doublings): 7.4' }],
    caption: 'From the equation delta F = 5.35 ln(C / C0) with C0 = 280 ppm, a pre-industrial reference. Each doubling adds about the same 3.7 watts per square metre.',
    alt: 'A rising, flattening curve of forcing in watts per square metre against CO2 from 280 to 1120 ppm: 0 at 280, about 3.7 at 560 and about 7.4 at 1120.',
  }],
  'lab-environment.l09': [{
    id: 'ozone-timeline', type: 'timeline', after: 1, layout: 'inline', title: 'From CFC warning to treaty',
    events: [
      { when: '1974', label: 'Molina and Rowland warn that CFCs can destroy stratospheric ozone' },
      { when: '1985', label: 'The Antarctic ozone hole is reported' },
      { when: '1987', label: 'Countries agree the Montreal Protocol to phase out CFCs' },
    ],
    caption: 'Roughly thirteen years from the first warning to a binding treaty; the ozone layer is now slowly recovering.',
    alt: 'Timeline: 1974 Molina and Rowland warning about CFCs; 1985 Antarctic ozone hole reported; 1987 Montreal Protocol agreed.',
  }],
  'lab-environment.l10': [{
    id: 'nitrogen-cycle', type: 'diagram', after: 1, layout: 'wide', title: 'The nitrogen cycle',
    nodes: [
      { id: 'n2', label: 'Nitrogen gas in air', col: 0, row: 0 }, { id: 'fx', label: 'Ammonia and nitrate in soil', col: 1, row: 0 }, { id: 'pl', label: 'Plants', col: 2, row: 0 },
      { id: 'an', label: 'Animals', col: 2, row: 1 }, { id: 'dc', label: 'Decomposers', col: 1, row: 1 }, { id: 'ro', label: 'Runoff: algae blooms, dead zones', col: 0, row: 1 },
    ],
    edges: [['n2', 'fx', 'fixation'], ['fx', 'pl', 'uptake'], ['pl', 'an', 'eaten'], ['an', 'dc', 'waste, death'], ['dc', 'fx', 'return to soil'], ['fx', 'n2', 'bacteria convert back'], ['fx', 'ro', 'excess fertiliser']],
    caption: 'Fixation by microbes, lightning and fertiliser plants feeds the cycle. Excess fixed nitrogen washes into waters, where it fuels algal blooms and oxygen-poor dead zones.',
    alt: 'A cycle diagram: nitrogen gas is fixed into ammonia and nitrate in soil, taken up by plants, eaten by animals, returned by decomposers, and converted back to nitrogen gas by bacteria. Excess fertiliser runs off causing algal blooms and dead zones.',
  }],
};
