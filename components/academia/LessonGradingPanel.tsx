// LessonGradingPanel — the teacher's side of an assigned template.
//
// Grading against the rubric is what credits the Learner Ledger: each criterion score rolls into
// a 0–100 mastery figure, and one record per aligned standard is written. Without that step a
// lesson is just a gradebook row and the standards graph never learns anything from it.
//
// The student's own self-assessment sits next to the teacher's scoring on purpose. Where they
// disagree is the most useful thing on the screen — it's the conversation the rubric exists to
// start, and hiding it would waste the only self-report the system ever collects.

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Loader2, Check, Target, User, MessageSquare } from 'lucide-react';
import {
  listSubmissions, gradeSubmission, scoresToMastery,
  type TemplateAssignment, type TemplateSubmission, type RubricScores,
} from '../../services/assignmentTemplateService';
import type { AssignmentTemplate } from '../../data/assignmentTemplates';
import { T, cardStyle, btn, badge } from './integrityTheme';

const LessonGradingPanel: React.FC<{
  assignment: TemplateAssignment;
  template: AssignmentTemplate;
  gradedBy: string;
}> = ({ assignment, template, gradedBy }) => {
  const [submissions, setSubmissions] = useState<TemplateSubmission[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = async () => setSubmissions(await listSubmissions(assignment.id));
  useEffect(() => { void reload(); }, [assignment.id]);

  if (submissions === null) {
    return (
      <div style={{ ...cardStyle, padding: 20, color: T.muted, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Loader2 size={14} className="animate-spin" /> Loading submissions…
      </div>
    );
  }

  const ungraded = submissions.filter(s => s.status !== 'graded').length;

  return (
    <section style={{ ...cardStyle, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <ClipboardCheck size={16} color={T.orange} />
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Turned in</h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
        {submissions.length} of {assignment.studentIds.length} students
        {ungraded > 0 ? ` · ${ungraded} waiting to be graded` : ' · all graded'}.
        Scoring here writes mastery to each student's ledger.
      </p>

      {submissions.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Nothing turned in yet.</p>
      )}

      {submissions.map((sub, i) => (
        <div key={sub.id} style={{ padding: '12px 0', borderTop: i ? `1px solid ${T.border}` : 'none' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <User size={13} color={T.muted} />
            <strong style={{ fontSize: 13.5 }}>{sub.studentName}</strong>
            {sub.status === 'graded' && sub.grade ? (
              <span style={badge(T.success)}>
                <Check size={11} /> {sub.grade.total}/{sub.grade.max} · {sub.grade.masteryPercent}%
              </span>
            ) : (
              <span style={badge(T.warning)}>Needs grading</span>
            )}
            <span style={{ fontSize: 11.5, color: T.faint }}>
              {new Date(sub.submittedAt).toLocaleDateString()} · {sub.stepsDone.length}/{assignment.steps.length} steps
            </span>
            <button
              onClick={() => setOpenId(openId === sub.id ? null : sub.id)}
              style={{ ...btn('outline', T.cyan), marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}
            >
              {openId === sub.id ? 'Close' : sub.status === 'graded' ? 'Review' : 'Grade'}
            </button>
          </div>

          {openId === sub.id && (
            <GradeForm
              submission={sub}
              template={template}
              gradedBy={gradedBy}
              onGraded={async () => { await reload(); setOpenId(null); }}
            />
          )}
        </div>
      ))}
    </section>
  );
};

const GradeForm: React.FC<{
  submission: TemplateSubmission;
  template: AssignmentTemplate;
  gradedBy: string;
  onGraded: () => Promise<void>;
}> = ({ submission, template, gradedBy, onGraded }) => {
  const [scores, setScores] = useState<RubricScores>(submission.grade?.scores ?? {});
  const [feedback, setFeedback] = useState(submission.grade?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ mastery: number; standards: number } | null>(null);

  const rubric = template.structure.rubric;
  const { total, max, masteryPercent } = useMemo(() => scoresToMastery(scores, rubric), [scores, rubric]);
  const complete = rubric.criteria.every(c => scores[c.name] !== undefined);

  const save = async () => {
    setBusy(true);
    const out = await gradeSubmission({ submission, template, scores, feedback, gradedBy });
    setBusy(false);
    if (out.ok) {
      setResult({ mastery: out.masteryPercent, standards: out.standardsWritten });
      await onGraded();
    }
  };

  return (
    <div style={{ marginTop: 14, padding: 16, background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 12 }}>
      {submission.reflection && (
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: T.muted, lineHeight: 1.65 }}>
          <MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
          <em>"{submission.reflection}"</em>
        </p>
      )}

      {rubric.criteria.map(c => {
        const selfPick = submission.selfScores?.[c.name];
        return (
          <div key={c.name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 7 }}>
              <strong style={{ fontSize: 13 }}>{c.name}</strong>
              {selfPick !== undefined && (
                <span style={{ fontSize: 11, color: T.lilac }}>student said {selfPick}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.levels.map(lv => {
                const picked = scores[c.name] === lv.points;
                const isSelf = selfPick === lv.points;
                return (
                  <button
                    key={lv.label}
                    title={lv.descriptor}
                    onClick={() => setScores(s => ({ ...s, [c.name]: lv.points }))}
                    style={{
                      padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${picked ? T.orange : isSelf ? T.lilac : T.border}`,
                      background: picked ? `${T.orange}22` : 'transparent',
                      color: picked ? T.orange : T.ink, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {lv.label} · {lv.points}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 5, marginBottom: 12 }}>
        Feedback
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={2}
          style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.ink,
            padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={busy || !complete}
          title={complete ? undefined : 'Score every criterion first.'}
          style={{ ...btn('solid', T.orange), opacity: busy || !complete ? 0.5 : 1 }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save grade
        </button>
        <span style={{ fontSize: 12.5, color: T.muted }}>
          {total}/{max} · {masteryPercent}% mastery
        </span>
      </div>

      {result && (
        <p role="status" style={{ margin: '12px 0 0', fontSize: 12.5, color: T.success, lineHeight: 1.6 }}>
          <Target size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
          Saved. {result.standards} standard{result.standards === 1 ? '' : 's'} credited to the
          ledger at {result.mastery}% mastery.
        </p>
      )}
    </div>
  );
};

export default LessonGradingPanel;
