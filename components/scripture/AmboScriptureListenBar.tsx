// AmboScriptureListenBar — live audio → scripture, from inside the Scripture tab.
//
// The same auto-scripture engine as the audio bar's "Auto scripture" control
// (one store, so both show the same state), placed where the operator is
// already working. Pick what to listen to — the live mic is always offered
// first — and, when the source is a mixer/USB input, the operator's own mic
// stays live beside it so they can just say "second Peter three nine".

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff, Radio, AlertTriangle, Sparkles, KeyRound } from 'lucide-react';
import {
  getAutoScripturePrefs, getAutoScriptureState, subscribeAutoScripture, setAutoScripturePrefs,
  startAutoScripture, stopAutoScripture,
} from '../../services/ambo/autoScripture';
import { listAudioInputs, unlockAudioInputLabels, inputLabelsHidden } from '../../services/ambo/liveTranscriber';

const GOLD = '#E3C57E';
const GREEN = '#2BE0A8';

/** Live mic first, always; then every audio input. Value '' = the live mic. */
export const AutoScriptureSourcePicker: React.FC<{ className?: string }> = ({ className = '' }) => {
  const prefs = useSyncExternalStore(subscribeAutoScripture, getAutoScripturePrefs);
  const state = useSyncExternalStore(subscribeAutoScripture, getAutoScriptureState);
  const [inputs, setInputs] = useState<Array<{ deviceId: string; label: string }>>([]);

  useEffect(() => {
    let dead = false;
    const load = () => void listAudioInputs().then(l => { if (!dead) setInputs(l); });
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => { dead = true; navigator.mediaDevices?.removeEventListener?.('devicechange', load); };
  }, [state.running]);

  const value = prefs.source === 'device' && prefs.deviceId ? prefs.deviceId : '';
  // The browser's "default"/"communications" aliases duplicate the live mic.
  const devices = inputs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications');
  const hidden = devices.length === 0 || inputLabelsHidden(devices);

  const choose = (id: string) => {
    const wasOn = state.running;
    setAutoScripturePrefs(id ? { source: 'device', deviceId: id } : { source: 'mic', deviceId: '' });
    // Switching source while listening restarts on the new one.
    if (wasOn) { stopAutoScripture(); void startAutoScripture(); }
  };

  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      <select value={value} onChange={e => choose(e.target.value)}
        title="What Ambo listens to for scripture"
        className="min-w-0 max-w-[220px] h-7 rounded-md bg-black/50 border border-white/15 text-[10.5px] text-white px-1.5 focus:outline-hidden focus:border-[#E3C57E]">
        <option value="" className="bg-[#14101e]">🎙 Live mic (default)</option>
        {devices.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-[#14101e]">{d.label}</option>)}
        {value && !devices.some(d => d.deviceId === value) && <option value={value} className="bg-[#14101e]">Saved input (not connected)</option>}
      </select>
      {hidden && (
        <button onClick={() => void unlockAudioInputLabels().then(setInputs)}
          title="The browser hides input names until the mic has been allowed once"
          className="h-7 px-2 rounded-md text-[10px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 inline-flex items-center gap-1 flex-none">
          <KeyRound size={11} /> Show inputs
        </button>
      )}
    </div>
  );
};

const Meter: React.FC<{ level: number; color: string }> = ({ level, color }) => (
  <span className="h-1.5 w-12 rounded-full bg-white/10 overflow-hidden flex-none">
    <span className="block h-full transition-all" style={{ width: `${Math.round(level * 100)}%`, background: color }} />
  </span>
);

const AmboScriptureListenBar: React.FC = () => {
  const prefs = useSyncExternalStore(subscribeAutoScripture, getAutoScripturePrefs);
  const state = useSyncExternalStore(subscribeAutoScripture, getAutoScriptureState);
  const on = state.running;
  const deviceSource = prefs.source === 'device' && !!prefs.deviceId;

  const toggleOperator = () => {
    const wasOn = state.running;
    setAutoScripturePrefs({ operatorMic: !prefs.operatorMic });
    if (wasOn) { stopAutoScripture(); void startAutoScripture(); }
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-1.5 border-b flex-none" style={{ borderColor: 'rgba(255,255,255,0.09)', background: on ? 'rgba(43,224,168,0.05)' : 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => (on ? stopAutoScripture() : void startAutoScripture())} disabled={state.starting}
          title={on ? 'Stop listening' : 'Listen for scripture and bring it up as it is said'}
          className={`h-7 px-2.5 rounded-md text-[10.5px] font-black inline-flex items-center gap-1.5 disabled:opacity-50 flex-none ${on ? 'text-black' : 'text-[#1a1405]'}`}
          style={{ background: on ? GREEN : GOLD }}>
          {on ? <Radio size={12} className="animate-pulse" /> : <Mic size={12} />}
          {state.starting ? 'Starting…' : on ? 'Listening' : 'Listen'}
        </button>

        <AutoScriptureSourcePicker />

        {deviceSource && (
          <button onClick={toggleOperator}
            title="Keep your own mic live beside the input — say a reference and it comes up, no “turn to…” needed"
            className={`h-7 px-2 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 flex-none ${prefs.operatorMic ? 'text-[#E3C57E] bg-[#E3C57E]/12 border-[#E3C57E]/40' : 'text-white/50 border-white/15'}`}>
            {prefs.operatorMic ? <Mic size={11} /> : <MicOff size={11} />} Operator mic
          </button>
        )}

        <div className="inline-flex rounded-md border border-white/15 p-0.5 flex-none" title="Where a heard verse goes">
          {([['cue', 'Cue to Preview'], ['auto', 'Straight to Program']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setAutoScripturePrefs({ delivery: v })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${prefs.delivery === v ? (v === 'auto' ? 'bg-[#FF8C00] text-black' : 'bg-[#E3C57E] text-[#1a1405]') : 'text-white/60 hover:text-white'}`}>{l}</button>
          ))}
        </div>

        {on && (
          <span className="inline-flex items-center gap-1.5 text-[9.5px] text-white/50 flex-none">
            {deviceSource ? 'Input' : 'Mic'} <Meter level={state.level} color={GREEN} />
            {deviceSource && prefs.operatorMic && <>Operator <Meter level={state.operator.level} color={GOLD} /></>}
          </span>
        )}
      </div>

      {(on || state.error || state.history.length > 0) && (
        <div className="flex items-center gap-2 text-[10.5px] min-w-0">
          {state.error ? (
            <span className="text-[#F5C542] truncate"><AlertTriangle size={10} className="inline mr-1" />{state.error}</span>
          ) : state.hearing ? (
            <span className="font-bold text-[#E3C57E] truncate"><Sparkles size={10} className="inline mr-1" />Heard “{state.hearing.label}” — confirming…</span>
          ) : on ? (
            <span className="text-white/55 truncate">
              {state.heard || state.operator.heard
                ? <>“{(state.operator.heard && !state.heard ? state.operator.heard : state.heard)}”</>
                : <span className="text-white/35">{deviceSource && prefs.operatorMic ? 'Listening to the input and your mic…' : 'Listening… say “John three sixteen” or “turn to Psalm 23”.'}</span>}
            </span>
          ) : null}
          {state.operator.error && <span className="text-[#F5C542] truncate">Operator mic: {state.operator.error}</span>}
          <span className="flex-1" />
          {state.history.slice(0, 4).map((h, i) => (
            <span key={i} className={`px-1.5 py-0.5 rounded text-[9.5px] border flex-none ${h.ok ? 'text-white/75 border-white/15' : 'text-[#F5C542] border-[#F5C542]/30'}`}>
              {h.label}{h.ok ? (h.delivered === 'auto' ? ' · live' : ' · cued') : ' · not found'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default AmboScriptureListenBar;
