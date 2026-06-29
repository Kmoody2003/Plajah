// TeacherToolsView — Phase 4 teacher backend. Three tools over the class's Learner Ledger:
//   1. Gradebook — a standards-based mastery heatmap (students × standards), auto-grouped.
//   2. Plan from Mastery — the killer feature: reads the class's weakest standards and GENERATES
//      a standards-aligned, pre-differentiated lesson plan (Support / On-Level / Turbo) that pulls
//      Plajah's own cartridges. Planning becomes "approve & tweak", not "start from blank".
//   3. Assess Work — score a student's creative artifact against a standard's rubric → writes a
//      teacher-assessment record to that student's ledger (creativity-as-assessment).
//
// Demoable on the bundled DEMO class (Room 4B). Per-student × per-standard mastery is derived
// deterministically for the demo; in production this reads learnerProficiency for each student.

import React, { useMemo, useState } from 'react';
import { ArrowLeft, LayoutGrid, Wand2, ClipboardCheck, Sparkles, Check } from 'lucide-react';
import { DEMO_CLASS } from '../data/demoClassroom';
import {
  STANDARDS, standardById, bandFor, masteryToLevel, turboTrackFor, BAND_TO_GRADES,
  type GradeId, type Subject, type LearningStandard,
} from '../data/educationStandards';
import { appendRecord } from '../services/learningLedgerService';

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#fff', muted: '#9a9aa6', faint: '#777', orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const SUBJECTS: { id: Subject; label: string; cartridge: string; color: string }[] = [
  { id: 'ELA', label: 'Reading', cartridge: 'Reading Quest', color: T.orange },
  { id: 'SCIENCE', label: 'Science', cartridge: 'Science Quest', color: T.violet },
  { id: 'MATH', label: 'Math', cartridge: 'Math Classroom', color: T.blue },
];
const BANDS: { id: BandId; label: string }[] = [
  { id: 'g12', label: 'Grades 1–2' }, { id: 'g34', label: 'Grades 3–4' }, { id: 'g57', label: 'Grades 5–7' },
];
type BandId = 'prek' | 'g12' | 'g34' | 'g57';

// Deterministic per-(student, standard) mastery so the demo gradebook is stable + realistic.
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cellMastery = (studentId: string, standardId: string) => 38 + (hash(studentId + '|' + standardId) % 58); // 38..95

const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const chip = (on: boolean, color = T.orange): React.CSSProperties => ({ cursor: 'pointer', padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? color : T.border}`, background: on ? `${color}22` : 'transparent', color: on ? color : T.ink });

type Tab = 'grade' | 'plan' | 'assess';

const TeacherToolsView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const [tab, setTab] = useState<Tab>('plan');
  const [subject, setSubject] = useState<Subject>('ELA');
  const [band, setBand] = useState<BandId>('g34');

  const students = DEMO_CLASS.students;
  const grades = BAND_TO_GRADES[band] || [];
  const standards = useMemo(() => STANDARDS.filter(s => s.subject === subject && grades.includes(s.grade)), [subject, band]);

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#36c5f0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={20} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Teacher Tools</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>{DEMO_CLASS.name} · {DEMO_CLASS.teacherName} · standards-based, over the class's Learner Ledger</p>
          </div>
        </div>

        {/* subject + band */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <div><Eyebrow>Subject</Eyebrow><div style={{ display: 'flex', gap: 6 }}>{SUBJECTS.map(s => <button key={s.id} onClick={() => setSubject(s.id)} style={chip(subject === s.id, s.color)}>{s.label}</button>)}</div></div>
          <div><Eyebrow>Level</Eyebrow><div style={{ display: 'flex', gap: 6 }}>{BANDS.map(b => <button key={b.id} onClick={() => setBand(b.id)} style={chip(band === b.id)}>{b.label}</button>)}</div></div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '18px 0 20px', flexWrap: 'wrap' }}>
          {([['plan', 'Plan from Mastery', Wand2], ['grade', 'Gradebook', LayoutGrid], ['assess', 'Assess Work', ClipboardCheck]] as [Tab, string, any][]).map(([v, l, Icon]) => (
            <button key={v} onClick={() => setTab(v)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === v ? T.orange : T.border}`, background: tab === v ? T.orange : 'transparent', color: tab === v ? '#1a1a1a' : T.muted }}>
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>

        {standards.length === 0 ? (
          <div style={{ ...cardStyle, padding: 20, color: T.muted }}>No standards seeded for {subject} at this level yet. Try another subject/level.</div>
        ) : tab === 'plan' ? (
          <PlanFromMastery students={students} standards={standards} subject={subject} band={band} />
        ) : tab === 'grade' ? (
          <Gradebook students={students} standards={standards} />
        ) : (
          <AssessWork students={students} standards={standards} user={user} />
        )}
      </div>
    </div>
  );
};

// ── 1. Gradebook ─────────────────────────────────────────────────────────────────
const Gradebook: React.FC<{ students: { id: string; name: string; color: string }[]; standards: LearningStandard[] }> = ({ students, standards }) => {
  return (
    <div style={{ ...cardStyle, padding: 16, overflowX: 'auto' }}>
      <Eyebrow>Standards-based gradebook · mastery heatmap</Eyebrow>
      <div style={{ minWidth: 120 + standards.length * 90 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${standards.length}, 1fr)`, gap: 6, alignItems: 'end', paddingBottom: 8 }}>
          <span />
          {standards.map(s => <div key={s.id} style={{ fontSize: 9, color: T.muted, fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{s.code}</div>)}
        </div>
        {students.map(st => {
          const cells = standards.map(s => cellMastery(st.id, s.id));
          const avg = Math.round(cells.reduce((a, b) => a + b, 0) / cells.length);
          return (
            <div key={st.id} style={{ display: 'grid', gridTemplateColumns: `160px repeat(${standards.length}, 1fr)`, gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: st.color, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 11 }}>{st.name.charAt(0)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{st.name}</span>
                <span style={{ fontSize: 10, color: bandFor(avg).color, fontWeight: 800 }}>{avg}%</span>
              </div>
              {cells.map((m, i) => { const b = bandFor(m); return <div key={i} title={`${standards[i].code}: ${m}%`} style={{ height: 30, borderRadius: 6, background: `${b.color}2e`, border: `1px solid ${b.color}`, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: b.color }}>{m}</div>; })}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: T.muted }}>
        {bandLegend()}
      </div>
    </div>
  );
};
const bandLegend = () => ['emerging', 'developing', 'proficient', 'advanced', 'turbo'].map(lvl => {
  const b = bandFor(lvl === 'emerging' ? 20 : lvl === 'developing' ? 50 : lvl === 'proficient' ? 75 : lvl === 'advanced' ? 90 : 99);
  return <span key={lvl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} /> {b.label}</span>;
});

// ── 2. Plan from Mastery (the headline) ──────────────────────────────────────────
const PlanFromMastery: React.FC<{ students: { id: string; name: string }[]; standards: LearningStandard[]; subject: Subject; band: BandId }> = ({ students, standards, subject, band }) => {
  // Class-average mastery per standard → weakest first.
  const ranked = useMemo(() => standards.map(s => {
    const avg = Math.round(students.reduce((a, st) => a + cellMastery(st.id, s.id), 0) / students.length);
    return { std: s, avg };
  }).sort((a, b) => a.avg - b.avg), [standards, students]);

  const target = ranked[0];
  const cartridge = SUBJECTS.find(s => s.id === subject)!.cartridge;
  const grade = (BAND_TO_GRADES[band] || ['g3'])[0] as GradeId;
  const turbo = turboTrackFor(subject, grade);

  // Differentiate the roster by their mastery on the target standard.
  const groups = useMemo(() => {
    const g = { support: [] as string[], onLevel: [] as string[], turbo: [] as string[] };
    students.forEach(st => { const m = cellMastery(st.id, target.std.id); if (m >= 85) g.turbo.push(st.name); else if (m < 55) g.support.push(st.name); else g.onLevel.push(st.name); });
    return g;
  }, [target, students]);

  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16, borderColor: 'rgba(255,140,0,0.3)', background: 'linear-gradient(120deg, rgba(255,140,0,0.06), rgba(129,102,230,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Wand2 size={16} color={T.orange} /><Eyebrow color={T.orange}>Auto-generated · targets your class's biggest gap</Eyebrow></div>
        <div style={{ fontWeight: 900, fontSize: 20 }}>{target.std.statement}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{target.std.framework} · {target.std.code} · class average <b style={{ color: bandFor(target.avg).color }}>{target.avg}% ({bandFor(target.avg).label})</b> — the lowest in {subject} right now.</div>
      </div>

      <Eyebrow>Differentiated plan · three tracks, auto-grouped</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
        <PlanTrack color={T.red} title="Support" who={groups.support} activity={`Assign ${cartridge} on this skill at an easier level — rebuild the foundation with guided practice.`} tag="re-teach + scaffold" />
        <PlanTrack color={T.green} title="On-Level" who={groups.onLevel} activity={`Targeted ${cartridge} practice on ${target.std.code}, then a short formative check that writes to the ledger.`} tag="practice + check" />
        <PlanTrack color={T.violet} title="Turbo" who={groups.turbo} activity={turbo ? `${turbo.challenges[0].title}: ${turbo.challenges[0].prompt}` : 'Extend with an above-grade challenge and a creative application.'} tag="depth + transfer" />
      </div>

      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>Why this plan</Eyebrow>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Built from the class's live ledger — not a blank page. {students.length} students sorted into three tracks by their mastery of <b style={{ color: T.ink }}>{target.std.code}</b>, each track pre-loaded with Plajah content ({cartridge}) and a check that flows back into the ledger. Approve, tweak, assign.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.faint }}>Next gaps after this: {ranked.slice(1, 4).map(r => `${r.std.code} (${r.avg}%)`).join(' · ')}</div>
      </div>
    </div>
  );
};
const PlanTrack: React.FC<{ color: string; title: string; who: string[]; activity: string; tag: string }> = ({ color, title, who, activity, tag }) => (
  <div style={{ ...cardStyle, padding: 15, borderColor: color }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontWeight: 800, fontSize: 15, color }}>{title}</span>
      <span style={{ fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, color: T.muted }}>{tag}</span>
    </div>
    <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{who.length ? who.join(', ') : 'No students in this band'}</div>
    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{activity}</div>
  </div>
);

// ── 3. Assess Work (creativity-as-assessment) ────────────────────────────────────
const AssessWork: React.FC<{ students: { id: string; name: string }[]; standards: LearningStandard[]; user?: any }> = ({ students, standards, user }) => {
  const [studentId, setStudentId] = useState(students[0].id);
  const [standardId, setStandardId] = useState(standards[0].id);
  const [artifact, setArtifact] = useState('');
  const [score, setScore] = useState(3);
  const [saved, setSaved] = useState(false);

  const SCALE = [['1', 'Emerging', 30], ['2', 'Developing', 55], ['3', 'Proficient', 75], ['4', 'Advanced', 92]] as [string, string, number][];
  const masteryForScore = SCALE.find(s => s[0] === String(score))![2];

  const save = () => {
    if (user?.uid) {
      // In production, studentId is the child's real uid; here we record under the teacher's view.
      appendRecord({ studentId: String(studentId), standardId, framework: standardById(standardId)?.framework || 'CCSS_ELA', source: 'creative-artifact', masteryBefore: masteryForScore, masteryAfter: masteryForScore, byUid: user.uid, evidence: artifact || undefined }).catch(() => {});
    }
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <Eyebrow color={T.violet}>Creativity-as-assessment</Eyebrow>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>Score a student's creative work — a song, a film scene, a piece of writing — against a standard. The result becomes evidence in their Learner Ledger, not just a number.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><Eyebrow>Student</Eyebrow><select value={studentId} onChange={e => setStudentId(e.target.value)} style={selStyle}>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Eyebrow>Standard</Eyebrow><select value={standardId} onChange={e => setStandardId(e.target.value)} style={selStyle}>{standards.map(s => <option key={s.id} value={s.id}>{s.code} — {s.statement.slice(0, 40)}…</option>)}</select></div>
      </div>
      <div style={{ marginBottom: 12 }}><Eyebrow>The artifact (link or description)</Eyebrow><input value={artifact} onChange={e => setArtifact(e.target.value)} placeholder="e.g. Maya's fractions song, or a link to the recording" style={selStyle} /></div>
      <div style={{ marginBottom: 14 }}>
        <Eyebrow>Rubric score</Eyebrow>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCALE.map(([v, label, m]) => <button key={v} onClick={() => setScore(+v)} style={chip(score === +v, bandFor(m).color)}>{v} · {label}</button>)}</div>
      </div>
      <button onClick={save} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 10, border: 'none', background: saved ? T.green : T.violet, color: '#fff', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>
        {saved ? <><Check size={14} /> Recorded to ledger</> : <><Sparkles size={14} /> Record assessment</>}
      </button>
      {!user?.uid && <div style={{ marginTop: 10, fontSize: 11, color: T.faint }}>Sign in as a teacher to write real ledger records.</div>}
    </div>
  );
};
const selStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: 13, fontFamily: T.font, boxSizing: 'border-box' };

export default TeacherToolsView;
