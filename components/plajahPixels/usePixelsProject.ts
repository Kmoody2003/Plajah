// components/plajahPixels/usePixelsProject.ts — the Pixels studio's project lifecycle:
//
//   • one PixelsProjectDoc built from live studio state (identity changes only on real edits);
//   • local-first: debounced (800 ms) autosave to IndexedDB, last open project restored on load;
//   • personal cloud copy + version history via scheduleCreativeSync({ kind: 'pixels' });
//   • live co-editing via useCoedit — remote merges land part by part (applyPixelsDoc).
//
// The manual .plajah export / cloud "Save project" flow in the studio is untouched; loading one of
// those starts a fresh project id here (startNewProject).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useCoedit } from '../../hooks/useCoedit';
import {
  getCloudHead,
  isCloudNewer,
  loadCloudProject as loadCreativeCloudProject,
  scheduleCreativeSync,
} from '../../services/creativeCloud/cloudStore';
import type { LauncherLayer } from './components/ClipLauncher';
import {
  PIXELS_COEDIT_KIND,
  applyPixelsDoc,
  buildPixelsDoc,
  docLayers,
  newPixelsProjectId,
  parsePixelsDoc,
  pixelsDocKey,
  pixelsLabeler,
  stableKey,
  type PixelsApplyOptions,
  type PixelsApplyTarget,
  type PixelsLiveState,
  type PixelsProjectDoc,
} from './pixelsProjectDoc';

const LAST_KEY = 'pixels:last-project';
const docStoreKey = (id: string) => `pixels:project:${id}`;
const AUTOSAVE_MS = 800;
const DEFAULT_TITLE = 'Pixels set';

export interface UsePixelsProjectInput {
  /** False in the program-out window (render-only) — no autosave, no collab. */
  enabled: boolean;
  /** Start a fresh project instead of reopening the last one (e.g. launched straight into a look). */
  fresh?: boolean;
  /** Pixels opened from a track: the platform owns audio and media pool 1. */
  platformMode?: boolean;
  live: PixelsLiveState;
  target: PixelsApplyTarget;
}

export function usePixelsProject(input: UsePixelsProjectInput) {
  const { enabled, fresh, platformMode } = input;
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [hydrated, setHydrated] = useState(false);

  const liveRef = useRef(input.live);
  liveRef.current = input.live;
  const targetRef = useRef(input.target);
  targetRef.current = input.target;

  // The deck as the doc sees it. Set directly when a doc is applied (so the render right after a
  // merge already matches it), and from the launcher's own emissions otherwise.
  const [deck, setDeck] = useState<LauncherLayer[] | null>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const pendingImport = useRef<{ key: string; until: number } | null>(null);
  useEffect(() => {
    const layers = input.live.layers;
    if (!layers.length) return;
    const p = pendingImport.current;
    if (p) {
      // Ignore the launcher's stale emissions until it has taken the imported layers.
      if (Date.now() < p.until && stableKey(docLayers(layers)) !== p.key) return;
      pendingImport.current = null;
    }
    setDeck(layers);
  }, [input.live.layers]);

  // Last applied doc (restore / remote merge / history): the rebuilt doc reuses its identity when
  // the content matches, so applying never echoes back as a fresh local edit.
  const applied = useRef<{ doc: PixelsProjectDoc; key: string } | null>(null);
  const lastDoc = useRef<{ doc: PixelsProjectDoc; key: string } | null>(null);
  /** The doc reopened from IndexedDB — already on disk, no need to write it again. */
  const restoredDoc = useRef<PixelsProjectDoc | null>(null);

  const applyDoc = useCallback(
    (doc: PixelsProjectDoc, extra: PixelsApplyOptions = {}) => {
      const live = liveRef.current;
      const cur: PixelsLiveState = { ...live, layers: deckRef.current ?? live.layers };
      const t = targetRef.current;
      const imported = applyPixelsDoc(
        doc,
        cur,
        {
          ...t,
          importLayers: (layers) => {
            pendingImport.current = { key: stableKey(docLayers(layers)), until: Date.now() + 1500 };
            t.importLayers(layers);
          },
        },
        { skipAudio: platformMode, ...extra }
      );
      if (imported) setDeck(imported);
      setTitle(doc.title || DEFAULT_TITLE);
      applied.current = { doc, key: pixelsDocKey(doc) };
    },
    [platformMode]
  );

  // ── Restore the last open project (local first, then a newer cloud copy) ──
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      let restored: PixelsProjectDoc | null = null;
      if (!fresh) {
        try {
          const lastId = await idbGet<string>(LAST_KEY);
          if (lastId) restored = parsePixelsDoc(await idbGet(docStoreKey(lastId)));
        } catch {
          /* private mode / no IndexedDB → start fresh */
        }
      }
      if (!alive) return;
      if (restored) {
        setProjectId(restored.id);
        restoredDoc.current = restored;
        applyDoc(restored, { skipBgMedia1: platformMode });
      } else {
        setProjectId(newPixelsProjectId());
      }
      setHydrated(true);

      // Another device saved this project since? Take it if nothing was edited here meanwhile.
      if (restored) {
        const head = await getCloudHead(PIXELS_COEDIT_KIND, restored.id);
        if (!alive || !isCloudNewer(head, restored.updatedAt)) return;
        const cloud = await loadCreativeCloudProject(PIXELS_COEDIT_KIND, restored.id);
        const doc = cloud ? parsePixelsDoc(cloud.json) : null;
        if (!alive || !doc || doc.id !== restored.id) return;
        if (lastDoc.current && lastDoc.current.doc.updatedAt !== restored.updatedAt) return; // edited here already
        applyDoc(doc, { skipBgMedia1: platformMode });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── The doc (identity changes only on real content changes) ──
  const { config, bgMedia1, bgMedia2, look, audio } = input.live;
  const layersForDoc = deck ?? input.live.layers;
  const doc = useMemo<PixelsProjectDoc | null>(() => {
    if (!enabled || !hydrated || !projectId) return null;
    const draftAudio = platformMode ? lastDoc.current?.doc.audio ?? applied.current?.doc.audio ?? {} : audio;
    const draft = buildPixelsDoc(
      { id: projectId, title, updatedAt: 0 },
      { config, bgMedia1, bgMedia2, layers: layersForDoc, look, audio: draftAudio }
    );
    const key = pixelsDocKey(draft);
    const prev = lastDoc.current;
    if (prev && prev.doc.id === projectId && prev.key === key) return prev.doc;
    const a = applied.current;
    if (a && a.doc.id === projectId && a.key === key) {
      lastDoc.current = a;
      return a.doc;
    }
    const next = { ...draft, updatedAt: Date.now() };
    lastDoc.current = { doc: next, key };
    return next;
  }, [enabled, hydrated, projectId, title, config, bgMedia1, bgMedia2, layersForDoc, look, audio, platformMode]);

  // ── Autosave: IndexedDB (debounced) + personal cloud history ──
  const saveNow = useCallback((d: PixelsProjectDoc) => {
    void idbSet(docStoreKey(d.id), d).catch(() => {});
    void idbSet(LAST_KEY, d.id).catch(() => {});
    scheduleCreativeSync({ kind: PIXELS_COEDIT_KIND, localId: d.id, title: d.title, json: JSON.stringify(d) });
  }, []);
  const unsaved = useRef<PixelsProjectDoc | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (restoredDoc.current === doc && !unsaved.current) {
      // Restored as-is: nothing new to write, but remember it as the open project.
      void idbSet(LAST_KEY, doc.id).catch(() => {});
      return;
    }
    unsaved.current = doc;
    const t = setTimeout(() => {
      unsaved.current = null;
      saveNow(doc);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, saveNow]);
  useEffect(() => {
    const flush = () => {
      if (unsaved.current) {
        saveNow(unsaved.current);
        unsaved.current = null;
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [saveNow]);

  // ── Live co-editing ──
  const applyRemote = useCallback((d: PixelsProjectDoc) => applyDoc(d), [applyDoc]);
  const co = useCoedit<PixelsProjectDoc>({
    kind: PIXELS_COEDIT_KIND,
    localId: projectId,
    title,
    doc,
    applyRemote,
    labeler: pixelsLabeler,
    enabled,
  });

  /** A .plajah / cloud "Save project" load opens as a new project (the open one stays saved). */
  const startNewProject = useCallback((nextTitle?: string) => {
    if (unsaved.current) {
      saveNow(unsaved.current);
      unsaved.current = null;
    }
    applied.current = null;
    setProjectId(newPixelsProjectId());
    setTitle(nextTitle?.trim() || DEFAULT_TITLE);
  }, [saveNow]);

  /** Restore a solo (not yet shared) cloud version into the open project. */
  const restoreJson = useCallback(
    (json: string) => {
      const d = parsePixelsDoc(json);
      if (!d) throw new Error('Not a Pixels project version.');
      // Restored content becomes a new edit of the open project (so it saves and syncs).
      applyDoc({ ...d, id: projectId ?? d.id }, { skipBgMedia1: platformMode });
      applied.current = null;
    },
    [applyDoc, projectId, platformMode]
  );

  /** Name the set (only replaces the default/auto title unless forced). */
  const nameProject = useCallback((name: string, force = false) => {
    const n = name.trim();
    if (!n) return;
    setTitle((t) => (force || t === DEFAULT_TITLE ? n : t));
  }, []);

  return { doc, projectId, title, setTitle, nameProject, co, startNewProject, restoreJson, hydrated };
}
