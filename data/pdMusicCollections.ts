// ─────────────────────────────────────────────────────────────────────────────
// pdMusicCollections — the curated shelves behind Chora's Public Domain Library.
//
// EVERY identifier and every query below was HTTP-verified against the live
// Internet Archive before being written down:
//   • the identifier resolves (archive.org/metadata/<id> returns real metadata),
//   • its file list contains at least one loose, individually-streamable MP3,
//   • and a Range request against archive.org/download/<id>/<file> returned
//     206 with content-type audio/mpeg.
//
// Nothing here is guessed, and nothing here was included on the strength of a
// name match alone — a search hit only proves text similarity. Two things were
// deliberately DISCARDED during verification:
//   • 32 of the 34 `collection:musopen` items — they are ZIP-only downloads with
//     no loose audio file, so they cannot stream. Only `musopen-chopin` survived
//     (a `musopen-brahms-symphony-premix` item exists but contains split L/R
//     channel stems, not listenable performances, so it was dropped too).
//   • `collection:cylinders`, which simply does not exist (numFound = 0).
//   • A Cortot/LPO "Symphonic Variations" side that streamed perfectly but whose
//     item metadata carries NO year at all. Playable is not the same as free: with
//     no date, the pre-1929 basis below cannot be established for it (the disc is
//     in fact a 1930s HMV pressing), so it was cut rather than shipped under a
//     public domain claim this file cannot support.
//
// Shelves come in two halves that the UI merges:
//   featured — hand-picked identifiers, each individually verified playable.
//   query    — a live IA search, so the shelf keeps growing without a code change.
//              Every query was sampled and had its hits resolved before shipping.
//
// RIGHTS BASIS. Two distinct footings, and the UI shows which applies per item:
//   1. Declared licence. `musopen-chopin` carries an explicit CC0 1.0 public
//      domain dedication in its own IA metadata.
//   2. Date of recording. The Great 78 Project items (`collection:georgeblood`)
//      declare no licence field at all, so every query below is CONSTRAINED to
//      the US recording cutoff from services/publicDomainRights (1925 in 2026,
//      moving forward one year every 1 January). The Music Modernization Act runs
//      recordings for 100 years — "pre-1929" is the rule for COMPOSITIONS, and an
//      earlier version of this file wrongly applied it to records. That is an
//      inference from the item's date, not a claim the Archive makes, and the
//      service labels it as such rather than laundering it into a licence.
//
// Featured lists may hold sides that are not free YET (the 1926–1928 Casals,
// Morton, Beiderbecke and Hines sides). resolveItem refuses them until their
// year arrives, so each appears on its own on the right 1 January.
//
// WORLD shelves draw on all of `collection:78rpm` (Great 78 plus the Library of
// Congress National Jukebox transfers and smaller donor collections) under the
// same date ceiling. Every world query was sampled on 2026-10-29: 14 of 14 hits
// resolved playable and dated within the cutoff on every shelf.
// ─────────────────────────────────────────────────────────────────────────────

import { usRecordingCutoffYear } from '../services/publicDomainRights';

export type PDShelfId =
  | 'BAROQUE'
  | 'CLASSICAL_ERA'
  | 'ROMANTIC'
  | 'GREAT_VOICES'
  | 'EARLY_JAZZ'
  | 'RAGTIME'
  | 'EARLY_BLUES'
  | 'GREEK_SMYRNA'
  | 'ARABIC_ARMENIAN'
  | 'YIDDISH_CANTORIAL'
  | 'MEXICO'
  | 'LUSO_LATIN'
  | 'NEAPOLITAN'
  | 'IRISH_CELTIC'
  | 'HAWAIIAN'
  | 'SLAVIC_EASTERN'
  | 'NORDIC'
  | 'EAST_ASIA';

/** ERA shelves walk the Western repertoire; WORLD shelves walk the map. */
export type PDShelfGroup = 'ERA' | 'WORLD';

export interface PDShelf {
  id: PDShelfId;
  group?: PDShelfGroup;
  label: string;
  /** Micro-label for the uppercase eyebrow. */
  eyebrow: string;
  blurb: string;
  /** How this shelf's material is public domain. Shown in the UI. */
  rightsNote: string;
  /** Verified identifiers, shown first and in this order. */
  featured: string[];
  /** Live IA query appended after the featured items. Sampled + verified. */
  query?: string;
}

/** The date ceiling every 78 query is held to — the US recording cutoff, recomputed each year. */
const US_REC_CUTOFF = usRecordingCutoffYear();
const PD_YEAR_RANGE = `year:[1890 TO ${US_REC_CUTOFF}]`;
const G78 = `collection:georgeblood AND ${PD_YEAR_RANGE}`;
const WORLD78 = `collection:78rpm AND ${PD_YEAR_RANGE}`;

const MMA_NOTE =
  `Great 78 Project transfers, held to recordings published in ${US_REC_CUTOFF} or earlier — public domain in the US ` +
  'under the Music Modernization Act, which runs recordings for 100 years. These items declare no licence of ' +
  'their own; the basis is their date.';

const WORLD_NOTE =
  '78rpm transfers from the Great 78 Project and the Library of Congress National Jukebox, held to recordings ' +
  `published in ${US_REC_CUTOFF} or earlier — public domain in the US by date. Many were made for immigrant ` +
  'communities in America: treat them as those communities\' living heritage, credited by name, not just as free audio.';

export const PD_SHELVES: PDShelf[] = [
  {
    id: 'BAROQUE',
    group: 'ERA',
    label: 'Baroque',
    eyebrow: 'Bach · Purcell · Handel',
    blurb:
      'The oldest layer of the repertoire, heard through the oldest recordings of it — Casals playing Bach, ' +
      'cathedral organs cut straight to shellac.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_toccata-and-fugue-in-d-minor_gd-cunningham-bach_gbia7013321b',
      '78_musette_pablo-casals-nicolai-mednikoff-bach-pollain_gbia0289005b',
      '78_air-on-g-string_mayer-gordon-miss-s-gordon-bach-wilhelmj_gbia3015870a',
      '78_ave-maria_johanna-gadski-bach-gounod_gbia0366694a',
      '78_a-the-self-banished-b-ill-sail-upon-the-dog-star_john-goss-blow-purcell-foss-m_gbia0076805b',
    ],
    query: `${G78} AND (creator:Bach OR creator:Handel OR creator:Purcell OR creator:Vivaldi)`,
  },
  {
    id: 'CLASSICAL_ERA',
    group: 'ERA',
    label: 'Classical Era',
    eyebrow: 'Mozart · Haydn · Beethoven',
    blurb:
      'Mozart and Haydn as the first generation of recording artists understood them — the Flonzaley Quartet, ' +
      'the Cortot/Thibaud/Casals trio, the Metropolitan Opera chorus.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_voi-che-sapete-le-nozze-di-figaro_mozart_gbia0298771a',
      '78_trio-in-g-major-part-4_alfred-cortot-jacques-thibaud-pablo-casals-haydn_gbia0187452b',
      '78_die-zauberflte-o-isis-und-osiris-the-magic-flute-chorus-of-priests_metropolitan_gbia0284289a',
      '78_quartet-no-16-in-f-major-part-6-4th-movement-grave-allegro_flonzaley-quartet-ado_gbia0292337b',
      '78_unfinished-symphony-in-b-minor-no-1_the-royal-opera-orchestra-covent-garden-schuber_gbia7040560b',
    ],
    query: `${G78} AND (creator:Mozart OR creator:Haydn OR creator:Beethoven OR creator:Schubert)`,
  },
  {
    id: 'ROMANTIC',
    group: 'ERA',
    label: 'Romantic',
    eyebrow: 'Chopin · Wagner · Brahms',
    blurb:
      'Led by Musopen\'s complete Chopin collection — over a hundred modern studio recordings released into the ' +
      'public domain outright — then the great acoustic-era Wagner, Brahms and Liszt sides.',
    rightsNote:
      'The Musopen Chopin collection carries an explicit CC0 1.0 public domain dedication in its own metadata. ' +
      `The 78rpm sides alongside it rest on the US recording date basis (${US_REC_CUTOFF} or earlier).`,
    featured: [
      'musopen-chopin',
      '78_etude-in-c-moll-revolutions-etude_ignace-jan-paderewski-chopin_gbia0123357a',
      '78_cradle-song-op-49-no-4_alfred-cortot-brahms_gbia7017910a',
      '78_wiegenlied-cradle-song_ernestine-schumann-heink-victor-orchestra-brahms_gbia0455298a',
      '78_pilgrims-chorus-act-3_state-opera-chorus-orchestra-wagner-dr-leo-blech_gbia7003657a',
      '78_tannhauser-march_soderos-band-richard-wagner_gbia0083128a',
      '78_second-hungarian-rhapsody_emerson-international-symphony-orchestra-liszt-i-j-hoch_gbia0470533b',
      '78_bacchanale_american-symphony-orchestra-samson-and-delilah-saint-sans_gbia0172995a',
      '78_carmen-prelude-to-act-1_philadelphia-symphony-orchestra-bizet-leopold-stowkowski_gbia0180909a',
    ],
    query: `${G78} AND (creator:Chopin OR creator:Wagner OR creator:Brahms OR creator:Tchaikovsky OR creator:Liszt)`,
  },
  {
    id: 'GREAT_VOICES',
    group: 'ERA',
    label: 'Great Voices',
    eyebrow: 'Caruso · Galli-Curci · Chaliapin',
    blurb:
      'The voices that sold the gramophone to the world. Caruso, Titta Ruffo, Amelita Galli-Curci and Feodor ' +
      'Chaliapin, captured acoustically into a horn.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_celeste-aida_enrico-caruso-verdi_gbia7003839a',
      '78_cavalleria-rusticana-siciliana_signor-e-caruso-mascagni_gbia7008956a',
      '78_barbiere-di-siviglia-una-voce-poco-fa-barber-of-seville-a-little-voice-i-hear_gbia0294148a',
      '78_faust-srnade-mephistopheles-while-you-play-at-sleeping_feodor-chaliapin-gounod_gbia0377818b',
      '78_faust-dio-possente-even-bravest-heart_titta-ruffo-gounod_gbia0479674a',
      '78_cielo-e-mar-gioconda_giuseppe-anselmi-ponchielli_gbia0313816a',
      '78_mefistofele-epilogo-giunto-sul-passo-estremo-epilogue-nearing-the-end-of-life_ben_gbia7019205a',
      '78_se-il-mio-nome-if-my-name-you-would-know_tito-schipa-rossini_gbia7020290b',
    ],
    query: `${G78} AND subject:Opera`,
  },
  {
    id: 'EARLY_JAZZ',
    group: 'ERA',
    label: 'Early Jazz',
    eyebrow: 'Morton · Beiderbecke · Hines',
    blurb:
      'Jazz in the decade it was being invented on record — Jelly Roll Morton\'s Red Hot Peppers, Bix Beiderbecke ' +
      'and his Gang, and a very young Earl Hines.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_the-chant_jelly-roll-mortons-red-hot-peppers-george-mitchell-kid-ory-omer-simeon-j_gbia7031312b',
      '78_margie_bix-beiderbecke-and-his-gang-bix-beiderbecke-bill-rank-izzy-friedman-min-lei_gbia0194195b',
      '78_chimes-in-blues_earl-hines-hines_gbia0447384a',
      '78_eccentric_friars-society-orchestra-robinson-husk-ohare_gbia0215079b',
      '78_memphis-blues_lanins-southern-serenaders-w-c-handy_gbia0397162b',
      '78_carolina-blues_synco-jazz-band-ringle_gbia0060428a',
      '78_beale-street-blues_bennie-kruegers-orch_gbia0481273a',
    ],
    query: `${G78} AND subject:Jazz`,
  },
  {
    id: 'RAGTIME',
    group: 'ERA',
    label: 'Ragtime',
    eyebrow: 'Confrey · Lodge · Novelty Piano',
    blurb:
      'Syncopation as popular music: military bands, banjo soloists and the novelty-piano school that ragtime ' +
      'turned into by the 1920s.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_temptation-rag_kings-military-band-henry-lodge_gbia3030177b',
      '78_greenwich-witch_ernest-l-stevens-zez-confrey_gbia0527194a',
      '78_knice-and-knifty_ernest-l-stevens-roy-bargy-and-charley-straight_gbia0527194b',
      '78_wild-cherries_the-black-diamonds-band-ted-snyder_gbia3036745b',
      '78_nola_h-perrella-r-turner-f-arndt_gbia7001976a',
      '78_railroad-rag_arthur-collins_gbia0477320a',
      '78_xylophone-rag_leonard-derby-abbey_gbia3014421b',
    ],
    query: `${G78} AND subject:Ragtime`,
  },
  {
    id: 'EARLY_BLUES',
    group: 'ERA',
    label: 'Early Blues',
    eyebrow: 'Handy · Hegamin · Classic Blues',
    blurb:
      'The first blues to reach shellac — W. C. Handy\'s compositions and the classic blues singers who made ' +
      'the form a national style.',
    rightsNote: MMA_NOTE,
    featured: [
      '78_ive-got-what-it-takes-but-it-breaks-my-heart-to-give-it-away_lucille-hegamin-and-h_gbia0407787a',
      '78_yellow-dog-blues_selvins-orchestra-handy-green_gbia0171617b',
      '78_dixie-blues_louisiana-five-lada-nunez-cawley_gbia0395575a',
      '78_youve-gotta-see-mamma-evry-night-or-you-cant-see-mamma-at-all_southern-serenader_gbia0085628b',
    ],
    query: `${G78} AND subject:Blues`,
  },

  // ── WORLD ─────────────────────────────────────────────────────────────────
  {
    id: 'GREEK_SMYRNA',
    group: 'WORLD',
    label: 'Greek & Smyrna',
    eyebrow: 'Marika Papagika · Smyrna song · Cretan dances',
    blurb:
      'The Greek café and village music that crossed to New York: Marika Papagika, Smyrna-style songs and island ' +
      'dances, years before rebetiko had its name.',
    rightsNote: WORLD_NOTE,
    featured: [
      'loc-jukebox-38318-laphina',
      'loc-jukebox-63242-n-tavelis',
      'loc-jukebox-29006-imitation-of-bagpipe-in-creta',
      'loc-jukebox-189542-e-apachides-ton-athenon',
      'loc-jukebox-72888-tou-kitsou-i-mana',
    ],
    query: `${WORLD78} AND (language:Greek OR language:gre OR subject:Greek)`,
  },
  {
    id: 'ARABIC_ARMENIAN',
    group: 'WORLD',
    label: 'Arabic, Armenian & Caucasus',
    eyebrow: 'Cairo · Arab New York · Caucasus',
    blurb:
      'A Cairo sheikh cut to disc in 1909, Arabic songs recorded in New York, Armenian songs and a Caucasus ' +
      'lezginka: the eastern Mediterranean on shellac.',
    rightsNote: WORLD_NOTE,
    featured: [
      '78_sahil-guefoun-i_cheikh-youssef-el-menialawi-caire_gbia0299355a',
      'loc-jukebox-25850-ana-el-garam',
      'loc-jukebox-36636-gnatz-ashoon-yegav-garounne',
      'amour-18353-lezginka',
      'loc-jukebox-42339-ya-lailo-elsabo',
    ],
    query: `${WORLD78} AND (language:Arabic OR language:ara OR language:Turkish OR language:tur OR language:Armenian OR language:arm)`,
  },
  {
    id: 'YIDDISH_CANTORIAL',
    group: 'WORLD',
    label: 'Yiddish & Cantorial',
    eyebrow: 'Rosenblatt · Yiddish theatre · Klezmer',
    blurb:
      'Yossele Rosenblatt\'s cantorial singing, Yiddish theatre songs from Second Avenue and the dance bands that ' +
      'carried klezmer to America.',
    rightsNote: WORLD_NOTE,
    featured: [
      'loc-jukebox-38255-achenu-kol-beth-israel',
      'loc-jukebox-30183-hatikva',
      'loc-jukebox-43206-wen-mir-welen-weren-reich',
      'loc-jukebox-18341-schwartzer-kuter',
      'loc-jukebox-132846-dus-shaifele',
    ],
    query: `${WORLD78} AND (language:Yiddish OR language:yid OR language:Hebrew OR subject:Jewish OR subject:Klezmer)`,
  },
  {
    id: 'MEXICO',
    group: 'WORLD',
    label: 'Mexico',
    eyebrow: 'Cuarteto Coculense · Banda de Artillería · canción',
    blurb:
      'The earliest mariachi on record, the Cuarteto Coculense in 1908, with the Mexican artillery band and the ' +
      'canciones the whole country sang, Estrellita among them.',
    rightsNote: WORLD_NOTE,
    featured: [
      'loc-jukebox-258006-el-cuervo',
      'loc-jukebox-257162-aires-nacionales-mexicanos',
      'loc-jukebox-35362-estrellita',
      'loc-jukebox-35229-valent-n-mancera',
      'loc-jukebox-258014-la-p-rfida',
    ],
    query: `${WORLD78} AND (subject:Mexico OR subject:Mexican)`,
  },
  {
    id: 'LUSO_LATIN',
    group: 'WORLD',
    label: 'Fado, Cuba & Tango',
    eyebrow: 'Fado · Danzón · Tango · Maxixe',
    blurb:
      'Portuguese fado sung in America, Cuban and Spanish songs and waltzes, and the tango and Brazilian maxixe ' +
      'that filled dance floors before 1926.',
    rightsNote: WORLD_NOTE,
    featured: [
      'loc-jukebox-29986-fado-do-palhas',
      'loc-jukebox-30735-minha-m-e-pobrezinha',
      'loc-jukebox-243788-un-esp-ritu-de-amor',
      'loc-jukebox-243836-los-mosqueteros-grises-vals',
      'loc-jukebox-300264-larilol',
    ],
    query: `${WORLD78} AND (subject:Cuba OR subject:Cuban OR subject:Danzon OR subject:Brazil OR language:Portuguese OR subject:Tango)`,
  },
  {
    id: 'NEAPOLITAN',
    group: 'WORLD',
    label: 'Neapolitan Song',
    eyebrow: 'Caruso · Coppia Voccia · canzone napoletana',
    blurb:
      'Caruso singing the songs of his own city, beside the comic duets and street songs of Naples recorded for ' +
      'Italian America.',
    rightsNote: WORLD_NOTE,
    featured: [
      '78_core-ngrato_enrico-caruso-victor-orchestra-cordiferro-carolli_gbia0554651a',
      '78_mamma-mia-che-vo-sap_enrico-caruso-nutile_gbia0567918a',
      'loc-jukebox-42384-o-bicchiere-e-vino',
      'loc-jukebox-40035-sangenella-e-salierno',
      'loc-jukebox-327667-sciore-e-luntananza',
    ],
    query: `${WORLD78} AND (subject:Neapolitan OR (language:Italian AND subject:Folk))`,
  },
  {
    id: 'IRISH_CELTIC',
    group: 'WORLD',
    label: 'Irish & Celtic',
    eyebrow: 'Tom Ennis · James Morrison · Danny Boy',
    blurb:
      'Uilleann pipes and fiddle from the great New York sessions, Tom Ennis and James Morrison playing jigs and ' +
      'hornpipes, beside the Irish ballads every parlour knew.',
    rightsNote: WORLD_NOTE,
    featured: [
      'TomEnnisAndJamesMorrisonLondonderryHornpipe',
      'TomEnnisSarsfieldsJigTheRakesofClonmel',
      'TomEnnisBlackberryBlossomLimestoneRockBucksofOranmore',
      'TomMorrisonMaggieintheWoods',
      '78_danny-boy_hughes-macklin-f-e-weatherly_gbia3014312b',
    ],
    query: `${WORLD78} AND (subject:Irish OR subject:Ireland OR subject:Scottish)`,
  },
  {
    id: 'HAWAIIAN',
    group: 'WORLD',
    label: 'Hawaiian',
    eyebrow: 'Kealakai · Louise & Ferera · steel guitar',
    blurb:
      'The steel guitar that Hawaiian players carried to the mainland in the 1910s, and the Hawaiian-language ' +
      'songs that came with it.',
    rightsNote: WORLD_NOTE,
    featured: [
      '78_waialae-hawaiian-waltz-song_kealakae_gbia0179270b',
      '78_missouri-waltz-hush-a-bye-ma-baby_louise-and-ferera-waikiki-orchestra-eppel-logan_gbia0337313a',
      '78_my-waikiki-mermaid_waikiki-hawaiian-orchestra_gbia0173666a',
      '78_my-hawaiian-melody_waikiki-hawaiian-orchestra-ringle-coots_gbia0083615a',
    ],
    query: `${WORLD78} AND (subject:Hawaiian OR language:Hawaiian OR language:haw)`,
  },
  {
    id: 'SLAVIC_EASTERN',
    group: 'WORLD',
    label: 'Slavic & Eastern Europe',
    eyebrow: 'Russian opera · Czech kapela · Polish song',
    blurb:
      'Russian imperial opera singers on the earliest discs, a Prague village band and Polish songs: central and ' +
      'eastern Europe before the borders moved.',
    rightsNote: WORLD_NOTE,
    featured: [
      '78_mesicek_kapela-pana-hermana-praha_gbia0031782b',
      '78_niechc-ci-kasiunio_wadysaw-ochrymowicz-sowa-t-wandycz_gbia0288681b',
      '78_ahyouyounggirlsmillersaria_282_09',
      '78_ohmydearcharmingone_176_03',
      '78_ontheship_240_01',
    ],
    query: `${WORLD78} AND (language:Polish OR language:Czech OR language:Ukrainian OR language:Russian OR language:Lithuanian OR language:Hungarian OR language:Slovak)`,
  },
  {
    id: 'NORDIC',
    group: 'WORLD',
    label: 'Nordic',
    eyebrow: 'Swedish · Norwegian · Danish · Finnish',
    blurb:
      'Hymns, waltzes and folk songs of the Scandinavian and Finnish communities of the upper Midwest, from ' +
      '"Deilig er jorden" to "Necken".',
    rightsNote: WORLD_NOTE,
    featured: [
      'loc-jukebox-24608-deilig-er-jorden',
      'loc-jukebox-21447-necken',
      'loc-jukebox-19618-rida-ranka',
      'loc-jukebox-36591-saa-danser-jeg-dig-im-de',
      'loc-jukebox-21894-eg-elskar-dei-voggande-tonar',
    ],
    query: `${WORLD78} AND (language:Swedish OR language:Norwegian OR language:Danish OR language:Finnish)`,
  },
  {
    id: 'EAST_ASIA',
    group: 'WORLD',
    label: 'Peking Opera & Japan',
    eyebrow: 'Sun Juxian · Yu Shuyan · Yoshie Fujiwara',
    blurb:
      'Two great Peking opera singers, Sun Juxian and Yu Shuyan, beside the tenor Yoshie Fujiwara singing ' +
      '"Kōjō no Tsuki". A small shelf: little East Asian music from before 1926 has been freely digitised yet.',
    rightsNote: WORLD_NOTE,
    featured: [
      'SunJuxianzhongchenbupasis1905VictorRecordC54719B10inch',
      'SUNJUXIANSANNIANGJIAOZIZ1908Victor48088BG',
      'teb-131',
      '78_koj-no-tsuki-moon-on-ruined-castles_yoshie-fujiwara_gbia0187330b',
      '78_oki-no-kamome-fishermans-song_yoshie-fujiwara_gbia0260394a',
    ],
    query: `${WORLD78} AND (language:Japanese OR language:Chinese OR language:jpn OR language:chi OR subject:Japanese OR subject:Chinese)`,
  },
];

/** Search scope used by the library's own search box — held to the same PD ceiling.
 *  resolveItem re-checks each hit's own date, so a mis-dated search hit still cannot play. */
export const PD_SEARCH_SCOPE = WORLD78;

export const getShelf = (id: PDShelfId): PDShelf | undefined => PD_SHELVES.find(s => s.id === id);
