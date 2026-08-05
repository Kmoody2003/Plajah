// ─────────────────────────────────────────────────────────────────────────────
// instrumentPrimers.ts — Blueprint Part 4.5: "how each orchestra/band instrument
// works, its range and its roles."
//
// Seed data for <InstrumentPrimers>. Each entry carries only the curated facts a
// Wikipedia blurb will not give you cleanly — written range, ensemble role, a
// one-line character sketch — and defers the photograph and the encyclopaedic
// history to a live Wikipedia fetch via `wikiSlug` (the same fetchWiki() the
// museum halls use).
//
// wikiSlug = the final path segment of en.wikipedia.org/wiki/<slug>.
// ─────────────────────────────────────────────────────────────────────────────

export type InstrumentFamilyId =
  | 'strings' | 'woodwind' | 'brass' | 'percussion' | 'keys' | 'voice' | 'electronic';

export interface InstrumentFamily {
  id: InstrumentFamilyId;
  label: string;
  blurb: string;
  /** How the family makes sound, in one sentence — the physics. */
  mechanism: string;
}

export interface Instrument {
  id: string;
  name: string;
  family: InstrumentFamilyId;
  /** Sounding range in scientific pitch notation, e.g. 'G3 – E7'. */
  range: string;
  /** What this instrument is FOR in an ensemble. */
  role: string;
  /** A character sketch — what it sounds like and why you would reach for it. */
  blurb: string;
  wikiSlug: string;
  videoId?: string;
  /** Transposing instruments: what's written vs what sounds. */
  transposition?: string;
}

export const INSTRUMENT_FAMILIES: InstrumentFamily[] = [
  {
    id: 'strings', label: 'Strings',
    blurb: 'The heart of the orchestra — the only family that can play continuously for hours without tiring, and the one every other section is balanced against.',
    mechanism: 'A stretched string is set vibrating by a drawn bow, a plucked finger or a struck hammer, and a hollow body amplifies it.',
  },
  {
    id: 'woodwind', label: 'Woodwind',
    blurb: 'Individual voices rather than a blended choir. Each woodwind has a distinct personality and is usually written for as a soloist even inside a tutti.',
    mechanism: 'A column of air inside a tube is set vibrating — by an edge, a single reed or a double reed — and its length is changed by opening and closing holes.',
  },
  {
    id: 'brass', label: 'Brass',
    blurb: 'The power and the ceremony. Brass carries harmonic weight, announces arrivals, and can overwhelm every other section on the stage.',
    mechanism: 'The player\'s buzzing lips act as the vibrating source; valves or a slide change the length of tubing to select a different harmonic series.',
  },
  {
    id: 'percussion', label: 'Percussion',
    blurb: 'The oldest family and the largest — anything struck, shaken or scraped. It supplies time, colour, punctuation and, in most modern music, the foundation.',
    mechanism: 'A membrane, bar, plate or body is struck and allowed to ring; pitch may be definite (timpani, marimba) or indefinite (snare, cymbal).',
  },
  {
    id: 'keys', label: 'Keyboards',
    blurb: 'One player, many notes. Keyboards are the instruments on which harmony was theorised, and they cross every category of sound production.',
    mechanism: 'A keyboard is an interface, not a sound source — the same layout drives hammers, plectra, pipes, tines, tape or oscillators.',
  },
  {
    id: 'voice', label: 'Voice',
    blurb: 'The instrument everyone owns. Every other instrument in this list is, in some sense, an attempt to do something the voice does.',
    mechanism: 'Air from the lungs sets the vocal folds vibrating; the throat, mouth and nasal cavities filter that buzz into vowels and timbre.',
  },
  {
    id: 'electronic', label: 'Electronic',
    blurb: 'Instruments whose sound has no acoustic origin at all — generated, sampled or synthesised, and shaped by circuits and code.',
    mechanism: 'A waveform is generated or replayed electrically, then filtered, enveloped and amplified — the sound exists first as voltage or numbers.',
  },
];

export const INSTRUMENTS: Instrument[] = [
  // ── Strings ────────────────────────────────────────────────────────────────
  {
    id: 'violin', name: 'Violin', family: 'strings', wikiSlug: 'Violin',
    range: 'G3 – A7 (and higher in harmonics)',
    role: 'The orchestra\'s soprano. Split into firsts and seconds — firsts usually carry the melody, seconds the inner harmony and rhythmic figuration.',
    blurb: 'Four strings tuned in fifths (G-D-A-E). Capable of the fastest passagework in the orchestra and of a sustained singing tone that survives being doubled by sixteen other players. The body design settled in Cremona around 1600 and has essentially never been improved on.',
  },
  {
    id: 'viola', name: 'Viola', family: 'strings', wikiSlug: 'Viola',
    range: 'C3 – E6',
    role: 'The inner voice. Fills harmony between the violins and cellos, and supplies a darker, more veiled colour when exposed.',
    blurb: 'Tuned a fifth below the violin (C-G-D-A) and read in alto clef. Acoustically the viola is "too small" for its range — a proportionally correct instrument would be unplayable under the chin — and that compromise is exactly what gives it its husky, slightly hollow tone.',
  },
  {
    id: 'cello', name: 'Cello', family: 'strings', wikiSlug: 'Cello',
    range: 'C2 – C6',
    role: 'Bass line and tenor melody at once. The cello section holds the harmonic floor with the basses and takes some of the most lyrical writing in the repertoire.',
    blurb: 'Its range corresponds closely to the human voice across tenor and bass, which is a large part of why the cello reads as the most vocal instrument in the orchestra. Bach\'s six unaccompanied suites are the foundational solo repertoire.',
  },
  {
    id: 'double-bass', name: 'Double Bass', family: 'strings', wikiSlug: 'Double_bass',
    range: 'E1 – G4 (sounds an octave below written)',
    transposition: 'Written an octave higher than it sounds.',
    role: 'The fundamental. In the orchestra it doubles the cello an octave down; in jazz and popular music it defines both the harmony\'s root and the rhythmic pulse.',
    blurb: 'Tuned in fourths rather than fifths because the string lengths would otherwise be unplayable. It is the only orchestral string instrument descended from the viol family, and the only one that spends half its life being plucked rather than bowed.',
  },
  {
    id: 'harp', name: 'Harp', family: 'strings', wikiSlug: 'Harp',
    range: 'C1 – G7',
    role: 'Colour, arpeggiation and the glissando. Rarely structural, but instantly recognisable and impossible to substitute.',
    blurb: 'The modern concert harp has 47 strings and seven pedals, each with three positions, so a single pedal changes every octave of one letter name at once. Chromatic writing must therefore be planned around pedal changes — the harp is the instrument that most rewards a composer who understands its mechanism.',
  },
  {
    id: 'guitar', name: 'Guitar', family: 'strings', wikiSlug: 'Guitar',
    range: 'E2 – E6 (sounds an octave below written)',
    transposition: 'Notated an octave higher than it sounds.',
    role: 'Everything. Rhythm, harmony, melody and bass, in nearly every popular tradition on earth.',
    blurb: 'Six strings tuned in fourths with one third between the G and B, an irregularity that makes chord shapes possible at the cost of scale-pattern consistency. Electrification in the 1930s turned it from an accompaniment instrument into the dominant melodic voice of the 20th century.',
  },
  {
    id: 'electric-bass', name: 'Electric Bass', family: 'strings', wikiSlug: 'Bass_guitar',
    range: 'E1 – C5 (sounds an octave below written)',
    transposition: 'Notated an octave higher than it sounds.',
    role: 'The hinge between rhythm and harmony. It tells you what the chord is and where the beat lands, at the same time.',
    blurb: 'Leo Fender\'s 1951 Precision Bass gave bassists frets, portability and volume in one object, and reshaped popular music arrangement within a decade. James Jamerson at Motown and Carol Kaye in Los Angeles wrote the vocabulary everyone still uses.',
  },

  // ── Woodwind ───────────────────────────────────────────────────────────────
  {
    id: 'flute', name: 'Flute', family: 'woodwind', wikiSlug: 'Western_concert_flute',
    range: 'C4 – D7',
    role: 'The top of the woodwind choir. Doubles violin melodies to add brightness, and provides the clearest, most penetrating soft line in the orchestra.',
    blurb: 'The only orchestral woodwind with no reed — the player splits an airstream against the edge of the embouchure hole. Theobald Boehm\'s 1847 key system placed tone holes acoustically rather than where fingers naturally reach, and every modern woodwind borrowed from it.',
  },
  {
    id: 'oboe', name: 'Oboe', family: 'woodwind', wikiSlug: 'Oboe',
    range: 'B♭3 – A6',
    role: 'The orchestra\'s tuning reference and its most plaintive solo voice. Its pitch is exceptionally stable, which is why everyone tunes to its A.',
    blurb: 'A double reed — two cane blades vibrating against each other — in a narrow conical bore, producing a reedy, nasal, penetrating tone that cuts through any texture. Players make their own reeds, and the reed determines almost everything about how the instrument responds.',
  },
  {
    id: 'clarinet', name: 'Clarinet', family: 'woodwind', wikiSlug: 'Clarinet',
    range: 'D3 – B♭6 (B♭ instrument, sounding)',
    transposition: 'B♭ clarinet sounds a major second below written; A clarinet a minor third below.',
    role: 'The woodwind chameleon — the widest dynamic range and the largest usable compass of any wind instrument, with three distinctly different-sounding registers.',
    blurb: 'A single reed on a cylindrical bore, which acoustically overblows at the twelfth rather than the octave — the reason its fingering system is more complex than the flute\'s and the reason its low chalumeau register sounds like a different instrument from its bright clarion.',
  },
  {
    id: 'bassoon', name: 'Bassoon', family: 'woodwind', wikiSlug: 'Bassoon',
    range: 'B♭1 – E5',
    role: 'The bass of the woodwind choir, and a tenor soloist of unexpected lyricism. Also the orchestra\'s reliable comic voice.',
    blurb: 'Over eight feet of conical bore folded in half, with a double reed on a curved metal crook. Its fingering system was never fully rationalised, so bassoonists learn a large number of irregular alternate fingerings. The opening of The Rite of Spring puts it at the very top of its range on purpose — it sounds strained, and that is the effect.',
  },
  {
    id: 'saxophone', name: 'Saxophone', family: 'woodwind', wikiSlug: 'Saxophone',
    range: 'Alto: D♭3 – A♭5 sounding; tenor a fourth lower',
    transposition: 'Alto/baritone in E♭, soprano/tenor in B♭ — all read from the same fingerings.',
    role: 'The lead voice of jazz and the backbone of the concert band; in the orchestra, an occasional and always deliberate guest.',
    blurb: 'Adolphe Sax patented it in 1846: a single reed like a clarinet, a conical bore like an oboe, a metal body, and a family that all share fingerings so a player can move between sizes. It never won a permanent orchestral seat and instead became the defining melodic instrument of American music.',
  },
  {
    id: 'piccolo', name: 'Piccolo', family: 'woodwind', wikiSlug: 'Piccolo',
    range: 'D5 – C8 (sounds an octave above written)',
    transposition: 'Sounds one octave higher than written.',
    role: 'The extreme top. One piccolo can be heard over a full orchestra playing fortissimo, which makes it a weapon to be used sparingly.',
    blurb: 'Half the length of a concert flute and correspondingly an octave higher, with no foot joint. Its top octave sits where human hearing is most sensitive, which is why it is simultaneously the most piercing and the hardest instrument in the orchestra to play in tune.',
  },
  {
    id: 'recorder', name: 'Recorder', family: 'woodwind', wikiSlug: 'Recorder_(musical_instrument)',
    range: 'Soprano: C5 – D7',
    role: 'The dominant wind instrument of the Renaissance and Baroque, and now the standard first instrument for children worldwide.',
    blurb: 'A fipple flute — a duct directs the air against the edge, so unlike a transverse flute it sounds instantly with no embouchure. That accessibility is why it was displaced from professional use by the more expressive transverse flute, and exactly why it survives as the world\'s teaching instrument.',
  },

  // ── Brass ──────────────────────────────────────────────────────────────────
  {
    id: 'trumpet', name: 'Trumpet', family: 'brass', wikiSlug: 'Trumpet',
    range: 'F♯3 – D6 (B♭ instrument, sounding)',
    transposition: 'B♭ trumpet sounds a major second below written.',
    role: 'The brass soprano and the orchestra\'s herald. Melody, fanfare, and the top of every brass chord.',
    blurb: 'A cylindrical bore for most of its length flaring to a bell, giving a bright, focused, brilliant tone. Valves arrived around 1815; before that, trumpets could only play notes in the harmonic series of their tubing, which is why Baroque trumpet parts live so high — the harmonics are close enough together up there to form a scale.',
  },
  {
    id: 'french-horn', name: 'French Horn', family: 'brass', wikiSlug: 'French_horn',
    range: 'B1 – F5 (sounds a perfect fifth below written in F)',
    transposition: 'Horn in F sounds a perfect fifth below written.',
    role: 'The bridge instrument. It blends with both woodwind and brass, which is why it sits between them and gets some of the warmest writing in the repertoire.',
    blurb: 'Twelve to thirteen feet of conical tubing coiled tightly, played with the right hand inside the bell — a survival of the hand-horn technique used to bend natural notes before valves. Its harmonics are so closely spaced in the upper register that it is widely considered the hardest orchestral instrument to play accurately.',
  },
  {
    id: 'trombone', name: 'Trombone', family: 'brass', wikiSlug: 'Trombone',
    range: 'E2 – F5 (tenor; non-transposing)',
    role: 'Harmonic weight and the sacred. Trombone choirs were associated with church and the supernatural long before they became orchestral regulars.',
    blurb: 'The only brass instrument with a continuously variable length, so it can play a true glissando and can adjust intonation infinitely rather than being locked to valve compromises. Its design has changed less in five centuries than any other instrument here.',
  },
  {
    id: 'tuba', name: 'Tuba', family: 'brass', wikiSlug: 'Tuba',
    range: 'D1 – F4',
    role: 'The bass foundation of the brass section, and — in the acoustic recording era and in New Orleans brass bands — the bass of the whole ensemble.',
    blurb: 'The youngest of the standard orchestral brass, patented in 1835. A wide conical bore gives it a round, dark tone with far more agility than its size suggests; solo tuba writing consistently surprises listeners who expect only oompah.',
  },
  {
    id: 'cornet', name: 'Cornet', family: 'brass', wikiSlug: 'Cornet',
    range: 'F♯3 – C6 (B♭ instrument, sounding)',
    transposition: 'B♭ cornet sounds a major second below written.',
    role: 'The lead voice of the brass band and of early jazz — mellower and more flexible than the trumpet it was eventually displaced by.',
    blurb: 'More conical than a trumpet, which rounds the tone and softens the attack. Louis Armstrong began on cornet and switched to trumpet in the late 1920s; the change in his recorded sound is audible and is part of why the trumpet won.',
  },
  {
    id: 'euphonium', name: 'Euphonium', family: 'brass', wikiSlug: 'Euphonium',
    range: 'E1 – B♭4',
    role: 'The tenor lyric voice of the wind band — effectively the cello of the concert band.',
    blurb: 'A wide conical bore in the tenor range gives it a warm, singing tone with a smooth, easy upper register. It has almost no orchestral repertoire and an enormous band and brass-band one, which is why great euphonium playing is one of the best-kept secrets in music.',
  },

  // ── Percussion ─────────────────────────────────────────────────────────────
  {
    id: 'timpani', name: 'Timpani', family: 'percussion', wikiSlug: 'Timpani',
    range: 'D2 – A3 across a standard set of four',
    role: 'The orchestra\'s bass drum and its harmonic anchor. Timpani reinforce the tonic and dominant and control the rhythmic weight of a tutti.',
    blurb: 'The only standard orchestral drums with definite pitch, tuned by a pedal that changes head tension while playing. Beethoven was the first to treat them as a genuinely compositional voice rather than a reinforcement of the brass.',
  },
  {
    id: 'snare-drum', name: 'Snare Drum', family: 'percussion', wikiSlug: 'Snare_drum',
    range: 'Indefinite pitch',
    role: 'Articulation and the backbeat. In the orchestra it supplies military and rhythmic punctuation; in popular music it is the single most important sound after the kick drum.',
    blurb: 'Wires stretched across the lower head rattle sympathetically, converting a dull thud into a crisp crack with a burst of noise. Everything about a record\'s era is legible in its snare sound — dry and small in the 1960s, enormous with gated reverb in the 1980s, sampled and layered now.',
  },
  {
    id: 'drum-kit', name: 'Drum Kit', family: 'percussion', wikiSlug: 'Drum_kit',
    range: 'Indefinite pitch',
    role: 'One player performing the job of an entire percussion section — timekeeping, accent, dynamics and form all at once.',
    blurb: 'Assembled in New Orleans in the early 1900s when small venues could not afford separate players, and made possible by the bass drum pedal. Its evolution tracks the whole of popular music: press rolls in early jazz, ride-cymbal timekeeping in bebop, backbeat in rock, the interlock of funk, and the programmed grid of hip-hop.',
  },
  {
    id: 'marimba', name: 'Marimba', family: 'percussion', wikiSlug: 'Marimba',
    range: 'C2 – C7 on a five-octave instrument',
    role: 'The lyric melodic percussion instrument — warm, sustaining, and capable of full four-mallet harmony from a single player.',
    blurb: 'Rosewood or synthetic bars over tuned resonator tubes. It descends from African and Central American xylophone traditions, arriving in the concert hall via Guatemala and Mexico, and now carries a large and fast-growing solo repertoire.',
  },
  {
    id: 'vibraphone', name: 'Vibraphone', family: 'percussion', wikiSlug: 'Vibraphone',
    range: 'F3 – F6',
    role: 'Jazz\'s melodic percussion voice, and the orchestra\'s source of shimmering sustained colour.',
    blurb: 'Aluminium bars, a sustain pedal like a piano, and motor-driven discs at the top of each resonator that open and close to produce the tremolo the instrument is named for. Lionel Hampton and later Milt Jackson and Bobby Hutcherson made it a serious improvising instrument.',
  },
  {
    id: 'cymbals', name: 'Cymbals', family: 'percussion', wikiSlug: 'Cymbal',
    range: 'Indefinite pitch',
    role: 'Climax, sustain and continuous rhythmic wash. On a kit the ride carries the pulse and the hi-hat carries the subdivision.',
    blurb: 'Spun and hammered bronze alloy, whose overtone content is deliberately inharmonic — a cymbal has no fundamental, which is why it can sit on top of any chord. Turkish manufacturing methods dating to the 17th century are still the basis of most professional cymbals.',
  },
  {
    id: 'congas', name: 'Congas', family: 'percussion', wikiSlug: 'Conga',
    range: 'Indefinite pitch, tuned relative to each other',
    role: 'Hand-drum foundation in Afro-Cuban music and a colour instrument everywhere else. The tumbao pattern is one of the load-bearing rhythms of the Americas.',
    blurb: 'Tall, narrow, single-headed drums of Afro-Cuban origin, played with a vocabulary of distinct hand strokes — open, slap, muff, heel-toe — each with its own timbre. A conguero is producing five or six different sounds from one drumhead.',
  },

  // ── Keys ───────────────────────────────────────────────────────────────────
  {
    id: 'piano', name: 'Piano', family: 'keys', wikiSlug: 'Piano',
    range: 'A0 – C8 (88 keys)',
    role: 'Soloist, accompanist, composer\'s tool and rhythm-section instrument. The widest range of any acoustic instrument in common use.',
    blurb: 'Bartolomeo Cristofori\'s escapement action (c. 1700) let a hammer strike and immediately fall away, so for the first time a keyboard could be loud or soft depending on touch — hence gravicembalo col piano e forte. Almost all Western music theory since is thought in terms of this layout.',
  },
  {
    id: 'harpsichord', name: 'Harpsichord', family: 'keys', wikiSlug: 'Harpsichord',
    range: 'Typically F1 – F6 depending on the instrument',
    role: 'The continuo instrument of the Baroque — realising figured bass and holding the ensemble together harmonically and rhythmically.',
    blurb: 'Strings are plucked by a quill or plastic plectrum, so dynamics do not respond to touch at all. Expression comes from articulation, ornamentation, and registration stops. Its inability to swell is precisely what the piano was invented to fix.',
  },
  {
    id: 'pipe-organ', name: 'Pipe Organ', family: 'keys', wikiSlug: 'Pipe_organ',
    range: 'C1 – C8 and beyond, via 32′ to 2′ stops',
    role: 'The instrument of the church and the largest instrument ever built. Multiple manuals plus a pedalboard let one player control a whole orchestra of ranks.',
    blurb: 'Air is pushed through tuned pipes; stops select which ranks sound, and stop lengths (16′, 8′, 4′) place a rank an octave below, at, or above written pitch. Because tone is set by registration rather than touch, organ playing is as much orchestration as performance.',
  },
  {
    id: 'rhodes', name: 'Fender Rhodes', family: 'keys', wikiSlug: 'Rhodes_piano',
    range: 'E1 – E6 on a 73-key Stage',
    role: 'The electric keyboard sound of jazz fusion, 1970s soul and, through sampling, a very large share of modern R&B and neo-soul.',
    blurb: 'Hammers strike thin metal tines whose vibration is captured by electromagnetic pickups, producing a bell-like tone that gets a distinctive growl when played hard. Harold Rhodes designed the first version from aircraft parts to teach piano to wounded servicemen.',
  },
  {
    id: 'hammond-organ', name: 'Hammond Organ', family: 'keys', wikiSlug: 'Hammond_organ',
    range: 'C2 – C7 across two 61-note manuals',
    role: 'Gospel, blues, soul and jazz organ — a one-person rhythm section when the pedals are played.',
    blurb: 'Ninety-one spinning tonewheels generate near-sine waves that drawbars mix additively, so the player builds a timbre in real time. Paired with a Leslie rotating speaker cabinet, whose Doppler swirl is inseparable from the sound. Sold to churches as a cheap organ substitute; adopted instead by Jimmy Smith and every gospel church in America.',
  },
  {
    id: 'accordion', name: 'Accordion', family: 'keys', wikiSlug: 'Accordion',
    range: 'F2 – A6 on a full piano accordion',
    role: 'A portable one-person band — melody, chords and bass simultaneously — central to folk traditions across Europe, the Americas and beyond.',
    blurb: 'Bellows push air past free reeds, so unlike an organ the player controls dynamics continuously with the bellows arm. Its bass side uses a Stradella system where single buttons trigger whole chords, which is why an accordionist can accompany themselves without thinking about voicings.',
  },

  // ── Voice ──────────────────────────────────────────────────────────────────
  {
    id: 'soprano', name: 'Soprano', family: 'voice', wikiSlug: 'Soprano',
    range: 'Roughly C4 – C6, with extensions well above',
    role: 'The top line of the choir and, in opera, usually the protagonist.',
    blurb: 'Subdivided by weight and agility rather than range alone — coloratura, lyric, spinto, dramatic — because the repertoire demands very different things of voices that share the same notes. Above roughly F5 vowels become physically hard to differentiate, which is why high soprano text is famously unintelligible.',
  },
  {
    id: 'alto', name: 'Alto / Contralto', family: 'voice', wikiSlug: 'Contralto',
    range: 'Roughly F3 – F5',
    role: 'The inner harmony of the choir — the line most responsible for whether a chord sounds warm or thin.',
    blurb: 'True contraltos are genuinely rare; most choral alto parts are sung by mezzo-sopranos. The register is rich in the lower middle and has a distinctive chest quality that gospel and soul singing exploits directly.',
  },
  {
    id: 'tenor', name: 'Tenor', family: 'voice', wikiSlug: 'Tenor',
    range: 'Roughly C3 – C5',
    role: 'The male lead in opera and the highest common male choral part. In gospel and soul, the register where the shout lives.',
    blurb: 'The name comes from the medieval tenor voice that "held" the chant while others moved around it. The modern high tenor with a full chest-voice top note dates only to the 19th century — before Duprez\'s famous high C from the chest in 1837, that note would have been sung in falsetto.',
  },
  {
    id: 'bass-voice', name: 'Bass', family: 'voice', wikiSlug: 'Bass_(voice_type)',
    range: 'Roughly E2 – E4',
    role: 'The harmonic foundation of every choral texture. The bass line determines the inversion and therefore the stability of every chord above it.',
    blurb: 'Distinguished by weight as much as by range — a basso profondo, a Russian oktavist reaching below the staff, and a lyric bass-baritone are different instruments. In a cappella and doo-wop, the bass voice functions as the actual bass instrument.',
  },
  {
    id: 'countertenor', name: 'Countertenor', family: 'voice', wikiSlug: 'Countertenor',
    range: 'Roughly G3 – E5, largely in falsetto register',
    role: 'The alto and mezzo roles of the Baroque, and an increasingly common modern operatic voice.',
    blurb: 'A male singer using a developed falsetto or reinforced head register to sing in the alto range. The 20th-century revival — Alfred Deller onward — restored a huge body of Handel and Purcell repertoire originally written for castrati or high male altos.',
  },

  // ── Electronic ─────────────────────────────────────────────────────────────
  {
    id: 'theremin', name: 'Theremin', family: 'electronic', wikiSlug: 'Theremin',
    range: 'Roughly 3–5 octaves, continuous and unfretted',
    role: 'The first widely known electronic instrument, and still the only significant one played without being touched.',
    blurb: 'Two antennae generate electromagnetic fields; the player\'s hand position alters the capacitance, changing pitch on one antenna and volume on the other. Léon Theremin demonstrated it in 1920. Because there are no discrete pitches at all, playing it in tune is notoriously difficult.',
  },
  {
    id: 'moog', name: 'Analogue Synthesiser', family: 'electronic', wikiSlug: 'Synthesizer',
    range: 'Effectively unlimited; typically 5 octaves of keyboard',
    role: 'A designed instrument rather than a discovered one — the player builds the timbre as well as playing the notes.',
    blurb: 'Subtractive synthesis: oscillators generate harmonically rich waveforms, a filter removes content, and envelopes shape amplitude and filter over time. Robert Moog\'s voltage-control standard made modules from any maker interoperable, and Wendy Carlos\'s Switched-On Bach (1968) proved the idea to the public.',
  },
  {
    id: 'sampler', name: 'Sampler', family: 'electronic', wikiSlug: 'Sampler_(musical_instrument)',
    range: 'Whatever is recorded, transposed across the keyboard',
    role: 'Turns any recorded sound into a playable instrument. The foundational production tool of hip-hop and of most modern music.',
    blurb: 'The Fairlight CMI (1979) and Synclavier were studio-only luxuries; the E-mu SP-1200 and Akai MPC60 — the latter designed with Roger Linn — put chopping and sequencing in the hands of producers and defined how hip-hop is made. Its pads-and-swing workflow remains the standard interface for programmed rhythm.',
  },
  {
    id: 'tr808', name: 'Drum Machine (TR-808)', family: 'electronic', wikiSlug: 'Roland_TR-808',
    range: 'Indefinite; the kick is tunable into the sub range',
    role: 'Programmed rhythm. The 808 kick is a tuned sine sweep, so in modern production it functions as both drum and bass note.',
    blurb: 'Released in 1980, sold poorly for failing to sound like real drums, discontinued in 1983, and then adopted precisely because it sounded like nothing else. Its step-sequencer interface — sixteen buttons, one per sixteenth note — shaped how a generation of producers conceive of a bar.',
  },
  {
    id: 'turntable', name: 'Turntables', family: 'electronic', wikiSlug: 'Turntablism',
    range: 'Whatever is on the record, ±8% and beyond via pitch control',
    role: 'A performance instrument for manipulating existing recordings — the technique on which hip-hop was founded.',
    blurb: 'The Technics SL-1200\'s direct drive, high torque and pitch fader made beatmatching and back-cueing reliable, and the crossfader made cutting and scratching possible. Herc\'s break extension, Flash\'s cutting and Theodore\'s scratch are the core techniques, and they are all about a decade older than the sampler.',
  },
  {
    id: 'daw', name: 'The DAW', family: 'electronic', wikiSlug: 'Digital_audio_workstation',
    range: 'Unbounded — the modern studio as a single instrument',
    role: 'Recording, editing, sequencing, synthesis, mixing and mastering in one environment. For most music made today, the DAW is the instrument.',
    blurb: 'Its representation of music — a horizontal timeline of coloured blocks and a piano roll of rectangles — is not neutral. Grid quantisation, copy-and-paste arrangement and infinite undo all quietly shape what music gets written, in the same way notation shaped what got written for four centuries before it.',
  },
];

/** All instruments in one family, in authored order. */
export const instrumentsByFamily = (family: InstrumentFamilyId): Instrument[] =>
  INSTRUMENTS.filter(i => i.family === family);

export default INSTRUMENTS;
