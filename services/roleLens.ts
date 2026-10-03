/**
 * Role lens — lets a platform admin experience Academia AS a teacher, student or parent, with the
 * admin's own real account and real data (no demo fixtures). The lens only swaps which role the
 * hubs render and how the profile reads (`accountType`); uid stays the admin's, so every class,
 * assignment, submission and progress doc the admin creates while "being" a student is genuine.
 *
 * Admin-only: `isPlatformAdmin` gates both the bar that sets it and `applyRoleLens`.
 */
import type { UserProfile } from '../types';

export type LensRole = 'teacher' | 'student' | 'parent';
const KEY = 'plajah:roleLens';
const EVT = 'plajah:roleLens';

export const OWNER_EMAILS = ['kmoody2003@gmail.com'];

export const isPlatformAdmin = (user?: any, profile?: any): boolean =>
  profile?.role === 'admin' || !!(user?.email && OWNER_EMAILS.includes(user.email));

export function getRoleLens(): LensRole | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'teacher' || v === 'student' || v === 'parent' ? v : null;
  } catch { return null; }
}

export function setRoleLens(role: LensRole | null): void {
  try { role ? localStorage.setItem(KEY, role) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: role })); } catch { /* non-browser */ }
}

export function onRoleLensChange(fn: (r: LensRole | null) => void): () => void {
  const h = () => fn(getRoleLens());
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}

const ACCOUNT_TYPE: Record<LensRole, string> = { teacher: 'TEACHER', student: 'STUDENT', parent: 'PARENT' };

/** The profile as the lens sees it. Non-admins and "no lens" pass straight through. */
export function applyRoleLens(profile: UserProfile | null, user: any, lens: LensRole | null): UserProfile | null {
  if (!profile || !lens || !isPlatformAdmin(user, profile)) return profile;
  return { ...profile, accountType: ACCOUNT_TYPE[lens] as any, isChild: false, __lens: lens } as UserProfile;
}

export const lensOf = (profile?: any): LensRole | null => (profile?.__lens as LensRole) || null;
