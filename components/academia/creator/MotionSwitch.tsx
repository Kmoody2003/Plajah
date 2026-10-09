/**
 * MotionSwitch — Auto / On / Off for the animated chalk art and card motion.
 * "Auto" follows the device's reduce-motion setting; choosing On overrides it for this app only.
 */
import React from 'react';
import { MOTION_PREFS, type MotionPref } from '../../../services/motionPref';
import { useMotion } from './useMotion';

const LABEL: Record<MotionPref, string> = { auto: 'Auto', on: 'On', off: 'Off' };

export default function MotionSwitch({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { pref, set, deviceReduced } = useMotion();
  const hint = pref === 'auto'
    ? (deviceReduced ? 'Auto: your device has animations turned off, so this app is still.' : 'Auto: following your device, so things move.')
    : pref === 'on' ? 'Always animated in this app, even if your device asks for less motion.' : 'Nothing animates.';
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Motion" className="inline-flex items-center rounded-full border border-white/15 bg-black/30 p-0.5 backdrop-blur">
        {!compact && <span className="px-3 text-[10px] font-black uppercase tracking-widest text-white/50" aria-hidden="true">Motion</span>}
        {MOTION_PREFS.map(p => (
          <button key={p} type="button" role="radio" aria-checked={pref === p} onClick={() => set(p)} title={hint}
            className={`min-h-[36px] min-w-[44px] px-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors ${pref === p ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>
            {LABEL[p]}
          </button>
        ))}
      </div>
      {!compact && <p className="mt-1.5 text-[11px] text-white/45 max-w-xs" role="status">{hint}</p>}
    </div>
  );
}
