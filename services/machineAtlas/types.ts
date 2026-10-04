// Machine Atlas - core schema (mechanism graph). A machine is DATA; the viewer/solvers are generic.
// See docs/MACHINE_ATLAS_PLAN.md. Generic archetypes only: no manufacturer models, no branding.

/** Simulation honesty tier: S0 kinematic, S1 analytic/small ODE, S2 lumped network, S3 illustrative field flow. */
export type SimTier = 'S0' | 'S1' | 'S2' | 'S3';
export const SIM_TIER_LABEL: Record<SimTier, string> = {
  S0: 'Animated kinematics',
  S1: 'Analytic model',
  S2: 'Lumped-parameter network',
  S3: 'Illustrative flow (not engineering-grade)',
};

export type PortKind = 'mech' | 'fluid' | 'thermal' | 'elec' | 'hydraulic' | 'signal';
export type PortDirection = 'in' | 'out' | 'bidir';
export interface Port { id: string; kind: PortKind; direction: PortDirection; label?: string }
export interface PortRef { part: string; port: string }

export type MachineClassId = 'car' | 'diesel' | 'motorcycle' | 'rail' | 'marine' | 'aircraft';

export type PartCategory =
  | 'actuation' | 'hydraulic' | 'friction' | 'rotating' | 'structure' | 'sensing' | 'electronic' | 'fluid' | 'hardware';

/** Categories where a wrong repair can injure people: validator requires a non-empty safety[] for these. */
export const SAFETY_CRITICAL_CATEGORIES: PartCategory[] = ['actuation', 'hydraulic', 'friction', 'rotating', 'structure', 'electronic', 'fluid'];

export type Geometry =
  | { kind: 'procedural'; generator: string; params: Record<string, number | string | boolean> }
  | { kind: 'glb'; url: string; meshMatch: string };

export interface PartMaterial { id: string; color: string; metalness: number; roughness: number }
export interface PartParam { id: string; label: string; value: number; unit: string; min?: number; max?: number }
/** Named hooks into solvers (e.g. 'hydraulics.piston', 'thermal.node'). Purely descriptive for now. */
export interface SolverHook { solver: 'kinematics' | 'hydraulics' | 'thermal' | 'friction' | 'tire'; role: string; tier: SimTier }

export interface FailureMode { id: string; name: string; symptoms: string[]; causes: string[]; tests: string[] }
export interface RepairProcedure {
  summary: string; steps: string[]; tools: string[]; difficulty: 1 | 2 | 3 | 4 | 5;
  timeHoursRange: [number, number]; safety: string[]; disclaimer: string;
}
export interface CostEstimate { partsRangeUSD: [number, number]; laborHoursRange: [number, number]; note: 'estimate' }

export type ReviewStatus = 'ai-draft, needs ASE master technician review' | 'reviewed' | 'verified';

export interface PartContent {
  function: string;
  whatHappensInside: string;
  wear: string[];
  failureModes: FailureMode[];
  diagnostics: string[];
  repair: RepairProcedure;
  cost: CostEstimate;
  aseArea: string;
  lessonIds: string[];
  reviewStatus: ReviewStatus;
}

export interface PartLicense { license: string; author: string; sourceUrl: string; attribution: string; generated: boolean }

export interface PartArchetype {
  id: string;
  name: string;
  category: PartCategory;
  systemIds: string[];
  geometry: Geometry;
  ports: Port[];
  materials: PartMaterial[];
  params: PartParam[];
  behaviors: SolverHook[];
  content: PartContent;
  license: PartLicense;
  /** Optional DVI/inspection keys (see dviBridge). */
  inspectionKeys?: string[];
}

export interface Connection { from: PortRef; to: PortRef; kind: PortKind }
export interface Scenario {
  id: string; name: string; description: string; tier: SimTier;
  /** Fault ids (FaultDef.id) injected when the learner flips to "faulted". */
  faults: string[];
  setup: Record<string, number | string | boolean>;
}
export interface System { id: string; name: string; partIds: string[]; connections: Connection[]; scenarios: Scenario[] }

/** A fault is a failureMode id (unique across the dataset) plus the parts it implicates. */
export interface FaultDef { id: string; label: string; partIds: string[] }

export interface MachineClassProfile { id: MachineClassId; label: string; systems: string[] }

export interface AtlasDataset {
  classId: MachineClassId;
  systems: System[];
  parts: PartArchetype[];
  faults: FaultDef[];
}

export const MACHINE_CLASS_PROFILES: MachineClassProfile[] = [
  { id: 'car', label: 'Car and light truck (gasoline)', systems: ['brakes'] },
  { id: 'diesel', label: 'Diesel and fleet', systems: [] },
  { id: 'motorcycle', label: 'Motorcycle', systems: [] },
  { id: 'rail', label: 'Rail', systems: [] },
  { id: 'marine', label: 'Marine', systems: [] },
  { id: 'aircraft', label: 'Aircraft', systems: [] },
];

/** Simulation trace: precomputed channels sampled at fixed dt. UI scrubs it; no per-frame allocation. */
export interface Trace {
  tier: SimTier;
  dt: number;
  n: number;
  channels: Record<string, Float32Array>;
  units: Record<string, string>;
  labels: Record<string, string>;
  events: { t: number; label: string; severity: 'info' | 'warn' | 'alert' }[];
  assumptions: string[];
  summary: Record<string, number | string>;
}

// ---- scene layout (data-defined per system) ----
export type V3 = [number, number, number];
export interface ViewDef { id: string; label: string; description: string; camera: { pos: V3; target: V3 } }
export interface Placement {
  part: string; views: string[]; pos?: V3; rot?: V3; scale?: number;
  /** Generator param overrides for this placement (e.g. line routes). */
  params?: Record<string, number | string | boolean>;
  /** Explode vector override (world units at explode = 1). */
  explode?: V3; opacity?: number; decor?: boolean;
}
/** Binding of a simulation channel onto a part's appearance. */
export interface VisualBinding {
  part: string; channel: string; kind: 'heat' | 'pressure' | 'state' | 'spin' | 'glow';
  lo: number; hi: number;
}
export interface SystemLayout {
  views: ViewDef[]; placements: Placement[]; explode: Record<string, V3>;
  visuals: Record<string, VisualBinding[]>;
}
