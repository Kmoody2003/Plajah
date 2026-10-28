// components/desk/UniversalStudentDesk.tsx
// Universal Platform-Wide Student Desk (Powered by Tela)
// The dedicated, tactile, living workspace where students across Academia, Christian Education (Great Faith Ministries),
// and Elevate Organizations receive assigned digital worksheets/tests, fill them out with integrated study tools,
// self-check their work, and turn them in for instant auto-grading & Mastery Graph / Learner Ledger credit.

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  Palette,
  Library,
  FileText,
  Hand,
  Award,
  Columns,
  ExternalLink,
  RotateCcw,
  Check,
  AlertCircle,
  BookmarkPlus,
  Search,
  ChevronRight,
  Layers,
  GraduationCap,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import {
  ensureUniversalStudentDeskSeeded,
  listDeskAssignments,
  getAllStudentDeskWorkspaces,
  saveStudentDeskDraft,
  turnInStudentDeskAssignment,
  reopenStudentDeskAssignmentForRevision,
  type DeskContextDomain,
  type UniversalDeskAssignment,
  type StudentDeskWorkspaceState,
} from '../../services/universalStudentDeskService';
import {
  ALL_LIVING_DOCUMENT_TEMPLATES,
  DEFAULT_LIVING_TEMPLATE_ID,
  getLivingTemplateById,
  type LivingDocumentTemplate,
} from '../../services/council/livingDocumentTemplates';
import {
  matchSacredLibrarySupplementsForLesson,
  type SacredLibrarySupplementItem,
} from '../../services/sacredLibraryCurriculumBridge';
import { loadOrgMasterySummary } from '../../services/curriculumIngestionService';
import { LEVEL_NAME, LEVEL_COLOR, type SkillLevel } from '../../services/mastery';
import { openScripture } from '../scripture/ScriptureRefChip';
import { parseRef } from '../../services/scriptureRef';
import { pinResearchSource } from '../../services/sacredResearch';
import {
  GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  GREAT_FAITH_MINISTRIES_NAME,
} from '../../services/orgAssets';
import { TelaDocumentPreviewModal, type TelaDocumentPreviewProps } from '../church/TelaDocumentPreviewModal';
import { LivingTemplateBespokeRenderer } from './LivingTemplateBespokeRenderer';

export interface UniversalStudentDeskProps {
  studentUid?: string;
  studentName?: string;
  defaultDomain?: DeskContextDomain | 'ALL';
  orgId?: string;
  orgName?: string;
  classroomId?: string;
  initialAssignmentId?: string;
  onBack?: () => void;
  onOpenTelaStudio?: (telaDocId: string) => void;
  compactHeader?: boolean;
}

/** Some answers wait for the teacher's key (Christian Ed class copies carry none), so the score isn't final yet. */
const awaitingTeacher = (sub: { questionScores?: Record<string, { pending?: boolean }> }) => Object.values(sub.questionScores || {}).some(q => q.pending);

export const UniversalStudentDesk: React.FC<UniversalStudentDeskProps> = ({
  studentUid = 'student_great_faith',
  studentName = 'Student Scholar',
  defaultDomain = 'ALL',
  orgId: rawOrgId,
  orgName: rawOrgName,
  classroomId,
  initialAssignmentId,
  onBack,
  onOpenTelaStudio,
  compactHeader = false,
}) => {
  const orgId =
    !rawOrgId || rawOrgId === 'demo-grace-chapel' || rawOrgId.startsWith('demo-')
      ? GREAT_FAITH_MINISTRIES_DEFAULT_ID
      : rawOrgId;
  const orgName =
    !rawOrgName || rawOrgName.toLowerCase().includes('grace chapel') || rawOrgName.toLowerCase().includes('demo')
      ? GREAT_FAITH_MINISTRIES_NAME
      : rawOrgName;

  const [domainFilter, setDomainFilter] = useState<DeskContextDomain | 'ALL'>(defaultDomain);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TODO' | 'TURNED_IN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [assignments, setAssignments] = useState<UniversalDeskAssignment[]>(() =>
    listDeskAssignments({ domain: defaultDomain, classroomId })
  );
  const [workspaces, setWorkspaces] = useState<Record<string, StudentDeskWorkspaceState>>(() =>
    getAllStudentDeskWorkspaces(studentUid)
  );
  const [activeAssignmentId, setActiveAssignmentId] = useState<string>(initialAssignmentId || '');

  // Active Desk workspace local state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scratchpad, setScratchpad] = useState<string>('');
  const [deskTemplateOverride, setDeskTemplateOverride] = useState<string>('');
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [questionToTeacher, setQuestionToTeacher] = useState<string>('');
  const [handRaisedToast, setHandRaisedToast] = useState<string>('');

  // Desk layout & caddy controls
  const [splitReadingAndWork, setSplitReadingAndWork] = useState<boolean>(false);
  const [showTemplatePickerOnDesk, setShowTemplatePickerOnDesk] = useState<boolean>(false);
  const [activeCaddyTab, setActiveCaddyTab] = useState<'SACRED_LIBRARY' | 'SCRATCHPAD' | 'ASK_TEACHER' | 'MASTERY'>('SACRED_LIBRARY');
  const [selfCheckBanner, setSelfCheckBanner] = useState<{
    ready: boolean;
    answeredCount: number;
    totalCount: number;
    missingNumbers: number[];
  } | null>(null);
  const [turnInCelebration, setTurnInCelebration] = useState<boolean>(false);
  const [pinnedIds, setPinnedIds] = useState<Record<string, boolean>>({});
  const [telaPreviewModal, setTelaPreviewModal] = useState<Omit<TelaDocumentPreviewProps, 'isOpen' | 'onClose'> | null>(null);
  const [masteryMap, setMasteryMap] = useState(() => loadOrgMasterySummary(orgId));

  // Seed & synchronize assignments
  const refreshDesk = async () => {
    await ensureUniversalStudentDeskSeeded(orgId);
    const list = listDeskAssignments({
      domain: domainFilter,
      classroomId,
    });
    setAssignments(list);
    const wsMap = getAllStudentDeskWorkspaces(studentUid);
    setWorkspaces(wsMap);
    setMasteryMap(loadOrgMasterySummary(orgId));

    if (list.length > 0) {
      setActiveAssignmentId(prev => {
        if (initialAssignmentId && list.some(a => a.id === initialAssignmentId)) {
          return initialAssignmentId;
        }
        if (prev && list.some(a => a.id === prev)) {
          return prev;
        }
        return list[0].id;
      });
    }
  };

  useEffect(() => {
    void refreshDesk();
    const onDeskEvent = () => {
      void refreshDesk();
    };
    window.addEventListener('plajah:deskUpdated', onDeskEvent);
    return () => window.removeEventListener('plajah:deskUpdated', onDeskEvent);
  }, [orgId, domainFilter, classroomId, studentUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const ws = workspaces[a.id];
      const isDone = ws?.status === 'TURNED_IN' || ws?.status === 'RETURNED_WITH_FEEDBACK';
      if (statusFilter === 'TODO' && isDone) return false;
      if (statusFilter === 'TURNED_IN' && !isDone) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.classroomName.toLowerCase().includes(q) ||
          a.departmentFolder.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assignments, workspaces, statusFilter, searchQuery]);

  const activeAssignment: UniversalDeskAssignment | null = useMemo(() => {
    return (
      assignments.find(a => a.id === activeAssignmentId) ||
      filteredAssignments[0] ||
      assignments[0] ||
      null
    );
  }, [assignments, filteredAssignments, activeAssignmentId]);

  const activeWorkspace: StudentDeskWorkspaceState | null = useMemo(() => {
    if (!activeAssignment) return null;
    return workspaces[activeAssignment.id] || null;
  }, [activeAssignment, workspaces]);

  // Load workspace draft whenever activeAssignment changes
  useEffect(() => {
    if (!activeAssignment) return;
    const ws = workspaces[activeAssignment.id];
    setAnswers(ws?.answers || {});
    setScratchpad(ws?.scratchpadNotes || '');
    setDeskTemplateOverride(ws?.deskLivingTemplateId || DEFAULT_LIVING_TEMPLATE_ID);
    setFlaggedQuestions(ws?.flaggedQuestionIds || []);
    setQuestionToTeacher(ws?.studentQuestionToTeacher || '');
    setSelfCheckBanner(null);
    setTurnInCelebration(false);
  }, [activeAssignment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTemplate: LivingDocumentTemplate = useMemo(() => {
    const id = deskTemplateOverride || DEFAULT_LIVING_TEMPLATE_ID;
    return getLivingTemplateById(id);
  }, [deskTemplateOverride, activeAssignment?.livingTemplateId]);

  const activeSupplements: SacredLibrarySupplementItem[] = useMemo(() => {
    if (!activeAssignment) return [];
    const unit = activeAssignment.unitSnapshot;
    if (unit.sacredLibrarySupplements && unit.sacredLibrarySupplements.length > 0) {
      return unit.sacredLibrarySupplements;
    }
    return matchSacredLibrarySupplementsForLesson({
      title: unit.title,
      lessonText: unit.rawCurriculumText || unit.subtitle,
      scripturePassages: unit.lessonBlocks.map(b => b.scripturePassage || '').filter(Boolean),
      maxItems: 4,
    });
  }, [activeAssignment]);

  const handleUpdateAnswer = (questionId: string, value: string) => {
    if (!activeAssignment) return;
    const nextAnswers = { ...answers, [questionId]: value };
    setAnswers(nextAnswers);
    const saved = saveStudentDeskDraft({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers: nextAnswers,
      scratchpadNotes: scratchpad,
      deskLivingTemplateId: deskTemplateOverride || activeAssignment.livingTemplateId,
      flaggedQuestionIds: flaggedQuestions,
      studentQuestionToTeacher: questionToTeacher,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: saved }));
  };

  const handleUpdateScratchpad = (text: string) => {
    setScratchpad(text);
    if (!activeAssignment) return;
    const saved = saveStudentDeskDraft({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers,
      scratchpadNotes: text,
      deskLivingTemplateId: deskTemplateOverride || activeAssignment.livingTemplateId,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: saved }));
  };

  const handleSwitchDeskTemplate = (tplId: string) => {
    setDeskTemplateOverride(tplId);
    if (!activeAssignment) return;
    const saved = saveStudentDeskDraft({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers,
      scratchpadNotes: scratchpad,
      deskLivingTemplateId: tplId,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: saved }));
  };

  const handleSelfCheckOnDesk = () => {
    if (!activeAssignment) return;
    const questions = activeAssignment.unitSnapshot.questions;
    const missingNumbers: number[] = [];
    questions.forEach(q => {
      if (!(answers[q.id] || '').trim()) {
        missingNumbers.push(q.number);
      }
    });
    const answeredCount = questions.length - missingNumbers.length;
    setSelfCheckBanner({
      ready: missingNumbers.length === 0,
      answeredCount,
      totalCount: questions.length,
      missingNumbers,
    });

    const saved = saveStudentDeskDraft({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers,
      scratchpadNotes: scratchpad,
      deskLivingTemplateId: deskTemplateOverride || activeAssignment.livingTemplateId,
      incrementSelfCheck: true,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: saved }));
  };

  const handleTurnInFromDesk = () => {
    if (!activeAssignment) return;
    const { workspace } = turnInStudentDeskAssignment({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers,
      scratchpadNotes: scratchpad,
      deskLivingTemplateId: deskTemplateOverride || activeAssignment.livingTemplateId,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: workspace }));
    setMasteryMap(loadOrgMasterySummary(orgId));
    setTurnInCelebration(true);
    setSelfCheckBanner(null);
  };

  const handleReopenForRevision = () => {
    if (!activeAssignment) return;
    const updated = reopenStudentDeskAssignmentForRevision(studentUid, activeAssignment.id);
    if (updated) {
      setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: updated }));
      setTurnInCelebration(false);
    }
  };

  const handleSendHandRaiseToTeacher = () => {
    if (!activeAssignment || !questionToTeacher.trim()) return;
    const saved = saveStudentDeskDraft({
      studentUid,
      studentName,
      assignment: activeAssignment,
      answers,
      scratchpadNotes: scratchpad,
      flaggedQuestionIds: flaggedQuestions,
      studentQuestionToTeacher: questionToTeacher,
    });
    setWorkspaces(prev => ({ ...prev, [activeAssignment.id]: saved }));
    setHandRaisedToast(
      `Sent your question to ${activeAssignment.assignedByName}! They can see your Desk draft and respond directly.`
    );
    setTimeout(() => setHandRaisedToast(''), 4000);
  };

  const handlePinSupplement = (sup: SacredLibrarySupplementItem) => {
    try {
      pinResearchSource({
        title: `${sup.title} (${sup.dateOrEra})`,
        category: sup.categoryLabel,
        summary: `${sup.relevanceToLesson} — "${sup.excerpt}"`,
        ref: sup.scriptureAnchors[0],
      });
    } catch {
      // Non-fatal
    }
    setPinnedIds(prev => ({ ...prev, [sup.id]: true }));
  };

  // Desk KPI counts
  const deskKpis = useMemo(() => {
    let todoCount = 0;
    let inProgressCount = 0;
    let turnedInCount = 0;
    let totalScorePct = 0;
    let gradedItems = 0;

    assignments.forEach(a => {
      const ws = workspaces[a.id];
      if (!ws || ws.status === 'ASSIGNED') {
        todoCount++;
      } else if (ws.status === 'IN_PROGRESS' || ws.status === 'READY_TO_TURN_IN') {
        todoCount++;
        inProgressCount++;
      } else if (ws.status === 'TURNED_IN' || ws.status === 'RETURNED_WITH_FEEDBACK') {
        turnedInCount++;
        if (ws.submission && !awaitingTeacher(ws.submission)) {
          totalScorePct += ws.submission.percentage;
          gradedItems++;
        }
      }
    });

    const avgMasteryPct = gradedItems > 0 ? Math.round(totalScorePct / gradedItems) : null;
    return { todoCount, inProgressCount, turnedInCount, avgMasteryPct };
  }, [assignments, workspaces]);

  const isTurnedIn =
    activeWorkspace?.status === 'TURNED_IN' ||
    activeWorkspace?.status === 'RETURNED_WITH_FEEDBACK';
  const activeSubmission = activeWorkspace?.submission;

  const answeredOnActive = useMemo(() => {
    if (!activeAssignment) return 0;
    return activeAssignment.unitSnapshot.questions.filter(
      q => (answers[q.id] || '').trim().length > 0
    ).length;
  }, [activeAssignment, answers]);

  return (
    <div
      className="space-y-5 text-white"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Top Universal Plajah Student Desk Command Banner */}
      <div
        className="rounded-3xl border border-purple-500/35 p-5 shadow-2xl relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, rgba(107,0,153,0.40) 0%, rgba(212,0,85,0.25) 52%, rgba(255,140,0,0.20) 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 85% 15%, rgba(0, 218, 243, 0.16) 0%, transparent 55%)',
          }}
        />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-black text-white"
                >
                  ← Back
                </button>
              )}
              <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/45 text-amber-200 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                <Sparkles size={12} /> Universal Platform-Wide Student Desk · Powered by Tela
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-[10px] font-black uppercase">
                Academia × {orgName} · Christian Education
              </span>
            </div>

            {!compactHeader && (
              <>
                <h2
                  className="text-xl sm:text-2xl font-black text-white tracking-tight"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  🪑 {studentName}&apos;s Digital Study Desk &amp; Worksheet Blotter
                </h2>
                <p className="text-xs text-white/75 leading-relaxed">
                  Your personal, living workspace across every class on Plajah. Open any assigned worksheet, quiz, or exam on your <strong>Tela Desk Blotter</strong>, consult attached <strong>Lorea Sacred Library primary sources</strong> or notes in your Desk Caddy, self-check your work, and click <strong>Turn In</strong> for instant auto-grading and Mastery Graph credit.
                </p>
              </>
            )}
          </div>

          {/* Desk KPI Pills */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="rounded-2xl border border-amber-400/35 bg-black/45 px-3.5 py-2 text-center">
              <div className="text-base font-black text-amber-300">{deskKpis.todoCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                On My Desk
              </div>
            </div>
            <div className="rounded-2xl border border-purple-400/35 bg-black/45 px-3.5 py-2 text-center">
              <div className="text-base font-black text-purple-300">{deskKpis.inProgressCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                Drafts Saved
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-400/35 bg-black/45 px-3.5 py-2 text-center">
              <div className="text-base font-black text-emerald-300">{deskKpis.turnedInCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                Turned In
              </div>
            </div>
            {deskKpis.avgMasteryPct !== null && (
              <div className="rounded-2xl border border-cyan-400/35 bg-black/45 px-3.5 py-2 text-center">
                <div className="text-base font-black text-cyan-300">{deskKpis.avgMasteryPct}%</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Avg Score
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desk Domain & Status Filter Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mt-4 pt-3.5 border-t border-white/15">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: '🌐 All My Classes (Universal)' },
                { id: 'CHRISTIAN_EDUCATION', label: `🏛️ ${orgName} · Christian Education` },
                { id: 'ACADEMIA', label: '🎓 Plajah Academia' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDomainFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                  domainFilter === tab.id
                    ? 'bg-white text-black shadow-lg'
                    : 'bg-black/40 text-white/75 hover:text-white border border-white/12'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'TODO', 'TURNED_IN'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  statusFilter === st
                    ? 'bg-amber-400 text-black font-black'
                    : 'bg-black/40 text-white/65 hover:text-white border border-white/12'
                }`}
              >
                {st === 'ALL' ? 'All Items' : st === 'TODO' ? '⚡ To Do on Desk' : '✅ Turned In'}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowTemplatePickerOnDesk(v => !v)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 border transition ${
                showTemplatePickerOnDesk
                  ? 'bg-purple-500 text-white border-purple-300 shadow'
                  : 'bg-black/45 border-purple-400/40 text-purple-200 hover:bg-purple-500/20'
              }`}
            >
              <Palette size={13} /> Desk Surface &amp; Lamp ({activeTemplate.badgeEmoji} {activeTemplate.name})
            </button>
          </div>
        </div>

        {/* Collapsible 10-Living-Template Desk Blotter Customizer */}
        {showTemplatePickerOnDesk && (
          <div className="relative z-10 mt-3 pt-3 border-t border-white/15 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black text-amber-300 uppercase tracking-wider">
                Personalize Your Desk Blotter Surface (6 Living Worksheets + 4 Living Test Designs)
              </span>
              <span className="text-white/60">
                Co-designed by the Art Council, Gaming Council, Education Council &amp; Lighting Director
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ALL_LIVING_DOCUMENT_TEMPLATES.map(tpl => {
                const isSel = tpl.id === activeTemplate.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSwitchDeskTemplate(tpl.id)}
                    className={`text-left p-2.5 rounded-2xl border transition-all flex flex-col justify-between gap-1 ${
                      isSel
                        ? 'border-amber-300 ring-2 ring-amber-400/40 scale-[1.02]'
                        : 'border-white/15 opacity-80 hover:opacity-100'
                    }`}
                    style={{ background: tpl.surfaceGradient }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-white truncate">
                        {tpl.badgeEmoji} {tpl.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-200/90 font-semibold truncate">
                      {tpl.progressArtifactLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main 3-Zone Universal Student Desk Layout */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* LEFT DESK TRAY (3 Cols): Assigned Worksheets, Quizzes & Tests Stack */}
        <div className="lg:col-span-3 rounded-3xl border border-white/12 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
              <Layers size={13} /> My Desk Tray ({filteredAssignments.length})
            </h3>
            <span className="text-[10px] font-bold text-white/50">Auto-Synced</span>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-2.5 text-white/40" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter worksheets or classes..."
              className="w-full bg-black/50 border border-white/12 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
            />
          </div>

          <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {filteredAssignments.map(item => {
              const isSelected = activeAssignment?.id === item.id;
              const ws = workspaces[item.id];
              const tpl = getLivingTemplateById(ws?.deskLivingTemplateId || item.livingTemplateId);
              const qCount = item.unitSnapshot.questions.length;
              const ansCount = item.unitSnapshot.questions.filter(
                q => (ws?.answers?.[q.id] || '').trim().length > 0
              ).length;
              const pct = qCount > 0 ? Math.round((ansCount / qCount) * 100) : 0;
              const turnedIn =
                ws?.status === 'TURNED_IN' || ws?.status === 'RETURNED_WITH_FEEDBACK';

              return (
                <div
                  key={item.id}
                  onClick={() => setActiveAssignmentId(item.id)}
                  className={`rounded-2xl border p-3 cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 shadow-lg'
                      : 'border-white/10 bg-black/40 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        item.domain === 'CHRISTIAN_EDUCATION'
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                          : 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                      }`}
                    >
                      {item.domain === 'CHRISTIAN_EDUCATION' ? '🏛️ Christian Ed' : '🎓 Academia'}
                    </span>

                    {turnedIn ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-black uppercase">
                        ✓ Turned In {ws?.submission && !awaitingTeacher(ws.submission) ? `· ${ws.submission.percentage}%` : ''}
                      </span>
                    ) : ansCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-200 text-[9px] font-black uppercase">
                        Draft · {ansCount}/{qCount}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-[9px] font-bold">
                        New on Desk
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-black text-white leading-snug">{item.title}</p>
                    <p className="text-[10px] text-white/55 truncate mt-0.5">
                      {item.classroomName}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-amber-200/90 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} /> {item.dueLabel}
                    </span>
                    <span>
                      {tpl.badgeEmoji} {item.totalPoints} pts
                    </span>
                  </div>

                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${turnedIn ? 100 : Math.max(6, pct)}%`,
                        background: turnedIn ? '#34D399' : tpl.accentGradient,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER DESK BLOTTER (6 Cols): The Living Tela Worksheet & Turn-In Surface */}
        {activeAssignment && (
          <div className="lg:col-span-6 space-y-4">
            <div
              className="rounded-3xl border-2 p-5 sm:p-6 space-y-5 relative overflow-hidden transition-all duration-500"
              style={{
                background: activeTemplate.surfaceGradient,
                borderColor: activeTemplate.cardBorder,
                boxShadow: `0 24px 64px -16px ${activeTemplate.ambientGlowColor}`,
              }}
            >
              {/* Volumetric Lighting Director Sheen */}
              <div
                className="pointer-events-none absolute inset-0 opacity-85"
                style={{ background: activeTemplate.lightingOverlay }}
              />

              {/* Desk Worksheet Header */}
              <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/15 pb-4">
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-black shadow"
                      style={{ background: activeTemplate.accentGradient }}
                    >
                      {activeTemplate.badgeEmoji} {activeTemplate.name}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/50 border border-white/15 text-emerald-200 text-[10px] font-bold">
                      {activeAssignment.classroomName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-bold">
                      📅 {activeAssignment.dueLabel}
                    </span>
                  </div>

                  <h3
                    className="text-lg sm:text-xl font-black text-white leading-snug"
                    style={{ fontFamily: activeTemplate.headingFont }}
                  >
                    {activeAssignment.title}
                  </h3>
                  <p className="text-xs text-white/75 leading-relaxed">
                    {activeAssignment.instructions}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSplitReadingAndWork(v => !v)}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-black inline-flex items-center gap-1 transition ${
                      splitReadingAndWork
                        ? 'bg-amber-400 text-black border-amber-200'
                        : 'bg-black/45 border-white/15 text-white/80 hover:text-white'
                    }`}
                  >
                    <Columns size={12} /> {splitReadingAndWork ? 'Stacked View' : 'Split Reading & Work'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const u = activeAssignment.unitSnapshot;
                      setTelaPreviewModal({
                        title: u.title,
                        telaDocId: u.telaDocId,
                        unit: u,
                        originalUrl: u.sourceUrl,
                        originalText: u.rawCurriculumText,
                        answerKeyText: u.rawAnswerKeyText,
                        orgName: activeAssignment.orgName,
                        departmentFolder: activeAssignment.departmentFolder,
                        onOpenFullTelaStudio: onOpenTelaStudio,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-black/45 hover:bg-black/65 border border-white/15 text-[11px] font-bold text-emerald-200 inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> Inspect Tela Frames
                  </button>
                </div>
              </div>

              {/* Official Turn-In Receipt & Auto-Graded Mastery Banner (Shown when Turned In) */}
              {isTurnedIn && activeSubmission && (
                <div className="relative z-10 rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/15 p-4 space-y-3 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-emerald-300 shrink-0" />
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider text-emerald-200">
                          Official Plajah Desk Turn-In Receipt · Auto-Graded &amp; Recorded
                        </div>
                        <h4 className="text-sm font-black text-white">
                          {awaitingTeacher(activeSubmission) ? 'Score comes back after your teacher checks it' : <>Score: {activeSubmission.earnedPoints} / {activeSubmission.totalPoints} Pts ({activeSubmission.percentage}%)</>}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-black/50 border border-emerald-300/40 text-emerald-200 text-xs font-bold">
                        ✓ Mastery Graph &amp; Learner Ledger Updated
                      </span>
                      <button
                        type="button"
                        onClick={handleReopenForRevision}
                        className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-black text-white inline-flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Reopen on Desk to Revise
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-white/85 leading-relaxed">
                    Great work, <strong>{studentName}</strong>! Your completed Tela worksheet has been turned in to{' '}
                    <strong>{activeAssignment.assignedByName}</strong> in <strong>{activeAssignment.classroomName}</strong>. Review the unlocked Answer Key &amp; Exegetical Rubric notes under each question below.
                  </p>
                </div>
              )}

              {/* Living Progress Artifact Bar on the Desk Blotter */}
              <div className="relative z-10 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    {activeTemplate.progressArtifactLabel}:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeAssignment.unitSnapshot.questions.map((q, idx) => {
                      const hasAns = Boolean((answers[q.id] || '').trim());
                      const qScore = activeSubmission?.questionScores?.[q.id];
                      return (
                        <span
                          key={q.id}
                          className={`px-2.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 border transition-all ${
                            qScore
                              ? qScore.correct
                                ? 'bg-emerald-400 text-black border-emerald-200 scale-105 shadow'
                                : 'bg-amber-400/30 text-amber-100 border-amber-300/50'
                              : hasAns
                              ? 'bg-amber-300 text-black border-amber-100 scale-105 shadow'
                              : 'bg-white/5 text-white/45 border-white/15'
                          }`}
                        >
                          {qScore?.correct ? '✓' : hasAns ? activeTemplate.badgeEmoji : `Q${idx + 1}`}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <span className="text-xs text-emerald-300 font-semibold">
                  {isTurnedIn
                    ? '✓ Turned In & Locked'
                    : `✓ Auto-saved to Tela Desk (${answeredOnActive}/${activeAssignment.unitSnapshot.questions.length} answered)`}
                </span>
              </div>

              {/* Pre-Submit Self-Check Result Banner */}
              {selfCheckBanner && !isTurnedIn && (
                <div
                  className={`relative z-10 rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                    selfCheckBanner.ready
                      ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                      : 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {selfCheckBanner.ready ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-300 shrink-0" />
                        <span>
                          Desk Self-Check Complete: All {selfCheckBanner.totalCount} prompts are filled out and ready to turn in!
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={16} className="text-amber-300 shrink-0" />
                        <span>
                          Desk Self-Check: You have answered {selfCheckBanner.answeredCount} of {selfCheckBanner.totalCount} questions. Still blank: Q{selfCheckBanner.missingNumbers.join(', Q')}.
                        </span>
                      </>
                    )}
                  </div>
                  {selfCheckBanner.ready && (
                    <button
                      type="button"
                      onClick={handleTurnInFromDesk}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-400 text-black font-black shadow"
                    >
                      Turn In Now →
                    </button>
                  )}
                </div>
              )}

              {/* Desk Content Area: Bespoke Art-Council Architectural Canvas (Default) OR Side-by-Side Split Reading + Work */}
              {!splitReadingAndWork ? (
                <div className="relative z-10">
                  <LivingTemplateBespokeRenderer
                    templateId={activeTemplate.id}
                    unit={activeAssignment.unitSnapshot}
                    answers={answers}
                    onUpdateAnswer={handleUpdateAnswer}
                    supplements={activeSupplements}
                    isTurnedIn={isTurnedIn}
                    submission={activeSubmission}
                    showAnswerKey={isTurnedIn}
                    flaggedQuestionIds={flaggedQuestions}
                    onToggleFlagQuestion={(qId: string) => {
                      const isFlagged = flaggedQuestions.includes(qId);
                      const next = isFlagged
                        ? flaggedQuestions.filter(id => id !== qId)
                        : [...flaggedQuestions, qId];
                      setFlaggedQuestions(next);
                      setActiveCaddyTab('ASK_TEACHER');
                    }}
                  />
                </div>
              ) : (
                <div className="relative z-10 grid gap-4 md:grid-cols-12 items-start">
                  {/* Frame 1: Lesson Reading & Scripture Passages */}
                  {activeAssignment.unitSnapshot.lessonBlocks.length > 0 && (
                    <div className="md:col-span-5 sticky top-4 rounded-2xl border border-white/15 bg-black/45 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <BookOpen size={13} /> Frame 1 · Lesson Reading &amp; Scripture
                        </span>
                        <span className="text-[10px] text-white/50">Tela Reader</span>
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {activeAssignment.unitSnapshot.lessonBlocks.map(b => {
                          const parsed = b.scripturePassage ? parseRef(b.scripturePassage) : null;
                          return (
                            <div key={b.id} className="text-xs leading-relaxed">
                              {b.kind === 'h1' || b.kind === 'h2' ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                  <h5
                                    className="font-black text-sm text-white"
                                    style={{ fontFamily: activeTemplate.headingFont }}
                                  >
                                    {b.text}
                                  </h5>
                                  {parsed && (
                                    <button
                                      type="button"
                                      onClick={() => openScripture(parsed)}
                                      className="px-2.5 py-1 rounded-full bg-amber-400 text-black text-[10px] font-black inline-flex items-center gap-1"
                                    >
                                      <BookOpen size={10} /> Open {b.scripturePassage}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <p
                                  className="text-white/85 leading-relaxed"
                                  style={{ fontFamily: activeTemplate.bodyFont }}
                                >
                                  {b.text}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Frame 2: Interactive Fillable Worksheet Questions */}
                  <div
                    className={`${
                      activeAssignment.unitSnapshot.lessonBlocks.length > 0
                        ? 'md:col-span-7'
                        : 'md:col-span-12'
                    } space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                        <GraduationCap size={14} /> Frame 2 · Fillable Tela Worksheet ({activeAssignment.unitSnapshot.questions.length} Prompts · {activeAssignment.totalPoints} Pts)
                      </span>
                    </div>

                    {activeAssignment.unitSnapshot.questions.map(q => {
                      const val = answers[q.id] || '';
                      const qResult = activeSubmission?.questionScores?.[q.id];
                      const parsedPassage = q.scripturePassage ? parseRef(q.scripturePassage) : null;
                      const isFlagged = flaggedQuestions.includes(q.id);

                      return (
                        <div
                          key={q.id}
                          className={`rounded-2xl border p-4 space-y-3 transition-all ${
                            qResult
                              ? qResult.correct
                                ? 'border-emerald-400/55 bg-emerald-500/10'
                                : 'border-amber-400/55 bg-amber-500/10'
                              : val.trim()
                              ? 'border-amber-300/45 bg-black/55'
                              : 'border-white/15 bg-black/45'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p
                              className="text-xs sm:text-sm font-bold text-white leading-relaxed flex-1"
                              style={{ fontFamily: activeTemplate.bodyFont }}
                            >
                              <span className="text-amber-300 font-black mr-1.5">Q{q.number}.</span>
                              {q.prompt}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {parsedPassage && (
                                <button
                                  type="button"
                                  onClick={() => openScripture(parsedPassage)}
                                  className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold"
                                >
                                  📖 {q.scripturePassage}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = isFlagged
                                    ? flaggedQuestions.filter(id => id !== q.id)
                                    : [...flaggedQuestions, q.id];
                                  setFlaggedQuestions(next);
                                  setActiveCaddyTab('ASK_TEACHER');
                                }}
                                title="Raise hand / ask teacher about this question"
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border ${
                                  isFlagged
                                    ? 'bg-pink-500/30 border-pink-400 text-pink-200'
                                    : 'bg-white/5 border-white/15 text-white/55 hover:text-white'
                                }`}
                              >
                                <Hand size={10} /> {isFlagged ? 'Flagged' : 'Help'}
                              </button>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-white/75">
                                {q.points} {q.points === 1 ? 'pt' : 'pts'}
                              </span>
                            </div>
                          </div>

                          {/* Interactive Input Control */}
                          {q.options && q.options.length > 0 ? (
                            <div className="grid sm:grid-cols-2 gap-2">
                              {q.options.map(opt => {
                                const selected =
                                  val === opt || val === opt.match(/^([A-F])\)/i)?.[1];
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    disabled={isTurnedIn}
                                    onClick={() => handleUpdateAnswer(q.id, opt)}
                                    className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                      selected
                                        ? 'text-black font-black shadow-md scale-[1.01]'
                                        : 'bg-black/45 border-white/15 text-white/85 hover:bg-white/10'
                                    } ${isTurnedIn ? 'cursor-default' : ''}`}
                                    style={
                                      selected
                                        ? {
                                            background: activeTemplate.accentGradient,
                                            borderColor: '#FFFFFF',
                                          }
                                        : undefined
                                    }
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <textarea
                              rows={3}
                              disabled={isTurnedIn}
                              value={val}
                              onChange={e => handleUpdateAnswer(q.id, e.target.value)}
                              placeholder="Write your response, textual evidence, or Scripture reflection on your Desk..."
                              className="w-full bg-black/55 border border-white/15 rounded-xl p-3 text-xs text-white leading-relaxed outline-none focus:border-amber-400 disabled:opacity-75"
                            />
                          )}

                          {/* Post-Turn-In Auto-Grade & Answer Key Rubric Feedback */}
                          {isTurnedIn && qResult && (
                            <div className="rounded-xl bg-black/60 border border-white/15 p-3 text-xs space-y-1">
                              <div className="flex items-center justify-between font-black">
                                <span
                                  className={
                                    qResult.correct ? 'text-emerald-300' : 'text-amber-300'
                                  }
                                >
                                  {qResult.pending
                                    ? 'Waiting for your teacher to check this one'
                                    : qResult.correct
                                    ? `✓ Correct (+${qResult.earnedPoints}/${qResult.maxPoints} pts)`
                                    : `✦ Reviewed (+${qResult.earnedPoints}/${qResult.maxPoints} pts)`}
                                </span>
                                <span className="text-[10px] text-white/55">
                                  Answer Key &amp; Rubric
                                </span>
                              </div>
                              {(q.correctAnswer || qResult?.expected) && (
                                <p className="text-emerald-200/95">
                                  <strong>Expected Answer:</strong> {q.correctAnswer || qResult?.expected}
                                </p>
                              )}
                              {q.explanation && (
                                <p className="text-white/75 leading-relaxed">
                                  <strong>Explanation:</strong> {q.explanation}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Official Student Desk Action Footer (Self-Check + Turn In) */}
              <div className="relative z-10 rounded-2xl border border-white/15 bg-black/55 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-300" />
                    {isTurnedIn
                      ? 'Worksheet Turned In — Recorded in Classroom Gradebook & Mastery Graph'
                      : `Ready to submit? (${answeredOnActive}/${activeAssignment.unitSnapshot.questions.length} prompts completed)`}
                  </div>
                  <p className="text-[11px] text-white/60">
                    {isTurnedIn
                      ? 'You can reopen this worksheet anytime on your Desk to revise your answers.'
                      : 'Your draft is automatically saved on your Tela Desk. Run Self-Check or click Turn In when finished.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isTurnedIn ? (
                    <>
                      {activeAssignment.toolsConfig.allowSelfCheckBeforeTurnIn && (
                        <button
                          type="button"
                          onClick={handleSelfCheckOnDesk}
                          className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-black text-amber-200 inline-flex items-center gap-1.5"
                        >
                          <Check size={13} /> Self-Check My Work
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleTurnInFromDesk}
                        className="px-5 py-2.5 rounded-full text-xs font-black text-black shadow-xl inline-flex items-center gap-1.5 transition hover:opacity-95"
                        style={{ background: activeTemplate.accentGradient }}
                      >
                        <Send size={13} /> Turn In Assignment to Teacher
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReopenForRevision}
                      className="px-4 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5 shadow"
                    >
                      <RotateCcw size={13} /> Reopen on Desk to Revise
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT DESK CADDY (3 Cols): Sacred Library Drawer, Scratchpad, Ask Teacher & Mastery */}
        {activeAssignment && (
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h4 className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                  <Wand2 size={13} /> Student Desk Caddy
                </h4>
                <span className="text-[10px] font-bold text-purple-300">Powered by Tela</span>
              </div>

              {/* Caddy Tab Switcher */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveCaddyTab('SACRED_LIBRARY')}
                  className={`px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 transition ${
                    activeCaddyTab === 'SACRED_LIBRARY'
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-black/40 text-white/70 hover:text-white border border-white/10'
                  }`}
                >
                  <Library size={12} /> Sources ({activeSupplements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCaddyTab('SCRATCHPAD')}
                  className={`px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 transition ${
                    activeCaddyTab === 'SCRATCHPAD'
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-black/40 text-white/70 hover:text-white border border-white/10'
                  }`}
                >
                  <FileText size={12} /> Scratchpad
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCaddyTab('ASK_TEACHER')}
                  className={`px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 transition ${
                    activeCaddyTab === 'ASK_TEACHER'
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-black/40 text-white/70 hover:text-white border border-white/10'
                  }`}
                >
                  <Hand size={12} /> Ask Teacher
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCaddyTab('MASTERY')}
                  className={`px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 transition ${
                    activeCaddyTab === 'MASTERY'
                      ? 'bg-amber-400 text-black shadow'
                      : 'bg-black/40 text-white/70 hover:text-white border border-white/10'
                  }`}
                >
                  <Award size={12} /> My Mastery
                </button>
              </div>

              {/* TAB 1: LOREA SACRED LIBRARY & PRIMARY SOURCES DRAWER */}
              {activeCaddyTab === 'SACRED_LIBRARY' && (
                <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                  <p className="text-[11px] text-white/65 leading-relaxed">
                    Primary manuscripts, Church Fathers &amp; historical artifacts attached to this worksheet:
                  </p>
                  {activeSupplements.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-white/60">
                      Use the Frame 1 reading passage on your Desk Blotter to cite textual evidence for each prompt.
                    </div>
                  ) : (
                    activeSupplements.map(sup => {
                      const pinned = Boolean(pinnedIds[sup.id]);
                      return (
                        <div
                          key={sup.id}
                          className="rounded-2xl border border-amber-400/25 bg-black/45 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[9px] font-black uppercase">
                              {sup.badgeEmoji} {sup.categoryLabel}
                            </span>
                            <span className="text-[9px] font-mono text-white/50">
                              {sup.dateOrEra}
                            </span>
                          </div>
                          <p className="text-xs font-black text-white">{sup.title}</p>
                          <p className="text-[11px] text-white/70 leading-relaxed">
                            {sup.relevanceToLesson}
                          </p>
                          <div className="rounded-xl bg-black/60 border border-white/10 p-2.5 text-[11px] text-amber-100/90 italic leading-relaxed">
                            &ldquo;{sup.excerpt}&rdquo;
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePinSupplement(sup)}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-[10px] font-black inline-flex items-center justify-center gap-1 transition ${
                              pinned
                                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                                : 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/35'
                            }`}
                          >
                            <BookmarkPlus size={11} />
                            {pinned ? 'Pinned to Sacred Notebook' : 'Pin to Sacred Notebook'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: TELA DESK SCRATCHPAD & MARGIN NOTES */}
              {activeCaddyTab === 'SCRATCHPAD' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-200">Personal Desk Margin Notes</span>
                    <span className="text-emerald-300">✓ Auto-saved</span>
                  </div>
                  <textarea
                    rows={12}
                    value={scratchpad}
                    onChange={e => handleUpdateScratchpad(e.target.value)}
                    placeholder="Jot down verse cross-references, inductive outlines, rough math work, or study notes right on your Desk..."
                    className="w-full bg-black/55 border border-white/15 rounded-2xl p-3 text-xs text-white leading-relaxed outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {/* TAB 3: DIGITAL HAND-RAISE / ASK TEACHER */}
              {activeCaddyTab === 'ASK_TEACHER' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-white/70 leading-relaxed">
                    Stuck on a prompt? Raise your hand digitally and send a note to{' '}
                    <strong>{activeAssignment.assignedByName}</strong>.
                  </p>
                  {flaggedQuestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {flaggedQuestions.map(qId => {
                        const qObj = activeAssignment.unitSnapshot.questions.find(
                          item => item.id === qId
                        );
                        return (
                          <span
                            key={qId}
                            className="px-2.5 py-0.5 rounded-full bg-pink-500/25 border border-pink-400/40 text-pink-200 text-[10px] font-bold"
                          >
                            ✋ Question {qObj?.number || ''} Flagged
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <textarea
                    rows={5}
                    value={questionToTeacher}
                    onChange={e => setQuestionToTeacher(e.target.value)}
                    placeholder="Ask your teacher for clarification or a hint on a specific question..."
                    className="w-full bg-black/55 border border-white/15 rounded-2xl p-3 text-xs text-white outline-none focus:border-pink-400"
                  />
                  <button
                    type="button"
                    onClick={handleSendHandRaiseToTeacher}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-xs font-black text-white shadow-lg inline-flex items-center justify-center gap-1.5"
                  >
                    <Hand size={13} /> Raise Hand &amp; Send to Teacher
                  </button>
                  {handRaisedToast && (
                    <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-2.5 text-[11px] text-emerald-200">
                      {handRaisedToast}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: MY MASTERY SKILL GRAPH */}
              {activeCaddyTab === 'MASTERY' && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-white/65">
                    Skills measured by this worksheet on your Plajah Mastery Graph:
                  </p>
                  {activeAssignment.unitSnapshot.masterySkills.map(sk => {
                    const rec = masteryMap[sk.id];
                    const lvl: SkillLevel = rec?.level ?? (isTurnedIn ? 3 : 0);
                    const pct = (lvl / 4) * 100;
                    return (
                      <div
                        key={sk.id}
                        className="rounded-2xl border border-white/10 bg-black/45 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{sk.title}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                            style={{
                              backgroundColor: `${LEVEL_COLOR[lvl]}22`,
                              color: LEVEL_COLOR[lvl],
                              border: `1px solid ${LEVEL_COLOR[lvl]}55`,
                            }}
                          >
                            {LEVEL_NAME[lvl]}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(10, pct)}%`,
                              background: LEVEL_COLOR[lvl],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tela Split-View Preview Modal */}
      {telaPreviewModal && (
        <TelaDocumentPreviewModal
          isOpen={Boolean(telaPreviewModal)}
          onClose={() => setTelaPreviewModal(null)}
          {...telaPreviewModal}
        />
      )}
    </div>
  );
};

export default UniversalStudentDesk;
