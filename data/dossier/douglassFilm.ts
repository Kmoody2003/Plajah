/**
 * "Frederick Douglass" — the Dossier film, as code.
 *
 * Every frame is drawn by services/dossier/film/filmRenderer.ts from this spec. Narration lines
 * cite ledger claims (data/dossier/douglass.ts). Quotations are verbatim from public-domain
 * texts. Reconstructions are labelled on screen. Lincoln is deliberately not depicted.
 *
 * Narration audio/durations are merged in from public/dossier/douglass/film/narration.json
 * (scripts/dossier/narrate.ts); without it the film runs silently with estimated timing.
 */
import type { FilmScene, FilmSpec, FilmAsset, Basemap } from '../../services/dossier/film/filmTypes';
import eastCoast from './douglassBasemap.json';
import atlantic from './atlanticBasemap.json';

const R = '/dossier/douglass';
const BASEMAPS: FilmSpec['basemaps'] = { eastCoast: eastCoast as unknown as Basemap, atlantic: atlantic as unknown as Basemap };
const recon = (id: string): FilmAsset => ({ id, src: `${R}/recon/${id}.png`, depth: `${R}/depth/${id}.png`, credit: 'Reconstruction · Plajah Dossier (AI-generated from documented sources)' });
const archival = (id: string, credit: string): FilmAsset => ({ id, src: `${R}/archival/${id}.jpg`, credit });

export const DOUGLASS_FILM_ASSETS: FilmAsset[] = [
  recon('recon-shipyard'), recon('recon-covey-field'), recon('recon-escape'), recon('recon-nantucket'),
  recon('recon-printing-office'), recon('recon-fourth'), recon('recon-anteroom'), recon('recon-cedarhill'),
  archival('ref-1847-miller', 'Samuel J. Miller, daguerreotype, c. 1847–52 · Art Institute of Chicago · Public domain'),
  archival('ref-1855-younger', 'Engraving after a daguerreotype, 1855 · Public domain'),
  archival('ref-1860s-merrill-crosby', 'Merrill & Crosby, carte de visite, 1860s · Public domain'),
  archival('ref-1866-nyhs', 'Portrait, c. 1866 · New-York Historical Society · Public domain'),
  archival('ref-1879-warren', 'George K. Warren, c. 1879 · National Archives · Public domain'),
  archival('ref-1890s-grandson', 'With his grandson Joseph, Notman Photo Co., 1890s · Public domain'),
  archival('doc-1845-narrative-cover', 'Title page, Narrative of the Life of Frederick Douglass, Boston, 1845 · Public domain'),
];

const CHESAPEAKE: [number, number, number, number] = [-77.6, 38.1, -75.2, 39.9];
const CORRIDOR: [number, number, number, number] = [-77.2, 38.9, -73.4, 41.0];
const NORTHEAST: [number, number, number, number] = [-77.4, 38.8, -69.6, 42.6];

export const DOUGLASS_FILM_SCENES: FilmScene[] = [
  { kind: 'coldOpen', id: 'open', min: 9, chapter: 'Opening',
    lines: ['I have no accurate knowledge of my age,', 'never having seen any authentic record containing it.'],
    cite: 'Narrative of the Life of Frederick Douglass · 1845 · Chapter I', claimIds: ['c-birthyear'] },
  { kind: 'title', id: 'title', min: 7.5, transition: 'fade',
    kicker: 'A Plajah Dossier', title: 'Frederick Douglass', subtitle: 'Born enslaved. Became the nation\u2019s conscience.', dates: '1818 \u2014 1895', bgAsset: 'ref-1847-miller' },

  // ── I ──
  { kind: 'chapter', id: 'ch1', min: 4.5, transition: 'dip', chapter: 'I · Born Between Two Worlds', numeral: 'I', title: 'Born Between Two Worlds', years: '1818 \u2013 1838', bgAsset: 'recon-shipyard' },
  { kind: 'map', id: 'map-birth', min: 9, transition: 'inkWipe', basemap: 'eastCoast', title: 'The Chesapeake', dateline: 'Maryland, c. 1818', attribution: 'Made with Natural Earth · public domain',
    view: [{ t: 0, bbox: [-78.6, 37.4, -74.4, 40.6] }, { t: .55, bbox: CHESAPEAKE, ease: 'inOut' }, { t: 1, bbox: [-77.2, 38.4, -75.7, 39.6] }],
    places: [
      { id: 'talbot', label: 'Talbot County', lat: 38.77, lon: -76.07, at: .2, years: 'born c. 1818' },
      { id: 'baltimore', label: 'Baltimore', lat: 39.29, lon: -76.61, at: .62, years: 'from 1826' },
    ],
    narration: { text: 'He was born Frederick Augustus Washington Bailey, on Maryland\u2019s Eastern Shore, around 1818. Enslaved from birth, he was separated from his mother as a small child.' },
    claimIds: ['c-born', 'c-birthyear', 'c-mother'] },
  { kind: 'painting', id: 'shipyard', min: 8, transition: 'fade', asset: 'recon-shipyard', depth: .035, reconstruction: true, atmosphere: 'dust', grade: 'warm',
    title: 'Letters on the timbers', caption: 'Reconstruction · Baltimore shipyard, 1830s · after the Narrative (1845), ch. VII',
    cam: [{ t: 0, x: .62, y: .5, zoom: 1.18 }, { t: 1, x: .45, y: .55, zoom: 1.04, ease: 'inOut' }],
    narration: { text: 'At about eight, he was sent to Baltimore. His mistress began teaching him the alphabet, until her husband forbade it. So he kept learning in secret: trading bread for lessons from neighborhood boys, and copying letters from the timbers of the shipyard.' },
    claimIds: ['c-baltimore', 'c-reading'] },
  { kind: 'quote', id: 'q-pathway', min: 6, transition: 'fade', style: 'manuscript', bgAsset: 'recon-shipyard',
    text: 'From that moment, I understood the pathway from slavery to freedom.', emphasis: ['pathway', 'freedom.'],
    cite: 'Narrative, 1845, Chapter VI', narration: { text: 'From that moment, I understood the pathway from slavery to freedom.' },
    claimIds: ['c-reading'] },
  { kind: 'painting', id: 'covey', min: 8, transition: 'fade', asset: 'recon-covey-field', depth: .04, reconstruction: true, atmosphere: 'none', grade: 'dusk',
    title: 'The turning point', caption: 'Reconstruction · Talbot County, 1834 · after the Narrative (1845), ch. X',
    cam: [{ t: 0, x: .5, y: .5, zoom: 1.02 }, { t: 1, x: .5, y: .46, zoom: 1.2, ease: 'inOut' }],
    narration: { text: 'At sixteen he was hired out to Edward Covey, a man known for \u201Cbreaking\u201D enslaved people. After months of brutality, Frederick fought back. He called it the turning point of his life.' },
    claimIds: ['c-covey'] },
  { kind: 'quote', id: 'q-man', min: 6.5, transition: 'inkWipe', style: 'broadside',
    text: 'You have seen how a man was made a slave; you shall see how a slave was made a man.', emphasis: ['slave;', 'man.'],
    cite: 'Narrative, 1845, Chapter X', narration: { text: 'You have seen how a man was made a slave; you shall see how a slave was made a man.' },
    claimIds: ['c-covey'] },
  { kind: 'painting', id: 'escape', min: 7, transition: 'filmBurn', asset: 'recon-escape', depth: .045, reconstruction: true, atmosphere: 'steam', grade: 'cool',
    title: 'September 3, 1838', caption: 'Reconstruction · Baltimore, 1838 · after Life and Times (1881)',
    cam: [{ t: 0, x: .4, y: .55, zoom: 1.2 }, { t: 1, x: .58, y: .5, zoom: 1.05, ease: 'inOut' }],
    narration: { text: 'On September 3rd, 1838, dressed as a sailor and carrying a free seaman\u2019s borrowed papers, he boarded a train heading north.' },
    claimIds: ['c-escape'] },
  { kind: 'map', id: 'map-escape', min: 11, transition: 'fade', basemap: 'eastCoast', title: 'The Road North', dateline: 'September 3\u20134, 1838', attribution: 'Route after Life and Times (1881) · Made with Natural Earth',
    view: [{ t: 0, bbox: [-77.3, 38.9, -75.1, 40.1] }, { t: .75, bbox: CORRIDOR, ease: 'inOut' }, { t: 1, bbox: CORRIDOR }],
    routeSpan: [.08, .86],
    route: [
      { id: 'balt', label: 'Baltimore', lat: 39.29, lon: -76.61, mode: 'start' },
      { id: 'havre', label: 'Havre de Grace', lat: 39.55, lon: -76.09, mode: 'train' },
      { id: 'perry', label: 'Susquehanna ferry', lat: 39.56, lon: -76.07, mode: 'ferry' },
      { id: 'wilm', label: 'Wilmington', lat: 39.74, lon: -75.55, mode: 'train' },
      { id: 'phila', label: 'Philadelphia', lat: 39.95, lon: -75.17, mode: 'steamboat' },
      { id: 'ny', label: 'New York', lat: 40.71, lon: -74.0, mode: 'train' },
    ],
    narration: { text: 'By train, ferry and steamboat he crossed Maryland, Delaware and Pennsylvania, past people who might have known him. The next day, he stepped off in New York City. Free.' },
    claimIds: ['c-escape'] },

  // ── II ──
  { kind: 'chapter', id: 'ch2', min: 4.5, transition: 'dip', chapter: 'II · A New Name, a New Voice', numeral: 'II', title: 'A New Name, a New Voice', years: '1838 \u2013 1847', bgAsset: 'recon-nantucket' },
  { kind: 'map', id: 'map-newbedford', min: 7, transition: 'inkWipe', basemap: 'eastCoast', title: 'New Bedford', dateline: 'September 1838', attribution: 'Made with Natural Earth · public domain',
    view: [{ t: 0, bbox: CORRIDOR }, { t: .7, bbox: NORTHEAST, ease: 'inOut' }, { t: 1, bbox: [-74.8, 40.2, -69.6, 42.5] }],
    routeSpan: [.12, .7],
    route: [
      { id: 'ny2', label: 'New York', lat: 40.71, lon: -74.0, mode: 'start' },
      { id: 'newport', label: 'Newport', lat: 41.49, lon: -71.31, mode: 'steamboat' },
      { id: 'nb', label: 'New Bedford', lat: 41.64, lon: -70.93, mode: 'stagecoach' },
    ],
    places: [{ id: 'nantucket', label: 'Nantucket', lat: 41.28, lon: -70.1, at: .82, years: 'August 1841' }],
    narration: { text: 'Anna Murray, a free Black woman who had helped pay for his escape, joined him. They married in New York and made a home in New Bedford, Massachusetts, where he chose a new last name: Douglass.' },
    claimIds: ['c-anna', 'c-name'] },
  { kind: 'painting', id: 'nantucket', min: 8, transition: 'fade', asset: 'recon-nantucket', depth: .03, reconstruction: true, atmosphere: 'lamplight', grade: 'warm',
    title: 'Nantucket, 1841', caption: 'Reconstruction · Nantucket Atheneum, August 1841 · after Life and Times (1881)',
    cam: [{ t: 0, x: .5, y: .5, zoom: 1.04 }, { t: 1, x: .5, y: .42, zoom: 1.22, ease: 'inOut' }],
    narration: { text: 'In 1841, at an anti-slavery meeting on Nantucket, he rose and told his story. Soon the Massachusetts Anti-Slavery Society hired him to lecture across the North.' },
    claimIds: ['c-nantucket'] },
  { kind: 'archival', id: 'narrative', min: 8, transition: 'fade', asset: 'doc-1845-narrative-cover', layout: 'left', tone: 'natural',
    caption: 'Narrative of the Life of Frederick Douglass, an American Slave · Boston, 1845',
    marker: { label: 'Published', value: '1845' },
    narration: { text: 'In 1845 he published his Narrative, naming names and places. It sold widely, and it put him in danger of being captured.' },
    claimIds: ['c-narrative'] },
  { kind: 'map', id: 'map-britain', min: 8, transition: 'inkWipe', basemap: 'atlantic', title: 'Across the Atlantic', dateline: '1845 \u2013 1847', attribution: 'Made with Natural Earth · public domain',
    view: [{ t: 0, bbox: [-78, 25, 5, 62] }, { t: .6, bbox: [-14, 49, 2, 59], ease: 'inOut' }, { t: 1, bbox: [-12, 50.5, 0, 57.5] }],
    places: [
      { id: 'dublin', label: 'Dublin', lat: 53.35, lon: -6.26, at: .55, years: '1845' },
      { id: 'cork', label: 'Cork', lat: 51.9, lon: -8.47, at: .62, years: '1845' },
      { id: 'belfast', label: 'Belfast', lat: 54.6, lon: -5.93, at: .69, years: '1845\u201346' },
      { id: 'edinburgh', label: 'Edinburgh', lat: 55.95, lon: -3.19, at: .76, years: '1846' },
      { id: 'london', label: 'London', lat: 51.51, lon: -0.13, at: .83, years: '1846\u201347' },
    ],
    narration: { text: 'He sailed for Ireland and Britain and lectured there for nearly two years. Supporters raised the money to buy his legal freedom in 1846.' },
    claimIds: ['c-britain'] },

  // ── III ──
  { kind: 'chapter', id: 'ch3', min: 4.5, transition: 'dip', chapter: 'III · The North Star', numeral: 'III', title: 'The North Star', years: '1847 \u2013 1861', bgAsset: 'recon-printing-office' },
  { kind: 'masthead', id: 'northstar', min: 9, transition: 'inkWipe',
    name: 'The North Star', motto: 'Right is of no Sex\u2014Truth is of no Color\u2014God is the Father of us all, and we are all Brethren.',
    dateline: 'December 3, 1847', editors: 'Frederick Douglass & Martin R. Delany, Editors', place: 'Rochester, N.Y.',
    narration: { text: 'Back home, he founded his own newspaper in Rochester, New York: The North Star. Its motto began, \u201CRight is of no sex. Truth is of no color.\u201D' },
    claimIds: ['c-northstar'] },
  { kind: 'painting', id: 'printing', min: 7, transition: 'fade', asset: 'recon-printing-office', depth: .03, reconstruction: true, atmosphere: 'lamplight', grade: 'warm',
    title: 'Editor', caption: 'Reconstruction · Rochester printing office, 1847 · after My Bondage and My Freedom (1855)',
    cam: [{ t: 0, x: .55, y: .45, zoom: 1.2 }, { t: 1, x: .5, y: .45, zoom: 1.05, ease: 'inOut' }],
    narration: { text: 'In 1848 he stood with the women at Seneca Falls, and spoke in support of their right to vote.' },
    claimIds: ['c-seneca'] },
  { kind: 'chart', id: 'census', min: 9, transition: 'fade', title: 'People enslaved in the United States', highlight: 7,
    series: [
      { label: '1790', value: 697681 }, { label: '1800', value: 893602 }, { label: '1810', value: 1191362 }, { label: '1820', value: 1538022 },
      { label: '1830', value: 2009043 }, { label: '1840', value: 2487355 }, { label: '1850', value: 3204313 }, { label: '1860', value: 3953760 },
    ],
    note: 'Nearly four million people by 1860.', source: 'U.S. Census, 1790\u20131860',
    narration: { text: 'The fight was enormous. When he escaped, about two and a half million people were enslaved in the United States. By 1860, nearly four million.' },
    // The chart's figures are the ledger's c-census claim (Census Bureau Working Paper 56, Table 1; 1840: 2,487,355, 1850: 3,204,313, 1860: 3,953,760).
    claimIds: ['c-census', 'c-fourth'] },
  { kind: 'painting', id: 'fourth', min: 6.5, transition: 'fade', asset: 'recon-fourth', depth: .035, reconstruction: true, atmosphere: 'lamplight', grade: 'warm',
    title: 'July 5, 1852', caption: 'Reconstruction · Corinthian Hall, Rochester, 1852',
    cam: [{ t: 0, x: .5, y: .55, zoom: 1.02 }, { t: 1, x: .52, y: .4, zoom: 1.24, ease: 'inOut' }],
    narration: { text: 'On July 5th, 1852, in Rochester, he asked a question the nation could not escape.' },
    claimIds: ['c-fourth'] },
  { kind: 'quote', id: 'q-fourth', min: 11, transition: 'fade', style: 'speech', bgAsset: 'recon-fourth',
    text: 'What, to the American slave, is your 4th of July? I answer: a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim.',
    emphasis: ['4th', 'july?', 'injustice', 'cruelty', 'victim.'], cite: 'Rochester, New York, July 5, 1852',
    narration: { text: 'What, to the American slave, is your 4th of July? I answer: a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim.' },
    claimIds: ['c-fourth'] },

  // ── IV ──
  { kind: 'chapter', id: 'ch4', min: 4.5, transition: 'dip', chapter: 'IV · War and Reconstruction', numeral: 'IV', title: 'War and Reconstruction', years: '1861 \u2013 1877', bgAsset: 'recon-anteroom' },
  { kind: 'quote', id: 'q-arms', min: 7, transition: 'inkWipe', style: 'broadside',
    text: 'MEN OF COLOR, TO ARMS!', emphasis: ['arms!'], cite: 'Frederick Douglass, broadside, March 1863',
    narration: { text: 'When war came, he called Black men to fight for their own freedom, recruiting for the 54th Massachusetts. Two of his own sons served.' },
    claimIds: ['c-soldiers'] },
  { kind: 'painting', id: 'anteroom', min: 8, transition: 'fade', asset: 'recon-anteroom', depth: .03, reconstruction: true, atmosphere: 'none', grade: 'neutral',
    title: 'The White House, 1863', caption: 'Reconstruction · White House anteroom, August 1863 · Lincoln deliberately not depicted',
    cam: [{ t: 0, x: .45, y: .5, zoom: 1.04 }, { t: 1, x: .5, y: .45, zoom: 1.2, ease: 'inOut' }],
    narration: { text: 'In August 1863 he went to the White House to press President Lincoln for equal pay and protection for Black soldiers.' },
    claimIds: ['c-lincoln'] },
  { kind: 'archival', id: 'nyhs', min: 7, transition: 'fade', asset: 'ref-1866-nyhs', layout: 'right', tone: 'sepia', focus: { x: .5, y: .3 },
    caption: 'Frederick Douglass, c. 1866 · New-York Historical Society', marker: { label: 'Age', value: '48' },
    narration: { text: 'After the war, he campaigned for citizenship and the right to vote for Black Americans.' },
    claimIds: ['c-suffrage'] },

  // ── V ──
  { kind: 'chapter', id: 'ch5', min: 4.5, transition: 'dip', chapter: 'V · Cedar Hill', numeral: 'V', title: 'Cedar Hill', years: '1877 \u2013 1895', bgAsset: 'recon-cedarhill' },
  { kind: 'archival', id: 'warren', min: 8, transition: 'inkWipe', asset: 'ref-1879-warren', layout: 'left', tone: 'sepia', focus: { x: .5, y: .3 },
    caption: 'Frederick Douglass, c. 1879 · George K. Warren',
    callouts: [{ text: 'U.S. Marshal, D.C. · 1877', x: .9, y: .3, side: 'right', at: 1.5 }, { text: 'Recorder of Deeds · 1881', x: .9, y: .5, side: 'right', at: 3 }, { text: 'Minister to Haiti · 1889', x: .9, y: .7, side: 'right', at: 4.5 }],
    narration: { text: 'He served as U.S. Marshal for the District of Columbia, as Recorder of Deeds, and as his country\u2019s minister to Haiti.' },
    claimIds: ['c-offices'] },
  { kind: 'painting', id: 'cedarhill', min: 8, transition: 'fade', asset: 'recon-cedarhill', depth: .03, reconstruction: true, atmosphere: 'dust', grade: 'warm',
    title: 'The study at Cedar Hill', caption: 'Reconstruction · Cedar Hill, Washington, 1880s · after the National Park Service',
    cam: [{ t: 0, x: .5, y: .5, zoom: 1.2 }, { t: 1, x: .45, y: .48, zoom: 1.04, ease: 'inOut' }],
    narration: { text: 'At Cedar Hill, his home overlooking Washington, he kept writing, telling his own story for a third time.' },
    claimIds: ['c-cedarhill', 'c-selfmade'] },
  { kind: 'timeline', id: 'life', min: 13, transition: 'fade', title: 'A Life', span: [1815, 1898], sweep: [.05, .92],
    events: [
      { year: 1818, label: 'Born in Talbot County, Maryland', claimId: 'c-born' },
      { year: 1826, label: 'Sent to Baltimore', claimId: 'c-baltimore' },
      { year: 1834, label: 'Fights back against Covey', claimId: 'c-covey' },
      { year: 1838, label: 'Escapes to New York', claimId: 'c-escape' },
      { year: 1841, label: 'Speaks at Nantucket', claimId: 'c-nantucket' },
      { year: 1845, label: 'Publishes the Narrative', claimId: 'c-narrative' },
      { year: 1846, label: 'Legal freedom purchased', claimId: 'c-britain' },
      { year: 1847, label: 'Founds The North Star', claimId: 'c-northstar' },
      { year: 1848, label: 'Seneca Falls', claimId: 'c-seneca' },
      { year: 1852, label: '\u201CWhat to the Slave Is the Fourth of July?\u201D', claimId: 'c-fourth' },
      { year: 1863, label: 'Meets Lincoln; recruits soldiers', claimId: 'c-lincoln' },
      { year: 1877, label: 'U.S. Marshal, D.C.', claimId: 'c-offices' },
      { year: 1889, label: 'Minister to Haiti', claimId: 'c-offices' },
      { year: 1895, label: 'Dies at Cedar Hill', claimId: 'c-death' },
    ],
    narration: { text: 'He died at Cedar Hill on February 20th, 1895, only hours after attending a meeting of the National Council of Women.' },
    claimIds: ['c-death'] },
  { kind: 'archival', id: 'grandson', min: 8, transition: 'fade', asset: 'ref-1890s-grandson', layout: 'center', tone: 'sepia', focus: { x: .5, y: .3 },
    caption: 'Frederick Douglass with his grandson Joseph, 1890s',
    narration: { text: 'Born with no birthday and no last name, Frederick Douglass spent his life asking America to live up to its own words.' },
    claimIds: ['c-birthyear', 'c-name'] },
  { kind: 'quote', id: 'q-struggle', min: 7, transition: 'dip', style: 'manuscript', bgAsset: 'recon-cedarhill',
    text: 'If there is no struggle there is no progress.', emphasis: ['struggle', 'progress.'],
    cite: 'West India Emancipation speech, Canandaigua, N.Y., August 3, 1857',
    narration: { text: 'If there is no struggle, there is no progress.' },
    // The 1857 West India Emancipation speech is the ledger's c-struggle claim.
    claimIds: ['c-struggle'] },
  { kind: 'credits', id: 'credits', min: 16, transition: 'fade', blocks: [
    { head: 'A Plajah Dossier', lines: ['Frederick Douglass', 'Written, researched and animated in code'] },
    { head: 'Sources', lines: ['Narrative of the Life of Frederick Douglass (1845)', 'My Bondage and My Freedom (1855)', 'Life and Times of Frederick Douglass (1881, rev. 1892)', 'David W. Blight, Frederick Douglass: Prophet of Freedom (2018)', 'U.S. Census Bureau, 1790\u20131860 · National Park Service'] },
    { head: 'Images', lines: ['Photographs and documents: public domain, via Wikimedia Commons', 'and the Art Institute of Chicago, National Archives,', 'New-York Historical Society, Library of Congress', 'Reconstructions: AI-generated from documented sources and', 'reference portraits, labelled on screen'] },
    { head: 'Maps', lines: ['Made with Natural Earth \u00B7 public domain'] },
    { head: 'Score', lines: ['Original score, synthesized for Plajah'] },
    { head: 'Voices', lines: ['Narration and readings: synthetic voices (Google Gemini TTS)', 'Quotations are Douglass\u2019s own published words, not his voice'] },
  ] },
];

export interface NarrationTimings { [sceneId: string]: { audio: string; duration: number } }

/** Assemble the full spec, merging narration timings and basemaps when available. */
export function buildDouglassFilm(opts: { narration?: NarrationTimings; basemaps?: FilmSpec['basemaps']; width?: number; height?: number } = {}): FilmSpec {
  return {
    id: 'douglass-film', title: 'Frederick Douglass', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    assets: DOUGLASS_FILM_ASSETS,
    scenes: DOUGLASS_FILM_SCENES.map(s => {
      const n = opts.narration?.[s.id];
      return n && s.narration ? { ...s, narration: { ...s.narration, audio: n.audio, duration: n.duration } } : s;
    }),
    score: { src: `${R}/score.mp3`, volume: .55, duckTo: .18 },
    basemaps: opts.basemaps ?? BASEMAPS,
  };
}

/** Browser loader: fetches narration timings from public/ and builds the spec. */
export async function loadDouglassFilm(width?: number, height?: number): Promise<FilmSpec> {
  const get = async (url: string) => { try { const r = await fetch(url); return r.ok ? await r.json() : undefined; } catch { return undefined; } };
  const narration = await get(`${R}/film/narration.json`);
  return buildDouglassFilm({ narration, width, height });
}
