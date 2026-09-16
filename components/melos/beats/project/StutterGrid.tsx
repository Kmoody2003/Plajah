// StutterGrid — the editor face of the Stutter FX: a 16-step grid that writes the `pattern` bitmask
// (each lit cell re-triggers the captured slice on that step), plus the On / Rate / Gate knobs.
import React from 'react';
import { Knob } from '../shared/Knob';
import type { FxParamSpec } from '../../../../services/melos/beats/fx/devices';

export function StutterGrid({ params, paramSpecs, color, onChange }: {
  params: Record<string, number>;
  paramSpecs: FxParamSpec[];
  color: string;
  onChange: (patch: Record<string, number>) => void;
}) {
  const pattern = (params.pattern ?? 0) >>> 0;
  const knobs = paramSpecs.filter((s) => s.key !== 'pattern');
  return (
    <div className="mt-2.5">
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
        {Array.from({ length: 16 }, (_, i) => {
          const on = (pattern >> i) & 1;
          const beat = i % 4 === 0; // downbeat columns a touch brighter for orientation
          return (
            <button
              key={i}
              onClick={() => onChange({ pattern: pattern ^ (1 << i) })}
              title={`Step ${i + 1}`}
              className="h-8 rounded-md border transition-colors"
              style={on
                ? { background: color, borderColor: color, boxShadow: `0 0 8px ${color}66` }
                : { background: beat ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.10)' }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => onChange({ pattern: 0 })} className="h-6 px-2 rounded-md text-[9px] font-mono border border-white/12 text-white/45 hover:text-white">Clear</button>
        <button onClick={() => onChange({ pattern: 0xFFFF })} className="h-6 px-2 rounded-md text-[9px] font-mono border border-white/12 text-white/45 hover:text-white">Fill</button>
        <button onClick={() => onChange({ pattern: 0x1111 })} className="h-6 px-2 rounded-md text-[9px] font-mono border border-white/12 text-white/45 hover:text-white">4-on-floor</button>
        <button onClick={() => onChange({ pattern: 0xAAAA })} className="h-6 px-2 rounded-md text-[9px] font-mono border border-white/12 text-white/45 hover:text-white">Offbeats</button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-3 mt-2.5">
        {knobs.map((sp) => (
          <Knob
            key={sp.key}
            label={sp.label}
            value={params[sp.key] ?? sp.default}
            min={sp.min}
            max={sp.max}
            defaultValue={sp.default}
            color={color}
            size={34}
            format={(v) => (sp.format ? sp.format(v) : `${v.toFixed(sp.step === 1 ? 0 : 1)}${sp.unit ? ` ${sp.unit}` : ''}`)}
            onChange={(v) => onChange({ [sp.key]: sp.step === 1 ? Math.round(v) : v })}
          />
        ))}
      </div>
    </div>
  );
}
