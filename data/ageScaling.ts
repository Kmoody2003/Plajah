// ageScaling.ts — Phase F: one age-scaling design across Academia. A learner's account resolves
// to an AgeBand (mapped to the ISCED stages via GRADES' typical ages), and each band carries a
// small set of presentation tokens so the SAME surfaces feel right PreK → higher-ed:
//   • early  (ISCED 0–1, ~ages 3–8)  — playful, big, rounded, emoji-forward, warm words
//   • middle (ISCED 2,   ~ages 9–13) — the clean standard classroom look
//   • senior (ISCED 3+,  ~ages 14+)  — professional/dense, flows into higher-ed & creator courses
// Teachers and parents always get the professional (senior) chrome regardless of age.

import type { UserProfile } from '../types';

export type AgeBand = 'early' | 'middle' | 'senior';

export interface AgeTokens {
  band: AgeBand;
  label: string;
  /** ISCED stage this band corresponds to (for reporting / trust copy). */
  isced: string;
  heroClass: string;      // tailwind size for the portal H1
  bodyClass: string;      // tailwind size for the portal subline
  radius: string;         // tailwind radius for cards/tiles
  tileEmojiClass: string; // emoji size on tiles
  tapMin: number;         // minimum tap-target px (accessibility grows for young learners)
  accent: string;         // band accent color
  playful: boolean;       // extra rounding / emoji / warmth
  greeting: (name: string) => string;
}

export const AGE_TOKENS: Record<AgeBand, AgeTokens> = {
  early: {
    band: 'early', label: 'Early Learner', isced: 'ISCED 0–1 · Early / Primary',
    heroClass: 'text-4xl sm:text-6xl', bodyClass: 'text-base sm:text-lg', radius: 'rounded-3xl',
    tileEmojiClass: 'text-3xl', tapMin: 56, accent: '#FF8C00', playful: true,
    greeting: (n) => `Hi ${n}! 🌟`,
  },
  middle: {
    band: 'middle', label: 'Learner', isced: 'ISCED 2 · Lower Secondary',
    heroClass: 'text-3xl sm:text-5xl', bodyClass: 'text-sm sm:text-base', radius: 'rounded-2xl',
    tileEmojiClass: 'text-2xl', tapMin: 48, accent: '#3FB98E', playful: false,
    greeting: (n) => `Welcome back, ${n}.`,
  },
  senior: {
    band: 'senior', label: 'Advanced', isced: 'ISCED 3+ · Upper Secondary & Tertiary',
    heroClass: 'text-2xl sm:text-4xl', bodyClass: 'text-sm', radius: 'rounded-xl',
    tileEmojiClass: 'text-xl', tapMin: 44, accent: '#7a2bd6', playful: false,
    greeting: (n) => `Welcome back, ${n}.`,
  },
};

/** Map a whole-years age to a band using the ISCED-aligned grade typical-ages. */
export function ageBandFromAge(age: number): AgeBand {
  if (age <= 8) return 'early';    // Pre-K → Grade 2
  if (age <= 13) return 'middle';  // Grades 3–8
  return 'senior';                 // Grade 9 → higher-ed
}

/**
 * Resolve a profile to its age band. Teachers/parents get the professional chrome; students/children
 * use birthYear when available, else fall back to the neutral middle band.
 */
export function ageBandFor(p?: Partial<UserProfile> | null): AgeBand {
  const t = (p as any)?.accountType;
  if (t === 'TEACHER' || t === 'PARENT') return 'senior';
  const by = (p as any)?.birthYear;
  if (typeof by === 'number' && by > 1900) {
    const age = new Date().getFullYear() - by;
    if (age >= 2 && age <= 120) return ageBandFromAge(age);
  }
  return 'middle';
}

export const ageTokensFor = (p?: Partial<UserProfile> | null): AgeTokens => AGE_TOKENS[ageBandFor(p)];
