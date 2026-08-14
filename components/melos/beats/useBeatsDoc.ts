// The groove document lives in a ref (ONE mutable object shared with the engine — the scheduler
// reads it on every tick, so edits are audible on the very next step with no copy/sync layer).
// React re-renders via a revision counter. Persistence: autosaved to the user's Melos scratch
// production (melosProductions/scratch_{uid}/grooves), samples hydrated from OPFS → locker.
// Signed-out sessions run fully in-memory ('local') and upgrade when auth appears.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../../services/firebase';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { newGrooveDoc, type GrooveDoc } from '../../../services/melos/beats/grooveDoc';
import {
  ensureScratchProduction, saveGroove, loadGroove, listGrooves, deleteGroove, type GrooveSummary,
} from '../../../services/melos/beats/grooveStore';
import { hydrateSample, requestPersistentStorage } from '../../../services/melos/beats/sampleStore';

export type SaveState = 'local' | 'unsaved' | 'saving' | 'saved';

export interface BeatsDocApi {
  doc: GrooveDoc;
  rev: number;
  saveState: SaveState;
  grooves: GrooveSummary[];
  mutate: (fn: (d: GrooveDoc) => void) => void;
  replace: (doc: GrooveDoc) => void;
  saveNow: () => Promise<void>;
  openGroove: (grooveId: string) => Promise<void>;
  newGroove: () => void;
  removeGroove: (grooveId: string) => Promise<void>;
}

async function hydrateDocSamples(doc: GrooveDoc): Promise<void> {
  const engine = BeatsEngine.get();
  await engine.init().catch(() => { /* pre-gesture: samples hydrate again on first play */ });
  const ctx = engine.getContext();
  if (!ctx) return;
  const refs = [
    ...doc.kit.filter((p) => p.sample).map((p) => p.sample!),
    ...doc.arrangement.flatMap((t) => t.clips.filter((c) => c.audio).map((c) => ({
      key: c.audio!.sampleKey, name: c.audio!.name, durationSec: c.audio!.durationSec,
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
  const bump = () => setRev((r) => r + 1);

  const saveNow = useCallback(async () => {
    const prodId = prodIdRef.current;
    if (!prodId || !docRef.current) return;
    setSaveState('saving');
    const ok = await saveGroove(prodId, docRef.current);
    setSaveState(ok ? 'saved' : 'unsaved');
    if (ok) setGrooves(await listGrooves(prodId));
  }, []);

  const scheduleSave = useCallback(() => {
    if (!prodIdRef.current) return;
    setSaveState('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 2500);
  }, [saveNow]);

  const mutate = useCallback((fn: (d: GrooveDoc) => void) => {
    const d = docRef.current!;
    fn(d);
    d.updatedAt = Date.now();
    BeatsEngine.get().applyDocPatch({}); // re-apply node params (gains, routing, mutes)
    bump();
    scheduleSave();
  }, [scheduleSave]);

  const replace = useCallback((doc: GrooveDoc) => {
    docRef.current = doc;
    BeatsEngine.get().loadDoc(doc);
    bump();
    void hydrateDocSamples(doc).then(bump);
  }, []);

  const openGroove = useCallback(async (grooveId: string) => {
    const prodId = prodIdRef.current;
    if (!prodId) return;
    const loaded = await loadGroove(prodId, grooveId);
    if (loaded) { replace(loaded); setSaveState('saved'); }
  }, [replace]);

  const newGroove = useCallback(() => {
    replace(newGrooveDoc(auth.currentUser?.uid || ''));
    setSaveState(prodIdRef.current ? 'unsaved' : 'local');
    scheduleSave();
  }, [replace, scheduleSave]);

  const removeGroove = useCallback(async (grooveId: string) => {
    const prodId = prodIdRef.current;
    if (!prodId) return;
    await deleteGroove(prodId, grooveId);
    setGrooves(await listGrooves(prodId));
    if (docRef.current?.id === grooveId) newGroove();
  }, [newGroove]);

  // Attach persistence when auth is available (immediately, or on later sign-in).
  useEffect(() => {
    requestPersistentStorage();
    let cancelled = false;
    const attach = async () => {
      if (prodIdRef.current === null) {
        const prodId = launchProdId || (await ensureScratchProduction());
        if (cancelled || !prodId) return;
        prodIdRef.current = prodId;
      }
      const list = await listGrooves(prodIdRef.current);
      if (cancelled) return;
      setGrooves(list);
      const target = launchGrooveId || list[0]?.id;
      if (target) {
        const loaded = await loadGroove(prodIdRef.current, target);
        if (!cancelled && loaded) { replace(loaded); setSaveState('saved'); return; }
      }
      setSaveState('unsaved'); // fresh doc, will autosave on first edit
    };
    if (auth.currentUser) void attach();
    const unsub = auth.onAuthStateChanged((u) => { if (u && !prodIdRef.current) void attach(); });
    return () => { cancelled = true; unsub(); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { doc: docRef.current, rev, saveState, grooves, mutate, replace, saveNow, openGroove, newGroove, removeGroove };
}
