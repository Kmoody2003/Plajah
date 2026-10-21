// Dev-only: renders the business ops growth surfaces (social playbook, marketing plays + hand-offs),
// the vertical-pack picker and live signage slides for any ops preset, with no sign-in.
//
//   /bizops-preview.html?screen=marketing|social|packs|signage&preset=car_dealership
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ALL_BUSINESS_PRESETS, ALL_ORG_PRESETS, opsPresetFor } from '../services/opsPresets';
import { BoScope, BoModeBar, BoSegmented } from '../components/business/opsKit';
import SocialPlaybookPanel from '../components/growth/SocialPlaybookPanel';
import MarketingPlaysPanel from '../components/growth/MarketingPlaysPanel';
import PackPicker from '../components/business/PackPicker';
import { LiveSlide } from '../components/business/SignageStudio';
import type { StoreProduct, DigitalSignageSlide } from '../types';

const q = new URLSearchParams(location.search);
const ALL = [...ALL_BUSINESS_PRESETS, ...Object.values(ALL_ORG_PRESETS).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)];

const demoProducts: StoreProduct[] = [
  ['Oat Latte', 5.5, 12], ['Cold Brew', 4.75, 2], ['Breakfast Burrito', 9.25, 0], ['Blueberry Muffin', 3.5, 18], ['Avocado Toast', 11, 7],
].map(([title, price, stock], i) => ({
  id: `p${i}`, sellerId: 'demo', sellerName: 'Demo', title: title as string, description: '', category: 'OTHER' as any, price: price as number,
  images: [], stock: stock as number, lowStockThreshold: 3, trackInventory: true, isDigital: false, isActive: true, createdAt: 0, updatedAt: 0, tags: ['Kitchen'],
}));

const App: React.FC = () => {
  const [screen, setScreen] = useState(q.get('screen') || 'marketing');
  const [presetId, setPresetId] = useState(q.get('preset') || 'car_dealership');
  const preset = ALL.find(p => p.id === presetId) ?? opsPresetFor({ kind: 'business', packId: presetId });
  const scope = { kind: 'BUSINESS' as const, id: 'demo-page', name: `Demo ${preset.label}` };
  const slide = (type: DigitalSignageSlide['type'], extra: Partial<DigitalSignageSlide> = {}): DigitalSignageSlide =>
    ({ id: type, businessId: 'demo', type, durationSeconds: 10, isActive: true, order: 0, headline: type === 'MENU' ? 'Today’s menu' : 'Featured', ...extra });

  return (
    <BoScope accent={preset.accent} className="min-h-screen">
      <BoModeBar
        modes={[{ k: 'marketing', label: 'Marketing' }, { k: 'social', label: 'Social' }, { k: 'packs', label: 'Business types' }, { k: 'signage', label: 'Live signage' }]}
        value={screen} onChange={setScreen}
        trailing={<select className="bo-input" style={{ minHeight: 36, width: 'auto' }} value={presetId} onChange={e => setPresetId(e.target.value)}>
          {ALL.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>}
      />
      <main className="max-w-[1240px] mx-auto px-4 sm:px-8 py-10">
        {screen === 'marketing' && (
          <MarketingPlaysPanel plays={preset.marketing} scope={scope} identity={{ name: scope.name, phone: '(313) 555-0100', address: { line1: '12 Main St', city: 'Detroit', region: 'MI', postal: '48201' } }}
            loadRecipients={async () => [{ name: 'Ana Ruiz', line1: '9 Elm St', city: 'Detroit', region: 'MI', postal: '48202' }]} />
        )}
        {screen === 'social' && <SocialPlaybookPanel playbook={preset.social} scope={scope} />}
        {screen === 'packs' && <PackPicker onApply={async () => {}} />}
        {screen === 'signage' && (
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
            {[slide('MENU', { sellerUid: 'demo', category: 'Kitchen' }), slide('PRODUCT', { sellerUid: 'demo', productIds: ['p0', 'p2', 'p4'] })].map(s => (
              <div key={s.id}>
                <BoSegmented value={s.type} onChange={() => {}} options={[{ k: s.type, label: s.type }]} />
                <div className="mt-3 aspect-video rounded-2xl overflow-hidden"><LiveSlide slide={s} products={demoProducts} /></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </BoScope>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
