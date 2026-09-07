// UniversalLibraryLab — a standalone dev harness (reached via ?ullab=1) that
// mounts the Universal Library in a mock editor frame so it can be exercised
// without signing into a specific studio. Not part of the shipped app shell.
import React, { useState } from 'react';
import { UniversalLibraryPanel } from './UniversalLibraryPanel';

const APPS = [
  { id: 'fabula', name: 'Fabula', accent: '#D40055' },
  { id: 'melos', name: 'Melos', accent: '#FF8C00' },
  { id: 'tela', name: 'Tela', accent: '#8B5CFF' },
  { id: 'pixels', name: 'Pixels', accent: '#00DAF3' },
];

export const UniversalLibraryLab: React.FC = () => {
  const [app, setApp] = useState(APPS[0]);
  const [msg, setMsg] = useState<string>('');
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#08070C', color: '#F5F2F9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
        <b style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Universal Library · dev harness</b>
        <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
          {APPS.map((a) => (
            <button key={a.id} onClick={() => setApp(a)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: app.id === a.id ? 'rgba(255,255,255,.08)' : 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: a.accent }} />{a.name}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, color: '#877E9B' }}>{msg}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(0deg,rgba(255,255,255,.015) 0 1px,transparent 1px 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.015) 0 1px,transparent 1px 40px),#08070C' }}>
          <div style={{ textAlign: 'center', color: '#5F5872' }}>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, color: '#877E9B' }}>{app.name} editor</div>
            <p style={{ fontSize: 13 }}>The Universal Library docks on the right →<br />resize its edge · double-click the title bar to float · collapse it away.</p>
          </div>
        </div>
        <UniversalLibraryPanel accent={app.accent} storageKey={'ullab.geo.v1'} onUse={(it) => setMsg('Used: ' + it.name + ' (' + it.typeLabel + ')')} />
      </div>
    </div>
  );
};

export default UniversalLibraryLab;
