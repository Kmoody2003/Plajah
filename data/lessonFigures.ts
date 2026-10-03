/**
 * Authored figures for built-in lessons, keyed by lesson id. A figure is data, not a picture: charts and graphs are drawn from
 * numbers, diagrams from nodes and edges, timelines from dated events, and archive plates are SEARCHES resolved live against
 * the Library of Congress and museum open-access collections (see data/lessonMediaMap.ts for the same rule). Every figure has
 * a caption that states the teaching point in our words and, where the data is measured, where it came from.
 *
 * This starter set shows each subject recipe once. Add more per lesson; a lesson with no entry simply has no figures.
 */
import type { Figure } from '../components/learn/lesson/figures';
import { FIGURES as MATH_DATA } from './lessonFigures/math-data';
import { FIGURES as PHYSICS_SPACE } from './lessonFigures/physics-space';
import { FIGURES as CHEM_LIFE_EARTH } from './lessonFigures/chem-life-earth';
import { FIGURES as CS_MIND_HISTORY } from './lessonFigures/cs-mind-history';
import { FIGURES as HISTORY_CIVICS } from './lessonFigures/history-civics';
import { FIGURES as ARTS_MUSIC_FINANCE } from './lessonFigures/arts-music-finance';
import { FIGURES as LAW } from './lessonFigures/law';
import { FIGURES as MEDICINE } from './lessonFigures/medicine';

const logistic = (t: number, K = 1000, N0 = 10, r = 0.6) => K / (1 + ((K - N0) / N0) * Math.exp(-r * t));
const expo = (t: number, N0 = 10, r = 0.6) => N0 * Math.exp(r * t);
const T_RANGE = Array.from({ length: 10 }, (_, i) => i);

export const LESSON_FIGURES: Record<string, Figure[]> = {
  // Science: a measured relationship, drawn from data.
  'lab-astronomy.l02': [{
    id: 'kepler-t-a', type: 'graph', after: 1, layout: 'inline', title: 'Orbital period against distance',
    fn: a => Math.pow(a, 1.5), domain: [0, 10], x: { label: 'Distance from the Sun (AU)' }, y: { label: 'Orbital period (years)' },
    marks: [{ x: 1, label: 'Earth' }, { x: 5.203, label: 'Jupiter' }, { x: 9.537, label: 'Saturn' }],
    caption: 'Kepler\'s third law: the square of a planet\'s period is proportional to the cube of its average distance, so T = a to the power 1.5 when a is in AU and T in years. Earth, Jupiter and Saturn sit on the curve.',
    alt: 'A rising curve of orbital period in years against distance from the Sun in astronomical units, with Earth at 1 and 1, Jupiter at about 5.2 and 11.9, and Saturn at about 9.5 and 29.5.',
  }],
  'lab-biology.l11': [{
    id: 'growth-curves', type: 'chart', kind: 'line', after: 1, layout: 'inline', title: 'Two ways a population can grow',
    x: { label: 'Time', unit: 'generations' }, y: { label: 'Individuals' },
    series: [{ name: 'Unlimited growth', points: T_RANGE.map(t => [t, +expo(t).toFixed(1)] as [number, number]) }, { name: 'Limited by resources', points: T_RANGE.map(t => [t, +logistic(t).toFixed(1)] as [number, number]) }],
    caption: 'A worked model, not field data: both start at 10 individuals and grow at the same rate. After 9 generations the unlimited population is near 2,200 and the limited one near 690, slowing as it approaches its carrying capacity of 1,000.',
  }],
  'lab-biology.l03': [{
    id: 'central-dogma', type: 'diagram', after: 0, layout: 'wide', title: 'The central dogma',
    nodes: [{ id: 'dna', label: 'DNA', col: 0, row: 0 }, { id: 'rna', label: 'messenger RNA', col: 1, row: 0 }, { id: 'pro', label: 'Protein', col: 2, row: 0 }],
    edges: [['dna', 'rna', 'transcription'], ['rna', 'pro', 'translation']],
    caption: 'Information in a gene is copied from DNA into messenger RNA, then read to build a protein.',
  }],
  'lab-physics.l01': [{
    id: 'free-fall-v', type: 'graph', after: 1, layout: 'inline', title: 'A falling object speeds up steadily',
    fn: t => 9.8 * t, domain: [0, 5], x: { label: 'Time (s)' }, y: { label: 'Speed (m/s)' }, marks: [{ x: 1, label: '9.8 m/s' }, { x: 3, label: '29.4 m/s' }],
    caption: 'Dropped from rest with air resistance ignored, speed grows by about 9.8 metres per second every second, a constant acceleration.',
  }],
  // Math: the shape the algebra describes.
  'lab-mathematics.l07': [{
    id: 'quadratic', type: 'graph', after: 1, layout: 'inline', title: 'y = x² − 2x − 3',
    fn: x => x * x - 2 * x - 3, domain: [-3, 5], x: { label: 'x' }, y: { label: 'y' }, marks: [{ x: -1, label: 'root x = −1' }, { x: 3, label: 'root x = 3' }, { x: 1, label: 'vertex (1, −4)' }],
    caption: 'The roots are where the curve crosses the x-axis; the quadratic formula finds them without drawing. The vertex sits halfway between them.',
  }],
  'music-theory.l08': [{
    id: 'octave-wave', type: 'graph', after: 1, layout: 'inline', title: 'A 440 Hz tone (the A above middle C)',
    fn: ms => Math.sin(2 * Math.PI * 440 * (ms / 1000)), domain: [0, 6.8], x: { label: 'Time (ms)' }, y: { label: 'Pressure (relative)' },
    caption: 'One cycle lasts about 2.27 milliseconds. A note an octave higher, at 880 Hz, fits twice as many cycles into the same time: the 2:1 ratio.',
  }],
  // History / civics: a dated sequence and an archive plate.
  'history-europe.l12': [
    { id: 'plague-timeline', type: 'timeline', after: 0, layout: 'inline', title: 'The Black Death in Europe', events: [{ when: '1347', label: 'Plague arrives by ship at Sicilian ports' }, { when: '1348', label: 'It spreads across Italy, France and into England' }, { when: '1349', label: 'It reaches Scandinavia' }, { when: 'Early 1350s', label: 'The first great wave subsides across most of Europe; plague returns in later outbreaks' }], caption: 'Dates are the standard outline; exact arrival varies by town.' },
  ],
  // Art: the work itself, large, with its museum credit.
  'art-movements-modern.l02': [{
    id: 'cezanne-plate', type: 'plate', after: 1, layout: 'wide', ref: { kind: 'image', q: 'Cezanne Mont Sainte-Victoire', limit: 1 },
    caption: 'Look at how Cezanne builds the mountain from patches of colour rather than outlines. Find the plate in the museum record linked below.',
  }],
};

// Batch-authored sets (data/lessonFigures/BRIEF.md). Hand-authored entries above win when a lesson appears in both.
for (const set of [MATH_DATA, PHYSICS_SPACE, CHEM_LIFE_EARTH, CS_MIND_HISTORY, HISTORY_CIVICS, ARTS_MUSIC_FINANCE, LAW, MEDICINE]) for (const [id, figs] of Object.entries(set)) if (!LESSON_FIGURES[id]) LESSON_FIGURES[id] = figs;

// Interactive simulators (components/learn/lesson/Sims.tsx), appended to the lesson's other figures.
const SIMS: Record<string, Figure[]> = {
  'lab-mathematics.l12': [{ id: 'unit-circle-sim', type: 'sim', sim: 'unitcircle', after: 2, layout: 'wide', title: 'Walk around the unit circle',
    caption: 'Drag the angle: the point (cos theta, sin theta) always lies 1 unit from the centre, which is why cos squared plus sin squared is always 1.' }],
  'lab-environment.l03': [{ id: 'logistic-sim', type: 'sim', sim: 'population', after: 2, layout: 'wide', title: 'Change the limits on a population',
    caption: 'A modelled population starting at 10 individuals: logistic growth levels off at the carrying capacity K, and a faster growth rate r gets there sooner. Not field data.' }],
  'lab-cs.l07': [{ id: 'bubble-sim', type: 'sim', sim: 'sorting', after: 2, layout: 'wide', title: 'Watch a sort compare and swap',
    caption: 'Bubble sort is one simple way to sort by comparing pairs. Other methods use fewer comparisons, but the lower bound in this lesson applies to every method that sorts by comparison.' }],
};
for (const [id, figs] of Object.entries(SIMS)) LESSON_FIGURES[id] = [...(LESSON_FIGURES[id] || []), ...figs];
