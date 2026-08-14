import { auth, fetchWatchLaterPlaylist, fetchVideosByIds } from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Shelf. One queue for everything you meant to get back to.
//
// Pocket shut down in 2025 and every survivor still handles text only, because
// none of them ship a player. Plajah ships the player, the reader and the
// library, so a single queue can hold a video, a track, a book and a scene.
//
// WHAT IS WIRED TODAY: Reello Watch Later. That is the one saved-for-later list
// that genuinely exists on the account right now, and it is the seed the design
// called for. Chora, Lorea and Fabula saves are listed as sources here so the
// shape is right, but they are NOT faked in — a shelf that shows a book you
// never saved is worse than a shelf with one section.
//
// The column that earns its place is `minutes`: a save-for-later list is
// useless until it can answer "what can I actually finish tonight".
// ─────────────────────────────────────────────────────────────────────────

export type ShelfKind = 'VIDEO' | 'TRACK' | 'BOOK' | 'SCENE' | 'READ';

export interface ShelfItem {
  id: string;
  kind: ShelfKind;
  label: string;
  title: string;
  subtitle?: string;
  /** Minutes to finish, when the source knows the duration. Null when unknown. */
  minutes: number | null;
  ref?: string;
}

export interface ShelfResult {
  items: ShelfItem[];
  partial: boolean;
}

/** Everything the signed-in user has saved for later, across every media type. */
export async function assembleShelf(): Promise<ShelfResult> {
  if (!auth.currentUser?.uid) return { items: [], partial: true };

  const items: ShelfItem[] = [];
  let partial = false;

  try {
    const playlist = await fetchWatchLaterPlaylist();
    const ids: string[] = Array.isArray((playlist as any)?.videoIds) ? (playlist as any).videoIds : [];
    if (ids.length) {
      const videos = await fetchVideosByIds(ids.slice(0, 60));
      for (const v of videos as any[]) {
        items.push({
          id: String(v.id),
          kind: 'VIDEO',
          label: 'Reello',
          title: v.title || 'Untitled video',
          subtitle: v.ownerName || v.channelName || undefined,
          minutes: typeof v.duration === 'number' && v.duration > 0 ? Math.max(1, Math.round(v.duration / 60)) : null,
          ref: '/?view=videos',
        });
      }
    }
  } catch {
    partial = true;
  }

  // Shortest first — the list is for finding something you can finish now, so
  // anything with an unknown length sinks to the bottom rather than leading.
  items.sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9));
  return { items, partial };
}

/** What could plausibly be finished in the time available. */
export const finishableIn = (items: ShelfItem[], minutes: number): ShelfItem[] =>
  items.filter((i) => i.minutes !== null && i.minutes <= minutes);
