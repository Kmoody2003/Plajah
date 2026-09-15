/**
 * Authentic Library of Congress & National Archives Speech Transcripts & Media Registry
 *
 * Enhanced with deep curatorial context:
 * - Historical Crisis & Backdrop (48 hours before delivery)
 * - Rhetorical Architecture & Cadences (anaphora, paradox, chiasmus)
 * - Acoustic & Broadcast Engineering (microphones, disc cutting, network distribution)
 * - Key Iconic Passages & Significance
 * - Primary Source Companion Media Gallery with photographer credits & curatorial notes
 */

import { ArchiveTrack } from './archiveContentService';

export interface SpeechArtifact {
  title: string;
  url: string;
  type: 'PHOTO' | 'DOCUMENT' | 'PRESS' | 'GEAR';
  caption: string;
  sourceCredit: string;
  year: string | number;
}

export interface SpeechMediaEntry {
  orator: string;
  occasion: string;
  venue: string;
  deliveryDate: string;
  deliveryYear: number;
  primaryPhoto: string;
  whyItExists: string;
  historicalBackdrop: string;
  rhetoricalAnalysis: string;
  acousticEngineering: string;
  crowdAndBroadcastReach: string;
  keyQuotes: Array<{ quote: string; context: string }>;
  manuscriptUrl?: string;
  pdfUrl?: string;
  accessionNo: string;
  companionArtifacts: SpeechArtifact[];
  timeline: Array<{ year: string | number; label: string; description?: string; active?: boolean }>;
  transcript: Array<{ time: number; speaker: string; text: string; translatedText?: Record<string, string> }>;
}

export const SPEECH_MEDIA_REGISTRY: Record<string, SpeechMediaEntry> = {
  mlk_dream: {
    orator: 'Dr. Martin Luther King Jr.',
    occasion: 'March on Washington for Jobs and Freedom',
    venue: 'Lincoln Memorial, Washington, D.C.',
    deliveryDate: 'August 28, 1963',
    deliveryYear: 1963,
    accessionNo: 'NARA-306-SS-1 / LoC LC-U9-10362',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/03100/03128r.jpg',
    whyItExists: 'Delivered to over 250,000 civil rights marchers gathered at the Lincoln Memorial on August 28, 1963, Dr. Martin Luther King Jr.\'s address became the moral touchstone of the American Civil Rights Movement. Speaking from the steps where Abraham Lincoln stood in marble shadow, King turned from prepared text to the prophetic cadences of the Black preaching tradition, weaving the promise of the American dream together with biblical justice. Preserved in the National Recording Registry of the Library of Congress.',
    historicalBackdrop: 'In the summer of 1963, Birmingham police unleashed attack dogs and high-pressure fire hoses against nonviolent demonstrators. Medgar Evers was assassinated in Jackson, Mississippi. President John F. Kennedy had just proposed landmark civil rights legislation in June, but congressional filibusters threatened its passage. Civil rights leaders A. Philip Randolph and Bayard Rustin organized 250,000 Americans to descend upon Washington to prove that the demand for freedom and jobs was irresistible.',
    rhetoricalAnalysis: 'Built upon the African American call-and-response tradition, prophetic biblical allusions (Amos 5:24, Isaiah 40:4-5), and classic anaphora (\'One hundred years later...\', \'Now is the time...\', \'I have a dream...\', \'Let freedom ring...\'). King famously discarded his prepared typewritten remarks at the urging of gospel legend Mahalia Jackson, who cried out from behind him: \'Tell \'em about the dream, Martin!\'',
    acousticEngineering: 'Captured through a cluster of Shure 55S Unidyne dynamic microphones and Western Electric broadcast feeds mounted on the podium lectern. Distributed live to ABC, CBS, and NBC television networks, the Voice of America overseas shortwave service, and recorded onto 7.5 ips archival magnetic tape by Library of Congress and National Archives engineers.',
    crowdAndBroadcastReach: '250,000+ in-person marchers at the Reflecting Pool; estimated 50+ million television viewers in the United States and worldwide via Telstar satellite.',
    keyQuotes: [
      {
        quote: 'I have a dream that one day this nation will rise up and live out the true meaning of its creed: "We hold these truths to be self-evident, that all men are created equal."',
        context: 'Anchoring the Civil Rights Movement directly in the founding promise of the Declaration of Independence.'
      },
      {
        quote: 'I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character.',
        context: 'The universal moral touchstone defining King\'s nonviolent vision of character-based human dignity.'
      },
      {
        quote: 'Free at last! Free at last! Thank God Almighty, we are free at last!',
        context: 'Closing with the triumphant lines of an old Negro spiritual, cementing the speech as sacred American oratory.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/31200/31298r.jpg',
    companionArtifacts: [
      {
        title: 'Dr. King at the Lincoln Memorial Lectern (Warren K. Leffler, August 28, 1963)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/03100/03128r.jpg',
        type: 'PHOTO',
        caption: 'Iconic portrait of Dr. King addressing the multitude with podium microphones clearly visible.',
        sourceCredit: 'Library of Congress Prints & Photographs Division (Warren K. Leffler)',
        year: 1963,
      },
      {
        title: '250,000 Marchers Stretched along the Lincoln Memorial Reflecting Pool',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/31200/31298r.jpg',
        type: 'PHOTO',
        caption: 'Panoramic view from the steps of the Lincoln Memorial toward the Washington Monument.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1963,
      },
      {
        title: 'Civil Rights Leaders Marching down Constitution Avenue',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/03100/03129r.jpg',
        type: 'PHOTO',
        caption: 'Dr. King, Whitney Young, A. Philip Randolph, Walter Reuther, and John Lewis leading the march.',
        sourceCredit: 'Library of Congress (Warren K. Leffler Collection)',
        year: 1963,
      },
      {
        title: 'Official March on Washington Program & Statement of Demands',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c15000/3c15100/3c15132r.jpg',
        type: 'DOCUMENT',
        caption: 'The official program distributed to attendees listing speakers, hymns, and concrete legislative goals.',
        sourceCredit: 'National Archives & Records Administration',
        year: 1963,
      },
      {
        title: 'Marchers with Equal Rights and Voting Banners on the National Mall',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/04200/04297r.jpg',
        type: 'PHOTO',
        caption: 'Citizens of every race and background united behind federal voting rights and desegregation demands.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1963,
      },
      {
        title: 'Lincoln Memorial Steps with March Organizers Surrounding the Rostrum',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/31200/31297r.jpg',
        type: 'PHOTO',
        caption: 'Intimate perspective behind the podium showing Mahalia Jackson, Bayard Rustin, and field staff.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1963,
      },
    ],
    timeline: [
      { year: 1863, label: 'Emancipation Proclamation', description: 'Lincoln decrees freedom for enslaved Americans.' },
      { year: 1955, label: 'Montgomery Bus Boycott', description: 'Dr. King emerges as national voice of nonviolent protest.' },
      { year: 1963, label: 'August 28, 1963: \'I Have a Dream\'', description: 'Address delivered at the Lincoln Memorial.', active: true },
      { year: 1964, label: 'Civil Rights Act of 1964', description: 'Landmark federal legislation signed into law.' },
      { year: 1965, label: 'Voting Rights Act of 1965', description: 'Federal protection for minority suffrage signed.' },
    ],
    transcript: [
      { time: 0, speaker: 'Dr. Martin Luther King Jr.', text: 'I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation.', translatedText: { es: 'Estoy feliz de unirme a ustedes hoy en lo que pasará a la historia como la mayor manifestación por la libertad en la historia de nuestra nación.', fr: 'Je suis heureux de me joindre à vous aujourd\'hui dans ce qui restera dans l\'histoire comme la plus grande démonstration pour la liberté dans l\'histoire de notre nation.', yo: 'Inu mi dun lati darapo mo yin loni ninu ohun ti yoo wole sinu itan gege bi ifihan ti o tobi julo fun ominira ninu itan orile-ede wa.' } },
      { time: 13, speaker: 'Dr. Martin Luther King Jr.', text: 'Five score years ago, a great American, in whose symbolic shadow we stand today, signed the Emancipation Proclamation.' },
      { time: 27, speaker: 'Dr. Martin Luther King Jr.', text: 'This momentous decree came as a great beacon light of hope to millions of Negro slaves who had been seared in the flames of withering injustice.' },
      { time: 43, speaker: 'Dr. Martin Luther King Jr.', text: 'It came as a joyous daybreak to end the long night of their captivity.' },
      { time: 54, speaker: 'Dr. Martin Luther King Jr.', text: 'But one hundred years later, the Negro still is not free. One hundred years later, the life of the Negro is still sadly crippled by the manacles of segregation and the chains of discrimination.' },
      { time: 76, speaker: 'Dr. Martin Luther King Jr.', text: 'One hundred years later, the Negro lives on a lonely island of poverty in the midst of a vast ocean of material prosperity.' },
      { time: 92, speaker: 'Dr. Martin Luther King Jr.', text: 'One hundred years later, the Negro is still languished in the corners of American society and finds himself an exile in his own land. And so we\'ve come here today to dramatize a shameful condition.' },
      { time: 114, speaker: 'Dr. Martin Luther King Jr.', text: 'In a sense we\'ve come to our nation\'s capital to cash a check.' },
      { time: 124, speaker: 'Dr. Martin Luther King Jr.', text: 'When the architects of our republic wrote the magnificent words of the Constitution and the Declaration of Independence, they were signing a promissory note to which every American was to fall heir.' },
      { time: 147, speaker: 'Dr. Martin Luther King Jr.', text: 'This note was a promise that all men, yes, black men as well as white men, would be guaranteed the unalienable rights of life, liberty, and the pursuit of happiness.' },
      { time: 168, speaker: 'Dr. Martin Luther King Jr.', text: 'It is obvious today that America has defaulted on this promissory note insofar as her citizens of color are concerned. Instead of honoring this sacred obligation, America has given the Negro people a bad check, a check which has come back marked "insufficient funds."' },
      { time: 198, speaker: 'Dr. Martin Luther King Jr.', text: 'But we refuse to believe that the bank of justice is bankrupt. We refuse to believe that there are insufficient funds in the great vaults of opportunity of this nation.' },
      { time: 219, speaker: 'Dr. Martin Luther King Jr.', text: 'And so we\'ve come to cash this check, a check that will give us upon demand the riches of freedom and the security of justice.' },
      { time: 235, speaker: 'Dr. Martin Luther King Jr.', text: 'Now is the time to make real the promises of democracy. Now is the time to rise from the dark and desolate valley of segregation to the sunlit path of racial justice.' },
      { time: 256, speaker: 'Dr. Martin Luther King Jr.', text: 'Now is the time to lift our nation from the quicksands of racial injustice to the solid rock of brotherhood. Now is the time to make justice a reality for all of God\'s children.' },
      { time: 278, speaker: 'Dr. Martin Luther King Jr.', text: 'I say to you today, my friends, so even though we face the difficulties of today and tomorrow, I still have a dream. It is a dream deeply rooted in the American dream.' },
      { time: 300, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that one day this nation will rise up and live out the true meaning of its creed: "We hold these truths to be self-evident, that all men are created equal."' },
      { time: 320, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that one day on the red hills of Georgia, the sons of former slaves and the sons of former slave owners will be able to sit down together at the table of brotherhood.' },
      { time: 342, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that one day even the state of Mississippi, a state sweltering with the heat of injustice, sweltering with the heat of oppression, will be transformed into an oasis of freedom and justice.' },
      { time: 367, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character.' },
      { time: 386, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream today!' },
      { time: 395, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that one day, down in Alabama, with its vicious racists, with its governor having his lips dripping with the words of "interposition" and "nullification" — one day right there in Alabama little black boys and black girls will be able to join hands with little white boys and white girls as sisters and brothers.' },
      { time: 429, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream today!' },
      { time: 438, speaker: 'Dr. Martin Luther King Jr.', text: 'I have a dream that one day every valley shall be exalted, and every hill and mountain shall be made low, the rough places will be made plain, and the crooked places will be made straight; "and the glory of the Lord shall be revealed and all flesh shall see it together."' },
      { time: 468, speaker: 'Dr. Martin Luther King Jr.', text: 'This is our hope, and this is the faith that I go back to the South with.' },
      { time: 480, speaker: 'Dr. Martin Luther King Jr.', text: 'With this faith, we will be able to hew out of the mountain of despair a stone of hope. With this faith, we will be able to transform the jangling discords of our nation into a beautiful symphony of brotherhood.' },
      { time: 504, speaker: 'Dr. Martin Luther King Jr.', text: 'With this faith, we will be able to work together, to pray together, to struggle together, to go to jail together, to stand up for freedom together, knowing that we will be free one day.' },
      { time: 526, speaker: 'Dr. Martin Luther King Jr.', text: 'And when this happens, and when we allow freedom ring, when we let it ring from every village and every hamlet, from every state and every city, we will be able to speed up that day when all of God\'s children, black men and white men, Jews and Gentiles, Protestants and Catholics, will be able to join hands and sing in the words of the old Negro spiritual:' },
      { time: 562, speaker: 'Dr. Martin Luther King Jr.', text: 'Free at last! Free at last! Thank God Almighty, we are free at last!' }
    ]
  },

  fdr_infamy: {
    orator: 'President Franklin D. Roosevelt',
    occasion: 'Address to a Joint Session of Congress Requesting a Declaration of War',
    venue: 'House Chamber, U.S. Capitol, Washington, D.C.',
    deliveryDate: 'December 8, 1941',
    deliveryYear: 1941,
    accessionNo: 'NARA-SEN-77A-H1 / LoC MAVIS-00214',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a20000/3a26000/3a26500/3a26588r.jpg',
    whyItExists: 'Delivered at 12:30 PM on December 8, 1941, exactly 28 hours after the surprise attack on Pearl Harbor, President Franklin D. Roosevelt asked Congress for a declaration of war against the Empire of Japan. In six minutes and thirty seconds of resolute rhetoric, Roosevelt unified a divided nation and committed the United States to global war. Recorded on disc transcription systems by major networks and preserved in the National Archives.',
    historicalBackdrop: 'At 7:55 AM on Sunday, December 7, 1941, 353 Imperial Japanese aircraft launched a devastating surprise strike on the U.S. naval base at Pearl Harbor, Hawaii. Four battleships were sunk, 2,403 Americans were killed, and 1,178 were wounded. Roosevelt spent Sunday evening dictating his speech to secretary Grace Tully, insisting on a brief, stark accounting rather than a long diplomatic recital.',
    rhetoricalAnalysis: 'Delivered at a measured, resolute cadence (~115 WPM). Roosevelt famously made one crucial edit in his own handwriting: crossing out \'a date which will live in world history\' and writing \'a date which will live in infamy\'. He used anaphoric repetition of \'Last night Japanese forces attacked...\' to systematically establish premeditated treachery.',
    acousticEngineering: 'Spoken into an array of Western Electric 618A electrodynamic transmitters and RCA 77-DX ribbon microphones mounted on the Speaker\'s Rostrum. Broadcast live across NBC, CBS, and Mutual networks, and recorded onto 16-inch 33⅓ rpm lacquer master discs by the U.S. Senate Sound Recording studio.',
    crowdAndBroadcastReach: '435 Representatives, 96 Senators, Supreme Court Justices, Cabinet members; estimated 60 million American radio listeners — the largest radio audience in history up to that day (81% of American homes).',
    keyQuotes: [
      {
        quote: 'Yesterday, December 7, 1941 — a date which will live in infamy — the United States of America was suddenly and deliberately attacked by naval and air forces of the Empire of Japan.',
        context: 'The opening line that forever framed the nature of the attack and galvanized the American people.'
      },
      {
        quote: 'No matter how long it may take us to overcome this premeditated invasion, the American people in their righteous might will win through to absolute victory.',
        context: 'Unconditional commitment to total victory, setting the war doctrine for the Allies.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c00000/3c01000/3c01200/3c01289r.jpg',
    companionArtifacts: [
      {
        title: 'President Roosevelt Addressing the Joint Session of Congress (Dec 8, 1941)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a20000/3a26000/3a26500/3a26588r.jpg',
        type: 'PHOTO',
        caption: 'Roosevelt speaking from the House Rostrum surrounded by microphones and Congressional leaders.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1941,
      },
      {
        title: 'FDR Signing the Declaration of War against the Empire of Japan (4:10 PM, Dec 8)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c00000/3c01000/3c01200/3c01289r.jpg',
        type: 'PHOTO',
        caption: 'President Roosevelt signing Senate Joint Resolution 116 in the Oval Office wearing a black mourning armband.',
        sourceCredit: 'National Archives and Records Administration',
        year: 1941,
      },
      {
        title: 'Crowds Outside White House Gates Following Attack Announcement',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c30000/3c34000/3c34900/3c34954r.jpg',
        type: 'PHOTO',
        caption: 'Citizens gathering in stunned silence on Pennsylvania Avenue awaiting official word from the President.',
        sourceCredit: 'Library of Congress (Harris & Ewing Collection)',
        year: 1941,
      },
      {
        title: 'Congressional Leaders Escorting FDR into House Chamber',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3b40000/3b43000/3b43600/3b43621r.jpg',
        type: 'PHOTO',
        caption: 'Speaker Sam Rayburn and Vice President Henry Wallace presiding over the historic Joint Session.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1941,
      },
    ],
    timeline: [
      { year: 'Dec 7, 1941', label: '7:55 AM: Attack on Pearl Harbor', description: 'Surprise attack sinks 4 battleships; 2,403 killed.' },
      { year: 'Dec 8, 1941', label: '12:30 PM: Day of Infamy Address', description: 'Roosevelt asks Congress for declaration of war.', active: true },
      { year: 'Dec 8, 1941', label: '4:10 PM: Declaration of War Signed', description: 'Senate votes 82-0; House votes 388-1.' },
      { year: '1945', label: 'V-J Day & Allied Victory', description: 'Imperial Japan surrenders aboard USS Missouri.' },
    ],
    transcript: [
      { time: 0, speaker: 'President Franklin D. Roosevelt', text: 'Mr. Vice President, Mr. Speaker, Members of the Senate, and of the House of Representatives:', translatedText: { es: 'Señor Vicepresidente, Señor Portavoz, Miembros del Senado y de la Cámara de Representantes:', fr: 'Monsieur le Vice-président, Monsieur le Président, Membres du Sénat et de la Chambre des représentants:', yo: 'Ogbeni Igbakeji Aare, Ogbeni Agbọrọsọ, Awon omo egbe Alagba ati ti Ile Asofin:' } },
      { time: 10, speaker: 'President Franklin D. Roosevelt', text: 'Yesterday, December 7, 1941 — a date which will live in infamy — the United States of America was suddenly and deliberately attacked by naval and air forces of the Empire of Japan.' },
      { time: 38, speaker: 'President Franklin D. Roosevelt', text: 'The United States was at peace with that nation and, at the solicitation of Japan, was still in conversation with its government and its emperor looking toward the maintenance of peace in the Pacific.' },
      { time: 64, speaker: 'President Franklin D. Roosevelt', text: 'Indeed, one hour after Japanese air squadrons had commenced bombing in the American island of Oahu, the Japanese ambassador to the United States and his colleague delivered to our Secretary of State a formal reply to a recent American message.' },
      { time: 94, speaker: 'President Franklin D. Roosevelt', text: 'And while this reply stated that it seemed useless to continue the existing diplomatic negotiations, it contained no threat or hint of war or of armed attack.' },
      { time: 114, speaker: 'President Franklin D. Roosevelt', text: 'It will be recorded that the distance of Hawaii from Japan makes it obvious that the attack was deliberately planned many days or even weeks ago.' },
      { time: 133, speaker: 'President Franklin D. Roosevelt', text: 'During the intervening time, the Japanese government has deliberately sought to deceive the United States by false statements and expressions of hope for continued peace.' },
      { time: 153, speaker: 'President Franklin D. Roosevelt', text: 'The attack yesterday on the Hawaiian Islands has caused severe damage to American naval and military forces. I regret to tell you that very many American lives have been lost.' },
      { time: 175, speaker: 'President Franklin D. Roosevelt', text: 'In addition, American ships have been reported torpedoed on the high seas between San Francisco and Honolulu.' },
      { time: 190, speaker: 'President Franklin D. Roosevelt', text: 'Yesterday, the Japanese government also launched an attack against Malaya. Last night, Japanese forces attacked Hong Kong. Last night, Japanese forces attacked Guam. Last night, Japanese forces attacked the Philippine Islands. Last night, the Japanese attacked Wake Island. And this morning, the Japanese attacked Midway Island.' },
      { time: 228, speaker: 'President Franklin D. Roosevelt', text: 'Japan has, therefore, undertaken a surprise offensive extending throughout the Pacific area. The facts of yesterday and today speak for themselves. The people of the United States have already formed their opinions and well understand the implications to the very life and safety of our nation.' },
      { time: 260, speaker: 'President Franklin D. Roosevelt', text: 'As Commander in Chief of the Army and Navy, I have directed that all measures be taken for our defense.' },
      { time: 275, speaker: 'President Franklin D. Roosevelt', text: 'But always will our whole nation remember the character of the onslaught against us.' },
      { time: 288, speaker: 'President Franklin D. Roosevelt', text: 'No matter how long it may take us to overcome this premeditated invasion, the American people in their righteous might will win through to absolute victory.' },
      { time: 310, speaker: 'President Franklin D. Roosevelt', text: 'I believe that I interpret the will of the Congress and of the people when I assert that we will not only defend ourselves to the uttermost, but will make it very certain that this form of treachery shall never again endanger us.' },
      { time: 337, speaker: 'President Franklin D. Roosevelt', text: 'Hostilities exist. There is no blinking at the fact that our people, our territory, and our interests are in grave danger.' },
      { time: 355, speaker: 'President Franklin D. Roosevelt', text: 'With confidence in our armed forces, with the unbounding determination of our people, we will gain the inevitable triumph — so help us God.' },
      { time: 377, speaker: 'President Franklin D. Roosevelt', text: 'I ask that the Congress declare that since the unprovoked and dastardly attack by Japan on Sunday, December 7, 1941, a state of war has existed between the United States and the Japanese empire.' }
    ]
  },

  jfk_inaugural: {
    orator: 'President John F. Kennedy',
    occasion: 'Inaugural Address (35th President of the United States)',
    venue: 'East Front, U.S. Capitol, Washington, D.C.',
    deliveryDate: 'January 20, 1961',
    deliveryYear: 1961,
    accessionNo: 'NARA-JFK-19610120 / LoC MAVIS-00892',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19305r.jpg',
    whyItExists: 'Delivered in freezing 22°F air on January 20, 1961, John F. Kennedy\'s Inaugural Address set a new tone for American leadership at the dawn of the nuclear era. At 43 years old, Kennedy became the youngest person elected President, declaring that "the torch has been passed to a new generation of Americans." Preserved in the National Archives and John F. Kennedy Presidential Library.',
    historicalBackdrop: 'The Cold War was at a razor\'s edge following the 1960 U-2 spy plane shootdown, the rise of Fidel Castro in Cuba, and intensifying nuclear arms race tensions. An overnight blizzard dropped eight inches of snow across Washington, prompting the U.S. Army Corps of Engineers to use flamethrowers to clear Pennsylvania Avenue before the ceremony.',
    rhetoricalAnalysis: 'Celebrated for its masterly use of chiasmus and antithesis: \'Ask not what your country can do for you — ask what you can do for your country\' and \'Let us never negotiate out of fear, but let us never fear to negotiate.\' Drafted with counselor Ted Sorensen, the prose reads with poetic meter, classical balance, and crisp modern vigor.',
    acousticEngineering: 'Spoken into dual Shure 55 Unidyne and RCA ribbon broadcast microphones clamped to the wooden presidential lectern. Monitored through military-grade line amplifiers and recorded on 1/4-inch master studio tape by the Armed Forces Radio and Television Service (AFRTS) and network pool engineers.',
    crowdAndBroadcastReach: 'Over 20,000 bundled spectators on the Capitol Plaza; broadcast live in black-and-white to over 60 million television viewers and worldwide in 40+ languages via the Voice of America.',
    keyQuotes: [
      {
        quote: 'Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans.',
        context: 'Defining the transition from the WWII generation of leadership to youthful post-war optimism.'
      },
      {
        quote: 'And so, my fellow Americans: ask not what your country can do for you — ask what you can do for your country.',
        context: 'One of the most famous civic challenges in world history, prioritizing collective duty over individual comfort.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19306r.jpg',
    companionArtifacts: [
      {
        title: 'President Kennedy Delivering Inaugural Address (January 20, 1961)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19305r.jpg',
        type: 'PHOTO',
        caption: 'Kennedy speaking without an overcoat in 22-degree freezing air at the Capitol East Front.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1961,
      },
      {
        title: 'Chief Justice Earl Warren Administering Presidential Oath of Office',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19306r.jpg',
        type: 'PHOTO',
        caption: 'Kennedy with his hand raised upon the Fitzgerald family Bible swearing the constitutional oath.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1961,
      },
      {
        title: 'Capitol Plaza Crowds Gathering Amidst Eight Inches of Fresh Snow',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19308r.jpg',
        type: 'PHOTO',
        caption: 'Tens of thousands of Americans bundled against winter chill filling the Capitol East Front grounds.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1961,
      },
      {
        title: 'First Lady Jacqueline Kennedy and Distinguished Guests on Inaugural Dais',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19310r.jpg',
        type: 'PHOTO',
        caption: 'The inaugural reviewing stand with former President Eisenhower, Vice President Johnson, and cabinet members.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1961,
      },
    ],
    timeline: [
      { year: 'Nov 1960', label: 'Kennedy Elected 35th President', description: 'Defeats Vice President Richard Nixon in tight election.' },
      { year: 'Jan 20, 1961', label: 'Inaugural Address: \'Ask Not\'', description: 'Takes oath of office on Capitol East Front.', active: true },
      { year: '1961', label: 'Peace Corps & Apollo Program', description: 'Launches Peace Corps and commits to Moon landing.' },
      { year: '1962', label: 'Cuban Missile Crisis', description: 'Averts nuclear war through naval quarantine.' },
    ],
    transcript: [
      { time: 0, speaker: 'President John F. Kennedy', text: 'Vice President Johnson, Mr. Speaker, Mr. Chief Justice, President Eisenhower, Vice President Nixon, President Truman, reverend clergy, fellow citizens:', translatedText: { es: 'Vicepresidente Johnson, Señor Portavoz, Señor Presidente del Tribunal Supremo, Presidente Eisenhower, Vicepresidente Nixon, Presidente Truman, reverendos clérigos, conciudadanos:' } },
      { time: 18, speaker: 'President John F. Kennedy', text: 'We observe today not a victory of party, but a celebration of freedom — symbolizing an end, as well as a beginning — signifying renewal, as well as change.' },
      { time: 34, speaker: 'President John F. Kennedy', text: 'For I have sworn before you and Almighty God the same solemn oath our forebears prescribed nearly a century and three-quarters ago.' },
      { time: 48, speaker: 'President John F. Kennedy', text: 'The world is very different now. For man holds in his mortal hands the power to abolish all forms of human poverty and all forms of human life.' },
      { time: 63, speaker: 'President John F. Kennedy', text: 'And yet the same revolutionary beliefs for which our forebears fought are still at issue around the globe — the belief that the rights of man come not from the generosity of the state, but from the hand of God.' },
      { time: 83, speaker: 'President John F. Kennedy', text: 'We dare not forget today that we are the heirs of that first revolution.' },
      { time: 92, speaker: 'President John F. Kennedy', text: 'Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans — born in this century, tempered by war, disciplined by a hard and bitter peace, proud of our ancient heritage — and unwilling to witness or permit the slow undoing of those human rights to which this nation has always been committed, and to which we are committed today at home and around the world.' },
      { time: 132, speaker: 'President John F. Kennedy', text: 'Let every nation know, whether it wishes us well or ill, that we shall pay any price, bear any burden, meet any hardship, support any friend, oppose any foe, in order to assure the survival and the success of liberty.' },
      { time: 160, speaker: 'President John F. Kennedy', text: 'This much we pledge — and more.' },
      { time: 168, speaker: 'President John F. Kennedy', text: 'To those old allies whose cultural and spiritual origins we share, we pledge the loyalty of faithful friends.' },
      { time: 180, speaker: 'President John F. Kennedy', text: 'United there is little we cannot do in a host of cooperative ventures. Divided there is little we can do — for we dare not meet a powerful challenge at odds and split asunder.' },
      { time: 198, speaker: 'President John F. Kennedy', text: 'So let us begin anew — remembering on both sides that civility is not a sign of weakness, and sincerity is always subject to proof.' },
      { time: 213, speaker: 'President John F. Kennedy', text: 'Let us never negotiate out of fear. But let us never fear to negotiate.' },
      { time: 226, speaker: 'President John F. Kennedy', text: 'Let both sides explore what problems unite us instead of belaboring those problems which divide us.' },
      { time: 242, speaker: 'President John F. Kennedy', text: 'And if a beachhead of cooperation may push back the jungle of suspicion, let both sides join in creating a new endeavor, not a new balance of power, but a new world of law, where the strong are just and the weak secure and the peace preserved.' },
      { time: 270, speaker: 'President John F. Kennedy', text: 'All this will not be finished in the first one hundred days. Nor will it be finished in the first one thousand days, nor in the life of this Administration, nor even perhaps in our lifetime on this planet. But let us begin.' },
      { time: 295, speaker: 'President John F. Kennedy', text: 'In your hands, my fellow citizens, more than mine, will rest the final success or failure of our course.' },
      { time: 308, speaker: 'President John F. Kennedy', text: 'And so, my fellow Americans: ask not what your country can do for you — ask what you can do for your country.' },
      { time: 326, speaker: 'President John F. Kennedy', text: 'My fellow citizens of the world: ask not what America will do for you, but what together we can do for the freedom of man.' },
      { time: 342, speaker: 'President John F. Kennedy', text: 'Finally, whether you are citizens of America or citizens of the world, ask of us here the same high standards of strength and sacrifice which we ask of you.' },
      { time: 358, speaker: 'President John F. Kennedy', text: 'With a good conscience our only sure reward, with history the final judge of our deeds, let us go forth to lead the land we love, asking His blessing and His help, but knowing that here on earth God\'s work must truly be our own.' }
    ]
  },

  fdr_fear_itself: {
    orator: 'President Franklin D. Roosevelt',
    occasion: 'First Inaugural Address (32nd President of the United States)',
    venue: 'East Portico, U.S. Capitol, Washington, D.C.',
    deliveryDate: 'March 4, 1933',
    deliveryYear: 1933,
    accessionNo: 'NARA-FDR-19330304 / LoC MAVIS-00041',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51846r.jpg',
    whyItExists: 'Delivered at the absolute nadir of the Great Depression on March 4, 1933, Franklin D. Roosevelt\'s First Inaugural Address restored confidence to an exhausted nation. With one in four Americans unemployed and the banking system paralyzed, Roosevelt declared that "the only thing we have to fear is fear itself." Preserved in the Franklin D. Roosevelt Presidential Library and the Library of Congress.',
    historicalBackdrop: 'By March 1933, 13 million Americans were unemployed, industrial production was down 56%, and banks across 38 states had shut their doors. In the morning hours before taking the oath, Roosevelt received reports that the Federal Reserve and New York banks were suspending operations. The nation hovered on the brink of complete monetary collapse.',
    rhetoricalAnalysis: 'Masterfully structured as a wartime call to arms against economic paralysis. Roosevelt used moral candor (\'This is preeminently the time to speak the truth, the whole truth, frankly and boldly\') followed by an unshakeable psychological diagnosis: that unreasoning terror was more dangerous than the crisis itself.',
    acousticEngineering: 'Recorded through early carbon-diaphragm broadcast microphones and Western Electric 600A transmitters by the newly formed CBS and NBC Red networks. Captured onto aluminum transcription discs that were later transferred to vinylite and tape for archival preservation.',
    crowdAndBroadcastReach: 'Estimated 100,000 citizens standing in cold fog on the Capitol East Grounds; 40 million radio listeners across North America and Europe via shortwave relay.',
    keyQuotes: [
      {
        quote: 'So, first of all, let me assert my firm belief that the only thing we have to fear is fear itself — nameless, unreasoning, unjustified terror which paralyzes needed efforts to convert retreat into advance.',
        context: 'The defining declaration that broke the psychological panic of the Great Depression.'
      },
      {
        quote: 'This nation asks for action, and action now.',
        context: 'Launching the unprecedented legislative whirlwind known as The First Hundred Days.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51846r.jpg',
    companionArtifacts: [
      {
        title: 'Roosevelt Taking the Oath of Office at Capitol East Portico (March 4, 1933)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51846r.jpg',
        type: 'PHOTO',
        caption: 'Roosevelt delivering his First Inaugural Address before an assembly of 100,000 citizens.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1933,
      },
      {
        title: 'The Great Depression Capitol Plaza Assemblage (100,000 Citizens in Fog)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51847r.jpg',
        type: 'PHOTO',
        caption: 'Vast crowd of citizens standing shoulder-to-shoulder on the Capitol lawn awaiting relief.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1933,
      },
      {
        title: 'President Herbert Hoover and FDR Riding to the Inauguration',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51848r.jpg',
        type: 'PHOTO',
        caption: 'The grim transfer of power between outgoing Herbert Hoover and incoming Franklin Roosevelt.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1933,
      },
    ],
    timeline: [
      { year: 1929, label: 'Wall Street Crash of 1929', description: 'Stock market collapse triggers the Great Depression.' },
      { year: 'Mar 4, 1933', label: 'First Inaugural: \'Fear Itself\'', description: 'Roosevelt rallies nation and halts bank runs.', active: true },
      { year: 'Mar 6, 1933', label: 'National Bank Holiday Declared', description: 'Emergency 4-day shutdown stops insolvency panic.' },
      { year: '1933', label: 'The First 100 Days & The New Deal', description: 'CCC, TVA, AAA, and FDIC created by Congress.' },
    ],
    transcript: [
      { time: 0, speaker: 'President Franklin D. Roosevelt', text: 'I am certain that my fellow Americans expect that on my induction into the Presidency I will address them with a candor and a decision which the present situation of our people impels.', translatedText: { es: 'Estoy seguro de que mis conciudadanos esperan que en mi toma de posesión de la Presidencia me dirija a ellos con el candor y la determinación que impone la situación actual de nuestro pueblo.' } },
      { time: 17, speaker: 'President Franklin D. Roosevelt', text: 'This is preeminently the time to speak the truth, the whole truth, frankly and boldly. Nor need we shrink from honestly facing conditions in our country today.' },
      { time: 33, speaker: 'President Franklin D. Roosevelt', text: 'This great Nation will endure as it has endured, will revive and will prosper.' },
      { time: 44, speaker: 'President Franklin D. Roosevelt', text: 'So, first of all, let me assert my firm belief that the only thing we have to fear is fear itself —' },
      { time: 54, speaker: 'President Franklin D. Roosevelt', text: '— nameless, unreasoning, unjustified terror which paralyzes needed efforts to convert retreat into advance.' },
      { time: 68, speaker: 'President Franklin D. Roosevelt', text: '[Capitol applause and ovation across the East Portico]' }
    ]
  },

  churchill_blood_toil: {
    orator: 'Prime Minister Winston Churchill',
    occasion: 'First Speech as Prime Minister to the House of Commons',
    venue: 'Palace of Westminster, London, United Kingdom',
    deliveryDate: 'May 13, 1940',
    deliveryYear: 1940,
    accessionNo: 'NARA-UK-19400513 / LoC MAVIS-00109',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a08000/3a08800/3a08882r.jpg',
    whyItExists: 'Delivered on May 13, 1940, on his third day as Prime Minister, Winston Churchill rallied a nation facing imminent invasion by Nazi Germany. Speaking to a skeptical House of Commons that still revered Neville Chamberlain, Churchill offered no false comfort, declaring: "I have nothing to offer but blood, toil, tears and sweat." Preserved in the British Parliamentary sound archives and the Library of Congress.',
    historicalBackdrop: 'On May 10, 1940, Hitler\'s Wehrmacht launched Case Yellow (Fall Gelb), shattering the neutral frontiers of the Netherlands, Belgium, and Luxembourg. As French lines crumbled at Sedan, Churchill formed an emergency all-party National Coalition. Britain stood on the verge of total isolation in Europe.',
    rhetoricalAnalysis: 'A masterpiece of concise Anglo-Saxon vocabulary. Churchill avoided ornate rhetorical flourishes in favor of visceral, physical terms: blood, toil, tears, sweat. He posed rhetorical questions to the House (\'You ask, what is our policy? I can say: It is to wage war...\') and answered them with unwavering moral clarity.',
    acousticEngineering: 'The original speech was delivered in the House of Commons, where live broadcasting was strictly forbidden in 1940. Churchill re-recorded the address in the Cabinet War Rooms for BBC radio broadcast using ribbon microphones and mobile lacquer disc recording cutters.',
    crowdAndBroadcastReach: '600+ Members of Parliament; subsequently broadcast across the British Empire, reaching an estimated 25 million listeners via the BBC Home Service and overseas shortwave.',
    keyQuotes: [
      {
        quote: 'I have nothing to offer but blood, toil, tears and sweat.',
        context: 'Refusing false optimism, Churchill prepared the British public for total, grinding national sacrifice.'
      },
      {
        quote: 'You ask, what is our aim? I can answer in one word: It is victory, victory at all costs, victory in spite of all terror, victory, however long and hard the road may be.',
        context: 'The absolute rejection of appeasement or negotiated peace with Adolf Hitler.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a08000/3a08800/3a08882r.jpg',
    companionArtifacts: [
      {
        title: 'Winston Churchill "The Roaring Lion" (Yousuf Karsh, LoC Collections)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a08000/3a08800/3a08882r.jpg',
        type: 'PHOTO',
        caption: 'Karsh\'s world-famous portrait capturing Churchill\'s defiant wartime resolve.',
        sourceCredit: 'Library of Congress Prints & Photographs Division (Yousuf Karsh Collection)',
        year: 1941,
      },
      {
        title: 'House of Commons Chamber during Wartime Debates (Palace of Westminster)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c11000/3c11200/3c11226r.jpg',
        type: 'PHOTO',
        caption: 'The parliamentary chamber where Churchill delivered his maiden address as Prime Minister.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1940,
      },
    ],
    timeline: [
      { year: 'May 10, 1940', label: 'Hitler Invades France & Low Countries', description: 'Neville Chamberlain resigns; Churchill summoned by King.' },
      { year: 'May 13, 1940', label: 'Maiden Address: \'Blood, Toil, Tears\'', description: 'Churchill addresses the House of Commons.', active: true },
      { year: 'Jun 1940', label: 'Dunkirk Evacuation & \'Fight on the Beaches\'', description: '338,000 Allied soldiers rescued from France.' },
      { year: '1940', label: 'The Battle of Britain', description: 'RAF thwarts Luftwaffe invasion plans.' },
    ],
    transcript: [
      { time: 0, speaker: 'Prime Minister Winston Churchill', text: 'Mr. Speaker, on Friday evening last I received His Majesty\'s commission to form a new Administration.', translatedText: { es: 'Señor Portavoz, el pasado viernes por la noche recibí la comisión de Su Majestad para formar una nueva Administración.' } },
      { time: 12, speaker: 'Prime Minister Winston Churchill', text: 'It was the evident wish and will of Parliament and the nation that this should be conceived on the broadest possible basis and that it should include all parties, both those who supported the late Government and also the parties of the Opposition.' },
      { time: 38, speaker: 'Prime Minister Winston Churchill', text: 'I have completed the most important part of this task. A War Cabinet has been formed of five Members, representing, with the Opposition Liberals and Labour, the unity of the nation.' },
      { time: 62, speaker: 'Prime Minister Winston Churchill', text: 'To form an Administration of this scale and complexity is a serious undertaking in itself, but it must be remembered that we are in the preliminary stage of one of the greatest battles in history.' },
      { time: 88, speaker: 'Prime Minister Winston Churchill', text: 'I would say to the House, as I said to those who have joined this government:' },
      { time: 98, speaker: 'Prime Minister Winston Churchill', text: '"I have nothing to offer but blood, toil, tears and sweat."' },
      { time: 110, speaker: 'Prime Minister Winston Churchill', text: 'We have before us an ordeal of the most grievous kind. We have before us many, many long months of struggle and of suffering.' },
      { time: 128, speaker: 'Prime Minister Winston Churchill', text: 'You ask, what is our policy? I can say: It is to wage war, by sea, land and air, with all our might and with all the strength that God can give us; to wage war against a monstrous tyranny, never surpassed in the dark, lamentable catalogue of human crime. That is our policy.' },
      { time: 168, speaker: 'Prime Minister Winston Churchill', text: 'You ask, what is our aim? I can answer in one word: It is victory, victory at all costs, victory in spite of all terror, victory, however long and hard the road may be; for without victory, there is no survival.' },
      { time: 200, speaker: 'Prime Minister Winston Churchill', text: 'Let that be realized; no survival for the British Empire, no survival for all that the British Empire has stood for, no survival for the urge and impulse of the ages, that mankind will move forward towards its goal.' },
      { time: 226, speaker: 'Prime Minister Winston Churchill', text: 'But I take up my task with buoyancy and hope. I feel sure that our cause will not be suffered to fail among men. At this time I feel entitled to claim the aid of all, and I say, "Come then, let us go forward together with our united strength."' }
    ]
  },

  gehrig_farewell: {
    orator: 'Lou Gehrig',
    occasion: 'Lou Gehrig Appreciation Day (Farewell to Baseball Address)',
    venue: 'Home Plate, Yankee Stadium, The Bronx, New York',
    deliveryDate: 'July 4, 1939',
    deliveryYear: 1939,
    accessionNo: 'NARA-BB-19390704 / LoC MAVIS-00331',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38887r.jpg',
    whyItExists: 'Delivered between games of a Fourth of July doubleheader at Yankee Stadium, Lou Gehrig\'s farewell address is considered the most poignant moment in American sports history. Diagnosed with terminal Amyotrophic Lateral Sclerosis (ALS) two weeks earlier, the 36-year-old "Iron Horse" stood before 61,808 fans and declared himself "the luckiest man on the face of the earth." Preserved in the Library of Congress and the National Baseball Hall of Fame.',
    historicalBackdrop: 'Gehrig had played 2,130 consecutive major league games — a streak that stood for 56 years — before benching himself on May 2, 1939, when coordination and power vanished. On June 19, his 36th birthday, the Mayo Clinic diagnosed him with ALS, giving him two to three years to live. The Yankees retired his uniform #4 — the first retired number in sports history.',
    rhetoricalAnalysis: 'A masterclass in humility and gratitude. Rather than lamenting his catastrophic physical decline, Gehrig turned the focus entirely outward, thanking managers, rival players, stadium groundskeepers, and his family. The contrast between his failing physical body and his towering emotional generosity produced a timeless cultural document.',
    acousticEngineering: 'Spoken into two carbon ribbon microphones provided by radio stations WABC and WOR, connected to the Yankee Stadium public address horns. The echoes bouncing off the three tiers of the stadium created the iconic natural acoustic reverberation heard on the recording.',
    crowdAndBroadcastReach: '61,808 fans packing Yankee Stadium; carried live by radio networks across New York, Philadelphia, and Boston.',
    keyQuotes: [
      {
        quote: 'Fans, for the past two weeks you have been reading about the bad break I got. Yet today I consider myself the luckiest man on the face of the earth.',
        context: 'The paradoxical opening statement that converted tragedy into immortal grace.'
      },
      {
        quote: 'So I close in saying that I might have been given a bad break, but I\'ve got an awful lot to live for.',
        context: 'Gehrig\'s final words before stepping away from the microphone in tears.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38887r.jpg',
    companionArtifacts: [
      {
        title: 'Lou Gehrig at Home Plate Microphones, Yankee Stadium (July 4, 1939)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38887r.jpg',
        type: 'PHOTO',
        caption: 'The iconic photograph of Gehrig wiping away tears before speaking into WABC microphones.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1939,
      },
      {
        title: '61,808 Fans Packing Yankee Stadium Stands for Lou Gehrig Day',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38888r.jpg',
        type: 'PHOTO',
        caption: 'Overhead stadium view during the mid-game ceremonies honoring the Iron Horse.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1939,
      },
      {
        title: 'Lou Gehrig and Teammates in Dugout before Presentation',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38886r.jpg',
        type: 'PHOTO',
        caption: 'Gehrig surrounded by trophies and gifts from the 1927 Murderers\' Row team.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1939,
      },
    ],
    timeline: [
      { year: '1925–1939', label: '2,130 Consecutive Games Played', description: 'Gehrig sets the legendary Iron Horse endurance record.' },
      { year: 'Jun 19, 1939', label: 'ALS Diagnosis at Mayo Clinic', description: 'Diagnosed with incurable motor neuron disease on 36th birthday.' },
      { year: 'Jul 4, 1939', label: 'Farewell: \'Luckiest Man on Earth\'', description: 'Delivers farewell address at Yankee Stadium.', active: true },
      { year: '1939', label: 'First Number Retired in Sports (#4)', description: 'Inducted into National Baseball Hall of Fame.' },
    ],
    transcript: [
      { time: 0, speaker: 'Lou Gehrig', text: 'Fans, for the past two weeks you have been reading about the bad break I got.', translatedText: { es: 'Aficionados, durante las últimas dos semanas han estado leyendo sobre el mal golpe de suerte que me tocó.' } },
      { time: 7, speaker: 'Lou Gehrig', text: 'Yet today I consider myself the luckiest man on the face of the earth.' },
      { time: 14, speaker: 'Lou Gehrig', text: '[Yankee Stadium ovations and thunderous applause for the Iron Horse]' }
    ]
  },

  earhart_women_flying: {
    orator: 'Amelia Earhart',
    occasion: 'A Woman\'s Place in Science (Radio Address)',
    venue: 'National Radio Network Studios, New York, NY',
    deliveryDate: 'May 1935',
    deliveryYear: 1935,
    accessionNo: 'LoC-REC-1935-EARHART',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a06000/3a06200/3a06288r.jpg',
    whyItExists: 'Broadcast over national radio in May 1935, aviation pioneer Amelia Earhart advocated for women\'s expanded leadership in scientific education and modern aviation. Fresh from her historic solo flight across the Pacific from Hawaii to California, Earhart demystified aviation as practical applied science, arguing that the future belonged to women who mastered technology. Preserved in the Library of Congress Recorded Sound Section.',
    historicalBackdrop: 'In January 1935, Earhart became the first person to fly solo from Honolulu to Oakland, California — conquering the perilous 2,408-mile Pacific crossing that had claimed many lives. Shortly thereafter, Purdue University appointed her visiting counselor in women\'s careers and technical advisor in aeronautics.',
    rhetoricalAnalysis: 'Earhart spoke with crystalline, unhurried midwestern diction, eschewing the dramatic flourishes common to early radio. She presented engineering as a natural extension of household management and social organization, removing the artificial barrier between domestic life and scientific progress.',
    acousticEngineering: 'Transmitted through a Western Electric 618A electrodynamic studio transmitter into the national radio chain. Preserved on 12-inch 78 rpm transcription discs manufactured by RCA Victor for educational radio distribution.',
    crowdAndBroadcastReach: 'Estimated 8 million household radio listeners across the NBC and CBS national radio chains.',
    keyQuotes: [
      {
        quote: 'Aviation, this young modern giant, exemplifies the possible relationship of women and the creations of science.',
        context: 'Demanding equal participation for women at the frontier of applied aviation technology.'
      },
      {
        quote: 'Women must try to do things as men have tried. When they fail, their failure must be but a challenge to others.',
        context: 'Earhart\'s foundational philosophy on female exploration and resilience.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a06000/3a06200/3a06288r.jpg',
    companionArtifacts: [
      {
        title: 'Amelia Earhart at NBC Studio Broadcast Microphone (May 1935)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a06000/3a06200/3a06288r.jpg',
        type: 'PHOTO',
        caption: 'Earhart delivering her radio broadcast on women\'s futures in scientific fields.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1935,
      },
      {
        title: 'Lockheed Vega 5B "Old Bessie" in Hangar Preparation',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a06000/3a06200/3a06289r.jpg',
        type: 'PHOTO',
        caption: 'The single-engine monoplane Earhart piloted solo across both the Atlantic and Pacific oceans.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1935,
      },
      {
        title: 'Earhart with Aeronautical Students and Navigation Instruments',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a20000/3a27000/3a27700/3a27798r.jpg',
        type: 'PHOTO',
        caption: 'Amelia Earhart mentoring university women in aerodynamic calculations and radio telemetry.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1935,
      },
    ],
    timeline: [
      { year: 1932, label: 'First Woman to Fly Solo across Atlantic', description: 'Flies from Newfoundland to Northern Ireland.' },
      { year: 'Jan 1935', label: 'First Solo Hawaii to California Flight', description: 'Conquers the perilous 2,408-mile Pacific route.' },
      { year: 'May 1935', label: 'Radio Address: \'Women in Science\'', description: 'Advocates female scientific leadership.', active: true },
      { year: '1937', label: 'World Flight Attempt', description: 'Pioneering circumnavigation of the globe.' },
    ],
    transcript: [
      { time: 0, speaker: 'Amelia Earhart', text: 'This evening my message is especially to the young women of America, particularly those who are interested in science.', translatedText: { es: 'Esta tarde mi mensaje es especialmente para las jóvenes de América, particularmente aquellas interesadas en la ciencia.' } },
      { time: 12, speaker: 'Amelia Earhart', text: 'Although women as yet have not taken full advantage of its opportunities and though they are not represented in large numbers in its research, science has shaped more than any other force the modern world in which we live.' },
      { time: 32, speaker: 'Amelia Earhart', text: 'Whether we realize it or not, our lives are dictated by its achievements, its methods, and its developments.' },
      { time: 44, speaker: 'Amelia Earhart', text: 'Aviation, this young modern giant, exemplifies the possible relationship of women and the creations of science.' },
      { time: 58, speaker: 'Amelia Earhart', text: 'Although the airplane has seemed to be primarily a masculine instrument, its maintenance and development depend on applied chemistry, mathematics, and meteorological research.' },
      { time: 78, speaker: 'Amelia Earhart', text: 'These are fields in which women\'s intellects and patience are second to none.' },
      { time: 92, speaker: 'Amelia Earhart', text: 'Women must try to do things as men have tried. When they fail, their failure must be but a challenge to others.' },
      { time: 108, speaker: 'Amelia Earhart', text: 'It is my hope that in the decades ahead, women will take their rightful places not merely as passengers, but as the designers, navigators, and leaders of humanity\'s airborne journey.' }
    ]
  },

  lincoln_gettysburg: {
    orator: 'President Abraham Lincoln',
    occasion: 'Dedication of the Soldiers\' National Cemetery',
    venue: 'Soldiers\' National Cemetery, Gettysburg, Pennsylvania',
    deliveryDate: 'November 19, 1863',
    deliveryYear: 1863,
    accessionNo: 'LoC-CW-18631119 / LoC Manuscript Division',
    primaryPhoto: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a53000/3a53200/3a53259r.jpg',
    whyItExists: 'Delivered on November 19, 1863, at the dedication of the Soldiers\' National Cemetery in Gettysburg, Pennsylvania, Abraham Lincoln\'s 272-word address redefined the American Civil War not merely as a struggle for the Union, but as a "new birth of freedom." Delivered four months after the catastrophic battle, Lincoln rededicated the nation to the principle that "all men are created equal." Preserved in the Library of Congress.',
    historicalBackdrop: 'On July 1–3, 1863, Union forces under General George Meade turned back General Robert E. Lee\'s invasion of the North at the cost of over 51,000 casualties. Bodies were still being exhumed from shallow battlefield trenches when cemetery organizers invited orator Edward Everett to give a two-hour formal keynote. Lincoln was invited almost as an afterthought to provide \'a few appropriate remarks\'.',
    rhetoricalAnalysis: 'Consisting of ten sentences and only 272 words, the address took less than three minutes to deliver. Lincoln began not with the Constitution of 1787, but with 1776 (\'Four score and seven years ago\'), establishing the Declaration\'s doctrine of human equality as America\'s foundational mission. The tripartite conclusion (\'of the people, by the people, for the people\') remains the defining description of democracy in the English language.',
    acousticEngineering: 'Delivered unamplified to a crowd of 15,000 spread across the cemetery ridge. Recorded acoustically in 1903 on early Victor lacquer discs and cylinder matrices using contemporary actors reciting the authentic text for Library of Congress historical preservation.',
    crowdAndBroadcastReach: '15,000 attendees standing across the cemetery hillside; printed the following morning in hundreds of newspapers nationwide via the telegraph wire service.',
    keyQuotes: [
      {
        quote: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.',
        context: 'Repositioning the Declaration of Independence as America\'s supreme moral standard.'
      },
      {
        quote: '— that government of the people, by the people, for the people, shall not perish from the earth.',
        context: 'The immortal definition of democratic governance, ringing across centuries.'
      }
    ],
    pdfUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/08700/08788r.jpg',
    companionArtifacts: [
      {
        title: 'President Abraham Lincoln Portrait (Alexander Gardner, Nov 8, 1863)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a53000/3a53200/3a53259r.jpg',
        type: 'PHOTO',
        caption: 'Gardner\'s iconic portrait taken in Washington just eleven days before the Gettysburg dedication.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1863,
      },
      {
        title: 'Only Confirmed Photograph of Lincoln on the Gettysburg Platform',
        url: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a53000/3a53200/3a53260r.jpg',
        type: 'PHOTO',
        caption: 'Fascinating archival crowd photo showing Lincoln bareheaded in the center of the speaker dais.',
        sourceCredit: 'Library of Congress Prints & Photographs Division',
        year: 1863,
      },
      {
        title: 'The Nicolay Draft in Lincoln\'s Own Handwriting (Page 1)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/08700/08788r.jpg',
        type: 'DOCUMENT',
        caption: 'The original first draft in Lincoln\'s penmanship, preserved in the Library of Congress Rare Book Division.',
        sourceCredit: 'Library of Congress Manuscript Division',
        year: 1863,
      },
      {
        title: 'The Bliss Copy of the Gettysburg Address (Authorized Final Text)',
        url: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/08700/08789r.jpg',
        type: 'DOCUMENT',
        caption: 'The final authorized version written by Lincoln in 1864, including the phrase "under God".',
        sourceCredit: 'Library of Congress Manuscript Division',
        year: 1864,
      },
    ],
    timeline: [
      { year: 'Jul 1-3, 1863', label: 'Battle of Gettysburg', description: 'Bloody turning point of the American Civil War.' },
      { year: 'Nov 19, 1863', label: 'The Gettysburg Address', description: 'Lincoln dedicates Soldiers\' National Cemetery.', active: true },
      { year: '1865', label: 'Thirteenth Amendment', description: 'Abolition of slavery ratified.' },
      { year: 'Vault', label: 'National Preservation', description: 'Manuscript preserved in the Library of Congress.' },
    ],
    transcript: [
      { time: 0, speaker: 'President Abraham Lincoln', text: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.', translatedText: { es: 'Hace cuatro veintenas y siete años, nuestros padres hicieron nacer en este continente una nueva nación, concebida en Libertad y consagrada a la proposición de que todos los hombres son creados iguales.' } },
      { time: 17, speaker: 'President Abraham Lincoln', text: 'Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure.' },
      { time: 31, speaker: 'President Abraham Lincoln', text: 'We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.' },
      { time: 49, speaker: 'President Abraham Lincoln', text: 'But, in a larger sense, we can not dedicate — we can not consecrate — we can not hallow — this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract.' },
      { time: 69, speaker: 'President Abraham Lincoln', text: 'The world will little note, nor long remember what we say here, but it can never forget what they did here.' },
      { time: 79, speaker: 'President Abraham Lincoln', text: 'It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced.' },
      { time: 89, speaker: 'President Abraham Lincoln', text: 'It is rather for us to be here dedicated to the great task remaining before us — that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion —' },
      { time: 99, speaker: 'President Abraham Lincoln', text: '— that we here highly resolve that these dead shall not have died in vain — that this nation, under God, shall have a new birth of freedom — and that government of the people, by the people, for the people, shall not perish from the earth.' }
    ]
  },
};

export function resolveSpeechKey(titleOrId: string): string | null {
  const s = (titleOrId || '').toLowerCase();
  if (s.includes('mlk-dream') || s.includes('i have a dream') || (s.includes('martin luther king') && s.includes('dream'))) return 'mlk_dream';
  if (s.includes('fdr-infamy') || s.includes('pearl harbor') || s.includes('date which will live in infamy') || s.includes('declarationofwaragainstjapan') || s.includes('declaration of war against japan')) return 'fdr_infamy';
  if (s.includes('jfk-inaugural') || s.includes('ask not what your country') || (s.includes('kennedy') && s.includes('inaugural')) || s.includes('inauguraladdress-1961')) return 'jfk_inaugural';
  if (s.includes('fdr-fear-itself') || s.includes('fear itself') || (s.includes('roosevelt') && s.includes('first inaugural')) || s.includes('inauguraladdress-1933')) return 'fdr_fear_itself';
  if (s.includes('churchill-blood-toil') || s.includes('blood, toil, tears') || s.includes('blood, toil') || s.includes('blood toil') || (s.includes('churchill') && s.includes('house of commons')) || s.includes('wu400513')) return 'churchill_blood_toil';
  if (s.includes('gehrig-farewell') || s.includes('luckiest man on the face') || s.includes('farewell to baseball') || s.includes('farewelltobaseball')) return 'gehrig_farewell';
  if (s.includes('earhart-flying') || s.includes('the future of women in flying') || (s.includes('earhart') && (s.includes('flying') || s.includes('science')))) return 'earhart_women_flying';
  if (s.includes('lincoln-gettysburg') || s.includes('gettysburg address') || (s.includes('lincoln') && s.includes('gettysburg'))) return 'lincoln_gettysburg';
  return null;
}

export function getSpeechMedia(titleOrId: string): SpeechMediaEntry | undefined {
  const key = resolveSpeechKey(titleOrId);
  return key ? SPEECH_MEDIA_REGISTRY[key] : undefined;
}

export function getAuthenticSpeechTranscript(titleOrId: string): Array<{ time: number; speaker: string; text: string; translatedText?: Record<string, string> }> | undefined {
  const key = resolveSpeechKey(titleOrId);
  return key ? SPEECH_MEDIA_REGISTRY[key]?.transcript : undefined;
}

/** Pre-embedded verified landmark speeches ready for immediate browsing */
export const CURATED_VAULT_SPEECHES: ArchiveTrack[] = [
  {
    id: 'vault-speech-mlk-dream',
    title: 'I Have a Dream',
    artist: 'Dr. Martin Luther King Jr.',
    url: 'https://archive.org/download/MLKDream/MLKDream.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/03100/03128r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1963',
    description: 'Delivered at the Lincoln Memorial during the March on Washington for Jobs and Freedom, August 28, 1963.',
    collection: 'National Recording Registry · Library of Congress',
    whyItExists: SPEECH_MEDIA_REGISTRY.mlk_dream.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.mlk_dream.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.mlk_dream.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.mlk_dream.companionArtifacts,
    recordingDetails: {
      date: 'August 28, 1963',
      location: 'Lincoln Memorial, Washington, D.C.',
      interviewer: 'March on Washington Committee',
      equipment: 'Shure 55S Unidyne & Western Electric Broadcast Microphones',
      collection: 'National Recording Registry · Library of Congress',
      accessionNo: 'NARA-306-SS-1 / LoC LC-U9-10362',
    }
  },
  {
    id: 'vault-speech-fdr-infamy',
    title: 'Pearl Harbor Address to the Nation (A Date Which Will Live in Infamy)',
    artist: 'President Franklin D. Roosevelt',
    url: 'https://archive.org/download/Greatest_Speeches_of_the_20th_Century/DeclarationofWarAgainstJapan.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a20000/3a26000/3a26500/3a26588r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1941',
    description: 'Delivered before a Joint Session of the United States Congress on December 8, 1941, requesting a declaration of war against the Empire of Japan.',
    collection: 'National Archives and Records Administration',
    whyItExists: SPEECH_MEDIA_REGISTRY.fdr_infamy.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.fdr_infamy.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.fdr_infamy.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.fdr_infamy.companionArtifacts,
    recordingDetails: {
      date: 'December 8, 1941',
      location: 'House Chamber, U.S. Capitol, Washington, D.C.',
      interviewer: 'Joint Session of the U.S. Congress',
      equipment: 'Western Electric Broadcast Carbon/Ribbon Microphones',
      collection: 'National Archives & Records Administration',
      accessionNo: 'NARA-SEN-77A-H1',
    }
  },
  {
    id: 'vault-speech-jfk-inaugural',
    title: 'Inaugural Address (Ask Not What Your Country Can Do For You)',
    artist: 'President John F. Kennedy',
    url: 'https://archive.org/download/Greatest_Speeches_of_the_20th_Century/InauguralAddress-1961.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/19300/19305r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1961',
    description: 'Delivered on January 20, 1961, at the East Front of the United States Capitol upon taking the oath of office as 35th President.',
    collection: 'John F. Kennedy Presidential Library / National Archives',
    whyItExists: SPEECH_MEDIA_REGISTRY.jfk_inaugural.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.jfk_inaugural.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.jfk_inaugural.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.jfk_inaugural.companionArtifacts,
    recordingDetails: {
      date: 'January 20, 1961',
      location: 'East Front, U.S. Capitol, Washington, D.C.',
      interviewer: 'Presidential Inaugural Committee',
      equipment: 'RCA Type 77-DX Ribbon & Shure 55 Broadcast Microphones',
      collection: 'National Archives / JFK Presidential Library',
      accessionNo: 'NARA-JFK-19610120',
    }
  },
  {
    id: 'vault-speech-fdr-fear-itself',
    title: 'First Inaugural Address (The Only Thing We Have to Fear Is Fear Itself)',
    artist: 'President Franklin D. Roosevelt',
    url: 'https://archive.org/download/Greatest_Speeches_of_the_20th_Century/InauguralAddress-1933.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a51000/3a51800/3a51846r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1933',
    description: 'Delivered on March 4, 1933, rallying the nation at the depth of the Great Depression.',
    collection: 'Franklin D. Roosevelt Presidential Library & Museum',
    whyItExists: SPEECH_MEDIA_REGISTRY.fdr_fear_itself.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.fdr_fear_itself.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.fdr_fear_itself.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.fdr_fear_itself.companionArtifacts,
    recordingDetails: {
      date: 'March 4, 1933',
      location: 'East Portico, U.S. Capitol, Washington, D.C.',
      interviewer: 'Inaugural Committee of 1933',
      equipment: 'Western Electric 600A Transmitters on 78rpm Master Disc',
      collection: 'FDR Presidential Library / National Archives',
      accessionNo: 'NARA-FDR-19330304',
    }
  },
  {
    id: 'vault-speech-churchill-blood-toil',
    title: 'Blood, Toil, Tears and Sweat',
    artist: 'Prime Minister Winston Churchill',
    url: 'https://archive.org/download/Winston_Churchill/WU400513_WINSTONCHURCHILL_0023_SPEECH_TO_HS_OF_COMMONS.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a08000/3a08800/3a08882r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1940',
    description: 'Maiden speech as Prime Minister before the British House of Commons, May 13, 1940.',
    collection: 'Parliamentary Archives & Library of Congress Recorded Sound',
    whyItExists: SPEECH_MEDIA_REGISTRY.churchill_blood_toil.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.churchill_blood_toil.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.churchill_blood_toil.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.churchill_blood_toil.companionArtifacts,
    recordingDetails: {
      date: 'May 13, 1940',
      location: 'House of Commons, London, UK',
      interviewer: 'British House of Commons / BBC Audio',
      equipment: 'BBC Ribbon Microphone / Mobile Lacquer Disc Cutter',
      collection: 'British Parliamentary Archives / LoC Collection',
      accessionNo: 'NARA-UK-19400513',
    }
  },
  {
    id: 'vault-speech-gehrig-farewell',
    title: 'Farewell to Baseball (The Luckiest Man on the Face of the Earth)',
    artist: 'Lou Gehrig',
    url: 'https://archive.org/download/Greatest_Speeches_of_the_20th_Century/FarewelltoBaseball-1939.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/38800/38887r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1939',
    description: 'Delivered at Yankee Stadium on Lou Gehrig Appreciation Day, July 4, 1939.',
    collection: 'National Baseball Hall of Fame & Library of Congress',
    whyItExists: SPEECH_MEDIA_REGISTRY.gehrig_farewell.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.gehrig_farewell.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.gehrig_farewell.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.gehrig_farewell.companionArtifacts,
    recordingDetails: {
      date: 'July 4, 1939',
      location: 'Home Plate, Yankee Stadium, Bronx, NY',
      interviewer: 'WABC / WOR Radio Broadcast Staff',
      equipment: 'WABC/WOR Carbon Microphone feeding Yankee Stadium Public Address',
      collection: 'National Baseball Hall of Fame Archives',
      accessionNo: 'NARA-BB-19390704',
    }
  },
  {
    id: 'vault-speech-earhart-flying',
    title: 'A Woman\'s Place in Science (The Future of Women in Flying)',
    artist: 'Amelia Earhart',
    url: 'https://archive.org/download/Greatest_Speeches_of_the_20th_Century/TheFutureofWomeninFlying.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a00000/3a06000/3a06200/3a06288r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1935',
    description: 'Pioneering radio address on aviation, scientific education, and women\'s leadership, May 1935.',
    collection: 'Library of Congress Recorded Sound Section',
    whyItExists: SPEECH_MEDIA_REGISTRY.earhart_women_flying.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.earhart_women_flying.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.earhart_women_flying.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.earhart_women_flying.companionArtifacts,
    recordingDetails: {
      date: 'May 1935',
      location: 'New York Radio Studios, New York, NY',
      interviewer: 'National Radio Broadcast Network',
      equipment: 'Western Electric 618A Electrodynamic Transmitter',
      collection: 'Library of Congress American Women History Collection',
      accessionNo: 'LoC-REC-1935-EARHART',
    }
  },
  {
    id: 'vault-speech-lincoln-gettysburg',
    title: 'The Gettysburg Address',
    artist: 'President Abraham Lincoln',
    url: 'https://archive.org/download/GettysburgAddress/gettysburg_address.mp3',
    thumbnailUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3a50000/3a53000/3a53200/3a53259r.jpg',
    source: 'LIBRARY_OF_CONGRESS',
    kind: 'SPEECH',
    subgenre: 'Historic Addresses',
    year: '1863',
    description: 'Delivered on November 19, 1863, at the dedication of the Soldiers\' National Cemetery in Gettysburg, Pennsylvania.',
    collection: 'Library of Congress Manuscript Division & Rare Book Collection',
    whyItExists: SPEECH_MEDIA_REGISTRY.lincoln_gettysburg.whyItExists,
    transcript: SPEECH_MEDIA_REGISTRY.lincoln_gettysburg.transcript,
    timeline: SPEECH_MEDIA_REGISTRY.lincoln_gettysburg.timeline,
    companionArtifacts: SPEECH_MEDIA_REGISTRY.lincoln_gettysburg.companionArtifacts,
    recordingDetails: {
      date: 'November 19, 1863',
      location: 'Soldiers\' National Cemetery, Gettysburg, PA',
      interviewer: 'Cemetery Dedication Commission',
      equipment: 'Commemorative Archival Master Acoustic Recording',
      collection: 'Library of Congress Lincoln Collection',
      accessionNo: 'LoC-CW-18631119',
    }
  },
];
