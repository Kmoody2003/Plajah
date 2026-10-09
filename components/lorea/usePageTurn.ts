// usePageTurn: resolves WHICH page turn plays (author's choice vs the reader's own setting vs reduced motion) and
// owns the reader's device-local settings. The animation itself lives in PageTurn.tsx.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  resolvePageTurn, type AuthorPageTurn, type BookKind, type PageAnimationPref, type ResolvedPageTurn,
} from '../../services/lorea/pageTransitions';
import {
  readPageTurnPrefs, subscribePageTurnPrefs, writePageTurnPrefs, type PageTurnPrefs,
} from '../../services/lorea/pageTurnPrefs';

const QUERY = '(prefers-reduced-motion: reduce)';

/** OS-level reduced motion. Live: flips if the user changes the system setting while reading. */
export function useSystemReducedMotion(): boolean {
  const get = () => { try { return !!window.matchMedia?.(QUERY).matches; } catch { return false; } };
  const [r, setR] = useState(get);
  useEffect(() => {
    let mq: MediaQueryList | undefined;
    try { mq = window.matchMedia?.(QUERY); } catch { return; }
    if (!mq) return;
    const h = () => setR(!!mq!.matches);
    mq.addEventListener?.('change', h);
    return () => mq!.removeEventListener?.('change', h);
  }, []);
  return r;
}

export function usePageTurnPrefs(): { prefs: PageTurnPrefs; setAnimation: (a: PageAnimationPref) => void; setSound: (s: boolean) => void } {
  const [prefs, setPrefs] = useState<PageTurnPrefs>(readPageTurnPrefs);
  useEffect(() => subscribePageTurnPrefs(setPrefs), []);
  const setAnimation = useCallback((animation: PageAnimationPref) => writePageTurnPrefs({ ...readPageTurnPrefs(), animation }), []);
  const setSound = useCallback((sound: boolean) => writePageTurnPrefs({ ...readPageTurnPrefs(), sound }), []);
  return { prefs, setAnimation, setSound };
}

export interface UsePageTurnOpts {
  kind: BookKind;
  /** The author's choice from the book edition (Album.bookTela.pageTurn / Tela bundle). */
  author?: AuthorPageTurn;
  chapterId?: string;
  pageId?: string;
  /** Reader-side override for tests and the lab. Falls back to the stored setting. */
  prefOverride?: PageAnimationPref;
  reducedOverride?: boolean;
}

export interface UsePageTurnResult {
  turn: ResolvedPageTurn;
  prefs: PageTurnPrefs;
  setAnimation: (a: PageAnimationPref) => void;
  setSound: (s: boolean) => void;
  reducedMotion: boolean;
  /** Sound only when the reader switched it on AND the turn is a real (non-reduced) animation. */
  soundOn: boolean;
}

export function usePageTurn(o: UsePageTurnOpts): UsePageTurnResult {
  const { prefs, setAnimation, setSound } = usePageTurnPrefs();
  const sysReduced = useSystemReducedMotion();
  const reducedMotion = o.reducedOverride ?? sysReduced;
  const pref = o.prefOverride ?? prefs.animation;
  const turn = useMemo(
    () => resolvePageTurn({ pref, systemReducedMotion: reducedMotion, author: o.author, chapterId: o.chapterId, pageId: o.pageId, kind: o.kind }),
    [pref, reducedMotion, o.author, o.chapterId, o.pageId, o.kind],
  );
  const soundOn = prefs.sound && turn.id !== 'none' && turn.reason !== 'reduced-system' && turn.reason !== 'reduced-pref';
  return { turn, prefs, setAnimation, setSound, reducedMotion, soundOn };
}
