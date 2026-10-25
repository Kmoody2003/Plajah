// livePollsClient — the browser side of server-mediated live polls (routes/fastVote.ts).
// Reads come from GET /api/live-polls (refreshed every few seconds while the room is on screen);
// votes go to POST /api/live-polls/:id/vote. Counts are shown optimistically the moment you tap,
// then replaced by the server's tally.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from './backendService';
import type { LivePoll } from './fast/voteSchedule';

export interface LivePollsState {
  polls: LivePoll[];
  myVotes: Record<string, number>;
  loading: boolean;
  error: string | null;
  /** Server clock minus device clock, so countdowns don't trust a skewed phone clock. */
  skewMs: number;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken?.().catch(() => undefined);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useLivePolls(roomId: string, opts: { active: boolean; intervalMs?: number }) {
  const [state, setState] = useState<LivePollsState>({ polls: [], myVotes: {}, loading: true, error: null, skewMs: 0 });
  const pending = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-polls?room=${encodeURIComponent(roomId)}`, { headers: await authHeader(), cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load polls');
      setState(s => ({
        polls: data.polls || [],
        // A vote in flight keeps its optimistic pick until the server confirms it.
        myVotes: { ...(data.myVotes || {}), ...Object.fromEntries([...pending.current].map(id => [id, s.myVotes[id]]).filter(([, v]) => v != null)) },
        loading: false,
        error: null,
        skewMs: Number(data.now) ? Number(data.now) - Date.now() : s.skewMs,
      }));
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e?.message || 'Could not load polls' }));
    }
  }, [roomId]);

  useEffect(() => {
    if (!opts.active) return;
    void refresh();
    const tick = () => { if (!document.hidden) void refresh(); };
    const t = setInterval(tick, opts.intervalMs ?? 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [opts.active, opts.intervalMs, refresh]);

  const vote = useCallback(async (pollId: string, choice: number): Promise<string | null> => {
    const prevChoice = state.myVotes[pollId];
    if (prevChoice === choice) return null;
    // Optimistic: move this account's vote in the local counts right away.
    pending.current.add(pollId);
    setState(s => ({
      ...s,
      myVotes: { ...s.myVotes, [pollId]: choice },
      polls: s.polls.map(p => {
        if (p.id !== pollId) return p;
        const counts = { ...(p.counts || {}) };
        counts[String(choice)] = (Number(counts[String(choice)]) || 0) + 1;
        if (prevChoice != null) counts[String(prevChoice)] = Math.max(0, (Number(counts[String(prevChoice)]) || 0) - 1);
        return { ...p, counts };
      }),
    }));
    try {
      const res = await fetch(`/api/live-polls/${encodeURIComponent(pollId)}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Your vote didn’t go through');
      pending.current.delete(pollId);
      setState(s => ({ ...s, polls: s.polls.map(p => (p.id === pollId && data.poll ? { ...data.poll, id: pollId } : p)) }));
      return null;
    } catch (e: any) {
      pending.current.delete(pollId);
      await refresh(); // roll back to the server's truth
      return e?.message || 'Your vote didn’t go through';
    }
  }, [state.myVotes, refresh]);

  /** Pledge toward a slot's commercial-free goal: opens Stripe Checkout (card held, charged only if
   *  the goal is met when voting closes). Returns an error message, or navigates away. */
  const pledge = useCallback(async (pollId: string, amountCents: number): Promise<string | null> => {
    try {
      const res = await fetch(`/api/live-polls/${encodeURIComponent(pollId)}/pledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ amountCents, returnPath: window.location.pathname + window.location.search }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start the pledge');
      window.location.href = data.url;
      return null;
    } catch (e: any) {
      return e?.message || 'Could not start the pledge';
    }
  }, []);

  // Back from Checkout (?slot_pledge=…&session_id=…): record the hold, then tidy the URL.
  const [pledgeNotice, setPledgeNotice] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sessionId = sp.get('session_id');
    if (!sp.get('slot_pledge') || !sessionId) return;
    let alive = true;
    void (async () => {
      try {
        // Right after the redirect back, sign-in may still be restoring.
        await (auth as any).authStateReady?.();
        const res = await fetch('/api/live-polls/pledges/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        setPledgeNotice(data.ok ? 'Thanks — your pledge is in. Your card is only charged if the goal is met.' : (data.reason || data.error || 'We couldn’t confirm that pledge.'));
        void refresh();
      } finally {
        sp.delete('slot_pledge'); sp.delete('session_id');
        const q = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  return { ...state, refresh, vote, pledge, pledgeNotice };
}
