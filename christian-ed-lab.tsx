// Christian Ed lab: the new hub, class clubs, review queue and Tela Classwork with sample Grace Chapel data.
//   npx vite --config christian-ed-lab.vite.config.mjs  ->  http://127.0.0.1:3181/christian-ed-lab.html
//   ?as=teacher (default) | student | review | classwork | templates | hq-templates | academia-teacher | homeroom | library | library-student | library-academia | library-greatfaith | tela-home
// Firestore calls fail without sign-in and fall back to this device, the same way the app behaves offline.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LessonLibraryOverlay from './components/library/LessonLibraryOverlay';
import { LivingTemplateBespokeRenderer } from './components/desk/LivingTemplateBespokeRenderer';
import '/index.css';
import { FediverseProvider } from './contexts/FediverseContext';
import EdHub from './components/church/christianEd/EdHub';
import EdReviewQueue from './components/church/christianEd/EdReviewQueue';
import { ED_CSS } from './components/church/christianEd/edStyles';
import TelaClassworkStudio from './components/tela/classwork/TelaClassworkStudio';
import TemplateLibrary from './components/templates/TemplateLibrary';
import HqTemplatesTab from './components/templates/HqTemplatesTab';
import TeacherHub from './components/academia/TeacherHub';
import HomeroomView from './components/homeroom/HomeroomView';
import OrgLessonLibraryHub from './components/church/OrgLessonLibraryHub';
import TelaHome from './components/tela/TelaHome';
import { saveIngestedUnit } from './services/curriculumIngestionService';
import type { ChurchProgram } from './services/churchEducationService';
import type { IngestedCurriculumUnit } from './services/curriculumIngestionService';
import { assignUnitToClassroomDesk } from './services/universalStudentDeskService';
import type { EduSubmissionRecord } from './services/christianEdSync';

const as = new URLSearchParams(location.search).get('as') || 'teacher';
const church: any = { id: 'lab-grace', name: 'Grace Chapel', orgType: 'CHURCH', creatorId: 'lab-teacher', admins: ['lab-teacher'] };
const teacher = { uid: 'lab-teacher', name: 'Maria Alvarez' };
const student = { uid: 'lab-student-jonah', name: 'Jonah Brooks' };
const now = Date.now();

const unit: IngestedCurriculumUnit = {
  id: 'lab-unit-lost-son',
  orgId: church.id,
  programId: 'lab-kids',
  title: 'The Lost Son quiz',
  subtitle: 'Luke 15:11–32',
  sourceKind: 'PDF_DOCUMENT',
  sourceLabel: 'Week6_LostSon_Packet.pdf',
  answerKeySourceLabel: 'Week6_LostSon_Key.pdf',
  kind: 'QUIZ',
  libraryCategory: 'QUIZ_EXAM',
  lessonBlocks: [{ id: 'b1', kind: 'h1', text: 'The Lost Son' }],
  questions: [
    { id: 'q1', number: 1, prompt: 'Who asked for his share of the inheritance?', type: 'multiple-choice', options: ['The younger son', 'The older son', 'The father'], correctAnswer: 'The younger son', points: 1, skillId: 's1', skillTitle: 'Parables' },
    { id: 'q2', number: 2, prompt: 'The father ran to meet his son.', type: 'true-false', options: ['True', 'False'], correctAnswer: 'True', points: 1, skillId: 's1', skillTitle: 'Parables' },
    { id: 'q3', number: 3, prompt: 'Why was the older brother upset?', type: 'short-answer', correctAnswer: 'He felt his faithful work went unrewarded (v. 29–30).', points: 2, skillId: 's1', skillTitle: 'Parables' },
  ],
  masterySkills: [{ id: 's1', title: 'Parables', description: 'Retell and explain a parable', questionIds: ['q1', 'q2', 'q3'], targetQuestions: 3 }],
  syllabusWeeks: [],
  telaDocId: 'lab-tela-lost-son',
  worksheet: { id: 'ws', title: 'The Lost Son quiz', subject: 'Bible', objective: 'Retell the parable', standardIds: [], fields: [], createdBy: teacher.uid } as any,
  totalPoints: 4,
  departmentFolder: 'Grace Chapel Education',
  documentClassFolder: 'Quizzes & Assessments',
  rawCurriculumText: 'The Lost Son — Luke 15:11-32\n1. Who asked for his share of the inheritance?\n2. True or false: the father ran to meet his son.\n3. Why was the older brother upset?',
  rawAnswerKeyText: '1. The younger son\n2. True\n3. He felt his faithful work went unrewarded (v. 29-30).',
  createdAt: now,
};

const kids: ChurchProgram = {
  id: 'lab-kids',
  orgId: church.id,
  name: 'Kids Sunday School',
  kind: 'sunday-school',
  ageBand: 'Ages 6–9',
  description: 'Bible stories, memory verses and crafts.',
  meetingSchedule: 'Sundays · 9:15 AM · Room B-104',
  leadInstructor: teacher.name,
  assignedTeam: [{ uid: teacher.uid, name: teacher.name, roleKey: 'INSTRUCTOR' }],
  courseIds: [],
  weeks: [
    { id: 'w1', title: 'The Good Samaritan', passage: 'Luke 10:25–37', note: '' },
    { id: 'w2', title: 'The Lost Son', passage: 'Luke 15:11–32', note: 'Skit + coloring page', unitIds: [unit.id] },
    { id: 'w3', title: 'The Mustard Seed', passage: 'Matthew 13:31–32', note: '' },
  ],
  currentWeek: 1,
  students: [
    { id: 'u1', uid: student.uid, name: student.name, guardianName: 'Lisa Brooks', addedAt: now },
    { id: 'p2', personId: 'p2', name: 'Ruth Kim', guardianName: 'Sam Kim', addedAt: now },
  ],
  joinCode: 'GRACE-K6Q',
  chatRoomId: 'lab-kids-chat',
  createdBy: teacher.uid,
  createdAt: now - 86400_000 * 30,
};
const youth: ChurchProgram = {
  ...kids,
  id: 'lab-youth',
  name: 'Youth Group',
  kind: 'youth',
  ageBand: 'Grades 6–12',
  meetingSchedule: 'Wednesdays · 7:00 PM · Youth Hall',
  weeks: [],
  currentWeek: 0,
  students: [],
  joinCode: undefined,
  chatRoomId: 'lab-youth-chat',
};

// Put the quiz on this device's desk so the student view has something due.
assignUnitToClassroomDesk({
  unit,
  domain: 'CHRISTIAN_EDUCATION',
  orgId: church.id,
  orgName: church.name,
  classroomId: kids.id,
  classroomName: kids.name,
  dueAt: now + 3 * 86400_000,
  dueLabel: 'Due Sun, Nov 1',
  assignedByUid: teacher.uid,
  assignedByName: teacher.name,
});

const sub: EduSubmissionRecord = {
  id: `desk_assign_${unit.id}_${kids.id}__${student.uid}`,
  orgId: church.id,
  programId: kids.id,
  assignmentId: `desk_assign_${unit.id}_${kids.id}`,
  assignmentTitle: unit.title,
  studentUid: student.uid,
  studentName: student.name,
  status: 'TURNED_IN',
  answers: { q1: 'The younger son', q2: 'True', q3: 'Because his dad threw a party for his brother and not for him' },
  // Turned in from the student's key-free class copy: nothing could be scored on their device.
  earnedPoints: 0,
  totalPoints: 4,
  percentage: 0,
  questionScores: { q1: { correct: false, earnedPoints: 0, maxPoints: 1, pending: true }, q2: { correct: false, earnedPoints: 0, maxPoints: 1, pending: true }, q3: { correct: false, earnedPoints: 0, maxPoints: 2, pending: true } },
  turnedInAt: now - 3600_000,
  updatedAt: now - 3600_000,
};

// A student filling in Great Faith's Exam 1 in its template (lab: import it first with ?as=library-greatfaith).
const DeskTry: React.FC = () => {
  const units: IngestedCurriculumUnit[] = JSON.parse(localStorage.getItem('plajah_ingested_curriculum_units_v1_great-faith-ministries') || '[]');
  const u = units.find(x => /Exam 1$/.test(x.title)) || units[0];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (!u) return <p style={{ padding: 30 }}>Open ?as=library-greatfaith first so the course imports.</p>;
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <LivingTemplateBespokeRenderer templateId={new URLSearchParams(location.search).get('tpl') || u.livingTemplateId || 'std-ws-kinfolk-editorial'} unit={u} answers={answers} onUpdateAnswer={(id, v) => setAnswers(a => ({ ...a, [id]: v }))} supplements={[]} />
    </div>
  );
};

const Lab: React.FC = () => {
  const [programs, setPrograms] = useState<ChurchProgram[]>([kids, youth]);
  const save = async (p: ChurchProgram) => setPrograms(prev => (prev.some(x => x.id === p.id) ? prev.map(x => (x.id === p.id ? p : x)) : [...prev, p]));

  // Academia hubs (signed out: their Firestore reads come back empty), for the phone layout.
  if (as === 'academia-teacher') return <TeacherHub user={{ uid: teacher.uid, displayName: teacher.name }} profile={{ uid: teacher.uid, displayName: teacher.name, accountType: 'TEACHER' }} onNavigate={v => console.log('navigate', v)} />;
  if (as === 'homeroom') return <HomeroomView user={{ uid: student.uid, displayName: student.name }} profile={{ uid: student.uid, displayName: student.name, accountType: 'STUDENT', age: 12 }} onNavigate={v => console.log('navigate', v)} />;

  if (as === 'tela-home') {
    // Tela home Recents filter: this browser also holds another account's docs and a demo seed doc; Mine hides them.
    const d = (id: string, title: string, ownerId: string, extra: object = {}) => ({ id, title, ownerId, createdAt: now - 9e7, updatedAt: now - Math.random() * 9e7, ...extra });
    const recent = [
      d('t1', 'Fall newsletter', teacher.uid),
      d('t2', 'Kids Sunday School · week 7 worksheet', teacher.uid, { orgId: church.id, orgName: church.name }),
      d('t3', 'Christmas pageant flyer', 'lab-pastor', { orgId: church.id, sharedBy: 'Pastor James' }),
      d('t4', 'Youth retreat packing list', 'lab-pastor', { orgId: church.id, editedBy: [teacher.uid] }),
      d('t5', 'Someone else’s resume', 'lab-other-account'),
      d('t6', 'Revelation 2 master syllabus', 'local-seed'),
      d('t7', 'Book club picks', 'lab-friend', { sharedBy: 'Dana' }),
    ];
    return <><TelaHome recent={recent} viewerUid={teacher.uid} memberOrgIds={[church.id]} onOpen={id => alert(`open ${id}`)} onCreate={() => {}} onChooseStyle={() => {}} onChoosePublication={() => {}} onChooseTemplate={() => {}} onImport={() => {}} /><LessonLibraryOverlay /></>;
  }
  if (as === 'desk-try') return <DeskTry />;
  if (as === 'library-greatfaith') {
    // Great Faith's Revelation 2 course, imported for real from its Google links (via the lab's stand-in server).
    return (
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* ?teacher=1: a teacher's view, where the org's lessons are locked and can only be copied. */}
        <OrgLessonLibraryHub orgId="great-faith-ministries" orgName="Great Faith Ministries" programs={[]} canAccessAnswerKey canUploadToLibrary viewerIsAdmin={!new URLSearchParams(location.search).has('teacher')} currentUserUid={teacher.uid} currentUserName={teacher.name} />
      </div>
    );
  }
  if (as === 'library' || as === 'library-student' || as === 'library-academia') {
    // Sample Grace Chapel items (lab only): a quiz, two assignments, a reading and a syllabus.
    const mk = (id: string, title: string, subtitle: string, cat: IngestedCurriculumUnit['libraryCategory'], qs = unit.questions, blocks = unit.lessonBlocks): IngestedCurriculumUnit =>
      ({ ...unit, id, title, subtitle, libraryCategory: cat, kind: cat === 'QUIZ_EXAM' ? 'QUIZ' : 'ASSIGNMENT', questions: qs, totalPoints: qs.reduce((n, q) => n + q.points, 0), lessonBlocks: blocks, sourceUrl: undefined, createdAt: now - Math.random() * 1e8 });
    const reading = [{ id: 'r1', kind: 'h2' as const, text: 'Before you read' }, { id: 'r2', kind: 'p' as const, text: 'Jesus told this story to people who grumbled that he welcomed sinners. Read it slowly and notice how each son responds to the father.' }, { id: 'r3', kind: 'quote' as const, text: 'This son of mine was dead and is alive again; he was lost and is found.', scripturePassage: 'Luke 15:24' }];
    // library-academia: a teacher with no org — no Christian Ed courses, so the sheet offers their own Academia classes.
    const academia = as === 'library-academia';
    for (const u of [
      unit,
      mk('lab-unit-good-sam', 'The Good Samaritan worksheet', 'Luke 10:25–37', 'ASSIGNMENT', unit.questions.slice(0, 2), reading),
      mk('lab-unit-mustard', 'Mustard Seed reflection', 'Matthew 13:31–32', 'ASSIGNMENT', [unit.questions[2]], reading),
      mk('lab-unit-reading', 'Parables reading packet', 'Read before week 7', 'COURSE_RESOURCE', [], reading),
      mk('lab-unit-midterm', 'Parables unit exam', 'Weeks 1–6', 'QUIZ_EXAM'),
      mk('lab-unit-syllabus', 'Kids Sunday School · Fall syllabus', 'September – December', 'SYLLABUS', [], reading),
    ]) saveIngestedUnit(academia ? { ...u, orgId: 'teacher-personal-hq', scopeKind: 'user' } : { ...u, orgId: church.id });
    const teach = as !== 'library-student';
    return (
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 60px' }}>
        <OrgLessonLibraryHub orgId={academia ? 'teacher-personal-hq' : church.id} orgName={academia ? teacher.name : church.name} scopeKind={academia ? 'user' : 'org'} programs={academia ? [] : programs} canAccessAnswerKey={teach} canUploadToLibrary={teach}
          currentUserUid={teach ? teacher.uid : student.uid} currentUserName={teach ? teacher.name : student.name} onSaveProgram={save} />
      </div>
    );
  }
  if (as === 'classwork') {
    return (
      <div style={{ height: '100vh' }}>
        <TelaClassworkStudio
          context={{ orgId: church.id, orgName: church.name, programId: kids.id, programName: kids.name, domain: 'CHRISTIAN_EDUCATION' }}
          onClose={() => {}}
          onOpenDoc={() => {}}
          onReturn={() => alert('Back to Kids Sunday School')}
          returnLabel="Kids Sunday School"
        />
      </div>
    );
  }
  if (as === 'templates') {
    return <TemplateLibrary orgId={church.id} orgName={church.name} viewer={teacher} isOrgAdmin orgRole="admin" onClose={() => {}} />;
  }
  if (as === 'hq-templates') {
    return <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, height: '100vh' }}><HqTemplatesTab scope={{ kind: 'org', id: church.id, label: church.name }} canEdit viewer={teacher} /></div>;
  }
  if (as === 'review') {
    return (
      <div className="ce" style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        <style>{ED_CSS}</style>
        <EdReviewQueue
          canSeeKey
          onBack={() => {}}
          items={[{ sub, program: kids, assignment: { id: sub.assignmentId, unitSnapshot: unit, title: unit.title } as any }]}
        />
      </div>
    );
  }
  const viewer = as === 'student' ? student : teacher;
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 60px' }}>
      <EdHub
        church={church}
        canEdit={as !== 'student'}
        canSeeKey={as !== 'student'}
        viewer={viewer}
        programs={programs}
        units={[unit]}
        onSaveProgram={save}
        onReload={() => {}}
        onOpenTool={m => alert(`Open tool: ${m}`)}
      />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <FediverseProvider>
    <Lab />
  </FediverseProvider>,
);
