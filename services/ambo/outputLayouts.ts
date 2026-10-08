// outputLayouts — saved sets of output windows mapped to physical monitors.
//
// "Program on the projector, Stage on the confidence monitor, Stream on the
// capture card" is a setup an operator should make once. A layout remembers
// each output's monitor by a stable display key, falling back to the monitor's
// index when the key is gone (a projector swapped for a different model), and
// the host re-places windows when a monitor is hot-plugged.
//
// Pure: no DOM, no router. routineHost.ts applies the result to real windows.

import type { AmboOutput, DetectedScreenInfo } from './outputRouter';

export interface LayoutPlacement {
  outputId: string;
  /** Stable key of the monitor (see displayKey). */
  displayKey?: string;
  /** Index at capture time — the fallback. */
  displayIndex?: number;
  displayLabel?: string;
}

export interface OutputLayoutPreset {
  id: string;
  name: string;
  placements: LayoutPlacement[];
  /** Open the windows automatically when Ambo starts / when a service starts. */
  autoOpen?: 'startup' | 'service-start' | 'never';
  /** Re-place windows when monitors are plugged / unplugged. Default true. */
  followHotplug?: boolean;
}

export type MatchKind = 'key' | 'index' | 'none';
export interface ResolvedPlacement { outputId: string; screenIndex: number | null; matchedBy: MatchKind; }

/** Label + resolution identifies a monitor across reboots better than its enumeration index. */
export function displayKey(s: Pick<DetectedScreenInfo, 'label' | 'width' | 'height'>): string {
  return `${(s.label || '').replace(/\s+/g, ' ').trim().toLowerCase()}|${s.width}x${s.height}`;
}

/** Capture the enabled outputs that are pinned to a monitor. */
export function captureLayout(name: string, outputs: AmboOutput[], screens: DetectedScreenInfo[], id = `lay_${Date.now().toString(36)}`): OutputLayoutPreset {
  const placements: LayoutPlacement[] = [];
  for (const o of outputs) {
    if (!o.enabled || o.screenIndex == null) continue;
    const s = screens.find(x => x.index === o.screenIndex);
    placements.push({
      outputId: o.id, displayIndex: o.screenIndex,
      displayKey: s ? displayKey(s) : undefined, displayLabel: s?.label,
    });
  }
  return { id, name, placements, autoOpen: 'never', followHotplug: true };
}

/**
 * Map every placement to a present screen. Key matches win; then the saved index
 * if that screen is still free; otherwise null (caller leaves the window on the
 * default screen rather than stacking two outputs on one monitor by accident).
 */
export function resolvePlacements(preset: OutputLayoutPreset, screens: DetectedScreenInfo[]): ResolvedPlacement[] {
  const claimed = new Set<number>();
  const out: ResolvedPlacement[] = preset.placements.map(p => ({ outputId: p.outputId, screenIndex: null, matchedBy: 'none' as MatchKind }));
  // pass 1: by key
  preset.placements.forEach((p, i) => {
    if (!p.displayKey) return;
    const s = screens.find(x => !claimed.has(x.index) && displayKey(x) === p.displayKey);
    if (s) { claimed.add(s.index); out[i] = { outputId: p.outputId, screenIndex: s.index, matchedBy: 'key' }; }
  });
  // pass 2: by index fallback
  preset.placements.forEach((p, i) => {
    if (out[i].matchedBy !== 'none' || p.displayIndex == null) return;
    const s = screens.find(x => x.index === p.displayIndex && !claimed.has(x.index));
    if (s) { claimed.add(s.index); out[i] = { outputId: p.outputId, screenIndex: s.index, matchedBy: 'index' }; }
  });
  return out;
}

/** Outputs updated with the resolved monitor (size follows the screen when the output auto-detects). */
export function applyResolved(outputs: AmboOutput[], resolved: ResolvedPlacement[], screens: DetectedScreenInfo[]): AmboOutput[] {
  return outputs.map(o => {
    const r = resolved.find(x => x.outputId === o.id);
    if (!r) return o;
    if (r.screenIndex == null) return { ...o, enabled: true };
    const s = screens.find(x => x.index === r.screenIndex);
    return {
      ...o, enabled: true, screenIndex: r.screenIndex, displayIndex: r.screenIndex,
      ...(s && o.autoDetectDisplay ? { width: s.width, height: s.height, refreshRate: s.refreshRate, aspectRatio: s.aspectRatio } : {}),
    };
  });
}

export interface ScreenDiff { added: DetectedScreenInfo[]; removed: DetectedScreenInfo[]; changed: boolean; }

/** What a hot-plug event changed. Compared by display key so a re-enumeration is not a change. */
export function diffScreens(prev: DetectedScreenInfo[], next: DetectedScreenInfo[]): ScreenDiff {
  const pk = new Map(prev.map(s => [displayKey(s), s]));
  const nk = new Map(next.map(s => [displayKey(s), s]));
  const added = next.filter(s => !pk.has(displayKey(s)));
  const removed = prev.filter(s => !nk.has(displayKey(s)));
  const moved = next.some(s => { const p = pk.get(displayKey(s)); return !!p && (p.index !== s.index || p.left !== s.left || p.top !== s.top); });
  return { added, removed, changed: added.length > 0 || removed.length > 0 || moved };
}

export interface ReplacePlan {
  /** Output ids whose window must be (re)opened on a new screen. */
  reopen: Array<{ outputId: string; screenIndex: number }>;
  /** Output ids that lost their monitor (windows should close or fall back). */
  orphaned: string[];
}

/** After a hot-plug: which windows go where. Only outputs that actually moved are touched. */
export function planHotplug(preset: OutputLayoutPreset, outputs: AmboOutput[], screens: DetectedScreenInfo[]): ReplacePlan {
  const resolved = resolvePlacements(preset, screens);
  const reopen: ReplacePlan['reopen'] = [];
  const orphaned: string[] = [];
  for (const r of resolved) {
    const o = outputs.find(x => x.id === r.outputId);
    if (!o) continue;
    if (r.screenIndex == null) orphaned.push(r.outputId);
    else if (o.screenIndex !== r.screenIndex) reopen.push({ outputId: r.outputId, screenIndex: r.screenIndex });
  }
  return { reopen, orphaned };
}

// ── Persistence ──────────────────────────────────────────────────────────────

export const LAYOUTS_KEY = 'ambo_output_layouts_v1';
type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const store = (): KV | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function loadLayouts(kv: KV | null = store()): OutputLayoutPreset[] {
  try {
    const raw = kv?.getItem(LAYOUTS_KEY);
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p.filter(x => x && typeof x.id === 'string' && Array.isArray(x.placements)) : [];
  } catch { return []; }
}
export function saveLayouts(list: OutputLayoutPreset[], kv: KV | null = store()): void {
  try { kv?.setItem(LAYOUTS_KEY, JSON.stringify(list)); } catch { /* quota */ }
}
