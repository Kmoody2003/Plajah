import { ArcadeState, MatchBoxScore, TeamBoxStats } from '../types';

export function createEmptyTeamStats(): TeamBoxStats {
  return {
    passingYards: 0,
    completions: 0,
    attempts: 0,
    passingTDs: 0,
    interceptions: 0,
    rushingYards: 0,
    rushAttempts: 0,
    rushingTDs: 0,
    sacks: 0,
    firstDowns: 0,
    bigHits: 0,
    fumblesLost: 0,
    fgMade: 0,
    fgAttempts: 0,
  };
}

export function createEmptyBoxScore(): MatchBoxScore {
  return {
    user: createEmptyTeamStats(),
    cpu: createEmptyTeamStats(),
  };
}

export function createInitialArcadeState(): ArcadeState {
  return {
    streakCount: 0,
    heatLevel: 0,
    fireTimeRemaining: 0,
    turbo: 100,
    stylePoints: 0,
    comboMultiplier: 1,
    calloutText: null,
    calloutColor: '#ff8c00',
  };
}

export function formatGameClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDownLabel(down: 1 | 2 | 3 | 4, yardsToGo: number, ballYardLine: number): string {
  const ord = ['1ST', '2ND', '3RD', '4TH'][down - 1] || '1ST';
  const toGo = ballYardLine + yardsToGo >= 100 ? 'GOAL' : `${yardsToGo}`;
  return `${ord} & ${toGo}`;
}

export function formatYardSpot(ballYardLine: number, offenseAbbr = 'OWN', defenseAbbr = 'OPP'): string {
  const clamped = Math.max(1, Math.min(99, Math.round(ballYardLine)));
  if (clamped === 50) return '50 YD LINE';
  if (clamped < 50) return `${offenseAbbr} ${clamped}`;
  return `${defenseAbbr} ${100 - clamped}`;
}

export type ArcadeEventKind =
  | 'COMPLETION'
  | 'FIRST_DOWN'
  | 'BIG_PLAY'
  | 'TOUCHDOWN'
  | 'BROKEN_TACKLE'
  | 'BIG_HIT'
  | 'DEF_TAKEAWAY'
  | 'COOL_DOWN';

export function applyArcadeEvent(state: ArcadeState, event: ArcadeEventKind): { next: ArcadeState; ignitedFire: boolean } {
  const next: ArcadeState = { ...state };
  let ignitedFire = false;

  if (event === 'COOL_DOWN') {
    next.streakCount = 0;
    next.heatLevel = 0;
    next.fireTimeRemaining = 0;
    next.comboMultiplier = 1;
    next.calloutText = null;
    return { next, ignitedFire: false };
  }

  const prevHeat = next.heatLevel;
  const streakGain =
    event === 'TOUCHDOWN' || event === 'DEF_TAKEAWAY'
      ? 2
      : event === 'BIG_PLAY' || event === 'BIG_HIT'
      ? 1
      : 1;

  next.streakCount += streakGain;

  const pointsMap: Record<Exclude<ArcadeEventKind, 'COOL_DOWN'>, number> = {
    COMPLETION: 150,
    FIRST_DOWN: 250,
    BROKEN_TACKLE: 300,
    BIG_PLAY: 500,
    BIG_HIT: 450,
    DEF_TAKEAWAY: 750,
    TOUCHDOWN: 1000,
  };

  if (next.streakCount >= 3) {
    next.heatLevel = 2;
    next.fireTimeRemaining = Math.max(next.fireTimeRemaining, 35);
    next.comboMultiplier = Math.min(4, 2 + Math.floor((next.streakCount - 3) / 2));
    if (prevHeat < 2) {
      ignitedFire = true;
      next.calloutText = "HE'S ON FIRE!!";
      next.calloutColor = '#ff5500';
    } else if (event === 'TOUCHDOWN') {
      next.calloutText = 'BOOM-SHAKA-LAKA! TD!';
      next.calloutColor = '#ffbf00';
    } else if (event === 'BIG_HIT') {
      next.calloutText = 'WELCOME TO THE BOOM ROOM!';
      next.calloutColor = '#00daf3';
    } else if (event === 'BROKEN_TACKLE') {
      next.calloutText = 'ANKLE BREAKER!!';
      next.calloutColor = '#f472b6';
    } else {
      next.calloutText = `ON FIRE · ${next.comboMultiplier}X COMBO!`;
      next.calloutColor = '#ff6b00';
    }
  } else if (next.streakCount >= 2) {
    next.heatLevel = 1;
    next.comboMultiplier = 2;
    next.calloutText = "HE'S HEATING UP!";
    next.calloutColor = '#fbbf24';
  } else {
    next.heatLevel = 0;
    next.comboMultiplier = 1;
    if (event === 'BROKEN_TACKLE') {
      next.calloutText = 'SHATTERED TACKLE!';
      next.calloutColor = '#38bdf8';
    } else if (event === 'BIG_HIT') {
      next.calloutText = 'CRUSHING HIT!';
      next.calloutColor = '#ef4444';
    } else if (event === 'BIG_PLAY') {
      next.calloutText = 'FROM DOWNTOWN!';
      next.calloutColor = '#a855f7';
    }
  }

  next.stylePoints += pointsMap[event] * next.comboMultiplier;
  next.turbo = Math.min(100, next.turbo + 25);

  return { next, ignitedFire };
}
