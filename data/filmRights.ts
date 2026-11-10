// ─────────────────────────────────────────────────────────────────────────────
// filmRights — what we know about the rights of each film in the curated vault,
// keyed by the catalog identifier in services/archiveContentService.ts.
//
// The rules live in services/publicDomainRights.ts (assessFilm,
// filmReleaseClearance). This file only carries the facts the rules cannot work
// out from a release year: where the film is from, how a US film lost its
// copyright early, and what inside it (music, a source novel, a character on
// the cover) is still owned by someone else.
//
// Films released in or before the current US cutoff (1930 in 2026) need no
// entry unless they carry a hazard — the year alone frees them. Every later
// film MUST have an entry; tests/filmRights.test.ts fails otherwise, so a new
// shelf cannot quietly claim public domain status for a 1950s title.
//
// Lapse facts are from general film-history knowledge, not a search of the
// Copyright Office renewal records. Anything marked needsCheck, and any title
// headed for a pressed disc, should be confirmed against those records first.
// ─────────────────────────────────────────────────────────────────────────────

import {
  filmReleaseClearance,
  parseYear,
  type FilmClearance,
  type FilmFacts,
} from '../services/publicDomainRights';

const US_LAPSED_NOTICE: FilmFacts = { country: 'US', lapse: 'NO_NOTICE' };
const US_LAPSED_RENEWAL: FilmFacts = { country: 'US', lapse: 'NOT_RENEWED' };
const US_GOVERNMENT: FilmFacts = { country: 'US', lapse: 'US_GOVERNMENT' };
const SOME_EPISODES = 'Only some episodes or shorts in this set lapsed; check each one against the renewal records.';

export const FILM_RIGHTS: Record<string, FilmFacts> = {
  // ── Halloween / horror ────────────────────────────────────────────────────
  'Night.Of.The.Living.Dead_1080p': US_LAPSED_NOTICE,
  house_on_haunted_hill_ipod: US_LAPSED_RENEWAL,
  CarnivalofSouls: {
    ...US_LAPSED_NOTICE,
    hazards: [{ kind: 'RESTORATION', what: "Criterion's restoration — master from an archive print, not their disc" }],
  },
  Horror_Express: {
    country: 'ES',
    lapse: 'NO_NOTICE',
    needsCheck: 'US prints carried no notice, but as a Spanish–British film its copyright was probably restored in 1996; it is widely sold as public domain and also licensed (Severin).',
  },
  white_zombie: US_LAPSED_RENEWAL,
  TheTerror1963: US_LAPSED_NOTICE,
  TheGhoul: { country: 'UK', needsCheck: 'British (Gaumont) film; whether its copyright was restored in 1996 and who holds it is not recorded.' },

  // ── Korea (KOFA) ──────────────────────────────────────────────────────────
  'kofa-the-housemaid-1960': { country: 'KR' },
  'kofa-aimless-bullet-1961': { country: 'KR' },
  'kofa-madame-freedom-1956': { country: 'KR' },
  'kofa-sweet-dream-1936': { country: 'KR' },
  'kofa-flower-in-hell-1958': { country: 'KR' },
  'kofa-the-coachman-1961': { country: 'KR' },

  // ── Europeana ─────────────────────────────────────────────────────────────
  'europeana-polygoon-newsreel-1931': { country: 'NL' },

  // ── International ─────────────────────────────────────────────────────────
  'intl-rashomon-1950': { country: 'JP' },
  'intl-tokyo-story-1953': { country: 'JP' },
  'intl-i-was-born-but-1932': { country: 'JP' }, // the entry is Good Morning (1959) despite its id
  'intl-ugetsu-1953': { country: 'JP' },
  'intl-vampyr-1932': { country: 'FR' },
  'intl-goddess-1934': { country: 'CN' },
  'intl-street-angel-1937': { country: 'CN' },
  'intl-spring-small-town-1948': { country: 'CN' },
  'intl-princess-iron-fan-1941': { country: 'CN' },

  // ── US classics ───────────────────────────────────────────────────────────
  'ia-charade-1963': {
    ...US_LAPSED_NOTICE,
    hazards: [{ kind: 'MUSIC', what: "Henry Mancini's score and title song", publishedYear: 1963 }],
  },
  'ia-his-girl-friday-1940': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'UNDERLYING_WORK', what: 'Hecht & MacArthur, The Front Page (1928 play)', publishedYear: 1928 }],
  },
  'us-detour-1945': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'UNDERLYING_WORK', what: 'Martin Goldsmith, Detour (1939 novel)', publishedYear: 1939 }],
  },
  'us-doa-1949': US_LAPSED_RENEWAL,
  'us-stranger-1946': US_LAPSED_RENEWAL,
  'us-hitch-hiker-1953': US_LAPSED_RENEWAL,
  'us-39-steps-1935': { country: 'UK' },
  'us-lady-vanishes-1938': { country: 'UK' },
  'us-jamaica-inn-1939': { country: 'UK' },
  'us-last-man-on-earth-1964': {
    ...US_LAPSED_NOTICE,
    hazards: [{ kind: 'UNDERLYING_WORK', what: 'Richard Matheson, I Am Legend (1954 novel)', publishedYear: 1954 }],
  },
  'us-dementia-13-1963': US_LAPSED_NOTICE,
  'us-plan-9-1957': US_LAPSED_RENEWAL,
  'us-brain-wouldnt-die-1962': US_LAPSED_RENEWAL,
  'us-indestructible-man-1956': US_LAPSED_RENEWAL,
  'us-most-dangerous-game-1932': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'UNDERLYING_WORK', what: 'Richard Connell, The Most Dangerous Game (1924 story)', publishedYear: 1924 }],
  },
  'us-meet-john-doe-1941': US_LAPSED_RENEWAL,
  'us-my-man-godfrey-1936': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'UNDERLYING_WORK', what: 'Eric Hatch, 1101 Park Avenue (1935 novel)', publishedYear: 1935 }],
  },

  // ── Director vault ────────────────────────────────────────────────────────
  'lang-m-1931': { country: 'DE' },
  'lang-scarlet-street-1945': US_LAPSED_RENEWAL,
  'murnau-tabu-1931': { country: 'US' },
  'corman-bucket-of-blood-1959': US_LAPSED_RENEWAL,
  'corman-little-shop-1960': US_LAPSED_RENEWAL,
  'halperin-revolt-of-zombies-1936': US_LAPSED_RENEWAL,
  'halperin-supernatural-1933': { country: 'US', needsCheck: 'Paramount title now in the Universal library; renewal not confirmed.' },
  'vertov-enthusiasm-1931': { country: 'SU' },
  'harvey-shake-hands-danger-1980': { country: 'US', needsCheck: 'Industrial safety film; notice and registration not checked.' },

  // ── Public-domain TV and serials ──────────────────────────────────────────
  'tv-the-veil-1958': US_LAPSED_RENEWAL,
  'tv-thriller-karloff': { country: 'US', needsCheck: 'Revue/Universal series; treat as protected unless a given episode lapsed.' },
  'tv-colonel-march': { country: 'UK', needsCheck: 'British series; restoration in 1996 and current owner not recorded.' },
  'tv-sherlock-holmes-1954': US_LAPSED_RENEWAL,
  'tv-tales-of-tomorrow': US_LAPSED_RENEWAL,
  'tv-flash-gordon-1954': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'TRADEMARK', what: 'Flash Gordon name and character (King Features)' }],
  },
  'tv-superman-fleischer': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'TRADEMARK', what: 'Superman name, logo and S-shield (DC)' }],
  },
  'tv-dragnet': { country: 'US', lapse: 'NOT_RENEWED', needsCheck: SOME_EPISODES },
  'tv-beverly-hillbillies': {
    country: 'US', lapse: 'NOT_RENEWED', needsCheck: SOME_EPISODES,
    hazards: [{ kind: 'MUSIC', what: 'theme song "The Ballad of Jed Clampett"', publishedYear: 1962 }],
  },
  'tv-bonanza': {
    country: 'US', lapse: 'NOT_RENEWED', needsCheck: SOME_EPISODES,
    hazards: [{ kind: 'MUSIC', what: 'Livingston & Evans "Bonanza" theme', publishedYear: 1959 }],
  },
  'tv-phantom-creeps-1939': US_LAPSED_RENEWAL,
  'tv-phantom-empire-1935': US_LAPSED_RENEWAL,
  'tv-anime-nfaj-pioneers': { country: 'JP', needsCheck: 'Anthology spans 1917–1943; shorts from 1931 on need their own check.' },
  'tv-anime-8th-man-1963': { country: 'JP' },
  'tv-betty-boop-fleischer': {
    country: 'US', lapse: 'NOT_RENEWED', needsCheck: SOME_EPISODES,
    hazards: [{ kind: 'TRADEMARK', what: 'Betty Boop name and character (Fleischer Studios)' }],
  },
  'tv-popeye-technicolor-specials': {
    ...US_LAPSED_RENEWAL,
    hazards: [{ kind: 'TRADEMARK', what: 'Popeye name and character (King Features)' }],
  },
  'tv-golden-age-toons': {
    country: 'US', lapse: 'NOT_RENEWED', needsCheck: SOME_EPISODES,
    hazards: [{ kind: 'TRADEMARK', what: 'Bugs Bunny, Woody Woodpecker and Casper names and characters' }],
  },

  // ── Anime and animation ───────────────────────────────────────────────────
  'anime-haru-no-uta-1931': { country: 'JP' },
  'anime-chagama-ondo-1935': { country: 'JP' },
  'anime-spider-and-tulip-1943': { country: 'JP', needsCheck: 'Japanese wartime film; whether Japan still protected it on 1 Jan 1996 decides its US status.' },
  'anime-momotaro-sea-eagles-1943': { country: 'JP', needsCheck: 'Japanese wartime film; whether Japan still protected it on 1 Jan 1996 decides its US status.' },
  'anime-white-snake-enchantress-1958': { country: 'JP' },
  'anime-gullivers-travels-beyond-moon-1965': { country: 'JP' },
  'anim-princess-iron-fan-1941': { country: 'CN' },
  'anim-tale-of-the-fox-1937': { country: 'FR' },
  'anim-starevich-mascot-1933': { country: 'FR' },
  'anim-gullivers-travels-1939': US_LAPSED_RENEWAL,
  'anim-mr-bug-goes-to-town-1941': US_LAPSED_RENEWAL,
  'anim-steamboat-willie-1928': {
    hazards: [{ kind: 'TRADEMARK', what: 'Mickey Mouse as a brand (Disney) — the 1928 design is free, the mark is not' }],
  },
  'anim-felix-in-hollywood-1923': {
    hazards: [{ kind: 'TRADEMARK', what: 'Felix the Cat name and character (DreamWorks Classics)' }],
  },

  // ── Studio classics ───────────────────────────────────────────────────────
  SaltOfTheEarth_735: US_LAPSED_RENEWAL,
  kansascityconfidencial: US_LAPSED_RENEWAL,
  suddenly: US_LAPSED_RENEWAL,
  NothingSacred: US_LAPSED_RENEWAL,
  AStarIsBorn: US_LAPSED_RENEWAL,
  mclintok_widescreen: US_LAPSED_RENEWAL,
  penny_serenade: US_LAPSED_RENEWAL,
  reefer_madness_ipod: US_LAPSED_NOTICE,
  The_Bat_Vincent_Price: US_LAPSED_RENEWAL,
  The_Killer_Shrews_1959: US_LAPSED_RENEWAL,

  // ── Documentaries (US government) ─────────────────────────────────────────
  PlowThatBrokethePlains1: {
    ...US_GOVERNMENT,
    hazards: [{ kind: 'MUSIC', what: "Virgil Thomson's score, published separately as a concert suite", publishedYear: 1936 }],
  },
  wwf_prelude_to_war: US_GOVERNMENT,
  wwf_the_battle_of_britain: US_GOVERNMENT,
  battle_of_san_pietro: US_GOVERNMENT,
  'gov.ntis.ava04168vnb1': US_GOVERNMENT,
  TheMemphisBelleAStoryofaFlyingFortress: US_GOVERNMENT,
  the_battle_of_midway: US_GOVERNMENT,
  'gov.fdr.352.2a.3': {
    ...US_GOVERNMENT,
    hazards: [{ kind: 'MUSIC', what: "Douglas Moore's score", publishedYear: 1940 }],
  },
};

/** The catalog fields this needs — any ArchiveVideo fits. */
export interface CatalogFilmRef {
  identifier: string;
  year?: string | number;
}

/** US release clearance for a curated vault film, from its catalog year plus FILM_RIGHTS. */
export function filmClearanceFor(film: CatalogFilmRef, now: Date = new Date()): FilmClearance {
  const facts = FILM_RIGHTS[film.identifier] ?? {};
  return filmReleaseClearance({ releaseYear: parseYear(film.year), ...facts }, now);
}
