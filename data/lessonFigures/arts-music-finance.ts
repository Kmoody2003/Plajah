import type { Figure } from '../../components/learn/lesson/figures';

/** Figures for arts, music, design, film business and finance/economics lessons. Every curve is computed from a stated formula; worked examples are labelled as models. */

const r1 = (v: number) => +v.toFixed(1);
const r2 = (v: number) => +v.toFixed(2);

// Speed of sound used by the lesson: 343 m/s in air at about 20 C.
const C_AIR = 343;

// Loan model: 20,000 at 8 percent nominal annual rate, monthly payments.
const LOAN = 20000, LR = 0.08 / 12;
const pmt = (n: number) => (LOAN * LR) / (1 - Math.pow(1 + LR, -n));
const balAfter = (n: number, k: number) => { let b = LOAN; const p = pmt(n); for (let i = 0; i < k; i++) b = b * (1 + LR) - p; return Math.max(0, b); };
const LOAN_MONTHS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72];

// Savings model: 200 a month at 7 percent nominal annual return, compounded monthly.
const fvMonthly = (monthly: number, years: number) => { let b = 0; for (let i = 0; i < Math.round(years * 12); i++) b = b * (1 + 0.07 / 12) + monthly; return b; };
const YEARS = Array.from({ length: 9 }, (_, i) => i * 5);

// Aliasing fold at 44.1 kHz sampling.
const FS = 44.1;
const alias = (f: number) => Math.abs(f - FS * Math.round(f / FS));

// WCAG relative luminance of a grey on white.
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const greyOnWhite = (v: number) => 1.05 / (lin(v) + 0.05);

export const FIGURES: Record<string, Figure[]> = {
  'audio-engineering.l01': [
    {
      id: 'wavelength-vs-frequency', type: 'graph', after: 2, layout: 'inline', title: 'Wavelength shrinks as frequency rises',
      fn: f => C_AIR / f, domain: [50, 2000], x: { label: 'Frequency (Hz)' }, y: { label: 'Wavelength in air (metres)' },
      marks: [{ x: 100, label: '100 Hz: 3.43 m' }, { x: 1000, label: '1,000 Hz: 0.343 m' }],
      caption: 'Wavelength equals the speed of sound divided by frequency, here with 343 m/s in air at about 20 degrees Celsius. Low notes have very long waves, which is why bass behaves differently in rooms.',
      alt: 'A falling curve of wavelength in metres against frequency from 50 to 2,000 hertz. At 100 hertz the wavelength is 3.43 metres and at 1,000 hertz it is 0.343 metres.',
    },
    {
      id: 'wavelength-table', type: 'chart', kind: 'bar', after: 2, layout: 'inline', title: 'Wavelength at five frequencies (computed)',
      x: { label: 'Frequency', unit: 'Hz' }, y: { label: 'Wavelength', unit: 'm' },
      series: [{ name: 'Wavelength = 343 / frequency', points: [100, 250, 1000, 4000, 10000].map(f => [f, +(C_AIR / f).toFixed(3)] as [number, number]) }],
      caption: 'Computed from 343 divided by frequency. A 10 kHz tone has a wave only about 3 centimetres long, while a 100 Hz tone stretches 3.43 metres.',
      alt: 'Bars of wavelength in metres: 3.43 at 100 hertz, 1.372 at 250 hertz, 0.343 at 1,000 hertz, 0.086 at 4,000 hertz and 0.034 at 10,000 hertz.',
    },
  ],
  'audio-engineering.l02': [
    {
      id: 'db-voltage-ratio', type: 'graph', after: 1, layout: 'inline', title: 'Decibels against a voltage or pressure ratio',
      fn: r => 20 * Math.log10(r), domain: [0.1, 10], x: { label: 'Ratio of voltage or pressure (output / input)' }, y: { label: 'Level change (dB)' },
      marks: [{ x: 0.5, label: 'half: -6 dB' }, { x: 1, label: 'same: 0 dB' }, { x: 2, label: 'double: +6 dB' }, { x: 10, label: 'ten times: +20 dB' }],
      caption: 'Level in dB is 20 times the base-10 logarithm of the ratio for voltage or pressure. Doubling adds about 6 dB and a factor of ten adds 20 dB; the curve climbs ever more slowly because decibels are logarithmic.',
      alt: 'A logarithmic curve of decibels against amplitude ratio from 0.1 to 10. It passes minus 6 dB at ratio 0.5, 0 dB at ratio 1, plus 6 dB at ratio 2 and plus 20 dB at ratio 10.',
    },
    {
      id: 'niosh-exposure-time', type: 'chart', kind: 'bar', after: 3, layout: 'inline', title: 'Recommended daily exposure time falls as level rises',
      x: { label: 'Sound level', unit: 'dBA' }, y: { label: 'Maximum exposure', unit: 'hours' },
      series: [{ name: 'NIOSH recommended limit', points: [85, 88, 91, 94, 97, 100].map(l => [l, r2(8 / Math.pow(2, (l - 85) / 3))] as [number, number]) }],
      credit: 'NIOSH recommended exposure limit: 85 dBA for 8 hours with a 3 dB exchange rate',
      caption: 'The recommendation starts at 85 dBA for 8 hours and halves the time for every 3 dB. At 100 dBA only 15 minutes is advised.',
      alt: 'Bars of recommended maximum daily exposure in hours: 8 at 85 dBA, 4 at 88, 2 at 91, 1 at 94, 0.5 at 97 and 0.25 at 100 dBA.',
    },
  ],
  'audio-engineering.l03': [
    {
      id: 'harmonic-series-220', type: 'chart', kind: 'bar', after: 0, layout: 'inline', title: 'Harmonics of a 220 Hz fundamental',
      x: { label: 'Harmonic number' }, y: { label: 'Frequency', unit: 'Hz' },
      series: [{ name: 'Harmonic frequency = n x 220', points: [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, 220 * n] as [number, number]) }],
      caption: 'Harmonics are whole-number multiples of the fundamental: 220, 440, 660 and so on. Their balance gives an instrument its timbre.',
      alt: 'Bars for harmonics 1 to 8 of a 220 hertz fundamental at 220, 440, 660, 880, 1,100, 1,320, 1,540 and 1,760 hertz, each a step of 220 hertz higher.',
    },
    {
      id: 'octave-doubling', type: 'graph', after: 2, layout: 'inline', title: 'Each octave doubles the frequency',
      fn: n => 440 * Math.pow(2, n), domain: [-2, 2], x: { label: 'Octaves above or below A at 440 Hz' }, y: { label: 'Frequency (Hz)' },
      marks: [{ x: -1, label: 'A 220 Hz' }, { x: 0, label: 'A 440 Hz' }, { x: 1, label: 'A 880 Hz' }],
      caption: 'Pitch rises by equal steps while frequency doubles each time, so the link between them is exponential. With concert A at 440 Hz, the A notes an octave away are 220 Hz and 880 Hz.',
      alt: 'An upward-curving exponential plot of frequency against octaves from minus 2 to plus 2 relative to A 440 hertz, passing 220 hertz at minus 1, 440 at 0 and 880 at plus 1.',
    },
  ],
  'audio-engineering.l04': [
    {
      id: 'alias-fold', type: 'graph', after: 2, layout: 'wide', title: 'Aliasing at a 44.1 kHz sample rate',
      fn: alias, domain: [0, 66.15], x: { label: 'Frequency arriving at the converter (kHz)' }, y: { label: 'Frequency the converter reports (kHz)' },
      marks: [{ x: 22.05, label: 'Nyquist 22.05' }, { x: 30, label: '30 kHz reads as 14.1' }, { x: 44.1, label: '44.1 reads as 0' }],
      caption: 'Up to 22.05 kHz a tone is reported correctly. Above it the reading folds back down, so 30 kHz is misread as 44.1 minus 30, which is 14.1 kHz. An anti-aliasing filter removes such content before sampling.',
      alt: 'A zigzag plot. From 0 to 22.05 kHz the reported frequency equals the input. Above 22.05 kHz it falls back, reaching 14.1 kHz for a 30 kHz input and 0 at 44.1 kHz, then rises again.',
    },
    {
      id: 'nyquist-by-rate', type: 'chart', kind: 'bar', after: 1, layout: 'inline', title: 'Highest capturable frequency for common sample rates',
      x: { label: 'Sample rate', unit: 'kHz' }, y: { label: 'Nyquist frequency', unit: 'kHz' },
      series: [{ name: 'Half the sample rate', points: [44.1, 48, 88.2, 96, 192].map(s => [s, s / 2] as [number, number]) }],
      caption: 'The Nyquist limit is half the sample rate: 22.05 kHz at 44.1 kHz and 24 kHz at 48 kHz. Both already exceed the 20 kHz limit of human hearing.',
      alt: 'Bars showing Nyquist frequency in kilohertz for each sample rate: 22.05 for 44.1, 24 for 48, 44.1 for 88.2, 48 for 96 and 96 for 192 kilohertz.',
    },
  ],
  'audio-engineering.l17': [
    {
      id: 'eq-regions', type: 'diagram', after: 1, layout: 'wide', title: 'Rough frequency regions used when equalizing',
      nodes: [
        { id: 'sub', label: 'Sub-bass: below about 60 Hz', col: 0, row: 0 },
        { id: 'bass', label: 'Bass: 60 to 250 Hz', col: 1, row: 0 },
        { id: 'lowmid', label: 'Low mids: 250 to 500 Hz (mud)', col: 2, row: 0 },
        { id: 'mid', label: 'Mids: to about 2 kHz', col: 0, row: 1 },
        { id: 'upmid', label: 'Upper mids: 2 to 5 kHz (presence)', col: 1, row: 1 },
        { id: 'high', label: 'Highs above 5 kHz (air at the top)', col: 2, row: 1 },
      ],
      edges: [['sub', 'bass'], ['bass', 'lowmid'], ['lowmid', 'mid'], ['mid', 'upmid'], ['upmid', 'high']],
      caption: "Engineers share a rough vocabulary of frequency bands, low to high. The edges are approximate and instruments vary, but the names help you say where a problem lives.",
      alt: 'Six bands in order from low to high: sub-bass below about 60 hertz, bass 60 to 250, low mids 250 to 500 where excess is called mud, mids to about 2 kilohertz, upper mids 2 to 5 kilohertz for presence, and highs above that with the top called air.',
    },
  ],
  'audio-engineering.l21': [
    {
      id: 'lufs-normalization', type: 'diagram', after: 3, layout: 'inline', title: 'Worked example: loudness normalization',
      nodes: [
        { id: 'm', label: 'Master: -8 LUFS integrated', col: 0, row: 0 },
        { id: 't', label: 'Service target: -14 LUFS', col: 1, row: 0 },
        { id: 'g', label: 'Player gain: -6 dB (-14 minus -8)', col: 2, row: 0 },
      ],
      edges: [['m', 't', 'compared with'], ['t', 'g', 'turned down by']],
      caption: 'A hot master is simply turned down to the platform target, so extra loudness bought with heavy limiting is taken back while the lost dynamics stay lost. The figures are the lesson example.',
      alt: 'A three-step chain: a master measured at minus 8 LUFS is compared with a streaming target of minus 14 LUFS, so the player applies a gain of minus 6 decibels.',
    },
  ],
  'lighting-design.l01': [
    {
      id: 'inverse-square-lux', type: 'graph', after: 3, layout: 'inline', title: 'Illuminance against distance (inverse square law)',
      fn: d => 400 / (d * d), domain: [0.5, 6], x: { label: 'Distance from a small lamp (metres)' }, y: { label: 'Illuminance (lux)' },
      marks: [{ x: 1, label: '400 lux' }, { x: 2, label: '100 lux' }, { x: 4, label: '25 lux' }],
      caption: 'Worked model from the lesson: a lamp giving 400 lux at 1 metre gives 400 divided by distance squared. Doubling the distance quarters the light.',
      alt: 'A steeply falling curve of illuminance in lux against distance from 0.5 to 6 metres, with 400 lux at 1 metre, 100 lux at 2 metres and 25 lux at 4 metres.',
    },
    {
      id: 'stops-lost-distance', type: 'graph', after: 3, layout: 'inline', title: 'Stops of light lost as the lamp moves away',
      fn: d => 2 * Math.log2(d), domain: [1, 8], x: { label: 'Distance relative to the first position (times)' }, y: { label: 'Light lost (stops)' },
      marks: [{ x: 2, label: 'double: 2 stops' }, { x: 4, label: '4 times: 4 stops' }, { x: 8, label: '8 times: 6 stops' }],
      caption: 'A stop is a halving of light. Because light falls with distance squared, stops lost equal 2 times log base 2 of the distance ratio, so each doubling of distance costs two stops.',
      alt: 'A slowly rising curve of stops lost against distance multiple from 1 to 8. Doubling the distance loses 2 stops, four times loses 4 stops, eight times loses 6 stops.',
    },
  ],
  'lighting-design.l04': [
    {
      id: 'kelvin-ladder', type: 'diagram', after: 1, layout: 'wide', title: 'Reference colour temperatures, warm to cool',
      nodes: [
        { id: 'k27', label: '2700 K: household warm bulb', col: 0, row: 0 },
        { id: 'k32', label: '3200 K: tungsten film and studio lamps', col: 1, row: 0 },
        { id: 'k56', label: '5600 K: daylight-balanced film and lights', col: 2, row: 0 },
        { id: 'k70', label: '7000 K or more: hazy or shaded sky', col: 3, row: 0 },
      ],
      edges: [['k27', 'k32', 'cooler'], ['k32', 'k56', 'cooler'], ['k56', 'k70', 'cooler']],
      caption: 'Higher kelvin numbers look cooler and bluer, the reverse of hot and cold in daily speech. These are conventions rather than constants, since real daylight varies.',
      alt: 'Four reference colour temperatures in order: 2700 kelvin household warm bulbs, 3200 kelvin tungsten lamps, 5600 kelvin daylight-balanced lights, and 7000 kelvin or more for hazy or shaded sky. Each step is cooler in colour.',
    },
  ],
  'lighting-design.l10': [
    {
      id: 'ratio-to-stops', type: 'graph', after: 0, layout: 'inline', title: 'Lighting ratio expressed in stops',
      fn: ratio => Math.log2(ratio), domain: [1, 16], x: { label: 'Lighting ratio (key side : shadow side)' }, y: { label: 'Difference (stops)' },
      marks: [{ x: 2, label: '2:1 = 1 stop' }, { x: 4, label: '4:1 = 2 stops' }, { x: 8, label: '8:1 = 3 stops' }],
      caption: 'A ratio of 2:1 is one stop and 4:1 is two, so the stop difference is log base 2 of the ratio. Always check which convention a crew means when it quotes a ratio.',
      alt: 'A slowly rising curve of stop difference against lighting ratio from 1:1 to 16:1, with 1 stop at 2:1, 2 stops at 4:1, 3 stops at 8:1 and 4 stops at 16:1.',
    },
  ],
  'color-theory.l04': [
    {
      id: 'ryb-complements', type: 'diagram', after: 1, layout: 'inline', title: 'RYB wheel: complementary pairs',
      nodes: [
        { id: 'r', label: 'Red', col: 0, row: 0 }, { id: 'g', label: 'Green', col: 1, row: 0 },
        { id: 'b', label: 'Blue', col: 0, row: 1 }, { id: 'o', label: 'Orange', col: 1, row: 1 },
        { id: 'y', label: 'Yellow', col: 0, row: 2 }, { id: 'v', label: 'Violet', col: 1, row: 2 },
      ],
      edges: [['r', 'g', 'complements'], ['b', 'o', 'complements'], ['y', 'v', 'complements']],
      caption: 'On the traditional painter wheel with red, yellow and blue as primaries, the opposite pairs are red and green, blue and orange, and yellow and violet.',
      alt: 'Three pairs of opposite hues on the RYB wheel: red with green, blue with orange, and yellow with violet.',
    },
    {
      id: 'rgb-complements', type: 'diagram', after: 2, layout: 'inline', title: 'RGB wheel: opposite pairs',
      nodes: [
        { id: 'r', label: 'Red', col: 0, row: 0 }, { id: 'c', label: 'Cyan', col: 1, row: 0 },
        { id: 'g', label: 'Green', col: 0, row: 1 }, { id: 'm', label: 'Magenta', col: 1, row: 1 },
        { id: 'b', label: 'Blue', col: 0, row: 2 }, { id: 'y', label: 'Yellow', col: 1, row: 2 },
      ],
      edges: [['r', 'c', 'opposite'], ['g', 'm', 'opposite'], ['b', 'y', 'opposite']],
      caption: 'The additive wheel of light has red, green and blue primaries, so its opposites differ from the painter wheel: red and cyan, green and magenta, blue and yellow. The word complement changes meaning with the wheel.',
      alt: 'Three pairs of opposite hues on the RGB wheel: red with cyan, green with magenta, and blue with yellow.',
    },
  ],
  'color-theory.l06': [
    {
      id: 'triadic-schemes', type: 'diagram', after: 1, layout: 'inline', title: 'Triadic schemes on the traditional wheel',
      nodes: [
        { id: 'p', label: 'Primary triad: red, yellow, blue', col: 0, row: 0 },
        { id: 's', label: 'Secondary triad: orange, green, violet', col: 2, row: 0 },
        { id: 'w', label: 'Each hue a third of the wheel from the next', col: 1, row: 1 },
      ],
      edges: [['p', 'w'], ['s', 'w']],
      caption: 'A triadic scheme spaces three hues evenly, one third of the way around the wheel. Choose one dominant hue to keep it balanced.',
      alt: 'Two evenly spaced triads on the traditional wheel: the primary triad of red, yellow and blue, and the secondary triad of orange, green and violet.',
    },
    {
      id: 'split-complement-blue', type: 'diagram', after: 2, layout: 'inline', title: 'Split-complementary scheme for blue',
      nodes: [
        { id: 'base', label: 'Blue (base hue)', col: 0, row: 1 },
        { id: 'comp', label: 'Orange (its complement, not used)', col: 1, row: 1 },
        { id: 'yo', label: 'Yellow-orange', col: 2, row: 0 },
        { id: 'ro', label: 'Red-orange', col: 2, row: 2 },
      ],
      edges: [['base', 'comp', 'opposite'], ['comp', 'yo', 'neighbour'], ['comp', 'ro', 'neighbour']],
      caption: 'Instead of the complement itself, use the two hues on either side of it. You keep most of the contrast with less tension.',
      alt: 'Blue is the base hue. Its complement orange is skipped, and the two neighbours of orange, yellow-orange and red-orange, are used instead.',
    },
  ],
  'color-theory.l12': [
    {
      id: 'wcag-grey-on-white', type: 'graph', after: 2, layout: 'inline', title: 'Contrast of a grey text colour on white',
      fn: v => greyOnWhite(v), domain: [0, 255], x: { label: 'Grey level (0 black to 255 white, same value in R, G and B)' }, y: { label: 'WCAG contrast ratio against white (:1)' },
      marks: [{ x: 0, label: 'black: 21:1' }, { x: 118, label: '#767676: about 4.5:1' }, { x: 255, label: 'white: 1:1' }],
      caption: 'Computed from the WCAG relative luminance formula for a neutral grey on white. Mid-grey #767676 lands just above the 4.5:1 AA threshold for ordinary text.',
      alt: 'A falling curve of contrast ratio against grey level from 0 to 255. Black gives 21 to 1, grey 118 (hex 76) gives about 4.5 to 1, and white gives 1 to 1.',
    },
  ],
  'music-theory-elementary.l08': [
    {
      id: 'c-major-steps', type: 'diagram', after: 2, layout: 'wide', title: 'The C major scale as whole and half steps',
      nodes: [
        { id: 'c1', label: 'C', col: 0, row: 0 }, { id: 'd', label: 'D', col: 1, row: 0 }, { id: 'e', label: 'E', col: 2, row: 0 }, { id: 'f', label: 'F', col: 3, row: 0 },
        { id: 'g', label: 'G', col: 4, row: 0 }, { id: 'a', label: 'A', col: 5, row: 0 }, { id: 'b', label: 'B', col: 6, row: 0 }, { id: 'c2', label: 'C', col: 7, row: 0 },
      ],
      edges: [['c1', 'd', 'whole'], ['d', 'e', 'whole'], ['e', 'f', 'half'], ['f', 'g', 'whole'], ['g', 'a', 'whole'], ['a', 'b', 'whole'], ['b', 'c2', 'half']],
      caption: 'Every major scale follows whole, whole, half, whole, whole, whole, half. In C major the two half steps fall between E and F and between B and C, with no black keys needed.',
      alt: 'The notes C D E F G A B C joined by steps labelled whole, whole, half, whole, whole, whole, half.',
    },
  ],
  'music-theory-elementary.l10': [
    {
      id: 'key-signature-ladder', type: 'diagram', after: 2, layout: 'wide', title: 'The keys of this level and their signatures',
      nodes: [
        { id: 'bb', label: 'B-flat major: B-flat, E-flat', col: 0, row: 0 },
        { id: 'f', label: 'F major: B-flat', col: 1, row: 0 },
        { id: 'c', label: 'C major: no sharps or flats', col: 2, row: 0 },
        { id: 'g', label: 'G major: F-sharp', col: 3, row: 0 },
        { id: 'd', label: 'D major: F-sharp, C-sharp', col: 4, row: 0 },
      ],
      edges: [['bb', 'f', 'one flat fewer'], ['f', 'c', 'one flat fewer'], ['c', 'g', 'one sharp more'], ['g', 'd', 'one sharp more']],
      caption: 'Going from C toward sharps adds F-sharp first and then C-sharp; going toward flats adds B-flat first and then E-flat. Each key is a fifth from its neighbour.',
      alt: 'A row of five keys: B-flat major with two flats, F major with one flat, C major with none, G major with one sharp (F-sharp), and D major with two sharps (F-sharp and C-sharp).',
    },
  ],
  'music-history-eras.l07': [
    {
      id: 'baroque-dates', type: 'timeline', after: 3, layout: 'wide', title: 'Baroque lives and landmark dates named in the lesson',
      events: [
        { when: 'about 1659', label: 'Henry Purcell born' }, { when: '1678', label: 'Antonio Vivaldi born' },
        { when: '1685', label: 'Bach and Handel born' }, { when: '1695', label: 'Purcell dies' },
        { when: '1723', label: 'Bach becomes music director in Leipzig' }, { when: '1725', label: 'The Four Seasons published' },
        { when: '1741', label: 'Vivaldi dies' }, { when: '1742', label: 'Handel Messiah premieres in Dublin' },
        { when: '1750', label: 'Bach dies, the usual end of the era' }, { when: '1759', label: 'Handel dies' },
      ],
      caption: 'The dates show how closely the great Baroque names overlap: Bach and Handel share a birth year and Purcell, Vivaldi and Bach all worked within the 1600 to 1750 span.',
      alt: 'Timeline of Baroque dates: Purcell born about 1659, Vivaldi 1678, Bach and Handel 1685, Purcell dies 1695, Bach in Leipzig 1723, The Four Seasons 1725, Vivaldi dies 1741, Messiah 1742, Bach dies 1750, Handel dies 1759.',
    },
  ],
  'music-history-eras.l24': [
    {
      id: 'recording-timeline', type: 'timeline', after: 3, layout: 'wide', title: 'Recording formats and milestones from the lesson',
      events: [
        { when: '1877', label: 'Edison demonstrates the phonograph (cylinder)' }, { when: '1880s', label: 'Berliner develops the flat disc and gramophone' },
        { when: 'mid-1920s', label: 'Electrical recording with microphones becomes standard' }, { when: '1948', label: 'Columbia introduces the long-playing record' },
        { when: 'late 1950s', label: 'Stereo becomes common' }, { when: '1982', label: 'The compact disc arrives' },
      ],
      caption: 'Each step changed what music could be: the room-independent copy, the fuller electrical sound, the long album side, and then digital sound.',
      alt: 'Timeline: phonograph 1877, flat disc and gramophone in the 1880s, electrical recording mid-1920s, long-playing record 1948, stereo late 1950s, compact disc 1982.',
    },
  ],
  'design-movements.l06': [
    {
      id: 'weimar-bauhaus', type: 'timeline', after: 4, layout: 'wide', title: 'The Weimar years',
      events: [
        { when: 'April 1919', label: 'Walter Gropius founds the Bauhaus in Weimar' }, { when: '1921', label: 'Paul Klee joins the faculty' },
        { when: '1922', label: 'Wassily Kandinsky joins the faculty' }, { when: '1923', label: 'Exhibition: Art and Technology, a new unity' },
        { when: '1925', label: 'The school leaves Weimar for Dessau' },
      ],
      caption: 'In six years the school grew from a craft-and-art merger into an argument for design for industry, before political pressure ended its time in Weimar.',
      alt: 'Timeline: Bauhaus founded in Weimar in April 1919, Klee joins 1921, Kandinsky joins 1922, the 1923 exhibition on art and technology, and the move to Dessau in 1925.',
    },
  ],
  'design-movements.l07': [
    {
      id: 'bauhaus-after-weimar', type: 'timeline', after: 3, layout: 'wide', title: 'Dessau, Berlin and closure',
      events: [
        { when: '1925', label: 'Bauhaus moves to Dessau' }, { when: 'December 1926', label: 'Gropius-designed Dessau building opens' },
        { when: '1928', label: 'Gropius resigns; Hannes Meyer becomes director' }, { when: '1930', label: 'Meyer dismissed; Mies van der Rohe takes over' },
        { when: '1932', label: 'Dessau council closes the school' }, { when: 'April 1933', label: 'Police search the Berlin building' },
        { when: 'July 1933', label: 'Faculty votes to dissolve the Bauhaus' },
      ],
      caption: 'Three directors in eight years and a rising political threat: the school lasted about fourteen years in all, and its ideas scattered rather than ended.',
      alt: 'Timeline: moves to Dessau 1925, new building opens December 1926, Gropius resigns and Meyer directs from 1928, Meyer dismissed and Mies takes over 1930, Dessau closes the school 1932, police search Berlin April 1933, dissolution July 1933.',
    },
  ],
  'film-business.l09': [
    {
      id: 'capital-stack-5m', type: 'diagram', after: 2, layout: 'wide', title: 'Worked example: a 5,000,000 dollar capital stack',
      nodes: [
        { id: 'tc', label: 'Tax-credit loan: $1,000,000', col: 0, row: 0 },
        { id: 'ps', label: 'Pre-sale guarantees: $1,500,000', col: 0, row: 1 },
        { id: 'gap', label: 'Gap loan: $1,000,000', col: 0, row: 2 },
        { id: 'eq', label: 'Equity: $1,500,000 (30 percent)', col: 0, row: 3 },
        { id: 'bud', label: 'Film budget: $5,000,000', col: 2, row: 1 },
      ],
      edges: [['tc', 'bud'], ['ps', 'bud'], ['gap', 'bud'], ['eq', 'bud', 'repaid last']],
      caption: 'Illustrative numbers from the lesson, for teaching only: 1.0 plus 1.5 plus 1.0 plus 1.5 million makes 5.0 million. Lenders are repaid ahead of equity, which therefore carries the most risk.',
      alt: 'Four funding layers feed a 5 million dollar budget: tax-credit loan 1 million, pre-sale guarantees 1.5 million, gap loan 1 million and equity 1.5 million, which is 30 percent and is repaid after the debt.',
    },
  ],
  'film-business.l16': [
    {
      id: 'waterfall-10m', type: 'diagram', after: 2, layout: 'wide', title: 'Worked example: a 10,000,000 dollar gross waterfall',
      nodes: [
        { id: 'g', label: 'Gross receipts $10,000,000', col: 0, row: 0 },
        { id: 'sa', label: 'Sales agent 15%: -1,500,000 = 8,500,000', col: 1, row: 0 },
        { id: 'ex', label: 'Distribution and marketing: -1,500,000 = 7,000,000', col: 2, row: 0 },
        { id: 'ln', label: 'Senior loan and interest: -2,000,000 = 5,000,000', col: 0, row: 1 },
        { id: 'eq', label: 'Equity at 120% of 3,000,000: -3,600,000 = 1,400,000', col: 1, row: 1 },
        { id: 'df', label: 'Deferments: -400,000 = 1,000,000 net profit', col: 2, row: 1 },
      ],
      edges: [['g', 'sa'], ['sa', 'ex'], ['ex', 'ln'], ['ln', 'eq'], ['eq', 'df']],
      caption: 'A simplified, illustrative waterfall from the lesson: each tier is paid in full before the next, and profit comes last. A 50/50 split of the final 1,000,000 puts 500,000 in the producers pool.',
      alt: 'A chain of payments from 10 million dollars gross: sales agent 1.5 million leaves 8.5 million, expenses 1.5 million leave 7 million, the senior loan 2 million leaves 5 million, equity recoupment 3.6 million leaves 1.4 million, and deferments 0.4 million leave 1 million net profit.',
    },
    {
      id: 'waterfall-6m', type: 'diagram', after: 3, layout: 'wide', title: 'Same film, 6,000,000 dollar gross: no profit',
      nodes: [
        { id: 'g', label: 'Gross receipts $6,000,000', col: 0, row: 0 },
        { id: 'sa', label: 'Sales agent: -900,000 = 5,100,000', col: 1, row: 0 },
        { id: 'ex', label: 'Expenses: -1,500,000 = 3,600,000', col: 2, row: 0 },
        { id: 'ln', label: 'Loan: -2,000,000 = 1,600,000', col: 0, row: 1 },
        { id: 'eq', label: 'Equity owed 3,600,000 but gets 1,600,000', col: 1, row: 1 },
        { id: 'np', label: 'Net profit: zero', col: 2, row: 1 },
      ],
      edges: [['g', 'sa'], ['sa', 'ex'], ['ex', 'ln'], ['ln', 'eq'], ['eq', 'np']],
      caption: 'With less revenue the money runs out inside the equity tier, so anyone paid from net profit receives nothing. Position in the waterfall decides who bears the shortfall.',
      alt: 'From 6 million dollars gross: commission 900,000 leaves 5.1 million, expenses 1.5 million leave 3.6 million, the 2 million loan leaves 1.6 million, which goes to equity that is owed 3.6 million, so net profit is zero.',
    },
  ],
  'entertainment-finance.l08': [
    {
      id: 'recoupment-1-5m', type: 'diagram', after: 2, layout: 'wide', title: 'Made-up example: 1,500,000 dollars of revenue',
      nodes: [
        { id: 'rev', label: 'Revenue $1,500,000', col: 0, row: 0 },
        { id: 'fee', label: 'Distribution fee 20%: -300,000 = 1,200,000', col: 1, row: 0 },
        { id: 'dex', label: 'Distribution expenses: -100,000 = 1,100,000', col: 2, row: 0 },
        { id: 'sen', label: 'Senior loan plus interest: -330,000 = 770,000', col: 0, row: 1 },
        { id: 'eq', label: 'Equity 500,000 plus 20% premium: -600,000 = 170,000', col: 1, row: 1 },
        { id: 'pr', label: 'Profit split 50/50: 85,000 each', col: 2, row: 1 },
      ],
      edges: [['rev', 'fee'], ['fee', 'dex'], ['dex', 'sen'], ['sen', 'eq'], ['eq', 'pr']],
      caption: 'A waterfall pays each tier in full before the next. Investors in total receive 600,000 plus 85,000, which is 685,000 on a 500,000 investment. The figures are the lesson made-up example.',
      alt: 'Revenue of 1.5 million dollars passes through a 20 percent distribution fee of 300,000, expenses of 100,000, a senior loan with interest of 330,000, and an equity recoupment of 600,000, leaving 170,000 that is split 85,000 each.',
    },
  ],
  'fl-save-2': [
    {
      id: 'simple-vs-compound', type: 'chart', kind: 'line', after: 0, layout: 'inline', title: 'Simple versus compound growth (computed model)',
      x: { label: 'Years' }, y: { label: 'Balance', unit: 'dollars' },
      series: [
        { name: 'Simple interest at 7% on 1,000', points: YEARS.map(t => [t, 1000 + 70 * t] as [number, number]) },
        { name: 'Compound interest at 7% on 1,000', points: YEARS.map(t => [t, Math.round(1000 * Math.pow(1.07, t))] as [number, number]) },
      ],
      caption: 'Computed model, not data: 1,000 dollars at 7 percent a year. Simple interest adds 70 each year; compounding earns on its own earnings. After 40 years the balances are 3,800 and about 14,974 dollars. The rate is an illustration, not a forecast.',
      alt: 'Two lines from 1,000 dollars over 40 years at 7 percent. Simple interest rises in a straight line to 3,800 dollars. Compound interest curves upward to about 14,974 dollars.',
    },
    {
      id: 'start-early-vs-late', type: 'chart', kind: 'line', after: 4, layout: 'inline', title: 'Halve the horizon (computed model)',
      x: { label: 'Years from now' }, y: { label: 'Balance', unit: 'dollars' },
      series: [
        { name: 'Save 200 a month for all 40 years', points: YEARS.map(t => [t, Math.round(fvMonthly(200, t))] as [number, number]) },
        { name: 'Wait 20 years, then save 200 a month', points: YEARS.map(t => [t, Math.round(fvMonthly(200, Math.max(0, t - 20)))] as [number, number]) },
      ],
      caption: 'Computed model: 200 dollars a month at 7 percent nominal annual return, compounded monthly. Starting right away ends near 524,963 dollars; waiting 20 years ends near 104,185, from half the deposits. The rate is assumed, not guaranteed.',
      alt: 'Two rising lines over 40 years. Saving 200 dollars a month throughout reaches about 524,963 dollars. Starting after 20 years reaches about 104,185 dollars.',
    },
  ],
  'fl-credit-1': [
    {
      id: 'loan-balance-36-vs-72', type: 'chart', kind: 'line', after: 1, layout: 'inline', title: 'Shorter and longer loan balances (computed model)',
      x: { label: 'Months since borrowing' }, y: { label: 'Amount still owed', unit: 'dollars' },
      series: [
        { name: '36 months: payment about 626.73', points: LOAN_MONTHS.map(k => [k, Math.round(balAfter(36, k))] as [number, number]) },
        { name: '72 months: payment about 350.66', points: LOAN_MONTHS.map(k => [k, Math.round(balAfter(72, k))] as [number, number]) },
      ],
      caption: 'Computed model: 20,000 dollars at 8 percent a year, paid monthly. The 72-month payment is far smaller, yet total interest is about 5,248 dollars against about 2,562 for 36 months. Compare total cost, not the monthly figure.',
      alt: 'Two falling balance lines from 20,000 dollars. The 36-month loan reaches zero at month 36. The 72-month loan falls more slowly and reaches zero at month 72.',
    },
    {
      id: 'interest-vs-principal-72', type: 'chart', kind: 'line', after: 3, layout: 'inline', title: 'Early payments are mostly interest (computed model)',
      x: { label: 'Months since borrowing' }, y: { label: 'Portion of the monthly payment', unit: 'dollars' },
      series: [
        { name: 'Interest part', points: LOAN_MONTHS.map(k => [k, r2(balAfter(72, k) * LR)] as [number, number]) },
        { name: 'Principal part', points: LOAN_MONTHS.map(k => [k, r2(pmt(72) - balAfter(72, k) * LR)] as [number, number]) },
      ],
      caption: 'Same 72-month loan. In the first payment about 133 dollars is interest and about 217 reduces the debt; by the end the split flips. The shape is the reason extra payments early are disproportionately powerful.',
      alt: 'Two lines over 72 months for a 20,000 dollar loan at 8 percent. The interest part starts near 133 dollars and falls toward zero. The principal part starts near 217 dollars and rises toward the full payment of about 351.',
    },
  ],
  'ec-mkt-1': [
    {
      id: 'sd-equilibrium', type: 'chart', kind: 'line', after: 0, layout: 'inline', title: 'Supply, demand and equilibrium (illustrative model)',
      x: { label: 'Quantity' }, y: { label: 'Price' },
      series: [
        { name: 'Demand: price = 10 minus quantity', points: [0, 2, 4, 6, 8].map(q => [q, 10 - q] as [number, number]) },
        { name: 'Supply: price = 2 plus quantity', points: [0, 2, 4, 6, 8].map(q => [q, 2 + q] as [number, number]) },
      ],
      caption: 'A made-up linear market, not data. Demand slopes down and supply slopes up; they cross at a quantity of 4 and a price of 6, where what buyers want equals what sellers offer.',
      alt: 'A falling demand line from price 10 at quantity 0 to price 2 at quantity 8, and a rising supply line from price 2 to price 10. They cross at quantity 4 and price 6.',
    },
    {
      id: 'sd-shift', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'A shift of demand moves along supply (illustrative model)',
      x: { label: 'Quantity' }, y: { label: 'Price' },
      series: [
        { name: 'Original demand: 10 minus quantity', points: [0, 2, 4, 6, 8].map(q => [q, 10 - q] as [number, number]) },
        { name: 'Demand after a shift: 14 minus quantity', points: [0, 2, 4, 6, 8].map(q => [q, 14 - q] as [number, number]) },
        { name: 'Supply: 2 plus quantity', points: [0, 2, 4, 6, 8].map(q => [q, 2 + q] as [number, number]) },
      ],
      caption: 'A made-up example. Something other than price, such as higher incomes for a normal good, shifts the whole demand curve right. The market moves along the supply curve from price 6 and quantity 4 to price 8 and quantity 6.',
      alt: 'Three lines: original demand, a parallel demand curve shifted outward, and the same rising supply line. The new crossing is at quantity 6 and price 8, compared with quantity 4 and price 6 before.',
    },
  ],
  'ec-money-1': [
    {
      id: 'three-jobs-of-money', type: 'diagram', after: 0, layout: 'inline', title: 'The three jobs of money',
      nodes: [
        { id: 'm', label: 'Money', col: 0, row: 1 },
        { id: 'a', label: 'Medium of exchange: no need to find a double coincidence of wants', col: 1, row: 0 },
        { id: 'b', label: 'Unit of account: compare values on one scale', col: 1, row: 1 },
        { id: 'c', label: 'Store of value: carry purchasing power into the future', col: 1, row: 2 },
      ],
      edges: [['m', 'a'], ['m', 'b'], ['m', 'c']],
      caption: 'Money is defined by what it does. Barter fails at the first job because both sides must want exactly what the other has.',
      alt: 'Money branches into three roles: medium of exchange, unit of account and store of value.',
    },
    {
      id: 'loan-creates-deposit', type: 'diagram', after: 3, layout: 'wide', title: 'How a bank loan creates a deposit',
      nodes: [
        { id: 'l', label: 'Bank approves a loan', col: 0, row: 1 },
        { id: 'asset', label: 'Bank records a loan asset: the borrower owes it', col: 1, row: 0 },
        { id: 'dep', label: 'Borrower account shows a new deposit', col: 1, row: 2 },
        { id: 'sp', label: 'Deposit can be spent as money', col: 2, row: 2 },
      ],
      edges: [['l', 'asset', 'created together'], ['l', 'dep', 'created together'], ['dep', 'sp']],
      caption: 'Most money is bank deposits, and it comes into existence when a bank lends, with the loan and the deposit appearing at the same moment. This is a simplified outline of the process.',
      alt: 'A bank approves a loan. At the same time the bank records a loan asset and the borrower account receives a new deposit, which can then be spent as money.',
    },
  ],
  'ec-money-2': [
    {
      id: 'policy-rate-chain', type: 'diagram', after: 1, layout: 'wide', title: 'From the policy rate to prices and jobs',
      nodes: [
        { id: 'r', label: 'Central bank raises the policy rate', col: 0, row: 0 },
        { id: 'b', label: 'Borrowing becomes dearer', col: 1, row: 0 },
        { id: 's', label: 'Less spending on houses, cars, investment', col: 2, row: 0 },
        { id: 'd', label: 'Slower demand', col: 3, row: 0 },
        { id: 'p', label: 'Easing pressure on prices', col: 4, row: 0 },
        { id: 'h', label: 'Slower hiring', col: 4, row: 1 },
      ],
      edges: [['r', 'b'], ['b', 's'], ['s', 'd'], ['d', 'p', 'cools'], ['d', 'h', 'also slows']],
      caption: 'The same chain that cools inflation also cools employment, which is the trade-off at the heart of monetary policy. Real effects arrive with long and variable lags.',
      alt: 'A chain: the central bank raises its policy rate, borrowing becomes dearer, spending on financed goods falls, demand slows, and that both eases price pressure and slows hiring.',
    },
  ],
};
