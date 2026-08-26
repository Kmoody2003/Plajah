import React, { useMemo, useState } from 'react';
import { BookHeart, BookOpen, FileText, Hash, Pin, Plus, Search, Trash2 } from 'lucide-react';
import type { TelaBlock, TelaNoteEntry, TelaNoteKind, TelaNotesDevice } from '../../types';
import TelaWriter, { makeBlock } from './TelaWriter';

interface TelaNotesProps {
  device: TelaNotesDevice;
  readOnly?: boolean;
  onChange: (patch: Partial<TelaNotesDevice>) => void;
}

const KIND_META: Record<TelaNoteKind, { label: string; color: string }> = {
  NOTE: { label: 'Note', color: '#60A5FA' },
  JOURNAL: { label: 'Journal', color: '#D0BCFF' },
  LYRIC_IDEA: { label: 'Lyric idea', color: '#FF8C00' },
  POEM: { label: 'Poem', color: '#D40055' },
  OBSERVATION: { label: 'Observation', color: '#06D6A0' },
  RESEARCH: { label: 'Research', color: '#00DAF3' },
};

const noteId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const plain = (blocks: TelaBlock[]) => blocks.map(block => block.text.replace(/<[^>]+>/g, ' ')).join(' ').replace(/\s+/g, ' ').trim();

export function makeTelaNoteEntry(kind: TelaNoteKind = 'NOTE', title = ''): TelaNoteEntry {
  const now = Date.now();
  return {
    id: noteId('note'), kind, title,
    blocks: [makeBlock('p', '')], tags: [],
    createdAt: now, updatedAt: now, privacy: 'PRIVATE',
  };
}

const TelaNotes: React.FC<TelaNotesProps> = ({ device, readOnly, onChange }) => {
  const [query, setQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const active = device.entries.find(entry => entry.id === device.activeEntryId) || device.entries[0] || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...device.entries]
      .filter(entry => !q || `${entry.title} ${plain(entry.blocks)} ${entry.tags.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  }, [device.entries, query]);

  const updateEntry = (id: string, patch: Partial<TelaNoteEntry>) => {
    onChange({ entries: device.entries.map(entry => entry.id === id ? { ...entry, ...patch, updatedAt: Date.now() } : entry) });
  };
  const createEntry = (kind: TelaNoteKind) => {
    const entry = makeTelaNoteEntry(kind, kind === 'JOURNAL' ? `Journal · ${new Date().toLocaleDateString()}` : 'Untitled note');
    onChange({ entries: [entry, ...device.entries], activeEntryId: entry.id });
  };
  const deleteEntry = (id: string) => {
    const entries = device.entries.filter(entry => entry.id !== id);
    onChange({ entries, activeEntryId: device.activeEntryId === id ? entries[0]?.id : device.activeEntryId });
  };
  const addTag = () => {
    const value = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (active && value && !active.tags.includes(value)) updateEntry(active.id, { tags: [...active.tags, value] });
    setTagInput('');
  };

  return (
    <div className="h-full min-h-[440px] flex overflow-hidden" style={{ background: '#FBF9FC', color: '#1B1523', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
      <aside className="w-[230px] shrink-0 flex flex-col" style={{ background: '#17111E', color: '#fff', borderRight: '1px solid rgba(255,255,255,.08)' }}>
        <div className="p-3 border-b border-white/[.08]">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 rounded-[10px] grid place-items-center" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}><BookHeart size={15}/></span>
            <div className="min-w-0"><strong className="block text-[12px] truncate">{device.name || 'Tela Notes'}</strong><span className="block text-[8px] uppercase tracking-[.14em] text-white/35">Notes · journals · ideas</span></div>
          </div>
          <label className="h-8 px-2.5 flex items-center gap-2 rounded-[9px] bg-white/[.06] border border-white/[.08]">
            <Search size={12} className="text-white/35"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search everything" className="min-w-0 flex-1 bg-transparent outline-none text-[10px] text-white placeholder:text-white/25"/>
          </label>
          {!readOnly && <div className="grid grid-cols-2 gap-1.5 mt-2">
            <button onClick={() => createEntry('NOTE')} className="h-8 rounded-[9px] text-[9px] font-extrabold flex items-center justify-center gap-1.5 bg-white/[.08] text-white/75"><Plus size={11}/>Note</button>
            <button onClick={() => createEntry('JOURNAL')} className="h-8 rounded-[9px] text-[9px] font-extrabold flex items-center justify-center gap-1.5 text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}><BookOpen size={11}/>Journal</button>
          </div>}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map(entry => {
            const meta = KIND_META[entry.kind]; const selected = active?.id === entry.id;
            return <button key={entry.id} onClick={() => onChange({ activeEntryId: entry.id })} className="w-full text-left px-2.5 py-2 rounded-[10px]" style={{ background: selected ? 'rgba(255,255,255,.1)' : 'transparent', color: selected ? '#fff' : 'rgba(255,255,255,.62)' }}>
              <span className="flex items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-[.12em]" style={{ color: meta.color }}>{entry.pinned && <Pin size={8} fill="currentColor"/>}{meta.label}</span>
              <strong className="block mt-1 text-[11px] truncate">{entry.title || 'Untitled'}</strong>
              <span className="block mt-0.5 text-[8.5px] truncate text-white/28">{plain(entry.blocks) || 'Start writing…'}</span>
            </button>;
          })}
          {!filtered.length && <p className="px-3 py-5 text-center text-[9px] text-white/28">No notes found.</p>}
        </div>
        {device.domainBinding && <div className="px-3 py-2 text-[8px] leading-relaxed text-white/32 border-t border-white/[.08]">↔ {device.domainBinding.label || device.domainBinding.entity}<br/>Bidirectional Tela component</div>}
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {active ? <>
          <header className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-[#E7E0EA]">
            <div className="flex-1 min-w-0">
              <select disabled={readOnly} value={active.kind} onChange={event => updateEntry(active.id, { kind: event.target.value as TelaNoteKind })} className="text-[9px] font-extrabold uppercase tracking-[.12em] bg-transparent outline-none" style={{ color: KIND_META[active.kind].color }}>
                {(Object.keys(KIND_META) as TelaNoteKind[]).map(kind => <option key={kind} value={kind}>{KIND_META[kind].label}</option>)}
              </select>
              <input disabled={readOnly} value={active.title} onChange={event => updateEntry(active.id, { title: event.target.value })} className="block w-full bg-transparent outline-none text-[22px] font-black tracking-[-.025em] placeholder:text-[#1B1523]/20" placeholder="Untitled note"/>
            </div>
            {!readOnly && <>
              <button onClick={() => updateEntry(active.id, { pinned: !active.pinned })} title={active.pinned ? 'Unpin' : 'Pin'} className="w-8 h-8 grid place-items-center rounded-[9px]" style={{ color: active.pinned ? '#D40055' : '#8B8193', background: active.pinned ? 'rgba(212,0,85,.09)' : '#F0EBF3' }}><Pin size={13} fill={active.pinned ? 'currentColor' : 'none'}/></button>
              <button onClick={() => deleteEntry(active.id)} title="Delete note" className="w-8 h-8 grid place-items-center rounded-[9px] text-[#9B8795] bg-[#F0EBF3]"><Trash2 size={13}/></button>
            </>}
          </header>
          <div className="flex-1 min-h-0">
            <TelaWriter device={{ id: `${device.id}__${active.id}`, type: 'WRITER', mode: active.kind === 'JOURNAL' ? 'JOURNAL' : active.kind === 'POEM' ? 'POETRY' : 'NOTES', blocks: active.blocks }} readOnly={readOnly} onChangeBlocks={blocks => updateEntry(active.id, { blocks })}/>
          </div>
          <footer className="px-5 py-2.5 flex items-center gap-2 border-t border-[#E7E0EA] bg-[#F7F3F8]">
            <Hash size={12} className="text-[#8B8193]"/>
            <div className="flex gap-1 flex-wrap">{active.tags.map(tag => <button key={tag} disabled={readOnly} onClick={() => updateEntry(active.id, { tags: active.tags.filter(item => item !== tag) })} className="px-2 py-1 rounded-full text-[8px] font-bold bg-[#EDE5F0] text-[#6B596F]">#{tag}{!readOnly ? ' ×' : ''}</button>)}</div>
            {!readOnly && <><input value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }} placeholder="Add tag" className="ml-auto w-24 bg-transparent outline-none text-[9px] text-[#6B596F]"/><button onClick={addTag} className="w-7 h-7 grid place-items-center rounded-[8px] bg-[#EDE5F0] text-[#6B596F]"><Plus size={11}/></button></>}
          </footer>
        </> : <div className="h-full grid place-items-center text-center text-[#8B8193]"><div><FileText size={24} className="mx-auto mb-2 opacity-40"/><p className="text-[12px] font-bold">Start a note or journal entry.</p></div></div>}
      </main>
    </div>
  );
};

export default TelaNotes;
