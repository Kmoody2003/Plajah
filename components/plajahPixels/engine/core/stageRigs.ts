// stageRigs — the catalogue of concert-stage generators (RIG_*): operator names, energy tier,
// art-directed palette. Dependency-free on purpose (the palette module, Ambo's media library and
// the parameter panel read it without pulling the shaders in). Shaders live in generatorsStage.ts.

export type StageTier = 'laser' | 'high' | 'mid' | 'mellow';
/** Who is on stage: a band with drum riser and amps, a DJ at a booth, a singer at a mic, a choir on risers, an acoustic duo. */
export type StageAct = 'band' | 'dj' | 'singer' | 'choir' | 'duo';

export interface StageRig {
  mode: string;
  name: string;
  tier: StageTier;
  venue: string;
  act: StageAct;
  palette: [string, string, string];
}

export const STAGE_RIGS: StageRig[] = [
  // ── Laser shows: the full gamut — lasers, sharpies, strobes, blinders, pyro, CO2 ──
  { mode: 'RIG_LASER_CATHEDRAL',    name: 'Laser Cathedral',  tier: 'laser', venue: 'arena',     act: 'dj', palette: ['#00FF66', '#2E6BFF', '#FF2BD6'] },
  { mode: 'RIG_LASER_LIQUID_SKY',   name: 'Liquid Sky',       tier: 'laser', venue: 'festival',  act: 'dj', palette: ['#19FF5A', '#00C8FF', '#B04BFF'] },
  { mode: 'RIG_LASER_TUNNEL',       name: 'Laser Tunnel',     tier: 'laser', venue: 'warehouse', act: 'dj', palette: ['#FF1E3C', '#16E0FF', '#8A2BFF'] },
  { mode: 'RIG_LASER_CROSSFIRE',    name: 'Crossfire',        tier: 'laser', venue: 'arena',     act: 'band', palette: ['#00FF4C', '#FF2020', '#FFC21A'] },
  { mode: 'RIG_LASER_MAINSTAGE',    name: 'Mainstage Inferno', tier: 'laser', venue: 'festival', act: 'dj', palette: ['#FF3B1F', '#FFB000', '#2B6BFF'] },
  { mode: 'RIG_LASER_GRID',         name: 'Laser Grid',       tier: 'laser', venue: 'warehouse', act: 'dj', palette: ['#FF0A2A', '#00FFA6', '#3D5BFF'] },
  { mode: 'RIG_LASER_HALO',         name: 'Halo Crown',       tier: 'laser', venue: 'arena',     act: 'band', palette: ['#7A3BFF', '#00F0FF', '#FF3FA4'] },
  { mode: 'RIG_LASER_SPECTRUM',     name: 'Mirrorball Blaze',     tier: 'laser', venue: 'arena',     act: 'dj', palette: ['#FF2E63', '#08F7FE', '#FFE600'] },
  { mode: 'RIG_LASER_AURORA',       name: 'Laser Aurora',     tier: 'laser', venue: 'stadium',   act: 'dj', palette: ['#27FF8A', '#00B3FF', '#9D4BFF'] },
  { mode: 'RIG_LASER_STROBE_STORM', name: 'Strobe Storm',     tier: 'laser', venue: 'arena',     act: 'dj', palette: ['#00FFC8', '#FF00A8', '#FFFFFF'] },

  // ── High energy ──
  { mode: 'RIG_HIGH_ARENA_ROCK',    name: 'Arena Rock',       tier: 'high', venue: 'arena',     act: 'band', palette: ['#FF2A1A', '#FFB347', '#3A6BFF'] },
  { mode: 'RIG_HIGH_EDM_DROP',      name: 'Drop Zone',        tier: 'high', venue: 'arena',     act: 'dj', palette: ['#00D9FF', '#FF2BD1', '#6B2BFF'] },
  { mode: 'RIG_HIGH_PYRO',          name: 'Pyro Front',       tier: 'high', venue: 'festival',  act: 'band', palette: ['#FF5A00', '#FFC23A', '#FF1E4A'] },
  { mode: 'RIG_HIGH_SHARPY_FAN',    name: 'Sharpy Fan',       tier: 'high', venue: 'arena',     act: 'band', palette: ['#3A7BFF', '#FF2E8A', '#18FFD1'] },
  { mode: 'RIG_HIGH_STROBE_WALL',   name: 'Strobe Wall',      tier: 'high', venue: 'warehouse', act: 'dj', palette: ['#FF0033', '#FFFFFF', '#2B2BFF'] },
  { mode: 'RIG_HIGH_HEADLINER',     name: 'Headliner',        tier: 'high', venue: 'arena',     act: 'singer', palette: ['#FFB627', '#FFFFFF', '#FF4B2B'] },
  { mode: 'RIG_HIGH_TECHNO',        name: 'Warehouse Techno', tier: 'high', venue: 'warehouse', act: 'dj', palette: ['#FF1A1A', '#FF6A00', '#3B4BFF'] },
  { mode: 'RIG_HIGH_STADIUM',       name: 'Stadium Anthem',   tier: 'high', venue: 'stadium',   act: 'band', palette: ['#2B8BFF', '#FF3B6B', '#FFD24B'] },
  { mode: 'RIG_HIGH_POP_SPECTACLE', name: 'Pop Spectacle',    tier: 'high', venue: 'arena',     act: 'singer', palette: ['#FF3FB4', '#2BE8FF', '#A64BFF'] },
  { mode: 'RIG_HIGH_METAL',         name: 'Metal Fire',       tier: 'high', venue: 'arena',     act: 'band', palette: ['#FF1A0A', '#FF8A00', '#FFFFFF'] },

  // ── Mid tempo ──
  { mode: 'RIG_MID_FESTIVAL_DUSK',  name: 'Festival Dusk',    tier: 'mid', venue: 'festival',  act: 'band', palette: ['#FF7A3D', '#FF3D8B', '#3B5BFF'] },
  { mode: 'RIG_MID_POP_TOUR',       name: 'Pop Tour',         tier: 'mid', venue: 'arena',     act: 'singer', palette: ['#FF4FD8', '#4B8BFF', '#FFC24B'] },
  { mode: 'RIG_MID_GOSPEL_LIFT',    name: 'Gospel Lift',      tier: 'mid', venue: 'arena',     act: 'choir', palette: ['#FFC873', '#4B7BFF', '#FFFFFF'] },
  { mode: 'RIG_MID_VELVET_RNB',     name: 'Velvet R&B',       tier: 'mid', venue: 'club',      act: 'singer', palette: ['#9B2BFF', '#FF2B8A', '#FF8A4B'] },
  { mode: 'RIG_MID_PIXEL_BATTENS',  name: 'Pixel Battens',    tier: 'mid', venue: 'arena',     act: 'band', palette: ['#FF3B3B', '#3BFFB0', '#3B6BFF'] },
  { mode: 'RIG_MID_INDIE_ARENA',    name: 'Indie Arena',      tier: 'mid', venue: 'arena',     act: 'band', palette: ['#FFB060', '#2B5BFF', '#FF6B4B'] },
  { mode: 'RIG_MID_WORSHIP_ARENA',  name: 'Worship Arena',    tier: 'mid', venue: 'arena',     act: 'band', palette: ['#4B8BFF', '#F2E6D0', '#8A4BFF'] },
  { mode: 'RIG_MID_COUNTRY_NIGHT',  name: 'Stadium Night',    tier: 'mid', venue: 'stadium',   act: 'band', palette: ['#FFA84B', '#FF5B2B', '#4B6BFF'] },
  { mode: 'RIG_MID_KINETIC',        name: 'Kinetic Wave',     tier: 'mid', venue: 'arena',     act: 'singer', palette: ['#4BFFE0', '#FF4B9B', '#FFD04B'] },
  { mode: 'RIG_MID_SYNTHWAVE',      name: 'Synthwave Arena',  tier: 'mid', venue: 'arena',     act: 'dj', palette: ['#FF2BD6', '#2BE0FF', '#FF8A2B'] },

  // ── Mellow ──
  { mode: 'RIG_MELLOW_CANDLELIGHT',    name: 'Candlelight Session', tier: 'mellow', venue: 'theatre',   act: 'duo', palette: ['#FFB25B', '#FF7A2B', '#6B4BFF'] },
  { mode: 'RIG_MELLOW_KINETIC_ORBS',   name: 'Kinetic Orbs',        tier: 'mellow', venue: 'arena',     act: 'singer', palette: ['#FFD8A0', '#5B8BFF', '#FF6BB0'] },
  { mode: 'RIG_MELLOW_BOWL_SHELL',     name: 'Bowl Shell',          tier: 'mellow', venue: 'amphitheatre', act: 'band', palette: ['#5B6BFF', '#FF6BB0', '#FFB06B'] },
  { mode: 'RIG_MELLOW_VELVET_THEATER', name: 'Velvet Theatre',      tier: 'mellow', venue: 'theatre',   act: 'singer', palette: ['#FFB870', '#C8102E', '#4B5BFF'] },
  { mode: 'RIG_MELLOW_SLOW_DANCE',     name: 'Slow Dance',          tier: 'mellow', venue: 'arena',     act: 'singer', palette: ['#5B8BFF', '#FF8AD0', '#FFFFFF'] },
  { mode: 'RIG_MELLOW_SEA_OF_LIGHTS',  name: 'Sea of Lights',       tier: 'mellow', venue: 'arena',     act: 'singer', palette: ['#4B7BFF', '#9B6BFF', '#FFE0B0'] },
  { mode: 'RIG_MELLOW_GOBO_FOREST',    name: 'Gobo Forest',         tier: 'mellow', venue: 'arena',     act: 'band', palette: ['#6BFF8A', '#FFB04B', '#2B8B6B'] },
  { mode: 'RIG_MELLOW_UNPLUGGED',      name: 'Unplugged',           tier: 'mellow', venue: 'club',      act: 'duo', palette: ['#FFB060', '#FFDDA0', '#4B6BFF'] },
  { mode: 'RIG_MELLOW_STARLIGHT',      name: 'Candle Vigil',        tier: 'mellow', venue: 'arena',     act: 'choir', palette: ['#FFB45A', '#2E3F8F', '#FFE6C0'] },
  { mode: 'RIG_MELLOW_SUNRISE',        name: 'Sunrise Set',         tier: 'mellow', venue: 'festival',  act: 'dj', palette: ['#FF9A4B', '#FF5B7B', '#5B7BFF'] },
];

export const STAGE_PARAM_LABELS: [string, string, string, string] = ['Beam spread', 'Haze', 'Music response', 'Camera'];

/** The act's id in the shader (PERF). */
export const STAGE_ACT_ID: Record<StageAct, number> = { band: 1, dj: 2, singer: 3, choir: 4, duo: 5 };

/** Ambo's energy scale for each tier (vizEnergy). */
export const STAGE_TIER_ENERGY: Record<StageTier, string> = { laser: 'high', high: 'high', mid: 'medium', mellow: 'calm' };
