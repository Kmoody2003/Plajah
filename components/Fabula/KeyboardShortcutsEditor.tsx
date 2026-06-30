// KeyboardShortcutsEditor — the "map your own" UI for Fabula's keyboard system. Switch presets
// (Fabula / Resolve / Premiere), click any action to capture a new key combo, see conflicts, and
// reset. Persists via shortcuts.ts. Pure UI over the keymap engine.

import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Keyboard, AlertTriangle } from 'lucide-react';
import {
  SHORTCUT_ACTIONS, comboForAction, comboFromEvent, comboLabel, findConflicts,
  loadShortcutPrefs, saveShortcutPrefs, type ShortcutPrefs, type PresetId,
} from '../../services/fabula/shortcuts';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'fabula', label: 'Fabula' }, { id: 'resolve', label: 'Resolve' }, { id: 'premiere', label: 'Premiere' },
];

const KeyboardShortcutsEditor: React.FC<{ onClose?: () => void; onChange?: (p: ShortcutPrefs) => void }> = ({ onClose, onChange }) => {
  const [prefs, setPrefs] = useState<ShortcutPrefs>(() => loadShortcutPrefs());
  const [capturing, setCapturing] = useState<string | null>(null);
  const conflicts = useMemo(() => findConflicts(prefs), [prefs]);

  const update = (p: ShortcutPrefs) => { setPrefs(p); saveShortcutPrefs(p); onChange?.(p); };
  const setPreset = (preset: PresetId) => update({ ...prefs, preset });
  const rebind = (id: string, combo: string) => update({ ...prefs, overrides: { ...prefs.overrides, [id]: combo } });
  const resetAction = (id: string) => { const o = { ...prefs.overrides }; delete o[id]; update({ ...prefs, overrides: o }); };
  const resetAll = () => update({ ...prefs, overrides: {} });

  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      const c = comboFromEvent(e);
      if (c) rebind(capturing, c);
      setCapturing(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const groups = useMemo(() => {
    const g: Record<string, typeof SHORTCUT_ACTIONS> = {};
    for (const a of SHORTCUT_ACTIONS) (g[a.category] ||= []).push(a);
    return g;
  }, []);

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };
  const card: React.CSSProperties = { width: 640, maxWidth: '94vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#13131c', border: '1px solid #2a2a38', borderRadius: 16, color: '#fff', overflow: 'hidden' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #23232f' }}>
          <Keyboard size={18} style={{ color: '#FF8C00' }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, flex: 1 }}>Keyboard Shortcuts</h2>
          <div style={{ display: 'flex', gap: 4, background: '#0c0c12', borderRadius: 8, padding: 3 }}>
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, background: prefs.preset === p.id ? '#FF8C00' : 'transparent', color: prefs.preset === p.id ? '#1a1a1a' : '#9a9aa6' }}>{p.label}</button>
            ))}
          </div>
          {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9a9aa6', cursor: 'pointer' }}><X size={18} /></button>}
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 16px 16px' }}>
          {Object.entries(groups).map(([cat, actions]) => (
            <div key={cat} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#FF8C00', fontWeight: 800, marginBottom: 6 }}>{cat.toUpperCase()}</div>
              {actions.map(a => {
                const combo = comboForAction(a.id, prefs);
                const isConflict = conflicts.has(combo);
                const overridden = prefs.overrides[a.id] !== undefined;
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #1c1c26' }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{a.label}</span>
                    {overridden && <button onClick={() => resetAction(a.id)} title="Reset to default" style={{ background: 'transparent', border: 'none', color: '#6b6b78', cursor: 'pointer' }}><RotateCcw size={12} /></button>}
                    {isConflict && <AlertTriangle size={13} style={{ color: '#e2a13b' }} />}
                    <button
                      onClick={() => setCapturing(a.id)}
                      style={{ minWidth: 96, padding: '6px 10px', borderRadius: 7, border: `1px solid ${capturing === a.id ? '#FF8C00' : isConflict ? '#e2a13b' : '#2a2a38'}`, background: capturing === a.id ? 'rgba(255,140,0,0.14)' : '#0c0c12', color: capturing === a.id ? '#FF8C00' : '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace,monospace', cursor: 'pointer' }}
                    >
                      {capturing === a.id ? 'Press a key…' : (comboLabel(combo) || '—')}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid #23232f' }}>
          <span style={{ fontSize: 11, color: '#9a9aa6', flex: 1 }}>{conflicts.size > 0 ? `${conflicts.size} conflict${conflicts.size > 1 ? 's' : ''} — last-bound wins` : 'Click a shortcut, then press your key combo. Esc cancels.'}</span>
          <button onClick={resetAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a38', background: 'transparent', color: '#9a9aa6', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><RotateCcw size={13} /> Reset all</button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsEditor;
