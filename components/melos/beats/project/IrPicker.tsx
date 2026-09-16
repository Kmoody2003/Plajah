// IrPicker — the reverb Source selector: modelled spaces vs a real recorded IR from the library.
// Rendered for the Spaces and Cosmos devices in place of the raw irMode/irIndex knobs; when Library is
// chosen it shows a category-grouped dropdown of the bundled impulse responses.
import React from 'react';
import { IR_LIBRARY } from '../../../../services/melos/beats/fx/irLibrary';

interface IrPickerProps {
  params: Record<string, number>;
  color: string;
  onChange: (patch: Record<string, number>) => void;
}

export const IrPicker: React.FC<IrPickerProps> = ({ params, color, onChange }) => {
  const library = (params.irMode ?? 0) > 0.5 ? 1 : 0;
  const idx = Math.max(0, Math.min(IR_LIBRARY.length - 1, Math.round(params.irIndex ?? 0)));

  const groups: Record<string, { i: number; name: string }[]> = {};
  IR_LIBRARY.forEach((d, i) => { (groups[d.category] ||= []).push({ i, name: d.name }); });

  return (
    <div className="mt-2.5 mb-1">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30 mr-0.5">Source</span>
        {(['Modelled', 'Library IR'] as const).map((label, m) => {
          const active = library === m;
          return (
            <button
              key={label}
              onClick={() => onChange({ irMode: m })}
              className="h-6 px-2.5 rounded-lg text-[10px] font-semibold border transition-colors"
              style={{
                borderColor: active ? `${color}99` : 'rgba(255,255,255,0.12)',
                background: active ? `${color}22` : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
            >{label}</button>
          );
        })}
      </div>
      {library === 1 && (
        <select
          aria-label="Impulse response"
          value={idx}
          onChange={(e) => onChange({ irIndex: Number(e.target.value) })}
          className="w-full h-7 rounded-md border border-white/12 bg-black/30 px-2 text-[11px] text-white/80"
          title="Choose a recorded impulse response"
        >
          {Object.entries(groups).map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((it) => <option key={it.i} value={it.i}>{it.name}</option>)}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
};
