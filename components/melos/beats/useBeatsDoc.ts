// The groove document lives in a ref (ONE mutable object shared with the engine — the scheduler
// reads it on every tick, so edits are audible on the very next step with no copy/sync layer).
// React re-renders via a revision counter. Persistence: autosaved to the user's Melos scratch
// production (melosProductions/scratch_{uid}/grooves), samples hydrated from OPFS → locker.
// Signed-out sessions run fully in-memory ('local') and upgrade when auth appears.
//
// Offline-first: every edit is written to IndexedDB (localDocCache) before the Firestore save, so
// signed-out / offline work survives a reload; opening a groove compares the local copy with
// Firestore's by updatedAt and takes the newer. Each save also queues a personal creative-cloud
// copy (kind 'beats') for version history. Live collaboration merges arrive through
// `applyRemote`, which folds the merged doc into the SAME object (reconcileInPlace) — the engine
// keeps its reference, playback keeps running, samples only hydrate when new ones appear, and
// the local undo stack is left alone.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../../services/firebase';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { newGrooveDoc, deserializeGroove, type GrooveDoc } from '../../../services/melos/beats/grooveDoc';
import {
  ensureScratchProduction, saveGroove, loadGroove, listGrooves, deleteGroove, type GrooveSummary,
} from '../../../services/melos/beats/grooveStore';
import { hydrateSample, requestPersistentStorage } from '../../../services/melos/beats/sampleStore';
import { GUEST_PROD, LOCAL_PROD, delLocal, getLocal, listLocal, markSynced, pickNewer, putLocal, type LocalEntry } from '../../../services/melos/beats/localDocCache';
import { reconcileInPlace } from '../../../services/melos/beats/reconcileInPlace';
import { scheduleCreativeSync } from '../../../services/creativeCloud/cloudStore';

export type SaveState = 'local' | 'unsaved' | 'saving' | 'saved';

export interface BeatsDocApi {
  doc: GrooveDoc;
  rev: number;
  saveState: SaveState;
  grooves: GrooveSummary[];
  /** `coalesce`: consecutive mutations with the same key are one undo step (an automation pass). */
  mutate: (fn: (d: GrooveDoc) => void, opts?: { coalesce?: string }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  replace: (doc: GrooveDoc) => void;
  /** Fold a collaborator's merged doc into the live one — keeps undo, engine, samples. */
  applyRemote: (doc: GrooveDoc) => void;
  /** Read the live doc (for snapshots taken outside render). */
  getDoc: () => GrooveDoc;
  /** Open someone else's shared groove: local cache + live session only, never their Firestore path. */
  openShared: (doc: GrooveDoc, ownerUid: string) => void;
  /** Set from the live collab project: owner uid when we're a non-owner member, else null. */
  setGuestOf: (ownerUid: string | null) => void;
  isGuest: () => boolean;
  saveNow: () => Promise<void>;
  openGroove: (grooveId: string) => Promise<void>;
  newGroove: () => void;
  removeGroove: (grooveId: string) => Promise<void>;
}

function sampleKeys(doc: GrooveDoc): string {
  const keys: string[] = [];
  for (const p of doc.kit) if (p.sample) keys.push(p.sample.key);
  for (const t of doc.arrangement) for (const c of t.clips) if (c.audio) keys.push(c.audio.sampleKey);
  return keys.sort().join('|');
}

/** Firestore's groove list plus anything only this device has (signed-out / offline edits). */
async function listMerged(prodId: string | null): Promise<GrooveSummary[]> {
  const [remote, local] = await Promise.all([
    prodId ? listGrooves(prodId) : Promise.resolve([] as GrooveSummary[]),
    listLocal('groove', [prodId, LOCAL_PROD]),
  ]);
  const byId = new Map(remote.map((g) => [g.id, g]));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || (!l.synced && l.updatedAt > r.updatedAt)) {
      byId.set(l.id, { id: l.id, name: l.name || 'Groove', bpm: l.bpm || 120, updatedAt: l.updatedAt, unsynced: !l.synced });
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The newest copy of a groove: this device's (under the production or signed-out) vs Firestore's. */
async function loadBest(prodId: string | null, grooveId: string): Promise<{ doc: GrooveDoc; unsynced: boolean } | null> {
  const [inProd, anon, remote] = await Promise.all([
    prodId ? getLocal<GrooveDoc>('groove', prodId, grooveId) : Promise.resolve(null),
    getLocal<GrooveDoc>('groove', LOCAL_PROD, grooveId),
    prodId ? loadGroove(prodId, grooveId) : Promise.resolve(null),
  ]);
  let local: LocalEntry<GrooveDoc> | null = inProd;
  if (anon && (!local || anon.updatedAt > local.updatedAt)) local = anon;
  const pick = pickNewer(local, remote);
  if (!pick) return null;
  const doc = pick.fromLocal ? deserializeGroove(pick.doc) : pick.doc;
  return doc ? { doc, unsynced: pick.unsynced } : null;
}

async function hydrateDocSamples(doc: GrooveDoc): Promise<void> {
  const engine = BeatsEngine.get();
  await engine.init().catch(() => { /* pre-gesture: samples hydrate again on first play */ });
  const ctx = engine.getContext();
  if (!ctx) return;
  const refs = [
    ...doc.kit.filter((p) => p.sample).map((p) => p.sample!),
    ...doc.arrangement.flatMap((t) => t.clips.filter((c) => c.audio).map((c) => ({
      key: c.audio!.sampleKey, name: c.audio!.name, durationSec: c.audio!.durationSec, lockerUrl: c.audio!.lockerUrl,
    }))),
  ];
  await Promise.all(refs.map(async (ref) => {
    if (engine.hasSampleBuffer(ref.key)) return;
    const buf = await hydrateSample(ref, ctx);
    if (buf) engine.setSampleBuffer(ref.key, buf);
  }));
}

export function useBeatsDoc(launchGrooveId?: string, launchProdId?: string): BeatsDocApi {
  const docRef = useRef<GrooveDoc | null>(null);
  if (!docRef.current) {
    docRef.current = newGrooveDoc(auth.currentUser?.uid || '');
    BeatsEngine.get().loadDoc(docRef.current);
  }
  const [rev, setRev] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('local');
  const [grooves, setGrooves] = useState<GrooveSummary[]>([]);
  const prodIdRef = useRef<string | null>(launchProdId || null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<{ past: GrooveDoc[]; future: GrooveDoc[] }>({ past: [], future: [] });
  // Gesture transactions: every mutate while a pointer is held (a clip drag, a trim, a knob turn,
  // a step-paint stroke) folds into ONE undo step — the snapshot is taken on the gesture's first
  // mutate only. Without this a single drag pushed a full doc clone per pointermove and could
  // flush the whole 100-step history. Views need no plumbing: the window owns the gesture.
  const gestureRef = useRef({ active: false, snapped: false });
  useEffect(() => {
    const down = () => { gestureRef.current = { active: true, snapped: false }; };
    const up = () => { gestureRef.current.active = false; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
    };
  }, []);
  const cloneDoc = (doc: GrooveDoc): GrooveDoc => JSON.parse(JSON.stringify(doc));
  const bump = () => setRev((r) => r + 1);

  // ── Local copy (IndexedDB) — written on every change, ahead of the Firestore save ──
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Owner uid while the open groove is someone else's shared project (we're a collaborator). */
  const guestRef = useRef<string | null>(null);
  const persistLocalNow = useCallback(async () => {
    if (localTimer.current) { clearTimeout(localTimer.current); localTimer.current = null; }
    const d = docRef.current;
    // A collaborator's copy of someone else's groove is kept apart from their own grooves.
    if (d) await putLocal('groove', guestRef.current ? GUEST_PROD : prodIdRef.current, d);
  }, []);
  const scheduleLocal = useCallback(() => {
    if (localTimer.current) clearTimeout(localTimer.current);
    localTimer.current = setTimeout(() => { localTimer.current = null; void persistLocalNow(); }, 300);
  }, [persistLocalNow]);
  useEffect(() => {
    const flush = () => { if (localTimer.current) void persistLocalNow(); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis); flush(); };
  }, [persistLocalNow]);

  const saveNow = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const d = docRef.current;
    if (!d) return;
    await persistLocalNow(); // the device copy first — it survives anything the network does
    // Someone else's shared groove: the live session (coedit) is its only shared store. Never
    // write it into a Melos production or the personal creative cloud — that's the owner's.
    if (guestRef.current) { setSaveState('saved'); return; }
    const prodId = prodIdRef.current;
    if (!prodId) { setSaveState('local'); return; }
    const at = d.updatedAt;
    setSaveState('saving');
    const ok = await saveGroove(prodId, d);
    setSaveState(ok ? 'saved' : 'unsaved');
    // Personal cloud copy + version history (the creative cloud coalesces bursts into one upload).
    scheduleCreativeSync({ kind: 'beats', localId: d.id, title: d.name || 'Groove', json: JSON.stringify(d) });
    if (ok) {
      void markSynced('groove', prodId, d.id, at);
      void delLocal('groove', LOCAL_PROD, d.id); // a signed-out copy now lives in the production
      setGrooves(await listMerged(prodId));
    }
  }, [persistLocalNow]);

  const scheduleSave = useCallback(() => {
    scheduleLocal();
    if (!prodIdRef.current || guestRef.current) return;
    setSaveState('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 2500);
  }, [saveNow, scheduleLocal]);

  const lastCoalesce = useRef<string | null>(null);
  const mutate = useCallback((fn: (d: GrooveDoc) => void, opts?: { coalesce?: string }) => {
    const d = docRef.current!;
    const g = gestureRef.current;
    const key = opts?.coalesce ?? null;
    const continuing = key !== null && key === lastCoalesce.current;
    lastCoalesce.current = key;
    if (continuing) { /* same pass as the previous mutation — already snapshotted */ }
    else if (!g.active || !g.snapped) {
      historyRef.current.past.push(cloneDoc(d));
      if (historyRef.current.past.length > 100) historyRef.current.past.shift();
      historyRef.current.future = [];
      g.snapped = g.active;
    }
    fn(d);
    d.updatedAt = Date.now();
    BeatsEngine.get().applyDocPatch({}); // re-apply node params (gains, routing, mutes)
    bump();
    scheduleSave();
  }, [scheduleSave]);

  // Swap in a different document (open, new, import) — a fresh undo history and engine load.
  const swapIn = useCallback((doc: GrooveDoc) => {
    if (localTimer.current) void persistLocalNow(); // don't drop the outgoing doc's last edits
    historyRef.current = { past: [], future: [] };
    guestRef.current = null; // openShared re-marks it after the swap
    docRef.current = doc;
    BeatsEngine.get().loadDoc(doc);
    bump();
    void hydrateDocSamples(doc).then(bump);
  }, [persistLocalNow]);

  /** Public replace (imports, templates, save-a-copy): also kept on this device right away. */
  const replace = useCallback((doc: GrooveDoc) => {
    swapIn(doc);
    scheduleLocal();
  }, [swapIn, scheduleLocal]);

  // A collaborator's edit, a shared restore or a session undo: the merged doc is folded INTO the
  // live object, so the engine's reference, in-flight gestures and the undo stack all survive.
  // No loadDoc — applyDocPatch re-applies params/tempo/automation without stopping playback.
  const applyRemote = useCallback((merged: GrooveDoc) => {
    const d = docRef.current;
    if (!d || merged.id !== d.id) return; // a late merge for a groove we've since left
    const keysBefore = sampleKeys(d);
    const eqBefore = JSON.stringify(d.mixer?.master?.eq ?? null);
    const masteringBefore = JSON.stringify(d.mixer?.master?.mastering ?? null);
    if (!reconcileInPlace(d, merged)) return;
    lastCoalesce.current = null;
    gestureRef.current.snapped = false;
    const engine = BeatsEngine.get();
    engine.applyDocPatch({});
    const eq = d.mixer?.master?.eq;
    if (eq && JSON.stringify(eq) !== eqBefore) engine.updateMasterEq(eq as never);
    const mastering = d.mixer?.master?.mastering;
    if (mastering && JSON.stringify(mastering) !== masteringBefore) engine.updateMastering(mastering as never);
    bump();
    scheduleSave();
    if (sampleKeys(d) !== keysBefore) void hydrateDocSamples(d).then(bump);
  }, [scheduleSave]);

  const getDoc = useCallback(() => docRef.current!, []);

  /** Open a groove someone shared with us (loaded from the coedit snapshot). The live session
   *  attaches on the next render (useCoedit keys on doc.id = the project's localId). */
  const openShared = useCallback((shared: GrooveDoc, ownerUid: string) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    swapIn(shared);
    guestRef.current = ownerUid;
    setSaveState('saved');
  }, [swapIn]);

  /** Collab role from the live project: a non-owner member is a guest (no Firestore writes). */
  const setGuestOf = useCallback((ownerUid: string | null) => {
    guestRef.current = ownerUid;
    if (ownerUid && saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; setSaveState('saved'); }
  }, []);

  const restoreHistory = useCallback((doc: GrooveDoc) => {
    gestureRef.current.snapped = false; // undo mid-drag: the rest of the drag is a fresh step
    lastCoalesce.current = null;
    docRef.current = doc;
    BeatsEngine.get().loadDoc(doc);
    bump();
    scheduleSave();
    void hydrateDocSamples(doc).then(bump);
  }, [scheduleSave]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    const previous = h.past.pop();
    if (!previous || !docRef.current) return;
    h.future.push(cloneDoc(docRef.current));
    restoreHistory(previous);
  }, [restoreHistory]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next || !docRef.current) return;
    h.past.push(cloneDoc(docRef.current));
    restoreHistory(next);
  }, [restoreHistory]);

  const openGroove = useCallback(async (grooveId: string) => {
    const prodId = prodIdRef.current;
    const best = await loadBest(prodId, grooveId);
    if (!best) return;
    swapIn(best.doc);
    if (!prodId) { setSaveState('local'); return; }
    if (best.unsynced) scheduleSave(); // offline / signed-out edits newer than Firestore — push them up
    else setSaveState('saved');
  }, [swapIn, scheduleSave]);

  const newGroove = useCallback(() => {
    swapIn(newGrooveDoc(auth.currentUser?.uid || ''));
    setSaveState(prodIdRef.current ? 'unsaved' : 'local');
    scheduleSave();
  }, [swapIn, scheduleSave]);

  const removeGroove = useCallback(async (grooveId: string) => {
    const prodId = prodIdRef.current;
    if (prodId) await deleteGroove(prodId, grooveId);
    await delLocal('groove', prodId, grooveId);
    await delLocal('groove', LOCAL_PROD, grooveId);
    setGrooves(await listMerged(prodId));
    if (docRef.current?.id === grooveId) newGroove();
  }, [newGroove]);

  // Open the launch groove from the best copy available. Runs signed out (this device only) and
  // again once auth attaches (device vs Firestore).
  const openLaunch = async (isCancelled: () => boolean) => {
    if (!launchGrooveId) return;
    const prodId = prodIdRef.current;
    const best = await loadBest(prodId, launchGrooveId);
    // Cancelled, or auth attached meanwhile (its own pass, with Firestore, decides instead).
    if (isCancelled() || prodIdRef.current !== prodId) return;
    const cur = docRef.current!;
    if (best) {
      if (cur.id === best.doc.id && (cur.updatedAt || 0) >= (best.doc.updatedAt || 0)) {
        // Already showing this version (or newer edits made before sign-in) — keep it, push it up.
        if (prodId) scheduleSave();
        return;
      }
      swapIn(best.doc);
      if (!prodId) setSaveState('local');
      else if (best.unsynced) scheduleSave();
      else setSaveState('saved');
      return;
    }
    if (cur.id === launchGrooveId) { setSaveState(prodId ? 'unsaved' : 'local'); return; }
    // A brand-new song's project may not have finished its first save yet. Start blank but
    // UNDER the linked id, so the very first edit autosaves back to the song's project.
    // updatedAt 0: an untouched blank must never outrank a real copy found later.
    const blank = newGrooveDoc(auth.currentUser?.uid || '', 'Untitled');
    blank.id = launchGrooveId;
    blank.updatedAt = 0;
    swapIn(blank); setSaveState(prodId ? 'unsaved' : 'local');
  };

  // Attach persistence when auth is available (immediately, or on later sign-in).
  useEffect(() => {
    requestPersistentStorage();
    let cancelled = false;
    const isCancelled = () => cancelled;
    const attach = async () => {
      if (prodIdRef.current === null) {
        const prodId = launchProdId || (await ensureScratchProduction());
        if (cancelled || !prodId) return;
        prodIdRef.current = prodId;
      }
      const list = await listMerged(prodIdRef.current);
      if (cancelled) return;
      setGrooves(list);
      // Only open a groove the caller explicitly asked for. A fresh Studio session (or a New
      // Song) must be a BLANK timeline — do NOT auto-resume list[0], which showed the user a
      // previous session's clips. Saved grooves are still one click away in the groove list.
      if (launchGrooveId) { await openLaunch(isCancelled); return; }
      setSaveState('unsaved'); // fresh blank doc, autosaves on first edit
    };
    if (auth.currentUser) void attach();
    else {
      // Signed out: this device's copy is the only one — open it and list local grooves.
      void (async () => {
        await openLaunch(isCancelled);
        const list = await listMerged(null);
        if (!cancelled && !prodIdRef.current) setGrooves(list);
      })();
    }
    const unsub = auth.onAuthStateChanged((u) => { if (u && !prodIdRef.current) void attach(); });
    return () => { cancelled = true; unsub(); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { doc: docRef.current, rev, saveState, grooves, mutate, undo, redo, canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0, replace, applyRemote, getDoc, openShared, setGuestOf, isGuest: () => !!guestRef.current, saveNow, openGroove, newGroove, removeGroove };
}
