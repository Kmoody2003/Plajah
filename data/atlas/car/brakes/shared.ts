// Shared helpers for the brakes dataset. Content is generic (no make/model) and AI-DRAFTED.
import type { FailureMode, Geometry, PartArchetype, PartCategory, Port, PartMaterial, SolverHook, SimTier } from '../../../../services/machineAtlas/types';

export const REVIEW = 'ai-draft, needs ASE master technician review' as const;

export const DISCLAIMER =
  'Generic educational overview for a typical vehicle. It is NOT a repair manual: always consult the factory service manual for your exact vehicle (procedures, torque values, tightening sequences, specifications and special tools differ).';

/** Added to every brake part: all brake components are safety-critical. */
export const COMMON_SAFETY: string[] = [
  'Support the vehicle on rated jack stands on level ground. Never rely on a jack alone and never get under a vehicle held only by a jack.',
  'Brake dust can contain hazardous particles. Never blow it off with compressed air; use a wet method or a HEPA vacuum and wear a respirator.',
  'Brake fluid is corrosive to paint and harmful to eyes and skin, and it absorbs water from the air. Wear gloves and eye protection, keep containers sealed and dispose of it per local rules.',
  'Tighten every fastener to the factory torque specification in the service manual. Never reuse single-use (torque-to-yield) fasteners.',
  'After any brake work, confirm a firm pedal with the vehicle stationary before moving it, then test at low speed in a safe area.',
];

export const NOTE_ESTIMATE = 'estimate' as const;

export interface PartInput {
  id: string; name: string; category: PartCategory; generator: string; params?: Record<string, number | string | boolean>;
  ports?: Port[]; materials?: PartMaterial[];
  fn: string; inside: string; wear: string[]; failures: FailureMode[]; diag: string[];
  repair: { summary: string; steps: string[]; tools: string[]; difficulty: 1 | 2 | 3 | 4 | 5; hours: [number, number]; safety?: string[] };
  cost: { parts: [number, number]; labor: [number, number] };
  ase: string; hooks?: SolverHook[]; inspection?: string[]; params2?: PartArchetype['params'];
}

export const hook = (solver: SolverHook['solver'], role: string, tier: SimTier): SolverHook => ({ solver, role, tier });
export const port = (id: string, kind: Port['kind'], direction: Port['direction'], label?: string): Port => ({ id, kind, direction, label });

export const mat = (id: string, color: string, metalness = 0.4, roughness = 0.55): PartMaterial => ({ id, color, metalness, roughness });

export function part(i: PartInput): PartArchetype {
  const geometry: Geometry = { kind: 'procedural', generator: i.generator, params: i.params || {} };
  return {
    id: i.id, name: i.name, category: i.category, systemIds: ['brakes'], geometry,
    ports: i.ports || [], materials: i.materials || [mat('body', '#8a8d93')], params: i.params2 || [], behaviors: i.hooks || [],
    content: {
      function: i.fn, whatHappensInside: i.inside, wear: i.wear, failureModes: i.failures, diagnostics: i.diag,
      repair: {
        summary: i.repair.summary, steps: i.repair.steps, tools: i.repair.tools, difficulty: i.repair.difficulty,
        timeHoursRange: i.repair.hours, safety: [...COMMON_SAFETY, ...(i.repair.safety || [])], disclaimer: DISCLAIMER,
      },
      cost: { partsRangeUSD: i.cost.parts, laborHoursRange: i.cost.labor, note: NOTE_ESTIMATE },
      aseArea: i.ase, lessonIds: [], reviewStatus: REVIEW,
    },
    license: {
      license: 'Plajah original (procedural, generated in code)', author: 'Plajah', sourceUrl: '', generated: true,
      attribution: 'Procedurally generated generic archetype. No manufacturer geometry.',
    },
    inspectionKeys: i.inspection,
  };
}

export const fm = (id: string, name: string, symptoms: string[], causes: string[], tests: string[]): FailureMode => ({ id, name, symptoms, causes, tests });

// ASE A5 (Brakes) task-list topic areas. Verify exact current names against the published ASE task list before labelling.
export const ASE = {
  hyd: 'ASE A5 Brakes: Hydraulic System Diagnosis and Repair',
  drum: 'ASE A5 Brakes: Drum Brake Diagnosis and Repair',
  disc: 'ASE A5 Brakes: Disc Brake Diagnosis and Repair',
  assist: 'ASE A5 Brakes: Power-Assist Units Diagnosis and Repair',
  misc: 'ASE A5 Brakes: Miscellaneous (Wheel Bearings, Parking Brakes, Electrical, Etc.)',
  abs: 'ASE A5 Brakes: Antilock Brake System (ABS) Diagnosis and Repair',
};
