import type { Figure } from '../../components/learn/lesson/figures';

const r = (v: number, d = 4) => +v.toFixed(d);
const PI_X = [1, 2, 3, 4, 5, 6];
const PI_TRUE = [4, 25, 168, 1229, 9592, 78498];
const harm = (n: number) => { let s = 0; for (let k = 1; k <= n; k++) s += 1 / k; return s; };
const basel = (n: number) => { let s = 0; for (let k = 1; k <= n; k++) s += 1 / (k * k); return s; };
const K_LIST = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PRIMES = [2, 3, 5, 7, 11, 13];
const partialZeta = PRIMES.map((_, i) => PRIMES.slice(0, i + 1).reduce((a, p) => a / (1 - 1 / (p * p)), 1));
const TH = Array.from({ length: 32 }, (_, i) => r(i * 0.2, 1));
const phi = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));

export const FIGURES: Record<string, Figure[]> = {
  'lab-mathematics.l02': [{
    id: 'euclid-flow', type: 'diagram', after: 1, layout: 'wide', title: "Euclid's proof by contradiction",
    nodes: [
      { id: 'a', label: 'Assume finitely many primes', col: 0, row: 0 },
      { id: 'b', label: 'Form N = product + 1', col: 1, row: 0 },
      { id: 'c', label: 'Every listed prime leaves remainder 1', col: 2, row: 0 },
      { id: 'd', label: 'N has a prime factor not on the list', col: 3, row: 0 },
      { id: 'e', label: 'Contradiction: primes never end', col: 4, row: 0 },
    ],
    edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']],
    caption: 'Each step follows from the one before, and the last step collides with the first assumption, so the assumption must be false.',
    alt: 'A five-step chain: assume finitely many primes, form N as their product plus 1, every listed prime leaves remainder 1, N therefore has a prime factor not on the list, which contradicts the assumption so the primes never end.',
  }],
  'lab-mathematics.l05': [{
    id: 'pnt-ratio', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'How good is x / ln x?',
    x: { label: 'x, as a power of ten (1 means 10, 6 means 1,000,000)' }, y: { label: 'pi(x) divided by x / ln x' },
    series: [{ name: 'Actual count over estimate', points: PI_X.map((k, i) => [k, r(PI_TRUE[i] / (Math.pow(10, k) / Math.log(Math.pow(10, k))), 3)] as [number, number]) }],
    credit: 'Prime counts pi(10^k) are standard published values (4, 25, 168, 1229, 9592, 78498)',
    caption: 'The ratio of the true prime count to x / ln x stays near 1 and drifts toward it: about 1.16 at 1,000 and 1.08 at 1,000,000, matching the lesson (78,498 against about 72,382).',
    alt: 'A line chart of the ratio of the prime count to x over ln x at x equal to 10, 100, 1,000, 10,000, 100,000 and 1,000,000. The ratio is about 0.92, 1.15, 1.16, 1.13, 1.10 and 1.08, always close to 1 and slowly falling toward it after 1,000.',
  }],
  'lab-mathematics.l06': [{
    id: 'euler-product', type: 'chart', kind: 'bar', after: 2, layout: 'inline', title: 'Euler product at s = 2, one prime at a time',
    x: { label: 'Number of primes included (2, 3, 5, 7, 11, 13)' }, y: { label: 'Partial product' },
    series: [{ name: 'Partial product', points: partialZeta.map((v, i) => [i + 1, r(v, 4)] as [number, number]) }, { name: 'pi squared over 6', points: partialZeta.map((_, i) => [i + 1, r(Math.PI ** 2 / 6, 4)] as [number, number]) }],
    caption: 'A computed illustration: multiplying in each prime factor 1 / (1 - p^-2) gives 1.333, 1.5, 1.5625 and on up toward pi squared over 6, about 1.645.',
    alt: 'A bar chart of partial Euler products at s = 2 using the first one to six primes: 1.3333, 1.5, 1.5625, 1.5951, 1.6083 and 1.6179, each below the limit pi squared over 6 of about 1.6449.',
  }],
  'lab-mathematics.l07': [
    {
      id: 'two-roots', type: 'graph', after: 2, layout: 'inline', title: 'x² − 5x + 6: positive discriminant',
      fn: x => x * x - 5 * x + 6, domain: [0, 5], x: { label: 'x' }, y: { label: 'y' },
      marks: [{ x: 2, label: 'root x = 2' }, { x: 3, label: 'root x = 3' }],
      caption: 'The discriminant is 25 - 24 = 1, which is positive, so the parabola crosses the x-axis twice, at x = 2 and x = 3.',
      alt: 'An upward parabola y = x squared minus 5x plus 6 crossing the x-axis at x = 2 and x = 3, with its lowest point at x = 2.5 where y = -0.25.',
    },
    {
      id: 'no-roots', type: 'graph', after: 3, layout: 'inline', title: 'x² + 2x + 5: negative discriminant',
      fn: x => x * x + 2 * x + 5, domain: [-4, 2], x: { label: 'x' }, y: { label: 'y' },
      marks: [{ x: -1, label: 'vertex (-1, 4)' }],
      caption: 'The discriminant is 4 - 20 = -16, so the curve stays above the x-axis: its lowest point is y = 4 and there are no real roots.',
      alt: 'An upward parabola y = x squared plus 2x plus 5 whose vertex is at (-1, 4) and which never touches the x-axis.',
    },
  ],
  'lab-mathematics.l10': [{
    id: 'area-x2', type: 'graph', after: 2, layout: 'inline', title: 'Area under y = x² from 0 to 3',
    fn: x => x * x, domain: [0, 3.5], x: { label: 'x' }, y: { label: 'y = x²' },
    marks: [{ x: 3, label: 'x = 3, y = 9' }],
    caption: 'The area under the curve from 0 to 3 equals the antiderivative x³/3 evaluated at 3 minus its value at 0: 27/3 = 9.',
    alt: 'The curve y = x squared rising from 0 at x = 0 to 9 at x = 3; the region under it between x = 0 and x = 3 has area 9.',
  }],
  'lab-mathematics.l11': [{
    id: 'harmonic-basel', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'Two series whose terms shrink to zero',
    x: { label: 'k, where the sum has 2^k terms' }, y: { label: 'Partial sum' },
    series: [{ name: 'Harmonic 1 + 1/2 + 1/3 + ...', points: K_LIST.map(k => [k, r(harm(2 ** k), 3)] as [number, number]) }, { name: 'Reciprocal squares 1 + 1/4 + 1/9 + ...', points: K_LIST.map(k => [k, r(basel(2 ** k), 3)] as [number, number]) }],
    caption: 'A computed illustration. The harmonic sum keeps climbing by roughly 0.69 each time the number of terms doubles; the reciprocal squares level off just under pi squared over 6, about 1.645.',
    alt: 'A line chart for sums of 1, 2, 4 up to 1,024 terms. The harmonic series rises from 1 to about 7.5 and keeps rising; the reciprocal-squares series rises from 1 and flattens near 1.64.',
  }],
  'lab-mathematics.l12': [{
    id: 'euler-cos-sin', type: 'chart', kind: 'line', after: 2, layout: 'wide', title: 'Real and imaginary parts of e^(i theta)',
    x: { label: 'theta', unit: 'radians' }, y: { label: 'Value' },
    series: [{ name: 'cos(theta), real part', points: TH.map(t => [t, r(Math.cos(t), 3)] as [number, number]) }, { name: 'sin(theta), imaginary part', points: TH.map(t => [t, r(Math.sin(t), 3)] as [number, number]) }],
    caption: "Euler's formula packs both waves into one rotating point. At theta = pi/2 the cosine is 0 and the sine is 1, giving i; at theta = pi (about 3.14) the cosine is -1 and the sine is 0, giving -1.",
    alt: 'Two wave curves from theta 0 to about 6.2 radians. Cosine starts at 1, crosses 0 near 1.57 and reaches -1 near 3.14; sine starts at 0, peaks at 1 near 1.57 and returns to 0 near 3.14.',
  }],
  'lab-data.l02': [{
    id: 'normal-heights', type: 'graph', after: 2, layout: 'inline', title: 'Adult heights: mean 170 cm',
    fnp: (x, sd) => phi(x, 170, sd), param: { name: 'Spread (SD, cm)', min: 5, max: 20, step: 1, value: 10 }, domain: [130, 210], x: { label: 'Height (cm)' }, y: { label: 'Probability density' },
    marks: [{ x: 150, label: '150' }, { x: 160, label: '160' }, { x: 170, label: 'mean 170' }, { x: 180, label: '180' }, { x: 190, label: '190' }],
    caption: 'A modelled example from the lesson, not survey data. Slide the spread to see a narrower or wider population; the figures below are for the starting spread of 10 cm. About 68 percent of people fall between 160 and 180 cm and about 95 percent between 150 and 190 cm.',
    alt: 'A symmetric bell curve centred at 170 cm with peak density about 0.04, with marks at 150, 160, 170, 180 and 190 cm.',
  }],
  'lab-data.l03': [{
    id: 'standard-error', type: 'graph', after: 1, layout: 'inline', title: 'Standard error shrinks with the square root of n',
    fn: n => 20 / Math.sqrt(n), domain: [1, 100], x: { label: 'Sample size n' }, y: { label: 'Standard error (sigma = 20)' },
    marks: [{ x: 25, label: 'n = 25: 4' }, { x: 100, label: 'n = 100: 2' }],
    caption: 'With sigma = 20, n = 25 gives a standard error of 4 and n = 100 gives 2: four times the data halves the uncertainty.',
    alt: 'A falling curve of 20 divided by the square root of n for n from 1 to 100, passing through 4 at n = 25 and 2 at n = 100.',
  }],
  'lab-data.l04': [{
    id: 'base-rate-tree', type: 'diagram', after: 1, layout: 'wide', title: 'Base rate: 1000 people, a 1 percent disease',
    nodes: [
      { id: 'all', label: '1000 people', col: 0, row: 1 },
      { id: 'sick', label: '10 sick', col: 1, row: 0 },
      { id: 'well', label: '990 healthy', col: 1, row: 2 },
      { id: 'sp', label: '9 test positive', col: 2, row: 0 },
      { id: 'wp', label: '99 test positive', col: 2, row: 2 },
    ],
    edges: [['all', 'sick', '1 percent'], ['all', 'well', '99 percent'], ['sick', 'sp', '90 percent'], ['well', 'wp', '10 percent']],
    caption: 'Of 108 positive tests, only 9 are real: 9 / 108, about 8 percent. The test is accurate, but the disease is rare, so false positives dominate.',
    alt: 'A tree starting with 1000 people, splitting into 10 sick and 990 healthy. Of the sick, 9 test positive; of the healthy, 99 test positive. So 9 of 108 positives are truly sick, about 8 percent.',
  }],
  'lab-data.l05': [{
    id: 'multiple-tests', type: 'chart', kind: 'bar', after: 2, layout: 'inline', title: 'Many tests, many chances for a false alarm',
    x: { label: 'Independent tests run (no real effects)' }, y: { label: 'Chance of at least one false positive' },
    series: [{ name: 'At alpha = 0.05', points: [1, 5, 10, 20].map(m => [m, r(1 - Math.pow(0.95, m), 3)] as [number, number]) }],
    caption: 'A computed model: the chance of at least one false positive is 1 - 0.95^m. It is 5 percent for one test but about 64 percent for twenty.',
    alt: 'A bar chart of the probability of at least one false positive at alpha 0.05: about 0.05 for 1 test, 0.226 for 5, 0.401 for 10 and 0.642 for 20 tests.',
  }],
  'lab-data.l09': [{
    id: 'sigmoid', type: 'graph', after: 1, layout: 'inline', title: 'The sigmoid function',
    fn: z => 1 / (1 + Math.exp(-z)), domain: [-6, 6], x: { label: 'Score z (log-odds)' }, y: { label: 'Probability sigma(z)' },
    marks: [{ x: 0, label: 'z = 0: 0.5' }, { x: 2, label: 'z = 2: about 0.88' }],
    caption: 'Any score is squashed into the range 0 to 1. A score of 0 gives probability 0.5, and the spam example with z = 2 gives about 0.88.',
    alt: 'An S-shaped curve rising from near 0 at z = -6 to near 1 at z = 6, equal to 0.5 at z = 0 and about 0.88 at z = 2.',
  }],
};
