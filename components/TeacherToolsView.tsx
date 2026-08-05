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
import { ArrowLeft, LayoutGrid, Wand2, ClipboardCheck, Sparkles, Check, Plug, Globe, Download, CalendarDays, FileDown, Send, Trash2, Plus, ListChecks, Printer } from 'lucide-react';
import { DEMO_CLASS } from '../data/demoClassroom';
import {
  STANDARDS, standardById, bandFor, masteryToLevel, masteryToPISABand, turboTrackFor, BAND_TO_GRADES,
  type GradeId, type Subject, type LearningStandard,
} from '../data/educationStandards';
import { appendRecord } from '../services/learningLedgerService';
import {
  INTEGRATIONS, importCASEFramework, SAMPLE_CASE, type IntegrationStatus,
  exportGradebookCSV, toGoogleClassroomCoursework, toLtiResourceLink, toQTIAssessment, downloadText,
  type CheckQuestion,
} from '../services/interopService';
import { ORG_TYPES, FRAMEWORK_OVERLAYS, DEFAULT_CONTEXT, type LearningContextSettings } from '../data/deploymentContexts';

export interface LessonPlan {
  id: string; title: string; subject: Subject; band: string; standardCode: string;
  objective: string; activities: string[]; notes: string; createdAt: number;
}

export interface AssignmentCheck {
  id: string; title: string; subject: Subject; band: string; standardCode: string;
  points: number; questions: CheckQuestion[]; createdAt: number;
}

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
const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
  </div>
);

type Tab = 'grade' | 'plan' | 'planner' | 'checks' | 'assess' | 'reports' | 'connect' | 'context';

const TeacherToolsView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const [tab, setTab] = useState<Tab>('plan');
  const [subject, setSubject] = useState<Subject>('ELA');
  const [band, setBand] = useState<BandId>('g34');
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<AssignmentCheck[]>([]);

  const addPlan = (p: Omit<LessonPlan, 'id' | 'createdAt'>) => {
    setPlans(ps => [{ ...p, id: `lp_${ps.length + 1}_${p.standardCode}`, createdAt: 1 }, ...ps]);
    setTab('planner');
  };

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
          {([['plan', 'Plan from Mastery', Wand2], ['planner', `Planner${plans.length ? ` (${plans.length})` : ''}`, CalendarDays], ['checks', `Checks${assignments.length ? ` (${assignments.length})` : ''}`, ListChecks], ['grade', 'Gradebook', LayoutGrid], ['assess', 'Assess Work', ClipboardCheck], ['reports', 'Reports', Printer], ['connect', 'Integrations', Plug], ['context', 'Context', Globe]] as [Tab, string, any][]).map(([v, l, Icon]) => (
            <button key={v} onClick={() => setTab(v)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800, border: `1px solid ${tab === v ? T.orange : T.border}`, background: tab === v ? T.orange : 'transparent', color: tab === v ? '#1a1a1a' : T.muted }}>
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>

        {tab === 'connect' ? (
          <Integrations />
        ) : tab === 'context' ? (
          <ContextSettings />
        ) : tab === 'planner' ? (
          <Planner plans={plans} setPlans={setPlans} onCreateBlank={() => setTab('plan')} />
        ) : tab === 'checks' ? (
          <ChecksBuilder subject={subject} band={band} standards={standards} assignments={assignments} setAssignments={setAssignments} />
        ) : tab === 'reports' ? (
          <Reports />
        ) : standards.length === 0 ? (
          <div style={{ ...cardStyle, padding: 20, color: T.muted }}>No standards seeded for {subject} at this level yet. Try another subject/level.</div>
        ) : tab === 'plan' ? (
          <PlanFromMastery students={students} standards={standards} subject={subject} band={band} onSave={addPlan} />
        ) : tab === 'grade' ? (
          <Gradebook students={students} standards={standards} subject={subject} band={band} />
        ) : (
          <AssessWork students={students} standards={standards} user={user} />
        )}
      </div>
    </div>
  );
};

// ── 1. Gradebook ─────────────────────────────────────────────────────────────────
const Gradebook: React.FC<{ students: { id: string; name: string; color: string }[]; standards: LearningStandard[]; subject: Subject; band: BandId }> = ({ students, standards, subject, band }) => {
  const exportCsv = () => {
    const headers = ['Student', ...standards.map(s => s.code), 'Average'];
    const rows = students.map(st => {
      const cells = standards.map(s => cellMastery(st.id, s.id));
      const avg = Math.round(cells.reduce((a, b) => a + b, 0) / cells.length);
      return [st.name, ...cells, avg];
    });
    downloadText(exportGradebookCSV(headers, rows), `plajah-gradebook-${subject}-${band}.csv`, 'text/csv');
  };
  return (
    <div style={{ ...cardStyle, padding: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Eyebrow>Standards-based gradebook · mastery heatmap</Eyebrow>
        <button onClick={exportCsv} title="Export to CSV (import into any SIS/gradebook)" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.green, fontSize: 10, fontWeight: 800 }}><FileDown size={12} /> Export CSV</button>
      </div>
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
const PlanFromMastery: React.FC<{ students: { id: string; name: string }[]; standards: LearningStandard[]; subject: Subject; band: BandId; onSave: (p: Omit<LessonPlan, 'id' | 'createdAt'>) => void }> = ({ students, standards, subject, band, onSave }) => {
  // Class-average mastery per standard → weakest first.
  const ranked = useMemo(() => standards.map(s => {
    const avg = Math.round(students.reduce((a, st) => a + cellMastery(st.id, s.id), 0) / students.length);
    return { std: s, avg };
  }).sort((a, b) => a.avg - b.avg), [standards, students]);

  const target = ranked[0];
  const cartridge = SUBJECTS.find(s => s.id === subject)!.cartridge;
  const grade = (BAND_TO_GRADES[band] || ['g3'])[0] as GradeId;
  const turbo = turboTrackFor(subject, grade);

  const supportAct = `Assign ${cartridge} on this skill at an easier level — rebuild the foundation with guided practice.`;
  const onLevelAct = `Targeted ${cartridge} practice on ${target.std.code}, then a short formative check that writes to the ledger.`;
  const turboAct = turbo ? `${turbo.challenges[0].title}: ${turbo.challenges[0].prompt}` : 'Extend with an above-grade challenge and a creative application.';

  // Differentiate the roster by their mastery on the target standard.
  const groups = useMemo(() => {
    const g = { support: [] as string[], onLevel: [] as string[], turbo: [] as string[] };
    students.forEach(st => { const m = cellMastery(st.id, target.std.id); if (m >= 85) g.turbo.push(st.name); else if (m < 55) g.support.push(st.name); else g.onLevel.push(st.name); });
    return g;
  }, [target, students]);

  const savePlan = () => onSave({ title: `${target.std.code} — gap-closer`, subject, band, standardCode: target.std.code, objective: target.std.statement, activities: [`Support — ${supportAct}`, `On-Level — ${onLevelAct}`, `Turbo — ${turboAct}`], notes: '' });

  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 16, borderColor: 'rgba(255,140,0,0.3)', background: 'linear-gradient(120deg, rgba(255,140,0,0.06), rgba(129,102,230,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wand2 size={16} color={T.orange} /><Eyebrow color={T.orange}>Auto-generated · targets your class's biggest gap</Eyebrow></div>
          <button onClick={savePlan} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}><Plus size={13} /> Save as lesson plan</button>
        </div>
        <div style={{ fontWeight: 900, fontSize: 20 }}>{target.std.statement}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{target.std.framework} · {target.std.code} · class average <b style={{ color: bandFor(target.avg).color }}>{target.avg}% ({bandFor(target.avg).label})</b> — the lowest in {subject} right now.</div>
      </div>

      <Eyebrow>Differentiated plan · three tracks, auto-grouped</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
        <PlanTrack color={T.red} title="Support" who={groups.support} activity={supportAct} tag="re-teach + scaffold" />
        <PlanTrack color={T.green} title="On-Level" who={groups.onLevel} activity={onLevelAct} tag="practice + check" />
        <PlanTrack color={T.violet} title="Turbo" who={groups.turbo} activity={turboAct} tag="depth + transfer" />
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

// ── Lesson Planner (on-platform, interop-native export) ──────────────────────────
const Planner: React.FC<{ plans: LessonPlan[]; setPlans: React.Dispatch<React.SetStateAction<LessonPlan[]>>; onCreateBlank: () => void }> = ({ plans, setPlans, onCreateBlank }) => {
  const update = (id: string, patch: Partial<LessonPlan>) => setPlans(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const remove = (id: string) => setPlans(ps => ps.filter(p => p.id !== id));
  const exportPlan = (p: LessonPlan, fmt: 'json' | 'gc' | 'lti') => {
    const like = { title: p.title, objective: p.objective, standardCode: p.standardCode, activities: p.activities };
    if (fmt === 'json') downloadText(JSON.stringify(p, null, 2), `plan-${p.standardCode}.json`);
    else if (fmt === 'gc') downloadText(JSON.stringify(toGoogleClassroomCoursework(like), null, 2), `plan-${p.standardCode}-googleclassroom.json`);
    else downloadText(JSON.stringify(toLtiResourceLink(like), null, 2), `plan-${p.standardCode}-lti.json`);
  };

  if (!plans.length) return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center', color: T.muted }}>
      <CalendarDays size={40} style={{ opacity: 0.3 }} />
      <div style={{ fontWeight: 800, fontSize: 17, color: T.ink, marginTop: 10 }}>No saved plans yet</div>
      <div style={{ fontSize: 13, margin: '6px 0 16px' }}>Generate a gap-targeted plan and save it here — then export to your tools.</div>
      <button onClick={onCreateBlank} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Wand2 size={14} /> Plan from mastery</button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>Your plans are <b style={{ color: T.ink }}>interop-native</b> — export the exact payloads ed-tech tools expect. Live push to Google Classroom / LTI is one OAuth connection away (see Integrations).</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map(p => (
          <div key={p.id} style={{ ...cardStyle, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input value={p.title} onChange={e => update(p.id, { title: e.target.value })} style={{ ...selStyle, fontWeight: 800, fontSize: 15 }} />
              <button onClick={() => remove(p.id)} title="Delete" style={{ cursor: 'pointer', padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.red, flexShrink: 0 }}><Trash2 size={14} /></button>
            </div>
            <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, fontWeight: 800, marginBottom: 8 }}>{p.subject} · {p.band} · {p.standardCode}</div>
            <div style={{ marginBottom: 8 }}><Eyebrow>Objective</Eyebrow><textarea value={p.objective} onChange={e => update(p.id, { objective: e.target.value })} rows={2} style={{ ...selStyle, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 8 }}>
              <Eyebrow>Activities</Eyebrow>
              {p.activities.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: T.muted, padding: '4px 0', lineHeight: 1.4 }}>• {a}</div>)}
            </div>
            <div style={{ marginBottom: 12 }}><Eyebrow>Notes</Eyebrow><textarea value={p.notes} onChange={e => update(p.id, { notes: e.target.value })} rows={2} placeholder="Materials, timing, reminders…" style={{ ...selStyle, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => exportPlan(p, 'json')} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
              <button onClick={() => exportPlan(p, 'gc')} style={exportBtn(T.green)}><Send size={12} /> Google Classroom</button>
              <button onClick={() => exportPlan(p, 'lti')} style={exportBtn(T.blue)}><Send size={12} /> LTI 1.3</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const exportBtn = (color: string): React.CSSProperties => ({ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color, fontSize: 10.5, fontWeight: 800 });

// ── Assignment / formative-check builder (QTI-native) ────────────────────────────
const ChecksBuilder: React.FC<{ subject: Subject; band: BandId; standards: LearningStandard[]; assignments: AssignmentCheck[]; setAssignments: React.Dispatch<React.SetStateAction<AssignmentCheck[]>> }> = ({ subject, band, standards, assignments, setAssignments }) => {
  const [title, setTitle] = useState('Exit ticket');
  const [standardId, setStandardId] = useState(standards[0]?.id || '');
  const [points, setPoints] = useState(10);
  const [questions, setQuestions] = useState<CheckQuestion[]>([{ prompt: '', options: ['', '', ''], answer: 0 }]);

  const setQ = (i: number, patch: Partial<CheckQuestion>) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const setOpt = (i: number, oi: number, v: string) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, options: q.options.map((o, j) => j === oi ? v : o) } : q));
  const valid = title.trim() && questions.some(q => q.prompt.trim());

  const assign = () => {
    const std = standardById(standardId);
    setAssignments(a => [{ id: `chk_${a.length + 1}_${standardId}`, title: title.trim(), subject, band, standardCode: std?.code || standardId, points, questions: questions.filter(q => q.prompt.trim()), createdAt: 1 }, ...a]);
    setTitle('Exit ticket'); setQuestions([{ prompt: '', options: ['', '', ''], answer: 0 }]);
  };

  const exportCheck = (a: AssignmentCheck, fmt: 'qti' | 'gc' | 'lti' | 'json') => {
    const std = standardById(`${a.standardCode}`);
    const like = { title: a.title, standardCode: a.standardCode, points: a.points, questions: a.questions };
    const planLike = { title: a.title, objective: `Formative check · ${std?.statement || a.standardCode}`, standardCode: a.standardCode, activities: a.questions.map(q => q.prompt) };
    if (fmt === 'qti') downloadText(JSON.stringify(toQTIAssessment(like), null, 2), `check-${a.standardCode}-qti.json`);
    else if (fmt === 'gc') downloadText(JSON.stringify(toGoogleClassroomCoursework(planLike), null, 2), `check-${a.standardCode}-googleclassroom.json`);
    else if (fmt === 'lti') downloadText(JSON.stringify(toLtiResourceLink(planLike), null, 2), `check-${a.standardCode}-lti.json`);
    else downloadText(JSON.stringify(a, null, 2), `check-${a.standardCode}.json`);
  };

  if (!standards.length) return <div style={{ ...cardStyle, padding: 20, color: T.muted }}>Pick a subject/level with standards to build a check.</div>;

  return (
    <div>
      <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
        <Eyebrow color={T.orange}>Build a formative check · QTI-native</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Title</div><input value={title} onChange={e => setTitle(e.target.value)} style={selStyle} /></div>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Standard</div><select value={standardId} onChange={e => setStandardId(e.target.value)} style={selStyle}>{standards.map(s => <option key={s.id} value={s.id}>{s.code} — {s.statement.slice(0, 36)}…</option>)}</select></div>
          <div><div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Points</div><input type="number" min={1} value={points} onChange={e => setPoints(+e.target.value)} style={selStyle} /></div>
        </div>
        {questions.map((q, i) => (
          <div key={i} style={{ ...cardStyle, padding: 12, marginBottom: 10, background: T.cardAlt }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={q.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} style={selStyle} />
              {questions.length > 1 && <button onClick={() => setQuestions(qs => qs.filter((_, idx) => idx !== i))} style={{ ...exportBtn(T.red), padding: '0 10px' }}>✕</button>}
            </div>
            {q.options.map((o, oi) => (
              <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => setQ(i, { answer: oi })} title="Mark correct" style={{ cursor: 'pointer', width: 22, height: 22, borderRadius: 99, flexShrink: 0, border: `2px solid ${q.answer === oi ? T.green : T.border}`, background: q.answer === oi ? T.green : 'transparent', color: '#0c0a08', fontSize: 12 }}>{q.answer === oi ? '✓' : ''}</button>
                <input value={o} onChange={e => setOpt(i, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={selStyle} />
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => setQuestions(qs => [...qs, { prompt: '', options: ['', '', ''], answer: 0 }])} style={{ ...exportBtn(T.muted), border: `1px dashed ${T.border}` }}><Plus size={12} /> Add question</button>
          <button onClick={assign} disabled={!valid} style={{ cursor: valid ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: valid ? 1 : 0.4 }}><ListChecks size={14} /> Assign to {DEMO_CLASS.name.split('—')[0].trim()}</button>
        </div>
      </div>

      {assignments.length > 0 && (
        <div>
          <div style={{ marginBottom: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>Assigned checks export as <b style={{ color: T.ink }}>QTI 3.0</b> (any assessment platform), Google Classroom, or LTI. Student results write back to each learner's ledger; grades pass back via LTI-AGS / OneRoster.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {assignments.map(a => (
              <div key={a.id} style={{ ...cardStyle, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{a.title}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{a.standardCode} · {a.questions.length} question{a.questions.length > 1 ? 's' : ''} · {a.points} pts</div>
                  </div>
                  <button onClick={() => setAssignments(list => list.filter(x => x.id !== a.id))} style={{ cursor: 'pointer', padding: 7, borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.red }}><Trash2 size={13} /></button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <button onClick={() => exportCheck(a, 'qti')} style={exportBtn(T.orange)}><FileDown size={12} /> QTI 3.0</button>
                  <button onClick={() => exportCheck(a, 'gc')} style={exportBtn(T.green)}><Send size={12} /> Google Classroom</button>
                  <button onClick={() => exportCheck(a, 'lti')} style={exportBtn(T.blue)}><Send size={12} /> LTI 1.3</button>
                  <button onClick={() => exportCheck(a, 'json')} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Progress Reports (parent-ready, from the ledger) ─────────────────────────────
const SUBJ_LABEL: Partial<Record<Subject, { label: string; color: string }>> = {
  ELA: { label: 'Reading & Language', color: T.orange }, SCIENCE: { label: 'Science', color: T.violet }, MATH: { label: 'Mathematics', color: T.blue },
};
const buildReport = (studentId: string) => {
  const student = DEMO_CLASS.students.find(s => s.id === studentId)!;
  const items = STANDARDS.filter(s => SUBJ_LABEL[s.subject]).map(s => ({ std: s, m: cellMastery(studentId, s.id) }));
  const subjects: Record<string, { std: LearningStandard; m: number }[]> = {};
  items.forEach(it => { (subjects[it.std.subject] ||= []).push(it); });
  const overall = items.length ? Math.round(items.reduce((a, x) => a + x.m, 0) / items.length) : 0;
  const sorted = [...items].sort((a, b) => b.m - a.m);
  return { student, subjects, overall, strengths: sorted.slice(0, 3), focus: sorted.slice(-3).reverse() };
};

const Reports: React.FC = () => {
  const [studentId, setStudentId] = useState(DEMO_CLASS.students[0].id);
  const r = buildReport(studentId);
  const band = bandFor(r.overall);
  const [comment, setComment] = useState('');
  const defComment = `${r.student.name} is working at a ${band.label.toLowerCase()} level overall. Strongest in ${r.strengths[0]?.std.domain}. With a little focus on ${r.focus[0]?.std.domain}, ${r.student.name.split(' ')[0]} will keep climbing.`;
  const note = comment || defComment;

  const reportHTML = () => {
    const subj = Object.entries(r.subjects).map(([s, list]) => {
      const avg = Math.round(list.reduce((a, x) => a + x.m, 0) / list.length);
      const rows = list.map(x => `<tr><td>${x.std.code}</td><td>${x.std.statement}</td><td style="text-align:right;font-weight:700">${x.m}%</td></tr>`).join('');
      return `<h3>${SUBJ_LABEL[s as Subject]?.label || s} — ${avg}% (${bandFor(avg).label})</h3><table>${rows}</table>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${r.student.name} — Progress Report</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;max-width:720px;margin:32px auto;color:#111;padding:0 16px}
h1{margin:0;font-size:24px}.sub{color:#666;font-size:13px;margin:2px 0 16px}
.standing{background:#f5f3ef;border-radius:10px;padding:14px 16px;margin-bottom:18px}
h3{margin:18px 0 6px;font-size:15px}table{width:100%;border-collapse:collapse;font-size:12px}
td{border-bottom:1px solid #eee;padding:5px 6px;vertical-align:top}
.cols{display:flex;gap:24px;margin:12px 0}.col{flex:1}.col b{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888}
.comment{border-left:3px solid #FF8C00;padding:8px 12px;background:#fff8ef;margin-top:18px;font-size:13px}
.foot{margin-top:24px;color:#999;font-size:11px;border-top:1px solid #eee;padding-top:10px}</style></head>
<body><h1>${r.student.name}</h1><div class="sub">${DEMO_CLASS.name} · ${DEMO_CLASS.teacherName} · Progress Report</div>
<div class="standing"><b>Overall:</b> ${r.overall}% — ${band.label} · Global standing: PISA band ${masteryToPISABand(r.overall)}/6</div>
<div class="cols"><div class="col"><b>Strengths</b><ul>${r.strengths.map(x => `<li>${x.std.domain} (${x.m}%)</li>`).join('')}</ul></div>
<div class="col"><b>Focus areas</b><ul>${r.focus.map(x => `<li>${x.std.domain} (${x.m}%)</li>`).join('')}</ul></div></div>
${subj}<div class="comment"><b>Teacher note:</b> ${note}</div>
<div class="foot">Generated from ${r.student.name.split(' ')[0]}'s Plajah Learner Ledger. Standards-aligned, portable, verifiable.</div></body></html>`;
  };

  return (
    <div>
      <div style={{ ...cardStyle, padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Eyebrow>Student</Eyebrow>
        <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...selStyle, maxWidth: 220 }}>{DEMO_CLASS.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <div style={{ flex: 1 }} />
        <button onClick={() => downloadText(reportHTML(), `progress-report-${r.student.name.replace(/\W/g, '')}.html`, 'text/html')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}><Printer size={14} /> Download report (print-ready)</button>
        <button onClick={() => downloadText(JSON.stringify({ student: r.student.name, overall: r.overall, level: band.label, pisaBand: masteryToPISABand(r.overall), subjects: r.subjects, note }, null, 2), `progress-report-${r.student.name.replace(/\W/g, '')}.json`)} style={exportBtn(T.muted)}><FileDown size={12} /> JSON</button>
      </div>

      {/* In-app preview of the parent-facing report */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 22 }}>{r.student.name}</div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{DEMO_CLASS.name} · {DEMO_CLASS.teacherName} · Progress Report</div>
        <div style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: band.color }}>{r.overall}%</div>
          <div style={{ fontSize: 13, color: T.muted }}><b style={{ color: band.color }}>{band.label}</b> · Global standing <b style={{ color: T.ink }}>PISA band {masteryToPISABand(r.overall)}/6</b></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div><Eyebrow color={T.green}>Strengths</Eyebrow>{r.strengths.map(x => <div key={x.std.id} style={{ fontSize: 12.5, marginBottom: 4 }}>{x.std.domain} <span style={{ color: T.green, fontWeight: 700 }}>{x.m}%</span></div>)}</div>
          <div><Eyebrow color={T.orange}>Focus areas</Eyebrow>{r.focus.map(x => <div key={x.std.id} style={{ fontSize: 12.5, marginBottom: 4 }}>{x.std.domain} <span style={{ color: T.orange, fontWeight: 700 }}>{x.m}%</span></div>)}</div>
        </div>
        {Object.entries(r.subjects).map(([s, list]) => {
          const avg = Math.round(list.reduce((a, x) => a + x.m, 0) / list.length);
          const meta = SUBJ_LABEL[s as Subject]!; const b = bandFor(avg);
          return (
            <div key={s} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ fontWeight: 700 }}>{meta.label}</span><span style={{ color: b.color, fontWeight: 700 }}>{b.label} · {avg}%</span></div>
              <Bar value={avg} color={b.color} />
            </div>
          );
        })}
        <div style={{ marginTop: 14 }}>
          <Eyebrow>Teacher note (editable)</Eyebrow>
          <textarea value={note} onChange={e => setComment(e.target.value)} rows={3} style={{ ...selStyle, resize: 'vertical' }} />
        </div>
      </div>
    </div>
  );
};

// ── 4. Integrations (Phase 5) ────────────────────────────────────────────────────
const STATUS_META: Record<IntegrationStatus, { label: string; color: string }> = {
  live: { label: 'Live', color: T.green }, scaffolded: { label: 'Adapter ready', color: T.gold }, planned: { label: 'Planned', color: T.muted },
};
const Integrations: React.FC = () => {
  const [imported, setImported] = useState<{ framework: string; count: number; sample: string[] } | null>(null);
  const runImport = () => {
    const r = importCASEFramework(SAMPLE_CASE);
    setImported({ framework: r.framework, count: r.count, sample: r.standards.slice(0, 3).map(s => `${s.code} — ${s.statement.slice(0, 48)}…`) });
  };
  return (
    <div>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
        <Eyebrow>Connect your district · sit beside the LMS, own the longitudinal record</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 6 }}>
          {INTEGRATIONS.map(it => { const sm = STATUS_META[it.status]; return (
            <div key={it.id} style={{ ...cardStyle, padding: 13, background: T.cardAlt }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{it.name}</span>
                <span style={{ fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: sm.color, border: `1px solid ${sm.color}`, borderRadius: 99, padding: '2px 7px' }}>{sm.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>{it.desc}</div>
            </div>
          ); })}
        </div>
      </div>
      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow color={T.green}>CASE framework import · live</Eyebrow>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>Ingest any standards framework as machine-readable CASE data into Plajah's standards graph — this is how the ledger stays current across states and countries. Try it with a sample framework:</div>
        <button onClick={runImport} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#0a0a0f', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}><Download size={14} /> Import sample CASE framework</button>
        {imported && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: T.cardAlt, border: `1px solid ${T.green}` }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>✓ Imported “{imported.framework}” — {imported.count} standards</div>
            {imported.sample.map((s, i) => <div key={i} style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>{s}</div>)}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 5. Learning Context (Phase 7) ────────────────────────────────────────────────
const ContextSettings: React.FC = () => {
  const [ctx, setCtx] = useState<LearningContextSettings>(DEFAULT_CONTEXT);
  return (
    <div>
      <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
        <Eyebrow>Learning context · one ledger, every setting</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 6 }}>
          {ORG_TYPES.map(o => (
            <button key={o.id} onClick={() => setCtx(c => ({ ...c, orgType: o.id }))} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: 12, background: ctx.orgType === o.id ? 'rgba(255,140,0,0.1)' : T.cardAlt, borderColor: ctx.orgType === o.id ? T.orange : T.border }}>
              <div style={{ fontSize: 18 }}>{o.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginTop: 3 }}>{o.label}{o.native && <span style={{ fontSize: 8, color: T.green, marginLeft: 5, fontWeight: 800 }}>NATIVE</span>}</div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, lineHeight: 1.35 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ ...cardStyle, padding: 16 }}>
        <Eyebrow>Curriculum overlay · public standards, your tradition</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 6 }}>
          {FRAMEWORK_OVERLAYS.map(o => (
            <button key={o.id} onClick={() => setCtx(c => ({ ...c, overlayId: o.id }))} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: 12, background: ctx.overlayId === o.id ? 'rgba(129,102,230,0.1)' : T.cardAlt, borderColor: ctx.overlayId === o.id ? T.violet : T.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 16 }}>{o.icon}</span><span style={{ fontWeight: 800, fontSize: 13 }}>{o.label}</span><span style={{ fontSize: 8, color: T.muted, textTransform: 'uppercase', fontWeight: 800 }}>{o.mode}</span></div>
              <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Homeschool & pods are <b style={{ color: T.muted }}>native</b> org types here — the learner-owned ledger spans families and rotating parent-teachers, and graduates with the student into university and work.</div>
      </div>
    </div>
  );
};

export default TeacherToolsView;
