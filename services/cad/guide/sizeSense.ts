// Size sense: turns millimetres and square metres into things a ten-year-old can picture.
// Every comparison uses everyday objects with well-known sizes (rounded on purpose).

const LENGTHS: Array<[number, string]> = [
  [150, 'a pencil'], [300, 'a school ruler'], [500, 'a skateboard deck, nose to tail'], [800, 'a doorway is wide'],
  [1000, 'a big step for a grown-up (1 m)'], [1800, 'a tall grown-up'], [2000, 'a door is tall'], [2100, 'a queen bed'], [3000, 'a small bedroom wall'],
  [4500, 'a family car'], [7000, 'half a school bus'], [12000, 'a school bus'], [20000, 'two school buses end to end'], [30000, 'a basketball court is long'],
];
const AREAS: Array<[number, string]> = [
  [1, 'a bath mat (1 m²)'], [3.2, 'a queen bed'], [6.5, 'a big rug'], [12.5, 'one parking space'], [20, 'a classroom carpet'],
  [40, 'a two-car garage'], [100, 'a small apartment'], [200, 'half a tennis court'], [420, 'a basketball court'],
];

const near = <T,>(list: Array<[number, T]>, v: number) => list.reduce((b, x) => (Math.abs(Math.log(x[0] / v)) < Math.abs(Math.log(b[0] / v)) ? x : b));

/** "about as long as a family car" for a length in mm. */
export function feelLength(mm: number): string {
  if (!(mm > 0)) return '';
  const [ref, what] = near(LENGTHS, mm); const r = mm / ref;
  if (r > 0.85 && r < 1.18) return `about as long as ${what}`;
  if (r >= 1.18 && r < 1.6) return `a bit longer than ${what}`;
  if (r > 0.6 && r <= 0.85) return `a bit shorter than ${what}`;
  const times = Math.round(r * 2) / 2; return `about ${times} × ${what}`;
}

/** "about the size of one parking space" for an area in m². */
export function feelArea(m2: number): string {
  if (!(m2 > 0)) return '';
  const [ref, what] = near(AREAS, m2); const r = m2 / ref;
  if (r > 0.85 && r < 1.18) return `about the size of ${what}`;
  if (r >= 1.18 && r < 1.6) return `a bit bigger than ${what}`;
  if (r > 0.6 && r <= 0.85) return `a bit smaller than ${what}`;
  const times = Math.round(r * 2) / 2; return `about ${times} × ${what}`;
}

/** Room size against the typical range for its kind: 'small' | 'typical' | 'roomy'. */
export function sizeVerdict(m2: number, typical: [number, number]): 'small' | 'typical' | 'roomy' {
  return m2 < typical[0] ? 'small' : m2 > typical[1] ? 'roomy' : 'typical';
}
