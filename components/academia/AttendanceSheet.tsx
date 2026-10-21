import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckCheck, CalendarDays } from 'lucide-react';
import { loadClassDay, saveClassDay, dayKey, ATTENDANCE_META, ATTENDANCE_STATUSES, type AttendanceStatus } from '../../services/attendanceService';
import type { RosterStudent } from '../../services/academiaDossier';

/**
 * Take attendance for one class on one day. Everyone starts as Present (teachers mark the
 * exceptions), a day already taken loads its saved marks, and saving writes one row per student
 * that the student and their guardians can see. Full-screen on phones, a centered sheet above that.
 */
interface Props {
  teacherUid: string;
  classes: Array<{ id: string; title?: string; name?: string; enrolledStudents?: string[] }>;
  roster: RosterStudent[];
  initialClassId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

const initials = (n: string) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const AttendanceSheet: React.FC<Props> = ({ teacherUid, classes, roster, initialClassId, onClose, onSaved }) => {
  const [classId, setClassId] = useState(initialClassId || classes[0]?.id || '');
  const [date, setDate] = useState(dayKey());
  const [marks, setMarks] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cls = classes.find(c => c.id === classId);
  const students = useMemo(() => roster.filter(s => s.classIds.includes(classId)), [roster, classId]);

  useEffect(() => {
    if (!classId) return;
    let alive = true; setLoading(true); setMsg(null);
    loadClassDay(teacherUid, classId, date).then(existing => {
      if (!alive) return;
      setSavedIds(new Set(Object.keys(existing)));
      setMarks(Object.fromEntries(students.map(s => [s.uid, { status: existing[s.uid]?.status || 'present', note: existing[s.uid]?.note || '' }])));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [teacherUid, classId, date, students]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (uid: string, status: AttendanceStatus) => setMarks(m => ({ ...m, [uid]: { ...(m[uid] || { note: '' }), status } }));
  const counts = ATTENDANCE_STATUSES.map(s => ({ s, n: Object.values(marks).filter(m => m.status === s).length }));
  const save = async () => {
    if (!cls || !students.length) return;
    setBusy(true); setMsg(null);
    const ok = await saveClassDay({
      teacherUid, classId, className: cls.title || cls.name || 'Class', date,
      marks: Object.fromEntries(students.map(s => [s.uid, { status: marks[s.uid]?.status || 'present', note: marks[s.uid]?.note || undefined, guardianUids: s.guardianUids }])),
    });
    setBusy(false);
    if (ok) { setSavedIds(new Set(students.map(s => s.uid))); onSaved?.(); }
    setMsg(ok ? { ok, text: `Saved for ${students.length} student${students.length === 1 ? '' : 's'}. Families can see it now.` } : { ok, text: 'Could not save attendance. Check your connection and try again.' });
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm grid sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="att-h" onClick={onClose}>
      <div className="bg-[#111018] text-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[min(720px,94vw)] sm:rounded-[28px] border border-white/10 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#60A5FA]">Attendance</p>
              <h2 id="att-h" className="text-[24px] font-black leading-tight" style={{ fontFamily: 'Outfit, system-ui' }}>Take attendance</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-xl border border-white/15 grid place-items-center shrink-0"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <label className="flex-1 min-w-[180px]">
              <span className="block text-[12px] font-semibold text-white/65 mb-1">Class</span>
              <select value={classId} onChange={e => setClassId(e.target.value)} className="w-full h-11 rounded-xl bg-[#0a0a0f] border border-white/15 px-3 text-[15px]">
                {classes.map(c => <option key={c.id} value={c.id}>{c.title || c.name || 'Class'}</option>)}
              </select>
            </label>
            <label className="min-w-[160px]">
              <span className="block text-[12px] font-semibold text-white/65 mb-1">Day</span>
              <span className="relative block">
                <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
                <input type="date" value={date} max={dayKey()} onChange={e => e.target.value && setDate(e.target.value)} className="w-full h-11 rounded-xl bg-[#0a0a0f] border border-white/15 pl-9 pr-3 text-[15px] [color-scheme:dark]" />
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {counts.map(({ s, n }) => <span key={s} className="px-2.5 py-1 rounded-full text-[12px] font-bold" style={{ color: ATTENDANCE_META[s].color, background: `${ATTENDANCE_META[s].color}1f` }}>{ATTENDANCE_META[s].label} {n}</span>)}
            <button type="button" onClick={() => setMarks(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, status: 'present' as AttendanceStatus }])))} className="ml-auto min-h-[36px] px-3 rounded-full border border-white/15 text-[12px] font-bold inline-flex items-center gap-1.5"><CheckCheck size={14} /> All present</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
          {loading && <p className="text-[13px] text-white/55 py-4">Loading…</p>}
          {!loading && students.length === 0 && <p className="text-[13px] text-white/55 py-4">No students in this class yet.</p>}
          <ul className="flex flex-col">
            {!loading && students.map(s => {
              const cur = marks[s.uid]?.status || 'present';
              return (
                <li key={s.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-white/[0.06] last:border-0">
                  <span className="flex items-center gap-3 flex-1 min-w-[160px]">
                    {s.photo ? <img src={s.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" /> : <span className="w-10 h-10 rounded-full grid place-items-center text-[13px] font-black text-[#0a0a0f] shrink-0" style={{ background: ATTENDANCE_META[cur].color }}>{initials(s.name)}</span>}
                    <span className="min-w-0"><span className="block text-[15px] font-semibold truncate">{s.name}</span><span className="block text-[11px] text-white/50">{savedIds.has(s.uid) ? 'Saved' : 'Not saved yet'}</span></span>
                  </span>
                  <span className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {ATTENDANCE_STATUSES.map(st => {
                      const on = cur === st, c = ATTENDANCE_META[st].color;
                      return (
                        <button key={st} type="button" role="radio" aria-checked={on} aria-label={ATTENDANCE_META[st].label} title={ATTENDANCE_META[st].label} onClick={() => set(s.uid, st)}
                          className="w-11 h-11 rounded-xl text-[14px] font-black border transition-colors" style={on ? { background: c, borderColor: c, color: '#0a0a0f' } : { borderColor: `${c}55`, color: c }}>
                          {ATTENDANCE_META[st].short}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-white/[0.08] flex flex-wrap items-center gap-3">
          {msg && <p role="status" className="text-[13px] flex-1 min-w-[200px]" style={{ color: msg.ok ? '#06D6A0' : '#ff8aa3' }}>{msg.text}</p>}
          <button type="button" onClick={save} disabled={busy || loading || !students.length} className="ml-auto min-h-[48px] px-6 rounded-2xl bg-[#3B82F6] text-white font-black text-[15px] disabled:opacity-50">{busy ? 'Saving…' : 'Save attendance'}</button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceSheet;
