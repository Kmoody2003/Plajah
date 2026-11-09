// PCB data model shared by footprints, placement, the router, DRC and the exporters. Millimetres,
// y pointing down (screen convention); exporters flip y for Gerber/Excellon. Released by Plajah.

export type Layer = 'top' | 'bottom';
export const LAYERS: Layer[] = ['top', 'bottom'];

/** A pad as drawn in its footprint (local coordinates, before the part is rotated). */
export interface PadDef {
  /** Schematic pin this pad belongs to. Several pads may share a name (internally connected). Empty = no connection. */
  name: string; x: number; y: number; shape: 'circle' | 'rect'; w: number; h: number;
  /** Plated hole diameter; absent for surface-mount pads (top layer only). */
  drill?: number;
}
export interface Footprint {
  id: string; name: string; pads: PadDef[];
  /** Courtyard (keep-out around the body), local [x0, y0, x1, y1]. */
  court: [number, number, number, number];
  /** Silkscreen outline segments, local. */
  silk: Array<[number, number, number, number]>;
  /** Non-plated mounting holes (diameter), local. */
  holes?: Array<{ x: number; y: number; d: number }>;
  smd: boolean;
  /** Pads that must be tied together on the board (e.g. USB D+ to D− for a charge port). */
  ties?: string[][];
  note?: string;
}

/** A pad on the board, rotated and placed. Rect pads are axis-aligned after quarter-turn rotation. */
export interface Pad {
  id: string; part: string; ref: string; name: string; x: number; y: number; shape: 'circle' | 'rect'; w: number; h: number;
  drill?: number; layers: Layer[]; net: number;
  /** Pads with the same group key are connected inside the part (module pins, tact-switch legs). */
  group: string;
}
export interface Placed {
  id: string; ref: string; kind: string; fp: Footprint; x: number; y: number; rot: number; value: string;
  /** Rotated courtyard on the board. */
  box: [number, number, number, number];
}
export type NetClass = 'signal' | 'power' | 'mains';
export interface Net { id: number; name: string; cls: NetClass; current: number; width: number; nc?: boolean }
export interface Track { net: number; layer: Layer; a: [number, number]; b: [number, number]; w: number }
export interface Via { net: number; x: number; y: number; d: number; drill: number }
export interface Hole { x: number; y: number; d: number }

export interface Rules {
  clearance: number; minWidth: number; signalWidth: number; powerMinWidth: number;
  viaD: number; viaDrill: number; edge: number; annular: number; minDrill: number; holeGap: number;
  /** Between two mains nets (line to neutral) and from mains to anything else. */
  mainsLN: number; mainsIso: number;
  copperOz: 1 | 2; tempRise: number; grid: number;
}
export const DEFAULT_RULES: Rules = {
  // Comfortably inside JLCPCB/PCBWay standard 2-layer capability (0.127 mm track/space, 0.3 mm vias, 0.13 mm ring).
  clearance: 0.2, minWidth: 0.15, signalWidth: 0.25, powerMinWidth: 0.5,
  viaD: 0.6, viaDrill: 0.3, edge: 0.3, annular: 0.13, minDrill: 0.3, holeGap: 0.5,
  mainsLN: 2.5, mainsIso: 6.0, copperOz: 1, tempRise: 10, grid: 2.54 / 16,
};

export interface Board {
  name: string; W: number; H: number; parts: Placed[]; pads: Pad[]; nets: Net[]; tracks: Track[]; vias: Via[]; holes: Hole[];
  rules: Rules;
  /** Parts on the schematic with no footprint on the board (ground symbols, a supply that is the module's own USB). */
  virtual: Array<{ ref: string; why: string }>;
  notes: string[];
}

export const netName = (b: Board, id: number) => b.nets[id]?.name ?? `N${id}`;
/** Spacing two nets must keep, from the rules and their classes. */
export function clearanceFor(r: Rules, a: Net | undefined, b: Net | undefined): number {
  const ma = a?.cls === 'mains', mb = b?.cls === 'mains';
  if (ma && mb) return Math.max(r.clearance, r.mainsLN);
  if (ma || mb) return Math.max(r.clearance, r.mainsIso);
  return r.clearance;
}

/** IPC-2221 external-layer trace width (mm) for a current, temperature rise and copper weight. */
export function ipcWidth(amps: number, tempRise = 10, oz: 1 | 2 = 1): number {
  if (amps <= 0) return 0;
  const area = Math.pow(amps / (0.048 * Math.pow(tempRise, 0.44)), 1 / 0.725); // mil²
  const mil = area / (1.378 * oz);
  return mil * 0.0254;
}
