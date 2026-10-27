// components/desk/AssignToClassModal.tsx
// Teacher / Instructor Modal to Assign an Interactive Tela Worksheet, Quiz, or Test Digitally to a Class's Student Desks

import React, { useState } from 'react';
import {
  X,
  Send,
  Sparkles,
  Calendar,
  Users,
  Palette,
  CheckCircle2,
  BookOpen,
  Layers,
  GraduationCap,
} from 'lucide-react';
import type { IngestedCurriculumUnit } from '../../services/curriculumIngestionService';
import type { ChurchProgram } from '../../services/churchEducationService';
import {
  ALL_LIVING_DOCUMENT_TEMPLATES,
  DEFAULT_LIVING_TEMPLATE_ID,
  getDefaultLivingTemplateForUnit,
  getLivingTemplateById,
} from '../../services/council/livingDocumentTemplates';
import {
  assignUnitToClassroomDesk,
  type DeskContextDomain,
  type UniversalDeskAssignment,
} from '../../services/universalStudentDeskService';
import {
  GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  GREAT_FAITH_MINISTRIES_NAME,
} from '../../services/orgAssets';

export interface AssignToClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: IngestedCurriculumUnit;
  orgId?: string;
  orgName?: string;
  defaultDomain?: DeskContextDomain;
  programs?: ChurchProgram[];
  teacherUid?: string;
  teacherName?: string;
  onAssigned?: (assignment: UniversalDeskAssignment) => void;
  onOpenStudentDesk?: (assignment: UniversalDeskAssignment) => void;
}

const DEFAULT_CHURCH_CLASSES = [
  { id: 'prog-adult-bible-study', name: 'Wednesday Sanctuary Bible Study (Revelation 2)' },
  { id: 'prog-sunday-school', name: 'Sunday Morning Christian Education' },
  { id: 'prog-youth-discipleship', name: 'Youth & Young Adults Discipleship' },
  { id: 'prog-theology-track', name: 'Great Faith Leadership & Theology Track' },
];

const DEFAULT_ACADEMIA_CLASSES = [
  { id: 'class-ela-honors', name: 'Honors Humanities & Literature (Room 4B)' },
  { id: 'class-stem-lab', name: 'STEM Quantitative & Astronomy Lab' },
  { id: 'class-history-seminar', name: 'World History & Ancient Civilizations' },
  { id: 'class-homeroom-all', name: 'Academia Homeroom · All Enrolled Students' },
];

const DUE_PRESETS = [
  'Due Today · 5:00 PM',
  'Due Tomorrow · 11:59 PM',
  'Due Sunday · 9:15 AM Session',
  'Due Wednesday · 7:00 PM Bible Study',
  'Due Friday · 3:30 PM',
];

export const AssignToClassModal: React.FC<AssignToClassModalProps> = ({
  isOpen,
  onClose,
  unit,
  orgId = GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  orgName = GREAT_FAITH_MINISTRIES_NAME,
  defaultDomain = 'CHRISTIAN_EDUCATION',
  programs = [],
  teacherUid = 'instructor_great_faith',
  teacherName = 'Class Instructor',
  onAssigned,
  onOpenStudentDesk,
}) => {
  const [domain, setDomain] = useState<DeskContextDomain>(defaultDomain);
  const classroomOptions =
    domain === 'CHRISTIAN_EDUCATION'
      ? programs.length > 0
        ? programs.map(p => ({ id: p.id, name: p.name }))
        : DEFAULT_CHURCH_CLASSES
      : DEFAULT_ACADEMIA_CLASSES;

  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    classroomOptions[0]?.id || 'prog-adult-bible-study'
  );
  const [dueLabel, setDueLabel] = useState<string>(DUE_PRESETS[2]);
  const [livingTemplateId, setLivingTemplateId] = useState<string>(
    DEFAULT_LIVING_TEMPLATE_ID || unit.livingTemplateId || getDefaultLivingTemplateForUnit(unit.kind, unit.title).id
  );
  const [instructions, setInstructions] = useState<string>(
    'Complete this interactive Tela worksheet on your Student Desk. Review the Frame 1 passage and attached Sacred Library primary sources, answer each question, and click Turn In to auto-grade and update your Mastery Graph.'
  );
  const [allowSacredLibrary, setAllowSacredLibrary] = useState(true);
  const [allowSelfCheck, setAllowSelfCheck] = useState(true);
  const [allowScratchpad, setAllowScratchpad] = useState(true);
  const [allowHandRaise, setAllowHandRaise] = useState(true);
  const [assignedSuccess, setAssignedSuccess] = useState<UniversalDeskAssignment | null>(null);

  if (!isOpen) return null;

  const activeTpl = getLivingTemplateById(livingTemplateId);

  const handleAssignNow = () => {
    const targetClass =
      classroomOptions.find(c => c.id === selectedClassroomId) || classroomOptions[0];

    const created = assignUnitToClassroomDesk({
      unit,
      domain,
      orgId: domain === 'CHRISTIAN_EDUCATION' ? orgId : 'academia-campus',
      orgName: domain === 'CHRISTIAN_EDUCATION' ? orgName : 'Plajah Academia',
      classroomId: targetClass.id,
      classroomName: targetClass.name,
      dueLabel,
      instructions,
      livingTemplateId,
      assignedByUid: teacherUid,
      assignedByName: teacherName,
      toolsConfig: {
        allowSacredLibraryAndReferences: allowSacredLibrary,
        allowSelfCheckBeforeTurnIn: allowSelfCheck,
        allowScratchpadNotes: allowScratchpad,
        allowHandRaiseQuestion: allowHandRaise,
      },
    });

    setAssignedSuccess(created);
    onAssigned?.(created);
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-amber-400/35 bg-[#0E0B16] text-white shadow-2xl overflow-hidden my-auto"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Plajah Brand Header */}
        <div
          className="p-5 border-b border-white/10 flex items-center justify-between gap-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(107,0,153,0.45) 0%, rgba(212,0,85,0.30) 55%, rgba(255,140,0,0.25) 100%)',
          }}
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1">
                <Sparkles size={11} /> Digital Classroom Assignment · Powered by Tela
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-black uppercase">
                Deliver to Universal Student Desk
              </span>
            </div>
            <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Assign to Class Digitally: {unit.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/75 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {assignedSuccess ? (
          <div className="p-6 space-y-5">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-300 font-black text-base">
                <CheckCircle2 size={20} />
                <span>
                  Assigned Digitally to {assignedSuccess.classroomName} Student Desks!
                </span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed">
                Every student enrolled in <strong>{assignedSuccess.classroomName}</strong> now has{' '}
                <strong>&ldquo;{assignedSuccess.title}&rdquo;</strong> on their{' '}
                <strong>Universal Student Desk</strong> styled with the{' '}
                <strong>{activeTpl.badgeEmoji} {activeTpl.name}</strong> living surface. When they fill it out and click{' '}
                <strong>Turn In</strong>, it auto-grades against your Answer Key and updates your Classroom Mastery Graph &amp; Gradebook.
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold">
                <span className="px-3 py-1 rounded-full bg-black/40 border border-white/15 text-amber-200">
                  📅 {assignedSuccess.dueLabel}
                </span>
                <span className="px-3 py-1 rounded-full bg-black/40 border border-white/15 text-purple-200">
                  {activeTpl.badgeEmoji} {activeTpl.name}
                </span>
                <span className="px-3 py-1 rounded-full bg-black/40 border border-white/15 text-emerald-200">
                  {assignedSuccess.questionCount} Interactive Questions · {assignedSuccess.totalPoints} Pts
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
              >
                Done
              </button>
              {onOpenStudentDesk && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenStudentDesk(assignedSuccess);
                  }}
                  className="px-5 py-2.5 rounded-full text-xs font-black text-white shadow-lg inline-flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                  }}
                >
                  <GraduationCap size={15} /> Open on Universal Student Desk Now →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
            {/* 1. Target Domain & Classroom */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                  1. Platform Context (Shared Infrastructure)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDomain('CHRISTIAN_EDUCATION');
                      const list =
                        programs.length > 0
                          ? programs.map(p => ({ id: p.id, name: p.name }))
                          : DEFAULT_CHURCH_CLASSES;
                      setSelectedClassroomId(list[0]?.id || '');
                    }}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-black text-left transition ${
                      domain === 'CHRISTIAN_EDUCATION'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                        : 'border-white/12 bg-black/40 text-white/65 hover:text-white'
                    }`}
                  >
                    🏛️ {orgName} · Christian Ed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDomain('ACADEMIA');
                      setSelectedClassroomId(DEFAULT_ACADEMIA_CLASSES[0].id);
                    }}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-black text-left transition ${
                      domain === 'ACADEMIA'
                        ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/12 bg-black/40 text-white/65 hover:text-white'
                    }`}
                  >
                    🎓 Plajah Academia Classrooms
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                  <Users size={11} className="inline mr-1" /> Target Classroom / Cohort
                </label>
                <select
                  aria-label="Target Classroom"
                  value={selectedClassroomId}
                  onChange={e => setSelectedClassroomId(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-400"
                >
                  {classroomOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Due Date & Time */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                <Calendar size={11} className="inline mr-1" /> 2. Due Date &amp; Session Schedule
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DUE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDueLabel(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                      dueLabel === preset
                        ? 'bg-amber-400 text-black border-amber-300 font-black'
                        : 'bg-white/5 border-white/12 text-white/70 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                value={dueLabel}
                onChange={e => setDueLabel(e.target.value)}
                placeholder="e.g. Due Sunday · 9:15 AM Session"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>

            {/* 3. Choose the Living Template Surface for the Student's Desk */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1">
                  <Palette size={12} /> 3. Student Desk Living Worksheet / Assessment Design (10 Council Templates)
                </label>
                <span className="text-[11px] font-bold text-purple-300">
                  Selected: {activeTpl.badgeEmoji} {activeTpl.name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ALL_LIVING_DOCUMENT_TEMPLATES.map(tpl => {
                  const isSel = tpl.id === livingTemplateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setLivingTemplateId(tpl.id)}
                      className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1 ${
                        isSel
                          ? 'border-amber-300 ring-2 ring-amber-400/35 scale-[1.02]'
                          : 'border-white/12 opacity-80 hover:opacity-100'
                      }`}
                      style={{ background: tpl.surfaceGradient }}
                    >
                      <span className="text-[10px] font-black text-white leading-tight">
                        {tpl.badgeEmoji} {tpl.name}
                      </span>
                      <span className="text-[9px] text-amber-200/90 font-semibold truncate">
                        {tpl.progressArtifactLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Student Desk Study Aids & Instructions */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                  4. Teacher Instructions on Student Desk
                </label>
                <textarea
                  rows={4}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-xs text-white leading-relaxed outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  <Layers size={11} className="inline mr-1" /> Student Desk Study Tools (Tela Caddy)
                </label>
                <div className="space-y-1.5 rounded-xl border border-white/12 bg-black/40 p-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowSacredLibrary}
                      onChange={e => setAllowSacredLibrary(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Include Lorea Sacred Library &amp; Primary Source Drawer</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowSelfCheck}
                      onChange={e => setAllowSelfCheck(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Allow Pre-Submit &ldquo;Self-Check My Work&rdquo; on Desk</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowScratchpad}
                      onChange={e => setAllowScratchpad(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Enable Tela Desk Scratchpad &amp; Margin Notes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowHandRaise}
                      onChange={e => setAllowHandRaise(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Allow Digital Hand-Raise / Question to Teacher</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
              <div className="text-[11px] text-white/60 flex items-center gap-1.5">
                <BookOpen size={13} className="text-amber-300" />
                <span>
                  {unit.questions.length} Questions · {unit.totalPoints} Pts ·{' '}
                  {unit.sacredLibrarySupplements?.length || 0} Sacred Library Sources
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssignNow}
                  className="px-5 py-2.5 rounded-full text-xs font-black text-white shadow-lg inline-flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                  }}
                >
                  <Send size={13} /> Assign Digitally to Class Student Desks
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignToClassModal;
