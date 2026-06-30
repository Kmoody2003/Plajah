// shortcuts.ts — Fabula's keyboard system. A registry of editor ACTIONS (each with default + Resolve
// + Premiere bindings), preset keymaps, user-remappable overrides (persisted), conflict detection,
// and a global dispatch that turns a keydown into the bound action's handler. The editor registers a
// handler per action id; this layer owns the key → action mapping so users can rebind anything.

export type KeyCombo = string;            // normalized, e.g. "Ctrl+Shift+Z", "B", "ArrowLeft", "Space"
export type PresetId = 'fabula' | 'resolve' | 'premiere';

export interface ShortcutAction {
  id: string;
  label: string;
  category: string;
  fabula: KeyCombo;       // default binding
  resolve?: KeyCombo;     // falls back to `fabula` when unset
  premiere?: KeyCombo;
}

// ── The action registry (Resolve Edit-page-oriented) ─────────────────────────────
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Playback / transport
  { id: 'playback.playPause', label: 'Play / Pause', category: 'Playback', fabula: 'Space' },
  { id: 'playback.shuttleBack', label: 'Shuttle reverse', category: 'Playback', fabula: 'J' },
  { id: 'playback.shuttleStop', label: 'Stop', category: 'Playback', fabula: 'K' },
  { id: 'playback.shuttleFwd', label: 'Shuttle forward', category: 'Playback', fabula: 'L' },
  { id: 'playback.stepBack', label: 'Step frame back', category: 'Playback', fabula: 'ArrowLeft' },
  { id: 'playback.stepFwd', label: 'Step frame forward', category: 'Playback', fabula: 'ArrowRight' },
  { id: 'playback.prevEdit', label: 'Jump to previous edit', category: 'Playback', fabula: 'ArrowUp' },
  { id: 'playback.nextEdit', label: 'Jump to next edit', category: 'Playback', fabula: 'ArrowDown' },
  { id: 'playback.start', label: 'Go to start', category: 'Playback', fabula: 'Home' },
  { id: 'playback.end', label: 'Go to end', category: 'Playback', fabula: 'End' },
  // Marks
  { id: 'marks.in', label: 'Mark In', category: 'Marks', fabula: 'I' },
  { id: 'marks.out', label: 'Mark Out', category: 'Marks', fabula: 'O' },
  { id: 'marks.clearIn', label: 'Clear In', category: 'Marks', fabula: 'Alt+I' },
  { id: 'marks.clearOut', label: 'Clear Out', category: 'Marks', fabula: 'Alt+O' },
  { id: 'marks.markClip', label: 'Mark Clip', category: 'Marks', fabula: 'X' },
  { id: 'marks.addMarker', label: 'Add Marker', category: 'Marks', fabula: 'M' },
  // Edit
  { id: 'edit.blade', label: 'Blade at playhead', category: 'Edit', fabula: 'B', premiere: 'Ctrl+K' },
  { id: 'edit.bladeAll', label: 'Blade all tracks', category: 'Edit', fabula: 'Shift+B', premiere: 'Ctrl+Shift+K' },
  { id: 'edit.delete', label: 'Delete (leave gap)', category: 'Edit', fabula: 'Delete' },
  { id: 'edit.rippleDelete', label: 'Ripple delete (close gap)', category: 'Edit', fabula: 'Shift+Delete' },
  { id: 'edit.duplicate', label: 'Duplicate clip', category: 'Edit', fabula: 'Ctrl+D' },
  { id: 'edit.cut', label: 'Cut', category: 'Edit', fabula: 'Ctrl+X' },
  { id: 'edit.copy', label: 'Copy', category: 'Edit', fabula: 'Ctrl+C' },
  { id: 'edit.paste', label: 'Paste', category: 'Edit', fabula: 'Ctrl+V' },
  { id: 'edit.undo', label: 'Undo', category: 'Edit', fabula: 'Ctrl+Z' },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', fabula: 'Ctrl+Shift+Z' },
  { id: 'edit.nudgeLeft', label: 'Nudge clip left', category: 'Edit', fabula: ',', premiere: 'Alt+ArrowLeft' },
  { id: 'edit.nudgeRight', label: 'Nudge clip right', category: 'Edit', fabula: '.', premiere: 'Alt+ArrowRight' },
  { id: 'edit.insert', label: 'Insert edit', category: 'Edit', fabula: 'F9', premiere: ',' },
  { id: 'edit.overwrite', label: 'Overwrite edit', category: 'Edit', fabula: 'F10', premiere: '.' },
  { id: 'edit.toggleDisable', label: 'Enable / disable clip', category: 'Edit', fabula: 'D', premiere: 'Shift+E' },
  { id: 'edit.retime', label: 'Retime / speed', category: 'Edit', fabula: 'R' },
  // Transitions
  { id: 'transition.addDefault', label: 'Add cross dissolve', category: 'Transitions', fabula: 'Ctrl+T', premiere: 'Ctrl+D' },
  // Tools
  { id: 'tool.select', label: 'Selection tool', category: 'Tools', fabula: 'A', premiere: 'V' },
  { id: 'tool.trim', label: 'Trim tool', category: 'Tools', fabula: 'T' },
  // Timeline
  { id: 'timeline.snapping', label: 'Toggle snapping', category: 'Timeline', fabula: 'N', premiere: 'S' },
  { id: 'timeline.zoomIn', label: 'Zoom in', category: 'Timeline', fabula: '=' },
  { id: 'timeline.zoomOut', label: 'Zoom out', category: 'Timeline', fabula: '-' },
  { id: 'timeline.zoomFit', label: 'Zoom to fit', category: 'Timeline', fabula: 'Shift+Z' },
  // App
  { id: 'app.openShortcuts', label: 'Keyboard shortcuts…', category: 'App', fabula: 'Ctrl+Alt+K' },
];

const ACTION_BY_ID = new Map(SHORTCUT_ACTIONS.map(a => [a.id, a]));

// ── Combo normalization ──────────────────────────────────────────────────────────
export function comboFromEvent(e: KeyboardEvent): KeyCombo {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');   // Cmd == Ctrl cross-platform
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  // ignore bare modifier presses
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return '';
  parts.push(key);
  return parts.join('+');
}

export function comboLabel(combo: KeyCombo): string {
  return combo.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓');
}

// ── Persistence ──────────────────────────────────────────────────────────────────
export interface ShortcutPrefs { preset: PresetId; overrides: Record<string, KeyCombo> }
const LS_KEY = 'fabula:shortcuts:v1';
const DEFAULT_PREFS: ShortcutPrefs = { preset: 'fabula', overrides: {} };

export function loadShortcutPrefs(): ShortcutPrefs {
  try { const p = JSON.parse(localStorage.getItem(LS_KEY) || ''); return { preset: p.preset || 'fabula', overrides: p.overrides || {} }; }
  catch { return { ...DEFAULT_PREFS }; }
}
export function saveShortcutPrefs(p: ShortcutPrefs): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* */ }
}

function presetCombo(a: ShortcutAction, preset: PresetId): KeyCombo {
  return (preset === 'resolve' ? (a.resolve ?? a.fabula) : preset === 'premiere' ? (a.premiere ?? a.fabula) : a.fabula);
}

/** The effective binding for an action under the given prefs (override → preset → default). */
export function comboForAction(actionId: string, prefs: ShortcutPrefs): KeyCombo {
  if (prefs.overrides[actionId] !== undefined) return prefs.overrides[actionId];
  const a = ACTION_BY_ID.get(actionId); return a ? presetCombo(a, prefs.preset) : '';
}

/** combo → actionId map for dispatch. */
export function buildKeymap(prefs: ShortcutPrefs): Map<KeyCombo, string> {
  const m = new Map<KeyCombo, string>();
  for (const a of SHORTCUT_ACTIONS) { const c = comboForAction(a.id, prefs); if (c) m.set(c, a.id); }
  return m;
}

/** Actions sharing a binding (so the editor can warn). Map combo → actionId[]. */
export function findConflicts(prefs: ShortcutPrefs): Map<KeyCombo, string[]> {
  const byCombo = new Map<KeyCombo, string[]>();
  for (const a of SHORTCUT_ACTIONS) { const c = comboForAction(a.id, prefs); if (!c) continue; byCombo.set(c, [...(byCombo.get(c) || []), a.id]); }
  return new Map([...byCombo].filter(([, ids]) => ids.length > 1));
}

/** Don't fire shortcuts while typing in a field. */
export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
