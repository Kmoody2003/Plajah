// Music Law Library — Academia's law school shelf for creators. Statutes and treaties, landmark music
// cases in plain language, a live feed of new suits and rule changes (routes/musicLaw.ts), and Study mode,
// which is the law-music course in the shared SchoolView. Open to everyone; education, not legal advice.
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, ExternalLink, Gavel, GraduationCap, Radio, RefreshCw, Scale, Search } from 'lucide-react';
import { AUTHORITIES, CASES, TOPIC_LABEL, type Authority, type Case, type Topic } from '../../data/musicLaw/library';
import { LAW_ACCENT } from '../../data/lawMedicineRoster';
import { LAW_NOTICE } from '../../data/practice/courseKit';
import { loadCurriculum } from '../../services/courseCatalog';
import type { Curriculum } from '../../services/schoolChassis';
import type { UpdatesResult } from '../../services/musicLaw/updates';

const SchoolView = lazy(() => import('../school/SchoolView'));

type Tab = 'STATUTES' | 'CASES' | 'LATEST' | 'STUDY';
const TABS: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: 'STATUTES', label: 'Statutes & treaties', icon: Scale },
  { id: 'CASES', label: 'Landmark cases', icon: Gavel },
  { id: 'LATEST', label: 'Latest', icon: Radio },
  { id: 'STUDY', label: 'Study', icon: GraduationCap },
];
const JUR: Record<Authority['jurisdiction'], string> = { US: 'United States', INTL: 'International', EU: 'European Union' };
/** Which course lesson teaches each case (data/practice/courses/law-music). */
const CASE_LESSON: Record<string, string> = {
  'grand-upright': 'l07', newton: 'l07', bridgeport: 'l07', 'vmg-salsoul': 'l07', 'williams-gaye': 'l08', skidmore: 'l08', 'gray-hudson': 'l08',
  campbell: 'l09', warhol: 'l09', nealy: 'l09', 'fourth-estate': 'l03', feist: 'l01',
};
const label = 'text-[10px] font-black uppercase tracking-[0.3em]';
const card = 'rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5';

const Sources: React.FC<{ links: { label: string; url: string }[] }> = ({ links }) => (
  <div className="flex flex-wrap gap-2 mt-3">
    {links.map(l => (
      <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/75 hover:bg-white/10">
        <ExternalLink size={11} /> {l.label}
      </a>
    ))}
  </div>
);

const TopicChips: React.FC<{ topics: Topic[]; value: Topic | null; onChange: (t: Topic | null) => void }> = ({ topics, value, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold"
      style={value === null ? { background: LAW_ACCENT, color: '#000', borderColor: LAW_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)' }}>All</button>
    {topics.map(t => (
      <button key={t} type="button" onClick={() => onChange(value === t ? null : t)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold"
        style={value === t ? { background: LAW_ACCENT, color: '#000', borderColor: LAW_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)' }}>{TOPIC_LABEL[t]}</button>
    ))}
  </div>
);

const matches = (q: string, ...fields: string[]) => !q || fields.some(f => f.toLowerCase().includes(q.toLowerCase()));

const StatutesTab: React.FC<{ q: string; topic: Topic | null }> = ({ q, topic }) => {
  const rows = AUTHORITIES.filter(a => (!topic || a.topics.includes(topic)) && matches(q, a.cite, a.title, a.gist, a.plain));
  const groups = (['US', 'INTL', 'EU'] as const).map(j => [j, rows.filter(a => a.jurisdiction === j)] as const).filter(([, r]) => r.length);
  if (!rows.length) return <p className="text-white/50 text-sm">Nothing matches.</p>;
  return (
    <div className="space-y-8">
      {groups.map(([j, list]) => (
        <section key={j}>
          <p className={label} style={{ color: LAW_ACCENT }}>{JUR[j]}</p>
          <div className="mt-3 space-y-3">
            {list.map(a => (
              <article key={a.id} className={card} data-testid={`authority-${a.id}`}>
                <p className="text-[12px] font-black" style={{ color: LAW_ACCENT }}>{a.cite}</p>
                <h3 className="text-lg font-black leading-tight mt-0.5">{a.title}</h3>
                <p className="text-white/80 text-[14px] mt-1.5 font-semibold">{a.gist}</p>
                <p className="text-white/65 text-[14px] mt-2 leading-relaxed">{a.plain}</p>
                <p className="text-[13px] mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-white/75"><b className="text-white">For creators:</b> {a.forCreators}</p>
                <Sources links={a.sources} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

const CasesTab: React.FC<{ q: string; topic: Topic | null; onStudy: () => void }> = ({ q, topic, onStudy }) => {
  const rows = [...CASES].sort((a, b) => a.year - b.year).filter(c => (!topic || c.topics.includes(topic)) && matches(q, c.name, c.cite, c.dispute, c.held, c.why));
  const byId = (id: string) => CASES.find(c => c.id === id);
  if (!rows.length) return <p className="text-white/50 text-sm">Nothing matches.</p>;
  return (
    <div className="space-y-3">
      {rows.map((c: Case) => (
        <article key={c.id} className={card} data-testid={`case-${c.id}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-black leading-tight italic">{c.name}</h3>
            <span className="text-[12px] text-white/55">{c.cite} ({c.court} {c.year})</span>
          </div>
          <p className="text-[13px] text-white/60 mt-2"><b className="text-white/85">The dispute.</b> {c.dispute}</p>
          <p className="text-[14px] text-white/80 mt-2 leading-relaxed"><b className="text-white">Held.</b> {c.held}</p>
          <p className="text-[13px] mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-white/75"><b className="text-white">Why it matters:</b> {c.why}</p>
          {c.related?.length ? <p className="text-[12px] text-white/45 mt-2">Read with: {c.related.map(byId).filter(Boolean).map(r => r!.name.split(',')[0]).join(' · ')}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Sources links={c.sources} />
            {CASE_LESSON[c.id] && <button type="button" onClick={onStudy} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black text-black" style={{ background: LAW_ACCENT }}><BookOpen size={11} /> Study lesson {Number(CASE_LESSON[c.id].slice(1))}</button>}
          </div>
          <p className="text-[10px] text-white/35 mt-2">Citation {c.checked === 'courtlistener' ? 'checked against the CourtListener record' : 'from the official U.S. Reports'}.</p>
        </article>
      ))}
    </div>
  );
};

const LatestTab: React.FC<{ apiBase: string }> = ({ apiBase }) => {
  const [data, setData] = useState<UpdatesResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'COURTS' | 'RULES'>('ALL');
  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/api/music-law/updates?max=15`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
      setData(body as UpdatesResult);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const items = (data?.items || []).filter(i => filter === 'ALL' || (filter === 'RULES' ? i.source === 'Federal Register' : i.source !== 'Federal Register'));
  return (
    <div>
      <p className="text-[13px] text-white/60 max-w-3xl leading-relaxed">New and active U.S. copyright suits about music and recent court opinions from <b>CourtListener</b> (Free Law Project, RECAP), and rules and notices from the <b>U.S. Copyright Office</b> and <b>Copyright Royalty Board</b> via the <b>Federal Register</b>. Titles and links are the sources' own. A suit appearing here means it was filed or had activity, not that anyone did anything wrong.</p>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {(['ALL', 'COURTS', 'RULES'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} className="rounded-full border px-3 py-1 text-[11px] font-bold"
            style={filter === f ? { background: LAW_ACCENT, color: '#000', borderColor: LAW_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)' }}>{f === 'ALL' ? 'Everything' : f === 'COURTS' ? 'Courts' : 'Rules & notices'}</button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold hover:bg-white/10 disabled:opacity-50"><RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {err && <p className="mt-4 text-[13px] text-red-300">Could not load the feed: {err}</p>}
      {data?.status.filter(s => !s.ok).map(s => <p key={s.watch} className="mt-2 text-[12px] text-amber-300">{s.label}: unavailable right now ({s.error}).</p>)}
      {busy && !data && <p className="mt-6 text-white/50 text-sm">Loading from CourtListener and the Federal Register…</p>}
      <div className="mt-4 space-y-2" data-testid="latest-list">
        {items.map(i => (
          <a key={i.id} href={i.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.07]">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-full px-2 py-0.5" style={{ background: i.source === 'Federal Register' ? 'rgba(91,141,239,0.25)' : 'rgba(201,162,39,0.25)' }}>{i.source}</span>
              <span className="text-white/45">{i.kind}</span>
              <span className="text-white/45">{i.date}</span>
            </div>
            <p className="font-bold mt-1 leading-snug">{i.title}</p>
            <p className="text-[12px] text-white/50">{i.venue}</p>
          </a>
        ))}
        {data && !items.length && <p className="text-white/50 text-sm">No items from these sources right now.</p>}
      </div>
      {data && <p className="text-[10px] text-white/35 mt-4">Fetched {new Date(data.fetchedAt).toLocaleString()}. Cached for up to an hour.</p>}
    </div>
  );
};

const StudyTab: React.FC = () => {
  const [cur, setCur] = useState<Curriculum | null>(null);
  useEffect(() => { let a = true; loadCurriculum('law-music').then(c => a && setCur(c)); return () => { a = false; }; }, []);
  if (!cur) return <p className="text-white/50 text-sm">Loading the course…</p>;
  return (
    <div>
      <p className="text-[13px] text-white/60 max-w-3xl mb-4">The Music Law for Creators course: {cur.tracks.reduce((n, t) => n + t.lessons.length, 0)} lessons. Progress saves to your learning record; practice questions for each lesson are in the Learn map under Law.</p>
      <Suspense fallback={null}><SchoolView curriculum={cur} embedded /></Suspense>
    </div>
  );
};

interface Props { onBack?: () => void; onNavigate?: (view: string) => void; initialTab?: Tab; /** Lab only: where /api lives. */ apiBase?: string }

const MusicLawLibrary: React.FC<Props> = ({ onBack, initialTab, apiBase = '' }) => {
  const [tab, setTab] = useState<Tab>(initialTab ?? ((typeof location !== 'undefined' ? new URLSearchParams(location.search).get('tab') : null) as Tab) ?? 'STATUTES');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const topics = useMemo(() => {
    const src = tab === 'CASES' ? CASES.flatMap(c => c.topics) : AUTHORITIES.flatMap(a => a.topics);
    return (Object.keys(TOPIC_LABEL) as Topic[]).filter(t => src.includes(t));
  }, [tab]);
  useEffect(() => { if (topic && !topics.includes(topic)) setTopic(null); }, [topics]);

  return (
    <div className="relative z-10 min-h-screen text-white pb-24" data-testid="music-law-library">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white mb-5"><ArrowLeft size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Back</span></button>}
        <p className={label} style={{ color: LAW_ACCENT }}>Academia · Law school</p>
        <h1 className="font-black tracking-tight mt-1.5 leading-none" style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>Music Law Library</h1>
        <p className="text-white/60 mt-3 max-w-3xl leading-relaxed">The statutes, treaties and cases that decide who owns a song, who gets paid, and what you can sample, in plain language, with links to the free official text. Open to every creator.</p>
        <p className="text-[11px] text-white/40 mt-2 max-w-3xl">{LAW_NOTICE}</p>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border"
              style={tab === t.id ? { background: LAW_ACCENT, color: '#000', borderColor: LAW_ACCENT } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
              <t.icon size={13} />{t.label}
            </button>
          ))}
        </div>
        {(tab === 'STATUTES' || tab === 'CASES') && (
          <div className="mt-5 space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2">
              <Search size={14} className="text-white/40" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'CASES' ? 'Search cases (sampling, Zeppelin, fair use…)' : 'Search statutes (§115, takedown, term…)'} className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/35" />
            </label>
            <TopicChips topics={topics} value={topic} onChange={setTopic} />
          </div>
        )}
        <div className="mt-6">
          {tab === 'STATUTES' && <StatutesTab q={q} topic={topic} />}
          {tab === 'CASES' && <CasesTab q={q} topic={topic} onStudy={() => setTab('STUDY')} />}
          {tab === 'LATEST' && <LatestTab apiBase={apiBase} />}
          {tab === 'STUDY' && <StudyTab />}
        </div>
      </div>
    </div>
  );
};

export default MusicLawLibrary;
