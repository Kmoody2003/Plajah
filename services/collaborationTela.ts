import type { CollabProject, TelaDoc, TelaVectorObject } from '../types';

/** Non-destructive conversion of legacy strokes to native Tela objects. */
export function collaborationTela(project: CollabProject): TelaDoc {
  if (project.telaDocument) return JSON.parse(project.telaDocument) as TelaDoc;
  let lines: Array<{ points: number[]; color?: string }> = [];
  try { lines = JSON.parse(project.whiteboardData || '{}').lines || []; } catch { /* preserve legacy data */ }
  const objects: TelaVectorObject[] = lines.filter(l => Array.isArray(l.points) && l.points.length >= 4 && l.points.every(Number.isFinite)).map((l, i) => ({
    id: `stroke_${i}`, kind: 'PATH', x: 0, y: 0, w: 1920, h: 1080, points: [...l.points], fill: 'none', stroke: l.color || '#ff8c00', strokeWidth: 5, rotation: 0, opacity: 1,
  }));
  return { id: `tela_collab_${project.id}`, ownerId: project.ownerId, title: project.name, createdAt: project.updatedAt, updatedAt: project.updatedAt,
    frames: [{ id: 'board', kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: 1920, h: 1080, deviceIds: ['scene'] }],
    devices: { scene: { id: 'scene', type: 'VECTOR', width: 1920, height: 1080, objects } } };
}
export function serializeCollaborationTela(doc: TelaDoc): string {
  const json = JSON.stringify(doc);
  if (new TextEncoder().encode(json).length > 700_000) throw new Error('This board is too large to share inline. Remove embedded media or use linked assets.');
  return json;
}
