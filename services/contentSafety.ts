// contentSafety.ts — the single chokepoint for age-appropriate content. Every surface
// that lists content for a viewer (Feed, Movies, Music, search, …) runs items through
// here. Child accounts get safe-by-default treatment that the child cannot turn off:
// the adult filter is forced ON, mature themes can be auto-hidden, custom blocked words
// are filtered out, per-section access is enforced, and the maturity ceiling is capped.

import type {
  UserProfile,
  ParentalControls,
  MaturityRating,
  BlockedMatureTheme,
  ControllableSurfaceGroup,
  ChildActivityCategory,
} from '../types';

const RANK: Record<MaturityRating, number> = { G: 0, PG: 1, PG13: 2, TEEN: 3, MATURE: 4 };

export const DEFAULT_BLOCKED_THEMES: BlockedMatureTheme[] = [
  'violence',
  'horror',
  'profanity',
  'romance',
  'substances',
  'gambling',
];

/** Parent-facing description of each maturity ceiling (Parental Controls picker). */
export const MATURITY_LABELS: Record<MaturityRating, string> = {
  G: 'All ages — gentle content only',
  PG: 'Kids — mild themes, parental guidance',
  PG13: 'Tweens — some intensity, no explicit content',
  TEEN: 'Teens — mature topics handled responsibly',
  MATURE: 'Adults — no ceiling',
};

export const MATURE_THEME_META: { id: BlockedMatureTheme; label: string; desc: string }[] = [
  { id: 'violence', label: 'Violence', desc: 'Combat, weapons and fighting' },
  { id: 'horror', label: 'Horror', desc: 'Scary content, thrillers and jump-scares' },
  { id: 'profanity', label: 'Strong language', desc: 'Cursing and insults' },
  { id: 'romance', label: 'Romance', desc: 'Dating and suggestive themes' },
  { id: 'substances', label: 'Substances', desc: 'Alcohol, tobacco, drugs and vaping' },
  { id: 'gambling', label: 'Gambling', desc: 'Casino, betting and loot boxes' },
  { id: 'unratedUgc', label: 'Unrated uploads', desc: 'Community uploads nobody has rated yet' },
];

export const CONTROLLABLE_SURFACES_META: { id: ControllableSurfaceGroup; label: string; desc: string }[] = [
  { id: 'GAMES', label: 'Arcade & Games', desc: 'Games and the arcade' },
  { id: 'VIDEOS', label: 'Reello & Videos', desc: 'Short videos and the video hub' },
  { id: 'MOVIES_TV', label: 'Movies & Live TV', desc: 'Taleo movies, shows and channels' },
  { id: 'MUSIC', label: 'Music & Radio', desc: 'Chora music and radio' },
  { id: 'BOOKS', label: 'Books & Comics', desc: 'Lorea books and comics' },
  { id: 'FEED', label: 'Social Feed', desc: 'Feed posts and discussions' },
  { id: 'CHAT', label: 'Messaging', desc: 'Direct messages and live rooms' },
  { id: 'LIVE_HUB', label: 'Live Streams', desc: 'Live streams and events' },
  { id: 'CREATOR', label: 'Creation Studios', desc: 'Studios and creative labs' },
];

/** SHA-256 hex of a guardian passcode — the same digest KidsSessionGuard / KidsModeBar compare against. */
export async function hashPasscode(passcode: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passcode));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Safe defaults applied to a CHILD account (and used as the floor — a child can never
 *  be less restricted than this on adultFilter, regardless of what's stored). */
export const CHILD_DEFAULTS: ParentalControls = {
  adultFilter: true,
  maxMaturity: 'PG',
  hideAdultPosts: true,
  autoHideMatureThemes: true,
  blockedThemes: [...DEFAULT_BLOCKED_THEMES],
  profanityFilter: true,
  blockedWords: [],
  blockedSurfaces: [],
  categoryLimitsMins: {
    games: 45,
    videos: 45,
    movies: 60,
    social: 30,
    music: 0,
    learning: 0,
  },
  schoolHoursLearningOnly: false,
  kidsMode: true,
};
/** Name the Family / Parent Hub flows use when seeding a new child's controls. */
export const DEFAULT_CHILD_CONTROLS = CHILD_DEFAULTS;

/** Defaults for a normal adult account (no restrictions). */
export const ADULT_DEFAULTS: ParentalControls = {
  adultFilter: false,
  maxMaturity: 'MATURE',
  hideAdultPosts: false,
  autoHideMatureThemes: false,
  blockedThemes: [],
  profanityFilter: false,
  blockedWords: [],
  blockedSurfaces: [],
  categoryLimitsMins: {},
  schoolHoursLearningOnly: false,
  kidsMode: false,
};

export function isChildAccount(p?: UserProfile | null): boolean {
  return !!(p && (p.isChild || p.accountType === 'CHILD'));
}

/**
 * The EFFECTIVE controls for a viewer. For a child we start from their guardian's saved
 * controls but clamp every dimension to be at least as strict as CHILD_DEFAULTS on
 * core adult safety — so a stale/looser stored value (or tampering) can never expose a
 * child to 18+/adult content.
 */
export function resolveControls(p?: UserProfile | null): ParentalControls {
  if (!p) return { ...ADULT_DEFAULTS };
  const stored = p.parentalControls;
  if (isChildAccount(p)) {
    return {
      ...CHILD_DEFAULTS,
      ...stored,
      adultFilter: true, // forced for child accounts
      hideAdultPosts: stored?.hideAdultPosts !== false,
      autoHideMatureThemes: stored?.autoHideMatureThemes !== false,
      blockedThemes: Array.isArray(stored?.blockedThemes)
        ? stored!.blockedThemes
        : [...DEFAULT_BLOCKED_THEMES],
      profanityFilter: stored?.profanityFilter !== false,
      blockedWords: Array.isArray(stored?.blockedWords) ? stored!.blockedWords : [],
      blockedSurfaces: Array.isArray(stored?.blockedSurfaces) ? stored!.blockedSurfaces : [],
      categoryLimitsMins: {
        ...CHILD_DEFAULTS.categoryLimitsMins,
        ...(stored?.categoryLimitsMins || {}),
      },
      // maturity can be loosened by the guardian, but never above TEEN for a child
      maxMaturity: clampMaturity(stored?.maxMaturity ?? 'PG', 'TEEN'),
      kidsMode: stored?.kidsMode !== false,
    };
  }
  return {
    ...ADULT_DEFAULTS,
    ...stored,
    blockedThemes: Array.isArray(stored?.blockedThemes) ? stored!.blockedThemes : [],
    blockedWords: Array.isArray(stored?.blockedWords) ? stored!.blockedWords : [],
    blockedSurfaces: Array.isArray(stored?.blockedSurfaces) ? stored!.blockedSurfaces : [],
    categoryLimitsMins: stored?.categoryLimitsMins || {},
  };
}

function clampMaturity(want: MaturityRating, ceiling: MaturityRating): MaturityRating {
  return RANK[want] > RANK[ceiling] ? ceiling : want;
}

const BUILTIN_PROFANITY = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'whore', 'slut',
  'motherfucker', 'bullshit', 'cock', 'nsfw', 'porn', 'xxx', 'onlyfans', 'stripper',
];

const THEME_PATTERNS: Record<BlockedMatureTheme, RegExp> = {
  violence: /\b(gore|gory|bloodbath|decapitat|mutilat|torture|massacre|shootout|gunfight|chainsaw|slasher|brutal\s+kill|execution)\b/i,
  horror: /\b(horror|terrifying|nightmare|demonic|exorcism|haunted|poltergeist|paranormal|jumpscare|creepypasta|slasher|zombie\s+apocalypse)\b/i,
  profanity: /\b(fuck|shit|bitch|asshole|motherfucker|cunt|whore|slut|uncensored|explicit\s+lyrics)\b/i,
  romance: /\b(steamy|erotic|seduct|sensual|affair|hookup|one\s+night\s+stand|lingerie|boudoir|nsfw)\b/i,
  substances: /\b(cocaine|heroin|meth|fentanyl|weed|marijuana|cannabis|stoner|drunk|wasted|bong|vape|vaping|alcoholism|overdose)\b/i,
  gambling: /\b(casino|blackjack|roulette|sportsbook|parlay|slot\s+machine|poker\s+stakes|betting\s+odds|lootbox)\b/i,
  unratedUgc: /\b(unrated|18\+|adults\s+only|mature\s+audiences)\b/i,
};

function extractItemText(item: any): string {
  if (!item) return '';
  if (typeof item === 'string') return item;
  const parts: string[] = [];
  for (const k of [
    'title', 'name', 'text', 'content', 'caption', 'description',
    'subtitle', 'summary', 'genre', 'category', 'mood',
  ]) {
    if (typeof item[k] === 'string' && item[k]) parts.push(item[k]);
  }
  if (Array.isArray(item.tags)) {
    parts.push(item.tags.filter((t: any) => typeof t === 'string').join(' '));
  }
  if (Array.isArray(item.genres)) {
    parts.push(item.genres.filter((t: any) => typeof t === 'string').join(' '));
  }
  if (Array.isArray(item.themes)) {
    parts.push(item.themes.filter((t: any) => typeof t === 'string').join(' '));
  }
  return parts.join(' ').toLowerCase();
}

/** Check whether an item or text contains any guardian-blocked word or profanity. */
export function containsBlockedWords(itemOrText: any, viewer?: UserProfile | null): boolean {
  const c = resolveControls(viewer);
  const customWords = (c.blockedWords || [])
    .map(w => String(w || '').trim().toLowerCase())
    .filter(Boolean);
  if (!c.profanityFilter && customWords.length === 0) return false;

  const haystack = extractItemText(itemOrText);
  if (!haystack) return false;

  if (c.profanityFilter) {
    for (const w of BUILTIN_PROFANITY) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(haystack)) return true;
    }
  }

  for (const w of customWords) {
    if (w.includes(' ')) {
      if (haystack.includes(w)) return true;
    } else {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(haystack) || haystack.includes(w)) return true;
    }
  }
  return false;
}

/** Check whether an item matches any mature theme the guardian has chosen to auto-hide. */
export function matchesBlockedTheme(item: any, viewer?: UserProfile | null): boolean {
  if (!item) return false;
  const c = resolveControls(viewer);
  if (!c.autoHideMatureThemes) return false;
  const themes = c.blockedThemes || [];
  if (themes.length === 0) return false;

  const haystack = extractItemText(item);
  for (const theme of themes) {
    if (theme === 'unratedUgc') {
      const hasRating = Boolean(item.maturity || item.maturityRating || item.contentRating || item.rating || item.isEduPost);
      if (!hasRating && item.authorId && !item.isEduPost && c.maxMaturity === 'G') {
        return true;
      }
    }
    const pat = THEME_PATTERNS[theme];
    if (pat && haystack && pat.test(haystack)) return true;
  }
  return false;
}

/** Infer an item's maturity from whatever flags it carries. Conservative: any adult
 *  signal lifts it to MATURE so the filter catches legacy/untagged-but-flagged items. */
export function getItemMaturity(item: any): MaturityRating {
  if (!item) return 'G';
  if (item.isAdult || item.isNSFW || item.nsfw || item.isExplicit || item.explicit) return 'MATURE';
  const r = String(item.maturity || item.maturityRating || item.contentRating || item.rating || '').toUpperCase();
  if (['MATURE', 'M', 'R', 'NC-17', 'X', '18', '18+'].some(x => r === x)) return 'MATURE';
  if (['TEEN', 'T', 'MA', 'TV-MA'].some(x => r === x)) return 'TEEN';
  if (['PG13', 'PG-13', 'TV-14', '13', '13+'].some(x => r === x)) return 'PG13';
  if (['PG', 'TV-PG', 'TV-Y7', '7+'].some(x => r === x)) return 'PG';
  if (['G', 'TV-Y', 'TV-G', 'E', 'ALL'].some(x => r === x)) return 'G';
  // ageRestriction like "18+", "16+", "13+"
  const age = parseInt(String(item.ageRestriction || '').replace(/\D/g, ''), 10);
  if (!isNaN(age)) { if (age >= 17) return 'MATURE'; if (age >= 13) return 'PG13'; if (age >= 7) return 'PG'; }
  return 'G';
}

/** Does the item carry an explicit "adult" signal (independent of the numeric ceiling)? */
export function isAdultContent(item: any): boolean {
  return !!(item && (item.isAdult || item.isNSFW || item.nsfw || item.isExplicit || item.explicit));
}

/** Is this single item allowed for this viewer? */
export function isContentAllowed(item: any, viewer?: UserProfile | null): boolean {
  const c = resolveControls(viewer);
  if (c.adultFilter && isAdultContent(item)) return false;
  if (RANK[getItemMaturity(item)] > RANK[c.maxMaturity]) return false;
  if (matchesBlockedTheme(item, viewer)) return false;
  if (containsBlockedWords(item, viewer)) return false;
  return true;
}

/** Filter a list of items for a viewer (the primary API surfaces call). */
export function filterForViewer<T>(items: T[], viewer?: UserProfile | null): T[] {
  const c = resolveControls(viewer);
  const hasWordOrThemeFilters =
    c.profanityFilter ||
    (c.blockedWords && c.blockedWords.length > 0) ||
    (c.autoHideMatureThemes && c.blockedThemes && c.blockedThemes.length > 0);
  if (!c.adultFilter && c.maxMaturity === 'MATURE' && !hasWordOrThemeFilters) return items;
  return items.filter(it => isContentAllowed(it, viewer));
}

/** Filter social posts (respects hideAdultPosts, maturity, blocked themes, and blocked words). */
export function filterPostsForViewer<T>(posts: T[], viewer?: UserProfile | null): T[] {
  const c = resolveControls(viewer);
  const hasWordOrThemeFilters =
    c.profanityFilter ||
    (c.blockedWords && c.blockedWords.length > 0) ||
    (c.autoHideMatureThemes && c.blockedThemes && c.blockedThemes.length > 0);
  if (!c.hideAdultPosts && !c.adultFilter && c.maxMaturity === 'MATURE' && !hasWordOrThemeFilters) return posts;
  return posts.filter(p => {
    if (c.hideAdultPosts && isAdultContent(p)) return false;
    return isContentAllowed(p, viewer);
  });
}

/** True if the viewer should see the kids-mode skin. */
export function isKidsMode(viewer?: UserProfile | null): boolean {
  return resolveControls(viewer).kidsMode === true;
}

/** Map an AppView to its activity/allowance category. */
export function categoryForView(view?: string | null): ChildActivityCategory {
  const v = String(view || '').toUpperCase();
  if (
    v.includes('ACADEMIA') ||
    v.includes('SCHOOL') ||
    v.includes('CLASSROOM') ||
    v.includes('STUDENT') ||
    v.includes('LEARN') ||
    v.includes('VOCA') ||
    v.includes('HANDWRITING') ||
    v.includes('READING') ||
    v.includes('LANGUAGE') ||
    v.includes('HISTORY') ||
    v.includes('CIVICS') ||
    v.includes('BOOK') ||
    v.includes('KIDS_LIBRARY') ||
    v.includes('COMIC') ||
    v === 'ORA'
  ) {
    return 'learning';
  }
  if (v.includes('GAME') || v === 'PLAJAH_FSE' || v === 'WORLDS') return 'games';
  if (v === 'VIDEOS' || v === 'RELLO' || v === 'LIVE_HUB' || v === 'LIVE_TV') return 'videos';
  if (v === 'MOVIES_TV' || v === 'MOVIE_UX') return 'movies';
  if (v === 'FEED' || v === 'EDU_SOCIAL' || v === 'CHAT' || v === 'CLUBS' || v === 'PEOPLE') return 'social';
  if (v === 'MUSIC' || v === 'PLAYER' || v === 'RADIO' || v.includes('PODCAST')) return 'music';
  return 'other';
}

/** Map an AppView to a controllable surface group for section-level moderation. */
export function surfaceGroupForView(view?: string | null): ControllableSurfaceGroup | null {
  const v = String(view || '').toUpperCase();
  if (v === 'BOOKS' || v === 'BOOK_READER' || v === 'KIDS_LIBRARY' || v === 'COMIC_MUSEUM') return 'BOOKS';
  if (v === 'MUSIC' || v === 'PLAYER' || v === 'RADIO' || v.includes('PODCAST')) return 'MUSIC';
  if (v === 'MOVIES_TV' || v === 'MOVIE_UX') return 'MOVIES_TV';
  if (v === 'VIDEOS' || v === 'RELLO') return 'VIDEOS';
  if (v === 'GAMES' || v === 'GAME_PLAYER' || v === 'PLAJAH_FSE' || v === 'WORLDS') return 'GAMES';
  if (v === 'FEED' || v === 'EDU_SOCIAL') return 'FEED';
  if (v === 'CHAT') return 'CHAT';
  if (v === 'LIVE_HUB' || v === 'LIVE_TV') return 'LIVE_HUB';
  if (v === 'TELA' || v === 'MELOS' || v === 'MELOS_BEATS' || v === 'AVATAR_STUDIO' || v === 'BOOK_STUDIO') return 'LABS';
  return null;
}

/** Check if the child is allowed to open a given AppView right now. */
export function isSurfaceAllowedForChild(
  view: string,
  viewer?: UserProfile | null
): { allowed: boolean; reason?: 'blocked_surface' | 'school_hours'; label?: string } {
  if (!isChildAccount(viewer)) return { allowed: true };
  const c = resolveControls(viewer);

  // School-hours focus mode: Mon-Fri 8:00–15:00 local time only learning views are open
  if (c.schoolHoursLearningOnly) {
    const now = new Date();
    const day = now.getDay(); // 1..5 = Mon..Fri
    const hr = now.getHours();
    if (day >= 1 && day <= 5 && hr >= 8 && hr < 15) {
      const cat = categoryForView(view);
      if (cat !== 'learning') {
        return {
          allowed: false,
          reason: 'school_hours',
          label: 'School-Hours Focus Mode is active (8 AM – 3 PM)',
        };
      }
    }
  }

  const group = surfaceGroupForView(view);
  if (group && (c.blockedSurfaces || []).includes(group)) {
    const NAMES: Record<ControllableSurfaceGroup, string> = {
      BOOKS: 'Lorea Books & Comics',
      MUSIC: 'Chora Music & Audio',
      MOVIES_TV: 'Cinema · Movies & TV',
      VIDEOS: 'Reello Videos',
      GAMES: 'Games & Arcade',
      FEED: 'Social Feed',
      CHAT: 'Messages & Chat',
      LIVE_HUB: 'Live TV & Streams',
      LABS: 'Creation Studios & Labs',
    };
    return {
      allowed: false,
      reason: 'blocked_surface',
      label: NAMES[group] || group,
    };
  }

  return { allowed: true };
}
