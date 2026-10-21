import React, { useEffect, useState } from 'react';
import { ArrowRight, Shuffle, Check, SlidersHorizontal } from 'lucide-react';
import { MEDIA_TOOLS, loadHiddenTools, saveHiddenTools } from './MediaToolsRow';
import {
  ACADEMIA_FACTS, ACADEMIA_EXHIBITS, ACADEMIA_SCHOOLS, LOREA_BANDS, STUDIO_COPY, goTo,
  type ShowcaseRole, type ReadingBand,
} from '../../data/academiaShowcase';

/**
 * The rich-media sections shared by the Teacher, Student and Parent homes: Did you know, exhibitions,
 * creative studios, the Lorea shelf and the flagship-curriculum showcase. One component per section,
 * each speaking to its role — teachers get the teaching use, students the way in, parents the
 * curiosity. Every card opens a real Plajah destination.
 */
type Nav = (view: string) => void;

/**
 * Responsive rules shared by the three homes. Phones and tablets are handled by the fluid grids
 * (every grid track is min(100%, N) so a 280px folded cover screen never scrolls sideways).
 * Dual-screen and foldable devices spanning two panes get `.acad-split` blocks laid out as two
 * columns with the hinge as the gap, so no card is cut in half by the fold.
 */
export const ACADEMIA_RESPONSIVE_CSS = `
@media (horizontal-viewport-segments: 2) {
  .acad-split { display: grid !important; grid-template-columns: 1fr 1fr; column-gap: calc(env(viewport-segment-left 1 0) - env(viewport-segment-right 0 0) + 24px) !important; align-items: start; }
  .acad-split > * { min-width: 0; }
}
@media (vertical-viewport-segments: 2) {
  .acad-fold-gap { margin-top: calc(env(viewport-segment-top 0 1) - env(viewport-segment-bottom 0 0) + 24px) !important; }
}
@media (max-width: 380px) {
  .acad-tight { padding-left: 12px !important; padding-right: 12px !important; }
}
`;
export const AcademiaResponsiveStyles: React.FC = () => <style>{ACADEMIA_RESPONSIVE_CSS}</style>;

const open = (onNavigate: Nav, view: string, event?: string) => {
  if (event) { try { window.dispatchEvent(new CustomEvent(event)); } catch { /* */ } return; }
  onNavigate(view);
};
const Head: React.FC<{ eyebrow: string; color: string; title: string; sub?: string; right?: React.ReactNode }> = ({ eyebrow, color, title, sub, right }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color }}>{eyebrow}</p>
      <h2 className="text-[26px] sm:text-[30px] font-black leading-tight mt-1" style={{ fontFamily: 'Outfit, system-ui' }}>{title}</h2>
      {sub && <p className="text-[14px] text-white/70 mt-1 max-w-3xl">{sub}</p>}
    </div>
    {right}
  </div>
);
const lift = 'transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_-16px_rgba(0,0,0,0.8)]';

// ── Did you know ──────────────────────────────────────────────────────────────────────────────
const FACT_COPY: Record<ShowcaseRole, { eyebrow: string; title: string; more: string }> = {
  teacher: { eyebrow: 'Did you know · lesson hooks', title: 'Facts from across Plajah, ready to teach', more: 'Show 3 more' },
  student: { eyebrow: 'Did you know?', title: 'Today’s wonders', more: 'Surprise me' },
  parent: { eyebrow: 'Just so you know', title: 'Little wonders from what they’re learning', more: 'Another one' },
};
export const DidYouKnow: React.FC<{ role: ShowcaseRole; onNavigate: Nav }> = ({ role, onNavigate }) => {
  const [at, setAt] = useState(() => Math.floor(Math.random() * ACADEMIA_FACTS.length));
  const shown = [0, 1, 2].map(i => ACADEMIA_FACTS[(at + i) % ACADEMIA_FACTS.length]);
  const c = FACT_COPY[role];
  return (
    <section className="mb-12" aria-label={c.title}>
      <Head eyebrow={c.eyebrow} color="#F5C987" title={c.title} right={
        <button type="button" onClick={() => setAt(a => (a + 3) % ACADEMIA_FACTS.length)} className="min-h-[44px] px-4 rounded-full border border-[#F5C987]/50 bg-[#F5C987]/10 text-[#F5C987] font-bold text-sm inline-flex items-center gap-2"><Shuffle size={15} /> {c.more}</button>
      } />
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
        {shown.map(f => (
          <article key={f.id} className={`rounded-3xl overflow-hidden border border-[#F5C987]/20 bg-[#14110c] flex flex-col ${lift}`}>
            <div className="relative h-40">
              <img src={f.img} alt="" loading="lazy" className="w-full h-full object-cover" />
              <span className="absolute left-3 top-3 px-2.5 py-1 rounded-full bg-black/75 text-[11px] font-black tracking-wide" style={{ color: f.color }}>{f.from}</span>
            </div>
            <div className="p-5 flex flex-col gap-3 flex-1">
              <p className="text-[18px] font-bold leading-snug" style={{ fontFamily: 'Outfit, system-ui' }}>{f.fact}</p>
              {role === 'teacher' && (
                <div className="mt-auto rounded-2xl px-3.5 py-3 bg-[#FF8C00]/[0.08] border border-[#FF8C00]/25">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#FFB266] mb-1">Teach it</p>
                  <p className="text-[14px] leading-snug text-white/85">{f.teach}</p>
                </div>
              )}
              {role === 'parent' && <p className="mt-auto text-[13px] leading-snug text-white/75"><strong className="text-[#FF9EC4]">Ask at dinner:</strong> {f.ask}</p>}
              <button type="button" onClick={() => goTo(onNavigate, f.to)} className="mt-auto self-start inline-flex items-center gap-1.5 text-[14px] font-black" style={{ color: f.color }}>
                {role === 'teacher' ? `Open ${f.from}` : f.go} <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

// ── Exhibitions & museums ─────────────────────────────────────────────────────────────────────
const EX_COPY: Record<ShowcaseRole, { title: string; sub: string }> = {
  teacher: { title: 'Field trips without the bus', sub: 'Historic science, archaeology, engineering, the arts and the new Exhibition Hall. Open one with your class or send it home as a visit.' },
  student: { title: 'Go explore', sub: 'Museums and exhibitions you can walk through right now.' },
  parent: { title: 'Explore together this weekend', sub: 'Every museum here is free to visit as a family.' },
};
export const ExhibitsRow: React.FC<{ role: ShowcaseRole; onNavigate: Nav }> = ({ role, onNavigate }) => {
  const c = EX_COPY[role];
  return (
    <section className="mb-12" aria-label={c.title}>
      <Head eyebrow="Exhibitions & museums" color="#93C5FD" title={c.title} sub={c.sub} />
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {ACADEMIA_EXHIBITS.map(e => (
          <button key={e.id} type="button" onClick={() => goTo(onNavigate, e.to)}
            className={`snap-start shrink-0 w-[270px] text-left rounded-3xl overflow-hidden border border-white/10 bg-[#0f1220] flex flex-col ${lift}`}>
            <span className="relative block h-40" style={{ background: e.bg || '#121a33' }}>
              {e.img ? <img src={e.img} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="absolute right-4 top-3 text-[72px] opacity-50" aria-hidden="true">💥</span>}
              <span className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-black/80 text-[11px] font-black" style={{ color: e.color }}>{e.kind}</span>
              {e.isNew && <span className="absolute right-3 top-3 px-2 py-0.5 rounded-full bg-white text-[#0a0a0f] text-[10px] font-black tracking-wider">NEW</span>}
            </span>
            <span className="p-4 flex flex-col gap-1.5 flex-1">
              <span className="text-[18px] font-black leading-tight" style={{ fontFamily: 'Outfit, system-ui' }}>{e.name}</span>
              <span className="text-[13px] leading-snug text-white/70">{role === 'teacher' ? e.teach : role === 'parent' ? e.family : e.hook}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

// ── Creative studios ──────────────────────────────────────────────────────────────────────────
const ST_COPY: Record<ShowcaseRole, { eyebrow: string; title: string; sub: string }> = {
  teacher: { eyebrow: 'Make & present', title: 'Let them show what they learned', sub: 'Use any studio as the format for an assignment. Switch tools off for your students with Choose tools below.' },
  student: { eyebrow: 'Make something', title: 'Show what you learned', sub: 'Turn your work into a book, a comic, a song or a show.' },
  parent: { eyebrow: 'Creative studios', title: 'Make something together', sub: 'The same studios your child uses at school, ready at home.' },
};
export const StudiosRow: React.FC<{ role: ShowcaseRole; onNavigate: Nav; prefsUid?: string }> = ({ role, onNavigate, prefsUid }) => {
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenTools(prefsUid));
  const [editing, setEditing] = useState(false);
  useEffect(() => { setHidden(loadHiddenTools(prefsUid)); }, [prefsUid]);
  const c = ST_COPY[role];
  const tools = editing ? MEDIA_TOOLS : MEDIA_TOOLS.filter(t => !hidden.includes(t.id));
  const toggle = (id: string) => { const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]; setHidden(next); saveHiddenTools(prefsUid, next); };
  return (
    <section className="mb-12" aria-label={c.title}>
      <Head eyebrow={c.eyebrow} color="#FF9EC4" title={c.title} sub={editing ? 'Tap a studio to show or hide it for your students.' : c.sub} right={role === 'teacher' && (
        <button type="button" onClick={() => setEditing(e => !e)} aria-pressed={editing} className="min-h-[44px] px-4 rounded-full border border-white/20 text-sm font-bold inline-flex items-center gap-2">
          {editing ? <><Check size={15} /> Done</> : <><SlidersHorizontal size={15} /> Choose tools</>}
        </button>
      )} />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
        {tools.map(t => (
          <button key={t.id} type="button" aria-pressed={editing ? !hidden.includes(t.id) : undefined} onClick={() => (editing ? toggle(t.id) : open(onNavigate, t.view || '', t.event))}
            className={`text-left rounded-[22px] p-4 border flex gap-3.5 items-start ${lift} ${editing && hidden.includes(t.id) ? 'opacity-40 border-dashed' : ''}`} style={{ background: `${t.accent}12`, borderColor: `${t.accent}40` }}>
            <span className="w-12 h-12 rounded-2xl grid place-items-center text-2xl shrink-0" style={{ background: `${t.accent}26` }} aria-hidden="true">{t.emoji}</span>
            <span className="min-w-0">
              <span className="block text-[17px] font-black" style={{ fontFamily: 'Outfit, system-ui' }}>{t.label}</span>
              <span className="block text-[12px] mt-0.5 mb-1.5" style={{ color: t.accent }}>{t.blurb}</span>
              <span className="block text-[13px] leading-snug text-white/75">{STUDIO_COPY[t.id]?.[role] || ''}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

// ── Lorea shelf ───────────────────────────────────────────────────────────────────────────────
export const LoreaShelf: React.FC<{ role: ShowcaseRole; onNavigate: Nav; initialBand?: ReadingBand; childName?: string }> = ({ role, onNavigate, initialBand = '3-5', childName }) => {
  const [band, setBand] = useState<ReadingBand>(initialBand);
  const b = LOREA_BANDS[band];
  const title = role === 'teacher' ? 'Classics for your class, by grade band' : role === 'parent' ? `Read together${childName ? ` with ${childName}` : ''}` : 'Books picked for your grade';
  return (
    <section className="mb-12 relative rounded-[28px] overflow-hidden border border-[#F5C987]/30 bg-[#17110a]" aria-label={title}>
      <video src="/academia/book-opens.mp4" autoPlay muted loop playsInline aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-30" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(23,17,10,0.97) 0%, rgba(23,17,10,0.85) 45%, rgba(23,17,10,0.55) 100%)' }} />
      <div className="relative p-4 sm:p-8">
        <Head eyebrow="Lorea" color="#F5C987" title={title}
          sub={role === 'parent' ? 'Hand-picked by grade band. Minutes you read together count toward their reading goal.' : role === 'teacher' ? 'Free classics on Lorea. Assign a chapter or put a book on the class shelf.' : 'Free classics to read, plus your own books to write.'}
          right={<div className="flex flex-wrap gap-1.5" role="group" aria-label="Reading band">
            {(Object.keys(LOREA_BANDS) as ReadingBand[]).map(k => (
              <button key={k} type="button" aria-pressed={k === band} onClick={() => setBand(k)}
                className={`min-h-[40px] px-4 rounded-full text-[13px] font-bold border ${k === band ? 'bg-[#F5C987] text-[#17110a] border-[#F5C987]' : 'border-white/20 text-white'}`}>{LOREA_BANDS[k].label}</button>
            ))}
          </div>} />
        <div className="flex gap-4 overflow-x-auto pb-2">
          {b.books.map(bk => (
            <button key={bk.title} type="button" onClick={() => onNavigate('BOOKS')} className="shrink-0 w-[150px] text-left group">
              <img src={bk.cover} alt={`${bk.title} cover`} loading="lazy" className="w-[150px] h-[224px] object-cover rounded-xl border border-white/15 shadow-[0_20px_40px_-18px_rgba(0,0,0,0.8)] transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:-rotate-1" />
              <span className="block mt-2 font-bold text-[14px] leading-tight">{bk.title}</span>
              <span className="block text-[12px] text-white/65">{bk.note}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

// ── Beyond mastery: flagship curriculums ──────────────────────────────────────────────────────
const CUR_COPY: Record<ShowcaseRole, { title: string; sub: string; cta: string }> = {
  teacher: { title: 'Flagship curriculums, ready to add to any class', sub: 'Full schools beyond core mastery. Every lesson, check and project writes to the Learner Ledger alongside your grades.', cta: 'Open school' },
  student: { title: 'Schools to explore', sub: 'Money, philosophy, film, music and more. Everything you finish goes on your record.', cta: 'Explore' },
  parent: { title: 'Rich curriculum, all in one learning stack', sub: 'Beyond core subjects, Academia has full schools your child’s teacher can add. Every lesson they finish is recorded in the same Learner Ledger as their grades.', cta: 'Take a look' },
};
const FLOW = [
  { t: 'Lesson', s: 'any school or core class', c: '#00DAF3' },
  { t: 'Mastery check', s: 'mapped to standards', c: '#06D6A0' },
  { t: 'Learner Ledger', s: 'portable academic record', c: '#c4b5fd' },
  { t: 'Report & passport', s: 'what families and schools see', c: '#FF9EC4' },
];
export const CurriculumShowcase: React.FC<{ role: ShowcaseRole; onNavigate: Nav }> = ({ role, onNavigate }) => {
  const c = CUR_COPY[role];
  return (
    <section className="mb-12 relative rounded-[32px] overflow-hidden border border-purple-400/35 bg-[#150b22] p-4 sm:p-10" aria-label={c.title}>
      <img src="/academia/pillars.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(21,11,34,0.55) 0%, rgba(21,11,34,0.92) 45%, #150b22 100%)' }} />
      <div className="relative">
        <p className="text-[12px] font-black uppercase tracking-[0.28em] text-purple-300">Beyond mastery</p>
        <h2 className="text-[28px] sm:text-[48px] font-black leading-[1.04] mt-2 max-w-3xl" style={{ fontFamily: 'Outfit, system-ui' }}>{c.title}</h2>
        <p className="text-[16px] text-white/75 mt-3 max-w-3xl leading-relaxed">{c.sub}</p>
        {role !== 'student' && (
          <ol className="flex flex-wrap items-center gap-2.5 mt-6 mb-7">
            {FLOW.map((f, i) => (
              <li key={f.t} className="flex items-center gap-2.5">
                <span className="px-4 py-3 rounded-2xl border" style={{ background: `${f.c}14`, borderColor: `${f.c}55` }}>
                  <span className="block font-black text-[14px]" style={{ color: f.c }}>{f.t}</span>
                  <span className="block text-[12px] text-white/65">{f.s}</span>
                </span>
                {i < FLOW.length - 1 && <ArrowRight size={20} className="text-white/50" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
        <div className={`grid gap-4 ${role === 'student' ? 'mt-6' : ''}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
          {ACADEMIA_SCHOOLS.map(s => (
            <button key={s.view} type="button" onClick={() => onNavigate(s.view)}
              className={`relative min-h-[240px] text-left rounded-3xl overflow-hidden border border-white/10 flex flex-col justify-end ${lift}`} style={{ background: s.bg }}>
              {s.img && <img src={s.img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
              {!s.img && <span className="absolute right-3 top-2 text-[96px] leading-none opacity-40" aria-hidden="true">{s.emoji}</span>}
              <span className="relative block p-5" style={{ background: 'linear-gradient(0deg, rgba(10,10,15,0.97) 0%, rgba(10,10,15,0.85) 60%, rgba(10,10,15,0) 100%)' }}>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-[0.1em] border" style={{ color: s.color, borderColor: s.color }}>{s.tag}</span>
                <span className="block text-[23px] font-black mt-2" style={{ fontFamily: 'Outfit, system-ui' }}>{s.name}</span>
                <span className="block text-[14px] leading-snug text-white/75 mt-1 mb-3">{s.blurb}</span>
                <span className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl text-[14px] font-black text-[#0a0a0f]" style={{ background: s.color }}>{c.cta} <ArrowRight size={15} /></span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
