// TeacherToolsView — Phase 4 teacher backend. Three tools over the class's Learner Ledger:
//   1. Gradebook — a standards-based mastery heatmap (students × standards), auto-grouped.
//   2. Plan from Mastery — the killer feature: reads the class's weakest standards and GENERATES
//      a standards-aligned, pre-differentiated lesson plan (Support / On-Level / Turbo) that pulls
//      Plajah's own cartridges. Planning becomes "approve & tweak", not "start from blank".
//   3. Assess Work — score a student's creative artifact against a standard's rubric → writes a
//      teacher-assessment record to that student's ledger (creativity-as-assessment).
//
// Demoable on the bundled DEMO class (Room 4B). Per-student × per-standard mastery is derived
// deterministically for the demo; in production this reads learnerProficiency for each student.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LayoutGrid, Wand2, ClipboardCheck, Sparkles, Check, Plug, Globe, Download, CalendarDays, FileDown, Send, Trash2, Plus, ListChecks, Printer, Library, Copy, ExternalLink, Music, Film, Image as ImageIcon, Camera, UploadCloud, Loader2, Bell, Users, MessageSquare, Hand, Palette, ScanLine, KeyRound, RefreshCw, BookOpen, ShieldCheck, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';
import LessonContentPicker, { type PickedResource } from './LessonContentPicker';
import { DEMO_CLASS } from '../data/demoClassroom';
import {
  STANDARDS, standardById, bandFor, masteryToLevel, masteryToPISABand, turboTrackFor, BAND_TO_GRADES,
  type GradeId, type Subject, type LearningStandard,
} from '../data/educationStandards';
import { appendRecord } from '../services/learningLedgerService';
import {
  INTEGRATIONS, importCASEFramework, SAMPLE_CASE, type IntegrationStatus,
  exportGradebookCSV, toGoogleClassroomCoursework, toLtiResourceLink, toQTIAssessment, downloadText,
  type CheckQuestion,
} from '../services/interopService';
import { ORG_TYPES, FRAMEWORK_OVERLAYS, DEFAULT_CONTEXT, type LearningContextSettings } from '../data/deploymentContexts';
import { digitizeWorksheetDetailed, completionPercent, type DigitalWorksheet, type WorksheetField } from '../services/worksheetDigitizer';
import { publishWorksheet, fetchAssignmentBrief, confirmSubmissionField, type WireResult } from '../services/worksheetAssignmentService';
import { prepareWorksheetImage, type PreparedWorksheetImage } from '../services/worksheetImagePipeline';
import { worksheetToTelaDoc } from '../services/worksheetTelaAdapter';
import { autoFormatDigitalWorksheet } from '../services/telaAssignmentAutoFormat';
import { rebuildDocumentIntelligently, reillustrateReconstruction, type TelaModelProgress } from '../services/telaDocumentIntelligence';
import { recordAssignmentQualityEvent, submitAssignmentQualityFeedback } from '../services/assignmentQualityService';
import { saveTelaDoc, loadTelaDoc } from '../services/telaStore';
import { telaDocToWorksheet } from '../services/worksheetTelaInverse';
import TelaEmbed from './tela/TelaEmbed';
import WorksheetTutorPanel from './WorksheetTutorPanel';
import WorksheetFillable from './WorksheetFillable';
import IntegrityWallPanel from './academia/IntegrityWallPanel';
import AssignmentTemplateStudio from './academia/AssignmentTemplateStudio';
import TurnInBriefView from './academia/TurnInBriefView';
import WorksheetAssignSetup, { type AssignTarget } from './academia/scan/WorksheetAssignSetup';
import { normalizeWorksheetPage, warmOcr } from '../services/worksheetLocalVision';
import { takeTeacherWorksheetScan } from '../services/worksheetOpen';
import ClassworkHandoff from './church/christianEd/ClassworkHandoff';
import { openTelaClasswork } from './church/christianEd/edWork';
import OrgLessonLibraryHub from './church/OrgLessonLibraryHub';
import SharedClassroomClubHub from './classroom/SharedClassroomClubHub';
import { UniversalStudentDesk } from './desk/UniversalStudentDesk';
import { HqFilesTab } from './ContentHQ';
import { FolderOpen, Menu, X } from 'lucide-react';
import {
  getStandaloneTeacherScopeId,
  getOrgEducationFolderName,
  copyCurriculumPairToOrgAssets,
  TEACHER_DOCUMENT_CLASS_FOLDERS,
} from '../services/orgAssets';
import type { Organization } from '../types';
import type { ChurchProgram } from '../services/churchEducationService';
import {
  loadOrgEducationScope,
  getOrgScopedSubjectBands,
  getOrgScopedCourses,
  listOrgUploadedEducationResources,
  type OrgEducationScopeConfig,
} from '../services/orgEducationScopeService';
import OrgEducationScopeGovernancePanel from './church/OrgEducationScopeGovernancePanel';
import { loadMyTeachingClasses, loadClassRoster, type TeachingClass } from '../services/teacherClasses';
import { fetchClassMastery, recordClassAssessment, type ClassMasteryMap } from '../services/teacherClassMastery';

export interface LessonPlan {
  id: string; title: string; subject: Subject; band: string; standardCode: string;
  objective: string; activities: string[]; notes: string; createdAt: number;
}

export interface AssignmentCheck {
  id: string; title: string; subject: Subject; band: string; standardCode: string;
  points: number; questions: CheckQuestion[]; createdAt: number;
}

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#fff', muted: '#9a9aa6', faint: '#777', orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const SUBJECTS: { id: Subject; label: string; cartridge: string; color: string }[] = [
  { id: 'ELA', label: 'Reading', cartridge: 'Reading Quest', color: T.orange },
  { id: 'SCIENCE', label: 'Science', cartridge: 'Science Quest', color: T.violet },
  { id: 'MATH', label: 'Math', cartridge: 'Math Classroom', color: T.blue },
];
const BANDS: { id: BandId; label: string }[] = [
  { id: 'g12', label: 'Grades 1–2' }, { id: 'g34', label: 'Grades 3–4' }, { id: 'g57', label: 'Grades 5–7' },
];
type BandId = 'prek' | 'g12' | 'g34' | 'g57';

// Deterministic per-(student, standard) mastery so the demo gradebook is stable + realistic.
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cellMastery = (studentId: string, standardId: string) => 38 + (hash(studentId + '|' + standardId) % 58); // 38..95

// The class every tool works on. A teacher's real class (services/teacherClasses) reads its mastery from the
// Learner Ledger through routes/academiaClass.ts; only the labelled sample class uses made-up numbers.
// masteryOf returns null where a student has no evidence on a standard yet.
interface ToolsClass {
  id: string;
  name: string;
  teacherName: string;
  students: { id: string; name: string; color: string }[];
  isSample: boolean;
  masteryOf: (studentId: string, standardId: string) => number | null;
}
const TOOL_GROUPS = ['Class', 'Assign & grade', 'Plan', 'Library', 'Settings'] as const;
const STUDENT_COLORS =['#FF8C00', '#36c5f0', '#2eb67d', '#ecb22e', '#e01e5a', '#8166e6', '#ff6b9a', '#4fd1c5'];
const sampleClass = (teacherName?: string): ToolsClass => ({
  id: DEMO_CLASS.id, name: DEMO_CLASS.name, teacherName: teacherName || DEMO_CLASS.teacherName,
  students: DEMO_CLASS.students, isSample: true, masteryOf: cellMastery,
});
const avgOf = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const chip = (on: boolean, color = T.orange): React.CSSProperties => ({ cursor: 'pointer', padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? color : T.border}`, background: on ? `${color}22` : 'transparent', color: on ? color : T.ink });
const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
  </div>
);

type Tab = 'contentHq' | 'grade' | 'plan' | 'planner' | 'checks' | 'assess' | 'reports' | 'connect' | 'context' | 'library' | 'worksheet' | 'templates' | 'integrity' | 'curriculum' | 'classroomClub' | 'studentDesk';

export interface TeacherToolsOrgContext {
  org: Organization;
  activeProgram?: ChurchProgram;
  programs?: ChurchProgram[];
  canManageScope?: boolean;
}

const PublishedWorksheetHqCopyEffect: React.FC<{
  published: boolean;
  sheet: DigitalWorksheet | null;
  telaDocId: string | null;
  prepared: PreparedWorksheetImage | null;
  orgContext?: TeacherToolsOrgContext;
  user?: any;
}> = ({ published, sheet, telaDocId, prepared, orgContext, user }) => {
  const copiedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!published || !sheet) return;
    const key = `${sheet.title}_${telaDocId || ''}`;
    if (copiedRef.current === key) return;
    copiedRef.current = key;

    const scopeKind = orgContext ? 'org' : 'user';
    const targetOrgId = orgContext ? orgContext.org.id : getStandaloneTeacherScopeId(user?.uid);
    const targetOrgName = orgContext ? orgContext.org.name : (user?.displayName || DEMO_CLASS.teacherName);
    const answerKeyLines = sheet.fields
      .filter(f => f.correctAnswer !== undefined && String(f.correctAnswer).trim() !== '')
      .map((f, idx) => `${idx + 1}. ${f.label}: ${f.correctAnswer}`)
      .join('\n');

    void copyCurriculumPairToOrgAssets({
      orgId: targetOrgId,
      orgName: targetOrgName,
      scopeKind,
      departmentFolder: orgContext
        ? getOrgEducationFolderName(orgContext.org.name)
        : 'Assignments & Worksheets',
      documentClassFolder: 'Assignments & Worksheets',
      title: sheet.title || 'Scanned Worksheet',
      unitId: sheet.id || `scan_${Date.now()}`,
      telaDocId: telaDocId || sheet.telaDocId || `tela_scan_${Date.now()}`,
      sourceKind: 'IMAGE_SCAN',
      originalText: sheet.fields.map((f, idx) => `${idx + 1}. ${f.label}`).join('\n'),
      originalFileName: prepared?.originalFile?.name || `${sheet.title || 'Worksheet'}.jpg`,
      originalMimeType: prepared?.originalFile?.type || 'image/jpeg',
      questionCount: sheet.fields.length,
      totalPoints: sheet.fields.reduce((acc, f) => acc + (f.points || 1), 0),
      answerKeyLabel: answerKeyLines ? `${sheet.title} — Auto-Extracted Answer Key` : undefined,
      answerKeyText: answerKeyLines || undefined,
    });
  }, [published, sheet, telaDocId, prepared, orgContext, user]);
  return null;
};

const TeacherToolsView: React.FC<{ onBack?: () => void; user?: any; orgContext?: TeacherToolsOrgContext }> = ({ onBack, user, orgContext }) => {
  // Hubs deep-link into a tab through sessionStorage (read once, then cleared) so "Build a lesson"
  // lands on Assignment Templates instead of whichever tab happens to be the default.
  const [tab, setTab] = useState<Tab>(() => {
    try { const t = sessionStorage.getItem('plajah:teacherTab') as Tab | null; sessionStorage.removeItem('plajah:teacherTab'); if (t === 'curriculum') { setTimeout(() => openClasswork(user, orgContext), 0); return 'worksheet'; } if (t) return t; } catch { /* */ }
    return 'plan';
  });
  const [subject, setSubject] = useState<Subject>('ELA');
  const [band, setBand] = useState<BandId>('g34');
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<AssignmentCheck[]>([]);

  const addPlan = (p: Omit<LessonPlan, 'id' | 'createdAt'>) => {
    setPlans(ps => [{ ...p, id: `lp_${ps.length + 1}_${p.standardCode}`, createdAt: 1 }, ...ps]);
    setTab('planner');
  };

  // ── The class these tools work on ──
  const [classes, setClasses] = useState<TeachingClass[] | null>(null);
  const [classId, setClassId] = useState<string>(() => { try { return localStorage.getItem('plajah:teacherToolsClass') || ''; } catch { return ''; } });
  const [roster, setRoster] = useState<Array<{ id: string; name: string }> | null>(null);
  const [mastery, setMastery] = useState<ClassMasteryMap | null>(null);
  useEffect(() => {
    let live = true;
    void loadMyTeachingClasses(user?.uid).then(list => {
      if (!live) return;
      setClasses(list);
      setClassId(id => (list.some(c => c.id === id) ? id : list[0]?.id || ''));
    });
    return () => { live = false; };
  }, [user?.uid]);
  const realClass = classes?.find(c => c.id === classId) || null;
  const refreshMastery = React.useCallback(() => {
    if (!realClass) return;
    void fetchClassMastery(realClass.id).then(setMastery);
  }, [realClass?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { if (classId) localStorage.setItem('plajah:teacherToolsClass', classId); } catch { /* private mode */ }
    setRoster(null); setMastery(null);
    if (!realClass) return;
    let live = true;
    void loadClassRoster(realClass).then(r => { if (live) setRoster(r); });
    void fetchClassMastery(realClass.id).then(m => { if (live) setMastery(m); });
    return () => { live = false; };
  }, [realClass?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls: ToolsClass = useMemo(() => {
    if (!realClass) return sampleClass(user?.displayName);
    return {
      id: realClass.id, name: realClass.title, teacherName: user?.displayName || 'Teacher', isSample: false,
      students: (roster || []).map((s, i) => ({ ...s, color: STUDENT_COLORS[i % STUDENT_COLORS.length] })),
      masteryOf: (sid, std) => { const m = mastery?.[sid]?.[std]; return typeof m === 'number' ? m : null; },
    };
  }, [realClass, roster, mastery, user?.displayName]);
  const students = cls.students;
  const grades = BAND_TO_GRADES[band] || [];


  const [orgScope, setOrgScope] = useState<OrgEducationScopeConfig | null>(() =>
    orgContext ? loadOrgEducationScope(orgContext.org) : null
  );
  const orgSubjectBands = useMemo(
    () => (orgScope ? getOrgScopedSubjectBands(orgScope) : []),
    [orgScope]
  );
  const [orgBandId, setOrgBandId] = useState<string>('BIBLICAL_STUDIES');
  const [orgAgeLevel, setOrgAgeLevel] = useState<string>('ALL');
  const activeOrgSubjectBand = useMemo(
    () => orgSubjectBands.find(b => b.id === orgBandId) || orgSubjectBands[0] || null,
    [orgSubjectBands, orgBandId]
  );

  const standards: LearningStandard[] = useMemo(() => {
    if (orgContext && activeOrgSubjectBand) {
      return activeOrgSubjectBand.standards.map(st => ({
        id: st.id,
        code: st.code,
        framework: 'CCSS_ELA' as const,
        subject: 'ELA' as Subject,
        grade: 'g3' as GradeId,
        domain: activeOrgSubjectBand.label,
        statement: `${st.title} — ${st.description}`,
      }));
    }
    return STANDARDS.filter(s => s.subject === subject && grades.includes(s.grade));
  }, [orgContext, activeOrgSubjectBand, subject, grades]);

  const [menuOpen, setMenuOpen] = useState(false);
  const tools: Array<{ id: Tab | 'contentHq'; label: string; icon: any; group: typeof TOOL_GROUPS[number] }> = [
    { id: 'classroomClub', label: 'Classroom Club & Live Lecture', icon: Users, group: 'Class' },
    { id: 'grade', label: orgContext ? 'Class Mastery' : 'Gradebook', icon: LayoutGrid, group: 'Class' },
    { id: 'reports', label: 'Reports', icon: Printer, group: 'Class' },
    { id: 'studentDesk', label: 'Student Desk', icon: BookOpen, group: 'Class' },
    { id: 'worksheet', label: 'Worksheet & Doc Capture', icon: ScanLine, group: 'Assign & grade' },
    { id: 'templates', label: 'Assignment Templates', icon: BookOpen, group: 'Assign & grade' },
    { id: 'checks', label: `Checks${assignments.length ? ` (${assignments.length})` : ''}`, icon: ListChecks, group: 'Assign & grade' },
    { id: 'assess', label: 'Assess Work', icon: ClipboardCheck, group: 'Assign & grade' },
    { id: 'plan', label: 'Plan from Mastery', icon: Wand2, group: 'Plan' },
    { id: 'planner', label: `Planner${plans.length ? ` (${plans.length})` : ''}`, icon: CalendarDays, group: 'Plan' },
    { id: 'library', label: orgContext ? `${orgContext.org.name} Education Library` : 'Lesson Library & Docs', icon: Library, group: 'Library' },
    { id: 'contentHq', label: orgContext ? `${getOrgEducationFolderName(orgContext.org.name)} HQ` : 'My Content HQ', icon: FolderOpen, group: 'Library' },
    ...(!orgContext || orgScope?.enabledTracks.includes('CONTINUING_EDUCATION_AND_CERTIFICATES') ? [{ id: 'integrity' as Tab, label: 'Integrity Wall', icon: ShieldCheck, group: 'Settings' as const }] : []),
    ...(!orgContext ? [
      { id: 'connect' as Tab, label: 'Integrations', icon: Plug, group: 'Settings' as const },
      { id: 'context' as Tab, label: 'Context', icon: Globe, group: 'Settings' as const },
    ] : []),
  ];
  const currentTool = tools.find(t => t.id === tab);

  return (
    <div className="teacher-tools-view" style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px calc(70px + env(safe-area-inset-bottom))', fontFamily: T.font }}>
      <div style={{ maxWidth: tab === 'worksheet' ? 1500 : 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#36c5f0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={20} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{orgContext ? `${orgContext.org.name} · Instructor Tools` : 'Teacher Tools'}</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{orgContext ? `${orgContext.activeProgram?.name || 'Christian Education Classrooms'} · ${user?.displayName || 'Instructor'} · Scoped to ${orgContext.org.name} materials & topics` : `${cls.name} · ${cls.teacherName}${cls.isSample ? '' : ` · ${cls.students.length} students`}`}</p>
          </div>
        </div>

        {/* class */}
        {!orgContext && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {classes && classes.length > 0 ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', maxWidth: 420 }}>
                <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>Class</span>
                <select value={classId} onChange={e => setClassId(e.target.value)} style={{ ...selStyle, minHeight: 44 }}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.title} · {c.enrolledStudents.length} students</option>)}
                </select>
              </label>
            ) : classes ? (
              <span style={{ fontSize: 12.5, color: T.muted }}>
                <b style={{ color: T.orange }}>Sample class</b> — the names and scores here are made up. Create a class in Classrooms and it shows up here with your real students.
              </span>
            ) : <span style={{ fontSize: 12.5, color: T.faint }}>Loading your classes…</span>}
          </div>
        )}

        {/* subject + band */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {orgContext && (
            <div style={{ width: '100%' }}>
              <OrgEducationScopeGovernancePanel
                org={orgContext.org}
                canManageScope={!!orgContext.canManageScope}
                currentUserName={user?.displayName}
                onScopeChange={setOrgScope}
                onOpenWorksheetExtractor={() => {
                  openClasswork(user, orgContext);
                }}
              />
            </div>
          )}
          <div><Eyebrow>{orgContext ? `${orgContext.org.name} Provisioned Tracks` : 'Subject'}</Eyebrow><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{orgContext ? orgSubjectBands.map(b => <button key={b.id} onClick={() => setOrgBandId(b.id)} style={chip(activeOrgSubjectBand?.id === b.id, b.color)}>{b.label}</button>) : SUBJECTS.map(s => <button key={s.id} onClick={() => setSubject(s.id)} style={chip(subject === s.id, s.color)}>{s.label}</button>)}</div></div>
          <div><Eyebrow>{orgContext ? 'Audience / Age Band' : 'Level'}</Eyebrow><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{orgContext ? ([['ALL', 'All Ages'], ['YOUTH', 'Children & Youth'], ['ADULTS', 'Young Adults & Adults'], ['LEADERS', 'Instructors & Leaders']] as const).map(([id, label]) => <button key={id} onClick={() => setOrgAgeLevel(id)} style={chip(orgAgeLevel === id)}>{label}</button>) : BANDS.map(b => <button key={b.id} onClick={() => setBand(b.id)} style={chip(band === b.id)}>{b.label}</button>)}</div></div>
        </div>

        {/* tools: tabs on wide screens; on a phone one "current tool" button opens a slide-out list */}
        <style>{`.tt-menubtn{display:none}.tt-drawer-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60}.tt-drawer{position:fixed;top:0;bottom:0;left:0;width:min(86vw,340px);background:${T.card};border-right:1px solid ${T.border};z-index:61;overflow-y:auto;padding:calc(14px + env(safe-area-inset-top)) 12px calc(20px + env(safe-area-inset-bottom));animation:ttIn .18s ease-out}@keyframes ttIn{from{transform:translateX(-100%)}to{transform:none}}@media(prefers-reduced-motion:reduce){.tt-drawer{animation:none}}@media(max-width:720px){.teacher-tools-tabs{display:none!important}.tt-menubtn{display:flex}.teacher-tools-view input,.teacher-tools-view select,.teacher-tools-view textarea{font-size:16px!important}}`}</style>
        <div className="teacher-tools-tabs" style={{ display: 'flex', gap: 8, margin: '18px 0 20px', flexWrap: 'wrap' }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === t.id ? T.orange : T.border}`, background: tab === t.id ? T.orange : 'transparent', color: tab === t.id ? '#1a1a1a' : T.muted }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="tt-menubtn" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen}
          style={{ position: 'sticky', top: 0, zIndex: 20, width: '100%', alignItems: 'center', gap: 10, margin: '14px 0 16px', minHeight: 48, padding: '0 14px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.card, color: T.ink, cursor: 'pointer', fontFamily: T.font }}>
          <Menu size={18} />
          {currentTool && <currentTool.icon size={16} color={T.orange} />}
          <span style={{ fontSize: 15, fontWeight: 800, flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTool?.label || 'Tools'}</span>
          <span style={{ fontSize: 12, color: T.muted }}>All tools</span>
        </button>
        {menuOpen && (
          <>
            <div className="tt-drawer-back" onClick={() => setMenuOpen(false)} />
            <nav className="tt-drawer" role="dialog" aria-modal="true" aria-label="Teacher tools" onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 900 }}>Teacher tools</span>
                <button type="button" autoFocus onClick={() => setMenuOpen(false)} aria-label="Close" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 10, border: 'none', background: 'transparent', color: T.ink, cursor: 'pointer' }}><X size={20} /></button>
              </div>
              {TOOL_GROUPS.map(g => {
                const list = tools.filter(t => t.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: T.muted, padding: '0 10px 6px' }}>{g}</div>
                    {list.map(t => (
                      <button key={t.id} type="button" onClick={() => { setTab(t.id); setMenuOpen(false); window.scrollTo({ top: 0 }); }} aria-current={tab === t.id ? 'page' : undefined}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 10px', borderRadius: 10, border: 'none', background: tab === t.id ? `${T.orange}22` : 'transparent', color: tab === t.id ? T.orange : T.ink, fontSize: 15, fontWeight: 700, textAlign: 'left', cursor: 'pointer', fontFamily: T.font }}>
                        <t.icon size={18} /> {t.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>
          </>
        )}

        {tab === 'worksheet' ? (
          <ScanWorksheet user={user} orgContext={orgContext} preferClassId={realClass?.id} />
        ) : tab === 'studentDesk' ? (
          <UniversalStudentDesk
            studentUid={user?.uid || 'student_academia'}
            studentName={user?.displayName || 'Academia Scholar'}
            defaultDomain="ALL"
            onOpenTelaStudio={(docId: string) => {
              window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
            }}
          />
        ) : tab === 'classroomClub' ? (
          <SharedClassroomClubHub
            classId={cls.id}
            className={cls.name}
            classSubtitle={`${cls.teacherName} · Teacher-Governed Classroom Club (Social Feed, Photos, Live Video/Audio Lecture, Raise Hand & Digital Whiteboard)`}
            contextKind="ACADEMIA"
            teacherUid={user?.uid || 'teacher_demo'}
            teacherName={cls.teacherName}
            isTeacher={true}
            currentUserUid={user?.uid || 'teacher_demo'}
            currentUserName={cls.teacherName}
            rosterStudents={cls.students.map(s => ({ id: s.id, name: s.name }))}
          />
        ) : (tab as string) === 'contentHq' ? (
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <Eyebrow color={T.green}>
                  {orgContext
                    ? `${orgContext.org.name} · ${getOrgEducationFolderName(orgContext.org.name)} Asset Manager`
                    : `${user?.displayName || DEMO_CLASS.teacherName} · Personal Teacher Content HQ`}
                </Eyebrow>
                <div style={{ fontSize: 16, fontWeight: 900 }}>
                  {orgContext
                    ? `${getOrgEducationFolderName(orgContext.org.name)} — Content HQ`
                    : `My Content HQ — Organized by Document Class`}
                </div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
                  {orgContext
                    ? `All lessons, assignments, quizzes, syllabi, and answer keys uploaded or extracted for ${orgContext.org.name} live in the "${getOrgEducationFolderName(orgContext.org.name)}" folder.`
                    : `As an independent teacher not in an organization, everything you upload or extract from links (lessons, assignments, quizzes, syllabi, and answer keys) is saved in your own Content HQ with a dedicated folder for each class of documents: ${TEACHER_DOCUMENT_CLASS_FOLDERS.map(f => f.label).join(' · ')}.`}
                </div>
              </div>
              <button
                onClick={() => {
                  openClasswork(user, orgContext);
                }}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10, fontSize: 11.5, fontWeight: 800, border: 'none', background: T.orange, color: '#1a1a1a' }}
              >
                <Sparkles size={14} /> Extract or Upload Resource
              </button>
            </div>
            <div style={{ height: 620, borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#0c0c12', padding: 12, display: 'flex', flexDirection: 'column' }}>
              <HqFilesTab
                scope={{
                  kind: orgContext ? 'org' : 'user',
                  id: orgContext ? orgContext.org.id : getStandaloneTeacherScopeId(user?.uid),
                  label: orgContext ? orgContext.org.name : (user?.displayName || DEMO_CLASS.teacherName),
                }}
                canEdit={true}
                defaultFolder={orgContext ? getOrgEducationFolderName(orgContext.org.name) : 'ALL'}
              />
            </div>
          </div>
        ) : tab === 'curriculum' ? (
          <ClassworkHandoff {...classworkScope(user, orgContext)} />
        ) : tab === 'templates' ? (
          // Deliberately above the standards-seeded guard below: the template library spans
          // 6–12, where the K-7 ledger standards graph has nothing seeded yet.
          <AssignmentTemplateStudio
            uid={user?.uid || 'demo'}
            classroom={{
              classId: cls.id,
              className: cls.name,
              students: cls.students.map(s => ({ id: s.id, name: s.name })),
              teacher: { uid: user?.uid || 'demo', name: cls.teacherName, photo: user?.photoURL || '' },
              // Sample-class students are placeholder ids, not real accounts — write the
              // assignment record but never fan notifications out at uids that don't exist.
              simulate: cls.isSample || !user?.uid,
            }}
          />
        ) : tab === 'integrity' ? (
          <IntegrityWallPanel uid={user?.uid || 'demo'} teacherName={user?.displayName || DEMO_CLASS.teacherName} />
        ) : tab === 'connect' ? (
          <Integrations />
        ) : tab === 'library' ? (
          <ContentLibrary orgContext={orgContext} orgScope={orgScope} user={user} />
        ) : tab === 'context' ? (
          <ContextSettings />
        ) : tab === 'planner' ? (
          <Planner plans={plans} setPlans={setPlans} onCreateBlank={() => setTab('plan')} />
        ) : tab === 'checks' ? (
          <ChecksBuilder className={cls.name} subject={subject} band={band} standards={standards} assignments={assignments} setAssignments={setAssignments} />
        ) : tab === 'reports' ? (
          <Reports cls={cls} />
        ) : standards.length === 0 ? (
          <div style={{ ...cardStyle, padding: 20, color: T.muted }}>No standards seeded for {subject} at this level yet. Try another subject/level.</div>
        ) : tab === 'plan' ? (
          <PlanFromMastery cls={cls} standards={standards} subject={subject} band={band} onSave={addPlan} />
        ) : tab === 'grade' ? (
          <Gradebook cls={cls} standards={standards} subject={subject} band={band} />
        ) : (
          <AssessWork cls={cls} standards={standards} user={user} onRecorded={refreshMastery} />
        )}
      </div>
    </div>
  );
};

// ── Scan Worksheet (one-tap authoring) ───────────────────────────────────────────
// Teacher's ONLY required action is the capture. Reuses the same file-input camera mechanism as
// FileUploader (accept="image/*" + capture opens the camera on mobile); reads the image to base64 and
// runs the real digitizer → a structured, auto-gradable DigitalWorksheet rendered as a fillable overlay
// on the scan. The auto-wire panel (assign · notify parents · attach tutor · arm grading) is scaffolded
// here — the glue service that actually fires those is the next build.

type ScanStage = 'capture' | 'digitizing' | 'ready' | 'error';

// Document extraction (Word, PDF, Google Docs/Forms, link hubs) lives in Tela Classwork now.
const classworkScope = (user?: any, orgContext?: TeacherToolsOrgContext) => ({
  orgId: orgContext ? orgContext.org.id : '',
  orgName: orgContext ? orgContext.org.name : (user?.displayName || 'My classes'),
  programId: orgContext?.activeProgram?.id,
  programName: orgContext?.activeProgram?.name,
  domain: orgContext ? 'CHRISTIAN_EDUCATION' as const : 'ACADEMIA' as const,
});
const openClasswork = (user?: any, orgContext?: TeacherToolsOrgContext) => openTelaClasswork(classworkScope(user, orgContext));

const ScanWorksheet: React.FC<{ user?: any; orgContext?: TeacherToolsOrgContext; preferClassId?: string }> = ({ user, orgContext, preferClassId }) => {
  const [stage, setStage] = useState<ScanStage>('capture');
  const [preview, setPreview] = useState<string>('');
  const [prepared, setPrepared] = useState<PreparedWorksheetImage | null>(null);
  const [sheet, setSheet] = useState<DigitalWorksheet | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [themed, setThemed] = useState(false);
  const syncedScanKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!sheet || stage !== 'ready') return;
    const key = `${sheet.title}_${sheet.telaDocId || 'draft'}`;
    if (syncedScanKeyRef.current === key) return;
    syncedScanKeyRef.current = key;
    const scopeKind = orgContext ? 'org' : 'user';
    const targetOrgId = orgContext ? orgContext.org.id : getStandaloneTeacherScopeId(user?.uid);
    const targetOrgName = orgContext ? orgContext.org.name : (user?.displayName || DEMO_CLASS.teacherName);
    const answerKeyLines = sheet.fields
      .filter(f => f.correctAnswer !== undefined && String(f.correctAnswer).trim() !== '')
      .map((f, idx) => `${idx + 1}. ${f.label}: ${f.correctAnswer}`)
      .join('\n');
    void copyCurriculumPairToOrgAssets({
      orgId: targetOrgId,
      orgName: targetOrgName,
      scopeKind,
      departmentFolder: orgContext
        ? getOrgEducationFolderName(orgContext.org.name)
        : 'Assignments & Worksheets',
      documentClassFolder: 'Assignments & Worksheets',
      title: sheet.title || 'Scanned Worksheet',
      unitId: sheet.id || `scan_${Date.now()}`,
      telaDocId: sheet.telaDocId || `tela_scan_${Date.now()}`,
      sourceKind: 'IMAGE_SCAN',
      originalText: sheet.fields.map((f, idx) => `${idx + 1}. ${f.label}`).join('\n'),
      originalFileName: prepared?.originalFile?.name || `${sheet.title || 'Worksheet'}.jpg`,
      originalMimeType: prepared?.originalFile?.type || 'image/jpeg',
      questionCount: sheet.fields.length,
      totalPoints: sheet.fields.reduce((acc, f) => acc + (f.points || 1), 0),
      answerKeyLabel: answerKeyLines ? `${sheet.title} — Auto-Extracted Answer Key` : undefined,
      answerKeyText: answerKeyLines || undefined,
    });
  }, [sheet, stage, prepared, orgContext, user]);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [wire, setWire] = useState<WireResult | null>(null);
  const [err, setErr] = useState('');
  const [reviewZoom, setReviewZoom] = useState(1);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [reviewSurface, setReviewSurface] = useState<'FILLABLE' | 'LAYERS'>('FILLABLE');
  const [onionSkin, setOnionSkin] = useState(false);
  const [reillustrated, setReillustrated] = useState<Awaited<ReturnType<typeof reillustrateReconstruction>> | null>(null);
  const [showReillustrated, setShowReillustrated] = useState(false);
  const [reillustrating, setReillustrating] = useState(false);
  const [layeredRebuild, setLayeredRebuild] = useState<Awaited<ReturnType<typeof rebuildDocumentIntelligently>> | null>(null);
  const [layeredBusy, setLayeredBusy] = useState(false);
  const [layeredProgress, setLayeredProgress] = useState<TelaModelProgress | null>(null);
  const [layeredError, setLayeredError] = useState('');
  const [formatUndo, setFormatUndo] = useState<DigitalWorksheet | null>(null);
  // Refine & Author (Tela) — the authoring step between review and publish.
  const [telaDocId, setTelaDocId] = useState<string | null>(null);
  const [telaBuilding, setTelaBuilding] = useState(false);
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [authored, setAuthored] = useState(false);
  const [authorSyncing, setAuthorSyncing] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  const [scanProgress, setScanProgress] = useState('');
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const rosterFor = () => target?.students || DEMO_CLASS.students.map(s => ({ id: s.id, name: s.name }));
  // Load OCR while the teacher is still framing the photo, so the first read doesn't pay for it.
  React.useEffect(() => {
    warmOcr();
    // A worksheet photographed from "Scan school paper" arrives here ready to digitize.
    const handed = takeTeacherWorksheetScan();
    if (handed) void onFile({ target: { files: [handed], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scanSessionId = React.useRef(`scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  const runLayeredRebuild = async (source = prepared?.cleanedDataUrl, options?: { semanticNaming?: 'auto' | 'require' | 'skip' }) => {
    if (!source || layeredBusy) return;
    setLayeredBusy(true); setLayeredError(''); setLayeredProgress({ phase: 'CHECKING', message: 'Preparing layered reconstruction…' });
    try {
      const result = await rebuildDocumentIntelligently(source, setLayeredProgress, options);
      setLayeredRebuild(result); setReviewSurface('LAYERS'); setReillustrated(null); setShowReillustrated(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Layered reconstruction failed.';
      setLayeredError(message);
      void recordAssignmentQualityEvent({ worksheetId: scanSessionId.current, title: sheet?.title || 'Worksheet scan', actorId: user?.uid, actorName: user?.displayName, actorRole: 'TEACHER', kind: 'SCAN_FAILURE', severity: 'ERROR', source: 'ScanWorksheet.layeredRebuild', message, simulate: !user?.uid });
    } finally { setLayeredBusy(false); }
  };

  const applyAutoFormat = () => {
    if (!sheet || !layeredRebuild) return;
    const formatted = autoFormatDigitalWorksheet(sheet);
    setFormatUndo(sheet); setSheet(formatted.sheet);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setAnswers({}); setThemed(false); setPublished(false); setLayeredRebuild(null); setLayeredError(''); setLayeredProgress(null); setReviewSurface('FILLABLE'); setFormatUndo(null);
    try {
      setStage('digitizing'); setScanProgress('Cleaning the photo…');
      const image = await prepareWorksheetImage(file);
      setPrepared(image);
      setPreview(image.originalDataUrl);
      // Straighten to a flat, upright page first: answer boxes then live in the same page space a
      // student's photo is registered into, and the overlay sits exactly on the printed blanks.
      let page = image.cleanedDataUrl;
      try { setScanProgress('Straightening the page…'); page = (await normalizeWorksheetPage(image.cleanedDataUrl, setScanProgress)).dataUrl; }
      catch (error) { console.warn('[ScanWorksheet] page normalization skipped', error); }
      setPreview(page);
      const result = await digitizeWorksheetDetailed(page.split(',')[1] || image.cleanedBase64, 'image/jpeg', user?.uid || 'demo-teacher', setScanProgress);
      if (!result.ok || !result.sheet) { setErr(result.error?.message || 'Could not read that worksheet. Try a clearer, well-lit photo.'); setStage('error'); return; }
      setSheet({ ...result.sheet, reviewIssues: [...(result.sheet.reviewIssues || []), ...image.warnings] });
      setStage('ready');
      // The reprint reconstruction is deterministic and fully local — always build it.
      // Florence naming joins automatically when its pack is already installed.
      void runLayeredRebuild(page);
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong reading the image.');
      setStage('error');
      void recordAssignmentQualityEvent({ worksheetId: scanSessionId.current, title: file.name, actorId: user?.uid, actorName: user?.displayName, actorRole: 'TEACHER', kind: 'SCAN_FAILURE', severity: 'ERROR', source: 'ScanWorksheet.capture', message: e?.message || 'Worksheet scan failed', simulate: !user?.uid });
    }
  };

  const reset = () => { setStage('capture'); setSheet(null); setPrepared(null); setPreview(''); setAnswers({}); setErr(''); setPublished(false); setWire(null); setPublishing(false); setLayeredRebuild(null); setLayeredError(''); setLayeredProgress(null); setReviewSurface('FILLABLE'); setFormatUndo(null); setShowBrief(false); setReillustrated(null); setShowReillustrated(false); setTelaDocId(null); setAuthoringOpen(false); setAuthored(false); setTelaBuilding(false); scanSessionId.current = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; };

  // ── Refine & Author (Tela) ────────────────────────────────────────────────────────
  // Build the authorable Tela doc from the reviewed worksheet + reconstruction, open it in an
  // editable Tela canvas, and sync the teacher's answer-model edits back into the DigitalWorksheet
  // (which stays authoritative for grading). The Tela doc is the artifact carried to publish.
  const ensureTelaDoc = async (): Promise<string | null> => {
    if (telaDocId) return telaDocId;
    if (!sheet) return null;
    setTelaBuilding(true);
    try {
      const tela = worksheetToTelaDoc(sheet, user?.uid || 'demo-teacher', preview, layeredRebuild || undefined);
      await saveTelaDoc(tela);
      setTelaDocId(tela.id);
      setSheet(prev => (prev ? { ...prev, telaDocId: tela.id } : prev));
      return tela.id;
    } finally { setTelaBuilding(false); }
  };
  const openAuthoring = async () => { const id = await ensureTelaDoc(); if (id) setAuthoringOpen(true); };
  const openFullEditor = async () => {
    const id = await ensureTelaDoc();
    if (id) window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: id } }));
  };
  const applyAuthoring = async () => {
    if (!telaDocId || !sheet) return;
    setAuthorSyncing(true);
    try {
      const doc = await loadTelaDoc(telaDocId);
      if (doc) { setSheet(telaDocToWorksheet(doc, sheet)); setAuthored(true); }
    } finally { setAuthorSyncing(false); }
  };
  const rebuildTelaFromForm = async () => {
    if (!sheet) return;
    setTelaBuilding(true);
    try {
      const tela = worksheetToTelaDoc({ ...sheet, telaDocId: telaDocId || undefined }, user?.uid || 'demo-teacher', preview, layeredRebuild || undefined);
      await saveTelaDoc(tela);
      setTelaDocId(tela.id); setAuthored(false);
    } finally { setTelaBuilding(false); }
  };

  // Publish & auto-wire. The demo roster (DEMO_CLASS) isn't real accounts, so we run in simulate
  // mode: the worksheet is really persisted, but the notification fan-out is computed, not sprayed
  // at placeholder uids. A real classroom passes simulate:false with the live roster + teacher.
  const doPublish = async () => {
    if (!sheet || publishing) return;
    setPublishing(true);
    try {
      let publishable: DigitalWorksheet;
      if (telaDocId) {
        // Teacher authored on the Tela canvas — that doc is the artifact. Sync its answer model
        // back so the auto-graded worksheet matches what was authored, and keep the same doc id.
        const doc = await loadTelaDoc(telaDocId);
        publishable = { ...(doc ? telaDocToWorksheet(doc, sheet) : sheet), telaDocId };
      } else {
        const tela = worksheetToTelaDoc(sheet, user?.uid || 'demo-teacher', preview, layeredRebuild || undefined);
        const telaSaved = await saveTelaDoc(tela);
        publishable = { ...sheet, telaDocId: telaSaved.ok ? tela.id : undefined };
      }
      setSheet(publishable);
      const res = await publishWorksheet({
        sheet: publishable,
        classId: target?.classId || DEMO_CLASS.id || 'demo-4b',
        className: target?.className || DEMO_CLASS.name,
        students: rosterFor(),
        teacher: { uid: user?.uid || 'demo-teacher', name: user?.displayName || DEMO_CLASS.teacherName, photo: user?.photoURL || '' },
        dueDate: target?.dueDate || undefined,
        // A real class with a signed-in teacher notifies live students + guardians.
        simulate: !user?.uid || target?.simulate !== false,
        originalFile: prepared?.originalFile,
        pageImageDataUrl: preview.startsWith('data:') ? preview : undefined,
      });
      setWire(res);
    } catch (error) {
      void recordAssignmentQualityEvent({ worksheetId: scanSessionId.current, title: sheet.title, actorId: user?.uid, actorName: user?.displayName, actorRole: 'TEACHER', kind: 'SUBMISSION_FAILURE', severity: 'ERROR', source: 'ScanWorksheet.publish', message: error instanceof Error ? error.message : 'Worksheet publish failed', simulate: !user?.uid });
    }
    setPublished(true);
    setPublishing(false);
  };

  const accent = themed ? T.violet : T.orange;
  const fillPct = sheet ? completionPercent(sheet, answers) : 0;

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .worksheet-review-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:620px}
        .worksheet-review-pane{height:580px;overflow:auto;border-radius:10px;background:#08080c;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
        .worksheet-review-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%}
        @media(max-width:960px){
          .worksheet-review-grid{grid-template-columns:minmax(0,1fr);min-height:0;overflow-x:hidden}
          .worksheet-review-pane{height:62dvh;min-height:min(430px,60dvh)}
        }
        @media(max-width:720px){
          .worksheet-review-toolbar{width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}
          .worksheet-review-toolbar button{flex:0 0 auto;min-width:40px;min-height:40px}
          .worksheet-inspection{inset:0!important;border-radius:0!important;padding:calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom))!important}
          .worksheet-review-grid button{min-height:40px}
        }
      `}</style>

      {/* Capture card — the only required teacher action */}
      {stage === 'capture' && (
        <div style={{ ...cardStyle, padding: 22 }}>
          <Eyebrow color={T.orange}>One-tap authoring · the only step is the capture</Eyebrow>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Snap or upload a worksheet</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 460, marginBottom: 16 }}>
            Plajah reads it, builds a fillable graded version, and wires it to your class, parents, and tutor automatically. Theme it if you want — otherwise it's live.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '26px 16px', borderRadius: 14, border: `2px dashed ${T.orange}66`, background: T.cardAlt, color: T.ink }}>
              <Camera size={30} color={T.orange} />
              <div style={{ fontSize: 14, fontWeight: 800 }}>Take a photo</div>
              <div style={{ fontSize: 11.5, color: T.faint }}>Lay it flat, fill the frame</div>
            </button>
            <button onClick={() => galleryRef.current?.click()} style={{ width: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '26px 16px', borderRadius: 14, border: `2px dashed ${T.border}`, background: T.cardAlt, color: T.ink }}>
              <UploadCloud size={30} color={T.muted} />
              <div style={{ fontSize: 14, fontWeight: 800 }}>Choose an image</div>
              <div style={{ fontSize: 11.5, color: T.faint }}>Photo library or a saved scan</div>
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: T.faint, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} /> Phase 1: math, science, and fact-based questions auto-grade. Open-response is captured for you to grade.
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => openClasswork(user, orgContext)} style={{ width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.cardAlt, color: T.ink }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}>
                <Sparkles size={16} color={T.violet} />
                Word, PDF or Google Doc? Bring it in with Tela Classwork
              </span>
              <span style={{ fontSize: 11, color: T.muted }}>Opens Tela</span>
            </button>
          </div>
        </div>
      )}

      {/* Digitizing */}
      {stage === 'digitizing' && (
        <div style={{ ...cardStyle, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {preview && <img src={preview} alt="worksheet" style={{ maxHeight: 180, borderRadius: 10, opacity: 0.5, border: `1px solid ${T.border}` }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.ink, fontWeight: 700 }}>
            <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Digitizing worksheet…
          </div>
            <div style={{ fontSize: 12, color: T.muted, textAlign: 'center' }} aria-live="polite">{scanProgress || 'Cleaning page · OCR · separating diagrams · rebuilding Tela form · checking answers'}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Error */}
      {stage === 'error' && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.red, marginBottom: 6 }}>Couldn't digitize that image</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>{err}</div>
          <button onClick={reset} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800 }}><RefreshCw size={14} /> Try another photo</button>
        </div>
      )}

      {/* Ready — digitized, fillable, auto-wired */}
      {stage === 'ready' && sheet && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          {/* Left: the fillable overlay on the scan */}
          <div className={inspectionOpen ? 'worksheet-inspection' : undefined} style={{ ...cardStyle, padding: 16, ...(inspectionOpen ? { position: 'fixed', inset: 12, zIndex: 9999, background: '#0c0c12', overflow: 'auto' } : {}) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Eyebrow color={accent}>Digitized · fillable</Eyebrow>
              <div className="worksheet-review-toolbar">
                <button onClick={() => setReviewZoom(value => Math.max(.6, +(value - .2).toFixed(1)))} aria-label="Zoom out" style={{ ...chip(false), padding: 7 }}><ZoomOut size={13} /></button>
                <span style={{ minWidth: 42, textAlign: 'center', fontSize: 10, color: T.muted }}>{Math.round(reviewZoom * 100)}%</span>
                <button onClick={() => setReviewZoom(value => Math.min(2.5, +(value + .2).toFixed(1)))} aria-label="Zoom in" style={{ ...chip(false), padding: 7 }}><ZoomIn size={13} /></button>
                <button onClick={() => { setReviewZoom(1); setInspectionOpen(value => !value); }} aria-label={inspectionOpen ? 'Exit full screen review' : 'Open full screen review'} style={{ ...chip(inspectionOpen, accent), padding: 7 }}>{inspectionOpen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
                <button onClick={() => setShowTutor(s => !s)} style={{ ...chip(showTutor, accent), display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageSquare size={12} /> Tutor</button>
                <button onClick={() => void runLayeredRebuild()} disabled={layeredBusy} style={{ ...chip(!!layeredRebuild, T.blue), display: 'inline-flex', alignItems: 'center', gap: 5, opacity: layeredBusy ? .7 : 1 }}><Sparkles size={12} /> {layeredBusy ? 'Building layers…' : layeredRebuild ? 'Rebuild layers' : 'Build editable layers'}</button>
                <button onClick={applyAutoFormat} disabled={!layeredRebuild || !!sheet.autoFormat} style={{ ...chip(!!sheet.autoFormat, T.violet), display: 'inline-flex', alignItems: 'center', gap: 5, opacity: layeredRebuild ? 1 : .45 }}><Wand2 size={12} /> {sheet.autoFormat ? 'Plajah Plus formatted' : 'Auto Format'}</button>
                {formatUndo && <button onClick={() => { setSheet(formatUndo); setFormatUndo(null); }} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}><ArrowLeft size={12}/> Undo format</button>}
                <button onClick={() => setThemed(t => !t)} style={{ ...chip(themed, T.violet), display: 'inline-flex', alignItems: 'center', gap: 5 }}><Palette size={12} /> {themed ? 'Themed' : 'Theme it'}</button>
                <button onClick={reset} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}><RefreshCw size={12} /> New</button>
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 10, color: accent }}>{sheet.title}</div>
            <div className="worksheet-review-grid" style={inspectionOpen ? { minHeight: 'calc(100vh - 150px)' } : undefined}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.14em', color: T.faint, fontWeight: 800, marginBottom: 6 }}>Original · stored unchanged</div><div className="worksheet-review-pane" style={{ ...(inspectionOpen ? { height: 'calc(100vh - 175px)' } : {}), border: `1px solid ${T.border}` }}><div style={{ width: `${reviewZoom * 100}%`, minWidth: '100%' }}><img src={preview} alt="Original worksheet scan" style={{ width: '100%', display: 'block', background: '#fff' }} /></div></div></div>
              <div style={{ minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.14em', color: accent, fontWeight: 800 }}>{reviewSurface === 'LAYERS' ? 'Layered reconstruction · editable vectors + text' : 'Faithful page · digital response fields'}</div>{layeredRebuild && reviewSurface === 'LAYERS' && <button onClick={() => setOnionSkin(value => !value)} style={{ ...chip(onionSkin, T.gold), marginLeft: 'auto', padding: '4px 8px', fontSize: 9 }}>Onion skin</button>}{layeredRebuild && reviewSurface === 'LAYERS' && <button disabled={reillustrating} onClick={async () => { if (reillustrated) { setShowReillustrated(v => !v); return; } setReillustrating(true); try { const r = await reillustrateReconstruction(layeredRebuild); setReillustrated(r); setShowReillustrated(true); } finally { setReillustrating(false); } }} title="Swap recognized artwork for clean library illustrations" style={{ ...chip(showReillustrated, T.violet), marginLeft: onionSkin ? 6 : 'auto', padding: '4px 8px', fontSize: 9 }}>{reillustrating ? 'Upgrading…' : showReillustrated ? `Upgraded${reillustrated?.replaced?.length ? ` (${reillustrated.replaced.length})` : ''}` : 'Upgrade artwork'}</button>}{layeredRebuild && <button onClick={() => setReviewSurface(value => value === 'LAYERS' ? 'FILLABLE' : 'LAYERS')} style={{ ...chip(false), marginLeft: reviewSurface === 'LAYERS' ? 0 : 'auto', padding: '4px 8px', fontSize: 9 }}>{reviewSurface === 'LAYERS' ? 'Show fillable' : 'Show layers'}</button>}</div><div className="worksheet-review-pane" style={{ ...(inspectionOpen ? { height: 'calc(100vh - 175px)' } : {}), border: `1px solid ${T.border}` }}><div style={{ width: `${reviewZoom * 100}%`, minWidth: '100%' }}>{reviewSurface === 'LAYERS' && layeredRebuild ? <div style={{ position: 'relative' }}><img src={showReillustrated && reillustrated ? reillustrated.previewUrl : layeredRebuild.previewUrl} alt="Layered editable reconstruction" style={{ width: '100%', display: 'block', background: '#fff' }}/>{onionSkin && <img src={preview} alt="Original scan overlay" style={{ position: 'absolute', inset: 0, width: '100%', opacity: .35, pointerEvents: 'none' }}/>}</div> : <WorksheetFillable sheet={sheet} preview={preview} answers={answers} setAnswers={setAnswers} accent={accent} mode="rebuilt" />}</div></div></div>
            </div>
            {(layeredBusy || layeredError || layeredRebuild) && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: layeredError ? `${T.red}10` : `${T.blue}10`, border: `1px solid ${layeredError ? T.red : T.blue}35`, fontSize: 11, color: layeredError ? T.red : T.muted }}>{layeredBusy ? layeredProgress?.message || 'Building separate layout, artwork, text and interaction layers…' : layeredError || (layeredRebuild ? <><div>{layeredRebuild.layers.layout} layout objects · {layeredRebuild.layers.artwork} artwork spline layers · {layeredRebuild.layers.text} editable text objects · {layeredRebuild.layers.interaction} response fields.</div>{layeredRebuild.artworkRegions?.length ? <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:7 }}>{layeredRebuild.artworkRegions.map(region => <span key={region.id} style={{ padding:'3px 7px', borderRadius:99, border:`1px solid ${region.status === 'FALLBACK_IMAGE' ? T.gold : T.green}55`, color:region.status === 'FALLBACK_IMAGE' ? T.gold : T.green }}>{region.label} · {region.status === 'FALLBACK_IMAGE' ? 'clean cutout · needs trace review' : `${region.editablePathCount}/${region.pathCount} pen-editable splines`}</span>)}</div> : <div style={{ color:T.muted, marginTop:5 }}>No artwork ink beyond text and rules was found on this page.</div>}{layeredRebuild.semanticNaming === 'LOCAL' && <div style={{ marginTop:7, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}><span style={{ color:T.faint }}>Artwork was rebuilt locally without semantic names.</span><button onClick={() => void runLayeredRebuild(undefined, { semanticNaming: 'require' })} style={{ ...chip(false, T.blue), padding:'3px 8px', fontSize:10 }}>Name artwork · install pack (≈300 MB, on-device)</button></div>}</> : '')}</div>}
            {/* live fill progress (what teacher + parent see) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted, marginBottom: 4 }}><span>Student fill progress (live to teacher + parent)</span><span>{fillPct}%</span></div>
              <Bar value={fillPct} color={accent} />
            </div>
          </div>

          {/* Right: what Plajah understood + the auto-wire */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <Eyebrow color={T.green}>Plajah detected</Eyebrow>
              <DetectRow label="Subject" value={sheet.subject} />
              <DetectRow label="Objective" value={sheet.objective || '—'} />
              <DetectRow label="Grade" value={[sheet.gradeBand, sheet.framework].filter(Boolean).join(' · ') || '—'} />
              <DetectRow label="Scan score" value={`${sheet.scanAssessment?.score ?? Math.round((sheet.confidence || 0) * 100)}/100 · ${sheet.segments?.length || 0} regions`} />
              <DetectRow label="Reconstruction" value={layeredRebuild ? `${layeredRebuild.layers.artwork} vector art · ${layeredRebuild.layers.text} text · ${layeredRebuild.layers.layout} layout` : 'Not built yet'} />
              {sheet.autoFormat && <DetectRow label="Auto Format" value={`${Math.round(sheet.autoFormat.confidence * 100)}% · ${sheet.autoFormat.summary}`} />}
              {sheet.scanAssessment && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 8 }}>{[['Text',sheet.scanAssessment.textConfidence],['Layout',sheet.scanAssessment.layoutFidelity],['Fields',sheet.scanAssessment.fieldCoverage],['Understanding',sheet.scanAssessment.understandingConfidence]].map(([label,value]) => <div key={String(label)} style={{ padding: 7, borderRadius: 8, background: T.cardAlt, fontSize: 10, color: T.muted }}><b style={{ color: Number(value) >= 70 ? T.green : T.gold }}>{value}%</b> {label}</div>)}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12.5, color: T.green, fontWeight: 700 }}>
                <KeyRound size={13} /> Answer key · {sheet.fields.filter(f => f.correctAnswer !== undefined).length}/{sheet.fields.length} auto-gradable
              </div>
              {sheet.hasManualFields && <div style={{ marginTop: 4, fontSize: 11, color: T.gold }}>Some open-response fields need your review.</div>}
              {sheet.standardIds.length > 0 && <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>{sheet.standardIds.slice(0, 6).map(s => <span key={s} style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: `${T.blue}22`, color: T.blue }}>{s}</span>)}</div>}
              {!!sheet.reviewIssues?.length && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: `${T.gold}12`, border: `1px solid ${T.gold}35` }}><div style={{ color: T.gold, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em' }}>Verify before assigning</div>{sheet.reviewIssues.map((issue, i) => <div key={i} style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{issue}</div>)}</div>}
            </div>

            <WorksheetAccuracyEditor sheet={sheet} onChange={setSheet} accent={accent} onQualityRating={(rating) => { void submitAssignmentQualityFeedback({ worksheetId: wire?.worksheetId || scanSessionId.current, assignmentId: wire?.assignmentId, title: sheet.title, actorId: user?.uid, actorName: user?.displayName, actorRole: 'TEACHER', rating, category: 'ACCURACY', simulate: !user?.uid }); }} />

            <div style={{ ...cardStyle, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Eyebrow color={T.violet}>Refine &amp; author · powered by Tela</Eyebrow>
                {authored && <span style={{ fontSize: 10, fontWeight: 800, color: T.green, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} /> Synced</span>}
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: '6px 0 12px' }}>
                Open the reconstruction on the Tela canvas to fix the layout, edit or add questions, move and add content, then verify — the final authoring step before you publish.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={openAuthoring} disabled={telaBuilding} style={{ cursor: telaBuilding ? 'default' : 'pointer', flex: '1 1 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: 'none', background: T.violet, color: '#160a1e', fontSize: 12, fontWeight: 800, opacity: telaBuilding ? 0.7 : 1 }}>
                  {telaBuilding ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Preparing…</> : <><Wand2 size={14} /> {authoringOpen ? 'Authoring open below' : telaDocId ? 'Reopen authoring canvas' : 'Open authoring canvas'}</>}
                </button>
                <button onClick={openFullEditor} disabled={telaBuilding} title="Open the full Tela editor" style={{ ...chip(false, T.violet), display: 'inline-flex', alignItems: 'center', gap: 5 }}><ExternalLink size={12} /> Full editor</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.faint, lineHeight: 1.5 }}>The Tela document is saved as the worksheet's editable source. Publishing syncs your authored questions &amp; answer key back into the graded version.</div>
            </div>

            <WorksheetAssignSetup sheet={sheet} onSheet={setSheet} uid={user?.uid} locked={published} onTarget={setTarget} preferClassId={preferClassId} />

            <div style={{ ...cardStyle, padding: 16 }}>
              <Eyebrow>Auto-wired on publish</Eyebrow>
              <WireStep icon={Users} label={`Assign to ${(target?.className || DEMO_CLASS.name).split('—')[0].trim()}${published && wire ? ` · ${wire.studentsNotified} notified` : ` · ${rosterFor().length} students`}`} done={published} />
              <WireStep icon={Bell} label={`Notify ${published && wire ? wire.parentsNotified : 'linked'} parents · homework available${target?.dueDate ? ` · due ${new Date(target.dueDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}`} done={published} />
              <WireStep icon={MessageSquare} label="Attach Plajah tutor (knows the answer key)" done={published} />
              <WireStep icon={Hand} label="Enable live progress + digital hand-raise" done={published} />
              <WireStep icon={Check} label="Arm auto-grade on turn-in" done={published} />
              <button onClick={doPublish} disabled={published || publishing} style={{ marginTop: 12, width: '100%', cursor: published || publishing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 18px', borderRadius: 10, border: 'none', background: published ? T.green : accent, color: published ? '#08130c' : '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: publishing ? 0.7 : 1 }}>
                {publishing ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Wiring…</> : published ? <><Check size={15} /> Published &amp; wired</> : <><Send size={15} /> Publish &amp; wire</>}
              </button>
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.faint, lineHeight: 1.5 }}>
                {published
                  ? `Worksheet persisted${wire?.worksheetId ? ` (${wire.worksheetId.slice(0, 6)}…)` : ''}.${wire?.simulated ? ' Demo roster: notifications were counted, not sent.' : ' Students and guardians were notified.'}`
                  : target?.simulate === false ? `Persists the worksheet, assigns it to ${target.className}, and notifies ${target.students.length} students + their guardians.` : 'Persists the worksheet and creates the assignment. Demo roster is simulated.'}
              </div>
            </div>
          </div>
        </div>
        {authoringOpen && telaDocId && (
          <div style={{ ...cardStyle, padding: 14, marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <Eyebrow color={T.violet}>Tela authoring canvas · edit in place</Eyebrow>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={rebuildTelaFromForm} disabled={telaBuilding} title="Regenerate the canvas from the current form fields (discards visual edits)" style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}><RefreshCw size={12} /> Rebuild from fields</button>
                <button onClick={openFullEditor} style={{ ...chip(false, T.violet), display: 'inline-flex', alignItems: 'center', gap: 5 }}><ExternalLink size={12} /> Full editor</button>
                <button onClick={applyAuthoring} disabled={authorSyncing} style={{ ...chip(true, T.green), display: 'inline-flex', alignItems: 'center', gap: 5 }}>{authorSyncing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Apply edits &amp; sync answer key</button>
                <button onClick={() => setAuthoringOpen(false)} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}>Close</button>
              </div>
            </div>
            <div style={{ borderRadius: 10, overflow: 'auto', maxHeight: 700, border: `1px solid ${T.border}`, background: '#0d0d12' }}>
              <TelaEmbed docId={telaDocId} frameId={`${telaDocId}_reconstructed`} mode="pinned" editable canEdit width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 48 : 900)} className="worksheet-tela-embed" />
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: T.faint, lineHeight: 1.5 }}>Move &amp; add content, edit or add questions with the flying menu. When you're done, <b style={{ color: T.muted }}>Apply edits</b> pulls your questions &amp; answer key back into the graded worksheet — then Publish below.</div>
          </div>
        )}
        {published && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowBrief(v => !v)} style={{ ...chip(showBrief, T.blue), display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardCheck size={13} /> {showBrief ? 'Hide turn-in brief' : 'See turn-in brief (how the class did)'}</button>
            {showBrief && (
              <div style={{ marginTop: 12 }}>
                <TurnInBriefView
                  sheet={sheet}
                  roster={rosterFor()}
                  {...(wire && !wire.simulated && wire.worksheetId
                    ? { loadBrief: () => fetchAssignmentBrief(wire.worksheetId!, sheet, rosterFor()), onConfirmField: (sid: string, fid: string, c: boolean) => { void confirmSubmissionField(wire.worksheetId!, sid, fid, c, { uid: user?.uid || 'demo', name: user?.displayName || DEMO_CLASS.teacherName }); } }
                    : { simulate: true })}
                />
              </div>
            )}
          </div>
        )}
        {showTutor && (
          <div style={{ marginTop: 14 }}>
            <Eyebrow color={accent}>In-worksheet tutor · live preview (guides, never gives the answer)</Eyebrow>
            <WorksheetTutorPanel sheet={sheet} accent={accent} />
          </div>
        )}
        </>
      )}
    </div>
  );
};

const WorksheetAccuracyEditor: React.FC<{ sheet: DigitalWorksheet; onChange: (sheet: DigitalWorksheet) => void; accent: string; onQualityRating?: (rating: number) => void }> = ({ sheet, onChange, accent, onQualityRating }) => {
  const corrected = (next: DigitalWorksheet) => onChange({ ...next, scanAssessment: next.scanAssessment ? { ...next.scanAssessment, teacherCorrections: (next.scanAssessment.teacherCorrections || 0) + 1 } : undefined });
  const patchField = (id: string, patch: Partial<WorksheetField>) => corrected({ ...sheet, fields: sheet.fields.map(f => f.id === id ? { ...f, ...patch } : f), hasManualFields: sheet.fields.some(f => f.id === id ? (patch.needsManualGrade ?? f.needsManualGrade) : f.needsManualGrade) });
  const removeField = (id: string) => corrected({ ...sheet, fields: sheet.fields.filter(f => f.id !== id), standardIds: Array.from(new Set(sheet.fields.filter(f => f.id !== id).flatMap(f => f.standardIds || []))) });
  const addField = () => { const id = `teacher_${Date.now()}`; corrected({ ...sheet, fields: [...sheet.fields, { id, label: 'New question', type: 'short-text', box: { x: 10, y: 10, width: 30, height: 6 }, points: 1, needsManualGrade: true, confidence: 1 }], hasManualFields: true }); };
  const textStyle: React.CSSProperties = { width: '100%', minHeight: 36, borderRadius: 9, border: `1px solid ${T.border}`, background: '#0d0d14', color: T.ink, padding: '6px 9px', font: 'inherit', fontSize: 12 };
  return <div style={{ ...cardStyle, padding: 16 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Eyebrow color={accent}>Teacher accuracy review · edit anything</Eyebrow><button onClick={addField} style={{ ...chip(false), padding: '5px 9px' }}><Plus size={11} style={{ verticalAlign: -2 }} /> Field</button></div><input value={sheet.title} onChange={e => corrected({ ...sheet, title: e.target.value })} aria-label="Worksheet title" style={{ ...textStyle, fontWeight: 800, marginBottom: 7 }} /><select value={sheet.subject} onChange={e => corrected({ ...sheet, subject: e.target.value })} aria-label="Worksheet subject" style={{ ...textStyle, marginBottom: 7 }}>{['General','Math','Science','English Language Arts','History','Geography','World Language','Art','Music','Health'].map(subject => <option key={subject}>{subject}</option>)}</select><textarea value={sheet.objective} onChange={e => corrected({ ...sheet, objective: e.target.value })} aria-label="Learning objective" style={{ ...textStyle, minHeight: 62, resize: 'vertical', marginBottom: 8 }} />
    <div style={{ maxHeight: 320, overflowY: 'auto' }}>{sheet.fields.map((f, i) => <div key={f.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}><span style={{ color: (f.confidence || 0) < .72 ? T.gold : T.green, fontFamily: 'monospace', fontSize: 10 }}>{Math.round((f.confidence || 0) * 100)}%</span><b style={{ fontSize: 11 }}>Question {i + 1}</b><button onClick={() => removeField(f.id)} aria-label={`Remove question ${i + 1}`} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: T.red, cursor: 'pointer' }}><Trash2 size={13} /></button></div><textarea value={f.label} onChange={e => patchField(f.id, { label: e.target.value })} style={{ ...textStyle, minHeight: 54, resize: 'vertical' }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}><select value={f.type} onChange={e => patchField(f.id, { type: e.target.value as any })} style={textStyle}>{['numeric','short-text','multiple-choice','true-false','fill-blank','long-text'].map(v => <option key={v}>{v}</option>)}</select><input value={f.correctAnswer || ''} onChange={e => patchField(f.id, { correctAnswer: e.target.value || undefined, needsManualGrade: !e.target.value })} placeholder="Answer key or manual" style={textStyle} /></div></div>)}</div>
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 8 }}><div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>How accurate was this reconstruction? Corrections and this score are stored with the worksheet—not the raw student image.</div><div style={{ display: 'flex', gap: 5 }}>{[1,2,3,4,5].map(rating => <button key={rating} onClick={() => { onChange({ ...sheet, scanAssessment: sheet.scanAssessment ? { ...sheet.scanAssessment, teacherRating: rating } : undefined }); onQualityRating?.(rating); }} style={{ ...chip(sheet.scanAssessment?.teacherRating === rating, accent), padding: '5px 9px' }}>{rating}</button>)}</div></div>
  </div>;
};

const DetectRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: T.muted, minWidth: 66 }}>{label}</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

const WireStep: React.FC<{ icon: any; label: string; done: boolean }> = ({ icon: Icon, label, done }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', fontSize: 12.5, color: done ? T.green : T.muted }}>
    <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', border: `1px solid ${done ? T.green : T.border}`, background: done ? `${T.green}1f` : 'transparent' }}>
      {done ? <Check size={13} /> : <Icon size={13} />}
    </span>
    {label}
  </div>
);

// ── Content Library (Phase D) ────────────────────────────────────────────────────
// Browse Plajah's rights-cleared archives (music/film/art history) and collect them into a
// lesson-resource tray a teacher can copy into a plan, export, or send to the class.
const KIND_META: Record<PickedResource['kind'], { icon: any; color: string; label: string }> = {
  music: { icon: Music, color: T.orange, label: 'Music' },
  film: { icon: Film, color: T.red, label: 'Film' },
  art: { icon: ImageIcon, color: T.violet, label: 'Art' },
};

const ContentLibrary: React.FC<{ orgContext?: TeacherToolsOrgContext; orgScope?: OrgEducationScopeConfig | null; user?: any }> = ({ orgContext, orgScope, user }) => {
  const [picking, setPicking] = useState(false);
  const [tray, setTray] = useState<PickedResource[]>([]);
  const [copied, setCopied] = useState(false);

  const add = (items: PickedResource[]) => setTray(prev => {
    const seen = new Set(prev.map(r => r.url));
    return [...prev, ...items.filter(r => !seen.has(r.url))];
  });
  const remove = (url: string) => setTray(prev => prev.filter(r => r.url !== url));

  const asMarkdown = () => tray.map(r => `- [${r.label}${r.sub ? ` — ${r.sub}` : ''}](${r.url})`).join('\n');
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(asMarkdown()); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ }
  };

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${T.border}` }}>
        <OrgLessonLibraryHub
          orgId={orgContext ? orgContext.org.id : getStandaloneTeacherScopeId(user?.uid)}
          orgName={orgContext ? orgContext.org.name : (user?.displayName || DEMO_CLASS.teacherName)}
          scopeKind={orgContext ? 'org' : 'user'}
          programId={orgContext?.activeProgram?.id}
          programs={orgContext?.programs}
          canAccessAnswerKey={true}
          canUploadToLibrary={true}
          viewerRoleBadge={orgContext ? 'Course Instructor / Dept Head / Admin' : 'Course Teacher'}
          currentUserUid={user?.uid || 'teacher_demo'}
          currentUserName={user?.displayName || DEMO_CLASS.teacherName}
        />
      </div>
      {orgContext && (
        <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
          <Eyebrow color={T.gold}>{orgContext.org.name} · Uploaded Body of Resources &amp; Provisioned Courses</Eyebrow>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
            Scoped strictly to <b style={{ color: T.ink }}>{orgContext.org.name}</b> materials and the tracks enabled by your Head of Christian Education.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {listOrgUploadedEducationResources(orgContext.org).map(res => (
              <div key={res.id} style={{ ...cardStyle, padding: 12, background: T.cardAlt, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.green, textTransform: 'uppercase' }}>{res.kind === 'TELA_UNIT' ? 'Extracted Tela Unit' : 'Department Upload'}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{res.title}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{res.summary}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {res.telaDocId && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: res.telaDocId } }))}
                      style={{ cursor: 'pointer', padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.green}`, background: `${T.green}22`, color: T.green, fontSize: 11, fontWeight: 800 }}
                    >
                      Open in Tela
                    </button>
                  )}
                  <button
                    onClick={() => add([{ kind: 'art', label: res.title, sub: `${orgContext.org.name} · ${res.departmentName}`, url: `#org-resource-${res.id}` }])}
                    style={{ cursor: 'pointer', padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 11, fontWeight: 700 }}
                  >
                    + Add to Lesson Tray
                  </button>
                </div>
              </div>
            ))}
            {getOrgScopedCourses(orgContext.org, orgScope || undefined).map(crs => (
              <div key={crs.id} style={{ ...cardStyle, padding: 12, background: T.cardAlt, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.orange, textTransform: 'uppercase' }}>{crs.trackId.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{crs.emoji} {crs.title}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{crs.summary}</div>
                </div>
                <div>
                  <button
                    onClick={() => add([{ kind: 'music', label: crs.title, sub: `${orgContext.org.name} Provisioned Course`, url: `#org-course-${crs.id}` }])}
                    style={{ cursor: 'pointer', padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.orange}`, background: `${T.orange}22`, color: T.orange, fontSize: 11, fontWeight: 800 }}
                  >
                    + Add Course to Lesson Tray
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {picking && <LessonContentPicker onAdd={add} onClose={() => setPicking(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 460 }}>
          <Eyebrow color={T.green}>Teacher content-surfacing</Eyebrow>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Build a lesson from Plajah's archives</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
            Pull rights-cleared music history, public-domain film, and open-access museum art straight into a lesson —
            the teaching material no other classroom app has.
          </div>
        </div>
        <button onClick={() => setPicking(true)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', border: 'none', background: T.green, color: '#08130c' }}>
          <Plus size={15} /> Browse archives
        </button>
      </div>

      {tray.length === 0 ? (
        <div style={{ marginTop: 18, padding: 24, border: `1px dashed ${T.border}`, borderRadius: 12, textAlign: 'center', color: T.faint, fontSize: 13 }}>
          Nothing added yet. Tap <strong style={{ color: T.muted }}>Browse archives</strong> to pull in music, film, and art.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.muted }}>{tray.length} resource{tray.length > 1 ? 's' : ''}</div>
            <button onClick={copyAll} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: `1px solid ${T.border}`, background: 'transparent', color: copied ? T.green : T.ink }}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy as lesson block'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {tray.map(r => {
              const meta = KIND_META[r.kind]; const Icon = meta.icon;
              return (
                <div key={r.url} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, border: `1px solid ${T.border}`, background: T.cardAlt }}>
                  <div style={{ width: 54, height: 40, borderRadius: 6, overflow: 'hidden', background: '#000', flexShrink: 0 }}>
                    {r.thumb ? <img src={r.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: T.faint }}><Icon size={16} /></div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '1px 6px', borderRadius: 99, background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
                      {r.sub && <span style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>}
                    </div>
                  </div>
                  <a href={r.url} target="_blank" rel="noreferrer" style={{ color: T.muted, padding: 6 }}><ExternalLink size={15} /></a>
                  <button onClick={() => remove(r.url)} style={{ cursor: 'pointer', color: T.faint, padding: 6, background: 'transparent', border: 'none' }}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── 1. Gradebook ─────────────────────────────────────────────────────────────────
const NoEvidence: React.FC<{ cls: ToolsClass; what: string }> = ({ cls, what }) => (
  <div style={{ ...cardStyle, padding: 20, color: T.muted, fontSize: 13, lineHeight: 1.55 }}>
    {cls.students.length
      ? <>No mastery evidence for {cls.name} yet, so there's no {what} to show. Assign a worksheet or record an assessment, and it fills in from your students' Learner Ledger.</>
      : <>{cls.name} has no students yet. Share its join code from Classrooms, and {what} appears once they've turned in work.</>}
  </div>
);

const Gradebook: React.FC<{ cls: ToolsClass; standards: LearningStandard[]; subject: Subject; band: BandId }> = ({ cls, standards, subject, band }) => {
  const students = cls.students;
  const rowsOf = students.map(st => { const cells = standards.map(s => cls.masteryOf(st.id, s.id)); return { st, cells, avg: avgOf(cells) }; });
  const exportCsv = () => {
    const headers = ['Student', ...standards.map(s => s.code), 'Average'];
    downloadText(exportGradebookCSV(headers, rowsOf.map(r => [r.st.name, ...r.cells.map(c => (c === null ? '' : c)), r.avg === null ? '' : r.avg])), `plajah-gradebook-${subject}-${band}.csv`, 'text/csv');
  };
  if (!rowsOf.some(r => r.avg !== null)) return <NoEvidence cls={cls} what="gradebook" />;
  return (
    <div style={{ ...cardStyle, padding: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Eyebrow>Standards-based gradebook · mastery heatmap{cls.isSample ? ' · sample data' : ''}</Eyebrow>
        <button onClick={exportCsv} title="Export to CSV (import into any SIS/gradebook)" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '6px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.green, fontSize: 11, fontWeight: 800 }}><FileDown size={12} /> Export CSV</button>
      </div>
      <div style={{ minWidth: 120 + standards.length * 90 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${standards.length}, 1fr)`, gap: 6, alignItems: 'end', paddingBottom: 8 }}>
          <span />
          {standards.map(s => <div key={s.id} style={{ fontSize: 9, color: T.muted, fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{s.code}</div>)}
        </div>
        {rowsOf.map(({ st, cells, avg }) => (
          <div key={st.id} style={{ display: 'grid', gridTemplateColumns: `160px repeat(${standards.length}, 1fr)`, gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: st.color, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 11 }}>{st.name.charAt(0)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{st.name}</span>
              {avg !== null && <span style={{ fontSize: 10, color: bandFor(avg).color, fontWeight: 800 }}>{avg}%</span>}
            </div>
            {cells.map((m, i) => {
              if (m === null) return <div key={i} title={`${standards[i].code}: no evidence yet`} style={{ height: 30, borderRadius: 6, border: `1px dashed ${T.border}`, display: 'grid', placeItems: 'center', fontSize: 10, color: T.faint }}>—</div>;
              const b = bandFor(m);
              return <div key={i} title={`${standards[i].code}: ${m}%`} style={{ height: 30, borderRadius: 6, background: `${b.color}2e`, border: `1px solid ${b.color}`, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: b.color }}>{m}</div>;
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: T.muted }}>
        {bandLegend()}
      </div>
    </div>
  );
};
const bandLegend = () => ['emerging', 'developing', 'proficient', 'advanced', 'turbo'].map(lvl => {
  const b = bandFor(lvl === 'emerging' ? 20 : lvl === 'developing' ? 50 : lvl === 'proficient' ? 75 : lvl === 'advanced' ? 90 : 99);
  return <span key={lvl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} /> {b.label}</span>;
});

// ── 2. Plan from Mastery (the headline) ──────────────────────────────────────────
const PlanFromMastery: React.FC<{ cls: ToolsClass; standards: LearningStandard[]; subject: Subject; band: BandId; onSave: (p: Omit<LessonPlan, 'id' | 'createdAt'>) => void }> = ({ cls, standards, subject, band, onSave }) => {
  const students = cls.students;
  // Class-average mastery per standard (only where there is evidence) → weakest first.
  const ranked = useMemo(() => standards
    .map(s => ({ std: s, avg: avgOf(students.map(st => cls.masteryOf(st.id, s.id))) }))
    .filter((r): r is { std: LearningStandard; avg: number } => r.avg !== null)
    .sort((a, b) => a.avg - b.avg), [standards, students, cls]);

  const target = ranked[0];
  if (!target) return <NoEvidence cls={cls} what="plan" />;
  return <PlanFromMasteryBody cls={cls} ranked={ranked} target={target} subject={subject} band={band} onSave={onSave} />;
};

const PlanFromMasteryBody: React.FC<{ cls: ToolsClass; ranked: Array<{ std: LearningStandard; avg: number }>; target: { std: LearningStandard; avg: number }; subject: Subject; band: BandId; onSave: (p: Omit<LessonPlan, 'id' | 'createdAt'>) => void }> = ({ cls, ranked, target, subject, band, onSave }) => {
  const students = cls.students;
  const cartridge = SUBJECTS.find(s => s.id === subject)!.cartridge;
  const grade = (BAND_TO_GRADES[band] || ['g3'])[0] as GradeId;
  const turbo = turboTrackFor(subject, grade);

  const supportAct = `Assign ${cartridge} on this skill at an easier level — rebuild the foundation with guided practice.`;
  const onLevelAct = `Targeted ${cartridge} practice on ${target.std.code}, then a short formative check that writes to the ledger.`;
  const turboAct = turbo ? `${turbo.challenges[0].title}: ${turbo.challenges[0].prompt}` : 'Extend with an above-grade challenge and a creative application.';

  // Differentiate the roster by their mastery on the target standard.
  const groups = useMemo(() => {
    const g = { support: [] as string[], onLevel: [] as string[], turbo: [] as string[] };
    // Students with no evidence on this standard yet aren't guessed into a track.
    students.forEach(st => { const m = cls.masteryOf(st.id, target.std.id); if (m === null) return; if (m >= 85) g.turbo.push(st.name); else if (m < 55) g.support.push(st.name); else g.onLevel.push(st.name); });
    return g;
  }, [target, students, cls]);

  const savePlan = () => onSave({ title: `${target.std.code} — gap-closer`, subject, band, standardCode: target.std.code, objective: target.std.statement, activities: [`Support — ${supportAct}`, `On-Level — ${onLevelAct}`, `Turbo — ${turboAct}`], notes: '' });

  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16, borderColor: 'rgba(255,140,0,0.3)', background: 'linear-gradient(120deg, rgba(255,140,0,0.06), rgba(129,102,230,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wand2 size={16} color={T.orange} /><Eyebrow color={T.orange}>Auto-generated · targets your class's biggest gap</Eyebrow></div>
          <button onClick={savePlan} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}><Plus size={13} /> Save as lesson plan</button>
        </div>
        <div style={{ fontWeight: 900, fontSize: 20 }}>{target.std.statement}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{target.std.framework} · {target.std.code} · class average <b style={{ color: bandFor(target.avg).color }}>{target.avg}% ({bandFor(target.avg).label})</b> — the lowest in {subject} right now.</div>
      </div>

      <Eyebrow>Differentiated plan · three tracks, auto-grouped</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
        <PlanTrack color={T.red} title="Support" who={groups.support} activity={supportAct} tag="re-teach + scaffold" />
        <PlanTrack color={T.green} title="On-Level" who={groups.onLevel} activity={onLevelAct} tag="practice + check" />
        <PlanTrack color={T.violet} title="Turbo" who={groups.turbo} activity={turboAct} tag="depth + transfer" />
      </div>

      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>Why this plan</Eyebrow>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Built from the class's live ledger — not a blank page. {students.length} students sorted into three tracks by their mastery of <b style={{ color: T.ink }}>{target.std.code}</b>, each track pre-loaded with Plajah content ({cartridge}) and a check that flows back into the ledger. Approve, tweak, assign.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.faint }}>Next gaps after this: {ranked.slice(1, 4).map(r => `${r.std.code} (${r.avg}%)`).join(' · ')}</div>
      </div>
    </div>
  );
};
const PlanTrack: React.FC<{ color: string; title: string; who: string[]; activity: string; tag: string }> = ({ color, title, who, activity, tag }) => (
  <div style={{ ...cardStyle, padding: 15, borderColor: color }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontWeight: 800, fontSize: 15, color }}>{title}</span>
      <span style={{ fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>{tag}</span>
    </div>
    <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{who.length ? who.join(', ') : 'No students in this band'}</div>
    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{activity}</div>
  </div>
);

// ── 3. Assess Work (creativity-as-assessment) ────────────────────────────────────
const AssessWork: React.FC<{ cls: ToolsClass; standards: LearningStandard[]; user?: any; onRecorded?: () => void }> = ({ cls, standards, user, onRecorded }) => {
  const students = cls.students;
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  useEffect(() => { if (!students.some(s => s.id === studentId)) setStudentId(students[0]?.id || ''); }, [students, studentId]);
  const [standardId, setStandardId] = useState(standards[0].id);
  const [artifact, setArtifact] = useState('');
  const [score, setScore] = useState(3);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const SCALE = [['1', 'Emerging', 30], ['2', 'Developing', 55], ['3', 'Proficient', 75], ['4', 'Advanced', 92]] as [string, string, number][];
  const masteryForScore = SCALE.find(s => s[0] === String(score))![2];

  // A real class records through the server (the ledger is student/guardian-only in rules); the sample
  // class has no real students, so nothing is written.
  const save = async () => {
    if (!studentId || saving) return;
    setSaveErr('');
    if (!cls.isSample && user?.uid) {
      setSaving(true);
      const ok = await recordClassAssessment({ classId: cls.id, studentId, standardId, framework: standardById(standardId)?.framework || 'CCSS_ELA', mastery: masteryForScore, evidence: artifact || undefined });
      setSaving(false);
      if (!ok) { setSaveErr('Couldn’t record that — check your connection and try again.'); return; }
      onRecorded?.();
    }
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  if (!students.length) return <NoEvidence cls={cls} what="assessment" />;

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <Eyebrow color={T.violet}>Creativity-as-assessment</Eyebrow>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>Score a student's creative work — a song, a film scene, a piece of writing — against a standard. The result becomes evidence in their Learner Ledger, not just a number.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginBottom: 12 }}>
        <div><Eyebrow>Student</Eyebrow><select value={studentId} onChange={e => setStudentId(e.target.value)} style={selStyle}>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Eyebrow>Standard</Eyebrow><select value={standardId} onChange={e => setStandardId(e.target.value)} style={selStyle}>{standards.map(s => <option key={s.id} value={s.id}>{s.code} — {s.statement.slice(0, 40)}…</option>)}</select></div>
      </div>
      <div style={{ marginBottom: 12 }}><Eyebrow>The artifact (link or description)</Eyebrow><input value={artifact} onChange={e => setArtifact(e.target.value)} placeholder="e.g. Maya's fractions song, or a link to the recording" style={selStyle} /></div>
      <div style={{ marginBottom: 14 }}>
        <Eyebrow>Rubric score</Eyebrow>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCALE.map(([v, label, m]) => <button key={v} onClick={() => setScore(+v)} style={chip(score === +v, bandFor(m).color)}>{v} · {label}</button>)}</div>
      </div>
      <button onClick={() => void save()} disabled={saving} style={{ cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '11px 22px', borderRadius: 10, border: 'none', background: saved ? T.green : T.violet, color: '#fff', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>
        {saving ? <><Loader2 size={14} /> Recording…</> : saved ? <><Check size={14} /> {cls.isSample ? 'Sample — not saved' : 'Recorded to ledger'}</> : <><Sparkles size={14} /> Record assessment</>}
      </button>
      {saveErr && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: T.red }}>{saveErr}</div>}
      {cls.isSample && <div style={{ marginTop: 10, fontSize: 11, color: T.faint }}>This is the sample class, so nothing is recorded. Pick one of your classes to write real ledger records.</div>}
    </div>
  );
};
const selStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: 13, fontFamily: T.font, boxSizing: 'border-box' };

// ── Lesson Planner (on-platform, interop-native export) ──────────────────────────
const Planner: React.FC<{ plans: LessonPlan[]; setPlans: React.Dispatch<React.SetStateAction<LessonPlan[]>>; onCreateBlank: () => void }> = ({ plans, setPlans, onCreateBlank }) => {
  const update = (id: string, patch: Partial<LessonPlan>) => setPlans(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const remove = (id: string) => setPlans(ps => ps.filter(p => p.id !== id));
  const exportPlan = (p: LessonPlan, fmt: 'json' | 'gc' | 'lti') => {
    const like = { title: p.title, objective: p.objective, standardCode: p.standardCode, activities: p.activities };
    if (fmt === 'json') downloadText(JSON.stringify(p, null, 2), `plan-${p.standardCode}.json`);
    else if (fmt === 'gc') downloadText(JSON.stringify(toGoogleClassroomCoursework(like), null, 2), `plan-${p.standardCode}-googleclassroom.json`);
    else downloadText(JSON.stringify(toLtiResourceLink(like), null, 2), `plan-${p.standardCode}-lti.json`);
  };

  if (!plans.length) return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center', color: T.muted }}>
      <CalendarDays size={40} style={{ opacity: 0.3 }} />
      <div style={{ fontWeight: 800, fontSize: 17, color: T.ink, marginTop: 10 }}>No saved plans yet</div>
      <div style={{ fontSize: 13, margin: '6px 0 16px' }}>Generate a gap-targeted plan and save it here — then export to your tools.</div>
      <button onClick={onCreateBlank} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Wand2 size={14} /> Plan from mastery</button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>Your plans are <b style={{ color: T.ink }}>interop-native</b> — export the exact payloads ed-tech tools expect. Live push to Google Classroom / LTI is one OAuth connection away (see Integrations).</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map(p => (
          <div key={p.id} style={{ ...cardStyle, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input value={p.title} onChange={e => update(p.id, { title: e.target.value })} style={{ ...selStyle, fontWeight: 800, fontSize: 15 }} />
              <button onClick={() => remove(p.id)} title="Delete" style={{ cursor: 'pointer', padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.red, flexShrink: 0 }}><Trash2 size={14} /></button>
            </div>
            <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, fontWeight: 800, marginBottom: 8 }}>{p.subject} · {p.band} · {p.standardCode}</div>
            <div style={{ marginBottom: 8 }}><Eyebrow>Objective</Eyebrow><textarea value={p.objective} onChange={e => update(p.id, { objective: e.target.value })} rows={2} style={{ ...selStyle, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 8 }}>
              <Eyebrow>Activities</Eyebrow>
              {p.activities.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: T.muted, padding: '4px 0', lineHeight: 1.4 }}>• {a}</div>)}
            </div>
            <div style={{ marginBottom: 12 }}><Eyebrow>Notes</Eyebrow><textarea value={p.notes} onChange={e => update(p.id, { notes: e.target.value })} rows={2} placeholder="Materials, timing, reminders…" style={{ ...selStyle, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => exportPlan(p, 'json')} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
              <button onClick={() => exportPlan(p, 'gc')} style={exportBtn(T.green)}><Send size={12} /> Google Classroom</button>
              <button onClick={() => exportPlan(p, 'lti')} style={exportBtn(T.blue)}><Send size={12} /> LTI 1.3</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const exportBtn = (color: string): React.CSSProperties => ({ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color, fontSize: 10.5, fontWeight: 800 });

// ── Assignment / formative-check builder (QTI-native) ────────────────────────────
const ChecksBuilder: React.FC<{ className: string; subject: Subject; band: BandId; standards: LearningStandard[]; assignments: AssignmentCheck[]; setAssignments: React.Dispatch<React.SetStateAction<AssignmentCheck[]>> }> = ({ className, subject, band, standards, assignments, setAssignments }) => {
  const [title, setTitle] = useState('Exit ticket');
  const [standardId, setStandardId] = useState(standards[0]?.id || '');
  const [points, setPoints] = useState(10);
  const [questions, setQuestions] = useState<CheckQuestion[]>([{ prompt: '', options: ['', '', ''], answer: 0 }]);

  const setQ = (i: number, patch: Partial<CheckQuestion>) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const setOpt = (i: number, oi: number, v: string) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, options: q.options.map((o, j) => j === oi ? v : o) } : q));
  const valid = title.trim() && questions.some(q => q.prompt.trim());

  const assign = () => {
    const std = standardById(standardId);
    setAssignments(a => [{ id: `chk_${a.length + 1}_${standardId}`, title: title.trim(), subject, band, standardCode: std?.code || standardId, points, questions: questions.filter(q => q.prompt.trim()), createdAt: 1 }, ...a]);
    setTitle('Exit ticket'); setQuestions([{ prompt: '', options: ['', '', ''], answer: 0 }]);
  };

  const exportCheck = (a: AssignmentCheck, fmt: 'qti' | 'gc' | 'lti' | 'json') => {
    const std = standardById(`${a.standardCode}`);
    const like = { title: a.title, standardCode: a.standardCode, points: a.points, questions: a.questions };
    const planLike = { title: a.title, objective: `Formative check · ${std?.statement || a.standardCode}`, standardCode: a.standardCode, activities: a.questions.map(q => q.prompt) };
    if (fmt === 'qti') downloadText(JSON.stringify(toQTIAssessment(like), null, 2), `check-${a.standardCode}-qti.json`);
    else if (fmt === 'gc') downloadText(JSON.stringify(toGoogleClassroomCoursework(planLike), null, 2), `check-${a.standardCode}-googleclassroom.json`);
    else if (fmt === 'lti') downloadText(JSON.stringify(toLtiResourceLink(planLike), null, 2), `check-${a.standardCode}-lti.json`);
    else downloadText(JSON.stringify(a, null, 2), `check-${a.standardCode}.json`);
  };

  if (!standards.length) return <div style={{ ...cardStyle, padding: 20, color: T.muted }}>Pick a subject/level with standards to build a check.</div>;

  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
        <Eyebrow color={T.orange}>Build a formative check · QTI-native</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Title</div><input value={title} onChange={e => setTitle(e.target.value)} style={selStyle} /></div>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Standard</div><select value={standardId} onChange={e => setStandardId(e.target.value)} style={selStyle}>{standards.map(s => <option key={s.id} value={s.id}>{s.code} — {s.statement.slice(0, 36)}…</option>)}</select></div>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Points</div><input type="number" min={1} value={points} onChange={e => setPoints(+e.target.value)} style={selStyle} /></div>
        </div>
        {questions.map((q, i) => (
          <div key={i} style={{ ...cardStyle, padding: 12, marginBottom: 10, background: T.cardAlt }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={q.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} style={selStyle} />
              {questions.length > 1 && <button onClick={() => setQuestions(qs => qs.filter((_, idx) => idx !== i))} style={{ ...exportBtn(T.red), padding: '0 10px' }}>✕</button>}
            </div>
            {q.options.map((o, oi) => (
              <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => setQ(i, { answer: oi })} title="Mark correct" style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 99, flexShrink: 0, border: `2px solid ${q.answer === oi ? T.green : T.border}`, background: q.answer === oi ? T.green : 'transparent', color: '#0c0a08', fontSize: 12 }}>{q.answer === oi ? '✓' : ''}</button>
                <input value={o} onChange={e => setOpt(i, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={selStyle} />
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => setQuestions(qs => [...qs, { prompt: '', options: ['', '', ''], answer: 0 }])} style={{ ...exportBtn(T.muted), border: `1px dashed ${T.border}` }}><Plus size={12} /> Add question</button>
          <button onClick={assign} disabled={!valid} style={{ cursor: valid ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: valid ? 1 : 0.4 }}><ListChecks size={14} /> Assign to {className.split('—')[0].trim()}</button>
        </div>
      </div>

      {assignments.length > 0 && (
        <div>
          <div style={{ marginBottom: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>Assigned checks export as <b style={{ color: T.ink }}>QTI 3.0</b> (any assessment platform), Google Classroom, or LTI. Student results write back to each learner's ledger; grades pass back via LTI-AGS / OneRoster.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {assignments.map(a => (
              <div key={a.id} style={{ ...cardStyle, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{a.title}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{a.standardCode} · {a.questions.length} question{a.questions.length > 1 ? 's' : ''} · {a.points} pts</div>
                  </div>
                  <button onClick={() => setAssignments(list => list.filter(x => x.id !== a.id))} style={{ cursor: 'pointer', padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.red }}><Trash2 size={13} /></button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <button onClick={() => exportCheck(a, 'qti')} style={exportBtn(T.orange)}><FileDown size={12} /> QTI 3.0</button>
                  <button onClick={() => exportCheck(a, 'gc')} style={exportBtn(T.green)}><Send size={12} /> Google Classroom</button>
                  <button onClick={() => exportCheck(a, 'lti')} style={exportBtn(T.blue)}><Send size={12} /> LTI 1.3</button>
                  <button onClick={() => exportCheck(a, 'json')} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Progress Reports (parent-ready, from the ledger) ─────────────────────────────
const SUBJ_LABEL: Partial<Record<Subject, { label: string; color: string }>> = {
  ELA: { label: 'Reading & Language', color: T.orange }, SCIENCE: { label: 'Science', color: T.violet }, MATH: { label: 'Mathematics', color: T.blue },
};
const buildReport = (cls: ToolsClass, studentId: string) => {
  const student = cls.students.find(s => s.id === studentId) || cls.students[0];
  // Only standards with evidence go on a report a parent will read.
  const items = STANDARDS.filter(s => SUBJ_LABEL[s.subject]).flatMap(s => { const m = cls.masteryOf(student.id, s.id); return m === null ? [] : [{ std: s, m }]; });
  const subjects: Record<string, { std: LearningStandard; m: number }[]> = {};
  items.forEach(it => { (subjects[it.std.subject] ||= []).push(it); });
  const overall = items.length ? Math.round(items.reduce((a, x) => a + x.m, 0) / items.length) : 0;
  const sorted = [...items].sort((a, b) => b.m - a.m);
  return { student, subjects, overall, evidence: items.length, strengths: sorted.slice(0, 3), focus: sorted.slice(-3).reverse() };
};

const Reports: React.FC<{ cls: ToolsClass }> = ({ cls }) => {
  const [studentId, setStudentId] = useState(cls.students[0]?.id || '');
  if (!cls.students.length) return <NoEvidence cls={cls} what="report" />;
  return <ReportFor cls={cls} studentId={cls.students.some(s => s.id === studentId) ? studentId : cls.students[0].id} setStudentId={setStudentId} />;
};

const ReportFor: React.FC<{ cls: ToolsClass; studentId: string; setStudentId: (id: string) => void }> = ({ cls, studentId, setStudentId }) => {
  const r = buildReport(cls, studentId);
  const band = bandFor(r.overall);
  const [comment, setComment] = useState('');
  const defComment = `${r.student.name} is working at a ${band.label.toLowerCase()} level overall. Strongest in ${r.strengths[0]?.std.domain}. With a little focus on ${r.focus[0]?.std.domain}, ${r.student.name.split(' ')[0]} will keep climbing.`;
  const note = comment || defComment;
  const studentPicker = <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...selStyle, maxWidth: 260, minHeight: 44 }}>{cls.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  if (!r.evidence) return (
    <div style={{ ...cardStyle, padding: 18, display: 'grid', gap: 12 }}>
      {studentPicker}
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>No mastery evidence for {r.student.name} yet, so there's nothing to report. Their report fills in as they turn in work and you record assessments.</div>
    </div>
  );

  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const reportHTML = () => {
    const subj = Object.entries(r.subjects).map(([s, list]) => {
      const avg = Math.round(list.reduce((a, x) => a + x.m, 0) / list.length);
      const rows = list.map(x => `<tr><td>${x.std.code}</td><td>${x.std.statement}</td><td style="text-align:right;font-weight:700">${x.m}%</td></tr>`).join('');
      return `<h3>${SUBJ_LABEL[s as Subject]?.label || s} — ${avg}% (${bandFor(avg).label})</h3><table>${rows}</table>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.student.name)} — Progress Report</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;max-width:720px;margin:32px auto;color:#111;padding:0 16px}
h1{margin:0;font-size:24px}.sub{color:#666;font-size:13px;margin:2px 0 16px}
.standing{background:#f5f3ef;border-radius:10px;padding:14px 16px;margin-bottom:18px}
h3{margin:18px 0 6px;font-size:15px}table{width:100%;border-collapse:collapse;font-size:12px}
td{border-bottom:1px solid #eee;padding:5px 6px;vertical-align:top}
.cols{display:flex;gap:24px;margin:12px 0}.col{flex:1}.col b{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888}
.comment{border-left:3px solid #FF8C00;padding:8px 12px;background:#fff8ef;margin-top:18px;font-size:13px}
.foot{margin-top:24px;color:#999;font-size:11px;border-top:1px solid #eee;padding-top:10px}</style></head>
<body><h1>${esc(r.student.name)}</h1><div class="sub">${esc(cls.name)} · ${esc(cls.teacherName)} · Progress Report</div>
<div class="standing"><b>Overall:</b> ${r.overall}% — ${band.label} · Global standing: PISA band ${masteryToPISABand(r.overall)}/6</div>
<div class="cols"><div class="col"><b>Strengths</b><ul>${r.strengths.map(x => `<li>${x.std.domain} (${x.m}%)</li>`).join('')}</ul></div>
<div class="col"><b>Focus areas</b><ul>${r.focus.map(x => `<li>${x.std.domain} (${x.m}%)</li>`).join('')}</ul></div></div>
${subj}<div class="comment"><b>Teacher note:</b> ${esc(note)}</div>
<div class="foot">Generated from ${esc(r.student.name.split(' ')[0])}'s Plajah Learner Ledger. Standards-aligned, portable, verifiable.</div></body></html>`;
  };

  return (
    <div>
      <div style={{ ...cardStyle, padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Eyebrow>Student</Eyebrow>
        <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...selStyle, maxWidth: 220 }}>{cls.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <div style={{ flex: 1 }} />
        <button onClick={() => downloadText(reportHTML(), `progress-report-${r.student.name.replace(/\W/g, '')}.html`, 'text/html')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Printer size={14} /> Download report (print-ready)</button>
        <button onClick={() => downloadText(JSON.stringify({ student: r.student.name, overall: r.overall, level: band.label, pisaBand: masteryToPISABand(r.overall), subjects: r.subjects, note }, null, 2), `progress-report-${r.student.name.replace(/\W/g, '')}.json`)} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
      </div>

      {/* In-app preview of the parent-facing report */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 22 }}>{r.student.name}</div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{cls.name} · {cls.teacherName} · Progress Report{cls.isSample ? ' · sample data' : ''}</div>
        <div style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: band.color }}>{r.overall}%</div>
          <div style={{ fontSize: 13, color: T.muted }}><b style={{ color: band.color }}>{band.label}</b> · Global standing <b style={{ color: T.ink }}>PISA band {masteryToPISABand(r.overall)}/6</b></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div><Eyebrow color={T.green}>Strengths</Eyebrow>{r.strengths.map(x => <div key={x.std.id} style={{ fontSize: 12.5, marginBottom: 4 }}>{x.std.domain} <span style={{ color: T.green, fontWeight: 700 }}>{x.m}%</span></div>)}</div>
          <div><Eyebrow color={T.orange}>Focus areas</Eyebrow>{r.focus.map(x => <div key={x.std.id} style={{ fontSize: 12.5, marginBottom: 4 }}>{x.std.domain} <span style={{ color: T.orange, fontWeight: 700 }}>{x.m}%</span></div>)}</div>
        </div>
        {Object.entries(r.subjects).map(([s, list]) => {
          const avg = Math.round(list.reduce((a, x) => a + x.m, 0) / list.length);
          const meta = SUBJ_LABEL[s as Subject]!; const b = bandFor(avg);
          return (
            <div key={s} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ fontWeight: 700 }}>{meta.label}</span><span style={{ color: b.color, fontWeight: 700 }}>{b.label} · {avg}%</span></div>
              <Bar value={avg} color={b.color} />
            </div>
          );
        })}
        <div style={{ marginTop: 14 }}>
          <Eyebrow>Teacher note (editable)</Eyebrow>
          <textarea value={note} onChange={e => setComment(e.target.value)} rows={3} style={{ ...selStyle, resize: 'vertical' }} />
        </div>
      </div>
    </div>
  );
};

// ── 4. Integrations (Phase 5) ────────────────────────────────────────────────────
const STATUS_META: Record<IntegrationStatus, { label: string; color: string }> = {
  live: { label: 'Live', color: T.green }, scaffolded: { label: 'Adapter ready', color: T.gold }, planned: { label: 'Planned', color: T.muted },
};
const Integrations: React.FC = () => {
  const [imported, setImported] = useState<{ framework: string; count: number; sample: string[] } | null>(null);
  const runImport = () => {
    const r = importCASEFramework(SAMPLE_CASE);
    setImported({ framework: r.framework, count: r.count, sample: r.standards.slice(0, 3).map(s => `${s.code} — ${s.statement.slice(0, 48)}…`) });
  };
  return (
    <div>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
        <Eyebrow>Connect your district · sit beside the LMS, own the longitudinal record</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 6 }}>
          {INTEGRATIONS.map(it => { const sm = STATUS_META[it.status]; return (
            <div key={it.id} style={{ ...cardStyle, padding: 13, background: T.cardAlt }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{it.name}</span>
                <span style={{ fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: sm.color, border: `1px solid ${sm.color}`, borderRadius: 99, padding: '2px 7px' }}>{sm.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>{it.desc}</div>
            </div>
          ); })}
        </div>
      </div>
      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow color={T.green}>CASE framework import · live</Eyebrow>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>Ingest any standards framework as machine-readable CASE data into Plajah's standards graph — this is how the ledger stays current across states and countries. Try it with a sample framework:</div>
        <button onClick={runImport} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#0a0a0f', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}><Download size={14} /> Import sample CASE framework</button>
        {imported && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: T.cardAlt, border: `1px solid ${T.green}` }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>✓ Imported “{imported.framework}” — {imported.count} standards</div>
            {imported.sample.map((s, i) => <div key={i} style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>{s}</div>)}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 5. Learning Context (Phase 7) ────────────────────────────────────────────────
const ContextSettings: React.FC = () => {
  const [ctx, setCtx] = useState<LearningContextSettings>(DEFAULT_CONTEXT);
  return (
    <div>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
        <Eyebrow>Learning context · one ledger, every setting</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 6 }}>
          {ORG_TYPES.map(o => (
            <button key={o.id} onClick={() => setCtx(c => ({ ...c, orgType: o.id }))} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: 12, background: ctx.orgType === o.id ? 'rgba(255,140,0,0.1)' : T.cardAlt, borderColor: ctx.orgType === o.id ? T.orange : T.border }}>
              <div style={{ fontSize: 18 }}>{o.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginTop: 3 }}>{o.label}{o.native && <span style={{ fontSize: 8, color: T.green, marginLeft: 5, fontWeight: 800 }}>NATIVE</span>}</div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, lineHeight: 1.35 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>Curriculum overlay · public standards, your tradition</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 6 }}>
          {FRAMEWORK_OVERLAYS.map(o => (
            <button key={o.id} onClick={() => setCtx(c => ({ ...c, overlayId: o.id }))} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: 12, background: ctx.overlayId === o.id ? 'rgba(129,102,230,0.1)' : T.cardAlt, borderColor: ctx.overlayId === o.id ? T.violet : T.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 16 }}>{o.icon}</span><span style={{ fontWeight: 800, fontSize: 13 }}>{o.label}</span><span style={{ fontSize: 8, color: T.muted, textTransform: 'uppercase', fontWeight: 800 }}>{o.mode}</span></div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Homeschool & pods are <b style={{ color: T.muted }}>native</b> org types here — the learner-owned ledger spans families and rotating parent-teachers, and graduates with the student into university and work.</div>
      </div>
    </div>
  );
};

export default TeacherToolsView;
