/**
 * loreaLiteraryPantheon.ts
 *
 * The Lorea Pantheon of Legendary Authors, Philosophers, Poets, Songwriters,
 * Playwrights, Screenwriters, and Manga / Comic Legends.
 *
 * Powers:
 *  1. The Rotating Hero Background Portrait & Illustrated Stage at the top of Lorea (`BookTab.tsx`).
 *  2. The Interwoven Literary History, Biographies & Master Craft Teachings section on Lorea
 *     (paralleling Chora & Taleo's History Moments & Conservatory experience).
 *  3. Direct 1-click links to read their works on the platform (including Plato, Aristotle,
 *     Marcus Aurelius, Sun Tzu, Jane Austen, Bram Stoker, Mary Shelley, Homer, Shakespeare,
 *     Sophocles, Edgar Allan Poe, and Sequential Art / Screenwriting studios).
 */

export type LiteraryDiscipline =
  | 'PHILOSOPHY'
  | 'NOVELIST'
  | 'POET_SONGWRITER'
  | 'PLAYWRIGHT_SCREENWRITER'
  | 'MANGA_COMIC_LEGEND';

export interface LoreaPantheonMaster {
  id: string;
  name: string;
  epithet: string;
  lifespan: string;
  era: string;
  discipline: LiteraryDiscipline;
  disciplineLabel: string;
  accentColor: string;
  secondaryColor: string;
  /** Public-domain Wikimedia Commons portrait URL */
  portraitUrl: string;
  /** Historical & literary biography */
  bio: string;
  /** Immortal signature quote */
  quote: string;
  /** Actionable craft teaching for writers on Plajah ("The Master's Craft Lesson") */
  craftTitle: string;
  craftPrinciple: string;
  craftExercise: string;
  /** Key works available or celebrated on Lorea */
  keyWorks: Array<{
    title: string;
    year: string;
    gutenbergId?: number;
    choraBookId?: string;
    note: string;
  }>;
  /** Primary platform action */
  primaryBookGutenbergId?: number;
  choraScoreBookId?: string;
  studioTarget?: 'WRITERS_DESK' | 'SCRIPT_STUDIO' | 'COMIC_MUSEUM' | 'COMIC_STUDIO';
  /** Visual motif kind for the bespoke hero stage SVG layer */
  motif: 'athens-cave' | 'lyceum-theater' | 'regency-estate' | 'gothic-abbey' | 'manga-cinema' | 'cosmic-panels' | 'globe-stage' | 'bardic-lyre' | 'stoic-column' | 'bamboo-scroll';
}

export const LOREA_DISCIPLINE_FILTERS: Array<{ id: 'ALL' | LiteraryDiscipline; label: string; shortLabel: string }> = [
  { id: 'ALL', label: 'All Literary & Visual Masters', shortLabel: 'All Masters' },
  { id: 'PHILOSOPHY', label: 'Philosophers & Sages (Plato · Aristotle · Stoics)', shortLabel: 'Philosophers' },
  { id: 'NOVELIST', label: 'Legendary Novelists', shortLabel: 'Novelists' },
  { id: 'POET_SONGWRITER', label: 'Poets & Lyric Songwriters', shortLabel: 'Poets & Songwriters' },
  { id: 'PLAYWRIGHT_SCREENWRITER', label: 'Playwrights & Screenwriters', shortLabel: 'Playwrights & Screen' },
  { id: 'MANGA_COMIC_LEGEND', label: 'Manga & Comic Legends', shortLabel: 'Manga & Comics' },
];

export const LOREA_PANTHEON_MASTERS: LoreaPantheonMaster[] = [
  {
    id: 'plato',
    name: 'Plato',
    epithet: 'Founder of the Athenian Academy & Master of the Philosophical Dialogue',
    lifespan: '427 – 347 BCE',
    era: 'Classical Athens',
    discipline: 'PHILOSOPHY',
    disciplineLabel: 'Philosopher & Dramatist of Ideas',
    accentColor: '#F59E0B',
    secondaryColor: '#38BDF8',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Plato_Silanion_Musei_Capitolini_MC1377.jpg/480px-Plato_Silanion_Musei_Capitolini_MC1377.jpg',
    bio: 'Born into an aristocratic Athenian family during the Peloponnesian War, Plato began as a young tragic poet before burning his manuscripts upon hearing Socrates speak in the Agora. Yet Plato never abandoned drama: instead, he invented the Socratic Dialogue—turning abstract metaphysics, ethics, politics, and eros into living theater where real Athenians clash, joke, falter, and awaken. In 387 BCE he founded the Academy in Athens, the prototype of the modern university, where his student Aristotle studied for twenty years.',
    quote: 'Human behavior flows from three main sources: desire, emotion, and knowledge.',
    craftTitle: 'The Socratic Dialectic & The Allegory of the Cave',
    craftPrinciple: 'Never hand the reader a finished thesis. Place two characters with incompatible worldviews in a vivid room—a banquet in Symposium, a harbor house in The Republic—and let truth emerge through questioning (elenchus) and unforgettable visual allegory.',
    craftExercise: 'Write a two-page dialogue where a mentor never states their belief directly, but asks five questions that force the protagonist to discover the flaw in their own ambition.',
    keyWorks: [
      { title: 'The Republic', year: 'c. 375 BCE', gutenbergId: 1497, note: 'Justice, the Philosopher-King & the Allegory of the Cave (Book VII)' },
      { title: 'Symposium', year: 'c. 385 BCE', gutenbergId: 1600, note: 'Banquet speeches on Eros & Diotima’s Ladder of Beauty' },
      { title: 'Apology, Crito & Phaedo', year: 'c. 399 BCE', gutenbergId: 1656, note: 'The trial, conscience, and final hours of Socrates' },
    ],
    primaryBookGutenbergId: 1497,
    studioTarget: 'WRITERS_DESK',
    motif: 'athens-cave',
  },
  {
    id: 'aristotle',
    name: 'Aristotle',
    epithet: 'Architect of Dramatic Theory (Poetics), Logic & Virtue Ethics',
    lifespan: '384 – 322 BCE',
    era: 'Classical Greece · The Lyceum',
    discipline: 'PHILOSOPHY',
    disciplineLabel: 'Philosopher & First Theorist of Storytelling',
    accentColor: '#38BDF8',
    secondaryColor: '#FBBF24',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Aristotle_Altemps_Inv8575.jpg/480px-Aristotle_Altemps_Inv8575.jpg',
    bio: 'Student of Plato for twenty years, tutor to Alexander the Great, and founder of the Peripatetic school at the Lyceum in Athens, Aristotle mapped virtually every domain of human inquiry—from biology and logic to ethics, politics, rhetoric, and dramatic art. His Poetics remains the single most influential manual of storytelling ever written, defining Plot (Mythos), Character (Ethos), Reversal (Peripeteia), Recognition (Anagnorisis), and Emotional Purgation (Catharsis) for novelists, playwrights, and Hollywood screenwriters alike.',
    quote: 'Character is revealed through moral choice under pressure—where it is not obvious what a person will choose.',
    craftTitle: 'Peripeteia (Reversal) + Anagnorisis (Recognition) = Catharsis',
    craftPrinciple: 'In Poetics, Aristotle teaches that the most powerful dramatic climax occurs when the external reversal of fortune (Peripeteia) happens at the exact same instant as the protagonist’s internal awakening to truth (Anagnorisis), connected by "probable or necessary" cause and effect rather than coincidence.',
    craftExercise: 'Map your story’s climax so that the very action the hero takes to prevent their greatest fear becomes the exact mechanism that forces them to confront who they truly are.',
    keyWorks: [
      { title: 'Poetics', year: 'c. 335 BCE', gutenbergId: 1974, note: 'The foundational blueprint of plot structure, tragedy, and dramatic catharsis' },
      { title: 'The Nicomachean Ethics', year: 'c. 340 BCE', gutenbergId: 8438, note: 'Eudaimonia (human flourishing), the Golden Mean, and moral character' },
      { title: 'Politics', year: 'c. 335 BCE', gutenbergId: 6762, note: 'Civic partnership, constitutions, and the polis' },
    ],
    primaryBookGutenbergId: 1974,
    studioTarget: 'SCRIPT_STUDIO',
    motif: 'lyceum-theater',
  },
  {
    id: 'jane-austen',
    name: 'Jane Austen',
    epithet: 'Pioneer of Free Indirect Discourse & Regency Social Wit',
    lifespan: '1775 – 1817',
    era: 'Regency England',
    discipline: 'NOVELIST',
    disciplineLabel: 'Novelist & Architect of Modern Interiority',
    accentColor: '#34D399',
    secondaryColor: '#FBBF24',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/CassandraAusten-JaneAusten%28c.1810%29_hires.jpg/480px-CassandraAusten-JaneAusten%28c.1810%29_hires.jpg',
    bio: 'Writing on a small mahogany portable desk in Hampshire drawing rooms while her family came and went, Jane Austen revolutionized the novel. On what she playfully called her "little bit (two inches wide) of Ivory," she perfected Free Indirect Discourse—allowing a third-person narrator to slip invisibly inside a heroine’s biased thoughts so the reader experiences both Elizabeth Bennet’s sparkling conviction and her blind prejudice at once.',
    quote: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    craftTitle: 'Free Indirect Discourse & The Irony of Self-Deception',
    craftPrinciple: 'Instead of tagging thoughts with "she thought," tint the third-person narration itself with the character’s vocabulary and blind spots. Let the gap between how a character judges the room and what the room actually reveals generate effortless comedic and romantic tension.',
    craftExercise: 'Rewrite a scene of a Misunderstanding in third person, but colour every adjective with your protagonist’s secret bias—without once writing "she felt" or "he believed."',
    keyWorks: [
      { title: 'Pride and Prejudice', year: '1813', gutenbergId: 1342, choraBookId: 'pride-and-prejudice', note: 'Features full 6-Movement Chora DAW Orchestral + MPE Film Score' },
      { title: 'Sense and Sensibility', year: '1811', gutenbergId: 161, note: 'Elinor and Marianne Dashwood — restraint vs. romantic passion' },
      { title: 'Emma', year: '1815', gutenbergId: 158, note: 'Masterclass in an unreliable yet deeply lovable protagonist' },
    ],
    primaryBookGutenbergId: 1342,
    choraScoreBookId: 'pride-and-prejudice',
    studioTarget: 'WRITERS_DESK',
    motif: 'regency-estate',
  },
  {
    id: 'osamu-tezuka',
    name: 'Osamu Tezuka',
    epithet: 'The Godfather of Manga & Pioneer of Cinematic Decompression',
    lifespan: '1928 – 1989',
    era: 'Shōwa Manga Revolution',
    discipline: 'MANGA_COMIC_LEGEND',
    disciplineLabel: 'Manga Legend & Sequential Filmmaker',
    accentColor: '#EC4899',
    secondaryColor: '#22D3EE',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Osamu_Tezuka_1951_Scan10008-2.JPG/480px-Osamu_Tezuka_1951_Scan10008-2.JPG',
    bio: 'A licensed medical doctor who drew over 150,000 pages across 700 manga volumes, Osamu Tezuka transformed postwar Japanese comics from four-panel newspaper gags into sweeping literary cinema. Inspired by German Expressionist film and Walt Disney animation, Tezuka broke open the page grid in New Treasure Island (1947), Astro Boy, and his life’s masterwork Phoenix (Hi no Tori), introducing cinematic camera angles, motion lines, and emotional decompression that birthed modern manga and anime.',
    quote: 'Comics are an international language that can cross every border, speaking directly from one human heart to another.',
    craftTitle: 'Cinematic Panel Decompression & The Star System',
    craftPrinciple: 'Do not crowd ten actions into one stiff stage-play panel. Decompress a single emotional beat across four to six panels—a close-up of trembling eyes, a silent environmental cut, a low-angle shadow—controlling time itself through panel width and gutter spacing.',
    craftExercise: 'In Lorea’s Comic & Manga Studio, take a single moment of realization and stage it across 5 silent panels before a single speech balloon appears—keeping all balloons docked in perimeter negative space away from the eyes.',
    keyWorks: [
      { title: 'Astro Boy (Tetsuwan Atom)', year: '1952', note: 'Defined modern shōnen storytelling and the soul of artificial life' },
      { title: 'Phoenix (Hi no Tori)', year: '1954–1988', note: 'Philosophical cosmos-spanning epic of reincarnation across past and future' },
      { title: 'Buddha & Adolf', year: '1972 / 1983', note: 'Proved manga could rival the greatest historical and philosophical novels' },
    ],
    studioTarget: 'COMIC_MUSEUM',
    motif: 'manga-cinema',
  },
  {
    id: 'william-shakespeare',
    name: 'William Shakespeare',
    epithet: 'The Bard of Avon — Supreme Playwright & Poet of the Human Soul',
    lifespan: '1564 – 1616',
    era: 'Elizabethan & Jacobean Era',
    discipline: 'PLAYWRIGHT_SCREENWRITER',
    disciplineLabel: 'Playwright, Poet & Dramatic Architect',
    accentColor: '#A855F7',
    secondaryColor: '#F59E0B',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Shakespeare.jpg/480px-Shakespeare.jpg',
    bio: 'From the wooden O of the Globe Theatre on the south bank of the Thames, William Shakespeare coined over 1,700 words and forged 38 plays and 154 sonnets that permanently expanded the emotional bandwidth of human consciousness. Whether staging the existential paralysis of Hamlet, the star-crossed lyricism of Romeo and Juliet, or the vaulting ambition of Macbeth, Shakespeare turned stage soliloquy into the first modern psychological close-up.',
    quote: 'All the world’s a stage, and all the men and women merely players.',
    craftTitle: 'The Soliloquy as Active Psychological Combat & Rhythmic Fracture',
    craftPrinciple: 'A great monologue is never a passive report of how a character feels; it is an active debate where the character tries to convince themselves of a dangerous choice in real time. When a character’s mind is calm, their rhythm is steady iambic pentameter; when terror or passion strikes, break the meter mid-line.',
    craftExercise: 'Write a 12-line monologue in the Script Studio where a character begins defending a lie and, by line 8, realizes the cost of that lie—marking the exact word where their rhythm breaks.',
    keyWorks: [
      { title: 'Hamlet, Prince of Denmark', year: 'c. 1600', gutenbergId: 1524, note: 'The pinnacle of psychological tragedy and interior soliloquy' },
      { title: 'Romeo and Juliet', year: 'c. 1595', gutenbergId: 1513, note: 'Tragic lyricism where lovers speak a shared sonnet on first meeting' },
    ],
    primaryBookGutenbergId: 1524,
    studioTarget: 'SCRIPT_STUDIO',
    motif: 'globe-stage',
  },
  {
    id: 'bram-stoker',
    name: 'Bram Stoker',
    epithet: 'Master of Gothic Epistolary Suspense & Theatrical Atmosphere',
    lifespan: '1847 – 1912',
    era: 'Victorian Gothic',
    discipline: 'NOVELIST',
    disciplineLabel: 'Gothic Novelist & Theatrical Impresario',
    accentColor: '#F43F5E',
    secondaryColor: '#A855F7',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Bram_Stoker_1906.jpg/480px-Bram_Stoker_1906.jpg',
    bio: 'For twenty-seven years, Abraham "Bram" Stoker managed Sir Henry Irving’s legendary Lyceum Theatre in London—immersing himself in stage lighting, operatic pacing, and Shakespearean tragedy by night while researching Carpathian folklore and maritime logs at the Whitby library by day. In Dracula (1897), he fused Victorian technology—phonograph cylinders, shorthand diaries, telegraph cables—with ancient mythic terror.',
    quote: 'Listen to them—the children of the night. What music they make!',
    craftTitle: 'Found-Document Polyphony & The Off-Stage Monster',
    craftPrinciple: 'Dracula himself has shockingly few scenes on the page; his terror grows because we piece together his shadow across incompatible first-person documents—a solicitor’s diary, a ship captain’s log, a doctor’s phonograph recording—where the reader connects the dread before the characters do.',
    craftExercise: 'Tell a suspenseful event through three contrasting artifacts: an official report, a private voice note, and an unsent letter.',
    keyWorks: [
      { title: 'Dracula', year: '1897', gutenbergId: 345, choraBookId: 'dracula', note: 'Features full 6-Movement Chora DAW Gothic Symphonic + MPE Film Score' },
    ],
    primaryBookGutenbergId: 345,
    choraScoreBookId: 'dracula',
    studioTarget: 'WRITERS_DESK',
    motif: 'gothic-abbey',
  },
  {
    id: 'mary-shelley',
    name: 'Mary Shelley',
    epithet: 'Mother of Science Fiction & The Modern Prometheus',
    lifespan: '1797 – 1851',
    era: 'Romanticism',
    discipline: 'NOVELIST',
    disciplineLabel: 'Speculative Novelist & Philosophical Visionary',
    accentColor: '#06B6D4',
    secondaryColor: '#10B981',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Mary_Wollstonecraft_Shelley_Rothwell.tif/lossy-page1-480px-Mary_Wollstonecraft_Shelley_Rothwell.tif.jpg',
    bio: 'Daughter of feminist philosopher Mary Wollstonecraft and political theorist William Godwin, Mary Shelley was only eighteen when a volcanic summer on Lake Geneva challenged her to write a ghost story. Instead, she invented modern science fiction. By replacing supernatural demons with galvanic laboratory ambition—and giving the abandoned Creature an education in Milton’s Paradise Lost and Plutarch—she turned a gothic nightmare into an enduring philosophical inquiry into creation and empathy.',
    quote: 'Beware; for I am fearless, and therefore powerful.',
    craftTitle: 'Concentric Narrative Framing & Giving the Antagonist the Moral Microphone',
    craftPrinciple: 'Structure Frankenstein like Russian nesting dolls: Captain Walton’s letters enclose Victor’s confession, which at the icy summit of Mont Blanc encloses the Creature’s own eloquent autobiography—forcing the reader to feel the outcast’s loneliness from the inside out.',
    craftExercise: 'Write a chapter from the direct first-person perspective of the force or rival your protagonist fears most, granting them complete philosophical dignity.',
    keyWorks: [
      { title: 'Frankenstein; or, The Modern Prometheus', year: '1818', gutenbergId: 84, choraBookId: 'frankenstein', note: 'Features full 6-Movement Chora DAW Romantic-Alchemical Film Score' },
    ],
    primaryBookGutenbergId: 84,
    choraScoreBookId: 'frankenstein',
    studioTarget: 'WRITERS_DESK',
    motif: 'gothic-abbey',
  },
  {
    id: 'homer',
    name: 'Homer',
    epithet: 'First Bard of Epic Poetry — The Odyssey & The Iliad',
    lifespan: 'c. 8th Century BCE',
    era: 'Archaic Greece',
    discipline: 'POET_SONGWRITER',
    disciplineLabel: 'Epic Poet & Oral Bard',
    accentColor: '#F59E0B',
    secondaryColor: '#0EA5E9',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Homer_British_Museum.jpg/480px-Homer_British_Museum.jpg',
    bio: 'Chanted to the accompaniment of the phorminx lyre across Aegean halls, the Homeric epics stand at the dawn of world literature. Rather than recounting the Trojan War from year one to year ten in linear monotony, Homer’s Iliad plunges into a single fifty-day eruption of Achilles’ wrath, while The Odyssey weaves non-linear flashbacks, monsters, and domestic longing into the archetype of every homeward journey.',
    quote: 'Tell me, Muse, of that man of many turns, who wandered far and wide after he had sacked the sacred citadel of Troy.',
    craftTitle: 'In Medias Res (Into the Middle of Things) & The Epic Simile',
    craftPrinciple: 'Begin your epic at the moment of maximum human fracture, then fold the past inside present action. Anchor mythic or larger-than-life battles by comparing them to intimate, everyday sensory images—a blacksmith plunging bronze into cold water, or a parent shielding a child.',
    craftExercise: 'Open a story in the middle of a decisive crisis, and use one extended sensory simile drawn from ordinary craft or nature to make the stakes visceral.',
    keyWorks: [
      { title: 'The Odyssey', year: 'c. 725 BCE', gutenbergId: 1727, choraBookId: 'the-odyssey', note: 'Features full 6-Movement Aegean Epic Symphonic + MPE Film Score' },
      { title: 'The Iliad', year: 'c. 750 BCE', gutenbergId: 6130, note: 'The wrath of Achilles and the tragedy of Hector before the walls of Troy' },
    ],
    primaryBookGutenbergId: 1727,
    choraScoreBookId: 'the-odyssey',
    studioTarget: 'WRITERS_DESK',
    motif: 'bardic-lyre',
  },
  {
    id: 'will-eisner-jack-kirby',
    name: 'Will Eisner & Jack Kirby',
    epithet: 'Architects of Sequential Art, Graphic Novels & Cosmic Comic Kineticism',
    lifespan: '1917 – 2005 / 1917 – 1994',
    era: 'Golden Age to Graphic Novel Era',
    discipline: 'MANGA_COMIC_LEGEND',
    disciplineLabel: 'Comic & Graphic Novel Pioneers',
    accentColor: '#22D3EE',
    secondaryColor: '#F97316',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Will_Eisner_1982.jpg/480px-Will_Eisner_1982.jpg',
    bio: 'Born the same year in New York City tenements, Will Eisner and Jack Kirby defined the two twin poles of Western sequential art. Eisner coined the term "Sequential Art," dissolved rigid panel borders into rain-soaked noir architecture in The Spirit, and pioneered the literary graphic novel with A Contract with God (1978). Kirby ("The King") invented visual mythic scale—extreme foreshortening, double-page splash compositions, and "Kirby Krackle" cosmic energy.',
    quote: 'The regimen of art and the regimen of literature become interwoven in sequential art.',
    craftTitle: 'The Page as Meta-Panel & The 5 Non-Negotiable Lettering Safe-Zone Rules',
    craftPrinciple: 'Treat the entire page as a unified stage where panel borders can become windows, doorways, or falling rain—and honour the sacred visual contract of lettering: speech balloons dock into perimeter negative space or gutter rails with directional tails, NEVER occluding a character’s eyes, mouth, or central physical action corridor.',
    craftExercise: 'Open the Comic Studio and design a 4-panel sequence where panel shapes reflect claustrophobia vs. liberation, keeping 100% of facial expressions and action corridors unobstructed.',
    keyWorks: [
      { title: 'Comics and Sequential Art / A Contract with God', year: '1978 / 1985', note: 'Eisner’s foundational grammar of visual narrative & expressive anatomy' },
      { title: 'The Fourth World & Cosmic Mythos', year: '1970', note: 'Kirby’s masterwork of operatic scale and dynamic foreshortening' },
    ],
    studioTarget: 'COMIC_STUDIO',
    motif: 'cosmic-panels',
  },
  {
    id: 'marcus-aurelius',
    name: 'Marcus Aurelius',
    epithet: 'The Philosopher-Emperor & Voice of Stoic Inner Citadel',
    lifespan: '121 – 180 CE',
    era: 'Roman Stoicism',
    discipline: 'PHILOSOPHY',
    disciplineLabel: 'Stoic Philosopher',
    accentColor: '#EAB308',
    secondaryColor: '#6366F1',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/MSR-ra-61-b-1-DM.jpg/480px-MSR-ra-61-b-1-DM.jpg',
    bio: 'While commanding Roman legions along the frozen Danube frontier during plague and war, Emperor Marcus Aurelius wrote twelve books of private Greek notes titled simply "To Himself" (now known as Meditations). Never intended for publication, they represent the purest form of reflective writing in human history: the most powerful man on earth reminding himself every night of his mortality, his duty to fellow human beings, and the stillness of the inner mind.',
    quote: 'You have power over your mind—not outside events. Realize this, and you will find strength.',
    craftTitle: 'Writing Without Audience Vanity: The Second-Person Self-Address',
    craftPrinciple: 'When prose feels performative or inflated, strip away the imaginary crowd and write directly "To Yourself" as Marcus did in his military tent. Precision and emotional honesty skyrocket when every sentence is tested against mortality.',
    craftExercise: 'Write a 200-word journal entry from your protagonist’s perspective addressed strictly "To Myself" on the eve of their hardest decision.',
    keyWorks: [
      { title: 'Meditations', year: 'c. 170–180 CE', gutenbergId: 2680, note: 'Twelve books of Stoic philosophy written on campaign' },
    ],
    primaryBookGutenbergId: 2680,
    studioTarget: 'WRITERS_DESK',
    motif: 'stoic-column',
  },
  {
    id: 'sun-tzu',
    name: 'Sun Tzu',
    epithet: 'Philosopher-Strategist of Eastern Zhou China',
    lifespan: 'c. 544 – 496 BCE',
    era: 'Spring & Autumn Period',
    discipline: 'PHILOSOPHY',
    disciplineLabel: 'Philosopher & Strategic Sage',
    accentColor: '#EF4444',
    secondaryColor: '#F59E0B',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Erta_Sunzi.jpg/480px-Erta_Sunzi.jpg',
    bio: 'Composed on bamboo slips during the turbulent dusk of the Spring and Autumn period, Sun Tzu’s The Art of War transcends military manuals to become a Taoist-inflected philosophy of conflict, psychology, and restraint. Its central paradox—that the supreme excellence is to subdue the enemy’s resistance without fighting—has shaped statecraft, chess, and narrative conflict design for twenty-five centuries.',
    quote: 'Supreme excellence consists in breaking the enemy’s resistance without fighting.',
    craftTitle: 'Aphoristic Density & Psychological Conflict Choreography',
    craftPrinciple: 'Every high-stakes confrontation in fiction or drama is a battle of information, terrain, and deception (shi and xing). Stage conflicts where the weaker character wins not by brute force, but by reading the opponent’s rigidity and turning their momentum against them.',
    craftExercise: 'Choreograph a confrontation scene where no physical blow is struck, yet the balance of power completely inverts through a single revealed truth.',
    keyWorks: [
      { title: 'The Art of War', year: 'c. 5th Century BCE', gutenbergId: 17405, choraBookId: 'art-of-war', note: 'Features full 6-Movement Chora DAW Imperial Guqin & Silk-Road Film Score' },
    ],
    primaryBookGutenbergId: 17405,
    choraScoreBookId: 'art-of-war',
    studioTarget: 'WRITERS_DESK',
    motif: 'bamboo-scroll',
  },
  {
    id: 'edgar-allan-poe-tagore',
    name: 'Edgar Allan Poe & Rabindranath Tagore',
    epithet: 'Masters of Lyric Cadence, Acoustic Poetics & Poet-Songwriting',
    lifespan: '1809 – 1849 / 1861 – 1941',
    era: 'Romantic & Modern Lyric Tradition',
    discipline: 'POET_SONGWRITER',
    disciplineLabel: 'Poets, Lyricists & Songwriters',
    accentColor: '#C084FC',
    secondaryColor: '#F472B6',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Edgar_Allan_Poe%2C_circa_1849%2C_restored%2C_squared_off.jpg/480px-Edgar_Allan_Poe%2C_circa_1849%2C_restored%2C_squared_off.jpg',
    bio: 'Across continents and centuries, the poet and the songwriter share one indivisible craft: making language sing in time. Edgar Allan Poe invented the modern detective story and in "The Philosophy of Composition" revealed how every internal rhyme and refrain ("Nevermore") in The Raven was engineered for acoustic hypnosis. Half a century later, Bengali polymath Rabindranath Tagore—the first non-European Nobel Laureate in Literature—composed both Gitanjali and over 2,230 songs (Rabindra Sangeet), proving that poetry and songwriting are two wings of the same bird.',
    quote: 'Poetry is the rhythmical creation of beauty in words.',
    craftTitle: 'Unity of Emotional Effect, Internal Rhyme & The Musical Refrain',
    craftPrinciple: 'Before writing a single stanza or song lyric, choose the exact emotional afterglow you want lingering in the listener’s chest. Use vowel music (assonance) and a recurring refrain that changes its emotional meaning each time the verse returns to it.',
    craftExercise: 'Write an 8-line lyric or poem where the final line of each stanza is identical in words, but means the opposite by the final repetition.',
    keyWorks: [
      { title: 'The Raven and Complete Tales & Poems', year: '1845', gutenbergId: 2147, note: 'Poe’s masterclass in acoustic meter, gothic atmosphere, and mystery' },
      { title: 'Leaves of Grass (Walt Whitman)', year: '1855', gutenbergId: 1322, note: 'Free-verse American epic cadence' },
      { title: 'The Divine Comedy (Dante Alighieri)', year: '1320', gutenbergId: 1001, note: 'Terza rima architectural poetry across Inferno, Purgatorio, and Paradiso' },
    ],
    primaryBookGutenbergId: 2147,
    studioTarget: 'WRITERS_DESK',
    motif: 'bardic-lyre',
  },
  {
    id: 'sophocles-serling',
    name: 'Sophocles & The Screenwriting Lineage',
    epithet: 'From Athenian Amphitheater to Modern Screenplay & Teleplay',
    lifespan: '497 BCE – Modern Cinema',
    era: 'Classical Tragedy to Golden-Age Screenwriting',
    discipline: 'PLAYWRIGHT_SCREENWRITER',
    disciplineLabel: 'Playwrights & Screenwriters',
    accentColor: '#FB923C',
    secondaryColor: '#38BDF8',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Sophocles_pushkin.jpg/480px-Sophocles_pushkin.jpg',
    bio: 'When Sophocles added the third actor (tritagonist) to the Athenian stage in Oedipus the King and Antigone, he unlocked triangulated dramatic scenes—the exact geometry that modern screenwriters from Billy Wilder to Rod Serling and Akira Kurosawa use in every screenplay today. Oedipus the King is simultaneously the first detective noir—where the investigator discovers he himself is the culprit—and the blueprint for tight three-act visual momentum.',
    quote: 'There is no witness so dreadful, no accuser so terrible as the conscience that dwells in the heart of every man.',
    craftTitle: 'Triangulated Scene Dynamics & Dramatic Irony in Visual Scripts',
    craftPrinciple: 'In a two-person scene, conflict can stall into ping-pong argument; introduce a third presence (or a secret known to the audience and one character, but hidden from the other) and every line of dialogue suddenly carries double voltage.',
    craftExercise: 'Open the Script Writing Studio and write a 2-page scene between three characters where Character A is trying to warn Character B without Character C realizing it.',
    keyWorks: [
      { title: 'Plays of Sophocles: Oedipus the King & Antigone', year: 'c. 441–429 BCE', gutenbergId: 31, note: 'The archetype of dramatic irony and moral courage' },
      { title: 'Hamlet (William Shakespeare)', year: 'c. 1600', gutenbergId: 1524, note: 'Five-act dramatic architecture' },
    ],
    primaryBookGutenbergId: 31,
    studioTarget: 'SCRIPT_STUDIO',
    motif: 'lyceum-theater',
  },
];

/**
 * Generates an atmospheric, museum-grade SVG stage overlay specific to the active Hero Master.
 * Designed to blend seamlessly behind the Lorea Hero alongside the author's portrait medallion.
 */
export function buildMasterHeroStageSvg(master: LoreaPantheonMaster): string {
  const c1 = master.accentColor;
  const c2 = master.secondaryColor;

  let motifArt = '';
  switch (master.motif) {
    case 'athens-cave':
      motifArt = `
        <!-- Athenian Acropolis Columns + Allegory of the Cave Firelight Rays -->
        <g stroke="${c1}" stroke-opacity="0.32" fill="none" stroke-width="2">
          <path d="M920 680 H1380 M950 680 V320 M990 680 V320 M1070 680 V320 M1110 680 V320 M1190 680 V320 M1230 680 V320 M1310 680 V320 M1350 680 V320"/>
          <path d="M910 320 L1150 210 L1390 320 Z" stroke-width="2.5"/>
          <circle cx="1150" cy="275" r="28" stroke="${c2}" stroke-opacity="0.45"/>
          <path d="M1150 275 L780 90 M1150 275 L820 440 M1150 275 L1420 120" stroke="${c1}" stroke-dasharray="6 8" stroke-opacity="0.28"/>
        </g>
      `;
      break;
    case 'lyceum-theater':
      motifArt = `
        <!-- Classical Greek Amphitheater Tiers & Poetics Dramatic Arc -->
        <g stroke="${c1}" stroke-opacity="0.32" fill="none" stroke-width="2">
          <path d="M900 620 A260 190 0 0 1 1380 620"/>
          <path d="M940 620 A220 155 0 0 1 1340 620"/>
          <path d="M980 620 A180 120 0 0 1 1300 620"/>
          <path d="M1020 620 A140 85 0 0 1 1260 620"/>
          <path d="M860 420 Q1140 140 1390 420" stroke="${c2}" stroke-width="3" stroke-dasharray="8 6"/>
          <circle cx="1140" cy="280" r="10" fill="${c1}" fill-opacity="0.5"/>
        </g>
      `;
      break;
    case 'manga-cinema':
      motifArt = `
        <!-- Osamu Tezuka Dynamic Manga Panel Grid, Speed Lines & Film Sprockets -->
        <g stroke="${c1}" stroke-opacity="0.34" fill="none" stroke-width="2.2">
          <polygon points="880,140 1160,115 1130,360 860,340" />
          <polygon points="1185,110 1400,150 1380,410 1150,365" stroke="${c2}" />
          <polygon points="870,370 1375,435 1350,670 850,640" />
          <path d="M1120 240 L890 150 M1120 240 L880 280 M1120 240 L1380 170 M1120 240 L1370 330" stroke-opacity="0.22"/>
        </g>
      `;
      break;
    case 'cosmic-panels':
      motifArt = `
        <!-- Eisner & Kirby Sequential Art Splash Grid + Kirby Krackle Constellation -->
        <g stroke="${c1}" stroke-opacity="0.34" fill="none" stroke-width="2.2">
          <rect x="880" y="130" width="230" height="240" rx="8"/>
          <rect x="1130" y="130" width="250" height="150" rx="8" stroke="${c2}"/>
          <rect x="1130" y="300" width="250" height="290" rx="8"/>
          <rect x="880" y="390" width="230" height="200" rx="8" stroke="${c2}"/>
          <circle cx="1010" cy="250" r="24" fill="${c1}" fill-opacity="0.18"/>
          <circle cx="1045" cy="225" r="14" fill="${c2}" fill-opacity="0.22"/>
          <circle cx="975" cy="280" r="11" fill="${c1}" fill-opacity="0.25"/>
        </g>
      `;
      break;
    default:
      motifArt = `
        <!-- Illuminated Literary Astrolabe & Quill Constellation -->
        <g stroke="${c1}" stroke-opacity="0.3" fill="none" stroke-width="1.8">
          <circle cx="1140" cy="360" r="210" stroke-dasharray="4 8"/>
          <circle cx="1140" cy="360" r="155" stroke="${c2}" stroke-opacity="0.28"/>
          <path d="M960 470 Q1140 210 1330 330" stroke-width="2.6"/>
          <path d="M990 520 H1290 M1030 555 H1250" stroke-opacity="0.24"/>
        </g>
      `;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="masterAura" cx="76%" cy="42%" r="46%">
        <stop offset="0%" stop-color="${c1}" stop-opacity="0.32"/>
        <stop offset="52%" stop-color="${c2}" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1440" height="820" fill="url(#masterAura)"/>
    ${motifArt}
  </svg>`;
}
