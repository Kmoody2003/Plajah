// The album Project's doc hook — the useBeatsDoc pattern at album scale: one shared object
// mutated in place, revision counter for React, 2.5s debounced autosave. Signed-out sessions
// run fully in memory ('local') and upgrade when auth arrives, exactly like grooves.

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../../../services/firebase';
import { ensureScratchProduction } from '../../../../services/melos/beats/grooveStore';
import {
  loadMasterProject, saveMasterProject, newMasterProject, type MasterProjectDoc,
} from '../../../../services/melos/beats/masterProject';

export type ProjectSaveState = 'local' | 'unsaved' | 'saving' | 'saved';

export function useMasterProject(productionId?: string) {
  const [project, setProject] = useState<MasterProjectDoc>(() => newMasterProject(auth.currentUser?.uid || ''));
  const [saveState, setSaveState] = useState<ProjectSaveState>('local');
  const [, setRev] = useState(0);
  const prodIdRef = useRef<string | null>(productionId || null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const [reloadKey, setReloadKey] = useState(0);
  /** Re-read the doc from Firestore — after an import writes it out from under us. */
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Resolve the production (explicit from the Melos shell, or the user's scratch) and load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prodId = productionId || (await ensureScratchProduction());
      if (cancelled) return;
      prodIdRef.current = prodId;
      if (!prodId) { setSaveState('local'); return; } // signed out — in-memory album
      const loaded = await loadMasterProject(prodId);
      if (cancelled) return;
      if (loaded) { setProject(loaded); setSaveState('saved'); }
      else setSaveState('unsaved');
    })();
    return () => { cancelled = true; };
  }, [productionId, reloadKey]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const prodId = prodIdRef.current || (await ensureScratchProduction());
        prodIdRef.current = prodId;
        if (!prodId) { setSaveState('local'); return; }
        setSaveState('saving');
        const ok = await saveMasterProject(prodId, projectRef.current);
        setSaveState(ok ? 'saved' : 'local');
      })();
    }, 2500);
  }, []);

  /** Mutate the shared project object in place — the useBeatsDoc contract. */
  const mutateProject = useCallback((fn: (p: MasterProjectDoc) => void) => {
    fn(projectRef.current);
    setRev((r) => r + 1);
    setSaveState((s) => (s === 'local' ? 'local' : 'unsaved'));
    scheduleSave();
  }, [scheduleSave]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return { project, mutateProject, saveState, reload };
}
