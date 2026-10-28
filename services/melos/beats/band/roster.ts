// Chora Session Band — the players. Thirteen master musicians, each with three personalities that
// surface while they play (the Deacon is not the same drummer as Clockwork), the sound they sit
// down at in Chora, and what they know: their instrument inside out, its history and its great
// players, technique, theory, and Chora/Plajah itself — so each of them can teach as well as play.
//
// The characters are fictional; the history they tell is real. Pure data.

import type { InstrumentType, OrchestralArticulation } from '../grooveDoc';
import { SCIENCE } from './science';

export type BandRole =
  | 'drums' | 'percussion' | 'bass' | 'guitar' | 'piano' | 'cello' | 'violin'
  | 'trumpet' | 'sax' | 'woodwinds' | 'synth' | 'organ' | 'orchestra';

export type Ornament = 'ghost' | 'grace' | 'bend' | 'scoop' | 'trill' | 'vibrato' | 'slide' | 'doubleStop' | 'roll' | 'shout' | 'fall' | 'growl' | 'gliss';

export interface PersonaTraits {
  /** Where they sit against the grid, in beats: + behind (laid back), − ahead (pushing). */
  pocket: number;
  /** 0 loose … 1 machine-tight. */
  tightness: number;
  /** −1 sparse … 1 busy. */
  density: number;
  /** 0 even … 1 wide dynamic range. */
  dynamics: number;
  /** −1 … 1 bias on the band's energy. */
  energy: number;
  /** 0 plain … 1 adventurous (syncopation, extensions, chromatic approaches). */
  complexity: number;
  /** 0 … 1 appetite for fills / pickups. */
  fills: number;
  /** Semitone offset from the instrument's home register. */
  register: number;
  /** Extra swing on top of the genre's. */
  swing: number;
  /** 0 … 1 how much air they leave between phrases. */
  space: number;
  ornaments: Ornament[];
  articulation?: OrchestralArticulation;
}

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  /** How this side of them plays the part (read by the role's performer). */
  mode: string;
  traits: PersonaTraits;
  /** Where this side tends to come out. */
  affinity: { genres?: string[]; energy?: [number, number] };
  lines: { enter: string[]; ack: string[]; groove: string[] };
}

export interface KnowledgeEntry {
  topic: 'history' | 'instrument' | 'science' | 'technique' | 'theory' | 'genre' | 'chora';
  keys: string[];
  text: string;
}

export interface LessonStep {
  say: string;
  /** A direction the band plays to demonstrate the point (fed to the direction parser). */
  direct?: string;
}
export interface Lesson { id: string; title: string; summary: string; steps: LessonStep[] }

export type SeatSound =
  | { kind: 'kit' }
  | { kind: 'instrument'; type: InstrumentType; preset: string; byGenre?: Record<string, string>; standIn?: string };

export interface BandPlayer {
  id: string;
  name: string;
  nickname?: string;
  role: BandRole;
  instrument: string;
  from: string;
  bio: string;
  influences: string[];
  genres: string[];
  color: string;
  seat: SeatSound;
  /** Comfortable MIDI range [lo, hi] (drums: unused). */
  range: [number, number];
  personas: [Persona, Persona, Persona];
  knowledge: KnowledgeEntry[];
  lessons: Lesson[];
}

const t = (o: Partial<PersonaTraits>): PersonaTraits => ({
  pocket: 0, tightness: 0.6, density: 0, dynamics: 0.5, energy: 0, complexity: 0.4, fills: 0.4,
  register: 0, swing: 0, space: 0.3, ornaments: [], ...o,
});

export const BAND: BandPlayer[] = [
  {
    id: 'marcus', name: 'Marcus Bell', nickname: 'Deacon', role: 'drums', instrument: 'Drums', from: 'Memphis, Tennessee',
    bio: 'Grew up behind the kit at a Memphis church, cut his teeth in studio sessions and spent a decade on arena tours. Plays the room before he plays the song.',
    influences: ['Baby Dodds', 'Max Roach', 'Clyde Stubblefield', 'Al Jackson Jr.', 'John Bonham', 'Questlove'],
    genres: ['gospel', 'funk', 'soul', 'rock', 'hiphop', 'jazz'], color: '#FF8C00', seat: { kind: 'kit' }, range: [36, 60],
    personas: [
      { id: 'deacon', name: 'The Deacon', tagline: 'Church chops, ghost notes, shouts on the turnaround', mode: 'chops',
        traits: t({ pocket: 0.012, tightness: 0.55, density: 0.5, dynamics: 0.8, energy: 0.2, complexity: 0.75, fills: 0.85, swing: 0.1, ornaments: ['ghost', 'roll', 'shout'] }),
        affinity: { genres: ['gospel', 'funk', 'soul', 'neosoul', 'afrobeat'], energy: [0.5, 1] },
        lines: { enter: ['Let the church say amen.', 'Alright, I got the pocket — y\'all just ride it.'], ack: ['Say less.', 'I hear you, producer.', 'Done.'], groove: ['Feel that two and four?', 'Ghost notes is where the conversation is.'] } },
      { id: 'clockwork', name: 'Clockwork', tagline: 'Session-tight, tasteful, serves the song', mode: 'tight',
        traits: t({ pocket: 0, tightness: 0.9, density: -0.2, dynamics: 0.35, complexity: 0.25, fills: 0.2, ornaments: ['ghost'] }),
        affinity: { genres: ['pop', 'house', 'country', 'bossa', 'ballad', 'hiphop', 'reggae'], energy: [0, 0.65] },
        lines: { enter: ['Click\'s in my head. Rolling.', 'Keeping it simple so the song can talk.'], ack: ['Copy.', 'You got it.', 'Locked.'], groove: ['Less is more right here.', 'Holding it steady.'] } },
      { id: 'thunder', name: 'Thunder', tagline: 'Arena rock: big crashes, tom runs, heavy foot', mode: 'big',
        traits: t({ pocket: 0.008, tightness: 0.65, density: 0.25, dynamics: 0.9, energy: 0.35, complexity: 0.45, fills: 0.7, ornaments: ['roll'] }),
        affinity: { genres: ['rock', 'metal', 'cinematic'], energy: [0.65, 1] },
        lines: { enter: ['Stadium lights, baby.', 'Turn me up.'], ack: ['Loud and clear.', 'Hitting it.'], groove: ['Here comes the crash!', 'Big room, big drums.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'origin', 'invent', 'new orleans', 'trap set', 'kit'], text: 'The drum kit is an American invention. Around 1900–1920 in New Orleans, "double drumming" let one player work a bass drum pedal while playing snare — the "trap set" (short for contraption). Baby Dodds, who recorded with King Oliver and Louis Armstrong in the 1920s, is the drummer most people point to as its first great voice.' },
      { topic: 'history', keys: ['swing', 'krupa', 'ride', 'bebop', 'max roach', 'kenny clarke'], text: 'Gene Krupa\'s tom feature on Benny Goodman\'s "Sing, Sing, Sing" (1937) made the drummer a star. Bebop then moved the time onto the ride cymbal — Kenny Clarke and Max Roach kept the pulse there and used the bass drum and snare for "dropping bombs" and conversation.' },
      { topic: 'history', keys: ['funky drummer', 'stubblefield', 'break', 'sample', 'amen', 'jungle', 'hip hop'], text: 'Clyde Stubblefield\'s break on James Brown\'s "Funky Drummer" (1970) is one of the most sampled recordings ever, and Gregory Coleman\'s break on The Winstons\' "Amen, Brother" (1969) — the "Amen break" — became the backbone of jungle and drum & bass. Hip-hop was built on drummers\' breaks.' },
      { topic: 'history', keys: ['808', 'drum machine', 'roland', 'linn'], text: 'The Roland TR-808 (1980) flopped as a "realistic" drum machine and then became the sound of hip-hop, electro and trap — its long, tuned kick doubles as a bass. The LinnDrum and the 909 did the same for pop and house.' },
      { topic: 'instrument', keys: ['parts', 'snare', 'hi-hat', 'hat', 'cymbal', 'crash', 'tom', 'kick'], text: 'Kick (bass drum) on the floor pedal; snare with metal wires (the snares) stretched under the bottom head for its crack; hi-hat — two cymbals on a foot stand, closed for tight ticks, open for a wash; ride for steady time, crash for accents; toms for melodic fills.' },
      { topic: 'technique', keys: ['ghost', 'ghost notes', 'dynamics', 'feel'], text: 'Ghost notes are the barely-there snare strokes between the backbeats. They don\'t mark the time — they fill the air between it, and they\'re why funk and gospel drumming breathes.' },
      { topic: 'technique', keys: ['rudiment', 'paradiddle', 'roll', 'flam', 'sticking'], text: 'Rudiments are the drummer\'s scales — the Percussive Arts Society lists 40, from the single-stroke roll to the paradiddle (R L R R  L R L L) and the flam. Fills are rudiments moved around the kit.' },
      { topic: 'theory', keys: ['backbeat', 'two and four', '2 and 4'], text: 'The backbeat is the snare on beats 2 and 4. It came out of rhythm & blues and gospel hand-claps and is the spine of rock, soul and pop.' },
      { topic: 'chora', keys: ['chora', 'meka', 'pads', 'kit', 'print', 'pattern', 'glass'], text: 'In Chora I play your MEKA kit — I find the kick, snare, hats, clap and rim pads by name. When you print my take it lands on a drum track as MEKA patterns, with my timing kept in each step\'s micro offset. Open the pattern in Glass to reshape velocities in the graph, or swap my pads for your own samples and I\'ll play those.' },
    ],
    lessons: [
      { id: 'backbeat', title: 'The backbeat', summary: 'Why 2 and 4 make people move.', steps: [
        { say: 'First, just kick on 1 and 3 — feel how it marches?', direct: 'everybody out except drums, simpler' },
        { say: 'Now the snare comes in on 2 and 4. That\'s the backbeat — that\'s where the hand-claps were in church.', direct: 'drums back to normal' },
        { say: 'Now listen to the ghost notes in between. Same groove, more conversation.', direct: 'Marcus, deacon, busier' },
      ] },
      { id: 'fills', title: 'Fills that lead somewhere', summary: 'A fill is a pickup into the next section, not a solo.', steps: [
        { say: 'A fill tells the band "something new is coming". Listen to the end of the phrase.', direct: 'drums, fill' },
        { say: 'Thunder plays it big, with a crash on the one after.', direct: 'Marcus, thunder, fill' },
      ] },
    ],
  },
  {
    id: 'amara', name: 'Amara Okafor', role: 'percussion', instrument: 'Percussion', from: 'Lagos, Nigeria · Havana, Cuba',
    bio: 'Learned talking drum from a grandmother in Lagos, studied batá and rumba for years in Havana. Hears every rhythm as a conversation between at least three voices.',
    influences: ['Chano Pozo', 'Mongo Santamaría', 'Tito Puente', 'Babatunde Olatunji', 'Zakir Hussain', 'Giovanni Hidalgo'],
    genres: ['salsa', 'afrobeat', 'bossa', 'cinematic', 'reggae', 'funk'], color: '#E86A33',
    seat: { kind: 'instrument', type: 'soma', preset: 'conga-habana-open', byGenre: { afrobeat: 'djembe-lenke-master', cinematic: 'nagado-daiko-odaiko', classical: 'timpani-29-dresden', reggae: 'bongo-hembra-open', bossa: 'bongo-hembra-open' } },
    range: [48, 72],
    personas: [
      { id: 'griot', name: 'The Griot', tagline: 'West African polyrhythm — three against four', mode: 'poly',
        traits: t({ pocket: 0.006, tightness: 0.55, density: 0.35, dynamics: 0.75, complexity: 0.8, fills: 0.6, ornaments: ['roll'] }),
        affinity: { genres: ['afrobeat', 'cinematic', 'funk'], energy: [0.45, 1] },
        lines: { enter: ['The drum speaks first.', 'Listen — three voices, one heartbeat.'], ack: ['Yes.', 'I will answer that.'], groove: ['Feel the three inside the four?', 'The bell holds us together.'] } },
      { id: 'havana', name: 'Havana Nights', tagline: 'Clave, tumbao and the slap on two', mode: 'tumbao',
        traits: t({ pocket: 0, tightness: 0.7, density: 0.2, dynamics: 0.6, complexity: 0.55, fills: 0.45, ornaments: ['slide'] }),
        affinity: { genres: ['salsa', 'bossa', 'soul', 'pop'], energy: [0.3, 1] },
        lines: { enter: ['¡Dale! The clave leads.', 'Tumbao on the congas, coming in.'], ack: ['¡Claro!', 'Sí, producer.'], groove: ['Everything sits on the clave.', 'Hear the slap on two?'] } },
      { id: 'shaker', name: 'Shaker Ghost', tagline: 'Minimal textures you feel more than hear', mode: 'texture',
        traits: t({ pocket: 0.01, tightness: 0.75, density: -0.4, dynamics: 0.3, complexity: 0.3, fills: 0.15, space: 0.6 }),
        affinity: { genres: ['pop', 'ballad', 'neosoul', 'house', 'hiphop'], energy: [0, 0.55] },
        lines: { enter: ['Just a little air underneath.', 'I\'ll stay out of the way.'], ack: ['Mm-hm.', 'Softly, then.'], groove: ['Felt, not heard.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['clave', 'son', 'cuba', 'afro-cuban', 'history'], text: 'Clave is the key pattern of Afro-Cuban music — five strokes over two bars, "3-2" or "2-3". Its roots are West African bell patterns carried to Cuba by enslaved Yoruba, Kongo and other peoples; in Cuba they became rumba, son and eventually salsa.' },
      { topic: 'history', keys: ['chano pozo', 'manteca', 'dizzy', 'latin jazz', 'cubop'], text: 'When Dizzy Gillespie hired the Cuban conguero Chano Pozo in 1947, they wrote "Manteca" together and Afro-Cuban jazz was born. Mongo Santamaría and Tito Puente carried it into the mainstream in the 1950s.' },
      { topic: 'history', keys: ['talking drum', 'dundun', 'yoruba', 'gangan'], text: 'The Yoruba dùndún (talking drum) is squeezed under the arm to bend its pitch. Yoruba is a tonal language, so a skilled drummer can literally speak phrases — praise names, proverbs — on the drum.' },
      { topic: 'instrument', keys: ['conga', 'tumbadora', 'quinto', 'tumba', 'open tone', 'slap'], text: 'Congas come in three main sizes: quinto (high, the soloist), conga/segundo (middle) and tumba (low). The core strokes are the open tone, the slap, the muffled tone, and the heel-toe on the drum\'s centre.' },
      { topic: 'instrument', keys: ['djembe', 'mande', 'mali', 'guinea'], text: 'The djembe is a goblet drum from the Mande peoples of Mali and Guinea — bass in the centre, tone near the edge, slap at the edge with relaxed fingers. Traditionally it plays with the dunun bass drums and a bell.' },
      { topic: 'instrument', keys: ['tabla', 'india', 'bol', 'zakir'], text: 'Tabla is a pair: the dayan (right, tuned wooden drum) and bayan (left, metal bass drum whose pitch the heel of the hand bends). Every stroke has a spoken syllable (bol) — na, tin, dha, ge — and players recite before they play.' },
      { topic: 'theory', keys: ['polyrhythm', 'three against four', 'cross rhythm', 'hemiola'], text: 'A polyrhythm is two pulses at once, like three evenly spaced notes against four. West African music layers them — the bell, the drums and the dancers each hold a different one, and the groove lives where they meet.' },
      { topic: 'chora', keys: ['chora', 'soma', 'conga', 'physical model'], text: 'In Chora I sit at SOMA, the physical-modelling percussion engine: Havana congas, Lenke djembe, Yoruba talking drum, batá, taiko, timpani, frame drums. Lower keys play the bigger drum and open tones, higher keys the slaps — velocity is how hard my hand lands.' },
    ],
    lessons: [
      { id: 'clave', title: 'Clave: the key', summary: 'The five-stroke pattern everything in salsa sits on.', steps: [
        { say: 'This is son clave, 3-2: three strokes in the first bar, two in the second. Everything else lines up with it.', direct: 'make it salsa, everybody out except percussion and drums' },
        { say: 'Now the bass and piano come in — hear how the bass anticipates, landing on the "and" of two and on four? That\'s the tumbao.', direct: 'bass and piano come in' },
      ] },
    ],
  },
  {
    id: 'dwayne', name: 'Dwayne Carter', nickname: 'Low End', role: 'bass', instrument: 'Bass', from: 'Detroit, Michigan',
    bio: 'Played electric bass in his uncle\'s Detroit soul band at twelve, upright in jazz clubs at twenty. Believes the bass is the bridge between the drums and the harmony — and that the best note is often the one you leave out.',
    influences: ['James Jamerson', 'Ron Carter', 'Jimmy Blanton', 'Larry Graham', 'Jaco Pastorius', 'Bootsy Collins', 'Pino Palladino'],
    genres: ['soul', 'funk', 'jazz', 'gospel', 'hiphop', 'reggae'], color: '#FF4B1C',
    seat: { kind: 'instrument', type: 'bajo', preset: 'fingered-electric', byGenre: { jazz: 'upright-jazz', blues: 'upright-jazz', bossa: 'upright-jazz', trap: '808-cathedral', hiphop: 'memphis-sine', house: 'deep-round', rock: 'picked-p-bass', metal: 'picked-p-bass', classical: 'bowed-contrabass', cinematic: 'bowed-contrabass', neosoul: 'fretless-glass' } },
    range: [28, 55],
    personas: [
      { id: 'sunday', name: 'Sunday Morning', tagline: 'Melodic, walk-ups into every change', mode: 'melodic',
        traits: t({ pocket: 0.01, tightness: 0.6, density: 0.1, dynamics: 0.6, complexity: 0.55, fills: 0.6, ornaments: ['slide', 'grace'] }),
        affinity: { genres: ['gospel', 'soul', 'neosoul', 'ballad', 'country'], energy: [0.2, 0.8] },
        lines: { enter: ['Walking you home.', 'Let me sing a little down here.'], ack: ['Yes sir.', 'I got you.'], groove: ['Walk-up into the four chord.', 'Bass sings too.'] } },
      { id: 'walker', name: 'The Walker', tagline: 'Quarter-note walking lines, chromatic approaches', mode: 'walking',
        traits: t({ pocket: -0.004, tightness: 0.7, density: 0, dynamics: 0.4, complexity: 0.7, fills: 0.3, ornaments: ['grace'] }),
        affinity: { genres: ['jazz', 'blues', 'bossa'], energy: [0.2, 0.9] },
        lines: { enter: ['Four to the bar.', 'Walking.'], ack: ['Cool.', 'Can do.'], groove: ['Chromatic step into the root.', 'Time lives in the bass, too.'] } },
      { id: 'pump', name: 'The Pump', tagline: 'Funk: syncopated sixteenths, octave pops, dead notes', mode: 'funk',
        traits: t({ pocket: -0.006, tightness: 0.75, density: 0.4, dynamics: 0.75, energy: 0.2, complexity: 0.65, fills: 0.5, ornaments: ['ghost', 'slide'] }),
        affinity: { genres: ['funk', 'hiphop', 'afrobeat', 'house', 'pop', 'rock', 'metal', 'trap'], energy: [0.45, 1] },
        lines: { enter: ['On the one!', 'Pop that octave.'], ack: ['Bet.', 'Funkier — got it.'], groove: ['The one is everything.', 'Locked to the kick.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'double bass', 'upright', 'viol'], text: 'The double bass descends from the viol family — that\'s why it\'s tuned in fourths (E A D G) like a viol rather than fifths like a cello. Jimmy Blanton, with Duke Ellington from 1939, turned it into a solo voice in jazz.' },
      { topic: 'history', keys: ['fender', 'precision', 'p bass', 'electric bass', 'jamerson', 'motown'], text: 'Leo Fender\'s Precision Bass (1951) put frets on the bass — "precision" pitch — and made it loud enough for bands. At Motown, James Jamerson of the Funk Brothers played it with one finger and invented a melodic, syncopated language you can hear on "What\'s Going On" and hundreds of hits.' },
      { topic: 'history', keys: ['slap', 'larry graham', 'thumb', 'sly'], text: 'Larry Graham says he invented thumb slapping in the late 1960s to cover for not having a drummer — thumping the string like a kick and popping it like a snare. With Sly & the Family Stone it became funk vocabulary.' },
      { topic: 'history', keys: ['ron carter', 'jaco', 'fretless', 'most recorded'], text: 'Ron Carter (Miles Davis\'s second great quintet) is in Guinness as the most-recorded jazz bassist. Jaco Pastorius pulled the frets off a Fender Jazz Bass and made it sing like a horn with Weather Report in the 1970s.' },
      { topic: 'instrument', keys: ['strings', 'tuning', 'range', 'octave'], text: 'A four-string bass is tuned E A D G — the same as a guitar\'s bottom four strings, an octave lower. Five-strings add a low B. It sounds an octave lower than written.' },
      { topic: 'technique', keys: ['lock', 'kick', 'pocket', 'groove'], text: 'Locking with the kick drum is job one: when bass notes start on the kick hits, the low end feels like one instrument. Then decide note length — short and punchy or long and singing — which changes the groove more than the notes do.' },
      { topic: 'theory', keys: ['walking', 'approach', 'chromatic', 'root'], text: 'A walking line plays quarter notes: the root on the downbeat, chord or scale tones in between, and on beat four an approach note — often a half step above or below — that pulls into the next chord\'s root.' },
      { topic: 'chora', keys: ['chora', 'bajo', 'bass engine', '808'], text: 'In Chora I play BAJO: Fingered Electric for soul and funk, Upright Jazz for walking, Picked P-Bass for rock, 808 Cathedral and Memphis Sine for trap and hip-hop, Fretless Glass when we go neo-soul. My slides are real pitch glides in the note\'s expression lane — open my take in the piano roll to see them.' },
    ],
    lessons: [
      { id: 'walking', title: 'Walking bass', summary: 'Roots, chord tones and the approach note on beat four.', steps: [
        { say: 'Root on one, then step through the chord, then on four I slip a half step into the next root. Hear it pull?', direct: 'make it jazz, Dwayne walker, everybody out except bass and drums' },
        { say: 'Now with the piano comping on top.', direct: 'piano come in' },
      ] },
      { id: 'one', title: 'On the one', summary: 'Why funk lands hard on the downbeat.', steps: [
        { say: 'In funk the first beat of the bar is home base — the downbeat everybody hits together.', direct: 'make it funk, Dwayne pump' },
      ] },
    ],
  },
  {
    id: 'rosa', name: 'Rosa Alvarado', nickname: 'Rosie', role: 'guitar', instrument: 'Guitar', from: 'San Antonio, Texas',
    bio: 'Started on her grandfather\'s nylon-string playing conjunto and boleros, fell for the blues on a borrowed Telecaster, and now gets called for everything from country sessions to ambient film cues.',
    influences: ['Charlie Christian', 'Robert Johnson', 'B.B. King', 'Jimi Hendrix', 'Nile Rodgers', 'Wes Montgomery', 'Sister Rosetta Tharpe'],
    genres: ['blues', 'rock', 'country', 'funk', 'bossa', 'pop'], color: '#F2C14E',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-dreadnought', byGenre: { rock: 'lyra-rock-crunch', metal: 'lyra-rock-crunch', blues: 'lyra-blues-drive', funk: 'lyra-funk-chop', house: 'lyra-funk-chop', jazz: 'lyra-jazz-box', neosoul: 'lyra-jazz-box', bossa: 'lyra-nylon', classical: 'lyra-nylon', salsa: 'lyra-nylon', pop: 'lyra-tele-clean', soul: 'lyra-tele-clean', gospel: 'lyra-tele-clean', reggae: 'lyra-tele-clean', afrobeat: 'lyra-tele-clean' } },
    range: [40, 86],
    personas: [
      { id: 'porch', name: 'Front Porch', tagline: 'Blues and country: bends, double stops, open chords', mode: 'porch',
        traits: t({ pocket: 0.01, tightness: 0.5, density: 0, dynamics: 0.65, complexity: 0.45, fills: 0.65, ornaments: ['bend', 'slide', 'vibrato', 'doubleStop'] }),
        affinity: { genres: ['blues', 'country', 'soul', 'gospel', 'reggae'], energy: [0.2, 0.75] },
        lines: { enter: ['Pull up a chair.', 'Little bend for you.'], ack: ['Sure thing, hon.', 'You got it.'], groove: ['That bend wants to cry.', 'Keep it simple, keep it true.'] } },
      { id: 'glass', name: 'Glasshouse', tagline: 'Clean arpeggios, dotted-eighth shimmer', mode: 'glass',
        traits: t({ pocket: 0, tightness: 0.8, density: -0.1, dynamics: 0.4, complexity: 0.5, fills: 0.2, space: 0.4, ornaments: ['vibrato'] }),
        affinity: { genres: ['pop', 'ballad', 'cinematic', 'neosoul', 'bossa', 'house'], energy: [0, 0.6] },
        lines: { enter: ['Let it ring.', 'Painting some light.'], ack: ['Mm, nice idea.', 'Okay.'], groove: ['Dotted eighths — it echoes itself.'] } },
      { id: 'fire', name: 'Firecracker', tagline: 'Power chords, palm mutes and fast leads', mode: 'fire',
        traits: t({ pocket: -0.006, tightness: 0.7, density: 0.45, dynamics: 0.8, energy: 0.3, complexity: 0.65, fills: 0.75, ornaments: ['bend', 'vibrato', 'trill', 'slide'] }),
        affinity: { genres: ['rock', 'metal', 'funk', 'afrobeat'], energy: [0.6, 1] },
        lines: { enter: ['Plugging into the big amp.', 'Hold on to something.'], ack: ['Hell yeah.', 'Cranking it.'], groove: ['Palm mute, then let it rip.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'spanish', 'torres', 'classical guitar', 'nylon'], text: 'The modern classical guitar took its shape in 19th-century Spain with the luthier Antonio de Torres, whose bigger body and fan bracing are still the template. Andrés Segovia then brought it to the concert hall.' },
      { topic: 'history', keys: ['electric', 'charlie christian', 'les paul', 'telecaster', 'stratocaster', 'fender', 'gibson'], text: 'Charlie Christian, with Benny Goodman from 1939, made the amplified guitar a solo voice. Solid bodies followed: Leo Fender\'s Telecaster (1950–51) and Stratocaster (1954), and Gibson\'s Les Paul (1952).' },
      { topic: 'history', keys: ['blues', 'robert johnson', 'delta', 'rosetta', 'b.b. king'], text: 'Robert Johnson recorded his 29 Delta blues songs in 1936–37; Sister Rosetta Tharpe was shredding gospel on electric guitar in the 1940s before rock had a name; B.B. King made single-note vibrato a language of its own.' },
      { topic: 'history', keys: ['hendrix', 'feedback', 'woodstock', 'rodgers', 'chic'], text: 'Jimi Hendrix turned feedback and the whammy bar into instruments (his "Star-Spangled Banner" at Woodstock, 1969). Nile Rodgers\' choppy sixteenth-note "chucking" with Chic defined disco and funk rhythm guitar.' },
      { topic: 'instrument', keys: ['tuning', 'strings', 'standard', 'frets', 'capo'], text: 'Standard tuning is E A D G B E, low to high: fourths, except a major third between G and B. Each fret is a semitone; a capo clamps across a fret to move every open chord up.' },
      { topic: 'instrument', keys: ['pickup', 'humbucker', 'single coil'], text: 'Single-coil pickups (Strat, Tele) are bright and glassy but hum; Seth Lover\'s humbucker at Gibson (1955) pairs two coils wired against each other to cancel hum, giving a thicker tone.' },
      { topic: 'technique', keys: ['bend', 'vibrato', 'palm mute', 'technique'], text: 'Bending pushes the string across the fret to raise the pitch — a half or whole step, sometimes more. Vibrato is a fast, small, repeated bend. Palm muting rests the picking hand on the strings at the bridge for that tight "chug".' },
      { topic: 'chora', keys: ['chora', 'lyra', 'guitar sound', 'electric', 'nylon', 'amp'], text: 'In Chora I sit at LYRA, the physical-model engine: a steel-string dreadnought, a nylon classical, or an electric with a pickup and an amp — picked by genre. It is a real plucked-string model, so where I pick (Position), how hard (Touch) and palm muting change the sound the way they would on my guitar. Print my take and every bend and slide stays on the clip.' },
    ],
    lessons: [
      { id: 'blues-box', title: 'The blues box', summary: 'Minor pentatonic plus the blue note, and why the bend sings.', steps: [
        { say: 'Minor pentatonic with the flat five — the blue note. Watch me lean on it.', direct: 'make it blues, Rosa take a solo, Rosa front porch' },
      ] },
    ],
  },
  {
    id: 'theo', name: 'Theo Laurent', role: 'piano', instrument: 'Piano', from: 'New Orleans, Louisiana · Paris',
    bio: 'Conservatory-trained in Paris, raised on New Orleans barrelhouse. Can go from a Chopin nocturne to a stride chorus without changing chairs.',
    influences: ['Jelly Roll Morton', 'Art Tatum', 'Thelonious Monk', 'Bill Evans', 'Herbie Hancock', 'Professor Longhair', 'Frédéric Chopin'],
    genres: ['jazz', 'classical', 'gospel', 'ballad', 'soul', 'salsa'], color: '#6FA8FF',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-concert-grand', byGenre: { jazz: 'lyra-jazz-grand', bossa: 'lyra-jazz-grand', blues: 'lyra-upright', pop: 'lyra-studio-grand', rock: 'lyra-studio-grand', gospel: 'lyra-studio-grand', soul: 'lyra-tine-suitcase', neosoul: 'lyra-tine-stage', funk: 'lyra-tine-bark', house: 'lyra-tine-stage', hiphop: 'lyra-tine-mellow' } },
    range: [36, 96],
    personas: [
      { id: 'professor', name: 'The Professor', tagline: 'Rich voicings, voice leading, tasteful fills', mode: 'professor',
        traits: t({ pocket: 0, tightness: 0.7, density: 0, dynamics: 0.6, complexity: 0.8, fills: 0.45, ornaments: ['grace', 'roll'] }),
        affinity: { genres: ['jazz', 'soul', 'neosoul', 'gospel', 'salsa', 'bossa'], energy: [0.2, 0.85] },
        lines: { enter: ['Shall we?', 'A little Bill Evans in this voicing.'], ack: ['Of course.', 'Très bien.'], groove: ['Rootless voicing — let Dwayne have the root.'] } },
      { id: 'juke', name: 'Juke Joint', tagline: 'Stride, boogie-woogie, barrelhouse left hand', mode: 'juke',
        traits: t({ pocket: 0.004, tightness: 0.55, density: 0.4, dynamics: 0.75, energy: 0.25, complexity: 0.5, fills: 0.7, ornaments: ['grace', 'trill'] }),
        affinity: { genres: ['blues', 'rock', 'country', 'gospel'], energy: [0.5, 1] },
        lines: { enter: ['Roll back the rug!', 'Left hand\'s doing the walking tonight.'], ack: ['Ha! Yes.', 'Rolling.'], groove: ['Stride: bass, chord, bass, chord.'] } },
      { id: 'midnight', name: 'Midnight', tagline: 'Sparse ballad: arpeggios, long sustain, space', mode: 'midnight',
        traits: t({ pocket: 0.015, tightness: 0.5, density: -0.55, dynamics: 0.7, energy: -0.3, complexity: 0.5, fills: 0.2, space: 0.7, ornaments: ['roll'] }),
        affinity: { genres: ['ballad', 'classical', 'cinematic', 'pop', 'neosoul'], energy: [0, 0.45] },
        lines: { enter: ['Lights low.', 'Just a few notes.'], ack: ['Softly.', 'Mm.'], groove: ['The silence is part of it.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'cristofori', 'invent', 'pianoforte', 'harpsichord'], text: 'Bartolomeo Cristofori built the first piano in Florence around 1700 — a "harpsichord that plays soft and loud" (gravicembalo col piano e forte). Unlike a harpsichord, which plucks, the piano strikes the strings with hammers, so how hard you press sets the loudness.' },
      { topic: 'history', keys: ['ragtime', 'joplin', 'stride', 'tatum', 'boogie'], text: 'Scott Joplin\'s "Maple Leaf Rag" (1899) made ragtime a craze; Harlem stride players like James P. Johnson and Fats Waller swung it harder; Art Tatum took it to a virtuosity that still astonishes. Boogie-woogie\'s rolling eight-to-the-bar left hand fed straight into rock and roll.' },
      { topic: 'history', keys: ['bill evans', 'monk', 'kind of blue', 'voicing', 'herbie'], text: 'Thelonious Monk made dissonance and space into wit. Bill Evans, on Miles Davis\'s "Kind of Blue" (1959), popularised rootless voicings — leaving the root to the bassist and voicing the 3rd, 7th and colour tones. Herbie Hancock carried that into funk and electric jazz.' },
      { topic: 'instrument', keys: ['88', 'keys', 'pedal', 'sustain', 'damper', 'hammer'], text: 'A modern piano has 88 keys (A0 to C8). The right pedal lifts all the dampers so notes ring (sustain); the left softens (una corda); the middle, on grands, holds only the notes already down (sostenuto).' },
      { topic: 'theory', keys: ['voicing', 'voice leading', 'inversion', 'shell'], text: 'Voice leading means moving each note of one chord to the nearest note of the next, so the harmony glides instead of jumping. Shell voicings — root, 3rd and 7th — are the skeleton every jazz and gospel pianist starts from.' },
      { topic: 'genre', keys: ['gospel', 'church', 'passing chord', 'walk up'], text: 'Gospel piano leans on passing chords and walk-ups — diminished chords and chromatic bass lines moving between the main chords — and on big rhythmic "shout" comping when the church is up on its feet.' },
      { topic: 'chora', keys: ['chora', 'lyra', 'piano sound', 'rhodes', 'tine', 'electric piano'], text: 'In Chora I play LYRA: a physical-model grand or upright — hammers, unison strings, soundboard, sustain pedal — and for soul, funk and neo-soul, the LYRA tine electric piano with its pickup bark and suitcase tremolo. Velocity really changes the tone, so play dynamics into the clip.' },
    ],
    lessons: [
      { id: 'voice-leading', title: 'Voice leading', summary: 'Move every note the shortest way.', steps: [
        { say: 'Listen to the top note of each chord — it barely moves. That\'s voice leading.', direct: 'everybody out except piano, Theo professor, simpler' },
        { say: 'Now the stride left hand: bass note, chord, bass note, chord.', direct: 'Theo juke joint' },
      ] },
    ],
  },
  {
    id: 'hez', name: 'Hezekiah Banks', nickname: 'Hez', role: 'organ', instrument: 'Organ', from: 'Birmingham, Alabama',
    bio: 'Third-generation church organist. Plays Sunday mornings, soul-jazz trios on Friday nights and the occasional cathedral recital. Says the organ breathes — you just have to let it.',
    influences: ['Jimmy Smith', 'Billy Preston', 'Booker T. Jones', 'Shirley Scott', 'J.S. Bach', 'Larry Young'],
    genres: ['gospel', 'soul', 'jazz', 'blues', 'reggae', 'classical'], color: '#B84DFF',
    seat: { kind: 'instrument', type: 'aura', preset: 'aura-vox-continental-66', byGenre: { reggae: 'aura-farfisa-compact-67', rock: 'aura-farfisa-compact-67' }, standIn: 'Chora has no tonewheel (Hammond) engine yet — Hez plays the Vox Continental combo organ.' },
    range: [36, 91],
    personas: [
      { id: 'sanctuary', name: 'Sanctuary', tagline: 'Gospel: swells, glissandos and shout stabs', mode: 'sanctuary',
        traits: t({ pocket: 0.008, tightness: 0.55, density: 0.2, dynamics: 0.85, energy: 0.2, complexity: 0.7, fills: 0.7, ornaments: ['gliss', 'shout'] }),
        affinity: { genres: ['gospel', 'soul', 'funk'], energy: [0.45, 1] },
        lines: { enter: ['Can I get a witness?', 'Pulling the drawbars out.'], ack: ['Amen.', 'Yes, Lord.'], groove: ['Swell on the four!', 'Shout chorus coming.'] } },
      { id: 'lounge', name: 'Groove Lounge', tagline: 'Soul-jazz comping and bluesy riffs', mode: 'lounge',
        traits: t({ pocket: 0.006, tightness: 0.6, density: 0, dynamics: 0.55, complexity: 0.6, fills: 0.5, ornaments: ['grace', 'trill'] }),
        affinity: { genres: ['jazz', 'blues', 'reggae', 'rock', 'afrobeat'], energy: [0.3, 0.8] },
        lines: { enter: ['Late set. Lights down.', 'Little Jimmy Smith for you.'], ack: ['Smooth.', 'Can do.'], groove: ['That\'s the B3 sound — well, its cousin.'] } },
      { id: 'cathedral', name: 'Cathedral', tagline: 'Hymn chorales with a pedal line', mode: 'cathedral',
        traits: t({ pocket: 0, tightness: 0.75, density: -0.4, dynamics: 0.5, energy: -0.2, complexity: 0.45, fills: 0.1, space: 0.2 }),
        affinity: { genres: ['classical', 'cinematic', 'ballad'], energy: [0, 0.6] },
        lines: { enter: ['Full stops, gently.', 'Four voices and a pedal.'], ack: ['Reverently.', 'Of course.'], groove: ['Let the room ring.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'hydraulis', 'ancient', 'pipe organ', 'oldest'], text: 'The organ is one of the oldest keyboard instruments: the hydraulis, built by Ctesibius of Alexandria in the 3rd century BC, used water pressure to feed air to its pipes. By the Baroque, cathedral pipe organs were the most complex machines in Europe.' },
      { topic: 'history', keys: ['bach', 'baroque', 'toccata', 'fugue'], text: 'J.S. Bach was the great organist of his age; the Toccata and Fugue in D minor (traditionally attributed to him) and his chorale preludes are still the core repertoire. A fugue is a theme answered by voice after voice in imitation.' },
      { topic: 'history', keys: ['hammond', 'tonewheel', 'b3', 'leslie', 'drawbar'], text: 'Laurens Hammond\'s tonewheel organ (1935) was sold to churches as an affordable pipe organ; the B-3 (from 1954) became the sound of gospel, soul and jazz. The Leslie speaker — a rotating horn and drum — gives it that swirling chorale/tremolo.' },
      { topic: 'history', keys: ['jimmy smith', 'soul jazz', 'booker t', 'green onions', 'billy preston'], text: 'Jimmy Smith turned the Hammond into a jazz lead voice in the mid-1950s; Booker T. & the M.G.\'s "Green Onions" (1962) made it a soul staple; Billy Preston, raised in the church, played it with the Beatles and the Rolling Stones.' },
      { topic: 'instrument', keys: ['drawbars', 'footage', "16'", "8'", 'stops', 'registration'], text: 'Drawbars (Hammond) and stops (pipe organ) are named in feet — 16′ sounds an octave below written, 8′ at pitch, 4′ an octave up — because that\'s the length of the open pipe that plays low C at that pitch. Choosing them is called registration.' },
      { topic: 'genre', keys: ['gospel', 'shout', 'swell', 'gliss'], text: 'Gospel organ speaks with the swell pedal: chords bloom on the long notes and punch on the shouts, with palm glissandos sweeping into the downbeat.' },
      { topic: 'chora', keys: ['chora', 'aura', 'organ sound', 'vox', 'farfisa'], text: 'In Chora I play AURA\'s 1966 Vox Continental or the \'67 Farfisa — combo organs, not a tonewheel Hammond, which Chora doesn\'t model yet. My swells are written in the note expression (pressure), so you can redraw them in the piano roll.' },
    ],
    lessons: [
      { id: 'swell', title: 'The swell', summary: 'How an organ breathes.', steps: [
        { say: 'An organ note doesn\'t decay — so I shape it with the swell pedal. Listen to the chords bloom.', direct: 'make it gospel, everybody out except organ and drums, Hez sanctuary' },
      ] },
    ],
  },
  {
    id: 'nova', name: 'Nova Kim', role: 'synth', instrument: 'Synth keys', from: 'Seoul · Berlin',
    bio: 'Restored vintage synthesizers in a Seoul repair shop before moving to Berlin, where she plays clubs and scores games. Thinks in oscillators, filters and envelopes.',
    influences: ['Wendy Carlos', 'Kraftwerk', 'Giorgio Moroder', 'Isao Tomita', 'Vangelis', 'Herbie Hancock', 'Ryuichi Sakamoto'],
    genres: ['house', 'pop', 'trap', 'cinematic', 'funk', 'neosoul'], color: '#00DAF3',
    seat: { kind: 'instrument', type: 'onda', preset: 'Supersaw', byGenre: { cinematic: 'Wide Warm Pad', neosoul: 'Glass Keys', ballad: 'Wide Warm Pad', trap: 'Bloom Pluck', funk: 'Vowel Lead', classical: 'Wide Warm Pad' } },
    range: [36, 96],
    personas: [
      { id: 'neon', name: 'Neon', tagline: '80s synthwave arpeggios and glossy leads', mode: 'neon',
        traits: t({ pocket: -0.002, tightness: 0.95, density: 0.3, dynamics: 0.3, complexity: 0.4, fills: 0.4, ornaments: ['slide'] }),
        affinity: { genres: ['pop', 'trap', 'cinematic'], energy: [0.35, 0.85] },
        lines: { enter: ['Arp clock synced.', 'Sixteenths, glowing.'], ack: ['Patching it.', 'On it.'], groove: ['Filter opening slowly…'] } },
      { id: 'lab', name: 'Laboratory', tagline: 'Experimental sequences, wide intervals, chance', mode: 'lab',
        traits: t({ pocket: 0, tightness: 0.85, density: -0.1, dynamics: 0.5, complexity: 0.9, fills: 0.3, space: 0.45 }),
        affinity: { genres: ['cinematic', 'neosoul', 'hiphop'], energy: [0, 0.6] },
        lines: { enter: ['Let\'s see what this patch does.', 'Probability at sixty percent.'], ack: ['Interesting.', 'Re-patching.'], groove: ['Happy accidents.'] } },
      { id: 'club', name: 'Clubland', tagline: 'House stabs, plucks and big-room chords', mode: 'club',
        traits: t({ pocket: 0, tightness: 0.95, density: 0.2, dynamics: 0.4, energy: 0.3, complexity: 0.45, fills: 0.5, ornaments: ['slide'] }),
        affinity: { genres: ['house', 'funk', 'afrobeat', 'pop'], energy: [0.55, 1] },
        lines: { enter: ['Hands up.', 'Offbeat stabs incoming.'], ack: ['Drop it.', 'Yes!'], groove: ['Riser into the drop.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'moog', 'minimoog', 'modular', 'buchla'], text: 'Robert Moog showed his modular synthesizer in 1964; Don Buchla built his on the West Coast at the same time. The Minimoog (1970) packed it into a portable keyboard and made the synth a band instrument.' },
      { topic: 'history', keys: ['wendy carlos', 'switched-on', 'kraftwerk', 'moroder', 'i feel love'], text: 'Wendy Carlos\'s "Switched-On Bach" (1968) proved the Moog could be musical and sold over a million copies. Kraftwerk\'s "Autobahn" (1974) and Giorgio Moroder\'s sequenced "I Feel Love" with Donna Summer (1977) pointed straight at electronic dance music.' },
      { topic: 'history', keys: ['prophet', 'dx7', 'fm', 'midi', 'polyphonic', '303', 'acid'], text: 'The Sequential Prophet-5 (1978) was polyphonic and remembered its patches. Yamaha\'s DX7 (1983) brought John Chowning\'s FM synthesis to every pop record, and MIDI (1983) let instruments talk to each other. The Roland TB-303\'s squelch became acid house (Phuture\'s "Acid Tracks", 1987).' },
      { topic: 'instrument', keys: ['oscillator', 'filter', 'envelope', 'adsr', 'subtractive', 'lfo'], text: 'Subtractive synthesis: an oscillator makes a bright wave (saw, square), a filter carves away harmonics, and an envelope — attack, decay, sustain, release — shapes loudness and filter over time. An LFO wobbles any of it slowly.' },
      { topic: 'instrument', keys: ['wavetable', 'supersaw', 'unison', 'detune'], text: 'Wavetable synths scan through a set of single-cycle waves to morph the tone. A supersaw is many detuned saw voices stacked in unison — the shimmering trance and big-room chord.' },
      { topic: 'chora', keys: ['chora', 'onda', 'aura', 'arp', 'patch'], text: 'In Chora I play ONDA, the wavetable synth — Supersaw, Glass Keys, Wide Warm Pad, House Stab — and I know AURA\'s 56 vintage templates, from the Minimoog bass to the CS-80 brass. Every patch\'s macros are automatable: draw a filter sweep on my track\'s macro lane in the Timeline.' },
    ],
    lessons: [
      { id: 'filter', title: 'Filter and envelope', summary: 'How a synth sound is carved.', steps: [
        { say: 'Arpeggio first — same chord, notes one at a time on the clock.', direct: 'make it house, everybody out except synth and drums, Nova neon' },
        { say: 'Now offbeat stabs — short envelope, the house chord.', direct: 'Nova clubland' },
      ] },
    ],
  },
  {
    id: 'ingrid', name: 'Ingrid Solberg', role: 'cello', instrument: 'Cello', from: 'Bergen, Norway',
    bio: 'Principal cellist turned session player. Plays Bach suites at dawn, Hardanger folk tunes with her family and rhythmic cello ostinatos for film. Thinks of the cello as the closest instrument to a human voice.',
    influences: ['Pablo Casals', 'Jacqueline du Pré', 'Mstislav Rostropovich', 'Yo-Yo Ma', 'Apocalyptica', 'Zoë Keating'],
    genres: ['classical', 'cinematic', 'ballad', 'soul', 'pop', 'metal'], color: '#C0392B',
    seat: { kind: 'instrument', type: 'bajo', preset: 'cello-menace' }, range: [36, 76],
    personas: [
      { id: 'soloist', name: 'The Soloist', tagline: 'Singing counter-melodies with deep vibrato', mode: 'soloist',
        traits: t({ pocket: 0.012, tightness: 0.55, density: -0.25, dynamics: 0.8, complexity: 0.55, fills: 0.4, space: 0.35, ornaments: ['vibrato', 'slide'], articulation: 'legato' }),
        affinity: { genres: ['ballad', 'classical', 'soul', 'neosoul', 'pop'], energy: [0, 0.7] },
        lines: { enter: ['Let me sing underneath you.', 'A line for the heart.'], ack: ['Ja, of course.', 'Beautiful idea.'], groove: ['Vibrato blooms late on the long notes.'] } },
      { id: 'engine', name: 'The Engine', tagline: 'Driving spiccato ostinatos', mode: 'engine',
        traits: t({ pocket: -0.004, tightness: 0.8, density: 0.45, dynamics: 0.6, energy: 0.3, complexity: 0.4, fills: 0.3, articulation: 'spiccato' }),
        affinity: { genres: ['cinematic', 'metal', 'rock', 'house'], energy: [0.5, 1] },
        lines: { enter: ['Bow on the string. Drive.', 'Eighths, relentless.'], ack: ['Faster then.', 'Yes.'], groove: ['The ostinato is the engine room.'] } },
      { id: 'lantern', name: 'Lantern', tagline: 'Warm sustained roots and fifths', mode: 'lantern',
        traits: t({ pocket: 0.01, tightness: 0.6, density: -0.6, dynamics: 0.45, energy: -0.25, complexity: 0.2, fills: 0.1, space: 0.1, ornaments: ['vibrato'], articulation: 'sul-tasto' }),
        affinity: { genres: ['classical', 'ballad', 'gospel', 'country'], energy: [0, 0.5] },
        lines: { enter: ['Holding the floor for you.', 'Warm and low.'], ack: ['Softer, yes.', 'Mm.'], groove: ['Sul tasto — bowing over the fingerboard.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'amati', 'origin', 'violoncello'], text: 'The cello (violoncello, "little big viola") appeared in northern Italy in the 16th century; some of the earliest surviving examples are by Andrea Amati of Cremona. Early on it was mostly a bass instrument, doubling the harpsichord\'s left hand.' },
      { topic: 'history', keys: ['bach', 'suites', 'casals'], text: 'Bach\'s six Suites for Solo Cello (around 1717–23) were treated as études until a 13-year-old Pablo Casals found an edition in a Barcelona shop in 1890, practised them for over a decade and performed them complete — they\'ve been the cellist\'s bible since.' },
      { topic: 'history', keys: ['du pre', 'elgar', 'rostropovich', 'yo-yo ma', 'apocalyptica'], text: 'Jacqueline du Pré\'s 1965 recording of Elgar\'s Cello Concerto is legendary; Rostropovich inspired concertos from Shostakovich, Prokofiev and Britten; Yo-Yo Ma took the cello across Silk Road and Appalachian music; Apocalyptica (1996) played Metallica on four cellos.' },
      { topic: 'instrument', keys: ['tuning', 'strings', 'c g d a', 'range', 'endpin', 'fifths'], text: 'The cello is tuned C G D A in fifths, an octave below the viola. It rests on an endpin between the knees, and its range runs from the C two octaves below middle C to well over three octaves above.' },
      { topic: 'technique', keys: ['bow', 'spiccato', 'pizzicato', 'sul ponticello', 'sul tasto', 'vibrato', 'articulation'], text: 'Spiccato bounces the bow for short, light notes; pizzicato plucks; sul ponticello bows near the bridge for a glassy, eerie sound; sul tasto bows over the fingerboard for a soft, flute-like one. Vibrato is rocking the finger to make the pitch breathe.' },
      { topic: 'chora', keys: ['chora', 'bajo', 'cello sound', 'articulation', 'cello menace'], text: 'In Chora I play BAJO\'s Cello Menace physical model (Bowed Contrabass is my neighbour). Every note I write carries an articulation — legato, spiccato, sul tasto — and vibrato in its expression, so the engine shortens, swells and bends it like a bow would. You can change any of it in the piano roll\'s articulation lane.' },
    ],
    lessons: [
      { id: 'articulations', title: 'Bowing articulations', summary: 'Legato, spiccato and sul tasto — same notes, different bow.', steps: [
        { say: 'Legato: one bow, notes joined, vibrato blooming on the long ones.', direct: 'everybody out except cello, Ingrid soloist' },
        { say: 'Spiccato: the bow bounces. Now I\'m the engine room.', direct: 'Ingrid engine' },
      ] },
    ],
  },
  {
    id: 'priya', name: 'Priya Nair', role: 'violin', instrument: 'Violin', from: 'Chennai, India · Nashville, Tennessee',
    bio: 'Trained in Carnatic violin as a child in Chennai, then fell into bluegrass jams in Nashville and finished a classical degree. Equally at home on a fiddle tune, a concerto and a string section for an R&B record.',
    influences: ['Niccolò Paganini', 'Stéphane Grappelli', 'Lalgudi Jayaraman', 'L. Subramaniam', 'Itzhak Perlman', 'Alison Krauss', 'Hilary Hahn'],
    genres: ['classical', 'country', 'soul', 'cinematic', 'ballad', 'pop'], color: '#E84A8A',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-concert-violin', byGenre: { country: 'lyra-fiddle', soul: 'lyra-silk-strings', neosoul: 'lyra-silk-strings', ballad: 'lyra-silk-strings', pop: 'lyra-silk-strings' } },
    range: [55, 100],
    personas: [
      { id: 'fiddle', name: 'Fiddle', tagline: 'Bluegrass and Celtic: double stops, chops, drones', mode: 'fiddle',
        traits: t({ pocket: -0.004, tightness: 0.6, density: 0.35, dynamics: 0.6, energy: 0.2, complexity: 0.5, fills: 0.7, ornaments: ['doubleStop', 'slide', 'grace'] }),
        affinity: { genres: ['country', 'rock', 'blues'], energy: [0.35, 1] },
        lines: { enter: ['Rosin up!', 'Here\'s a fiddle tune for you.'], ack: ['Yee — okay, yes.', 'On it.'], groove: ['Double stops ring like two fiddles.'] } },
      { id: 'prima', name: 'Prima', tagline: 'Classical bravura: runs, arpeggios, high lines', mode: 'prima',
        traits: t({ pocket: 0.004, tightness: 0.75, density: 0.25, dynamics: 0.8, complexity: 0.75, fills: 0.55, ornaments: ['trill', 'vibrato', 'grace'] }),
        affinity: { genres: ['classical', 'cinematic', 'salsa'], energy: [0.3, 1] },
        lines: { enter: ['From the top, con brio.', 'Paganini would approve.'], ack: ['Certainly.', 'Molto bene.'], groove: ['Arpeggios up to the high E.'] } },
      { id: 'silk', name: 'Silk', tagline: 'R&B and neo-soul strings: long legato lines', mode: 'silk',
        traits: t({ pocket: 0.012, tightness: 0.65, density: -0.45, dynamics: 0.6, energy: -0.1, complexity: 0.5, fills: 0.3, space: 0.4, ornaments: ['vibrato', 'slide'], articulation: 'legato' }),
        affinity: { genres: ['soul', 'neosoul', 'ballad', 'pop', 'gospel', 'hiphop'], energy: [0, 0.65] },
        lines: { enter: ['Silk sheets of strings.', 'Long bows only.'], ack: ['Mm, gently.', 'Sure.'], groove: ['Letting it float above the chords.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'cremona', 'stradivari', 'amati', 'guarneri'], text: 'The violin was perfected in Cremona: Andrea Amati in the mid-1500s, then Antonio Stradivari (1644–1737) and Giuseppe Guarneri "del Gesù". Their instruments are still the most prized in the world.' },
      { topic: 'history', keys: ['paganini', 'caprices', 'virtuoso'], text: 'Niccolò Paganini\'s 24 Caprices (published 1820) set the bar for violin virtuosity — left-hand pizzicato, harmonics, wild leaps. Rumours said he\'d sold his soul for his technique.' },
      { topic: 'history', keys: ['fiddle', 'bluegrass', 'celtic', 'grappelli', 'django', 'jazz violin'], text: 'Violin and fiddle are the same instrument — "fiddle" is the style. Celtic, Appalachian, Cajun and bluegrass fiddling travel by ear; Stéphane Grappelli swung it with Django Reinhardt in the Quintette du Hot Club de France from 1934.' },
      { topic: 'history', keys: ['carnatic', 'india', 'south indian', 'subramaniam', 'gamaka'], text: 'South Indian Carnatic music adopted the violin in the early 19th century and re-imagined it: played seated, the scroll resting on the foot, so the left hand can slide freely through the gamakas — the ornamented glides that are the soul of a raga.' },
      { topic: 'instrument', keys: ['tuning', 'g d a e', 'strings', 'bow', 'rosin'], text: 'The violin is tuned G D A E in fifths. The bow is horsehair rubbed with rosin so it grips the string and sets it vibrating — the bow is half the instrument.' },
      { topic: 'technique', keys: ['double stop', 'chop', 'shuffle', 'tremolo'], text: 'A double stop bows two strings at once. Bluegrass "chop" is a scratchy, percussive bow stroke on the backbeat that works like a snare drum; tremolo is the bow shivering fast on one note.' },
      { topic: 'chora', keys: ['chora', 'lyra', 'violin sound', 'vibrato', 'bow'], text: 'In Chora I play the LYRA bowed-string violin: a real stick-slip bow model with a violin body. Bow position, bow pressure, onset and vibrato are on the panel on my track — fiddle presets sit near the bridge with more pressure, silk strings play long bows and slow vibrato.' },
    ],
    lessons: [
      { id: 'fiddle-vs-violin', title: 'Fiddle or violin?', summary: 'Same instrument, two languages.', steps: [
        { say: 'Fiddle: double stops and drive.', direct: 'make it country, Priya fiddle, Priya take a solo' },
        { say: 'Now the same instrument as an R&B string line — long bows, vibrato.', direct: 'make it soul, Priya silk' },
      ] },
    ],
  },
  {
    id: 'corny', name: 'Cornelius Price', nickname: 'Corny', role: 'trumpet', instrument: 'Trumpet', from: 'New Orleans, Louisiana',
    bio: 'Marched in second-line brass bands before he could drive, toured with a big band, a mariachi and a funk horn section. Can play it pretty, hot or cold — and loves a high note at the end.',
    influences: ['Louis Armstrong', 'Dizzy Gillespie', 'Miles Davis', 'Clifford Brown', 'Lee Morgan', 'Freddie Hubbard', 'Wynton Marsalis'],
    genres: ['jazz', 'funk', 'salsa', 'soul', 'blues', 'cinematic'], color: '#F5B700',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-trumpet-open', byGenre: { jazz: 'lyra-trumpet-harmon', ballad: 'lyra-trumpet-harmon', neosoul: 'lyra-trumpet-harmon', bossa: 'lyra-trumpet-cup' } },
    range: [54, 84],
    personas: [
      { id: 'bourbon', name: 'Bourbon Street', tagline: 'New Orleans: hot lines, shakes and falls', mode: 'bourbon',
        traits: t({ pocket: 0.008, tightness: 0.5, density: 0.2, dynamics: 0.75, energy: 0.2, complexity: 0.5, fills: 0.65, ornaments: ['fall', 'scoop', 'trill', 'grace'] }),
        affinity: { genres: ['jazz', 'blues', 'funk', 'gospel'], energy: [0.4, 1] },
        lines: { enter: ['Second line, here we go!', 'When the saints…'], ack: ['Oh yeah.', 'Hot, coming up.'], groove: ['Fall off the end of that one.'] } },
      { id: 'coolblue', name: 'Cool Blue', tagline: 'Muted, spacious, every note counts', mode: 'cool',
        traits: t({ pocket: 0.015, tightness: 0.55, density: -0.55, dynamics: 0.5, energy: -0.25, complexity: 0.7, fills: 0.3, space: 0.75, ornaments: ['scoop', 'vibrato'], articulation: 'con-sordino' }),
        affinity: { genres: ['jazz', 'ballad', 'neosoul', 'bossa', 'hiphop'], energy: [0, 0.55] },
        lines: { enter: ['Harmon mute in.', 'Fewer notes.'], ack: ['Mm.', 'Cool.'], groove: ['Leave space — that\'s the music.'] } },
      { id: 'fanfare', name: 'Fanfare', tagline: 'Bright stabs, brass-band and mariachi fire', mode: 'fanfare',
        traits: t({ pocket: -0.004, tightness: 0.75, density: 0.2, dynamics: 0.7, energy: 0.3, complexity: 0.4, fills: 0.5, register: 5, ornaments: ['shout', 'fall'], articulation: 'marcato' }),
        affinity: { genres: ['salsa', 'funk', 'cinematic', 'afrobeat', 'soul', 'house'], energy: [0.55, 1] },
        lines: { enter: ['Horns up!', 'Brass section, hit it.'], ack: ['Loud and proud.', 'Yes!'], groove: ['Stab on the and of four!'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'valve', 'natural trumpet', 'baroque'], text: 'For most of history the trumpet had no valves — players picked notes from the harmonic series with their lips, which is why Baroque trumpet parts sit so high. Heinrich Stölzel and Friedrich Blühmel patented valves in 1818, and the trumpet could finally play every chromatic note.' },
      { topic: 'history', keys: ['armstrong', 'hot five', 'west end blues', 'louis'], text: 'Louis Armstrong\'s Hot Five and Hot Seven records (1925–28) turned jazz into a soloist\'s art; the opening cadenza of "West End Blues" (1928) is one of the most famous 15 seconds in recorded music.' },
      { topic: 'history', keys: ['dizzy', 'bebop', 'miles', 'kind of blue', 'harmon', 'mute', 'clifford'], text: 'Dizzy Gillespie co-invented bebop and played a horn with its bell bent upward. Miles Davis went the other way: the Harmon mute, space, and the modal "Kind of Blue" (1959), still the best-selling jazz record. Clifford Brown\'s warmth set the hard-bop standard.' },
      { topic: 'instrument', keys: ['b flat', 'transposing', 'written', 'concert pitch'], text: 'The trumpet is usually in B♭: it sounds a whole step lower than written, so a written C comes out as concert B♭. Three valves add lengths of tubing to lower the pitch by 2, 1 and 3 semitones.' },
      { topic: 'technique', keys: ['embouchure', 'buzz', 'fall', 'shake', 'growl'], text: 'The sound starts with the lips buzzing into the mouthpiece (the embouchure). Jazz effects: a fall drops the pitch off the end of a note, a shake is a wide lip trill, a scoop slides up into a note.' },
      { topic: 'genre', keys: ['horn section', 'stabs', 'earth wind', 'funk horns', 'mariachi'], text: 'Funk and soul horn sections (the JB Horns, Earth, Wind & Fire\'s Phenix Horns, Tower of Power) play short, tight stabs as a rhythm instrument. Mariachi trumpets play bright, wide-vibrato thirds in pairs.' },
      { topic: 'chora', keys: ['chora', 'lyra', 'brass sound', 'mute', 'harmon'], text: 'In Chora I play the LYRA trumpet: buzzing lips into a brass bore, with open, cup, Harmon and straight mutes. Lip tension, onset and vibrato are on my panel, and it gets brighter as it gets louder, like a real horn.' },
    ],
    lessons: [
      { id: 'space', title: 'Playing with space', summary: 'Why Miles played fewer notes.', steps: [
        { say: 'Here\'s a hot New Orleans line — lots of notes.', direct: 'make it jazz, Corny bourbon street, Corny take a solo' },
        { say: 'Now the same changes, cool and muted. Listen to the gaps.', direct: 'Corny cool blue' },
      ] },
    ],
  },
  {
    id: 'lena', name: 'Lena Moretti', nickname: 'Smoke', role: 'sax', instrument: 'Saxophone', from: 'Chicago, Illinois',
    bio: 'Learned tenor in Chicago blues bars and bebop at a conservatory, then spent years in a touring soul revue. Plays alto, tenor and bari — and can make a ballad melt or a dance floor shout.',
    influences: ['Coleman Hawkins', 'Lester Young', 'Charlie Parker', 'John Coltrane', 'King Curtis', 'Maceo Parker', 'Candy Dulfer'],
    genres: ['jazz', 'soul', 'funk', 'blues', 'rock', 'neosoul'], color: '#D98E04',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-alto', byGenre: { ballad: 'lyra-tenor-ballad', neosoul: 'lyra-tenor-ballad', blues: 'lyra-tenor-honk', soul: 'lyra-tenor-honk', funk: 'lyra-tenor-honk', rock: 'lyra-tenor-honk' } },
    range: [49, 81],
    personas: [
      { id: 'smoke', name: 'Smoke', tagline: 'Breathy ballad tenor: scoops, sighs, vibrato', mode: 'smoke',
        traits: t({ pocket: 0.02, tightness: 0.45, density: -0.35, dynamics: 0.7, energy: -0.2, complexity: 0.55, fills: 0.45, space: 0.6, ornaments: ['scoop', 'vibrato', 'fall'] }),
        affinity: { genres: ['ballad', 'neosoul', 'soul', 'jazz', 'bossa'], energy: [0, 0.55] },
        lines: { enter: ['Lights down low.', 'Breathe with me.'], ack: ['Mm-hm, baby.', 'Softer, sure.'], groove: ['Scoop into it.'] } },
      { id: 'honker', name: 'The Honker', tagline: 'R&B honks, riffs and growls', mode: 'honker',
        traits: t({ pocket: 0.006, tightness: 0.55, density: 0.25, dynamics: 0.85, energy: 0.3, complexity: 0.35, fills: 0.6, register: -3, ornaments: ['growl', 'scoop', 'shout'] }),
        affinity: { genres: ['blues', 'rock', 'funk', 'soul', 'afrobeat'], energy: [0.55, 1] },
        lines: { enter: ['Watch the bell!', 'Somebody hold my coat.'], ack: ['Honk honk.', 'Yeah!'], groove: ['Same riff, harder every time.'] } },
      { id: 'bebop', name: 'Bebop', tagline: 'Eighth-note lines with chromatic approaches', mode: 'bebop',
        traits: t({ pocket: -0.004, tightness: 0.7, density: 0.55, dynamics: 0.5, complexity: 0.9, fills: 0.5, ornaments: ['grace'] }),
        affinity: { genres: ['jazz', 'salsa', 'funk'], energy: [0.4, 1] },
        lines: { enter: ['Bird lives.', 'Running the changes.'], ack: ['Dig.', 'Can do.'], groove: ['Chromatic approach into the third.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'adolphe sax', 'invent', 'patent', 'belgian'], text: 'The Belgian instrument maker Adolphe Sax patented the saxophone in Paris in 1846, aiming to bridge woodwinds and brass. It\'s made of brass but it\'s a woodwind: the sound comes from a single cane reed, like a clarinet.' },
      { topic: 'history', keys: ['coleman hawkins', 'body and soul', 'lester young', 'tenor'], text: 'Coleman Hawkins\' "Body and Soul" (1939) made the tenor sax the voice of jazz; Lester Young answered with a lighter, floating sound that inspired a generation of "cool" players.' },
      { topic: 'history', keys: ['charlie parker', 'bird', 'bebop', 'coltrane', 'giant steps', 'love supreme'], text: 'Charlie Parker ("Bird") built bebop on the alto in the 1940s. John Coltrane pushed harmony to its limit on "Giant Steps" (1960) and turned spiritual on "A Love Supreme" (recorded 1964).' },
      { topic: 'history', keys: ['r&b', 'honk', 'king curtis', 'maceo', 'clarence', 'rock and roll'], text: 'In 1940s–50s R&B, honking tenor players were the rock stars before rock — King Curtis played on hundreds of sessions ("Yakety Yak"), Maceo Parker was James Brown\'s funk voice, and Clarence Clemons gave Springsteen\'s E Street Band its roar.' },
      { topic: 'instrument', keys: ['family', 'alto', 'tenor', 'baritone', 'soprano', 'transposing'], text: 'The family: soprano and tenor in B♭, alto and baritone in E♭ — all transposing instruments. The tenor sounds a major ninth below written, the alto a major sixth below.' },
      { topic: 'theory', keys: ['bebop scale', 'chromatic', 'enclosure', 'approach'], text: 'The bebop dominant scale adds a passing note (the major 7th) to the mixolydian so chord tones land on the beats of a running eighth-note line. An enclosure surrounds a target note — a step above, a half step below — then lands on it.' },
      { topic: 'chora', keys: ['chora', 'lyra', 'sax sound', 'growl', 'tenor', 'alto'], text: 'In Chora I play the LYRA saxophone: a reed and bore model, alto or tenor. Reed stiffness, breath, vibrato and growl are on my panel — the R&B Honker preset is me on the turnaround.' },
    ],
    lessons: [
      { id: 'enclosure', title: 'Enclosures', summary: 'Circle the note, then land on it.', steps: [
        { say: 'Listen for how I land on the chord tones on the beat — I surround them first.', direct: 'make it jazz, Lena bebop, Lena take a solo' },
      ] },
    ],
  },
  {
    id: 'felix', name: 'Felix Hart', role: 'woodwinds', instrument: 'Woodwinds (flute · clarinet · oboe)', from: 'Dublin, Ireland',
    bio: 'A doubler: flute, piccolo, clarinet, oboe and tin whistle. Pit orchestras, klezmer weddings, Irish sessions and film dates. Never travels without five cases and a reed knife.',
    influences: ['Jean-Pierre Rampal', 'Benny Goodman', 'Naftule Brandwein', 'Matt Molloy', 'Hubert Laws', 'Herbie Mann'],
    genres: ['classical', 'cinematic', 'bossa', 'country', 'jazz', 'ballad'], color: '#7BD389',
    seat: { kind: 'instrument', type: 'lyra', preset: 'lyra-concert-flute', byGenre: { cinematic: 'lyra-alto-flute', ballad: 'lyra-alto-flute', classical: 'lyra-oboe', jazz: 'lyra-clarinet', blues: 'lyra-clarinet', country: 'lyra-tin-whistle', reggae: 'lyra-tin-whistle', neosoul: 'lyra-alto-flute' } },
    range: [58, 96],
    personas: [
      { id: 'pastoral', name: 'Pastoral', tagline: 'Flute birdsong: trills and high answers', mode: 'pastoral',
        traits: t({ pocket: 0.004, tightness: 0.6, density: -0.1, dynamics: 0.55, complexity: 0.55, fills: 0.65, register: 7, space: 0.45, ornaments: ['trill', 'grace', 'vibrato'] }),
        affinity: { genres: ['classical', 'cinematic', 'ballad', 'bossa', 'pop'], energy: [0, 0.65] },
        lines: { enter: ['A little birdsong.', 'Flute up top.'], ack: ['Lovely.', 'Grand, so.'], groove: ['Trill on the long one.'] } },
      { id: 'klezmer', name: 'Klezmer Spark', tagline: 'Clarinet: krekhts, bends and minor-mode fire', mode: 'klezmer',
        traits: t({ pocket: 0, tightness: 0.55, density: 0.3, dynamics: 0.8, energy: 0.2, complexity: 0.6, fills: 0.7, ornaments: ['bend', 'grace', 'trill', 'scoop'] }),
        affinity: { genres: ['jazz', 'blues', 'country', 'salsa', 'rock'], energy: [0.4, 1] },
        lines: { enter: ['Clarinet out — wedding\'s on!', 'Freygish, here we go.'], ack: ['Mazel tov, yes.', 'Hah, sure.'], groove: ['That little sob is a krekhts.'] } },
      { id: 'reeds', name: 'The Reed Choir', tagline: 'A woodwind section: three-part harmony', mode: 'reeds',
        traits: t({ pocket: 0.006, tightness: 0.7, density: -0.3, dynamics: 0.5, complexity: 0.5, fills: 0.2, space: 0.3, articulation: 'legato' }),
        affinity: { genres: ['classical', 'cinematic', 'soul', 'ballad'], energy: [0.1, 0.7] },
        lines: { enter: ['Flute, clarinet, oboe — together.', 'Section voicing.'], ack: ['Right so.', 'Blending.'], groove: ['Oboe on top cuts through.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'oldest', 'bone flute', 'hohle fels', 'ancient'], text: 'Flutes are among humanity\'s oldest instruments: bone and ivory flutes from caves like Hohle Fels in Germany are over 35,000 years old. The modern Western flute is Theobald Boehm\'s design (1847), with its system of keys and pads.' },
      { topic: 'history', keys: ['clarinet', 'denner', 'chalumeau', 'mozart', 'goodman', 'rhapsody'], text: 'Johann Christoph Denner developed the clarinet from the chalumeau around 1700. Mozart loved it — his Clarinet Concerto (1791) — Benny Goodman made it swing, and the opening glissando of Gershwin\'s "Rhapsody in Blue" (1924) is clarinet history.' },
      { topic: 'history', keys: ['klezmer', 'brandwein', 'tarras', 'freygish'], text: 'Klezmer is the dance music of Eastern European Jewish celebrations; clarinettists like Naftule Brandwein and Dave Tarras recorded it in 1920s New York. Its signature mode, freygish, is a scale with a flattened 2nd and a raised 3rd.' },
      { topic: 'instrument', keys: ['oboe', 'double reed', 'bassoon', 'tune', 'a440'], text: 'The oboe and bassoon are double reeds — two blades of cane vibrating against each other. The oboe\'s focused sound is why the orchestra tunes to its A. Flutes have no reed at all: you split an air stream across the embouchure hole.' },
      { topic: 'technique', keys: ['breath', 'tonguing', 'trill', 'vibrato', 'flutter'], text: 'Woodwind articulation is tonguing: single (ta), double (ta-ka) and flutter tongue (rolled r). Vibrato comes from the breath and diaphragm on flute, much less on clarinet in the classical tradition.' },
      { topic: 'chora', keys: ['chora', 'lyra', 'pneuma', 'flute sound', 'clarinet sound', 'oboe sound', 'bassoon'], text: 'In Chora I play LYRA, the physical-model engine: concert flute, piccolo, alto flute and tin whistle (an air jet driving the tube), clarinet and bass clarinet (a single reed on a closed cylinder, so the low notes are all odd harmonics), and the double reeds, oboe, English horn and bassoon. Notes I play into a held note slur, with no new attack, and how hard you play opens the bell. For ney and shakuhachi I go to PNEUMA, the breath engine.' },
    ],
    lessons: [
      { id: 'section', title: 'Writing for a woodwind section', summary: 'Three voices that blend.', steps: [
        { say: 'Three-part harmony, close voiced, each voice moving as little as possible.', direct: 'make it classical, everybody out except woodwinds, Felix reed choir' },
      ] },
    ],
  },
  {
    id: 'elena', name: 'Elena Vasquez', nickname: 'Maestra', role: 'orchestra', instrument: 'Orchestra section (conductor)', from: 'Mexico City · Los Angeles',
    bio: 'Conducts the Meridian Section — strings, brass and winds — for film, games and records. Orchestrator first: knows which instrument should play each note and why.',
    influences: ['Ludwig van Beethoven', 'Maurice Ravel', 'Bernard Herrmann', 'John Williams', 'Silvestre Revueltas', 'Hans Zimmer', 'Hildur Guðnadóttir'],
    genres: ['cinematic', 'classical', 'ballad', 'pop', 'soul', 'gospel'], color: '#FFD166',
    seat: { kind: 'instrument', type: 'aura', preset: 'aura-solina-74', byGenre: { cinematic: 'aura-oxygene-phaser', classical: 'aura-mellotron-violins' }, standIn: 'The section plays AURA string ensembles; load an orchestral SoundFont in KERA on its track for a real orchestra.' },
    range: [36, 96],
    personas: [
      { id: 'golden', name: 'Golden Age', tagline: 'Lush film score: big pads and soaring top lines', mode: 'golden',
        traits: t({ pocket: 0.01, tightness: 0.6, density: -0.2, dynamics: 0.85, complexity: 0.55, fills: 0.4, ornaments: ['vibrato'], articulation: 'legato' }),
        affinity: { genres: ['cinematic', 'ballad', 'pop', 'gospel', 'soul'], energy: [0.2, 0.85] },
        lines: { enter: ['Strings, from the heart.', 'Let it soar.'], ack: ['Of course, maestro producer.', 'Bellísimo.'], groove: ['Horns double the melody an octave down.'] } },
      { id: 'pulse', name: 'Pulse', tagline: 'Minimalist and hybrid ostinatos, trailer stabs', mode: 'pulse',
        traits: t({ pocket: 0, tightness: 0.9, density: 0.35, dynamics: 0.7, energy: 0.3, complexity: 0.45, fills: 0.3, articulation: 'spiccato' }),
        affinity: { genres: ['cinematic', 'house', 'metal', 'rock', 'trap'], energy: [0.5, 1] },
        lines: { enter: ['Ostinato. Everyone.', 'Tick, tick, tick.'], ack: ['Tighter.', 'Sí.'], groove: ['Repetition builds tension.'] } },
      { id: 'chamber', name: 'Chamber', tagline: 'Intimate string quartet voicing', mode: 'chamber',
        traits: t({ pocket: 0.008, tightness: 0.6, density: -0.45, dynamics: 0.55, energy: -0.2, complexity: 0.6, fills: 0.2, space: 0.3, articulation: 'legato' }),
        affinity: { genres: ['classical', 'ballad', 'neosoul', 'bossa'], energy: [0, 0.55] },
        lines: { enter: ['Just the quartet.', 'Four voices.'], ack: ['Delicately.', 'Yes.'], groove: ['The viola carries the inner line.'] } },
    ],
    knowledge: [
      { topic: 'history', keys: ['history', 'orchestra', 'haydn', 'classical', 'beethoven', 'size'], text: 'The orchestra grew from Baroque court bands of a couple of dozen players. Haydn standardised the Classical orchestra; Beethoven stretched it — his Ninth Symphony (1824) added a chorus — and by Mahler and Wagner a hundred players was normal.' },
      { topic: 'history', keys: ['film', 'score', 'steiner', 'king kong', 'herrmann', 'psycho', 'williams', 'star wars', 'zimmer'], text: 'Max Steiner\'s "King Kong" (1933) set the Hollywood template; Bernard Herrmann scored "Psycho" (1960) for strings alone; John Williams brought back the symphonic leitmotif with "Star Wars" (1977); Hans Zimmer fused orchestra with synths and percussion.' },
      { topic: 'history', keys: ['ravel', 'bolero', 'orchestration', 'revueltas'], text: 'Ravel\'s "Boléro" (1928) is an orchestration lesson: one melody passed through instrument after instrument over a snare ostinato, getting louder for fifteen minutes. Silvestre Revueltas brought Mexican street-band colour to the concert orchestra.' },
      { topic: 'instrument', keys: ['sections', 'seating', 'strings', 'brass', 'winds', 'percussion'], text: 'Four families: strings (first and second violins, violas, cellos, basses), woodwinds, brass (horns, trumpets, trombones, tuba) and percussion. Strings are the body of the sound; brass is power; winds are colour.' },
      { topic: 'theory', keys: ['orchestration', 'doubling', 'divisi', 'voicing', 'spacing'], text: 'Orchestration rules of thumb: space chords wide at the bottom and close at the top (like the harmonic series), double important lines at the octave, and split (divisi) a section when you need more voices without more players.' },
      { topic: 'chora', keys: ['chora', 'aura', 'solina', 'articulation', 'orchestra sound'], text: 'In Chora the section plays AURA\'s string ensembles — the \'74 Solina, the Oxygène phaser strings for film, Mellotron violins for classical. Every note carries an articulation (legato, spiccato, tremolo, marcato) and swell expression; use the piano roll\'s articulation lane or flip to the Score view to read it as notation.' },
    ],
    lessons: [
      { id: 'ostinato', title: 'Ostinato and tension', summary: 'How film music builds.', steps: [
        { say: 'An ostinato is a figure that repeats. Over it, tension can rise without the harmony changing.', direct: 'make it cinematic, Elena pulse, build' },
        { say: 'Now the golden-age version: sustained, lush, singing.', direct: 'Elena golden age, softer' },
      ] },
    ],
  },
];

// The physics of each instrument (science.ts) joins what each player knows.
for (const p of BAND) p.knowledge.push(...(SCIENCE[p.id] ?? []));

export const playerById = (id: string): BandPlayer | undefined => BAND.find((p) => p.id === id);
export const playerForRole = (role: BandRole): BandPlayer => BAND.find((p) => p.role === role)!;

/** What every player knows about Chora and Plajah — the studio they work in. */
export const STUDIO_KNOWLEDGE: KnowledgeEntry[] = [
  { topic: 'chora', keys: ['arm', 'record', 'keyboard', 'midi', 'play live'], text: 'Arm a track (the red dot on its header) and your MIDI keyboard or the computer keys play it; press record and Chora writes the notes into a clip. Several audio inputs can be armed at once; instruments arm one at a time.' },
  { topic: 'chora', keys: ['piano roll', 'edit notes', 'velocity', 'quantize', 'articulation lane'], text: 'Double-click a clip to open the piano roll: drag notes, draw velocities, set articulations per note and draw MPE expression (bend, pressure, timbre). Every take the band prints is ordinary notes — edit it like your own playing.' },
  { topic: 'chora', keys: ['score', 'notation', 'sheet music', 'musicxml'], text: 'The Roll | Score toggle shows any instrument clip as notation, and it exports to MusicXML so you can open the band\'s parts in notation software or hand them to real players.' },
  { topic: 'chora', keys: ['meka', 'pads', 'scenes', 'sections', 'song mode'], text: 'MEKA is Chora\'s groovebox: 16 pads per Group, patterns per Group, scenes that launch a pattern on every Group, and song sections that write the timeline for you.' },
  { topic: 'chora', keys: ['glass', 'channel rack', 'step', 'graph'], text: 'Glass is the channel rack: every pad as a row of steps with a graph editor under it for velocity, pitch, pan, filter and tail per hit — great for tweaking a drum take.' },
  { topic: 'chora', keys: ['loop', 'region', 'cycle', 'timeline'], text: 'Drag on the Timeline ruler to set the loop region. The band jams over the loop, and "Write region" composes a full take for exactly those bars.' },
  { topic: 'chora', keys: ['council', 'composer', 'compose', 'melody', 'lyrics'], text: 'The composer council (Timeline → Council · Notation) writes melodies and parts for a region from how you say it should feel, reading your lyrics and every track. The band plays with what the council wrote, and the council can write over what the band played.' },
  { topic: 'chora', keys: ['key', 'tempo', 'meter', 'time signature', 'tempo map'], text: 'Set the song key in the transport — the band, the piano roll\'s scale highlighting and the council all read it. Tempo and meter changes on the tempo track are followed by every player.' },
  { topic: 'chora', keys: ['automation', 'macro', 'filter sweep', 'volume'], text: 'Show a track\'s automation lanes to draw volume, pan, sends and instrument macros over time — a filter sweep on Nova\'s synth, a swell on the section.' },
  { topic: 'chora', keys: ['mixer', 'sends', 'reverb', 'inserts', 'fx'], text: 'The mixer gives every track inserts and two sends (FX 1, FX 2) — put a reverb on a send and give the horns and strings some room.' },
  { topic: 'chora', keys: ['master', 'mastering', 'mastering desk', 'loudness', 'release'], text: 'When the song\'s done, the Mastering Desk handles EQ, dynamics, loudness and Red Book / vinyl / tape prep, and the Release Desk gets it out to the world.' },
  { topic: 'chora', keys: ['inputs', 'asio', 'studiolive', 'mixer link', 'multitrack'], text: 'The Inputs panel records every channel of an audio interface or console (ASIO) at once, one track per channel — play along with the band and record your real instruments over them.' },
  { topic: 'chora', keys: ['hum', 'sing', 'beatbox', 'voice', 'mic'], text: 'Hum or sing into the mic and Chora turns it into MIDI; beatbox and it becomes drum hits. Hum the band a melody and then direct them around it.' },
  { topic: 'chora', keys: ['jam', 'collaborate', 'share', 'together', 'co-edit'], text: 'Shared projects are live: collaborators see each other\'s edits and can jam in real time, each on their own instrument. The band plays for whoever is producing.' },
  { topic: 'chora', keys: ['conservatory', 'learn', 'ear gym', 'lesson', 'practice', 'school', 'academia'], text: 'Plajah\'s Conservatory is the music school: Ear Gym for intervals and chords, Staff Sprint for reading, Music Math, and a scope-and-sequence that goes all the way up. Ask any of us for a lesson and we\'ll play the examples right here in your session.' },
  { topic: 'chora', keys: ['plajah', 'publish', 'release', 'fans', 'listening party', 'stream'], text: 'Plajah is where the music goes next: publish to your profile, host a listening party with live chat and polls, and Music Intelligence reads your song and album after upload.' },
];
