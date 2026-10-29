import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Organization } from '../../../types';
import { KIND_LABEL, STARTERS, fromStarter, newProgram, type ChurchProgram, type ProgramKind } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import { getAllStudentDeskWorkspaces } from '../../../services/universalStudentDeskService';
import { requestToJoin } from '../../../services/christianEdSync';
import { UniversalStudentDesk } from '../../desk/UniversalStudentDesk';
import EdClassClub, { type ClassChannel } from './EdClassClub';
import EdReviewQueue, { type ReviewItem } from './EdReviewQueue';
import { ED_CSS, coverFor } from './edStyles';
import AnnouncementsPanel, { type AudienceOption } from '../../announcements/AnnouncementsPanel';
import EduPhoneShell, { EduPhoneSheet, type EduPhoneTab } from '../../edu/EduPhoneShell';
import { useViewport } from '../../../hooks/useViewport';
import { BookOpen, ClipboardCheck, Home, Megaphone, MoreHorizontal, Users } from 'lucide-react';

const TemplateLibrary = lazy(() => import('../../templates/TemplateLibrary'));
import { currentWeekIndex, isStudentOf, isTeacherOf, needsReview, syncMyReturnedWork, useClassWork } from './edWork';
import { openLessonLibrary } from '../../../services/lessonLibraryNav';

export type EdToolMode = 'LESSON_LIBRARY' | 'CENTRAL_CALENDAR' | 'TEACHER_TOOLS' | 'TEACHER_DASHBOARD' | 'CLASSIC';

type View =
  | { kind: 'hub' }
  | { kind: 'class'; id: string; chan?: ClassChannel }
  | { kind: 'review'; programId?: string; assignmentId?: string; from?: View }
  | { kind: 'desk'; assignmentId?: string; from?: View };

interface Props {
  church: Organization;
  canEdit: boolean;
  canSeeKey: boolean;
  viewer: { uid: string; name: string; photoUrl?: string };
  programs: ChurchProgram[] | null;
  units: IngestedCurriculumUnit[];
  onSaveProgram: (p: ChurchProgram) => Promise<void>;
  onReload: () => void;
  onOpenTool: (mode: EdToolMode) => void;
  /** Re-open a class after returning from Tela. */
  initialClassId?: string;
}

const KINDS = Object.keys(KIND_LABEL) as ProgramKind[];

/**
 * Christian Education home. Teachers land on Today (what needs doing) over a grid of class clubs;
 * students land on My Desk (Due / Turned in / Back to me) with their classes underneath.
 */
const EdHub: React.FC<Props> = ({ church, canEdit, canSeeKey, viewer, programs, units, onSaveProgram, onReload, onOpenTool, initialClassId }) => {
  const [view, setView] = useState<View>(initialClassId ? { kind: 'class', id: initialClassId } : { kind: 'hub' });
  const [newClass, setNewClass] = useState<null | { name: string; kind: ProgramKind; ageBand: string; schedule: string }>(null);
  const [deskTab, setDeskTab] = useState<'due' | 'in' | 'back'>('due');
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [deskTick, setDeskTick] = useState(0);
  // Phone: one section at a time behind a bottom tab bar (EduPhoneShell); desktop shows everything.
  const { isPhone } = useViewport();
  const [phoneTab, setPhoneTab] = useState<'today' | 'classes' | 'desk' | 'news'>('today');
  const [phoneMore, setPhoneMore] = useState(false);

  const all = programs || [];
  const teaching = useMemo(() => all.filter(p => isTeacherOf(p, viewer.uid, canEdit)), [all, viewer.uid, canEdit]);
  const enrolled = useMemo(() => all.filter(p => isStudentOf(p, viewer.uid) && !teaching.includes(p)), [all, viewer.uid, teaching]);
  const isTeacher = teaching.length > 0;
  // Org-wide posts reach everyone on a Christian Ed roster (members) or anyone (public); teachers also post to one class.
  const hubAudiences = useMemo<AudienceOption[]>(() => {
    const everyone = [...new Set(all.flatMap(p => [...(p.studentUids || []), ...(p.students || []).map(s => s.uid), ...(p.teacherUids || []), p.createdBy]).filter(Boolean))] as string[];
    return [
      ...(canEdit ? [
        { key: 'members', label: 'Everyone in Christian Ed', audience: 'members' as const, audienceUids: everyone },
        { key: 'public', label: `Anyone who visits ${church.name}`, audience: 'public' as const },
      ] : []),
      ...teaching.map(p => ({ key: `class:${p.id}`, label: p.name, audience: 'class' as const, programId: p.id, programName: p.name })),
    ];
  }, [all, canEdit, teaching, church.name]);

  const { work, refresh } = useClassWork(isTeacher ? teaching : enrolled, { asTeacher: isTeacher });
  const studentWork = useClassWork(isTeacher ? enrolled : [], { asTeacher: false });

  useEffect(() => {
    if (!viewer.uid || isTeacher && enrolled.length === 0) return;
    void syncMyReturnedWork(viewer.uid).then(() => setDeskTick(t => t + 1));
  }, [viewer.uid, isTeacher, enrolled.length]);

  useEffect(() => {
    const h = () => setDeskTick(t => t + 1);
    window.addEventListener('plajah:deskUpdated', h);
    return () => window.removeEventListener('plajah:deskUpdated', h);
  }, []);

  const reviewItems: ReviewItem[] = useMemo(() => {
    const out: ReviewItem[] = [];
    for (const p of teaching) {
      const w = work[p.id];
      if (!w) continue;
      for (const sub of w.submissions) {
        const a = w.assignments.find(x => x.id === sub.assignmentId);
        if (needsReview(sub, a)) out.push({ sub, assignment: a, program: p });
      }
    }
    return out.sort((a, b) => a.sub.turnedInAt - b.sub.turnedInAt);
  }, [teaching, work]);

  const myWork = isTeacher ? studentWork.work : work;
  const myClasses = isTeacher ? enrolled : enrolled;
  const desk = useMemo(() => getAllStudentDeskWorkspaces(viewer.uid), [viewer.uid, deskTick, myWork]);
  const myAssignments = useMemo(
    () => myClasses.flatMap(p => (myWork[p.id]?.assignments || []).map(a => ({ a, p }))),
    [myClasses, myWork]
  );
  const due = myAssignments.filter(x => !['TURNED_IN', 'RETURNED_WITH_FEEDBACK'].includes(desk[x.a.id]?.status || '')).sort((x, y) => x.a.dueAt - y.a.dueAt);
  const turnedIn = myAssignments.filter(x => desk[x.a.id]?.status === 'TURNED_IN');
  const back = myAssignments.filter(x => desk[x.a.id]?.status === 'RETURNED_WITH_FEEDBACK');

  const needsLesson = teaching.filter(p => {
    const wi = currentWeekIndex(p);
    return wi < 0 || !(p.weeks[wi].unitIds?.length || p.weeks[wi].passage);
  });
  const joinCount = teaching.reduce((n, p) => n + (work[p.id]?.joinRequests.length || 0), 0);
  const noStudents = teaching.filter(p => (p.students || []).length === 0);

  // ── Phone shell ──
  const tabNow = !isTeacher && phoneTab === 'today' ? 'desk' : isTeacher && phoneTab === 'desk' ? 'today' : phoneTab;
  const activeTab = view.kind === 'review' ? 'review' : view.kind === 'class' ? 'classes' : view.kind === 'desk' ? (isTeacher ? 'classes' : 'desk') : tabNow;
  const phoneTabs: EduPhoneTab[] = isTeacher
    ? [
        { id: 'today', label: 'Today', icon: Home },
        { id: 'classes', label: 'Classes', icon: Users },
        { id: 'review', label: 'Review', icon: ClipboardCheck, badge: reviewItems.length },
        { id: 'news', label: 'News', icon: Megaphone },
        { id: 'more', label: 'More', icon: MoreHorizontal },
      ]
    : [
        { id: 'desk', label: 'My Desk', icon: BookOpen, badge: due.length },
        { id: 'classes', label: 'Classes', icon: Users },
        { id: 'news', label: 'News', icon: Megaphone },
        { id: 'more', label: 'More', icon: MoreHorizontal },
      ];
  const selectPhoneTab = (id: string) => {
    if (id === 'more') { setPhoneMore(true); return; }
    if (id === 'review') { setView({ kind: 'review' }); return; }
    setPhoneTab(id as typeof phoneTab);
    setView({ kind: 'hub' });
    window.scrollTo({ top: 0 });
  };
  /** On a phone, show one hub section at a time; on wider screens, all of them. */
  const showSection = (s: typeof phoneTab) => !isPhone || tabNow === s;
  const moreRow = (label: string, run: () => void) => (
    <button key={label} type="button" className="eps-row" onClick={() => { setPhoneMore(false); run(); }}>{label}</button>
  );
  const shell = (node: React.ReactNode) => (
    <EduPhoneShell tabs={phoneTabs} active={activeTab} onSelect={selectPhoneTab} label="Christian Education">
      {node}
      {phoneMore && (
        <EduPhoneSheet title="More" onClose={() => setPhoneMore(false)}>
          {moreRow('Calendar', () => onOpenTool('CENTRAL_CALENDAR'))}
          {isTeacher && moreRow('Add lessons', () => openLessonLibrary({ orgId: church.id, orgName: church.name }))}
          {canEdit && moreRow('New class', () => { setPhoneTab('classes'); setView({ kind: 'hub' }); setNewClass({ name: '', kind: 'sunday-school', ageBand: '', schedule: '' }); })}
          {isTeacher && moreRow('Lesson library', () => openLessonLibrary({ orgId: church.id, orgName: church.name }))}
          {isTeacher && moreRow('Templates & flyers', () => setLibOpen(true))}
          {isTeacher && moreRow('Gradebook & teacher tools', () => onOpenTool('TEACHER_TOOLS'))}
          {isTeacher && moreRow('Instructor dashboard', () => onOpenTool('TEACHER_DASHBOARD'))}
          {!isTeacher && moreRow('Join a class', () => { setPhoneTab('classes'); setView({ kind: 'hub' }); setTimeout(() => document.getElementById('ed-join-code')?.focus(), 50); })}
        </EduPhoneSheet>
      )}
    </EduPhoneShell>
  );

  const createClass = async () => {
    if (!newClass?.name.trim()) return;
    const p = newProgram(church, {
      name: newClass.name.trim(),
      kind: newClass.kind,
      ageBand: newClass.ageBand,
      meetingSchedule: newClass.schedule,
      createdBy: viewer.uid,
    } as Partial<ChurchProgram> & { name: string });
    await onSaveProgram(p);
    setNewClass(null);
    setView({ kind: 'class', id: p.id, chan: 'people' });
  };

  const addStarter = async (id: string) => {
    const p = fromStarter(church, id, all.length);
    await onSaveProgram({ ...p, createdBy: p.createdBy || viewer.uid });
    setNewClass(null);
    setView({ kind: 'class', id: p.id });
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    const target = all.find(p => (p.joinCode || '').toUpperCase() === code);
    if (!target) {
      setJoinMsg({ ok: false, text: 'That code doesn’t match a class here. Check it with your teacher.' });
      return;
    }
    try {
      await requestToJoin({ orgId: church.id, programId: target.id, uid: viewer.uid, name: viewer.name, code: target.joinCode! });
      setJoinMsg({ ok: true, text: `Asked to join ${target.name}. Your teacher will add you.` });
      setJoinCode('');
    } catch {
      setJoinMsg({ ok: false, text: 'Could not send the request. Sign in and try again.' });
    }
  };

  const clubCard = (p: ChurchProgram, asTeacher: boolean) => {
    const w = work[p.id] || studentWork.work[p.id];
    const flags: Array<[string, string]> = [];
    if (asTeacher) {
      const r = reviewItems.filter(x => x.program.id === p.id).length;
      if (r) flags.push(['hot', `${r} to review`]);
      if (w?.joinRequests.length) flags.push(['soon', `${w.joinRequests.length} asked to join`]);
      if (needsLesson.includes(p)) flags.push(['soon', 'No lesson this week']);
      if ((p.students || []).length === 0) flags.push(['', 'No students yet']);
      if (flags.length === 0) flags.push(['done', 'All caught up']);
    } else {
      const d = (w?.assignments || []).filter(a => !['TURNED_IN', 'RETURNED_WITH_FEEDBACK'].includes(desk[a.id]?.status || '')).length;
      flags.push(d ? ['soon', `${d} due`] : ['done', 'Caught up']);
    }
    return (
      <button type="button" className="club" key={p.id} onClick={() => setView({ kind: 'class', id: p.id })}>
        <div className="art" style={{ background: coverFor(p.id, p.coverHue) }}>
          <span>{p.name.slice(0, 1)}</span>
        </div>
        <div className="b">
          <div className="t">{p.name}</div>
          <div className="u">
            {[p.meetingSchedule, `${(p.students || []).length} students`].filter(Boolean).join(' · ')}
          </div>
          <div className="flags">
            {flags.map(([c, l]) => (
              <span key={l} className={`tag ${c}`}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </button>
    );
  };

  // ── Sub-views ───────────────────────────────────────────────────────────────
  if (view.kind === 'class') {
    const p = all.find(x => x.id === view.id);
    if (!p) {
      return shell(
        <div className="ce">
          <style>{ED_CSS}</style>
          <button type="button" className="back" onClick={() => setView({ kind: 'hub' })}>
            ← Christian Education
          </button>
          <div className="empty">
            <div className="t">This class is gone</div>
            <div>It may have been deleted.</div>
          </div>
        </div>
      );
    }
    const asTeacher = teaching.includes(p);
    return shell(
      <div className="ce">
        <style>{ED_CSS}</style>
        <EdClassClub
          key={p.id}
          orgId={church.id}
          orgName={church.name}
          program={p}
          isTeacher={asTeacher}
          canSeeKey={asTeacher && canSeeKey}
          viewer={viewer}
          units={units}
          work={work[p.id] || studentWork.work[p.id]}
          initialChannel={view.chan}
          onBack={() => setView({ kind: 'hub' })}
          onSave={onSaveProgram}
          onRefresh={() => { void refresh(); void studentWork.refresh(); onReload(); }}
          onOpenReview={assignmentId => setView({ kind: 'review', programId: p.id, assignmentId, from: view })}
          onOpenDesk={assignmentId => setView({ kind: 'desk', assignmentId, from: view })}
          onOpenGradebook={() => onOpenTool('TEACHER_TOOLS')}
        />
      </div>
    );
  }

  if (view.kind === 'review') {
    const items = reviewItems.filter(x => (!view.programId || x.program.id === view.programId) && (!view.assignmentId || x.sub.assignmentId === view.assignmentId));
    return shell(
      <div className="ce">
        <style>{ED_CSS}</style>
        <EdReviewQueue items={items} canSeeKey={canSeeKey} onBack={() => { void refresh(); setView(view.from || { kind: 'hub' }); }} />
      </div>
    );
  }

  if (view.kind === 'desk') {
    return shell(
      <div className="ce">
        <style>{ED_CSS}</style>
        <UniversalStudentDesk
          studentUid={viewer.uid}
          studentName={viewer.name}
          defaultDomain="CHRISTIAN_EDUCATION"
          orgId={church.id}
          orgName={church.name}
          initialAssignmentId={view.assignmentId}
          compactHeader
          onBack={() => setView(view.from || { kind: 'hub' })}
          onOpenTelaStudio={docId => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId, returnTo: { label: 'My Desk', target: 'ELEVATE_EDU' } } }))}
        />
      </div>
    );
  }

  // ── Hub ─────────────────────────────────────────────────────────────────────
  const deskList = deskTab === 'due' ? due : deskTab === 'in' ? turnedIn : back;
  const nextClass = teaching.find(p => p.meetingSchedule);

  const myDeskSection = (
    <div className="stack">
      <div className="channels">
        <button type="button" aria-pressed={deskTab === 'due'} onClick={() => setDeskTab('due')}>
          Due {due.length ? <span className="badge">{due.length}</span> : null}
        </button>
        <button type="button" aria-pressed={deskTab === 'in'} onClick={() => setDeskTab('in')}>
          Turned in
        </button>
        <button type="button" aria-pressed={deskTab === 'back'} onClick={() => setDeskTab('back')}>
          Back to me {back.length ? <span className="badge">{back.length}</span> : null}
        </button>
      </div>
      {deskList.length === 0 && (
        <div className="small">{deskTab === 'due' ? 'Nothing due. Nice work.' : deskTab === 'in' ? 'Nothing waiting on your teacher.' : 'No graded work yet.'}</div>
      )}
      {deskList.map(({ a, p }) => {
        const ws = desk[a.id];
        return (
          <button type="button" className="card click" key={a.id} onClick={() => setView({ kind: 'desk', assignmentId: a.id })}>
            <div className="row">
              <span className="ic" style={{ background: 'linear-gradient(135deg,#FF8C00,#3a1a0b)' }}>{a.questionCount}Q</span>
              <div className="grow">
                <div className="t">{a.title}</div>
                <div className="u">
                  {p.name} · {deskTab === 'back' && ws?.teacherFeedbackNote ? `“${ws.teacherFeedbackNote}”` : a.dueLabel}
                </div>
              </div>
              {deskTab === 'due' ? (
                <span className="btn sm p">{ws?.status === 'IN_PROGRESS' || ws?.status === 'READY_TO_TURN_IN' ? 'Continue' : 'Start'}</span>
              ) : ws?.submission ? (
                <span className="tag done">
                  {ws.submission.earnedPoints} / {ws.submission.totalPoints}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );

  const joinBox = (
    <div className="card" style={{ borderStyle: 'dashed' }}>
      <div className="row wrap">
        <div className="grow" style={{ flexBasis: 200 }}>
          <div className="t">Join a class</div>
          <div className="u">Type the code your teacher gave you</div>
        </div>
        <input id="ed-join-code" className="field" style={{ flex: '1 1 150px', maxWidth: isPhone ? undefined : 170, fontFamily: 'var(--fm)', textTransform: 'uppercase' }} value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="GRACE-K6Q" />
        <button type="button" className="btn sm" disabled={!joinCode.trim()} onClick={join}>
          Ask to join
        </button>
      </div>
      {joinMsg && <div className={joinMsg.ok ? 'okmsg' : 'err'}>{joinMsg.text}</div>}
    </div>
  );

  return shell(
    <div className="ce">
      <style>{ED_CSS}</style>

      <div className="hubhead">
        <div className="grow">
          <div className="eyebrow">{church.name}</div>
          <h2>{isPhone ? ({ today: 'Today', classes: 'Classes', desk: 'My Desk', news: 'News' } as const)[tabNow] : isTeacher ? 'Christian Education' : 'My Desk'}</h2>
          <div className="small">
            {isTeacher
              ? `${teaching.length} class${teaching.length === 1 ? '' : 'es'} · ${teaching.reduce((n, p) => n + (p.students || []).length, 0)} students`
              : `${enrolled.length} class${enrolled.length === 1 ? '' : 'es'}`}
          </div>
        </div>
        {!isPhone && <button type="button" className="btn sm" onClick={() => onOpenTool('CENTRAL_CALENDAR')}>
          Calendar
        </button>}
        {isTeacher && !isPhone && (
          <>
            <button type="button" className="btn sm" onClick={() => openLessonLibrary({ orgId: church.id, orgName: church.name })}>
              Lesson library
            </button>
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn sm" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
                More ▾
              </button>
              {moreOpen && (
                <div className="sheet" style={{ position: 'absolute', right: 0, top: 38, zIndex: 30, width: 230, padding: 8, gap: 2 }}>
                  {(
                    [
                      ['TEACHER_TOOLS', 'Gradebook & teacher tools'],
                      ['TEACHER_DASHBOARD', 'Instructor dashboard'],
                      ['CLASSIC', 'Classic classroom view'],
                    ] as Array<[EdToolMode, string]>
                  ).map(([m, l]) => (
                    <button key={m} type="button" className="btn sm" style={{ justifyContent: 'flex-start', background: 'transparent', borderColor: 'transparent' }} onClick={() => { setMoreOpen(false); onOpenTool(m); }}>
                      {l}
                    </button>
                  ))}
                  <button type="button" className="btn sm" style={{ justifyContent: 'flex-start', background: 'transparent', borderColor: 'transparent' }} onClick={() => { setMoreOpen(false); setLibOpen(true); }}>
                    Templates &amp; flyers
                  </button>
                </div>
              )}
            </div>
            {canEdit && (
              <button type="button" className="btn sm p" onClick={() => setNewClass({ name: '', kind: 'sunday-school', ageBand: '', schedule: '' })}>
                + New class
              </button>
            )}
          </>
        )}
      </div>

      {programs === null && <div className="small">Loading classes…</div>}

      {isTeacher && showSection('today') && (
        <div className="today">
          <button type="button" className={`stat ${reviewItems.length ? 'hot' : 'calm'}`} onClick={() => setView({ kind: 'review' })}>
            <span className="v">{reviewItems.length}</span>
            <span className="l">to review</span>
          </button>
          <button
            type="button"
            className={`stat ${needsLesson.length ? 'hot' : 'calm'}`}
            onClick={() => needsLesson[0] && setView({ kind: 'class', id: needsLesson[0].id, chan: 'lessons' })}
          >
            <span className="v">{needsLesson.length}</span>
            <span className="l">{needsLesson.length === 1 ? 'class needs' : 'classes need'} a lesson this week</span>
          </button>
          <button
            type="button"
            className={`stat ${joinCount || noStudents.length ? 'hot' : 'calm'}`}
            onClick={() => {
              const t = teaching.find(p => work[p.id]?.joinRequests.length) || noStudents[0];
              if (t) setView({ kind: 'class', id: t.id, chan: 'people' });
            }}
          >
            <span className="v">{joinCount || noStudents.length}</span>
            <span className="l">{joinCount ? 'asked to join' : noStudents.length === 1 ? 'class with no students' : 'classes with no students'}</span>
          </button>
          <button
            type="button"
            className="stat"
            onClick={() => openLessonLibrary({ orgId: church.id, orgName: church.name })}
          >
            <span className="v">+</span>
            <span className="l">Add lessons</span>
          </button>
        </div>
      )}
      {isTeacher && isPhone && showSection('today') && nextClass && (
        <button type="button" className="card click" onClick={() => setView({ kind: 'class', id: nextClass.id })}>
          <div className="u">Next on the schedule</div>
          <div className="t">{nextClass.name}</div>
          <div className="u">{nextClass.meetingSchedule}</div>
        </button>
      )}

      {newClass && (
        <div className="sheet" role="dialog" aria-label="New class">
          <div className="row">
            <h3 className="grow">New class</h3>
            <button type="button" className="btn sm" onClick={() => setNewClass(null)}>
              Cancel
            </button>
          </div>
          <div className="split">
            <label className="lbl">
              Name
              <input id="ed-new-name" className="field" value={newClass.name} placeholder="Kids Sunday School" onChange={e => setNewClass({ ...newClass, name: e.target.value })} />
            </label>
            <label className="lbl">
              Kind
              <select id="ed-new-kind" className="field" value={newClass.kind} onChange={e => setNewClass({ ...newClass, kind: e.target.value as ProgramKind })}>
                {KINDS.map(k => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="lbl">
              Ages
              <input id="ed-new-ages" className="field" value={newClass.ageBand} placeholder="Ages 6–9" onChange={e => setNewClass({ ...newClass, ageBand: e.target.value })} />
            </label>
            <label className="lbl">
              When &amp; where
              <input id="ed-new-when" className="field" value={newClass.schedule} placeholder="Sundays · 9:15 AM · Room B-104" onChange={e => setNewClass({ ...newClass, schedule: e.target.value })} />
            </label>
          </div>
          <div className="row wrap">
            <button type="button" className="btn p" disabled={!newClass.name.trim()} onClick={createClass}>
              Create class
            </button>
            <span className="small">or start from a plan:</span>
            {STARTERS.slice(0, 4).map(s => (
              <button key={s.id} type="button" className="btn sm" onClick={() => addStarter(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isTeacher && (
        <>
          {showSection('desk') && (enrolled.length === 0 ? (
            <div className="empty">
              <div className="t">You’re not in a class yet</div>
              <div>Ask your teacher for the class code, or for them to add you.</div>
            </div>
          ) : (
            myDeskSection
          ))}
          {showSection('classes') && (
            <>
              {!isPhone && <div className="eyebrow" style={{ marginTop: 6 }}>My classes</div>}
              {enrolled.length > 0 && <div className="clubs">{enrolled.map(p => clubCard(p, false))}</div>}
              {joinBox}
            </>
          )}
        </>
      )}

      {isTeacher && showSection('classes') && (
        <>
          <div className="clubs">
            {teaching.map(p => clubCard(p, true))}
            {canEdit && (
              <button type="button" className="club add" onClick={() => setNewClass({ name: '', kind: 'sunday-school', ageBand: '', schedule: '' })}>
                + New class
              </button>
            )}
          </div>
          {enrolled.length > 0 && (
            <>
              <div className="eyebrow">Classes I’m in</div>
              {myDeskSection}
              <div className="clubs">{enrolled.map(p => clubCard(p, false))}</div>
            </>
          )}
          {nextClass && !isPhone && <div className="small">Next on the schedule: {nextClass.name} · {nextClass.meetingSchedule}</div>}
        </>
      )}
      {(isTeacher || enrolled.length > 0 || canEdit) && showSection('news') && (
        <AnnouncementsPanel
          orgId={church.id}
          orgName={church.name}
          viewer={viewer}
          authorRole={canEdit ? 'Christian Ed' : isTeacher ? 'Teacher' : undefined}
          canPost={canEdit || isTeacher}
          canManage={canEdit}
          asStaff={canEdit}
          compact
          title={canEdit ? 'Announcements to Christian Ed' : 'Announcements'}
          returnLabel="Christian Education"
          audiences={hubAudiences}
        />
      )}
      {libOpen && (
        <Suspense fallback={null}>
          <TemplateLibrary orgId={church.id} orgName={church.name} viewer={viewer} isOrgAdmin={canEdit} orgRole={canEdit ? 'admin' : isTeacher ? 'teacher' : 'member'} returnLabel="Christian Education" onClose={() => setLibOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default EdHub;
