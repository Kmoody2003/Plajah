import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Plus, Trash2, Download, Share2, Tag, Calendar,
  ChevronRight, FlaskConical, BookOpen, Microscope, Brain,
  Lightbulb, Database, FileText, Edit3, Check, X, Copy,
  Search, Filter, Bookmark, Clock, Link2, ExternalLink,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntryType = 'NOTE' | 'EXPERIMENT' | 'OBSERVATION' | 'HYPOTHESIS' | 'DATA' | 'LINK';

export interface ExperimentFields {
  hypothesis: string;
  method: string;
  results: string;
  conclusion: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface BookmarkSource {
  url: string;
  thumbnail?: string;
  name?: string;
  leagueId?: string;
}

export interface NotebookEntry {
  id: string;
  type: EntryType;
  title: string;
  content: string;
  experiment?: ExperimentFields;
  bookmarkSource?: BookmarkSource;
  tags: string[];
  discipline?: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const TYPE_META: Record<EntryType, { label: string; icon: React.ElementType; color: string; desc: string; scienceOnly?: boolean }> = {
  NOTE:        { label: 'Note',         icon: FileText,   color: '#60a5fa', desc: 'General research note or literature summary' },
  LINK:        { label: 'Bookmark',     icon: Bookmark,   color: '#FF8C00', desc: 'Bookmarked article, link, or resource' },
  OBSERVATION: { label: 'Observation',  icon: Microscope, color: '#fbbf24', desc: 'Direct observation or field log entry' },
  HYPOTHESIS:  { label: 'Hypothesis',   icon: Lightbulb,  color: '#a78bfa', desc: 'Testable prediction or theoretical proposition', scienceOnly: true },
  EXPERIMENT:  { label: 'Experiment',   icon: FlaskConical, color: '#06D6A0', desc: 'Structured experiment with hypothesis, method, results', scienceOnly: true },
  DATA:        { label: 'Dataset',      icon: Database,   color: '#34d399', desc: 'Raw data deposit or dataset description', scienceOnly: true },
};

const CONFIDENCE_META = {
  LOW:    { label: 'Low',    color: '#f87171' },
  MEDIUM: { label: 'Medium', color: '#fbbf24' },
  HIGH:   { label: 'High',   color: '#34d399' },
};

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function entryToMarkdown(entry: NotebookEntry): string {
  const TypeIcon = TYPE_META[entry.type].label;
  let md = `# ${entry.title}\n\n`;
  md += `**Type:** ${TypeIcon}  \n`;
  md += `**Date:** ${fmtDate(entry.createdAt)}  \n`;
  if (entry.tags.length) md += `**Tags:** ${entry.tags.join(', ')}  \n`;
  md += '\n---\n\n';
  md += entry.content + '\n';
  if (entry.experiment) {
    const { hypothesis, method, results, conclusion, confidence } = entry.experiment;
    md += `\n## Hypothesis\n${hypothesis}\n\n## Method\n${method}\n\n## Results\n${results}\n\n## Conclusion\n${conclusion}\n\n**Confidence:** ${confidence}\n`;
  }
  return md;
}

// ── Entry Editor ──────────────────────────────────────────────────────────────

const EntryEditor: React.FC<{
  entry: NotebookEntry;
  onChange: (entry: NotebookEntry) => void;
  onDelete: () => void;
  onShare: (entry: NotebookEntry) => void;
}> = ({ entry, onChange, onDelete, onShare }) => {
  const [tagInput, setTagInput] = useState('');
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const upd = (patch: Partial<NotebookEntry>) => onChange({ ...entry, ...patch, updatedAt: Date.now() });
  const updExp = (patch: Partial<ExperimentFields>) => upd({ experiment: { ...entry.experiment!, ...patch } });

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !entry.tags.includes(t)) upd({ tags: [...entry.tags, t] });
    setTagInput('');
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(entryToMarkdown(entry));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([entryToMarkdown(entry)], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${entry.title.replace(/\s+/g, '-').toLowerCase()}.md`; a.click();
  };

  const TypeIcon = TYPE_META[entry.type].icon as any;

  return (
    <div className="flex flex-col h-full">
      {/* Type + title */}
      <div className="px-6 pt-5 pb-4 border-b border-white/6">
        <div className="flex items-center gap-2 mb-3">
          <select value={entry.type} onChange={e => upd({ type: e.target.value as EntryType, experiment: e.target.value === 'EXPERIMENT' ? { hypothesis: '', method: '', results: '', conclusion: '', confidence: 'MEDIUM' } : undefined })}
            className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-white focus:outline-none cursor-pointer">
            {(Object.keys(TYPE_META) as EntryType[]).map(t => (
              <option key={t} value={t} className="bg-[#0d0d0d]">{TYPE_META[t].label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={copyMarkdown} className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-white/30 hover:text-white transition-all text-[9px] font-black flex items-center gap-1">
              {copied ? <><Check size={10} className="text-green-400" /> Copied</> : <><Copy size={10} /> Copy</>}
            </button>
            <button onClick={download} className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-white/30 hover:text-white transition-all"><Download size={11} /></button>
            <button onClick={() => onShare(entry)} className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-white/30 hover:text-white transition-all"><Share2 size={11} /></button>
            <button onClick={onDelete} className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-white/20 hover:text-red-400 transition-all"><Trash2 size={11} /></button>
          </div>
        </div>
        <input
          value={entry.title}
          onChange={e => upd({ title: e.target.value })}
          placeholder="Entry title…"
          className="w-full bg-transparent text-xl font-black text-white placeholder:text-white/15 focus:outline-none"
        />
        <p className="text-[8px] text-white/20 font-mono mt-1">{fmtDate(entry.createdAt)} · updated {fmtDate(entry.updatedAt)}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Bookmark source preview for LINK entries */}
        {entry.type === 'LINK' && entry.bookmarkSource && (
          <div className="flex gap-3 p-3 bg-[#FF8C00]/5 border border-[#FF8C00]/20 rounded-2xl">
            {entry.bookmarkSource.thumbnail && (
              <img src={entry.bookmarkSource.thumbnail} alt="" className="w-20 h-16 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {entry.bookmarkSource.name && (
                <p className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00] mb-1">{entry.bookmarkSource.name}</p>
              )}
              <a href={entry.bookmarkSource.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-black text-white/70 hover:text-white truncate transition-colors">
                <Link2 size={10} className="shrink-0 text-[#FF8C00]" />
                <span className="truncate">{entry.bookmarkSource.url}</span>
                <ExternalLink size={9} className="shrink-0 text-white/30" />
              </a>
            </div>
          </div>
        )}
        {/* Content */}
        <div>
          <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
            {entry.type === 'EXPERIMENT' ? 'Notes & Context' : entry.type === 'LINK' ? 'Notes' : 'Content'}
          </label>
          <textarea
            ref={textRef}
            value={entry.content}
            onChange={e => upd({ content: e.target.value })}
            placeholder={entry.type === 'EXPERIMENT' ? 'Background, materials, equipment, references…' : 'Write your research note, observation, or data description…'}
            rows={8}
            className="w-full px-3 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-white/20 resize-none leading-relaxed font-mono"
          />
        </div>

        {/* Experiment-specific fields */}
        {entry.type === 'EXPERIMENT' && entry.experiment && (
          <div className="space-y-4 p-4 bg-[#06D6A0]/5 border border-[#06D6A0]/20 rounded-2xl">
            <p className="text-[8px] font-black uppercase tracking-widest text-[#06D6A0]">Experiment Log</p>
            {[
              { key: 'hypothesis' as keyof ExperimentFields, label: 'Hypothesis', placeholder: 'State your testable prediction…' },
              { key: 'method'     as keyof ExperimentFields, label: 'Method',     placeholder: 'Describe your procedure and controls…' },
              { key: 'results'    as keyof ExperimentFields, label: 'Results',    placeholder: 'Record your observations and measurements…' },
              { key: 'conclusion' as keyof ExperimentFields, label: 'Conclusion', placeholder: 'Interpret your results relative to the hypothesis…' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">{label}</label>
                <textarea
                  value={entry.experiment![key] as string}
                  onChange={e => updExp({ [key]: e.target.value })}
                  placeholder={placeholder}
                  rows={3}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/8 rounded-xl text-sm text-white/80 placeholder:text-white/15 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            ))}
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Confidence Level</label>
              <div className="flex gap-2">
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map(c => (
                  <button key={c} onClick={() => updExp({ confidence: c })}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${entry.experiment!.confidence === c ? 'text-black' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'}`}
                    style={entry.experiment!.confidence === c ? { background: CONFIDENCE_META[c].color } : {}}>
                    {CONFIDENCE_META[c].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {entry.tags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-white/6 border border-white/10 rounded-full text-[9px] font-black text-white/50">
                #{t}
                <button onClick={() => upd({ tags: entry.tags.filter(x => x !== t) })} className="text-white/20 hover:text-red-400 transition-colors"><X size={9} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }}}
              placeholder="Add tag… (Enter or comma)"
              className="flex-1 px-3 py-1.5 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white placeholder:text-white/15 focus:outline-none" />
            <button onClick={addTag} className="px-3 py-1.5 bg-white/8 border border-white/12 rounded-xl text-xs text-white/50 hover:text-white transition-all"><Plus size={12} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export interface NotebookInitialEntry {
  title: string;
  content?: string;
  bookmarkSource?: BookmarkSource;
  tags?: string[];
}

interface Props {
  currentUser: any;
  onBack: () => void;
  context?: 'labs' | 'sports' | 'general';
  storageKeyOverride?: string;
  initialEntry?: NotebookInitialEntry;
}

const LabsNotebook: React.FC<Props> = ({ currentUser, onBack, context = 'labs', storageKeyOverride, initialEntry }) => {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EntryType | 'ALL'>('ALL');
  const [copied, setCopied] = useState(false);
  const initialEntryApplied = useRef(false);

  const storageKey = storageKeyOverride ?? `plajahNotebook_${currentUser?.uid ?? 'guest'}`;
  const visibleTypes = (Object.keys(TYPE_META) as EntryType[]).filter(t =>
    context === 'labs' ? true : !TYPE_META[t].scienceOnly
  );

  useEffect(() => {
    try { const s = localStorage.getItem(storageKey); if (s) setEntries(JSON.parse(s)); } catch {}
  }, [storageKey]);

  const save = (updated: NotebookEntry[]) => {
    setEntries(updated); localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const createEntry = (type: EntryType, preset?: Partial<NotebookEntry>) => {
    const entry: NotebookEntry = {
      id: uid_short(), type, title: preset?.title ?? '', content: preset?.content ?? '',
      tags: preset?.tags ?? [], createdAt: Date.now(), updatedAt: Date.now(),
      bookmarkSource: preset?.bookmarkSource,
      experiment: type === 'EXPERIMENT' ? { hypothesis: '', method: '', results: '', conclusion: '', confidence: 'MEDIUM' } : undefined,
    };
    const updated = [entry, ...entries]; save(updated); setSelectedId(entry.id);
  };

  // Create pre-filled LINK entry from initialEntry prop (once per mount)
  useEffect(() => {
    if (!initialEntry || initialEntryApplied.current) return;
    initialEntryApplied.current = true;
    const stored = localStorage.getItem(storageKey);
    const existingEntries: NotebookEntry[] = stored ? JSON.parse(stored) : [];
    const entry: NotebookEntry = {
      id: uid_short(), type: 'LINK',
      title: initialEntry.title,
      content: initialEntry.content ?? '',
      tags: initialEntry.tags ?? [],
      bookmarkSource: initialEntry.bookmarkSource,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    const updated = [entry, ...existingEntries];
    setEntries(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setSelectedId(entry.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateEntry = (entry: NotebookEntry) => save(entries.map(e => e.id === entry.id ? entry : e));
  const deleteEntry = (id: string) => { save(entries.filter(e => e.id !== id)); setSelectedId(null); };

  const handleShare = (entry: NotebookEntry) => {
    navigator.clipboard.writeText(entryToMarkdown(entry));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const filtered = entries.filter(e => {
    const matchType = filterType === 'ALL' || e.type === filterType;
    const matchVisible = visibleTypes.includes(e.type) || context === 'labs';
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase()) || e.tags.some(t => t.includes(search.toLowerCase()));
    return matchType && matchVisible && matchSearch;
  });

  const selected = entries.find(e => e.id === selectedId) ?? null;

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className={context === 'sports' ? 'text-[#FF8C00]' : context === 'general' ? 'text-[#a78bfa]' : 'text-[#60a5fa]'} />
            <h1 className="font-black text-white text-sm">
              {context === 'sports' ? 'Research Notebook' : context === 'general' ? 'Research Notebook' : 'Lab Notebook'}
            </h1>
          </div>
          <p className="text-[8px] text-white/25 uppercase tracking-widest mt-0.5">
            {entries.length} entries · {context === 'sports' ? 'Plajah Sports' : context === 'general' ? 'Research' : 'Plajah Labs'}
          </p>
        </div>
        {copied && <span className="text-[9px] text-green-400 font-black">✓ Copied to clipboard</span>}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-72 shrink-0 border-r border-white/8 flex flex-col overflow-hidden">
          {/* Search + filter */}
          <div className="p-3 space-y-2 border-b border-white/6 shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries…"
                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none" />
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {(['ALL', ...visibleTypes] as (EntryType | 'ALL')[]).map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 transition-all ${filterType === t ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                  {t === 'ALL' ? 'All' : TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* New entry buttons */}
          <div className="p-3 border-b border-white/6 shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              {visibleTypes.map(t => {
                const M = TYPE_META[t]; const Icon = M.icon as any;
                return (
                  <button key={t} onClick={() => createEntry(t)}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-all text-left hover:bg-white/[0.04]"
                    style={{ borderColor: `${M.color}25`, background: `${M.color}08` }}>
                    <Icon size={11} style={{ color: M.color }} />
                    <span className="text-[9px] font-black text-white/60 truncate">{M.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 && (
              <div className="py-12 text-center">
                <BookOpen size={24} className="text-white/10 mx-auto mb-2" />
                <p className="text-[9px] text-white/20">No entries yet</p>
                <p className="text-[8px] text-white/12 mt-1">Choose a type above to get started</p>
              </div>
            )}
            {filtered.map(entry => {
              const M = TYPE_META[entry.type]; const Icon = M.icon as any;
              return (
                <button key={entry.id} onClick={() => setSelectedId(entry.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selectedId === entry.id ? 'border-white/20 bg-white/[0.06]' : 'border-transparent hover:bg-white/[0.03] hover:border-white/8'}`}>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${M.color}18` }}>
                      <Icon size={10} style={{ color: M.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${entry.title ? 'text-white' : 'text-white/25 italic'}`}>{entry.title || 'Untitled'}</p>
                      <p className="text-[8px] text-white/25 font-mono mt-0.5">{fmtDate(entry.updatedAt)}</p>
                      {entry.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {entry.tags.slice(0, 3).map(t => <span key={t} className="text-[7px] text-white/20">#{t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Editor ── */}
        <div className="flex-1 overflow-hidden">
          {selected ? (
            <EntryEditor
              entry={selected}
              onChange={updateEntry}
              onDelete={() => deleteEntry(selected.id)}
              onShare={handleShare}
            />
          ) : (
            <div className="h-full flex items-center justify-center flex-col gap-3">
              <div className="w-16 h-16 rounded-3xl bg-white/[0.04] border border-white/8 flex items-center justify-center">
                <Edit3 size={22} className="text-white/20" />
              </div>
              <p className="text-sm font-black text-white/20">Select an entry or create a new one</p>
              <button onClick={() => createEntry('NOTE')}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">
                <Plus size={12} /> New Note
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
};

export default LabsNotebook;
