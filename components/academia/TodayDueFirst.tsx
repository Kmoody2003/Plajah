// TodayDueFirst — the fixed slot at the top of the Academia portal.
//
// The problem it solves: an assignment due tomorrow used to live two taps inside a tile that
// looked exactly like the eight tiles around it. The most time-critical thing on the platform
// was the least visible thing on the screen.
//
// So this slot is FIXED — it is always the first thing under the greeting, for every role, and
// its content is whatever that role owes:
//   student → work still to hand in
//   teacher → other people's work waiting on them
//   parent  → nothing owed; a parent is never given a deadline they can't act on
//
// When there is nothing due it does NOT collapse. An empty slot teaches people to skip the
// space, and then the one day something IS there they skip it too. It becomes the curiosity
// card instead — the same footprint, a different job.

import React, { useEffect, useState } from 'react';
import { Clock, ArrowRight, Check, ClipboardCheck, Sparkles, Loader2 } from 'lucide-react';
import {
  fetchStudentDueWork, fetchTeacherReviewQueue, lessonLink,
  type DueItem, type ReviewItem,
} from '../../services/assignmentTemplateService';
import { T } from './integrityTheme';

type Role = 'teacher' | 'parent' | 'student';

/** Rotates daily and is stable for the whole day — a prompt that changed on every render
 *  would feel like noise rather than "today's". */
const CURIOSITIES: string[] = [
  'A hummingbird’s heart beats 1,260 times a minute. What would that do to a person?',
  'How did anyone measure the Earth before anyone left it?',
  'Why does a guitar string sound different from a piano playing the same note?',
  'Every map of the world is wrong. Why can’t any of them be right?',
  'Ice floats. Almost nothing else floats on itself — why does water break the rule?',
  'Your voice sounds different on a recording. Which one is the real one?',
  'Why do we have 60 seconds in a minute but 100 centimetres in a metre?',
];
function curiosityOfTheDay(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return CURIOSITIES[day % CURIOSITIES.length];
}

const relativeDue = (due: number | null): { label: string; urgent: boolean } => {
  if (!due) return { label: 'No date set', urgent: false };
  const days = Math.round((due - Date.now()) / 86_400_000);
  if (days < 0) return { label: days === -1 ? 'Due yesterday' : `${Math.abs(days)} days late`, urgent: true };
  if (days === 0) return { label: 'Due today', urgent: true };
  if (days === 1) return { label: 'Due tomorrow', urgent: true };
  if (days <= 6) return { label: `Due ${new Date(due).toLocaleDateString([], { weekday: 'long' })}`, urgent: false };
  return { label: `Due ${new Date(due).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, urgent: false };
};

const Shell: React.FC<{ accent: string; children: React.ReactNode; onClick?: () => void }> = ({ accent, children, onClick }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    style={{
      borderRadius: 18,
      border: `1px solid ${accent}55`,
      background: `linear-gradient(150deg, ${accent}18, rgba(255,255,255,0.02))`,
      padding: '16px 17px',
      cursor: onClick ? 'pointer' : 'default',
      fontFamily: T.font,
    }}
  >{children}</div>
);

const Eyebrow: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color }}>{children}</span>
);

const TodayDueFirst: React.FC<{
  uid?: string;
  role: Role;
  onOpenAssignment: (assignmentId: string) => void;
  onNavigate: (view: string) => void;
}> = ({ uid, role, onOpenAssignment, onNavigate }) => {
  const [due, setDue] = useState<DueItem[] | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid) { if (alive) { setDue([]); setReview([]); } return; }
      if (role === 'teacher') {
        const q = await fetchTeacherReviewQueue(uid);
        if (alive) { setReview(q); setDue([]); }
      } else if (role === 'student') {
        const d = await fetchStudentDueWork(uid);
        if (alive) { setDue(d); setReview([]); }
      } else {
        if (alive) { setDue([]); setReview([]); }
      }
    })();
    return () => { alive = false; };
  }, [uid, role]);

  const loading = due === null && review === null;

  if (loading) {
    return (
      <Shell accent={T.border}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.muted }}>
          <Loader2 size={14} className="animate-spin" /> Checking what’s due…
        </span>
      </Shell>
    );
  }

  // ── Teacher: other people's work waiting on them ──────────────────────────
  if (role === 'teacher' && review && review.length > 0) {
    const oldest = review[0];
    const waitingDays = Math.round((Date.now() - oldest.submittedAt) / 86_400_000);
    return (
      <Shell accent={T.orange} onClick={() => onNavigate('TEACHER_TOOLS')}>
        <Eyebrow color={T.orange}>Waiting on you</Eyebrow>
        <p style={{ margin: '8px 0 0', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {review.length} to grade
        </p>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: T.muted }}>
          {oldest.studentName} has been waiting {waitingDays < 1 ? 'since today' : `${waitingDays} day${waitingDays === 1 ? '' : 's'}`}.
        </p>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.orange,
        }}>
          <ClipboardCheck size={13} /> Start grading <ArrowRight size={12} />
        </span>
      </Shell>
    );
  }

  // ── Student: the next thing owed ──────────────────────────────────────────
  if (role === 'student' && due && due.length > 0) {
    const next = due[0];
    const rest = due.slice(1, 4);
    const { label, urgent } = relativeDue(next.dueDate);
    const accent = next.overdue ? T.danger : urgent ? T.orange : T.cyan;

    return (
      <div>
        <Shell accent={accent} onClick={() => onOpenAssignment(next.assignmentId)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Eyebrow color={accent}>{label}</Eyebrow>
            <span style={{ fontSize: 10.5, color: T.faint }}>{next.className}</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>{next.title}</p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent,
          }}>
            <Clock size={13} /> Open it <ArrowRight size={12} />
          </span>
        </Shell>

        {rest.length > 0 && (
          <div style={{ marginTop: 8, display: 'grid', gap: 1 }}>
            {rest.map(item => {
              const r = relativeDue(item.dueDate);
              return (
                <button
                  key={item.assignmentId}
                  onClick={() => onOpenAssignment(item.assignmentId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                    padding: '9px 4px', background: 'transparent', border: 0,
                    borderBottom: `1px solid ${T.border}`, color: T.ink, cursor: 'pointer', fontFamily: T.font,
                  }}
                >
                  <span style={{
                    flex: 'none', width: 46, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
                    textTransform: 'uppercase', color: r.urgent ? T.orange : T.faint,
                  }}>{r.label.replace('Due ', '').slice(0, 6)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>{item.title}</span>
                  <ArrowRight size={13} color={T.faint} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Nothing owed: the slot keeps its footprint and changes job ────────────
  const allDone = role === 'student' || role === 'teacher';
  return (
    <Shell accent={T.cyan} onClick={() => onNavigate('PLAJAH_LABS')}>
      {allDone && (
        <p style={{ margin: '0 0 9px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.success }}>
          <Check size={13} /> {role === 'teacher' ? 'Nothing waiting on you.' : 'Nothing due. You’re clear.'}
        </p>
      )}
      <Eyebrow color={T.cyan}>Today’s curiosity</Eyebrow>
      <p style={{
        margin: '7px 0 0', fontSize: 16, lineHeight: 1.35,
        fontFamily: 'Georgia, "Iowan Old Style", serif', fontStyle: 'italic',
      }}>{curiosityOfTheDay()}</p>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.cyan,
      }}>
        <Sparkles size={13} /> Go and find out <ArrowRight size={12} />
      </span>
    </Shell>
  );
};

export default TodayDueFirst;
export { curiosityOfTheDay, relativeDue };
