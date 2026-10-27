import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Library,
  GraduationCap,
  ChevronLeft,
  Loader2,
  Users,
  Check,
  MessageSquare,
  Send,
  FileScan,
  Sparkles,
  Calendar,
  ExternalLink,
  FileText,
  LayoutDashboard,
  ClipboardCheck,
  Award,
  Link2,
} from 'lucide-react';
import type { Organization } from '../../types';
import { COURSES } from '../../services/courseCatalog';
import { openScripture } from '../scripture/ScriptureRefChip';
import { parseRef } from '../../services/scriptureRef';
import {
  KIND_LABEL,
  STARTERS,
  ensureDefaultTemplatedClassrooms,
  saveProgram,
  deleteProgram,
  newProgram,
  fromStarter,
  attachClassroom,
  postClassChatMessage,
  type ChurchProgram,
  type PlanWeek,
  type ProgramKind,
} from '../../services/churchEducationService';
import { digitizeWorksheetOnDevice } from '../../services/worksheetLocalVision';
import type { DigitalWorksheet } from '../../services/worksheetDigitizer';
import type { TelaDoc, TelaWriterDevice } from '../../types';
import { saveTelaDoc } from '../../services/telaStore';
import { auth } from '../../services/firebase';
import CurriculumAndMasteryStudio from './CurriculumAndMasteryStudio';
import SharedClassroomClubHub from '../classroom/SharedClassroomClubHub';
import OrgCentralCalendarHub from '../elevate/OrgCentralCalendarHub';
import { UniversalStudentDesk } from '../desk/UniversalStudentDesk';
import {
  listIngestedUnits,
  loadOrgMasterySummary,
  type IngestedCurriculumUnit,
} from '../../services/curriculumIngestionService';
import { LEVEL_NAME, LEVEL_COLOR, type SkillLevel } from '../../services/mastery';

const TeacherHub = lazy(() => import('../academia/TeacherHub'));
const TeacherToolsView = lazy(() => import('../TeacherToolsView'));
const TodayDueFirst = lazy(() => import('../academia/TodayDueFirst'));

/**
 * Christian Education for a Church / Faith Organization:
 * - Full workflow and toolset parity with Academia Teachers & Students:
 *   1. Classrooms & Weekly Verse Syllabus (7 templated classrooms + custom classes + governed Classroom Chat)
 *   2. Teacher Dashboard (Academia TeacherHub: KPI band, Toolbox row, Attendance, Student Dossier search, Recent Work)
 *   3. Teacher Tools & Gradebook (Academia TeacherToolsView: Standards Gradebook Heatmap, Plan from Mastery, Assess Work, Scan Worksheet, Templates, Integrity)
 *   4. Curriculum, Google Forms/Docs, Word & PDF → Interactive Tela + Mastery Studio (extracts lessons + companion answer key docs into multi-frame interactive Tela documents & Mastery skills)
 *   5. Student Portal & My Mastery (Due-first assignments, interactive auto-graded Tela worksheets/tests, and Khan-style Mastery progress)
 */
const field =
  'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50 placeholder:text-white/25';
const nav = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));

type EducationPortalMode =
  | 'CLASSROOMS'
  | 'TEACHER_DASHBOARD'
  | 'TEACHER_TOOLS'
  | 'CURRICULUM_TELA_INGESTOR'
  | 'TEACHER_TOOLS'
  | 'CURRICULUM_TELA_INGESTOR'
  | 'CENTRAL_CALENDAR'
  | 'STUDENT_PORTAL';

const ChurchEducation: React.FC<{
  church: Organization;
  canEdit: boolean;
  onOpenChatRoom?: (roomId: string) => void;
}> = ({ church, canEdit, onOpenChatRoom }) => {
  const [portalMode, setPortalMode] = useState<EducationPortalMode>('CLASSROOMS');
  const [programs, setPrograms] = useState<ChurchProgram[] | null>(null);
  const [open, setOpen] = useState<ChurchProgram | null>(null);
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'CLASSROOM_CLUB' | 'CLASS_CHAT' | 'ACADEMIA_STACK' | 'TELA_UNITS'>('SYLLABUS');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Class Chat state
  const [chatDraft, setChatDraft] = useState('');
  const [chatSenderRole, setChatSenderRole] = useState<'INSTRUCTOR' | 'STUDENT' | 'CATECHIST' | 'PASTOR'>(
    canEdit ? 'INSTRUCTOR' : 'STUDENT'
  );

  // Academia Paper Worksheet Scanner state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanningWorksheet, setScanningWorksheet] = useState(false);
  const [scannedWorksheet, setScannedWorksheet] = useState<DigitalWorksheet | null>(null);
  const [worksheetAnswers, setWorksheetAnswers] = useState<Record<string, string>>({});

  // Ingested interactive Tela units & Mastery summary
  const [ingestedUnits, setIngestedUnits] = useState<IngestedCurriculumUnit[]>(() =>
    listIngestedUnits(church.id)
  );
  const [masterySummary, setMasterySummary] = useState(() => loadOrgMasterySummary(church.id));

  const currentUser = auth.currentUser;
  const teacherProfile = useMemo(
    () => ({
      uid: currentUser?.uid || church.creatorId || `teacher_${church.id}`,
      displayName:
        currentUser?.displayName ||
        open?.leadInstructor ||
        `${church.name} Christian Education Lead`,
      email: currentUser?.email || '',
      role: canEdit ? 'TEACHER' : 'STUDENT',
    }),
    [currentUser, church.creatorId, church.id, church.name, open?.leadInstructor, canEdit]
  );

  const reload = async () => {
    try {
      const list = await ensureDefaultTemplatedClassrooms(church);
      setPrograms(list);
      setIngestedUnits(listIngestedUnits(church.id));
      setMasterySummary(loadOrgMasterySummary(church.id));
      if (open) {
        const refreshed = list.find(x => x.id === open.id);
        if (refreshed) setOpen(refreshed);
      }
    } catch {
      setPrograms([]);
      setErr('Could not load Christian Education classrooms.');
    }
  };

  useEffect(() => {
    reload();
  }, [church.id]);

  const persist = async (p: ChurchProgram) => {
    setBusy(true);
    setErr('');
    try {
      await saveProgram(p);
      setOpen(p);
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setErr('Could not save classroom program.');
    }
    setBusy(false);
  };

  const start = (p: ChurchProgram) => persist(p);

  const courseOptions = useMemo(
    () =>
      COURSES.filter(
        c => c.kind === 'curriculum' && ['humanities', 'arts', 'economics', 'literacy'].includes(c.subject)
      ),
    []
  );

  const handleAttachIngestedUnitToProgram = async (programId: string, unit: IngestedCurriculumUnit) => {
    const target = (programs || []).find(p => p.id === programId);
    if (!target) return;
    const mergedWeeks = [
      ...target.weeks,
      ...unit.syllabusWeeks.map((w, idx) => ({
        ...w,
        id: `wk_ing_${Date.now().toString(36)}_${idx}`,
      })),
    ];
    const updated = await postClassChatMessage(
      { ...target, weeks: mergedWeeks },
      {
        senderName: target.leadInstructor || `${church.name} Catechist`,
        senderRole: 'INSTRUCTOR',
        text: `Published interactive Tela unit "${unit.title}" (${unit.questions.length} auto-graded questions, ${unit.masterySkills.length} Mastery skills) from ${unit.sourceLabel}.`,
        attachmentLabel: `Interactive Tela: ${unit.title}`,
      }
    );
    await saveProgram(updated);
    await reload();
  };

  const handleSendChatMessage = async () => {
    if (!open || !chatDraft.trim()) return;
    const text = chatDraft.trim();
    setChatDraft('');
    const senderName = canEdit
      ? open.leadInstructor || `${church.name} Catechist`
      : 'Congregation Class Member';
    const updated = await postClassChatMessage(open, {
      senderName,
      senderRole: chatSenderRole,
      text,
    });
    setOpen(updated);
    setPrograms(prev => (prev ? prev.map(x => (x.id === updated.id ? updated : x)) : [updated]));
  };

  const handleScanPaperWorksheet = async (file: File) => {
    setScanningWorksheet(true);
    setErr('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read worksheet image file.'));
        reader.readAsDataURL(file);
      });
      const result = await digitizeWorksheetOnDevice(dataUrl, church.creatorId || church.id, () => {});
      const sheet = result.sheet;
      setScannedWorksheet(sheet);
      if (open) {
        const segCount = (sheet.segments || []).length || sheet.fields.length;
        const updated = await postClassChatMessage(open, {
          senderName: open.leadInstructor || 'Academia Ed-Tech Scanner',
          senderRole: 'INSTRUCTOR',
          text: `Digitized paper worksheet "${sheet.title}" (${segCount} interactive items) for classroom completion.`,
          attachmentLabel: `Fillable Worksheet: ${sheet.title}`,
        });
        setOpen(updated);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not scan worksheet image.');
    } finally {
      setScanningWorksheet(false);
    }
  };

  const handleOpenLessonInTela = async (p: ChurchProgram) => {
    const writer: TelaWriterDevice = {
      id: `dev_${p.id}_writer`,
      type: 'WRITER',
      mode: 'DOCUMENT',
      blocks: [
        {
          id: `blk_${p.id}_title`,
          kind: 'h1',
          text: `${p.name} — ${church.name}`,
        },
        {
          id: `blk_${p.id}_desc`,
          kind: 'p',
          text: `${KIND_LABEL[p.kind]} (${p.ageBand || 'All Ages'}) · ${p.meetingSchedule || ''} · ${p.description}`,
        },
        ...p.weeks.map((w, idx) => ({
          id: `blk_${p.id}_w_${idx + 1}`,
          kind: 'p' as const,
          text: `Week ${idx + 1}: ${w.title} (${w.passage}) — ${w.note}${w.library ? ` · Sacred Library: ${w.library}` : ''}${w.worksheetPrompt ? ` · Worksheet: ${w.worksheetPrompt}` : ''}`,
        })),
      ],
    };
    const now = Date.now();
    const doc: TelaDoc = {
      id: `tela_church_edu_${p.id}`,
      ownerId: church.creatorId || 'elevate-edu',
      title: `${p.name} (Christian Education)`,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      frames: [
        {
          id: `frame_${p.id}_writer`,
          kind: 'PAPER',
          preset: 'LETTER',
          orientation: 'PORTRAIT',
          x: 0,
          y: 0,
          w: 816,
          h: 1056,
          deviceIds: [writer.id],
          label: `${p.name} · Lesson Guide`,
        },
      ],
      devices: { [writer.id]: writer },
    };
    await saveTelaDoc(doc);
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
  };

  // Top-level Christian Education & Academia Parity Mode Bar
  const modeBar = (
    <div className="rounded-3xl border border-white/10 bg-[#12091e]/90 p-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPortalMode('CLASSROOMS')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'CLASSROOMS'
              ? 'bg-amber-400 text-black shadow'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <BookOpen size={13} /> Classrooms &amp; Syllabus ({programs?.length ?? 0})
        </button>

        <button
          type="button"
          onClick={() => setPortalMode('CURRICULUM_TELA_INGESTOR')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'CURRICULUM_TELA_INGESTOR'
              ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Link2 size={13} /> Google Forms/Docs &amp; PDF → Tela + Mastery ({ingestedUnits.length})
        </button>

        <button
          type="button"
          onClick={() => setPortalMode('TEACHER_DASHBOARD')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'TEACHER_DASHBOARD'
              ? 'bg-amber-400 text-black shadow'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <LayoutDashboard size={13} /> Instructor Dashboard (Non-Credentialed)
        </button>

        <button
          type="button"
          onClick={() => setPortalMode('CENTRAL_CALENDAR')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'CENTRAL_CALENDAR'
              ? 'bg-sky-400 text-black shadow'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Calendar size={13} /> Central Calendar &amp; Sub AI
        </button>

        <button
          type="button"
          onClick={() => setPortalMode('TEACHER_TOOLS')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'TEACHER_TOOLS'
              ? 'bg-amber-400 text-black shadow'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <ClipboardCheck size={13} /> Instructor Tools &amp; Gradebook
        </button>

        <button
          type="button"
          onClick={() => setPortalMode('STUDENT_PORTAL')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
            portalMode === 'STUDENT_PORTAL'
              ? 'bg-emerald-400 text-black shadow'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Award size={13} /> 🪑 Student Desk &amp; My Mastery
        </button>
      </div>

      <button
        type="button"
        onClick={() => nav('LEARN')}
        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-bold inline-flex items-center gap-1.5"
      >
        <GraduationCap size={13} /> Full Academia Hub
      </button>
    </div>
  );

  // MODE 2: INSTRUCTOR DASHBOARD (Non-Credentialed Church Class Instructor — distinct from Academia Teacher)
  if (portalMode === 'CENTRAL_CALENDAR') {
    const christianEdDeptId =
      (church.ministries || []).find(m => /christian\s*ed|education|sunday\s*school/i.test(m.name))?.id || 'ALL';
    return (
      <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}
        <OrgCentralCalendarHub
          org={church}
          myMembership={null}
          initialDepartmentId={christianEdDeptId}
        />
      </div>
    );
  }

  if (portalMode === 'TEACHER_DASHBOARD') {
    return (
      <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}
        <div className="rounded-3xl border border-white/10 bg-[#0b0614] p-4 sm:p-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-white/40" size={24} />
              </div>
            }
          >
            <TeacherHub
              user={currentUser || { uid: teacherProfile.uid, displayName: teacherProfile.displayName }}
              profile={teacherProfile}
              isAdminLens={canEdit}
              onNavigate={targetView => {
                if (targetView === 'TEACHER_TOOLS') {
                  setPortalMode('TEACHER_TOOLS');
                } else {
                  nav(targetView);
                }
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // MODE 3: TEACHER TOOLS, GRADEBOOK HEATMAP, PLAN FROM MASTERY & ASSESS WORK
  if (portalMode === 'TEACHER_TOOLS') {
    return (
      <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}
        <div className="rounded-3xl border border-white/10 bg-[#0a0a0f] overflow-hidden">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-white/40" size={24} />
              </div>
            }
          >
            <TeacherToolsView
              user={currentUser || { uid: teacherProfile.uid, displayName: teacherProfile.displayName }}
              onBack={() => setPortalMode('TEACHER_DASHBOARD')}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // MODE 4: CURRICULUM, GOOGLE FORMS/DOCS, WORD & PDF → INTERACTIVE TELA + MASTERY INGESTOR
  if (portalMode === 'CURRICULUM_TELA_INGESTOR') {
    return (
      <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}
        <CurriculumAndMasteryStudio
          orgId={church.id}
          orgName={church.name}
          canEdit={canEdit}
          currentUserUid={teacherProfile.uid}
          currentUserName={teacherProfile.displayName}
          programs={programs || []}
          selectedProgramId={open?.id}
          onAttachWeeksToProgram={handleAttachIngestedUnitToProgram}
        />
      </div>
    );
  }

  // MODE 5: UNIVERSAL STUDENT DESK & MY MASTERY (Same workflow across Christian Education & Academia)
  if (portalMode === 'STUDENT_PORTAL') {
    const masteryEntries = Object.entries(masterySummary);
    return (
      <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}

        {/* Universal Platform-Wide Student Desk (Powered by Tela) */}
        <UniversalStudentDesk
          studentUid={teacherProfile.uid}
          studentName={teacherProfile.displayName}
          defaultDomain="CHRISTIAN_EDUCATION"
          orgId={church.id}
          orgName={church.name}
          onOpenTelaStudio={(docId: string) => {
            window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
          }}
        />

        {/* Student Due-First Assignments Strip from Academia */}
        <Suspense fallback={null}>
          <TodayDueFirst
            uid={teacherProfile.uid}
            role="student"
            onOpenTemplate={templateId => {
              try {
                sessionStorage.setItem('plajah:teacherTab', 'templates');
                sessionStorage.setItem('plajah:openTemplateId', templateId);
              } catch {}
              setPortalMode('TEACHER_TOOLS');
            }}
          />
        </Suspense>

        {/* Student Mastery Summary Strip */}
        <div className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.05] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                My Christian Education &amp; Coursework Mastery
              </p>
              <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {church.name} · Student Mastery &amp; Interactive Tela Assignments
              </h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-black">
              {ingestedUnits.length} Interactive Tela Units Available
            </span>
          </div>

          {masteryEntries.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
              {masteryEntries.map(([skillId, rec]) => {
                const lvl: SkillLevel = rec.level ?? 0;
                return (
                  <div key={skillId} className="rounded-2xl border border-white/10 bg-black/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate">{skillId}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                        style={{
                          backgroundColor: `${LEVEL_COLOR[lvl]}22`,
                          color: LEVEL_COLOR[lvl],
                        }}
                      >
                        {LEVEL_NAME[lvl]}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(10, (lvl / 4) * 100)}%`, background: LEVEL_COLOR[lvl] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive Tela Assignments & Auto-Graded Checks Runner for Students */}
        <CurriculumAndMasteryStudio
          orgId={church.id}
          orgName={church.name}
          canEdit={false}
          currentUserUid={teacherProfile.uid}
          currentUserName={teacherProfile.displayName}
          programs={programs || []}
        />
      </div>
    );
  }

  if (open) {
    const p = open;
    const set = (patch: Partial<ChurchProgram>) => setOpen({ ...p, ...patch });
    const setWeek = (i: number, patch: Partial<PlanWeek>) =>
      set({ weeks: p.weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

    return (
      <div className="space-y-4 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {modeBar}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              reload();
            }}
            className="text-[11px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-1"
          >
            <ChevronLeft size={14} /> All Christian Education Classrooms
          </button>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
              Academia Classroom · {p.classroomId || 'Active'}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-[10px] font-mono">
              #{p.chatRoomId.slice(-18)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          {canEdit ? (
            <input
              aria-label="Program name"
              value={p.name}
              onChange={e => set({ name: e.target.value })}
              className={`${field} text-lg font-black`}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            />
          ) : (
            <h2 className="text-xl font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {p.name}
            </h2>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-white/65">
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white font-semibold">
              {KIND_LABEL[p.kind]}
            </span>
            {p.ageBand && <span>• {p.ageBand}</span>}
            {p.meetingSchedule && (
              <span className="inline-flex items-center gap-1 text-amber-200/90">
                <Calendar size={12} /> {p.meetingSchedule}
              </span>
            )}
            {p.leadInstructor && <span>• Lead: {p.leadInstructor}</span>}
          </div>

          {canEdit ? (
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                aria-label="Meeting schedule"
                value={p.meetingSchedule || ''}
                onChange={e => set({ meetingSchedule: e.target.value })}
                className={field}
                placeholder="Schedule & room (e.g. Sundays · 9:15 AM · Room B-104)"
              />
              <input
                aria-label="Lead instructor"
                value={p.leadInstructor || ''}
                onChange={e => set({ leadInstructor: e.target.value })}
                className={field}
                placeholder="Lead instructor / catechist"
              />
            </div>
          ) : null}

          {canEdit ? (
            <textarea
              aria-label="Description"
              value={p.description}
              onChange={e => set({ description: e.target.value })}
              rows={2}
              className={`${field} resize-none`}
              placeholder="What is this classroom about?"
            />
          ) : (
            p.description && <p className="text-sm text-white/75 leading-relaxed">{p.description}</p>
          )}

          {/* 4-Tab Classroom Navigation */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('SYLLABUS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                activeTab === 'SYLLABUS'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <BookOpen size={13} /> Weekly Verse Syllabus ({p.weeks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CLASSROOM_CLUB')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                activeTab === 'CLASSROOM_CLUB'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Users size={13} /> Classroom Club, Live Lecture, Feed &amp; Photos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TELA_UNITS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                activeTab === 'TELA_UNITS'
                  ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Sparkles size={13} /> Google Forms/Docs &amp; PDF → Tela + Mastery
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CLASS_CHAT')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                activeTab === 'CLASS_CHAT'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <MessageSquare size={13} /> Dedicated Classroom Chat ({(p.chatMessages || []).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACADEMIA_STACK')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                activeTab === 'ACADEMIA_STACK'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <GraduationCap size={13} /> Academia Ed-Tech &amp; Worksheet Scanner
            </button>
          </div>
        </div>

        {/* TAB: GOOGLE FORMS/DOCS & PDF → INTERACTIVE TELA + MASTERY */}
        {activeTab === 'CLASSROOM_CLUB' && (
          <SharedClassroomClubHub
            classId={p.classroomId || `church_cls_${p.id}`}
            className={p.name}
            classSubtitle={`${KIND_LABEL[p.kind]} · ${p.ageBand || 'All Ages'} · ${p.meetingSchedule || church.name}`}
            contextKind="CHRISTIAN_EDUCATION"
            teacherUid={teacherProfile.uid}
            teacherName={p.leadInstructor || teacherProfile.displayName}
            isTeacher={canEdit}
            currentUserUid={teacherProfile.uid}
            currentUserName={teacherProfile.displayName}
          />
        )}
        {activeTab === 'TELA_UNITS' && (
          <CurriculumAndMasteryStudio
            orgId={church.id}
            orgName={church.name}
            canEdit={canEdit}
            currentUserUid={teacherProfile.uid}
            currentUserName={teacherProfile.displayName}
            programs={programs || [p]}
            selectedProgramId={p.id}
            onAttachWeeksToProgram={handleAttachIngestedUnitToProgram}
          />
        )}

        {/* TAB 1: WEEKLY LECTIO SYLLABUS */}
        {activeTab === 'SYLLABUS' && (
          <div className="space-y-2.5">
            {p.weeks.map((w, i) => {
              const ok = !!parseRef(w.passage.trim());
              return (
                <div
                  key={w.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2"
                >
                  {canEdit ? (
                    <div className="grid gap-2">
                      <div className="flex gap-2">
                        <span className="text-[11px] font-black text-amber-300/80 pt-2.5 w-16">
                          Week {i + 1}
                        </span>
                        <input
                          aria-label={`Week ${i + 1} title`}
                          value={w.title}
                          onChange={e => setWeek(i, { title: e.target.value })}
                          className={field}
                          placeholder="Lesson title"
                        />
                        <button
                          type="button"
                          aria-label={`Remove week ${i + 1}`}
                          onClick={() => set({ weeks: p.weeks.filter((_, j) => j !== i) })}
                          className="px-2 text-white/40 hover:text-rose-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        aria-label={`Week ${i + 1} passage`}
                        value={w.passage}
                        onChange={e => setWeek(i, { passage: e.target.value })}
                        className={`${field} ${w.passage && !ok ? 'border-amber-400/60' : ''}`}
                        placeholder="Passage, e.g. Luke 15:11-32"
                      />
                      {w.passage && !ok && (
                        <p className="text-[11px] text-amber-300">
                          Verse can&apos;t read this passage yet. Check the book name and chapter:verse.
                        </p>
                      )}
                      <textarea
                        aria-label={`Week ${i + 1} notes`}
                        value={w.note}
                        onChange={e => setWeek(i, { note: e.target.value })}
                        rows={2}
                        className={`${field} resize-none`}
                        placeholder="Teacher notes and discussion questions"
                      />
                      <input
                        aria-label={`Week ${i + 1} library reading`}
                        value={w.library || ''}
                        onChange={e => setWeek(i, { library: e.target.value })}
                        className={field}
                        placeholder="Sacred Library reading (optional): a hymn, prayer, early text"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-300/80">
                        Week {i + 1}
                      </p>
                      <p className="font-black text-base" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {w.title}
                      </p>
                      {w.note && <p className="text-xs text-white/65 mt-0.5">{w.note}</p>}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap pt-1">
                    {ok && (
                      <button
                        type="button"
                        onClick={() => openScripture(parseRef(w.passage.trim())!)}
                        className="rounded-full bg-white text-black px-3.5 py-1.5 text-[11px] font-black inline-flex items-center gap-1.5"
                      >
                        <BookOpen size={12} /> Read {w.passage} in Verse
                      </button>
                    )}
                    {w.library && (
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SACRED_LIBRARY'))}
                        className="rounded-full border border-white/25 px-3.5 py-1.5 text-[11px] font-black inline-flex items-center gap-1.5"
                      >
                        <Library size={12} /> {w.library}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  set({
                    weeks: [
                      ...p.weeks,
                      { id: `w${Date.now().toString(36)}`, title: '', passage: '', note: '' },
                    ],
                  })
                }
                className="rounded-full border border-dashed border-white/25 px-4 py-2 text-[11px] font-black inline-flex items-center gap-1.5"
              >
                <Plus size={12} /> Add a week
              </button>
            )}
          </div>
        )}

        {/* TAB 2: DEDICATED CLASSROOM CHAT */}
        {activeTab === 'CLASS_CHAT' && (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {p.name} · Dedicated Classroom Chat
                </h3>
                <p className="text-[11px] text-white/55">
                  Governed Organization Classroom Channel (<span className="font-mono">{p.chatRoomId}</span>)
                </p>
              </div>
              {onOpenChatRoom && (
                <button
                  type="button"
                  onClick={() => onOpenChatRoom(p.chatRoomId)}
                  className="px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                  <ExternalLink size={12} /> Open Full Room in Plajah Chat
                </button>
              )}
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {(p.chatMessages || []).length === 0 && (
                <p className="text-xs text-white/45">No messages yet.</p>
              )}
              {(p.chatMessages || []).map(m => (
                <div
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{m.senderName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 text-[9px] font-bold uppercase">
                        {m.senderRole}
                      </span>
                    </div>
                    <span className="text-white/40 font-mono text-[10px]">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed">{m.text}</p>
                  {m.attachmentLabel && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-[11px] mt-1">
                      <FileText size={11} /> {m.attachmentLabel}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-2 pt-2 border-t border-white/10">
              <select
                aria-label="Sender role"
                value={chatSenderRole}
                onChange={e => setChatSenderRole(e.target.value as any)}
                className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="INSTRUCTOR">Instructor</option>
                <option value="CATECHIST">Catechist</option>
                <option value="PASTOR">Pastor</option>
                <option value="STUDENT">Student / Parent</option>
              </select>
              <input
                value={chatDraft}
                onChange={e => setChatDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                placeholder={`Post a question, memory verse, or study note to ${p.name}...`}
                className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400/60"
              />
              <button
                type="button"
                onClick={handleSendChatMessage}
                className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5"
              >
                <Send size={12} /> Post
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: ACADEMIA ED-TECH STACK (ROSTER, COURSES, WORKSHEET SCANNER, TELA) */}
        {activeTab === 'ACADEMIA_STACK' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              {/* Card 1: Academia Classroom Roster & Gradebook */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                  <Users size={14} /> Academia Classroom Roster
                </div>
                <p className="text-xs text-white/65 leading-relaxed">
                  Reuses the full Academia classroom stack: attendance, catechism progress, memory-verse mastery, and parent records.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const updated = await attachClassroom(church, p);
                      setOpen(updated);
                      setBusy(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white text-black text-[11px] font-black inline-flex items-center gap-1.5"
                  >
                    <Users size={12} /> {p.classroomId ? 'Sync Academia Roster' : 'Create Class Roster'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalMode('TEACHER_DASHBOARD')}
                    className="px-3 py-1.5 rounded-xl border border-white/20 text-white text-[11px] font-bold"
                  >
                    Teacher Dashboard
                  </button>
                </div>
              </div>

              {/* Card 2: Paper Worksheet Digitizer */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <FileScan size={14} /> Scan Paper Sunday School Sheet
                </div>
                <p className="text-xs text-white/65 leading-relaxed">
                  Photograph or upload any paper Sunday School handout or Bible study worksheet to convert it into fillable digital prompts.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleScanPaperWorksheet(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={scanningWorksheet}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-400 text-black text-[11px] font-black inline-flex items-center gap-1.5"
                >
                  {scanningWorksheet ? <Loader2 size={12} className="animate-spin" /> : <FileScan size={12} />}
                  {scanningWorksheet ? 'Scanning Worksheet...' : 'Scan Paper Worksheet'}
                </button>
              </div>

              {/* Card 3: Tela Lesson & Assignment Builder */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                  <Sparkles size={14} /> Tela Lesson &amp; Study Guide
                </div>
                <p className="text-xs text-white/65 leading-relaxed">
                  Open this classroom&apos;s entire weekly syllabus and discussion prompts as an interactive Tela document.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenLessonInTela(p)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-400 text-black text-[11px] font-black inline-flex items-center gap-1.5"
                >
                  <Sparkles size={12} /> Open Lesson in Tela
                </button>
              </div>
            </div>

            {/* Scanned Fillable Worksheet Preview */}
            {scannedWorksheet && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      Academia Digitized Fillable Worksheet
                    </p>
                    <h4 className="text-sm font-black text-white">{scannedWorksheet.title}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannedWorksheet(null)}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-2">
                  {(scannedWorksheet.segments || []).map(seg => (
                    <div key={seg.id} className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-white/90">{seg.text}</p>
                      {seg.kind === 'question' && (
                        <input
                          value={worksheetAnswers[seg.id] || ''}
                          onChange={e =>
                            setWorksheetAnswers(prev => ({ ...prev, [seg.id]: e.target.value }))
                          }
                          placeholder="Student response..."
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Academia Curriculum Courses */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
              <p className="text-[11px] font-black uppercase tracking-widest text-white/55">
                Attached Academia Curriculum Courses
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(canEdit ? courseOptions : courseOptions.filter(c => p.courseIds.includes(c.id))).map(c => {
                  const on = p.courseIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          courseIds: on
                            ? p.courseIds.filter(x => x !== c.id)
                            : [...p.courseIds, c.id],
                        })
                      }
                      className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${
                        on
                          ? 'bg-amber-400 text-black border-amber-300'
                          : 'border-white/15 text-white/60 hover:text-white'
                      }`}
                    >
                      {c.emoji} {c.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={busy || !p.name.trim()}
              onClick={() => persist(p)}
              className="rounded-full bg-amber-400 text-black px-5 py-2.5 text-[12px] font-black disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}{' '}
              {saved ? 'Saved Classroom' : 'Save Classroom'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('Delete this classroom program?')) {
                  await deleteProgram(p.id, church.id).catch(() => {});
                  setOpen(null);
                  reload();
                }
              }}
              className="rounded-full px-4 py-2.5 text-[12px] font-black text-rose-300 hover:bg-rose-500/10"
            >
              Delete
            </button>
          </div>
        )}
        {err && (
          <p role="alert" className="text-[12px] text-rose-300">
            {err}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {modeBar}

      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-transparent p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
            Christian Education · Powered by Academia, Tela &amp; Verse
          </p>
          <h3 className="text-lg font-black mt-0.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {church.name} — Classrooms, Teacher Studio &amp; Interactive Tela Curriculum
          </h3>
          <p className="text-xs text-white/65 mt-0.5">
            Teachers and students get the full Academia workflow (Teacher Dashboard, Gradebook Heatmap, Plan from Mastery, Student Portal) plus one-click extraction of Google Forms, Google Docs, Word docs &amp; PDFs into auto-graded interactive Tela documents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPortalMode('CURRICULUM_TELA_INGESTOR')}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center gap-1.5 shadow"
          >
            <Sparkles size={14} /> Import Google Form / Doc / PDF to Tela
          </button>
          <button
            type="button"
            onClick={() => setPortalMode('TEACHER_DASHBOARD')}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <LayoutDashboard size={14} /> Teacher Dashboard
          </button>
        </div>
      </div>

      {programs === null && <p className="text-sm text-white/40">Loading classrooms...</p>}

      {programs !== null && programs.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center space-y-1.5">
          <p className="font-black text-sm text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
            No classes yet
          </p>
          <p className="text-xs text-white/55 max-w-md mx-auto leading-relaxed">
            {canEdit
              ? 'Start your first Sunday school, Bible study or discipleship class from a template below, or import a curriculum from Google Forms, Google Docs, Word or PDF.'
              : 'When your church opens Christian Education classes, they will be listed here.'}
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {programs?.map(p => (
          <div
            key={p.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] p-4 flex flex-col justify-between gap-3 transition"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
                  {KIND_LABEL[p.kind]}
                </span>
                <span className="text-[11px] text-white/50 font-mono">{p.weeks.length} Weeks</span>
              </div>
              <h4
                className="font-black text-base text-white"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {p.name}
              </h4>
              <p className="text-xs text-white/60 line-clamp-2">{p.description}</p>
              <div className="text-[11px] text-white/50 space-y-0.5 pt-1">
                {p.ageBand && <p>👥 {p.ageBand}</p>}
                {p.meetingSchedule && <p>🗓️ {p.meetingSchedule}</p>}
                {p.leadInstructor && <p>🎓 {p.leadInstructor}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('SYLLABUS');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
              >
                <BookOpen size={12} /> Enter Classroom
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('CLASSROOM_CLUB');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-400/40 text-rose-200 hover:bg-rose-600/35 text-[11px] font-black inline-flex items-center gap-1"
              >
                <Users size={12} /> Live Lecture &amp; Club
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('TELA_UNITS');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-200 hover:bg-purple-500/30 text-[11px] font-bold inline-flex items-center gap-1"
              >
                <Sparkles size={12} /> Tela &amp; Mastery
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('CLASS_CHAT');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold inline-flex items-center gap-1"
              >
                <MessageSquare size={12} /> Chat ({(p.chatMessages || []).length})
              </button>
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/45 flex items-center gap-1.5">
            <GraduationCap size={13} /> Start a Classroom from a Template
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            {STARTERS.map(s => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => start(fromStarter(church, s.id))}
                className="text-left rounded-2xl border border-white/12 bg-white/[0.03] hover:bg-white/[0.08] p-3"
              >
                <p className="font-black text-xs text-amber-200" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {s.name}
                </p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  {s.ageBand} · {s.weeks.length} weeks
                </p>
                <p className="text-[11px] text-white/45 mt-1 line-clamp-2 leading-snug">{s.description}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {(
              [
                'sunday-school',
                'bible-study',
                'youth',
                'adult',
                'confirmation',
                'vbs',
                'discipleship',
              ] as ProgramKind[]
            ).map(k => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() =>
                  setOpen(newProgram(church, { name: `New ${KIND_LABEL[k]}`, kind: k }))
                }
                className="px-3 py-1.5 rounded-full border border-white/15 text-[11px] font-black text-white/70 hover:bg-white/10 inline-flex items-center gap-1"
              >
                <Plus size={11} /> {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[12px] text-rose-300">
          {err}
        </p>
      )}
    </div>
  );
};

export default ChurchEducation;
