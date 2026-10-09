import React, { useState } from 'react';
import { CheckCircle2, Clock, Download, Loader2, Send, XCircle } from 'lucide-react';
import type { BookDraft } from '../../services/bookmeta/types';
import type { PreflightResult } from '../../services/bookmeta/preflight';
import { submitBook, type SubmitOutcome } from '../../services/bookmeta/submitClient';
import { exportBookFromDraft, toDistributionCsv, toOnix } from '../../services/bookmeta/export';
import { formatMoney } from '../../services/bookmeta/pricing';
import { Card, FindingList, btnGhost, btnPrimary } from './ui';
import { ScoreRing, stepForFinding, type StepId } from './StepPreflight';

interface Props {
  draft: BookDraft;
  preflight: PreflightResult;
  update: (p: Partial<BookDraft>) => void;
  flush: () => Promise<void>;
  goTo: (s: StepId) => void;
  onFinishPublishing: (d: BookDraft, submissionId?: string) => void;
  onMyBooks: () => void;
}

const download = (name: string, mime: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export default function StepReview({ draft, preflight, update, flush, goTo, onFinishPublishing, onMyBooks }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<SubmitOutcome | null>(null);
  const m = draft.metadata, p = draft.pricing, acks = draft.acks;
  const author = m.penName || m.contributors.find(c => c.role === 'author')?.name || '';
  const canSubmit = preflight.ready && acks.contentPolicy && acks.rights && !busy;
  const slug = (m.title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'book';

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await flush(); setOut(await submitBook(draft)); }
    catch (e: any) { setErr(e?.message || 'Submission failed. Your draft is safe.'); }
    finally { setBusy(false); }
  };

  if (out) {
    const live = out.status === 'LIVE', rev = out.status === 'IN_REVIEW';
    return (
      <div className="space-y-5">
        <Card tone={live ? 'amber' : rev ? 'default' : 'danger'}>
          <div className="flex gap-4 items-start">
            {live ? <CheckCircle2 size={28} className="text-emerald-400 flex-shrink-0" /> : rev ? <Clock size={28} className="text-amber-400 flex-shrink-0" /> : <XCircle size={28} className="text-red-400 flex-shrink-0" />}
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white">{live ? 'Approved' : rev ? 'In review' : 'Needs changes'}</h3>
              <p className="text-sm text-white/65 mt-1">{out.summary}</p>
            </div>
          </div>
          {out.reasons.length > 0 && (
            <ul className="space-y-2">{out.reasons.map(r => (
              <li key={r.code + r.message} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{r.message}{r.fix && <span className="block text-xs text-white/45 mt-0.5">Fix: {r.fix}</span>}</li>))}</ul>)}
          <div className="flex flex-wrap gap-2">
            {live && <button type="button" className={btnPrimary} onClick={() => onFinishPublishing(draft, out.id)}><Send size={14} /> Finish publishing</button>}
            {!live && !rev && <button type="button" className={btnPrimary} onClick={() => { setOut(null); goTo('PREFLIGHT'); }}>Fix and resubmit</button>}
            <button type="button" className={btnGhost} onClick={onMyBooks}>My books</button>
          </div>
        </Card>
      </div>
    );
  }

  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-2 border-t border-white/5 first:border-0 text-sm"><dt className="text-white/40">{k}</dt><dd className="text-white/85 text-right min-w-0 break-words">{v}</dd></div>;

  return (
    <div className="space-y-5">
      <Card tone={preflight.ready ? 'default' : 'danger'}>
        <div className="flex items-center gap-4">
          <ScoreRing score={preflight.score} ready={preflight.ready} />
          <div><h3 className="text-base font-black text-white">{preflight.ready ? 'Ready to submit' : 'Fix these first'}</h3>
            <p className="text-sm text-white/50">{preflight.ready ? 'Your checklist is clear.' : `${preflight.blocking.length} blocking issue${preflight.blocking.length > 1 ? 's' : ''}.`}</p></div>
        </div>
        {!preflight.ready && <FindingList findings={preflight.blocking} onFix={f => goTo(stepForFinding(f))} />}
      </Card>

      <Card title="Summary">
        <div className="flex gap-4">
          {draft.cover?.url && <img src={draft.cover.url} alt="" className="w-20 rounded-lg shadow flex-shrink-0 self-start" style={{ aspectRatio: '1/1.6', objectFit: 'cover' }} />}
          <dl className="flex-1 min-w-0">
            {row('Title', <b>{m.title}{m.subtitle ? `: ${m.subtitle}` : ''}</b>)}
            {row('Author', author || '—')}
            {row('Language · genre', `${m.language.toUpperCase()} · ${m.genre || '—'}`)}
            {row('Length', `${preflight.stats.chapters} chapters · ${preflight.stats.words.toLocaleString()} words`)}
            {row('Price', p.model === 'FREE' ? 'Free' : Object.entries(p.prices).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c)).join(' · '))}
            {row('Delivery', p.delivery === 'DOWNLOAD_OPEN' ? `DRM-free download${p.watermark ? ' (watermarked per buyer)' : ''}` : 'Plajah reader only')}
            {row('Release', p.preorder.enabled ? `Pre-order → ${p.preorder.date}` : m.publicationDate || 'On approval')}
            {row('AI', m.ai.text === 'none' && m.ai.images === 'none' && m.ai.translation === 'none' ? 'None' : `text ${m.ai.text}, images ${m.ai.images}, translation ${m.ai.translation}`)}
            {row('Rights', `${m.territories.worldwide ? 'Worldwide' : m.territories.countries.join(', ')} · ${m.license}${m.publicDomain ? ' · public domain' : ''}`)}
          </dl>
        </div>
      </Card>

      <Card title="Before you submit">
        <label className="flex gap-3 items-start cursor-pointer min-h-[44px]"><input type="checkbox" checked={acks.contentPolicy} onChange={e => update({ acks: { ...acks, contentPolicy: e.target.checked } })} className="mt-1 w-5 h-5 accent-amber-400 flex-shrink-0" />
          <span className="text-sm text-white/75 leading-snug">I have read the Plajah content policy. This book contains no illegal content, no hate or harassment, and nothing sexual involving minors, and I have labelled any mature content.</span></label>
        <label className="flex gap-3 items-start cursor-pointer min-h-[44px]"><input type="checkbox" checked={acks.rights} onChange={e => update({ acks: { ...acks, rights: e.target.checked } })} className="mt-1 w-5 h-5 accent-amber-400 flex-shrink-0" />
          <span className="text-sm text-white/75 leading-snug">I own the rights to this book, or have the copyright holder's written permission, to publish and sell it in the territories I chose. If it is a public-domain work I have said so and added my own value. I understand false rights claims can lead to removal and account action.</span></label>
        <p className="text-[11px] text-white/35 leading-snug">Review is automated against the checklist above. Some books (public-domain, AI-generated text, mature content, low scores) get a quick spot check before going live. Your 5% platform cut is the only Plajah fee; you keep your rights and can sell anywhere else.</p>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <button type="button" disabled={!canSubmit} onClick={submit} className={btnPrimary}>{busy ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><Send size={14} /> Submit for publishing</>}</button>
        {!canSubmit && !busy && <p className="text-[11px] text-white/30">{!preflight.ready ? 'Clear the blocking items first.' : 'Tick both boxes to continue.'}</p>}
      </Card>

      <Card title="Take your book with you" subtitle="It is your book. Export the metadata any time to list it elsewhere.">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => download(`${slug}.onix.xml`, 'application/xml', toOnix(exportBookFromDraft(draft)))}><Download size={14} /> ONIX 3.0 (minimal)</button>
          <button type="button" className={btnGhost} onClick={() => download(`${slug}-distribution-pack.csv`, 'text/csv', toDistributionCsv([exportBookFromDraft(draft)]))}><Download size={14} /> Distribution CSV</button>
        </div>
        <p className="text-[11px] text-white/30 leading-snug">ONIX is a starting file, not validated against the full schema. The CSV uses common field groupings; storefronts change their forms, so map by meaning.</p>
      </Card>
    </div>
  );
}
