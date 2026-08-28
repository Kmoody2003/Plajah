import type { ScriptData, ScriptElement, RevisionColor } from '../types';
import type { ProductionScene } from './filmProductionService';

// ─── Revision ladder — colored shooting-script pages ─────────────────────────
export const REVISION_LADDER: RevisionColor[] = ['WHITE', 'BLUE', 'PINK', 'YELLOW', 'GREEN', 'GOLDENROD', 'BUFF', 'SALMON', 'CHERRY', 'TAN', 'GRAY'];
/** Advance one step down the ladder; clamps at the end so we never lose a colour. */
export function nextRevisionColor(current?: string): RevisionColor {
  const index = REVISION_LADDER.indexOf((current || 'WHITE') as RevisionColor);
  return REVISION_LADDER[Math.min(index + 1, REVISION_LADDER.length - 1)] || 'BLUE';
}

/** Group a draft's elements into per-scene body signatures, keyed by stable scene id. */
function sceneSignatures(elements: ScriptElement[], scriptId: string): Map<string, string> {
  const headings = elements.map((element, index) => ({ element, index })).filter(x => x.element.type === 'SCENE_HEADING');
  const map = new Map<string, string>();
  headings.forEach(({ element, index }, order) => {
    const end = headings[order + 1]?.index ?? elements.length;
    const body = elements.slice(index, end).map(x => `${x.type}:${x.text}`).join('\n');
    map.set(stableSceneId(scriptId, element.id), body);
  });
  return map;
}

/** Which scenes' text changed (or are new) between the prior greenlit draft and the new one. Drives revision marks. */
export function diffDraftScenes(priorElements: ScriptElement[], nextElements: ScriptElement[], scriptId: string): Set<string> {
  const prior = sceneSignatures(priorElements, scriptId);
  const next = sceneSignatures(nextElements, scriptId);
  const changed = new Set<string>();
  next.forEach((text, id) => { if (prior.get(id) !== text) changed.add(id); });
  return changed;
}

/** Printable side blocks from a locked draft's elements — sides read this, NOT the live editable script. */
export function draftScriptBlocks(elements: ScriptElement[]): { heading: string; text: string }[] {
  const headings = elements.map((element, index) => ({ element, index })).filter(x => x.element.type === 'SCENE_HEADING');
  return headings.map(({ element, index }, order) => {
    const end = headings[order + 1]?.index ?? elements.length;
    const text = elements.slice(index + 1, end)
      .filter(x => ['ACTION', 'CHARACTER', 'DIALOGUE', 'PARENTHETICAL', 'TRANSITION'].includes(x.type))
      .map(x => (x.type === 'CHARACTER' ? `\n${x.text.toUpperCase()}` : x.type === 'PARENTHETICAL' ? `(${x.text.replace(/^\(|\)$/g, '')})` : x.text))
      .join('\n');
    return { heading: element.text, text };
  });
}

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
  | 'SCENE_UPDATED' | 'BREAKDOWN_SUGGESTED' | 'BREAKDOWN_APPROVED' | 'BREAKDOWN_STATUS_CHANGED'
  | 'BREAKDOWN_ATTACHMENT_ADDED' | 'BREAKDOWN_ATTACHMENT_REMOVED' | 'BREAKDOWN_OCCURRENCE_UPDATED'
  | 'SCHEDULE_APPROVED' | 'CALLSHEETS_GENERATED' | 'CALLSHEET_PUBLISHED' | 'CALLSHEET_REPUBLISHED'
  | 'CLEARANCE_UPDATED'
  | 'MEMBER_JOINED' | 'SAMPLE_APPLIED' | 'LEGACY_IMPORTED';

export interface WorkflowEvent {
  id: string;
  productionId: string;
  type: WorkflowEventType;
  actorUid: string;
  entityType: 'production' | 'scriptDraft' | 'scene' | 'breakdownElement' | 'schedulePlan' | 'callSheet' | 'membership' | 'migration' | 'clearance';
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

/**
 * Revisions refresh creative fields while retaining all production decisions.
 * When a revision colour + changed-scene set is supplied, scenes that changed
 * (or are new this revision) are stamped so the UI can show revision marks.
 */
export function reconcileSceneProjection(
  projected: ProductionScene[], existing: ProductionScene[],
  changedIds?: Set<string>, revisionColor?: RevisionColor,
): ProductionScene[] {
  const byId = new Map(existing.map(scene => [scene.id, scene]));
  return projected.map(scene => {
    const prior = byId.get(scene.id);
    if (!prior) {
      // New scene. On a revision it is new-in-revision; otherwise a plain first projection.
      return revisionColor ? { ...scene, revisionColor, changedInRevision: revisionColor, isNewInRevision: true } : scene;
    }
    const stamped = revisionColor && changedIds?.has(scene.id)
      ? { revisionColor, changedInRevision: revisionColor, isNewInRevision: false }
      : { revisionColor: prior.revisionColor, changedInRevision: prior.changedInRevision, isNewInRevision: prior.isNewInRevision };
    return {
      ...scene,
      shootDay: prior.shootDay,
      status: prior.status,
      pages: prior.pages,
      notes: prior.notes,
      locationId: prior.locationId,
      ...stamped,
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
