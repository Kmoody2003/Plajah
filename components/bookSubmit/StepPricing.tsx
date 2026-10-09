import React, { useMemo } from 'react';
import { Download, Lightbulb, Lock, ShieldCheck, X } from 'lucide-react';
import type { BookDraft, BookPricing } from '../../services/bookmeta/types';
import { CURRENCIES, PLATFORM_CUT_PCT, STRIPE_ESTIMATE, bundlePrice, formatMoney, royaltyBreakdown, sampleSplit, suggestPrice } from '../../services/bookmeta/pricing';
import { Card, Choice, Field, Toggle, hintCls, inputCls } from './ui';

interface Props { draft: BookDraft; updatePricing: (p: Partial<BookPricing>) => void }

export default function StepPricing({ draft, updatePricing }: Props) {
  const p = draft.pricing, m = draft.metadata;
  const chapters = (draft.manuscript?.chapters ?? []).filter(c => c.included && (c.kind ?? 'chapter') === 'chapter');
  const words = chapters.reduce((s, c) => s + c.wordCount, 0);
  const sug = useMemo(() => suggestPrice(words, m.genre), [words, m.genre]);
  const split = useMemo(() => sampleSplit(chapters, p.freeSamplePct, p.freeFirstChapters), [chapters, p.freeSamplePct, p.freeFirstChapters]);
  const currencies = Object.keys(p.prices);
  const addable = CURRENCIES.filter(c => !currencies.includes(c));
  const setPrice = (cur: string, v: string) => updatePricing({ prices: { ...p.prices, [cur]: v === '' ? 0 : Math.round(parseFloat(v) * 100) / 100 || 0 } });
  const promoDiscount = p.promo.enabled ? p.promo.pct : 0;

  return (
    <div className="space-y-5">
      <Card title="How do you want to sell it?">
        <Choice value={p.model} onChange={model => updatePricing({ model })} options={[
          { id: 'PAID', label: 'Paid', sub: 'Readers buy it once and own it' },
          { id: 'FREE', label: 'Free', sub: 'Open to everyone: great for a series starter' },
        ]} />
        <p className={hintCls}>Non-exclusive: you are never required to stay on Plajah, and you can sell the same book elsewhere at the same time.</p>
      </Card>

      {p.model === 'PAID' && (
        <>
          <Card title="List price" subtitle="Set your price in each currency you care about; readers see their own.">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-3 flex gap-3 text-sm">
              <Lightbulb size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-white/70 leading-snug">Suggested for ~{Math.round(words / 1000)}k words{m.genre ? ` in ${m.genre}` : ''}: <b className="text-white">{formatMoney(sug.suggested, 'USD')}</b> (range {formatMoney(sug.low, 'USD')} to {formatMoney(sug.high, 'USD')}).
                <span className="block text-[11px] text-white/35 mt-0.5">{sug.basis}</span>
                <button type="button" className="mt-1 text-[11px] font-black uppercase tracking-widest text-amber-300" onClick={() => updatePricing({ prices: { ...p.prices, USD: sug.suggested } })}>Use {formatMoney(sug.suggested, 'USD')}</button></div>
            </div>
            <div className="space-y-2">
              {currencies.map(cur => (
                <div key={cur} className="flex items-center gap-2">
                  <span className="w-14 text-xs font-black text-white/50">{cur}</span>
                  <input aria-label={`Price in ${cur}`} type="number" min={0} step={cur === 'JPY' ? 1 : 0.01} className={`${inputCls} !w-36`} value={p.prices[cur] || ''} onChange={e => setPrice(cur, e.target.value)} />
                  {currencies.length > 1 && <button type="button" aria-label={`Remove ${cur}`} onClick={() => { const n = { ...p.prices }; delete n[cur]; updatePricing({ prices: n }); }} className="p-2 text-white/30 hover:text-red-300"><X size={15} /></button>}
                </div>))}
              {addable.length > 0 && (
                <select aria-label="Add currency" className={`${inputCls} !w-44 appearance-none`} value="" onChange={e => e.target.value && updatePricing({ prices: { ...p.prices, [e.target.value]: p.prices.USD ?? 0 } })}>
                  <option value="">+ Add a currency</option>{addable.map(c => <option key={c}>{c}</option>)}
                </select>)}
            </div>
          </Card>

          <Card title="What you take home" subtitle={<>Plajah keeps <b className="text-white/70">{PLATFORM_CUT_PCT}%</b> of the sale price on direct sales. Card processing is extra: <b className="text-white/70">estimated</b> at {STRIPE_ESTIMATE.pct}% + {STRIPE_ESTIMATE.fixed.toFixed(2)} {STRIPE_ESTIMATE.fixedCurrency} per sale (a commonly published US card rate; your real fee depends on country and card, and is shown in Stripe).</>}>
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
              <thead><tr className="text-[10px] uppercase tracking-widest text-white/35 text-right"><th className="text-left font-black py-1">Price</th><th className="font-black">Plajah {PLATFORM_CUT_PCT}%</th><th className="font-black">Processing (est.)</th><th className="font-black text-amber-300">You keep</th><th className="font-black">Per 100 sales</th></tr></thead>
              <tbody>{currencies.filter(c => p.prices[c] > 0).map(cur => {
                const r = royaltyBreakdown(p.prices[cur], cur);
                return (<tr key={cur} className="border-t border-white/5 text-right tabular-nums text-white/70">
                  <td className="text-left py-2 font-bold text-white">{formatMoney(r.listPrice, cur)}</td><td>-{formatMoney(r.platformCut, cur)}</td>
                  <td>-{formatMoney(r.processingFee, cur)}{r.processingIsApprox ? '*' : ''}</td><td className="font-black text-amber-300">{formatMoney(r.authorTakeHome, cur)} <span className="text-white/30 font-normal">({r.takeHomePct}%)</span></td><td>{formatMoney(r.per100Sales, cur)}</td></tr>);
              })}</tbody></table></div>
            {currencies.some(c => c !== 'USD' && p.prices[c] > 0) && <p className={hintCls}>* The fixed part of the fee is applied in this currency without conversion, so treat it as a rough figure.</p>}
            {p.promo.enabled && p.prices.USD > 0 && <p className={hintCls}>With your {p.promo.pct}% launch code a USD sale nets {formatMoney(royaltyBreakdown(p.prices.USD, 'USD', p.promo.pct).authorTakeHome, 'USD')}.</p>}
          </Card>

          <Card title="Free sample" subtitle="Readers who can read a taste buy more often. The sample is real chapters, not a teaser page.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={`Free first chapters: ${p.freeFirstChapters}`}><input type="range" min={0} max={Math.max(1, Math.min(10, chapters.length))} value={p.freeFirstChapters} onChange={e => updatePricing({ freeFirstChapters: +e.target.value })} className="w-full accent-amber-400" /></Field>
              <Field label={`Or at least ${p.freeSamplePct}% of the book`}><input type="range" min={0} max={50} step={5} value={p.freeSamplePct} onChange={e => updatePricing({ freeSamplePct: +e.target.value })} className="w-full accent-amber-400" /></Field>
            </div>
            <p className="text-sm text-white/60">Readers get <b className="text-white">{split.freeIds.length} chapter{split.freeIds.length === 1 ? '' : 's'}</b> free (about {split.freePct}% · {split.freeWords.toLocaleString()} words).</p>
          </Card>

          <Card title="Launch options">
            <Toggle on={p.preorder.enabled} onChange={v => updatePricing({ preorder: { ...p.preorder, enabled: v } })} label="Take pre-orders" sub="Readers buy now and get the book on release day. Up to a year ahead." />
            {p.preorder.enabled && <Field label="Release date"><input type="date" className={inputCls} value={p.preorder.date} onChange={e => updatePricing({ preorder: { ...p.preorder, date: e.target.value } })} /></Field>}
            <Toggle on={p.promo.enabled} onChange={v => updatePricing({ promo: { ...p.promo, enabled: v } })} label="Launch discount code" sub="Share it with your list or on social media." />
            {p.promo.enabled && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Code"><input className={`${inputCls} uppercase`} value={p.promo.code} maxLength={20} onChange={e => updatePricing({ promo: { ...p.promo, code: e.target.value.toUpperCase() } })} placeholder="LAUNCH25" /></Field>
                <Field label="% off"><input type="number" min={1} max={90} className={inputCls} value={p.promo.pct} onChange={e => updatePricing({ promo: { ...p.promo, pct: +e.target.value } })} /></Field>
                <Field label="Ends"><input type="date" className={inputCls} value={p.promo.endsAt} onChange={e => updatePricing({ promo: { ...p.promo, endsAt: e.target.value } })} /></Field>
              </div>)}
            {m.seriesName && (
              <>
                <Toggle on={p.bundle.enabled} onChange={v => updatePricing({ bundle: { ...p.bundle, enabled: v } })} label={`Series bundle: ${m.seriesName}`} sub="Offer the whole series at a discount once more books are live." />
                {p.bundle.enabled && p.prices.USD > 0 && (
                  <Field label={`Bundle discount: ${p.bundle.discountPct}%`} hint={`Three books like this one would be ${formatMoney(bundlePrice([p.prices.USD, p.prices.USD, p.prices.USD], p.bundle.discountPct).bundle, 'USD')} instead of ${formatMoney(p.prices.USD * 3, 'USD')}.`}>
                    <input type="range" min={5} max={50} step={5} value={p.bundle.discountPct} onChange={e => updatePricing({ bundle: { ...p.bundle, discountPct: +e.target.value } })} className="w-full accent-amber-400" /></Field>)}
              </>)}
          </Card>
        </>
      )}

      <Card title="How readers receive it" subtitle="Buy-to-own: one price includes the file. We never charge extra to remove a restriction.">
        <div className="grid gap-2">
          {([
            { id: 'DOWNLOAD_OPEN', icon: Download, label: 'DRM-free download (default)', sub: 'A real, portable file that works in any reader. Ownership is recorded as a portable credential.' },
            { id: 'PLAJAH_ONLY', icon: Lock, label: 'Read in Plajah only', sub: 'Locked to the Plajah reader. Readers tend to prefer a file they can keep.' },
          ] as const).map(o => (
            <button key={o.id} type="button" aria-pressed={p.delivery === o.id} onClick={() => updatePricing({ delivery: o.id })}
              className={`flex items-start gap-3 p-4 rounded-2xl border text-left ${p.delivery === o.id ? 'border-amber-400/50 bg-amber-400/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
              <o.icon size={18} className={p.delivery === o.id ? 'text-amber-400' : 'text-white/30'} />
              <span><span className="block text-xs font-black uppercase tracking-widest text-white">{o.label}</span><span className="block text-[11px] text-white/45 mt-0.5 leading-snug">{o.sub}</span></span>
            </button>))}
        </div>
        {p.delivery === 'DOWNLOAD_OPEN' && (
          <Toggle on={p.watermark} onChange={v => updatePricing({ watermark: v })} label="Forensic watermark" sub="Stamps each download with the buyer's id so a leaked copy can be traced. It does not restrict reading." />
        )}
        <p className="text-[11px] text-white/30 flex items-center gap-1.5"><ShieldCheck size={12} /> Print edition: coming with Plajah print-on-demand (see the Print step).</p>
      </Card>
    </div>
  );
}
