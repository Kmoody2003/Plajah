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
}): CourseSource {
  const { programs, orgId, orgName, teacher, academia } = opts;
  const [classes, setClasses] = useState<TeachingClass[] | null>(academia ? null : []);

  useEffect(() => {
    if (!academia) return;
    let live = true;
    loadMyTeachingClasses(teacher.uid).then(c => { if (live) setClasses(c); }).catch(() => { if (live) setClasses([]); });
    return () => { live = false; };
  }, [academia, teacher.uid]);

  return useMemo<CourseSource>(() => {
    if (academia) {
      const byId = new Map((classes || []).map(c => [c.id, c]));
      return {
        kind: 'ACADEMIA',
        loading: classes === null,
        deskTools: false,
        empty: 'You have no classes yet. Make one in Classrooms, add students, then schedule library work for it here.',
        courses: (classes || []).map(c => ({
          id: c.id,
          name: c.title,
          sub: `${c.enrolledStudents.length} student${c.enrolledStudents.length === 1 ? '' : 's'}${c.gradeBand ? ` · ${c.gradeBand}` : ''}`,
          reach: c.enrolledStudents.length,
        })),
        deliver: async (course, unit, when) => {
          const cls = byId.get(course.id);
          if (!cls) throw new Error('That class isn’t available.');
          await publishLibraryUnitToClass(cls, unit, teacher, when);
        },
        list: course => listClassHomework(teacher.uid, course.id),
        move: async (_course, item, at) => ((await rescheduleClassHomework(item.id, at)) ? { ...item, dueAt: at.dueAt, opensAt: at.opensAt && at.opensAt > Date.now() ? at.opensAt : undefined } : null),
      };
    }
    return {
      kind: 'CHRISTIAN_EDUCATION',
      loading: false,
      deskTools: true,
      empty: 'No courses yet. Make a class in Christian Education first, then schedule work for it here.',
      courses: programs.map(p => ({
        id: p.id,
        name: p.name,
        meetingSchedule: p.meetingSchedule,
        sub: `${(p.students || []).length} students${p.meetingSchedule ? ` · ${p.meetingSchedule}` : ''}`,
        reach: (p.students || []).filter(s => s.uid).length,
        program: p,
      })),
      deliver: async (course, unit, when) => {
        const due = new Date(when.dueAt);
        assignUnitToClassroomDesk({
          unit,
          domain: 'CHRISTIAN_EDUCATION',
          orgId,
          orgName,
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
      move: async (_course, item, at) => {
        const next = rescheduleDeskAssignment(item.id, { dueAt: at.dueAt, dueLabel: `Due ${fmtDay(new Date(at.dueAt))}`, opensAt: at.opensAt });
        return next ? { ...item, dueAt: next.dueAt, opensAt: next.opensAt } : null;
      },
    };
  }, [academia, classes, programs, orgId, orgName, teacher]);
}
