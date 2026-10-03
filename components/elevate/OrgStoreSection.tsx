// OrgStoreSection — the org's merch store (Elevate).
//
// Uses the ONE canonical store: StoreProduct (storeProducts) keyed by the owner uid, where the owner is the
// org's linked account (org.accountUid) or its creator. Public mode = storefront grid on the org page;
// manage mode (MANAGE_STORE) = enable the store + the shared StoreProductManager.
// Product writes are rule-bound to sellerId === the signed-in uid, so full editing needs to be signed in as
// the store owner account; other MANAGE_STORE staff see the storefront + a hint.

import React, { useEffect, useState } from 'react';
import { ShoppingBag, ExternalLink, Loader2, Power } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import type { Organization, StoreProduct, StoreSettings } from '../../types';
import { db } from '../../services/firebase';
import { auth, updateStoreSettings } from '../../services/backendService';
import { fetchProductsBySeller } from '../../services/storeService';
import { updateOrganization } from '../../services/organizationService';
import StoreProductManager from '../StoreProductManager';

export const orgStoreOwnerUid = (org: Pick<Organization, 'accountUid' | 'creatorId'>) => org.accountUid || org.creatorId;

interface Props {
  org: Organization;
  mode: 'public' | 'manage';
  onVisitUser?: (uid: string) => void;
  onOrgChange?: (o: Organization) => void;
}

const OrgStoreSection: React.FC<Props> = ({ org, mode, onVisitUser, onOrgChange }) => {
  const ownerUid = orgStoreOwnerUid(org);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [settings, setSettings] = useState<StoreSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const isStoreOwner = auth.currentUser?.uid === ownerUid;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchProductsBySeller(ownerUid).catch(() => [] as StoreProduct[]),
      getDoc(doc(db, 'users', ownerUid)).then(s => (s.data()?.storeSettings as StoreSettings | undefined)).catch(() => undefined),
    ]).then(([p, s]) => { if (alive) { setProducts(p.filter(x => x.isActive)); setSettings(s); setLoading(false); } });
    return () => { alive = false; };
  }, [ownerUid, mode]);

  const enabled = !!settings?.isEnabled;

  const toggleEnabled = async () => {
    const next: StoreSettings = { useExternalStore: false, showDemoContent: false, ...(settings || {}), isEnabled: !settings?.isEnabled };
    await updateStoreSettings(next);
    setSettings(next);
    if (next.isEnabled) {
      await updateOrganization(org.id, { setupState: { ...(org.setupState || {}), storeReady: true } }).catch(() => {});
      onOrgChange?.({ ...org, setupState: { ...(org.setupState || {}), storeReady: true } });
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={20} /></div>;

  if (mode === 'public') {
    if (!settings?.isEnabled || products.length === 0) return null;
    return (
      <section className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><ShoppingBag size={12} className="text-small-orange" /> Store</h2>
          <button onClick={() => onVisitUser?.(ownerUid)} className="text-[9px] font-black uppercase tracking-widest text-small-orange/70 hover:text-small-orange flex items-center gap-1">Open store <ExternalLink size={10} /></button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.slice(0, 8).map(p => (
            <button key={p.id} onClick={() => onVisitUser?.(ownerUid)} className="text-left rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] transition-all">
              <div className="aspect-square bg-black/40">{p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}</div>
              <div className="p-3">
                <p className="text-xs font-black text-white truncate">{p.title}</p>
                <p className="text-[10px] font-black text-small-orange mt-0.5">${p.price?.toFixed?.(2) ?? p.price}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // ── manage ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
        <div>
          <p className="text-sm font-black text-white">{enabled ? 'Store is live' : 'Store is off'}</p>
          <p className="text-[10px] text-white/40">{products.length} active product{products.length === 1 ? '' : 's'} · shown on the public page when enabled</p>
        </div>
        {isStoreOwner && (
          <button onClick={toggleEnabled} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${settings?.isEnabled ? 'bg-white/10 text-white' : 'bg-small-orange text-black'}`}>
            <Power size={12} /> {settings?.isEnabled ? 'Disable' : 'Enable store'}
          </button>
        )}
      </div>
      {isStoreOwner ? (
        <StoreProductManager ownerId={ownerUid} sellerName={org.name} settings={settings} onSettingsUpdate={setSettings} />
      ) : (
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-white/50">
          This store belongs to the organization's {org.accountUid ? 'linked account' : 'owner account'}. Sign in as that account to add or edit products — you can still preview what visitors see below.
          <div className="mt-4"><OrgStoreSection org={org} mode="public" onVisitUser={onVisitUser} /></div>
        </div>
      )}
    </div>
  );
};

export default OrgStoreSection;
