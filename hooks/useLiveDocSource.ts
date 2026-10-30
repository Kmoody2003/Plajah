/**
 * useLiveDocSource — the shared source for any live surface: the host puts a Tela document on, everyone gets the
 * real document on their own device, and the mode decides what they can do with it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TelaDoc } from '../types';
import { applyTelaOp, type TelaOp } from '../components/tela/telaOps';
import { auth } from '../services/backendService';
import { saveTelaDoc } from '../services/telaStore';
import { audienceMayApply, mayInteract, type LiveDocMode } from '../services/liveDocPrepare';
import {
  liveSourceId, loadLiveDoc, lowerLiveHand, raiseLiveHand, setLiveDocFigure, setLiveDocInvited, watchLiveHands, watchMyLiveHand, sendLiveOp, setLiveDocMode, setLiveDocPlace, startLiveDoc, stopLiveDoc,
  watchLiveOps, watchLiveSource,
  type LiveDocAudience, type LiveDocHand, type LiveDocOpRecord, type LiveDocPlace, type LiveDocState,
} from '../services/liveDocSource';

export interface LiveDocSource {
  state: LiveDocState | null;
  active: boolean;
  isHost: boolean;
  /** The presenter, or a signed-in person they brought on. */
  canInteract: boolean;
  /** Presenter: who's asking. */
  hands: LiveDocHand[];
  /** Viewer: whether they're asking. */
  myHand: boolean;
  raiseHand: () => void;
  lowerHand: () => void;
  bringOn: (uid: string) => void;
  sendBack: (uid: string) => void;
  /** Presenter: replace who's on, for a surface with its own raise-hand queue. */
  setInvited: (uids: string[]) => void;
  /** What this viewer sees: the document with their own or the shared changes applied. */
  doc: TelaDoc | null;
  error: string;
  start: (doc: TelaDoc, mode: LiveDocMode) => Promise<{ deadMedia: number } | null>;
  stop: () => Promise<void>;
  setMode: (mode: LiveDocMode) => void;
  setPlace: (place: LiveDocPlace) => void;
  dispatch: (op: TelaOp) => void;
  keepMyCopy: () => Promise<string | null>;
}

const ownKey = (id: string, rev: number, uid: string) => `plajah_live_doc_ops_${id}_${rev}_${uid}`;
const PLACE_MS = 1000; // Firestore's sustained limit for one document
const HEARTBEAT_MS = 60_000;

export function useLiveDocSource(sessionKey: string | null, opts: { hostName: string; audience: LiveDocAudience; memberUids?: string[] }): LiveDocSource {
  const id = sessionKey ? liveSourceId(sessionKey) : '';
  const [state, setState] = useState<LiveDocState | null>(null);
  const [base, setBase] = useState<TelaDoc | null>(null);
  const [baseRev, setBaseRev] = useState(0);
  const [error, setError] = useState('');
  const [ownOps, setOwnOps] = useState<TelaOp[]>([]);
  const [sharedOps, setSharedOps] = useState<LiveDocOpRecord[]>([]);
  const [pendingOps, setPendingOps] = useState<LiveDocOpRecord[]>([]);
  const uid = auth.currentUser?.uid || '';
  const isHost = !!state && !!uid && state.hostUid === uid;
  const canInteract = mayInteract(state, auth.currentUser);
  const [hands, setHands] = useState<LiveDocHand[]>([]);
  const [myHand, setMyHand] = useState(false);
  // A presenter whose tab closed can't say goodbye, so their heartbeat stopping takes the document off.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const active = !!state?.active && (isHost || now - (state.updatedAt || 0) < HEARTBEAT_MS * 3);
  const mode: LiveDocMode = state?.mode || 'FOLLOW';
  const rev = state?.rev || 0;

  useEffect(() => {
    if (!id) { setState(null); return; }
    return watchLiveSource(id, setState, e => console.warn('[liveDoc] source unavailable', e));
  }, [id]);

  // The document itself: fetched once per presentation.
  const chunks = state?.chunks || 0;
  useEffect(() => {
    if (!active || !rev || !chunks) { setBase(null); setBaseRev(0); return; }
    let live = true;
    setError('');
    void (async () => {
      for (let tries = 0; live; tries++) {
        try {
          const d = await loadLiveDoc({ id, rev, chunks });
          if (live) { setBase(d); setBaseRev(rev); }
          return;
        } catch (e) {
          if (tries >= 4) { if (live) setError('This document could not load.'); console.warn('[liveDoc] load failed', e); return; }
          await new Promise(r => setTimeout(r, 800));
        }
      }
    })();
    return () => { live = false; };
  }, [id, active, rev, chunks]);

  // OWN_COPY: this viewer's changes stay on this device until they keep a copy.
  useEffect(() => {
    if (!rev || !uid) { setOwnOps([]); return; }
    try { setOwnOps(JSON.parse(localStorage.getItem(ownKey(id, rev, uid)) || '[]')); } catch { setOwnOps([]); }
  }, [id, rev, uid]);

  useEffect(() => {
    setSharedOps([]); setPendingOps([]);
    if (!active || !rev) return;
    return watchLiveOps(id, rev, setSharedOps);
  }, [id, active, rev]);
  useEffect(() => {
    if (!active || !rev || !isHost) { setHands([]); return; }
    return watchLiveHands(id, rev, setHands);
  }, [id, active, rev, isHost]);
  useEffect(() => {
    if (!active || !uid || isHost) { setMyHand(false); return; }
    return watchMyLiveHand(id, uid, h => setMyHand(!!h && h.rev === rev));
  }, [id, active, rev, uid, isHost]);
  useEffect(() => {
    if (!isHost || !active) return;
    const t = window.setInterval(() => { setLiveDocPlace(id, {}).catch(() => {}); }, HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [id, isHost, active]);
  const doc = useMemo(() => {
    if (!base || baseRev !== rev) return null;
    const apply = (d: TelaDoc, op: TelaOp) => { try { return audienceMayApply(op) ? applyTelaOp(d, op) : d; } catch { return d; } };
    let d = base;
    if (mode === 'OWN_COPY' && !isHost) d = ownOps.reduce(apply, d);
    // Everyone replays the same list in the same order, then anything of mine that hasn't come back yet.
    const seen = new Set(sharedOps.map(o => o.id));
    for (const rec of [...sharedOps, ...pendingOps.filter(o => !seen.has(o.id))]) {
      try { d = apply(d, JSON.parse(rec.json) as TelaOp); } catch { /* a malformed change is skipped by everyone */ }
    }
    return d;
  }, [base, baseRev, rev, mode, isHost, ownOps, sharedOps, pendingOps]);

  const dispatch = useCallback((op: TelaOp) => {
    if (!state || !audienceMayApply(op) || !mayInteract(state, auth.currentUser)) return;
    if (state.mode === 'TOGETHER') {
      const opId = `${uid || 'guest'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setPendingOps(p => [...p, { id: opId, rev: state.rev, uid, at: Date.now(), json: JSON.stringify(op) }]);
      sendLiveOp(state.id, state.rev, opId, op).catch(e => {
        setPendingOps(p => p.filter(o => o.id !== opId));
        setError(e?.message || "That change didn't save.");
      });
    } else if (state.mode === 'OWN_COPY' && !isHost) {
      setOwnOps(prev => {
        const next = [...prev, op];
        try { localStorage.setItem(ownKey(state.id, state.rev, uid), JSON.stringify(next)); } catch { /* still works for this visit */ }
        return next;
      });
    }
  }, [state, uid, isHost]);

  const start = useCallback(async (d: TelaDoc, m: LiveDocMode) => {
    if (!id) return null;
    setError('');
    try {
      if (state?.active && isHost) await stopLiveDoc(state);
      return await startLiveDoc({ id, doc: d, mode: m, hostName: opts.hostName, audience: opts.audience, memberUids: opts.memberUids });
    } catch (e: any) { setError(e?.message || 'This document could not go live.'); return null; }
  }, [id, state, isHost, opts.hostName, opts.audience, opts.memberUids]);

  const stateRef = useRef(state); stateRef.current = state;
  const isHostRef = useRef(isHost); isHostRef.current = isHost;
  const canInteractRef = useRef(canInteract); canInteractRef.current = canInteract;
  const stop = useCallback(async () => {
    const s = stateRef.current;
    if (s && isHostRef.current) await stopLiveDoc(s);
  }, []);
  // Leaving the stream takes the document off with it.
  useEffect(() => () => {
    const s = stateRef.current;
    if (s?.active && isHostRef.current) void stopLiveDoc(s);
  }, [id]);

  const setMode = useCallback((m: LiveDocMode) => { if (id && isHostRef.current) setLiveDocMode(id, m).catch(e => setError(e?.message || '')); }, [id]);

  const placeRef = useRef<LiveDocPlace>({});
  const placeTimer = useRef(0);
  const setPlace = useCallback((p: LiveDocPlace) => {
    if (!id || !canInteractRef.current) return;
    // Someone brought on only drives the simulations; the page and the mode stay with the presenter.
    if (!isHostRef.current) { if (!p.figure) return; placeRef.current = { figure: p.figure }; }
    else placeRef.current = { ...placeRef.current, ...p };
    if (placeTimer.current) return;
    placeTimer.current = window.setTimeout(() => {
      placeTimer.current = 0;
      const send = placeRef.current;
      placeRef.current = {};
      (isHostRef.current ? setLiveDocPlace(id, send) : setLiveDocFigure(id, send.figure!)).catch(() => {});
    }, PLACE_MS);
  }, [id]);
  useEffect(() => () => { if (placeTimer.current) clearTimeout(placeTimer.current); }, []);

  const raiseHand = useCallback(() => { if (id && rev) raiseLiveHand(id, rev).catch(e => setError(e?.message || "Your hand didn't go up.")); }, [id, rev]);
  const lowerHand = useCallback(() => { if (id && uid) lowerLiveHand(id, uid).catch(() => {}); }, [id, uid]);
  const setInvited = useCallback((uids: string[]) => {
    const cur = stateRef.current;
    if (!id || !cur || !isHostRef.current) return;
    if (uids.length === (cur.invitedUids || []).length && uids.every(u => cur.invitedUids.includes(u))) return;
    setLiveDocInvited(id, uids).catch(e => setError(e?.message || "That didn't save."));
  }, [id]);
  const bringOn = useCallback((u: string) => {
    setInvited([...(stateRef.current?.invitedUids || []).filter(x => x !== u), u]);
    if (id) lowerLiveHand(id, u).catch(() => {});
  }, [id, setInvited]);
  const sendBack = useCallback((u: string) => setInvited((stateRef.current?.invitedUids || []).filter(x => x !== u)), [setInvited]);

  const keepMyCopy = useCallback(async () => {
    const u = auth.currentUser;
    if (!doc || !u) return null;
    const copy: TelaDoc = { ...doc, id: `tela_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ownerId: u.uid, title: `${doc.title} (my copy)`, currentVersionId: undefined, updatedAt: Date.now() };
    await saveTelaDoc(copy);
    return copy.id;
  }, [doc]);

  return { state, active, isHost, canInteract, hands, myHand, raiseHand, lowerHand, bringOn, sendBack, setInvited, doc, error, start, stop, setMode, setPlace, dispatch, keepMyCopy };
}
