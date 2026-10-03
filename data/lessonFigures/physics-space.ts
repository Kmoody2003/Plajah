import type { Figure } from '../../components/learn/lesson/figures';

const G = 9.81;

export const FIGURES: Record<string, Figure[]> = {
  'lab-physics.l03': [
    {
      id: 'ke-vs-speed', type: 'graph', after: 1, layout: 'inline', title: 'Kinetic energy of a 2 kg object',
      fn: v => 0.5 * 2 * v * v, domain: [0, 6], x: { label: 'Speed (m/s)' }, y: { label: 'Kinetic energy (J)' },
      marks: [{ x: 3, label: '9 J at 3 m/s' }, { x: 6, label: '36 J at 6 m/s' }],
      caption: 'Kinetic energy grows with the square of speed, so the curve steepens. Doubling the speed from 3 to 6 m/s multiplies the energy by four, from 9 J to 36 J.',
      alt: 'A rising parabola of kinetic energy in joules against speed from 0 to 6 metres per second for a 2 kilogram object, passing through 9 joules at 3 m/s and 36 joules at 6 m/s.',
    },
    {
      id: 'ke-car-relative', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'Kinetic energy of one car at different speeds',
      x: { label: 'Speed', unit: 'km/h' }, y: { label: 'Kinetic energy (30 km/h = 1)' },
      series: [{ name: 'Relative kinetic energy', points: [[0, 0], [15, 0.25], [30, 1], [45, 2.25], [60, 4]] }],
      caption: 'A computed model, not measured data: for the same car, energy scales as speed squared. At 60 km/h it is four times the value at 30 km/h.',
      alt: 'A line chart of relative kinetic energy against speed: 0 at 0 km/h, 0.25 at 15, 1 at 30, 2.25 at 45 and 4 at 60 km/h.',
    },
  ],
  'lab-physics.l04': [
    {
      id: 'pendulum-period', type: 'graph', after: 2, layout: 'inline', title: 'Pendulum period against length',
      fn: L => 2 * Math.PI * Math.sqrt(L / G), domain: [0.05, 4], x: { label: 'Length (m)' }, y: { label: 'Period (s)' },
      marks: [{ x: 1, label: '1 m: about 2.0 s' }, { x: 4, label: '4 m: about 4.0 s' }],
      caption: 'Computed from T = 2 pi times the square root of L / g with g = 9.81 m/s squared, for small swings. Quadrupling the length from 1 m to 4 m only doubles the period.',
      alt: 'A gently rising curve of pendulum period in seconds against length in metres from 0 to 4, giving about 2.0 seconds at 1 metre and about 4.0 seconds at 4 metres.',
    },
    {
      id: 'hooke-spring', type: 'graph', after: 1, layout: 'inline', title: "Hooke's law for a 200 N/m spring",
      fn: x => 200 * x, domain: [0, 0.1], x: { label: 'Stretch (m)' }, y: { label: 'Restoring force (N)' },
      marks: [{ x: 0.05, label: '10 N at 0.05 m' }],
      caption: 'The size of the restoring force is a straight line through the origin; its slope is the spring constant k = 200 N/m. The force always points opposite to the stretch.',
      alt: 'A straight line of restoring force in newtons against stretch in metres from 0 to 0.1, reaching 10 newtons at 0.05 metres and 20 newtons at 0.1 metres.',
    },
  ],
  'lab-physics.l05': [
    {
      id: 'wavelength-sound', type: 'graph', after: 2, layout: 'inline', title: 'Wavelength of sound in air',
      fn: f => 343 / f, domain: [100, 2000], x: { label: 'Frequency (Hz)' }, y: { label: 'Wavelength (m)' },
      marks: [{ x: 343, label: '343 Hz: 1.0 m' }, { x: 686, label: '686 Hz: 0.5 m' }],
      caption: 'Using v = f lambda with the speed of sound in air at about 20 degrees C, 343 m/s. The speed is fixed by the air, so doubling the frequency halves the wavelength.',
      alt: 'A falling curve of wavelength in metres against frequency from 100 to 2000 hertz for sound at 343 metres per second, giving 1.0 metre at 343 hertz and 0.5 metres at 686 hertz.',
    },
    {
      id: 'wave-relation', type: 'diagram', after: 0, layout: 'wide', title: 'What sets each wave quantity',
      nodes: [{ id: 'src', label: 'Source', col: 0, row: 0 }, { id: 'med', label: 'Medium', col: 0, row: 1 }, { id: 'f', label: 'Frequency f', col: 1, row: 0 }, { id: 'v', label: 'Wave speed v', col: 1, row: 1 }, { id: 'lam', label: 'Wavelength = v / f', col: 2, row: 0 }],
      edges: [['src', 'f', 'sets'], ['med', 'v', 'sets'], ['f', 'lam'], ['v', 'lam']],
      caption: 'The source fixes the frequency and the medium fixes the speed; the wavelength is whatever is left over, lambda = v / f.',
    },
  ],
  'lab-physics.l06': [
    {
      id: 'rigid-container-pressure', type: 'graph', after: 3, layout: 'inline', title: 'Pressure in a sealed rigid container',
      fn: T => 100 * T / 300, domain: [200, 400], x: { label: 'Temperature (K)' }, y: { label: 'Pressure (kPa)' },
      marks: [{ x: 300, label: '100 kPa at 300 K' }, { x: 400, label: '133 kPa at 400 K' }],
      caption: 'A worked model: a fixed amount of ideal gas starting at 100 kPa and 300 K. With volume and amount fixed, P is proportional to T in kelvin, so the line passes through zero at absolute zero.',
      alt: 'A straight line of gas pressure in kilopascals against temperature in kelvin from 200 to 400, passing 100 kilopascals at 300 kelvin and about 133 kilopascals at 400 kelvin.',
    },
    {
      id: 'first-law-budget', type: 'diagram', after: 1, layout: 'wide', title: 'The first law as a budget',
      nodes: [{ id: 'q', label: 'Heat added Q = 500 J', col: 0, row: 0 }, { id: 'g', label: 'Gas: internal energy rises 300 J', col: 1, row: 0 }, { id: 'w', label: 'Work done W = 200 J', col: 2, row: 0 }],
      edges: [['q', 'g', '500 J in'], ['g', 'w', '200 J out']],
      caption: 'The lesson example: 500 J of heat goes in, 200 J leaves as work on the piston, and the remaining 300 J raises the internal energy, delta U = Q - W.',
    },
  ],
  'lab-physics.l10': [
    {
      id: 'lorentz-factor', type: 'graph', after: 1, layout: 'inline', title: 'How much a moving clock slows',
      fn: b => 1 / Math.sqrt(1 - b * b), domain: [0, 0.98], x: { label: 'Speed as a fraction of light speed (v / c)' }, y: { label: 'Time dilation factor' },
      marks: [{ x: 0.6, label: '0.6c: 1.25' }, { x: 0.8, label: '0.8c: 1.67' }, { x: 0.9, label: '0.9c: 2.29' }],
      caption: 'The factor 1 / sqrt(1 - v squared / c squared) stays near 1 at everyday speeds and climbs without limit as v approaches c. At 0.8c a moving clock ticks 1.67 times slower than a clock at rest.',
      alt: 'A curve of the time dilation factor against speed as a fraction of the speed of light from 0 to 0.98, near 1 at low speed and rising steeply to about 5 near 0.98, with 1.25 at 0.6, 1.67 at 0.8 and 2.29 at 0.9.',
    },
    {
      id: 'relativity-evidence', type: 'timeline', after: 2, layout: 'inline', title: 'Evidence for special relativity',
      events: [{ when: '1887', label: 'Michelson-Morley finds no ether wind' }, { when: '1905', label: 'Einstein publishes special relativity' }, { when: '1941', label: 'Rossi and Hall: fast muons reach the ground because their clocks run slow' }, { when: '1971', label: 'Hafele and Keating fly atomic clocks around the world' }],
      caption: 'Experiments and theory over eight decades; the 1905 paper sits between the experiment that prompted the question and the tests that followed.',
    },
  ],
  'lab-astronomy.l03': [
    {
      id: 'inverse-square', type: 'graph', after: 0, layout: 'inline', title: 'Gravity falls with distance squared',
      fn: r => 1 / (r * r), domain: [1, 5], x: { label: 'Distance (multiples of the starting distance)' }, y: { label: 'Force (starting force = 1)' },
      marks: [{ x: 2, label: '2x distance: 1/4' }, { x: 3, label: '3x distance: 1/9' }],
      caption: 'F is proportional to 1 / r squared, so doubling the distance leaves a quarter of the pull and tripling it leaves a ninth, as the lesson states.',
      alt: 'A steeply falling curve of relative gravitational force against distance from 1 to 5 times the starting distance, equal to 1 at distance 1, 0.25 at 2, about 0.11 at 3 and 0.04 at 5.',
    },
    {
      id: 'neptune-timeline', type: 'timeline', after: 2, layout: 'inline', title: 'Gravity predicts a planet',
      events: [{ when: '1687', label: 'Newton publishes the Principia with the law of universal gravitation' }, { when: '1846', label: "Le Verrier and Adams compute the position of an unseen planet from Uranus's irregular motion; Neptune is found close to it" }],
      caption: 'Neptune was the first planet located by calculation before it was seen.',
    },
  ],
  'lab-astronomy.l08': [
    {
      id: 'schwarzschild-radius', type: 'graph', after: 0, layout: 'inline', title: 'Event horizon radius against mass',
      fn: M => 2.953 * M, domain: [0, 20], x: { label: 'Mass (solar masses)' }, y: { label: 'Schwarzschild radius (km)' },
      marks: [{ x: 1, label: '1 solar mass: 3 km' }, { x: 10, label: '10 solar masses: 30 km' }],
      caption: 'The radius 2GM / c squared is proportional to mass: about 2.95 km per solar mass, so a 10 solar-mass black hole has a horizon roughly 30 km in radius.',
      alt: 'A straight line of Schwarzschild radius in kilometres against mass in solar masses from 0 to 20, with about 3 km at 1 solar mass, about 30 km at 10 and about 59 km at 20.',
    },
    {
      id: 'black-hole-milestones', type: 'timeline', after: 1, layout: 'inline', title: 'Black holes observed',
      events: [{ when: '2015', label: 'LIGO detects gravitational waves from two merging black holes' }, { when: '2019', label: 'Event Horizon Telescope images the shadow of the black hole in M87' }, { when: '2020', label: 'Nobel Prize in Physics recognises black-hole theory and the Galactic Centre discovery' }],
      caption: 'Three dated milestones from the lesson, from gravitational waves to a direct image.',
    },
  ],
  'lab-astronomy.l09': [
    {
      id: 'parallax-distance', type: 'graph', after: 1, layout: 'inline', title: 'Parallax angle and distance',
      fn: p => 1 / p, domain: [0.05, 1], x: { label: 'Parallax angle (arcseconds)' }, y: { label: 'Distance (parsecs)' },
      marks: [{ x: 0.25, label: '0.25 arcsec: 4 pc' }, { x: 0.1, label: '0.1 arcsec: 10 pc' }, { x: 0.5, label: '0.5 arcsec: 2 pc' }],
      caption: 'd = 1 / p. Halving the angle doubles the distance, which is why small, hard-to-measure angles mean distant stars. One parsec is about 3.26 light-years.',
      alt: 'A falling curve of distance in parsecs against parallax angle in arcseconds from 0.05 to 1, giving 2 parsecs at 0.5 arcseconds, 4 at 0.25, 10 at 0.1 and 20 at 0.05.',
    },
  ],
  'lab-astronomy.l10': [
    {
      id: 'distance-modulus', type: 'graph', after: 0, layout: 'inline', title: 'Distance modulus against distance',
      fn: d => 5 * Math.log10(d) - 5, domain: [1, 1000], x: { label: 'Distance (parsecs)' }, y: { label: 'm - M (magnitudes)' },
      marks: [{ x: 10, label: '10 pc: 0' }, { x: 100, label: '100 pc: 5' }, { x: 1000, label: '1000 pc: 10' }],
      caption: 'm - M = 5 log10(d) - 5. At 10 parsecs apparent and absolute magnitude are equal; every tenfold increase in distance adds 5 magnitudes.',
      alt: 'A slowly rising logarithmic curve of m minus M against distance in parsecs from 1 to 1000, equal to 0 at 10 parsecs, 5 at 100 parsecs and 10 at 1000 parsecs.',
    },
    {
      id: 'distance-ladder', type: 'diagram', after: 2, layout: 'wide', title: 'The cosmic distance ladder',
      nodes: [{ id: 'par', label: 'Parallax: nearby stars', col: 0, row: 0 }, { id: 'cep', label: 'Cepheid variables', col: 1, row: 0 }, { id: 'sn', label: 'Type Ia supernovae', col: 2, row: 0 }],
      edges: [['par', 'cep', 'calibrates'], ['cep', 'sn', 'calibrates']],
      caption: 'Each method is calibrated by the one before it, so an error in the first rung carries into every later one.',
    },
  ],
  'lab-astronomy.l11': [
    {
      id: 'hubble-law', type: 'graph', after: 1, layout: 'inline', title: "Hubble's law with H0 = 70",
      fn: d => 70 * d, domain: [0, 300], x: { label: 'Distance (megaparsecs)' }, y: { label: 'Recession speed (km/s)' },
      marks: [{ x: 100, label: '100 Mpc: 7000 km/s' }, { x: 200, label: '200 Mpc: 14000 km/s' }],
      caption: 'v = H0 d with H0 taken as 70 km/s per megaparsec, the value used in the lesson. The straight line means speed is proportional to distance.',
      alt: 'A straight line of recession speed in kilometres per second against distance in megaparsecs from 0 to 300, reaching 7000 at 100 megaparsecs, 14000 at 200 and 21000 at 300.',
    },
    {
      id: 'redshift-example', type: 'diagram', after: 0, layout: 'wide', title: 'A worked redshift',
      nodes: [{ id: 'em', label: 'Emitted: 600 nm', col: 0, row: 0 }, { id: 'st', label: 'Light stretched on its journey', col: 1, row: 0 }, { id: 'ob', label: 'Observed: 660 nm, z = 0.1', col: 2, row: 0 }],
      edges: [['em', 'st'], ['st', 'ob', 'z = (660 - 600) / 600']],
      caption: 'The lesson example: a line emitted at 600 nm and observed at 660 nm has z = 60 / 600 = 0.1.',
    },
  ],
  'lab-engineering.l03': [
    {
      id: 'stretch-vs-length', type: 'graph', after: 2, layout: 'inline', title: 'Steel cable stretch against length',
      fn: L => 1e4 * L / (1e-4 * 200e9) * 1000, domain: [0, 20], x: { label: 'Length (m)' }, y: { label: 'Elongation (mm)' },
      marks: [{ x: 10, label: '10 m: 5 mm' }],
      caption: 'A worked case from the lesson: 10 kN load, 100 mm2 area, E = 200 GPa. Elongation PL / AE is proportional to length, so doubling the length doubles the stretch.',
      alt: 'A straight line of elongation in millimetres against cable length in metres from 0 to 20, passing 5 millimetres at 10 metres and 10 millimetres at 20 metres.',
    },
    {
      id: 'stretch-vs-area', type: 'graph', after: 2, layout: 'inline', title: 'Stretch of a 10 m cable against area',
      fn: A => 1e4 * 10 / (A * 1e-6 * 200e9) * 1000, domain: [50, 400], x: { label: 'Cross-sectional area (mm2)' }, y: { label: 'Elongation (mm)' },
      marks: [{ x: 100, label: '100 mm2: 5 mm' }, { x: 200, label: '200 mm2: 2.5 mm' }],
      caption: 'Same load and material, varying the area. Doubling the area from 100 to 200 mm2 halves the stretch from 5 mm to 2.5 mm.',
      alt: 'A falling curve of elongation in millimetres against cross-sectional area in square millimetres from 50 to 400, giving 10 millimetres at 50, 5 at 100, 2.5 at 200 and 1.25 at 400.',
    },
  ],
  'lab-engineering.l05': [
    {
      id: 'buckling-length', type: 'graph', after: 2, layout: 'inline', title: 'Critical buckling load against column length',
      fn: L => 1 / (L * L), domain: [1, 4], x: { label: 'Length (multiples of the shortest column)' }, y: { label: 'Critical load (shortest = 1)' },
      marks: [{ x: 2, label: '2x length: 1/4' }, { x: 3, label: '3x length: 1/9' }],
      caption: 'Euler load is proportional to 1 / L squared when E, I and the end conditions are unchanged, so a column twice as long buckles at a quarter of the load.',
      alt: 'A steeply falling curve of relative critical buckling load against relative column length from 1 to 4, equal to 1 at length 1, 0.25 at 2, about 0.11 at 3 and 0.06 at 4.',
    },
    {
      id: 'effective-length-k', type: 'chart', kind: 'scatter', after: 2, layout: 'inline', title: 'End conditions change the buckling load',
      x: { label: 'Effective-length factor K' }, y: { label: 'Critical load (pinned-pinned = 1)' },
      series: [{ name: 'Relative critical load, 1 / K squared', points: [[0.5, 4], [0.7, 2.04], [1, 1], [2, 0.25]] }],
      caption: 'Theoretical factors: fixed-fixed K = 0.5, fixed-pinned about 0.7, pinned-pinned 1, fixed-free 2. Because K is squared, restraining the ends is a powerful way to raise capacity.',
      alt: 'A scatter chart of relative critical load against effective-length factor: 4 at K 0.5, about 2.04 at K 0.7, 1 at K 1 and 0.25 at K 2.',
    },
  ],
  'lab-engineering.l08': [
    {
      id: 'carnot-limit', type: 'graph', after: 1, layout: 'inline', title: 'Carnot efficiency with a 300 K cold side',
      fn: T => 1 - 300 / T, domain: [300, 1500], x: { label: 'Hot reservoir temperature (K)' }, y: { label: 'Maximum efficiency (fraction)' },
      marks: [{ x: 600, label: '600 K: 0.50' }, { x: 900, label: '900 K: 0.67' }, { x: 1200, label: '1200 K: 0.75' }],
      caption: 'eta = 1 - T_C / T_H with T_C = 300 K. Raising the hot temperature lifts the ceiling, but with diminishing returns, and it never reaches 1.',
      alt: 'A rising curve of maximum Carnot efficiency against hot reservoir temperature in kelvin from 300 to 1500 with the cold side at 300 kelvin, giving 0.5 at 600 K, 0.67 at 900 K, 0.75 at 1200 K and 0.8 at 1500 K.',
    },
    {
      id: 'heat-engine-flow', type: 'diagram', after: 2, layout: 'wide', title: 'A heat engine',
      nodes: [{ id: 'hot', label: 'Hot reservoir T_H', col: 0, row: 0 }, { id: 'eng', label: 'Engine', col: 1, row: 0 }, { id: 'cold', label: 'Cold reservoir T_C', col: 2, row: 0 }, { id: 'work', label: 'Useful work W', col: 1, row: 1 }],
      edges: [['hot', 'eng', 'heat in'], ['eng', 'cold', 'heat rejected'], ['eng', 'work']],
      caption: 'Heat flows from hot to cold through the engine, and some of it is turned into work. Carnot efficiency bounds the ratio of work to heat in.',
    },
  ],
  'lab-engineering.l10': [
    {
      id: 'power-vs-current', type: 'graph', after: 1, layout: 'inline', title: 'Power in a 4 ohm resistor',
      fn: I => I * I * 4, domain: [0, 5], x: { label: 'Current (A)' }, y: { label: 'Power (W)' },
      marks: [{ x: 1.5, label: '1.5 A: 9 W' }, { x: 3, label: '3 A: 36 W' }],
      caption: 'P = I squared R for R = 4 ohms. Doubling the current from 1.5 A to 3 A quadruples the heat, from 9 W to 36 W.',
      alt: 'A rising parabola of power in watts against current in amperes from 0 to 5 for a 4 ohm resistor, giving 9 watts at 1.5 amperes, 36 watts at 3 amperes and 100 watts at 5 amperes.',
    },
    {
      id: 'ohm-line', type: 'graph', after: 0, layout: 'inline', title: 'Voltage against current for a 4 ohm resistor',
      fn: I => 4 * I, domain: [0, 5], x: { label: 'Current (A)' }, y: { label: 'Voltage (V)' },
      marks: [{ x: 3, label: '3 A: 12 V' }],
      caption: 'An ideal resistor gives a straight line whose slope is the resistance, V = I R. A 12 V supply drives 3 A through 4 ohms.',
      alt: 'A straight line of voltage in volts against current in amperes from 0 to 5 with slope 4 ohms, passing 12 volts at 3 amperes and 20 volts at 5 amperes.',
    },
  ],
  'lab-engineering.l13': [
    {
      id: 'shannon-capacity', type: 'graph', after: 2, layout: 'inline', title: 'Channel capacity for a 1 MHz bandwidth',
      fn: sn => Math.log2(1 + sn), domain: [0, 15], x: { label: 'Signal-to-noise ratio (power ratio)' }, y: { label: 'Capacity (Mbit/s)' },
      marks: [{ x: 3, label: 'S/N 3: 2 Mbit/s' }, { x: 15, label: 'S/N 15: 4 Mbit/s' }],
      caption: 'C = B log2(1 + S/N) with B = 1 MHz, so capacity in Mbit/s equals log2(1 + S/N). Capacity grows only logarithmically with signal quality: S/N 3 gives 2 Mbit/s, S/N 15 gives 4.',
      alt: 'A rising, flattening curve of channel capacity in megabits per second against signal-to-noise power ratio from 0 to 15 for a 1 megahertz channel, giving 1 at ratio 1, 2 at ratio 3 and 4 at ratio 15.',
    },
    {
      id: 'semiconductor-milestones', type: 'timeline', after: 1, layout: 'inline', title: 'From transistor to information theory',
      events: [{ when: '1947', label: 'Bardeen and Brattain of the Bell Labs group led by Shockley demonstrate the first transistor' }, { when: '1948', label: 'Shannon defines the bit and the channel-capacity limit' }, { when: '1958-59', label: 'Kilby and Noyce develop the integrated circuit' }],
      caption: 'Switching got cheap, then the theory of how fast information can move was set, then many devices were put on one chip.',
    },
  ],
};
