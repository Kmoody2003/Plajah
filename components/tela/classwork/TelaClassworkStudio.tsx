// Tela Classwork — the one place lessons, worksheets, quizzes and answer keys come in.
// Every source (file, link, Google Doc "hub" of links, photo of a paper sheet) runs through the same
// pipeline: bring in → extract → sort & pair keys → build a Tela doc → file to Content HQ → send to a class.
// The old entry points (Curriculum & Mastery Studio, Lesson Library upload, worksheet scanner) open this.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, FileUp, Link2, Loader2, Trash2, X } from 'lucide-react';
import { auth } from '../../../services/backendService';
import {
  batchIngestExtractedLinksToTela,
  deleteIngestedUnit,
  extractLinksFromDocxFile,
  extractLinksFromGoogleDocHub,
  ingestCurriculumToTela,
  type IngestedCurriculumUnit,
  type LessonLibraryCategory,
} from '../../../services/curriculumIngestionService';
import { getStandaloneTeacherScopeId } from '../../../services/orgAssets';
import { listPrograms, saveProgram, type ChurchProgram } from '../../../services/churchEducationService';
import { assignUnitToClassroomDesk } from '../../../services/universalStudentDeskService';
import type { TelaClassworkContext } from './classworkTypes';

type ItemStatus = 'queued' | 'working' | 'built' | 'failed';
interface QueueItem {
  id: string;
  label: string;
  file?: File;
  keyFile?: File;
  url?: string;
  /** A Google Doc / Word doc that is a list of links to many lessons. */
  hub?: boolean;
  keyOnly?: boolean;
  status: ItemStatus;
  error?: string;
  units: IngestedCurriculumUnit[];
}

const KEY_RE = /answer[\s_-]*key|\bkey\b|rubric|solutions?|\bans\b/i;
const CATEGORY_LABEL: Record<LessonLibraryCategory, string> = {
  SYLLABUS: 'Syllabus',
  ASSIGNMENT: 'Worksheet',
  COURSE_RESOURCE: 'Lesson / resource',
  QUIZ_EXAM: 'Quiz or test',
  MASTER_SOURCE_DOC: 'Source doc',
  ANSWER_KEY: 'Answer key',
};
const WRITTEN = ['short-answer', 'essay', 'scripture-reflection'];

const tokens = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t && !KEY_RE.test(t));

/** Pair each answer-key file with the lesson file whose name shares the most words. */
export function pairAnswerKeys(files: File[]): Array<{ file: File; keyFile?: File; keyOnly?: boolean }> {
  const keys = files.filter(f => KEY_RE.test(f.name));
  const lessons = files.filter(f => !KEY_RE.test(f.name));
  const out = lessons.map(file => ({ file, keyFile: undefined as File | undefined }));
  for (const k of keys) {
    const kt = new Set(tokens(k.name));
    let best = -1;
    let bestScore = 0;
    out.forEach((o, i) => {
      if (o.keyFile) return;
      const score = tokens(o.file.name).filter(t => kt.has(t)).length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) out[best].keyFile = k;
    else out.push({ file: k, keyFile: undefined, keyOnly: true } as any);
  }
  return out;
}

const nextClassDate = (schedule?: string) => {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const s = (schedule || '').toLowerCase();
  const day = days.findIndex(d => s.includes(d));
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + (day >= 0 ? (day - d.getDay() + 7) % 7 : 2));
  return d;
};

const pill = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[.76rem] font-bold border transition-colors';
const ghost = `${pill} border-white/12 bg-white/[.05] text-white/80 hover:bg-white/10`;
const primary = `${pill} border-transparent text-white`;
const primaryStyle = { background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 6px 20px rgba(212,0,85,.3)' };

const TelaClassworkStudio: React.FC<{
  context: TelaClassworkContext | null;
  onClose: () => void;
  onOpenDoc: (docId: string) => void;
  /** "Back to Kids Sunday School" — leaves Tela for the screen that opened it. */
  onReturn?: () => void;
  returnLabel?: string;
}> = ({ context, onClose, onOpenDoc, onReturn, returnLabel }) => {
  const uid = auth.currentUser?.uid || '';
  const name = auth.currentUser?.displayName || 'Teacher';
  const personal = !context?.orgId;
  const orgId = context?.orgId || getStandaloneTeacherScopeId(uid);
  const orgName = context?.orgName || 'My Content HQ';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [link, setLink] = useState('');
  const [linkIsHub, setLinkIsHub] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const [programs, setPrograms] = useState<ChurchProgram[]>([]);
  const [programId, setProgramId] = useState(context?.programId || '');
  const [weekChoice, setWeekChoice] = useState<string>(context?.weekId || 'new');
  const [assignNow, setAssignNow] = useState(true);
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (personal) return;
    listPrograms(orgId).then(setPrograms).catch(() => setPrograms([]));
  }, [orgId, personal]);

  const program = programs.find(p => p.id === programId);
  const built = useMemo(() => queue.flatMap(q => q.units), [queue]);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const isHubDoc = (f: File) => /\.(docx?)$/i.test(f.name) && /hub|index|course\s*links|resources/i.test(f.name);
    const hubs = files.filter(isHubDoc);
    const rest = files.filter(f => !isHubDoc(f));
    setQueue(prev => [
      ...prev,
      ...hubs.map(f => ({ id: `q_${Math.random().toString(36).slice(2)}`, label: f.name, file: f, hub: true, status: 'queued' as const, units: [] })),
      ...pairAnswerKeys(rest).map(x => ({
        id: `q_${Math.random().toString(36).slice(2)}`,
        label: x.keyFile ? `${x.file.name} + ${x.keyFile.name}` : x.file.name,
        file: x.file,
        keyFile: x.keyFile,
        keyOnly: x.keyOnly,
        status: 'queued' as const,
        units: [],
      })),
    ]);
  };

  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    setQueue(prev => [...prev, { id: `q_${Math.random().toString(36).slice(2)}`, label: url, url, hub: linkIsHub, status: 'queued', units: [] }]);
    setLink('');
    setLinkIsHub(false);
  };

  const patch = (id: string, p: Partial<QueueItem>) => setQueue(prev => prev.map(q => (q.id === id ? { ...q, ...p } : q)));

  const run = async () => {
    setRunning(true);
    const common = {
      orgId,
      orgName,
      scopeKind: (personal ? 'user' : 'org') as 'user' | 'org',
      programId: programId || undefined,
      uploadedByRole: 'INSTRUCTOR',
      createdByName: name,
    };
    for (const item of queue.filter(q => q.status === 'queued' || q.status === 'failed')) {
      patch(item.id, { status: 'working', error: undefined });
      try {
        let units: IngestedCurriculumUnit[] = [];
        if (item.hub) {
          const hub = item.file ? await extractLinksFromDocxFile(item.file) : await extractLinksFromGoogleDocHub(item.url!);
          const res = await batchIngestExtractedLinksToTela({ orgId, orgName, scopeKind: common.scopeKind, programId: common.programId, links: hub.links, includeAnswerKeyDocs: true });
          units = res.map(r => ({ ...r.unit, extractedFromHubTitle: hub.hubTitle }));
        } else {
          const { unit } = await ingestCurriculumToTela({
            ...common,
            lessonFile: item.file,
            lessonUrl: item.url,
            answerKeyFile: item.keyFile,
            isAnswerKeyOnly: item.keyOnly,
          });
          units = [unit];
        }
        patch(item.id, { status: 'built', units });
      } catch (e: any) {
        patch(item.id, { status: 'failed', error: e?.message || 'Could not read this one.' });
      }
    }
    setRunning(false);
    setStep(2);
  };

  const removeUnit = (u: IngestedCurriculumUnit) => {
    deleteIngestedUnit(u.orgId, u.id);
    setQueue(prev => prev.map(q => ({ ...q, units: q.units.filter(x => x.id !== u.id) })));
  };

  const send = async () => {
    if (!program) return;
    setErr('');
    const lessons = built.filter(u => !u.isAnswerKeyOnly && u.libraryCategory !== 'ANSWER_KEY');
    let weeks = program.weeks;
    if (weekChoice === 'new') {
      weeks = [
        ...weeks,
        ...lessons.map((u, i) => ({
          id: `wk_${Date.now().toString(36)}_${i}`,
          title: u.title,
          passage: u.syllabusWeeks[0]?.passage || '',
          note: '',
          unitIds: [u.id],
        })),
      ];
    } else {
      weeks = weeks.map(w => (w.id === weekChoice ? { ...w, unitIds: Array.from(new Set([...(w.unitIds || []), ...lessons.map(u => u.id)])) } : w));
    }
    try {
      await saveProgram({ ...program, weeks });
    } catch {
      setErr('Could not add these to the class. You may not be a teacher on it.');
      return;
    }
    let assigned = 0;
    if (assignNow) {
      const at = nextClassDate(program.meetingSchedule);
      for (const u of lessons.filter(x => x.questions.length > 0)) {
        assignUnitToClassroomDesk({
          unit: u,
          domain: context?.domain || 'CHRISTIAN_EDUCATION',
          orgId,
          orgName,
          classroomId: program.id,
          classroomName: program.name,
          dueAt: at.getTime(),
          dueLabel: `Due ${at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
          assignedByUid: uid,
          assignedByName: name,
        });
        assigned++;
      }
      window.dispatchEvent(new CustomEvent('plajah:eduWorkChanged'));
    }
    setSent(`${lessons.length} added to ${program.name}${assigned ? `, ${assigned} sent to student desks` : ''}.`);
  };

  const counts = {
    queued: queue.filter(q => q.status === 'queued').length,
    failed: queue.filter(q => q.status === 'failed').length,
  };

  return (
    <div className="w-full h-full flex flex-col text-white" style={{ background: '#0d0a14', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-white/[.08]">
        {onReturn && (
          <button type="button" className={ghost} onClick={onReturn}>
            <ArrowLeft size={14} /> Back to {returnLabel || 'class'}
          </button>
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#FF8C00]">Tela Classwork</div>
          <div className="text-[.95rem] font-black truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {orgName}
            {program ? ` › ${program.name}` : context?.programName ? ` › ${context.programName}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {([1, 2, 3] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => (n === 1 || built.length > 0) && setStep(n)}
              className="h-8 px-3 rounded-full text-[.72rem] font-bold"
              style={step === n ? { background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff' } : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.55)' }}
            >
              {n} {n === 1 ? 'Bring in' : n === 2 ? 'Check' : personal ? 'Filed' : 'Send'}
            </button>
          ))}
        </div>
        <button type="button" className="w-9 h-9 grid place-items-center rounded-full bg-white/[.06] hover:bg-white/10" onClick={onClose} aria-label="Close Classwork">
          <X size={15} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[920px] mx-auto px-5 py-6 grid gap-5">
          {step === 1 && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                className="rounded-[22px] border-2 border-dashed p-8 text-center grid gap-2 justify-items-center"
                style={{ borderColor: dragOver ? '#FF8C00' : 'rgba(255,140,0,.4)', background: dragOver ? 'rgba(255,140,0,.1)' : 'rgba(255,140,0,.04)' }}
              >
                <div className="text-lg font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Drop lessons, worksheets, quizzes and answer keys</div>
                <div className="text-[.82rem] text-white/50 max-w-[56ch]">
                  PDF, Word, text, or photos of paper sheets. Drop a whole folder’s worth at once. Files with “key” or “answer” in the name are paired with their worksheet.
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  <button type="button" className={ghost} onClick={() => fileRef.current?.click()}>
                    <FileUp size={14} /> Choose files
                  </button>
                  <button type="button" className={ghost} onClick={() => camRef.current?.click()}>
                    <Camera size={14} /> Scan paper
                  </button>
                </div>
                <input ref={fileRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,image/*" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[.03] p-4 grid gap-3">
                <div className="flex items-center gap-2 text-[.82rem] font-bold">
                  <Link2 size={14} /> Or paste a link
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="cw-link"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addLink()}
                    placeholder="Google Doc, Google Form, or a PDF link"
                    className="flex-1 min-w-[220px] h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-[.86rem] outline-none focus:border-[#FF8C00]/60"
                  />
                  <button type="button" className={ghost} onClick={addLink} disabled={!link.trim()}>
                    Add
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[.78rem] text-white/60">
                  <input type="checkbox" checked={linkIsHub} onChange={e => setLinkIsHub(e.target.checked)} />
                  This doc is a list of links to many lessons (bring them all in)
                </label>
              </div>

              {queue.length > 0 && (
                <div className="rounded-[18px] border border-white/10 overflow-hidden">
                  {queue.map(q => (
                    <div key={q.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[.06] first:border-t-0">
                      <span className="w-5 grid place-items-center">
                        {q.status === 'working' ? <Loader2 size={14} className="animate-spin text-[#FF8C00]" /> : q.status === 'built' ? <CheckCircle2 size={14} className="text-emerald-400" /> : q.status === 'failed' ? <X size={14} className="text-rose-400" /> : <span className="w-2 h-2 rounded-full bg-white/30" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[.84rem] font-semibold truncate">{q.label}</div>
                        <div className="text-[.72rem] text-white/45">
                          {q.error || (q.hub ? 'List of links · every lesson inside is brought in' : q.keyOnly ? 'Answer key with no matching worksheet' : q.keyFile ? 'Worksheet + answer key' : q.url ? 'Link' : 'File')}
                          {q.status === 'built' ? ` · built ${q.units.length}` : ''}
                        </div>
                      </div>
                      {q.status !== 'working' && q.status !== 'built' && (
                        <button type="button" className="text-white/40 hover:text-rose-300" onClick={() => setQueue(prev => prev.filter(x => x.id !== q.id))} aria-label={`Remove ${q.label}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={primary} style={primaryStyle} disabled={running || counts.queued + counts.failed === 0} onClick={run}>
                  {running ? <Loader2 size={14} className="animate-spin" /> : null}
                  {running ? 'Building…' : `Build ${counts.queued + counts.failed || ''} into Tela`}
                </button>
                <span className="text-[.76rem] text-white/45">
                  Everything is filed to {personal ? 'your Content HQ' : `Content HQ › ${orgName} Education`}, with the original kept next to the Tela version.
                </span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-[.84rem] text-white/60">
                {built.length} built. Open any of them in Tela to fix a question; answer keys are visible to teachers only.
              </div>
              {counts.failed > 0 && (
                <button type="button" className="justify-self-start text-[.8rem] text-rose-300 underline" onClick={() => setStep(1)}>
                  {counts.failed} couldn’t be read. See why and try again.
                </button>
              )}
              {built.length === 0 && <div className="text-[.84rem] text-white/45">Nothing built yet.</div>}
              <div className="grid gap-2.5">
                {built.map(u => {
                  const auto = u.questions.filter(q => !WRITTEN.includes(q.type) && q.correctAnswer).length;
                  const hasKey = !!(u.rawAnswerKeyText || u.answerKeySourceLabel);
                  return (
                    <div key={u.id} className="rounded-[16px] border border-white/10 bg-white/[.03] p-3.5 grid gap-2.5 md:grid-cols-[1fr_1fr] md:items-start">
                      <div className="min-w-0 grid gap-1">
                        <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-white/35">Original</div>
                        <div className="text-[.82rem] font-semibold truncate">{u.sourceLabel}</div>
                        <div className="text-[.74rem] text-white/45 line-clamp-3 whitespace-pre-wrap">{(u.rawCurriculumText || '').slice(0, 260) || 'No text found'}</div>
                      </div>
                      <div className="min-w-0 grid gap-1.5">
                        <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#FF8C00]">What we made</div>
                        <div className="text-[.9rem] font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>{u.title}</div>
                        <div className="flex flex-wrap gap-1.5 text-[.66rem] font-bold">
                          <span className="px-2 py-0.5 rounded-full bg-white/[.08] text-white/70">{CATEGORY_LABEL[u.libraryCategory || 'ASSIGNMENT']}</span>
                          {u.questions.length > 0 && <span className="px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300">{u.questions.length} questions · {auto} auto-graded</span>}
                          {hasKey && <span className="px-2 py-0.5 rounded-full bg-violet-300/15 text-violet-200">Answer key · teachers only</span>}
                          {u.departmentFolder && <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300">Content HQ › {u.departmentFolder}{u.documentClassFolder ? ` › ${u.documentClassFolder}` : ''}</span>}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button type="button" className={ghost} onClick={() => onOpenDoc(u.telaDocId)}>
                            Open in Tela
                          </button>
                          <button type="button" className={ghost} onClick={() => removeUnit(u)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {built.length > 0 && (
                <button type="button" className={`${primary} justify-self-start`} style={primaryStyle} onClick={() => setStep(3)}>
                  {personal ? 'Done' : 'Next: send to a class'}
                </button>
              )}
            </>
          )}

          {step === 3 && (
            <div className="rounded-[20px] border border-white/12 bg-white/[.03] p-5 grid gap-4">
              {personal ? (
                <>
                  <div className="text-lg font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Filed to your Content HQ</div>
                  <div className="text-[.84rem] text-white/60">{built.length} items are under Content HQ, sorted by document type. Assign them from any class you teach.</div>
                </>
              ) : sent ? (
                <>
                  <div className="text-lg font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Done</div>
                  <div className="text-[.86rem] text-emerald-300">{sent}</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Send to a class</div>
                  <label className="grid gap-1 text-[.74rem] font-bold text-white/50">
                    Class
                    <select id="cw-class" value={programId} onChange={e => { setProgramId(e.target.value); setWeekChoice('new'); }} className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-[.86rem] text-white">
                      <option value="">Just file them, no class</option>
                      {programs.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  {program && (
                    <>
                      <label className="grid gap-1 text-[.74rem] font-bold text-white/50">
                        Week
                        <select id="cw-week" value={weekChoice} onChange={e => setWeekChoice(e.target.value)} className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-[.86rem] text-white">
                          <option value="new">A new week for each lesson</option>
                          {program.weeks.map((w, i) => (
                            <option key={w.id} value={w.id}>Week {i + 1} · {w.title}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-[.82rem] text-white/70">
                        <input type="checkbox" checked={assignNow} onChange={e => setAssignNow(e.target.checked)} />
                        Also send worksheets and quizzes to student desks, due next class
                      </label>
                    </>
                  )}
                  {err && <div className="text-[.8rem] text-rose-300">{err}</div>}
                  <button type="button" className={`${primary} justify-self-start`} style={primaryStyle} disabled={!program} onClick={send}>
                    {program ? `Add to ${program.name}` : 'Pick a class'}
                  </button>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {onReturn && (
                  <button type="button" className={ghost} onClick={onReturn}>
                    <ArrowLeft size={14} /> Back to {returnLabel || 'class'}
                  </button>
                )}
                <button type="button" className={ghost} onClick={() => { setQueue([]); setSent(null); setStep(1); }}>
                  Bring in more
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelaClassworkStudio;
