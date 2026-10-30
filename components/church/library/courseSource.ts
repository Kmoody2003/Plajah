// Where the Lesson Library schedules work: Christian Ed courses (an org's churchPrograms, onto class desks)
// or, for a teacher with no org, their own Academia classes (through Academia homework). The schedule sheet
// and the course calendar only talk to this interface, so both kinds of teacher get the same flow.
import { useEffect, useMemo, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import {
  assignUnitToClassroomDesk,
  listDeskAssignments,
  mergeRemoteDeskAssignments,
  rescheduleDeskAssignment,
  type DeskAssignmentToolsConfig,
} from '../../../services/universalStudentDeskService';
import { fetchProgramAssignments } from '../../../services/christianEdSync';
import { loadMyTeachingClasses, type TeachingClass } from '../../../services/teacherClasses';
import { listClassHomework, publishLibraryUnitToClass, rescheduleClassHomework } from '../../../services/academiaLibrarySchedule';
import { fmtDay } from '../christianEd/edWork';

export interface ScheduleCourse {
  id: string;
  name: string;
  /** "Sundays · 9:15 AM" — drives "one per class meeting". */
  meetingSchedule?: string;
  /** Second line on the course chip. */
  sub: string;
  /** Students who will actually get it (have accounts). */
  reach: number;
  program?: ChurchProgram;
  /** How this class gets work: onto Christian Ed desks, or as Academia homework. */
  kind: 'CHRISTIAN_EDUCATION' | 'ACADEMIA';
  /** The org a Christian Ed class belongs to (classes can come from several orgs). */
  orgId?: string;
  orgName?: string;
}

export interface CourseItem {
  id: string;
  title: string;
  unitId?: string;
  kind?: string;
  dueAt: number;
  opensAt?: number;
}

export interface CourseSource {
  kind: 'CHRISTIAN_EDUCATION' | 'ACADEMIA';
  courses: ScheduleCourse[];
  loading: boolean;
  /** Shown when there are no courses. */
  empty: string;
  /** Desk tools and "add to the course plan" only exist for Christian Ed desks. */
  deskTools: boolean;
  deliver: (course: ScheduleCourse, unit: IngestedCurriculumUnit, when: { dueAt: number; opensAt?: number; tools: DeskAssignmentToolsConfig }) => Promise<void>;
  list: (course: ScheduleCourse) => Promise<CourseItem[]>;
  move: (course: ScheduleCourse, item: CourseItem, at: { dueAt: number; opensAt?: number | null }) => Promise<CourseItem | null>;
}

export function useCourseSource(opts: {
  programs: ChurchProgram[];
  orgId: string;
  orgName: string;
  teacher: { uid: string; name: string };
  /** No org: schedule onto the teacher's own Academia classes. */
  academia: boolean;
  /** Classes in other orgs this teacher teaches (the library opened on My lessons or the Platform library). */
  otherPrograms?: Array<{ program: ChurchProgram; orgName: string }>;
}): CourseSource {
  const { programs, orgId, orgName, teacher, academia, otherPrograms = [] } = opts;
  const [classes, setClasses] = useState<TeachingClass[] | null>(academia ? null : []);

  useEffect(() => {
    if (!academia) return;
    let live = true;
    loadMyTeachingClasses(teacher.uid).then(c => { if (live) setClasses(c); }).catch(() => { if (live) setClasses([]); });
    return () => { live = false; };
  }, [academia, teacher.uid]);

  return useMemo<CourseSource>(() => {
    const byId = new Map((classes || []).map(c => [c.id, c]));
    const ceCourses: ScheduleCourse[] = [
      ...programs.map(p => ({ program: p, orgId, orgName })),
      ...otherPrograms.filter(o => !programs.some(p => p.id === o.program.id)).map(o => ({ program: o.program, orgId: o.program.orgId, orgName: o.orgName })),
    ].map(({ program: p, orgId: oid, orgName: oname }) => ({
      id: p.id,
      name: p.name,
      meetingSchedule: p.meetingSchedule,
      sub: `${otherPrograms.length && oname ? `${oname} · ` : ''}${(p.students || []).length} students${p.meetingSchedule ? ` · ${p.meetingSchedule}` : ''}`,
      reach: (p.students || []).filter(s => s.uid).length,
      program: p,
      kind: 'CHRISTIAN_EDUCATION' as const,
      orgId: oid,
      orgName: oname,
    }));
    const acCourses: ScheduleCourse[] = (classes || []).map(c => ({
      id: c.id,
      name: c.title,
      sub: `${c.enrolledStudents.length} student${c.enrolledStudents.length === 1 ? '' : 's'}${c.gradeBand ? ` · ${c.gradeBand}` : ''}`,
      reach: c.enrolledStudents.length,
      kind: 'ACADEMIA' as const,
    }));
    const courses = [...ceCourses, ...acCourses];
    return {
      // The wording for a single kind of class; mixed lists word each class by its own kind.
      kind: academia && !ceCourses.length ? 'ACADEMIA' : 'CHRISTIAN_EDUCATION',
      loading: academia && classes === null,
      deskTools: ceCourses.length > 0,
      empty: academia
        ? 'You have no classes yet. Make one in Classrooms (or a Christian Ed class in your organization), add students, then schedule library work for it here.'
        : 'No courses yet. Make a class in Christian Education first, then schedule work for it here.',
      courses,
      deliver: async (course, unit, when) => {
        if (course.kind === 'ACADEMIA') {
          const cls = byId.get(course.id);
          if (!cls) throw new Error('That class isn’t available.');
          await publishLibraryUnitToClass(cls, unit, teacher, when);
          return;
        }
        const due = new Date(when.dueAt);
        assignUnitToClassroomDesk({
          unit,
          domain: 'CHRISTIAN_EDUCATION',
          orgId: course.orgId || orgId,
          orgName: course.orgName || orgName,
          classroomId: course.id,
          classroomName: course.name,
          dueAt: when.dueAt,
          dueLabel: `Due ${fmtDay(due)}`,
          opensAt: when.opensAt,
          assignedByUid: teacher.uid,
          assignedByName: teacher.name,
          toolsConfig: when.tools,
        });
      },
      list: async course => {
        if (course.kind === 'ACADEMIA') return listClassHomework(teacher.uid, course.id);
        // The class mirror (other teachers / devices) merged into this device's desk copy.
        mergeRemoteDeskAssignments(await fetchProgramAssignments(course.id));
        return listDeskAssignments({ classroomId: course.id }).map(a => ({
          id: a.id,
          title: a.title,
          unitId: a.unitId,
          kind: a.unitSnapshot?.libraryCategory || a.unitKind,
          dueAt: a.dueAt,
          opensAt: a.opensAt,
        }));
      },
      move: async (course, item, at) => {
        if (course.kind === 'ACADEMIA') return (await rescheduleClassHomework(item.id, at)) ? { ...item, dueAt: at.dueAt, opensAt: at.opensAt && at.opensAt > Date.now() ? at.opensAt : undefined } : null;
        const next = rescheduleDeskAssignment(item.id, { dueAt: at.dueAt, dueLabel: `Due ${fmtDay(new Date(at.dueAt))}`, opensAt: at.opensAt });
        return next ? { ...item, dueAt: next.dueAt, opensAt: next.opensAt } : null;
      },
    };
  }, [academia, classes, programs, otherPrograms, orgId, orgName, teacher]);
}
