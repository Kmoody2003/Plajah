// Detroit Techno: Machine Soul. Content for the interactive history exhibition.
// Facts are kept to the well-documented record (see TX_SOURCES). Where accounts differ, the text says so
// instead of picking a side. Playback is YouTube embeds only: we don't hold rights to these recordings,
// so a track without a verified youtubeId shows a "search on YouTube" link instead of a player.

export type TxPlace = 'detroit' | 'berlin' | 'bridge' | 'world';

export interface TxTrack {
  id: string;
  artist: string;
  title: string;
  year: number;
  label?: string;
  note: string;
  /** Verified YouTube id. Leave undefined rather than guess. */
  youtubeId?: string;
}

export interface TxEvent {
  id: string;
  year: number;
  /** Shown on the stamp; e.g. "MAR 1991" or "1981". */
  when: string;
  place: TxPlace;
  title: string;
  body: string;
  trackIds?: string[];
  pioneerIds?: string[];
}

export interface TxEra {
  id: string;
  range: string;
  title: string;
  kicker: string;
  summary: string;
  /** Spray colour for this era's markings. */
  ink: string;
  events: TxEvent[];
}

export interface TxPioneer {
  id: string;
  name: string;
  aka: string[];
  wave: 'roots' | 'first' | 'second' | 'berlin';
  city: 'Detroit' | 'Berlin' | 'Windsor';
  role: string;
  labels: string[];
  story: string;
  trackIds: string[];
  ink: string;
  /** Short stencil line for the poster. */
  tag: string;
}

export const TX_TRACKS: TxTrack[] = [
  { id: 'kraftwerk-numbers', youtubeId: 'fOoCnK5Jza4', artist: 'Kraftwerk', title: 'Numbers', year: 1981, label: 'Kling Klang / EMI', note: 'Düsseldorf machine funk that the Electrifying Mojo played to Detroit. The drum programming became a template for electro and techno.' },
  { id: 'sharevari', youtubeId: 'huofr2_h8dI', artist: 'A Number of Names', title: 'Sharevari', year: 1981, label: 'Capriccio', note: 'Named after the Charivari clothing store and the party crews that took its name. Often called the first record out of the Detroit high-school party scene.' },
  { id: 'alleys', youtubeId: 'ZOwpGnV8HBM', artist: 'Cybotron', title: 'Alleys of Your Mind', year: 1981, label: 'Deep Space', note: 'Juan Atkins and Rick Davis, pressed on their own label. Vocoder, drum machine, paranoia: the first shot.' },
  { id: 'cosmic-cars', youtubeId: 'eatOEZMcFNM', artist: 'Cybotron', title: 'Cosmic Cars', year: 1982, label: 'Deep Space', note: 'Motor City futurism. The car as spaceship.' },
  { id: 'clear', youtubeId: 'Bh9I5k8NeeE', artist: 'Cybotron', title: 'Clear', year: 1983, label: 'Fantasy', note: 'The electro blueprint. Sampled and rebuilt for forty years, from hip-hop to Missy Elliott.' },
  { id: 'techno-city', artist: 'Cybotron', title: 'Techno City', year: 1984, label: 'Fantasy', note: 'The word "techno" on a Detroit record, a year before Metroplex.' },
  { id: 'no-ufos', youtubeId: 'xcdOBLH_AXs', artist: 'Model 500', title: "No UFO's", year: 1985, label: 'Metroplex', note: 'Metroplex 001. Atkins alone, faster and colder than Cybotron. The record many people date techno from.' },
  { id: 'night-drive', youtubeId: 'Hs5uqACOY1E', artist: 'Model 500', title: 'Night Drive (Thru-Babylon)', year: 1985, label: 'Metroplex', note: 'A spoken drive through a city at night. Detroit as a science-fiction set.' },
  { id: 'the-chase', youtubeId: 'u_r9TlZqnRo', artist: 'Model 500', title: 'The Chase', year: 1989, label: 'Metroplex', note: 'Late-eighties Atkins: rolling, hypnotic, built for the long DJ blend.' },
  { id: 'nude-photo', youtubeId: 'I7HiL2m63pQ', artist: 'Rhythim Is Rhythim', title: 'Nude Photo', year: 1987, label: 'Transmat', note: 'Derrick May with Thomas Barnett. Skittering, nervous, gorgeous.' },
  { id: 'strings', youtubeId: 'vGFw2qeUp0s', artist: 'Rhythim Is Rhythim', title: 'Strings of Life', year: 1987, label: 'Transmat', note: 'No kick drum at the start, just piano and strings. The record that broke Detroit in the UK and Europe.' },
  { id: 'techno-music', youtubeId: 'wV0znD-8r3w', artist: 'Juan Atkins', title: 'Techno Music', year: 1988, label: '10 Records / Virgin', note: 'Written for the 1988 UK compilation that gave the sound its name on the shelf.' },
  { id: 'reese', youtubeId: 'LsGmC_4v4EU', artist: 'Reese', title: 'Just Want Another Chance', year: 1988, label: 'Incognito', note: 'Kevin Saunderson. The detuned, growling bassline here became the "Reese bass" of drum & bass.' },
  { id: 'big-fun', youtubeId: 'Gr-zG-IXDyo', artist: 'Inner City', title: 'Big Fun', year: 1988, label: 'KMS / 10 Records', note: 'Saunderson with Paris Grey. Detroit in the UK top ten.' },
  { id: 'good-life', youtubeId: 'eA8gUN34nlw', artist: 'Inner City', title: 'Good Life', year: 1988, label: 'KMS / 10 Records', note: 'Techno as a pop song without losing the machine underneath.' },
  { id: 'sonic-destroyer', youtubeId: 'vELM6uFaUqQ', artist: 'X-101', title: 'Sonic Destroyer', year: 1991, label: 'Tresor', note: 'Underground Resistance (Jeff Mills, Mike Banks, Robert Hood). Tresor 001: the Berlin label opened with a Detroit record.' },
  { id: 'jazz-teacher', youtubeId: 'ReZGm1qFs8U', artist: '3MB feat. Juan Atkins', title: 'Jazz Is the Teacher', year: 1992, label: 'Tresor', note: 'Atkins with Moritz von Oswald and Thomas Fehlmann. The Detroit–Berlin alliance on one record.' },
  { id: 'phylyps', youtubeId: '6a4HlgmlMuw', artist: 'Basic Channel', title: 'Phylyps Trak', year: 1993, label: 'Basic Channel', note: 'Mark Ernestus and Moritz von Oswald. Berlin took Detroit\'s chords into dub and fog.' },
  { id: 'hi-tech-jazz', youtubeId: 'PxH7crID5AY', artist: 'Galaxy 2 Galaxy', title: 'Hi-Tech Jazz', year: 1993, label: 'Underground Resistance', note: 'Mike Banks and UR. Proof the machines could swing.' },
  { id: 'the-bells', youtubeId: 'S-BlgAQ7uRQ', artist: 'Jeff Mills', title: 'The Bells', year: 1996, label: 'Purpose Maker', note: 'Mills on three decks became the model for the Berlin techno DJ.' },
  { id: 'at-les', youtubeId: '1lzLxbifln0', artist: 'Carl Craig', title: 'At Les', year: 1997, label: 'Planet E', note: 'Second-wave Detroit, ambient and patient.' },
  { id: 'game-one', youtubeId: '1OJ-kTZHnPM', artist: 'Infiniti', title: 'Game One', year: 1994, label: 'Metroplex', note: 'Atkins under another name, minimal and locked.' },
  { id: 'deep-space', youtubeId: 'scNt80mpgIs', artist: 'Model 500', title: 'Starlight (Deep Space era)', year: 1995, label: 'R&S', note: 'Model 500\'s first album, a decade after "No UFO\'s".' },
  { id: 'borderland', youtubeId: 'kidUHA9RrWg', artist: 'Juan Atkins & Moritz von Oswald', title: 'Electric Garden (Deep Jazz in the Garden Mix)', year: 2013, label: 'Tresor', note: 'Juan Atkins and Moritz von Oswald, twenty years after 3MB. The bridge, still standing.' },
  { id: 'electric-night', youtubeId: 'KW0BY5SjHXM', artist: 'Model 500', title: 'Electric Night', year: 2015, label: 'R&S', note: 'Thirty years on from Metroplex 001, still pointed at the future.' },
];

export const TX_DOCS: TxTrack[] = [
  { id: 'doc-high-tech-soul', youtubeId: 'oDW32FlbIpE', artist: 'Gary Bredow (dir.)', title: 'High Tech Soul: The Creation of Techno Music', year: 2006, note: 'The documentary with the Belleville Three, Carl Craig, Eddie Fowlkes and more.' },
  { id: 'doc-universal-techno', youtubeId: 'Bgxth3MShXA', artist: 'Dominique Deluze (dir.)', title: 'Universal Techno', year: 1996, note: 'French/European TV documentary: Detroit, Berlin and beyond, shot mid-decade.' },
  { id: 'doc-atkins-interview', youtubeId: 'efRC-2xb6c0', artist: 'Resident Advisor', title: 'Juan Atkins on the Rise of Techno in Detroit', year: 0, note: 'The Originator in his own words.' },
  { id: 'doc-mojo', youtubeId: 'v1PGImmzIUM', artist: 'Living for the City', title: 'All of Us Were Raised by Mojo', year: 0, note: 'The radio DJ who put Kraftwerk next to Parliament.' },
  { id: 'doc-tresor', youtubeId: 'iiuJhq-z2LE', artist: 'Tresor Berlin', title: 'Sub Berlin: The Story of Tresor', year: 0, note: 'The vault under Leipziger Straße.' },
];

export const TX_ERAS: TxEra[] = [
  {
    id: 'fallout', range: '1967–1979', title: 'Motor City Fallout', kicker: 'Before the machines, the city',
    summary: 'The Detroit that made techno was a city being emptied out. Factories automated or closed, Motown left for Los Angeles, and the people who stayed lived among the ruins of the industrial century.',
    ink: '#ff5a1f',
    events: [
      { id: 'e-1967', year: 1967, when: 'JUL 1967', place: 'detroit', title: 'The 1967 uprising', body: 'Five days of unrest leave 43 dead and whole blocks burned. White flight to the suburbs speeds up for a generation.' },
      { id: 'e-motown', year: 1972, when: '1972', place: 'detroit', title: 'Motown leaves', body: 'Berry Gordy moves Motown to Los Angeles. Detroit loses its hit factory and the idea that the city is where music gets made.' },
      { id: 'e-plants', year: 1979, when: '1970s', place: 'detroit', title: 'The assembly line goes quiet', body: 'Oil shocks, imports and automation hit the auto plants. Detroit\'s population falls from about 1.85 million in 1950 to about 1.2 million by 1980. Kids grow up hearing robots replace their parents.' },
    ],
  },
  {
    id: 'mojo', range: '1977–1984', title: 'The Midnight Funk Association', kicker: 'One DJ wired a city to Europe',
    summary: 'On Detroit radio, the Electrifying Mojo played whatever he wanted: Parliament next to Kraftwerk, Prince next to the B-52s. Meanwhile Black teenagers ran a party circuit of social clubs with European names and imported synth-pop on the decks.',
    ink: '#ffd400',
    events: [
      { id: 'e-mojo', year: 1977, when: '1977', place: 'detroit', title: 'The Electrifying Mojo on air', body: 'Charles Johnson starts his long run on Detroit radio (WGPR, then WJLB and others). Nightly shows with no format and no genre walls: Kraftwerk, Gary Numan, Yellow Magic Orchestra, Funkadelic, Prince.', trackIds: ['kraftwerk-numbers'] },
      { id: 'e-parties', year: 1979, when: '1978–83', place: 'detroit', title: 'The prep party scene', body: 'High-school social clubs (Charivari, Gables and many more) throw dressy parties in rented halls. DJs play Italo disco, Euro synth-pop and funk. Juan Atkins, Derrick May, Kevin Saunderson and Eddie Fowlkes DJ as the crew Deep Space Soundworks.', trackIds: ['sharevari'], pioneerIds: ['atkins', 'may', 'saunderson', 'fowlkes'] },
      { id: 'e-sharevari', year: 1981, when: '1981', place: 'detroit', title: '"Sharevari"', body: 'A Number of Names release a record named after the scene itself. For many, it\'s the first Detroit techno record, years before the word.', trackIds: ['sharevari'] },
    ],
  },
  {
    id: 'cybotron', range: '1980–1985', title: 'Enter Cybotron', kicker: 'A community college, a war veteran and a kid from Belleville',
    summary: 'Juan Atkins met Rick Davis, an older Vietnam veteran with a room full of synthesizers, at Washtenaw Community College. Together, as Cybotron, they made Detroit\'s first machine records: electro, futurist, paranoid and funky.',
    ink: '#00e5ff',
    events: [
      { id: 'e-alleys', year: 1981, when: '1981', place: 'detroit', title: '"Alleys of Your Mind"', body: 'Cybotron presses its debut on its own Deep Space label. It sells thousands of copies locally on Mojo\'s support.', trackIds: ['alleys'], pioneerIds: ['atkins', 'davis'] },
      { id: 'e-clear', year: 1983, when: '1983', place: 'detroit', title: '"Clear" and Enter', body: 'Fantasy Records releases the album Enter. "Clear" becomes an electro classic, cut up and rebuilt by hip-hop for decades.', trackIds: ['clear', 'cosmic-cars'], pioneerIds: ['atkins', 'davis'] },
      { id: 'e-toffler', year: 1984, when: '1980–84', place: 'detroit', title: 'The Third Wave', body: 'Atkins reads Alvin Toffler\'s The Third Wave, with its "techno rebels" of the information age. The word lands on "Techno City" in 1984.', trackIds: ['techno-city'], pioneerIds: ['atkins'] },
    ],
  },
  {
    id: 'belleville', range: '1985–1988', title: 'The Belleville Three', kicker: 'Three friends, three labels, one sound',
    summary: 'Atkins left Cybotron and went faster and harder alone. His younger friends from Belleville, Derrick May and Kevin Saunderson, followed with labels of their own. Detroit\'s sound got a name, and Britain got hooked.',
    ink: '#ff2d55',
    events: [
      { id: 'e-metroplex', year: 1985, when: '1985', place: 'detroit', title: 'Metroplex 001', body: 'Atkins starts the Metroplex label with "No UFO\'s" as Model 500. Its speed and coldness separate it from Chicago house.', trackIds: ['no-ufos', 'night-drive'], pioneerIds: ['atkins'] },
      { id: 'e-transmat', year: 1987, when: '1986–87', place: 'detroit', title: 'Transmat and KMS', body: 'Derrick May launches Transmat; Kevin Saunderson launches KMS. "Nude Photo" and "Strings of Life" come out on Transmat in 1987.', trackIds: ['nude-photo', 'strings'], pioneerIds: ['may', 'saunderson'] },
      { id: 'e-compilation', year: 1988, when: '1988', place: 'bridge', title: 'Techno! The New Dance Sound of Detroit', body: 'UK label owner Neil Rushton compiles Detroit tracks for Virgin\'s 10 Records. The title fixes the name on record-shop shelves; Atkins writes "Techno Music" for it.', trackIds: ['techno-music'], pioneerIds: ['atkins', 'may', 'saunderson'] },
      { id: 'e-innercity', year: 1988, when: '1988', place: 'bridge', title: 'Inner City crosses over', body: 'Saunderson and singer Paris Grey take "Big Fun" and "Good Life" into the UK top ten.', trackIds: ['big-fun', 'good-life', 'reese'], pioneerIds: ['saunderson'] },
      { id: 'e-institute', year: 1988, when: '1988–89', place: 'detroit', title: 'The Music Institute', body: 'A bare club at 1315 Broadway downtown, run by George Baker, Alton Miller and Chez Damier, with Derrick May on the decks. Short-lived and legendary.', pioneerIds: ['may'] },
    ],
  },
  {
    id: 'resistance', range: '1989–1993', title: 'Underground Resistance', kicker: 'The second wave arms itself',
    summary: 'A younger Detroit generation made techno militant and anonymous. Underground Resistance wore masks, refused the press and called the industry "the programmers." Across the river in Windsor and across town at Planet E, the sound split into a dozen directions.',
    ink: '#b8ff00',
    events: [
      { id: 'e-ur', year: 1990, when: '1989–90', place: 'detroit', title: 'Underground Resistance forms', body: 'Mike Banks, Jeff Mills and soon Robert Hood. Faceless, political, hard. "Hi-Tech Jazz" later shows the soul under the steel.', trackIds: ['hi-tech-jazz'], pioneerIds: ['banks', 'mills', 'hood'] },
      { id: 'e-plus8', year: 1990, when: '1990–91', place: 'detroit', title: 'Plus 8 and Planet E', body: 'Richie Hawtin and John Acquaviva start Plus 8 in Windsor; Carl Craig starts Planet E in Detroit.', trackIds: ['at-les'], pioneerIds: ['craig'] },
    ],
  },
  {
    id: 'berlin', range: '1989–1995', title: 'The Wall Falls. The Vault Opens.', kicker: 'Two broken cities find each other',
    summary: 'When the Berlin Wall came down, East Berlin was full of empty buildings with no clear owner: bunkers, power stations, a bank vault. Young Berliners needed a sound for the ruins. Detroit already had one. Detroit artists found audiences in Berlin that their own city rarely gave them.',
    ink: '#ffffff',
    events: [
      { id: 'e-loveparade', year: 1989, when: 'JUL 1989', place: 'berlin', title: 'First Love Parade', body: 'Dr. Motte leads around 150 people down the Kurfürstendamm behind a truck with a sound system. Within a decade it draws crowds in the hundreds of thousands to over a million.' },
      { id: 'e-wall', year: 1989, when: '9 NOV 1989', place: 'berlin', title: 'The Wall falls', body: 'The border opens. Over the next years East and West Berlin youth meet in squats, cellars and abandoned industrial spaces where nobody is checking.' },
      { id: 'e-hardwax', year: 1989, when: '1989', place: 'berlin', title: 'Hard Wax', body: 'Mark Ernestus opens the Hard Wax record shop in Kreuzberg; it becomes the main importer of Detroit vinyl into Berlin.' },
      { id: 'e-tresor', year: 1991, when: 'MAR 1991', place: 'berlin', title: 'Tresor opens', body: 'Dimitri Hegemann opens a club in the steel vault of the former Wertheim department store near Potsdamer Platz, in what had been the death strip. The Tresor label\'s first release is X-101: Underground Resistance.', trackIds: ['sonic-destroyer'], pioneerIds: ['hegemann', 'mills', 'banks'] },
      { id: 'e-3mb', year: 1992, when: '1992', place: 'bridge', title: '3MB feat. Juan Atkins', body: 'Moritz von Oswald and Thomas Fehlmann record with Juan Atkins for Tresor. Detroit and Berlin on the same record, in the same room.', trackIds: ['jazz-teacher'], pioneerIds: ['atkins', 'vonoswald'] },
      { id: 'e-basic', year: 1993, when: '1993', place: 'berlin', title: 'Basic Channel', body: 'Ernestus and von Oswald start Basic Channel: Detroit chords stretched into dub. Berlin stops importing and starts answering.', trackIds: ['phylyps'], pioneerIds: ['vonoswald'] },
    ],
  },
  {
    id: 'legacy', range: '1995–today', title: 'Global Machine Soul', kicker: 'The sound left home and kept the address',
    summary: 'Techno became a global language, and Berlin its most visible capital. Detroit kept making it, and in 2000 put a festival on Hart Plaza to say so out loud.',
    ink: '#a63be6',
    events: [
      { id: 'e-bells', year: 1996, when: '1996', place: 'detroit', title: 'Jeff Mills, three decks', body: 'Mills\' speed and precision on three turntables set the template for the Berlin techno DJ.', trackIds: ['the-bells'], pioneerIds: ['mills'] },
      { id: 'e-demf', year: 2000, when: 'MAY 2000', place: 'detroit', title: 'Detroit Electronic Music Festival', body: 'A free festival on Hart Plaza, with Carl Craig as its first artistic director. It continues today as Movement.', pioneerIds: ['craig'] },
      { id: 'e-berghain', year: 2004, when: '2004', place: 'berlin', title: 'Berghain', body: 'A former power station in Friedrichshain becomes the world\'s most famous techno club. In 2007 Tresor reopens in another power plant on Köpenicker Straße.' },
      { id: 'e-borderland', year: 2013, when: '2013', place: 'bridge', title: 'Borderland', body: 'Juan Atkins and Moritz von Oswald release an album together on Tresor, two decades after 3MB.', trackIds: ['borderland'], pioneerIds: ['atkins', 'vonoswald'] },
    ],
  },
];

export const TX_PIONEERS: TxPioneer[] = [
  { id: 'mojo', name: 'The Electrifying Mojo', aka: ['Charles Johnson'], wave: 'roots', city: 'Detroit', role: 'Radio DJ', labels: [], tag: 'NO FORMAT. NO WALLS.', ink: '#ffd400',
    story: 'Mojo\'s late-night shows taught a generation of Detroit kids that Kraftwerk and Parliament belonged on the same tape. Without his ears, no Belleville Three.', trackIds: ['kraftwerk-numbers'] },
  { id: 'davis', name: 'Rick Davis', aka: ['3070'], wave: 'roots', city: 'Detroit', role: 'Producer · Cybotron co-founder', labels: ['Deep Space'], tag: 'THE OTHER HALF OF CYBOTRON', ink: '#00e5ff',
    story: 'A Vietnam veteran with a room full of synthesizers and a head full of science fiction. He and Atkins built Cybotron together; when Davis pulled toward rock, Atkins went his own way.', trackIds: ['alleys', 'clear'] },
  { id: 'atkins', name: 'Juan Atkins', aka: ['Model 500', 'Infiniti', 'Cybotron', 'The Originator'], wave: 'first', city: 'Detroit', role: 'Producer · DJ · Metroplex founder', labels: ['Deep Space', 'Metroplex'], tag: 'THE ORIGINATOR', ink: '#00e5ff',
    story: 'The oldest of the Belleville Three and the first to make the records. Cybotron, then Model 500, then the Metroplex label. He took the word "techno" from futurism and put it on the dance floor.', trackIds: ['clear', 'no-ufos', 'night-drive', 'jazz-teacher'] },
  { id: 'may', name: 'Derrick May', aka: ['Rhythim Is Rhythim', 'Mayday'], wave: 'first', city: 'Detroit', role: 'Producer · DJ · Transmat founder', labels: ['Transmat'], tag: 'STRINGS OF LIFE', ink: '#ff2d55',
    story: 'Learned the machines from Atkins, then made the records that carried Detroit to Europe. His description of techno as George Clinton and Kraftwerk "stuck in an elevator" became the most quoted line in the genre.', trackIds: ['nude-photo', 'strings'] },
  { id: 'saunderson', name: 'Kevin Saunderson', aka: ['Inner City', 'Reese', 'E-Dancer'], wave: 'first', city: 'Detroit', role: 'Producer · DJ · KMS founder', labels: ['KMS'], tag: 'BIG FUN', ink: '#ff8c00',
    story: 'Born in Brooklyn, raised in Belleville. Took Detroit to the pop charts with Inner City, and with Reese made a bassline that drum & bass is still built on.', trackIds: ['reese', 'big-fun', 'good-life'] },
  { id: 'fowlkes', name: 'Eddie "Flashin" Fowlkes', aka: [], wave: 'first', city: 'Detroit', role: 'DJ · Producer', labels: ['Metroplex', 'Tresor'], tag: 'THE FOURTH NAME', ink: '#ffd400',
    story: 'Part of Deep Space Soundworks with the Belleville Three, and often left out of the "three." His records on Metroplex and later Tresor bridge the two cities.', trackIds: [] },
  { id: 'banks', name: '"Mad" Mike Banks', aka: ['Underground Resistance', 'Galaxy 2 Galaxy'], wave: 'second', city: 'Detroit', role: 'Producer · UR co-founder', labels: ['Underground Resistance', 'Submerge'], tag: 'FACELESS. FEARLESS.', ink: '#b8ff00',
    story: 'Session funk bassist turned techno militant. Built UR and the Submerge distribution house to keep Detroit\'s music in Detroit\'s hands.', trackIds: ['hi-tech-jazz', 'sonic-destroyer'] },
  { id: 'mills', name: 'Jeff Mills', aka: ['The Wizard', 'X-101'], wave: 'second', city: 'Detroit', role: 'DJ · Producer · Axis founder', labels: ['Axis', 'Purpose Maker', 'Tresor'], tag: 'THREE DECKS', ink: '#b8ff00',
    story: 'Radio DJ "The Wizard," UR co-founder, then the DJ Berlin measured itself against. Tresor\'s first record has his hands on it.', trackIds: ['sonic-destroyer', 'the-bells'] },
  { id: 'hood', name: 'Robert Hood', aka: ['Floorplan'], wave: 'second', city: 'Detroit', role: 'Producer · M-Plant founder', labels: ['M-Plant'], tag: 'MINIMAL', ink: '#b8ff00',
    story: 'UR\'s "minister of information," then the architect of minimal techno: everything stripped out but the groove.', trackIds: [] },
  { id: 'craig', name: 'Carl Craig', aka: ['Paperclip People', '69', 'Innerzone Orchestra'], wave: 'second', city: 'Detroit', role: 'Producer · Planet E founder', labels: ['Planet E'], tag: 'PLANET E', ink: '#a63be6',
    story: 'Derrick May\'s protégé. Took Detroit into jazz, ambient and orchestra halls, and curated the first Detroit Electronic Music Festival.', trackIds: ['at-les'] },
  { id: 'hegemann', name: 'Dimitri Hegemann', aka: [], wave: 'berlin', city: 'Berlin', role: 'Club founder · Tresor', labels: ['Tresor'], tag: 'THE VAULT', ink: '#ffffff',
    story: 'Ran the UFO club before the Wall fell, then opened Tresor in a bank vault in the death strip. Booked Detroit when Detroit couldn\'t get booked at home.', trackIds: ['sonic-destroyer'] },
  { id: 'vonoswald', name: 'Moritz von Oswald', aka: ['3MB', 'Basic Channel', 'Maurizio', 'Borderland'], wave: 'berlin', city: 'Berlin', role: 'Producer', labels: ['Basic Channel', 'Chain Reaction'], tag: 'DUB TECHNO', ink: '#ffffff',
    story: 'Recorded with Juan Atkins in 1992 and again as Borderland in 2013. With Mark Ernestus, turned Detroit\'s chords into Berlin\'s dub techno.', trackIds: ['jazz-teacher', 'phylyps', 'borderland'] },
];

export const TX_SOURCES = [
  'Dan Sicko, Techno Rebels: The Renegades of Electronic Funk (1999; rev. 2010)',
  'Felix Denk & Sven von Thülen, Der Klang der Familie: Berlin, Techno and the Fall of the Wall (2012; English 2014)',
  'Simon Reynolds, Energy Flash / Generation Ecstasy (1998)',
  'High Tech Soul: The Creation of Techno Music, dir. Gary Bredow (2006)',
  'Universal Techno, dir. Dominique Deluze (1996)',
];

export const trackById = (id: string) => TX_TRACKS.find((t) => t.id === id) || TX_DOCS.find((t) => t.id === id);
export const pioneerById = (id: string) => TX_PIONEERS.find((p) => p.id === id);
export const ytSearchUrl = (t: TxTrack) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.artist} ${t.title}`)}`;
