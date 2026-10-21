import React, { useEffect, useState } from 'react';
import { MessageCircle, X, CalendarCheck, FileDown, Plug } from 'lucide-react';
import { createChatRoom } from '../../services/backendService';
import { loadStudentDossier, letterFor, scoreTone, type RosterStudent, type StudentDossier as Dossier, type WorkStatus } from '../../services/academiaDossier';
import type { AppStat } from '../../services/academiaStats';

/**
 * The teacher's overview of one student, opened in place from the Teacher Studio search.
 * Color-coded tiles, an 8-assignment grade trend against the class, the work ledger, ledger mastery
 * by subject, learning-app progress and the latest parent/student messages. All live data.
 */
interface Props { teacherUid: string; student: RosterStudent; onNavigate: (view: string) => void; onClose: () => void }

const STATUS: Record<WorkStatus, { label: string; color: string }> = {
  'on-time': { label: 'On time', color: '#06D6A0' }, late: { label: 'Late', color: '#F5B83D' },
  missing: { label: 'Missing', color: '#ff8aa3' }, 'to-grade': { label: 'To grade', color: '#c4b5fd' }, due: { label: 'Due', color: '#7BEAF7' },
};
const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
const ago = (t: number) => {
  const d = Math.round((Date.now() - t) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
};
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const goTool = (onNavigate: (v: string) => void, tab: string) => { try { sessionStorage.setItem('plajah:teacherTab', tab); } catch { /* private mode */ } onNavigate('TEACHER_TOOLS'); };

const Tile: React.FC<{ label: string; value: string; sub: string; color: string }> = ({ label, value, sub, color }) => (
  <div className="rounded-2xl p-4 border" style={{ background: `${color}14`, borderColor: `${color}47` }}>
    <p className="text-[12px] font-semibold text-white/70">{label}</p>
    <p className="text-[32px] font-black leading-tight mt-1" style={{ color, fontFamily: 'Outfit, system-ui' }}>{value}</p>
    <p className="text-[12px] text-white/60">{sub}</p>
  </div>
);
const Panel: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <div className={`rounded-[22px] bg-white/[0.03] border border-white/[0.08] p-5 min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-[15px] font-bold">{title}</h3>{right}</div>
    {children}
  </div>
);

const TrendChart: React.FC<{ trend: Dossier['trend']; classAvg: number | null; color: string; name: string }> = ({ trend, classAvg, color, name }) => {
  if (trend.length < 2) return <p className="text-[13px] text-white/55 py-6">The trend appears after two graded assignments.</p>;
  const W = 560, H = 190, x0 = 34, x1 = 548, yOf = (v: number) => 150 - (Math.max(40, v) - 40) * 2.17;
  const pts = trend.map((p, i) => ({ x: x0 + i * ((x1 - x0) / (trend.length - 1)), y: yOf(p.pct), p }));
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${name}'s last ${trend.length} graded scores, from ${trend[0].pct}% to ${trend[trend.length - 1].pct}%`}>
      {[40, 60, 80, 100].map(v => (
        <g key={v}><line x1={x0} x2={x1} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.07)" /><text x={0} y={yOf(v) + 4} fill="rgba(255,255,255,0.55)" fontSize={11} fontFamily="JetBrains Mono">{v}</text></g>
      ))}
      {classAvg != null && <line x1={x0} x2={x1} y1={yOf(classAvg)} y2={yOf(classAvg)} stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeDasharray="5 6" />}
      <polygon points={`${x0},150 ${line} ${x1},150`} fill={`${color}26`} />
      <polyline className="dossier-draw" points={line} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}><circle cx={p.x} cy={p.y} r={4.5} fill="#101017" stroke={color} strokeWidth={2.5} /><text x={p.x} y={178} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={11} fontFamily="JetBrains Mono">{fmtDate(p.p.at)}</text></g>
      ))}
    </svg>
  );
};

const Donut: React.FC<{ parts: Array<{ label: string; n: number; color: string }>; center: string }> = ({ parts, center }) => {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1, C = 2 * Math.PI * 54;
  let cum = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={parts.map(p => `${p.n} ${p.label}`).join(', ')}>
        <circle cx={70} cy={70} r={54} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={18} />
        {parts.map(p => { const len = (p.n / total) * C; const el = <circle key={p.label} cx={70} cy={70} r={54} fill="none" stroke={p.color} strokeWidth={18} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-cum} transform="rotate(-90 70 70)" />; cum += len; return el; })}
        <text x={70} y={68} textAnchor="middle" fill="#F4F2F7" fontFamily="Outfit" fontWeight={900} fontSize={26}>{center}</text>
        <text x={70} y={88} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={11}>turned in</text>
      </svg>
      <div className="flex flex-col gap-2 text-[13px]">
        {parts.map(p => <div key={p.label} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: p.color }} /><span className="text-white/75">{p.label}</span><span className="font-bold ml-auto pl-3">{p.n}</span></div>)}
      </div>
    </div>
  );
};

const AppRow: React.FC<{ name: string; stat?: AppStat; color: string }> = ({ name, stat, color }) => (
  <div className="flex items-center gap-3">
    <span className="w-9 h-9 rounded-[10px] grid place-items-center text-[13px] font-black shrink-0" style={{ background: `${color}24`, color }}>{name.slice(0, 2)}</span>
    <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold">{name}</span><span className="block text-[12px] text-white/60 truncate">{stat?.started ? stat.detail : 'Not started yet'}</span></span>
    <span className="font-mono font-bold text-[13px] whitespace-nowrap" style={{ color }}>{stat?.started ? stat.headline : '—'}</span>
  </div>
);

const StudentDossier: React.FC<Props> = ({ teacherUid, student, onNavigate, onClose }) => {
  const [d, setD] = useState<Dossier | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true; setD(null);
    loadStudentDossier(teacherUid, student, teacherUid).then(x => alive && setD(x)).catch(() => alive && setErr('Could not load this dossier right now.'));
    return () => { alive = false; };
  }, [teacherUid, student.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = student.name.split(' ')[0];
  const tone = scoreTone(d?.gradePct ?? null);
  const flag = !d ? null : d.counts.missing >= 3 || (d.gradePct != null && d.gradePct < 70) ? { t: 'Needs support', c: '#FFB266' }
    : d.trend.length >= 3 && d.trend[d.trend.length - 1].pct - d.trend[0].pct >= 8 ? { t: 'Rising', c: '#00DAF3' } : { t: 'On track', c: '#06D6A0' };
  const message = async (other?: string) => {
    if (!other) return;
    try { await createChatRoom([teacherUid, other], 'PRIVATE'); onNavigate('CHAT'); } catch { setErr('Could not open that conversation right now.'); }
  };

  return (
    <section aria-labelledby="dossier-h" className="mt-8 rounded-[30px] border border-white/[0.12] bg-[#101017] overflow-hidden" style={{ animation: 'dossierRise .5s cubic-bezier(.2,.8,.2,1) both' }}>
      <style>{`@keyframes dossierRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.dossier-draw{stroke-dasharray:1400;stroke-dashoffset:1400;animation:dossierDraw 1.6s cubic-bezier(.3,.7,.2,1) forwards}@keyframes dossierDraw{to{stroke-dashoffset:0}}`}</style>
      <div className="px-4 sm:px-9 py-6 sm:py-7 border-b border-white/[0.08]" style={{ background: `radial-gradient(120% 140% at 0% 0%, ${tone}29 0%, transparent 55%)` }}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            {student.photo
              ? <img src={student.photo} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-[20px] sm:rounded-[24px] object-cover shrink-0" />
              : <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[20px] sm:rounded-[24px] shrink-0 grid place-items-center text-[24px] sm:text-[28px] font-black text-[#0a0a0f]" style={{ background: tone, fontFamily: 'Outfit' }}>{initials(student.name)}</div>}
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/60">Student Dossier</p>
              <h2 id="dossier-h" className="text-[26px] sm:text-[32px] font-black leading-tight truncate" style={{ fontFamily: 'Outfit' }}>{student.name}</h2>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-white/70">
                {student.username && <span>@{student.username}</span>}
                <span>{student.classTitles.join(' · ')}</span>
                {flag && <span className="px-2.5 py-0.5 rounded-full text-[12px] font-bold border" style={{ color: flag.c, borderColor: flag.c }}>{flag.t}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {student.guardianUid && <button type="button" onClick={() => message(student.guardianUid)} className="min-h-[44px] px-4 rounded-xl bg-[#FF6FA8] text-[#0a0a0f] font-bold text-sm inline-flex items-center gap-2"><MessageCircle size={16} /> Message parent</button>}
            <button type="button" onClick={() => message(student.uid)} className="min-h-[44px] px-4 rounded-xl bg-[#00DAF3] text-[#0a0a0f] font-bold text-sm inline-flex items-center gap-2"><MessageCircle size={16} /> Message {first}</button>
            <button type="button" onClick={() => goTool(onNavigate, 'reports')} className="min-h-[44px] px-4 rounded-xl border border-white/20 font-semibold text-sm inline-flex items-center gap-2"><FileDown size={16} /> Progress report</button>
            <button type="button" onClick={onClose} aria-label="Close dossier" className="w-11 h-11 rounded-xl border border-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
      </div>

      {err && <p role="alert" className="px-9 pt-4 text-[13px] text-[#ff8aa3]">{err}</p>}
      {!d && !err && <p className="px-9 py-10 text-white/55 text-sm">Gathering {first}’s work, grades and messages…</p>}

      {d && (
        <div className="px-4 sm:px-9 py-6 flex flex-col gap-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
            <Tile label="Current grade" value={d.gradePct == null ? '—' : letterFor(d.gradePct)} sub={d.gradePct == null ? 'nothing graded yet' : `${d.gradePct}% across graded work`} color={tone} />
            <Tile label="Turned in" value={`${d.counts.turnedIn}/${d.counts.assigned}`} sub={`${d.counts.late} late`} color="#06D6A0" />
            <Tile label="Missing" value={String(d.counts.missing)} sub={d.counts.missing > 2 ? 'needs a follow-up' : 'past due, not handed in'} color={d.counts.missing > 2 ? '#ff8aa3' : '#F5B83D'} />
            <Tile label="Waiting on you" value={String(d.counts.toGrade)} sub="submitted, not graded" color="#c4b5fd" />
            <Tile label="Ledger mastery" value={d.ledgerOverall == null ? '—' : `${d.ledgerOverall}%`} sub="across every standard" color="#93C5FD" />
            <Tile label="Voca reading" value={d.apps?.voca.started ? d.apps.voca.headline : '—'} sub={d.apps?.voca.started ? d.apps.voca.detail.split(' · ')[0] : 'not started'} color="#00DAF3" />
          </div>

          <div className="acad-split flex flex-wrap gap-5">
            <Panel title="Grade trend" className="flex-[999_1_520px]" right={<span className="flex gap-3 text-[12px] text-white/70"><span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded" style={{ background: tone }} />{first}</span>{d.classAvg != null && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-white/50" />Class {d.classAvg}%</span>}</span>}>
              <TrendChart trend={d.trend} classAvg={d.classAvg} color={tone} name={first} />
            </Panel>
            <Panel title="Assignment status" className="flex-[1_1_280px]">
              <Donut center={d.counts.assigned ? `${Math.round((d.counts.turnedIn / d.counts.assigned) * 100)}%` : '—'} parts={[
                { label: 'On time', n: d.counts.turnedIn - d.counts.late - d.counts.toGrade, color: '#06D6A0' },
                { label: 'Late', n: d.counts.late, color: '#F5B83D' },
                { label: 'Missing', n: d.counts.missing, color: '#ff6b8a' },
                { label: 'To grade', n: d.counts.toGrade, color: '#a78bfa' },
              ]} />
            </Panel>
          </div>

          <div className="acad-split flex flex-wrap gap-5">
            <Panel title="Mastery by subject" className="flex-[1_1_340px]">
              {d.subjects.length === 0 && <p className="text-[13px] text-white/55">No ledger evidence yet. It grows as you grade work.</p>}
              <div className="flex flex-col gap-3">
                {d.subjects.map(s => (
                  <div key={s.subject}>
                    <div className="flex justify-between text-[13px] mb-1.5"><span className="text-white/80">{s.label} <span className="text-white/45">· {s.standards} standards</span></span><span className="font-mono font-bold" style={{ color: scoreTone(s.pct) }}>{s.pct}%</span></div>
                    <div className="h-2.5 rounded-md bg-white/[0.07] overflow-hidden"><div className="h-full rounded-md" style={{ width: `${s.pct}%`, background: scoreTone(s.pct) }} /></div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Learning apps" className="flex-[1_1_300px]">
              <div className="flex flex-col gap-3">
                <AppRow name="Voca" stat={d.apps?.voca} color="#00DAF3" />
                <AppRow name="Penna" stat={d.apps?.penna} color="#FF6FA8" />
                <AppRow name="Reading Quest" stat={d.apps?.reading} color="#F5B83D" />
                <AppRow name="Languages" stat={d.apps?.languages} color="#a78bfa" />
              </div>
            </Panel>
            <Panel title="Attendance" className="flex-[1_1_260px]">
              <div className="flex gap-3 items-start text-[13px] text-white/70 leading-relaxed">
                <CalendarCheck size={22} className="text-[#60A5FA] shrink-0 mt-0.5" />
                <span>Attendance isn’t connected to Academia yet. Link your school’s SIS to see days present, tardies and absences here.</span>
              </div>
              <button type="button" onClick={() => goTool(onNavigate, 'connect')} className="mt-3 min-h-[40px] px-3.5 rounded-[10px] border border-[#60A5FA]/50 text-[#93C5FD] text-[13px] font-bold inline-flex items-center gap-2"><Plug size={15} /> Open Integrations</button>
            </Panel>
          </div>

          <div className="acad-split flex flex-wrap gap-5">
            <Panel title="Work & grade history" className="flex-[999_1_560px]" right={<button type="button" onClick={() => goTool(onNavigate, 'grade')} className="text-[13px] font-semibold text-[#FFB266]">Open gradebook</button>}>
              {d.work.length === 0 ? <p className="text-[13px] text-white/55">Nothing assigned to {first} from your classes yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px] min-w-[520px] border-collapse">
                    <thead><tr className="text-left text-white/60 text-[12px]"><th className="py-2 px-1.5 font-semibold">Assignment</th><th className="py-2 px-1.5 font-semibold">Class</th><th className="py-2 px-1.5 font-semibold">Due</th><th className="py-2 px-1.5 font-semibold">Status</th><th className="py-2 px-1.5 font-semibold text-right">Score</th></tr></thead>
                    <tbody>
                      {d.work.map(w => (
                        <tr key={w.id} className="border-t border-white/[0.07]">
                          <td className="py-2.5 px-1.5 font-semibold">{w.title}</td>
                          <td className="py-2.5 px-1.5 text-white/70">{w.className}</td>
                          <td className="py-2.5 px-1.5 text-white/70 font-mono text-[13px]">{fmtDate(w.due)}</td>
                          <td className="py-2.5 px-1.5"><span className="px-2.5 py-0.5 rounded-full text-[12px] font-bold" style={{ color: STATUS[w.status].color, background: `${STATUS[w.status].color}1f` }}>{STATUS[w.status].label}</span></td>
                          <td className="py-2.5 px-1.5 text-right font-mono font-bold">{w.score == null ? '—' : `${w.score}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Messages · parent & student" className="flex-[1_1_360px]" right={<button type="button" onClick={() => onNavigate('CHAT')} className="text-[13px] font-semibold text-[#FFB266]">All threads</button>}>
              {d.messages.length === 0 && <p className="text-[13px] text-white/55">No conversations with {first} or their family yet.</p>}
              <div className="flex flex-col gap-2.5">
                {d.messages.map((m, i) => {
                  const c = m.mine ? '#FFB266' : m.with === 'guardian' ? '#FF6FA8' : '#00DAF3';
                  return (
                    <div key={i} className="px-3.5 py-3 rounded-2xl border" style={{ background: m.mine ? 'rgba(255,255,255,0.03)' : `${c}12`, borderColor: m.mine ? 'rgba(255,255,255,0.1)' : `${c}40` }}>
                      <div className="flex justify-between gap-2 text-[12px] mb-1"><span className="font-bold" style={{ color: c }}>{m.mine ? 'You' : `${m.who} · ${m.with === 'guardian' ? 'Parent' : 'Student'}`}</span><span className="text-white/55">{m.at ? ago(m.at) : ''}</span></div>
                      <p className="text-[14px] leading-snug text-white/90 line-clamp-3">{m.text}</p>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </section>
  );
};

export default StudentDossier;
