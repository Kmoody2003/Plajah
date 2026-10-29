// SOMA drum knowledge — the real instrument behind every SOMA preset: where it comes from, how it is
// built, how it is played and the music it belongs to, presented in Chora by the Session Band's
// percussionist (Amara Okafor). Every entry cites the sources it was written from; every photo is a
// freely licensed Wikimedia Commons file, credited with its author and licence. SOMA models the
// acoustics of these drums; it does not stand in for any tradition. Pure data.

export type DrumId =
  | 'timpani' | 'bass-drum' | 'snare-drum' | 'concert-tom' | 'gong-drum'
  | 'djembe' | 'dunun' | 'dundun' | 'bata' | 'udu'
  | 'conga' | 'bongo' | 'nagado-daiko' | 'shime-daiko' | 'bodhran' | 'plateau-hand-drum'
  | 'darbuka' | 'tabla' | 'mridangam' | 'kanjira' | 'daf' | 'bendir' | 'tar' | 'frame-drum';

export interface DrumPhoto {
  /** Wikimedia Commons file name (without "File:"). */
  file: string;
  author: string;
  license: string;
  /** Empty for public-domain files. */
  licenseUrl: string;
  /** The file's Commons description page. */
  sourceUrl: string;
  caption: string;
}

export interface DrumSource { title: string; publisher: string; url: string }
export interface DrumStroke { name: string; how: string }

export interface DrumKnowledge {
  id: DrumId;
  name: string;
  aka: string[];
  family: string;
  region: string;
  /** Amara's spoken introduction, first person. */
  intro: string;
  origins: string[];
  build: { shell: string; head: string; tuning: string };
  playing: { summary: string; strokes: DrumStroke[] };
  traditions: string[];
  /** Sacred / ceremonial status or protocol worth knowing. */
  respect?: string;
  sources: DrumSource[];
  photo: DrumPhoto;
}

/** Commons serves a resized copy of any file at Special:FilePath (snapped to its standard thumbnail widths). */
export const drumPhotoUrl = (p: DrumPhoto, width = 640): string =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.file)}?width=${width}`;

/** The same photo bundled with the app (a ~960px Commons copy), so it shows offline. */
export const drumPhotoLocalUrl = (id: DrumId): string => `/soma/drums/${id}.jpg`;

const CC = (v: string) => `https://creativecommons.org/licenses/${v}/`;
const COMMONS = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
const photo = (file: string, author: string, license: string, licenseUrl: string, caption: string): DrumPhoto =>
  ({ file, author, license, licenseUrl, sourceUrl: COMMONS(file), caption });

const PHOTOS: Record<DrumId, DrumPhoto> = {
  'timpani': photo('Munich - A standard set of timpani Percussion - 5647.jpg', 'Jorge Royan', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A standard set of orchestral timpani, Munich.'),
  'bass-drum': photo('Gran cassa.jpg', 'Žiga', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'An orchestral bass drum (gran cassa) on its stand.'),
  'snare-drum': photo('Civil War-Era Snare or Side Drum - DPLA - 75ca8275caa9d92240e6a4fc52198112.jpg', 'Conrad and Frederick Soistmann (makers); via DPLA', 'Public domain', '', 'A rope-tensioned American Civil War–era snare (side) drum made by Conrad and Frederick Soistmann.'),
  'concert-tom': photo('Tom-tom 12x8.jpg', 'Marco van den Hout', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A 12"×8" tom-tom with a coated head. Concert toms are the single-headed, open-bottom version of this drum.'),
  'gong-drum': photo('Gong Drum (from Emil Richards Collection).jpg', 'Xylosmygame', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A 60" single-headed gong drum from percussionist Emil Richards\'s collection.'),
  'djembe': photo('Lenke djembe from Mali.jpeg', 'Djembe Art', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A carved djembe from Mali with a rope-tuned goatskin head.'),
  'dunun': photo('Dundun malinke.jpg', 'Kuba Pogorzelski', 'Public domain', '', 'A set of dunun bass drums of the kind played by Malinke (Maninka) drummers in northern Guinea.'),
  'dundun': photo('Talking drum from western part of Nigeria, West Africa.jpg', 'Bamidele S. Ajayi', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'Hourglass talking drums from western Nigeria, laced with leather tension cords.'),
  'bata': photo('Bata drums.jpg', 'Kenneth Ritchards (photo); drums carved by Harold Muñiz', 'Public domain', '', 'A set of batá drums — from left, okónkolo, iyá and itótele.'),
  'udu': photo('Udu Drum.jpg', 'Dan Moi', 'CC BY-SA 2.0', CC('by-sa/2.0'), 'A fired-clay udu with its side hole, made by Dan Moi.'),
  'conga': photo('Collectie Nationaal Museum van Wereldculturen TM-6335-1a Enkelvellige tonvormige buistrom, onderdeel van een set Cuba.jpg', 'Nationaal Museum van Wereldculturen', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A Cuban tumbadora (conga) from a set in the collection of the Dutch National Museum of World Cultures.'),
  'bongo': photo('Bongos Meinl HB100-NT.jpg', 'muzyczny.pl', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'A pair of bongos — the smaller macho and the larger hembra joined by a bridge.'),
  'nagado-daiko': photo('Miya Daiko drum - Taiko drums.jpg', 'Taiko-Kaiser-Drums', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A miya-daiko — a nagadō-daiko with tacked cowhide heads, the drum type used for ōdaiko.'),
  'shime-daiko': photo('Shime Daiko drum - Shime Taiko Trommel.jpg', 'Taiko-Kaiser-Drums', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A rope-tensioned shime-daiko.'),
  'bodhran': photo('Rammetromme.jpg', 'Fisle Nor', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'An Irish bodhrán with its tipper (cipín).'),
  'plateau-hand-drum': photo('NEPE304 Drum.jpg', 'Nez Perce National Historical Park (NEPE 304)', 'Public domain', '', 'A two-headed rawhide dance drum (83 cm, hollowed cottonwood frame) given to L.V. McWhorter in 1933 by Peo Peo Tholekt, who painted it; the park believes it is Salish or Flathead in origin. The preset models a smaller single-headed cedar-hoop hand drum.'),
  'darbuka': photo('Darbuka do Cairo.jpg', 'Siffert80', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'An inlaid Egyptian darbuka (tabla) from Cairo.'),
  'tabla': photo('Tabla, musical instrument..JPG', 'Naveed.yzi', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'A tabla pair: the wooden dayan and the larger metal bayan.'),
  'mridangam': photo('Wiki-mridangam.jpg', 'Domtw (French Wikipedia)', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A mridangam, the double-headed barrel drum of Carnatic music.'),
  'kanjira': photo('Kanjira.JPG', 'Sven.petersen', 'Public domain', '', 'A kanjira — a small frame drum with a single pair of jingles.'),
  'daf': photo('Pair of dafs.jpg', 'Olaf', 'CC BY-SA 2.0', CC('by-sa/2.0'), 'Two dafs, showing the metal rings fixed around the inside of the frame.'),
  'bendir': photo('Bendir avec écriture arabe.JPG', 'Touzrimounir', 'CC BY-SA 4.0', CC('by-sa/4.0'), 'A North African bendir painted with Arabic calligraphy.'),
  'tar': photo('COLLECTIE TROPENMUSEUM Lijsttrom TMnr 3827-29.jpg', 'Collectie Wereldmuseum (v/h Tropenmuseum), part of the National Museum of World Cultures', 'CC BY-SA 3.0', CC('by-sa/3.0'), 'A frame drum (tar) of skin stretched over a wooden frame, Wereldmuseum collection.'),
  'frame-drum': photo('Bęben obręczowy i pałka.jpg', 'Swietliste', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'A traditional Polish frame drum and beater made by Katarzyna Zedel.'),
};

/** Every SOMA preset → the drum it models. */
export const SOMA_PRESET_DRUM: Record<string, DrumId> = {
  'timpani-29-dresden': 'timpani', 'timpani-32-profondo': 'timpani', 'timpani-23-piccolo': 'timpani',
  'timpani-pedal-gliss': 'timpani', 'timpani-staccato-wood': 'timpani', 'timpani-cymbal-shell': 'timpani',
  'djembe-lenke-master': 'djembe', 'djembe-slap-sega': 'djembe', 'djembe-gun-bass': 'djembe',
  'talking-drum-gangan': 'dundun', 'dundun-dununba': 'dunun', 'bata-iya-sacred': 'bata',
  'conga-habana-open': 'conga', 'quinto-slap-sec': 'conga', 'tumba-palma-bass': 'conga', 'conga-muff-quemado': 'conga',
  'bongo-macho-martillo': 'bongo', 'bongo-hembra-open': 'bongo',
  'nagado-daiko-odaiko': 'nagado-daiko', 'shime-daiko-tense': 'shime-daiko',
  'concert-gran-cassa': 'bass-drum', 'orchestral-field-snare': 'snare-drum', 'concert-tom-mahogany': 'concert-tom', 'gong-drum-boobam': 'gong-drum',
  'darbuka-cairo-doum': 'darbuka', 'darbuka-tek-ka': 'darbuka', 'tabla-dayan-na': 'tabla', 'mridangam-carnatic': 'mridangam',
  'daf-persian-rings': 'daf', 'udu-igbo-clay': 'udu',
  'bodhran-kerry-tipper': 'bodhran', 'bendir-atlas-gut': 'bendir', 'tar-nubian-deep': 'tar',
  'shamanic-cedar-beater': 'plateau-hand-drum', 'kanjira-lizard-frame': 'kanjira', 'ocean-frame-brush': 'frame-drum',
};

const ENTRIES: Omit<DrumKnowledge, 'photo'>[] = [
{
  id: 'timpani',
  name: 'Timpani',
  aka: ['kettledrums', 'Pauken', 'timbales (French, Spanish)'],
  family: 'Kettle drum (membranophone)',
  region: 'Europe (orchestral); kettledrum ancestors from the Arab and Ottoman Middle East',
  intro: 'These are timpani, the orchestra\'s tuned thunder. I\'m a student of this one, not a native, but I love how a pedal under your foot lets a drum sing a bass line. Strike it a hand-width in from the rim and it blooms.',
  origins: [
    'Timpani descend from Arabian nakers, small belt-mounted drums that reached Continental Europe in the 13th century through the Crusades and Saracen contact. Larger horse-mounted kettledrums, used in the Middle East since the 12th century, reached the French court in 1457 with a Hungarian delegation; they developed alongside trumpets as the main cavalry instruments, which is why timpani and trumpets are still paired in the orchestra.',
    'Early drums had the head nailed to the shell; in the 15th century heads were tensioned with a counterhoop tied to the shell, and in the early 16th century screws replaced the cords, making the drums tunable to definite pitch. Monteverdi\'s L\'Orfeo (1607) is an early example of trumpet and kettledrum music, and by the last third of the 18th century timpani were a fixture of the classical orchestra. Haydn and Beethoven gave them dramatic solos and independent roles. Early drums did not ring nearly as long as modern ones.',
    'Late 19th-century machine systems let the whole head be retuned at once; pedal drums followed. The Dresden pedal sits at the player\'s side and works by ankle motion, while the Berlin-style pedal is on the far side with a long arm worked by the whole leg. In the early 20th century Hans Schnellar of the Vienna Philharmonic developed a design in which the bowl moves while the head stays still, known as Viennese (Wiener Pauken) or Schnellar timpani. Plastic heads came in the mid-20th century, led by Remo.',
  ],
  build: {
    shell: 'A bowl traditionally of copper (cheaper drums use fiberglass or aluminium); hemispheric bowls sound brighter, parabolic bowls darker. A standard set uses four drums of roughly 32, 29, 26 and 23 inches (81, 74, 66, 58 cm); a piccolo drum of about 20 inches reaches higher notes.',
    head: 'Calfskin or goatskin, or plastic (PET film), which is more durable and more common; many professionals prefer skin for a warmer tone. The head sits on a flesh hoop held by a counterhoop and six to eight tension rods; head size is about two inches larger than the bowl size (a 23-inch drum takes a 25-inch head).',
    tuning: 'Each drum covers roughly a perfect fifth. Pedal mechanisms (ratchet, balanced action, friction clutch) change the tension of the whole head at once; chain or hand-cranked machine drums do the same with a handle. The player first \'clears\' the head by equalizing tension at every rod so the pitch is true.',
  },
  playing: {
    summary: 'The player stands or sits among an arc of two to five drums and strikes with a pair of sticks, tuning by foot and ear, often in the middle of a piece. Setup order varies: lowest drum on the left (French, British, North American tradition) or the reverse (German, Austrian).',
    strokes: [
      { name: 'Open tone', how: 'Strike about four inches (10 cm) in from the edge for the round, resonant timpani sound; the stick lifts away so the head rings.' },
      { name: 'Edge stroke', how: 'Playing closer to the edge makes the sound thinner; playing nearer the centre gives a shorter, more staccato sound.' },
      { name: 'Roll', how: 'Rapid alternating single strokes at a speed matched to the drum\'s pitch (higher drums need faster rolls); sticks are held a few inches apart for sustain.' },
      { name: 'Damping', how: 'Fingertips rest on the head while the stick is held with thumb and index finger, stopping the note silently at the length the score asks for.' },
      { name: 'Pedal glissando', how: 'Changing pitch with the pedal while the note still sounds. Carl Nielsen is cited as one of the first to ask for it (Symphony No. 4); Bartók, Barber and Strauss also used the freedom of pedal timpani.' },
    ],
  },
  traditions: [
    'Baroque and classical orchestras: timpani paired with trumpets, usually tuned to tonic and dominant (Bach\'s cantata Tönet, ihr Pauken!; Haydn\'s \'Drumroll\' Symphony No. 103). Wooden sticks are used for authentic Baroque performance.',
    'Beethoven\'s Violin Concerto opens with four solo timpani strokes; the scherzo of his Ninth Symphony sets timpani tuned an octave apart against the orchestra.',
    'Cavalry and ceremonial use with trumpets continues in parts of the British Army.',
    'Highly regarded 20th-century players named in sources include Hans Schnellar, Saul Goodman, Fred Hinger and Cloyd Duff.',
  ],
  sources: [
    { title: 'Timpani', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Timpani' },
  ],
},
{
  id: 'bass-drum',
  name: 'Bass drum (gran cassa)',
  aka: ['concert bass drum', 'gran cassa', 'grosse caisse', 'Grosse Trommel', 'bombo'],
  family: 'Double-headed cylindrical drum (membranophone)',
  region: 'Europe (orchestral); ancestors in the Turkish davul and Ottoman military bands',
  intro: 'This is the gran cassa, the biggest drum in the orchestra. I\'m a respectful student of it: a soft mallet, a loose head, and the floor shakes before you hear it. The low boom has no clear pitch.',
  origins: [
    'Sources trace the earliest known predecessor of the orchestral bass drum to the Turkish davul, a two-headed cylindrical drum struck on one side with a large stick and on the other with a rod. The Ottoman Janissary military bands of the 18th century were among the first groups to feature davul, cymbals and kettledrums.',
    'The modern orchestral bass drum is double-headed, often rod-tensioned, roughly 40 inches across and 20 inches wide, usually mounted in a frame that can be tilted to any angle. It is the largest drum of the orchestra.',
  ],
  build: {
    shell: 'A wide, shallow cylinder (diameter usually larger than depth), often about 40 by 20 inches for orchestral use, held in a frame or cradle.',
    head: 'A struck head at each end, calfskin or plastic, mounted on hoops.',
    tuning: 'Threaded taps, rods or cords adjust tension; the head is usually tuned low and loose to avoid a definite pitch, though tighter tuning gives a more timpani-like tone.',
  },
  playing: {
    summary: 'In the concert hall the drum sits on a cradle with the heads tilted or vertical and is struck with a heavy felt-covered mallet; sometimes a rute is held in the other hand. Composers use it for local colour, climactic single strokes, rolls and weight in loud tutti passages.',
    strokes: [
      { name: 'Single stroke', how: 'One heavy felt mallet (mailloche in French, mazza in Italian) for a climactic boom.' },
      { name: 'Roll', how: 'Two matching mallets or a double-headed mallet.' },
      { name: 'Con la mano', how: 'Played with the hand or fingers for soft effects.' },
      { name: 'Sound effects', how: 'Used for thunder or earthquake effects in scores.' },
    ],
  },
  traditions: [
    'Orchestras and concert bands: the bass drum adds weight and punctuation to tutti passages.',
    'Military and marching bands, where it projects the tempo.',
  ],
  sources: [
    { title: 'Bass drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bass_drum' },
  ],
},
{
  id: 'snare-drum',
  name: 'Snare drum',
  aka: ['side drum', 'caisse claire', 'field drum (marching form)', 'tabor (ancestor)'],
  family: 'Double-headed snared drum (membranophone)',
  region: 'Europe; medieval tabor, with Swiss and French military drumming',
  intro: 'This is the snare drum. Its ancestor, the tabor, played with a fife on the march, and the rudiments we practice grew from old military signals. I treat it as a classroom: every roll and flam is a pattern with a name.',
  origins: [
    'The snare drum seems to descend from the medieval tabor, a drum with a single gut snare across the bottom, first used in war and often played with a fife. By the 15th century the drum had grown larger and cylindrical, and it was popular with Swiss mercenary troops (15th to 16th centuries). It was made deeper and carried at the side of the body, hence \'side drum\'.',
    'In the 17th century, screws to hold the snares gave a brighter sound than a loose snare; metal snares appeared in the 20th century. Before radio, the snare drum communicated orders and camp duty calls such as the \'Tattoo\'. Rudiments are traced to 14th-century Swiss mercenaries; the Battle of Sempach (1386) is often cited as an early instance of rudimental fife and drum.',
    'Rudiments were codified over time: Strube\'s 25 rudiments (1870) and the NARD standard 26 (1933) led to the Percussive Arts Society\'s 40 International Snare Drum Rudiments (1984).',
  ],
  build: {
    shell: 'Wood (plies, steam-bent, segmented, stave or solid), metal, acrylic or composite. Concert and kit snares are typically 14 inches across and 5 to 8 inches deep; marching drums are deeper, often about 12 inches; the rope-tension field drum is the tallest and heaviest kind.',
    head: 'A batter head and a thinner resonant head, historically calf or goat skin and today mostly Mylar. The snares (gut, metal, nylon or other strands) lie against the bottom head; gut is the historical type and metal snares came later.',
    tuning: 'Tension rods set head tension, and a strainer lever engages or releases the snares. Field drums were tensioned with ropes.',
  },
  playing: {
    summary: 'Struck with sticks (or brushes, rute, hands) on the batter head; the resonant head sets the snares rattling for the crack. In the orchestra it provides rhythmic accents and military colour; in marching it carries cadence and rudiments.',
    strokes: [
      { name: 'Rimshot', how: 'Head and rim struck together; in concert playing, a stick is placed on the head and the rim is struck by the other stick.' },
      { name: 'Cross-stick (rim click)', how: 'Tip of the stick on the head, butt struck on the rim to give a dry click.' },
      { name: 'Buzz (pressed) roll', how: 'Alternating bounced strokes that the snares blend into one sustained sound.' },
      { name: 'Double-stroke roll', how: 'Alternating double strokes; single-stroke rolls use very fast single strokes.' },
      { name: 'Snares off', how: 'Disengage the strainer so the drum sounds like a tom-tom.' },
    ],
  },
  traditions: [
    'Military drumming and fife-and-drum traditions across Switzerland, France, Britain and America.',
    'Concert and orchestral playing, including the French school (Robert Tourte\'s 1946 method pairs rudiments with Scheherazade and Bolero excerpts).',
    'Marching bands, drum corps and Scottish pipe bands, which use their own sets of rudiments.',
  ],
  sources: [
    { title: 'Snare drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Snare_drum' },
    { title: 'Drum rudiment', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Drum_rudiment' },
  ],
},
{
  id: 'concert-tom',
  name: 'Concert tom',
  aka: ['single-headed tom', 'concert tom-tom'],
  family: 'Single-headed cylindrical drum (membranophone)',
  region: 'United States (kit and studio use); orchestral percussion',
  intro: 'These are concert toms: single-headed, open at the bottom, so the note speaks and then stops. They come in graduated sizes, so I treat them as a short-decay melodic voice.',
  origins: [
    'The word tom-tom is of Anglo-Indian and Sinhala origin, and the tom drum was added to the drum kit in the early 20th century. Slingerland began offering fully tunable two-headed toms in 1936.',
    'Concert toms (single-headed toms with a shell slightly shallower than a comparable double-headed tom) came in the early 1970s, with Ludwig making them in sizes from 6 by 5.5 up to 16 by 14 inches, mounted in pairs on a stand. Their use in drum kits has fallen off since the 1970s; Phil Collins is named as a player of four single-headed toms.',
  ],
  build: {
    shell: 'A cylinder, usually wood, slightly shallower than a double-headed tom of the same diameter, open at the bottom.',
    head: 'One head only, on the top, with no bottom resonant head.',
    tuning: 'Tension rods on the single head; the open bottom gives a dry, direct sound with a shorter sustain.',
  },
  playing: {
    summary: 'Played with sticks or mallets in sets of graduated sizes, in kit setups, studio recordings and percussion sections.',
    strokes: [
      { name: 'Stick stroke', how: 'Drumstick on the head, each size tuned to its own pitch.' },
      { name: 'Run across the set', how: 'Moving through the graduated sizes from high to low for fills.' },
    ],
  },
  traditions: [
    'Rock and fusion drumming from the 1970s onward.',
    'Studio and concert percussion setups.',
  ],
  sources: [
    { title: 'Tom drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tom_drum' },
  ],
},
{
  id: 'gong-drum',
  name: 'Gong drum',
  aka: ['gong bass drum'],
  family: 'Single-headed bass drum (membranophone)',
  region: 'Britain (19th-century gong drum); United States and Japan (modern gong bass drums)',
  intro: 'A gong drum is a large single-headed drum on legs or a stand. Loose, it booms with no pitch; tight, it sings like a timpani. I\'m a student here, but I love the long, low bloom.',
  origins: [
    'One history says a narrow-shelled, single-headed gong drum, 70 to 100 cm across, was introduced in Britain in the 19th century. Lacking a second head to balance the sound, it tended to have a definite pitch, which composers found hard to use, and smaller non-pitched drums led to the modern orchestral bass drum.',
    'Modern gong bass drums were first produced by Tama in the late 1970s. They are most often 20 or 22 inches; orchestral versions can be 28 inches. Players cited include Peter Criss, Billy Cobham, Neil Peart, Stewart Copeland and Mike Portnoy.',
  ],
  build: {
    shell: 'A large single-headed shell, often mounted on legs, roll-away stands or tom arms.',
    head: 'A single large head, which can be tuned very loose or tighter.',
    tuning: 'Tuned as loose as possible to avoid pitch, or more tightly for timpani-like tones.',
  },
  playing: {
    summary: 'Struck with a mallet or stick. Related tube drums such as octobans (introduced by Tama in 1978: deep, 6-inch diameter, single-headed, originally in melodically tuned sets of eight) are a different instrument, though also single-headed.',
    strokes: [
      { name: 'Mallet strike', how: 'A large soft mallet for a deep, resonant boom.' },
      { name: 'Stick strike', how: 'A stick for a more defined attack.' },
    ],
  },
  traditions: [
    'Rock, fusion and studio kits since the late 1970s.',
    'Orchestral percussion in 28-inch versions.',
  ],
  sources: [
    { title: 'Gong drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Gong_drum' },
    { title: 'Octoban', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Octoban' },
    { title: 'Bass drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bass_drum' },
  ],
},
{
  id: 'djembe',
  name: 'Djembe',
  aka: ['jembe', 'djembé'],
  family: 'Goblet drum (membranophone), rope-tuned',
  region: 'Mande West Africa: Mali, Guinea and neighbouring countries of the old Mali Empire',
  intro: 'This is the djembe, the Mande goblet drum. Bass, tone and slap: three voices from one skin, played with bare hands. Mande players say a skilled drummer can make the djembe talk, and I have spent years trying to listen well enough to hear it.',
  origins: [
    'The name comes from Malinke jembe. A Bambara saying in Mali explains it as "Anke djé, anke bé", roughly "everyone gather together in peace". The drum is generally associated with the Numu, the Mande blacksmith caste, whose migrations may have spread it across West Africa during the first millennium CE.',
    'Its traditional range matches the Mali Empire (from about 1230 CE), though without written records it is unclear whether the djembe is older or younger than the empire. Its goblet shape suggests it may have been modelled on a wooden mortar.',
    'Outside West Africa it became known through Fodéba Keïta\'s Les Ballets Africains (founded 1952) and Guinea\'s national ballets, then through teachers such as Ladji Camara, Mamady Keïta and Famoudou Konaté, and the 1991 documentary Djembefola.'
  ],
  build: {
    shell: 'Carved from hardwood. Djembes from Mali, Guinea, Burkina Faso and Senegal are still mostly hand-carved from traditional species; softer woods such as tweneboa or mahogany are used by some makers elsewhere and are considered less suitable. Typical size is 30-38 cm across and 58-63 cm tall, about 5-13 kg.',
    head: 'Untreated (not limed) rawhide, most commonly goatskin, mounted over the wide opening and held with rings and rope.',
    tuning: 'Rope-tuned. Tightening the skin makes the drum louder and raises tone and slap; the bass is set by the size and shape of the shell rather than skin tension.'
  },
  playing: {
    summary: 'Played with bare hands. In the traditional ensemble several djembes play repeating accompaniment patterns while a lead player solos, over dunun bass drums and bells. The sounds are played "open", with the hand rebounding immediately.',
    strokes: [
      { name: 'Bass', how: 'Palm and flat fingers strike near the centre of the skin; the lowest sound, roughly 65-80 Hz.' },
      { name: 'Tone', how: 'Struck nearer the edge with most of the fingers and the edge of the palm in contact; a medium pitch.' },
      { name: 'Slap', how: 'Struck near the edge with only the edge of the palm and fingertips in contact; the highest, sharpest sound.' },
      { name: 'Third slap (tonpalo, lé)', how: 'A skilled player\'s in-between sound, between tone and slap.' }
    ]
  },
  traditions: [
    'Djembe and dunun ensembles in the Mande world; anyone who plays is a djembefola ("one who plays the djembe"), a term that implies no particular level of skill. The sege sege (metal rattle) is a common companion, alongside shekere and kese kese.',
    'Traditionally men played djembe and dunun, while instruments such as shekere were usually played by women; this has been changing, for example with the all-women group Nimbaya! (formerly Amazones) from Guinea.',
    'The national ballets of Guinea, Mali, Ivory Coast and Senegal, and djembefolas who moved abroad after 1984, carried the djembe around the world.'
  ],
  respect: 'The djembe is not a griot (jeli) instrument and has no hereditary restriction on who may play, but its rhythms belong to particular communities and occasions, so learn them from teachers who carry them.',
  sources: [
    { title: 'Djembe', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Djembe' },
    { title: 'Dunun', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dunun' }
  ],
},
{
  id: 'dunun',
  name: 'Dunun',
  aka: ['dundun', 'doundoun', 'dununba (largest)', 'sangban (medium)', 'kenkeni (smallest)'],
  family: 'Double-headed cylindrical bass drum (membranophone), rope-tuned',
  region: 'Mande West Africa: Guinea, Mali and neighbouring regions',
  intro: 'The dunun are the heartbeat under the djembe. Three drums, three jobs: kenkeni holds the pulse, sangban carries the pattern that gives the rhythm its identity, dununba lays the deep floor. Stick in one hand, bell in the other.',
  origins: [
    'Dunun is the generic name for a family of drums that developed alongside the djembe in the Mande drum ensemble. The names are Malinke: "ba" means "big", so dununba means "big dunun".',
    'In Mali and north-east Guinea the dununba and sangban are often called jeli-dunun because they were traditionally played by the jelis (griots). Among the Bamana in Mali the dununba is known as khassonka dunun and the sangban as konkoni.',
    'The spelling "djun djun" is a Western misnomer: Wikipedia notes there is no such word in Malinke.'
  ],
  build: {
    shell: 'A cylindrical body. Typical sizes: dununba 60-70 cm long and 40-50 cm across; sangban 50-60 cm by 30-40 cm; kenkeni 45-50 cm by 25-35 cm.',
    head: 'Rawhide at both ends, most commonly cow or goat; among the Bamana in Mali the drums are headed with goatskin.',
    tuning: 'Rope-tuned. Pitch falls as the drum gets bigger, giving low, middle and high voices.'
  },
  playing: {
    summary: 'Played horizontally on a stand or shoulder strap. A right-handed player strikes the skin with a stick in the right hand and plays a bell, mounted on the drum or hand-held, with the left. In the Mandingue style each player takes one drum; in ballet style one player commands all three.',
    strokes: [
      { name: 'Stick on skin', how: 'A plain straight stick, a curved flat-headed stick, or a straight stick with a cylindrical head, depending on region.' },
      { name: 'Bell (kenken)', how: 'The left hand plays a bell mounted on top of the drum or held in the hand; the held style is popular in Mali and originally from the Khassonke people.' },
      { name: 'Kenkeni part', how: 'Highest pitch, usually a simple pattern that holds the rhythm together.' },
      { name: 'Sangban part', how: 'Usually the more complex part that defines the rhythm.' },
      { name: 'Dununba part', how: 'Deep, widely spaced notes that add depth.' }
    ]
  },
  traditions: [
    'Always played in an ensemble with one or more djembes.',
    'The Hamana (Guinea) style with three bell-carrying dunun is the best known in the West, through teachers such as Mamady Keïta and Famoudou Konaté.',
    'In Bamako a two-drum style with konkoni, played without bells, developed; in the Khassonke region of Mali the biggest drum leads and solos.'
  ],
  sources: [
    { title: 'Dunun', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dunun' },
    { title: 'Djembe', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Djembe' }
  ],
},
{
  id: 'dundun',
  name: 'Dùndún (Yoruba talking drum)',
  aka: ['dundun', 'gangan', 'talking drum'],
  family: 'Hourglass tension drum (membranophone)',
  region: 'South-western Nigeria and Benin (Yoruba); related talking drums across West Africa',
  intro: 'This is the gangan, the Yoruba talking drum. Squeeze the cords under your arm and the pitch rises; that\'s how the drum speaks Yoruba, a tonal language. My grandmother could make it say your praise name.',
  origins: [
    'Hourglass talking drums are among the oldest instruments used by West African griots, and their history is traced to peoples including the Bono, the Yoruba, the Ghana Empire and the Hausa. Europeans noticed drum communication in the first half of the 18th century.',
    'Ayangalu is believed to have been the first Yoruba drummer; he was deified as an Orisha and is regarded as the patron spirit of drummers. "Ayan" means drummer, which is why many Yoruba family names begin with Ayan-.',
    'The Yoruba dùndún should not be confused with the Mande dunun bass drum. Related talking drums include the tama of the Serer, Wolof and Mandinka, and the atumpan and fontomfrom of the Asante.'
  ],
  build: {
    shell: 'An hourglass-shaped body. Yoruba and Dagomba talking drums are among the largest, typically 23-38 cm long with heads 10-18 cm across; in Yoruba ensembles they are used alongside smaller drums called gangan.',
    head: 'Two drumheads connected by leather tension cords.',
    tuning: 'The waist is held between the player\'s arm and ribs. Squeezing tightens the cords and both heads, raising the pitch, even within a single beat for a warbling note.'
  },
  playing: {
    summary: 'Held under the arm and struck with a stick while squeezing changes the pitch. Yoruba has three principal tones (low, medium, high), and the drum reproduces the pitch, volume and rhythm of speech, though not vowels or consonants.',
    strokes: [
      { name: 'Pitch bend', how: 'Squeezing or relaxing the cords under the arm raises and lowers the pitch.' },
      { name: 'Stick stroke', how: 'The stick strikes the head; a skilled player plays whole phrases.' },
      { name: 'Drum phrases', how: 'Short words are expanded into set poetic phrases that give context to the tones, so a drummed message is longer than the spoken one.' }
    ]
  },
  traditions: [
    'Used at ceremonies such as weddings and funerals, and at private functions.',
    'Central to Nigerian fuji and jùjú music, where it is known as dùndún; in Senegal the tama appears in mbalax.',
    'Drum language also carries proverbs, praise poetry and historical verse; among the Yoruba and Asante, expert drummers were often hereditary specialists attached to a king\'s court.'
  ],
  sources: [
    { title: 'Talking drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Talking_drum' }
  ],
},
{
  id: 'bata',
  name: 'Batá',
  aka: ['batá drums', 'iyá, itótele, okónkolo (the Cuban set)'],
  family: 'Double-headed hourglass drum (membranophone)',
  region: 'Yorubaland, south-western Nigeria; Cuba, Puerto Rico and the United States via Lukumí (Santería)',
  intro: 'These are batá. Iyá is the mother drum; she leads the conversation, and itótele and okónkolo answer. I studied them in Havana, and I treat them with great respect, because to many people they are not just instruments.',
  origins: [
    'Batá is a double-headed hourglass drum with one end larger than the other, among the most important drums of the Yoruba of western Nigeria, used for traditional and religious activities. Its early function was as a drum of the gods, of royalty and of ancestors.',
    'It is said to date back roughly 500 years and to have been introduced by a Yoruba king associated with Shangó (Changó); such origins are traditional rather than firmly documented. It reached Cuba in the 1820s with enslaved Yoruba people, and the first consecrated Cuban batá are said to date from around 1830.',
    'Batá were first heard on Cuban radio in 1935 as folk music; today they appear in Cuban timba, jazz and hip hop, and in Nigerian popular music including fuji fusions.'
  ],
  build: {
    shell: 'A hand-carved shell from a solid log; in Yorubaland the wood is oma. In the traditional account the drums are assembled without metal parts.',
    head: 'Goatskin heads: the larger head is the enu and the smaller the chacha. Tension straps are of cowhide, and a black paste called iro on the head shapes the tone.',
    tuning: 'Heads are held by leather straps (osan) and a bound ring at the rim (egi ilu). The three sizes (and in Nigeria, five) provide different pitch registers.'
  },
  playing: {
    summary: 'In Cuba, three tapered drums: iyá (largest, "mother"), itótele (middle, "father") and okónkolo (smallest, "baby"). They are played together in polyrhythmic compositions called toques, often with a shekere or chekeré and singers. Nigerian batá come in five sizes, played by hand or with a leather strap.',
    strokes: [
      { name: 'Enu (large head)', how: 'The larger head, giving the lower tones.' },
      { name: 'Chacha (small head)', how: 'The smaller head, giving the higher tones.' },
      { name: 'Toque', how: 'A named rhythm for an Orisha; at least 140 toques are said to exist, and the Oru del Igbodu is a liturgical set of 23 standard rhythms for all the Orishas.' },
      { name: 'Saworo bells', how: 'Small bells (saworoide in Yoruba, chaworó in Cuba) are attached to the iyá.' }
    ]
  },
  traditions: [
    'Lukumí (Santería) ceremonies called toque, tambor de santo or bembé, honouring Orishas; the most frequently stated purpose of the batá is glorifying Changó.',
    'Non-consecrated drums, called aberínkula, are used for secular performance, including by the women\'s group Obiní Batá.',
    'In the 1970s, Son-Batá or batá rock, strongly influenced by Irakere; in the 1990s, fusions with fuji music in Nigeria.'
  ],
  respect: 'Consecrated batá hold the spirit of Añá, and in Lukumí practice they are traditionally played only by initiated men in religious ceremonies (a convention some now question); unconsecrated aberínkula are used for secular playing.',
  sources: [
    { title: 'Batá drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bat%C3%A1_drum' }
  ],
},
{
  id: 'udu',
  name: 'Udu',
  aka: ['ùdù', 'kim-kim'],
  family: 'Clay vessel drum (idiophone)',
  region: 'Igbo people, south-eastern Nigeria',
  intro: 'The udu is a clay pot you play with your hands. Strike the side hole for a deep, breathy bass, and move your hand over the top hole to bend the pitch. In Igbo, ùdù means vessel, and the sound really is the pot breathing. I am a student of it, not a keeper.',
  origins: [
    'In Igbo, ùdù means "vessel" or "pot". It is a hand percussion instrument and one of the most important in Igbo music.',
    'Early udu were simply water jugs with an additional hole, played by Igbo women for ceremonial purposes. A legend says the first was made by accident: a hole punched in the side made the vessel useless as a jug, and instead of throwing it away the owner started to drum on it.',
    'Today the udu is used by percussionists in many styles worldwide. Makers include Clive Sithole and Eugene Skeef.'
  ],
  build: {
    shell: 'Usually fired clay, with a larger hole and a smaller upper hole. Modern versions can also be made of plastic or glass.',
    head: 'No skin head: the sound comes from the vessel body and the air moving through its holes.',
    tuning: 'Not tensioned. Pitch is shaped by the vessel and the openings, and varies with hand position over the small upper hole.'
  },
  playing: {
    summary: 'Placed on the lap or secured on a stand. The hands strike the large hole and play the body with the fingers.',
    strokes: [
      { name: 'Bass', how: 'Quickly strike the larger hole.' },
      { name: 'Pitch change', how: 'Adjust the hand position over the smaller upper hole to vary the pitch.' },
      { name: 'Body taps', how: 'Play the body of the pot with the fingers for a range of lighter sounds.' }
    ]
  },
  traditions: [
    'One of the most important instruments in Igbo music.',
    'Traditionally played by Igbo women for ceremonial purposes.',
    'Now widely used by percussionists in many styles.'
  ],
  sources: [
    { title: 'Udu', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Udu' }
  ],
},
  {
    id: 'conga',
    name: 'Conga (tumbadora)',
    aka: ['tumbadora', 'conga drum'],
    family: 'Single-headed barrel drum (membranophone)',
    region: 'Cuba, developed by Afro-Cuban communities; Bantu (Congo/Angola) and Yoruba drum ancestors',
    intro: 'This is the tumbadora, what the world calls a conga. In Havana I learned that the quinto talks, the conga answers and the tumba holds the floor under everybody. Same two hands, but each drum has its own voice, and that is the whole conversation of rumba.',
    origins: [
      'The exact origin of the conga is unknown, but researchers agree it was developed by Cuban people of African descent in the late 19th or early 20th century. Its direct ancestors are thought to be the Bantu-origin yuka and makuta drums and the Yoruba-origin bembé drums. Rumba, born in the poorer neighbourhoods of Havana and Matanzas, was the first established genre to call for the conga as standard instrumentation.',
      'In rumba and in carnival comparsas each drummer played one drum. From the 1930s conga bands carried the name abroad (the word comes from the carnival rhythm la conga), the drum joined son ensembles and mambo bands of the 1940s, and it reached jazz when Chano Pozo became the first Latin percussionist in Dizzy Gillespie\'s band; he co-wrote pieces like "Manteca" and "Tin Tin Deo" with Gillespie and died in 1948 at age 33.',
      'After the war, players began using two to four drums at once. Mongo Santamaría, who learned rumba on the streets of Havana, moved to New York in 1950, became Tito Puente\'s conguero, and later led pachanga and boogaloo hits including "Watermelon Man".',
    ],
    build: {
      shell: 'A tall, narrow, staved barrel, a little over 75 cm (30 in) high on a typical drum. Early drums are said to have been made from wooden barrels; today shells are staved wood (some makers carve a single piece) or fiberglass. The three main sizes are the quinto (about 11 in head), conga or tres dos (about 11.5 to 12 in) and tumba or salidor (about 12 to 12.5 in); a supertumba or rebajador can reach about 14 in.',
      head: 'The earliest drums used cow or mule hide tacked or nailed onto the top of the shell, as on many African drums. Modern heads are still often cow, water buffalo or steer hide, with synthetics also in use. Modern drums have a metal rim over the head, held by lugs.',
      tuning: 'Traditional tack-head drums were tuned by heat: warming the skin raised the pitch and moistening it lowered it. The screw-and-lug tension system arrived around the early 1950s, pioneered in Cuba by Carlos "Patato" Valdés and in the US by Cándido Camero. Two drums are often tuned a fourth apart; three drums invite chord-like tunings.',
    },
    playing: {
      summary: 'Played with the fingers and palms, seated or on a stand, one to four drums per player. In rumba the quinto improvises and punctuates against the steady tumba and conga; in son, salsa and Latin jazz the conga lays down the repeating tumbao (also called marcha) that locks with the clave.',
      strokes: [
        { name: 'Tono abierto (open tone)', how: 'Four fingers strike near the rim and bounce off, giving a clear ringing tone higher than the muffled and bass tones.' },
        { name: 'Tono ahogado / apagado (muff)', how: 'Like the open tone, but the fingers are held against the head, or the cupped hand or heel of the hand stays on it, to damp the sound.' },
        { name: 'Tono bajo (bass tone)', how: 'The full, slightly cupped palm strikes a little off centre for a low, muted thump.' },
        { name: 'Tono seco (slap)', how: 'The hardest stroke: a loud popping tone. The closed slap is also called tapao, galleta or quemao; the pressed slap and open slap are variants. The other hand rests on the head for the muted slap.' },
        { name: 'Manoteo (heel-toe)', how: 'The heel of the palm and the fingers alternate touches on the head to make the conga equivalent of a drumroll.' },
      ],
    },
    traditions: [
      'Rumba (guaguancó, yambú and columbia), where the quinto is the lead drum; guaguancó uses three congas.',
      'Son montuno, mambo and salsa, built on the tumbao; songo, which from the late 1960s brought rumba ideas into band conga parts (Changuito and Los Van Van); and Afro-Cuban jazz.',
      'Notable players include Chano Pozo, Mongo Santamaría, Tata Güines, Patato Valdés and Cándido Camero.',
    ],
    sources: [
      { title: 'Conga', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Conga' },
      { title: 'The History of Conga Drums: From Africa to Cuba', publisher: 'Paulo Stagnaro, CongaChops', url: 'https://www.congachops.com/blog-articles/a-brief-history-of-the-conga-drums' },
      { title: 'Chano Pozo', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Chano_Pozo' },
      { title: 'Mongo Santamaría', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mongo_Santamar%C3%ADa' },
    ],
  },
  {
    id: 'bongo',
    name: 'Bongos',
    aka: ['bongó', 'bongosero\'s drums'],
    family: 'Paired open-bottomed hand drums (membranophone)',
    region: 'Eastern Cuba (Oriente), late 19th century; Bantu-influenced',
    intro: 'Two small drums, joined by a little wooden bridge, held between the knees. The smaller macho is the sharp voice, the larger hembra the warm one, and the martillo ticks along under the whole band like a hammer. Then in the montuno the bongosero picks up the cowbell and the band catches fire.',
    origins: [
      'The origin of the bongo is not fully clear. It was first documented in Oriente province in eastern Cuba in the late 19th century, in nengón, changüí and their descendant, son cubano. Fernando Ortiz derived the word from the Bantu words for drum, and a region with a strong Congo and Angola presence fits the open-bottomed Central African drum models. Changüí musicians tell that the bongo began when pairs of tall bokú drums were cut in half.',
      'Smaller bongos were popular across Cuba by the 1910s and reached concert halls on the US East Coast in the 1930s. The first great named innovators came in the sexteto era, among them Óscar Sotolongo and José Manuel Carriera "El Chino". By the 1940s Arsenio Rodríguez had added the conga to the son format and had his bongosero double on cowbell.',
    ],
    build: {
      shell: 'Two shells about 20 cm (8 in) tall with head diameters of roughly 20 cm and 25 cm (8 and 10 in), usually wood (fiberglass is also common), joined by a small wooden bridge.',
      head: 'Calfskin is typical; the very first bongos used cow or mule hide tacked on. Changüí\'s larger bongó de monte keeps tack-heads.',
      tuning: 'Today most bongos have lugs and a tuning rim (adopted in the 1950s). Originally, tacked skins were tuned by heating with a flame and loosened with water, a method still used for traditional changüí bongos. Fernando Ortiz grouped them with the "tambores de candela" (flame-tuned drums).',
    },
    playing: {
      summary: 'Held behind the knees with the larger hembra on the right for a right-handed player (macho on the left in son). Played with fingers and palms near the edge; in classical works they may be played with sticks on stands. The bongosero keeps the martillo and adds improvised fills.',
      strokes: [
        { name: 'Martillo (hammer)', how: 'A continuous eight-stroke pattern that anchors son and salsa, played on the two drums.' },
        { name: 'Rim and edge strokes', how: 'The bongos are traditionally played by striking the edge of the heads with the fingers and palms.' },
        { name: 'Bramido / glissando', how: 'In changüí, the third finger, supported by the thumb, rubs across the head (often moistened or waxed) in a "howl", usually at the climax.' },
        { name: 'Cowbell switch', how: 'In the montuno section of a conjunto arrangement, the bongosero puts the bongos aside and plays a hand-held cowbell instead.' },
      ],
    },
    traditions: [
      'Changüí in Guantánamo, where the large bongó de monte plays lead-drum-like offbeat figures rather than a steady beat.',
      'Son cubano from the sexteto era onward, then salsa, Latin jazz and many later genres from bachata to Latin rock.',
      'Arsenio Rodríguez\'s conjunto style, with Antolín "Papa Kila" Suárez, often cited as one of the greatest bongoseros.',
    ],
    sources: [
      { title: 'Bongo drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bongo_drum' },
      { title: 'A Brief History of the Bongos', publisher: 'Paulo Stagnaro, CongaChops', url: 'https://www.congachops.com/blog-articles/a-brief-history-of-the-bongos' },
    ],
  },
  {
    id: 'nagado-daiko',
    name: 'Nagadō-daiko',
    aka: ['long-bodied drum', '長胴太鼓', 'ōdaiko (for the largest drum)'],
    family: 'Tacked-head barrel drum, taiko (membranophone)',
    region: 'Japan',
    intro: 'The nagadō-daiko is the barrel-bodied taiko, and the biggest ones are called ōdaiko, "great drum". You feel it in your chest before you hear it. I come to it as a student and a listener, and I love how a festival or temple can gather around one pulse.',
    origins: [
      'Taiko drums have a mythological origin in Japanese stories, but historical records suggest they arrived through Chinese and Korean cultural influence as early as the 6th century CE. A haniwa figure from Gunma Prefecture, "Man Beating the Taiko", is considered the oldest evidence of taiko playing in Japan.',
      'Taiko served in communication, warfare, theatre, religious ceremony and local festivals. In modern times, the ensemble style kumi-daiko was developed in 1951 by Daihachi Oguchi, a jazz-trained musician from Nagano. Ondekoza (organised in 1971 by Den Tagayasu on Sado Island) toured the US in 1975, and Kodō, formed from its members, debuted in Berlin in 1981.',
    ],
    build: {
      shell: 'The nagadō-daiko is an elongated drum shaped roughly like a wine barrel. Historically the shell was a single trunk of Japanese zelkova (keyaki), dried over years and carved; today shells may also be made of staves. Head diameter is measured in shaku (about 30 cm), from 1 to 6 shaku.',
      head: 'Cowhide (often Holstein cows of three or four years; bull skin is preferred for the largest drums) is stretched over each side and secured with tacks (byō); a chū-daiko needs about 300 per side. This is a byō-uchi-daiko, whose heads are nailed on.',
      tuning: 'The skin is tensioned during construction, by jacks, ropes or even workers hopping around the rim of a large head. After the tacks go in, the drum cannot be tuned.',
    },
    playing: {
      summary: 'Played with wooden sticks called bachi, usually on a stand. In ensembles the ōdaiko supplies a steady underlying pulse and counter-rhythm, often opening a performance, with chū-daiko carrying the main rhythm.',
      strokes: [
        { name: 'Bachi strike', how: 'Wooden bachi strike the cowhide head; the drum is large and the sound is deep.' },
        { name: 'Ji-uchi (base rhythm)', how: 'A steady underlying rhythm that supports soloists; usually on the shime-daiko in kumi-daiko, with the ōdaiko adding the deep pulse.' },
      ],
    },
    traditions: [
      'Kumi-daiko ensembles such as Kodō, Ondekoza and many groups across Japan and abroad.',
      'Festival (matsuri) drumming; sairei-nagadō have a cigar-shaped body. Some ō-daiko are too large to move and stay inside a temple or shrine.',
      'Shinto kagura accompaniment and Buddhist ceremony: miya-daiko with ornamental stands are used at Buddhist temples, and taiko drive the dances of the Bon festival.',
    ],
    respect: 'Temple and shrine ōdaiko are part of living religious practice; they are played by their own communities and rules.',
    sources: [
      { title: 'Taiko', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Taiko' },
      { title: 'Kodō (taiko group)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kod%C5%8D_(taiko_group)' },
    ],
  },
  {
    id: 'shime-daiko',
    name: 'Shime-daiko',
    aka: ['締め太鼓', 'tightened drum', 'tsukeshime-daiko', 'nagauta shime-daiko'],
    family: 'Rope- or bolt-tensioned two-headed drum, taiko (membranophone)',
    region: 'Japan (Noh, kabuki, festivals, kumi-daiko)',
    intro: 'Where the barrel taiko is tacked and fixed, the shime-daiko is cinched: ropes pull two heads tight over iron rings, and it rings out bright and high. I listen to it as a colleague from afar, and I love how crisp it is when it keeps time for a whole ensemble.',
    origins: [
      'Shime-daiko are one of three taiko categories by construction (byō-uchi-daiko, shime-daiko, tsuzumi). Classically the skin is placed over iron or steel rings and tightened with ropes; modern ones use bolts or turnbuckles.',
      'Within theatre, a small taiko set on a stand and played with two sticks sits at the left end of the Noh hayashi (the instrumental group), beside the ōtsuzumi, kotsuzumi and nōkan flute. Taiko in Noh perform highly specific rhythmic patterns; the Konparu school alone has 65 basic patterns plus 25 special ones. Kabuki hayashi uses nagauta shime-daiko as well. Sources list the nagauta shime-daiko (uta-daiko) among Noh instruments, so which exact drum is meant depends on the school and context.',
    ],
    build: {
      shell: 'Smaller, roughly snare-drum-sized wooden body with a head diameter of about 27 cm (10.6 in).',
      head: 'Skins are stretched over metal rings. Nagauta shime-daiko have thinner heads with a patch of deerskin in the centre, where strokes land. Heavier tsukeshime-daiko come in sizes 1 to 5 (namitsuke thinnest, gochō-gakke thickest).',
      tuning: 'Tensioned with hemp cords or rope (bolts or turnbuckles in contemporary versions), so the pitch can be adjusted before and during use.',
    },
    playing: {
      summary: 'Played with bachi. In kumi-daiko the shime-daiko sets and changes the tempo and often plays the ji-uchi base rhythm that holds the ensemble together; in Noh and kabuki it follows a fixed repertoire of patterns.',
      strokes: [
        { name: 'Centre strike', how: 'Strokes are generally restricted to the central deerskin patch on nagauta shime-daiko.' },
        { name: 'Ji-uchi', how: 'The steady base rhythm that holds a kumi-daiko ensemble together.' },
        { name: 'Namitsuke to gochō-gakke', how: 'Tsukeshime sizes 1 to 5, thickening in skin and tension for louder festival use.' },
      ],
    },
    traditions: [
      'Noh and kabuki hayashi, organised in lineages (iemoto system) such as the Tōsha, Mochizuki and Tanaka schools.',
      'Kumi-daiko groups, where shime-daiko mark tempo.',
      'Okinawan eisa dance, where shime-daiko is now the dominant drum style.',
    ],
    sources: [
      { title: 'Taiko', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Taiko' },
      { title: 'Hayashi (music)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hayashi_(music)' },
    ],
  },
  {
    id: 'bodhran',
    name: 'Bodhrán',
    aka: ['bodhráin (plural)', 'frame drum'],
    family: 'Frame drum (membranophone)',
    region: 'Ireland (also Scotland and the wider Celtic music world)',
    intro: 'The bodhrán is Ireland\'s frame drum, a goatskin stretched over a wooden hoop, struck with a little double-ended stick called a tipper. One hand stays behind the skin, bending the pitch. I admire how much conversation fits in that one hand.',
    origins: [
      'The name appears in a manuscript called the Rosa Anglica, written between the 15th and early 17th centuries. Its history before that is debated. Seán Ó Riada called it the native drum of the ancient Celts; others link it to the grain riddle or sieve, or say it grew from the tambourine in the 19th century. The drum in an 1833 painting by Daniel Maclise looks like a tambourine-style bodhrán.',
      'Dorothea Hast argues that until the mid-20th century the bodhrán was mainly a tray or tool and was used musically only in ritual contexts in rural areas. Its modern fame came from the Irish traditional music revival of the 1960s, through Seán Ó Riada and Ceoltóirí Chualann, then The Chieftains and later virtuosos such as Johnny "Ringo" McDonagh, Tommy Hayes and Christy Moore.',
    ],
    build: {
      shell: 'A wooden frame 25 to 65 cm (10 to 26 in) across, most 35 to 45 cm (14 to 18 in), with sides 9 to 20 cm deep. One or two removable crossbars may be inside.',
      head: 'A goatskin hide is tacked to one side; synthetic or other animal skins are sometimes used. The other side is open for the hand.',
      tuning: 'Pitch changes with humidity and temperature; some modern drums have hex-key tensioning. The playing hand inside also controls tension and tone.',
    },
    playing: {
      summary: 'Held vertically on the thigh and supported by the arm; the skin hand presses on the inside to vary pitch and timbre while the other hand uses a tipper. Styles are named after regions.',
      strokes: [
        { name: 'Kerry style', how: 'The most common style, using a two-headed tipper.' },
        { name: 'West Limerick style', how: 'Uses only one end of the tipper.' },
        { name: 'Top-end style', how: 'Developed in 1987 by Robbie Breathnach, Damien Quinn and Aidan "Scobie" McDonnell on a smaller, deeper drum with a thinner skin; the skin hand moves up and down to follow melody.' },
        { name: 'Rim shot', how: 'Striking the rim for contrast, introduced by Johnny McDonagh.' },
      ],
    },
    traditions: [
      'Irish traditional music sessions, where it accompanies reels, jigs and other dance tunes.',
      'The 1960s revival with Seán Ó Riada\'s Ceoltóirí Chualann and The Chieftains.',
      'Bands including Planxty, De Dannan and Moving Hearts; it was not featured at Fleadh Cheoil until 1973.',
    ],
    sources: [
      { title: 'Bodhrán', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bodhr%C3%A1n' },
    ],
  },
  {
    id: 'plateau-hand-drum',
    name: 'Northwest hand drum',
    aka: ['hand drum', 'frame drum'],
    family: 'Frame drum (membranophone)',
    region: 'Pacific Northwest Coast and Plateau Indigenous Nations (North America)',
    intro: 'Hand drums made of hide stretched across a cedar hoop sound warm and low. They belong to the Nations who make them, and many are personal. I come to them as a respectful student and listener, and what I can share is only what museums and community teachers have chosen to publish.',
    origins: [
      'Drums of hide stretched over a bent or hollowed wooden frame are found among many Indigenous Nations of the Pacific Northwest and the Plateau, and practices differ from Nation to Nation. Museum records show a range of makes: for example, the Burke Museum holds a drum by Stephen T. Noyes (Colville and Puyallup) made of deerskin and cedar.',
      'The National Park Service catalogues a larger drum, NEPE 304, given to L.V. McWhorter in 1933 by Peo Peo Tholekt; it is believed to be Salish or Flathead in origin, though Peo Peo Tholekt painted it. That drum is a two-headed dance drum, 83 cm across, with a cottonwood frame and rawhide heads, different from a small single-headed cedar-hoop hand drum.',
      'Further north, circumpolar peoples have their own frame drums. The Inuit qilaut is a handled frame drum covered with caribou skin and played with a stick called a qatuk.',
    ],
    build: {
      shell: 'A hoop of cedar. One Coast Salish teaching describes the cedar frame as strong and a sacred part of their way of life.',
      head: 'Deer, elk or moose hide. A Coast Salish teaching quoted by Royal Roads University says deer hide is most used in that region.',
      tuning: 'Details of how the hide is prepared and fastened differ by maker and Nation; this entry does not generalise them.',
    },
    playing: {
      summary: 'Held in one hand and struck with a beater, as the preset models it. Hand drums commonly accompany singing, but practices, songs and who may play them vary among Nations.',
      strokes: [
        { name: 'Steady beat', how: 'A steady pulse under the singing; one community teaching describes it as the heartbeat of Mother Earth.' },
        { name: 'Gentle striking', how: 'Drums are not struck hard; breaking the hide is considered disrespectful in one Coast Salish teaching.' },
      ],
    },
    traditions: [
      'Song and ceremony in Nations across the Northwest and Plateau, with community-specific songs and protocols.',
      'A Burke Museum record notes that small round skin drums were used in the 19th century mainly by Coast Salish religious dancers on the southern coast.',
    ],
    respect: 'Many drums are personal or sacred, and their songs and protocols belong to the Nation they come from; one Coast Salish teaching holds that makers pray for those who will use the drum.',
    sources: [
      { title: 'Identify Knowledge: Prepare to Tell the Story (Four Feathers Writing Guide)', publisher: 'Royal Roads University Library', url: 'https://libguides.royalroads.ca/fourfeathers/identify' },
      { title: 'Arts & Cultures Collections Database: Drum, 1988-117/4A', publisher: 'Burke Museum, University of Washington', url: 'https://www.burkemuseum.org/collections-and-research/heritage/artscultures/database/display.php?ID=94151' },
      { title: 'NEPE 304 Drum', publisher: 'National Park Service, Nez Perce National Historical Park', url: 'https://www.nps.gov/museum/exhibits/nepe/exb/dailylife/SpirtualWorld/NEPE304_Drum.html' },
      { title: 'Qilaut', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Qilaut' },
    ],
  },
  {
    id: 'darbuka',
    name: 'Darbuka',
    aka: ['goblet drum', 'tabla (Egypt)', 'doumbek', 'darbouka', 'tarabuka', 'derbake'],
    family: 'Goblet drum (single-headed membranophone)',
    region: 'North Africa, the Middle East and the Balkans',
    intro: 'This is the darbuka, the goblet drum of the Middle East. Tuck it under your arm and it speaks in three syllables: dum, tek, ka. Clay or copper, Cairo or Istanbul, I listen to it as a conversation between two hands.',
    origins: [
      'Goblet drums are old. Wikipedia notes they were used in Mesopotamian and Ancient Egyptian cultures and appear in Babylonia and Sumer from as early as about 1100 BCE. The name darbuka is said to come from rural Egyptian Arabic, from darb, "to strike."',
      'Today the drum goes by many names: darbuka, doumbek, tarabuka, derbake, and in Egypt simply tabla. Hector Berlioz called for a tarbuka in Les Troyens (1856-58), the first known Western classical score to feature one, and Egyptian-American composer Halim El-Dabh wrote Fantasia-Tahmeel for goblet drum and strings in the 1950s.',
    ],
    build: {
      shell: 'A goblet-shaped body open at the bottom. Museum examples are hollow clay, often painted. Many modern drums are metal, commonly aluminium or copper. Egyptian-style drums have rounded edges around the head; Turkish-style drums expose the edge of the head.',
      head: 'Traditionally a thin skin (goat or fish skin) tied or laced on with string around the wide opening. Plastic heads are common today on metal drums.',
      tuning: 'Not tuned to an exact note. Natural skins are tied on and the player warms or loosens the head; metal drums with synthetic heads are tightened on a hoop. Pitch is shaped by hand technique as much as by tension.',
    },
    playing: {
      summary: 'Played held under the non-dominant arm or sideways across the lap, with a light touch of fingertips and palm. Rolls and quick finger patterns are possible, and the Turkish exposed rim lets players do finger snaps, while its hard edge discourages the rapid rolls the rounded Egyptian rim allows. In Greece, Bulgaria, North Macedonia, Albania and Turkey, some players also use a thin stick (called a cubuk in Turkey) in one hand.',
      strokes: [
        { name: 'Dum (doom)', how: 'The deep bass: strike near the centre with the fingers and palm, then lift the hand so the note rings.' },
        { name: 'Tek (tak)', how: 'The higher sound: strike near the rim with the fingertips of the dominant hand.' },
        { name: 'Ka', how: 'The same high sound struck with the other, recessive hand.' },
        { name: 'Sak / pa', how: 'A closed, slap-like sound: the hand stays on the head so there is no sustain.' },
        { name: 'Roll and trill', how: 'A roll alternates tek and ka rapidly; a trill taps three fingers of one hand in quick succession on the rim.' },
      ],
    },
    traditions: [
      'Dumbek rhythms are built from these sounds. Wikipedia lists a "big six" of Middle Eastern rhythms: ayyoub, beledi (masmoudi saghir), chiftitelli, maqsoum, masmoudi and saidi.',
      'In Egypt the drum (tabla) accompanies dance and song; raqs sharqi, the classical Egyptian style of belly dance, grew up in the first half of the twentieth century.',
      'Egyptian percussionist Hossam Ramzy (1953-2019), who began on the Egyptian tabla as a child in Cairo, took the drum onto rock and pop records with Jimmy Page and Robert Plant. Other players Wikipedia lists include Mustapha Antari, Setrak Sarkissian, Said El Artist and Bilal Goregen.',
    ],
    sources: [
      { title: 'Goblet drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Goblet_drum' },
      { title: 'Dumbek rhythms', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dumbek_rhythms' },
      { title: 'Hossam Ramzy', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hossam_Ramzy' },
      { title: 'Darbuka (hollow clay goblet drum from Ohrid)', publisher: 'Duke University Musical Instrument Collection', url: 'https://sites.duke.edu/dumic/instruments/percussion/middle-east/darbuka' },
    ],
  },
  {
    id: 'tabla',
    name: 'Tabla',
    aka: ['dayan / dahina (right drum)', 'bayan / dagga (left drum)'],
    family: 'Pair of single-headed hand drums (membranophone)',
    region: 'North India and the wider subcontinent (Hindustani classical music)',
    intro: 'This is the tabla, and the right-hand drum, the dayan, is the one that sings. Hear that bell-like ring after a strike on the rim? That comes from the black syahi on the head. Zakir Hussain made me hear that a drum can be a whole language.',
    origins: [
      'The tabla has been the principal percussion instrument of Hindustani classical music since the 18th century. Its ultimate origin is contested: some scholars point to ancient Indian pushkara drums and temple carvings, others to a Mughal-era or Arabic connection (the word likely comes from Arabic tabl, "drum"). Clear pictorial evidence of the drum appears only from about 1745, and its shape kept developing until the early 1800s.',
      'Popular stories say Amir Khusraw cut a pakhavaj or other drum in half to make the tabla, but scholars quoted by Wikipedia say that legend cannot be given credence. The Natyashastra does describe syahi-like paste patches on older drums.',
    ],
    build: {
      shell: 'The dayan is a conical hollowed shell, mostly teak or rosewood (sheesham is a rosewood), about 15 cm across and 25 cm high. The bayan is bigger and kettle-shaped: brass is most common, copper is thought best, steel and aluminium are cheaper, and clay or wood are found in some regions.',
      head: 'Goat-type skin with a central syahi (ink): layered starch paste mixed with black powder, which gives the drum harmonic overtones and a bell-like sound. Making the syahi is a highly refined skill. Each drum sits on a ring-shaped cloth pad (chutta or guddi).',
      tuning: 'Straps, hoops and cylindrical wooden blocks (gatta) set the tension; blocks are moved up or down and fine-tuned by tapping with a small hammer. The dayan is tuned to the tonic, dominant or subdominant. On the bayan, heel pressure bends the pitch while playing.',
    },
    playing: {
      summary: 'Played sitting cross-legged, dayan with the dominant hand, bayan with the other, using fingertips and palms. The whole repertoire is spoken as bols (syllables) that are also used to teach it, passed from guru to student. Teental, a 16-beat cycle, is one of the most popular talas.',
      strokes: [
        { name: 'Na', how: 'On the dayan, strike the edge of the syahi with the last two fingers of the right hand.' },
        { name: 'Tin', how: 'Lay the last two fingers lightly and strike on the border between syahi and the outer area for a resonant tone.' },
        { name: 'Ta (Ra)', how: 'Strike sharply with the index finger on the rim while the ring finger lightly damps the edge of the syahi.' },
        { name: 'Ge (Ghe)', how: 'On the bayan, wrist down, fingers arched over the syahi; the middle and ring fingers strike the outer area for a resonant bass.' },
        { name: 'Ke (Ka)', how: 'On the bayan, a flat palm and fingers strike without ringing.' },
        { name: 'Dha', how: 'Na on the dayan together with Ge on the bayan.' },
      ],
    },
    traditions: [
      'Solo and accompaniment in Hindustani music, for kathak dance, bhajan and kirtan devotional singing, and qawwali.',
      'Playing styles are kept in gharanas (lineages): Delhi, Lucknow, Ajrada, Farukhabad, Benares and Punjab. Delhi is regarded as the oldest. The Varanasi (Benares) style plays the open Te stroke with three fingers rather than one.',
      'Ustad Zakir Hussain (1951-2024), son of Alla Rakha, took the tabla worldwide and won four Grammy Awards.',
    ],
    sources: [
      { title: 'Tabla', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tabla' },
      { title: 'Zakir Hussain (musician)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Zakir_Hussain_(musician)' },
    ],
  },
  {
    id: 'mridangam',
    name: 'Mridangam',
    aka: ['mrdangam', 'tannumai (old Tamil name)', 'deva vaadyam'],
    family: 'Double-headed barrel drum (membranophone)',
    region: 'South India (Tamil Nadu and Carnatic music)',
    intro: 'This is the mridangam, the heartbeat of a Carnatic concert. One barrel, two heads, and a pitch that you set by tapping the straps with a stone. When the mridangist plays a thani avartanam, it is pure rhythmic mathematics, but it sings.',
    origins: [
      'The name joins Sanskrit words for clay (mrd) and limb (anga), because early versions were of hardened clay; today the body is jackfruit wood. It is called a divine instrument (deva vaadyam) and appears in Hindu sculpture and mythology with Ganesha and Nandi.',
      'In Tamil culture the drum appears in Sangam literature under the name tannumai, and the epic Silappadikaram describes it in detail. It is widely believed, though not proven, that the tabla was derived by splitting a mridangam.',
    ],
    build: {
      shell: 'A hollowed piece of jackfruit wood about an inch thick.',
      head: 'Goat, cow or buffalo skin laced across both mouths with leather straps under high tension. The two heads differ in size: the larger, bass head is the thoppi (eda bhaaga) and the smaller is the valanthalai (bala bhaaga). The valanthalai wears a permanent black disk (saatham or karanai) made of rice flour, ferric oxide and starch, giving the metallic ring.',
      tuning: 'Before a concert the bass head is moistened and a spot of wet semolina (rava) paste is put in its centre to lower the pitch and deepen the bass. Tuning is done by tapping the strap edge of the small head with a stone and sometimes a wooden peg; modern drums may use nuts and bolts. The result is pitched to the singer, often with a tambura.',
    },
    playing: {
      summary: 'Played lying across the lap with both hands, the right on the small head and the left on the bass head. It is the main rhythmic accompaniment (pakkavadyam) in Carnatic music, keeping the tala and answering the soloist, and it also plays solo.',
      strokes: [
        { name: 'Sollukattu', how: 'The spoken rhythmic syllables of Carnatic percussion.' },
        { name: 'Valanthalai strokes', how: 'High, metallic tones on the right head, shaped by the black paste.' },
        { name: 'Thoppi strokes', how: 'Deep, rounded bass tones from the left head, made resonant by the damp semolina paste.' },
        { name: 'Thani avartanam', how: 'The percussion solo near the end of a concert, traditionally led by the mridangam, then kanjira and ghatam, exchanging patterns until all play together before the main artist returns.' },
      ],
    },
    traditions: [
      'Carnatic concerts across southern India, and now around the world, with mridangam as the principal accompaniment.',
      'A modified version, the pakhawaj, is the main drum in dhrupad. In Yakshagana the related maddale is used.',
      'Wikipedia lists many leading modern players, including Umayalpuram K. Sivaraman, T. K. Murthy, Trichy Sankaran and Karaikudi Mani.',
    ],
    respect: 'It is called a divine instrument in tradition and is shown with deities such as Ganesha and Nandi, so it is treated with care.',
    sources: [
      { title: 'Mridangam', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mridangam' },
      { title: 'Tabla', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tabla' },
    ],
  },
  {
    id: 'kanjira',
    name: 'Kanjira',
    aka: ['khanjira', 'ganjira', 'khanjiri', 'khaijadi (Nepal)'],
    family: 'Frame drum with jingles (tambourine family)',
    region: 'South India (Carnatic music); related frame drums in Nepal',
    intro: 'This is the kanjira, a little frame drum no bigger than your hand-span, and one of the hardest to play well. I press the rim to bend its pitch and splash a bit of water on the head to find the bass. A good kanjira player is a mathematician.',
    origins: [
      'As a folk and bhajan instrument it has been used in the subcontinent for many centuries. Its place in Carnatic music and its modern form are credited to Manpoondia Pillai, a temple lantern-bearer in the 1880s who sought to study drumming. He gave it a single pair of jingles and brought it to the concert stage.',
      'The name may come from the Tamil word kanchili, linked to a Sanskrit word for "skin" or lizard skin.',
    ],
    build: {
      shell: 'A circular jackfruit-wood frame, 7 to 9 inches across and 2 to 4 inches deep, with a single slit holding three to four small metal discs (often old coins) that jingle.',
      head: 'Traditionally Bengal monitor lizard skin on one side with the other side open. Wikipedia notes lizard skin is restricted by species-protection rules and that well-known players say goat skin is a good alternative that becomes more flexible as it is played.',
      tuning: 'Not tuned to a fixed pitch. The head is dampened with water on the inside to loosen it for a deeper sound; too moist and the tone goes dead, so players often keep two or more kanjiras and swap them.',
    },
    playing: {
      summary: 'Held in the left hand and played with the right palm and fingers, supporting the mridangam in concerts. It is considered difficult because of the complexity of the rhythms it must play.',
      strokes: [
        { name: 'Open strokes', how: 'Right-hand fingers on the head for the high ringing sound.' },
        { name: 'Pitch bend', how: 'The fingertips of the left hand press near the outer rim to bend the pitch, producing tabla-like glissandi.' },
        { name: 'Water for bass', how: 'Moisten the inside of the head to relax tension and get a good bass tone; repeat during a concert as needed.' },
      ],
    },
    traditions: [
      'Carnatic concerts as a supporting drum, joining the mridangam and ghatam in the thani avartanam.',
      'Notable players listed by Wikipedia include G. Harishankar, V. Selvaganesh and Bangalore Amrit.',
    ],
    sources: [
      { title: 'Kanjira', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kanjira' },
      { title: 'Mridangam', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mridangam' },
    ],
  },
  {
    id: 'daf',
    name: 'Daf',
    aka: ['dap', 'dayere', 'def (Kurdish)', 'riq (related)'],
    family: 'Frame drum with jingle rings (membranophone)',
    region: 'Iran, Kurdistan, Central Asia, Azerbaijan, Turkey and beyond',
    intro: 'This is the daf, a big frame drum with metal rings inside the frame. Strike the centre for a deep boom and the rings shimmer behind it. In Sufi zikr it can carry a room into trance, and I listen to it as a student, with respect.',
    origins: [
      'The name comes from Middle Persian dap. Images of daf-like drums are found in ancient art, such as the Behistun inscription (6th-5th century BCE) and square frame drums at Taq-e Bostan. Under the Sassanids it accompanied Nowruz celebrations.',
      'Moors carried it to Spain, and the Ottomans reintroduced it to Europe in the 17th century. In Iran, Sufis preserved the art in the 20th century, and Bijan Kamkar brought it into traditional Iranian music in the 1970s.',
    ],
    build: {
      shell: 'A round wooden frame about 45-50 cm (18-20 in) wide and 5-7 cm deep; the wood may be softened in water and bent around a hot cylinder, then glued closed. Metal rings or plates hang on hooks in holes in the frame, or run in tiers around the inside.',
      head: 'Traditionally goat or fish skin, glued or nailed on; synthetic heads are used in modern drums. Pins behind the frame keep the skin taut.',
      tuning: 'Tuned by tension on the skin, often warmed or adjusted with pins. Rings add a bright jangle but are not tuned.',
    },
    playing: {
      summary: 'Held upright. The left hand holds the drum and strikes the edges, the right hand strikes the centre. Right-hand fingers are hooked over their neighbours and released like a finger snap to produce sharp, rapid strokes.',
      strokes: [
        { name: 'Centre stroke', how: 'Right hand on the middle of the head for a low, deep boom.' },
        { name: 'Edge stroke', how: 'Left hand near the rim for a sharper, higher sound.' },
        { name: 'Snap stroke', how: 'Right-hand fingers fastened and released in a finger-snap motion for loud, rapid strokes.' },
        { name: 'Ring shimmer', how: 'Rings on the frame vibrate against each hit and ring on after it; a shake is also possible.' },
      ],
    },
    traditions: [
      'Sufi zikr in Iran and Kurdistan, where daf players are an important part of the ritual. The Sanandaj masters Karim Safvati and Mirza Agha Ghosi are named in an article by Peyman Nasehpour.',
      'Classical and folk music in Iran, Central Asia and Azerbaijan; in Iran it is also taught as a concert instrument.',
      'In conservative Sunni communities it is, per Wikipedia, the one instrument permitted for women at celebrations.',
    ],
    respect: 'In Sufi zikr the daf serves a devotional purpose: it is part of a ritual, not a performance.',
    sources: [
      { title: 'Daf', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Daf' },
      { title: 'On Persian Daf, the Spiritual Frame Drum and Sufi Music', publisher: 'Peyman Nasehpour (Tombak Network)', url: 'https://tombaknetwork.z19.web.core.windows.net//articles/DafTheSpiritualFrameDrum.htm' },
      { title: 'Daf', publisher: 'Organology', url: 'https://organology.net/instrument/daf' },
    ],
  },
  {
    id: 'bendir',
    name: 'Bendir',
    aka: ['bandir', 'bindir'],
    family: 'Frame drum with snare (membranophone)',
    region: 'North Africa and Southwest Asia (Amazigh and Arab traditions, Sufi ceremonies)',
    intro: 'This is the bendir, a wooden-framed drum from North Africa. A gut snare runs across the inside of the head, so every touch gets a buzz. I play it as a guest, with respect to Amazigh and Sufi musicians.',
    origins: [
      'The bendir is a traditional instrument played throughout North Africa and in Sufi ceremonies. Wikipedia says it was played in ancient Egypt and Mesopotamia as well. In Turkish, bendir means "a big hand frame drum."',
    ],
    build: {
      shell: 'A wooden frame, played upright.',
      head: 'Animal skin stretched over the frame, with a snare (usually gut) stretched across the head giving a buzzing quality. Unlike the Egyptian tar, which has no snare, the bendir keeps this snare.',
      tuning: 'Set by the tension of the skin.',
    },
    playing: {
      summary: 'Held vertically by looping the thumb of the non-dominant hand through a hole in the frame; the other hand strikes the head with fingers or palm.',
      strokes: [
        { name: 'Palm strokes', how: 'Struck with the palm for a deeper, buzzing tone.' },
        { name: 'Finger strokes', how: 'Struck with fingers near the rim for a lighter, snappier sound.' },
        { name: 'Snare buzz', how: 'Vibrating gut strings across the head add a continuous buzz to every stroke.' },
      ],
    },
    traditions: [
      'Sufi ceremonies across North Africa.',
      'Amazigh and Arab folk and ritual music.',
    ],
    sources: [
      { title: 'Bendir', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bendir' },
    ],
  },
  {
    id: 'tar',
    name: 'Tar (frame drum)',
    aka: ['tar'],
    family: 'Single-headed frame drum (membranophone)',
    region: 'Egypt, the Middle East and North Africa',
    intro: 'This is the tar, a frame drum, not the Persian lute that shares its name. You hold it in one hand and strike the skin with the other. It is plain and powerful, and lovely in Nubian and Gulf traditions.',
    origins: [
      'The tar is described as an ancient, single-headed frame drum commonly played across the Middle East and North Africa. The head is struck with one hand.',
      'Disambiguation: the tar (Persian: "string") is also an Iranian long-necked lute, entirely unrelated. The word tar for the drum is Arabic.',
    ],
    build: {
      shell: 'A wooden frame.',
      head: 'Traditionally animal skin, such as goat.',
      tuning: 'Skin tension is the main control; the Egyptian tar has no snare on the back, which separates it from the bendir. Metal jingles are optional on some regional frame drums.',
    },
    playing: {
      summary: 'Held in one hand, struck with the other.',
      strokes: [
        { name: 'Centre', how: 'Strike the middle of the skin for a deep tone.' },
        { name: 'Edge', how: 'Strike near the frame for a higher tone.' },
      ],
    },
    traditions: [
      'Folk and dance music in the Arab world, including Saudi folk music.',
    ],
    sources: [
      { title: 'Tar (drum)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tar_(drum)' },
      { title: 'Tar (lute)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tar_(lute)' },
      { title: 'Bendir', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bendir' },
    ],
  },
  {
    id: 'frame-drum',
    name: 'Frame drum',
    aka: ['hand drum', 'tamburello (Italian)', 'tof / timbrel (historical)'],
    family: 'Frame drum (single-headed membranophone)',
    region: 'Worldwide; ancient Near East, Egypt, Mediterranean',
    intro: 'This is the frame drum, a skin on a shallow wooden hoop and one of the oldest drums we have. My hands whisper across the head or strike it hard. It has been in people\'s hands for thousands of years.',
    origins: [
      'A frame drum has a head wider than its depth, and it is one of the most ancient musical instruments. The tambourine form appears in writings as early as about 1700 BCE and was used in Ancient Egypt and the Ancient Near East before spreading to Greece. The Hebrews called the Egyptian type a tof.',
      'Greek vase paintings show women with tambourines, and a Roman mosaic from Tunisia shows a maenad with a tympanum. The coloured woven stripes on one such Greek drum still appear on the tamburello of southern Italy.',
      'Wikipedia notes that in many cultures larger frame drums are played mainly by men in spiritual ceremonies, while medium-size drums are played mainly by women.',
    ],
    build: {
      shell: 'A round wooden frame, traditionally bent rosewood, oak or ash, scarf-jointed; plywood and man-made materials are also used. Metal rings or jingles may be attached.',
      head: 'Usually rawhide, though man-made materials may also be used. On many drums the head is tacked in place; some have mechanical tuning.',
      tuning: 'Many are tacked and tuned by humidity and warmth; some have mechanical tuning.',
    },
    playing: {
      summary: 'Held in one hand and played with the fingers and palm of the other, or with a beater on some traditions. Studio players also rub or brush the head with the palm or fingertips for a soft, textural sound.',
      strokes: [
        { name: 'Centre stroke', how: 'Strike near the middle for a deep tone.' },
        { name: 'Edge stroke', how: 'Fingers near the rim give a higher, crisper note.' },
        { name: 'Rubbing or brushing', how: 'Rub the head with the palm or fingertips for a soft, textural sound.' },
      ],
    },
    traditions: [
      'Ancient Egyptian and Near Eastern ritual and court music.',
      'Greek and Roman tympanon, associated with women in religious processions.',
      'Southern Italian folk music with the tamburello.',
    ],
    sources: [
      { title: 'Frame drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Frame_drum' },
      { title: 'Tambourine', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tambourine' },
    ],
  },
];

export const DRUMS = Object.fromEntries(ENTRIES.map((e) => [e.id, { ...e, photo: PHOTOS[e.id] }])) as Record<DrumId, DrumKnowledge>;

export function drumForPreset(presetId?: string): DrumKnowledge | undefined {
  const id = presetId ? SOMA_PRESET_DRUM[presetId] : undefined;
  return id ? DRUMS[id] : undefined;
}
