// podcastLibraryService.ts — the single source of truth for the podcasts a user FOLLOWS from the
// podcast directory (PodcastsView). These are external/iTunes shows, kept in localStorage under
// 'vibe_my_podcasts'. Previously only PodcastsView read this key, so follows never appeared on the
// profile or elsewhere. This wraps the store and broadcasts changes so every surface (profile
// Podcast tab, Chora) stays in sync.

export interface FollowedPodcast {
  id: string;
  title: string;
  artist: string;
  coverImage: string;
  feedUrl: string;
  genres: string[];
}

const KEY = 'vibe_my_podcasts';
const EVT = 'plajah:podcast-library-changed';

export function getFollowedPodcasts(): FollowedPodcast[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.map((p: any) => ({ id: p.id, title: p.title || '', artist: p.artist || '', coverImage: p.coverImage || '', feedUrl: p.feedUrl || '', genres: Array.isArray(p.genres) ? p.genres : [] }));
  } catch { return []; }
}

function persist(list: FollowedPodcast[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota/private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ }
}

export function addFollowedPodcast(pod: FollowedPodcast): FollowedPodcast[] {
  const list = getFollowedPodcasts();
  if (list.some(p => p.id === pod.id)) return list;
  const next = [...list, { ...pod, genres: pod.genres || [] }];
  persist(next);
  return next;
}

export function removeFollowedPodcast(id: string): FollowedPodcast[] {
  const next = getFollowedPodcasts().filter(p => p.id !== id);
  persist(next);
  return next;
}

export function isFollowedPodcast(id: string): boolean {
  return getFollowedPodcasts().some(p => p.id === id);
}

/** Fire cb whenever the library changes (this tab or another). Returns an unsubscribe. */
export function subscribePodcastLibrary(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}
