// components/church/OrgLessonLibraryHub.tsx
// Unified Lesson Library for Christian Education & Academia Teacher Studio.
//
// Core Rules Enforced:
// 1. Whenever a Christian Education Teacher (INSTRUCTOR), Department Admin (DEPARTMENT_ADMIN),
//    Department Head (DEPARTMENT_HEAD), or regular Teacher (TEACHER) uploads assignments,
//    syllabi, or course resources — OR extracts them from links (Google Docs, Google Forms)
//    and PDFs/Word docs — they automatically go into this Lesson Library (and mirror into
//    Content HQ under the organization's Christian Education folder).
// 2. Every item in the Lesson Library clearly surfaces the ORIGINAL SOURCE DOCUMENT that it
//    was extracted from (with full text inspection + direct source link) alongside the
//    Interactive Tela Lesson/Assignment.
// 3. Answer Keys (`ANSWER_KEY` documents and companion answer keys) are STRICTLY gated to:
//      - Course Teachers / Instructors (`INSTRUCTOR` or `TEACHER` or course `leadInstructor`)
//      - Department Heads (`DEPARTMENT_HEAD` or `ministry.headUids`)
//      - Department Administrators (`DEPARTMENT_ADMIN`)
//      - Organization Owners / Pastors (`SENIOR_PASTOR`, `PASTOR`, `ADMIN`)
//    Students, regular congregation members, and general volunteers never see Answer Keys.

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  Sparkles,
  Upload,
  Link2,
  KeyRound,
  Lock,
  ShieldCheck,
  ExternalLink,
  Eye,
  Layers,
  CheckCircle2,
  Search,
  FolderOpen,
  GraduationCap,
  Plus,
  X,
  Loader2,
  Trash2,
  Columns,
  ScrollText,
} from 'lucide-react';
import {
  listIngestedUnits,
  ensureAllDetectedLinksOnboarded,
  ingestCurriculumToTela,
  deleteIngestedUnit,
  REVELATION_2_COURSE_CONNECTION_PRESET,
  type IngestedCurriculumUnit,
  type LessonLibraryCategory,
} from '../../services/curriculumIngestionService';
import type { ChurchProgram } from '../../services/churchEducationService';
import {
  getOrgEducationFolderName,
  isStandaloneTeacherScopeId,
  TEACHER_DOCUMENT_CLASS_FOLDERS,
} from '../../services/orgAssets';
import { TelaDocumentPreviewModal } from './TelaDocumentPreviewModal';
import { AssignToClassModal } from '../desk/AssignToClassModal';

export interface OrgLessonLibraryHubProps {
  orgId: string;
  orgName: string;
  /** 'user' for standalone teachers not in an organization; 'org' for organizations. */
  scopeKind?: 'org' | 'user';
  programId?: string;
  programs?: ChurchProgram[];
  /** True when the viewer is a Course Teacher/Instructor, Dept Head, Dept Admin, or Pastor/Owner. */
  canAccessAnswerKey: boolean;
  /** True when the viewer can upload or extract new assignments, syllabi, and course resources. */
  canUploadToLibrary: boolean;
  viewerRoleBadge?: string;
  currentUserUid?: string;
  currentUserName?: string;
  onAttachWeeksToProgram?: (programId: string, unit: IngestedCurriculumUnit) => Promise<void>;
  onOpenContentHQ?: () => void;
}

const CATEGORY_META: Record<
  LessonLibraryCategory,
  { label: string; shortLabel: string; badgeClass: string; iconEmoji: string }
> = {
  SYLLABUS: {
    label: 'Syllabus & Master Source Docs',
    shortLabel: 'Syllabus / Source Doc',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    iconEmoji: '📜',
  },
  ASSIGNMENT: {
    label: 'Assignments & Worksheets',
    shortLabel: 'Assignment',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
    iconEmoji: '📝',
  },
  COURSE_RESOURCE: {
    label: 'Course Resources & Reading Packets',
    shortLabel: 'Course Resource',
    badgeClass: 'bg-sky-500/20 text-sky-200 border-sky-400/40',
    iconEmoji: '📚',
  },
  QUIZ_EXAM: {
    label: 'Quizzes & Mastery Exams',
    shortLabel: 'Quiz / Exam',
    badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
    iconEmoji: '🎯',
  },
  MASTER_SOURCE_DOC: {
    label: 'Extracted Source Document',
    shortLabel: 'Original Source Doc',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    iconEmoji: '📄',
  },
  ANSWER_KEY: {
    label: 'Teacher Answer Keys & Rubrics',
    shortLabel: 'Teacher Answer Key',
    badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
    iconEmoji: '🔑',
  },
};

export const OrgLessonLibraryHub: React.FC<OrgLessonLibraryHubProps> = ({
  orgId,
  orgName,
  scopeKind,
  programId,
  programs = [],
  canAccessAnswerKey,
  canUploadToLibrary,
  viewerRoleBadge,
  currentUserUid = 'instructor_great_faith',
  currentUserName = 'Course Instructor',
  onAttachWeeksToProgram,
  onOpenContentHQ,
}) => {
  const isStandaloneTeacher = scopeKind === 'user' || isStandaloneTeacherScopeId(orgId);
  const resolvedScopeKind: 'org' | 'user' = isStandaloneTeacher ? 'user' : 'org';
  const orgEducationFolderName = getOrgEducationFolderName(orgName);

  const [units, setUnits] = useState<IngestedCurriculumUnit[]>(() =>
    listIngestedUnits(orgId, programId, orgName)
  );
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | LessonLibraryCategory>('ALL');
  const [search, setSearch] = useState('');
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);

  // Modal / Drawer states for inspecting Original Source Document, Interactive Tela Preview, and Answer Key
  const [inspectSourceUnit, setInspectSourceUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [inspectAnswerKeyUnit, setInspectAnswerKeyUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [telaPreviewUnit, setTelaPreviewUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [assignModalUnit, setAssignModalUnit] = useState<IngestedCurriculumUnit | null>(null);

  // Upload / Extract Form State
  const [uploadCategory, setUploadCategory] = useState<LessonLibraryCategory>('ASSIGNMENT');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadMode, setUploadMode] = useState<'FILE' | 'LINK' | 'TEXT'>('FILE');
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [lessonUrl, setLessonUrl] = useState('');
  const [lessonText, setLessonText] = useState('');
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [answerKeyUrl, setAnswerKeyUrl] = useState('');
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [targetProgramId, setTargetProgramId] = useState<string>(programId || programs[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const refreshUnits = () => {
    setUnits(listIngestedUnits(orgId, programId, orgName));
  };

  useEffect(() => {
    refreshUnits();
    let cancelled = false;
    ensureAllDetectedLinksOnboarded(orgId, programId, orgName)
      .then((refreshed) => {
        if (!cancelled) setUnits(refreshed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId, programId, orgName]);

  useEffect(() => {
    const onUpdated = () => refreshUnits();
    window.addEventListener('plajah:lessonLibraryUpdated', onUpdated);
    window.addEventListener('plajah:orgAssetsUpdated', onUpdated);
    return () => {
      window.removeEventListener('plajah:lessonLibraryUpdated', onUpdated);
      window.removeEventListener('plajah:orgAssetsUpdated', onUpdated);
    };
  }, [orgId, programId]);

  // Gate standalone Answer Key units if viewer does NOT have `canAccessAnswerKey`
  const accessibleUnits = useMemo(() => {
    return units.filter((u) => {
      const isStandaloneKey = Boolean(u.isAnswerKeyOnly) || u.libraryCategory === 'ANSWER_KEY';
      if (isStandaloneKey && !canAccessAnswerKey) return false;
      return true;
    });
  }, [units, canAccessAnswerKey]);

  // Locate the Master Source Document we extracted from (`rev2_doc_0_master_hub_syllabus` or Revelation 2 hub)
  const masterExtractedSourceUnit = useMemo(() => {
    return (
      accessibleUnits.find(
        (u) =>
          u.sourceUrl?.includes('1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE') &&
          (u.libraryCategory === 'SYLLABUS' || u.title.toLowerCase().includes('master syllabus'))
      ) || accessibleUnits[0]
    );
  }, [accessibleUnits]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: accessibleUnits.length };
    for (const u of accessibleUnits) {
      const cat = u.libraryCategory || 'ASSIGNMENT';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [accessibleUnits]);

  const filteredUnits = useMemo(() => {
    return accessibleUnits.filter((u) => {
      const cat = u.libraryCategory || 'ASSIGNMENT';
      if (categoryFilter !== 'ALL' && cat !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${u.title} ${u.subtitle} ${u.sourceLabel} ${u.rawCurriculumText || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accessibleUnits, categoryFilter, search]);

  const handleUploadOrExtractToLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (uploadMode === 'FILE' && !lessonFile) {
      setErrorMessage('Please choose a PDF, Word (.docx), or worksheet file to upload.');
      return;
    }
    if (uploadMode === 'LINK' && !lessonUrl.trim()) {
      setErrorMessage('Please enter a Google Doc, Google Form, or PDF link to extract.');
      return;
    }
    if (uploadMode === 'TEXT' && !lessonText.trim()) {
      setErrorMessage('Please paste the assignment, syllabus, or course resource content.');
      return;
    }

    setSubmitting(true);
    try {
      const unitKind: IngestedCurriculumUnit['kind'] =
        uploadCategory === 'QUIZ_EXAM'
          ? 'QUIZ'
          : uploadCategory === 'SYLLABUS'
            ? 'CURRICULUM_MODULE'
            : uploadCategory === 'ASSIGNMENT'
              ? 'ASSIGNMENT'
              : 'INTERACTIVE_LESSON';

      const { unit } = await ingestCurriculumToTela({
        orgId,
        orgName,
        scopeKind: resolvedScopeKind,
        programId: targetProgramId || programId || undefined,
        title: uploadTitle.trim() || undefined,
        unitKind,
        libraryCategory: uploadCategory,
        isAnswerKeyOnly: uploadCategory === 'ANSWER_KEY',
        uploadedByRole: viewerRoleBadge || (isStandaloneTeacher ? 'TEACHER' : 'INSTRUCTOR'),
        createdByName: currentUserName,
        lessonFile: uploadMode === 'FILE' ? lessonFile : null,
        lessonUrl: uploadMode === 'LINK' ? lessonUrl.trim() : undefined,
        lessonText: uploadMode === 'TEXT' ? lessonText.trim() : undefined,
        answerKeyFile: answerKeyFile || null,
        answerKeyUrl: answerKeyUrl.trim() || undefined,
        answerKeyText: answerKeyText.trim() || undefined,
      });

      if (targetProgramId && onAttachWeeksToProgram && unit.syllabusWeeks.length > 0) {
        await onAttachWeeksToProgram(targetProgramId, unit);
      }

      refreshUnits();
      setUploadTitle('');
      setLessonFile(null);
      setLessonUrl('');
      setLessonText('');
      setAnswerKeyFile(null);
      setAnswerKeyUrl('');
      setAnswerKeyText('');
      setShowUploadDrawer(false);
      setStatusMessage(
        isStandaloneTeacher
          ? `Added "${unit.title}" to your Teacher Content HQ under the "${unit.departmentFolder || unit.documentClassFolder || 'Lessons & Course Resources'}" folder (plus Companion Answer Key in "Answer Keys & Rubrics")!`
          : `Added "${unit.title}" to the ${orgName} Lesson Library & Content HQ (${orgEducationFolderName})! Answer Key is strictly locked to Course Teachers, Department Heads, and Department Admins.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not upload or extract resource into the Lesson Library.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 text-white">
      {/* Top Header & Role-Based Answer Key Access Banner */}
      <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-br from-[#171326] via-[#111722] to-[#14111C] p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                <BookOpen size={11} />{' '}
                {isStandaloneTeacher
                  ? `${orgName} · Personal Teacher Lesson Library & Content HQ`
                  : `${orgEducationFolderName} · Official Lesson & Resource Library`}
              </span>
              {canAccessAnswerKey ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                  <ShieldCheck size={11} /> Answer Keys Unlocked ({viewerRoleBadge || 'Course Teacher / Dept Head / Admin'})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/70 text-[10px] font-bold inline-flex items-center gap-1">
                  <Lock size={11} className="text-amber-300" /> Answer Keys Restricted to Course Teachers, Dept Heads &amp; Dept Admins
                </span>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white">
              {isStandaloneTeacher
                ? 'Teacher Lesson Library — Auto-Organized into Content HQ Document Class Folders'
                : `Lesson Library (${orgEducationFolderName}) — Extracted Source Documents, Syllabi, Assignments & Course Resources`}
            </h3>
            <p className="text-xs text-white/70 leading-relaxed">
              {isStandaloneTeacher ? (
                <>
                  Every lesson, course resource, assignment, syllabus, quiz, or answer key you upload or extract from links goes directly into <strong>your own Content HQ</strong> with dedicated folders for each class of documents (<strong>Lessons &amp; Course Resources</strong>, <strong>Assignments &amp; Worksheets</strong>, <strong>Quizzes &amp; Assessments</strong>, <strong>Syllabi &amp; Master Source Docs</strong>, and <strong>Answer Keys &amp; Rubrics</strong>).
                </>
              ) : (
                <>
                  Every syllabus, assignment, reading packet, PDF, Word doc, and Google Doc/Form uploaded or extracted by education teachers, Department Admins, Department Heads, or course instructors is housed here and in <strong>Content HQ → {orgEducationFolderName}</strong> with both its <strong>Original Source Document</strong> and its <strong>Interactive Tela Lesson</strong>.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenContentHQ && (
              <button
                type="button"
                onClick={onOpenContentHQ}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition"
              >
                <FolderOpen size={13} className="text-amber-300" />{' '}
                {isStandaloneTeacher
                  ? 'Open My Teacher Content HQ'
                  : `View in ${orgEducationFolderName} HQ`}
              </button>
            )}
            {canUploadToLibrary && (
              <button
                type="button"
                onClick={() => setShowUploadDrawer((v) => !v)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] hover:opacity-95 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg transition"
              >
                <Plus size={14} />
                {showUploadDrawer
                  ? 'Close Upload / Extract Form'
                  : 'Upload or Extract Assignment / Syllabus / Resource'}
              </button>
            )}
          </div>
        </div>

        {/* Highlight Banner: Standalone Teacher Document Class Folders vs. Organization Extracted Source Document */}
        {isStandaloneTeacher ? (
          <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider">
                  🗂️ Your Personal Content HQ · Document Class Folders Active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {TEACHER_DOCUMENT_CLASS_FOLDERS.map((f) => (
                  <span
                    key={f.id}
                    className="px-2.5 py-1 rounded-lg bg-black/35 border border-white/10 text-[11px] font-bold text-white/90 inline-flex items-center gap-1"
                  >
                    <span>{f.iconEmoji}</span>
                    <span>{f.folderName}</span>
                  </span>
                ))}
              </div>
            </div>
            {onOpenContentHQ && (
              <button
                type="button"
                onClick={onOpenContentHQ}
                className="px-3.5 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center gap-1.5 hover:bg-emerald-300 transition shadow"
              >
                <FolderOpen size={13} /> Browse Folders in My Content HQ
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-sky-400/35 bg-sky-500/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[10px] font-black uppercase tracking-wider">
                  📄 Extracted Source Document Verified in {orgName}
                </span>
                <span className="text-[11px] text-white/60 font-mono truncate">
                  Google Doc ID: {REVELATION_2_COURSE_CONNECTION_PRESET.docId} (Tab: {REVELATION_2_COURSE_CONNECTION_PRESET.tabId})
                </span>
              </div>
              <p className="text-xs sm:text-sm font-black text-white">
                {REVELATION_2_COURSE_CONNECTION_PRESET.hubTitle}
              </p>
              <p className="text-[11px] text-white/70">
                Stored in <strong>{orgName} → {orgEducationFolderName} → Lesson Library &amp; Content HQ</strong> along with all <strong>{accessibleUnits.length}</strong> extracted packets, Google Forms quizzes, Sacred Library dossier PDF, and teacher answer keys.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {masterExtractedSourceUnit && (
                <button
                  type="button"
                  onClick={() => setInspectSourceUnit(masterExtractedSourceUnit)}
                  className="px-3.5 py-2 rounded-xl bg-sky-400 text-black text-xs font-black inline-flex items-center gap-1.5 hover:bg-sky-300 transition shadow"
                >
                  <FileText size={13} /> Inspect Extracted Source Document
                </button>
              )}
              <a
                href={REVELATION_2_COURSE_CONNECTION_PRESET.hubUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-sky-200 inline-flex items-center gap-1.5 transition"
              >
                <ExternalLink size={12} /> Open Source Google Doc
              </a>
            </div>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-300" />
            {statusMessage}
          </span>
          <button
            type="button"
            onClick={() => setStatusMessage('')}
            className="text-white/50 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Upload / Extract Assignment, Syllabus, or Course Resource Drawer */}
      {showUploadDrawer && canUploadToLibrary && (
        <form
          onSubmit={handleUploadOrExtractToLibrary}
          className="rounded-3xl border border-amber-400/35 bg-[#12101B] p-5 space-y-4 shadow-2xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Course Teacher · Department Head · Department Admin Upload &amp; Extractor
              </span>
              <h4 className="text-base font-black text-white">
                Add Assignment, Syllabus, or Course Resource to Lesson Library
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadDrawer(false)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-white/60 mb-1">
                1. Resource Type
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as LessonLibraryCategory)}
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white font-semibold outline-none focus:border-amber-400"
              >
                <option value="ASSIGNMENT">📝 Assignment / Worksheet</option>
                <option value="SYLLABUS">📜 Course Syllabus</option>
                <option value="COURSE_RESOURCE">📚 Course Resource / Reading Packet</option>
                <option value="QUIZ_EXAM">🎯 Quiz / Mastery Exam</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-white/60 mb-1">
                2. Title (Optional — auto-detected from file/link)
              </label>
              <input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g., Week 5 Discipleship Assignment or Course Syllabus"
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-white/60 mb-1">
                3. Classroom / Course Scope
              </label>
              <select
                value={targetProgramId}
                onChange={(e) => setTargetProgramId(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
              >
                <option value="">All {orgName} Classrooms</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.ageGroup})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Input Mode Switcher: Upload PDF/Docx vs. Extract from Link vs. Paste Text */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(
              [
                { id: 'FILE', label: 'Upload PDF / Word (.docx) / Scan', icon: Upload },
                { id: 'LINK', label: 'Extract from Link (Google Doc / Form / PDF URL)', icon: Link2 },
                { id: 'TEXT', label: 'Paste Syllabus / Assignment Text', icon: FileText },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = uploadMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setUploadMode(m.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 border transition ${
                    active
                      ? 'bg-amber-400 text-black border-amber-300'
                      : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={13} /> {m.label}
                </button>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Left Column: Primary Syllabus / Assignment / Course Resource Source */}
            <div className="rounded-2xl border border-white/12 bg-black/40 p-4 space-y-2.5">
              <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <FileText size={14} /> Primary Document (Saved to Lesson Library &amp; Content HQ)
              </div>

              {uploadMode === 'FILE' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-white/60">
                    Upload a PDF (<code className="text-white/85">.pdf</code>), Word document (<code className="text-white/85">.docx</code>), worksheet image, or text file. Both the original file and the extracted interactive Tela lesson will be saved.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md,image/*"
                    onChange={(e) => setLessonFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-white/75 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-400 file:text-black hover:file:bg-amber-300"
                  />
                  {lessonFile && (
                    <p className="text-[11px] text-emerald-300 font-semibold">
                      ✓ Selected: {lessonFile.name} ({Math.round(lessonFile.size / 1024)} KB)
                    </p>
                  )}
                </div>
              )}

              {uploadMode === 'LINK' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-white/60">
                    Paste a Google Docs link, Google Forms quiz link, or PDF URL to extract into an interactive Tela unit and preserve the source link.
                  </p>
                  <input
                    value={lessonUrl}
                    onChange={(e) => setLessonUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/... or https://docs.google.com/forms/..."
                    className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {uploadMode === 'TEXT' && (
                <div className="space-y-2">
                  <textarea
                    value={lessonText}
                    onChange={(e) => setLessonText(e.target.value)}
                    rows={6}
                    placeholder={`# Course Syllabus or Assignment Title\nSection 1: Overview & Scripture References\n\n1. Question prompt? [2 pts]\nA) Option A\nB) Option B`}
                    className="w-full rounded-xl bg-black/60 border border-white/15 p-3 text-xs text-white font-mono outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            {/* Right Column: Companion Answer Key (Gated to Teachers, Dept Heads & Dept Admins) */}
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.04] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <KeyRound size={14} /> Companion Answer Key (Optional · Restricted Access)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[9px] font-black text-emerald-200 uppercase">
                  Teachers · Dept Heads · Admins Only
                </span>
              </div>
              <p className="text-[11px] text-white/60">
                Upload an Answer Key file, paste an Answer Key link, or type expected answers below. Students and general members will <strong>never</strong> see this key.
              </p>

              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={(e) => setAnswerKeyFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-white/75 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-black file:bg-emerald-400 file:text-black hover:file:bg-emerald-300"
              />
              <input
                value={answerKeyUrl}
                onChange={(e) => setAnswerKeyUrl(e.target.value)}
                placeholder="Or paste Answer Key Google Doc URL (optional)..."
                className="w-full rounded-xl bg-black/60 border border-emerald-400/25 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
              />
              <textarea
                value={answerKeyText}
                onChange={(e) => setAnswerKeyText(e.target.value)}
                rows={3}
                placeholder={`1. B — Explanation [2 pts]\n2. True — Rubric note`}
                className="w-full rounded-xl bg-black/60 border border-emerald-400/25 p-2.5 text-xs text-white font-mono outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-white/55">
              Automatically saves Original Document + Interactive Tela Document + Restricted Answer Key into Lesson Library &amp; Content HQ.
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {submitting ? 'Extracting & Saving to Lesson Library...' : 'Save & Extract to Lesson Library'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
              categoryFilter === 'ALL'
                ? 'bg-white text-black shadow'
                : 'bg-white/5 text-white/65 hover:text-white border border-white/10'
            }`}
          >
            All Library Items ({categoryCounts.ALL || 0})
          </button>
          {(
            [
              'SYLLABUS',
              'ASSIGNMENT',
              'COURSE_RESOURCE',
              'QUIZ_EXAM',
              ...(canAccessAnswerKey ? (['ANSWER_KEY'] as const) : []),
            ] as LessonLibraryCategory[]
          ).map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = categoryCounts[cat] || 0;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition ${
                  active
                    ? 'bg-amber-400 text-black border-amber-300 font-black shadow'
                    : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
                }`}
              >
                <span>{meta.iconEmoji}</span>
                <span>{meta.shortLabel}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/25">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 min-w-[230px]">
          <Search size={13} className="text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search syllabi, assignments, source docs..."
            className="bg-transparent text-xs text-white outline-none flex-1 placeholder:text-white/35"
          />
        </div>
      </div>

      {/* Lesson Library Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredUnits.map((unit) => {
          const cat: LessonLibraryCategory = unit.libraryCategory || 'ASSIGNMENT';
          const meta = CATEGORY_META[cat] || CATEGORY_META.ASSIGNMENT;
          const hasAnswerKey = Boolean(
            unit.rawAnswerKeyText ||
              unit.answerKeySourceLabel ||
              unit.questions.some((q) => q.correctAnswer)
          );
          const supCount = unit.sacredLibrarySupplements?.length || 0;

          return (
            <div
              key={unit.id}
              className="rounded-3xl border border-white/12 bg-white/[0.03] hover:bg-white/[0.05] transition p-5 flex flex-col justify-between gap-4 shadow-lg"
            >
              <div className="space-y-3">
                {/* Badges Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${meta.badgeClass}`}
                    >
                      {meta.iconEmoji} {meta.shortLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/75 text-[10px] font-bold uppercase">
                      {unit.sourceKind.replace('_', ' ')}
                    </span>
                    {supCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[10px] font-bold inline-flex items-center gap-1">
                        <ScrollText size={10} /> {supCount} Sacred Sources
                      </span>
                    )}
                  </div>

                  {canUploadToLibrary && (
                    <button
                      type="button"
                      onClick={() => {
                        deleteIngestedUnit(orgId, unit.id);
                        refreshUnits();
                      }}
                      className="text-white/30 hover:text-rose-400 p-1"
                      title="Remove from Lesson Library"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Title & Subtitle */}
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white leading-snug">
                    {unit.title}
                  </h4>
                  <p className="text-xs text-white/55 mt-1">
                    {unit.questions.length} Interactive Questions · {unit.totalPoints} pts ·{' '}
                    {unit.masterySkills.length} Mastery Skills
                  </p>
                </div>

                {/* Provenance Box: Shows the Exact Document We Extracted From */}
                <div className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.05] p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 flex items-center gap-1">
                      <FileText size={11} /> Original Source Document in {orgName}
                    </span>
                    {unit.sourceUrl && (
                      <a
                        href={unit.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-sky-300 hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> Open Source Link
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-white/75 truncate">
                    Source: <strong>{unit.sourceLabel || unit.title}</strong>
                  </p>
                  {unit.extractedFromHubTitle && (
                    <p className="text-[10px] text-white/55 truncate">
                      Extracted from Hub: {unit.extractedFromHubTitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons Row: 1) Original Source Doc, 2) Interactive Tela Lesson, 3) Gated Answer Key */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectSourceUnit(unit)}
                    className="flex-1 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-200 text-[11px] font-black inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <FileText size={12} /> View Original Extracted Doc
                  </button>

                  <button
                    type="button"
                    onClick={() => setTelaPreviewUnit(unit)}
                    className="flex-1 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[11px] font-black inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <Columns size={12} /> Open Interactive Tela Lesson
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* STRICT ANSWER KEY GATE: Only Course Teachers, Dept Heads, and Dept Admins */}
                  {hasAnswerKey && canAccessAnswerKey ? (
                    <button
                      type="button"
                      onClick={() => setInspectAnswerKeyUnit(unit)}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 text-[11px] font-black inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <KeyRound size={12} /> View Teacher Answer Key &amp; Rubric
                    </button>
                  ) : hasAnswerKey ? (
                    <div
                      className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/45 text-[10px] font-semibold inline-flex items-center justify-center gap-1.5"
                      title="Answer keys are only available to Course Teachers, Department Heads, and Department Admins."
                    >
                      <Lock size={11} className="text-amber-300/80" /> Answer Key: Course Teachers, Dept Heads &amp; Admins Only
                    </div>
                  ) : null}

                  {canUploadToLibrary && (
                    <button
                      type="button"
                      onClick={() => setAssignModalUnit(unit)}
                      className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-[11px] font-black inline-flex items-center gap-1 transition"
                    >
                      <GraduationCap size={12} /> Assign to Class
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal 1: Original Extracted Source Document Inspector */}
      {inspectSourceUnit && (
        <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-3xl border border-sky-400/40 bg-[#0e0d16] text-white flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-sky-500/10">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-1.5">
                  <FileText size={12} /> Original Extracted Source Document · {orgName}
                </div>
                <h3 className="text-sm sm:text-base font-black text-white truncate">
                  {inspectSourceUnit.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inspectSourceUnit.sourceUrl && (
                  <a
                    href={inspectSourceUnit.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-sky-400 text-black text-xs font-black inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> Open Source Link
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setInspectSourceUnit(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs space-y-1">
                <div>
                  <strong className="text-white/70">Organization Location:</strong> {orgName} →{' '}
                  {inspectSourceUnit.departmentFolder || 'Christian Education'} → Lesson Library &amp; Content HQ
                </div>
                {inspectSourceUnit.sourceUrl && (
                  <div className="truncate">
                    <strong className="text-white/70">Original Document URL:</strong>{' '}
                    <a
                      href={inspectSourceUnit.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300 hover:underline"
                    >
                      {inspectSourceUnit.sourceUrl}
                    </a>
                  </div>
                )}
                {inspectSourceUnit.extractedFromHubUrl && (
                  <div className="truncate">
                    <strong className="text-white/70">Extracted From Course Hub:</strong>{' '}
                    <a
                      href={inspectSourceUnit.extractedFromHubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 hover:underline"
                    >
                      {inspectSourceUnit.extractedFromHubTitle || inspectSourceUnit.extractedFromHubUrl}
                    </a>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/12 bg-black/60 p-5 font-mono text-xs text-white/90 whitespace-pre-wrap leading-relaxed">
                {inspectSourceUnit.rawCurriculumText ||
                  [
                    `# ${inspectSourceUnit.title}`,
                    inspectSourceUnit.subtitle,
                    '',
                    ...inspectSourceUnit.lessonBlocks.map((b) => b.text),
                    '',
                    ...inspectSourceUnit.questions.map(
                      (q) =>
                        `${q.number}. ${q.prompt} [${q.points} pts]${
                          q.options?.length ? '\n   ' + q.options.join('\n   ') : ''
                        }`
                    ),
                  ].join('\n')}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between">
              <span className="text-[11px] text-white/55">
                Both this Original Source Document and the Interactive Tela Document are saved in {orgName}.
              </span>
              <button
                type="button"
                onClick={() => {
                  const u = inspectSourceUnit;
                  setInspectSourceUnit(null);
                  setTelaPreviewUnit(u);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center gap-1.5"
              >
                <Layers size={13} /> Open Split View (Original + Interactive Tela)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Teacher Answer Key & Rubric Inspector (Strictly Gated to `canAccessAnswerKey`) */}
      {inspectAnswerKeyUnit && canAccessAnswerKey && (
        <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl border border-emerald-400/40 bg-[#0e0d16] text-white flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-emerald-500/10">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <KeyRound size={12} /> Restricted Teacher Answer Key · Course Teachers, Dept Heads &amp; Admins Only
                </div>
                <h3 className="text-sm sm:text-base font-black text-white truncate">
                  {inspectAnswerKeyUnit.title} — Answer Key &amp; Rubric
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectAnswerKeyUnit(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {inspectAnswerKeyUnit.rawAnswerKeyText && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4 font-mono text-xs text-emerald-100 whitespace-pre-wrap leading-relaxed">
                  {inspectAnswerKeyUnit.rawAnswerKeyText}
                </div>
              )}

              <div className="space-y-2.5">
                <div className="text-xs font-black uppercase tracking-wider text-white/70">
                  Question-by-Question Validated Key ({inspectAnswerKeyUnit.questions.length} Items)
                </div>
                {inspectAnswerKeyUnit.questions.map((q) => (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1.5 text-xs"
                  >
                    <div className="font-bold text-white">
                      Q{q.number}. {q.prompt}{' '}
                      <span className="text-amber-300 font-mono">[{q.points} pts]</span>
                    </div>
                    <div className="text-emerald-300 font-semibold">
                      ✓ Correct Answer: {q.correctAnswer || 'Open reflection / rubric graded'}
                    </div>
                    {q.explanation && (
                      <div className="text-white/65 text-[11px]">Rubric / Explanation: {q.explanation}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Interactive Tela Document Preview Modal (with `canViewAnswerKey` strictly passed) */}
      {telaPreviewUnit && (
        <TelaDocumentPreviewModal
          isOpen={Boolean(telaPreviewUnit)}
          onClose={() => setTelaPreviewUnit(null)}
          title={telaPreviewUnit.title}
          telaDocId={telaPreviewUnit.telaDocId}
          unit={telaPreviewUnit}
          originalUrl={telaPreviewUnit.sourceUrl}
          originalText={telaPreviewUnit.rawCurriculumText}
          answerKeyText={canAccessAnswerKey ? telaPreviewUnit.rawAnswerKeyText : undefined}
          canViewAnswerKey={canAccessAnswerKey}
          orgName={orgName}
          departmentFolder={
            telaPreviewUnit.departmentFolder ||
            (isStandaloneTeacher ? 'Lessons & Course Resources' : orgEducationFolderName)
          }
        />
      )}

      {/* Modal 4: Assign to Classroom / Student Desk */}
      <AssignToClassModal
        isOpen={Boolean(assignModalUnit)}
        onClose={() => setAssignModalUnit(null)}
        unit={assignModalUnit}
        defaultDomain="CHRISTIAN_EDUCATION"
        orgId={orgId}
        orgName={orgName}
        teacherUid={currentUserUid}
        teacherName={currentUserName}
        programs={programs}
        defaultProgramId={programId}
        onAssigned={(created) => {
          setAssignModalUnit(null);
          setStatusMessage(`Assigned "${created.title}" to ${created.classroomName}!`);
        }}
      />
    </div>
  );
};

export default OrgLessonLibraryHub;
