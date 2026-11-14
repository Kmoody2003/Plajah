// Orchestral instrument parameter ids — TypeScript mirror of ARCO (2100), CORNU (2200),
// and AULOS (2300) blocks in rust/plajah-audio/src/params.rs and catalog lists in
// arco.rs, cornu.rs, and aulos.rs.

import type { OrchestralArticulation } from '../../beats/grooveDoc';
import { RV } from '../soma/params';

export { RV };

export type OrchestraFamily = 'arco' | 'cornu' | 'aulos';

/** ARCO (instrument 09): orchestral strings — block 2100. */
export const AR = {
  ENABLE: 2100,
  INSTRUMENT: 2101,
  ENSEMBLE: 2102,
  SECTION: 2103,
  ARTIC: 2104,
  DYNAMICS: 2105,
  MOD_DYN: 2106,
  BOW_POS: 2107,
  BOW_FORCE: 2108,
  BOW_SPEED: 2109,
  ROSIN: 2110,
  VIB_DEPTH: 2111,
  VIB_RATE: 2112,
  VIB_SPREAD: 2113,
  INTONATION: 2114,
  TIGHTNESS: 2115,
  MUTE: 2116,
  STRING_SET: 2117,
  BODY: 2118,
  DEEP: 2119,
  SEATING: 2120,
  WIDTH: 2121,
  STRING_PREF: 2122,
  PORTAMENTO: 2123,
  LEGATO: 2124,
  VEL_SENS: 2125,
  TORSION: 2126,
  RELEASE: 2127,
  BASS_OCTAVE: 2128,
  QUALITY: 2129,
  BOW_LENGTH: 2130,
  TENSION: 2131,
} as const;

/** CORNU (instrument 10): orchestral brass — block 2200. */
export const CN = {
  ENABLE: 2200,
  INSTRUMENT: 2201,
  ENSEMBLE: 2202,
  SECTION: 2203,
  ARTIC: 2204,
  MUTE: 2205,
  DYNAMICS: 2206,
  MOD_DYN: 2207,
  VEL_SENS: 2208,
  PORTAMENTO: 2209,
  LEGATO: 2210,
  VIB_DEPTH: 2211,
  TONGUE: 2212,
  BRASSINESS: 2213,
  BELL: 2214,
  LIP: 2215,
  HAND: 2216,
  QUALITY: 2217,
  INTONATION: 2218,
  TIGHTNESS: 2219,
  WIDTH: 2220,
} as const;

/** AULOS (instrument 11): woodwinds — block 2300. */
export const AU = {
  ENABLE: 2300,
  INSTRUMENT: 2301,
  ENSEMBLE: 2302,
  SECTION: 2303,
  ARTIC: 2304,
  DYNAMICS: 2305,
  MOD_DYN: 2306,
  VEL_SENS: 2307,
  PORTAMENTO: 2308,
  LEGATO: 2309,
  VIB_DEPTH: 2310,
  TONGUE: 2311,
  REED: 2312,
  EMBOUCHURE: 2313,
  LATTICE: 2314,
  QUALITY: 2315,
  INTONATION: 2316,
  TIGHTNESS: 2317,
  WIDTH: 2318,
} as const;

// ── ARCO catalog (arco.rs) ─────────────────────────────────────────────────────────────────────
export const ARCO_INSTRUMENTS = ['Violin', 'Viola', 'Cello', 'Double bass'] as const;
export const ARCO_ENSEMBLES = [
  'One instrument',
  'String quartet',
  'String quintet',
  'Chamber string orchestra',
  'Full string orchestra',
] as const;
export const ARCO_SECTION_SIZES = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16] as const;
export const ARCO_SECTIONS = ['1', '2', '3', '4', '6', '8', '10', '12', '14', '16'] as const;
export const ARCO_ARTICULATIONS = [
  'Sustain',
  'Détaché',
  'Spiccato',
  'Pizzicato',
  'Col legno',
  'Tremolo',
  'Harmonics',
  'Sul ponticello',
  'Sul tasto',
  'Marcato',
  'Bartók pizz',
] as const;
export const ARCO_STRING_SETS = ['Synthetic core', 'Gut', 'Steel'] as const;

// ── CORNU catalog (cornu.rs) ───────────────────────────────────────────────────────────────────
export const CORNU_INSTRUMENTS = [
  'Trumpet in B♭',
  'Trumpet in C',
  'Piccolo trumpet',
  'Cornet',
  'Flugelhorn',
  'French horn',
  'Tenor trombone',
  'Bass trombone',
  'Euphonium',
  'Tuba in C',
] as const;
export const CORNU_ENSEMBLES = [
  'One instrument',
  'Brass quintet',
  'Horn quartet',
  'Trombone section',
  'Full orchestral brass',
  'Big band brass',
] as const;
export const CORNU_SECTION_SIZES = [1, 2, 3, 4, 6, 8] as const;
export const CORNU_SECTIONS = ['1', '2', '3', '4', '6', '8'] as const;
export const CORNU_ARTICULATIONS = [
  'Sustain',
  'Legato',
  'Staccato',
  'Accent',
  'Sforzando',
  'Flutter-tongue',
  'Growl',
  'Fall',
  'Doit',
] as const;
export const CORNU_MUTES = ['Open', 'Straight', 'Cup', 'Harmon', 'Plunger', 'Stopped / hand'] as const;

// ── AULOS catalog (aulos.rs) ───────────────────────────────────────────────────────────────────
export const AULOS_INSTRUMENTS = [
  'Flute',
  'Piccolo',
  'Alto flute',
  'Oboe',
  'Cor anglais',
  'Clarinet in B♭',
  'Bass clarinet',
  'Bassoon',
  'Contrabassoon',
  'Soprano saxophone',
  'Alto saxophone',
  'Tenor saxophone',
  'Baritone saxophone',
  'Alto recorder',
  'E♭ clarinet',
] as const;
export const AULOS_ENSEMBLES = [
  'One instrument',
  'Woodwind quartet',
  'Flute choir',
  'Clarinet choir',
  'Full orchestral woodwinds',
  'Saxophone section',
] as const;
export const AULOS_SECTION_SIZES = [1, 2, 3, 4] as const;
export const AULOS_SECTIONS = ['1', '2', '3', '4'] as const;
export const AULOS_ARTICULATIONS = [
  'Sustain',
  'Legato',
  'Staccato',
  'Accent',
  'Flutter-tongue',
  'Growl',
  'Breath attack',
] as const;

/** Default physical parameter values per family (0..1 unless index). */
export const ARCO_DEFAULTS: Record<number, number> = {
  [AR.ENABLE]: 1,
  [AR.INSTRUMENT]: 0,
  [AR.ENSEMBLE]: 0,
  [AR.SECTION]: 0,
  [AR.ARTIC]: 0,
  [AR.DYNAMICS]: 0.65,
  [AR.MOD_DYN]: 0,
  [AR.BOW_POS]: 0.5,
  [AR.BOW_FORCE]: 0.5,
  [AR.BOW_SPEED]: 0.5,
  [AR.ROSIN]: 0.5,
  [AR.VIB_DEPTH]: 0.45,
  [AR.VIB_RATE]: 0.5,
  [AR.VIB_SPREAD]: 0.5,
  [AR.INTONATION]: 0.35,
  [AR.TIGHTNESS]: 0.35,
  [AR.MUTE]: 0,
  [AR.STRING_SET]: 0,
  [AR.BODY]: 0.5,
  [AR.DEEP]: 0.5,
  [AR.SEATING]: 0,
  [AR.WIDTH]: 0.65,
  [AR.STRING_PREF]: 0.3,
  [AR.PORTAMENTO]: 0.25,
  [AR.LEGATO]: 0.6,
  [AR.VEL_SENS]: 0.7,
  [AR.TORSION]: 0.5,
  [AR.RELEASE]: 0.4,
  [AR.BASS_OCTAVE]: 0.5,
  [AR.QUALITY]: 0.65,
  [AR.BOW_LENGTH]: 0.5,
  [AR.TENSION]: 0.5,
  [RV.MIX]: 0.22,
};

export const CORNU_DEFAULTS: Record<number, number> = {
  [CN.ENABLE]: 1,
  [CN.INSTRUMENT]: 5,
  [CN.ENSEMBLE]: 0,
  [CN.SECTION]: 0,
  [CN.ARTIC]: 0,
  [CN.MUTE]: 0,
  [CN.DYNAMICS]: 0.65,
  [CN.MOD_DYN]: 0,
  [CN.VEL_SENS]: 0.7,
  [CN.PORTAMENTO]: 0.2,
  [CN.LEGATO]: 0.6,
  [CN.VIB_DEPTH]: 0.3,
  [CN.TONGUE]: 0.5,
  [CN.BRASSINESS]: 0.5,
  [CN.BELL]: 0.5,
  [CN.LIP]: 0.5,
  [CN.HAND]: 0.35,
  [CN.QUALITY]: 0.65,
  [CN.INTONATION]: 0.35,
  [CN.TIGHTNESS]: 0.35,
  [CN.WIDTH]: 0.6,
  [RV.MIX]: 0.25,
};

export const AULOS_DEFAULTS: Record<number, number> = {
  [AU.ENABLE]: 1,
  [AU.INSTRUMENT]: 0,
  [AU.ENSEMBLE]: 0,
  [AU.SECTION]: 0,
  [AU.ARTIC]: 0,
  [AU.DYNAMICS]: 0.65,
  [AU.MOD_DYN]: 0,
  [AU.VEL_SENS]: 0.7,
  [AU.PORTAMENTO]: 0.15,
  [AU.LEGATO]: 0.6,
  [AU.VIB_DEPTH]: 0.45,
  [AU.TONGUE]: 0.5,
  [AU.REED]: 0.5,
  [AU.EMBOUCHURE]: 0.5,
  [AU.LATTICE]: 0.5,
  [AU.QUALITY]: 0.65,
  [AU.INTONATION]: 0.3,
  [AU.TIGHTNESS]: 0.35,
  [AU.WIDTH]: 0.55,
  [RV.MIX]: 0.22,
};

export function orchestraDefaults(family: OrchestraFamily): Record<number, number> {
  if (family === 'arco') return { ...ARCO_DEFAULTS };
  if (family === 'cornu') return { ...CORNU_DEFAULTS };
  return { ...AULOS_DEFAULTS };
}

/**
 * Maps GrooveDoc's `OrchestralArticulation` to the full list of DSP parameter pairs
 * (`*_ARTIC`, `*_MUTE`, `*_BOW_POS`, `*_LEGATO`, `*_PORTAMENTO`, etc.) for a note or gesture.
 */
export function orchestraNoteExpressionParams(
  family: OrchestraFamily,
  art?: OrchestralArticulation,
): Array<[number, number]> {
  if (!art) return [];

  if (family === 'arco') {
    switch (art) {
      case 'legato':
        return [[AR.ARTIC, 0], [AR.LEGATO, 1], [AR.MUTE, 0]];
      case 'spiccato':
        return [[AR.ARTIC, 2], [AR.LEGATO, 0]];
      case 'staccato':
        return [[AR.ARTIC, 2], [AR.LEGATO, 0]];
      case 'marcato':
        return [[AR.ARTIC, 9], [AR.LEGATO, 0]];
      case 'tremolo':
        return [[AR.ARTIC, 5]];
      case 'pizzicato':
        return [[AR.ARTIC, 3]];
      case 'sul-ponticello':
        return [[AR.ARTIC, 7], [AR.BOW_POS, 0.9]];
      case 'sul-tasto':
        return [[AR.ARTIC, 8], [AR.BOW_POS, 0.12]];
      case 'con-sordino':
        return [[AR.MUTE, 1]];
      case 'portamento':
        return [[AR.ARTIC, 0], [AR.LEGATO, 1], [AR.PORTAMENTO, 0.45]];
      case 'flutter-tongue':
        return [[AR.ARTIC, 5]];
      case 'sfz-hairpin':
        return [[AR.ARTIC, 9], [AR.DYNAMICS, 0.85]];
    }
  }

  if (family === 'cornu') {
    switch (art) {
      case 'legato':
        return [[CN.ARTIC, 1], [CN.LEGATO, 1], [CN.MUTE, 0]];
      case 'spiccato':
        return [[CN.ARTIC, 2], [CN.LEGATO, 0]];
      case 'staccato':
        return [[CN.ARTIC, 2], [CN.LEGATO, 0]];
      case 'marcato':
        return [[CN.ARTIC, 3], [CN.LEGATO, 0]];
      case 'tremolo':
        return [[CN.ARTIC, 5]];
      case 'pizzicato':
        return [[CN.ARTIC, 2]];
      case 'sul-ponticello':
        return [[CN.ARTIC, 0], [CN.BRASSINESS, 0.75]];
      case 'sul-tasto':
        return [[CN.ARTIC, 0], [CN.BELL, 0.3]];
      case 'con-sordino':
        return [[CN.MUTE, 1]];
      case 'portamento':
        return [[CN.ARTIC, 1], [CN.LEGATO, 1], [CN.PORTAMENTO, 0.45]];
      case 'flutter-tongue':
        return [[CN.ARTIC, 5]];
      case 'sfz-hairpin':
        return [[CN.ARTIC, 4]];
    }
  }

  // aulos
  switch (art) {
    case 'legato':
      return [[AU.ARTIC, 1], [AU.LEGATO, 1]];
    case 'spiccato':
      return [[AU.ARTIC, 2], [AU.LEGATO, 0]];
    case 'staccato':
      return [[AU.ARTIC, 2], [AU.LEGATO, 0]];
    case 'marcato':
      return [[AU.ARTIC, 3], [AU.LEGATO, 0]];
    case 'tremolo':
      return [[AU.ARTIC, 4]];
    case 'pizzicato':
      return [[AU.ARTIC, 2]];
    case 'sul-ponticello':
      return [[AU.ARTIC, 0], [AU.EMBOUCHURE, 0.25]];
    case 'sul-tasto':
      return [[AU.ARTIC, 6], [AU.EMBOUCHURE, 0.75]];
    case 'con-sordino':
      return [[AU.ARTIC, 6]];
    case 'portamento':
      return [[AU.ARTIC, 1], [AU.LEGATO, 1], [AU.PORTAMENTO, 0.45]];
    case 'flutter-tongue':
      return [[AU.ARTIC, 4]];
    case 'sfz-hairpin':
      return [[AU.ARTIC, 3], [AU.DYNAMICS, 0.85]];
  }
}

/**
 * Primary DSP `[paramId, value]` pair for a GrooveDoc `OrchestralArticulation`.
 * Returns `null` when `art` is omitted.
 */
export function orchestraArticulationParam(
  family: OrchestraFamily,
  art?: OrchestralArticulation,
): [number, number] | null {
  if (!art) return null;
  const pairs = orchestraNoteExpressionParams(family, art);
  return pairs[0] ?? null;
}
