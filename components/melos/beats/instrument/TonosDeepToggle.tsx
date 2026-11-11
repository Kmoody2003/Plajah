// TONOS deep body switch + status: the instrument's dense upper body rendered on the GPU for every
// plucked/struck note (tonosDeep.ts), or the CPU body floors. Lives in the TONOS panel's header.

import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { setTonosDeepEnabled, tonosDeepAvailable, tonosDeepEnabled, tonosDeepStats } from '../../../../services/melos/instruments/tonos/deep/tonosDeep';

export const TonosDeepToggle: React.FC<{ bowed: boolean }> = ({ bowed }) => {
  const available = tonosDeepAvailable();
  const [on, setOn] = useState(() => tonosDeepEnabled());
  const [stats, setStats] = useState(() => tonosDeepStats());

  useEffect(() => {
    if (!on || !available) return;
    const t = setInterval(() => setStats(tonosDeepStats()), 1000);
    return () => clearInterval(t);
  }, [on, available]);

  const status = !available
    ? 'No WebGPU in this browser — the body plays on the CPU'
    : !on
      ? 'Off — the body plays on the CPU (its upper range as broad floors)'
      : bowed
        ? 'Bowed strings stay on the CPU: what the bow does next can’t be rendered ahead'
        : stats.coolingDown
          ? 'GPU busy or failed — CPU body for now, retrying soon'
          : stats.pending > 0
            ? `Rendering ${stats.pending} note bodies on ${stats.gpu || 'the GPU'}…`
            : stats.entries > 0
              ? `${stats.entries} note bodies ready (${stats.cacheMB.toFixed(0)} MB) on ${stats.gpu || 'the GPU'}`
              : 'On — the first pluck of each note renders its body; the next one plays it';
  const busy = on && available && !bowed && stats.pending > 0;
  const live = on && available && !bowed && !stats.coolingDown;

  return (
    <button
      onClick={() => { if (!available) return; const next = !on; setTonosDeepEnabled(next); setOn(next); setStats(tonosDeepStats()); }}
      disabled={!available}
      aria-pressed={live}
      className="h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      style={{
        background: live ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
        borderColor: live ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.12)',
        color: live ? '#A7F3D0' : 'rgba(255,255,255,0.55)',
      }}
      title={`Deep body: up to 2,048 real body modes (soundboard, cavity air, skin, gourd, tube) above the CPU's few, driven by the string's own bridge force on the GPU. ${status}`}
    >
      <Cpu size={11} className={busy ? 'animate-pulse' : undefined} />
      Deep body · {!available ? 'n/a' : !on ? 'off' : bowed ? 'CPU' : 'GPU'}
    </button>
  );
};
