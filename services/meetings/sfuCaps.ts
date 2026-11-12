/**
 * Meeting room caps — the ONE place they live. Shared by the server token route (which enforces
 * them) and the client (which only uses them to word messages). Decided 2026-11-12 to match what
 * people already know: Slack huddles 50, Zoom/Meet 100, Teams 300. Past 300 a meeting is a
 * broadcast: everyone moves to Stage / Go Live.
 *
 * Tune here; nothing else hard-codes these numbers.
 */

export type SfuRoomKind = 'huddle' | 'meeting';

export const MEETING_CAPS = {
  /** Huddles (the floating audio dock in a chat), open to everyone. */
  huddle: 50,
  /** Calls and scheduled meetings, open to everyone. */
  meeting: 100,
  /** Large meetings: org plans and Plajah+ only. */
  large: 300,
} as const;

/** The hard ceiling. Above this there is no meeting room at all — it's a broadcast. */
export const MAX_MEETING_ROOM = MEETING_CAPS.large;

export type CapRefusal = 'ROOM_FULL' | 'NEEDS_PLAN' | 'USE_BROADCAST';

export interface CapDecision {
  ok: boolean;
  /** The participant ceiling this room runs with (also set as LiveKit maxParticipants). */
  cap: number;
  /** Why a join was refused, when it was. */
  reason?: CapRefusal;
  message?: string;
}

/**
 * The ceiling a room of this kind gets. A meeting (not a huddle) grows to the large cap when the
 * room's owner/host, the org it belongs to, or the person starting it is on a paid plan.
 */
export function capFor(kind: SfuRoomKind, largeAllowed: boolean): number {
  if (kind === 'huddle') return MEETING_CAPS.huddle;
  return largeAllowed ? MEETING_CAPS.large : MEETING_CAPS.meeting;
}

/**
 * May one more person join? `current` = people in the room right now (LiveKit RoomService count,
 * not counting the joiner). `roomCap` = the cap the live room was created with, when it already
 * exists (the first joiner fixes it; LiveKit also enforces it as maxParticipants).
 */
export function decideJoin(input: { kind: SfuRoomKind; largeAllowed: boolean; current: number; roomCap?: number | null }): CapDecision {
  const planCap = capFor(input.kind, input.largeAllowed);
  const cap = input.roomCap && input.roomCap > 0 ? Math.min(input.roomCap, MAX_MEETING_ROOM) : planCap;
  const after = Math.max(0, input.current) + 1;
  if (after <= cap) return { ok: true, cap };
  if (cap >= MAX_MEETING_ROOM) {
    return { ok: false, cap, reason: 'USE_BROADCAST', message: `This meeting has reached ${MAX_MEETING_ROOM} people, the most a meeting room holds. Start it as a Stage broadcast so everyone can watch and the speakers can talk.` };
  }
  if (input.kind === 'meeting' && !input.largeAllowed && cap === MEETING_CAPS.meeting) {
    return { ok: false, cap, reason: 'NEEDS_PLAN', message: `This meeting is full (${cap} people). Meetings up to ${MEETING_CAPS.large} need an organization plan or Plajah+; for a bigger audience, start a Stage broadcast.` };
  }
  return { ok: false, cap, reason: 'ROOM_FULL', message: input.kind === 'huddle'
    ? `This huddle is full (${cap} people). Start a meeting for up to ${MEETING_CAPS.meeting}.`
    : `This room is full (${cap} people). For a bigger audience, start a Stage broadcast.` };
}

/** Error code the client gets when a room is refused; the UI shows the broadcast offer for it. */
export const SFU_REFUSED_CODE = 'MEETING_ROOM_REFUSED';
