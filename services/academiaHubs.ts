/**
 * academiaHubs — resolves which Academia hubs a user holds, powering the
 * "My Academia Hub" identity pill on the profile (Concept B) and, later, the
 * full "My Places" switcher.
 *
 * Rules (user-directed):
 *  - STUDENT/CHILD/school-provisioned accounts → Student Hub (school-affiliated).
 *  - TEACHER / verified teacher / school admin → Teacher Hub (school-affiliated).
 *  - A creator who teaches a course (teachingKind INSTRUCTOR) → Teacher Hub (platform).
 *  - Any user enrolled in a class (pass via extras — needs an async lookup) → Student Hub (platform).
 *  - PARENT with children ACTIVE in a class → Parent Hub (school-affiliated).
 *  School-affiliated hubs get the cyan "verified school" treatment; platform
 *  (Plajah Learn) hubs get the brand gradient. See docs/ACADEMIA_SESSION_HANDOFF.md.
 */
import type { UserProfile, AppView } from '../types';

export interface AcademiaHub {
  id: 'student' | 'teacher' | 'parent';
  label: string;
  icon: string;               // emoji — pills render it directly
  /** true = tied to a real school (cyan); false = Plajah Learn / platform (brand). */
  school: boolean;
  view: AppView;              // where the pill navigates
  sub: string;                // one-line description for the switcher rows
}

export interface AcademiaHubExtras {
  /** The user owns/teaches at least one classroom or creator course (async lookup). */
  ownsCourses?: boolean;
  /** The user is enrolled in at least one class (async lookup). */
  enrolledInClasses?: boolean;
}

const isSchoolTeacher = (p: UserProfile): boolean =>
  p.accountType === 'TEACHER' ||
  (p as any).isTeacher === true ||
  (!!p.teacherVerification && p.teacherVerification !== 'UNVERIFIED') ||
  (p as any).isSchoolAdmin === true;

const isSchoolStudent = (p: UserProfile): boolean =>
  p.accountType === 'STUDENT' ||
  p.accountType === 'CHILD' ||
  (p as any).isChild === true ||
  !!(p as any).provisionedByTeacherUid ||
  (p as any).childState === 'SCHOOL_PROVISIONED';

const isCreatorInstructor = (p: UserProfile): boolean =>
  Array.isArray((p as any).teachingKind) && (p as any).teachingKind.includes('INSTRUCTOR');

export function resolveAcademiaHubs(
  profile: UserProfile | null | undefined,
  extras: AcademiaHubExtras = {},
): AcademiaHub[] {
  if (!profile) return [];
  const hubs: AcademiaHub[] = [];

  // Teacher hub — school teachers first, then creator-instructors / course owners.
  if (isSchoolTeacher(profile)) {
    hubs.push({ id: 'teacher', label: 'Teacher Hub', icon: '🍎', school: true, view: 'ACADEMIA_HOME' as AppView, sub: 'Classes, roster, gradebook & the full teacher-tools suite' });
  } else if (isCreatorInstructor(profile) || extras.ownsCourses) {
    hubs.push({ id: 'teacher', label: 'Teacher Hub', icon: '🍎', school: false, view: 'ACADEMIA_COURSES' as AppView, sub: 'Your courses, learners & creator-teaching tools' });
  }

  // Student hub — school students, else platform learners enrolled in classes.
  if (isSchoolStudent(profile)) {
    hubs.push({ id: 'student', label: 'Student Hub', icon: '🎒', school: true, view: 'ACADEMIA_HOME' as AppView, sub: 'Your classes, mastery, quests & academic record' });
  } else if (extras.enrolledInClasses) {
    hubs.push({ id: 'student', label: 'Student Hub', icon: '🎒', school: false, view: 'ACADEMIA_COURSES' as AppView, sub: 'Your courses, progress & verifiable credentials' });
  }

  // Parent hub — only with children actively linked.
  if (profile.accountType === 'PARENT' && Array.isArray(profile.childUids) && profile.childUids.length > 0) {
    hubs.push({ id: 'parent', label: 'Parent Hub', icon: '👪', school: true, view: 'ACADEMIA_HOME' as AppView, sub: 'Your children, class feeds & their progress' });
  }

  return hubs;
}

/** True when any held hub is school-affiliated → the pill takes the cyan school treatment. */
export const hubsAreSchoolAffiliated = (hubs: AcademiaHub[]): boolean => hubs.some(h => h.school);
