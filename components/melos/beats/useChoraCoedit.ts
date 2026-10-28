// Live collaboration for Chora's mutable documents (the groove and the album master project).
//
// Chora edits ONE object in place and re-renders off a revision counter, so the object's identity
// never changes. useCoedit wants a new value per edit; this hands it a cheap shallow copy taken
// when the revision moves (throttled, so a knob drag doesn't diff the whole song per frame). The
// copy's nested objects are the live ones, and `mutableDocs` makes the session deep-clone on
// intake, so nothing the session holds can be mutated behind its back.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCoedit, type UseCoedit } from '../../../hooks/useCoedit';

const THROTTLE_MS = 150;

export function useChoraCoedit<T extends object>(input: {
  kind: string;
  localId: string | null | undefined;
  title: string;
  rev: number;
  getDoc: () => T | null | undefined;
  applyRemote: (doc: T) => void;
  enabled?: boolean;
}): UseCoedit<T> {
  const { rev } = input;
  const [tick, setTick] = useState(rev);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const wait = THROTTLE_MS - (performance.now() - last.current);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (wait <= 0) { last.current = performance.now(); setTick(rev); return; }
    timer.current = setTimeout(() => { timer.current = null; last.current = performance.now(); setTick(rev); }, wait);
  }, [rev]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const getDoc = useRef(input.getDoc);
  getDoc.current = input.getDoc;
  const doc = useMemo(() => {
    const d = getDoc.current();
    return d ? ({ ...d } as T) : null;
  }, [tick, input.localId]); // eslint-disable-line react-hooks/exhaustive-deps

  return useCoedit<T>({
    kind: input.kind,
    localId: input.localId,
    title: input.title,
    doc,
    applyRemote: input.applyRemote,
    mutableDocs: true,
    enabled: input.enabled,
    // The live (in-place) doc, so a remote merge never lands on a snapshot up to 150 ms stale.
    localSource: () => {
      const d = getDoc.current();
      return d ? ({ ...d } as T) : d;
    },
  });
}
