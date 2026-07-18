// socialMedia.ts — surface the photos & videos a user has shared in the social feed inside
// Photos and Reello ("From Social" tabs). Query-based, not copy-based: we read the user's own
// posts and pull their media, so the galleries are always in sync with the feed and every item
// links back to the post it came from — no duplicated storage, no drift.

import { db } from './backendService';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface SocialMediaItem {
  postId: string;
  url: string;
  type: string;          // 'PHOTO' | 'GIF' | 'STICKER' | 'VIDEO'
  title?: string;
  thumbnail?: string;
  caption?: string;      // the post's text — the "associated post"
  authorName?: string;
  authorPhoto?: string;
  createdAt?: number;    // ms
}

const toMs = (t: any): number =>
  typeof t === 'number' ? t : (t?.toMillis?.() ?? (t?.seconds ? t.seconds * 1000 : 0));

/**
 * Every media asset of the given kinds that this user has posted to the feed, newest first.
 * `kinds` e.g. ['PHOTO','GIF','STICKER'] for Photos, ['VIDEO'] for Reello.
 * Single-field `where` only (no composite index needed); sorted client-side.
 */
export async function fetchUserSocialMedia(uid: string, kinds: string[]): Promise<SocialMediaItem[]> {
  if (!uid) return [];
  const kindSet = new Set(kinds);
  try {
    const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid)));
    const items: SocialMediaItem[] = [];
    snap.forEach(d => {
      const p: any = d.data();
      const media: any[] = Array.isArray(p.media) ? p.media : [];
      for (const m of media) {
        if (m?.url && kindSet.has(m.type)) {
          items.push({
            postId: d.id, url: m.url, type: m.type, title: m.title, thumbnail: m.thumbnail,
            caption: p.text, authorName: p.authorName, authorPhoto: p.authorPhoto,
            createdAt: toMs(p.createdAt),
          });
        }
      }
    });
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}
