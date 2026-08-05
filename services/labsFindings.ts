// Findings — Plajah Academia's novel social layer for learning.
//
// A "Finding" is a short discovery, question, result, or insight ANCHORED to a specific concept
// (and its interactive experiment) inside a discipline. It rides the normal Plajah social feed
// (createPost) so it inherits likes, comments, sharing and moderation for free — but it carries
// anchor tags so it can be pulled back into the exact concept it belongs to and deep-linked there.
//
// This is the thing no other science site has: not a comment section bolted onto an article, but a
// living, remixable research conversation woven INTO the material — a finding on "wave-particle
// duality" opens the double-slit simulator in-context, and your reply is itself an experiment.

import { createPost, listenToGlobalPosts } from './backendService';
import type { Post } from '../types';

export const FINDING_TAG = 'finding';
export const conceptTag = (conceptId: string) => `concept:${conceptId}`;
export const simTag = (simId: string) => `sim:${simId}`;

export interface PostFindingInput {
  disciplineId: string;
  disciplineLabel: string;
  conceptId?: string;
  conceptName?: string;
  simulatorId?: string;
  /** Captured interactive-experiment parameters, restored when the finding is reopened. */
  simState?: Record<string, number | string>;
  text: string;
  kind?: 'insight' | 'question' | 'result';
}

/** Post a Finding to the discipline's discovery feed. Best-effort; throws only if createPost does. */
export async function postFinding(input: PostFindingInput): Promise<void> {
  const tags = [input.disciplineId, FINDING_TAG];
  if (input.conceptId) tags.push(conceptTag(input.conceptId));
  if (input.simulatorId) tags.push(simTag(input.simulatorId));

  // Encode a restorable experiment state in a machine-readable footer the UI can parse back out.
  const stateFooter = input.simState && Object.keys(input.simState).length
    ? `\n\n‹finding:${input.simulatorId || ''}:${encodeURIComponent(JSON.stringify(input.simState))}›`
    : '';
  const anchor = input.conceptName ? ` on ${input.conceptName}` : '';
  const kindLabel = input.kind === 'question' ? 'Question' : input.kind === 'result' ? 'Result' : 'Finding';

  await createPost({
    text: `🔬 ${kindLabel}${anchor} · ${input.disciplineLabel}\n\n${input.text}${stateFooter}`,
    isPublic: true,
    tags,
  } as any);
}

/** Parse a captured experiment state back out of a finding's text (null if none). */
export function parseFindingState(text?: string): { simulatorId: string; state: Record<string, any> } | null {
  if (!text) return null;
  const m = text.match(/‹finding:([^:]*):([^›]*)›/);
  if (!m) return null;
  try { return { simulatorId: m[1], state: JSON.parse(decodeURIComponent(m[2])) }; } catch { return null; }
}

/** Strip the machine-readable footer for display. */
export function findingDisplayText(text?: string): string {
  return (text || '').replace(/\n*‹finding:[^›]*›/g, '').trim();
}

/** Live-subscribe to a discipline's findings (optionally scoped to one concept). Returns unsub. */
export function subscribeFindings(
  disciplineId: string,
  onFindings: (posts: Post[]) => void,
  conceptId?: string,
): () => void {
  return listenToGlobalPosts((all: Post[]) => {
    const cTag = conceptId ? conceptTag(conceptId) : null;
    const findings = all.filter(p =>
      p.tags?.includes(FINDING_TAG) &&
      p.tags?.includes(disciplineId) &&
      (!cTag || p.tags?.includes(cTag))
    );
    onFindings(findings);
  });
}
