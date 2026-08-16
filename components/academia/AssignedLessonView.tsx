// AssignedLessonView — what a student sees when they open an assigned template.
//
// A template lesson is not a worksheet: there are no fillable answer boxes to auto-grade. It's a
// sequence of steps, some materials, and a rubric. So the student surface is a working checklist
// plus the rubric they'll be graded against — shown BEFORE they start, not revealed afterwards,
// because a rubric a student can't see while working isn't doing its job.
//
// Materials render with their attribution. Where Plajah hosts a copy of the textbook, the
// student reads it here — free, no account tier, no leaving the assignment. Everything else
// links to the publisher. Both routes always show the licence and attribution.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, Clock, Target, ExternalLink, Send, Loader2,
  BookOpen, Scale, Lightbulb, CircleCheck,
} from 'lucide-react';
import {
  fetchAssignment, submitLesson, fetchMySubmission, resolveHostedBooks, bookLink,
  type TemplateAssignment, type TemplateSubmission, type RubricScores,
} from '../../services/assignmentTemplateService';
import { libraryItemById, describeStandard } from '../../data/oerLibrary';
import { LICENSE_LABEL } from '../../services/oerLicenseGate';
import { T, cardStyle, btn, badge } from './integrityTheme';

const Section: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> =
  ({ icon: Icon, title, children }) => (
    <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon size={16} color={T.orange} />
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{title}</h3>
      </div>
      {children}
    </section>
  );

interface Props {
  assignmentId?: string;
  /** A pre-loaded assignment, skipping the fetch — mirrors StudentAssignmentView's
   *  `worksheet` / `worksheetId` pair, and lets a caller that already has the record
   *  (or a preview) render without a round trip. */
  assignment?: TemplateAssignment;
  user?: any;
  onBack?: () => void;
  /** Opens a Plajah-hosted textbook in the reader without a page reload. Falls back to the
   *  ?type=book share route when the host doesn't supply it. */
  onOpenBook?: (bookId: string) => void;
}

const AssignedLessonView: React.FC<Props> = ({ assignmentId, assignment: preloaded, user, onBack, onOpenBook }) => {
  const [assignment, setAssignment] = useState<TemplateAssignment | null>(preloaded ?? null);
  const [existing, setExisting] = useState<TemplateSubmission | null>(null);
  const [loading, setLoading] = useState(!preloaded);
  const [done, setDone] = useState<number[]>([]);
  const [reflection, setReflection] = useState('');
  const [selfScores, setSelfScores] = useState<RubricScores>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [hostedBooks, setHostedBooks] = useState<Set<string>>(new Set());

  const studentId = user?.uid ?? '';
  const studentName = user?.displayName || 'Student';

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!assignmentId && !preloaded) { setLoading(false); return; }
      const a = preloaded ?? await fetchAssignment(assignmentId!);
      if (!alive) return;
      setAssignment(a);
      if (a && studentId) {
        const mine = await fetchMySubmission(a.id, studentId);
        if (alive && mine) {
          setExisting(mine);
          setDone(mine.stepsDone ?? []);
          setReflection(mine.reflection ?? '');
          setSelfScores(mine.selfScores ?? {});
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [assignmentId, preloaded, studentId]);

  const materials = useMemo(
    () => (assignment?.materials ?? []).map(id => libraryItemById(id)).filter((m): m is NonNullable<typeof m> => !!m),
    [assignment],
  );

  // Only offer "Read in Plajah" for books that have actually been ingested.
  useEffect(() => {
    let alive = true;
    if (!materials.length) return;
    resolveHostedBooks(materials).then(set => { if (alive) setHostedBooks(set); });
    return () => { alive = false; };
  }, [materials]);

  /** In-app navigation when the host provides it, else the standard share route. */
  const openBook = (bookId: string) => {
    if (onOpenBook) onOpenBook(bookId);
    else window.location.href = bookLink(bookId);
  };

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', padding: 24, color: T.muted, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={16} className="animate-spin" /> Opening your assignment…
      </div>
    );
  }

  if (!assignment) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', padding: 24, fontFamily: T.font, color: T.ink }}>
        {onBack && <button onClick={onBack} style={{ ...btn('ghost', T.muted), marginBottom: 16 }}><ArrowLeft size={14} /> Back</button>}
        <div style={{ ...cardStyle, padding: 20, color: T.muted, fontSize: 13.5, lineHeight: 1.6 }}>
          We couldn't find that assignment. The link may have expired, or it may have been
          assigned to a different class.
        </div>
      </div>
    );
  }

  const toggleStep = (i: number) =>
    setDone(d => (d.includes(i) ? d.filter(x => x !== i) : [...d, i]));

  const allStepsDone = done.length === assignment.steps.length;
  const graded = existing?.status === 'graded' && existing.grade;
  const alreadyIn = sent || !!existing;

  const turnIn = async () => {
    setBusy(true);
    const id = await submitLesson({
      assignment, studentId, studentName,
      stepsDone: done, reflection, selfScores,
    });
    setBusy(false);
    if (id) setSent(true);
  };

  const overdue = assignment.dueDate ? Date.now() > assignment.dueDate : false;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: 24, fontFamily: T.font, color: T.ink }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ ...btn('ghost', T.muted), marginBottom: 14 }}><ArrowLeft size={14} /> Back</button>}

        <h1 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 900 }}>{assignment.title}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={badge(T.cyan)}><Clock size={11} /> About {assignment.estimatedMinutes} min</span>
          <span style={badge(T.muted)}>{assignment.className}</span>
          {assignment.dueDate && (
            <span style={badge(overdue ? T.danger : T.warning)}>
              Due {new Date(assignment.dueDate).toLocaleDateString()}
            </span>
          )}
          {graded && <span style={badge(T.success)}><CircleCheck size={11} /> Graded</span>}
          {!graded && alreadyIn && <span style={badge(T.success)}><Check size={11} /> Turned in</span>}
        </div>
        <p style={{ margin: '0 0 20px', color: T.muted, fontSize: 14.5, lineHeight: 1.7 }}>
          {assignment.objective}
        </p>

        {/* Grade first when it exists — it's what the student opened the link to see. */}
        {graded && existing.grade && (
          <section style={{ ...cardStyle, padding: 20, marginBottom: 16, borderColor: `${T.success}55` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Your result</h3>
              <strong style={{ color: T.success, fontSize: 18 }}>
                {existing.grade.total}/{existing.grade.max}
              </strong>
              <span style={{ color: T.faint, fontSize: 12.5 }}>{existing.grade.masteryPercent}% mastery</span>
            </div>
            {existing.grade.feedback && (
              <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.65 }}>
                {existing.grade.feedback}
              </p>
            )}
          </section>
        )}

        {/* ── Steps ── */}
        <Section icon={Check} title="What to do">
          {assignment.steps.map((step, i) => {
            const isDone = done.includes(i);
            return (
              <label
                key={i}
                style={{
                  display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0',
                  borderTop: i ? `1px solid ${T.border}` : 'none',
                  cursor: alreadyIn ? 'default' : 'pointer',
                  opacity: isDone ? 0.62 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={alreadyIn}
                  onChange={() => toggleStep(i)}
                  style={{ marginTop: 3 }}
                  aria-label={`Step ${i + 1} complete`}
                />
                <span style={{
                  fontSize: 13.5, lineHeight: 1.6,
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                  {step}
                </span>
              </label>
            );
          })}
          {!alreadyIn && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: T.faint }}>
              {done.length} of {assignment.steps.length} done
            </p>
          )}
        </Section>

        {/* ── Materials ── */}
        {materials.length > 0 && (
          <Section icon={BookOpen} title="What you'll need">
            {materials.map((m, i) => {
              // Read it here when Plajah hosts a copy; otherwise send them to the source.
              // Textbooks are free to every account, so this never gates behind anything.
              const hosted = m.readerBookId && hostedBooks.has(m.readerBookId);
              return (
                <div key={m.id} style={{ padding: '11px 0', borderTop: i ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{m.title}</span>
                    <span style={badge(T.faint)}>{LICENSE_LABEL[m.license]}</span>
                    {hosted && <span style={badge(T.success)}>Free to read here</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {hosted && (
                      <button
                        onClick={() => openBook(m.readerBookId!)}
                        style={{ ...btn('solid', T.orange), padding: '7px 13px', fontSize: 12.5 }}
                      >
                        <BookOpen size={13} /> Read in Plajah
                      </button>
                    )}
                    <a
                      href={m.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...btn(hosted ? 'ghost' : 'outline', T.cyan), padding: '7px 13px', fontSize: 12.5, textDecoration: 'none' }}
                    >
                      <ExternalLink size={12} /> {hosted ? 'View at source' : 'Open'}
                    </a>
                  </div>
                  <p style={{ margin: '7px 0 0', fontSize: 11, color: T.faint, lineHeight: 1.55 }}>
                    {m.attribution}
                  </p>
                </div>
              );
            })}
          </Section>
        )}

        {/* ── Support / extension, framed for the student rather than the teacher ── */}
        {(assignment.differentiation?.support || assignment.differentiation?.extension) && (
          <Section icon={Lightbulb} title="If you get stuck — or want more">
            {assignment.differentiation.support && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: T.muted, lineHeight: 1.65 }}>
                <strong style={{ color: T.ink }}>Stuck?</strong> {assignment.differentiation.support}
              </p>
            )}
            {assignment.differentiation.extension && (
              <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.65 }}>
                <strong style={{ color: T.ink }}>Want a challenge?</strong> {assignment.differentiation.extension}
              </p>
            )}
          </Section>
        )}

        {/* ── Rubric, visible up front ── */}
        <Section icon={Scale} title="How this is graded">
          {assignment.rubric.criteria.map((c, ci) => (
            <div key={ci} style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 13.5 }}>{c.name}</strong>
              <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginTop: 8 }}>
                {c.levels.map(lv => {
                  const picked = selfScores[c.name] === lv.points;
                  return (
                    <button
                      key={lv.label}
                      disabled={alreadyIn}
                      onClick={() => setSelfScores(s => ({ ...s, [c.name]: lv.points }))}
                      style={{
                        textAlign: 'left', padding: '9px 11px', borderRadius: 9,
                        border: `1px solid ${picked ? T.cyan : T.border}`,
                        background: picked ? `${T.cyan}18` : T.cardAlt,
                        color: T.ink, cursor: alreadyIn ? 'default' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: picked ? T.cyan : T.faint }}>
                        {lv.label} · {lv.points}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
                        {lv.descriptor}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>
            Pick where you think your work lands. Your teacher sees this next to their own scoring —
            it doesn't change your grade, it starts the conversation about it.
          </p>
        </Section>

        {/* ── Turn in ── */}
        {!alreadyIn && (
          <Section icon={Send} title="Turn it in">
            <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 6, marginBottom: 14 }}>
              What did you find hard, or figure out? (optional)
              <textarea
                value={reflection}
                onChange={e => setReflection(e.target.value)}
                rows={3}
                style={{
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.ink,
                  padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </label>
            {!allStepsDone && (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: T.warning, lineHeight: 1.6 }}>
                You still have {assignment.steps.length - done.length} step
                {assignment.steps.length - done.length === 1 ? '' : 's'} unchecked. You can still
                turn in — your teacher will see what you got through.
              </p>
            )}
            <button onClick={turnIn} disabled={busy} style={{ ...btn('solid', T.orange), opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Turn in
            </button>
          </Section>
        )}

        {alreadyIn && !graded && (
          <div style={{ ...cardStyle, padding: 18, display: 'flex', gap: 9, alignItems: 'center' }}>
            <Check size={16} color={T.success} />
            <span style={{ fontSize: 13.5, color: T.muted }}>
              Turned in. Your teacher has it — you'll get a notification when it's graded.
            </span>
          </div>
        )}

        {assignment.standardCodes.length > 0 && (
          <p style={{ margin: '20px 0 0', fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>
            <Target size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
            Counts toward: {assignment.standardCodes
              .map(code => describeStandard({ framework: code.startsWith('PISA') ? 'PISA' : code.startsWith('CCSS') ? 'CCSS' : 'NGSS', code }).display)
              .join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
};

export default AssignedLessonView;
