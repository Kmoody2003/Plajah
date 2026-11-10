// The Originator: a tribute to Juan Atkins, celebrating a living pioneer. Keep claims to the documented
// record; when adding more, cite it in TX_SOURCES.

export const ATKINS_ALIASES = ['Cybotron', 'Model 500', 'Infiniti', 'Channel One', '3MB', 'Borderland', 'The Originator'];

export interface AtkinsChapter { id: string; years: string; title: string; body: string; trackIds?: string[] }

export const ATKINS_CHAPTERS: AtkinsChapter[] = [
  { id: 'ch-roots', years: '1962–1979', title: 'Detroit-born, Belleville-raised',
    body: 'Juan Atkins was born in Detroit on 12 September 1962 and moved to Belleville, a small town west of the city, as a teenager. He played bass and drums, listened to Parliament-Funkadelic and, through the Electrifying Mojo, to Kraftwerk. Then he got his first synthesizer and started building tracks of his own.' },
  { id: 'ch-cybotron', years: '1980–1985', title: 'Cybotron',
    body: 'At Washtenaw Community College he met Rick Davis, an older Vietnam veteran and synth collector. As Cybotron they released "Alleys of Your Mind" in 1981 on their own label, then "Cosmic Cars", "Clear" and the album Enter. "Clear" became one of the foundation records of electro.',
    trackIds: ['alleys', 'cosmic-cars', 'clear'] },
  { id: 'ch-word', years: '1980–1984', title: 'The word',
    body: 'Atkins took the futurist language of Alvin Toffler\'s The Third Wave, whose "techno rebels" ride the information age, and put it on a record: Cybotron\'s "Techno City" (1984). Four years later a UK compilation used his word as its title, and the shelves followed.',
    trackIds: ['techno-city', 'techno-music'] },
  { id: 'ch-metroplex', years: '1985–1990', title: 'Metroplex and Model 500',
    body: 'When Davis moved toward rock, Atkins went solo and independent. He founded Metroplex and released "No UFO\'s" as Model 500 in 1985: faster, sparer and colder than Cybotron. "Night Drive", "The Chase" and the Channel One record "Technicolor" followed.',
    trackIds: ['no-ufos', 'night-drive', 'the-chase'] },
  { id: 'ch-teacher', years: 'early 1980s', title: 'The teacher',
    body: 'Derrick May and Kevin Saunderson were younger friends from Belleville. Atkins showed them the machines and DJ\'d with them (and Eddie Fowlkes) as Deep Space Soundworks. Two of the most important labels in techno, Transmat and KMS, grew out of those lessons.' },
  { id: 'ch-berlin', years: '1992–2016', title: 'Across the Atlantic',
    body: 'When Berlin opened its vaults, Atkins was there. He recorded with Moritz von Oswald and Thomas Fehlmann as 3MB for Tresor in 1992, released the Infiniti album Skynet on Tresor, and in 2013 reunited with von Oswald as Borderland.',
    trackIds: ['jazz-teacher', 'borderland'] },
  { id: 'ch-future', years: '1995–today', title: 'Still pointed at the future',
    body: 'Model 500 albums arrived a decade after the singles: Deep Space (1995), Mind and Body (1999) and, thirty years after Metroplex 001, Electric Night (2015). Forty-plus years in, the science fiction is still the point.',
    trackIds: ['game-one', 'deep-space', 'electric-night'] },
];

export interface AtkinsSleeve { title: string; as: string; year: number; label: string; trackId?: string }

export const ATKINS_SLEEVES: AtkinsSleeve[] = [
  { title: 'Alleys of Your Mind', as: 'Cybotron', year: 1981, label: 'Deep Space', trackId: 'alleys' },
  { title: 'Cosmic Cars', as: 'Cybotron', year: 1982, label: 'Deep Space', trackId: 'cosmic-cars' },
  { title: 'Clear', as: 'Cybotron', year: 1983, label: 'Fantasy', trackId: 'clear' },
  { title: 'Techno City', as: 'Cybotron', year: 1984, label: 'Fantasy', trackId: 'techno-city' },
  { title: "No UFO's", as: 'Model 500', year: 1985, label: 'Metroplex', trackId: 'no-ufos' },
  { title: 'Night Drive', as: 'Model 500', year: 1985, label: 'Metroplex', trackId: 'night-drive' },
  { title: 'Technicolor', as: 'Channel One', year: 1986, label: 'Metroplex' },
  { title: 'Techno Music', as: 'Juan Atkins', year: 1988, label: '10 Records', trackId: 'techno-music' },
  { title: 'The Chase', as: 'Model 500', year: 1989, label: 'Metroplex', trackId: 'the-chase' },
  { title: 'Jazz Is the Teacher', as: '3MB feat. Juan Atkins', year: 1992, label: 'Tresor', trackId: 'jazz-teacher' },
  { title: 'Game One', as: 'Infiniti', year: 1994, label: 'Metroplex', trackId: 'game-one' },
  { title: 'Deep Space', as: 'Model 500', year: 1995, label: 'R&S', trackId: 'deep-space' },
  { title: 'Mind and Body', as: 'Model 500', year: 1999, label: 'R&S' },
  { title: 'Borderland', as: 'Borderland', year: 2013, label: 'Tresor', trackId: 'borderland' },
  { title: 'Electric Night', as: 'Model 500', year: 2015, label: 'R&S', trackId: 'electric-night' },
];

export const ATKINS_DEDICATION =
  'Before it had a name, Juan Atkins was already making it. He heard a future in the sound of a city losing its factories, built it out of drum machines and synthesizers, taught his friends, named it, and put it out on his own label so nobody could tell him no. Every warehouse, vault and festival field that has shaken to a kick drum since owes something to a kid from Belleville with a science-fiction imagination. Thank you, Juan.';
