import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Plus, Trash2, Copy, Check, Download, Search,
  ExternalLink, RefreshCw, BookOpen, FileText, X, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitationType = 'JOURNAL' | 'CONFERENCE' | 'BOOK' | 'PREPRINT' | 'THESIS' | 'WEBSITE' | 'DATASET' | 'OTHER';
export type ExportFormat = 'BIBTEX' | 'APA' | 'MLA' | 'CHICAGO' | 'VANCOUVER';

export interface Citation {
  id: string;
  type: CitationType;
  title: string;
  authors: string[];  // "Last, First" format
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  publisher?: string;
  city?: string;
  abstract?: string;
  collectionId?: string;
  createdAt: number;
}

export interface CitationCollection {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function formatAuthors(authors: string[]): { apa: string; mla: string; bibtex: string } {
  if (!authors.length) return { apa: 'Unknown', mla: 'Unknown', bibtex: 'Unknown' };
  const apa = authors.length > 7
    ? `${authors.slice(0, 6).join(', ')}, … ${authors[authors.length - 1]}`
    : authors.join(', ');
  const mla = authors.length === 1 ? authors[0]
    : authors.length === 2 ? `${authors[0]}, and ${authors[1]}`
    : `${authors[0]}, et al.`;
  const bibtex = authors.join(' and ');
  return { apa, mla, bibtex };
}

function citeKey(c: Citation): string {
  const first = c.authors[0]?.split(',')[0]?.toLowerCase().replace(/\s/g, '') ?? 'unknown';
  return `${first}${c.year ?? ''}`;
}

export function toBibTeX(c: Citation): string {
  const type = c.type === 'JOURNAL' ? 'article' : c.type === 'CONFERENCE' ? 'inproceedings' : c.type === 'BOOK' ? 'book' : c.type === 'PREPRINT' ? 'misc' : 'misc';
  const { bibtex } = formatAuthors(c.authors);
  const fields: [string, string | undefined][] = [
    ['author', bibtex],
    ['title', c.title ? `{${c.title}}` : undefined],
    ['year', c.year?.toString()],
    ['journal', c.journal],
    ['volume', c.volume],
    ['number', c.issue],
    ['pages', c.pages],
    ['doi', c.doi],
    ['url', c.url ?? (c.arxivId ? `https://arxiv.org/abs/${c.arxivId}` : undefined)],
    ['publisher', c.publisher],
    ['note', c.arxivId ? `arXiv:${c.arxivId}` : undefined],
  ];
  const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${type}{${citeKey(c)},\n${body}\n}`;
}

export function toAPA(c: Citation): string {
  const { apa } = formatAuthors(c.authors);
  const year = c.year ? ` (${c.year}).` : '.';
  const journal = c.journal ? ` *${c.journal}*` : '';
  const vol = c.volume ? `, *${c.volume}*` : '';
  const issue = c.issue ? `(${c.issue})` : '';
  const pages = c.pages ? `, ${c.pages}` : '';
  const doi = c.doi ? ` https://doi.org/${c.doi}` : '';
  return `${apa}${year} ${c.title}.${journal}${vol}${issue}${pages}.${doi}`;
}

export function toMLA(c: Citation): string {
  const { mla } = formatAuthors(c.authors);
  const journal = c.journal ? ` *${c.journal}*,` : '';
  const vol = c.volume ? ` vol. ${c.volume},` : '';
  const issue = c.issue ? ` no. ${c.issue},` : '';
  const year = c.year ? ` ${c.year},` : '';
  const pages = c.pages ? ` pp. ${c.pages}.` : '.';
  return `${mla}. "${c.title}."${journal}${vol}${issue}${year}${pages}`;
}

export function toChicago(c: Citation): string {
  const authors = c.authors.join(', ');
  const journal = c.journal ? ` *${c.journal}*` : '';
  const vol = c.volume ? ` ${c.volume}` : '';
  const issue = c.issue ? `, no. ${c.issue}` : '';
  const year = c.year ? ` (${c.year})` : '';
  const pages = c.pages ? `: ${c.pages}` : '';
  const doi = c.doi ? `. https://doi.org/${c.doi}` : '';
  return `${authors}. "${c.title}."${journal}${vol}${issue}${year}${pages}${doi}.`;
}

function formatCitation(c: Citation, fmt: ExportFormat): string {
  if (fmt === 'BIBTEX') return toBibTeX(c);
  if (fmt === 'APA') return toAPA(c);
  if (fmt === 'MLA') return toMLA(c);
  if (fmt === 'CHICAGO') return toChicago(c);
  return toAPA(c);
}

// ── DOI / arXiv fetch ─────────────────────────────────────────────────────────

async function fetchFromDOI(doi: string): Promise<Partial<Citation> | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'Plajah/1.0 (labs@plajah.com)' },
    });
    if (!res.ok) return null;
    const { message: w } = await res.json();
    return {
      type: (w.type === 'journal-article' ? 'JOURNAL' : w.type === 'proceedings-article' ? 'CONFERENCE' : w.type === 'book' ? 'BOOK' : 'OTHER') as CitationType,
      title: w.title?.[0] ?? '',
      authors: (w.author ?? []).map((a: any) => `${a.family ?? ''}, ${a.given ?? ''}`.trim().replace(/^, /, '')),
      year: w.published?.['date-parts']?.[0]?.[0],
      journal: w['container-title']?.[0],
      volume: w.volume,
      issue: w.issue,
      pages: w.page,
      doi: w.DOI,
      url: w.URL,
      abstract: w.abstract?.replace(/<[^>]+>/g, '').trim(),
    };
  } catch { return null; }
}

async function fetchFromArxiv(arxivId: string): Promise<Partial<Citation> | null> {
  try {
    const clean = arxivId.replace(/^arxiv:/i, '');
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${clean}`);
    if (!res.ok) return null;
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const entry = doc.querySelector('entry');
    if (!entry) return null;
    const title = entry.querySelector('title')?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    const abstract = entry.querySelector('summary')?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    const authors = Array.from(entry.querySelectorAll('author name')).map(a => {
      const parts = (a.textContent?.trim() ?? '').split(' ');
      return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}` : (a.textContent?.trim() ?? '');
    });
    const published = entry.querySelector('published')?.textContent?.slice(0, 10) ?? '';
    const year = published ? parseInt(published.slice(0, 4)) : undefined;
    return { type: 'PREPRINT', title, authors, year, arxivId: clean, abstract, url: `https://arxiv.org/abs/${clean}` };
  } catch { return null; }
}

// ── Citation Card ─────────────────────────────────────────────────────────────

const CitationCard: React.FC<{
  citation: Citation;
  format: ExportFormat;
  onDelete: () => void;
  index: number;
}> = ({ citation, format, onDelete, index }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatted = formatCitation(citation, format);

  const copy = () => {
    navigator.clipboard.writeText(formatted);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
      className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-snug">{citation.title || 'Untitled'}</p>
            <p className="text-[9px] text-white/40 mt-0.5">{citation.authors.slice(0, 3).join(', ')}{citation.authors.length > 3 ? ' et al.' : ''}{citation.year ? ` · ${citation.year}` : ''}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-white/6 text-white/30">{citation.type}</span>
            {citation.doi && (
              <a href={`https://doi.org/${citation.doi}`} target="_blank" rel="noreferrer"
                className="p-1 text-white/20 hover:text-white transition-colors"><ExternalLink size={11} /></a>
            )}
            {citation.arxivId && (
              <a href={`https://arxiv.org/abs/${citation.arxivId}`} target="_blank" rel="noreferrer"
                className="p-1 text-white/20 hover:text-white transition-colors"><ExternalLink size={11} /></a>
            )}
            <button onClick={onDelete} className="p-1 text-white/15 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
          </div>
        </div>

        {/* Formatted citation */}
        <div className="flex items-start gap-2 p-3 bg-black/20 border border-white/5 rounded-xl">
          <p className="flex-1 text-[10px] text-white/60 leading-relaxed font-mono">{formatted}</p>
          <button onClick={copy} className="shrink-0 p-1.5 bg-white/6 border border-white/10 rounded-lg text-white/30 hover:text-white transition-all">
            {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
          </button>
        </div>

        {/* Abstract toggle */}
        {citation.abstract && (
          <button onClick={() => setExpanded(e => !e)}
            className="mt-2 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors">
            {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />} Abstract
          </button>
        )}
        {expanded && citation.abstract && (
          <p className="mt-2 text-[10px] text-white/45 leading-relaxed">{citation.abstract}</p>
        )}
      </div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { currentUser: any; onBack: () => void; }

const FORMATS: ExportFormat[] = ['APA', 'MLA', 'CHICAGO', 'BIBTEX', 'VANCOUVER'];

const LabsCitationManager: React.FC<Props> = ({ currentUser, onBack }) => {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [collections, setCollections] = useState<CitationCollection[]>([]);
  const [format, setFormat] = useState<ExportFormat>('APA');
  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [search, setSearch] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<Partial<Citation>>({ type: 'JOURNAL', authors: [] });
  const [manualAuthors, setManualAuthors] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);

  const sKey = `labsCitations_${currentUser?.uid ?? 'guest'}`;
  React.useEffect(() => { try { const s = localStorage.getItem(sKey); if (s) setCitations(JSON.parse(s)); } catch {} }, [sKey]);
  const save = (updated: Citation[]) => { setCitations(updated); localStorage.setItem(sKey, JSON.stringify(updated)); };

  const addCitation = (data: Partial<Citation>) => {
    const c: Citation = { id: uid_short(), type: 'JOURNAL', title: '', authors: [], createdAt: Date.now(), ...data };
    save([c, ...citations]);
  };

  const lookup = async () => {
    if (!lookupInput.trim()) return;
    setLookupLoading(true); setLookupError('');
    const input = lookupInput.trim();
    let result: Partial<Citation> | null = null;
    if (/^10\.\d{4,}\//.test(input)) {
      result = await fetchFromDOI(input);
    } else if (/^\d{4}\.\d{4,}/.test(input) || /^arxiv:/i.test(input)) {
      result = await fetchFromArxiv(input);
    } else if (input.startsWith('http')) {
      const doi = input.match(/10\.\d{4,}\/\S+/)?.[0];
      if (doi) result = await fetchFromDOI(doi);
      else { setLookupError('Could not extract DOI from URL.'); setLookupLoading(false); return; }
    } else {
      setLookupError('Enter a DOI (10.XXXX/...), arXiv ID (YYYY.NNNNN), or URL containing a DOI.'); setLookupLoading(false); return;
    }
    if (result) { addCitation(result); setLookupInput(''); }
    else setLookupError('Could not fetch metadata. Check the identifier and try again.');
    setLookupLoading(false);
  };

  const handleManualAdd = () => {
    const authors = manualAuthors.split(';').map(s => s.trim()).filter(Boolean);
    addCitation({ ...manual, authors });
    setManual({ type: 'JOURNAL', authors: [] }); setManualAuthors(''); setShowManual(false);
  };

  const copyAll = () => {
    const all = citations.map(c => formatCitation(c, format)).join('\n\n');
    navigator.clipboard.writeText(all);
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadAll = () => {
    const ext = format === 'BIBTEX' ? '.bib' : '.txt';
    const all = citations.map(c => formatCitation(c, format)).join('\n\n');
    const blob = new Blob([all], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `references${ext}`; a.click();
  };

  const filtered = citations.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.authors.join(' ').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-[#60a5fa]" />
            <h1 className="font-black text-white text-sm">Citation Manager</h1>
          </div>
          <p className="text-[8px] text-white/25 uppercase tracking-widest mt-0.5">{citations.length} references · Plajah Labs</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* DOI / arXiv lookup */}
        <div className="p-5 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Import by DOI or arXiv ID</p>
          <div className="flex gap-3">
            <input
              value={lookupInput}
              onChange={e => setLookupInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="10.1234/example · or · 2301.12345 · or · arxiv:2301.12345"
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 font-mono focus:outline-none focus:border-white/25 transition-colors"
            />
            <button onClick={lookup} disabled={lookupLoading || !lookupInput.trim()}
              className="px-5 py-2.5 bg-[#60a5fa] text-black rounded-xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-2">
              {lookupLoading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />} Fetch
            </button>
            <button onClick={() => setShowManual(v => !v)}
              className="px-4 py-2.5 bg-white/6 border border-white/12 text-white/50 rounded-xl text-xs font-black uppercase hover:text-white transition-all flex items-center gap-1.5">
              <Plus size={12} /> Manual
            </button>
          </div>
          {lookupError && <p className="text-xs text-red-400 flex items-center gap-2"><X size={12} /> {lookupError}</p>}
        </div>

        {/* Manual entry */}
        <AnimatePresence>
          {showManual && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden p-5 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Manual Entry</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Title</label>
                  <input value={manual.title ?? ''} onChange={e => setManual(m => ({ ...m, title: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Authors (semicolon-separated, Last, First format)</label>
                  <input value={manualAuthors} onChange={e => setManualAuthors(e.target.value)} placeholder="Smith, John; Doe, Jane"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white font-mono focus:outline-none" />
                </div>
                {[['journal', 'Journal / Publisher', 'Journal of Science'], ['year', 'Year', '2024'], ['volume', 'Volume', '12'], ['issue', 'Issue', '3'], ['pages', 'Pages', '100-112'], ['doi', 'DOI', '10.1234/example']].map(([key, label, ph]) => (
                  <div key={key}>
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{label}</label>
                    <input value={(manual as any)[key] ?? ''} onChange={e => setManual(m => ({ ...m, [key]: key === 'year' ? +e.target.value || undefined : e.target.value }))}
                      placeholder={ph} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                ))}
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Type</label>
                  <select value={manual.type ?? 'JOURNAL'} onChange={e => setManual(m => ({ ...m, type: e.target.value as CitationType }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none cursor-pointer">
                    {['JOURNAL', 'CONFERENCE', 'BOOK', 'PREPRINT', 'THESIS', 'WEBSITE', 'DATASET', 'OTHER'].map(t => <option key={t} value={t} className="bg-[#0d0d0d]">{t}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={handleManualAdd} disabled={!manual.title}
                className="px-4 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase disabled:opacity-40">Add Citation</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        {citations.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search references…"
                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none" />
            </div>
            <div className="flex gap-1 p-1 bg-white/5 border border-white/8 rounded-xl">
              {FORMATS.map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${format === f ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>{f}</button>
              ))}
            </div>
            <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">
              {copiedAll ? <Check size={11} className="text-green-400" /> : <Copy size={11} />} Copy All
            </button>
            <button onClick={downloadAll} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">
              <Download size={11} /> Export {format === 'BIBTEX' ? '.bib' : '.txt'}
            </button>
          </div>
        )}

        {/* Citation list */}
        <div className="space-y-3">
          {filtered.length === 0 && citations.length === 0 && (
            <div className="py-16 text-center">
              <BookOpen size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No citations yet</p>
              <p className="text-[10px] text-white/15 mt-1">Paste a DOI or arXiv ID above to auto-import a reference</p>
            </div>
          )}
          {filtered.map((c, i) => (
            <CitationCard key={c.id} citation={c} format={format} onDelete={() => save(citations.filter(x => x.id !== c.id))} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default LabsCitationManager;
