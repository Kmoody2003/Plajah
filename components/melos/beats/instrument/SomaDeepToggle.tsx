// SOMA deep skin switch + status: GPU-rendered upper membrane on every strike (somaDeep.ts),
// or the CPU noise cloud. Lives in the SOMA panel's header.

import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { setSomaDeepEnabled, somaDeepAvailable, somaDeepEnabled, somaDeepStats } from '../../../../services/melos/instruments/soma/deep/somaDeep';

export const SomaDeepToggle: React.FC = () => {
  const available = somaDeepAvailable();
  const [on, setOn] = useState(() => somaDeepEnabled());
  const [stats, setStats] = useState(() => somaDeepStats());

  useEffect(() => {
    if (!on || !available) return;
    const t = setInterval(() => setStats(somaDeepStats()), 1000);
    return () => clearInterval(t);
  }, [on, available]);

  const status = !available
    ? 'No WebGPU in this browser — strikes use the CPU cloud'
    : !on
      ? 'Off — strikes use the CPU noise cloud'
      : stats.coolingDown
        ? 'GPU busy or failed — using the CPU cloud for now, retrying soon'
        : stats.pending > 0
          ? `Rendering ${stats.pending} strike layers on ${stats.gpu || 'the GPU'}…`
          : stats.entries > 0
            ? `${stats.entries} strike layers ready (${stats.cacheMB.toFixed(0)} MB) on ${stats.gpu || 'the GPU'}`
            : 'On — the first hit of each note renders its layer; the next is deep';
  const busy = on && available && stats.pending > 0;
  const live = on && available && !stats.coolingDown;

  return (
    <button
      onClick={() => { if (!available) return; const next = !on; setSomaDeepEnabled(next); setOn(next); setStats(somaDeepStats()); }}
      disabled={!available}
      aria-pressed={live}
      className="h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border transition disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: live ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
        borderColor: live ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.12)',
        color: live ? '#A7F3D0' : 'rgba(255,255,255,0.55)',
      }}
      title={`Deep skin: every (m, n) membrane mode above SOMA's 16, rendered on the GPU per strike. ${status}`}
    >
      <Cpu size={11} className={busy ? 'animate-pulse' : undefined} />
      Deep skin · {!available ? 'n/a' : on ? 'GPU' : 'off'}
    </button>
  );
};
