/**
 * Terra Law Library — every Michigan statute and the 1963 Constitution, readable on Plajah.
 *
 * Built to feel like the rest of Plajah (a player you browse), not a government portal:
 * one search box, topic rails for people running a business, a Constitution feature, and a
 * calm reading view with shareable links (`?view=law&law=<id>`).
 *
 * Honesty rules (docs/TERRA_CIVIC_LEDGER_BLUEPRINT.md §4–5, session notes §7):
 * - Every screen says UNOFFICIAL COPY, names the source, and shows "current through".
 * - Law text is shown verbatim from the Legislature's data — never paraphrased here.
 * - Catchlines, history and compiler's notes are labelled as editorial, not law.
 * - Every section links to the official page on legislature.mi.gov.
 *
 * Data: routes/terraLaw.ts (pre-ingested by scripts/terra/ingestMichiganLaw.ts).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Search, Scale, BookOpen, Share2, Copy, ExternalLink, ChevronRight, ChevronDown, ChevronLeft,
  Building2, Wine, UtensilsCrossed, Coins, Stethoscope, Receipt, Map as MapIcon, KeyRound, Leaf,
  BadgeCheck, ShieldCheck, Handshake, Users, Sparkles, X, Landmark, History, Info, Flame, Store, Loader2,
} from 'lucide-react';
import type { Constitution, LawBlock, LawChapter, LawLibraryIndex, LawNode, LawSearchRow, LawSection } from '../../services/terra/law/lawTypes';
import { officialUrlFor } from '../../services/terra/law/lawTypes';
import { searchLaw } from '../../services/terra/law/lawSearch';

const J = 'mi';
const API = `/api/terra/law/${J}`;

// Palette — Terra's family, with a law-library violet.
const VIOLET = '#A78BFA';
const MAGENTA = '#FF3D80';
const ORANGE = '#FF8C00';
const CYAN = '#4FC3D6';
const GREEN = '#3DD68C';

// ── Routing ──────────────────────────────────────────────────────────────────
type Route =
  | { kind: 'home' }
  | { kind: 'constitution'; article?: string }
  | { kind: 'chapter'; n: string; act?: string }
  | { kind: 'section'; id: string };

function routeFromParam(p: string | null): Route {
  if (!p || p === 'home') return { kind: 'home' };
  if (p === 'const') return { kind: 'constitution' };
  if (/^const-[A-Za-z]+$/.test(p)) return { kind: 'constitution', article: p.slice(6) };
  if (/^ch-[0-9A-Za-z]+$/.test(p)) return { kind: 'chapter', n: p.slice(3) };
  if (/^(mcl-|const-)/.test(p)) return { kind: 'section', id: p };
  return { kind: 'home' };
}

function paramFor(r: Route): string {
  switch (r.kind) {
    case 'home': return 'home';
    case 'constitution': return r.article ? `const-${r.article}` : 'const';
    case 'chapter': return `ch-${r.n}`;
    case 'section': return r.id;
  }
}

export function lawShareUrl(r: Route): string {
  return `${window.location.origin}/?view=law&law=${encodeURIComponent(paramFor(r))}`;
}

// ── Data (module cache so navigating back and forth is instant) ────────────
const memo = new Map<string, Promise<any>>();
function getJson<T>(path: string): Promise<T> {
  if (!memo.has(path)) {
    memo.set(path, fetch(`${API}${path}`).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `Couldn't load (${r.status})`);
      return r.json();
    }).catch((e) => { memo.delete(path); throw e; }));
  }
  return memo.get(path)!;
}

function useJson<T>(path: string | null): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: path !== null });
  useEffect(() => {
    if (path === null) { setState({ data: null, error: null, loading: false }); return; }
    let live = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    getJson<T>(path).then((d) => live && setState({ data: d, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: String(e?.message || e), loading: false }));
    return () => { live = false; };
  }, [path]);
  return state;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const SMALL = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'by', 'at', 'with', 'from']);
const ROMAN = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
/** "PLANNING, HOUSING, AND ZONING" / "Michigan zoning enabling act" → "Planning, Housing, and Zoning" / "Michigan Zoning Enabling Act". */
export function titleCase(s: string): string {
  if (!s) return s;
  return s.split(/(\s+|-|\/)/).map((w, i) => {
    if (!/[A-Za-z]/.test(w)) return w;
    const bare = w.replace(/[^A-Za-z]/g, '');
    if (bare && ROMAN.test(bare) && (w === w.toUpperCase() || bare.length > 1)) return w.toUpperCase();
    if (/[A-Z].*\./.test(w) && w === w.toUpperCase() && w.length <= 6) return w; // E.R.O., P.A.
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join('');
}
const citeOf = (sec: Pick<LawSection, 'id' | 'num'>) => (sec.id.startsWith('mcl-') ? `MCL ${sec.num}` : sec.num);
const fmt = (n: number) => n.toLocaleString('en-US');

const RECENT_KEY = 'plajah:terra:law:recent';
function readRecent(): { id: string; title: string; cite: string }[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8); } catch { return []; }
}
function pushRecent(item: { id: string; title: string; cite: string }) {
  try {
    const next = [item, ...readRecent().filter((r) => r.id !== item.id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable — recents are a convenience only */ }
}

async function shareOrCopy(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title, url }); return 'shared'; }
  } catch { /* fall through to copy */ }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}

// ── Business topics (each verified to resolve to a real act in the data) ───
interface Topic { id: string; title: string; blurb: string; chapter: string; act: RegExp; actLabel: string; icon: React.ReactNode; from: string; to: string }
const TOPICS: Topic[] = [
  { id: 'llc', title: 'Forming an LLC', blurb: 'Formation, operating rules, members and managers.', chapter: '450', act: /limited liability company act/i, actLabel: 'Michigan Limited Liability Company Act', icon: <Building2 size={22} />, from: '#5B8DEF', to: '#A78BFA' },
  { id: 'dba', title: 'Your business name', blurb: 'Assumed names (DBA) and how to register one.', chapter: '445', act: /assumed or fictitious/i, actLabel: 'Assumed or Fictitious Name', icon: <Store size={22} />, from: '#FF8C00', to: '#FF3D80' },
  { id: 'wage', title: 'Minimum wage & overtime', blurb: 'Hourly minimums, tipped wages, overtime.', chapter: '408', act: /workforce opportunity wage act/i, actLabel: 'Workforce Opportunity Wage Act', icon: <Coins size={22} />, from: '#3DD68C', to: '#4FC3D6' },
  { id: 'sick', title: 'Earned sick time', blurb: 'What employers must provide, and how it accrues.', chapter: '408', act: /earned sick time/i, actLabel: 'Earned Sick Time Act', icon: <Stethoscope size={22} />, from: '#4FC3D6', to: '#5B8DEF' },
  { id: 'sales', title: 'Sales tax', blurb: 'Rates, licenses and returns for retail sales.', chapter: '205', act: /general sales tax act/i, actLabel: 'General Sales Tax Act', icon: <Receipt size={22} />, from: '#FFC24B', to: '#FF8C00' },
  { id: 'use', title: 'Use tax', blurb: 'Services, rentals and out-of-state purchases.', chapter: '205', act: /^use tax act/i, actLabel: 'Use Tax Act', icon: <Receipt size={22} />, from: '#FF8C00', to: '#FFC24B' },
  { id: 'liquor', title: 'Liquor licenses', blurb: 'Licensing, sales and the Liquor Control Commission.', chapter: '436', act: /liquor control code/i, actLabel: 'Michigan Liquor Control Code', icon: <Wine size={22} />, from: '#FF3D80', to: '#A78BFA' },
  { id: 'food', title: 'Food & restaurants', blurb: 'Food establishment licenses and inspections.', chapter: '289', act: /food law of 2000/i, actLabel: 'Food Law', icon: <UtensilsCrossed size={22} />, from: '#FF6B4A', to: '#FFC24B' },
  { id: 'zoning', title: 'Zoning & land use', blurb: 'How cities zone land, variances and hearings.', chapter: '125', act: /zoning enabling act/i, actLabel: 'Michigan Zoning Enabling Act', icon: <MapIcon size={22} />, from: '#FF8C00', to: '#5B8DEF' },
  { id: 'code', title: 'Building permits', blurb: 'The state construction code and permits.', chapter: '125', act: /single state construction code/i, actLabel: 'State Construction Code Act', icon: <Building2 size={22} />, from: '#5B8DEF', to: '#4FC3D6' },
  { id: 'landlord', title: 'Landlords & tenants', blurb: 'Leases, security deposits, tenant rights.', chapter: '554', act: /landlord and tenant/i, actLabel: 'Landlord and Tenant Relationships', icon: <KeyRound size={22} />, from: '#A78BFA', to: '#FF3D80' },
  { id: 'cannabis', title: 'Cannabis businesses', blurb: 'Adult-use licensing and local control.', chapter: '333', act: /regulation and taxation of marihuana/i, actLabel: 'Regulation and Taxation of Marihuana Act', icon: <Leaf size={22} />, from: '#3DD68C', to: '#A78BFA' },
  { id: 'licensed', title: 'Licensed trades', blurb: 'Barbers, builders, cosmetology and more.', chapter: '339', act: /occupational code/i, actLabel: 'Occupational Code', icon: <BadgeCheck size={22} />, from: '#4FC3D6', to: '#3DD68C' },
  { id: 'consumer', title: 'Consumer protection', blurb: 'Unfair practices, disclosures, remedies.', chapter: '445', act: /consumer protection act/i, actLabel: 'Michigan Consumer Protection Act', icon: <ShieldCheck size={22} />, from: '#5B8DEF', to: '#FF3D80' },
  { id: 'franchise', title: 'Franchises', blurb: 'Offering and buying a franchise.', chapter: '445', act: /franchise investment law/i, actLabel: 'Franchise Investment Law', icon: <Handshake size={22} />, from: '#FFC24B', to: '#3DD68C' },
  { id: 'civil', title: 'Civil rights at work', blurb: 'Discrimination in employment and service.', chapter: '37', act: /elliott-larsen/i, actLabel: 'Elliott-Larsen Civil Rights Act', icon: <Users size={22} />, from: '#FF3D80', to: '#FF8C00' },
  { id: 'fireworks', title: 'Selling fireworks', blurb: 'Consumer fireworks sales and certificates.', chapter: '28', act: /fireworks safety act/i, actLabel: 'Michigan Fireworks Safety Act', icon: <Flame size={22} />, from: '#FF6B4A', to: '#FF3D80' },
];

const SUGGESTIONS = ['minimum wage', 'liquor license', 'limited liability company', 'security deposit', 'zoning variance', 'MCL 125.3201'];

// ── Small UI atoms ──────────────────────────────────────────────────────────
const Chip: React.FC<{ color?: string; children: React.ReactNode; className?: string }> = ({ color = VIOLET, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.14em] border ${className}`}
    style={{ color, borderColor: `${color}55`, background: `${color}14` }}>{children}</span>
);

function UnofficialNote({ index, compact }: { index: LawLibraryIndex | null; compact?: boolean }) {
  const through = index?.source.currentThrough;
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <Info size={14} className="mt-0.5 shrink-0 text-white/40" />
      <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} leading-relaxed text-white/50`}>
        <span className="font-bold text-white/75">Unofficial copy.</span> Text from the Michigan Legislature
        {through ? <>, current through <span className="text-white/75">{through}</span></> : null}. Laws change — for the
        official text and for legal advice, check <a className="underline decoration-white/30 hover:text-white" href="https://legislature.mi.gov" target="_blank" rel="noopener noreferrer">legislature.mi.gov</a> and a licensed attorney.
      </p>
    </div>
  );
}

function Toast({ msg }: { msg: string | null }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white text-black text-xs font-black shadow-2xl">
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-white/40 text-xs font-bold">
      <Loader2 size={16} className="animate-spin" /> {label ?? 'Loading…'}
    </div>
  );
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="max-w-xl mx-auto my-16 text-center">
      <p className="text-sm font-black text-white">We couldn't load that.</p>
      <p className="mt-1 text-xs text-white/45">{msg}</p>
      {onRetry && <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-xl bg-white/10 text-xs font-black hover:bg-white/15">Try again</button>}
    </div>
  );
}

// ── Search ───────────────────────────────────────────────────────────────────
function useSearchIndex(enabled: boolean) {
  const [rows, setRows] = useState<LawSearchRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || rows) return;
    getJson<LawSearchRow[]>('/search-index').then(setRows).catch((e) => setErr(String(e?.message || e)));
  }, [enabled, rows]);
  return { rows, err };
}

function SearchBox({ value, onChange, onFocus, autoFocus, big }: { value: string; onChange: (v: string) => void; onFocus?: () => void; autoFocus?: boolean; big?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== ref.current) {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault(); ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={`group relative rounded-2xl p-[1.5px] transition-all ${big ? 'shadow-[0_20px_80px_-20px_rgba(167,139,250,0.45)]' : ''}`}
      style={{ background: `linear-gradient(120deg, ${VIOLET}66, ${MAGENTA}55, ${ORANGE}55)` }}>
      <div className={`flex items-center gap-3 rounded-[15px] bg-[#0d0c14] ${big ? 'px-5 py-4' : 'px-4 py-2.5'}`}>
        <Search size={big ? 20 : 16} className="text-white/45 shrink-0" />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder={big ? 'Search a topic or citation — “minimum wage”, “MCL 125.3201”' : 'Search Michigan law'}
          aria-label="Search Michigan law"
          className={`flex-1 min-w-0 bg-transparent outline-none text-white placeholder:text-white/30 ${big ? 'text-base md:text-lg' : 'text-sm'}`}
        />
        {value ? (
          <button onClick={() => onChange('')} className="p-1 rounded-lg text-white/40 hover:text-white" aria-label="Clear search"><X size={16} /></button>
        ) : (
          <kbd className="hidden md:inline-flex px-2 py-0.5 rounded-md border border-white/10 text-[10px] font-bold text-white/35">/</kbd>
        )}
      </div>
    </div>
  );
}

function SearchResults({ rows, query, onOpen, err }: { rows: LawSearchRow[] | null; query: string; onOpen: (id: string) => void; err: string | null }) {
  const results = useMemo(() => (rows ? searchLaw(rows, query, 50) : []), [rows, query]);
  if (err) return <ErrorBox msg={err} />;
  if (!rows) return <Spinner label="Opening the index…" />;
  if (!results.length) {
    return (
      <div className="py-14 text-center">
        <p className="text-sm font-black text-white/80">No sections match “{query}”.</p>
        <p className="mt-1 text-xs text-white/40">Try fewer words, a different term, or a citation like “MCL 408.414”.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {results.map((r) => (
        <button key={r[0]} onClick={() => onOpen(r[0])} className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-white/[0.04] transition-colors group">
          <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-black font-mono" style={{ color: VIOLET, background: `${VIOLET}18` }}>
            {r[0].startsWith('mcl-') ? r[1] : r[1].replace(/^Const\.\s*/, '')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-white/90 leading-snug line-clamp-2">{r[2]}</span>
            <span className="block mt-0.5 text-[11px] text-white/40 truncate">{titleCase(r[3])}</span>
          </span>
          <ChevronRight size={15} className="shrink-0 mt-1 text-white/20 group-hover:text-white/60" />
        </button>
      ))}
    </div>
  );
}

// ── Section body ─────────────────────────────────────────────────────────────
function Body({ blocks }: { blocks: LawBlock[] }) {
  if (!blocks.length) return <p className="text-white/40 italic">No text for this section.</p>;
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.t === 'table') {
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-[13px] text-white/80">
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'bg-white/[0.05] font-bold text-white' : 'border-t border-white/[0.06]'}>
                      {row.map((c, ci) => <td key={ci} className="px-3 py-2 align-top">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.t === 'pre') return <pre key={i} className="whitespace-pre-wrap text-[13px] text-white/75 font-mono bg-white/[0.03] rounded-xl p-3">{b.text}</pre>;
        const indent = Math.min(b.depth ?? 0, 3) * 18 + (b.num && /^\([a-z]{1,2}\)$/.test(b.num) ? 18 : b.num && /^\([ivx]+\)$/.test(b.num) ? 36 : 0);
        return (
          <p key={i} className="font-serif text-[17px] leading-[1.75] text-white/[0.86]" style={{ paddingLeft: indent }}>
            {b.heading && <span className="block font-sans text-[12px] font-black uppercase tracking-widest text-white/50 mb-1">{b.heading}</span>}
            {b.num && <span className="font-sans font-black mr-2" style={{ color: VIOLET }}>{b.num}</span>}
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────
interface Nav { go: (r: Route) => void; share: (r: Route, title: string) => void }

function HomeView({ index, nav, query, setQuery }: { index: LawLibraryIndex | null; nav: Nav; query: string; setQuery: (q: string) => void }) {
  const [wantIndex, setWantIndex] = useState(false);
  const { rows, err } = useSearchIndex(wantIndex || !!query);
  const { data: constitution } = useJson<Constitution>('/constitution');
  const [chFilter, setChFilter] = useState('');
  const recent = useMemo(readRecent, []);
  const chapters = useMemo(() => {
    const list = (index?.chapters ?? []).filter((c) => !c.repealed && c.sections > 0);
    const f = chFilter.trim().toLowerCase();
    return f ? list.filter((c) => c.title.toLowerCase().includes(f) || c.n === f) : list;
  }, [index, chFilter]);

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full blur-3xl opacity-40" style={{ background: `radial-gradient(circle, ${VIOLET}, transparent 65%)` }} />
          <div className="absolute -top-24 right-[-120px] w-[480px] h-[480px] rounded-full blur-3xl opacity-30" style={{ background: `radial-gradient(circle, ${MAGENTA}, transparent 65%)` }} />
          <div className="absolute top-40 left-1/3 w-[420px] h-[420px] rounded-full blur-3xl opacity-20" style={{ background: `radial-gradient(circle, ${ORANGE}, transparent 65%)` }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-8">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <Chip color={VIOLET}><Scale size={11} /> Law Library</Chip>
              <Chip color={ORANGE}>Michigan</Chip>
              <Chip color="#ffffff">Preview</Chip>
            </div>
            <h1 className="text-[40px] sm:text-6xl font-black tracking-tight leading-[0.95]">
              The law,<br />
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(100deg, ${VIOLET}, ${MAGENTA} 55%, ${ORANGE})` }}>in plain sight.</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/60 max-w-2xl leading-relaxed">
              Every Michigan statute and the state Constitution — searchable, readable and shareable. No PDFs, no portals,
              no leaving Plajah.
            </p>
            <div className="mt-7 max-w-3xl">
              <SearchBox big value={query} onChange={setQuery} onFocus={() => setWantIndex(true)} />
              {!query && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => setQuery(s)} className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors">{s}</button>
                  ))}
                </div>
              )}
            </div>
            {index && !query && (
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
                {[
                  [fmt(index.totals.sections), 'sections of law'],
                  [fmt(index.totals.acts), 'acts'],
                  [fmt(index.totals.chapters), 'chapters'],
                  [index.source.currentThrough ?? '—', 'current through'],
                ].map(([v, l]) => (
                  <div key={l}>
                    <p className="text-2xl font-black tracking-tight">{v}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{l}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 space-y-12">
        {query ? (
          <section>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Results</p>
            <SearchResults rows={rows} err={err} query={query} onOpen={(id) => nav.go({ kind: 'section', id })} />
          </section>
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Pick up where you left off</p>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {recent.map((r) => (
                    <button key={r.id} onClick={() => nav.go({ kind: 'section', id: r.id })}
                      className="snap-start shrink-0 w-64 text-left rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors">
                      <p className="text-[10px] font-black font-mono" style={{ color: VIOLET }}>{r.cite}</p>
                      <p className="mt-1 text-[13px] font-bold text-white/85 line-clamp-2">{r.title}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Business rail */}
            <section>
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Running a business in Michigan?</p>
                  <h2 className="mt-1 text-xl sm:text-2xl font-black tracking-tight">Start with the laws you'll actually use</h2>
                </div>
                <Sparkles size={18} className="text-white/25 shrink-0" />
              </div>
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
                {TOPICS.map((t, i) => (
                  <motion.button key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
                    onClick={() => nav.go({ kind: 'chapter', n: t.chapter, act: t.act.source })}
                    className="snap-start shrink-0 w-[220px] sm:w-[240px] text-left rounded-3xl overflow-hidden border border-white/[0.08] bg-[#100f17] hover:-translate-y-0.5 hover:border-white/20 transition-all group">
                    <div className="relative h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
                      <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 0, transparent 40%)' }} />
                      <div className="absolute bottom-3 left-4 w-11 h-11 rounded-2xl bg-black/25 backdrop-blur flex items-center justify-center text-white">{t.icon}</div>
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/30 text-[9px] font-black font-mono text-white/90">CH. {t.chapter}</span>
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-black text-white">{t.title}</p>
                      <p className="mt-1 text-[12px] text-white/50 leading-snug">{t.blurb}</p>
                      <p className="mt-3 text-[10px] font-bold text-white/30 truncate group-hover:text-white/55">{t.actLabel}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>

            {/* Constitution feature */}
            <section>
              <button onClick={() => nav.go({ kind: 'constitution' })}
                className="w-full text-left relative overflow-hidden rounded-[28px] border border-white/[0.08] p-6 sm:p-10 group"
                style={{ background: `linear-gradient(135deg, #1a1430, #12101c 55%, #1c0f1a)` }}>
                <div className="pointer-events-none absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-40" style={{ background: `radial-gradient(circle, ${VIOLET}, transparent 70%)` }} />
                <div className="relative flex flex-col sm:flex-row sm:items-end gap-6 justify-between">
                  <div className="max-w-2xl">
                    <Chip color={VIOLET}><Landmark size={11} /> Constitution of 1963</Chip>
                    <p className="mt-5 font-serif text-xl sm:text-3xl leading-snug text-white/90">
                      “{constitution?.preamble ?? 'We, the people of the State of Michigan, grateful to Almighty God for the blessings of freedom…'}”
                    </p>
                    <p className="mt-4 text-[12px] text-white/45">
                      {constitution ? `${constitution.articles.length} articles · ${fmt(constitution.articles.reduce((n, a) => n + a.sections.length, 0))} sections` : 'Declaration of rights, elections, the three branches, local government and more'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 self-start sm:self-auto px-5 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest group-hover:brightness-95">
                    <BookOpen size={14} /> Read it
                  </span>
                </div>
              </button>
            </section>

            {/* Chapters */}
            <section>
              <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">The Michigan Compiled Laws</p>
                  <h2 className="mt-1 text-xl sm:text-2xl font-black tracking-tight">Browse every chapter</h2>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 w-full sm:w-64">
                  <Search size={13} className="text-white/35" />
                  <input value={chFilter} onChange={(e) => setChFilter(e.target.value)} placeholder="Filter chapters" aria-label="Filter chapters"
                    className="flex-1 min-w-0 bg-transparent outline-none text-xs text-white placeholder:text-white/30" />
                </div>
              </div>
              {!index ? <Spinner /> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {chapters.map((c) => (
                    <button key={c.n} onClick={() => nav.go({ kind: 'chapter', n: c.n })}
                      className="text-left rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:bg-white/[0.05] hover:border-white/15 transition-all flex gap-4 items-start group">
                      <span className="shrink-0 w-12 text-right font-mono text-lg font-black text-white/25 group-hover:text-white/60 transition-colors">{c.n}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold text-white/90 leading-snug">{titleCase(c.title)}</span>
                        <span className="block mt-1 text-[11px] text-white/35">{fmt(c.sections)} sections · {fmt(c.acts)} {c.acts === 1 ? 'act' : 'acts'}</span>
                      </span>
                    </button>
                  ))}
                  {!chapters.length && <p className="text-xs text-white/40">No chapters match “{chFilter}”.</p>}
                </div>
              )}
            </section>

            <UnofficialNote index={index} />
          </>
        )}
      </div>
    </div>
  );
}

function ConstitutionView({ article, nav, index }: { article?: string; nav: Nav; index: LawLibraryIndex | null }) {
  const { data, error, loading } = useJson<Constitution>('/constitution');
  const [open, setOpen] = useState<string | null>(article ?? null);
  useEffect(() => { if (article) setOpen(article); }, [article]);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => { if (article && data) refs.current[article]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [article, data]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? 'Missing data'} />;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Chip color={VIOLET}><Landmark size={11} /> Michigan</Chip>
      <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight leading-[1.02]">The Constitution<br className="hidden sm:block" /> of 1963</h1>
      {data.preamble && (
        <blockquote className="mt-8 pl-5 border-l-2 font-serif text-xl sm:text-2xl leading-relaxed text-white/85" style={{ borderColor: VIOLET }}>
          {data.preamble}
          <footer className="mt-3 font-sans text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Preamble</footer>
        </blockquote>
      )}
      <div className="mt-10 space-y-3">
        {data.articles.map((a) => {
          const isOpen = open === a.n;
          return (
            <div key={a.n} ref={(el) => { refs.current[a.n] = el; }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] overflow-hidden scroll-mt-20">
              <button onClick={() => setOpen(isOpen ? null : a.n)} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.03]">
                <span className="shrink-0 w-[4.5rem] whitespace-nowrap font-mono text-[13px] font-black" style={{ color: VIOLET }}>{a.n === 'Schedule' ? 'SCHED.' : `ART. ${a.n}`}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-black text-white">{titleCase(a.title)}</span>
                  <span className="block text-[11px] text-white/35">{a.sections.length} sections</span>
                </span>
                <ChevronDown size={16} className={`text-white/35 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    {a.intro && <p className="px-5 pb-2 text-[12px] text-white/45 italic">{a.intro}</p>}
                    <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                      {a.sections.map((s) => (
                        <button key={s.id} onClick={() => nav.go({ kind: 'section', id: s.id })}
                          className={`w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-white/[0.04] ${s.repealed ? 'opacity-45' : ''}`}>
                          <span className="shrink-0 w-10 font-mono text-[11px] font-black text-white/40">§ {s.label}</span>
                          <span className="flex-1 text-[13px] text-white/80">{s.catch}{s.repealed ? ' (repealed)' : ''}</span>
                          <ChevronRight size={14} className="shrink-0 mt-0.5 text-white/20" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <div className="mt-10"><UnofficialNote index={index} /></div>
    </div>
  );
}

function SectionList({ nodes, nav, filter }: { nodes: LawNode[]; nav: Nav; filter: string }) {
  const f = filter.trim().toLowerCase();
  const rows: React.ReactNode[] = [];
  const walk = (ns: LawNode[], depth: number) => {
    for (const n of ns) {
      if (n.k === 'sec') {
        if (f && !n.catch.toLowerCase().includes(f) && !n.num.includes(f)) continue;
        rows.push(
          <button key={n.id} onClick={() => nav.go({ kind: 'section', id: n.id })}
            className={`w-full flex items-start gap-3 py-2.5 pr-3 text-left rounded-lg hover:bg-white/[0.04] ${n.repealed ? 'opacity-40' : ''}`} style={{ paddingLeft: 12 + depth * 14 }}>
            <span className="shrink-0 w-24 font-mono text-[11px] font-black text-white/40">{n.num}</span>
            <span className="flex-1 text-[13px] text-white/80 leading-snug">{n.catch}</span>
          </button>,
        );
      } else if (n.k === 'div') {
        const before = rows.length;
        rows.push(
          <p key={`div-${n.type}-${n.number}-${rows.length}`} className="pt-4 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/40" style={{ paddingLeft: 12 + depth * 14 }}>
            {titleCase(n.type)} {n.number}{n.title ? ` · ${titleCase(n.title)}` : ''}
          </p>,
        );
        walk(n.children, depth + 1);
        if (f && rows.length === before + 1) rows.pop(); // hide empty divisions while filtering
      } else {
        walk(n.children, depth);
      }
    }
  };
  walk(nodes, 0);
  return <div>{rows.length ? rows : <p className="px-3 py-4 text-xs text-white/40">No sections match.</p>}</div>;
}

function ChapterView({ n, act, nav, index }: { n: string; act?: string; nav: Nav; index: LawLibraryIndex | null }) {
  const { data, error, loading } = useJson<LawChapter>(`/mcl/${encodeURIComponent(n)}`);
  const [openAct, setOpenAct] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const actRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const acts = useMemo(() => (data?.children ?? []).filter((c): c is Extract<LawNode, { k: 'act' }> => c.k === 'act'), [data]);
  const loose = useMemo(() => (data?.children ?? []).filter((c) => c.k !== 'act'), [data]);
  useEffect(() => {
    if (!data) return;
    let target: string | null = null;
    if (act) {
      const re = new RegExp(act, 'i');
      target = acts.find((a) => re.test(a.shortTitle || '') || re.test(a.heading || ''))?.name ?? null;
    } else if (acts.length === 1) target = acts[0].name;
    setOpenAct(target);
    if (target) setTimeout(() => actRefs.current[target!]?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
  }, [data, act, acts]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? 'Missing data'} />;
  const meta = index?.chapters.find((c) => c.n === n);
  // Executive reorganization orders are housekeeping; list real acts first, EROs folded at the end.
  const isEro = (a: { name: string }) => /^E\.R\.O\./i.test(a.name);
  const live = acts.filter((a) => !a.repealed && !isEro(a));
  const eros = acts.filter((a) => !a.repealed && isEro(a));
  const countIn = (ns: LawNode[]): number => ns.reduce((n, x) => n + (x.k === 'sec' ? (x.repealed ? 0 : 1) : countIn(x.children)), 0);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center gap-2"><Chip color={ORANGE}>Chapter {data.n}</Chip>{meta && <span className="text-[11px] text-white/35">{fmt(meta.sections)} sections · {fmt(meta.acts)} acts</span>}</div>
      <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight leading-[1.02]">{titleCase(data.title)}</h1>
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 max-w-md">
        <Search size={13} className="text-white/35" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sections in this chapter" aria-label="Filter sections"
          className="flex-1 min-w-0 bg-transparent outline-none text-xs text-white placeholder:text-white/30" />
      </div>
      <div className="mt-6 space-y-3">
        {live.map((a) => {
          const isOpen = openAct === a.name || !!filter;
          return (
            <div key={a.name} ref={(el) => { actRefs.current[a.name] = el; }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] overflow-hidden scroll-mt-20">
              <button onClick={() => setOpenAct(isOpen && !filter ? null : a.name)} className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-white/[0.03]">
                <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${VIOLET}1c`, color: VIOLET }}><BookOpen size={15} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-black text-white">{titleCase(a.shortTitle || a.heading || a.name)}</span>
                  <span className="block text-[11px] text-white/35">{a.name} · {fmt(countIn(a.children))} sections</span>
                </span>
                <ChevronDown size={16} className={`mt-2 text-white/35 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-white/[0.06] px-2 sm:px-3 pb-3">
                  {a.longTitle && <p className="px-3 pt-3 text-[12px] text-white/40 leading-relaxed">{a.longTitle}</p>}
                  <SectionList nodes={a.children} nav={nav} filter={filter} />
                </div>
              )}
            </div>
          );
        })}
        {loose.length > 0 && <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3"><SectionList nodes={loose} nav={nav} filter={filter} /></div>}
        {eros.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            <button onClick={() => setOpenAct(openAct === '__eros' ? null : '__eros')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.03]">
              <span className="flex-1 text-[12px] font-black text-white/55">Executive reorganization orders <span className="font-medium text-white/30">· {eros.length}</span></span>
              <ChevronDown size={15} className={`text-white/35 transition-transform ${openAct === '__eros' || filter ? 'rotate-180' : ''}`} />
            </button>
            {(openAct === '__eros' || !!filter) && (
              <div className="border-t border-white/[0.06] px-2 sm:px-3 pb-3">
                {eros.map((a) => <SectionList key={a.name} nodes={a.children} nav={nav} filter={filter} />)}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-10"><UnofficialNote index={index} /></div>
    </div>
  );
}

function flatSections(nodes: LawNode[], out: LawSection[] = []): LawSection[] {
  for (const n of nodes) { if (n.k === 'sec') out.push(n); else flatSections(n.children, out); }
  return out;
}

function SectionView({ id, nav, index, toast }: { id: string; nav: Nav; index: LawLibraryIndex | null; toast: (m: string) => void }) {
  const { data, error, loading } = useJson<{ section: LawSection; chapter: { n: string; title: string }; path: string[] }>(`/section/${encodeURIComponent(id)}`);
  const isConst = id.startsWith('const-');
  const { data: chapter } = useJson<LawChapter>(!isConst && data ? `/mcl/${encodeURIComponent(data.chapter.n)}` : null);
  const { data: constitution } = useJson<Constitution>(isConst ? '/constitution' : null);
  const [showEditorial, setShowEditorial] = useState(false);

  const siblings = useMemo(() => {
    const list = isConst ? (constitution?.articles.flatMap((a) => a.sections) ?? []) : chapter ? flatSections(chapter.children) : [];
    const i = list.findIndex((s) => s.id === id);
    return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
  }, [isConst, constitution, chapter, id]);

  useEffect(() => {
    if (data) pushRecent({ id, title: data.section.catch, cite: citeOf(data.section) });
    setShowEditorial(false);
    window.scrollTo?.({ top: 0 });
  }, [data, id]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? 'Missing data'} />;
  const { section: s, chapter: ch, path } = data;
  const official = officialUrlFor(s.id);
  const cite = citeOf(s);
  const route: Route = { kind: 'section', id: s.id };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/40" aria-label="Breadcrumb">
        <button className="hover:text-white" onClick={() => nav.go(isConst ? { kind: 'constitution' } : { kind: 'chapter', n: ch.n })}>
          {isConst ? 'Constitution' : `Ch. ${ch.n} · ${titleCase(ch.title)}`}
        </button>
        {path.map((p, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={11} className="text-white/20" />
            <button className="hover:text-white text-left" onClick={() => nav.go(isConst ? { kind: 'constitution', article: id.split('-')[1] } : { kind: 'chapter', n: ch.n, act: i === 0 ? escapeRe(p) : undefined })}>{titleCase(p)}</button>
          </React.Fragment>
        ))}
      </nav>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="px-3 py-1.5 rounded-xl text-[12px] font-black font-mono" style={{ color: VIOLET, background: `${VIOLET}18` }}>{cite}</span>
        {s.repealed && <Chip color={MAGENTA}>Repealed</Chip>}
        <Chip color="#ffffff">Unofficial copy</Chip>
      </div>
      <h1 className="mt-4 text-2xl sm:text-4xl font-black tracking-tight leading-[1.1]">{s.catch || cite}</h1>
      <p className="mt-2 text-[11px] text-white/30">The heading above is the Legislature's catchline — a summary, not part of the law.</p>

      {/* actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => nav.share(route, `${cite} — ${s.catch}`)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest hover:brightness-95">
          <Share2 size={13} /> Share
        </button>
        <button onClick={async () => { try { await navigator.clipboard.writeText(cite); toast('Citation copied'); } catch { toast('Copy not available'); } }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/75 hover:text-white">
          <Copy size={13} /> Cite
        </button>
        {official && (
          <a href={official} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/75 hover:text-white">
            <ExternalLink size={13} /> Official text
          </a>
        )}
      </div>

      <div className="mt-8 rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-transparent p-5 sm:p-8">
        {s.label && <p className="mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">{isConst ? `Section ${s.label}` : `Sec. ${s.label}`}</p>}
        <Body blocks={s.body} />
      </div>

      {(s.hist.length > 0 || s.notes.length > 0) && (
        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <button onClick={() => setShowEditorial((v) => !v)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left">
            <History size={14} className="text-white/40" />
            <span className="flex-1 text-[12px] font-black text-white/70">History &amp; notes <span className="font-medium text-white/35">— editorial, not part of the law</span></span>
            <ChevronDown size={15} className={`text-white/35 transition-transform ${showEditorial ? 'rotate-180' : ''}`} />
          </button>
          {showEditorial && (
            <div className="px-5 pb-5 space-y-4 text-[12px] text-white/55 leading-relaxed">
              {s.hist.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">History</p>
                  <ul className="space-y-1">{s.hist.map((h, i) => <li key={i} className="font-mono text-[11px]">{h}</li>)}</ul>
                </div>
              )}
              {s.notes.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Notes</p>
                  {s.notes.map((n, i) => <p key={i} className="whitespace-pre-line">{n}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* prev / next */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {siblings.prev ? (
          <button onClick={() => nav.go({ kind: 'section', id: siblings.prev!.id })} className="text-left rounded-2xl border border-white/[0.07] p-4 hover:bg-white/[0.04]">
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/35"><ChevronLeft size={12} /> Previous</span>
            <span className="mt-1 block text-[12px] font-bold text-white/75 line-clamp-2">{citeOf(siblings.prev)} · {siblings.prev.catch}</span>
          </button>
        ) : <span />}
        {siblings.next ? (
          <button onClick={() => nav.go({ kind: 'section', id: siblings.next!.id })} className="text-right rounded-2xl border border-white/[0.07] p-4 hover:bg-white/[0.04]">
            <span className="flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-widest text-white/35">Next <ChevronRight size={12} /></span>
            <span className="mt-1 block text-[12px] font-bold text-white/75 line-clamp-2">{citeOf(siblings.next)} · {siblings.next.catch}</span>
          </button>
        ) : <span />}
      </div>

      <div className="mt-10"><UnofficialNote index={index} compact /></div>
    </article>
  );
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── Shell ────────────────────────────────────────────────────────────────────
export interface TerraLawLibraryProps {
  onBack?: () => void;
  /** Initial route param (same format as the `law` URL param). Defaults to the URL. */
  initial?: string | null;
  /** Keep the address bar in sync so any screen can be shared (default true). */
  syncUrl?: boolean;
}

const TerraLawLibrary: React.FC<TerraLawLibraryProps> = ({ onBack, initial, syncUrl = true }) => {
  const startParam = initial ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('law') : null);
  const [stack, setStack] = useState<Route[]>(() => {
    const r = routeFromParam(startParam);
    return r.kind === 'home' ? [r] : [{ kind: 'home' }, r];
  });
  const route = stack[stack.length - 1];
  const [query, setQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const { data: index } = useJson<LawLibraryIndex>('');

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  useEffect(() => {
    if (!syncUrl) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'law');
      url.searchParams.set('law', paramFor(route));
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* URL sync is a convenience */ }
    scroller.current?.scrollTo({ top: 0 });
  }, [route, syncUrl]);

  const leave = useCallback(() => {
    if (syncUrl) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('law');
        if (url.searchParams.get('view') === 'law') url.searchParams.delete('view');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch { /* ignore */ }
    }
    onBack?.();
  }, [onBack, syncUrl]);

  const nav: Nav = useMemo(() => ({
    go: (r) => { setQuery(''); setStack((s) => [...s, r]); },
    share: async (r, title) => {
      const res = await shareOrCopy(lawShareUrl(r), title);
      toast(res === 'copied' ? 'Link copied — paste it anywhere' : res === 'shared' ? 'Shared' : 'Sharing not available');
    },
  }), [toast]);

  const back = () => { if (query) { setQuery(''); return; } if (stack.length > 1) setStack((s) => s.slice(0, -1)); else leave(); };

  const title = route.kind === 'home' ? 'Law Library' : route.kind === 'constitution' ? 'Constitution' : route.kind === 'chapter' ? `Chapter ${route.n}` : 'Section';

  return (
    <div ref={scroller} className="h-full overflow-y-auto custom-scrollbar bg-[#08070d] text-white">
      {/* top bar */}
      <div className="sticky top-0 z-30 bg-[#08070d]/95 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button onClick={back} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors" aria-label="Back">
            <ArrowLeft size={15} />
          </button>
          <button onClick={() => { setQuery(''); setStack([{ kind: 'home' }]); }} className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${VIOLET}, ${MAGENTA})` }}>
              <Scale size={15} className="text-white" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[13px] font-black leading-none">Terra Law</span>
              <span className="block text-[10px] text-white/40 leading-tight truncate">{title}</span>
            </span>
          </button>
          <div className="flex-1" />
          {route.kind !== 'home' && (
            <div className="hidden md:block w-72"><SearchBox value={query} onChange={(q) => { setQuery(q); if (q) setStack((s) => [...s.filter((r) => r.kind === 'home').slice(0, 1)]); }} /></div>
          )}
          <button onClick={() => nav.share(route, title === 'Law Library' ? 'Michigan Law Library on Plajah' : title)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors" aria-label="Share this page">
            <Share2 size={15} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={paramFor(route) + (query ? ':q' : '')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {route.kind === 'home' && <HomeView index={index} nav={nav} query={query} setQuery={setQuery} />}
          {route.kind === 'constitution' && <ConstitutionView article={route.article} nav={nav} index={index} />}
          {route.kind === 'chapter' && <ChapterView n={route.n} act={route.act} nav={nav} index={index} />}
          {route.kind === 'section' && <SectionView id={route.id} nav={nav} index={index} toast={toast} />}
        </motion.div>
      </AnimatePresence>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 text-center">
        <p className="text-[10px] text-white/25">
          Source: {index?.source.publisher ?? 'Michigan Legislature'} · retrieved {index?.source.retrievedAt ?? '—'} · Unofficial copy, provided free to read on Plajah Terra.
        </p>
      </footer>
      <Toast msg={toastMsg} />
    </div>
  );
};

export default TerraLawLibrary;
