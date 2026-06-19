/**
 * automationMatrix — the driver → target mapping model for Plajah Pixels.
 *
 * Step 2 of the render-core rebuild (see RENDER_CORE_REBUILD.md). This defines
 * the data model and persistence for the automation matrix: any DRIVER
 * (measure · tempo · intensity · beat) can be mapped to any TARGET (scene
 * progression · per-layer opacity / blend amount / param), with a depth and an
 * on/off, and many mappings run independently.
 *
 * This module is editor-state only. Nothing here reads the audio drivers or
 * mutates output — the live wiring lands in Steps 3 (scene targets) and 4
 * (row targets). Default state is an empty list, so adding this changes nothing.
 */

export type DriverKind = 'measure' | 'tempo' | 'intensity' | 'beat';
export type TargetKind = 'scene' | 'rowOpacity' | 'rowBlendAmount' | 'rowParam';

export interface Mapping {
  id:              string;
  driver:          DriverKind;
  target:          TargetKind;
  /** Layer id for row* targets (stable across reorder). Unused for 'scene'. */
  targetLayerId?:  string;
  /** Param index 0–3 for 'rowParam'. */
  targetParamIdx?: number;
  /** How strongly the driver moves the target, 0–1. For intensity→scene, sensitivity. */
  depth:           number;
  /**
   * Rate for 'scene' targets: bars-per-advance for measure, beats-per-advance for
   * tempo/beat. Ignored for intensity→scene and all row targets. Falls back to
   * defaultRate(driver) when undefined.
   */
  rate?:           number;
  enabled:         boolean;
}

/** Valid scene-advance rate options per driver (bars for measure, beats otherwise). */
export function sceneRateOptions(driver: DriverKind): number[] {
  return driver === 'measure' ? [1, 2, 4, 8, 16] : [1, 2, 4, 8];
}

/** Default scene-advance rate when a mapping has none set. */
export function defaultRate(driver: DriverKind): number {
  return driver === 'measure' ? 4 : 4;
}

export const DRIVER_KINDS: { id: DriverKind; label: string; color: string }[] = [
  { id: 'measure',   label: 'MEASURE',   color: '#818cf8' },
  { id: 'tempo',     label: 'TEMPO',     color: '#22d3ee' },
  { id: 'intensity', label: 'INTENSITY', color: '#ef4444' },
  { id: 'beat',      label: 'BEAT',      color: '#a855f7' },
];

export const TARGET_KINDS: {
  id: TargetKind; label: string; needsLayer: boolean; needsParam?: boolean;
}[] = [
  { id: 'scene',          label: 'SCENE ADVANCE', needsLayer: false },
  { id: 'rowOpacity',     label: 'LAYER OPACITY', needsLayer: true },
  { id: 'rowBlendAmount', label: 'LAYER BLEND',   needsLayer: true },
  { id: 'rowParam',       label: 'LAYER PARAM',   needsLayer: true, needsParam: true },
];

export function isRowTarget(t: TargetKind): boolean {
  return t !== 'scene';
}

const MAPPINGS_KEY = 'plajah-clip-launcher-mappings-v1';

let mapSeq = 0;
export function makeMapping(partial: Partial<Mapping> = {}): Mapping {
  mapSeq++;
  return {
    id:      `mapping-${Date.now()}-${mapSeq}`,
    driver:  'intensity',
    target:  'rowOpacity',
    depth:   1,
    enabled: true,
    ...partial,
  };
}

export function loadMappings(): Mapping[] {
  try {
    const raw = sessionStorage.getItem(MAPPINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Minimal shape guard — drop anything that isn't a recognizable mapping.
    return parsed.filter((m: any): m is Mapping =>
      m && typeof m.id === 'string'
        && DRIVER_KINDS.some(d => d.id === m.driver)
        && TARGET_KINDS.some(t => t.id === m.target)
        && typeof m.depth === 'number'
        && typeof m.enabled === 'boolean'
    );
  } catch {
    return [];
  }
}

export function saveMappings(mappings: Mapping[]): void {
  try {
    sessionStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappings));
  } catch { /* ignore */ }
}
