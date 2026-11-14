// Content HQ asset actions: the thumbnail on each card, the ⋯ / right-click menu, and the "use this photo
// somewhere" flows — add it to a product listing, start a new listing from it, start an article with it.
// Content HQ files are private (protected-hq/…); a product or article photo must be public, so each flow
// copies the bytes into the seller's / writer's own public storage first and leaves the HQ original alone.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Package, Search, X, Check } from 'lucide-react';
import { auth, db } from '../../services/firebase';
import type { OrgAsset, OwnerScope } from '../../services/orgAssets';
import type { StoreProduct } from '../../types';

// ── Bytes + thumbnails ──────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => '');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The HQ file as a File (it goes through the access-checked download route). */
export async function hqAssetFile(asset: OrgAsset): Promise<File> {
  const res = await fetch(`/api/hq/assets/${encodeURIComponent(asset.id)}/download`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(res.status === 409 ? 'This file is still being checked. Try again in a moment.' : 'Could not read this file.');
  const blob = await res.blob();
  return new File([blob], asset.name, { type: blob.type || asset.mimeType || 'image/jpeg' });
}

export const isHqImage = (a: OrgAsset) => a.kind === 'image' && !/svg/i.test(a.mimeType || '');
const scanOk = (a: OrgAsset) => a.scanStatus !== 'PENDING' && a.scanStatus !== 'QUARANTINED';

// One small JPEG per asset per session; at most 4 fetches in flight so a big folder doesn't stall.
const thumbCache = new Map<string, Promise<string | null>>();
let inFlight = 0;
const queue: (() => void)[] = [];
const slot = () => new Promise<void>(r => { if (inFlight < 4) { inFlight++; r(); } else queue.push(() => { inFlight++; r(); }); });
const release = () => { inFlight--; queue.shift()?.(); };

function loadThumb(asset: OrgAsset): Promise<string | null> {
  const key = `${asset.id}:${asset.currentVersionId || ''}`;
  let p = thumbCache.get(key);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        const file = await hqAssetFile(asset);
        const bmp = await createImageBitmap(file);
        const s = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
        return blob ? URL.createObjectURL(blob) : null;
      } catch { thumbCache.delete(key); return null; } finally { release(); }
    })();
    thumbCache.set(key, p);
  }
  return p;
}

/** Image preview for a card; loads when it scrolls near view. Falls back to `fallback` (the kind icon). */
export const HqThumb: React.FC<{ asset: OrgAsset; fallback: React.ReactNode }> = ({ asset, fallback }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const can = isHqImage(asset) && scanOk(asset);
  useEffect(() => {
    if (!can || !ref.current) return;
    let live = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect(); setState('loading');
      loadThumb(asset).then(u => { if (!live) return; if (u) setSrc(u); else setState('failed'); });
    }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => { live = false; io.disconnect(); };
  }, [asset.id, asset.currentVersionId, can]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!can) return null;
  return (
    <div ref={ref} className="relative -mx-4 -mt-4 mb-3 aspect-[4/3] rounded-t-2xl overflow-hidden bg-white/[0.04] grid place-items-center">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
        : state === 'failed' ? <div className="text-white/25">{fallback}</div>
        : <Loader2 className="w-5 h-5 text-white/25 animate-spin" />}
    </div>
  );
};

// ── Action menu (⋯ button and right-click share it) ──────────────────────────

export interface HqMenuItem { id: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; group?: string; hint?: string }

export const HqActionMenu: React.FC<{ at: { x: number; y: number }; title: string; items: HqMenuItem[]; onClose: () => void }> = ({ at, title, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const off = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => { addEventListener('mousedown', off); addEventListener('contextmenu', off); }, 0);
    addEventListener('keydown', key); addEventListener('scroll', onClose, true); addEventListener('resize', onClose);
    return () => { clearTimeout(t); removeEventListener('mousedown', off); removeEventListener('contextmenu', off); removeEventListener('keydown', key); removeEventListener('scroll', onClose, true); removeEventListener('resize', onClose); };
  }, [onClose]);
  let lastGroup: string | undefined;
  return createPortal(
    <div ref={ref} role="menu" aria-label={`Actions for ${title}`} onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
      className="fixed z-[400] min-w-[230px] max-w-[280px] py-1.5 rounded-xl bg-[#17141f] border border-white/12 shadow-2xl text-white"
      style={{ left: pos.x, top: pos.y }}>
      <div className="px-3 pt-1 pb-1.5 text-[10px] text-white/40 truncate">{title}</div>
      {items.map(it => {
        const sep = lastGroup !== undefined && it.group !== lastGroup;
        lastGroup = it.group;
        return (
          <React.Fragment key={it.id}>
            {sep && <div className="my-1 h-px bg-white/10" />}
            <button role="menuitem" type="button" onClick={() => { onClose(); it.onClick(); }} title={it.hint}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] hover:bg-white/8 focus:bg-white/8 outline-none ${it.danger ? 'text-red-300' : 'text-white/85'}`}>
              <span className="w-4 h-4 grid place-items-center shrink-0 opacity-80">{it.icon}</span>{it.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
};

// ── Who sells from this Content HQ ───────────────────────────────────────────

export interface HqSeller { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG'; departments: { id: string; name: string }[] }

/** The store this HQ's photos list into: an org's linked account, or the person's own shop. Business HQs aren't wired yet. */
export async function resolveHqSeller(scope: OwnerScope): Promise<HqSeller | null> {
  const me = auth.currentUser;
  if (!me) return null;
  if (scope.kind === 'user') return { sellerId: me.uid, sellerName: me.displayName || 'My shop', sellerType: 'USER', departments: [] };
  if (scope.kind !== 'org') return null;
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'organizations', scope.id)).catch(() => null);
  const org: any = snap?.exists() ? snap.data() : null;
  const sellerId = org?.accountUid || org?.creatorId;
  if (!sellerId) return null;
  return {
    sellerId, sellerName: org.name || scope.label || 'Shop', sellerType: 'ORG',
    departments: (org.ministries || []).filter((m: any) => !m.isInternal).map((m: any) => ({ id: m.id, name: m.name })),
  };
}

/** Copy an HQ photo into public product storage; returns the display URL. */
export async function hqPhotoToProductUrl(asset: OrgAsset): Promise<string> {
  const { uploadProductPhotos } = await import('../../services/inventoryService');
  const [url] = await uploadProductPhotos([await hqAssetFile(asset)]);
  if (!url) throw new Error('That file is not a photo.');
  return url;
}

// ── "Add to a product listing" picker ────────────────────────────────────────

export const HqAddToProductSheet: React.FC<{ asset: OrgAsset; seller: HqSeller; onClose: () => void; onDone: (msg: string) => void }> = ({ asset, seller, onClose, onDone }) => {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stop = () => {};
    import('../../services/commerceBus').then(({ subscribeCatalog }) => {
      stop = subscribeCatalog(seller.sellerId, ps => setProducts(ps.filter(p => !p.tags?.includes('demo-seed'))), { onError: () => setProducts([]) });
    });
    return () => stop();
  }, [seller.sellerId]);
  // Same department first, so a department's photos land on its own shelf.
  const shown = useMemo(() => (products || [])
    .filter(p => !q || p.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.ministryId === asset.departmentId) - Number(a.ministryId === asset.departmentId)), [products, q, asset.departmentId]);
  const deptName = (id?: string) => seller.departments.find(d => d.id === id)?.name;

  async function add(p: StoreProduct) {
    setBusy(p.id); setErr('');
    try {
      const url = await hqPhotoToProductUrl(asset);
      const { bulkPatch } = await import('../../services/inventoryService');
      await bulkPatch([p.id], { images: [...(p.images || []), url] });
      onDone(`Added ${asset.name} to "${p.title}" (photo ${(p.images?.length || 0) + 1}). Reorder photos in the product editor.`);
    } catch (e: any) { setErr(e?.message || 'Could not add the photo.'); setBusy(null); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[390] bg-black/60 grid place-items-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add to a product listing" onClick={e => e.stopPropagation()}
        className="w-[min(560px,100%)] max-h-[calc(100dvh-32px)] flex flex-col rounded-2xl bg-[#100d19] border border-white/12 text-white">
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-black">Add to a product listing</div>
            <div className="text-[11px] text-white/45 truncate">{asset.name} · {seller.sellerName} shop</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
            <Search className="w-4 h-4 text-white/40" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a product…" className="bg-transparent text-sm outline-none flex-1 placeholder:text-white/30" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {!products ? <div className="grid place-items-center h-32"><Loader2 className="w-5 h-5 animate-spin text-white/40" /></div>
            : shown.length === 0 ? <div className="text-center text-sm text-white/40 py-10">{products.length ? 'No product matches.' : 'This shop has no products yet. Use "Create a product listing" instead.'}</div>
            : shown.map(p => (
              <button key={p.id} type="button" disabled={!!busy} onClick={() => add(p)}
                className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/8 text-left disabled:opacity-60">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 grid place-items-center shrink-0">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Package className="w-5 h-5 text-white/30" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{p.title}</div>
                  <div className="text-[11px] text-white/40">{p.isActive ? 'Live' : 'Draft'} · {p.images?.length || 0} photo{p.images?.length === 1 ? '' : 's'}{deptName(p.ministryId) ? ` · ${deptName(p.ministryId)}` : ''}</div>
                </div>
                {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin text-[#FF8C00]" /> : <Check className="w-4 h-4 text-white/20" />}
              </button>
            ))}
        </div>
        {err && <div className="mx-3 mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-200">{err}</div>}
      </div>
    </div>,
    document.body,
  );
};
