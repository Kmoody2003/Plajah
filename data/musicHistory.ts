// ─────────────────────────────────────────────────────────────────────────────
// musicHistory.ts — the Chora Conservatory's "Music History" reading list.
//
// A concise, curated survey of Western music from antiquity to the digital age.
// Each era carries a short essay, the key developments that defined it, and a few
// "listen for this" notes to train the ear. Rendered as cards by
// components/ChoraConservatory.tsx — no external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export interface MusicHistoryEra {
  id: string;
  title: string;
  span: string;
  essay: string;
  developments: string[];
  listenFor: string[];
}

export const MUSIC_HISTORY_ERAS: MusicHistoryEra[] = [
  {
    id: 'antiquity',
    title: 'Antiquity & the Ancient World',
    span: 'c. 3000 BCE – 500 CE',
    essay:
      'The earliest music we can reconstruct comes from Mesopotamia, Egypt, Greece and China — sung poetry, temple ritual and civic ceremony. The Greeks left us not just fragments of melody but the first theory of music: Pythagoras’ discovery that consonant intervals correspond to simple whole-number ratios, and a system of modes (harmoniai) believed to shape character and emotion. Almost nothing survives as sound, but the ideas — that pitch is measurable and that music moves the soul — outlast every note.',
    developments: [
      'Pythagorean tuning — intervals as whole-number frequency ratios',
      'The Greek modal system and the notion of ethos (music’s moral effect)',
      'The oldest surviving complete song: the Seikilos epitaph (1st c. CE)',
    ],
    listenFor: [
      'The pure, beatless ring of a perfect fifth (a 3:2 ratio)',
      'Single unharmonised melodic lines — monophony, before chords existed',
    ],
  },
  {
    id: 'medieval',
    title: 'The Medieval Era',
    span: 'c. 500 – 1400',
    essay:
      'For centuries European music was the plainchant of the church — free-flowing, unmeasured, monophonic. Two revolutions changed everything. First, notation: monks devised neumes and then, thanks to Guido of Arezzo, the staff — so a melody could be written down and taught without hearing it. Second, polyphony: singers began adding a second, then a third independent line, and with them the need to coordinate rhythm precisely. By the Notre-Dame school and the Ars Nova, Western music had become a written, layered art unlike anything else on earth.',
    developments: [
      'Gregorian chant codified across the Western church',
      'Guido of Arezzo’s staff notation — music becomes writable and teachable',
      'The birth of polyphony (organum) and measured rhythm (Ars Nova)',
    ],
    listenFor: [
      'The serene, wordy flow of unaccompanied chant',
      'Two or more independent voices weaving against each other',
    ],
  },
  {
    id: 'renaissance',
    title: 'The Renaissance',
    span: 'c. 1400 – 1600',
    essay:
      'Polyphony reached a golden balance. Composers like Josquin des Prez and Palestrina wrote for interlocking vocal lines of astonishing smoothness, each voice equal, the whole texture rich and clear. The invention of music printing (Petrucci, 1501) did for the score what Gutenberg did for the book — music could now travel cheaply across Europe. Sacred masses and motets shared the age with the secular madrigal, where music began to bend expressively to the meaning of every word.',
    developments: [
      'Music printing (Ottaviano Petrucci, 1501) spreads scores across Europe',
      'The refined, balanced polyphony of Josquin and Palestrina',
      'The madrigal — word-painting and expressive text-setting',
    ],
    listenFor: [
      'Voices entering one by one in imitation of the same tune',
      'Word-painting: the music rising on “heaven”, falling on “death”',
    ],
  },
  {
    id: 'baroque',
    title: 'The Baroque',
    span: 'c. 1600 – 1750',
    essay:
      'Around 1600 music tilted toward drama. A single melody over a supporting bass (the basso continuo) replaced the equal-voice weave — and out of that came opera, born in Florence and perfected by Monteverdi. Meanwhile the system of major and minor keys crystallised, giving music a sense of tension and home-coming: functional tonal harmony. Bach and Handel drove counterpoint and grandeur to their peak, and equal-ish temperament let a keyboard play in every key — the achievement Bach celebrated in The Well-Tempered Clavier.',
    developments: [
      'Opera invented in Florence; the basso continuo texture',
      'Functional tonal harmony — the major/minor key system matures',
      'Well-tempered tuning makes all 24 keys playable on one instrument',
    ],
    listenFor: [
      'A steady walking bass line under an ornamented melody',
      'The satisfying pull of a dominant chord resolving home',
    ],
  },
  {
    id: 'classical',
    title: 'The Classical Era',
    span: 'c. 1730 – 1820',
    essay:
      'A reaction against Baroque density: clarity, symmetry and elegant balance. Haydn, Mozart and the young Beethoven built music from clearly shaped phrases and dramatic key relationships. Two forms came of age — the symphony and the string quartet — and the flexible sonata form, with its journey away from home key and back, became the age’s great engine of drama. The fortepiano replaced the harpsichord, its ability to play soft and loud (piano e forte) opening a new expressive world.',
    developments: [
      'Sonata form as the dominant structural principle',
      'The symphony and string quartet standardised (Haydn)',
      'The fortepiano — dynamics under the player’s fingers',
    ],
    listenFor: [
      'Clear, answering phrases like question and reply',
      'A movement leaving its home key and dramatically returning to it',
    ],
  },
  {
    id: 'romantic',
    title: 'The Romantic Era',
    span: 'c. 1800 – 1910',
    essay:
      'The composer became a hero and music a vehicle for overwhelming personal emotion, nature, love and nation. Orchestras and forms swelled; harmony grew ever more chromatic and restless, stretching tonality toward its breaking point in Wagner’s Tristan. Alongside the epic came the intimate: Schubert’s and Schumann’s art songs, Chopin’s piano miniatures. National schools — Russian, Czech, Scandinavian — drew on folk song to give each country its own voice.',
    developments: [
      'Expanded orchestra, extreme dynamics and extended forms',
      'Chromatic harmony stretching tonality to its limits (Wagner)',
      'Nationalism — folk material entering the concert hall',
    ],
    listenFor: [
      'Lush, unstable harmony that delays resolution for pages',
      'A recurring theme (leitmotif or idée fixe) tracking a character or idea',
    ],
  },
  {
    id: 'modern',
    title: 'Modernism & the 20th Century',
    span: 'c. 1900 – 1975',
    essay:
      'The common language of tonality fractured into many. Debussy dissolved the key with whole-tone colour; Stravinsky detonated rhythm in The Rite of Spring; Schoenberg abandoned the key altogether and built the twelve-tone method. But the century’s largest sonic revolution was technological: recorded sound. Once music could be captured, the performance — not just the score — became the artwork, and a century of popular music organised itself around the record. Later, electronic instruments and tape music redefined what a "sound" could even be.',
    developments: [
      'Atonality and Schoenberg’s twelve-tone (serial) method',
      'Rhythmic revolution and new tone colours (Stravinsky, Debussy, Ravel)',
      'Recorded sound — the performance becomes the artwork; electronic music arrives',
    ],
    listenFor: [
      'Music with no clear "home" key — no resting point',
      'Irregular, shifting meters that refuse a steady toe-tap',
    ],
  },
  {
    id: 'popular',
    title: 'The Age of Popular Music',
    span: 'c. 1900 – 1990',
    essay:
      'Recording did not just preserve music — it created new music. The blues rose from the Mississippi Delta and the church, and its twelve-bar form and blue notes seeded jazz, R&B, soul, rock and country in turn. Jazz gave the world improvisation as high art; the LP (1948) freed artists to think in album-length statements; multitrack tape turned the studio itself into an instrument. From Armstrong to Aretha to the Beatles, the record became the primary form in which most people met music.',
    developments: [
      'The blues and its twelve-bar form seed jazz, R&B, soul, rock and country',
      'The LP (1948) and multitrack recording — the album and the studio as instrument',
      'Radio and records make recorded performance music’s dominant form',
    ],
    listenFor: [
      'The twelve-bar blues chord cycle under countless songs',
      '"Blue notes" — bent, flattened thirds and sevenths that sound between the keys',
    ],
  },
  {
    id: 'digital',
    title: 'The Digital Age',
    span: 'c. 1980 – today',
    essay:
      'The sampler and the drum machine let musicians build entire records from fragments of other records — and hip-hop turned that into an art of collage, giving rise to the deep, still-unsettled legal question of who owns a sample. Digital audio (the CD, then MP3), the software studio and finally streaming collapsed the cost of making and distributing music toward zero. Today anyone can produce in their bedroom and reach the world instantly, while questions of ownership, royalties and now AI-generated music remain wide open.',
    developments: [
      'Sampling and the drum machine — hip-hop, and "sampling and the law"',
      'Digital audio (CD → MP3) and the software (DAW) studio',
      'Streaming, bedroom production, and the open questions of AI-made music',
    ],
    listenFor: [
      'A looped "break" — a drum passage lifted from an older record',
      'Quantised, machine-perfect timing versus a human, off-grid feel',
    ],
  },
];
