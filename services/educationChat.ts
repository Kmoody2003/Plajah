// educationChat.ts — Phase C: education-scoped chat safety.
//
// The core guarantee: on an education account, a child/student can only message the adults
// responsible for them (their teachers and their own guardians) — never other students, and
// never arbitrary adults. Teachers and parents (adults) talk freely. This is enforced in the UI
// (Message buttons hide/disable) and should be mirrored in firestore.rules for defense-in-depth.
//
// Also defines the CLASSROOM room concept (a teacher↔class group thread) layered on the existing
// chat system, and the deterministic room id so a class chat converges on one doc.

import type { UserProfile } from '../types';

// ─── Role predicates ────────────────────────────────────────────────────────

/** A student/child account — the protected party whose messaging is restricted. */
export function isStudentAccount(p?: Partial<UserProfile> | null): boolean {
  if (!p) return false;
  const t = (p as any).accountType;
  return !!(p as any).isChild || t === 'CHILD' || t === 'STUDENT' || (p as any).childState === 'SCHOOL_PROVISIONED';
}

/** A teacher/educator account (verified or self-declared). */
export function isTeacherAccount(p?: Partial<UserProfile> | null): boolean {
  if (!p) return false;
  const t = (p as any).accountType;
  if (t === 'TEACHER') return true;
  if ((p as any).isTeacher) return true;
  const tv = (p as any).teacherVerification;
  return !!(tv && tv !== 'UNVERIFIED');
}

/** True if `adult` is a guardian of `child` (primary guardian, co-guardian, or listed as a parent). */
export function isGuardianOf(adult?: Partial<UserProfile> | null, child?: Partial<UserProfile> | null): boolean {
  if (!adult || !child) return false;
  const adultUid = (adult as any).uid;
  const childUid = (child as any).uid;
  if (!adultUid || !childUid) return false;
  if ((child as any).guardianUid === adultUid) return true;
  if (Array.isArray((child as any).coGuardianUids) && (child as any).coGuardianUids.includes(adultUid)) return true;
  if (Array.isArray((adult as any).childUids) && (adult as any).childUids.includes(childUid)) return true;
  return false;
}

// ─── The DM policy ──────────────────────────────────────────────────────────

export interface DMDecision { allowed: boolean; reason?: string }

/**
 * May `me` start a 1:1 DM with `them`? Restrictive only when a student/child is involved:
 *  - student ↔ student/child  → blocked
 *  - student ↔ their teacher   → allowed
 *  - student ↔ their guardian  → allowed
 *  - student ↔ any other adult → blocked (can't DM strangers)
 * When neither side is a student, this is a normal adult conversation → allowed (Plajah is a
 * general platform; we don't over-restrict teachers/parents/creators talking to each other).
 */
export function canDM(me?: Partial<UserProfile> | null, them?: Partial<UserProfile> | null): DMDecision {
  if (!me || !them) return { allowed: false, reason: 'Sign in to send a message.' };
  const meStudent = isStudentAccount(me);
  const themStudent = isStudentAccount(them);

  if (!meStudent && !themStudent) return { allowed: true }; // adult ↔ adult

  // A student is on at least one side. Two students can never DM each other.
  if (meStudent && themStudent) {
    return { allowed: false, reason: 'Students can\'t message other students. You can message your teachers and family.' };
  }

  // Exactly one side is the student; the other is the adult.
  const student = meStudent ? me : them;
  const adult = meStudent ? them : me;

  if (isTeacherAccount(adult)) {
    // Allow any teacher (the roster check tightens this in firestore.rules; UI stays permissive
    // so a student can reach a school teacher even before roster data loads).
    return { allowed: true };
  }
  if (isGuardianOf(adult, student)) return { allowed: true };

  return {
    allowed: false,
    reason: meStudent
      ? 'You can only message your teachers and your family.'
      : 'Only this student\'s teachers and guardians can message them.',
  };
}

// ─── CLASSROOM group rooms ──────────────────────────────────────────────────

/** Deterministic room id for a class's group chat, so all creators converge on one doc. */
export function classroomRoomId(classId: string): string {
  return `class_${classId}`;
}

/** The membership for a class chat: the teacher + all students, deduped. */
export function classroomParticipants(teacherUid: string, studentUids: string[]): string[] {
  return Array.from(new Set([teacherUid, ...studentUids].filter(Boolean)));
}
