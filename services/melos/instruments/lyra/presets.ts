// LYRA presets — physical-model setups for each instrument, named the way a player would ask
// for them. Each one is just the model, its variant and the physical controls (lyra.rs).

import { LY, LYRA_DEFAULTS, RV, type LyraModel, modelIndex } from './params';

export interface LyraPreset {
  id: string;
  name: string;
  model: LyraModel;
  description: string;
  defaultNote: number;
  params: Record<number, number>;
}

function preset(id: string, name: string, model: LyraModel, variant: number, description: string, defaultNote: number, o: Record<number, number>): LyraPreset {
  return { id, name, model, description, defaultNote, params: { ...LYRA_DEFAULTS, [LY.ENABLE]: 1, [LY.MODEL]: modelIndex(model), [LY.VARIANT]: variant, ...o } };
}

export const LYRA_PRESETS: LyraPreset[] = [
  // ── Guitar ────────────────────────────────────────────────────────────────────────────────
  preset('lyra-dreadnought', 'Dreadnought Steel', 'guitar', 0, 'Big-bodied steel-string acoustic — strummed chords and fingerpicking.', 52, { [LY.BRIGHTNESS]: 0.6, [LY.BODY]: 0.7, [LY.BODY_SIZE]: 0.35, [LY.EXCITE_POS]: 0.35, [LY.EXCITE_HARD]: 0.55 }),
  preset('lyra-parlor', 'Parlor Fingerstyle', 'guitar', 0, 'Small-bodied, focused and sweet; soft fingertips.', 55, { [LY.BRIGHTNESS]: 0.5, [LY.BODY]: 0.6, [LY.BODY_SIZE]: 0.75, [LY.EXCITE_POS]: 0.45, [LY.EXCITE_HARD]: 0.3 }),
  preset('lyra-nylon', 'Nylon Classical', 'guitar', 1, 'Classical / flamenco / bossa — warm nylon, cedar top.', 55, { [LY.BRIGHTNESS]: 0.45, [LY.BODY]: 0.75, [LY.EXCITE_POS]: 0.42, [LY.EXCITE_HARD]: 0.35, [LY.DECAY]: 0.5 }),
  preset('lyra-tele-clean', 'Clean Single-Coil', 'guitar', 2, 'Bridge pickup twang into a clean amp.', 55, { [LY.BRIGHTNESS]: 0.7, [LY.TONE]: 0.7, [LY.DRIVE]: 0.08, [LY.BODY]: 0.5, [LY.EXCITE_HARD]: 0.65, [RV.MIX]: 0.14 }),
  preset('lyra-jazz-box', 'Jazz Box', 'guitar', 2, 'Neck pickup, tone rolled off — Wes-style octaves and chord melody.', 52, { [LY.BRIGHTNESS]: 0.35, [LY.TONE]: 0.15, [LY.DRIVE]: 0.04, [LY.EXCITE_HARD]: 0.3, [LY.EXCITE_POS]: 0.55 }),
  preset('lyra-blues-drive', 'Blues Drive', 'guitar', 2, 'Edge-of-breakup amp for bends and slow blues.', 57, { [LY.BRIGHTNESS]: 0.6, [LY.TONE]: 0.55, [LY.DRIVE]: 0.45, [LY.DECAY]: 0.75 }),
  preset('lyra-rock-crunch', 'Rock Crunch', 'guitar', 2, 'Cranked amp for power chords and riffs; palm-mute ready.', 40, { [LY.BRIGHTNESS]: 0.65, [LY.TONE]: 0.6, [LY.DRIVE]: 0.8, [LY.DECAY]: 0.7, [LY.BODY]: 0.8 }),
  preset('lyra-funk-chop', 'Funk Chop', 'guitar', 2, 'Bright, clean and short — sixteenth-note chicken scratch.', 60, { [LY.BRIGHTNESS]: 0.8, [LY.TONE]: 0.85, [LY.DRIVE]: 0.05, [LY.DAMP]: 0.35, [LY.DECAY]: 0.3, [LY.EXCITE_HARD]: 0.8 }),
  // ── Piano ─────────────────────────────────────────────────────────────────────────────────
  preset('lyra-concert-grand', 'Concert Grand', 'piano', 0, 'Nine-foot concert grand: long bass, singing treble.', 60, { [LY.BRIGHTNESS]: 0.6, [LY.DECAY]: 0.6, [LY.BODY]: 0.6, [LY.EXCITE_HARD]: 0.55, [LY.DETUNE]: 0.3, [RV.MIX]: 0.18, [RV.SIZE]: 0.7 }),
  preset('lyra-studio-grand', 'Studio Grand', 'piano', 0, 'Close-miked and bright for pop and rock.', 60, { [LY.BRIGHTNESS]: 0.72, [LY.EXCITE_HARD]: 0.7, [LY.DETUNE]: 0.25, [LY.BODY]: 0.45, [RV.MIX]: 0.08 }),
  preset('lyra-jazz-grand', 'Jazz Club Grand', 'piano', 0, 'Warm, a little dark, for comping and ballads.', 60, { [LY.BRIGHTNESS]: 0.42, [LY.EXCITE_HARD]: 0.4, [LY.DETUNE]: 0.4, [LY.BODY]: 0.7, [RV.MIX]: 0.12 }),
  preset('lyra-upright', 'Old Upright', 'piano', 1, 'Barrelhouse upright, a bit out of unison — stride and boogie.', 60, { [LY.BRIGHTNESS]: 0.6, [LY.DETUNE]: 0.85, [LY.DECAY]: 0.4, [LY.BODY_SIZE]: 0.8, [LY.NOISE]: 0.55 }),
  preset('lyra-felt', 'Felt Piano', 'piano', 1, 'Soft hammers, intimate and hushed.', 60, { [LY.BRIGHTNESS]: 0.2, [LY.EXCITE_HARD]: 0.1, [LY.NOISE]: 0.6, [LY.PEDAL]: 1, [RV.MIX]: 0.22 }),
  // ── Violin ────────────────────────────────────────────────────────────────────────────────
  preset('lyra-concert-violin', 'Concert Violin', 'violin', 0, 'Full bow, singing vibrato — the solo voice.', 69, { [LY.EXCITE_POS]: 0.35, [LY.EXCITE_HARD]: 0.5, [LY.VIB_DEPTH]: 0.45, [LY.VIB_DELAY]: 0.25, [LY.BODY]: 0.75, [RV.MIX]: 0.2, [RV.SIZE]: 0.7 }),
  preset('lyra-fiddle', 'Bluegrass Fiddle', 'violin', 0, 'Closer to the bridge, more pressure, less vibrato — drive.', 67, { [LY.EXCITE_POS]: 0.2, [LY.EXCITE_HARD]: 0.7, [LY.VIB_DEPTH]: 0.12, [LY.ATTACK]: 0.08, [LY.NOISE]: 0.45 }),
  preset('lyra-sul-tasto', 'Sul Tasto', 'violin', 0, 'Bow over the fingerboard: soft, flute-like.', 69, { [LY.EXCITE_POS]: 0.85, [LY.EXCITE_HARD]: 0.25, [LY.VIB_DEPTH]: 0.3, [LY.ATTACK]: 0.45, [LY.BRIGHTNESS]: 0.3 }),
  preset('lyra-silk-strings', 'Silk Soul Strings', 'violin', 0, 'Long bows and slow vibrato for R&B string lines.', 72, { [LY.EXCITE_POS]: 0.45, [LY.VIB_DEPTH]: 0.4, [LY.VIB_RATE]: 0.35, [LY.ATTACK]: 0.6, [LY.DECAY]: 0.7, [RV.MIX]: 0.25 }),
  // ── Saxophone ─────────────────────────────────────────────────────────────────────────────
  preset('lyra-alto', 'Alto Sax', 'sax', 0, 'Bright and agile — bebop lines and pop solos.', 68, { [LY.EXCITE_HARD]: 0.5, [LY.VIB_DEPTH]: 0.25, [LY.NOISE]: 0.25 }),
  preset('lyra-tenor-ballad', 'Tenor Ballad', 'sax', 1, 'Breathy subtone, slow vibrato — late-night ballads.', 60, { [LY.EXCITE_HARD]: 0.3, [LY.NOISE]: 0.6, [LY.VIB_DEPTH]: 0.4, [LY.VIB_RATE]: 0.35, [LY.ATTACK]: 0.4, [RV.MIX]: 0.2 }),
  preset('lyra-tenor-honk', 'R&B Honker', 'sax', 1, 'Hard reed and a growl — shout it on the turnaround.', 58, { [LY.EXCITE_HARD]: 0.8, [LY.DRIVE]: 0.45, [LY.NOISE]: 0.3, [LY.ATTACK]: 0.05 }),
  // ── Trumpet ───────────────────────────────────────────────────────────────────────────────
  preset('lyra-trumpet-open', 'Open Trumpet', 'trumpet', 0, 'Bright, open bell — fanfares and lead lines.', 67, { [LY.BRIGHTNESS]: 0.7, [LY.EXCITE_HARD]: 0.55, [LY.VIB_DEPTH]: 0.18, [LY.ATTACK]: 0.12 }),
  preset('lyra-trumpet-harmon', 'Harmon Mute', 'trumpet', 2, 'The intimate, buzzing cool-jazz sound.', 67, { [LY.BRIGHTNESS]: 0.5, [LY.EXCITE_HARD]: 0.4, [LY.VIB_DEPTH]: 0.08, [LY.ATTACK]: 0.25, [RV.MIX]: 0.16 }),
  preset('lyra-trumpet-cup', 'Cup Mute', 'trumpet', 1, 'Round and soft — big-band section color.', 65, { [LY.EXCITE_HARD]: 0.45, [LY.VIB_DEPTH]: 0.15 }),
  preset('lyra-trumpet-straight', 'Straight Mute', 'trumpet', 3, 'Nasal and cutting.', 67, { [LY.EXCITE_HARD]: 0.6, [LY.BRIGHTNESS]: 0.6 }),
  // ── Tine electric piano ───────────────────────────────────────────────────────────────────
  preset('lyra-tine-stage', 'Tine Stage Piano', 'tine', 0, 'Our physical tine piano: neoprene hammers, tine and tonebar, magnetic pickup. Bell on top, bark when you dig in.', 60, { [LY.EXCITE_POS]: 0.45, [LY.EXCITE_HARD]: 0.5, [LY.DRIVE]: 0.15, [LY.TONE]: 0.55, [LY.BRIGHTNESS]: 0.55 }),
  preset('lyra-tine-suitcase', 'Tine Suitcase Tremolo', 'tine', 0, 'Through the suitcase amp with stereo tremolo.', 60, { [LY.EXCITE_POS]: 0.4, [LY.DRIVE]: 0.2, [LY.TREM_DEPTH]: 0.55, [LY.TREM_RATE]: 0.45, [LY.WIDTH]: 0.8 }),
  preset('lyra-tine-bark', 'Tine Bark', 'tine', 0, 'Tines voiced off the pickup and pushed into the preamp — gritty soul and funk.', 55, { [LY.EXCITE_POS]: 0.85, [LY.EXCITE_HARD]: 0.7, [LY.DRIVE]: 0.55, [LY.TONE]: 0.65 }),
  preset('lyra-tine-mellow', 'Tine Mellow Ballad', 'tine', 0, 'Soft voicing, tone rolled back, pedal down.', 60, { [LY.EXCITE_POS]: 0.15, [LY.EXCITE_HARD]: 0.3, [LY.BRIGHTNESS]: 0.35, [LY.TONE]: 0.35, [LY.PEDAL]: 1, [RV.MIX]: 0.18 }),
];

export const DEFAULT_LYRA_PRESET = LYRA_PRESETS[0]!;
export const lyraPresetById = (id: string | undefined) => LYRA_PRESETS.find((p) => p.id === id);
