// LearnerLedgerView — the Academic Passport. One portable, learner-owned record that unifies
// every subject (Reading, Science, Math) into a single proficiency picture: where the learner
// stands locally and globally (PISA band), what competencies they've earned (exportable as
// verifiable credentials), and a timeline of recent ledger records. This is the centerpiece of
// the education vision — the record that follows the learner across schools, districts, and
// countries, anchored the same way the Creator Passport is.
//
// Loads the signed-in learner's real ledger (learnerProficiency + records). With no signed-in
// learner or no data yet, it shows a clearly-labeled DEMO record so the concept is always visible.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Globe2, Sparkles, ShieldCheck, Download } from 'lucide-react';
import { buildCredential, downloadCredential } from '../services/credentialService';
import {
  standardById, bandFor, masteryToLevel, masteryToPISABand, crosswalkOf,
  type Subject,
} from '../data/educationStandards';
import { loadProficiency, loadRecords, globalBenchmark, type LearningRecord } from '../services/learningLedgerService';

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#ffffff', muted: '#9a9aa6', faint: '#777', orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const SUBJECT_META: Partial<Record<Subject, { label: string; icon: string; color: string }>> = {
  ELA: { label: 'Reading & Language', icon: '📖', color: T.orange },
  SCIENCE: { label: 'Science', icon: '🔬', color: T.violet },
  MATH: { label: 'Mathematics', icon: '🔢', color: T.blue },
  // Flagship programs — see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md
  SOCIAL: { label: 'History & Social Studies', icon: '🏛️', color: '#FF8C00' },
  CIVICS: { label: 'Civics & Government', icon: '🗽', color: '#D40055' },
  ECON: { label: 'Economics', icon: '📈', color: '#3B82F6' },
  FINLIT: { label: 'Financial Literacy', icon: '💰', color: '#F59E0B' },
  REALESTATE: { label: 'Real Estate', icon: '🏘️', color: '#06D6A0' },
  PHILOSOPHY: { label: 'Philosophy', icon: '🦉', color: '#A78BFA' },
  ARTS: { label: 'Arts, Music & Media', icon: '🎼', color: '#00DAF3' },
};

// Labeled demo record so the passport is always demonstrable without auth/data.
const DEMO_BY_STANDARD: Record<string, number> = {
  'CCSS.ELA-LITERACY.RF.K.2': 88, 'CCSS.ELA-LITERACY.RF.1.3': 76, 'CCSS.ELA-LITERACY.L.4.4': 62, 'CCSS.ELA-LITERACY.RL.4.2': 54,
  'NGSS.K-LS1-1': 82, 'NGSS.4-PS3-2': 70, 'NGSS.3-LS1-1': 66, 'NGSS.MS-LS1-1': 48,
  'CCSS.MATH.3.OA': 91, 'CCSS.MATH.4.NF': 73, 'CCSS.MATH.5.NF': 58,
};
const DEMO_RECORDS: { standardId: string; source: string; delta: number }[] = [
  { standardId: 'CCSS.MATH.3.OA', source: 'math-classroom', delta: 8 },
  { standardId: 'NGSS.K-LS1-1', source: 'science-quest', delta: 6 },
  { standardId: 'CCSS.ELA-LITERACY.RF.K.2', source: 'reading-quest', delta: 6 },
  { standardId: 'CCSS.ELA-LITERACY.L.4.4', source: 'reading-quest', delta: 4 },
  { standardId: 'NGSS.4-PS3-2', source: 'science-quest', delta: 6 },
];

const SOURCE_LABEL: Record<string, string> = {
  'reading-quest': '📖 Reading Quest', 'science-quest': '🔬 Science Quest', 'math-classroom': '🔢 Math Classroom',
  'teacher-assessment': '🎓 Teacher', 'creative-artifact': '🎨 Creative work', 'import': '📥 Imported',
};

const cardStyle: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div style={{ height: 8, borderRadius: 99, background: '#000', overflow: 'hidden', border: `1px solid ${T.border}` }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, transition: 'width .5s ease' }} />
  </div>
);

const LearnerLedgerView: React.FC<{ onBack?: () => void; user?: any }> = ({ onBack, user }) => {
  const uid: string | null = user?.uid || null;
  const [byStandard, setByStandard] = useState<Record<string, number> | null>(null);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (uid) {
        const [p, recs] = await Promise.all([loadProficiency(uid), loadRecords(uid, 12)]);
        if (!alive) return;
        if (p && Object.keys(p.byStandard).length) { setByStandard(p.byStandard); setRecords(recs); setIsDemo(false); }
        else { setByStandard(DEMO_BY_STANDARD); setIsDemo(true); }
      } else { setByStandard(DEMO_BY_STANDARD); setIsDemo(true); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [uid]);

  if (loading || !byStandard) {
    return <div style={{ minHeight: '100%', background: T.bg, color: T.muted, display: 'grid', placeItems: 'center', fontFamily: T.font }}>Loading your record…</div>;
  }

  const prof = { studentId: uid || 'demo', byStandard, updatedAt: 0 };
  const bench = globalBenchmark(prof);
  const benchBand = bandFor(bench.overall);
  const learnerName = user?.displayName || 'You';

  // Group standards by subject.
  const subjects: Record<string, { id: string; m: number; domain: string }[]> = {};
  for (const [id, m] of Object.entries(byStandard)) {
    const std = standardById(id); if (!std) continue;
    (subjects[std.subject] ||= []).push({ id, m, domain: std.domain });
  }
  const subjectOrder = (Object.keys(subjects) as Subject[]).sort();

  // Earned competencies = standards at Advanced+ (85+).
  const competencies = Object.entries(byStandard)
    .filter(([, m]) => m >= 85)
    .map(([id, m]) => ({ id, m, std: standardById(id)! }))
    .filter(c => c.std)
    .sort((a, b) => b.m - a.m);

  const exportCred = async (standardId: string, mastery: number) => {
    const cred = await buildCredential({ learnerId: uid || 'demo', learnerName: user?.displayName, standardId, mastery, issuedAtISO: new Date().toISOString() });
    downloadCredential(cred, `plajah-credential-${standardId.replace(/[^a-z0-9]/gi, '')}.json`);
  };

  const recentRecords = records.length
    ? records.map(r => ({ standardId: r.standardId, source: r.source, delta: r.delta }))
    : DEMO_RECORDS;

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 70px', fontFamily: T.font }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        {/* Passport header */}
        <div style={{ ...cardStyle, marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(120deg, rgba(255,140,0,0.18), rgba(129,102,230,0.18), rgba(54,197,240,0.14))', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#000', display: 'grid', placeItems: 'center', border: `1px solid ${T.border}` }}><ShieldCheck size={28} color={T.gold} /></div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 800, color: T.gold }}>Plajah · Academic Passport</div>
              <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1, marginTop: 2 }}>{learnerName === 'You' ? 'Your Learner Ledger' : `${learnerName}'s Learner Ledger`}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>One portable record across every subject — yours, wherever you learn.</div>
            </div>
            {isDemo && <span style={{ background: '#111', color: T.gold, fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(255,210,74,0.4)' }}>DEMO RECORD</span>}
          </div>

          {/* Global standing */}
          <div style={{ padding: '18px 22px', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: benchBand.color, lineHeight: 1 }}>{bench.overall}<span style={{ fontSize: 16, color: T.muted }}>%</span></div>
              <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, fontWeight: 800, marginTop: 4 }}>Overall mastery</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: T.border }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe2 size={15} color={T.blue} /><span style={{ fontWeight: 800, fontSize: 15, color: benchBand.color }}>{benchBand.label}</span></div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>Global standing: <b style={{ color: T.ink }}>PISA band {bench.pisaBand}/6</b>. Mapped from internal mastery so it means something anywhere on Earth.</div>
            </div>
          </div>
        </div>

        {/* Subjects */}
        <Eyebrow color={T.muted}>By subject</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 22 }}>
          {subjectOrder.map(subj => {
            const meta = SUBJECT_META[subj] || { label: subj, icon: '•', color: T.muted };
            const items = subjects[subj];
            const avg = Math.round(items.reduce((a, x) => a + x.m, 0) / items.length);
            const b = bandFor(avg);
            // domain rollup
            const domains: Record<string, number[]> = {};
            items.forEach(x => { (domains[x.domain] ||= []).push(x.m); });
            const domainRows = Object.entries(domains).map(([d, ms]) => ({ d, m: Math.round(ms.reduce((a, n) => a + n, 0) / ms.length) }));
            return (
              <div key={subj} style={{ ...cardStyle, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>{meta.icon}</span><span style={{ fontWeight: 800, fontSize: 15 }}>{meta.label}</span></div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: b.color }}>{b.label} · {avg}%</span>
                </div>
                {domainRows.map(row => {
                  const rb = bandFor(row.m);
                  return (
                    <div key={row.d} style={{ marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: T.muted }}><span>{row.d}</span><span style={{ color: rb.color, fontWeight: 700 }}>{row.m}%</span></div>
                      <Bar value={row.m} color={rb.color} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Earned competencies */}
        <div style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <Eyebrow color={T.green}>Earned competencies</Eyebrow>
            <span style={{ fontSize: 10, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Sparkles size={12} color={T.gold} /> Exportable as Open Badges 3.0 / Verifiable Credentials</span>
          </div>
          {competencies.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13.5 }}>Reach Advanced (85%+) on a standard to earn a verifiable competency.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {competencies.map(c => {
                const cross = crosswalkOf(c.id);
                const b = bandFor(c.m);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10, flexWrap: 'wrap' }}>
                    <BadgeCheck size={18} color={b.color} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.std.statement}</div>
                      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{c.std.framework} · {c.std.code}{cross.length ? ` · also counts in ${cross.length} other framework${cross.length > 1 ? 's' : ''}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: b.color, whiteSpace: 'nowrap' }}>{b.label} · {c.m}%</span>
                    <button onClick={() => exportCred(c.id, c.m)} title="Export as a verifiable credential (Open Badges 3.0)" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.gold, fontSize: 10, fontWeight: 800 }}><Download size={12} /> Export</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
          <Eyebrow>Recent activity</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {recentRecords.map((r, i) => {
              const std = standardById(r.standardId);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '7px 0', borderBottom: i < recentRecords.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <span style={{ width: 130, flexShrink: 0, color: T.muted, fontSize: 11 }}>{SOURCE_LABEL[r.source] || r.source}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{std ? std.statement : r.standardId}</span>
                  {r.delta > 0 && <span style={{ color: T.green, fontWeight: 800, whiteSpace: 'nowrap' }}>▲ +{r.delta}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Portability footer */}
        <div style={{ ...cardStyle, padding: 16, borderColor: 'rgba(255,210,74,0.3)', background: 'rgba(255,210,74,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <ShieldCheck size={18} color={T.gold} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
              This record is <b style={{ color: T.ink }}>yours</b>. It follows you across schools, districts, and countries — preschool to university — and is anchored the same way your Creator Passport is. A verifiable transcript for any learner, anywhere.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearnerLedgerView;
