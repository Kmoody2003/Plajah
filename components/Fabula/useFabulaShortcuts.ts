// useFabulaShortcuts — the global keydown layer for the Fabula editor. Maps the current keymap
// (preset + user overrides) to a set of action handlers the editor provides. Ignores keystrokes
// while typing in a field. Rebuilds when the keymap prefs change so remapping takes effect live.

import { useEffect, useRef } from 'react';
import { buildKeymap, comboFromEvent, isEditableTarget, loadShortcutPrefs, type ShortcutPrefs } from '../../services/fabula/shortcuts';

type Handlers = Record<string, (() => void) | undefined>;

export function useFabulaShortcuts(handlers: Handlers, opts: { enabled?: boolean; prefs?: ShortcutPrefs } = {}) {
  const handlersRef = useRef<Handlers>(handlers);
  handlersRef.current = handlers;
  const enabled = opts.enabled !== false;
  const prefs = opts.prefs;

  useEffect(() => {
    if (!enabled) return undefined;
    const keymap = buildKeymap(prefs || loadShortcutPrefs());
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const actionId = combo === 'Ctrl+Y' ? 'edit.redo' : keymap.get(combo);
      if (!actionId) return;
      const fn = handlersRef.current[actionId];
      if (typeof fn === 'function') { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, prefs]);
}
