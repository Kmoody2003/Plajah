/**
 * StemTrackView — Academia's K–12 STEM Track, built on Plajah Build.
 *
 *   MAP       the scope & sequence: four grade bands, every unit, its strands and standards
 *   UNITS     a unit and its lessons (components/stem/StemLessonReader) — each lesson opens a Build room
 *   PROJECTS  assignable Build project briefs with rubrics; teachers assign them to a real class through the
 *             ordinary assignment-template flow and grade them in the lesson grading panel
 *   WALL      published student builds (#stemschool) on the shared student wall
 *
 * Data: data/stem/*. Launch contract: services/stem/launch.ts. Classwork bridge: services/stem/classwork.ts.
 * Other surfaces open a tab here through openStemTrack().
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Map as MapIcon, Layers, Hammer, Users, Cpu, Atom, Cog, Sigma, ShieldAlert, Send, ChevronRight } from 'lucide-react';
import {
  STEM_BANDS, STEM_BAND_LABEL, STEM_PROJECTS, STEM_TRACK_META, STEM_COUNTS, unitsForBand, unitById, lessonById, projectById,
  type StemBand, type StemProject, type StemStrand, type StemUnit,
} from '../data/stem';
import { BUILD_ROOM_LABEL, openBuild, takePendingStemOpen, STEM_OPEN_EVENT, type StemOpen, type StemTab } from '../services/stem/launch';
import { projectSeed } from '../services/stem/classwork';
import StemLessonReader, { STEM_ACCENT, STEM_ACCENT_2 } from './stem/StemLessonReader';
import StemAssignPanel from './stem/StemAssignPanel';
import StudentWall from './StudentWall';

interface Props { onBack: () => void; onNavigate?: (view: string) => void; user?: any; profile?: any }

const STRAND: Record<StemStrand, { label: string; icon: React.ComponentType<{ size?: number }>; color: string }> = {
  science: { label: 'Science', icon: Atom, color: '#5fd1c2' },
  technology: { label: 'Technology', icon: Cpu, color: '#7aa7ff' },
  engineering: { label: 'Engineering', icon: Cog, color: '#F5B83D' },
  math: { label: 'Math', icon: Sigma, color: STEM_ACCENT_2 },
};
const KIND_LABEL: Record<StemUnit['kind'], string> = { 'electronics-math': 'Math through electronics', science: 'Science', engineering: 'Engineering', technology: 'Technology' };

const StrandDots: React.FC<{ strands: StemStrand[] }> = ({ strands }) => (
  <span className="inline-flex gap-1">{strands.map(s => { const S = STRAND[s]; const I = S.icon; return <span key={s} title={S.label} className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `${S.color}22`, color: S.color }}><I size={12} /></span>; })}</span>
);

const ProjectCard: React.FC<{ p: StemProject; user?: any; profile?: any; onNavigate?: (v: string) => void }> = ({ p, user, profile, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [assign, setAssign] = useState(false);
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" data-testid={`stem-project-${p.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white/55">
        <span>Grades {p.band}</span>·<span>{p.minutes >= 120 ? `${Math.round(p.minutes / 60)} h` : `${p.minutes} min`}</span>·<span style={{ color: '#5fd1c2' }}>{BUILD_ROOM_LABEL[p.launch.room]}</span>
      </div>
      <h3 className="text-lg font-black mt-1">{p.title}</h3>
      <p className="text-[14px] italic text-white/75 mt-1">{p.drivingQuestion}</p>
      <p className="text-[13.5px] text-white/70 mt-2 leading-relaxed">{p.brief}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => openBuild({ ...p.launch, lesson: p.id })} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider text-white" style={{ background: STEM_ACCENT }}><Hammer size={13} /> Open starter</button>
        <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-white/10">{open ? 'Hide brief' : 'Brief & rubric'}</button>
        <button onClick={() => setAssign(a => !a)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-white/10" data-testid="stem-assign"><Send size={13} /> Assign</button>
      </div>
      {assign && <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4"><StemAssignPanel seed={projectSeed(p)} user={user} profile={profile} onNavigate={onNavigate} /></div>}
      {open && (
        <div className="mt-4 space-y-3 text-[13.5px] text-white/80">
          <div><p className="font-black text-white">Deliverables</p><ul className="list-disc pl-5">{p.deliverables.map(d => <li key={d}>{d}</li>)}</ul></div>
          <div><p className="font-black text-white">Steps</p><ol className="list-decimal pl-5">{p.steps.map(s => <li key={s}>{s}</li>)}</ol></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead><tr><th className="text-left p-2 border-b border-white/10">Criterion</th>{p.rubric.criteria[0]?.levels.map(l => <th key={l.label} className="text-left p-2 border-b border-white/10">{l.label} · {l.points}</th>)}</tr></thead>
              <tbody>{p.rubric.criteria.map(c => <tr key={c.name}><td className="p-2 align-top font-bold">{c.name}</td>{c.levels.map(l => <td key={l.label} className="p-2 align-top text-white/65">{l.descriptor}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p><b>Support:</b> {p.differentiation.support} <b>Extension:</b> {p.differentiation.extension}</p>
          <p className="flex gap-2 text-amber-300/90"><ShieldAlert size={14} className="shrink-0 mt-0.5" /> {p.safety.note}</p>
        </div>
      )}
    </article>
  );
};

const StemTrackView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<StemTab>('MAP');
  const [band, setBand] = useState<StemBand>('6-8');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const counts = useMemo(STEM_COUNTS, []);

  useEffect(() => {
    const apply = (r: StemOpen | null) => {
      if (!r) return;
      const lesson = r.lessonId ? lessonById(r.lessonId) : undefined;
      const unit = lesson ? unitById(lesson.unitId) : r.unitId ? unitById(r.unitId) : undefined;
      const project = r.projectId ? projectById(r.projectId) : undefined;
      const b = (lesson?.band || unit?.band || project?.band || r.band) as StemBand | undefined;
      if (b && STEM_BANDS.includes(b)) setBand(b);
      if (unit) setUnitId(unit.id);
      setLessonId(lesson?.id || null);
      setTab(r.tab || (lesson || unit ? 'UNITS' : project ? 'PROJECTS' : 'MAP'));
    };
    apply(takePendingStemOpen());
    const on = () => apply(takePendingStemOpen());
    window.addEventListener(STEM_OPEN_EVENT, on);
    return () => window.removeEventListener(STEM_OPEN_EVENT, on);
  }, []);

  const units = unitsForBand(band);
  const unit = unitId ? unitById(unitId) : undefined;
  const lesson = lessonId ? lessonById(lessonId) : undefined;
  const openUnit = (u: StemUnit) => { setUnitId(u.id); setLessonId(null); setTab('UNITS'); };

  const TABS: Array<{ id: StemTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'MAP', label: 'Scope & sequence', icon: MapIcon },
    { id: 'UNITS', label: `Lessons (${counts.lessons})`, icon: Layers },
    { id: 'PROJECTS', label: `Build projects (${counts.projects})`, icon: Hammer },
    { id: 'WALL', label: 'Student builds', icon: Users },
  ];

  return (
    <div className="min-h-full bg-[#07100f] text-white pb-28" data-testid="stem-track">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white min-h-[44px]"><ArrowLeft size={16} /> Back</button>

        <header className="relative overflow-hidden rounded-3xl border border-[#0E8074]/40 mb-8 p-6 sm:p-10" style={{ background: 'radial-gradient(120% 140% at 0% 0%, #0E807455, transparent 55%), radial-gradient(90% 120% at 100% 100%, #F0603E33, transparent 60%), #0a1514' }}>
          <svg aria-hidden className="absolute right-0 top-0 h-full w-1/2 opacity-25" viewBox="0 0 400 240" preserveAspectRatio="xMaxYMid slice">
            <g fill="none" stroke="#5fd1c2" strokeWidth="2"><path d="M20 40h120v60h80v-40h160" /><path d="M40 200h100v-50h120v70h120" /><path d="M200 20v60" /><circle cx="140" cy="40" r="6" /><circle cx="220" cy="100" r="6" /><circle cx="260" cy="150" r="6" /><rect x="300" y="40" width="40" height="40" rx="6" /></g>
          </svg>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#5fd1c2]">Plajah Academia · K–12</p>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mt-2">The STEM Track</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">{STEM_TRACK_META.blurb}</p>
          <div className="mt-6 flex flex-wrap gap-6">
            {[[counts.units, 'Units'], [counts.lessons, 'Lessons'], [counts.projects, 'Build projects'], [counts.practice, 'Keyed practice']].map(([n, l]) => (
              <div key={l as string}><p className="text-3xl font-black tabular-nums">{n}</p><p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">{l}</p></div>
            ))}
          </div>
        </header>

        <nav className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(t => { const I = t.icon; const on = tab === t.id; return (
            <button key={t.id} onClick={() => setTab(t.id)} data-tab={t.id} className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 min-h-[44px] ${on ? 'text-white' : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'}`} style={on ? { background: STEM_ACCENT } : undefined}><I size={14} /> {t.label}</button>
          ); })}
        </nav>

        {tab !== 'WALL' && (
          <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar" role="tablist" aria-label="Grade band">
            {STEM_BANDS.map(b => (
              <button key={b} role="tab" aria-selected={band === b} onClick={() => { setBand(b); setUnitId(null); setLessonId(null); }} className={`rounded-2xl border px-4 py-2 text-left shrink-0 ${band === b ? 'border-[#5fd1c2] bg-[#0E8074]/25' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                <span className="block text-sm font-black">Grades {b}</span><span className="block text-[11px] text-white/55">{STEM_BAND_LABEL[b].split('· ')[1]}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'MAP' && (
          <div className="grid gap-3 md:grid-cols-2" data-testid="stem-map">
            {units.map(u => (
              <button key={u.id} onClick={() => openUnit(u)} className="group text-left rounded-3xl border border-white/10 bg-white/[0.03] p-5 hover:border-[#5fd1c2]/50 hover:bg-white/[0.05]">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white/50">
                  <span className="rounded-md bg-white/10 px-1.5 text-white">{u.n}</span>
                  <span style={{ color: u.kind === 'electronics-math' ? STEM_ACCENT_2 : '#5fd1c2' }}>{KIND_LABEL[u.kind]}</span>
                  <span>· {u.weeks} wk</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 ${u.status === 'complete' ? 'bg-[#0E8074]/40 text-[#9ff0e4]' : 'bg-white/10 text-white/55'}`}>{u.status === 'complete' ? `${u.lessons.length} lessons` : 'Outline'}</span>
                </div>
                <h3 className="text-[17px] font-black mt-2">{u.title}</h3>
                <p className="text-[13px] text-white/65 mt-1">{u.bigIdea}</p>
                <div className="mt-3 flex items-center justify-between"><StrandDots strands={u.strands} /><ChevronRight size={16} className="text-white/30 group-hover:text-white/70" /></div>
              </button>
            ))}
          </div>
        )}

        {tab === 'UNITS' && lesson && unit && (
          <StemLessonReader lesson={lesson} unitTitle={unit.title} onBack={() => setLessonId(null)} user={user} profile={profile} onNavigate={onNavigate} />
        )}
        {tab === 'UNITS' && !lesson && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <nav className="space-y-1.5" aria-label="Units">
              {units.map(u => (
                <button key={u.id} onClick={() => { setUnitId(u.id); setLessonId(null); }} className={`w-full text-left rounded-xl px-3 py-2 text-[13px] font-bold ${unit?.id === u.id ? 'bg-[#0E8074]/30 text-white' : 'text-white/70 hover:bg-white/5'}`}>
                  {u.n}. {u.title}{u.status === 'outline' && <span className="text-white/40 font-normal"> · outline</span>}
                </button>
              ))}
            </nav>
            {unit ? (
              <section className="space-y-4" data-testid="stem-unit">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                  <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: unit.kind === 'electronics-math' ? STEM_ACCENT_2 : '#5fd1c2' }}>{KIND_LABEL[unit.kind]} · Grades {unit.band} · {unit.weeks} weeks</p>
                  <h2 className="text-2xl font-black mt-1">{unit.title}</h2>
                  <p className="mt-2 text-[14px] text-white/75">{unit.bigIdea}</p>
                  <p className="mt-1 text-[14px] italic text-white/60">{unit.essentialQuestion}</p>
                  <p className="mt-3 text-[11.5px] text-white/45">{[...(unit.standards.ngss || []), ...(unit.standards.ccss || []).map(c => c.replace(/^CCSS\.MATH\.CONTENT\./, 'CCSS ')), ...(unit.standards.csta || []).map(c => `CSTA ${c}`)].join(' · ')}</p>
                </div>
                {unit.status === 'complete' ? unit.lessons.map((l, i) => (
                  <button key={l.id} onClick={() => setLessonId(l.id)} className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:border-[#5fd1c2]/50" data-testid="stem-lesson-row">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black" style={{ background: `${STEM_ACCENT}33` }}>{i + 1}</span>
                      <div className="flex-1"><p className="font-black">{l.title}</p><p className="text-[12.5px] text-white/60">{l.objectives[0]}</p></div>
                      <span className="hidden sm:inline text-[11px] font-black uppercase text-white/45">{BUILD_ROOM_LABEL[l.build.launch.room]}</span>
                      <ChevronRight size={16} className="text-white/30" />
                    </div>
                  </button>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/15 p-5 text-[13.5px] text-white/70">
                    <p className="font-black text-white mb-2">Planned lessons</p>
                    <ol className="list-decimal pl-5 space-y-1">{(unit.outline || []).map(t => <li key={t}>{t}</li>)}</ol>
                    <p className="mt-3 text-[12px] text-white/45">This unit is mapped in the scope & sequence; its lessons are being written next.</p>
                  </div>
                )}
                {unit.projectIds.length > 0 && (
                  <div className="space-y-3"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Unit project</p>
                    {unit.projectIds.map(id => projectById(id)).filter(Boolean).map(p => <ProjectCard key={p!.id} p={p!} user={user} profile={profile} onNavigate={onNavigate} />)}
                  </div>
                )}
              </section>
            ) : <p className="text-[14px] text-white/60">Pick a unit to see its lessons.</p>}
          </div>
        )}

        {tab === 'PROJECTS' && (
          <div className="grid gap-4 md:grid-cols-2">
            {STEM_PROJECTS.filter(p => p.band === band).map(p => <ProjectCard key={p.id} p={p} user={user} profile={profile} onNavigate={onNavigate} />)}
          </div>
        )}

        {tab === 'WALL' && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-white/65">Finished a build? Post a photo or your Plajah Build share link with <b className="text-white">#stemschool</b> to put it on the wall. Under-13 work is shared by a teacher or guardian.</p>
            <StudentWall tag="stemschool" title="STEM Track · Student builds" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StemTrackView;
