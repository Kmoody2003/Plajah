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
//      year <= 1928. Under the US Music Modernization Act, sound recordings first
//      published before 1929 are in the public domain. That is an inference from
//      the item's date, not a claim the Archive makes, and the service labels it
//      as such rather than laundering it into a licence.
// ─────────────────────────────────────────────────────────────────────────────

export type PDShelfId =
  | 'BAROQUE'
  | 'CLASSICAL_ERA'
  | 'ROMANTIC'
  | 'GREAT_VOICES'
  | 'EARLY_JAZZ'
  | 'RAGTIME'
  | 'EARLY_BLUES';

export interface PDShelf {
  id: PDShelfId;
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

/** The date ceiling every Great 78 query is held to (US pre-1929 rule). */
const PD_YEAR_RANGE = 'year:[1900 TO 1928]';
const G78 = `collection:georgeblood AND ${PD_YEAR_RANGE}`;

const MMA_NOTE =
  'Great 78 Project transfers, held to recordings published before 1929 — public domain in the US ' +
  'under the Music Modernization Act. These items declare no licence of their own; the basis is their date.';

export const PD_SHELVES: PDShelf[] = [
  {
    id: 'BAROQUE',
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
    label: 'Romantic',
    eyebrow: 'Chopin · Wagner · Brahms',
    blurb:
      'Led by Musopen\'s complete Chopin collection — over a hundred modern studio recordings released into the ' +
      'public domain outright — then the great acoustic-era Wagner, Brahms and Liszt sides.',
    rightsNote:
      'The Musopen Chopin collection carries an explicit CC0 1.0 public domain dedication in its own metadata. ' +
      'The 78rpm sides alongside it rest on the pre-1929 date basis.',
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
];

/** Search scope used by the library's own search box — held to the same PD ceiling. */
export const PD_SEARCH_SCOPE = G78;

export const getShelf = (id: PDShelfId): PDShelf | undefined => PD_SHELVES.find(s => s.id === id);
