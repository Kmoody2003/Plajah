// components/church/TelaDocumentPreviewModal.tsx
// Interactive Multi-Frame Tela Document Previewer + Side-by-Side Original vs. Living Tela Comparison
// Features:
//  - 6 Living Worksheet Template Designs + 4 Living Test & Quiz Designs
//  - 4-Council Chime-In (Art Council, Interactive/Gaming Council, Education Council, Lighting Director)
//  - Integrated Lorea Sacred Library Supplemental Primary Sources, Manuscripts & Artifacts
//  - "Tease & Build Your Own" Creator Trigger

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileText,
  Sparkles,
  Columns,
  Layers,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  FolderOpen,
  BookOpen,
  Check,
  Award,
  Eye,
  Palette,
  Gamepad2,
  GraduationCap,
  Sun,
  ScrollText,
  BookmarkPlus,
  Wand2,
  Lock,
} from 'lucide-react';
import type { TelaDoc, TelaWriterDevice, TelaBaseDevice, TelaVectorDevice } from '../../types';
import { loadTelaDoc } from '../../services/telaStore';
import type { IngestedCurriculumUnit } from '../../services/curriculumIngestionService';
import { parseRef } from '../../services/scriptureRef';
import { openScripture } from '../scripture/ScriptureRefChip';
import {
  LIVING_WORKSHEET_TEMPLATES,
  LIVING_TEST_QUIZ_TEMPLATES,
  DEFAULT_LIVING_TEMPLATE_ID,
  getLivingTemplateById,
  getDefaultLivingTemplateForUnit,
  saveLivingTemplateForUnit,
  type LivingDocumentTemplate,
} from '../../services/council/livingDocumentTemplates';
import {
  matchSacredLibrarySupplementsForLesson,
  type SacredLibrarySupplement,
} from '../../services/sacredLibraryCurriculumBridge';
import { pinResearchSource } from '../../services/sacredResearch';

export interface TelaDocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  telaDoc?: TelaDoc | null;
  telaDocId?: string;
  unit?: IngestedCurriculumUnit | null;
  originalUrl?: string;
  originalText?: string;
  answerKeyText?: string;
  orgName?: string;
  departmentFolder?: string;
  initialTemplateId?: string;
  /** Strictly true ONLY for Course Teachers/Instructors, Department Heads, and Department Admins. */
  canViewAnswerKey?: boolean;
  onOpenFullTelaStudio?: (docId: string) => void;
  onBuildYourOwnWithTemplate?: (template: LivingDocumentTemplate) => void;
}

export const TelaDocumentPreviewModal: React.FC<TelaDocumentPreviewProps> = ({
  isOpen,
  onClose,
  title,
  telaDoc: propTelaDoc,
  telaDocId,
  unit,
  originalUrl,
  originalText,
  answerKeyText,
  orgName = 'Great Faith Ministries',
  departmentFolder = 'Christian Education',
  initialTemplateId,
  canViewAnswerKey = false,
  onOpenFullTelaStudio,
  onBuildYourOwnWithTemplate,
}) => {
  const [loadedDoc, setLoadedDoc] = useState<TelaDoc | null>(propTelaDoc || null);
  const [viewMode, setViewMode] = useState<'SPLIT' | 'TELA_ONLY' | 'ORIGINAL_ONLY'>('SPLIT');
  const [activeFrameIdx, setActiveFrameIdx] = useState<number>(0);
  const [showExpectedAnswers, setShowExpectedAnswers] = useState<boolean>(canViewAnswerKey);
  const [showCouncilDrawer, setShowCouncilDrawer] = useState<boolean>(true);
  const [previewResponses, setPreviewResponses] = useState<Record<string, string>>({});
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [checkedPreview, setCheckedPreview] = useState<boolean>(false);
  const [pinnedSupplementIds, setPinnedSupplementIds] = useState<Record<string, boolean>>({});

  // Resolve initial Living Document Template (from prop, or default #12 Kinfolk Editorial Spread)
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => {
    if (initialTemplateId) return initialTemplateId;
    return DEFAULT_LIVING_TEMPLATE_ID;
  });

  useEffect(() => {
    if (initialTemplateId) {
      setActiveTemplateId(initialTemplateId);
    } else if (unit) {
      setActiveTemplateId(getDefaultLivingTemplateForUnit(unit).id);
    }
  }, [initialTemplateId, unit?.id]);

  const activeTemplate = useMemo(
    () => getLivingTemplateById(activeTemplateId),
    [activeTemplateId]
  );

  const handleSelectTemplate = (tplId: string) => {
    setActiveTemplateId(tplId);
    if (unit?.id) {
      saveLivingTemplateForUnit(unit.id, tplId);
    }
  };

  // Resolve Sacred Library Supplemental Materials for this document
  const sacredSupplements: SacredLibrarySupplement[] = useMemo(() => {
    if (unit?.sacredLibrarySupplements && unit.sacredLibrarySupplements.length > 0) {
      return unit.sacredLibrarySupplements;
    }
    return matchSacredLibrarySupplementsForLesson({
      title,
      rawText: originalText || unit?.rawCurriculumText || '',
      scripturePassages: unit?.questions?.map((q) => q.scripturePassage || '').filter(Boolean) || [],
    });
  }, [unit, title, originalText]);

  useEffect(() => {
    if (propTelaDoc) {
      setLoadedDoc(propTelaDoc);
      return;
    }
    const targetId = telaDocId || unit?.telaDocId;
    if (!targetId) {
      setLoadedDoc(null);
      return;
    }
    let cancelled = false;
    loadTelaDoc(targetId)
      .then((doc) => {
        if (!cancelled && doc) setLoadedDoc(doc);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [propTelaDoc, telaDocId, unit?.telaDocId]);

  if (!isOpen) return null;

  const frames = loadedDoc?.frames || [];
  const devices = loadedDoc?.devices || {};

  const writerDevice = Object.values(devices).find((d) => d.type === 'WRITER') as TelaWriterDevice | undefined;
  const baseDevice = Object.values(devices).find((d) => d.type === 'BASE') as TelaBaseDevice | undefined;
  const vectorDevice = Object.values(devices).find((d) => d.type === 'VECTOR') as TelaVectorDevice | undefined;

  const resolvedOriginalText =
    originalText ||
    unit?.rawCurriculumText ||
    (unit
      ? [
          `# ${unit.title}`,
          unit.subtitle,
          '',
          ...unit.lessonBlocks.map((b) => (b.kind === 'h1' ? `# ${b.text}` : b.kind === 'h2' ? `## ${b.text}` : b.text)),
          '',
          ...unit.questions.map(
            (q) =>
              `${q.number}. ${q.prompt} [${q.points} pts]${
                q.options && q.options.length > 0 ? '\n   ' + q.options.join('\n   ') : ''
              }`
          ),
        ].join('\n')
      : writerDevice?.blocks.map((b) => b.text).join('\n\n') || '');

  const resolvedAnswerKeyText =
    answerKeyText ||
    unit?.rawAnswerKeyText ||
    (unit
      ? unit.questions
          .filter((q) => q.correctAnswer)
          .map(
            (q) =>
              `${q.number}. ${q.correctAnswer}${q.explanation ? ` — ${q.explanation}` : ''} [${q.points} pts]`
          )
          .join('\n')
      : '');

  const questionsList = unit?.questions || [];
  const totalQuestionsCount = questionsList.length || (baseDevice?.fields?.length ?? 3);
  const answeredCount = Object.values(previewResponses).filter((v) => String(v || '').trim().length > 0).length;
  const completionPct = totalQuestionsCount > 0 ? Math.min(100, Math.round((answeredCount / totalQuestionsCount) * 100)) : 0;

  // Grade calculation for interactive check
  const gradeSummary = useMemo(() => {
    if (!checkedPreview || questionsList.length === 0) return null;
    let earned = 0;
    let total = 0;
    questionsList.forEach((q) => {
      total += q.points || 1;
      const given = (previewResponses[q.id] || '').trim();
      const expected = (q.correctAnswer || '').trim();
      if (!expected && given.length > 1) {
        earned += q.points || 1;
      } else if (expected) {
        const gLetter = given.match(/^([A-F])\b/i)?.[1]?.toUpperCase();
        const eLetter = expected.match(/^([A-F])\b/i)?.[1]?.toUpperCase();
        if (gLetter && eLetter && gLetter === eLetter) {
          earned += q.points || 1;
        } else if (given.toLowerCase().startsWith(expected.toLowerCase())) {
          earned += q.points || 1;
        }
      }
    });
    return {
      earned,
      total,
      pct: total > 0 ? Math.round((earned / total) * 100) : 100,
    };
  }, [checkedPreview, questionsList, previewResponses]);

  const handlePinSupplementToNotebook = (sup: SacredLibrarySupplement) => {
    try {
      pinResearchSource({
        id: `christianity/sacred-supplement/${sup.id}`,
        faith: 'christianity',
        kind: sup.category === 'ARTIFACT' || sup.category === 'ARCHAEOLOGY' || sup.category === 'HISTORICAL_EVIDENCE' ? 'artifact' : 'passage',
        title: sup.title,
        locator: sup.scriptureRefs[0] || sup.era,
        edition: sup.sourceAttribution,
        text: `${sup.summary}\n\nConnection to Lesson: ${sup.connectionToLesson}${sup.primaryExcerpt ? `\n\nPrimary Excerpt: ${sup.primaryExcerpt}` : ''}`,
        sourceUrl: sup.url,
      });
      setPinnedSupplementIds((prev) => ({ ...prev, [sup.id]: true }));
    } catch {
      setPinnedSupplementIds((prev) => ({ ...prev, [sup.id]: true }));
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex flex-col overflow-hidden text-white">
      {/* Subtle Keyframe Animations for Non-Static Living Paper & Volumetric Sheen */}
      <style>{`
        @keyframes pjLivingLightDrift {
          0% { background-position: 0% 50%; opacity: 0.88; }
          50% { background-position: 100% 50%; opacity: 1; }
          100% { background-position: 0% 50%; opacity: 0.88; }
        }
        @keyframes pjAstrolabeSlowSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pjLeafGentleSway {
          0%, 100% { transform: rotate(-2deg) translateY(0px); }
          50% { transform: rotate(2.5deg) translateY(-1.5px); }
        }
        @keyframes pjZenithBreath {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 0.9; }
        }
        @keyframes pjSealPop {
          0% { transform: scale(0.75); opacity: 0.4; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Top Navigation & Mode Bar */}
      <div className="px-5 py-3 border-b border-white/12 bg-[#0b0a12] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] flex items-center justify-center shadow-lg shrink-0">
            <Layers size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Living Tela Document Preview · {activeTemplate.badgeLabel}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-black inline-flex items-center gap-1">
                <FolderOpen size={10} /> {orgName} → {departmentFolder}
              </span>
              {sacredSupplements.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-black inline-flex items-center gap-1">
                  <ScrollText size={10} /> {sacredSupplements.length} Sacred Library Supplements Integrated
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-black text-white truncate">{title}</h2>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1.5 transition ${
                viewMode === 'SPLIT' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              <Columns size={12} /> Original + Living Tela Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TELA_ONLY')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1.5 transition ${
                viewMode === 'TELA_ONLY' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              <Sparkles size={12} /> Living Tela Paper Only
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ORIGINAL_ONLY')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1.5 transition ${
                viewMode === 'ORIGINAL_ONLY' ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              <FileText size={12} /> Original Document
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCouncilDrawer((v) => !v)}
            className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 ${
              showCouncilDrawer
                ? 'bg-purple-500/25 border-purple-400/50 text-purple-200'
                : 'bg-white/5 border-white/15 text-white/70 hover:text-white'
            }`}
          >
            <Palette size={12} /> 4-Council Notes
          </button>

          {canViewAnswerKey ? (
            <button
              type="button"
              onClick={() => setShowExpectedAnswers((v) => !v)}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 ${
                showExpectedAnswers
                  ? 'bg-emerald-400/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-white/5 border-white/15 text-white/70 hover:text-white'
              }`}
            >
              <Eye size={12} /> {showExpectedAnswers ? 'Answer Key: ON' : 'Answer Key: OFF'}
            </button>
          ) : (
            <span
              className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[10px] font-bold text-white/50 inline-flex items-center gap-1.5"
              title="Answer keys are restricted to Course Teachers, Department Heads, and Department Admins."
            >
              <Lock size={11} className="text-amber-300" /> Answer Key: Teachers, Dept Heads &amp; Admins Only
            </span>
          )}

          {(loadedDoc?.id || telaDocId || unit?.telaDocId) && (
            <button
              type="button"
              onClick={() => {
                const id = loadedDoc?.id || telaDocId || unit?.telaDocId!;
                if (onOpenFullTelaStudio) {
                  onOpenFullTelaStudio(id);
                } else {
                  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: id } }));
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-black inline-flex items-center gap-1.5"
            >
              <ExternalLink size={12} /> Open Full Tela Canvas
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            aria-label="Close Tela preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 10 Living Template Designs Picker Rail (6 Worksheet Designs + 4 Test & Quiz Designs) */}
      <div className="px-5 py-2.5 border-b border-white/10 bg-[#100e1a] flex flex-col gap-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-300">
            <Sparkles size={11} /> Choose a Council-Built Living Design (6 Worksheets + 4 Tests &amp; Quizzes)
          </div>
          <span className="text-[11px] text-white/60 italic">{activeTemplate.teaserHook}</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-200/70 px-1.5 shrink-0">
            6 Worksheets:
          </span>
          {LIVING_WORKSHEET_TEMPLATES.map((tpl, idx) => {
            const active = tpl.id === activeTemplate.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border ${
                  active
                    ? 'bg-amber-400 text-black border-amber-300 font-black shadow-md'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: tpl.primaryAccent }}
                />
                <span>
                  W{idx + 1}. {tpl.name.split('&')[0].trim()}
                </span>
              </button>
            );
          })}

          <span className="text-[9px] font-black uppercase tracking-wider text-purple-300/80 pl-2 pr-1 shrink-0">
            4 Tests &amp; Quizzes:
          </span>
          {LIVING_TEST_QUIZ_TEMPLATES.map((tpl, idx) => {
            const active = tpl.id === activeTemplate.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border ${
                  active
                    ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white border-amber-300/50 font-black shadow-md'
                    : 'bg-purple-500/10 text-purple-200/80 border-purple-400/20 hover:bg-purple-500/20 hover:text-white'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: tpl.secondaryAccent }}
                />
                <span>
                  T{idx + 1}. {tpl.name.split('&')[0].trim()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Council Chime-In Bar (Art Council + Gaming/Interactive Council + Education Council + Lighting Director) */}
      {showCouncilDrawer && (
        <div className="px-5 py-2.5 border-b border-white/10 bg-[#151224] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
              <Palette size={11} /> Art Council · {activeTemplate.councils.artCouncil.directorName}
            </div>
            <p className="text-[11px] text-white/75 leading-snug">{activeTemplate.councils.artCouncil.note}</p>
          </div>

          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              <Gamepad2 size={11} /> Interactive &amp; Gaming · {activeTemplate.councils.gamingAndInteractiveCouncil.specialistName}
            </div>
            <p className="text-[11px] text-white/75 leading-snug">
              {activeTemplate.councils.gamingAndInteractiveCouncil.microInteractionRule}
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-sky-300">
              <GraduationCap size={11} /> Education Council · {activeTemplate.councils.educationCouncil.pedagogyLead}
            </div>
            <p className="text-[11px] text-white/75 leading-snug">{activeTemplate.councils.educationCouncil.note}</p>
          </div>

          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300">
              <Sun size={11} /> Lighting Director · {activeTemplate.councils.lightingDirector.lightingStyle}
            </div>
            <p className="text-[11px] text-white/75 leading-snug">{activeTemplate.councils.lightingDirector.note}</p>
          </div>
        </div>
      )}

      {/* Main Content Split / Single Stage */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT PANE: Original Document Version */}
        {(viewMode === 'SPLIT' || viewMode === 'ORIGINAL_ONLY') && (
          <div
            className={`${
              viewMode === 'SPLIT' ? 'lg:col-span-5 border-r border-white/10' : 'lg:col-span-12'
            } flex flex-col min-h-0 bg-[#0d0c14]`}
          >
            <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-sky-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Original Source Document (Copied to {orgName} · {departmentFolder})
                </span>
              </div>
              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-bold text-sky-300 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Source Link
                </a>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="rounded-2xl border border-white/12 bg-black/50 p-5 font-mono text-xs text-white/85 whitespace-pre-wrap leading-relaxed">
                {resolvedOriginalText || 'Original document text loaded.'}
              </div>

              {canViewAnswerKey && resolvedAnswerKeyText ? (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.05] p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-300">
                    <KeyRound size={13} /> Companion Answer Key Document (Restricted: Course Teachers, Dept Heads &amp; Admins)
                  </div>
                  <div className="font-mono text-xs text-emerald-100/90 whitespace-pre-wrap leading-relaxed">
                    {resolvedAnswerKeyText}
                  </div>
                </div>
              ) : resolvedAnswerKeyText ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-2 text-xs text-white/55">
                  <Lock size={14} className="text-amber-300 shrink-0" />
                  <span>
                    Companion Answer Key is strictly restricted to <strong>Course Teachers</strong>, <strong>Department Heads</strong>, and <strong>Department Admins</strong>.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* RIGHT PANE: Living Multi-Frame Interactive Tela Document */}
        {(viewMode === 'SPLIT' || viewMode === 'TELA_ONLY') && (
          <div
            className={`${
              viewMode === 'SPLIT' ? 'lg:col-span-7' : 'lg:col-span-12'
            } flex flex-col min-h-0 bg-[#13111c]`}
          >
            {/* Tela Frame Selector Bar */}
            <div className="px-5 py-3 border-b border-white/10 bg-white/[0.03] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Living Interactive Tela Document · {activeTemplate.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveFrameIdx(0)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black transition ${
                    activeFrameIdx === 0
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  Frame 1 · Lesson &amp; Sacred Library
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFrameIdx(1)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black transition ${
                    activeFrameIdx === 1
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  Frame 2 · Interactive Worksheet &amp; Key
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFrameIdx(2)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black transition ${
                    activeFrameIdx === 2
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  All Frames Stacked ({Math.max(2, frames.length)})
                </button>
              </div>
            </div>

            {/* Living Tela Paper Sheet Stage */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col items-center gap-6">
              <div
                className="w-full max-w-[840px] rounded-[26px] shadow-[0_24px_80px_rgba(0,0,0,0.65)] border overflow-hidden transition-all duration-300 relative"
                style={{
                  backgroundColor: activeTemplate.paperBg,
                  backgroundImage: activeTemplate.paperTextureCss,
                  color: activeTemplate.inkColor,
                  borderColor: activeTemplate.borderTint,
                  fontFamily: activeTemplate.bodyFont,
                }}
              >
                {/* Living Illuminated Header Banner (with Volumetric Sheen & Interactive Progress Artifact) */}
                <div
                  className="px-7 py-6 relative overflow-hidden"
                  style={{
                    background: activeTemplate.headerBgGradient,
                    color: activeTemplate.headerTextColor,
                    backgroundSize: '180% 180%',
                    animation: 'pjLivingLightDrift 14s ease-in-out infinite',
                  }}
                >
                  {/* Ambient Living Ornament by Template Kind */}
                  {activeTemplate.ambientMotion === 'CONSTELLATION_DRIFT' && (
                    <div
                      className="pointer-events-none absolute -right-8 -top-8 w-44 h-44 rounded-full border border-teal-300/25 flex items-center justify-center"
                      style={{ animation: 'pjAstrolabeSlowSpin 48s linear infinite' }}
                    >
                      <div className="w-28 h-28 rounded-full border border-dashed border-purple-300/30" />
                    </div>
                  )}
                  {activeTemplate.ambientMotion === 'ZENITH_BREATH_HALO' && (
                    <div
                      className="pointer-events-none absolute right-6 top-4 w-32 h-32 rounded-full bg-sky-300/10 blur-xl"
                      style={{ animation: 'pjZenithBreath 12s ease-in-out infinite' }}
                    />
                  )}

                  <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                          {orgName} · {departmentFolder}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white/15 text-[9px] font-black uppercase tracking-wider">
                          {activeTemplate.badgeLabel}
                        </span>
                      </div>
                      <h3
                        className="text-xl sm:text-2xl font-black leading-tight"
                        style={{ fontFamily: activeTemplate.headingFont }}
                      >
                        {title}
                      </h3>
                      <p className="text-xs opacity-80">{activeTemplate.subtitle}</p>
                    </div>

                    {/* Living Non-Static Progress Artifact (Seals / Rose Petals / Kente Loom / Quest Pips) */}
                    <div className="rounded-2xl bg-black/30 backdrop-blur-md border border-white/15 px-4 py-2.5 text-right min-w-[190px]">
                      <div className="text-[9px] font-black uppercase tracking-widest text-amber-300">
                        {activeTemplate.progressIndicatorLabel}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1.5">
                        {Array.from({ length: Math.max(1, totalQuestionsCount) }).map((_, idx) => {
                          const isLit = idx < answeredCount;
                          return (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black transition-all duration-300"
                              style={{
                                background: isLit ? activeTemplate.secondaryAccent : 'rgba(255,255,255,0.14)',
                                color: isLit ? '#000' : 'rgba(255,255,255,0.5)',
                                boxShadow: isLit ? `0 0 12px ${activeTemplate.secondaryAccent}` : 'none',
                                animation: isLit ? 'pjSealPop 260ms ease-out' : 'none',
                              }}
                              title={`Item ${idx + 1}: ${isLit ? 'Illuminated' : 'Pending'}`}
                            >
                              {isLit ? '✦' : idx + 1}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-[10px] opacity-80 mt-1 font-mono">
                        {answeredCount}/{totalQuestionsCount} Completed ({completionPct}%)
                      </div>
                    </div>
                  </div>

                  {/* Asante Kente Woven Ribbon / Cathedral Rose Bar / Chronometer Ticks */}
                  <div className="mt-4 h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.max(6, completionPct)}%`,
                        background: `linear-gradient(90deg, ${activeTemplate.primaryAccent}, ${activeTemplate.secondaryAccent}, #34d399)`,
                      }}
                    />
                  </div>
                </div>

                {/* Sheet Body */}
                <div className="p-7 space-y-6">
                  {/* FRAME 1: Lesson Reading & Integrated Sacred Library Supplements */}
                  {(activeFrameIdx === 0 || activeFrameIdx === 2) && (
                    <div className="space-y-5">
                      <div
                        className="flex items-center justify-between border-b pb-2"
                        style={{ borderColor: activeTemplate.borderTint }}
                      >
                        <span
                          className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5"
                          style={{ color: activeTemplate.primaryAccent }}
                        >
                          <BookOpen size={13} /> Frame 1 · Interactive Lesson &amp; Scripture Guide
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: activeTemplate.mutedInkColor }}>
                          TelaWriterDevice
                        </span>
                      </div>

                      {unit && unit.lessonBlocks.length > 0 ? (
                        <div className="space-y-3">
                          {unit.lessonBlocks.map((b) => {
                            const parsed = b.scripturePassage ? parseRef(b.scripturePassage) : null;
                            if (b.kind === 'h1' || b.kind === 'h2') {
                              return (
                                <div
                                  key={b.id}
                                  className="flex flex-wrap items-center justify-between gap-2 pt-2 border-b pb-1.5"
                                  style={{ borderColor: activeTemplate.borderTint }}
                                >
                                  <h4
                                    className="text-base font-black"
                                    style={{
                                      color: activeTemplate.inkColor,
                                      fontFamily: activeTemplate.headingFont,
                                    }}
                                  >
                                    {b.text}
                                  </h4>
                                  {parsed && (
                                    <button
                                      type="button"
                                      onClick={() => openScripture(parsed)}
                                      className="px-3 py-1 rounded-full text-white text-[10px] font-black inline-flex items-center gap-1 shadow-sm transition-transform hover:scale-105"
                                      style={{ backgroundColor: activeTemplate.primaryAccent }}
                                    >
                                      <BookOpen size={10} /> Open {b.scripturePassage} in Verse
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <p
                                key={b.id}
                                className="text-sm leading-relaxed"
                                style={{ color: activeTemplate.inkColor }}
                              >
                                {b.text}
                              </p>
                            );
                          })}
                        </div>
                      ) : writerDevice && writerDevice.blocks.length > 0 ? (
                        <div className="space-y-2.5">
                          {writerDevice.blocks.map((b) => (
                            <div key={b.id} className="text-sm leading-relaxed">
                              {b.kind === 'h1' || b.kind === 'h2' ? (
                                <h4
                                  className="font-black text-base pt-1"
                                  style={{ fontFamily: activeTemplate.headingFont }}
                                >
                                  {b.text}
                                </h4>
                              ) : b.kind === 'callout' ? (
                                <div
                                  className="rounded-xl p-3 text-xs font-semibold border"
                                  style={{
                                    backgroundColor: activeTemplate.cardBg,
                                    borderColor: activeTemplate.borderTint,
                                  }}
                                >
                                  {b.text}
                                </div>
                              ) : (
                                <p>{b.text}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{resolvedOriginalText}</p>
                      )}

                      {/* INTEGRATED SACRED LIBRARY SUPPLEMENTAL PRIMARY SOURCES & ARTIFACTS */}
                      {sacredSupplements.length > 0 && (
                        <div
                          className="rounded-2xl border p-5 space-y-3.5 mt-4"
                          style={{
                            backgroundColor: activeTemplate.cardBg,
                            borderColor: activeTemplate.borderTint,
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-7 h-7 rounded-xl flex items-center justify-center text-white"
                                style={{ backgroundColor: activeTemplate.primaryAccent }}
                              >
                                <ScrollText size={14} />
                              </span>
                              <div>
                                <div
                                  className="text-[10px] font-black uppercase tracking-widest"
                                  style={{ color: activeTemplate.primaryAccent }}
                                >
                                  Lorea Sacred Library · Integrated Lesson Supplements ({sacredSupplements.length})
                                </div>
                                <h5
                                  className="text-sm font-black"
                                  style={{ fontFamily: activeTemplate.headingFont }}
                                >
                                  Primary Manuscripts, Church Fathers, Artifacts &amp; Historical Evidence
                                </h5>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sacredSupplements.map((sup) => {
                              const isPinned = Boolean(pinnedSupplementIds[sup.id]);
                              return (
                                <div
                                  key={sup.id}
                                  className="rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all hover:shadow-md"
                                  style={{
                                    backgroundColor: activeTemplate.paperBg,
                                    borderColor: activeTemplate.borderTint,
                                  }}
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-1">
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white"
                                        style={{ backgroundColor: activeTemplate.primaryAccent }}
                                      >
                                        {sup.categoryBadge}
                                      </span>
                                      <span
                                        className="text-[10px] font-mono"
                                        style={{ color: activeTemplate.mutedInkColor }}
                                      >
                                        {sup.era}
                                      </span>
                                    </div>
                                    <div
                                      className="text-xs font-black leading-snug"
                                      style={{ fontFamily: activeTemplate.headingFont }}
                                    >
                                      {sup.title}
                                    </div>
                                    <p
                                      className="text-[11px] leading-relaxed"
                                      style={{ color: activeTemplate.mutedInkColor }}
                                    >
                                      {sup.summary}
                                    </p>
                                    {sup.primaryExcerpt && (
                                      <blockquote
                                        className="border-l-2 pl-2.5 py-1 text-[11px] italic"
                                        style={{
                                          borderColor: activeTemplate.secondaryAccent,
                                          color: activeTemplate.inkColor,
                                        }}
                                      >
                                        {sup.primaryExcerpt}
                                      </blockquote>
                                    )}
                                    <div
                                      className="rounded-lg px-2.5 py-1.5 text-[11px]"
                                      style={{
                                        backgroundColor: 'rgba(184, 134, 11, 0.08)',
                                        color: activeTemplate.inkColor,
                                      }}
                                    >
                                      <strong>Worksheet Integration:</strong> {sup.connectionToLesson}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: activeTemplate.borderTint }}>
                                    <button
                                      type="button"
                                      onClick={() => handlePinSupplementToNotebook(sup)}
                                      className="px-2.5 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 border transition"
                                      style={{
                                        borderColor: activeTemplate.primaryAccent,
                                        color: isPinned ? '#fff' : activeTemplate.primaryAccent,
                                        backgroundColor: isPinned ? activeTemplate.primaryAccent : 'transparent',
                                      }}
                                    >
                                      <BookmarkPlus size={11} />
                                      {isPinned ? 'Pinned to Sacred Notebook' : 'Pin to Sacred Notebook'}
                                    </button>
                                    <a
                                      href={sup.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] font-bold inline-flex items-center gap-1 hover:underline"
                                      style={{ color: activeTemplate.primaryAccent }}
                                    >
                                      <ExternalLink size={10} /> Inspect Source
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* FRAME 2: Living Interactive Student Form & Bound Answer Key Rubric */}
                  {(activeFrameIdx === 1 || activeFrameIdx === 2) && (
                    <div className="space-y-4 pt-2">
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                        style={{ borderColor: activeTemplate.borderTint }}
                      >
                        <span
                          className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5"
                          style={{ color: activeTemplate.primaryAccent }}
                        >
                          <CheckCircle2 size={13} /> Frame 2 · Living Interactive Worksheet &amp; Auto-Graded Rubric
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: activeTemplate.mutedInkColor }}>
                          TelaFormDevice + TelaBaseDevice
                        </span>
                      </div>

                      {questionsList.length > 0 ? (
                        <div className="space-y-3.5">
                          {questionsList.map((q) => {
                            const val = previewResponses[q.id] || '';
                            const isAnswered = val.trim().length > 0;
                            const isFocused = focusedQuestionId === q.id;
                            const parsedRef = q.scripturePassage ? parseRef(q.scripturePassage) : null;

                            return (
                              <div
                                key={q.id}
                                onMouseEnter={() => setFocusedQuestionId(q.id)}
                                onFocus={() => setFocusedQuestionId(q.id)}
                                className="rounded-2xl border p-4 space-y-2.5 transition-all duration-200"
                                style={{
                                  backgroundColor: activeTemplate.cardBg,
                                  borderColor: isAnswered
                                    ? activeTemplate.secondaryAccent
                                    : isFocused
                                      ? activeTemplate.primaryAccent
                                      : activeTemplate.borderTint,
                                  boxShadow: isFocused || isAnswered ? activeTemplate.cardActiveGlowCss : 'none',
                                  transform: isFocused ? 'translateY(-1px)' : 'none',
                                }}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <p
                                    className="text-sm font-bold leading-snug"
                                    style={{ color: activeTemplate.inkColor }}
                                  >
                                    <span
                                      className="font-black mr-1.5"
                                      style={{ color: activeTemplate.primaryAccent }}
                                    >
                                      Q{q.number}.
                                    </span>
                                    {q.prompt}
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isAnswered && (
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white"
                                        style={{
                                          backgroundColor: activeTemplate.secondaryAccent,
                                          animation: 'pjSealPop 220ms ease-out',
                                        }}
                                      >
                                        ✦ Illuminated
                                      </span>
                                    )}
                                    {parsedRef && (
                                      <button
                                        type="button"
                                        onClick={() => openScripture(parsedRef)}
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                                        style={{
                                          borderColor: activeTemplate.primaryAccent,
                                          color: activeTemplate.primaryAccent,
                                        }}
                                      >
                                        {q.scripturePassage}
                                      </button>
                                    )}
                                    <span
                                      className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                                      style={{
                                        borderColor: activeTemplate.borderTint,
                                        color: activeTemplate.mutedInkColor,
                                      }}
                                    >
                                      {q.points} pts
                                    </span>
                                  </div>
                                </div>

                                {q.options && q.options.length > 0 ? (
                                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                                    {q.options.map((opt) => {
                                      const selected = val === opt;
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() =>
                                            setPreviewResponses((prev) => ({ ...prev, [q.id]: opt }))
                                          }
                                          className="text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-150"
                                          style={{
                                            backgroundColor: selected
                                              ? activeTemplate.primaryAccent
                                              : activeTemplate.paperBg,
                                            color: selected ? '#fff' : activeTemplate.inkColor,
                                            borderColor: selected
                                              ? activeTemplate.primaryAccent
                                              : activeTemplate.borderTint,
                                            transform: selected ? 'scale(1.01)' : 'none',
                                          }}
                                        >
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <input
                                    value={val}
                                    onChange={(e) =>
                                      setPreviewResponses((prev) => ({ ...prev, [q.id]: e.target.value }))
                                    }
                                    placeholder="Type your response on this living Tela worksheet..."
                                    className="w-full border rounded-xl px-3.5 py-2 text-xs outline-none transition"
                                    style={{
                                      backgroundColor: activeTemplate.paperBg,
                                      borderColor: activeTemplate.borderTint,
                                      color: activeTemplate.inkColor,
                                    }}
                                  />
                                )}

                                {((canViewAnswerKey && showExpectedAnswers) || checkedPreview) &&
                                  (q.correctAnswer || q.explanation) && (
                                    <div
                                      className="rounded-xl px-3 py-2 text-[11px] space-y-0.5 border"
                                      style={{
                                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                        borderColor: 'rgba(16, 185, 129, 0.35)',
                                        color: activeTemplate.inkColor,
                                      }}
                                    >
                                      {q.correctAnswer && (
                                        <div>
                                          <strong>Bound Tela Answer Key:</strong> {q.correctAnswer}
                                        </div>
                                      )}
                                      {q.explanation && (
                                        <div style={{ color: activeTemplate.mutedInkColor }}>
                                          <strong>Rubric / Explanation:</strong> {q.explanation}
                                        </div>
                                      )}
                                    </div>
                                  )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Interactive Check & Grade Bar */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t"
                        style={{ borderColor: activeTemplate.borderTint }}
                      >
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <Award size={15} style={{ color: activeTemplate.primaryAccent }} />
                          <span>
                            {gradeSummary
                              ? `${activeTemplate.completionRewardLabel} · Score: ${gradeSummary.earned}/${gradeSummary.total} pts (${gradeSummary.pct}%)`
                              : `Interactive Tela Base Table · ${questionsList.length} Auto-Graded Fields`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCheckedPreview(true)}
                          className="px-4 py-2 rounded-full text-white text-xs font-black inline-flex items-center gap-1.5 shadow-md transition-transform hover:scale-105"
                          style={{ backgroundColor: activeTemplate.primaryAccent }}
                        >
                          <Check size={13} /> Test Interactive Auto-Grading
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TEASE & BUILD YOUR OWN LIVING WORKSHEET / QUIZ CTA BAR */}
                  <div
                    className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border mt-4"
                    style={{
                      background: activeTemplate.headerBgGradient,
                      color: activeTemplate.headerTextColor,
                      borderColor: activeTemplate.secondaryAccent,
                    }}
                  >
                    <div className="space-y-0.5 max-w-lg">
                      <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                        <Wand2 size={12} /> Inspired by {activeTemplate.name}?
                      </div>
                      <p className="text-xs font-bold">
                        Build your own living worksheet, quiz, or test with this exact Council design from any Google Doc, PDF, Form, or Scripture passage!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onBuildYourOwnWithTemplate) {
                          onBuildYourOwnWithTemplate(activeTemplate);
                        } else {
                          onClose();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg shrink-0"
                    >
                      <Sparkles size={13} /> Build Your Own with This Design
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelaDocumentPreviewModal;
