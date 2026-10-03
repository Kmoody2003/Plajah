import type { Figure } from '../../components/learn/lesson/figures';

const NS = Array.from({ length: 16 }, (_, i) => i * 10);
const log2fact = (n: number) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log2(i); return s; };
const SORT_N = [1, 2, 3, 4, 5, 6, 7, 8];
const HALF_K = Array.from({ length: 11 }, (_, i) => i);
const AIMD_T = Array.from({ length: 31 }, (_, i) => i);
const aimd = (t: number) => 10 + (t % 11);

export const FIGURES: Record<string, Figure[]> = {
  'lab-cs.l05': [{
    id: 'bigo-crossover', type: 'chart', kind: 'line', after: 3, layout: 'inline', title: 'A constant factor against a faster growth rate',
    x: { label: 'Input size n' }, y: { label: 'Steps' },
    series: [{ name: 'Algorithm A: 100n', points: NS.map(n => [n, 100 * n] as [number, number]) }, { name: 'Algorithm B: n squared', points: NS.map(n => [n, n * n] as [number, number]) }],
    caption: 'Computed from the two formulas in the text. B is cheaper below n = 100, the two are equal at n = 100 (10,000 steps), and beyond that the quadratic algorithm falls ever further behind.',
    alt: 'Two lines of steps against input size n from 0 to 150. Algorithm A, 100n, is a straight line. Algorithm B, n squared, is a curve that is below A until n = 100, where both equal 10,000, then rises above it, reaching 22,500 at n = 150.',
  }],
  'lab-cs.l06': [{
    id: 'halving-steps', type: 'chart', kind: 'line', after: 3, layout: 'inline', title: 'Halving 1,024 items down to one',
    x: { label: 'Halving steps' }, y: { label: 'Items remaining' },
    series: [{ name: 'Items left', points: HALF_K.map(k => [k, 1024 / Math.pow(2, k)] as [number, number]) }],
    caption: 'Each step halves the problem, so 1,024 items reach 1 after 10 steps because 2 to the 10th is 1,024. This is why halving algorithms are logarithmic.',
    alt: 'A line falling steeply from 1,024 items at step 0 to 512 at step 1, 256 at step 2, and so on down to 1 item at step 10.',
  }],
  'lab-cs.l07': [{
    id: 'sort-lower-bound', type: 'chart', kind: 'bar', after: 3, layout: 'inline', title: 'Fewest comparisons any sort must allow for',
    x: { label: 'Number of items n' }, y: { label: 'Comparisons, worst case' },
    series: [{ name: 'Lower bound: ceiling of log2(n!)', points: SORT_N.map(n => [n, Math.ceil(log2fact(n) - 1e-9)] as [number, number]) }],
    caption: 'Computed from the decision-tree argument: k comparisons give at most 2^k outcomes, which must cover n! orderings. Three items give 3, matching the text, and the bound climbs to 16 for eight items.',
    alt: 'Bars of the minimum worst-case comparisons for sorting n items: 0 for one, 1 for two, 3 for three, 5 for four, 7 for five, 10 for six, 13 for seven and 16 for eight.',
  }],
  'lab-neuroscience.l03': [{
    id: 'ap-sequence', type: 'diagram', after: 0, layout: 'wide', title: 'The stages of an action potential',
    nodes: [{ id: 'th', label: 'Input depolarises past threshold', col: 0, row: 0 }, { id: 'na', label: 'Sodium channels open', col: 1, row: 0 }, { id: 'up', label: 'Sodium enters, inside turns positive', col: 2, row: 0 }, { id: 'k', label: 'Sodium channels inactivate, potassium channels open', col: 3, row: 0 }, { id: 're', label: 'Potassium leaves, membrane repolarises', col: 4, row: 0 }],
    edges: [['th', 'na'], ['na', 'up'], ['up', 'k'], ['k', 're']],
    caption: 'The spike is a fixed sequence of channel events, which is why it is all-or-nothing: once threshold is crossed the same chain runs every time.',
    alt: 'Five boxes in order: input depolarises past threshold, sodium channels open, sodium enters and the inside turns positive, sodium channels inactivate and potassium channels open, then potassium leaves and the membrane repolarises.',
  }],
  'lab-neuroscience.l04': [{
    id: 'synapse-steps', type: 'diagram', after: 0, layout: 'wide', title: 'Signalling across a chemical synapse',
    nodes: [{ id: 'ap', label: 'Action potential reaches terminal', col: 0, row: 0 }, { id: 'ca', label: 'Calcium channels open', col: 1, row: 0 }, { id: 'ves', label: 'Vesicles fuse and release transmitter', col: 2, row: 0 }, { id: 'rec', label: 'Transmitter binds receptors', col: 3, row: 0 }, { id: 'post', label: 'Next cell changes voltage', col: 4, row: 0 }],
    edges: [['ap', 'ca'], ['ca', 'ves'], ['ves', 'rec', 'across the cleft'], ['rec', 'post']],
    caption: 'The electrical signal becomes a chemical one and then electrical again. The cleft is about 20 nanometres wide, and the path runs one way.',
    alt: 'Five boxes in order: action potential reaches the terminal, calcium channels open, vesicles fuse and release transmitter, transmitter binds receptors across the cleft, and the next cell changes voltage.',
  }],
  'lab-neuroscience.l06': [{
    id: 'time-constant', type: 'graph', after: 2, layout: 'inline', title: 'Voltage rising with a 20 ms time constant',
    fn: t => 100 * (1 - Math.exp(-t / 20)), domain: [0, 100], x: { label: 'Time (ms)' }, y: { label: 'Percent of final voltage' },
    marks: [{ x: 20, label: 'tau: 63%' }, { x: 60, label: '3 tau: 95%' }],
    caption: 'A worked model using the lesson example, tau = 20 ms. After one time constant the voltage has reached about 63 percent of its final value, and after three about 95 percent.',
    alt: 'A curve rising from 0 percent and levelling toward 100 percent. At 20 ms it is about 63 percent and at 60 ms about 95 percent.',
  }, {
    id: 'length-constant', type: 'graph', after: 2, layout: 'inline', title: 'Passive signal fading with distance',
    fn: x => 100 * Math.exp(-x), domain: [0, 4], x: { label: 'Distance (in length constants)' }, y: { label: 'Percent of starting size' },
    marks: [{ x: 1, label: 'lambda: 37%' }, { x: 2, label: '2 lambda: 14%' }],
    caption: 'A worked model: a passive signal decays exponentially, falling to about 37 percent of its starting size at one length constant and about 14 percent at two. This is why long distances need spikes.',
    alt: 'A decaying curve from 100 percent at distance zero to about 37 percent at one length constant, about 14 percent at two and under 2 percent at four.',
  }],
  'lab-networks.l03': [{
    id: 'queue-delay', type: 'graph', after: 2, layout: 'inline', title: 'Delay explodes near full load',
    fn: rho => 1 / (1 - rho), domain: [0, 0.99], x: { label: 'Utilisation (rho = arrival rate / service rate)' }, y: { label: 'Average time in system (ms)' },
    marks: [{ x: 0.9, label: '10 ms' }, { x: 0.99, label: '100 ms' }],
    caption: 'From W = 1 / (mu - lambda) with a service rate of 1,000 packets per second. At 90 percent load the delay is 10 ms and at 99 percent it is 100 ms, ten times larger for a 10 percent rise in load.',
    alt: 'A curve of average delay in milliseconds against utilisation from 0 to 0.99. It starts at 1 ms, is 10 ms at 0.9 and rises almost vertically to 100 ms at 0.99.',
  }],
  'lab-networks.l06': [{
    id: 'encapsulation', type: 'diagram', after: 1, layout: 'wide', title: 'Layers wrap data from above',
    nodes: [{ id: 'app', label: 'Application data (web page)', col: 0, row: 0 }, { id: 'tcp', label: 'TCP segment', col: 1, row: 0 }, { id: 'ip', label: 'IP packet', col: 2, row: 0 }, { id: 'frame', label: 'Link frame', col: 3, row: 0 }],
    edges: [['app', 'tcp', 'carried in'], ['tcp', 'ip', 'carried in'], ['ip', 'frame', 'carried in']],
    caption: 'Each layer adds its own header around what the layer above hands down, so a web page travels inside a TCP segment, inside an IP packet, inside a link frame.',
    alt: 'Four boxes left to right: application data, TCP segment, IP packet and link frame, each carried inside the next.',
  }],
  'lab-networks.l10': [{
    id: 'aimd-sawtooth', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'The AIMD sawtooth',
    x: { label: 'Round trips' }, y: { label: 'Congestion window', unit: 'segments' },
    series: [{ name: 'Window', points: AIMD_T.map(t => [t, aimd(t)] as [number, number]) }],
    caption: 'An idealised model, not a measurement: the window grows by one segment per round trip and halves from 20 to 10 at each loss, as in the text. Real traces are noisier.',
    alt: 'A repeating sawtooth: the window climbs from 10 to 20 segments over ten round trips, drops to 10, and climbs again.',
  }],
  'lab-history.l12': [{
    id: 'voyages-timeline', type: 'timeline', after: 1, layout: 'wide', title: 'From Constantinople to the first circumnavigation',
    events: [{ when: '1453', label: 'Constantinople falls to the Ottomans' }, { when: '1492', label: 'Columbus crosses the Atlantic for Spain' }, { when: '1504', label: 'Columbus voyages end' }, { when: '1519', label: 'Magellan expedition sets out' }, { when: '1521', label: 'Magellan dies' }, { when: '1522', label: 'Expedition completes the circumnavigation' }],
    caption: 'The dates in the lesson in order. Sustained contact between the hemispheres began in 1492, and within 30 years a fleet had sailed around the world.',
    alt: 'Timeline: 1453 Constantinople falls; 1492 Columbus crosses the Atlantic; 1504 his voyages end; 1519 Magellan sets out; 1521 Magellan dies; 1522 the expedition completes the first circumnavigation.',
  }],
  'lab-history.l13': [{
    id: 'revolutions-timeline', type: 'timeline', after: 0, layout: 'wide', title: 'Three revolutions',
    events: [{ when: '1776', label: 'American Revolution begins' }, { when: '1789', label: 'French Revolution begins' }, { when: '1791', label: 'Haitian Revolution begins' }, { when: '1804', label: 'Haitian Revolution ends; Haiti independent' }],
    caption: 'The dates given in the lesson show how quickly the ideas of liberty and rights travelled between continents: three revolutions began within 15 years.',
    alt: 'Timeline: 1776 the American Revolution begins; 1789 the French Revolution begins; 1791 the Haitian Revolution begins; 1804 it ends with Haiti independent.',
  }],
  'history-north-america.l09': [{
    id: 'revolution-road', type: 'timeline', after: 2, layout: 'wide', title: 'The road from the Seven Years War to Congress',
    events: [{ when: '1754', label: 'Seven Years War begins' }, { when: '1763', label: 'Treaty of Paris; Proclamation of 1763' }, { when: '1765', label: 'Stamp Act' }, { when: '1766', label: 'Stamp Act repealed' }, { when: 'Mar 1770', label: 'Boston Massacre' }, { when: 'Dec 1773', label: 'Boston Tea Party' }, { when: '1774', label: 'Coercive Acts; First Continental Congress' }],
    caption: 'Each measure drew a protest and the next measure answered it, an escalating cycle rather than a single decision for independence.',
    alt: 'Timeline: 1754 Seven Years War begins; 1763 Treaty of Paris and the Proclamation; 1765 Stamp Act; 1766 repeal; March 1770 Boston Massacre; December 1773 Boston Tea Party; 1774 Coercive Acts and the First Continental Congress.',
  }],
  'history-north-america.l17': [{
    id: 'civil-war-timeline', type: 'timeline', after: 3, layout: 'wide', title: 'The Civil War, 1861 to 1865',
    events: [{ when: 'Apr 12, 1861', label: 'Fort Sumter fired on' }, { when: 'Sep 1862', label: 'Antietam' }, { when: 'Jan 1, 1863', label: 'Emancipation Proclamation' }, { when: 'Jul 1863', label: 'Gettysburg' }, { when: 'Jul 4, 1863', label: 'Vicksburg captured' }, { when: 'Apr 9, 1865', label: 'Lee surrenders at Appomattox' }, { when: 'Dec 1865', label: 'Thirteenth Amendment ratified' }],
    caption: 'Gettysburg and Vicksburg fell within days of each other in July 1863, the same year emancipation became a Union war aim.',
    alt: 'Timeline: April 12, 1861 Fort Sumter; September 1862 Antietam; January 1, 1863 Emancipation Proclamation; July 1863 Gettysburg; July 4, 1863 Vicksburg; April 9, 1865 Appomattox; December 1865 Thirteenth Amendment.',
  }],
};
