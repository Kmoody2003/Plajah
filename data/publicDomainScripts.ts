// publicDomainScripts — the only scripts Plajah hosts on-platform.
//
// ⚠️ LEGAL BOUNDARY — read before adding anything here.
//
// Everything in this file is a work that is in the PUBLIC DOMAIN and is fetched
// from Project Gutenberg, which distributes only texts it has verified to be
// public domain in the United States (and whose own editions carry the Project
// Gutenberg License permitting unrestricted redistribution).
//
// "Educational use" is NOT a licence to host a copyrighted work. In-copyright
// screenplays — Chinatown, Casablanca, Sunset Blvd., All About Eve, North by
// Northwest, The Philadelphia Story and the rest — are LINKED OUT to their
// source and are never mirrored onto Plajah. They live in the "Read at source"
// shelf in components/FilmSchoolView.tsx. Do not move them here.
//
// Every `sourceId` below was verified by fetching
// https://www.gutenberg.org/ebooks/<id>.txt.utf-8 and reading the Title /
// Author / Language fields out of the Gutenberg header. If you add an entry,
// verify it the same way — an unverified id is a dead shelf.
//
// NOTE ON FORM: no screenplay could be positively established as public domain
// from a source whose licence we can point at (the Internet Archive screenplay
// collections are overwhelmingly unlicensed uploads of in-copyright studio
// drafts). The on-platform library is therefore stage drama — which is exactly
// where dramatic structure, scene economy and dialogue were invented.

export type ScriptForm = 'STAGE_PLAY' | 'SCREENPLAY';

export interface PublicDomainScript {
  /** Stable slug — used for reader routing and reading-progress keys. */
  id: string;
  title: string;
  author: string;
  /** Translator / editor of the public-domain edition, where relevant. */
  translator?: string;
  /** Display year of first performance or publication. */
  year: string;
  form: ScriptForm;
  /** Shelf grouping — see TRADITIONS below. */
  tradition: TraditionId;
  genre: string;
  /** Project Gutenberg ebook number. */
  sourceId: number;
  /** Human-facing catalogue page. */
  sourceUrl: string;
  /** Plain-text UTF-8 download used by the reader. */
  textUrl: string;
  /** Short licence label shown on the card. */
  license: string;
  /** The specific public-domain basis, shown in the reader. */
  licenseBasis: string;
  /** What it is. */
  blurb: string;
  /** Why a writer should read it. */
  whyRead: string;
}

export type TraditionId =
  | 'GREECE' | 'INDIA' | 'RENAISSANCE' | 'CLASSICISM' | 'GEORGIAN'
  | 'GERMAN' | 'REALISM' | 'RUSSIAN' | 'NORDIC' | 'WILDE_SHAW'
  | 'IRISH' | 'EUROPEAN_MODERN' | 'AMERICAN';

export interface Tradition {
  id: TraditionId;
  label: string;
  note: string;
  gradient: string;
  accent: string;
}

export const TRADITIONS: Tradition[] = [
  { id: 'GREECE',          label: 'Ancient Greece',        note: 'Where the form was invented — chorus, reversal, recognition.', gradient: 'from-amber-900 to-yellow-800',   accent: 'text-amber-300' },
  { id: 'INDIA',           label: 'Classical India',       note: 'Sanskrit drama and the rasa tradition.',                        gradient: 'from-rose-900 to-pink-800',     accent: 'text-rose-300' },
  { id: 'RENAISSANCE',     label: 'English Renaissance',   note: 'Blank verse, the soliloquy, and the public playhouse.',         gradient: 'from-violet-900 to-purple-800', accent: 'text-violet-300' },
  { id: 'CLASSICISM',      label: 'Continental Classicism', note: 'Spanish Golden Age and French neoclassical tragedy.',          gradient: 'from-sky-900 to-blue-800',      accent: 'text-sky-300' },
  { id: 'GEORGIAN',        label: 'Restoration & Georgian', note: 'English comedy of manners at its sharpest.',                   gradient: 'from-emerald-900 to-green-800', accent: 'text-emerald-300' },
  { id: 'GERMAN',          label: 'German Romanticism',    note: 'Epic scale, philosophical ambition.',                           gradient: 'from-orange-900 to-amber-800',  accent: 'text-orange-300' },
  { id: 'REALISM',         label: 'Ibsen & Modern Realism', note: 'The living room becomes the battlefield.',                     gradient: 'from-blue-900 to-indigo-800',   accent: 'text-blue-300' },
  { id: 'RUSSIAN',         label: 'The Russian Stage',     note: 'Subtext, ensemble, and the drama of what is not said.',         gradient: 'from-red-900 to-rose-800',      accent: 'text-red-300' },
  { id: 'NORDIC',          label: 'Scandinavian Modernism', note: 'Naturalism pushed to its psychological extreme.',              gradient: 'from-cyan-900 to-teal-800',     accent: 'text-cyan-300' },
  { id: 'WILDE_SHAW',      label: 'Wilde & Shaw',          note: 'The most quotable dialogue in English.',                        gradient: 'from-fuchsia-900 to-pink-800',  accent: 'text-fuchsia-300' },
  { id: 'IRISH',           label: 'The Irish Revival',     note: 'Vernacular speech as dramatic poetry.',                         gradient: 'from-green-900 to-emerald-800', accent: 'text-green-300' },
  { id: 'EUROPEAN_MODERN', label: 'European Modernism',    note: 'Symbolism, metatheatre, and the broken fourth wall.',           gradient: 'from-indigo-900 to-violet-800', accent: 'text-indigo-300' },
  { id: 'AMERICAN',        label: 'The American Stage',    note: 'The birth of a native dramatic voice.',                         gradient: 'from-teal-900 to-cyan-800',     accent: 'text-teal-300' },
];

export const TRADITION_BY_ID: Record<TraditionId, Tradition> =
  TRADITIONS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<TraditionId, Tradition>);

/** The licence statement that applies to every entry in this library. */
export const PD_LICENSE_STATEMENT =
  'Distributed by Project Gutenberg, which publishes only works verified to be in the public domain in the United States. The Project Gutenberg edition may be freely read, copied and redistributed.';

const GUTENBERG = 'Public domain — Project Gutenberg';

/** Build the two Gutenberg URLs from an ebook number. */
const pg = (id: number) => ({
  sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
  textUrl: `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
});

type Seed = Omit<PublicDomainScript, 'sourceUrl' | 'textUrl' | 'license' | 'form'> &
  Partial<Pick<PublicDomainScript, 'form'>>;

const SEEDS: Seed[] = [
  // ── Ancient Greece ─────────────────────────────────────────────────────────
  {
    id: 'sophocles-theban',
    title: 'Oedipus the King · Oedipus at Colonus · Antigone',
    author: 'Sophocles',
    translator: 'Francis Storr',
    year: 'c. 441–401 BCE',
    tradition: 'GREECE',
    genre: 'Tragedy',
    sourceId: 31,
    licenseBasis: 'Written in 5th-century BCE Athens; this English verse translation is itself long out of copyright.',
    blurb: 'The three Theban plays in one volume: a king hunting a murderer who turns out to be himself, his exile and death, and his daughter\'s refusal to let her brother lie unburied.',
    whyRead: 'Oedipus the King is the tightest reversal-and-recognition machine ever built. Aristotle used it as the worked example in the Poetics, and every "the detective is the killer" structure since is a footnote to it.',
  },
  {
    id: 'medea',
    title: 'Medea',
    author: 'Euripides',
    translator: 'Gilbert Murray',
    year: '431 BCE',
    tradition: 'GREECE',
    genre: 'Tragedy',
    sourceId: 35451,
    licenseBasis: 'Ancient Greek original; public-domain English translation.',
    blurb: 'Abandoned by Jason for a younger, better-connected bride, Medea takes a revenge so total it destroys her own future along with his.',
    whyRead: 'A masterclass in giving an unforgivable act an unbearably logical build. Euripides makes you follow every step of the reasoning before the horror lands.',
  },
  {
    id: 'oresteia',
    title: 'The House of Atreus (The Oresteia)',
    author: 'Aeschylus',
    translator: 'E. D. A. Morshead',
    year: '458 BCE',
    tradition: 'GREECE',
    genre: 'Tragic Trilogy',
    sourceId: 8604,
    licenseBasis: 'Ancient Greek original; public-domain English translation.',
    blurb: 'Agamemnon, The Libation Bearers and The Furies — a chain of blood-vengeance that ends only when a court of law is invented to stop it.',
    whyRead: 'The only surviving complete Greek trilogy, and the clearest model there is for how to carry a moral question across three acts of a saga without repeating yourself.',
  },
  {
    id: 'the-frogs',
    title: 'The Frogs',
    author: 'Aristophanes',
    year: '405 BCE',
    tradition: 'GREECE',
    genre: 'Comedy / Satire',
    sourceId: 7998,
    licenseBasis: 'Ancient Greek original; public-domain English translation.',
    blurb: 'Dionysus goes down to the underworld to bring a great playwright back to Athens, and stages a contest between Aeschylus and Euripides to pick one.',
    whyRead: 'The first great piece of criticism written as comedy. The Aeschylus–Euripides debate is still the sharpest argument about what dialogue is for.',
  },
  {
    id: 'lysistrata',
    title: 'Lysistrata',
    author: 'Aristophanes',
    year: '411 BCE',
    tradition: 'GREECE',
    genre: 'Comedy / Satire',
    sourceId: 7700,
    licenseBasis: 'Ancient Greek original; public-domain English translation.',
    blurb: 'The women of the warring Greek city-states agree to withhold sex until the men negotiate peace.',
    whyRead: 'A one-line premise executed with total commitment — the purest demonstration that a comic engine only works if every character takes it completely seriously.',
  },

  // ── Classical India ────────────────────────────────────────────────────────
  {
    id: 'sakoontala',
    title: 'Sakoontala; or, The Lost Ring',
    author: 'Kālidāsa',
    translator: 'Monier Williams',
    year: 'c. 4th–5th century CE',
    tradition: 'INDIA',
    genre: 'Romance',
    sourceId: 12169,
    licenseBasis: 'Classical Sanskrit original; 19th-century English translation, public domain.',
    blurb: 'A king falls in love with a hermitage-raised woman, then forgets her entirely under a curse — until a ring is recovered from a fish.',
    whyRead: 'Sanskrit drama builds around rasa — the emotional flavour an audience is meant to taste — rather than conflict. Reading it recalibrates what a scene can be organised around.',
  },

  // ── English Renaissance ────────────────────────────────────────────────────
  {
    id: 'doctor-faustus',
    title: 'The Tragical History of Doctor Faustus',
    author: 'Christopher Marlowe',
    year: '1604',
    tradition: 'RENAISSANCE',
    genre: 'Tragedy',
    sourceId: 779,
    licenseBasis: 'Published 1604; long in the public domain.',
    blurb: 'A scholar trades his soul for twenty-four years of power and knowledge, and spends most of them on parlour tricks.',
    whyRead: 'The great study of a protagonist who gets exactly what he asked for. Marlowe\'s mighty line is where English dramatic verse learned to move at speed.',
  },
  {
    id: 'hamlet',
    title: 'Hamlet',
    author: 'William Shakespeare',
    year: 'c. 1600',
    tradition: 'RENAISSANCE',
    genre: 'Tragedy',
    sourceId: 1524,
    licenseBasis: 'Published c. 1603–1623; long in the public domain.',
    blurb: 'A prince is told by his father\'s ghost that his uncle murdered him, and cannot bring himself to act on it.',
    whyRead: 'The deepest interior life ever written for the stage, achieved almost entirely through a character talking himself out of things. Study the soliloquies as structure, not poetry.',
  },
  {
    id: 'macbeth',
    title: 'Macbeth',
    author: 'William Shakespeare',
    year: 'c. 1606',
    tradition: 'RENAISSANCE',
    genre: 'Tragedy',
    sourceId: 1533,
    licenseBasis: 'First published 1623 (First Folio); long in the public domain.',
    blurb: 'A soldier is told he will be king, kills to make it true, and then has to keep killing to stay there.',
    whyRead: 'The shortest tragedy and the most ruthlessly efficient. Nothing in it is decoration — a model for how fast a story can move when every scene raises the cost.',
  },
  {
    id: 'romeo-and-juliet',
    title: 'Romeo and Juliet',
    author: 'William Shakespeare',
    year: 'c. 1595',
    tradition: 'RENAISSANCE',
    genre: 'Tragedy / Romance',
    sourceId: 1112,
    licenseBasis: 'Published 1597; long in the public domain.',
    blurb: 'Two teenagers from feuding families marry in secret, and a sequence of near-misses turns it fatal.',
    whyRead: 'The Prologue gives away the ending in fourteen lines, and the play is still unbearable. The best argument there is that suspense is not the same thing as surprise.',
  },
  {
    id: 'king-lear',
    title: 'King Lear',
    author: 'William Shakespeare',
    year: 'c. 1606',
    tradition: 'RENAISSANCE',
    genre: 'Tragedy',
    sourceId: 1532,
    licenseBasis: 'Published 1608; long in the public domain.',
    blurb: 'An ageing king divides his kingdom by asking his daughters to say how much they love him, and disinherits the only one who answers honestly.',
    whyRead: 'The finest double-plot in the language — Lear and Gloucester rhyme without ever being explained. Read it for how two storylines can comment on each other structurally.',
  },
  {
    id: 'the-tempest',
    title: 'The Tempest',
    author: 'William Shakespeare',
    year: 'c. 1611',
    tradition: 'RENAISSANCE',
    genre: 'Romance / Fantasy',
    sourceId: 23042,
    licenseBasis: 'First published 1623 (First Folio); long in the public domain.',
    blurb: 'A deposed duke, marooned on an island with his daughter and his books, raises a storm to wash his enemies ashore.',
    whyRead: 'It observes the classical unities almost exactly — one place, one day — and shows how tight constraints concentrate rather than shrink a story.',
  },
  {
    id: 'midsummer-nights-dream',
    title: 'A Midsummer Night\'s Dream',
    author: 'William Shakespeare',
    year: 'c. 1595',
    tradition: 'RENAISSANCE',
    genre: 'Comedy',
    sourceId: 1514,
    licenseBasis: 'Published 1600; long in the public domain.',
    blurb: 'Four lovers, a company of amateur actors and a quarrelling fairy court collide in a wood outside Athens.',
    whyRead: 'Four separate plots braided so cleanly you never lose one. The gold standard for interweaving ensembles.',
  },
  {
    id: 'volpone',
    title: 'Volpone; or, The Fox',
    author: 'Ben Jonson',
    year: '1606',
    tradition: 'RENAISSANCE',
    genre: 'Satire / Comedy',
    sourceId: 4039,
    licenseBasis: 'Published 1607; long in the public domain.',
    blurb: 'A rich Venetian fakes a terminal illness so that would-be heirs will shower him with gifts.',
    whyRead: 'A con-artist plot with no likeable person in it, which stays gripping purely on escalation. The direct ancestor of every grifter story on screen.',
  },
  {
    id: 'duchess-of-malfi',
    title: 'The Duchess of Malfi',
    author: 'John Webster',
    year: 'c. 1614',
    tradition: 'RENAISSANCE',
    genre: 'Revenge Tragedy',
    sourceId: 2232,
    licenseBasis: 'Published 1623; long in the public domain.',
    blurb: 'A widowed duchess marries her steward in secret; her two brothers destroy her for it.',
    whyRead: 'Jacobean tragedy at its darkest, and the model for the horror-adjacent thriller — dread built through atmosphere and surveillance rather than incident.',
  },

  // ── Continental Classicism ─────────────────────────────────────────────────
  {
    id: 'life-is-a-dream',
    title: 'Life Is a Dream',
    author: 'Pedro Calderón de la Barca',
    year: '1635',
    tradition: 'CLASSICISM',
    genre: 'Philosophical Drama',
    sourceId: 2587,
    licenseBasis: 'Spanish Golden Age original; public-domain English translation.',
    blurb: 'A prince imprisoned since birth on the strength of a prophecy is drugged, given the throne for a day, and told it was all a dream.',
    whyRead: 'The great "is this real?" play, three centuries before the genre existed. Its central reversal is still being rebuilt by science-fiction screenwriters.',
  },
  {
    id: 'tartuffe',
    title: 'Tartuffe; or, The Hypocrite',
    author: 'Molière',
    year: '1664',
    tradition: 'CLASSICISM',
    genre: 'Comedy',
    sourceId: 2027,
    licenseBasis: 'French original of 1664; public-domain English translation.',
    blurb: 'A pious fraud talks his way into a wealthy household and very nearly walks off with the house, the fortune and the wife.',
    whyRead: 'Tartuffe does not appear until Act III, and the first two acts are all about him. A textbook lesson in building a character before the audience meets them.',
  },
  {
    id: 'the-cid',
    title: 'The Cid',
    author: 'Pierre Corneille',
    year: '1637',
    tradition: 'CLASSICISM',
    genre: 'Tragicomedy',
    sourceId: 14954,
    licenseBasis: 'French original of 1637; public-domain English translation.',
    blurb: 'A young man must avenge his father by killing the father of the woman he loves — and she must then demand his death.',
    whyRead: 'The purest dilemma play ever written: two irreconcilable obligations, no third option. Read it whenever a plot needs a real bind rather than an obstacle.',
  },
  {
    id: 'phaedra',
    title: 'Phaedra',
    author: 'Jean Racine',
    year: '1677',
    tradition: 'CLASSICISM',
    genre: 'Tragedy',
    sourceId: 1977,
    licenseBasis: 'French original of 1677; public-domain English translation.',
    blurb: 'A queen confesses a desire for her stepson, and a false report of her husband\'s death turns confession into catastrophe.',
    whyRead: 'Almost nothing happens on stage; everything happens inside people. The extreme case of drama driven entirely by suppressed want.',
  },

  // ── Restoration & Georgian ─────────────────────────────────────────────────
  {
    id: 'way-of-the-world',
    title: 'The Way of the World',
    author: 'William Congreve',
    year: '1700',
    tradition: 'GEORGIAN',
    genre: 'Comedy of Manners',
    sourceId: 1292,
    licenseBasis: 'Published 1700; long in the public domain.',
    blurb: 'Two lovers try to secure an aunt\'s consent — and the inheritance attached to it — through a plot of almost unfollowable intricacy.',
    whyRead: 'The "proviso scene," in which the couple negotiate the terms of their marriage line by line, is the wittiest scene of mutual negotiation in English.',
  },
  {
    id: 'beggars-opera',
    title: 'The Beggar\'s Opera',
    author: 'John Gay',
    year: '1728',
    tradition: 'GEORGIAN',
    genre: 'Ballad Opera / Satire',
    sourceId: 2421,
    licenseBasis: 'Published 1728; long in the public domain.',
    blurb: 'Highwaymen, fences and thief-takers, staged as an opera with popular tunes instead of arias.',
    whyRead: 'The invention of the musical as satire — and the source Brecht rebuilt as The Threepenny Opera. Study how songs carry plot rather than pause it.',
  },
  {
    id: 'she-stoops-to-conquer',
    title: 'She Stoops to Conquer',
    author: 'Oliver Goldsmith',
    year: '1773',
    tradition: 'GEORGIAN',
    genre: 'Comedy',
    sourceId: 383,
    licenseBasis: 'Published 1773; long in the public domain.',
    blurb: 'A young man is tricked into believing a private house is an inn, and treats his prospective father-in-law as the landlord.',
    whyRead: 'A perfect sustained-misunderstanding comedy. Every laugh comes from the audience knowing exactly one fact the characters don\'t.',
  },
  {
    id: 'school-for-scandal',
    title: 'The School for Scandal',
    author: 'Richard Brinsley Sheridan',
    year: '1777',
    tradition: 'GEORGIAN',
    genre: 'Comedy of Manners',
    sourceId: 1929,
    licenseBasis: 'First performed 1777; long in the public domain.',
    blurb: 'A circle of gossips shreds reputations for sport while two brothers — one respectable, one not — are tested by a returning uncle in disguise.',
    whyRead: 'The screen scene is the most famous staging gag in English comedy and a masterclass in loading a single prop with four characters\' worth of jeopardy.',
  },
  {
    id: 'the-rivals',
    title: 'The Rivals',
    author: 'Richard Brinsley Sheridan',
    year: '1775',
    tradition: 'GEORGIAN',
    genre: 'Comedy',
    sourceId: 24761,
    licenseBasis: 'First performed 1775; long in the public domain.',
    blurb: 'A wealthy captain courts a romance-addled heiress by pretending to be a penniless ensign, and ends up his own rival.',
    whyRead: 'Mrs Malaprop gave the language a word. Beyond the jokes, it is a clean study of a character trapped by a lie they told in Act I.',
  },

  // ── German Romanticism ─────────────────────────────────────────────────────
  {
    id: 'faust-part-one',
    title: 'Faust, Part One',
    author: 'Johann Wolfgang von Goethe',
    translator: 'Bayard Taylor',
    year: '1808',
    tradition: 'GERMAN',
    genre: 'Tragedy',
    sourceId: 14591,
    licenseBasis: 'German original of 1808; Bayard Taylor\'s 1870 verse translation is public domain.',
    blurb: 'A scholar who has exhausted knowledge wagers his soul against a single moment he would want to last forever.',
    whyRead: 'The most ambitious dramatic structure in European literature, and the source of the modern "deal with the devil." The Gretchen tragedy inside it is devastating on its own terms.',
  },
  {
    id: 'wilhelm-tell',
    title: 'Wilhelm Tell',
    author: 'Friedrich Schiller',
    year: '1804',
    tradition: 'GERMAN',
    genre: 'Historical Drama',
    sourceId: 6788,
    licenseBasis: 'German original of 1804; public-domain English translation.',
    blurb: 'An occupying governor forces a marksman to shoot an apple from his son\'s head, and lights a national uprising doing it.',
    whyRead: 'A political epic that keeps a private father-and-son story at its centre — the balance every historical screenplay is trying to strike.',
  },

  // ── Ibsen & Modern Realism ─────────────────────────────────────────────────
  {
    id: 'a-dolls-house',
    title: 'A Doll\'s House',
    author: 'Henrik Ibsen',
    year: '1879',
    tradition: 'REALISM',
    genre: 'Drama',
    sourceId: 2542,
    licenseBasis: 'Norwegian original of 1879; public-domain English translation.',
    blurb: 'A wife who forged a signature years ago to save her husband\'s life discovers what he actually thinks of her when it comes out.',
    whyRead: 'The play that made the modern drama modern. Its entire architecture is a slow-release secret, and its last sound — a door closing — is the most famous ending beat in theatre.',
  },
  {
    id: 'ghosts',
    title: 'Ghosts',
    author: 'Henrik Ibsen',
    year: '1881',
    tradition: 'REALISM',
    genre: 'Drama',
    sourceId: 8121,
    licenseBasis: 'Norwegian original of 1881; public-domain English translation.',
    blurb: 'A widow builds an orphanage to honour a husband whose real life she has spent twenty years concealing.',
    whyRead: 'The clearest example of Ibsen\'s retrospective method: the play begins after the catastrophe, and the plot is the excavation of it.',
  },
  {
    id: 'hedda-gabler',
    title: 'Hedda Gabler',
    author: 'Henrik Ibsen',
    year: '1891',
    tradition: 'REALISM',
    genre: 'Drama',
    sourceId: 4093,
    licenseBasis: 'Norwegian original of 1890; public-domain English translation.',
    blurb: 'A general\'s daughter, newly married into a life she despises, starts destroying other people\'s work for something to do.',
    whyRead: 'A protagonist with no stated objective who is riveting anyway. The great study in writing a character whose motive the audience must assemble themselves.',
  },
  {
    id: 'enemy-of-the-people',
    title: 'An Enemy of the People',
    author: 'Henrik Ibsen',
    year: '1882',
    tradition: 'REALISM',
    genre: 'Drama',
    sourceId: 2446,
    licenseBasis: 'Norwegian original of 1882; public-domain English translation.',
    blurb: 'A doctor discovers the spa baths that sustain his town are contaminated, and finds the whole town would rather he hadn\'t.',
    whyRead: 'The template for every whistleblower story. Act IV\'s public meeting is a masterclass in turning an entire crowd into an antagonist.',
  },
  {
    id: 'the-wild-duck',
    title: 'The Wild Duck',
    author: 'Henrik Ibsen',
    year: '1884',
    tradition: 'REALISM',
    genre: 'Tragicomedy',
    sourceId: 73631,
    licenseBasis: 'Norwegian original of 1884; public-domain English translation.',
    blurb: 'A man determined to tell a family the truth about itself succeeds, and destroys them.',
    whyRead: 'Ibsen\'s counter-argument to his own earlier plays, and the origin of the "life-lie." Its central symbol is worked without ever being explained.',
  },
  {
    id: 'the-master-builder',
    title: 'The Master Builder',
    author: 'Henrik Ibsen',
    year: '1892',
    tradition: 'REALISM',
    genre: 'Drama',
    sourceId: 4070,
    licenseBasis: 'Norwegian original of 1892; public-domain English translation.',
    blurb: 'A successful architect, terrified of the younger generation, is goaded by a young woman into climbing his own tower.',
    whyRead: 'Realist surfaces carrying almost entirely symbolic freight. Read it for how far a naturalistic scene can be pushed before it becomes something else.',
  },

  // ── The Russian Stage ──────────────────────────────────────────────────────
  {
    id: 'the-inspector-general',
    title: 'The Inspector-General',
    author: 'Nikolai Gogol',
    year: '1836',
    tradition: 'RUSSIAN',
    genre: 'Satire / Comedy',
    sourceId: 3735,
    licenseBasis: 'Russian original of 1836; public-domain English translation.',
    blurb: 'A corrupt provincial town mistakes a penniless clerk for a government inspector travelling incognito, and bribes him lavishly.',
    whyRead: 'The definitive mistaken-identity satire, and the source of the closing silent tableau — proof that a play can land its hardest blow with no dialogue at all.',
  },
  {
    id: 'the-seagull',
    title: 'The Sea-Gull',
    author: 'Anton Chekhov',
    year: '1896',
    tradition: 'RUSSIAN',
    genre: 'Drama',
    sourceId: 1754,
    licenseBasis: 'Russian original of 1896; public-domain English translation.',
    blurb: 'On a country estate, a young writer, his actress mother, her famous lover and the girl who wants to be an actress all want someone who wants someone else.',
    whyRead: 'The founding text of subtext. Nobody says what they mean and the play is entirely legible anyway — the single most useful thing a dialogue writer can study.',
  },
  {
    id: 'uncle-vanya',
    title: 'Uncle Vanya',
    author: 'Anton Chekhov',
    year: '1897',
    tradition: 'RUSSIAN',
    genre: 'Drama',
    sourceId: 1756,
    licenseBasis: 'Russian original of 1897; public-domain English translation.',
    blurb: 'A man who has spent his life managing an estate for a brother-in-law he now realises is a fraud tries, badly, to shoot him.',
    whyRead: 'A play in which the climactic act of violence fails and everyone simply goes back to work. Study how Chekhov generates devastation out of non-events.',
  },
  {
    id: 'chekhov-second-series',
    title: 'The Cherry Orchard · Three Sisters & other plays',
    author: 'Anton Chekhov',
    translator: 'Julius West',
    year: '1888–1904',
    tradition: 'RUSSIAN',
    genre: 'Drama / One-Acts',
    sourceId: 7986,
    licenseBasis: 'Russian originals; public-domain English translations.',
    blurb: 'Chekhov\'s second collected series — The Cherry Orchard and The Three Sisters alongside the great farces The Bear, The Proposal and The Wedding.',
    whyRead: 'The full range in one volume: the late masterpieces of ensemble drift plus the tightest one-act comic writing he ever did. Read the farces to see the same ear working at speed.',
  },
  {
    id: 'the-lower-depths',
    title: 'The Lower Depths',
    author: 'Maxim Gorky',
    year: '1902',
    tradition: 'RUSSIAN',
    genre: 'Drama',
    sourceId: 52468,
    licenseBasis: 'Russian original of 1902; public-domain English translation.',
    blurb: 'The residents of a cellar flophouse — a thief, a baron, an actor, a dying woman — argue about whether a comforting lie is better than the truth.',
    whyRead: 'An ensemble play with no protagonist that never loses focus. The model for the single-location, many-voices script.',
  },

  // ── Scandinavian Modernism ─────────────────────────────────────────────────
  {
    id: 'strindberg-plays',
    title: 'The Father · Miss Julie · The Outlaw · The Stronger',
    author: 'August Strindberg',
    translator: 'Edith and Warner Oland',
    year: '1887–1889',
    tradition: 'NORDIC',
    genre: 'Naturalist Drama',
    sourceId: 8499,
    licenseBasis: 'Swedish originals of the 1880s; public-domain English translations.',
    blurb: 'Four plays including Miss Julie — a midsummer night in which a count\'s daughter and her father\'s valet destroy each other across a single kitchen.',
    whyRead: 'Miss Julie is the purest two-hander power-reversal ever written. The Stronger is a duologue in which one character never speaks — and wins.',
  },

  // ── Wilde & Shaw ───────────────────────────────────────────────────────────
  {
    id: 'importance-of-being-earnest',
    title: 'The Importance of Being Earnest',
    author: 'Oscar Wilde',
    year: '1895',
    tradition: 'WILDE_SHAW',
    genre: 'Comedy',
    sourceId: 844,
    licenseBasis: 'First performed 1895; long in the public domain.',
    blurb: 'Two men each invent a fictitious relative to escape their obligations, and are found out by the women they are courting.',
    whyRead: 'The most efficiently funny script in English. Almost every line is both a joke and a plot move — the standard to measure comic dialogue against.',
  },
  {
    id: 'lady-windermeres-fan',
    title: 'Lady Windermere\'s Fan',
    author: 'Oscar Wilde',
    year: '1892',
    tradition: 'WILDE_SHAW',
    genre: 'Comedy / Drama',
    sourceId: 790,
    licenseBasis: 'First performed 1892; long in the public domain.',
    blurb: 'A young wife, convinced her husband is keeping a mistress, nearly ruins herself — saved by the woman she despises.',
    whyRead: 'A textbook use of a physical object as the plot\'s spine. Everything turns on where the fan is and who saw it there.',
  },
  {
    id: 'salome',
    title: 'Salomé',
    author: 'Oscar Wilde',
    translator: 'Lord Alfred Douglas',
    year: '1893',
    tradition: 'WILDE_SHAW',
    genre: 'Symbolist Tragedy',
    sourceId: 42704,
    licenseBasis: 'French original of 1893; public-domain English translation.',
    blurb: 'Salomé dances for Herod and asks for the head of the prophet who refused to look at her.',
    whyRead: 'Wilde with the wit removed — incantatory, repetitive, hypnotic. Proof that a distinct dialogue register can carry a whole one-act on rhythm alone.',
  },
  {
    id: 'pygmalion',
    title: 'Pygmalion',
    author: 'Bernard Shaw',
    year: '1913',
    tradition: 'WILDE_SHAW',
    genre: 'Comedy',
    sourceId: 3825,
    licenseBasis: 'First performed 1913; the Gutenberg text is in the public domain.',
    blurb: 'A phonetics professor bets he can pass a Covent Garden flower girl off as a duchess in six months, and does not think about what happens after.',
    whyRead: 'The makeover story\'s origin, and much harder than its musical descendants. Shaw\'s stage directions are essays — read them for how to write character on the page.',
  },
  {
    id: 'arms-and-the-man',
    title: 'Arms and the Man',
    author: 'Bernard Shaw',
    year: '1894',
    tradition: 'WILDE_SHAW',
    genre: 'Comedy',
    sourceId: 3618,
    licenseBasis: 'First performed 1894; long in the public domain.',
    blurb: 'A fleeing soldier who carries chocolates instead of ammunition climbs into a young woman\'s bedroom and dismantles her romance about war.',
    whyRead: 'A comedy built by systematically puncturing the genre it lives in. The cleanest example of a play whose engine is deflation.',
  },
  {
    id: 'man-and-superman',
    title: 'Man and Superman',
    author: 'Bernard Shaw',
    year: '1903',
    tradition: 'WILDE_SHAW',
    genre: 'Comedy / Philosophy',
    sourceId: 3328,
    licenseBasis: 'Published 1903; long in the public domain.',
    blurb: 'A confirmed radical is pursued by a woman who has already decided to marry him — with a dream sequence in hell embedded in the third act.',
    whyRead: 'A conventional romantic comedy with a philosophical dream-play inserted into it. Instructive on how much structural risk an audience will absorb.',
  },
  {
    id: 'major-barbara',
    title: 'Major Barbara',
    author: 'Bernard Shaw',
    year: '1905',
    tradition: 'WILDE_SHAW',
    genre: 'Drama / Comedy',
    sourceId: 3790,
    licenseBasis: 'First performed 1905; long in the public domain.',
    blurb: 'A Salvation Army major discovers her shelter is funded by whisky and her father\'s armaments fortune.',
    whyRead: 'The great argument play, and scrupulously fair to the side it disagrees with. The model for writing an antagonist who might be right.',
  },
  {
    id: 'caesar-and-cleopatra',
    title: 'Caesar and Cleopatra',
    author: 'Bernard Shaw',
    year: '1898',
    tradition: 'WILDE_SHAW',
    genre: 'Historical Comedy',
    sourceId: 3329,
    licenseBasis: 'Published 1901; long in the public domain.',
    blurb: 'An ageing, ironic Caesar finds a frightened teenage Cleopatra hiding in the paws of the Sphinx and teaches her to rule.',
    whyRead: 'Deliberate anti-epic: history written as a mentor comedy. Useful for anyone trying to make a period figure speak like a person.',
  },

  // ── The Irish Revival ──────────────────────────────────────────────────────
  {
    id: 'riders-to-the-sea',
    title: 'Riders to the Sea',
    author: 'J. M. Synge',
    year: '1904',
    tradition: 'IRISH',
    genre: 'Tragedy (One Act)',
    sourceId: 994,
    licenseBasis: 'First performed 1904; long in the public domain.',
    blurb: 'On the Aran Islands, a mother who has lost husband and sons to the sea loses the last of them.',
    whyRead: 'Arguably the most perfect one-act in English — twenty minutes, one room, total inevitability. Read it in one sitting and study the shape.',
  },
  {
    id: 'playboy-of-the-western-world',
    title: 'The Playboy of the Western World',
    author: 'J. M. Synge',
    year: '1907',
    tradition: 'IRISH',
    genre: 'Comedy',
    sourceId: 1240,
    licenseBasis: 'First performed 1907; long in the public domain.',
    blurb: 'A young man arrives in a Mayo village claiming to have killed his father, and is celebrated as a hero — until his father turns up.',
    whyRead: 'The most musical vernacular dialogue ever set down, and a ruthless study of how a community builds a myth and then punishes it.',
  },
  {
    id: 'yeats-unicorn',
    title: 'The Unicorn from the Stars and Other Plays',
    author: 'W. B. Yeats',
    translator: 'with Lady Gregory',
    year: '1908',
    tradition: 'IRISH',
    genre: 'Verse & Symbolist Drama',
    sourceId: 26144,
    licenseBasis: 'Published 1908; long in the public domain.',
    blurb: 'Three Abbey Theatre plays, including Cathleen ni Houlihan — the short, incendiary piece in which an old woman turns out to be Ireland.',
    whyRead: 'Poetic drama that still plays. Cathleen ni Houlihan does its entire transformation in a single reported line offstage — a lesson in restraint.',
  },

  // ── European Modernism ─────────────────────────────────────────────────────
  {
    id: 'cyrano-de-bergerac',
    title: 'Cyrano de Bergerac',
    author: 'Edmond Rostand',
    translator: 'Gladys Thomas & Mary F. Guillemard',
    year: '1897',
    tradition: 'EUROPEAN_MODERN',
    genre: 'Romantic Drama',
    sourceId: 1254,
    licenseBasis: 'French original of 1897; public-domain English translation.',
    blurb: 'A brilliant, self-loathing swordsman-poet writes the love letters that win his own beloved for a handsomer, duller man.',
    whyRead: 'The balcony scene is the finest piece of ventriloquised romance ever staged, and the last act shows how to earn a sentimental ending honestly.',
  },
  {
    id: 'the-blue-bird',
    title: 'The Blue Bird',
    author: 'Maurice Maeterlinck',
    translator: 'Alexander Teixeira de Mattos',
    year: '1908',
    tradition: 'EUROPEAN_MODERN',
    genre: 'Symbolist Fantasy',
    sourceId: 8606,
    licenseBasis: 'French original of 1908; public-domain English translation.',
    blurb: 'Two children are sent through the Land of Memory, the Palace of Night and the Kingdom of the Future to find the Blue Bird of happiness.',
    whyRead: 'A fully realised fantasy world built for the stage in 1908 — a study in how a quest structure can hold a sequence of standalone set-pieces together.',
  },
  {
    id: 'pirandello-three-plays',
    title: 'Six Characters in Search of an Author & Other Plays',
    author: 'Luigi Pirandello',
    year: '1917–1922',
    tradition: 'EUROPEAN_MODERN',
    genre: 'Metatheatre',
    sourceId: 42148,
    licenseBasis: 'Italian originals; the Gutenberg English edition is public domain.',
    blurb: 'Three plays, led by the one in which six unfinished characters interrupt a rehearsal and demand that their story be completed.',
    whyRead: 'The founding text of metafiction on stage — every film about films that turns its own machinery into the story descends from it.',
  },

  // ── The American Stage ─────────────────────────────────────────────────────
  {
    id: 'glaspell-plays',
    title: 'Trifles & Other Plays',
    author: 'Susan Glaspell',
    year: '1916–1920',
    tradition: 'AMERICAN',
    genre: 'Drama / One-Acts',
    sourceId: 59432,
    licenseBasis: 'Published 1920; long in the public domain.',
    blurb: 'Glaspell\'s collected plays, led by Trifles — two women piece together a murder in a farmhouse kitchen while the men search the rest of the house and find nothing.',
    whyRead: 'Trifles is the great short course in visual storytelling: the entire case is made out of props, and the accused never appears.',
  },
  {
    id: 'rachel',
    title: 'Rachel',
    author: 'Angelina Weld Grimké',
    year: '1916',
    tradition: 'AMERICAN',
    genre: 'Drama',
    sourceId: 65112,
    licenseBasis: 'Published 1920; long in the public domain.',
    blurb: 'A young Black woman in the North learns how her father and brother died in the South, and decides she will never bring a child into that country.',
    whyRead: 'One of the first plays by a Black American woman to be professionally staged. A domestic drama whose quiet register makes its argument land harder.',
  },
  {
    id: 'beyond-the-horizon',
    title: 'Beyond the Horizon',
    author: 'Eugene O\'Neill',
    year: '1920',
    tradition: 'AMERICAN',
    genre: 'Tragedy',
    sourceId: 58569,
    licenseBasis: 'Published 1920; long in the public domain.',
    blurb: 'Two brothers swap the lives they were meant for — the dreamer stays on the farm, the farmer goes to sea — and both are ruined by it.',
    whyRead: 'O\'Neill\'s first Pulitzer and the arrival of serious American tragedy. Its structure alternates interiors and horizons scene by scene — the theme built into the floor plan.',
  },
  {
    id: 'anna-christie',
    title: 'Anna Christie',
    author: 'Eugene O\'Neill',
    year: '1921',
    tradition: 'AMERICAN',
    genre: 'Drama',
    sourceId: 4025,
    licenseBasis: 'Published 1922; long in the public domain.',
    blurb: 'A woman with a past she has not told anyone comes to live with the barge-captain father who abandoned her.',
    whyRead: 'A confession scene so well prepared that it detonates three acts of build in a page. Also the best example of O\'Neill writing dialect without losing the ear.',
  },
  {
    id: 'abraham-lincoln-play',
    title: 'Abraham Lincoln: A Play',
    author: 'John Drinkwater',
    year: '1918',
    tradition: 'AMERICAN',
    genre: 'Historical Drama',
    sourceId: 11172,
    licenseBasis: 'Published 1918; long in the public domain.',
    blurb: 'Six scenes from Lincoln\'s life, from the nomination to Ford\'s Theatre, each framed by a spoken chorus.',
    whyRead: 'The biopic problem solved in 1918: don\'t dramatise a life, dramatise six decisions. Essential for anyone structuring a historical screenplay.',
  },
];

export const PUBLIC_DOMAIN_SCRIPTS: PublicDomainScript[] = SEEDS.map(s => ({
  ...s,
  form: s.form ?? 'STAGE_PLAY',
  license: GUTENBERG,
  ...pg(s.sourceId),
}));

export const getPublicDomainScript = (id: string): PublicDomainScript | undefined =>
  PUBLIC_DOMAIN_SCRIPTS.find(s => s.id === id);

export const scriptsByTradition = (): { tradition: Tradition; scripts: PublicDomainScript[] }[] =>
  TRADITIONS
    .map(tradition => ({ tradition, scripts: PUBLIC_DOMAIN_SCRIPTS.filter(s => s.tradition === tradition.id) }))
    .filter(g => g.scripts.length > 0);
