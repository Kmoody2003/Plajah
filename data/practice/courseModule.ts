/**
 * A self-contained course for the Learn map: reading lessons + practice questions, authored from the
 * data that already powers a Labs discipline or museum (so the Learn map and the studio agree).
 * One file per course in data/practice/courses/<curriculumId>.ts exporting `COURSE_MODULE`.
 */
import type { Curriculum } from '../../services/schoolChassis';
import type { QuestionBank } from './types';

export interface CourseModule {
  curriculum: Curriculum;
  bank: QuestionBank;
}
