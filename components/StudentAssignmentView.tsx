// StudentAssignmentView — the student's assignment-doing surface (the "actual assignment view").
//
// Composes the whole learning loop for one assignment:
//   · Worksheet tab  — the fillable worksheet (WorksheetFillable) + the in-worksheet Plajah tutor
//                      (WorksheetTutorPanel, with digital hand-raise) + Turn in → real auto-grade
//                      (turnInWorksheet: credits the Learner Ledger, notifies the teacher).
//   · Practice tab   — Time Attack for this assignment's skill (embedded TimeAttackMode), awarding
//                      real points + writing mastery back to the ledger.
//
// Accepts a DigitalWorksheet (loaded from the assignment) or falls back to a sample so the view is
// demoable. All wiring reuses the services already built; simulate:true keeps the demo from writing
// against placeholder accounts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Flame, Send, GraduationCap, RefreshCw, Trophy, Loader2, Camera } from 'lucide-react';
import WorksheetFillable from './WorksheetFillable';
import WorksheetTutorPanel from './WorksheetTutorPanel';
import { TimeAttackMode, generateProblem, type MathProblem, type TimeAttackSessionResult } from './MathClassroom';
import { completionPercent, readCompletedWorksheet, type DigitalWorksheet } from '../services/worksheetDigitizer';
import { prepareWorksheetImage, type PreparedWorksheetImage } from '../services/worksheetImagePipeline';
import { turnInWorksheet, fetchWorksheet, markWorksheetOpened } from '../services/worksheetAssignmentService';
import { installAssignmentQualityTelemetry, recordAssignmentQualityEvent, submitAssignmentQualityFeedback } from '../services/assignmentQualityService';
import { recordTimeAttackResult } from '../services/mathChallengeService';
import { appendRecord } from '../services/learningLedgerService';
import { mathStandardForGrade } from '../data/educationStandards';

const T = {
  bg: '#0a0a0f', card: '#12121a', alt: '#15151f', border: '#20202c', ink: '#fff', muted: '#9a9aa6', faint: '#777',
  orange: '#FF8C00', green: '#5fd17f', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

// A sample worksheet so the view is demoable without a persisted assignment.
const SAMPLE: DigitalWorksheet = {
  id: 'sample', title: 'Addition practice', subject: 'Math',
  objective: 'Add within 20', gradeBand: 'g34', framework: 'CCSS_MATH',
  standardIds: ['CCSS.MATH.2.OA.B.2'],
  createdBy: 'demo-teacher', createdAt: 0, status: 'published', hasManualFields: false,
  fields: [
    { id: 'q1', label: '1.  7 + 6 =', type: 'numeric', box: { x: 60, y: 18, width: 18, height: 7 }, correctAnswer: '13', points: 1, standardIds: ['CCSS.MATH.2.OA.B.2'] },
    { id: 'q2', label: '2.  8 + 9 =', type: 'numeric', box: { x: 60, y: 40, width: 18, height: 7 }, correctAnswer: '17', points: 1, standardIds: ['CCSS.MATH.2.OA.B.2'] },
    { id: 'q3', label: '3.  5 + 5 =', type: 'numeric', box: { x: 60, y: 62, width: 18, height: 7 }, correctAnswer: '10', points: 1, standardIds: ['CCSS.MATH.2.OA.B.2'] },
  ],
};

const gradeFromBand = (band?: string): number => (band === 'g_k2' ? 2 : band === 'g34' ? 3 : band === 'g56' ? 5 : band === 'g78' ? 7 : 3);

interface Props {
  user?: any;
  onBack?: () => void;
  worksheet?: DigitalWorksheet;
  worksheetId?: string;
  assignmentId?: string;
}

const StudentAssignmentView: React.FC<Props> = ({ user, onBack, worksheet, worksheetId, assignmentId }) => {
  // Load the specific worksheet when opened via the assignment deep-link (?view=assignment&id=…).
  // Falls back to the sample when no id/worksheet is supplied so the view is always demoable.
  const [loaded, setLoaded] = useState<DigitalWorksheet | null>(worksheet || null);
  const [loading, setLoading] = useState(!!worksheetId && !worksheet);
  useEffect(() => {
    if (worksheet || !worksheetId) return;
    let alive = true;
    setLoading(true);
    fetchWorksheet(worksheetId).then(w => { if (alive) { setLoaded(w); setLoading(false); } });
    return () => { alive = false; };
  }, [worksheetId, worksheet]);
  const sheet = loaded || SAMPLE;

  const [tab, setTab] = useState<'worksheet' | 'practice'>('worksheet');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [graded, setGraded] = useState<{ percent: number; results: Record<string, boolean | null>; recorded: number } | null>(null);
  const [turnAudit, setTurnAudit] = useState<{ submittedAt: number; turnedInAt: number; durationMs: number } | null>(null);
  const [qualityRating, setQualityRating] = useState(0);
  const [qualityComment, setQualityComment] = useState('');
  const [qualitySent, setQualitySent] = useState(false);
  const [completedScan, setCompletedScan] = useState<PreparedWorksheetImage | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Practice (Time Attack) for this assignment's skill.
  const grade = gradeFromBand(sheet.gradeBand);
  const topic = sheet.subject === 'Math' ? 'Addition (0–20)' : sheet.subject;
  const [taProblems, setTaProblems] = useState<MathProblem[]>([]);
  const [taActive, setTaActive] = useState(false);
  const [taResult, setTaResult] = useState<TimeAttackSessionResult | null>(null);

  const fillPct = useMemo(() => completionPercent(sheet, answers), [sheet, answers]);
  const qualityContext = useMemo(() => ({
    worksheetId: worksheetId || sheet.id || 'sample', assignmentId, title: sheet.title,
    actorId: user?.uid || 'demo-student', actorName: user?.displayName || 'You', actorRole: 'STUDENT' as const, simulate: !user?.uid,
  }), [assignmentId, sheet.id, sheet.title, user?.displayName, user?.uid, worksheetId]);

  useEffect(() => {
    if (loading) return;
    void markWorksheetOpened({ worksheetId: qualityContext.worksheetId, assignmentId, studentId: qualityContext.actorId, studentName: qualityContext.actorName, assignedAt: sheet.createdAt, simulate: qualityContext.simulate });
    return installAssignmentQualityTelemetry(qualityContext);
  }, [assignmentId, loading, qualityContext, sheet.createdAt]);

  const doTurnIn = async () => {
    if (busy || graded) return;
    setBusy(true);
    const res = await turnInWorksheet({
      worksheetId: worksheetId || sheet.id || 'sample',
      assignmentId, sheet, studentId: user?.uid || 'demo-student', studentName: user?.displayName || 'You',
      answers,
      completedScanFile: completedScan?.originalFile,
      teacher: { uid: 'demo-teacher', name: 'Ms. Carter' },
      simulate: !user?.uid, // real ledger write when signed in; simulate otherwise
    }).catch(() => null);
    if (res) {
      const results: Record<string, boolean | null> = {};
      res.grade.perField.forEach(p => { results[p.fieldId] = p.correct; });
      setGraded({ percent: res.grade.percent, results, recorded: res.standardsRecorded });
      setTurnAudit(res.audit);
    } else {
      void recordAssignmentQualityEvent({ ...qualityContext, kind: 'SUBMISSION_FAILURE', severity: 'ERROR', source: 'StudentAssignmentView.turnIn', message: 'The assignment could not be turned in.' });
    }
    setBusy(false);
  };

  const importCompletedPaper = async (file?: File) => {
    if (!file || scanBusy) return;
    setScanBusy(true); setScanMessage('Cleaning the photo and reading handwriting…');
    try {
      const prepared = await prepareWorksheetImage(file);
      const recognized = await readCompletedWorksheet(prepared.cleanedBase64, 'image/jpeg', sheet);
      setCompletedScan(prepared);
      setAnswers(current => ({ ...current, ...recognized.answers }));
      const confidenceValues = Object.values(recognized.confidence);
      const confidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0;
      setScanMessage(`Imported ${Object.keys(recognized.answers).length} response${Object.keys(recognized.answers).length === 1 ? '' : 's'} · ${Math.round(confidence * 100)}% confidence. Check each answer before turning in.`);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'Could not read this completed worksheet.');
      void recordAssignmentQualityEvent({ ...qualityContext, kind: 'SCAN_FAILURE', severity: 'ERROR', source: 'StudentAssignmentView.completedPaper', message: error instanceof Error ? error.message : 'Could not read completed worksheet' });
    } finally { setScanBusy(false); }
  };

  const startPractice = () => {
    setTaProblems(Array.from({ length: 40 }, (_, i) => ({ id: `ta_${i}`, ...generateProblem(grade, topic) })));
    setTaActive(true); setTaResult(null);
  };
  const onPracticeDone = (r: TimeAttackSessionResult) => {
    setTaResult(r); setTaActive(false);
    if (user?.uid) {
      recordTimeAttackResult(user.uid, r).catch(() => {});
      const std = mathStandardForGrade(r.grade);
      const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
      if (std) appendRecord({ studentId: user.uid, standardId: std.id, framework: 'CCSS_MATH', source: 'math-classroom', masteryBefore: pct, masteryAfter: pct }).catch(() => {});
    }
  };

  const tabBtn = (id: 'worksheet' | 'practice', label: string, Icon: any) => (
    <button onClick={() => setTab(id)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === id ? T.orange : T.border}`, background: tab === id ? T.orange : 'transparent', color: tab === id ? '#1a1a1a' : T.muted }}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={20} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{sheet.title}</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{sheet.subject}{sheet.objective ? ` · ${sheet.objective}` : ''} · homework</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: T.muted, fontSize: 13 }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading assignment…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (<>
        <div style={{ display: 'flex', gap: 8, margin: '18px 0 18px', flexWrap: 'wrap' }}>
          {tabBtn('worksheet', 'Worksheet', ClipboardCheck)}
          {tabBtn('practice', 'Practice · Time Attack', Flame)}
        </div>

        {tab === 'worksheet' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <WorksheetFillable sheet={sheet} answers={answers} setAnswers={setAnswers} accent={T.orange} results={graded?.results} readOnly={!!graded} mode="rebuilt" />
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted, marginBottom: 4 }}><span>Progress (live to teacher + parent)</span><span>{fillPct}%</span></div>
                <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  <div style={{ width: `${graded ? 100 : fillPct}%`, height: '100%', background: graded ? T.green : T.orange }} />
                </div>
              </div>
              {graded ? (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'rgba(95,209,127,0.1)', border: `1px solid ${T.green}` }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: T.green, display: 'flex', alignItems: 'center', gap: 7 }}><Trophy size={16} /> Turned in · {graded.percent}%</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Auto-graded and saved to your Learner Ledger{graded.recorded ? ` · ${graded.recorded} standard${graded.recorded > 1 ? 's' : ''} credited` : ''}. Your teacher was notified.</div>
                  {turnAudit && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 5 }}>Submitted {new Date(turnAudit.submittedAt).toLocaleString()} · turned in {new Date(turnAudit.turnedInAt).toLocaleTimeString()} · {Math.max(1, Math.round(turnAudit.durationMs / 60000))} min in assignment</div>}
                  {!qualitySent ? <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}><div style={{ fontSize: 11, fontWeight: 800 }}>How well did this assignment work?</div><div style={{ display: 'flex', gap: 5, marginTop: 7 }}>{[1,2,3,4,5].map(rating => <button key={rating} onClick={() => setQualityRating(rating)} style={{ width: 32, height: 30, borderRadius: 8, cursor: 'pointer', border: `1px solid ${qualityRating === rating ? T.violet : T.border}`, color: qualityRating === rating ? '#fff' : T.muted, background: qualityRating === rating ? T.violet : 'transparent', fontWeight: 850 }}>{rating}</button>)}</div><textarea value={qualityComment} onChange={event => setQualityComment(event.target.value)} placeholder="What worked or broke? (optional)" style={{ width: '100%', minHeight: 54, resize: 'vertical', marginTop: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, padding: 8, font: 'inherit', fontSize: 11 }}/><button disabled={!qualityRating} onClick={() => { void submitAssignmentQualityFeedback({ ...qualityContext, rating: qualityRating, comment: qualityComment, category: 'USABILITY' }).then(() => setQualitySent(true)); }} style={{ marginTop: 7, height: 32, padding: '0 12px', borderRadius: 8, border: 0, background: T.violet, color: '#fff', fontWeight: 800, opacity: qualityRating ? 1 : .45 }}>Send quality feedback</button></div> : <div style={{ fontSize: 11, color: T.green, marginTop: 10 }}>Quality feedback attached to this assignment. Thank you.</div>}
                </div>
              ) : (
                <>
                <input ref={scanInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { void importCompletedPaper(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                <button onClick={() => scanInputRef.current?.click()} disabled={scanBusy} style={{ marginTop: 14, width: '100%', cursor: scanBusy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 18px', borderRadius: 10, border: `1px solid ${T.violet}`, background: 'rgba(129,102,230,.1)', color: '#d8cffc', fontSize: 12.5, fontWeight: 800 }}>
                  {scanBusy ? <><Loader2 size={15} /> Reading completed paper…</> : <><Camera size={15} /> Scan completed paper</>}
                </button>
                {scanMessage && <div style={{ marginTop: 8, color: T.muted, fontSize: 11.5, lineHeight: 1.45 }}>{scanMessage}</div>}
                {completedScan && <img src={completedScan.originalDataUrl} alt="Completed paper scan" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', marginTop: 9, borderRadius: 8, background: '#08080c' }} />}
                <button onClick={doTurnIn} disabled={busy} style={{ marginTop: 14, width: '100%', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: busy ? 0.7 : 1 }}>
                  {busy ? <>Grading…</> : <><Send size={15} /> Turn in</>}
                </button>
                </>
              )}
            </div>
            <div>
              <WorksheetTutorPanel sheet={sheet} accent={T.orange} activeFieldId={sheet.fields[0]?.id} />
            </div>
          </div>
        )}

        {tab === 'practice' && (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            {!taActive && !taResult && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40 }}>⏱️</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>Time Attack</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Practice this assignment's skill — {topic}. Answer fast, build your combo, earn points.</div>
                <button onClick={startPractice} style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#FF8C00,#8166e6)', color: '#fff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Flame size={16} /> Start</button>
              </div>
            )}
            {taActive && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <TimeAttackMode problems={taProblems} onComplete={onPracticeDone} />
              </div>
            )}
            {taResult && !taActive && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 44 }}>{taResult.total > 0 && taResult.correct >= taResult.total * 0.8 ? '🏆' : '⚡'}</div>
                <div style={{ fontSize: 34, fontWeight: 900 }}>{taResult.score}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{taResult.correct}/{taResult.total} correct · best combo x{taResult.comboMax}</div>
                {user?.uid && <div style={{ fontSize: 10.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>Points added · saved to your ledger</div>}
                <button onClick={startPractice} style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 12, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><RefreshCw size={14} /> Play again</button>
              </div>
            )}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
};

export default StudentAssignmentView;
