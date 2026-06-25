// ClassroomDojoView — the ClassDojo-style classroom experience, driven by a labeled DEMO
// class so anyone can try it: a teacher awards behavior/skill points to students (live
// tally + class story), takes attendance, and a Parent view shows one child's week. All
// interactions run on local state seeded from data/demoClassroom, so visitors can click
// around without changing anything real. Clearly marked DEMO throughout.

import React, { useMemo, useState } from 'react';
import { ArrowLeft, GraduationCap, Users, Sparkles, CalendarCheck, Baby, Star, X } from 'lucide-react';
import { DEMO_CLASS, DojoAward, AttendanceStatus } from '../data/demoClassroom';

const uid = () => `aw_${Math.random().toString(36).slice(2, 9)}`;
const fmt = (ms: number) => { const m = Math.round((1_750_000_000_000 - ms) / 60000); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };

const ClassroomDojoView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const c = DEMO_CLASS;
  const [students, setStudents] = useState(c.students);
  const [awards, setAwards] = useState<DojoAward[]>(c.awards);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(c.attendance);
  const [mode, setMode] = useState<'TEACHER' | 'PARENT'>('TEACHER');
  const [awarding, setAwarding] = useState<string | null>(null); // studentId being awarded

  const behaviorById = useMemo(() => Object.fromEntries(c.behaviors.map(b => [b.id, b])), [c.behaviors]);
  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);

  const award = (studentId: string, behaviorId: string) => {
    const b = behaviorById[behaviorId]; if (!b) return;
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, points: s.points + b.points } : s));
    setAwards(prev => [{ id: uid(), studentId, behaviorId, points: b.points, at: 1_750_000_000_000 - (prev.length ? 0 : 0) - (Date.now() % 1) }, ...prev]);
    setAwarding(null);
  };
  const cycleAttendance = (id: string) => setAttendance(p => ({ ...p, [id]: p[id] === 'present' ? 'tardy' : p[id] === 'tardy' ? 'absent' : 'present' }));

  const child = studentById[c.parent.childId];

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', padding: '20px 16px 70px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={ghost}><ArrowLeft size={16} /> Back</button>}

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#36c5f0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={22} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>{c.name}</h1>
              <span style={{ background: '#111', color: '#FFD24A', fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(255,210,74,0.4)' }}>DEMO CLASS</span>
            </div>
            <p style={{ margin: '2px 0 0', color: '#9a9aa6', fontSize: 12.5 }}>{c.teacherName} · {c.grade} · {students.length} students</p>
          </div>
          <div style={{ display: 'flex', background: '#15151f', borderRadius: 10, padding: 3 }}>
            {(['TEACHER', 'PARENT'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, background: mode === m ? '#FF8C00' : 'transparent', color: mode === m ? '#1a1a1a' : '#9a9aa6' }}>
                {m === 'TEACHER' ? <Users size={13} /> : <Baby size={13} />} {m === 'TEACHER' ? 'Teacher' : 'Parent'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, background: 'rgba(255,210,74,0.1)', border: '1px solid rgba(255,210,74,0.3)', color: '#FFD24A', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: 700 }}>
          <Sparkles size={13} /> Demo class with demo interactions — award points, take attendance, switch to the parent view. Nothing is saved.
        </div>

        {mode === 'TEACHER' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, marginTop: 18, alignItems: 'start' }}>
            <div>
              {/* roster */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
                {students.map(s => (
                  <button key={s.id} onClick={() => setAwarding(s.id)}
                    style={{ cursor: 'pointer', background: '#12121a', border: '1px solid #20202c', borderRadius: 14, padding: 12, color: '#fff', textAlign: 'center', position: 'relative' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 19, margin: '0 auto 8px' }}>{s.name.charAt(0)}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{s.name}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: 'rgba(255,140,0,0.14)', color: '#FF8C00', borderRadius: 12, padding: '2px 9px', fontSize: 13, fontWeight: 900 }}><Star size={11} fill="#FF8C00" /> {s.points}</div>
                    <div style={{ marginTop: 7 }}>
                      <span onClick={(e) => { e.stopPropagation(); cycleAttendance(s.id); }} style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 10, cursor: 'pointer', ...attChip(attendance[s.id]) }}>{attendance[s.id]}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p style={{ color: '#777', fontSize: 11, marginTop: 10 }}>Tap a student to give points · tap their attendance chip to change it.</p>
            </div>

            {/* class story */}
            <div style={{ background: '#101018', border: '1px solid #20202c', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '11px 13px', borderBottom: '1px solid #20202c', fontSize: 12.5, fontWeight: 800, color: '#cfcfd8', display: 'flex', alignItems: 'center', gap: 7 }}><CalendarCheck size={14} className="text-small-orange" style={{ color: '#FF8C00' }} /> Class story</div>
              <div style={{ maxHeight: 460, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {awards.map(aw => { const st = studentById[aw.studentId]; const b = behaviorById[aw.behaviorId]; if (!st || !b) return null; return (
                  <div key={aw.id} style={{ display: 'flex', gap: 9, alignItems: 'center', background: '#15151f', borderRadius: 10, padding: '8px 10px' }}>
                    <span style={{ fontSize: 18 }}>{b.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}><b>{st.name}</b> · {b.label}</div>
                      <div style={{ fontSize: 10, color: '#777' }}>{fmt(aw.at)}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: aw.points >= 0 ? '#5fd17f' : '#ff8080' }}>{aw.points >= 0 ? '+' : ''}{aw.points}</span>
                  </div>
                ); })}
              </div>
            </div>
          </div>
        ) : (
          /* PARENT VIEW */
          <ParentView child={child} awards={awards.filter(a => a.studentId === c.parent.childId)} behaviorById={behaviorById} attendance={attendance[c.parent.childId]} parentName={c.parent.name} />
        )}
      </div>

      {/* award sheet */}
      {awarding && (
        <div onClick={() => setAwarding(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '94vw', background: '#14141c', border: '1px solid #2a2a38', borderRadius: 16, padding: 18, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 800 }}>Give points to {studentById[awarding]?.name}</span>
              <button onClick={() => setAwarding(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {c.behaviors.map(b => (
                <button key={b.id} onClick={() => award(awarding, b.id)}
                  style={{ cursor: 'pointer', padding: '12px 8px', borderRadius: 12, border: `1px solid ${b.positive ? 'rgba(95,209,127,0.3)' : 'rgba(255,128,128,0.3)'}`, background: b.positive ? 'rgba(95,209,127,0.08)' : 'rgba(255,128,128,0.08)', color: '#fff', textAlign: 'center' }}>
                  <div style={{ fontSize: 22 }}>{b.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: b.positive ? '#5fd17f' : '#ff8080', marginTop: 2 }}>{b.points >= 0 ? '+' : ''}{b.points}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ParentView: React.FC<{ child: any; awards: DojoAward[]; behaviorById: Record<string, any>; attendance: AttendanceStatus; parentName: string }> = ({ child, awards, behaviorById, attendance, parentName }) => {
  if (!child) return null;
  const week = awards.reduce((a, x) => a + x.points, 0);
  return (
    <div style={{ maxWidth: 560, margin: '18px auto 0' }}>
      <div style={{ background: '#12121a', border: '1px solid #20202c', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: child.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22 }}>{child.name.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{child.name}</div>
            <div style={{ fontSize: 11.5, color: '#9a9aa6' }}>{parentName}'s view · this week</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FF8C00', fontSize: 20, fontWeight: 900 }}><Star size={16} fill="#FF8C00" /> {child.points}</div>
            <div style={{ fontSize: 9.5, color: '#777', fontWeight: 700 }}>TOTAL POINTS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Stat label="This week" value={`${week >= 0 ? '+' : ''}${week}`} color="#5fd17f" />
          <Stat label="Attendance" value={attendance} color={attendance === 'present' ? '#5fd17f' : attendance === 'tardy' ? '#f5c542' : '#ff8080'} />
          <Stat label="Awards" value={String(awards.length)} color="#36c5f0" />
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 800, color: '#cfcfd8', marginBottom: 8 }}>What {child.name} did</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {awards.map(aw => { const b = behaviorById[aw.behaviorId]; if (!b) return null; return (
          <div key={aw.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#12121a', border: '1px solid #20202c', borderRadius: 11, padding: '9px 12px' }}>
            <span style={{ fontSize: 19 }}>{b.icon}</span>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{b.label}</div>
            <span style={{ fontSize: 13, fontWeight: 900, color: aw.points >= 0 ? '#5fd17f' : '#ff8080' }}>{aw.points >= 0 ? '+' : ''}{aw.points}</span>
          </div>
        ); })}
        {awards.length === 0 && <div style={{ color: '#777', fontSize: 12 }}>No awards yet today.</div>}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 10px', textAlign: 'center' }}>
    <div style={{ fontSize: 16, fontWeight: 900, color, textTransform: 'capitalize' }}>{value}</div>
    <div style={{ fontSize: 9, color: '#9a9aa6', fontWeight: 700, marginTop: 2, letterSpacing: 0.5 }}>{label}</div>
  </div>
);

const attChip = (s: AttendanceStatus): React.CSSProperties =>
  s === 'present' ? { background: 'rgba(95,209,127,0.16)', color: '#5fd17f' }
  : s === 'tardy' ? { background: 'rgba(245,197,66,0.16)', color: '#f5c542' }
  : { background: 'rgba(255,128,128,0.16)', color: '#ff8080' };

const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 };

export default ClassroomDojoView;
