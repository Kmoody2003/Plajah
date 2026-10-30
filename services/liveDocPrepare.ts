// services/liveDocPrepare.ts — what a Tela document may carry onto a live stream, and what the audience may do
// to it. Pure, so it can be tested alone. The stream itself lives in services/liveDocSource.ts.

import type { TelaDoc } from '../types';
import type { TelaOp } from '../components/tela/telaOps';
import { forShare } from '../components/tela/telaCoedit';
import { gradeTelaAssignment } from './telaAssignmentEngine';

export type LiveDocMode = 'FOLLOW' | 'OWN_COPY' | 'TOGETHER';

const KEY_FIELDS = new Set(['correctAnswer', 'acceptedAnswers', 'explanation', 'answerKey', 'expected', 'rubricTarget', 'rawAnswerKeyText']);

function strip(v: unknown, dead: { count: number }): unknown {
  if (Array.isArray(v)) return v.map(x => strip(x, dead));
  if (typeof v === 'string') { if (v.startsWith('blob:')) dead.count++; return v; }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!KEY_FIELDS.has(k)) o[k] = strip(x, dead);
    return o;
  }
  return v;
}

/** The audience's copy: no private Notes and no answer keys. `deadMedia` counts files only this device can open
 *  (blob: links from an unsaved session), which the host should hear about before going on air. */
export function prepareLiveDoc(doc: TelaDoc): { doc: TelaDoc; deadMedia: number } {
  const dead = { count: 0 };
  const clean = strip(forShare(doc), dead) as TelaDoc;
  return { doc: clean, deadMedia: dead.count };
}

// What the audience can change on their copy: answers and shared work, never the lesson's structure.
const AUDIENCE_OPS = new Set<TelaOp['type']>(['WRITER_EDIT', 'SET_WRITER_BLOCKS', 'SET_GRID_CELL', 'ADD_BASE_ROW', 'SET_BASE_CELL']);
export const audienceMayApply = (op: { type?: string } | null | undefined): boolean => !!op && AUDIENCE_OPS.has(op.type as TelaOp['type']);

// ── Grading ─ the audience's copy has no keys, so only the presenter's original can mark a submission. ────

export type LiveFieldMark = 'CORRECT' | 'INCORRECT';
export interface LiveGradedField { fieldId: string; name: string; answer: string; status: string; earned: number; possible: number; tip?: string }
export interface LiveGrade { fields: LiveGradedField[]; earned: number; possible: number; percent: number; needsReview: boolean }

/** Marks one submission against the original, then applies any marks the presenter made by hand. */
export function gradeLiveResponse(original: TelaDoc, opJson: string, review?: Record<string, LiveFieldMark>): LiveGrade | null {
  let op: any;
  try { op = JSON.parse(opJson); } catch { return null; }
  const base: any = op?.type === 'ADD_BASE_ROW' ? original.devices[op.deviceId] : null;
  if (!base || base.type !== 'BASE' || !op.row?.values) return null;
  const grade = gradeTelaAssignment(base, op.row.values);
  const fields: LiveGradedField[] = base.fields.map((f: any) => {
    const g: any = grade.fields.find(x => x.fieldId === f.id);
    const possible = g?.possible ?? 0;
    const mark = review?.[f.id];
    return {
      fieldId: f.id, name: f.interaction?.prompt || f.name, answer: String(op.row.values[f.id] ?? ''),
      status: mark || g?.status || 'ANSWERED', earned: mark ? (mark === 'CORRECT' ? possible : 0) : g?.earned ?? 0, possible, tip: g?.studentTip,
    };
  });
  const earned = fields.reduce((n, f) => n + f.earned, 0);
  const possible = fields.reduce((n, f) => n + f.possible, 0);
  return { fields, earned, possible, percent: possible > 0 ? Math.round(earned / possible * 100) : 0, needsReview: fields.some(f => f.status === 'MANUAL_REVIEW') };
}

/** Which devices take input in each mode, for someone the presenter has brought on. */
export const deviceTakesInput = (type: string, mode: LiveDocMode): boolean =>
  mode !== 'FOLLOW' && (type === 'FORM' || type === 'GRID' || type === 'WRITER');

/** Interacting is invite only: the presenter, or a signed-in person they brought on. Everyone else watches. */
export const mayInteract = (d: { hostUid?: string; invitedUids?: string[] } | null | undefined, user: { uid?: string; isAnonymous?: boolean } | null | undefined): boolean =>
  !!d && !!user?.uid && !user.isAnonymous && (d.hostUid === user.uid || (d.invitedUids || []).includes(user.uid));

/** A viewer's own play and volume on a video or clip is theirs; everything else is hands off until invited. */
export const watcherMayTouch = (device: { type?: string; kind?: string }): boolean =>
  device.type === 'MEDIA' && (device.kind === 'VIDEO' || device.kind === 'AUDIO');
