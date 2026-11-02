// The wall between accounts in Content HQ. Pure so tests can hold it in place.
//
// A person's files belong to that person and an org's files belong to that org. Nothing here falls
// back to another org when an id is missing: no scope means no files. Going outside an org takes an
// explicit grant, made on the server (routes/elevateAccess.ts) and returned by it.

export type HqScopeKind = 'org' | 'user' | 'business';

export interface HqReadScope {
  kind: HqScopeKind;
  /** The id assets are stored under: the uid for a person, the org id for an org. */
  id: string;
  /** Teacher Tools' personal library, filed by document class. */
  teacher: boolean;
}

/** Old browser buckets that several accounts wrote into. They are never read again. */
export const LEGACY_SHARED_SCOPE_IDS: ReadonlySet<string> = new Set(['great-faith-ministries', 'teacher-personal-hq', 'unscoped']);

export function isStandaloneTeacherScopeId(scopeId?: string | null): boolean {
  if (!scopeId) return false;
  const clean = scopeId.trim().toLowerCase();
  return clean === 'teacher-personal-hq' || clean.startsWith('teacher-') || clean.startsWith('teacher_') || clean.startsWith('user-');
}

/** The scope this signed-in person may read, or null. A person's scope can only ever be their own. */
export function resolveHqReadScope(scope: { kind: HqScopeKind; id: string } | null | undefined, uid: string | null | undefined): HqReadScope | null {
  if (!uid || !scope?.id) return null;
  if (LEGACY_SHARED_SCOPE_IDS.has(scope.id)) return null;
  if (scope.kind === 'business') return { kind: 'business', id: scope.id, teacher: false };
  if (scope.kind === 'user' || isStandaloneTeacherScopeId(scope.id)) {
    if (scope.id === uid) return { kind: 'user', id: uid, teacher: false };
    if (scope.id === `teacher-${uid}`) return { kind: 'user', id: uid, teacher: true };
    return null;
  }
  return { kind: 'org', id: scope.id, teacher: false };
}

/** Whatever a list returns, a row outside the scope is dropped. */
export function onlyRowsInScope<T extends { scopeKind?: string; scopeId?: string }>(rows: T[], read: HqReadScope): T[] {
  return rows.filter(r => r.scopeId === read.id && r.scopeKind === read.kind);
}

/** This device's copy of a scope's list, kept per account so the next person to sign in can't read it. */
export const hqCacheKey = (uid: string, scopeId: string) => `plajah_hq_cache_v2_${uid}_${scopeId}`;

/** Local lesson lists that belong to this scope. */
export function ownUnitStorageIds(read: HqReadScope): string[] {
  return read.kind === 'user' ? [read.id, `teacher-${read.id}`] : [read.id];
}

/** Each account's own desk on a shared device. */
export const deskAssignmentsKey = (uid: string | null | undefined) => `plajah_universal_desk_assignments_v2_${uid || 'signed_out'}`;

/** Made-up work older builds put on every desk: Great Faith's course and two sample classes. */
export function isSeededDeskAssignment(a: { assignedByUid?: string; orgId?: string }): boolean {
  return a.assignedByUid === 'instructor_great_faith' || a.assignedByUid === 'teacher_academia' || LEGACY_SHARED_SCOPE_IDS.has(a.orgId || '');
}

/**
 * What moves to this account's desk from the old shared one: work this person assigned, and every
 * assignment they have started or turned in. A student's work is theirs and stays in their account.
 */
export function adoptFromSharedDesk<T extends { id?: string; assignedByUid?: string; orgId?: string }>(shared: T[], uid: string, startedIds: ReadonlySet<string> = new Set()): { mine: T[]; rest: T[] } {
  const real = shared.filter(a => !isSeededDeskAssignment(a));
  const isMine = (a: T) => a.assignedByUid === uid || (!!a.id && startedIds.has(a.id));
  return { mine: real.filter(isMine), rest: real.filter(a => !isMine(a)) };
}
