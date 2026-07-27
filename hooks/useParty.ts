// useParty — the single React entry point to a synchronized party (watch / read / listen).
//
// Host: call broadcast({...}) on every control action (play/pause/seek/next/turn-page) plus a slow
// heartbeat while playing, so late-joiners and drifting followers re-sync. Follower: read `playback`
// + `receiptLocalMs` and feed them to computeFollowTarget() on a tick, applying the result to the
// local player. Both share one Party doc; the content itself always plays locally per client.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../services/backendService';
import { usePresence } from './usePresence';
import {
  Party, PartyPlaybackState, listenToParty, updatePartyPlayback, endParty,
  computeFollowTarget, FollowResult,
} from '../services/partyService';

export interface UseParty {
  party: Party | null;
  loading: boolean;
  isHost: boolean;
  isFollower: boolean;         // joined and NOT the host → slaved to the host
  viewerCount: number;
  playback: PartyPlaybackState | null;
  /** local ms when the current playback state was received (anchor for the follow math). */
  receiptLocalMs: number;
  /** Host only: publish a new playback state (auto-increments seq, throttles rapid scrubs). */
  broadcast: (patch: Partial<PartyPlaybackState>) => void;
  /** Host only: end the party for everyone. */
  end: () => void;
  /** Follower: the drift-compensated target to apply to the local player right now. */
  getTarget: () => FollowResult;
}

const WRITE_THROTTLE_MS = 250;   // coalesce rapid scrubs into one trailing write

export function useParty(partyId: string | null): UseParty {
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState<boolean>(!!partyId);
  const receiptRef = useRef(0);
  const lastSeqRef = useRef(-1);
  const seqRef = useRef(0);
  const [, force] = useState(0);

  const uid = auth.currentUser?.uid || null;
  const isHost = !!party && !!uid && party.hostId === uid;

  // Presence → live viewer count for the party (everyone publishes; host included).
  const { count } = usePresence(partyId ? `party_${partyId}` : null);

  useEffect(() => {
    if (!partyId) { setParty(null); setLoading(false); return; }
    setLoading(true);
    const unsub = listenToParty(partyId, p => {
      setLoading(false);
      // Stamp the local receipt time whenever the host's state advances (seq change) — this is what
      // the follow math anchors on, so no cross-client clock sync is required.
      const seq = p?.playback?.seq ?? -1;
      if (p && seq !== lastSeqRef.current) {
        lastSeqRef.current = seq;
        receiptRef.current = Date.now();
        if (seq >= seqRef.current) seqRef.current = seq; // keep host counter ahead of the doc
      }
      setParty(p);
    });
    return () => unsub();
  }, [partyId]);

  // Leading + trailing throttle: the FIRST control writes instantly (play/pause feels immediate to
  // the audience), rapid follow-ups during the window coalesce into ONE trailing write carrying the
  // final state (so a fast scrub isn't hundreds of writes but still lands on the real end position).
  const pendingRef = useRef<Partial<PartyPlaybackState> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWriteRef = useRef(0);
  const flush = useCallback(() => {
    if (!partyId || !pendingRef.current) return;
    const patch = pendingRef.current;
    pendingRef.current = null;
    lastWriteRef.current = Date.now();
    const seq = ++seqRef.current;
    updatePartyPlayback(partyId, patch, seq).catch(() => {});
  }, [partyId]);

  const broadcast = useCallback((patch: Partial<PartyPlaybackState>) => {
    pendingRef.current = { ...(pendingRef.current || {}), ...patch };
    const since = Date.now() - lastWriteRef.current;
    if (since >= WRITE_THROTTLE_MS) {
      flush();                                   // leading edge — write immediately
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => { timerRef.current = null; flush(); }, WRITE_THROTTLE_MS - since);
    }
  }, [flush]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const end = useCallback(() => { if (partyId) endParty(partyId).catch(() => {}); }, [partyId]);

  const getTarget = useCallback((): FollowResult => {
    return computeFollowTarget(party?.playback, receiptRef.current || Date.now(), Date.now());
  }, [party]);

  // keep force-updater referenced (avoids unused-var lint; lets future manual re-renders hook in)
  void force;

  return {
    party,
    loading,
    isHost,
    isFollower: !!party && !isHost,
    viewerCount: count,
    playback: party?.playback ?? null,
    receiptLocalMs: receiptRef.current,
    broadcast,
    end,
    getTarget,
  };
}
