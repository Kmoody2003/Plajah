/**
 * Classic Cinema & Halloween Curation — Directors, Biographies, Portraits & Filmographies.
 *
 * Powers:
 *  - Classic Movies presentation on the Taleo landing page (`MoviesTVView.tsx` & `MoviesSpecificView.tsx`)
 *  - Film detail pages (`MovieUXView.tsx`)
 *  - The Film Historian & Curator (`TaleoFilmCurator.tsx`)
 *
 * Every director entry includes:
 *  - `wikiSlug`: Wikipedia page title for live high-res portrait & full biography lookup via Wikipedia REST API
 *  - `portraitUrl`: Curated Wikimedia Commons / archival portrait fallback for 0-latency display
 *  - `biography`, `signatureStyle`, `legacy`, `movement`, `nationality`, `yearsActive`
 *  - `filmography`: Both playable titles on Plajah Taleo (`archiveIdentifier`) and their broader landmark works
 */

export interface DirectorFilmographyEntry {
  title: string;
  year: string;
  genre: string;
  role?: string;
  /** If this film is playable on Plajah Taleo, its ArchiveVideo identifier or Album ID */
  archiveIdentifier?: string;
  /** Convenience flags populated for UI components */
  isOnPlatform?: boolean;
  platformFilmId?: string;
  /** Short curatorial note on the film's significance */
  note: string;
}

export interface ClassicDirectorProfile {
  id: string;
  name: string;
  ownerUserId?: string;
  wikiSlug: string;
  wikiPageTitle?: string;
  portraitUrl: string;
  birthDeath: string;
  lifespan?: string;
  nationality: string;
  yearsActive: string;
  movement: string;
  tagline: string;
  biography: string;
  bio?: string;
  signatureStyle: string;
  notableCollaborators: string[];
  knownFor?: string[];
  filmography: DirectorFilmographyEntry[];
}

const RAW_CLASSIC_DIRECTORS: ClassicDirectorProfile[] = [
  {
    id: 'george-a-romero',
    name: 'George A. Romero',
    wikiSlug: 'George_A._Romero',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/George_A._Romero_2009_ Venice.jpg/640px-George_A._Romero_2009_Venice.jpg',
    birthDeath: '1940–2017',
    nationality: 'American-Canadian',
    yearsActive: '1960–2017',
    movement: 'New American Independent Horror',
    tagline: 'Godfather of the Modern Zombie & Master of Social Satire',
    biography:
      'Born in New York City and based in Pittsburgh, George A. Romero revolutionized horror cinema in 1968 with Night of the Living Dead. Working outside the Hollywood studio system with his Latent Image production collective, Romero transformed the zombie from Caribbean folklore into an apocalyptic mirror of American racial tension, consumerism, militarism, and class division.',
    signatureStyle:
      'Guerrilla location realism, jagged kinetic editing, mordant socio-political allegory, and unflinching ensemble survival dynamics.',
    notableCollaborators: ['Duane Jones', 'Tom Savini', 'John A. Russo', 'Richard P. Rubinstein', 'Stephen King'],
    filmography: [
      {
        title: 'Night of the Living Dead',
        year: '1968',
        genre: 'Horror',
        role: 'Director · Co-Writer · Cinematographer · Editor',
        archiveIdentifier: 'Night.Of.The.Living.Dead_1080p',
        note: 'Invented the modern flesh-eating ghoul and entered the Library of Congress National Film Registry.',
      },
      {
        title: 'The Crazies',
        year: '1973',
        genre: 'Sci-Fi Thriller',
        role: 'Director · Writer',
        note: 'Paranoid biological-weapon outbreak thriller dissecting military containment in small-town Pennsylvania.',
      },
      {
        title: 'Martin',
        year: '1977',
        genre: 'Psychological Horror',
        role: 'Director · Writer',
        note: 'Romero’s personal favorite among his own films—a melancholic, realistic deconstruction of the vampire myth.',
      },
      {
        title: 'Dawn of the Dead',
        year: '1978',
        genre: 'Horror · Satire',
        role: 'Director · Writer · Editor',
        note: 'Landmark consumerist satire set inside the Monroeville Mall during a full-scale undead collapse.',
      },
      {
        title: 'Creepshow',
        year: '1982',
        genre: 'Horror Anthology',
        role: 'Director',
        note: 'Vibrant EC Comics tribute written by Stephen King with makeup effects by Tom Savini.',
      },
      {
        title: 'Day of the Dead',
        year: '1985',
        genre: 'Horror · Sci-Fi',
        role: 'Director · Writer',
        note: 'Claustrophobic underground bunker conflict between scientists and soldiers featuring "Bub" the domesticated zombie.',
      },
      {
        title: 'Land of the Dead',
        year: '2005',
        genre: 'Horror · Action',
        role: 'Director · Writer',
        note: 'Post-apocalyptic class critique pitting luxury skyscraper elites against the fortified streets below.',
      },
    ],
  },
  {
    id: 'kim-ki-young',
    name: 'Kim Ki-young',
    wikiSlug: 'Kim_Ki-young',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/The_Housemaid_%281960_film%29_poster.jpg/640px-The_Housemaid_%281960_film%29_poster.jpg',
    birthDeath: '1919–1998',
    nationality: 'South Korean',
    yearsActive: '1955–1995',
    movement: 'Korean Golden Age Psychological Gothic',
    tagline: 'Korea’s Visionary Auteur of Domestic Obsession & Class Terror',
    biography:
      'Trained as a medical doctor and dentist at Seoul National University before turning to theatre and cinema, Kim Ki-young became South Korea’s most audacious psychological auteur. His 1960 masterpiece The Housemaid (하녀) turned the modernizing two-story Korean home into a pressure cooker of class warfare and desire—cited by Bong Joon-ho as the direct artistic blueprint for Parasite (2019).',
    signatureStyle:
      'Claustrophobic vertical staircase blocking, expressionist thunder-and-rain lighting, grotesque psychological intensity, and subversive critiques of bourgeois morality.',
    notableCollaborators: ['Kim Jin-kyu', 'Lee Eun-shim', 'Ju Jeung-ryu', 'Youn Yuh-jung'],
    filmography: [
      {
        title: 'The Housemaid (하녀)',
        year: '1960',
        genre: 'Thriller · Horror',
        role: 'Director · Writer · Producer',
        archiveIdentifier: 'kofa-the-housemaid-1960',
        note: 'Restored in 4K by KOFA and Martin Scorsese’s World Cinema Project; the foundational classic of Korean thriller cinema.',
      },
      {
        title: 'Yangsan Province (양산도)',
        year: '1955',
        genre: 'Historical Drama',
        role: 'Director',
        note: 'Early surviving Joseon-era tragic drama exploring feudal oppression and class revolt.',
      },
      {
        title: 'Goryeojang (고려장)',
        year: '1963',
        genre: 'Folk Horror · Drama',
        role: 'Director · Writer',
        note: 'Stark, haunting allegory about famine, superstition, and the ancient custom of abandoning elders in the mountains.',
      },
      {
        title: 'Woman of Fire (화녀)',
        year: '1971',
        genre: 'Psychological Thriller',
        role: 'Director · Writer',
        note: 'Color reimagining of The Housemaid that launched Oscar-winner Youn Yuh-jung’s screen career.',
      },
      {
        title: 'The Insect Woman (충녀)',
        year: '1972',
        genre: 'Psychological Horror',
        role: 'Director · Writer',
        note: 'Fierce psychosexual satire of urban industrialization and marital disintegration.',
      },
      {
        title: 'Io Island (이어도)',
        year: '1977',
        genre: 'Mystery · Folk Horror',
        role: 'Director',
        note: 'Hypnotic shamanistic mystery set on a mythical island inhabited exclusively by diving women.',
      },
    ],
  },
  {
    id: 'fw-murnau',
    name: 'F.W. Murnau',
    wikiSlug: 'F._W._Murnau',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Friedrich_Wilhelm_Murnau.jpg/640px-Friedrich_Wilhelm_Murnau.jpg',
    birthDeath: '1888–1931',
    nationality: 'German',
    yearsActive: '1919–1931',
    movement: 'German Expressionism & Kammerspielfilm',
    tagline: 'Poet of Shadows, Unchained Camera & Silent Terror',
    biography:
      'Friedrich Wilhelm Murnau studied art history and literature at Heidelberg before serving as a WWI combat pilot and emerging as one of silent cinema’s greatest visual poets. With Nosferatu (1922), The Last Laugh (1924), Faust (1926), and Sunrise (1927), Murnau liberated the motion picture camera from the tripod, pioneering fluid tracking shots and atmospheric naturalism.',
    signatureStyle:
      'The "unchained camera" (entfesselte Kamera), spectral chiaroscuro shadows, real natural landscapes infused with supernatural dread, and visual storytelling that minimizes intertitles.',
    notableCollaborators: ['Max Schreck', 'Emil Jannings', 'Karl Freund', 'Fritz Arno Wagner', 'Carl Mayer'],
    filmography: [
      {
        title: 'Nosferatu: Eine Symphonie des Grauens',
        year: '1922',
        genre: 'Horror',
        role: 'Director',
        archiveIdentifier: 'europeana-nosferatu-1922',
        note: 'The seminal vampire film starring Max Schreck as Count Orlok, filmed on location in Wismar and the High Tatras.',
      },
      {
        title: 'The Last Laugh (Der letzte Mann)',
        year: '1924',
        genre: 'Drama',
        role: 'Director',
        archiveIdentifier: 'murnau-last-laugh-1924',
        note: 'Revolutionary Kammerspielfilm told almost entirely without intertitles through Karl Freund’s moving camera.',
      },
      {
        title: 'Faust',
        year: '1926',
        genre: 'Fantasy · Gothic',
        role: 'Director',
        archiveIdentifier: 'murnau-faust-1926',
        note: 'Monumental UFA production blending Renaissance painting compositions with dazzling special-effects alchemy.',
      },
      {
        title: 'Sunrise: A Song of Two Humans',
        year: '1927',
        genre: 'Romance · Thriller',
        role: 'Director',
        archiveIdentifier: 'murnau-sunrise-1927',
        note: 'Winner of the Academy Award for Unique and Artistic Picture at the very first Oscars ceremony.',
      },
      {
        title: 'City Girl',
        year: '1930',
        genre: 'Drama',
        role: 'Director',
        archiveIdentifier: 'murnau-city-girl-1930',
        note: 'Luminous rural drama filmed in Oregon wheat fields that later inspired Terrence Malick’s Days of Heaven.',
      },
      {
        title: 'Tabu: A Story of the South Seas',
        year: '1931',
        genre: 'Docu-Fiction · Romance',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'murnau-tabu-1931',
        note: 'Co-created with documentarian Robert Flaherty in Bora Bora just before Murnau’s untimely death.',
      },
    ],
  },
  {
    id: 'william-castle',
    name: 'William Castle',
    wikiSlug: 'William_Castle',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/William_Castle_1963.JPG/640px-William_Castle_1963.JPG',
    birthDeath: '1914–1977',
    nationality: 'American',
    yearsActive: '1939–1975',
    movement: 'Mid-Century Macabre & Interactive Showman Horror',
    tagline: 'The Hitchcock of the B-Movie & King of Theatrical Gimmicks',
    biography:
      'Starting on Broadway with Orson Welles’ Mercury Theatre before directing Columbia B-noirs, William Castle reinvented theatrical moviegoing in the late 1950s. Pairing deliciously gothic scripts with interactive auditorium stunts—like "Emergo" (flying skeletons over the audience in House on Haunted Hill) and "Percepto" (wired vibrating seats in The Tingler)—Castle turned horror screenings into communal rollercoasters.',
    signatureStyle:
      'Direct-to-camera showman prologues, sardonic parlor-room suspense, architectural gothic mansions, and fourth-wall-breaking audience participation.',
    notableCollaborators: ['Vincent Price', 'Robb White', 'Joan Crawford', 'Roman Polanski'],
    filmography: [
      {
        title: 'House on Haunted Hill',
        year: '1959',
        genre: 'Horror · Mystery',
        role: 'Director · Producer',
        archiveIdentifier: 'house_on_haunted_hill_ipod',
        note: 'Starring Vincent Price as eccentric millionaire Frederick Loren in cinema’s definitive haunted-mansion party.',
      },
      {
        title: 'Macabre',
        year: '1958',
        genre: 'Thriller · Horror',
        role: 'Director · Producer',
        note: 'Issued every ticket-buyer a $1,000 Lloyd’s of London life-insurance policy in case they died of fright.',
      },
      {
        title: 'The Tingler',
        year: '1959',
        genre: 'Sci-Fi Horror',
        role: 'Director · Producer',
        note: 'Vincent Price discovers a spinal parasite that can only be defeated by screaming in a darkened movie theater.',
      },
      {
        title: '13 Ghosts',
        year: '1960',
        genre: 'Supernatural Horror',
        role: 'Director · Producer',
        note: 'Released in "Illusion-O," giving audiences red-and-blue viewers to choose whether to see or hide the ghosts.',
      },
      {
        title: 'Homicidal',
        year: '1961',
        genre: 'Slasher · Thriller',
        role: 'Director · Producer',
        note: 'Psychosexual thriller featuring a "Fright Break" timer allowing terrified patrons to exit for a refund.',
      },
      {
        title: 'Strait-Jacket',
        year: '1964',
        genre: 'Psychological Horror',
        role: 'Director · Producer',
        note: 'Written by Psycho author Robert Bloch and starring Joan Crawford.',
      },
      {
        title: 'Rosemary’s Baby',
        year: '1968',
        genre: 'Occult Psychological Horror',
        role: 'Producer',
        note: 'Castle optioned Ira Levin’s novel and produced Roman Polanski’s Academy Award-winning classic.',
      },
    ],
  },
  {
    id: 'fritz-lang',
    name: 'Fritz Lang',
    wikiSlug: 'Fritz_Lang',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Fritz_Lang_1926.jpg/640px-Fritz_Lang_1926.jpg',
    birthDeath: '1890–1976',
    nationality: 'Austrian-American',
    yearsActive: '1919–1960',
    movement: 'German Expressionism & American Film Noir',
    tagline: 'Master of Monumental Futurism, Fate & Film Noir',
    biography:
      'Born in Vienna and trained in architecture and painting, Fritz Lang defined two separate golden eras of world cinema. In Weimar Germany, he directed monumental epics including Dr. Mabuse, Die Nibelungen, Metropolis (1927), and the chilling sound thriller M (1931). Fleeing Nazi Germany in 1933, Lang came to Hollywood where he became a founding architect of American Film Noir with Fury, Scarlet Street, and The Big Heat.',
    signatureStyle:
      'Architectural geometry, inexorable clockwork fate, stark high-contrast shadow patterns, and paranoid critiques of surveillance and mob justice.',
    notableCollaborators: ['Brigitte Helm', 'Peter Lorre', 'Karl Freund', 'Edward G. Robinson', 'Glenn Ford'],
    filmography: [
      {
        title: 'Metropolis',
        year: '1927',
        genre: 'Sci-Fi · Expressionism',
        role: 'Director · Co-Story',
        archiveIdentifier: 'europeana-metropolis-1927',
        note: 'The towering German Expressionist dystopian epic that invented the visual grammar of modern science fiction.',
      },
      {
        title: 'Dr. Mabuse the Gambler',
        year: '1922',
        genre: 'Crime Thriller',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'lang-mabuse-1922',
        note: 'Four-hour Weimar crime tapestry about a master of disguise manipulating stock markets and minds.',
      },
      {
        title: 'Die Nibelungen',
        year: '1924',
        genre: 'Fantasy Epic',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'lang-nibelungen-1924',
        note: 'Two-part mythological saga famed for its symmetrical architectural sets and dragon effects.',
      },
      {
        title: 'M',
        year: '1931',
        genre: 'Crime · Psychological Thriller',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'lang-m-1931',
        note: 'Lang’s first sound film, starring Peter Lorre; pioneered the procedural thriller and sonic leitmotif.',
      },
      {
        title: 'Fury',
        year: '1936',
        genre: 'Drama · Noir',
        role: 'Director · Co-Writer',
        note: 'Lang’s searing American debut starring Spencer Tracy as an innocent man targeted by a lynch mob.',
      },
      {
        title: 'Scarlet Street',
        year: '1945',
        genre: 'Film Noir',
        role: 'Director · Producer',
        archiveIdentifier: 'lang-scarlet-street-1945',
        note: 'Fatalistic Greenwich Village noir reuniting Edward G. Robinson, Joan Bennett, and Dan Duryea.',
      },
      {
        title: 'The Big Heat',
        year: '1953',
        genre: 'Film Noir',
        role: 'Director',
        note: 'Brutal, razor-sharp syndicate crime classic starring Glenn Ford and Gloria Grahame.',
      },
    ],
  },
  {
    id: 'herk-harvey',
    name: 'Herk Harvey',
    wikiSlug: 'Herk_Harvey',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Carnival_of_Souls_%281962%29_pressbook_cover.jpg/640px-Carnival_of_Souls_%281962%29_pressbook_cover.jpg',
    birthDeath: '1924–1996',
    nationality: 'American',
    yearsActive: '1950–1985',
    movement: 'American Indie Psychological Gothic',
    tagline: 'Architect of Dreamlike Alienation & Regional Gothic',
    biography:
      'Based in Lawrence, Kansas, Harold "Herk" Harvey directed over 400 educational and industrial shorts for the Centron Corporation before driving past the abandoned Saltair Pavilion on Utah’s Great Salt Lake at dusk. In three weeks on a $33,000 budget, Harvey directed Carnival of Souls (1962)—also playing the film’s iconic corpse-faced ghoul ("The Man") himself—creating a haunting masterwork that shaped David Lynch, George Romero, and M. Night Shyamalan.',
    signatureStyle:
      'Spectral daylight surrealism, hypnotic pipe-organ soundscapes, existential isolation, and documentary-honed location framing.',
    notableCollaborators: ['Candace Hilligoss', 'John Clifford', 'Gene Moore', 'Maurice Prather'],
    filmography: [
      {
        title: 'Carnival of Souls',
        year: '1962',
        genre: 'Psychological Horror',
        role: 'Director · Producer · Actor ("The Man")',
        archiveIdentifier: 'CarnivalofSouls',
        note: 'Criterion-celebrated regional horror landmark filmed at the abandoned Saltair Pavilion in Utah.',
      },
      {
        title: 'Why Study Industrial Arts?',
        year: '1956',
        genre: 'Educational Short',
        role: 'Director',
        note: 'Classic mid-century Centron classroom short demonstrating Harvey’s crisp visual economy.',
      },
      {
        title: 'Shake Hands with Danger',
        year: '1980',
        genre: 'Industrial Safety Cult Short',
        role: 'Director · Producer',
        archiveIdentifier: 'harvey-shake-hands-danger-1980',
        note: 'Cult heavy-machinery safety film famous for its gritty practical stunts and theme song.',
      },
    ],
  },
  {
    id: 'roger-corman',
    name: 'Roger Corman',
    wikiSlug: 'Roger_Corman',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Roger_Corman_2013.jpg/640px-Roger_Corman_2013.jpg',
    birthDeath: '1926–2024',
    nationality: 'American',
    yearsActive: '1954–2024',
    movement: 'Poe-Cycle Technicolor Gothic & New Hollywood Mentor',
    tagline: 'Pope of Pop Cinema & Mentor to New Hollywood',
    biography:
      'Recipient of an Honorary Academy Award, Roger Corman directed over 50 films and produced more than 400. His 1960s Edgar Allan Poe cycle for American International Pictures brought lush Pathécolor Gothic atmosphere to American screens, while his "Corman Film School" launched the careers of Francis Ford Coppola, Martin Scorsese, Jack Nicholson, James Cameron, Ron Howard, and Jonathan Demme.',
    signatureStyle:
      'Saturated Gothic color palettes, fog-shrouded castles, lightning-fast guerrilla production schedules, and subversive black humor.',
    notableCollaborators: ['Vincent Price', 'Boris Karloff', 'Jack Nicholson', 'Francis Ford Coppola', 'Floyd Crosby'],
    filmography: [
      {
        title: 'The Terror',
        year: '1963',
        genre: 'Gothic Horror',
        role: 'Director · Producer',
        archiveIdentifier: 'TheTerror1963',
        note: 'Starring Boris Karloff and a young Jack Nicholson, with second-unit direction by Francis Ford Coppola.',
      },
      {
        title: 'A Bucket of Blood',
        year: '1959',
        genre: 'Horror Comedy',
        role: 'Director · Producer',
        archiveIdentifier: 'corman-bucket-of-blood-1959',
        note: 'Razor-sharp beatnik satire shot in five days about a busboy who turns corpses into avant-garde sculptures.',
      },
      {
        title: 'The Little Shop of Horrors',
        year: '1960',
        genre: 'Horror Comedy',
        role: 'Director · Producer',
        archiveIdentifier: 'corman-little-shop-1960',
        note: 'Shot in two days and one night on standing sets; features Jack Nicholson’s unforgettable masochistic dental patient.',
      },
      {
        title: 'House of Usher',
        year: '1960',
        genre: 'Gothic Horror',
        role: 'Director · Producer',
        archiveIdentifier: 'corman-house-of-usher-1960',
        note: 'Edgar Allan Poe Gothic adaptation; preserved in the National Film Registry.',
      },
      {
        title: 'Dementia 13 (Producer)',
        year: '1963',
        genre: 'Gothic Horror',
        role: 'Producer (Directed by Francis Ford Coppola)',
        archiveIdentifier: 'us-dementia-13-1963',
        note: 'Francis Ford Coppola’s directorial debut, greenlit by Corman in Ireland after The Young Racers.',
      },
      {
        title: 'The Pit and the Pendulum',
        year: '1961',
        genre: 'Gothic Horror',
        role: 'Director · Producer',
        note: 'Spanish Inquisition nightmare starring Vincent Price and Barbara Steele.',
      },
      {
        title: 'The Intruder',
        year: '1962',
        genre: 'Social Drama',
        role: 'Director · Producer',
        note: 'Fearless civil-rights drama starring William Shatner, filmed on location in the American South.',
      },
      {
        title: 'The Masque of the Red Death',
        year: '1964',
        genre: 'Gothic Horror',
        role: 'Director · Producer',
        note: 'Photographed by Nicolas Roeg in sumptuous color; admired by Ingmar Bergman and Akira Kurosawa.',
      },
    ],
  },
  {
    id: 'benjamin-christensen',
    name: 'Benjamin Christensen',
    wikiSlug: 'Benjamin_Christensen',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Benjamin_Christensen_1922.jpg/640px-Benjamin_Christensen_1922.jpg',
    birthDeath: '1879–1959',
    nationality: 'Danish',
    yearsActive: '1911–1942',
    movement: 'Scandinavian Silent Golden Age & Occult Essay Cinema',
    tagline: 'Pioneer of Visual Essay Cinema, Chiaroscuro & Occult Tableaux',
    biography:
      'Originally trained in medicine and as an opera singer with the Royal Danish Theatre, Benjamin Christensen revolutionized silent film lighting and mise-en-scène with The Mysterious X (1914) before spending three years researching medieval inquisitorial manuals to create Häxan: Witchcraft Through the Ages (1922)—where he also played the horned Devil himself.',
    signatureStyle:
      'Silhouette chiaroscuro lighting, living medieval woodcut compositions, hybrid documentary-dramatic structure, and psychological empathy for persecuted outsiders.',
    notableCollaborators: ['Johan Ankerstjerne', 'Maren Pedersen', 'Clara Pontoppidan', 'Lon Chaney'],
    filmography: [
      {
        title: 'Häxan: Witchcraft Through the Ages',
        year: '1922',
        genre: 'Horror · Essay Documentary',
        role: 'Director · Writer · Actor ("The Devil")',
        archiveIdentifier: 'Haxan_tinted_and_subtitled',
        note: 'Audacious seven-part silent visual essay tracing demonology, witch trials, and hysteria from the Middle Ages to modernity.',
      },
      {
        title: 'The Mysterious X (Det hemmelighedsfulde X)',
        year: '1914',
        genre: 'Espionage Thriller',
        role: 'Director · Writer · Lead Actor',
        archiveIdentifier: 'christensen-mysterious-x-1914',
        note: 'Groundbreaking espionage thriller whose low-key shadow cinematography stunned European critics.',
      },
      {
        title: 'Night of Revenge (Hævnens Nat)',
        year: '1916',
        genre: 'Suspense Melodrama',
        role: 'Director · Writer · Lead Actor',
        note: 'Masterful deep-focus suspense drama filmed in Denmark.',
      },
      {
        title: 'Mockery',
        year: '1927',
        genre: 'Drama · Horror',
        role: 'Director · Writer',
        note: 'MGM Hollywood production starring Lon Chaney during the Russian Revolution.',
      },
      {
        title: 'Seven Footprints to Satan',
        year: '1929',
        genre: 'Mystery · Horror Comedy',
        role: 'Director',
        archiveIdentifier: 'christensen-seven-footprints-1929',
        note: 'Delirious haunted-mansion mystery thriller starring Thelma Todd and Creighton Hale.',
      },
    ],
  },
  {
    id: 'robert-wiene',
    name: 'Robert Wiene',
    wikiSlug: 'Robert_Wiene',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Cabinet_of_Dr._Caligari_poster.jpg/640px-The_Cabinet_of_Dr._Caligari_poster.jpg',
    birthDeath: '1873–1938',
    nationality: 'German',
    yearsActive: '1912–1938',
    movement: 'German Expressionism',
    tagline: 'Architect of Painted Delirium & Expressionist Cinema',
    biography:
      'Son of a celebrated Dresden stage actor, Robert Wiene studied law at the University of Berlin before managing Weimar theatres and entering film. With The Cabinet of Dr. Caligari (1920), Wiene and art directors Hermann Warm, Walter Reimann, and Walter Röhrig shattered realist cinema by painting jagged shadows and warped geometry directly onto canvas sets to externalize a madman’s mind.',
    signatureStyle:
      'Twisted expressionist set design, painted diagonal shadows, unreliable framing narratives, and somnambulist performance choreography.',
    notableCollaborators: ['Conrad Veidt', 'Werner Krauss', 'Hermann Warm', 'Carl Mayer'],
    filmography: [
      {
        title: 'The Cabinet of Dr. Caligari',
        year: '1920',
        genre: 'Horror · Expressionism',
        role: 'Director',
        archiveIdentifier: 'europeana-caligari-1920',
        note: 'The foundational masterpiece of German Expressionist horror starring Werner Krauss and Conrad Veidt.',
      },
      {
        title: 'Genuine: A Tale of a Vampire',
        year: '1920',
        genre: 'Expressionist Horror',
        role: 'Director',
        archiveIdentifier: 'wiene-genuine-1920',
        note: 'Extravagant follow-up to Caligari with avant-garde sets by Cesar Klein.',
      },
      {
        title: 'Raskolnikow (Crime and Punishment)',
        year: '1923',
        genre: 'Psychological Expressionism',
        role: 'Director · Writer',
        archiveIdentifier: 'wiene-raskolnikow-1923',
        note: 'Expressionist adaptation of Dostoevsky’s novel performed by actors from the Moscow Art Theatre.',
      },
      {
        title: 'The Hands of Orlac (Orlacs Hände)',
        year: '1924',
        genre: 'Body Horror · Thriller',
        role: 'Director',
        note: 'Reunites Wiene and Conrad Veidt as a concert pianist who receives the transplanted hands of an executed murderer.',
      },
    ],
  },
  {
    id: 'rupert-julian',
    name: 'Rupert Julian',
    wikiSlug: 'Rupert_Julian',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Rupert_Julian_1924.jpg/640px-Rupert_Julian_1924.jpg',
    birthDeath: '1879–1943',
    nationality: 'New Zealand-American',
    yearsActive: '1913–1930',
    movement: 'Golden Age Silent Gothic',
    tagline: 'Grand Showman of Silent Hollywood Spectacle & Gothic Opera',
    biography:
      'Born in Whangaroa, New Zealand, Rupert Julian acted on stage in Australia and New York before becoming a leading Universal Pictures director. When Erich von Stroheim was taken off Merry-Go-Round (1923), Julian completed the lavish production and was subsequently tapped to helm Lon Chaney’s monumental The Phantom of the Opera (1925) on Universal’s legendary Stage 28.',
    signatureStyle:
      'Lavish operatic staging, cavernous subterranean lighting, two-strip Technicolor pageantry, and grand crowd choreography.',
    notableCollaborators: ['Lon Chaney', 'Mary Philbin', 'Norman Kerry', 'Charles Van Enger'],
    filmography: [
      {
        title: 'The Phantom of the Opera',
        year: '1925',
        genre: 'Gothic Horror',
        role: 'Director',
        archiveIdentifier: 'ThePhantomoftheOpera',
        note: 'Universal’s silent gothic landmark starring Lon Chaney as Erik the Phantom beneath the Paris Opera House.',
      },
      {
        title: 'The Kaiser, the Beast of Berlin',
        year: '1918',
        genre: 'WWI Drama',
        role: 'Director · Lead Actor',
        note: 'Sensational wartime box-office hit that established Julian as a major Universal filmmaker.',
      },
      {
        title: 'Merry-Go-Round',
        year: '1923',
        genre: 'Romantic Drama',
        role: 'Director (completed after Erich von Stroheim)',
        note: 'Sumptuous Viennese drama starring Norman Kerry and Mary Philbin.',
      },
      {
        title: 'The Cat Creeps',
        year: '1930',
        genre: 'Old Dark House Mystery',
        role: 'Director',
        note: 'Early sound remake of The Cat and the Canary set in a stormy island mansion.',
      },
    ],
  },
  {
    id: 'eugenio-martin',
    name: 'Eugenio Martín',
    wikiSlug: 'Eugenio_Mart%C3%ADn',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Horror_Express_1972_still.jpg/640px-Horror_Express_1972_still.jpg',
    birthDeath: '1925–2023',
    nationality: 'Spanish',
    yearsActive: '1956–1996',
    movement: 'Euro-Gothic Horror & Spaghetti Western',
    tagline: 'Master of Claustrophobic Euro-Cult Suspense & Frontier Action',
    biography:
      'Born in Granada and educated at the Official Film School in Madrid, Eugenio Martín became one of European genre cinema’s most versatile craftsmen. Working seamlessly across Spanish, British, and Italian co-productions, he directed the beloved sci-fi horror classic Horror Express (1972) pairing Christopher Lee, Peter Cushing, and Telly Savalas—a film John Carpenter later echoed in The Thing.',
    signatureStyle:
      'Tightly wound confined-space suspense, lush color lighting in period settings, and brisk international ensemble pacing.',
    notableCollaborators: ['Christopher Lee', 'Peter Cushing', 'Telly Savalas', 'Lee Van Cleef'],
    filmography: [
      {
        title: 'Horror Express (Pánico en el Transiberiano)',
        year: '1972',
        genre: 'Horror · Sci-Fi',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'Horror_Express',
        note: 'Winner of the Grand Prize Jury Award at the Sitges Film Festival; stars Christopher Lee and Peter Cushing.',
      },
      {
        title: 'The Ugly Ones (El precio de un hombre)',
        year: '1966',
        genre: 'Spaghetti Western',
        role: 'Director · Co-Writer',
        note: 'Gritty, critically acclaimed revisionist Western starring Tomas Milian.',
      },
      {
        title: 'Bad Man’s River',
        year: '1971',
        genre: 'Western Comedy',
        role: 'Director · Co-Writer',
        note: 'Action-packed Mexican Revolution adventure starring Lee Van Cleef, James Mason, and Gina Lollobrigida.',
      },
      {
        title: 'A Candle for the Devil (Una vela para el diablo)',
        year: '1973',
        genre: 'Psychological Slasher',
        role: 'Director · Co-Writer',
        note: 'Subversive Spanish gothic thriller dissecting religious hypocrisy in a provincial inn.',
      },
    ],
  },
  {
    id: 'victor-halperin',
    name: 'Victor Halperin',
    wikiSlug: 'Victor_Halperin',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/White_Zombie_1932_poster.jpg/640px-White_Zombie_1932_poster.jpg',
    birthDeath: '1895–1983',
    nationality: 'American',
    yearsActive: '1922–1942',
    movement: 'Pre-Code Gothic Horror',
    tagline: 'Director of Cinema’s First Feature-Length Zombie Nightmare',
    biography:
      'Born in Chicago and working alongside his producer brother Edward Halperin, Victor Halperin achieved horror immortality in 1932 with White Zombie. Renting standing Universal sets at night and casting Bela Lugosi fresh off Dracula, Halperin crafted a dreamlike, Pre-Code fairy-tale nightmare that introduced the word and figure of the "zombie" to world cinema.',
    signatureStyle:
      'Gauzy Pre-Code optical superimpositions, hypnotic close-ups of eyes, eerie sound-design silences, and gothic shadow arches.',
    notableCollaborators: ['Bela Lugosi', 'Madge Bellamy', 'Carole Lombard', 'Arthur Martinelli'],
    filmography: [
      {
        title: 'White Zombie',
        year: '1932',
        genre: 'Horror',
        role: 'Director',
        archiveIdentifier: 'white_zombie',
        note: 'Cinema’s first feature-length zombie motion picture, starring Bela Lugosi as "Murder" Legendre.',
      },
      {
        title: 'Party Girl',
        year: '1930',
        genre: 'Pre-Code Drama',
        role: 'Director',
        note: 'Pre-Code exposé drama starring Douglas Fairbanks Jr.',
      },
      {
        title: 'Supernatural',
        year: '1933',
        genre: 'Supernatural Thriller',
        role: 'Director · Producer',
        archiveIdentifier: 'halperin-supernatural-1933',
        note: 'Pre-Code spirit-possession thriller starring Carole Lombard in her only horror film role.',
      },
      {
        title: 'Revolt of the Zombies',
        year: '1936',
        genre: 'Horror · Adventure',
        role: 'Director',
        archiveIdentifier: 'halperin-revolt-of-zombies-1936',
        note: 'Thematic sequel to White Zombie set amid ancient Cambodian temple ruins.',
      },
    ],
  },
  {
    id: 't-hayes-hunter',
    name: 'T. Hayes Hunter',
    wikiSlug: 'T._Hayes_Hunter',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/The_Ghoul_%281933%29_poster.jpg/640px-The_Ghoul_%281933%29_poster.jpg',
    birthDeath: '1884–1944',
    nationality: 'American-British',
    yearsActive: '1912–1934',
    movement: 'British Gothic & Early Silent Pioneer',
    tagline: 'Transatlantic Pioneer of Early Thrillers & British Gothic Horror',
    biography:
      'Born in Philadelphia, Thomas Hayes Hunter began directing silent shorts at Biograph before helming landmark silent features including Earthbound (1920) and The Sky Raider (1925, featuring aviation legend Charles Nungesser). Moving to London in the late 1920s, he directed Boris Karloff, Cedric Hardwicke, and Ralph Richardson in Gaumont-British’s atmospheric horror classic The Ghoul (1933).',
    signatureStyle:
      'Fog-drenched British studio expressionism (shot with Nosferatu cinematographer Günther Krampf), theatrical ensemble blocking, and supernatural mystery.',
    notableCollaborators: ['Boris Karloff', 'Cedric Hardwicke', 'Ernest Thesiger', 'Günther Krampf'],
    filmography: [
      {
        title: 'The Ghoul',
        year: '1933',
        genre: 'Gothic Horror',
        role: 'Director',
        archiveIdentifier: 'TheGhoul',
        note: 'Boris Karloff’s celebrated British horror vehicle, photographed by Nosferatu cameraman Günther Krampf.',
      },
      {
        title: 'Vampire (The Vampire)',
        year: '1913',
        genre: 'Silent Drama',
        role: 'Director',
        note: 'Early Kalem Company feature notable for pioneering the "vamp" archetype.',
      },
      {
        title: 'Earthbound',
        year: '1920',
        genre: 'Supernatural Drama',
        role: 'Director',
        note: 'Acclaimed Goldwyn Pictures silent fantasy about a murdered man’s spirit lingering among the living.',
      },
      {
        title: 'The Frightened Lady',
        year: '1932',
        genre: 'British Mystery Thriller',
        role: 'Director',
        note: 'Atmospheric Edgar Wallace country-manor murder mystery.',
      },
    ],
  },
  {
    id: 'j-searle-dawley',
    name: 'J. Searle Dawley',
    wikiSlug: 'J._Searle_Dawley',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Frankenstein_1910_still.jpg/640px-Frankenstein_1910_still.jpg',
    birthDeath: '1877–1949',
    nationality: 'American',
    yearsActive: '1907–1926',
    movement: 'Early Silent Trick Horror & Edison Pioneers',
    tagline: 'Edison’s Master Director & Creator of the First Screen Frankenstein',
    biography:
      'Hired by Edwin S. Porter at Thomas Edison’s Bronx studio in 1907, J. Searle Dawley is recognized as cinema’s first theatrical stage director recruited specifically to elevate motion picture acting and narrative staging. He directed nearly 150 films, including D.W. Griffith’s screen acting debut, the first screen adaptation of Mary Shelley’s Frankenstein (1910), and the 1916 feature Snow White that directly inspired young Walt Disney.',
    signatureStyle:
      'Pioneering reverse-motion furnace illusions, tinted nitrate color baths, dramatic stage tableaux, and literary adaptations.',
    notableCollaborators: ['Charles Ogle', 'Augustus Phillips', 'Mary Fuller', 'Marguerite Clark', 'Edwin S. Porter'],
    filmography: [
      {
        title: 'Frankenstein (1910 Edison Film)',
        year: '1910',
        genre: 'Silent Horror',
        role: 'Director · Writer',
        archiveIdentifier: 'FrankensteinfullMovie',
        note: 'Cinema’s first adaptation of Mary Shelley’s novel, featuring Charles Ogle as the Creature.',
      },
      {
        title: 'Rescued from an Eagle’s Nest',
        year: '1908',
        genre: 'Silent Adventure',
        role: 'Director',
        note: 'Edison short famous for featuring future director D.W. Griffith in a lead acting role.',
      },
      {
        title: 'A Christmas Carol',
        year: '1910',
        genre: 'Silent Fantasy',
        role: 'Director',
        archiveIdentifier: 'dawley-christmas-carol-1910',
        note: 'Early Edison adaptation of Charles Dickens’ holiday ghost story using double-exposure spirits.',
      },
      {
        title: 'Snow White',
        year: '1916',
        genre: 'Silent Fairy Tale',
        role: 'Director',
        note: 'Feature adaptation starring Marguerite Clark that a 15-year-old Walt Disney watched in Kansas City.',
      },
    ],
  },
  {
    id: 'georges-melies',
    name: 'Georges Méliès',
    wikiSlug: 'Georges_M%C3%A9li%C3%A8s',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Georges_M%C3%A9li%C3%A8s.jpg/640px-Georges_M%C3%A9li%C3%A8s.jpg',
    birthDeath: '1861–1938',
    nationality: 'French',
    yearsActive: '1896–1913',
    movement: 'Early Silent Illusion & Féerie Trick Film',
    tagline: 'The First Cinemagician & Inventor of Special Effects',
    biography:
      'A Parisian stage illusionist and proprietor of the Théâtre Robert-Houdin, Georges Méliès attended the Lumière brothers’ very first screening in December 1895 and immediately recognized the camera’s power for magic. Building Europe’s first glass-walled film studio in Montreuil, he directed over 500 films, inventing stop-motion substitution, multiple exposures, time-lapse photography, and hand-stenciled color.',
    signatureStyle:
      'Theatrical féerie backdrops, in-camera substitution splices, hand-painted nitrate frames, and whimsical cosmic surrealism.',
    notableCollaborators: ['Jehanne d’Alcy', 'Bleuette Bernon', 'Élisabeth Thuillier'],
    filmography: [
      {
        title: 'Le Voyage dans la Lune (A Trip to the Moon)',
        year: '1902',
        genre: 'Sci-Fi · Fantasy',
        role: 'Director · Writer · Producer · Lead Actor (Professor Barbenfouillis)',
        archiveIdentifier: 'europeana-melies-moon-1902',
        note: 'Cinema’s first science-fiction masterpiece and its most iconic single image: the rocket in the eye of the Moon.',
      },
      {
        title: 'The Haunted Castle (Le Manoir du diable)',
        year: '1896',
        genre: 'Trick Horror Short',
        role: 'Director · Actor',
        archiveIdentifier: 'melies-haunted-castle-1896',
        note: 'Widely considered the world’s first horror film and first vampire appearance on screen.',
      },
      {
        title: 'The Impossible Voyage (Le Voyage à travers l’impossible)',
        year: '1904',
        genre: 'Sci-Fi · Adventure',
        role: 'Director · Actor',
        archiveIdentifier: 'melies-impossible-voyage-1904',
        note: 'Lavish companion epic to A Trip to the Moon following an expedition to the surface of the Sun.',
      },
      {
        title: 'The Conquest of the Pole (À la conquête du pôle)',
        year: '1912',
        genre: 'Fantasy · Adventure',
        role: 'Director · Actor',
        archiveIdentifier: 'melies-conquest-pole-1912',
        note: 'Features a towering mechanical Frost Giant puppet operated by a team of stagehands.',
      },
    ],
  },
  {
    id: 'dziga-vertov',
    name: 'Dziga Vertov',
    wikiSlug: 'Dziga_Vertov',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Dziga_Vertov_1929.jpg/640px-Dziga_Vertov_1929.jpg',
    birthDeath: '1896–1954',
    nationality: 'Soviet (Polish-born)',
    yearsActive: '1918–1954',
    movement: 'Soviet Montage & Kino-Eye Avant-Garde',
    tagline: 'Revolutionary Theorist of the "Kino-Eye" & Pure Visual Symphony',
    biography:
      'Born David Abelevich Kaufman in Białystok, he adopted the futurist pseudonym Dziga Vertov ("Spinning Top"). Rejecting scripted melodrama as "bourgeois theater," Vertov—working alongside his wife, master editor Elizaveta Svilova, and his brother, cinematographer Mikhail Kaufman—championed the "Kino-Glaz" (Cinema-Eye), culminating in Man with a Movie Camera (1929), ranked #8 in Sight & Sound’s greatest films of all time.',
    signatureStyle:
      'Rapid rhythmic montage, split-screen optical superimpositions, variable frame rates, freeze frames, and self-reflexive portraits of the cameraman and editor at work.',
    notableCollaborators: ['Elizaveta Svilova', 'Mikhail Kaufman', 'Boris Kaufman'],
    filmography: [
      {
        title: 'Man with a Movie Camera (Chelovek s kinoapparatom)',
        year: '1929',
        genre: 'Avant-Garde Documentary',
        role: 'Director · Theorist',
        archiveIdentifier: 'europeana-man-movie-camera-1929',
        note: 'Wordless urban symphony filmed across Kyiv, Kharkiv, Odesa, and Moscow; edited by Elizaveta Svilova.',
      },
      {
        title: 'Kino-Eye (Kino-Glaz)',
        year: '1924',
        genre: 'Documentary',
        role: 'Director',
        archiveIdentifier: 'vertov-kino-eye-1924',
        note: 'Manifesto film demonstrating reverse-motion photography and candid street observation.',
      },
      {
        title: 'A Sixth Part of the World',
        year: '1926',
        genre: 'Poetic Documentary',
        role: 'Director',
        note: 'Panoramic portrait of diverse peoples and landscapes across the Soviet Union.',
      },
      {
        title: 'Enthusiasm: Symphony of the Donbas',
        year: '1931',
        genre: 'Sound Documentary',
        role: 'Director',
        archiveIdentifier: 'vertov-enthusiasm-1931',
        note: 'Vertov’s first sound film, using industrial field recordings admired by Charlie Chaplin as a "symphony of mechanical sound."',
      },
    ],
  },
  {
    id: 'yu-hyun-mok',
    name: 'Yu Hyun-mok',
    wikiSlug: 'Yu_Hyun-mok',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Aimless_Bullet_1961.jpg/640px-Aimless_Bullet_1961.jpg',
    birthDeath: '1925–2009',
    nationality: 'South Korean',
    yearsActive: '1956–1995',
    movement: 'Korean Post-War Neo-Realism & Modernism',
    tagline: 'Conscience of Post-War Korean Cinema & Director of Aimless Bullet',
    biography:
      'Born in Sariwon, Hwanghae Province, Yu Hyun-mok fled south during the Korean War and channeled the existential wounds of a divided nation into Korean cinema’s most celebrated realist masterwork: Aimless Bullet (오발탄, 1961). Blending Italian Neo-Realist street truth with German Expressionist shadow and Soviet montage, Yu examined poverty, faith, and moral survival in post-war Seoul.',
    signatureStyle:
      'Deep-focus chiaroscuro framing, expressionist urban alleys, existential philosophical dialogue, and modernist sound montage.',
    notableCollaborators: ['Kim Jin-kyu', 'Choi Moo-ryong', 'Moon Jung-suk', 'Kimagi'],
    filmography: [
      {
        title: 'Aimless Bullet (오발탄)',
        year: '1961',
        genre: 'Drama · Neo-Realism',
        role: 'Director',
        archiveIdentifier: 'kofa-aimless-bullet-1961',
        note: 'Repeatedly voted the greatest Korean film of all time by critics and historians.',
      },
      {
        title: 'The Martyr (순교자)',
        year: '1965',
        genre: 'Philosophical War Drama',
        role: 'Director',
        note: 'Existential drama adapted from Richard E. Kim’s novel about Christian ministers during the Korean War.',
      },
      {
        title: 'Guests of the Last Train (막차로 온 손님들)',
        year: '1967',
        genre: 'Modernist Drama',
        role: 'Director',
        note: ' melancholy portrait of alienated youth and intellectual disillusionment in late-1960s Korea.',
      },
      {
        title: 'Descendants of Cain (카인의 후예)',
        year: '1968',
        genre: 'Historical Drama',
        role: 'Director',
        note: 'Sweeping drama of land reform and ideological upheaval in post-liberation North Korea.',
      },
    ],
  },
  {
    id: 'han-hyung-mo',
    name: 'Han Hyung-mo',
    wikiSlug: 'Han_Hyung-mo',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Madame_Freedom_1956.jpg/640px-Madame_Freedom_1956.jpg',
    birthDeath: '1917–1999',
    nationality: 'South Korean',
    yearsActive: '1949–1967',
    movement: '1950s Korean Cosmopolitan Melodrama & Genre Pioneer',
    tagline: 'Master of Glamorous Modernity, Jazz-Age Seoul & Fluid Camera Craft',
    biography:
      'Trained as a cinematographer in Japan and Manchuria before becoming a director, Han Hyung-mo possessed unmatched technical fluency with lighting, crane movement, and sound recording. His 1956 sensation Madame Freedom (자유부인) ignited a nationwide cultural debate over women’s autonomy, Western mambo music, and consumer modernity in post-war Seoul.',
    signatureStyle:
      'Glamorous Hollywood-style three-point lighting, fluid crane and dolly choreography, jazz/mambo musical numbers, and cosmopolitan female leads.',
    notableCollaborators: ['Kim Jeong-rim', 'Park Am', 'Yang Mi-hee', 'Choi Eun-hee'],
    filmography: [
      {
        title: 'Madame Freedom (자유부인)',
        year: '1956',
        genre: 'Romance · Melodrama',
        role: 'Director · Cinematographer',
        archiveIdentifier: 'kofa-madame-freedom-1956',
        note: 'Record-breaking 1956 phenomenon exploring female desire, luxury boutiques, and Western dance halls.',
      },
      {
        title: 'The Hand of Destiny (운명의 손)',
        year: '1954',
        genre: 'Espionage Noir',
        role: 'Director · Cinematographer',
        note: 'Cold War spy noir notable for featuring the first on-screen kiss in Korean cinema history.',
      },
      {
        title: 'A Female Boss (여사장)',
        year: '1959',
        genre: 'Romantic Comedy',
        role: 'Director',
        note: 'Sparkling gender-reversal workplace comedy starring Jo Mi-ryeong as a magazine company president.',
      },
      {
        title: 'My Sister Is a Haughty Girl (언니는 말괄량이)',
        year: '1961',
        genre: 'Comedy',
        role: 'Director',
        note: 'Vibrant youth comedy showcasing modern Seoul family dynamics.',
      },
    ],
  },
  {
    id: 'shin-sang-ok',
    name: 'Shin Sang-ok',
    wikiSlug: 'Shin_Sang-ok',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/A_Flower_in_Hell_1958.jpg/640px-A_Flower_in_Hell_1958.jpg',
    birthDeath: '1926–2006',
    nationality: 'South Korean',
    yearsActive: '1952–2004',
    movement: 'Korean Golden Age & Post-War Neo-Realism',
    tagline: 'Titan of the Korean Golden Age & Shin Film Studio',
    biography:
      'Known as the "Prince of Korean Cinema," Shin Sang-ok directed over 70 films and produced more than 300 through his powerhouse Shin Film studio. Alongside his partner and muse, legendary actress Choi Eun-hee, he created gritty neo-realist street dramas like A Flower in Hell (1958), tender domestic masterpieces like My Mother and Her Guest (1961), and lavish historical epics.',
    signatureStyle:
      'Dynamic location realism blended with studio emotional power, fearless female protagonists, and widescreen visual command.',
    notableCollaborators: ['Choi Eun-hee', 'Kim Hak', 'Shin Young-kyun', 'Kim Seung-ho'],
    filmography: [
      {
        title: 'A Flower in Hell (지옥화)',
        year: '1958',
        genre: 'Action · Neo-Realist Noir',
        role: 'Director · Producer',
        archiveIdentifier: 'kofa-flower-in-hell-1958',
        note: 'Gritty post-war noir starring Choi Eun-hee amid U.S. military base towns and black-market heists.',
      },
      {
        title: 'My Mother and Her Guest (사랑방 손님과 어머니)',
        year: '1961',
        genre: 'Romantic Drama',
        role: 'Director · Producer',
        note: 'Beloved classic told through the eyes of a six-year-old girl observing her widowed mother’s quiet romance.',
      },
      {
        title: 'Seong Chun-hyang (성춘향)',
        year: '1961',
        genre: 'Historical Romance',
        role: 'Director · Producer',
        note: 'Color CinemaScope blockbuster that funded the golden era of Shin Film Studios.',
      },
      {
        title: 'The Deaf Sam-ryong (벙어리 삼룡)',
        year: '1964',
        genre: 'Tragic Drama',
        role: 'Director · Producer',
        note: 'Devastating class tragedy starring Kim Jin-kyu and Choi Eun-hee.',
      },
    ],
  },
  {
    id: 'kang-dae-jin',
    name: 'Kang Dae-jin',
    wikiSlug: 'Kang_Dae-jin',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/The_Coachman_1961.jpg/640px-The_Coachman_1961.jpg',
    birthDeath: '1935–1987',
    nationality: 'South Korean',
    yearsActive: '1959–1986',
    movement: 'Korean Golden Age Working-Class Humanism',
    tagline: 'Champion of Working-Class Dignity & First Korean Berlin Bear Winner',
    biography:
      'Making his directorial debut in his mid-twenties, Kang Dae-jin brought warmth, humor, and social realism to working-class families navigating Seoul’s rapid modernization. His 1961 masterwork The Coachman (마부) won the Silver Bear Extraordinary Jury Prize at the 11th Berlin International Film Festival—the first major international film festival award in Korean cinema history.',
    signatureStyle:
      'Compassionate multi-generational ensemble portraits, authentic Seoul neighborhood textures, and bittersweet generational transitions.',
    notableCollaborators: ['Kim Seung-ho', 'Shin Young-kyun', 'Hwang Jung-seun', 'Um Aing-ran'],
    filmography: [
      {
        title: 'The Coachman (마부)',
        year: '1961',
        genre: 'Family Drama',
        role: 'Director',
        archiveIdentifier: 'kofa-the-coachman-1961',
        note: 'Winner of the 1961 Berlin Silver Bear; stars Kim Seung-ho as a widowed horse-cart driver in modernizing Seoul.',
      },
      {
        title: 'Mr. Park (박서방)',
        year: '1960',
        genre: 'Family Comedy-Drama',
        role: 'Director',
        note: 'First entry in Kang’s celebrated fatherhood trilogy with actor Kim Seung-ho.',
      },
      {
        title: 'Hometown of the Heart',
        year: '1962',
        genre: 'Drama',
        role: 'Director',
        note: 'Poignant humanist drama exploring rural roots and urban migration.',
      },
    ],
  },
  {
    id: 'yang-ju-nam',
    name: 'Yang Ju-nam',
    wikiSlug: 'Sweet_Dream_(film)',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Sweet_Dream_1936_still.jpg/640px-Sweet_Dream_1936_still.jpg',
    birthDeath: '1912–c.1950',
    nationality: 'Korean',
    yearsActive: '1932–1949',
    movement: 'Colonial-Era Korean Sound Pioneers',
    tagline: 'Director of the Oldest Surviving Korean Sound Film',
    biography:
      'Trained in editing and camera work at Gyeongseong (Seoul) studios during the 1930s, Yang Ju-nam directed Sweet Dream (미몽 / Lullaby of Death, 1936) at age 24. Rediscovered in the China Film Archive in 2005 and restored by KOFA, Sweet Dream stands today as the oldest surviving Korean sound motion picture and a rare document of 1930s urban modernity.',
    signatureStyle:
      'Early Korean optical-sound synchronization, expressive melodramatic framing, and location photography of 1930s Seoul.',
    notableCollaborators: ['Moon Ye-bong', 'Kim So-yeon', 'Lee Geum-ryong'],
    filmography: [
      {
        title: 'Sweet Dream (미몽 - Lullaby of Death)',
        year: '1936',
        genre: 'Drama · Melodrama',
        role: 'Director',
        archiveIdentifier: 'kofa-sweet-dream-1936',
        note: 'The oldest surviving Korean sound motion picture, starring Moon Ye-bong; Registered Cultural Heritage #342.',
      },
      {
        title: 'Milky Way (은하수)',
        year: '1936',
        genre: 'Melodrama',
        role: 'Director · Editor',
        note: 'Early colonial-era sound melodrama produced by Gyeongseong Film Studio.',
      },
    ],
  },
  {
    id: 'brian-james-gage',
    name: 'Brian James Gage',
    ownerUserId: 'u4XNVf41QeQERFqO0CB8JEhegXz2',
    wikiSlug: '',
    portraitUrl: 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
    birthDeath: 'Contemporary',
    nationality: 'American',
    yearsActive: '2020–Present',
    movement: 'Independent Worldbuilding & Action-Horror Cinema',
    tagline: 'Creator of the Planet Ween Universe & Pumpkin Patch',
    biography:
      'Writer, director, voice performer, and solo worldbuilder behind the independent feature Pumpkin Patch and the Planet Ween Universe. Blending the dystopian siege action of John Carpenter’s Escape from New York and Walter Hill’s The Warriors with the gothic holiday satire of The Nightmare Before Christmas, Gage crafted an entire interconnected IP world of characters, lore, and timelines.',
    signatureStyle:
      'High-octane neon-gothic action satire, solo multi-character voice work, graphic-novel staging, and deep cross-media worldbuilding.',
    notableCollaborators: ['Planet Ween Universe Ensemble'],
    filmography: [
      {
        title: 'Pumpkin Patch',
        year: '2026',
        genre: 'Action · Horror · Satire',
        role: 'Director · Writer · Producer · Voice Cast',
        archiveIdentifier: 'album_1787881859314_mlt23',
        note: 'Independent Halloween Hero Feature set inside maximum-security prison colony District 13 on Planet Ween.',
      },
    ],
  },
  {
    id: 'akira-kurosawa',
    name: 'Akira Kurosawa',
    wikiSlug: 'Akira_Kurosawa',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Akira_Kurosawa_1951.jpg/640px-Akira_Kurosawa_1951.jpg',
    birthDeath: '1910–1998',
    nationality: 'Japanese',
    yearsActive: '1943–1993',
    movement: 'Japanese Golden Age Cinema',
    tagline: 'Emperor of Dynamic Movement, Weather & Humanist Epic Cinema',
    biography:
      'Born in Tokyo to a samurai-descended family and trained as a Western-style painter, Akira Kurosawa transformed world cinema in 1950 when Rashomon won the Golden Lion at the Venice Film Festival. Across a 50-year career spanning Seven Samurai, Ikiru, Yojimbo, High and Low, and Ran, Kurosawa fused Shakespearean tragedy, John Ford horizons, and kinetic multi-camera editing.',
    signatureStyle:
      'Torrential rain and wind as emotional amplification, wipe transitions, axial cuts, telephoto multi-camera action staging, and moral humanism.',
    notableCollaborators: ['Toshirō Mifune', 'Takashi Shimura', 'Kazuo Miyagawa', 'Fumio Hayasaka'],
    filmography: [
      {
        title: 'Rashomon (羅生門)',
        year: '1950',
        genre: 'Mystery · Period Drama',
        role: 'Director · Co-Writer · Editor',
        archiveIdentifier: 'intl-rashomon-1950',
        note: 'Winner of the Golden Lion at Venice and an Academy Honorary Award; introduced the "Rashomon effect" to global culture.',
      },
      {
        title: 'Ikiru (生きる)',
        year: '1952',
        genre: 'Humanist Drama',
        role: 'Director · Co-Writer',
        note: 'Takashi Shimura stars as a terminally ill Tokyo bureaucrat searching for meaning by building a children’s park.',
      },
      {
        title: 'Seven Samurai (七人の侍)',
        year: '1954',
        genre: 'Action Epic',
        role: 'Director · Co-Writer · Editor',
        note: 'The foundational blueprint for every modern ensemble action movie.',
      },
    ],
  },
  {
    id: 'yasujiro-ozu',
    name: 'Yasujirō Ozu',
    wikiSlug: 'Yasujir%C5%8D_Ozu',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Yasujiro_Ozu_1953.jpg/640px-Yasujiro_Ozu_1953.jpg',
    birthDeath: '1903–1963',
    nationality: 'Japanese',
    yearsActive: '1927–1962',
    movement: 'Japanese Shōshimin-eiga & Poetic Domestic Realism',
    tagline: 'Poet of Tatami-Level Stillness, Family & Impermanence (Mono no Aware)',
    biography:
      'Born in Tokyo on December 12, 1903 (and passing away on his 60th birthday in 1963, his gravestone bearing only the single kanji character Mu — "Nothingness"), Yasujirō Ozu refined cinema to its purest essence. Placing his camera at the eye level of a person seated on a tatami mat and eschewing dissolves or camera movement, Ozu turned everyday family meals, marriages, and quiet partings into universal poetry.',
    signatureStyle:
      'Low tatami-mat camera position, 50mm lens rigor, pillow shots of seasons and kettles, direct-to-lens dialogue framing, and profound emotional restraint.',
    notableCollaborators: ['Chishū Ryū', 'Setsuko Hara', 'Kōgo Noda', 'Yūharu Atsuta'],
    filmography: [
      {
        title: 'Tokyo Story (東京物語)',
        year: '1953',
        genre: 'Domestic Drama',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'intl-tokyo-story-1953',
        note: 'Voted #1 in the Sight & Sound Directors’ Poll of the Greatest Films of All Time.',
      },
      {
        title: 'Good Morning / I Was Born, But... (お早よう)',
        year: '1959',
        genre: 'Comedy · Family',
        role: 'Director · Co-Writer',
        archiveIdentifier: 'intl-i-was-born-but-1932',
        note: 'Affectionate suburban comedy revisiting Ozu’s 1932 classic I Was Born, But... through two young brothers on a silence strike.',
      },
      {
        title: 'Late Spring (晩春)',
        year: '1949',
        genre: 'Domestic Drama',
        role: 'Director · Co-Writer',
        note: 'First of the "Noriko Trilogy" starring Setsuko Hara and Chishū Ryū.',
      },
    ],
  },
  {
    id: 'sergei-eisenstein',
    name: 'Sergei Eisenstein',
    wikiSlug: 'Sergei_Eisenstein',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Sergei_Eisenstein_1925.jpg/640px-Sergei_Eisenstein_1925.jpg',
    birthDeath: '1898–1948',
    nationality: 'Soviet (Latvian-born)',
    yearsActive: '1923–1948',
    movement: 'Soviet Montage School',
    tagline: 'Architect of Dialectical Montage & the Odessa Steps',
    biography:
      'Born in Riga and trained in civil engineering and Meyerhold’s avant-garde theatre, Sergei Eisenstein revolutionized film editing by arguing that meaning is generated not within a single shot, but in the collision between two juxtaposed shots. His silent trilogy Strike (1925), Battleship Potemkin (1925), and October (1928) established the grammar of modern cinematic rhythm.',
    signatureStyle:
      'Dialectical and intellectual montage, typage casting of real workers, geometric crowd movements, and rhythmic visual collisions.',
    notableCollaborators: ['Eduard Tisse', 'Grigori Aleksandrov', 'Sergei Prokofiev', 'Nikolai Cherkasov'],
    filmography: [
      {
        title: 'Battleship Potemkin (Броненосец Потёмкин)',
        year: '1925',
        genre: 'Historical Drama',
        role: 'Director · Writer · Editor',
        archiveIdentifier: 'intl-battleship-potemkin-1925',
        note: 'Contains the immortal Odessa Steps montage sequence.',
      },
      {
        title: 'Strike (Стачка)',
        year: '1925',
        genre: 'Historical Drama',
        role: 'Director · Co-Writer · Editor',
        archiveIdentifier: 'intl-strike-1925',
        note: 'Eisenstein’s kinetic feature debut pioneering the "montage of attractions."',
      },
      {
        title: 'October: Ten Days That Shook the World (Октябрь)',
        year: '1928',
        genre: 'Historical Epic',
        role: 'Director · Co-Writer · Editor',
        archiveIdentifier: 'intl-october-1928',
        note: 'Monumental reconstruction of 1917 Petrograd and experimental intellectual montage.',
      },
    ],
  },
  {
    id: 'carl-theodor-dreyer',
    name: 'Carl Theodor Dreyer',
    wikiSlug: 'Carl_Theodor_Dreyer',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Carl_Theodor_Dreyer.jpg/640px-Carl_Theodor_Dreyer.jpg',
    birthDeath: '1889–1968',
    nationality: 'Danish',
    yearsActive: '1919–1964',
    movement: 'European Transcendental Cinema',
    tagline: 'Master of the Human Face, Spiritual Interiority & Uncanny Dread',
    biography:
      'Born in Copenhagen, Carl Theodor Dreyer directed only fourteen feature films across forty-five years, yet almost every one is revered as a monument of cinema. From the searing close-ups of Renée Falconetti in The Passion of Joan of Arc (1928) to the gauze-lit waking nightmare of Vampyr (1932), Dreyer treated the human face as a landscape of the soul.',
    signatureStyle:
      'Searing unadorned close-ups, austere white architectural walls, slow lateral 360-degree camera pans, and spiritual transcendence.',
    notableCollaborators: ['Renée Jeanne Falconetti', 'Rudolph Maté', 'Hermann Warm'],
    filmography: [
      {
        title: 'The Passion of Joan of Arc (La Passion de Jeanne d’Arc)',
        year: '1928',
        genre: 'Historical Tragedy',
        role: 'Director · Writer · Editor',
        archiveIdentifier: 'intl-passion-joan-of-arc-1928',
        note: 'Constructed from the actual 1431 trial transcripts; stars Renée Falconetti in an immortal screen performance.',
      },
      {
        title: 'Vampyr',
        year: '1932',
        genre: 'Supernatural Horror',
        role: 'Director · Co-Writer · Producer',
        archiveIdentifier: 'intl-vampyr-1932',
        note: 'Dreamlike Gothic horror photographed by Rudolph Maté where shadows move independently of their owners.',
      },
      {
        title: 'Ordet (The Word)',
        year: '1955',
        genre: 'Spiritual Drama',
        role: 'Director · Writer',
        note: 'Winner of the Golden Lion at the 1955 Venice Film Festival.',
      },
    ],
  },
  {
    id: 'alfred-hitchcock',
    name: 'Alfred Hitchcock',
    wikiSlug: 'Alfred_Hitchcock',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Hitchcock%2C_Alfred_02.jpg/640px-Hitchcock%2C_Alfred_02.jpg',
    birthDeath: '1899–1980',
    nationality: 'British-American',
    yearsActive: '1919–1976',
    movement: 'Master of Suspense & Classical Thriller',
    tagline: 'The Master of Suspense & Architect of the Wrong-Man Thriller',
    biography:
      'Born in Leytonstone, London, and trained as a silent title-card designer at Islington Studios and UFA Babelsberg (where he observed F.W. Murnau), Sir Alfred Hitchcock became the most influential filmmaker in history. His 1930s British classics The 39 Steps (1935) and The Lady Vanishes (1938) perfected the fast-paced espionage thriller before he conquered Hollywood with Rebecca, Notorious, Rear Window, Vertigo, and Psycho.',
    signatureStyle:
      'Pure cinema point-of-view editing, the MacGuffin plot catalyst, wrong-man chases across public landmarks, and mordant gallows humor.',
    notableCollaborators: ['Alma Reville', 'Robert Donat', 'Cary Grant', 'James Stewart', 'Bernard Herrmann'],
    filmography: [
      {
        title: 'The 39 Steps',
        year: '1935',
        genre: 'Espionage Thriller',
        role: 'Director',
        archiveIdentifier: 'us-39-steps-1935',
        note: 'Starring Robert Donat and Madeleine Carroll; the definitive prototype for North by Northwest.',
      },
      {
        title: 'The Lady Vanishes',
        year: '1938',
        genre: 'Mystery Thriller',
        role: 'Director',
        archiveIdentifier: 'us-lady-vanishes-1938',
        note: 'Train-bound espionage mystery that won Hitchcock the New York Film Critics Circle Award.',
      },
      {
        title: 'Jamaica Inn',
        year: '1939',
        genre: 'Gothic Adventure',
        role: 'Director',
        archiveIdentifier: 'us-jamaica-inn-1939',
        note: 'Hitchcock’s final British feature, starring Charles Laughton and Maureen O’Hara.',
      },
    ],
  },
  {
    id: 'buster-keaton',
    name: 'Buster Keaton',
    wikiSlug: 'Buster_Keaton',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Buster_Keaton_1920s.jpg/640px-Buster_Keaton_1920s.jpg',
    birthDeath: '1895–1966',
    nationality: 'American',
    yearsActive: '1899–1966',
    movement: 'Golden Age Silent Comedy & Physical Stunt Cinema',
    tagline: 'The Great Stone Face & Supreme Geometrician of Silent Cinema',
    biography:
      'Born Joseph Frank Keaton into a traveling vaudeville family (nicknamed "Buster" by Harry Houdini after tumbling down a flight of stairs unharmed as a toddler), Buster Keaton combined deadpan stoicism with breathtaking physical stunts and surreal cinematic geometry. In Sherlock Jr. (1924), The General (1926), and Steamboat Bill, Jr. (1928), Keaton performed every life-risking stunt in unbroken wide shots.',
    signatureStyle:
      'Unbroken wide-angle stunt authenticity, deadpan stoicism amidst chaos, mechanical and locomotive choreography, and metacinematic optical illusions.',
    notableCollaborators: ['Clyde Bruckman', 'Elgin Lessley', 'Joe Roberts', 'Marion Mack'],
    filmography: [
      {
        title: 'The General',
        year: '1926',
        genre: 'Action Comedy',
        role: 'Director · Writer · Producer · Lead Actor',
        archiveIdentifier: 'ia-the-general-1926',
        note: 'Epic Civil War locomotive chase praised by Orson Welles as "perhaps the greatest film ever made."',
      },
      {
        title: 'Sherlock Jr.',
        year: '1924',
        genre: 'Surrealist Comedy',
        role: 'Director · Lead Actor',
        archiveIdentifier: 'us-sherlock-jr-1924',
        note: 'Metacinematic masterpiece in which a movie projectionist steps directly into the silver screen.',
      },
      {
        title: 'Steamboat Bill, Jr.',
        year: '1928',
        genre: 'Silent Comedy',
        role: 'Co-Director · Lead Actor',
        archiveIdentifier: 'us-steamboat-bill-1928',
        note: 'Culminates in the legendary cyclone sequence and the falling two-ton house facade stunt.',
      },
    ],
  },
  {
    id: 'charlie-chaplin',
    name: 'Charlie Chaplin',
    wikiSlug: 'Charlie_Chaplin',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Charlie_Chaplin.jpg/640px-Charlie_Chaplin.jpg',
    birthDeath: '1889–1977',
    nationality: 'British',
    yearsActive: '1899–1976',
    movement: 'Golden Age Silent Comedy & Humanist Pathos',
    tagline: 'Creator of the Little Tramp & Poet of Laughter and Tears',
    biography:
      'Rising from destitute Victorian London workhouses and Fred Karno’s music-hall troupe to become the most famous human being on Earth by age 26, Sir Charles Spencer Chaplin wrote, directed, produced, starred in, and scored his own masterpieces. With The Kid (1921), The Gold Rush, City Lights, and Modern Times, Chaplin elevated slapstick pantomime into universal humanist art.',
    signatureStyle:
      'Balletic physical pantomime, seamless blending of comedy and heartbreaking pathos, social empathy for the underdog, and original orchestral scores.',
    notableCollaborators: ['Jackie Coogan', 'Roland Totheroh', 'Edna Purviance', 'Paulette Goddard'],
    filmography: [
      {
        title: 'The Kid',
        year: '1921',
        genre: 'Comedy · Drama',
        role: 'Director · Writer · Producer · Composer · Lead Actor',
        archiveIdentifier: 'us-the-kid-1921',
        note: 'Chaplin’s feature directorial debut alongside six-year-old prodigy Jackie Coogan.',
      },
      {
        title: 'The Gold Rush',
        year: '1925',
        genre: 'Comedy · Adventure',
        role: 'Director · Writer · Producer · Lead Actor',
        note: 'Features the Little Tramp’s boiled-boot Thanksgiving dinner and the "Dance of the Rolls."',
      },
    ],
  },
  {
    id: 'orson-welles',
    name: 'Orson Welles',
    wikiSlug: 'Orson_Welles',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Orson_Welles_1937.jpg/640px-Orson_Welles_1937.jpg',
    birthDeath: '1915–1985',
    nationality: 'American',
    yearsActive: '1934–1985',
    movement: 'Deep-Focus Modernism & Film Noir',
    tagline: 'Boy Wonder of Mercury Theatre, Deep-Focus Visionary & Master of Noir',
    biography:
      'After Electrifying Broadway and radio with the Mercury Theatre (including the 1938 War of the Worlds broadcast), 25-year-old Orson Welles co-wrote, directed, and starred in Citizen Kane (1941). Across The Magnificent Ambersons, The Stranger (1946), The Lady from Shanghai, Touch of Evil, and Chimes at Midnight, Welles reshaped cinema through deep-focus lenses, low-angle ceilings, and overlapping radio-inspired sound design.',
    signatureStyle:
      'Deep-focus chiaroscuro cinematography, extreme low angles exposing ceilings, overlapping dialogue, and baroque Shakespearean villainy.',
    notableCollaborators: ['Gregg Toland', 'Russell Metty', 'Edward G. Robinson', 'Joseph Cotten'],
    filmography: [
      {
        title: 'The Stranger',
        year: '1946',
        genre: 'Film Noir · Thriller',
        role: 'Director · Lead Actor (Franz Kindler)',
        archiveIdentifier: 'us-stranger-1946',
        note: 'Taut New England clock-tower noir starring Welles, Edward G. Robinson, and Loretta Young.',
      },
      {
        title: 'Citizen Kane',
        year: '1941',
        genre: 'Drama',
        role: 'Director · Co-Writer · Producer · Lead Actor',
        note: 'Landmark debut that revolutionized deep-focus photography and non-linear narrative.',
      },
    ],
  },
];

function hydrateDirectorProfile(d: ClassicDirectorProfile): ClassicDirectorProfile {
  return {
    ...d,
    wikiPageTitle: d.wikiPageTitle || d.wikiSlug,
    lifespan: d.lifespan || d.birthDeath,
    bio: d.bio || d.biography,
    knownFor: d.knownFor || d.filmography.slice(0, 3).map(f => `${f.title} (${f.year})`),
    filmography: d.filmography.map(f => ({
      ...f,
      isOnPlatform: Boolean(f.isOnPlatform ?? f.archiveIdentifier),
      platformFilmId: f.platformFilmId || f.archiveIdentifier,
    })),
  };
}

export const CLASSIC_DIRECTORS: ClassicDirectorProfile[] = RAW_CLASSIC_DIRECTORS.map(hydrateDirectorProfile);

/**
 * Return all hydrated ClassicDirectorProfile entries.
 */
export function getAllClassicDirectors(): ClassicDirectorProfile[] {
  return CLASSIC_DIRECTORS;
}

/**
 * Find the ClassicDirectorProfile matching a director name or film identifier.
 */
export function getDirectorProfile(
  directorNameOrFilmId?: string | null,
  filmId?: string | null
): ClassicDirectorProfile | null {
  const cleanFilmId = filmId ? String(filmId).replace(/^public_domain_/, '').trim().toLowerCase() : '';
  if (cleanFilmId) {
    const byExplicitFilm = CLASSIC_DIRECTORS.find(d =>
      d.filmography.some(f => f.archiveIdentifier && f.archiveIdentifier.toLowerCase() === cleanFilmId)
    );
    if (byExplicitFilm) return byExplicitFilm;
  }

  if (!directorNameOrFilmId) return null;
  const q = String(directorNameOrFilmId).replace(/^public_domain_/, '').trim().toLowerCase();
  if (!q) return null;

  // 1. Direct match by film archiveIdentifier
  const byFilm = CLASSIC_DIRECTORS.find(d =>
    d.filmography.some(f => f.archiveIdentifier && f.archiveIdentifier.toLowerCase() === q)
  );
  if (byFilm) return byFilm;

  // 2. Match by director id or name
  const byName = CLASSIC_DIRECTORS.find(
    d =>
      d.id === q ||
      d.name.toLowerCase() === q ||
      q.includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(q)
  );
  return byName || null;
}
