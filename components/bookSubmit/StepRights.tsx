import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Hash, Sparkles } from 'lucide-react';
import type { AiDisclosure, BookDraft, BookMetadata } from '../../services/bookmeta/types';
import { checkIsbn, ISBN_GUIDANCE } from '../../services/bookmeta/isbn';
import { LICENSES, copyrightLines } from '../../services/bookmeta/copyright';
import type { A11yResult } from '../../services/bookmeta/accessibility';
import { Card, Choice, Field, Toggle, hintCls, inputCls } from './ui';

export const COUNTRIES: [string, string][] = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['DE', 'Germany'], ['FR', 'France'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['CH', 'Switzerland'], ['AT', 'Austria'], ['BE', 'Belgium'], ['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['EG', 'Egypt'], ['ET', 'Ethiopia'],
  ['IN', 'India'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'], ['PH', 'Philippines'], ['ID', 'Indonesia'], ['MY', 'Malaysia'], ['SG', 'Singapore'], ['JP', 'Japan'], ['KR', 'South Korea'],
  ['CN', 'China'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['IL', 'Israel'], ['TR', 'Turkey'], ['BR', 'Brazil'], ['MX', 'Mexico'], ['AR', 'Argentina'],
  ['CO', 'Colombia'], ['CL', 'Chile'], ['PE', 'Peru'], ['JM', 'Jamaica'], ['TT', 'Trinidad and Tobago'],
];

const AI_OPTS: { id: AiDisclosure; label: string; sub: string }[] = [
  { id: 'none', label: 'No AI', sub: 'Written / made entirely by people' },
  { id: 'assisted', label: 'AI-assisted', sub: 'I wrote it; AI helped edit, brainstorm or polish' },
  { id: 'generated', label: 'AI-generated', sub: 'AI produced the content (even if I edited it)' },
];

interface Props { draft: BookDraft; updateMeta: (p: Partial<BookMetadata>) => void; a11y: A11yResult }

export default function StepRights({ draft, updateMeta, a11y }: Props) {
  const m = draft.metadata;
  const [minting, setMinting] = useState(false);
  const [arkMsg, setArkMsg] = useState<string | null>(null);
  const isbn = useMemo(() => m.isbn.mode === 'own' ? checkIsbn(m.isbn.value) : null, [m.isbn]);
  const copy = useMemo(() => copyrightLines(m, isbn?.isbn13), [m, isbn]);

  const mint = async () => {
    setMinting(true); setArkMsg(null);
    try {
      const { arkAvailable, mintArk } = await import('../../services/registry/ark');
      if (!arkAvailable()) { updateMeta({ isbn: { mode: 'platform', value: '', ark: undefined } }); setArkMsg('Plajah will assign your permanent identifier when the book is approved.'); return; }
      const ark = mintArk('m');
      updateMeta({ isbn: { mode: 'platform', value: '', ark: ark ?? undefined } });
      setArkMsg(ark ? 'Identifier reserved.' : 'Identifier will be assigned on approval.');
    } catch { setArkMsg('Identifier will be assigned on approval.'); }
    finally { setMinting(false); }
  };

  const toggleCountry = (c: string) => updateMeta({ territories: { ...m.territories, countries: m.territories.countries.includes(c) ? m.territories.countries.filter(x => x !== c) : [...m.territories.countries, c] } });

  return (
    <div className="space-y-5">
      <Card title="Whose work is this?">
        <Toggle on={m.publicDomain} onChange={v => updateMeta({ publicDomain: v })} label="This is a public-domain work" sub="You are publishing an old work whose copyright has expired. You must add something of your own." />
        {m.publicDomain && (
          <Field label="What did you add? *" hint="New introduction, annotations, a new translation, illustrations, editing. Without added value, stores treat it as a duplicate of the free versions.">
            <textarea rows={3} className={`${inputCls} resize-none`} value={m.publicDomainNote} onChange={e => updateMeta({ publicDomainNote: e.target.value })} />
          </Field>
        )}
        {!m.publicDomain && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Copyright holder"><input className={inputCls} value={m.copyrightHolder} onChange={e => updateMeta({ copyrightHolder: e.target.value })} placeholder="Your name or company" /></Field>
            <Field label="Copyright year"><input className={inputCls} inputMode="numeric" maxLength={4} value={m.copyrightYear} onChange={e => updateMeta({ copyrightYear: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
        )}
        <Field label="Licence">
          <select className={`${inputCls} appearance-none`} value={m.license} onChange={e => updateMeta({ license: e.target.value as BookMetadata['license'] })}>
            {LICENSES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <p className={hintCls}>“All rights reserved” is the default. Creative Commons lets readers share on your terms; you can still sell the book.</p>
        </Field>
      </Card>

      <Card title="ISBN & identifier" subtitle={ISBN_GUIDANCE.headline}>
        <Choice value={m.isbn.mode} onChange={mode => updateMeta({ isbn: { ...m.isbn, mode } })} options={[
          { id: 'none', label: 'No ISBN', sub: 'Fine for ebooks on Plajah' },
          { id: 'platform', label: 'Plajah identifier', sub: 'A permanent ARK id; free; stays yours to cite' },
          { id: 'own', label: 'My own ISBN', sub: 'You bought or were issued one' },
        ]} />
        {m.isbn.mode === 'own' && (
          <Field label="ISBN-13 (or ISBN-10)">
            <input className={`${inputCls} font-mono`} value={m.isbn.value} onChange={e => updateMeta({ isbn: { ...m.isbn, value: e.target.value } })} placeholder="978-0-306-40615-7" inputMode="numeric" />
            {m.isbn.value && isbn && (isbn.valid
              ? <p className="text-xs text-emerald-300 mt-1.5 flex items-center gap-1.5"><CheckCircle2 size={13} /> Valid {isbn.kind}{isbn.kind === 'ISBN-10' ? ` (converted: ${isbn.isbn13})` : ''}</p>
              : <p role="alert" className="text-xs text-red-300 mt-1.5">{isbn.reason}</p>)}
          </Field>
        )}
        {m.isbn.mode === 'platform' && (
          <div className="space-y-2">
            {m.isbn.ark ? <p className="font-mono text-sm text-amber-200 break-all flex items-center gap-2"><Hash size={14} />{m.isbn.ark}</p>
              : <button type="button" onClick={mint} disabled={minting} className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-2xl text-[11px] font-black uppercase tracking-widest border border-amber-400/40 text-amber-200"><Sparkles size={13} /> Reserve my identifier</button>}
            {arkMsg && <p className={hintCls}>{arkMsg}</p>}
          </div>
        )}
        <details className="text-sm"><summary className="text-[11px] font-black uppercase tracking-widest text-white/40 cursor-pointer min-h-[32px]">ISBN options, honestly</summary>
          <ul className="mt-2 space-y-2 text-white/55 text-[13px] leading-snug list-disc pl-5">{ISBN_GUIDANCE.points.map(p => <li key={p}>{p}</li>)}</ul></details>
      </Card>

      <Card title="Copyright page">
        <Toggle on={m.includeGeneratedCopyrightPage} onChange={v => updateMeta({ includeGeneratedCopyrightPage: v })} label="Add a generated copyright page" sub="Built from your details; goes right after the title page." />
        {m.includeGeneratedCopyrightPage && <div className="rounded-2xl bg-black/40 border border-white/10 p-4 text-[12px] text-white/60 leading-relaxed space-y-1.5">{copy.map((l, i) => <p key={i} className={i === 0 ? 'font-bold text-white/80' : ''}>{l}</p>)}</div>}
      </Card>

      <Card title="Where can it be sold?" subtitle="Non-exclusive: selling on Plajah never stops you selling anywhere else.">
        <Toggle on={m.territories.worldwide} onChange={v => updateMeta({ territories: { worldwide: v, countries: v ? [] : m.territories.countries } })} label="Worldwide" sub="Every country, now and in future" />
        {!m.territories.worldwide && (
          <div className="flex flex-wrap gap-1.5 max-h-52 overflow-auto p-1">{COUNTRIES.map(([c, n]) => (
            <button key={c} type="button" aria-pressed={m.territories.countries.includes(c)} onClick={() => toggleCountry(c)}
              className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] ${m.territories.countries.includes(c) ? 'border-amber-400/50 bg-amber-400/10 text-amber-100' : 'border-white/10 text-white/45 hover:text-white'}`}>{n}</button>))}</div>
        )}
      </Card>

      <Card title="AI disclosure" subtitle="Required. Stores ask the same question; being upfront is the safe choice, and it is shown to readers.">
        {(['text', 'images', 'translation'] as const).map(k => (
          <Field key={k} label={k === 'text' ? 'Text' : k === 'images' ? 'Images & cover' : 'Translation'}>
            <Choice value={m.ai[k]} onChange={v => updateMeta({ ai: { ...m.ai, [k]: v } })} options={AI_OPTS} />
          </Field>
        ))}
        {(m.ai.text !== 'none' || m.ai.images !== 'none' || m.ai.translation !== 'none') && (
          <Field label="Which tools? (optional)"><input className={inputCls} value={m.ai.tools} onChange={e => updateMeta({ ai: { ...m.ai, tools: e.target.value } })} placeholder="e.g. Claude for line edits; an image model for the cover" /></Field>
        )}
      </Card>

      <Card title={`Accessibility readiness: ${a11y.score}/100`} subtitle="Based on EPUB Accessibility 1.1 basics. A hint, not a certification.">
        <ul className="space-y-1.5">{a11y.items.map(i => (
          <li key={i.label} className="flex gap-2.5 text-sm">{i.ok ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" /> : <Circle size={16} className="text-white/25 flex-shrink-0 mt-0.5" />}
            <span className={i.ok ? 'text-white/70' : 'text-white/50'}>{i.label}{!i.ok && i.tip && <span className="block text-[11px] text-white/35">{i.tip}</span>}</span></li>))}</ul>
        <Toggle on={m.accessibility.altTextDeclared} onChange={v => updateMeta({ accessibility: { ...m.accessibility, altTextDeclared: v } })} label="Every meaningful image has alt text" sub="Tick only if it is true in your source file." />
        <Field label="Accessibility summary (optional)" hint="One or two sentences, shown to readers. E.g. “Text is reflowable and resizable; the table of contents is linked; images have descriptions.”">
          <textarea rows={2} className={`${inputCls} resize-none`} value={m.accessibility.summary} onChange={e => updateMeta({ accessibility: { ...m.accessibility, summary: e.target.value } })} />
        </Field>
      </Card>
    </div>
  );
}
