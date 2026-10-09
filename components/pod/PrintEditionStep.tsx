// Author-facing print edition builder. Exported so the ebook-submission wizard (components/bookSubmit/) can mount it:
//   <PrintEditionStep album={{ id, title, artist, coverImage, description }} onSaved={...} />
// Honest about what is real: "Direct connect" = Plajah orders from the printer for you; "Export pack" = we build the
// files, you upload them in the printer's dashboard.
import React, { useEffect, useMemo, useState } from 'react';
import { TRIM_SIZES, BINDINGS, PAPER_OPTIONS, spineWidthIn, coverDimensions, preflight, spineTextMinPages } from '../../services/pod/printSpec';
import type { BindingType, PaperColor, PaperWeight, PrinterId } from '../../services/pod/podTypes';
import { computeRoyalty } from '../../services/pod/royalty';
import { podFetch, money, openPodFile } from './podApi';
import { usePodFlags } from '../../services/podFlagsClient';

export interface PrintEditionAlbum { id: string; title: string; artist?: string; coverImage?: string; description?: string; bookChapters?: Array<{ content?: string }> }
interface ProviderRow { id: PrinterId; name: string; configured: boolean; mode: 'direct' | 'export'; capabilities: { summary: string; hardcover: boolean; requiresPartnership: boolean }; guide?: { dashboardUrl: string; steps: string[]; notes: string[] } | null }

const ADDR0 = { name: '', street1: '', city: '', stateCode: '', postcode: '', countryCode: 'US', phone: '', email: '' };

const PrintEditionStepInner: React.FC<{ album: PrintEditionAlbum; onSaved?: (e: any) => void; ordering: boolean; preview: boolean }> = ({ album, onSaved, ordering, preview }) => {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [printer, setPrinter] = useState<PrinterId>('lulu');
  const [trimId, setTrimId] = useState('6x9');
  const [binding, setBinding] = useState<BindingType>('PERFECT_PAPERBACK');
  const [paper, setPaper] = useState('white-60');
  const [priceUsd, setPriceUsd] = useState('14.99');
  const [isbn, setIsbn] = useState('');
  const [listed, setListed] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msgs, setMsgs] = useState<Array<{ level: string; text: string }>>([]);
  const [error, setError] = useState('');
  const [quoteRes, setQuoteRes] = useState<any>(null);
  const [addr, setAddr] = useState(ADDR0);
  const [busy, setBusy] = useState('');

  useEffect(() => { podFetch('/providers').then(j => setProviders(j.providers)).catch(() => {}); }, []);
  useEffect(() => { // restore a saved edition
    podFetch(`/editions/${encodeURIComponent(album.id)}`).then(j => {
      const e = j.edition; if (!e || !j.owner) return;
      setPrinter(e.printer); setTrimId(e.trimId); setBinding(e.binding); setPaper(`${e.paperColor}-${e.paperWeight}`);
      setPriceUsd((e.listPriceCents / 100).toFixed(2)); setIsbn(e.isbn13 || ''); setListed(!!e.listedForSale); setPageCount(e.pageCount ?? null);
    }).catch(() => {});
  }, [album.id]);

  const [paperColor, paperWeight] = paper.split('-') as [PaperColor, string];
  const weight = Number(paperWeight) as PaperWeight;
  const estPages = useMemo(() => {
    if (pageCount) return pageCount;
    const chars = (album.bookChapters || []).reduce((s, c) => s + (c.content?.length || 0), 0);
    return Math.max(24, Math.ceil(chars / 1700) + 8);
  }, [pageCount, album.bookChapters]);

  const provider = providers.find(p => p.id === printer);
  const spine = spineWidthIn(printer, binding, estPages, paperColor, weight);
  const dims = coverDimensions(printer, binding, trimId, estPages, paperColor, weight);
  const pre = useMemo(() => preflight(printer, binding, trimId, estPages, paperColor, weight, isbn), [printer, binding, trimId, estPages, paperColor, weight, isbn]);
  const listCents = Math.round(parseFloat(priceUsd || '0') * 100) || 0;
  const per = quoteRes?.quote?.perCopyPrintCents;
  const roy = per !== undefined ? computeRoyalty({ listPriceCents: listCents, printCostCents: per, shippingCents: Math.round(quoteRes.quote.shippingCents), taxCents: Math.round(quoteRes.quote.taxCents) }) : null;
  const tooLow = quoteRes && listCents < quoteRes.minListPriceCents;

  const save = async () => {
    setSaving(true); setError('');
    try {
      const r = await podFetch(`/editions/${encodeURIComponent(album.id)}`, { method: 'PUT', json: {
        printer, trimId, binding, paperColor, paperWeight: weight, listPriceCents: listCents, isbn13: isbn || undefined, listedForSale: listed,
        title: album.title, author: album.artist, frontCoverUrl: album.coverImage, backCoverText: album.description,
      } });
      setPageCount(r.pageCount); setMsgs(r.preflight); onSaved?.(r);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  const getQuote = async () => {
    setBusy('quote'); setError('');
    try { setQuoteRes(await podFetch('/quote', { method: 'POST', json: { albumId: album.id, quantity: 1, address: addr.name ? addr : undefined, shippingLevel: 'MAIL' } })); }
    catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const orderCopies = async (proof: boolean, quantity: number) => {
    setBusy('order'); setError('');
    try { const r = await podFetch('/author-copies', { method: 'POST', json: { albumId: album.id, quantity, proof, address: addr, shippingLevel: 'MAIL' } }); window.location.href = r.url; }
    catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  // ── cover preview (SVG, scaled) ──
  const Preview = () => {
    if (!dims) return <p className="text-xs text-white/50">Cover size unavailable for this page count and binding.</p>;
    const W = 520, s = W / dims.widthIn, H = dims.heightIn * s;
    const bx = dims.bleedIn * s;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/40" role="img" aria-label="Cover wrap preview">
        <rect width={W} height={H} fill="#1f2937" />
        {album.coverImage && <image href={album.coverImage} x={dims.frontX0In * s} y={0} width={dims.trimWIn * s + bx} height={H} preserveAspectRatio="xMidYMid slice" />}
        <rect x={dims.spineX0In * s} y={0} width={Math.max(1, dims.spineIn * s)} height={H} fill="#111827" opacity="0.85" />
        <rect x={bx} y={bx} width={W - 2 * bx} height={H - 2 * bx} fill="none" stroke="#ef4444" strokeDasharray="4 3" />
        <line x1={dims.spineX0In * s} x2={dims.spineX0In * s} y1={0} y2={H} stroke="#3b82f6" />
        <line x1={dims.frontX0In * s} x2={dims.frontX0In * s} y1={0} y2={H} stroke="#3b82f6" />
        <text x={dims.backX0In * s + 10} y={H / 2} fill="#9ca3af" fontSize="12">Back</text>
        <text x={dims.frontX0In * s + 10} y={20} fill="#fff" fontSize="12">Front</text>
        <rect x={(dims.backX0In + dims.trimWIn - 2.25) * s} y={H - bx - 1.45 * s} width={2 * s} height={1.2 * s} fill="#fff" opacity="0.9" />
        <text x={(dims.backX0In + dims.trimWIn - 2.25) * s + 6} y={H - bx - 0.7 * s} fill="#374151" fontSize="10">{isbn ? 'ISBN barcode' : 'barcode area'}</text>
      </svg>
    );
  };

  // Until direct ordering is switched on, only export-pack printers are selectable (so no order buttons can appear).
  useEffect(() => { if (!ordering && provider?.mode === 'direct') { const first = providers.find(x => x.mode !== 'direct'); if (first) setPrinter(first.id); } }, [ordering, provider, providers]);
  const field = 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white';
  const sel = (v: string, set: (x: any) => void, children: React.ReactNode) => <select value={v} onChange={e => set(e.target.value)} className={field}>{children}</select>;
  return (
    <div className="space-y-6 text-white">
      {preview && <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Admin preview: not live for authors yet</p>}
      <div>
        <h3 className="text-lg font-black">Print edition</h3>
        <p className="text-xs text-white/50 mt-1">Pick a printer. <b>Direct connect</b> means Plajah sends print jobs to the printer for you. <b>Export pack</b> means we build print-ready files and you upload them yourself; no automatic connection exists.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {providers.filter(p => ordering || p.mode !== 'direct').map(p => (
          <button key={p.id} onClick={() => setPrinter(p.id)} className={`text-left rounded-xl border p-3 ${printer === p.id ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center justify-between"><span className="font-bold text-sm">{p.name}</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${p.mode === 'direct' ? (p.configured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300') : 'bg-sky-500/20 text-sky-300'}`}>
                {p.mode === 'direct' ? (p.configured ? 'Direct connect' : 'Direct (not set up)') : 'Export pack'}
              </span></div>
            <p className="text-[11px] text-white/50 mt-1">{p.capabilities.summary}</p>
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-xs text-white/60">Trim size{sel(trimId, setTrimId, TRIM_SIZES.map(t => <option key={t.id} value={t.id}>{t.label}  ({t.common})</option>))}</label>
          <label className="block text-xs text-white/60">Binding{sel(binding, setBinding, BINDINGS.map(b => <option key={b.id} value={b.id}>{b.label}</option>))}</label>
          <label className="block text-xs text-white/60">Paper{sel(paper, setPaper, PAPER_OPTIONS.map(p => <option key={`${p.color}-${p.weight}`} value={`${p.color}-${p.weight}`}>{p.label}</option>))}</label>
          <label className="block text-xs text-white/60">List price (USD)<input className={field} inputMode="decimal" value={priceUsd} onChange={e => setPriceUsd(e.target.value)} /></label>
          <label className="block text-xs text-white/60">ISBN-13 (optional; prints a barcode)<input className={field} value={isbn} onChange={e => setIsbn(e.target.value)} placeholder="978..." /></label>
          <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} disabled={provider?.mode !== 'direct'} /> Sell this print edition on Plajah {provider?.mode !== 'direct' && '(needs a direct-connect printer)'}</label>
        </div>
        <div className="space-y-2">
          <Preview />
          <p className="text-[11px] text-white/50">{pageCount ? `${pageCount} pages (built)` : `~${estPages} pages (estimate; save to build)`} · spine {spine.value === null ? 'n/a' : `${spine.value.toFixed(3)} in`}{!spine.verified && spine.value !== null ? ' (estimate)' : ''} · cover {dims ? `${dims.widthIn.toFixed(2)} x ${dims.heightIn.toFixed(2)} in (${dims.widthPx} x ${dims.heightPx} px @300dpi)` : 'n/a'}</p>
          <p className="text-[11px] text-white/40">Spine title prints only at {spineTextMinPages(printer).value}+ pages.</p>
        </div>
      </div>

      <ul className="space-y-1">{[...pre, ...msgs.filter(m => !pre.some(p => p.text === m.text))].map((m, i) => (
        <li key={i} className={`text-xs rounded px-2 py-1 ${m.level === 'error' ? 'bg-red-500/15 text-red-300' : m.level === 'warn' ? 'bg-amber-500/15 text-amber-200' : 'bg-white/5 text-white/60'}`}>{m.text}</li>))}</ul>

      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-purple-600 text-sm font-bold disabled:opacity-50">{saving ? 'Building files...' : 'Save and build files'}</button>
        <button onClick={() => openPodFile(album.id, 'interior.pdf')} disabled={!pageCount} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">Preview interior</button>
        <button onClick={() => openPodFile(album.id, 'cover-preview.pdf')} disabled={!pageCount} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">Preview cover (with guides)</button>
      </div>

      {provider?.mode === 'direct' ? (
        <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <h4 className="font-bold text-sm">Cost and royalty</h4>
          <p className="text-[11px] text-white/50">Enter a ship-to address to get a live printer quote{provider.configured ? '' : ' (the printer is not configured on this server, so only an illustrative estimate is possible)'}.</p>
          <div className="grid grid-cols-2 gap-2">{(['name', 'street1', 'city', 'stateCode', 'postcode', 'countryCode', 'phone', 'email'] as const).map(k => (
            <input key={k} className={field} placeholder={k} value={(addr as any)[k]} onChange={e => setAddr({ ...addr, [k]: e.target.value })} />))}</div>
          <button onClick={getQuote} disabled={!pageCount || busy === 'quote'} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">{busy === 'quote' ? 'Quoting...' : 'Get quote'}</button>
          {quoteRes && (
            <table className="w-full text-xs"><tbody>
              <tr><td className="py-1 text-white/60">Print cost per copy {quoteRes.quote.estimated && <em className="text-amber-300">(illustrative, not a printer price)</em>}</td><td className="text-right">{money(per)}</td></tr>
              <tr><td className="py-1 text-white/60">Shipping (passed through to buyer)</td><td className="text-right">{money(quoteRes.quote.shippingCents)}</td></tr>
              <tr><td className="py-1 text-white/60">Plajah 5% of list price</td><td className="text-right">-{money(roy!.platformCutCents)}</td></tr>
              <tr><td className="py-1 text-white/60">Payment fees (estimate, 2.9% + 30c)</td><td className="text-right">-{money(roy!.cardFeeCents)}</td></tr>
              <tr className="border-t border-white/10 font-bold"><td className="py-1">Your profit per copy</td><td className={`text-right ${roy!.authorProfitCents < 0 ? 'text-red-400' : 'text-emerald-300'}`}>{money(roy!.authorProfitCents)}</td></tr>
              <tr><td className="py-1 text-white/60">Minimum list price (profit at least $0)</td><td className="text-right">{money(quoteRes.minListPriceCents)}</td></tr>
            </tbody></table>
          )}
          {tooLow && <p className="text-xs text-red-300">Your price is below the minimum; buyers will not be able to check out until you raise it.</p>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => orderCopies(true, 1)} disabled={!pageCount || !provider.configured || !!busy || !addr.name} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">Order a proof copy (at cost)</button>
            <button onClick={() => { const n = parseInt(prompt('How many copies?', '10') || '0', 10); if (n > 0) orderCopies(false, n); }} disabled={!pageCount || !provider.configured || !!busy || !addr.name} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">Order author copies (at cost)</button>
          </div>
        </div>
      ) : provider && (
        <div className="rounded-xl border border-white/10 p-4 space-y-2">
          <h4 className="font-bold text-sm">Export pack for {provider.name}</h4>
          <p className="text-[11px] text-white/50">{provider.capabilities.requiresPartnership ? 'This printer\'s API needs a partnership with them, so there is no direct connection. ' : 'This printer has no public API. '}Download the files and upload them in their dashboard.</p>
          <div className="flex flex-wrap gap-2">{['interior.pdf', 'cover.pdf', 'metadata.csv', 'onix.xml'].map(f => (
            <button key={f} disabled={!pageCount} onClick={() => openPodFile(album.id, f, true)} className="px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40">{f}</button>))}</div>
          {provider.guide && <><ol className="list-decimal ml-5 text-xs text-white/70 space-y-1">{provider.guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <a className="text-xs text-sky-300 underline" href={provider.guide.dashboardUrl} target="_blank" rel="noreferrer noopener">Open {provider.name}</a>
            {provider.guide.notes.map((n, i) => <p key={i} className="text-[11px] text-white/40">{n}</p>)}</>}
        </div>
      )}
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  );
};

/** Launch-gated entry point (config/podFlags). Authors see a calm "coming soon" card until a print flag is on; admins preview. */
export const PrintEditionStep: React.FC<{ album: PrintEditionAlbum; onSaved?: (e: any) => void }> = ({ album, onSaved }) => {
  const flags = usePodFlags();
  const live = flags.enabled('PRINT_EXPORT_PACKS') || flags.enabled('PRINT_ORDERING');
  if (!flags.loaded) return null;
  if (!live && !flags.isAdmin) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white" role="status">
        <p className="text-[9px] font-black uppercase tracking-widest text-amber-300">Coming soon</p>
        <h3 className="text-lg font-black mt-1">Print editions</h3>
        <p className="text-xs text-white/50 mt-2 max-w-md mx-auto leading-relaxed">Turn your book into a paperback or hardcover without leaving Plajah. Your ebook is saved either way, and print will appear here automatically when it opens.</p>
      </div>
    );
  }
  return <PrintEditionStepInner album={album} onSaved={onSaved} ordering={flags.enabled('PRINT_ORDERING') || (!live && flags.isAdmin)} preview={!live} />;
};

export default PrintEditionStep;
