// ProductLiveEditor — the shop admin's tools on the live product page, and the media gallery the page uses.
//
//   useLiveEdit(product)  who may edit (seller, platform admin, or the seller's staff with INVENTORY — the same
//                         people the storeProducts rule lets write), the edit draft, and saving it. A save writes
//                         only the fields that were changed, on top of what is live now (inventoryService.saveLiveEdit);
//                         the page then updates from its own live listener like every shopper's page does.
//   MediaGallery          photos, videos (play inline) and Tela documents (their rendered page) — view and edit.
//   MediaLightbox         full screen, with zoom for pictures and a player for videos.
//   AdminBar / SaveBar    shown only to people who can edit. Shoppers never get any of this.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Film, Loader2, Package, Pencil, Play, Plus, Save, Trash2, Undo2, Upload, Wand2, X, Star, SlidersHorizontal,
} from 'lucide-react';
import type { StoreProduct, StoreProductMedia, StoreProductVariant } from '../../types';
import {
  mediaOf, moveMedia, replaceMedia, newMediaId, mediaKindOfFile, validateLiveEdit, changedSince, LIVE_EDIT_KEYS,
} from '../../services/productMediaCore';

// ── Who can edit + the draft ─────────────────────────────────────────────────

export interface LiveDraft {
  title: string; price: string; compareAtPrice: string; description: string;
  features: string[]; specs: { label: string; value: string }[]; variants: StoreProductVariant[]; media: StoreProductMedia[];
}
const draftOf = (p: StoreProduct): LiveDraft => ({
  title: p.title || '', price: p.price ? String(p.price) : '', compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : '',
  description: p.description || '', features: [...(p.features || [])], specs: (p.specs || []).map(s => ({ ...s })),
  variants: (p.variants || []).map(v => ({ ...v })), media: mediaOf(p),
});
const toFields = (d: LiveDraft): Partial<StoreProduct> => {
  const price = Math.round((parseFloat(d.price) || 0) * 100) / 100;
  const cmp = Math.round((parseFloat(d.compareAtPrice) || 0) * 100) / 100;
  return {
    title: d.title.trim(), price, compareAtPrice: cmp > 0 ? cmp : undefined, description: d.description.trim(),
    features: d.features.map(f => f.trim()).filter(Boolean),
    specs: d.specs.map(s => ({ label: s.label.trim(), value: s.value.trim() })).filter(s => s.label || s.value),
    variants: d.variants.map(v => ({ ...v, name: v.name.trim() || v.name, priceModifier: v.priceModifier ? Number(v.priceModifier) : undefined })),
    media: d.media,
  };
};

export function useLiveEdit(product: StoreProduct) {
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LiveDraft>(() => draftOf(product));
  const opened = useRef<StoreProduct>(product);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null);

  useEffect(() => {
    let alive = true;
    setCanEdit(false);
    import('../../services/inventoryService').then(s => s.canEditProduct(product)).then(v => { if (alive) setCanEdit(v); }).catch(() => {});
    return () => { alive = false; };
  }, [product.id, product.sellerId]);
  // Another product opened → leave edit mode.
  useEffect(() => { setEditing(false); setErr(''); setUndo(null); }, [product.id]);

  const start = () => { opened.current = product; setDraft(draftOf(product)); setErr(''); setEditing(true); };
  const cancel = () => { setEditing(false); setErr(''); };
  // Fields someone else changed while this edit was open (theirs are kept unless you changed the same one).
  const conflicts = useMemo(() => editing ? changedSince(opened.current, product, [...LIVE_EDIT_KEYS]) : [], [editing, product]);

  const save = async (): Promise<boolean> => {
    const fields = toFields(draft);
    const errs = validateLiveEdit(fields, product.isActive === false);
    if (errs.length) { setErr(errs.join(' ')); return false; }
    setSaving(true); setErr('');
    try {
      const { saveLiveEdit } = await import('../../services/inventoryService');
      const before = opened.current;
      const written = await saveLiveEdit(before, fields);
      setEditing(false);
      if (Object.keys(written).length) {
        const prev: Partial<StoreProduct> = {};
        for (const k of Object.keys(written)) (prev as any)[k] = (before as any)[k];
        setUndo({ label: 'Saved — the live page is updated.', run: async () => { await saveLiveEdit({ ...product, ...fields } as StoreProduct, prev); } });
      } else setUndo({ label: 'No changes to save.', run: async () => {} });
      return true;
    } catch (e: any) {
      setErr(/permission/i.test(e?.message || '') ? 'This account can\'t edit this shop\'s products.' : (e?.message || 'Could not save. Check your connection and try again.'));
      return false;
    } finally { setSaving(false); }
  };

  /** A Tela result put straight into the live gallery (outside edit mode), with undo. */
  const applyMedia = async (next: StoreProductMedia[], label: string) => {
    const { saveLiveEdit } = await import('../../services/inventoryService');
    const before = mediaOf(product);
    await saveLiveEdit(product, { media: next });
    setUndo({ label, run: async () => { await saveLiveEdit({ ...product, media: next }, { media: before }); } });
  };

  return { canEdit, editing, start, cancel, draft, setDraft, save, saving, err, setErr, conflicts, undo, setUndo, applyMedia };
}

// ── Media rendering ──────────────────────────────────────────────────────────

/** <img> that retries a couple of times (storage URLs sometimes drop when many load at once). */
export const RetryImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, onError, ...rest }) => {
  const [tries, setTries] = useState(0);
  useEffect(() => setTries(0), [src]);
  const url = src && tries ? `${src}${src.includes('?') ? '&' : '?'}r=${tries}` : src;
  return <img {...rest} src={url} onError={e => { if (tries < 2) setTimeout(() => setTries(t => t + 1), 400 * (tries + 1)); onError?.(e); }} />;
};

export const MediaThumb: React.FC<{ m: StoreProductMedia }> = ({ m }) => (
  <span className="relative block w-full h-full">
    {m.kind === 'video'
      ? (m.poster ? <RetryImg src={m.poster} alt="" className="w-full h-full object-cover" /> : <video src={`${m.url}#t=0.1`} muted preload="metadata" playsInline className="w-full h-full object-cover" />)
      : <RetryImg src={m.url} alt="" className="w-full h-full object-cover" />}
    {m.kind === 'video' && <span className="absolute inset-0 grid place-items-center"><span className="w-7 h-7 rounded-full bg-black/65 grid place-items-center"><Play size={13} className="text-white ml-0.5" /></span></span>}
    {m.kind === 'tela' && <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/70 text-[9px] font-bold text-white">TELA</span>}
  </span>
);

export const MediaLightbox: React.FC<{ items: StoreProductMedia[]; start: number; onClose: () => void; title: string }> = ({ items, start, onClose, title }) => {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const n = items.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') setI(x => (x + 1) % n);
      if (e.key === 'ArrowLeft') setI(x => (x - 1 + n) % n);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [n, onClose]);
  useEffect(() => setZoom(false), [i]);
  const m = items[i];
  return (
    <div className="fixed inset-0 z-[420] bg-black flex flex-col" role="dialog" aria-label={`${title} photos and videos`}>
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <span className="text-[13px] text-white/60 tabular-nums">{i + 1} / {n}{m?.kind === 'tela' ? ' · made in Tela' : ''}</span>
        <button onClick={onClose} className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        onMouseMove={e => { if (!zoom) return; const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
        {m?.kind === 'video' ? (
          <video key={m.id} src={m.url} poster={m.poster} controls autoPlay playsInline className="max-w-full max-h-full" />
        ) : m ? (
          <RetryImg src={m.url} alt={`${title} — ${i + 1}`} onClick={() => setZoom(z => !z)}
            className={`max-w-full max-h-full object-contain transition-transform duration-200 ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
            style={{ transform: zoom ? 'scale(2.2)' : 'none', transformOrigin: origin }} />
        ) : null}
        {n > 1 && (
          <>
            <button onClick={() => setI(x => (x - 1 + n) % n)} aria-label="Previous" className="absolute left-3 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronLeft size={22} /></button>
            <button onClick={() => setI(x => (x + 1) % n)} aria-label="Next" className="absolute right-3 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronRight size={22} /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex gap-2 justify-center p-3 overflow-x-auto shrink-0">
          {items.map((x, k) => (
            <button key={x.id} onClick={() => setI(k)} aria-label={`Item ${k + 1}`} className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 ${k === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <MediaThumb m={x} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const urlsToMedia = (urls: string[]): StoreProductMedia[] => urls.map((url, i) => ({ id: `r${i}`, kind: 'image', url }));

// ── Gallery (view + edit) ────────────────────────────────────────────────────

export const MediaGallery: React.FC<{
  items: StoreProductMedia[]; title: string; accent: string; badge?: React.ReactNode;
  editing: boolean; canEdit: boolean;
  onOpen: (start: number) => void;
  /** Edit mode: the new gallery order/content. */
  onChange: (next: StoreProductMedia[]) => void;
  /** Open an item in Tela (null = start a new Tela design). */
  onTela: (item: StoreProductMedia | null) => void;
}> = ({ items, title, accent, badge, editing, canEdit, onOpen, onChange, onTela }) => {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState('');
  const [upErr, setUpErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (i >= items.length) setI(Math.max(0, items.length - 1)); }, [items.length, i]);
  const cur = items[i];

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setUpErr('');
    const svc = await import('../../services/inventoryService');
    const out: StoreProductMedia[] = [];
    const list = Array.from(files);
    for (let k = 0; k < list.length; k++) {
      const f = list[k], kind = mediaKindOfFile(f);
      if (!kind) { setUpErr(`${f.name} isn't a photo or video.`); continue; }
      setBusy(`Uploading ${k + 1} of ${list.length}…`);
      try {
        if (kind === 'video') {
          const url = await svc.uploadProductVideo(f, p => setBusy(`Uploading video… ${Math.round(p)}%`));
          out.push({ id: newMediaId(), kind: 'video', url, poster: items.find(m => m.kind !== 'video')?.url });
        } else {
          const [url] = await svc.uploadProductPhotos([f]);
          if (url) out.push({ id: newMediaId(), kind: 'image', url });
        }
      } catch (e: any) { setUpErr(e?.message || `${f.name} didn't upload.`); }
    }
    setBusy('');
    if (out.length) { onChange([...items, ...out]); setI(items.length); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const main = (
    <div className="relative aspect-square rounded-3xl overflow-hidden bg-white/[0.04] group">
      {cur?.kind === 'video' ? (
        <video key={cur.id} src={cur.url} poster={cur.poster} controls playsInline preload="metadata" className="w-full h-full object-contain bg-black" aria-label={`${title} video`} />
      ) : cur ? (
        <button onClick={() => onOpen(i)} className="w-full h-full cursor-zoom-in" aria-label="Open full screen">
          <RetryImg src={cur.url} alt={title} className="w-full h-full object-cover" />
        </button>
      ) : <Package size={48} className="absolute inset-0 m-auto text-white/15" />}
      {badge}
      {cur?.kind === 'tela' && <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-black/65 text-[11px] font-bold">Made in Tela</span>}
      {canEdit && cur && cur.kind !== 'video' && (
        <button onClick={() => onTela(cur)} className="absolute bottom-3 left-3 h-10 px-4 rounded-full bg-black/75 hover:bg-black/90 text-[13px] font-bold flex items-center gap-2" aria-label="Edit this picture in Tela">
          <Wand2 size={15} /> Edit in Tela
        </button>
      )}
      {items.length > 1 && cur?.kind !== 'video' && (
        <>
          <button onClick={() => setI(x => (x - 1 + items.length) % items.length)} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition"><ChevronLeft size={20} /></button>
          <button onClick={() => setI(x => (x + 1) % items.length)} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition"><ChevronRight size={20} /></button>
          <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-[12px] tabular-nums">{i + 1} / {items.length}</span>
        </>
      )}
    </div>
  );

  const thumb = (m: StoreProductMedia, k: number, size: string) => (
    <button key={m.id} onClick={() => setI(k)} onMouseEnter={() => !editing && setI(k)} aria-label={`${m.kind === 'video' ? 'Video' : 'Photo'} ${k + 1}`}
      className={`${size} rounded-xl overflow-hidden border-2 shrink-0 transition ${i === k ? '' : 'border-transparent opacity-70 hover:opacity-100'}`}
      style={i === k ? { borderColor: accent } : undefined}>
      <MediaThumb m={m} />
    </button>
  );

  return (
    <div className="lg:sticky lg:top-24 self-start">
      <div className="flex gap-3">
        {items.length > 1 && !editing && (
          <div className="hidden sm:flex flex-col gap-2 w-[72px] shrink-0 max-h-[640px] overflow-y-auto">{items.map((m, k) => thumb(m, k, 'w-[72px] h-[72px]'))}</div>
        )}
        <div className="flex-1 min-w-0">
          {main}
          {items.length > 1 && !editing && <div className="sm:hidden flex gap-2 mt-3 overflow-x-auto">{items.map((m, k) => thumb(m, k, 'w-16 h-16'))}</div>}
        </div>
      </div>

      {editing && (
        <div className="mt-4 rounded-2xl border border-white/12 bg-white/[0.03] p-3">
          <p className="text-[13px] font-semibold text-white/80 mb-2">Photos, videos and Tela designs <span className="font-normal text-white/45">· the first one is the cover</span></p>
          <div className="flex gap-2 flex-wrap">
            {items.map((m, k) => (
              <div key={m.id} className={`relative w-[88px] h-[88px] rounded-xl overflow-hidden border-2 ${i === k ? '' : 'border-transparent'}`} style={i === k ? { borderColor: accent } : undefined}>
                <button onClick={() => setI(k)} className="w-full h-full" aria-label={`Select item ${k + 1}`}><MediaThumb m={m} /></button>
                {k === 0 && <span className="absolute top-1 left-1 px-1.5 rounded bg-black/70 text-[9px] font-bold flex items-center gap-0.5"><Star size={8} /> COVER</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/85 to-transparent pt-3 px-0.5 pb-0.5">
                  <button onClick={() => { onChange(moveMedia(items, k, k - 1)); setI(k - 1); }} disabled={k === 0} aria-label="Move earlier" className="w-6 h-6 grid place-items-center disabled:opacity-25"><ChevronLeft size={14} /></button>
                  {m.kind !== 'video' && <button onClick={() => onTela(m)} aria-label="Edit in Tela" className="w-6 h-6 grid place-items-center"><Wand2 size={12} /></button>}
                  <button onClick={() => onChange(items.filter(x => x.id !== m.id))} aria-label="Remove" className="w-6 h-6 grid place-items-center text-red-300"><Trash2 size={12} /></button>
                  <button onClick={() => { onChange(moveMedia(items, k, k + 1)); setI(k + 1); }} disabled={k === items.length - 1} aria-label="Move later" className="w-6 h-6 grid place-items-center disabled:opacity-25"><ChevronRight size={14} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="w-[88px] h-[88px] rounded-xl border border-dashed border-white/25 hover:border-white/45 flex flex-col items-center justify-center gap-1 text-[11px] text-white/65">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Photo / video
            </button>
            <button onClick={() => onTela(null)} className="w-[88px] h-[88px] rounded-xl border border-dashed border-white/25 hover:border-white/45 flex flex-col items-center justify-center gap-1 text-[11px] text-white/65">
              <Wand2 size={18} /> New Tela design
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => add(e.target.files)} />
          </div>
          {busy && <p className="mt-2 text-[12px] text-white/55">{busy}</p>}
          {upErr && <p role="alert" className="mt-2 text-[12px] font-semibold text-red-300">{upErr}</p>}
        </div>
      )}
    </div>
  );
};

// ── Small edit fields ────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-xl bg-black/35 border border-white/15 px-3 text-white outline-none focus:border-white/40';

export const EditText: React.FC<{ label: string; value: string; onChange: (v: string) => void; big?: boolean; multiline?: boolean; prefix?: string; inputMode?: 'decimal' }> =
  ({ label, value, onChange, big, multiline, prefix, inputMode }) => (
  <label className="block">
    <span className="text-[12px] font-semibold text-white/60">{label}</span>
    {multiline ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={6} className={`${inputCls} mt-1 py-2.5 text-[15px] leading-relaxed resize-y`} />
    ) : (
      <span className="mt-1 flex items-center gap-2">
        {prefix && <span className="text-white/50 text-[18px]">{prefix}</span>}
        <input value={value} onChange={e => onChange(e.target.value)} inputMode={inputMode}
          className={`${inputCls} ${big ? 'h-14 text-[24px] font-extrabold' : 'h-11 text-[15px]'}`} />
      </span>
    )}
  </label>
);

export const ListEdit: React.FC<{ label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }> = ({ label, items, onChange, placeholder }) => (
  <div>
    <p className="text-[12px] font-semibold text-white/60 mb-1">{label}</p>
    <div className="space-y-2">
      {items.map((t, k) => (
        <div key={k} className="flex gap-2">
          <input value={t} onChange={e => onChange(items.map((x, j) => (j === k ? e.target.value : x)))} placeholder={placeholder} className={`${inputCls} h-11 text-[14px]`} />
          <button onClick={() => onChange(items.filter((_, j) => j !== k))} aria-label="Remove" className="w-11 h-11 shrink-0 rounded-xl bg-white/[0.06] grid place-items-center text-white/60 hover:text-red-300"><X size={15} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ''])} className="h-10 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 text-[13px] font-semibold flex items-center gap-1.5"><Plus size={14} /> Add</button>
    </div>
  </div>
);

export const SpecsEdit: React.FC<{ specs: { label: string; value: string }[]; onChange: (v: { label: string; value: string }[]) => void }> = ({ specs, onChange }) => (
  <div>
    <p className="text-[12px] font-semibold text-white/60 mb-1">Details</p>
    <div className="space-y-2">
      {specs.map((s, k) => (
        <div key={k} className="flex gap-2">
          <input value={s.label} onChange={e => onChange(specs.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Size" className={`${inputCls} h-11 text-[14px] w-[40%]`} />
          <input value={s.value} onChange={e => onChange(specs.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} placeholder="e.g. 16 oz" className={`${inputCls} h-11 text-[14px]`} />
          <button onClick={() => onChange(specs.filter((_, j) => j !== k))} aria-label="Remove" className="w-11 h-11 shrink-0 rounded-xl bg-white/[0.06] grid place-items-center text-white/60 hover:text-red-300"><X size={15} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...specs, { label: '', value: '' }])} className="h-10 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 text-[13px] font-semibold flex items-center gap-1.5"><Plus size={14} /> Add a detail</button>
    </div>
  </div>
);

export const VariantsEdit: React.FC<{ variants: StoreProductVariant[]; onChange: (v: StoreProductVariant[]) => void; onFullEditor: () => void }> = ({ variants, onChange, onFullEditor }) => (
  <div>
    <p className="text-[12px] font-semibold text-white/60 mb-1">Options <span className="font-normal text-white/40">· name and price difference (stock and new options: full editor)</span></p>
    <div className="space-y-2">
      {variants.map((v, k) => (
        <div key={v.id} className="flex gap-2 items-center">
          <input value={v.name} onChange={e => onChange(variants.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} className={`${inputCls} h-11 text-[14px]`} aria-label="Option name" />
          <span className="text-white/45 text-[13px]">+$</span>
          <input value={v.priceModifier ?? ''} inputMode="decimal" onChange={e => onChange(variants.map((x, j) => (j === k ? { ...x, priceModifier: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) } : x)))}
            className={`${inputCls} h-11 text-[14px] w-24`} aria-label="Price difference" placeholder="0" />
          <span className="w-16 text-right text-[12px] text-white/45 tabular-nums">{v.stock} left</span>
        </div>
      ))}
      <button onClick={onFullEditor} className="h-10 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 text-[13px] font-semibold flex items-center gap-1.5"><SlidersHorizontal size={14} /> Options, stock & shipping…</button>
    </div>
  </div>
);

// ── Bars ─────────────────────────────────────────────────────────────────────

export const AdminBar: React.FC<{ accent: string; editing: boolean; onEdit: () => void; onFullEditor: () => void }> = ({ accent, editing, onEdit, onFullEditor }) => (
  editing ? null : (
    <div className="max-w-6xl mx-auto px-4 pt-4">
      <div className="rounded-xl px-4 py-2.5 border border-white/12 bg-white/[0.04] flex items-center gap-3 flex-wrap">
        <p className="text-[13px] text-white/70 flex-1 min-w-[200px]">You manage this shop. Shoppers don't see these controls.</p>
        <button onClick={onFullEditor} className="h-10 px-4 rounded-full bg-white/[0.07] hover:bg-white/12 text-[13px] font-semibold flex items-center gap-2"><SlidersHorizontal size={14} /> Full editor</button>
        <button onClick={onEdit} className="h-10 px-5 rounded-full text-[13px] font-bold text-[#1A0E00] flex items-center gap-2" style={{ background: accent }}><Pencil size={14} /> Edit this page</button>
      </div>
    </div>
  )
);

export const SaveBar: React.FC<{ accent: string; saving: boolean; err: string; conflicts: string[]; onSave: () => void; onCancel: () => void }> = ({ accent, saving, err, conflicts, onSave, onCancel }) => (
  <div className="sticky bottom-0 z-30 border-t border-white/12 bg-[#0B0B0D]/95 backdrop-blur">
    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px] text-[13px]">
        {err ? <p role="alert" className="font-semibold text-red-300">{err}</p>
          : conflicts.length ? <p className="text-amber-200">Changed by someone else while you were editing: {conflicts.join(', ')}. Saving keeps their change unless you edited the same thing.</p>
          : <p className="text-white/60">Editing the live listing. Only what you change is saved.</p>}
      </div>
      <button onClick={onCancel} disabled={saving} className="h-11 px-5 rounded-full bg-white/[0.07] hover:bg-white/12 text-[14px] font-semibold">Cancel</button>
      <button onClick={onSave} disabled={saving} className="h-11 px-6 rounded-full text-[14px] font-bold text-[#1A0E00] flex items-center gap-2 disabled:opacity-60" style={{ background: accent }}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
      </button>
    </div>
  </div>
);

export const UndoToast: React.FC<{ label: string; onUndo?: () => void; onClose: () => void }> = ({ label, onUndo, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 8000); return () => clearTimeout(t); }, [label, onClose]);
  return (
    <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[410] pl-5 pr-2 py-2 rounded-full bg-white text-black text-[14px] font-semibold shadow-2xl flex items-center gap-3">
      {label}
      {onUndo && <button onClick={onUndo} className="h-9 px-4 rounded-full bg-black/10 hover:bg-black/15 flex items-center gap-1.5"><Undo2 size={14} /> Undo</button>}
      <button onClick={onClose} aria-label="Dismiss" className="w-9 h-9 rounded-full hover:bg-black/10 grid place-items-center"><X size={14} /></button>
    </div>
  );
};


