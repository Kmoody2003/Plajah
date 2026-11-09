// A Build Studio project: a 3D scene, a breadboard circuit and a block program, saved together.

import type { Scene, Audience } from './shapes';
import type { CircuitProject } from './breadboard';
import type { Program } from './blocks';

export type StudioMode = '3d' | 'circuit';
export interface StudioProject {
  v: 1; id: string; title: string; mode: StudioMode;
  scene: Scene; circuit: CircuitProject; program: Program;
  lang: 'cpp' | 'py'; audience: Audience; printer: string;
  starter?: string; lesson?: string; lessonStep?: number;
  createdAt: number; updatedAt: number;
}

export const newProjectId = () => `st_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
export function blankProject(mode: StudioMode = '3d', title = 'Untitled build'): StudioProject {
  const now = Date.now();
  return { v: 1, id: newProjectId(), title, mode, scene: { shapes: [], grid: 1, units: 'mm' }, circuit: { board: 'uno', parts: [], wires: [] }, program: { setup: [], loop: [] }, lang: 'cpp', audience: 'kids', printer: 'std', createdAt: now, updatedAt: now };
}

/** Accept a saved or submitted project, filling anything missing so old saves keep opening. */
export function normalizeProject(raw: unknown): StudioProject | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Partial<StudioProject>; const base = blankProject(r.mode === 'circuit' ? 'circuit' : '3d');
  return {
    ...base, ...r, v: 1, id: typeof r.id === 'string' ? r.id : base.id, title: typeof r.title === 'string' ? r.title.slice(0, 120) : base.title,
    scene: { ...base.scene, ...(r.scene ?? {}), shapes: Array.isArray(r.scene?.shapes) ? r.scene!.shapes : [] },
    circuit: { ...base.circuit, ...(r.circuit ?? {}), parts: Array.isArray(r.circuit?.parts) ? r.circuit!.parts : [], wires: Array.isArray(r.circuit?.wires) ? r.circuit!.wires : [] },
    program: { setup: Array.isArray(r.program?.setup) ? r.program!.setup : [], loop: Array.isArray(r.program?.loop) ? r.program!.loop : [] },
  };
}
