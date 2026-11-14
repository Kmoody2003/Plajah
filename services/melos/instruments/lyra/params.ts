// LYRA parameter ids — the TypeScript mirror of the block-1900 constants in
// rust/plajah-audio/src/params.rs (LY_*). Keep the two in lockstep; DSP_ABI_VERSION (15) in
// InstrumentHost guards against a stale .wasm.

import { P as ONDA_P } from '../onda/params';
import { RV } from '../soma/params';

export const P = ONDA_P;
export { RV };

export const LY = {
  ENABLE: 1900,
  MODEL: 1901,
  VARIANT: 1902,
  BRIGHTNESS: 1903,
  DECAY: 1904,
  BODY: 1905,
  BODY_SIZE: 1906,
  EXCITE_POS: 1907,
  EXCITE_HARD: 1908,
  VEL_SENS: 1909,
  VIB_DEPTH: 1910,
  VIB_RATE: 1911,
  VIB_DELAY: 1912,
  NOISE: 1913,
  DRIVE: 1914,
  DETUNE: 1915,
  PEDAL: 1916,
  TREM_DEPTH: 1917,
  TREM_RATE: 1918,
  WIDTH: 1919,
  ATTACK: 1920,
  DAMP: 1921,
  TONE: 1922,
  LEGATO: 1923,
  // The electric guitar's rig.
  PICKUP: 1924,
  AMP: 1925,
  BASS: 1926,
  MID: 1927,
  TREBLE: 1928,
  MASTER: 1929,
  CAB: 1930,
  COMP: 1931,
  OD: 1932,
  CHORUS: 1933,
  ECHO: 1934,
  ECHO_TIME: 1935,
} as const;

export type LyraModel = 'guitar' | 'piano' | 'violin' | 'sax' | 'trumpet' | 'tine' | 'flute' | 'clarinet' | 'reed' | 'brass' | 'pluck';
/** Index = LY_MODEL in params.rs. */
export const LYRA_MODELS: LyraModel[] = ['guitar', 'piano', 'violin', 'sax', 'trumpet', 'tine', 'flute', 'clarinet', 'reed', 'brass', 'pluck'];
export const modelIndex = (m: LyraModel) => LYRA_MODELS.indexOf(m);

export const LYRA_MODEL_LABELS: Record<LyraModel, string> = {
  guitar: 'Guitar', piano: 'Piano', violin: 'Bowed Strings', sax: 'Saxophone', trumpet: 'Trumpet', tine: 'Tine Electric Piano',
  flute: 'Flute', clarinet: 'Clarinet', reed: 'Double Reeds', brass: 'Brass Section', pluck: 'Plucked Strings',
};

/** What VARIANT means for each model. */
export const LYRA_VARIANTS: Record<LyraModel, string[]> = {
  guitar: ['Steel-string acoustic', 'Nylon-string classical', 'Electric · single coils', 'Electric · humbuckers'],
  piano: ['Concert grand', 'Upright'],
  violin: ['Violin', 'Viola', 'Cello', 'Double bass', 'String quartet (by register)'],
  sax: ['Alto', 'Tenor'],
  trumpet: ['Open', 'Cup mute', 'Harmon mute', 'Straight mute'],
  tine: ['Stage tine piano'],
  flute: ['Concert flute', 'Piccolo', 'Alto flute', 'Tin whistle'],
  clarinet: ['B♭ clarinet', 'Bass clarinet'],
  reed: ['Oboe', 'English horn', 'Bassoon'],
  brass: ['Flugelhorn', 'French horn', 'Trombone', 'Bass trombone', 'Tuba'],
  pluck: ['Harp', 'Mandolin', 'Banjo', 'Ukulele', 'Pizzicato strings'],
};

/** The electric guitar's selector positions (single coils / humbuckers), amps and cabs. */
export const LYRA_PICKUPS_SINGLE = ['Neck', 'Neck + middle', 'Middle', 'Middle + bridge', 'Bridge'];
export const LYRA_PICKUPS_HUMBUCKER = ['Neck', 'Neck', 'Both', 'Bridge', 'Bridge'];
export const LYRA_AMPS = ['American clean', 'British crunch', 'Chime (class A)', 'Modern high gain'];
export const LYRA_CABS = ['1×12 open back', '2×12 alnico', '4×12 closed back', '1×10 small combo'];
/** Params that hold an index, not a 0..1 amount. */
export const LYRA_INDEX_PARAMS: readonly number[] = [LY.MODEL, LY.VARIANT, LY.AMP, LY.CAB];
/** Is this patch an electric guitar (the rig controls apply)? */
export const isElectric = (model: LyraModel, variant: number) => model === 'guitar' && variant >= 2;

/** The model a control actually does something on (undefined = every model). */
export interface LyraParamMeta {
  id: number; label: string; hint: string; models?: LyraModel[]; group: 'tone' | 'touch' | 'body' | 'expression' | 'amp' | 'pedals';
  /** Only on the electric guitar. */
  electric?: boolean;
  /** A selector: index params store the index; others store i / (n − 1). */
  options?: string[];
}

export const LYRA_PARAM_META: LyraParamMeta[] = [
  { id: LY.BRIGHTNESS, label: 'Brightness', hint: 'How fast the highs die away in the string, or how open the bell is.', group: 'tone' },
  { id: LY.DECAY, label: 'Ring / Release', hint: 'How long a plucked or struck note rings; how long a bowed or blown note takes to stop.', group: 'tone' },
  { id: LY.EXCITE_POS, label: 'Position', hint: 'Where the pick, hammer or bow meets the string (near the bridge is brighter); the reed point; the tine\'s pickup voicing (bark).', group: 'touch' },
  { id: LY.EXCITE_HARD, label: 'Hardness / Pressure', hint: 'Pick or hammer hardness, bow pressure, reed stiffness, lip tension.', group: 'touch' },
  { id: LY.VEL_SENS, label: 'Velocity response', hint: 'How much how hard you play changes the sound.', group: 'touch' },
  { id: LY.ATTACK, label: 'Onset', hint: 'How quickly the bow or breath gets the note speaking.', models: ['violin', 'sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass'], group: 'touch' },
  { id: LY.NOISE, label: 'Air / Hair / Knock', hint: 'Bow-hair noise, breath, the piano hammer and soundboard knock.', group: 'touch' },
  { id: LY.DAMP, label: 'Palm mute', hint: 'Rest the edge of the hand on the strings at the bridge.', models: ['guitar', 'pluck'], group: 'touch' },
  { id: LY.BODY, label: 'Body / Mic', hint: 'How much of the wooden body, soundboard or bell formants you hear. On electric guitar: the mic on the speaker, from the edge (dark) to the cone centre (bright).', group: 'body' },
  { id: LY.BODY_SIZE, label: 'Body size', hint: 'A bigger body moves its resonances lower.', group: 'body' },
  { id: LY.DETUNE, label: 'Unison detune', hint: 'Piano strings in a unison are a hair apart — the beating gives the two-stage decay.', models: ['piano'], group: 'body' },
  { id: LY.WIDTH, label: 'Stereo width', hint: 'Spread notes across the stereo field like sitting at the keyboard (or the harp).', models: ['piano', 'tine', 'pluck'], group: 'body' },
  { id: LY.PEDAL, label: 'Sustain pedal', hint: 'Dampers up: notes keep ringing after you let go.', models: ['piano', 'tine'], group: 'expression' },
  { id: LY.VIB_DEPTH, label: 'Vibrato', hint: 'Depth of the player\'s vibrato (the mod wheel adds more).', models: ['violin', 'sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass'], group: 'expression' },
  { id: LY.VIB_RATE, label: 'Vibrato rate', hint: '3 to 8 wobbles a second.', models: ['violin', 'sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass'], group: 'expression' },
  { id: LY.VIB_DELAY, label: 'Vibrato delay', hint: 'Players start a long note straight and let vibrato bloom.', models: ['violin', 'sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass'], group: 'expression' },
  { id: LY.DRIVE, label: 'Drive / Growl', hint: 'Preamp gain on electric guitar, preamp drive on the tine piano; growl on sax; the blare (how far the wave steepens) on brass.', models: ['guitar', 'sax', 'reed', 'tine', 'trumpet', 'brass'], group: 'amp' },
  { id: LY.TONE, label: 'Tone', hint: 'The tine amp\'s treble; on electric guitar, the guitar\'s own tone knob (it also voices the overdrive pedal).', models: ['guitar', 'tine'], group: 'amp' },
  { id: LY.PICKUP, label: 'Pickup', hint: 'The pickup selector. Two pickups together are the hollow in-between sounds.', models: ['guitar'], electric: true, group: 'amp', options: LYRA_PICKUPS_SINGLE },
  { id: LY.AMP, label: 'Amp', hint: 'The amp circuit: its gain stages, tone stack and power section.', models: ['guitar'], electric: true, group: 'amp', options: LYRA_AMPS },
  { id: LY.BASS, label: 'Bass', hint: 'The amp\'s passive tone stack — the three knobs interact, as on the real circuit.', models: ['guitar'], electric: true, group: 'amp' },
  { id: LY.MID, label: 'Middle', hint: 'Turn it down for the scooped sound; up to cut through a band.', models: ['guitar'], electric: true, group: 'amp' },
  { id: LY.TREBLE, label: 'Treble', hint: 'Bite and sparkle.', models: ['guitar'], electric: true, group: 'amp' },
  { id: LY.MASTER, label: 'Master', hint: 'How hard the power tubes work. Up high the supply sags under a chord — the bloom of a cranked amp.', models: ['guitar'], electric: true, group: 'amp' },
  { id: LY.CAB, label: 'Cabinet', hint: 'The speaker cabinet: open-back combos are airy, a closed 4×12 thumps.', models: ['guitar'], electric: true, group: 'amp', options: LYRA_CABS },
  { id: LY.COMP, label: 'Compressor', hint: 'Evens out the picking and stretches the sustain. 0 = off.', models: ['guitar'], electric: true, group: 'pedals' },
  { id: LY.OD, label: 'Overdrive', hint: 'A mid-hump diode overdrive in front of the amp. 0 = off.', models: ['guitar'], electric: true, group: 'pedals' },
  { id: LY.CHORUS, label: 'Chorus', hint: 'Stereo chorus after the cab. 0 = off.', models: ['guitar'], electric: true, group: 'pedals' },
  { id: LY.ECHO, label: 'Tape echo', hint: 'Repeats that darken as they fade. 0 = off.', models: ['guitar'], electric: true, group: 'pedals' },
  { id: LY.ECHO_TIME, label: 'Echo time', hint: '80 ms slapback to 900 ms.', models: ['guitar'], electric: true, group: 'pedals' },
  { id: LY.LEGATO, label: 'Legato', hint: 'A note played into a held one slurs to it, with no new attack. Notes played together stay a chord.', models: ['violin', 'sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass'], group: 'expression' },
  { id: LY.TREM_DEPTH, label: 'Tremolo', hint: 'The amp\'s tremolo: stereo on the tine suitcase, the classic pulse on guitar.', models: ['tine', 'guitar'], group: 'amp' },
  { id: LY.TREM_RATE, label: 'Tremolo rate', hint: '1.5 to 9 Hz.', models: ['tine', 'guitar'], group: 'amp' },
];

/** Mirrors Params::defaults in params.rs for the LYRA block. */
export const LYRA_DEFAULTS: Readonly<Record<number, number>> = Object.freeze({
  [P.MASTER_GAIN]: 0.8,
  [P.BEND_RANGE]: 2 / 24,
  [LY.ENABLE]: 1,
  [LY.MODEL]: 0,
  [LY.VARIANT]: 0,
  [LY.BRIGHTNESS]: 0.55,
  [LY.DECAY]: 0.5,
  [LY.BODY]: 0.6,
  [LY.BODY_SIZE]: 0.5,
  [LY.EXCITE_POS]: 0.4,
  [LY.EXCITE_HARD]: 0.5,
  [LY.VEL_SENS]: 0.85,
  [LY.VIB_DEPTH]: 0.25,
  [LY.VIB_RATE]: 0.5,
  [LY.VIB_DELAY]: 0.3,
  [LY.NOISE]: 0.3,
  [LY.DRIVE]: 0,
  [LY.DETUNE]: 0.35,
  [LY.PEDAL]: 0,
  [LY.TREM_DEPTH]: 0,
  [LY.TREM_RATE]: 0.45,
  [LY.WIDTH]: 0.6,
  [LY.ATTACK]: 0.25,
  [LY.DAMP]: 0,
  [LY.TONE]: 0.5,
  [LY.LEGATO]: 1,
  [LY.PICKUP]: 0.5,
  [LY.AMP]: 0,
  [LY.BASS]: 0.5,
  [LY.MID]: 0.5,
  [LY.TREBLE]: 0.6,
  [LY.MASTER]: 0.4,
  [LY.CAB]: 0,
  [LY.COMP]: 0,
  [LY.OD]: 0,
  [LY.CHORUS]: 0,
  [LY.ECHO]: 0,
  [LY.ECHO_TIME]: 0.4,
  [RV.MIX]: 0.12,
  [RV.SIZE]: 0.5,
  [RV.DECAY]: 0.45,
});
