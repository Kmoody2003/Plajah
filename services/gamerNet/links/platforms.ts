// Platforms a player can link to the Plajah Gamer Network, and how far each one is. Imports land on the
// ledger as EXTERNAL_IMPORT with source 'linked' (trust 0.6). Details per platform: docs/GAMER_NETWORK.md.

export type LinkState = 'live' | 'planned' | 'partner-only';
export interface LinkablePlatform { id: string; name: string; state: LinkState; proof: string; imports: string }

export const LINKABLE: ReadonlyArray<LinkablePlatform> = [
  { id: 'steam', name: 'Steam', state: 'live', proof: 'Sign in through Steam (OpenID)', imports: 'Playtime and achievements per game (public profile)' },
  { id: 'retroachievements', name: 'RetroAchievements', state: 'planned', proof: 'One-time code placed in your RA profile motto', imports: 'Unlocked achievements and points per game' },
  { id: 'xbox', name: 'Xbox', state: 'partner-only', proof: 'Microsoft account sign-in (needs Xbox partner access)', imports: 'Gamerscore and achievements per title' },
];
