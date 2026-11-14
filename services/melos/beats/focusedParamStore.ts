/**
 * focusedParamStore.ts — Tracks which synthesizer / instrument UI parameter is currently
 * hovered, nearest within 56px of the pointer, or most recently clicked/selected, so
 * hardware MIDI Knob 1 (macro index 0) can immediately take control of that parameter.
 */

export interface FocusedParamEntry {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  trackId?: string;
  onChange: (value: number) => void;
  getRect?: () => DOMRect | { left: number; top: number; right: number; bottom: number } | null;
  isAlive?: () => boolean;
}

export interface FocusedParamSnapshot {
  activeId: string | null;
  hoveredId: string | null;
  nearestId: string | null;
  selectedId: string | null;
  label: string | null;
  source: 'hover' | 'proximity' | 'selected' | null;
}

export const POINTER_PROXIMITY_RADIUS_PX = 56;

const entries = new Map<string, FocusedParamEntry>();
let hoveredId: string | null = null;
let nearestId: string | null = null;
let selectedId: string | null = null;
const listeners = new Set<() => void>();
let pointerInstalled = false;
let pointerRaf = 0;
let lastPointer = { x: -1, y: -1 };

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore listener failure */
    }
  }
}

/** Euclidean distance in px from point (x, y) to the nearest edge of rect (0 if inside). */
export function distanceToRect(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number },
): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

/** Pure nearest-control lookup within maxRadius px (exported for unit tests). */
export function findNearestParamByPoint(
  x: number,
  y: number,
  candidates: Iterable<FocusedParamEntry>,
  maxRadius = POINTER_PROXIMITY_RADIUS_PX,
): string | null {
  let bestId: string | null = null;
  let bestDist = maxRadius;
  for (const c of candidates) {
    const rect = c.getRect?.();
    if (!rect) continue;
    if (rect.right <= rect.left && rect.bottom <= rect.top) continue;
    const d = distanceToRect(x, y, rect);
    if (d <= bestDist) {
      bestDist = d;
      bestId = c.id;
    }
  }
  return bestId;
}

function updateProximityFromPointer(): void {
  pointerRaf = 0;
  pruneDeadEntries();
  if (lastPointer.x < 0 || lastPointer.y < 0 || entries.size === 0) {
    if (nearestId !== null) {
      nearestId = null;
      notify();
    }
    return;
  }
  const nextNearest = findNearestParamByPoint(lastPointer.x, lastPointer.y, entries.values());
  if (nextNearest !== nearestId) {
    nearestId = nextNearest;
    notify();
  }
}

function ensurePointerListener(): void {
  if (pointerInstalled || typeof window === 'undefined') return;
  pointerInstalled = true;
  window.addEventListener('pointermove', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!pointerRaf) {
      pointerRaf = window.requestAnimationFrame(updateProximityFromPointer);
    }
  }, { passive: true });
  window.addEventListener('blur', () => {
    hoveredId = null;
    nearestId = null;
    notify();
  });
}

export function registerFocusedParam(entry: FocusedParamEntry): () => void {
  ensurePointerListener();
  entries.set(entry.id, entry);
  return () => {
    const cur = entries.get(entry.id);
    // Only delete if no newer render replaced or removed it; since unregister runs on unmount/re-id, delete safely.
    if (cur === entry || entries.has(entry.id)) {
      entries.delete(entry.id);
      let changed = false;
      if (hoveredId === entry.id) { hoveredId = null; changed = true; }
      if (nearestId === entry.id) { nearestId = null; changed = true; }
      if (selectedId === entry.id) { selectedId = null; changed = true; }
      if (changed) notify();
    }
  };
}

export function updateFocusedParam(entry: FocusedParamEntry): void {
  ensurePointerListener();
  entries.set(entry.id, entry);
}

export function setHoveredParam(id: string | null): void {
  if (hoveredId === id) return;
  hoveredId = id;
  notify();
}

export function setSelectedParam(id: string | null): void {
  if (selectedId === id) return;
  selectedId = id;
  notify();
}

export function clearFocusedParams(): void {
  entries.clear();
  hoveredId = null;
  nearestId = null;
  selectedId = null;
  notify();
}

function pruneDeadEntries(): void {
  for (const [id, entry] of entries) {
    if (entry.isAlive && !entry.isAlive()) {
      entries.delete(id);
      if (hoveredId === id) hoveredId = null;
      if (nearestId === id) nearestId = null;
      if (selectedId === id) selectedId = null;
    }
  }
}

export function activeFocusedParam(): { entry: FocusedParamEntry; source: 'hover' | 'proximity' | 'selected' } | null {
  pruneDeadEntries();
  if (hoveredId && entries.has(hoveredId)) {
    return { entry: entries.get(hoveredId)!, source: 'hover' };
  }
  if (nearestId && entries.has(nearestId)) {
    return { entry: entries.get(nearestId)!, source: 'proximity' };
  }
  if (selectedId && entries.has(selectedId)) {
    return { entry: entries.get(selectedId)!, source: 'selected' };
  }
  return null;
}

export function getFocusedParamSnapshot(): FocusedParamSnapshot {
  const active = activeFocusedParam();
  return {
    activeId: active?.entry.id ?? null,
    hoveredId: hoveredId && entries.has(hoveredId) ? hoveredId : null,
    nearestId: nearestId && entries.has(nearestId) ? nearestId : null,
    selectedId: selectedId && entries.has(selectedId) ? selectedId : null,
    label: active?.entry.label ?? null,
    source: active?.source ?? null,
  };
}

export function subscribeFocusedParam(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Drive the active hovered / cursor-adjacent / selected control from normalized [0..1]
 * hardware MIDI Knob 1 input. Returns true if a focused UI parameter handled the value.
 */
export function driveFocusedParam(u01: number): boolean {
  const active = activeFocusedParam();
  if (!active) return false;
  const { entry } = active;
  const u = Math.max(0, Math.min(1, u01));
  let next = entry.min + u * (entry.max - entry.min);
  if (entry.step && entry.step > 0) {
    next = entry.min + Math.round((next - entry.min) / entry.step) * entry.step;
  }
  next = Math.max(entry.min, Math.min(entry.max, Number(next.toFixed(6))));
  entry.value = next;
  entry.onChange(next);
  return true;
}

/**
 * Helper returning React event handlers + ref callback for native <input type="range">
 * or custom parameter controls outside <Knob>.
 */
export function makeFocusRangeProps(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
  options?: { step?: number; trackId?: string },
) {
  return {
    'data-focus-param-id': id,
    onPointerEnter: () => setHoveredParam(id),
    onPointerLeave: () => setHoveredParam(null),
    onPointerDown: () => setSelectedParam(id),
    onFocus: () => setSelectedParam(id),
    ref: (el: HTMLElement | null) => {
      if (!el) return;
      updateFocusedParam({
        id,
        label,
        value,
        min,
        max,
        step: options?.step,
        trackId: options?.trackId,
        onChange,
        getRect: () => el.getBoundingClientRect(),
        isAlive: () => el.isConnected,
      });
    },
  };
}
