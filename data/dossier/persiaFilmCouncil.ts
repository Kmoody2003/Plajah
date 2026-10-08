/**
 * "Christianity in Persia", in the Motion Council's style (services/dossier/film/council*.ts).
 *
 * About 3.5 minutes in six film rooms that map onto the exhibit's nine-room plan strip (persia.ts):
 *   1 Pentecost and the first traditions; Parthian and Sasanian beginnings   -> rooms 1-2
 *   2 Persecution, the martyrs and the councils                              -> room 3   (Silence Hold, content note)
 *   3 The Church of the East and the Silk Road (the road map, the stele)     -> room 4
 *   4 Under the caliphs and the Mongols                                      -> room 5
 *   5 Isfahan, New Julfa and the Urmia plain                                 -> rooms 6-7
 *   6 The twentieth century and today                                        -> rooms 8-9
 *
 * The exhibit's own gesture: the road and the script. Midnight ground, lapis only; Cormorant italic; the Road Line chapter
 * transition; the slowest film of the family. Syriac and the stele's Chinese appear only as the exhibit's own strings
 * (registry.ts theme.script, persiaRoad.ts): the title's Syriac, the ghost script in the empty third, and the characters of
 * the stele where they are the subject. NO person is shown in any painting: the two paintings (an imagined view of
 * Ctesiphon, the one full-bleed; the Urmia press room) hold no one. Every person on screen is in a real archive plate.
 *
 * Every narrated sentence cites claim ids from the ledger (data/dossier/persia.ts); tests/dossierFilmCouncil checks them.
 */
import type { FilmAsset, FilmSpec } from '../../services/dossier/film/filmTypes';
import type { CouncilFilm, CouncilShot, ScriptString } from '../../services/dossier/film/councilTypes';
import { councilTheme } from '../../services/dossier/film/councilCompile';
import { DOSSIER_THEMES } from './registry';
import rawAssets from './persiaAssets.json';
import basemap from './persiaBasemap.json';
import { createKit, fetchNarration, withNarration, type BeatTimings, type RawAsset } from './councilFilmKit';

const R = '/dossier/persia';

const RECON: Record<string, { w: number; h: number }> = {
  'recon-ctesiphon-vault': { w: 2200, h: 1228 },
  'recon-urmia-press': { w: 2200, h: 1228 },
};
const K = createKit(R, rawAssets as unknown as RawAsset[], RECON, 'Reconstruction · Plajah Dossier (AI-generated from documented sources, no person shown)');
const { arch, recon, beat } = K;

/** The exhibit's own non-Latin strings the film may set (each is in data/dossier/registry.ts or persiaRoad.ts). */
export const PERSIA_SCRIPTS: ScriptString[] = [
  { text: 'ܥܕܬܐ', lang: 'syriac', reading: 'Syriac, edta: “the church”', source: 'data/dossier/registry.ts (theme.script) and data/dossier/persiaRoad.ts' },
  { text: '景教', lang: 'han', reading: 'Chinese, Jingjiao: “the Luminous Religion”', source: 'data/dossier/persiaRoad.ts' },
];
const [SYRIAC, HAN] = PERSIA_SCRIPTS;

const BM = 'British Museum · Wikimedia Commons';
const PLATES = {
  steleRubbing: () => arch('a-stele-rubbing', 'Rubbing of the Xi’an Stele, with the characters of its heading', 'Jingjing · Wikimedia Commons'),
  steleHead: () => arch('a-stele-wdl', 'The Xi’an Stele of 781: its heading, Da Qin Jingjiao liuxing Zhongguo bei', 'Jingjing · World Digital Library · Wikimedia Commons', { minHold: 4 }),
  peshitta: () => arch('a-peshitta-ms', 'A Syriac manuscript of the Peshitta, the Bible of the Syriac churches', 'JHistory · Wikimedia Commons'),
  seal: () => arch('a-cross-seal', 'Stamp seal with a Latin cross, catalogued as Early Sasanian', BM, { year: 'catalogued as 4th century' }),
  kartir: () => arch('a-kartir-inscription', 'Inscription of the priest Kartir, Ka’ba-ye Zartosht', 'Wikimedia Commons'),
  ctesiphon: () => arch('a-ctesiphon-1932', 'The arch at Ctesiphon, Iraq, 1932', 'American Colony Photo Dept. · Wikimedia Commons'),
  sasanianMap: () => arch('a-sasanian-map', 'The Sasanian Empire in 621, a modern map', 'Keeby101 · Wikimedia Commons'),
  gulfMap: () => arch('a-gulf-dioceses-map', 'Dioceses of the Church of the East on the Persian Gulf, a modern map', 'Logosx127 · Wikimedia Commons'),
  sutra: () => arch('a-jesus-sutra', 'Chinese-language Church of the East text, the Sutra of Ultimate and Mysterious Happiness', 'Wikimedia Commons'),
  doquz: () => arch('a-hulagu-doquz', 'Hulagu and Doquz Khatun shown as Constantine and Helen, in a Syriac Bible', 'British Library · Wikimedia Commons'),
  barsauma: () => arch('a-barsauma-map', 'The journeys of Rabban Bar Sauma, a modern map', 'PHGCOM · Wikimedia Commons'),
  arghun: () => arch('a-arghun-letter', 'Letter of the Ilkhan Arghun to Philip IV of France, 1289', 'Archives nationales · Wikimedia Commons'),
  julfa: () => arch('a-newjulfa-street', 'A street in New Julfa, the Armenian quarter of Isfahan', 'Masoud Shahrestani · Wikimedia Commons'),
  vank: () => arch('a-vank-dome', 'Domes and paintings inside Vank Cathedral, New Julfa', 'Diego Delso · Wikimedia Commons'),
  urmiaGate: () => arch('a-urmia-gate-1904', 'A gate of Urmia, 1904', 'Shedd family papers · Wikimedia Commons'),
  majlis: () => arch('a-first-majlis', 'Representatives of the first Iranian parliament, 1906', 'World Digital Library · Wikimedia Commons'),
  refugees: () => arch('a-refugees-1915', 'Assyrian refugees from Tyari and Tkhuma near Urmia, late 1915', 'Wikimedia Commons', { distressing: true }),
  sarkis: () => arch('a-sarkis-tehran', 'Saint Sarkis Cathedral, Tehran', 'Diego Delso · Wikimedia Commons'),
};

// ── Rooms ────────────────────────────────────────────────────────────────────
const ROOMS: CouncilFilm['rooms'] = [
  { id: 'first', title: 'The first traditions', exhibitRooms: [1, 2], wing: 'Pentecost to Sasanian beginnings' },
  { id: 'martyrs', title: 'Persecution and the councils', exhibitRooms: [3, 3], wing: 'Persecution, the Martyrs and the Councils' },
  { id: 'road', title: 'The Silk Road', exhibitRooms: [4, 4], wing: 'The Church of the East and the Silk Road' },
  { id: 'caliphs', title: 'Caliphs and Mongols', exhibitRooms: [5, 5], wing: 'Under the Caliphs and the Mongols' },
  { id: 'isfahan', title: 'Isfahan and Urmia', exhibitRooms: [6, 7], wing: 'Isfahan, Printing and the Urmia Plain' },
  { id: 'today', title: 'The twentieth century and today', exhibitRooms: [8, 9], wing: 'The Twentieth Century and Today' },
];

// ── Shots ────────────────────────────────────────────────────────────────────
export const PERSIA_COUNCIL_SHOTS: CouncilShot[] = [
  // Room 1: Pentecost, Parthian and Sasanian beginnings
  { id: 'acts', room: 0, plates: [PLATES.peshitta()],
    margin: { year: 'c. 33', place: 'Jerusalem', script: { text: SYRIAC.text, reading: SYRIAC.reading } },
    beats: [beat('acts.1', 'At Pentecost, Acts names Parthians, Medes and Elamites among the hearers. Later tradition calls them the first seed of the church in Persia; Acts itself says nothing of what they did next.', ['c-acts-list', 'c-acts-seed'])] },
  { id: 'seal', room: 0, ground: '#04040e', plates: [PLATES.seal()],
    margin: { year: '3rd–4th c.', place: 'Sasanian Persia' },
    beats: [beat('seal.1', 'The earliest datable evidence is Sasanian: a stamp seal with a Latin cross, catalogued by the British Museum as Early Sasanian.', ['c-parthian-gap', 'c-seal'])] },
  { id: 'kartir', room: 0, plates: [PLATES.kartir()],
    margin: { year: 'Late 3rd c.', place: 'Fars, Persia' },
    beats: [beat('kartir.1', 'In the late third century the priest Kartir listed Christians among those he struck down. Historians doubt a large persecution.', ['c-kartir', 'c-kartir-doubt'])] },

  // Room 2: Persecution, the martyrs and the councils (a Silence Hold and a held line first)
  { id: 'note', room: 1, kind: 'card', transition: 'silenceHold', minHold: 3.6, holdUntil: 'sozomen',
    card: { lines: ['The next section tells of the execution of Christians under Shapur II.', 'Historians debate how far these accounts can be trusted. Any key skips this section.'] } },
  { id: 'simeon', room: 1, plates: [PLATES.ctesiphon()],
    margin: { year: 'c. 340', place: 'Seleucia-Ctesiphon' },
    lowerThird: { name: 'Ctesiphon', role: 'Capital of the Sasanian empire', at: 1.0 },
    beats: [beat('simeon.1', 'About 340, Simeon bar Sabbae, head of the church, refused a double tax that Shapur II imposed for war with Rome, and was executed.', ['c-simeon', 'c-martyr-acts'])] },
  { id: 'sozomen', room: 1, plates: [PLATES.sasanianMap()],
    margin: { year: '4th c.', place: 'Sasanian empire' },
    beats: [beat('sozomen.1', 'Sozomen counted over sixteen thousand martyrs by name. No independent count exists.', ['c-sozomen'])] },
  { id: 'synod', room: 1, transition: 'reconGate',
    plates: [recon('recon-ctesiphon-vault', 'Imagined from the arch at Ctesiphon; the 410 hall is unknown; no one is shown.', { fullBleed: true, focusY: 0.5 })],
    beats: [beat('synod.1', 'In 410 about forty bishops met at Seleucia-Ctesiphon and made its bishop catholicos of the Persian church.', ['c-synod-410'])] },
  { id: 'gulf', room: 1, plates: [PLATES.gulfMap()],
    margin: { year: '7th c.', place: 'The Persian Gulf' },
    beats: [beat('gulf.1', 'By the seventh century the church had dioceses on the Persian Gulf.', ['c-gulf-sees'])] },

  // Room 3: The Silk Road
  { id: 'road', room: 2, kind: 'graphic', transition: 'roadLine',
    groupSlate: { title: 'A schematic route of the church eastward; the legs are not documented itineraries', source: 'Natural Earth (public domain); stops from the exhibit’s ledger', year: '', licence: 'Public domain' }, slateLead: 'MAP',
    graphic: { kind: 'roadMap', basemap: 'persia', note: 'Schematic route. Stops are dated evidence; the dashed legs are not documented itineraries.', stops: [
      { id: 'ctesiphon', label: 'Seleucia-Ctesiphon', lat: 33.09, lon: 44.58, anchor: 'Seleucia-Ctesiphon', year: '410', script: SYRIAC.text },
      { id: 'balkh', label: 'Balkh', lat: 36.76, lon: 66.9, anchor: 'Balkh', year: '781', via: [[34.8, 48.5], [35.6, 51.4], [36.2, 58.8], [37.66, 62.19]] },
      { id: 'qocho', label: 'Qocho', lat: 42.85, lon: 89.53, anchor: 'Qocho', year: '683–770', via: [[39.47, 75.99], [41.17, 80.26], [41.7, 82.96]] },
      { id: 'changan', label: 'Chang’an', lat: 34.27, lon: 108.95, anchor: 'Chang’an', year: '635', script: HAN.text, via: [[40.14, 94.66], [39.7, 98.5], [36.06, 103.8]] },
    ] },
    beats: [beat('road.1', 'From Seleucia-Ctesiphon the church’s reach grew east across Central Asia. A priest of Balkh is named on the stele. A temple at Qocho left a wall painting. By 635 the road ended at Chang’an.', ['c-central-asia', 'c-stele781', 'c-qocho', 'c-alopen'])] },
  { id: 'stele', room: 2, transition: 'roadLine', plates: [PLATES.steleHead()],
    margin: { year: '781', place: 'Xi’an, China' },
    graphic: { kind: 'steleScript', anchor: '781', script: HAN.text, reading: HAN.reading, year: '781' },
    marks: [{ kind: 'detail', anchor: 'Alopen', rect: { x: 0.25, y: 0.22, w: 0.5, h: 0.5 }, dur: 1.8 }],
    beats: [beat('stele.1', 'The Xi’an Stele says it was erected in 781. It tells how a man named Alopen reached Chang’an in 635 and was received by the emperor.', ['c-stele781', 'c-alopen'])] },
  { id: 'sutra', room: 2, plates: [PLATES.sutra()],
    margin: { year: '845', place: 'Tang China' },
    beats: [beat('sutra.1', 'Chinese texts of the church survive, though some question the Osaka manuscripts. In 845 Emperor Wuzong’s edict devastated the church in China.', ['c-jesus-sutras', 'c-wuzong'])] },

  // Room 4: Caliphs and Mongols
  { id: 'conquest', room: 3, plates: [PLATES.ctesiphon()],
    margin: { year: '633–651', place: 'Persia' },
    beats: [beat('conquest.1', 'The Arab conquest, between about 633 and 651, ended Sasanian rule. Christians lived on, protected but subordinate.', ['c-conquest', 'c-dhimmi'])] },
  { id: 'doquz', room: 3, plates: [PLATES.doquz()],
    margin: { year: '1258', place: 'Baghdad' },
    beats: [beat('doquz.1', 'In 1258 Doquz Khatun, a Christian wife of the Mongol Hulagu, is said to have interceded for Christians. The report is later.', ['c-doquz'])] },
  { id: 'barsauma', room: 3, plates: [PLATES.barsauma()],
    margin: { year: '1287', place: 'To Rome and Paris' },
    beats: [beat('barsauma.1', 'In 1287 the monk Rabban Bar Sauma, born in China, travelled as envoy of the Ilkhan Arghun to Constantinople, Rome and Paris.', ['c-barsauma'])] },
  { id: 'arghun', room: 3, plates: [PLATES.arghun()],
    margin: { year: '1289', place: 'Archives nationales, Paris' },
    beats: [beat('arghun.1', 'A letter of 1289, in Mongolian script, names him as the envoy.', ['c-arghun-letter'])] },

  // Room 5: Isfahan and Urmia
  { id: 'julfa', room: 4, transition: 'roadLine', plates: [PLATES.julfa()],
    margin: { year: '1606', place: 'New Julfa, Isfahan' },
    beats: [beat('julfa.1', 'In the early 1600s Shah Abbas I settled Armenians at New Julfa, across the river from Isfahan. How many, and how far by force, is debated.', ['c-abbas-resettle'])] },
  { id: 'vank', room: 4, plates: [PLATES.vank()],
    margin: { year: '1606–1664', place: 'Vank Cathedral' },
    beats: [beat('vank.1', 'Vank Cathedral, begun in 1606, is covered in paintings.', ['c-vank'])] },
  { id: 'press', room: 4, transition: 'reconGate',
    plates: [recon('recon-urmia-press', 'Imagined from Justin Perkins’s account of the mission press at Urmia; no one is shown.')],
    margin: { year: '1840', place: 'Urmia, Persia' },
    beats: [beat('press.1', 'At Urmia, on 21 November 1840, the American mission press was first set to work, with a few copies of the Lord’s Prayer in ancient Syriac.', ['c-press-urmia'])] },
  { id: 'urmia', room: 4, plates: [PLATES.urmiaGate()],
    margin: { year: 'c. 1900', place: 'Urmia, Persia' },
    lowerThird: { name: 'Urmia', role: 'North-west Persia · a mission town', at: 1.0 },
    beats: [beat('urmia.1', 'Around 1900, Christians, mostly Assyrians and Armenians, made up more than forty per cent of Urmia.', ['c-urmia-christians'])] },

  // Room 6: the twentieth century and today
  { id: 'majlis', room: 5, plates: [PLATES.majlis()],
    margin: { year: '1906', place: 'Tehran' },
    beats: [beat('majlis.1', 'The Constitutional Revolution produced a parliament in 1906. A law of 1909 gave four seats to recognised religious minorities, two of them to Christians.', ['c-constitution-1906', 'c-minority-seats-1909'])] },
  { id: 'note2', room: 5, kind: 'card', transition: 'silenceHold', holdUntil: 'refugees',
    card: { lines: ['The next section shows refugees of the First World War.', 'Any key skips this section.'] } },
  { id: 'refugees', room: 5, plates: [PLATES.refugees()],
    margin: { year: '1915', place: 'Urmia, Persia' },
    beats: [beat('refugees.1', 'In 1915 nearly eighteen thousand Christians sheltered in the mission compounds at Urmia, and disease killed many of them.', ['c-ww1-urmia-refuge'])] },
  { id: 'today', room: 5, plates: [PLATES.sarkis()],
    margin: { year: 'Today', place: 'Tehran' },
    beats: [beat('today.1', 'Today Christians are a recognised minority. Estimates of their number run from about 118,000 in the 2011 census to several hundred thousand, because the census counts only recognised communities.', ['c-constitution-1979', 'c-pop-estimates'])] },
];

const archiveIds = (): string[] => [...new Set([...PERSIA_COUNCIL_SHOTS.flatMap(s => s.plates ?? []), PLATES.steleRubbing()].filter(p => p.kind === 'archive').map(p => p.asset))];

export const PERSIA_COUNCIL_ASSETS: FilmAsset[] = [...K.assetList(archiveIds(), 'jpg'), ...K.reconList('jpg')];

function endCard(voiced: boolean): CouncilFilm['endCard'] {
  return [
    { head: 'Archive photographs and documents', lines: [
      'Real photographs, manuscripts and rubbings, unaltered', 'World Digital Library · British Museum · British Library',
      'Archives nationales · American Colony Photo Dept. · Shedd family papers', 'Licences are shown under each plate:', 'public domain, CC BY and CC BY-SA' ] },
    { head: 'Reconstructions (all labelled)', lines: [
      'Two paintings of places, no person shown: an imagined', 'Ctesiphon and the Urmia mission press. AI-generated:',
      'Google Nano Banana Pro via Magnific. Each carries the', 'RECONSTRUCTION stamp and an evidence note' ] },
    { head: 'Maps', lines: ['Made with Natural Earth (public domain)', 'A schematic route: stops are dated evidence,', 'the legs are not documented itineraries'] },
    { head: 'Script, pending a native reader', lines: [
      'The Syriac word and the Chinese characters are the exhibit’s', 'own strings (registry.ts, persiaRoad.ts). Pending native-reader', 'proofing: no Syriac or Chinese reader has reviewed them yet' ] },
    { head: 'Sources', lines: [
      'Brock, “The ‘Nestorian’ Church: A Lamentable Misnomer”', 'Baum and Winkler, The Church of the East', 'James Legge, The Nestorian Monument of Hsi-an Fu (1888)',
      'Justin Perkins, A Residence of Eight Years in Persia', 'Encyclopaedia Iranica; every claim is in the exhibit ledger' ] },
    { head: voiced ? 'Narration' : 'Narration (not yet recorded)', lines: voiced ? ['Synthetic voice (Google Gemini TTS)'] : ['This cut is silent; captions carry the narration', 'Timing is estimated and re-times when narration is added'] },
    { head: 'Score and sound', lines: ['Original score, synthesised for Plajah', 'The plucked string is synthesised, credited as generated'] },
    { head: 'Type', lines: ['Cormorant Garamond, Noto Sans Syriac, Noto Serif SC,', 'Source Serif 4, Inter Tight (SIL Open Font License)'] },
  ];
}

export function buildPersiaCouncilFilm(opts: { narration?: BeatTimings; width?: number; height?: number } = {}): FilmSpec {
  const shots = withNarration(PERSIA_COUNCIL_SHOTS, opts.narration);
  const voiced = !!opts.narration && shots.every(s => (s.beats ?? []).every(b => b.audio));
  const council: CouncilFilm = {
    id: 'persia-council', title: 'Christianity in Persia', dates: 'c. 33 — Today', tagline: 'Two thousand years of faith on the roads of Persia.',
    theme: councilTheme(DOSSIER_THEMES['christianity-in-persia'], {
      titleGesture: 'road',
      faces: { syriac: "'Noto Sans Syriac', 'Estrangelo Edessa', serif", han: "'Noto Serif SC', 'Songti SC', serif" },
      sans: "'Inter Tight', 'Inter', 'Noto Sans Syriac', 'Noto Serif SC', system-ui, sans-serif",
    }),
    exhibitRoomCount: 9, rooms: ROOMS, titlePlate: PLATES.steleRubbing(), shots,
    endCard: endCard(voiced),
    accentTerms: ['Persia', 'Parthians', 'Medes', 'Elamites', 'Kartir', 'Simeon bar Sabbae', 'Shapur II', 'Sozomen', 'Seleucia-Ctesiphon', 'Balkh', 'Qocho', 'Chang’an', 'Alopen', 'Xi’an Stele', 'Wuzong', 'Doquz Khatun', 'Hulagu', 'Rabban Bar Sauma', 'Arghun', 'Shah Abbas I', 'New Julfa', 'Isfahan', 'Vank Cathedral', 'Urmia', 'Tehran', 'Mongolian'],
    honesty: 'Real photographs first. Paintings are labelled.',
    titleScripts: [SYRIAC], allowedScripts: PERSIA_SCRIPTS,
    contentNote: 'Content note: martyrdom and war',
    basemaps: { persia: basemap as unknown as NonNullable<CouncilFilm['basemaps']>[string] },
  };
  return {
    id: 'persia-council-film', title: 'Christianity in Persia', width: opts.width ?? 1920, height: opts.height ?? 1080, fps: 30,
    style: 'council', council, scenes: [], assets: PERSIA_COUNCIL_ASSETS,
    score: { src: `${R}/score.mp3`, volume: 0.35, duckTo: 0.12 },
  };
}

export const PERSIA_NARRATION_URL = `${R}/film/council/narration.json`;

export async function loadPersiaCouncilFilm(width?: number, height?: number): Promise<FilmSpec> {
  return buildPersiaCouncilFilm({ narration: await fetchNarration(PERSIA_NARRATION_URL), width, height });
}
