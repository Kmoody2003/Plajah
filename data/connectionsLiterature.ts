import type { Connection } from './connectionTypes';

// Cross-curricular links from the Classic Literature course, the history-themed grammar course and
// the theatre scripts course to lessons in other courses. Every link states only what both sides cover.
const CL = 'classic-literature';
const HS = 'history-sentences';
const TS = 'theatre-scripts';

export const CONNECTIONS_LITERATURE: Connection[] = [
  // ---- Frankenstein ----
  { from: { courseId: CL, lessonId: '84' }, to: { courseId: 'lab-chemistry', lessonId: 'lab-chemistry.l13' }, kind: 'history-of',
    why: 'Both concern the question of whether life needs a special force: Shelley wrote Frankenstein as science probed the nature of life, and the lesson tells how Wohler undermined vitalism.' },
  { from: { courseId: CL, lessonId: '84' }, to: { courseId: 'lab-neuroscience', lessonId: 'lab-neuroscience.l03' }, kind: 'science-behind',
    why: 'Both link electricity to living tissue: Frankenstein was written as science explored electricity and life, and the lesson shows nerve signals are electrical spikes along an axon.' },

  // ---- Wells ----
  { from: { courseId: CL, lessonId: '36' }, to: { courseId: 'lab-biology', lessonId: 'lab-biology.l14' }, kind: 'history-of',
    why: 'Both turn on germ theory: Wells ends the Martian invasion when Earth microbes kill the invaders, and the lesson traces how Pasteur and others showed microbes cause disease.' },
  { from: { courseId: CL, lessonId: '36' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l14' }, kind: 'same-idea',
    why: 'Both deal with industrial-age empire: Wells reversed the usual story by making humans the colonised, and the lesson covers industrial powers expanding their empires.' },
  { from: { courseId: CL, lessonId: '35' }, to: { courseId: 'lab-astronomy', lessonId: 'lab-astronomy.l06' }, kind: 'science-behind',
    why: 'Both look at the Sun growing old: the Time Traveller sees a dying red sun in the far future, and the lesson explains how a Sun-like star swells into a red giant and fades.' },
  { from: { courseId: CL, lessonId: '35' }, to: { courseId: 'lab-physics', lessonId: 'lab-physics.l11' }, kind: 'same-idea',
    why: "Both treat time as a dimension on a par with space: Wells's Time Traveller argues for it in 1895, and the lesson describes gravity as the curvature of spacetime." },
  { from: { courseId: CL, lessonId: '35' }, to: { courseId: 'lab-biology', lessonId: 'lab-biology.l05' }, kind: 'science-behind',
    why: 'Both rest on descent with change: Wells drew on Darwin for his divergent Eloi and Morlocks, and the lesson explains variation, heredity and differential reproduction.' },

  // ---- Verne ----
  { from: { courseId: CL, lessonId: '164' }, to: { courseId: 'lab-chemistry', lessonId: 'lab-chemistry.l12' }, kind: 'science-behind',
    why: 'Both involve electrochemical power: the Nautilus runs on electricity from batteries, and the lesson explains how electron transfer in redox reactions powers batteries.' },
  { from: { courseId: CL, lessonId: '164' }, to: { courseId: 'lab-engineering', lessonId: 'lab-engineering.l10' }, kind: 'application',
    why: 'Both concern electrical power driving machines: the Nautilus is an all-electric submarine, and the lesson teaches V = IR and P = VI.' },
  { from: { courseId: CL, lessonId: '164' }, to: { courseId: 'lab-earth', lessonId: 'lab-earth.l10' }, kind: 'science-behind',
    why: "Both follow how the oceans move: Aronnax and Nemo travel the world's seas and currents, and the lesson explains circulation, surface gyres and the warm Gulf Stream." },
  { from: { courseId: CL, lessonId: '103' }, to: { courseId: 'hq-quest', lessonId: 'hq-quest.l04' }, kind: 'history-of',
    why: "Both describe how steamships, railways and telegraphs shrank distances in the Industrial and Imperial Age, the setting of Fogg's eighty-day wager." },
  { from: { courseId: CL, lessonId: '103' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l12' }, kind: 'same-idea',
    why: "Both follow voyages that join the hemispheres: Fogg circles the globe in 1872, and the lesson covers Magellan's expedition, the first circumnavigation, and the oceanic links after 1450." },
  { from: { courseId: CL, lessonId: '103' }, to: { courseId: 'lab-engineering', lessonId: 'lab-engineering.l08' }, kind: 'application',
    why: "Both depend on the steam engine, which powers Fogg's ships and trains and whose efficiency limit Carnot analysed in 1824." },

  // ---- Dickens, Hugo, Dumas ----
  { from: { courseId: CL, lessonId: '98' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l13' }, kind: 'history-of',
    why: "Both cover the French Revolution of 1789 and the Enlightenment ideals behind the Age of Revolutions, the backdrop of Dickens's story of London and Paris." },
  { from: { courseId: CL, lessonId: '98' }, to: { courseId: 'civics-hall', lessonId: 'civ-comp-france' }, kind: 'history-of',
    why: 'Both are set against the French Revolution: Dickens depicts it and the Terror, and the lesson reads the 1789 Declaration of the Rights of Man and of the Citizen.' },
  { from: { courseId: CL, lessonId: '135' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l13' }, kind: 'history-of',
    why: "Both belong to the revolutionary politics of France after 1789: Hugo's novel runs from Waterloo to the Paris uprising of 1832, and the lesson covers the Age of Revolutions." },
  { from: { courseId: CL, lessonId: '135' }, to: { courseId: 'civics-hall', lessonId: 'civ-comp-france' }, kind: 'same-idea',
    why: "Both concern France's promise of rights to everyone: Hugo argues that poverty and a harsh legal system create the miserable, and the lesson reads the 1789 Declaration of rights." },
  { from: { courseId: CL, lessonId: '730' }, to: { courseId: 'hq-quest', lessonId: 'hq-quest.l04' }, kind: 'history-of',
    why: 'Both concern industrial-age cities and their new working classes, the world of the London poor that Dickens attacked in Oliver Twist.' },
  { from: { courseId: CL, lessonId: '46' }, to: { courseId: 'hq-quest', lessonId: 'hq-quest.l04' }, kind: 'history-of',
    why: 'Both concern the Industrial Age and its working classes: A Christmas Carol was written in 1843, amid widespread poverty and child labour, as cities grew.' },
  { from: { courseId: CL, lessonId: '1184' }, to: { courseId: 'civics-hall', lessonId: 'civ-rights-2' }, kind: 'same-idea',
    why: "Both concern imprisonment without a fair hearing: Dantes is jailed without trial in the novel, and the lesson traces due process back to Magna Carta's clause 39." },

  // ---- Twain and the American nineteenth century ----
  { from: { courseId: CL, lessonId: '76' }, to: { courseId: 'founding-documents', lessonId: 'founding-documents.l10' }, kind: 'same-idea',
    why: "Both set slavery against the nation's own stated ideals: Twain satirises it through a boy on the Mississippi, and Douglass in 1852 used the nation's principles as the indictment." },
  { from: { courseId: CL, lessonId: '76' }, to: { courseId: 'civics-hall', lessonId: 'civ-living-1' }, kind: 'history-of',
    why: 'Both concern slavery and its end: Huckleberry Finn is set when slavery was legal, and the lesson covers the Thirteenth, Fourteenth and Fifteenth Amendments that rebuilt the country.' },
  { from: { courseId: CL, lessonId: '25344' }, to: { courseId: 'civics-hall', lessonId: 'civ-rights-1' }, kind: 'same-idea',
    why: 'Both concern the relation of religion and government: Hawthorne portrays a Puritan community ruled closely by religion, and the lesson covers what the First Amendment restrains.' },

  // ---- Russians, Cervantes, Carroll ----
  { from: { courseId: CL, lessonId: '2554' }, to: { courseId: 'philosophy-school', lessonId: 'ph-eth-1' }, kind: 'same-idea',
    why: 'Both test whether outcomes can justify breaking a moral rule: Raskolnikov argues extraordinary people may, and the lesson sets consequences against duties and character.' },
  { from: { courseId: CL, lessonId: '2600' }, to: { courseId: 'hq-quest', lessonId: 'hq-quest.l11' }, kind: 'same-idea',
    why: 'Both ask what causes historical events: Tolstoy argues about it throughout War and Peace, and the lesson teaches how to link developments to the causes that produced them.' },
  { from: { courseId: CL, lessonId: '996' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l11' }, kind: 'history-of',
    why: 'Both depend on print: Don Quixote is driven mad by reading chivalric romances, and the lesson explains how movable type spread books and ideas faster than copying by hand.' },
  { from: { courseId: CL, lessonId: '996' }, to: { courseId: 'philosophy-school', lessonId: 'ph-hist-1' }, kind: 'same-idea',
    why: 'Both explore how the mind can be wrong about reality: Quixote sees giants where there are windmills, and Descartes asks what can be known when the senses deceive.' },
  { from: { courseId: CL, lessonId: '11' }, to: { courseId: 'philosophy-school', lessonId: 'ph-arg-3' }, kind: 'art-of',
    why: 'Both play with logic: Carroll was an Oxford mathematics lecturer who filled Alice with logical games, and the lesson teaches how formal logic makes validity mechanical.' },

  // ---- Homer, Sun Tzu ----
  { from: { courseId: CL, lessonId: '6130' }, to: { courseId: 'lab-archaeology', lessonId: 'lab-archaeology.l01' }, kind: 'history-of',
    why: 'Both concern Troy: the Iliad is set in the tenth year of the Trojan War, and Schliemann dug at Hisarlik in Turkey to find the Troy of Homer.' },
  { from: { courseId: CL, lessonId: '6130' }, to: { courseId: 'lab-combat', lessonId: 'lab-combat.l11' }, kind: 'same-idea',
    why: 'Both show organised contests of boxing and wrestling in Greek culture: the Iliad stages them as funeral games for Patroclus, and pankration fused them at Olympia.' },
  { from: { courseId: CL, lessonId: '6130' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l04' }, kind: 'history-of',
    why: 'Both belong to the Greek world: the Iliad became the foundation of Greek education, and the lesson covers the city-states, theatre and Olympic Games of ancient Greece.' },
  { from: { courseId: CL, lessonId: '1727' }, to: { courseId: 'lab-archaeology', lessonId: 'lab-archaeology.l01' }, kind: 'history-of',
    why: 'Both concern the world of the Trojan War: the Odyssey follows Odysseus home from Troy, and the lesson tells how Schliemann went looking for the Troy of Homer.' },
  { from: { courseId: CL, lessonId: '1727' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l04' }, kind: 'history-of',
    why: 'Both belong to ancient Greece: the Odyssey, with its code of hospitality called xenia, was central to Greek culture, and the lesson surveys the Greek city-states.' },
  { from: { courseId: CL, lessonId: '17405' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l06' }, kind: 'history-of',
    why: "Both belong to ancient China's age of rival states, the era of The Art of War and of the Hundred Schools of Thought, before Qin unified the country." },

  // ---- Holmes ----
  { from: { courseId: CL, lessonId: '1661' }, to: { courseId: 'thinking-methods', lessonId: 'thinking-methods.l02' }, kind: 'same-idea',
    why: "Both separate what you observe from what you infer, the habit Holmes shows when he reads a visitor's clues and the lesson teaches as observation, inference and hypothesis." },
  { from: { courseId: CL, lessonId: '1661' }, to: { courseId: 'thinking-methods', lessonId: 'thinking-methods.l17' }, kind: 'same-idea',
    why: "Both concern kinds of inference: Holmes's reasoning from clues to explanations is the lesson's abductive reasoning, set beside deduction and induction." },
  { from: { courseId: CL, lessonId: '1661' }, to: { courseId: 'thinking-methods', lessonId: 'thinking-methods.l11' }, kind: 'application',
    why: 'Both tie a conclusion to evidence through stated reasoning, as Holmes does when he explains how he reached his answer and as the lesson teaches in claim, evidence, reasoning.' },

  // ---- Wild and jungle, whales, Dracula ----
  { from: { courseId: CL, lessonId: '345' }, to: { courseId: 'chora-history', lessonId: 'rec-01' }, kind: 'history-of',
    why: "Both feature the phonograph: Stoker's characters use phonograph recordings among modern tools, and the lesson covers Edison's 1877 phonograph and the first recorded sound." },

  // ---- Shakespeare and Wilde ----
  { from: { courseId: CL, lessonId: '1524' }, to: { courseId: TS, lessonId: 'theatre-scripts.l04' }, kind: 'art-of',
    why: 'Both centre on the soliloquy: Hamlet is known for speeches in which a character speaks his thoughts aloud, and the lesson explains soliloquy and aside on the stage.' },
  { from: { courseId: CL, lessonId: '1524' }, to: { courseId: TS, lessonId: 'theatre-scripts.l08' }, kind: 'history-of',
    why: 'Both belong to the English Renaissance stage: Hamlet (c. 1600) is a product of its blank verse, soliloquies and public playhouses, which the lesson surveys.' },
  { from: { courseId: CL, lessonId: '1524' }, to: { courseId: TS, lessonId: 'theatre-scripts.l02' }, kind: 'art-of',
    why: "Both treat conflict as the engine of a play: Hamlet's central struggle is inside the prince, one of the kinds of conflict the lesson describes." },
  { from: { courseId: CL, lessonId: '1513' }, to: { courseId: TS, lessonId: 'theatre-scripts.l08' }, kind: 'history-of',
    why: 'Both place Romeo and Juliet (c. 1595) on the English Renaissance public stage, the playhouse tradition the lesson describes for Shakespeare and his contemporaries.' },
  { from: { courseId: CL, lessonId: '1513' }, to: { courseId: TS, lessonId: 'theatre-scripts.l03' }, kind: 'art-of',
    why: 'Both concern the mixing of comedy and tragedy: Romeo and Juliet blends the two, and the lesson notes the library labels it Tragedy / Romance and that labels are guides rather than boxes.' },
  { from: { courseId: CL, lessonId: '844' }, to: { courseId: TS, lessonId: 'theatre-scripts.l12' }, kind: 'art-of',
    why: "Both centre on Wilde's dialogue as spectacle: The Importance of Being Earnest has two men invent fictitious relatives, and the lesson calls its lines both jokes and plot moves." },

  // ---- History-sentences ----
  { from: { courseId: HS, lessonId: 'hs-capitals' }, to: { courseId: 'chora-history', lessonId: 'pop-05' }, kind: 'application',
    why: 'Both draw on Motown: the capitalisation exercise names Berry Gordy and Motown Records in Detroit, and the lesson covers Motown and Stax in the sound of the sixties.' },
  { from: { courseId: HS, lessonId: 'hs-capitals' }, to: { courseId: 'film-history', lessonId: 'film-history.l02' }, kind: 'application',
    why: 'Both draw on Orson Welles: the exercise uses his directing of Citizen Kane in 1941, and the lesson covers how he reinvented film grammar on that picture.' },
  { from: { courseId: HS, lessonId: 'hs-capitals' }, to: { courseId: 'art-masters', lessonId: 'art-masters.l07' }, kind: 'application',
    why: 'Both draw on Monet: the exercise uses his painting Impression, Sunrise, and the lesson covers his work and Impressionism.' },
  { from: { courseId: HS, lessonId: 'hs-end-marks' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l10' }, kind: 'application',
    why: 'Both draw on Louis Armstrong and his Hot Five recordings, which the end-mark exercise uses and the lesson explains as the soloist who made jazz swing.' },
  { from: { courseId: HS, lessonId: 'hs-end-marks' }, to: { courseId: 'art-masters', lessonId: 'art-masters.l08' }, kind: 'application',
    why: "Both draw on Vincent van Gogh's The Starry Night, which the end-mark exercise asks about and the lesson lists among his works." },
  { from: { courseId: HS, lessonId: 'hs-verb-tense' }, to: { courseId: 'chora-history', lessonId: 'rec-01' }, kind: 'application',
    why: "Both draw on Edison's phonograph, which the verb-tense exercise dates to 1877 and the lesson explains as the first machine to replay recorded sound." },
  { from: { courseId: HS, lessonId: 'hs-sv-agree' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l03' }, kind: 'application',
    why: "Both draw on Vivaldi's The Four Seasons, which the agreement exercise uses and the lesson cites as the best-known example of music that paints scenes." },
  { from: { courseId: HS, lessonId: 'hs-sv-agree' }, to: { courseId: 'chora-history', lessonId: 'pop-08' }, kind: 'application',
    why: 'Both draw on the beginnings of hip hop in the Bronx, which the agreement exercise uses as a subject and the lesson tells as a party technique that became a global form.' },
  { from: { courseId: HS, lessonId: 'hs-apostrophes' }, to: { courseId: 'film-history', lessonId: 'film-history.l05' }, kind: 'application',
    why: "Both draw on Akira Kurosawa's Seven Samurai (1954), which the possessive exercise uses and the lesson covers in the Japanese golden age." },
  { from: { courseId: HS, lessonId: 'hs-apostrophes' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l05' }, kind: 'application',
    why: "Both draw on Beethoven's Ninth Symphony, whose choral finale sets Schiller's poem in the exercise and which the lesson places at the hinge of music history." },
  { from: { courseId: HS, lessonId: 'hs-pronouns' }, to: { courseId: 'film-history', lessonId: 'film-history.l10' }, kind: 'application',
    why: 'Both draw on Steven Spielberg and Jaws (1975), which the pronoun exercise uses and the lesson covers in the rise of the blockbuster.' },
  { from: { courseId: HS, lessonId: 'hs-commas' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l09' }, kind: 'application',
    why: "Both draw on Stravinsky's The Rite of Spring, whose 1913 Paris premiere the comma exercise recounts and the lesson describes as rhythm that caused a riot." },
  { from: { courseId: HS, lessonId: 'hs-commas' }, to: { courseId: 'film-history', lessonId: 'film-history.l03' }, kind: 'application',
    why: 'Both draw on Alfred Hitchcock, whose Psycho (1960) the comma exercise uses and whose suspense techniques the lesson covers.' },
  { from: { courseId: HS, lessonId: 'hs-parallel' }, to: { courseId: 'art-masters', lessonId: 'art-masters.l01' }, kind: 'application',
    why: 'Both draw on Leonardo da Vinci as a painter, engineer and anatomist, the blend of art and science that the lesson presents as the archetype of the Renaissance mind.' },
  { from: { courseId: HS, lessonId: 'hs-modifiers' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l05' }, kind: 'application',
    why: 'Both draw on Beethoven, whom the modifier exercise shows completing his Ninth Symphony in 1824 while nearly deaf and whom the lesson treats as the hinge of music history.' },
  { from: { courseId: HS, lessonId: 'hs-semicolons' }, to: { courseId: 'music-figures', lessonId: 'music-figures.l13' }, kind: 'application',
    why: "Both draw on Bob Dylan: the punctuation exercise uses his 2016 Nobel Prize in Literature, and the lesson covers rock and the song as literature." },
  { from: { courseId: HS, lessonId: 'hs-word-choice' }, to: { courseId: 'film-history', lessonId: 'film-history.l01' }, kind: 'application',
    why: "Both draw on Fritz Lang's Metropolis (1927), which the word-choice exercise uses and the lesson lists among the key films of German Expressionism." },

  // ---- Theatre scripts ----
  { from: { courseId: TS, lessonId: 'theatre-scripts.l05' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l04' }, kind: 'history-of',
    why: 'Both place tragedy in ancient Greece, whose city-states gave the world democracy, philosophy, theatre and the Olympic Games.' },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l06' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l04' }, kind: 'history-of',
    why: 'Both concern the Greek city-states, whose democracy and theatre gave Aristophanes his targets and his stage.' },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l07' }, to: { courseId: 'world-religions', lessonId: 'world-religions.l02' }, kind: 'history-of',
    why: 'Both draw on the Sanskrit epic tradition: Kalidasa based Sakoontala on a story from the Mahabharata, which the lesson introduces among the great Hindu epics.' },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l08' }, to: { courseId: 'lab-history', lessonId: 'lab-history.l11' }, kind: 'history-of',
    why: 'Both belong to the Renaissance world of print: English plays by Marlowe and Shakespeare reached readers as printed books, made possible by movable type.' },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l02' }, to: { courseId: 'film-school', lessonId: 'fs-write-6' }, kind: 'same-idea',
    why: 'Both build a story on a character who wants something with something in the way, which the lesson calls protagonist and conflict and the film course calls want and need.' },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l11' }, to: { courseId: 'film-school', lessonId: 'fs-write-5' }, kind: 'same-idea',
    why: "Both teach subtext: Chekhov's drama of what is not said and the film lesson on dialogue and subtext show meaning carried beneath the spoken words." },
  { from: { courseId: TS, lessonId: 'theatre-scripts.l03' }, to: { courseId: 'film-school', lessonId: 'fs-write-8' }, kind: 'same-idea',
    why: 'Both treat comedy as a matter of built structure: the lesson contrasts the two masks of theatre, and the film lesson teaches that comedy is structure rather than jokes.' },
];
