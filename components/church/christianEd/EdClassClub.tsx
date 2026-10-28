import React, { useMemo, useState } from 'react';
import type { ChurchProgram, PlanWeek } from '../../../services/churchEducationService';
import { KIND_LABEL } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import { getAllStudentDeskWorkspaces, type UniversalDeskAssignment } from '../../../services/universalStudentDeskService';
import { unmirrorAssignment, type EduSubmissionRecord } from '../../../services/christianEdSync';
import SharedClassroomClubHub from '../../classroom/SharedClassroomClubHub';
import TelaDocumentPreviewModal from '../TelaDocumentPreviewModal';
import EdAssignSheet from './EdAssignSheet';
import EdPeople from './EdPeople';
import AnnouncementsPanel from '../../announcements/AnnouncementsPanel';
import { coverFor, initials } from './edStyles';
import { announceWorkChanged, currentWeekIndex, needsReview, openTelaClasswork, type ClassWork } from './edWork';

export type ClassChannel = 'feed' | 'lessons' | 'work' | 'live' | 'people';

interface Props {
  orgId: string;
  orgName: string;
  program: ChurchProgram;
  isTeacher: boolean;
  canSeeKey: boolean;
  viewer: { uid: string; name: string; photoUrl?: string };
  units: IngestedCurriculumUnit[];
  work?: ClassWork;
  initialChannel?: ClassChannel;
  onBack: () => void;
  onSave: (p: ChurchProgram) => Promise<void>;
  onRefresh: () => void;
  onOpenReview: (assignmentId?: string) => void;
  onOpenDesk: (assignmentId: string) => void;
  onOpenGradebook: () => void;
}

const statusTag = (s?: string) => {
  switch (s) {
    case 'IN_PROGRESS':
    case 'READY_TO_TURN_IN':
      return { cls: 'open', label: 'Started' };
    case 'TURNED_IN':
      return { cls: 'done', label: 'Turned in' };
    case 'RETURNED_WITH_FEEDBACK':
      return { cls: 'done', label: 'Back to you' };
    default:
      return { cls: 'soon', label: 'To do' };
  }
};

/** A Christian Ed class rendered as a Plajah club: cover, five channels, right rail. */
const EdClassClub: React.FC<Props> = props => {
  const { orgId, orgName, program: p, isTeacher, canSeeKey, viewer, units, work, onSave, onRefresh } = props;
  const [chan, setChan] = useState<ClassChannel>(props.initialChannel || (isTeacher ? 'work' : 'work'));
  const [feedSection, setFeedSection] = useState<'SOCIAL_FEED' | 'PHOTOS'>('SOCIAL_FEED');
  const [assignUnit, setAssignUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [preview, setPreview] = useState<IngestedCurriculumUnit | null>(null);
  const [editWeek, setEditWeek] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState(false);
  const [draft, setDraft] = useState<ChurchProgram>(p);
  const [err, setErr] = useState('');

  const assignments = work?.assignments || [];
  const subs = work?.submissions || [];
  const byAssignment = useMemo(() => {
    const m = new Map<string, EduSubmissionRecord[]>();
    for (const s of subs) m.set(s.assignmentId, [...(m.get(s.assignmentId) || []), s]);
    return m;
  }, [subs]);
  const toReview = subs.filter(s => needsReview(s, assignments.find(a => a.id === s.assignmentId))).length;
  const withAccounts = (p.students || []).filter(s => s.uid).length;
  const myDesk = useMemo(() => (isTeacher ? {} : getAllStudentDeskWorkspaces(viewer.uid)), [isTeacher, viewer.uid, assignments]);
  const myDue = assignments.filter(a => !['TURNED_IN', 'RETURNED_WITH_FEEDBACK'].includes(myDesk[a.id]?.status || ''));

  const wi = currentWeekIndex(p);
  const thisWeek = wi >= 0 ? p.weeks[wi] : null;
  const classUnits = units.filter(u => u.programId === p.id || p.weeks.some(w => w.unitIds?.includes(u.id)));
  const visibleUnits = classUnits.filter(u => canSeeKey || (!u.isAnswerKeyOnly && u.libraryCategory !== 'ANSWER_KEY'));
  const unitById = new Map(units.map(u => [u.id, u]));
  // Students don't have the teacher's library on their device; their lessons come from assignments.
  const studentUnits = assignments.map(a => a.unitSnapshot);

  const save = async (next: ChurchProgram) => {
    setErr('');
    try {
      await onSave(next);
    } catch {
      setErr('Could not save. Check your connection and try again.');
    }
  };

  const setWeek = (id: string, patch: Partial<PlanWeek>) => save({ ...p, weeks: p.weeks.map(w => (w.id === id ? { ...w, ...patch } : w)) });

  const addLesson = (weekId?: string) =>
    openTelaClasswork({ orgId, orgName, programId: p.id, programName: p.name, weekId, domain: 'CHRISTIAN_EDUCATION' });

  const removeAssignment = async (a: UniversalDeskAssignment) => {
    await unmirrorAssignment(a.id);
    announceWorkChanged();
    onRefresh();
  };

  const channels: Array<[ClassChannel, string, number?]> = [
    ['feed', 'Feed'],
    ['lessons', 'Lessons'],
    ['work', 'Work', isTeacher ? toReview || undefined : myDue.length || undefined],
    ['live', 'Live'],
    ...(isTeacher ? ([['people', 'People', work?.joinRequests.length || undefined]] as Array<[ClassChannel, string, number?]>) : []),
  ];

  const lessonCard = (u: IngestedCurriculumUnit, opts?: { weekId?: string }) => {
    const hasKey = !!(u.rawAnswerKeyText || u.answerKeySourceLabel || u.isAnswerKeyOnly);
    const assigned = assignments.some(a => a.unitId === u.id);
    return (
      <div className="card" key={`${opts?.weekId || ''}${u.id}`}>
        <div className="row">
          <span className="ic" style={{ background: u.kind === 'QUIZ' || u.kind === 'TEST' ? 'linear-gradient(135deg,#FF8C00,#3a1a0b)' : 'linear-gradient(135deg,#8B5CF6,#241a34)' }}>
            {u.kind === 'QUIZ' ? 'QZ' : u.kind === 'TEST' ? 'TST' : u.kind === 'INTERACTIVE_LESSON' ? 'LSN' : 'WS'}
          </span>
          <div className="grow">
            <div className="t">{u.title}</div>
            <div className="u">
              {u.questions.length} question{u.questions.length === 1 ? '' : 's'} · from {u.sourceLabel}
            </div>
          </div>
          {canSeeKey && hasKey && <span className="tag key">Key</span>}
          {assigned && <span className="tag done">Assigned</span>}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => setPreview(u)}>
            Open
          </button>
          {isTeacher && u.questions.length > 0 && !u.isAnswerKeyOnly && (
            <button type="button" className="btn sm p" onClick={() => setAssignUnit(u)}>
              Assign
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderLessons = () => (
    <div className="stack">
      {isTeacher && (
        <div className="row wrap">
          <div className="grow small">
            {p.weeks.length} week{p.weeks.length === 1 ? '' : 's'}
            {thisWeek ? ` · on week ${wi + 1}: ${thisWeek.title}` : ''}
          </div>
          <button type="button" className="btn sm p" onClick={() => addLesson(thisWeek?.id)}>
            + Add lesson
          </button>
        </div>
      )}
      {p.weeks.length === 0 && (
        <div className="empty">
          <div className="t">No weeks planned yet</div>
          <div>{isTeacher ? 'Add a lesson and it becomes week 1, or add a week by hand.' : 'Your teacher hasn’t posted lessons yet.'}</div>
          {isTeacher && (
            <button type="button" className="btn sm" onClick={() => save({ ...p, weeks: [{ id: `wk_${Date.now().toString(36)}`, title: 'Week 1', passage: '', note: '' }] })}>
              + Add a week
            </button>
          )}
        </div>
      )}
      {p.weeks.map((w, i) => {
        const tag = i === wi ? { cls: 'open', label: 'This week' } : i < wi ? { cls: 'done', label: 'Taught' } : { cls: '', label: i === wi + 1 ? 'Next' : 'Later' };
        const weekUnits = (w.unitIds || []).map(id => unitById.get(id)).filter((u): u is IngestedCurriculumUnit => !!u);
        const editing = editWeek === w.id;
        return (
          <div className="panel" key={w.id}>
            <div className="pb">
              <div className="wk">
                <span className="n">W{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t" style={{ fontFamily: 'var(--fd)', fontWeight: 800 }}>{w.title || `Week ${i + 1}`}</div>
                  <div className="small">{[w.passage, w.note].filter(Boolean).join(' · ') || 'No passage yet'}</div>
                </div>
                <span className={`tag ${tag.cls}`}>{tag.label}</span>
              </div>
              {editing && isTeacher && (
                <div className="stack">
                  <div className="split">
                    <label className="lbl">
                      Title
                      <input id={`ed-wk-title-${w.id}`} className="field" defaultValue={w.title} onBlur={e => setWeek(w.id, { title: e.target.value })} />
                    </label>
                    <label className="lbl">
                      Passage
                      <input id={`ed-wk-passage-${w.id}`} className="field" defaultValue={w.passage} placeholder="Luke 15:11-32" onBlur={e => setWeek(w.id, { passage: e.target.value })} />
                    </label>
                  </div>
                  <label className="lbl">
                    Note for teachers
                    <textarea id={`ed-wk-note-${w.id}`} className="field" rows={2} defaultValue={w.note} onBlur={e => setWeek(w.id, { note: e.target.value })} />
                  </label>
                </div>
              )}
              {weekUnits.map(u => lessonCard(u, { weekId: w.id }))}
              {isTeacher && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => setEditWeek(editing ? null : w.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </button>
                  <button type="button" className="btn sm" onClick={() => addLesson(w.id)}>
                    + Lesson for this week
                  </button>
                  {i !== wi && (
                    <button type="button" className="btn sm" onClick={() => save({ ...p, currentWeek: i })}>
                      Make this week
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {isTeacher && p.weeks.length > 0 && (
        <button
          type="button"
          className="btn sm"
          style={{ justifySelf: 'start' }}
          onClick={() => save({ ...p, weeks: [...p.weeks, { id: `wk_${Date.now().toString(36)}`, title: `Week ${p.weeks.length + 1}`, passage: '', note: '' }] })}
        >
          + Add a week
        </button>
      )}
      {(isTeacher ? visibleUnits.filter(u => !p.weeks.some(w => w.unitIds?.includes(u.id))) : studentUnits).length > 0 && (
        <>
          <div className="small">{isTeacher ? 'Other lessons for this class' : 'Lessons from your assignments'}</div>
          {(isTeacher ? visibleUnits.filter(u => !p.weeks.some(w => w.unitIds?.includes(u.id))) : studentUnits).map(u => lessonCard(u))}
        </>
      )}
    </div>
  );

  const renderWork = () => {
    if (assignments.length === 0) {
      return (
        <div className="empty">
          <div className="t">No work assigned yet</div>
          <div>{isTeacher ? 'Open a lesson and tap Assign. It goes to every student’s desk.' : 'When your teacher assigns something, it shows up here.'}</div>
          {isTeacher && (
            <button type="button" className="btn sm p" onClick={() => setChan('lessons')}>
              Go to Lessons
            </button>
          )}
        </div>
      );
    }
    if (isTeacher) {
      return (
        <div className="stack">
          {toReview > 0 && (
            <button type="button" className="card click" style={{ borderColor: 'rgba(255,140,0,.45)' }} onClick={() => props.onOpenReview()}>
              <div className="row">
                <span className="ic" style={{ background: 'linear-gradient(135deg,#FF8C00,#D40055)' }}>{toReview}</span>
                <div className="grow">
                  <div className="t">{toReview} to review</div>
                  <div className="u">Written answers waiting for you, one at a time</div>
                </div>
                <span className="btn sm p">Review</span>
              </div>
            </button>
          )}
          {assignments.map(a => {
            const list = byAssignment.get(a.id) || [];
            const pending = list.filter(s => needsReview(s, a)).length;
            const back = list.filter(s => s.status === 'RETURNED_WITH_FEEDBACK').length;
            const inCount = list.length;
            // Average only scores that are final: returned, or turned in with nothing left for the teacher to score.
            const scored = list.filter(x => x.status === 'RETURNED_WITH_FEEDBACK' || !needsReview(x, a));
            const avg = scored.length ? Math.round(scored.reduce((s, x) => s + x.percentage, 0) / scored.length) : null;
            return (
              <div className="card" key={a.id}>
                <div className="row">
                  <span className="ic" style={{ background: 'linear-gradient(135deg,#8B5CF6,#241a34)' }}>{a.questionCount}Q</span>
                  <div className="grow">
                    <div className="t">{a.title}</div>
                    <div className="u">
                      {a.dueLabel} · {inCount} of {withAccounts} turned in
                      {avg !== null ? ` · avg ${avg}%` : ''}
                      {back ? ` · ${back} returned` : ''}
                    </div>
                  </div>
                  {pending > 0 ? <span className="tag hot">{pending} to review</span> : inCount > 0 ? <span className="tag done">Up to date</span> : <span className="tag soon">Waiting</span>}
                </div>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: `${withAccounts ? Math.min(100, (inCount / withAccounts) * 100) : 0}%` }} />
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {pending > 0 && (
                    <button type="button" className="btn sm p" onClick={() => props.onOpenReview(a.id)}>
                      Review {pending}
                    </button>
                  )}
                  <button type="button" className="btn sm" onClick={() => setPreview(a.unitSnapshot)}>
                    Open
                  </button>
                  <button type="button" className="btn sm" onClick={() => removeAssignment(a)}>
                    Unassign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="stack">
        {assignments.map(a => {
          const ws = myDesk[a.id];
          const t = statusTag(ws?.status);
          const score = ws?.submission ? `${ws.submission.earnedPoints} / ${ws.submission.totalPoints}` : '';
          return (
            <button type="button" className="card click" key={a.id} onClick={() => props.onOpenDesk(a.id)}>
              <div className="row">
                <span className="ic" style={{ background: 'linear-gradient(135deg,#FF8C00,#3a1a0b)' }}>{a.questionCount}Q</span>
                <div className="grow">
                  <div className="t">{a.title}</div>
                  <div className="u">
                    {ws?.status === 'RETURNED_WITH_FEEDBACK' && ws.teacherFeedbackNote ? `“${ws.teacherFeedbackNote}”` : a.dueLabel}
                    {score ? ` · ${score}` : ''}
                  </div>
                </div>
                <span className={`tag ${t.cls}`}>{t.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderMain = () => {
    if (chan === 'feed' || chan === 'live') {
      return (
        <div className="stack">
          {chan === 'feed' && feedSection === 'SOCIAL_FEED' && (
            <AnnouncementsPanel
              orgId={orgId}
              orgName={orgName}
              programId={p.id}
              programName={p.name}
              viewer={viewer}
              authorRole={isTeacher ? 'Teacher' : undefined}
              canPost={isTeacher}
              canManage={isTeacher}
              compact
              audiences={[{ key: 'class', label: p.name, audience: 'class', programId: p.id, programName: p.name }]}
            />
          )}
          {chan === 'feed' && (
            <div className="channels" style={{ margin: 0 }}>
              <button type="button" aria-pressed={feedSection === 'SOCIAL_FEED'} onClick={() => setFeedSection('SOCIAL_FEED')}>
                Posts
              </button>
              <button type="button" aria-pressed={feedSection === 'PHOTOS'} onClick={() => setFeedSection('PHOTOS')}>
                Photos
              </button>
            </div>
          )}
          <SharedClassroomClubHub
            embedded
            classId={p.id}
            className={p.name}
            contextKind="CHRISTIAN_EDUCATION"
            teacherUid={p.createdBy}
            teacherName={p.leadInstructor || 'Teacher'}
            isTeacher={isTeacher}
            currentUserUid={viewer.uid}
            currentUserName={viewer.name}
            currentUserAvatar={viewer.photoUrl}
            rosterStudents={(p.students || []).map(s => ({ id: s.uid || s.id, name: s.name, avatar: s.avatar, roleLabel: 'Student' }))}
            initialSection={chan === 'live' ? 'LIVE_LECTURE' : feedSection}
          />
        </div>
      );
    }
    if (chan === 'lessons') return renderLessons();
    if (chan === 'people') return <EdPeople orgId={orgId} program={p} joinRequests={work?.joinRequests || []} onSave={onSave} onChanged={onRefresh} />;
    return renderWork();
  };

  const ensureCode = () => {
    const base = (orgName.split(/\s+/)[0] || 'CLASS').replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase() || 'CLASS';
    const code = `${base}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    void save({ ...p, joinCode: code });
  };

  const renderRail = () =>
    isTeacher ? (
      <div className="rail">
        <div className="card">
          <h5>This week</h5>
          {thisWeek ? (
            <>
              <div className="t">
                W{wi + 1} · {thisWeek.title}
              </div>
              <div className="u">{thisWeek.passage || 'No passage yet'}</div>
              {wi < p.weeks.length - 1 && (
                <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => save({ ...p, currentWeek: wi + 1 })}>
                  Move to week {wi + 2}
                </button>
              )}
            </>
          ) : (
            <div className="u">No weeks planned.</div>
          )}
        </div>
        <div className="card">
          <h5>Needs you</h5>
          <div className="u">
            {toReview ? `${toReview} to review` : 'Nothing to review'}
            {work?.joinRequests.length ? ` · ${work.joinRequests.length} asked to join` : ''}
            {(p.students || []).length === 0 ? ' · no students yet' : ''}
          </div>
        </div>
        <div className="card">
          <h5>Class code</h5>
          {p.joinCode ? (
            <>
              <div className="code">{p.joinCode}</div>
              <div className="u">Students type this under “Join a class”. You approve each one in People.</div>
            </>
          ) : (
            <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={ensureCode}>
              Make a class code
            </button>
          )}
        </div>
        <div className="card">
          <h5>Teacher tools</h5>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn sm" onClick={props.onOpenGradebook}>
              Gradebook
            </button>
            <button type="button" className="btn sm" onClick={() => { setDraft(p); setEditingClass(true); }}>
              Edit class
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="rail">
        <div className="card">
          <h5>Due next</h5>
          {myDue[0] ? (
            <>
              <div className="t">{myDue[0].title}</div>
              <div className="u">{myDue[0].dueLabel}</div>
              <button type="button" className="btn sm p" style={{ justifySelf: 'start' }} onClick={() => props.onOpenDesk(myDue[0].id)}>
                Start
              </button>
            </>
          ) : (
            <div className="u">You’re all caught up.</div>
          )}
        </div>
        <div className="card">
          <h5>Teachers</h5>
          {(p.assignedTeam?.length ? p.assignedTeam : [{ name: p.leadInstructor || 'Teacher' }]).map((t, i) => (
            <div className="row" key={i}>
              <span className="av" style={{ background: 'var(--warm)' }}>{initials(t.name)}</span>
              <span style={{ fontSize: '.84rem', fontWeight: 600 }}>{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <button type="button" className="back" onClick={props.onBack}>
        ← Christian Education
      </button>

      <div className="cover">
        <div className="art" style={{ background: coverFor(p.id, p.coverHue) }} />
        <div className="ci">
          <div className="cchips">
            <span className="cchip">{KIND_LABEL[p.kind]}</span>
            {p.ageBand && <span className="cchip">{p.ageBand}</span>}
            <span className="cchip">{orgName}</span>
          </div>
          <h1>{p.name}</h1>
          <div className="meta">
            <span>
              {(p.students || []).length} student{(p.students || []).length === 1 ? '' : 's'}
            </span>
            {p.meetingSchedule && <span>{p.meetingSchedule}</span>}
            {p.leadInstructor && <span>{p.leadInstructor}</span>}
          </div>
        </div>
      </div>

      <div className="channels" role="tablist" aria-label="Class channels">
        {channels.map(([id, label, badge]) => (
          <button key={id} type="button" role="tab" aria-selected={chan === id} aria-pressed={chan === id} onClick={() => setChan(id)}>
            {label}
            {badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </div>

      {err && <div className="err">{err}</div>}

      {editingClass && (
        <div className="sheet" role="dialog" aria-label="Edit class">
          <div className="row">
            <h3 className="grow">Edit class</h3>
            <button type="button" className="btn sm" onClick={() => setEditingClass(false)}>
              Cancel
            </button>
          </div>
          <div className="split">
            <label className="lbl">
              Name
              <input id="ed-class-name" className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="lbl">
              Ages
              <input id="ed-class-ages" className="field" value={draft.ageBand} placeholder="Ages 6–9" onChange={e => setDraft({ ...draft, ageBand: e.target.value })} />
            </label>
            <label className="lbl">
              When &amp; where
              <input id="ed-class-when" className="field" value={draft.meetingSchedule || ''} placeholder="Sundays · 9:15 AM · Room B-104" onChange={e => setDraft({ ...draft, meetingSchedule: e.target.value })} />
            </label>
            <label className="lbl">
              Lead teacher
              <input id="ed-class-lead" className="field" value={draft.leadInstructor || ''} onChange={e => setDraft({ ...draft, leadInstructor: e.target.value })} />
            </label>
          </div>
          <label className="lbl">
            About this class
            <textarea id="ed-class-about" className="field" rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <button type="button" className="btn p" style={{ justifySelf: 'start' }} onClick={async () => { await save(draft); setEditingClass(false); }}>
            Save
          </button>
        </div>
      )}

      {assignUnit && (
        <EdAssignSheet
          orgId={orgId}
          orgName={orgName}
          program={p}
          unit={assignUnit}
          teacher={{ uid: viewer.uid, name: viewer.name }}
          onClose={() => setAssignUnit(null)}
          onAssigned={onRefresh}
        />
      )}

      <div className="cgrid">
        <div style={{ minWidth: 0 }}>{renderMain()}</div>
        {renderRail()}
      </div>

      {preview && (
        <TelaDocumentPreviewModal
          isOpen
          onClose={() => setPreview(null)}
          title={preview.title}
          unit={preview}
          telaDocId={preview.telaDocId}
          originalUrl={preview.sourceUrl}
          originalText={preview.rawCurriculumText}
          answerKeyText={canSeeKey ? preview.rawAnswerKeyText : undefined}
          orgName={orgName}
          departmentFolder={preview.departmentFolder}
          canViewAnswerKey={canSeeKey}
          onOpenFullTelaStudio={docId => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId, returnTo: { label: p.name, target: 'ELEVATE_EDU', programId: p.id } } }))}
        />
      )}
    </div>
  );
};

export default EdClassClub;
