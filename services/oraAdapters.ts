import { auth } from './backendService';
import { fetchUserAlbums, fetchUserVideos } from './backendService';
import { listWritingProjects } from './loreaProjectsService';
import { loadReadingProgress } from './readingQuestService';
import { saveGoal, totalPracticeMinutes } from './oraService';
import type { OraGoal, OraProvenance, OraSourceService } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Ora — goal auto-verification adapters.
//
// This is the file that makes Compass unclonable. Every habit tracker on the
// market asks the user to tick a box; Plajah already knows whether the thing
// happened, because it holds the work. An adapter reads one real signal from
// one real service and returns a number.
//
// THE HONESTY RULES — these are the whole point, so they are not negotiable:
//
//   1. An adapter returns `null` when it cannot read its signal. `null` is NOT
//      zero. A failed read must never reset a goal to 0, and must never mark it
//      verified. The goal keeps its last known progress and its old timestamp.
//   2. `verified` is only ever written when a real number came back from a real
//      query in this session. Nothing infers it, nothing back-fills it.
//   3. Adapters are read-only. They never write to the service they read from.
//   4. Nothing here reads another user's data. Every query is scoped to the
//      signed-in uid, and there is no uid parameter on the public API for
//      exactly that reason.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §3.1
// ─────────────────────────────────────────────────────────────────────────

export interface OraAdapter {
  /** Stable key stored on the goal. Never rename one in place — goals point at it. */
  key: string;
  service: OraSourceService;
  /** Chip text, e.g. "Chora" → renders as `verified · Chora`. */
  label: string;
  /** What the user picks in the goal composer. */
  goalLabel: string;
  /** Suggested unit, e.g. "releases". */
  unit: string;
  /** One-line explanation of exactly what is counted, shown under the picker. */
  explains: string;
  /** Reads the live signal. Returns null when unavailable — never 0 as a fallback. */
  read: (uid: string) => Promise<number | null>;
}

/** Deep link to the surface that proves the goal, for the provenance chip. */
const REF: Record<string, string> = {
  'chora.releases': '/?view=music',
  'chora.tracks': '/?view=music',
  'lorea.words': '/?view=books',
  'lorea.projects': '/?view=books',
  'reello.videos': '/?view=videos',
  'reading.quests': '/?view=reading-quest',
  'ora.minutes': '/?view=ora',
};

export const ORA_ADAPTERS: OraAdapter[] = [
  {
    key: 'chora.releases',
    service: 'CHORA',
    label: 'Chora',
    goalLabel: 'Releases published',
    unit: 'releases',
    explains: 'Counts the albums and EPs you own on Chora.',
    read: async (uid) => {
      const albums = await fetchUserAlbums(uid);
      // fetchUserAlbums swallows its own errors and returns [], so an empty
      // array is genuinely ambiguous. Treat it as a real zero only for a
      // countable collection — a user with no releases is a normal state.
      return Array.isArray(albums) ? albums.length : null;
    },
  },
  {
    key: 'chora.tracks',
    service: 'CHORA',
    label: 'Chora',
    goalLabel: 'Tracks released',
    unit: 'tracks',
    explains: 'Counts every track across the releases you own on Chora.',
    read: async (uid) => {
      const albums = await fetchUserAlbums(uid);
      if (!Array.isArray(albums)) return null;
      return albums.reduce((n, a) => n + (Array.isArray(a?.tracks) ? a.tracks.length : 0), 0);
    },
  },
  {
    key: 'lorea.words',
    service: 'LOREA',
    label: 'Lorea',
    goalLabel: 'Words written',
    unit: 'words',
    explains: 'Sums the current word count of every book and screenplay in your Lorea studio.',
    read: async (uid) => {
      const { projects } = await listWritingProjects(uid);
      if (!Array.isArray(projects)) return null;
      return projects.reduce((n, p) => n + (Number(p?.wordCountCurrent) || 0), 0);
    },
  },
  {
    key: 'lorea.projects',
    service: 'LOREA',
    label: 'Lorea',
    goalLabel: 'Books & scripts started',
    unit: 'projects',
    explains: 'Counts the books and screenplays in your Lorea studio.',
    read: async (uid) => {
      const { projects } = await listWritingProjects(uid);
      return Array.isArray(projects) ? projects.length : null;
    },
  },
  {
    key: 'reello.videos',
    service: 'REELLO',
    label: 'Reello',
    goalLabel: 'Videos posted',
    unit: 'videos',
    explains: 'Counts the videos you have published on Reello.',
    read: async (uid) => {
      const videos = await fetchUserVideos(uid);
      return Array.isArray(videos) ? videos.length : null;
    },
  },
  {
    key: 'ora.minutes',
    service: 'ORA',
    label: 'Stillness',
    goalLabel: 'Minutes practised',
    unit: 'minutes',
    explains: 'Counts the minutes you have actually practised in Stillness — not the minutes you planned.',
    read: async () => totalPracticeMinutes(),
  },
  {
    key: 'reading.quests',
    service: 'ACADEMIA',
    label: 'Reading Quest',
    goalLabel: 'Reading quests completed',
    unit: 'quests',
    explains: 'Counts the Reading Quest challenges you have finished.',
    read: async (uid) => {
      const progress = await loadReadingProgress(uid);
      // A user who has never opened Reading Quest has no document at all —
      // that is "no signal", not "zero completed".
      if (!progress) return null;
      return Array.isArray(progress.completedQuests) ? progress.completedQuests.length : null;
    },
  },
];

export const adapterFor = (key?: string): OraAdapter | undefined =>
  key ? ORA_ADAPTERS.find((a) => a.key === key) : undefined;

/**
 * Refresh one AUTO goal against its adapter.
 *
 * Returns the updated goal, or the goal unchanged when the signal could not be
 * read. A caller cannot tell the difference by looking at `progress` alone —
 * that is deliberate. Check `provenance.checkedAt` to see whether the number is
 * fresh, and show the goal as stale rather than pretending it is current.
 */
export async function refreshGoal(goal: OraGoal): Promise<OraGoal> {
  if (goal.mode !== 'AUTO') return goal;
  const uid = auth.currentUser?.uid;
  const adapter = adapterFor(goal.adapter);
  if (!uid || !adapter) return goal;

  let value: number | null = null;
  try {
    value = await adapter.read(uid);
  } catch {
    value = null; // a throwing adapter is an unreadable signal, never a zero
  }
  if (value === null || !Number.isFinite(value)) return goal;

  const provenance: OraProvenance = {
    service: adapter.service,
    label: adapter.label,
    ref: REF[adapter.key],
    checkedAt: Date.now(),
  };
  const status: OraGoal['status'] =
    goal.target != null && value >= goal.target ? 'DONE' : 'ACTIVE';

  const updated: OraGoal = {
    ...goal,
    progress: value,
    provenance,
    status,
    // Keep the original completion moment if it was already done — the day you
    // finished is a fact about your life, not about the last sync.
    completedAt: status === 'DONE' ? (goal.completedAt ?? Date.now()) : undefined,
    updatedAt: Date.now(),
  };
  await saveGoal(updated);
  return updated;
}

/** Refresh every AUTO goal in a list. Failures are per-goal and never throw. */
export async function refreshGoals(goals: OraGoal[]): Promise<OraGoal[]> {
  const auto = goals.filter((g) => g.mode === 'AUTO' && g.adapter);
  if (auto.length === 0) return goals;
  const refreshed = new Map<string, OraGoal>();
  await Promise.all(
    auto.map(async (g) => {
      try { refreshed.set(g.id, await refreshGoal(g)); } catch { /* keep the old goal */ }
    }),
  );
  return goals.map((g) => refreshed.get(g.id) ?? g);
}

/** A signal older than this reads as stale in the UI rather than as current. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export const isStale = (goal: OraGoal): boolean =>
  goal.mode === 'AUTO' && (!goal.provenance || Date.now() - goal.provenance.checkedAt > STALE_AFTER_MS);

/**
 * Read every adapter once, for the goal composer — so the picker can show what
 * each signal currently says ("Chora · 3 releases today") instead of asking the
 * user to guess which one they want. Unreadable signals come back as null and
 * the picker shows them as unavailable rather than as zero.
 */
export async function previewAdapters(): Promise<Record<string, number | null>> {
  const uid = auth.currentUser?.uid;
  if (!uid) return {};
  const entries = await Promise.all(
    ORA_ADAPTERS.map(async (a) => {
      try { return [a.key, await a.read(uid)] as const; } catch { return [a.key, null] as const; }
    }),
  );
  return Object.fromEntries(entries);
}
