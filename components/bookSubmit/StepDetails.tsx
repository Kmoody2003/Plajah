import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { BookDraft, BookMetadata, ContributorRole } from '../../services/bookmeta/types';
import { MAX_BISAC, MAX_DESCRIPTION, MAX_KEYWORDS } from '../../services/bookmeta/types';
import { bisacByCode, searchBisac, THEMA_SECTIONS, isThemaShape } from '../../services/bookmeta/bisac';
import { sanitizeHtmlLite } from '../../services/bookmeta/util';
import { Card, Field, Meter, Toggle, hintCls, inputCls } from './ui';

export const LANGUAGES: [string, string][] = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['sv', 'Swedish'],
  ['pl', 'Polish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['he', 'Hebrew'], ['hi', 'Hindi'], ['bn', 'Bengali'],
  ['ur', 'Urdu'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['vi', 'Vietnamese'], ['id', 'Indonesian'], ['sw', 'Swahili'],
  ['yo', 'Yoruba'], ['ig', 'Igbo'], ['ha', 'Hausa'], ['zu', 'Zulu'], ['af', 'Afrikaans'], ['la', 'Latin'], ['el', 'Greek'],
];

export const GENRES = ['Literary Fiction', 'Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Thriller', 'Horror', 'Historical Fiction', 'Young Adult', "Children's",
  'Non-Fiction', 'Biography', 'Memoir', 'Self-Help', 'Business', 'Poetry', 'Graphic Novel', 'Academic', 'Textbook', 'Religion & Spirituality', 'Other'];

const ROLES: { id: ContributorRole; label: string }[] = [
  { id: 'author', label: 'Author' }, { id: 'editor', label: 'Editor' }, { id: 'translator', label: 'Translator' },
  { id: 'illustrator', label: 'Illustrator' }, { id: 'narrator', label: 'Narrator' }, { id: 'foreword', label: 'Foreword by' }, { id: 'cover_designer', label: 'Cover design' },
];
const WARNINGS = ['Violence', 'Graphic violence', 'Sexual content', 'Explicit sexual content', 'Strong language', 'Substance use', 'Self-harm', 'Abuse', 'Death or grief', 'Racism or hate speech'];

function Chips({ items, onRemove }: { items: { key: string; label: string }[]; onRemove: (k: string) => void }) {
  return <div className="flex flex-wrap gap-1.5">{items.map(i => (
    <span key={i.key} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-xs bg-amber-400/12 border border-amber-400/25 text-amber-100">
      {i.label}<button type="button" aria-label={`Remove ${i.label}`} onClick={() => onRemove(i.key)} className="p-1 text-amber-300/60 hover:text-white"><X size={11} /></button>
    </span>))}</div>;
}

interface Props { draft: BookDraft; updateMeta: (p: Partial<BookMetadata>) => void }

export default function StepDetails({ draft, updateMeta }: Props) {
  const m = draft.metadata;
  const [kw, setKw] = useState('');
  const [q, setQ] = useState('');
  const [warn, setWarn] = useState('');
  const hits = useMemo(() => searchBisac(q, 8).filter(h => !m.bisac.includes(h.code)), [q, m.bisac]);

  const setContrib = (i: number, p: Partial<{ name: string; role: ContributorRole }>) => updateMeta({ contributors: m.contributors.map((c, k) => k === i ? { ...c, ...p } : c) });
  const addKw = () => {
    const parts = kw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    updateMeta({ keywords: [...new Set([...m.keywords, ...parts])].slice(0, MAX_KEYWORDS) }); setKw('');
  };
  const wrap = (open: string, close: string) => {
    const el = document.getElementById('bk-desc') as HTMLTextAreaElement | null; if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    updateMeta({ description: value.slice(0, a) + open + (value.slice(a, b) || 'text') + close + value.slice(b) });
  };

  return (
    <div className="space-y-5">
      <Card title="Title & series">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *" className="sm:col-span-2" hint="Exactly as it appears on the cover. No “bestseller”, “free”, or price words.">
            <input className={inputCls} value={m.title} onChange={e => updateMeta({ title: e.target.value })} maxLength={220} />
          </Field>
          <Field label="Subtitle" className="sm:col-span-2"><input className={inputCls} value={m.subtitle} onChange={e => updateMeta({ subtitle: e.target.value })} maxLength={220} /></Field>
          <Field label="Series name"><input className={inputCls} value={m.seriesName} onChange={e => updateMeta({ seriesName: e.target.value })} /></Field>
          <Field label="Book # in series"><input className={inputCls} inputMode="decimal" value={m.seriesNumber} onChange={e => updateMeta({ seriesNumber: e.target.value })} placeholder="1" /></Field>
          <Field label="Edition" hint="E.g. “Second edition”, “Revised”. Leave blank for a first edition."><input className={inputCls} value={m.edition} onChange={e => updateMeta({ edition: e.target.value })} /></Field>
          <Field label="Language *">
            <select className={`${inputCls} appearance-none`} value={m.language} onChange={e => updateMeta({ language: e.target.value })}>
              {LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Who made it" subtitle="Add everyone who should be credited. Roles are exported to retailers (ONIX contributor roles).">
        <Field label="Pen name (optional)" hint="Shown as the author name on the store. Your legal name stays private.">
          <input className={inputCls} value={m.penName} onChange={e => updateMeta({ penName: e.target.value })} />
        </Field>
        <div className="space-y-2">
          {m.contributors.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label="Contributor name" className={`${inputCls} flex-1 min-w-0`} value={c.name} onChange={e => setContrib(i, { name: e.target.value })} placeholder="Full name" />
              <select aria-label="Role" className={`${inputCls} !w-36 appearance-none`} value={c.role} onChange={e => setContrib(i, { role: e.target.value as ContributorRole })}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button type="button" aria-label="Remove contributor" onClick={() => updateMeta({ contributors: m.contributors.filter((_, k) => k !== i) })} className="px-2 text-white/30 hover:text-red-300"><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => updateMeta({ contributors: [...m.contributors, { name: '', role: m.contributors.some(c => c.role === 'author') ? 'editor' : 'author' }] })}
            className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-400 min-h-[44px]"><Plus size={13} /> Add a person</button>
        </div>
      </Card>

      <Card title="Description" subtitle={`Up to ${MAX_DESCRIPTION.toLocaleString()} characters (the Ingram limit). Basic formatting only: paragraphs, bold, italics, lists.`}>
        <div className="flex gap-1.5 flex-wrap">
          {([['Bold', '<strong>', '</strong>'], ['Italic', '<em>', '</em>'], ['Paragraph', '<p>', '</p>'], ['List', '<ul><li>', '</li></ul>']] as const).map(([l, o, c]) =>
            <button key={l} type="button" onClick={() => wrap(o, c)} className="px-3 py-1.5 rounded-xl text-[11px] font-bold border border-white/10 text-white/60 hover:text-white min-h-[36px]">{l}</button>)}
        </div>
        <textarea id="bk-desc" rows={8} className={`${inputCls} resize-y font-mono text-[13px]`} value={m.description} onChange={e => updateMeta({ description: e.target.value })} placeholder="<p>Hook the reader in the first sentence…</p>" />
        <Meter value={m.description.length} max={MAX_DESCRIPTION} warnAt={MAX_DESCRIPTION * 0.9} />
        {m.description.trim() && (
          <details className="text-sm"><summary className="text-[11px] font-black uppercase tracking-widest text-white/40 cursor-pointer min-h-[32px]">Preview</summary>
            <div className="mt-2 prose prose-invert prose-sm max-w-none text-white/80 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeHtmlLite(m.description) }} /></details>
        )}
      </Card>

      <Card title="Genre, categories & keywords" subtitle="Categories (BISAC) and keywords are how readers find you. Pick up to 3 categories and 7 keywords.">
        <Field label="Genre">
          <select className={`${inputCls} appearance-none`} value={m.genre} onChange={e => updateMeta({ genre: e.target.value })}>
            <option value="">Select genre</option>{GENRES.map(g => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label={`Categories (BISAC) — ${m.bisac.length}/${MAX_BISAC}`} hint="A hand-compiled subset of common codes. Exports carry the code; check it against the current BISG list for retailer feeds.">
          <Chips items={m.bisac.map(c => ({ key: c, label: bisacByCode(c)?.label ?? c }))} onRemove={k => updateMeta({ bisac: m.bisac.filter(c => c !== k) })} />
          {m.bisac.length < MAX_BISAC && (
            <div className="relative mt-2">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input className={`${inputCls} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search: fantasy, memoir, personal finance, FIC031…" aria-label="Search categories" />
              {q && (
                <ul className="mt-1 rounded-2xl border border-white/10 bg-[#111] divide-y divide-white/5 max-h-56 overflow-auto">
                  {hits.length === 0 && <li className="px-4 py-3 text-xs text-white/40">No match. Try a shorter word.</li>}
                  {hits.map(h => (
                    <li key={h.code}><button type="button" className="w-full text-left px-4 py-2.5 hover:bg-white/5 min-h-[44px]" onClick={() => { updateMeta({ bisac: [...m.bisac, h.code] }); setQ(''); }}>
                      <span className="text-sm text-white">{h.label}</span><span className="ml-2 text-[10px] text-white/30 font-mono">{h.code}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
        <Field label={`Keywords — ${m.keywords.length}/${MAX_KEYWORDS}`} hint="Phrases a reader would type: “small town mystery”, “enemies to lovers”. No store names, no “free”.">
          <Chips items={m.keywords.map(k => ({ key: k, label: k }))} onRemove={k => updateMeta({ keywords: m.keywords.filter(x => x !== k) })} />
          {m.keywords.length < MAX_KEYWORDS && (
            <div className="flex gap-2 mt-2">
              <input className={inputCls} value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } }} placeholder="Type a keyword, press Enter" aria-label="Add keyword" />
              <button type="button" onClick={addKw} className="px-4 rounded-2xl bg-white/10 text-white text-xs font-black min-h-[44px]">Add</button>
            </div>
          )}
        </Field>
        <Field label="Thema (optional)" hint="International subject scheme used outside North America. Pick a section or type a full code.">
          <div className="flex flex-wrap gap-1.5 mb-2">{THEMA_SECTIONS.map(t => (
            <button key={t.code} type="button" title={t.label} onClick={() => updateMeta({ thema: m.thema.includes(t.code) ? m.thema.filter(x => x !== t.code) : [...m.thema, t.code].slice(0, 3) })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${m.thema.includes(t.code) ? 'border-amber-400/50 bg-amber-400/10 text-amber-100' : 'border-white/10 text-white/45'}`}>{t.code} · {t.label.split(',')[0]}</button>))}</div>
          {m.thema.some(t => !isThemaShape(t)) && <p className="text-xs text-red-300">One of those Thema codes is not valid.</p>}
        </Field>
      </Card>

      <Card title="Readers & content" subtitle="Honest labelling keeps you out of review trouble and gets the right readers.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Reading age: from"><input type="number" min={0} max={99} className={inputCls} value={m.audience.minAge ?? ''} onChange={e => updateMeta({ audience: { ...m.audience, minAge: e.target.value === '' ? null : +e.target.value } })} placeholder="any" /></Field>
          <Field label="to"><input type="number" min={0} max={99} className={inputCls} value={m.audience.maxAge ?? ''} onChange={e => updateMeta({ audience: { ...m.audience, maxAge: e.target.value === '' ? null : +e.target.value } })} placeholder="any" /></Field>
        </div>
        <Toggle on={m.matureContent} onChange={v => updateMeta({ matureContent: v, audience: v ? { ...m.audience, adult: true, minAge: Math.max(18, m.audience.minAge ?? 18) } : { ...m.audience, adult: false } })}
          label="Mature / adult content" sub="Explicit sexual content, graphic violence or similar. The book will be age-gated (18+)." />
        <Field label="Content warnings">
          <div className="flex flex-wrap gap-1.5">{WARNINGS.map(w => (
            <button key={w} type="button" aria-pressed={m.contentWarnings.includes(w)} onClick={() => updateMeta({ contentWarnings: m.contentWarnings.includes(w) ? m.contentWarnings.filter(x => x !== w) : [...m.contentWarnings, w] })}
              className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] ${m.contentWarnings.includes(w) ? 'border-amber-400/50 bg-amber-400/10 text-amber-100' : 'border-white/10 text-white/45 hover:text-white'}`}>{w}</button>))}
            {m.contentWarnings.filter(w => !WARNINGS.includes(w)).map(w => <span key={w} className="px-3 py-1.5 rounded-full text-xs border border-amber-400/50 bg-amber-400/10 text-amber-100">{w}</span>)}
          </div>
          <div className="flex gap-2 mt-2"><input className={inputCls} value={warn} onChange={e => setWarn(e.target.value)} placeholder="Another warning…" aria-label="Custom content warning" />
            <button type="button" className="px-4 rounded-2xl bg-white/10 text-white text-xs font-black min-h-[44px]" onClick={() => { if (warn.trim()) { updateMeta({ contentWarnings: [...m.contentWarnings, warn.trim()] }); setWarn(''); } }}>Add</button></div>
        </Field>
      </Card>

      <Card title="Dates">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Publication date" hint="When it goes on sale. Leave blank for “as soon as approved”."><input type="date" className={inputCls} value={m.publicationDate} onChange={e => updateMeta({ publicationDate: e.target.value })} /></Field>
          <Field label="Original publication date" hint="Only if it was published before (a re-release, a translation, a public-domain work)."><input type="date" className={inputCls} value={m.originalPublicationDate} onChange={e => updateMeta({ originalPublicationDate: e.target.value })} /></Field>
        </div>
        <p className={hintCls}>Pre-orders are set on the Pricing step.</p>
      </Card>
    </div>
  );
}
