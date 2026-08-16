// Engine telemetry panel — latency, jitter, voices. The "sonic quality" contract made visible:
// if a change regresses tick jitter or latency, this readout is where it shows first.

import React from 'react';
import type { EngineSnapshot } from '../useEngineBridge';
import { midiStatus } from '../../../../services/melos/midiInput';
import { deviceLabel, deviceCapabilities } from '../../../../services/melos/midiMap';

interface DiagnosticsProps {
  snap: EngineSnapshot;
  hidStatus?: string | null;
  onConnectHid?: () => void;
}

export const DiagnosticsReadout: React.FC<DiagnosticsProps> = ({ snap, hidStatus, onConnectHid }) => {
  const d = snap.diag;
  const midi = midiStatus();
  if (!d) return null;
  const row = (label: string, value: string, warn = false) => (
    <div className="flex justify-between gap-6">
      <span className="text-white/40">{label}</span>
      <span className={`font-mono ${warn ? 'text-[#F59E0B]' : 'text-white/80'}`}>{value}</span>
    </div>
  );
  return (
    <div className="absolute bottom-4 right-4 z-20 w-60 rounded-2xl border border-white/15 bg-[#0A0A0D]/95 backdrop-blur-xl p-4 text-[11px] space-y-1.5 shadow-2xl">
      <p className="text-[9px] uppercase tracking-[0.18em] text-[#00DAF3] font-semibold mb-2">Engine</p>
      {row('State', d.state, d.state !== 'running')}
      {row('Sample rate', d.sampleRate ? `${(d.sampleRate / 1000).toFixed(1)} kHz` : '—')}
      {row('Base latency', `${d.baseLatencyMs.toFixed(2)} ms`, d.baseLatencyMs > 15)}
      {row('Output latency', `${d.outputLatencyMs.toFixed(2)} ms`)}
      {row('Round trip', `${(d.baseLatencyMs + d.outputLatencyMs).toFixed(1)} ms`)}
      {row('Tick jitter', `${d.tickJitterMs.toFixed(2)} ms`, d.tickJitterMs > 40)}
      {row('Lookahead', `${d.lookaheadMs.toFixed(0)} ms`)}
      {row('Active voices', String(d.activeVoices))}
      {row('Limiter GR', `${snap.limiterReduction.toFixed(1)} dB`)}

      <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Hardware</p>
        {midi.connected.length === 0 && row('MIDI', midi.supported ? 'none connected' : 'unsupported')}
        {midi.connected.map((d, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between gap-6">
              <span className="text-white/40">MIDI</span>
              <span className="font-mono" style={{ color: d.type === 'generic' ? 'rgba(255,255,255,0.8)' : '#06D6A0' }}>
                {deviceLabel(d.type)}
              </span>
            </div>
            <p className="text-[9px] text-white/25 leading-snug">{deviceCapabilities(d.type)}</p>
          </div>
        ))}
        {onConnectHid && (
          <>
            <button
              onClick={onConnectHid}
              className="w-full h-7 rounded-lg border border-[#FF8C00]/40 text-[10px] text-[#FF8C00] hover:bg-[#FF8C00]/10"
            >Connect Maschine LEDs (Labs)</button>
            {hidStatus && <p className="text-[9px] text-white/35 leading-snug">{hidStatus}</p>}
            <p className="text-[9px] text-white/20 leading-snug">
              Experimental WebHID. MIDI mode works without it.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
