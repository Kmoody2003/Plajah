// Registry of Machine Atlas systems. Each system is loaded lazily (dynamic import) so unused systems cost nothing.
import type { AtlasDataset, SystemLayout, FaultDef, PartArchetype, Scenario, System } from './types';

export interface LoadedSystem {
  id: string; dataset: AtlasDataset; system: System; layout: SystemLayout; parts: Map<string, PartArchetype>; faults: FaultDef[];
  scenarios: Scenario[];
  /** Fault id -> partId -> generator param overrides (e.g. thinner pads). */
  faultGeometry: Record<string, Record<string, Record<string, number>>>;
  s0: { parkingSteps: string[] };
}

export interface SystemEntry { id: string; classId: string; label: string; blurb: string; ready: boolean }

export const ATLAS_SYSTEMS: SystemEntry[] = [
  { id: 'brakes', classId: 'car', label: 'Brakes', blurb: 'Disc, drum, hydraulics, ABS. Pilot system: AI-draft content awaiting ASE master technician review.', ready: true },
  { id: 'engine', classId: 'car', label: 'Engine', blurb: 'Planned (Phase 2).', ready: false },
  { id: 'drivetrain', classId: 'car', label: 'Drivetrain and chassis', blurb: 'Planned (Phase 3).', ready: false },
];

const cache = new Map<string, Promise<LoadedSystem>>();

export function loadSystem(id: string): Promise<LoadedSystem> {
  let p = cache.get(id);
  if (!p) {
    if (id !== 'brakes') return Promise.reject(new Error(`System "${id}" is not built yet`));
    p = import('../../data/atlas/car/brakes').then(m => {
      const system = m.BRAKES_SYSTEM;
      return {
        id, dataset: m.BRAKES_DATASET, system, layout: m.BRAKES_LAYOUT, parts: new Map(m.BRAKES_PARTS.map(x => [x.id, x])), faults: m.BRAKE_FAULTS,
        scenarios: system.scenarios, faultGeometry: m.FAULT_GEOMETRY, s0: { parkingSteps: m.PARKING_BRAKE_STEPS },
      } as LoadedSystem;
    });
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

/** Window event used to deep-link into the atlas from anywhere in the app. */
export const OPEN_MACHINE_ATLAS = 'OPEN_MACHINE_ATLAS';
export interface OpenAtlasDetail { systemId?: string; partId?: string; scenarioId?: string; faultId?: string }
export const openMachineAtlas = (detail: OpenAtlasDetail = {}) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<OpenAtlasDetail>(OPEN_MACHINE_ATLAS, { detail }));
};

/** Read ?atlas=brakes&part=caliper&scenario=abs&fault=stuck_slide_pin from a query string. */
export function parseAtlasQuery(search: string): OpenAtlasDetail | null {
  const q = new URLSearchParams(search);
  const systemId = q.get('atlas');
  if (systemId === null) return null;
  const d: OpenAtlasDetail = { systemId: systemId || 'brakes' };
  const part = q.get('part'), scenario = q.get('scenario'), fault = q.get('fault');
  if (part) d.partId = part.replace(/-/g, '_');
  if (scenario) d.scenarioId = scenario;
  if (fault) d.faultId = fault.replace(/-/g, '_');
  return d;
}
