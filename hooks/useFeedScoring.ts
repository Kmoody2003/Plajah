/**
 * useFeedScoring
 *
 * Provides two primitives for wiring the feed score engine into UI components:
 *
 * 1. useDwellTracker(postId, sourceCollection)
 *    Attaches an IntersectionObserver to a ref. Every 10 seconds the post
 *    stays in the viewport, records a DWELL_10S interaction (capped at 6).
 *
 * 2. useViewerDiscovery(feedItems, currentUserId)
 *    Computes the client-side δ_discovery coefficient for each post and
 *    returns a re-sorted copy of the feed. Pulls shared song-chat and club
 *    memberships from Firestore for the current user.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { recordFeedInteraction } from '../services/backendService';
import { computeDiscovery, computeFeedScore, type ViewerContext } from '../services/feedScoreEngine';
import type { FeedItem } from '../types';

// ─── Dwell time tracker ───────────────────────────────────────────────────────

/**
 * Returns a ref to attach to the feed card container.
 * Automatically fires DWELL_10S interactions while the card is visible.
 */
export function useDwellTracker(
  postId: string,
  sourceCollection: 'feed' | 'posts' = 'feed',
  enabled = true,
) {
  const ref = useRef<HTMLDivElement>(null);
  const dwellCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisible = useRef(false);

  useEffect(() => {
    if (!enabled || !postId) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries[0]?.isIntersecting ?? false;
        isVisible.current = visible;

        if (visible) {
          // Start 10-second tick
          intervalRef.current = setInterval(() => {
            if (isVisible.current && dwellCount.current < 6) {
              dwellCount.current += 1;
              recordFeedInteraction(postId, 'DWELL_10S', sourceCollection).catch(() => {});
            } else {
              // Capped — stop polling
              if (intervalRef.current) clearInterval(intervalRef.current);
            }
          }, 10_000);
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      },
      { threshold: 0.5 }, // 50% of card must be in viewport
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [postId, sourceCollection, enabled]);

  return ref;
}

// ─── Viewer context builder ───────────────────────────────────────────────────

/**
 * Builds a ViewerContext for the current user by looking up:
 * - chat_rooms they've participated in (live_chat_* prefix → song chat author IDs)
 * - clubs they're a member of → other member author IDs
 *
 * This is cached for the session lifetime — only fetches once per uid.
 */

const ctxCache = new Map<string, ViewerContext>();

async function buildViewerContext(uid: string): Promise<ViewerContext> {
  if (ctxCache.has(uid)) return ctxCache.get(uid)!;

  const followedAuthorIds = new Set<string>();
  const sharedSongChatAuthorIds = new Set<string>();
  const sharedClubAuthorIds = new Set<string>();

  try {
    // Followed users
    const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', uid)));
    const userData = userDoc.docs[0]?.data();
    if (userData?.following) {
      (userData.following as string[]).forEach(id => followedAuthorIds.add(id));
    }

    // Song live chat rooms the user has participated in
    const chatRooms = await getDocs(
      query(collection(db, 'chat_rooms'),
        where('participants', 'array-contains', uid),
        where('type', '==', 'PUBLIC_LIVE'),
      )
    );
    for (const d of chatRooms.docs) {
      if (!d.id.startsWith('live_chat_')) continue;
      const participants: string[] = d.data().participants ?? [];
      participants.filter(p => p !== uid).forEach(p => sharedSongChatAuthorIds.add(p));
    }

    // Clubs the user is a member of
    const clubMemberships = await getDocs(
      query(collection(db, 'clubMemberships'),
        where('userId', '==', uid),
        where('status', '==', 'ACTIVE'),
      )
    );
    const clubIds = clubMemberships.docs.map(d => d.data().clubId as string);
    for (const clubId of clubIds.slice(0, 10)) { // cap at 10 clubs to avoid excessive reads
      const members = await getDocs(
        query(collection(db, 'clubMemberships'), where('clubId', '==', clubId))
      );
      members.docs
        .map(d => d.data().userId as string)
        .filter(id => id && id !== uid)
        .forEach(id => sharedClubAuthorIds.add(id));
    }
  } catch {
    // Graceful degradation — if we can't build context, all δ = 1.08
  }

  const ctx: ViewerContext = { followedAuthorIds, sharedSongChatAuthorIds, sharedClubAuthorIds };
  ctxCache.set(uid, ctx);
  return ctx;
}

// ─── Viewer discovery hook ────────────────────────────────────────────────────

/**
 * Re-sorts feedItems by score × δ_discovery for this specific viewer.
 * Returns the personalized list; falls back to the input order while loading.
 */
export function useViewerDiscovery(
  feedItems: FeedItem[],
  currentUserId: string | undefined,
): FeedItem[] {
  const [personalized, setPersonalized] = useState<FeedItem[]>(feedItems);
  const lastUid = useRef<string | null>(null);

  const applyDiscovery = useCallback(async (uid: string, items: FeedItem[]) => {
    const ctx = await buildViewerContext(uid);

    const scored = items.map(item => {
      const baseScore = item.score ?? 0;
      const delta = computeDiscovery(item.authorId, ctx);
      return { item, personalScore: baseScore * delta };
    });

    scored.sort((a, b) => b.personalScore - a.personalScore);
    setPersonalized(scored.map(s => s.item));
  }, []);

  useEffect(() => {
    if (!currentUserId || feedItems.length === 0) {
      setPersonalized(feedItems);
      return;
    }
    // Avoid re-running on every render — only when uid or items change
    lastUid.current = currentUserId;
    applyDiscovery(currentUserId, feedItems).catch(() => setPersonalized(feedItems));
  }, [feedItems, currentUserId, applyDiscovery]);

  return personalized;
}
