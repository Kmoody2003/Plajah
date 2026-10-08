/**
 * "The Partition of India, 1947", in the Motion Council's style (services/dossier/film/council*.ts).
 *
 * About 3.5 minutes in six film rooms that map onto the exhibit's twelve-room plan strip (partition.ts):
 *   1 The Raj and its categories; demands and counter-demands      -> rooms 1-2
 *   2 The Cabinet Mission, Direct Action, the plan of 3 June       -> rooms 3-4   (Silence Hold before Calcutta)
 *   3 The Line (the Foreign Office map, colour-isolated)           -> room 5
 *   4 Migration and violence                                       -> rooms 6-7   (Silence Hold, refugee photographs)
 *   5 Gandhi, refugees and the long afterlife                      -> rooms 8-9
 *   6 Memory, how we know, voices                                  -> rooms 10-12
 *
 * The exhibit's own gesture: the line. Soot ground, madder only on the drawn line and the years. A line is drawn, hesitates,
 * divides the frame, and stays as a margin hairline that thickens each room. The Madder Rule transition is used twice, on
 * places and on the moment the Radcliffe line is drawn, never on a face, a refugee photograph or violence.
 *
 * Even-handed by construction: the death toll and the displacement are shown only as ranges, labelled "estimates differ";
 * no violence is pictured; the paintings are empty places (a desk, a platform, a camp). People appear only in real archive
 * plates, and refugee photographs sit behind a content note and a Silence Hold, full size, ungraded, nothing moving.
 *
 * TITLE: the exhibit's own data carries one non-Latin string, the Urdu title word in registry.ts (theme.script). The film sets
 * that and English. It carries NO Hindi or Punjabi text because the exhibit has none to draw from; the end card says so,
 * and marks the Urdu "pending native-reader proofing".
 *
 * Every narrated sentence cites claim ids from the ledger (data/dossier/partition.ts); tests/dossierFilmCouncil checks them.
 */
import type { FilmAsset, FilmSpec } from '../../services/dossier/film/filmTypes';
import type { CouncilFilm, CouncilShot, ScriptString } from '../../services/dossier/film/councilTypes';
import { councilTheme } from '../../services/dossier/film/councilCompile';
import { DOSSIER_THEMES } from './registry';
import rawAssets from './partitionAssets.json';
import { createKit, fetchNarration, withNarration, type BeatTimings, type RawAsset } from './councilFilmKit';

const R = '/dossier/partition';

const RECON: Record<string, { w: number; h: number }> = {
  'recon-radcliffe-desk': { w: 2752, h: 1536 },
  'recon-empty-platform': { w: 2560, h: 1440 },
  'recon-camp-tents': { w: 2752, h: 1536 },
};
const K = createKit(R, rawAssets as unknown as RawAsset[], RECON, 'Reconstruction · Plajah Dossier (AI-generated from documented sources, no person shown)');
const { arch, recon, beat } = K;

/** The exhibit's own non-Latin strings (data/dossier/registry.ts, theme.script). No Hindi or Punjabi string exists in the exhibit's data. */
export const PARTITION_SCRIPTS: ScriptString[] = [
  { text: 'تقسیمِ ہند', lang: 'urdu', reading: 'Urdu: “the partition of India”', source: 'data/dossier/registry.ts (theme.script)' },
];
const [URDU] = PARTITION_SCRIPTS;

/** Hand-placed town positions on the Foreign Office map, as on the exhibit's own map page (public/dossier/partition-map.html), 1280 x 949. */
const TOWNS: Array<{ n: string; x: number; y: number; side: 'I' | 'P' }> = [
  { n: 'Sialkot', x: 790, y: 282, side: 'P' }, { n: 'Gurdaspur', x: 881, y: 343, side: 'I' }, { n: 'Amritsar', x: 840, y: 413, side: 'I' },
  { n: 'Lahore', x: 762, y: 424, side: 'P' }, { n: 'Jullundur', x: 924, y: 458, side: 'I' }, { n: 'Ferozepore', x: 800, y: 497, side: 'I' },
  { n: 'Montgomery', x: 612, y: 540, side: 'P' },
];

const PLATES = {
  gazette: () => arch('a-radcliffe-award-report', 'The Punjab boundary award, Gazette of India Extraordinary, 17 August 1947', 'Government of India · Commons', { minHold: 4 }),
  bahadur: () => arch('a-bahadur-shah-1858', 'Bahadur Shah Zafar, the last Mughal emperor, photographed in 1858', 'Tytler and Shepherd · British Library · Commons'),
  lahore1940: () => arch('a-lahore-1940-committee', 'Muslim League leaders, Lahore, March 1940', 'Unknown photographer · Commons'),
  cabinet: () => arch('a-cabinet-mission-jinnah', 'The Cabinet Mission in talks, 1946', 'British government · British Library · Commons'),
  rally: () => arch('a-direct-action-rally', 'A Muslim League rally in Calcutta, 16 August 1946', 'Unknown photographer · Commons'),
  mountbatten: () => arch('a-mountbatten-jinnah-1947', 'Lord Mountbatten with Jinnah and Fatima Jinnah, 1947', 'No. 9 AFPU · Imperial War Museums · Commons'),
  radcliffe: () => arch('a-radcliffe-portrait', 'Sir Cyril Radcliffe, 1949', 'Elliott & Fry · National Portrait Gallery · Commons'),
  map: () => arch('a-radcliffe-punjab-map', 'The Punjab boundaries, Foreign Office research map', 'Research Dept., Foreign Office · Commons', { year: 'September 1948', minHold: 4 }),
  mapLine: () => arch('a-radcliffe-punjab-map', 'The Punjab boundary line, isolated by colour from the Foreign Office map (not redrawn)', 'Research Dept., Foreign Office · Commons', { year: 'September 1948', treatment: { kind: 'isolate', channel: 'red' } }),
  station: () => arch('a-delhi-station-1947', 'Refugees arriving at Delhi railway station, 27 September 1947', 'Photo Division, Government of India · Commons', { distressing: true }),
  train: () => arch('a-ashti-special-1948', 'A refugee special train, February 1948', 'Photo Division, Ministry of Information · Commons', { distressing: true }),
  museum: () => arch('a-partition-museum', 'The Partition Museum, Town Hall, Amritsar', 'Nalbarian · Commons'),
  birla: () => arch('a-birla-house', 'Birla House, New Delhi', 'Gaurav Vaidya · Commons'),
  wagah: () => arch('a-wagah', 'The flag-lowering ceremony at Attari-Wagah', 'Eclicks by Bunny · Commons'),
  kartarpur: () => arch('a-kartarpur-view', 'The approach to the Kartarpur Corridor', 'Harvinder Chandigarh · Commons'),
  manto: () => arch('a-manto', 'Saadat Hasan Manto', 'Unknown photographer · Commons'),
  lights: () => arch('a-independence-illuminations', 'Government House illuminated, 15 August 1947', 'Photo Division, Government of India · Commons'),
};

// ── Rooms ────────────────────────────────────────────────────────────────────
const ROOMS: CouncilFilm['rooms'] = [
  { id: 'raj', title: 'The Raj and its demands', exhibitRooms: [1, 2], wing: 'The Raj to the Lahore Resolution' },
  { id: 'plan', title: 'The plan', exhibitRooms: [3, 4], wing: 'The Cabinet Mission to the Plan' },
  { id: 'line', title: 'The Line', exhibitRooms: [5, 5], wing: 'The Line' },
  { id: 'move', title: 'Migration and violence', exhibitRooms: [6, 7], wing: 'Princely States, Migration and Violence' },
  { id: 'after', title: 'Afterlife', exhibitRooms: [8, 9], wing: 'Gandhi, Refugees and the Long Afterlife' },
  { id: 'memory', title: 'How we know', exhibitRooms: [10, 12], wing: 'Memory, Sources and Voices' },
];

// ── Shots ────────────────────────────────────────────────────────────────────
export const PARTITION_COUNCIL_SHOTS: CouncilShot[] = [
  // Room 1: the Raj and its demands
  { id: 'raj', room: 0, plates: [PLATES.bahadur()],
    margin: { year: '1858', place: 'Delhi' },
    beats: [
      beat('raj.1', 'In 1858 the Crown took over India from the East India Company. Colonial censuses counted people by religion and caste, and used the boxes to allot jobs and seats.', ['c-1858-crown', 'c-census']),
      beat('raj.2', 'Whether the counting hardened those boxes is still argued.', ['c-census-effect']),
    ] },
  { id: 'lahore', room: 0, plates: [PLATES.lahore1940()],
    margin: { year: '1940', place: 'Lahore' },
    beats: [beat('lahore.1', 'On 23 March 1940, at Lahore, the Muslim League called for Muslim-majority areas to be grouped as independent states. What that meant is still argued.', ['c-lahore-text', 'c-lahore-meaning'])] },

  // Room 2: the plan
  { id: 'cabinet', room: 1, plates: [PLATES.cabinet()],
    margin: { year: '1946', place: 'Delhi' },
    beats: [beat('cabinet.1', 'In 1946 the Cabinet Mission proposed a loose union, and by July the plan had collapsed.', ['c-cabinet-mission', 'c-plan-collapse'])] },
  { id: 'note1', room: 1, kind: 'card', transition: 'silenceHold', holdUntil: 'dad',
    card: { lines: ['The next section describes killing in Calcutta in August 1946.', 'Any key skips this section.'] } },
  { id: 'dad', room: 1, plates: [PLATES.rally()],
    margin: { year: '1946', place: 'Calcutta' },
    beats: [beat('dad.1', 'On 16 August 1946, a hartal in Calcutta became about four days of killing. The dead number from about 4,000 to 10,000 or more; no reliable count exists.', ['c-dad'])] },
  { id: 'dates', room: 1, plates: [PLATES.mountbatten()],
    graphic: { kind: 'dateStack', items: [
      { anchor: '3', year: '3 June', label: 'The plan announced' },
      { anchor: '14', year: '14 August', label: 'Pakistan comes into being' },
      { anchor: '15th', year: '15 August', label: 'India' },
      { anchor: '17', year: '17 August', label: 'The boundary awards published' },
    ] },
    margin: { place: '1947' },
    beats: [beat('dates.1', 'On 3 June 1947 Mountbatten announced the plan. Pakistan came into being on 14 August, India on the 15th, and the boundary awards were published on 17 August.', ['c-3june', 'c-14-15', 'c-award-dates'])] },

  // Room 3: the Line
  { id: 'radcliffe', room: 2, plates: [PLATES.radcliffe()],
    margin: { year: '1947', place: 'New Delhi' },
    lowerThird: { name: 'Cyril Radcliffe', role: 'London barrister · chairman of both boundary commissions', at: 1.0 },
    beats: [beat('radcliffe.1', 'Cyril Radcliffe, a London barrister who had never been to India, reached Delhi on 8 July 1947 with about five weeks to draw two lines.', ['c-radcliffe-india', 'c-commission-members'])] },
  { id: 'desk', room: 2, transition: 'reconGate',
    plates: [recon('recon-radcliffe-desk', 'Imagined from the Boundary Commission’s setting; no one is shown.', { fullBleed: true, focusY: 0.55 })],
    beats: [beat('desk.1', 'He did not attend the Lahore hearings. The judges could not agree, so he decided alone.', ['c-no-sittings'])] },
  { id: 'map', room: 2, transition: 'madderRule', plates: [PLATES.map()],
    margin: { year: '1947', place: 'Punjab' },
    beats: [beat('map.1', 'The award is dated 12 August and was published on 17 August, two days after independence.', ['c-award-dates'])] },
  { id: 'line', room: 2, transition: 'madderRule', plates: [PLATES.mapLine()],
    margin: { year: '1947', place: 'Punjab' },
    graphic: { kind: 'isoLine', anchor: 'line', towns: TOWNS, view: { x: 0.42, y: 0.27, w: 0.4, h: 0.4 } },
    beats: [beat('line.1', 'Here is the line as the map prints it. Radcliffe wrote that there are legitimate criticisms of it, as of any other line that might be chosen.', ['c-line-effect', 'c-radcliffe-quote'])] },

  // Room 4: migration and violence (content note and Silence Hold; ranges only; no violence pictured)
  { id: 'note2', room: 3, kind: 'card', transition: 'silenceHold', holdUntil: 'toll',
    card: { lines: ['The next section describes displacement and violence.', 'Photographs of refugees follow. Any key skips this section.'] } },
  { id: 'displaced', room: 3, plates: [PLATES.station()],
    margin: { year: '1947', place: 'Delhi' },
    beats: [beat('displaced.1', 'Between about ten and twenty million people left their homes and crossed the new borders. The number depends on what is counted.', ['c-displaced'])] },
  { id: 'toll', room: 3, plates: [PLATES.train()],
    margin: { year: '1946–48' },
    graphic: { kind: 'rangeBar', anchor: 'estimates', rows: [
      { label: 'People killed, 1946–48', lo: 200_000, hi: 2_000_000, max: 2_500_000, loText: '200,000', hiText: '2,000,000', source: 'Published estimates; no census counted the dead' },
      { label: 'People who left their homes', lo: 10_000_000, hi: 20_000_000, max: 25_000_000, loText: '10 million', hiText: '20 million', source: 'Depends on what is counted' },
    ] },
    beats: [beat('toll.1', 'How many were killed is not known. Published estimates run from about 200,000 to two million, and no census or registry counted the dead.', ['c-deaths', 'c-displaced'])] },
  { id: 'platform', room: 3, transition: 'reconGate',
    plates: [recon('recon-empty-platform', 'Imagined; no one is shown. Attacks on trains are well attested, but known mainly from memoirs.')],
    beats: [beat('platform.1', 'Trains carrying refugees were stopped and attacked at stations in Punjab, in both directions.', ['c-trains'])] },
  { id: 'kindness', room: 3, plates: [PLATES.museum()],
    margin: { year: '1947', place: 'Amritsar' },
    beats: [beat('kindness.1', 'Survivors also recall neighbours who hid, fed and escorted people of other communities to safety.', ['c-kindness'])] },

  // Room 5: afterlife
  { id: 'gandhi', room: 4, plates: [PLATES.birla()],
    margin: { year: '1948', place: 'New Delhi' },
    beats: [beat('gandhi.1', 'Gandhi was shot dead at Birla House in New Delhi on 30 January 1948.', ['c-gandhi-killed'])] },
  { id: 'camps', room: 4, transition: 'reconGate',
    plates: [recon('recon-camp-tents', 'Imagined from the camps at Delhi’s old fort in 1947; no one is shown.')],
    margin: { year: 'Autumn 1947', place: 'Delhi' },
    beats: [beat('camps.1', 'In the autumn of 1947, Delhi’s old fort and open grounds became refugee camps.', ['c-camps'])] },
  { id: 'wagah', room: 4, plates: [PLATES.wagah()],
    margin: { year: '1959', place: 'Attari-Wagah' },
    beats: [beat('wagah.1', 'Every evening since 1959, the two border forces have lowered their flags together at Attari-Wagah.', ['c-wagah'])] },
  { id: 'kartarpur', room: 4, plates: [PLATES.kartarpur()],
    margin: { year: '2019', place: 'Kartarpur' },
    beats: [beat('kartarpur.1', 'In 2019 the Kartarpur Corridor opened, letting Indian Sikh pilgrims visit a shrine four kilometres across the border without a visa.', ['c-kartarpur'])] },

  // Room 6: memory
  { id: 'manto', room: 5, plates: [PLATES.manto()],
    margin: { year: '1948', place: 'Lahore' },
    beats: [beat('manto.1', 'Saadat Hasan Manto left Bombay for Lahore in 1948 and wrote some of the sharpest short fiction on 1947.', ['c-manto'])] },
  { id: 'archive', room: 5, plates: [PLATES.museum()],
    margin: { year: '2010', place: 'Berkeley and Amritsar' },
    beats: [beat('archive.1', 'The 1947 Partition Archive, begun in 2010, has recorded more than ten thousand interviews with survivors, made decades later; those who died in 1947 cannot be interviewed.', ['c-archive', 'c-oral-limits'])] },
  { id: 'words', room: 5, plates: [PLATES.lights()],
    margin: { year: '15 August 1947' },
    beats: [beat('words.1', 'Even the words are debated: partition, independence, taqsim, batwara. Historians ask whether 1947 was one event or a long process.', ['c-terminology'])] },
];

const archiveIds = (): string[] => [...new Set([...PARTITION_COUNCIL_SHOTS.flatMap(s => s.plates ?? []), PLATES.gazette()].filter(p => p.kind === 'archive').map(p => p.asset))];

export const PARTITION_COUNCIL_ASSETS: FilmAsset[] = [...K.assetList(archiveIds(), 'jpg'), ...K.reconList('jpg')];

function endCard(voiced: boolean): CouncilFilm['endCard'] {
  return [
    { head: 'Archive photographs and documents', lines: [
      'Real photographs, maps and printed pages, unaltered', 'British Library · Imperial War Museums · National Portrait',
      'Gallery · Government of India · Foreign Office · Gazette', 'Licences under each plate: public domain, CC BY, CC BY-SA' ] },
    { head: 'The line', lines: [
      'The Foreign Office map’s own printed red line, lifted out', 'by colour as on the exhibit’s map page, not redrawn.', 'The map’s public-domain tag is under rights review.' ] },
    { head: 'Reconstructions (all labelled)', lines: [
      'Three empty places: a desk, a platform, a camp. No person.', 'AI-generated: Google Nano Banana Pro via Magnific.', 'Each carries the RECONSTRUCTION stamp and an evidence note.' ] },
    { head: 'Ranges, not totals', lines: ['Deaths and displacement appear only as published ranges.', 'Estimates differ; no single number is endorsed', '(ledger claims c-deaths and c-displaced).'] },
    { head: 'Script, pending a native reader', lines: [
      'The Urdu title is the exhibit’s own string (registry.ts).', 'Pending native-reader proofing: no Urdu', 'reader has reviewed it. No Hindi or Punjabi title is shown:', 'the exhibit holds no proofed text in either.' ] },
    { head: 'Sources', lines: [
      'Yasmin Khan, The Great Partition', 'Talbot and Singh, The Partition of India', 'Lucy Chester, Borders and Conflict in South Asia',
      'Urvashi Butalia, The Other Side of Silence', 'Punjab Boundary Commission report (1947)' ] },
    { head: voiced ? 'Narration, sound and type' : 'Narration (not yet recorded), sound, type', lines: [
      voiced ? 'Synthetic voice (Google Gemini TTS)' : 'Silent cut; captions carry the narration. Timing is estimated.', 'Room tone and pencil scratch synthesised; no score.', 'Fraunces, Noto Nastaliq Urdu, Source Serif 4, Inter Tight (SIL OFL)' ] },
  ];
}

export function buildPartitionCouncilFilm(opts: { narration?: BeatTimings; width?: number; height?: number } = {}): FilmSpec {
  const shots = withNarration(PARTITION_COUNCIL_SHOTS, opts.narration);
  const voiced = !!opts.narration && shots.every(s => (s.beats ?? []).every(b => b.audio));
  const council: CouncilFilm = {
    id: 'partition-council', title: 'Partition', dates: '1857 — Today', tagline: 'A line drawn in five weeks, and the lives it divided.',
    theme: councilTheme(DOSSIER_THEMES['partition-1947'], {
      titleGesture: 'line',
      faces: { urdu: "'Noto Nastaliq Urdu', serif" },
      sans: "'Inter Tight', 'Inter', 'Noto Nastaliq Urdu', system-ui, sans-serif",
    }),
    exhibitRoomCount: 12, rooms: ROOMS, titlePlate: PLATES.gazette(), shots,
    endCard: endCard(voiced),
    accentTerms: ['Partition', 'Bahadur Shah', 'Muslim League', 'Lahore', 'Calcutta', 'Delhi', 'Mountbatten', 'Radcliffe', 'Cyril Radcliffe', 'Punjab', 'Gandhi', 'Birla House', 'New Delhi', 'Attari-Wagah', 'Kartarpur', 'Manto', 'Amritsar', 'Pakistan', 'India', 'Cabinet Mission'],
    honesty: 'Real photographs first. Paintings are labelled.',
    titleScripts: [URDU], allowedScripts: PARTITION_SCRIPTS,
    contentNote: 'Content note: violence and displacement',
    marginLine: true,
  };
  return {
    id: 'partition-council-film', title: 'The Partition of India, 1947', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    style: 'council', council, scenes: [], assets: PARTITION_COUNCIL_ASSETS,
    // No score: Partition ships on room tone and the pencil scratch only (no music is licensed or composed for it yet).
  };
}

export const PARTITION_NARRATION_URL = `${R}/film/council/narration.json`;

export async function loadPartitionCouncilFilm(width?: number, height?: number): Promise<FilmSpec> {
  return buildPartitionCouncilFilm({ narration: await fetchNarration(PARTITION_NARRATION_URL), width, height });
}
