import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import type { StoreSettings } from '../types';
import { updateStoreSettings } from '../services/backendService';
import InventoryHub from './inventory/InventoryHub';
import { Button } from './ui';

// The creator/org merch shelf. Product management — variants, stock, restock, import, orders — lives in
// the shared InventoryHub (the same screen the Business dashboard uses), so a creator selling hoodies and a
// café selling beans get ONE inventory experience over the same `storeProducts`. This wrapper only adds the
// shelf-level switches (store on/off, "my shop lives on another site").

const StoreProductManager: React.FC<{
  ownerId: string;
  sellerName?: string;
  sellerType?: 'USER' | 'ORG';
  sellerPhoto?: string;
  settings?: StoreSettings;
  onSettingsUpdate?: (s: StoreSettings) => void;
}> = ({ ownerId, sellerName = '', sellerType = 'USER', sellerPhoto, settings, onSettingsUpdate }) => {
  const [cfg, setCfg] = useState<StoreSettings>(settings || { isEnabled: true, useExternalStore: false, externalStoreUrl: '', showDemoContent: true });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<StoreSettings>) => { setCfg(c => ({ ...c, ...p })); setDirty(true); setSaved(false); };
  const saveSettings = async () => {
    setSaving(true);
    try { await updateStoreSettings(cfg); onSettingsUpdate?.(cfg); setDirty(false); setSaved(true); }
    finally { setSaving(false); }
  };

  const Row: React.FC<{ k: 'isEnabled' | 'useExternalStore'; title: string; hint: string }> = ({ k, title, hint }) => (
    <button type="button" role="switch" aria-checked={!!cfg[k]} onClick={() => patch({ [k]: !cfg[k] } as Partial<StoreSettings>)}
      className="flex items-center justify-between gap-3 text-left rounded-2xl p-4" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
      <span><span className="type-label-lg font-bold block" style={{ color: 'var(--text-primary)' }}>{title}</span><span className="type-body-sm block" style={{ color: 'var(--on-surface-variant)' }}>{hint}</span></span>
      <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 44, height: 26, background: cfg[k] ? 'var(--pj-orange)' : 'var(--pj-glass-3)' }}>
        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: cfg[k] ? 21 : 3 }} />
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl p-5" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
        <p className="pj-eyebrow flex items-center gap-1.5 mb-3"><Globe size={13} style={{ color: 'var(--pj-orange)' }} /> Shop settings</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Row k="isEnabled" title="Shop is open" hint="Visible on your page and in the marketplace" />
          <Row k="useExternalStore" title="I sell on another site" hint="Link to Shopify, Etsy or your own store instead" />
        </div>
        {cfg.useExternalStore && (
          <input value={cfg.externalStoreUrl || ''} onChange={e => patch({ externalStoreUrl: e.target.value })} placeholder="https://your-store.com" className="pj-input w-full mt-3" aria-label="External store URL" />
        )}
        {(dirty || saved) && (
          <div className="flex items-center gap-3 mt-4">
            {dirty && <Button variant="primary" size="sm" loading={saving} onClick={saveSettings}>Save settings</Button>}
            {saved && !dirty && <span className="type-body-sm" style={{ color: 'var(--pj-success)' }}>Saved</span>}
          </div>
        )}
      </section>

      {!cfg.useExternalStore && (
        <InventoryHub sellerId={ownerId} sellerName={sellerName} sellerType={sellerType} sellerPhoto={sellerPhoto} audience="creator" />
      )}
    </div>
  );
};

export default StoreProductManager;
