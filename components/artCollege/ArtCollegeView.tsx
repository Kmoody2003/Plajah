/**
 * ArtCollegeView — Plajah Art College: programs, catalog, lessons, studio, critique, portfolio, collections.
 *
 *   PROGRAMS     majors / minors / certificate with year-by-year plans and a live degree audit
 *   CATALOG      every course: scope & sequence (units), grading, prerequisites, portfolio piece
 *   LESSONS      the whole catalog in the shared SchoolView (progress + Academic Passport)
 *   STUDIO       hand in a unit's studio work, run its critique, self-score against the rubric
 *   CRITIQUE     the critique protocols, step by step
 *   PORTFOLIO    pieces, the four reviews, and the rubric
 *   COLLECTIONS  free search across every open museum collection (audience-gated)
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, BookOpen, Briefcase, Landmark, Layers, MessageSquare, Palette, Search } from 'lucide-react';
import {
  COURSES, PROGRAMS, CRITIQUE_FORMATS, RUBRICS, PORTFOLIO_REVIEWS, DEPT_LABEL, courseByCode, unitKey, critiqueFormat,
  type Course, type Dept, type Program,
} from '../../data/artCollege';
import { ART_COLLEGE_CURRICULUM } from '../../data/artCollege/curriculum';
import { loadProgress } from '../../services/schoolChassis';
import { audienceOf } from '../../services/artCollege/audience';
import {
  auditProgram, emptyState, loadStudio, meanScore, reviewPasses, saveStudio, courseComplete, unitsDone,
  type StudioState,
} from '../../services/artCollege/studioStore';
import MuseumStudy from './MuseumStudy';

const SchoolView = lazy(() => import('../school/SchoolView'));
export const AC_ACCENT = '#E5B94E';

type Tab = 'PROGRAMS' | 'CATALOG' | 'LESSONS' | 'STUDIO' | 'CRITIQUE' | 'PORTFOLIO' | 'COLLECTIONS';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'PROGRAMS', label: 'Programs', icon: Award },
  { id: 'CATALOG', label: 'Catalog', icon: BookOpen },
  { id: 'LESSONS', label: 'Lessons', icon: Layers },
  { id: 'STUDIO', label: 'Studio', icon: Palette },
  { id: 'CRITIQUE', label: 'Critique', icon: MessageSquare },
  { id: 'PORTFOLIO', label: 'Portfolio', icon: Briefcase },
  { id: 'COLLECTIONS', label: 'Collections', icon: Landmark },
];

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] p-4';
const label = 'text-[10px] font-black uppercase tracking-[0.25em]';

const Pill: React.FC<{ on?: boolean; onClick?: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button onClick={onClick} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors"
    style={on ? { background: AC_ACCENT, color: '#000', borderColor: AC_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)' }}>{children}</button>
);

// ── Programs ──────────────────────────────────────────────────────────────────
const ProgramsTab: React.FC<{ completed: string[]; studio: StudioState; onPick: (id: string) => void; openCourse: (code: string) => void }> = ({ completed, studio, onPick, openCourse }) => {
  const [open, setOpen] = useState<string>(studio.programId || PROGRAMS[0].id);
  const p = PROGRAMS.find(x => x.id === open)!;
  const audit = auditProgram(p, completed);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">{PROGRAMS.map(x => <Pill key={x.id} on={x.id === open} onClick={() => setOpen(x.id)}>{x.title.replace('BFA ', '').replace('BA ', '')}{x.degree !== 'BFA' && x.degree !== 'BA' ? '' : ` · ${x.degree}`}</Pill>)}</div>
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black">{p.title}</h2>
            <p className="text-white/60 mt-2 leading-relaxed">{p.blurb}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums" style={{ color: AC_ACCENT }}>{audit.creditsEarned}<span className="text-white/35 text-lg"> / {p.credits}</span></p>
            <p className={`${label} text-white/40`}>credits earned</p>
            <button onClick={() => onPick(p.id)} className="mt-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
              style={studio.programId === p.id ? { border: `1px solid ${AC_ACCENT}`, color: AC_ACCENT } : { background: AC_ACCENT, color: '#000' }}>
              {studio.programId === p.id ? 'Your major' : p.degree === 'MINOR' ? 'Declare minor' : 'Declare'}
            </button>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-white/50"><b className="text-white/70">Capstone:</b> {p.capstone}</p>
        <p className="mt-1 text-[12px] text-white/50"><b className="text-white/70">Paths:</b> {p.careers.join(' · ')}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {p.years.map(y => (
          <div key={y.year} className={card}>
            <p className={label} style={{ color: AC_ACCENT }}>{p.degree === 'MINOR' || p.degree === 'CERTIFICATE' ? y.label : `Year ${y.year} · ${y.label}`}</p>
            <ul className="mt-3 space-y-1.5">
              {y.courses.map(code => {
                const c = courseByCode(code)!;
                const st = courseComplete(c, completed) ? 'done' : unitsDone(c, completed) ? 'started' : audit.available.includes(code) ? 'open' : 'locked';
                return (
                  <li key={code}>
                    <button onClick={() => openCourse(code)} className="w-full text-left flex items-center gap-2 text-[13px] hover:text-white">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st === 'done' ? '#2bd67a' : st === 'started' ? AC_ACCENT : st === 'open' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }} />
                      <span className="font-mono text-white/45 w-16 shrink-0">{code}</span>
                      <span className="text-white/80">{c.title}</span>
                      <span className="ml-auto text-white/30 text-[11px]">{c.credits}cr</span>
                    </button>
                  </li>
                );
              })}
              {y.electives > 0 && <li className="text-[12px] text-white/40 italic">+ {y.electives} open elective{y.electives > 1 ? 's' : ''} ({y.electives * 3} credits)</li>}
            </ul>
            {y.review && <p className="mt-3 text-[11px] text-white/45">Gate: <b>{PORTFOLIO_REVIEWS.find(r => r.id === y.review)!.title}</b></p>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Catalog ───────────────────────────────────────────────────────────────────
const CatalogTab: React.FC<{ completed: string[]; audience: 'adult' | 'minor'; focus?: string }> = ({ completed, audience, focus }) => {
  const [dept, setDept] = useState<Dept | 'ALL'>('ALL');
  const [level, setLevel] = useState<number | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(focus ?? null);
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);
  const depts = Array.from(new Set(COURSES.map(c => c.dept)));
  const list = COURSES.filter(c => (dept === 'ALL' || c.dept === dept) && (level === 'ALL' || c.level === level));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Pill on={dept === 'ALL'} onClick={() => setDept('ALL')}>All depts</Pill>
        {depts.map(d => <Pill key={d} on={dept === d} onClick={() => setDept(d)}>{DEPT_LABEL[d]}</Pill>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill on={level === 'ALL'} onClick={() => setLevel('ALL')}>All levels</Pill>
        {[100, 200, 300, 400].map(l => <Pill key={l} on={level === l} onClick={() => setLevel(l)}>{l}s</Pill>)}
      </div>
      <p className="text-[12px] text-white/40">{list.length} courses</p>
      {list.map(c => <CourseCard key={c.code} c={c} open={open === c.code} onToggle={() => setOpen(open === c.code ? null : c.code)} completed={completed} audience={audience} />)}
    </div>
  );
};

const CourseCard: React.FC<{ c: Course; open: boolean; onToggle: () => void; completed: string[]; audience: 'adult' | 'minor' }> = ({ c, open, onToggle, completed, audience }) => (
  <div className={card} id={`course-${c.code.replace(' ', '-')}`}>
    <button onClick={onToggle} className="w-full text-left">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-[12px]" style={{ color: AC_ACCENT }}>{c.code}</span>
        <span className="text-lg font-black">{c.title}</span>
        <span className="text-[11px] text-white/40 ml-auto">{c.credits} cr · {c.units.length} units · {c.units.reduce((n, u) => n + u.weeks, 0)} wk · {unitsDone(c, completed)}/{c.units.length} done</span>
      </div>
      <p className="text-white/60 text-[13px] mt-1.5 leading-relaxed">{c.blurb}</p>
    </button>
    {open && (
      <div className="mt-4 space-y-4">
        <p className="text-[12px] text-white/50"><b className="text-white/70">Prerequisites:</b> {c.prereq.length ? c.prereq.join(', ') : 'none'} · <b className="text-white/70">Format:</b> {c.format} · <b className="text-white/70">Rubric:</b> {RUBRICS[c.rubric].title}</p>
        <p className="text-[12px] text-white/50"><b className="text-white/70">Grading:</b> {c.grading.map(g => `${g.label} ${g.pct}%`).join(' · ')}</p>
        <p className="text-[12px] text-white/50"><b className="text-white/70">Portfolio:</b> {c.portfolio}</p>
        {c.units.map((u, i) => (
          <div key={u.id} className="rounded-xl border border-white/8 p-3 bg-black/20">
            <p className="font-black text-[14px]">{i + 1}. {u.title} <span className="text-white/35 font-normal text-[12px]">· {u.weeks} wk{u.critique ? ` · ${critiqueFormat(u.critique).title.split(' (')[0]}` : ''}</span></p>
            <p className="text-[13px] text-white/65 mt-1.5 leading-relaxed">{u.teach}</p>
            <ul className="mt-2 text-[12px] text-white/55 list-disc pl-5">{u.outcomes.map(o => <li key={o}>{o}</li>)}</ul>
            <p className="mt-2 text-[12px] text-white/70"><b>Studio:</b> {u.studio.prompt}</p>
            {u.studio.alt && <p className="mt-1 text-[12px] text-white/45"><b>Alternative brief:</b> {u.studio.alt}</p>}
            {u.study?.length ? <MuseumStudy refs={u.study} audience={audience} accent={AC_ACCENT} /> : null}
          </div>
        ))}
        {c.resources?.length ? <p className="text-[12px] text-white/50">{c.resources.map(r => <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="underline mr-3">{r.label}</a>)}</p> : null}
      </div>
    )}
  </div>
);

// ── Studio ────────────────────────────────────────────────────────────────────
const StudioTab: React.FC<{ studio: StudioState; setStudio: (s: StudioState) => void; audience: 'adult' | 'minor' }> = ({ studio, setStudio, audience }) => {
  const [code, setCode] = useState('FND 101');
  const course = courseByCode(code)!;
  const [uid, setUid] = useState(course.units[0].id);
  useEffect(() => setUid(courseByCode(code)!.units[0].id), [code]);
  const unit = course.units.find(u => u.id === uid) ?? course.units[0];
  const key = unitKey(course, unit);
  const sub = studio.submissions[key];
  const rub = RUBRICS[course.rubric];
  const scores = studio.scores[key]?.scores ?? {};
  const fmt = unit.critique ? critiqueFormat(unit.critique) : null;
  const [note, setNote] = useState(''); const [link, setLink] = useState('');
  const [heard, setHeard] = useState(''); const [next, setNext] = useState('');
  useEffect(() => { setNote(sub?.note ?? ''); setLink(sub?.link ?? ''); }, [key]);
  const mean = meanScore(studio.scores[key]);
  const figureGated = !!unit.studio.figure && audience !== 'adult';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select aria-label="Course" value={code} onChange={e => setCode(e.target.value)} className="bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm">
          {COURSES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.title}</option>)}
        </select>
        <select aria-label="Unit" value={unit.id} onChange={e => setUid(e.target.value)} className="bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm">
          {course.units.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
        </select>
      </div>
      <div className={card}>
        <p className={label} style={{ color: AC_ACCENT }}>Studio brief</p>
        <p className="mt-2 text-[15px] leading-relaxed">{figureGated && unit.studio.alt ? unit.studio.alt : unit.studio.prompt}</p>
        <p className="mt-2 text-[12px] text-white/50"><b>Hand in:</b> {unit.studio.deliverable}</p>
        {figureGated && <p className="mt-2 text-[11px] text-white/45">This unit’s figure version is for verified adult learners; you have the alternative brief, which meets the same outcomes.</p>}
        <textarea aria-label="Process note" value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Process note: what you tried, what changed, what you would do next"
          className="mt-3 w-full bg-black/40 border border-white/15 rounded-lg p-3 text-sm" />
        <input aria-label="Link to work" value={link} onChange={e => setLink(e.target.value)} placeholder="Link to your photographed or exported work (optional)" className="mt-2 w-full bg-black/40 border border-white/15 rounded-lg p-3 text-sm" />
        <button onClick={() => setStudio({ ...studio, submissions: { ...studio.submissions, [key]: { unit: key, note, link: link || undefined, at: Date.now() } } })}
          className="mt-3 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest" style={{ background: AC_ACCENT, color: '#000' }}>{sub ? 'Update hand-in' : 'Hand in'}</button>
        {sub && <span className="ml-3 text-[11px] text-white/40">handed in {new Date(sub.at).toLocaleDateString()}</span>}
      </div>
      {unit.study?.length ? <MuseumStudy refs={unit.study} audience={audience} accent={AC_ACCENT} /> : null}
      {fmt && (
        <div className={card}>
          <p className={label} style={{ color: AC_ACCENT }}>Critique · {fmt.title}</p>
          <ol className="mt-3 space-y-1.5 text-[13px] text-white/70 list-decimal pl-5">{fmt.steps.map(s => <li key={s.label}><b>{s.label}.</b> {s.say}</li>)}</ol>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <input aria-label="What I heard" value={heard} onChange={e => setHeard(e.target.value)} placeholder="What I heard" className="bg-black/40 border border-white/15 rounded-lg p-2.5 text-sm" />
            <input aria-label="What I will change" value={next} onChange={e => setNext(e.target.value)} placeholder="What I will change" className="bg-black/40 border border-white/15 rounded-lg p-2.5 text-sm" />
          </div>
          <button disabled={!heard.trim()} onClick={() => { setStudio({ ...studio, crits: [{ id: `${Date.now()}`, unit: key, format: fmt.id, heard, next, at: Date.now() }, ...studio.crits] }); setHeard(''); setNext(''); }}
            className="mt-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border border-white/20 disabled:opacity-40">Log critique</button>
          {studio.crits.filter(c => c.unit === key).map(c => <p key={c.id} className="mt-2 text-[12px] text-white/55">{new Date(c.at).toLocaleDateString()} — heard: {c.heard}{c.next ? ` → will: ${c.next}` : ''}</p>)}
        </div>
      )}
      <div className={card}>
        <p className={label} style={{ color: AC_ACCENT }}>Self-assessment · {rub.title}{mean !== null ? ` · ${mean.toFixed(1)} / 4` : ''}</p>
        <div className="mt-3 space-y-3">
          {rub.criteria.map(cr => (
            <div key={cr.id}>
              <p className="text-[13px] font-bold">{cr.label}</p>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {[1, 2, 3, 4].map(n => (
                  <button key={n} title={cr.levels[n - 1]} aria-label={`${cr.label} ${n}`} onClick={() => setStudio({ ...studio, scores: { ...studio.scores, [key]: { rubric: rub.id, scores: { ...scores, [cr.id]: n }, at: Date.now() } } })}
                    className="w-9 h-9 rounded-lg text-sm font-black border" style={scores[cr.id] === n ? { background: AC_ACCENT, color: '#000', borderColor: AC_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)' }}>{n}</button>
                ))}
              </div>
              {scores[cr.id] ? <p className="text-[11px] text-white/45 mt-1">{cr.levels[scores[cr.id] - 1]}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Critique ──────────────────────────────────────────────────────────────────
const CritiqueTab: React.FC = () => (
  <div className="grid md:grid-cols-2 gap-4">
    {CRITIQUE_FORMATS.map(f => (
      <div key={f.id} className={card}>
        <p className="font-black">{f.title}</p>
        <p className="text-[12px] text-white/45 mt-0.5">{f.minutes} min · {f.bestFor}</p>
        <ol className="mt-3 space-y-1.5 text-[13px] text-white/70 list-decimal pl-5">{f.steps.map(s => <li key={s.label}><b>{s.label}.</b> {s.say}</li>)}</ol>
        <ul className="mt-3 text-[12px] text-white/50 list-disc pl-5">{f.ground.map(g => <li key={g}>{g}</li>)}</ul>
        {f.source && <a href={f.source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] underline text-white/45">{f.source.label}</a>}
      </div>
    ))}
  </div>
);

// ── Portfolio ─────────────────────────────────────────────────────────────────
const PortfolioTab: React.FC<{ studio: StudioState; setStudio: (s: StudioState) => void }> = ({ studio, setStudio }) => {
  const [title, setTitle] = useState(''); const [statement, setStatement] = useState(''); const [link, setLink] = useState('');
  const rub = RUBRICS.portfolio;
  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label} style={{ color: AC_ACCENT }}>Add a piece</p>
        <input aria-label="Piece title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="mt-2 w-full bg-black/40 border border-white/15 rounded-lg p-2.5 text-sm" />
        <textarea aria-label="Piece statement" value={statement} onChange={e => setStatement(e.target.value)} rows={3} placeholder="Statement: intention, process, what you would change" className="mt-2 w-full bg-black/40 border border-white/15 rounded-lg p-2.5 text-sm" />
        <input aria-label="Piece link" value={link} onChange={e => setLink(e.target.value)} placeholder="Link to image or page" className="mt-2 w-full bg-black/40 border border-white/15 rounded-lg p-2.5 text-sm" />
        <button disabled={!title.trim()} onClick={() => { setStudio({ ...studio, pieces: [{ id: `${Date.now()}`, title: title.trim(), statement, link: link || undefined, at: Date.now() }, ...studio.pieces] }); setTitle(''); setStatement(''); setLink(''); }}
          className="mt-3 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest disabled:opacity-40" style={{ background: AC_ACCENT, color: '#000' }}>Add to portfolio</button>
        <div className="mt-4 space-y-2">{studio.pieces.map(p => (
          <div key={p.id} className="rounded-xl border border-white/8 p-3 bg-black/20">
            <p className="font-bold text-[14px]">{p.title}</p>
            {p.statement && <p className="text-[12px] text-white/55 mt-1">{p.statement}</p>}
            {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] underline text-white/45">{p.link}</a>}
          </div>))}
          {!studio.pieces.length && <p className="text-[12px] text-white/40 italic">No pieces yet. Each course names the portfolio piece it leaves behind.</p>}
        </div>
      </div>
      {PORTFOLIO_REVIEWS.map(r => {
        const k = `review:${r.id}`; const set = studio.scores[k]; const sc = set?.scores ?? {};
        const m = meanScore(set);
        return (
          <div key={r.id} className={card}>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-black text-lg">{r.title}</p><span className="text-[12px] text-white/40">{r.when}</span>
              {set && m !== null && <span className="ml-auto text-[12px] font-black" style={{ color: reviewPasses(r.id, set) ? '#2bd67a' : '#ff8a73' }}>{m.toFixed(1)} · {reviewPasses(r.id, set) ? 'meets the bar' : 'below the bar'}</span>}
            </div>
            <p className="text-[12px] text-white/50 mt-2"><b className="text-white/70">Submit:</b> {r.submit.join(' · ')}</p>
            <p className="text-[12px] text-white/50 mt-1"><b className="text-white/70">The panel asks:</b> {r.panelAsks.join(' · ')}</p>
            <p className="text-[12px] text-white/50 mt-1"><b className="text-white/70">Bar:</b> {r.bar}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {rub.criteria.map(cr => (
                <div key={cr.id}><p className="text-[11px] text-white/55">{cr.label}</p>
                  <div className="flex gap-1">{[1, 2, 3, 4].map(n => (
                    <button key={n} aria-label={`${r.id} ${cr.label} ${n}`} onClick={() => setStudio({ ...studio, scores: { ...studio.scores, [k]: { rubric: 'portfolio', scores: { ...sc, [cr.id]: n }, at: Date.now() } } })}
                      className="w-7 h-7 rounded-md text-xs font-black border" style={sc[cr.id] === n ? { background: AC_ACCENT, color: '#000', borderColor: AC_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)' }}>{n}</button>))}
                  </div></div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Collections ───────────────────────────────────────────────────────────────
const CollectionsTab: React.FC<{ audience: 'adult' | 'minor' }> = ({ audience }) => {
  const [q, setQ] = useState('Hokusai');
  const [go, setGo] = useState('Hokusai');
  const refs = useMemo(() => [{ query: go, why: `Open-access objects matching “${go}” from the Met, the Art Institute of Chicago, Cleveland, the Smithsonian, Europeana and more.`, threeD: true }], [go]);
  return (
    <div>
      <form onSubmit={e => { e.preventDefault(); setGo(q.trim() || go); }} className="flex gap-2">
        <input aria-label="Search collections" value={q} onChange={e => setQ(e.target.value)} className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 text-sm" placeholder="Artist, object, technique, period…" />
        <button className="px-4 rounded-lg text-[11px] font-black uppercase tracking-widest flex items-center gap-2" style={{ background: AC_ACCENT, color: '#000' }}><Search size={14} /> Search</button>
      </form>
      <p className="text-[11px] text-white/40 mt-2">{audience === 'adult' ? 'College tier: unfiltered open-access results.' : 'Education-safe results only. Figure and nude studies are for verified adult learners.'}</p>
      <MuseumStudy refs={refs} audience={audience} accent={AC_ACCENT} />
    </div>
  );
};

// ── Shell ─────────────────────────────────────────────────────────────────────
interface Props { onBack?: () => void; onNavigate?: (view: string) => void; user?: any; profile?: any; initialTab?: Tab }

const ArtCollegeView: React.FC<Props> = ({ onBack, profile, initialTab }) => {
  const [tab, setTab] = useState<Tab>(initialTab ?? (new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('tab') as Tab) ?? 'PROGRAMS');
  const [completed, setCompleted] = useState<string[]>([]);
  const [studio, setStudioState] = useState<StudioState>(emptyState());
  const [focus, setFocus] = useState<string | undefined>();
  const audience = audienceOf(profile);

  useEffect(() => { let a = true; loadProgress(ART_COLLEGE_CURRICULUM.id).then(p => a && setCompleted(p)); loadStudio().then(s => a && setStudioState(s)); return () => { a = false; }; }, [tab === 'LESSONS']);
  const setStudio = (s: StudioState) => { setStudioState(s); void saveStudio(s); };
  const openCourse = (code: string) => { setFocus(code); setTab('CATALOG'); };
  const lessons = ART_COLLEGE_CURRICULUM.tracks.reduce((n, t) => n + t.lessons.length, 0);

  return (
    <div className="relative z-10 min-h-screen text-white pb-24" data-testid="art-college">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-6">
        {onBack && <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white mb-5"><ArrowLeft size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Back</span></button>}
        <p className={label} style={{ color: AC_ACCENT }}>Academia · College</p>
        <h1 className="font-black tracking-tight mt-1.5 leading-none" style={{ fontSize: 'clamp(2rem, 6vw, 3.1rem)' }}>Art College</h1>
        <p className="text-white/55 mt-3 max-w-3xl leading-relaxed">{ART_COLLEGE_CURRICULUM.blurb}</p>
        <p className="text-[12px] text-white/40 mt-2"><b>{PROGRAMS.length}</b> programs · <b>{COURSES.length}</b> courses · <b>{lessons}</b> units · museum study from the Met, Art Institute of Chicago, Cleveland, Smithsonian, Europeana and more</p>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border"
              style={tab === t.id ? { background: AC_ACCENT, color: '#000', borderColor: AC_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
              <t.icon size={13} />{t.label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {tab === 'PROGRAMS' && <ProgramsTab completed={completed} studio={studio} onPick={id => setStudio({ ...studio, programId: id })} openCourse={openCourse} />}
          {tab === 'CATALOG' && <CatalogTab completed={completed} audience={audience} focus={focus} />}
          {tab === 'LESSONS' && <Suspense fallback={null}><SchoolView curriculum={ART_COLLEGE_CURRICULUM} embedded audience={audience} /></Suspense>}
          {tab === 'STUDIO' && <StudioTab studio={studio} setStudio={setStudio} audience={audience} />}
          {tab === 'CRITIQUE' && <CritiqueTab />}
          {tab === 'PORTFOLIO' && <PortfolioTab studio={studio} setStudio={setStudio} />}
          {tab === 'COLLECTIONS' && <CollectionsTab audience={audience} />}
        </div>
      </div>
    </div>
  );
};

export default ArtCollegeView;
