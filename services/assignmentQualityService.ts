import { addDoc, collection, doc, increment, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export type AssignmentQualityEventKind = 'CRASH' | 'RENDER_FAILURE' | 'SCAN_FAILURE' | 'FORMAT_FAILURE' | 'SUBMISSION_FAILURE' | 'USER_REPORT';
export type AssignmentQualitySeverity = 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';

export interface AssignmentQualityContext {
  worksheetId: string;
  assignmentId?: string | null;
  title?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'AUTHOR';
  simulate?: boolean;
}

export interface AssignmentQualityEventInput extends AssignmentQualityContext {
  kind: AssignmentQualityEventKind;
  severity: AssignmentQualitySeverity;
  message: string;
  source?: string;
  stack?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface AssignmentQualityFeedbackInput extends AssignmentQualityContext {
  rating: number;
  comment?: string;
  category?: 'ACCURACY' | 'LAYOUT' | 'USABILITY' | 'ACCESSIBILITY' | 'OTHER';
}

const clean = (value: unknown, max = 700) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const qualityKey = (context: AssignmentQualityContext) => context.assignmentId || context.worksheetId;
const LOCAL_KEY = 'plajah.assignment-quality.v1';

function recordLocal(kind: 'event' | 'feedback', value: Record<string, unknown>) {
  if (typeof localStorage === 'undefined') return;
  try {
    const previous = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    const rows = Array.isArray(previous) ? previous : [];
    localStorage.setItem(LOCAL_KEY, JSON.stringify([{ kind, ...value }, ...rows].slice(0, 100)));
  } catch { /* storage can be unavailable in privacy mode */ }
}

/** Store a failure independently from the assignment payload so a broken document remains inspectable. */
export async function recordAssignmentQualityEvent(input: AssignmentQualityEventInput): Promise<boolean> {
  const at = Date.now();
  const event = {
    worksheetId: input.worksheetId, assignmentId: input.assignmentId || null, title: clean(input.title, 180) || null,
    actorId: auth.currentUser?.uid || input.actorId || null, actorName: clean(input.actorName, 120) || null, actorRole: input.actorRole || null,
    kind: input.kind, severity: input.severity, message: clean(input.message), source: clean(input.source, 160) || null,
    stack: clean(input.stack, 2000) || null, metadata: input.metadata || {}, occurredAt: at, resolved: false,
  };
  if (input.simulate) { recordLocal('event', event); return true; }
  try {
    await addDoc(collection(db, 'assignment_quality_events'), event);
    const summary = {
      worksheetId: input.worksheetId, assignmentId: input.assignmentId || null, title: event.title,
      totalEvents: increment(1), failureEvents: increment(input.severity === 'ERROR' || input.severity === 'FATAL' ? 1 : 0),
      lastEventAt: at, lastEventKind: input.kind, lastEventSeverity: input.severity, updatedAt: at,
    };
    // Only the worksheet owner may mutate aggregates. Student/parent events remain safely stored;
    // a trusted aggregator can roll them up later without granting clients cross-role write access.
    if (input.actorRole === 'TEACHER' || input.actorRole === 'AUTHOR') {
      await setDoc(doc(db, 'assignment_quality', qualityKey(input)), summary, { merge: true });
      if (input.assignmentId) await setDoc(doc(db, 'worksheet_assignments', input.assignmentId), { qualitySummary: summary }, { merge: true });
    }
    return true;
  } catch (error) {
    console.warn('[assignment quality] event could not be persisted', error);
    recordLocal('event', event);
    return false;
  }
}

/** Teacher/student/parent feedback is retained per assignment and contributes to its quality summary. */
export async function submitAssignmentQualityFeedback(input: AssignmentQualityFeedbackInput): Promise<boolean> {
  const at = Date.now();
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const feedback = {
    worksheetId: input.worksheetId, assignmentId: input.assignmentId || null, title: clean(input.title, 180) || null,
    actorId: auth.currentUser?.uid || input.actorId || null, actorName: clean(input.actorName, 120) || null, actorRole: input.actorRole || null,
    rating, comment: clean(input.comment, 1200) || null, category: input.category || 'USABILITY', createdAt: at,
  };
  if (input.simulate) { recordLocal('feedback', feedback); return true; }
  try {
    await addDoc(collection(db, 'assignment_quality_feedback'), feedback);
    const summary = {
      worksheetId: input.worksheetId, assignmentId: input.assignmentId || null, title: feedback.title,
      totalFeedback: increment(1), ratingTotal: increment(rating), lastFeedbackAt: at, updatedAt: at,
    };
    if (input.actorRole === 'TEACHER' || input.actorRole === 'AUTHOR') {
      await setDoc(doc(db, 'assignment_quality', qualityKey(input)), summary, { merge: true });
      if (input.assignmentId) await setDoc(doc(db, 'worksheet_assignments', input.assignmentId), { qualitySummary: summary }, { merge: true });
    }
    return true;
  } catch (error) {
    console.warn('[assignment quality] feedback could not be persisted', error);
    recordLocal('feedback', feedback);
    return false;
  }
}

/** Capture runtime failures only while an assignment is open; cleanup removes both listeners. */
export function installAssignmentQualityTelemetry(context: AssignmentQualityContext): () => void {
  if (typeof window === 'undefined') return () => {};
  const seen = new Set<string>();
  const once = (input: Omit<AssignmentQualityEventInput, keyof AssignmentQualityContext>) => {
    const key = `${input.kind}|${input.source}|${input.message}`.slice(0, 500);
    if (seen.has(key)) return;
    seen.add(key);
    void recordAssignmentQualityEvent({ ...context, ...input });
  };
  const onError = (event: ErrorEvent) => once({ kind: 'CRASH', severity: 'FATAL', message: event.message || 'Assignment runtime error', source: event.filename || 'window.error', stack: event.error?.stack });
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    once({ kind: 'CRASH', severity: 'ERROR', message: reason instanceof Error ? reason.message : clean(reason) || 'Unhandled assignment promise rejection', source: 'window.unhandledrejection', stack: reason instanceof Error ? reason.stack : undefined });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}
