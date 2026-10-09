// useParty — the single React entry point to a synchronized party (watch / read / listen).
//
// Host: call broadcast({...}) on every control action (play/pause/seek/next/turn-page). The hook
// adds a liveness heartbeat (hostHeartbeat every PARTY_HEARTBEAT_MS), marks the host away on
// pagehide, and runs the "Starting in 3…" countdown.
// Follower: call getTarget() on a tick and feed it (with planDriftCorrection) to the local player.
// getTarget() anchors on the server write time + a clock-offset estimate from a viewer probe, and
// returns hold=true (pause, don't seek) while the host is reconnecting, counting down, or the party
// has ended. Followers are only followers while the party is ACTIVE — `ended` unlocks controls.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/backendService';
import { usePresence, PresencePerson } from './usePresence';
import {
  Party, PartyPlaybackState, PartyViewer, listenToParty, updatePartyPlayback, endParty, heartbeatParty,
  markHostAway, probeViewer, listenToViewers, leaveViewers, claimHost, passRemote as passRemoteSvc,
  setPartyCoHosts, setPartySettings, PartyVisibility, tsToMs,
  computeServerFollowTarget, FollowResult, refineClockOffset, ClockOffsetEstimate, hostLiveness,
  HostLiveness, pickClaimant, countdownRemaining, PARTY_HEARTBEAT_MS, HOST_GONE_MS,
} from '../services/partyService';

export interface PartyFollowResult extends FollowResult {
  /** pause and DON'T seek (host reconnecting / countdown / ended) — keep the viewer where they are. */
  hold: boolean;
}

export interface UseParty {
  party: Party | null;
  loading: boolean;
  /** partyId given but the doc doesn't exist (deleted / bad link). */
  missing: boolean;
  isHost: boolean;
  isCoHost: boolean;
  /** joined, party ACTIVE, and NOT the host → slaved to the host. */
  isFollower: boolean;
  /** the party was ended (by the host). Surfaces show "Party ended" and unlock controls. */
  ended: boolean;
  hostStatus: HostLiveness;
  /** host gone >60s and I'm the one eligible to take over. */
  canClaim: boolean;
  claim: () => Promise<boolean>;
  viewerCount: number;
  people: PresencePerson[];
  viewers: PartyViewer[];
  playback: PartyPlaybackState | null;
  /** local ms when the current playback state was received. */
  receiptLocalMs: number;
  /** server − local clock offset estimate (null until the first probe lands). */
  offsetMs: number | null;
  /** seconds left on the host's "Starting in N…" countdown (0 = none). */
  countdown: number;
  /** Host only: publish a new playback state (auto-increments seq, throttles rapid scrubs). */
  broadcast: (patch: Partial<PartyPlaybackState>) => void;
  /** Host only: 3-2-1 countdown for everyone, then run onGo (which should start playback). */
  startCountdown: (onGo: () => void, seconds?: number) => void;
  /** Host only: end the party for everyone. */
  end: () => void;
  /** Host only: hand the remote to someone present. */
  passRemote: (to: { uid: string; name?: string; photo?: string }) => Promise<void>;
  setCoHost: (uid: string, on: boolean) => Promise<void>;
  setVisibility: (v: PartyVisibility) => Promise<void>;
  setOpenRemote: (on: boolean) => Promise<void>;
  /** Follower: the drift-compensated target to apply to the local player right now. */
  getTarget: () => PartyFollowResult;
}

const WRITE_THROTTLE_MS = 250;   // coalesce rapid scrubs into one trailing write
const PROBE_MS = 30_000;          // viewer probe cadence (clock offset + "still here")
const VIEWER_FRESH_MS = 90_000;

export function useParty(partyId: string | null): UseParty {
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState<boolean>(!!partyId);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [viewers, setViewers] = useState<PartyViewer[]>([]);
  const [offset, setOffset] = useState<ClockOffsetEstimate | null>(null);
  const [tick, setTick] = useState(0);
  const receiptRef = useRef(0);
  const lastSeqRef = useRef(-1);
  const seqRef = useRef(0);
  const hbSeenRef = useRef<{ ms: number; localMs: number }>({ ms: -1, localMs: 0 });
  const partyRef = useRef<Party | null>(null);
  const offsetRef = useRef<ClockOffsetEstimate | null>(null);
  offsetRef.current = offset;

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);

  const isHost = !!party && !!uid && party.hostId === uid;
  const active = !!party && party.isActive !== false;
  const ended = !!party && party.isActive === false;
  const isCoHost = !!party && !!uid && (party.coHostIds || []).includes(uid);

  // Presence → live viewer count + avatars for the party (everyone publishes; host included).
  const { count, people } = usePresence(partyId ? `party_${partyId}` : null);

  // Party doc.
  useEffect(() => {
    if (!partyId) { setParty(null); setLoading(false); return; }
    setLoading(true);
    lastSeqRef.current = -1;
    hbSeenRef.current = { ms: -1, localMs: 0 };
    const unsub = listenToParty(partyId, (p) => {
      setLoading(false);
      const now = Date.now();
      const seq = p?.playback?.seq ?? -1;
      if (p && seq !== lastSeqRef.current) {
        lastSeqRef.current = seq;
        receiptRef.current = now;
        if (seq >= seqRef.current) seqRef.current = seq; // keep host counter ahead of the doc
      }
      // Liveness anchors on when WE saw the heartbeat change (our clock) — no clock agreement needed.
      const hb = tsToMs(p?.hostHeartbeat) || tsToMs(p?.playback?.updatedAt);
      if (hb && hb !== hbSeenRef.current.ms) hbSeenRef.current = { ms: hb, localMs: now };
      partyRef.current = p;
      setParty(p);
    });
    return () => unsub();
  }, [partyId]);

  // Viewers (claim eligibility) + periodic clock probe that doubles as "still here".
  useEffect(() => {
    if (!partyId || !uid) { setViewers([]); return; }
    const unsub = listenToViewers(partyId, setViewers);
    let first = true;
    let stopped = false;
    const probe = async () => {
      const sample = await probeViewer(partyId, first);
      first = false;
      if (!stopped && sample) setOffset(prev => refineClockOffset(prev, sample));
    };
    probe();
    const iv = setInterval(probe, PROBE_MS);
    const onHide = () => { leaveViewers(partyId).catch(() => {}); };
    window.addEventListener('pagehide', onHide);
    return () => {
      stopped = true;
      clearInterval(iv);
      unsub();
      window.removeEventListener('pagehide', onHide);
      leaveViewers(partyId).catch(() => {});
    };
  }, [partyId, uid]);

  // Re-evaluate liveness / countdown without new snapshots.
  useEffect(() => {
    if (!partyId) return;
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [partyId]);

  // ── Host: write path ───────────────────────────────────────────────────────────────────────────
  // Leading + trailing throttle: the FIRST control writes instantly (play/pause feels immediate to
  // the audience), rapid follow-ups during the window coalesce into ONE trailing write.
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
    const p = partyRef.current;
    if (!p || p.isActive === false || p.hostId !== auth.currentUser?.uid) return;
    const next: Partial<PartyPlaybackState> = { ...(pendingRef.current || {}), ...patch };
    if (patch.isPlaying) { next.started = true; next.countdownEndsAt = 0; }
    pendingRef.current = next;
    const since = Date.now() - lastWriteRef.current;
    if (since >= WRITE_THROTTLE_MS) {
      flush();                                   // leading edge — write immediately
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => { timerRef.current = null; flush(); }, WRITE_THROTTLE_MS - since);
    }
  }, [flush]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Host heartbeat + pagehide "away" marker.
  useEffect(() => {
    if (!partyId || !isHost || !active) return;
    const beat = () => {
      if (Date.now() - lastWriteRef.current < PARTY_HEARTBEAT_MS - 500) return; // a control write just did it
      lastWriteRef.current = Date.now();
      heartbeatParty(partyId).catch(() => {});
    };
    beat();
    const iv = setInterval(beat, PARTY_HEARTBEAT_MS);
    const onHide = () => markHostAway(partyId);
    const onShow = () => { lastWriteRef.current = 0; beat(); };
    const onVis = () => { if (document.visibilityState === 'visible') onShow(); };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [partyId, isHost, active]);

  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startCountdown = useCallback((onGo: () => void, seconds = 3) => {
    const p = partyRef.current;
    if (!p || p.hostId !== auth.currentUser?.uid) { onGo(); return; }
    const off = offsetRef.current?.offsetMs ?? 0;
    const endsAt = Date.now() + off + seconds * 1000;
    broadcast({ countdownEndsAt: Math.round(endsAt) });
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = setTimeout(() => { countdownTimerRef.current = null; onGo(); }, seconds * 1000);
  }, [broadcast]);
  useEffect(() => () => { if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current); }, []);

  const end = useCallback(() => { if (partyId) endParty(partyId).catch(() => {}); }, [partyId]);

  // ── Liveness / claim ───────────────────────────────────────────────────────────────────────────
  const hostStatus: HostLiveness = useMemo(() => {
    if (!party || !active) return 'live';
    if (isHost) return 'live';
    const status = hostLiveness({
      lastChangeLocalMs: hbSeenRef.current.localMs || receiptRef.current || Date.now(),
      nowLocalMs: Date.now(),
      heartbeatServerMs: hbSeenRef.current.ms > 0 ? hbSeenRef.current.ms : null,
      offsetMs: offset?.offsetMs ?? null,
    });
    if (party.hostAway && status === 'live') return 'reconnecting';
    return status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, active, isHost, offset, tick]);

  const claimant = useMemo(() => {
    if (!party || !active || isHost || hostStatus !== 'gone') return null;
    const nowServer = Date.now() + (offset?.offsetMs ?? 0);
    return pickClaimant({
      hostId: party.hostId,
      coHostIds: party.coHostIds,
      openRemote: party.openRemote,
      viewers: viewers.map(v => ({
        uid: v.uid,
        joinedAtMs: tsToMs(v.joinedAt) || Number.MAX_SAFE_INTEGER,
        fresh: !!tsToMs(v.seenAt) && nowServer - tsToMs(v.seenAt) < VIEWER_FRESH_MS,
      })),
    });
  }, [party, active, isHost, hostStatus, viewers, offset]);
  const canClaim = !!uid && claimant === uid;

  const claim = useCallback(async () => {
    const p = partyRef.current;
    if (!p) return false;
    return claimHost(p);
  }, []);

  // A present co-host takes the remote automatically (after a small jitter, so two tabs don't race).
  const autoClaimedRef = useRef(false);
  useEffect(() => {
    if (!canClaim || !isCoHost || autoClaimedRef.current) return;
    autoClaimedRef.current = true;
    const t = setTimeout(() => { claim().catch(() => {}); }, 1500 + Math.random() * 1500);
    return () => clearTimeout(t);
  }, [canClaim, isCoHost, claim]);
  useEffect(() => { if (hostStatus === 'live') autoClaimedRef.current = false; }, [hostStatus]);

  const passRemote = useCallback(async (to: { uid: string; name?: string; photo?: string }) => {
    const p = partyRef.current;
    if (p) await passRemoteSvc(p, to);
  }, []);
  const setCoHost = useCallback(async (who: string, on: boolean) => {
    const p = partyRef.current;
    if (!p || !partyId) return;
    const cur = new Set(p.coHostIds || []);
    if (on) cur.add(who); else cur.delete(who);
    await setPartyCoHosts(partyId, Array.from(cur));
  }, [partyId]);
  const setVisibility = useCallback(async (v: PartyVisibility) => { if (partyId) await setPartySettings(partyId, { visibility: v }); }, [partyId]);
  const setOpenRemote = useCallback(async (on: boolean) => { if (partyId) await setPartySettings(partyId, { openRemote: on }); }, [partyId]);

  const countdown = countdownRemaining(party?.playback?.countdownEndsAt, Date.now(), offset?.offsetMs ?? null);
  void tick;

  // ── Follower target ────────────────────────────────────────────────────────────────────────────
  const hostStatusRef = useRef(hostStatus);
  hostStatusRef.current = hostStatus;
  const getTarget = useCallback((): PartyFollowResult => {
    const p = partyRef.current;
    const pb = p?.playback;
    const base = computeServerFollowTarget(pb, {
      updatedAtServerMs: tsToMs(pb?.updatedAt) || null,
      offsetMs: offsetRef.current?.offsetMs ?? null,
      receiptLocalMs: receiptRef.current || Date.now(),
      nowLocalMs: Date.now(),
    });
    const counting = countdownRemaining(pb?.countdownEndsAt, Date.now(), offsetRef.current?.offsetMs ?? null) > 0;
    const hold = !p || p.isActive === false || hostStatusRef.current !== 'live' || (counting && !pb?.isPlaying);
    return { ...base, shouldPlay: base.shouldPlay && !hold, hold };
  }, []);

  return {
    party,
    loading,
    missing: !!partyId && !loading && !party,
    isHost,
    isCoHost,
    isFollower: active && !isHost,
    ended,
    hostStatus,
    canClaim,
    claim,
    viewerCount: Math.max(count, people.length),
    people,
    viewers,
    playback: party?.playback ?? null,
    receiptLocalMs: receiptRef.current,
    offsetMs: offset?.offsetMs ?? null,
    countdown,
    broadcast,
    startCountdown,
    end,
    passRemote,
    setCoHost,
    setVisibility,
    setOpenRemote,
    getTarget,
  };
}

/** Exported for surfaces that only need the gone threshold for copy ("Host left a minute ago"). */
export const PARTY_HOST_GONE_MS = HOST_GONE_MS;
