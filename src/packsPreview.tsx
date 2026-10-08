// Dev-only: renders the vertical-pack picker and go-live checklist with demo data (no sign-in, no Firestore).
//
//   /packs-preview.html?screen=picker|checklist&pack=salon_barbershop&stage=fresh|half|live
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import PackPicker from '../components/business/PackPicker';
import GoLiveChecklist from '../components/business/GoLiveChecklist';
import { PACKS, getPack } from '../services/verticalPacks';
import { computeChecklist, emptySnapshot, type BusinessSnapshot } from '../services/verticalPacks/checklist';

const q = new URLSearchParams(location.search);
const initialScreen = (q.get('screen') as 'picker' | 'checklist') || 'checklist';

const snapshotFor = (packId: string, stage: string): BusinessSnapshot => {
  const pack = getPack(packId)!;
  const base = emptySnapshot({ subtype: packId, hours: pack.defaultHours });
  const n = pack.starterCatalog.items.length;
  if (stage === 'fresh') return { ...base, productCount: n, sampleCount: n };
  if (stage === 'half') return { ...base, page: { ...base.page, address: '12 Main St', city: 'Detroit', phone: '(313) 555-0100', stripeAccountId: 'acct_demo' }, productCount: n, sampleCount: n, editedSampleCount: 3 };
  return {
    ...base, page: { ...base.page, address: '12 Main St', city: 'Detroit', phone: '(313) 555-0100', stripeAccountId: 'acct_demo', isPublic: true, packManualDone: pack.checklist.filter(s => s.detect === 'MANUAL').map(s => s.id), hours: { ...pack.defaultHours, monday: { open: '10:00', close: '16:00' } } },
    productCount: n + 2, sampleCount: n, editedSampleCount: 6, orderCount: 4, staffCount: 2,
  };
};

const App: React.FC = () => {
  const [screen, setScreen] = useState<'picker' | 'checklist'>(initialScreen);
  const [packId, setPackId] = useState(q.get('pack') && getPack(q.get('pack')) ? q.get('pack')! : 'salon_barbershop');
  const [stage, setStage] = useState(q.get('stage') || 'half');
  const [manual, setManual] = useState<string[]>([]);
  const pack = getPack(packId)!;
  const progress = useMemo(() => {
    const s = snapshotFor(packId, stage);
    return computeChecklist(pack, { ...s, page: { ...s.page, packManualDone: [...(s.page.packManualDone ?? []), ...manual] } });
  }, [packId, stage, manual, pack]);

  const pill = (active: boolean): React.CSSProperties => ({ padding: '4px 12px', borderRadius: 99, border: '1px solid #444', background: active ? '#FF8C00' : 'transparent', color: active ? '#000' : '#ddd', fontSize: 12, fontWeight: 700 });
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff' }}>
      <nav style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5, background: '#0a0a0fcc', backdropFilter: 'blur(8px)' }}>
        {(['picker', 'checklist'] as const).map(s => <button key={s} onClick={() => setScreen(s)} style={pill(s === screen)}>{s}</button>)}
        <span style={{ width: 12 }} />
        {PACKS.map(p => <button key={p.id} onClick={() => { setPackId(p.id); setScreen('checklist'); }} style={pill(p.id === packId)}>{p.id}</button>)}
        <span style={{ width: 12 }} />
        {['fresh', 'half', 'live'].map(s => <button key={s} onClick={() => setStage(s)} style={pill(s === stage)}>{s}</button>)}
      </nav>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <GoLiveChecklist
          pack={pack} progress={progress} sampleCount={pack.starterCatalog.items.length}
          onGoTab={() => {}} onChangePack={() => setScreen('picker')} onClearSamples={() => {}}
          onToggleManual={(id, done) => setManual(m => done ? [...m, id] : m.filter(x => x !== id))}
        />
      </div>
      {screen === 'picker' && (
        <PackPicker
          currentPackId={packId}
          onClose={() => setScreen('checklist')}
          onApply={async (p, onProgress) => {
            for (let i = 1; i <= 10; i++) { onProgress({ done: i, total: 10, label: `Adding ${p.starterCatalog.items[i % p.starterCatalog.items.length].name}` }); await new Promise(r => setTimeout(r, 120)); }
            setPackId(p.id); setStage('fresh'); setManual([]);
            return { summary: `${p.starterCatalog.items.length} items added, ${p.deals.length} deals.` };
          }}
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
