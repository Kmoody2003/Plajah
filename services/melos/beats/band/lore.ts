// Chora Session Band — instrument lore. What each player knows about the instrument in their hands,
// beyond how to play it: the physics of how it makes sound, what it's made of and why, how it's built
// and tuned, its physical properties, its relatives and variants across cultures and nations, the
// music it makes and the traditions around it. Sourced reference data (each entry lists what it was
// written from). loreKnowledge() turns it into the players' searchable knowledge, so the built-in
// answers, the AI teacher's grounding and the Conservatory Faculty all draw on it. Pure data.

import type { KnowledgeEntry } from './roster';
import { DRUMS } from '../../instruments/soma/drumKnowledge';

export interface LoreVariant { name: string; where: string; how: string }
export interface LoreSource { title: string; publisher: string; url: string }

export interface InstrumentLore {
  id: string;
  name: string;
  /** Band player ids who carry this knowledge. */
  players: string[];
  family: string;
  physics: string[];
  materials: string[];
  construction: string[];
  tuning: string[];
  properties: { range: string; size: string; other: string[] };
  variants: LoreVariant[];
  music: string[];
  traditions: string[];
  sources: LoreSource[];
}

export const INSTRUMENT_LORE: InstrumentLore[] = [
{
    id: 'drum-kit',
    name: 'Drum kit',
    players: ['marcus'],
    family: 'Percussion: membranophones (drums) and idiophones (cymbals) played together by one musician',
    physics: [
      'Each drum is a stretched circular membrane on a shell. Struck, the head vibrates in normal modes described mathematically by Bessel functions of a circular membrane, so its overtones are not an evenly spaced harmonic series like a string\'s; this is why drums sound like noisy thumps rather than clear notes. Raising head tension raises pitch and lowers loudness; a larger shell diameter gives a lower pitch, and a deeper shell a louder sound.',
      'A snare drum is a two-headed system: the struck batter head drives the thinner resonant head underneath, which stimulates a set of snare wires held against it. The wires rattle against the head and produce the cracking sound; a strainer lever lets the player disengage them, leaving a tom-like tone. Muffling rings, dots, coatings and two-ply heads damp the head overtones and shorten ring.',
      'A cymbal is a thin, round, curved metal plate. Its bell (cup) gives a higher pinging pitch, the bow carries the ride area near the bell and the crash area toward the edge, and the edge sheds the energy. Larger cymbals are louder with longer sustain; thin cymbals sound fuller, lower and faster to respond; heavier ones have more cut and stick definition; a higher-profile (more bowl-shaped) cymbal sits higher in pitch.',
      'A hi-hat is two cymbals face to face on a stand; the pedal closes them for a short "chick" or lets them ring when open, so one instrument spans very quiet to very loud, tight to washy.',
    ],
    materials: [
      'Cymbals are copper-alloy plates. Traditional fine cymbals use bell bronze (usually stated as about 20 percent tin to 80 percent copper, often called B20), a two-phase alloy that is hard and rather brittle and responds to hammering and lathing. Cheaper or sheet-rolled cymbals use malleable bronze with about 8 percent tin (B8; Paiste calls its version 2002 alloy), some lines use B10 or B12, and the cheapest are brass (about 38 percent zinc in copper). Nickel silver is used for a few bright-sounding cymbals.',
      'Drumheads were originally animal hide (calf, goat). Plastic heads were introduced in the 1950s: Chick Evans is credited with the first plastic head in 1956, and Remo Belli developed polyester (PET/Mylar) heads, marketed from 1957, because they stay in tune through weather changes, whereas calfskin needed re-tuning as humidity changed. Purist jazz players resisted at first; some players now choose rawhide, kangaroo or Kevlar heads again.',
      'Shells are usually wood: sources describe maple as typical of smaller jazz-oriented shells, birch as used for larger rock-oriented kits, and mahogany as raising low frequencies; thicker shells make louder drums. Snare shells may also be metal, acrylic or fibreglass. Sticks are traditionally maple, hickory or oak.',
    ],
    construction: [
      'Wood shells are built in several ways: plies of wood heat- and compression-moulded into a cylinder; a single steam-bent ply glued at one seam; stacked segment rings turned on a lathe; vertical staves glued barrel-style; or a solid hollowed piece. Reinforcement rings may keep the shell round. Heads are held by a hoop (rim) pulled down by tension rods that screw into lugs spaced around the shell, often six to ten per drum, and turned with a drum key.',
      'The modern kit grew out of separate military and orchestral drums. Percussionists began combining drums in the 1860s; the bass drum pedal followed (Sonor introduced a single pedal in 1900; William F. Ludwig patented the first commercially successful system in 1909 with his brother Theobald). In New Orleans in the 1910s and 20s drummers such as Baby Dodds and Zutty Singleton built "trap" setups; Dodds is credited with developing ride-cymbal playing and prompting the raised hi-hat, which stands became available around 1926.',
      'Toms entered the kit early in the 20th century. The first American toms were so-called Chinese tom-toms with tacked-on heads and no tension rods; Slingerland offered fully tunable toms from 1936, in sizes shaped by Gene Krupa\'s ideas (13 x 9 inch mounted and 16 x 16 inch floor became long-standing standards).',
    ],
    tuning: [
      'Drums are tuned by tightening each tension rod in turn so the head is evenly tensioned around the rim; the batter and resonant heads are tuned to taste relative to one another. A tighter head sounds higher and drier, a looser one lower with a longer decay. Drummers shape ring with external muffles (cloth, gel, clip-on mutes), internal mutes, or a pillow or blanket in the bass drum.',
      'Cymbals are not tuned; their pitch is fixed by size, weight, profile and hammering. Hand-hammered cymbals tend to sound darker, lower and richer and vary more from one to the next, while machine-hammered ones are brighter, higher and more consistent. Drummers choose cymbals by sound and weight instead.',
    ],
    properties: {
      range: 'Indefinite pitch. Typical kit sizes: bass drum 22 inch (18 jazz, 20 fusion, 24 rock); snare 14 inch; toms from about 10 to 16 inch; ride 20 to 22 inch (16 to 26 in use); hi-hats 13 to 15 inch.',
      size: 'A five-piece kit has snare, bass drum, three toms, hi-hats and at least a ride and a crash; kits range from tiny cocktail kits to very large setups.',
      other: [
        'Played with sticks, brushes, rutes, mallets or hands; the bass drum and hi-hat are played by foot pedals.',
        'Electronic kits (first built in the early 1970s by Graeme Edge with Brian Groves; Simmons from 1978) use sensor pads, mesh heads and a sound module so the kit can be played quietly or recorded directly.',
      ],
    },
    variants: [
      { name: 'K Zildjian and Turkish cymbal-making', where: 'Istanbul (Constantinople), Turkey', how: 'The Zildjian workshop was founded in Constantinople (dates given as 1618 or 1623) by Avedis Zildjian, an Armenian metalsmith; it made cymbals for Ottoman military (mehter) bands, churches and dancers. K Zildjian cymbals remain a darker, hand-hammered line used by classical and jazz players.' },
      { name: 'China cymbal and Chinese tom-tom', where: 'China, adopted into New Orleans kits', how: 'China-type cymbals and "Chinese" tom-toms were early additions to trap kits; Baby Dodds popularized Chinese cymbals. The word tom-tom itself is traced to Anglo-Indian and Sinhala usage (the Sri Lankan thammattama), not to Chinese.' },
      { name: 'Marching and pipe-band snare', where: 'Switzerland, Britain and military bands worldwide', how: 'A deep, high-tension snare; pipe-band snares have a second set of wires against the batter head. Swiss fife-and-drum groups are sometimes credited with the first written rudiments (Basel, 1610).' },
      { name: 'Cocktail drum kit', where: 'United States', how: 'A compact two-piece kit built for lounge acts: a floor tom played by a pedal beater on its bottom skin stands in for the bass drum, plus a snare and cymbals; used in trad jazz, bebop, rockabilly and jump blues.' },
      { name: 'Timbales and hand drums added to kits', where: 'Cuba and Latin America', how: 'Higher-tuned metal-shell timbales and hand drums can be added to a kit to extend its range, especially in Latin jazz.' },
      { name: 'Electronic drum kit', where: 'United Kingdom and Japan (early makers), now worldwide', how: 'Rubber or mesh pads with triggers feed a sound module that plays synthesized or sampled drum sounds; used for quiet practice, recording and live performance.' },
    ],
    music: [
      'The trap set first served ragtime, Dixieland and early New Orleans jazz, then swing, where the ride cymbal and hi-hat carried the pulse. Drummers named in the sources include Baby Dodds, Zutty Singleton, Ray Bauduc and Gene Krupa; later jazz kit players include Art Blakey, Jo Jones, Buddy Rich, Elvin Jones and Tony Williams.',
      'In rock, pop, blues and rhythm and blues the kit is the core of the rhythm section, usually with a backbeat on the snare on beats 2 and 4. Ringo Starr, Mitch Mitchell and many session players are named as notable users; Ringo Starr\'s 1964 Ed Sullivan Show appearance sharply increased demand for Zildjian cymbals.',
      'A drummer\'s work is grooves plus fills and ornaments; techniques include rimshots, cross-stick (a dry click common in Latin and jazz), ghost notes in funk and R&B, and brushes in soft jazz.',
    ],
    traditions: [
      'The company history says the secret of the alloy was handed down through the family for generations (the recipe passed to Armand Zildjian\'s daughters in 2002, the 14th generation by the company\'s count). The firm moved to Massachusetts in 1927-1929; Robert Zildjian left in 1977 and founded Sabian in 1981.',
      'The silent-film era gave kit drummers a second job as sound-effects players; the arrival of recorded film soundtracks around 1930 ended many of those jobs. Snare rudiments descend from military drumming, where drum calls signalled camp duties.',
    ],
    sources: [
      { title: 'Drum kit', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Drum_kit' },
      { title: 'Cymbal', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cymbal' },
      { title: 'Cymbal alloys', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cymbal_alloys' },
      { title: 'Cymbal making', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cymbal_making' },
      { title: 'Zildjian', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Zildjian' },
      { title: 'Drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Drum' },
      { title: 'Snare drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Snare_drum' },
      { title: 'Tom-tom drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tom-tom_drum' },
      { title: 'Drumhead', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Drumhead' },
      { title: 'Remo', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Remo' },
      { title: 'Vibrations of a circular membrane', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Vibrations_of_a_circular_membrane' },
      { title: 'Electronic drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Electronic_drum' },
    ],
  },
  {
    id: 'hand-percussion',
    name: 'Hand drums and hand percussion',
    players: ['amara'],
    family: 'Membranophones (struck drums), mostly single-headed or double-headed hand-played drums',
    physics: [
      'A membranophone makes sound primarily from a stretched membrane. A drum head is a two-dimensional membrane fixed at its rim, and it vibrates in a set of normal modes, each a standing-wave pattern with its own frequency and nodal lines. The lowest is the fundamental; the others are set by the roots of Bessel functions rather than whole-number multiples, so most drums have inharmonic, noisy overtones.',
      'Where and how the head is struck decides which modes are excited. On the djembe, a bass note struck with the palm near the centre excites the shell\'s air resonance; a tone, struck nearer the edge, emphasizes the (0,1) mode; a slap emphasizes higher modes such as (2,1), (0,2) and (3,1). Muting with a hand or a fingertip suppresses chosen modes, which is how players shape the many strokes of a single drum.',
      'Some goblet and vessel drums behave as Helmholtz resonators: the enclosed air in the shell vibrates at a frequency set by the cavity\'s volume and opening. On the djembe, the bass frequency (reported at 65-80 Hz) depends on shell size and shape and not on skin tension, while tone (about 300-420 Hz) and slap (about 700-1000 Hz) rise as the skin is tightened; overtones reach past 4 kHz.',
      'Indian drums such as the tabla and mridangam load the head with a black paste (syahi, or gab) that changes the natural overtones into near-harmonic ones, giving a clear pitch and a bell-like sound. A larger head gives a lower pitch; higher tension raises pitch.',
    ],
    materials: [
      'Heads are traditionally animal skin: goat is the most common (djembe, bodhran), with cow, antelope, deer, horse or buffalo also used, and fish skin on some daf frame drums. Thicker skins give a warmer sound with more overtones; thin skins are sharper and louder. Synthetic heads (for example FiberSkyn) and plastic heads are used where weather stability or legality matters.',
      'Shells are carved from a single log (the djembe uses dense hardwoods; lenke, Afzelia africana, is prized by the Malinke partly for spiritual reasons, and carvers work the log while it is still moist to avoid splits), built from staves like a barrel (congas, now often fibreglass), made from clay or metal (the tabla\'s bass drum is usually brass or copper; clay is used in Bengal), or are bent wooden frames (frame drums of rosewood, oak or ash). The cajon is a plywood box with a thin tapa as its striking face.',
    ],
    construction: [
      'Hand-drum families are grouped by shape. Goblet or chalice drums (the Egyptian darbuka, the West African djembe) are single-headed with a bulbous body open at the bottom. Frame drums have a head wider than the depth of the frame (bodhran, daf, tar, pandeiro). Hourglass or waisted drums have laced heads whose cords can be squeezed to change pitch (the talking drum, the Japanese tsuzumi, the batá). Barrel and staved drums bulge in the middle (conga). Kettle or vessel drums have a pot body (the tabla bass, the timpani).',
      'Other forms include footed drums, long log drums, friction drums (the Brazilian cuica, the Spanish zambomba), box drums (cajon) and metal drums such as the steel drum. Double-headed drums such as the mridangam (jackfruit-wood body) and batá are laced with leather straps.',
    ],
    tuning: [
      'Before screw-tension hardware, heads were attached and tuned by ropes (djembe), pegs and cords (Ewe drums), knots, or tacked or nailed on and tuned by gently heating the head (traditional congas). Modern congas use a lug and tension-rod system, pioneered in Cuba by Carlos "Patato" Valdes and in the United States by Candido Camero in the early 1950s.',
      'Players also change pitch while playing. A talking drum\'s pitch is raised by squeezing the cords under the arm. The tabla\'s right-hand drum is tuned to the soloist\'s tonic, dominant or subdominant using wooden blocks (gatta) under the straps and light hammer taps, and the heel of the hand bends the pitch of the bass drum. A bodhran player presses the inside of the head with one hand to vary pitch and tone. Mridangam players moisten the large head and apply a semolina paste to lower its pitch.',
    ],
    properties: {
      range: 'Mostly indefinite pitch; some drums (tabla right-hand drum, congas in ensemble with a harmony instrument, timpani) are tuned to specific notes. Pitch falls as head diameter increases.',
      size: 'Varies widely: a djembe is about 30-38 cm across and 58-63 cm tall, weighing roughly 5-13 kg; a tabla right-hand drum is about 15 cm wide and 25 cm tall; bodhrans are 25-65 cm across, mostly 35-45 cm.',
      other: [
        'The djembe can reach over 105 dB sound pressure when tuned to solo pitch.',
        'Head tension also affects the player: a very loose head has less rebound and can bruise the hands.',
      ],
    },
    variants: [
      { name: 'Djembe and dunun', where: 'Mali, Guinea, Senegal and neighbouring West African countries (Mande peoples)', how: 'Rope-tuned goblet drum carved from hardwood and covered with untreated goat skin, played with the dunun bass drums; traditionally associated with the Numu blacksmith caste, although anyone may learn it.' },
      { name: 'Darbuka (tarabuka, doumbek)', where: 'Egypt, Turkey, the Middle East, North Africa and the Balkans', how: 'Single-head goblet drum played under the arm or on the lap with doom (bass), tak (edge) and pa (closed) strokes; Egyptian styles have rounded head edges, Turkish ones exposed edges.' },
      { name: 'Frame drums: bodhran, daf, pandeiro', where: 'Ireland, Iran and Central Asia, Brazil', how: 'The bodhran is a goatskin frame drum played with the hand or a wooden tipper, the daf has jingles and a goat- or fish-skin head, and the Brazilian pandeiro is tunable and fitted with metal jingles for samba and choro.' },
      { name: 'Talking drum, batá and tsuzumi (hourglass drums)', where: 'West Africa (Yoruba, Asante), Cuba, Japan', how: 'Laced two-headed hourglass drums; the talking drum imitates speech tones, batá are used in Yoruba and Santeria worship, and tsuzumi are used in Noh theatre.' },
      { name: 'Tabla and mridangam', where: 'North and South India (Hindustani and Carnatic music)', how: 'Pitched drums with a syahi paste on the head; the mridangam has a jackfruit-wood body, goat, cow or buffalo skins and a paste on the left head for bass.' },
      { name: 'Conga', where: 'Cuba', how: 'Tall staved single-head drum in three sizes (quinto, tres dos, tumba), developed by Cuban people of African descent in the late 19th or early 20th century from Bantu and Yoruba drums.' },
      { name: 'Cajon', where: 'Peru', how: 'Plywood box drum played by slapping the front face; central to Afro-Peruvian music and later adopted in flamenco.' },
      { name: 'Taiko', where: 'Japan', how: 'A broad family of drums, from large nailed-head byo-uchi-daiko carved from a single log of Japanese zelkova to rope- or bolt-tensioned shime-daiko; kumi-daiko ensemble playing developed from 1951.' },
    ],
    music: [
      'West African djembe and dunun ensembles play dialogues in which the highest-pitched djembe takes solo phrases and the others accompany; the Mandinka say a skilled drummer can make the djembe talk. The djembe reached international audiences through Les Ballets Africains (founded 1952 by Fodeba Keita) and national ballets of the 1950s and 60s.',
      'Afro-Cuban music uses conga patterns such as the tumbao (marcha) in son montuno, mambo and salsa, rumba and Latin jazz, and batá drums for sacred and secular music. In Carnatic music the mridangam leads the rhythm section and the thani avartanam is the percussion solo in a concert.',
      'Irish traditional music uses the bodhran (played by Christy Moore, The Chieftains and others); Brazilian samba, choro and capoeira use the pandeiro; flamenco and Afro-Peruvian music use the cajon; Persian and Central Asian music use the daf; Japanese festival and stage music use taiko.',
    ],
    traditions: [
      'Many drums carry social and ritual roles. Talking drums sent messages over distances reported at 6-8 km, relayed by other drummers, in Yoruba and Asante practice. Larger frame drums are often played by men in ceremonies and medium ones by women in many cultures, according to one source. Batá are used in Yoruba religion and Santeria.',
      'Making and learning traditions are often lineage-based: Numu blacksmiths with the djembe, Indian gharana styles for tabla (Delhi and Varanasi differ in strokes), and the Japanese taiko makers who spend years preparing shell and skin. Drum rudiments in the West began in military drumming.',
    ],
    sources: [
      { title: 'Drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Drum' },
      { title: 'Membranophone', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Membranophone' },
      { title: 'Vibrations of a circular membrane', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Vibrations_of_a_circular_membrane' },
      { title: 'Djembe', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Djembe' },
      { title: 'Tabla', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tabla' },
      { title: 'Mridangam', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mridangam' },
      { title: 'Conga', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Conga' },
      { title: 'Goblet drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Goblet_drum' },
      { title: 'Frame drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Frame_drum' },
      { title: 'Talking drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Talking_drum' },
      { title: 'Bodhran', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bodhr%C3%A1n' },
      { title: 'Taiko', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Taiko' },
      { title: 'Cajon', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Caj%C3%B3n' },
      { title: 'Bata drum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bat%C3%A1_drum' },
    ],
  },
  {
    id: 'bass',
    name: 'Bass (electric bass and double bass)',
    players: ['dwayne'],
    family: 'Plucked or bowed string (chordophone): electric bass guitar and the double bass',
    physics: [
      'A string vibrates at a fundamental set by its length, tension and mass per unit length: wave speed is the square root of tension over linear density, and the fundamental is f = (1/2L) times that speed. Longer, heavier, looser strings sound lower. A string alone barely moves air, so each bass adds a radiator: a pickup and amplifier on the electric bass, a large resonant wooden body on the double bass.',
      'The double bass is described as acoustically imperfect: to be acoustically ideal its body would have to be about twice the size of a cello\'s, which would make it unplayable, so it is made smaller and loses some very low response. The electric bass sidesteps this problem; magnetic pickups sense the moving steel string in a magnetic field (Faraday induction) and the sound is made by the amplifier.',
      'Electric bass strings are a core wire with a winding; the winding type changes the tone. Roundwound strings are brighter, flatwound strings smoother and darker, and tapewound and coated types also exist. The lowest note of a four-string bass is E1, about 41 Hz; five-string instruments add a low B (B0, about 31 Hz).',
    ],
    materials: [
      'Double basses are typically carved from maple (back, neck, ribs) with a spruce top and an ebony fingerboard and tailpiece; cheaper basses use laminated (plywood) wood, which resists humidity, heat and rough handling, and fibreglass and willow have also been used. Spruce is chosen for its stiffness-to-weight ratio, which suits soundboards.',
      'Bass strings were catgut until the 20th century. Overwound gut made low notes practical on a smaller string; steel largely replaced gut because it holds pitch better and is louder when bowed, but gut is still used by baroque, rockabilly, traditional blues and bluegrass players for a dark, "thumpy" sound.',
      'Fender\'s Precision Bass used a two-piece laminated ash body (chosen for appearance); alder became standard on sunburst finishes. The neck was a bolted-on maple neck, with rosewood later offered as a fingerboard.',
    ],
    construction: [
      'The double bass stands about 180 cm tall from scroll to endpin (3/4 size is the most widely used). It has f-holes, a carved bridge, a tailpiece, a bass bar and a soundpost inside, and metal machine heads instead of friction pegs. Two outlines are used: the violin form and the viola da gamba form; its lineage is debated, with scholars divided on whether it descends from the viol or the violin family, and some call it a true member of neither.',
      'Leo Fender and George Fullerton developed the first mass-produced electric bass, the Precision Bass, brought to market in October 1951; it was a slab-bodied solid instrument with a single pickup, 34-inch scale and frets, so guitarists could play bass. Paul Tutmarc of Seattle had made an earlier electric bass (the Audiovox Model 736, 1935). The Jazz Bass followed in 1960 with two pickups and a narrower neck, aimed at upright players.',
      'Scale length changes the tone: 30 inches or less is short scale, 32 medium, 34 standard, and 35 long scale, favoured for five-string basses so the low B string resonates better. Kay (the K162, 1952) and Hofner (the 500/1, shown in 1956) also built early basses.',
    ],
    tuning: [
      'Four-string electric basses and double basses are tuned in fourths, E1-A1-D2-G2, the same as the lowest four strings of a guitar one octave lower. The double bass is the only standard bowed orchestral string instrument tuned in fourths rather than fifths. Five-string basses add a low B, and sometimes a high C is added instead.',
      'The double bass is a transposing instrument: its music is written an octave higher than it sounds to avoid ledger lines. Orchestral players often use a C extension that lowers the E string to C1; others tune the E string down to D or C, or play low notes an octave higher.',
    ],
    properties: {
      range: 'Double bass: E1 (about 41 Hz) up to about D5 at the top of the fingerboard; a C extension reaches C1 (about 33 Hz) and a five-string low B reaches B0 (about 31 Hz). Electric bass: E1 upward, plus low B on five-string models.',
      size: 'Double bass about 180-190 cm tall; electric bass scale length typically 34 inches (86 cm).',
      other: [
        'The double bass is fretless and played with a bow (arco), plucked (pizzicato) or slapped; electric basses are usually fretted though fretless versions exist.',
        'Electric basses are quiet acoustically and need amplification via magnetic or piezo pickups.',
      ],
    },
    variants: [
      { name: 'Guitarron mexicano', where: 'Mexico (mariachi)', how: 'A very large, deep-bodied six-string acoustic bass descended from the sixteenth-century Spanish bajo de una, with re-entrant tuning A D G C E A; played with the fingers, it is the bass of mariachi groups and needs no amplification.' },
      { name: 'Washtub bass', where: 'United States (African American jug bands), with versions elsewhere', how: 'A single string stretched from a metal washtub resonator to a staff, pitch changed by pushing or pulling the staff; kin to ground bows found in Africa and Southeast Asia, and tea-chest and box basses exist in many places.' },
      { name: 'Marimbula', where: 'Cuba and the Caribbean (also Mexico, Dominican Republic, Jamaica)', how: 'A plucked box lamellophone that plays the bass role in changui, son, mento and merengue tipico bands.' },
      { name: 'Acoustic bass guitar', where: 'United States', how: 'A hollow-bodied fretted bass; the guitarron was the inspiration for Ernie Ball\'s first modern acoustic bass guitar in 1972.' },
      { name: 'Fretless and extended-range electric basses', where: 'United States and worldwide', how: 'Fretless necks allow glissando and double-bass-like intonation; five-, six-, seven-, eight- and twelve-string basses are also built.' },
      { name: 'Violone', where: 'Europe (from the 15th century)', how: 'A large viol-family instrument from which the double bass is generally regarded as a modern descendant.' },
    ],
    music: [
      'Double bass: the walking bass line of jazz, from the early New Orleans ensembles through swing, bebop and hard bop; bassists Ray Brown, Paul Chambers and Percy Heath influenced James Jamerson. It also anchors blues, rockabilly (slap style, as played by Bill Black with Elvis Presley), bluegrass, tango and the classical orchestra, and gut strings shaped the 1940s-50s sound.',
      'Electric bass: James Jamerson, the bassist on most Motown hits of the 1960s and early 70s (Funk Brothers), played a Fender Precision on "My Girl", "You Can\'t Hurry Love" and many others; Bass Player magazine and Rolling Stone ranked him first among bassists. Larry Graham of Sly and the Family Stone is widely credited with inventing slapping and popping on electric bass.',
      'Jaco Pastorius (Weather Report) brought the electric bass to jazz fusion; Aston "Family Man" Barrett of Bob Marley and the Wailers played a Jazz Bass and led the bass of reggae. In Afro-Cuban music the bass plays the tumbao, a syncopated pattern built on the tresillo rhythm, often landing on the offbeats (bombo and ponche).',
    ],
    traditions: [
      'The role of the bass as rhythmic and harmonic anchor is central to jazz, soul, funk and reggae. Jamerson was largely uncredited in his lifetime; he was inducted into the Rock and Roll Hall of Fame in 2000 among its first sidemen, and a Grammy Lifetime Achievement Award (2004) was given to the Funk Brothers.',
      'Orchestral bassists play with either the French (overhand) or German (Butler) bow, the latter descended from viol practice; bows are 60-75 cm. Many bassists "double" on both electric and double bass.',
    ],
    sources: [
      { title: 'Bass guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bass_guitar' },
      { title: 'Double bass', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Double_bass' },
      { title: 'Fender Precision Bass', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Precision_Bass' },
      { title: 'Fender Jazz Bass', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fender_Jazz_Bass' },
      { title: 'Vibrating string', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Vibrating_string' },
      { title: 'Guitarron mexicano', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Guitarr%C3%B3n_mexicano' },
      { title: 'Washtub bass', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Washtub_bass' },
      { title: 'James Jamerson', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/James_Jamerson' },
      { title: 'Larry Graham', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Larry_Graham' },
      { title: 'Slapping (music)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Slapping_%28music%29' },
      { title: 'Jazz bass', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Jazz_bass' },
      { title: 'Tumbao', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tumbao' },
      { title: 'Aston Barrett', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Aston_Barrett' },
      { title: 'Marimbula', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Marimbula' },
    ],
  },
  {
    id: 'guitar',
    name: 'Guitar (acoustic and electric)',
    players: ['rosa'],
    family: 'Plucked string (chordophone), fretted lute family',
    physics: [
      'A plucked string vibrates at a fundamental set by its length, mass and tension, with overtones close to harmonics of that pitch. On an acoustic guitar the string drives the soundboard through the bridge; the top and the enclosed air then radiate the sound. At low frequencies the body acts as a Helmholtz resonator, and the soundboard, cavity air and outside air are coupled, so every guitar colours the tone differently.',
      'Frets divide the string so that each fret raises pitch by one semitone: consecutive fret distances to the bridge differ by the twelfth root of two (about 1.059463) in 12-tone equal temperament, and the bridge is nudged slightly so the twelfth fret sounds an exact octave despite the extra tension of pressing the string. Standard tuning is E2 (82.41 Hz), A2 (110 Hz), D3 (146.83 Hz), G3 (196 Hz), B3 (246.94 Hz), E4 (329.63 Hz).',
      'An electric guitar needs no resonant body. A magnetic pickup is a permanent magnet (alnico or ferrite) wrapped with thousands of turns of fine copper wire; the moving steel string disturbs the magnetic field and induces a voltage in the coil (Faraday\'s law), which an amplifier boosts. Overdrive and distortion come from pushing a (traditionally tube) amplifier or pedal so the signal clips, shearing off wave peaks and adding sustain and harmonic and inharmonic overtones.',
    ],
    materials: [
      'Soundboards need stiff, light wood, and spruce (Sitka, Adirondack, Engelmann and European spruce from places like the Fiemme Valley) is favoured for its high stiffness-to-weight ratio; red cedar is common on classical guitars. Back and sides, necks and fretboards often use rosewood, mahogany or maple. Brazilian rosewood (Dalbergia nigra) became scarce and is covered by trade restrictions under CITES; in August 2019 CITES announced an exception for rosewood in musical instruments, and East Indian rosewood is now the most widely used. Alternatives include Indian laurel and thermally modified maple (roseacer).',
      'Strings were catgut historically; steel strings arrived in the United States late in the 19th century but only became mainstream after World War II, when nylon (and fluoropolymer such as PVDF) strings also became standard for classical guitars. The Gibson Les Paul has a mahogany body with a carved maple top and a rosewood fretboard.',
    ],
    construction: [
      'Antonio de Torres Jurado (1817-1892), a Spanish luthier based in Seville, set the form of the classical guitar around 1850 by enlarging the body, thinning the soundboard and strengthening it with symmetrical fan bracing; in 1862 he built a guitar with a papier-mache body to show that the top, not the back and sides, makes the sound. Full-size classical guitars have a scale length of about 650 mm, a length Torres established.',
      'C. F. Martin (born in Markneukirchen, Saxony, 1796; established in New York in 1833, moved to Nazareth, Pennsylvania, in 1839) kept X-bracing while Europe moved to fan bracing, which prepared the American guitar for steel strings. Martin introduced the larger dreadnought body in 1916 with the retailer Oliver Ditson for more volume and bass, and the 14-fret neck join on its 000 size.',
      'Electric guitars: the first commercially marketed electrified stringed instrument was the cast aluminium "Frying Pan" lap steel (George Beauchamp and Adolph Rickenbacker, about 1931-32); the electric guitar was patented in 1937. Fender\'s Broadcaster (renamed Telecaster in 1951) was the first mass-produced solid-body in 1950, the Gibson Les Paul followed in 1952, and the Stratocaster, designed 1952-54 by Leo Fender with Bill Carson, Rex Gallion, George Fullerton and Freddie Tavares, arrived in 1954. Les Paul himself built a "log" solid guitar in 1940.',
    ],
    tuning: [
      'Standard tuning is E-A-D-G-B-E; the guitar sounds an octave lower than written. Drop D lowers the sixth string to D, giving an open power chord on the low three strings; it spread from blues and classical players into hard rock and metal (Led Zeppelin\'s "Moby Dick", 1969). Open tunings tune the strings to a chord: open D (D-A-D-F#-A-D), open G, and others used in blues and slide playing.',
      'DADGAD (D2 A2 D3 G3 A3 D4) was popularized by British folk guitarist Davey Graham, who was inspired by hearing an oud player in Morocco; it is closely tied to Celtic music. Hawaiian slack-key (kihoalu, "loosen the key") guitar uses as many as fifty open tunings, once guarded as family secrets. A capo shortens the playable string length to raise pitch; the first patented capo is credited to James Ashborn (1850).',
    ],
    properties: {
      range: 'Standard tuning E2 (82.41 Hz) to E4 (329.63 Hz) open strings; about three to four octaves with frets; written an octave higher than it sounds.',
      size: 'Classical guitar: 650 mm scale, overall length about 965-1016 mm. Steel-string and electric guitars are built in several body shapes (dreadnought, jumbo, archtop, solid body).',
      other: [
        'Classical guitars use nylon strings and a wide neck for fingerstyle playing; steel-string guitars are louder and brighter.',
        'Solid-body electric guitars have no acoustic body, which reduces feedback at volume.',
      ],
    },
    variants: [
      { name: 'Oud', where: 'Arabia, Turkey, Persia and the Middle East', how: 'A fretless, pear-shaped short-neck lute with usually 11 strings in six courses; the ancestor of the European lute, descended from the Persian barbat, and tuned a whole step higher in Turkish practice.' },
      { name: 'Pipa', where: 'China (related: Japanese biwa, Korean bipa, Vietnamese dan ty ba)', how: 'A plucked pear-shaped Chinese lute with 12 to 31 frets, played for almost two thousand years.' },
      { name: 'Charango', where: 'Andes (Bolivia, Peru, Ecuador, Chile, Argentina)', how: 'A small Andean lute of the Quechua and Aymara peoples, about 66 cm long, with ten strings in five courses; traditionally built with an armadillo-shell back but now usually wood.' },
      { name: 'Tres cubano', where: 'Cuba (Guantanamo; changui and son)', how: 'A three-course, six-string chordophone shaped like a small guitar, defining the sound of son cubano; the Puerto Rican tres has nine strings.' },
      { name: 'Bajo sexto', where: 'Mexico and Texas (norteno, conjunto, tejano)', how: '12 strings in six double courses, played with the button accordion in regional Mexican and Tejano conjunto groups; the bajo quinto drops the lowest course.' },
      { name: 'Cavaquinho', where: 'Portugal, Brazil and Cape Verde', how: 'A small four-string guitar-family instrument tuned D G B D in Brazil (used in samba and choro) and C G A D in Portugal.' },
      { name: 'Bouzouki', where: 'Greece (from Anatolian refugees, early 1900s)', how: 'A long-necked metal-strung lute played with a plectrum, central to rebetiko and later Greek laiko; the Irish bouzouki is derived from it.' },
      { name: 'Vihuela, Renaissance and baroque guitars', where: 'Spain and Europe', how: 'Ancestors of the guitar, with paired courses; the vihuela is noted as an ancestor of the classical guitar.' },
    ],
    music: [
      'Classical guitar and flamenco: classical guitar repertoire spans lute and vihuela transcriptions by Dowland and Narvaez to Scarlatti, with Francisco Tarrega and later Segovia popularizing the Torres-type guitar. Flamenco, developed in southern Spain within the gitano (Romani) communities of Andalusia, has its oldest record in 1774; guitarists such as Ramon Montoya and Paco de Lucia shaped it.',
      'Electric guitar: adopted by jazz players who wanted single-note solos in big bands (Charlie Christian, Eddie Durham, Les Paul), then essential to electric blues (Muddy Waters, T-Bone Walker, Sister Rosetta Tharpe), rock (Jimi Hendrix, Jimmy Page, Eric Clapton), and country and soul (Telecaster players include James Burton and Steve Cropper).',
      'Acoustic traditions: Hawaiian slack-key, country, folk and fingerpicking blues in the United States; Mexican and Tejano conjunto (guitar-family bajo sexto with accordion); and West African palm-wine music, in which Kru musicians combined local melodies with Portuguese guitars, an ancestor of highlife (Ghana\'s Kumasi Trio recorded in London in 1928; Sierra Leone\'s Ebenezer Calendar recorded in the 1950s-60s).',
    ],
    traditions: [
      'Spanish luthiers (Torres, Hauser, Ramirez, Fleta) and American makers (Martin, Gibson, Fender) form the main making traditions; players and makers still argue over whether fan-braced modern guitars favour the fundamental at the expense of overtones, which is why historically informed performers use period guitars.',
      'Slack-key began among Hawaiian families, according to oral history learning from Mexican cowboys (paniolo) in the early 19th century, and became a public tradition in the Hawaiian renaissance of the 1960s-70s. Palm-wine guitarists performed in informal drinking clubs on the West African coast among dockworkers and sailors.',
    ],
    sources: [
      { title: 'Guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Guitar' },
      { title: 'Acoustic guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Acoustic_guitar' },
      { title: 'Classical guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Classical_guitar' },
      { title: 'Electric guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Electric_guitar' },
      { title: 'Antonio de Torres Jurado', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Antonio_de_Torres_Jurado' },
      { title: 'C. F. Martin & Company', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/C._F._Martin_%26_Company' },
      { title: 'Fender Telecaster', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fender_Telecaster' },
      { title: 'Fender Stratocaster', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fender_Stratocaster' },
      { title: 'Gibson Les Paul', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Gibson_Les_Paul' },
      { title: 'Guitar tunings', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Guitar_tunings' },
      { title: 'DADGAD', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/DADGAD' },
      { title: 'Slack-key guitar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Slack-key_guitar' },
      { title: 'Capo', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Capotasto' },
      { title: 'Guitar pickup', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Guitar_pickup' },
      { title: 'Distortion (guitar)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Distortion_%28guitar%29' },
      { title: 'Fret', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fret' },
      { title: 'Tonewood', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tonewood' },
      { title: 'Oud', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Oud' },
      { title: 'Pipa', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pipa' },
      { title: 'Charango', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Charango' },
      { title: 'Tres (instrument)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tres_%28instrument%29' },
      { title: 'Bajo sexto', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bajo_sexto' },
      { title: 'Cavaquinho', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cavaquinho' },
      { title: 'Bouzouki', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bouzouki' },
      { title: 'Flamenco', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Flamenco' },
      { title: 'Palm-wine music', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Palm-wine_music' },
      { title: 'Conjunto', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Conjunto' },
    ],
  },
{
  id: 'piano',
  name: 'Piano (grand and upright)',
  players: ['theo'],
  family: 'Struck string (chordophone) with keyboard action',
  physics: [
    'Pressing a key sets a chain of levers (wippen, jack, hammer roller) in motion; a felt-covered hammer strikes the strings and falls back so the strings can ring. The strings themselves are not very loud: their vibration passes through a bridge to a large soundboard, which moves the air. A damper stops each string when the key is released.',
    'Most notes have three strings in the treble, two in the tenor and one in the bass. A struck string vibrates as a fundamental plus a series of partials, but piano strings are stiff, so the partials run progressively sharp of exact whole multiples. This inharmonicity is greater in short, thick strings, so small pianos are more inharmonic than long concert grands.',
    'Dynamics come from hammer speed: from pianissimo to fortissimo the hammer velocity changes by almost a factor of a hundred. The sustain pedal lifts all dampers, so unplayed strings also ring sympathetically and broaden the tone. The una corda (soft) pedal shifts a grand action so hammers hit fewer of the three strings, softening and changing the tone; on an upright it only moves the hammers closer to the strings.',
    'Total string tension in a modern grand can exceed 20 tons (about 180 kN), which is why the instrument needs a massive frame.',
  ],
  materials: [
    'The soundboard of all but the lowest-quality pianos is spruce boards glued edge to edge; spruce has a high strength-to-weight ratio, which keeps acoustic impedance low while resisting the downward force of the strings. Cheap pianos may use plywood. The outer rim is usually hard maple or beech, heavy so that vibrational energy stays in the soundboard rather than the case.',
    'Strings are high-carbon steel wire. Bass strings are a steel core wrapped with one or two layers of copper wire (iron and aluminium have also been used) to add mass while staying flexible. The plate (harp) is usually cast iron, which is easy to cast, resists deformation and tolerates compression; the pinblock holding the tuning pins is laminated hard maple or beech.',
    'Hammers are wood covered in felt, soft enough not to produce harsh high harmonics yet strong enough for fortissimo; Jean-Henri Pape was first to use felt in pianos in 1826. White keys were traditionally covered with ivory strips and black keys were ebony; because ivory-yielding species are protected, makers now use plastics almost exclusively (Yamaha developed one called Ivorite).',
  ],
  construction: [
    'Bartolomeo Cristofori of Padua, keeper of instruments for Ferdinando de\' Medici, is credited with inventing the piano; a Medici inventory shows one by 1700, and three Cristofori pianos from the 1720s survive. His key problem was an action in which the hammer strikes the string but does not stay in contact, and returns without bouncing.',
    'Gottfried Silbermann added the forerunner of the sustain pedal. Viennese makers (Johann Andreas Stein, Nannette Streicher, Anton Walter) built light wood-framed instruments with leather hammers, the kind Mozart wrote for. Sebastien Erard\'s double escapement of 1821 (as revised by Henri Herz) allowed fast note repetition and is in all grand pianos today.',
    'Cast-iron framing grew through the 19th century (Alpheus Babcock patented a one-piece frame for square pianos in 1825; Chickering patented the first full iron frame for grands in 1843). The sostenuto pedal was invented by Jean-Louis Boisselot in 1844 and copied by Steinway in 1874. C.F. Theodore Steinway developed the bent laminated rim in 1880, and Julius Bluthner introduced aliquot stringing in 1893.',
    'A piano can have over 12,000 parts. A Steinway concert grand (Model D) weighs about 480 kg; the Fazioli F308 is about 570 kg. Even a small upright can weigh 136 kg.',
  ],
  tuning: [
    'Pianos are tuned to a modified equal temperament, referenced to A4 = 440 Hz (A440), by turning tuning pins with a tuning wrench to adjust string tension. Unlike guitar or violin players, pianists normally hire a technician. Tempered intervals beat (a fluctuation from interference between close pitches), and tuners set the temperament by ear.',
    'Because of string inharmonicity, octaves are stretched: the highest strings are tuned slightly higher and the lowest slightly lower than a mathematical table would give, so that tuning an octave to the sharp overtone of the note below keeps double and triple octaves from sounding narrow. On a concert grand the stretch keeps harmonic balance and gives virtually beatless perfect fifths.',
  ],
  properties: {
    range: 'Standard 88 keys, A0 to C8 (seven octaves plus a minor third); older pianos had 85 keys to A7. The Imperial Bosendorfer has 97 keys and Stuart & Sons has built 108-key and 112-key instruments.',
    size: 'Small upright about 136 kg and up; Steinway Model D concert grand about 480 kg; Fazioli F308 about 570 kg.',
    other: [
      'A struck note decays steadily; the piano cannot sustain a note like an organ without the pedal.',
      'Strings are struck by the hammer rebounding immediately; dampers fall on the strings when the key is released.',
    ],
  },
  variants: [
    { name: 'Harpsichord', where: 'Europe (late 14th century onward)', how: 'Keyboard instrument whose strings are plucked by plectra (quill or plastic) in jacks lifted by the keys, so touch does not change loudness; used widely in Renaissance and Baroque music.' },
    { name: 'Clavichord', where: 'Europe (14th or early 15th century onward)', how: 'Strings are struck by small metal blades called tangents, which also define the vibrating length of the string; quiet but able to vary volume and sustain with touch, so mostly a practice and composing instrument.' },
    { name: 'Fortepiano', where: 'Europe (c.1700 to early 19th century)', how: 'Early piano with leather-covered hammers, thin harpsichord-like strings and a light case without a metal frame; the instrument Haydn and Mozart wrote for, revived for historically informed performance.' },
    { name: 'Santur', where: 'Iran', how: 'Hammered dulcimer of Iranian origin struck with light mallets (mezrabs); a typical Persian santur has two sets of nine bridges with four unison strings over each, giving about three diatonic octaves.' },
    { name: 'Yangqin', where: 'China', how: 'Trapezoidal Chinese hammered dulcimer, likely derived from the santur or the European dulcimer, struck with bamboo beaters with rubber tips; modern instruments use steel and copper-wound strings and have long bridges rather than separate small ones.' },
    { name: 'Cimbalom', where: 'Hungary (also Slovakia, Romania, Ukraine and neighbours)', how: 'Large chromatic concert dulcimer designed by Josef Schunda in Budapest in 1874 with a damping pedal, built on earlier folk dulcimers; Schunda tuning spans four octaves plus a major third.' },
    { name: 'Sandaya (Burmese piano style)', where: 'Myanmar (Burma)', how: 'The piano was introduced in the mid-19th century and quickly adapted by court musicians, who developed an interlocked two-hand fingering to play the Mahagita repertoire.' },
  ],
  music: [
    'Classical repertoire from Cristofori-era keyboard music through Mozart (written for Viennese fortepianos), Chopin (who used Pleyel pianos) and Liszt (who used Erard pianos), whose exploitation of fast repeated notes was made possible by the double escapement.',
    'African-American piano traditions developed in the 19th century in bars and clubs: ragtime (popularised by Scott Joplin), boogie-woogie ostinatos and stride, in which the left hand strides between a bass note or octave and a chord while the right plays syncopated melody. Stride players include James P. Johnson, Willie the Lion Smith, Fats Waller, Luckey Roberts and Mary Lou Williams.',
    'Jazz piano grew through comping (as in Duke Ellington), bebop (Thelonious Monk, Bud Powell) and Bill Evans, who combined classical technique with jazz; Gershwin\'s Rhapsody in Blue joined jazz piano to symphonic sound. In rock and roll, Jerry Lee Lewis and Little Richard made the piano a lead instrument.',
    'In salsa, the piano commonly plays the montuno, a rhythm that loops over eight counts, within the son montuno model that Arsenio Rodriguez developed in Cuba.',
  ],
  traditions: [
    'In the 19th century the upright piano became a middle-class household instrument, letting families hear newly published music through simplified arrangements. Piano innovation moved from Vienna to Paris (Pleyel and Erard) by the 1820s; Steinway & Sons, Bosendorfer (Austria) and Fazioli are among makers named in the sources.',
    'Pianists are accompanists and conductors\' working tool: the piano is used in schools and universities to teach theory and history, and conductors use piano reductions to learn scores. Player-piano and MIDI-equipped pianos such as the Yamaha Disklavier extend the instrument into recorded and electronic performance.',
  ],
  sources: [
    { title: 'Piano', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Piano' },
    { title: 'Bartolomeo Cristofori', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bartolomeo_Cristofori' },
    { title: 'Santur', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Santur' },
    { title: 'Yangqin', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Yangqin' },
    { title: 'Cimbalom', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cimbalom' },
    { title: 'Stride piano', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Stride_piano' },
  ],
},
{
  id: 'tine-electric-piano',
  name: 'Tine electric piano (Rhodes type)',
  players: ['theo'],
  family: 'Struck idiophone (tuning-fork type) with electromagnetic pickup (electrophone)',
  physics: [
    'As on a piano, a key drives a felt- or rubber-tipped hammer, but the hammer strikes a thin steel rod called a tine rather than a string. The tine is coupled to a larger tone bar, and the assembly acts as a tuning fork: the tone bar reinforces and extends the tine\'s vibration. A pickup sits opposite the tine and induces a current as the metal moves, in the same way as an electric guitar pickup.',
    'Vibrating tines produce a mellower timbre than a piano or a Wurlitzer; the sound changes with the tine\'s position relative to the pickup, and putting the two close together gives a characteristic bell sound.',
    'The Rhodes makes a faint sound even unplugged, since simply striking the tines needs no power, though like an unplugged electric guitar the volume and tone are diminished. The Suitcase model\'s tremolo bounces the output across two speakers; on some models it was labelled vibrato (a pitch variation) for consistency with Fender amplifier panels, which is inaccurate.',
  ],
  materials: [
    'Tines are steel; the manufacturer\'s own manual notes that steel wire, even of the finest quality, can have surface flaws that cause breakage, and excludes tines from the general warranty. Harold Rhodes\'s earlier Pre-Piano used carbon steel rods.',
    'Hammer tips were felt, changed to neoprene rubber in 1971 to reduce regular maintenance. In 1975 the harp supports changed from wood to aluminium, which made production cheaper and slightly changed the resonance. Early Fender-era cases used Tolex covering with a fiberglass top, later replaced with vacuum-molded plastic in 1969.',
  ],
  construction: [
    'Harold Rhodes taught piano from age 19. In the Army Air Corps (from 1942) he designed teaching methods and built small keyboards for convalescent soldiers from scrapped aircraft parts: the Xylette, with aluminium xylophone bars made from discarded hydraulic systems, plywood from hatchways, keys from fuselage spruce and hammers from propeller hardwood.',
    'After the war he developed an amplified 38-key Pre-Piano (also marketed as the Bantam Piano), shown publicly in Los Angeles in May 1948. In 1958 he began working with Leo Fender; the 32-note Piano Bass (E1 to B3) went into production around 1962. After CBS bought Fender in 1965 the first full 73-note Fender Rhodes appeared.',
    'The 73-note Stage Piano (1970) weighed about 130 lb (59 kg) and had detachable legs; the older two-piece design with built-in amplifier and speaker was renamed the Suitcase Piano, and an 88-note model followed in 1971. Mark II appeared in 1979, the Mk III EK-10 (with analog synthesizer) in 1980, and the Mark V in 1984, the last from the original company. Roland bought the business in 1987 and issued digital pianos, which Harold Rhodes disapproved of.',
  ],
  tuning: [
    'Each tine has a small coil spring fitted tightly on it. The spring acts as a counterweight and pitch control: sliding it to a new position changes the pitch, which is how the tine is fine-tuned (per the manufacturer\'s manual). The tone bar vibrates at the same frequency and lets a tine be tuned slightly off pitch without major loss of support.',
    'Harold Rhodes\'s earlier Pre-Piano was advertised as never needing to be tuned. Tone also depends on the tine position relative to its pickup, which is why the aftermarket Dyno My Piano (Chuck Monte) added a lever that moved the tines relative to the pickups to alter the sound.',
  ],
  properties: {
    range: 'Fender Rhodes keyboards: 73 notes (Stage 73) or 88 notes; Piano Bass 32 notes, E1 to B3.',
    size: 'Stage 73 about 130 lb (59 kg); the MK8 (2022) is about 75 lb (34 kg).',
    other: [
      'Sustain is better than on a Wurlitzer, which produces more harmonics and "bite" when played hard.',
      'A spectrum analysis cited by one rental house shows a gap where a lead vocal sits, so the instrument can support a voice without masking it.',
    ],
  },
  variants: [
    { name: 'Wurlitzer electronic piano', where: 'United States (Benjamin Miessner design, 1954 to 1983)', how: 'A hammer strikes a steel reed rather than a tine; an electrostatic pickup at 170 V DC senses it. The sound is sharper, closer to a sawtooth than the Rhodes\'s sine-like tone, and bites harder when played strongly. Most models have 64 notes.' },
    { name: 'Hohner Pianet', where: 'Trossingen, West Germany', how: 'Designed by Ernst Zacharias; a pad on the key lifts and releases a tuned spring-steel reed, sensed by a pickup (variable-capacitance in early models, electromagnetic from 1977). The sound starts harmonically complex and settles to a cleaner tone. Range F1 to F6.' },
    { name: 'Hohner Clavinet', where: 'Trossingen, West Germany (1964 to 1982)', how: 'An electric clavichord: keys press a rubber pad against a tensioned steel string so it is fretted against an anvil, sensed by electromagnetic pickups. Strongly associated with Stevie Wonder\'s "Superstition" (1972) and with funk.' },
    { name: 'Yamaha CP-70 electric grand', where: 'Japan (1976 to 1985)', how: 'Real piano action and strings but no soundboard, with shorter specially made strings and piezo-electric pickups on the frame; designed for touring and used by players such as Tony Banks and Keith Godchaux.' },
    { name: 'Fender Rhodes Piano Bass', where: 'United States', how: 'Cut-down 32-note keyboard bass using the Rhodes tone generator; Ray Manzarek of The Doors played its bass lines with his left hand.' },
    { name: 'Digital and modelled versions', where: 'Japan and elsewhere', how: 'Roland\'s MK80 and MK60 (1989) were digital pianos carrying the Rhodes name; the Yamaha DX7 \'DX7 Rhodes\' patch was popular in the 1980s; many keyboards now model Rhodes and Wurlitzer sounds.' },
  ],
  music: [
    'Jazz and fusion: the Rhodes became popular in jazz in the late 1960s through Miles Davis\'s sidemen. Herbie Hancock first met it in a 1968 Davis session and noted that amplification made him far more audible; Chick Corea and Joe Zawinul used it prominently in the 1970s, and from In a Silent Way (1969) it was the most prominent keyboard on Davis\'s recordings until the mid-1970s.',
    'Soul, pop and funk: Stevie Wonder (often alongside the Clavinet), Donny Hathaway ("This Christmas"), Billy Preston (Beatles "Get Back"), Bob James\'s "Angela" (the Taxi theme) and Vince Guaraldi\'s A Charlie Brown Christmas. The Doors, Steely Dan\'s Donald Fagen, Air and Nils Frahm also use it.',
    'Rhodes advertised in 1976 that 82% of the top 100 Billboard albums featuring electric pianos used a Rhodes. Use declined in the 1980s as digital synthesizers like the DX7 competed and as original-company quality control slipped, and revived in the 1990s.',
  ],
  traditions: [
    'Rhodes designed the instrument partly for teaching: Student and Instructor models (1965) let a teacher listen to each pupil and send backing tracks, and Rhodes\'s teaching method is still taught. Rhodes regained the rights in 1997 and died in December 2000.',
    'The brand has since been revived: Rhodes Music Corporation (2007) built the Mark 7, and Rhodes Music Group (2021) announced the MK8. A grass-roots industry of repairers keeps vintage electromechanical keyboards (Rhodes, Wurlitzer, Clavinet) playing.',
  ],
  sources: [
    { title: 'Rhodes piano', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Rhodes_piano' },
    { title: 'Fender Rhodes service manual, Chapter 1', publisher: 'fenderrhodes.com', url: 'https://fenderrhodes.com/org/manual/ch1.html' },
    { title: 'Wurlitzer electric piano', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Wurlitzer_electric_piano' },
    { title: 'Hohner Pianet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hohner_Pianet' },
    { title: 'Clavinet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Clavinet' },
    { title: 'Yamaha CP-70', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Yamaha_CP-70' },
  ],
},
{
  id: 'organ',
  name: 'Organ (pipe, Hammond and combo organs)',
  players: ['hez'],
  family: 'Aerophone (pipe organ, reed organ) and electromechanical/electronic organs',
  physics: [
    'A pipe organ drives pressurised air (wind) through pipes selected from a keyboard. Each pipe sounds one pitch; a set of pipes of one timbre is a rank, and a stop admits wind to a rank. Wind pressures are on the order of 0.10 psi (0.69 kPa). The continuous wind lets notes sustain as long as keys are held, unlike piano or harpsichord.',
    'Flue pipes sound by forcing air across a fipple like a recorder; reed pipes use a beating brass reed against a shallot, like a clarinet, with a tuned resonator and a slide to fine-tune the vibrating length. A closed (stopped) flue pipe sounds an octave lower than an open pipe of the same length and gives only odd partials, which is why stopped pipes are gentler.',
    'Pitch is labelled in feet from the length of the lowest open pipe: 8\' is unison pitch (about 8 ft, 2.4 m), 4\' an octave higher, 16\' an octave lower and 32\' two octaves lower. Stops at different footages are meant to be combined.',
    'The Hammond tonewheel organ makes sound by spinning metal tonewheels beside electromagnetic pickups, giving nearly sine-wave signals. Nine drawbars per manual set the level of components named by pipe-organ footage (8\' is the fundamental, 16\' an octave below, 4\', 2\' and 1\' one, two and three octaves above), so additive mixing builds the timbre. Harmonic percussion adds a decaying second or third harmonic.',
    'The Leslie speaker rotates a horn and a baffle in front of fixed drivers; the moving sources create Doppler pitch shifts and amplitude modulation, which Don Leslie designed to imitate the spatially varied sound of pipe-organ ranks. It has fast (tremolo) and slow (chorale) speeds.',
  ],
  materials: [
    'Metal organ pipes are usually lead alloyed with tin (plus traces of antimony and copper) for rigidity; more tin gives a brighter, longer-lasting polish and costs more, and rolled zinc is sometimes used for large bass pipes. Pipes are cast on a flat surface, rolled around mandrels and soldered. Wood pipes are also used, and reed pipes use brass reeds.',
    'Hammond manuals and pedalboards originally used solid palladium alloy contact wire for a reliable electrical connection. The tonewheels are driven by a synchronous motor through gears, so every note stays at a fixed pitch relative to the others. Free-reed instruments use thin metal reeds in a frame.',
  ],
  construction: [
    'The organ is traced to the hydraulis of Ctesibius of Alexandria in the 3rd century BC, in which water pressure maintained the wind; bellows appeared by the 6th or 7th century AD. A Byzantine organ was sent to Pepin the Short in 757, and the first documented permanent organ was installed at Halberstadt in 1361. Baroque builders include Arp Schnitger, Gottfried Silbermann and Zacharias Hildebrandt.',
    'Key actions may be mechanical (tracker), tubular-pneumatic or electric; the stop action is separate. Romantic organs, such as those of Cavaille-Coll, became more symphonic; the 20th-century Organ reform movement returned to mechanical action and lower wind pressure. Theatre organs (Robert Hope-Jones\'s unit orchestra, built by Wurlitzer and others) accompanied silent film.',
    'Laurens Hammond and John Hanert\'s electric organ was unveiled in April 1935 and the Model A sold from June 1935; the B-3 and C-3 with harmonic percussion came in 1954. About two million Hammond organs were made. Hammond abandoned tonewheels for integrated circuits in 1975; Suzuki now builds digital models.',
    'Combo organs: the transistorised Vox Continental (made 1962 to 1971, Dartford, England) used oscillators with frequency dividers and reverse-coloured keys; Farfisa of Osimo, Italy (founded 1946, from three accordion makers) made compact organs that sold cheaply.',
  ],
  tuning: [
    'The aim of tuning a pipe organ is to set every pipe in tune with the rest; how this is done depends on the pipe type. Most reed pipes have a slide that adjusts the vibrating length of the reed to fine-tune it; regulation separately adjusts the action so that every pipe speaks correctly.',
    'A Hammond does not generate harmonics as exact multiples of the fundamental in equal temperament: it uses the nearest available tonewheel frequencies, and the only guaranteed pitch is concert A at 440 Hz. Classical organ purists disliked that two notes an octave apart stay in exact synchronisation, unlike pipes. A shō or khaen cannot be freely re-tuned once reeds and pipes are set.',
  ],
  properties: {
    range: 'Hammond consoles: two 61-note manuals plus a 25-note (Model A) or 32-note pedalboard. Pipe organs can run from 32\' stops to high mixtures across five or more octaves.',
    size: 'A Hammond B-3 with bench and pedalboard weighs about 425 lb (193 kg); the largest pipe organs have over 33,000 pipes and seven manuals.',
    other: [
      'A Hammond needs a start motor to run about 12 seconds before it will sound.',
      'Key click, once treated as a defect and filtered, became part of the classic sound; crosstalk between tonewheels is likewise now valued.',
    ],
  },
  variants: [
    { name: 'Sheng', where: 'China', how: 'Mouth-blown free-reed instrument of vertical pipes, depicted from about 1100 BCE; traditional ones have 17 pipes. Each reed sounds at its own fixed frequency, and a pipe sounds only when its finger hole is covered. It can be played on both inhale and exhale.' },
    { name: 'Sho', where: 'Japan', how: 'Descended from the Chinese sheng and brought to Japan in the Nara period; 17 bamboo pipes, 15 of them sounding, each with a metal free reed. Used in gagaku court music for tone clusters called aitake; tuned with wax containing fine lead shot and warmed over a brazier to keep breath moisture out.' },
    { name: 'Khaen', where: 'Laos and Isan (Thailand)', how: 'Bamboo-pipe mouth organ with brass or silver free reeds, the national instrument of Laos and on UNESCO\'s intangible heritage list since 2017; played in five pentatonic lai modes and with mor lam singing.' },
    { name: 'Indian harmonium (vaja)', where: 'India, Pakistan and Bangladesh', how: 'Small, portable, hand-pumped reed organ adapted from European harmoniums in the 19th century; central to qawwali, ghazal, kirtan and bhajan among Sikh, Hindu and Muslim communities.' },
    { name: 'Reed (pump) organ and harmonium', where: 'France, United States', how: 'Free-reed organs patented as the harmonium by Alexandre Debain in 1840; Mason & Hamlin and Estey made millions in the US between the 1850s and 1920s, using a suction bellows after about 1885.' },
    { name: 'Theatre organ', where: 'United States and United Kingdom', how: 'Pipe organ developed to accompany silent films in the 1900s to 1920s, with horseshoe stop-tab consoles and unit-orchestra design.' },
  ],
  music: [
    'Church liturgy and the classical organ repertoire spanning over 500 years: Dutch composers such as Sweelinck, north German chorale preludes and partitas, Johann Sebastian Bach, and later French symphonic composers including Cesar Franck and Marcel Dupre, up to Olivier Messiaen.',
    'Jazz organ trios (organ, guitar, drums): Jimmy Smith, who joined the Hammond B-3 to jazz from the 1950s, played walking bass lines on the pedals and became internationally known after the 1957 Newport Jazz Festival. A drawbar setting of 888000000 is called the classic Jimmy Smith sound. Albums include The Sermon! and Back at the Chicken Shack.',
    'R&B, rock and reggae: Booker T. Jones, Procol Harum\'s "A Whiter Shade of Pale" (Matthew Fisher), Jon Lord of Deep Purple (a Hammond through a Marshall stack), Keith Emerson, Gregg Allman and Winston Wright in Jamaica. Vox Continental organs were used by the Beatles, the Animals and the Doors; Farfisa by Sam the Sham and Pink Floyd.',
  ],
  traditions: [
    'In Black churches the Hammond B-3 became a defining sound. Chicago\'s First Church of Deliverance bought a Hammond in 1939; organist Maceo Woods\'s 1955 "Amazing Grace" was a best-selling gospel instrumental, and gospel groups added full bands, often with a B-3. Scholar Ashon Crawley\'s project calls it the sound of the Black Church.',
    'The Catholic Church\'s 1963 Second Vatican Council decree held the pipe organ in high esteem for liturgy. Don Leslie began selling his rotating speaker himself in 1941 after Laurens Hammond declined to market it, and Hammond only supported it officially in 1966.',
  ],
  sources: [
    { title: 'Pipe organ', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pipe_organ' },
    { title: 'Organ pipe', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Organ_pipe' },
    { title: 'Hammond organ', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hammond_organ' },
    { title: 'Leslie speaker', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Leslie_speaker' },
    { title: 'Sheng', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sheng' },
    { title: 'Khene', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Khene' },
    { title: 'Happy anniversary, B-3', publisher: 'Christianity Today', url: 'https://www.christianitytoday.com/2015/05/happy-anniversary-b-3/' },
  ],
},
{
  id: 'synthesizer',
  name: 'Synthesizer',
  players: ['nova'],
  family: 'Electrophone (electronic sound generator)',
  physics: [
    'A synthesizer generates audio signals electronically. In subtractive synthesis, oscillators produce waveforms rich in harmonics and filters remove or boost frequencies; envelopes shape articulation and low-frequency oscillators (LFOs) modulate pitch, amplitude or filter. The most common envelope is ADSR: attack, decay, sustain level, release.',
    'Waveform shape sets harmonic content. A sawtooth contains all integer harmonics, which makes it a good source for subtractive synthesis. A square wave has only odd harmonics; a triangle wave also has only odd harmonics but they roll off as the inverse square of the harmonic number rather than the inverse. Descriptions of Moog oscillators call the sawtooth bright and brassy and the triangle thinner and flute-like.',
    'Frequency modulation (FM) synthesis, developed from 1967 by John Chowning at Stanford, modulates a carrier\'s frequency with another oscillator. Harmonic ratios give harmonic tones; non-integer ratios give inharmonic bell-like and percussive spectra. Additive synthesis sums many sine waves; wavetable synthesis morphs between stored waveforms; sample-based synthesis plays shaped recordings.',
    'Voltage control makes pitch electrical. Moog\'s oscillators used transistors with an exponential voltage-current relationship. Two common control-voltage standards are volts-per-octave (1 V equals one octave) and hertz-per-volt. The Moog 24 dB/octave transistor-ladder low-pass filter is distinctive for its boost around the cutoff.',
  ],
  materials: [
    'Early instruments used vacuum tubes: the RCA Mark II (1957) had about 750 tubes and read punched paper tape. The Hammond Novachord (late 1930s) used 72 voltage-controlled amplifiers and 146 tubes. Moog\'s breakthrough used newly available silicon transistors.',
    'Later machines used integrated circuits and microprocessors (Prophet-5, 1978, with patch memory), then digital chips such as Yamaha\'s VLSI FM chips in the DX7 (1983). Audio VCOs were largely replaced in the 1980s by digitally controlled oscillators because of their stability against temperature.',
    'The ANS synthesizer used optics: five glass discs each printed with 144 sine-wave tracks, modulated light read through a scratched mastic-coated glass score and twenty photocells.',
  ],
  construction: [
    'Precursors: Lev Termen (Leon Theremin) invented the theremin in October 1920 from Soviet research into proximity sensors; two antennas act as capacitors with the player\'s hands, and the heterodyne principle mixes two radio-frequency oscillators (set below 500 kHz) to give an audio difference tone. Maurice Martenot patented the ondes Martenot in 1928; Messiaen scored it in the Turangalila-symphonie (1949).',
    'Robert Moog, a Cornell doctoral student, met composer Herb Deutsch in 1963 and demonstrated his modular synthesizer in 1964; the Moog added envelope and filter modules at composers\' requests. Don Buchla, working independently in Berkeley from 1962, built the Buchla Modular Electronic Music System (1965) with touch plates instead of a keyboard, and the Music Easel in 1972.',
    'The Minimoog (1970) standardised the self-contained keyboard synth and was the first sold in music stores. ARP\'s 2600 and Odyssey, EMS in the UK, Oberheim, and Sequential followed; Roland\'s TB-303 (1981) and TR-808 (1980) came from Japan. Doepfer\'s A-100 (1996) launched the Eurorack format, which now has over 15,000 modules from more than 600 makers.',
  ],
  tuning: [
    'Analog pitch follows a control-voltage scale such as 1 V per octave. Audio VCOs were largely replaced in the 1980s by digitally controlled oscillators because of their output stability against temperature changes. The Minimoog\'s three oscillators were never completely synchronised, which is credited for its warm, rich sound.',
    'MIDI (standardised 1983) represents each note as one chromatic note number; MIDI 1.0 does not directly support microtonal music, so microtones are emulated with pitch bend. The MIDI Tuning Standard (ratified 1992) allows alternate tunings, loadable from a bank of up to 128 patches and adjustable in real time, but manufacturers are not required to implement it. Digital synths from the Yamaha TX81Z (1987) on made microtonal exploration easier.',
  ],
  properties: {
    range: 'Not fixed: pitch is set by oscillators or digital models. The ANS covers 10 octaves in 720 steps of 1/72 octave (16.67 cents).',
    size: 'From room-sized (RCA Mark II) to modular cabinets to portable self-contained keyboards (Minimoog, ARP 2600 in a carrying case).',
    other: [
      'Early synthesizers were monophonic; the Oberheim OB-X (1979) and Prophet-5 (1978) were early commercial polyphonic synths.',
      'MIDI messages travel as 8-bit bytes at 31,250 baud.',
    ],
  },
  variants: [
    { name: 'Theremin', where: 'Soviet Union / Russia', how: 'Played without touch: one hand controls pitch, the other volume, using capacitive antennas; patented by Leon Theremin in 1928 and manufactured by RCA.' },
    { name: 'Ondes Martenot', where: 'France', how: 'Invented 1928 by Maurice Martenot, played by a ring on a wire or a keyboard with lateral vibrato; used in more than 100 orchestral works and by Jeanne Loriod and Jonny Greenwood.' },
    { name: 'ANS synthesizer', where: 'Soviet Union (Evgeny Murzin, 1937 to 1957)', how: 'Photoelectronic instrument with 720 microtonal sine tones drawn as a graphical score; used by Alfred Schnittke and Sofia Gubaidulina, and by Eduard Artemiev for Tarkovsky film scores such as Solaris.' },
    { name: 'Moog modular', where: 'United States (Trumansburg, New York)', how: 'Patch-cable modular synthesizer with voltage-controlled oscillators, filter, envelopes, sequencers, played from a keyboard.' },
    { name: 'Buchla modular', where: 'United States (Berkeley, California)', how: 'Modular instrument controlled by touch plates that send control voltages by finger position and force; built for the San Francisco Tape Music Center.' },
    { name: 'Yamaha DX7', where: 'Japan', how: 'Digital FM synthesizer (1983), the first widely successful digital synth, with over 200,000 sold; its E PIANO 1 preset was ubiquitous in 1980s ballads.' },
    { name: 'Roland TB-303 and TR-808', where: 'Japan', how: 'Bass synthesizer (sawtooth or square wave through a 24 dB filter, 1981) and analog drum machine (about 12,000 made); both failed commercially, then became foundations of house, techno and hip-hop.' },
  ],
  music: [
    'Wendy Carlos\'s Switched-On Bach (1968), Bach arranged for Moog by Carlos and Benjamin Folkman, reached number 10 on the Billboard 200, won three Grammys and became the second classical album certified platinum.',
    'Kraftwerk (formed in Dusseldorf in 1970 by Ralf Hutter and Florian Schneider) used the Minimoog and EMS Synthi AKS on Autobahn (1974) and developed robot pop on Trans-Europe Express and Computer World. Japan\'s Yellow Magic Orchestra (1978) was the first band to use the TR-808 on release and is credited with a key role in synthpop and techno.',
    'Detroit techno came from the Belleville Three (Juan Atkins, Derrick May, Kevin Saunderson), who cited Kraftwerk, Yellow Magic Orchestra and Parliament; Atkins\'s Model 500 "No UFO\'s" (1985) is a landmark. Chicago house used synthesizers, sequencers and samplers, and acid house arose from the TB-303, first released on vinyl in Phuture\'s "Acid Tracks" (1987).',
    'India\'s Charanjit Singh recorded Synthesizing: Ten Ragas to a Disco Beat (1982) with TB-303 and TR-808, later seen as a precursor to acid house. Synthesizers also score films, from A Clockwork Orange (1971) to The Terminator (1984).',
  ],
  traditions: [
    'The synthesizer was first seen as avant-garde and countercultural; it entered the mainstream with Switched-On Bach. Players had to win recognition: Walter Sear persuaded the American Federation of Musicians that synthesizer playing demanded skill, and synthesists met suspicion for years.',
    'Moog, Buchla and later makers shaped distinct design philosophies: Moog\'s keyboard made it marketable, while Buchla experimented with touch-plate control. Eurorack has grown to hundreds of makers, from DIY kits to established firms; Roland\'s Ikutaro Kakehashi helped launch MIDI with Dave Smith at the 1983 Winter NAMM Show.',
  ],
  sources: [
    { title: 'Synthesizer', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Synthesizer' },
    { title: 'Moog synthesizer', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Moog_synthesizer' },
    { title: 'FM synthesis', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/FM_synthesis' },
    { title: 'Theremin', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Theremin' },
    { title: 'ANS synthesizer', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ANS_synthesizer' },
    { title: 'MIDI Tuning Standard', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/MIDI_Tuning_Standard' },
  ],
},
{
    id: 'violin',
    name: 'Violin',
    players: ['priya'],
    family: 'Bowed string (chordophone, composite)',
    physics: [
      'A bowed string is a stick-slip oscillation. Rosin on the bow hair makes it grip, the string is dragged sideways until its tension pulls it back, and the cycle repeats. Hermann von Helmholtz showed the string takes a V shape whose corner runs along it at constant speed; C. V. Raman published a fuller model in 1918.',
      'Both ends of a string are effectively stationary, so it vibrates as a standing wave with a fundamental plus overtones. The strings themselves move almost no air. The bridge rocks and passes their energy to the body, and the arched plates and the air inside radiate it as sound.',
      'The body has many resonances. Research cited in the sources puts the lowest main wood resonance between 392 and 494 Hz, around A4. Good violins are also said to respond strongly near 2 to 3 kHz, an effect attributed to the bridge and called the bridge-hill effect.',
      'The soundpost, a dowel held by friction near the treble foot of the bridge, couples top and back and shapes the vibration modes. Moving it by 0.25 to 0.5 mm can noticeably change tone and loudness. The bass bar under the bass foot braces the top. The f-holes let the plates move and air escape, and also give access for adjusting the soundpost.',
      'The player controls bow speed, bow force and the sounding point. Playing near the bridge (sul ponticello) brings out normally unheard harmonics and a glassy sound, while playing over the fingerboard gives a softer, floating tone. The cello is the instrument usually troubled by a wolf tone, when a played note matches a strong body resonance.',
    ],
    materials: [
      'The top is spruce (especially Norway spruce); the ribs, back and neck are usually maple, often with flamed figure; the fingerboard is typically ebony, chosen for hardness and resistance to wear. Parts are mostly glued with animal hide glue, which makes thin joints and can be reversed with hot water for repairs.',
      'Strings were first sheep gut. Modern strings may be gut, solid or stranded steel, or synthetic (such as Perlon), usually wound with metal; most E strings are plain steel. Gut is still favoured by many players of Baroque music.',
      'Bow hair traditionally comes from the tail of a grey male horse and is coated with rosin, a resin from pine and other conifers consisting mainly of abietic acid. Fine bow sticks are traditionally pernambuco (Paubrasilia echinata), a Brazilian wood prized for its elastic properties.',
      'Pernambuco is listed as endangered by the IUCN. CITES discussions in 2024 and 2025 called for registered stockpiles and traceable finished bows, and the International Pernambuco Conservation Initiative replants trees. Carbon fibre bows have grown in use, and some makers adopt other woods.',
    ],
    construction: [
      'The body is hourglass shaped, with two upper bouts, two lower bouts and two concave C-bouts at the waist to give the bow clearance. Top and back are arched and graduated (thickness profile carved), with purfling inlaid near the edge. Neck, pegbox and scroll lead to friction pegs; the strings anchor at a tailpiece.',
      'The modern violin emerged in early 16th-century northern Italy, with the oldest pictures c. 1530. Andrea Amati of Cremona is credited with instruments in essentially modern form. Charles IX of France commissioned instruments from him in 1560, and the Charles IX violin in the Ashmolean Museum is the oldest surviving violin.',
      'Cremona makers include the Amati, Stradivari and Guarneri families; Brescia had Gasparo da Salo and Maggini. Antonio Stradivari is estimated to have made about 1,116 instruments, around 650 surviving. Varnish and wood are said to matter greatly to tone, though claims that these instruments cannot be matched are disputed.',
      'In the 18th and 19th centuries most old violins were altered with a longer, more angled neck, heavier strings and a heavier bass bar. Mass-produced trade violins came from Saxony, Bohemia and Mirecourt in France. The modern bow form is largely credited to the French bowmaker Francois Tourte.',
    ],
    tuning: [
      'Standard tuning is in perfect fifths: G3, D4, A4, E5. The A string is tuned first to a reference (usually 440 Hz), the others are bowed in pairs, and fine tuners help with steel strings. Orchestras tune to the oboe. Unaccompanied violinists are said to lean toward Pythagorean intonation, then adjust to the key in a quartet or to equal temperament beside a piano.',
      'Non-standard tuning is called scordatura in classical music and cross-tuning in folk. Examples: Saint-Saens, Danse Macabre (E string lowered to E-flat); Biber, Mystery Sonatas (different tuning per movement); Paganini, Violin Concerto No. 1 (all strings a semitone up).',
      'South Indian violin is tuned to the relative pitches of Sa-Pa-Sa-Pa, such as D-sharp, A-sharp, D-sharp, A-sharp or B-flat, F, B-flat, F; the tonic is chosen to suit the singer or lead. The player sits on the floor with the scroll resting on the side of the foot, leaving the left hand free to move all over the fingerboard. Hindustani practice often uses Pa-Sa-Pa-Sa.',
      'Arabic practice often lowers the A and E strings a whole step (G-D-G-D) to ease maqam playing with quarter tones. Fiddle cross-tunings such as G-D-G-D or A-E-A-E are common in old-time music, and the Hardanger fiddle uses over 20 recorded tunings.',
    ],
    properties: {
      range: 'Lowest note G3 (open string; rarely tuned down to D3). Orchestral parts reach about E7, and stopped or artificial harmonics reach C8.',
      size: 'Full (4/4) body length about 356 mm (14 in); 3/4 size is about 335 mm. Fractional sizes go down to 1/64. A typical bow is about 75 cm and about 60 g.',
      other: [
        'String tension is cited as roughly 39 to 83 N per string depending on the string. The fingerboard is unfretted, so any pitch along the string is possible.',
        'Typical vibrato oscillates about 6 Hz and varies pitch by around a quarter tone. Pizzicato dies away quickly, especially on open strings.',
      ],
    },
    variants: [
      { name: 'Carnatic violin', where: 'South India', how: 'Essentially a Western violin tuned Sa-Pa-Sa-Pa and played seated on the floor with the scroll on the foot, usually as melodic accompanist to a vocalist in a Carnatic ensemble.' },
      { name: 'Hardanger fiddle (hardingfele)', where: 'Norway', how: 'National instrument of Norway, with eight or nine strings: four played, the rest sympathetic understrings. Decorated with inlay and carving, with a flatter bridge for double stops. Earliest known example dates to 1651. Used for dance.' },
      { name: 'Erhu', where: 'China', how: 'Two-stringed spike fiddle with a python-skin front on the sound box. The bow hair passes between the strings, which are usually tuned D4 and A4. Most popular of the huqin family.' },
      { name: 'Sarangi', where: 'India and Nepal', how: 'Short-necked bowed instrument carved from one block of wood, with three main gut strings stopped by nails and flesh and dozens of sympathetic strings. Said to imitate vocal ornaments. Nepali form is simpler.' },
      { name: 'Kemenche / kemence', where: 'Turkey, Greece, Armenia, Iran, Azerbaijan', how: 'Family of mostly three-stringed bowed folk instruments held upright with the tail on the knee. Includes the Pontic (Black Sea) kemenche and the classical Turkish kemence.' },
      { name: 'Gusle (lahuta)', where: 'Balkans (Serbia, Albania and neighbouring regions)', how: 'Single-stringed bowed instrument with a skin-covered maple body, held between the knees and always accompanying sung epic poetry. The Serbian gusle was inscribed by UNESCO in 2018.' },
      { name: 'Morin khuur', where: 'Mongolia', how: 'Horsehead fiddle with a trapezoid wooden body and two strings of horsehair or nylon, traditionally tuned a fifth apart. A national symbol; UNESCO recognised.' },
      { name: 'Rebab', where: 'North Africa, West and Central Asia, South and Southeast Asia', how: 'Name for several related bowed instruments spread along Islamic trading routes, named by at least the 8th century. Considered one of the earliest bowed instruments and a parent of others.' },
    ],
    music: [
      'In Western classical music the violin is the leading solo and orchestral string instrument. Named works in the sources include Bach\'s Partita in E for solo violin, Paganini\'s Violin Concerto No. 1, Tchaikovsky\'s Violin Concerto, Saint-Saens\'s Danse Macabre and Bartok\'s Contrasts.',
      'As a fiddle it plays dance tunes in country, bluegrass and old-time music, passed down orally, using droning, shuffles and ornamentation, often in cross-tunings. Players may flatten the bridge curve to ease double stops.',
      'Jazz violin dates to the first decades of the 20th century. Named players include Joe Venuti (with guitarist Eddie Lang), Stephane Grappelli, Stuff Smith, Eddie South, Jean-Luc Ponty and Regina Carter.',
      'In Carnatic music the violin is the usual melodic accompaniment to a vocalist. Hardanger fiddling accompanies dancing with loud foot stomping. Electric violins with piezoelectric pickups, the first built about 1928, serve jazz fusion and pop.',
    ],
    traditions: [
      'Makers are luthiers or violinmakers; bowmakers are archetiers. Brescia and Cremona in Italy are the historic centres, followed by Venice and, for trade instruments, Mirecourt in France.',
      'The Gasparo da Salo violin (c. 1574) was played for forty years by the Norwegian virtuoso Ole Bull. A Stradivari violin, the Lady Blunt, sold for 9.8 million pounds in 2011, a record at the time.',
      'In a Hardanger tradition the fiddler led the bridal procession to the church entrance, and the instrument is used for dance in southwest Norway. Fiddle repertoire in many folk traditions is learned by ear rather than from notation.',
    ],
    sources: [
      { title: 'Violin', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Violin' },
      { title: 'Violin acoustics', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Violin_acoustics' },
      { title: 'Paubrasilia', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Paubrasilia' },
      { title: 'Hardanger fiddle', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hardanger_fiddle' },
      { title: 'Erhu', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Erhu' },
      { title: 'Sarangi', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sarangi' },
    ],
  },
  {
    id: 'cello',
    name: 'Cello (violoncello)',
    players: ['ingrid'],
    family: 'Bowed string (chordophone), violin family',
    physics: [
      'The cello makes sound like the violin. A rosined bow drags the string in a stick-slip cycle, the bridge passes the vibration to the arched top and back, and the body and enclosed air radiate it through the f-holes. The soundpost and bass bar inside the body shape how the plates move.',
      'Open strings are C2, G2, D3 and A3, an octave below the viola. For a given string length, strings with less mass per unit length or more tension sound higher, which is why the four strings differ in pitch. Bowing near the bridge emphasises overtones; bowing over the fingerboard sounds more flute-like.',
      'The cello is the instrument most famous for the wolf tone. A note around E or F-sharp can sit close to a main body resonance, and the resonance splits and beats against the string, giving a growling, warbling sound. C. V. Raman explained it as an alternation between two kinds of string vibration.',
      'Fixes include a wolf eliminator, a metal tube fitted on the string length below the bridge that works like a tuned-mass damper, or moving the soundpost. An older cello device was a fifth string tuned to the wolf frequency. On the double bass the wolf tends to be near G-sharp.',
    ],
    materials: [
      'A traditional cello has a spruce top and maple back, sides and neck; poplar or willow are sometimes used for back and sides. Ebony is common for the fingerboard, pegs and nut. Cheaper cellos often use laminated wood, which is more durable and widely used in school and youth orchestras.',
      'Strings were gut-cored. Most modern strings are wound with aluminium, titanium, chromium or other metals. Cellists often mix string types. Carbon fibre cellos (for example by Luis & Clark) resist humidity and temperature changes and suit outdoor playing; aluminium cellos were made in the late 1920s and 1930s.',
      'The bow is shorter and heavier than a violin bow, averaging about 73 cm. It is traditionally strung with horsehair and rosined. Carbon fibre and fibreglass sticks are used, the latter for cheap student bows.',
    ],
    construction: [
      'The violin family appeared c. 1500, and the cello did not evolve from the viola da gamba; the two existed side by side for about two and a half centuries. The direct ancestor was the bass violin, which Monteverdi called basso de viola da braccio in Orfeo (1607). The earliest surviving cellos are by Andrea Amati.',
      'Early cellos were larger. Many bass violins were cut down to the smaller pattern developed by Stradivari, who made large instruments before 1702 and smaller ones from 1707. The scale length of a modern 4/4 cello is about 70 cm. Size was not standardised until about 1750.',
      'The endpin or spike supports the instrument on the floor and became standard in the mid-19th century. Before that the cello was held with the calves. Baroque cellos also have gut strings, a different neck angle, a shorter fingerboard and an outcurved bow held nearer the balance point.',
      'The ribs are made by heating wood and bending it around forms. Purfling stops cracks at the edge from spreading. The fractional sizes (7/8, 3/4, 1/2 and smaller) refer to volume rather than length.',
    ],
    tuning: [
      'Standard tuning is in fifths: C2, G2, D3, A3. Music is written mostly in bass clef, with tenor and treble clefs for high passages. Fine tuners on the tailpiece are not effective with flexible gut strings.',
      'Bach\'s Suite No. 5 for solo cello was written in scordatura with the A string tuned down to G, though most editions also include a version in standard tuning. Respighi asks for the low C to be lowered to B-flat in The Pines of Rome.',
      'The Suite No. 6 is widely believed to have been written for a five-string violoncello piccolo with an added E string, though evidence is debated. Jazz bassists Oscar Pettiford and Harry Babasin played cello tuned in fourths, an octave above the double bass.',
    ],
    properties: {
      range: 'Open strings C2 to A3. As a solo instrument it uses its whole range from bass to soprano, with parts written in bass, tenor and treble clef.',
      size: 'Scale length about 70 cm for a 4/4 instrument; bow about 73 cm. Ten to fourteen cellists make up a typical orchestral section. Rests on an adjustable endpin.',
      other: [
        'In the modern symphony orchestra the cello is the third largest stringed instrument, after the double bass and the harp.',
        'Baroque cellos are held by the calves with no endpin and use lower-tension gut strings; modern instruments have higher string tension and a louder, more projecting tone with fewer overtones.',
      ],
    },
    variants: [
      { name: 'Viola da gamba (viol)', where: 'Spain, Italy, England, France, Germany', how: 'Separate family of fretted bowed instruments, usually with six strings tuned in fourths with a third in the middle, held on or between the legs with an underhand bow grip. Developed in the late 15th century; revived in the 20th.' },
      { name: 'Violone', where: 'Europe', how: 'Term for several large bowed instruments of the viol or violin family, sometimes fretted, some of cello size and some an octave below notated pitch. Today often means the double-bass viol.' },
      { name: 'Violoncello piccolo', where: 'Baroque Europe', how: 'Smaller five-string cello with an extra high E string, used as a solo instrument; Bach\'s Suite No. 6 is widely thought to be written for such an instrument.' },
      { name: 'Bass violin (basse de violon)', where: 'Italy and France', how: 'Larger direct ancestor of the cello; many were cut down to the smaller cello pattern. It remained in use in France for about two decades after 1700.' },
      { name: 'Cello in Indian classical music', where: 'India', how: 'Adapted by Saskia Rao-de Haas, Nancy Lesh (Dhrupad) and Anup Biswas, who play seated cross-legged on the floor.' },
      { name: 'Double bass', where: 'Europe', how: 'Closest relative in the modern orchestra, tuned in perfect fourths rather than fifths and often doubling the cello line an octave lower.' },
    ],
    music: [
      'The best known solo works are Bach\'s six unaccompanied suites, other notable works being concertos by Vivaldi, Haydn, Schumann, Dvorak, Saint-Saens and Elgar, and sonatas by Beethoven and Brahms.',
      'In the 20th century the repertoire grew greatly, partly through Mstislav Rostropovich, who inspired, commissioned and premiered dozens of works, including concertos by Shostakovich and Lutoslawski and Britten\'s Cello Symphony.',
      'Cello is the bass voice of the string quartet and the section leader of the orchestral bass line, doubled an octave lower by basses. Cello ensembles such as the Twelve of the Berlin Philharmonic play arrangements. Pop uses include the Beatles\' Eleanor Rigby and the Finnish group Apocalyptica.',
    ],
    traditions: [
      'In the Baroque period the cello, viola da gamba or bassoon played the bass line of the basso continuo alongside chordal instruments such as organ, harpsichord or lute.',
      'Bach\'s suites were little known until Pablo Casals found a Grutzmacher edition in a Barcelona shop in 1889, aged 13. He performed them publicly and recorded them from 1936 to 1939, the first complete recording. In 2019 the Library of Congress selected it for the National Recording Registry.',
      'The endpin is widely credited with making the cello more appealing to women, who were previously constrained by the dress and fashion of the time. Some players of Baroque music still omit the endpin in period performance.',
    ],
    sources: [
      { title: 'Cello', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cello' },
      { title: 'Wolf tone', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Wolf_tone' },
      { title: 'Cello Suites (Bach)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cello_Suites_(Bach)' },
      { title: 'Viol', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Viol' },
      { title: 'Endpin', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Endpin' },
      { title: 'Violone', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Violone' },
    ],
  },
  {
    id: 'orchestra',
    name: 'Symphony orchestra',
    players: ['elena'],
    family: 'Large mixed ensemble (strings, woodwinds, brass, percussion)',
    physics: [
      'An orchestra is a set of instruments of different families, each making sound differently. Strings are bowed, woodwinds are blown across edges or reeds, brass are buzzed into mouthpieces, and percussion is struck. The sources give no physical model of how the sections blend, so blend is described below mainly in terms of the room.',
      'The hall is part of the instrument. Reverberation time (T60) is the time for sound to fall 60 dB after the source stops. Wallace Clement Sabine, who founded architectural acoustics at Harvard, found it rises with room size and falls with absorption, measuring it with organ pipes and a stopwatch.',
      'Boston Symphony Hall, which Sabine advised on, is a long, narrow, high shoebox like Amsterdam\'s Concertgebouw and Vienna\'s Musikverein, 38.1 m long, 22.9 m wide and 18.6 m high. Sloping stage walls help focus the sound, and a wooden stage floor, shallow balconies and a coffered ceiling help.',
      'Herbert von Karajan reportedly preferred it to the Musikverein for much music because of its slightly lower reverberation time. Orchestra size varies from 70 to over 100 players depending on repertoire and venue.',
    ],
    materials: [
      'Strings (violin, viola, cello, double bass) are spruce and maple bodies strung with gut, steel or synthetic strings. Woodwinds are flute, oboe, clarinet and bassoon, sometimes with piccolo, cor anglais, bass clarinet and contrabassoon.',
      'Brass are horn, trumpet, trombone and tuba, sometimes cornet or euphonium. Percussion includes timpani, snare and bass drums, cymbals, triangle, tambourine, tam-tam and mallet instruments.',
      'The harp is regularly included, especially for Romantic repertoire, and a keyboard section (piano, celesta, harpsichord, organ) may appear. Electronic instruments and guitars are added for some modern works.',
    ],
    construction: [
      'Baroque orchestras were not standardised. Bach\'s ensemble in Cothen had up to 18 players; Corelli\'s in Rome ranged from 35 to 80 and was enlarged to 150 on special occasions. A basso continuo group, such as harpsichord or organ with bass instruments, played an important part.',
      'The Classical orchestra standardised around a small to medium string section with paired oboes, flutes, bassoons and horns, later clarinets and trumpets. The standard doubled winds and brass are generally attributed to Beethoven, whose Ninth added a second pair of horns, piccolo, contrabassoon, trombones and chorus.',
      'Piston and rotary valves for brass (1815) and Boehm\'s flute keywork changed the instruments, leading Berlioz to write an early systematic treatise on instrumentation. Wagner\'s Bayreuth orchestra grew further (Das Rheingold calls for six harps), and Mahler\'s later symphonies, such as No. 8, pushed size to the limit, with orchestras of up to about 120.',
      'Seating changed too. In the 19th century first and second violins usually sat on opposite sides (violin I, cello, viola, violin II), which made the crossing of their parts audible. Today the strings are most often arranged clockwise around the conductor, with basses behind the cellos; Bartok\'s Music for Strings, Percussion and Celesta calls for antiphonal strings.',
    ],
    tuning: [
      'Most orchestras tune to an A given by the oboe, a convention about 300 years old, though some use an electronic tone generator, and many oboists check against an electronic tuner. The concertmaster leads the pre-concert tuning, and the orchestra tunes to a piano if one is used.',
      'The ISO defines international standard pitch as A440; the standard was adopted in 1955 and reaffirmed in 1975 as ISO 16. In practice orchestras vary: in 1964, 19 of 31 leading U.S. orchestras used 440 and the others 441 or 442, and a 1987 survey found most between 440 and 444.',
      'Some orchestras play higher. The Berlin Philharmonic now uses 443 Hz, below its earlier 445. Ensembles playing Baroque music have largely agreed on A = 415 Hz, close to a semitone below 440, while certain German works are tuned to Chorton, about 460 to 470 Hz. Cuban orchestras reportedly use 436 to make scarce strings last.',
      'Pitch has varied widely. Before the 19th century there was no coordinated standard and it varied by several semitones between cities. A French law of 1859 set the diapason normal at A = 435 Hz; Britain\'s old philharmonic pitch was about 452 and was replaced in 1896 by a new philharmonic pitch of 439.',
    ],
    properties: {
      range: 'The combined range of its instruments; the tuning reference is A above middle C, 440 Hz in most orchestras.',
      size: 'Full symphony orchestra 70 to over 100 players; chamber orchestra up to around 50; Wagner and Mahler scores call for up to about 120.',
      other: [
        'A Baroque ensemble can be one player per part, while Romantic orchestras use many players per string part.',
        'Strings are divided into first and second violins, violas, cellos and basses, each led by a principal who sits on the outside of the first desk, closest to the audience.',
      ],
    },
    variants: [
      { name: 'Gamelan', where: 'Java, Bali and Sunda, Indonesia', how: 'Ensemble of mostly tuned bronze percussion (metallophones, gongs) and kendang drums, with rebab, flutes, siter and singers. Uses sléndro (five-note) and pélog (seven-note) tunings; Balinese instruments are built in pairs tuned slightly apart to beat. UNESCO inscribed in 2021.' },
      { name: 'Chinese orchestra (huayue tuan)', where: 'China and overseas Chinese communities', how: 'A 20th-century ensemble modelled on the symphony orchestra but with Chinese instruments in four sections: bowed strings, plucked strings, winds and percussion. It grew from the Jiangnan sizhu ensemble in the 1920s.' },
      { name: 'Takht', where: 'Egypt and Syria (Arab world)', how: 'The prototypical Arabic ensemble, typically oud, qanun, ney, violin and rhythm instruments; the word literally means sofa. Orchestral instruments were added in the 20th century by composers including Mohamed Abdel Wahab.' },
      { name: 'Gagaku', where: 'Japan', how: 'Imperial court music in its near-current form since the 10th century. The ensemble has three winds (hichiriki, ryuteki, sho), three percussion instruments (kakko, shoko, taiko) and two strings (gakubiwa, gakuso).' },
      { name: 'Carnatic ensemble', where: 'South India', how: 'A small group of a lead vocalist, violin, mridangam and tambura drone, with other instruments added as needed.' },
    ],
    music: [
      'Orchestras play symphonies, concertos, opera and ballet overtures, and form the pit ensemble for opera, ballet and some musical theatre. The Classical-era model of Haydn and Mozart was extended by Beethoven, Berlioz, Brahms, Wagner and Mahler.',
      'Orchestras are also used extensively in film music, television and video game scores, in accompanying rock and pop concerts, and in the symphonic metal genre. The term can also describe a jazz big band.',
      'Some repertoire demands odd forces: Mahler\'s Symphony No. 8 uses very large forces; Ravel and Prokofiev scores include saxophone; Holst\'s The Planets uses tenor tuba (euphonium); Stravinsky\'s Rite of Spring uses Wagner tuba.',
    ],
    traditions: [
      'By about 1820 a dedicated conductor who did not play was the norm, and the baton became common because it is easier to see than bare hands. Mendelssohn is said to be the first to use a wooden baton. Stokowski began conducting without one in 1929 to 1930, and Toscanini used a long, large baton.',
      'The concertmaster is second in command to the conductor and leads tuning and bowings. Professional players audition, often behind a screen; the Vienna Philharmonic admitted its first woman, harpist Anna Lelkes, in 1997.',
      'Amateur and youth orchestras range from school and university groups to community orchestras. El Sistema, founded in Venezuela in 1975 by Jose Antonio Abreu with 11 students in a parking garage, teaches children by having them play in groups from the start. By 2015 it had more than 400 centres and 700,000 young musicians, and has inspired programmes in over 60 countries.',
    ],
    sources: [
      { title: 'Orchestra', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Orchestra' },
      { title: 'Concert pitch', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Concert_pitch' },
      { title: 'String section', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/String_section' },
      { title: 'Conducting', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Conducting' },
      { title: 'Symphony Hall, Boston', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Symphony_Hall,_Boston' },
      { title: 'El Sistema', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/El_Sistema' },
    ],
  },
{
  id: 'trumpet',
  name: 'Trumpet',
  players: ['corny'],
  family: 'Lip-reed aerophone (brass instrument; Hornbostel-Sachs trumpet class)',
  physics: [
    'Sound starts at the player\'s lips. Air blown through slightly separated lips makes them buzz inside the mouthpiece, and that buzz sets up a standing wave in the air column of the tube. The lips act as the vibrating valve (a "lip reed"), and the tube resonates in sympathy with them.',
    'The player chooses a pitch by changing lip aperture, tension and air flow (the embouchure), which selects one harmonic from the series the tube currently allows. Valves, slides or crooks change the tube length and so swap in a different harmonic series.',
    'Pressed against the lips, the trumpet behaves as a closed tube, so on its own it would favour only every other overtone of a harmonic series. The flared bell (and the mouthpiece) reshape the resonances so the missing overtones become audible. Brass instruments are defined by this lip-reed method of sound production, not by being made of brass; the alphorn, cornett and didgeridoo are wooden labrosones.',
    'Some numbers: a standard B♭ trumpet has about 1.48 m of tubing, and its usual range runs from the F♯ below middle C (F♯3) to the high C (C6), with higher notes possible. Valve 1 lowers the pitch a whole step, valve 2 a half step and valve 3 a step and a half. The seventh partial is noticeably flat of equal temperament, so its fingerings are generally avoided.',
    'A deeper, wider mouthpiece cup generally gives a darker sound. Mutes placed in or over the bell (straight, cup, harmon, plunger, bucket, practice) lower the volume and change the timbre.'
  ],
  materials: [
    'Trumpets are normally made of brass tubing, polished and then lacquered to prevent corrosion; higher-cost instruments may be gold or silver plated. Brass is an alloy of copper and zinc, and brasses with more copper are softer and more golden in colour while those with more zinc are harder and more silvery.',
    'Copper- and silver-bearing alloys are biostatic (they suppress mould, fungi and bacteria), which is one stated reason stainless steel or aluminium instruments, though good-sounding, become unpleasant to play. Plastic trumpets also exist.',
    'Mutes are made from fibreglass, plastic, cardboard, metal (often aluminium), with cork to hold them in place. An aluminium straight mute gives a bright, piercing sound, while other materials give a darker, stuffier tone.'
  ],
  construction: [
    'Early trumpets were signalling instruments. The natural trumpet of the late Middle Ages and Renaissance was a coiled valveless tube that could play only one overtone series; players changed keys by changing crooks. Surviving Baroque-era examples were made by Nuremberg families such as Schnitzer, Hainlein, Haas and Ehe, and by William Bull in London. Some modern Baroque trumpets have three or four vent holes to correct out-of-tune harmonics.',
    'Valves came in the early nineteenth century. Heinrich Stölzel developed his valve for the horn (sources give 1814 for the first application and 1818 for the first patent), and Friedrich Blühmel designed a similar system independently; the two registered a joint ten-year patent on 12 April 1818. Valved trumpets followed around 1820. François Périnet patented the modern piston valve in 1839; the Vienna (double-piston) valve survives in Austrian orchestras.',
    'Most modern trumpets have three piston valves. Rotary-valve trumpets are more common in German and Austrian orchestral playing. The cornet has more conical tubing and a mellower tone; the flugelhorn is even more conical and mellower still. All three are pitched in B♭ with the same valve layout.',
    'Slide mechanisms on the first and third valves let the player correct notes that are slightly out of tune, usually with the left thumb and ring finger. Renold Schilke designed a tuning-bell trumpet that moves the tuning slide into the bell section to reduce intonation problems.'
  ],
  tuning: [
    'The standard trumpet is a transposing instrument in B♭: written pitches sound a whole step lower. Trumpets in C sound at concert pitch and are common in American orchestral playing. Trumpets in D, E♭, piccolo trumpets (an octave higher) and bass trumpets also exist, and orchestral players learn to transpose at sight.',
    'The main tuning slide sets the overall pitch: pulling it out lowers the pitch and pushing it in raises it. Pitch can also be bent with the embouchure. Alternate fingerings, for example 3 instead of 1-2, give the player a choice of the best-tuned option for a note.',
    'On the natural trumpet, players such as Girolamo Fantini showed that "lipping" the impure 11th and 13th harmonics into tune in the extreme upper register made diatonic scales and melodies possible.',
    'A fourth valve on some trumpets lowers a perfect fourth, and some players use a quarter-tone valve designed to play Arab maqams (Ibrahim Maalouf uses such a trumpet, made by his father).'
  ],
  properties: {
    range: 'Standard range F♯3 to C6 (the F♯ below middle C up to high C two octaves above middle C); B♭ instruments sound a whole step lower than written; extreme high register and pedal tones below F♯3 are possible.',
    size: 'About 1.48 m of tubing for a B♭ trumpet, coiled into a compact oblong shape; piccolo trumpet tubing is about half that length.',
    other: [
      'Natural brass instruments, including trumpets before about 1795, play only the notes of the harmonic series.',
      'Extended techniques include flutter tonguing, growling, multiphonics (humming while playing), circular breathing, valve tremolo and half-valve glissandi.'
    ]
  },
  variants: [
    { name: 'Natural (Baroque) trumpet', where: 'Europe', how: 'Valveless coiled brass trumpet playing one harmonic series; the high "clarino" register gave the Baroque "Golden Age" repertoire, with modern copies often fitted with vent holes.' },
    { name: 'Shofar', where: 'Jewish ritual practice', how: 'Ram\'s horn without pitch-altering devices; all pitch control comes from the player\'s embouchure. Blown on Rosh Hashanah, at the end of Yom Kippur and in the month of Elul.' },
    { name: 'Alphorn', where: 'Switzerland and the Alps', how: 'Long straight wooden horn, 3 to 4 m, conical bore and cup mouthpiece, traditionally carved from a pine; plays only natural harmonics (about the 1st to 16th partials) and carries for kilometres.' },
    { name: 'Yiḏaki (didgeridoo)', where: 'Yolŋu and other Aboriginal peoples of northern Australia', how: 'Wooden drone pipe, often a termite-hollowed eucalyptus, played with vibrating lips and circular breathing; yiḏaki is the Yolŋu name, while "didgeridoo" is not an Aboriginal word. Its age is debated.' },
    { name: 'Kakaki', where: 'Hausa, Yoruba and Nupe societies, West Africa', how: 'Metal ceremonial trumpet three to four metres long, associated with royalty and played at the palace of a king or sultan; exclusively played by men.' },
    { name: 'Dungchen', where: 'Tibetan and Mongolian Buddhism', how: 'Long horn used in Tibetan Buddhist ceremonies, often played in pairs; the name means "big conch", and its sound is compared to the singing of elephants.' },
    { name: 'Conch shell trumpet (shankha)', where: 'India, Nepal, Tibet, Pacific islands, Mesoamerica', how: 'A large marine snail shell blown like a natural trumpet; the natural conical bore gives notes from the harmonic series. In India the sacred chank Turbinella pyrum is called shankha.' },
    { name: 'Vuvuzela', where: 'South Africa', how: 'Plastic horn about 65 cm long producing a loud monotone near B♭3, a symbol of South African football; it reaches about 120 dB(A) at one metre.' }
  ],
  music: [
    'Jazz begins largely with the cornet and trumpet. Buddy Bolden, a New Orleans cornetist whose band was at its peak around 1900 to 1907, was known for loud sound and improvisation (no recordings survive). Louis Armstrong, born in New Orleans in 1901, shifted jazz from collective improvisation to solos, with the Hot Five and Hot Seven recordings; his switch from cornet to trumpet is often cited as the trumpet overtaking the cornet in jazz.',
    'Dizzy Gillespie, building on Roy Eldridge, helped create bebop in the 1940s with Charlie Parker. Miles Davis is widely considered one of the most influential musicians of the twentieth century, known for phrasing and use of space.',
    'In New Orleans, brass band parades organised by Social Aid and Pleasure Clubs include a "second line" of followers who dance along behind the band. In Mexico, the popularity of jazz and Cuban music introduced the trumpet into mariachi, and a usual mariachi group today has as many as eight violins and two trumpets; UNESCO recognised mariachi as Intangible Cultural Heritage in 2011.',
    'In art music, Cesare Bendinelli is among the specialists who developed the high clarino register of the Baroque Golden Age. Anton Weidinger developed a keyed trumpet in the 1790s, and Haydn wrote his Trumpet Concerto for it in 1796. Orchestras, concert bands, brass quintets and fanfares all use the instrument; the Arban Complete Conservatory Method is a standard teaching text.'
  ],
  traditions: [
    'The earliest trumpets (2nd millennium BC and earlier, including Tutankhamun\'s bronze and silver pair) were signalling instruments for war, hunting and ritual, not music. The Greek salpinx was a straight trumpet of bone or bronze, and salpinx contests were part of the original Olympic Games.',
    'Many ceremonial horns are tied to authority or worship: the shofar in Jewish liturgy, the kakaki in the weekly sara (statement of power) at Hausa courts, and the dungchen in Tibetan Buddhist ceremony. The modern bugle continues the signalling role.',
    'The International Trumpet Guild is an international association with a library of scholarly journals. Berlioz complained in 1844 that composers had confined the trumpet to commonplace rhythmic formulae, a limit of the natural trumpet that valves later lifted.'
  ],
  sources: [
    { title: 'Trumpet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Trumpet' },
    { title: 'Brass instrument', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Brass_instrument' },
    { title: 'Brass instrument valve', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Brass_instrument_valve' },
    { title: 'Heinrich Stölzel', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Heinrich_St%C3%B6lzel' },
    { title: 'Natural trumpet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Natural_trumpet' },
    { title: 'Shofar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Shofar' },
    { title: 'Alphorn', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Alphorn' },
    { title: 'Didgeridoo', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Didgeridoo' },
    { title: 'Kakaki', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kakaki' },
    { title: 'Dungchen', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dungchen' }
  ],
},
{
  id: 'saxophone',
  name: 'Saxophone',
  players: ['lena'],
  family: 'Single-reed aerophone with conical bore (woodwind, made of brass)',
  physics: [
    'Sound is produced when a cane reed on a mouthpiece vibrates and sends a sound wave into the body. Pitch is controlled by opening and closing holes along the body, which changes the effective length of the air column; leather pads on keys close the holes.',
    'The bore is conical, not cylindrical like the clarinet. Adolphe Sax wanted an instrument that overblows at the octave, unlike the clarinet which rises by a twelfth, so that the fingering is identical in both registers. An octave (register) key raises the lower notes by one octave; alto and larger saxophones have two octave vents, operated through a single key by about the turn of the twentieth century.',
    'Keyed range runs from the written B♭ below middle C up to a high F (many modern instruments add a high F♯, some sopranos a high G). Notes above are altissimo and need advanced embouchure and fingering combinations.',
    'Mouthpiece shape strongly affects timbre. A 1972 study ranking mouthpieces from dark-mellow to edgy-bright found the darkest gave a strong fundamental with energy mostly in the lower harmonics, while brighter pieces had higher harmonics that did not fall off smoothly. The effect of mouthpiece material itself is debated; Larry Teal held that physical dimensions, not material, set tone colour.'
  ],
  materials: [
    'The saxophone is classed as a woodwind because of its single reed, but the body and key cups have been made from sheet brass since the earliest days, which can be worked into complex shapes. Higher-copper brasses, sterling silver (King from the 1930s, Yanagisawa from the 1980s), nickel silver and phosphor bronze have also been used for bodies.',
    'Finishes include clear or coloured acrylic lacquer, silver or gold plating (gold needs a silver underplating) and nickel plating on student models or keywork. Key buttons are plastic or mother of pearl; rods and springs are blued or stainless steel; felt, cork and leather cushion the mechanism.',
    'Reeds are cut from cane of Arundo donax (fibreglass and composite reeds exist). Saxophone reeds are wider than clarinet reeds of the same length. Mouthpieces may be hard rubber (ebonite), plastic, bronze or stainless steel, and more rarely wood, glass or Delrin.'
  ],
  construction: [
    'Adolphe Sax, a Belgian maker who was also a flautist and clarinetist, designed the instrument around 1840 after improving the bass clarinet, and moved from Brussels to Paris in 1842. He received a 15-year patent on 28 June 1846 covering 14 instruments in two groups of seven (C and F, and B♭ and E♭), from sopranino to contrabass. The B♭ and E♭ series became the standard; the patent expired in 1866.',
    'Sax\'s keywork was based on the Triébert oboe for the left hand and the Boehm clarinet for the right. Buffet Crampon patented an extra bell key in 1887 for low B♭. The modern layout emerged in the 1930s-40s: right-side bell keys (Conn, King), Selmer Balanced Action (1936) and Super Action (1948) with offset stack keys, and the high F♯ key.',
    'The modern family is B♭ and E♭ instruments: soprano, alto, tenor and baritone are most common, with sopranino and bass in saxophone choirs. Alto and larger saxophones have a detachable curved neck and a U-shaped bow; sopranos are often straight. All use the same fingering, so players can switch sizes easily.'
  ],
  tuning: [
    'Saxophones are almost always transposing instruments, written in treble clef for each size. The widely used members are the B♭ soprano, E♭ alto, B♭ tenor and E♭ baritone. C soprano and C melody saxophones (non-transposing, for reading piano music) were parlour instruments in the early twentieth century and disappeared in the Great Depression.',
    'Historically some "high pitch" saxophones were tuned sharper than A=440 Hz for outdoor use and were produced into the early twentieth century; "low pitch" instruments match modern tuning. Intonation is also affected by key design, which is why the high F♯ key took decades to gain acceptance.',
    'Pitch is shaped by the player\'s embouchure and reed choice; commercial reeds vary in hardness and players try different strengths to match the mouthpiece. Playing the altissimo register depends on embouchure control and special fingerings.'
  ],
  properties: {
    range: 'Written B♭ below middle C to high F (high F♯ or G on many instruments), about two and a half octaves, with altissimo above; sounding pitch depends on the instrument\'s transposition.',
    size: 'From the sopranino, which is nearly straight, to the baritone, bass and contrabass with extra bends; only the baritone, alto, tenor and soprano are commonly seen.',
    other: [
      'Brass body, single cane reed, conical bore: it blends woodwind agility with brass projection.',
      'Nearly all baritones add a key to low A.'
    ]
  },
  variants: [
    { name: 'Tárogató (modern)', where: 'Hungary', how: 'Single-reed, conical-bore wooden instrument, usually grenadilla, invented in the 1890s by Vencel József Schunda as a recreation of the older Hungarian double-reed tárogató; the B♭ soprano is about 74 cm with a mournful tone between English horn and soprano saxophone.' },
    { name: 'Clarinet (comparison)', where: 'Europe', how: 'Single reed on a cylindrical bore that overblows at the twelfth rather than the octave, and so needs more keywork than the saxophone for the same range.' },
    { name: 'Saxophone in Carnatic music', where: 'South India', how: 'Kadri Gopalnath (1949-2019), from a Naadaswaram-playing family in Dakshina Kannada, adapted the alto saxophone for Carnatic music after hearing the Mysore Palace band and was called "Saxophone Chakravarthy".' },
    { name: 'Afrobeat horn section', where: 'Nigeria', how: 'Fela Kuti\'s band often used two baritone saxophones; Kuti himself mainly played saxophone and keyboards.' },
    { name: 'Makossa saxophone', where: 'Cameroon', how: 'Manu Dibango (1933-2020) fused jazz, funk and traditional Cameroonian music; his 1972 single "Soul Makossa" is widely sampled.' },
    { name: 'Conn-O-Sax and Saxello', where: 'United States', how: '1920s design experiments including the Conn-O-Sax saxophone-English horn hybrid and the King Saxello straight soprano.' }
  ],
  music: [
    'Military bands came first: French and Belgian bands quickly adopted the instrument, and by 1856 the Garde Républicaine band featured eight. Most French and Belgian bands include a quartet of soprano, alto, tenor and baritone.',
    'In the United States, Edward Lefebre and Patrick Gilmore\'s 22nd Regiment band promoted it from 1873. Ragtime bands led by W. C. Handy and James Reese Europe, vaudeville and dance bands introduced it to the public, then Rudy Wiedoeft sparked a 1920s "saxophone craze".',
    'Jazz: Coleman Hawkins made the tenor a solo voice in the Fletcher Henderson band (1923-34) and his 1939 "Body and Soul" marked the saxophone as equal to the trumpet. Lester Young offered a smoother, more linear approach. Charlie Parker became the icon of bebop; John Coltrane, Ornette Coleman and Pharoah Sanders drove the 1960s avant-garde. R&B "honkers" and jump bands included Illinois Jacquet and Louis Jordan.',
    'Classical saxophone grew through Marcel Mule\'s quartet (from 1928) and Sigurd Raschèr (from 1931); saxophone teaching at the Paris Conservatoire was suspended from 1870 to 1900, and Mule established it there from the 1940s.'
  ],
  traditions: [
    'Concert bands usually call for two E♭ altos, a B♭ tenor and an E♭ baritone; the classical saxophone quartet is soprano, alto, tenor, baritone. Schools such as the French school (Mule) and Raschèr school favour different mouthpiece chambers and tone concepts.',
    'In the United States, Larry Teal at the University of Michigan and programmes at Northwestern, Indiana and Eastman became recognised centres for classical saxophone study.'
  ],
  sources: [
    { title: 'Saxophone', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Saxophone' },
    { title: 'Clarinet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Clarinet' },
    { title: 'Tárogató', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/T%C3%A1rogat%C3%B3' },
    { title: 'Kadri Gopalnath', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kadri_Gopalnath' },
    { title: 'Manu Dibango', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Manu_Dibango' },
    { title: 'Fela Kuti', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fela_Kuti' }
  ],
},
{
  id: 'flute',
  name: 'Flute',
  players: ['felix'],
  family: 'Edge-blown aerophone (flute)',
  physics: [
    'Flutes make sound when a stream of air is directed across an opening and strikes an edge. The airstream creates a low-pressure (Bernoulli or "siphon") effect that pulls the jet alternately inside and outside the opening; this alternately pressurises and rarefies the air in the resonator tube, so the air column vibrates at a frequency set by the tube\'s dimensions.',
    'The player changes pitch by opening and closing tone holes, which changes the effective length of the resonator. By varying air pressure the player can also make the air resonate at a harmonic instead of the fundamental. The open cylindrical flute overblows at the octave, like the oboe, bassoon and saxophone (unlike the clarinet).',
    'Headjoint geometry is critical to tone, and the acoustic impedance of the embouchure hole appears the most critical parameter, depending on the chimney length and diameter and the curvature of its edges. This is why breath direction, lip position and embouchure shape the tone so strongly.',
    'Open-ended flutes have more harmonics, more flexibility and brighter timbres than closed-end flutes. The ratio of length to bore also colours timbre: the quena, with a ratio of about 16 to 20, has a darker, more textured tone than the Western concert flute at about 38 to 20.'
  ],
  materials: [
    'Historically flutes were made of reed, bamboo, wood, bone, glass and nephrite. Modern Western flutes are mostly metal: nickel, silver-plated brass or solid silver for students, solid silver, gold and sometimes platinum for professionals, and wooden flutes in African blackwood with silver or gold keys.',
    'A blind listening study with professional flautists found no appreciable effect of wall material on sound colour or dynamic range, and only the silver flute was correctly identified in a second test; maker preference and tradition therefore matter alongside acoustics.',
    'Non-Western flutes use local plants: bansuri from a bamboo shaft (the best bamboo is generally said to come from the Nagercoil area), shakuhachi from the root end of madake bamboo, the ney from giant reed (Arundo donax), and dizi from purple or white bamboo, with a few made of jade or stone.'
  ],
  construction: [
    'The Western concert flute descends from the medieval German flute and was perfected by Theobald Boehm between 1832 and 1847. Inspired by Charles Nicholson\'s large-holed flute heard in London in 1831, he used large tone holes, full venting and axle-mounted keys with open rings (brille), first making a conical bore in 1832 and then a cylindrical bore with a parabolic contraction near the embouchure in 1847.',
    'Boehm\'s first flutes were silver. The Boehm system was adopted almost universally in the second half of the nineteenth century for orchestra, bands and chamber music. Before it, flutes were wooden with eight keys and small holes; the one-keyed wooden Baroque flute is played in historically informed practice.',
    'Flutes divide into side-blown (transverse) such as the concert flute, fife, dizi and bansuri; end-blown such as the ney, shakuhachi and quena; and fipple (duct) flutes such as the recorder and tin whistle, whose duct makes them easier to play but gives the player less tonal control.'
  ],
  tuning: [
    'The standard concert flute is pitched in C with a three-octave range starting from middle C (or a half step lower with a B foot). Related sizes include the piccolo (an octave higher), the G alto and C bass flutes.',
    'Traditional flutes are usually tuned by the cut length of the tube. The dizi is tuned by its single piece of bamboo; in the 1920s Zheng Jinwen inserted a copper joint so its length could be adjusted for orchestras. Neys come in sets in different keys (rast, dukah, busalik, jaharka, nawa, hussayni, ajam), and advanced players own several.',
    'The tin whistle is diatonic and named by its lowest note, the tonic of its major key. The shakuhachi\'s five holes give a minor pentatonic scale, and the player bends pitch with meri (lowering) and kari (raising) head angles. Microtonal inflection, by partial hole covering and embouchure, is crucial to ney and bansuri playing.'
  ],
  properties: {
    range: 'Concert flute: about three octaves from middle C (C4) upward, or from B3 with a B foot.',
    size: 'The bansuri is typically 30 to 75 cm long; the shakuhachi is traditionally 1.8 shaku, about 54.5 cm; the concert flute is a metal tube with a headjoint closed at the top.',
    other: [
      'The oldest confirmed musical instruments are bone flutes about 42,000 to 43,000 years old from Geißenklösterle in Germany; a 9,000-year-old Chinese bone flute from Jiahu is still playable.',
      'Most Western concert flutes conform to Boehm\'s design.'
    ]
  },
  variants: [
    { name: 'Bansuri', where: 'India (also Nepal and Sri Lanka)', how: 'Side-blown keyless bamboo flute with six finger holes in Hindustani music; the South Indian venu or pullanguzhal has eight and is used in Carnatic music. Associated with Krishna.' },
    { name: 'Ney', where: 'Persia, Turkey, Arab world, Egypt', how: 'End-blown flute of hollow giant reed, played for over 4,500 years; Persian neys have six holes, Turkish and Arabic ones seven. Microtonal intervals are central.' },
    { name: 'Shakuhachi', where: 'Japan', how: 'End-blown bamboo flute with four front holes and one back hole, developed in the 16th century as the fuke shakuhachi; used by Fuke Zen komusō monks for suizen (blowing meditation) and honkyoku.' },
    { name: 'Dizi', where: 'China', how: 'Transverse bamboo flute with an extra mo kong (membrane hole) covered by a reed membrane (dimo), giving a bright, buzzing, nasal quality.' },
    { name: 'Quena', where: 'The Andes', how: 'Notched, end-blown cane flute with six finger holes and one thumb hole, normally in G; the larger quenacho is in D. Used in traditional Andean music and nueva canción.' },
    { name: 'Irish flute', where: 'Ireland', how: 'Simple-system, conical-bore wooden flute of the early 19th-century type, strongest in Roscommon, Leitrim, Sligo, south Fermanagh, east Galway, Clare and west Limerick.' },
    { name: 'Tin whistle', where: 'Britain and Ireland', how: 'Six-holed fipple flute, also called penny whistle, closely associated with Irish traditional music.' },
    { name: 'Native American flute', where: 'Native nations of North America', how: 'Two-chambered duct flute with open finger holes and a block directing the breath, needing no embouchure; known by many names, including courting flute and, in Lakota, Šiyótȟaŋka.' }
  ],
  music: [
    'Western classical music uses the Boehm flute in orchestras, chamber groups and wind ensembles, from the wooden Baroque flute through the Romantic era to modern repertoire and jazz.',
    'Irish traditional music uses the wooden simple-system flute and the tin whistle for dance tunes. In Hindustani classical music, Hariprasad Chaurasia (born 1938) developed the bansuri as a concert instrument, trained under Annapurna Devi of the Maihar gharana, and formed the film-composing partnership Shiv-Hari with santoor player Shivkumar Sharma.',
    'The ney is used in Sufi music; in the Mevlevi sema ceremony the ney taksim (improvisation) symbolises the Divine breath that gives life to everything. The shakuhachi plays honkyoku, solo pieces paced by breathing, as well as ensemble music with koto and shamisen, folk music and jazz.',
    'The dizi features in Chinese folk music, opera and orchestras; the quena in Andean traditional and nueva canción music (for example Illapu).'
  ],
  traditions: [
    'In Hindu tradition Krishna is depicted with the bansuri, associated with the Rasa lila; Sanskrit texts call the flute vaṃśi.',
    'The Fuke sect of Zen Buddhism, the komusō or "priests of nothingness", used the shakuhachi as a spiritual tool and travelled while playing; the sect was abolished with the Meiji Restoration in 1868, and much of its honkyoku repertoire was lost.',
    'Mevlevi (whirling dervish) ceremonies place the ney at the heart of the ritual, and Sultan Selim III played the ney. Native American flutes are known by many names across nations, and the English term courting flute reflects one traditional use.'
  ],
  sources: [
    { title: 'Flute', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Flute' },
    { title: 'Boehm system', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Boehm_system' },
    { title: 'Flue pipe', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Flue_pipe' },
    { title: 'Bansuri', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Bansuri' },
    { title: 'Ney', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ney' },
    { title: 'Shakuhachi', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Shakuhachi' },
    { title: 'Dizi (instrument)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dizi_%28instrument%29' },
    { title: 'Quena', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Quena' },
    { title: 'Tin whistle', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tin_whistle' },
    { title: 'Native American flute', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Native_American_flute' },
    { title: 'Irish flute', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Irish_flute' },
    { title: 'Hariprasad Chaurasia', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Hariprasad_Chaurasia' },
    { title: 'Mevlevi Order', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mevlevi_Order' }
  ],
},
{
  id: 'clarinet',
  name: 'Clarinet',
  players: ['felix'],
  family: 'Single-reed aerophone with cylindrical bore (woodwind)',
  physics: [
    'A cane reed pressed against the mouthpiece acts as a valve. Air pressure bends the reed until it closes on the mouthpiece; a returning pressure wave (or the reed\'s springiness) reopens it, and a puff of air enters the tube about 3 percent above ambient pressure. When played loudly the reed can be shut up to 50 percent of the time.',
    'Because the bore is nearly cylindrical and the reed end is effectively closed, the clarinet behaves like a stopped pipe: it overblows at the twelfth, not the octave, and odd harmonics are primarily reinforced. This gives the characteristic woody tone.',
    'The register key stops the fundamental from being reinforced, so the reed vibrates at three times the frequency, a twelfth above. The low chalumeau register plays fundamentals, the clarion register plays the third harmonic, and the altissimo uses fifth and higher harmonics. The chalumeau register is full and dark, the clarion bright and sweet, the altissimo piercing.',
    'The bore diameter is about 14.6 to 14.9 mm with a subtle hourglass shape that helps pitch and response, and undercut tone holes improve intonation. The bell flares to improve the lowest notes of each register but does not amplify sound; most sound is radiated from the tone holes.'
  ],
  materials: [
    'Most professional clarinets are made of African blackwood (grenadilla, Dalbergia melanoxylon), valued for machinability, density, dimensional stability and moisture repellence. Other woods include Honduran rosewood, cocobolo, mopane, and historically boxwood and ebony.',
    'African blackwood is threatened by overharvesting: the tree takes upwards of 60 years to mature, and it is severely threatened in Kenya and needs attention in Tanzania and Mozambique. Sustainability concerns have driven alternatives such as ABS plastic student models, Selmer\'s Resonite, and Buffet Crampon\'s Greenline composite of resin and blackwood powder left over from manufacture.',
    'Mouthpieces are generally hard rubber (some are plastic, glass, wood, ivory or metal). Reeds are cut from Arundo donax cane in hardness from 1 (soft) to 5 (hard), though the scale is not standardised, and synthetic reeds exist. Ligatures hold the reed to the mouthpiece.'
  ],
  construction: [
    'The clarinet developed from the chalumeau, a recorder-like single-reed instrument with a cylindrical bore and range of about F3 to G4. German maker Johann Christoph Denner (or possibly his son Jacob) is generally credited around 1700 with adding a register key, extending the instrument into a higher register an octave and a fifth above. The earliest mention of the name "clarinette" is a 1710 order.',
    'Iwan Müller\'s 1812 clarinet with seven finger holes and thirteen keys, with stuffed leather pads, made all keys playable. Between 1839 and 1843, Hyacinthe Klosé and Louis Auguste Buffet adapted a Boehm-type ring-and-axle system, giving the Boehm (French) clarinet. Theobald Böhm was not involved in its development.',
    'The Oehler system (German clarinet), presented by Oskar Oehler in the early twentieth century and based on the Baermann/Ottensteiner design, has more tone holes and different fingerings. Boehm is standard everywhere except Germany and Austria, where Oehler survives; the Albert system persists among jazz, klezmer and eastern European folk players. Richard Strauss said French clarinets sounded flat and nasal while German ones approximate the singing voice.',
    'The body has an upper and a lower joint, with a barrel and bell. A modern soprano clarinet has seven finger-covered tone holes and 17 keys.'
  ],
  tuning: [
    'Clarinets are transposing instruments except those in C. The B♭ soprano sounds a whole tone below written pitch, and orchestral players commonly carry both B♭ and A clarinets. Clarinets range from the A♭ piccolo to the BB♭ contrabass.',
    'Modern clarinets are tuned to 440 to 442 Hz. Pitch is adjusted by barrels of different lengths or by pulling out the barrel; temperature and dynamics also affect tuning, and embouchure changes intonation.',
    'The B♭ and A clarinets exist because the chalumeau register spans a twelfth before overblowing; with few keys, the instrument could not play chromatically, so players needed different clarinets for different keys. Even with modern keywork, the A has remained a standard orchestral instrument.'
  ],
  properties: {
    range: 'Notated chalumeau register E3 to B♭4, clarion B4 to C6, altissimo above; the B♭ soprano sounds a whole tone lower than written.',
    size: 'The B♭ soprano has a bore of about 14.6 to 14.9 mm; its weight is supported by the right thumb, while larger clarinets use a neck strap or floor peg.',
    other: [
      'The clarinet has the largest pitch range of the common woodwinds.',
      'Plateau keys from the 1930s allowed use with gloves in cold weather.'
    ]
  },
  variants: [
    { name: 'Turkish clarinet (G clarinet)', where: 'Turkey', how: 'Albert-system clarinet in G, used in Turkish folk music and commonly called the Turkish clarinet.' },
    { name: 'Greek kompania and Balkan clarinet', where: 'Greece, Albania, Bulgaria', how: 'The clarinet features in Greek kompania folk music, Albanian saze and Bulgarian wedding music.' },
    { name: 'Klezmer clarinet', where: 'Eastern European Jewish communities', how: 'The clarinet joined klezmer ensembles in the mid-19th century and now often plays the melody; larger Ukrainian orchestras used C clarinets, and some players use the Albert system.' },
    { name: 'Zummara and arghul (double clarinets)', where: 'Egypt, Levant, Iran, Iraq, Turkey', how: 'Paired cane pipes, each with its own single reed, played by circular breathing; the arghul has a melody pipe of five to seven holes and a longer drone pipe, used for belly dance and dabke.' },
    { name: 'New Orleans jazz clarinet', where: 'United States', how: 'Central to early jazz from the 1910s; Sidney Bechet (also a soprano saxophonist) first recorded in July 1923, and Albert-system clarinets persist in Dixieland.' },
    { name: 'Tárogató', where: 'Hungary', how: 'Modern single-reed, conical-bore Hungarian folk instrument made by Schunda from the 1890s, often in grenadilla; closer to the saxophone than the clarinet.' },
    { name: 'Chalumeau', where: 'Europe', how: 'Early recorder-like single-reed ancestor of the clarinet, with cylindrical bore and no register key.' }
  ],
  music: [
    'In classical music Vivaldi (1716) and Handel (1740) used clarinets early, and Mozart, writing for his friend Anton Stadler, composed the Clarinet Concerto in A (1791) and the Clarinet Quintet. Weber, Brahms and Schumann wrote major works; Stravinsky\'s Three Pieces (1919) and Messiaen\'s "L\'abîme des oiseaux" (1941) are significant solo works.',
    'Jazz: the clarinet was central in early jazz and the big-band era; Gershwin\'s "Rhapsody in Blue" (1924) opens with a famous clarinet glissando. Benny Goodman, the "King of Swing", led one of the most popular big bands from 1935, and his January 16, 1938 Carnegie Hall concert has been called one of the most important jazz concerts. Artie Shaw rose to prominence in the same era.',
    'Vernacular traditions include klezmer, Brazilian choro, Albanian saze, Greek kompania and Bulgarian wedding music, as well as Dixieland revival players such as Pete Fountain.'
  ],
  traditions: [
    'The military band was important to the clarinet\'s future popularity. A clarinet choir tradition first emerged in 1927, producing an effect similar to a human choir.',
    'In Germany and Austria the Oehler clarinet continues in orchestras, while the Reform Boehm system is popular in the Netherlands; the Boehm clarinet is standard elsewhere.',
    'Sustainable sourcing of grenadilla is an ongoing concern for makers and players, reflected in composite instruments such as the Greenline.'
  ],
  sources: [
    { title: 'Clarinet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Clarinet' },
    { title: 'African blackwood', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/African_blackwood' },
    { title: 'Double clarinet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Double_clarinet' },
    { title: 'Arghul', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Arghul' },
    { title: 'Tárogató', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/T%C3%A1rogat%C3%B3' },
    { title: 'Klezmer', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Klezmer' },
    { title: 'Sidney Bechet', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sidney_Bechet' },
    { title: 'Benny Goodman', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Benny_Goodman' }
  ],
},
];

/** Words people use when they ask about each kind of lore. */
const ASK = {
  physics: ['physics', 'science', 'acoustic', 'how does', 'sound', 'vibrat', 'resonan', 'frequency', 'harmonic', 'overtone', 'why does'],
  materials: ['material', 'made of', 'wood', 'metal', 'skin', 'string', 'what is it made'],
  construction: ['made', 'built', 'build', 'construction', 'parts', 'maker', 'invent', 'who made', 'design'],
  tuning: ['tune', 'tuning', 'tuned', 'pitch', 'temperament', 'a440', 'transpos', 'in tune'],
  properties: ['range', 'size', 'how big', 'how low', 'how high', 'weight', 'lowest', 'highest', 'notes'],
  variants: ['culture', 'cultures', 'around the world', 'other countries', 'variant', 'relative', 'similar', 'version', 'nations', 'kinds of'],
  music: ['music', 'genre', 'style', 'used for', 'played in', 'songs', 'famous'],
  traditions: ['tradition', 'ritual', 'ceremony', 'culture', 'custom', 'history'],
} as const;

/** The question words lore is keyed on — broad, so a match on these alone ranks below a player's own facts. */
export const LORE_GENERIC_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(ASK).flat(), 'history', 'origin', 'where', 'from', 'play', 'stroke', 'technique', 'how do i', 'respect', 'sacred', 'allowed',
]);


/** The SOMA drum knowledge base (24 drums) — the percussionist knows every one. */
const DRUM_PLAYERS = ['amara'];
function drumEntries(): KnowledgeEntry[] {
  const out: KnowledgeEntry[] = [];
  for (const d of Object.values(DRUMS)) {
    const k = [d.name.toLowerCase(), d.id.replace(/-/g, ' '), ...d.aka.map((a) => a.toLowerCase())];
    const add = (topic: KnowledgeEntry['topic'], keys: readonly string[], text: string) => out.push({ topic, keys: [...k, ...keys], text, lore: true });
    for (const t of d.origins) add('history', ['history', 'origin', 'where', 'from'], t);
    add('instrument', [...ASK.materials, ...ASK.construction], `${d.name} — shell: ${d.build.shell} Head: ${d.build.head}`);
    add('instrument', ASK.tuning, `${d.name} — tuning: ${d.build.tuning}`);
    add('technique', ['play', 'stroke', 'technique', 'how do i'], `${d.name}: ${d.playing.summary} Strokes: ${d.playing.strokes.map((s) => `${s.name} — ${s.how}`).join(' ')}`);
    for (const t of d.traditions) add('history', ASK.traditions, t);
    if (d.respect) add('history', ['respect', 'sacred', 'ceremony', 'allowed'], d.respect);
  }
  return out;
}

/** One player's lore as knowledge entries (paragraph-sized, keyed for retrieval). */
export function loreKnowledge(playerId: string): KnowledgeEntry[] {
  const out: KnowledgeEntry[] = DRUM_PLAYERS.includes(playerId) ? drumEntries() : [];
  for (const l of INSTRUMENT_LORE) {
    if (!l.players.includes(playerId)) continue;
    // The instrument's name isn't a key: it matches the words of the text lightly, so a player's own
    // hand-written facts still win when both answer the question.
    const add = (topic: KnowledgeEntry['topic'], keys: readonly string[], text: string) => out.push({ topic, keys: [...keys], text, lore: true });
    for (const t of l.physics) add('science', ASK.physics, t);
    for (const t of l.materials) add('instrument', ASK.materials, t);
    for (const t of l.construction) add('instrument', ASK.construction, t);
    for (const t of l.tuning) add('instrument', ASK.tuning, t);
    add('instrument', ASK.properties, `${l.name}: range ${l.properties.range}. Size: ${l.properties.size}. ${l.properties.other.join(' ')}`);
    for (const v of l.variants) add('history', [...ASK.variants, v.name.toLowerCase(), v.where.toLowerCase()], `${v.name} (${v.where}), a relative of the ${l.name.toLowerCase()}: ${v.how}`);
    for (const t of l.music) add('genre', ASK.music, t);
    for (const t of l.traditions) add('history', ASK.traditions, t);
  }
  return out;
}

/** A single fact worth sharing in a quiet moment ("Did you know…"). */
export function loreFact(playerId: string, random: () => number = Math.random): string | undefined {
  const pool: string[] = [];
  for (const l of INSTRUMENT_LORE) {
    if (!l.players.includes(playerId)) continue;
    pool.push(...l.physics, ...l.materials, ...l.construction, ...l.traditions);
    for (const v of l.variants) pool.push(`In ${v.where} there's the ${v.name}: ${v.how}`);
  }
  return pool.length ? pool[Math.floor(random() * pool.length)] : undefined;
}

export const loreById = (id: string): InstrumentLore | undefined => INSTRUMENT_LORE.find((l) => l.id === id);
