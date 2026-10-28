// The album Project's doc hook — the useBeatsDoc pattern at album scale: one shared object
// mutated in place, revision counter for React, 2.5s debounced autosave. Signed-out sessions
// run fully in memory ('local') and upgrade when auth arrives, exactly like grooves.
//
// Offline-first like grooves: every change goes to IndexedDB (localDocCache) before Firestore,
// open compares the device copy with Firestore's by updatedAt (newer wins), and each save queues
// a personal creative-cloud copy (kind 'melos') for version history. `applyRemote` folds a
// collaborator's merged project into the live object (reconcileInPlace) without a reload.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../../../services/firebase';
import { ensureScratchProduction } from '../../../../services/melos/beats/grooveStore';
import {
  loadMasterProject, saveMasterProject, newMasterProject, type MasterProjectDoc,
} from '../../../../services/melos/beats/masterProject';
import { LOCAL_PROD, getLocal, markSynced, pickNewer, putLocal } from '../../../../services/melos/beats/localDocCache';
import { reconcileInPlace } from '../../../../services/melos/beats/reconcileInPlace';
import { scheduleCreativeSync } from '../../../../services/creativeCloud/cloudStore';

export type ProjectSaveState = 'local' | 'unsaved' | 'saving' | 'saved';

/** One album per production — the collab / creative-cloud id has to carry the production. */
export const masterProjectLocalId = (prodId: string | null, projectId: string) => `${prodId || LOCAL_PROD}__${projectId}`;

export function useMasterProject(productionId?: string) {
  const [project, setProject] = useState<MasterProjectDoc>(() => newMasterProject(auth.currentUser?.uid || ''));
  const [saveState, setSaveState] = useState<ProjectSaveState>('local');
  const [rev, setRev] = useState(0);
  const prodIdRef = useRef<string | null>(productionId || null);
  const [prodId, setProdId] = useState<string | null>(productionId || null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const [reloadKey, setReloadKey] = useState(0);
  /** Re-read the doc from Firestore — after an import writes it out from under us. */
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // ── Local copy (IndexedDB), written ahead of every Firestore save ──
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistLocalNow = useCallback(async () => {
    if (localTimer.current) { clearTimeout(localTimer.current); localTimer.current = null; }
    await putLocal('master', prodIdRef.current, projectRef.current);
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

  /** Write the project now — the Save button / Ctrl+S, and what the autosave debounce calls. */
  const saveNow = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    await persistLocalNow(); // the device copy first — it survives anything the network does
    const pid = prodIdRef.current || (await ensureScratchProduction());
    if (pid !== prodIdRef.current) { prodIdRef.current = pid; setProdId(pid); }
    if (!pid) { setSaveState('local'); return; }
    const p = projectRef.current;
    const at = p.updatedAt;
    setSaveState('saving');
    const ok = await saveMasterProject(pid, p);
    setSaveState(ok ? 'saved' : 'local');
    // Personal cloud copy + version history (the creative cloud coalesces bursts into one upload).
    scheduleCreativeSync({
      kind: 'melos',
      localId: masterProjectLocalId(pid, p.id),
      title: p.publishing?.title || 'Album project',
      json: JSON.stringify(p),
    });
    if (ok) void markSynced('master', pid, p.id, at);
  }, [persistLocalNow]);

  const scheduleSave = useCallback(() => {
    scheduleLocal();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 2500);
  }, [saveNow, scheduleLocal]);

  // Resolve the production (explicit from the Melos shell, or the user's scratch) and load the
  // newer of this device's copy and Firestore's.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pid = productionId || (await ensureScratchProduction());
      if (cancelled) return;
      prodIdRef.current = pid;
      setProdId(pid);
      const [local, remote] = await Promise.all([
        getLocal<MasterProjectDoc>('master', pid, 'album'),
        pid ? loadMasterProject(pid) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const pick = pickNewer(local, remote);
      if (pick) {
        const p = pick.doc;
        if (!Array.isArray(p.tracks)) p.tracks = [];
        if (!p.publishing) p.publishing = newMasterProject(p.ownerId || '').publishing;
        projectRef.current = p;
        setProject(p);
      }
      if (!pid) { setSaveState('local'); return; } // signed out — device copy only
      if (pick?.unsynced) { setSaveState('unsaved'); scheduleSave(); } // offline edits → push up
      else setSaveState(pick ? 'saved' : 'unsaved');
    })();
    return () => { cancelled = true; };
  }, [productionId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Mutate the shared project object in place — the useBeatsDoc contract. */
  const mutateProject = useCallback((fn: (p: MasterProjectDoc) => void) => {
    fn(projectRef.current);
    projectRef.current.updatedAt = Date.now(); // "which copy is newer" (device vs Firestore) needs it
    setRev((r) => r + 1);
    setSaveState((s) => (s === 'local' ? 'local' : 'unsaved'));
    scheduleSave();
  }, [scheduleSave]);

  /** A collaborator's merged project — folded into the live object, no reload, no lost refs. */
  const applyRemote = useCallback((merged: MasterProjectDoc) => {
    const p = projectRef.current;
    if (merged.id !== p.id) return;
    if (!reconcileInPlace(p, merged)) return;
    setRev((r) => r + 1);
    setSaveState((s) => (s === 'local' ? 'local' : 'unsaved'));
    scheduleSave();
  }, [scheduleSave]);

  const getProject = useCallback(() => projectRef.current, []);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return {
    project, mutateProject, saveState, saveNow, reload,
    rev, applyRemote, getProject,
    /** Stable id for collaboration + creative-cloud history (null until the production resolves). */
    localId: prodId ? masterProjectLocalId(prodId, project.id) : null,
  };
}
