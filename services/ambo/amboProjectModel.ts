// amboProjectModel.ts — Document & project manifest for Ambo Pro Presenter.
// Supports both personal user workspaces and platform organization workspaces.
// Files can be saved as plain `.amboprj` JSON or bundled `.amboz` packages with assets.

import { newId, type Show, type Slide } from './showModel';
import { DEMO_LIBRARY, DEMO_PLAYLIST, type PlanItem } from './servicePlanDemo';

export type ProjectScope = 'USER' | 'ORGANIZATION';

export interface AmboProjectSettings {
  aspectRatio: string;          // '16:9' | '16:10' | '4:3' | '21:9'
  defaultTransition: string;     // 'Cross Dissolve' | 'Cut' | 'Luma Dissolve' etc.
  transitionDurationSec: number; // e.g. 0.8
  theme?: string;                // visual theme/accent
  autoDetectSecondaryDisplay?: boolean;
  outputPlacement?: 'right' | 'top';
  outputs?: any[];
  targetDisplayIndex?: number;
  isBlackout?: boolean;
  isMasterProgramOn?: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: AmboProjectSettings = {
  aspectRatio: '16:9',
  defaultTransition: 'Cross Dissolve',
  transitionDurationSec: 0.8,
  autoDetectSecondaryDisplay: true,
  outputPlacement: 'right',
  isBlackout: false,
  isMasterProgramOn: true,
};

export interface AmboProject {
  format: 'AMBO_PROJECT';
  version: '1.0.0';
  id: string;
  name: string;
  description?: string;
  scope: ProjectScope;
  ownerId: string;               // User UID or Organization ID
  organizationId?: string;       // set when scope === 'ORGANIZATION'
  organizationName?: string;     // display name of organization
  createdAt: number;
  updatedAt: number;
  shows: Show[];
  playlist: PlanItem[];
  activeShowId?: string;
  settings: AmboProjectSettings;
  /** Relative asset table when bundled in .amboz: maps assetKey -> filename */
  assetTable?: Record<string, string>;
  /** Configured hardware & virtual outputs */
  outputs?: any[];
  /** Target physical display index */
  targetDisplayIndex?: number;
  /** Reusable user assets (videos, motion backgrounds, graphics, tracks) */
  savedAssets?: any[];
}

export interface AmboProjectSummary {
  id: string;
  name: string;
  scope: ProjectScope;
  organizationId?: string;
  organizationName?: string;
  updatedAt: number;
  showCount: number;
  slideCount: number;
}

/** Create a fresh project with template shows and playlists */
export function createDefaultProject(
  name = 'Sunday Gathering',
  scope: ProjectScope = 'USER',
  ownerId = 'local-user',
  orgId?: string,
  orgName?: string,
): AmboProject {
  const now = Date.now();
  return {
    format: 'AMBO_PROJECT',
    version: '1.0.0',
    id: `prj_${now}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    description: 'Weekly presentation service and worship plan',
    scope,
    ownerId: scope === 'ORGANIZATION' && orgId ? orgId : ownerId,
    organizationId: orgId,
    organizationName: orgName,
    createdAt: now,
    updatedAt: now,
    shows: DEMO_LIBRARY,
    playlist: DEMO_PLAYLIST,
    activeShowId: DEMO_PLAYLIST[DEMO_PLAYLIST.length - 2]?.show?.id || DEMO_LIBRARY[0]?.id,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
  };
}

/** Validate if an arbitrary parsed object is a valid AmboProject */
export function validateAmboProject(obj: unknown): { valid: boolean; error?: string; project?: AmboProject } {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'Input is not an object' };
  }
  const candidate = obj as Partial<AmboProject>;
  if (candidate.format !== 'AMBO_PROJECT' && !Array.isArray(candidate.shows)) {
    return { valid: false, error: 'Missing AMBO_PROJECT format identifier or shows array' };
  }
  if (!Array.isArray(candidate.shows)) {
    return { valid: false, error: 'Project must contain a shows array' };
  }

  const project: AmboProject = {
    format: 'AMBO_PROJECT',
    version: candidate.version || '1.0.0',
    id: candidate.id || `prj_${Date.now()}`,
    name: candidate.name || 'Untitled Presentation',
    description: candidate.description,
    scope: candidate.scope === 'ORGANIZATION' ? 'ORGANIZATION' : 'USER',
    ownerId: candidate.ownerId || 'local-user',
    organizationId: candidate.organizationId,
    organizationName: candidate.organizationName,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    shows: candidate.shows,
    playlist: Array.isArray(candidate.playlist) ? candidate.playlist : [],
    activeShowId: candidate.activeShowId || candidate.shows[0]?.id,
    settings: {
      aspectRatio: candidate.settings?.aspectRatio || DEFAULT_PROJECT_SETTINGS.aspectRatio,
      defaultTransition: candidate.settings?.defaultTransition || DEFAULT_PROJECT_SETTINGS.defaultTransition,
      transitionDurationSec: candidate.settings?.transitionDurationSec || DEFAULT_PROJECT_SETTINGS.transitionDurationSec,
      autoDetectSecondaryDisplay: candidate.settings?.autoDetectSecondaryDisplay ?? true,
      theme: candidate.settings?.theme,
      outputPlacement: candidate.settings?.outputPlacement || 'right',
      isBlackout: candidate.settings?.isBlackout,
      isMasterProgramOn: candidate.settings?.isMasterProgramOn,
      outputs: candidate.settings?.outputs || (candidate as any).outputs,
      targetDisplayIndex: candidate.settings?.targetDisplayIndex ?? (candidate as any).targetDisplayIndex,
    },
    assetTable: candidate.assetTable,
    outputs: candidate.outputs || candidate.settings?.outputs,
    targetDisplayIndex: candidate.targetDisplayIndex ?? candidate.settings?.targetDisplayIndex,
    savedAssets: candidate.savedAssets,
  };

  return { valid: true, project };
}

/** Serialize project to JSON string (.amboprj) */
export function serializeAmboProject(project: AmboProject): string {
  return JSON.stringify({ ...project, updatedAt: Date.now() }, null, 2);
}

/** Deserialize JSON string to AmboProject with validation */
export function deserializeAmboProject(jsonStr: string): AmboProject {
  const parsed = JSON.parse(jsonStr);
  const result = validateAmboProject(parsed);
  if (!result.valid || !result.project) {
    throw new Error(result.error || 'Failed to parse Ambo project');
  }
  return result.project;
}

/** Compute total slide count across all shows in a project */
export function countProjectSlides(project: AmboProject): number {
  return (project.shows || []).reduce((acc, sh) => acc + (sh.slides?.length || 0), 0);
}
