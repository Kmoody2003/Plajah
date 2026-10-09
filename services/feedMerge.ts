// Weaving posts from the network (Bluesky / Mastodon) into the Plajah timeline.
//
// The native timeline is a list of entries (posts, cards, discovery modules). External posts are slotted in by
// TIME: before each native post is emitted, every not-yet-placed external post that is newer than it goes first.
// Ranked ("For You") order is only roughly chronological, so this keeps external posts spread through the list
// instead of clumped at the top or bottom, and it never reorders the native entries relative to each other.

import type { FediversePost } from './fediverse/types';

export interface ExternalEntry { type: 'external'; key: string; post: FediversePost }

/** Posts worth showing in the main timeline: top-level, not already on Plajah as the author's own native post. */
export function selectExternalForFeed(
  posts: readonly FediversePost[],
  nativePosts: readonly { fediverse?: { posts?: { uri?: string; url?: string }[] } }[],
  opts: { max?: number } = {},
): FediversePost[] {
  // A Plajah post shared out to Bluesky comes back in the user's own timeline — it must not appear twice.
  const crossposted = new Set<string>();
  for (const p of nativePosts) for (const x of p.fediverse?.posts ?? []) { if (x.uri) crossposted.add(x.uri); if (x.url) crossposted.add(x.url); }
  const seen = new Set<string>();
  const out: FediversePost[] = [];
  for (const p of posts) {
    if (p.inReplyToUri || p.inReplyToId) continue;        // replies are conversation fragments without their parent
    if (crossposted.has(p.uri) || crossposted.has(p.url)) continue;
    const key = `${p.protocol}:${p.uri}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push(p);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, opts.max ?? 60);
}

/** Insert external posts among native entries by timestamp. Entries without a timestamp (cards, modules) stay put. */
export function mergeExternalEntries<E extends { type: string }>(
  entries: readonly E[],
  external: readonly FediversePost[],
  nativeTime: (entry: E) => number | null,
): (E | ExternalEntry)[] {
  if (!external.length) return entries as (E | ExternalEntry)[];
  const queue = [...external]; // newest first
  const out: (E | ExternalEntry)[] = [];
  const emit = (p: FediversePost) => out.push({ type: 'external', key: `ext:${p.protocol}:${p.uri}`, post: p });
  for (const e of entries) {
    const t = nativeTime(e);
    if (t !== null) while (queue.length && queue[0].createdAt > t) emit(queue.shift()!);
    out.push(e);
  }
  // Anything older than every native post trails the list (only the first few, so it never swamps a short timeline).
  for (const p of queue.slice(0, 3)) emit(p);
  return out;
}
