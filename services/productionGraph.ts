import type { ScriptData, ScriptElement } from '../types';
import type { ProductionScene } from './filmProductionService';

export interface ScriptDraft {
  id: string;
  productionId: string;
  scriptId: string;
  title: string;
  revisionLabel: string;
  elements: ScriptElement[];
  sourceUpdatedAt?: number;
  createdBy: string;
  createdAt: number;
  immutable: true;
}

export type WorkflowEventType =
  | 'PRODUCTION_CREATED' | 'SCRIPT_GREENLIT' | 'SCRIPT_REVISED'
  | 'SCENE_UPDATED' | 'MEMBER_JOINED' | 'SAMPLE_APPLIED' | 'LEGACY_IMPORTED';

export interface WorkflowEvent {
  id: string;
  productionId: string;
  type: WorkflowEventType;
  actorUid: string;
  entityType: 'production' | 'scriptDraft' | 'scene' | 'membership' | 'migration';
  entityId: string;
  summary: string;
  data?: Record<string, unknown>;
  createdAt: number;
}

export interface SceneProjectionInput {
  scriptId: string;
  draftId: string;
  elements: ScriptElement[];
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Stable across revision snapshots because Script Studio preserves element ids. */
export function stableSceneId(scriptId: string, headingElementId: string): string {
  return `scene_${hash(`${scriptId}:${headingElementId}`)}`;
}

function parseHeading(text: string): Pick<ProductionScene, 'intExt' | 'set' | 'dayNight'> {
  const normalized = text.trim().toUpperCase();
  const intExt = normalized.startsWith('INT./EXT.') || normalized.startsWith('INT/EXT')
    ? 'INT/EXT' : normalized.startsWith('EXT.') ? 'EXT' : 'INT';
  const withoutPrefix = normalized.replace(/^(INT\.\/EXT\.|INT\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/, '');
  const parts = withoutPrefix.split(/\s+-\s+/);
  const time = (parts.at(-1) || 'DAY').trim();
  const allowed = ['DAY', 'NIGHT', 'DUSK', 'DAWN', 'CONTINUOUS'] as const;
  const dayNight = allowed.includes(time as typeof allowed[number]) ? time as typeof allowed[number] : 'DAY';
  return { intExt, set: parts.slice(0, -1).join(' - ') || parts[0] || 'UNSPECIFIED', dayNight };
}

function sceneBody(elements: ScriptElement[], start: number, end: number) {
  const block = elements.slice(start + 1, end);
  const characters = [...new Set(block.filter(e => e.type === 'CHARACTER').map(e => e.text.trim().toUpperCase()).filter(Boolean))];
  const synopsis = block.find(e => e.type === 'ACTION' && e.text.trim())?.text.trim() || '';
  return { characters, synopsis };
}

export function projectScriptScenes(input: SceneProjectionInput): ProductionScene[] {
  const headings = input.elements
    .map((element, index) => ({ element, index }))
    .filter(x => x.element.type === 'SCENE_HEADING');
  return headings.map(({ element, index }, order) => {
    const next = headings[order + 1]?.index ?? input.elements.length;
    const parsed = parseHeading(element.text);
    const body = sceneBody(input.elements, index, next);
    return {
      id: stableSceneId(input.scriptId, element.id),
      sceneNum: String(order + 1),
      ...parsed,
      ...body,
      pages: 1,
      shootDay: 0,
      status: 'NOT_SHOT',
      sourceScriptId: input.scriptId,
      sourceDraftId: input.draftId,
      sourceElementId: element.id,
      heading: element.text,
      order,
      projectionVersion: 1,
    };
  });
}

/** Revisions refresh creative fields while retaining all production decisions. */
export function reconcileSceneProjection(projected: ProductionScene[], existing: ProductionScene[]): ProductionScene[] {
  const byId = new Map(existing.map(scene => [scene.id, scene]));
  return projected.map(scene => {
    const prior = byId.get(scene.id);
    if (!prior) return scene;
    return {
      ...scene,
      shootDay: prior.shootDay,
      status: prior.status,
      pages: prior.pages,
      notes: prior.notes,
      locationId: prior.locationId,
    };
  });
}

export function makeScriptDraft(productionId: string, script: ScriptData, actorUid: string, now = Date.now()): ScriptDraft {
  const id = `draft_${script.id}_${now.toString(36)}`;
  return {
    id, productionId, scriptId: script.id,
    title: script.titlePage?.title || 'Untitled Script',
    revisionLabel: script.currentRevisionColor || 'WHITE',
    elements: script.elements.map(element => ({ ...element })),
    sourceUpdatedAt: typeof script.updatedAt === 'number' ? script.updatedAt : undefined,
    createdBy: actorUid, createdAt: now, immutable: true,
  };
}
