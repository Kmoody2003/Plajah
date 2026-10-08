// Shared hooks for the people-discovery UI.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '../../types';
import { useFollowing } from '../../hooks/useFollowing';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import { listenSentHelloTargets } from '../../services/sayHiService';
import {
  dismissSuggestion, loadDiscovery, rankTab, suggestPeople,
  type DiscoveryData, type DiscoveryMode, type DiscoveryTab, type Suggestion,
} from '../../services/discoveryService';

/** uids the viewer has already said hi to (live). */
export function useSentHellos(uid?: string | null): Set<string> {
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!uid) { setSent(new Set()); return; }
    return listenSentHelloTargets(uid, setSent);
  }, [uid]);
  return sent;
}

export interface UseSuggestions {
  suggestions: Suggestion[];
  loading: boolean;
  dismiss: (uid: string) => void;
  refresh: () => void;
}

/** Ranked suggestions for the feed row / onboarding step. Re-ranks locally when follows change. */
export function useSuggestions(viewer: UserProfile | null | undefined, opts: { mode?: DiscoveryMode; limit?: number } = {}): UseSuggestions {
  const uid = viewer?.uid;
  const following = useFollowing(uid);
  const safety = useSocialSafety();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const followKey = following.list.join(',');
  const hiddenKey = [...safety.hidden].join(',');

  useEffect(() => {
    if (!viewer || following.loading || safety.loading) return;
    let alive = true;
    setLoading(true);
    suggestPeople({ viewer, limit: opts.limit ?? 12, mode: opts.mode, followingIds: following.ids, hiddenUids: safety.hidden, force: nonce > 0 })
      .then(r => { if (alive) setItems(r); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, followKey, hiddenKey, opts.mode, opts.limit, nonce, following.loading, safety.loading]);

  const dismiss = useCallback((target: string) => {
    if (!uid) return;
    dismissSuggestion(uid, target);
    setDismissed(prev => new Set(prev).add(target));
  }, [uid]);

  const suggestions = useMemo(() => items.filter(s => !dismissed.has(s.uid)), [items, dismissed]);
  return { suggestions, loading, dismiss, refresh: () => setNonce(n => n + 1) };
}

export interface UseDiscoveryTabs {
  data: DiscoveryData | null;
  loading: boolean;
  following: ReturnType<typeof useFollowing>;
  hidden: Set<string>;
  list: (tab: DiscoveryTab, creatorType?: string) => Suggestion[];
}

/** Pool for PeopleDiscoveryPage; each tab is ranked locally from the cached pool. */
export function useDiscoveryTabs(viewer: UserProfile | null | undefined): UseDiscoveryTabs {
  const uid = viewer?.uid;
  const following = useFollowing(uid);
  const safety = useSocialSafety();
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewer || following.loading) return;
    let alive = true;
    setLoading(true);
    loadDiscovery(viewer, following.list)
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // pool is cached for 10 min; only (re)load when the viewer changes or follows first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, following.loading]);

  const list = useCallback((tab: DiscoveryTab, creatorType?: string) => {
    if (!viewer || !data) return [];
    return rankTab(viewer, data, following.ids, tab, { creatorType, hiddenUids: safety.hidden });
  }, [viewer, data, following.ids, safety.hidden]);

  return { data, loading, following, hidden: safety.hidden, list };
}
