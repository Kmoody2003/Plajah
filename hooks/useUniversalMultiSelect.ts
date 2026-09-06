import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SelectionGesture = Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'> | {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

/**
 * Shared selection grammar for every Plajah editor and library.
 * Plain click selects one, Ctrl/Cmd-click toggles, Shift-click selects a range,
 * Ctrl/Cmd+A selects all, and Escape clears. The last interacted item is primary.
 */
export function useUniversalMultiSelect<T extends string>(orderedIds: readonly T[], initial: readonly T[] = []) {
  const [selectedIds, setSelectedIds] = useState<T[]>(() => [...initial]);
  const anchorRef = useRef<T | null>(initial.at(-1) ?? null);
  const orderKey = orderedIds.join('\u0000');

  useEffect(() => {
    const valid = new Set(orderedIds);
    setSelectedIds(current => current.filter(id => valid.has(id)));
    if (anchorRef.current && !valid.has(anchorRef.current)) anchorRef.current = null;
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectOnly = useCallback((id: T | null) => {
    anchorRef.current = id;
    setSelectedIds(id == null ? [] : [id]);
  }, []);

  const selectMany = useCallback((ids: readonly T[], primary?: T | null) => {
    const valid = new Set(orderedIds);
    const next = [...new Set(ids)].filter(id => valid.has(id));
    anchorRef.current = primary === null ? null : (primary ?? next.at(-1) ?? null);
    setSelectedIds(next);
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback((id: T, gesture?: SelectionGesture) => {
    const additive = !!(gesture?.ctrlKey || gesture?.metaKey);
    const ranged = !!gesture?.shiftKey;
    setSelectedIds(current => {
      if (ranged && anchorRef.current) {
        const a = orderedIds.indexOf(anchorRef.current);
        const b = orderedIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const range = orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1) as T[];
          return additive ? [...new Set([...current, ...range])] : range;
        }
      }
      anchorRef.current = id;
      if (additive) return current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      return [id];
    });
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => selectOnly(null), [selectOnly]);
  const selectAll = useCallback(() => selectMany(orderedIds), [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape' && selectedIds.length) clear();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && orderedIds.length) {
        event.preventDefault();
        selectAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds.length, orderKey, clear, selectAll]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => ({
    selectedIds,
    selectedSet: new Set<T>(selectedIds),
    primaryId: selectedIds.at(-1) ?? null,
    isSelected: (id: T) => selectedIds.includes(id),
    handleSelect,
    selectOnly,
    selectMany,
    selectAll,
    clear,
  }), [selectedIds, handleSelect, selectOnly, selectMany, selectAll, clear]);
}
