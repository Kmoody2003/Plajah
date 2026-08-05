// ─────────────────────────────────────────────────────────────────────────────
// repertoire.ts — Blueprint Part 4.3: the public-domain repertoire library.
//
// "Study the score while you listen." Every work here is out of copyright and
// every imslpUrl points at the International Music Score Library Project, which
// hosts free, legal, downloadable scores. IMSLP work-page URLs follow the
// convention:  https://imslp.org/wiki/<Title>_(<Surname>,_<Forename>)
//
// Where a work page could not be pinned with confidence, the entry links the
// composer's IMSLP category page instead — still a real, free destination that
// lands the learner one click from the score.
//
// SEE ALSO data/repertoireScores.ts — for a growing subset of these works we now
// carry the score NATIVELY (CC0 MusicXML, engraved in-app by Verovio) and a
// playable public-domain recording, so the learner never has to leave Plajah.
// IMSLP remains the "full edition" fallback for every entry.
// ─────────────────────────────────────────────────────────────────────────────

export type RepertoireEra =
  | 'Medieval' | 'Renaissance' | 'Baroque' | 'Classical' | 'Romantic' | 'Modern' | 'Ragtime';

export interface RepertoireWork {
  id: string;
  composer: string;
  title: string;
  era: RepertoireEra;
  /** Free score on IMSLP. */
  imslpUrl: string;
  wikiSlug?: string;
  /** Why this work is worth having open in front of you. */
  note?: string;
  /** Forces — orchestra, solo piano, string quartet, voice… */
  forces?: string;
  year?: string;
}

export const REPERTOIRE_ERAS: { id: RepertoireEra; label: string; blurb: string }[] = [
  { id: 'Medieval',    label: 'Medieval',    blurb: 'Chant and the first polyphony — the beginning of written Western music.' },
  { id: 'Renaissance', label: 'Renaissance', blurb: 'Imitative counterpoint at its purest — follow one voice through the whole piece.' },
  { id: 'Baroque',     label: 'Baroque',     blurb: 'Figured bass, fugue and the dance suite. The scores that teach counterpoint.' },
  { id: 'Classical',   label: 'Classical',   blurb: 'Sonata form in its clearest state — mark the double bar and watch the key change.' },
  { id: 'Romantic',    label: 'Romantic',    blurb: 'Expanded orchestras, expanded harmony, and the score as a huge object.' },
  { id: 'Modern',      label: 'Modern',      blurb: 'Impressionism to the edge of tonality — where the rules visibly stop applying.' },
  { id: 'Ragtime',     label: 'Ragtime & March', blurb: 'American printed music at the moment popular song became a publishing industry.' },
];

export const REPERTOIRE: RepertoireWork[] = [
  // ── Medieval ───────────────────────────────────────────────────────────────
  {
    id: 'gregorian-chant',
    composer: 'Anonymous', title: 'Gregorian Chant (Liber Usualis repertory)', era: 'Medieval', year: 'c. 900–1300',
    forces: 'Unaccompanied voices',
    imslpUrl: 'https://imslp.org/wiki/Category:Gregorian_Chant',
    wikiSlug: 'Gregorian_chant',
    note: 'Printed in square neume notation on a four-line staff. There are no bar lines and no fixed rhythm — the Latin text supplies both.',
  },
  {
    id: 'hildegard-ordo',
    composer: 'Hildegard von Bingen', title: 'Symphonia armonie celestium revelationum', era: 'Medieval', year: 'c. 1150',
    forces: 'Voices',
    imslpUrl: 'https://imslp.org/wiki/Category:Hildegard_von_Bingen',
    wikiSlug: 'Hildegard_of_Bingen',
    note: 'The largest surviving body of chant attributable to a single named composer, and its melodic range is far wider than standard liturgical chant.',
  },
  {
    id: 'machaut-messe',
    composer: 'Guillaume de Machaut', title: 'Messe de Nostre Dame', era: 'Medieval', year: 'c. 1365',
    forces: 'Four voices',
    imslpUrl: 'https://imslp.org/wiki/Category:Machaut,_Guillaume_de',
    wikiSlug: 'Messe_de_Nostre_Dame',
    note: 'The earliest complete polyphonic Mass ordinary by one identifiable composer. Isorhythm — a repeating rhythmic pattern independent of the melody — structures whole movements.',
  },

  // ── Renaissance ────────────────────────────────────────────────────────────
  {
    id: 'palestrina-missa-papae',
    composer: 'Giovanni Pierluigi da Palestrina', title: 'Missa Papae Marcelli', era: 'Renaissance', year: 'c. 1562',
    forces: 'Six-voice choir',
    imslpUrl: 'https://imslp.org/wiki/Category:Palestrina,_Giovanni_Pierluigi_da',
    wikiSlug: 'Pope_Marcellus_Mass',
    note: 'The textbook of Renaissance counterpoint. Read the Kyrie with one voice under your finger and you can see every rule Fux later codified being obeyed.',
  },
  {
    id: 'josquin-ave-maria',
    composer: 'Josquin des Prez', title: 'Ave Maria… virgo serena', era: 'Renaissance', year: 'c. 1485',
    forces: 'Four voices',
    imslpUrl: 'https://imslp.org/wiki/Category:Josquin_Desprez',
    wikiSlug: 'Josquin_des_Prez',
    note: 'Each phrase of text gets its own point of imitation. Watch the entries cascade down the score — you can literally see the wave.',
  },
  {
    id: 'byrd-mass-four',
    composer: 'William Byrd', title: 'Mass for Four Voices', era: 'Renaissance', year: 'c. 1592',
    forces: 'Four voices',
    imslpUrl: 'https://imslp.org/wiki/Category:Byrd,_William',
    wikiSlug: 'William_Byrd',
    note: 'Written for illegal Catholic worship in Elizabethan England, and scaled for a handful of singers in a private house rather than a cathedral.',
  },

  // ── Baroque ────────────────────────────────────────────────────────────────
  {
    id: 'bach-wtc1',
    composer: 'Johann Sebastian Bach', title: 'The Well-Tempered Clavier, Book I (BWV 846–869)', era: 'Baroque', year: '1722',
    forces: 'Keyboard',
    imslpUrl: 'https://imslp.org/wiki/Das_wohltemperierte_Klavier_I,_BWV_846-869_(Bach,_Johann_Sebastian)',
    wikiSlug: 'The_Well-Tempered_Clavier',
    note: 'A prelude and fugue in all 24 keys. The single most-studied keyboard collection in existence — start with the C major prelude and the C minor fugue.',
  },
  {
    id: 'bach-cello-suites',
    composer: 'Johann Sebastian Bach', title: 'Six Cello Suites (BWV 1007–1012)', era: 'Baroque', year: 'c. 1720',
    forces: 'Solo cello',
    imslpUrl: 'https://imslp.org/wiki/6_Cello_Suites,_BWV_1007-1012_(Bach,_Johann_Sebastian)',
    wikiSlug: 'Cello_Suites_(Bach)',
    note: 'One line implying four-part harmony. Follow the bass notes only and you will hear a complete chord progression that is never actually played.',
  },
  {
    id: 'bach-goldberg',
    composer: 'Johann Sebastian Bach', title: 'Goldberg Variations (BWV 988)', era: 'Baroque', year: '1741',
    forces: 'Keyboard',
    imslpUrl: 'https://imslp.org/wiki/Goldberg_Variations,_BWV_988_(Bach,_Johann_Sebastian)',
    wikiSlug: 'Goldberg_Variations',
    note: 'Thirty variations over one unchanging bass, with a canon at a successively wider interval every third variation. The architecture is visible on the page.',
  },
  {
    id: 'bach-art-of-fugue',
    composer: 'Johann Sebastian Bach', title: 'The Art of Fugue (BWV 1080)', era: 'Baroque', year: 'c. 1750',
    forces: 'Unspecified / keyboard',
    imslpUrl: 'https://imslp.org/wiki/Die_Kunst_der_Fuge,_BWV_1080_(Bach,_Johann_Sebastian)',
    wikiSlug: 'The_Art_of_Fugue',
    note: 'Every fugue derived from the same subject, ending mid-bar with Bach\'s name spelled in notes. The most complete demonstration of contrapuntal technique ever written.',
  },
  {
    id: 'vivaldi-four-seasons',
    composer: 'Antonio Vivaldi', title: 'The Four Seasons (Op. 8 Nos. 1–4)', era: 'Baroque', year: 'c. 1720',
    forces: 'Solo violin and strings',
    imslpUrl: 'https://imslp.org/wiki/Category:Vivaldi,_Antonio',
    wikiSlug: 'The_Four_Seasons_(Vivaldi)',
    note: 'Programme music three centuries early — each concerto is published with a sonnet, and the score marks where the birds, the storm and the frozen ground appear.',
  },
  {
    id: 'handel-messiah',
    composer: 'George Frideric Handel', title: 'Messiah (HWV 56)', era: 'Baroque', year: '1741',
    forces: 'Soloists, choir, orchestra',
    imslpUrl: 'https://imslp.org/wiki/Messiah,_HWV_56_(Handel,_George_Frideric)',
    wikiSlug: 'Messiah_(Handel)',
    note: 'Composed in about three weeks. Look at the word-painting in "And the glory of the Lord" — the melodic shapes do what the text says.',
  },
  {
    id: 'pachelbel-canon',
    composer: 'Johann Pachelbel', title: 'Canon and Gigue in D major', era: 'Baroque', year: 'c. 1680',
    forces: 'Three violins and continuo',
    imslpUrl: 'https://imslp.org/wiki/Canon_and_Gigue_in_D_major,_P.37_(Pachelbel,_Johann)',
    wikiSlug: 'Pachelbel%27s_Canon',
    note: 'A strict three-voice canon over a two-bar ground bass repeated twenty-eight times. Almost nobody notices it is a canon until they see the score.',
  },

  // ── Classical ──────────────────────────────────────────────────────────────
  {
    id: 'mozart-40',
    composer: 'Wolfgang Amadeus Mozart', title: 'Symphony No. 40 in G minor (K. 550)', era: 'Classical', year: '1788',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.40,_K.550_(Mozart,_Wolfgang_Amadeus)',
    wikiSlug: 'Symphony_No._40_(Mozart)',
    note: 'The clearest sonata-form first movement to read while listening. Mark the second-subject arrival in B-flat and then find the same theme in G minor in the recapitulation.',
  },
  {
    id: 'mozart-requiem',
    composer: 'Wolfgang Amadeus Mozart', title: 'Requiem in D minor (K. 626)', era: 'Classical', year: '1791',
    forces: 'Soloists, choir, orchestra',
    imslpUrl: 'https://imslp.org/wiki/Requiem_in_D_minor,_K.626_(Mozart,_Wolfgang_Amadeus)',
    wikiSlug: 'Requiem_(Mozart)',
    note: 'Unfinished at his death and completed by Süssmayr. The score is a document of two hands, and the seam is a genuine musicological argument.',
  },
  {
    id: 'beethoven-5',
    composer: 'Ludwig van Beethoven', title: 'Symphony No. 5 in C minor (Op. 67)', era: 'Classical', year: '1808',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.5,_Op.67_(Beethoven,_Ludwig_van)',
    wikiSlug: 'Symphony_No._5_(Beethoven)',
    note: 'Four notes generating forty minutes. Highlight every appearance of the short-short-short-long rhythm in the first movement and the page turns black.',
  },
  {
    id: 'beethoven-eroica',
    composer: 'Ludwig van Beethoven', title: 'Symphony No. 3 "Eroica" (Op. 55)', era: 'Classical', year: '1804',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.3,_Op.55_(Beethoven,_Ludwig_van)',
    wikiSlug: 'Symphony_No._3_(Beethoven)',
    note: 'The work that doubled the length of a symphony and made the development section the centre of gravity. Read the coda — it is a second development.',
  },
  {
    id: 'beethoven-moonlight',
    composer: 'Ludwig van Beethoven', title: 'Piano Sonata No. 14 "Moonlight" (Op. 27 No. 2)', era: 'Classical', year: '1801',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Piano_Sonata_No.14,_Op.27_No.2_(Beethoven,_Ludwig_van)',
    wikiSlug: 'Piano_Sonata_No._14_(Beethoven)',
    note: 'Subtitled quasi una fantasia, and it inverts the standard sonata plan — the slow movement comes first and the fastest last.',
  },
  {
    id: 'beethoven-diabelli',
    composer: 'Ludwig van Beethoven', title: '33 Variations on a Waltz by Diabelli (Op. 120)', era: 'Classical', year: '1823',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/33_Variations_on_a_Waltz_by_Diabelli,_Op.120_(Beethoven,_Ludwig_van)',
    wikiSlug: 'Diabelli_Variations',
    note: 'A trivial waltz taken apart and rebuilt thirty-three ways. The best single argument in music that an idea is not its surface.',
  },
  {
    id: 'haydn-emperor',
    composer: 'Joseph Haydn', title: 'String Quartet Op. 76 No. 3 "Emperor"', era: 'Classical', year: '1797',
    forces: 'String quartet',
    imslpUrl: 'https://imslp.org/wiki/Category:Haydn,_Joseph',
    wikiSlug: 'String_Quartets,_Op._76_(Haydn)',
    note: 'The slow movement is a set of variations in which the theme is passed intact between all four instruments in turn — the clearest lesson in texture there is.',
  },

  // ── Romantic ───────────────────────────────────────────────────────────────
  {
    id: 'chopin-nocturnes',
    composer: 'Frédéric Chopin', title: 'Nocturnes', era: 'Romantic', year: '1827–1846',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Category:Chopin,_Fr%C3%A9d%C3%A9ric',
    wikiSlug: 'Nocturnes_(Chopin)',
    note: 'Bel canto opera written for the piano. The right hand is a singer and the left is the orchestra — read them as two separate scores.',
  },
  {
    id: 'schubert-winterreise',
    composer: 'Franz Schubert', title: 'Winterreise (D. 911)', era: 'Romantic', year: '1827',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Winterreise,_D.911_(Schubert,_Franz)',
    wikiSlug: 'Winterreise',
    note: 'Twenty-four songs forming one journey. The piano is not accompaniment — it is the weather, the road and the narrator\'s state of mind.',
  },
  {
    id: 'brahms-4',
    composer: 'Johannes Brahms', title: 'Symphony No. 4 in E minor (Op. 98)', era: 'Romantic', year: '1885',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.4,_Op.98_(Brahms,_Johannes)',
    wikiSlug: 'Symphony_No._4_(Brahms)',
    note: 'The finale is a passacaglia — thirty variations on an eight-bar bass borrowed from Bach, inside a late-Romantic symphony. Count them on the page.',
  },
  {
    id: 'wagner-tristan',
    composer: 'Richard Wagner', title: 'Tristan und Isolde (WWV 90)', era: 'Romantic', year: '1859',
    forces: 'Opera',
    imslpUrl: 'https://imslp.org/wiki/Tristan_und_Isolde,_WWV_90_(Wagner,_Richard)',
    wikiSlug: 'Tristan_und_Isolde',
    note: 'Open to bar one. Four notes that have generated more analytical literature than any other chord in history, and they still refuse to resolve.',
  },
  {
    id: 'tchaikovsky-6',
    composer: 'Pyotr Ilyich Tchaikovsky', title: 'Symphony No. 6 "Pathétique" (Op. 74)', era: 'Romantic', year: '1893',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.6,_Op.74_(Tchaikovsky,_Pyotr)',
    wikiSlug: 'Symphony_No._6_(Tchaikovsky)',
    note: 'Ends slow and quiet, which in 1893 was structurally shocking. Also: the famous descending theme is split between two violin sections and neither plays it.',
  },
  {
    id: 'dvorak-9',
    composer: 'Antonín Dvořák', title: 'Symphony No. 9 "From the New World" (Op. 95)', era: 'Romantic', year: '1893',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.9,_Op.95_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn)',
    wikiSlug: 'Symphony_No._9_(Dvo%C5%99%C3%A1k)',
    note: 'Written in America, and shaped by Dvořák\'s insistence that a national music would come from African-American and Native American sources. Read the Largo\'s cor anglais melody.',
  },
  {
    id: 'mahler-1',
    composer: 'Gustav Mahler', title: 'Symphony No. 1 in D major', era: 'Romantic', year: '1888',
    forces: 'Large orchestra',
    imslpUrl: 'https://imslp.org/wiki/Symphony_No.1_(Mahler,_Gustav)',
    wikiSlug: 'Symphony_No._1_(Mahler)',
    note: 'The third movement sets "Frère Jacques" in minor as a funeral march led by a solo double bass. Mahler\'s scores are the best place to learn orchestration by reading.',
  },

  // ── Modern ─────────────────────────────────────────────────────────────────
  {
    id: 'debussy-preludes',
    composer: 'Claude Debussy', title: 'Préludes, Book I', era: 'Modern', year: '1910',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Pr%C3%A9ludes_(Book_1)_(Debussy,_Claude)',
    wikiSlug: 'Pr%C3%A9ludes_(Debussy)',
    note: 'Titles are printed at the END of each piece, so you hear before you are told. Look at the whole-tone and parallel writing in "Voiles" — function has simply stopped.',
  },
  {
    id: 'debussy-faune',
    composer: 'Claude Debussy', title: 'Prélude à l\'après-midi d\'un faune', era: 'Modern', year: '1894',
    forces: 'Orchestra',
    imslpUrl: 'https://imslp.org/wiki/Pr%C3%A9lude_%C3%A0_l%27apr%C3%A8s-midi_d%27un_faune_(Debussy,_Claude)',
    wikiSlug: 'Pr%C3%A9lude_%C3%A0_l%27apr%C3%A8s-midi_d%27un_faune',
    note: 'Pierre Boulez dated modern music from the opening flute solo. Note how little the score commits to a key in its first twenty bars.',
  },
  {
    id: 'satie-gymnopedies',
    composer: 'Erik Satie', title: 'Trois Gymnopédies', era: 'Modern', year: '1888',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Gymnop%C3%A9dies_(Satie,_Erik)',
    wikiSlug: 'Gymnop%C3%A9dies',
    note: 'Almost nothing happens, deliberately. Satie is the direct ancestor of ambient music and the first composer to write music intended not to demand attention.',
  },
  {
    id: 'ravel-gaspard',
    composer: 'Maurice Ravel', title: 'Gaspard de la nuit', era: 'Modern', year: '1908',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Gaspard_de_la_nuit_(Ravel,_Maurice)',
    wikiSlug: 'Gaspard_de_la_nuit',
    note: 'Written to be harder than Balakirev\'s Islamey. "Scarbo" is one of the most difficult pieces in the piano repertoire and the score looks like it.',
  },
  {
    id: 'holst-planets',
    composer: 'Gustav Holst', title: 'The Planets (Op. 32)', era: 'Modern', year: '1916',
    forces: 'Large orchestra',
    imslpUrl: 'https://imslp.org/wiki/The_Planets,_Op.32_(Holst,_Gustav)',
    wikiSlug: 'The_Planets',
    note: '"Mars" is in 5/4 with a relentless col legno string ostinato — the template for essentially every film score depicting menace since 1977.',
  },
  {
    id: 'schoenberg-op11',
    composer: 'Arnold Schoenberg', title: 'Drei Klavierstücke (Op. 11)', era: 'Modern', year: '1909',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/3_Piano_Pieces,_Op.11_(Schoenberg,_Arnold)',
    wikiSlug: 'Three_Piano_Pieces_(Schoenberg)',
    note: 'Among the first freely atonal works. Try to find a key signature or a cadence — there is nowhere for the ear to rest, and that is the intent.',
  },
  // ── The song shelf ─────────────────────────────────────────────────────────
  // These works are here because we can put the *actual engraved score* in front
  // of you, natively, without leaving Plajah — the OpenScore Lieder Corpus has
  // hand-engraved, CC0 MusicXML for every one of them. See data/repertoireScores.ts.
  {
    id: 'schubert-schoene-muellerin',
    composer: 'Franz Schubert', title: 'Die schöne Müllerin (D. 795)', era: 'Romantic', year: '1823',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Die_sch%C3%B6ne_M%C3%BCllerin,_D.795_(Schubert,_Franz)',
    wikiSlug: 'Die_sch%C3%B6ne_M%C3%BCllerin',
    note: 'The first great song cycle. Twenty songs, one narrator, one brook — and the brook has its own piano figuration that never stops moving until the last song, when it becomes a lullaby.',
  },
  {
    id: 'schubert-schwanengesang',
    composer: 'Franz Schubert', title: 'Schwanengesang (D. 957)', era: 'Romantic', year: '1828',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Schwanengesang,_D.957_(Schubert,_Franz)',
    wikiSlug: 'Schwanengesang',
    note: 'Not a cycle Schubert assembled — his publisher gathered the last songs after his death. "Der Doppelgänger" is fourteen bars of the same bass repeated under a voice that barely moves.',
  },
  {
    id: 'schubert-erlkonig',
    composer: 'Franz Schubert', title: 'Erlkönig (D. 328)', era: 'Romantic', year: '1815',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Erlk%C3%B6nig,_D.328_(Schubert,_Franz)',
    wikiSlug: 'Erlk%C3%B6nig_(Schubert)',
    note: 'Written at eighteen. One singer plays four characters, and you can see each one arrive in the score — the father low and plain, the child rising a step higher each time he cries out.',
  },
  {
    id: 'schubert-gretchen',
    composer: 'Franz Schubert', title: 'Gretchen am Spinnrade (D. 118)', era: 'Romantic', year: '1814',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Gretchen_am_Spinnrade,_D.118_(Schubert,_Franz)',
    wikiSlug: 'Gretchen_am_Spinnrade',
    note: 'Schubert was seventeen, and the German Lied effectively starts here. The right hand is the spinning wheel — watch the exact bar where it stops, and read the text at that moment.',
  },
  {
    id: 'schumann-dichterliebe',
    composer: 'Robert Schumann', title: 'Dichterliebe (Op. 48)', era: 'Romantic', year: '1840',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Dichterliebe,_Op.48_(Schumann,_Robert)',
    wikiSlug: 'Dichterliebe',
    note: 'Sixteen Heine settings from Schumann\'s "year of song". The first song never resolves, and the cycle ends with a long piano postlude that says what the poet cannot.',
  },
  {
    id: 'schumann-frauenliebe',
    composer: 'Robert Schumann', title: 'Frauenliebe und -leben (Op. 42)', era: 'Romantic', year: '1840',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Frauenliebe_und_Leben,_Op.42_(Schumann,_Robert)',
    wikiSlug: 'Frauenliebe_und_-leben',
    note: 'Eight songs tracking one life. The piano quotes the opening song verbatim at the very end — the score makes the return visible in a way listening alone rarely does.',
  },
  {
    id: 'schumann-liederkreis-39',
    composer: 'Robert Schumann', title: 'Liederkreis (Op. 39)', era: 'Romantic', year: '1840',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Liederkreis,_Op.39_(Schumann,_Robert)',
    wikiSlug: 'Liederkreis,_Op._39_(Schumann)',
    note: 'Twelve Eichendorff settings about forests, night and homesickness. "Mondnacht" is built on a chord that hovers for eight bars before it agrees to be a tonic.',
  },
  {
    id: 'wolf-eichendorff',
    composer: 'Hugo Wolf', title: 'Eichendorff-Lieder', era: 'Romantic', year: '1886–1888',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Eichendorff-Lieder_(Wolf,_Hugo)',
    wikiSlug: 'Hugo_Wolf',
    note: 'Wolf treats the poem as the score\'s master: the vocal line follows German speech rhythm almost exactly, and the piano carries the harmony on its own terms.',
  },
  {
    id: 'brahms-lieder-op32',
    composer: 'Johannes Brahms', title: '9 Lieder und Gesänge (Op. 32)', era: 'Romantic', year: '1864',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Category:Brahms,_Johannes',
    wikiSlug: 'Johannes_Brahms',
    note: 'Brahms at his most inward. The piano writing is thick and low, and the songs repeatedly place the voice inside the texture rather than above it.',
  },
  {
    id: 'beethoven-lieder-op52',
    composer: 'Ludwig van Beethoven', title: '8 Lieder (Op. 52)', era: 'Classical', year: '1805',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/8_Lieder,_Op.52_(Beethoven,_Ludwig_van)',
    wikiSlug: 'Ludwig_van_Beethoven',
    note: 'Early, mostly strophic and deliberately simple — useful as a "before" picture against which Schubert\'s and Schumann\'s songs read as a revolution.',
  },
  {
    id: 'hensel-lieder-op1',
    composer: 'Fanny Hensel', title: '6 Lieder (Op. 1)', era: 'Romantic', year: '1846',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/6_Lieder,_Op.1_(Hensel,_Fanny)',
    wikiSlug: 'Fanny_Mendelssohn',
    note: 'Her first publication under her own name, at forty-one, after a lifetime of writing. The songs were never the problem; the byline was.',
  },
  {
    id: 'clara-schumann-op13',
    composer: 'Clara Schumann', title: '6 Lieder (Op. 13)', era: 'Romantic', year: '1844',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/6_Lieder,_Op.13_(Schumann,_Clara)',
    wikiSlug: 'Clara_Schumann',
    note: 'A working concert pianist\'s songwriting: the accompaniments are pianistically idiomatic in a way most Lieder of the period are not.',
  },
  {
    id: 'boulanger-clairieres',
    composer: 'Lili Boulanger', title: 'Clairières dans le ciel', era: 'Modern', year: '1914',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Clairi%C3%A8res_dans_le_ciel_(Boulanger,_Lili)',
    wikiSlug: 'Lili_Boulanger',
    note: 'Thirteen songs written by a twenty-year-old who had just become the first woman to win the Prix de Rome, and who would be dead within four years.',
  },
  {
    id: 'schoenberg-op15',
    composer: 'Arnold Schoenberg', title: 'Das Buch der hängenden Gärten (Op. 15)', era: 'Modern', year: '1909',
    forces: 'Voice and piano',
    imslpUrl: 'https://imslp.org/wiki/Das_Buch_der_h%C3%A4ngenden_G%C3%A4rten,_Op.15_(Schoenberg,_Arnold)',
    wikiSlug: 'Das_Buch_der_h%C3%A4ngenden_G%C3%A4rten',
    note: 'Schoenberg said of this cycle that he had broken all barriers of a past aesthetic. Read it next to the Op. 11 piano pieces — same year, same decision.',
  },

  {
    id: 'joplin-maple-leaf',
    composer: 'Scott Joplin', title: 'Maple Leaf Rag', era: 'Ragtime', year: '1899',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/Maple_Leaf_Rag_(Joplin,_Scott)',
    wikiSlug: 'Maple_Leaf_Rag',
    note: 'The first instrumental sheet-music million-seller. Play the left hand alone and it is a march; add the right and every accent lands between the beats.',
  },
  {
    id: 'joplin-entertainer',
    composer: 'Scott Joplin', title: 'The Entertainer', era: 'Ragtime', year: '1902',
    forces: 'Piano',
    imslpUrl: 'https://imslp.org/wiki/The_Entertainer_(Joplin,_Scott)',
    wikiSlug: 'The_Entertainer_(rag)',
    note: 'Joplin printed "Notice! Do not play this piece fast. It is never right to play Ragtime fast." Read that, then listen to how almost everyone plays it.',
  },
  {
    id: 'sousa-stars-stripes',
    composer: 'John Philip Sousa', title: 'The Stars and Stripes Forever', era: 'Ragtime', year: '1896',
    forces: 'Concert band',
    imslpUrl: 'https://imslp.org/wiki/The_Stars_and_Stripes_Forever_(Sousa,_John_Philip)',
    wikiSlug: 'The_Stars_and_Stripes_Forever',
    note: 'A march in strict multi-strain form with a trio, a break strain and the famous piccolo obbligato. The clearest surviving model of how sectional form works.',
  },
];

/** Works grouped by era, in the order REPERTOIRE_ERAS declares. */
export const repertoireByEra = (era: RepertoireEra): RepertoireWork[] =>
  REPERTOIRE.filter(w => w.era === era);

export default REPERTOIRE;
