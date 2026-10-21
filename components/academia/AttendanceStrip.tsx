import React from 'react';
import { ATTENDANCE_META, ATTENDANCE_STATUSES, type AttendanceSummary } from '../../services/attendanceService';

/**
 * Attendance at a glance: the rate, counts per status, and the last school days as a
 * color-coded grid (blue present, gold tardy, rose absent, violet excused). Used by the Student
 * Dossier, the student's scoreboard and the parent snapshot.
 */
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const AttendanceStrip: React.FC<{ summary: AttendanceSummary | null; empty?: string }> = ({ summary, empty = 'No attendance taken yet.' }) => {
  if (!summary) return <p className="text-[13px] text-white/55">Loading attendance…</p>;
  if (!summary.days) return <p className="text-[13px] text-white/55">{empty}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <span className="text-[30px] font-black leading-none text-[#60A5FA]" style={{ fontFamily: 'Outfit, system-ui' }}>{summary.rate}%</span>
        <span className="text-[12px] text-white/60">in class across {summary.days} school day{summary.days === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }} role="img"
        aria-label={`Last ${summary.recent.length} school days: ${ATTENDANCE_STATUSES.map(s => `${summary.recent.filter(r => r.status === s).length} ${ATTENDANCE_META[s].label.toLowerCase()}`).join(', ')}`}>
        {summary.recent.map(r => <span key={r.date} title={`${fmt(r.date)}: ${ATTENDANCE_META[r.status].label}`} className="aspect-square rounded-md" style={{ background: ATTENDANCE_META[r.status].color }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 text-[12px] text-white/70">
        {ATTENDANCE_STATUSES.map(s => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: ATTENDANCE_META[s].color }} />{ATTENDANCE_META[s].label} <b className="text-white">{summary.counts[s]}</b></span>
        ))}
      </div>
    </div>
  );
};

export default AttendanceStrip;
