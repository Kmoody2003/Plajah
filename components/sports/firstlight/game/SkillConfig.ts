import { PlayStyleMode, SkillLevel } from '../types';

export interface GameplayTuning {
  skillLevel: SkillLevel;
  playStyle: PlayStyleMode;
  label: string;
  tagline: string;
  pocketTime: number;
  passRushShedScale: number;
  dbReactionScale: number;
  defenderSpeedScale: number;
  openSeparationYards: number;
  catchRadius: number;
  interceptRadius: number;
  tackleRadius: number;
  tackleBreakBase: number;
  speedMultiplier: number;
  throwVelocityScale: number;
  jukeCooldown: number;
  jukeDuration: number;
  bigHitFumbleChance: number;
  kickNeedleSpeed: number;
  cpuOffenseAccuracy: number;
  autoCoachTips: boolean;
  showSeparationRings: boolean;
}

const BASE_BY_SKILL: Record<SkillLevel, Omit<GameplayTuning, 'playStyle' | 'speedMultiplier' | 'throwVelocityScale' | 'bigHitFumbleChance'>> = {
  ROOKIE: {
    skillLevel: 'ROOKIE',
    label: 'Rookie',
    tagline: 'Newcomer friendly · Wide passing windows, slower rush & Coach Picks',
    pocketTime: 8.5,
    passRushShedScale: 0.62,
    dbReactionScale: 0.78,
    defenderSpeedScale: 0.86,
    openSeparationYards: 1.35,
    catchRadius: 2.25,
    interceptRadius: 0.45,
    tackleRadius: 1.05,
    tackleBreakBase: 0.34,
    jukeCooldown: 0.75,
    jukeDuration: 0.7,
    kickNeedleSpeed: 0.8,
    cpuOffenseAccuracy: 0.62,
    autoCoachTips: true,
    showSeparationRings: true,
  },
  PRO: {
    skillLevel: 'PRO',
    label: 'Pro',
    tagline: 'Balanced authentic gridiron · Fair blocking & realistic coverage',
    pocketTime: 6.2,
    passRushShedScale: 0.95,
    dbReactionScale: 0.98,
    defenderSpeedScale: 0.97,
    openSeparationYards: 1.65,
    catchRadius: 1.85,
    interceptRadius: 0.8,
    tackleRadius: 1.15,
    tackleBreakBase: 0.18,
    jukeCooldown: 0.9,
    jukeDuration: 0.6,
    kickNeedleSpeed: 1.2,
    cpuOffenseAccuracy: 0.74,
    autoCoachTips: true,
    showSeparationRings: true,
  },
  ALL_PRO: {
    skillLevel: 'ALL_PRO',
    label: 'All-Pro',
    tagline: 'Madden-tier challenge · Tight windows, ball-hawking DBs & sharp rush',
    pocketTime: 4.8,
    passRushShedScale: 1.22,
    dbReactionScale: 1.12,
    defenderSpeedScale: 1.04,
    openSeparationYards: 1.95,
    catchRadius: 1.65,
    interceptRadius: 1.0,
    tackleRadius: 1.22,
    tackleBreakBase: 0.11,
    jukeCooldown: 1.05,
    jukeDuration: 0.55,
    kickNeedleSpeed: 1.6,
    cpuOffenseAccuracy: 0.84,
    autoCoachTips: false,
    showSeparationRings: true,
  },
  LEGEND: {
    skillLevel: 'LEGEND',
    label: 'Elohim Legend',
    tagline: 'Master tier · Relentless blitzes, elite secondary & tight timing',
    pocketTime: 4.0,
    passRushShedScale: 1.45,
    dbReactionScale: 1.24,
    defenderSpeedScale: 1.1,
    openSeparationYards: 2.2,
    catchRadius: 1.5,
    interceptRadius: 1.15,
    tackleRadius: 1.28,
    tackleBreakBase: 0.06,
    jukeCooldown: 1.15,
    jukeDuration: 0.5,
    kickNeedleSpeed: 2.0,
    cpuOffenseAccuracy: 0.92,
    autoCoachTips: false,
    showSeparationRings: false,
  },
};

export function getGameplayTuning(skill: SkillLevel, playStyle: PlayStyleMode): GameplayTuning {
  const base = BASE_BY_SKILL[skill] || BASE_BY_SKILL.PRO;
  if (playStyle === 'ARCADE') {
    return {
      ...base,
      playStyle,
      pocketTime: base.pocketTime + 1.4,
      passRushShedScale: base.passRushShedScale * 0.88,
      catchRadius: base.catchRadius + 0.35,
      tackleBreakBase: Math.min(0.55, base.tackleBreakBase + 0.22),
      speedMultiplier: 1.24,
      throwVelocityScale: 1.22,
      jukeCooldown: Math.max(0.45, base.jukeCooldown * 0.7),
      jukeDuration: base.jukeDuration + 0.15,
      bigHitFumbleChance: 0.18,
      showSeparationRings: true,
    };
  }
  return {
    ...base,
    playStyle,
    speedMultiplier: 1.0,
    throwVelocityScale: 1.0,
    bigHitFumbleChance: 0.06,
  };
}
