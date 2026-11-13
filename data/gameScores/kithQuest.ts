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
 /** one voice of the voice-led string choir (see `voice`): the chords as five real lines with suspensions */ | 'divisi';

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
const TITLE_BASS =
 'F2:2 C3:2 | D2:2 A2:2 | Bb1:2 F2:2 | C2:2 G2:2 | F2:2 C3:2 | D2:2 A2:2 | Bb1:2 C2:2 | F2:4 |' +
 'Bb1:2 F2:2 | Bb1:2 D2:2 | C2:2 G2:2 | C2:2 E2:2 | D2:2 A2:2 | A1:2 E2:2 | G1:2 D2:2 | C2:4 |' +
 'F2:2 C3:2 | D2:2 A2:2 | Bb1:2 F2:2 | C2:2 G2:2 | F2:2 C3:2 | D2:2 A2:2 | Bb1:2 C2:2 | F2:4';

const TITLE: Cue = {
 id: 'title', title: 'The Lantern Road', bpm: 108, beats: 4, tonicPc: 5, scale: 'major', loop: true, space: HALL,
 blurb: 'The main theme: horn, then strings, then trumpet and flute sing the lantern motif over an ARP harp, pizzicato and timpani.',
 chords: [
  'F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb C', 'F',
  'Bb', 'Bb', 'C', 'C', 'Dm', 'Am', 'Gm7', 'C7',
  'F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb C', 'F',
 ],
 melody: TITLE_MEL, counter: TITLE_COUNTER, bass: TITLE_BASS,
 sections: [['A · The motif', 0, 8], ['B · The road lifts', 8, 16], ["A' · Lantern Road", 16, 24]],
 parts: [
  {key: 'horn', ...HORN, label: 'Lead Horn', src: 'melody', oct: -12, vel: 92, gainDb: -5, pan: -.12, hall: .32, bars: A(0, 8)},
  {key: 'vln', ...STRINGS, label: 'Violins', src: 'melody', vel: 88, gainDb: -6, pan: -.25, hall: .4, bars: [[8, 24]]},
  {key: 'tpt', ...TRUMPET, label: 'Trumpet', src: 'melody', oct: -12, vel: 90, gainDb: -8, pan: .1, hall: .3, bars: A(16, 24)},
  {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 84, gainDb: -9, pan: .3, hall: .35, bars: A(16, 24)},
  {key: 'ob', ...OBOE, label: 'Oboe', src: 'counter', vel: 74, gainDb: -11, pan: .3, hall: .38, bars: A(0, 8)},
  {key: 'cl', ...CLARINET, label: 'Clarinet', src: 'counter', vel: 78, gainDb: -10, pan: .2, hall: .3, bars: A(8, 16)},
  {key: 'hncounter', ...HORN, label: 'Horns (counter)', src: 'counter', vel: 80, gainDb: -10, pan: .22, hall: .32, bars: A(16, 24)},
  {key: 'vc', ...CELLO, label: 'Celli', src: 'bass', oct: 12, vel: 82, gainDb: -9, pan: .3, hall: .25},
  {key: 'cb', ...BASS, label: 'Basses', src: 'bass', vel: 80, gainDb: -10, pan: .1, hall: .2, bars: [[8, 24]]},
  {key: 'harp', ...HARP, label: 'Harp (ARP)', src: 'arp', oct: 12, vel: 76, gainDb: -10, pan: -.35, hall: .35, arp: {order: 'up', rate: 2, octaves: 2, accents: 5}},
  {key: 'pad', ...STRINGS, label: 'String Pad', src: 'pad', vel: 52, gainDb: -16, pan: 0, hall: .45, bars: [[8, 24]]},
  {key: 'pizz', ...PIZZ, label: 'Pizzicato', src: 'pizz', oct: -12, vel: 74, gainDb: -12, pan: .4, hall: .25, bars: A(0, 8)},
  {key: 'timp', ...TIMPANI, label: 'Timpani', src: 'timp', line: 'X---------------' + '----------------', vel: 70, gainDb: -6, pan: -.15, hall: .25, bars: A(0, 15)},
  {key: 'timproll', ...TIMPANI, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.xxxxxxxx', vel: 80, gainDb: -6, pan: -.15, hall: .25, bars: A(15, 16), ramp: [.45, 1.1]},
  {key: 'timp2', ...TIMPANI, label: 'Timpani (A\')', src: 'timp', line: 'X-------x---f---', vel: 88, gainDb: -6, pan: -.15, hall: .25, bars: A(16, 24)},
  {key: 'bod', ...BODHRAN, label: 'Bodhrán', src: 'drum', line: 'X--xX-x-X--xX-xx', vel: 70, gainDb: -12, pan: .3, hall: .15, bars: A(16, 24)},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 100, gainDb: -8, pan: 0, hall: .3, bars: [[8, 9], [16, 17], [23, 24]]},
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

interface StageVoices { leadA: {inst: Inst; preset: string}; leadALabel: string; leadAOct?: number; leadB: {inst: Inst; preset: string}; leadBLabel: string; choir: boolean }
function lullaby(id: QuestCueId, title: string, blurb: string, bpm: number, tonicPc: number, scale: string, chords: string[], mel: string, answer: string, v: StageVoices, space: number): Cue {
 const parts: CuePart[] = [
  {key: 'leadA', ...v.leadA, label: v.leadALabel, src: 'melody', oct: v.leadAOct ?? 0, vel: 78, gainDb: -7, pan: -.05, hall: .42, bars: A(0, 16)},
  {key: 'leadB', ...v.leadB, label: v.leadBLabel, src: 'melody', oct: -12, vel: 80, gainDb: -7, pan: -.1, hall: .4, bars: A(16, 32)},
  {key: 'answer', ...OBOE, label: 'Oboe (the lantern answers)', src: 'counter', oct: -12, vel: 70, gainDb: -11, pan: .3, hall: .42},
  {key: 'harp', ...HARP, label: 'Harp', src: 'harp', oct: 12, vel: 64, gainDb: -10, pan: -.32, hall: .38},
  {key: 'pad', ...STRINGS, label: 'Strings', src: 'pad', vel: 50, gainDb: -14, pan: .05, hall: .5},
  {key: 'vc', ...CELLO, label: 'Cello', src: 'root', oct: -12, vel: 62, gainDb: -12, pan: .28, hall: .35},
 ];
 if (v.choir) parts.push({key: 'choir', ...CHOIR, label: 'Choir', src: 'pad', oct: 12, vel: 44, gainDb: -17, pan: 0, hall: .55});
 return {
  id, title, blurb, bpm, beats: 3, tonicPc, scale, loop: true, space,
  chords: [...chords, ...chords], melody: twice(mel), counter: `${rests(16, 3)} | ${answer}`,
  sections: [['Lullaby', 0, 16], ['Lullaby · the lantern answers', 16, 32]],
  parts,
 };
}

const CALM_GLOWMOSS = lullaby('calm-glowmoss', 'Glowmoss Lullaby',
 'Stage 1, F major waltz: clarinet over harp and strings; then flute, with the oboe answering in the lantern motif.',
 64, 5, 'major', GLOW_CHORDS, GLOW_MEL, GLOW_ANSWER,
 {leadA: CLARINET, leadALabel: 'Clarinet', leadAOct: -12, leadB: FLUTE, leadBLabel: 'Flute', choir: false}, HALL);
const CALM_CASCADE = lullaby('calm-cascade', 'Cascade Lullaby',
 'Stage 2, D Lydian waltz: a high flute like falling water, then a solo violin, the lantern motif in the oboe.',
 72, 2, 'lydian', CASCADE_CHORDS, CASCADE_MEL, CASCADE_ANSWER,
 {leadA: FLUTE, leadALabel: 'Flute', leadB: VIOLIN, leadBLabel: 'Solo Violin', choir: false}, HALL);
const CALM_KEEP = lullaby('calm-keep', 'Lanternkeep Lullaby',
 'Stage 3, D minor waltz: felt piano and a hushed choir, then a high cello, the motif bent into minor at the end.',
 58, 2, 'minor', KEEP_CHORDS, KEEP_MEL, KEEP_ANSWER,
 {leadA: FELT, leadALabel: 'Felt Piano', leadB: CELLO, leadBLabel: 'Solo Cello (high)', choir: true}, CHAPEL);

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * ENERGY — each lullaby as a galloping adventure (same melody, 3/4 at running tempo). Pass 1: horns lead over
 * spiccato strings, pizzicato and frame drum. Pass 2: flute and violins take the tune, the trumpets shout the
 * lantern motif in every long note, Chora's ARP runs a harp in sixteenths, the snare joins.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
function adventure(id: QuestCueId, title: string, blurb: string, bpm: number, tonicPc: number, scale: string, chords: string[], mel: string, answer: string, space: number): Cue {
 return {
  id, title, blurb, bpm, beats: 3, tonicPc, scale, loop: true, space,
  chords: [...chords, ...chords], melody: twice(mel), counter: `${rests(16, 3)} | ${answer}`,
  sections: [['Gallop · horns', 0, 16], ['Gallop · the lantern shouts', 16, 32]],
  parts: [
   {key: 'horn', ...HORN, label: 'Horns', src: 'melody', oct: -12, vel: 96, gainDb: -5, pan: -.15, hall: .28},
   {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 88, gainDb: -8, pan: .28, hall: .3, bars: A(16, 32)},
   {key: 'vln', ...VIOLIN, label: 'Violins', src: 'melody', vel: 86, gainDb: -8, pan: -.3, hall: .3, bars: A(16, 32)},
   {key: 'tpt', ...TRUMPET, label: 'Trumpets (the motif)', src: 'counter', oct: -12, vel: 100, gainDb: -7, pan: .12, hall: .3},
   {key: 'spic', ...QUARTET, label: 'Spiccato Strings', src: 'spic', vel: 84, gainDb: -9, pan: -.2, hall: .2, gate: .35},
   {key: 'pizz', ...PIZZ, label: 'Pizzicato Basses', src: 'pizz', oct: -12, vel: 86, gainDb: -10, pan: .1, hall: .15},
   {key: 'tbn', ...TROMBONE, label: 'Trombones', src: 'stab', vel: 92, gainDb: -10, pan: .25, hall: .25, every: 2, gate: .22},
   {key: 'harp', ...HARP, label: 'Harp (ARP)', src: 'arp', vel: 72, gainDb: -12, pan: .38, hall: .3, bars: A(16, 32), arp: {order: 'upDownInclusive', rate: 4, octaves: 1, accents: 7}},
   {key: 'timp', ...TIMPANI, label: 'Timpani', src: 'timp', line: 'X-------x---', vel: 92, gainDb: -6, pan: -.15, hall: .2},
   {key: 'bod', ...BODHRAN, label: 'Bodhrán', src: 'drum', line: 'X-xxX-xxX-x.', vel: 78, gainDb: -10, pan: .3, hall: .12},
   {key: 'sn', ...SNARE, label: 'Concert Snare', src: 'drum', line: '----x-----x-', vel: 80, gainDb: -14, pan: .2, hall: .2, bars: A(16, 31)},
   {key: 'snroll', ...SNARE, label: 'Snare (roll)', src: 'drum', line: 'x.x.xxxxXXXX', vel: 84, gainDb: -14, pan: .2, hall: .2, bars: [[15, 16], [31, 32]], ramp: [.5, 1.1]},
   {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 104, gainDb: -9, pan: 0, hall: .3, bars: [[0, 1], [8, 9], [16, 17], [24, 25]]},
  ],
 };
}

const ENERGY_GLOWMOSS = adventure('energy-glowmoss', 'Glowmoss Gallop', 'Stage 1 running: the Glowmoss waltz at 138 for horns, spiccato and bodhrán; trumpets call the lantern motif.', 138, 5, 'major', GLOW_CHORDS, GLOW_MEL, GLOW_ANSWER, HALL);
const ENERGY_CASCADE = adventure('energy-cascade', 'Cascade Gallop', 'Stage 2 running: the Cascade waltz at 144, Lydian brass and a sixteenth-note harp ARP.', 144, 2, 'lydian', CASCADE_CHORDS, CASCADE_MEL, CASCADE_ANSWER, HALL);
const ENERGY_KEEP = adventure('energy-keep', 'Lanternkeep Gallop', 'Stage 3 running: the Lanternkeep waltz at 132 in D minor, horns and snare up the castle stairs.', 132, 2, 'minor', KEEP_CHORDS, KEEP_MEL, KEEP_ANSWER, CHAPEL);

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
  {key: 'vln', ...VIOLIN, label: 'Solo Violin', src: 'melody', vel: 72, gainDb: -8, pan: -.1, hall: .48},
  {key: 'afl', ...ALTO_FLUTE, label: 'Alto Flute', src: 'melody', oct: -12, vel: 70, gainDb: -9, pan: .2, hall: .45, bars: A(8, 16)},
  {key: 'bsn', ...BASSOON, label: 'Bassoon (the motif, minor)', src: 'counter', vel: 74, gainDb: -8, pan: .15, hall: .35},
  {key: 'trem', ...TREMOLO, label: 'Tremolo Strings', src: 'pad', oct: -12, vel: 58, gainDb: -10, pan: 0, hall: .4},
  {key: 'cb', ...BASS, label: 'Basses', src: 'root', oct: -12, vel: 64, gainDb: -11, pan: .05, hall: .3},
  {key: 'sighs', ...STRINGS, label: 'High string sighs', src: 'line', oct: -12, line: twice('A6:3 | F6:3 | A6:3 | Bb6:3 | A6:3 | G6:3 | Bb6:3 | G6:3'), vel: 44, gainDb: -17, pan: .4, hall: .55},
  {key: 'heart', ...TAR, label: 'Heartbeat (tar)', src: 'drum', line: 'X--x--------', vel: 92, gainDb: -6, pan: 0, hall: .2, bars: A(0, 8)},
  {key: 'heart2', ...TAR, label: 'Heartbeat (faster)', src: 'drum', line: 'X--x--X--x--', vel: 96, gainDb: -6, pan: 0, hall: .2, bars: A(8, 16)},
  {key: 'timp', ...TIMPANI, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.x.x.', vel: 70, gainDb: -10, pan: -.2, hall: .3, bars: A(15, 16), ramp: [.4, 1]},
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
  {key: 'vc', ...CELLO, label: 'Cello (the motif, phrygian)', src: 'melody', vel: 84, gainDb: -6, pan: -.15, hall: .35},
  {key: 'hn', ...HORN, label: 'Horn', src: 'melody', oct: 12, vel: 70, gainDb: -10, pan: .2, hall: .4, bars: A(8, 16)},
  {key: 'tick', ...PIZZ, label: 'Pizzicato (ticking)', src: 'tick', vel: 72, gainDb: -10, pan: .3, hall: .25, gate: .3},
  {key: 'vln', ...STRINGS, label: 'High Violins', src: 'line', line: 'A5:8 | Bb5:8 | A5:8 | G5:4 Bb5:4 | D6:8 | Eb6:8 | D6:8 | C#6:8', vel: 46, gainDb: -16, pan: -.3, hall: .5},
  {key: 'gch', ...CHOIR, label: 'Choir (hushed)', src: 'pad', oct: 12, vel: 44, gainDb: -16, pan: 0, hall: .55, bars: A(8, 16)},
  {key: 'cl', ...CLARINET, label: 'Clarinet (bent motif)', src: 'line', oct: -12, line: twice('r:4 | r:4 | r:4 | r:2 A5:.75 D6:.25 Eb6:1 | r:4 | r:4 | r:4 | r:2 A5:.75 D6:.25 Eb6:1'), vel: 66, gainDb: -12, pan: .35, hall: .45},
  {key: 'heart', ...TAR, label: 'Heartbeat (tar)', src: 'drum', line: 'X--x------------', vel: 96, gainDb: -6, pan: 0, hall: .2, bars: A(0, 8)},
  {key: 'heart2', ...TAR, label: 'Double heartbeat', src: 'drum', line: 'X--x----X--x----', vel: 100, gainDb: -6, pan: 0, hall: .2, bars: A(8, 16)},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 90, gainDb: -10, pan: 0, hall: .35, bars: [[8, 9], [12, 13]]},
  {key: 'timp', ...TIMPANI, label: 'Timpani (roll)', src: 'timp', line: 'x.x.x.x.x.x.xxxx', vel: 80, gainDb: -8, pan: -.2, hall: .3, bars: A(15, 16), ramp: [.35, 1.1]},
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
  {key: 'horn', ...HORN, label: 'Horns', src: 'melody', oct: -12, vel: 100, gainDb: -5, pan: -.15, hall: .28},
  {key: 'tpt', ...TRUMPET, label: 'Trumpets', src: 'melody', vel: 96, gainDb: -8, pan: .12, hall: .28, bars: A(16, 32)},
  {key: 'vln', ...VIOLIN, label: 'Violins', src: 'melody', vel: 90, gainDb: -8, pan: -.3, hall: .3, bars: A(16, 32)},
  {key: 'tbn', ...TROMBONE, label: 'Trombones (stabs)', src: 'stab', oct: 12, vel: 96, gainDb: -10, pan: .25, hall: .25, gate: .25, bars: A(0, 16)},
  {key: 'tbnmotif', ...TROMBONE, label: 'Trombones (the motif, minor)', src: 'counter', vel: 104, gainDb: -7, pan: .25, hall: .28},
  {key: 'choir', ...CHOIR, label: 'Choir', src: 'pad', oct: 12, vel: 64, gainDb: -12, pan: 0, hall: .45, ramp: [.8, 1.15]},
  {key: 'spic', ...QUARTET, label: 'Spiccato Strings', src: 'spic', oct: 12, vel: 88, gainDb: -9, pan: -.2, hall: .2, gate: .35},
  {key: 'cb', ...BASS, label: 'Basses', src: 'root', vel: 92, gainDb: -9, pan: .05, hall: .2, gate: .3},
  {key: 'timp', ...TIMPANI, label: 'Timpani', src: 'timp', line: 'X-----x-----', vel: 100, gainDb: -5, pan: -.15, hall: .2, bars: A(0, 16)},
  {key: 'timp2', ...TIMPANI, label: 'Timpani (pass 2)', src: 'timp', line: 'X---f-x-----', vel: 106, gainDb: -5, pan: -.15, hall: .2, bars: A(16, 32)},
  {key: 'bendir', ...BENDIR, label: 'Bendir (gallop)', src: 'drum', line: 'X-xxo-xxo-xx', vel: 84, gainDb: -9, pan: .3, hall: .15},
  {key: 'gc', ...GRAN_CASSA, label: 'Gran Cassa', src: 'drum', line: 'X', vel: 110, gainDb: -8, pan: 0, hall: .3, every: 2, bars: A(0, 16)},
  {key: 'gc2', ...GRAN_CASSA, label: 'Gran Cassa (pass 2)', src: 'drum', line: 'X', vel: 112, gainDb: -8, pan: 0, hall: .3, bars: A(16, 32)},
  {key: 'sn', ...SNARE, label: 'Concert Snare', src: 'drum', line: 'x-x.x-x.x-xx', vel: 82, gainDb: -13, pan: .2, hall: .2, bars: A(16, 31)},
  {key: 'snroll', ...SNARE, label: 'Snare (roll)', src: 'drum', line: 'xxxxxxxxXXXX', vel: 84, gainDb: -13, pan: .2, hall: .2, bars: [[15, 16], [31, 32]], ramp: [.45, 1.15]},
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
  {key: 'tpt', ...TRUMPET, label: 'Trumpet', src: 'melody', oct: -12, vel: 100, gainDb: -6, pan: .05, hall: .35},
  {key: 'fl', ...FLUTE, label: 'Flute', src: 'melody', vel: 90, gainDb: -8, pan: .3, hall: .35},
  {key: 'vln', ...STRINGS, label: 'Violins', src: 'melody', vel: 82, gainDb: -10, pan: -.3, hall: .42},
  {key: 'hn', ...HORN, label: 'Horns', src: 'counter', oct: -12, vel: 92, gainDb: -8, pan: -.2, hall: .32},
  {key: 'tbn', ...TROMBONE, label: 'Trombone', src: 'bass', oct: 12, vel: 88, gainDb: -10, pan: .2, hall: .3},
  {key: 'vc', ...CELLO, label: 'Celli + Basses', src: 'bass', oct: 12, vel: 86, gainDb: -9, pan: .25, hall: .3},
  {key: 'pad', ...STRINGS, label: 'Strings', src: 'pad', oct: 12, vel: 70, gainDb: -12, pan: 0, hall: .5},
  {key: 'harp', ...HARP, label: 'Harp sweep', src: 'line', line: 'r:4 | r:3 F4:.125 G4:.125 A4:.125 C5:.125 D5:.125 F5:.125 G5:.125 A5:.125 | F4+C5+F5+A5:4', vel: 80, gainDb: -9, pan: -.35, hall: .45},
  {key: 'timp', ...TIMPANI, label: 'Timpani', src: 'timp', line: 'X-------x-------' + 'x.x.x.x.xxxxxxxx' + 'X---------------', vel: 92, gainDb: -6, pan: -.15, hall: .3},
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
  {key: 'pno', ...FELT, label: 'Felt Piano', src: 'melody', vel: 70, gainDb: -8, pan: -.05, hall: .48},
  {key: 'ob', ...OBOE, label: 'Oboe', src: 'melody', oct: -12, vel: 66, gainDb: -12, pan: .2, hall: .45, bars: A(2, 4)},
  {key: 'pad', ...STRINGS, label: 'Strings', src: 'pad', vel: 52, gainDb: -13, pan: 0, hall: .55},
  {key: 'harp', ...HARP, label: 'Harp', src: 'harp', oct: 12, vel: 60, gainDb: -11, pan: -.3, hall: .45},
  {key: 'vc', ...CELLO, label: 'Cello', src: 'bass', oct: 12, vel: 64, gainDb: -11, pan: .25, hall: .4},
  {key: 'vla', ...VIOLA, label: 'Viola', src: 'line', line: 'F4:4 | F4:2 E4:2 | D4:4 | C4:4', vel: 54, gainDb: -15, pan: -.2, hall: .5},
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
