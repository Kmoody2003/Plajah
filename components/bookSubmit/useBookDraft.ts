import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookDraft } from '../../services/bookmeta/types';
import { saveLocal, saveCloud } from '../../services/bookmeta/drafts';
import { runPreflight, type PreflightResult } from '../../services/bookmeta/preflight';
import { computeA11y } from '../../services/bookmeta/accessibility';

export type SaveState = 'saved' | 'saving' | 'local' | 'error';

/**
 * Owns the in-progress BookDraft. Every change is written to IndexedDB after ~0.6s and to Firestore/Storage after
 * ~4s of quiet, flushed on tab hide / unmount, so a closed laptop never costs the author their work.
 * `save` shows 'local' when the cloud copy is lagging or offline (the local copy is still safe).
 */
export function useBookDraft(initial: BookDraft) {
  const [draft, setDraft] = useState<BookDraft>(initial);
  const [save, setSave] = useState<SaveState>('saved');
  const latest = useRef(draft); latest.current = draft;
  const dirty = useRef(false);
  const localT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cloudT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(localT.current); clearTimeout(cloudT.current);
    if (!dirty.current) return;
    const d = { ...latest.current, updatedAt: Date.now() };
    setSave('saving');
    const okLocal = await saveLocal(d);
    const okCloud = await saveCloud(d);
    if (okLocal || okCloud) dirty.current = false;
    setSave(okCloud ? 'saved' : okLocal ? 'local' : 'error');
  }, []);

  const update = useCallback((patch: Partial<BookDraft> | ((d: BookDraft) => Partial<BookDraft>)) => {
    setDraft(d => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch), updatedAt: Date.now() }));
    dirty.current = true;
    setSave('local');
    clearTimeout(localT.current); clearTimeout(cloudT.current);
    localT.current = setTimeout(() => { void saveLocal({ ...latest.current, updatedAt: Date.now() }); }, 600);
    cloudT.current = setTimeout(() => { void flush(); }, 4000);
  }, [flush]);

  const updateMeta = useCallback((patch: Partial<BookDraft['metadata']>) => update(d => ({ metadata: { ...d.metadata, ...patch } })), [update]);
  const updatePricing = useCallback((patch: Partial<BookDraft['pricing']>) => update(d => ({ pricing: { ...d.pricing, ...patch } })), [update]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide as any);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide as any); void flush(); };
  }, [flush]);

  const a11y = useMemo(() => computeA11y(draft), [draft.manuscript, draft.metadata, draft.a11yBase]);
  const preflight: PreflightResult = useMemo(() => runPreflight({
    metadata: draft.metadata, cover: draft.cover, pricing: draft.pricing,
    chapters: draft.manuscript?.chapters ?? [], epubFindings: draft.epubFindings, accessibilityScore: a11y.score,
  }), [draft.metadata, draft.cover, draft.pricing, draft.manuscript, draft.epubFindings, a11y.score]);

  return { draft, update, updateMeta, updatePricing, save, flush, preflight, a11y };
}
