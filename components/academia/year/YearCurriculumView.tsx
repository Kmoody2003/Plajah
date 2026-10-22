// Year Curriculum — the teacher's whole school year of Math and ELA, K–8, day by day. Pick a grade and a day; see the
// lesson plan beside the worksheet exactly as Tela will print it; adapt it to a tier, a learning-support plan or a
// learner's interests; then open it in Tela, print it, export the week's packet or put it before the Education Council.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Calculator, Printer, PenTool, Landmark, Package, KeyRound, Sparkles, ChevronDown } from 'lucide-react';
import type { AdaptProfile, DayLesson, Tier, YearGrade, YearSubject } from '../../../services/yearCurriculum/types';
import { YEAR_GRADES, GRADE_LABEL, TIER_LABEL } from '../../../services/yearCurriculum/types';
import { expandYear, unitsFor, weekdayName } from '../../../services/yearCurriculum/yearPlan';
import { buildWorksheet } from '../../../services/yearCurriculum/worksheetBuilder';
import { worksheetToTela, lessonPlanToTela, PAGE_W, PAGE_H, type LaidPage } from '../../../services/yearCurriculum/telaWorksheet';
import { WORKSHEET_THEMES, themeById, ensureWorksheetFonts, WORKSHEET_FONT_HREF } from '../../../services/yearCurriculum/worksheetThemes';
import { PROFILE_PRESETS, profileFromPlan } from '../../../services/yearCurriculum/profiles';
import { applyFixes, type CouncilSession } from '../../../services/educationCouncil/deliberate';
import type { FixId } from '../../../services/educationCouncil/heuristics';
import { TelaStaticSvg } from '../../tela/TelaVector';
import EducationCouncilView from './EducationCouncilView';
import type { TelaDoc } from '../../../types';

interface Props { user?: { uid: string; displayName?: string | null } | null; onBack?: () => void; onNavigate?: (v: string) => void }

const SUPPORT_TOGGLES: Array<[keyof NonNullable<AdaptProfile['supports']>, string]> = [
  ['readQuestions', 'Read-aloud'], ['easyRead', 'Easier reading'], ['lineFocus', 'Line focus'], ['fewerChoices', 'Fewer choices'],
  ['chunk', 'Chunked'], ['untimed', 'Untimed'], ['calm', 'Calm page'], ['retryFree', 'Try-again boxes'],
];
const IDENTITY_TOGGLES: Array<[string, string]> = [['dyslexic', 'Dyslexic'], ['dyscalculic', 'Dyscalculia'], ['adhd', 'ADHD'], ['autistic', 'Autistic'], ['sensory', 'Sensory'], ['gifted', 'Gifted']];
const KIND_COLOR: Record<string, string> = { launch: '#00DAF3', learn: '#FF8C00', practice: '#F5B83D', review: '#06D6A0', assess: '#FF6FA8', project: '#c4b5fd' };

async function saveAndOpen(doc: TelaDoc) {
  const { saveTelaDoc } = await import('../../../services/telaStore');
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
}

function printPages(title: string) {
  const nodes = Array.from(document.querySelectorAll('[data-ws-page]')).map(n => n.innerHTML);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title.replace(/</g, '')}</title><link rel="stylesheet" href="${WORKSHEET_FONT_HREF}"><style>@page{size:letter;margin:0}body{margin:0}.pg{width:8.5in;height:11in;page-break-after:always;overflow:hidden}.pg svg{width:100%;height:100%}</style></head><body>${nodes.map(n => `<div class="pg">${n}</div>`).join('')}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`);
  w.document.close();
}

export default function YearCurriculumView({ user, onBack, onNavigate }: Props) {
  const [grade, setGrade] = useState<YearGrade>('g3');
  const [subject, setSubject] = useState<YearSubject>('math');
  const [day, setDay] = useState(1);
  const [profile, setProfile] = useState<AdaptProfile>({ tier: 'core' });
  const [themeId, setThemeId] = useState<string>('');
  const [showKey, setShowKey] = useState(false);
  const [interests, setInterests] = useState('');
  const [plans, setPlans] = useState<Array<{ id: string; name: string; profile: AdaptProfile }>>([]);
  const [councilOpen, setCouncilOpen] = useState(false);
  const [fixes, setFixes] = useState<FixId[]>([]);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { ensureWorksheetFonts(); }, []);
  useEffect(() => {
    if (!user?.uid) return;
    import('../../../services/learningSupport').then(m => m.listSharedPlans(user.uid)).then(ps => setPlans(ps.map(p => ({ id: p.learnerUid, name: p.learnerName || 'Learner', profile: profileFromPlan(p) })))).catch(() => {});
  }, [user?.uid]);

  const units = useMemo(() => unitsFor(grade, subject), [grade, subject]);
  const lessons = useMemo(() => expandYear(grade, subject), [grade, subject]);
  const lesson: DayLesson | undefined = lessons[Math.min(day, lessons.length) - 1];
  useEffect(() => { if (lesson) setOpenUnit(lesson.unitId); setFixes([]); }, [lesson?.unitId, grade, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullProfile = useMemo<AdaptProfile>(() => ({ ...profile, interests: interests.split(',').map(s => s.trim()).filter(Boolean) }), [profile, interests]);
  const worksheet = useMemo(() => {
    if (!lesson) return null;
    const ws = buildWorksheet(lesson, fullProfile, { themeId: themeId || undefined });
    return fixes.length ? applyFixes(ws, fixes, lesson) : ws;
  }, [lesson, fullProfile, themeId, fixes]);
  const laid = useMemo(() => (worksheet ? worksheetToTela(worksheet, { ownerId: user?.uid, now: 0 }) : null), [worksheet, user?.uid]);
  const pages: LaidPage[] = laid ? laid.pages.filter(p => showKey || !p.teacher) : [];

  const setTier = (tier: Tier) => setProfile(p => ({ ...p, tier }));
  const toggleSupport = (k: keyof NonNullable<AdaptProfile['supports']>) => setProfile(p => ({ ...p, supports: { ...(p.supports || {}), [k]: !(p.supports as any)?.[k] } }));
  const toggleIdentity = (id: string) => setProfile(p => ({ ...p, identities: (p.identities || []).includes(id) ? (p.identities || []).filter(x => x !== id) : [...(p.identities || []), id] }));

  const exportWeek = async () => {
    if (!lesson) return;
    setBusy('week');
    const weekLessons = lessons.filter(l => l.week === lesson.week);
    const docs = weekLessons.map(l => worksheetToTela(buildWorksheet(l, fullProfile, { themeId: themeId || undefined }), { ownerId: user?.uid }).doc);
    const merged: TelaDoc = { ...docs[0], id: `wk_${subject}_${grade}_${lesson.week}_${fullProfile.tier}`, title: `${GRADE_LABEL[grade]} ${subject === 'math' ? 'Math' : 'ELA'} · Week ${lesson.week} packet`, frames: [], devices: {} };
    let col = 0;
    docs.forEach((d, row) => { d.frames.forEach((f, i) => { merged.frames.push({ ...f, x: 80 + i * (PAGE_W + 80), y: 80 + row * (PAGE_H + 160) }); col = Math.max(col, i); }); Object.assign(merged.devices, d.devices); });
    await saveAndOpen(merged);
    setBusy('');
  };

  const weekRows = useMemo(() => {
    const out: Array<{ unitId: string; week: number; days: DayLesson[] }> = [];
    for (const l of lessons) { const last = out[out.length - 1]; if (last && last.week === l.week) last.days.push(l); else out.push({ unitId: l.unitId, week: l.week, days: [l] }); }
    return out;
  }, [lessons]);

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${on ? 'bg-[#F5B83D] text-black border-[#F5B83D]' : 'border-white/15 text-white/80 hover:bg-white/10'}`;
  const theme = worksheet ? themeById(worksheet.themeId) : null;
  const scale = 0.62;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/10 px-4 lg:px-6 py-3 flex flex-wrap items-center gap-3">
        {onBack && <button type="button" onClick={onBack} aria-label="Back" className="p-2 rounded-full hover:bg-white/10"><ArrowLeft size={18} /></button>}
        <div className="mr-2">
          <div className="text-[11px] tracking-[0.14em] uppercase text-[#F5B83D] font-bold">Academia · Year curriculum</div>
          <h1 className="text-[20px] font-black leading-tight" style={{ fontFamily: 'Outfit' }}>{GRADE_LABEL[grade]} {subject === 'math' ? 'Mathematics' : 'English Language Arts'}</h1>
        </div>
        <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
          {(['math', 'ela'] as YearSubject[]).map(s => (
            <button key={s} type="button" onClick={() => { setSubject(s); setDay(1); }} className={`px-3 py-1.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 ${subject === s ? 'bg-white text-black' : 'text-white/75'}`}>{s === 'math' ? <Calculator size={14} /> : <BookOpen size={14} />}{s === 'math' ? 'Math' : 'ELA'}</button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {YEAR_GRADES.map(g => <button key={g} type="button" onClick={() => { setGrade(g); setDay(1); }} className={chip(grade === g)}>{g === 'k' ? 'K' : g.slice(1)}</button>)}
        </div>
        <div className="ml-auto text-[12px] text-white/60">{units.length} units · 36 weeks · {lessons.length} lessons · CCSS + England, Cambridge, IB, Singapore</div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_360px] gap-4 p-4 lg:p-6">
        {/* Year map */}
        <nav aria-label="Year map" className="xl:max-h-[calc(100vh-110px)] xl:overflow-y-auto pr-1 space-y-2">
          {units.map(u => {
            const rows = weekRows.filter(r => r.unitId === u.id);
            const open = openUnit === u.id;
            return (
              <section key={u.id} className="rounded-2xl border border-white/10 bg-white/[0.03]">
                <button type="button" onClick={() => setOpenUnit(open ? null : u.id)} className="w-full text-left px-3 py-2.5 flex items-start gap-2">
                  <span className="mt-0.5 text-[11px] font-black text-black bg-[#F5B83D] rounded-md px-1.5">{u.n}</span>
                  <span className="flex-1"><span className="block text-[13.5px] font-bold leading-snug">{u.title}</span><span className="block text-[11.5px] text-white/55">Weeks {rows[0]?.week}–{rows[rows.length - 1]?.week} · {u.ccss.length} standards</span></span>
                  <ChevronDown size={16} className={`mt-1 transition ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-1.5">
                    <p className="text-[12px] text-white/70 italic">{u.essentialQuestion}</p>
                    {rows.map(r => (
                      <div key={r.week} className="flex items-center gap-1.5">
                        <span className="w-9 text-[11px] text-white/50">Wk {r.week}</span>
                        {r.days.map(d => (
                          <button key={d.id} type="button" title={`${weekdayName(d.day)} · ${d.title}`} onClick={() => setDay(d.dayOfYear)}
                            className={`flex-1 h-8 rounded-lg text-[10.5px] font-bold border ${d.dayOfYear === day ? 'ring-2 ring-white' : ''}`}
                            style={{ background: `${KIND_COLOR[d.kind]}22`, borderColor: `${KIND_COLOR[d.kind]}66`, color: KIND_COLOR[d.kind] }}>{weekdayName(d.day)}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-2 text-[11px] text-white/60">{Object.entries(KIND_COLOR).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{k}</span>)}</div>
        </nav>

        {/* Worksheet */}
        <main className="min-w-0">
          {lesson && worksheet && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[12px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${KIND_COLOR[lesson.kind]}22`, color: KIND_COLOR[lesson.kind] }}>Day {lesson.dayOfYear} · Week {lesson.week} {weekdayName(lesson.day)} · {lesson.kind}</span>
                <button type="button" disabled={day <= 1} onClick={() => setDay(d => Math.max(1, d - 1))} className="px-3 py-1 rounded-full border border-white/15 text-[12px] disabled:opacity-30">‹ Prev</button>
                <button type="button" disabled={day >= lessons.length} onClick={() => setDay(d => Math.min(lessons.length, d + 1))} className="px-3 py-1 rounded-full border border-white/15 text-[12px] disabled:opacity-30">Next ›</button>
                <span className="ml-auto" />
                <button type="button" onClick={() => setShowKey(k => !k)} className={chip(showKey)}><KeyRound size={13} className="inline -mt-0.5 mr-1" />Teacher key</button>
                <button type="button" onClick={() => laid && saveAndOpen(laid.doc)} className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-[#00DAF3] text-black inline-flex items-center gap-1.5"><PenTool size={13} />Open in Tela</button>
                <button type="button" onClick={() => printPages(worksheet.title)} className="px-3 py-1.5 rounded-full text-[12px] font-bold border border-white/20 inline-flex items-center gap-1.5"><Printer size={13} />Print</button>
                <button type="button" onClick={exportWeek} disabled={busy === 'week'} className="px-3 py-1.5 rounded-full text-[12px] font-bold border border-white/20 inline-flex items-center gap-1.5 disabled:opacity-50"><Package size={13} />{busy === 'week' ? 'Building…' : 'Week packet → Tela'}</button>
              </div>
              <div className="space-y-5 flex flex-col items-center">
                {pages.map(p => (
                  <div key={p.id} data-ws-page className="shadow-2xl rounded-sm overflow-hidden bg-white" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
                    <TelaStaticSvg objects={p.objects} width={PAGE_W} height={PAGE_H} style={{ width: '100%', height: '100%', display: 'block' }} />
                  </div>
                ))}
              </div>
            </>
          )}
        </main>

        {/* Plan + adapt */}
        <aside className="space-y-4 xl:max-h-[calc(100vh-110px)] xl:overflow-y-auto">
          {lesson && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#F5B83D] font-bold">{lesson.unitTitle}</div>
              <h2 className="text-[17px] font-black mt-1" style={{ fontFamily: 'Outfit' }}>{lesson.title}</h2>
              <p className="text-[13px] text-white/80 mt-1">{lesson.objective}</p>
              <dl className="mt-3 space-y-2 text-[12.5px]">
                {[['Warm-up', lesson.warmUp], ['I do', lesson.miniLesson.iDo], ['We do', lesson.miniLesson.weDo], ['You do', lesson.miniLesson.youDo], ['Discuss', lesson.discussion], ['Exit ticket', lesson.exitTicket]].map(([k, v]) => (
                  <div key={k}><dt className="text-white/50 font-semibold">{k}</dt><dd className="text-white/85">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-3 text-[11px] text-white/55 leading-relaxed">{lesson.ccss.join(' · ')}<br />{[lesson.intl.uk && `England ${lesson.intl.uk}`, lesson.intl.cambridge && `Cambridge ${lesson.intl.cambridge}`, lesson.intl.ib, lesson.intl.singapore && `Singapore ${lesson.intl.singapore}`].filter(Boolean).join(' · ')}</div>
              <button type="button" onClick={() => saveAndOpen(lessonPlanToTela(lesson, user?.uid))} className="mt-3 text-[12px] font-bold rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10">Lesson plan → Tela</button>
            </section>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-[14px] font-black inline-flex items-center gap-1.5"><Sparkles size={15} className="text-[#F5B83D]" />Adapt this worksheet</h3>
            <div className="flex gap-1 rounded-full bg-white/[0.06] p-1 w-fit">
              {(['support', 'core', 'stretch'] as Tier[]).map(t => <button key={t} type="button" onClick={() => setTier(t)} className={`px-3 py-1 rounded-full text-[12px] font-bold ${profile.tier === t ? 'bg-white text-black' : 'text-white/75'}`}>{TIER_LABEL[t]}</button>)}
            </div>
            <div>
              <div className="text-[11.5px] text-white/55 mb-1.5">Presets{plans.length ? ' and learners with shared plans' : ''}</div>
              <div className="flex flex-wrap gap-1.5">
                {PROFILE_PRESETS.map(p => <button key={p.id} type="button" onClick={() => setProfile(p.profile)} className={chip(false)}>{p.label}</button>)}
                {plans.map(p => <button key={p.id} type="button" onClick={() => setProfile(p.profile)} className={chip(false)}>👤 {p.name}</button>)}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-white/55 mb-1.5">Supports (from IEP / 504 / learning plans)</div>
              <div className="flex flex-wrap gap-1.5">{SUPPORT_TOGGLES.map(([k, l]) => <button key={k} type="button" onClick={() => toggleSupport(k)} className={chip(!!profile.supports?.[k])}>{l}</button>)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-white/55 mb-1.5">Learner profile</div>
              <div className="flex flex-wrap gap-1.5">{IDENTITY_TOGGLES.map(([k, l]) => <button key={k} type="button" onClick={() => toggleIdentity(k)} className={chip(!!profile.identities?.includes(k))}>{l}</button>)}</div>
            </div>
            <label className="block text-[11.5px] text-white/55">Interests (personalize story problems)
              <input value={interests} onChange={e => setInterests(e.target.value)} placeholder="soccer, space, cooking…" className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[13px] text-white" />
            </label>
            <label className="block text-[11.5px] text-white/55">Art direction (Art Council house styles)
              <select value={themeId} onChange={e => setThemeId(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[13px] text-white">
                <option value="">Unit default{theme && !themeId ? ` — ${theme.name}` : ''}</option>
                {WORKSHEET_THEMES.map(t => <option key={t.id} value={t.id}>{t.name} · {t.house.replace('_', ' ').toLowerCase()}{t.source === 'council' ? ' · council' : ''}</option>)}
              </select>
            </label>
            {theme && <p className="text-[11.5px] text-white/60 italic">{theme.note}</p>}
            {worksheet && worksheet.adaptations.length > 0 && (
              <ul className="text-[12px] text-white/80 space-y-1 list-disc pl-4">{worksheet.adaptations.map(a => <li key={a}>{a}</li>)}</ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#c4b5fd]/30 bg-[#c4b5fd]/[0.06] p-4">
            <h3 className="text-[14px] font-black inline-flex items-center gap-1.5"><Landmark size={15} className="text-[#c4b5fd]" />Education Council</h3>
            <p className="text-[12.5px] text-white/75 mt-1">Teachers, researchers, child psychologists, specialists and school leaders from six continents review this worksheet and propose fixes.</p>
            <button type="button" onClick={() => setCouncilOpen(true)} className="mt-3 px-4 py-2 rounded-full text-[12.5px] font-bold bg-[#c4b5fd] text-black">Convene on this worksheet</button>
            {fixes.length > 0 && <p className="text-[11.5px] text-white/65 mt-2">Applied: {fixes.join(', ')} · <button type="button" className="underline" onClick={() => setFixes([])}>undo</button></p>}
            {onNavigate && <button type="button" onClick={() => onNavigate('EDUCATION_COUNCIL')} className="mt-2 block text-[12px] underline text-white/70">Open the Commons</button>}
          </section>
        </aside>
      </div>

      {councilOpen && worksheet && (
        <div role="dialog" aria-modal="true" aria-label="Education Council" className="fixed inset-0 z-50 bg-black/70 flex justify-end" onClick={() => setCouncilOpen(false)}>
          <div className="w-full max-w-[720px] h-full overflow-y-auto bg-[#0d0d14] border-l border-white/10" onClick={e => e.stopPropagation()}>
            <EducationCouncilView embedded worksheet={worksheet} lesson={lesson} onClose={() => setCouncilOpen(false)}
              onApply={(s: CouncilSession) => { setFixes(f => [...new Set([...f, ...s.synthesis.fixes])]); setCouncilOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
