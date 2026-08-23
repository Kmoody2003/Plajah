// components/MattePanel.tsx — controls for the keyable media layer.

import React, { useState } from 'react';
import { Video, X } from 'lucide-react';
import { MatteEngine, KeyMode } from '../engine/matting/matteEngine';
import { MatteSettings } from './MatteLayer';

interface Props {
  engine: MatteEngine;
  settings: MatteSettings;
  setSettings: (s: MatteSettings) => void;
  visible: boolean;
  onClose: () => void;
}

const MODES: KeyMode[] = ['none', 'luma', 'chroma', 'ai'];
const LABELS: Record<KeyMode, string> = { none: 'Off', luma: 'Luma', chroma: 'Chroma', ai: 'AI matte' };

const MattePanel: React.FC<Props> = ({ engine, settings, setSettings, visible, onClose }) => {
  const [status, setStatus] = useState('No layer loaded.');
  if (!visible) return null;
  // route engine status updates into local state
  (engine as any).onStatus = setStatus;

  const wrap: React.CSSProperties = {
    position: 'absolute', top: 84, right: 18, zIndex: 26, width: 260,
    background: 'rgba(18,18,26,0.5)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18,
    backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)', padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  };
  const label: React.CSSProperties = { fontSize: 11, color: 'rgba(244,242,255,0.55)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b56cff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Video size={13} /> Media Layer · Matte</div>
        <X size={14} style={{ cursor: 'pointer', color: 'rgba(244,242,255,0.6)' }} onClick={onClose} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: 9, borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#f4f2ff', fontSize: 11, cursor: 'pointer', marginBottom: 11 }}>
        Add image / video
        <input type="file" accept="image/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) engine.load(f); }} />
      </label>

      <div style={{ ...label }}>Key mode</div>
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {MODES.map(m => (
          <button key={m} onClick={() => { setSettings({ ...settings, mode: m }); if (m === 'ai') engine.tryAI(); }}
            style={{ flex: 1, padding: 6, border: 'none', borderRadius: 7, fontSize: 10, cursor: 'pointer', background: settings.mode === m ? '#b56cff' : 'transparent', color: settings.mode === m ? '#fff' : 'rgba(244,242,255,0.55)' }}>{LABELS[m]}</button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={label}><span>Threshold</span><b style={{ color: '#b56cff' }}>{settings.thresh.toFixed(2)}</b></div>
        <input type="range" min={0} max={1} step={0.01} value={settings.thresh} onChange={e => setSettings({ ...settings, thresh: +e.target.value })} className="pj-range pj-range--dense w-full" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={label}><span>Layer scale</span><b style={{ color: '#b56cff' }}>{settings.scale.toFixed(2)}</b></div>
        <input type="range" min={0.2} max={2} step={0.05} value={settings.scale} onChange={e => setSettings({ ...settings, scale: +e.target.value })} className="pj-range pj-range--dense w-full" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(244,242,255,0.55)', marginBottom: 10 }}>
        <span>React to bass (scale)</span>
        <div onClick={() => setSettings({ ...settings, react: !settings.react })} style={{ width: 38, height: 21, borderRadius: 11, background: settings.react ? '#b56cff' : 'rgba(255,255,255,0.12)', position: 'relative', cursor: 'pointer', transition: '.2s' }}>
          <div style={{ position: 'absolute', top: 2, left: settings.react ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: '.2s' }} />
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: 'rgba(244,242,255,0.32)', lineHeight: 1.4 }}>{status}</div>
    </div>
  );
};

export default MattePanel;
