// TONOS instrument catalog — the TypeScript mirror of INSTRUMENTS in rust/plajah-audio/src/tonos.rs.
// Index = TN_INSTRUMENT. Append only (saved patches store the index). tests/tonosInstrument.test.ts
// checks this table against the Rust one, field by field.

export type TonosRegion = 'east-asia' | 'south-asia' | 'middle-east' | 'europe' | 'africa';
export type TonosExcite = 'finger' | 'nail' | 'plectrum' | 'bachi' | 'hammer' | 'bow' | 'wheel' | 'harmonic';
export type TonosStop = 'open' | 'fret' | 'fretless' | 'air' | 'tangent';
export type TonosBody = 'wood' | 'skin' | 'tube' | 'gourd';

export interface TonosInstrument {
  name: string;
  region: TonosRegion;
  origin: string;
  excite: TonosExcite;
  /** Index into TONOS_MATERIALS. */
  material: number;
  courses: number;
  stop: TonosStop;
  /** Zithers: speaking length (m) at `reference`; necked: open string length (m). */
  length: number;
  reference: number;
  /** Zithers: L(note) = length · 2^(−alpha·(note − reference)/12). */
  alpha: number;
  /** Necked instruments' open strings (MIDI). Empty = one string per note. */
  opens: number[];
  /** String tension (N). */
  tension: number;
  /** Has a curved jawari / sawari / buzzing bridge. */
  jawari: boolean;
  rattle: 'sesse' | 'sersal' | 'chien' | null;
  sympathetic: number;
  body: TonosBody;
  about: string;
}

export const TONOS_REGIONS: { id: TonosRegion; label: string }[] = [
  { id: 'east-asia', label: 'East Asia' },
  { id: 'south-asia', label: 'South Asia' },
  { id: 'middle-east', label: 'Middle East & Central Asia' },
  { id: 'europe', label: 'Europe' },
  { id: 'africa', label: 'Africa' },
];

export const TONOS_INSTRUMENTS: TonosInstrument[] = [
  { name: "Guzheng", region: 'east-asia', origin: "China", excite: 'nail', material: 7, courses: 1, stop: 'open', length: 1.1, reference: 38, alpha: 0.53, opens: [], tension: 70, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Twenty-one nylon-wrapped steel strings on movable bridges over a long paulownia box, plucked near the bridge with picks; the left hand presses behind the bridges to bend." },
  { name: "Koto", region: 'east-asia', origin: "Japan", excite: 'nail', material: 6, courses: 1, stop: 'open', length: 1.2, reference: 50, alpha: 0.4, opens: [], tension: 110, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Thirteen very taut strings on movable ji bridges over a paulownia body, plucked with ivory tsume picks." },
  { name: "Pipa", region: 'east-asia', origin: "China", excite: 'nail', material: 7, courses: 1, stop: 'fret', length: 0.66, reference: 0, alpha: 0, opens: [45, 50, 52, 57], tension: 75, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Pear-shaped lute with tall frets and no soundhole; fingernail plucks and the rolling lunzhi tremolo." },
  { name: "Erhu", region: 'east-asia', origin: "China", excite: 'bow', material: 0, courses: 1, stop: 'air', length: 0.5, reference: 0, alpha: 0, opens: [62, 69], tension: 70, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Two steel strings with no fingerboard, a horsehair bow trapped between them, and a small drum covered in python skin." },
  { name: "Yangqin", region: 'east-asia', origin: "China", excite: 'hammer', material: 0, courses: 3, stop: 'open', length: 0.8, reference: 45, alpha: 0.45, opens: [], tension: 80, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Struck trapezoid zither: courses of steel strings hit with light rubber-tipped bamboo beaters." },
  { name: "Shamisen", region: 'east-asia', origin: "Japan", excite: 'bachi', material: 4, courses: 1, stop: 'fretless', length: 0.8, reference: 0, alpha: 0, opens: [48, 53, 60], tension: 35, jawari: true, rattle: null, sympathetic: 0, body: 'skin',
    about: "Three silk strings on a fretless neck over a skin-covered drum; the big bachi plucks and slaps the skin, and the strings buzz against the neck (sawari)." },
  { name: "Biwa", region: 'east-asia', origin: "Japan", excite: 'bachi', material: 4, courses: 1, stop: 'fret', length: 0.8, reference: 0, alpha: 0, opens: [45, 52, 57, 59], tension: 30, jawari: true, rattle: null, sympathetic: 0, body: 'wood',
    about: "Satsuma biwa: silk strings over tall frets that buzz (sawari), a wooden pear body, struck with a broad bachi." },
  { name: "Gayageum", region: 'east-asia', origin: "Korea", excite: 'finger', material: 4, courses: 1, stop: 'open', length: 1, reference: 45, alpha: 0.5, opens: [], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Twelve silk strings plucked with the flesh of the fingers; slack strings that the left hand bends and shakes (nonghyeon)." },
  { name: "Haegeum", region: 'east-asia', origin: "Korea", excite: 'bow', material: 4, courses: 1, stop: 'air', length: 0.45, reference: 0, alpha: 0, opens: [56, 63], tension: 40, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Two silk strings with no fingerboard, bowed by hair trapped between them; a bamboo-root resonator with a wooden face, nasal and vocal." },
  { name: "Morin khuur", region: 'east-asia', origin: "Mongolia", excite: 'bow', material: 5, courses: 1, stop: 'air', length: 0.6, reference: 0, alpha: 0, opens: [46, 53], tension: 60, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Horsehead fiddle: two strings of bundled horsehair on a trapezoid box, stopped from the side with the knuckles." },
  { name: "Đàn bầu", region: 'east-asia', origin: "Vietnam", excite: 'harmonic', material: 0, courses: 1, stop: 'open', length: 1, reference: 48, alpha: 0, opens: [], tension: 40, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Monochord played only in harmonics: the palm touches a node while plucking, and a flexible rod bends the string's tension." },
  { name: "Sitar", region: 'south-asia', origin: "North India", excite: 'plectrum', material: 0, courses: 1, stop: 'fret', length: 0.9, reference: 0, alpha: 0, opens: [41], tension: 14, jawari: true, rattle: null, sympathetic: 13, body: 'wood',
    about: "Slack steel main string over curved frets, a broad bone jawari bridge, thirteen sympathetic tarafs, a gourd with a teak top, and a wire mizrab." },
  { name: "Tanpura", region: 'south-asia', origin: "India", excite: 'finger', material: 0, courses: 1, stop: 'open', length: 1.05, reference: 36, alpha: 0, opens: [], tension: 25, jawari: true, rattle: null, sympathetic: 0, body: 'wood',
    about: "Drone lute: long strings of equal length on a curved jawari bridge, with cotton threads that set where the string touches it." },
  { name: "Sarod", region: 'south-asia', origin: "North India", excite: 'plectrum', material: 0, courses: 1, stop: 'fretless', length: 0.65, reference: 0, alpha: 0, opens: [41, 48], tension: 20, jawari: false, rattle: null, sympathetic: 13, body: 'skin',
    about: "Fretless metal fingerboard stopped with the nails, a goat-skin belly, a coconut-shell plectrum and ringing sympathetic strings." },
  { name: "Sarangi", region: 'south-asia', origin: "North India", excite: 'bow', material: 3, courses: 1, stop: 'air', length: 0.35, reference: 0, alpha: 0, opens: [48, 55, 60], tension: 25, jawari: false, rattle: null, sympathetic: 13, body: 'skin',
    about: "Short gut strings stopped with the cuticles, a goat skin over a hollowed block, and dozens of sympathetic strings: the voice-like bowed string of North India." },
  { name: "Saraswati veena", region: 'south-asia', origin: "South India", excite: 'finger', material: 0, courses: 1, stop: 'fret', length: 0.85, reference: 0, alpha: 0, opens: [43, 48, 55], tension: 30, jawari: true, rattle: null, sympathetic: 0, body: 'wood',
    about: "Frets set in wax on a long neck, a curved brass bridge, a jackwood bowl and a gourd; plucked and deflected for gamaka." },
  { name: "Santoor", region: 'south-asia', origin: "Kashmir, India", excite: 'hammer', material: 0, courses: 3, stop: 'open', length: 0.55, reference: 50, alpha: 0.35, opens: [], tension: 60, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Kashmiri hammered dulcimer: courses of steel strings struck with light walnut mallets." },
  { name: "Esraj", region: 'south-asia', origin: "Bengal, India", excite: 'bow', material: 0, courses: 1, stop: 'fret', length: 0.6, reference: 0, alpha: 0, opens: [48, 55], tension: 30, jawari: false, rattle: null, sympathetic: 11, body: 'skin',
    about: "Bowed and fretted, with a skin belly and sympathetic strings." },
  { name: "Dilruba", region: 'south-asia', origin: "North India", excite: 'bow', material: 0, courses: 1, stop: 'fret', length: 0.66, reference: 0, alpha: 0, opens: [43, 50], tension: 32, jawari: false, rattle: null, sympathetic: 13, body: 'skin',
    about: "The esraj's larger cousin: more sympathetic strings and a darker voice." },
  { name: "Oud", region: 'middle-east', origin: "Arab world, Turkey, Iran", excite: 'plectrum', material: 2, courses: 2, stop: 'fretless', length: 0.61, reference: 0, alpha: 0, opens: [36, 41, 45, 50, 55, 60], tension: 45, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Fretless short-necked lute: doubled nylon courses, a bent-rib bowl and a thin top with roses, plucked with a feather risha." },
  { name: "Qanun", region: 'middle-east', origin: "Arab world, Turkey", excite: 'nail', material: 2, courses: 3, stop: 'open', length: 0.8, reference: 43, alpha: 0.48, opens: [], tension: 40, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Plucked trapezoid zither with triple courses; its bridge stands on windows of fish skin." },
  { name: "Santur", region: 'middle-east', origin: "Iran", excite: 'hammer', material: 0, courses: 3, stop: 'open', length: 0.5, reference: 50, alpha: 0.4, opens: [], tension: 50, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Persian hammered dulcimer: courses of four, struck with bare wooden mezrab." },
  { name: "Kamancheh", region: 'middle-east', origin: "Iran, Azerbaijan", excite: 'bow', material: 0, courses: 1, stop: 'fretless', length: 0.34, reference: 0, alpha: 0, opens: [55, 62, 69, 76], tension: 45, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Spike fiddle with a spherical bowl and a membrane; fretless and agile." },
  { name: "Tar", region: 'middle-east', origin: "Iran, Caucasus", excite: 'plectrum', material: 0, courses: 2, stop: 'fret', length: 0.68, reference: 0, alpha: 0, opens: [48, 55, 60], tension: 25, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Double-bowl mulberry body with a thin lamb-skin membrane, doubled steel courses and a brass plectrum." },
  { name: "Setar", region: 'middle-east', origin: "Iran", excite: 'nail', material: 0, courses: 1, stop: 'fret', length: 0.69, reference: 0, alpha: 0, opens: [48, 55, 60], tension: 20, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Long-necked lute of thin steel strings on a mulberry bowl, brushed with the index fingernail." },
  { name: "Bağlama (saz)", region: 'middle-east', origin: "Turkey", excite: 'plectrum', material: 0, courses: 3, stop: 'fret', length: 0.88, reference: 0, alpha: 0, opens: [50, 55, 57], tension: 15, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Long-necked lute with steel triple courses on movable frets, plucked with a thin cherry-bark tezene." },
  { name: "Dutar", region: 'middle-east', origin: "Central Asia", excite: 'nail', material: 4, courses: 1, stop: 'fret', length: 0.85, reference: 0, alpha: 0, opens: [50, 55], tension: 18, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Two-stringed long-necked lute of Central Asia, strummed with the nails." },
  { name: "Rubab", region: 'middle-east', origin: "Afghanistan", excite: 'plectrum', material: 3, courses: 1, stop: 'fret', length: 0.45, reference: 0, alpha: 0, opens: [48, 55, 60], tension: 30, jawari: false, rattle: null, sympathetic: 13, body: 'skin',
    about: "Short-necked lute: gut melody strings, a goat-skin lower chamber and up to fifteen sympathetic strings." },
  { name: "Tanbur", region: 'middle-east', origin: "Kurdistan, Iran, Turkey", excite: 'plectrum', material: 0, courses: 2, stop: 'fret', length: 1.05, reference: 0, alpha: 0, opens: [45, 52], tension: 12, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Very long neck, thin steel strings and a slice-built bowl: a long, silvery sustain." },
  { name: "Rebab", region: 'middle-east', origin: "Arab world, North Africa", excite: 'bow', material: 5, courses: 1, stop: 'air', length: 0.45, reference: 0, alpha: 0, opens: [55, 62], tension: 35, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Spike fiddle with a horsehair string over a skin-covered frame." },
  { name: "Bouzouki", region: 'europe', origin: "Greece", excite: 'plectrum', material: 0, courses: 2, stop: 'fret', length: 0.68, reference: 0, alpha: 0, opens: [48, 53, 57, 62], tension: 60, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Long-necked lute of Greece: steel doubled courses on a staved bowl, played with a pick and fast tremolo." },
  { name: "Balalaika", region: 'europe', origin: "Russia", excite: 'nail', material: 2, courses: 1, stop: 'fret', length: 0.44, reference: 0, alpha: 0, opens: [64, 69], tension: 35, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Triangular-bodied lute strummed with the index fingernail." },
  { name: "Hurdy-gurdy", region: 'europe', origin: "France, Hungary, Spain", excite: 'wheel', material: 3, courses: 2, stop: 'tangent', length: 0.33, reference: 0, alpha: 0, opens: [62, 67], tension: 40, jawari: false, rattle: 'chien', sympathetic: 0, body: 'wood',
    about: "A rosined wheel bows gut chanterelles stopped by key tangents; the trompette's loose bridge (the chien) buzzes on the wrist's coups." },
  { name: "Nyckelharpa", region: 'europe', origin: "Sweden", excite: 'bow', material: 0, courses: 1, stop: 'tangent', length: 0.4, reference: 0, alpha: 0, opens: [48, 55, 60, 69], tension: 40, jawari: false, rattle: null, sympathetic: 12, body: 'wood',
    about: "Keyed bowed fiddle with a dozen sympathetic strings." },
  { name: "Hardanger fiddle", region: 'europe', origin: "Norway", excite: 'bow', material: 0, courses: 1, stop: 'fretless', length: 0.33, reference: 0, alpha: 0, opens: [57, 62, 69, 76], tension: 45, jawari: false, rattle: null, sympathetic: 5, body: 'wood',
    about: "A violin-shaped body with four or five sympathetic strings under the fingerboard." },
  { name: "Kantele", region: 'europe', origin: "Finland, Karelia", excite: 'finger', material: 0, courses: 1, stop: 'open', length: 0.55, reference: 55, alpha: 0.5, opens: [], tension: 20, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Carved box zither with thin, slack steel strings; a hard pluck makes the pitch glide as the tension relaxes." },
  { name: "Cimbalom", region: 'europe', origin: "Hungary, Romania", excite: 'hammer', material: 0, courses: 3, stop: 'open', length: 1, reference: 40, alpha: 0.5, opens: [], tension: 70, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Concert hammered dulcimer with dampers, played with cotton-wrapped beaters." },
  { name: "Lute", region: 'europe', origin: "Renaissance Europe", excite: 'finger', material: 3, courses: 2, stop: 'fret', length: 0.6, reference: 0, alpha: 0, opens: [43, 48, 53, 57, 62, 67], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Renaissance lute: gut double courses, a ribbed bowl and a carved rose." },
  { name: "Gusle", region: 'europe', origin: "Balkans", excite: 'bow', material: 5, courses: 1, stop: 'air', length: 0.35, reference: 0, alpha: 0, opens: [55], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "One horsehair string over a skin-covered bowl, bowed while the singer recites epics." },
  { name: "Portuguese guitar", region: 'europe', origin: "Portugal", excite: 'nail', material: 0, courses: 2, stop: 'fret', length: 0.44, reference: 0, alpha: 0, opens: [50, 57, 59, 64, 69, 71], tension: 70, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "Short-scale cittern with steel doubled courses, played with fingerpicks: bright and singing." },
  { name: "Kora", region: 'africa', origin: "Mali, Senegal, Gambia", excite: 'finger', material: 2, courses: 1, stop: 'open', length: 0.95, reference: 41, alpha: 0.48, opens: [], tension: 60, jawari: false, rattle: 'sesse', sympathetic: 0, body: 'skin',
    about: "Twenty-one nylon strings in two ranks over a huge calabash covered in cowhide with a sound port; the sesse jingle plate can buzz." },
  { name: "Kamale n'goni", region: 'africa', origin: "Mali (Wassoulou)", excite: 'finger', material: 2, courses: 1, stop: 'open', length: 0.55, reference: 50, alpha: 0.5, opens: [], tension: 40, jawari: false, rattle: 'sesse', sympathetic: 0, body: 'skin',
    about: "Harp-lute of the Wassoulou: a calabash covered in goat skin and a tin jingle plate." },
  { name: "Xalam", region: 'africa', origin: "Senegal, Mali", excite: 'nail', material: 2, courses: 1, stop: 'fretless', length: 0.5, reference: 0, alpha: 0, opens: [50, 55], tension: 35, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Skin over a carved trough, a fretless neck and nail strikes: griot lute of the Sahel." },
  { name: "Ekonting", region: 'africa', origin: "Casamance, Senegal", excite: 'nail', material: 2, courses: 1, stop: 'fretless', length: 0.55, reference: 0, alpha: 0, opens: [55, 62], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Jola gourd lute frailed down with the nail, an ancestor of the banjo." },
  { name: "Krar", region: 'africa', origin: "Ethiopia, Eritrea", excite: 'plectrum', material: 2, courses: 1, stop: 'open', length: 0.4, reference: 57, alpha: 0, opens: [], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "Bowl lyre covered in skin, strummed with a plectrum while the other hand mutes." },
  { name: "Begena", region: 'africa', origin: "Ethiopia", excite: 'finger', material: 3, courses: 1, stop: 'open', length: 0.7, reference: 40, alpha: 0, opens: [], tension: 40, jawari: true, rattle: null, sympathetic: 0, body: 'skin',
    about: "Great lyre of devotion: gut strings that buzz on leather thongs at the bridge." },
  { name: "Masenqo", region: 'africa', origin: "Ethiopia", excite: 'bow', material: 5, courses: 1, stop: 'air', length: 0.45, reference: 0, alpha: 0, opens: [57], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "One horsehair string over a diamond-shaped skin box, bowed by the azmari." },
  { name: "Valiha", region: 'africa', origin: "Madagascar", excite: 'nail', material: 0, courses: 1, stop: 'open', length: 0.5, reference: 55, alpha: 0.3, opens: [], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'tube',
    about: "Strings stretched along a bamboo tube, plucked with the nails." },
  { name: "Inanga", region: 'africa', origin: "Burundi, Rwanda", excite: 'finger', material: 3, courses: 1, stop: 'open', length: 0.75, reference: 43, alpha: 0, opens: [], tension: 25, jawari: false, rattle: null, sympathetic: 0, body: 'wood',
    about: "One fibre string laced back and forth over a wooden trough." },
  { name: "Gimbri", region: 'africa', origin: "Morocco (Gnawa)", excite: 'finger', material: 3, courses: 1, stop: 'fretless', length: 0.75, reference: 0, alpha: 0, opens: [38, 45, 50], tension: 25, jawari: false, rattle: 'sersal', sympathetic: 0, body: 'skin',
    about: "Camel skin over a log, three goat-gut strings, thumb slaps on the skin and the sersal rattle." },
  { name: "Goje", region: 'africa', origin: "Niger, Nigeria, Ghana", excite: 'bow', material: 5, courses: 1, stop: 'air', length: 0.4, reference: 0, alpha: 0, opens: [57], tension: 30, jawari: false, rattle: null, sympathetic: 0, body: 'skin',
    about: "One-string fiddle on a calabash covered in lizard skin." },
  { name: "Uhadi", region: 'africa', origin: "South Africa (Xhosa)", excite: 'hammer', material: 0, courses: 1, stop: 'fretless', length: 1.2, reference: 0, alpha: 0, opens: [43], tension: 120, jawari: false, rattle: null, sympathetic: 0, body: 'gourd',
    about: "Musical bow struck with a stick; the gourd held against the chest picks out the overtones." },
];
