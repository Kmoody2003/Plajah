// useKidsMode — derives the kids-mode state + a safe theme from the current profile.
// The foundation for re-skinning the whole Plajah experience for a child: components
// read `kidsMode` to hide adult surfaces and `theme` to apply the friendlier look.
// Pure (derives from the passed profile) so it needs no provider wired at the app root.

import { useMemo } from 'react';
import type { UserProfile } from '../types';
import { resolveControls, isChildAccount } from '../services/contentSafety';

export interface KidsTheme {
  accent: string;
  accent2: string;
  bg: string;
  surface: string;
  text: string;
  radius: number;       // friendlier, rounder
  fontScale: number;    // slightly larger type for early readers
}

export const KIDS_THEME: KidsTheme = {
  accent: '#FF8C00', accent2: '#36c5f0', bg: '#0e1430', surface: '#16204a',
  text: '#ffffff', radius: 22, fontScale: 1.08,
};

// Surfaces a child can reach by default in Kids Mode. Anything not here is hidden from
// the kid's navigation (guardians can extend via parentalControls.allowedSurfaces).
export const KIDS_DEFAULT_SURFACES = [
  'BOOKS', 'BOOK_READER',      // Lorea reading library + learn-to-read tools
  'CLASSROOMS', 'CLASSROOM_DETAIL',
  'GAMES', 'GAME_PLAYER',
  'MUSIC',                      // filtered to non-explicit
  'MOVIES_TV', 'MOVIE_UX',      // filtered by maturity
  'PLAJAH_LABS',                // science modules
  'USER_PROFILE', 'DASHBOARD',
];

export interface KidsModeState {
  kidsMode: boolean;
  isChild: boolean;
  theme: KidsTheme;
  allowedSurfaces: string[];
  /** Whether a given AppView id is reachable for this viewer. Non-kids → always true. */
  canOpen: (view: string) => boolean;
}

export function useKidsMode(profile?: UserProfile | null): KidsModeState {
  return useMemo(() => {
    const controls = resolveControls(profile);
    const kidsMode = !!controls.kidsMode && isChildAccount(profile);
    const allowed = (controls.allowedSurfaces && controls.allowedSurfaces.length)
      ? controls.allowedSurfaces
      : KIDS_DEFAULT_SURFACES;
    return {
      kidsMode,
      isChild: isChildAccount(profile),
      theme: KIDS_THEME,
      allowedSurfaces: allowed,
      canOpen: (view: string) => !kidsMode || allowed.includes(view),
    };
  }, [profile]);
}
