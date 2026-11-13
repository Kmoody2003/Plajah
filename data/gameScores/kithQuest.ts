/**
 * Kith Quest — the written score. Every cue here becomes one Chora Studio project
 * (services/melos/kithQuestChoraProjects.ts) and the game plays a bounce of exactly that project.
 *
 * Kenne, 2026-11-12: "take full advantage of chora instruments … write really great scores … great but catchy …
 * create new classic video game themes", "each get a chora project". The synth score (components/kithParty/quest/
 * score.ts) stays as the fallback when the bounces aren't there.
 *
 * Everything is original. The whole game hangs on one leitmotif, the LANTERN MOTIF:
 *   sol · do – re – mi   (a dotted leap up a fourth, then two steps: C5 . F5 G5 A5 in F major)
 * It opens the title theme, answers the lullabies (the oboe in every calm cue's second pass), is shouted by
 * the trumpets in the energy cues, bent into minor (sol · do – re – me) by the Hollow Warden's trombones and the
 * danger bassoon, bent again into phrygian (sol · do – ra – me) by the fear cue, and is the stage-clear jingle.
 *
 * The three lullabies are the ones Kenne liked in the synth score, kept note for note and re-orchestrated.
 *
 * Notation: a line is "NOTE:beats" tokens ("C5:1.5"), "r:beats" rests, "A3+E4:2" a chord, "|" bar lines for reading.
 * A chord field is one per bar: a symbol ("F", "Dm7", "Bb C" = two chords sharing the bar) or an explicit voicing
 * ("F3+A3+C4+G4"). Drum lines are one char per 16th (X accent · x hit · o soft · . ghost · f timpani fifth · - rest),
 * cycled over the bars they play.
 */

export type QuestCueId =
 | 'title' | 'calm-glowmoss' | 'calm-cascade' | 'calm-keep' | 'energy-glowmoss' | 'energy-cascade' | 'energy-keep'
 | 'danger' | 'fear' | 'battle' | 'clear' | 'gameover';

/** Which written line (or chord figure) a part plays. */
export type PartSrc =
 | 'melody' | 'counter' | 'bass'
 /** sustained chord, the bar's voicing */ | 'pad'
 /** the voicing's lowest note */ | 'root'
 /** harp arpeggio in eighths (root · 5th · 3rd · 7th · 3rd+8 · 5th…) */ | 'harp'
 /** held chords through Chora's ARP device (the generative part) */ | 'arp'
 /** spiccato eighths: root · 5th · root+8 · 5th · 3rd · 5th */ | 'spic'
 /** pizzicato quarters: root, 5th, root… */ | 'pizz'
 /** a chord hit on each bar's downbeat */ | 'stab'
 /** ticking eighths on the root and the semitone above (fear) */ | 'tick'
 /** a line written into the part itself */ | 'line'
 /** an unpitched SOMA drum line */ | 'drum'
 /** a SOMA timpani line, tuned to each bar's root */ | 'timp'
 /** one voice of the voice-led string choir (see `voice`): the chords as five real lines with suspensions */ | 'divisi'
 /** a figure over each chord (`fig`, `step`, `reg`): ostinatos, broken chords, waltz picking, cascades */ | 'figure';

/** Divisi string choir voices, top to bottom: Violins I, Violins II, Violas, Celli. */
export type DivisiVoice = 0 | 1 | 2 | 3;

/** Chora instruments: LYRA orchestra, TONOS world strings, the VELA suite (VELA, CANTUS choirs, ISON drones, PNEUMA breath), SOMA drums. */
export type Inst = 'lyra' | 'tonos' | 'aura' | 'vela' | 'cantus' | 'ison' | 'pneuma' | 'soma';

export interface CuePart {
 key: string; inst: Inst; preset: string; label: string;
 src: PartSrc;
 /** line text for src 'line' / 'drum' / 'timp' */
 line?: string;
 /** semitones (e.g. -12 = an octave down) */
 oct?: number;
 vel?: number; gainDb?: number; pan?: number;
 /** hall send 0..1 */
 hall?: number;
 /** echo send 0..1 (the dotted-eighth delay) */
 echo?: number;
 /** active bar ranges [from, to) over the whole body; default all */
 bars?: [number, number][];
 /** note length as a fraction of the step (figures) */
 gate?: number;
 /** arp device settings for src 'arp' */
 arp?: { order: 'up' | 'down' | 'updown' | 'upDownInclusive' | 'spiral' | 'random'; rate: number; octaves: number; accents: number };
 /** every Nth bar only (stab / timp downbeats); default 1 */
 every?: number;
 /** velocity ramp across the active range (crescendo / diminuendo): [start, end] multipliers */
 ramp?: [number, number];
 /** src 'divisi': which line of the string choir (0 Violins I … 3 Celli) */
 voice?: DivisiVoice;
 /** src 'divisi': several lines in one track (a choir singing the inner voices) */
 voices?: DivisiVoice[];
 /** src 'figure': tokens, one per `step`, restarting every bar. A number is a chord tone counted up from the chord's
  *  root at or below `reg` (0 root, 1 next tone up …; negative counts down); '^n' is the n-th degree of the cue's
  *  scale up from the tonic at or below `reg`. Suffix '+'/'-' shifts an octave, '!' accents; '.' rests; '_' holds. */
 fig?: string;
 /** src 'figure': beats per token (default 0.5) */
 step?: number;
 /** src 'figure': register anchor as a MIDI note (default 60) */
 reg?: number;
 /** written lines: play this many beats later (canons, echoes); loops wrap the overhang to the start */
 shift?: number;
 /** dynamics as a volume curve over the body: [bar, dB relative to gainDb] points (hairpins, swells, terraces) */
 dyn?: [number, number][];
 /** breathing swells: every N bars the part rises from `-depth` dB to full and eases back (long-bow phrasing) */
 swell?: { bars: number; depth: number };
}

export interface Cue {
 id: QuestCueId; title: string; blurb: string;
 bpm: number; beats: 3 | 4;
 /** project key */
 tonicPc: number; scale: string;
 /** one per bar over the whole body */
 chords: string[];
 melody: string; counter?: string; bass?: string;
 /** loop = the whole body loops seamlessly in the game; false = a one-shot jingle */
 loop: boolean;
 /** named spans for the Chora timeline clips: [name, fromBar, toBar) */
 sections: [string, number, number][];
 /** hall space for the FX 1 return (devices.ts REVERB_SPACES index) */
 space: number;
 parts: CuePart[];
}

/* ── helpers ──────────────────────────────────────────────────────────────────────────────── */
const rests = (bars: number, beats: number) => Array.from({length: bars}, () => `r:${beats}`).join(' | ');
const twice = (s: string) => `${s} | ${s}`;
const A = (from: number, to: number): [number, number][] => [[from, to]];

/* ── shared instruments (names as Chora lists them; roles the presets stand in for are said so) ── */
const HARP = {inst: 'lyra' as const, preset: 'lyra-harp'};
const STRINGS = {inst: 'lyra' as const, preset: 'lyra-silk-strings'};
const QUARTET = {inst: 'lyra' as const, preset: 'lyra-string-quartet'};
const CELLO = {inst: 'lyra' as const, preset: 'lyra-cello'};
const BASS = {inst: 'lyra' as const, preset: 'lyra-double-bass-arco'};
const PIZZ = {inst: 'lyra' as const, preset: 'lyra-pizzicato'};
const FLUTE = {inst: 'lyra' as const, preset: 'lyra-concert-flute'};
const ALTO_FLUTE = {inst: 'lyra' as const, preset: 'lyra-alto-flute'};
const CLARINET = {inst: 'lyra' as const, preset: 'lyra-clarinet'};
const OBOE = {inst: 'lyra' as const, preset: 'lyra-oboe'};
const BASSOON = {inst: 'lyra' as const, preset: 'lyra-bassoon'};
const HORN = {inst: 'lyra' as const, preset: 'lyra-french-horn'};
const TRUMPET = {inst: 'lyra' as const, preset: 'lyra-trumpet-open'};
const TROMBONE = {inst: 'lyra' as const, preset: 'lyra-trombone'};
const VIOLIN = {inst: 'lyra' as const, preset: 'lyra-concert-violin'};
const VIOLA = {inst: 'lyra' as const, preset: 'lyra-viola'};
const FELT = {inst: 'lyra' as const, preset: 'lyra-felt'};
const CHOIR = {inst: 'vela' as const, preset: 'choir'};
const TREMOLO = {inst: 'vela' as const, preset: 'tremolo-strings'};
const TIMPANI = {inst: 'soma' as const, preset: 'timpani-29-dresden'};
const GRAN_CASSA = {inst: 'soma' as const, preset: 'concert-gran-cassa'};
const SNARE = {inst: 'soma' as const, preset: 'orchestral-field-snare'};
const BODHRAN = {inst: 'soma' as const, preset: 'bodhran-kerry-tipper'};
const BENDIR = {inst: 'soma' as const, preset: 'bendir-atlas-gut'};
const TAR = {inst: 'soma' as const, preset: 'tar-nubian-deep'};
const SUL_TASTO = {inst: 'lyra' as const, preset: 'lyra-sul-tasto'};
const ENGLISH_HORN = {inst: 'lyra' as const, preset: 'lyra-english-horn'};
const PICCOLO = {inst: 'lyra' as const, preset: 'lyra-piccolo'};
const FLUGEL = {inst: 'lyra' as const, preset: 'lyra-flugelhorn'};
const BASS_TROMBONE = {inst: 'lyra' as const, preset: 'lyra-bass-trombone'};
const TUBA = {inst: 'lyra' as const, preset: 'lyra-tuba'};
/* TONOS world strings — gut, silk and nylon voices for warmth (steel dulcimers stay out: the no-sheen rule) */
const KORA = {inst: 'tonos' as const, preset: 'tonos-kora'};
const KOTO = {inst: 'tonos' as const, preset: 'tonos-koto'};
const GUZHENG = {inst: 'tonos' as const, preset: 'tonos-guzheng-glide'};
const LUTE = {inst: 'tonos' as const, preset: 'tonos-lute'};
const VALIHA = {inst: 'tonos' as const, preset: 'tonos-valiha'};
const NYCKELHARPA = {inst: 'tonos' as const, preset: 'tonos-nyckelharpa'};
const HARDANGER = {inst: 'tonos' as const, preset: 'tonos-hardanger'};
const BOUZOUKI = {inst: 'tonos' as const, preset: 'tonos-bouzouki-tremolo'};
const QANUN = {inst: 'tonos' as const, preset: 'tonos-qanun'};
const NGONI = {inst: 'tonos' as const, preset: 'tonos-kamale-ngoni'};
/* the VELA suite: CANTUS choirs, ISON drones, PNEUMA breath */
const VAULT = {inst: 'cantus' as const, preset: 'cantus-vault'};
const PLAINSONG = {inst: 'cantus' as const, preset: 'cantus-plainsong'};
const BYZANTINE = {inst: 'cantus' as const, preset: 'cantus-byzantine'};
const CAVERN = {inst: 'ison' as const, preset: 'ison-cavern'};
const BREATH = {inst: 'pneuma' as const, preset: 'pneuma-hall'};
const SHAKUHACHI = {inst: 'pneuma' as const, preset: 'pneuma-shakuhachi'};
/* SOMA, deeper */
const TIMP_DEEP = {inst: 'soma' as const, preset: 'timpani-32-profondo'};
const TAIKO = {inst: 'soma' as const, preset: 'nagado-daiko-odaiko'};
const DAF = {inst: 'soma' as const, preset: 'daf-persian-rings'};

/**
 * The string section (Music Council 2026-11-12): five desks seated Violins I L35 · Violins II L15 · Violas R15 ·
 * Celli R35 · Basses centre, each its own voice-led line from the chords (no block pads), breathing in long-bow
 * swells. `skip` leaves a desk out (e.g. the Violins I when they play the tune instead).
 */
interface SectionOpts { bars?: [number, number][]; vel?: number; gain?: number; hall?: number; swell?: {bars: number; depth: number}; dyn?: [number, number][]; skip?: string[]; violins?: {inst: Inst; preset: string}; tag?: string }
function strings(o: SectionOpts = {}): CuePart[] {
 const vel = o.vel ?? 60, g = o.gain ?? -12, hall = o.hall ?? .4, swell = o.swell ?? {bars: 4, depth: 7}, t = o.tag ?? '';
 const vln = o.violins ?? STRINGS;
 const desks: CuePart[] = [
  {key: 'vln1', ...vln, label: 'Violins I', src: 'divisi', voice: 0, vel, gainDb: g - 1, pan: -.35, hall: hall + .04},
  {key: 'vln2', ...vln, label: 'Violins II', src: 'divisi', voice: 1, vel: vel - 4, gainDb: g - 1, pan: -.15, hall},
  {key: 'vla', ...VIOLA, label: 'Violas', src: 'divisi', voice: 2, vel: vel - 2, gainDb: g, pan: .15, hall},
  {key: 'vc', ...CELLO, label: 'Celli', src: 'divisi', voice: 3, vel, gainDb: g, pan: .35, hall: hall - .06},
  {key: 'cb', ...BASS, label: 'Basses', src: 'root', oct: -12, vel: vel - 4, gainDb: g - 1, pan: 0, hall: hall - .14},
 ];
 return desks.filter(d => !o.skip?.includes(d.key)).map(d => ({...d, key: d.key + t, bars: o.bars, swell, dyn: o.dyn}));
}

/**
 * Film-score idioms (Kenne 2026-11-13: "still retro gaming sounds … like a score composed for a movie … John Williams
 * or Hans Zimmer level"). A brass chorale: horns sing the inner voices of the string choir an octave down, trombones
 * the tenor line, the tuba the roots — long breaths that swell and recede.
 */
function brass(o: {bars?: [number, number][]; vel?: number; swell?: {bars: number; depth: number}; dyn?: [number, number][]; tag?: string; tuba?: boolean} = {}): CuePart[] {
 const vel = o.vel ?? 70, t = o.tag ?? '', swell = o.swell ?? {bars: 4, depth: 9};
 const parts: CuePart[] = [
  {key: `hnch${t}`, ...HORN, label: 'Horns (chorale)', src: 'divisi', voices: [1, 2], oct: -12, vel, gainDb: -12, pan: -.25, hall: .42},
  {key: `tbch${t}`, ...TROMBONE, label: 'Trombones (chorale)', src: 'divisi', voices: [3], vel: vel - 4, gainDb: -13, pan: .25, hall: .4},
 ];
 if (o.tuba !== false) parts.push({key: `tuch${t}`, ...TUBA, label: 'Tuba (chorale)', src: 'root', oct: -12, vel: vel - 6, gainDb: -14, pan: 0, hall: .35});
 return parts.map(x => ({...x, bars: o.bars, swell, dyn: o.dyn}));
}

/** The driving low-string ostinato: celli and basses in accented eighths under the theme (the modern action-score engine). */
function ostinato(beats: 3 | 4, o: {bars?: [number, number][]; vel?: number; dyn?: [number, number][]; tag?: string} = {}): CuePart[] {
 const t = o.tag ?? '', vel = o.vel ?? 84;
 const fig = beats === 4 ? '0! 0 0 1 0! 0 2 1' : '0! 0 1 0 2 1';
 return [
  {key: `ostvc${t}`, ...CELLO, label: 'Celli (ostinato)', src: 'figure', fig, step: .5, reg: 50, vel, gainDb: -11, pan: .3, hall: .25, gate: .55, bars: o.bars, dyn: o.dyn},
  {key: `ostcb${t}`, ...BASS, label: 'Basses (ostinato)', src: 'figure', fig: beats === 4 ? '0! 0 0 0 0! 0 0 0' : '0! 0 0 0 0 0', step: .5, reg: 38, vel: vel - 4, gainDb: -12, pan: 0, hall: .2, gate: .55, bars: o.bars, dyn: o.dyn},
 ];
}

/* No bell-type voices (celesta, bells, struck glass): Kenne heard a metallic sheen over the whole score (2026-11-12). */
/* Space indices: 4 Grand Concert Hall · 5 Stone Chapel · 3 Opera House */
const HALL = 4, CHAPEL = 5;

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * TITLE — "The Lantern Road" (F major, 4/4, 108). Sentence-form A (motif · answer · motif · cadence),
 * a lifting B, then A' with the whole orchestra. The horn sings the motif first, the strings lift the bridge,
 * trumpet and flute bring it home. Chora's ARP keeps a harp rippling under all of it.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const TITLE_MEL =
 'C5:1.5 F5:.5 G5:1 A5:1 | A5:1.5 G5:.5 F5:1 C5:1 | D5:1.5 F5:.5 G5:1 A5:1 | G5:4 |' +
 'C5:1.5 F5:.5 G5:1 A5:1 | C6:1.5 Bb5:.5 A5:1 F5:1 | G5:1 A5:.5 G5:.5 F5:1 E5:1 | F5:4 |' +
 'Bb4:1 D5:1 F5:1 Bb5:1 | A5:2 F5:2 | G4:1 C5:1 E5:1 G5:1 | F5:2 E5:1 D5:1 |' +
 'D5:1 F5:1 A5:1 D6:1 | C6:1.5 A5:.5 E5:2 | Bb5:1 A5:1 G5:1 F5:1 | G5:3 r:1 |' +
 'C5:1.5 F5:.5 G5:1 A5:1 | A5:1.5 G5:.5 F5:1 C5:1 | D5:1.5 F5:.5 G5:1 A5:1 | G5:4 |' +
 'C5:1.5 F5:.5 G5:1 A5:1 | C6:1.5 Bb5:.5 A5:1 F5:1 | G5:1 A5:.5 G5:.5 F5:1 E5:1 | F5:4';
const TITLE_COUNTER =
 'r:2 A4:1 C5:1 | F4:2 A4:2 | r:2 Bb4:1 D5:1 | C5:1 E5:1 G5:1 E5:1 |' +
 'r:2 A4:1 C5:1 | F5:2 D5:2 | D5:1 C5:1 E5:2 | A4:1 C5:1 F5:2 |' +
 'F4:2 Bb4:2 | C5:2 D5:2 | E4:2 G4:2 | A4:2 Bb4:2 |' +
 'A4:2 F4:2 | E4:2 C5:2 | D5:2 Bb4:2 | C5:1 E5:1 G5:1 Bb5:1 |' +
 'r:2 A4:1 C5:1 | F4:2 A4:2 | r:2 Bb4:1 D5:1 | C5:1 E5:1 G5:1 E5:1 |' +
 'r:2 A4:1 C5:1 | F5:2 D5:2 | D5:1 C5:1 E5:2 | F5:4';
const TITLE_CODA_MEL = 'A5:4 | D6:3 C6:1 | C6:4 | G5:2 A5:1 Bb5:1 | A5:4 | F6:3 D6:1 | D6:2 C6:2 | C6:3 r:1';
/** the lantern motif in long notes for horns and trombones under the coda */
const TITLE_CODA_COUNTER = 'C4:3 F4:1 | G4:4 | A4:4 | G4:4 | A4:3 D5:1 | D5:2 F4:2 | Bb4:2 D5:2 | C5:2 E4:2';
const TITLE_CODA_BASS = 'D2:4 | Bb1:4 | F2:4 | C2:4 | D2:4 | Bb1:4 | G1:4 | C2:4';
const TITLE_BASS =
 'F2:2 C3:2 | D2:2 A2:2 | Bb1:2 F2:2 | C2:2 G2:2 | F2:2 C3:2 | D2:2 A2:2 | Bb1:2 C2:2 | F2:4 |' +
 'Bb1:2 F2:2 | Bb1:2 D2:2 | C2:2 G2:2 | C2:2 E2:2 | D2:2 A2:2 | A1:2 E2:2 | G1:2 D2:2 | C2:4 |' +
 'F2:2 C3:2 | D2:2 A2:2 | Bb1:2 F2:2 | C2:2 G2:2 | F2:2 C3:2 | D2:2 A2:2 | Bb1:2 C2:2 | F2:4';

/** The B section's soaring Violins I descant (new, council 2026-11-12): over the tune, climbing to G6 and home. */
const TITLE_DESCANT = 'D6:4 | C6:2 Bb5:2 | C6:3 E6:1 | G6:4 | F6:2 E6:1 D6:1 | C6:2 A5:2 | Bb5:2 D6:2 | C6:2 E6:2';
const TITLE: Cue = {
 id: 'title', title: 'The Lantern Road', bpm: 108, beats: 4, tonicPc: 5, scale: 'major', loop: true, space: HALL,
 blurb: 'The main theme as a film overture: horn over harp and strings; the violins take it over a low-string ostinato with a soaring descant; the full orchestra with a brass chorale; then the road beyond, the violins broadening while horns and trombones sing the lantern motif in long notes.',
 chords: [
  'F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb C', 'F',
  'Bb', 'Bb', 'C', 'C', 'Dm', 'Am', 'Gm7', 'C7',
  'F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb C', 'F',
  'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm7', 'C7',
 ],
 melody: `${TITLE_MEL} | ${TITLE_CODA_MEL}`, counter: `${TITLE_COUNTER} | ${TITLE_CODA_COUNTER}`, bass: `${TITLE_BASS} | ${TITLE_CODA_BASS}`,
 sections: [['A · The motif', 0, 8], ['B · The road lifts', 8, 16], ["A' · Lantern Road", 16, 24], ['C · The road beyond', 24, 32]],
 parts: [
  // A — the horn sings the motif; kora ripples; lower strings breathe
  {key: 'horn', ...HORN, label: 'Lead Horn', src: 'melody', oct: -12, vel: 92, gainDb: -6, pan: -.05, hall: .3, bars: A(0, 8)},
  {key: 'kora', ...KORA, label: 'Kora (colour)', src: 'figure', fig: '0 . 2 . 1+ . . .', step: .5, reg: 60, vel: 68, gainDb: -9, pan: .3, hall: .34, bars: A(0, 8)},
  {key: 'harpA', ...HARP, label: 'Harp', src: 'harp', oct: 12, vel: 60, gainDb: -12, pan: .35, hall: .4, bars: A(0, 16)},
  {key: 'ob', ...OBOE, label: 'Oboe', src: 'counter', vel: 72, gainDb: -12, pan: .15, hall: .36, bars: A(0, 8)},
  ...strings({bars: A(0, 8), skip: ['vln1'], vel: 54, gain: -13, tag: 'A'}),
  // B — the violins take the tune, the Violins I desk soars above, clarinet doubles, horns answer
  {key: 'vlnmel', ...STRINGS, label: 'Violins (the tune)', src: 'melody', vel: 86, gainDb: -7, pan: -.25, hall: .4, bars: A(8, 16)},
  {key: 'descant', ...STRINGS, label: 'Violins I (descant)', src: 'line', line: `${rests(8, 4)} | ${TITLE_DESCANT} | ${rests(16, 4)}`, vel: 78, gainDb: -10, pan: -.35, hall: .46, swell: {bars: 2, depth: 5}},
  {key: 'cl', ...CLARINET, label: 'Clarinet', src: 'melody', oct: -12, vel: 70, gainDb: -13, pan: -.1, hall: .32, bars: A(8, 16)},
  {key: 'hncounter', ...HORN, label: 'Horns (counter)', src: 'counter', vel: 80, gainDb: -10, pan: -.25, hall: .32, bars: A(8, 32)},
  ...ostinato(4, {bars: A(8, 24), vel: 80, dyn: [[8, -6], [15, -1], [16, 0], [24, 0]]}),
  ...strings({bars: A(8, 16), skip: ['vln1'], vel: 62, gain: -12, tag: 'B', dyn: [[8, -4], [15, 0], [16, 0]]}),
  // A' — tutti: trumpet and violins in octaves, flute on top, the harp ripples through Chora's ARP
  {key: 'tpt', ...TRUMPET, label: 'Trumpet', src: 'melody', oct: -12, vel: 92, gainDb: -8, pan: .2, hall: .3, bars: A(16, 24)},
  {key: 'vlnA2', ...STRINGS, label: 'Violins I (the tune)', src: 'melody', vel: 90, gainDb: -7, pan: -.35, hall: .4, bars: A(16, 24)},
  {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 84, gainDb: -10, pan: .15, hall: .35, bars: A(16, 24)},
  {key: 'harp', ...HARP, label: 'Harp (ARP)', src: 'arp', oct: 12, vel: 72, gainDb: -12, pan: .35, hall: .35, bars: A(16, 24), arp: {order: 'up', rate: 2, octaves: 2, accents: 5}},
  ...strings({bars: A(16, 24), skip: ['vln1'], vel: 72, gain: -11, tag: 'C', swell: {bars: 2, depth: 4}}),
  ...brass({bars: A(16, 24), vel: 74, swell: {bars: 4, depth: 6}}),
  // C — the road beyond: all violins broaden the theme, the flute an octave up, horns + trombones sing the motif in long
  // notes, the section swells to the climax and falls away so the loop returns to the horn alone
  {key: 'vlncoda', ...STRINGS, label: 'Violins (the road beyond)', src: 'melody', vel: 92, gainDb: -6, pan: -.3, hall: .44, bars: A(24, 32), dyn: [[24, -2], [29, 1], [31, -3], [32, -6]]},
  {key: 'flcoda', ...FLUTE, label: 'Flute (an octave up)', src: 'melody', oct: 12, vel: 76, gainDb: -13, pan: .15, hall: .4, bars: A(24, 30)},
  {key: 'tbcoda', ...TROMBONE, label: 'Trombones (the motif, long)', src: 'counter', oct: -12, vel: 84, gainDb: -11, pan: .25, hall: .36, bars: A(24, 32)},
  ...strings({bars: A(24, 32), skip: ['vln1'], vel: 74, gain: -11, tag: 'D', swell: {bars: 4, depth: 5}, dyn: [[24, 0], [29, 1], [31, -4], [32, -8]]}),
  {key: 'cymswell', ...TIMP_DEEP, label: 'Timpani (swell into the coda)', src: 'timp', line: 'x.x.x.x.x.x.xxxx', vel: 74, gainDb: -8, pan: 0, hall: .3, bars: A(23, 24), ramp: [.35, 1.1]},
  // drums
  {key: 'timp', ...TIMP_DEEP, label: 'Timpani', src: 'timp', line: 'X---------------' + '----------------', vel: 70, gainDb: -7, pan: 0, hall: .25, bars: A(0, 15)},
  {key: 'timproll', ...TIMPANI, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.xxxxxxxx', vel: 80, gainDb: -6, pan: 0, hall: .25, bars: A(15, 16), ramp: [.4, 1.15]},
  {key: 'timp2', ...TIMP_DEEP, label: "Timpani (A')", src: 'timp', line: 'X-------x---f---', vel: 90, gainDb: -6, pan: 0, hall: .25, bars: A(16, 24)},
  {key: 'bod', ...BODHRAN, label: 'Bodhrán', src: 'drum', line: 'X--xX-x-X--xX-xx', vel: 70, gainDb: -13, pan: -.15, hall: .15, bars: A(16, 24)},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 104, gainDb: -8, pan: 0, hall: .3, bars: [[8, 9], [16, 17], [24, 25], [28, 29]]},
  {key: 'timpcoda', ...TIMP_DEEP, label: 'Timpani (coda)', src: 'timp', line: 'X-------x-------', vel: 84, gainDb: -7, pan: 0, hall: .28, bars: A(24, 30)},
 ],
};

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * THE LULLABIES — kept note for note from the synth score Kenne liked; 16 bars of 3/4, played twice:
 * pass 1 intimate (the stage's own lead over harp, strings and cello), pass 2 the melody an octave down in a
 * warmer voice while the oboe answers in the long notes with the lantern motif.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const GLOW_CHORDS = [
 'F3+A3+C4+G4', 'D3+F3+A3+C4', 'Bb2+D3+F3+A3', 'C3+E3+G3+Bb3', 'F3+A3+C4+E4', 'A2+E3+G3+C4', 'Bb2+D3+F3+G3', 'C3+E3+G3+D4',
 'F3+A3+C4+E4', 'D3+F3+A3+C4', 'Bb2+D3+F3+A3', 'C3+E3+G3+Bb3', 'A2+E3+G3+C4', 'D3+F3+A3+C4', 'G2+Bb2+D3+F3', 'F3+A3+C4+G4',
];
const GLOW_MEL =
 'A5:2 G5:1 | F5:1 G5:1 A5:1 | Bb5:2 A5:1 | G5:3 | A5:2 C6:1 | A5:1 G5:1 E5:1 | F5:2 D5:1 | G5:3 |' +
 'C6:2 D6:1 | C6:1 A5:1 G5:1 | Bb5:1.5 A5:.5 G5:1 | G5:2 E5:1 | A5:2 G5:1 | F5:1 E5:1 D5:1 | C5:1 D5:1 E5:1 | F5:3';
const GLOW_ANSWER =
 'r:3 | r:3 | r:2 F6:1 | C6:.75 F6:.25 G6:1 A6:1 | r:3 | r:2 E6:1 | r:2 D6:1 | C6:.75 F6:.25 G6:1 A6:1 |' +
 'r:3 | r:2 F6:1 | r:3 | C6:.75 E6:.25 G6:1 C7:1 | r:3 | r:2 A6:1 | G6:1 Bb6:1 G6:1 | C6:.75 F6:.25 G6:1 A6:1';

const CASCADE_CHORDS = [
 'D3+F#3+A3+E4', 'D3+E3+G#3+B3', 'B2+F#3+A3+D4', 'G2+B2+D3+F#3', 'F#2+A2+D3+C#4', 'G2+D3+F#3+A3', 'E2+B2+D3+G3', 'A2+D3+E3+A3',
 'D3+F#3+A3+E4', 'D3+E3+G#3+B3', 'F#2+C#3+E3+A3', 'B2+D3+F#3+C#4', 'G2+B2+D3+F#3', 'G2+Bb2+D3+E3', 'A2+D3+F#3+C#4', 'A2+D3+E3+G3',
];
const CASCADE_MEL =
 'A5:1 C#6:1 D6:1 | E6:2 B5:1 | C#6:1.5 B5:.5 A5:1 | F#5:3 | A5:1 B5:1 C#6:1 | D6:2 C#6:1 | B5:1 A5:1 G5:1 | E5:3 |' +
 'A5:1 C#6:1 D6:1 | E6:1 G#5:1 B5:1 | A5:2 E5:1 | F#5:1 A5:1 C#6:1 | B5:2 F#5:1 | Bb5:2 A5:1 | F#5:2 E5:1 | D5:3';
const CASCADE_ANSWER =
 'r:3 | r:2 G#6:1 | r:3 | A5:.75 D6:.25 E6:1 F#6:1 | r:3 | r:2 F#6:1 | r:3 | A5:.75 D6:.25 E6:1 A6:1 |' +
 'r:3 | r:2 E6:1 | r:3 | r:3 | r:2 D6:1 | r:2 D6:1 | r:3 | A5:.75 D6:.25 E6:1 F#6:1';

const KEEP_CHORDS = [
 'D3+A3+D4+F4', 'Bb2+F3+A3+D4', 'G2+D3+F3+Bb3', 'A2+E3+G3+C#4', 'F2+A2+D3+F3', 'C3+G3+D4+E4', 'Bb2+F3+A3+D4', 'A2+D3+E3+A3',
 'D3+A3+E4+F4', 'Bb2+D3+G3+D4', 'C3+F3+A3+E4', 'Bb2+F3+A3+E4', 'G2+D3+F3+Bb3', 'A2+E3+G3+C#4', 'D3+A3+D4+F4', 'D3+A3+D4+F4',
];
const KEEP_MEL =
 'A5:2 F5:1 | A5:1 Bb5:1 A5:1 | G5:2 F5:1 | E5:3 | F5:2 D5:1 | E5:1 G5:1 C6:1 | Bb5:2 A5:1 | A5:3 |' +
 'D6:2 C6:1 | Bb5:1.5 A5:.5 G5:1 | A5:2 E5:1 | F5:1 E5:1 D5:1 | G5:2 Bb5:1 | A5:1 G5:1 C#5:1 | D5:3 | r:3';
const KEEP_ANSWER =
 'r:3 | r:2 D6:1 | r:3 | A5:.75 D6:.25 E6:1 C#6:1 | r:3 | r:2 E6:1 | r:3 | r:1 D6:1 E6:1 |' +
 'r:3 | r:3 | r:3 | r:3 | r:3 | r:2 E6:1 | r:2 A5:1 | A5:.75 D6:.25 E6:1 F6:1';

interface StageVoices { leadA: {inst: Inst; preset: string}; leadALabel: string; leadAOct?: number; leadB: {inst: Inst; preset: string}; leadBLabel: string; leadBOct?: number }
/** Per-stage colour for a lullaby: the TONOS figure under pass 1, extra voices. */
interface StageColour { pluck: {inst: Inst; preset: string}; pluckLabel: string; pluckFig: string; pluckReg: number; extra: CuePart[] }
function lullaby(id: QuestCueId, title: string, blurb: string, bpm: number, tonicPc: number, scale: string, chords: string[], mel: string, answer: string, v: StageVoices, col: StageColour, space: number): Cue {
 // pass 1 intimate (lead + TONOS picking + lower strings, sul tasto), pass 2 lush (lead up high, Violins I double it
 // an octave below, the oboe answers with the lantern motif, the full section swells, the harp joins)
 const parts: CuePart[] = [
  {key: 'leadA', ...v.leadA, label: v.leadALabel, src: 'melody', oct: v.leadAOct ?? 0, vel: 80, gainDb: -6, pan: -.1, hall: .36, bars: A(0, 16)},
  {key: 'pluck', ...col.pluck, label: col.pluckLabel, src: 'figure', fig: col.pluckFig, step: .5, reg: col.pluckReg, vel: 60, gainDb: -10, pan: -.28, hall: .38, swell: {bars: 4, depth: 4}, bars: A(0, 16)},
  ...strings({bars: A(0, 16), skip: ['vln1'], vel: 52, gain: -14, tag: 'A', swell: {bars: 4, depth: 8}, violins: SUL_TASTO}),
  {key: 'leadB', ...v.leadB, label: v.leadBLabel, src: 'melody', oct: v.leadBOct ?? 0, vel: 84, gainDb: -6, pan: .1, hall: .4, bars: A(16, 32)},
  {key: 'vlnmel', ...STRINGS, label: 'Violins I (the tune, an octave below)', src: 'melody', oct: (v.leadBOct ?? 0) - 12, vel: 70, gainDb: -12, pan: -.35, hall: .44, bars: A(16, 32), swell: {bars: 4, depth: 5}},
  {key: 'answer', ...OBOE, label: 'Oboe (the lantern answers)', src: 'counter', oct: -12, vel: 72, gainDb: -10, pan: .2, hall: .42},
  ...strings({bars: A(16, 32), skip: ['vln1'], vel: 60, gain: -12, tag: 'B', swell: {bars: 4, depth: 10}}),
  {key: 'harp', ...HARP, label: 'Harp', src: 'harp', oct: 12, vel: 54, gainDb: -13, pan: .35, hall: .42, bars: A(16, 32)},
  ...brass({bars: A(24, 32), vel: 52, swell: {bars: 4, depth: 10}, tuba: false, tag: 'B'}),
  ...col.extra,
 ];
 return {
  id, title, blurb, bpm, beats: 3, tonicPc, scale, loop: true, space,
  chords: [...chords, ...chords], melody: twice(mel), counter: `${rests(16, 3)} | ${answer}`,
  sections: [['Lullaby', 0, 16], ['Lullaby · the lantern answers', 16, 32]],
  parts,
 };
}

const CALM_GLOWMOSS = lullaby('calm-glowmoss', 'Glowmoss Lullaby',
 'Stage 1, F major waltz: clarinet over kora and breathing low strings; then a high flute with the violins an octave below, the oboe answering with the lantern motif, the whole section swelling.',
 64, 5, 'major', GLOW_CHORDS, GLOW_MEL, GLOW_ANSWER,
 {leadA: CLARINET, leadALabel: 'Clarinet', leadAOct: -12, leadB: FLUTE, leadBLabel: 'Flute'},
 {pluck: KORA, pluckLabel: 'Kora (waltz picking)', pluckFig: '0- 2 1+ 2 3 2', pluckReg: 60, extra: [
  {key: 'ehn', ...ENGLISH_HORN, label: 'English Horn (echo)', src: 'counter', oct: -24, shift: 3, vel: 62, gainDb: -14, pan: .3, hall: .45},
 ]}, HALL);
const CALM_CASCADE = lullaby('calm-cascade', 'Cascade Lullaby',
 'Stage 2, D Lydian waltz: a high flute over valiha picking, guzheng water-runs and sul tasto strings; then a solo violin soaring with the full section, alto flute and breath swells.',
 72, 2, 'lydian', CASCADE_CHORDS, CASCADE_MEL, CASCADE_ANSWER,
 {leadA: FLUTE, leadALabel: 'Flute', leadB: VIOLIN, leadBLabel: 'Solo Violin'},
 {pluck: VALIHA, pluckLabel: 'Valiha (waltz picking)', pluckFig: '0- 2 1+ 2 1+ 2', pluckReg: 62, extra: [
  {key: 'cascade', ...GUZHENG, label: 'Guzheng (water runs)', src: 'figure', fig: '. . . . . . . . ^9 ^8 ^7 ^6', step: .25, reg: 74, vel: 58, gainDb: -12, pan: -.4, hall: .45, every: 2},
  {key: 'afl', ...ALTO_FLUTE, label: 'Alto Flute (lantern answer, below)', src: 'counter', oct: -24, vel: 64, gainDb: -13, pan: .25, hall: .45},
  {key: 'breath', ...BREATH, label: 'Breath (air swells)', src: 'divisi', voices: [1], vel: 46, gainDb: -18, pan: 0, hall: .55, bars: A(16, 32), swell: {bars: 4, depth: 9}},
 ]}, HALL);
const CALM_KEEP = lullaby('calm-keep', 'Lanternkeep Lullaby',
 'Stage 3, D minor waltz: felt piano over a lute and a deep drone, a plainsong hum stealing in; then a high cello with the vault choir, nyckelharpa and the minor motif in the bassoon.',
 58, 2, 'minor', KEEP_CHORDS, KEEP_MEL, KEEP_ANSWER,
 {leadA: FELT, leadALabel: 'Felt Piano', leadB: CELLO, leadBLabel: 'Solo Cello (high)', leadBOct: -12},
 {pluck: LUTE, pluckLabel: 'Lute (picking)', pluckFig: '0- . 2 1+ 2 .', pluckReg: 57, extra: [
  {key: 'drone', ...CAVERN, label: 'Drone (D)', src: 'line', line: 'D2+A2:96', vel: 40, gainDb: -18, pan: 0, hall: .4},
  {key: 'hum', ...PLAINSONG, label: 'Plainsong (hum)', src: 'divisi', voices: [1, 2], oct: -12, vel: 40, gainDb: -18, pan: 0, hall: .55, bars: A(8, 16), swell: {bars: 4, depth: 8}},
  {key: 'vault', ...VAULT, label: 'Vault Choir', src: 'divisi', voices: [1, 2], oct: -12, vel: 48, gainDb: -16, pan: 0, hall: .55, bars: A(16, 32), swell: {bars: 4, depth: 8}},
  {key: 'nyck', ...NYCKELHARPA, label: 'Nyckelharpa (bowed downbeats)', src: 'figure', fig: '0 _ _', step: 1, reg: 50, vel: 50, gainDb: -16, pan: -.25, hall: .45, bars: A(16, 32), every: 2},
  {key: 'bsn', ...BASSOON, label: 'Bassoon (the motif, minor)', src: 'line', line: `${rests(29, 3)} | A2:1.5 D3:.5 E3:1 | F3:3 | r:3`, vel: 64, gainDb: -12, pan: .25, hall: .4},
 ]}, CHAPEL);

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * ENERGY — each lullaby as a galloping adventure (same melody, 3/4 at running tempo). Pass 1: horns lead over
 * spiccato strings, pizzicato and frame drum. Pass 2: flute and violins take the tune, the trumpets shout the
 * lantern motif in every long note, Chora's ARP runs a harp in sixteenths, the snare joins.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
interface GallopColour { lead2: {inst: Inst; preset: string}; lead2Label: string; motor: {inst: Inst; preset: string}; motorLabel: string; motorFig: string; motorStep: number; extra: CuePart[] }
function adventure(id: QuestCueId, title: string, blurb: string, bpm: number, tonicPc: number, scale: string, chords: string[], mel: string, answer: string, col: GallopColour, space: number): Cue {
 const terrace: [number, number][] = [[0, -4], [15.5, -1.5], [16, 0], [31.5, 0], [32, -4]];
 return {
  id, title, blurb, bpm, beats: 3, tonicPc, scale, loop: true, space,
  chords: [...chords, ...chords], melody: twice(mel), counter: `${rests(16, 3)} | ${answer}`,
  sections: [['Gallop · horns', 0, 16], ['Gallop · the lantern shouts', 16, 32]],
  parts: [
   {key: 'horn', ...HORN, label: 'Horns', src: 'melody', oct: -12, vel: 96, gainDb: -6, pan: -.2, hall: .28, bars: A(0, 16)},
   {key: 'lead2', ...col.lead2, label: col.lead2Label, src: 'melody', oct: -12, vel: 80, gainDb: -11, pan: -.1, hall: .26, bars: A(0, 16)},
   {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 88, gainDb: -9, pan: .15, hall: .3, bars: A(16, 32)},
   {key: 'vln', ...STRINGS, label: 'Violins I (the tune)', src: 'melody', vel: 88, gainDb: -8, pan: -.35, hall: .32, bars: A(16, 32)},
   {key: 'hn2', ...HORN, label: 'Horns (the tune, below)', src: 'melody', oct: -12, vel: 84, gainDb: -10, pan: -.2, hall: .3, bars: A(16, 32)},
   {key: 'tpt', ...TRUMPET, label: 'Trumpets (the motif)', src: 'counter', oct: -12, vel: 100, gainDb: -7, pan: .2, hall: .3},
   {key: 'motor', ...col.motor, label: col.motorLabel, src: 'figure', fig: col.motorFig, step: col.motorStep, reg: 55, vel: 80, gainDb: -10, pan: .3, hall: .24, gate: .45, bars: A(0, 16)},
   ...ostinato(3, {bars: A(16, 32), vel: 88}),
   ...brass({bars: A(16, 32), vel: 76, swell: {bars: 4, depth: 6}, tuba: false, tag: 'B'}),
   {key: 'spic', ...QUARTET, label: 'Spiccato Strings', src: 'figure', fig: '0! 2 1+ 2 1 2', step: .5, reg: 57, vel: 82, gainDb: -10, pan: -.3, hall: .2, gate: .35, dyn: terrace},
   ...strings({bars: A(16, 32), skip: ['vln1', 'cb'], vel: 66, gain: -13, tag: 'B', swell: {bars: 4, depth: 5}}),
   {key: 'pizz', ...PIZZ, label: 'Pizzicato Basses', src: 'pizz', oct: -12, vel: 88, gainDb: -10, pan: 0, hall: .15, bars: A(0, 16)},
   {key: 'tbn', ...TROMBONE, label: 'Trombones', src: 'stab', vel: 90, gainDb: -11, pan: .25, hall: .25, every: 2, gate: .2},
   {key: 'timp', ...TIMP_DEEP, label: 'Timpani', src: 'timp', line: 'X-------x---', vel: 92, gainDb: -6, pan: 0, hall: .2},
   {key: 'bod', ...BODHRAN, label: 'Bodhrán', src: 'drum', line: 'X-xxX-xxX-x.', vel: 78, gainDb: -11, pan: -.15, hall: .12},
   {key: 'sn', ...SNARE, label: 'Concert Snare', src: 'drum', line: '----x-----x-', vel: 80, gainDb: -14, pan: .1, hall: .2, bars: A(16, 31)},
   {key: 'snroll', ...SNARE, label: 'Snare (roll)', src: 'drum', line: 'x.x.xxxxXXXX', vel: 84, gainDb: -14, pan: .1, hall: .2, bars: [[15, 16], [31, 32]], ramp: [.5, 1.1]},
   {key: 'taiko', ...TAIKO, label: 'Taiko', src: 'drum', line: 'X', vel: 100, gainDb: -9, pan: 0, hall: .3, bars: [[0, 1], [8, 9], [16, 17], [20, 21], [24, 25], [28, 29]]},
   ...col.extra,
  ],
 };
}

const ENERGY_GLOWMOSS = adventure('energy-glowmoss', 'Glowmoss Gallop', 'Stage 1 running: the Glowmoss waltz at 138, horns doubled by bouzouki tremolo over kora and spiccato; then violins and flute with the full section, trumpets calling the lantern motif, taiko.', 138, 5, 'major', GLOW_CHORDS, GLOW_MEL, GLOW_ANSWER,
 {lead2: BOUZOUKI, lead2Label: 'Bouzouki (tremolo, with the horns)', motor: KORA, motorLabel: 'Kora (motor)', motorFig: '0 1 2 1+ 2 1', motorStep: .5, extra: []}, HALL);
const ENERGY_CASCADE = adventure('energy-cascade', 'Cascade Gallop', 'Stage 2 running: the Cascade waltz at 144, horns and flugelhorn over koto sixteenths; then violins and flute up high, piccolo cascades and the full section.', 144, 2, 'lydian', CASCADE_CHORDS, CASCADE_MEL, CASCADE_ANSWER,
 {lead2: FLUGEL, lead2Label: 'Flugelhorn (with the horns)', motor: KOTO, motorLabel: 'Koto (sixteenths)', motorFig: '0 1 2 3 2+ 1+ 0+ 2 1 2 0+ 2', motorStep: .25, extra: [
  {key: 'pic', ...PICCOLO, label: 'Piccolo (cascades)', src: 'figure', fig: '. . . . . . ^11 ^10 ^9 ^8 ^7 ^6', step: .25, reg: 74, vel: 66, gainDb: -15, pan: .25, hall: .35, bars: A(16, 32), every: 2},
 ]}, HALL);
const ENERGY_KEEP = adventure('energy-keep', 'Lanternkeep Gallop', 'Stage 3 running: the Lanternkeep waltz at 132 in D minor, horns and bassoon over nyckelharpa and frame drums; then trumpets with the byzantine choir and low brass up the castle stairs.', 132, 2, 'minor', KEEP_CHORDS, KEEP_MEL, KEEP_ANSWER,
 {lead2: BASSOON, lead2Label: 'Bassoon (with the horns)', motor: NYCKELHARPA, motorLabel: 'Nyckelharpa (driving)', motorFig: '0! 1 2 1 0 1', motorStep: .5, extra: [
  {key: 'daf', ...DAF, label: 'Daf', src: 'drum', line: 'X--x--x--x-.', vel: 74, gainDb: -14, pan: .2, hall: .15},
  {key: 'byz', ...BYZANTINE, label: 'Byzantine Choir', src: 'divisi', voices: [1, 2], oct: -12, vel: 70, gainDb: -14, pan: 0, hall: .45, bars: A(16, 32), swell: {bars: 2, depth: 4}},
  {key: 'btb', ...BASS_TROMBONE, label: 'Bass Trombone', src: 'root', oct: -12, vel: 84, gainDb: -13, pan: .1, hall: .25, bars: A(16, 32), gate: .5},
 ]}, CHAPEL);

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * DANGER — "Thorns in the Dark" (D minor, 3/4, 63). Tremolo strings, a heartbeat on the deep tar, high string
 * sighs, a solo violin's falling line; pass 2 an alto flute doubles it and the bassoon creeps the motif in minor.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const DANGER_CHORDS = ['D3+A3+D4+F4', 'Bb2+F3+Bb3+D4', 'G3+Bb3+D4+A4', 'A3+C#4+E4+Bb4', 'D3+A3+D4+F4', 'Eb3+Bb3+Eb4+G4', 'C#3+E3+G3+Bb3', 'A3+D4+E4+G4'];
const DANGER_MEL = 'r:1 A5:1 Bb5:1 | A5:2 F5:1 | r:1 G5:1 Bb5:1 | C#6:2 Bb5:1 | r:1 D6:1 F6:1 | Eb6:2 D6:1 | C#6:1 Bb5:1 G5:1 | E5:1 r:2';
const DANGER: Cue = {
 id: 'danger', title: 'Thorns in the Dark', bpm: 63, beats: 3, tonicPc: 2, scale: 'minor', loop: true, space: CHAPEL,
 blurb: 'Danger zones: VELA tremolo strings, a tar heartbeat, high string sighs, a solo violin falling; the bassoon creeps the motif in minor.',
 chords: [...DANGER_CHORDS, ...DANGER_CHORDS], melody: twice(DANGER_MEL),
 counter: `${rests(8, 3)} | r:3 | r:3 | r:3 | A2:.75 D3:.25 E3:1 C#3:1 | r:3 | r:3 | r:3 | A2:.75 D3:.25 E3:1 F3:1`,
 sections: [['Thorns', 0, 8], ['Thorns · something follows', 8, 16]],
 parts: [
  {key: 'vln', ...VIOLIN, label: 'Solo Violin', src: 'melody', vel: 72, gainDb: -8, pan: 0, hall: .4},
  {key: 'afl', ...ALTO_FLUTE, label: 'Alto Flute', src: 'melody', oct: -12, vel: 68, gainDb: -11, pan: .15, hall: .45, bars: A(8, 16)},
  {key: 'bsn', ...BASSOON, label: 'Bassoon (the motif, minor)', src: 'counter', vel: 74, gainDb: -9, pan: .25, hall: .35},
  {key: 'trem', ...TREMOLO, label: 'Tremolo Strings', src: 'divisi', voices: [1, 2, 3], oct: -12, vel: 56, gainDb: -12, pan: 0, hall: .42, dyn: [[0, -9], [7, -4], [8, -6], [15, 0], [16, -9]]},
  ...strings({skip: ['vln1', 'vln2'], vel: 48, gain: -15, swell: {bars: 2, depth: 6}}),
  {key: 'hard', ...HARDANGER, label: 'Hardanger (drone, sympathetics)', src: 'line', line: 'D3+A3:48', vel: 44, gainDb: -16, pan: -.2, hall: .45},
  {key: 'sighs', ...SUL_TASTO, label: 'High string sighs', src: 'line', oct: -12, line: twice('A6:3 | F6:3 | A6:3 | Bb6:3 | A6:3 | G6:3 | Bb6:3 | G6:3'), vel: 42, gainDb: -17, pan: -.35, hall: .55, bars: A(8, 16)},
  {key: 'shaku', ...SHAKUHACHI, label: 'Shakuhachi (breath)', src: 'line', line: `${rests(9, 3)} | r:1 Eb5:2 | r:3 | r:3 | r:1 D5:2 | r:3 | r:3 | r:3`, vel: 58, gainDb: -14, pan: -.2, hall: .5},
  {key: 'heart', ...TAR, label: 'Heartbeat (tar)', src: 'drum', line: 'X--x--------', vel: 92, gainDb: -6, pan: 0, hall: .2, bars: A(0, 8)},
  {key: 'heart2', ...TAR, label: 'Heartbeat (faster)', src: 'drum', line: 'X--x--X--x--', vel: 96, gainDb: -6, pan: 0, hall: .2, bars: A(8, 16)},
  {key: 'timp', ...TIMP_DEEP, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.x.x.', vel: 72, gainDb: -10, pan: 0, hall: .3, bars: A(15, 16), ramp: [.4, 1]},
 ],
};

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * FEAR — "One Petal Left" (D phrygian, 4/4, 84). The lantern motif bent to sol · do – ra – me in a low cello,
 * pizzicato ticking on two semitones, a double heartbeat, a hushed choir; pass 2 a horn takes the tune up an octave.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const FEAR_CHORDS = ['D3+A3+D4+F4', 'D3+Eb3+G3+Bb3', 'D3+A3+D4+F4', 'C#3+E3+G3+Bb3', 'D3+A3+D4+F4', 'D3+G3+Bb3+D4', 'D3+Eb3+G3+Bb3', 'A2+C#3+G3+Bb3'];
const FEAR_MEL = 'r:4 | A3:1.5 D4:.5 Eb4:2 | F4:3 r:1 | E4:1.5 C#4:.5 Bb3:2 | r:4 | A3:1.5 D4:.5 Eb4:1 F4:1 | G4:2 Eb4:2 | C#4:3 r:1';
const FEAR: Cue = {
 id: 'fear', title: 'One Petal Left', bpm: 84, beats: 4, tonicPc: 2, scale: 'phrygian', loop: true, space: CHAPEL,
 blurb: 'Last petal: the motif in phrygian on a low cello, ticking pizzicato, a double heartbeat, hushed choir; a horn takes it up the second time.',
 chords: [...FEAR_CHORDS, ...FEAR_CHORDS], melody: twice(FEAR_MEL),
 sections: [['One petal', 0, 8], ['One petal · closer', 8, 16]],
 parts: [
  {key: 'vc', ...CELLO, label: 'Cello (the motif, phrygian)', src: 'melody', vel: 84, gainDb: -6, pan: 0, hall: .32},
  {key: 'hn', ...HORN, label: 'Horn', src: 'melody', oct: 12, vel: 72, gainDb: -10, pan: -.25, hall: .4, bars: A(8, 16), dyn: [[8, -6], [15, 2], [16, -6]]},
  {key: 'tick', ...PIZZ, label: 'Pizzicato (ticking)', src: 'tick', vel: 72, gainDb: -11, pan: .3, hall: .25, gate: .3},
  {key: 'ngoni', ...NGONI, label: 'Kamale ngoni (muted plucks)', src: 'figure', fig: '0 . . 1 . . 0 . . . 1 . . . . .', step: .25, reg: 62, vel: 70, gainDb: -10, pan: -.3, hall: .3, gate: .4},
  {key: 'vln', ...SUL_TASTO, label: 'High Violins', src: 'line', line: 'A5:8 | Bb5:8 | A5:8 | G5:4 Bb5:4 | D6:8 | Eb6:8 | D6:8 | C#6:8', vel: 46, gainDb: -16, pan: -.35, hall: .5, swell: {bars: 2, depth: 6}},
  ...strings({skip: ['vln1', 'vln2', 'vc'], vel: 46, gain: -15, swell: {bars: 2, depth: 7}}),
  {key: 'drone', ...CAVERN, label: 'Drone (D)', src: 'line', line: 'D2:64', vel: 40, gainDb: -18, pan: 0, hall: .4},
  {key: 'choir', ...VAULT, label: 'Vault Choir (hushed)', src: 'divisi', voices: [1, 2], oct: -12, vel: 44, gainDb: -16, pan: 0, hall: .55, bars: A(8, 16), swell: {bars: 2, depth: 8}},
  {key: 'cl', ...CLARINET, label: 'Clarinet (bent motif)', src: 'line', oct: -12, line: twice('r:4 | r:4 | r:4 | r:2 A5:.75 D6:.25 Eb6:1 | r:4 | r:4 | r:4 | r:2 A5:.75 D6:.25 Eb6:1'), vel: 64, gainDb: -13, pan: .35, hall: .45},
  {key: 'shaku', ...SHAKUHACHI, label: 'Shakuhachi (breath)', src: 'line', line: `${rests(9, 4)} | r:2 Eb5:2 | r:4 | r:4 | r:2 Eb5:2 | r:4 | r:4 | r:4`, vel: 60, gainDb: -14, pan: -.2, hall: .5},
  {key: 'heart', ...TAR, label: 'Heartbeat (tar)', src: 'drum', line: 'X--x------------', vel: 96, gainDb: -6, pan: 0, hall: .2, bars: A(0, 8)},
  {key: 'heart2', ...TAR, label: 'Double heartbeat', src: 'drum', line: 'X--x----X--x----', vel: 100, gainDb: -6, pan: 0, hall: .2, bars: A(8, 16)},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 90, gainDb: -10, pan: 0, hall: .35, bars: [[8, 9], [12, 13]]},
  {key: 'timp', ...TIMP_DEEP, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.x.x.xxxx', vel: 80, gainDb: -8, pan: 0, hall: .3, bars: A(15, 16), ramp: [.35, 1.1]},
 ],
};

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * BATTLE — "The Hollow Warden" (D minor war-waltz, 3/4, 160). Pass 1 horns over spiccato, choir, timpani, a
 * galloping bendir and trombone stabs. Pass 2 trumpets and violins take the tune, the trombones answer with the
 * lantern motif in minor (and once in F major, the hero's light breaking through), snare and gran cassa drive.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const BATTLE_CHORDS = [
 'D2+A2+D3+F3', 'Bb1+F2+Bb2+D3', 'G1+D2+G2+Bb2', 'A1+E2+A2+C#3', 'D2+A2+D3+F3', 'Eb2+Bb2+Eb3+G3', 'C#2+E2+G2+Bb2', 'A1+E2+G2+C#3',
 'F2+C3+F3+A3', 'C2+G2+C3+E3', 'D2+A2+D3+F3', 'Bb1+F2+Bb2+D3', 'G1+D2+G2+Bb2', 'Eb2+Bb2+Eb3+G3', 'A1+E2+G2+C#3', 'A1+E2+A2+C#3',
];
const BATTLE_MEL =
 'A4:1 D5:1 F5:1 | F5:2 D5:1 | G5:1 F5:1 D5:1 | C#5:3 | D5:1 F5:1 A5:1 | Bb5:2 G5:1 | G5:1 E5:1 C#5:1 | E5:3 |' +
 'F5:1 A5:1 C6:1 | C6:2 G5:1 | A5:1 F5:1 D5:1 | F5:2 Bb5:1 | G5:1.5 F5:.5 D5:1 | Eb5:2 G5:1 | E5:1 C#5:1 E5:1 | A5:3';
const BATTLE_ANSWER =
 'A3:1.5 D4:.5 E4:1 | F4:3 | r:3 | r:3 | A3:1.5 D4:.5 E4:1 | F4:3 | r:3 | r:3 |' +
 'C4:1.5 F4:.5 G4:1 | A4:3 | r:3 | r:3 | D4:1.5 G4:.5 A4:1 | Bb4:3 | r:3 | r:3';
const BATTLE: Cue = {
 id: 'battle', title: 'The Hollow Warden', bpm: 160, beats: 3, tonicPc: 2, scale: 'minor', loop: true, space: CHAPEL,
 blurb: 'Boss fight war-waltz in D minor: horns, then trumpets and violins, choir, spiccato, timpani, bendir gallop; trombones answer with the motif.',
 chords: [...BATTLE_CHORDS, ...BATTLE_CHORDS], melody: twice(BATTLE_MEL), counter: `${rests(16, 3)} | ${BATTLE_ANSWER}`,
 sections: [['Warden · horns', 0, 16], ['Warden · the lantern fights back', 16, 32]],
 parts: [
  {key: 'horn', ...HORN, label: 'Horns', src: 'melody', oct: -12, vel: 100, gainDb: -6, pan: -.3, hall: .28},
  {key: 'tbnmel', ...TROMBONE, label: 'Trombones (the tune, below)', src: 'melody', oct: -24, vel: 92, gainDb: -11, pan: .1, hall: .26, bars: A(0, 16)},
  {key: 'tpt', ...TRUMPET, label: 'Trumpets', src: 'melody', vel: 96, gainDb: -8, pan: .3, hall: .28, bars: A(16, 32)},
  {key: 'vlnmel', ...VIOLIN, label: 'Violins I (the tune)', src: 'melody', vel: 90, gainDb: -8, pan: -.35, hall: .3, bars: A(16, 32)},
  {key: 'bouz', ...BOUZOUKI, label: 'Bouzouki (tremolo, with the violins)', src: 'melody', oct: -12, vel: 78, gainDb: -13, pan: -.15, hall: .24, bars: A(16, 32)},
  {key: 'tbnmotif', ...TROMBONE, label: 'Trombones (the motif, minor)', src: 'counter', vel: 104, gainDb: -8, pan: .25, hall: .28},
  {key: 'hncanon', ...HORN, label: 'Horns (motif canon, a bar behind)', src: 'counter', shift: 3, vel: 90, gainDb: -11, pan: -.25, hall: .3},
  {key: 'run', ...STRINGS, label: 'Violins II (running)', src: 'figure', fig: '0! 1 2 1+ 2 1', step: .5, reg: 62, vel: 86, gainDb: -10, pan: -.15, hall: .2, gate: .4},
  {key: 'ost', ...CELLO, label: 'Celli (bowed threat)', src: 'figure', fig: '0! . 0 . 0 0', step: .5, reg: 43, vel: 96, gainDb: -9, pan: .35, hall: .2, gate: .55},
  {key: 'cb', ...BASS, label: 'Basses', src: 'root', oct: -12, vel: 90, gainDb: -11, pan: 0, hall: .15, gate: .3},
  ...strings({skip: ['vln1', 'vln2', 'vc', 'cb'], vel: 70, gain: -13, swell: {bars: 2, depth: 4}}),
  {key: 'choir', ...CHOIR, label: 'Choir', src: 'divisi', voices: [0, 1, 2], oct: -12, vel: 64, gainDb: -13, pan: 0, hall: .45, ramp: [.8, 1.15]},
  {key: 'byz', ...BYZANTINE, label: 'Byzantine Choir (stabs)', src: 'stab', oct: 12, vel: 80, gainDb: -14, pan: 0, hall: .4, gate: .35, bars: A(16, 32)},
  ...brass({bars: A(16, 32), vel: 84, swell: {bars: 2, depth: 5}, tag: 'B'}),
  {key: 'timp', ...TIMP_DEEP, label: 'Timpani', src: 'timp', line: 'X-----x-----', vel: 100, gainDb: -5, pan: 0, hall: .2, bars: A(0, 16)},
  {key: 'timp2', ...TIMP_DEEP, label: 'Timpani (pass 2)', src: 'timp', line: 'X---f-x-----', vel: 106, gainDb: -5, pan: 0, hall: .2, bars: A(16, 32)},
  {key: 'bendir', ...BENDIR, label: 'Bendir (gallop)', src: 'drum', line: 'X-xxo-xxo-xx', vel: 84, gainDb: -10, pan: .15, hall: .15},
  {key: 'taiko', ...TAIKO, label: 'Taiko', src: 'drum', line: 'X', vel: 104, gainDb: -8, pan: 0, hall: .3, every: 2, bars: A(0, 16)},
  {key: 'taiko2', ...TAIKO, label: 'Taiko (pass 2)', src: 'drum', line: 'X---x-------', vel: 110, gainDb: -8, pan: 0, hall: .3, bars: A(16, 32)},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 110, gainDb: -9, pan: 0, hall: .3, bars: [[16, 17], [24, 25]]},
  {key: 'sn', ...SNARE, label: 'Concert Snare', src: 'drum', line: 'x-x.x-x.x-xx', vel: 82, gainDb: -14, pan: .1, hall: .2, bars: A(16, 31)},
  {key: 'snroll', ...SNARE, label: 'Snare (roll)', src: 'drum', line: 'xxxxxxxxXXXX', vel: 84, gainDb: -14, pan: .1, hall: .2, bars: [[15, 16], [31, 32]], ramp: [.45, 1.15]},
 ],
};

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * JINGLES
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
/** Stage clear — "Lantern Lit": the motif, triumphant, a harp sweep, landing on a held major-9 sparkle. */
const CLEAR: Cue = {
 id: 'clear', title: 'Lantern Lit', bpm: 132, beats: 4, tonicPc: 5, scale: 'major', loop: false, space: HALL,
 blurb: 'Stage clear: trumpet, flute and violins play the lantern motif over horns, a harp sweep and timpani, ending on F major 9.',
 chords: ['F', 'Bb C', 'Fmaj9'],
 melody: 'C5:.75 F5:.25 G5:.5 A5:.5 C6:1 A5:1 | Bb5:.5 A5:.5 G5:.5 A5:.5 C6:1 E6:1 | F6:4',
 counter: 'A4:.75 C5:.25 E5:.5 F5:.5 A5:1 F5:1 | F5:.5 F5:.5 E5:.5 F5:.5 G5:1 Bb5:1 | A5:4',
 bass: 'F2:2 C3:2 | Bb1:2 C2:2 | F1:4',
 sections: [['Lantern Lit', 0, 3]],
 parts: [
  {key: 'tpt', ...TRUMPET, label: 'Trumpet', src: 'melody', oct: -12, vel: 100, gainDb: -6, pan: 0, hall: .35},
  {key: 'hnmel', ...HORN, label: 'Horn (the motif)', src: 'melody', oct: -24, vel: 88, gainDb: -10, pan: -.25, hall: .32},
  {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 90, gainDb: -9, pan: .15, hall: .35},
  {key: 'vlnmel', ...STRINGS, label: 'Violins I (the tune)', src: 'melody', vel: 84, gainDb: -9, pan: -.35, hall: .42},
  {key: 'hn', ...HORN, label: 'Horns', src: 'counter', oct: -12, vel: 90, gainDb: -9, pan: -.2, hall: .32},
  {key: 'tbn', ...TROMBONE, label: 'Trombone', src: 'bass', oct: 12, vel: 86, gainDb: -11, pan: .25, hall: .3},
  ...strings({skip: ['vln1'], vel: 74, gain: -11, swell: {bars: 3, depth: 3}}),
  {key: 'qanun', ...QANUN, label: 'Qanun sweep', src: 'line', line: 'r:4 | r:3 F4:.125 G4:.125 A4:.125 C5:.125 D5:.125 F5:.125 G5:.125 A5:.125 | F4+C5+F5+A5:4', vel: 78, gainDb: -10, pan: -.3, hall: .45},
  {key: 'harp', ...HARP, label: 'Harp sweep', src: 'line', line: 'r:4 | r:3 F3:.125 A3:.125 C4:.125 F4:.125 G4:.125 A4:.125 C5:.125 F5:.125 | F3+C4+A4:4', vel: 74, gainDb: -12, pan: .35, hall: .45},
  {key: 'timp', ...TIMPANI, label: 'Timpani', src: 'timp', line: 'X-------x-------' + 'x.x.x.x.xxxxxxxx' + 'X---------------', vel: 92, gainDb: -6, pan: 0, hall: .3},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 104, gainDb: -9, pan: 0, hall: .35, bars: [[0, 1], [2, 3]]},
 ],
};

/** Game over — "The Lantern Dims": the motif falls instead of rising and settles on a soft major turn (never cruel). */
const GAMEOVER: Cue = {
 id: 'gameover', title: 'The Lantern Dims', bpm: 72, beats: 4, tonicPc: 2, scale: 'minor', loop: false, space: HALL,
 blurb: 'Game over: a felt piano lets the motif fall over strings, harp and a low cello, ending on a gentle F major.',
 chords: ['Dm', 'Bbmaj7', 'Gm6', 'F'],
 melody: 'A5:1.5 G5:.5 F5:1 D5:1 | F5:1.5 E5:.5 D5:2 | Bb4:1 D5:1 E5:2 | F5:4',
 bass: 'D2:4 | Bb1:4 | G1:4 | F1:4',
 sections: [['The Lantern Dims', 0, 4]],
 parts: [
  {key: 'pno', ...FELT, label: 'Felt Piano', src: 'melody', vel: 70, gainDb: -7, pan: 0, hall: .45},
  {key: 'koto', ...KOTO, label: 'Koto (echo, an octave up)', src: 'melody', oct: 12, shift: .5, vel: 48, gainDb: -15, pan: .25, hall: .5, bars: A(0, 2)},
  {key: 'ehn', ...ENGLISH_HORN, label: 'English Horn', src: 'melody', oct: -12, vel: 64, gainDb: -12, pan: .15, hall: .45, bars: A(2, 4)},
  ...strings({skip: ['vln1'], vel: 50, gain: -14, swell: {bars: 4, depth: 6}, violins: SUL_TASTO}),
  {key: 'harp', ...HARP, label: 'Harp', src: 'harp', oct: 12, vel: 56, gainDb: -13, pan: .3, hall: .45},
  {key: 'vla2', ...VIOLA, label: 'Viola (counter)', src: 'line', line: 'F4:4 | F4:2 E4:2 | D4:4 | C4:4', vel: 54, gainDb: -15, pan: -.15, hall: .5},
  {key: 'breath', ...BREATH, label: 'Breath', src: 'line', line: 'r:8 | A4+D5:8', vel: 40, gainDb: -19, pan: 0, hall: .55},
 ],
};

export const QUEST_CUES: Cue[] = [
 TITLE, CALM_GLOWMOSS, CALM_CASCADE, CALM_KEEP, ENERGY_GLOWMOSS, ENERGY_CASCADE, ENERGY_KEEP, DANGER, FEAR, BATTLE, CLEAR, GAMEOVER,
];
export const questCue = (id: string) => QUEST_CUES.find(c => c.id === id);

/* ── parsing ──────────────────────────────────────────────────────────────────────────────── */
const PC: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
export function noteToMidi(n: string): number {
 const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
 if (!m) throw new Error(`kithQuest score: bad note ${n}`);
 return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export interface Ev { t: number; d: number; keys: number[] }
/** A line → events at absolute beats (rests skipped). */
export function parseLine(line: string): Ev[] {
 const out: Ev[] = []; let t = 0;
 for (const tok of line.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
  const [n, b] = tok.split(':'); const d = Number(b);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`kithQuest score: bad duration in ${tok}`);
  if (n !== 'r') out.push({t, d, keys: n.split('+').map(noteToMidi)});
  t += d;
 }
 return out;
}
export const lineBeats = (line: string) => line.replace(/\|/g, ' ').split(/\s+/).filter(Boolean).reduce((a, tok) => a + Number(tok.split(':')[1]), 0);

const QUAL: Record<string, number[]> = {
 '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
 m6: [0, 3, 7, 9], '6': [0, 4, 7, 9], sus: [0, 5, 7], '7sus': [0, 5, 7, 10], add9: [0, 4, 7, 14], dim7: [0, 3, 6, 9], m9: [0, 3, 7, 10, 14],
};
/** A chord field's chords, each voiced (lowest note first). Symbols are voiced root-position from octave 3. */
export function barVoicings(field: string): number[][] {
 return field.split(/\s+/).filter(Boolean).map(sym => {
  if (sym.includes('+')) return sym.split('+').map(noteToMidi);
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  if (!m) throw new Error(`kithQuest score: bad chord ${sym}`);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = QUAL[m[3]];
  if (!q) throw new Error(`kithQuest score: unknown chord quality ${sym}`);
  const root = 48 + ((pc - 48 % 12 + 12) % 12) - (pc > 7 ? 12 : 0); // F..B sit in octave 2 so voicings stay low-ish
  const tones = q.map(i => root + i);
  if (tones.length === 3) tones.push(root + 12);
  return tones;
 });
}
