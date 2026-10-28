// LYRA parameter ids — the TypeScript mirror of the block-1900 constants in
// rust/plajah-audio/src/params.rs (LY_*). Keep the two in lockstep; DSP_ABI_VERSION (14) in
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
} as const;

export type LyraModel = 'guitar' | 'piano' | 'violin' | 'sax' | 'trumpet' | 'tine';
export const LYRA_MODELS: LyraModel[] = ['guitar', 'piano', 'violin', 'sax', 'trumpet', 'tine'];
export const modelIndex = (m: LyraModel) => LYRA_MODELS.indexOf(m);

export const LYRA_MODEL_LABELS: Record<LyraModel, string> = {
  guitar: 'Guitar', piano: 'Piano', violin: 'Violin', sax: 'Saxophone', trumpet: 'Trumpet', tine: 'Tine Electric Piano',
};

/** What VARIANT means for each model. */
export const LYRA_VARIANTS: Record<LyraModel, string[]> = {
  guitar: ['Steel-string acoustic', 'Nylon-string classical', 'Electric'],
  piano: ['Concert grand', 'Upright'],
  violin: ['Violin'],
  sax: ['Alto', 'Tenor'],
  trumpet: ['Open', 'Cup mute', 'Harmon mute', 'Straight mute'],
  tine: ['Stage tine piano'],
};

/** The model a control actually does something on (undefined = every model). */
export interface LyraParamMeta { id: number; label: string; hint: string; models?: LyraModel[]; group: 'tone' | 'touch' | 'body' | 'expression' | 'amp' }

export const LYRA_PARAM_META: LyraParamMeta[] = [
  { id: LY.BRIGHTNESS, label: 'Brightness', hint: 'How fast the highs die away in the string, or how open the bell is.', group: 'tone' },
  { id: LY.DECAY, label: 'Ring / Release', hint: 'How long a plucked or struck note rings; how long a bowed or blown note takes to stop.', group: 'tone' },
  { id: LY.EXCITE_POS, label: 'Position', hint: 'Where the pick, hammer or bow meets the string (near the bridge is brighter); the reed point; the tine\'s pickup voicing (bark).', group: 'touch' },
  { id: LY.EXCITE_HARD, label: 'Hardness / Pressure', hint: 'Pick or hammer hardness, bow pressure, reed stiffness, lip tension.', group: 'touch' },
  { id: LY.VEL_SENS, label: 'Velocity response', hint: 'How much how hard you play changes the sound.', group: 'touch' },
  { id: LY.ATTACK, label: 'Onset', hint: 'How quickly the bow or breath gets the note speaking.', models: ['violin', 'sax', 'trumpet'], group: 'touch' },
  { id: LY.NOISE, label: 'Air / Hair / Knock', hint: 'Bow-hair noise, breath, the piano hammer and soundboard knock.', group: 'touch' },
  { id: LY.DAMP, label: 'Palm mute', hint: 'Rest the edge of the hand on the strings at the bridge.', models: ['guitar'], group: 'touch' },
  { id: LY.BODY, label: 'Body', hint: 'How much of the wooden body, soundboard, bell formants or speaker cabinet you hear.', group: 'body' },
  { id: LY.BODY_SIZE, label: 'Body size', hint: 'A bigger body moves its resonances lower.', group: 'body' },
  { id: LY.DETUNE, label: 'Unison detune', hint: 'Piano strings in a unison are a hair apart — the beating gives the two-stage decay.', models: ['piano'], group: 'body' },
  { id: LY.WIDTH, label: 'Stereo width', hint: 'Spread notes across the stereo field like sitting at the keyboard.', models: ['piano', 'tine'], group: 'body' },
  { id: LY.PEDAL, label: 'Sustain pedal', hint: 'Dampers up: notes keep ringing after you let go.', models: ['piano', 'tine'], group: 'expression' },
  { id: LY.VIB_DEPTH, label: 'Vibrato', hint: 'Depth of the player\'s vibrato (the mod wheel adds more).', models: ['violin', 'sax', 'trumpet'], group: 'expression' },
  { id: LY.VIB_RATE, label: 'Vibrato rate', hint: '3 to 8 wobbles a second.', models: ['violin', 'sax', 'trumpet'], group: 'expression' },
  { id: LY.VIB_DELAY, label: 'Vibrato delay', hint: 'Players start a long note straight and let vibrato bloom.', models: ['violin', 'sax', 'trumpet'], group: 'expression' },
  { id: LY.DRIVE, label: 'Drive / Growl', hint: 'Amp drive on electric guitar and tine piano; growl on sax.', models: ['guitar', 'sax', 'tine'], group: 'amp' },
  { id: LY.TONE, label: 'Amp tone', hint: 'The amp\'s treble, and on electric guitar where the pickup sits.', models: ['guitar', 'tine'], group: 'amp' },
  { id: LY.TREM_DEPTH, label: 'Tremolo', hint: 'The suitcase amp\'s stereo tremolo.', models: ['tine'], group: 'amp' },
  { id: LY.TREM_RATE, label: 'Tremolo rate', hint: '1.5 to 9 Hz.', models: ['tine'], group: 'amp' },
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
  [RV.MIX]: 0.12,
  [RV.SIZE]: 0.5,
  [RV.DECAY]: 0.45,
});
