// Story Intelligence drafts inbox — what each watched upload produced, waiting for the account:
// the blog post, quote clips and store listings. Post or discard each; edit the article headline and
// any listing's name / price / link first. Auto-posted pieces show as posted, with their notice.

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Quote, ShoppingBag, Link2, Loader2, Check, X, RefreshCw, Sparkles, AlertTriangle, Clock, Image as ImageIcon, Package } from 'lucide-react';
import type { DraftState, ProductOffer, ReelloIntelJob } from '../../../services/reello/intel/types';
import { listIntel, postIntelDraft, discardIntelDraft, continueIntel } from '../../../services/reello/reelloApi';
import { autoNotice, formatClock, money, productHoldReason } from '../../../services/reello/intel/core';

const STAGE_LABEL: Record<string, string> = {
  WAITING_MEDIA: 'Waiting for the upload to finish processing', QUEUED: 'Queued', WATCHING: 'Watching and listening',
  DRAFTING: 'Writing the drafts', READY: 'Ready', FAILED: 'Failed', SKIPPED: 'Skipped',
};

const StatusPill: React.FC<{ d?: DraftState }> = ({ d }) => {
  if (!d) return null;
  if (d.status === 'POSTED') return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300"><Check size={12} />{d.auto ? 'Posted automatically' : 'Posted'}</span>;
  if (d.status === 'DISCARDED') return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/50">Discarded</span>;
  if (d.status === 'NEEDS_REVIEW') return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><AlertTriangle size={12} />Needs you</span>;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#00B4D8]/15 text-[#7fe3f5]">Draft</span>;
};

const Actions: React.FC<{ d?: DraftState; busy: boolean; onPost: () => void; onDiscard: () => void; postLabel?: string }> = ({ d, busy, onPost, onDiscard, postLabel = 'Post' }) => {
  if (!d || d.status === 'POSTED' || d.status === 'DISCARDED') return null;
  return (
    <div className="flex gap-2">
      <button disabled={busy} onClick={onPost} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00B4D8] text-black text-xs font-bold disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{postLabel}</button>
      <button disabled={busy} onClick={onDiscard} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-semibold disabled:opacity-50"><X size={13} />Discard</button>
    </div>
  );
};

const ProductCard: React.FC<{ job: ReelloIntelJob; o: ProductOffer; d?: DraftState; busy: boolean; act: (key: string, kind: 'post' | 'discard', edits?: unknown) => void }> = ({ job, o, d, busy, act }) => {
  const [name, setName] = useState(o.name);
  const [price, setPrice] = useState(o.price != null ? String(o.price) : '');
  const [url, setUrl] = useState(o.url || '');
  const editable = d && d.status !== 'POSTED' && d.status !== 'DISCARDED';
  const hold = d?.heldReason || (d?.status === 'DRAFT' ? productHoldReason(o) : null);
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
      {o.stillUrl ? <img src={o.stillUrl} alt="" className="w-24 h-16 object-cover rounded-lg shrink-0 bg-black" /> : <div className="w-24 h-16 rounded-lg bg-white/5 grid place-items-center shrink-0"><ImageIcon size={18} className="text-white/30" /></div>}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {editable ? <input value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[8rem] bg-transparent border-b border-white/10 text-sm font-semibold text-white focus:outline-none focus:border-[#00B4D8]" />
            : <span className="text-sm font-semibold text-white">{o.name}</span>}
          <StatusPill d={d} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
          {editable ? (
            <label className="inline-flex items-center gap-1">Price <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="—" className="w-20 bg-[#181820] border border-white/10 rounded px-1.5 py-0.5 text-white" /></label>
          ) : <span>{o.price != null ? money(o.price, o.currency) : 'No price'}</span>}
          {o.packages.filter(p => p.quantity > 1).map(p => <span key={p.quantity} className="inline-flex items-center gap-1"><Package size={12} />{p.quantity} for {money(p.price, o.currency)}</span>)}
          {o.promoCode && <span>Code <b className="text-white/80">{o.promoCode}</b></span>}
          <span className="inline-flex items-center gap-1"><Clock size={12} />{formatClock(o.tSec)} · {o.evidence === 'both' ? 'said + shown' : o.evidence === 'graphic' ? 'on screen' : o.evidence === 'description' ? 'in description' : 'said'}</span>
        </div>
        {editable ? <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Buy link (optional — sells through this link)" className="w-full bg-[#181820] border border-white/10 rounded px-2 py-1 text-xs text-white" />
          : o.url && <a href={o.url} target="_blank" rel="noreferrer" className="block text-xs text-[#7fe3f5] truncate">{o.url}</a>}
        {hold && editable && <p className="text-[11px] text-amber-300">{hold}</p>}
        <Actions d={d} busy={busy} postLabel={job.options.merchTarget.kind === 'ORG' ? `List in ${job.options.merchTarget.orgName || 'org'} store` : 'List in my store'}
          onPost={() => act(`product:${o.id}`, 'post', { name, url, ...(price.trim() && Number.isFinite(parseFloat(price)) ? { price: parseFloat(price) } : {}) })}
          onDiscard={() => act(`product:${o.id}`, 'discard')} />
      </div>
    </div>
  );
};

const JobCard: React.FC<{ job: ReelloIntelJob; onChange: (j: ReelloIntelJob) => void }> = ({ job, onChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [headline, setHeadline] = useState(job.article?.title || '');
  useEffect(() => { if (!headline && job.article?.title) setHeadline(job.article.title); }, [job.article?.title]);
  const r = job.report;
  const d = job.drafts || {};

  const act = async (key: string, kind: 'post' | 'discard', edits?: unknown) => {
    setBusy(key); setErr('');
    try {
      if (kind === 'post') {
        const r = await postIntelDraft(job.videoId, key, edits);
        onChange({ ...job, ...(r.article ? { article: r.article } : {}), drafts: { ...d, [key]: r.draft } });
      } else {
        onChange({ ...job, drafts: { ...d, [key]: await discardIntelDraft(job.videoId, key) } });
      }
    } catch (e: any) { setErr(e?.message || 'Something went wrong.'); }
    finally { setBusy(null); }
  };

  const working = job.status !== 'READY' && job.status !== 'FAILED' && job.status !== 'SKIPPED';
  return (
    <article className="rounded-2xl bg-[#111116] border border-white/10 overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b border-white/5">
        <Sparkles size={18} className="text-[#00B4D8] shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white truncate">{job.videoTitle}</h3>
          <p className="text-xs text-white/50">{STAGE_LABEL[job.status] || job.status}{working && job.progress?.pct ? ` · ${job.progress.pct}%` : ''}{job.progress?.note && working ? ` · ${job.progress.note}` : ''}{job.options.publishMode === 'AUTO' ? ' · posts automatically' : ''}</p>
        </div>
        {working && <Loader2 size={16} className="animate-spin text-white/40" />}
        {(job.status === 'WAITING_MEDIA' || job.status === 'QUEUED') && <button onClick={() => continueIntel(job.videoId).catch(() => {})} className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1"><RefreshCw size={12} />Check now</button>}
      </header>
      {job.error && <p className="px-4 pt-3 text-xs text-red-300">{job.error}</p>}
      {err && <p className="px-4 pt-3 text-xs text-red-300">{err}</p>}
      {r && (
        <div className="p-4 space-y-5">
          {r.summary && <p className="text-sm text-white/70 leading-relaxed">{r.summary}</p>}
          {r.stills.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {r.stills.map(s => <figure key={s.tSec} className="shrink-0 w-36"><img src={s.url} alt={s.caption || ''} className="w-36 h-20 object-cover rounded-lg bg-black" loading="lazy" /><figcaption className="text-[10px] text-white/40 mt-1 truncate">{formatClock(s.tSec)} {s.caption}</figcaption></figure>)}
            </div>
          )}

          {job.article && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"><FileText size={14} />Blog post <StatusPill d={d.article} /></h4>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                {d.article?.status === 'DRAFT' || d.article?.status === 'NEEDS_REVIEW'
                  ? <input value={headline} onChange={e => setHeadline(e.target.value)} className="w-full bg-transparent text-base font-bold text-white border-b border-white/10 focus:outline-none focus:border-[#00B4D8]" />
                  : <p className="text-base font-bold text-white">{job.article.title}</p>}
                <p className="text-xs text-white/50">{job.article.subtitle}</p>
                <details className="text-sm text-white/70">
                  <summary className="cursor-pointer text-xs text-[#7fe3f5]">Read the draft</summary>
                  <div className="mt-2 space-y-2">
                    {job.article.blocks.map((b, i) => b.type === 'HEADING' ? <h5 key={i} className="font-bold text-white">{b.content}</h5>
                      : b.type === 'QUOTE' ? <blockquote key={i} className="border-l-2 border-[#00B4D8] pl-3 italic">“{b.content}”<span className="block not-italic text-[11px] text-white/40">{b.caption}</span></blockquote>
                      : b.type === 'IMAGE' ? <img key={i} src={b.content} alt={b.caption || ''} className="rounded-lg max-h-40" loading="lazy" />
                      : b.type === 'VIDEO' ? <p key={i} className="text-xs text-[#7fe3f5]">▶ {b.caption} — {b.content}</p>
                      : <p key={i} className="whitespace-pre-line">{b.content}</p>)}
                  </div>
                </details>
                {d.article?.auto && <p className="text-[11px] italic text-white/40">{autoNotice(job.accountName, job.videoTitle)}</p>}
                {d.article?.heldReason && <p className="text-[11px] text-amber-300">{d.article.heldReason}</p>}
                <Actions d={d.article} busy={busy === 'article'} onPost={() => act('article', 'post', headline && headline !== job.article!.title ? { title: headline } : undefined)} onDiscard={() => act('article', 'discard')} />
              </div>
            </section>
          )}

          {r.quotes.some(q => d[`clip:${q.id}`]) && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"><Quote size={14} />Quote clips</h4>
              {r.quotes.filter(q => d[`clip:${q.id}`]).map(q => (
                <div key={q.id} className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  {q.stillUrl && <img src={q.stillUrl} alt="" className="w-24 h-16 object-cover rounded-lg shrink-0 bg-black" loading="lazy" />}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm text-white italic">“{q.text}”</p>
                    <p className="text-xs text-white/50">{q.speaker ? `${q.speaker} · ` : ''}{formatClock(q.startSec)}–{formatClock(q.endSec)}{q.why ? ` · ${q.why}` : ''}</p>
                    <div className="flex items-center gap-2"><StatusPill d={d[`clip:${q.id}`]} /></div>
                    {d[`clip:${q.id}`]?.heldReason && <p className="text-[11px] text-amber-300">{d[`clip:${q.id}`].heldReason}</p>}
                    <Actions d={d[`clip:${q.id}`]} busy={busy === `clip:${q.id}`} postLabel="Post clip" onPost={() => act(`clip:${q.id}`, 'post')} onDiscard={() => act(`clip:${q.id}`, 'discard')} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {r.offers.some(o => d[`product:${o.id}`]) && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"><ShoppingBag size={14} />Offered in the video</h4>
              {r.offers.filter(o => d[`product:${o.id}`]).map(o => <ProductCard key={o.id} job={job} o={o} d={d[`product:${o.id}`]} busy={busy === `product:${o.id}`} act={act} />)}
            </section>
          )}

          {r.links.length > 0 && (
            <section className="space-y-1">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"><Link2 size={14} />Links found</h4>
              {r.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="block text-xs text-[#7fe3f5] truncate">{l.label ? `${l.label} — ` : ''}{l.url}{l.tSec != null ? ` · ${formatClock(l.tSec)}` : ''}</a>)}
            </section>
          )}
        </div>
      )}
    </article>
  );
};

const ReelloIntelDrafts: React.FC = () => {
  const [jobs, setJobs] = useState<ReelloIntelJob[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { listIntel().then(j => { setJobs(j); setErr(''); }).catch(e => setErr(e?.message || 'Could not load drafts.')); }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (err && !jobs) return <p className="text-sm text-red-300">{err}</p>;
  if (!jobs) return <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={16} className="animate-spin" />Loading drafts…</div>;
  if (!jobs.length) return (
    <div className="text-center py-16 text-white/50">
      <Sparkles size={28} className="mx-auto mb-3 text-[#00B4D8]" />
      <p className="text-sm">No Story Intelligence drafts yet.</p>
      <p className="text-xs mt-1">Turn it on for an upload and its blog post, quote clips and store listings show up here.</p>
    </div>
  );
  const waiting = jobs.reduce((n, j) => n + Object.values(j.drafts || {}).filter(d => d.status === 'DRAFT' || d.status === 'NEEDS_REVIEW').length, 0);
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">{waiting ? `${waiting} draft${waiting === 1 ? '' : 's'} waiting for you.` : 'Nothing waiting for approval.'}</p>
      {jobs.map(j => <JobCard key={j.videoId} job={j} onChange={nj => setJobs(js => (js || []).map(x => x.videoId === nj.videoId ? nj : x))} />)}
    </div>
  );
};

export default ReelloIntelDrafts;
