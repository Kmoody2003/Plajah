// Pure newsroom-desk rules: deadlines, stage movement, pitch -> story conversion.

import { STORY_STAGES, type NewsroomStory, type Pitch, type PitchStatus, type StoryStage } from './types';

const DAY = 86_400_000;

export function deadlineState(deadline: number | undefined, stage: StoryStage, now = Date.now()): 'none' | 'done' | 'overdue' | 'soon' | 'ok' {
  if (!deadline) return 'none';
  if (stage === 'PUBLISHED') return 'done';
  if (deadline < now) return 'overdue';
  return deadline - now < DAY ? 'soon' : 'ok';
}

export function nextStage(stage: StoryStage, dir: 1 | -1): StoryStage | null {
  const i = STORY_STAGES.indexOf(stage) + dir;
  return i < 0 || i >= STORY_STAGES.length ? null : STORY_STAGES[i];
}

/**
 * A story may not enter SCHEDULED/PUBLISHED by dragging on the desk: those states are produced by
 * the publish flow (which runs the rights/disclosure/fact-check gate). Everything else is free.
 */
export function canMoveTo(from: StoryStage, to: StoryStage): { ok: boolean; reason?: string } {
  if (to === 'SCHEDULED' || to === 'PUBLISHED') return { ok: false, reason: 'Use the article editor to schedule or publish: it runs the pre-publish checks.' };
  if (from === 'PUBLISHED') return { ok: false, reason: 'Published stories change through a public correction or update, not the desk.' };
  return { ok: true };
}

export function sortDesk(stories: ReadonlyArray<NewsroomStory>): NewsroomStory[] {
  return [...stories].sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.createdAt - b.createdAt);
}

export const PITCH_TRANSITIONS: Record<PitchStatus, PitchStatus[]> = {
  DRAFT: ['SUBMITTED', 'KILLED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'KILLED'],
  ACCEPTED: ['KILLED'],
  REJECTED: ['SUBMITTED'],
  KILLED: ['DRAFT'],
};

export function canTransitionPitch(from: PitchStatus, to: PitchStatus): boolean {
  return PITCH_TRANSITIONS[from].includes(to);
}

/** Accepting a pitch creates the story, assigned, and links both ways. */
export function storyFromPitch(p: Pitch, opts: { id: string; now?: number; assigneeId?: string; assigneeName?: string; deadline?: number; section?: string }): NewsroomStory {
  const now = opts.now ?? Date.now();
  const slug = p.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled-story';
  const assigneeId = opts.assigneeId ?? p.assignedTo;
  return {
    id: opts.id, ownerId: p.ownerId, ...(p.orgId ? { orgId: p.orgId } : {}), slug, stage: assigneeId ? 'ASSIGNED' : 'PITCH', pitchId: p.id,
    ...(assigneeId ? { assigneeId } : {}), ...(opts.assigneeName ? { assigneeName: opts.assigneeName } : {}),
    ...(opts.deadline ? { deadline: opts.deadline } : {}), ...(opts.section ? { section: opts.section } : {}), notes: p.angle, createdAt: now, updatedAt: now,
  };
}

/** Pitches waiting on an answer past their response date. */
export function stalePitches(pitches: ReadonlyArray<Pitch>, now = Date.now()): Pitch[] {
  return pitches.filter(p => p.status === 'SUBMITTED' && p.responseDue && p.responseDue < now);
}
