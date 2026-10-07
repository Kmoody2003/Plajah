/**
 * "Henry Ford", the first Dossier film in the Motion Council's style (services/dossier/film/council*.ts).
 *
 * About 3.5 minutes in six film rooms that map onto the exhibit's eight-room plan strip (ford.ts):
 *   1 A farm boy and the first cars   -> rooms 1-2   (Motor City)
 *   2 The car for the great multitude -> room 3      (Motor City)
 *   3 The Rouge                       -> rooms 4-5   (Motor City)
 *   4 The war effort                  -> room 6      (The War Effort)
 *   5 Beliefs and Morals              -> room 7      (same type, caption grammar and pace as the Rouge room)
 *   6 Legacy                          -> room 8      (Legacy)
 *
 * Every narrated sentence cites claim ids from the exhibit's ledger (data/dossier/ford.ts); tests/dossierFilmCouncil
 * checks they exist. Ford himself appears only as an archive photograph. The two paintings are labelled: a boy seen from
 * behind, and the one full-bleed reconstruction the owner allows, the Willow Run B-24 line. The painted Highland Park
 * (folded arms), Greenfield and Piquette pictures show a painted Ford and are deliberately NOT used.
 *
 * Narration: scripts/dossier/narrate.ts --film=ford voices each beat; without that file the film runs silent on
 * ESTIMATED timing (captions.ts) and re-times itself the moment narration.json exists.
 */
import type { FilmAsset, FilmSpec } from '../../services/dossier/film/filmTypes';
import type { CouncilBeat, CouncilFilm, CouncilShot, PlateSpec, Slate } from '../../services/dossier/film/councilTypes';
import { councilTheme } from '../../services/dossier/film/councilCompile';
import { DOSSIER_THEMES } from './registry';
import rawAssets from './fordAssets.json';

const R = '/dossier/ford';
const archive = rawAssets as Array<{ id: string; date: string; width: number; height: number; rights: { status: string; credit: string } }>;

/** Reconstruction files (public/dossier/ford/recon) and their pixel sizes. */
const RECON: Record<string, { w: number; h: number }> = {
  'recon-ford-watch-table': { w: 2200, h: 1228 },
  'recon-willow-run': { w: 2200, h: 1228 },
};

const yearOf = (d: string): string => {
  const years = d.match(/\d{4}/g) ?? [];
  if (/between/i.test(d) && years.length >= 2) return `${years[0]}–${years[1]}`;
  if (/c(irca|\.)?\s?\d{4}/i.test(d)) return `c. ${years[0]}`;
  return years[0] ?? d;
};

/** Archive plate: slate built from the asset record (source credit, year, licence), never typed twice. */
function arch(id: string, title: string, over: Partial<Slate> & { minHold?: number; distressing?: boolean } = {}): PlateSpec {
  const a = archive.find(x => x.id === id);
  if (!a) throw new Error(`fordFilmCouncil: unknown archive asset ${id}`);
  const source = a.rights.credit.replace(/\s*\((Public domain|CC0)\)\s*$/, '').replace(/ via /, ' · ').replace(/^Unknown author/, 'Unknown photographer');
  const { minHold, distressing, ...slate } = over;
  return {
    asset: id, kind: 'archive', size: { w: a.width, h: a.height }, minHold, distressing,
    slate: { title, source, year: yearOf(a.date), licence: a.rights.status === 'cc0' ? 'CC0' : 'Public domain', ...slate },
  };
}

function recon(id: string, evidence: string, o: { fullBleed?: boolean; focusY?: number } = {}): PlateSpec {
  return { asset: id, kind: 'reconstruction', size: RECON[id], slate: { evidence }, ...o };
}

const beat = (id: string, text: string, claimIds: string[]): CouncilBeat => ({ id, text, claimIds });

// ── Rooms ────────────────────────────────────────────────────────────────────
const ROOMS: CouncilFilm['rooms'] = [
  { id: 'boy', title: 'A farm boy and the first cars', exhibitRooms: [1, 2], wing: 'Motor City' },
  { id: 'line', title: 'The car for the great multitude', exhibitRooms: [3, 3], wing: 'Motor City' },
  { id: 'rouge', title: 'The Rouge', exhibitRooms: [4, 5], wing: 'Motor City' },
  { id: 'war', title: 'The war effort', exhibitRooms: [6, 6], wing: 'The War Effort' },
  { id: 'beliefs', title: 'Beliefs and Morals', exhibitRooms: [7, 7], wing: 'Beliefs and Morals' },
  { id: 'legacy', title: 'Legacy', exhibitRooms: [8, 8], wing: 'Legacy' },
];

// ── Shots ────────────────────────────────────────────────────────────────────
export const FORD_COUNCIL_SHOTS: CouncilShot[] = [
  // Room 1 — a farm boy and the first cars
  { id: 'born', room: 0, plates: [arch('ref-1919-hartsook', 'Henry Ford, portrait by Hartsook, 1919')],
    margin: { year: '1863', place: 'Greenfield Township, Michigan' },
    lowerThird: { name: 'Henry Ford', role: '1863–1947 · Dearborn, Michigan' },
    beats: [beat('born.1', 'Henry Ford was born on 30 July 1863, on a farm near Dearborn, Michigan.', ['c-born'])] },
  { id: 'watch', room: 0, transition: 'reconGate',
    plates: [recon('recon-ford-watch-table', 'Painted from Ford’s own account in My Life and Work. No photograph of him before his late thirties was found, so the boy is seen from behind.')],
    margin: { year: 'Boyhood' },
    beats: [beat('watch.1', 'He wrote that he disliked farm work, and that his toys were tools. By about fifteen, he could repair almost any watch.', ['c-farm', 'c-engine-watch'])] },
  { id: 'fmc', room: 0, plates: [arch('ph-piquette-1906', 'Ford Piquette Avenue Plant, with an early Ford car in front', { source: 'Peninsular Engraving Co., Detroit · Wikimedia Commons' })],
    margin: { year: '1903', place: 'Detroit' },
    beats: [beat('fmc.1', 'In 1896 he finished the Quadricycle, a gasoline-powered vehicle. Ford Motor Company followed, incorporated on 16 June 1903 with $28,000 in capital.', ['c-quadricycle', 'c-fmc'])] },

  // Room 2 — the car for the great multitude
  { id: 'modelt', room: 1, transition: 'stampSlam', stamp: '1908', plates: [arch('ph-woodward-1910', 'Woodward Avenue at Grand Circus Park, Detroit, about 1910')],
    margin: { year: '1908', place: 'Detroit' },
    beats: [beat('modelt.1', 'In 1908 Ford introduced the Model T, priced at about $825: a car, he recalled, for the great multitude.', ['c-modelt', 'c-multitude'])] },
  { id: 'line', room: 1, minHold: 8, plates: [arch('doc-1913-assembly-line', 'Flywheel magneto and wheel work on the assembly line, Highland Park')],
    margin: { year: '1913', place: 'Highland Park, Michigan' },
    lowerThird: { name: 'Highland Park', role: 'Ford’s plant outside Detroit · opened 1910', at: 0.9 },
    graphic: { kind: 'clock', anchor: '93' },
    beats: [
      beat('line.1', 'At Highland Park, which opened in 1910, the moving assembly line came in stages in 1913.', ['c-highland', 'c-line-stages']),
      beat('line.2', 'Building one Model T chassis once took roughly 12.5 hours. By early 1914, about 93 minutes.', ['c-93min']),
    ] },
  { id: 'fiveday', room: 1, transition: 'stampSlam', stamp: '1914', plates: [arch('doc-highland-park-shift', 'Change of work shift at the Ford Motor Company, Highland Park')],
    margin: { year: '1914', place: 'Highland Park, Michigan' },
    graphic: { kind: 'wage', anchor: '$5', anchor2: '$2.34' },
    beats: [
      beat('fiveday.1', 'In 1914 Ford announced $5 for an eight-hour day, in place of about $2.34 for nine.', ['c-5day']),
      beat('fiveday.2', 'To earn all of it, workers faced home inspections. Historians still debate whether that was reform or control.', ['c-socio', 'c-socio-view']),
    ] },

  // Room 3 — the Rouge
  { id: 'rouge', room: 2, transition: 'stampSlam', stamp: '1917', minHold: 12, plates: [arch('doc-1927-rouge-aerial', 'Aerial view of the Ford River Rouge plant')],
    margin: { place: 'Dearborn, Michigan' },
    lowerThird: { name: 'River Rouge', role: 'Dearborn · built 1917–1928', at: 1.2 },
    graphic: { kind: 'dateStack', items: [
      { anchor: '1932', year: '1932', label: 'The march on the plant' },
      { anchor: '1937', year: '1937', label: 'The overpass' },
      { anchor: '1941', year: '1941', label: 'Union contract signed' },
    ] },
    beats: [
      beat('rouge.1', 'In 1917 Ford began the River Rouge complex in Dearborn, finished in 1928: steel, power and assembly on one site, employing up to about 100,000 people.', ['c-rouge']),
      beat('rouge.2', 'On 7 March 1932, police and Ford guards fired on unemployed marchers heading for the plant, killing four that day.', ['c-hunger']),
      beat('rouge.3', 'On 26 May 1937, Ford’s Service Department men beat union organizers at an overpass, including Walter Reuther.', ['c-overpass']),
      beat('rouge.4', 'On 20 June 1941, after a walkout, Ford, the last major Detroit automaker to hold out, signed with the union.', ['c-1941']),
    ] },

  // Room 4 — the war effort
  { id: 'ww1', room: 3, plates: [arch('ph-eagle-1919', 'Eagle boats ordered by the U.S. Government, officers aboard', { source: 'National Archives (War Dept. series 165-WW) · Commons', year: '1919' })],
    margin: { year: '1917–1918' },
    beats: [beat('ww1.1', 'By his own account, Ford’s factories worked almost entirely for the government in the First World War.', ['c-ww1-ford'])] },
  { id: 'willow', room: 3, transition: 'stampSlam', stamp: '1942', plates: [arch('doc-1943-willow-run', 'Looking up an assembly line of B-24E bombers at Willow Run')],
    margin: { year: '1942', place: 'Near Ypsilanti, Michigan' },
    lowerThird: { name: 'Willow Run', role: 'Ford’s bomber plant · B-24 Liberators', at: 1.0 },
    beats: [beat('willow.1', 'In 1942, at Willow Run, Ford began building B-24 Liberator bombers; by 1944, one left the line about every hour.', ['c-willow'])] },
  { id: 'b24', room: 3, transition: 'reconGate',
    plates: [recon('recon-willow-run', 'Imagined scene after Hollem’s 1943 Willow Run photographs; every figure and detail is painted.', { fullBleed: true, focusY: 0.58 })],
    beats: [beat('b24.1', 'The plant held about 3.5 million square feet under one roof, and employment peaked at about 42,000.', ['c-willow-scale'])] },
  { id: 'riveting', room: 3, plates: [arch('ph-willow-riveting-1943', 'Riveting a center wing section for a B-24E Liberator, Willow Run')],
    margin: { year: '1943', place: 'Near Ypsilanti, Michigan' },
    beats: [
      beat('riveting.1', 'Workers were scarce and housing short: one month the plant hired 2,900 people and lost 3,100.', ['c-willow-turnover']),
      beat('riveting.2', 'Wartime need brought many women into the plant.', ['c-willow-labor']),
    ] },

  // Room 5 — Beliefs and Morals: same type, caption grammar and pace as the Rouge, entered through a Silence Hold
  { id: 'note', room: 4, kind: 'card', transition: 'silenceHold',
    card: { lines: ['The next room shows antisemitic propaganda that Ford published.', 'Any key skips this section.'] } },
  { id: 'indep1920', room: 4, plates: [arch('doc-1920-dearborn-independent', 'The Dearborn Independent, 22 May 1920: the first “International Jew” article', { minHold: 4, source: 'The Dearborn Independent · Wikimedia Commons' })],
    margin: { year: '1920', place: 'Dearborn, Michigan' },
    beats: [beat('indep1920.1', 'On 22 May 1920, The Dearborn Independent began a series, “The International Jew.” It ran for 91 weeks.', ['c-series'])] },
  { id: 'pages', room: 4, minHold: 5,
    plates: [arch('doc-1920-international-jew-titlepage', 'Title page, The International Jew, November 1920', { minHold: 4 }), arch('doc-1921-dearborn-independent-cover', 'The Dearborn Independent, 6 August 1921, front page', { minHold: 4 })],
    groupSlate: { title: 'Left: title page of the book, November 1920. Right: front page of The Dearborn Independent, 6 August 1921.', source: 'Unknown author; The Dearborn Independent · Wikimedia Commons', year: '1920–1921', licence: 'Public domain' },
    margin: { year: '1920–1922', place: 'Reprinted as a book' },
    beats: [
      beat('pages.1', 'It drew on The Protocols of the Elders of Zion, a forgery, and blamed Jews for wars, finance and cultural decline.', ['c-protocols']),
      beat('pages.2', 'Jews were its targets. The articles became a book, translated into many languages.', ['c-volumes', 'c-protocols']),
    ] },
  { id: 'retract', room: 4, plates: [arch('doc-1927-dearborn-independent-cover', 'The Dearborn Independent, 11 June 1927: the cover, nineteen days before the retraction', { minHold: 4 })],
    margin: { year: '1927', place: 'Dearborn, Michigan' },
    beats: [
      beat('retract.1', 'In 1924 it attacked the lawyer Aaron Sapiro, who sued for libel. On 30 June 1927, Ford issued a retraction and apology.', ['c-sapiro', 'c-retraction']),
      beat('retract.2', 'Historians still ask how involved he was, and whether he meant it.', ['c-ford-role', 'c-retraction-know']),
    ] },

  // Room 6 — legacy
  { id: 'fairlane', room: 5, plates: [arch('ref-1938-car', 'Henry Ford in a car with Jay G. Hayden, Washington, D.C., 1938')],
    margin: { year: '1947', place: 'Dearborn, Michigan' },
    lowerThird: { name: 'Fair Lane', role: 'Ford’s estate in Dearborn · 1947', at: 0.8 },
    beats: [beat('fairlane.1', 'Henry Ford died on 7 April 1947, aged 83, at Fair Lane, his estate in Dearborn.', ['c-death'])] },
  { id: 'legacy1', room: 5, plates: [arch('ph-ford-plant-1910s', 'Ford Motor Company factory building, Detroit, 1910–1920')],
    margin: { year: '1972' },
    beats: [beat('legacy1.1', 'The Model T stayed the best-selling car in history until 1972.', ['c-modelt-legacy'])] },
  { id: 'legacy2', room: 5, plates: [arch('ref-1927-whitehouse', 'Henry Ford, standing, at the White House, 1927')],
    margin: {},
    beats: [beat('legacy2.1', 'Historians still disagree on how to weigh his engineering and wages against his antisemitism and labor record.', ['c-hist'])] },
];

const USED_ARCHIVE = [...new Set([...FORD_COUNCIL_SHOTS.flatMap(s => s.plates ?? []), titlePlate()].filter(p => p.kind === 'archive').map(p => p.asset))];

function titlePlate(): PlateSpec {
  return arch('doc-1913-assembly-line', 'Flywheel magneto and wheel work on the assembly line, Highland Park');
}

const credit = (id: string) => {
  const a = archive.find(x => x.id === id)!;
  return `${a.rights.credit} · ${yearOf(a.date)}`;
};

export const FORD_COUNCIL_ASSETS: FilmAsset[] = [
  ...USED_ARCHIVE.map(id => ({ id, src: `${R}/archival/${id}.jpg`, credit: credit(id) })),
  ...Object.keys(RECON).map(id => ({ id, src: `${R}/recon/${id}.jpg`, credit: 'Reconstruction · Plajah Dossier (AI-generated from documented sources)' })),
];

export interface BeatTimings { [beatId: string]: { audio: string; duration: number } }

function endCard(voiced: boolean): CouncilFilm['endCard'] {
  return [
    { head: 'Archive photographs and documents', lines: [
      'Real photographs, prints and printed pages, shown scaled and unaltered', 'Detroit Publishing Company · Howard R. Hollem · Harris & Ewing',
      'National Archives · The Dearborn Independent · Hartsook', 'Peninsular Engraving Co. · Ford Motor Company · unknown photographers',
      'All public domain, via Wikimedia Commons' ] },
    { head: 'Reconstructions (all labelled)', lines: [
      'Two paintings: a boy at a watch table, and the Willow Run line', 'AI-generated: Google Nano Banana Pro via Magnific', 'Each carries the RECONSTRUCTION stamp and an evidence note' ] },
    { head: 'Sources', lines: [
      'Henry Ford with Samuel Crowther, My Life and Work (1922)', 'The Henry Ford, Benson Ford Research Center collections',
      'Steven Watts, The People’s Tycoon (2005)', 'Neil Baldwin, Henry Ford and the Jews (2001)', 'Walter P. Reuther Library, Wayne State University' ] },
    { head: 'Figures', lines: ['Every figure is a claim in the exhibit’s evidence ledger', 'Chassis time: roughly 12.5 hours to about 93 minutes (c-93min)', 'Wage: $5.00 against about $2.34 (c-5day)'] },
    { head: voiced ? 'Narration' : 'Narration (not yet recorded)', lines: voiced ? ['Synthetic voice (Google Gemini TTS)'] : ['This cut is silent; captions carry the narration', 'Timing is estimated and re-times when narration is added'] },
    { head: 'Score and sound', lines: ['Original score, synthesised for Plajah', 'Stamp and ratchet sounds synthesised, credited as generated'] },
    { head: 'Type', lines: ['Anton, Source Serif 4, Inter Tight (SIL Open Font License)'] },
    { head: 'Review', lines: ['Beliefs and Morals: review by a Jewish museum partner is still to come'] },
  ];
}

export function buildFordCouncilFilm(opts: { narration?: BeatTimings; width?: number; height?: number } = {}): FilmSpec {
  const n = opts.narration;
  const shots = FORD_COUNCIL_SHOTS.map(s => !s.beats ? s : {
    ...s, beats: s.beats.map(b => n?.[b.id] ? { ...b, audio: n[b.id].audio, duration: n[b.id].duration } : b),
  });
  const voiced = !!n && shots.every(s => (s.beats ?? []).every(b => b.audio));
  const council: CouncilFilm = {
    id: 'ford-council', title: 'Henry Ford', dates: '1863 — 1947', tagline: 'He put America on wheels. He also put hatred in print.',
    theme: councilTheme(DOSSIER_THEMES['henry-ford'], { titleGesture: 'stamp' }),
    exhibitRoomCount: 8, rooms: ROOMS, titlePlate: titlePlate(), shots,
    endCard: endCard(voiced),
    accentTerms: ['Henry Ford', 'Quadricycle', 'Detroit', 'Dearborn', 'Michigan', 'Highland Park', 'River Rouge', 'Willow Run', 'Model T', 'Barney Oldfield', 'Walter Reuther', 'Aaron Sapiro', 'The Dearborn Independent', 'International Jew', 'Fair Lane', 'B-24 Liberator', 'Ypsilanti'],
    honesty: 'Real photographs first. Paintings are labelled.',
  };
  return {
    id: 'ford-council-film', title: 'Henry Ford', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    style: 'council', council, scenes: [], assets: FORD_COUNCIL_ASSETS,
    score: { src: `${R}/score.mp3`, volume: 0.35, duckTo: 0.12 },
  };
}

/** Browser loader: fetches beat timings from public/ when narration has been produced; silent estimated timing otherwise. */
export async function loadFordCouncilFilm(width?: number, height?: number): Promise<FilmSpec> {
  let narration: BeatTimings | undefined;
  try { const r = await fetch(`${R}/film/council/narration.json`); if (r.ok) narration = await r.json(); } catch { /* silent cut */ }
  return buildFordCouncilFilm({ narration, width, height });
}
