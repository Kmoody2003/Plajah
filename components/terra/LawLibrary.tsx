/**
 * Terra Law Library — "what are the rules?" answered from the official text.
 *
 * Three shelves, each as deep as its publisher allows:
 *  · Michigan law  — full search + full section text (legislature.mi.gov).
 *  · Federal rules — eCFR search, linking to the current text.
 *  · Detroit code  — Municode has no API, so this shelf links into the city's
 *    own code (and its recent-ordinance page) rather than pretending to host it.
 *
 * Every answer shows where it came from and that it is not legal advice.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Scale, Search, Loader2, ExternalLink, ArrowLeft, Landmark, Building2, BookOpen, Info } from 'lucide-react';
import {
  searchMichiganLaw, fetchMichiganSection, searchFederalRules, DETROIT_CODE_URL,
  DETROIT_NEW_ORDINANCES_URL, LAW_TOPICS, type MclHit, type MclSection, type CfrHit,
} from '../../services/terra/law/lawClient';

const ACCENT = '#FF8C00';
const LAW = '#8FB4FF';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const kicker = 'text-[10px] font-black uppercase tracking-widest text-white/35';

type Shelf = 'michigan' | 'federal' | 'detroit';

interface Props {
  /** Prefill and run a search (e.g. from a parcel: "zoning"). */
  initialQuery?: string;
  /** The parcel's zoning district, when opened from a parcel — shown as context on the Detroit shelf. */
  zoningDistrict?: string;
  onBack?: () => void;
  /** Open Parcel Studio (Terra's hand-encoded, cited zoning rules). */
  onOpenStudio?: () => void;
}

export const LawLibrary: React.FC<Props> = ({ initialQuery = '', zoningDistrict, onBack, onOpenStudio }) => {
  const [q, setQ] = useState(initialQuery);
  // From a parcel, the city's zoning is the rule that actually governs the lot — lead with it.
  const [shelf, setShelf] = useState<Shelf>(zoningDistrict ? 'detroit' : 'michigan');
  const [ran, setRan] = useState('');
  const [mi, setMi] = useState<{ busy: boolean; total: number; hits: MclHit[]; searchedAs?: string; error?: string }>({ busy: false, total: 0, hits: [] });
  const [fed, setFed] = useState<{ busy: boolean; total: number; hits: CfrHit[]; error?: string }>({ busy: false, total: 0, hits: [] });
  const [open, setOpen] = useState<{ busy: boolean; section?: MclSection; error?: string } | null>(null);
  const seq = useRef(0);

  const run = useCallback((text: string) => {
    const query = text.trim();
    if (query.length < 2) return;
    const n = ++seq.current;
    setRan(query);
    setOpen(null);
    setMi(s => ({ ...s, busy: true, error: undefined }));
    setFed(s => ({ ...s, busy: true, error: undefined }));
    searchMichiganLaw(query)
      .then(r => { if (n === seq.current) setMi({ busy: false, total: r.total, hits: r.hits, searchedAs: r.searchedAs }); })
      .catch(e => { if (n === seq.current) setMi({ busy: false, total: 0, hits: [], error: e.message }); });
    searchFederalRules(query)
      .then(r => { if (n === seq.current) setFed({ busy: false, total: r.total, hits: r.hits }); })
      .catch(e => { if (n === seq.current) setFed({ busy: false, total: 0, hits: [], error: e.message }); });
  }, []);

  const openSection = useCallback((id: string) => {
    setShelf('michigan');
    setOpen({ busy: true });
    fetchMichiganSection(id)
      .then(r => setOpen({ busy: false, section: r.section }))
      .catch(e => setOpen({ busy: false, error: e.message }));
  }, []);

  useEffect(() => { if (initialQuery) run(initialQuery); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const tab = (id: Shelf, label: string, Icon: React.ElementType, count?: number) => (
    <button onClick={() => setShelf(id)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
        shelf === id ? 'text-black' : 'text-white/50 bg-white/[0.04] hover:text-white/80'}`}
      style={shelf === id ? { background: LAW } : {}}>
      <Icon size={12} /> {label}{typeof count === 'number' && ran ? ` · ${count}` : ''}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} title="Back to Terra"
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: `${LAW}20`, borderColor: `${LAW}40` }}>
            <Scale size={16} style={{ color: LAW }} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest">Laws &amp; ordinances</h1>
            <p className="text-[10px] font-bold" style={{ color: LAW }}>Michigan law · federal rules · Detroit City Code</p>
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); run(q); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
              placeholder='Ask in plain words — "security deposit", "food truck", "home business" — or a section like 554.602'
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/30" />
          </div>
          <button type="submit" disabled={q.trim().length < 2}
            className="px-4 rounded-xl text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40"
            style={{ background: LAW }}>Search</button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {tab('michigan', 'Michigan law', Landmark, mi.total)}
          {tab('federal', 'Federal rules', BookOpen, fed.total)}
          {tab('detroit', 'Detroit code', Building2)}
        </div>

        {shelf === 'michigan' && (
          open ? <SectionReader state={open} onBack={() => setOpen(null)} onOpen={openSection} />
            : ran ? <MichiganResults state={mi} query={ran} onOpen={openSection} />
              : <Topics onOpen={openSection} />
        )}
        {shelf === 'federal' && <FederalResults state={fed} query={ran} />}
        {shelf === 'detroit' && <DetroitShelf query={ran} zoningDistrict={zoningDistrict} onOpenStudio={onOpenStudio} />}

        <p className="text-[10px] text-white/30 leading-relaxed flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0" />
          Law text comes straight from the official publishers and isn't the official legal version. This is a way to
          read the rules, not legal advice; for a decision that matters, confirm with the source or a lawyer.
        </p>
      </div>
    </div>
  );
};

const Topics: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => (
  <div className="grid sm:grid-cols-2 gap-3">
    {LAW_TOPICS.map(g => (
      <div key={g.group} className={`${card} p-4`}>
        <p className={`${kicker} mb-2`}>{g.group}</p>
        <div className="space-y-0.5">
          {g.items.map(t => (
            <button key={t.mcl} onClick={() => onOpen(t.mcl)}
              className="w-full text-left flex items-baseline justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors">
              <span className="text-[12px] text-white/80">{t.label}</span>
              <span className="text-[10px] font-mono text-white/30 shrink-0">MCL {t.mcl}</span>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const Busy: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[12px] text-white/45 flex items-center gap-2 py-4"><Loader2 size={13} className="animate-spin" /> {text}</p>
);

const Failed: React.FC<{ what: string; error: string }> = ({ what, error }) => (
  <div className="rounded-xl p-3.5 text-[12px] text-[#E8B33D] leading-relaxed" style={{ background: '#E8B33D12', border: '1px solid #E8B33D33' }}>
    Couldn't reach {what} right now ({error}). That's a connection problem, not "no law on this" — try again shortly.
  </div>
);

const MichiganResults: React.FC<{ state: { busy: boolean; total: number; hits: MclHit[]; searchedAs?: string; error?: string }; query: string; onOpen: (id: string) => void }> = ({ state, query, onOpen }) => {
  if (state.busy) return <Busy text="Searching the Michigan Compiled Laws…" />;
  if (state.error) return <Failed what="legislature.mi.gov" error={state.error} />;
  if (!state.hits.length) return <p className="text-[12px] text-white/45 py-3">No Michigan law sections mention “{query}”. Try fewer or simpler words.</p>;
  return (
    <div className={`${card} p-2`}>
      {state.searchedAs && (
        <p className="text-[11px] text-white/55 px-2 pt-1.5">Michigan law calls this <span className="font-bold" style={{ color: LAW }}>“{state.searchedAs}”</span>, so that's what was searched.</p>
      )}
      <p className={`${kicker} px-2 pt-1.5 pb-2`}>
        {state.total > state.hits.length ? `Best ${state.hits.length} of ${state.total} sections` : `${state.hits.length} sections`} · ranked by how well the summary matches
      </p>
      {state.hits.map(h => (
        <button key={h.id} onClick={() => onOpen(h.id)}
          className="w-full text-left flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition-colors">
          <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: LAW }}>{h.section}</span>
          <span className="text-[12px] text-white/80 leading-snug">{h.catchline}</span>
        </button>
      ))}
    </div>
  );
};

const SectionReader: React.FC<{ state: { busy: boolean; section?: MclSection; error?: string }; onBack: () => void; onOpen: (id: string) => void }> = ({ state, onBack }) => {
  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white/80 mb-3">
      <ArrowLeft size={11} /> Back
    </button>
  );
  if (state.busy) return <div>{back}<Busy text="Opening the section…" /></div>;
  if (state.error || !state.section) return <div>{back}<Failed what="legislature.mi.gov" error={state.error ?? 'empty response'} /></div>;
  const s = state.section;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      {back}
      <article className={`${card} p-5`}>
        <p className={kicker}>{[s.actTitle, s.actNumber].filter(Boolean).join(' · ')}</p>
        {s.popularName && <p className="text-[11px] mt-0.5" style={{ color: LAW }}>{s.popularName}</p>}
        <h2 className="text-base font-black text-white mt-2 leading-snug">
          <span className="font-mono mr-2" style={{ color: LAW }}>MCL {s.section}</span>{s.catchline}
        </h2>
        <div className="mt-4 space-y-2.5">
          {s.paragraphs.map((p, i) => (
            <p key={i} className="text-[13px] text-white/80 leading-relaxed">{p}</p>
          ))}
        </div>
        {s.history && <p className="mt-4 text-[10px] text-white/30 leading-relaxed">History: {s.history}</p>}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-white/35">Michigan Legislature · retrieved {new Date(s.retrievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <a href={s.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white">
            Read on legislature.mi.gov <ExternalLink size={11} />
          </a>
        </div>
      </article>
    </motion.div>
  );
};

const FederalResults: React.FC<{ state: { busy: boolean; total: number; hits: CfrHit[]; error?: string }; query: string }> = ({ state, query }) => {
  if (!query) return <p className="text-[12px] text-white/45 py-3">Search above to see federal regulations (the Code of Federal Regulations) that mention it — FDA food rules, OSHA, SBA size standards and so on.</p>;
  if (state.busy) return <Busy text="Searching federal regulations…" />;
  if (state.error) return <Failed what="ecfr.gov" error={state.error} />;
  if (!state.hits.length) return <p className="text-[12px] text-white/45 py-3">No current federal regulation mentions “{query}”.</p>;
  return (
    <div className="space-y-2">
      {state.hits.map(h => (
        <a key={h.url} href={h.url} target="_blank" rel="noreferrer" className={`${card} block p-3.5 hover:bg-white/[0.05] transition-colors`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono" style={{ color: LAW }}>{h.citation} CFR</p>
              <p className="text-[13px] font-bold text-white/85 leading-snug mt-0.5">{h.heading}</p>
              {h.agency && <p className="text-[10px] text-white/40 mt-0.5">{h.agency}</p>}
              {h.excerpt && <p className="text-[11px] text-white/50 leading-relaxed mt-1.5">{h.excerpt}</p>}
            </div>
            <ExternalLink size={12} className="text-white/30 shrink-0 mt-1" />
          </div>
        </a>
      ))}
      <p className="text-[10px] text-white/30">Code of Federal Regulations via eCFR — current text, not the official legal edition.</p>
    </div>
  );
};

const DetroitShelf: React.FC<{ query: string; zoningDistrict?: string; onOpenStudio?: () => void }> = ({ query, zoningDistrict, onOpenStudio }) => {
  const [copied, setCopied] = useState(false);
  const copyWords = () => {
    if (!query) return;
    try { navigator.clipboard?.writeText(query).then(() => setCopied(true), () => {}); } catch { /* clipboard blocked — the link still opens */ }
  };
  return (
  <div className="space-y-3">
    <div className={`${card} p-4`}>
      <p className="text-[13px] font-black text-white">Detroit City Code</p>
      <p className="text-[12px] text-white/55 leading-relaxed mt-1">
        The city publishes its code through Municode, which doesn't offer data access, so Terra opens it there instead
        of copying it. {query ? <>Municode can't take a search from a link, so opening it copies “{query}” — paste it into the search box at the top of the code.</> : null}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <a href={DETROIT_CODE_URL} target="_blank" rel="noreferrer" onClick={copyWords}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-black text-[10px] font-black uppercase tracking-widest" style={{ background: LAW }}>
          {query ? (copied ? 'Opened — search words copied' : 'Open the City Code & copy my search') : 'Open the City Code'} <ExternalLink size={11} />
        </a>
        <a href={DETROIT_NEW_ORDINANCES_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest hover:text-white">
          Recently passed ordinances <ExternalLink size={11} />
        </a>
      </div>
      <p className="text-[10px] text-white/35 leading-relaxed mt-2.5">
        New ordinances can take a few months to reach Municode; the city lists them on its Law Department page meanwhile.
      </p>
    </div>

    <div className={`${card} p-4`}>
      <p className="text-[13px] font-black text-white">Zoning (Chapter 50)</p>
      <p className="text-[12px] text-white/55 leading-relaxed mt-1">
        {zoningDistrict
          ? <>This parcel is zoned <span className="font-black" style={{ color: ACCENT }}>{zoningDistrict}</span>. </>
          : null}
        Terra carries setbacks, height and lot coverage for Detroit's districts, typed in by hand from the zoning
        ordinance with a citation on every rule. Parcel Studio shows what those rules allow on a specific lot.
      </p>
      {onOpenStudio && (
        <button onClick={onOpenStudio}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-black text-[10px] font-black uppercase tracking-widest" style={{ background: ACCENT }}>
          What could go here — Parcel Studio
        </button>
      )}
      <p className="text-[10px] text-white/35 leading-relaxed mt-2.5">
        State law sets what any Michigan zoning code may regulate — see the Michigan Zoning Enabling Act (MCL 125.3201) on the Michigan shelf.
      </p>
    </div>
  </div>
  );
};

export default LawLibrary;
