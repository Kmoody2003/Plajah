// The ONDA patch — a serializable sound. Stored inside the groove document, so a project
// carries its instruments with it; nothing lives only in engine memory.

import type { Instrument } from '../../beats/engine/InstrumentHost';
import { SpatialLayout, IamfRole } from '../../beats/engine/InstrumentHost';
import { MACRO_BASE, MOD_SOURCE } from './params';
import { getWavetable, wavetableIndex, FRAMES, FRAME_SIZE, WAVETABLES } from './wavetables';

export interface ModRoute {
  source: number; // MOD_SOURCE
  dest: number;   // param id
  depth: number;  // -1..1
  via?: number;
}

export interface MacroDef {
  name: string;
  value: number;
}

export interface OndaPatch {
  id: string;
  name: string;
  /** Bank/category for the browser: Bass, Lead, Pad, Keys, Pluck, Atmosphere, FX, Arp. */
  category: string;
  tags: string[];
  author?: string;
  /** One line for the gallery — what it is and, ideally, the trick behind it (the teaching hook). */
  description?: string;
  /** Seed for the procedural cover art (defaults to the name). Lets a re-skin keep its cover. */
  cover?: string;
  /** Wavetable ids per oscillator slot, resolved to engine slots on load. */
  tables: string[];
  /** Raw param id → 0..1 value. Anything absent keeps the engine default. */
  params: Record<number, number>;
  routes: ModRoute[];
  macros: MacroDef[];
  spatial?: {
    position: [number, number, number];
    layout?: SpatialLayout;
    role?: IamfRole;
  };
  version: 1;
}

export const DEFAULT_MACROS: MacroDef[] = [
  { name: 'Brightness', value: 0.5 },
  { name: 'Movement', value: 0.0 },
  { name: 'Drive', value: 0.0 },
  { name: 'Width', value: 0.5 },
  { name: 'Attack', value: 0.0 },
  { name: 'Release', value: 0.3 },
  { name: 'Sub', value: 0.0 },
  { name: 'Space', value: 0.0 },
];

export function newPatch(name = 'Init', category = 'Keys'): OndaPatch {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    category,
    tags: [],
    tables: ['analog-sweep'],
    params: {},
    routes: [],
    macros: DEFAULT_MACROS.map((m) => ({ ...m })),
    spatial: { position: [0, 0, -1], layout: SpatialLayout.Stereo, role: IamfRole.Object },
    version: 1,
  };
}

/** Which wavetables a patch needs, deduped — the caller uploads these once per instrument. */
export function tablesFor(patch: OndaPatch): string[] {
  return [...new Set(patch.tables.filter(Boolean))];
}

/**
 * Push a whole patch into a live instrument: wavetables first (the mip build is the expensive
 * part), then params in one bulk message, then routes, macros and spatial state.
 */
export function applyPatch(inst: Instrument, patch: OndaPatch): void {
  const wanted = tablesFor(patch);
  wanted.forEach((id) => {
    const data = getWavetable(id);
    if (data) inst.loadWavetable(wavetableIndex(id), data, FRAMES, FRAME_SIZE);
  });

  const entries: Array<[number, number]> = Object.entries(patch.params).map(([k, v]) => [Number(k), v]);
  // Point each oscillator at its table slot.
  patch.tables.forEach((id, i) => {
    if (id) entries.push([100 + i * 100 + 7 /* O.TABLE */, wavetableIndex(id)]);
  });
  inst.setParams(entries);

  // Clear every route slot first so switching presets never leaves a stale modulation behind.
  for (let i = 0; i < 32; i++) inst.setRoute(i, MOD_SOURCE.None, 0, 0, 0);
  patch.routes.slice(0, 32).forEach((r, i) => inst.setRoute(i, r.source, r.dest, r.depth, r.via ?? 0));

  patch.macros.slice(0, 8).forEach((m, i) => inst.setMacro(i, m.value));

  if (patch.spatial) {
    inst.setSpatial({
      position: patch.spatial.position,
      layout: patch.spatial.layout,
      role: patch.spatial.role,
    });
  }
}

/** Firestore-safe form (numeric keys survive JSON as strings; `deserializePatch` restores them). */
export function serializePatch(patch: OndaPatch): Record<string, unknown> {
  return JSON.parse(JSON.stringify(patch));
}

export function deserializePatch(raw: unknown): OndaPatch | null {
  const p = raw as OndaPatch;
  if (!p || typeof p !== 'object' || !p.name) return null;
  if (!Array.isArray(p.tables) || !p.tables.length) p.tables = ['analog-sweep'];
  if (!Array.isArray(p.routes)) p.routes = [];
  if (!Array.isArray(p.macros) || p.macros.length < 8) p.macros = DEFAULT_MACROS.map((m) => ({ ...m }));
  if (!p.params || typeof p.params !== 'object') p.params = {};
  else {
    // JSON turns numeric keys into strings — normalise so param lookups stay numeric.
    const fixed: Record<number, number> = {};
    for (const [k, v] of Object.entries(p.params)) fixed[Number(k)] = Number(v);
    p.params = fixed;
  }
  // A patch referencing a wavetable this build no longer ships falls back rather than silently
  // playing the wrong sound.
  p.tables = p.tables.map((t) => (WAVETABLES.some((w) => w.id === t) ? t : 'analog-sweep'));
  return p;
}

export const macroParamId = (index: number): number => MACRO_BASE + index;
