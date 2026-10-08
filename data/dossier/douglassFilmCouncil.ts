/**
 * "Frederick Douglass", in the Motion Council's style (services/dossier/film/council*.ts).
 *
 * About 3.5 minutes in five film rooms, one for each room on the exhibit's plan strip (douglass.ts):
 *   1 Born Between Two Worlds     (1818-1838)
 *   2 A New Name, a New Voice     (1838-1847)
 *   3 The North Star              (1847-1861)
 *   4 War and Reconstruction      (1861-1877)
 *   5 Cedar Hill                  (1877-1895)
 *
 * The exhibit's own gesture: the composing stick and the handbill. Title set sort by sort, chapter changes by Forme Lock,
 * dates as a wood-type handbill stack (Abril Fatface and Alfa Slab One), gold only on type and hairline rules. The hero
 * documents are the real 1845 Narrative title page (a gold underline under WRITTEN BY HIMSELF, then a flat crop-in on
 * unchanged pixels) and the real North Star front page (a flat crop-in on the masthead).
 *
 * Douglass's face appears only in real photographs, a daguerreotype and engravings. Four labelled paintings, none with a
 * face: the boy chalking a plank (the one full-bleed), a field at dusk seen from behind, the empty Nantucket lectern and
 * the empty writing desk at Cedar Hill. The earlier faced lectern, printing-office, Fourth of July, anteroom and study
 * paintings are deliberately NOT used.
 *
 * Every narrated sentence cites claim ids from the ledger (data/dossier/douglass.ts); tests/dossierFilmCouncil check them.
 */
import type { FilmAsset, FilmSpec } from '../../services/dossier/film/filmTypes';
import type { CouncilFilm, CouncilShot, PlateSpec } from '../../services/dossier/film/councilTypes';
import { councilTheme } from '../../services/dossier/film/councilCompile';
import { DOSSIER_THEMES } from './registry';
import rawAssets from './douglassAssets.json';
import filmAssets from './douglassFilmAssets.json';
import { createKit, fetchNarration, withNarration, type BeatTimings, type RawAsset } from './councilFilmKit';

const R = '/dossier/douglass';
const ALL = [...(rawAssets as unknown as RawAsset[]), ...(filmAssets as unknown as RawAsset[])];

const RECON: Record<string, { w: number; h: number }> = {
  'recon-shipyard': { w: 2730, h: 1536 },
  'recon-covey-field': { w: 2730, h: 1536 },
  'recon-lectern-empty': { w: 2752, h: 1536 },
  'recon-study-desk': { w: 2560, h: 1440 },
};
const K = createKit(R, ALL, RECON, 'Reconstruction · Plajah Dossier (AI-generated from documented sources, no face shown)');
const { arch, recon, beat } = K;

const LOC = 'Library of Congress, Rare Book Division';
const PLATES = {
  frontis: () => arch('film-1845-frontispiece', 'Engraved frontispiece of the Narrative of the Life of Frederick Douglass', LOC),
  titlePage: () => arch('film-1845-title-page', 'Title page, Narrative of the Life of Frederick Douglass, Boston, 1845', LOC, { minHold: 5 }),
  northStar: () => arch('film-1848-north-star', 'The North Star, front page, Rochester, 2 June 1848', 'Library of Congress · Wikimedia Commons', { minHold: 5 }),
  miller: () => arch('ref-1847-miller', 'Frederick Douglass, daguerreotype by Samuel J. Miller', 'Samuel J. Miller · Art Institute of Chicago', { year: 'c. 1847–1852' }),
  younger: () => arch('ref-1855-younger', 'Frederick Douglass, engraving by J. C. Buttre after a daguerreotype', 'J. C. Buttre · Wikimedia Commons'),
  merrill: () => arch('ref-1860s-merrill-crosby', 'Frederick Douglass, carte de visite by Merrill & Crosby', 'Merrill & Crosby · Wikimedia Commons'),
  nyhs: () => arch('ref-1866-nyhs', 'Frederick Douglass, portrait', 'New-York Historical Society · Wikimedia Commons'),
  warren: () => arch('ref-1879-warren', 'Frederick Douglass, photograph by George K. Warren', 'George K. Warren · Wikimedia Commons'),
  grandson: () => arch('ref-1890s-grandson', 'Frederick Douglass with his grandson Joseph', 'Notman Photo Co., Boston · Wikimedia Commons'),
  lesson: () => arch('doc-lifeandtimes-1882-a', 'An engraved illustration of a boy being taught his letters', 'Life and Times (1882) · Internet Archive'),
};

// ── Rooms ────────────────────────────────────────────────────────────────────
const ROOMS: CouncilFilm['rooms'] = [
  { id: 'born', title: 'Born Between Two Worlds', exhibitRooms: [1, 1], wing: 'Born Between Two Worlds' },
  { id: 'voice', title: 'A New Name, a New Voice', exhibitRooms: [2, 2], wing: 'A New Name, a New Voice' },
  { id: 'star', title: 'The North Star', exhibitRooms: [3, 3], wing: 'The North Star' },
  { id: 'war', title: 'War and Reconstruction', exhibitRooms: [4, 4], wing: 'War and Reconstruction' },
  { id: 'hill', title: 'Cedar Hill', exhibitRooms: [5, 5], wing: 'Cedar Hill' },
];

// ── Shots ────────────────────────────────────────────────────────────────────
export const DOUGLASS_COUNCIL_SHOTS: CouncilShot[] = [
  // Room 1: Born Between Two Worlds
  { id: 'born', room: 0, plates: [PLATES.frontis()],
    margin: { place: 'Talbot County, Maryland' },
    graphic: { kind: 'handbill', items: [
      { anchor: '1818', big: '1818', blank: true, about: true, small: 'Born, Maryland' },
      { anchor: '1838', big: '1838', small: 'Escapes north' },
      { anchor: '1845', big: '1845', small: 'The Narrative' },
    ] },
    beats: [
      beat('born.1', 'Frederick Douglass was born into slavery in Maryland around 1818. He never knew his own birthday.', ['c-born', 'c-birthyear']),
      beat('born.2', 'He escaped north in 1838, and in 1845 published the story that made him famous.', ['c-escape', 'c-narrative']),
    ] },
  { id: 'lesson', room: 0, plates: [PLATES.lesson()],
    margin: { year: 'c. 1826', place: 'Baltimore, Maryland' },
    lowerThird: { name: 'Baltimore', role: 'Maryland · where he learned his letters', at: 1.2 },
    beats: [
      beat('lesson.1', 'Sent to Baltimore at about eight, he began to learn the alphabet from Sophia Auld, until her husband forbade it.', ['c-baltimore', 'c-reading']),
      beat('lesson.2', 'He bought a schoolbook of speeches, The Columbian Orator, which shaped his ideas about liberty.', ['c-orator']),
    ] },
  { id: 'shipyard', room: 0, transition: 'reconGate',
    plates: [recon('recon-shipyard', 'Painted from his own account of copying letters on shipyard timbers; no face is shown.', { fullBleed: true, focusY: 0.55 })],
    beats: [beat('shipyard.1', 'So he kept learning in secret, trading bread for lessons and copying letters from the timbers of the shipyard.', ['c-reading'])] },
  { id: 'note1', room: 0, kind: 'card', transition: 'silenceHold', holdUntil: 'covey',
    card: { lines: ['The next account describes violence done to an enslaved man.', 'Any key skips this section.'] } },
  { id: 'covey', room: 0, transition: 'reconGate',
    plates: [recon('recon-covey-field', 'Painted from the Narrative’s account of a field and of Covey. Nothing here is a record; the man is seen from behind and no violence is shown.')],
    margin: { year: '1834', place: 'Talbot County, Maryland' },
    beats: [beat('covey.1', 'Hired out to Edward Covey, a farmer known for breaking enslaved people, he endured months of brutality, then fought back.', ['c-covey'])] },
  { id: 'escape', room: 0, plates: [PLATES.younger()],
    margin: { year: '1838', place: 'Baltimore to New York' },
    graphic: { kind: 'route', anchors: ['Baltimore', 'York'], stops: [{ label: 'Baltimore', x: 0.08, y: 0.9 }, { label: 'New York', x: 0.92, y: 0.1 }], note: 'September 1838. A plain schematic of the route, not to scale.' },
    beats: [beat('escape.1', 'On 3 September 1838, dressed as a sailor, he left Baltimore by train and ferry, and reached New York, free.', ['c-escape'])] },

  // Room 2: A New Name, a New Voice
  { id: 'name', room: 1, transition: 'formeLock', plates: [PLATES.miller()],
    margin: { year: '1838', place: 'New Bedford, Massachusetts' },
    beats: [beat('name.1', 'In New Bedford he took a new name, Douglass, and at Nantucket in August 1841 he spoke to an anti-slavery convention.', ['c-name', 'c-nantucket'])] },
  { id: 'lectern', room: 1, transition: 'reconGate',
    plates: [recon('recon-lectern-empty', 'Imagined from the Nantucket Atheneum of August 1841; no image of the room survives, and no one is shown.')],
    margin: { year: '1841', place: 'Nantucket, Massachusetts' },
    beats: [beat('lectern.1', 'The Massachusetts Anti-Slavery Society hired him as a lecturer.', ['c-nantucket'])] },
  { id: 'narrative', room: 1, plates: [PLATES.titlePage()],
    margin: { year: '1845', place: 'Boston, Massachusetts' },
    marks: [
      { kind: 'underline', anchor: 'himself', at: { x: 0.329, y: 0.6385, w: 0.308 } },
      { kind: 'detail', anchor: 'success', rect: { x: 0.235, y: 0.40, w: 0.5, h: 0.5 }, dur: 1.6 },
    ],
    beats: [
      beat('narrative.1', 'In 1845 he published his Narrative. The title page said it plainly: written by himself.', ['c-narrative']),
      beat('narrative.2', 'It was an immediate success. He took it to Britain and Ireland, where supporters raised the money that bought his legal freedom in 1846.', ['c-narrative', 'c-britain']),
    ] },

  // Room 3: The North Star
  { id: 'northstar', room: 2, transition: 'formeLock', plates: [PLATES.northStar()],
    margin: { year: '1847', place: 'Rochester, New York' },
    lowerThird: { name: 'Rochester', role: 'Upstate New York · his newspaper', at: 1.4 },
    marks: [{ kind: 'detail', anchor: 'newspaper', rect: { x: 0.06, y: 0.02, w: 0.82, h: 0.82 }, dur: 1.6 }],
    beats: [beat('northstar.1', 'In December 1847 he founded his own newspaper in Rochester, The North Star.', ['c-northstar'])] },
  { id: 'seneca', room: 2, plates: [PLATES.frontis()],
    margin: { year: '1848', place: 'Seneca Falls, New York' },
    beats: [
      beat('seneca.1', 'In July 1848 he spoke at Seneca Falls in support of votes for women.', ['c-seneca']),
      beat('seneca.2', 'In 1851 he broke with William Lloyd Garrison, arguing that the Constitution could be read as an anti-slavery instrument.', ['c-constitution']),
      beat('seneca.3', 'He knew John Brown, but in 1859 declined to join the raid on Harpers Ferry, judging it doomed.', ['c-brown']),
    ] },
  { id: 'fourth', room: 2, plates: [PLATES.younger()],
    margin: { year: '1852', place: 'Rochester, New York' },
    beats: [beat('fourth.1', 'On 5 July 1852 he asked a Rochester audience: what, to the American slave, is your Fourth of July?', ['c-fourth'])] },
  { id: 'census', room: 2, plates: [PLATES.merrill()],
    margin: { place: 'The U.S. census' },
    graphic: { kind: 'dateStack', items: [
      { anchor: '1840', year: '1840', label: '2,487,355 enslaved' },
      { anchor: '1850', year: '1850', label: '3,204,313 enslaved' },
      { anchor: '1860', year: '1860', label: '3,953,760 enslaved' },
    ] },
    beats: [beat('census.1', 'The census counted nearly two and a half million enslaved people in 1840, over three million in 1850, and almost four million in 1860.', ['c-census'])] },

  // Room 4: War and Reconstruction
  { id: 'soldiers', room: 3, transition: 'formeLock', plates: [PLATES.merrill()],
    margin: { year: '1863', place: 'Washington, D.C.' },
    beats: [
      beat('soldiers.1', 'In the Civil War he recruited Black soldiers, including for the 54th Massachusetts, where two of his sons served.', ['c-soldiers']),
      beat('soldiers.2', 'In August 1863 he went to the White House to press President Lincoln for equal pay and protection for Black soldiers.', ['c-lincoln']),
    ] },
  { id: 'vote', room: 3, plates: [PLATES.nyhs()],
    margin: { year: '1869', place: 'Washington, D.C.' },
    beats: [beat('vote.1', 'After the war he campaigned for citizenship and the vote, and in 1869 supported the Fifteenth Amendment, even though it did not enfranchise women.', ['c-suffrage'])] },

  // Room 5: Cedar Hill
  { id: 'offices', room: 4, transition: 'formeLock', plates: [PLATES.warren()],
    margin: { year: '1877', place: 'Washington, D.C.' },
    lowerThird: { name: 'Cedar Hill', role: 'Anacostia · his home until 1895', at: 1.4 },
    beats: [beat('offices.1', 'He served as Marshal for the District of Columbia and as minister to Haiti, and made his home at Cedar Hill, overlooking Washington.', ['c-offices', 'c-cedarhill'])] },
  { id: 'desk', room: 4, transition: 'reconGate',
    plates: [recon('recon-study-desk', 'Imagined from the National Park Service’s account of the Cedar Hill study; no person is shown and no page is legible.')],
    margin: { year: '1880–95', place: 'Cedar Hill, Washington' },
    beats: [beat('desk.1', 'There he kept writing, telling his own story for a third time.', ['c-selfmade'])] },
  { id: 'death', room: 4, plates: [PLATES.grandson()],
    margin: { year: '1895', place: 'Cedar Hill' },
    beats: [
      beat('death.0', 'After his wife Anna died in 1882, he married Helen Pitts in 1884, and the marriage drew public criticism.', ['c-helen']),
      beat('death.1', 'He died at Cedar Hill on 20 February 1895, hours after a meeting of the National Council of Women.', ['c-death']),
    ] },
  { id: 'struggle', room: 4, plates: [PLATES.miller()],
    margin: { year: '1857', place: 'Canandaigua, New York' },
    graphic: { kind: 'pullQuote', anchor: 'If', text: 'If there is no struggle there is no progress.', cite: 'West India Emancipation speech, 3 August 1857' },
    beats: [beat('struggle.1', 'If there is no struggle, he said in 1857, there is no progress.', ['c-struggle'])] },
];

const archiveIds = (): string[] => [...new Set([...DOUGLASS_COUNCIL_SHOTS.flatMap(s => s.plates ?? []), PLATES.miller()].filter(p => p.kind === 'archive').map(p => p.asset))];

export const DOUGLASS_COUNCIL_ASSETS: FilmAsset[] = [...K.assetList(archiveIds(), 'jpg'), ...K.reconList('png')];

function endCard(voiced: boolean): CouncilFilm['endCard'] {
  return [
    { head: 'Archive photographs and documents', lines: [
      'Real photographs, engravings and printed pages, unaltered', 'Library of Congress · Art Institute of Chicago',
      'New-York Historical Society · Internet Archive', 'Notman Photo Co. · Merrill & Crosby · George K. Warren',
      'All public domain; plates as held by Wikimedia Commons' ] },
    { head: 'Reconstructions (all labelled)', lines: [
      'Four paintings, none with a face: a boy chalking a plank,', 'a field at dusk, the empty Nantucket lectern,',
      'the writing desk at Cedar Hill. AI-generated (Seedream 4.5,', 'Google Nano Banana Pro via Magnific); each carries the',
      'RECONSTRUCTION stamp and an evidence note' ] },
    { head: 'Sources', lines: [
      'Narrative of the Life of Frederick Douglass (1845)', 'My Bondage and My Freedom (1855)', 'Life and Times of Frederick Douglass (1881, rev. 1892)',
      'David W. Blight, Frederick Douglass: Prophet of Freedom', 'William S. McFeely, Frederick Douglass · National Park Service' ] },
    { head: 'Figures and words', lines: [
      'Enslaved population 1840, 1850, 1860: U.S. Census Bureau,', 'Working Paper 56, Table 1 (ledger claim c-census)',
      '“If there is no struggle there is no progress”: West India', 'Emancipation, Canandaigua, 3 August 1857, from Two Speeches', '(Rochester, 1857), as transcribed on Wikisource (c-struggle)' ] },
    { head: voiced ? 'Narration' : 'Narration (not yet recorded)', lines: voiced ? ['Synthetic voice (Google Gemini TTS)'] : ['This cut is silent; captions carry the narration', 'Timing is estimated and re-times when narration is added'] },
    { head: 'Score and sound', lines: ['Original score, synthesised for Plajah', 'Type clicks and the forme-lock thump synthesised, credited as generated'] },
    { head: 'Type', lines: ['Abril Fatface, Alfa Slab One, Source Serif 4,', 'Inter Tight (SIL Open Font License)'] },
  ];
}

export function buildDouglassCouncilFilm(opts: { narration?: BeatTimings; width?: number; height?: number } = {}): FilmSpec {
  const shots = withNarration(DOUGLASS_COUNCIL_SHOTS, opts.narration);
  const voiced = !!opts.narration && shots.every(s => (s.beats ?? []).every(b => b.audio));
  const council: CouncilFilm = {
    id: 'douglass-council', title: 'Frederick Douglass', dates: '1818 — 1895', tagline: 'Born enslaved. Became the nation’s conscience.',
    theme: councilTheme(DOSSIER_THEMES['frederick-douglass'], { titleGesture: 'composing', faces: { slab: "'Alfa Slab One', 'Abril Fatface', Georgia, serif" } }),
    exhibitRoomCount: 5, rooms: ROOMS, titlePlate: PLATES.miller(), shots,
    endCard: endCard(voiced),
    accentTerms: ['Frederick Douglass', 'Douglass', 'Maryland', 'Baltimore', 'New Bedford', 'Nantucket', 'Rochester', 'Cedar Hill', 'Edward Covey', 'New York', 'The North Star', 'Haiti', 'Washington', 'Britain', 'Ireland', 'Lincoln', 'Narrative'],
    honesty: 'Real photographs first. Paintings are labelled.',
  };
  return {
    id: 'douglass-council-film', title: 'Frederick Douglass', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    style: 'council', council, scenes: [], assets: DOUGLASS_COUNCIL_ASSETS,
    score: { src: `${R}/score.mp3`, volume: 0.35, duckTo: 0.12 },
  };
}

export const DOUGLASS_NARRATION_URL = `${R}/film/council/narration.json`;

export async function loadDouglassCouncilFilm(width?: number, height?: number): Promise<FilmSpec> {
  return buildDouglassCouncilFilm({ narration: await fetchNarration(DOUGLASS_NARRATION_URL), width, height });
}
