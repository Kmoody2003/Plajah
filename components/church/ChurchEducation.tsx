import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Christian Education for a Church Organization:
 * - Pre-seeded with 7 Default Templated Classrooms (Sunday School, Junior Bible Explorers,
 *   Youth & Confirmation Catechism, Adult Foundations, Wednesday Inductive Scripture Lab,
 *   Baptismal Preparation, and Sacred Music & Liturgical Worship Formation).
 * - Each classroom has its own Dedicated Classroom Chat Room (`chatRoomId` via `orgChatService`)
 *   plus inline class discussion and one-click launch into full Plajah Chat.
 * - Reuses the Academia Classroom & Ed-Tech Stack: Class Roster/Gradebook (`createChurchClass`),
 *   Academia Curriculum Courses (`COURSES`), Paper Worksheet Digitizer (`digitizeWorksheetOnDevice`),
 *   and Tela Lesson / Assignment Builder (`saveTelaDoc` + `plajah:openTela`).
 */
const field =
  'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50 placeholder:text-white/25';
const nav = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));

const ChurchEducation: React.FC<{
  church: Organization;
  canEdit: boolean;
  onOpenChatRoom?: (roomId: string) => void;
}> = ({ church, canEdit, onOpenChatRoom }) => {
  const [programs, setPrograms] = useState<ChurchProgram[] | null>(null);
  const [open, setOpen] = useState<ChurchProgram | null>(null);
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'CLASS_CHAT' | 'ACADEMIA_STACK'>('SYLLABUS');
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

  const reload = async () => {
    try {
      const list = await ensureDefaultTemplatedClassrooms(church);
      setPrograms(list);
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

  if (open) {
    const p = open;
    const set = (patch: Partial<ChurchProgram>) => setOpen({ ...p, ...patch });
    const setWeek = (i: number, patch: Partial<PlanWeek>) =>
      set({ weeks: p.weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

    return (
      <div className="space-y-4 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
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

          {/* 3-Tab Classroom Navigation */}
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
              <BookOpen size={13} /> Weekly Lectio Syllabus ({p.weeks.length})
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
              <GraduationCap size={13} /> Academia Ed-Tech & Worksheet Scanner
            </button>
          </div>
        </div>

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
                          Lectio can&apos;t read this passage yet. Check the book name and chapter:verse.
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
                        <BookOpen size={12} /> Read {w.passage} in Lectio
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
                    onClick={() => nav('LEARN')}
                    className="px-3 py-1.5 rounded-xl border border-white/20 text-white text-[11px] font-bold"
                  >
                    Open in Academia
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
                  <Sparkles size={14} /> Tela Lesson & Study Guide
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
      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-transparent p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
            Christian Education · Powered by Academia &amp; Lectio
          </p>
          <h3 className="text-lg font-black mt-0.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {church.name} — Templated Classrooms &amp; Catechism Hub
          </h3>
          <p className="text-xs text-white/65 mt-0.5">
            Every classroom comes pre-configured with a weekly Lectio Scripture syllabus, its own governed Classroom Chat room, and the Academia Ed-Tech stack (Roster, Paper Worksheet Scanner &amp; Tela Lesson Builder).
          </p>
        </div>
        <button
          type="button"
          onClick={() => nav('LEARN')}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold inline-flex items-center gap-1.5"
        >
          <GraduationCap size={14} /> Open Academia Hub
        </button>
      </div>

      {programs === null && <p className="text-sm text-white/40">Loading templated classrooms...</p>}

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
                  setActiveTab('CLASS_CHAT');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold inline-flex items-center gap-1"
              >
                <MessageSquare size={12} /> Class Chat ({(p.chatMessages || []).length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ACADEMIA_STACK');
                  setOpen(p);
                }}
                className="px-3 py-1.5 rounded-xl border border-white/15 text-white/75 hover:text-white text-[11px] font-bold inline-flex items-center gap-1"
              >
                <FileScan size={12} /> Ed-Tech &amp; Worksheets
              </button>
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/45 flex items-center gap-1.5">
            <GraduationCap size={13} /> Add or Restore a Default Templated Classroom
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

