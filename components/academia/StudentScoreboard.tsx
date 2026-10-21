import React, { useEffect, useState } from 'react';
import { loadStudentScoreboard, letterFor, scoreTone, type StudentScoreboard as Board, type WorkStatus } from '../../services/academiaDossier';
import { lessonLink } from '../../services/assignmentTemplateService';

/**
 * The student's metric board and assignment ledger: current grade, turned in, missing, and every
 * piece of work with its status and score. Attendance is shown honestly as not connected until the
 * school links its SIS.
 */
interface Props { uid?: string; onNavigate: (view: string) => void }

const STATUS: Record<WorkStatus, { label: string; color: string }> = {
  due: { label: 'Due', color: '#7BEAF7' }, missing: { label: 'Missing', color: '#ff8aa3' }, 'to-grade': { label: 'Handed in', color: '#c4b5fd' },
  'on-time': { label: 'Graded', color: '#06D6A0' }, late: { label: 'Late', color: '#F5B83D' },
};
type Filter = 'All' | 'Due' | 'Missing' | 'Graded';
const fmt = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No due date');

const StudentScoreboard: React.FC<Props> = ({ uid, onNavigate }) => {
  const [b, setB] = useState<Board | null>(null);
  const [f, setF] = useState<Filter>('All');
  useEffect(() => { let alive = true; if (uid) loadStudentScoreboard(uid).then(x => alive && setB(x)).catch(() => alive && setB({ gradePct: null, turnedIn: 0, missing: 0, graded: 0, rows: [] })); return () => { alive = false; }; }, [uid]);

  const tiles = [
    { label: 'Current grade', value: b?.gradePct == null ? '—' : letterFor(b.gradePct), sub: b?.gradePct == null ? 'nothing graded yet' : `${b.gradePct}% overall`, color: scoreTone(b?.gradePct ?? null) },
    { label: 'Turned in', value: b ? String(b.turnedIn) : '…', sub: b ? `${b.graded} graded` : '', color: '#00DAF3' },
    { label: 'Missing', value: b ? String(b.missing) : '…', sub: b?.missing ? 'you can still hand it in' : 'all caught up', color: b?.missing ? '#ff8aa3' : '#06D6A0' },
    { label: 'Attendance', value: '—', sub: 'not connected yet', color: '#60A5FA' },
  ];
  const rows = (b?.rows || []).filter(r => f === 'All' || (f === 'Due' && r.status === 'due') || (f === 'Missing' && (r.status === 'missing' || r.status === 'late')) || (f === 'Graded' && (r.status === 'on-time' || r.status === 'late')));
  const openRow = (id: string, status: WorkStatus) => {
    if (status === 'due' || status === 'missing') { try { window.history.pushState({}, '', lessonLink(id)); } catch { /* non-fatal */ } onNavigate('STUDENT_LESSON'); }
    else onNavigate('LEARNER_LEDGER');
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="eyebrow" style={{ marginBottom: 10 }}>My scoreboard</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}>
          {tiles.map(t => (
            <div key={t.label} className="rounded-[18px] p-4 border" style={{ background: `${t.color}14`, borderColor: `${t.color}47` }}>
              <p className="text-[12px] font-semibold text-white/70">{t.label}</p>
              <p className="text-[34px] font-black leading-tight" style={{ color: t.color, fontFamily: 'Outfit, system-ui' }}>{t.value}</p>
              <p className="text-[12px] text-white/60">{t.sub}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-hd" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2">Assignment ledger</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter assignments">
            {(['All', 'Due', 'Missing', 'Graded'] as Filter[]).map(x => (
              <button key={x} type="button" aria-pressed={x === f} onClick={() => setF(x)}
                className={`min-h-[36px] px-3.5 rounded-full text-[13px] font-bold border ${x === f ? 'bg-[#00DAF3] text-[#09070e] border-[#00DAF3]' : 'border-white/20'}`}>{x}</button>
            ))}
          </div>
        </div>
        {!b && <div className="empty">Loading your work…</div>}
        {b && rows.length === 0 && <div className="empty">{f === 'All' ? 'No assignments yet. When your teacher assigns work, it shows up here.' : 'Nothing here right now.'}</div>}
        <div className="list">
          {rows.slice(0, 10).map(r => (
            <button key={r.id} type="button" className="item" style={{ gridTemplateColumns: '10px 1fr auto auto' }} onClick={() => openRow(r.id, r.status)}>
              <span style={{ width: 8, height: 36, borderRadius: 4, background: STATUS[r.status].color }} />
              <span><b>{r.title}</b><small>{[r.className, r.status === 'due' || r.status === 'missing' ? fmt(r.due) : null].filter(Boolean).join(' · ')}</small></span>
              <span className="tag" style={{ color: STATUS[r.status].color, background: `${STATUS[r.status].color}1f` }}>{STATUS[r.status].label}</span>
              <span style={{ fontFamily: 'var(--fm)', fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{r.score == null ? '—' : `${r.score}%`}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentScoreboard;
