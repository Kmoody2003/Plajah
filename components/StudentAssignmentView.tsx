// StudentAssignmentView — the student's assignment-doing surface (the "actual assignment view").
//
// Composes the whole learning loop for one assignment:
//   · Worksheet tab  — the fillable worksheet (WorksheetFillable) + the in-worksheet Plajah tutor
//                      (WorksheetTutorPanel, with digital hand-raise).
//   · Paper path     — "Scan my paper": the photo is straightened, the answer boxes are registered
//                      onto it, and what Plajah read is filled in for the student to confirm.
//   · Check my work  — flags blanks, unconfirmed reads and answers to try again (never revealing the
//                      key), then the student reviews and approves the turn-in.
//   · Turn in        — real auto-grade (turnInWorksheet: credits the Learner Ledger, notifies the
//                      worksheet's own teacher).
//   · Practice tab   — Time Attack for this assignment's skill (embedded TimeAttackMode).
//
// Accepts a DigitalWorksheet (loaded from the assignment, or handed over by the scanner) or falls
// back to a sample so the view is demoable; simulate:true keeps the demo off placeholder accounts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Flame, Send, GraduationCap, RefreshCw, Trophy, Loader2, Camera, ListChecks, X } from 'lucide-react';
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
import { selfCheckWorksheet, type SelfCheckResult } from '../services/worksheetScanCore';
import { takeWorksheetOpenIntent } from '../services/worksheetOpen';
import { warmOcr } from '../services/worksheetLocalVision';
import { useViewport } from '../hooks/useViewport';

const T = {
  bg: '#0a0a0f', card: '#12121a', alt: '#15151f', border: '#20202c', ink: '#fff', muted: '#9a9aa6', faint: '#808090',
  orange: '#FF8C00', green: '#5fd17f', violet: '#8166e6', red: '#ff6b6b', gold: '#e0a400', blue: '#36c5f0',
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

const StudentAssignmentView: React.FC<Props> = ({ user, onBack, worksheet, worksheetId: worksheetIdProp, assignmentId: assignmentIdProp }) => {
  // The scanner (or the calendar) hands over the assignment in-app; a deep link passes the id.
  const [intent] = useState(() => (worksheet || worksheetIdProp ? null : takeWorksheetOpenIntent()));
  const worksheetId = worksheetIdProp || intent?.worksheetId;
  const assignmentId = assignmentIdProp || intent?.assignmentId;
  const initialSheet = worksheet || intent?.sheet || null;
  const [loaded, setLoaded] = useState<DigitalWorksheet | null>(initialSheet);
  const [loading, setLoading] = useState(!!worksheetId && !initialSheet);
  useEffect(() => {
    if (initialSheet || !worksheetId) return;
    let alive = true;
    setLoading(true);
    fetchWorksheet(worksheetId).then(w => { if (alive) { setLoaded(w); setLoading(false); } });
    return () => { alive = false; };
  }, [worksheetId, initialSheet]);
  const sheet = loaded || SAMPLE;
  const { isPhone } = useViewport();

  const [tab, setTab] = useState<'worksheet' | 'practice'>('worksheet');
  const [answers, setAnswers] = useState<Record<string, string>>(() => intent?.prefill?.answers || {});
  const [readConfidence, setReadConfidence] = useState<Record<string, number>>(() => intent?.prefill?.confidence || {});
  const scannedAnswers = useRef<Record<string, string>>(intent?.prefill?.answers || {});
  const [check, setCheck] = useState<SelfCheckResult | null>(null);
  const [checks, setChecks] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [graded, setGraded] = useState<{ percent: number; results: Record<string, boolean | null>; recorded: number; needsReview: boolean } | null>(null);
  const [turnAudit, setTurnAudit] = useState<{ submittedAt: number; turnedInAt: number; durationMs: number } | null>(null);
  const [qualityRating, setQualityRating] = useState(0);
  const [qualityComment, setQualityComment] = useState('');
  const [qualitySent, setQualitySent] = useState(false);
  const [completedScan, setCompletedScan] = useState<{ file: File; preview: string } | null>(() => intent?.prefill?.scanFile ? { file: intent.prefill.scanFile, preview: intent.prefill.scanPreview || '' } : null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState(() => intent?.prefill ? `Plajah filled in ${Object.values(intent.prefill.answers).filter(Boolean).length} answers from your paper. Check them, then turn in.` : '');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // A scan that arrives pre-filled gets checked straight away.
  useEffect(() => {
    if (!intent?.prefill || loading) return;
    const result = selfCheckWorksheet(sheet, answers, readConfidence);
    setCheck(result);
    if (result.ready) setConfirmOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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

  // Editing an answer the scan read means the student confirmed it themselves: it is no longer a "read".
  const updateAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>> = (next) => {
    setAnswers(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      const changed = Object.keys(value).filter(id => value[id] !== prev[id]);
      if (changed.length) {
        setReadConfidence(rc => { const out = { ...rc }; changed.forEach(id => { delete out[id]; }); return out; });
        if (check) setCheck(c => c && ({ ...c, perField: Object.fromEntries(Object.entries(c.perField).filter(([id]) => !changed.includes(id))) }));
      }
      return value;
    });
  };

  const runCheck = () => {
    const result = selfCheckWorksheet(sheet, answers, readConfidence);
    setCheck(result); setChecks(n => n + 1);
    const first = sheet.fields.find(f => ['try-again', 'blank', 'check-read'].includes(result.perField[f.id]?.status));
    if (first) document.getElementById(`ws-field-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return result;
  };

  const doTurnIn = async () => {
    if (busy || graded) return;
    setBusy(true); setConfirmOpen(false);
    const isSample = sheet === SAMPLE;
    // Only reads the student left untouched keep their (possibly shaky) confidence.
    const keptReads = Object.fromEntries(Object.entries(readConfidence).filter(([id]) => answers[id] === scannedAnswers.current[id]));
    const res = await turnInWorksheet({
      worksheetId: worksheetId || sheet.id || 'sample',
      assignmentId, sheet, studentId: user?.uid || 'demo-student', studentName: user?.displayName || 'You',
      answers,
      completedScanFile: completedScan?.file,
      readConfidence: completedScan ? keptReads : undefined,
      selfChecks: checks,
      teacher: isSample ? { uid: 'demo-teacher', name: 'Ms. Carter' } : { uid: sheet.createdBy, name: 'Teacher' },
      simulate: !user?.uid || isSample, // real ledger write when signed in on a real assignment
    }).catch(() => null);
    if (res) {
      const results: Record<string, boolean | null> = {};
      res.grade.perField.forEach(p => { results[p.fieldId] = p.correct; });
      setGraded({ percent: res.grade.percent, results, recorded: res.standardsRecorded, needsReview: res.grade.needsManualReview });
      setTurnAudit(res.audit);
    } else {
      void recordAssignmentQualityEvent({ ...qualityContext, kind: 'SUBMISSION_FAILURE', severity: 'ERROR', source: 'StudentAssignmentView.turnIn', message: 'The assignment could not be turned in.' });
    }
    setBusy(false);
  };

  const importCompletedPaper = async (file?: File) => {
    if (!file || scanBusy) return;
    setScanBusy(true); setScanMessage('Cleaning the photo…');
    try {
      const prepared: PreparedWorksheetImage = await prepareWorksheetImage(file);
      const recognized = await readCompletedWorksheet(prepared.cleanedBase64, 'image/jpeg', sheet, { handwriting: 'auto', onProgress: setScanMessage });
      setCompletedScan({ file: prepared.originalFile, preview: recognized.pageImage || prepared.originalDataUrl });
      const read = Object.fromEntries(Object.entries(recognized.answers).filter(([, v]) => v));
      scannedAnswers.current = { ...scannedAnswers.current, ...read };
      const nextAnswers = { ...answers, ...read };
      const nextConf = { ...readConfidence, ...Object.fromEntries(Object.keys(read).map(id => [id, recognized.confidence[id] ?? .5])) };
      setAnswers(nextAnswers); setReadConfidence(nextConf);
      const result = selfCheckWorksheet(sheet, nextAnswers, nextConf);
      setCheck(result); setChecks(n => n + 1);
      const placed = recognized.registration && recognized.registration.matched < 2 && sheet.fields.length >= 2
        ? ' The photo didn\'t line up well — retake it flat and straight, or type your answers.' : '';
      setScanMessage(Object.keys(read).length
        ? `Filled in ${Object.keys(read).length} of ${sheet.fields.length} from your paper. ${result.summary}${placed}`
        : (recognized.message || 'Couldn\'t read answers off that photo.') + placed);
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
    <button onClick={() => setTab(id)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 15px', borderRadius: 10, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === id ? T.orange : T.border}`, background: tab === id ? T.orange : 'transparent', color: tab === id ? '#1a1a1a' : T.muted }}>
      <Icon size={14} /> {label}
    </button>
  );

  const counts = check?.counts;
  const openTurnIn = () => { runCheck(); setConfirmOpen(true); };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: isPhone ? '14px 12px calc(110px + env(safe-area-inset-bottom))' : '20px 16px 70px', fontFamily: T.font }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GraduationCap size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isPhone ? 19 : 21, fontWeight: 900, lineHeight: 1.15 }}>{sheet.title}</h1>
            <p style={{ margin: '3px 0 0', color: T.muted, fontSize: 13 }}>{sheet.subject}{sheet.objective ? ` · ${sheet.objective}` : ''} · homework</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: T.muted, fontSize: 13 }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading assignment…
          </div>
        ) : (<>
        <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
          {tabBtn('worksheet', 'Worksheet', ClipboardCheck)}
          {tabBtn('practice', 'Practice', Flame)}
        </div>

        {tab === 'worksheet' && (
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: isPhone ? 10 : 16 }}>
              <WorksheetFillable sheet={sheet} answers={answers} setAnswers={updateAnswers} accent={T.orange} results={graded?.results} readOnly={!!graded} mode="rebuilt" flags={graded ? undefined : check?.perField} />
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 4 }}><span>Progress (your teacher + family see this)</span><span>{fillPct}%</span></div>
                <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  <div style={{ width: `${graded ? 100 : fillPct}%`, height: '100%', background: graded ? T.green : T.orange }} />
                </div>
              </div>
              {graded ? (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'rgba(95,209,127,0.1)', border: `1px solid ${T.green}` }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: T.green, display: 'flex', alignItems: 'center', gap: 7 }}><Trophy size={16} /> Turned in · {graded.percent}%</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>Auto-graded and saved to your Learner Ledger{graded.recorded ? ` · ${graded.recorded} standard${graded.recorded > 1 ? 's' : ''} credited` : ''}.{graded.needsReview ? ' Your teacher will review the written answers.' : ''} Your teacher was notified.</div>
                  {turnAudit && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5 }}>Turned in {new Date(turnAudit.turnedInAt).toLocaleString()} · {Math.max(1, Math.round(turnAudit.durationMs / 60000))} min in assignment{checks ? ` · checked ${checks}×` : ''}</div>}
                  {!qualitySent ? <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}><div style={{ fontSize: 12.5, fontWeight: 800 }}>How well did this assignment work?</div><div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[1, 2, 3, 4, 5].map(rating => <button key={rating} onClick={() => setQualityRating(rating)} aria-label={`${rating} of 5`} style={{ width: 44, height: 44, borderRadius: 10, cursor: 'pointer', border: `1px solid ${qualityRating === rating ? T.violet : T.border}`, color: qualityRating === rating ? '#fff' : T.muted, background: qualityRating === rating ? T.violet : 'transparent', fontWeight: 850, fontSize: 15 }}>{rating}</button>)}</div><textarea value={qualityComment} onChange={event => setQualityComment(event.target.value)} placeholder="What worked or broke? (optional)" style={{ width: '100%', minHeight: 60, resize: 'vertical', marginTop: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, padding: 10, font: 'inherit', fontSize: 16 }} /><button disabled={!qualityRating} onClick={() => { void submitAssignmentQualityFeedback({ ...qualityContext, rating: qualityRating, comment: qualityComment, category: 'USABILITY' }).then(() => setQualitySent(true)); }} style={{ marginTop: 8, minHeight: 44, padding: '0 14px', borderRadius: 10, border: 0, background: T.violet, color: '#fff', fontWeight: 800, opacity: qualityRating ? 1 : .45 }}>Send feedback</button></div> : <div style={{ fontSize: 12, color: T.green, marginTop: 10 }}>Feedback attached to this assignment. Thank you.</div>}
                </div>
              ) : (
                <>
                  <input ref={scanInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { void importCompletedPaper(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                  {check && <CheckSummary check={check} onJump={id => document.getElementById(`ws-field-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} sheet={sheet} />}
                  {scanMessage && <div aria-live="polite" style={{ marginTop: 10, color: T.muted, fontSize: 13, lineHeight: 1.45 }}>{scanMessage}</div>}
                  {!isPhone && <ActionRow scanBusy={scanBusy} busy={busy} onScan={() => { warmOcr(); scanInputRef.current?.click(); }} onCheck={runCheck} onTurnIn={openTurnIn} ready={!!check?.ready} />}
                </>
              )}
            </div>
            <div>
              <WorksheetTutorPanel sheet={sheet} accent={T.orange} activeFieldId={sheet.fields.find(f => ['try-again', 'blank'].includes(check?.perField[f.id]?.status || ''))?.id || sheet.fields[0]?.id} />
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
                <button onClick={startPractice} style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#FF8C00,#8166e6)', color: '#fff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Flame size={16} /> Start</button>
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
                {user?.uid && <div style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>Points added · saved to your ledger</div>}
                <button onClick={startPractice} style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 20px', borderRadius: 12, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><RefreshCw size={14} /> Play again</button>
              </div>
            )}
          </div>
        )}
        </>)}
      </div>

      {/* Phone: the actions live in a thumb-reach bar above the home indicator. */}
      {isPhone && tab === 'worksheet' && !graded && !loading && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', background: 'rgba(10,10,15,.94)', backdropFilter: 'blur(10px)', borderTop: `1px solid ${T.border}` }}>
          <ActionRow compact scanBusy={scanBusy} busy={busy} onScan={() => { warmOcr(); scanInputRef.current?.click(); }} onCheck={runCheck} onTurnIn={openTurnIn} ready={!!check?.ready} />
        </div>
      )}

      {/* Review & approve before anything is sent. */}
      {confirmOpen && check && (
        <div role="dialog" aria-modal="true" aria-label="Turn in?" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: isPhone ? 'flex-end' : 'center', justifyContent: 'center' }} onClick={() => setConfirmOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: isPhone ? '100%' : 420, maxHeight: '90dvh', overflow: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: isPhone ? '18px 18px 0 0' : 16, padding: `18px 18px calc(18px + env(safe-area-inset-bottom))` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 900, flex: 1 }}>{check.ready ? 'Ready to turn in?' : 'Turn in anyway?'}</div>
              <button onClick={() => setConfirmOpen(false)} aria-label="Close" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, display: 'grid', placeItems: 'center' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{check.summary}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 12 }}>
              <Stat n={(counts?.['looks-good'] || 0) + (counts?.['teacher-reviews'] || 0)} label="answered" color={T.green} />
              <Stat n={counts?.['try-again'] || 0} label="to try again" color={T.red} />
              <Stat n={counts?.blank || 0} label="blank" color={T.gold} />
              <Stat n={counts?.['check-read'] || 0} label="reads to confirm" color={T.blue} />
            </div>
            {completedScan && <div style={{ fontSize: 12, color: T.faint, marginTop: 10 }}>Your paper photo is attached so your teacher can see your work.</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexDirection: isPhone ? 'column-reverse' : 'row' }}>
              <button onClick={() => setConfirmOpen(false)} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontWeight: 800, fontSize: 14 }}>Keep working</button>
              <button onClick={doTurnIn} disabled={busy} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: 0, background: T.orange, color: '#1a1a1a', fontWeight: 900, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>{busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />} Yes, turn it in</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ n: number; label: string; color: string }> = ({ n, label, color }) => (
  <div style={{ padding: '10px 12px', borderRadius: 12, background: '#15151f', border: `1px solid ${n ? color + '55' : '#20202c'}` }}>
    <div style={{ fontSize: 20, fontWeight: 900, color: n ? color : '#808090' }}>{n}</div>
    <div style={{ fontSize: 12, color: '#9a9aa6' }}>{label}</div>
  </div>
);

const ActionRow: React.FC<{ compact?: boolean; scanBusy: boolean; busy: boolean; ready: boolean; onScan: () => void; onCheck: () => void; onTurnIn: () => void }> = ({ compact, scanBusy, busy, ready, onScan, onCheck, onTurnIn }) => {
  const base: React.CSSProperties = { minHeight: 48, borderRadius: 12, fontSize: 13.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', padding: '0 12px' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr 1.3fr' : '1fr 1fr', gap: 8, marginTop: compact ? 0 : 14 }}>
      <button onClick={onScan} disabled={scanBusy} style={{ ...base, border: `1px solid ${T.violet}`, background: 'rgba(129,102,230,.12)', color: '#d8cffc' }}>
        {scanBusy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={16} />} {compact ? 'Scan' : scanBusy ? 'Reading paper…' : 'Scan my paper'}
      </button>
      <button onClick={onCheck} style={{ ...base, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink }}>
        <ListChecks size={16} /> {compact ? 'Check' : 'Check my work'}
      </button>
      <button onClick={onTurnIn} disabled={busy} style={{ ...base, gridColumn: compact ? undefined : '1 / -1', border: 'none', background: ready ? T.green : T.orange, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {busy ? 'Grading…' : <><Send size={16} /> Turn in</>}
      </button>
    </div>
  );
};

const CheckSummary: React.FC<{ check: SelfCheckResult; sheet: DigitalWorksheet; onJump: (fieldId: string) => void }> = ({ check, sheet, onJump }) => {
  const todo = sheet.fields.map((f, i) => ({ f, i, c: check.perField[f.id] })).filter(x => x.c && ['try-again', 'blank', 'check-read'].includes(x.c.status));
  const color = (s: string) => (s === 'try-again' ? T.red : s === 'blank' ? T.gold : T.blue);
  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: check.ready ? 'rgba(95,209,127,.08)' : 'rgba(255,107,107,.06)', border: `1px solid ${check.ready ? T.green + '66' : T.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 850, color: check.ready ? T.green : T.ink }}>{check.summary}</div>
      {todo.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {todo.map(({ f, i, c }) => (
            <button key={f.id} onClick={() => onJump(f.id)} style={{ minHeight: 36, padding: '0 11px', borderRadius: 999, border: `1px solid ${color(c!.status)}`, background: 'transparent', color: color(c!.status), fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>
              #{f.ordinal?.replace(/[.)]/g, '') || i + 1} · {c!.status === 'try-again' ? 'try again' : c!.status === 'blank' ? 'blank' : 'confirm'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentAssignmentView;
