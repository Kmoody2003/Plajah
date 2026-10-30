// services/liveDocPrepare.ts — what a Tela document may carry onto a live stream, and what the audience may do
// to it. Pure, so it can be tested alone. The stream itself lives in services/liveDocSource.ts.

import type { TelaDoc } from '../types';
import type { TelaOp } from '../components/tela/telaOps';
import { forShare } from '../components/tela/telaCoedit';

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

// A live session is for interacting. Nothing is turned in here: submitting work stays on the class's own path,
// so forms can't add a row and the document's answers table doesn't change.
const AUDIENCE_OPS = new Set<TelaOp['type']>(['WRITER_EDIT', 'SET_WRITER_BLOCKS', 'SET_GRID_CELL']);
export const audienceMayApply = (op: { type?: string } | null | undefined): boolean => !!op && AUDIENCE_OPS.has(op.type as TelaOp['type']);

/** Which devices take input in each mode, for someone the presenter has brought on. */
export const deviceTakesInput = (type: string, mode: LiveDocMode): boolean =>
  mode !== 'FOLLOW' && (type === 'GRID' || type === 'WRITER');

/** Interacting is invite only: the presenter, or a signed-in person they brought on. Everyone else watches. */
export const mayInteract = (d: { hostUid?: string; invitedUids?: string[] } | null | undefined, user: { uid?: string; isAnonymous?: boolean } | null | undefined): boolean =>
  !!d && !!user?.uid && !user.isAnonymous && (d.hostUid === user.uid || (d.invitedUids || []).includes(user.uid));

/** A viewer's own play and volume on a video or clip is theirs; everything else is hands off until invited. */
export const watcherMayTouch = (device: { type?: string; kind?: string }): boolean =>
  device.type === 'MEDIA' && (device.kind === 'VIDEO' || device.kind === 'AUDIO');
