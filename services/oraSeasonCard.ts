import { auth } from './backendService';
import { profileShareUrl } from './statCardService';
import {
  getProfile, listGoals, listCheckins, listSessions, currentSeason,
} from './oraService';
import { refreshGoals } from './oraAdapters';
import type { StatCardData, StatCardStat } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Ora — the Season Card.
//
// Everything else in Ora is private by design, which means Ora has no way to
// bring a new person to Plajah. The Season Card is the single exception: the
// one artefact meant to leave the building. It is what turns a quarter of quiet
// practice into something a person can hold up.
//
// THE PRIVACY LINE IS ABSOLUTE. A card carries counts and verified goal TITLES
// that the user chose to pursue — never a journal word, never a check-in note,
// never a mood value, never an unshared goal's detail. The whole point of the
// card is that it can be public precisely because it contains nothing private.
//
// It is built as a StatCardData so it renders through the existing StatCard —
// same QR, same flip, same html2canvas export the profile card already uses.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §3.5
// ─────────────────────────────────────────────────────────────────────────

/** Nicely spelled season, e.g. "Summer 2026", from a "2026-Q3" key. */
function seasonName(key: string): string {
  const [year, q] = key.split('-Q');
  const names: Record<string, string> = { '1': 'Winter', '2': 'Spring', '3': 'Summer', '4': 'Autumn' };
  return `${names[q] || `Q${q}`} ${year}`;
}

export interface SeasonCardInput {
  /** Override the season; defaults to the current one. */
  season?: string;
  displayName?: string;
  photoURL?: string | null;
}

/**
 * Assemble the Season Card for the signed-in user.
 *
 * Refreshes AUTO goals first so a verified count on the card is genuinely
 * current — a shared card that overstates is the one mistake this feature
 * cannot make, since it is the thing other people see.
 */
export async function buildSeasonCard(input: SeasonCardInput = {}): Promise<StatCardData | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const season = input.season || currentSeason();
  const [profile, rawGoals, checkins, sessions] = await Promise.all([
    getProfile(), listGoals(season), listCheckins(120), listSessions(2000),
  ]);

  // Bring verified numbers up to date before they go on something public.
  const goals = await refreshGoals(rawGoals);

  const done = goals.filter((g) => g.status === 'DONE');
  const verifiedDone = done.filter((g) => g.mode === 'AUTO' && g.provenance);

  // Practice minutes this season only — a season card is about a season.
  const seasonStart = seasonStartMs(season);
  const minutes = Math.floor(
    sessions
      .filter((s) => s.createdAt >= seasonStart)
      .reduce((n, s) => n + (Number(s.seconds) || 0), 0) / 60,
  );
  const checkinDays = new Set(checkins.filter((c) => c.createdAt >= seasonStart).map((c) => c.day)).size;

  const stats: StatCardStat[] = [
    { label: 'Day streak', value: profile?.streak?.current ?? 0, hint: `best ${profile?.streak?.longest ?? 0}` },
    { label: 'Goals done', value: done.length, hint: verifiedDone.length ? `${verifiedDone.length} verified` : undefined },
    { label: 'Minutes still', value: minutes },
    { label: 'Days tended', value: checkinDays },
  ];

  // The verified goals become the card's "categories" — the closest the stat
  // card grammar has to a proud list, and the one place the provenance shows.
  const categories = verifiedDone.slice(0, 4).map((g) => ({
    key: g.id,
    label: `${g.title} · verified ${g.provenance!.label}`,
    count: g.target ?? g.progress,
    thumbnails: [] as string[],
  }));

  const shareUrl = profileShareUrl(uid);

  return {
    kind: 'SEASON',
    id: `season_${uid}_${season}`,
    title: input.displayName || auth.currentUser?.displayName || 'A season of practice',
    subtitle: seasonName(season),
    heroImage: input.photoURL ?? auth.currentUser?.photoURL ?? undefined,
    accent: '#6B0099',
    verified: verifiedDone.length > 0,
    stats,
    categories,
    qrUrl: shareUrl,
    shareUrl,
    footnote: verifiedDone.length
      ? 'Verified goals are proven by real work on Plajah — not self-reported.'
      : 'Kept on Plajah.',
  };
}

/** Epoch ms at the first instant of a "2026-Q3" season, local time. */
function seasonStartMs(key: string): number {
  const [year, q] = key.split('-Q').map(Number);
  const month = (q - 1) * 3; // Q1→Jan, Q2→Apr, Q3→Jul, Q4→Oct
  return new Date(year, month, 1, 0, 0, 0, 0).getTime();
}
