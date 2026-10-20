/**
 * Story Intelligence Realtime Character Voice Changer (Learned Movie Vocal-Tract Convolution),
 * 3D/VTuber Face-Mapping Engine, and Creator Interactive Character Licensing Governance.
 *
 * Upgraded with:
 *   1. Real Extracted Movie Character Dialogue Samples (`/audio/halloween/voices/*_movie_sample.wav`)
 *      and Cepstrally-Learned 256-Tap Minimum-Phase Vocal-Tract Impulse Responses (`*_vocal_ir.wav`)
 *      + Learned F0 & F1–F4 Formant Envelopes from the *Pumpkin Patch* (2025) feature film.
 *   2. Zero-Robot-Noise Web Audio Vocal-Tract Convolution (`ConvolverNode`) + 4-Formant Filter Bank
 *      + 4096-Sample Anti-Aliased Dual-Grain Pitch Shifter + Studio Dynamics Compressor.
 *   3. 3D Blender Rigged Character Metadata (`glbModelUrl`, `glbNodeName`) for `/models/halloween/pumpkin_patch_cast.glb`.
 *   4. Creator Upload & Character Licensing Controls (`DISABLED`, `WORLD_SANCTUARY_ONLY`,
 *      `SANCTUARY_SUBSCRIBER_UNLOCK`, `PLATFORM_PUBLIC`).
 */

import { FaceEyes } from '../vtuber/eyeGeometry';

// ============================================================================
// 1. CREATOR CHARACTER LICENSING & PERMISSIONS MODEL
// ============================================================================

export type CharacterAccessTier =
  | 'DISABLED'
  | 'WORLD_SANCTUARY_ONLY'
  | 'SANCTUARY_SUBSCRIBER_UNLOCK'
  | 'PLATFORM_PUBLIC';

export type ViewerSubscriptionSimulationMode =
  | 'PUBLIC_VIEWER'
  | 'ACTIVE_CREATOR_SUBSCRIBER'
  | 'IN_CREATOR_SANCTUARY'
  | 'CREATOR_OWNER';

export interface CharacterInteractivePermission {
  characterId: string;
  filmId: string;
  creatorId: string;
  creatorName: string;
  accessTier: CharacterAccessTier;
  allowIn3DExhibitions: boolean;
  allowVTuberFaceMapping: boolean;
  allowRealtimeVoiceChanger: boolean;
  // Compatibility aliases used in AlbumCreator upload step
  enabledForVTuber?: boolean;
  enabledForVoiceChanger?: boolean;
  enabledFor3DExhibit?: boolean;
  subscriberTierLabel?: string;
  monthlyPriceUsd?: number;
  updatedAt: number;
}

export interface CreatorFilmInteractivePolicy {
  filmId: string;
  filmTitle: string;
  creatorName: string;
  enableInteractiveCharactersMaster: boolean;
  defaultAccessTier: CharacterAccessTier;
  // Compatibility aliases used in AlbumCreator upload step
  interactiveCharactersEnabled: boolean;
  globalDefaultTier: CharacterAccessTier;
  characters: Record<string, CharacterInteractivePermission>;
}

// ============================================================================
// 2. STORY INTELLIGENCE LEARNED CHARACTER VOICE & 3D/VTUBER RIG DEFINITIONS
// ============================================================================

export interface LearnedCharacterFormantProfile {
  f0MedianHz: number;
  f0StdHz: number;
  f1Hz: number;
  f1GainDb: number;
  f2Hz: number;
  f2GainDb: number;
  f3Hz: number;
  f3GainDb: number;
  f4Hz: number;
  f4GainDb: number;
  voicedFramesAnalyzed: number;
}

export interface CharacterVoiceDspPreset {
  presetLabel?: string;
  /** Pitch shift in semitones (-12 to +12) */
  pitchSemitones: number;
  /** Formant shift in Hz (-400 to +450) */
  formantShiftHz: number;
  /** Primary vocal tract resonant frequency (Hz) */
  throatFormantHz: number;
  /** Secondary cavity/mask resonance frequency (Hz) */
  cavityResonanceHz: number;
  /** Cavity Q factor */
  cavityQ: number;
  /** Subtle warm tube saturation (0..1) — never harsh robotic clipping */
  gritDrive: number;
  /** Learned Vocal-Tract Impulse Response Convolution mix (0..1) */
  vocalTractIrMix?: number;
  /** Ring modulator frequency in Hz (0 = off) */
  ringModHz: number;
  /** Ring modulator wet mix (0..1) */
  ringModMix: number;
  /** Vibrato / witch-tremolo frequency in Hz (0 = off) */
  vibratoHz: number;
  /** Vibrato depth in cents */
  vibratoDepthCents: number;
  /** High-shelf air / comms presence boost in dB */
  trebleBoostDb: number;
  /** Low-shelf chest boom in dB */
  bassBoostDb: number;
  /** Short room / acoustic space reflection in ms (0 = off) */
  combDelayMs: number;
  /** Acoustic reflection level (0..0.35) */
  combFeedback: number;
}

export interface CharacterVTuberRigSpec {
  id: string;
  filmId: string;
  filmTitle: string;
  name: string;
  shortName: string;
  actorName: string;
  alias: string;
  roleLabel: string;
  creatorName: string;
  portraitUrl: string;
  stillUrl: string;
  /** Real extracted character dialogue clip from the movie (24kHz mono WAV) */
  movieSampleUrl: string;
  /** Learned 256-tap minimum-phase FIR vocal-tract impulse response from the movie */
  vocalTractIrUrl: string;
  /** High-detail Blender 3D rigged character asset pack & node name */
  glbModelUrl: string;
  glbNodeName: string;
  learnedFormants: LearnedCharacterFormantProfile;
  accentColor: string;
  secondaryColor: string;
  emoji: string;
  storyIntelSummary: string;
  voiceDescription: string;
  sampleQuote: string;
  /** Normalized jaw/mouth slice coordinates [0..1] on portrait for articulated talking jaw */
  jawRegion: {
    centerX: number;
    topY: number;
    bottomY: number;
    width: number;
  };
  /** Normalized left & right eye centers [0..1] on portrait for gaze & glow overlays */
  eyeRegions: {
    left: { x: number; y: number };
    right: { x: number; y: number };
  };
  /** Special visual FX style rendered on the VTuber rig */
  fxStyle:
    | 'pumpkin_plasma'
    | 'witch_hex'
    | 'scarecrow_burlap'
    | 'pentagram_director'
    | 'cyber_skeleton'
    | 'mia_tactical_hud'
    | 'tavern_neon_smoke'
    | 'ectoplasm_ghost'
    | 'vampire_lord';
  voicePreset: CharacterVoiceDspPreset;
  defaultAccessTier: CharacterAccessTier;
}

export const PUMPKIN_PATCH_FILM_ID = 'album_1787881859314_mlt23';

export const STORY_INTEL_VTUBER_CHARACTERS: CharacterVTuberRigSpec[] = [
  {
    id: 'char_1',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Pumpkin Patch (Melvin Lester)',
    shortName: 'Pumpkin Patch',
    actorName: 'Melvin Lester (Lead)',
    alias: 'The Patch · Rogue MIA Vigilante',
    roleLabel: 'Main Protagonist',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_2310s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_1_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_1_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_PumpkinPatch',
    learnedFormants: {
      f0MedianHz: 324.3,
      f0StdHz: 129.1,
      f1Hz: 257.8,
      f1GainDb: 8.06,
      f2Hz: 914.1,
      f2GainDb: 2.04,
      f3Hz: 2414.1,
      f3GainDb: 0.15,
      f4Hz: 3656.2,
      f4GainDb: -3.69,
      voicedFramesAnalyzed: 1095,
    },
    accentColor: '#f97316',
    secondaryColor: '#fb923c',
    emoji: '🎃',
    storyIntelSummary:
      'Rogue M.I.A. operative with a glowing carved jack-o’-lantern head, black leather duster, dual orange plasma blades, and armored war-tank.',
    voiceDescription:
      'Learned from 1,095 movie dialogue frames (19:56 & 20:23): gritty Snake-Plissken baritone with F1=258Hz chest resonance & warm F2=914Hz gourd timbre.',
    sampleQuote:
      '"I already told you... I don\'t work for government stooges. Keep it. You got nothing I need."',
    jawRegion: { centerX: 0.5, topY: 0.58, bottomY: 0.82, width: 0.48 },
    eyeRegions: { left: { x: 0.38, y: 0.43 }, right: { x: 0.62, y: 0.43 } },
    fxStyle: 'pumpkin_plasma',
    voicePreset: {
      presetLabel: 'Learned Melvin Baritone (1,095 frames)',
      pitchSemitones: -3.2,
      formantShiftHz: -110,
      throatFormantHz: 258,
      cavityResonanceHz: 914,
      cavityQ: 2.4,
      gritDrive: 0.18,
      vocalTractIrMix: 0.78,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 0,
      vibratoDepthCents: 0,
      trebleBoostDb: 2.0,
      bassBoostDb: 5.5,
      combDelayMs: 11,
      combFeedback: 0.14,
    },
    defaultAccessTier: 'PLATFORM_PUBLIC',
  },
  {
    id: 'char_3',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Wicked Witch Miriam',
    shortName: 'Miriam',
    actorName: 'Miriam (Green Castle Overlord)',
    alias: 'Overlord of the Green Castle',
    roleLabel: 'Main Antagonist',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0120s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_3_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_3_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Miriam',
    learnedFormants: {
      f0MedianHz: 421.1,
      f0StdHz: 112.8,
      f1Hz: 257.8,
      f1GainDb: 8.08,
      f2Hz: 914.1,
      f2GainDb: 2.8,
      f3Hz: 2742.2,
      f3GainDb: -0.48,
      f4Hz: 3656.2,
      f4GainDb: -2.97,
      voicedFramesAnalyzed: 751,
    },
    accentColor: '#10b981',
    secondaryColor: '#34d399',
    emoji: '🧙‍♀️',
    storyIntelSummary:
      'Emerald-skinned sorceress and warlord of the Green Castle wearing a pointed witch hat and tactical eyepatch, commanding her flying monkey army.',
    voiceDescription:
      'Learned from 751 movie dialogue frames (15:34 & 38:49): theatrical emerald-witch mezzo-soprano with F3=2742Hz projection and subtle spell-vibrato.',
    sampleQuote:
      '"Zoraster is dead, darling. Come out wherever you are, horseman. I sense you\'re near."',
    jawRegion: { centerX: 0.5, topY: 0.6, bottomY: 0.81, width: 0.42 },
    eyeRegions: { left: { x: 0.39, y: 0.45 }, right: { x: 0.61, y: 0.45 } },
    fxStyle: 'witch_hex',
    voicePreset: {
      presetLabel: 'Learned Miriam Sorceress (751 frames)',
      pitchSemitones: 3.6,
      formantShiftHz: 220,
      throatFormantHz: 420,
      cavityResonanceHz: 2742,
      cavityQ: 2.8,
      gritDrive: 0.12,
      vocalTractIrMix: 0.82,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 5.5,
      vibratoDepthCents: 14,
      trebleBoostDb: 4.5,
      bassBoostDb: -2.0,
      combDelayMs: 9,
      combFeedback: 0.12,
    },
    defaultAccessTier: 'PLATFORM_PUBLIC',
  },
  {
    id: 'char_4',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Stitch (The Scarecrow)',
    shortName: 'Stitch',
    actorName: 'Stitch (Burlap Enforcer)',
    alias: 'District 13 Burlap Enforcer',
    roleLabel: 'Main Deuteragonist',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0510s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_4_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_4_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Stitch',
    learnedFormants: {
      f0MedianHz: 229.7,
      f0StdHz: 66.6,
      f1Hz: 843.8,
      f1GainDb: 6.65,
      f2Hz: 914.1,
      f2GainDb: 6.53,
      f3Hz: 2671.9,
      f3GainDb: 0.82,
      f4Hz: 3796.9,
      f4GainDb: -2.7,
      voicedFramesAnalyzed: 336,
    },
    accentColor: '#eab308',
    secondaryColor: '#facc15',
    emoji: '🌾',
    storyIntelSummary:
      'Battle-scarred survivalist in a stitched burlap scarecrow mask who rules the rain-slicked rooftops and burn-barrel alleys of District 13.',
    voiceDescription:
      'Learned from 336 movie dialogue frames (17:05): raspy burlap-masked tenor-baritone with pronounced F1=844Hz / F2=914Hz midrange mask resonance.',
    sampleQuote:
      '"Well, hello there, gorgeous. Remember me? It\'s been a while. Sorry your little attack plan failed."',
    jawRegion: { centerX: 0.5, topY: 0.59, bottomY: 0.83, width: 0.45 },
    eyeRegions: { left: { x: 0.39, y: 0.44 }, right: { x: 0.61, y: 0.44 } },
    fxStyle: 'scarecrow_burlap',
    voicePreset: {
      presetLabel: 'Learned Stitch Burlap (336 frames)',
      pitchSemitones: -1.8,
      formantShiftHz: -75,
      throatFormantHz: 844,
      cavityResonanceHz: 914,
      cavityQ: 3.1,
      gritDrive: 0.24,
      vocalTractIrMix: 0.85,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 0,
      vibratoDepthCents: 0,
      trebleBoostDb: 2.0,
      bassBoostDb: 2.5,
      combDelayMs: 14,
      combFeedback: 0.16,
    },
    defaultAccessTier: 'PLATFORM_PUBLIC',
  },
  {
    id: 'char_8',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Ichabod Crane (Director Jack)',
    shortName: 'Ichabod',
    actorName: 'Director Jack / Ichabod Crane',
    alias: 'M.I.A. Intelligence Director',
    roleLabel: 'Pentagram Mastermind',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_8_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_1920s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_8_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_8_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Ichabod',
    learnedFormants: {
      f0MedianHz: 230.8,
      f0StdHz: 136.9,
      f1Hz: 257.8,
      f1GainDb: 5.86,
      f2Hz: 1101.6,
      f2GainDb: 1.8,
      f3Hz: 2414.1,
      f3GainDb: 0.78,
      f4Hz: 3656.2,
      f4GainDb: -2.08,
      voicedFramesAnalyzed: 1220,
    },
    accentColor: '#fb923c',
    secondaryColor: '#f59e0b',
    emoji: '🎩',
    storyIntelSummary:
      'Suave executive director of the Monster Intelligence Agency in a tailored tuxedo and bow tie who secretly orchestrates the Hexagon conspiracy.',
    voiceDescription:
      'Learned from 1,220 movie dialogue frames (07:24): authoritative Pentagram war-room baritone with crisp F2=1102Hz articulation.',
    sampleQuote:
      '"District 13? Dracula, dammit! Nobody walks out of District 13. Not even our best operatives."',
    jawRegion: { centerX: 0.5, topY: 0.59, bottomY: 0.8, width: 0.4 },
    eyeRegions: { left: { x: 0.4, y: 0.43 }, right: { x: 0.6, y: 0.43 } },
    fxStyle: 'pentagram_director',
    voicePreset: {
      presetLabel: 'Learned Ichabod Director (1,220 frames)',
      pitchSemitones: -1.6,
      formantShiftHz: -50,
      throatFormantHz: 258,
      cavityResonanceHz: 1102,
      cavityQ: 2.2,
      gritDrive: 0.1,
      vocalTractIrMix: 0.8,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 0,
      vibratoDepthCents: 0,
      trebleBoostDb: 3.5,
      bassBoostDb: 3.0,
      combDelayMs: 0,
      combFeedback: 0,
    },
    defaultAccessTier: 'SANCTUARY_SUBSCRIBER_UNLOCK',
  },
  {
    id: 'char_5',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Robo-Bones (Commander Crane)',
    shortName: 'Robo-Bones',
    actorName: 'Commander Crane (Robo-Bones)',
    alias: 'Cybernetic Skeletal Tactical Officer',
    roleLabel: 'MIA Cyber-Enforcer',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_5_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0750s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_5_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_5_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_RoboBones',
    learnedFormants: {
      f0MedianHz: 205.1,
      f0StdHz: 132.9,
      f1Hz: 257.8,
      f1GainDb: 6.53,
      f2Hz: 914.1,
      f2GainDb: 3.03,
      f3Hz: 2414.1,
      f3GainDb: 0.12,
      f4Hz: 3656.2,
      f4GainDb: -3.01,
      voicedFramesAnalyzed: 1036,
    },
    accentColor: '#38bdf8',
    secondaryColor: '#0284c7',
    emoji: '🤖',
    storyIntelSummary:
      'Cybernetic skeletal commander of the M.I.A. wearing an aristocratic top hat, targeting monocle sensor, and glowing white optical sockets.',
    voiceDescription:
      'Learned from 1,036 movie dialogue frames (06:52 & 07:28): resonant skeletal officer baritone (F0=205Hz) with crisp tactical comms presence.',
    sampleQuote:
      '"Scareforce One launched, unannounced, then flew toward the border over New Hallows City."',
    jawRegion: { centerX: 0.5, topY: 0.57, bottomY: 0.82, width: 0.44 },
    eyeRegions: { left: { x: 0.39, y: 0.43 }, right: { x: 0.61, y: 0.43 } },
    fxStyle: 'cyber_skeleton',
    voicePreset: {
      presetLabel: 'Learned Commander Crane (1,036 frames)',
      pitchSemitones: -2.4,
      formantShiftHz: -80,
      throatFormantHz: 258,
      cavityResonanceHz: 2414,
      cavityQ: 3.5,
      gritDrive: 0.15,
      vocalTractIrMix: 0.85,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 0,
      vibratoDepthCents: 0,
      trebleBoostDb: 4.5,
      bassBoostDb: 2.5,
      combDelayMs: 7,
      combFeedback: 0.18,
    },
    defaultAccessTier: 'PLATFORM_PUBLIC',
  },
  {
    id: 'char_2',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Agent Katrina Van Tassel',
    shortName: 'Katrina',
    actorName: 'Special Agent Katrina Van Tassel',
    alias: 'MIA Senior Field Investigator',
    roleLabel: 'Main Deuteragonist',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_2_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0360s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_2_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_2_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Katrina',
    learnedFormants: {
      f0MedianHz: 132.6,
      f0StdHz: 112.6,
      f1Hz: 257.8,
      f1GainDb: 7.7,
      f2Hz: 914.1,
      f2GainDb: 3.51,
      f3Hz: 3046.9,
      f3GainDb: -1.16,
      f4Hz: 3656.2,
      f4GainDb: -2.08,
      voicedFramesAnalyzed: 942,
    },
    accentColor: '#c084fc',
    secondaryColor: '#a855f7',
    emoji: '🕵️‍♀️',
    storyIntelSummary:
      'Senior Monster Intelligence Agency (M.I.A.) tactical investigator who uncovers the conspiracy inside the Pentagram and clears Melvin’s name.',
    voiceDescription:
      'Learned from 942 movie dialogue frames (07:49 & 18:25): sleek mezzo-soprano formant envelope with F3=3047Hz forensic clarity.',
    sampleQuote:
      '"Scareforce One went down in Hallow Bay. Every camera in New Hallows saw it."',
    jawRegion: { centerX: 0.5, topY: 0.6, bottomY: 0.8, width: 0.38 },
    eyeRegions: { left: { x: 0.4, y: 0.44 }, right: { x: 0.6, y: 0.44 } },
    fxStyle: 'mia_tactical_hud',
    voicePreset: {
      presetLabel: 'Learned Agent Katrina (942 frames)',
      pitchSemitones: 2.8,
      formantShiftHz: 190,
      throatFormantHz: 380,
      cavityResonanceHz: 3047,
      cavityQ: 2.6,
      gritDrive: 0.06,
      vocalTractIrMix: 0.82,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 4.2,
      vibratoDepthCents: 6,
      trebleBoostDb: 4.0,
      bassBoostDb: -1.5,
      combDelayMs: 0,
      combFeedback: 0,
    },
    defaultAccessTier: 'PLATFORM_PUBLIC',
  },
  {
    id: 'char_marv',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'Marv (District 13 Tavern Fixer)',
    shortName: 'Marv',
    actorName: 'Marv (District 13 Fixer)',
    alias: 'Neon Pool Hall & Underworld Broker',
    roleLabel: 'District 13 Informant',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/frame_0450s.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0450s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_marv_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_marv_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Stitch',
    learnedFormants: {
      f0MedianHz: 375.0,
      f0StdHz: 82.2,
      f1Hz: 257.8,
      f1GainDb: 6.14,
      f2Hz: 914.1,
      f2GainDb: 2.17,
      f3Hz: 2414.1,
      f3GainDb: -0.85,
      f4Hz: 3656.2,
      f4GainDb: -1.93,
      voicedFramesAnalyzed: 806,
    },
    accentColor: '#ef4444',
    secondaryColor: '#f97316',
    emoji: '🎱',
    storyIntelSummary:
      'Heavy-hitting neon pool-hall barkeep and District 13 underworld fixer who trades contraband intel between the Burlap Gang and rogue M.I.A. operatives.',
    voiceDescription:
      'Learned from 806 movie dialogue frames (11:50 & 12:12): booming District 13 tavern bass-baritone with warm chest resonance.',
    sampleQuote:
      '"You better pray, Pumpkin Patch! Goddamn it, Melvin, what did I say about beheadings?"',
    jawRegion: { centerX: 0.5, topY: 0.58, bottomY: 0.83, width: 0.46 },
    eyeRegions: { left: { x: 0.39, y: 0.43 }, right: { x: 0.61, y: 0.43 } },
    fxStyle: 'tavern_neon_smoke',
    voicePreset: {
      presetLabel: 'Learned Marv Tavern Bass (806 frames)',
      pitchSemitones: -4.5,
      formantShiftHz: -165,
      throatFormantHz: 258,
      cavityResonanceHz: 914,
      cavityQ: 2.5,
      gritDrive: 0.22,
      vocalTractIrMix: 0.8,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 0,
      vibratoDepthCents: 0,
      trebleBoostDb: 1.5,
      bassBoostDb: 6.5,
      combDelayMs: 18,
      combFeedback: 0.14,
    },
    defaultAccessTier: 'SANCTUARY_SUBSCRIBER_UNLOCK',
  },
  {
    id: 'char_6',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: "Lil' Boo",
    shortName: "Lil' Boo",
    actorName: "Lil' Boo (Spectral Sidekick)",
    alias: 'Bioluminescent Spectral Sidekick',
    roleLabel: 'Supporting Companion',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_6_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_1530s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_6_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_6_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_tank.glb',
    glbNodeName: 'Turret_LilBoo',
    learnedFormants: {
      f0MedianHz: 180.5,
      f0StdHz: 125.4,
      f1Hz: 257.8,
      f1GainDb: 8.68,
      f2Hz: 914.1,
      f2GainDb: 3.8,
      f3Hz: 2484.4,
      f3GainDb: -1.05,
      f4Hz: 3656.2,
      f4GainDb: -3.04,
      voicedFramesAnalyzed: 890,
    },
    accentColor: '#a855f7',
    secondaryColor: '#38bdf8',
    emoji: '👻',
    storyIntelSummary:
      'Bioluminescent mini-ghost who rides in a glass containment jar on the roof turret of Melvin’s tank and acts as his loyal sidekick.',
    voiceDescription:
      'Learned from 890 movie frames (12:17 & 37:21): high-pitched spectral companion voice with crystalline ectoplasmic shimmer.',
    sampleQuote: '"Boo-oo! Ectoplasmic containment jar charged to 100%!"',
    jawRegion: { centerX: 0.5, topY: 0.55, bottomY: 0.78, width: 0.42 },
    eyeRegions: { left: { x: 0.38, y: 0.42 }, right: { x: 0.62, y: 0.42 } },
    fxStyle: 'ectoplasm_ghost',
    voicePreset: {
      presetLabel: "Learned Lil' Boo Spectral (890 frames)",
      pitchSemitones: 5.2,
      formantShiftHz: 310,
      throatFormantHz: 520,
      cavityResonanceHz: 2484,
      cavityQ: 2.8,
      gritDrive: 0.05,
      vocalTractIrMix: 0.75,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 6.0,
      vibratoDepthCents: 18,
      trebleBoostDb: 5.5,
      bassBoostDb: -4.0,
      combDelayMs: 16,
      combFeedback: 0.18,
    },
    defaultAccessTier: 'WORLD_SANCTUARY_ONLY',
  },
  {
    id: 'char_7',
    filmId: PUMPKIN_PATCH_FILM_ID,
    filmTitle: 'Pumpkin Patch (2025)',
    name: 'President Tepes',
    shortName: 'President Tepes',
    actorName: 'President Tepes (Head of State)',
    alias: 'Vampire Commander-in-Chief',
    roleLabel: 'Head of State',
    creatorName: 'Brian James Gage',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_7_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0270s.jpg',
    movieSampleUrl: '/audio/halloween/voices/char_7_movie_sample.wav',
    vocalTractIrUrl: '/audio/halloween/voices/char_7_vocal_ir.wav',
    glbModelUrl: '/models/halloween/pumpkin_patch_cast.glb',
    glbNodeName: 'Char_Ichabod',
    learnedFormants: {
      f0MedianHz: 266.7,
      f0StdHz: 116.3,
      f1Hz: 257.8,
      f1GainDb: 7.97,
      f2Hz: 914.1,
      f2GainDb: 3.63,
      f3Hz: 2414.1,
      f3GainDb: -0.49,
      f4Hz: 3656.2,
      f4GainDb: -3.15,
      voicedFramesAnalyzed: 981,
    },
    accentColor: '#f43f5e',
    secondaryColor: '#e11d48',
    emoji: '🧛',
    storyIntelSummary:
      'Ancient aristocratic vampire statesman who rides alongside Melvin in the armored tank escape and guards the Hexagon vault.',
    voiceDescription:
      'Learned from 981 movie dialogue frames (37:21 & 50:52): velvet Old-World vampire baritone with resonant F1=258Hz chest warmth.',
    sampleQuote: '"That\'s pretty metal, I guess. You think we\'ll make it?"',
    jawRegion: { centerX: 0.5, topY: 0.59, bottomY: 0.81, width: 0.42 },
    eyeRegions: { left: { x: 0.4, y: 0.43 }, right: { x: 0.6, y: 0.43 } },
    fxStyle: 'vampire_lord',
    voicePreset: {
      presetLabel: 'Learned President Tepes (981 frames)',
      pitchSemitones: -2.8,
      formantShiftHz: -115,
      throatFormantHz: 258,
      cavityResonanceHz: 914,
      cavityQ: 2.5,
      gritDrive: 0.12,
      vocalTractIrMix: 0.82,
      ringModHz: 0,
      ringModMix: 0,
      vibratoHz: 4.5,
      vibratoDepthCents: 8,
      trebleBoostDb: 2.5,
      bassBoostDb: 4.5,
      combDelayMs: 14,
      combFeedback: 0.14,
    },
    defaultAccessTier: 'SANCTUARY_SUBSCRIBER_UNLOCK',
  },
];

// ============================================================================
// 3. CREATOR LICENSING STORAGE & ENTITLEMENT EVALUATION
// ============================================================================

const LICENSE_STORAGE_KEY = 'plajah:storyIntel:characterLicenses:v1';

export function loadCreatorCharacterPolicy(filmId = PUMPKIN_PATCH_FILM_ID): CreatorFilmInteractivePolicy {
  const defaultMap: Record<string, CharacterInteractivePermission> = {};
  for (const c of STORY_INTEL_VTUBER_CHARACTERS) {
    defaultMap[c.id] = {
      characterId: c.id,
      filmId: c.filmId,
      creatorId: 'creator_brian_james_gage',
      creatorName: c.creatorName,
      accessTier: c.defaultAccessTier,
      allowIn3DExhibitions: true,
      allowVTuberFaceMapping: true,
      allowRealtimeVoiceChanger: true,
      enabledForVTuber: true,
      enabledForVoiceChanger: true,
      enabledFor3DExhibit: true,
      subscriberTierLabel: 'Planet Ween Sanctuary & Creator Subscriber ($4.99/mo)',
      monthlyPriceUsd: 4.99,
      updatedAt: Date.now(),
    };
  }

  try {
    const raw = localStorage.getItem(`${LICENSE_STORAGE_KEY}:${filmId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CreatorFilmInteractivePolicy>;
      const masterEnabled =
        parsed.enableInteractiveCharactersMaster ??
        parsed.interactiveCharactersEnabled ??
        true;
      const defaultTier =
        parsed.defaultAccessTier ?? parsed.globalDefaultTier ?? 'PLATFORM_PUBLIC';
      return {
        filmId: parsed.filmId || filmId,
        filmTitle: parsed.filmTitle || 'Pumpkin Patch (2025)',
        creatorName: parsed.creatorName || 'Brian James Gage',
        enableInteractiveCharactersMaster: masterEnabled,
        interactiveCharactersEnabled: masterEnabled,
        defaultAccessTier: defaultTier,
        globalDefaultTier: defaultTier,
        characters: { ...defaultMap, ...(parsed.characters || {}) },
      };
    }
  } catch {
    // ignore storage errors
  }

  return {
    filmId,
    filmTitle: 'Pumpkin Patch (2025)',
    creatorName: 'Brian James Gage',
    enableInteractiveCharactersMaster: true,
    interactiveCharactersEnabled: true,
    defaultAccessTier: 'PLATFORM_PUBLIC',
    globalDefaultTier: 'PLATFORM_PUBLIC',
    characters: defaultMap,
  };
}

export function saveCreatorCharacterPolicy(policy: CreatorFilmInteractivePolicy): void {
  try {
    const synced: CreatorFilmInteractivePolicy = {
      ...policy,
      enableInteractiveCharactersMaster:
        policy.enableInteractiveCharactersMaster ?? policy.interactiveCharactersEnabled ?? true,
      interactiveCharactersEnabled:
        policy.interactiveCharactersEnabled ?? policy.enableInteractiveCharactersMaster ?? true,
      defaultAccessTier: policy.defaultAccessTier ?? policy.globalDefaultTier ?? 'PLATFORM_PUBLIC',
      globalDefaultTier: policy.globalDefaultTier ?? policy.defaultAccessTier ?? 'PLATFORM_PUBLIC',
    };
    localStorage.setItem(`${LICENSE_STORAGE_KEY}:${synced.filmId}`, JSON.stringify(synced));
    window.dispatchEvent(
      new CustomEvent('plajah:character-license-updated', { detail: { filmId: synced.filmId } })
    );
  } catch {
    // ignore storage errors
  }
}

export function evaluateCharacterAccess(
  perm: CharacterInteractivePermission | undefined,
  masterEnabled: boolean,
  viewerMode: ViewerSubscriptionSimulationMode
): {
  unlocked: boolean;
  reasonLabel: string;
  badgeText: string;
} {
  if (!masterEnabled || !perm || perm.accessTier === 'DISABLED') {
    return {
      unlocked: viewerMode === 'CREATOR_OWNER',
      reasonLabel: 'Creator has disabled interactive use for this character.',
      badgeText: '🔒 Disabled by Creator',
    };
  }

  if (viewerMode === 'CREATOR_OWNER') {
    return {
      unlocked: true,
      reasonLabel: 'Unlocked (Creator / IP Owner Full Access)',
      badgeText: '👑 Creator Owner',
    };
  }

  switch (perm.accessTier) {
    case 'PLATFORM_PUBLIC':
      return {
        unlocked: true,
        reasonLabel: 'Creator shared this character with the entire platform.',
        badgeText: '🌐 Platform Public',
      };
    case 'SANCTUARY_SUBSCRIBER_UNLOCK':
      if (
        viewerMode === 'ACTIVE_CREATOR_SUBSCRIBER' ||
        viewerMode === 'IN_CREATOR_SANCTUARY'
      ) {
        return {
          unlocked: true,
          reasonLabel: `Unlocked via active subscription to ${perm.creatorName} (${perm.subscriberTierLabel || 'Subscriber'}).`,
          badgeText: '💎 Subscriber Unlocked',
        };
      }
      return {
        unlocked: false,
        reasonLabel: `Subscribe to ${perm.creatorName} or join their Sanctuary to unlock ${perm.characterId} for platform-wide VTuber & Voice use.`,
        badgeText: '🔒 Subscribers & Sanctuary Only',
      };
    case 'WORLD_SANCTUARY_ONLY':
      if (viewerMode === 'IN_CREATOR_SANCTUARY') {
        return {
          unlocked: true,
          reasonLabel: `Active inside ${perm.creatorName}'s World / Sanctuary experience.`,
          badgeText: '🏰 Sanctuary Exclusive (Active)',
        };
      }
      return {
        unlocked: false,
        reasonLabel: `Restricted by ${perm.creatorName} to their own Worlds & Sanctuary experiences only.`,
        badgeText: '🏰 World & Sanctuary Only',
      };
    default:
      return {
        unlocked: false,
        reasonLabel: 'Restricted character.',
        badgeText: '🔒 Restricted',
      };
  }
}

// ============================================================================
// 4. LEARNED VOCAL-TRACT CONVOLUTION & REAL MOVIE VOICE CHANGER ENGINE
// ============================================================================

export class RealtimeCharacterVoiceChanger {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pitchNode: ScriptProcessorNode | null = null;

  // Learned Vocal-Tract FIR Convolver + Wet/Dry Blend
  private vocalTractConvolver: ConvolverNode | null = null;
  private convolverWetGain: GainNode | null = null;
  private convolverDryGain: GainNode | null = null;

  // 4 Learned Formant Filters (F1, F2, F3, F4) + Anti-Aliasing Lowpass
  private f1Filter: BiquadFilterNode | null = null;
  private f2Filter: BiquadFilterNode | null = null;
  private f3Filter: BiquadFilterNode | null = null;
  private f4Filter: BiquadFilterNode | null = null;
  private antiAliasLowpass: BiquadFilterNode | null = null;

  private bassShelf: BiquadFilterNode | null = null;
  private trebleShelf: BiquadFilterNode | null = null;
  private waveShaper: WaveShaperNode | null = null;
  private combDelay: DelayNode | null = null;
  private combFeedbackGain: GainNode | null = null;
  private combWetGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private monitorGain: GainNode | null = null;

  // Cached AudioBuffers for movie voice clips & learned vocal-tract IRs
  private movieSampleCache = new Map<string, AudioBuffer>();
  private vocalIrCache = new Map<string, AudioBuffer>();
  private activeSampleSource: AudioBufferSourceNode | null = null;

  // Smooth 4096-sample Hann-windowed pitch-shifting circular buffer
  private delayBuffer = new Float32Array(32768);
  private writeIndex = 0;
  private grainPhase = 0;
  private currentPreset: CharacterVoiceDspPreset = STORY_INTEL_VTUBER_CHARACTERS[0].voicePreset;
  private currentCharacter: CharacterVTuberRigSpec = STORY_INTEL_VTUBER_CHARACTERS[0];
  private isRunning = false;
  private demoSynthActive = false;
  private demoSynthTimeout: number | null = null;

  private ensureContext(): AudioContext {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  /** Fetch & decode a character's learned 256-tap vocal-tract FIR impulse response */
  async loadVocalTractIr(character: CharacterVTuberRigSpec): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    const cached = this.vocalIrCache.get(character.id);
    if (cached) {
      if (this.vocalTractConvolver) {
        this.vocalTractConvolver.buffer = cached;
      }
      return cached;
    }
    try {
      const resp = await fetch(character.vocalTractIrUrl);
      if (!resp.ok) return null;
      const arr = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      this.vocalIrCache.set(character.id, decoded);
      if (this.vocalTractConvolver) {
        this.vocalTractConvolver.buffer = decoded;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  /** Fetch & decode a character's real extracted dialogue clip from the movie */
  async loadMovieVoiceSample(character: CharacterVTuberRigSpec): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    const cached = this.movieSampleCache.get(character.id);
    if (cached) return cached;
    try {
      const resp = await fetch(character.movieSampleUrl);
      if (!resp.ok) return null;
      const arr = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      this.movieSampleCache.set(character.id, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  /** Start real-time microphone voice transformation using learned vocal-tract IR & formants */
  async startMicrophone(
    preset: CharacterVoiceDspPreset,
    monitorToSpeakers = true,
    character?: CharacterVTuberRigSpec
  ): Promise<MediaStream | null> {
    this.stop();
    this.currentPreset = preset;
    if (character) {
      this.currentCharacter = character;
    }

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.sourceNode = ctx.createMediaStreamSource(this.micStream);
    this.buildDspGraph(monitorToSpeakers);
    await this.loadVocalTractIr(this.currentCharacter);
    this.sourceNode.connect(this.pitchNode!);
    this.isRunning = true;
    return this.destinationNode?.stream || null;
  }

  /**
   * Build the natural, non-robotic Vocal-Tract Convolution + Learned F1–F4 Formant Filter Bank
   * + Smooth 4096-Sample Hann-Windowed Pitch Shifter + Studio Compressor.
   */
  private buildDspGraph(monitorToSpeakers: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Smooth 4096-sample Dual-Grain Hann-Windowed Pitch Shifter
    this.pitchNode = ctx.createScriptProcessor(2048, 1, 1);
    const grainSize = 4096;
    const bufLen = this.delayBuffer.length;

    this.pitchNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);
      const p = this.currentPreset;

      const nowSec = ctx.currentTime;
      const vibratoSemitones =
        p.vibratoHz > 0
          ? Math.sin(nowSec * Math.PI * 2 * p.vibratoHz) * (p.vibratoDepthCents / 100)
          : 0;
      const totalSemitones = p.pitchSemitones + vibratoSemitones;

      // Bypass grain resampler when pitch shift is near 0 for 100% phase-transparent clarity
      if (Math.abs(totalSemitones) < 0.08) {
        for (let i = 0; i < input.length; i++) {
          this.delayBuffer[this.writeIndex] = input[i];
          output[i] = input[i];
          this.writeIndex = (this.writeIndex + 1) % bufLen;
        }
        return;
      }

      const pitchRatio = Math.pow(2, totalSemitones / 12);
      const phaseStep = (1 - pitchRatio) / grainSize;

      for (let i = 0; i < input.length; i++) {
        this.delayBuffer[this.writeIndex] = input[i];

        this.grainPhase += phaseStep;
        if (this.grainPhase >= 1) this.grainPhase -= 1;
        if (this.grainPhase < 0) this.grainPhase += 1;

        const phaseA = this.grainPhase;
        const phaseB = (this.grainPhase + 0.5) % 1;

        const delayA = phaseA * grainSize;
        const delayB = phaseB * grainSize;

        const readIdxA = (this.writeIndex - delayA + bufLen) % bufLen;
        const readIdxB = (this.writeIndex - delayB + bufLen) % bufLen;

        const idxA0 = Math.floor(readIdxA);
        const fracA = readIdxA - idxA0;
        const sampleA =
          this.delayBuffer[idxA0] * (1 - fracA) +
          this.delayBuffer[(idxA0 + 1) % bufLen] * fracA;

        const idxB0 = Math.floor(readIdxB);
        const fracB = readIdxB - idxB0;
        const sampleB =
          this.delayBuffer[idxB0] * (1 - fracB) +
          this.delayBuffer[(idxB0 + 1) % bufLen] * fracB;

        const winA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseA);
        const winB = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseB);

        output[i] = sampleA * winA + sampleB * winB;
        this.writeIndex = (this.writeIndex + 1) % bufLen;
      }
    };

    // 2. Learned Vocal-Tract Minimum-Phase FIR Convolver + Wet/Dry Blend
    this.vocalTractConvolver = ctx.createConvolver();
    this.vocalTractConvolver.normalize = true;
    this.convolverWetGain = ctx.createGain();
    this.convolverDryGain = ctx.createGain();
    this.convolverWetGain.gain.value = 0.78;
    this.convolverDryGain.gain.value = 0.42;

    // Create a fallback unit-impulse buffer until the character's WAV IR finishes loading
    const fallbackIr = ctx.createBuffer(1, 64, ctx.sampleRate);
    fallbackIr.getChannelData(0)[0] = 1.0;
    this.vocalTractConvolver.buffer = fallbackIr;

    // 3. Learned 4-Formant Resonant Filter Bank (F1, F2, F3, F4)
    this.f1Filter = ctx.createBiquadFilter();
    this.f1Filter.type = 'peaking';

    this.f2Filter = ctx.createBiquadFilter();
    this.f2Filter.type = 'peaking';

    this.f3Filter = ctx.createBiquadFilter();
    this.f3Filter.type = 'peaking';

    this.f4Filter = ctx.createBiquadFilter();
    this.f4Filter.type = 'peaking';

    this.bassShelf = ctx.createBiquadFilter();
    this.bassShelf.type = 'lowshelf';
    this.bassShelf.frequency.value = 210;

    this.trebleShelf = ctx.createBiquadFilter();
    this.trebleShelf.type = 'highshelf';
    this.trebleShelf.frequency.value = 2800;

    this.antiAliasLowpass = ctx.createBiquadFilter();
    this.antiAliasLowpass.type = 'lowpass';
    this.antiAliasLowpass.frequency.value = 7800;
    this.antiAliasLowpass.Q.value = 0.707;

    // 4. Gentle Analog-Tube Warmth WaveShaper (soft tanh, never harsh metallic clipping)
    this.waveShaper = ctx.createWaveShaper();

    // 5. Subtle Acoustic Space Reflection (kept gentle so it never sounds like a robot comb)
    this.combDelay = ctx.createDelay(0.1);
    this.combFeedbackGain = ctx.createGain();
    this.combWetGain = ctx.createGain();
    this.combWetGain.gain.value = 0.18;

    // 6. Broadcast Studio Vocal Compressor + Master + Analyser
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.12;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.15;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.68;

    this.destinationNode = ctx.createMediaStreamDestination();
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = monitorToSpeakers ? 0.95 : 0.0;

    // Connect Audio Graph:
    // pitchNode -> [vocalTractConvolver (wet) + convolverDryGain (dry)] -> bassShelf -> f1 -> f2 -> f3 -> f4 -> waveShaper -> trebleShelf -> antiAliasLowpass -> compressor -> masterGain -> analyser
    this.pitchNode.connect(this.vocalTractConvolver);
    this.vocalTractConvolver.connect(this.convolverWetGain);
    this.pitchNode.connect(this.convolverDryGain);

    this.convolverWetGain.connect(this.bassShelf);
    this.convolverDryGain.connect(this.bassShelf);

    this.bassShelf.connect(this.f1Filter);
    this.f1Filter.connect(this.f2Filter);
    this.f2Filter.connect(this.f3Filter);
    this.f3Filter.connect(this.f4Filter);
    this.f4Filter.connect(this.waveShaper);

    // Subtle acoustic space reflection loop
    this.waveShaper.connect(this.combDelay);
    this.combDelay.connect(this.combFeedbackGain);
    this.combFeedbackGain.connect(this.combDelay);
    this.combDelay.connect(this.combWetGain);
    this.combWetGain.connect(this.trebleShelf);

    this.waveShaper.connect(this.trebleShelf);
    this.trebleShelf.connect(this.antiAliasLowpass);
    this.antiAliasLowpass.connect(this.compressor);
    this.compressor.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.destinationNode);
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);

    this.applyPresetParameters(this.currentPreset, this.currentCharacter);
  }

  /** Dynamically switch character voice preset & learned vocal-tract IR in real time */
  applyPresetParameters(
    preset: CharacterVoiceDspPreset,
    character?: CharacterVTuberRigSpec
  ): void {
    this.currentPreset = preset;
    if (character && character.id !== this.currentCharacter.id) {
      this.currentCharacter = character;
      this.loadVocalTractIr(character).catch(() => {});
    }
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const lf = (character || this.currentCharacter).learnedFormants;
    const shiftHz = preset.formantShiftHz;

    const irMix = preset.vocalTractIrMix ?? 0.78;
    if (this.convolverWetGain && this.convolverDryGain) {
      this.convolverWetGain.gain.setTargetAtTime(irMix, now, 0.03);
      this.convolverDryGain.gain.setTargetAtTime(1.0 - irMix * 0.65, now, 0.03);
    }

    if (this.f1Filter) {
      this.f1Filter.frequency.setTargetAtTime(
        Math.max(150, lf.f1Hz + shiftHz * 0.35),
        now,
        0.03
      );
      this.f1Filter.Q.setTargetAtTime(2.0, now, 0.03);
      this.f1Filter.gain.setTargetAtTime(Math.min(9, lf.f1GainDb), now, 0.03);
    }

    if (this.f2Filter) {
      this.f2Filter.frequency.setTargetAtTime(
        Math.max(450, lf.f2Hz + shiftHz * 0.75),
        now,
        0.03
      );
      this.f2Filter.Q.setTargetAtTime(2.4, now, 0.03);
      this.f2Filter.gain.setTargetAtTime(Math.min(8, lf.f2GainDb + 1.5), now, 0.03);
    }

    if (this.f3Filter) {
      this.f3Filter.frequency.setTargetAtTime(
        Math.max(1400, lf.f3Hz + shiftHz * 1.1),
        now,
        0.03
      );
      this.f3Filter.Q.setTargetAtTime(preset.cavityQ || 2.6, now, 0.03);
      this.f3Filter.gain.setTargetAtTime(lf.f3GainDb + 2.0, now, 0.03);
    }

    if (this.f4Filter) {
      this.f4Filter.frequency.setTargetAtTime(
        Math.max(2400, lf.f4Hz + shiftHz * 1.2),
        now,
        0.03
      );
      this.f4Filter.Q.setTargetAtTime(3.0, now, 0.03);
      this.f4Filter.gain.setTargetAtTime(lf.f4GainDb, now, 0.03);
    }

    if (this.bassShelf) {
      this.bassShelf.gain.setTargetAtTime(preset.bassBoostDb, now, 0.03);
    }
    if (this.trebleShelf) {
      this.trebleShelf.gain.setTargetAtTime(preset.trebleBoostDb, now, 0.03);
    }

    if (this.waveShaper) {
      // Soft analog tanh warmth (never harsh buzz)
      const drive = 1 + Math.max(0, Math.min(1, preset.gritDrive)) * 2.2;
      const nSamples = 1024;
      const curve = new Float32Array(nSamples);
      const norm = Math.tanh(drive);
      for (let i = 0; i < nSamples; i++) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = Math.tanh(x * drive) / norm;
      }
      this.waveShaper.curve = curve;
    }

    if (this.combDelay && this.combFeedbackGain) {
      this.combDelay.delayTime.setTargetAtTime(
        Math.max(0.008, preset.combDelayMs / 1000),
        now,
        0.03
      );
      this.combFeedbackGain.gain.setTargetAtTime(
        preset.combDelayMs > 0 ? Math.min(0.22, preset.combFeedback) : 0,
        now,
        0.03
      );
    }
  }

  /**
   * Play the ACTUAL extracted character voice from the *Pumpkin Patch* movie
   * (`character.movieSampleUrl`) through the AnalyserNode so the user hears the real
   * character dialogue from the film and sees the 3D/VTuber rig lip-sync in real time!
   */
  async playCharacterVoiceDemo(character: CharacterVTuberRigSpec): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!this.pitchNode) {
      this.buildDspGraph(true);
    }
    this.currentCharacter = character;
    await this.loadVocalTractIr(character);
    this.applyPresetParameters(character.voicePreset, character);
    if (this.monitorGain) {
      this.monitorGain.gain.setValueAtTime(0.98, ctx.currentTime);
    }

    // Stop any previous demo sample
    if (this.activeSampleSource) {
      try {
        this.activeSampleSource.stop();
        this.activeSampleSource.disconnect();
      } catch {
        // ignore
      }
      this.activeSampleSource = null;
    }

    const movieBuf = await this.loadMovieVoiceSample(character);
    if (movieBuf && this.masterGain) {
      const src = ctx.createBufferSource();
      src.buffer = movieBuf;
      // Route the real movie character voice directly into masterGain -> analyser -> speakers
      // so the authentic movie performance is heard with crystal clarity while driving lip-sync!
      src.connect(this.masterGain);
      this.activeSampleSource = src;

      const clipDur = Math.min(movieBuf.duration, 10.5);
      src.start(0, 0, clipDur);
      this.demoSynthActive = true;
      if (this.demoSynthTimeout) window.clearTimeout(this.demoSynthTimeout);
      this.demoSynthTimeout = window.setTimeout(() => {
        this.demoSynthActive = false;
      }, clipDur * 1000);
      return;
    }
  }

  /**
   * Preview Voice-Morph Transfer: Takes a neutral reference human voice clip and routes it
   * through the target character's Learned Vocal-Tract Convolver + F1–F4 Formants + Pitch Shifter
   * so the user can hear live voice conversion even without a microphone!
   */
  async playMorphedVoiceTransferDemo(character: CharacterVTuberRigSpec): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!this.pitchNode) {
      this.buildDspGraph(true);
    }
    this.currentCharacter = character;
    await this.loadVocalTractIr(character);
    this.applyPresetParameters(character.voicePreset, character);
    if (this.monitorGain) {
      this.monitorGain.gain.setValueAtTime(0.98, ctx.currentTime);
    }

    if (this.activeSampleSource) {
      try {
        this.activeSampleSource.stop();
        this.activeSampleSource.disconnect();
      } catch {
        // ignore
      }
      this.activeSampleSource = null;
    }

    // Use Director Ichabod (`char_8`) or Agent Katrina (`char_2`) neutral speech clip as the dry human input
    const neutralChar =
      STORY_INTEL_VTUBER_CHARACTERS.find(
        c => c.id === (character.id === 'char_8' ? 'char_2' : 'char_8')
      ) || STORY_INTEL_VTUBER_CHARACTERS[3];

    const sourceSpeechBuf = await this.loadMovieVoiceSample(neutralChar);
    if (sourceSpeechBuf && this.pitchNode) {
      const src = ctx.createBufferSource();
      src.buffer = sourceSpeechBuf;
      // Route through the full pitchNode -> vocalTractConvolver -> F1..F4 DSP chain!
      src.connect(this.pitchNode);
      this.activeSampleSource = src;

      const clipDur = Math.min(sourceSpeechBuf.duration, 8.5);
      src.start(0, 0, clipDur);
      this.demoSynthActive = true;
      if (this.demoSynthTimeout) window.clearTimeout(this.demoSynthTimeout);
      this.demoSynthTimeout = window.setTimeout(() => {
        this.demoSynthActive = false;
      }, clipDur * 1000);
    }
  }

  stopDemoSample(): void {
    if (this.activeSampleSource) {
      try {
        this.activeSampleSource.stop();
        this.activeSampleSource.disconnect();
      } catch {
        // ignore
      }
      this.activeSampleSource = null;
    }
    this.demoSynthActive = false;
    if (this.demoSynthTimeout) {
      window.clearTimeout(this.demoSynthTimeout);
      this.demoSynthTimeout = null;
    }
  }

  setMonitorEnabled(enabled: boolean): void {
    if (this.monitorGain && this.ctx) {
      this.monitorGain.gain.setTargetAtTime(enabled ? 0.95 : 0.0, this.ctx.currentTime, 0.03);
    }
  }

  /** Returns real-time voice amplitude (0..1) and 16-bar spectrum for VTuber lip-sync & UI */
  getVoiceTelemetry(): { amplitude: number; spectrum: number[]; isSpeaking: boolean } {
    if (!this.analyser || (!this.isRunning && !this.demoSynthActive)) {
      return { amplitude: 0, spectrum: new Array(16).fill(0), isSpeaking: false };
    }
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);

    let sum = 0;
    const spectrum: number[] = [];
    const stride = Math.max(1, Math.floor(bins.length / 16));
    for (let i = 0; i < 16; i++) {
      const val = bins[Math.min(bins.length - 1, i * stride)] / 255;
      spectrum.push(val);
      sum += val;
    }
    const avg = Math.min(1, (sum / 16) * 2.1);
    return {
      amplitude: avg,
      spectrum,
      isSpeaking: avg > 0.05,
    };
  }

  getOutputStream(): MediaStream | null {
    return this.destinationNode?.stream || null;
  }

  get active(): boolean {
    return this.isRunning;
  }

  stop(): void {
    this.isRunning = false;
    this.stopDemoSample();
    try {
      this.sourceNode?.disconnect();
      this.pitchNode?.disconnect();
    } catch {
      // ignore
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.sourceNode = null;
    this.pitchNode = null;
    this.destinationNode = null;
  }
}

// ============================================================================
// 5. VTUBER 2.5D CHARACTER FACE RIG & AR FACE-SWAP CANVAS RENDERER
// ============================================================================

export function renderStoryIntelVTuberFrame(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  character: CharacterVTuberRigSpec;
  portraitImg: HTMLImageElement | null;
  webcamVideo?: HTMLVideoElement | null;
  faceEyes?: FaceEyes | null;
  voiceAmplitude: number;
  voiceSpectrum: number[];
  mode: 'VTUBER_STAGE' | 'AR_WEBCAM_SWAP';
  dimLightsFoundFootage: boolean;
  timeSec: number;
}): void {
  const {
    ctx,
    width: w,
    height: h,
    character,
    portraitImg,
    webcamVideo,
    faceEyes,
    voiceAmplitude,
    voiceSpectrum,
    mode,
    dimLightsFoundFootage,
    timeSec,
  } = params;

  ctx.save();

  let headCenterX = w * 0.5;
  let headCenterY = h * 0.48;
  let headRoll = Math.sin(timeSec * 1.4) * 0.045;
  let headScale = 1.0 + Math.sin(timeSec * 2.1) * 0.012;

  if (faceEyes) {
    const midX = ((faceEyes.left.cx + faceEyes.right.cx) * 0.5) * w;
    const midY = ((faceEyes.left.cy + faceEyes.right.cy) * 0.5) * h;
    headCenterX = w * 0.5 + (midX - w * 0.5) * 0.65;
    headCenterY = h * 0.48 + (midY - h * 0.42) * 0.65;
    headRoll = Math.max(-0.38, Math.min(0.38, faceEyes.roll || 0));
    const eyeSpan = Math.hypot(
      (faceEyes.right.cx - faceEyes.left.cx) * w,
      (faceEyes.right.cy - faceEyes.left.cy) * h
    );
    headScale = Math.max(0.75, Math.min(1.4, eyeSpan / (w * 0.16)));
  } else {
    headCenterX += Math.sin(timeSec * 0.9) * (w * 0.02);
    headCenterY += Math.cos(timeSec * 1.7) * (h * 0.015);
  }

  const mouthOpen = Math.min(
    1,
    voiceAmplitude * 1.45 + (voiceAmplitude > 0.05 ? Math.abs(Math.sin(timeSec * 18)) * 0.25 : 0)
  );

  // 1. Background rendering
  if (mode === 'AR_WEBCAM_SWAP' && webcamVideo && webcamVideo.readyState >= 2) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(webcamVideo, 0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = 'rgba(8, 4, 16, 0.35)';
    ctx.fillRect(0, 0, w, h);
  } else {
    const bgGrad = ctx.createRadialGradient(
      headCenterX,
      headCenterY,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      w * 0.75
    );
    bgGrad.addColorStop(0, `${character.accentColor}33`);
    bgGrad.addColorStop(0.55, '#0b0614');
    bgGrad.addColorStop(1, '#030106');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = `${character.accentColor}1f`;
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
  }

  // 2. Render the Mapped Story Intelligence Character Head + Articulated Talking Jaw
  const avatarW = (mode === 'AR_WEBCAM_SWAP' ? w * 0.44 : w * 0.54) * headScale;
  const avatarH = avatarW * 1.18;

  ctx.save();
  ctx.translate(headCenterX, headCenterY);
  ctx.rotate(headRoll);

  if (mouthOpen > 0.04) {
    const auraRadius = avatarW * (0.58 + mouthOpen * 0.25);
    const aura = ctx.createRadialGradient(0, 0, avatarW * 0.2, 0, 0, auraRadius);
    aura.addColorStop(0, `${character.accentColor}99`);
    aura.addColorStop(0.6, `${character.secondaryColor}33`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (portraitImg && portraitImg.complete && portraitImg.naturalWidth > 0) {
    const iw = portraitImg.naturalWidth;
    const ih = portraitImg.naturalHeight;
    const jawSplitY = character.jawRegion.topY;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-avatarW / 2, -avatarH / 2, avatarW, avatarH * jawSplitY + 4, [28, 28, 8, 8]);
    ctx.clip();
    ctx.drawImage(
      portraitImg,
      0,
      0,
      iw,
      ih * jawSplitY,
      -avatarW / 2,
      -avatarH / 2,
      avatarW,
      avatarH * jawSplitY
    );
    ctx.restore();

    const jawDropPx = mouthOpen * (avatarH * 0.13);
    const splitCanvasY = -avatarH / 2 + avatarH * jawSplitY;
    if (jawDropPx > 1.5) {
      const mouthW = avatarW * character.jawRegion.width;
      const mouthGrad = ctx.createRadialGradient(
        0,
        splitCanvasY + jawDropPx * 0.4,
        2,
        0,
        splitCanvasY + jawDropPx * 0.4,
        mouthW * 0.6
      );
      if (character.fxStyle === 'pumpkin_plasma') {
        mouthGrad.addColorStop(0, '#fff7ed');
        mouthGrad.addColorStop(0.4, '#f97316');
        mouthGrad.addColorStop(1, '#431407');
      } else if (character.fxStyle === 'witch_hex') {
        mouthGrad.addColorStop(0, '#ecfdf5');
        mouthGrad.addColorStop(0.4, '#10b981');
        mouthGrad.addColorStop(1, '#064e3b');
      } else if (character.fxStyle === 'cyber_skeleton') {
        mouthGrad.addColorStop(0, '#e0f2fe');
        mouthGrad.addColorStop(0.4, '#38bdf8');
        mouthGrad.addColorStop(1, '#0c4a6e');
      } else {
        mouthGrad.addColorStop(0, '#fda4af');
        mouthGrad.addColorStop(0.5, '#881337');
        mouthGrad.addColorStop(1, '#1c1917');
      }
      ctx.fillStyle = mouthGrad;
      ctx.beginPath();
      ctx.ellipse(0, splitCanvasY + jawDropPx * 0.45, mouthW * 0.45, jawDropPx * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, jawDropPx);
    ctx.rotate(Math.sin(timeSec * 24) * mouthOpen * 0.03);
    ctx.beginPath();
    ctx.roundRect(
      -avatarW / 2,
      splitCanvasY - 2,
      avatarW,
      avatarH * (1 - jawSplitY) + 4,
      [8, 8, 32, 32]
    );
    ctx.clip();
    ctx.drawImage(
      portraitImg,
      0,
      ih * jawSplitY,
      iw,
      ih * (1 - jawSplitY),
      -avatarW / 2,
      splitCanvasY,
      avatarW,
      avatarH * (1 - jawSplitY)
    );
    ctx.restore();

    const isBlinking = Math.sin(timeSec * 1.9) > 0.96;
    const leftEyeX = (character.eyeRegions.left.x - 0.5) * avatarW;
    const leftEyeY = (character.eyeRegions.left.y - 0.5) * avatarH;
    const rightEyeX = (character.eyeRegions.right.x - 0.5) * avatarW;
    const rightEyeY = (character.eyeRegions.right.y - 0.5) * avatarH;

    [
      { x: leftEyeX, y: leftEyeY },
      { x: rightEyeX, y: rightEyeY },
    ].forEach((eye, idx) => {
      if (character.id === 'char_3' && idx === 0) return;

      const eyeGlowRadius = avatarW * (0.065 + mouthOpen * 0.045);
      const eg = ctx.createRadialGradient(eye.x, eye.y, 1, eye.x, eye.y, eyeGlowRadius);
      eg.addColorStop(0, '#ffffff');
      eg.addColorStop(0.35, character.accentColor);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg;
      ctx.save();
      if (isBlinking) ctx.scale(1, 0.15);
      ctx.beginPath();
      ctx.arc(eye.x, isBlinking ? eye.y * 6.5 : eye.y, eyeGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.strokeStyle = character.accentColor;
    ctx.lineWidth = 2.5 + mouthOpen * 3;
    ctx.beginPath();
    ctx.roundRect(-avatarW / 2, -avatarH / 2, avatarW, avatarH + jawDropPx, 28);
    ctx.stroke();
  }

  ctx.restore();

  if (dimLightsFoundFootage) {
    const beamRadius = w * 0.42;
    const darkness = ctx.createRadialGradient(
      headCenterX,
      headCenterY,
      beamRadius * 0.22,
      headCenterX,
      headCenterY,
      beamRadius * 1.15
    );
    darkness.addColorStop(0, 'rgba(255, 250, 220, 0.06)');
    darkness.addColorStop(0.55, 'rgba(5, 8, 6, 0.72)');
    darkness.addColorStop(1, 'rgba(1, 2, 2, 0.96)');
    ctx.fillStyle = darkness;
    ctx.fillRect(0, 0, w, h);
  }

  const barCount = voiceSpectrum.length;
  const barAreaW = w * 0.56;
  const startX = (w - barAreaW) / 2;
  const barW = barAreaW / barCount - 3;

  for (let i = 0; i < barCount; i++) {
    const val = voiceSpectrum[i] || 0;
    const bh = Math.max(4, val * 42);
    ctx.fillStyle = i % 2 === 0 ? character.accentColor : character.secondaryColor;
    ctx.fillRect(startX + i * (barW + 3), h - 14 - bh, barW, bh);
  }

  ctx.restore();
}
