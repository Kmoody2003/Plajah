// ProductTelaOverlay — "Edit in Tela" for one product gallery item, without leaving the product page or editor.
//
// Opens the full Tela editor over the page with a Tela doc built from the picture (or the item's own Tela doc),
// and on "Back to product" shows the result: Use it (flattened, uploaded as a product photo, handed back to the
// caller to put in place of the item), Keep editing, or Discard. The Tela doc is saved to the editor's account
// like any other Tela file, so the shot can be reopened later with its layers. Content HQ originals are never
// touched: Tela starts from the listing's own public copy.

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, X, Pencil } from 'lucide-react';
import type { StoreProduct, StoreProductMedia, TelaDoc } from '../../types';

// Loaded through import.meta.glob: Vite still splits Tela into its own chunk, and the store's typecheck
// (tsconfig.store-shop.json / tsconfig.product-edit.json) doesn't pull in the whole Tela editor.
type TelaViewProps = { initialDocId?: string | null; onBack?: () => void; onDocumentChange?: (d: TelaDoc) => void; returnTo?: { label: string; onReturn: () => void } | null };
const telaModules = import.meta.glob<{ default: React.ComponentType<TelaViewProps> }>('../tela/TelaView.tsx');
const TelaView = lazy(() => telaModules['../tela/TelaView.tsx']());

export interface TelaResult { url: string; telaDocId: string; kind: StoreProductMedia['kind'] }

const ProductTelaOverlay: React.FC<{
  product: StoreProduct;
  /** The gallery item to recompose; null = a new design from a blank board. */
  item: StoreProductMedia | null;
  onDone: (r: TelaResult) => Promise<void> | void;
  onClose: () => void;
}> = ({ product, item, onDone, onClose }) => {
  const [docId, setDocId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'opening' | 'editing' | 'review' | 'saving'>('opening');
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [err, setErr] = useState('');
  const latest = useRef<TelaDoc | null>(null);

  useEffect(() => {
    let alive = true;
    import('../../services/productTelaBridge')
      .then(b => b.prepareProductTelaDoc(product, item))
      .then(id => { if (alive) { setDocId(id); setPhase('editing'); } })
      .catch(e => { if (alive) setErr(e?.message || 'Tela could not open this picture.'); });
    return () => { alive = false; };
  }, []);  // once per open
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  // Back from Tela: save the doc, flatten its page, show it before anything changes on the listing.
  const back = async () => {
    if (!docId) { onClose(); return; }
    setPhase('saving'); setErr('');
    try {
      const store = await import('../../services/telaStore');
      const doc = latest.current || await store.loadTelaDocFreshest(docId);
      if (!doc) throw new Error('The Tela document could not be read back.');
      if (latest.current) await store.saveTelaDoc(latest.current);
      const { renderTelaDocImage } = await import('../../services/productTelaBridge');
      const file = await renderTelaDocImage(doc);
      setPreview({ url: URL.createObjectURL(file), file });
      setPhase('review');
    } catch (e: any) { setErr(e?.message || 'Could not make an image from that page.'); setPhase('review'); }
  };

  const use = async () => {
    if (!preview || !docId) return;
    setPhase('saving'); setErr('');
    try {
      const { uploadProductPhotos } = await import('../../services/inventoryService');
      const [url] = await uploadProductPhotos([preview.file]);
      if (!url) throw new Error('The photo did not upload.');
      await onDone({ url, telaDocId: docId, kind: item?.kind === 'image' ? 'image' : 'tela' });
      // The listing now points at this Tela file: upload it now instead of on the sync timer, so it opens on
      // every device the shop signs in on (a guest stays on this device only — Tela says so in its sync pill).
      import('../../services/creativeCloud/cloudStore').then(c => c.flushCreativeSyncs()).catch(() => {});
      onClose();
    } catch (e: any) { setErr(e?.message || 'Could not save it to the listing.'); setPhase('review'); }
  };

  const body = (
    <div className="fixed inset-0 z-[1400] bg-[#0b0a0f] text-white flex flex-col" role="dialog" aria-modal="true" aria-label={`Edit ${product.title} in Tela`}>
      {phase === 'editing' && docId ? (
        <Suspense fallback={<div className="flex-1 grid place-items-center text-white/50"><Loader2 className="animate-spin" /></div>}>
          <div className="flex-1 min-h-0 relative">
            <TelaView initialDocId={docId} onBack={back} onDocumentChange={d => { latest.current = d; }}
              returnTo={{ label: 'Back to product', onReturn: back }} />
          </div>
        </Suspense>
      ) : (
        <div className="flex-1 grid place-items-center p-4">
          <div className="w-[min(560px,100%)] rounded-3xl bg-[#15121c] border border-white/12 p-5 space-y-4">
            <p className="text-[17px] font-bold">{phase === 'opening' ? 'Opening Tela…' : phase === 'saving' ? 'Working…' : 'Use this for the listing?'}</p>
            {(phase === 'opening' || phase === 'saving') && !err && <Loader2 className="animate-spin text-white/50" />}
            {preview && phase !== 'opening' && (
              <div className="rounded-2xl overflow-hidden bg-black/40 aspect-square grid place-items-center">
                <img src={preview.url} alt="Result from Tela" className="max-w-full max-h-full object-contain" />
              </div>
            )}
            {phase === 'review' && !err && <p className="text-[14px] text-white/65">{item ? 'It replaces this picture in the gallery, in the same spot.' : 'It is added at the end of the gallery.'} The Tela file is kept, so you can reopen it with its layers.</p>}
            {err && <p role="alert" className="text-[14px] font-semibold text-red-300">{err}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={onClose} className="h-11 px-5 rounded-full bg-white/[0.07] hover:bg-white/12 text-[14px] font-semibold flex items-center gap-2"><X size={15} /> {phase === 'review' ? 'Discard' : 'Cancel'}</button>
              {docId && phase === 'review' && <button onClick={() => setPhase('editing')} className="h-11 px-5 rounded-full bg-white/[0.07] hover:bg-white/12 text-[14px] font-semibold flex items-center gap-2"><Pencil size={15} /> Keep editing</button>}
              {preview && phase === 'review' && <button onClick={use} className="h-11 px-6 rounded-full bg-[#FF8C00] text-[#1A0E00] text-[14px] font-bold flex items-center gap-2"><Check size={16} /> Use it</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
  return createPortal(body, document.body);
};

export default ProductTelaOverlay;
