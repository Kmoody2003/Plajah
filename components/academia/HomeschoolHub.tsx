import React, { useEffect, useMemo, useState } from 'react';
import { Home, Plus, Download, Printer, Settings2, Check } from 'lucide-react';
import { listChildProfiles, createChildProfile } from '../../services/backendService';
import { loadHomeschool, saveHomeschool, emptyDoc, weekKey, totalMinutesBySubject, hoursCsv, DEFAULT_SUBJECTS, type HomeschoolDoc } from '../../services/homeschoolService';
import { loadMastery, rollup, type SkillMap } from '../../services/mastery';
import { COURSES } from '../../services/courseCatalog';
import { describeProfile, usesScripture } from '../../services/schoolProfile';
import { useSchoolProfile } from '../../hooks/useSchoolProfile';
import SchoolSetupSheet from './SchoolSetupSheet';
import DailyScripture from './DailyScripture';
import EduFeedPanel from './EduFeedPanel';

/**
 * Home school hub. For a family where the parent is the teacher: plan the week by child, log hours,
 * keep a portfolio, and print a record. It rides on the same Learn map, Reading Room and mastery
 * data as every other school, so a home school gets the full curriculum, not a lesser one.
 * Plajah does not decide what a state requires; the record is yours to adapt.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SUBJECT_GO: Record<string, string> = { 'Math': 'LEARN', 'Reading & Language': 'LANGUAGE_ARTS_SCHOOL', 'Science': 'LEARN', 'History & Civics': 'LEARN', 'Arts & Music': 'LEARN', 'Money & Business': 'MONEY_SCHOOL' };
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => Math.random().toString(36).slice(2, 10);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const Tab: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={`px-4 py-2 rounded-full text-[12px] font-black uppercase tracking-wider ${on ? 'bg-white text-[#12091b]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>{children}</button>
);
const inputCls = 'rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/35';

const HomeschoolHub: React.FC<Props> = ({ user, profile, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const { sp, configured, update } = useSchoolProfile(profile);
  const [setup, setSetup] = useState(false);
  const [kids, setKids] = useState<any[] | null>(null);
  const [sel, setSel] = useState('');
  const [data, setData] = useState<HomeschoolDoc>(emptyDoc());
  const [tab, setTab] = useState<'plan' | 'log' | 'portfolio' | 'record'>('plan');
  const [mastery, setMastery] = useState<SkillMap>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState(''); const [newYear, setNewYear] = useState('');
  const [msg, setMsg] = useState('');
  const wk = weekKey();

  useEffect(() => {
    let alive = true;
    loadHomeschool(uid).then(d => alive && setData(d));
    (async () => { const k = uid ? await listChildProfiles(uid).catch(() => []) : []; if (alive) { setKids(k); setSel(s => s || k[0]?.uid || ''); } })();
    return () => { alive = false; };
  }, [uid]);
  useEffect(() => { if (sel) loadMastery(sel).then(setMastery).catch(() => {}); }, [sel]);

  const child = (kids || []).find(k => k.uid === sel);
  const persist = (d: HomeschoolDoc) => { setData(d); void saveHomeschool(d, uid); };
  const subjects = data.subjects[sel] || DEFAULT_SUBJECTS.slice(0, 5);
  const plan = data.plan[sel]?.[wk] || {};
  const minutes = useMemo(() => totalMinutesBySubject(data.hours, sel), [data.hours, sel]);

  const toggleCell = (subject: string, day: number) => {
    const row = [...(plan[subject] || Array(7).fill(false))]; row[day] = !row[day];
    persist({ ...data, plan: { ...data.plan, [sel]: { ...(data.plan[sel] || {}), [wk]: { ...plan, [subject]: row } } } });
  };
  const toggleSubject = (s: string) => persist({ ...data, subjects: { ...data.subjects, [sel]: subjects.includes(s) ? subjects.filter(x => x !== s) : [...subjects, s] } });

  const [hSubject, setHSubject] = useState(DEFAULT_SUBJECTS[0]); const [hMin, setHMin] = useState('45'); const [hDate, setHDate] = useState(today()); const [hNote, setHNote] = useState('');
  const addHours = () => { const m = parseInt(hMin, 10); if (!sel || !(m > 0)) return; persist({ ...data, hours: [...data.hours, { id: uuid(), childUid: sel, date: hDate, subject: hSubject, minutes: m, note: hNote.trim() || undefined }] }); setHNote(''); };
  const downloadCsv = () => {
    const blob = new Blob([hoursCsv(data.hours, child?.displayName || 'Student', sel)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(child?.displayName || 'student').replace(/\s+/g, '_')}_hours.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const [pTitle, setPTitle] = useState(''); const [pSubject, setPSubject] = useState(DEFAULT_SUBJECTS[0]); const [pNote, setPNote] = useState(''); const [pLink, setPLink] = useState('');
  const addPortfolio = () => { if (!sel || pTitle.trim().length < 2) return; persist({ ...data, portfolio: [...data.portfolio, { id: uuid(), childUid: sel, date: today(), subject: pSubject, title: pTitle.trim(), note: pNote.trim() || undefined, link: pLink.trim() || undefined }] }); setPTitle(''); setPNote(''); setPLink(''); };

  const courseRows = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const k of Object.keys(mastery)) { const g = k.startsWith('lesson:') ? k.split(':')[1] : k.startsWith('math:') ? `math-${k.split(':')[1]}` : k.startsWith('ctx:') ? 'ctx' : 'other'; (groups[g] ||= []).push(k); }
    return Object.entries(groups).map(([g, keys]) => {
      const c = COURSES.find(x => x.curriculumId === g || x.id === g || x.id === `math-${g.replace('math-', '')}`);
      const r = rollup(keys, mastery);
      return { id: g, title: c?.title || (g === 'ctx' ? 'Math in the Real World' : g.startsWith('math-') ? `Grade ${g.replace('math-g', '')} Math` : g), started: r.started, pct: r.pct, proficient: r.byLevel.proficient + r.byLevel.mastered };
    }).sort((a, b) => b.started - a.started);
  }, [mastery]);

  const printRecord = () => {
    if (!child) return;
    const hrs = Object.entries(minutes).map(([s, m]) => `<tr><td>${esc(s)}</td><td>${(m / 60).toFixed(1)}</td></tr>`).join('');
    const crs = courseRows.map(c => `<tr><td>${esc(c.title)}</td><td>${c.started}</td><td>${c.proficient}</td><td>${c.pct}%</td></tr>`).join('');
    const port = data.portfolio.filter(p => p.childUid === sel).map(p => `<li><b>${esc(p.title)}</b> (${esc(p.subject)}, ${esc(p.date)})${p.note ? ` &mdash; ${esc(p.note)}` : ''}</li>`).join('');
    const w = window.open('', '_blank'); if (!w) { setMsg('Allow pop-ups to print the record.'); return; }
    w.document.write(`<!doctype html><title>Learning record: ${esc(child.displayName)}</title><style>body{font:14px system-ui;margin:40px;color:#111}h1{margin:0}table{border-collapse:collapse;width:100%;margin:8px 0 22px}td,th{border:1px solid #bbb;padding:6px 8px;text-align:left}small{color:#555}</style>
      <h1>${esc(sp.name || 'Home school')} &mdash; Learning record</h1><p><b>${esc(child.displayName)}</b> &middot; generated ${today()}${sp.region ? ` &middot; ${esc(sp.region)}` : ''}</p>
      <h2>Hours by subject</h2><table><tr><th>Subject</th><th>Hours</th></tr>${hrs || '<tr><td colspan=2>No hours logged yet</td></tr>'}</table>
      <h2>Courses on Plajah</h2><table><tr><th>Course</th><th>Skills started</th><th>Proficient or better</th><th>Average mastery</th></tr>${crs || '<tr><td colspan=4>No practice yet</td></tr>'}</table>
      <h2>Portfolio</h2><ul>${port || '<li>No work samples added yet</li>'}</ul>
      <p><small>Mastery comes from practice questions answered on Plajah. This record is a summary for your own files; check your state or country's requirements for what to keep and submit.</small></p>`);
    w.document.close(); w.print();
  };

  const addChild = async () => {
    if (!uid || newName.trim().length < 2) return;
    const by = parseInt(newYear, 10);
    const c = await createChildProfile(uid, { displayName: newName.trim(), birthYear: by > 1990 ? by : undefined });
    if (c) { setKids(k => [...(k || []), c]); setSel(c.uid); setAdding(false); setNewName(''); setNewYear(''); setMsg(`${c.displayName} was added.`); } else setMsg('Could not add a child right now.');
  };

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[#3FB98E]"><Home size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">{sp.name || 'Home school'}</span></div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">Your home school</h1>
            <p className="text-white/55 text-sm mt-1">{configured ? describeProfile(sp) : 'Plan the week, log your hours, keep a portfolio, and print a record.'}</p>
          </div>
          <button type="button" onClick={() => setSetup(true)} className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider hover:bg-white/10 inline-flex items-center gap-1.5"><Settings2 size={13} /> {configured ? 'Our school' : 'Set up your school'}</button>
        </div>

        {usesScripture(sp) && <DailyScripture school={sp} className="mt-5" />}

        <div className="flex flex-wrap items-center gap-2 mt-6 mb-5">
          {(kids || []).map(k => <button key={k.uid} type="button" aria-pressed={sel === k.uid} onClick={() => setSel(k.uid)} className={`rounded-full px-4 py-2 text-sm font-black border ${sel === k.uid ? 'bg-white text-[#12091b] border-white' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>{k.displayName}</button>)}
          <button type="button" onClick={() => setAdding(a => !a)} className="rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border border-dashed border-white/25 text-white/60 hover:bg-white/10 inline-flex items-center gap-1.5"><Plus size={13} /> Add a child</button>
          <span className="flex-1" />
          <button type="button" onClick={() => onNavigate('NOTES')} className="rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wider border border-white/20">Notebook</button>
          <button type="button" onClick={() => onNavigate('LEARN')} className="rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wider bg-[#3FB98E] text-black">Open the Learn map</button>
        </div>
        {adding && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-5 grid sm:grid-cols-[1fr_130px_auto] gap-3 items-end">
            <label className="grid gap-1 text-[11px] font-black text-white/60">First name<input value={newName} onChange={e => setNewName(e.target.value)} className={inputCls} /></label>
            <label className="grid gap-1 text-[11px] font-black text-white/60">Birth year<input value={newYear} inputMode="numeric" placeholder="2016" onChange={e => setNewYear(e.target.value)} className={inputCls} /></label>
            <button type="button" disabled={newName.trim().length < 2} onClick={addChild} className="rounded-full bg-[#3FB98E] text-black text-xs font-black px-5 py-2.5 disabled:opacity-50">Add child</button>
          </div>
        )}
        {msg && <p role="status" className="text-[12px] text-[#06D6A0] mb-3">{msg}</p>}

        {kids && kids.length === 0 && !adding && <p className="text-sm text-white/55 mb-6">Add your first learner to start planning.</p>}

        {child && (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              <Tab on={tab === 'plan'} onClick={() => setTab('plan')}>This week</Tab><Tab on={tab === 'log'} onClick={() => setTab('log')}>Hours</Tab>
              <Tab on={tab === 'portfolio'} onClick={() => setTab('portfolio')}>Portfolio</Tab><Tab on={tab === 'record'} onClick={() => setTab('record')}>Record</Tab>
            </div>

            {tab === 'plan' && (
              <section aria-label="Weekly plan">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr className="text-[10px] uppercase tracking-widest text-white/45"><th className="text-left p-3">{child.displayName}'s week</th>{DAYS.map(d => <th key={d} className="p-2">{d}</th>)}<th /></tr></thead>
                    <tbody>
                      {subjects.map(s => (
                        <tr key={s} className="border-t border-white/5">
                          <td className="p-3 font-bold">{s}</td>
                          {DAYS.map((_, i) => { const on = !!plan[s]?.[i]; return <td key={i} className="p-1 text-center"><button type="button" aria-label={`${s} ${DAYS[i]}`} aria-pressed={on} onClick={() => toggleCell(s, i)} className={`w-8 h-8 rounded-lg border ${on ? 'bg-[#3FB98E] border-[#3FB98E] text-black' : 'border-white/15 hover:bg-white/10'}`}>{on && <Check size={14} className="mx-auto" />}</button></td>; })}
                          <td className="p-2 text-right"><button type="button" onClick={() => onNavigate(SUBJECT_GO[s] || 'LEARN')} className="text-[11px] font-black text-white/60 hover:text-white underline underline-offset-2">Go</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-white/45 mt-3 mb-2">Subjects for {child.displayName}:</p>
                <div className="flex flex-wrap gap-1.5">{DEFAULT_SUBJECTS.map(s => <button key={s} type="button" aria-pressed={subjects.includes(s)} onClick={() => toggleSubject(s)} className={`px-3 py-1 rounded-full text-[11px] font-black ${subjects.includes(s) ? 'bg-white text-black' : 'bg-white/5 text-white/55'}`}>{s}</button>)}</div>
              </section>
            )}

            {tab === 'log' && (
              <section aria-label="Hours log">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid sm:grid-cols-[130px_1fr_90px_1.4fr_auto] gap-2 items-end mb-4">
                  <label className="grid gap-1 text-[11px] font-black text-white/60">Date<input type="date" value={hDate} onChange={e => setHDate(e.target.value)} className={inputCls} /></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60">Subject<select value={hSubject} onChange={e => setHSubject(e.target.value)} className={inputCls}>{DEFAULT_SUBJECTS.map(s => <option key={s}>{s}</option>)}</select></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60">Minutes<input value={hMin} inputMode="numeric" onChange={e => setHMin(e.target.value)} className={inputCls} /></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60">What you did<input value={hNote} onChange={e => setHNote(e.target.value)} placeholder="Fractions practice, read chapter 4..." className={inputCls} /></label>
                  <button type="button" onClick={addHours} className="rounded-full bg-[#3FB98E] text-black text-xs font-black px-5 py-2.5">Log</button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">{Object.entries(minutes).map(([s, m]) => <span key={s} className="text-[11px] font-black rounded-full bg-white/8 px-3 py-1">{s}: {(m / 60).toFixed(1)} h</span>)}</div>
                <div className="rounded-2xl border border-white/10 overflow-hidden">
                  {data.hours.filter(h => h.childUid === sel).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(h => (
                    <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 text-sm"><span className="w-24 text-white/50 text-[12px]">{h.date}</span><span className="font-bold flex-1 min-w-0 truncate">{h.subject}{h.note ? <span className="font-normal text-white/50"> · {h.note}</span> : ''}</span><span className="text-white/60">{h.minutes} min</span></div>
                  ))}
                  {data.hours.filter(h => h.childUid === sel).length === 0 && <p className="p-4 text-sm text-white/45">Nothing logged yet.</p>}
                </div>
                <button type="button" onClick={downloadCsv} className="mt-3 rounded-full border border-white/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider hover:bg-white/10 inline-flex items-center gap-1.5"><Download size={13} /> Download CSV</button>
              </section>
            )}

            {tab === 'portfolio' && (
              <section aria-label="Portfolio">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid sm:grid-cols-2 gap-2 mb-4">
                  <label className="grid gap-1 text-[11px] font-black text-white/60">Title<input value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="Volcano model, book report, science fair..." className={inputCls} /></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60">Subject<select value={pSubject} onChange={e => setPSubject(e.target.value)} className={inputCls}>{DEFAULT_SUBJECTS.map(s => <option key={s}>{s}</option>)}</select></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60 sm:col-span-2">Notes<input value={pNote} onChange={e => setPNote(e.target.value)} placeholder="What was learned, how it went" className={inputCls} /></label>
                  <label className="grid gap-1 text-[11px] font-black text-white/60 sm:col-span-2">Link to the work (optional)<input value={pLink} onChange={e => setPLink(e.target.value)} placeholder="A Tela document, video or photo link" className={inputCls} /></label>
                  <button type="button" onClick={addPortfolio} className="rounded-full bg-[#3FB98E] text-black text-xs font-black px-5 py-2.5 sm:col-span-2 justify-self-start">Add to portfolio</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {data.portfolio.filter(p => p.childUid === sel).sort((a, b) => b.date.localeCompare(a.date)).map(p => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="font-black">{p.title}</p><p className="text-[11px] text-white/45">{p.subject} · {p.date}</p>{p.note && <p className="text-[13px] text-white/70 mt-1">{p.note}</p>}{p.link && /^https?:\/\//.test(p.link) && <a href={p.link} target="_blank" rel="noreferrer noopener" className="text-[12px] text-[#7fe0bd] underline">Open the work</a>}</div>
                  ))}
                </div>
              </section>
            )}

            {tab === 'record' && (
              <section aria-label="Learning record">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden mb-4">
                  <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-white/45"><span>Course on Plajah</span><span>Started</span><span>Proficient+</span><span>Mastery</span></div>
                  {courseRows.map(c => <div key={c.id} className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-4 py-2.5 border-t border-white/5 text-sm"><span className="font-bold truncate">{c.title}</span><span>{c.started}</span><span>{c.proficient}</span><span>{c.pct}%</span></div>)}
                  {courseRows.length === 0 && <p className="p-4 text-sm text-white/45">Practice on the Learn map and it appears here.</p>}
                </div>
                <button type="button" onClick={printRecord} className="rounded-full bg-white text-black px-5 py-2.5 text-[12px] font-black inline-flex items-center gap-2"><Printer size={14} /> Print the record</button>
                <p className="text-[11px] text-white/40 mt-3 max-w-xl">This is a summary for your own files. Check your state or country's requirements for what to keep and what to submit; Plajah does not decide that for you.</p>
              </section>
            )}
          </>
        )}

        <div className="mt-10"><EduFeedPanel currentUser={user} profile={profile} eduRole="PARENT" onOpenFeed={() => onNavigate('EDU_SOCIAL')} /></div>
      </div>
      {setup && <SchoolSetupSheet initial={sp} onSave={update} onClose={() => setSetup(false)} />}
    </div>
  );
};

export default HomeschoolHub;
