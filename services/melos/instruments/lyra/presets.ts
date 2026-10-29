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
  preset('lyra-tele-clean', 'Clean Single-Coil', 'guitar', 2, 'Bridge pickup twang into a clean American amp, a touch of slapback.', 55, { [LY.BRIGHTNESS]: 0.7, [LY.TONE]: 0.75, [LY.PICKUP]: 1, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.2, [LY.BODY]: 0.6, [LY.EXCITE_HARD]: 0.65, [LY.ECHO]: 0.2, [LY.ECHO_TIME]: 0.1, [RV.MIX]: 0.14 }),
  preset('lyra-jazz-box', 'Jazz Box', 'guitar', 3, 'Neck humbucker, tone rolled off, clean amp — Wes-style octaves and chord melody.', 52, { [LY.BRIGHTNESS]: 0.35, [LY.TONE]: 0.25, [LY.PICKUP]: 0, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.1, [LY.TREBLE]: 0.35, [LY.BODY]: 0.4, [LY.EXCITE_HARD]: 0.3, [LY.EXCITE_POS]: 0.55 }),
  preset('lyra-blues-drive', 'Blues Drive', 'guitar', 2, 'Edge-of-breakup American amp with an overdrive pedal in front — bends and slow blues.', 57, { [LY.BRIGHTNESS]: 0.6, [LY.TONE]: 0.6, [LY.PICKUP]: 0, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.55, [LY.OD]: 0.4, [LY.MASTER]: 0.6, [LY.DECAY]: 0.75 }),
  preset('lyra-rock-crunch', 'Rock Crunch', 'guitar', 3, 'Bridge humbucker into a cranked British amp and a 4×12 — power chords and riffs; palm-mute ready.', 40, { [LY.BRIGHTNESS]: 0.65, [LY.TONE]: 0.7, [LY.PICKUP]: 1, [LY.AMP]: 1, [LY.CAB]: 2, [LY.DRIVE]: 0.65, [LY.MASTER]: 0.6, [LY.DECAY]: 0.7, [LY.BODY]: 0.7 }),
  preset('lyra-funk-chop', 'Funk Chop', 'guitar', 2, 'In-between pickups, compressed and clean — sixteenth-note chicken scratch.', 60, { [LY.BRIGHTNESS]: 0.8, [LY.TONE]: 0.85, [LY.PICKUP]: 0.75, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.15, [LY.COMP]: 0.6, [LY.DAMP]: 0.35, [LY.DECAY]: 0.3, [LY.EXCITE_HARD]: 0.8 }),
  preset('lyra-chime-jangle', 'Chime Jangle', 'guitar', 2, 'Bright single coils into a class-A chime amp and 2×12 — jangling open chords.', 57, { [LY.BRIGHTNESS]: 0.75, [LY.TONE]: 0.8, [LY.PICKUP]: 1, [LY.AMP]: 2, [LY.CAB]: 1, [LY.DRIVE]: 0.45, [LY.MASTER]: 0.7, [LY.CHORUS]: 0.2 }),
  preset('lyra-surf-trem', 'Surf Tremolo', 'guitar', 2, 'Bridge pickup, amp tremolo and tape echo — twang with a pulse.', 55, { [LY.BRIGHTNESS]: 0.75, [LY.TONE]: 0.8, [LY.PICKUP]: 1, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.3, [LY.TREM_DEPTH]: 0.6, [LY.TREM_RATE]: 0.5, [LY.ECHO]: 0.35, [LY.ECHO_TIME]: 0.35 }),
  preset('lyra-clean-chorus', 'Clean Chorus', 'guitar', 2, 'Neck pickup, clean amp, stereo chorus — glassy arpeggios and ballads.', 60, { [LY.BRIGHTNESS]: 0.6, [LY.TONE]: 0.6, [LY.PICKUP]: 0, [LY.AMP]: 0, [LY.CAB]: 0, [LY.DRIVE]: 0.15, [LY.CHORUS]: 0.55, [RV.MIX]: 0.2 }),
  preset('lyra-high-gain', 'High Gain Chug', 'guitar', 3, 'Bridge humbucker, a modern high-gain amp, mids scooped — tight palm-muted riffs.', 40, { [LY.BRIGHTNESS]: 0.7, [LY.TONE]: 0.75, [LY.PICKUP]: 1, [LY.AMP]: 3, [LY.CAB]: 2, [LY.DRIVE]: 0.85, [LY.MID]: 0.3, [LY.BASS]: 0.6, [LY.TREBLE]: 0.65, [LY.DAMP]: 0.4, [LY.DECAY]: 0.6 }),
  preset('lyra-lead-echo', 'Singing Lead', 'guitar', 3, 'Neck humbucker, overdrive into a British amp and long echo — sustaining solos.', 64, { [LY.BRIGHTNESS]: 0.6, [LY.TONE]: 0.6, [LY.PICKUP]: 0, [LY.AMP]: 1, [LY.CAB]: 2, [LY.DRIVE]: 0.55, [LY.OD]: 0.6, [LY.MASTER]: 0.55, [LY.ECHO]: 0.4, [LY.ECHO_TIME]: 0.45, [LY.DECAY]: 0.85, [RV.MIX]: 0.16 }),
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
  // ── Bowed strings: viola, cello, bass, quartet ────────────────────────────────────────────
  preset('lyra-viola', 'Viola', 'violin', 1, 'The alto of the strings: darker and huskier than the violin, warm in the middle.', 57, { [LY.VIB_DEPTH]: 0.4, [LY.EXCITE_POS]: 0.35, [RV.MIX]: 0.2 }),
  preset('lyra-cello', 'Cello', 'violin', 2, 'Singing tenor and a deep, woody bass — the instrument closest to the human voice.', 48, { [LY.VIB_DEPTH]: 0.45, [LY.EXCITE_POS]: 0.35, [LY.EXCITE_HARD]: 0.55, [RV.MIX]: 0.22 }),
  preset('lyra-double-bass-arco', 'Double Bass (arco)', 'violin', 3, 'Bowed double bass: the floor of the orchestra.', 36, { [LY.VIB_DEPTH]: 0.2, [LY.EXCITE_POS]: 0.3, [LY.EXCITE_HARD]: 0.6, [LY.ATTACK]: 0.35, [RV.MIX]: 0.2 }),
  preset('lyra-string-quartet', 'String Quartet', 'violin', 4, 'Chords voiced across the quartet: cello below C3, viola up to C4, violins above.', 60, { [LY.VIB_DEPTH]: 0.35, [LY.EXCITE_POS]: 0.35, [LY.ATTACK]: 0.35, [RV.MIX]: 0.26 }),
  // ── Saxophone ─────────────────────────────────────────────────────────────────────────────
  preset('lyra-alto', 'Alto Sax', 'sax', 0, 'Bright and agile — bebop lines and pop solos.', 68, { [LY.EXCITE_HARD]: 0.5, [LY.VIB_DEPTH]: 0.25, [LY.NOISE]: 0.25 }),
  preset('lyra-tenor-ballad', 'Tenor Ballad', 'sax', 1, 'Breathy subtone, slow vibrato — late-night ballads.', 60, { [LY.EXCITE_HARD]: 0.3, [LY.NOISE]: 0.6, [LY.VIB_DEPTH]: 0.4, [LY.VIB_RATE]: 0.35, [LY.ATTACK]: 0.4, [RV.MIX]: 0.2 }),
  preset('lyra-tenor-honk', 'R&B Honker', 'sax', 1, 'Hard reed and a growl — shout it on the turnaround.', 58, { [LY.EXCITE_HARD]: 0.8, [LY.DRIVE]: 0.45, [LY.NOISE]: 0.3, [LY.ATTACK]: 0.05 }),
  // ── Trumpet ───────────────────────────────────────────────────────────────────────────────
  preset('lyra-trumpet-open', 'Open Trumpet', 'trumpet', 0, 'Bright, open bell — fanfares and lead lines.', 67, { [LY.BRIGHTNESS]: 0.7, [LY.EXCITE_HARD]: 0.55, [LY.VIB_DEPTH]: 0.18, [LY.ATTACK]: 0.12 }),
  preset('lyra-trumpet-harmon', 'Harmon Mute', 'trumpet', 2, 'The intimate, buzzing cool-jazz sound.', 67, { [LY.BRIGHTNESS]: 0.5, [LY.EXCITE_HARD]: 0.4, [LY.VIB_DEPTH]: 0.08, [LY.ATTACK]: 0.25, [RV.MIX]: 0.16 }),
  preset('lyra-trumpet-cup', 'Cup Mute', 'trumpet', 1, 'Round and soft — big-band section color.', 65, { [LY.EXCITE_HARD]: 0.45, [LY.VIB_DEPTH]: 0.15 }),
  preset('lyra-trumpet-straight', 'Straight Mute', 'trumpet', 3, 'Nasal and cutting.', 67, { [LY.EXCITE_HARD]: 0.6, [LY.BRIGHTNESS]: 0.6 }),
  // ── The rest of the horn section ──────────────────────────────────────────────────────────
  preset('lyra-flugelhorn', 'Flugelhorn', 'brass', 0, 'The trumpet\'s mellow cousin: a wide conical bore, dark and velvet — ballads and soft solos.', 65, { [LY.BRIGHTNESS]: 0.5, [LY.EXCITE_HARD]: 0.45, [LY.VIB_DEPTH]: 0.2, [LY.ATTACK]: 0.2, [RV.MIX]: 0.18 }),
  preset('lyra-french-horn', 'French Horn', 'brass', 1, 'Noble and veiled, hand in the bell; brassy (cuivré) when pushed — calls and film swells.', 53, { [LY.BRIGHTNESS]: 0.5, [LY.EXCITE_HARD]: 0.5, [LY.VIB_DEPTH]: 0.08, [LY.ATTACK]: 0.25, [RV.MIX]: 0.28 }),
  preset('lyra-trombone', 'Trombone', 'brass', 2, 'Warm to blazing — the brassiest horn when it opens up. Slurred notes slide.', 53, { [LY.BRIGHTNESS]: 0.6, [LY.EXCITE_HARD]: 0.55, [LY.VIB_DEPTH]: 0.12, [LY.ATTACK]: 0.15 }),
  preset('lyra-bass-trombone', 'Bass Trombone', 'brass', 3, 'The low end of the section: big, dark, and a snarl at ff.', 43, { [LY.BRIGHTNESS]: 0.55, [LY.EXCITE_HARD]: 0.55, [LY.VIB_DEPTH]: 0.05, [LY.ATTACK]: 0.15 }),
  preset('lyra-tuba', 'Tuba', 'brass', 4, 'Deep, round and huge — the bass of the brass, oom-pah to film.', 36, { [LY.BRIGHTNESS]: 0.5, [LY.EXCITE_HARD]: 0.5, [LY.VIB_DEPTH]: 0.04, [LY.ATTACK]: 0.2 }),
  // ── Flute ─────────────────────────────────────────────────────────────────────────────────
  preset('lyra-concert-flute', 'Concert Flute', 'flute', 0, 'Silver flute: breathy chiff on the attack, vibrato blooming on long notes.', 74, { [LY.VIB_DEPTH]: 0.35, [LY.VIB_DELAY]: 0.25, [LY.NOISE]: 0.35, [LY.ATTACK]: 0.15, [RV.MIX]: 0.2 }),
  preset('lyra-piccolo', 'Piccolo', 'flute', 1, 'An octave up and brilliant — marches and sparkle on top of the band.', 86, { [LY.VIB_DEPTH]: 0.2, [LY.NOISE]: 0.2, [LY.BRIGHTNESS]: 0.65 }),
  preset('lyra-alto-flute', 'Alto Flute', 'flute', 2, 'Dark, hushed and airy — film scores and late-night jazz.', 67, { [LY.VIB_DEPTH]: 0.3, [LY.NOISE]: 0.55, [LY.ATTACK]: 0.3, [LY.BRIGHTNESS]: 0.4, [RV.MIX]: 0.25 }),
  preset('lyra-tin-whistle', 'Tin Whistle', 'flute', 3, 'Irish session whistle: bright, a little rough, quick ornaments, little vibrato.', 79, { [LY.VIB_DEPTH]: 0.08, [LY.NOISE]: 0.6, [LY.ATTACK]: 0.05, [LY.BRIGHTNESS]: 0.7 }),
  // ── Clarinet ──────────────────────────────────────────────────────────────────────────────
  preset('lyra-clarinet', 'Clarinet', 'clarinet', 0, 'B♭ clarinet: the hollow chalumeau down low (odd harmonics), clear clarion up high.', 62, { [LY.VIB_DEPTH]: 0.05, [LY.EXCITE_HARD]: 0.5, [LY.NOISE]: 0.25 }),
  preset('lyra-klezmer-clarinet', 'Klezmer Clarinet', 'clarinet', 0, 'Bright and crying, with a quick vibrato and hard reed.', 67, { [LY.VIB_DEPTH]: 0.4, [LY.VIB_RATE]: 0.7, [LY.VIB_DELAY]: 0.1, [LY.EXCITE_HARD]: 0.75, [LY.BRIGHTNESS]: 0.7 }),
  preset('lyra-bass-clarinet', 'Bass Clarinet', 'clarinet', 1, 'Woody and deep — the low reed of the section.', 46, { [LY.VIB_DEPTH]: 0.05, [LY.EXCITE_HARD]: 0.45, [LY.NOISE]: 0.3, [LY.BRIGHTNESS]: 0.45 }),
  // ── Double reeds ──────────────────────────────────────────────────────────────────────────
  preset('lyra-oboe', 'Oboe', 'reed', 0, 'Nasal, singing, cutting — the orchestra tunes to it.', 69, { [LY.VIB_DEPTH]: 0.3, [LY.VIB_DELAY]: 0.2, [LY.EXCITE_HARD]: 0.5, [RV.MIX]: 0.2 }),
  preset('lyra-english-horn', 'English Horn', 'reed', 1, 'The oboe\'s darker, sadder alto.', 62, { [LY.VIB_DEPTH]: 0.28, [LY.EXCITE_HARD]: 0.45, [RV.MIX]: 0.22 }),
  preset('lyra-bassoon', 'Bassoon', 'reed', 2, 'Woody and warm, comic or noble — the bass of the woodwinds.', 48, { [LY.VIB_DEPTH]: 0.18, [LY.EXCITE_HARD]: 0.45, [LY.BRIGHTNESS]: 0.45 }),
  // ── Plucked strings ───────────────────────────────────────────────────────────────────────
  preset('lyra-harp', 'Concert Harp', 'pluck', 0, 'Gut strings on a big soundboard, ringing long — glissandi and arpeggios.', 60, { [LY.DECAY]: 0.6, [LY.EXCITE_HARD]: 0.35, [LY.WIDTH]: 0.7, [RV.MIX]: 0.25 }),
  preset('lyra-mandolin', 'Mandolin', 'pluck', 1, 'Paired steel courses, a pick and a bowl back — bright and quick; tremolo by repeating notes.', 67, { [LY.EXCITE_HARD]: 0.7, [LY.BRIGHTNESS]: 0.7 }),
  preset('lyra-banjo', 'Banjo', 'pluck', 2, 'Strings over a drum head: bright, twangy and short — rolls and bluegrass.', 62, { [LY.EXCITE_HARD]: 0.75, [LY.BRIGHTNESS]: 0.75, [LY.DECAY]: 0.4 }),
  preset('lyra-ukulele', 'Ukulele', 'pluck', 3, 'Nylon strings on a little box — sweet and plinky.', 67, { [LY.EXCITE_HARD]: 0.4, [LY.BRIGHTNESS]: 0.55 }),
  preset('lyra-pizzicato', 'Pizzicato Strings', 'pluck', 4, 'Plucked violin, viola, cello and bass (by register) — the bow put down.', 55, { [LY.EXCITE_HARD]: 0.35, [LY.DECAY]: 0.45, [RV.MIX]: 0.22 }),
  // ── Tine electric piano ───────────────────────────────────────────────────────────────────
  preset('lyra-tine-stage', 'Tine Stage Piano', 'tine', 0, 'Our physical tine piano: neoprene hammers, tine and tonebar, magnetic pickup. Bell on top, bark when you dig in.', 60, { [LY.EXCITE_POS]: 0.45, [LY.EXCITE_HARD]: 0.5, [LY.DRIVE]: 0.15, [LY.TONE]: 0.55, [LY.BRIGHTNESS]: 0.55 }),
  preset('lyra-tine-suitcase', 'Tine Suitcase Tremolo', 'tine', 0, 'Through the suitcase amp with stereo tremolo.', 60, { [LY.EXCITE_POS]: 0.4, [LY.DRIVE]: 0.2, [LY.TREM_DEPTH]: 0.55, [LY.TREM_RATE]: 0.45, [LY.WIDTH]: 0.8 }),
  preset('lyra-tine-bark', 'Tine Bark', 'tine', 0, 'Tines voiced off the pickup and pushed into the preamp — gritty soul and funk.', 55, { [LY.EXCITE_POS]: 0.85, [LY.EXCITE_HARD]: 0.7, [LY.DRIVE]: 0.55, [LY.TONE]: 0.65 }),
  preset('lyra-tine-mellow', 'Tine Mellow Ballad', 'tine', 0, 'Soft voicing, tone rolled back, pedal down.', 60, { [LY.EXCITE_POS]: 0.15, [LY.EXCITE_HARD]: 0.3, [LY.BRIGHTNESS]: 0.35, [LY.TONE]: 0.35, [LY.PEDAL]: 1, [RV.MIX]: 0.18 }),
];

export const DEFAULT_LYRA_PRESET = LYRA_PRESETS[0]!;
export const lyraPresetById = (id: string | undefined) => LYRA_PRESETS.find((p) => p.id === id);
