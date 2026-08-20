// MIDI controllers panel — devices + Learn mapping.
//
// Two jobs: show what's plugged in (reusing midiStatus, so the premapped NI units announce
// themselves), and let ANY controller be mapped by Learn — arm a target, wiggle a knob or hit a
// pad, done. Bindings persist per browser (midiLearn.ts) and win over the premap, so a generic
// fader box drives transport, macros, and pads without the user editing a config file.

import React, { useEffect, useState } from 'react';
import { X, Radio, Trash2 } from 'lucide-react';
import { midiStatus, ensureMidi } from '../../../../services/melos/midiInput';
import { deviceLabel, deviceCapabilities } from '../../../../services/melos/midiMap';
import { beginLearn, cancelLearn, isLearning, getBindings, clearBinding, clearAllBindings, subscribeLearn, type LearnTarget } from '../../../../services/melos/midiLearn';

const CYAN = '#00DAF3';

export const MidiLearnPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [, force] = useState(0);
  useEffect(() => { ensureMidi(); const un = subscribeLearn(() => force((n) => n + 1)); const t = setInterval(() => force((n) => n + 1), 1500); return () => { un(); clearInterval(t); cancelLearn(); }; }, []);

  const midi = midiStatus();
  const learning = isLearning();
  const bindings = getBindings();
  const bindingFor = (t: LearnTarget) => bindings.find((b) => sameTarget(b.target, t));

  const LearnBtn: React.FC<{ target: LearnTarget }> = ({ target }) => {
    const active = learning && sameTarget(learning, target);
    const bound = bindingFor(target);
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => (active ? cancelLearn() : beginLearn(target))}
          className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border flex items-center gap-1.5 transition-colors"
          style={active
            ? { borderColor: '#FF8C00', color: '#FF8C00', background: 'rgba(255,140,0,0.12)' }
            : bound ? { borderColor: `${CYAN}66`, color: CYAN } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}
        >
          <Radio size={11} className={active ? 'animate-pulse' : ''} />
          {active ? 'move a control…' : 'Learn'}
        </button>
        {bound && !active && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-white/45">
            {bound.signature}
            <button onClick={() => clearBinding(bound.signature)} className="text-white/25 hover:text-[#EF4444]" aria-label="Clear binding"><Trash2 size={10} /></button>
          </span>
        )}
      </div>
    );
  };

  const Row: React.FC<{ label: string; target: LearnTarget }> = ({ label, target }) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11.5px] text-white/75">{label}</span>
      <LearnBtn target={target} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[86vh] overflow-auto rounded-[20px] border border-white/15 bg-[#0B0710] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#0B0710]">
          <div className="flex items-center gap-2">
            <SlidersIcon />
            <h2 className="text-[13px] font-bold text-white tracking-wide">MIDI Controllers</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* devices */}
          <section>
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Connected</p>
            {!midi.supported && <p className="text-[11px] text-[#F59E0B]">This browser doesn't expose WebMIDI. Use Chrome or Edge on desktop.</p>}
            {midi.supported && midi.connected.length === 0 && <p className="text-[11px] text-white/40">No devices detected. Plug in a controller — it appears here automatically.</p>}
            <div className="space-y-1.5">
              {midi.connected.map((d, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#06D6A0', boxShadow: '0 0 5px #06D6A0' }} />
                    <span className="text-[12px] font-semibold" style={{ color: d.type === 'generic' ? '#fff' : '#06D6A0' }}>{deviceLabel(d.type)}</span>
                  </div>
                  <p className="text-[10px] text-white/35 leading-snug mt-0.5">{deviceCapabilities(d.type)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* learn */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Learn — map any control</p>
              {bindings.length > 0 && <button onClick={clearAllBindings} className="text-[10px] text-white/35 hover:text-[#EF4444]">Clear all</button>}
            </div>
            <p className="text-[10px] text-white/35 leading-snug mb-2.5">
              Hit <b className="text-white/60">Learn</b> on a target, then move the knob or pad you want it on. Learned mappings override the premapped defaults and are saved to this browser.
            </p>

            <div className="rounded-xl border border-white/10 divide-y divide-white/[0.06] px-3">
              <div className="py-2">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#00DAF3]/70 font-semibold mb-1">Transport</p>
                <Row label="Play" target={{ kind: 'transport', action: 'play' }} />
                <Row label="Stop" target={{ kind: 'transport', action: 'stop' }} />
                <Row label="Record" target={{ kind: 'transport', action: 'record' }} />
              </div>
              <div className="py-2">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#D0BCFF]/70 font-semibold mb-1">Macros (turn the armed instrument / selected pad)</p>
                {Array.from({ length: 8 }, (_, i) => <Row key={i} label={`Macro ${i + 1}`} target={{ kind: 'macro', index: i }} />)}
              </div>
              <div className="py-2">
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/40 font-semibold mb-1">Pads</p>
                <div className="grid grid-cols-2 gap-x-4">
                  {Array.from({ length: 16 }, (_, i) => <Row key={i} label={`Pad ${i + 1}`} target={{ kind: 'pad', pad: i }} />)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

function sameTarget(a: LearnTarget, b: LearnTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'transport' && b.kind === 'transport') return a.action === b.action;
  if (a.kind === 'pad' && b.kind === 'pad') return a.pad === b.pad;
  if (a.kind === 'macro' && b.kind === 'macro') return a.index === b.index;
  if (a.kind === 'note' && b.kind === 'note') return a.note === b.note;
  return false;
}

const SlidersIcon = () => (
  <span className="grid place-items-center w-6 h-6 rounded-lg" style={{ background: 'rgba(0,218,243,0.14)', color: CYAN }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
  </span>
);
