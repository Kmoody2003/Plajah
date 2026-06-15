// components/SceneRail.tsx — frosted-glass scene picker. Lists every scene
// (studio + classic) and sets config.mode on click. Matches the studio UI.

import React from 'react';
import { motion } from 'motion/react';
import { VisualizationConfig, VisualizerMode } from '../types';
import { SCENE_CATALOG } from '../engine/sceneCatalog';

interface Props {
  config: VisualizationConfig;
  onPick: (mode: VisualizerMode) => void;
  visible: boolean;
  /** Embedded horizontal row (top of the deck) instead of the floating rail. */
  embedded?: boolean;
}

const SceneRail: React.FC<Props> = ({ config, onPick, visible, embedded }) => {
  if (!visible) return null;

  if (embedded) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0 border-b border-white/[0.06]">
        <span className="text-[8px] font-black uppercase tracking-[0.22em] text-white/30 shrink-0 pr-1">Scenes</span>
        {SCENE_CATALOG.map((s) => {
          const active = config.mode === s.mode;
          return (
            <button key={s.mode} onClick={() => onPick(s.mode)} title={s.cat}
              className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
              style={{
                border: active ? '1px solid #b56cff' : '1px solid rgba(255,255,255,0.10)',
                background: active ? 'linear-gradient(160deg, rgba(181,108,255,0.28), rgba(255,93,177,0.18))' : '#0d0d16',
                color: active ? '#fff' : 'rgba(244,242,255,0.6)',
                boxShadow: active ? '0 0 0 1px #b56cff' : 'none',
              }}>
              {s.name}{s.kind === 'gl' && <span className="ml-1 text-[7px] text-cyan-300">GL</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }}
      style={{
        position: 'absolute', top: 84, left: 18, bottom: 150, zIndex: 25, width: 168,
        overflowY: 'auto', background: 'rgba(18,18,26,0.45)', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20, backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)',
        padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }}
      className="scene-rail"
    >
      <div style={{ fontSize: 9.5, letterSpacing: '0.22em', color: 'rgba(244,242,255,0.32)', textTransform: 'uppercase', padding: '2px 4px 4px' }}>Scenes</div>
      {SCENE_CATALOG.map((s) => {
        const active = config.mode === s.mode;
        return (
          <div key={s.mode} onClick={() => onPick(s.mode)}
            style={{
              position: 'relative', borderRadius: 13, cursor: 'pointer', padding: '9px 10px',
              border: active ? '1px solid #b56cff' : '1px solid rgba(255,255,255,0.10)',
              background: active ? 'linear-gradient(160deg, rgba(181,108,255,0.28), rgba(255,93,177,0.18))' : '#0d0d16',
              boxShadow: active ? '0 0 0 1px #b56cff, 0 12px 30px rgba(150,80,255,0.35)' : 'none',
              transition: 'all .18s ease', flex: 'none',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#f4f2ff' }}>{s.name}</div>
            <div style={{ fontSize: 8, letterSpacing: '0.12em', color: 'rgba(244,242,255,0.4)', textTransform: 'uppercase', fontWeight: 500, marginTop: 1 }}>{s.cat}</div>
            {s.kind === 'gl' && (
              <span style={{ position: 'absolute', top: 7, right: 7, fontSize: 7, letterSpacing: '0.1em', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 5, padding: '1px 4px', color: '#9be7ff' }}>GLSL</span>
            )}
          </div>
        );
      })}
    </motion.div>
  );
};

export default SceneRail;
