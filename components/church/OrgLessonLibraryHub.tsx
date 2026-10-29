// components/church/OrgLessonLibraryHub.tsx
// The Lesson Library for Christian Education and Academia teachers: every lesson, assignment, quiz/exam,
// resource and syllabus an org (or a standalone teacher) has, shown as the Tela page students work on.
//
// Built around three jobs:
//   • Find & preview — filter by kind, search, tap a page to read it in the side panel (Tela page first,
//     the original file it came from second, the answer key third and only for those allowed).
//   • Assign & schedule — select several items, pick a course, lay their due dates out on its calendar
//     (AssignScheduleSheet). Students see each one from the day you choose.
//   • Course calendar — what's scheduled for each course; tap an item to preview or move it (CourseCalendar).
//
// Answer keys (ANSWER_KEY items and each item's key) only reach viewers with canAccessAnswerKey: course
// teachers, department heads/admins, pastors/owners. Students and members never see them.
// Opening the library brings it into view where the viewer is, rather than leaving it above the fold.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ExternalLink, FolderOpen, KeyRound, Lock, Plus, Search, Trash2, X } from 'lucide-react';
import {
  listIngestedUnits,
  ensureAllDetectedLinksOnboarded,
  deleteIngestedUnit,
  getCourseImportReport,
  type CourseImportReport,
  type IngestedCurriculumUnit,
  type LessonLibraryCategory,
} from '../../services/curriculumIngestionService';
import type { ChurchProgram } from '../../services/churchEducationService';
import { isStandaloneTeacherScopeId } from '../../services/orgAssets';
import { TelaDocumentPreviewModal } from './TelaDocumentPreviewModal';
import { openTelaClasswork } from './christianEd/edWork';
import { ED_CSS } from './christianEd/edStyles';
import TelaPage, { KIND_META, TELA_PAGE_CSS, kindOf } from './library/TelaPage';
import AssignScheduleSheet, { type ScheduledResult } from './library/AssignScheduleSheet';
import CourseCalendar from './library/CourseCalendar';
import { useCourseSource } from './library/courseSource';
import { fmtDay } from './christianEd/edWork';

export interface OrgLessonLibraryHubProps {
  orgId: string;
  orgName: string;
  /** 'user' for standalone teachers not in an organization; 'org' for organizations. */
  scopeKind?: 'org' | 'user';
  programId?: string;
  programs?: ChurchProgram[];
  /** True when the viewer is a Course Teacher/Instructor, Dept Head, Dept Admin, or Pastor/Owner. */
  canAccessAnswerKey: boolean;
  /** True when the viewer can add to the library and assign from it. */
  canUploadToLibrary: boolean;
  viewerRoleBadge?: string;
  currentUserUid?: string;
  currentUserName?: string;
  onAttachWeeksToProgram?: (programId: string, unit: IngestedCurriculumUnit) => Promise<void>;
  /** Saves a course (used by "add to the course plan" when scheduling). */
  onSaveProgram?: (p: ChurchProgram) => Promise<void>;
  onOpenContentHQ?: () => void;
}

type Filter = 'ALL' | 'ASSIGNMENT' | 'QUIZ_EXAM' | 'COURSE_RESOURCE' | 'SYLLABUS' | 'ANSWER_KEY';
const FILTERS: Array<[Filter, string]> = [
  ['ALL', 'Everything'],
  ['ASSIGNMENT', 'Assignments'],
  ['QUIZ_EXAM', 'Quizzes & exams'],
  ['COURSE_RESOURCE', 'Resources'],
  ['SYLLABUS', 'Syllabi'],
  ['ANSWER_KEY', 'Answer keys'],
];
const groupOf = (c: LessonLibraryCategory): Filter => (c === 'MASTER_SOURCE_DOC' ? 'SYLLABUS' : c);
const isKeyOnly = (u: IngestedCurriculumUnit) => Boolean(u.isAnswerKeyOnly) || u.libraryCategory === 'ANSWER_KEY';
const hasKey = (u: IngestedCurriculumUnit) => Boolean(u.rawAnswerKeyText || u.answerKeySourceLabel || u.questions.some(q => q.correctAnswer));
const hasOriginal = (u: IngestedCurriculumUnit) => Boolean(u.sourceUrl || u.rawCurriculumText);

const LIB_CSS = `
.lib{display:grid;gap:16px}
.lib .lib-head{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.lib .lib-head h2{font-size:1.5rem;font-weight:900;letter-spacing:-.01em}
.lib .lib-tabs{display:inline-flex;padding:3px;border-radius:99px;background:var(--g1);border:1px solid var(--bd)}
.lib .lib-tabs button{appearance:none;border:0;background:transparent;color:var(--dim);font:700 .78rem/1 var(--fd);height:32px;padding:0 14px;border-radius:99px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.lib .lib-tabs button[aria-pressed="true"]{background:#fff;color:#14101c}
.lib .lib-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.lib .lib-search{display:flex;align-items:center;gap:8px;flex:1 1 220px;min-width:0;max-width:360px;height:38px;padding:0 12px;border-radius:99px;background:rgba(0,0,0,.3);border:1px solid var(--bd)}
.lib .lib-search input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--ink);font-size:.86rem}
.lib .lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}
.lib .lib-card{position:relative;display:grid;gap:9px;align-content:start;min-width:0}
.lib .lib-card .lib-open{appearance:none;border:0;background:transparent;padding:0;cursor:pointer;text-align:left;color:inherit;display:grid;gap:9px;border-radius:10px}
.lib .lib-card .lib-open:hover .tp-thumb{transform:translateY(-3px);box-shadow:0 14px 34px rgba(0,0,0,.45)}
.lib .lib-card .tp-thumb{transition:transform .18s ease,box-shadow .18s ease;border-radius:6px}
.lib .lib-card.sel .tp-thumb{outline:3px solid var(--magenta);outline-offset:3px}
.lib .lib-card .lib-t{font:800 .9rem/1.3 var(--fd);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lib .lib-card .lib-u{font-size:.74rem;color:var(--faint);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.lib .lib-sel{position:absolute;top:8px;left:8px;z-index:2;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;cursor:pointer;border:1.5px solid rgba(34,28,43,.35);background:rgba(255,255,255,.92);color:#fff}
.lib .lib-sel[aria-checked="true"]{background:var(--magenta);border-color:var(--magenta)}
.lib .lib-kind{position:absolute;top:10px;right:10px;z-index:2;font:800 .58rem/1 var(--fd);letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;border-radius:99px;color:#14101c}
.lib .tag{display:inline-flex;gap:3px;align-items:center}
.lib .lib-filter-select{display:none}
.lib .lib-dot{width:9px;height:9px;border-radius:99px;flex-shrink:0;display:inline-block}
.lib .lib-empty{border:1px dashed var(--bd2);border-radius:20px;padding:34px 20px;text-align:center;display:grid;gap:8px;justify-items:center}
.lib .lib-actionbar{position:sticky;bottom:calc(var(--pj-mobile-nav-h,0px) + 14px);z-index:40;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px 10px 16px;border-radius:18px;background:rgba(20,16,32,.96);border:1px solid var(--bd2);box-shadow:0 16px 40px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.lib-scrim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:210}
.lib-panel{position:fixed;z-index:211;top:0;right:0;bottom:0;width:min(620px,100vw);background:#100d19;border-left:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.5);animation:libIn .2s ease-out}
@keyframes libIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
.lib-panel .lib-ph{padding:14px 16px;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid var(--bd);padding-top:max(14px,env(safe-area-inset-top))}
.lib-panel .lib-ph h3{font-size:1.05rem;font-weight:900}
.lib-panel .lib-pt{display:flex;gap:4px;padding:10px 16px 0}
.lib-panel .lib-pt button{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dim);font:700 .8rem/1 var(--fd);padding:10px 8px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.lib-panel .lib-pt button[aria-selected="true"]{color:#fff;border-bottom-color:var(--magenta)}
.lib-panel .lib-pb{flex:1;overflow-y:auto;padding:18px 16px;background:radial-gradient(ellipse at top,#1b1528,#0d0b14 70%)}
.lib-panel .lib-pf{padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--bd);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.lib-panel .lib-src{font:500 .8rem/1.6 var(--fm);white-space:pre-wrap;color:var(--dim);background:rgba(0,0,0,.35);border:1px solid var(--bd);border-radius:14px;padding:14px}
.lib-panel .lib-keyq{border:1px solid var(--bd);border-radius:14px;padding:10px 12px;display:grid;gap:4px;font-size:.84rem;background:var(--g1)}
.lib-sheet{position:fixed;z-index:211;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 24px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:#100d19;border:1px solid rgba(255,255,255,.14);border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}
.lib-sheet .lib-sheet-h{display:flex;gap:10px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--bd)}
.lib-sheet .lib-sheet-h h3{font-size:1.1rem;font-weight:900}
.lib-sheet .lib-sheet-b{flex:1;overflow-y:auto;padding:16px 18px;display:grid;gap:18px}
.lib-sheet .lib-sheet-f{display:flex;gap:10px;align-items:center;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--bd)}
.lib-step{display:flex;gap:12px;align-items:flex-start}
.lib-step[aria-disabled="true"]{opacity:.55}
.lib-step-n{width:26px;height:26px;border-radius:99px;flex-shrink:0;display:grid;place-items:center;font:900 .74rem/1 var(--fd);background:var(--brand);color:#fff}
.lib-step-t{font:800 .9rem/1.2 var(--fd)}
.lib-chip-sub{display:block;font-size:.64rem;color:var(--faint);font-weight:500}
.lib-month{font:800 .9rem/1 var(--fd);min-width:120px;text-align:center}
.lib-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.lib-cal-wd{font:700 .62rem/1 var(--fd);color:var(--faint);text-align:center;padding:4px 0;text-transform:uppercase;letter-spacing:.06em}
.lib-cal-d{appearance:none;min-height:62px;border-radius:10px;border:1px solid var(--bd);background:var(--g1);color:var(--ink);padding:4px;display:flex;flex-direction:column;gap:3px;align-items:stretch;text-align:left;min-width:0;font:inherit}
.lib-cal.big .lib-cal-d{min-height:92px}
.lib-cal-d.out{opacity:.38}
.lib-cal-d.meet{border-color:rgba(255,140,0,.55);background:rgba(255,140,0,.06)}
.lib-cal-d.today .lib-cal-n{background:var(--magenta);color:#fff}
.lib-cal-d.target{cursor:pointer}
.lib-cal-d.target:hover{border-color:var(--cyan)}
.lib-cal-n{font:700 .7rem/1 var(--fd);width:20px;height:20px;border-radius:99px;display:grid;place-items:center;color:var(--dim)}
.ce .lib-pill{appearance:none;border:0;display:block;width:100%;font:600 .64rem/1.25 var(--fb);color:#fff;background:color-mix(in srgb,var(--k) 30%,transparent);border-left:3px solid var(--k);border-radius:5px;padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;text-align:left}
.ce .lib-pill.on{outline:2px solid #fff}
.lib-order{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lib-order li{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:12px;border:1px solid var(--bd);background:var(--g1);flex-wrap:wrap}
.lib-order li.on{border-color:var(--cyan)}
.ce .lib-order-t{appearance:none;border:0;background:transparent;color:var(--ink);font:600 .82rem/1.3 var(--fb);text-align:left;cursor:pointer;flex:1 1 180px;min-width:0;display:grid;gap:3px;justify-items:start;padding:4px 0}
.lib-order-d{width:auto!important;max-width:170px;padding:6px 10px!important}
.lib-order-mv{display:flex;gap:4px}
.lib-check{display:flex;gap:8px;align-items:center;font-size:.82rem;color:var(--dim);cursor:pointer}
.lib-check input{width:18px;height:18px;accent-color:#D40055}
.lib-calview{display:grid;gap:12px}
.lib-calsel{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:16px;border:1px solid var(--cyan);background:rgba(0,218,243,.06)}
.lib-calsel .t{font:800 .9rem/1.3 var(--fd)}
.lib-agenda{display:grid;gap:6px}
.ce .lib-agenda-r{appearance:none;display:flex;gap:10px;align-items:center;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--bd);background:var(--g1);color:var(--ink);font:600 .84rem/1.2 var(--fb);cursor:pointer;text-align:left;min-width:0}
.lib-agenda-d{font:700 .72rem/1 var(--fm);color:var(--faint);width:52px;flex-shrink:0}
@media(max-width:720px){
  .lib .lib-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .lib .lib-head h2{font-size:1.25rem}
  .lib .lib-head>.grow{flex-basis:100%}
  .lib .lib-head .btn.p{flex:1;justify-content:center}
  .lib .lib-bar>.chips{display:none}
  .lib .lib-filter-select{display:block;flex:1 1 150px;width:auto}
  .lib .lib-search{max-width:none;flex-basis:100%}
  .lib-sheet{left:0;right:0;top:auto;bottom:0;transform:none;width:100%;max-height:92dvh;border-radius:22px 22px 0 0}
  .lib-panel{width:100vw;border-left:0}
  .lib-cal-d{min-height:44px}
  .lib-cal.big .lib-cal-d{min-height:52px}
  .ce .lib-cal-d .lib-pill{font-size:0;height:6px;padding:0;border-left:0;background:var(--k)}
  .lib-order-d{max-width:none;flex:1 1 140px}
}
@media(prefers-reduced-motion:reduce){.lib-panel{animation:none}.lib .lib-card .tp-thumb{transition:none}}
`;

export const OrgLessonLibraryHub: React.FC<OrgLessonLibraryHubProps> = ({
  orgId,
  orgName,
  scopeKind,
  programId,
  programs = [],
  canAccessAnswerKey,
  canUploadToLibrary,
  currentUserUid = '',
  currentUserName = 'Teacher',
  onSaveProgram,
  onOpenContentHQ,
}) => {
  const isStandaloneTeacher = scopeKind === 'user' || isStandaloneTeacherScopeId(orgId);
  const rootRef = useRef<HTMLDivElement>(null);

  const [units, setUnits] = useState<IngestedCurriculumUnit[]>(() => listIngestedUnits(orgId, programId, orgName));
  const [view, setView] = useState<'library' | 'calendar'>('library');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'page' | 'original' | 'key'>('page');
  const [fullPreview, setFullPreview] = useState<IngestedCurriculumUnit | null>(null);
  const [scheduling, setScheduling] = useState<string[] | null>(null);
  // Inside an org: its Christian Ed courses. A teacher with no org: their own Academia classes.
  const teacherRef = useMemo(() => ({ uid: currentUserUid, name: currentUserName }), [currentUserUid, currentUserName]);
  const source = useCourseSource({ programs, orgId, orgName, teacher: teacherRef, academia: isStandaloneTeacher && canUploadToLibrary && !!currentUserUid });
  const courses = source.courses;
  const [calProgram, setCalProgram] = useState(programId || programs[0]?.id || '');
  const [calFocus, setCalFocus] = useState<Date | null>(null);
  useEffect(() => { if (!calProgram && courses[0]) setCalProgram(courses[0].id); }, [calProgram, courses]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [status, setStatus] = useState('');
  // Great Faith's Revelation 2 course is imported link by link; this is what was read and what wasn't.
  const [report, setReport] = useState<CourseImportReport | null>(() => getCourseImportReport(orgId));
  const [reportOpen, setReportOpen] = useState(false);

  const refreshUnits = () => { setUnits(listIngestedUnits(orgId, programId, orgName)); setReport(getCourseImportReport(orgId)); };

  // Open where the viewer is: the library replaces whatever they were looking at, so bring its top into view.
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    refreshUnits();
    let cancelled = false;
    ensureAllDetectedLinksOnboarded(orgId, programId, orgName)
      .then(refreshed => { if (!cancelled) setUnits(refreshed); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, programId, orgName]);

  useEffect(() => {
    const onUpdated = () => refreshUnits();
    window.addEventListener('plajah:lessonLibraryUpdated', onUpdated);
    window.addEventListener('plajah:orgAssetsUpdated', onUpdated);
    return () => {
      window.removeEventListener('plajah:lessonLibraryUpdated', onUpdated);
      window.removeEventListener('plajah:orgAssetsUpdated', onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, programId]);

  const visible = useMemo(() => units.filter(u => canAccessAnswerKey || !isKeyOnly(u)), [units, canAccessAnswerKey]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: visible.length };
    for (const u of visible) c[groupOf(kindOf(u))] = (c[groupOf(kindOf(u))] || 0) + 1;
    return c;
  }, [visible]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible
      .filter(u => filter === 'ALL' || groupOf(kindOf(u)) === filter)
      .filter(u => !q || `${u.title} ${u.subtitle} ${u.sourceLabel} ${u.rawCurriculumText || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [visible, filter, search]);
  const preview = previewId ? visible.find(u => u.id === previewId) || null : null;
  const canAssign = canUploadToLibrary;
  const assignable = (u: IngestedCurriculumUnit) => !isKeyOnly(u);

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const openPreview = (id: string) => { setPreviewId(id); setPanelTab('page'); setConfirmRemove(false); };
  const startAssign = (ids: string[]) => {
    const ok = ids.filter(id => { const u = visible.find(x => x.id === id); return u && assignable(u); });
    if (!ok.length) return;
    setPreviewId(null);
    setScheduling(ok);
  };
  const scheduled = (r: ScheduledResult) => {
    setScheduling(null);
    setSelected([]);
    setCalProgram(r.programId);
    setCalFocus(r.first);
    setStatus(`Scheduled ${r.count} for ${r.programName}: ${fmtDay(r.first)}${r.count > 1 ? ` → ${fmtDay(r.last)}` : ''}.`);
  };
  const newInTela = () =>
    openTelaClasswork({
      orgId: isStandaloneTeacher ? '' : orgId,
      orgName,
      programId,
      programName: programs.find(p => p.id === programId)?.name,
      domain: isStandaloneTeacher ? 'ACADEMIA' : 'CHRISTIAN_EDUCATION',
    });

  const filters = FILTERS.filter(([f]) => f === 'ALL' || (f === 'ANSWER_KEY' ? canAccessAnswerKey && counts[f] : counts[f]));

  return (
    <div ref={rootRef} className="ce lib" style={{ scrollMarginTop: 12 }}>
      <style>{ED_CSS + LIB_CSS + TELA_PAGE_CSS}</style>

      <div className="lib-head">
        <div className="grow">
          <div className="eyebrow">{isStandaloneTeacher ? 'My classroom' : orgName}</div>
          <h2>Lesson Library</h2>
          <div className="small">
            {visible.length} item{visible.length === 1 ? '' : 's'}
            {canAssign ? ' · select pages to assign & schedule them for a course' : ''}
          </div>
        </div>
        {canAssign && courses.length > 0 && (
          <div className="lib-tabs" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'library'} onClick={() => setView('library')}>Library</button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays size={14} /> Course calendar</button>
          </div>
        )}
        {onOpenContentHQ && (
          <button type="button" className="btn sm" onClick={onOpenContentHQ}><FolderOpen size={14} /> Content HQ</button>
        )}
        {canUploadToLibrary && (
          <button type="button" className="btn p" onClick={newInTela}><Plus size={15} /> New in Tela Classwork</button>
        )}
      </div>

      {status && (
        <div className="okmsg row">
          <span className="grow">{status}</span>
          {view !== 'calendar' && courses.length > 0 && <button type="button" className="btn sm" onClick={() => { setView('calendar'); setStatus(''); }}>See calendar</button>}
          <button type="button" className="btn sm" aria-label="Dismiss" onClick={() => setStatus('')}><X size={13} /></button>
        </div>
      )}

      {report && canUploadToLibrary && (
        <div className={report.failed.length ? 'err' : 'okmsg'} style={{ display: 'grid', gap: 6 }}>
          <div className="row">
            <span className="grow">
              <strong>{report.hubTitle}</strong>: {report.imported.length} of {report.total} links read into their own Tela documents
              {report.failed.length ? ` · ${report.failed.length} couldn’t be read` : ''}
            </span>
            <button type="button" className="btn sm" aria-expanded={reportOpen} onClick={() => setReportOpen(o => !o)}>{reportOpen ? 'Hide' : 'Check each one'}</button>
          </div>
          {reportOpen && (
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3, fontSize: '.8rem' }}>
              {report.imported.map(r => (
                <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{r.label}</a> → “{r.title}” · {r.questions ? `${r.questions} questions` : `${r.words} words`}</li>
              ))}
              {report.failed.map(r => (
                <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{r.label}</a> — not imported: {r.reason}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {view === 'calendar' ? (
        <CourseCalendar
          source={source}
          programId={calProgram}
          focus={calFocus}
          onProgram={setCalProgram}
          onPreview={id => openPreview(id)}
          onSchedule={() => setView('library')}
        />
      ) : (
        <>
          <div className="lib-bar">
            <div className="chips" role="group" aria-label="Show">
              {filters.map(([f, label]) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f !== 'ALL' && <span className="lib-dot" style={{ background: KIND_META[f === 'SYLLABUS' ? 'SYLLABUS' : f].color, marginRight: 6 }} />}
                  {label} <span style={{ opacity: 0.6 }}>{counts[f] || 0}</span>
                </button>
              ))}
            </div>
            <select className="field lib-filter-select" aria-label="Show" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
              {filters.map(([f, label]) => <option key={f} value={f}>{label} ({counts[f] || 0})</option>)}
            </select>
            <label className="lib-search">
              <Search size={15} style={{ opacity: 0.5 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
              {search && <button type="button" className="btn link sm" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}
            </label>
            {canAssign && shown.some(assignable) && (
              <button type="button" className="btn sm" onClick={() => setSelected(s => (shown.filter(assignable).every(u => s.includes(u.id)) ? [] : shown.filter(assignable).map(u => u.id)))}>
                {shown.filter(assignable).every(u => selected.includes(u.id)) && selected.length ? 'Clear selection' : 'Select all'}
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="lib-empty">
              <h3>{visible.length ? 'Nothing matches' : 'Your library is empty'}</h3>
              <p className="dim" style={{ maxWidth: 420 }}>
                {visible.length
                  ? 'Try another filter or search.'
                  : 'Make a lesson, assignment or quiz in Tela Classwork — or bring in a PDF, Word doc or Google Doc — and it lands here, ready to assign.'}
              </p>
              {!visible.length && canUploadToLibrary && <button type="button" className="btn p" onClick={newInTela}><Plus size={15} /> New in Tela Classwork</button>}
            </div>
          ) : (
            <div className="lib-grid">
              {shown.map(u => {
                const k = kindOf(u);
                const on = selected.includes(u.id);
                return (
                  <div key={u.id} className={`lib-card${on ? ' sel' : ''}`}>
                    {canAssign && assignable(u) && (
                      <span role="checkbox" tabIndex={0} aria-checked={on} aria-label={`Select ${u.title}`} className="lib-sel"
                        onClick={() => toggle(u.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(u.id); } }}>
                        {on && <Check size={18} strokeWidth={3} />}
                      </span>
                    )}
                    <span className="lib-kind" style={{ background: KIND_META[k].color }}>{KIND_META[k].label}</span>
                    <button type="button" className="lib-open" onClick={() => openPreview(u.id)} aria-label={`Preview ${u.title}`}>
                      <TelaPage unit={u} size="thumb" />
                      <span className="lib-t">{u.title}</span>
                    </button>
                    <span className="lib-u">
                      {u.questions.length > 0 ? `${u.questions.length} questions · ${u.totalPoints} pts` : 'Reading'}
                      {canAccessAnswerKey && hasKey(u) && !isKeyOnly(u) && <span className="tag key"><KeyRound size={10} /> Key</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {canAssign && selected.length > 0 && (
            <div className="lib-actionbar" role="region" aria-label="Selection">
              <strong style={{ fontFamily: 'var(--fd)' }}>{selected.length} selected</strong>
              <span className="small grow">{source.kind === 'ACADEMIA' ? 'Pick a class and lay them out on its calendar.' : 'Pick a course and lay them out on its calendar.'}</span>
              <button type="button" className="btn sm" onClick={() => setSelected([])}>Clear</button>
              <button type="button" className="btn p" onClick={() => startAssign(selected)}>
                <CalendarDays size={15} /> Assign &amp; schedule
              </button>
            </div>
          )}
        </>
      )}

      {/* Preview panel: the Tela page first, then the original it came from, then the (gated) answer key. */}
      {preview && (
        <>
          <div className="lib-scrim" onClick={() => setPreviewId(null)} />
          <aside className="ce lib-panel" role="dialog" aria-modal="true" aria-label={preview.title} onKeyDown={e => { if (e.key === 'Escape') setPreviewId(null); }}>
            <div className="lib-ph">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ color: KIND_META[kindOf(preview)].color }}>{KIND_META[kindOf(preview)].label}</div>
                <h3>{preview.title}</h3>
                <div className="small">
                  {preview.questions.length ? `${preview.questions.length} questions · ${preview.totalPoints} pts` : 'Reading'}
                  {preview.createdByName ? ` · by ${preview.createdByName}` : ''}
                </div>
              </div>
              <button type="button" className="btn sm" autoFocus onClick={() => setPreviewId(null)} aria-label="Close preview"><X size={15} /></button>
            </div>
            <div className="lib-pt" role="tablist">
              <button type="button" role="tab" aria-selected={panelTab === 'page'} onClick={() => setPanelTab('page')}>Tela page</button>
              {hasOriginal(preview) && <button type="button" role="tab" aria-selected={panelTab === 'original'} onClick={() => setPanelTab('original')}>Original</button>}
              {hasKey(preview) && (canAccessAnswerKey
                ? <button type="button" role="tab" aria-selected={panelTab === 'key'} onClick={() => setPanelTab('key')}><KeyRound size={13} /> Answer key</button>
                : <span className="small" style={{ alignSelf: 'center', marginLeft: 'auto' }}><Lock size={11} /> Answer key: teachers only</span>)}
            </div>
            <div className="lib-pb">
              {panelTab === 'page' && <TelaPage unit={preview} size="full" />}
              {panelTab === 'original' && (
                <div className="stack">
                  <div className="small">
                    {preview.sourceLabel || 'Original file'}
                    {preview.extractedFromHubTitle ? ` · from ${preview.extractedFromHubTitle}` : ''}
                  </div>
                  {preview.sourceUrl && (
                    <a className="btn sm" style={{ justifySelf: 'start', textDecoration: 'none' }} href={preview.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the original</a>
                  )}
                  {preview.rawCurriculumText && <div className="lib-src">{preview.rawCurriculumText}</div>}
                </div>
              )}
              {panelTab === 'key' && canAccessAnswerKey && (
                <div className="stack">
                  {preview.rawAnswerKeyText && <div className="lib-src">{preview.rawAnswerKeyText}</div>}
                  {preview.questions.map(q => (
                    <div key={q.id} className="lib-keyq">
                      <strong>{q.number}. {q.prompt}</strong>
                      <span style={{ color: 'var(--ok)' }}>✓ {q.correctAnswer || 'Teacher-graded (written answer)'}</span>
                      {q.explanation && <span className="small">{q.explanation}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lib-pf">
              {canAssign && assignable(preview) && (
                <button type="button" className="btn p" onClick={() => startAssign([preview.id])}>
                  <CalendarDays size={15} /> Assign &amp; schedule
                </button>
              )}
              {canAssign && assignable(preview) && (
                <button type="button" className="btn sm" onClick={() => toggle(preview.id)}>{selected.includes(preview.id) ? 'Selected ✓' : 'Add to selection'}</button>
              )}
              <button type="button" className="btn sm" onClick={() => { setFullPreview(preview); setPreviewId(null); }}>Side-by-side view</button>
              <span className="grow" />
              {canUploadToLibrary && (confirmRemove ? (
                <button type="button" className="btn sm" style={{ background: 'rgba(255,84,112,.2)', borderColor: 'rgba(255,84,112,.5)' }}
                  onClick={() => { deleteIngestedUnit(orgId, preview.id); setPreviewId(null); setSelected(s => s.filter(x => x !== preview.id)); refreshUnits(); }}>
                  Remove from library?
                </button>
              ) : (
                <button type="button" className="btn sm" aria-label="Remove from library" onClick={() => setConfirmRemove(true)}><Trash2 size={14} /></button>
              ))}
            </div>
          </aside>
        </>
      )}

      {scheduling && (
        <>
          <div className="lib-scrim" onClick={() => setScheduling(null)} />
          <div className="ce" style={{ display: 'contents' }}>
            <AssignScheduleSheet
              units={scheduling.map(id => visible.find(u => u.id === id)).filter((u): u is IngestedCurriculumUnit => !!u)}
              source={source}
              onClose={() => setScheduling(null)}
              onDone={scheduled}
              onSaveProgram={onSaveProgram}
            />
          </div>
        </>
      )}

      {fullPreview && (
        <TelaDocumentPreviewModal
          isOpen
          onClose={() => setFullPreview(null)}
          title={fullPreview.title}
          telaDocId={fullPreview.telaDocId}
          unit={fullPreview}
          originalUrl={fullPreview.sourceUrl}
          originalText={fullPreview.rawCurriculumText}
          answerKeyText={canAccessAnswerKey ? fullPreview.rawAnswerKeyText : undefined}
          canViewAnswerKey={canAccessAnswerKey}
          orgName={orgName}
          departmentFolder={fullPreview.departmentFolder || (isStandaloneTeacher ? 'Lessons & Course Resources' : 'Christian Education')}
        />
      )}

    </div>
  );
};

export default OrgLessonLibraryHub;
