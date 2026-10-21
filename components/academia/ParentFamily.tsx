import React, { useEffect, useState } from 'react';
import type { ChildWork } from '../../services/assignmentTemplateService';
import type { LearnerStats } from '../../services/academiaStats';
import { letterFor, scoreTone } from '../../services/academiaDossier';
import { loadStudentAttendance, summarizeAttendance, type AttendanceSummary } from '../../services/attendanceService';
import { auth } from '../../services/firebase';
import AttendanceStrip from './AttendanceStrip';
import { ageBandFor } from '../../data/ageScaling';
import { bandForAge } from '../../data/academiaShowcase';
import { DidYouKnow, ExhibitsRow, StudiosRow, LoreaShelf, CurriculumShowcase, AcademiaResponsiveStyles } from './AcademiaShowcase';

/**
 * The parent's "how is my kid doing?" snapshot, and the rich sections further down the Family view
 * (wonders to talk about, Lorea, studios, exhibitions, the curriculum stack). Reads only what the
 * Parent hub already loaded through the guardian rules.
 */
type Nav = (view: string) => void;

export const ChildSnapshot: React.FC<{ child: any; work: ChildWork | null; stats: LearnerStats | null; onNavigate: Nav }> = ({ child, work, stats, onNavigate }) => {
  const first = (child?.displayName || 'Your child').split(' ')[0];
  const [att, setAtt] = useState<AttendanceSummary | null>(null);
  useEffect(() => {
    const me = auth.currentUser?.uid; let alive = true; setAtt(null);
    if (me && child?.uid) loadStudentAttendance(child.uid, { role: 'guardian', uid: me }).then(r => alive && setAtt(summarizeAttendance(r)));
    else setAtt(summarizeAttendance([]));
    return () => { alive = false; };
  }, [child?.uid]);
  const graded = (work?.submissions || []).filter(s => s.grade).sort((a, b) => a.grade!.gradedAt - b.grade!.gradedAt);
  const pct = graded.length ? Math.round(graded.reduce((a, s) => a + s.grade!.masteryPercent, 0) / graded.length) : null;
  const missing = (work?.assigned || []).filter(a => a.overdue).length;
  const waiting = (work?.submissions || []).filter(s => !s.grade).length;
  const tone = scoreTone(pct);
  const headline = !work ? `Checking in on ${first}…`
    : missing >= 2 ? `${first} has ${missing} assignments to catch up on`
    : pct != null && pct >= 85 ? `${first} is doing great this term`
    : pct != null ? `${first} is keeping up`
    : `${first}’s first grades will show up here`;
  const summary = [
    stats?.voca.started ? `Reading with Voca: ${stats.voca.headline}.` : null,
    missing ? `${missing} past due.` : work ? 'Nothing past due.' : null,
    waiting ? `${waiting} handed in and waiting for a grade.` : null,
    stats && stats.streakDays > 1 ? `${stats.streakDays}-day practice streak.` : null,
  ].filter(Boolean).join(' ');
  const tiles = [
    { label: 'Current grade', value: pct == null ? '—' : letterFor(pct), sub: pct == null ? 'nothing graded yet' : `${pct}% across graded work`, color: tone },
    { label: 'Handed in', value: String(work?.submissions.length ?? '…'), sub: `${waiting} awaiting a grade`, color: '#00DAF3' },
    { label: 'Missing', value: work ? String(missing) : '…', sub: missing ? 'past due' : 'all caught up', color: missing ? '#ff8aa3' : '#06D6A0' },
    { label: 'Still to do', value: work ? String((work.assigned.length || 0) - missing) : '…', sub: 'coming up', color: '#F5B83D' },
    { label: 'Attendance', value: att?.rate == null ? '—' : `${att.rate}%`, sub: att?.days ? `${att.counts.absent} absent · ${att.counts.tardy} tardy` : 'not taken yet', color: '#60A5FA' },
  ];
  const last = graded.slice(-8);
  return (
    <section className="mb-9 rounded-[28px] overflow-hidden border border-white/10 bg-[#120f18]" aria-labelledby="snap-h">
      <div className="p-4 sm:p-8" style={{ background: `radial-gradient(110% 140% at 100% 0%, ${tone}33 0%, transparent 60%)` }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-white/65">This week</p>
            <h2 id="snap-h" className="text-[24px] sm:text-[30px] font-black leading-tight mt-1" style={{ fontFamily: 'Outfit, system-ui' }}>{headline}</h2>
            {summary && <p className="text-[15px] text-white/75 mt-1.5 max-w-2xl leading-relaxed">{summary}</p>}
          </div>
          <button type="button" onClick={() => onNavigate('LEARNER_LEDGER')} className="min-h-[44px] px-4 rounded-2xl font-black text-sm text-[#0a0a0f]" style={{ background: tone }}>See {first}’s record</button>
        </div>
        <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 118px), 1fr))' }}>
          {tiles.map(t => (
            <div key={t.label} className="rounded-[18px] p-4 border" style={{ background: `${t.color}14`, borderColor: `${t.color}47` }}>
              <p className="text-[12px] font-semibold text-white/70">{t.label}</p>
              <p className="text-[32px] font-black leading-tight" style={{ color: t.color, fontFamily: 'Outfit, system-ui' }}>{t.value}</p>
              <p className="text-[12px] text-white/60">{t.sub}</p>
            </div>
          ))}
        </div>
        {last.length >= 2 && (
          <div className="mt-5 rounded-[20px] bg-white/[0.03] border border-white/[0.08] p-4">
            <p className="text-[15px] font-bold mb-3">Recent grades</p>
            <div className="flex items-end gap-3 h-[150px]" role="img" aria-label={`Last ${last.length} grades: ${last.map(s => `${s.grade!.masteryPercent}%`).join(', ')}`}>
              {last.map(s => (
                <div key={s.id} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 min-w-0">
                  <span className="font-mono text-[11px] text-white/65">{s.grade!.masteryPercent}</span>
                  <div className="w-full max-w-[56px] rounded-[10px]" style={{ height: `${Math.round(Math.max(8, s.grade!.masteryPercent) * 1.05)}px`, background: scoreTone(s.grade!.masteryPercent), animation: 'pfGrow .9s cubic-bezier(.2,.8,.2,1) both', transformOrigin: 'bottom' }} />
                  <span className="text-[11px] text-white/60 truncate max-w-full">{s.title}</span>
                </div>
              ))}
            </div>
            <style>{'@keyframes pfGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}'}</style>
          </div>
        )}
        {!!att?.days && (
          <div className="mt-4 rounded-[20px] bg-white/[0.03] border border-white/[0.08] p-4">
            <p className="text-[15px] font-bold mb-3">Attendance</p>
            <AttendanceStrip summary={att} />
          </div>
        )}
      </div>
    </section>
  );
};

export const ParentFamilySections: React.FC<{ child?: any; onNavigate: Nav }> = ({ child, onNavigate }) => {
  const first = child?.displayName ? String(child.displayName).split(' ')[0] : undefined;
  return (
    <div className="mt-4">
      <AcademiaResponsiveStyles />
      <DidYouKnow role="parent" onNavigate={onNavigate} />
      <LoreaShelf role="parent" onNavigate={onNavigate} childName={first} initialBand={bandForAge(child ? ageBandFor(child) : 'middle')} />
      <StudiosRow role="parent" onNavigate={onNavigate} />
      <ExhibitsRow role="parent" onNavigate={onNavigate} />
      <CurriculumShowcase role="parent" onNavigate={onNavigate} />
    </div>
  );
};
