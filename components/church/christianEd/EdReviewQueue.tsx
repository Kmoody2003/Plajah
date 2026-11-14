import React, { useMemo, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { UniversalDeskAssignment } from '../../../services/universalStudentDeskService';
import { returnSubmission, type EduSubmissionRecord } from '../../../services/christianEdSync';
import { isAnswerCorrect, type IngestedQuestion } from '../../../services/curriculumIngestionService';
import { announceWorkChanged, isWritten } from './edWork';
import { initials } from './edStyles';

export interface ReviewItem {
  sub: EduSubmissionRecord;
  assignment?: UniversalDeskAssignment;
  program: ChurchProgram;
}

type Verdict = 'CORRECT' | 'PARTIAL' | 'RETRY';
const VERDICTS: Array<[Verdict, string]> = [
  ['CORRECT', 'Correct'],
  ['PARTIAL', 'Partly'],
  ['RETRY', 'Try again'],
];

/** One turned-in paper at a time: written answers next to the key, three verdicts, a note, Return & next. */
const EdReviewQueue: React.FC<{ items: ReviewItem[]; canSeeKey: boolean; onBack: () => void }> = ({ items, canSeeKey, onBack }) => {
  const [i, setI] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [returned, setReturned] = useState<Set<string>>(new Set());

  const queue = items.filter(x => !returned.has(x.sub.id));
  const cur = queue[Math.min(i, queue.length - 1)];

  const qs = cur?.assignment?.unitSnapshot.questions || [];
  const written = qs.filter(isWritten);
  const auto = qs.filter(q => !isWritten(q));
  // Questions the student's desk couldn't grade (its copy had no key) are scored here, with the teacher's key.
  const autoScore = (q: IngestedQuestion) => {
    const prev = cur?.sub.questionScores[q.id];
    if (prev && !prev.pending) return prev;
    const correct = isAnswerCorrect(q, cur?.sub.answers[q.id] || '');
    return { correct, earnedPoints: correct ? q.points || 1 : 0, maxPoints: q.points || 1 };
  };
  const autoRight = auto.filter(q => autoScore(q).correct).length;

  const score = useMemo(() => {
    if (!cur) return { earned: 0, pct: 0 };
    let earned = 0;
    for (const q of auto) earned += autoScore(q).earnedPoints;
    for (const q of written) {
      const v = verdicts[q.id];
      earned += v === 'CORRECT' ? q.points : v === 'PARTIAL' ? q.points / 2 : 0;
    }
    const total = cur.sub.totalPoints || qs.reduce((s, q) => s + q.points, 0) || 1;
    return { earned, pct: Math.round((earned / total) * 100) };
  }, [cur, auto, written, verdicts, qs]);

  if (!cur) {
    return (
      <div className="stack">
        <button type="button" className="back" onClick={onBack}>
          ← Back
        </button>
        <div className="empty">
          <div className="t">All caught up</div>
          <div>Nothing is waiting for review.</div>
        </div>
      </div>
    );
  }

  const ready = written.every(q => verdicts[q.id]);

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      // Returned work carries the final per-question scores, and now the expected answers too, so the student can learn from them.
      const questionScores: EduSubmissionRecord['questionScores'] = {};
      for (const q of qs) {
        const v = verdicts[q.id];
        const base = isWritten(q)
          ? { correct: v === 'CORRECT', earnedPoints: v === 'CORRECT' ? q.points : v === 'PARTIAL' ? q.points / 2 : 0, maxPoints: q.points }
          : autoScore(q);
        questionScores[q.id] = { correct: base.correct, earnedPoints: base.earnedPoints, maxPoints: base.maxPoints, ...(q.correctAnswer ? { expected: q.correctAnswer } : {}) };
      }
      await returnSubmission(cur.sub, { verdicts, note, earnedPoints: score.earned, percentage: score.pct, questionScores: cur.assignment ? questionScores : undefined });
      setReturned(prev => new Set(prev).add(cur.sub.id));
      setVerdicts({});
      setNote('');
      announceWorkChanged();
    } catch {
      setErr('Could not return this work. You may not be listed as a teacher on this class.');
    }
    setBusy(false);
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <button type="button" className="back" onClick={onBack}>
          ← Back
        </button>
        <div className="grow" />
        <span className="tag hot">
          {Math.min(i, queue.length - 1) + 1} of {queue.length}
        </span>
      </div>

      <div className="row">
        <span className="av" style={{ background: '#00A9C0', width: 42, height: 42 }}>{initials(cur.sub.studentName)}</span>
        <div className="grow">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
            {cur.sub.studentName} · {cur.sub.assignmentTitle}
          </h2>
          <div className="small">
            {cur.program.name} · turned in {new Date(cur.sub.turnedInAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            {auto.length > 0 ? ` · ${autoRight} of ${auto.length} auto-graded correct` : ''}
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {!cur.assignment && <div className="err">This assignment was removed, so only the score can be returned.</div>}

      {written.map(q => (
        <div className="panel" key={q.id}>
          <div className="ph">
            <h3>
              Q{q.number} · {q.prompt}
            </h3>
            <span className="small">{q.points} pt{q.points === 1 ? '' : 's'}</span>
          </div>
          <div className="pb">
            <div className="split">
              <div className="stack">
                <div className="small">{cur.sub.studentName.split(' ')[0]}’s answer</div>
                <div className="ans">{cur.sub.answers[q.id]?.trim() || '(left blank)'}</div>
              </div>
              {canSeeKey && (q.correctAnswer || q.explanation) && (
                <div className="stack">
                  <div className="small">Answer key</div>
                  <div className="ans key">{[q.correctAnswer, q.explanation].filter(Boolean).join('\n\n')}</div>
                </div>
              )}
            </div>
            <div className="chips">
              {VERDICTS.map(([v, label]) => (
                <button key={v} type="button" className="chip" aria-pressed={verdicts[q.id] === v} onClick={() => setVerdicts(prev => ({ ...prev, [q.id]: v }))}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}

      <label className="lbl">
        Comment to {cur.sub.studentName.split(' ')[0]} (optional)
        <textarea id="ed-review-note" className="field" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Great thinking! Look again at verse 29." />
      </label>

      <div className="row wrap">
        <span className="small grow">
          Score if returned now: {score.earned} / {cur.sub.totalPoints} ({score.pct}%)
        </span>
        <button type="button" className="btn" disabled={queue.length < 2} onClick={() => setI(n => (n + 1) % queue.length)}>
          Skip
        </button>
        <button type="button" className="btn p" disabled={busy || !ready} onClick={send}>
          {queue.length > 1 ? 'Return & next →' : 'Return'}
        </button>
      </div>
    </div>
  );
};

export default EdReviewQueue;
